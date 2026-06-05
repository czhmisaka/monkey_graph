<template>
  <div class="status-container">
    <!-- LLM 状态 -->
    <div class="llm-status" :class="{ active: llmConfigured }">
      <span class="status-dot" :class="llmConfigured ? 'active' : ''"></span>
      <span class="status-text">{{ llmConfigured ? 'LLM 已连接' : 'LLM 未配置' }}</span>
    </div>
    <!-- MCP 状态 -->
    <div class="mcp-status" :class="{ active: mcpStatus.connected, degraded: mcpStatus.degraded }"
      :title="mcpStatus.message">
      <span class="status-dot"
        :class="mcpStatus.connected ? 'active' : (mcpStatus.degraded ? 'degraded' : '')"></span>
      <span class="status-text">{{ mcpStatus.connected ? 'MCP 已连接' : (mcpStatus.degraded ? 'MCP 降级' : 'MCP 未连接') }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  llmConfigured: {
    type: Boolean,
    default: false
  },
  mcpStatus: {
    type: Object,
    default: () => ({ connected: false, degraded: false, message: 'MCP 未连接' })
  }
})
</script>

<style scoped>
.status-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.llm-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-gray);
  background: var(--color-gray-lightest);
  border-radius: var(--radius-pill);
}

.llm-status.active {
  color: #2ECC71;
}

.mcp-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-gray);
  background: var(--color-gray-lightest);
  border-radius: var(--radius-pill);
  cursor: help;
}

.mcp-status.active {
  color: #2ECC71;
}

.mcp-status.degraded {
  color: #F39C12;
}

.mcp-status .status-dot.degraded {
  background-color: #F39C12;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-gray);
}

.status-dot.active {
  background-color: #2ECC71;
}
</style>
