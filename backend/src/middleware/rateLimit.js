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
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
}

/**
 * 创建速率限制中间件
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.max - 最大请求数
 * @param {string} options.keyPrefix - 缓存键前缀
 * @param {boolean} options.skipSuccessfulRequests - 是否跳过成功请求
 */
export function createRateLimiter(options = {}) {
  const config = {
    windowMs: options.windowMs || DEFAULT_LIMITS.windowMs,
    max: options.max || DEFAULT_LIMITS.max,
    keyPrefix: options.keyPrefix || 'rl',
    skipSuccessfulRequests: options.skipSuccessfulRequests || false
  };

  return async (req, res, next) => {
    const ip = getClientIP(req);
    
    // 检查黑名单
    if (blacklistedIPs.has(ip)) {
      return res.status(429).json({
        error: '请求被拒绝',
        message: '您的 IP 已被限制，请稍后再试'
      });
    }

    const key = `rate:${config.keyPrefix}:${ip}`;
    
    try {
      // 使用原子操作获取并更新计数，避免竞态条件
      const now = Date.now();
      let record = globalCache.get(key);
      
      // 检查是否需要重置或初始化
      if (!record || now > record.resetTime) {
        record = {
          count: 0,
          resetTime: now + config.windowMs
        };
      }

      // 原子递增
      record.count++;
      globalCache.set(key, record, config.windowMs);

      // 设置响应头
      res.set({
        'X-RateLimit-Limit': config.max,
        'X-RateLimit-Remaining': Math.max(0, config.max - record.count),
        'X-RateLimit-Reset': Math.ceil(record.resetTime / 1000)
      });

      // 检查是否超限
      if (record.count > config.max) {
        console.warn(`[RateLimit] IP ${ip} 请求超限 (${record.count}/${config.max})`);
        
        // 如果超限严重（超过 3 倍），加入黑名单
        if (record.count > config.max * 3) {
          blacklistedIPs.add(ip);
          console.error(`[RateLimit] IP ${ip} 已加入黑名单`);
          
          // 30 分钟后移除黑名单
          setTimeout(() => {
            blacklistedIPs.delete(ip);
            console.log(`[RateLimit] IP ${ip} 已从黑名单移除`);
          }, 30 * 60 * 1000);
        }

        return res.status(429).json({
          error: '请求过于频繁',
          message: `请在 ${Math.ceil((record.resetTime - Date.now()) / 1000)} 秒后重试`,
          retryAfter: Math.ceil((record.resetTime - Date.now()) / 1000)
        });
      }

      next();
    } catch (error) {
      console.error('[RateLimit] 中间件错误:', error);
      // 发生错误时放行，避免影响正常请求
      next();
    }
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
  getBlacklistStatus,
  removeFromBlacklist
};
