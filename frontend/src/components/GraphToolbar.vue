<template>
  <header class="header">
    <div class="header-left">
      <h1 class="logo">
        <span class="logo-icon">◈</span>
        <span class="logo-text">MonkeyGraph</span>
      </h1>
      <span class="tag">Beta</span>
      <span class="version-tag">v2.0</span>
      <!-- 全屏切换按钮 -->
      <button class="btn btn-sm fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏显示'">
        <span>⛶</span>
      </button>
    </div>
    <div class="header-center">
      <!-- 图谱选择器 -->
      <div class="graph-selector">
        <select v-model="currentGraphId" @change="onGraphSelectChange" class="select">
          <option v-for="graph in graphs" :key="graph.id" :value="graph.id">
            {{ graph.name }}
          </option>
        </select>
        <button class="btn btn-sm" @click="$emit('open-share')" title="分享图谱">
          <span>📤</span>
        </button>
        <button class="btn btn-sm" @click="$emit('open-graph-manage')" title="管理图谱">
          <span>📁</span>
        </button>
        <button class="btn btn-sm" @click="$emit('open-settings')" title="图谱基础设定">
          <span>🎨</span>
        </button>
        <button class="btn btn-sm" @click="$emit('export-image')" title="导出高清图片" :disabled="exportLoading">
          <span v-if="!exportLoading">📷</span>
          <span v-else class="spinner"></span>
        </button>
      </div>
      <GraphStats :nodes="nodes" :edges="edges" />
    </div>
    <div class="header-right">
      <!-- 用户信息或登录按钮 -->
      <div v-if="currentUser" class="user-info">
        <div class="user-avatar" @click="$emit('open-profile')" title="点击编辑资料">
          <img v-if="currentUser.avatar" :src="currentUser.avatar" alt="头像" />
          <span v-else class="avatar-placeholder">👤</span>
        </div>
        <span class="user-name" @click="$emit('open-profile')" title="点击编辑资料">{{ currentUser.username }}</span>
        <button class="btn btn-sm" @click="$emit('logout')" title="退出登录">
          🚪
        </button>
      </div>
      <button v-else class="btn btn-sm btn-primary" @click="$emit('open-auth')">
        <span>🔑</span> 登录
      </button>

      <StatusBar :llmConfigured="llmConfigured" :mcpStatus="mcpStatus" />

      <button class="btn btn-sm" @click="$emit('open-auth-management')" title="Agent 图谱授权管理">
        <span>🤖</span> 授权
      </button>
      <button class="btn btn-sm" @click="$emit('open-config')">
        <span>⚙</span> 配置
      </button>
      <button class="btn btn-sm btn-secondary" @click="$emit('undo')">
        <span>↩</span> 撤销
      </button>
      <!-- 日志面板按钮 -->
      <button class="btn btn-sm" @click="$emit('open-log-panel')" title="日志面板">
        <span>📋</span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { useFullscreen } from '../composables/useFullscreen'
import GraphStats from './GraphStats.vue'
import StatusBar from './StatusBar.vue'

const props = defineProps({
  graphs: {
    type: Array,
    default: () => []
  },
  currentGraphId: {
    type: String,
    default: null
  },
  nodes: {
    type: Array,
    default: () => []
  },
  edges: {
    type: Array,
    default: () => []
  },
  currentUser: {
    type: Object,
    default: null
  },
  llmConfigured: {
    type: Boolean,
    default: false
  },
  mcpStatus: {
    type: Object,
    default: () => ({ connected: false, degraded: false, message: 'MCP 未连接' })
  },
  exportLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:currentGraphId',
  'open-share',
  'open-graph-manage',
  'open-settings',
  'export-image',
  'open-profile',
  'logout',
  'open-auth',
  'open-auth-management',
  'open-config',
  'undo',
  'open-log-panel'
])

const { isFullscreen, toggleFullscreen } = useFullscreen()

const onGraphSelectChange = () => {
  emit('update:currentGraphId', props.currentGraphId)
}
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--color-white);
  border-bottom: 1px solid var(--color-gray-lighter);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 700;
}

.fullscreen-btn {
  padding: 4px 8px;
  font-size: 14px;
}

.logo-icon {
  color: var(--color-primary);
  font-size: 24px;
}

.logo-text {
  font-family: var(--font-display);
}

.header-center {
  display: flex;
  align-items: center;
  gap: 20px;
}

.graph-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select {
  padding: 6px 12px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  background: var(--color-white);
  font-size: 14px;
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-gray-lightest);
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 18px;
}

.user-name {
  cursor: pointer;
  font-weight: 500;
}

.tag {
  padding: 2px 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
}

.version-tag {
  padding: 2px 8px;
  background: var(--color-gray-lightest);
  color: var(--color-gray);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
}

/* 按钮样式 */
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

.btn-secondary {
  background: var(--color-gray-lightest);
  color: var(--color-gray-dark);
}

.btn-secondary:hover {
  background: var(--color-gray-lighter);
  color: var(--color-black);
}

/* Spinner */
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
</style>
