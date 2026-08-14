// Agent 域 API：userAgentAPI + myAgentAPI + agentAPI + agentLogsAPI
import { api } from '../core.js'

// 用户关联的 Agent
export const userAgentAPI = {
  // 获取用户关联的所有 Agent
  getAll() {
    return api.get('/user/agents')
  },
  // 关联 Agent 到用户
  create(data) {
    return api.post('/user/agents', data)
  },
  // 取消关联 Agent
  delete(id) {
    return api.delete(`/user/agents/${id}`)
  },
  // 更新关联角色
  updateRole(id, role) {
    return api.put(`/user/agents/${id}/role`, { role })
  }
}

// 用户自己创建的 Agent（API Key 管理）
export const myAgentAPI = {
  // 获取用户创建的所有 Agent（含 API Key）
  getAll() {
    return api.get('/user/agents/my')
  },
  // 创建新的 Agent
  create(data) {
    return api.post('/user/agents/my', data)
  },
  // 更新 Agent
  update(id, data) {
    return api.put(`/user/agents/my/${id}`, data)
  },
  // 删除 Agent
  delete(id) {
    return api.delete(`/user/agents/my/${id}`)
  },
  // 轮换 API Key
  rotateKey(id) {
    return api.post(`/user/agents/my/${id}/rotate-key`)
  }
}

// Agent 管理（获取可关联的 Agent 列表）
export const agentAPI = {
  // 获取所有可用的 Agent
  getAll() {
    return api.get('/agents')
  }
}

// Agent 日志 API
export const agentLogsAPI = {
  // 获取当前用户下所有 Agent 的接口调用日志
  // agentId: 可选，指定获取某个 Agent 的日志
  getLogs(limit = 100, agentId = null) {
    let url = `/agent/user/agents/logs?limit=${limit}`
    if (agentId) {
      url += `&agentId=${agentId}`
    }
    return api.get(url)
  }
}
