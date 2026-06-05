import { ref, computed } from 'vue'
import * as d3 from 'd3'

export function useMiniGraph(graphData, selectedNodeData, associationLevel, getNodeColor) {
  // Refs
  const miniGraphRef = ref(null)
  const miniGraphSvgRef = ref(null)

  // Highlight state
  const miniHighlightedNodeId = ref(null)
  const miniRelatedNodeIds = ref(new Set())
  const miniRelatedEdgeIds = ref(new Set())

  // D3 variables
  let miniGraphSvg = null
  let miniGraphG = null
  let miniSimulation = null

  // Constants
  const MAX_NODE_WIDTH = 200

  // Compute related nodes by level (BFS algorithm)
  const getRelatedNodesByLevel = (centerNodeId, level) => {
    const relatedNodeIds = new Set([centerNodeId])
    const relatedEdges = []

    let currentLevel = new Set([centerNodeId])

    for (let i = 0; i < level; i++) {
      const nextLevel = new Set()

      graphData.edges.forEach(edge => {
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

  // Computed: related nodes at level 1
  const relatedNodes = computed(() => {
    if (!selectedNodeData?.value?.id) return []
    const { relatedNodeIds } = getRelatedNodesByLevel(selectedNodeData.value.id, 1)
    return graphData.nodes.filter(n => relatedNodeIds.has(n.id))
  })

  // Computed: mini graph data
  const miniGraphData = computed(() => {
    if (!selectedNodeData?.value?.id) return { nodes: [], edges: [] }

    const nodeId = selectedNodeData.value.id
    const { relatedNodeIds, relatedEdges } = getRelatedNodesByLevel(nodeId, associationLevel?.value || 1)

    const nodes = graphData.nodes
      .filter(n => relatedNodeIds.has(n.id))
      .map(n => ({ ...n }))

    return { nodes, edges: relatedEdges }
  })

  // Helper: measure text width
  const getMiniTextWidth = (text, fontSize = 12) => {
    if (!text) return 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx.font = `${fontSize}px sans-serif`
    return ctx.measureText(text).width + 10
  }

  // Helper: truncate text
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

  // Helper: get node size
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

  // Highlight node and its neighbors
  const highlightMiniNode = (node) => {
    if (!node) return

    const nodeId = node.id
    miniHighlightedNodeId.value = nodeId

    const relatedNodesSet = new Set()
    const relatedEdgesSet = new Set()

    miniGraphData.value.edges.forEach(edge => {
      const sourceId = edge.source?.id || edge.source
      const targetId = edge.target?.id || edge.target

      if (sourceId === nodeId || targetId === nodeId) {
        relatedEdgesSet.add(edge.id)
        if (sourceId === nodeId) {
          relatedNodesSet.add(targetId)
        } else {
          relatedNodesSet.add(sourceId)
        }
      }
    })

    miniRelatedNodeIds.value = relatedNodesSet
    miniRelatedEdgeIds.value = relatedEdgesSet

    applyMiniHighlight()
  }

  // Apply highlight styles
  const applyMiniHighlight = () => {
    if (!miniGraphG) return

    // Highlight nodes
    miniGraphG.selectAll('.mini-node').each(function(d) {
      const el = d3.select(this)
      const isHovered = d.id === miniHighlightedNodeId.value
      const isRelated = miniRelatedNodeIds.value.has(d.id)

      if (isHovered) {
        el.select('.mini-node-bg')
          .attr('stroke', '#FF4500')
          .attr('stroke-width', 4)
          .attr('fill', '#FFF5F0')
      } else if (isRelated) {
        el.select('.mini-node-bg')
          .attr('stroke', getNodeColor(d.type))
          .attr('stroke-width', 3)
          .attr('fill', '#F0F8FF')
      } else {
        el.select('.mini-node-bg')
          .attr('stroke', getNodeColor(d.type))
          .attr('stroke-width', 2)
          .attr('fill', 'white')
      }
    })

    // Highlight edges
    miniGraphG.selectAll('.mini-link-group').each(function(d) {
      const el = d3.select(this)
      const isRelated = miniRelatedEdgeIds.value.has(d.id)

      if (isRelated) {
        el.select('.mini-link')
          .attr('stroke', '#FF4500')
          .attr('stroke-width', 3)
        el.select('.mini-link-label-bg')
          .attr('fill', '#FFF5F0')
          .attr('stroke', '#FF4500')
      } else {
        el.select('.mini-link')
          .attr('stroke', '#999')
          .attr('stroke-width', 2)
        el.select('.mini-link-label-bg')
          .attr('fill', 'white')
          .attr('stroke', '#ddd')
      }
    })
  }

  // Clear highlight
  const clearMiniHighlight = () => {
    miniHighlightedNodeId.value = null
    miniRelatedNodeIds.value = new Set()
    miniRelatedEdgeIds.value = new Set()

    if (!miniGraphG) return

    miniGraphG.selectAll('.mini-node').each(function(d) {
      const el = d3.select(this)
      el.select('.mini-node-bg')
        .attr('stroke', getNodeColor(d.type))
        .attr('stroke-width', 2)
        .attr('fill', 'white')
    })

    miniGraphG.selectAll('.mini-link-group').each(function(d) {
      const el = d3.select(this)
      el.select('.mini-link')
        .attr('stroke', '#999')
        .attr('stroke-width', 2)
      el.select('.mini-link-label-bg')
        .attr('fill', 'white')
        .attr('stroke', '#ddd')
    })
  }

  // Drag functions
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

  // Render mini graph
  const renderMiniGraph = () => {
    if (!miniGraphSvgRef?.value || !miniGraphRef?.value) return

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

    // Define arrow marker
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

    const data = miniGraphData.value
    if (data.nodes.length === 0) return

    // Node position map
    const nodePositions = new Map()

    // Initialize nodes (preserve existing positions)
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

    // Edge path
    linkEnter.append('path')
      .attr('class', 'mini-link')
      .attr('fill', 'none')
      .attr('stroke', '#999')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,3')

    // Edge label background
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

    // Update label text and background
    linkMerge.each(function(d) {
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
        // Handle node click
      })
      .on('mouseenter', (event, d) => {
        highlightMiniNode(d)
      })
      .on('mouseleave', () => {
        clearMiniHighlight()
      })

    // Node background
    nodeEnter.append('rect')
      .attr('class', 'mini-node-bg')
      .attr('y', -22)
      .attr('height', 44)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', 'white')
      .attr('stroke', d => getNodeColor(d.type))
      .attr('stroke-width', 2)

    // Node label
    nodeEnter.append('text')
      .attr('class', 'mini-node-label')
      .attr('dy', '-4')
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', d => getNodeColor(d.type))

    // Node content
    nodeEnter.append('text')
      .attr('class', 'mini-node-content')
      .attr('dy', '14')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#888')

    const nodeMerge = nodeEnter.merge(nodeGroup)

    // Dynamic node card sizing
    nodeMerge.each(function(d) {
      const group = d3.select(this)
      const label = d.label || ''
      const type = d.type || 'default'
      const props = d.properties || {}
      let content = type
      if (Object.keys(props).length > 0) {
        const firstProp = props[Object.keys(props)[0]]
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

    // Edge label position
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

    // Save node references to edges
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

      // Update label background position
      linkMerge.each(function(d) {
        const group = d3.select(this)
        const text = d.label || ''
        const textWidth = getMiniTextWidth(text, 9)

        group.select('.mini-link-label-bg')
          .attr('width', Math.max(30, textWidth))
          .attr('x', -textWidth / 2)
      })

      // Update node positions
      nodeMerge.attr('transform', d => {
        if (d.x !== undefined && d.y !== undefined) {
          nodePositions.set(d.id, { x: d.x, y: d.y })
        }
        return `translate(${d.x || 0}, ${d.y || 0})`
      })
    }
  }

  return {
    // Refs
    miniGraphRef,
    miniGraphSvgRef,
    // State
    miniHighlightedNodeId,
    miniRelatedNodeIds,
    miniRelatedEdgeIds,
    // Computed
    relatedNodes,
    miniGraphData,
    // Functions
    getRelatedNodesByLevel,
    renderMiniGraph,
    highlightMiniNode,
    clearMiniHighlight,
    getMiniTextWidth,
    truncateMiniText,
    getMiniNodeSize
  }
}
