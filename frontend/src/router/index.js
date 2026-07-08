/*
 * @Date: 2026-02-24 11:03:34
 * @LastEditors: CZH
 * @LastEditTime: 2026-03-20 21:08:54
 * @FilePath: /czh_graph/frontend/src/router/index.js
 */
import { createRouter, createWebHistory } from 'vue-router'
import LandingPage from '../views/LandingPage.vue'
import Home from '../views/Home.vue'
import ShareView from '../views/ShareView.vue'
import TenantDashboard from '../views/TenantDashboard.vue'
import AdminDashboard from '../views/AdminDashboard.vue'
import AgentManagement from '../views/AgentManagement.vue'
import Pricing from '../views/Pricing.vue'
import GraphDataManager from '../views/GraphDataManager.vue'

const routes = [
  {
    path: '/',
    name: 'LandingPage',
    component: LandingPage // 项目介绍首页
  },
  {
    path: '/app',
    name: 'AppHome',
    component: Home // 知识图谱主界面
  },
  {
    path: '/graph',
    name: 'GraphHome',
    component: Home // 图谱主界面（无 ID 时显示选择/创建图谱）
  },
  {
    path: '/graph/:id',
    name: 'Graph',
    component: Home,
    props: true
  },
  {
    path: '/app/graph',
    name: 'AppGraphHome',
    component: Home // 图谱主界面（无 ID 时显示选择/创建图谱）
  },
  {
    path: '/app/graph/:id',
    name: 'AppGraph',
    component: Home,
    props: true
  },
  {
    path: '/share/:token',
    name: 'Share',
    component: ShareView
  },
  {
    path: '/pricing',
    name: 'Pricing',
    component: Pricing
  },
  {
    path: '/dashboard',
    name: 'TenantDashboard',
    component: TenantDashboard
  },
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: AdminDashboard
  },
  {
    path: '/agents',
    name: 'AgentManagement',
    component: AgentManagement
  },
  {
    path: '/dashboard/data',
    name: 'GraphDataManager',
    component: GraphDataManager
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 基于后端 /auth/me 验证(不可由前端篡改)
import { authAPI, getCurrentUser } from '../api/index.js'

router.beforeEach(async (to, from, next) => {
  // 管理后台与租户面板需登录 + 角色校验(后端权威)
  const needAuth = to.path.startsWith('/admin') || to.path.startsWith('/dashboard') || to.path.startsWith('/agents')

  if (!needAuth) return next()

  // 优先用内存中的 user
  let user = getCurrentUser()
  if (!user) {
    try {
      const res = await authAPI.getCurrentUser()
      user = res?.user || null
    } catch (e) {
      user = null
    }
  }

  if (!user) {
    return next('/')
  }

  // /admin 路由需要管理员
  if (to.path.startsWith('/admin') && !user.is_admin) {
    return next('/dashboard')
  }

  next()
})

export default router
