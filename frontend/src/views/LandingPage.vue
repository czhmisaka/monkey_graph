<script setup>
import { ref, onMounted, inject, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as d3 from 'd3'
import { authAPI, statsAPI, graphsAPI, usageAPI, getToken, clearToken } from '../api/index.js'
import SaasHeader from '../components/Layout/SaasHeader.vue'

const router = useRouter()
const loading = ref(true)

// 从 App.vue 获取全局认证状态
const auth = inject('auth')
const currentUser = ref(null)

// 用户使用量数据
const usage = ref(null)
const usageLoading = ref(false)

// 全局统计数据
const globalStats = ref({
  users: 0,
  graphs: 0,
  nodes: 0
})
const statsLoading = ref(true)

// 背景图谱相关
const bgGraphContainer = ref(null)
const bgGraphData = ref({ nodes: [], edges: [] })

// 节点颜色映射
const nodeColors = {
  person: '#4A90D9',
  organization: '#50C878',
  concept: '#9B59B6',
  location: '#F39C12',
  default: '#95A5A6'
}

const getNodeColor = (type) => {
  return nodeColors[type] || nodeColors.default
}

// 加载随机图谱（使用公开 API，无需登录）
const loadRandomGraph = async () => {
  try {
    const graphs = await graphsAPI.getPublicList()
    if (graphs && graphs.length > 0) {
      const randomIndex = Math.floor(Math.random() * graphs.length)
      const randomGraph = graphs[randomIndex]
      const graphData = await graphsAPI.getPublicGraph(randomGraph.id)
      bgGraphData.value = {
        nodes: graphData.nodes || [],
        edges: graphData.edges || []
      }
      await nextTick()
      setTimeout(() => renderBgGraph(), 100)
    }
  } catch (e) {
    console.error('加载背景图谱失败:', e)
  }
}

// 使用 Canvas 精确测量文本宽度
const getTextWidth = (text, fontSize = 12) => {
  if (!text) return 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `${fontSize}px sans-serif`
  return ctx.measureText(text).width + 10
}

// 渲染背景图谱
const renderBgGraph = () => {
  if (!bgGraphContainer.value || bgGraphData.value.nodes.length === 0) return
  
  const container = bgGraphContainer.value
  const width = window.innerWidth
  const height = window.innerHeight - 60
  
  d3.select(container).selectAll('*').remove()
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('style', 'position: absolute; top: 0; left: 0;')
  
  const defs = svg.append('defs')
  defs.append('marker')
    .attr('id', 'bg-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 22)
    .attr('refY', 0)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#999')
  
  const g = svg.append('g')
  
  const nodes = bgGraphData.value.nodes.map((n, i) => ({
    ...n,
    x: n.x || Math.random() * width,
    y: n.y || Math.random() * height
  }))
  const edges = bgGraphData.value.edges.map(e => ({ ...e }))
  
  const getEdgeEnds = (edge) => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    const source = nodes.find(n => n.id === sourceId)
    const target = nodes.find(n => n.id === targetId)
    return { source, target }
  }
  
  const getEdgePath = (source, target) => {
    if (!source || !target) return ''
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  }
  
  const getNodeSize = (node) => {
    const label = node.label || ''
    const type = node.type || 'default'
    const labelWidth = getTextWidth(label, 12)
    const typeWidth = getTextWidth(type, 10)
    return Math.max(Math.max(labelWidth, typeWidth) / 2 + 10, 25)
  }
  
  const FLOAT_RADIUS = Math.min(width, height) / 3
  const FLOAT_STRENGTH = 0.08
  
  const simulation = d3.forceSimulation(nodes)
    .velocityDecay(0.7)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(d => -getNodeSize(d) * 2))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
    .force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 10))
    .force('radial', d3.forceRadial(FLOAT_RADIUS, width / 2, height / 2).strength(FLOAT_STRENGTH))
  
  const linkGroup = g.append('g').selectAll('.link-group').data(edges).enter().append('g').attr('class', 'link-group')
  
  linkGroup.append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '5,3')
    .attr('marker-end', 'url(#bg-arrow)')
    .attr('opacity', 0.6)
  
  const linkLabelGroups = linkGroup.append('g').attr('class', 'link-label-group').attr('opacity', d => d.label ? 1 : 0)
  
  linkLabelGroups.append('rect')
    .attr('class', 'link-label-bg')
    .attr('fill', 'white')
    .attr('stroke', '#ddd')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,2')
    .attr('rx', 4).attr('ry', 4)
    .attr('x', -20).attr('y', -8)
    .attr('width', 40).attr('height', 16)
  
  linkLabelGroups.append('text')
    .attr('class', 'link-label')
    .attr('font-size', '9px')
    .attr('fill', '#666')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .text(d => d.label || '')
  
  const node = g.append('g').selectAll('.node').data(nodes).enter().append('g').attr('class', 'node').style('cursor', 'pointer')
  
  node.append('rect')
    .attr('class', 'node-bg')
    .attr('y', -22)
    .attr('height', 44)
    .attr('rx', 8).attr('ry', 8)
    .attr('fill', 'white')
    .attr('stroke', d => getNodeColor(d.type))
    .attr('stroke-width', 2)
    .attr('opacity', 0.9)
  
  node.append('text')
    .attr('class', 'node-label')
    .attr('dy', '-4')
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', d => getNodeColor(d.type))
    .text(d => d.label || '')
  
  node.append('text')
    .attr('class', 'node-type')
    .attr('dy', '14')
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#888')
    .text(d => d.type || 'default')
  
  const initNodeWidths = () => {
    node.each(function(d) {
      const label = d.label || ''
      const type = d.type || 'default'
      const labelWidth = getTextWidth(label, 12)
      const typeWidth = getTextWidth(type, 10)
      const maxWidth = Math.max(labelWidth, typeWidth) + 20
      d._width = Math.min(Math.max(maxWidth, 50), 150)
    })
  }
  initNodeWidths()
  
  simulation.on('tick', () => {
    linkGroup.select('.link').attr('d', d => {
      const { source, target } = getEdgeEnds(d)
      return getEdgePath(source, target)
    })
    
    linkGroup.select('.link-label-group').attr('transform', d => {
      const { source, target } = getEdgeEnds(d)
      if (!source || !target) return ''
      const mx = (source.x + target.x) / 2
      const my = (source.y + target.y) / 2
      return `translate(${mx}, ${my - 8})`
    })
    
    node.attr('transform', d => `translate(${d.x}, ${d.y})`)
    
    node.select('.node-bg')
      .attr('x', d => -(d._width || 50) / 2)
      .attr('width', d => d._width || 50)
  })
  
  simulation.alphaTarget(0.1).restart()
}

// 加载用户使用量
const loadUserUsage = async () => {
  if (!currentUser.value) return
  usageLoading.value = true
  try {
    usage.value = await usageAPI.getCurrent()
  } catch (e) {
    console.error('加载使用量失败:', e)
  } finally {
    usageLoading.value = false
  }
}

// 计算使用百分比
const getUsagePercent = (used, limit) => {
  if (limit === -1 || !limit) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

// 格式化数字
const formatNumber = (num) => {
  if (num === -1 || !num) return '0'
  return num.toLocaleString()
}

// 检查登录状态
onMounted(async () => {
  const token = getToken()
  if (token) {
    try {
      const res = await authAPI.getCurrentUser()
      currentUser.value = res.user
      if (auth?.currentUser) {
        auth.currentUser.value = res.user
      }
      // 加载用户使用量
      loadUserUsage()
    } catch (e) {
      clearToken()
    }
  }
  
  try {
    const stats = await statsAPI.getGlobalStats()
    globalStats.value = stats
  } catch (e) {
    globalStats.value = { users: 10000, graphs: 50000, nodes: 500000 }
  } finally {
    statsLoading.value = false
  }
  
  loadRandomGraph()
  loading.value = false
})

const startUsing = () => {
  if (currentUser.value) {
    router.push('/dashboard')
  } else {
    if (auth?.openAuthModal) {
      auth.openAuthModal('login')
    } else {
      router.push('/login')
    }
  }
}

const viewPricing = () => {
  router.push('/dashboard')
}
</script>

<template>
  <div class="landing-page">
    <div class="bg-graph" ref="bgGraphContainer"></div>
    <SaasHeader />

    <!-- Hero 区域 -->
    <section class="hero">
      <div class="hero-content">
        <div class="hero-badge">
          <span class="badge-icon">◈</span>
          <span>AI 记忆引擎</span>
        </div>
        <h1 class="hero-title">
          帮你的 AI 构建
          <span class="highlight">记忆能力</span>
        </h1>
        <p class="hero-description">
          MonkeyGraph 为 AI 赋予持久记忆能力。通过上传文档，AI 自动分析并构建知识图谱，
          让 AI 记住你的知识、文档和想法，成为真正的智能助手。
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" @click="startUsing">
            {{ currentUser ? '进入图谱' : '免费开始' }}
          </button>
          <button class="btn btn-secondary btn-lg" @click="viewPricing">
            查看定价
          </button>
        </div>
        <div class="hero-stats" v-if="!statsLoading">
          <div class="stat">
            <span class="stat-value">{{ formatNumber(globalStats.users) }}</span>
            <span class="stat-label">用户</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <span class="stat-value">{{ formatNumber(globalStats.graphs) }}</span>
            <span class="stat-label">图谱</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <span class="stat-value">{{ formatNumber(globalStats.nodes) }}</span>
            <span class="stat-label">节点</span>
          </div>
        </div>
        <div class="hero-stats" v-else>
          <div class="stat">
            <span class="stat-value">...</span>
            <span class="stat-label">加载中</span>
          </div>
        </div>
      </div>
      <div class="hero-visual">
        <div class="graph-preview">
          <div class="preview-node node-1">
            <span class="node-icon">📚</span>
            <span class="node-label">人工智能</span>
          </div>
          <div class="preview-node node-2">
            <span class="node-icon">🧠</span>
            <span class="node-label">机器学习</span>
          </div>
          <div class="preview-node node-3">
            <span class="node-icon">🔬</span>
            <span class="node-label">深度学习</span>
          </div>
          <div class="preview-node node-4">
            <span class="node-icon">📱</span>
            <span class="node-label">计算机视觉</span>
          </div>
          <div class="preview-node node-5">
            <span class="node-icon">💬</span>
            <span class="node-label">自然语言</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 功能特性 -->
    <section class="features">
      <div class="section-header">
        <h2>强大功能，随心所用</h2>
        <p>从文档到知识图谱，一键完成</p>
      </div>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🧠</div>
          <h3>智能记忆提取</h3>
          <p>AI 自动分析文档，提取关键信息和知识点，构建可查询的知识库</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔗</div>
          <h3>知识关联图谱</h3>
          <p>可视化展示信息之间的关联，帮助发现隐藏的知识联系</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">💬</div>
          <h3>上下文感知</h3>
          <p>AI 可以根据你的知识库进行对话，提供更精准、更有深度的回答</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔍</div>
          <h3>语义检索</h3>
          <p>基于向量嵌入的语义搜索，快速找到相关信息，不遗漏任何知识点</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📚</div>
          <h3>多文档整合</h3>
          <p>支持批量上传 PDF、Markdown、文本等文档，统一构建知识体系</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔄</div>
          <h3>持续学习</h3>
          <p>随时添加新文档，AI 会自动更新知识图谱，保持知识的时效性</p>
        </div>
      </div>
    </section>

    <!-- 使用步骤 -->
    <section class="how-it-works">
      <div class="section-header">
        <h2>简单 4 步，快速上手</h2>
        <p>从零开始构建你的知识图谱</p>
      </div>
      <div class="steps">
        <div class="step">
          <div class="step-number">01</div>
          <h3>上传文档</h3>
          <p>上传你的文档、笔记、书籍等资料</p>
        </div>
        <div class="step">
          <div class="step-number">02</div>
          <h3>AI 自动分析</h3>
          <p>AI 阅读并理解文档内容，提取关键信息</p>
        </div>
        <div class="step">
          <div class="step-number">03</div>
          <h3>构建记忆库</h3>
          <p>自动构建知识图谱，形成可查询的 AI 记忆</p>
        </div>
        <div class="step">
          <div class="step-number">04</div>
          <h3>智能对话</h3>
          <p>与 AI 对话，让它基于你的知识库来回答问题</p>
        </div>
      </div>
    </section>

    <!-- CTA 区域 -->
    <section class="cta">
      <div class="cta-content">
        <!-- 未登录显示原有内容 -->
        <template v-if="!currentUser">
          <h2>准备好给你的 AI 赋予记忆了吗？</h2>
          <p>免费注册，让 AI 成为真正懂你的智能助手</p>
          <div class="cta-actions">
            <button class="btn btn-primary btn-lg" @click="startUsing">
              立即免费注册
            </button>
          </div>
        </template>
        
        <!-- 登录后显示使用量信息卡片 -->
        <template v-else>
          <div class="usage-card">
            <div class="usage-header">
              <h2>{{ currentUser.username }} 的使用情况</h2>
              <span class="plan-badge">{{ usage?.plan || '免费版' }}</span>
            </div>
            <div class="usage-grid" v-if="usage">
              <div class="usage-stat-card">
                <div class="stat-content">
                  <span class="stat-label">API 调用</span>
                  <span class="stat-value">{{ formatNumber(usage.usage?.api_calls) }}</span>
                  <span class="stat-limit">/ {{ formatNumber(usage.quota?.api_quota) }}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress" :style="{ width: getUsagePercent(usage.usage?.api_calls, usage.quota?.api_quota) + '%' }"></div>
                </div>
              </div>
              <div class="usage-stat-card">
                <div class="stat-content">
                  <span class="stat-label">图谱数量</span>
                  <span class="stat-value">{{ usage.usage?.graphs || 0 }}</span>
                  <span class="stat-limit">/ {{ formatNumber(usage.quota?.graphs_limit) }}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress" :style="{ width: getUsagePercent(usage.usage?.graphs, usage.quota?.graphs_limit) + '%' }"></div>
                </div>
              </div>
              <div class="usage-stat-card">
                <div class="stat-content">
                  <span class="stat-label">节点数量</span>
                  <span class="stat-value">{{ formatNumber(usage.usage?.nodes || 0) }}</span>
                  <span class="stat-limit">/ {{ formatNumber(usage.quota?.nodes_limit) }}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress" :style="{ width: getUsagePercent(usage.usage?.nodes, usage.quota?.nodes_limit) + '%' }"></div>
                </div>
              </div>
              <div class="usage-stat-card">
                <div class="stat-content">
                  <span class="stat-label">存储空间</span>
                  <span class="stat-value">{{ usage.quota?.storage_mb || 10 }}</span>
                  <span class="stat-limit">MB</span>
                </div>
                <div class="progress-bar">
                  <div class="progress" style="width: 5%"></div>
                </div>
              </div>
            </div>
            <div class="cta-actions">
              <button class="btn btn-primary btn-lg" @click="startUsing">
                进入图谱
              </button>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-brand">
          <span class="footer-logo">◈</span>
          <span>MonkeyGraph</span>
        </div>
        <p class="footer-copyright">© 2026 MonkeyGraph. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: 
    linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
    linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
    var(--color-bg, #FAFAFA);
  background-size: 40px 40px;
  padding-top: 60px;
  position: relative;
  overflow: hidden;
}

.bg-graph {
  position: fixed;
  top: 60px;
  left: 0;
  width: 100%;
  height: calc(100vh - 60px);
  z-index: 0;
  pointer-events: none;
  opacity: 0.4;
}

.bg-graph :deep(svg) {
  width: 100%;
  height: 100%;
}

.hero, .features, .how-it-works, .cta, .footer {
  position: relative;
  z-index: 1;
}

/* Hero */
.hero {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
}

@media (max-width: 968px) {
  .hero { grid-template-columns: 1fr; text-align: center; }
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(2px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50px;
  color: var(--color-primary, #FF4500);
  font-size: 14px;
  margin-bottom: 24px;
}

.badge-icon { font-size: 18px; }

.hero-title {
  font-size: 3.5rem;
  font-weight: 700;
  color: var(--color-black, #000000);
  line-height: 1.2;
  margin-bottom: 24px;
}

@media (max-width: 768px) { .hero-title { font-size: 2.5rem; } }

.hero-title .highlight {
  background: linear-gradient(135deg, var(--color-primary, #FF4500), #FF6A33);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-description {
  font-size: 1.125rem;
  color: var(--color-gray, #333333);
  line-height: 1.8;
  margin-bottom: 40px;
  max-width: 540px;
}

@media (max-width: 968px) { .hero-description { margin: 0 auto 40px; } }

.hero-actions {
  display: flex;
  gap: 16px;
  margin-bottom: 60px;
}

@media (max-width: 968px) { .hero-actions { justify-content: center; } }

.btn {
  padding: 12px 28px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: var(--color-black, #000000);
  color: var(--color-white, #FFFFFF);
  border: 2px solid var(--color-black, #000000);
}

.btn-primary:hover {
  background: var(--color-primary, #FF4500);
  border-color: var(--color-primary, #FF4500);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 69, 0, 0.3);
}

.btn-secondary {
  background: var(--color-white, #FFFFFF);
  color: var(--color-black, #000000);
  border: 2px solid var(--color-gray-lighter, #CCCCCC);
}

.btn-secondary:hover {
  background: var(--color-primary, #FF4500);
  border-color: var(--color-primary, #FF4500);
  color: var(--color-white, #FFFFFF);
}

.btn-lg { padding: 16px 36px; font-size: 1.125rem; }

.hero-stats {
  display: flex;
  align-items: center;
  gap: 32px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(2px);
  padding: 20px 32px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

@media (max-width: 968px) { .hero-stats { justify-content: center; } }

.stat { text-align: center; }

.stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-primary, #FF4500);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-gray, #444444);
  display: block;
  margin-top: 4px;
}

.stat-divider { width: 1px; height: 40px; background: var(--color-gray-lighter, #CCCCCC); }

.hero-visual {
  display: flex;
  justify-content: center;
  align-items: center;
}

@media (max-width: 968px) { .hero-visual { display: none; } }

.graph-preview {
  position: relative;
  width: 400px;
  height: 400px;
}

.preview-node {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--color-white, #FFFFFF);
  border: 2px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 50px;
  color: var(--color-black, #000000);
  animation: float 6s ease-in-out infinite;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.node-icon { font-size: 1.25rem; }
.node-label { font-size: 0.875rem; font-weight: 500; }

.node-1 { top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255, 69, 0, 0.1); border-color: var(--color-primary, #FF4500); }
.node-2 { top: 10%; left: 20%; animation-delay: 1s; }
.node-3 { top: 10%; right: 20%; animation-delay: 2s; }
.node-4 { bottom: 15%; left: 15%; animation-delay: 3s; }
.node-5 { bottom: 15%; right: 15%; animation-delay: 4s; }

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(5px, -10px); }
  50% { transform: translate(0, -5px); }
  75% { transform: translate(-5px, -10px); }
}

.node-1 { animation: float-center 6s ease-in-out infinite; }

@keyframes float-center {
  0%, 100% { transform: translate(-50%, -50%); }
  25% { transform: translate(calc(-50% + 5px), calc(-50% - 10px)); }
  50% { transform: translate(-50%, calc(-50% - 5px)); }
  75% { transform: translate(calc(-50% - 5px), calc(-50% - 10px)); }
}

/* Features */
.features {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 24px;
}

.section-header {
  text-align: center;
  margin-bottom: 60px;
}

.section-header h2 {
  font-size: 2.5rem;
  color: var(--color-black, #000000);
  margin-bottom: 16px;
}

.section-header p {
  font-size: 1.125rem;
  color: var(--color-gray, #444444);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

@media (max-width: 968px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .features-grid { grid-template-columns: 1fr; } }

.feature-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(2px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 32px;
  transition: all 0.3s;
}

.feature-card:hover {
  border-color: var(--color-primary, #FF4500);
  transform: translateY(-4px);
}

.feature-icon { font-size: 2.5rem; margin-bottom: 20px; }
.feature-card h3 { font-size: 1.25rem; color: var(--color-black, #000000); margin-bottom: 12px; }
.feature-card p { color: var(--color-gray, #666666); line-height: 1.6; }

/* How it works */
.how-it-works {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 24px;
}

.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

@media (max-width: 968px) { .steps { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .steps { grid-template-columns: 1fr; } }

.step {
  text-align: center;
  padding: 32px 24px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(2px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.step:hover { background: rgba(255, 255, 255, 0.2); transform: translateY(-4px); }

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary, #FF4500);
  margin-bottom: 24px;
}

.step h3 { font-size: 1.25rem; color: var(--color-black, #000000); margin-bottom: 12px; }
.step p { color: var(--color-gray, #444444); }

/* CTA */
.cta {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 24px;
}

.cta-content {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(2px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 80px 40px;
  text-align: center;
}

.cta h2 {
  font-size: 2rem;
  color: var(--color-black, #000000);
  margin-bottom: 16px;
}

.cta p {
  font-size: 1.125rem;
  color: var(--color-gray, #333333);
  margin-bottom: 32px;
}

.cta-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

/* 使用量卡片 - 四块布局 */
.usage-card {
  max-width: 800px;
  margin: 0 auto;
}

.usage-header {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.usage-header h2 {
  margin-bottom: 0;
}

.plan-badge {
  padding: 6px 16px;
  background: linear-gradient(135deg, #FF4500, #FF6A33);
  color: white;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

@media (max-width: 768px) {
  .usage-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.usage-stat-card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  padding: 20px;
  text-align: left;
  transition: all 0.3s;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.usage-stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(255, 69, 0, 0.15);
}

.stat-icon {
  font-size: 1.5rem;
  margin-bottom: 12px;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.stat-label {
  font-size: 0.8rem;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  line-height: 1.2;
}

.stat-limit {
  font-size: 0.8rem;
  color: #999;
}

.progress-bar {
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: linear-gradient(90deg, #FF4500, #FF6A33);
  border-radius: 3px;
  transition: width 0.3s;
}

/* Footer */
.footer {
  border-top: 1px solid var(--color-gray-lighter, #CCCCCC);
  padding: 40px 24px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-black, #000000);
}

.footer-logo {
  color: var(--color-primary, #FF4500);
  font-size: 1.5rem;
}

.footer-copyright {
  color: var(--color-gray, #666666);
  font-size: 0.875rem;
}
</style>