import { ref, computed, inject } from 'vue'
import { authAPI, setToken, clearToken, setUser, getUser, getToken } from '../api'

export function useAuth() {
  const auth = inject('auth')

  // State
  const isLoginMode = ref(true)
  const authForm = ref({
    username: '',
    password: ''
  })
  const authFormLoading = ref(false)
  const authError = ref('')

  // Computed
  const isLoggedIn = computed(() => !!auth?.currentUser?.value)
  const currentUser = computed(() => auth?.currentUser?.value || null)
  const token = computed(() => getToken())

  // Functions
  const openAuthModal = (mode = 'login') => {
    if (auth?.openAuthModal) {
      auth.openAuthModal(mode)
    }
  }

  const checkAuth = async () => {
    if (!getToken()) {
      return false
    }
    try {
      const user = await authAPI.getCurrentUser()
      if (auth?.currentUser) {
        auth.currentUser.value = user
      }
      return true
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

      // Save token and user info
      setToken(response.token)
      setUser(response.user)

      // Sync to global auth
      if (auth?.currentUser) {
        auth.currentUser.value = response.user
      }

      return response
    } catch (error) {
      authError.value = error.message
      throw error
    } finally {
      authFormLoading.value = false
    }
  }

  const handleLogout = () => {
    if (auth?.logout) {
      auth.logout()
    }
    clearToken()
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

      // Save token and user info
      setToken(response.token)
      setUser(response.user)

      // Sync to global auth
      if (auth?.currentUser) {
        auth.currentUser.value = response.user
      }

      // Reset form
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
    // State
    auth,
    isLoginMode,
    authForm,
    authFormLoading,
    authError,
    // Computed
    isLoggedIn,
    currentUser,
    token,
    // Functions
    openAuthModal,
    checkAuth,
    handleLogin,
    handleLogout,
    submitAuth
  }
}
