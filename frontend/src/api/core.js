// API 核心基础设施：axios 实例、用户单例、重试机制
// 各域 API 模块从此处导入共享实例

import axios from 'axios'

// 配置常量
export const MAX_RETRIES = 3
export const RETRY_DELAY = 1000

// 当前登录用户 (单例 ref, 由 useAuth composable 维护)
// 不持久化到 localStorage;每次启动从 /auth/me 重新拉取
let currentUser = null
const userListeners = new Set()

export function getCurrentUser() {
  return currentUser
}

export function setCurrentUser(user) {
  currentUser = user
  for (const fn of userListeners) fn(user)
}

export function onUserChange(fn) {
  userListeners.add(fn)
  return () => userListeners.delete(fn)
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  withCredentials: true  // 发送 httpOnly cookie
})

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  response => response.data,
  error => {
    // 统一错误处理
    let errorMessage = '网络错误，请稍后重试'
    
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status
      const data = error.response.data
      
      switch (status) {
        case 400:
          errorMessage = data?.error || '请求参数错误'
          break
        case 401:
          errorMessage = '未授权，请重新登录'
          break
        case 403:
          errorMessage = '没有权限执行此操作'
          break
        case 404:
          errorMessage = data?.error || '请求的资源不存在'
          break
        case 500:
          errorMessage = '服务器内部错误'
          break
        case 502:
          errorMessage = '网关错误'
          break
        case 503:
          errorMessage = '服务暂时不可用'
          break
        default:
          errorMessage = data?.error || `请求失败 (${status})`
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      errorMessage = '网络连接失败，请检查网络'
    } else {
      // 请求配置出错
      errorMessage = error.message || '请求配置错误'
    }
    
    console.error('API Error:', errorMessage, error)
    
    // 返回带有详细信息的错误对象
    return Promise.reject(new Error(errorMessage))
  }
)

// 带重试机制的请求函数
export async function requestWithRetry(requestFn, retries = MAX_RETRIES, delay = RETRY_DELAY) {
  let lastError
  
  for (let i = 0; i < retries; i++) {
    try {
      return await requestFn()
    } catch (error) {
      lastError = error
      
      // 如果是客户端错误（4xx），不重试
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error
      }
      
      // 如果还有重试次数，等待后重试
      if (i < retries - 1) {
        console.log(`请求失败，${delay}ms 后重试 (${i + 1}/${retries})...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        // 指数退避
        delay *= 2
      }
    }
  }
  
  throw lastError
}

export default api
