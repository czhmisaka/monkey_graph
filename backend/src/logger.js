/**
 * 日志工具 - 支持控制台输出和文件日志
 * 支持日志轮转、自动压缩
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 日志级别定义
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// 日志级别(动态可调)
let _currentLevelName = (process.env.LOG_LEVEL || 'info').toLowerCase();
let _currentLevel = LOG_LEVELS[_currentLevelName] ?? LOG_LEVELS.info;

export function getLogLevel() {
  return _currentLevelName;
}

export function setLogLevel(level) {
  const lv = String(level || 'info').toLowerCase();
  if (LOG_LEVELS[lv] === undefined) {
    throw new Error(`未知的日志级别: ${level}`);
  }
  _currentLevelName = lv;
  _currentLevel = LOG_LEVELS[lv];
  console.log(`[Logger] 日志级别已更新: ${lv}`);
}

// 日志配置
const config = {
  // 日志目录
  logDir: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
  // 日志文件最大大小 (字节)，默认 10MB
  maxSize: parseInt(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024,
  // 保留的日志文件数量
  maxFiles: parseInt(process.env.LOG_MAX_FILES) || 7,
  // 是否启用文件日志
  enableFile: process.env.LOG_ENABLE_FILE !== 'false',
  // 是否启用请求日志
  enableRequestLog: process.env.LOG_ENABLE_REQUEST !== 'false',
  // 是否同时输出到控制台
  console: process.env.LOG_CONSOLE !== 'false'
};

// 确保日志目录存在
if (config.enableFile && !fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

/**
 * 获取当前日志级别数值
 */
function getLevelValue(level) {
  return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

/**
 * 获取日志文件名（按日期）
 */
function getLogFileName(level) {
  const date = new Date().toISOString().split('T')[0];
  return `${level}-${date}.log`;
}

/**
 * 获取日志文件完整路径
 */
function getLogFilePath(level) {
  return path.join(config.logDir, getLogFileName(level));
}

/**
 * 检查并轮转日志文件
 */
function rotateLogFile(level) {
  if (!config.enableFile) return;
  
  const filePath = getLogFilePath(level);
  
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      
      // 如果文件大小超过限制，进行轮转
      if (stats.size > config.maxSize) {
        // 读取当前日志内容
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 生成带时间戳的备份文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(config.logDir, `${level}-${timestamp}.log.bak`);
        
        // 移动当前文件为备份
        fs.renameSync(filePath, backupPath);
        
        // 压缩备份文件（如果需要）
        // 这里简单处理，不进行压缩，保留 .log.bak 后缀
        
        // 清理旧文件
        cleanupOldLogs(level);
      }
    }
  } catch (error) {
    console.error('日志轮转失败:', error);
  }
}

/**
 * 清理旧的日志文件
 * 同时清理按日期命名的 .log（如 info-2026-02-01.log）与轮转备份 .log.bak
 */
function cleanupOldLogs(level) {
  if (!config.enableFile) return;
  
  try {
    const files = fs.readdirSync(config.logDir)
      .filter(f => f.startsWith(level) && (f.endsWith('.log') || f.endsWith('.log.bak')))
      .map(f => {
        let time;
        try {
          time = fs.statSync(path.join(config.logDir, f)).mtime.getTime();
        } catch {
          time = 0;
        }
        return { name: f, path: path.join(config.logDir, f), time };
      })
      .sort((a, b) => b.time - a.time);
    
    // 删除超过保留数量的旧文件（含按日期命名的 .log，防止磁盘无限增长）
    if (files.length > config.maxFiles) {
      files.slice(config.maxFiles).forEach(f => {
        try {
          fs.unlinkSync(f.path);
        } catch (e) {
          // 忽略删除错误
        }
      });
    }
  } catch (error) {
    console.error('清理旧日志失败:', error);
  }
}

/**
 * 写入日志到文件
 */
function writeToFile(level, message) {
  if (!config.enableFile) return;
  
  try {
    // 先检查轮转
    rotateLogFile(level);
    
    const filePath = getLogFilePath(level);
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    
    fs.appendFileSync(filePath, logLine, 'utf8');
  } catch (error) {
    console.error('写入日志文件失败:', error);
  }
}

/**
 * 格式化日志消息
 */
function formatMessage(level, prefix, args) {
  const prefixStr = prefix ? `${prefix} ` : '';
  let message = '';
  
  for (const arg of args) {
    if (typeof arg === 'object') {
      try {
        message += JSON.stringify(arg) + ' ';
      } catch (e) {
        message += String(arg) + ' ';
      }
    } else {
      message += String(arg) + ' ';
    }
  }
  
  return `${level.toUpperCase()}: ${prefixStr}${message.trim()}`;
}

/**
 * 日志输出函数
 * @param {string} level - 日志级别 (error, warn, info, debug)
 * @param {string} prefix - 日志前缀
 * @param {...any} args - 日志内容
 */
function log(level, prefix, ...args) {
  const levelValue = getLevelValue(level);
  const currentLevelValue = _currentLevel;
  
  // 如果当前日志级别低于设置的级别，则不输出
  if (levelValue > currentLevelValue) {
    return;
  }
  
  const message = formatMessage(level, prefix, args);
  
  // 控制台输出
  if (config.console) {
    const timestamp = new Date().toISOString();
    const prefixStr = prefix ? `${prefix} ` : '';
    
    switch (level) {
      case 'error':
        console.error(`[${timestamp}] ${prefixStr}`, ...args);
        break;
      case 'warn':
        console.warn(`[${timestamp}] ${prefixStr}`, ...args);
        break;
      case 'info':
        console.log(`[${timestamp}] ${prefixStr}`, ...args);
        break;
      case 'debug':
        console.log(`[DEBUG] [${timestamp}] ${prefixStr}`, ...args);
        break;
      default:
        console.log(`[${timestamp}] ${prefixStr}`, ...args);
    }
  }
  
  // 文件输出
  if (config.enableFile) {
    writeToFile(level, message);
  }
}

// 导出便捷方法
export const logger = {
  error: (prefix, ...args) => log('error', prefix, ...args),
  warn: (prefix, ...args) => log('warn', prefix, ...args),
  info: (prefix, ...args) => log('info', prefix, ...args),
  debug: (prefix, ...args) => log('debug', prefix, ...args)
};

/**
 * 请求日志记录器
 */
export const requestLogger = {
  /**
   * 记录 HTTP 请求
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   * @param {number} responseTime - 响应时间（毫秒）
   */
  log(req, res, responseTime) {
    if (!config.enableRequestLog) return;
    
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      userId: req.user?.id || 'anonymous'
    };
    
    // 根据状态码选择日志级别
    const level = logData.status >= 500 ? 'error' : 
                  logData.status >= 400 ? 'warn' : 'info';
    
    const message = `${logData.method} ${logData.url} ${logData.status} ${logData.responseTime} - ${logData.ip}`;
    
    log(level, '【请求】', message);
    
    // 写入请求日志文件
    if (config.enableFile) {
      const requestLog = `[${logData.timestamp}] ${logData.method} ${logData.url} | Status: ${logData.status} | Time: ${logData.responseTime} | IP: ${logData.ip} | User: ${logData.userId} | UA: ${logData.userAgent}`;
      writeToFile('request', requestLog);
    }
  }
};

/**
 * 审计日志记录器 - 用于记录重要操作
 */
export const auditLogger = {
  /**
   * 记录用户操作
   * @param {string} action - 操作类型
   * @param {Object} details - 操作详情
   * @param {Object} user - 用户信息
   */
  log(action, details, user) {
    const logData = {
      timestamp: new Date().toISOString(),
      action,
      userId: user?.id || 'anonymous',
      username: user?.username || 'anonymous',
      details
    };
    
    const message = JSON.stringify(logData);
    
    // 总是写入审计日志
    if (config.enableFile) {
      writeToFile('audit', message);
    }
    
    // 同时输出到应用日志
    log('info', '【审计】', `${action} - ${user?.username || 'anonymous'}`, JSON.stringify(details));
  }
};

/**
 * 获取日志文件列表
 */
export function getLogFiles() {
  if (!config.enableFile) return [];
  
  try {
    const files = fs.readdirSync(config.logDir)
      .filter(f => f.endsWith('.log') || f.endsWith('.log.bak'))
      .map(f => {
        const filePath = path.join(config.logDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    
    return files;
  } catch (error) {
    console.error('获取日志文件列表失败:', error);
    return [];
  }
}

/**
 * 读取日志文件内容
 * @param {string} fileName - 日志文件名
 * @param {number} lines - 返回的行数（默认最后100行）
 */
export function readLogFile(fileName, lines = 100) {
  if (!config.enableFile) return [];
  
  // 安全检查：防止路径遍历攻击
  const safeName = path.basename(fileName);
  const filePath = path.join(config.logDir, safeName);
  
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split('\n');
    
    // 返回最后 N 行
    return allLines.slice(-lines).filter(line => line.trim());
  } catch (error) {
    console.error('读取日志文件失败:', error);
    return [];
  }
}

/**
 * 获取最近的日志条目（从所有日志文件）
 * @param {number} count - 返回的条目数量
 */
export function getRecentLogs(count = 50) {
  const logs = [];
  const levels = ['error', 'warn', 'info', 'debug', 'request', 'audit'];
  
  for (const level of levels) {
    const filePath = getLogFilePath(level);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n')
        .filter(line => line.trim())
        .slice(-Math.ceil(count / levels.length));
      
      logs.push(...lines.map(line => ({
        level,
        message: line,
        timestamp: line.match(/\[(.*?)\]/)?.[1] || ''
      })));
    }
  }
  
  // 按时间排序，返回最近的
  return logs
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, count);
}

/**
 * 清理所有日志文件
 */
export function clearLogs() {
  if (!config.enableFile) return { success: false, message: '文件日志未启用' };
  
  try {
    const files = fs.readdirSync(config.logDir)
      .filter(f => f.endsWith('.log') || f.endsWith('.log.bak'));
    
    let deleted = 0;
    for (const f of files) {
      fs.unlinkSync(path.join(config.logDir, f));
      deleted++;
    }
    
    return { success: true, deleted };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export default logger;