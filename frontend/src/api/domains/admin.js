// 管理域 API：statsAPI + usageAPI + tenantAPI + plansAPI + adminAPI + graphAgentPermissionAPI
import { api } from '../core.js'

// 统计 API - 首页展示数据
export const statsAPI = {
  // 获取全局统计数据
  getGlobalStats() {
    return api.get('/stats/global')
  }
}

// 使用量 API - 首页用户使用量统计
export const usageAPI = {
  // 获取当前用户的使用量
  getCurrent() {
    return api.get('/usage/current')
  },
  // 获取使用统计（基于后端真实数据）
  async getStats() {
    // 并行获取：用户使用量 + 全局统计（/api/stats/global 由后端统计缓存提供真实数据）
    const [usageRes, globalStatsRes] = await Promise.all([
      api.get('/usage/current').catch(() => null),
      api.get('/stats/global').catch(() => null)
    ])

    const usage = usageRes?.usage || {}
    const apiCalls = usage.api_calls || 0

    // TODO: 后端目前没有真实的月度调用趋势接口（/usage/current 的 api_calls 为占位值），
    // 因此月度明细只保留当前真实月份，趋势统一为 stable；
    // 后续后端提供 /api/usage/stats 之类的真实月度数据后，替换这里的 monthlyData 即可。
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const monthlyData = [
      { month: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`, calls: apiCalls }
    ]

    const totalApiCalls = monthlyData.reduce((sum, m) => sum + m.calls, 0)
    const averageApiCalls = Math.round(totalApiCalls / monthlyData.length)
    const maxApiCalls = Math.max(...monthlyData.map(m => m.calls))

    return {
      stats: {
        total_api_calls: totalApiCalls,
        average_api_calls: averageApiCalls,
        max_api_calls: maxApiCalls,
        trend: 'stable'
      },
      // 来自 /api/stats/global 的真实全局统计（接口失败时降级为 0，而不是伪造数据）
      users: globalStatsRes?.users ?? 0,
      graphs: globalStatsRes?.graphs ?? 0,
      nodes: globalStatsRes?.nodes ?? 0,
      edges: globalStatsRes?.edges ?? 0,
      databaseSize: globalStatsRes?.databaseSize ?? 0,
      updatedAt: globalStatsRes?.updatedAt ?? null
    }
  }
}

// 租户 API - SaaS 租户管理
export const tenantAPI = {
  // 获取当前租户信息
  getMe() {
    return api.get('/tenant/me')
  },
  // 获取订阅信息
  getSubscription() {
    return api.get('/tenant/subscription')
  },
  // 更改套餐
  changePlan(planId) {
    return api.post('/tenant/change-plan', { plan_id: planId })
  },
  // 取消订阅
  cancelSubscription() {
    return api.post('/tenant/cancel-subscription')
  }
}

// 套餐 API - SaaS 套餐管理
export const plansAPI = {
  // 获取所有可用套餐
  getAll() {
    return api.get('/plans')
  }
}

// 管理员 API - SaaS 后台管理
export const adminAPI = {
  // 获取所有租户
  getTenants() {
    return api.get('/admin/tenants')
  },
  // 获取单个租户
  getTenant(id) {
    return api.get(`/admin/tenants/${id}`)
  },
  // 暂停租户
  suspendTenant(id) {
    return api.post(`/admin/tenants/${id}/suspend`)
  },
  // 激活租户
  activateTenant(id) {
    return api.post(`/admin/tenants/${id}/activate`)
  },
  // 删除租户
  deleteTenant(id) {
    return api.delete(`/admin/tenants/${id}`)
  }
}

// 图谱 Agent 授权 API
export const graphAgentPermissionAPI = {
  // 获取图谱已授权的 Agent 列表
  getGraphAgents(graphId) {
    return api.get(`/graphs/${graphId}/agents`)
  },
  // 授权 Agent 访问图谱
  authorizeAgent(graphId, agentId, permission = 'read') {
    return api.post(`/graphs/${graphId}/agents`, { agent_id: agentId, permission })
  },
  // 更新 Agent 对图谱的权限
  updatePermission(graphId, agentId, permission) {
    return api.put(`/graphs/${graphId}/agents/${agentId}`, { permission })
  },
  // 撤销 Agent 对图谱的授权
  revokePermission(graphId, agentId) {
    return api.delete(`/graphs/${graphId}/agents/${agentId}`)
  }
}
