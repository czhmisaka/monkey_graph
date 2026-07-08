<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>LLM 配置</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>API Key</label>
          <input v-model="localConfigForm.apiKey" type="password" class="input" placeholder="sk-..." />
        </div>
        <div class="form-group">
          <label>Base URL (可选)</label>
          <input v-model="localConfigForm.baseURL" type="text" class="input"
            placeholder="https://api.openai.com/v1 或本地地址如 http://localhost:1234/v1" />
        </div>
        <div class="form-group">
          <label>模型名称</label>
          <input v-model="localConfigForm.model" type="text" class="input" placeholder="gpt-4o 或本地模型名称" />
        </div>
        <div class="form-tip">
          <p>💡 支持 OpenAI API 和兼容 OpenAI 的本地模型服务 (如 LLM Studio)</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn" @click="handleSave" :disabled="!localConfigForm.apiKey">
          保存配置
        </button>
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
  configForm: {
    type: Object,
    default: () => ({
      apiKey: '',
      baseURL: '',
      model: ''
    })
  }
})

const emit = defineEmits(['update:modelValue', 'save', 'close'])

const localConfigForm = ref({ ...props.configForm })

watch(() => props.configForm, (val) => {
  localConfigForm.value = { ...val }
}, { deep: true })

const handleSave = () => {
  emit('save', { ...localConfigForm.value })
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

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.form-tip {
  padding: 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--color-gray);
}

.form-tip p {
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-gray-lighter);
}

.btn {
  padding: 8px 16px;
    color: var(--color-black);
  background: var(--color-white);
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  

}
.btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
</style>
