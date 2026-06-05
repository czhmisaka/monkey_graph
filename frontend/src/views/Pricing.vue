<script setup>
import { ref, onMounted } from 'vue'
import { plansAPI } from '../api/index.js'
import SaasHeader from '../components/Layout/SaasHeader.vue'

const plans = ref([])
const loading = ref(true)
const error = ref(null)

// 加载套餐数据
onMounted(async () => {
  try {
    const response = await plansAPI.getAll()
    plans.value = response.plans || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

// 获取功能图标
const getFeatureIcon = (feature) => {
  const icons = {
    'sse_chat': '💬',
    'basic_graph': '🕸️',
    'mcp_tools': '🔧',
    'semantic_search': '🔍',
    'api_access': '🔑',
    'clustering': '📊',
    'audit_logs': '📝',
    'webhook': '🪝',
    'sso': '🔐',
    'custom_domain': '🌐',
    'priority_support': '⭐'
  }
  return icons[feature] || '✓'
}

// 格式化价格
const formatPrice = (price) => {
  if (price === 0) return '免费'
  if (price === -1) return '无限制'
  return `¥${price}`
}
</script>

<template>
  <div class="pricing-page">
    <SaasHeader />
    
    <header class="pricing-header">
      <h1>选择适合您的套餐</h1>
      <p>根据您的需求，选择最合适的 MonkeyGraph 套餐</p>
    </header>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载套餐信息...</p>
    </div>

    <div v-else-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-else class="pricing-grid">
      <div 
        v-for="plan in plans" 
        :key="plan.id" 
        class="pricing-card"
        :class="{ 'featured': plan.id === 'team', 'free': plan.is_free }"
      >
        <div class="plan-badge" v-if="plan.is_free">免费</div>
        <div class="plan-badge featured-badge" v-else-if="plan.id === 'team'">热门</div>
        
        <h2 class="plan-name">{{ plan.name }}</h2>
        
        <div class="plan-price">
          <span class="price">{{ formatPrice(plan.price_monthly) }}</span>
          <span class="period" v-if="plan.price_monthly > 0">/月</span>
          <span class="yearly-price" v-if="plan.price_yearly > 0">
            年付 ¥{{ plan.price_yearly }}/年
          </span>
        </div>

        <div class="plan-limits">
          <div class="limit-item">
            <span class="label">图谱数量</span>
            <span class="value">{{ plan.graphs_limit === -1 ? '无限制' : plan.graphs_limit }}</span>
          </div>
          <div class="limit-item">
            <span class="label">节点数量</span>
            <span class="value">{{ plan.nodes_limit === -1 ? '无限制' : plan.nodes_limit.toLocaleString() }}</span>
          </div>
          <div class="limit-item">
            <span class="label">API 配额</span>
            <span class="value">{{ plan.api_quota === -1 ? '无限制' : plan.api_quota.toLocaleString() }}</span>
          </div>
          <div class="limit-item">
            <span class="label">Agent 数量</span>
            <span class="value">{{ plan.agents_limit === -1 ? '无限制' : plan.agents_limit }}</span>
          </div>
          <div class="limit-item">
            <span class="label">存储空间</span>
            <span class="value">{{ plan.storage_mb }}MB</span>
          </div>
          <div class="limit-item">
            <span class="label">快照数量</span>
            <span class="value">{{ plan.snapshots_limit === -1 ? '无限制' : plan.snapshots_limit }}</span>
          </div>
          <div class="limit-item">
            <span class="label">工作区数量</span>
            <span class="value">{{ plan.workspaces_limit === -1 ? '无限制' : plan.workspaces_limit }}</span>
          </div>
          <div class="limit-item">
            <span class="label">导出分辨率</span>
            <span class="value">{{ plan.max_export_resolution }}px</span>
          </div>
        </div>

        <button class="plan-button" :class="{ 'free': plan.is_free }">
          {{ plan.is_free ? '当前套餐' : '立即订阅' }}
        </button>
      </div>
    </div>

    <section class="faq-section">
      <h2>常见问题</h2>
      <div class="faq-grid">
        <div class="faq-item">
          <h3>如何切换套餐？</h3>
          <p>登录后进入控制面板，点击"切换套餐"即可选择更适合您的方案。</p>
        </div>
        <div class="faq-item">
          <h3>免费版有什么限制？</h3>
          <p>免费版包含基础功能，适合个人学习和小型项目。</p>
        </div>
        <div class="faq-item">
          <h3>企业版有什么特殊权益？</h3>
          <p>企业版提供 SSO 登录、自定义域名、优先技术支持等服务。</p>
        </div>
        <div class="faq-item">
          <h3>如何取消订阅？</h3>
          <p>可以在控制面板中随时取消订阅，已付费周期内仍可使用。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pricing-page {
  min-height: 100vh;
  padding: 40px 20px;
  background: var(--color-bg, #FAFAFA);
}

.pricing-header {
  text-align: center;
  margin-bottom: 60px;
}

.pricing-header h1 {
  font-size: 3rem;
  color: var(--color-black, #000000);
  margin-bottom: 16px;
}

.pricing-header p {
  font-size: 1.2rem;
  color: var(--color-gray, #666666);
}

.loading {
  text-align: center;
  padding: 60px;
  color: var(--color-gray, #666666);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-gray-lighter, #CCCCCC);
  border-top-color: var(--color-primary, #FF4500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  text-align: center;
  padding: 40px;
  color: #ff6b6b;
  background: rgba(255,107,107,0.1);
  border-radius: 12px;
  margin: 20px;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.pricing-card {
  background: var(--color-white, #FFFFFF);
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 16px;
  padding: 32px;
  position: relative;
  transition: transform 0.3s, box-shadow 0.3s;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.pricing-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(255, 69, 0, 0.15);
}

.pricing-card.featured {
  border-color: var(--color-primary, #FF4500);
}

.pricing-card.free {
  border-color: #50C878;
}

.plan-badge {
  position: absolute;
  top: -12px;
  right: 24px;
  background: #50C878;
  color: var(--color-white, #FFFFFF);
  padding: 4px 16px;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.featured-badge {
  background: var(--color-primary, #FF4500);
}

.plan-name {
  font-size: 1.5rem;
  color: var(--color-black, #000000);
  margin-bottom: 16px;
}

.plan-price {
  margin-bottom: 24px;
}

.price {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-black, #000000);
}

.period {
  font-size: 1rem;
  color: var(--color-gray, #666666);
}

.yearly-price {
  display: block;
  font-size: 0.875rem;
  color: #50C878;
  margin-top: 4px;
}

.plan-limits {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-gray-lighter, #CCCCCC);
}

.limit-item {
  display: flex;
  flex-direction: column;
}

.limit-item .label {
  font-size: 0.75rem;
  color: var(--color-gray, #666666);
}

.limit-item .value {
  font-size: 1rem;
  color: var(--color-black, #000000);
  font-weight: 600;
}

.plan-features {
  margin-bottom: 24px;
}

.plan-features h3 {
  font-size: 1rem;
  color: var(--color-black, #000000);
  margin-bottom: 12px;
}

.plan-features ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.plan-features li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--color-gray, #666666);
  font-size: 0.875rem;
}

.feature-icon {
  font-size: 1rem;
}

.plan-button {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--color-black, #000000);
  color: var(--color-white, #FFFFFF);
  border: 2px solid var(--color-black, #000000);
}

.plan-button:hover {
  background: var(--color-primary, #FF4500);
  border-color: var(--color-primary, #FF4500);
}

.plan-button.free {
  background: #50C878;
  border-color: #50C878;
}

.plan-button.free:hover {
  background: #45B369;
  border-color: #45B369;
}

.faq-section {
  max-width: 1000px;
  margin: 80px auto 0;
}

.faq-section h2 {
  font-size: 2rem;
  color: var(--color-black, #000000);
  text-align: center;
  margin-bottom: 40px;
}

.faq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
}

.faq-item {
  background: var(--color-white, #FFFFFF);
  border: 1px solid var(--color-gray-lighter, #CCCCCC);
  border-radius: 12px;
  padding: 24px;
}

.faq-item h3 {
  font-size: 1.1rem;
  color: var(--color-black, #000000);
  margin-bottom: 12px;
}

.faq-item p {
  color: var(--color-gray, #666666);
  font-size: 0.9rem;
  line-height: 1.6;
}
</style>
