<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>📤 分享图谱</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <!-- 生成分享链接 -->
        <div class="share-create">
          <label class="checkbox-label">
            <input type="checkbox" v-model="localAllowEdit" />
            允许编辑
          </label>
          <button class="btn" @click="$emit('create-share')" :disabled="loading">
            {{ loading ? '生成中...' : '生成分享链接' }}
          </button>
        </div>

        <!-- 分享链接列表 -->
        <div class="share-list">
          <h4>已有分享链接</h4>
          <div v-if="shares.length === 0" class="empty-share">
            暂无分享链接
          </div>
          <div v-for="share in shares" :key="share.id" class="share-item">
            <div class="share-info">
              <div class="share-link">
                <input type="text" :value="getShareUrl(share.share_token)" readonly class="input share-input" />
                <button class="btn btn-sm" @click="$emit('copy-share', share.share_token)" title="复制">
                  📋
                </button>
              </div>
              <div class="share-meta">
                <span>{{ share.allow_edit ? '允许编辑' : '只读' }}</span>
                <span>创建于: {{ formatDate(share.created_at) }}</span>
              </div>
            </div>
            <button class="btn btn-sm btn-danger" @click="$emit('delete-share', share.id)" title="取消分享">
              ×
            </button>
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
  shares: {
    type: Array,
    default: () => []
  },
  allowEdit: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'update:allowEdit',
  'close',
  'create-share',
  'copy-share',
  'delete-share'
])

const localAllowEdit = ref(props.allowEdit)

watch(() => props.allowEdit, (val) => {
  localAllowEdit.value = val
})

watch(localAllowEdit, (val) => {
  emit('update:allowEdit', val)
})

const getShareUrl = (token) => {
  return `${window.location.origin}/share/${token}`
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
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

/* 分享弹窗样式 */
.share-create {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
}

.share-list h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.empty-share {
  padding: 20px;
  text-align: center;
  color: var(--color-gray);
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
}

.share-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
}

.share-info {
  flex: 1;
}

.share-link {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.share-input {
  flex: 1;
  font-size: 12px;
  font-family: var(--font-mono);
}

.share-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-gray);
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

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-danger {
  background: #e74c3c;
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #c0392b;
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
  padding: 8px 12px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}
</style>
