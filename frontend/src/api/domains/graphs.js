// 图谱域 API：图谱管理 (graphsAPI) + 图谱数据 (graphAPI)
import { api, requestWithRetry } from '../core.js'

// 图谱管理
export const graphsAPI = {
  // 获取所有图谱（需要登录）
  getAll() {
    return api.get('/graphs')
  },
  // 公开获取图谱列表（无需登录，用于首页背景）
  getPublicList() {
    return api.get('/graphs/public')
  },
  // 公开获取图谱数据（无需登录，用于首页背景）
  getPublicGraph(id) {
    return api.get(`/graphs/public/${id}/graph`)
  },
  // 获取当前活跃图谱
  getActive() {
    return api.get('/graphs/active')
  },
  // 获取图谱详情（包含节点和边）
  getById(id) {
    return api.get(`/graphs/${id}`)
  },
  // 创建新图谱
  create(data) {
    return api.post('/graphs', data)
  },
  // 更新图谱
  update(id, data) {
    return api.put(`/graphs/${id}`, data)
  },
  // 删除图谱
  delete(id) {
    return api.delete(`/graphs/${id}`)
  },
  // 切换活跃图谱
  activate(id) {
    return api.post(`/graphs/${id}/activate`)
  },
  // 复制图谱
  duplicate(id, name) {
    return api.post(`/graphs/${id}/duplicate`, { name })
  },
  // 获取图谱配置
  getSettings(id) {
    return api.get(`/graphs/${id}/settings`)
  },
  // 更新图谱配置
  updateSettings(id, settings) {
    return api.put(`/graphs/${id}/settings`, settings)
  }
}

// 图谱数据 - 每个方法都需要传入 graphId
export const graphAPI = {
  // 获取指定图谱的完整数据
  getGraph(graphId) {
    return requestWithRetry(() => api.get(`/graphs/${graphId}/graph`))
  },
  
  /**
   * 流式获取图谱数据（SSE）- 分批返回节点和边
   * @param {string} graphId - 图谱ID
   * @param {Function} onBatch - 每批数据回调 (data) => void
   * @param {Function} onProgress - 进度回调 (loaded, total, type) => void
   * @returns {Promise} - 返回完整数据 { nodes, edges }
   */
  getGraphStream(graphId, onBatch, onProgress) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const batchLogs = []

      console.group(`🌐 流式加载图谱 [${graphId}]`)
      console.log('📡 正在建立 SSE 连接...')

      fetch(`/api/graphs/${graphId}/graph/stream`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`)
          }
          
          console.log('✅ SSE 连接已建立')
          
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          
          // 累积buffers
          let buffer = ''
          const nodes = []
          const edges = []
          
          reader.read().then(function processText({ done, value }) {
            if (done) {
              // 处理剩余的buffer
              if (buffer.trim()) {
                try {
                  const data = JSON.parse(buffer.trim())
                  handleEvent(data)
                } catch (e) {
                  console.error('❌ 解析最终数据失败:', e)
                }
              }
              
              const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
              console.log(`\n🎉 流式加载完成！`)
              console.log(`   📊 总计: ${nodes.length} 个节点, ${edges.length} 条边`)
              console.log(`   ⏱️ 耗时: ${totalTime}s`)
              console.log(`   📦 批次数: ${batchLogs.length} 批`)
              console.groupEnd()
              
              resolve({ nodes, edges })
              return
            }
            
            const text = decoder.decode(value, { stream: true })
            buffer += text
            
            // 处理完整的行
            const lines = buffer.split('\n')
            buffer = lines.pop() // 保留最后一个不完整的行
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  handleEvent(data)
                } catch (e) {
                  console.error('❌ 解析 SSE 数据失败:', e)
                }
              }
            }
            
            reader.read().then(processText)
          })
          
          function handleEvent(data) {
            switch (data.type) {
              case 'meta':
                // 元数据
                console.log('\n📋 图谱元数据:')
                console.table({
                  '总节点数': data.totalNodes,
                  '总边数': data.totalEdges,
                  '节点批次大小': data.nodeBatchSize || 100,
                  '边批次大小': data.edgeBatchSize || 200
                })
                if (onProgress) {
                  onProgress(0, data.totalNodes, 'nodes')
                  onProgress(0, data.totalEdges, 'edges')
                }
                break
                
              case 'nodes_batch':
                // 节点批次
                nodes.push(...data.batch)
                
                // 计算进度
                const nodePercent = ((data.loaded / data.total) * 100).toFixed(1)
                const nodeProgress = data.loaded === data.total 
                  ? '████████████' 
                  : '█'.repeat(Math.floor(data.loaded / data.total * 12)).padEnd(12, '░')
                
                console.log(
                  `📦 [节点批次 ${data.batchIndex || batchLogs.filter(l => l.type === 'nodes').length + 1}] ` +
                  `${nodeProgress} ${nodePercent}% (${data.loaded}/${data.total}) ` +
                  `+${data.batch.length} 个节点`
                )
                
                batchLogs.push({
                  type: 'nodes',
                  time: Date.now() - startTime,
                  batchSize: data.batch.length,
                  loaded: data.loaded,
                  total: data.total
                })
                
                if (onBatch) {
                  onBatch({ type: 'nodes', batch: data.batch, ...data })
                }
                if (onProgress) {
                  onProgress(data.loaded, data.total, 'nodes')
                }
                break
                
              case 'edges_batch':
                // 边批次
                edges.push(...data.batch)
                
                // 计算进度
                const edgePercent = ((data.loaded / data.total) * 100).toFixed(1)
                const edgeProgress = data.loaded === data.total 
                  ? '████████████' 
                  : '█'.repeat(Math.floor(data.loaded / data.total * 12)).padEnd(12, '░')
                
                console.log(
                  `🔗 [边批次 ${data.batchIndex || batchLogs.filter(l => l.type === 'edges').length + 1}] ` +
                  `${edgeProgress} ${edgePercent}% (${data.loaded}/${data.total}) ` +
                  `+${data.batch.length} 条边`
                )
                
                batchLogs.push({
                  type: 'edges',
                  time: Date.now() - startTime,
                  batchSize: data.batch.length,
                  loaded: data.loaded,
                  total: data.total
                })
                
                if (onBatch) {
                  onBatch({ type: 'edges', batch: data.batch, ...data })
                }
                if (onProgress) {
                  onProgress(data.loaded, data.total, 'edges')
                }
                break
                
              case 'complete':
                console.log('\n✅ 服务器发送完成信号')
                break
                
              case 'error':
                console.error('❌ 流式加载错误:', data.message || '获取图谱数据失败')
                reject(new Error(data.message || '获取图谱数据失败'))
                break
            }
          }
        })
        .catch(error => {
          console.error('❌ SSE 连接失败:', error)
          reject(error)
        })
    })
  },
  // 获取指定图谱的节点（支持分页）
  // @param {string} graphId - 图谱ID
  // @param {Object} params - 可选参数 { page, limit, type, sort, order }
  // @returns {Promise} - 不传分页参数时返回数组，传参时返回 { nodes, pagination }
  getNodes(graphId, params = {}) {
    const queryParams = new URLSearchParams();
    if (params.page !== undefined) queryParams.append('page', params.page);
    if (params.limit !== undefined) queryParams.append('limit', params.limit);
    if (params.type) queryParams.append('type', params.type);
    if (params.sort) queryParams.append('sort', params.sort);
    if (params.order) queryParams.append('order', params.order);
    
    const queryString = queryParams.toString();
    const url = queryString 
      ? `/graphs/${graphId}/nodes?${queryString}` 
      : `/graphs/${graphId}/nodes`;
    return api.get(url);
  },
  // 获取单个节点
  getNode(graphId, id) {
    return api.get(`/graphs/${graphId}/nodes/${id}`)
  },
  // 创建节点
  createNode(graphId, data) {
    return api.post(`/graphs/${graphId}/nodes`, data)
  },
  // 更新节点
  updateNode(graphId, id, data) {
    return api.put(`/graphs/${graphId}/nodes/${id}`, data)
  },
  // 删除节点
  deleteNode(graphId, id) {
    return api.delete(`/graphs/${graphId}/nodes/${id}`)
  },
  // 搜索节点
  searchNodes(graphId, keyword) {
    return api.get(`/graphs/${graphId}/nodes/search/${keyword}`)
  },
  // Agent LIKE 关键词搜索节点（支持分页和类型过滤）
  /**
   * 关键词搜索节点
   * @param {string} graphId - 图谱ID
   * @param {Object} params - 搜索参数
   * @param {string} params.keyword - 搜索关键词
   * @param {string} params.type - 按节点类型过滤
   * @param {number} params.page - 页码，默认 1
   * @param {number} params.limit - 每页数量，默认 20，最大 100
   * @returns {Promise} - 返回搜索结果 { keyword, total, page, limit, totalPages, nodes }
   */
  agentSearchNodes(graphId, { keyword, type, page = 1, limit = 20 }) {
    const params = new URLSearchParams();
    if (keyword) params.append('keyword', keyword);
    if (type) params.append('type', type);
    params.append('page', page);
    params.append('limit', Math.min(limit, 100));
    return api.get(`/agent/graphs/${graphId}/nodes/search?${params}`);
  },
  // 批量更新节点位置
  updateNodePositions(graphId, positions) {
    return api.put(`/graphs/${graphId}/nodes/positions`, { positions })
  },
  // 获取指定图谱的边
  getEdges(graphId) {
    return api.get(`/graphs/${graphId}/edges`)
  },
  // 创建边
  createEdge(graphId, data) {
    return api.post(`/graphs/${graphId}/edges`, data)
  },
  // 更新边
  updateEdge(graphId, id, data) {
    return api.put(`/graphs/${graphId}/edges/${id}`, data)
  },
  // 删除边
  deleteEdge(graphId, id) {
    return api.delete(`/graphs/${graphId}/edges/${id}`)
  }
}
