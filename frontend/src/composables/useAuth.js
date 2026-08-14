import { ref, computed, inject } from 'vue'
import { authAPI, getCurrentUser, setCurrentUser } from '../api'

export function useAuth() {
  const auth = inject('auth', null)
  
  // 降级模式：当 auth 未通过 provide 注入时的安全处理
  if (!auth) {
    const fallbackUser = ref(getCurrentUser())
    
    return {
      isLoginMode: ref(true),
      authForm: ref({ username: '', password: '' }),
      authFormLoading: ref(false),
      authError: ref(''),
      isLoggedIn: computed(() => !!fallbackUser.value),
      currentUser: computed(() => fallbackUser.value),
      openAuthModal: () => console.warn('[useAuth] auth 未注入，openAuthModal 不可用'),
      checkAuth: async () => !!fallbackUser.value,
      handleLogin: async () => { throw new Error('auth 未注入，登录不可用') },
      handleLogout: async () => { setCurrentUser(null); fallbackUser.value = null },
      submitAuth: async () => { throw new Error('auth 未注入，提交不可用') }
    }
  }

  // State
  const isLoginMode = ref(true)
  const authForm = ref({
    username: '',
    password: ''
  })
  const authFormLoading = ref(false)
  const authError = ref('')

  // Computed
  const isLoggedIn = computed(() => !!auth?.currentUser?.value || !!getCurrentUser())
  const currentUser = computed(() => auth?.currentUser?.value || getCurrentUser() || null)

  // Functions
  const openAuthModal = (mode = 'login') => {
    if (auth?.openAuthModal) {
      auth.openAuthModal(mode)
    }
  }

  const checkAuth = async () => {
    try {
      const res = await authAPI.getCurrentUser()
      if (auth?.currentUser && res?.user) {
        auth.currentUser.value = res.user
      }
      return !!res?.user
    } catch (error) {
      console.error('Auth check failed:', error)
      return false
    }
  }

  const handleLogin = async (username, password) => {
    authFormLoading.value = true
    authError.value = ''

    try {
      const response = await authAPI.login(username, password)
      if (response?.user) {
        setCurrentUser(response.user)
        if (auth?.currentUser) auth.currentUser.value = response.user
      }
      return response
    } catch (error) {
      authError.value = error.message
      throw error
    } finally {
      authFormLoading.value = false
    }
  }

  const handleLogout = async () => {
    if (auth?.logout) {
      try { await auth.logout() } catch {}
    }
    try {
      await authAPI.logout()
    } finally {
      setCurrentUser(null)
      if (auth?.currentUser) auth.currentUser.value = null
    }
  }

  const submitAuth = async () => {
    if (!authForm.value.username.trim() || !authForm.value.password) {
      authError.value = '请输入用户名和密码'
      return
    }

    authFormLoading.value = true
    authError.value = ''

    try {
      let response
      if (isLoginMode.value) {
        response = await authAPI.login(authForm.value.username, authForm.value.password)
      } else {
        response = await authAPI.register(authForm.value.username, authForm.value.password)
      }

      if (response?.user) {
        setCurrentUser(response.user)
        if (auth?.currentUser) auth.currentUser.value = response.user
      }

      authForm.value.username = ''
      authForm.value.password = ''

      return response
    } catch (error) {
      authError.value = error.message
      throw error
    } finally {
      authFormLoading.value = false
    }
  }

  return {
    isLoginMode,
    authForm,
    authFormLoading,
    authError,
    isLoggedIn,
    currentUser,
    openAuthModal,
    checkAuth,
    handleLogin,
    handleLogout,
    submitAuth
  }
}