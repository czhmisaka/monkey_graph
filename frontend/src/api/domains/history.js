// 历史记录域 API (historyAPI)
import { api } from '../core.js'

// 历史记录 - 每个方法都需要传入 graphId
export const historyAPI = {
  getHistory(graphId, limit = 50) {
    return api.get(`/graphs/${graphId}/history?limit=${limit}`)
  },
  undo(graphId) {
    return api.post(`/graphs/${graphId}/history/undo`)
  }
}
