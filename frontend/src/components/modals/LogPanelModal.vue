<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg modal-log-panel">
      <div class="modal-header">
        <h3>📋 执行日志</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body log-panel-body">
        <slot>
          <LogPanel :execution-traces="executionTraces" />
        </slot>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import LogPanel from '../Panels/LogPanel.vue'

defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  executionTraces: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'close'])
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

/* 日志面板弹窗样式 */
.modal-log-panel {
  max-width: 900px;
  width: 95%;
  max-height: 90vh;
}

.log-panel-body {
  max-height: 70vh;
  overflow-y: auto;
  padding: 0;
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

.btn-secondary {
  background: var(--color-gray-lightest);
  color: var(--color-gray-dark);
}

.btn-secondary:hover {
  background: var(--color-gray-lighter);
  color: var(--color-black);
}
</style>
