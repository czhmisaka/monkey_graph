<template>
  <div class="graph-panel" ref="containerRef">
    <canvas ref="canvasRef" class="graph-canvas"></canvas>
    <!-- 节点提示框 -->
    <div v-if="hoveredNode" 
         class="node-tooltip"
         :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-title">{{ hoveredNode.label }}</div>
      <div class="tooltip-type">{{ hoveredNode.type }}</div>
      <div v-if="hoveredNode.properties" class="tooltip-props">
        <div v-for="(value, key) in hoveredNode.properties" :key="key" class="tooltip-prop">
          {{ key }}: {{ typeof value === 'object' ? JSON.stringify(value) : value }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { graphAPI } from '../../api'
import { EdgeIndex, SpatialIndex } from '../../utils/graphOptimizers'

const props = defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  edges: {
    type: Array,
    default: () => []
  },
  settings: {
    type: Object,
    default: () => ({ nodeTypes: {}, edgeTypes: {} })
  }
})

const emit = defineEmits(['node-click', 'edge-click', 'refresh', 'loaded'])

// DOM 引用
const containerRef = ref(null)
const canvasRef = ref(null)

// 状态
const hoveredNode = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
const selectedNode = ref(null)

// 拖拽状态标志
const isDragging = ref(false)

// 高亮状态
const highlightedNodeId = ref(null)
const relatedNodeIds = ref(new Set())
const relatedEdgeIds = ref(new Set())

// 位置保存相关
const saveTimeout = ref(null)
const graphId = ref(null)

// 流式加载状态
const streamingNodes = ref([])
const streamingEdges = ref([])
const loadProgress = ref({ loaded: 0, total: 0 })

// Canvas 上下文
let ctx = null
let canvas = null

// D3 变量
let simulation = null

// 变换状态（缩放和平移）
let transform = d3.zoomIdentity

// ========== 性能优化：使用优化后的索引 ==========

// 四叉树索引
let quadtree = null

// 空间索引（四叉树 + 网格）
let spatialIndex = null

// 边索引
let edgeIndex = null

// 视口边界（用于裁剪）
const viewportPadding = 100

// 最大可见边数量限制
const MAX_VISIBLE_EDGES = 2000

// LOD 细节层次阈值 - 针对大规模图谱优化
const LOD_LEVELS = {
  MEGA_FAR: { maxNodes: Infinity, nodeSize: 2, showLabels: false, showEdges: false, edgeOpacity: 0 },
  FAR: { maxNodes: 5000, nodeSize: 4, showLabels: false, showEdges: false, edgeOpacity: 0 },
  MEDIUM: { maxNodes: 2000, nodeSize: 8, showLabels: true, showEdges: false, edgeOpacity: 0.1 },
  CLOSE: { maxNodes: 500, nodeSize: 12, showLabels: true, showEdges: true, edgeOpacity: 0.5 },
  FOCUS: { maxNodes: 100, nodeSize: 16, showLabels: true, showEdges: true, edgeOpacity: 1 }
}

// 渲染节流
let renderScheduled = false
let lastRenderTime = 0
const RENDER_THROTTLE_MS = 16

// 节点类型颜色映射
const defaultNodeColors = {
  person: '#4A90D9',
  organization: '#50C878',
  concept: '#9B59B6',
  location: '#F39C12',
  default: '#95A5A6'
}

const MAX_NODE_WIDTH = 200

// 动态获取节点颜色
const getNodeColor = (type) => {
  if (props.settings?.nodeTypes?.[type]?.color) {
    return props.settings.nodeTypes[type].color
  }
  return defaultNodeColors[type] || defaultNodeColors.default
}

// ========== 缓存优化 ==========
const textWidthCache = new Map()
const nodeSizeCache = new Map()

// 文本测量（带缓存）
const getTextWidth = (text, fontSize = 12) => {
  if (!text) return 0
  const key = `${text}-${fontSize}`
  if (textWidthCache.has(key)) {
    return textWidthCache.get(key)
  }
  
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas')
    measureCtx = measureCanvas.getContext('2d')
  }
  measureCtx.font = `${fontSize}px sans-serif`
  const width = measureCtx.measureText(text).width + 10
  
  if (textWidthCache.size > 10000) {
    textWidthCache.clear()
  }
  textWidthCache.set(key, width)
  return width
}

let measureCanvas = null
let measureCtx = null

const truncateText = (text, maxWidth, fontSize = 12) => {
  if (!text) return ''
  const width = getTextWidth(text, fontSize)
  if (width <= maxWidth) return text
  return text.substring(0, Math.floor(text.length * maxWidth / width) - 2) + '...'
}

// 节点大小缓存
const getNodeSize = (node) => {
  const nodeId = node.id
  if (nodeSizeCache.has(nodeId)) {
    return nodeSizeCache.get(nodeId)
  }
  
  const label = node.label || ''
  const type = node.type || 'default'
  const props = node.properties || {}
  
  let content = type
  if (props && Object.keys(props).length > 0) {
    const firstKey = Object.keys(props)[0]
    const firstProp = props[firstKey]
    content = `${type}: ${typeof firstProp === 'string' ? firstProp : '...'}`
  }
  
  const labelWidth = getTextWidth(label, 12)
  const contentWidth = getTextWidth(content, 10)
  const rawMaxWidth = Math.max(labelWidth, contentWidth) + 20
  
  const maxWidth = Math.min(rawMaxWidth, MAX_NODE_WIDTH)
  const size = Math.max(maxWidth / 2, 22)
  
  if (nodeSizeCache.size > 20000) {
    nodeSizeCache.clear()
  }
  nodeSizeCache.set(nodeId, size)
  return size
}

// 保存节点位置的 Map
const nodePositions = new Map()

// 节点数据（包含计算后的位置）
let nodesData = []
let edgesData = []

// 高亮功能
const highlightNode = (node, retryCount = 0) => {
  if (!node) return
  
  const nodeId = node.id
  highlightedNodeId.value = nodeId
  
  const relatedNodes = new Set()
  const relatedEdges = new Set()
  
  props.edges.forEach(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    
    if (sourceId === nodeId || targetId === nodeId) {
      relatedEdges.add(edge.id)
      if (sourceId === nodeId) {
        relatedNodes.add(targetId)
      } else {
        relatedNodes.add(sourceId)
      }
    }
  })
  
  relatedNodeIds.value = relatedNodes
  relatedEdgeIds.value = relatedEdges
  
  nextTick(() => {
    render()
  })
}

const clearHighlight = () => {
  highlightedNodeId.value = null
  relatedNodeIds.value = new Set()
  relatedEdgeIds.value = new Set()
  render()
}

const highlightNodesByIds = (nodeIds, colors) => {
  render()
}

// ========== 流式加载功能 ==========

// 外部回调（由 Home.vue 设置）
let externalOnBatch = null
let externalOnProgress = null

/**
 * 流式加载图谱数据
 * 使用 SSE 分批获取节点和边，实时更新可视化
 */
const loadGraphStream = async (id, onBatch, onProgress) => {
  graphId.value = id
  streamingNodes.value = []
  streamingEdges.value = []
  loadProgress.value = { loaded: 0, total: 0 }

  // 保存外部回调
  externalOnBatch = onBatch
  externalOnProgress = onProgress

  try {
    console.log('[ForceGraphPanel] 开始流式加载图谱', id)
    
    await graphAPI.getGraphStream(
      id,
      // 每批数据回调
      (data) => {
        if (data.type === 'nodes_batch') {
          // 添加新节点到本地
          streamingNodes.value.push(...data.batch)
          // 调用外部回调（Home.vue 需要这个来更新 graphData）
          if (externalOnBatch) {
            externalOnBatch({ type: 'nodes', batch: data.batch, ...data })
          }
          // 立即更新可视化
          updateGraphWithStreamingData()
        } else if (data.type === 'edges_batch') {
          // 添加新边到本地
          streamingEdges.value.push(...data.batch)
          // 调用外部回调（Home.vue 需要这个来更新 graphData）
          if (externalOnBatch) {
            externalOnBatch({ type: 'edges', batch: data.batch, ...data })
          }
          // 更新边的可视化
          updateStreamingEdges()
        }
      },
      // 进度回调
      (loaded, total, type) => {
        loadProgress.value = { loaded, total }
        if (externalOnProgress) {
          externalOnProgress(loaded, total, type)
        }
        if (onProgress) {
          onProgress(loaded, total, type)
        }
      }
    )
    
    console.log(`[ForceGraphPanel] 流式加载完成: ${streamingNodes.value.length} 节点, ${streamingEdges.value.length} 边`)
    console.log(`[ForceGraphPanel] edges 数据预览:`, streamingEdges.value.slice(0, 3))
    
    // 加载完成后，通过 emit 通知 Home.vue 更新 graphData
    const emitData = {
      nodes: [...streamingNodes.value],
      edges: [...streamingEdges.value]
    }
    console.log(`[ForceGraphPanel] 准备发送 loaded 事件:`, { 
      nodesCount: emitData.nodes.length, 
      edgesCount: emitData.edges.length 
    })
    emit('loaded', emitData)
    console.log(`[ForceGraphPanel] loaded 事件已发送`)
  } catch (error) {
    console.error('[ForceGraphPanel] 流式加载失败:', error)
    throw error
  }
}

/**
 * 处理来自 Home.vue 的流式批次数据
 * 用于接收通过 props 更新的数据
 * 
 * 注意：这里直接使用 ForceGraphPanel 内部的数据，
 * 因为流式加载时数据会先存储到 streamingNodes/streamingEdges
 * 然后 emit('loaded') 通知 Home.vue
 */
const handleStreamingBatch = (data) => {
  console.log('[ForceGraphPanel] handleStreamingBatch:', data.type, data.batch?.length || 0)
  
  // 这里实际上不需要处理，因为数据已经在 loadGraphStream 中累积了
  // 但为了兼容其他调用方，保留这个方法
  if (data.type === 'nodes' && data.batch) {
    // 追加新节点
    data.batch.forEach(node => {
      if (!streamingNodes.value.find(n => n.id === node.id)) {
        streamingNodes.value.push(node)
      }
    })
    updateGraphWithStreamingData()
  } else if (data.type === 'edges' && data.batch) {
    // 追加新边
    data.batch.forEach(edge => {
      if (!streamingEdges.value.find(e => e.id === edge.id)) {
        streamingEdges.value.push(edge)
      }
    })
    updateStreamingEdges()
  }
}

/**
 * 计算现有节点群的边界中心
 */
const getExistingClusterCenter = () => {
  if (nodesData.length === 0) {
    // 如果没有现有节点，返回画布中心
    const container = containerRef.value
    return {
      x: container?.clientWidth / 2 || 400,
      y: container?.clientHeight / 2 || 300
    }
  }
  
  // 计算所有现有节点的中心位置
  let sumX = 0, sumY = 0
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let validCount = 0
  
  for (const node of nodesData) {
    if (node.x !== undefined && node.y !== undefined && !isNaN(node.x) && !isNaN(node.y)) {
      sumX += node.x
      sumY += node.y
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x)
      minY = Math.min(minY, node.y)
      maxY = Math.max(maxY, node.y)
      validCount++
    }
  }
  
  if (validCount === 0) {
    const container = containerRef.value
    return {
      x: container?.clientWidth / 2 || 400,
      y: container?.clientHeight / 2 || 300
    }
  }
  
  return {
    x: sumX / validCount,
    y: sumY / validCount,
    minX, maxX, minY, maxY,
    spreadX: maxX - minX,
    spreadY: maxY - minY
  }
}

/**
 * 在现有节点群边缘放置新节点
 */
const placeNewNodeAtEdge = (node, clusterCenter, existingCount) => {
  const offset = 100 + Math.random() * 50  // 距离边缘的偏移
  
  // 随机选择一个方向（上下左右或四个角）
  const angle = Math.random() * Math.PI * 2
  const edgeX = clusterCenter.x + Math.cos(angle) * (clusterCenter.spreadX / 2 + offset)
  const edgeY = clusterCenter.y + Math.sin(angle) * (clusterCenter.spreadY / 2 + offset)
  
  // 添加小量随机偏移，使位置更自然
  const jitter = 30
  return {
    ...node,
    x: edgeX + (Math.random() - 0.5) * jitter,
    y: edgeY + (Math.random() - 0.5) * jitter
  }
}

/**
 * 使用流式数据增量更新图谱（不刷新整个图谱）
 */
const updateGraphWithStreamingData = () => {
  if (!simulation) return
  
  const allNodes = streamingNodes.value
  const allEdges = streamingEdges.value
  
  if (allNodes.length === 0) return
  
  // 获取现有节点数量，用于判断新增节点
  const existingNodeIds = new Set(nodesData.map(n => n.id))
  const existingEdgeIds = new Set(edgesData.map(e => e.id))
  
  // 计算现有节点群的中心
  const clusterCenter = getExistingClusterCenter()
  
  // 增量更新节点数据：只添加新节点，不重建现有节点
  const newNodes = allNodes
    .filter(n => !existingNodeIds.has(n.id))
    .map((n, index) => {
      const existing = nodePositions.get(n.id)
      if (existing?.x !== undefined && existing?.y !== undefined) {
        // 使用保存的位置
        return { ...n, x: existing.x, y: existing.y }
      }
      // 在现有节点群边缘放置新节点
      return placeNewNodeAtEdge(n, clusterCenter, nodesData.length)
    })
  
  // 增量更新边数据：只添加新边
  const newEdges = allEdges
    .filter(e => !existingEdgeIds.has(e.id))
    .map(e => ({ ...e }))
  
  // 如果没有新节点或边，直接返回
  if (newNodes.length === 0 && newEdges.length === 0) {
    return
  }
  
  console.log(`[ForceGraphPanel] 增量更新: +${newNodes.length} 个节点, +${newEdges.length} 条边`)
  
  // 保存新节点的位置
  newNodes.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y })
    }
  })
  
  // 更新节点数据：现有节点保持不变，只添加新节点
  nodesData = [...nodesData, ...newNodes]
  
  // 更新边数据：规范化边数据并添加新边
  edgesData = [...edgesData, ...normalizeEdges(newEdges, nodesData)]
  
  // 重新构建四叉树
  buildQuadtree()
  
  // 更新模拟：使用 nodes() 替换所有节点（这是必要的，因为 D3 需要知道所有节点）
  // 但设置一个较小的 alpha，让现有节点只做微调，新节点自然融入
  simulation.nodes(nodesData)
  simulation.force('link').links(edgesData)
  
  // 如果有新节点，给予较大的 alpha 让新节点融入
  // 如果只有新边，给予较小的 alpha
  const alphaValue = newNodes.length > 0 ? 0.3 : 0.1
  simulation.alpha(alphaValue).restart()
  
  requestAnimationFrame(render)
}

/**
 * 更新流式加载的边（增量更新，不刷新整个图谱）
 */
const updateStreamingEdges = () => {
  if (!simulation) return
  
  // 获取现有边的 ID
  const existingEdgeIds = new Set(edgesData.map(e => e.id))
  
  // 过滤出新的边
  const newEdges = streamingEdges.value
    .filter(e => !existingEdgeIds.has(e.id))
    .map(e => ({ ...e }))
  
  // 如果没有新边，直接返回
  if (newEdges.length === 0) {
    return
  }
  
  console.log(`[ForceGraphPanel] 增量更新边: +${newEdges.length} 条边`)
  
  // 增量更新边数据：规范化边数据并添加新边
  edgesData = [...edgesData, ...normalizeEdges(newEdges, nodesData)]
  
  // 更新 simulation 的边连接
  if (simulation.force('link')) {
    simulation.force('link').links(edgesData)
    // 给予较小的 alpha，让布局只有轻微调整
    simulation.alpha(0.1).restart()
  }
  
  requestAnimationFrame(render)
}

// 规范化边数据：将字符串 source/target 转换为对象引用
const normalizeEdges = (edges, nodes) => {
  if (!edges || !nodes) return []
  
  const nodeMap = new Map()
  nodes.forEach(n => nodeMap.set(n.id, n))
  
  return edges.map(edge => {
    // 获取 source 和 target 的 ID
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
    
    // 查找对应的节点对象
    const source = nodeMap.get(sourceId)
    const target = nodeMap.get(targetId)
    
    // 返回规范化后的边
    return {
      ...edge,
      source: source || sourceId,  // 如果找不到对应的节点，保留原始值
      target: target || targetId   // 如果找不到对应的节点，保留原始值
    }
  })
}

// 构建四叉树空间索引
const buildQuadtree = () => {
  if (nodesData.length === 0) {
    quadtree = null
    return
  }
  
  const xMin = Math.min(...nodesData.map(n => n.x)) - 100
  const xMax = Math.max(...nodesData.map(n => n.x)) + 100
  const yMin = Math.min(...nodesData.map(n => n.y)) - 100
  const yMax = Math.max(...nodesData.map(n => n.y)) + 100
  
  quadtree = d3.quadtree()
    .x(d => d.x)
    .y(d => d.y)
    .extent([[xMin, yMin], [xMax, yMax]])
    .addAll(nodesData)
}

// 暴露方法
defineExpose({
  highlightNode,
  highlightNodesByIds,
  clearHighlight,
  setGraphId: (id) => { graphId.value = id },
  getSelectedNode: () => selectedNode.value,
  getSvgElement: () => canvasRef.value,
  getContainerElement: () => containerRef.value,
  loadGraphStream,
  handleStreamingBatch
})

// 获取视口内的节点（带缓冲）
// 注意：不依赖 quadtree 裁剪——四叉树 extent 基于建立时的坐标固定，
// 而力导向模拟持续更新节点坐标，导致索引陈旧、缩放时部分节点被错误剔除。
// 直接遍历 nodesData（小图开销可忽略；大图本就分批渲染）。
const getVisibleNodes = () => {
  if (!canvas) return nodesData
  
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  
  const scale = transform.k
  const tx = transform.x
  const ty = transform.y
  
  const minX = (-tx / scale) - viewportPadding
  const maxX = (-tx + width) / scale + viewportPadding
  const minY = (-ty / scale) - viewportPadding
  const maxY = (-ty + height) / scale + viewportPadding
  
  const visibleNodes = []
  for (const n of nodesData) {
    const x = n.x
    const y = n.y
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      visibleNodes.push(n)
    }
  }
  
  return visibleNodes
}

// 获取视口内的边
const getVisibleEdges = () => {
  if (!canvas) return edgesData
  
  const visibleNodeIds = new Set(getVisibleNodes().map(n => n.id))
  
  return edgesData.filter(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
  })
}

// 使用四叉树查找最近的节点（用于点击和hover检测）
const findNodeAtPoint = (x, y) => {
  if (!nodesData || nodesData.length === 0) {
    return null
  }
  
  // 直接线性搜索所有节点
  for (const node of nodesData) {
    if (node.x === undefined || node.y === undefined || isNaN(node.x) || isNaN(node.y)) {
      continue
    }
    
    const dx = x - node.x
    const dy = y - node.y
    const size = getNodeSize(node)
    
    // 检查点是否在节点范围内（矩形区域）
    if (Math.abs(dx) <= size && Math.abs(dy) <= 22) {
      return node
    }
  }
  
  return null
}

// 初始化 Canvas
const initGraph = () => {
  if (!containerRef.value || !canvasRef.value) return
  
  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight
  
  canvas = canvasRef.value
  canvas.width = width
  canvas.height = height
  ctx = canvas.getContext('2d')
  
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  
  // 处理高清屏：显式设置基础变换（不累加 scale，避免 resize 后 dpr 缩放重复叠加）
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  
  const nodeCount = props.nodes?.length || 0
  
  // 使用标准力导向图
  simulation = d3.forceSimulation()
    .velocityDecay(0.4)
    .force('link', d3.forceLink().id(d => d.id).distance(70))
    .force('charge', d3.forceManyBody().strength(d => -getNodeSize(d) * 4))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))
    .force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 20))
    .force('radial', d3.forceRadial(
      Math.min(width, height) / 4,
      width / 2,
      height / 2
    ).strength(0.08))
    
  simulation.on('tick', () => {
    requestAnimationFrame(render)
  })
  
  // 拖拽状态变量
  let draggedNode = null
  let hasDragged = false
  let dragStartPos = { x: 0, y: 0 }
  
  // 设置缩放行为
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .filter((event) => {
      if (draggedNode) {
        return false
      }
      if (event.button === 0) {
        const rect = canvas.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        const [graphX, graphY] = transform.invert([x, y])
        const node = findNodeAtPoint(graphX, graphY)
        if (node) {
          return false
        }
      }
      return true
    })
    .on('zoom', (event) => {
      transform = event.transform
      requestAnimationFrame(render)
    })
  
  // 使用 D3 的 drag 行为来处理节点拖拽
  const drag = d3.drag()
    .container(canvas)
    .subject((event) => {
      const [graphX, graphY] = transform.invert([event.x, event.y])
      return findNodeAtPoint(graphX, graphY)
    })
    .on('start', (event) => {
      if (!event.subject) return
      draggedNode = event.subject
      hasDragged = false
      dragStartPos = { x: event.sourceEvent.clientX, y: event.sourceEvent.clientY }
      
      if (simulation && !event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
      canvas.style.cursor = 'grabbing'
    })
    .on('drag', (event) => {
      if (!draggedNode) return
      
      const dx = Math.abs(event.sourceEvent.clientX - dragStartPos.x)
      const dy = Math.abs(event.sourceEvent.clientY - dragStartPos.y)
      if (dx > 3 || dy > 3) {
        hasDragged = true
      }
      
      const [graphX, graphY] = transform.invert([event.x, event.y])
      draggedNode.fx = graphX
      draggedNode.fy = graphY
      
      requestAnimationFrame(render)
    })
    .on('end', (event) => {
      if (!draggedNode) return
      
      if (simulation && !event.active) simulation.alphaTarget(0)
      draggedNode.fx = null
      draggedNode.fy = null
      
      if (hasDragged && draggedNode.x !== undefined && draggedNode.y !== undefined) {
        nodePositions.set(draggedNode.id, { x: draggedNode.x, y: draggedNode.y })
        saveNodePositions()
      }
      
      if (!hasDragged) {
        selectedNode.value = draggedNode
        emit('node-click', draggedNode)
        requestAnimationFrame(render)
      }
      
      draggedNode = null
      hasDragged = false
      canvas.style.cursor = 'grab'
    })
  
  d3.select(canvas).call(drag)
  d3.select(canvas).call(zoom)
  
  // 点击空白区域处理
  canvas.addEventListener('click', (e) => {
    if (hasDragged) {
      return
    }
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const [graphX, graphY] = transform.invert([x, y])
    
    const node = findNodeAtPoint(graphX, graphY)
    if (!node) {
      const visibleEdges = getVisibleEdges()
      for (const edge of visibleEdges) {
        // 解析 source 和 target：支持字符串 ID 或对象引用
        const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
        const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
        
        // 查找对应的节点对象
        const source = sourceId ? nodesData.find(n => n.id === sourceId) : null
        const target = targetId ? nodesData.find(n => n.id === targetId) : null
        
        if (source && target) {
          const dist = pointToLineDistance(graphX, graphY, source.x, source.y, target.x, target.y)
          if (dist < 5) {
            emit('edge-click', edge)
            return
          }
        }
      }
    }
  })
  
  // 鼠标移动处理 hover
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const [graphX, graphY] = transform.invert([x, y])
    
    const found = findNodeAtPoint(graphX, graphY)
    
    if (found) {
      hoveredNode.value = found
      tooltipPos.value = {
        x: e.clientX - rect.left + 10,
        y: e.clientY - rect.top + 10
      }
      highlightNode(found)
      canvas.style.cursor = 'pointer'
    } else {
      hoveredNode.value = null
      clearHighlight()
      canvas.style.cursor = 'grab'
    }
  })
  
  canvas.addEventListener('mouseleave', () => {
    hoveredNode.value = null
    clearHighlight()
  })
  
  updateGraph()
}


// 计算点到线段的距离
function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1
  const B = py - y1
  const C = x2 - x1
  const D = y2 - y1
  
  const dot = A * C + B * D
  const lenSq = C * C + D * D
  let param = -1
  
  if (lenSq !== 0) param = dot / lenSq
  
  let xx, yy
  
  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }
  
  const dx = px - xx
  const dy = py - yy
  
  return Math.sqrt(dx * dx + dy * dy)
}

// 主渲染函数
const render = () => {
  if (!ctx || !canvas) return
  
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  
  // 清空画布
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
  
  // 获取视口内可见的节点和边
  const visibleNodes = getVisibleNodes()
  const visibleEdges = getVisibleEdges()
  
  // 构建节点查找表，避免循环内 O(N) find 导致 O(N²)
  const nodesById = new Map(nodesData.map(n => [n.id, n]))
  
  // 应用变换
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)
  
  // 绘制边
  for (const edge of visibleEdges) {
    // 解析 source 和 target：支持字符串 ID 或对象引用
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
    
    // 查找对应的节点对象
    const source = sourceId ? nodesById.get(sourceId) || null : null
    const target = targetId ? nodesData.find(n => n.id === targetId) : null
    
    if (!source || !target) continue
    
    const isRelated = relatedEdgeIds.value.has(edge.id)
    const isHighlighted = highlightedNodeId.value && 
      (sourceId === highlightedNodeId.value || targetId === highlightedNodeId.value)
    
    if (isHighlighted || isRelated) {
      ctx.strokeStyle = '#FF4500'
      ctx.lineWidth = 3
      ctx.globalAlpha = 1
    } else {
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.8
    }
    
    ctx.setLineDash([5, 3])
    ctx.beginPath()
    
    // 自环
    if (source.id === target.id) {
      ctx.moveTo(source.x, source.y - 25)
      ctx.bezierCurveTo(
        source.x - 40, source.y - 60,
        source.x + 40, source.y - 60,
        source.x, source.y - 25
      )
    } else {
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
    }
    
    ctx.stroke()
    
    // 绘制边标签
    if (edge.label) {
      const mx = (source.x + target.x) / 2
      const my = (source.y + target.y) / 2 - 8
      
      ctx.setLineDash([])
      const textWidth = getTextWidth(edge.label, 9)
      
      ctx.fillStyle = 'white'
      ctx.strokeStyle = isHighlighted ? '#FF4500' : '#ddd'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(mx - textWidth / 2, my - 6, textWidth, 14, 4)
      ctx.fill()
      ctx.stroke()
      
      ctx.fillStyle = isHighlighted ? '#FF4500' : '#666'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(edge.label, mx, my + 1)
    }
  }
  
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  
  // 绘制节点（完整卡片模式）
  for (const node of visibleNodes) {
    const size = getNodeSize(node)
    const x = node.x
    const y = node.y
    
    const isHovered = hoveredNode.value?.id === node.id
    const isSelected = selectedNode.value?.id === node.id
    const isRelated = relatedNodeIds.value.has(node.id)
    const isHighlighted = highlightedNodeId.value === node.id
    
    let strokeColor = getNodeColor(node.type)
    let strokeWidth = 2
    let fillColor = 'white'
    let globalAlpha = 1
    
    if (isHighlighted) {
      strokeColor = '#FF4500'
      strokeWidth = 4
      fillColor = '#FFF5F0'
    } else if (isHovered || isSelected) {
      strokeColor = '#FF4500'
      strokeWidth = 3
      fillColor = '#FFF5F0'
    } else if (isRelated) {
      strokeColor = getNodeColor(node.type)
      strokeWidth = 3
      fillColor = '#F0F8FF'
    } else if (relatedNodeIds.value.size > 0) {
      globalAlpha = 0.4
    }
    
    ctx.globalAlpha = globalAlpha
    
    // 绘制节点背景（圆角矩形）
    ctx.fillStyle = fillColor
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    
    ctx.beginPath()
    ctx.roundRect(x - size, y - 22, size * 2, 44, 8)
    ctx.fill()
    ctx.stroke()
    
    // 绘制标签
    ctx.fillStyle = strokeColor
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const truncatedLabel = truncateText(node.label || '', MAX_NODE_WIDTH, 12)
    ctx.fillText(truncatedLabel, x, y - 4)
    
    // 绘制内容
    ctx.fillStyle = '#888'
    ctx.font = '10px sans-serif'
    
    const type = node.type || 'default'
    const props = node.properties || {}
    let content = type
    if (Object.keys(props).length > 0) {
      const firstProp = props[Object.keys(props)[0]]
      const firstVal = typeof firstProp === 'string' ? firstProp : JSON.stringify(firstProp)
      content = `${type}: ${firstVal}`
    }
    
    const truncatedContent = truncateText(content, MAX_NODE_WIDTH, 10)
    ctx.fillText(truncatedContent, x, y + 14)
    
    // 同步坐标
    const dataNode = nodesById.get(node.id)
    if (dataNode) {
      dataNode.x = node.x
      dataNode.y = node.y
      nodePositions.set(node.id, { x: node.x, y: node.y })
    }
  }
  
  ctx.restore()
}

// 检查节点坐标是否有效
const hasValidPositions = (nodes) => {
  if (!nodes || nodes.length < 2) return true
  
  let validCount = 0
  let sumX = 0, sumY = 0
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  for (const n of nodes) {
    if (n.x !== undefined && n.y !== undefined && !isNaN(n.x) && !isNaN(n.y)) {
      validCount++
      sumX += n.x
      sumY += n.y
      minX = Math.min(minX, n.x)
      maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y)
      maxY = Math.max(maxY, n.y)
    }
  }
  
  if (validCount < nodes.length * 0.5) return false
  
  const spreadX = maxX - minX
  const spreadY = maxY - minY
  
  return spreadX > 100 || spreadY > 100
}

// 更新图谱数据
const updateGraph = () => {
  const container = containerRef.value
  const width = container?.clientWidth || 800
  const height = container?.clientHeight || 600
  
  const centerX = width / 2
  const centerY = height / 2
  
  const propsHasValidPositions = hasValidPositions(props.nodes)
  const savedPositionsValid = nodePositions.size > 0 && hasValidPositions(Array.from(nodePositions.values()).map(p => ({ x: p.x, y: p.y })))
  
  const shouldRedistribute = !propsHasValidPositions && !savedPositionsValid
  
  if (shouldRedistribute) {
    console.log('检测到节点聚集，强制重新分布')
  }
  
  nodesData = props.nodes.map((n, index) => {
    const existing = nodePositions.get(n.id)
    let x, y
    
    if (!shouldRedistribute && existing?.x !== undefined && existing?.y !== undefined) {
      x = existing.x
      y = existing.y
    } else if (!shouldRedistribute && n.x !== undefined && n.y !== undefined && !isNaN(n.x) && !isNaN(n.y)) {
      x = n.x
      y = n.y
    } else {
      const cols = Math.ceil(Math.sqrt(props.nodes.length))
      const row = Math.floor(index / cols)
      const col = index % cols
      
      const gridX = (col - (cols - 1) / 2) * 160
      const gridY = (row - (Math.ceil(props.nodes.length / cols) - 1) / 2) * 120
      
      const randomOffset = 60
      x = centerX + gridX + (Math.random() - 0.5) * randomOffset
      y = centerY + gridY + (Math.random() - 0.5) * randomOffset
    }
    
    return { ...n, x, y }
  })
  
  nodesData.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y })
    }
  })
  
  // 规范化边数据：将字符串 source/target 转换为对象引用
  edgesData = normalizeEdges(props.edges, nodesData)
  
  buildQuadtree()
  
  if (simulation) {
    simulation.nodes(nodesData)
    simulation.force('link').links(edgesData)
    
    if (shouldRedistribute) {
      simulation.alpha(1).restart()
    } else {
      simulation.alpha(0.3).restart()
    }
  } else {
    requestAnimationFrame(render)
  }
}

// 保存节点位置
const saveNodePositions = async () => {
  if (!graphId.value) return
  
  const positions = []
  nodePositions.forEach((pos, id) => {
    positions.push({ id, x: pos.x, y: pos.y })
  })
  
  if (positions.length === 0) return
  
  if (saveTimeout.value) {
    clearTimeout(saveTimeout.value)
  }
  
  saveTimeout.value = setTimeout(async () => {
    try {
      await graphAPI.updateNodePositions(graphId.value, positions)
      console.log('节点位置已保存')
    } catch (error) {
      console.error('保存节点位置失败:', error)
    }
  }, 1000)
}

// 监听数据变化
watch(() => props.nodes, () => {
  if (isDragging.value) return
  nextTick(updateGraph)
}, { deep: true })

watch(() => props.edges, () => {
  if (isDragging.value) return
  nextTick(updateGraph)
}, { deep: true })

watch(() => props.settings, () => {
  nextTick(render)
}, { deep: true })

// 窗口大小变化
let resizeObserver = null

onMounted(() => {
  nextTick(initGraph)
  
  resizeObserver = new ResizeObserver(() => {
    if (containerRef.value && canvas && ctx) {
      const width = containerRef.value.clientWidth
      const height = containerRef.value.clientHeight
      
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
      // 显式重置基础变换，而不是累加 scale，确保 dpr 缩放不重复叠加
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      
      if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2))
        simulation.alpha(0.3).restart()
      }
      requestAnimationFrame(render)
    }
  })
  
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  // 停止 simulation
  if (simulation) {
    simulation.stop()
    simulation = null
  }
  
  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // 清理定时器
  if (saveTimeout.value) {
    clearTimeout(saveTimeout.value)
    saveTimeout.value = null
  }
  
  // 清理 Canvas
  ctx = null
  canvas = null
})
</script>

<style scoped>
.graph-panel {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: 
    linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px),
    linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px);
  background-size: 20px 20px;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.graph-canvas:active {
  cursor: grabbing;
}

.node-tooltip {
  position: absolute;
  padding: 8px 12px;
  background: var(--color-black);
  color: var(--color-white);
  border-radius: var(--radius-md);
  font-size: 12px;
  pointer-events: none;
  z-index: 100;
  box-shadow: var(--shadow-md);
}

.tooltip-title {
  font-weight: 600;
  font-family: var(--font-display);
}

.tooltip-type {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.tooltip-props {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.tooltip-prop {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 2px;
  word-break: break-all;
}
</style>