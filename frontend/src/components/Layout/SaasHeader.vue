<script setup>
import { ref, onMounted, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authAPI, getToken, clearToken } from '../api/index.js'

const router = useRouter()
const route = useRoute()

// 从 App.vue 获取全局认证状态
const auth = inject('auth')
const currentUser = ref(null)

// 检查登录状态
const checkAuth = async () => {
  const token = getToken()
  if (token) {
    try {
      const res = await authAPI.getCurrentUser()
      currentUser.value = res.user
      // 同步到全局状态
      if (auth?.currentUser) {
        auth.currentUser.value = res.user
      }
    } catch (e) {
      clearToken()
      currentUser.value = null
    }
  }
}

onMounted(() => {
  checkAuth()
})

// 退出登录
const logout = () => {
  clearToken()
  currentUser.value = null
  if (auth?.currentUser) {
    auth.currentUser.value = null
  }
  router.push('/')
}

// 打开登录弹窗
const openLoginModal = () => {
  if (auth?.openAuthModal) {
    auth.openAuthModal('login')
  }
}

// 判断是否为当前路由
const isActive = (path) => {
  return route.path === path || route.path.startsWith(path + '/')
}
</script>

<template>
  <header class="saas-header">
    <div class="header-left">
      <router-link to="/" class="logo">
        <span class="logo-icon">◈</span>
        <span class="logo-text">MonkeyGraph</span>
        <span class="version-tag">v2.0</span>
      </router-link>
    </div>
    
    <div class="header-right">
      <template v-if="currentUser">
        <router-link 
          to="/dashboard" 
          class="dashboard-icon"
          :class="{ active: isActive('/dashboard') }"
          title="控制面板"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </router-link>
        <button class="btn-logout" @click="logout">退出</button>
      </template>
      <template v-else>
        <button class="btn-login" @click="openLoginModal">登录</button>
      </template>
    </div>
  </header>
</template>

<style scoped>
.saas-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: var(--color-white, #FFFFFF);
  border-bottom: 1px solid var(--color-gray-lighter, #CCCCCC);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--color-black, #000000);
}

.logo-icon {
  font-size: 24px;
  color: var(--color-primary, #FF4500);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  font-family: var(--font-display, sans-serif);
}

.version-tag {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--color-primary, #FF4500);
  border-radius: 9999px;
  color: var(--color-primary, #FF4500);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-mono, monospace);
  margin-left: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 控制面板图标按钮 */
.dashboard-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--color-gray, #666666);
  border-radius: 8px;
  transition: all 0.2s;
}

.dashboard-icon:hover {
  color: var(--color-primary, #FF4500);
  background: rgba(255, 69, 0, 0.1);
}

.dashboard-icon.active {
  color: var(--color-primary, #FF4500);
  background: rgba(255, 69, 0, 0.1);
}

.user-name {
  color: var(--color-black, #000000);
  font-size: 14px;
  font-weight: 500;
}

.btn-logout {
  padding: 6px 12px;
  background: var(--color-gray-lightest, #F5F5F5);
  color: var(--color-gray, #666666);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: var(--color-primary, #FF4500);
  color: var(--color-white, #FFFFFF);
}

.btn-login {
  padding: 8px 16px;
  background: var(--color-black, #000000);
  color: var(--color-white, #FFFFFF);
  text-decoration: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-login:hover {
  background: var(--color-primary, #FF4500);
}
</style>