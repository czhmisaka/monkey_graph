import { ref, computed, nextTick, onUnmounted } from 'vue'
import { embeddingAPI, graphAPI } from '../api'

export function useSearch(currentGraphId, embeddingStatus, getNodeColor) {
  // State
  const showSearchModal = ref(false)
  const searchKeyword = ref('')
  const searchResults = ref([])
  const searchLoading = ref(false)
  const searchInputRef = ref(null)
  const useSemanticSearch = ref(true) // Default semantic search
  const searchError = ref('')

  // Embedding compute state
  const computingEmbedding = ref(false)
  const embeddingComputeMessage = ref('')
  const embeddingComputeSuccess = ref(false)

  // Search debounce timer
  let searchDebounceTimer = null
  
  // AbortController for cancelling in-flight requests
  let searchAbortController = null

  // Lifecycle: 组件卸载时自动清理定时器和未完成请求
  onUnmounted(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
    if (searchAbortController) {
      searchAbortController.abort()
      searchAbortController = null
    }
  })

  // Computed
  const searchMode = computed(() => useSemanticSearch.value ? 'semantic' : 'keyword')
  const isSearching = computed(() => searchLoading.value)

  // Open search modal
  const openSearchModal = async () => {
    showSearchModal.value = true
    searchKeyword.value = ''
    searchResults.value = []
    searchError.value = ''

    // Check embedding status
    await checkEmbeddingStatus()

    nextTick(() => {
      if (searchInputRef?.value) {
        searchInputRef.value.focus()
      }
    })
  }

  // Check embedding status
  const checkEmbeddingStatus = async () => {
    if (!currentGraphId?.value) {
      console.log('[useSearch] Graph ID is empty, cannot check embedding status')
      embeddingStatus.value = { available: false, hasEmbeddings: false }
      return
    }

    try {
      const status = await embeddingAPI.getGraphStatus(currentGraphId.value)
      embeddingStatus.value = {
        available: status.available || false,
        hasEmbeddings: status.isComplete || false,
        computedNodes: status.computedNodes || 0,
        totalNodes: status.totalNodes || 0
      }
    } catch (error) {
      console.error('[useSearch] Check embedding status failed:', error)
      embeddingStatus.value = { available: false, hasEmbeddings: false }
    }
  }

  // Compute embeddings
  const computeEmbeddings = async () => {
    if (!currentGraphId?.value) return

    computingEmbedding.value = true
    embeddingComputeMessage.value = '正在计算向量嵌入...'
    embeddingComputeSuccess.value = false

    try {
      const result = await embeddingAPI.computeEmbeddings(currentGraphId.value)
      if (result.success) {
        embeddingComputeSuccess.value = true
        embeddingComputeMessage.value = '向量计算完成！'
        embeddingStatus.value = { available: true, hasEmbeddings: true }
      } else {
        embeddingComputeMessage.value = result.error || '向量计算失败'
      }
    } catch (error) {
      console.error('[useSearch] Compute embeddings failed:', error)
      embeddingComputeMessage.value = error.message || '向量计算失败'
    } finally {
      computingEmbedding.value = false
    }
  }

  // Execute search
  const executeSearch = async () => {
    if (!searchKeyword.value.trim() || !currentGraphId?.value || searchLoading.value) return

    // Cancel previous request if any
    if (searchAbortController) {
      searchAbortController.abort()
    }
    searchAbortController = new AbortController()

    searchLoading.value = true
    searchError.value = ''

    try {
      let results
      if (useSemanticSearch.value && embeddingStatus.value?.hasEmbeddings) {
        const searchResponse = await embeddingAPI.semanticSearch(currentGraphId.value, searchKeyword.value.trim())
        results = searchResponse?.results || []
      } else {
        results = await graphAPI.searchNodes(currentGraphId.value, searchKeyword.value.trim())
      }

      searchResults.value = results || []
      
      if (results && results.length > 0) {
        // 搜索成功消息 5 秒后自动清除
        setTimeout(() => {
          // No-op, just for message display timing
        }, 5000)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[useSearch] Search aborted')
        return
      }
      console.error('[useSearch] Search failed:', error)
      searchError.value = error.message || '搜索失败'
      searchResults.value = []
    } finally {
      searchLoading.value = false
      searchAbortController = null
    }
  }

  // Handle search input (with debounce)
  const handleSearchInput = (value) => {
    searchKeyword.value = value
    
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }

    if (value.trim().length > 0) {
      searchDebounceTimer = setTimeout(() => {
        executeSearch()
      }, 300)
    } else {
      searchResults.value = []
    }
  }

  // Handle search mode change
  const handleSearchModeChange = (isSemantic) => {
    useSemanticSearch.value = isSemantic
    if (searchKeyword.value.trim()) {
      executeSearch()
    }
  }

  // View searched node
  const viewSearchedNode = (node) => {
    showSearchModal.value = false
    // Return node for caller to handle navigation
    return node
  }

  return {
    // State
    showSearchModal,
    searchKeyword,
    searchResults,
    searchLoading,
    searchInputRef,
    useSemanticSearch,
    searchError,
    computingEmbedding,
    embeddingComputeMessage,
    embeddingComputeSuccess,
    // Computed
    searchMode,
    isSearching,
    // Functions
    openSearchModal,
    checkEmbeddingStatus,
    computeEmbeddings,
    executeSearch,
    handleSearchInput,
    handleSearchModeChange,
    viewSearchedNode
  }
}