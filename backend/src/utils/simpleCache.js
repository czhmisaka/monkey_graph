/**
 * 简单的内存缓存工具
 * 用于缓存频繁访问的数据，减少数据库查询
 */

class SimpleCache {
  constructor(options = {}) {
    // 缓存过期时间（毫秒），默认 5 分钟
    this.ttl = options.ttl || 5 * 60 * 1000
    // 最大缓存条目数
    this.maxSize = options.maxSize || 1000
    // 缓存存储
    this.cache = new Map()
  }

  /**
   * 生成缓存键
   */
  _makeKey(key) {
    if (typeof key === 'object') {
      return JSON.stringify(key)
    }
    return String(key)
  }

  /**
   * 设置缓存
   */
  set(key, value, customTtl = null) {
    const actualKey = this._makeKey(key)
    const expiresAt = customTtl 
      ? Date.now() + customTtl 
      : Date.now() + this.ttl

    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(actualKey, {
      value,
      expiresAt
    })

    return true
  }

  /**
   * 获取缓存
   */
  get(key) {
    const actualKey = this._makeKey(key)
    const item = this.cache.get(actualKey)

    if (!item) return null

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this.cache.delete(actualKey)
      return null
    }

    return item.value
  }

  /**
   * 检查缓存是否存在（未过期）
   */
  has(key) {
    return this.get(key) !== null
  }

  /**
   * 删除缓存
   */
  delete(key) {
    const actualKey = this._makeKey(key)
    return this.cache.delete(actualKey)
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear()
    return true
  }

  /**
   * 原子递增计数器(同步,用于速率限制等场景)
   * 第一次调用时自动初始化,windowMs 后过期
   * @param {string} key 缓存键
   * @param {number} windowMs 过期时间(毫秒)
   * @returns {{count: number, resetTime: number}}
   */
  incr(key, windowMs) {
    const actualKey = this._makeKey(key)
    const now = Date.now()
    const item = this.cache.get(actualKey)

    if (!item || now > item.expiresAt) {
      // 首次或已过期 → 重置为 1
      const resetTime = now + windowMs
      this.cache.set(actualKey, { value: { count: 1, resetTime }, expiresAt: resetTime })
      return { count: 1, resetTime }
    }

    // 同步原子递增(单进程内 JS 不会被打断)
    const next = item.value.count + 1
    item.value.count = next
    return { count: next, resetTime: item.value.resetTime }
  }

  /**
   * 删除过期的缓存条目
   */
  cleanup() {
    const now = Date.now()
    let deletedCount = 0

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    return deletedCount
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const now = Date.now()
    let validCount = 0
    let expiredCount = 0

    for (const item of this.cache.values()) {
      if (now > item.expiresAt) {
        expiredCount++
      } else {
        validCount++
      }
    }

    return {
      total: this.cache.size,
      valid: validCount,
      expired: expiredCount,
      maxSize: this.maxSize,
      ttl: this.ttl
    }
  }
}

// 创建全局缓存实例
export const globalCache = new SimpleCache({
  ttl: 5 * 60 * 1000, // 5 分钟
  maxSize: 1000
})

// 创建专用缓存实例
export const createCache = (options) => new SimpleCache(options)

export default SimpleCache
