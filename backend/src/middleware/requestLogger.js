/**
 * 请求日志中间件
 * 记录所有 API 请求和异常
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 日志配置
const LOG_CONFIG = {
  // 日志目录
  logDir: path.join(__dirname, '../../logs'),
  // 最大单文件大小（10MB）
  maxFileSize: 10 * 1024 * 1024,
  // 保留天数
  maxDays: 30
};

// 确保日志目录存在
if (!fs.existsSync(LOG_CONFIG.logDir)) {
  fs.mkdirSync(LOG_CONFIG.logDir, { recursive: true });
}

/**
 * 获取日志文件路径
 */
function getLogFilePath(type = 'access') {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_CONFIG.logDir, `${type}-${date}.log`);
}

/**
 * 写入日志
 */
function writeLog(type, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type,
    message,
    ...data
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  const logFile = getLogFilePath(type);
  
  try {
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    logger.error('【RequestLogger】', '[RequestLogger] 写入日志失败:', error);
  }
  
  return logEntry;
}

/**
 * 获取客户端 IP
 * 仅当配置 TRUST_PROXY=true 时信任 X-Forwarded-For，防止伪造绕过
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

// 敏感参数名（脱敏用）
const SENSITIVE_PARAM_PATTERNS = [/token/i, /password/i, /secret/i, /key/i, /authorization/i, /cookie/i];

/**
 * 脱敏 query 参数，避免 token/password 等敏感值落入日志
 */
function sanitizeQuery(query) {
  if (!query || typeof query !== 'object') return query;
  const out = {};
  for (const [k, v] of Object.entries(query)) {
    if (SENSITIVE_PARAM_PATTERNS.some(p => p.test(k))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * 获取请求信息
 */
function getRequestInfo(req) {
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: sanitizeQuery(req.query),
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  };
}

/**
 * 获取响应信息
 */
function getResponseInfo(res) {
  return {
    statusCode: res.statusCode,
    statusMessage: res.statusMessage
  };
}

/**
 * 判断是否为异常请求
 */
function isSuspiciousRequest(req) {
  const suspiciousPatterns = [
    // SQL 注入尝试
    /('|"|;|--|\bor\b|\band\b|union|select|drop|insert|update|delete)/i,
    // XSS 尝试
    /<script|javascript:|onerror=|onload=/i,
    // 路径遍历
    /(\.\.|\/etc\/|\/var\/|\/root\/|\\windows\\|\\system32\\)/i,
    // 敏感文件
    /\.env|\.git\/config|\/wp-config|\/config\.php/i,
    // 扫描器特征
    /sqlmap|nmap|masscan|dirbuster|gobuster|nikto|burp/i
  ];
  
  const url = req.originalUrl || req.url;
  const body = JSON.stringify(req.body || {});
  const userAgent = req.headers['user-agent'] || '';
  
  const combined = `${url} ${body} ${userAgent}`;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(combined)) {
      return {
        suspicious: true,
        pattern: pattern.source
      };
    }
  }
  
  return { suspicious: false };
}

/**
 * 请求日志中间件
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestInfo = getRequestInfo(req);
  
  // 检查是否为可疑请求
  const suspiciousCheck = isSuspiciousRequest(req);
  
  // 记录可疑请求
  if (suspiciousCheck.suspicious) {
    logger.warn('【RequestLogger】', `[Security] 可疑请求: ${requestInfo.ip} - ${requestInfo.method} ${requestInfo.url}`);
    logger.warn('【RequestLogger】', `           模式匹配: ${suspiciousCheck.pattern}`);
    
    writeLog('security', '可疑请求', {
      ...requestInfo,
      suspiciousPattern: suspiciousCheck.pattern
    });
  }
  
  // 覆盖 res.json 以捕获响应
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const duration = Date.now() - startTime;
    const responseInfo = getResponseInfo(res);
    
    const logData = {
      ...requestInfo,
      ...responseInfo,
      duration,
      userId: req.user?.id
    };
    
    // 根据状态码和时长决定日志级别
    if (res.statusCode >= 500) {
      writeLog('error', '服务端错误', logData);
    } else if (res.statusCode >= 400) {
      // 4xx 错误但不是常见错误（如 404）
      if (res.statusCode !== 404 && res.statusCode !== 401) {
        writeLog('warning', '客户端错误', logData);
      }
    } else if (duration > 5000) {
      // 慢请求（超过 5 秒）
      writeLog('slow', '慢请求', logData);
    }
    
    return originalJson(body);
  };
  
  // 捕获错误
  req.on('error', (error) => {
    logger.error('【RequestLogger】', '[RequestLogger] 请求错误:', error);
    writeLog('error', '请求错误', {
      ...requestInfo,
      error: error.message
    });
  });
  
  next();
}

/**
 * 安全日志记录器
 */
export const securityLogger = {
  logSuspicious(req, reason) {
    writeLog('security', '可疑活动', {
      ...getRequestInfo(req),
      reason
    });
  },
  
  logAuthFailure(req, reason) {
    writeLog('auth', '认证失败', {
      ...getRequestInfo(req),
      reason
    });
  },
  
  logAuthSuccess(req, userId) {
    writeLog('auth', '认证成功', {
      ...getRequestInfo(req),
      userId
    });
  },
  
  logRateLimit(req) {
    writeLog('security', '速率限制触发', {
      ...getRequestInfo(req)
    });
  },
  
  logFileUpload(req, filename, result) {
    writeLog('upload', '文件上传', {
      ...getRequestInfo(req),
      filename,
      result
    });
  }
};

/**
 * 获取最近的安全日志
 */
export function getRecentSecurityLogs(limit = 100) {
  const logs = [];
  const logFile = getLogFilePath('security');
  
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      // 从后往前取最新的
      for (let i = lines.length - 1; i >= 0 && logs.length < limit; i--) {
        try {
          logs.push(JSON.parse(lines[i]));
        } catch {
          // 忽略解析错误
        }
      }
    }
  } catch (error) {
    logger.error('【RequestLogger】', '[RequestLogger] 读取安全日志失败:', error);
  }
  
  return logs;
}

export default {
  requestLogger,
  securityLogger,
  getRecentSecurityLogs
};
