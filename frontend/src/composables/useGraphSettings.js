import { ref, computed } from 'vue'
import { graphsAPI } from '../api'

export function useGraphSettings(currentGraphId) {
  // State
  const showSettingsModal = ref(false)
  const graphSettings = ref({ nodeTypes: {}, edgeTypes: {} })
  const newNodeType = ref({ name: '', color: '#4A90D9' })
  const newEdgeType = ref({ name: '', color: '#999', style: 'dashed' })

  // Default node colors
  const defaultNodeColors = {
    person: '#4A90D9',
    organization: '#50C878',
    concept: '#9B59B6',
    location: '#F39C12',
    default: '#95A5A6'
  }

  // Computed
  const nodeTypes = computed(() => graphSettings.value?.nodeTypes || {})
  const edgeTypes = computed(() => graphSettings.value?.edgeTypes || {})

  // Get node color (prefers settings config, falls back to defaults)
  const getNodeColor = (type) => {
    if (graphSettings.value?.nodeTypes?.[type]?.color) {
      return graphSettings.value.nodeTypes[type].color
    }
    return defaultNodeColors[type] || defaultNodeColors.default
  }

  // Get edge color
  const getEdgeColor = (type) => {
    if (graphSettings.value?.edgeTypes?.[type]?.color) {
      return graphSettings.value.edgeTypes[type].color
    }
    return '#999'
  }

  // Get edge style
  const getEdgeStyle = (type) => {
    if (graphSettings.value?.edgeTypes?.[type]?.style) {
      return graphSettings.value.edgeTypes[type].style
    }
    return 'dashed'
  }

  // Load graph settings
  const loadGraphSettings = async () => {
    if (!currentGraphId?.value) return
    try {
      const settings = await graphsAPI.getSettings(currentGraphId.value)
      graphSettings.value = settings || { nodeTypes: {}, edgeTypes: {} }
    } catch (error) {
      console.error('Load graph settings failed:', error)
      graphSettings.value = { nodeTypes: {}, edgeTypes: {} }
    }
  }

  // Save graph settings
  const saveGraphSettings = async (emit) => {
    if (!currentGraphId?.value) return
    try {
      await graphsAPI.updateSettings(currentGraphId.value, graphSettings.value)
      showSettingsModal.value = false
      // Notify GraphPanel to update settings
      if (emit) {
        emit('settings-update', graphSettings.value)
      }
    } catch (error) {
      alert('Save settings failed: ' + error.message)
      throw error
    }
  }

  // Add node type
  const addNodeType = () => {
    if (!newNodeType.value.name.trim()) return
    graphSettings.value.nodeTypes = {
      ...graphSettings.value.nodeTypes,
      [newNodeType.value.name]: {
        color: newNodeType.value.color,
        shape: 'rect'
      }
    }
    newNodeType.value = { name: '', color: '#4A90D9' }
  }

  // Remove node type
  const removeNodeType = (typeName) => {
    const newTypes = { ...graphSettings.value.nodeTypes }
    delete newTypes[typeName]
    graphSettings.value.nodeTypes = newTypes
  }

  // Add edge type
  const addEdgeType = () => {
    if (!newEdgeType.value.name.trim()) return
    graphSettings.value.edgeTypes = {
      ...graphSettings.value.edgeTypes,
      [newEdgeType.value.name]: {
        color: newEdgeType.value.color,
        style: newEdgeType.value.style
      }
    }
    newEdgeType.value = { name: '', color: '#999', style: 'dashed' }
  }

  // Remove edge type
  const removeEdgeType = (typeName) => {
    const newTypes = { ...graphSettings.value.edgeTypes }
    delete newTypes[typeName]
    graphSettings.value.edgeTypes = newTypes
  }

  // Open settings modal
  const openSettingsModal = async () => {
    await loadGraphSettings()
    showSettingsModal.value = true
  }

  // Update settings from external source (e.g., from chat)
  const updateSettings = (settings) => {
    if (settings) {
      graphSettings.value = settings
    }
  }

  return {
    // State
    showSettingsModal,
    graphSettings,
    newNodeType,
    newEdgeType,
    // Computed
    nodeTypes,
    edgeTypes,
    // Functions
    getNodeColor,
    getEdgeColor,
    getEdgeStyle,
    loadGraphSettings,
    saveGraphSettings,
    addNodeType,
    removeNodeType,
    addEdgeType,
    removeEdgeType,
    openSettingsModal,
    updateSettings
  }
}
