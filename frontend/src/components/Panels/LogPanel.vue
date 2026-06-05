<template>
  <div class="log-panel">
    <!-- 头部 -->
    <div class="log-header">
      <div class="log-title">
        <span class="log-icon">📋</span>
        <span>日志面板</span>
      </div>
      <div class="log-actions">
        <button class="btn btn-sm" @click="refreshLogs" title="刷新">
          🔄
        </button>
        <button class="btn btn-sm" @click="toggleAutoRefresh" :class="{ active: autoRefresh }" title="自动刷新">
          {{ autoRefresh ? '⏸' : '▶' }}
        </button>
        <button class="btn btn-sm" @click="downloadLogs" title="导出日志">
          📥
        </button>
        <button class="btn btn-sm" @click="clearFrontendLogs" title="清空前端日志">
          🗑️
        </button>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>
    </div>

    <!-- 标签页切换 -->
    <div class="log-tabs">
      <button 
        class="tab" 
        :class="{ active: activeTab === 'frontend' }"
        @click="activeTab = 'frontend'"
      >
        前端日志
        <span class="badge">{{ frontendLogs.length }}</span>
      </button>
      <button 
        class="tab" 
        :class="{ active: activeTab === 'backend' }"
        @click="activeTab = 'backend'"
      >
        后端日志
        <span class="badge">{{ backendLogs.length }}</span>
      </button>
    </div>

    <!-- 筛选和搜索 -->
    <div class="log-filters">
      <select v-model="levelFilter" class="filter-select">
        <option value="">全部级别</option>
        <option value="error">错误</option>
        <option value="warn">警告</option>
        <option value="info">信息</option>
        <option value="debug">调试</option>
      </select>
      <input 
        v-model="searchKeyword"
        type="text"
        class="filter-input"
        placeholder="搜索日志..."
        @input="handleSearch"
      />
    </div>

    <!-- 日志列表 -->
    <div class="log-content" ref="logContentRef">
      <!-- 前端日志 -->
      <div v-if="activeTab === 'frontend'" class="log-list">
        <div 
          v-for="log in filteredFrontendLogs" 
          :key="log.id"
          class="log-item"
          :class="log.level"
        >
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          <span class="log-level" :class="log.level">{{ log.level }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="filteredFrontendLogs.length === 0" class="log-empty">
          暂无日志
        </div>
      </div>

      <!-- 后端日志 -->
      <div v-if="activeTab === 'backend'" class="log-list">
        <div 
          v-for="(log, index) in filteredBackendLogs" 
          :key="index"
          class="log-item"
          :class="getLogLevel(log.message)"
        >
          <span class="log-time">{{ formatBackendTime(log.timestamp) }}</span>
          <span class="log-level" :class="getLogLevel(log.message)">{{ getLogLevel(log.message) }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="filteredBackendLogs.length === 0" class="log-empty">
          暂无日志
        </div>
      </div>
    </div>

    <!-- 底部状态 -->
    <div class="log-footer">
      <span class="log-status">
        共 {{ activeTab === 'frontend' ? filteredFrontendLogs.length : filteredBackendLogs }} 条日志
      </span>
      <span v-if="lastUpdate" class="log-update-time">
        最后更新: {{ formatTime(lastUpdate) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { logsAPI } from '../api'
import logger from '../utils/logger'

const emit = defineEmits(['close'])

// 状态
const activeTab = ref('frontend')
const frontendLogs = ref([])
const backendLogs = ref([])
const levelFilter = ref('')
const searchKeyword = ref('')
const autoRefresh = ref(false)
const lastUpdate = ref(null)

// 自动刷新定时器
let autoRefreshTimer = null

// 加载前端日志
const loadFrontendLogs = () => {
  frontendLogs.value = logger.getLogs()
  lastUpdate.value = new Date()
}

// 加载后端日志
const loadBackendLogs = async () => {
  try {
    const response = await logsAPI.getRecent(50)
    if (response.success) {
      backendLogs.value = response.logs || []
      lastUpdate.value = new Date()
    }
  } catch (error) {
    console.error('加载后端日志失败:', error)
  }
}

// 刷新日志
const refreshLogs = () => {
  loadFrontendLogs()
  if (activeTab.value === 'backend') {
    loadBackendLogs()
  }
}

// 切换自动刷新
const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  
  if (autoRefresh.value) {
    autoRefreshTimer = setInterval(() => {
      refreshLogs()
    }, 3000)
  } else {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer)
      autoRefreshTimer = null
    }
  }
}

// 导出日志
const downloadLogs = () => {
  logger.downloadLogs()
}

// 清空前端日志
const clearFrontendLogs = () => {
  logger.clearLogs()
  frontendLogs.value = []
}

// 搜索处理
const handleSearch = () => {
  // 搜索是响应式的，通过计算属性处理
}

// 获取日志级别
const getLogLevel = (message) => {
  if (!message) return 'info'
  const lower = message.toLowerCase()
  if (lower.includes('error') || lower.includes('err') || lower.includes('失败')) return 'error'
  if (lower.includes('warn') || lower.includes('警告')) return 'warn'
  if (lower.includes('debug')) return 'debug'
  return 'info'
}

// 解析日志消息，提取图谱名称和操作详情
const parseLogMessage = (message) => {
  if (!message) return { graphName: '', action: '', impact: '', raw: message }
  
  // 匹配图谱名称 [图谱名]
  const graphMatch = message.match(/\[([^\]]+)\]/)
  const graphName = graphMatch ? graphMatch[1] : ''
  
  // 匹配操作描述 "操作描述"
  const actionMatch = message.match(/📋\s*操作:\s*(.+?)(?:\n|$)/)
  const action = actionMatch ? actionMatch[1].trim() : ''
  
  // 匹配影响描述
  const impactMatch = message.match(/📊\s*影响:\s*(.+?)(?:\n|$)/)
  const impact = impactMatch ? impactMatch[1].trim() : ''
  
  // 匹配查询结果
  const queryMatch = message.match(/📊\s*查询结果:\s*(.+?)(?:\n|$)/)
  const queryResult = queryMatch ? queryMatch[1].trim() : ''
  
  return {
    graphName,
    action: action || queryResult,
    impact: impact || '',
    raw: message
  }
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

// 格式化后端时间
const formatBackendTime = (timestamp) => {
  if (!timestamp) return ''
  // 后端时间格式可能是不同的，尝试解析
  try {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit'
      })
    }
  } catch (e) {
    // 如果解析失败，尝试提取时间部分
    const match = timestamp.match(/\d{2}:\d{2}:\d{2}/)
    if (match) return match[0]
  }
  return timestamp.substring(0, 19)
}

// 计算属性：过滤后的前端日志
const filteredFrontendLogs = computed(() => {
  let logs = frontendLogs.value
  
  if (levelFilter.value) {
    logs = logs.filter(log => log.level === levelFilter.value)
  }
  
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    logs = logs.filter(log => log.message.toLowerCase().includes(keyword))
  }
  
  return logs.slice().reverse()
})

// 计算属性：过滤后的后端日志
const filteredBackendLogs = computed(() => {
  let logs = backendLogs.value
  
  if (levelFilter.value) {
    logs = logs.filter(log => getLogLevel(log.message) === levelFilter.value)
  }
  
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    logs = logs.filter(log => log.message.toLowerCase().includes(keyword))
  }
  
  return logs.slice().reverse()
})

// 监听标签页切换
watch(activeTab, (newTab) => {
  if (newTab === 'backend') {
    loadBackendLogs()
  }
})

// 自动滚动到底部
watch([filteredFrontendLogs, filteredBackendLogs], () => {
  if (logContentRef.value) {
    logContentRef.value.scrollTop = 0 // 显示最新日志在顶部
  }
})

onMounted(() => {
  loadFrontendLogs()
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
})
</script>

<style scoped>
.log-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-white);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-gray-lighter);
  background: var(--color-gray-lightest);
}

.log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.log-icon {
  font-size: 16px;
}

.log-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-actions .btn {
  padding: 4px 8px;
}

.log-actions .btn.active {
  background: var(--color-primary);
  color: white;
}

.log-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.tab {
  flex: 1;
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-gray);
  transition: all 0.2s;
}

.tab:hover {
  background: var(--color-gray-lightest);
}

.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}

.badge {
  display: inline-block;
  padding: 2px 6px;
  background: var(--color-gray-lightest);
  border-radius: 10px;
  font-size: 11px;
  margin-left: 4px;
}

.tab.active .badge {
  background: var(--color-primary);
  color: white;
}

.log-filters {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.filter-select {
  padding: 6px 10px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 12px;
  background: white;
}

.filter-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-gray-lighter);
  border-radius: var(--radius-md);
  font-size: 12px;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  border-radius: 4px;
  margin-bottom: 2px;
  background: var(--color-gray-lightest);
}

.log-item.error {
  background: #FEF2F2;
  border-left: 3px solid #EF4444;
}

.log-item.warn {
  background: #FFFBEB;
  border-left: 3px solid #F59E0B;
}

.log-item.debug {
  background: #EFF6FF;
  border-left: 3px solid #3B82F6;
}

.log-time {
  flex-shrink: 0;
  color: var(--color-gray);
}

.log-level {
  flex-shrink: 0;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 10px;
  text-transform: uppercase;
  width: 50px;
  text-align: center;
}

.log-level.error {
  background: #EF4444;
  color: white;
}

.log-level.warn {
  background: #F59E0B;
  color: white;
}

.log-level.info {
  background: #10B981;
  color: white;
}

.log-level.debug {
  background: #3B82F6;
  color: white;
}

.log-message {
  flex: 1;
  word-break: break-all;
  white-space: pre-wrap;
}

.log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--color-gray);
}

.log-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid var(--color-gray-lighter);
  background: var(--color-gray-lightest);
  font-size: 11px;
  color: var(--color-gray);
}
</style>