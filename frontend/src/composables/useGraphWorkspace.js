import { ref, reactive } from 'vue'
import { graphsAPI, shareAPI } from '../api'

/**
 * 图谱工作区：图谱 CRUD 与图谱分享。
 *
 * 共享状态通过参数传入：
 * - graphs / currentGraphId 来自 useGraphManager
 * - router 来自 Home.vue 的 useRouter()
 * - loadGraphNormal 来自 useGraphOperations（改名后重新加载当前图谱）
 */
export function useGraphWorkspace({ graphs, currentGraphId, router, loadGraphNormal }) {
  // Graph modal
  const showGraphModal = ref(false)
  const newGraphName = ref('')

  // Share modal
  const showShareModal = ref(false)
  const graphShares = ref([])
  const shareForm = reactive({
    allow_edit: false
  })
  const shareLoading = ref(false)

  // Graph CRUD operations
  const createGraph = async (name) => {
    newGraphName.value = name || ''
    if (!newGraphName.value.trim()) {
      alert('图谱名称不能为空')
      return
    }
    try {
      const newGraph = await graphsAPI.create({ name: newGraphName.value })
      graphs.value.unshift(newGraph)
      router.push(`/graph/${newGraph.id}`)
      newGraphName.value = ''
      showGraphModal.value = false
    } catch (error) {
      alert('创建图谱失败: ' + error.message)
    }
  }

  const saveGraphName = async (graphId, name) => {
    if (!graphId || !name.trim()) {
      alert('图谱名称不能为空')
      return
    }
    try {
      await graphsAPI.update(graphId, { name })
      const graph = graphs.value.find(g => g.id === graphId)
      if (graph) {
        graph.name = name
      }
      if (currentGraphId.value === graphId) {
        await loadGraphNormal()
      }
    } catch (error) {
      alert('保存图谱名称失败: ' + error.message)
    }
  }

  const duplicateGraph = async (id) => {
    try {
      const newGraph = await graphsAPI.duplicate(id)
      graphs.value.unshift(newGraph)
      alert('图谱复制成功！')
    } catch (error) {
      alert('复制图谱失败: ' + error.message)
    }
  }

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
    }
  }

  // Share functions
  const openShareModal = async () => {
    if (!currentGraphId.value) return
    try {
      graphShares.value = await shareAPI.getShares(currentGraphId.value)
    } catch (error) {
      graphShares.value = []
    }
    shareForm.allow_edit = false
    showShareModal.value = true
  }

  const loadGraphShares = async () => {
    if (!currentGraphId.value) return
    try {
      graphShares.value = await shareAPI.getShares(currentGraphId.value)
    } catch (error) {
      graphShares.value = []
    }
  }

  const createShare = async () => {
    if (!currentGraphId.value) return
    shareLoading.value = true
    try {
      await shareAPI.createShare(currentGraphId.value, { allow_edit: shareForm.allow_edit })
      await loadGraphShares()
      alert('分享链接已生成！')
    } catch (error) {
      alert('生成失败: ' + error.message)
    } finally {
      shareLoading.value = false
    }
  }

  const getShareUrl = (token) => {
    return `${window.location.origin}/share/${token}`
  }

  const copyShareLink = async (token) => {
    const url = getShareUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      alert('链接已复制到剪贴板！')
    } catch {
      alert('复制失败，请手动复制')
    }
  }

  const deleteShare = async (shareId) => {
    if (!confirm('确定要取消这个分享吗？')) return
    if (!currentGraphId.value) return
    try {
      await shareAPI.deleteShare(currentGraphId.value, shareId)
      await loadGraphShares()
      alert('分享已取消！')
    } catch (error) {
      alert('取消失败: ' + error.message)
    }
  }

  return {
    // State
    showGraphModal,
    showShareModal,
    graphShares,
    shareForm,
    shareLoading,
    // Functions
    createGraph,
    saveGraphName,
    duplicateGraph,
    deleteGraph,
    openShareModal,
    createShare,
    copyShareLink,
    deleteShare
  }
}
