<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>🤖 Agent 图谱授权管理</h3>
        <button class="btn-close" @click="closeModal">×</button>
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
        <button class="btn btn-secondary" @click="closeModal">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const emit = defineEmits(['close', 'update:modelValue', 'open-graph-detail', 'update-permission', 'revoke-auth', 'authorize', 'back-to-list'])

// 统一关闭处理：同时触发 update:modelValue（v-model）和 close 事件
const closeModal = () => {
  emit('update:modelValue', false)
  emit('close')
}

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
</script>
