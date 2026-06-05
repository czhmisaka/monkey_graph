<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>🤖 Agent 图谱授权管理</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <!-- 返回按钮 -->
        <div v-if="authTab === 'detail'" class="auth-back-btn">
          <button class="btn btn-sm" @click="handleBackToList">
            ← 返回列表
          </button>
        </div>

        <!-- 列表视图：显示所有图谱的授权概览 -->
        <div v-if="authTab === 'list'" class="auth-list-view">
          <div v-if="graphAuthList.length === 0" class="empty-list">
            暂无图谱数据
          </div>
          <div v-for="item in graphAuthList" :key="item.graph.id" class="auth-graph-item">
            <div class="auth-graph-info">
              <span class="auth-graph-name">{{ item.graph.name }}</span>
              <span class="auth-graph-count">
                已授权 {{ item.authorizations?.length || 0 }} 个 Agent
              </span>
            </div>
            <button class="btn btn-sm" @click="$emit('open-graph-detail', item.graph)">
              管理授权 →
            </button>
          </div>
        </div>

        <!-- 详情视图：管理特定图谱的授权 -->
        <div v-if="authTab === 'detail' && selectedGraph" class="auth-detail-view">
          <h4 class="auth-detail-title">
            图谱: {{ selectedGraph.name }}
          </h4>

          <!-- 已授权的 Agent 列表 -->
          <div class="auth-section">
            <h5>已授权的 Agent</h5>
            <div v-if="!getCurrentGraphAuth?.authorizations?.length" class="empty-auth">
              暂无授权
            </div>
            <div v-for="auth in getCurrentGraphAuth?.authorizations" :key="auth.agent_id" class="auth-item">
              <div class="auth-item-info">
                <span class="auth-agent-name">{{ getAgentName(auth.agent_id) }}</span>
                <span class="auth-agent-desc">{{ getAgentDesc(auth.agent_id) }}</span>
                <span class="auth-permission">{{ auth.permission === 'write' ? '可读写' : '只读' }}</span>
              </div>
              <div class="auth-item-actions">
                <select :value="auth.permission"
                  @change="$emit('update-permission', selectedGraph.id, auth.agent_id, $event.target.value)"
                  class="input-select-sm">
                  <option value="read">只读</option>
                  <option value="write">可读写</option>
                </select>
                <button class="btn btn-sm btn-danger"
                  @click="$emit('revoke-auth', selectedGraph.id, auth.agent_id)">
                  撤销
                </button>
              </div>
            </div>
          </div>

          <!-- 可用的 Agent 列表 -->
          <div class="auth-section">
            <h5>授权新 Agent</h5>
            <div v-if="availableAgents.length === 0" class="empty-auth">
              暂无可用的 Agent
            </div>
            <div v-for="agent in availableAgents" :key="agent.id" class="auth-agent-item">
              <div class="auth-agent-info">
                <span class="auth-agent-name">{{ agent.name || agent.id }}</span>
                <span class="auth-agent-desc">{{ agent.description || '无描述' }}</span>
              </div>
              <div class="auth-agent-actions">
                <button class="btn btn-sm" @click="$emit('authorize', selectedGraph.id, agent.id, 'read')">
                  授权只读
                </button>
                <button class="btn btn-sm btn-primary"
                  @click="$emit('authorize', selectedGraph.id, agent.id, 'write')">
                  授权读写
                </button>
              </div>
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
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  authTab: {
    type: String,
    default: 'list' // 'list' | 'detail'
  },
  selectedGraph: {
    type: Object,
    default: null
  },
  graphAuthList: {
    type: Array,
    default: () => []
  },
  availableAgents: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'update:modelValue',
  'close',
  'open-graph-detail',
  'update-permission',
  'revoke-auth',
  'authorize',
  'back-to-list'
])

const localAuthTab = ref(props.authTab)

watch(() => props.authTab, (val) => {
  localAuthTab.value = val
})

const getCurrentGraphAuth = computed(() => {
  if (!props.selectedGraph) return null
  return props.graphAuthList.find(g => g.graph.id === props.selectedGraph.id)
})

const getAgentName = (agentId) => {
  const agent = props.availableAgents.find(a => a.id === agentId)
  return agent?.name || agentId || '未知Agent'
}

const getAgentDesc = (agentId) => {
  const agent = props.availableAgents.find(a => a.id === agentId)
  return agent?.description || '无描述'
}

const handleBackToList = () => {
  emit('back-to-list')
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

/* 授权管理弹窗样式 */
.auth-back-btn {
  margin-bottom: 16px;
}

.auth-list-view {
  max-height: 400px;
  overflow-y: auto;
}

.auth-graph-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  transition: all 0.2s;
}

.auth-graph-item:hover {
  background: var(--color-white);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.auth-graph-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-graph-name {
  font-weight: 600;
  color: var(--color-black);
}

.auth-graph-count {
  font-size: 12px;
  color: var(--color-gray);
}

.auth-detail-view {
  max-height: 500px;
  overflow-y: auto;
}

.auth-detail-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.auth-section {
  margin-bottom: 20px;
}

.auth-section h5 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-gray-dark);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-auth {
  padding: 16px;
  text-align: center;
  color: var(--color-gray);
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.auth-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--color-gray-lightest);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
}

.auth-item-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auth-agent-name {
  font-weight: 500;
  color: var(--color-black);
}

.auth-permission {
  padding: 2px 8px;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-pill);
  font-size: 11px;
}

.auth-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-select-sm {
  padding: 4px 8px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-sm);
  background: var(--color-white);
  font-size: 12px;
  cursor: pointer;
}

.input-select-sm:focus {
  outline: none;
  border-color: var(--color-primary);
}

.auth-agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--color-white);
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  transition: all 0.2s;
}

.auth-agent-item:hover {
  border-color: var(--color-primary);
}

.auth-agent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.auth-agent-info .auth-agent-name {
  font-weight: 600;
}

.auth-agent-desc {
  font-size: 11px;
  color: var(--color-gray);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-agent-actions {
  display: flex;
  gap: 8px;
}

.empty-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: var(--color-gray);
  font-size: 13px;
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

.btn-danger {
  background: #e74c3c;
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #c0392b;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.btn-primary:hover {
  background: #2b6cb0;
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
