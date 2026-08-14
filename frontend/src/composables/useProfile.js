import { ref, reactive } from 'vue'
import { authAPI } from '../api'

/**
 * 用户资料弹窗：表单状态与保存逻辑。
 * auth 来自 Home.vue 注入的全局 auth（inject('auth')）。
 */
export function useProfile(auth) {
  // Profile modal
  const showProfileModal = ref(false)
  const profileForm = reactive({
    avatar: '',
    bio: ''
  })
  const profileLoading = ref(false)

  const openProfileModal = async () => {
    if (!auth?.currentUser?.value) return
    profileForm.avatar = auth.currentUser.value.avatar || ''
    profileForm.bio = auth.currentUser.value.bio || ''
    showProfileModal.value = true
  }

  const saveProfile = async () => {
    profileLoading.value = true
    try {
      const response = await authAPI.updateProfile({
        avatar: profileForm.avatar,
        bio: profileForm.bio
      })
      if (auth?.currentUser) {
        auth.currentUser.value = { ...auth.currentUser.value, ...response.user }
      }
      showProfileModal.value = false
      alert('资料保存成功！')
    } catch (error) {
      alert('保存失败: ' + error.message)
    } finally {
      profileLoading.value = false
    }
  }

  return {
    showProfileModal,
    profileForm,
    profileLoading,
    openProfileModal,
    saveProfile
  }
}
