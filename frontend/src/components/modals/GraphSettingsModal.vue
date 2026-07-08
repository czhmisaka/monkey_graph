<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>图谱基础设定</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <!-- 节点类型配置 -->
        <div class="settings-section">
          <h4 class="section-title">节点类型样式</h4>
          <div class="type-list">
            <div v-for="(config, typeName) in localSettings.nodeTypes" :key="typeName" class="type-item">
              <span class="type-color" :style="{ backgroundColor: config.color }"></span>
              <span class="type-name">{{ typeName }}</span>
              <button class="btn btn-sm" @click="removeNodeType(typeName)">×</button>
            </div>
          </div>
          <div class="add-type-form">
            <input v-model="localNewNodeType.name" type="text" class="input" placeholder="类型名称" />
            <input v-model="localNewNodeType.color" type="color" class="input-color" />
            <button class="btn btn-sm" @click="handleAddNodeType">+ 添加</button>
          </div>
        </div>

        <!-- 边类型配置 -->
        <div class="settings-section">
          <h4 class="section-title">边类型样式</h4>
          <div class="type-list">
            <div v-for="(config, typeName) in localSettings.edgeTypes" :key="typeName" class="type-item">
              <span class="type-color" :style="{ backgroundColor: config.color }"></span>
              <span class="type-name">{{ typeName }}</span>
              <span class="type-style">{{ config.style }}</span>
              <button class="btn btn-sm" @click="removeEdgeType(typeName)">×</button>
            </div>
          </div>
          <div class="add-type-form">
            <input v-model="localNewEdgeType.name" type="text" class="input" placeholder="类型名称" />
            <input v-model="localNewEdgeType.color" type="color" class="input-color" />
            <select v-model="localNewEdgeType.style" class="input-select">
              <option value="dashed">虚线</option>
              <option value="solid">实线</option>
            </select>
            <button class="btn btn-sm" @click="handleAddEdgeType">+ 添加</button>
          </div>
        </div>

        <div class="form-tip">
          <p>💡 模型也可以通过对话来修改这些设定</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn" @click="handleSave">保存设定</button>
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
  settings: {
    type: Object,
    default: () => ({
      nodeTypes: {},
      edgeTypes: {}
    })
  }
})

const emit = defineEmits([
  'update:modelValue',
  'close',
  'save'
])

const localSettings = ref({ ...props.settings, nodeTypes: { ...props.settings.nodeTypes }, edgeTypes: { ...props.settings.edgeTypes } })
const localNewNodeType = ref({ name: '', color: '#4A90D9' })
const localNewEdgeType = ref({ name: '', color: '#999', style: 'dashed' })

watch(() => props.settings, (val) => {
  localSettings.value = {
    nodeTypes: { ...val.nodeTypes },
    edgeTypes: { ...val.edgeTypes }
  }
}, { deep: true })

const removeNodeType = (typeName) => {
  const newTypes = { ...localSettings.value.nodeTypes }
  delete newTypes[typeName]
  localSettings.value.nodeTypes = newTypes
}

const handleAddNodeType = () => {
  if (!localNewNodeType.value.name.trim()) return
  localSettings.value.nodeTypes = {
    ...localSettings.value.nodeTypes,
    [localNewNodeType.value.name]: {
      color: localNewNodeType.value.color,
      shape: 'rect'
    }
  }
  localNewNodeType.value = { name: '', color: '#4A90D9' }
}

const removeEdgeType = (typeName) => {
  const newTypes = { ...localSettings.value.edgeTypes }
  delete newTypes[typeName]
  localSettings.value.edgeTypes = newTypes
}

const handleAddEdgeType = () => {
  if (!localNewEdgeType.value.name.trim()) return
  localSettings.value.edgeTypes = {
    ...localSettings.value.edgeTypes,
    [localNewEdgeType.value.name]: {
      color: localNewEdgeType.value.color,
      style: localNewEdgeType.value.style
    }
  }
  localNewEdgeType.value = { name: '', color: '#999', style: 'dashed' }
}

const handleSave = () => {
  emit('save', { ...localSettings.value })
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

/* 图谱基础设定样式 */
.settings-section {
  margin-bottom: 20px;
}

.settings-section:last-of-type {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-gray-dark);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.type-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.type-name {
  font-weight: 500;
}

.type-style {
  font-size: 11px;
  color: var(--color-gray);
  padding: 2px 6px;
  background: var(--color-white);
  border-radius: var(--radius-sm);
}

.add-type-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-type-form .input {
  flex: 1;
  min-width: 100px;
}

.input-color {
  width: 40px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.input-select {
  padding: 6px 10px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 13px;
  background: var(--color-white);
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
