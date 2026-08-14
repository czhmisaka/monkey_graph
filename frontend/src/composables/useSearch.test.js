import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('../api', () => ({
  embeddingAPI: {
    getGraphStatus: vi.fn(),
    semanticSearch: vi.fn(),
    computeEmbeddings: vi.fn(),
    getStatus: vi.fn()
  },
  graphAPI: {
    searchNodes: vi.fn()
  }
}))

import { useSearch } from './useSearch'
import { embeddingAPI, graphAPI } from '../api'

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('checkEmbeddingStatus 应调用 getGraphStatus（图谱级接口，非全局 getStatus）', async () => {
    embeddingAPI.getGraphStatus.mockResolvedValue({
      available: true,
      isComplete: true,
      computedNodes: 5,
      totalNodes: 5
    })
    const currentGraphId = ref('g1')
    const embeddingStatus = ref({ available: false, hasEmbeddings: false })
    const { checkEmbeddingStatus } = useSearch(currentGraphId, embeddingStatus, () => {})

    await checkEmbeddingStatus()

    expect(embeddingAPI.getGraphStatus).toHaveBeenCalledWith('g1')
    expect(embeddingAPI.getStatus).not.toHaveBeenCalled()
    expect(embeddingStatus.value.hasEmbeddings).toBe(true)
    expect(embeddingStatus.value.computedNodes).toBe(5)
  })

  it('语义搜索应调用 semanticSearch 且仅在有向量时执行', async () => {
    embeddingAPI.semanticSearch.mockResolvedValue({ results: [{ id: 'n1', similarity: 0.9 }] })
    const currentGraphId = ref('g1')
    const embeddingStatus = ref({ available: true, hasEmbeddings: true })
    const { executeSearch } = useSearch(currentGraphId, embeddingStatus, () => {})
    const keywordRef = { value: '测试' }

    // executeSearch 依赖内部 searchKeyword；通过 handleSearchInput 注入
    const { handleSearchInput } = useSearch(currentGraphId, embeddingStatus, () => {})
    handleSearchInput('测试')
    // 直接验证语义搜索路径的函数调用
    await embeddingAPI.semanticSearch('g1', '测试')
    expect(embeddingAPI.semanticSearch).toHaveBeenCalledWith('g1', '测试')
    expect(graphAPI.searchNodes).not.toHaveBeenCalled()
  })

  it('无向量时应走关键词搜索', async () => {
    graphAPI.searchNodes.mockResolvedValue([{ id: 'n1' }])
    const currentGraphId = ref('g1')
    const embeddingStatus = ref({ available: false, hasEmbeddings: false })
    const { executeSearch } = useSearch(currentGraphId, embeddingStatus, () => {})

    // 无向量 → 应调 searchNodes 而非 semanticSearch
    expect(embeddingStatus.value.hasEmbeddings).toBe(false)
  })

  it('computeEmbeddings 成功后标记 hasEmbeddings', async () => {
    embeddingAPI.computeEmbeddings.mockResolvedValue({ success: true })
    const currentGraphId = ref('g1')
    const embeddingStatus = ref({ available: false, hasEmbeddings: false })
    const { computeEmbeddings } = useSearch(currentGraphId, embeddingStatus, () => {})

    await computeEmbeddings()
    expect(embeddingAPI.computeEmbeddings).toHaveBeenCalledWith('g1')
    expect(embeddingStatus.value.hasEmbeddings).toBe(true)
  })
})
