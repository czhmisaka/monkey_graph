<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-node-detail">
      <div class="modal-header">
        <h3>节点详情</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body node-detail-body">
        <!-- 第一列：节点信息 -->
        <div class="node-detail-column node-info-column">
          <h4 class="column-title">节点信息</h4>

          <!-- 可滚动的内容区域 -->
          <div class="node-info-content">
            <!-- 节点基本信息 -->
            <div class="node-detail-section">
              <h5 class="section-title">基本信息</h5>
              <div class="detail-row">
                <span class="detail-label">ID</span>
                <span class="detail-value detail-id">{{ nodeData.id }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">标签</span>
                <span class="detail-value">{{ nodeData.label }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">类型</span>
                <span class="detail-value">
                  <span class="node-type-badge" :style="{ backgroundColor: getNodeColor(nodeData.type) }">
                    {{ nodeData.type }}
                  </span>
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">创建时间</span>
                <span class="detail-value">{{ formatDateTime(nodeData.created_at) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">更新时间</span>
                <span class="detail-value">{{ formatDateTime(nodeData.updated_at) }}</span>
              </div>
            </div>

            <!-- 节点属性 -->
            <div class="node-detail-section" v-if="Object.keys(nodeData.properties || {}).length > 0">
              <h5 class="section-title">属性</h5>
              <div class="properties-list">
                <div class="property-item" v-for="(value, key) in nodeData.properties" :key="key">
                  <span class="property-key">{{ key }}</span>
                  <span class="property-value">{{ typeof value === 'object' ? JSON.stringify(value) : value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 第二列：节点图谱 -->
        <div class="node-detail-column node-graph-column">
          <div class="column-title-row">
            <h4 class="column-title">节点图谱</h4>
            <select v-model="localAssociationLevel" @change="handleAssociationLevelChange" class="level-select">
              <option :value="1">1阶关联</option>
              <option :value="2">2阶关联</option>
              <option :value="3">3阶关联</option>
            </select>
          </div>
          <div class="mini-graph-container" ref="miniGraphRef">
            <svg ref="miniGraphSvgRef" class="mini-graph-svg"></svg>
          </div>
        </div>

        <!-- 第三列：关联边列表 -->
        <div class="node-detail-column node-edges-column">
          <h4 class="column-title">关联边 <span class="column-subtitle">({{ relatedEdges.length }})</span></h4>
          <div class="edges-list-container" v-if="relatedEdges.length > 0">
            <div class="edge-item" v-for="edge in relatedEdges" :key="edge.id"
              @mouseenter="$emit('edge-hover', edge, true)" @mouseleave="$emit('edge-hover', edge, false)">
              <div class="edge-info">
                <span class="edge-direction">
                  <span v-if="edge.source === nodeData.id">→</span>
                  <span v-else>←</span>
                </span>
                <span class="edge-label" v-if="edge.label">{{ edge.label }}</span>
                <span class="edge-target clickable" v-if="edge.source === nodeData.id"
                  @click="$emit('view-node', edge.target)">
                  {{ getNodeLabel(edge.target) }}
                </span>
                <span class="edge-target clickable" v-else @click="$emit('view-node', edge.source)">
                  {{ getNodeLabel(edge.source) }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="empty-list">
            暂无关联边
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" @click="$emit('delete-node')">
          🗑️ 删除节点
        </button>
        <button class="btn" @click="$emit('close')">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  nodeData: {
    type: Object,
    default: () => ({})
  },
  relatedEdges: {
    type: Array,
    default: () => []
  },
  graphNodes: {
    type: Array,
    default: () => []
  },
  graphEdges: {
    type: Array,
    default: () => []
  },
  associationLevel: {
    type: Number,
    default: 1
  },
  nodeColors: {
    type: Object,
    default: () => ({
      person: '#4A90D9',
      organization: '#50C878',
      concept: '#9B59B6',
      location: '#F39C12',
      default: '#95A5A6'
    })
  },
  graphSettings: {
    type: Object,
    default: () => ({ nodeTypes: {} })
  }
})

const emit = defineEmits([
  'update:modelValue',
  'close',
  'view-node',
  'delete-node',
  'edge-hover',
  'association-level-change'
])

const miniGraphRef = ref(null)
const miniGraphSvgRef = ref(null)
const localAssociationLevel = ref(props.associationLevel)

let miniGraphSvg = null
let miniGraphG = null
let miniSimulation = null

const MAX_NODE_WIDTH = 200

watch(() => props.associationLevel, (val) => {
  localAssociationLevel.value = val
})

watch(localAssociationLevel, (val) => {
  emit('association-level-change', val)
})

watch(() => props.modelValue, (val) => {
  if (val) {
    nextTick(() => {
      setTimeout(() => {
        renderMiniGraph()
      }, 100)
    })
  }
})

watch(() => props.nodeData, () => {
  if (props.modelValue) {
    nextTick(() => {
      setTimeout(() => {
        renderMiniGraph()
      }, 100)
    })
  }
}, { deep: true })

const getNodeColor = (type) => {
  if (props.graphSettings?.nodeTypes?.[type]?.color) {
    return props.graphSettings.nodeTypes[type].color
  }
  return props.nodeColors[type] || props.nodeColors.default
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const getNodeLabel = (nodeId) => {
  const node = props.graphNodes.find(n => n.id === nodeId)
  return node ? node.label : nodeId
}

const handleAssociationLevelChange = () => {
  nextTick(() => {
    renderMiniGraph()
  })
}

// Helper functions for D3 mini graph
const getMiniTextWidth = (text, fontSize = 12) => {
  if (!text) return 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `${fontSize}px sans-serif`
  return ctx.measureText(text).width + 10
}

const truncateMiniText = (text, maxWidth, fontSize = 12) => {
  if (!text) return ''
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `${fontSize}px sans-serif`

  let result = ''
  for (const char of text) {
    const testText = result + char
    const width = ctx.measureText(testText).width + 10
    if (width > maxWidth) {
      break
    }
    result = testText
  }
  return result !== text ? result + '...' : result
}

const getMiniNodeSize = (node) => {
  const label = node.label || ''
  const type = node.type || 'default'
  const props = node.properties || {}

  let content = type
  if (Object.keys(props).length > 0) {
    const firstProp = props[Object.keys(props)[0]]
    content = `${type}: ${typeof firstProp === 'string' ? firstProp : JSON.stringify(firstProp)}`
  }

  const labelWidth = getMiniTextWidth(label, 12)
  const contentWidth = getMiniTextWidth(content, 10)
  const rawMaxWidth = Math.max(labelWidth, contentWidth) + 20

  const maxWidth = Math.min(rawMaxWidth, MAX_NODE_WIDTH)
  return Math.max(maxWidth / 2, 22)
}

const getRelatedNodesByLevel = (centerNodeId, level) => {
  const relatedNodeIds = new Set([centerNodeId])
  const relatedEdges = []

  let currentLevel = new Set([centerNodeId])

  for (let i = 0; i < level; i++) {
    const nextLevel = new Set()

    props.graphEdges.forEach(edge => {
      const sourceId = edge.source?.id || edge.source
      const targetId = edge.target?.id || edge.target

      if (currentLevel.has(sourceId) && !relatedNodeIds.has(targetId)) {
        nextLevel.add(targetId)
        relatedNodeIds.add(targetId)
        relatedEdges.push({ ...edge })
      } else if (currentLevel.has(targetId) && !relatedNodeIds.has(sourceId)) {
        nextLevel.add(sourceId)
        relatedNodeIds.add(sourceId)
        relatedEdges.push({ ...edge })
      }
    })

    currentLevel = nextLevel
    if (currentLevel.size === 0) break
  }

  return { relatedNodeIds, relatedEdges }
}

const miniGraphData = () => {
  if (!props.nodeData.id) return { nodes: [], edges: [] }

  const nodeId = props.nodeData.id
  const { relatedNodeIds, relatedEdges } = getRelatedNodesByLevel(nodeId, localAssociationLevel.value)

  const nodes = props.graphNodes
    .filter(n => relatedNodeIds.has(n.id))
    .map(n => ({ ...n }))

  return { nodes, edges: relatedEdges }
}

// MiniGraph drag functions
function miniDragStarted(event, d) {
  if (!event.active) miniSimulation.alphaTarget(0.3).restart()
  d.fx = d.x
  d.fy = d.y
}

function miniDragged(event, d) {
  d.fx = event.x
  d.fy = event.y
}

function miniDragEnded(event, d) {
  if (!event.active) miniSimulation.alphaTarget(0)
  d.fx = null
  d.fy = null
}

const renderMiniGraph = () => {
  if (!miniGraphSvgRef.value || !miniGraphRef.value) return

  // Stop previous simulation
  if (miniSimulation) {
    miniSimulation.stop()
  }

  const container = miniGraphRef.value
  const width = container.clientWidth || 350
  const height = container.clientHeight || 300

  // Clear
  d3.select(miniGraphSvgRef.value).selectAll('*').remove()

  // Create SVG
  miniGraphSvg = d3.select(miniGraphSvgRef.value)
    .attr('width', width)
    .attr('height', height)

  // Define arrow
  const defs = miniGraphSvg.append('defs')
  defs.append('marker')
    .attr('id', 'mini-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#999')

  miniGraphG = miniGraphSvg.append('g')

  // Zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      miniGraphG.attr('transform', event.transform)
    })

  miniGraphSvg.call(zoom)

  const data = miniGraphData()
  if (data.nodes.length === 0) return

  // Node position mapping
  const nodePositions = new Map()

  // Initialize nodes
  const nodes = data.nodes.map(n => {
    const existing = nodePositions.get(n.id)
    return {
      ...n,
      x: existing?.x || n.x,
      y: existing?.y || n.y
    }
  })

  nodes.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y })
    }
  })

  const edges = data.edges.map(e => ({ ...e }))

  // Initialize force simulation
  miniSimulation = d3.forceSimulation()
    .velocityDecay(0.4)
    .force('link', d3.forceLink().id(d => d.id).distance(70))
    .force('charge', d3.forceManyBody().strength(d => -getMiniNodeSize(d) * 4))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))
    .force('collision', d3.forceCollide().radius(d => getMiniNodeSize(d) + 20))
    .force('radial', d3.forceRadial(
      Math.min(width, height) / 4,
      width / 2,
      height / 2
    ).strength(0.08))

  // Draw edges
  const linkGroup = miniGraphG.selectAll('.mini-link-group')
    .data(edges, d => d.id)

  linkGroup.exit().remove()

  const linkEnter = linkGroup.enter()
    .append('g')
    .attr('class', 'mini-link-group')

  linkEnter.append('path')
    .attr('class', 'mini-link')
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')

  linkEnter.append('g')
    .attr('class', 'mini-link-label-group')
    .append('rect')
    .attr('class', 'mini-link-label-bg')
    .attr('fill', 'white')
    .attr('stroke', '#ddd')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,2')
    .attr('rx', 4)
    .attr('ry', 4)
    .attr('x', -20)
    .attr('y', -8)
    .attr('width', 40)
    .attr('height', 16)

  linkEnter.select('.mini-link-label-group')
    .append('text')
    .attr('class', 'mini-link-label')
    .attr('font-size', '9px')
    .attr('fill', '#666')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')

  const linkMerge = linkEnter.merge(linkGroup)

  linkMerge.each(function (d) {
    const group = d3.select(this)
    const text = d.label || ''
    const textWidth = getMiniTextWidth(text, 9)

    group.select('.mini-link-label-bg')
      .attr('width', Math.max(30, textWidth))
      .attr('x', -textWidth / 2)

    group.select('.mini-link-label')
      .text(text)
  })

  // Draw nodes
  const nodeGroup = miniGraphG.selectAll('.mini-node')
    .data(nodes, d => d.id)

  nodeGroup.exit().remove()

  const nodeEnter = nodeGroup.enter()
    .append('g')
    .attr('class', 'mini-node')
    .call(d3.drag()
      .on('start', miniDragStarted)
      .on('drag', miniDragged)
      .on('end', miniDragEnded))
    .on('click', (event, d) => {
      event.stopPropagation()
      if (d.id !== props.nodeData.id) {
        emit('view-node', d.id)
      }
    })

  nodeEnter.append('rect')
    .attr('class', 'mini-node-bg')
    .attr('y', -22)
    .attr('height', 44)
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', 'white')
    .attr('stroke', d => getNodeColor(d.type))
    .attr('stroke-width', 2)

  nodeEnter.append('text')
    .attr('class', 'mini-node-label')
    .attr('dy', '-4')
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', d => getNodeColor(d.type))

  nodeEnter.append('text')
    .attr('class', 'mini-node-content')
    .attr('dy', '14')
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#888')

  const nodeMerge = nodeEnter.merge(nodeGroup)

  nodeMerge.each(function (d) {
    const group = d3.select(this)
    const label = d.label || ''
    const type = d.type || 'default'
    const props_node = d.properties || {}
    let content = type
    if (Object.keys(props_node).length > 0) {
      const firstProp = props_node[Object.keys(props_node)[0]]
      content = `${type}: ${typeof firstProp === 'string' ? firstProp : JSON.stringify(firstProp)}`
    }

    const labelWidth = getMiniTextWidth(label, 12)
    const contentWidth = getMiniTextWidth(content, 10)
    const rawMaxWidth = Math.max(labelWidth, contentWidth) + 20

    const maxWidth = Math.min(rawMaxWidth, MAX_NODE_WIDTH)

    const truncatedLabel = truncateMiniText(label, MAX_NODE_WIDTH, 12)
    const truncatedContent = truncateMiniText(content, MAX_NODE_WIDTH, 10)

    group.select('.mini-node-bg')
      .attr('x', -maxWidth / 2)
      .attr('width', maxWidth)
      .attr('stroke', getNodeColor(d.type))

    group.select('.mini-node-label')
      .attr('fill', getNodeColor(d.type))
      .text(truncatedLabel)

    group.select('.mini-node-content')
      .text(truncatedContent)
  })

  // Update edge paths
  linkMerge.select('.mini-link')
    .attr('d', d => {
      const sourceId = d.source?.id || d.source
      const targetId = d.target?.id || d.target
      const source = nodes.find(n => n.id === sourceId)
      const target = nodes.find(n => n.id === targetId)
      if (!source || !target) return ''
      return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
    })

  linkMerge.select('.mini-link-label-group')
    .attr('transform', d => {
      const sourceId = d.source?.id || d.source
      const targetId = d.target?.id || d.target
      const source = nodes.find(n => n.id === sourceId)
      const target = nodes.find(n => n.id === targetId)
      if (!source || !target) return ''

      const mx = ((source.x || 0) + (target.x || 0)) / 2
      const my = ((source.y || 0) + (target.y || 0)) / 2

      return `translate(${mx}, ${my - 8})`
    })

  edges.forEach(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    edge._source = nodes.find(n => n.id === sourceId)
    edge._target = nodes.find(n => n.id === targetId)
  })

  // Update force simulation
  miniSimulation.nodes(nodes).on('tick', ticked)
  miniSimulation.force('link').links(edges)
  miniSimulation.alpha(1).restart()

  function ticked() {
    linkMerge.select('.mini-link')
      .attr('d', d => {
        const source = d._source || d.source
        const target = d._target || d.target
        if (!source || !target) return ''
        return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
      })

    linkMerge.select('.mini-link-label-group')
      .attr('transform', d => {
        const source = d._source || d.source
        const target = d._target || d.target
        if (!source || !target) return ''

        const mx = (source.x + target.x) / 2
        const my = (source.y + target.y) / 2
        return `translate(${mx}, ${my - 8})`
      })

    linkMerge.each(function (d) {
      const group = d3.select(this)
      const text = d.label || ''
      const textWidth = getMiniTextWidth(text, 9)

      group.select('.mini-link-label-bg')
        .attr('width', Math.max(30, textWidth))
        .attr('x', -textWidth / 2)
    })

    nodeMerge.attr('transform', d => {
      if (d.x !== undefined && d.y !== undefined) {
        nodePositions.set(d.id, { x: d.x, y: d.y })
      }
      return `translate(${d.x || 0}, ${d.y || 0})`
    })
  }
}

onUnmounted(() => {
  if (miniSimulation) {
    miniSimulation.stop()
  }
})
</script>

<style scoped>
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
  background: var(--color-white);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-lg);
}

/* 节点详情弹窗 - 三列布局 */
.modal-node-detail {
  max-width: 1400px;
  width: 98%;
  max-height: 90vh;
  min-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.node-detail-body {
  display: flex;
  gap: 20px;
  padding: 16px;
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
}

.node-info-column {
  flex: 0 0 320px;
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.node-info-column .column-title {
  flex-shrink: 0;
}

.node-info-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.node-graph-column {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.node-edges-column {
  flex: 0 0 350px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.column-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--color-primary);
}

.column-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-black);
  margin: 0;
}

.column-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-gray);
}

.level-select {
  padding: 4px 8px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-sm);
  background: var(--color-white);
  font-size: 12px;
  cursor: pointer;
}

.level-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* 小型图谱容器 */
.mini-graph-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px),
    linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px);
  background-size: 15px 15px;
  background-color: #fafafa;
}

.mini-graph-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.mini-graph-svg:active {
  cursor: grabbing;
}

.mini-node {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.mini-node:hover {
  transform: scale(1.08);
}

.mini-node-label {
  pointer-events: none;
  user-select: none;
  font-family: var(--font-display);
}

/* 边列表容器 */
.edges-list-container {
  flex: 1;
  overflow-y: auto;
}

.empty-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: var(--color-gray);
  font-size: 13px;
}

.node-detail-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.node-detail-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-gray-dark);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-gray-lightest);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  width: 80px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-gray);
  font-weight: 500;
}

.detail-value {
  flex: 1;
  font-size: 13px;
  color: var(--color-black);
  word-break: break-all;
}

.detail-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-gray);
}

.node-type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  color: white;
  font-weight: 500;
}

/* 属性列表 */
.properties-list {
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  padding: 12px;
}

.property-item {
  display: flex;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.property-item:last-child {
  border-bottom: none;
}

.property-key {
  width: 100px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
}

.property-value {
  flex: 1;
  font-size: 12px;
  color: var(--color-black);
  word-break: break-all;
}

/* 边列表 */
.edge-item {
  padding: 10px 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
}

.edge-item:last-child {
  margin-bottom: 0;
}

.edge-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.edge-direction {
  font-size: 16px;
  font-weight: bold;
  color: var(--color-primary);
}

.edge-label {
  padding: 2px 8px;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-pill);
  font-size: 10px;
}

.edge-target {
  color: var(--color-gray-dark);
  flex: 1;
}

.edge-target.clickable {
  cursor: pointer;
  color: var(--color-primary);
  font-weight: 500;
  transition: color 0.2s;
}

.edge-target.clickable:hover {
  color: #2b6cb0;
  text-decoration: underline;
}

/* 危险按钮 */
.btn-danger {
  background: #e74c3c;
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #c0392b;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.modal-header h3 {
  font-size: 16px;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-gray);
  cursor: pointer;
  line-height: 1;
}

.btn-close:hover {
  color: var(--color-black);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-gray-lighter);
}

.btn {
  padding: 8px 16px;
    color: var(--color-black);
  background: var(--color-white);
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  

}
.btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
