<template>
  <div class="file-upload">
    <!-- 拖拽上传区域 -->
    <div 
      class="upload-area"
      :class="{ 'drag-over': isDragOver, 'has-files': files.length > 0 }"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        :accept="acceptedTypes"
        multiple
        @change="handleFileSelect"
        style="display: none"
      />
      
      <div v-if="files.length === 0" class="upload-placeholder">
        <div class="upload-icon">📄</div>
        <div class="upload-text">
          <span class="primary-text">点击或拖拽文件到此处上传</span>
          <span class="secondary-text">支持 PDF、MD、TXT 格式</span>
        </div>
      </div>
      
      <!-- 已选择文件列表 -->
      <div v-else class="file-list">
        <div 
          v-for="(file, index) in files" 
          :key="index" 
          class="file-item"
        >
          <div class="file-icon">{{ getFileIcon(file.name) }}</div>
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-size">{{ formatFileSize(file.size) }}</div>
          </div>
          <button class="remove-btn" @click.stop="removeFile(index)" title="移除">
            ×
          </button>
        </div>
        
        <div class="add-more" @click.stop="triggerFileInput">
          <span>+ 添加更多文件</span>
        </div>
      </div>
    </div>
    
    <!-- 文件类型提示 -->
    <div class="upload-tips">
      <span class="tip-item">📄 PDF</span>
      <span class="tip-item">📝 Markdown</span>
      <span class="tip-item">📃 TXT</span>
      <span class="tip-max">最多 {{ maxFiles }} 个文件，单个最大 {{ maxSizeMB }}MB</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  maxFiles: {
    type: Number,
    default: 10
  },
  maxSizeMB: {
    type: Number,
    default: 50
  }
})

const emit = defineEmits(['update:files'])

// 状态
const fileInput = ref(null)
const files = ref([])
const isDragOver = ref(false)

// 接受的文件类型
const acceptedTypes = '.pdf,.md,.markdown,.txt'

// 触发文件选择
const triggerFileInput = () => {
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = (event) => {
  const newFiles = Array.from(event.target.files)
  addFiles(newFiles)
  // 清空 input 以便重复选择相同文件
  event.target.value = ''
}

// 处理拖拽
const handleDragOver = () => {
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = (event) => {
  isDragOver.value = false
  const newFiles = Array.from(event.dataTransfer.files)
  addFiles(newFiles)
}

// 添加文件
const addFiles = (newFiles) => {
  const validFiles = newFiles.filter(file => {
    // 检查文件类型
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    const allowedExts = ['.pdf', '.md', '.markdown', '.txt']
    if (!allowedExts.includes(ext)) {
      console.warn(`不支持的文件类型: ${file.name}`)
      return false
    }
    
    // 检查文件大小
    if (file.size > props.maxSizeMB * 1024 * 1024) {
      console.warn(`文件过大: ${file.name}`)
      return false
    }
    
    // 检查文件数量
    if (files.value.length >= props.maxFiles) {
      console.warn('已达到最大文件数量')
      return false
    }
    
    // 检查重复
    const isDuplicate = files.value.some(f => f.name === file.name && f.size === file.size)
    if (isDuplicate) {
      console.warn(`文件重复: ${file.name}`)
      return false
    }
    
    return true
  })
  
  files.value = [...files.value, ...validFiles]
  emit('update:files', files.value)
}

// 移除文件
const removeFile = (index) => {
  files.value = files.value.filter((_, i) => i !== index)
  emit('update:files', files.value)
}

// 获取文件图标
const getFileIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase()
  switch (ext) {
    case 'pdf':
      return '📕'
    case 'md':
    case 'markdown':
      return '📝'
    case 'txt':
      return '📄'
    default:
      return '📁'
  }
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 获取文件列表（供外部使用）
const getFiles = () => files.value

// 清空文件列表
const clearFiles = () => {
  files.value = []
  emit('update:files', files.value)
}

// 暴露方法
defineExpose({
  getFiles,
  clearFiles
})
</script>

<style scoped>
.file-upload {
  width: 100%;
}

.upload-area {
  border: 2px dashed var(--color-gray-lighter, #ddd);
  border-radius: var(--radius-lg, 8px);
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-gray-lightest, #f9f9f9);
}

.upload-area:hover {
  border-color: var(--color-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.05);
}

.upload-area.drag-over {
  border-color: var(--color-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.1);
}

.upload-area.has-files {
  padding: 16px;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-icon {
  font-size: 48px;
  opacity: 0.6;
}

.upload-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.primary-text {
  font-size: 14px;
  color: var(--color-black, #333);
  font-weight: 500;
}

.secondary-text {
  font-size: 12px;
  color: var(--color-gray, #666);
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-white, #fff);
  border: 1px solid var(--color-gray-lighter, #ddd);
  border-radius: var(--radius-md, 6px);
}

.file-icon {
  font-size: 24px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-black, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 12px;
  color: var(--color-gray, #666);
}

.remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: var(--color-gray-lightest, #f5f5f5);
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  color: var(--color-gray, #666);
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.add-more {
  padding: 12px;
  text-align: center;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  font-size: 14px;
}

.add-more:hover {
  text-decoration: underline;
}

.upload-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  justify-content: center;
}

.tip-item {
  font-size: 12px;
  color: var(--color-gray, #666);
  background: var(--color-gray-lightest, #f5f5f5);
  padding: 4px 8px;
  border-radius: var(--radius-sm, 4px);
}

.tip-max {
  font-size: 11px;
  color: var(--color-gray, #999);
}
</style>