import { ref } from 'vue'

export function useExport(graphPanelRef, currentGraphId, graphs) {
  // State
  const exportLoading = ref(false)

  // Export graph as high-resolution PNG image
  const exportGraphAsImage = async () => {
    if (!graphPanelRef?.value || !currentGraphId?.value) return

    exportLoading.value = true

    try {
      const canvasElement = graphPanelRef.value.getSvgElement()
      const containerElement = graphPanelRef.value.getContainerElement()

      if (!canvasElement) {
        alert('无法获取图谱元素')
        return
      }

      // Create Canvas
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // Ultra high resolution: 3x
      const scale = 3
      const width = containerElement.clientWidth * scale
      const height = containerElement.clientHeight * scale

      canvas.width = width
      canvas.height = height

      // Fill white background
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)

      // Handle high DPI displays
      const dpr = window.devicePixelRatio || 1

      // If it's a Canvas element, export directly
      if (canvasElement.tagName === 'CANVAS') {
        const canvasWidth = canvasElement.width || canvasElement.clientWidth
        const canvasHeight = canvasElement.height || canvasElement.clientHeight

        // If canvas already has sufficient resolution, use it directly
        if (canvasWidth >= containerElement.clientWidth * 2 && canvasHeight >= containerElement.clientHeight * 2) {
          const tempCanvas = document.createElement('canvas')
          tempCanvas.width = canvasWidth
          tempCanvas.height = canvasHeight
          const tempCtx = tempCanvas.getContext('2d')

          // Fill white background
          tempCtx.fillStyle = '#FFFFFF'
          tempCtx.fillRect(0, 0, canvasWidth, canvasHeight)

          // Draw original canvas content
          tempCtx.drawImage(canvasElement, 0, 0)

          // Download image
          const link = document.createElement('a')
          const currentGraph = graphs?.value?.find(g => g.id === currentGraphId.value)
          const graphName = currentGraph?.name || 'graph'
          const timestamp = new Date().toISOString().slice(0, 10)
          link.download = `MonkeyGraph_${graphName}_${timestamp}.png`
          link.href = tempCanvas.toDataURL('image/png')
          link.click()

          exportLoading.value = false
          return
        }

        // If resolution is not enough, scale up manually
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = width
        tempCanvas.height = height
        const tempCtx = tempCanvas.getContext('2d')

        // Fill white background
        tempCtx.fillStyle = '#FFFFFF'
        tempCtx.fillRect(0, 0, width, height)

        // Draw original canvas content (scaled)
        tempCtx.drawImage(canvasElement, 0, 0, canvasElement.clientWidth, canvasElement.clientHeight, 0, 0, width, height)

        // Download image
        const link = document.createElement('a')
        const currentGraph = graphs?.value?.find(g => g.id === currentGraphId.value)
        const graphName = currentGraph?.name || 'graph'
        const timestamp = new Date().toISOString().slice(0, 10)
        link.download = `MonkeyGraph_${graphName}_${timestamp}.png`
        link.href = tempCanvas.toDataURL('image/png')
        link.click()

        exportLoading.value = false
        return
      }

      // If it's an SVG element (legacy compatibility)
      const svgData = new XMLSerializer().serializeToString(canvasElement)

      // Create Image object
      const img = new Image()

      // Convert SVG to Base64
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      img.onload = () => {
        // Draw image (scaled)
        ctx.drawImage(img, 0, 0, width, height)

        // Release URL
        URL.revokeObjectURL(url)

        // Download image
        const link = document.createElement('a')
        const currentGraph = graphs?.value?.find(g => g.id === currentGraphId.value)
        const graphName = currentGraph?.name || 'graph'
        const timestamp = new Date().toISOString().slice(0, 10)
        link.download = `MonkeyGraph_${graphName}_${timestamp}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()

        exportLoading.value = false
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        alert('图片导出失败，请重试')
        exportLoading.value = false
      }

      img.src = url

    } catch (error) {
      console.error('Export image failed:', error)
      alert('导出图片失败: ' + error.message)
      exportLoading.value = false
    }
  }

  return {
    exportLoading,
    exportGraphAsImage
  }
}
