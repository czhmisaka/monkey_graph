import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 自定义日志插件 - 添加前端前缀
function logPlugin() {
  return {
    name: 'log-prefix-plugin',
    configureServer(server) {
      server.printUrls = () => {
        const prefix = '【前端】';
        if (server.resolvedUrls.local.length > 0) {
          console.log(`\n${prefix}   ➜  Local:   ${server.resolvedUrls.local[0]}`)
        }
        if (server.resolvedUrls.network.length > 0) {
          console.log(`${prefix}   ➜  Network: ${server.resolvedUrls.network[0]}`)
        }
        console.log(`${prefix}`)
      }
    },
    closeBundle() {
      console.log('【前端】构建完成')
    }
  }
}

// 图谱导出插件
function graphExportPlugin() {
  return {
    name: 'graph-export-plugin',
    configureServer(server) {
      // 处理图谱导出请求
      server.middlewares.use('/api/export/png', async (req, res) => {
        try {
          // 设置 CORS 头
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
          
          if (req.method === 'OPTIONS') {
            res.writeHead(204)
            res.end()
            return
          }
          
          let nodes, edges, width, height, scale
          
          if (req.method === 'POST') {
            // POST 请求：接收图谱数据
            const body = await new Promise((resolve, reject) => {
              let data = ''
              req.on('data', chunk => data += chunk)
              req.on('end', () => resolve(JSON.parse(data)))
              req.on('error', reject)
            })
            
            nodes = body.nodes
            edges = body.edges || []
            width = body.width || 7680
            height = body.height || 4320
            scale = body.scale || 1
            
            console.log(`[图谱导出] 收到导出请求 (POST): ${nodes?.length || 0} 个节点, ${width}x${height}`)
          } else {
            // GET 请求：从后端获取图谱数据（兼容旧方式）
            const url = new URL(req.url, `http://${req.headers.host}`)
            const graphId = url.searchParams.get('graphId')
            width = parseInt(url.searchParams.get('width')) || 7680
            height = parseInt(url.searchParams.get('height')) || 4320
            scale = parseFloat(url.searchParams.get('scale')) || 1
            
            if (!graphId) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'graphId 参数不能为空' }))
              return
            }
            
            console.log(`[图谱导出] 收到导出请求: graphId=${graphId}, ${width}x${height}`)
            
            // 从后端获取图谱数据
            const backendUrl = `http://localhost:13001/api/graphs/${graphId}/graph`
            const response = await fetch(backendUrl)
            
            if (!response.ok) {
              throw new Error(`获取图谱数据失败: ${response.status}`)
            }
            
            const graphData = await response.json()
            nodes = graphData.nodes
            edges = graphData.edges || []
          }
          
          if (!nodes || nodes.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: '图谱中没有节点' }))
            return
          }
          
          console.log(`[图谱导出] 图谱数据: ${nodes.length} 个节点, ${edges?.length || 0} 条边`)
          
          // 动态导入导出模块
          const graphExporter = await import('./src/utils/graphExporter.js')
          const { renderGraphToSVG, svgToPNG } = graphExporter
          
          // 渲染 SVG
          const svgString = renderGraphToSVG(nodes, edges || [], {}, width, height)
          
          // 转换为 PNG
          const pngBuffer = await svgToPNG(svgString, width, height, scale)
          
          // 返回 PNG
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': pngBuffer.length,
            'Content-Disposition': 'attachment; filename="graph-export.png"'
          })
          res.end(Buffer.from(pngBuffer))
          
          console.log(`[图谱导出] 导出成功: ${pngBuffer.length} bytes`)
        } catch (error) {
          console.error('[图谱导出] 导出失败:', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: error.message }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), logPlugin(), graphExportPlugin()],
  server: {
    port: 13002,
    host: process.env.HOST === '0.0.0.0' ? '0.0.0.0' : false,
    proxy: {
      '/api': {
        target: 'http://localhost:13001',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'editor-vendor': ['marked', 'dompurify'],
          'chart-vendor': ['echarts'],
          'd3-vendor': ['d3'],
          'three-vendor': ['three']
        }
      }
    }
  }
})
