import { ref, computed, nextTick } from 'vue'
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
      console.log(`[useSearch] Checking embedding status for graph ${currentGraphId.value}...`)
      const status = await embeddingAPI.getGraphStatus(currentGraphId.value)
      console.log(`[useSearch] Embedding status: available=${status.available}, isComplete=${status.isComplete}, computed=${status.computedNodes}/${status.totalNodes}`)
      embeddingStatus.value = {
        available: status.available || false,
        hasEmbeddings: status.isComplete || false
      }
    } catch (error) {
      console.error('[useSearch] Check embedding status failed:', error)
      embeddingStatus.value = { available: false, hasEmbeddings: false }
    }
  }

  // Compute embeddings for all nodes
  const computeEmbeddings = async () => {
    if (!currentGraphId?.value || computingEmbedding.value) {
      console.log('[useSearch] Compute embedding conditions not met or already computing')
      return
    }

    // Check if graph has nodes
    if (embeddingStatus.value?.totalNodes === 0) {
      console.log('[useSearch] Graph has no nodes, cannot compute vectors')
      embeddingComputeMessage.value = '图谱中没有节点，无法计算向量'
      embeddingComputeSuccess.value = false
      return
    }

    console.log(`[useSearch] Starting embedding computation, graph ${currentGraphId.value} has nodes`)
    computingEmbedding.value = true
    embeddingComputeMessage.value = ''

    try {
      console.log('[useSearch] Calling embedding API...')
      const result = await embeddingAPI.computeEmbeddings(currentGraphId.value)
      console.log('[useSearch] Embedding computation result:', result)

      if (result.success) {
        embeddingComputeMessage.value = `成功计算 ${result.computed}/${result.total} 个节点的向量`
        embeddingComputeSuccess.value = true
        console.log(`[useSearch] Vector computation success: ${result.computed}/${result.total}`)

        // Update embedding status
        embeddingStatus.value.hasEmbeddings = true

        // Clear error message
        searchError.value = ''
      } else {
        embeddingComputeMessage.value = result.message || '向量计算失败'
        embeddingComputeSuccess.value = false
        console.error('[useSearch] Vector computation failed:', result.message)
      }
    } catch (error) {
      console.error('[useSearch] Compute embedding failed:', error)
      embeddingComputeMessage.value = error.message || '向量计算失败，请确保 embedding 服务已启动'
      embeddingComputeSuccess.value = false
    } finally {
      computingEmbedding.value = false

      // Clear message after 5 seconds
      setTimeout(() => {
        embeddingComputeMessage.value = ''
      }, 5000)
    }
  }

  // Execute search
  const executeSearch = async () => {
    if (!searchKeyword.value.trim() || !currentGraphId?.value) {
      console.log('[useSearch] Search conditions not met')
      return
    }

    console.log(`[useSearch] Execute search: graphId=${currentGraphId.value}, keyword="${searchKeyword.value.trim()}", semantic=${useSemanticSearch.value}, hasEmbeddings=${embeddingStatus.value?.hasEmbeddings}`)
    searchLoading.value = true
    searchError.value = ''

    try {
      let results

      if (useSemanticSearch.value && embeddingStatus.value?.hasEmbeddings) {
        // Semantic search
        console.log('[useSearch] Execute semantic search...')
        try {
          const searchResponse = await embeddingAPI.semanticSearch(currentGraphId.value, searchKeyword.value.trim())
          console.log('[useSearch] Semantic search response:', searchResponse)
          results = searchResponse?.results || []
          console.log('[useSearch] Semantic search results:', results)

          // Add similarity score to results
          if (results && results.length > 0) {
            results = results.map(node => ({
              ...node,
              similarity: node.similarity || 0
            }))
          }
          console.log(`[useSearch] Semantic search complete, found ${results?.length || 0} results`)
        } catch (semanticError) {
          console.error('[useSearch] Semantic search failed, falling back to keyword search:', semanticError)
          searchError.value = '语义搜索失败，已自动切换到关键词搜索'
          results = await graphAPI.searchNodes(currentGraphId.value, searchKeyword.value.trim())
        }
      } else {
        // Keyword search
        console.log('[useSearch] Execute keyword search...')
        results = await graphAPI.searchNodes(currentGraphId.value, searchKeyword.value.trim())
        console.log(`[useSearch] Keyword search complete, found ${results?.length || 0} results`)
      }

      searchResults.value = results || []
      console.log(`[useSearch] Search results count: ${searchResults.value.length}`)
    } catch (error) {
      console.error('[useSearch] Search failed:', error)
      searchError.value = '搜索失败: ' + error.message
      searchResults.value = []
    } finally {
      searchLoading.value = false
    }
  }

  // Handle search input with debounce
  const handleSearchInput = () => {
    // Clear previous timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }

    // Set new timer, execute search after 500ms (semantic search needs more time)
    searchDebounceTimer = setTimeout(() => {
      if (searchKeyword.value.trim() && currentGraphId?.value) {
        executeSearch()
      } else {
        searchResults.value = []
      }
    }, 500)
  }

  // Handle search mode change
  const handleSearchModeChange = () => {
    searchResults.value = []
    searchError.value = ''

    // If switching to semantic search but no embeddings, show warning
    if (useSemanticSearch.value && !embeddingStatus.value?.hasEmbeddings) {
      searchError.value = '当前图谱尚未计算向量，请先在对话中让 AI 分析文档或手动触发向量计算'
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
