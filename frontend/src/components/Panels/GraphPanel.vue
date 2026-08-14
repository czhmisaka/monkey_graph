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
import { graphAPI } from '../api'
import { EdgeIndex, SpatialIndex } from '../utils/graphOptimizers'

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

const emit = defineEmits(['node-click', 'edge-click', 'refresh'])

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

// Canvas 上下文
let ctx = null
let canvas = null

// D3 变量
let simulation = null

// 变换状态（缩放和平移）
let transform = d3.zoomIdentity

// ========== Web Worker 力导向计算 ==========
let forceWorker = null
let useWorker = false // 控制是否使用 Worker

// 初始化 Worker
const initWorker = () => {
  if (forceWorker) return
  
  try {
    forceWorker = new Worker(new URL('../workers/forceWorker.js', import.meta.url), { type: 'module' })
    
    forceWorker.onmessage = (e) => {
      const { type, nodes: updatedNodes, alpha, tickCount, reason } = e.data
      
      switch (type) {
        case 'tick':
          // 更新节点位置
          updatedNodes.forEach(update => {
            const node = nodesData.find(n => n.id === update.id)
            if (node) {
              node.x = update.x
              node.y = update.y
              nodePositions.set(update.id, { x: update.x, y: update.y })
            }
          })
          // 继续渲染
          if (!isDragging.value) {
            requestAnimationFrame(render)
          }
          break
          
        case 'completed':
          console.log('[GraphPanel] Worker 计算完成')
          break
          
        case 'stopped':
          console.log('[GraphPanel] Worker 停止:', reason)
          break
      }
    }
    
    forceWorker.onerror = (err) => {
      console.error('[GraphPanel] Worker 错误:', err)
      // 回退到主线程计算
      useWorker = false
      initD3Simulation()
    }
    
    console.log('[GraphPanel] Web Worker 已初始化')
  } catch (err) {
    console.error('[GraphPanel] Worker 初始化失败:', err)
    useWorker = false
  }
}

// 向 Worker 发送消息
const postToWorker = (type, data = {}) => {
  if (!forceWorker) return
  forceWorker.postMessage({ type, ...data })
}

// 停止 Worker
const stopWorker = () => {
  if (!forceWorker) return
  postToWorker('stop')
}

// 恢复 Worker
const resumeWorker = () => {
  if (!forceWorker) return
  postToWorker('resume')
}

// ========== D3 力导向计算（用于小规模数据） ==========

// 初始化 D3 力导向模拟
const initD3Simulation = (width, height, nodeCount) => {
  if (nodeCount >= 4000) {
    // 4K+ 节点：较弱力导向图（节点散开布局）
    simulation = d3.forceSimulation()
      .velocityDecay(0.8)  // 高衰减，快速稳定
      .force('link', d3.forceLink().id(d => d.id).distance(80))  // 较远连接距离
      .force('charge', d3.forceManyBody().strength(-100))  // 增加斥力让节点散开
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 30))  // 添加碰撞检测
    
    simulation.on('tick', () => {
      requestAnimationFrame(render)
    })
    console.log('D3: 大规模数据 (4K+)，启用极弱力导向图')
  } else if (nodeCount >= 2000) {
    // 2K-4K 节点：使用中等力导向图
    simulation = d3.forceSimulation()
      .velocityDecay(0.5)  // 适中衰减
      .force('link', d3.forceLink().id(d => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(d => -getNodeSize(d) * 3))  // 根据节点大小计算斥力
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1))
      .force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 25))
      .force('radial', d3.forceRadial(
        Math.min(width, height) / 4,
        width / 2,
        height / 2
      ).strength(0.05))  // 添加径向分布力
    
    simulation.on('tick', () => {
      requestAnimationFrame(render)
    })
    console.log('D3: 中等规模数据 (2K-4K)')
  } else {
    // <2K 节点：使用标准力导向图
    simulation = d3.forceSimulation()
      .velocityDecay(0.4)  // 适中衰减，让节点运动更平稳
      .force('link', d3.forceLink().id(d => d.id).distance(70))  // 适中连接距离
      .force('charge', d3.forceManyBody().strength(d => -getNodeSize(d) * 4))  // 斥力与节点大小相关
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))  // 较强的居中力
      .force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 20))  // 碰撞检测
      .force('radial', d3.forceRadial(
        Math.min(width, height) / 4,
        width / 2,
        height / 2
      ).strength(0.08))  // 径向分布力
    
    simulation.on('tick', () => {
      requestAnimationFrame(render)
    })
    console.log('D3: 小规模数据 (<2K)')
  }
}

// ========== 性能优化：使用优化后的索引 ==========



// 空间索引（四叉树 + 网格）
let spatialIndex = null

// 边索引
let edgeIndex = null

// 视口边界（用于裁剪）
const viewportPadding = 100 // 视口外缓冲区域

// 渲染节流
let renderScheduled = false
let lastRenderTime = 0
const RENDER_THROTTLE_MS = 16 // 约60fps

// 最大可见边数量限制
const MAX_VISIBLE_EDGES = 2000

// ========== 增量渲染配置 ==========
const RENDER_BUDGET = {
  nodesPerFrame: 500,      // 每帧最多渲染的节点数
  edgesPerFrame: 200,      // 每帧最多渲染的边数
  msPerFrame: 16          // 每帧最大耗时（ms），保持60fps
}

// 增量渲染状态
let renderState = {
  visibleNodes: [],       // 当前帧要渲染的节点
  visibleEdges: [],       // 当前帧要渲染的边
  nodeIndex: 0,           // 当前渲染到的节点索引
  edgeIndex: 0,          // 当前渲染到的边索引
  lastFrameTime: 0,       // 上一帧的时间
  isIncremental: false,   // 是否正在进行增量渲染
  frameCount: 0          // 渲染帧计数
}

// LOD 细节层次阈值 - 针对大规模图谱优化
const LOD_LEVELS = {
  // 超远视图：概览模式（用于 10K+ 节点）
  MEGA_FAR: { maxNodes: Infinity, nodeSize: 2, showLabels: false, showEdges: false, edgeOpacity: 0 },
  // 远视图：圆点模式（用于 4K+ 节点）
  FAR: { maxNodes: 5000, nodeSize: 4, showLabels: false, showEdges: false, edgeOpacity: 0 },
  // 中等视图：基础模式
  MEDIUM: { maxNodes: 2000, nodeSize: 8, showLabels: true, showEdges: false, edgeOpacity: 0.1 },
  // 近视图：完整模式
  CLOSE: { maxNodes: 500, nodeSize: 12, showLabels: true, showEdges: true, edgeOpacity: 0.5 },
  // 聚焦视图：详细模式
  FOCUS: { maxNodes: 100, nodeSize: 16, showLabels: true, showEdges: true, edgeOpacity: 1 }
}

// 当前 LOD 级别
let currentLODLevel = LOD_LEVELS.CLOSE

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
  
  // 使用共享的 canvas
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas')
    measureCtx = measureCanvas.getContext('2d')
  }
  measureCtx.font = `${fontSize}px sans-serif`
  const width = measureCtx.measureText(text).width + 10
  
  // 限制缓存大小
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
  // 简化处理：直接截断
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
  
  // 限制缓存大小
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

// 高亮功能 - 使用边索引优化
const highlightNode = (node, retryCount = 0) => {
  if (!node) return
  
  const nodeId = node.id
  highlightedNodeId.value = nodeId
  
  // 使用边索引快速获取相关节点和边
  const relatedEdges = edgeIndex ? edgeIndex.getRelatedEdges(nodeId) : new Set()
  const relatedNodes = edgeIndex ? edgeIndex.getRelatedNodes(nodeId) : new Set()
  
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
  // 简化版本 - 暂时只触发重绘
  render()
}

// 暴露方法
defineExpose({
  highlightNode,
  highlightNodesByIds,
  clearHighlight,
  setGraphId: (id) => { graphId.value = id },
  getSelectedNode: () => selectedNode.value,
  getSvgElement: () => canvasRef.value,
  getContainerElement: () => containerRef.value
})

// 构建空间索引和边索引
const buildIndexes = () => {
  if (nodesData.length === 0) {
    spatialIndex = null
    edgeIndex = null
    return
  }
  
  // 构建空间索引
  spatialIndex = new SpatialIndex(50) // 50px 网格
  spatialIndex.build(nodesData)
  
  // 构建边索引
  edgeIndex = new EdgeIndex()
  edgeIndex.build(edgesData)
  
  console.log(`[GraphPanel] 索引构建完成: ${nodesData.length} 节点, ${edgesData.length} 边`)
}

// 兼容旧代码：构建四叉树（现在调用新的 buildIndexes）
const buildQuadtree = () => {
  buildIndexes()
}

// 获取当前 LOD 级别（根据节点数量和缩放级别）
const getLODLevel = () => {
  const scale = transform.k
  const nodeCount = nodesData.length
  
  // 根据节点数量选择 LOD 级别
  if (nodeCount >= 10000) {
    // 超大图谱：始终使用极简模式
    if (scale < 0.3) return LOD_LEVELS.MEGA_FAR
    if (scale < 0.8) return LOD_LEVELS.FAR
    if (scale < 2) return LOD_LEVELS.MEDIUM
    return LOD_LEVELS.CLOSE
  }
  
  if (nodeCount >= 4000) {
    // 大图谱
    if (scale < 0.5) return LOD_LEVELS.FAR
    if (scale < 1.5) return LOD_LEVELS.MEDIUM
    return LOD_LEVELS.CLOSE
  }
  
  if (nodeCount >= 2000) {
    // 中等图谱
    if (scale < 0.8) return LOD_LEVELS.MEDIUM
    if (scale < 2) return LOD_LEVELS.CLOSE
    return LOD_LEVELS.FOCUS
  }
  
  // 小图谱：始终显示详细信息
  if (scale < 0.5) return LOD_LEVELS.CLOSE
  return LOD_LEVELS.FOCUS
}

// 检查是否应该停止力导向图
const shouldStopSimulation = () => {
  const nodeCount = nodesData.length
  const lodLevel = getLODLevel()
  
  // 大规模图谱在远视时停止力导向图
  return nodeCount >= 4000 && (lodLevel === LOD_LEVELS.MEGA_FAR || lodLevel === LOD_LEVELS.FAR)
}

// 停止力导向图并锁定所有节点位置
const stopSimulation = () => {
  if (!simulation) return
  
  // 停止模拟
  simulation.stop()
  
  // 锁定所有节点位置
  nodesData.forEach(node => {
    node.vx = 0
    node.vy = 0
    node.fx = node.x
    node.fy = node.y
  })
  
  console.log('[GraphPanel] 大规模图谱模式：已停止力导向图')
}

// 恢复力导向图
const resumeSimulation = () => {
  if (!simulation) return
  
  // 解除所有节点的固定位置
  nodesData.forEach(node => {
    node.fx = null
    node.fy = null
  })
  
  // 重新启动模拟
  simulation.nodes(nodesData)
  simulation.alpha(0.3).restart()
  
  console.log('[GraphPanel] 已恢复力导向图')
}

// 查找最近的节点（点击/悬停检测）
// 注意：不使用 spatialIndex——索引基于建立时坐标固定，力导向移动后陈旧。
// 直接线性搜索 nodesData 实时坐标（与活跃组件一致）。
const findNodeAtPoint = (x, y) => {
  if (!nodesData || nodesData.length === 0) {
    return null
  }
  
  let closestNode = null
  let closestDist = 22 * 22
  
  for (const node of nodesData) {
    if (node.x === undefined || node.y === undefined || isNaN(node.x) || isNaN(node.y)) {
      continue
    }
    
    const dx = x - node.x
    const dy = y - node.y
    const distSq = dx * dx + dy * dy
    
    if (distSq < closestDist) {
      closestDist = distSq
      closestNode = node
    }
  }
  
  return closestNode
}

// 获取视口内的节点
const getVisibleNodes = () => {
  if (!canvas) return nodesData
  
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  
  // 计算变换后的视口范围
  const scale = transform.k
  const tx = transform.x
  const ty = transform.y
  
  // 视口在图谱坐标系中的范围
  const minX = (-tx / scale) - viewportPadding
  const maxX = (-tx + width) / scale + viewportPadding
  const minY = (-ty / scale) - viewportPadding
  const maxY = (-ty + height) / scale + viewportPadding
  
  // 注意：不依赖 spatialIndex/quadtree 裁剪——索引基于建立时坐标固定，
  // 力导向移动节点后索引陈旧，会导致缩放时部分节点随机消失。
  // 直接遍历 nodesData 读取实时坐标（与 ForceGraphPanel/RadialGraphPanel 一致）。
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

// 获取视口内的边（优化版：限制数量）
const getVisibleEdges = () => {
  if (!canvas) return edgesData
  
  const visibleNodes = getVisibleNodes()
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
  
  // 只返回连接两个可见节点的边
  let visibleEdges = edgesData.filter(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
  })
  
  // 如果边数量超过限制，按度数排序优先显示
  if (visibleEdges.length > MAX_VISIBLE_EDGES && edgeIndex) {
    visibleEdges = visibleEdges
      .sort((a, b) => {
        const degA = (edgeIndex.getDegree(a.source?.id || a.source) + edgeIndex.getDegree(a.target?.id || a.target))
        const degB = (edgeIndex.getDegree(b.source?.id || b.source) + edgeIndex.getDegree(b.target?.id || b.target))
        return degB - degA
      })
      .slice(0, MAX_VISIBLE_EDGES)
    
    console.log(`[GraphPanel] 边数量限制: ${visibleEdges.length}/${edgesData.length}`)
  }
  
  return visibleEdges
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
  
  // 设置 Canvas 尺寸
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  
  // 处理高清屏
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  
  // 根据数据规模决定力导向图策略（参考 Home.vue 的 miniGraph 配置）
  const nodeCount = props.nodes?.length || 0
  
  // 根据节点数量决定是否使用 Worker
  // 大规模数据（4K+）使用 Worker 进行力导向计算
  useWorker = nodeCount >= 2000 && typeof Worker !== 'undefined'
  
  if (useWorker) {
    // 初始化 Worker
    initWorker()
    console.log(`[GraphPanel] 启用 Web Worker 力导向计算 (节点数: ${nodeCount})`)
  } else {
    // 小规模数据使用 D3 主线程计算
    initD3Simulation(width, height, nodeCount)
  }
  
  // 拖拽状态变量（在 zoom 定义之前声明）
  let draggedNode = null
  let hasDragged = false  // 标记是否发生了拖拽
  let dragStartPos = { x: 0, y: 0 }  // 记录拖拽开始时的鼠标位置
  
  // 设置缩放行为（使用 filter 阻止在节点上的缩放）
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .filter((event) => {
      // 如果正在拖拽节点，不触发缩放
      if (draggedNode) {
        return false
      }
      // 检查是否点击在节点上
      if (event.button === 0) {
        const rect = canvas.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        const [graphX, graphY] = transform.invert([x, y])
        const node = findNodeAtPoint(graphX, graphY)
        if (node) {
          return false // 点击在节点上，不触发缩放
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
      // event.x 和 event.y 已经是相对于 canvas 的像素坐标
      // 直接使用，无需转换
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
      
      // 检查移动距离
      const dx = Math.abs(event.sourceEvent.clientX - dragStartPos.x)
      const dy = Math.abs(event.sourceEvent.clientY - dragStartPos.y)
      if (dx > 3 || dy > 3) {
        hasDragged = true
      }
      
      // event.x 和 event.y 已经是相对于 canvas 的坐标
      // 转换为图谱坐标
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
      
      // 保存位置
      if (hasDragged && draggedNode.x !== undefined && draggedNode.y !== undefined) {
        nodePositions.set(draggedNode.id, { x: draggedNode.x, y: draggedNode.y })
        saveNodePositions()
      }
      
      // 如果没有拖拽，触发点击
      if (!hasDragged) {
        selectedNode.value = draggedNode
        emit('node-click', draggedNode)
        requestAnimationFrame(render)
      }
      
      draggedNode = null
      hasDragged = false
      canvas.style.cursor = 'grab'
    })
  
  // 先绑定 drag，再绑定 zoom（确保 drag 优先）
  d3.select(canvas).call(drag)
  d3.select(canvas).call(zoom)
  
  // 点击空白区域处理（通过原生事件）
  canvas.addEventListener('click', (e) => {
    // 如果刚刚拖拽过，不触发点击
    if (hasDragged) {
      return
    }
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const [graphX, graphY] = transform.invert([x, y])
    
    const node = findNodeAtPoint(graphX, graphY)
    if (!node) {
      // 点击空白区域，可以处理边或其他
      const visibleEdges = getVisibleEdges()
      for (const edge of visibleEdges) {
        const source = edge.source
        const target = edge.target
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

// 处理 Canvas 点击 - 使用四叉树优化
function handleCanvasClick(event) {
  const [x, y] = transform.invert([event.offsetX, event.offsetY])
  
  // 使用四叉树查找点击的节点
  const clickedNode = findNodeAtPoint(x, y)
  if (clickedNode) {
    selectedNode.value = clickedNode
    emit('node-click', clickedNode)
    requestAnimationFrame(render)
    return
  }
  
  // 点击边（使用可见边）
  const visibleEdges = getVisibleEdges()
  for (const edge of visibleEdges) {
    const source = edge.source
    const target = edge.target
    
    if (source && target) {
      const dist = pointToLineDistance(x, y, source.x, source.y, target.x, target.y)
      if (dist < 5) {
        emit('edge-click', edge)
        return
      }
    }
  }
}

// 处理鼠标移动（hover效果）- 使用四叉树优化
function handleCanvasMouseMove(event) {
  const [x, y] = transform.invert([event.offsetX, event.offsetY])
  
  // 使用四叉树查找 hover 的节点
  const found = findNodeAtPoint(x, y)
  
  if (found) {
    hoveredNode.value = found
    const rect = containerRef.value.getBoundingClientRect()
    tooltipPos.value = {
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 10
    }
    highlightNode(found)
    canvas.style.cursor = 'pointer'
  } else {
    hoveredNode.value = null
    clearHighlight()
    canvas.style.cursor = 'grab'
  }
}

function handleCanvasMouseLeave() {
  hoveredNode.value = null
  clearHighlight()
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

// 节流渲染函数
const scheduleRender = () => {
  const now = Date.now()
  
  // 如果已经有渲染安排，跳过
  if (renderScheduled) return
  
  // 如果距离上次渲染时间太短，延迟执行
  if (now - lastRenderTime < RENDER_THROTTLE_MS) {
    renderScheduled = true
    setTimeout(() => {
      renderScheduled = false
      lastRenderTime = Date.now()
      render()
    }, RENDER_THROTTLE_MS)
    return
  }
  
  lastRenderTime = now
  render()
}

// 初始化增量渲染状态
const initIncrementalRender = () => {
  const visibleNodes = getVisibleNodes()
  const visibleEdges = getVisibleEdges()
  
  renderState.visibleNodes = visibleNodes
  renderState.visibleEdges = visibleEdges
  renderState.nodeIndex = 0
  renderState.edgeIndex = 0
  renderState.lastFrameTime = performance.now()
  renderState.isIncremental = visibleNodes.length > RENDER_BUDGET.nodesPerFrame
  renderState.frameCount = 0
  
  console.log(`[Incremental Render] 初始化: ${visibleNodes.length} 节点, ${visibleEdges.length} 边, 增量=${renderState.isIncremental}`)
}

// 主渲染函数（增量渲染优化版）
const render = () => {
  if (!ctx || !canvas) return
  
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const frameStartTime = performance.now()
  
  // 获取当前 LOD 级别
  const lodLevel = getLODLevel()
  
  // 4K+ 节点在远视模式下，停止力导向图
  if (shouldStopSimulation() && simulation) {
    // 检查是否已经停止
    if (simulation.alpha() > 0) {
      stopSimulation()
    }
  } else if (simulation && simulation.alpha() === 0 && nodesData.length >= 4000) {
    // 当退出远视模式时，恢复力导向图
    const currentLod = getLODLevel()
    if (currentLod !== LOD_LEVELS.MEGA_FAR && currentLod !== LOD_LEVELS.FAR) {
      resumeSimulation()
    }
  }
  
  // 检查是否需要初始化增量渲染
  const visibleNodes = getVisibleNodes()
  const visibleEdges = getVisibleEdges()
  
  // 视口内容变化时重置增量渲染状态
  const nodeIdsMatch = renderState.visibleNodes.length === visibleNodes.length &&
    renderState.visibleNodes.every((n, i) => n.id === visibleNodes[i]?.id)
  
  if (!nodeIdsMatch || renderState.visibleNodes.length === 0) {
    initIncrementalRender()
  }
  
  // ========== 第一步：绘制背景（每帧执行） ==========
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
  
  // 应用变换
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)
  
  // ========== 第二步：增量绘制边 ==========
  const showEdgeLabels = lodLevel.showLabels && lodLevel.edgeOpacity > 0.3
  const showEdges = lodLevel.showEdges
  
  let edgesRenderedThisFrame = 0
  const maxEdgesThisFrame = renderState.isIncremental ? RENDER_BUDGET.edgesPerFrame : visibleEdges.length
  
  while (renderState.edgeIndex < renderState.visibleEdges.length && edgesRenderedThisFrame < maxEdgesThisFrame) {
    const edge = renderState.visibleEdges[renderState.edgeIndex]
    renderState.edgeIndex++
    edgesRenderedThisFrame++
    
    const source = edge.source
    const target = edge.target
    
    if (!source || !target) continue
    
    const isRelated = relatedEdgeIds.value.has(edge.id)
    const isHighlighted = highlightedNodeId.value && 
      (source.id === highlightedNodeId.value || target.id === highlightedNodeId.value)
    
    // 设置边的样式
    if (isHighlighted || isRelated) {
      ctx.strokeStyle = '#FF4500'
      ctx.lineWidth = 3
      ctx.globalAlpha = 1
    } else {
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 2
      ctx.globalAlpha = lodLevel.edgeOpacity
    }
    
    if (showEdges) {
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
      
      // 绘制边标签（只在标签显示模式）
      if (showEdgeLabels && edge.label) {
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
    
    // 检查时间预算
    if (performance.now() - frameStartTime > RENDER_BUDGET.msPerFrame) {
      break
    }
  }
  
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  
  // ========== 第三步：增量绘制节点 ==========
  let nodesRenderedThisFrame = 0
  const maxNodesThisFrame = renderState.isIncremental ? RENDER_BUDGET.nodesPerFrame : visibleNodes.length
  
  while (renderState.nodeIndex < renderState.visibleNodes.length && nodesRenderedThisFrame < maxNodesThisFrame) {
    const node = renderState.visibleNodes[renderState.nodeIndex]
    renderState.nodeIndex++
    nodesRenderedThisFrame++
    
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
    
    // MEGA_FAR/FAR 模式：只绘制小圆点
    if (!lodLevel.showLabels) {
      ctx.fillStyle = strokeColor
      ctx.beginPath()
      ctx.arc(x, y, lodLevel.nodeSize || 4, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    
    // 获取节点大小
    const size = getNodeSize(node)
    
    // 绘制节点背景（圆角矩形）
    ctx.fillStyle = fillColor
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    
    ctx.beginPath()
    ctx.roundRect(x - size, y - 22, size * 2, 44, 8)
    ctx.fill()
    ctx.stroke()
    
    // 显示标签
    ctx.fillStyle = strokeColor
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const truncatedLabel = truncateText(node.label || '', MAX_NODE_WIDTH, 12)
    ctx.fillText(truncatedLabel, x, y - 4)
    
    // FOCUS/CLOSE 模式：显示内容
    if (lodLevel === LOD_LEVELS.FOCUS || lodLevel === LOD_LEVELS.CLOSE) {
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
    }
    
    // ====== 双向同步：将渲染坐标同步回 nodesData ======
    const dataNode = nodesData.find(n => n.id === node.id)
    if (dataNode) {
      dataNode.x = node.x
      dataNode.y = node.y
      nodePositions.set(node.id, { x: node.x, y: node.y })
    }
    
    // 检查时间预算
    if (performance.now() - frameStartTime > RENDER_BUDGET.msPerFrame) {
      break
    }
  }
  
  ctx.restore()
  
  // ========== 第四步：继续增量渲染（如果未完成） ==========
  const isRenderingComplete = renderState.nodeIndex >= renderState.visibleNodes.length && 
                              renderState.edgeIndex >= renderState.visibleEdges.length
  
  if (!isRenderingComplete && renderState.isIncremental) {
    renderState.frameCount++
    // 记录每 N 帧报告一次进度
    if (renderState.frameCount % 30 === 0) {
      const progress = Math.round(((renderState.nodeIndex + renderState.edgeIndex) / 
        (renderState.visibleNodes.length + renderState.visibleEdges.length)) * 100)
      console.log(`[Incremental Render] 进度: ${progress}% (节点 ${renderState.nodeIndex}/${renderState.visibleNodes.length})`)
    }
    requestAnimationFrame(render)
  } else if (isRenderingComplete && renderState.isIncremental) {
    console.log(`[Incremental Render] 完成: ${renderState.frameCount} 帧`)
    renderState.isIncremental = false
  }
}

// 检查节点坐标是否有效（没有聚集在一起）
const hasValidPositions = (nodes) => {
  if (!nodes || nodes.length < 2) return true
  
  // 检查是否有有效的 x, y 坐标
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
  
  // 如果有效节点太少，返回 false
  if (validCount < nodes.length * 0.5) return false
  
  // 如果所有节点都聚集在很小区域，也返回 false
  const spreadX = maxX - minX
  const spreadY = maxY - minY
  
  // 如果节点分布在小于 100 像素的区域内，认为是聚集的
  return spreadX > 100 || spreadY > 100
}

// 更新图谱数据
const updateGraph = () => {
  const container = containerRef.value
  const width = container?.clientWidth || 800
  const height = container?.clientHeight || 600
  
  // 计算节点应该分布的区域
  // 使用更大的分布区域，确保节点不会挤在一起
  const centerX = width / 2
  const centerY = height / 2
  
  // 检查 props 中的节点是否有有效位置
  const propsHasValidPositions = hasValidPositions(props.nodes)
  const savedPositionsValid = nodePositions.size > 0 && hasValidPositions(Array.from(nodePositions.values()).map(p => ({ x: p.x, y: p.y })))
  
  // 只有当保存的位置和 props 位置都无效时才重新分布
  const shouldRedistribute = !propsHasValidPositions && !savedPositionsValid
  
  if (shouldRedistribute) {
    console.log('检测到节点聚集，强制重新分布')
  }
  
  // 保留原有位置，如果没有则随机分布
  nodesData = props.nodes.map((n, index) => {
    const existing = nodePositions.get(n.id)
    let x, y
    
    if (!shouldRedistribute && existing?.x !== undefined && existing?.y !== undefined) {
      // 使用保存的位置
      x = existing.x
      y = existing.y
    } else if (!shouldRedistribute && n.x !== undefined && n.y !== undefined && !isNaN(n.x) && !isNaN(n.y)) {
      // 使用 props 中的位置（仅当不需要重新分布时）
      x = n.x
      y = n.y
    } else {
      // 使用网格分布 + 随机偏移，确保节点分散开
      const cols = Math.ceil(Math.sqrt(props.nodes.length))
      const row = Math.floor(index / cols)
      const col = index % cols
      
      // 计算网格位置（更大的间隔）
      const gridX = (col - (cols - 1) / 2) * 160  // 160 像素水平间隔
      const gridY = (row - (Math.ceil(props.nodes.length / cols) - 1) / 2) * 120  // 120 像素垂直间隔
      
      // 添加随机偏移
      const randomOffset = 60
      x = centerX + gridX + (Math.random() - 0.5) * randomOffset
      y = centerY + gridY + (Math.random() - 0.5) * randomOffset
    }
    
    return { ...n, x, y }
  })
  
  // 保存新位置
  nodesData.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y })
    }
  })
  
  edgesData = props.edges.map(e => ({ ...e }))
  
  // 构建四叉树空间索引
  buildQuadtree()
  
  // 更新 simulation（如果有）
  if (simulation) {
    simulation.nodes(nodesData)
    simulation.force('link').links(edgesData)
    
    // 如果需要重新分布，给一个较大的 alpha 让节点散开
    if (shouldRedistribute) {
      simulation.alpha(1).restart()
    } else {
      simulation.alpha(0.3).restart()
    }
  } else {
    // 没有 simulation 时直接渲染
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
      ctx.scale(dpr, dpr)
      
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
  
  // 清理 Worker
  if (forceWorker) {
    forceWorker.terminate()
    forceWorker = null
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
  
  // 清理全局状态
  transform = d3.zoomIdentity
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