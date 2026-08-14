import { ref, reactive } from 'vue'
import { configAPI, mcpAPI } from '../api'

/**
 * LLM / MCP 状态与未登录时的全局 LLM 配置弹窗。
 * openUserLLMConfigModal 来自 useLLMConfigs（已登录时点击配置走用户配置弹窗）。
 */
export function useLLMStatus(auth, openUserLLMConfigModal) {
  // LLM status
  const llmConfigured = ref(false)
  const mcpStatus = ref({ connected: false, degraded: false, message: 'MCP 未连接' })

  // Config modal
  const showConfigModal = ref(false)
  const configForm = reactive({
    apiKey: '',
    baseURL: '',
    model: ''
  })

  const checkLLMStatus = async () => {
    try {
      const status = await configAPI.getLLMStatus()
      llmConfigured.value = status.configured
    } catch (error) {
      llmConfigured.value = false
    }
  }

  const checkMCPStatus = async () => {
    try {
      const status = await mcpAPI.getStatus()
      mcpStatus.value = status
    } catch (error) {
      mcpStatus.value = {
        connected: false,
        degraded: true,
        message: 'MCP 服务不可用'
      }
    }
  }

  const saveConfig = async () => {
    try {
      await configAPI.configureLLM(configForm)
      llmConfigured.value = true
      showConfigModal.value = false
    } catch (error) {
      alert('配置保存失败: ' + error.message)
    }
  }

  // Config click handler
  const handleConfigClick = () => {
    if (auth?.currentUser?.value) {
      openUserLLMConfigModal()
    } else {
      showConfigModal.value = true
    }
  }

  return {
    llmConfigured,
    mcpStatus,
    showConfigModal,
    configForm,
    checkLLMStatus,
    checkMCPStatus,
    saveConfig,
    handleConfigClick
  }
}
