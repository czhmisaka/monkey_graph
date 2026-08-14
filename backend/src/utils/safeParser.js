/**
 * 安全 JSON 解析工具
 * 提供安全的 JSON 解析功能，防止解析失败导致应用崩溃
 */
import { logger } from '../logger.js';

/**
 * 安全解析 JSON 字符串
 * @param {string} str - 要解析的字符串
 * @param {*} defaultValue - 解析失败时返回的默认值
 * @returns {*} 解析后的对象或默认值
 */
export function safeJsonParse(str, defaultValue = {}) {
  if (!str || typeof str !== 'string') {
    return defaultValue;
  }
  
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.warn('【SafeParser】', '[safeParser] JSON 解析失败:', error.message);
    return defaultValue;
  }
}

/**
 * 安全序列化 JSON 对象
 * @param {*} obj - 要序列化的对象
 * @param {string} defaultValue - 序列化失败时返回的默认值
 * @returns {string} JSON 字符串或默认值
 */
export function safeJsonStringify(obj, defaultValue = '{}') {
  if (obj === null || obj === undefined) {
    return defaultValue;
  }
  
  try {
    return JSON.stringify(obj);
  } catch (error) {
    logger.warn('【SafeParser】', '[safeParser] JSON 序列化失败:', error.message);
    return defaultValue;
  }
}

/**
 * 安全解析布尔值
 * @param {*} value - 要解析的值
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean}
 */
export function safeParseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return defaultValue;
}

/**
 * 安全解析数值
 * @param {*} value - 要解析的值
 * @param {number} defaultValue - 默认值
 * @returns {number}
 */
export function safeParseNumber(value, defaultValue = 0) {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * 安全解析整数
 * @param {*} value - 要解析的值
 * @param {number} defaultValue - 默认值
 * @returns {number}
 */
export function safeParseInt(value, defaultValue = 0) {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * 安全获取嵌套属性
 * @param {object} obj - 目标对象
 * @param {string} path - 属性路径，如 'a.b.c'
 * @param {*} defaultValue - 属性不存在时返回的默认值
 * @returns {*}
 */
export function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }
  
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current !== undefined ? current : defaultValue;
}

export default {
  safeJsonParse,
  safeJsonStringify,
  safeParseBoolean,
  safeParseNumber,
  safeParseInt,
  safeGet
};
