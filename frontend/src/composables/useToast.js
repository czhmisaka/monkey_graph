/**
 * 全局 Toast 通知 composable
 * 使用方式：
 * import { useToast } from '@/composables/useToast'
 * const toast = useToast()
 * toast.success('操作成功！')
 * toast.error('出错了')
 */

let toastComponent = null

export function setToastInstance(instance) {
  toastComponent = instance
}

export function useToast() {
  if (!toastComponent) {
    console.warn('[Toast] Toast 实例未初始化')
    return {
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
      addToast: () => {}
    }
  }
  
  return {
    success: (message, duration) => toastComponent.success(message, duration),
    error: (message, duration) => toastComponent.error(message, duration),
    warning: (message, duration) => toastComponent.warning(message, duration),
    info: (message, duration) => toastComponent.info(message, duration),
    addToast: (message, type, duration) => toastComponent.addToast(message, type, duration)
  }
}
