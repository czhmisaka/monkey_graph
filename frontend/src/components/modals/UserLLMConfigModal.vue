<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>🔑 我的 LLM 配置</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <!-- 新建配置表单 -->
        <div class="llm-config-form">
          <h4>添加新配置</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Provider</label>
              <select v-model="localForm.provider" class="input">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">自定义 (OpenAI兼容)</option>
              </select>
            </div>
            <div class="form-group">
              <label>模型名称</label>
              <input v-model="localForm.model_name" type="text" class="input" placeholder="gpt-4o" />
            </div>
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input v-model="localForm.api_key" type="password" class="input" placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>Base URL (可选)</label>
            <input v-model="localForm.base_url" type="text" class="input"
              placeholder="https://api.openai.com/v1" />
          </div>
          <button class="btn" @click="handleCreate" :disabled="!localForm.api_key || loading">
            {{ loading ? '添加中...' : '+ 添加配置' }}
          </button>
        </div>

        <!-- 配置列表 -->
        <div class="llm-config-list">
          <h4>已有配置 ({{ configs.length }})</h4>
          <div v-if="configs.length === 0" class="empty-config">
            暂无 LLM 配置，请添加
          </div>
          <div v-for="config in configs" :key="config.id" class="llm-config-item"
            :class="{ active: config.is_active }">
            <div class="config-info">
              <div class="config-header">
                <span class="config-provider">{{ config.provider }}</span>
                <span class="config-model">{{ config.model_name }}</span>
                <span v-if="config.is_active" class="config-badge">使用中</span>
              </div>
              <div class="config-key">API Key: {{ config.api_key }}</div>
              <div v-if="config.base_url" class="config-url">URL: {{ config.base_url }}</div>
            </div>
            <div class="config-actions">
              <button v-if="!config.is_active" class="btn btn-sm" @click="$emit('activate', config.id)" title="设为默认">
                ✓
              </button>
              <button class="btn btn-sm" @click="$emit('delete', config.id)" title="删除">
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  configs: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'close',
  'create',
  'activate',
  'delete'
])

const localForm = ref({
  provider: 'openai',
  api_key: '',
  base_url: '',
  model_name: 'gpt-4o'
})

const handleCreate = () => {
  if (!localForm.value.api_key) return
  emit('create', { ...localForm.value })
  // Reset form after create
  localForm.value = {
    provider: 'openai',
    api_key: '',
    base_url: '',
    model_name: 'gpt-4o'
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-white);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-lg);
}

.modal-lg {
  max-width: 560px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.modal-header h3 {
  font-size: 16px;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-gray);
  cursor: pointer;
  line-height: 1;
}

.btn-close:hover {
  color: var(--color-black);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-gray-lighter);
}

/* 用户 LLM 配置弹窗样式 */
.llm-config-form {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.llm-config-form h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.llm-config-list h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.empty-config {
  padding: 20px;
  text-align: center;
  color: var(--color-gray);
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
}

.llm-config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
}

.llm-config-item.active {
  border: 2px solid var(--color-primary);
  background: rgba(59, 130, 246, 0.05);
}

.config-info {
  flex: 1;
}

.config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.config-provider {
  font-weight: 600;
  color: var(--color-black);
}

.config-model {
  color: var(--color-gray);
}

.config-badge {
  padding: 2px 8px;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-pill);
  font-size: 10px;
}

.config-key,
.config-url {
  font-size: 12px;
  color: var(--color-gray);
  font-family: var(--font-mono);
}

.config-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  background: var(--color-white);
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-secondary {
  background: var(--color-gray-lightest);
  color: var(--color-gray-dark);
}

.btn-secondary:hover {
  background: var(--color-gray-lighter);
  color: var(--color-black);
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}

select.input {
  cursor: pointer;
}
</style>
