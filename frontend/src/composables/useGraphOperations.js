import { ref, reactive, nextTick } from 'vue'
import { graphAPI, historyAPI } from '../api'

export function useGraphOperations(currentGraphId, graphData, graphPanelRef, graphSettings) {
  // Node colors
  const nodeColors = {
    person: '#4A90D9',
    organization: '#50C878',
    concept: '#9B59B6',
    location: '#F39C12',
    default: '#95A5A6'
  }

  // Node detail modal state
  const showNodeModal = ref(false)
  const selectedNodeData = ref({})
  const relatedEdges = ref([])
  const associationLevel = ref(1)

  // Streaming
  const streaming = ref(true)

  // Get node color
  const getNodeColor = (type) => {
    if (graphSettings.value?.nodeTypes?.[type]?.color) {
      return graphSettings.value.nodeTypes[type].color
    }
    return nodeColors[type] || nodeColors.default
  }

  // Load graph (normal mode)
  const loadGraphNormal = async () => {
    if (!currentGraphId.value) return
    try {
      console.log('[Home] 普通加载图谱:', currentGraphId.value)
      const data = await graphAPI.getGraph(currentGraphId.value)
      graphData.nodes = data.nodes || []
      graphData.edges = data.edges || []
    } catch (error) {
      console.error('加载图谱失败:', error)
    }
  }

  // Load graph (with streaming)
  const loadGraph = async (streamingProgress, handleStreamingBatch) => {
    if (!currentGraphId.value) return

    if (streaming.value) {
      console.log('[Home] 使用流式加载图谱:', currentGraphId.value)

      try {
        if (!graphPanelRef.value) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        if (graphPanelRef.value?.loadGraphStream) {
          await graphPanelRef.value.loadGraphStream(currentGraphId.value, handleStreamingBatch, (loaded, total, type) => {
            streamingProgress.value = { loaded, total, type }
          })

          console.log('[Home] 流式加载完成，节点数:', graphData.nodes.length, '边数:', graphData.edges.length)
        } else {
          await loadGraphNormal()
        }
      } catch (error) {
        await loadGraphNormal()
      }
    } else {
      await loadGraphNormal()
    }

    if (graphPanelRef.value) {
      graphPanelRef.value.setGraphId(currentGraphId.value)
    }
  }

  // Undo operation
  const undo = async () => {
    if (!currentGraphId.value) return
    try {
      const result = await historyAPI.undo(currentGraphId.value)
      if (result.success) {
        await loadGraphNormal()
      } else {
        alert(result.message)
      }
    } catch (error) {
      console.error('撤销失败:', error)
    }
  }

  // Close node modal
  const closeNodeModal = () => {
    showNodeModal.value = false
    selectedNodeData.value = {}
    relatedEdges.value = []
  }

  // Delete selected node
  const deleteSelectedNode = async () => {
    if (!selectedNodeData.value.id || !currentGraphId.value) return
    if (!confirm(`确定要删除节点 "${selectedNodeData.value.label}" 吗？此操作将同时删除所有关联的边，且不可恢复。`)) {
      return
    }
    try {
      await graphAPI.deleteNode(currentGraphId.value, selectedNodeData.value.id)
      closeNodeModal()
      await loadGraphNormal()
    } catch (error) {
      alert('删除节点失败: ' + error.message)
    }
  }

  // Handle node click
  const handleNodeClick = async (node, renderMiniGraph) => {
    if (!currentGraphId.value) return

    try {
      const nodeDetail = await graphAPI.getNode(currentGraphId.value, node.id)
      selectedNodeData.value = nodeDetail || node
      relatedEdges.value = graphData.edges.filter(
        edge => edge.source === node.id || edge.target === node.id
      )
      showNodeModal.value = true
      nextTick(() => {
        setTimeout(() => {
          renderMiniGraph()
        }, 100)
      })
    } catch (error) {
      if (error.message?.includes('不存在') || error.status === 404) {
        await loadGraphNormal()
        return
      }
      selectedNodeData.value = node
      relatedEdges.value = graphData.edges.filter(
        edge => edge.source === node.id || edge.target === node.id
      )
      showNodeModal.value = true
      nextTick(() => {
        setTimeout(() => {
          renderMiniGraph()
        }, 100)
      })
    }
  }

  // View node detail
  const viewNodeDetail = async (nodeId, renderMiniGraph) => {
    if (!currentGraphId.value) return
    try {
      const nodeDetail = await graphAPI.getNode(currentGraphId.value, nodeId)
      selectedNodeData.value = nodeDetail
      relatedEdges.value = graphData.edges.filter(
        edge => edge.source === nodeId || edge.target === nodeId
      )
      showNodeModal.value = true
      nextTick(() => {
        setTimeout(() => {
          renderMiniGraph()
        }, 100)
      })
    } catch (error) {
      if (error.message?.includes('不存在') || error.status === 404) {
        await loadGraphNormal()
        return
      }
      const cachedNode = graphData.nodes.find(n => n.id === nodeId)
      selectedNodeData.value = cachedNode || { id: nodeId }
      relatedEdges.value = graphData.edges.filter(
        edge => edge.source === nodeId || edge.target === nodeId
      )
      showNodeModal.value = true
      nextTick(() => {
        setTimeout(() => {
          renderMiniGraph()
        }, 100)
      })
    }
  }

  // Handle edge click
  const handleEdgeClick = (edge) => {
    console.log('点击边:', edge)
  }

  // Handle settings update
  const handleSettingsUpdate = (settings) => {
    graphSettings.value = settings
  }

  return {
    // State
    nodeColors,
    showNodeModal,
    selectedNodeData,
    relatedEdges,
    associationLevel,
    streaming,
    // Functions
    getNodeColor,
    loadGraph,
    loadGraphNormal,
    undo,
    closeNodeModal,
    deleteSelectedNode,
    handleNodeClick,
    viewNodeDetail,
    handleEdgeClick,
    handleSettingsUpdate
  }
}
