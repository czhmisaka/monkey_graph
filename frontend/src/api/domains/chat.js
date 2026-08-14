// 聊天域 API (chatAPI)
import { api, RETRY_DELAY } from '../core.js'

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
        fetch('/api/chat/stream', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
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
