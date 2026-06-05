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

// 路由守卫 - 管理后台权限控制
router.beforeEach((to, from, next) => {
  // 检查是否访问管理后台
  if (to.path.startsWith('/admin')) {
    // 从 localStorage 获取用户信息
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        // 检查用户角色是否为管理员
        if (user.role === 'admin' || user.is_admin === true) {
          next()
        } else {
          // 非管理员重定向到控制面板
          next('/dashboard')
        }
      } catch (e) {
        // 用户信息解析失败，重定向到首页
        next('/')
      }
    } else {
      // 未登录，重定向到首页
      next('/')
    }
  } else {
    next()
  }
})

export default router
