<template>
  <div class="graph-panel" ref="containerRef">
    <canvas ref="canvasRef" class="graph-canvas"></canvas>
    <!-- 流式加载进度指示器 -->
    <div v-if="streaming" class="streaming-indicator">
      <div class="streaming-spinner"></div>
      <div class="streaming-text">
        正在加载: {{ streamingNodes.length }} 节点 / {{ streamingEdges.length }} 边
      </div>
    </div>
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
  },
  // 是否使用流式加载
  streaming: {
    type: Boolean,
    default: false
  },
  // 图谱ID，用于流式加载
  graphId: {
    type: String,
    default: null
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
const localGraphId = ref(null)

// Canvas 上下文
let ctx = null
let canvas = null

// D3 变量
let simulation = null

// 变换状态（缩放和平移）
let transform = d3.zoomIdentity

// ========== 流式加载状态 ==========
const streamingNodes = ref([])
const streamingEdges = ref([])
const loadProgress = ref({ loaded: 0, total: 0 })

// ========== 原点模式配置 ==========

// 节点渲染半径 - 与实际渲染保持一致
const NODE_RADIUS = 5

// 点击检测半径 - 使用实际渲染半径，稍微放大一点便于点击
const HIT_RADIUS = 8

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

// 动态获取节点颜色
const getNodeColor = (type) => {
  if (props.settings?.nodeTypes?.[type]?.color) {
    return props.settings.nodeTypes[type].color
  }
  return defaultNodeColors[type] || defaultNodeColors.default
}

// ========== 缓存优化 ==========
const nodeSizeCache = new Map()

// 节点大小缓存 - 固定返回渲染大小
const getNodeSize = (node) => {
  return NODE_RADIUS
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

// 暴露方法
defineExpose({
  highlightNode,
  highlightNodesByIds,
  clearHighlight,
  setGraphId: (id) => { localGraphId.value = id },
  getSelectedNode: () => selectedNode.value,
  getSvgElement: () => canvasRef.value,
  getContainerElement: () => containerRef.value
})

// ========== 流式加载功能 ==========

/**
 * 流式加载图谱数据
 * 使用 SSE 分批获取节点和边，实时更新可视化
 */
const loadGraphStream = async () => {
  if (!localGraphId.value) {
    console.error('[RadialGraph] 流式加载需要提供 graphId')
    return
  }

  streamingNodes.value = []
  streamingEdges.value = []
  loadProgress.value = { loaded: 0, total: 0 }

  try {
    console.log(`[RadialGraph] 开始流式加载图谱 ${localGraphId.value}`)
    
    await graphAPI.getGraphStream(
      localGraphId.value,
      // 每批数据回调
      (data) => {
        if (data.type === 'nodes_batch') {
          // 添加新节点
          streamingNodes.value.push(...data.batch)
          // 立即更新可视化
          updateGraphWithStreamingData()
        } else if (data.type === 'edges_batch') {
          // 添加新边
          streamingEdges.value.push(...data.batch)
          // 更新边的可视化
          updateStreamingEdges()
        }
      },
      // 进度回调
      (loaded, total, type) => {
        loadProgress.value = { loaded, total }
      }
    )
    
    console.log(`[RadialGraph] 流式加载完成: ${streamingNodes.value.length} 节点, ${streamingEdges.value.length} 边`)
    
    // 触发完成事件
    emit('loaded', {
      nodes: streamingNodes.value,
      edges: streamingEdges.value
    })
  } catch (error) {
    console.error('[RadialGraph] 流式加载失败:', error)
  }
}

/**
 * 使用流式数据更新图谱
 */
const updateGraphWithStreamingData = () => {
  if (!simulation) return
  
  const allNodes = streamingNodes.value
  const allEdges = streamingEdges.value
  
  if (allNodes.length === 0) return
  
  // 更新节点数据
  nodesData = allNodes.map(n => {
    const existing = nodePositions.get(n.id)
    return {
      ...n,
      x: existing?.x || n.x || Math.random() * 800,
      y: existing?.y || n.y || Math.random() * 600
    }
  })
  
  // 更新边数据
  edgesData = allEdges.map(e => ({ ...e }))
  
  // 重新构建四叉树
  buildQuadtree()
  
  // 更新模拟
  simulation.nodes(nodesData)
  simulation.force('link').links(edgesData)
  simulation.alpha(0.3).restart()
  
  requestAnimationFrame(render)
}

/**
 * 更新流式加载的边
 */
const updateStreamingEdges = () => {
  if (!simulation) return
  
  edgesData = streamingEdges.value.map(e => ({ ...e }))
  
  if (simulation.force('link')) {
    simulation.force('link').links(edgesData)
    simulation.alpha(0.1).restart()
  }
}

// 构建四叉树空间索引
const buildQuadtree = () => {
  if (nodesData.length === 0) {
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

let quadtree = null

// 获取视口内的节点（带缓冲）
const getVisibleNodes = () => {
  if (!canvas || !quadtree) return nodesData
  
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
  quadtree.visit((node, x1, y1, x2, y2) => {
    if (x1 > maxX || x2 < minX || y1 > maxY || y2 < minY) {
      return true
    }
    if (!node.length && node.data) {
      const x = node.data.x
      const y = node.data.y
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        visibleNodes.push(node.data)
      }
    }
    return false
  })
  
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

// 使用四叉树查找最近的节点（精确匹配渲染尺寸）
const findNodeAtPoint = (x, y) => {
  if (!nodesData || nodesData.length === 0) {
    return null
  }
  
  // 使用四叉树进行高效查找
  if (quadtree) {
    const found = quadtree.find(x, y, HIT_RADIUS)
    if (found) {
      return found
    }
  }
  
  // 回退到线性搜索（使用精确的点击半径）
  let closestNode = null
  let closestDist = HIT_RADIUS * HIT_RADIUS
  
  for (const node of nodesData) {
    if (node.x === undefined || node.y === undefined || isNaN(node.x) || isNaN(node.y)) {
      continue
    }
    
    const dx = x - node.x
    const dy = y - node.y
    const distSq = dx * dx + dy * dy
    
    // 使用精确的点击半径
    if (distSq < closestDist) {
      closestDist = distSq
      closestNode = node
    }
  }
  
  return closestNode
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
  
  // 处理高清屏
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  
  // 使用密集星云模式力导向图
  simulation = d3.forceSimulation()
    .velocityDecay(0.4)  // 低衰减，增加稳定性
    .force('link', d3.forceLink().id(d => d.id).distance(35))  // 边距离更短
    .force('charge', d3.forceManyBody().strength(-40))  // 排斥力减弱
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1))  // 向心力增强
    .force('collision', d3.forceCollide().radius(NODE_RADIUS + 5))  // 碰撞间隙更小
    
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
      // 原点模式下不检测边的点击
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
  
  // 如果是流式加载模式，启动流式加载
  if (props.streaming && localGraphId.value) {
    loadGraphStream()
  } else {
    updateGraph()
  }
}

// 主渲染函数（原点模式 - 小圆点）
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
  
  // 应用变换
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)
  
  // 绘制边（原点模式下只绘制连接高亮节点的边）
  const showRelatedEdgesOnly = relatedNodeIds.value.size > 0
  
  for (const edge of visibleEdges) {
    const source = edge.source
    const target = edge.target
    
    if (!source || !target) continue
    
    // 只显示关联边
    if (showRelatedEdgesOnly && !relatedEdgeIds.value.has(edge.id)) {
      continue
    }
    
    const isRelated = relatedEdgeIds.value.has(edge.id)
    const isHighlighted = highlightedNodeId.value && 
      (source.id === highlightedNodeId.value || target.id === highlightedNodeId.value)
    
    if (isHighlighted || isRelated) {
      ctx.strokeStyle = '#FF4500'
      ctx.lineWidth = 2
      ctx.globalAlpha = 1
    } else if (showRelatedEdgesOnly) {
      continue // 隐藏非关联边
    } else {
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
    }
    
    ctx.setLineDash([3, 2])
    ctx.beginPath()
    ctx.moveTo(source.x, source.y)
    ctx.lineTo(target.x, target.y)
    ctx.stroke()
  }
  
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  
  // 绘制节点（小圆点模式）
  for (const node of visibleNodes) {
    const x = node.x
    const y = node.y
    
    const isHovered = hoveredNode.value?.id === node.id
    const isSelected = selectedNode.value?.id === node.id
    const isRelated = relatedNodeIds.value.has(node.id)
    const isHighlighted = highlightedNodeId.value === node.id
    
    let nodeColor = getNodeColor(node.type)
    let radius = NODE_RADIUS
    let globalAlpha = 1
    
    if (isHighlighted) {
      nodeColor = '#FF4500'
      radius = NODE_RADIUS * 1.5
    } else if (isHovered || isSelected) {
      nodeColor = '#FF4500'
      radius = NODE_RADIUS * 1.3
    } else if (isRelated) {
      radius = NODE_RADIUS * 1.2
    } else if (relatedNodeIds.value.size > 0) {
      globalAlpha = 0.3
    }
    
    ctx.globalAlpha = globalAlpha
    
    // 绘制小圆点
    ctx.fillStyle = nodeColor
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // 高亮时显示光晕
    if (isHighlighted || isHovered || isSelected) {
      ctx.strokeStyle = nodeColor
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    
    // 同步坐标
    const dataNode = nodesData.find(n => n.id === node.id)
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
      // 网格分布
      const cols = Math.ceil(Math.sqrt(props.nodes.length))
      const row = Math.floor(index / cols)
      const col = index % cols
      
      const gridX = (col - (cols - 1) / 2) * 30
      const gridY = (row - (Math.ceil(props.nodes.length / cols) - 1) / 2) * 30
      
      x = centerX + gridX
      y = centerY + gridY
    }
    
    return { ...n, x, y }
  })
  
  nodesData.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y })
    }
  })
  
  edgesData = props.edges.map(e => ({ ...e }))
  
  buildQuadtree()
  
  if (simulation) {
    simulation.nodes(nodesData)
    simulation.force('link').links(edgesData)
    simulation.alpha(0.3).restart()
  } else {
    requestAnimationFrame(render)
  }
}

// 保存节点位置
const saveNodePositions = async () => {
  if (!localGraphId.value) return
  
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
      await graphAPI.updateNodePositions(localGraphId.value, positions)
      console.log('节点位置已保存')
    } catch (error) {
      console.error('保存节点位置失败:', error)
    }
  }, 1000)
}

// 监听数据变化
watch(() => props.nodes, () => {
  if (isDragging.value) return
  // 如果不是流式加载模式，更新图谱
  if (!props.streaming) {
    nextTick(updateGraph)
  }
}, { deep: true })

watch(() => props.edges, () => {
  if (isDragging.value) return
  // 如果不是流式加载模式，更新图谱
  if (!props.streaming) {
    nextTick(updateGraph)
  }
}, { deep: true })

watch(() => props.settings, () => {
  nextTick(render)
}, { deep: true })

// 监听 graphId 变化
watch(() => props.graphId, (newId) => {
  if (newId) {
    localGraphId.value = newId
    // 如果是流式加载模式且已经开始，重新加载
    if (props.streaming && simulation) {
      loadGraphStream()
    }
  }
}, { immediate: true })

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
  if (simulation) simulation.stop()
  if (resizeObserver) resizeObserver.disconnect()
  if (saveTimeout.value) clearTimeout(saveTimeout.value)
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

/* 流式加载指示器 */
.streaming-indicator {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  backdrop-filter: blur(8px);
}

.streaming-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.streaming-text {
  font-size: 13px;
  font-weight: 500;
  color: #3B82F6;
  font-family: var(--font-display);
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