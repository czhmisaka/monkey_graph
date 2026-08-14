<template>
  <div class="share-view">
    <div v-if="loading" class="loading">
      <span class="spinner"></span>
      <p>加载分享内容...</p>
    </div>
    
    <div v-else-if="error" class="error">
      <h2>⚠️ 分享不存在或已过期</h2>
      <p>{{ error }}</p>
      <button class="btn" @click="goHome">返回首页</button>
    </div>
    
    <div v-else class="share-content">
      <!-- 顶部导航 -->
      <header class="header">
        <div class="header-left">
          <h1 class="logo">
            <span class="logo-icon">◈</span>
            <span class="logo-text">MonkeyGraph</span>
          </h1>
          <span class="tag">分享</span>
        </div>
        <div class="header-center">
          <span class="graph-name">{{ graphName }}</span>
          <span v-if="allowEdit" class="edit-badge">可编辑</span>
          <span v-else class="readonly-badge">只读</span>
        </div>
        <div class="header-right">
          <button v-if="allowEdit" class="btn btn-success" @click="saveChanges" :disabled="saving">
            {{ saving ? '保存中...' : '💾 保存' }}
          </button>
          <button class="btn btn-primary" @click="goHome">
            🏠 创建自己的图谱
          </button>
        </div>
      </header>
      
      <!-- 编辑工具栏 -->
      <div v-if="allowEdit" class="edit-toolbar">
        <div class="toolbar-group">
          <button class="toolbar-btn" @click="setEditMode('addNode')" :class="{ active: editMode === 'addNode' }">
            ➕ 添加节点
          </button>
          <button class="toolbar-btn" @click="setEditMode('addEdge')" :class="{ active: editMode === 'addEdge' }">
            🔗 添加边
          </button>
          <button class="toolbar-btn" @click="setEditMode('delete')" :class="{ active: editMode === 'delete' }">
            🗑️ 删除
          </button>
        </div>
        <div v-if="editMode" class="toolbar-hint">
          <span v-if="editMode === 'addNode'">点击空白区域添加节点</span>
          <span v-else-if="editMode === 'addEdge'">先点击源节点，再点击目标节点</span>
          <span v-else-if="editMode === 'delete'">点击节点或边进行删除</span>
          <button class="btn-cancel" @click="setEditMode(null)">取消</button>
        </div>
        <div class="toolbar-info">
          <span>已修改: {{ hasChanges ? '是' : '否' }}</span>
        </div>
      </div>
      
      <!-- 图谱展示区 -->
      <main class="main-content">
        <div class="graph-container" ref="containerRef" @click="handleContainerClick">
          <svg ref="svgRef" class="graph-svg"></svg>
        </div>
      </main>
      
      <!-- 图例 -->
      <div class="legend">
        <div class="legend-item">
          <span class="legend-color" style="background-color: #4A90D9"></span>
          <span>节点 ({{ nodes.length }})</span>
        </div>
        <div class="legend-item">
          <span class="legend-line dashed"></span>
          <span>边 ({{ edges.length }})</span>
        </div>
      </div>
    </div>
    
    <!-- 添加节点弹窗 -->
    <div v-if="showAddNodeModal" class="modal-overlay" @click.self="showAddNodeModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>添加节点</h3>
          <button class="btn-close" @click="showAddNodeModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>节点标签</label>
            <input v-model="newNode.label" type="text" class="input" placeholder="输入节点名称" />
          </div>
          <div class="form-group">
            <label>节点类型</label>
            <select v-model="newNode.type" class="input">
              <option value="person">人物</option>
              <option value="organization">组织</option>
              <option value="concept">概念</option>
              <option value="location">地点</option>
              <option value="event">事件</option>
              <option value="default">默认</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddNodeModal = false">取消</button>
          <button class="btn" @click="confirmAddNode" :disabled="!newNode.label">添加</button>
        </div>
      </div>
    </div>
    
    <!-- 添加边弹窗 -->
    <div v-if="showAddEdgeModal" class="modal-overlay" @click.self="showAddEdgeModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>添加边</h3>
          <button class="btn-close" @click="showAddEdgeModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>关系标签</label>
            <input v-model="newEdge.label" type="text" class="input" placeholder="输入关系名称（如：拥有、创建）" />
          </div>
          <div class="form-group">
            <label>关系类型</label>
            <select v-model="newEdge.type" class="input">
              <option value="default">默认</option>
              <option value="related">相关</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddEdgeModal = false">取消</button>
          <button class="btn" @click="confirmAddEdge">添加</button>
        </div>
      </div>
    </div>
    
    <!-- 确认删除弹窗 -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="btn-close" @click="showDeleteConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>确定要删除 {{ deleteTarget.type === 'node' ? '节点' : '边' }} "{{ deleteTarget.label }}" 吗？</p>
          <p v-if="deleteTarget.type === 'node'" class="warning-text">⚠️ 删除节点将同时删除所有关联的边</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showDeleteConfirm = false">取消</button>
          <button class="btn btn-danger" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as d3 from 'd3'
import { shareAPI } from '../api'

const route = useRoute()
const router = useRouter()

// 状态
const loading = ref(true)
const error = ref('')
const graphName = ref('')
const allowEdit = ref(false)
const nodes = ref([])
const edges = ref([])
const saving = ref(false)
const hasChanges = ref(false)

// 编辑相关状态
const editMode = ref(null) // null, 'addNode', 'addEdge', 'delete'
const shareToken = ref('')
const edgeSourceNode = ref(null)
const pendingNodePosition = ref(null)

// 弹窗状态
const showAddNodeModal = ref(false)
const showAddEdgeModal = ref(false)
const showDeleteConfirm = ref(false)

// 新节点数据
const newNode = ref({
  label: '',
  type: 'default'
})

// 新边数据
const newEdge = ref({
  label: '',
  type: 'default'
})

// 删除目标
const deleteTarget = ref({
  id: '',
  label: '',
  type: '' // 'node' or 'edge'
})

// D3 相关
const svgRef = ref(null)
const containerRef = ref(null)
let simulation = null

// 节点颜色映射
const nodeColors = {
  person: '#4A90D9',
  organization: '#50C878',
  concept: '#9B59B6',
  location: '#F39C12',
  event: '#E74C3C',
  default: '#95A5A6'
}

const getNodeColor = (type) => {
  return nodeColors[type] || nodeColors.default
}

// 设置编辑模式
const setEditMode = (mode) => {
  editMode.value = mode
  edgeSourceNode.value = null
  pendingNodePosition.value = null
}

// 获取分享内容
const loadShare = async () => {
  loading.value = true
  error.value = ''
  
  try {
    shareToken.value = route.params.token
    const data = await shareAPI.getShare(shareToken.value)
    
    graphName.value = data.graph_name || '未命名图谱'
    allowEdit.value = data.allow_edit || false
    nodes.value = data.nodes || []
    edges.value = data.edges || []
    
    // 渲染图谱
    await nextTick()
    renderGraph()
  } catch (err) {
    error.value = err.message || '无法加载分享的内容'
  } finally {
    loading.value = false
  }
}

// 处理容器点击（用于添加节点）
const handleContainerClick = async (event) => {
  if (!allowEdit.value || editMode.value !== 'addNode') return
  
  // 获取点击位置
  const rect = containerRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  // 显示添加节点弹窗，预设位置
  pendingNodePosition.value = { x, y }
  newNode.value = { label: '', type: 'default' }
  showAddNodeModal.value = true
}

// 确认添加节点
const confirmAddNode = async () => {
  if (!newNode.value.label) return
  
  try {
    const nodeData = {
      label: newNode.value.label,
      type: newNode.value.type,
      ...(pendingNodePosition.value || {})
    }
    
    const result = await shareAPI.createNode(shareToken.value, nodeData)
    
    // 添加到本地数据
    nodes.value.push({
      ...result,
      x: result.x || pendingNodePosition.value?.x || 0,
      y: result.y || pendingNodePosition.value?.y || 0
    })
    
    hasChanges.value = true
    showAddNodeModal.value = false
    pendingNodePosition.value = null
    
    // 重新渲染
    renderGraph()
  } catch (err) {
    alert('添加节点失败: ' + err.message)
  }
}

// 处理节点点击（用于添加边或删除）
const handleNodeClick = async (node, event) => {
  if (!allowEdit.value) return
  
  // 阻止事件冒泡
  event.stopPropagation()
  
  if (editMode.value === 'addEdge') {
    if (!edgeSourceNode.value) {
      // 选择源节点
      edgeSourceNode.value = node
      alert(`已选择源节点 "${node.label}"，请点击目标节点`)
    } else if (edgeSourceNode.value.id !== node.id) {
      // 选择目标节点，创建边
      try {
        const edgeData = {
          source: edgeSourceNode.value.id,
          target: node.id,
          label: newEdge.value.label || '',
          type: newEdge.value.type || 'default'
        }
        
        const result = await shareAPI.createEdge(shareToken.value, edgeData)
        
        // 添加到本地数据
        edges.value.push(result)
        hasChanges.value = true
        
        // 重置状态
        edgeSourceNode.value = null
        setEditMode(null)
        
        // 重新渲染
        renderGraph()
        alert('边添加成功！')
      } catch (err) {
        alert('添加边失败: ' + err.message)
      }
    } else {
      alert('源节点和目标节点不能相同，请重新选择')
      edgeSourceNode.value = null
    }
  } else if (editMode.value === 'delete') {
    // 显示删除确认
    deleteTarget.value = {
      id: node.id,
      label: node.label,
      type: 'node'
    }
    showDeleteConfirm.value = true
  }
}

// 处理边点击（用于删除）
const handleEdgeClick = (edge, event) => {
  if (!allowEdit.value || editMode.value !== 'delete') return
  
  event.stopPropagation()
  
  // 显示删除确认
  deleteTarget.value = {
    id: edge.id,
    label: edge.label || `${edge.source} -> ${edge.target}`,
    type: 'edge'
  }
  showDeleteConfirm.value = true
}

// 确认删除
const confirmDelete = async () => {
  try {
    if (deleteTarget.value.type === 'node') {
      await shareAPI.deleteNode(shareToken.value, deleteTarget.value.id)
      // 从本地数据中移除节点和关联的边
      nodes.value = nodes.value.filter(n => n.id !== deleteTarget.value.id)
      edges.value = edges.value.filter(e => e.source !== deleteTarget.value.id && e.target !== deleteTarget.value.id)
    } else {
      await shareAPI.deleteEdge(shareToken.value, deleteTarget.value.id)
      // 从本地数据中移除边
      edges.value = edges.value.filter(e => e.id !== deleteTarget.value.id)
    }
    
    hasChanges.value = true
    showDeleteConfirm.value = false
    
    // 重新渲染
    renderGraph()
  } catch (err) {
    alert('删除失败: ' + err.message)
  }
}

// 保存更改
const saveChanges = async () => {
  saving.value = true
  try {
    // 重新加载数据以确保与服务器同步
    const data = await shareAPI.getShare(shareToken.value)
    nodes.value = data.nodes || []
    edges.value = data.edges || []
    hasChanges.value = false
    renderGraph()
    alert('保存成功！')
  } catch (err) {
    alert('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 渲染图谱
const renderGraph = () => {
  if (!svgRef.value || !containerRef.value || nodes.value.length === 0) return
  
  const container = containerRef.value
  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight - 150
  
  // 重新渲染前停止上一次的模拟，避免多个 simulation 同时运行
  if (simulation) {
    simulation.stop()
    simulation = null
  }
  
  // 清空
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()
  
  svg.attr('width', width).attr('height', height)
  
  // 定义箭头
  const defs = svg.append('defs')
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 25)
    .attr('refY', 0)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#999')
  
  const g = svg.append('g')
  
  // 缩放行为
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })
  
  svg.call(zoom)
  
  // 准备数据
  const nodeData = nodes.value.map(n => ({ ...n }))
  const edgeData = edges.value.map(e => ({ ...e }))
  
  // 初始化位置
  nodeData.forEach((n, i) => {
    if (n.x === undefined || n.y === undefined) {
      n.x = width / 2 + (Math.random() - 0.5) * 400
      n.y = height / 2 + (Math.random() - 0.5) * 400
    }
  })
  
  // 力导向图
  simulation = d3.forceSimulation(nodeData)
    .velocityDecay(0.4)
    .force('link', d3.forceLink(edgeData)
      .id(d => d.id)
      .distance(100)
      .strength(0.5))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(40))
  
  // 绘制边
  const link = g.selectAll('.link')
    .data(edgeData)
    .enter()
    .append('g')
    .attr('class', 'link-group')
    .on('click', function(event, d) {
      if (allowEdit.value && editMode.value === 'delete') {
        handleEdgeClick(d, event)
      }
    })
  
  link.append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')
    .attr('marker-end', 'url(#arrow)')
  
  // 边标签
  const linkLabel = link.append('g')
    .attr('class', 'link-label-group')
  
  linkLabel.append('rect')
    .attr('class', 'link-label-bg')
    .attr('fill', 'white')
    .attr('stroke', '#ddd')
    .attr('stroke-width', 1)
    .attr('rx', 4)
    .attr('ry', 4)
  
  linkLabel.append('text')
    .attr('class', 'link-label')
    .attr('font-size', '10px')
    .attr('fill', '#666')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
  
  // 绘制节点
  const node = g.selectAll('.node')
    .data(nodeData)
    .enter()
    .append('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded))
    .on('click', function(event, d) {
      if (allowEdit.value && editMode.value) {
        handleNodeClick(d, event)
      }
    })
  
  // 节点背景
  node.append('rect')
    .attr('class', 'node-bg')
    .attr('y', -20)
    .attr('height', 40)
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', 'white')
    .attr('stroke', d => getNodeColor(d.type))
    .attr('stroke-width', 2)
  
  // 节点标签
  node.append('text')
    .attr('class', 'node-label')
    .attr('dy', '-4')
    .attr('text-anchor', 'middle')
    .attr('font-size', '14px')
    .attr('font-weight', '600')
    .attr('fill', d => getNodeColor(d.type))
    .text(d => d.label)
  
  // 节点类型
  node.append('text')
    .attr('class', 'node-type')
    .attr('dy', '14')
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#888')
    .text(d => d.type)
  
  // 更新位置
  simulation.on('tick', () => {
    link.select('.link')
      .attr('d', d => {
        const source = typeof d.source === 'object' ? d.source : nodeData.find(n => n.id === d.source)
        const target = typeof d.target === 'object' ? d.target : nodeData.find(n => n.id === d.target)
        if (!source || !target) return ''
        return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
      })
    
    // 更新边标签位置
    link.each(function(d) {
      const source = typeof d.source === 'object' ? d.source : nodeData.find(n => n.id === d.source)
      const target = typeof d.target === 'object' ? d.target : nodeData.find(n => n.id === d.target)
      if (!source || !target) return
      
      const group = d3.select(this).select('.link-label-group')
      const mx = (source.x + target.x) / 2
      const my = (source.y + target.y) / 2
      
      group.attr('transform', `translate(${mx}, ${my - 10})`)
      
      const text = d.label || ''
      const textWidth = text.length * 6 + 16
      group.select('.link-label-bg')
        .attr('width', textWidth)
        .attr('x', -textWidth / 2)
      
      group.select('.link-label').text(text)
    })
    
    node.attr('transform', d => `translate(${d.x}, ${d.y})`)
    
    // 更新节点卡片宽度
    node.select('.node-bg').each(function(d) {
      const labelWidth = (d.label?.length || 0) * 14 + 30
      const typeWidth = (d.type?.length || 0) * 10 + 20
      const maxWidth = Math.max(labelWidth, typeWidth)
      d3.select(this).attr('x', -maxWidth / 2).attr('width', maxWidth)
    })
  })
  
  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart()
    d.fx = d.x
    d.fy = d.y
  }
  
  function dragged(event, d) {
    d.fx = event.x
    d.fy = event.y
  }
  
  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0)
    d.fx = null
    d.fy = null
  }
}

// 返回首页
const goHome = () => {
  router.push('/')
}

// 窗口尺寸变化处理（具名函数，便于卸载时移除）
const handleResize = () => {
  if (!loading.value && !error.value) {
    renderGraph()
  }
}

onMounted(() => {
  loadShare()
  
  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  // 停止力导向模拟，释放定时器与监听
  if (simulation) {
    simulation.stop()
    simulation = null
  }
})
</script>

<style scoped>
.share-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #f5f5f5);
}

.loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.loading p {
  color: #666;
}

.error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.error h2 {
  color: #e74c3c;
  margin: 0;
}

.error p {
  color: #666;
}

.share-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部导航 */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: white;
  border-bottom: 1px solid #e5e5e5;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.logo-icon {
  color: #3b82f6;
  font-size: 24px;
}

.tag {
  padding: 2px 8px;
  background: #10b981;
  color: white;
  border-radius: 12px;
  font-size: 12px;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.graph-name {
  font-size: 18px;
  font-weight: 600;
}

.edit-badge {
  padding: 4px 12px;
  background: #f59e0b;
  color: white;
  border-radius: 12px;
  font-size: 12px;
}

.readonly-badge {
  padding: 4px 12px;
  background: #6b7280;
  color: white;
  border-radius: 12px;
  font-size: 12px;
}

/* 编辑工具栏 */
.edit-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 24px;
  background: #fef3c7;
  border-bottom: 1px solid #fcd34d;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  padding: 6px 12px;
  border: 1px solid #d97706;
  border-radius: 6px;
  background: white;
  color: #92400e;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: #fef3c7;
}

.toolbar-btn.active {
  background: #f59e0b;
  color: white;
  border-color: #f59e0b;
}

.toolbar-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #92400e;
}

.btn-cancel {
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: #ef4444;
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.toolbar-info {
  margin-left: auto;
  font-size: 13px;
  color: #666;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow: hidden;
}

.graph-container {
  width: 100%;
  height: 100%;
  background: 
    linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px),
    linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px);
  background-size: 20px 20px;
  background-color: #fafafa;
}

.graph-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.graph-svg:active {
  cursor: grabbing;
}

/* 图例 */
.legend {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background: white;
  border-top: 1px solid #e5e5e5;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.legend-line {
  width: 24px;
  height: 2px;
  background: #999;
}

.legend-line.dashed {
  background: repeating-linear-gradient(
    to right,
    #999 0,
    #999 4px,
    transparent 4px,
    transparent 8px
  );
}

/* 按钮 */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: #e5e5e5;
  color: #333;
}

.btn-secondary:hover {
  background: #d1d1d1;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-success:hover {
  background: #059669;
}

.btn-success:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #666;
  cursor: pointer;
  line-height: 1;
}

.btn-close:hover {
  color: #333;
}

/* 弹窗 */
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
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e5e5;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e5e5;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
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
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #3b82f6;
}

.warning-text {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}

/* 加载动画 */
.spinner {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 3px solid #e5e5e5;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>