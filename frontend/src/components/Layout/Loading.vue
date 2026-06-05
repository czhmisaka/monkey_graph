<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  // Loading 类型：spinner | dots | pulse | bars
  type: {
    type: String,
    default: 'spinner',
    validator: (v) => ['spinner', 'dots', 'pulse', 'bars'].includes(v)
  },
  // 尺寸：sm | md | lg
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v)
  },
  // 颜色
  color: {
    type: String,
    default: '#FF4500'
  },
  // 文本
  text: {
    type: String,
    default: ''
  },
  // 全屏模式
  fullscreen: {
    type: Boolean,
    default: false
  }
})

const sizeMap = {
  sm: '20px',
  md: '32px',
  lg: '48px'
}

const iconSize = computed(() => sizeMap[props.size])
</script>

<template>
  <!-- 全屏 Loading -->
  <Teleport v-if="fullscreen" to="body">
    <div class="loading-fullscreen">
      <div class="loading-content">
        <!-- Spinner -->
        <div 
          v-if="type === 'spinner'" 
          class="loading-spinner"
          :style="{ width: iconSize, height: iconSize, borderTopColor: color }"
        ></div>
        
        <!-- Dots -->
        <div v-else-if="type === 'dots'" class="loading-dots" :style="{ '--dot-size': iconSize }">
          <span class="dot" :style="{ background: color }"></span>
          <span class="dot" :style="{ background: color }"></span>
          <span class="dot" :style="{ background: color }"></span>
        </div>
        
        <!-- Pulse -->
        <div 
          v-else-if="type === 'pulse'" 
          class="loading-pulse"
          :style="{ width: iconSize, height: iconSize, background: color }"
        ></div>
        
        <!-- Bars -->
        <div v-else-if="type === 'bars'" class="loading-bars" :style="{ '--bar-size': iconSize }">
          <span class="bar" :style="{ background: color }"></span>
          <span class="bar" :style="{ background: color }"></span>
          <span class="bar" :style="{ background: color }"></span>
          <span class="bar" :style="{ background: color }"></span>
        </div>
        
        <p v-if="text" class="loading-text">{{ text }}</p>
      </div>
    </div>
  </Teleport>

  <!-- 内联 Loading -->
  <div v-else class="loading-inline">
    <!-- Spinner -->
    <div 
      v-if="type === 'spinner'" 
      class="loading-spinner"
      :style="{ width: iconSize, height: iconSize, borderTopColor: color }"
    ></div>
    
    <!-- Dots -->
    <div v-else-if="type === 'dots'" class="loading-dots" :style="{ '--dot-size': iconSize }">
      <span class="dot" :style="{ background: color }"></span>
      <span class="dot" :style="{ background: color }"></span>
      <span class="dot" :style="{ background: color }"></span>
    </div>
    
    <!-- Pulse -->
    <div 
      v-else-if="type === 'pulse'" 
      class="loading-pulse"
      :style="{ width: iconSize, height: iconSize, background: color }"
    ></div>
    
    <!-- Bars -->
    <div v-else-if="type === 'bars'" class="loading-bars" :style="{ '--bar-size': iconSize }">
      <span class="bar" :style="{ background: color }"></span>
      <span class="bar" :style="{ background: color }"></span>
      <span class="bar" :style="{ background: color }"></span>
      <span class="bar" :style="{ background: color }"></span>
    </div>
    
    <p v-if="text" class="loading-text">{{ text }}</p>
  </div>
</template>

<style scoped>
/* 全屏 Loading */
.loading-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* 内联 Loading */
.loading-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Spinner */
.loading-spinner {
  border: 3px solid #E0E0E0;
  border-top-color: #FF4500;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Dots */
.loading-dots {
  display: flex;
  gap: calc(var(--dot-size, 32px) * 0.25);
  align-items: center;
}

.loading-dots .dot {
  width: calc(var(--dot-size, 32px) * 0.3);
  height: calc(var(--dot-size, 32px) * 0.3);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dots .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.loading-dots .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* Pulse */
.loading-pulse {
  border-radius: 50%;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

/* Bars */
.loading-bars {
  display: flex;
  gap: calc(var(--bar-size, 32px) * 0.1);
  align-items: flex-end;
  height: calc(var(--bar-size, 32px) * 0.8);
}

.loading-bars .bar {
  width: calc(var(--bar-size, 32px) * 0.2);
  height: 100%;
  animation: stretch 1.2s infinite ease-in-out;
}

.loading-bars .bar:nth-child(1) {
  animation-delay: -1.2s;
}

.loading-bars .bar:nth-child(2) {
  animation-delay: -1.1s;
}

.loading-bars .bar:nth-child(3) {
  animation-delay: -1.0s;
}

.loading-bars .bar:nth-child(4) {
  animation-delay: -0.9s;
}

@keyframes stretch {
  0%, 40%, 100% {
    height: 20%;
  }
  50% {
    height: 100%;
  }
}

/* 文本 */
.loading-text {
  color: #666;
  font-size: 14px;
  margin: 0;
}
</style>
