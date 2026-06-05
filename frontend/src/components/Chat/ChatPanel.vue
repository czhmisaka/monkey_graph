<template>
  <div class="chat-panel">
    <!-- 头部 -->
    <div class="chat-header">
      <h3>知识图谱助手</h3>
      <button class="btn btn-sm btn-secondary" @click="$emit('clear')">
        清空对话
      </button>
    </div>
    
    <!-- 消息列表 -->
    <div class="chat-messages" ref="messagesRef">
      <div v-if="messages.length === 0" class="chat-empty">
        <div class="empty-icon">◇</div>
        <p>欢迎使用 MonkeyGraph！</p>
        <p class="empty-hint">
          你可以告诉我你想添加什么知识，<br/>
          比如："添加一个名为 Python 的编程语言节点"
        </p>
      </div>
      
      <div 
        v-for="(msg, index) in messages" 
        :key="index"
        class="message"
        :class="msg.role"
      >
        <div class="message-avatar">
          <span v-if="msg.role === 'user'">◇</span>
          <span v-else>◈</span>
        </div>
        <div class="message-content">
          <!-- 助手消息：展示思考过程 -->
          <template v-if="msg.role === 'assistant' && (msg.executionTrace || msg.content || msg.iterations > 0)">
            <!-- 执行摘要 -->
            <div class="execution-summary">
              <span class="summary-badge" :class="msg.success ? 'success' : 'partial'">
                {{ msg.success ? '✓ 任务完成' : '⚠ 已停止' }}
              </span>
              <span class="iterations-info">共 {{ msg.iterations }} 轮对话</span>
            </div>
            
            <!-- 执行轨迹详情 -->
            <div class="execution-trace">
              <div 
                v-for="(trace, traceIndex) in msg.executionTrace" 
                :key="traceIndex"
                class="trace-item"
                :class="trace.type"
              >
                <!-- 思考过程 -->
                <template v-if="trace.type === 'thought'">
                  <div class="trace-header">
                    <span class="trace-icon">💭</span>
                    <span class="trace-label">第 {{ trace.iteration }} 轮思考</span>
                  </div>
                  <div class="trace-content" v-html="formatContent(trace.content)"></div>
                </template>
                
                <!-- 工具执行 -->
                <template v-else-if="trace.type === 'action'">
                  <div class="trace-header">
                    <span class="trace-icon">⚡</span>
                    <span class="trace-label">执行: {{ trace.toolName }}</span>
                    <span class="trace-status" :class="trace.result?.success ? 'success' : 'error'">
                      {{ trace.result?.success ? '成功' : '失败' }}
                    </span>
                  </div>
                  <pre class="trace-args">{{ formatToolArgs(trace.arguments) }}</pre>
                  <div v-if="trace.result?.data" class="trace-result">
                    结果: {{ formatResult(trace.result.data) }}
                  </div>
                  <div v-if="trace.result?.error" class="trace-error">
                    错误: {{ trace.result.error }}
                  </div>
                </template>
              </div>
            </div>
            
            <!-- 最终回复 -->
            <div v-if="msg.content" class="final-reply">
              <div class="reply-label">最终回复:</div>
              <div class="message-text" v-html="formatContent(msg.content)"></div>
            </div>
          </template>
          
          <!-- 普通消息显示 -->
          <template v-else>
            <div class="message-text" v-html="formatContent(msg.content)"></div>
          </template>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="loading" class="message assistant">
        <div class="message-avatar">
          <span>◈</span>
        </div>
        <div class="message-content">
          <div class="message-loading">
            <span class="status-dot processing"></span>
            <span>正在思考...</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 输入区域 -->
    <div class="chat-input">
      <!-- 文件上传按钮 -->
      <input 
        type="file"
        ref="fileInputRef"
        @change="handleFileSelect"
        accept=".pdf,.md,.txt"
        multiple
        style="display: none"
      />
      <button 
        class="btn btn-icon btn-upload"
        @click="triggerFileSelect"
        :disabled="loading"
        title="上传文档（PDF、Markdown、TXT）"
      >
        <span>📄</span>
      </button>
      
      <input 
        v-model="inputText"
        type="text"
        class="input"
        placeholder="输入你想添加到知识图谱的内容..."
        :disabled="loading"
        @keyup.enter="send"
      />
      
      <!-- 已上传文件显示 -->
      <div v-if="uploadedFiles.length > 0" class="uploaded-files">
        <div 
          v-for="(file, index) in uploadedFiles" 
          :key="index"
          class="uploaded-file"
        >
          <span class="file-name">{{ file.name }}</span>
          <button class="btn-remove" @click="removeFile(index)" title="移除">×</button>
        </div>
      </div>
      
      <!-- 暂停/取消按钮 -->
      <button 
        v-if="loading"
        class="btn btn-icon btn-cancel"
        @click="cancel"
        title="停止对话"
      >
        <span>⏹</span>
      </button>
      <button 
        v-else
        class="btn btn-icon"
        @click="send"
        :disabled="loading || (!inputText.trim() && uploadedFiles.length === 0)"
      >
        <span>↗</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['send', 'clear', 'cancel'])

const inputText = ref('')
const messagesRef = ref(null)
const fileInputRef = ref(null)
const uploadedFiles = ref([])

// 触发文件选择
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

// 处理文件选择
const handleFileSelect = (event) => {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  // 添加文件到列表（最多3个）
  for (let i = 0; i < files.length && uploadedFiles.value.length < 3; i++) {
    const file = files[i]
    // 验证文件类型
    const validTypes = ['.pdf', '.md', '.txt']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    
    if (!validTypes.includes(ext)) {
      alert(`不支持的文件类型: ${ext}，仅支持 PDF、Markdown、TXT`)
      continue
    }
    
    // 验证文件大小（最大 10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert(`文件过大: ${file.name}，最大支持 10MB`)
      continue
    }
    
    uploadedFiles.value.push(file)
  }
  
  // 清空输入框，以便重新选择
  event.target.value = ''
}

// 移除文件
const removeFile = (index) => {
  uploadedFiles.value.splice(index, 1)
}

// 发送消息（支持文件上传）
const send = () => {
  if (props.loading) return
  if (!inputText.value.trim() && uploadedFiles.value.length === 0) return
  
  // 如果有上传的文件
  if (uploadedFiles.value.length > 0) {
    // 构建 FormData
    const formData = new FormData()
    uploadedFiles.value.forEach(file => {
      formData.append('files', file)
    })
    // 将用户输入和文件一起发送
    const messageData = {
      text: inputText.value.trim(),
      files: formData
    }
    emit('send', messageData)
    uploadedFiles.value = []
    inputText.value = ''
  } else {
    emit('send', inputText.value)
    inputText.value = ''
  }
}

// 取消/暂停对话
const cancel = () => {
  emit('cancel')
}

// 格式化内容（使用 DOMPurify 防止 XSS 攻击）
const formatContent = (content) => {
  if (!content) return ''
  
  // 先将换行转换为 <br/>，再净化 HTML
  const withBreaks = content.replace(/\n/g, '<br/>')
  
  // 使用 DOMPurify 净化 HTML，只允许安全的标签和属性
  return DOMPurify.sanitize(withBreaks, {
    ALLOWED_TAGS: ['br', 'p', 'strong', 'em', 'b', 'i', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'class', 'style'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  })
}

// 格式化工具参数
const formatArgs = (args) => {
  try {
    return JSON.stringify(JSON.parse(args), null, 2)
  } catch {
    return args
  }
}

// 格式化工具参数（对象形式）
const formatToolArgs = (args) => {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

// 格式化结果
const formatResult = (data) => {
  if (!data) return ''
  if (typeof data === 'object') {
    return data.label || data.id || JSON.stringify(data)
  }
  return String(data)
}

// 自动滚动到底部
watch(() => props.messages.length, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
})

watch(() => props.loading, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-gray-lighter);
}

.chat-header h3 {
  font-size: 14px;
  font-family: var(--font-display);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-gray);
}

.empty-icon {
  font-size: 48px;
  color: var(--color-primary);
  margin-bottom: 16px;
}

.empty-hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-gray-lightest);
  color: var(--color-primary);
  font-size: 16px;
  flex-shrink: 0;
}

.message.assistant .message-avatar {
  background: var(--color-primary);
  color: white;
}

.message-content {
  max-width: 85%;
}

.message.user .message-content {
  text-align: right;
}

.message-text {
  display: inline-block;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-text {
  background: var(--color-black);
  color: var(--color-white);
  border-bottom-right-radius: 4px;
}

.message.assistant .message-text {
  background: var(--color-gray-lightest);
  color: var(--color-black);
  border-bottom-left-radius: 4px;
}

.message-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-gray-lightest);
  border-radius: 12px;
  font-size: 13px;
  color: var(--color-gray);
}

/* 工具调用显示 */
.tool-calls {
  margin-top: 8px;
  padding: 8px;
  background: var(--color-gray-lightest);
  border-radius: 8px;
}

.tool-call-label {
  font-size: 11px;
  color: var(--color-gray);
  margin-bottom: 6px;
}

.tool-call-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--color-white);
  border-radius: 6px;
  margin-bottom: 4px;
}

.tool-call-item:last-child {
  margin-bottom: 0;
}

.tool-name {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
}

.tool-args {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-gray);
  background: transparent;
  margin: 0;
  white-space: pre-wrap;
}

/* 输入区域 */
.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-gray-lighter);
}

.chat-input .input {
  flex: 1;
}

.chat-input .btn {
  flex-shrink: 0;
}

.chat-input .btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 执行摘要 */
.execution-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--color-gray-lightest);
  border-radius: 8px;
}

.summary-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.summary-badge.success {
  background: #D4EDDA;
  color: #155724;
}

.summary-badge.partial {
  background: #FFF3CD;
  color: #856404;
}

.iterations-info {
  font-size: 11px;
  color: var(--color-gray);
}

/* 执行轨迹 */
.execution-trace {
  margin-bottom: 12px;
}

.trace-item {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  background: var(--color-gray-lightest);
}

.trace-item.thought {
  border-left: 3px solid #9B59B6;
}

.trace-item.action {
  border-left: 3px solid #3498DB;
}

.trace-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.trace-icon {
  font-size: 12px;
}

.trace-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-gray-dark);
}

.trace-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
}

.trace-status.success {
  background: #D4EDDA;
  color: #155724;
}

.trace-status.error {
  background: #F8D7DA;
  color: #721C24;
}

.trace-content {
  font-size: 12px;
  color: var(--color-gray-dark);
  line-height: 1.5;
}

.trace-args {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-gray);
  background: var(--color-white);
  padding: 6px;
  border-radius: 4px;
  margin: 4px 0;
  white-space: pre-wrap;
  overflow-x: auto;
}

.trace-result {
  font-size: 11px;
  color: #28A745;
}

.trace-error {
  font-size: 11px;
  color: #DC3545;
}

/* 最终回复 */
.final-reply {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-gray-lighter);
}

.reply-label {
  font-size: 11px;
  color: var(--color-gray);
  margin-bottom: 6px;
}

/* 取消按钮样式 */
.btn-cancel {
  background: #e74c3c !important;
  color: white !important;
}

.btn-cancel:hover {
  background: #c0392b !important;
}

/* 上传按钮样式 */
.btn-upload {
  background: var(--color-gray-lightest) !important;
  color: var(--color-gray-dark) !important;
}

.btn-upload:hover:not(:disabled) {
  background: var(--color-gray-lighter) !important;
  color: var(--color-black) !important;
}

/* 已上传文件显示 */
.uploaded-files {
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.uploaded-file {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--color-gray-lightest);
  border-radius: 4px;
  font-size: 12px;
}

.file-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-remove {
  background: none;
  border: none;
  color: var(--color-gray);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.btn-remove:hover {
  color: #e74c3c;
}

/* 输入区域相对定位，用于放置上传文件列表 */
.chat-input {
  position: relative;
}
</style>
