// 本体与构建域 API：本体生成 (ontologyAPI) + 图谱构建 (graphBuildAPI)
import { api } from '../core.js'

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
      fetch('/api/graph/ontology/generate', {
        method: 'POST',
        credentials: 'include',
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
