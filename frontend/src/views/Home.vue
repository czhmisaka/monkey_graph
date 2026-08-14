<template>
  <div class="home">
    <!-- 顶部导航 -->
    <GraphToolbar
      v-model:currentGraphId="currentGraphId"
      :graphs="graphs"
      :nodes="graphData.nodes"
      :edges="graphData.edges"
      :currentUser="auth?.currentUser?.value"
      :llmConfigured="llmConfigured"
      :mcpStatus="mcpStatus"
      :exportLoading="exportLoading"
      @switch-graph="handleSwitchGraph"
      @open-share="openShareModal"
      @open-graph-manage="showGraphModal = true"
      @open-settings="openSettingsModal"
      @export-image="exportGraphAsImage"
      @open-profile="openProfileModal"
      @logout="handleLogout"
      @open-auth="openAuthModal('login')"
      @open-auth-management="openAuthManagementModal"
      @open-config="handleConfigClick"
      @undo="undo"
      @open-log-panel="showLogPanel = true"
    />

    <!-- 未登录引导卡片 -->
    <div v-if="!auth?.currentUser?.value" class="login-required">
      <div class="login-card">
        <div class="login-icon">◈</div>
        <h2>需要登录</h2>
        <p>登录后即可查看和管理您的知识图谱。</p>
        <div class="login-actions">
          <button class="btn btn-primary" @click="openAuthModal('login')">🔑 登录</button>
          <button class="btn btn-secondary" @click="openAuthModal('register')">✨ 注册</button>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <main v-else class="main-content">
      <!-- 左侧：图谱面板 -->
      <div class="panel-left">
        <!-- 动态渲染模式切换按钮 -->
        <div class="graph-mode-switcher">
          <button
            class="mode-btn"
            :class="{ active: graphMode === 'force' }"
            @click="switchGraphMode('force')"
            title="力导向图模式（适合 <4K 节点）"
          >
            🔗 力导向
          </button>
          <button
            class="mode-btn"
            :class="{ active: graphMode === 'radial' }"
            @click="switchGraphMode('radial')"
            title="原点模式（适合 4K+ 节点）"
          >
            ⚪ 原点模式
          </button>
          <button
            class="mode-btn mode-btn-three"
            :class="{ active: graphMode === 'three' }"
            @click="switchGraphMode('three')"
            title="3D 星云模式 - 连接数越多节点越亮"
          >
            🌐 3D视图
          </button>
        </div>
        <!-- 动态组件：根据 graphMode 选择渲染组件 -->
        <!-- 所有面板都使用流式加载模式，提高大数据量时的性能 -->
        <component
          :is="getGraphComponentByMode(graphMode)"
          ref="graphPanelRef"
          :nodes="graphData.nodes"
          :edges="graphData.edges"
          :settings="graphSettings"
          :streaming="true"
          :graphId="currentGraphId"
          @node-click="handleNodeClick"
          @edge-click="handleEdgeClick"
          @refresh="loadGraph"
          @settings-update="handleSettingsUpdate"
          @loaded="handleGraphLoaded"
        />
      </div>

      <!-- 右侧：对话面板 -->
      <div class="panel-right">
        <ChatPanel ref="chatPanelRef" :messages="messages" :loading="chatLoading" @send="sendMessage" @clear="clearChat"
          @cancel="cancelChat" />
      </div>
    </main>

    <!-- 搜索弹窗 -->
    <SearchModal
      v-if="showSearchModal"
      v-model="showSearchModal"
      :search-keyword="searchKeyword"
      :search-results="searchResults"
      :search-loading="searchLoading"
      :search-error="searchError"
      :use-semantic-search="useSemanticSearch"
      :embedding-status="embeddingStatus"
      :computing-embedding="computingEmbedding"
      :embedding-compute-message="embeddingComputeMessage"
      :embedding-compute-success="embeddingComputeSuccess"
      :clustering="clustering"
      :node-colors="nodeColors"
      :graph-settings="graphSettings"
      @update:searchKeyword="searchKeyword = $event"
      @execute-search="executeSearch"
      @view-node="viewSearchedNode"
      @compute-embeddings="computeEmbeddings"
      @open-cluster="openClusterModal"
      @search-mode-change="handleSearchModeChange"
    />

    <!-- 配置弹窗 -->
    <ConfigModal
      v-if="showConfigModal"
      v-model="showConfigModal"
      :config-form="configForm"
      @save="saveConfig"
    />

    <!-- 图谱管理弹窗 -->
    <GraphManageModal
      v-if="showGraphModal"
      v-model="showGraphModal"
      :graphs="graphs"
      :current-graph-id="currentGraphId"
      @create-graph="createGraph"
      @update-graph-name="saveGraphName"
      @duplicate-graph="duplicateGraph"
      @delete-graph="deleteGraph"
    />

    <!-- 节点详情弹窗 -->
    <NodeDetailModal
      v-if="showNodeModal"
      v-model="showNodeModal"
      :node-data="selectedNodeData"
      :related-edges="relatedEdges"
      :graph-nodes="graphData.nodes"
      :graph-edges="graphData.edges"
      :association-level="associationLevel"
      :node-colors="nodeColors"
      :graph-settings="graphSettings"
      @view-node="viewNodeDetail"
      @delete-node="deleteSelectedNode"
      @edge-hover="handleEdgeHover"
      @association-level-change="onAssociationLevelChange"
      @close="closeNodeModal"
    />

    <!-- 用户资料弹窗 -->
    <UserProfileModal
      v-if="showProfileModal"
      v-model="showProfileModal"
      :form="profileForm"
      :loading="profileLoading"
      @save="saveProfile"
    />

    <!-- 用户 LLM 配置弹窗 -->
    <UserLLMConfigModal
      v-if="showUserLLMConfigModal"
      v-model="showUserLLMConfigModal"
      :configs="userLLMConfigs"
      :loading="llmConfigLoading"
      @create="createLLMConfig"
      @activate="activateLLMConfig"
      @delete="deleteLLMConfig"
    />

    <!-- 图谱分享弹窗 -->
    <ShareModal
      v-if="showShareModal"
      v-model="showShareModal"
      :shares="graphShares"
      :allow-edit="shareForm.allow_edit"
      :loading="shareLoading"
      @create-share="createShare"
      @copy-share="copyShareLink"
      @delete-share="deleteShare"
      @update:allow-edit="shareForm.allow_edit = $event"
    />

    <!-- 图谱基础设定弹窗 -->
    <GraphSettingsModal
      v-if="showSettingsModal"
      v-model="showSettingsModal"
      :settings="graphSettings"
      @save="saveGraphSettings"
    />

    <!-- 日志面板弹窗 -->
    <LogPanelModal
      v-if="showLogPanel"
      v-model="showLogPanel"
      :execution-traces="messages"
    />

    <!-- 聚类分析弹窗 -->
    <ClusterModal
      v-if="showClusterModal"
      v-model="showClusterModal"
      :cluster-k="clusterK"
      :cluster-result="clusterResult"
      :clustering="clustering"
      :cluster-progress="clusterProgress"
      :node-count="graphData.nodes.length"
      :graph-nodes="graphData.nodes"
      :graph-edges="graphData.edges"
      :cluster-colors="clusterColors"
      @execute-clustering="executeClustering"
      @reset-cluster="resetCluster"
      @highlight-cluster="highlightClusterNodes"
      @clear-highlight="clearClusterHighlight"
      @focus-cluster="focusClusterInGraph"
      @view-node="viewSearchedNode"
    />

    <!-- 授权管理弹窗 -->
    <AuthManagementModal
      v-if="showAgentAuthModal"
      v-model="showAgentAuthModal"
      :auth-tab="authTab"
      :selected-graph="selectedGraphForAuth"
      :graph-auth-list="graphAuthList"
      :available-agents="availableAgents"
      @open-graph-detail="openGraphAuthDetail"
      @update-permission="updateAgentPermission"
      @revoke-auth="revokeAgentAuth"
      @authorize="authorizeAgent"
      @back-to-list="authTab = 'list'; selectedGraphForAuth = null"
    />

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ForceGraphPanel, RadialGraphPanel, ThreeGraphPanel } from '../components/graph'
import ChatPanel from '../components/Chat/ChatPanel.vue'

// Modal components
import SearchModal from '../components/modals/SearchModal.vue'
import ConfigModal from '../components/modals/ConfigModal.vue'
import GraphManageModal from '../components/modals/GraphManageModal.vue'
import NodeDetailModal from '../components/modals/NodeDetailModal.vue'
import UserProfileModal from '../components/modals/UserProfileModal.vue'
import UserLLMConfigModal from '../components/modals/UserLLMConfigModal.vue'
import ShareModal from '../components/modals/ShareModal.vue'
import GraphSettingsModal from '../components/modals/GraphSettingsModal.vue'
import LogPanelModal from '../components/modals/LogPanelModal.vue'
import ClusterModal from '../components/modals/ClusterModal.vue'
import AuthManagementModal from '../components/modals/AuthManagementModal.vue'

// Components
import GraphToolbar from '../components/GraphToolbar.vue'

// Composables
import { useAuth } from '../composables/useAuth'
import { useStreaming } from '../composables/useStreaming'
import { useClustering } from '../composables/useClustering'
import { useGraphSettings } from '../composables/useGraphSettings'
import { useMiniGraph } from '../composables/useMiniGraph'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'
import { useSearch } from '../composables/useSearch'
import { useExport } from '../composables/useExport'
import { useGraphManager } from '../composables/useGraphManager'
import { useChatSession } from '../composables/useChatSession'
import { useGraphOperations } from '../composables/useGraphOperations'
import api, { graphsAPI, graphAPI, configAPI, authAPI, userLLMConfigAPI, shareAPI, mcpAPI } from '../api'

// Emit
const emit = defineEmits(['settings-update'])

// Get route
const route = useRoute()
const router = useRouter()

// Use global auth
const auth = inject('auth')

// Graph manager
const {
  graphs,
  currentGraphId,
  graphMode,
  loadGraphs,
  loadGraphByRoute,
  switchGraphMode,
  createGraph: createGraphFn,
  saveGraphName: saveGraphNameFn,
  duplicateGraph: duplicateGraphFn,
  deleteGraph: deleteGraphFn
} = useGraphManager()

// Graph data
const graphData = reactive({ nodes: [], edges: [] })

// Graph panel ref
const graphPanelRef = ref(null)
const chatPanelRef = ref(null)

// Graph settings (needed first as other composables depend on it)
const {
  showSettingsModal,
  graphSettings,
  loadGraphSettings,
  saveGraphSettings: saveGraphSettingsApi,
  openSettingsModal: openSettingsModalFn
} = useGraphSettings(currentGraphId)

// Chat session - sendMessage wrapper to handle emit
const {
  messages,
  chatLoading,
  sendMessage: sendMessageFn,
  clearChat,
  cancelChat
} = useChatSession(currentGraphId, graphData, graphPanelRef, graphSettings)

const sendMessage = (messageData) => sendMessageFn(messageData, emit)

// Graph operations
const {
  nodeColors,
  showNodeModal,
  selectedNodeData,
  relatedEdges,
  associationLevel,
  getNodeColor,
  loadGraph,
  loadGraphNormal,
  undo,
  closeNodeModal,
  deleteSelectedNode,
  handleNodeClick: handleNodeClickFn,
  viewNodeDetail: viewNodeDetailFn,
  handleEdgeClick,
  handleSettingsUpdate
} = useGraphOperations(currentGraphId, graphData, graphPanelRef, graphSettings)

// LLM status
const llmConfigured = ref(false)
const mcpStatus = ref({ connected: false, degraded: false, message: 'MCP 未连接' })

// Export loading
const exportLoading = ref(false)

// Log panel
const showLogPanel = ref(false)

// Config modal
const showConfigModal = ref(false)
const configForm = reactive({
  apiKey: '',
  baseURL: '',
  model: ''
})

// Graph modal
const showGraphModal = ref(false)
const newGraphName = ref('')

// Profile modal
const showProfileModal = ref(false)
const profileForm = reactive({
  avatar: '',
  bio: ''
})
const profileLoading = ref(false)

// User LLM config modal
const showUserLLMConfigModal = ref(false)
const userLLMConfigs = ref([])
const llmConfigForm = reactive({
  provider: 'openai',
  api_key: '',
  base_url: '',
  model_name: 'gpt-4o'
})
const llmConfigLoading = ref(false)

// Share modal
const showShareModal = ref(false)
const graphShares = ref([])
const shareForm = reactive({
  allow_edit: false
})
const shareLoading = ref(false)

// Search
const showSearchModal = ref(false)
const searchKeyword = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const useSemanticSearch = ref(true)
const embeddingStatus = ref({ available: false, hasEmbeddings: false })
const searchError = ref('')
const computingEmbedding = ref(false)
const embeddingComputeMessage = ref('')
const embeddingComputeSuccess = ref(false)

// Clustering
const {
  showClusterModal,
  clustering,
  clusterK,
  clusterResult,
  clusterProgress,
  clusterColors,
  executeClustering,
  resetCluster,
  highlightClusterNodes,
  clearClusterHighlight,
  focusClusterInGraph
} = useClustering(graphData, graphPanelRef, currentGraphId, embeddingStatus)

// MiniGraph
const { renderMiniGraph } = useMiniGraph(
  graphData,
  selectedNodeData,
  associationLevel,
  getNodeColor
)

// Streaming
const { streamingProgress, handleGraphLoaded, handleStreamingBatch } = useStreaming(graphData, graphPanelRef)

// Export
const { exportGraphAsImage } = useExport(graphPanelRef, currentGraphId, graphs)

// Auth
const {
  isLoginMode,
  authForm,
  authFormLoading,
  authError,
  handleLogout: handleLogoutFn,
  submitAuth
} = useAuth()

// Auth management
const showAgentAuthModal = ref(false)
const authTab = ref('list')
const selectedGraphForAuth = ref(null)
const graphAuthList = ref([])
const availableAgents = ref([])

// MiniGraph D3 variables
let miniGraphSvg = null
let miniGraphG = null
let miniSimulation = null

// Graph component mapping
const getGraphComponentByMode = (mode) => {
  switch (mode) {
    case 'three':
      return ThreeGraphPanel
    case 'radial':
      return RadialGraphPanel
    case 'force':
    default:
      return ForceGraphPanel
  }
}

// Helper functions
const openSettingsModal = async () => {
  await loadGraphSettings()
  showSettingsModal.value = true
}

const saveGraphSettings = async () => {
  if (!currentGraphId.value) return
  try {
    await graphsAPI.updateSettings(currentGraphId.value, graphSettings.value)
    showSettingsModal.value = false
    emit('settings-update', graphSettings.value)
  } catch (error) {
    alert('保存配置失败: ' + error.message)
  }
}

const openShareModal = async () => {
  if (!currentGraphId.value) return
  try {
    graphShares.value = await shareAPI.getShares(currentGraphId.value)
  } catch (error) {
    graphShares.value = []
  }
  shareForm.allow_edit = false
  showShareModal.value = true
}

const loadGraphShares = async () => {
  if (!currentGraphId.value) return
  try {
    graphShares.value = await shareAPI.getShares(currentGraphId.value)
  } catch (error) {
    graphShares.value = []
  }
}

const createShare = async () => {
  if (!currentGraphId.value) return
  shareLoading.value = true
  try {
    await shareAPI.createShare(currentGraphId.value, { allow_edit: shareForm.allow_edit })
    await loadGraphShares()
    alert('分享链接已生成！')
  } catch (error) {
    alert('生成失败: ' + error.message)
  } finally {
    shareLoading.value = false
  }
}

const getShareUrl = (token) => {
  return `${window.location.origin}/share/${token}`
}

const copyShareLink = async (token) => {
  const url = getShareUrl(token)
  try {
    await navigator.clipboard.writeText(url)
    alert('链接已复制到剪贴板！')
  } catch {
    alert('复制失败，请手动复制')
  }
}

const deleteShare = async (shareId) => {
  if (!confirm('确定要取消这个分享吗？')) return
  if (!currentGraphId.value) return
  try {
    await shareAPI.deleteShare(currentGraphId.value, shareId)
    await loadGraphShares()
    alert('分享已取消！')
  } catch (error) {
    alert('取消失败: ' + error.message)
  }
}

// Graph CRUD operations
const createGraph = async (name) => {
  newGraphName.value = name || ''
  if (!newGraphName.value.trim()) {
    alert('图谱名称不能为空')
    return
  }
  try {
    const newGraph = await graphsAPI.create({ name: newGraphName.value })
    graphs.value.unshift(newGraph)
    router.push(`/graph/${newGraph.id}`)
    newGraphName.value = ''
    showGraphModal.value = false
  } catch (error) {
    alert('创建图谱失败: ' + error.message)
  }
}

const saveGraphName = async (graphId, name) => {
  if (!graphId || !name.trim()) {
    alert('图谱名称不能为空')
    return
  }
  try {
    await graphsAPI.update(graphId, { name })
    const graph = graphs.value.find(g => g.id === graphId)
    if (graph) {
      graph.name = name
    }
    if (currentGraphId.value === graphId) {
      await loadGraphNormal()
    }
  } catch (error) {
    alert('保存图谱名称失败: ' + error.message)
  }
}

const duplicateGraph = async (id) => {
  try {
    const newGraph = await graphsAPI.duplicate(id)
    graphs.value.unshift(newGraph)
    alert('图谱复制成功！')
  } catch (error) {
    alert('复制图谱失败: ' + error.message)
  }
}

const deleteGraph = async (id) => {
  if (!confirm('确定要删除这个图谱吗？此操作不可恢复。')) return
  try {
    await graphsAPI.delete(id)
    graphs.value = graphs.value.filter(g => g.id !== id)
    if (currentGraphId.value === id && graphs.value.length > 0) {
      router.push(`/graph/${graphs.value[0].id}`)
    }
  } catch (error) {
    alert('删除图谱失败: ' + error.message)
  }
}

// LLM/MCP status
const checkLLMStatus = async () => {
  try {
    const status = await configAPI.getLLMStatus()
    llmConfigured.value = status.configured
  } catch (error) {
    llmConfigured.value = false
  }
}

const checkMCPStatus = async () => {
  try {
    const status = await mcpAPI.getStatus()
    mcpStatus.value = status
  } catch (error) {
    mcpStatus.value = {
      connected: false,
      degraded: true,
      message: 'MCP 服务不可用'
    }
  }
}

const saveConfig = async () => {
  try {
    await configAPI.configureLLM(configForm)
    llmConfigured.value = true
    showConfigModal.value = false
  } catch (error) {
    alert('配置保存失败: ' + error.message)
  }
}

// Auth management functions
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

// Node detail functions
const handleNodeClick = (node) => {
  handleNodeClickFn(node, renderMiniGraph)
}

const viewNodeDetail = (nodeId) => {
  viewNodeDetailFn(nodeId, renderMiniGraph)
}

const handleEdgeHover = (edge, isHovering) => {
  // Mini graph edge hover handling - delegated to useMiniGraph
}

const onAssociationLevelChange = () => {
  nextTick(() => {
    renderMiniGraph()
  })
}

// Search functions
const {
  checkEmbeddingStatus,
  computeEmbeddings,
  executeSearch,
  handleSearchInput,
  viewSearchedNode: viewSearchedNodeFn
} = useSearch(currentGraphId, embeddingStatus, () => graphSettings.value?.nodeTypes ? graphSettings.value.nodeTypes : {})

const checkEmbeddingStatusFn = async () => {
  await checkEmbeddingStatus()
}

// 打开搜索弹窗（真实实现，供 Ctrl+F 快捷键等调用）
const openSearchModal = async () => {
  showSearchModal.value = true
  searchKeyword.value = ''
  searchResults.value = []
  searchError.value = ''
  // 同步 useSearch 内部状态并刷新向量嵌入状态
  await checkEmbeddingStatusFn()
}

const computeEmbeddingsFn = async () => {
  await computeEmbeddings()
}

const executeSearchFn = async () => {
  await executeSearch()
}

const handleSearchInputFn = () => {
  handleSearchInput()
}

const viewSearchedNode = (node) => {
  viewSearchedNodeFn(node)
  viewNodeDetail(node.id)
}

const handleSearchModeChange = () => {
  searchResults.value = []
  searchError.value = ''
  if (useSemanticSearch.value && !embeddingStatus.value.hasEmbeddings) {
    searchError.value = '当前图谱尚未计算向量，请先在对话中让 AI 分析文档或手动触发向量计算'
  }
}

// Open cluster modal
const openClusterModal = () => {
  if (!embeddingStatus.value.hasEmbeddings) {
    alert('请先计算向量再进行聚类分析')
    return
  }
  showClusterModal.value = true
  clusterResult.value = null
  const nodeCount = graphData.nodes.length
  clusterK.value = Math.min(Math.max(3, Math.floor(nodeCount / 5)), 10)
}

// Profile functions
const openProfileModal = async () => {
  if (!auth?.currentUser?.value) return
  profileForm.avatar = auth.currentUser.value.avatar || ''
  profileForm.bio = auth.currentUser.value.bio || ''
  showProfileModal.value = true
}

const saveProfile = async () => {
  profileLoading.value = true
  try {
    const response = await authAPI.updateProfile({
      avatar: profileForm.avatar,
      bio: profileForm.bio
    })
    if (auth?.currentUser) {
      auth.currentUser.value = { ...auth.currentUser.value, ...response.user }
    }
    showProfileModal.value = false
    alert('资料保存成功！')
  } catch (error) {
    alert('保存失败: ' + error.message)
  } finally {
    profileLoading.value = false
  }
}

// LLM config functions
const loadUserLLMConfigs = async () => {
  try {
    userLLMConfigs.value = await userLLMConfigAPI.getAll()
  } catch (error) {
    userLLMConfigs.value = []
  }
}

const openUserLLMConfigModal = async () => {
  await loadUserLLMConfigs()
  llmConfigForm.provider = 'openai'
  llmConfigForm.api_key = ''
  llmConfigForm.base_url = ''
  llmConfigForm.model_name = 'gpt-4o'
  showUserLLMConfigModal.value = true
}

const createLLMConfig = async (formData) => {
  // 修复：接收 UserLLMConfigModal 传来的 form data（之前错误地读 Home.vue 自己的 llmConfigForm，导致 api_key 永远空 → 直接 return）
  if (!formData?.api_key) return
  llmConfigLoading.value = true
  try {
    await userLLMConfigAPI.create({
      provider: formData.provider,
      api_key: formData.api_key,
      base_url: formData.base_url,
      model_name: formData.model_name,
      is_active: userLLMConfigs.value.length === 0
    })
    await loadUserLLMConfigs()
    alert('配置添加成功！')
    showUserLLMConfigModal.value = false  // 关闭弹窗
  } catch (error) {
    alert('添加配置失败: ' + error.message)
  } finally {
    llmConfigLoading.value = false
  }
}

const activateLLMConfig = async (id) => {
  try {
    await userLLMConfigAPI.update(id, { is_active: true })
    await loadUserLLMConfigs()
    alert('已设为默认配置！')
  } catch (error) {
    alert('设置失败: ' + error.message)
  }
}

const deleteLLMConfig = async (id) => {
  if (!confirm('确定要删除这个配置吗？')) return
  try {
    await userLLMConfigAPI.delete(id)
    await loadUserLLMConfigs()
    alert('配置已删除！')
  } catch (error) {
    alert('删除失败: ' + error.message)
  }
}

// Config click handler
const handleConfigClick = () => {
  if (auth?.currentUser?.value) {
    openUserLLMConfigModal()
  } else {
    showConfigModal.value = true
  }
}

// Auth modal
const showAuthModal = ref(false)

const openAuthModal = (mode = 'login') => {
  if (auth?.openAuthModal) {
    auth.openAuthModal(mode)
  } else {
    showAuthModal.value = true
    isLoginMode.value = mode === 'login'
  }
}

const handleLogout = () => {
  handleLogoutFn()
}

// Keyboard shortcuts
useKeyboardShortcuts({
  showSearchModal,
  showNodeModal,
  showConfigModal,
  showGraphModal,
  showSettingsModal,
  selectedNodeData,
  closeNodeModal,
  undo,
  openSearchModal,
  deleteSelectedNode
})

// 处理 GraphToolbar 的图谱切换事件
const handleSwitchGraph = (graphId) => {
  if (graphId && graphId !== currentGraphId.value) {
    router.push(`/graph/${graphId}`)
  }
}

// 兜底 watch — 即使直接修改 currentGraphId 也触发 loadGraph
watch(currentGraphId, async (newId) => {
  if (newId && route.params.id !== newId) {
    // 仅在路由未自动跳转时手动跳转（防止死循环）
    await nextTick()
    if (route.params.id !== newId) {
      router.push(`/graph/${newId}`)
    }
  }
})

// Watch route
watch(() => route.params.id, async (newId) => {
  if (newId) {
    currentGraphId.value = newId
    await loadGraph(streamingProgress, handleStreamingBatch)
  }
})

// Load graph
const loadGraphData = async () => {
  await loadGraph(streamingProgress, handleStreamingBatch)
  await loadGraphSettings()
}

// onMounted
onMounted(async () => {
  await new Promise(resolve => setTimeout(resolve, 100))

  if (!auth?.currentUser?.value) {
    showAuthModal.value = true
    isLoginMode.value = true
  } else {
    await loadGraphs()
    if (route.params.id) {
      currentGraphId.value = route.params.id
      await loadGraphData()
    }
  }

  checkLLMStatus()
  checkMCPStatus()
})
</script>

<style scoped>
.home {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.panel-left {
  flex: 1;
  border-right: 1px solid var(--color-gray-lighter);
  background: var(--color-white);
  position: relative;
}

.panel-right {
  width: 400px;
  flex-shrink: 0;
  background: var(--color-white);
}

/* 图谱渲染模式切换器 */
.graph-mode-switcher {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 100;
  display: flex;
  gap: 8px;
}

.mode-btn {
  padding: 8px 16px;
  background: var(--color-white);
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* 未登录引导卡片 */
.login-required {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  background: var(--color-bg);
}

.login-card {
  max-width: 420px;
  text-align: center;
  padding: 48px 32px;
  background: var(--color-white);
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-lg);
}

.login-icon {
  font-size: 48px;
  color: var(--color-primary);
  margin-bottom: 16px;
}

.login-card h2 {
  font-size: 22px;
  margin-bottom: 12px;
  color: var(--color-black);
}

.login-card p {
  color: var(--color-gray);
  margin-bottom: 24px;
  line-height: 1.6;
}

.login-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
