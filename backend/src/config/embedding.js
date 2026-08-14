/**
 * Embedding 配置模块
 * 从 embeddingService.js 抽取，避免 database.js ↔ embeddingService.js 循环依赖。
 * 纯环境变量配置，无任何模块依赖。
 */

export const EMBEDDING_CONFIG = {
  url: process.env.EMBEDDING_URL || 'http://127.0.0.1:1234',
  model: process.env.EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-4b',
  dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS) || 2560, // 向量维度，可通过环境变量配置
  batchSize: 32, // 批量处理的批次大小
  useVecIndex: true, // 是否使用 sqlite-vec 索引
  maxRetries: 3, // 最大重试次数
  retryDelay: 1000, // 重试延迟(ms)
  autoDetectDimensions: true // 是否自动检测向量维度
};
