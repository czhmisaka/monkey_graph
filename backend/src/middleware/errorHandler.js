import crypto from 'crypto';
import { logger } from '../logger.js';

/**
 * 统一错误响应中间件
 * - 生产环境隐藏内部错误详情
 * - 所有错误返回格式：{ error, code, requestId }
 * - 记录完整错误日志以便排查
 */
export function errorHandler(err, req, res, next) {
  const requestId = req.id || crypto.randomUUID();
  
  // 记录错误（含堆栈）
  logger.error(`[${requestId}] ${err.message}`, {
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id
  });

  // 已知的业务错误（有状态码）
  if (err.status) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code || 'BUSINESS_ERROR',
      requestId
    });
  }

  // 生产环境隐藏详情
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      requestId
    });
  }

  // 开发环境返回详情
  res.status(500).json({
    error: err.message,
    code: err.code || 'INTERNAL_ERROR',
    requestId,
    stack: err.stack?.split('\n')
  });
}

/**
 * 创建带有状态码的业务错误
 * @param {number} status - HTTP 状态码
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 */
export function createHttpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code || 'BUSINESS_ERROR';
  return err;
}