<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-cluster modal-cluster-with-graph">
      <div class="modal-header">
        <h3>📊 聚类分析</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body cluster-modal-body">
        <!-- 左侧：聚类配置和列表 -->
        <div class="cluster-sidebar">
          <!-- 聚类数量选择 -->
          <div class="cluster-config" v-if="!localClusterResult">
            <div class="form-group">
              <label>聚类数量 (k)</label>
              <div class="cluster-slider">
                <input type="range" v-model.number="localClusterK" :min="2" :max="Math.min(10, nodeCount)"
                  class="slider" :disabled="clustering" />
                <span class="slider-value">{{ localClusterK }}</span>
              </div>
            </div>

            <!-- 聚类进度条 -->
            <div v-if="clustering && clusterProgress.status === 'running'" class="cluster-progress">
              <div class="progress-header">
                <span class="progress-title">{{ clusterProgress.message || '正在聚类分析...' }}</span>
                <span class="progress-percent">{{ clusterProgress.progress }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: clusterProgress.progress + '%' }"></div>
              </div>
              <div class="progress-detail">
                步骤 {{ clusterProgress.current }} / {{ clusterProgress.total }}
              </div>
            </div>

            <div class="cluster-info">
              <p>📌 当前图谱共有 <strong>{{ nodeCount }}</strong> 个节点</p>
              <p>💡 建议聚类数量：3-5 个</p>
            </div>
          </div>

          <!-- 聚类结果列表 -->
          <div class="cluster-result" v-if="localClusterResult">
            <div class="cluster-summary">
              <h4>聚类结果</h4>
              <p>共分成 <strong>{{ localClusterResult.k }}</strong> 个聚类</p>
            </div>
            <div class="cluster-list">
              <div v-for="cluster in localClusterResult.clusters" :key="cluster.clusterId" class="cluster-item"
                :class="{ active: hoveredClusterId === cluster.clusterId }"
                :style="{ borderLeftColor: clusterColors[cluster.clusterId % clusterColors.length] }"
                @mouseenter="hoveredClusterId = cluster.clusterId" @mouseleave="hoveredClusterId = null">
                <div class="cluster-header">
                  <span class="cluster-badge"
                    :style="{ backgroundColor: clusterColors[cluster.clusterId % clusterColors.length] }">
                    {{ cluster.name || `聚类 ${cluster.clusterId + 1}` }}
                  </span>
                  <span class="cluster-count">{{ cluster.nodes.length }} 个节点</span>
                </div>
                <p v-if="cluster.description" class="cluster-description">{{ cluster.description }}</p>
                <div class="cluster-nodes">
                  <span v-for="node in cluster.nodes.slice(0, 5)" :key="node.id" class="cluster-node-tag"
                    :style="{ backgroundColor: clusterColors[cluster.clusterId % clusterColors.length] + '20' }"
                    @click="$emit('view-node', node)">
                    {{ node.label }}
                  </span>
                  <span v-if="cluster.nodes.length > 5" class="cluster-more">
                    +{{ cluster.nodes.length - 5 }} 更多
                  </span>
                </div>
              </div>
            </div>
            <div class="cluster-actions">
              <button class="btn" @click="$emit('highlight-cluster')" :disabled="!localClusterResult">
                🎯 高亮
              </button>
              <button class="btn btn-secondary" @click="$emit('clear-highlight')" :disabled="!localClusterResult">
                清除
              </button>
            </div>
          </div>
        </div>

        <!-- 右侧：聚类图谱展示 -->
        <div class="cluster-graph-panel">
          <div class="cluster-graph-container" ref="clusterGraphContainerRef">
            <svg ref="clusterGraphSvgRef" class="cluster-graph-svg"></svg>
          </div>
          <!-- 聚类图例 -->
          <div class="cluster-graph-legend" v-if="localClusterResult">
            <div v-for="cluster in localClusterResult.clusters" :key="cluster.clusterId" class="legend-item"
              :class="{ active: hoveredClusterId === cluster.clusterId }"
              @click="$emit('focus-cluster', cluster.clusterId)" @mouseenter="hoveredClusterId = cluster.clusterId"
              @mouseleave="hoveredClusterId = null">
              <span class="legend-color"
                :style="{ backgroundColor: clusterColors[cluster.clusterId % clusterColors.length] }"></span>
              <span class="legend-label">{{ cluster.name || `聚类 ${cluster.clusterId + 1}` }}</span>
              <span class="legend-count">({{ cluster.nodes.length }})</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
        <button class="btn" @click="$emit('execute-clustering', localClusterK)" :disabled="clustering || !localClusterK" v-if="!localClusterResult">
          {{ clustering ? '聚类中...' : '开始聚类' }}
        </button>
        <button class="btn" @click="$emit('reset-cluster')" v-if="localClusterResult">
          重新聚类
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
  clusterK: {
    type: Number,
    default: 3
  },
  clusterResult: {
    type: Object,
    default: null
  },
  clustering: {
    type: Boolean,
    default: false
  },
  clusterProgress: {
    type: Object,
    default: () => ({
      status: 'idle',
      progress: 0,
      current: 0,
      total: 0,
      message: ''
    })
  },
  nodeCount: {
    type: Number,
    default: 0
  },
  graphNodes: {
    type: Array,
    default: () => []
  },
  graphEdges: {
    type: Array,
    default: () => []
  },
  clusterColors: {
    type: Array,
    default: () => [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
  }
})

const emit = defineEmits([
  'update:modelValue',
  'close',
  'execute-clustering',
  'reset-cluster',
  'highlight-cluster',
  'clear-highlight',
  'focus-cluster',
  'view-node'
])

const localClusterK = ref(props.clusterK)
const localClusterResult = ref(props.clusterResult)
const hoveredClusterId = ref(null)
const clusterGraphContainerRef = ref(null)
const clusterGraphSvgRef = ref(null)

let clusterGraphSvg = null
let clusterGraphG = null
let clusterGraphSimulation = null

const MAX_NODE_WIDTH = 200

watch(() => props.clusterK, (val) => {
  localClusterK.value = val
})

watch(() => props.clusterResult, (val) => {
  localClusterResult.value = val
  if (val) {
    nextTick(() => {
      setTimeout(() => {
        renderClusterGraph()
      }, 100)
    })
  }
})

watch(() => props.modelValue, (val) => {
  if (val) {
    nextTick(() => {
      setTimeout(() => {
        renderClusterGraph()
      }, 100)
    })
  }
})

// Helper functions
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

// Cluster graph D3 functions
function clusterDragStarted(event, d) {
  if (!event.active) clusterGraphSimulation.alphaTarget(0.3).restart()
  d.fx = d.x
  d.fy = d.y
}

function clusterDragged(event, d) {
  d.fx = event.x
  d.fy = event.y
}

function clusterDragEnded(event, d) {
  if (!event.active) clusterGraphSimulation.alphaTarget(0)
  d.fx = null
  d.fy = null
}

const renderClusterGraph = () => {
  if (!clusterGraphSvgRef.value || !clusterGraphContainerRef.value || !localClusterResult.value) return

  // Stop previous simulation
  if (clusterGraphSimulation) {
    clusterGraphSimulation.stop()
  }

  const container = clusterGraphContainerRef.value
  const width = container.clientWidth || 700
  const height = container.clientHeight || 500

  // Clear
  d3.select(clusterGraphSvgRef.value).selectAll('*').remove()

  // Create SVG
  clusterGraphSvg = d3.select(clusterGraphSvgRef.value)
    .attr('width', width)
    .attr('height', height)

  // Define arrow
  const defs = clusterGraphSvg.append('defs')
  defs.append('marker')
    .attr('id', 'cluster-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#999')

  clusterGraphG = clusterGraphSvg.append('g')

  // Zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      clusterGraphG.attr('transform', event.transform)
    })

  clusterGraphSvg.call(zoom)

  // Build cluster title nodes
  const clusterTitleNodes = localClusterResult.value.clusters.map((cluster, index) => {
    const color = props.clusterColors[cluster.clusterId % props.clusterColors.length]
    return {
      id: `cluster-title-${cluster.clusterId}`,
      clusterId: cluster.clusterId,
      label: cluster.name || `聚类 ${cluster.clusterId + 1}`,
      type: 'cluster-title',
      color: color,
      nodeCount: cluster.nodes.length,
      description: cluster.description || '',
      isClusterTitle: true,
      x: width / 2 + (index - (localClusterResult.value.clusters.length - 1) / 2) * 200,
      y: 80
    }
  })

  // Build sub nodes
  const subNodes = []
  localClusterResult.value.clusters.forEach((cluster, clusterIndex) => {
    const color = props.clusterColors[cluster.clusterId % props.clusterColors.length]
    const nodesInCluster = cluster.nodes
    const startX = width / 2 + (clusterIndex - (localClusterResult.value.clusters.length - 1) / 2) * 200
    const startY = 200

    nodesInCluster.forEach((node, nodeIndex) => {
      const cols = Math.min(5, nodesInCluster.length)
      const col = nodeIndex % cols
      const row = Math.floor(nodeIndex / cols)

      subNodes.push({
        id: node.id,
        clusterId: cluster.clusterId,
        label: node.label,
        type: node.type,
        originalType: node.type,
        color: color,
        properties: node.properties,
        isClusterTitle: false,
        x: startX + (col - (cols - 1) / 2) * 150,
        y: startY + row * 80
      })
    })
  })

  // Build edges
  const clusterToNodeEdges = []
  localClusterResult.value.clusters.forEach(cluster => {
    cluster.nodes.forEach(node => {
      clusterToNodeEdges.push({
        id: `cluster-title-${cluster.clusterId}-to-${node.id}`,
        source: `cluster-title-${cluster.clusterId}`,
        target: node.id,
        type: 'cluster-member',
        label: '属于'
      })
    })
  })

  const originalEdges = []
  props.graphEdges.forEach(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target

    let sourceClusterId = -1
    let targetClusterId = -1

    localClusterResult.value.clusters.forEach(cluster => {
      if (cluster.nodes.find(n => n.id === sourceId)) {
        sourceClusterId = cluster.clusterId
      }
      if (cluster.nodes.find(n => n.id === targetId)) {
        targetClusterId = cluster.clusterId
      }
    })

    if (sourceClusterId !== -1 && targetClusterId !== -1) {
      originalEdges.push({
        id: `${sourceId}-to-${targetId}`,
        source: sourceId,
        target: targetId,
        type: edge.type || 'default',
        label: edge.label || ''
      })
    }
  })

  const allNodes = [...clusterTitleNodes, ...subNodes]
  const allEdges = [...clusterToNodeEdges, ...originalEdges]

  const nodePositions = new Map()
  allNodes.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y })
    }
  })

  // Draw edges
  const linkGroup = clusterGraphG.selectAll('.cluster-link-group')
    .data(allEdges, d => d.id)

  linkGroup.exit().remove()

  const linkEnter = linkGroup.enter()
    .append('g')
    .attr('class', 'cluster-link-group')

  linkEnter.append('path')
    .attr('class', 'cluster-link')
    .attr('fill', 'none')
    .attr('stroke', d => {
      if (d.type === 'cluster-member') {
        const sourceNode = allNodes.find(n => n.id === (d.source?.id || d.source))
        return sourceNode ? d3.color(sourceNode.color || '#999').darker(0.5) : '#999'
      }
      return '#ccc'
    })
    .attr('stroke-width', d => d.type === 'cluster-member' ? 2 : 1.5)
    .attr('stroke-dasharray', d => d.type === 'cluster-member' ? '0' : '5,3')

  linkEnter.filter(d => d.type !== 'cluster-member')
    .append('text')
    .attr('class', 'cluster-link-label')
    .attr('font-size', '9px')
    .attr('fill', '#999')
    .attr('text-anchor', 'middle')
    .attr('dy', '-4')

  const linkMerge = linkEnter.merge(linkGroup)

  linkMerge.select('.cluster-link-label')
    .text(d => d.label || '')

  // Draw nodes
  const nodeGroup = clusterGraphG.selectAll('.cluster-node')
    .data(allNodes, d => d.id)

  nodeGroup.exit().remove()

  const nodeEnter = nodeGroup.enter()
    .append('g')
    .attr('class', 'cluster-node')
    .call(d3.drag()
      .on('start', clusterDragStarted)
      .on('drag', clusterDragged)
      .on('end', clusterDragEnded))
    .on('click', (event, d) => {
      if (d.isClusterTitle) {
        emit('focus-cluster', d.clusterId)
      } else {
        emit('view-node', d)
      }
    })
    .on('mouseenter', function (event, d) {
      d3.select(this).select('.cluster-node-bg')
        .attr('stroke-width', d.isClusterTitle ? 4 : 3)
    })
    .on('mouseleave', function (event, d) {
      d3.select(this).select('.cluster-node-bg')
        .attr('stroke-width', d.isClusterTitle ? 3 : 2)
    })

  nodeEnter.append('rect')
    .attr('class', 'cluster-node-bg')
    .attr('y', -22)
    .attr('height', 44)
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', 'white')
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2)

  nodeEnter.append('text')
    .attr('class', 'cluster-node-label')
    .attr('dy', '-4')
    .attr('text-anchor', 'middle')
    .attr('font-size', d => d.isClusterTitle ? '13px' : '12px')
    .attr('font-weight', '600')
    .attr('fill', d => d.color)

  nodeEnter.append('text')
    .attr('class', 'cluster-node-content')
    .attr('dy', '14')
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#888')

  const nodeMerge = nodeEnter.merge(nodeGroup)

  nodeMerge.each(function (d) {
    const group = d3.select(this)
    const label = d.label || ''
    let content = ''

    if (d.isClusterTitle) {
      content = `${d.nodeCount} 个节点`
    } else {
      content = d.originalType || d.type || 'default'
    }

    const labelWidth = getMiniTextWidth(label, d.isClusterTitle ? 13 : 12)
    const contentWidth = getMiniTextWidth(content, 10)
    const rawMaxWidth = Math.max(labelWidth, contentWidth) + 20
    const maxWidth = Math.min(rawMaxWidth, MAX_NODE_WIDTH)

    const truncatedLabel = truncateMiniText(label, MAX_NODE_WIDTH, d.isClusterTitle ? 13 : 12)
    const truncatedContent = truncateMiniText(content, MAX_NODE_WIDTH, 10)

    group.select('.cluster-node-bg')
      .attr('x', -maxWidth / 2)
      .attr('width', maxWidth)
      .attr('fill', d.isClusterTitle ? d.color + '10' : 'white')

    group.select('.cluster-node-label')
      .text(truncatedLabel)

    group.select('.cluster-node-content')
      .text(truncatedContent)
  })

  // Initialize force simulation
  clusterGraphSimulation = d3.forceSimulation()
    .velocityDecay(0.4)
    .force('link', d3.forceLink().id(d => d.id).distance(d => d.type === 'cluster-member' ? 80 : 100))
    .force('charge', d3.forceManyBody().strength(d => d.isClusterTitle ? -300 : -150))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.08))
    .force('collision', d3.forceCollide().radius(d => d.isClusterTitle ? 50 : 30))

  clusterGraphSimulation.nodes(allNodes).on('tick', clusterTick)
  clusterGraphSimulation.force('link').links(allEdges)
  clusterGraphSimulation.alpha(1).restart()

  function clusterTick() {
    linkMerge.select('.cluster-link')
      .attr('d', d => {
        const sourceId = d.source?.id || d.source
        const targetId = d.target?.id || d.target
        const source = allNodes.find(n => n.id === sourceId)
        const target = allNodes.find(n => n.id === targetId)
        if (!source || !target) return ''

        if (source.id === target.id) {
          return `M ${source.x} ${source.y - 25}
                  C ${source.x - 40} ${source.y - 60}, ${source.x + 40} ${source.y - 60}, ${source.x} ${source.y - 25}`
        }

        return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
      })

    linkMerge.select('.cluster-link-label')
      .attr('transform', d => {
        const sourceId = d.source?.id || d.source
        const targetId = d.target?.id || d.target
        const source = allNodes.find(n => n.id === sourceId)
        const target = allNodes.find(n => n.id === targetId)
        if (!source || !target) return ''

        const mx = (source.x + target.x) / 2
        const my = (source.y + target.y) / 2
        return `translate(${mx}, ${my - 8})`
      })

    nodeMerge.attr('transform', d => {
      if (d.x < 50) d.x = 50
      if (d.x > width - 50) d.x = width - 50
      if (d.y < 50) d.y = 50
      if (d.y > height - 50) d.y = height - 50

      if (d.x !== undefined && d.y !== undefined) {
        nodePositions.set(d.id, { x: d.x, y: d.y })
      }
      return `translate(${d.x || 0}, ${d.y || 0})`
    })
  }
}

onUnmounted(() => {
  if (clusterGraphSimulation) {
    clusterGraphSimulation.stop()
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

/* 聚类分析弹窗样式 - 带图谱 */
.modal-cluster-with-graph {
  max-width: 1400px !important;
  width: 98% !important;
  max-height: 95vh !important;
}

.cluster-modal-body {
  display: flex;
  gap: 24px;
  padding: 20px;
  min-height: 600px;
}

.cluster-sidebar {
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cluster-graph-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
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

/* 聚类分析弹窗样式 */
.cluster-config {
  padding: 10px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.cluster-slider {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 聚类进度条样式 */
.cluster-progress {
  margin: 16px 0;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: var(--radius-md);
  color: white;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.progress-title {
  font-size: 13px;
  font-weight: 500;
}

.progress-percent {
  font-size: 16px;
  font-weight: 700;
}

.progress-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-detail {
  margin-top: 8px;
  font-size: 12px;
  text-align: center;
  opacity: 0.9;
}

.slider {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) var(--progress, 50%), var(--color-gray-lighter) var(--progress, 50%), var(--color-gray-lighter) 100%);
  border-radius: 4px;
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-value {
  min-width: 30px;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-primary);
}

.cluster-info {
  margin-top: 20px;
  padding: 16px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
}

.cluster-info p {
  margin: 0;
  padding: 4px 0;
  font-size: 13px;
  color: var(--color-gray-dark);
}

.cluster-info strong {
  color: var(--color-primary);
}

.cluster-result {
  padding: 10px 0;
}

.cluster-summary {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.cluster-summary h4 {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 600;
}

.cluster-summary p {
  margin: 0;
  font-size: 13px;
  color: var(--color-gray-dark);
}

.cluster-summary strong {
  color: var(--color-primary);
}

.cluster-list {
  max-height: 350px;
  overflow-y: auto;
}

.cluster-item {
  padding: 12px 16px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
  border-left: 4px solid;
}

.cluster-item:last-child {
  margin-bottom: 0;
}

.cluster-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.cluster-badge {
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.cluster-count {
  font-size: 12px;
  color: var(--color-gray);
}

.cluster-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cluster-node-tag {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  color: var(--color-black);
  cursor: pointer;
  transition: all 0.2s;
}

.cluster-node-tag:hover {
  transform: scale(1.05);
}

.cluster-more {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-gray);
}

.cluster-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-gray-lighter);
}

.cluster-actions .btn {
  flex: 1;
}

/* 聚类图谱容器 */
.cluster-graph-container {
  flex: 1;
  width: 100%;
  min-height: 400px;
  height: 100%;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px),
    linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px);
  background-size: 15px 15px;
  background-color: #fafafa;
  overflow: hidden;
}

.cluster-graph-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.cluster-graph-svg:active {
  cursor: grabbing;
}

/* 聚类图谱图例 */
.cluster-graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  padding: 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-white);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.legend-item:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-black);
}

.legend-count {
  font-size: 12px;
  color: var(--color-gray);
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-gray-lightest);
  color: var(--color-gray-dark);
}

.btn-secondary:hover {
  background: var(--color-gray-lighter);
  color: var(--color-black);
}
</style>
