<!--
 * @Date: 2026-02-24 11:04:57
 * @LastEditors: CZH
 * @LastEditTime: 2026-03-10 18:59:31
 * @FilePath: /czh_graph/frontend/src/App.vue
-->
<script setup>
import { ref, computed, onMounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { provide } from 'vue'
import AuthModal from './components/AuthModal.vue'
import Toast from './components/Toast.vue'
import { authAPI, getToken, clearToken } from './api'
import { setToastInstance } from './composables/useToast'

const route = useRoute()
const router = useRouter()

// Toast 组件引用
const toastRef = shallowRef(null)

// 全局认证状态
const currentUser = ref(null)
const showAuthModal = ref(false)
const authModalMode = ref('login')

// 判断是否为图谱页面（图谱页面不显示全局顶部导航）
const isGraphPage = computed(() => {
  return route.path.startsWith('/graph')
})

// 初始化认证状态
const initAuth = async () => {
  const token = getToken()
  if (token) {
    try {
      const response = await authAPI.getCurrentUser()
      currentUser.value = response.user
    } catch (error) {
      // Token 无效，清除
      clearToken()
      currentUser.value = null
    }
  }
}

// 登录成功回调 - 跳转到控制面板或刷新当前页
const handleLoginSuccess = (user) => {
  currentUser.value = user
  // 登录成功后，刷新页面以更新所有组件的用户状态
  window.location.reload()
}

// 打开登录弹窗
const openAuthModal = (mode = 'login') => {
  authModalMode.value = mode
  showAuthModal.value = true
}

// 关闭登录弹窗
const closeAuthModal = () => {
  showAuthModal.value = false
}

// Toast ref 设置
const setToastRef = (el) => {
  if (el) {
    toastRef.value = el
    setToastInstance(el)
    console.log('[App] Toast 实例已初始化')
  }
}

// 提供给子组件使用的认证方法
provide('auth', {
  currentUser,
  openAuthModal,
  logout: () => {
    clearToken()
    currentUser.value = null
  }
})

onMounted(() => {
  initAuth()
})
</script>

<template>
  <div class="app-container">
    <!-- 全局 Toast 通知 -->
    <Toast :ref="setToastRef" />
    
    <!-- 全局认证弹窗 -->
    <AuthModal 
      :show="showAuthModal" 
      :initial-mode="authModalMode"
      @close="closeAuthModal"
      @login-success="handleLoginSuccess"
    />
    
    <!-- 主内容区 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #FAFAFA);
}

.main-content {
  flex: 1;
  overflow: auto;
}
</style>
