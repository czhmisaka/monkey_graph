<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api, { tenantAPI, usageAPI, plansAPI, myAgentAPI } from '../api/index.js'
import SaasHeader from '../components/Layout/SaasHeader.vue'

const router = useRouter()
const loading = ref(true)
const error = ref(null)
const tenant = ref(null)
const subscription = ref(null)
const usage = ref(null)
const stats = ref(null)
const plans = ref([])
const showPlanModal = ref(false)
const selectedPlan = ref(null)
const changingPlan = ref(false)

// 刷新状态
const refreshing = ref(false)

// Agent 相关
const myAgents = ref([])    // 自己创建的 Agent

// 刷新数据
const refreshData = async () => {
  refreshing.value = true
  try {
    const [usageRes, myAgentsRes] = await Promise.all([
      usageAPI.getCurrent(),
      myAgentAPI.getAll().catch(() => [])
    ])
    usage.value = usageRes
    myAgents.value = myAgentsRes || []
  } catch (e) {
    console.error('刷新数据失败:', e)
  } finally {
    refreshing.value = false
  }
}

// 创建 Agent 表单
const newAgent = ref({
  name: '',
  description: ''
})
const creatingAgent = ref(false)
const showCreateAgentModal = ref(false)

// 编辑 Agent
const editingAgent = ref(null)
const showEditAgentModal = ref(false)
const updatingAgent = ref(false)

// 显示 API Key
const showApiKey = ref(null)

// 图谱授权相关统计
const graphAuthStats = ref({
  totalGraphs: 0,
  authorizedAgents: 0,
  totalAuthorizations: 0
})

// ========== 图谱授权管理弹窗相关 ==========
const showAgentAuthModal = ref(false)  // 授权管理弹窗
const authTab = ref('list')  // 'list' | 'detail'
const selectedGraphForAuth = ref(null)
const graphAuthList = ref([])  // 所有图谱的授权信息
const availableAgents = ref([])  // 可用的 Agent 列表

// 获取所有图谱的授权信息
const loadAllGraphsAuth = async () => {
  try {
    // 获取用户的所有图谱
    const graphsRes = await fetch('/api/graphs', { credentials: 'include' })
    if (!graphsRes.ok) {
      console.error('获取图谱失败:', graphsRes.status)
      return
    }
    const graphsData = await graphsRes.json()
    console.log('图谱数据:', graphsData)
    
    // 获取用户创建的所有 Agent
    const agentsRes = await fetch('/api/user/agents/my', { headers })
    if (!agentsRes.ok) {
      console.error('获取 Agent 失败:', agentsRes.status)
    } else {
      availableAgents.value = await agentsRes.json()
      console.log('Agent 数据:', availableAgents.value)
    }
    
    // 批量获取每个图谱的授权信息(单次请求,替代 N+1)
    const authMap = graphsData.length > 0
      ? await api.post('/graphs/agents/batch', { graphIds: graphsData.map(g => g.id) })
      : {}

    graphAuthList.value = graphsData.map(graph => ({
      graph,
      authorizations: authMap[graph.id] || []
    }))
    console.log('最终授权列表:', graphAuthList.value)
  } catch (e) {
    console.error('加载图谱授权信息失败:', e)
  }
}

// 打开授权管理弹窗
const openAuthManagementModal = async () => {
  showAgentAuthModal.value = true
  authTab.value = 'list'
  selectedGraphForAuth.value = null
  await loadAllGraphsAuth()
}

// 打开图谱的授权详情
const openGraphAuthDetail = async (graph) => {
  selectedGraphForAuth.value = graph
  authTab.value = 'detail'
  await loadAllGraphsAuth()
}

// 授权 Agent 访问图谱
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
    // 刷新授权列表
    await loadAllGraphsAuth()
    // 刷新统计
    await loadGraphAuthStats()
    alert('授权成功')
  } catch (e) {
    alert('授权失败: ' + e.message)
  }
}

// 撤销 Agent 授权
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
    // 刷新授权列表
    await loadAllGraphsAuth()
    // 刷新统计
    await loadGraphAuthStats()
    alert('已撤销授权')
  } catch (e) {
    alert('撤销失败: ' + e.message)
  }
}

// 更新 Agent 权限
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
    // 刷新授权列表
    await loadAllGraphsAuth()
    alert('权限已更新')
  } catch (e) {
    alert('更新失败: ' + e.message)
  }
}

// 获取图谱授权统计
const loadGraphAuthStats = async () => {
  try {
    // 获取用户的所有图谱
    const graphsRes = await fetch('/api/graphs', { headers })
    const graphs = graphsRes.ok ? await graphsRes.json() : []
    
    // 获取用户创建的所有 Agent
    const agentsRes = await fetch('/api/user/agents/my', { headers })
    const agents = agentsRes.ok ? await agentsRes.json() : []
    
    // 统计已授权的 Agent 总数 - 实际需要获取每个图谱的授权
    let totalAuth = 0
    if (Array.isArray(graphs)) {
      for (const graph of graphs) {
        try {
          const authRes = await fetch(`/api/graphs/${graph.id}/agents`, { headers })
          if (authRes.ok) {
            const auths = await authRes.json()
            totalAuth += Array.isArray(auths) ? auths.length : 0
          }
        } catch (e) {
          // 忽略错误，继续下一个
        }
      }
    }
    
    graphAuthStats.value = {
      totalGraphs: Array.isArray(graphs) ? graphs.length : 0,
      authorizedAgents: Array.isArray(agents) ? agents.filter(a => a.is_active === 1).length : 0,
      totalAuthorizations: totalAuth
    }
    console.log('图谱授权统计:', graphAuthStats.value)
  } catch (e) {
    console.error('加载图谱授权统计失败:', e)
  }
}

// 打开授权管理弹窗（替代跳转）
const goToGraphAuth = () => {
  openAuthManagementModal()
}

onMounted(async () => {
  try {
    const [tenantRes, usageRes, statsRes, plansRes, myAgentsRes, globalStatsRes] = await Promise.all([
      tenantAPI.getMe().catch(() => ({ tenant: { name: '默认租户', slug: 'default', status: 'active' } })),
      usageAPI.getCurrent(),
      usageAPI.getStats().catch(() => null),
      plansAPI.getAll(),
      myAgentAPI.getAll().catch(() => []),
      fetch('/api/stats/global').then(r => r.json()).catch(() => null)
    ])
    
    tenant.value = tenantRes.tenant
    usage.value = usageRes
    stats.value = statsRes
    plans.value = plansRes.plans || []
    myAgents.value = myAgentsRes || []
    
    // 存储数据库大小
    if (globalStatsRes && globalStatsRes.databaseSize) {
      usage.value.databaseSize = globalStatsRes.databaseSize
    }
    
    try {
      subscription.value = (await tenantAPI.getSubscription()).subscription
    } catch (e) {}
    
    // 加载图谱授权统计
    await loadGraphAuthStats()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

// 创建 Agent
const createAgent = async () => {
  if (!newAgent.value.name) return
  creatingAgent.value = true
  try {
    const result = await myAgentAPI.create({
      name: newAgent.value.name,
      description: newAgent.value.description
    })
    // 刷新列表
    const agents = await myAgentAPI.getAll()
    myAgents.value = agents || []
    showCreateAgentModal.value = false
    // 显示 API Key
    if (result.agent?.api_key) {
      showApiKey.value = result.agent.api_key
    }
    newAgent.value = { name: '', description: '' }
  } catch (e) {
    error.value = e.message
  } finally {
    creatingAgent.value = false
  }
}

// 编辑 Agent
const openEditAgent = (agent) => {
  editingAgent.value = { ...agent }
  showEditAgentModal.value = true
}

const updateAgent = async () => {
  if (!editingAgent.value) return
  updatingAgent.value = true
  try {
    await myAgentAPI.update(editingAgent.value.id, {
      name: editingAgent.value.name,
      description: editingAgent.value.description,
      is_active: editingAgent.value.is_active
    })
    // 刷新列表
    const agents = await myAgentAPI.getAll()
    myAgents.value = agents || []
    showEditAgentModal.value = false
    editingAgent.value = null
  } catch (e) {
    error.value = e.message
  } finally {
    updatingAgent.value = false
  }
}

// 删除 Agent
const deleteAgent = async (agent) => {
  if (!confirm(`确定要删除 Agent "${agent.name}" 吗？此操作不可恢复。`)) return
  try {
    await myAgentAPI.delete(agent.id)
    myAgents.value = myAgents.value.filter(a => a.id !== agent.id)
  } catch (e) {
    error.value = e.message
  }
}

// 轮换 API Key
const rotateAgentKey = async (agent) => {
  if (!confirm(`确定要轮换 "${agent.name}" 的 API Key 吗？旧的 Key 将立即失效。`)) return
  try {
    const result = await myAgentAPI.rotateKey(agent.id)
    showApiKey.value = result.api_key
  } catch (e) {
    error.value = e.message
  }
}


const getUsagePercent = (used, limit) => {
  if (limit === -1) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

const formatNumber = (num) => {
  if (num === -1) return '∞'
  return num?.toLocaleString() || '0'
}

// 格式化字节大小
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatPrice = (price) => {
  if (price === 0) return '免费'
  return `¥${price}`
}

const currentPlanInfo = computed(() => {
  return plans.value.find(p => p.slug === (usage.value?.plan?.toLowerCase() || 'free'))
})

const changePlan = async () => {
  if (!selectedPlan.value) return
  changingPlan.value = true
  try {
    await tenantAPI.changePlan(selectedPlan.value.id)
    const [tenantRes, usageRes] = await Promise.all([
      tenantAPI.getMe(),
      usageAPI.getCurrent()
    ])
    tenant.value = tenantRes.tenant
    usage.value = usageRes
    showPlanModal.value = false
    selectedPlan.value = null
  } catch (e) {
    error.value = e.message
  } finally {
    changingPlan.value = false
  }
}

const cancelSubscription = async () => {
  if (!confirm('确定要取消订阅吗？')) return
  try {
    await tenantAPI.cancelSubscription()
    const [tenantRes, usageRes] = await Promise.all([
      tenantAPI.getMe(),
      usageAPI.getCurrent()
    ])
    tenant.value = tenantRes.tenant
    usage.value = usageRes
  } catch (e) {
    error.value = e.message
  }
}

const goToGraph = () => {
  router.push('/graph')
}
</script>

<template>
  <div class="dashboard-page">
    <SaasHeader />
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="error" class="error-message">
      <p>{{ error }}</p>
      <button @click="error = null">重试</button>
    </div>

    <div v-else class="dashboard-content">
      <div class="dashboard-grid">
        
        <!-- 账户信息 - 跨2列 -->
        <section class="card card-span-2 card-account">
          <div class="card-header">
            <span class="card-icon">👤</span>
            <h3>账户信息</h3>
          </div>
          <div class="card-body">
            <div class="info-row">
              <div class="info-col">
                <span class="label">租户名称</span>
                <span class="value">{{ tenant?.name }}</span>
              </div>
              <div class="info-col">
                <span class="label">租户标识</span>
                <span class="value slug">{{ tenant?.slug }}</span>
              </div>
            </div>
            <div class="info-row">
              <div class="info-col">
                <span class="label">账户状态</span>
                <span class="value status" :class="tenant?.status">{{ tenant?.status === 'active' ? '活跃' : tenant?.status }}</span>
              </div>
              <div class="info-col">
                <span class="label">当前套餐</span>
                <span class="value plan">{{ usage?.plan || '免费版' }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 使用量 - 跨2列 -->
        <section class="card card-span-2 card-usage">
          <div class="card-header">
            <span class="card-icon">📊</span>
            <h3>使用量</h3>
            <span class="period">{{ usage?.period }}</span>
            <button class="refresh-btn" @click="refreshData" :disabled="refreshing">
              {{ refreshing ? '↻' : '🔄' }}
            </button>
          </div>
          <div class="card-body">
            <div class="usage-grid">
              <div class="usage-item">
                <div class="usage-header">
                  <span class="label">API</span>
                  <span class="value">{{ formatNumber(usage?.usage?.api_calls) }} <span class="limit">/ {{ formatNumber(usage?.quota?.api_quota) }}</span></span>
                </div>
                <div class="progress-bar">
                  <div class="progress" :style="{ width: getUsagePercent(usage?.usage?.api_calls, usage?.quota?.api_quota) + '%' }" :class="{ warning: getUsagePercent(usage?.usage?.api_calls, usage?.quota?.api_quota) > 80 }"></div>
                </div>
              </div>
              <div class="usage-item">
                <div class="usage-header">
                  <span class="label">图谱</span>
                  <span class="value">{{ usage?.usage?.graphs || 0 }} <span class="limit">/ {{ formatNumber(usage?.quota?.graphs_limit) }}</span></span>
                </div>
                <div class="progress-bar">
                  <div class="progress" :style="{ width: getUsagePercent(usage?.usage?.graphs, usage?.quota?.graphs_limit) + '%' }"></div>
                </div>
              </div>
              <div class="usage-item">
                <div class="usage-header">
                  <span class="label">节点</span>
                  <span class="value">{{ usage?.usage?.nodes || 0 }} <span class="limit">/ {{ formatNumber(usage?.quota?.nodes_limit) }}</span></span>
                </div>
                <div class="progress-bar">
                  <div class="progress" :style="{ width: getUsagePercent(usage?.usage?.nodes, usage?.quota?.nodes_limit) + '%' }"></div>
                </div>
              </div>
              <div class="usage-item">
                <div class="usage-header">
                  <span class="label">存储</span>
                  <span class="value">{{ usage?.databaseSize ? formatBytes(usage.databaseSize) : '0 B' }}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress" style="width: 5%"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 统计 -->
        <section class="card card-stats">
          <div class="card-header">
            <span class="card-icon">📈</span>
            <h3>统计</h3>
          </div>
          <div class="card-body">
            <div class="stat-grid">
              <div class="stat-item">
                <span class="stat-value">{{ formatNumber(stats?.stats?.total_api_calls) }}</span>
                <span class="stat-label">总调用</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ formatNumber(stats?.stats?.average_api_calls) }}</span>
                <span class="stat-label">月均</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ formatNumber(stats?.stats?.max_api_calls) }}</span>
                <span class="stat-label">单月最高</span>
              </div>
              <div class="stat-item">
                <span class="stat-value trend" :class="stats?.stats?.trend">{{ stats?.stats?.trend === 'increasing' ? '↑' : stats?.stats?.trend === 'decreasing' ? '↓' : '→' }}</span>
                <span class="stat-label">趋势</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 图谱授权管理 -->
        <section class="card card-graph-auth" @click="goToGraphAuth">
          <div class="card-header">
            <span class="card-icon">🔐</span>
            <h3>图谱授权</h3>
          </div>
          <div class="card-body">
            <div class="auth-stats">
              <div class="auth-stat-item">
                <span class="auth-stat-value">{{ graphAuthStats.totalGraphs }}</span>
                <span class="auth-stat-label">图谱数</span>
              </div>
              <div class="auth-stat-item">
                <span class="auth-stat-value">{{ graphAuthStats.authorizedAgents }}</span>
                <span class="auth-stat-label">活跃 Agent</span>
              </div>
              <div class="auth-stat-item">
                <span class="auth-stat-value">{{ graphAuthStats.totalAuthorizations }}</span>
                <span class="auth-stat-label">授权总数</span>
              </div>
            </div>
            <button class="auth-action-btn">
              <span>管理授权 →</span>
            </button>
          </div>
        </section>

        <!-- 快速操作 -->
        <section class="card card-actions">
          <div class="card-header">
            <span class="card-icon">⚡</span>
            <h3>操作</h3>
          </div>
          <div class="card-body">
            <button class="action-btn primary" @click="goToGraph">
              <span class="icon">🧠</span>
              <span class="text">进入图谱</span>
            </button>
            <button class="action-btn" @click="router.push('/dashboard/data')">
              <span class="icon">📊</span>
              <span class="text">数据管理</span>
            </button>
            <button class="action-btn" @click="showPlanModal = true">
              <span class="icon">💎</span>
              <span class="text">升级套餐</span>
            </button>
          </div>
        </section>

        <!-- 当前套餐 -->
        <section class="card card-plan">
          <div class="card-header">
            <span class="card-icon">💳</span>
            <h3>套餐</h3>
          </div>
          <div class="card-body">
            <div class="current-plan-info">
              <div class="plan-badge" :class="usage?.plan?.toLowerCase()">{{ usage?.plan || '免费版' }}</div>
              <div class="plan-price" v-if="currentPlanInfo">
                <span class="price">{{ formatPrice(currentPlanInfo.price_monthly) }}</span>
                <span class="period" v-if="currentPlanInfo.price_monthly > 0">/月</span>
              </div>
            </div>
            <div class="quota-mini">
              <div class="quota-mini-item">
                <span class="icon">📚</span>
                <span>{{ formatNumber(usage?.quota?.graphs_limit) }} 图谱</span>
              </div>
              <div class="quota-mini-item">
                <span class="icon">🔗</span>
                <span>{{ formatNumber(usage?.quota?.nodes_limit) }} 节点</span>
              </div>
              <div class="quota-mini-item">
                <span class="icon">🔌</span>
                <span>{{ formatNumber(usage?.quota?.api_quota) }} API</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 配额详情 - 跨2列 -->
        <section class="card card-span-2 card-quota">
          <div class="card-header">
            <span class="card-icon">🎯</span>
            <h3>配额</h3>
          </div>
          <div class="card-body">
            <div class="quota-grid">
              <div class="quota-item">
                <span class="icon">📚</span>
                <div class="quota-info">
                  <span class="label">图谱</span>
                  <span class="value">{{ formatNumber(usage?.quota?.graphs_limit) }}</span>
                </div>
              </div>
              <div class="quota-item">
                <span class="icon">🔗</span>
                <div class="quota-info">
                  <span class="label">节点</span>
                  <span class="value">{{ formatNumber(usage?.quota?.nodes_limit) }}</span>
                </div>
              </div>
              <div class="quota-item">
                <span class="icon">🔌</span>
                <div class="quota-info">
                  <span class="label">API</span>
                  <span class="value">{{ formatNumber(usage?.quota?.api_quota) }}</span>
                </div>
              </div>
              <div class="quota-item">
                <span class="icon">📸</span>
                <div class="quota-info">
                  <span class="label">快照</span>
                  <span class="value">{{ formatNumber(usage?.quota?.snapshots_limit) }}</span>
                </div>
              </div>
              <div class="quota-item">
                <span class="icon">🗂️</span>
                <div class="quota-info">
                  <span class="label">工作区</span>
                  <span class="value">{{ formatNumber(usage?.quota?.workspaces_limit) }}</span>
                </div>
              </div>
              <div class="quota-item">
                <span class="icon">💾</span>
                <div class="quota-info">
                  <span class="label">存储</span>
                  <span class="value">{{ usage?.quota?.storage_mb || 10 }}MB</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 我创建的 Agent -->
        <section class="card card-span-2 card-agents">
          <div class="card-header">
            <span class="card-icon">🤖</span>
            <h3>我的 API Agent</h3>
            <div class="header-actions">
              <button class="link-agent-btn" @click="router.push('/agents')">管理页面</button>
              <button class="create-agent-btn" @click="showCreateAgentModal = true">+ 创建 Agent</button>
              <button class="refresh-btn-sm" @click="refreshData" :disabled="refreshing">
                {{ refreshing ? '↻' : '🔄' }}
              </button>
            </div>
          </div>
          <div class="card-body">
            <div v-if="myAgents.length === 0" class="no-agents">
              <span class="empty-icon">🤖</span>
              <p>暂无创建的 Agent</p>
              <p class="hint">创建自己的 API Agent 以编程方式访问图谱</p>
            </div>
            <div v-else class="agents-list">
              <div v-for="agent in myAgents" :key="agent.id" class="agent-item">
                <div class="agent-info">
                  <span class="agent-name">{{ agent.name }}</span>
                  <span class="agent-desc">{{ agent.description || '无描述' }}</span>
                </div>
                <div class="agent-quota">
                  <span class="quota-label">已用</span>
                  <span class="quota-value">{{ agent.requests_used || 0 }}</span>
                </div>
                <div class="agent-status" :class="agent.is_active ? 'active' : 'inactive'">
                  {{ agent.is_active ? '正常' : '已禁用' }}
                </div>
                <div class="agent-actions">
                  <button class="action-btn-small" @click="openEditAgent(agent)">编辑</button>
                  <button class="action-btn-small" @click="rotateAgentKey(agent)">轮换 Key</button>
                  <button class="delete-btn" @click="deleteAgent(agent)">删除</button>
                </div>
              </div>
            </div>
          </div>
        </section>


      </div>
    </div>

    <!-- 套餐选择弹窗 -->
    <div v-if="showPlanModal" class="modal-overlay" @click.self="showPlanModal = false">
      <div class="modal">
        <h3>选择套餐</h3>
        <div class="plan-list">
          <div 
            v-for="plan in plans" 
            :key="plan.id"
            class="plan-option"
            :class="{ selected: selectedPlan?.id === plan.id, current: plan.slug === usage?.plan?.toLowerCase() }"
            @click="selectedPlan = plan"
          >
            <div class="plan-header">
              <div class="plan-name">{{ plan.name }}</div>
              <div class="plan-price">¥{{ plan.price_monthly }}/月</div>
            </div>
            <div class="plan-limits">
              <span>📚 {{ plan.graphs_limit === -1 ? '∞' : plan.graphs_limit }}</span>
              <span>🔗 {{ plan.nodes_limit === -1 ? '∞' : plan.nodes_limit.toLocaleString() }}</span>
              <span>🔌 {{ plan.api_quota === -1 ? '∞' : plan.api_quota.toLocaleString() }}</span>
            </div>
            <div v-if="plan.slug === usage?.plan?.toLowerCase()" class="current-badge">当前</div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showPlanModal = false">取消</button>
          <button 
            class="btn-primary" 
            :disabled="!selectedPlan || selectedPlan.slug === usage?.plan?.toLowerCase() || changingPlan"
            @click="changePlan"
          >
            {{ changingPlan ? '切换中...' : '确认升级' }}
          </button>
        </div>
      </div>
    </div>


    <!-- 创建 Agent 弹窗 -->
    <div v-if="showCreateAgentModal" class="modal-overlay" @click.self="showCreateAgentModal = false">
      <div class="modal">
        <h3>创建 API Agent</h3>
        <div class="form-group">
          <label>Agent 名称 *</label>
          <input v-model="newAgent.name" type="text" placeholder="例如: 我的图谱 API" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea v-model="newAgent.description" placeholder="可选描述" rows="2"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreateAgentModal = false">取消</button>
          <button 
            class="btn-primary" 
            :disabled="!newAgent.name || creatingAgent"
            @click="createAgent"
          >
            {{ creatingAgent ? '创建中...' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑 Agent 弹窗 -->
    <div v-if="showEditAgentModal" class="modal-overlay" @click.self="showEditAgentModal = false">
      <div class="modal">
        <h3>编辑 Agent</h3>
        <div class="form-group">
          <label>Agent 名称 *</label>
          <input v-model="editingAgent.name" type="text" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea v-model="editingAgent.description" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="editingAgent.is_active" type="checkbox" />
            启用此 Agent
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showEditAgentModal = false">取消</button>
          <button 
            class="btn-primary" 
            :disabled="!editingAgent.name || updatingAgent"
            @click="updateAgent"
          >
            {{ updatingAgent ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 显示 API Key 弹窗 -->
    <div v-if="showApiKey" class="modal-overlay" @click.self="showApiKey = null">
      <div class="modal">
        <h3>API Key 已创建</h3>
        <div class="api-key-display">
          <p class="warning-text">⚠️ 请妥善保存此 API Key，它只会显示一次！</p>
          <div class="api-key-box">
            <code>{{ showApiKey }}</code>
            <button class="copy-btn" @click="navigator.clipboard.writeText(showApiKey)">复制</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" @click="showApiKey = null">我已保存</button>
        </div>
      </div>
    </div>

    <!-- 授权管理弹窗 -->
    <div v-if="showAgentAuthModal" class="modal-overlay" @click.self="showAgentAuthModal = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>🤖 Agent 图谱授权管理</h3>
          <button class="btn-close" @click="showAgentAuthModal = false">×</button>
        </div>
        <div class="modal-body">
          <!-- 返回按钮 -->
          <div v-if="authTab === 'detail'" class="auth-back-btn">
            <button class="btn btn-sm" @click="authTab = 'list'; selectedGraphForAuth = null">
              ← 返回列表
            </button>
          </div>

          <!-- 列表视图：显示所有图谱的授权概览 -->
          <div v-if="authTab === 'list'" class="auth-list-view">
            <div v-if="graphAuthList.length === 0" class="empty-list">
              暂无图谱数据
            </div>
            <div 
              v-for="item in graphAuthList" 
              :key="item.graph.id" 
              class="auth-graph-item"
            >
              <div class="auth-graph-info">
                <span class="auth-graph-name">{{ item.graph.name }}</span>
                <span class="auth-graph-count">
                  已授权 {{ item.authorizations?.length || 0 }} 个 Agent
                </span>
              </div>
              <button class="btn btn-sm" @click="openGraphAuthDetail(item.graph)">
                管理授权 →
              </button>
            </div>
          </div>

          <!-- 详情视图：管理特定图谱的授权 -->
          <div v-if="authTab === 'detail' && selectedGraphForAuth" class="auth-detail-view">
            <h4 class="auth-detail-title">
              图谱: {{ selectedGraphForAuth.name }}
            </h4>
            
            <!-- 已授权的 Agent 列表 -->
            <div class="auth-section">
              <h5>已授权的 Agent</h5>
              <div v-if="!graphAuthList.find(g => g.graph.id === selectedGraphForAuth.id)?.authorizations?.length" class="empty-auth">
                暂无授权
              </div>
              <div 
                v-for="auth in graphAuthList.find(g => g.graph.id === selectedGraphForAuth.id)?.authorizations" 
                :key="auth.id"
                class="auth-item"
              >
                <div class="auth-item-info">
                  <span class="auth-agent-name">{{ auth.agent?.name || auth.agent_id }}</span>
                  <span class="auth-permission">{{ auth.permission === 'write' ? '可读写' : '只读' }}</span>
                </div>
                <div class="auth-item-actions">
                  <select 
                    :value="auth.permission" 
                    @change="updateAgentPermission(selectedGraphForAuth.id, auth.agent_id, $event.target.value)"
                    class="input-select-sm"
                  >
                    <option value="read">只读</option>
                    <option value="write">可读写</option>
                  </select>
                  <button 
                    class="btn btn-sm btn-danger" 
                    @click="revokeAgentAuth(selectedGraphForAuth.id, auth.agent_id)"
                  >
                    撤销
                  </button>
                </div>
              </div>
            </div>

            <!-- 可用的 Agent 列表 -->
            <div class="auth-section">
              <h5>授权新 Agent</h5>
              <div v-if="availableAgents.length === 0" class="empty-auth">
                暂无可用的 Agent
              </div>
              <div 
                v-for="agent in availableAgents" 
                :key="agent.id"
                class="auth-agent-item"
              >
                <div class="auth-agent-info">
                  <span class="auth-agent-name">{{ agent.name || agent.id }}</span>
                  <span class="auth-agent-desc">{{ agent.description || '无描述' }}</span>
                </div>
                <div class="auth-agent-actions">
                  <button 
                    class="btn btn-sm" 
                    @click="authorizeAgent(selectedGraphForAuth.id, agent.id, 'read')"
                  >
                    授权只读
                  </button>
                  <button 
                    class="btn btn-sm btn-primary" 
                    @click="authorizeAgent(selectedGraphForAuth.id, agent.id, 'write')"
                  >
                    授权读写
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAgentAuthModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  min-height: 100vh;
  padding: 80px 20px 40px;
  background: #f5f5f5;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
}

.card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: transform 0.2s, box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.card-span-2 {
  grid-column: span 2;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.card-icon {
  font-size: 1.2rem;
}

.card-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  flex: 1;
}

.period {
  font-size: 0.75rem;
  color: #999;
}

/* 刷新按钮 */
.refresh-btn {
  padding: 4px 10px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: auto;
}

.refresh-btn:hover {
  background: #eee;
  border-color: #FF4500;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn-sm {
  padding: 4px 8px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn-sm:hover {
  background: #eee;
  border-color: #FF4500;
}

.refresh-btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 账户信息 */
.info-row {
  display: flex;
  gap: 24px;
}

.info-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-col .label {
  font-size: 0.75rem;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-col .value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.info-col .value.slug {
  font-family: monospace;
  font-size: 0.9rem;
  color: #666;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 4px;
}

.info-col .value.status { color: #50C878; }
.info-col .value.plan { color: #FF4500; }

/* 使用量 */
.usage-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.usage-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.usage-header .label {
  font-size: 0.85rem;
  color: #666;
}

.usage-header .value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
}

.usage-header .value .limit {
  font-weight: 400;
  color: #999;
  font-size: 0.8rem;
}

.progress-bar {
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: linear-gradient(90deg, #FF4500, #FF6A33);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress.warning {
  background: linear-gradient(90deg, #F39C12, #F5B041);
}

/* 统计 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px 8px;
  background: #f9f9f9;
  border-radius: 8px;
}

.stat-value {
  display: block;
  font-size: 1.3rem;
  font-weight: 700;
  color: #FF4500;
}

.stat-value.trend { font-size: 1.5rem; }
.stat-value.trend.increasing { color: #E74C3C; }
.stat-value.trend.decreasing { color: #27AE60; }

.stat-label {
  font-size: 0.7rem;
  color: #999;
  text-transform: uppercase;
}

/* 图谱授权管理卡片 */
.card-graph-auth {
  cursor: pointer;
  border: 2px solid #9b59b6;
  background: linear-gradient(135deg, #f8f5fa 0%, #f0ecf5 100%);
}

.card-graph-auth:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(155, 89, 182, 0.3);
}

.card-graph-auth .card-icon {
  font-size: 1.4rem;
}

.card-graph-auth h3 {
  color: #8e44ad;
}

.auth-stats {
  display: flex;
  justify-content: space-around;
  padding: 12px 0;
}

.auth-stat-item {
  text-align: center;
}

.auth-stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #9b59b6;
}

.auth-stat-label {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
}

.auth-action-btn {
  width: 100%;
  padding: 10px;
  background: #9b59b6;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.auth-action-btn:hover {
  background: #8e44ad;
}

/* 操作 */
.card-actions .card-body { gap: 10px; }

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: 2px solid #eee;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: #FF4500;
  background: #FFF5F0;
}

.action-btn.primary {
  background: linear-gradient(135deg, #FF4500 0%, #FF6A33 100%);
  border-color: transparent;
  color: #fff;
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255,69,0,0.3);
}

.action-btn .icon { font-size: 1.2rem; }
.action-btn .text { font-weight: 600; font-size: 0.95rem; }

/* 套餐 */
.current-plan-info {
  text-align: center;
  margin-bottom: 12px;
}

.plan-badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 1rem;
  font-weight: 700;
  background: #eee;
  color: #666;
}

.plan-badge.free { background: #D5F5E3; color: #27AE60; }
.plan-badge.personal { background: #D4E6F1; color: #2980B9; }
.plan-badge.team { background: #FADBD8; color: #E74C3C; }
.plan-badge.enterprise { background: #F5EEF8; color: #8E44AD; }

.plan-price {
  margin-top: 8px;
}

.plan-price .price {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
}

.plan-price .period {
  font-size: 0.9rem;
  color: #999;
}

.quota-mini {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.quota-mini-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #666;
}

.quota-mini-item .icon { font-size: 1rem; }

/* 配额 */
.quota-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.quota-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 10px;
}

.quota-item .icon { font-size: 1.3rem; }

.quota-info {
  display: flex;
  flex-direction: column;
}

.quota-info .label {
  font-size: 0.7rem;
  color: #999;
  text-transform: uppercase;
}

.quota-info .value {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
}

/* 加载 */
.loading, .error-message { text-align: center; padding: 60px; }

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #eee;
  border-top-color: #FF4500;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.error-message { color: #E74C3C; }
.error-message button {
  margin-top: 16px;
  padding: 8px 24px;
  background: #FF4500;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal h3 {
  font-size: 1.3rem;
  margin-bottom: 20px;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.plan-option {
  padding: 16px;
  border: 2px solid #eee;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.plan-option:hover { border-color: #FF4500; }
.plan-option.selected { border-color: #FF4500; background: #FFF5F0; }
.plan-option.current { border-color: #27AE60; }

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.plan-name { font-weight: 700; color: #333; }
.plan-price { color: #FF4500; font-weight: 600; }

.plan-limits {
  display: flex;
  gap: 12px;
  font-size: 0.8rem;
  color: #666;
}

.current-badge {
  position: absolute;
  top: -8px;
  right: 12px;
  background: #27AE60;
  color: #fff;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.7rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-primary {
  background: #333;
  color: #fff;
  border: none;
}

.btn-primary:hover { background: #FF4500; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: #fff;
  color: #333;
  border: 2px solid #ddd;
}

.btn-secondary:hover { border-color: #FF4500; color: #FF4500; }

/* 响应式 */
@media (max-width: 1200px) {
  .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
  .card-span-2 { grid-column: span 2; }
}

@media (max-width: 768px) {
  .dashboard-grid { grid-template-columns: 1fr; }
  .card-span-2 { grid-column: span 1; }
  .quota-grid { grid-template-columns: repeat(2, 1fr); }
  .info-row { flex-direction: column; gap: 16px; }
}

/* Agent 管理样式 */
.card-agents, .card-linked-agents {
  grid-column: span 2;
}

.card-agents .card-header, .card-linked-agents .card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.create-agent-btn {
  padding: 6px 12px;
  background: #27AE60;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.create-agent-btn:hover {
  background: #219A52;
}

.link-agent-btn {
  padding: 6px 12px;
  background: #FF4500;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.link-agent-btn:hover {
  background: #E03E00;
}

.no-agents {
  text-align: center;
  padding: 30px 20px;
  color: #999;
}

.no-agents .empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 12px;
}

.no-agents p {
  margin: 0;
  font-size: 0.95rem;
}

.no-agents .hint {
  font-size: 0.8rem;
  color: #bbb;
  margin-top: 8px;
}

.agents-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: #f9f9f9;
  border-radius: 10px;
}

.agent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-weight: 600;
  color: #333;
}

.agent-role {
  font-size: 0.75rem;
  color: #999;
}

.agent-quota {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 12px;
  border-left: 1px solid #eee;
}

.agent-quota .quota-label {
  font-size: 0.7rem;
  color: #999;
}

.agent-quota .quota-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
}

.agent-status {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.agent-status.active {
  background: #D5F5E3;
  color: #27AE60;
}

.agent-status.inactive {
  background: #FADBD8;
  color: #E74C3C;
}

.agent-actions {
  display: flex;
  gap: 6px;
}

.action-btn-small {
  padding: 4px 8px;
  background: #3498DB;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn-small:hover {
  background: #2980B9;
}

.delete-btn {
  padding: 4px 8px;
  background: transparent;
  color: #E74C3C;
  border: 1px solid #E74C3C;
  border-radius: 4px;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: #E74C3C;
  color: #fff;
}

.unlink-btn {
  padding: 6px 12px;
  background: transparent;
  color: #E74C3C;
  border: 1px solid #E74C3C;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.unlink-btn:hover {
  background: #E74C3C;
  color: #fff;
}

/* Agent 选择弹窗 */
.agent-option {
  padding: 12px;
  border: 2px solid #eee;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 10px;
}

.agent-option:hover {
  border-color: #FF4500;
}

.agent-option.selected {
  border-color: #FF4500;
  background: #FFF5F0;
}

.agent-option-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.agent-option-name {
  font-weight: 600;
  color: #333;
}

.agent-option-desc {
  font-size: 0.8rem;
  color: #666;
  margin-top: 4px;
}

.role-select {
  margin-top: 16px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.role-select label {
  display: block;
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 8px;
}

.role-select select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  background: #fff;
}

/* 表单样式 */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 6px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #FF4500;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

/* API Key 显示 */
.api-key-display {
  margin: 20px 0;
}

.warning-text {
  color: #F39C12;
  font-size: 0.85rem;
  margin-bottom: 12px;
}

.api-key-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.api-key-box code {
  flex: 1;
  font-family: monospace;
  font-size: 0.85rem;
  word-break: break-all;
}

.copy-btn {
  padding: 6px 12px;
  background: #3498DB;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.copy-btn:hover {
  background: #2980B9;
}

/* 授权管理弹窗样式 */
.modal-lg {
  max-width: 600px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.btn-close:hover {
  color: #333;
}

.auth-back-btn {
  margin-bottom: 16px;
}

.auth-list-view {
  max-height: 400px;
  overflow-y: auto;
}

.auth-graph-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.auth-graph-item:hover {
  background: #f0f0f0;
}

.auth-graph-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-graph-name {
  font-weight: 600;
  color: #333;
}

.auth-graph-count {
  font-size: 12px;
  color: #666;
}

.auth-detail-view {
  max-height: 500px;
  overflow-y: auto;
}

.auth-detail-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.auth-section {
  margin-bottom: 20px;
}

.auth-section h5 {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.empty-auth {
  padding: 16px;
  text-align: center;
  color: #999;
  background: #f9f9f9;
  border-radius: 8px;
  font-size: 13px;
}

.auth-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 8px;
}

.auth-item-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auth-agent-name {
  font-weight: 500;
  color: #333;
}

.auth-permission {
  padding: 2px 8px;
  background: #9b59b6;
  color: white;
  border-radius: 12px;
  font-size: 11px;
}

.auth-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-select-sm {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  font-size: 12px;
}

.input-select-sm:focus {
  outline: none;
  border-color: #9b59b6;
}

.auth-agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.auth-agent-item:hover {
  border-color: #9b59b6;
}

.auth-agent-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-agent-info .auth-agent-name {
  font-weight: 600;
}

.auth-agent-desc {
  font-size: 12px;
  color: #666;
}

.auth-agent-actions {
  display: flex;
  gap: 8px;
}

/* 弹窗内按钮样式 */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-primary {
  background: #9b59b6;
  color: white;
}

.btn-primary:hover {
  background: #8e44ad;
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
}

.btn-secondary:hover {
  background: #eee;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fecaca;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  margin-top: 16px;
}
</style>
