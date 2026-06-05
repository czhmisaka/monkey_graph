import axios from 'axios'

// 配置常量
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

// Token 存储键名
const TOKEN_KEY = 'monkeygraph_token'
const USER_KEY = 'monkeygraph_user'

// 获取 Token
export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

// 设置 Token
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

// 清除 Token
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// 获取用户信息
export function getUser() {
  const userStr = localStorage.getItem(USER_KEY)
  return userStr ? JSON.parse(userStr) : null
}

// 设置用户信息
export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

const api = axios.create({
  baseURL: '/api',
  timeout: 60000
})

// 请求拦截器 - 添加 Token 到请求头
api.interceptors.request.use(
  config => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  response => response.data,
  error => {
    // 统一错误处理
    let errorMessage = '网络错误，请稍后重试'
    
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status
      const data = error.response.data
      
      switch (status) {
        case 400:
          errorMessage = data?.error || '请求参数错误'
          break
        case 401:
          errorMessage = '未授权，请重新登录'
          break
        case 403:
          errorMessage = '没有权限执行此操作'
          break
        case 404:
          errorMessage = data?.error || '请求的资源不存在'
          break
        case 500:
          errorMessage = '服务器内部错误'
          break
        case 502:
          errorMessage = '网关错误'
          break
        case 503:
          errorMessage = '服务暂时不可用'
          break
        default:
          errorMessage = data?.error || `请求失败 (${status})`
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      errorMessage = '网络连接失败，请检查网络'
    } else {
      // 请求配置出错
      errorMessage = error.message || '请求配置错误'
    }
    
    console.error('API Error:', errorMessage, error)
    
    // 返回带有详细信息的错误对象
    return Promise.reject(new Error(errorMessage))
  }
)

// 带重试机制的请求函数
async function requestWithRetry(requestFn, retries = MAX_RETRIES, delay = RETRY_DELAY) {
  let lastError
  
  for (let i = 0; i < retries; i++) {
    try {
      return await requestFn()
    } catch (error) {
      lastError = error
      
      // 如果是客户端错误（4xx），不重试
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error
      }
      
      // 如果还有重试次数，等待后重试
      if (i < retries - 1) {
        console.log(`请求失败，${delay}ms 后重试 (${i + 1}/${retries})...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        // 指数退避
        delay *= 2
      }
    }
  }
  
  throw lastError
}

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
      const token = getToken()
      const startTime = Date.now()
      const batchLogs = []
      
      console.group(`🌐 流式加载图谱 [${graphId}]`)
      console.log('📡 正在建立 SSE 连接...')
      
      fetch(`/api/graphs/${graphId}/graph/stream`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
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

// 历史记录 - 每个方法都需要传入 graphId
export const historyAPI = {
  getHistory(graphId, limit = 50) {
    return api.get(`/graphs/${graphId}/history?limit=${limit}`)
  },
  undo(graphId) {
    return api.post(`/graphs/${graphId}/history/undo`)
  }
}

// 聊天接口 - 需要传入 graphId
export const chatAPI = {
  sendMessage(messages, graphId) {
    return api.post('/chat', { messages, graphId })
  },
  // 取消聊天
  cancelChat(graphId) {
    return api.post('/chat/cancel', { graphId })
  },
  // 流式聊天（使用 SSE）- 带重试机制
  streamMessage(messages, onMessage, graphId, maxRetries = 2) {
    return new Promise((resolve, reject) => {
      let retryCount = 0
      
      const attemptRequest = () => {
        const token = getToken()
        fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ messages, graphId })
        })
          .then(response => {
            if (!response.ok) {
              throw new Error(`请求失败: ${response.status}`)
            }
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            
            reader.read().then(function processText({ done, value }) {
              if (done) {
                resolve()
                return
              }
              
              const text = decoder.decode(value)
              const lines = text.split('\n')
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))
                    
                    // 如果收到错误事件，抛出错误
                    if (data.type === 'error') {
                      reject(new Error(data.message || '聊天请求失败'))
                      return
                    }
                    
                    onMessage(data)
                  } catch (e) {
                    console.error('解析 SSE 数据失败:', e)
                  }
                }
              }
              
              reader.read().then(processText)
            })
          })
          .catch(error => {
            // 如果还有重试次数，等待后重试
            if (retryCount < maxRetries) {
              retryCount++
              console.log(`SSE 连接断开，${RETRY_DELAY}ms 后重试 (${retryCount}/${maxRetries})...`)
              setTimeout(attemptRequest, RETRY_DELAY)
            } else {
              reject(error)
            }
          })
      }
      
      attemptRequest()
    })
  },
  getTools() {
    return api.get('/tools')
  }
}

// LLM 配置
export const configAPI = {
  configureLLM(config) {
    return api.post('/config/llm', config)
  },
  getLLMStatus() {
    return api.get('/config/llm/status')
  }
}

// MCP 状态
export const mcpAPI = {
  getStatus() {
    return api.get('/mcp/status')
  }
}

// 用户认证
export const authAPI = {
  // 注册
  register(username, password) {
    return api.post('/auth/register', { username, password })
  },
  // 登录
  login(username, password) {
    return api.post('/auth/login', { username, password })
  },
  // 获取当前用户信息
  getCurrentUser() {
    return api.get('/auth/me')
  },
  // 更新用户资料
  updateProfile(data) {
    return api.put('/auth/profile', data)
  }
}

// 用户 LLM 配置
export const userLLMConfigAPI = {
  // 获取所有配置
  getAll() {
    return api.get('/user/llm-configs')
  },
  // 创建配置
  create(data) {
    return api.post('/user/llm-configs', data)
  },
  // 更新配置
  update(id, data) {
    return api.put(`/user/llm-configs/${id}`, data)
  },
  // 删除配置
  delete(id) {
    return api.delete(`/user/llm-configs/${id}`)
  }
}

// 用户关联的 Agent
export const userAgentAPI = {
  // 获取用户关联的所有 Agent
  getAll() {
    return api.get('/user/agents')
  },
  // 关联 Agent 到用户
  create(data) {
    return api.post('/user/agents', data)
  },
  // 取消关联 Agent
  delete(id) {
    return api.delete(`/user/agents/${id}`)
  },
  // 更新关联角色
  updateRole(id, role) {
    return api.put(`/user/agents/${id}/role`, { role })
  }
}

// 用户自己创建的 Agent（API Key 管理）
export const myAgentAPI = {
  // 获取用户创建的所有 Agent（含 API Key）
  getAll() {
    return api.get('/user/agents/my')
  },
  // 创建新的 Agent
  create(data) {
    return api.post('/user/agents/my', data)
  },
  // 更新 Agent
  update(id, data) {
    return api.put(`/user/agents/my/${id}`, data)
  },
  // 删除 Agent
  delete(id) {
    return api.delete(`/user/agents/my/${id}`)
  },
  // 轮换 API Key
  rotateKey(id) {
    return api.post(`/user/agents/my/${id}/rotate-key`)
  }
}

// Agent 管理（获取可关联的 Agent 列表）
export const agentAPI = {
  // 获取所有可用的 Agent
  getAll() {
    return api.get('/agents')
  }
}

// Agent 日志 API
export const agentLogsAPI = {
  // 获取当前用户下所有 Agent 的接口调用日志
  // agentId: 可选，指定获取某个 Agent 的日志
  getLogs(limit = 100, agentId = null) {
    let url = `/agent/user/agents/logs?limit=${limit}`
    if (agentId) {
      url += `&agentId=${agentId}`
    }
    return api.get(url)
  }
}

// 图谱分享
export const shareAPI = {
  // 生成分享链接
  createShare(graphId, data) {
    return api.post(`/graphs/${graphId}/share`, data)
  },
  // 获取分享列表
  getShares(graphId) {
    return api.get(`/graphs/${graphId}/shares`)
  },
  // 取消分享
  deleteShare(graphId, shareId) {
    return api.delete(`/graphs/${graphId}/shares/${shareId}`)
  },
  // 访问分享的图谱
  getShare(token) {
    return api.get(`/share/${token}`)
  },
  // 验证分享是否允许编辑
  checkEdit(token) {
    return api.get(`/share/${token}/check-edit`)
  },
  // 分享编辑 - 创建节点
  createNode(token, data) {
    return api.post(`/share/${token}/nodes`, data)
  },
  // 分享编辑 - 更新节点
  updateNode(token, nodeId, data) {
    return api.put(`/share/${token}/nodes/${nodeId}`, data)
  },
  // 分享编辑 - 删除节点
  deleteNode(token, nodeId) {
    return api.delete(`/share/${token}/nodes/${nodeId}`)
  },
  // 分享编辑 - 创建边
  createEdge(token, data) {
    return api.post(`/share/${token}/edges`, data)
  },
  // 分享编辑 - 更新边
  updateEdge(token, edgeId, data) {
    return api.put(`/share/${token}/edges/${edgeId}`, data)
  },
  // 分享编辑 - 删除边
  deleteEdge(token, edgeId) {
    return api.delete(`/share/${token}/edges/${edgeId}`)
  }
}

// 本体生成 API - 使用 FormData 上传文件
export const ontologyAPI = {
  /**
   * 生成本体定义
   * @param {FormData} formData - 包含 files, simulation_requirement, project_name, additional_context
   */
  generate(formData) {
    return api.post('/graph/ontology/generate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  
  /**
   * 生成本体定义 (带 SSE 进度)
   * @param {FormData} formData - 包含 files, simulation_requirement, project_name, additional_context
   * @param {Function} onProgress - 进度回调函数 (data) => void
   * @returns {Promise} - 返回最终结果
   */
  generateWithProgress(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const token = getToken()
      
      fetch('/api/graph/ontology/generate', {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`)
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          
          reader.read().then(function processText({ done, value }) {
            if (done) {
              resolve()
              return
            }
            
            const text = decoder.decode(value)
            const lines = text.split('\n')
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  
                  // 调用进度回调
                  if (onProgress && data.type) {
                    onProgress(data)
                  }
                  
                  // 如果是错误或完成事件，结束处理
                  if (data.type === 'error') {
                    reject(new Error(data.message || '本体生成失败'))
                    return
                  }
                  
                  if (data.type === 'complete') {
                    resolve(data.data)
                    return
                  }
                } catch (e) {
                  console.error('解析 SSE 数据失败:', e)
                }
              }
            }
            
            reader.read().then(processText)
          })
        })
        .catch(error => {
          reject(error)
        })
    })
  }
}

// 图谱构建 API
export const graphBuildAPI = {
  /**
   * 构建知识图谱
   * @param {Object} data - 构建参数
   */
  build(data) {
    return api.post('/graph/build', data)
  },
  
  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   */
  getTask(taskId) {
    return api.get(`/graph/task/${taskId}`)
  }
}

// 日志 API
export const logsAPI = {
  /**
   * 获取日志文件列表
   */
  getFiles() {
    return api.get('/logs/files')
  },
  
  /**
   * 读取日志文件
   * @param {string} file - 文件名
   * @param {number} lines - 行数
   */
  readFile(file, lines = 100) {
    return api.get(`/logs/read?file=${encodeURIComponent(file)}&lines=${lines}`)
  },
  
  /**
   * 获取最近的日志
   * @param {number} count - 日志数量
   */
  getRecent(count = 50) {
    return api.get(`/logs/recent?count=${count}`)
  },
  
  /**
   * 清理日志文件
   */
  clearLogs() {
    return api.post('/logs/clear')
  }
}

// Embedding API
export const embeddingAPI = {
  /**
   * 检查 embedding 服务状态（全局）
   */
  getStatus() {
    return api.get('/embedding/status')
  },
  
  /**
   * 检查图谱的 embedding 状态
   * @param {string} graphId - 图谱ID
   */
  getGraphStatus(graphId) {
    return api.get(`/graphs/${graphId}/embedding/status`)
  },
  
  /**
   * 计算图谱中所有节点的 embedding
   * @param {string} graphId - 图谱ID
   */
  computeEmbeddings(graphId) {
    return api.post(`/graphs/${graphId}/embedding/compute`)
  },
  
  /**
   * 语义搜索节点
   * @param {string} graphId - 图谱ID
   * @param {string} query - 搜索关键词
   * @param {number} limit - 返回数量限制
   */
  semanticSearch(graphId, query, limit = 10) {
    return api.get(`/graphs/${graphId}/embedding/search?q=${encodeURIComponent(query)}&limit=${limit}`)
  },
  
  /**
   * 获取节点的相似节点
   * @param {string} graphId - 图谱ID
   * @param {string} nodeId - 节点ID
   * @param {number} limit - 返回数量限制
   */
  getSimilarNodes(graphId, nodeId, limit = 10) {
    return api.get(`/graphs/${graphId}/embedding/similar/${nodeId}?limit=${limit}`)
  },
  
  /**
   * 对图谱中的节点进行聚类分析
   * @param {string} graphId - 图谱ID
   * @param {number} k - 聚类数量
   */
  clusterNodes(graphId, k = 3) {
    return api.post(`/graphs/${graphId}/embedding/cluster`, { k })
  },
  
  /**
   * 删除图谱的所有 embedding
   * @param {string} graphId - 图谱ID
   */
  deleteEmbeddings(graphId) {
    return api.delete(`/graphs/${graphId}/embedding`)
  },
  
  /**
   * 获取聚类分析进度
   * @param {string} graphId - 图谱ID
   */
  getClusterProgress(graphId) {
    return api.get(`/graphs/${graphId}/embedding/cluster/progress`)
  }
}


// 统计 API - 首页展示数据
export const statsAPI = {
  // 获取全局统计数据
  getGlobalStats() {
    return api.get('/stats/global')
  }
}

// 使用量 API - 首页用户使用量统计
export const usageAPI = {
  // 获取当前用户的使用量
  getCurrent() {
    return api.get('/usage/current')
  },
  // 获取使用统计（计算统计数据）
  getStats() {
    return api.get('/usage/current').then(res => {
      // 根据使用量数据计算统计数据
      const apiCalls = res?.usage?.api_calls || 0
      
      // 计算月均和趋势（这里使用简单的模拟数据，实际可从后端获取）
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      
      // 模拟月度数据（实际项目中应该从后端获取）
      const monthlyData = [
        { month: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`, calls: apiCalls },
        { month: `${currentYear}-${String(currentMonth).padStart(2, '0')}`, calls: Math.floor(apiCalls * 0.8) },
        { month: `${currentYear}-${String(currentMonth - 1 >= 0 ? currentMonth - 1 : 11).padStart(2, '0')}`, calls: Math.floor(apiCalls * 0.6) },
      ]
      
      const totalApiCalls = monthlyData.reduce((sum, m) => sum + m.calls, 0)
      const averageApiCalls = Math.round(totalApiCalls / monthlyData.length)
      const maxApiCalls = Math.max(...monthlyData.map(m => m.calls))
      
      // 判断趋势：比较最近两个月
      const trend = monthlyData[0].calls > monthlyData[1].calls 
        ? 'increasing' 
        : monthlyData[0].calls < monthlyData[1].calls 
          ? 'decreasing' 
          : 'stable'
      
      return {
        stats: {
          total_api_calls: totalApiCalls,
          average_api_calls: averageApiCalls,
          max_api_calls: maxApiCalls,
          trend: trend
        }
      }
    })
  }
}

// 租户 API - SaaS 租户管理
export const tenantAPI = {
  // 获取当前租户信息
  getMe() {
    return api.get('/tenant/me')
  },
  // 获取订阅信息
  getSubscription() {
    return api.get('/tenant/subscription')
  },
  // 更改套餐
  changePlan(planId) {
    return api.post('/tenant/change-plan', { plan_id: planId })
  },
  // 取消订阅
  cancelSubscription() {
    return api.post('/tenant/cancel-subscription')
  }
}

// 套餐 API - SaaS 套餐管理
export const plansAPI = {
  // 获取所有可用套餐
  getAll() {
    return api.get('/plans')
  }
}

// 管理员 API - SaaS 后台管理
export const adminAPI = {
  // 获取所有租户
  getTenants() {
    return api.get('/admin/tenants')
  },
  // 获取单个租户
  getTenant(id) {
    return api.get(`/admin/tenants/${id}`)
  },
  // 暂停租户
  suspendTenant(id) {
    return api.post(`/admin/tenants/${id}/suspend`)
  },
  // 激活租户
  activateTenant(id) {
    return api.post(`/admin/tenants/${id}/activate`)
  },
  // 删除租户
  deleteTenant(id) {
    return api.delete(`/admin/tenants/${id}`)
  }
}

// 图谱 Agent 授权 API
export const graphAgentPermissionAPI = {
  // 获取图谱已授权的 Agent 列表
  getGraphAgents(graphId) {
    return api.get(`/graphs/${graphId}/agents`)
  },
  // 授权 Agent 访问图谱
  authorizeAgent(graphId, agentId, permission = 'read') {
    return api.post(`/graphs/${graphId}/agents`, { agent_id: agentId, permission })
  },
  // 更新 Agent 对图谱的权限
  updatePermission(graphId, agentId, permission) {
    return api.put(`/graphs/${graphId}/agents/${agentId}`, { permission })
  },
  // 撤销 Agent 对图谱的授权
  revokePermission(graphId, agentId) {
    return api.delete(`/graphs/${graphId}/agents/${agentId}`)
  }
}

export default api
