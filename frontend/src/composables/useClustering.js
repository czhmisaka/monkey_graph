import { ref, onUnmounted } from 'vue'
import { embeddingAPI } from '../api'

export function useClustering(graphData, graphPanelRef, currentGraphId, embeddingStatus) {
  // State
  const showClusterModal = ref(false)
  const clustering = ref(false)
  const clusterK = ref(3)
  const clusterResult = ref(null)
  const clusterHighlightedNodeIds = ref(new Set())
  const hoveredClusterId = ref(null)

  // Cluster progress state
  const clusterProgress = ref({
    status: 'idle',
    progress: 0,
    current: 0,
    total: 0,
    message: ''
  })

  let clusterProgressTimer = null

  // Lifecycle: 组件卸载时自动清理定时器，防止内存泄漏
  onUnmounted(() => {
    if (clusterProgressTimer) {
      clearInterval(clusterProgressTimer)
      clusterProgressTimer = null
    }
  })

  // Cluster colors
  const clusterColors = [
    '#FF6B6B', // Red
    '#4ECDC4', // Cyan
    '#45B7D1', // Blue
    '#96CEB4', // Green
    '#FFEAA7', // Yellow
    '#DDA0DD', // Purple
    '#98D8C8', // Mint
    '#F7DC6F', // Gold
    '#BB8FCE', // Violet
    '#85C1E9'  // Light blue
  ]

  // Open cluster modal
  const openClusterModal = () => {
    if (!embeddingStatus?.value?.hasEmbeddings) {
      alert('请先计算向量再进行聚类分析')
      return
    }
    showClusterModal.value = true
    clusterResult.value = null
    // Default cluster count based on node count
    const nodeCount = graphData?.nodes?.length || 0
    clusterK.value = Math.min(Math.max(3, Math.floor(nodeCount / 5)), 10)
  }

  // Close cluster modal
  const closeClusterModal = () => {
    showClusterModal.value = false
    clearClusterHighlight()
  }

  // Start cluster progress polling
  const startClusterProgressPolling = () => {
    if (clusterProgressTimer) {
      clearInterval(clusterProgressTimer)
    }

    clusterProgressTimer = setInterval(async () => {
      try {
        const progress = await embeddingAPI.getClusterProgress(currentGraphId?.value)
        clusterProgress.value = progress

        if (progress.status === 'idle' || progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(clusterProgressTimer)
          clusterProgressTimer = null
        }
      } catch (error) {
        console.error('[useClustering] Get cluster progress failed:', error)
      }
    }, 1000)
  }

  // Stop cluster progress polling
  const stopClusterProgressPolling = () => {
    if (clusterProgressTimer) {
      clearInterval(clusterProgressTimer)
      clusterProgressTimer = null
    }
  }

  // Execute clustering
  const executeClustering = async () => {
    if (!currentGraphId?.value || clustering.value) return

    clustering.value = true
    clusterProgress.value = {
      status: 'running',
      progress: 0,
      current: 0,
      total: 0,
      message: '正在启动聚类分析...'
    }

    // Start progress polling
    startClusterProgressPolling()

    try {
      console.log(`[useClustering] Starting clustering, k=${clusterK.value}`)
      const result = await embeddingAPI.clusterNodes(currentGraphId.value, clusterK.value)
      console.log('[useClustering] Clustering result:', result)

      // Stop progress polling
      stopClusterProgressPolling()

      if (result.success) {
        clusterResult.value = result
        clusterProgress.value = {
          status: 'completed',
          progress: 100,
          current: result.k + 1,
          total: result.k + 1,
          message: '聚类分析完成！'
        }
        console.log(`[useClustering] Clustering complete: ${result.k} clusters, ${result.totalNodes} nodes`)
      } else {
        clusterProgress.value = {
          status: 'failed',
          progress: 0,
          current: 0,
          total: 0,
          message: result.error || '聚类分析失败'
        }
        alert('聚类分析失败: ' + (result.error || '未知错误'))
      }
    } catch (error) {
      console.error('[useClustering] Clustering failed:', error)
      clusterProgress.value = {
        status: 'failed',
        progress: 0,
        current: 0,
        total: 0,
        message: error.message
      }
      alert('聚类分析失败: ' + error.message)
    } finally {
      clustering.value = false
    }
  }

  // Highlight cluster nodes
  const highlightClusterNodes = () => {
    if (!clusterResult.value || !graphPanelRef?.value) return

    // Collect all cluster node IDs
    const allClusterNodeIds = new Set()
    clusterResult.value.clusters.forEach(cluster => {
      cluster.nodes.forEach(node => {
        allClusterNodeIds.add(node.id)
      })
    })

    clusterHighlightedNodeIds.value = allClusterNodeIds

    // Call GraphPanel method to highlight nodes
    if (graphPanelRef.value && graphPanelRef.value.highlightNodesByIds) {
      graphPanelRef.value.highlightNodesByIds(allClusterNodeIds, clusterColors)
    }
  }

  // Clear cluster highlight
  const clearClusterHighlight = () => {
    clusterHighlightedNodeIds.value = new Set()

    if (graphPanelRef?.value && graphPanelRef.value.clearHighlight) {
      graphPanelRef.value.clearHighlight()
    }
  }

  // Reset cluster
  const resetCluster = () => {
    clusterResult.value = null
    clearClusterHighlight()
  }

  // Focus specific cluster in graph
  const focusClusterInGraph = (clusterId) => {
    if (!clusterResult.value || !graphPanelRef?.value) return

    const cluster = clusterResult.value.clusters.find(c => c.clusterId === clusterId)
    if (!cluster) return

    const nodeIds = new Set(cluster.nodes.map(n => n.id))

    // Highlight this cluster's nodes
    if (graphPanelRef.value.highlightNodesByIds) {
      const colors = {}
      colors[clusterId] = clusterColors[clusterId % clusterColors.length]
      graphPanelRef.value.highlightNodesByIds(nodeIds, colors, clusterId)
    }
  }

  return {
    // State
    showClusterModal,
    clustering,
    clusterK,
    clusterResult,
    clusterProgress,
    clusterColors,
    clusterHighlightedNodeIds,
    hoveredClusterId,
    // Functions
    openClusterModal,
    closeClusterModal,
    executeClustering,
    highlightClusterNodes,
    clearClusterHighlight,
    resetCluster,
    focusClusterInGraph,
    startClusterProgressPolling,
    stopClusterProgressPolling
  }
}