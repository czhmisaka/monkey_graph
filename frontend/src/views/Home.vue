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
import { ref, reactive, onMounted, onUnmounted, watch, nextTick, inject, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ForceGraphPanel, RadialGraphPanel, ThreeGraphPanel } from '../components/graph'
import ChatPanel from '../components/Chat/ChatPanel.vue'

// Modal components（懒加载：打开时才加载，减小首屏 bundle）
const SearchModal = defineAsyncComponent(() => import('../components/modals/SearchModal.vue'))
const ConfigModal = defineAsyncComponent(() => import('../components/modals/ConfigModal.vue'))
const GraphManageModal = defineAsyncComponent(() => import('../components/modals/GraphManageModal.vue'))
const NodeDetailModal = defineAsyncComponent(() => import('../components/modals/NodeDetailModal.vue'))
const UserProfileModal = defineAsyncComponent(() => import('../components/modals/UserProfileModal.vue'))
const UserLLMConfigModal = defineAsyncComponent(() => import('../components/modals/UserLLMConfigModal.vue'))
const ShareModal = defineAsyncComponent(() => import('../components/modals/ShareModal.vue'))
const GraphSettingsModal = defineAsyncComponent(() => import('../components/modals/GraphSettingsModal.vue'))
const LogPanelModal = defineAsyncComponent(() => import('../components/modals/LogPanelModal.vue'))
const ClusterModal = defineAsyncComponent(() => import('../components/modals/ClusterModal.vue'))
const AuthManagementModal = defineAsyncComponent(() => import('../components/modals/AuthManagementModal.vue'))

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
import { useNodeDetail } from '../composables/useNodeDetail'
import { useProfile } from '../composables/useProfile'
import { useLLMConfigs } from '../composables/useLLMConfigs'
import { useGraphWorkspace } from '../composables/useGraphWorkspace'
import { useLLMStatus } from '../composables/useLLMStatus'
import { useAgentAuth } from '../composables/useAgentAuth'
import { graphsAPI } from '../api'

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
  switchGraphMode
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
  openSettingsModal
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

// Graph workspace：图谱 CRUD + 分享
const {
  showGraphModal,
  showShareModal,
  graphShares,
  shareForm,
  shareLoading,
  createGraph,
  saveGraphName,
  duplicateGraph,
  deleteGraph,
  openShareModal,
  createShare,
  copyShareLink,
  deleteShare
} = useGraphWorkspace({ graphs, currentGraphId, router, loadGraphNormal })

// Export loading
const exportLoading = ref(false)

// Log panel
const showLogPanel = ref(false)

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
  focusClusterInGraph,
  openClusterModal
} = useClustering(graphData, graphPanelRef, currentGraphId, embeddingStatus)

// MiniGraph
const { renderMiniGraph } = useMiniGraph(
  graphData,
  selectedNodeData,
  associationLevel,
  getNodeColor
)

// Node detail orchestration
const { handleNodeClick, viewNodeDetail, handleEdgeHover, onAssociationLevelChange } = useNodeDetail(
  handleNodeClickFn,
  viewNodeDetailFn,
  renderMiniGraph
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

// Profile
const {
  showProfileModal,
  profileForm,
  profileLoading,
  openProfileModal,
  saveProfile
} = useProfile(auth)

// User LLM config
const {
  showUserLLMConfigModal,
  userLLMConfigs,
  llmConfigLoading,
  openUserLLMConfigModal,
  createLLMConfig,
  activateLLMConfig,
  deleteLLMConfig
} = useLLMConfigs()

// LLM/MCP status + LLM 配置弹窗
const {
  llmConfigured,
  mcpStatus,
  showConfigModal,
  configForm,
  checkLLMStatus,
  checkMCPStatus,
  saveConfig,
  handleConfigClick
} = useLLMStatus(auth, openUserLLMConfigModal)

// Agent 授权管理
const {
  showAgentAuthModal,
  authTab,
  selectedGraphForAuth,
  graphAuthList,
  availableAgents,
  openAuthManagementModal,
  openGraphAuthDetail,
  updateAgentPermission,
  revokeAgentAuth,
  authorizeAgent
} = useAgentAuth()

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
