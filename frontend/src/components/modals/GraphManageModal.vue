<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>图谱管理</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <!-- 新建图谱 -->
        <div class="graph-create">
          <input v-model="localNewGraphName" type="text" class="input" placeholder="新图谱名称" @keyup.enter="handleCreateGraph" />
          <button class="btn" @click="handleCreateGraph" :disabled="!localNewGraphName">
            + 新建
          </button>
        </div>
        <!-- 图谱列表 -->
        <div class="graph-list">
          <div v-for="graph in graphs" :key="graph.id" class="graph-item"
            :class="{ active: graph.id === currentGraphId }">
            <!-- 正常显示模式 -->
            <template v-if="editingGraphId !== graph.id">
              <div class="graph-info">
                <span class="graph-name">{{ graph.name }}</span>
                <span class="graph-date">{{ formatDate(graph.updated_at) }}</span>
              </div>
              <div class="graph-actions">
                <button class="btn btn-sm" @click="startEditGraphName(graph)" title="编辑名称">
                  📝
                </button>
                <button class="btn btn-sm" @click="$emit('duplicate-graph', graph.id)" title="复制">
                  📋
                </button>
                <button class="btn btn-sm" @click="handleDeleteGraph(graph.id)" title="删除" v-if="graphs.length > 1">
                  🗑️
                </button>
              </div>
            </template>
            <!-- 编辑模式 -->
            <template v-else>
              <div class="graph-info graph-edit">
                <input v-model="localEditingGraphName" type="text" class="input input-sm" placeholder="图谱名称"
                  @keyup.enter="handleSaveGraphName" @keyup.escape="cancelEditGraphName" ref="editInputRef" />
              </div>
              <div class="graph-actions">
                <button class="btn btn-sm btn-primary" @click="handleSaveGraphName" title="保存" :disabled="editLoading">
                  ✓
                </button>
                <button class="btn btn-sm" @click="cancelEditGraphName" title="取消">
                  ✕
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  graphs: {
    type: Array,
    default: () => []
  },
  currentGraphId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits([
  'update:modelValue',
  'close',
  'create-graph',
  'update-graph-name',
  'duplicate-graph',
  'delete-graph'
])

const localNewGraphName = ref('')
const editingGraphId = ref(null)
const localEditingGraphName = ref('')
const editLoading = ref(false)
const editInputRef = ref(null)

watch(editingGraphId, (val) => {
  if (val) {
    nextTick(() => {
      if (editInputRef.value) {
        editInputRef.value.focus()
        editInputRef.value.select()
      }
    })
  }
})

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
}

const handleCreateGraph = () => {
  if (!localNewGraphName.value.trim()) return
  emit('create-graph', localNewGraphName.value.trim())
  localNewGraphName.value = ''
}

const startEditGraphName = (graph) => {
  editingGraphId.value = graph.id
  localEditingGraphName.value = graph.name
}

const cancelEditGraphName = () => {
  editingGraphId.value = null
  localEditingGraphName.value = ''
}

const handleSaveGraphName = async () => {
  if (!editingGraphId.value || !localEditingGraphName.value.trim()) return
  editLoading.value = true
  emit('update-graph-name', editingGraphId.value, localEditingGraphName.value.trim())
  cancelEditGraphName()
  editLoading.value = false
}

const handleDeleteGraph = (id) => {
  emit('delete-graph', id)
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

/* 图谱管理 */
.graph-create {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.graph-create .input {
  flex: 1;
}

/* 编辑模式 */
.graph-edit {
  flex: 1;
}

.graph-edit .input-sm {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
}

.graph-list {
  max-height: 400px;
  overflow-y: auto;
}

.graph-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  transition: all 0.2s;
}

.graph-item:hover {
  background: var(--color-gray-lightest);
}

.graph-item.active {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.05);
}

.graph-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.graph-name {
  font-weight: 500;
}

.graph-date {
  font-size: 12px;
  color: var(--color-gray);
}

.graph-actions {
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

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.btn-primary:hover {
  background: #2b6cb0;
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
