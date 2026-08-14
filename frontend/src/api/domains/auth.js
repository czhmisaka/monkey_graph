// 认证域 API：用户认证 (authAPI) + 用户 LLM 配置 (userLLMConfigAPI)
import { api, setCurrentUser } from '../core.js'

// 用户认证
export const authAPI = {
  // 注册
  async register(username, password) {
    const res = await api.post('/auth/register', { username, password })
    if (res?.user) setCurrentUser(res.user)
    return res
  },
  // 登录
  async login(username, password) {
    const res = await api.post('/auth/login', { username, password })
    if (res?.user) setCurrentUser(res.user)
    return res
  },
  // 注销 (清 httpOnly cookie)
  async logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      setCurrentUser(null)
    }
  },
  // 获取当前用户信息
  async getCurrentUser() {
    const res = await api.get('/auth/me')
    setCurrentUser(res?.user || null)
    return res
  },
  // 更新用户资料
  updateProfile(data) {
    return api.put('/auth/profile', data)
  }
}

// 用户 LLM 配置
export const userLLMConfigAPI = {
  // 获取所有配置
  getAll() {
    return api.get('/user/llm-configs')
  },
  // 创建配置
  create(data) {
    return api.post('/user/llm-configs', data)
  },
  // 更新配置
  update(id, data) {
    return api.put(`/user/llm-configs/${id}`, data)
  },
  // 删除配置
  delete(id) {
    return api.delete(`/user/llm-configs/${id}`)
  }
}
