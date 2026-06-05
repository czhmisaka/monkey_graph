import { ref } from 'vue'

export function useStreaming(graphData, graphPanelRef) {
  // State
  const streamingProgress = ref({ loaded: 0, total: 0, type: '' })

  // Handle graph loaded - incremental update
  const handleGraphLoaded = (data) => {
    console.log('[useStreaming] handleGraphLoaded called')
    console.log('[useStreaming] Received data:', JSON.stringify(data)?.slice(0, 500) || data)

    if (!graphData || !data) return

    // Get existing data IDs for incremental update
    const existingNodeIds = new Set(graphData.nodes.map(n => n.id))
    const existingEdgeIds = new Set(graphData.edges.map(e => e.id))

    // Incremental update nodes - only add new nodes
    if (data && data.nodes && data.nodes.length > 0) {
      const newNodes = data.nodes.filter(n => !existingNodeIds.has(n.id))
      if (newNodes.length > 0) {
        graphData.nodes.push(...newNodes)
        console.log(`[useStreaming] Incremental update nodes: +${newNodes.length} (total: ${graphData.nodes.length})`)
      }
    }

    // Incremental update edges - only add new edges
    if (data && data.edges && data.edges.length > 0) {
      const newEdges = data.edges.filter(e => !existingEdgeIds.has(e.id))
      if (newEdges.length > 0) {
        graphData.edges.push(...newEdges)
        console.log(`[useStreaming] Incremental update edges: +${newEdges.length} (total: ${graphData.edges.length})`)
      }
    }

    console.log(`[useStreaming] graphData final state: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`)
  }

  // Handle streaming batch
  const handleStreamingBatch = (data) => {
    console.log('[useStreaming] Streaming batch:', data)

    if (data.type === 'nodes') {
      streamingProgress.value = { loaded: data.loaded, total: data.total, type: 'nodes' }
      console.log(`[useStreaming] Node progress: ${data.loaded}/${data.total}`)
    } else if (data.type === 'edges') {
      streamingProgress.value = { loaded: data.loaded, total: data.total, type: 'edges' }
      console.log(`[useStreaming] Edge progress: ${data.loaded}/${data.total}`)
    }

    // Notify graph panel component to update (ForceGraphPanel handles data accumulation internally)
    if (graphPanelRef?.value?.handleStreamingBatch) {
      graphPanelRef.value.handleStreamingBatch(data)
    }
  }

  return {
    streamingProgress,
    handleGraphLoaded,
    handleStreamingBatch
  }
}
