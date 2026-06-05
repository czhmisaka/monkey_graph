<script setup>
import { ref, reactive, watch } from 'vue'
import { authAPI, setToken, setUser } from '../api'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  initialMode: {
    type: String,
    default: 'login' // 'login' or 'register'
  }
})

const emit = defineEmits(['close', 'login-success'])

// 登录/注册模式
const isLoginMode = ref(props.initialMode === 'login')

// 表单数据
const authForm = reactive({
  username: '',
  password: ''
})

// 加载状态
const authLoading = ref(false)

// 错误信息
const authError = ref('')

// 监听 props.show 变化，同步 isLoginMode
watch(() => props.show, (newVal) => {
  if (newVal) {
    isLoginMode.value = props.initialMode === 'login'
    authError.value = ''
    authForm.username = ''
    authForm.password = ''
  }
})

// 提交认证（登录/注册）
const submitAuth = async () => {
  if (!authForm.username.trim() || !authForm.password) {
    authError.value = '请输入用户名和密码'
    return
  }
  
  authLoading.value = true
  authError.value = ''
  
  try {
    let response
    if (isLoginMode.value) {
      response = await authAPI.login(authForm.username, authForm.password)
    } else {
      response = await authAPI.register(authForm.username, authForm.password)
    }
    
    console.log('登录/注册成功:', response)
    
    // 保存 token 和用户信息
    setToken(response.token)
    setUser(response.user)
    
    // 关闭弹窗并重置表单
    emit('close')
    emit('login-success', response.user)
    
    // 重置表单
    authForm.username = ''
    authForm.password = ''
  } catch (error) {
    console.error('登录或注册失败:', error)
    authError.value = error.message
  } finally {
    authLoading.value = false
  }
}

// 关闭弹窗
const closeModal = () => {
  emit('close')
  authError.value = ''
  authForm.username = ''
  authForm.password = ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ isLoginMode ? '登录' : '注册' }}</h3>
          <button class="btn-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>用户名</label>
            <input 
              v-model="authForm.username" 
              type="text" 
              class="input" 
              placeholder="请输入用户名"
              @keyup.enter="submitAuth"
            />
          </div>
          <div class="form-group">
            <label>密码</label>
            <input 
              v-model="authForm.password" 
              type="password" 
              class="input" 
              placeholder="请输入密码"
              @keyup.enter="submitAuth"
            />
          </div>
          <div v-if="authError" class="auth-error">
            {{ authError }}
          </div>
          <div class="form-tip">
            <p v-if="isLoginMode">💡 没有账号？<a href="#" @click.prevent="isLoginMode = false">点击注册</a></p>
            <p v-else>💡 已有账号？<a href="#" @click.prevent="isLoginMode = true">点击登录</a></p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn" @click="submitAuth" :disabled="authLoading">
            {{ authLoading ? '请稍候...' : (isLoginMode ? '登录' : '注册') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal {
  background: var(--color-white, #FFFFFF);
  border-radius: var(--radius-lg, 12px);
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.2));
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-gray-lighter, #E5E7EB);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-gray, #6B7280);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.btn-close:hover {
  color: var(--color-black, #000000);
  background: var(--color-gray-lightest, #F3F4F6);
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-gray-dark, #374151);
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-lighter, #D1D5DB);
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary, #FF4500);
  box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.1);
}

.input::placeholder {
  color: var(--color-gray, #9CA3AF);
}

.auth-error {
  padding: 10px;
  margin-bottom: 12px;
  background: #FEE2E2;
  border: 1px solid #FECACA;
  border-radius: var(--radius-md, 8px);
  color: #DC2626;
  font-size: 13px;
}

.form-tip {
  padding: 12px;
  background: var(--color-gray-lightest, #F3F4F6);
  border-radius: var(--radius-md, 8px);
  font-size: 12px;
  color: var(--color-gray, #6B7280);
}

.form-tip p {
  margin: 0;
}

.form-tip a {
  color: var(--color-primary, #FF4500);
  text-decoration: none;
}

.form-tip a:hover {
  text-decoration: underline;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-gray-lighter, #E5E7EB);
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-gray-lightest, #F3F4F6);
  color: var(--color-black, #000000);
}

.btn:hover {
  background: var(--color-gray-lighter, #E5E7EB);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-gray-lightest, #F3F4F6);
  color: var(--color-gray-dark, #374151);
}

.btn-secondary:hover {
  background: var(--color-gray-lighter, #E5E7EB);
}
</style>