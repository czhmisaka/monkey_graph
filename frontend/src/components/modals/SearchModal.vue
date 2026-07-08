<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-search">
      <div class="modal-header">
        <h3>🔍 搜索节点</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <!-- 语义搜索开关 -->
        <div class="search-options">
          <label class="search-toggle">
            <input type="checkbox" v-model="localUseSemanticSearch" @change="handleSearchModeChange" />
            <span class="toggle-label">
              <span class="toggle-icon">🧠</span>
              语义搜索
            </span>
          </label>
          <div class="search-status">
            <span v-if="localUseSemanticSearch" class="search-mode-badge semantic">
              {{ embeddingStatus.hasEmbeddings ? '语义匹配中' : '请先计算向量' }}
            </span>
            <span v-else class="search-mode-badge keyword">
              关键词搜索
            </span>
          </div>
        </div>

        <!-- 向量计算按钮和聚类分析按钮 -->
        <div class="embedding-actions">
          <button class="btn" @click="$emit('compute-embeddings')"
            :disabled="computingEmbedding || embeddingStatus.hasEmbeddings"
            :title="embeddingStatus.hasEmbeddings ? '向量已计算完成' : '为图谱中所有节点计算向量'">
            <span v-if="computingEmbedding" class="spinner"></span>
            <span v-else>🧮</span>
            {{ computingEmbedding ? '计算中...' : (embeddingStatus.hasEmbeddings ? '已计算向量' : '计算向量') }}
          </button>
          <button class="btn btn-cluster" @click="$emit('open-cluster')"
            :disabled="!embeddingStatus.hasEmbeddings || clustering" title="对节点进行聚类分析">
            <span v-if="clustering" class="spinner"></span>
            <span v-else>📊</span>
            {{ clustering ? '聚类中...' : '聚类分析' }}
          </button>
          <span v-if="embeddingComputeMessage" class="embedding-message"
            :class="{ success: embeddingComputeSuccess, error: !embeddingComputeSuccess }">
            {{ embeddingComputeMessage }}
          </span>
        </div>

        <div class="search-input-wrapper">
          <input v-model="localSearchKeyword" type="text" class="input search-input"
            :placeholder="localUseSemanticSearch ? '输入自然语言描述搜索相关节点...' : '输入关键词搜索节点...'" @input="handleSearchInput"
            @keyup.enter="$emit('execute-search', localSearchKeyword)" ref="searchInputRef" />
          <button class="btn" @click="$emit('execute-search', localSearchKeyword)" :disabled="searchLoading">
            <span v-if="searchLoading" class="spinner"></span>
            <span v-else>搜索</span>
          </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="searchError" class="search-error">
          {{ searchError }}
        </div>

        <!-- 搜索结果 -->
        <div v-if="searchResults.length > 0" class="search-results">
          <div v-for="node in searchResults" :key="node.id" class="search-result-item"
            @click="$emit('view-node', node)">
            <span class="result-label">{{ node.label }}</span>
            <span class="result-type" :style="{ backgroundColor: getNodeColor(node.type) }">
              {{ node.type }}
            </span>
            <span v-if="node.similarity" class="result-similarity">
              {{ (node.similarity * 100).toFixed(0) }}%
            </span>
          </div>
        </div>
        <div v-else-if="localSearchKeyword && searchLoading" class="search-loading">
          <span class="spinner"></span> 搜索中...
        </div>
        <div v-else-if="localSearchKeyword && searchResults.length === 0 && !searchLoading" class="search-empty">
          未找到匹配的节点
        </div>
        <div v-else class="search-hint">
          <p>💡 {{ localUseSemanticSearch ? '使用自然语言描述来搜索语义相关的节点' : '输入关键词搜索图谱中的节点' }}</p>
          <p class="hint-shortcut">快捷键: Ctrl+F</p>
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
  searchKeyword: {
    type: String,
    default: ''
  },
  searchResults: {
    type: Array,
    default: () => []
  },
  searchLoading: {
    type: Boolean,
    default: false
  },
  searchError: {
    type: String,
    default: ''
  },
  useSemanticSearch: {
    type: Boolean,
    default: true
  },
  embeddingStatus: {
    type: Object,
    default: () => ({ available: false, hasEmbeddings: false })
  },
  computingEmbedding: {
    type: Boolean,
    default: false
  },
  embeddingComputeMessage: {
    type: String,
    default: ''
  },
  embeddingComputeSuccess: {
    type: Boolean,
    default: false
  },
  clustering: {
    type: Boolean,
    default: false
  },
  nodeColors: {
    type: Object,
    default: () => ({
      person: '#4A90D9',
      organization: '#50C878',
      concept: '#9B59B6',
      location: '#F39C12',
      default: '#95A5A6'
    })
  },
  graphSettings: {
    type: Object,
    default: () => ({ nodeTypes: {} })
  }
})

const emit = defineEmits([
  'update:modelValue',
  'update:searchKeyword',
  'close',
  'execute-search',
  'view-node',
  'compute-embeddings',
  'open-cluster',
  'search-mode-change'
])

const localSearchKeyword = ref(props.searchKeyword)
const localUseSemanticSearch = ref(props.useSemanticSearch)
const searchInputRef = ref(null)

watch(() => props.searchKeyword, (val) => {
  localSearchKeyword.value = val
})

watch(() => props.useSemanticSearch, (val) => {
  localUseSemanticSearch.value = val
})

watch(() => props.modelValue, (val) => {
  if (val) {
    nextTick(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus()
      }
    })
  }
})

const handleSearchInput = () => {
  emit('update:searchKeyword', localSearchKeyword.value)
}

const handleSearchModeChange = () => {
  emit('search-mode-change', localUseSemanticSearch.value)
}

const getNodeColor = (type) => {
  if (props.graphSettings?.nodeTypes?.[type]?.color) {
    return props.graphSettings.nodeTypes[type].color
  }
  return props.nodeColors[type] || props.nodeColors.default
}
</script>

<style scoped>
/* 搜索弹窗样式 */
.modal-search {
  max-width: 500px;
}

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

/* 搜索选项行 */
.search-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 10px 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
}

.search-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.search-toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-black);
}

.toggle-icon {
  font-size: 14px;
}

.search-status {
  display: flex;
  align-items: center;
}

.search-mode-badge {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
}

.search-mode-badge.semantic {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.search-mode-badge.keyword {
  background: var(--color-gray-lighter);
  color: var(--color-gray-dark);
}

/* 向量计算按钮样式 */
.embedding-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
  border-radius: var(--radius-md);
}

.embedding-actions .btn {
  flex-shrink: 0;
}

.embedding-message {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.embedding-message.success {
  background: #d4edda;
  color: #155724;
}

.embedding-message.error {
  background: #f8d7da;
  color: #721c24;
}

.search-input-wrapper {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
}

/* 错误提示 */
.search-error {
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: var(--radius-md);
  color: #856404;
  font-size: 12px;
}

.search-results {
  max-height: 300px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.search-result-item:hover {
  background: var(--color-primary);
  color: white;
}

.search-result-item:hover .result-type {
  background: white;
  color: var(--color-primary);
}

.result-label {
  font-weight: 500;
  flex: 1;
}

.result-type {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  color: white;
  margin-left: 8px;
}

.result-similarity {
  padding: 2px 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
}

.search-loading,
.search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--color-gray);
  font-size: 13px;
}

.search-hint {
  text-align: center;
  padding: 20px;
  color: var(--color-gray);
}

.hint-shortcut {
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-gray-light);
}

/* 按钮样式 */
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

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.btn-primary:hover {
  background: #2b6cb0;
}

/* 聚类按钮特殊样式 */
.btn-cluster {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
}

.btn-cluster:hover {
  background: linear-gradient(135deg, #5a6fd6 0%, #65408a 100%);
}

.btn-cluster:disabled {
  background: var(--color-gray-lighter);
  color: var(--color-gray);
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-gray-lighter);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
