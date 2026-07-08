<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { myAgentAPI, agentLogsAPI, getCurrentUser } from '../api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const router = useRouter()
const agents = ref([])
const loading = ref(false)
const error = ref('')
const showCreateModal = ref(false)
const showKeyModal = ref(false)
const newApiKey = ref('')
const editingAgent = ref(null)
const showDocs = ref(false)
const isLoggedIn = ref(false)
const checkingAuth = ref(true)

// ========== Agent 日志相关状态 ==========
const showLogsModal = ref(false)
const currentLogAgent = ref(null)  // 当前查看日志的 Agent
const agentLogs = ref([])
const loadingLogs = ref(false)
const logsError = ref('')
const autoRefresh = ref(false)
let logsRefreshTimer = null

// 加载指定 Agent 的日志（保留旧数据，避免闪烁）
const loadAgentLogs = async (agentId) => {
  logsError.value = ''
  try {
    // 调用获取日志 API，传递 agentId 参数
    const result = await agentLogsAPI.getLogs(100, agentId)
    // 直接替换数据，不先清空，避免闪烁
    agentLogs.value = result.logs || []
  } catch (err) {
    logsError.value = err.message
    console.error('加载日志失败:', err)
  }
}

// 打开指定 Agent 的日志弹窗
const openAgentLogsModal = async (agent) => {
  currentLogAgent.value = agent
  showLogsModal.value = true
  await loadAgentLogs(agent.id)
}

// 关闭日志弹窗
const closeLogsModal = () => {
  showLogsModal.value = false
  currentLogAgent.value = null
  // 停止自动刷新
  if (autoRefresh.value) {
    autoRefresh.value = false
    if (logsRefreshTimer) {
      clearInterval(logsRefreshTimer)
      logsRefreshTimer = null
    }
  }
}

// 切换自动刷新
const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value && currentLogAgent.value) {
    // 每 3 秒刷新一次
    logsRefreshTimer = setInterval(() => loadAgentLogs(currentLogAgent.value.id), 3000)
  } else {
    if (logsRefreshTimer) {
      clearInterval(logsRefreshTimer)
      logsRefreshTimer = null
    }
  }
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  // 处理 SQLite 返回的日期格式 "YYYY-MM-DD HH:MM:SS"
  // 显式替换为空格分隔，JavaScript 会将其解析为本地时区
  const dateStr = timestamp.replace(' ', 'T')
  const date = new Date(dateStr)
  // 如果解析失败，直接返回原始字符串
  if (isNaN(date.getTime())) {
    return timestamp
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// 获取状态颜色
const getStatusColor = (status) => {
  if (!status) return 'unknown'
  if (status >= 200 && status < 300) return 'success'
  if (status >= 400 && status < 500) return 'warning'
  if (status >= 500) return 'error'
  return 'unknown'
}

// 获取 Agent 名称（从日志的 agent_id 关联）
const getAgentNameFromLog = (agentId) => {
  const agent = agents.value.find(a => a.id === agentId)
  return agent?.name || agentId?.substring(0, 8) || '未知'
}

// 操作类型映射（英文 -> 中文）
const operationTypeMap = {
  'create_nodes': '创建节点',
  'create_edges': '创建边',
  'create_graph': '创建图谱',
  'update_nodes': '更新节点',
  'delete_nodes': '批量删除节点',
  'delete_node': '删除节点',
  'delete_graph': '删除图谱',
  'read_graph': '读取图谱',
  'export_graph': '导出图谱',
  '': '-'
}

// 获取操作类型的中文描述
const getOperationTypeText = (operationType) => {
  return operationTypeMap[operationType] || operationType || '-'
}

// 获取操作类型的样式
const getOperationTypeClass = (operationType) => {
  if (!operationType) return ''
  if (operationType.includes('create')) return 'op-create'
  if (operationType.includes('update')) return 'op-update'
  if (operationType.includes('delete')) return 'op-delete'
  if (operationType.includes('read')) return 'op-read'
  if (operationType.includes('export')) return 'op-export'
  return ''
}

// ========== 图谱授权管理相关状态 ==========
const showAgentAuthModal = ref(false)  // 授权管理弹窗
const authTab = ref('list')  // 'list' | 'detail'
const selectedGraphForAuth = ref(null)
const graphAuthList = ref([])  // 所有图谱的授权信息
const availableAgents = ref([])  // 可用的 Agent 列表
const loadingAuthAgents = ref(false)

// 获取所有图谱的授权信息
const loadAllGraphsAuth = async () => {
  try {
    // 获取用户的所有图谱
    const graphsRes = await fetch('/api/graphs', { credentials: 'include' })
    const graphsData = await graphsRes.json()

    // 获取所有可用的 Agent
    const agentsRes = await fetch('/api/agents', { credentials: 'include' })
    availableAgents.value = await agentsRes.json()

    // 获取每个图谱的授权信息
    const authPromises = graphsData.map(async (graph) => {
      try {
        const authRes = await fetch(`/api/graphs/${graph.id}/agents`, { credentials: 'include' })
        const authData = await authRes.json()
        return {
          graph,
          authorizations: authData || []
        }
      } catch (e) {
        return {
          graph,
          authorizations: []
        }
      }
    })
    
    graphAuthList.value = await Promise.all(authPromises)
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

// 通过 agent_id 在 availableAgents 中查找 Agent 名称
const getAgentName = (agentId) => {
  const agent = availableAgents.value.find(a => a.id === agentId)
  return agent?.name || agentId || '未知Agent'
}

// 通过 agent_id 在 availableAgents 中查找 Agent 描述
const getAgentDesc = (agentId) => {
  const agent = availableAgents.value.find(a => a.id === agentId)
  return agent?.description || '无描述'
}

// 创建表单数据
const createForm = ref({
  name: '',
  description: ''
})

// OpenClaw 集成文档内容
const openclawDocs = `# OpenClaw 接入手册 - MonkeyGraph 知识图谱服务

本手册介绍如何将 MonkeyGraph 作为工具接入 OpenClaw，使 AI Agent 能够操作知识图谱。

---

## 快速开始

### 1. 创建 Agent

访问 MonkeyGraph 前端界面，创建您的 API Agent：

1. 打开浏览器访问：\`http://localhost:13002/agents\`
2. 登录您的账户
3. 点击"**+ 创建 Agent**"按钮
4. 填写 Agent 名称（例如：\`my-knowledge-agent\`）
5. 填写描述（可选）
6. 点击"创建"

### 2. 保存 API Key

创建成功后，弹窗会显示 API Key：
- **API Key 只显示一次！**
- 请立即复制并妥善保存
- 如果忘记保存，可以后续"轮换"生成新的 Key

### 3. 开始使用

使用获得的 API Key 即可调用 Agent API：

\`\`\`javascript
const API_KEY = '您的API Key'; // 从前端获取
const API_BASE = 'http://localhost:13001/api/agent';

// 调用示例：创建图谱
async function createGraph() {
  const response = await fetch(\`\${API_BASE}/graphs\`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': \`Agent \${API_KEY}\`
    },
    body: JSON.stringify({ 
      name: '公司员工图谱', 
      description: '记录公司员工信息' 
    })
  });
  return await response.json();
}
\`\`\`

---

## API 端点参考

### Agent 管理

| 功能 | 方法 | 路径 |
|------|------|------|
| 获取当前 Agent 信息 | GET | /api/agent/me |
| 更新 Agent 信息 | PUT | /api/agent/me |
| 轮换 API Key | POST | /api/agent/rotate-key |
| 获取配额使用情况 | GET | /api/agent/quota |

### 图谱操作

| 功能 | 方法 | 路径 |
|------|------|------|
| 获取图谱列表 | GET | /api/agent/graphs |
| 获取图谱详情 | GET | /api/agent/graphs/:id |
| 创建图谱 | POST | /api/agent/graphs |
| 删除图谱 | DELETE | /api/agent/graphs/:id |
| **导出全景图谱** | **GET** | **/api/agent/graphs/:id/export** |

### 节点操作

| 功能 | 方法 | 路径 |
|------|------|------|
| 创建节点 | POST | /api/agent/graphs/:graphId/nodes |
| 获取节点 | GET | /api/agent/graphs/:graphId/nodes/:nodeId |
| 更新节点 | PUT | /api/agent/graphs/:graphId/nodes/:nodeId |
| 删除节点 | DELETE | /api/agent/graphs/:graphId/nodes/:nodeId |
| 批量创建节点 | POST | /api/agent/graphs/:graphId/batch/nodes |
| 批量更新节点 | PUT | /api/agent/graphs/:graphId/batch/nodes |
| 批量删除节点 | DELETE | /api/agent/graphs/:graphId/batch/nodes |

### 边操作

| 功能 | 方法 | 路径 |
|------|------|------|
| 批量创建边 | POST | /api/agent/graphs/:graphId/batch/edges |

### 图算法

| 功能 | 方法 | 路径 |
|------|------|------|
| 度统计 | GET | /api/agent/graphs/:id/degrees |
| 邻居查询 | GET | /api/agent/graphs/:id/nodes/:nodeId/neighbors |
| 路径查找 | GET | /api/agent/graphs/:id/path |

### 向量检索（语义搜索）

| 功能 | 方法 | 路径 |
|------|------|------|
| 获取 Embedding 状态 | GET | /api/agent/graphs/:id/embedding/status |
| 计算所有节点 Embedding | POST | /api/agent/graphs/:id/embedding/compute |
| 语义搜索节点 | GET | /api/agent/graphs/:id/embedding/search |
| 获取相似节点 | GET | /api/agent/graphs/:id/embedding/similar/:nodeId |
| 聚类分析 | POST | /api/agent/graphs/:id/embedding/cluster |
| 删除所有 Embedding | DELETE | /api/agent/graphs/:id/embedding |

---

## 认证方式

所有 Agent API 使用 \`Authorization\` 头认证：

\`\`\`
Authorization: Agent your-api-key
\`\`\`

**注意**：API Key 只在注册时返回一次，请妥善保存！

---

## 错误处理

所有错误响应格式：

\`\`\`json
{
  "error": "错误信息"
}
\`\`\`

常见错误：
- \`401\` - API Key 无效或过期
- \`403\` - 权限不足
- \`404\` - 图谱或节点不存在
- \`429\` - 请求频率超限

---

## 注意事项

1. **API Key 管理**：注册后务必保存 API Key，只返回一次
2. **批量限制**：单次批量操作最多 500 条
3. **配额限制**：默认月度配额 100000 次请求
4. **导出图片**：导出接口返回 PNG 格式图片，需要处理 blob 响应
5. **向量检索**：需要先调用计算 embedding 接口

---

## 相关链接

- MonkeyGraph 项目：https://github.com/monkeygraph
- OpenClaw 项目：https://github.com/openclaw
- 本文档版本：1.3.0
- 更新日期：2026/3/11
`

// 渲染 Markdown (DOMPurify 净化以防 XSS)
const renderedDocs = computed(() => {
  const raw = marked.parse(openclawDocs.value || '')
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','ul','ol','li','code','pre','blockquote','a','strong','em','table','thead','tbody','tr','th','td','hr','br'],
    ALLOWED_ATTR: ['href','title'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
  })
})

// 检查登录状态 — 调 /auth/me 校验 httpOnly cookie
const checkAuth = async () => {
  checkingAuth.value = true
  try {
    const res = await authAPI.getCurrentUser()
    if (res?.user) {
      isLoggedIn.value = true
    } else {
      isLoggedIn.value = false
      error.value = '请先登录后再访问 Agent 管理页面'
    }
  } catch {
    isLoggedIn.value = false
    error.value = '请先登录后再访问 Agent 管理页面'
  } finally {
    checkingAuth.value = false
  }
}

// 跳转到登录
const goToLogin = () => {
  router.push('/')
}

// 加载用户的 Agent 列表
const loadAgents = async () => {
  // 先检查登录状态
  if (!isLoggedIn.value) {
    if (!getCurrentUser()) {
      error.value = '请先登录后再访问 Agent 管理页面'
      loading.value = false
      return
    }
    isLoggedIn.value = true
  }
  
  loading.value = true
  error.value = ''
  try {
    agents.value = await myAgentAPI.getAll()
  } catch (err) {
    // 如果是 401 未授权，可能是 token 过期
    if (err.message.includes('未授权') || err.message.includes('401')) {
      error.value = '登录已过期，请重新登录'
    } else {
      error.value = err.message
    }
  } finally {
    loading.value = false
  }
}

// 创建新 Agent
const createAgent = async () => {
  if (!createForm.value.name.trim()) {
    error.value = 'Agent 名称不能为空'
    return
  }
  
  loading.value = true
  error.value = ''
  try {
    const result = await myAgentAPI.create({
      name: createForm.value.name,
      description: createForm.value.description
    })
    
    // API Key 只显示一次（后端返回结构：{ success: true, agent: { api_key: ... }, message: ... }）
    newApiKey.value = result.agent?.api_key || result.api_key
    showKeyModal.value = true
    showCreateModal.value = false
    
    // 重置表单
    createForm.value = { name: '', description: '' }
    
    // 刷新列表
    await loadAgents()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// 编辑 Agent
const editAgent = (agent) => {
  editingAgent.value = { ...agent }
}

// 保存编辑
const saveEdit = async () => {
  if (!editingAgent.value.name.trim()) {
    error.value = 'Agent 名称不能为空'
    return
  }
  
  loading.value = true
  error.value = ''
  try {
    await myAgentAPI.update(editingAgent.value.id, {
      name: editingAgent.value.name,
      description: editingAgent.value.description,
      is_active: editingAgent.value.is_active
    })
    editingAgent.value = null
    await loadAgents()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// 删除 Agent
const deleteAgent = async (id) => {
  if (!confirm('确定要删除这个 Agent 吗？此操作不可恢复。')) {
    return
  }
  
  loading.value = true
  error.value = ''
  try {
    await myAgentAPI.delete(id)
    await loadAgents()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// 轮换 API Key
const rotateKey = async (id) => {
  if (!confirm('确定要轮换 API Key 吗？新的 Key 只会显示一次，旧的 Key 将立即失效。')) {
    return
  }
  
  loading.value = true
  error.value = ''
  try {
    const result = await myAgentAPI.rotateKey(id)
    newApiKey.value = result.api_key
    showKeyModal.value = true
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// 复制 API Key + OpenClaw 文档
const copyApiKey = () => {
  // 在文档开头添加 API Key 信息
  const apiKeyInfo = `# ========================================
# MonkeyGraph API Key
# ========================================
API_KEY = "${newApiKey.value}"
API_BASE = "http://localhost:13001/api/agent"

# ========================================
# OpenClaw 接入手册
# ========================================

${openclawDocs}`
  
  navigator.clipboard.writeText(apiKeyInfo)
  alert('API Key 和 OpenClaw 接入文档已复制到剪贴板')
}

// 关闭 Key 显示弹窗
const closeKeyModal = () => {
  showKeyModal.value = false
  newApiKey.value = ''
}

// 复制文档内容
const copyDocs = async () => {
  // 复制原始 markdown 内容
  await navigator.clipboard.writeText(openclawDocs)
  alert('文档内容已复制到剪贴板')
}

onMounted(() => {
  checkAuth()
  if (isLoggedIn.value) {
    loadAgents()
  }
})
</script>

<template>
  <div class="agent-management">
    <div class="page-header">
      <h1>🤖 Agent 管理</h1>
      <p class="subtitle">管理您的 API Agent，支持 API Key 轮换</p>
    </div>

    <!-- 加载中 -->
    <div v-if="checkingAuth" class="loading">
      检查登录状态...
    </div>

    <!-- 未登录提示 -->
    <div v-else-if="!isLoggedIn" class="not-logged-in">
      <div class="not-logged-in-icon">🔐</div>
      <h3>请先登录</h3>
      <p>访问 Agent 管理页面需要先登录您的账户</p>
      <button class="btn btn-primary" @click="goToLogin">
        前往登录
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-banner">
      {{ error }}
      <button @click="error = ''; if (isLoggedIn) loadAgents()">×</button>
    </div>

    <!-- 操作栏 -->
    <div v-if="isLoggedIn && !error" class="action-bar">
      <button class="btn btn-primary" @click="showCreateModal = true">
        + 创建 Agent
      </button>
      <button class="btn btn-secondary" @click="loadAgents" :disabled="loading">
        🔄 刷新
      </button>
      <button class="btn btn-auth" @click="openAuthManagementModal">
        🔐 图谱授权管理
      </button>
      <button class="btn btn-docs" @click="showDocs = true">
        📚 OpenClaw 接入手册
      </button>
    </div>

    <!-- Agent 列表 -->
    <div v-if="loading && agents.length === 0" class="loading">
      加载中...
    </div>

    <div v-else-if="agents.length === 0" class="empty-state">
      <div class="empty-icon">🤖</div>
      <h3>暂无 Agent</h3>
      <p>创建一个 Agent 来管理您的 API 访问</p>
      <button class="btn btn-primary" @click="showCreateModal = true">
        创建第一个 Agent
      </button>
    </div>

    <div v-else class="agent-list">
      <div v-for="agent in agents" :key="agent.id" class="agent-card">
        <div class="agent-header">
          <div class="agent-name">{{ agent.name }}</div>
          <div class="agent-status" :class="{ active: agent.is_active }">
            {{ agent.is_active ? '🟢 启用' : '🔴 禁用' }}
          </div>
        </div>
        
        <div class="agent-description">
          {{ agent.description || '暂无描述' }}
        </div>
        
        <div class="agent-info">
          <div class="info-item">
            <span class="label">API Key:</span>
            <span class="value">••••••••••••••••</span>
          </div>
          <div class="info-item">
            <span class="label">配额:</span>
            <span class="value">{{ agent.requests_used || 0 }} / {{ agent.monthly_quota || 100000 }}</span>
          </div>
          <div class="info-item">
            <span class="label">创建时间:</span>
            <span class="value">{{ new Date(agent.created_at).toLocaleDateString() }}</span>
          </div>
        </div>
        
        <div class="agent-actions">
          <button class="btn btn-sm" @click="editAgent(agent)">编辑</button>
          <button class="btn btn-sm" @click="rotateKey(agent.id)">🔑 轮换 Key</button>
          <button class="btn btn-sm btn-logs" @click="openAgentLogsModal(agent)">📊 日志</button>
          <button class="btn btn-sm btn-danger" @click="deleteAgent(agent.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 创建 Agent 弹窗 -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>创建 Agent</h3>
            <button class="btn-close" @click="showCreateModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Agent 名称 *</label>
              <input 
                v-model="createForm.name" 
                type="text" 
                class="input" 
                placeholder="例如: my-knowledge-agent"
              />
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea 
                v-model="createForm.description" 
                class="input textarea" 
                placeholder="描述这个 Agent 的用途"
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showCreateModal = false">取消</button>
            <button class="btn btn-primary" @click="createAgent" :disabled="loading">
              {{ loading ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 编辑 Agent 弹窗 -->
    <Teleport to="body">
      <div v-if="editingAgent" class="modal-overlay" @click.self="editingAgent = null">
        <div class="modal">
          <div class="modal-header">
            <h3>编辑 Agent</h3>
            <button class="btn-close" @click="editingAgent = null">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Agent 名称 *</label>
              <input 
                v-model="editingAgent.name" 
                type="text" 
                class="input" 
                placeholder="Agent 名称"
              />
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea 
                v-model="editingAgent.description" 
                class="input textarea" 
                placeholder="描述"
                rows="3"
              ></textarea>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="editingAgent.is_active"
                />
                启用此 Agent
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="editingAgent = null">取消</button>
            <button class="btn btn-primary" @click="saveEdit" :disabled="loading">
              {{ loading ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- API Key 显示弹窗 -->
    <Teleport to="body">
      <div v-if="showKeyModal" class="modal-overlay" @click.self="closeKeyModal">
        <div class="modal modal-key">
          <div class="modal-header">
            <h3>🎉 API Key 已创建</h3>
            <button class="btn-close" @click="closeKeyModal">×</button>
          </div>
          <div class="modal-body">
            <div class="key-warning">
              ⚠️ 请妥善保存您的 API Key，它只会显示一次！
            </div>
            <div class="key-display">
              <code>{{ newApiKey }}</code>
              <button class="btn btn-sm" @click="copyApiKey">复制</button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="closeKeyModal">我已保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 文档弹窗 -->
    <Teleport to="body">
      <div v-if="showDocs" class="modal-overlay" @click.self="showDocs = false">
        <div class="modal modal-docs">
          <div class="modal-header">
            <h3>📚 OpenClaw 接入手册</h3>
            <button class="btn-close" @click="showDocs = false">×</button>
          </div>
          <div class="modal-body docs-body">
            <div class="docs-content" v-html="renderedDocs"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="copyDocs">
              📋 复制文档
            </button>
            <button class="btn btn-primary" @click="showDocs = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 授权管理弹窗 -->
    <Teleport to="body">
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
                  :key="auth.agent_id"
                  class="auth-item"
                >
                  <div class="auth-item-info">
                    <span class="auth-agent-name">{{ getAgentName(auth.agent_id) }}</span>
                    <span class="auth-agent-desc">{{ getAgentDesc(auth.agent_id) }}</span>
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
    </Teleport>

    <!-- 日志弹窗 -->
    <Teleport to="body">
      <div v-if="showLogsModal" class="modal-overlay" @click.self="closeLogsModal">
        <div class="modal modal-logs">
          <div class="modal-header">
            <h3>📊 {{ currentLogAgent?.name || 'Agent' }} - API 调用日志</h3>
            <button class="btn-close" @click="closeLogsModal">×</button>
          </div>
          <div class="modal-body">
            <!-- 日志控制栏 -->
            <div class="logs-header">
              <div class="logs-header-left">
                <h4>最近 100 条调用记录</h4>
              </div>
              <div class="logs-controls">
                <label class="auto-refresh-toggle">
                  <input 
                    type="checkbox" 
                    :checked="autoRefresh" 
                    @change="toggleAutoRefresh"
                  />
                  自动刷新 (3秒)
                </label>
                <button class="btn btn-sm" @click="loadAgentLogs(currentLogAgent?.id)" :disabled="loadingLogs">
                  🔄 刷新
                </button>
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="logsError" class="logs-error">
              {{ logsError }}
            </div>

            <!-- 日志表格 -->
            <div class="logs-table-container">
              <div v-if="loadingLogs" class="log-empty">
                加载中...
              </div>
              <div v-else-if="agentLogs.length === 0" class="log-empty">
                暂无日志记录
              </div>
              <table v-else class="logs-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>方法</th>
                    <th>图谱</th>
                    <th>操作</th>
                    <th>状态</th>
                    <th>影响</th>
                    <th>耗时</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(log, index) in agentLogs" :key="index">
                    <td class="log-time">{{ formatTime(log.created_at) }}</td>
                    <td class="log-method">{{ log.method }}</td>
                    <td class="log-graph">
                      <span v-if="log.graph_name" class="graph-name" :title="log.graph_id">
                        {{ log.graph_name }}
                      </span>
                      <span v-else-if="log.graph_id" class="graph-id">
                        {{ log.graph_id.substring(0, 8) }}...
                      </span>
                      <span v-else class="log-na">-</span>
                    </td>
                    <td>
                      <span 
                        class="log-operation" 
                        :class="getOperationTypeClass(log.operation_type)"
                        :title="log.operation_type"
                      >
                        {{ getOperationTypeText(log.operation_type) }}
                      </span>
                    </td>
                    <td>
                      <span class="log-status" :class="getStatusColor(log.status_code)">
                        {{ log.status_code || '-' }}
                      </span>
                    </td>
                    <td class="log-nodes">
                      <span v-if="log.nodes_affected > 0" class="nodes-count">
                        {{ log.nodes_affected }} 个
                      </span>
                      <span v-else class="log-na">-</span>
                    </td>
                    <td class="log-duration">{{ log.response_time }}ms</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeLogsModal">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.agent-management {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.subtitle {
  color: #6B7280;
  margin: 0;
}

.error-banner {
  background: #FEE2E2;
  border: 1px solid #FECACA;
  color: #DC2626;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-banner button {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #DC2626;
}

.action-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-docs {
  background: #4F46E5;
  color: white;
}

.btn-docs:hover {
  background: #4338CA;
}

.btn-auth {
  background: #10B981;
  color: white;
}

.btn-auth:hover {
  background: #059669;
}

.docs-panel {
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  max-height: 600px;
  overflow-y: auto;
}

.docs-content {
  line-height: 1.6;
}

.docs-content :deep(h1) {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #111827;
}

.docs-content :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 24px 0 12px;
  color: #374151;
}

.docs-content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 16px 0 8px;
  color: #4B5563;
}

.docs-content :deep(p) {
  margin: 8px 0;
  color: #4B5563;
}

.docs-content :deep(ul), .docs-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.docs-content :deep(li) {
  margin: 4px 0;
  color: #4B5563;
}

.docs-content :deep(code) {
  background: #F3F4F6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.docs-content :deep(pre) {
  background: #1F2937;
  color: #F9FAFB;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 12px 0;
}

.docs-content :deep(pre code) {
  background: transparent;
  padding: 0;
  color: #F9FAFB;
}

.docs-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.docs-content :deep(th), .docs-content :deep(td) {
  border: 1px solid #E5E7EB;
  padding: 8px 12px;
  text-align: left;
}

.docs-content :deep(th) {
  background: #F9FAFB;
  font-weight: 600;
}

.docs-content :deep(hr) {
  border: none;
  border-top: 1px solid #E5E7EB;
  margin: 24px 0;
}

.docs-content :deep(strong) {
  font-weight: 600;
  color: #374151;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #FF4500;
  color: white;
}

.btn-primary:hover {
  background: #E03E00;
}

.btn-secondary {
  background: #F3F4F6;
  color: #374151;
}

.btn-secondary:hover {
  background: #E5E7EB;
}

.btn-danger {
  background: #FEE2E2;
  color: #DC2626;
}

.btn-danger:hover {
  background: #FECACA;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 48px;
  color: #6B7280;
}

.not-logged-in {
  text-align: center;
  padding: 64px 24px;
  background: #F9FAFB;
  border-radius: 12px;
}

.not-logged-in-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.not-logged-in h3 {
  margin: 0 0 8px 0;
  color: #374151;
}

.not-logged-in p {
  color: #6B7280;
  margin: 0 0 24px 0;
}

.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: #F9FAFB;
  border-radius: 12px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  color: #374151;
}

.empty-state p {
  color: #6B7280;
  margin: 0 0 24px 0;
}

.agent-list {
  display: grid;
  gap: 16px;
}

.agent-card {
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 20px;
  transition: box-shadow 0.2s;
}

.agent-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.agent-name {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.agent-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #FEE2E2;
  color: #DC2626;
}

.agent-status.active {
  background: #DCFCE7;
  color: #16A34A;
}

.agent-description {
  color: #6B7280;
  font-size: 14px;
  margin-bottom: 16px;
}

.agent-info {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 16px;
  background: #F9FAFB;
  border-radius: 8px;
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 12px;
  color: #6B7280;
}

.info-item .value {
  font-size: 14px;
  color: #374151;
  font-family: monospace;
}

.agent-actions {
  display: flex;
  gap: 8px;
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
  z-index: 9999;
}

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-key {
  max-width: 520px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #E5E7EB;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6B7280;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #E5E7EB;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #FF4500;
  box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.1);
}

.textarea {
  resize: vertical;
  min-height: 80px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
}

.key-warning {
  background: #FEF3C7;
  border: 1px solid #FCD34D;
  color: #92400E;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.key-display {
  display: flex;
  gap: 12px;
  align-items: center;
}

.key-display code {
  flex: 1;
  background: #F3F4F6;
  padding: 12px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
}

/* 文档弹窗样式 */
.modal-docs {
  max-width: 800px;
  max-height: 80vh;
}

.modal-docs .docs-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 0;
}

.modal-docs .docs-content {
  padding: 0 20px;
}

.modal-docs .docs-content :deep(h1) {
  font-size: 20px;
}

.modal-docs .docs-content :deep(h2) {
  font-size: 16px;
}

.modal-docs .docs-content :deep(h3) {
  font-size: 14px;
}

/* 授权管理弹窗样式 */
.modal-lg {
  max-width: 600px;
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
  background: #F9FAFB;
  border-radius: 8px;
  margin-bottom: 8px;
}

.auth-graph-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-graph-name {
  font-weight: 600;
  color: #111827;
}

.auth-graph-count {
  font-size: 12px;
  color: #6B7280;
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
  border-bottom: 1px solid #E5E7EB;
}

.auth-section {
  margin-bottom: 20px;
}

.auth-section h5 {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.empty-auth {
  padding: 16px;
  text-align: center;
  color: #6B7280;
  background: #F9FAFB;
  border-radius: 8px;
  font-size: 13px;
}

.auth-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #F9FAFB;
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
  color: #111827;
}

.auth-permission {
  padding: 2px 8px;
  background: #FF4500;
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
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  background: white;
  font-size: 12px;
}

.input-select-sm:focus {
  outline: none;
  border-color: #FF4500;
}

.auth-agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  margin-bottom: 8px;
}

.auth-agent-item:hover {
  border-color: #FF4500;
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
  color: #6B7280;
}

.auth-agent-actions {
  display: flex;
  gap: 8px;
}

/* 日志按钮样式 */
.btn-logs {
  background: #6366F1;
  color: white;
}

.btn-logs:hover {
  background: #4F46E5;
}

/* 日志弹窗样式 */
.modal-logs {
  max-width: 900px;
  max-height: 80vh;
}

.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.logs-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.logs-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.agent-select {
  padding: 6px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  background: white;
  font-size: 13px;
  cursor: pointer;
}

.agent-select:focus {
  outline: none;
  border-color: #FF4500;
  box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.1);
}

.logs-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-refresh-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.auto-refresh-toggle input {
  width: 16px;
  height: 16px;
}

.logs-error {
  background: #FEE2E2;
  border: 1px solid #FECACA;
  color: #DC2626;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.logs-table-container {
  max-height: 500px;
  overflow-y: auto;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.logs-table th {
  background: #F9FAFB;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #E5E7EB;
  position: sticky;
  top: 0;
}

.logs-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #E5E7EB;
  color: #4B5563;
}

.logs-table tr:hover td {
  background: #F9FAFB;
}

.log-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.log-status.success {
  background: #DCFCE7;
  color: #16A34A;
}

.log-status.warning {
  background: #FEF3C7;
  color: #D97706;
}

.log-status.error {
  background: #FEE2E2;
  color: #DC2626;
}

.log-status.unknown {
  background: #F3F4F6;
  color: #6B7280;
}

.log-time {
  font-family: monospace;
  font-size: 12px;
  color: #6B7280;
}

.log-method {
  font-family: monospace;
  font-weight: 600;
}

.log-path {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.log-duration {
  font-family: monospace;
  font-size: 12px;
}

.log-graph {
  max-width: 150px;
}

.graph-name {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #374151;
  font-weight: 500;
}

.graph-id {
  font-family: monospace;
  font-size: 11px;
  color: #6B7280;
}

.log-operation {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.log-operation.op-create {
  background: #DCFCE7;
  color: #16A34A;
}

.log-operation.op-update {
  background: #DBEAFE;
  color: #2563EB;
}

.log-operation.op-delete {
  background: #FEE2E2;
  color: #DC2626;
}

.log-operation.op-read {
  background: #F3F4F6;
  color: #6B7280;
}

.log-operation.op-export {
  background: #FEF3C7;
  color: #D97706;
}

.log-nodes {
  text-align: center;
}

.nodes-count {
  display: inline-block;
  padding: 2px 8px;
  background: #EEF2FF;
  color: #4F46E5;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.log-na {
  color: #9CA3AF;
  font-size: 12px;
}

.log-empty {
  text-align: center;
  padding: 40px;
  color: #6B7280;
}
</style>
