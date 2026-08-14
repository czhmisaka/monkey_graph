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
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import * as d3 from 'd3'
import { graphAPI } from '../../api'

// 定义 props - 子类可以扩展
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

// 定义事件
const emit = defineEmits(['node-click', 'edge-click', 'refresh'])

// DOM 引用
const containerRef = ref(null)
const canvasRef = ref(null)

// 状态
const hoveredNode = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
const selectedNode = ref(null)

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

// 变换状态（缩放和平移）
let transform = d3.zoomIdentity

// ========== 性能优化相关 ==========

// 四叉树空间索引

// 视口边界（用于裁剪）
const viewportPadding = 100

// 节点类型颜色映射
const defaultNodeColors = {
  person: '#4A90D9',
  organization: '#50C878',
  concept: '#9B59B6',
  location: '#F39C12',
  default: '#95A5A6'
}

// 动态获取节点颜色 - 子类可覆盖
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

// 节点大小缓存 - 子类可覆盖
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
  
  const maxWidth = Math.min(rawMaxWidth, 200)
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
const highlightNode = (node) => {
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
}

const clearHighlight = () => {
  highlightedNodeId.value = null
  relatedNodeIds.value = new Set()
  relatedEdgeIds.value = new Set()
}


// 获取视口内的节点（带缓冲）
// 注意：不依赖 quadtree 裁剪——四叉树 extent 基于建立时的坐标固定，
// 而力导向模拟持续更新节点坐标，导致索引陈旧、缩放时部分节点被随机剔除。
// 直接遍历 nodesData 读取实时坐标（与 ForceGraphPanel/RadialGraphPanel 一致）。
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

// 计算点到线段的距离
const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
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

// 检查节点坐标是否有效
const hasValidPositions = (nodes) => {
  if (!nodes || nodes.length < 2) return true
  
  let validCount = 0
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  for (const n of nodes) {
    if (n.x !== undefined && n.y !== undefined && !isNaN(n.x) && !isNaN(n.y)) {
      validCount++
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

// 更新图谱数据 - 子类可覆盖
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
  
  edgesData = props.edges.map(e => ({ ...e }))
  
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
  nextTick(() => {
    nodesData = []
    nodePositions.clear()
    nodeSizeCache.clear()
    updateGraph()
  })
}, { deep: true })

watch(() => props.edges, () => {
  nextTick(updateGraph)
}, { deep: true })

watch(() => props.settings, () => {
  nextTick(() => {})
}, { deep: true })

// 窗口大小变化
let resizeObserver = null

onMounted(() => {
  // 子类实现具体初始化
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (saveTimeout.value) clearTimeout(saveTimeout.value)
})

// 导出共享函数供子类使用
defineExpose({
  // 共享工具
  getNodeColor,
  getTextWidth,
  truncateText,
  getNodeSize,
  pointToLineDistance,
  
  // 共享状态
  nodesData: () => nodesData,
  edgesData: () => edgesData,
  nodePositions,
  
  // 共享方法
  getVisibleNodes,
  getVisibleEdges,
  highlightNode,
  clearHighlight,
  saveNodePositions,
  updateGraph,
  
  // 变换状态
  getTransform: () => transform,
  setTransform: (t) => { transform = t },
  
  // Canvas 上下文
  getCtx: () => ctx,
  getCanvas: () => canvas,
  setCanvasContext: (c, cvs) => { ctx = c; canvas = cvs },
  
  // 事件发射
  emitClick: (node) => {
    selectedNode.value = node
    emit('node-click', node)
  },
  emitEdgeClick: (edge) => {
    emit('edge-click', edge)
  },
  
  // 状态
  setHoveredNode: (node, pos) => {
    hoveredNode.value = node
    tooltipPos.value = pos
  },
  clearHoveredNode: () => {
    hoveredNode.value = null
  },
  
  // 渲染触发
  requestRender: () => {}
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