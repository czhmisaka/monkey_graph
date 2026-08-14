import Redis from 'ioredis';
import { logger } from './logger.js';

// 本地存储 AbortController（无法序列化到 Redis）
const localAbortControllers = new Map();

let redisClient = null;
let useRedis = false;

// 初始化 Redis 连接
function initRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.info('【ConversationStore】', '[ConversationStore] REDIS_URL not configured, using in-memory store');
    return false;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logger.error('【ConversationStore】', '[ConversationStore] Redis error:', err.message);
      useRedis = false;
    });

    redisClient.on('connect', () => {
      logger.info('【ConversationStore】', '[ConversationStore] Connected to Redis');
      useRedis = true;
    });

    // 尝试连接
    redisClient.connect().catch((err) => {
      logger.error('【ConversationStore】', '[ConversationStore] Redis connection failed:', err.message);
    });

    return true;
  } catch (error) {
    logger.error('【ConversationStore】', '[ConversationStore] Failed to initialize Redis:', error.message);
    return false;
  }
}

initRedis();

/**
 * 生成对话存储 key
 * @param {string} graphId - 图谱ID
 * @param {string} userId - 用户ID
 * @returns {string} 存储 key
 */
function getConversationKey(graphId, userId) {
  return `conversation:${graphId}:${userId}`;
}

/**
 * 注册一个活跃对话
 * @param {string} graphId - 图谱ID
 * @param {string} userId - 用户ID
 * @param {AbortController} abortController - AbortController 实例
 */
export async function registerConversation(graphId, userId, abortController) {
  const key = getConversationKey(graphId, userId);

  // 本地存储 AbortController
  localAbortControllers.set(key, abortController);

  if (useRedis && redisClient) {
    try {
      // 使用 Hash 存储，支持设置多个字段和过期时间
      await redisClient.hset(key, 'status', 'active', 'createdAt', Date.now().toString());
      // 设置过期时间 1 小时，防止僵尸对话
      await redisClient.expire(key, 3600);
    } catch (error) {
      logger.error('【ConversationStore】', '[ConversationStore] Redis register error:', error.message);
    }
  }
}

/**
 * 取消指定图谱的对话
 * @param {string} graphId - 图谱ID
 * @param {string} userId - 用户ID
 * @returns {boolean} 是否成功取消
 */
export function cancelConversation(graphId, userId) {
  const key = getConversationKey(graphId, userId);

  // 先尝试本地中止
  const abortController = localAbortControllers.get(key);
  if (abortController && !abortController.signal.aborted) {
    abortController.abort();

    // 标记 Redis 状态
    if (useRedis && redisClient) {
      redisClient.hset(key, 'status', 'cancelled').catch((err) => {
        logger.error('【ConversationStore】', '[ConversationStore] Redis cancel mark error:', err.message);
      });
    }

    return true;
  }

  return false;
}

/**
 * 清除指定图谱的对话记录
 * @param {string} graphId - 图谱ID
 * @param {string} userId - 用户ID
 */
export async function clearConversation(graphId, userId) {
  const key = getConversationKey(graphId, userId);

  // 清除本地
  localAbortControllers.delete(key);

  if (useRedis && redisClient) {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error('【ConversationStore】', '[ConversationStore] Redis clear error:', error.message);
    }
  }
}

/**
 * 检查对话是否已取消（用于轮询检查其他实例的取消状态）
 * @param {string} graphId - 图谱ID
 * @param {string} userId - 用户ID
 * @returns {Promise<boolean>} 是否已取消
 */
export async function isConversationCancelled(graphId, userId) {
  const key = getConversationKey(graphId, userId);

  if (useRedis && redisClient) {
    try {
      const status = await redisClient.hget(key, 'status');
      return status === 'cancelled';
    } catch (error) {
      logger.error('【ConversationStore】', '[ConversationStore] Redis check error:', error.message);
    }
  }

  // 内存方案
  const abortController = localAbortControllers.get(key);
  return abortController ? abortController.signal.aborted : false;
}
