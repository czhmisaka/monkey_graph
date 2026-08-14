/**
 * Embedding 服务 - 调用本地 embedding 模型进行向量计算
 * 包含多种相似度算法、聚类算法和向量操作工具
 */

import { logger } from '../logger.js';
import { vecSearchOperations } from '../database.js';
import { EMBEDDING_CONFIG } from '../config/embedding.js';

// 输入清理：限制文本长度，移除控制字符
const MAX_TEXT_LENGTH = 8000;
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text.slice(0, MAX_TEXT_LENGTH).replace(CONTROL_CHARS_REGEX, '');
}

/**
 * 调用本地 embedding API 获取文本向量
 * @param {string} text - 要 embedding 的文本
 * @returns {Promise<number[]>} embedding 向量
 */
export async function getEmbedding(text) {
  const sanitized = sanitizeText(text);
  if (!sanitized) {
    logger.warn('[Embedding API] 输入文本为空');
    return null;
  }

  try {
    logger.info(`[Embedding API] 正在调用 embedding API, 模型: ${EMBEDDING_CONFIG.model}, URL: ${EMBEDDING_CONFIG.url}`);
    logger.info(`[Embedding API] 输入文本: ${sanitized.slice(0, 100)}...`);
    
    const response = await fetch(`${EMBEDDING_CONFIG.url}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: sanitized
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    logger.info(`[Embedding API] 响应状态: ${response.status}, 数据长度: ${data.data?.length || 0}`);
    
    if (data.data && data.data.length > 0) {
      logger.info(`[Embedding API] ✅ 成功获取 embedding, 向量维度: ${data.data[0].embedding.length}`);
      return data.data[0].embedding;
    }

    throw new Error('No embedding returned');
  } catch (error) {
    logger.error('[Embedding API] ❌ 获取 embedding 失败:', error.message);
    throw error;
  }
}

/**
 * 批量获取 embedding
 * @param {string[]} texts - 文本数组
 * @returns {Promise<number[][]>} embedding 向量数组
 */
export async function getEmbeddings(texts) {
  if (!texts || texts.length === 0) {
    logger.warn('[Embedding API] 批量输入文本为空');
    return [];
  }

  // 过滤空文本
  const validTexts = texts.map(t => t?.trim()).filter(t => t);
  
  if (validTexts.length === 0) {
    logger.warn('[Embedding API] 过滤后没有有效文本');
    return [];
  }

  logger.info(`[Embedding API] 批量请求: ${validTexts.length} 个文本`);
  logger.info(`[Embedding API] 文本示例: ${validTexts[0]?.slice(0, 50)}...`);

  try {
    const response = await fetch(`${EMBEDDING_CONFIG.url}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: validTexts
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.info(`[Embedding API] 批量响应: ${response.status}, 返回 ${data.data?.length || 0} 个向量`);
    
    // 按输入顺序返回结果
    const embeddings = data.data || [];
    const result = embeddings.map(e => e.embedding);
    logger.info(`[Embedding API] ✅ 批量成功获取 ${result.length} 个 embedding 向量`);
    return result;
  } catch (error) {
    logger.error('[Embedding API] ❌ 批量获取 embedding 失败:', error.message);
    throw error;
  }
}

/**
 * 相似度算法类型枚举
 */
export const SimilarityMetric = {
  COSINE: 'cosine',
  EUCLIDEAN: 'euclidean',
  DOT_PRODUCT: 'dot_product',
  MANHATTAN: 'manhattan'
};

/**
 * 计算余弦相似度
 * @param {number[]} vec1 - 向量1
 * @param {number[]} vec2 - 向量2
 * @returns {number} 相似度 (-1 到 1)
 */
export function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 计算欧氏距离
 * @param {number[]} vec1 - 向量1
 * @param {number[]} vec2 - 向量2
 * @returns {number} 距离 (0 到 无穷大)
 */
export function euclideanDistance(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return Infinity;
  }

  let sumSquared = 0;
  for (let i = 0; i < vec1.length; i++) {
    const diff = vec1[i] - vec2[i];
    sumSquared += diff * diff;
  }

  return Math.sqrt(sumSquared);
}

/**
 * 计算余弦相似度的欧氏距离版本（归一化后）
 * @param {number[]} vec1 - 向量1
 * @param {number[]} vec2 - 向量2
 * @returns {number} 距离 (0 到 2)
 */
export function normalizedEuclideanDistance(vec1, vec2) {
  const norm1 = normalizeVector(vec1);
  const norm2 = normalizeVector(vec2);
  return euclideanDistance(norm1, norm2);
}

/**
 * 计算点积
 * @param {number[]} vec1 - 向量1
 * @param {number[]} vec2 - 向量2
 * @returns {number} 点积结果
 */
export function dotProduct(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < vec1.length; i++) {
    sum += vec1[i] * vec2[i];
  }

  return sum;
}

/**
 * 计算曼哈顿距离
 * @param {number[]} vec1 - 向量1
 * @param {number[]} vec2 - 向量2
 * @returns {number} 距离 (0 到 无穷大)
 */
export function manhattanDistance(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return Infinity;
  }

  let sum = 0;
  for (let i = 0; i < vec1.length; i++) {
    sum += Math.abs(vec1[i] - vec2[i]);
  }

  return sum;
}

/**
 * 统一的相似度/距离计算函数
 * @param {number[]} vec1 - 向量1
 * @param {number[]} vec2 - 向量2
 * @param {string} metric - 相似度算法类型
 * @returns {number} 相似度或距离值
 */
export function computeSimilarity(vec1, vec2, metric = SimilarityMetric.COSINE) {
  switch (metric) {
    case SimilarityMetric.COSINE:
      return cosineSimilarity(vec1, vec2);
    case SimilarityMetric.EUCLIDEAN:
      return euclideanDistance(vec1, vec2);
    case SimilarityMetric.DOT_PRODUCT:
      return dotProduct(vec1, vec2);
    case SimilarityMetric.MANHATTAN:
      return manhattanDistance(vec1, vec2);
    default:
      return cosineSimilarity(vec1, vec2);
  }
}

/**
 * 向量归一化（L2 范数）
 * @param {number[]} vec - 要归一化的向量
 * @returns {number[]} 归一化后的向量
 */
export function normalizeVector(vec) {
  if (!vec || vec.length === 0) {
    return [];
  }

  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) {
    return vec;
  }

  return vec.map(v => v / norm);
}

/**
 * 批量归一化向量
 * @param {number[][]} vectors - 向量数组
 * @returns {number[][]} 归一化后的向量数组
 */
export function normalizeVectors(vectors) {
  if (!vectors || vectors.length === 0) {
    return [];
  }

  return vectors.map(vec => normalizeVector(vec));
}

/**
 * 查找最相似的节点
 * @param {number[]} targetEmbedding - 目标向量
 * @param {Array<{id: string, embedding: number[]}>} candidates - 候选节点数组
 * @param {number} limit - 返回数量限制
 * @returns {Array<{id: string, similarity: number}>} 相似节点列表
 */
export function findSimilarNodes(targetEmbedding, candidates, limit = 10) {
  if (!targetEmbedding || !candidates || candidates.length === 0) {
    return [];
  }

  const similarities = candidates
    .filter(c => c.embedding && c.embedding.length > 0)
    .map(c => ({
      id: c.id,
      similarity: cosineSimilarity(targetEmbedding, c.embedding)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return similarities;
}

/**
 * K-means 聚类算法
 * @param {number[][]} vectors - 向量数组
 * @param {number} k - 聚类数量
 * @param {number} maxIterations - 最大迭代次数
 * @returns {Array<{clusterId: number, indices: number[]}>} 聚类结果
 */
export function kMeansClustering(vectors, k = 3, maxIterations = 100) {
  if (!vectors || vectors.length < k) {
    // 如果向量数量不足，每个向量作为一个簇
    return vectors.map((_, i) => ({ clusterId: i, indices: [i] }));
  }

  // 随机初始化聚类中心
  const indices = Array.from({ length: vectors.length }, (_, i) => i);
  const shuffled = indices.sort(() => Math.random() - 0.5);
  let centroids = shuffled.slice(0, k).map(i => [...vectors[i]]);

  let assignments = new Array(vectors.length).fill(-1);
  let converged = false;
  let iterations = 0;

  while (!converged && iterations < maxIterations) {
    converged = true;
    iterations++;

    // 分配每个向量到最近的聚类中心
    for (let i = 0; i < vectors.length; i++) {
      let maxSimilarity = -Infinity;
      let bestCluster = 0;

      for (let j = 0; j < k; j++) {
        const sim = cosineSimilarity(vectors[i], centroids[j]);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
          bestCluster = j;
        }
      }

      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        converged = false;
      }
    }

    // 更新聚类中心
    for (let j = 0; j < k; j++) {
      const clusterVectors = vectors.filter((_, i) => assignments[i] === j);
      if (clusterVectors.length > 0) {
        // 计算平均值作为新的聚类中心
        const newCentroid = new Array(centroids[0].length).fill(0);
        for (const vec of clusterVectors) {
          for (let d = 0; d < vec.length; d++) {
            newCentroid[d] += vec[d];
          }
        }
        for (let d = 0; d < newCentroid.length; d++) {
          newCentroid[d] /= clusterVectors.length;
        }
        centroids[j] = newCentroid;
      }
    }
  }

  // 按聚类ID分组返回结果
  const clusters = [];
  for (let j = 0; j < k; j++) {
    const clusterIndices = indices.filter((_, i) => assignments[i] === j);
    if (clusterIndices.length > 0) {
      clusters.push({
        clusterId: j,
        indices: clusterIndices,
        centroid: centroids[j]
      });
    }
  }

  return clusters;
}

/**
 * 将节点文本转换为 embedding 文本
 * @param {Object} node - 节点对象
 * @returns {string} 用于 embedding 的文本
 */
export function nodeToEmbeddingText(node) {
  const parts = [];
  
  // 节点标签
  if (node.label) {
    parts.push(node.label);
  }
  
  // 节点类型
  if (node.type) {
    parts.push(`类型: ${node.type}`);
  }
  
  // 节点属性
  if (node.properties) {
    const props = typeof node.properties === 'string' 
      ? JSON.parse(node.properties) 
      : node.properties;
    
    for (const [key, value] of Object.entries(props)) {
      if (value && typeof value === 'string') {
        parts.push(`${key}: ${value}`);
      }
    }
  }
  
  return parts.join(' | ');
}

/**
 * 检查 embedding 服务是否可用
 * @returns {Promise<boolean>}
 */
export async function isEmbeddingServiceAvailable() {
  try {
    const response = await fetch(`${EMBEDDING_CONFIG.url}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * 获取 embedding 配置信息
 * @returns {Object} 配置信息
 */
export function getEmbeddingConfig() {
  return {
    url: EMBEDDING_CONFIG.url,
    model: EMBEDDING_CONFIG.model,
    dimensions: EMBEDDING_CONFIG.dimensions,
    useVecIndex: EMBEDDING_CONFIG.useVecIndex
  };
}

/**
 * 使用 sqlite-vec 进行高效的向量相似度搜索
 * @param {string} graphId - 图谱ID
 * @param {number[]} queryEmbedding - 查询向量
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Array>} 相似节点列表
 */
export async function searchWithVecIndex(graphId, queryEmbedding, limit = 10) {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      logger.info('sqlite-vec 索引未启用');
      return [];
    }

    // 使用 sqlite-vec 进行搜索
    const results = vecSearchOperations.searchSimilar(graphId, queryEmbedding, limit);
    return results;
  } catch (error) {
    logger.error('sqlite-vec 搜索失败:', error);
    return [];
  }
}

/**
 * 将节点 embedding 添加到 sqlite-vec 索引
 * @param {string} nodeId - 节点ID
 * @param {string} graphId - 图谱ID
 * @param {number[]} embedding - embedding 向量
 * @returns {boolean} 是否成功
 */
export function addToVecIndex(nodeId, graphId, embedding) {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      return false;
    }
    return vecSearchOperations.addToIndex(nodeId, graphId, embedding);
  } catch (error) {
    logger.error('添加到向量索引失败:', error);
    return false;
  }
}

/**
 * 批量将节点 embedding 添加到 sqlite-vec 索引
 * @param {string} graphId - 图谱ID
 * @param {Array<{nodeId: string, embedding: number[]}>} items - 节点数组
 * @returns {boolean} 是否成功
 */
export function batchAddToVecIndex(graphId, items) {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      return false;
    }
    return vecSearchOperations.batchAddToIndex(graphId, items);
  } catch (error) {
    logger.error('批量添加到向量索引失败:', error);
    return false;
  }
}

/**
 * 从 sqlite-vec 索引中删除节点
 * @param {string} nodeId - 节点ID
 * @returns {boolean} 是否成功
 */
export function removeFromVecIndex(nodeId) {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      return false;
    }
    return vecSearchOperations.removeFromIndex(nodeId);
  } catch (error) {
    logger.error('从向量索引删除失败:', error);
    return false;
  }
}

/**
 * 清空图谱的 sqlite-vec 索引
 * @param {string} graphId - 图谱ID
 * @returns {boolean} 是否成功
 */
export function clearVecIndex(graphId) {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      return false;
    }
    return vecSearchOperations.clearIndexByGraphId(graphId);
  } catch (error) {
    logger.error('清空向量索引失败:', error);
    return false;
  }
}

/**
 * 获取 sqlite-vec 索引中的节点数量
 * @param {string} graphId - 图谱ID
 * @returns {number} 节点数量
 */
export function getVecIndexCount(graphId) {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      return 0;
    }
    return vecSearchOperations.getIndexCount(graphId);
  } catch (error) {
    logger.error('获取索引数量失败:', error);
    return 0;
  }
}

/**
 * 初始化 sqlite-vec 索引
 * @returns {boolean} 是否成功
 */
export function initializeVecIndex() {
  try {
    if (!EMBEDDING_CONFIG.useVecIndex) {
      logger.info('sqlite-vec 索引未启用');
      return false;
    }
    return vecSearchOperations.initializeIndex();
  } catch (error) {
    logger.error('初始化向量索引失败:', error);
    return false;
  }
}

/**
 * 带重试的 embedding 获取
 * @param {string} text - 要 embedding 的文本
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<number[]>} embedding 向量
 */
export async function getEmbeddingWithRetry(text, maxRetries = EMBEDDING_CONFIG.maxRetries) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[Embedding API] 获取 embedding (尝试 ${attempt}/${maxRetries})`);
      const result = await getEmbedding(text);
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
      logger.warn(`[Embedding API] 尝试 ${attempt} 失败: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = EMBEDDING_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        logger.info(`[Embedding API] 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('获取 embedding 失败');
}

/**
 * 带重试的批量 embedding 获取
 * @param {string[]} texts - 文本数组
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<number[][]>} embedding 向量数组
 */
export async function getEmbeddingsWithRetry(texts, maxRetries = EMBEDDING_CONFIG.maxRetries) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[Embedding API] 批量获取 embedding (尝试 ${attempt}/${maxRetries}), 数量: ${texts.length}`);
      const result = await getEmbeddings(texts);
      if (result && result.length > 0) {
        return result;
      }
    } catch (error) {
      lastError = error;
      logger.warn(`[Embedding API] 批量尝试 ${attempt} 失败: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = EMBEDDING_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        logger.info(`[Embedding API] 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('批量获取 embedding 失败');
}

/**
 * 分批获取 embedding（避免内存溢出）
 * @param {string[]} texts - 文本数组
 * @param {number} batchSize - 每批大小
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<number[][]>} embedding 向量数组
 */
export async function getEmbeddingsInBatches(texts, batchSize = EMBEDDING_CONFIG.batchSize, onProgress = null) {
  const results = [];
  const total = texts.length;
  
  for (let i = 0; i < total; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    logger.info(`[Embedding API] 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(total / batchSize)}, 数量: ${batch.length}`);
    
    try {
      const batchResults = await getEmbeddingsWithRetry(batch);
      results.push(...batchResults);
      
      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total);
      }
    } catch (error) {
      logger.error(`[Embedding API] 批次 ${Math.floor(i / batchSize) + 1} 失败:`, error.message);
      // 填充 null 以保持索引对应
      results.push(...new Array(batch.length).fill(null));
    }
  }
  
  return results;
}

/**
 * DBSCAN 聚类算法
 * @param {number[][]} vectors - 向量数组
 * @param {number} eps - 邻域半径
 * @param {number} minPts - 最小点数
 * @returns {Array<{clusterId: number, indices: number[]}>} 聚类结果
 */
export function dbscanClustering(vectors, eps = 0.5, minPts = 3) {
  if (!vectors || vectors.length === 0) {
    return [];
  }

  const n = vectors.length;
  const labels = new Array(n).fill(-1); // -1 表示未访问
  let clusterId = 0;

  // 计算所有点之间的欧氏距离
  function getNeighbors(idx) {
    const neighbors = [];
    for (let i = 0; i < n; i++) {
      if (i !== idx) {
        const dist = euclideanDistance(vectors[idx], vectors[i]);
        if (dist <= eps) {
          neighbors.push(i);
        }
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) {
      continue; // 已访问
    }

    const neighbors = getNeighbors(i);
    
    if (neighbors.length < minPts) {
      labels[i] = -2; // 噪声点
    } else {
      // 扩展聚类
      labels[i] = clusterId;
      
      let seedSet = [...neighbors];
      let seedIndex = 0;
      
      while (seedIndex < seedSet.length) {
        const current = seedSet[seedIndex];
        seedIndex++;
        
        if (labels[current] === -2) {
          labels[current] = clusterId; // 噪声点转为边界点
        }
        
        if (labels[current] !== -1) {
          continue;
        }
        
        labels[current] = clusterId;
        
        const currentNeighbors = getNeighbors(current);
        if (currentNeighbors.length >= minPts) {
          seedSet.push(...currentNeighbors);
        }
      }
      
      clusterId++;
    }
  }

  // 按聚类ID分组
  const clusters = [];
  for (let c = 0; c < clusterId; c++) {
    const indices = [];
    for (let i = 0; i < n; i++) {
      if (labels[i] === c) {
        indices.push(i);
      }
    }
    if (indices.length > 0) {
      clusters.push({ clusterId: c, indices });
    }
  }

  // 添加噪声点（可选）
  const noiseIndices = [];
  for (let i = 0; i < n; i++) {
    if (labels[i] === -2) {
      noiseIndices.push(i);
    }
  }
  if (noiseIndices.length > 0) {
    clusters.push({ clusterId: -1, indices: noiseIndices, isNoise: true });
  }

  return clusters;
}

/**
 * 计算向量的统计信息
 * @param {number[][]} vectors - 向量数组
 * @returns {Object} 统计信息
 */
export function computeVectorStats(vectors) {
  if (!vectors || vectors.length === 0) {
    return {
      count: 0,
      dimensions: 0,
      mean: [],
      std: [],
      min: [],
      max: []
    };
  }

  const dimensions = vectors[0].length;
  const count = vectors.length;
  
  // 初始化统计数组
  const mean = new Array(dimensions).fill(0);
  const min = new Array(dimensions).fill(Infinity);
  const max = new Array(dimensions).fill(-Infinity);
  
  // 计算均值、最小值、最大值
  for (const vec of vectors) {
    for (let d = 0; d < dimensions; d++) {
      mean[d] += vec[d];
      min[d] = Math.min(min[d], vec[d]);
      max[d] = Math.max(max[d], vec[d]);
    }
  }
  
  // 计算平均值
  for (let d = 0; d < dimensions; d++) {
    mean[d] /= count;
  }
  
  // 计算标准差
  const std = new Array(dimensions).fill(0);
  for (const vec of vectors) {
    for (let d = 0; d < dimensions; d++) {
      std[d] += Math.pow(vec[d] - mean[d], 2);
    }
  }
  for (let d = 0; d < dimensions; d++) {
    std[d] = Math.sqrt(std[d] / count);
  }

  return { count, dimensions, mean, std, min, max };
}

/**
 * 导出向量数据为 JSON 格式
 * @param {Array<{id: string, label: string, embedding: number[]}>} nodes - 节点数组
 * @returns {string} JSON 字符串
 */
export function exportVectorsToJSON(nodes) {
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    count: nodes.length,
    dimensions: nodes[0]?.embedding?.length || 0,
    vectors: nodes.map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
      embedding: n.embedding
    }))
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 从 JSON 导入向量数据
 * @param {string} jsonString - JSON 字符串
 * @returns {Array<{id: string, label: string, embedding: number[]}>} 节点数组
 */
export function importVectorsFromJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.vectors || !Array.isArray(data.vectors)) {
      throw new Error('无效的向量数据格式');
    }
    return data.vectors.map(v => ({
      id: v.id,
      label: v.label,
      type: v.type,
      embedding: v.embedding
    }));
  } catch (error) {
    logger.error('[Embedding API] 导入向量数据失败:', error.message);
    throw error;
  }
}

/**
 * 增量计算 embedding（只计算没有 embedding 的节点）
 * @param {Array} nodes - 节点数组
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<{total: number, computed: number, skipped: number}>} 计算结果
 */
export async function computeMissingEmbeddings(nodes, onProgress = null) {
  const nodesWithoutEmbedding = [];
  const nodesWithEmbedding = [];
  
  for (const node of nodes) {
    if (node.embedding && node.embedding.length > 0) {
      nodesWithEmbedding.push(node);
    } else {
      nodesWithoutEmbedding.push(node);
    }
  }
  
  logger.info(`[Embedding API] 增量计算: ${nodesWithoutEmbedding.length} 个节点需要计算, ${nodesWithEmbedding.length} 个已有 embedding`);
  
  if (nodesWithoutEmbedding.length === 0) {
    return { total: nodes.length, computed: 0, skipped: nodes.length };
  }
  
  // 提取需要计算的节点文本
  const texts = nodesWithoutEmbedding.map(n => nodeToEmbeddingText(n));
  
  // 分批计算
  let computed = 0;
  const results = await getEmbeddingsInBatches(texts, EMBEDDING_CONFIG.batchSize, (current, total) => {
    if (onProgress) {
      onProgress(current, total, 'computing');
    }
  });
  
  // 统计成功计算的数量
  computed = results.filter(r => r !== null).length;
  
  return {
    total: nodes.length,
    computed,
    skipped: nodes.length - computed
  };
}

/**
 * 过滤相似度低于阈值的节点
 * @param {number[]} targetEmbedding - 目标向量
 * @param {Array<{id: string, embedding: number[]}>} candidates - 候选节点
 * @param {number} threshold - 阈值 (0-1)
 * @returns {Array<{id: string, similarity: number}>} 过滤后的相似节点
 */
export function filterBySimilarityThreshold(targetEmbedding, candidates, threshold = 0.5) {
  if (!targetEmbedding || !candidates || candidates.length === 0) {
    return [];
  }

  return candidates
    .filter(c => c.embedding && c.embedding.length > 0)
    .map(c => ({
      id: c.id,
      similarity: cosineSimilarity(targetEmbedding, c.embedding)
    }))
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * 获取向量配置（可动态更新）
 * @returns {Object} 配置信息
 */
export function getVectorConfig() {
  return {
    ...EMBEDDING_CONFIG
  };
}

/**
 * 更新向量配置
 * @param {Object} newConfig - 新配置
 */
export function updateVectorConfig(newConfig) {
  Object.assign(EMBEDDING_CONFIG, newConfig);
  logger.info('[Embedding API] 配置已更新:', EMBEDDING_CONFIG);
}

/**
 * 自动检测向量维度
 * 通过调用一次 embedding API 来获取实际的向量维度
 * @returns {Promise<number|null>} 检测到的维度，或 null 表示失败
 */
export async function autoDetectDimensions() {
  if (!EMBEDDING_CONFIG.autoDetectDimensions) {
    logger.info('[Embedding API] 自动检测已禁用，使用配置的维度:', EMBEDDING_CONFIG.dimensions);
    return EMBEDDING_CONFIG.dimensions;
  }

  try {
    logger.info('[Embedding API] 开始自动检测向量维度...');
    
    // 使用一个简短的测试文本
    const testText = '测试向量维度检测';
    
    const response = await fetch(`${EMBEDDING_CONFIG.url}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: testText
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      const detectedDimensions = data.data[0].embedding.length;
      const oldDimensions = EMBEDDING_CONFIG.dimensions;
      
      // 更新配置
      EMBEDDING_CONFIG.dimensions = detectedDimensions;
      
      logger.info(`[Embedding API] ✅ 向量维度检测成功: ${detectedDimensions} (之前: ${oldDimensions})`);
      
      return detectedDimensions;
    }

    throw new Error('No embedding returned');
  } catch (error) {
    logger.error('[Embedding API] ❌ 向量维度检测失败:', error.message);
    logger.info('[Embedding API] 使用默认维度:', EMBEDDING_CONFIG.dimensions);
    return null;
  }
}

export default {
  getEmbedding,
  getEmbeddings,
  getEmbeddingWithRetry,
  getEmbeddingsWithRetry,
  getEmbeddingsInBatches,
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  manhattanDistance,
  normalizedEuclideanDistance,
  computeSimilarity,
  normalizeVector,
  normalizeVectors,
  SimilarityMetric,
  findSimilarNodes,
  filterBySimilarityThreshold,
  kMeansClustering,
  dbscanClustering,
  computeVectorStats,
  nodeToEmbeddingText,
  isEmbeddingServiceAvailable,
  getEmbeddingConfig,
  getVectorConfig,
  updateVectorConfig,
  autoDetectDimensions,
  searchWithVecIndex,
  addToVecIndex,
  batchAddToVecIndex,
  removeFromVecIndex,
  clearVecIndex,
  getVecIndexCount,
  initializeVecIndex,
  exportVectorsToJSON,
  importVectorsFromJSON,
  computeMissingEmbeddings
};
