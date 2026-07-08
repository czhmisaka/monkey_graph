<script setup>
import { ref, onMounted } from 'vue'
import { plansAPI, adminAPI, agentAPI, userAgentAPI } from '../api/index.js'
import SaasHeader from '../components/Layout/SaasHeader.vue'

const loading = ref(true)
const error = ref(null)
const tenants = ref([])
const plans = ref([])
const selectedTenant = ref(null)
const showTenantModal = ref(false)

// Agent 管理相关
const agents = ref([])
const showAgentModal = ref(false)
const editingAgent = ref(null)
const agentForm = ref({
  name: '',
  description: '',
  permissions: {
    graphs: ['read', 'write'],
    nodes: ['read', 'write', 'delete'],
    edges: ['read', 'write', 'delete']
  },
  rate_limit: 1000,
  monthly_quota: 100000,
  is_active: true
})
const agentUsers = ref([])
const showAgentUsersModal = ref(false)

// 当前激活的标签页
const activeTab = ref('tenants')

// 加载数据
onMounted(async () => {
  try {
    // 并行获取数据
    const [tenantsRes, plansRes, agentsRes] = await Promise.all([
      adminAPI.getTenants().catch(() => ({ tenants: [] })),
      plansAPI.getAll().catch(() => ({ plans: [] })),
      agentAPI.getAll().catch(() => [])
    ])
    
    tenants.value = tenantsRes.tenants || []
    plans.value = plansRes.plans || []
    agents.value = agentsRes || []
    
    // 加载图谱授权统计
    await loadGraphStats()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

// 获取套餐名称
const getPlanName = (planId) => {
  const plan = plans.value.find(p => p.id === planId)
  return plan?.name || planId
}

// 状态格式化
const formatStatus = (status) => {
  const statusMap = {
    'active': '正常',
    'suspended': '已暂停',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

// Agent 状态格式化
const formatAgentStatus = (isActive) => {
  return isActive ? '正常' : '已禁用'
}

// 查看租户详情
const viewTenant = async (tenant) => {
  try {
    const res = await adminAPI.getTenant(tenant.id)
    selectedTenant.value = res.tenant
    showTenantModal.value = true
  } catch (e) {
    error.value = e.message
  }
}

// 暂停租户
const suspendTenant = async (tenant) => {
  if (!confirm(`确定要暂停租户 "${tenant.name}" 吗？`)) return
  
  try {
    await adminAPI.suspendTenant(tenant.id)
    tenant.status = 'suspended'
  } catch (e) {
    error.value = e.message
  }
}

// 恢复租户
const activateTenant = async (tenant) => {
  try {
    await adminAPI.activateTenant(tenant.id)
    tenant.status = 'active'
  } catch (e) {
    error.value = e.message
  }
}

// 删除租户
const deleteTenant = async (tenant) => {
  if (!confirm(`确定要删除租户 "${tenant.name}" 吗？此操作不可恢复！`)) return
  
  try {
    await adminAPI.deleteTenant(tenant.id)
    tenants.value = tenants.value.filter(t => t.id !== tenant.id)
  } catch (e) {
    error.value = e.message
  }
}

// 打开新建 Agent 弹窗
const openNewAgentModal = () => {
  editingAgent.value = null
  agentForm.value = {
    name: '',
    description: '',
    permissions: {
      graphs: ['read', 'write'],
      nodes: ['read', 'write', 'delete'],
      edges: ['read', 'write', 'delete']
    },
    rate_limit: 1000,
    monthly_quota: 100000,
    is_active: true
  }
  showAgentModal.value = true
}

// 打开编辑 Agent 弹窗
const openEditAgentModal = (agent) => {
  editingAgent.value = agent
  agentForm.value = {
    name: agent.name,
    description: agent.description || '',
    permissions: agent.permissions || {
      graphs: ['read', 'write'],
      nodes: ['read', 'write', 'delete'],
      edges: ['read', 'write', 'delete']
    },
    rate_limit: agent.rate_limit || 1000,
    monthly_quota: agent.monthly_quota || 100000,
    is_active: agent.is_active === 1
  }
  showAgentModal.value = true
}

// 保存 Agent（新建或更新）
const saveAgent = async () => {
  try {
    if (editingAgent.value) {
      // 更新 Agent
      const res = await fetch(`/api/agent/admin/agents/${editingAgent.value.id}`, {
        method: 'PUT',
        credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentForm.value)
      })
      if (!res.ok) throw new Error('更新失败')
      const updated = await res.json()
      const index = agents.value.findIndex(a => a.id === editingAgent.value.id)
      if (index !== -1) {
        agents.value[index] = { ...agents.value[index], ...updated.agent }
      }
    } else {
      // 创建新 Agent
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentForm.value)
      })
      if (!res.ok) throw new Error('创建失败')
      const created = await res.json()
      agents.value.unshift(created.agent)
    }
    showAgentModal.value = false
  } catch (e) {
    error.value = e.message
  }
}

// 切换 Agent 状态
const toggleAgentStatus = async (agent) => {
  const newStatus = agent.is_active === 1 ? 0 : 1
  const action = newStatus === 1 ? '启用' : '禁用'
  if (!confirm(`确定要${action} Agent "${agent.name}" 吗？`)) return
  
  try {
    const res = await fetch(`/api/agent/admin/agents/${agent.id}`, {
      method: 'PUT',
      credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newStatus })
    })
    if (!res.ok) throw new Error(`${action}失败`)
    agent.is_active = newStatus
  } catch (e) {
    error.value = e.message
  }
}

// 查看 Agent 关联的用户
const viewAgentUsers = async (agent) => {
  try {
    // 通过用户关联接口获取（这里简化处理，实际应该查数据库）
    // 由于没有直接的 API，我们通过用户列表来查找
    await fetch('/api/auth/me', { credentials: 'include' })
    // 这里只是演示，实际需要后端提供查询接口
    agentUsers.value = []
    showAgentUsersModal.value = true
  } catch (e) {
    error.value = e.message
  }
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

// 格式化配额
const formatQuota = (used, total) => {
  if (!total || total === -1) return `${used} / 无限制`
  return `${used} / ${total}`
}

// 权限格式化
const formatPermissions = (perms) => {
  if (!perms) return '-'
  const result = []
  if (perms.graphs) result.push(`图谱: ${perms.graphs.join(', ')}`)
  if (perms.nodes) result.push(`节点: ${perms.nodes.join(', ')}`)
  if (perms.edges) result.push(`边: ${perms.edges.join(', ')}`)
  return result.join(' | ')
}

// 图谱授权相关统计
const graphStats = ref({
  totalGraphs: 0,
  authorizedAgents: 0,
  activeAgents: 0
})

// 获取图谱授权统计
const loadGraphStats = async () => {
  try {
    // 获取所有图谱
    const graphsRes = await fetch('/api/graphs', { credentials: 'include' })
    const graphs = await graphsRes.json()

    // 获取所有 Agent
    const agentsRes = await fetch('/api/agents', { credentials: 'include' })
    const agents = await agentsRes.json()
    
    graphStats.value = {
      totalGraphs: Array.isArray(graphs) ? graphs.length : 0,
      authorizedAgents: Array.isArray(agents) ? agents.length : 0,
      activeAgents: Array.isArray(agents) ? agents.filter(a => a.is_active === 1).length : 0
    }
  } catch (e) {
    console.error('加载图谱统计失败:', e)
  }
}

// 跳转到图谱授权管理
const goToGraphPermissions = (graphId) => {
  // 跳转到首页，让用户选择图谱进行授权管理
  window.location.href = '/?tab=graphs'
}
</script>

<template>
  <div class="admin-page">
    <SaasHeader />

    <header class="admin-header">
      <h1>管理后台</h1>
      <p>管理所有租户和系统配置</p>
    </header>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="error" class="error-message">
      <p>{{ error }}</p>
      <button @click="error = null">重试</button>
    </div>

    <div v-else class="admin-content">
      <!-- 统计概览 -->
      <section class="stats-overview">
        <div class="stat-card">
          <div class="stat-icon">🏢</div>
          <div class="stat-info">
            <span class="stat-value">{{ tenants.length }}</span>
            <span class="stat-label">总租户数</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-info">
            <span class="stat-value">{{ tenants.filter(t => t.status === 'active').length }}</span>
            <span class="stat-label">活跃租户</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <span class="stat-value">{{ tenants.filter(t => t.plan_id !== 'free').length }}</span>
            <span class="stat-label">付费租户</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-info">
            <span class="stat-value">{{ plans.length }}</span>
            <span class="stat-label">套餐数量</span>
          </div>
        </div>
        <!-- 图谱授权管理卡片 -->
        <div class="stat-card permission-card" @click="goToGraphPermissions">
          <div class="stat-icon">🔐</div>
          <div class="stat-info">
            <span class="stat-value">{{ graphStats.authorizedAgents }}</span>
            <span class="stat-label">已授权 Agent</span>
            <span class="stat-sub">图谱可见性管理</span>
          </div>
          <div class="stat-arrow">→</div>
        </div>
      </section>

      <!-- 租户列表 -->
      <section class="tenants-section">
        <div class="section-header">
          <h2>租户管理</h2>
        </div>

        <div class="tenants-table">
          <table>
            <thead>
              <tr>
                <th>租户名称</th>
                <th>标识</th>
                <th>套餐</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenant in tenants" :key="tenant.id">
                <td class="tenant-name">{{ tenant.name }}</td>
                <td>{{ tenant.slug }}</td>
                <td>
                  <span class="plan-badge">{{ getPlanName(tenant.plan_id) }}</span>
                </td>
                <td>
                  <span class="status-badge" :class="tenant.status">
                    {{ formatStatus(tenant.status) }}
                  </span>
                </td>
                <td>{{ formatDate(tenant.created_at) }}</td>
                <td class="actions">
                  <button class="btn-view" @click="viewTenant(tenant)">查看</button>
                  <button 
                    v-if="tenant.status === 'active'" 
                    class="btn-warning"
                    @click="suspendTenant(tenant)"
                  >
                    暂停
                  </button>
                  <button 
                    v-else 
                    class="btn-success"
                    @click="activateTenant(tenant)"
                  >
                    恢复
                  </button>
                  <button class="btn-danger" @click="deleteTenant(tenant)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 套餐管理 -->
      <section class="plans-section">
        <div class="section-header">
          <h2>套餐管理</h2>
        </div>

        <div class="plans-grid">
          <div v-for="plan in plans" :key="plan.id" class="plan-card">
            <h3>{{ plan.name }}</h3>
            <div class="plan-price">¥{{ plan.price_monthly }}/月</div>
            <ul class="plan-details">
              <li>图谱: {{ plan.graphs_limit === -1 ? '无限制' : plan.graphs_limit }}</li>
              <li>节点: {{ plan.nodes_limit === -1 ? '无限制' : plan.nodes_limit }}</li>
              <li>API: {{ plan.api_quota === -1 ? '无限制' : plan.api_quota }}</li>
              <li>Agent: {{ plan.agents_limit === -1 ? '无限制' : plan.agents_limit }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Agent 管理 -->
      <section class="agents-section">
        <div class="section-header">
          <h2>Agent 管理</h2>
          <button class="btn-primary" @click="openNewAgentModal">+ 新建 Agent</button>
        </div>

        <div class="agents-table">
          <table>
            <thead>
              <tr>
                <th>Agent 名称</th>
                <th>描述</th>
                <th>权限</th>
                <th>配额使用</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="agent in agents" :key="agent.id">
                <td class="agent-name">{{ agent.name }}</td>
                <td>{{ agent.description || '-' }}</td>
                <td class="permissions-cell">{{ formatPermissions(agent.permissions) }}</td>
                <td>{{ formatQuota(agent.requests_used, agent.monthly_quota) }}</td>
                <td>
                  <span class="status-badge" :class="agent.is_active === 1 ? 'active' : 'suspended'">
                    {{ formatAgentStatus(agent.is_active) }}
                  </span>
                </td>
                <td>{{ formatDate(agent.created_at) }}</td>
                <td class="actions">
                  <button class="btn-view" @click="openEditAgentModal(agent)">编辑</button>
                  <button 
                    class="btn-warning"
                    @click="toggleAgentStatus(agent)"
                  >
                    {{ agent.is_active === 1 ? '禁用' : '启用' }}
                  </button>
                  <button class="btn-info" @click="viewAgentUsers(agent)">关联用户</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- 租户详情弹窗 -->
    <div v-if="showTenantModal" class="modal-overlay" @click.self="showTenantModal = false">
      <div class="modal">
        <h3>租户详情</h3>
        
        <div v-if="selectedTenant" class="tenant-details">
          <div class="detail-row">
            <span class="label">租户名称</span>
            <span class="value">{{ selectedTenant.name }}</span>
          </div>
          <div class="detail-row">
            <span class="label">标识</span>
            <span class="value">{{ selectedTenant.slug }}</span>
          </div>
          <div class="detail-row">
            <span class="label">当前套餐</span>
            <span class="value">{{ getPlanName(selectedTenant.plan_id) }}</span>
          </div>
          <div class="detail-row">
            <span class="label">状态</span>
            <span class="value status-badge" :class="selectedTenant.status">
              {{ formatStatus(selectedTenant.status) }}
            </span>
          </div>
          <div class="detail-row">
            <span class="label">联系邮箱</span>
            <span class="value">{{ selectedTenant.contact_email || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="label">创建时间</span>
            <span class="value">{{ formatDate(selectedTenant.created_at) }}</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showTenantModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- Agent 新建/编辑弹窗 -->
    <div v-if="showAgentModal" class="modal-overlay" @click.self="showAgentModal = false">
      <div class="modal modal-large">
        <h3>{{ editingAgent ? '编辑 Agent' : '新建 Agent' }}</h3>
        
        <form @submit.prevent="saveAgent" class="agent-form">
          <div class="form-group">
            <label>Agent 名称 *</label>
            <input v-model="agentForm.name" type="text" placeholder="输入 Agent 名称" required />
          </div>
          
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="agentForm.description" placeholder="输入 Agent 描述" rows="2"></textarea>
          </div>
          
          <div class="form-group">
            <label>权限配置</label>
            <div class="permissions-config">
              <div class="permission-item">
                <span class="permission-label">图谱权限</span>
                <div class="checkbox-group">
                  <label><input type="checkbox" value="read" v-model="agentForm.permissions.graphs" /> 读取</label>
                  <label><input type="checkbox" value="write" v-model="agentForm.permissions.graphs" /> 写入</label>
                </div>
              </div>
              <div class="permission-item">
                <span class="permission-label">节点权限</span>
                <div class="checkbox-group">
                  <label><input type="checkbox" value="read" v-model="agentForm.permissions.nodes" /> 读取</label>
                  <label><input type="checkbox" value="write" v-model="agentForm.permissions.nodes" /> 写入</label>
                  <label><input type="checkbox" value="delete" v-model="agentForm.permissions.nodes" /> 删除</label>
                </div>
              </div>
              <div class="permission-item">
                <span class="permission-label">边权限</span>
                <div class="checkbox-group">
                  <label><input type="checkbox" value="read" v-model="agentForm.permissions.edges" /> 读取</label>
                  <label><input type="checkbox" value="write" v-model="agentForm.permissions.edges" /> 写入</label>
                  <label><input type="checkbox" value="delete" v-model="agentForm.permissions.edges" /> 删除</label>
                </div>
              </div>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>速率限制 (次/小时)</label>
              <input v-model.number="agentForm.rate_limit" type="number" min="1" />
            </div>
            <div class="form-group">
              <label>月度配额 (次)</label>
              <input v-model.number="agentForm.monthly_quota" type="number" min="0" placeholder="-1 表示无限制" />
            </div>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="agentForm.is_active" />
              启用 Agent
            </label>
          </div>
          
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAgentModal = false">取消</button>
            <button type="submit" class="btn-primary">{{ editingAgent ? '保存' : '创建' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Agent 关联用户弹窗 -->
    <div v-if="showAgentUsersModal" class="modal-overlay" @click.self="showAgentUsersModal = false">
      <div class="modal">
        <h3>关联用户</h3>
        <p class="modal-desc">查看关联到此 Agent 的用户列表（功能开发中）</p>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showAgentUsersModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  padding-top: 60px;
  background: var(--color-bg, #FAFAFA);
}

.admin-header {
  text-align: center;
  margin-bottom: 40px;
  padding-top: 40px;
}

.admin-header h1 {
  font-size: 2.5rem;
  color: var(--color-black, #000000);
  margin-bottom: 8px;
}

.admin-header p {
  color: var(--color-gray, #666666);
}

.loading {
  text-align: center;
  padding: 60px;
  color: var(--color-gray, #666666);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-gray-lighter, #CCCCCC);
  border-top-color: var(--color-primary, #FF4500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  text-align: center;
  padding: 40px;
  color: #ff6b6b;
}

.error-message button {
  margin-top: 16px;
  padding: 8px 24px;
  background: var(--color-primary, #FF4500);
  color: var(--color-white, #FFFFFF);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.admin-content {
  max-width: 1200px;
  margin: 0 auto;
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: var(--color-white, #FFFFFF);
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.stat-icon {
  font-size: 2rem;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--color-primary, #FF4500);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-gray, #666666);
}

/* 图谱授权管理卡片样式 */
.permission-card {
  cursor: pointer;
  border: 2px solid #9b59b6 !important;
  background: linear-gradient(135deg, #f8f5fa 0%, #f0ecf5 100%) !important;
  transition: all 0.3s ease;
}

.permission-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(155, 89, 182, 0.3) !important;
}

.permission-card .stat-icon {
  font-size: 2.2rem;
}

.permission-card .stat-value {
  color: #9b59b6;
}

.permission-card .stat-label {
  color: #8e44ad;
  font-weight: 600;
}

.permission-card .stat-sub {
  font-size: 0.75rem;
  color: var(--color-gray, #666666);
  margin-top: 4px;
}

.permission-card .stat-arrow {
  font-size: 1.5rem;
  color: #9b59b6;
  margin-left: auto;
  opacity: 0.7;
  transition: opacity 0.3s;
}

.permission-card:hover .stat-arrow {
  opacity: 1;
}

.tenants-section, .plans-section {
  background: var(--color-white, #FFFFFF);
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h2 {
  font-size: 1.3rem;
  color: var(--color-black, #000000);
}

.tenants-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--color-gray-lighter, #CCCCCC);
}

th {
  color: var(--color-gray, #666666);
  font-weight: 600;
  font-size: 0.875rem;
}

td {
  color: var(--color-black, #000000);
}

.tenant-name {
  font-weight: 600;
}

.plan-badge {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(255, 69, 0, 0.1);
  border-radius: 12px;
  font-size: 0.875rem;
  color: var(--color-primary, #FF4500);
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.875rem;
}

.status-badge.active {
  background: rgba(80, 200, 120, 0.15);
  color: #50C878;
}

.status-badge.suspended {
  background: rgba(243, 156, 18, 0.15);
  color: #F39C12;
}

.status-badge.cancelled {
  background: rgba(231, 76, 60, 0.15);
  color: #E74C3C;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions button {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-view {
  background: var(--color-black, #000000);
  color: var(--color-white, #FFFFFF);
}

.btn-view:hover {
  background: var(--color-primary, #FF4500);
}

.btn-warning {
  background: #F39C12;
  color: var(--color-white, #FFFFFF);
}

.btn-warning:hover {
  background: #E08E0B;
}

.btn-success {
  background: #50C878;
  color: var(--color-white, #FFFFFF);
}

.btn-success:hover {
  background: #45B369;
}

.btn-danger {
  background: #E74C3C;
  color: var(--color-white, #FFFFFF);
}

.btn-danger:hover {
  background: #C0392B;
}

.actions button:hover {
  opacity: 0.8;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.plan-card {
  background: var(--color-gray-lightest, #F5F5F5);
  border-radius: 12px;
  padding: 20px;
}

.plan-card h3 {
  color: var(--color-black, #000000);
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.plan-price {
  color: var(--color-primary, #FF4500);
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 16px;
}

.plan-details {
  list-style: none;
  padding: 0;
  margin: 0;
}

.plan-details li {
  color: var(--color-gray, #666666);
  font-size: 0.875rem;
  padding: 4px 0;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-white, #FFFFFF);
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
}

.modal h3 {
  font-size: 1.5rem;
  color: var(--color-black, #000000);
  margin-bottom: 20px;
}

.tenant-details {
  margin-bottom: 24px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-gray-lighter, #CCCCCC);
}

.detail-row .label {
  color: var(--color-gray, #666666);
}

.detail-row .value {
  color: var(--color-black, #000000);
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--color-white, #FFFFFF);
  color: var(--color-black, #000000);
  border: 2px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary:hover {
  background: var(--color-primary, #FF4500);
  border-color: var(--color-primary, #FF4500);
  color: var(--color-white, #FFFFFF);
}

/* Agent 管理样式 */
.agents-section {
  background: var(--color-white, #FFFFFF);
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.agents-table {
  overflow-x: auto;
}

.agent-name {
  font-weight: 600;
}

.permissions-cell {
  font-size: 0.85rem;
  color: var(--color-gray, #666666);
  max-width: 200px;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--color-primary, #FF4500);
  color: var(--color-white, #FFFFFF);
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover {
  background: #E03E00;
}

.btn-info {
  background: #3498DB;
  color: var(--color-white, #FFFFFF);
}

.btn-info:hover {
  background: #2980B9;
}

/* 表单样式 */
.agent-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-gray, #666666);
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 8px;
  font-size: 0.875rem;
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary, #FF4500);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* 权限配置 */
.permissions-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--color-gray-lightest, #F5F5F5);
  border-radius: 8px;
}

.permission-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.permission-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-black, #000000);
}

.checkbox-group {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--color-gray, #666666);
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  cursor: pointer;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--color-black, #000000);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* 大弹窗 */
.modal-large {
  max-width: 600px;
}

.modal-desc {
  color: var(--color-gray, #666666);
  font-size: 0.875rem;
  margin-bottom: 16px;
}
</style>
