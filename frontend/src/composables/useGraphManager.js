import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { graphsAPI } from '../api'

export function useGraphManager() {
  const router = useRouter()
  const route = useRoute()

  // State
  const graphs = ref([])
  const currentGraphId = ref(null)

  // Graph mode
  const getSavedGraphMode = () => {
    const savedMode = localStorage.getItem('monkeygraph_graph_mode')
    if (savedMode && ['force', 'radial', 'three'].includes(savedMode)) {
      return savedMode
    }
    return 'force'
  }
  const graphMode = ref(getSavedGraphMode())

  const switchGraphMode = (mode) => {
    graphMode.value = mode
    localStorage.setItem('monkeygraph_graph_mode', mode)
  }

  // Load graphs list
  const loadGraphs = async () => {
    try {
      graphs.value = await graphsAPI.getAll()
      if (graphs.value.length === 0) {
        const newGraph = await graphsAPI.create({ name: '默认图谱' })
        graphs.value = [newGraph]
        router.replace(`/graph/${newGraph.id}`)
        currentGraphId.value = newGraph.id
      }
    } catch (error) {
      console.error('加载图谱列表失败:', error)
    }
  }

  // Load graph by route
  const loadGraphByRoute = async () => {
    const graphId = route.params.id
    if (graphId) {
      currentGraphId.value = graphId
    }
  }

  // Switch graph
  const switchGraph = async (graphId) => {
    router.push(`/graph/${graphId}`)
  }

  // On graph select change
  const onGraphSelectChange = () => {
    if (currentGraphId.value) {
      router.push(`/graph/${currentGraphId.value}`)
    }
  }

  // Create graph
  const createGraph = async (name) => {
    try {
      const newGraph = await graphsAPI.create({ name })
      graphs.value.unshift(newGraph)
      router.push(`/graph/${newGraph.id}`)
      return newGraph
    } catch (error) {
      alert('创建图谱失败: ' + error.message)
      throw error
    }
  }

  // Save graph name
  const saveGraphName = async (graphId, name) => {
    try {
      await graphsAPI.update(graphId, { name })
      const graph = graphs.value.find(g => g.id === graphId)
      if (graph) {
        graph.name = name
      }
      return true
    } catch (error) {
      alert('保存图谱名称失败: ' + error.message)
      throw error
    }
  }

  // Duplicate graph
  const duplicateGraph = async (id) => {
    try {
      const newGraph = await graphsAPI.duplicate(id)
      graphs.value.unshift(newGraph)
      alert('图谱复制成功！')
      return newGraph
    } catch (error) {
      alert('复制图谱失败: ' + error.message)
      throw error
    }
  }

  // Delete graph
  const deleteGraph = async (id) => {
    if (!confirm('确定要删除这个图谱吗？此操作不可恢复。')) return
    try {
      await graphsAPI.delete(id)
      graphs.value = graphs.value.filter(g => g.id !== id)
      if (currentGraphId.value === id && graphs.value.length > 0) {
        router.push(`/graph/${graphs.value[0].id}`)
      }
    } catch (error) {
      alert('删除图谱失败: ' + error.message)
      throw error
    }
  }

  return {
    // State
    graphs,
    currentGraphId,
    graphMode,
    // Functions
    loadGraphs,
    loadGraphByRoute,
    switchGraph,
    onGraphSelectChange,
    createGraph,
    saveGraphName,
    duplicateGraph,
    deleteGraph,
    switchGraphMode
  }
}
