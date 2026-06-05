import { ref, reactive } from 'vue'
import { chatAPI, ontologyAPI } from '../api'

const MAX_MESSAGES = 100

export function useChatSession(currentGraphId, graphData, graphPanelRef, graphSettings) {
  // State
  const messages = ref([])
  const chatLoading = ref(false)

  // Limit messages
  const limitMessages = () => {
    if (messages.value.length > MAX_MESSAGES) {
      messages.value = messages.value.slice(-MAX_MESSAGES)
    }
  }

  // Send message
  const sendMessage = async (messageData, emit) => {
    let content = messageData
    let uploadedFiles = null

    if (messageData && typeof messageData === 'object' && messageData.files) {
      content = messageData.text || '请分析这些文档并提取知识点'
      uploadedFiles = messageData.files
    }

    messages.value.push({ role: 'user', content })
    limitMessages()
    chatLoading.value = true

    const assistantMsg = reactive({
      role: 'assistant',
      content: '',
      success: false,
      iterations: 0,
      executionTrace: []
    })
    messages.value.push(assistantMsg)

    let fileContent = ''
    if (uploadedFiles) {
      try {
        assistantMsg.content = '📄 正在解析上传的文档...'

        const formData = new FormData()
        uploadedFiles.forEach(file => {
          formData.append('files', file)
        })
        formData.append('simulation_requirement', '提取文档中的实体、概念和它们之间的关系，构建知识图谱')

        const analysisResult = await ontologyAPI.generateWithProgress(formData, (data) => {
          if (data.type === 'progress') {
            const progressPercent = Math.round(data.progress * 100)
            const progressBar = '█'.repeat(Math.floor(progressPercent / 10)) + '░'.repeat(10 - Math.floor(progressPercent / 10))
            assistantMsg.content = `🔄 分析文档中... [${progressBar}] ${progressPercent}%\n\n${data.message || '正在处理...'}`
          } else if (data.type === 'error') {
            throw new Error(data.message || '文档解析失败')
          }
        })

        if (analysisResult) {
          fileContent = `
## 文档分析结果

项目名称: ${analysisResult.project_name || '未命名'}

### 分析摘要
${analysisResult.analysis_summary || '无'}

### 识别的实体类型
${analysisResult.ontology?.entity_types?.map(t => `- ${t.name || t}`).join('\n') || '无'}

### 识别的关系类型
${analysisResult.ontology?.relationship_types?.map(t => `- ${t.name || t}`).join('\n') || '无'}

请基于以上文档分析结果，帮我构建知识图谱。
`
        }
      } catch (error) {
        assistantMsg.content = `📄 文档解析失败: ${error.message}，我将直接根据您的描述添加知识。`
        fileContent = ''
      }
    }

    try {
      const fullContent = fileContent ? `${fileContent}\n\n用户需求: ${content}` : content

      await chatAPI.streamMessage(
        [{ role: 'user', content: fullContent }],
        (event) => {
          switch (event.type) {
            case 'thought':
              assistantMsg.content = event.content
              break
            case 'action':
              assistantMsg.executionTrace.push({
                iteration: event.iteration,
                type: 'action',
                toolName: event.toolName,
                arguments: event.arguments,
                result: event.result
              })
              break
            case 'graph':
              graphData.nodes = event.nodes || []
              graphData.edges = event.edges || []
              break
            case 'done':
              assistantMsg.success = event.success
              assistantMsg.iterations = event.iterations
              assistantMsg.content = event.message
              assistantMsg.summary = event.summary
              chatLoading.value = false
              break
            case 'error':
              assistantMsg.content = '错误: ' + event.message
              chatLoading.value = false
              break
            case 'highlight':
              if (graphPanelRef.value && event.nodeId) {
                const tryHighlight = (retryCount = 0) => {
                  const node = graphData.nodes.find(n => n.id === event.nodeId)
                  if (node) {
                    graphPanelRef.value.highlightNode(node)
                  } else if (retryCount < 5) {
                    setTimeout(() => tryHighlight(retryCount + 1), 200)
                  }
                }
                tryHighlight()
              }
              break
            case 'settings':
              if (event.settings) {
                graphSettings.value = event.settings
                emit('settings-update', event.settings)
              }
              break
          }
        }
        , currentGraphId.value)
    } catch (error) {
      assistantMsg.content = '抱歉，发生错误: ' + error.message
      chatLoading.value = false
    }
  }

  // Clear chat
  const clearChat = () => {
    messages.value = []
  }

  // Cancel chat
  const cancelChat = async () => {
    if (!currentGraphId.value || !chatLoading.value) return
    try {
      await chatAPI.cancelChat(currentGraphId.value)
      chatLoading.value = false
      const lastAssistantMsg = messages.value.slice().reverse().find(m => m.role === 'assistant')
      if (lastAssistantMsg) {
        lastAssistantMsg.success = false
        lastAssistantMsg.content = '对话已被用户取消'
      }
    } catch (error) {
      console.error('取消对话失败:', error)
    }
  }

  return {
    // State
    messages,
    chatLoading,
    // Functions
    sendMessage,
    clearChat,
    cancelChat
  }
}
