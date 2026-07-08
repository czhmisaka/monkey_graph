<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>👤 个人资料</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>头像 URL</label>
          <input v-model="localForm.avatar" type="text" class="input"
            placeholder="https://example.com/avatar.jpg" />
          <div v-if="localForm.avatar" class="avatar-preview">
            <img :src="localForm.avatar" alt="头像预览" @error="handleAvatarError" />
          </div>
        </div>
        <div class="form-group">
          <label>个人简介</label>
          <textarea v-model="localForm.bio" class="input textarea" placeholder="介绍一下你自己..." rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn" @click="handleSave" :disabled="loading">
          {{ loading ? '保存中...' : '保存资料' }}
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
  form: {
    type: Object,
    default: () => ({
      avatar: '',
      bio: ''
    })
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'close', 'save'])

const localForm = ref({ ...props.form })

watch(() => props.form, (val) => {
  localForm.value = { ...val }
}, { deep: true })

const handleAvatarError = () => {
  localForm.value.avatar = ''
}

const handleSave = () => {
  emit('save', { ...localForm.value })
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

.textarea {
  resize: vertical;
  min-height: 80px;
}

/* 头像预览 */
.avatar-preview {
  margin-top: 8px;
}

.avatar-preview img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--color-gray-lighter);
}
</style>
