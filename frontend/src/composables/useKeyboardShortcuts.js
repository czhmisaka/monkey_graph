import { onMounted, onUnmounted } from 'vue'

export function useKeyboardShortcuts({
  showSearchModal,
  showNodeModal,
  showConfigModal,
  showGraphModal,
  showSettingsModal,
  selectedNodeData,
  closeNodeModal,
  undo,
  openSearchModal,
  deleteSelectedNode
}) {
  const handleKeydown = (event) => {
    // Ignore shortcuts in input fields
    const target = event.target
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // ESC - Close all modals
    if (event.key === 'Escape') {
      if (showSearchModal?.value) {
        showSearchModal.value = false
        return
      }
      if (showNodeModal?.value) {
        closeNodeModal?.()
        return
      }
      if (showConfigModal?.value) {
        showConfigModal.value = false
        return
      }
      if (showGraphModal?.value) {
        showGraphModal.value = false
        return
      }
      if (showSettingsModal?.value) {
        showSettingsModal.value = false
        return
      }
    }

    // Ctrl+Z - Undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !isInput) {
      event.preventDefault()
      undo?.()
    }

    // Ctrl+F - Search
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault()
      openSearchModal?.()
    }

    // Delete - Delete selected node
    if (event.key === 'Delete' && !isInput && showNodeModal?.value && selectedNodeData?.value?.id) {
      event.preventDefault()
      deleteSelectedNode?.()
    }
  }

  // Setup keyboard listener
  const setupKeyboardListeners = () => {
    window.addEventListener('keydown', handleKeydown)
  }

  // Remove keyboard listener
  const removeKeyboardListeners = () => {
    window.removeEventListener('keydown', handleKeydown)
  }

  // Auto-setup on mount
  onMounted(() => {
    setupKeyboardListeners()
  })

  // Auto-cleanup on unmount
  onUnmounted(() => {
    removeKeyboardListeners()
  })

  return {
    handleKeydown,
    setupKeyboardListeners,
    removeKeyboardListeners
  }
}
