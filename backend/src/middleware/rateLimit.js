/**
 * 速率限制中间件
 * 用于防止暴力破解和 API 滥用
 */

import { globalCache } from '../utils/simpleCache.js';

// 限制配置
const DEFAULT_LIMITS = {
  // 默认限制：100 请求 / 分钟
  windowMs: 60 * 1000,
  max: 100
};

// 敏感操作限制（更严格的限制）
const SENSITIVE_LIMITS = {
  // 敏感操作：10 请求 / 分钟
  windowMs: 60 * 1000,
  max: 10
};

// IP 黑名单（内存存储，生产环境应使用 Redis）
const blacklistedIPs = new Set();

/**
 * 获取客户端 IP
 * 仅当配置 TRUST_PROXY=true（部署在可信反向代理之后）时才信任 X-Forwarded-For；
 * 否则直接使用连接地址，防止攻击者伪造 XFF 头绕过限流/黑名单。
 */
function getClientIP(req) {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip;
  }
  return req.connection?.remoteAddress || req.ip || 'unknown';
}

/**
 * 创建速率限制中间件
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.max - 最大请求数
 * @param {string} options.keyPrefix - 缓存键前缀
 * @param {Function} options.keyFn - 自定义 key 函数 (req) => string;缺省用 IP
 * @param {boolean} options.skipSuccessfulRequests - 是否跳过成功请求
 */
export function createRateLimiter(options = {}) {
  const config = {
    windowMs: options.windowMs || DEFAULT_LIMITS.windowMs,
    max: options.max || DEFAULT_LIMITS.max,
    keyPrefix: options.keyPrefix || 'rl',
    keyFn: options.keyFn || getClientIP,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false
  };

  return (req, res, next) => {
    let key;
    try {
      key = `rate:${config.keyPrefix}:${config.keyFn(req)}`;
    } catch (e) {
      // keyFn 抛错(如未登录用户调用 user-id 维度) — fallback 到 IP
      key = `rate:${config.keyPrefix}:ip:${getClientIP(req)}`;
    }

    // 同步原子递增(单进程 JS 不会被打断,无竞态)
    const { count, resetTime } = globalCache.incr(key, config.windowMs);

    // 设置响应头
    res.set({
      'X-RateLimit-Limit': config.max,
      'X-RateLimit-Remaining': Math.max(0, config.max - count),
      'X-RateLimit-Reset': Math.ceil(resetTime / 1000)
    });

    if (count > config.max) {
      console.warn(`[RateLimit] ${key} 请求超限 (${count}/${config.max})`);

      // IP 维度才加入黑名单;user 维度不加入
      if (count > config.max * 3 && config.keyFn === getClientIP) {
        const ip = getClientIP(req);
        blacklistedIPs.add(ip);
        console.error(`[RateLimit] IP ${ip} 已加入黑名单`);
        setTimeout(() => {
          blacklistedIPs.delete(ip);
          console.log(`[RateLimit] IP ${ip} 已从黑名单移除`);
        }, 30 * 60 * 1000);
      }

      return res.status(429).json({
        error: '请求过于频繁',
        message: `请在 ${Math.ceil((resetTime - Date.now()) / 1000)} 秒后重试`,
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * 通用速率限制中间件
 */
export const rateLimiter = createRateLimiter(DEFAULT_LIMITS);

/**
 * 登录速率限制（更严格）
 */
export const loginRateLimiter = createRateLimiter({
  ...SENSITIVE_LIMITS,
  keyPrefix: 'login'
});

/**
 * 注册速率限制（更严格）
 */
export const registerRateLimiter = createRateLimiter({
  ...SENSITIVE_LIMITS,
  keyPrefix: 'register'
});

/**
 * API 速率限制（宽松一些）
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 200,
  keyPrefix: 'api'
});

/**
 * 上传速率限制（按用户 20/min）
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'upload',
  keyFn: (req) => req.user?.id || getClientIP(req)
});

/**
 * 对话速率限制（按用户 10/min，防止 LLM 滥用）
 */
export const chatRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'chat',
  keyFn: (req) => req.user?.id || getClientIP(req)
});

/**
 * Agent API Key 速率限制（按 API Key 100/min）
 * 注意: Agent 认证使用 "Authorization: Agent <api_key>" 头，而非 x-api-key
 */
export const agentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: 'agent',
  keyFn: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Agent ')) {
      return authHeader.substring(6).trim();
    }
    return req.headers['x-api-key'] || getClientIP(req);
  }
});

/**
 * 获取黑名单状态（管理接口）
 */
export function getBlacklistStatus() {
  return {
    count: blacklistedIPs.size,
    ips: Array.from(blacklistedIPs)
  };
}

/**
 * 从黑名单移除 IP（管理接口）
 */
export function removeFromBlacklist(ip) {
  return blacklistedIPs.delete(ip);
}

export default {
  createRateLimiter,
  rateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  getBlacklistStatus,
  removeFromBlacklist
};