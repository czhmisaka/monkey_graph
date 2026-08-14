import { ref, reactive } from 'vue'
import { userLLMConfigAPI } from '../api'

/**
 * 用户 LLM 配置弹窗（UserLLMConfigModal）：配置列表、创建、激活、删除。
 */
export function useLLMConfigs() {
  // User LLM config modal
  const showUserLLMConfigModal = ref(false)
  const userLLMConfigs = ref([])
  const llmConfigForm = reactive({
    provider: 'openai',
    api_key: '',
    base_url: '',
    model_name: 'gpt-4o'
  })
  const llmConfigLoading = ref(false)

  const loadUserLLMConfigs = async () => {
    try {
      userLLMConfigs.value = await userLLMConfigAPI.getAll()
    } catch (error) {
      userLLMConfigs.value = []
    }
  }

  const openUserLLMConfigModal = async () => {
    await loadUserLLMConfigs()
    llmConfigForm.provider = 'openai'
    llmConfigForm.api_key = ''
    llmConfigForm.base_url = ''
    llmConfigForm.model_name = 'gpt-4o'
    showUserLLMConfigModal.value = true
  }

  const createLLMConfig = async (formData) => {
    // 修复：接收 UserLLMConfigModal 传来的 form data（之前错误地读 Home.vue 自己的 llmConfigForm，导致 api_key 永远空 → 直接 return）
    if (!formData?.api_key) return
    llmConfigLoading.value = true
    try {
      await userLLMConfigAPI.create({
        provider: formData.provider,
        api_key: formData.api_key,
        base_url: formData.base_url,
        model_name: formData.model_name,
        is_active: userLLMConfigs.value.length === 0
      })
      await loadUserLLMConfigs()
      alert('配置添加成功！')
      showUserLLMConfigModal.value = false  // 关闭弹窗
    } catch (error) {
      alert('添加配置失败: ' + error.message)
    } finally {
      llmConfigLoading.value = false
    }
  }

  const activateLLMConfig = async (id) => {
    try {
      await userLLMConfigAPI.update(id, { is_active: true })
      await loadUserLLMConfigs()
      alert('已设为默认配置！')
    } catch (error) {
      alert('设置失败: ' + error.message)
    }
  }

  const deleteLLMConfig = async (id) => {
    if (!confirm('确定要删除这个配置吗？')) return
    try {
      await userLLMConfigAPI.delete(id)
      await loadUserLLMConfigs()
      alert('配置已删除！')
    } catch (error) {
      alert('删除失败: ' + error.message)
    }
  }

  return {
    showUserLLMConfigModal,
    userLLMConfigs,
    llmConfigForm,
    llmConfigLoading,
    loadUserLLMConfigs,
    openUserLLMConfigModal,
    createLLMConfig,
    activateLLMConfig,
    deleteLLMConfig
  }
}
