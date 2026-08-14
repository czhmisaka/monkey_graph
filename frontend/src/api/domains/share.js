// 图谱分享域 API (shareAPI)
import { api } from '../core.js'

// 图谱分享
export const shareAPI = {
  // 生成分享链接
  createShare(graphId, data) {
    return api.post(`/graphs/${graphId}/share`, data)
  },
  // 获取分享列表
  getShares(graphId) {
    return api.get(`/graphs/${graphId}/shares`)
  },
  // 取消分享
  deleteShare(graphId, shareId) {
    return api.delete(`/graphs/${graphId}/shares/${shareId}`)
  },
  // 访问分享的图谱
  getShare(token) {
    return api.get(`/share/${token}`)
  },
  // 验证分享是否允许编辑
  checkEdit(token) {
    return api.get(`/share/${token}/check-edit`)
  },
  // 分享编辑 - 创建节点
  createNode(token, data) {
    return api.post(`/share/${token}/nodes`, data)
  },
  // 分享编辑 - 更新节点
  updateNode(token, nodeId, data) {
    return api.put(`/share/${token}/nodes/${nodeId}`, data)
  },
  // 分享编辑 - 删除节点
  deleteNode(token, nodeId) {
    return api.delete(`/share/${token}/nodes/${nodeId}`)
  },
  // 分享编辑 - 创建边
  createEdge(token, data) {
    return api.post(`/share/${token}/edges`, data)
  },
  // 分享编辑 - 更新边
  updateEdge(token, edgeId, data) {
    return api.put(`/share/${token}/edges/${edgeId}`, data)
  },
  // 分享编辑 - 删除边
  deleteEdge(token, edgeId) {
    return api.delete(`/share/${token}/edges/${edgeId}`)
  }
}
