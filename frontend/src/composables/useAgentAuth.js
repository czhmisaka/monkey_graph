import { ref } from 'vue'
import api, { graphsAPI } from '../api'

/**
 * Agent 授权管理（AuthManagementModal）：图谱 ↔ Agent 的授权列表、授权、撤销、更新权限。
 */
export function useAgentAuth() {
  // Auth management state
  const showAgentAuthModal = ref(false)
  const authTab = ref('list')
  const selectedGraphForAuth = ref(null)
  const graphAuthList = ref([])
  const availableAgents = ref([])

  const loadAllGraphsAuth = async () => {
    try {
      const graphsData = await graphsAPI.getAll()

      // 1. 拉取可用 Agent 列表(仍单次)
      const agentsRes = await fetch('/api/agents', { credentials: 'include' })
      if (agentsRes.ok) availableAgents.value = await agentsRes.json()

      // 2. 批量获取所有图谱的授权(单次请求,替代 N+1)
      const graphIds = graphsData.map(g => g.id)
      const authMap = graphIds.length > 0
        ? await api.post('/graphs/agents/batch', { graphIds })
        : {}

      graphAuthList.value = graphsData.map(graph => ({
        graph,
        authorizations: authMap[graph.id] || []
      }))
    } catch (e) {
      console.error('加载图谱授权信息失败:', e)
    }
  }

  const openAuthManagementModal = async () => {
    showAgentAuthModal.value = true
    authTab.value = 'list'
    selectedGraphForAuth.value = null
    await loadAllGraphsAuth()
  }

  const openGraphAuthDetail = async (graph) => {
    selectedGraphForAuth.value = graph
    authTab.value = 'detail'
    await loadAllGraphsAuth()
  }

  const authorizeAgent = async (graphId, agentId, permission = 'read') => {
    try {
      const res = await fetch(`/api/graphs/${graphId}/agents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, permission })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '授权失败')
        return
      }
      await loadAllGraphsAuth()
      alert('授权成功')
    } catch (e) {
      alert('授权失败: ' + e.message)
    }
  }

  const revokeAgentAuth = async (graphId, agentId) => {
    if (!confirm('确定要撤销此 Agent 的访问权限吗？')) return
    try {
      const res = await fetch(`/api/graphs/${graphId}/agents/${agentId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '撤销失败')
        return
      }
      await loadAllGraphsAuth()
      alert('已撤销授权')
    } catch (e) {
      alert('撤销失败: ' + e.message)
    }
  }

  const updateAgentPermission = async (graphId, agentId, permission) => {
    try {
      const res = await fetch(`/api/graphs/${graphId}/agents/${agentId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '更新失败')
        return
      }
      await loadAllGraphsAuth()
      alert('权限已更新')
    } catch (e) {
      alert('更新失败: ' + e.message)
    }
  }

  return {
    showAgentAuthModal,
    authTab,
    selectedGraphForAuth,
    graphAuthList,
    availableAgents,
    openAuthManagementModal,
    openGraphAuthDetail,
    authorizeAgent,
    revokeAgentAuth,
    updateAgentPermission
  }
}
