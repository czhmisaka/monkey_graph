<script setup>
import { ref, computed } from 'vue'

// Toast 类型配置
const typeConfig = {
  success: {
    icon: '✓',
    color: '#22C55E',
    bgColor: '#DCFCE7'
  },
  error: {
    icon: '✕',
    color: '#EF4444',
    bgColor: '#FEE2E2'
  },
  warning: {
    icon: '⚠',
    color: '#F59E0B',
    bgColor: '#FEF3C7'
  },
  info: {
    icon: 'ℹ',
    color: '#3B82F6',
    bgColor: '#DBEAFE'
  }
}

// Toast 列表
const toasts = ref([])
let toastId = 0

// 添加 Toast
const addToast = (message, type = 'info', duration = 3000) => {
  const id = ++toastId
  const config = typeConfig[type] || typeConfig.info
  
  toasts.value.push({
    id,
    message,
    type,
    ...config,
    visible: true
  })
  
  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }
  
  return id
}

// 移除 Toast
const removeToast = (id) => {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index > -1) {
    toasts.value[index].visible = false
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 300) // 等待动画完成
  }
}

// 便捷方法
const success = (message, duration) => addToast(message, 'success', duration)
const error = (message, duration) => addToast(message, 'error', duration)
const warning = (message, duration) => addToast(message, 'warning', duration)
const info = (message, duration) => addToast(message, 'info', duration)

// 暴露方法给外部使用
defineExpose({
  addToast,
  removeToast,
  success,
  error,
  warning,
  info
})
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="{ 'toast-exit': !toast.visible }"
          :style="{
            '--toast-color': toast.color,
            '--toast-bg': toast.bgColor
          }"
        >
          <span class="toast-icon">{{ toast.icon }}</span>
          <span class="toast-message">{{ toast.message }}</span>
          <button class="toast-close" @click="removeToast(toast.id)">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--toast-bg, #fff);
  border: 1px solid var(--toast-color, #3B82F6);
  border-left: 4px solid var(--toast-color, #3B82F6);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  color: #333;
}

.toast-icon {
  font-size: 16px;
  font-weight: bold;
  color: var(--toast-color);
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.2s;
}

.toast-close:hover {
  color: var(--toast-color);
}

/* 动画 */
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.3s ease-in;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
</style>
