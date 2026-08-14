// Embedding 域 API (embeddingAPI)
import { api } from '../core.js'

// Embedding API
export const embeddingAPI = {
  /**
   * 检查 embedding 服务状态（全局）
   */
  getStatus() {
    return api.get('/embedding/status')
  },
  
  /**
   * 检查图谱的 embedding 状态
   * @param {string} graphId - 图谱ID
   */
  getGraphStatus(graphId) {
    return api.get(`/graphs/${graphId}/embedding/status`)
  },
  
  /**
   * 计算图谱中所有节点的 embedding
   * @param {string} graphId - 图谱ID
   */
  computeEmbeddings(graphId) {
    return api.post(`/graphs/${graphId}/embedding/compute`)
  },
  
  /**
   * 语义搜索节点
   * @param {string} graphId - 图谱ID
   * @param {string} query - 搜索关键词
   * @param {number} limit - 返回数量限制
   */
  semanticSearch(graphId, query, limit = 10) {
    return api.get(`/graphs/${graphId}/embedding/search?q=${encodeURIComponent(query)}&limit=${limit}`)
  },
  
  /**
   * 获取节点的相似节点
   * @param {string} graphId - 图谱ID
   * @param {string} nodeId - 节点ID
   * @param {number} limit - 返回数量限制
   */
  getSimilarNodes(graphId, nodeId, limit = 10) {
    return api.get(`/graphs/${graphId}/embedding/similar/${nodeId}?limit=${limit}`)
  },
  
  /**
   * 对图谱中的节点进行聚类分析
   * @param {string} graphId - 图谱ID
   * @param {number} k - 聚类数量
   */
  clusterNodes(graphId, k = 3) {
    return api.post(`/graphs/${graphId}/embedding/cluster`, { k })
  },
  
  /**
   * 删除图谱的所有 embedding
   * @param {string} graphId - 图谱ID
   */
  deleteEmbeddings(graphId) {
    return api.delete(`/graphs/${graphId}/embedding`)
  },
  
  /**
   * 获取聚类分析进度
   * @param {string} graphId - 图谱ID
   */
  getClusterProgress(graphId) {
    return api.get(`/graphs/${graphId}/embedding/cluster/progress`)
  }
}
