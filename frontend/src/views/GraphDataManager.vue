<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { graphsAPI, graphAPI } from '../api/index.js'
import { useToast } from '../composables/useToast.js'
import SaasHeader from '../components/Layout/SaasHeader.vue'

const router = useRouter()
const toast = useToast()

// ========== 状态 ==========
const loading = ref(true)
const loadingEdges = ref(false)
const error = ref(null)
const graphs = ref([])
const selectedGraphId = ref(null)

// ========== 节点数据（分页）==========
const nodes = ref([])
const totalNodes = ref(0)

// ========== 图谱中的所有节点类型（动态获取）==========
const availableTypes = ref([])

// ========== 边数据 ==========
const edges = ref([])

// ========== 搜索状态 ==========
const searchKeyword = ref('')
const searchType = ref('')

// ========== 分页状态 ==========
const currentPage = ref(1)
const pageSize = ref(20)

// ========== 排序状态 ==========
const sortField = ref('created_at')
const sortOrder = ref('desc')

// ========== 创建节点弹窗 ==========
const showCreateModal = ref(false)
const creatingNode = ref({
  label: '',
  type: 'default',
  properties: ''
})

// ========== 编辑节点 ==========
const editingNode = ref(null)
const showEditModal = ref(false)

// ========== 节点详情弹窗 ==========
const showNodeDetailModal = ref(false)
const currentDetailNode = ref(null)

// 打开节点详情
const openNodeDetail = (node) => {
  currentDetailNode.value = node
  showNodeDetailModal.value = true
}

// 关闭节点详情
const closeNodeDetail = () => {
  showNodeDetailModal.value = false
  currentDetailNode.value = null
}

// 获取节点关联的边列表(基于 edgeList computed,避免重复 O(n))
const getNodeRelatedEdges = (nodeId) => {
  return edgeList.value.filter(edge => {
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
    return sourceId === nodeId || targetId === nodeId
  })
}

// ========== 边管理 ==========
const showEdgeModal = ref(false)
const editingEdge = ref(null)

// ========== 计算属性 ==========
const totalPages = computed(() => Math.ceil(totalNodes.value / pageSize.value) || 1)

// 统计
const stats = computed(() => {
  const types = {}
  
  // 只统计当前页显示的节点的类型分布（用于标签筛选）
  nodes.value.forEach(node => {
    const type = node.type || 'default'
    if (!types[type]) {
      types[type] = { count: 0 }
    }
    types[type].count++
  })
  
  return {
    totalNodes: totalNodes.value,
    totalEdges: edges.value.length,
    typeCount: Object.keys(types).length,
    types
  }
})

// ========== API 方法 ==========

// 加载图谱列表
const loadGraphs = async () => {
  try {
    const data = await graphsAPI.getAll()
    graphs.value = data || []
    
    if (graphs.value.length > 0 && !selectedGraphId.value) {
      selectedGraphId.value = graphs.value[0].id
    }
  } catch (e) {
    console.error('加载图谱列表失败:', e)
    toast.error('加载图谱列表失败')
    error.value = '加载图谱列表失败'
  }
}

// 加载节点类型列表（动态获取）
const loadNodeTypes = async () => {
  if (!selectedGraphId.value) {
    availableTypes.value = []
    return
  }
  
  try {
    // 获取图谱的所有节点（不传分页参数），提取类型
    const result = await graphAPI.getNodes(selectedGraphId.value)
    const allNodes = result.nodes || result || []
    
    // 提取所有唯一类型
    const typesSet = new Set()
    allNodes.forEach(node => {
      if (node.type) {
        typesSet.add(node.type)
      }
    })
    
    availableTypes.value = Array.from(typesSet).sort()
  } catch (e) {
    console.error('加载节点类型失败:', e)
    availableTypes.value = []
  }
}

// 加载节点（分页）
const loadNodes = async () => {
  if (!selectedGraphId.value) {
    nodes.value = []
    totalNodes.value = 0
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    // 如果有搜索关键词，使用后端搜索接口
    if (searchKeyword.value.trim()) {
      const result = await graphAPI.searchNodes(selectedGraphId.value, searchKeyword.value)
      // 搜索结果暂不分页，全部显示（后端搜索已优化）
      nodes.value = result || []
      totalNodes.value = nodes.value.length
    } else {
      // 普通分页加载
      const result = await graphAPI.getNodes(selectedGraphId.value, {
        page: currentPage.value,
        limit: pageSize.value,
        type: searchType.value || undefined,
        sort: sortField.value,
        order: sortOrder.value
      })
      
      nodes.value = result.nodes || result
      totalNodes.value = result.pagination?.total || (Array.isArray(result) ? result.length : 0)
    }
  } catch (e) {
    console.error('加载节点失败:', e)
    toast.error('加载节点数据失败')
    error.value = '加载节点数据失败'
    nodes.value = []
    totalNodes.value = 0
  } finally {
    loading.value = false
  }
}

// 加载边数据
const loadEdges = async () => {
  if (!selectedGraphId.value) {
    edges.value = []
    return
  }
  
  loadingEdges.value = true
  try {
    edges.value = await graphAPI.getEdges(selectedGraphId.value)
  } catch (e) {
    console.error('加载边失败:', e)
    toast.error('加载边数据失败')
    edges.value = []
  } finally {
    loadingEdges.value = false
  }
}

// 监听图谱选择变化
watch(selectedGraphId, () => {
  if (selectedGraphId.value) {
    resetSearch()
    currentPage.value = 1
    loadNodes()
    loadNodeTypes() // 加载图谱的节点类型
    loadEdges()
  }
})

// 重置搜索
const resetSearch = () => {
  searchKeyword.value = ''
  searchType.value = ''
  currentPage.value = 1
}

// 执行搜索
const performSearch = () => {
  currentPage.value = 1
  loadNodes()
}

// 清除搜索
const clearSearch = () => {
  searchKeyword.value = ''
  searchType.value = ''
  currentPage.value = 1
  loadNodes()
}

// 高亮搜索关键词 - 返回分段数组,不拼接 HTML 字符串,避免 XSS
const highlightKeyword = (text) => {
  if (!text) return [{ text: '', highlight: false }]
  if (!searchKeyword.value.trim()) return [{ text: String(text), highlight: false }]
  const segments = []
  const kw = searchKeyword.value.trim()
  // 使用 split + 正则保留分隔符,避免 replace 注入风险
  const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, m.index), highlight: false })
    }
    segments.push({ text: m[0], highlight: true })
    lastIndex = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++  // 防零宽匹配死循环
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false })
  }
  return segments
}

// ========== 格式化方法 ==========

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatProperties = (props) => {
  if (!props || typeof props !== 'object') return '-'
  const keys = Object.keys(props)
  if (keys.length === 0) return '-'
  const firstKey = keys[0]
  const value = props[firstKey]
  return `${firstKey}: ${typeof value === 'object' ? JSON.stringify(value) : value}`
}

// ========== 节点 CRUD ==========

// 打开创建节点弹窗
const openCreateNode = () => {
  creatingNode.value = {
    label: '',
    type: 'default',
    properties: ''
  }
  showCreateModal.value = true
}

// 创建节点
const createNode = async () => {
  if (!creatingNode.value.label.trim()) {
    toast.warning('节点标签不能为空')
    return
  }
  
  let properties = {}
  if (creatingNode.value.properties.trim()) {
    try {
      properties = JSON.parse(creatingNode.value.properties)
    } catch (e) {
      toast.error('属性 JSON 格式错误')
      return
    }
  }
  
  try {
    await graphAPI.createNode(selectedGraphId.value, {
      label: creatingNode.value.label,
      type: creatingNode.value.type,
      properties
    })
    
    toast.success('节点创建成功！')
    showCreateModal.value = false
    await loadNodes()
    await loadEdges() // 更新边统计
  } catch (e) {
    toast.error('创建失败：' + e.message)
  }
}

// 打开编辑节点
const openEditNode = (node) => {
  editingNode.value = { 
    ...node,
    properties: node.properties ? JSON.stringify(node.properties, null, 2) : ''
  }
  showEditModal.value = true
}

// 保存节点编辑
const saveNodeEdit = async () => {
  if (!editingNode.value) return
  
  if (!editingNode.value.label.trim()) {
    toast.warning('节点标签不能为空')
    return
  }
  
  let properties = {}
  if (editingNode.value.properties && editingNode.value.properties.trim()) {
    try {
      properties = JSON.parse(editingNode.value.properties)
    } catch (e) {
      toast.error('属性 JSON 格式错误')
      return
    }
  }
  
  try {
    await graphAPI.updateNode(selectedGraphId.value, editingNode.value.id, {
      label: editingNode.value.label,
      type: editingNode.value.type,
      properties
    })
    
    toast.success('节点更新成功！')
    showEditModal.value = false
    editingNode.value = null
    await loadNodes()
  } catch (e) {
    toast.error('更新失败：' + e.message)
  }
}

// 删除节点
const deleteNode = async (node) => {
  if (!confirm(`确定要删除节点 "${node.label}" 吗？`)) return
  
  try {
    await graphAPI.deleteNode(selectedGraphId.value, node.id)
    toast.success('节点已删除')
    await loadNodes()
    await loadEdges() // 更新边统计
  } catch (e) {
    toast.error('删除失败：' + e.message)
  }
}

// ========== 边管理 ==========

// 边列表 (computed 缓存,O(n*m) 只在 nodes/edges 变化时重算一次)
const edgeList = computed(() => {
  return edges.value.map(edge => {
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
    const sourceNode = nodes.value.find(n => n.id === sourceId) || { label: sourceId }
    const targetNode = nodes.value.find(n => n.id === targetId) || { label: targetId }

    return {
      ...edge,
      sourceLabel: sourceNode.label || sourceId,
      targetLabel: targetNode.label || targetId
    }
  })
})

// 打开边详情
const openEdgeDetail = (edge) => {
  editingEdge.value = { 
    ...edge,
    properties: edge.properties ? JSON.stringify(edge.properties, null, 2) : ''
  }
}

// 关闭边详情
const closeEdgeDetail = () => {
  editingEdge.value = null
}

// 保存边编辑
const saveEdgeEdit = async () => {
  if (!editingEdge.value) return
  
  let properties = {}
  if (editingEdge.value.properties && editingEdge.value.properties.trim()) {
    try {
      properties = JSON.parse(editingEdge.value.properties)
    } catch (e) {
      toast.error('属性 JSON 格式错误')
      return
    }
  }
  
  try {
    await graphAPI.updateEdge(selectedGraphId.value, editingEdge.value.id, {
      label: editingEdge.value.label,
      type: editingEdge.value.type,
      properties
    })
    
    toast.success('边更新成功！')
    editingEdge.value = null
    await loadEdges()
  } catch (e) {
    toast.error('更新失败：' + e.message)
  }
}

// 删除边
const deleteEdge = async (edge) => {
  if (!confirm(`确定要删除边 "${edge.label}" 吗？`)) return
  
  try {
    await graphAPI.deleteEdge(selectedGraphId.value, edge.id)
    toast.success('边已删除')
    editingEdge.value = null
    await loadEdges()
  } catch (e) {
    toast.error('删除失败：' + e.message)
  }
}

// 获取节点关联的边数量
const getNodeEdgesCount = (nodeId) => {
  return edges.value.filter(edge => {
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
    return sourceId === nodeId || targetId === nodeId
  }).length
}

// ========== 分页方法 ==========

const goToPage = (page) => {
  if (page < 1) page = 1
  if (page > totalPages.value) page = totalPages.value
  currentPage.value = page
  loadNodes()
}

const changePageSize = (size) => {
  pageSize.value = size
  currentPage.value = 1
  loadNodes()
}

// ========== 排序方法 ==========

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  loadNodes()
}

const changeSortField = (field) => {
  sortField.value = field
  currentPage.value = 1
  loadNodes()
}

// ========== 节点颜色映射 ==========

const nodeTypeColors = {
  person: '#4A90D9',
  organization: '#50C878',
  concept: '#9B59B6',
  location: '#F39C12',
  default: '#95A5A6'
}

const getNodeColor = (type) => {
  return nodeTypeColors[type] || nodeTypeColors.default
}

// 类型标签颜色
const typeTagColors = {
  person: { bg: '#EBF5FB', color: '#2980B9' },
  organization: { bg: '#E8F8F5', color: '#1E8449' },
  concept: { bg: '#F5EEF8', color: '#7D3C98' },
  location: { bg: '#FEF9E7', color: '#9A7D0A' },
  default: { bg: '#F2F3F4', color: '#566573' }
}

const getTypeTagStyle = (type) => {
  const style = typeTagColors[type] || typeTagColors.default
  return {
    background: style.bg,
    color: style.color
  }
}

// ========== 生命周期 ==========

// 跟踪 AbortController 用于取消进行中的 fetch
let activeController = null

onMounted(async () => {
  await loadGraphs()
  if (selectedGraphId.value) {
    await loadNodes()
    await loadEdges()
  } else {
    loading.value = false
  }
})

onUnmounted(() => {
  // 取消所有进行中的请求
  if (activeController) {
    try { activeController.abort() } catch {}
  }
})
</script>

<template>
  <div class="data-manager-page">
    <SaasHeader />
    
    <div class="page-content">
      <!-- 页面标题 -->
      <div class="page-header">
        <div class="header-left">
          <button class="back-btn" @click="router.push('/dashboard')">
            ← 返回
          </button>
          <h1>📊 图谱数据管理</h1>
        </div>
        <div class="header-right">
          <button class="create-btn" @click="openCreateNode" v-if="selectedGraphId">
            + 新建节点
          </button>
          <button class="edge-btn" @click="showEdgeModal = true" v-if="selectedGraphId && stats.totalEdges > 0">
            查看边 ({{ stats.totalEdges }})
          </button>
        </div>
      </div>
      
      <!-- 图谱选择器 -->
      <div class="graph-selector">
        <label>选择图谱</label>
        <select v-model="selectedGraphId" class="graph-select">
          <option value="">请选择图谱</option>
          <option v-for="graph in graphs" :key="graph.id" :value="graph.id">
            {{ graph.name }}
          </option>
        </select>
        
        <span class="graph-hint" v-if="!selectedGraphId">
          请选择一个图谱查看数据
        </span>
      </div>
      
      <!-- 统计概览 -->
      <div class="stats-overview" v-if="selectedGraphId && !loading">
        <div class="stat-card">
          <span class="stat-icon">🔗</span>
          <div class="stat-info">
            <span class="stat-value">{{ stats.totalNodes }}</span>
            <span class="stat-label">节点总数</span>
          </div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">➡️</span>
          <div class="stat-info">
            <span class="stat-value">{{ stats.totalEdges }}</span>
            <span class="stat-label">边总数</span>
          </div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">🏷️</span>
          <div class="stat-info">
            <span class="stat-value">{{ stats.typeCount }}</span>
            <span class="stat-label">节点类型</span>
          </div>
        </div>
      </div>
      
      <!-- 搜索和筛选 -->
      <div class="search-section" v-if="selectedGraphId && !loading && stats.totalNodes > 0">
        <div class="search-bar">
          <input 
            v-model="searchKeyword" 
            type="text" 
            placeholder="搜索节点标签..."
            class="search-input"
            @keyup.enter="performSearch"
          />
          <select v-model="searchType" @change="performSearch" class="type-filter">
            <option value="">全部类型</option>
            <option v-for="type in availableTypes" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
          <button class="search-btn" @click="performSearch">搜索</button>
          <button class="clear-btn" @click="clearSearch" v-if="searchKeyword || searchType">清除</button>
        </div>
        
        <!-- 排序控制 -->
        <div class="sort-controls">
          <label>排序：</label>
          <select v-model="sortField" @change="changeSortField(sortField)">
            <option value="created_at">创建时间</option>
            <option value="label">名称</option>
            <option value="type">类型</option>
          </select>
          <button class="sort-order-btn" @click="toggleSortOrder">
            {{ sortOrder === 'asc' ? '↑ 升序' : '↓ 降序' }}
          </button>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>加载图谱数据中...</p>
      </div>
      
      <!-- 错误状态 -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button @click="loadNodes">重试</button>
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="!selectedGraphId" class="empty-state">
        <div class="empty-icon">📁</div>
        <p>请从上方选择一个图谱</p>
        <p class="hint">查看该图谱中的所有节点和关系</p>
      </div>
      
      <div v-else-if="stats.totalNodes === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <p>该图谱暂无数据</p>
        <p class="hint">请先在图谱中添加节点</p>
        <button class="action-btn" @click="router.push(`/graph/${selectedGraphId}`)">
          进入图谱编辑
        </button>
      </div>
      
      <!-- 节点列表 -->
      <div v-else class="nodes-section">
        <!-- 搜索结果提示 -->
        <div class="search-result-tip" v-if="searchKeyword || searchType">
          <span>找到 {{ totalNodes }} 个匹配结果</span>
          <button @click="clearSearch">返回全部</button>
        </div>
        
        <!-- 节点表格 -->
        <div class="nodes-table-wrapper">
          <table class="nodes-table">
            <thead>
              <tr>
                <th>标签</th>
                <th>类型</th>
                <th>属性</th>
                <th>创建时间</th>
                <th>关联边</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="node in nodes" :key="node.id">
                <td class="cell-label">
                  <span class="node-label">
                    <template v-for="(seg, i) in highlightKeyword(node.label)" :key="i">
                      <mark v-if="seg.highlight">{{ seg.text }}</mark>
                      <span v-else>{{ seg.text }}</span>
                    </template>
                  </span>
                </td>
                <td>
                  <span class="type-badge" :style="getTypeTagStyle(node.type)">
                    {{ node.type }}
                  </span>
                </td>
                <td class="cell-props">{{ formatProperties(node.properties) }}</td>
                <td class="cell-date">{{ formatDate(node.created_at) }}</td>
                <td class="cell-edges">
                  <span class="edge-count">{{ getNodeEdgesCount(node.id) }}</span>
                </td>
                <td class="cell-actions">
                  <button class="btn-action" @click="openEditNode(node)">编辑</button>
                  <button class="btn-action danger" @click="deleteNode(node)">删除</button>
                  <button class="btn-action" @click="openNodeDetail(node)">
                    详情
                  </button>
                </td>
              </tr>
              <tr v-if="nodes.length === 0">
                <td colspan="6" class="empty-row">
                  没有找到匹配的节点
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- 分页控制 -->
        <div class="pagination" v-if="totalNodes > 0">
          <div class="page-info">
            显示 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, totalNodes) }} 条，共 {{ totalNodes }} 条
          </div>
          <div class="page-controls">
            <button 
              class="page-btn" 
              @click="goToPage(1)" 
              :disabled="currentPage === 1"
            >
              首页
            </button>
            <button 
              class="page-btn" 
              @click="goToPage(currentPage - 1)" 
              :disabled="currentPage === 1"
            >
              上一页
            </button>
            <span class="page-number">
              第 {{ currentPage }} / {{ totalPages }} 页
            </span>
            <button 
              class="page-btn" 
              @click="goToPage(currentPage + 1)" 
              :disabled="currentPage >= totalPages"
            >
              下一页
            </button>
            <button 
              class="page-btn" 
              @click="goToPage(totalPages)" 
              :disabled="currentPage >= totalPages"
            >
              末页
            </button>
          </div>
          <div class="page-size">
            <label>每页：</label>
            <select v-model="pageSize" @change="changePageSize(pageSize)">
              <option :value="20">20 条</option>
              <option :value="50">50 条</option>
              <option :value="100">100 条</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 创建节点弹窗 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>创建新节点</h3>
        
        <div class="form-group">
          <label>标签 <span class="required">*</span></label>
          <input v-model="creatingNode.label" type="text" placeholder="输入节点标签" />
        </div>
        
        <div class="form-group">
          <label>类型</label>
          <select v-model="creatingNode.type" class="type-select">
            <option value="person">person</option>
            <option value="organization">organization</option>
            <option value="concept">concept</option>
            <option value="location">location</option>
            <option value="default">default</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>属性 (JSON)</label>
          <textarea 
            v-model="creatingNode.properties" 
            rows="4" 
            placeholder='{"key": "value"}'
          ></textarea>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreateModal = false">取消</button>
          <button class="btn-primary" @click="createNode">创建</button>
        </div>
      </div>
    </div>
    
    <!-- 编辑节点弹窗 -->
    <div v-if="showEditModal && editingNode" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h3>编辑节点</h3>
        
        <div class="form-group">
          <label>标签 <span class="required">*</span></label>
          <input v-model="editingNode.label" type="text" placeholder="节点标签" />
        </div>
        
        <div class="form-group">
          <label>类型</label>
          <select v-model="editingNode.type" class="type-select">
            <option value="person">person</option>
            <option value="organization">organization</option>
            <option value="concept">concept</option>
            <option value="location">location</option>
            <option value="default">default</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>属性 (JSON)</label>
          <textarea 
            v-model="editingNode.properties" 
            rows="4" 
            placeholder='{"key": "value"}'
          ></textarea>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showEditModal = false">取消</button>
          <button class="btn-primary" @click="saveNodeEdit">保存</button>
        </div>
      </div>
    </div>
    
    <!-- 边列表弹窗 -->
    <div v-if="showEdgeModal" class="modal-overlay" @click.self="showEdgeModal = false">
      <div class="modal modal-large">
        <h3>边列表</h3>
        
        <div v-if="loadingEdges" class="loading-edges">
          <div class="spinner-small"></div>
          <span>加载边数据中...</span>
        </div>
        
        <div v-else-if="editingEdge" class="edge-detail">
          <h4>编辑边</h4>
          <div class="form-group">
            <label>关系名称</label>
            <input v-model="editingEdge.label" type="text" placeholder="边标签" />
          </div>
          <div class="form-group">
            <label>类型</label>
            <input v-model="editingEdge.type" type="text" placeholder="边类型" />
          </div>
          <div class="form-group">
            <label>属性 (JSON)</label>
            <textarea 
              v-model="editingEdge.properties" 
              rows="3" 
              placeholder='{"key": "value"}'
            ></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" @click="closeEdgeDetail">返回列表</button>
            <button class="btn-danger" @click="deleteEdge(editingEdge)">删除</button>
            <button class="btn-primary" @click="saveEdgeEdit">保存</button>
          </div>
        </div>
        
        <div v-else class="edge-list">
          <table class="edges-table">
            <thead>
              <tr>
                <th>源节点</th>
                <th>关系</th>
                <th>目标节点</th>
                <th>类型</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="edge in edgeList" :key="edge.id">
                <td class="cell-source">{{ edge.sourceLabel }}</td>
                <td class="cell-edge-label">{{ edge.label }}</td>
                <td class="cell-target">{{ edge.targetLabel }}</td>
                <td class="cell-type">{{ edge.type || '-' }}</td>
                <td class="cell-actions">
                  <button class="btn-action" @click="openEdgeDetail(edge)">编辑</button>
                  <button class="btn-action danger" @click="deleteEdge(edge)">删除</button>
                </td>
              </tr>
              <tr v-if="edgeList.length === 0">
                <td colspan="5" class="empty-row">
                  暂无边数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="modal-close">
          <button class="btn-secondary" @click="showEdgeModal = false">关闭</button>
        </div>
      </div>
    </div>
    
    <!-- 节点详情弹窗 -->
    <div v-if="showNodeDetailModal && currentDetailNode" class="modal-overlay node-detail-overlay" @click.self="closeNodeDetail">
      <div class="modal node-detail-modal">
        <div class="modal-header">
          <h3>🔍 节点详情</h3>
          <button class="btn-close" @click="closeNodeDetail">×</button>
        </div>
        
        <div class="node-detail-body">
          <!-- 第一列：节点信息 -->
          <div class="node-detail-column node-info-column">
            <h4 class="column-title">📋 节点信息</h4>
            
            <!-- 基本信息 -->
            <div class="node-detail-section">
              <h5 class="section-title">基本信息</h5>
              <div class="detail-row">
                <span class="detail-label">ID</span>
                <span class="detail-value detail-id">{{ currentDetailNode.id }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">标签</span>
                <span class="detail-value detail-label-text">{{ currentDetailNode.label }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">类型</span>
                <span class="detail-value">
                  <span class="node-type-badge" :style="{ backgroundColor: getNodeColor(currentDetailNode.type) }">
                    {{ currentDetailNode.type }}
                  </span>
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">创建时间</span>
                <span class="detail-value">{{ formatDate(currentDetailNode.created_at) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">更新时间</span>
                <span class="detail-value">{{ formatDate(currentDetailNode.updated_at) }}</span>
              </div>
            </div>
            
            <!-- 属性 -->
            <div class="node-detail-section" v-if="currentDetailNode.properties && Object.keys(currentDetailNode.properties).length > 0">
              <h5 class="section-title">📦 属性</h5>
              <div class="properties-list">
                <div class="property-item" v-for="(value, key) in currentDetailNode.properties" :key="key">
                  <span class="property-key">{{ key }}</span>
                  <span class="property-value">{{ typeof value === 'object' ? JSON.stringify(value) : value }}</span>
                </div>
              </div>
            </div>
            
            <!-- 快捷操作 -->
            <div class="node-detail-section">
              <h5 class="section-title">⚡ 快捷操作</h5>
              <div class="quick-actions">
                <button class="btn-action" @click="openEditNode(currentDetailNode); closeNodeDetail();">
                  ✏️ 编辑节点
                </button>
                <button class="btn-action" @click="router.push(`/graph/${selectedGraphId}?highlight=${currentDetailNode.id}`); closeNodeDetail();">
                  📊 在图谱中查看
                </button>
              </div>
            </div>
          </div>
          
          <!-- 第二列：关联边 -->
          <div class="node-detail-column node-edges-column">
            <h4 class="column-title">🔗 关联边 <span class="edge-count-badge">{{ getNodeRelatedEdges(currentDetailNode.id).length }}</span></h4>
            
            <div class="related-edges-list" v-if="getNodeRelatedEdges(currentDetailNode.id).length > 0">
              <div class="related-edge-item" v-for="edge in getNodeRelatedEdges(currentDetailNode.id)" :key="edge.id">
                <div class="edge-connection">
                  <span class="edge-node" v-if="(typeof edge.source === 'object' ? edge.source.id : edge.source) === currentDetailNode.id">
                    {{ currentDetailNode.label }}
                  </span>
                  <span class="edge-node" v-else>
                    {{ nodes.find(n => n.id === (typeof edge.source === 'object' ? edge.source.id : edge.source))?.label || '未知节点' }}
                  </span>
                  <span class="edge-arrow">→</span>
                  <span class="edge-label-text">{{ edge.label || '关联' }}</span>
                  <span class="edge-arrow">→</span>
                  <span class="edge-node" v-if="(typeof edge.target === 'object' ? edge.target.id : edge.target) === currentDetailNode.id">
                    {{ currentDetailNode.label }}
                  </span>
                  <span class="edge-node" v-else>
                    {{ nodes.find(n => n.id === (typeof edge.target === 'object' ? edge.target.id : edge.target))?.label || '未知节点' }}
                  </span>
                </div>
                <div class="edge-meta">
                  <span class="edge-type-tag" v-if="edge.type">{{ edge.type }}</span>
                  <span class="edge-prop-count" v-if="edge.properties && Object.keys(edge.properties).length > 0">
                    {{ Object.keys(edge.properties).length }} 个属性
                  </span>
                </div>
              </div>
            </div>
            
            <div v-else class="empty-edges">
              <div class="empty-icon">🔌</div>
              <p>暂无关联边</p>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn-danger" @click="deleteNode(currentDetailNode); closeNodeDetail();">
            🗑️ 删除节点
          </button>
          <button class="btn" @click="closeNodeDetail">
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-manager-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.page-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 80px 20px 40px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-right {
  display: flex;
  gap: 12px;
}

.back-btn {
  padding: 8px 16px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  border-color: #FF4500;
  color: #FF4500;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.create-btn {
  padding: 10px 20px;
  background: #FF4500;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.create-btn:hover {
  background: #E03E00;
}

.edge-btn {
  padding: 10px 20px;
  background: #fff;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.edge-btn:hover {
  border-color: #FF4500;
  color: #FF4500;
}

/* 图谱选择器 */
.graph-selector {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.graph-selector label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
}

.graph-select {
  flex: 1;
  min-width: 200px;
  padding: 10px 14px;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  font-size: 0.9rem;
  background: #fff;
  cursor: pointer;
}

.graph-select:focus {
  outline: none;
  border-color: #FF4500;
}

.graph-hint {
  font-size: 0.85rem;
  color: #999;
}

/* 统计概览 */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
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
  color: #FF4500;
  font-family: 'JetBrains Mono', monospace;
}

.stat-label {
  font-size: 0.85rem;
  color: #666;
}

/* 搜索和筛选 */
.search-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.search-bar {
  display: flex;
  gap: 12px;
  flex: 1;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 10px 14px;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: #FF4500;
}

.type-filter {
  padding: 10px 14px;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  font-size: 0.9rem;
  background: #fff;
  cursor: pointer;
  min-width: 120px;
}

.type-filter:focus {
  outline: none;
  border-color: #FF4500;
}

.search-btn, .clear-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn {
  background: #FF4500;
  color: #fff;
  border: none;
}

.search-btn:hover {
  background: #E03E00;
}

.clear-btn {
  background: #fff;
  color: #666;
  border: 1px solid #ddd;
}

.clear-btn:hover {
  border-color: #FF4500;
  color: #FF4500;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-controls label {
  font-size: 0.85rem;
  color: #666;
}

.sort-controls select {
  padding: 8px 12px;
  border: 1px solid #E0E0E0;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
  cursor: pointer;
}

.sort-controls select:focus {
  outline: none;
  border-color: #FF4500;
}

.sort-order-btn {
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #E0E0E0;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-order-btn:hover {
  border-color: #FF4500;
  color: #FF4500;
}

/* 加载状态 */
.loading-state {
  text-align: center;
  padding: 60px;
  background: #fff;
  border-radius: 12px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #eee;
  border-top-color: #FF4500;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid #eee;
  border-top-color: #FF4500;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-edges {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: #666;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* 错误状态 */
.error-state {
  text-align: center;
  padding: 40px;
  background: #fff;
  border-radius: 12px;
  color: #E74C3C;
}

.error-state button {
  margin-top: 16px;
  padding: 10px 24px;
  background: #FF4500;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80px 40px;
  background: #fff;
  border-radius: 12px;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 1.1rem;
  color: #333;
  margin: 8px 0;
}

.empty-state .hint {
  font-size: 0.9rem;
  color: #999;
}

.empty-state .action-btn {
  margin-top: 20px;
  padding: 12px 24px;
  background: #FF4500;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}

/* 节点列表 */
.nodes-section {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.search-result-tip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #FEF3C7;
  border-bottom: 1px solid #F59E0B;
}

.search-result-tip span {
  color: #92400E;
  font-weight: 600;
}

.search-result-tip button {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #F59E0B;
  border-radius: 6px;
  color: #92400E;
  cursor: pointer;
  font-size: 0.85rem;
}

.search-result-tip button:hover {
  background: #FEF3C7;
}

.nodes-table-wrapper {
  overflow-x: auto;
}

.nodes-table {
  width: 100%;
  border-collapse: collapse;
}

.nodes-table thead {
  background: #fafafa;
}

.nodes-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #E0E0E0;
}

.nodes-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 0.9rem;
  color: #333;
}

.nodes-table tr:hover {
  background: #fafafa;
}

.cell-label .node-label {
  font-weight: 600;
  color: #222;
}

.cell-label .node-label :deep(mark) {
  background: #FEF3C7;
  color: #92400E;
  padding: 0 2px;
  border-radius: 2px;
}

.type-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.cell-props {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #666;
  font-size: 0.85rem;
}

.cell-date {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: #999;
  white-space: nowrap;
}

.edge-count {
  display: inline-block;
  min-width: 24px;
  text-align: center;
  padding: 4px 8px;
  background: #f0f0f0;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
}

.cell-actions {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.btn-action {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  border-color: #FF4500;
  color: #FF4500;
}

.btn-action.danger:hover {
  border-color: #E74C3C;
  color: #E74C3C;
}

.empty-row {
  text-align: center;
  color: #999;
  padding: 40px !important;
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid #E0E0E0;
  background: #fafafa;
  flex-wrap: wrap;
  gap: 12px;
}

.page-info {
  font-size: 0.85rem;
  color: #666;
}

.page-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.page-btn {
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: #FF4500;
  color: #FF4500;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-number {
  padding: 8px 16px;
  font-size: 0.85rem;
  color: #333;
  font-weight: 600;
}

.page-size {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size label {
  font-size: 0.85rem;
  color: #666;
}

.page-size select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
  cursor: pointer;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  max-height: 90vh;
  overflow-y: auto;
}

.modal-large {
  max-width: 800px;
}

.modal h3 {
  font-size: 1.2rem;
  margin-bottom: 20px;
  color: #333;
}

.modal h4 {
  font-size: 1rem;
  margin-bottom: 16px;
  color: #333;
  padding-bottom: 8px;
  border-bottom: 1px solid #E0E0E0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
  margin-bottom: 6px;
}

.form-group .required {
  color: #E74C3C;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #FF4500;
}

.type-select {
  background: #fff;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.btn-primary, .btn-secondary, .btn-danger {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #FF4500;
  color: #fff;
  border: none;
}

.btn-primary:hover {
  background: #E03E00;
}

.btn-secondary {
  background: #fff;
  color: #333;
  border: 1px solid #ddd;
}

.btn-secondary:hover {
  border-color: #FF4500;
  color: #FF4500;
}

.btn-danger {
  background: #fff;
  color: #E74C3C;
  border: 1px solid #E74C3C;
}

.btn-danger:hover {
  background: #FEE2E2;
}

.modal-close {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #E0E0E0;
  text-align: right;
}

/* 边列表 */
.edge-detail {
  margin-bottom: 20px;
}

.edge-list {
  max-height: 400px;
  overflow-y: auto;
}

.edges-table {
  width: 100%;
  border-collapse: collapse;
}

.edges-table thead {
  background: #fafafa;
  position: sticky;
  top: 0;
}

.edges-table th {
  padding: 10px 12px;
  text-align: left;
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  border-bottom: 1px solid #E0E0E0;
}

.edges-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 0.85rem;
}

.edges-table tr:hover {
  background: #fafafa;
}

.cell-source, .cell-target {
  font-weight: 500;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-edge-label {
  color: #FF4500;
  font-weight: 600;
  text-align: center;
}

.cell-type {
  color: #666;
}

/* ========== 节点详情弹窗样式 ========== */

.node-detail-modal {
  max-width: 1000px;
  width: 95%;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.node-detail-overlay .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 2px solid #FF4500;
  flex-shrink: 0;
}

.node-detail-overlay .modal-header h3 {
  margin: 0;
  font-size: 1.3rem;
  color: #333;
}

.node-detail-overlay .btn-close {
  background: none;
  border: none;
  font-size: 28px;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.node-detail-overlay .btn-close:hover {
  background: #f0f0f0;
  color: #333;
}

.node-detail-body {
  display: flex;
  gap: 20px;
  padding: 20px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.node-detail-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.node-info-column {
  flex: 0 0 380px;
  max-height: 100%;
  overflow-y: auto;
}

.node-edges-column {
  flex: 1;
  background: #fafafa;
  border-radius: 12px;
  padding: 16px;
  overflow-y: auto;
}

.node-detail-overlay .column-title {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.edge-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  background: #FF4500;
  color: white;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.node-detail-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #E0E0E0;
}

.node-detail-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.node-detail-overlay .section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-detail-overlay .detail-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.node-detail-overlay .detail-row:last-child {
  border-bottom: none;
}

.node-detail-overlay .detail-label {
  width: 80px;
  flex-shrink: 0;
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
}

.node-detail-overlay .detail-value {
  flex: 1;
  font-size: 0.85rem;
  color: #333;
  word-break: break-all;
}

.node-detail-overlay .detail-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: #999;
}

.node-detail-overlay .detail-label-text {
  font-weight: 600;
  font-size: 1rem;
}

.node-type-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.8rem;
  color: white;
  font-weight: 500;
}

.properties-list {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
}

.property-item {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px dashed #e0e0e0;
}

.property-item:last-child {
  border-bottom: none;
}

.property-key {
  width: 100px;
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #FF4500;
}

.property-value {
  flex: 1;
  font-size: 0.8rem;
  color: #333;
  word-break: break-all;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-actions .btn-action {
  width: 100%;
  justify-content: center;
  padding: 10px 16px;
}

.related-edges-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.related-edge-item {
  background: white;
  border-radius: 8px;
  padding: 12px 16px;
  border: 1px solid #E0E0E0;
  transition: all 0.2s;
}

.related-edge-item:hover {
  border-color: #FF4500;
  box-shadow: 0 2px 8px rgba(255, 69, 0, 0.1);
}

.edge-connection {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.edge-node {
  font-weight: 600;
  color: #333;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edge-arrow {
  color: #FF4500;
  font-weight: bold;
}

.edge-label-text {
  color: #FF4500;
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(255, 69, 0, 0.1);
  border-radius: 4px;
  font-size: 0.8rem;
}

.edge-meta {
  display: flex;
  gap: 8px;
  font-size: 0.75rem;
  color: #666;
}

.edge-type-tag {
  padding: 2px 6px;
  background: #f0f0f0;
  border-radius: 4px;
}

.edge-prop-count {
  color: #999;
}

.empty-edges {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #999;
}

.empty-edges .empty-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.node-detail-overlay .modal-footer {
  display: flex;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid #E0E0E0;
  background: #fafafa;
  flex-shrink: 0;
}

.node-detail-overlay .btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.node-detail-overlay .btn:not(.btn-danger) {
  background: #fff;
  border: 1px solid #ddd;
  color: #333;
}

.node-detail-overlay .btn:not(.btn-danger):hover {
  border-color: #FF4500;
  color: #FF4500;
}

.node-detail-overlay .btn.btn-danger {
  background: #fff;
  color: #E74C3C;
  border: 1px solid #E74C3C;
}

.node-detail-overlay .btn.btn-danger:hover {
  background: #FEE2E2;
}

/* 响应式 */
@media (max-width: 768px) {
  .stats-overview {
    grid-template-columns: 1fr;
  }
  
  .search-section {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-bar {
    flex-direction: column;
  }
  
  .search-input,
  .type-filter,
  .search-btn,
  .clear-btn {
    width: 100%;
  }
  
  .sort-controls {
    width: 100%;
    justify-content: space-between;
  }
  
  .nodes-table {
    font-size: 0.85rem;
  }
  
  th, td {
    padding: 10px 12px;
  }
  
  .cell-actions {
    flex-direction: column;
  }
  
  .pagination {
    flex-direction: column;
    align-items: stretch;
  }
  
  .page-controls {
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .page-size {
    justify-content: center;
  }
  
  .node-detail-body {
    flex-direction: column;
  }
  
  .node-info-column {
    flex: none;
  }
}
</style>
