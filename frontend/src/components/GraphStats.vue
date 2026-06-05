<template>
  <div class="stats">
    <span class="stat-item">
      <span class="stat-label">节点</span>
      <span class="stat-value">{{ nodes.length }}</span>
    </span>
    <span class="stat-divider">|</span>
    <span class="stat-item">
      <span class="stat-label">边</span>
      <span class="stat-value">{{ edges.length }}</span>
    </span>
  </div>
</template>

<script setup>
defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  edges: {
    type: Array,
    default: () => []
  }
})
</script>

<style scoped>
.stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-label {
  color: var(--color-gray);
}

.stat-value {
  color: var(--color-black);
  font-weight: 600;
}

.stat-divider {
  color: var(--color-gray-lighter);
}
</style>
