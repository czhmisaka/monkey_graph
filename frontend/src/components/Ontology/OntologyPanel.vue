<template>
  <div class="ontology-panel">
    <!-- 步骤指示器 -->
    <div class="steps">
      <div class="step" :class="{ active: step >= 1, completed: step > 1 }">
        <div class="step-number">1</div>
        <div class="step-label">上传文档</div>
      </div>
      <div class="step-line" :class="{ active: step > 1 }"></div>
      <div class="step" :class="{ active: step >= 2, completed: step > 2 }">
        <div class="step-number">2</div>
        <div class="step-label">生成本体</div>
      </div>
      <div class="step-line" :class="{ active: step > 2 }"></div>
      <div class="step" :class="{ active: step >= 3 }">
        <div class="step-number">3</div>
        <div class="step-label">构建图谱</div>
      </div>
    </div>
    
    <!-- 步骤1: 上传文件 -->
    <div v-if="step === 1" class="step-content">
      <h3>📄 上传文档</h3>
      <p class="step-desc">上传需要分析的文档（PDF、Markdown、TXT）</p>
      
      <FileUpload ref="fileUploadRef" v-model:files="uploadFiles" :max-files="10" />
      
      <div class="form-group">
        <label>模拟需求描述 *</label>
        <textarea 
          v-model="simulationRequirement" 
          class="input textarea"
          placeholder="例如：分析红楼梦人物关系，模拟贾宝玉、林黛玉、薛宝钗之间的情感纠葛"
          rows="3"
        ></textarea>
      </div>
      
      <div class="form-group">
        <label>额外上下文（可选）</label>
        <textarea 
          v-model="additionalContext" 
          class="input textarea"
          placeholder="提供额外的背景信息或特殊要求..."
          rows="2"
        ></textarea>
      </div>
      
      <!-- 进度显示区域 -->
      <div v-if="loading" class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (progress * 100) + '%' }"></div>
        </div>
        <div class="progress-text">{{ progressMessage }}</div>
        <div class="progress-percent">{{ Math.round(progress * 100) }}%</div>
      </div>
      
      <button 
        class="btn btn-primary" 
        @click="generateOntology"
        :disabled="!canGenerateOntology || loading"
      >
        {{ loading ? '生成本体中...' : '生成本体定义' }}
      </button>
    </div>
    
    <!-- 步骤2: 本体配置 -->
    <div v-if="step === 2" class="step-content">
      <h3>🎯 本体定义</h3>
      <p class="step-desc">查看和调整生成的本体定义</p>
      
      <!-- 分析摘要 -->
      <div v-if="ontologyData.analysis_summary" class="analysis-summary">
        <h4>📊 分析摘要</h4>
        <p>{{ ontologyData.analysis_summary }}</p>
      </div>
      
      <!-- 实体类型 -->
      <div class="ontology-section">
        <h4>🏷️ 实体类型 ({{ ontologyData.entity_types?.length || 0 }})</h4>
        <div class="type-cards">
          <div 
            v-for="(entityType, index) in ontologyData.entity_types" 
            :key="index"
            class="type-card"
          >
            <div class="type-header">
              <input 
                v-model="entityType.name" 
                class="type-name-input"
                @change="markModified"
              />
            </div>
            <div class="type-desc">{{ entityType.description }}</div>
            <div class="type-attrs" v-if="entityType.attributes?.length">
              <span class="attr-badge" v-for="attr in entityType.attributes" :key="attr.name">
                {{ attr.name }}: {{ attr.type }}
              </span>
            </div>
            <div class="type-examples" v-if="entityType.examples?.length">
              <span class="example-tag" v-for="ex in entityType.examples" :key="ex">{{ ex }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 关系类型 -->
      <div class="ontology-section">
        <h4>🔗 关系类型 ({{ ontologyData.edge_types?.length || 0 }})</h4>
        <div class="relation-cards">
          <div 
            v-for="(edgeType, index) in ontologyData.edge_types" 
            :key="index"
            class="relation-card"
          >
            <div class="relation-name">{{ edgeType.name }}</div>
            <div class="relation-desc">{{ edgeType.description }}</div>
            <div class="relation-structures" v-if="edgeType.source_targets?.length">
              <span 
                class="structure-tag"
                v-for="(st, i) in edgeType.source_targets" 
                :key="i"
              >
                {{ st.source }} → {{ st.target }}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="step-actions">
        <button class="btn btn-secondary" @click="goToStep(1)">上一步</button>
        <button 
          class="btn btn-primary" 
          @click="startBuildGraph"
          :disabled="building"
        >
          {{ building ? '构建中...' : '开始构建图谱' }}
        </button>
      </div>
    </div>
    
    <!-- 步骤3: 构建进度 -->
    <div v-if="step === 3" class="step-content">
      <h3>🔨 构建图谱</h3>
      <p class="step-desc">正在从文档中提取实体和关系</p>
      
      <!-- 进度条 -->
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (progress * 100) + '%' }"></div>
        </div>
        <div class="progress-text">{{ progressMessage }}</div>
        <div class="progress-percent">{{ Math.round(progress * 100) }}%</div>
      </div>
      
      <!-- 构建结果 -->
      <div v-if="buildResult" class="build-result">
        <div class="result-success">✅ 图谱构建完成！</div>
        <div class="result-stats">
          <div class="stat">
            <span class="stat-value">{{ buildResult.nodeCount }}</span>
            <span class="stat-label">节点</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ buildResult.edgeCount }}</span>
            <span class="stat-label">边</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ buildResult.chunkCount }}</span>
            <span class="stat-label">文本块</span>
          </div>
        </div>
      </div>
      
      <div class="step-actions">
        <button class="btn btn-secondary" @click="reset">新建项目</button>
        <button class="btn btn-primary" @click="viewGraph">查看图谱</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import FileUpload from './FileUpload.vue'
import { ontologyAPI, graphBuildAPI } from '../api'

const emit = defineEmits(['graph-created'])

// 状态
const step = ref(1)
const loading = ref(false)
const building = ref(false)
const progress = ref(0)
const progressMessage = ref('')
const buildResult = ref(null)
const taskId = ref(null)

// 表单数据
const uploadFiles = ref([])
const simulationRequirement = ref('')
const additionalContext = ref('')
const projectId = ref(null)
const projectText = ref('')
const ontologyData = ref({})

// 文件上传组件引用
const fileUploadRef = ref(null)

// 计算是否可以生成本体
const canGenerateOntology = computed(() => {
  return uploadFiles.value.length > 0 && simulationRequirement.value.trim().length > 0
})

// 生成本体 (使用 SSE 进度)
const generateOntology = async () => {
  if (!canGenerateOntology.value || loading.value) return
  
  loading.value = true
  progress.value = 0
  progressMessage.value = '准备生成...'
  
  try {
    // 构建 FormData
    const formData = new FormData()
    for (const file of uploadFiles.value) {
      formData.append('files', file)
    }
    formData.append('simulation_requirement', simulationRequirement.value)
    if (additionalContext.value) {
      formData.append('additional_context', additionalContext.value)
    }
    if (projectId.value) {
      formData.append('project_name', `项目_${projectId.value}`)
    }
    
    // 使用 SSE 版本获取进度
    const result = await ontologyAPI.generateWithProgress(formData, (data) => {
      console.log('SSE 进度:', data)
      
      if (data.type === 'progress') {
        progress.value = data.progress || 0
        progressMessage.value = data.message || '处理中...'
      } else if (data.type === 'error') {
        throw new Error(data.message || '本体生成失败')
      }
    })
    
    // 生成完成
    if (result) {
      projectId.value = result.project_id
      ontologyData.value = result.ontology
      
      // 保存文本长度信息用于后续构建
      projectText.value = `${result.files?.length || 0} 个文件，共 ${result.total_text_length || 0} 字符`
      
      step.value = 2
    }
  } catch (error) {
    alert('本体生成失败: ' + error.message)
    progressMessage.value = ''
  } finally {
    loading.value = false
    progress.value = 0
  }
}

// 开始构建图谱
const startBuildGraph = async () => {
  if (building.value) return
  
  building.value = true
  step.value = 3
  progress.value = 0
  progressMessage.value = '准备构建...'
  
  try {
    // 调用构建 API
    const response = await graphBuildAPI.build({
      project_id: projectId.value,
      graph_name: `知识图谱_${projectId.value}`,
      ontology: ontologyData.value,
      text: projectText.value, // 这里应该是完整文本，但已经丢失，需要优化
      chunk_size: 500,
      chunk_overlap: 50
    })
    
    if (response.success) {
      taskId.value = response.data.task_id
      
      // 轮询任务状态
      pollTaskStatus()
    }
  } catch (error) {
    progressMessage.value = '构建失败: ' + error.message
    building.value = false
  }
}

// 轮询任务状态
const pollTaskStatus = async () => {
  const poll = async () => {
    try {
      const response = await graphBuildAPI.getTask(taskId.value)
      const task = response.data
      
      progress.value = task.progress
      progressMessage.value = task.message
      
      if (task.status === 'COMPLETED') {
        buildResult.value = task.result
        building.value = false
        emit('graph-created', task.result)
      } else if (task.status === 'FAILED') {
        progressMessage.value = '构建失败: ' + task.error
        building.value = false
      } else {
        // 继续轮询
        setTimeout(poll, 1000)
      }
    } catch (error) {
      console.error('获取任务状态失败:', error)
      setTimeout(poll, 2000)
    }
  }
  
  poll()
}

// 标记已修改
const markModified = () => {
  // 可以添加修改标记逻辑
}

// 跳转到指定步骤
const goToStep = (s) => {
  step.value = s
}

// 查看图谱
const viewGraph = () => {
  if (buildResult.value?.graph_id) {
    emit('graph-created', buildResult.value)
  }
}

// 重置
const reset = () => {
  step.value = 1
  uploadFiles.value = []
  simulationRequirement.value = ''
  additionalContext.value = ''
  projectId.value = null
  ontologyData.value = {}
  buildResult.value = null
  progress.value = 0
  taskId.value = null
}

defineExpose({
  reset
})
</script>

<style scoped>
.ontology-panel {
  padding: 20px;
}

.steps {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-gray-lightest, #f5f5f5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--color-gray, #666);
  transition: all 0.3s;
}

.step.active .step-number {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.step.completed .step-number {
  background: #10b981;
  color: white;
}

.step-label {
  font-size: 12px;
  color: var(--color-gray, #666);
}

.step.active .step-label {
  color: var(--color-primary, #3b82f6);
  font-weight: 500;
}

.step-line {
  width: 60px;
  height: 2px;
  background: var(--color-gray-lighter, #ddd);
  margin: 0 12px;
  margin-bottom: 24px;
  transition: all 0.3s;
}

.step-line.active {
  background: var(--color-primary, #3b82f6);
}

.step-content {
  max-width: 700px;
  margin: 0 auto;
}

.step-content h3 {
  margin-bottom: 8px;
  font-size: 18px;
}

.step-desc {
  color: var(--color-gray, #666);
  margin-bottom: 24px;
  font-size: 14px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}

.textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-gray-lighter, #ddd);
  border-radius: var(--radius-md, 6px);
  font-size: 14px;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
}

.analysis-summary {
  background: var(--color-gray-lightest, #f5f5f5);
  padding: 16px;
  border-radius: var(--radius-md, 6px);
  margin-bottom: 24px;
}

.analysis-summary h4 {
  margin-bottom: 8px;
  font-size: 14px;
}

.analysis-summary p {
  font-size: 13px;
  color: var(--color-gray, #666);
  line-height: 1.6;
}

.ontology-section {
  margin-bottom: 24px;
}

.ontology-section h4 {
  margin-bottom: 12px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.type-card {
  background: var(--color-white, #fff);
  border: 1px solid var(--color-gray-lighter, #ddd);
  border-radius: var(--radius-md, 6px);
  padding: 12px;
  width: calc(50% - 6px);
  min-width: 200px;
}

.type-header {
  margin-bottom: 8px;
}

.type-name-input {
  font-weight: 600;
  font-size: 14px;
  border: none;
  background: transparent;
  width: 100%;
}

.type-name-input:focus {
  outline: none;
  border-bottom: 1px solid var(--color-primary, #3b82f6);
}

.type-desc {
  font-size: 12px;
  color: var(--color-gray, #666);
  margin-bottom: 8px;
}

.type-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.attr-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--color-gray-lightest, #f5f5f5);
  border-radius: var(--radius-sm, 4px);
  color: var(--color-gray, #666);
}

.type-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.example-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary, #3b82f6);
  border-radius: var(--radius-pill, 12px);
}

.relation-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.relation-card {
  background: var(--color-white, #fff);
  border: 1px solid var(--color-gray-lighter, #ddd);
  border-radius: var(--radius-md, 6px);
  padding: 12px;
}

.relation-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.relation-desc {
  font-size: 12px;
  color: var(--color-gray, #666);
  margin-bottom: 8px;
}

.relation-structures {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.structure-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border-radius: var(--radius-sm, 4px);
}

.step-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}

.progress-container {
  text-align: center;
  padding: 32px;
}

.progress-bar {
  height: 8px;
  background: var(--color-gray-lightest, #f5f5f5);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary, #3b82f6), #10b981);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  color: var(--color-gray, #666);
  margin-bottom: 8px;
}

.progress-percent {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
}

.build-result {
  text-align: center;
  padding: 24px;
  background: var(--color-gray-lightest, #f5f5f5);
  border-radius: var(--radius-lg, 8px);
  margin-top: 24px;
}

.result-success {
  font-size: 18px;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 16px;
}

.result-stats {
  display: flex;
  justify-content: center;
  gap: 32px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-black, #333);
}

.stat-label {
  font-size: 12px;
  color: var(--color-gray, #666);
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md, 6px);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-gray-lightest, #f5f5f5);
  color: var(--color-black, #333);
}

.btn-secondary:hover {
  background: #e5e5e5;
}
</style>