/**
 * 图谱导出工具 - 使用 D3.js 渲染图谱并导出为 PNG
 * 样式与 GraphPanel.vue 保持一致
 */

import * as d3 from 'd3'

// 节点类型颜色映射（与 GraphPanel.vue 一致）
const defaultNodeColors = {
  person: '#4A90D9',
  organization: '#50C878',
  concept: '#9B59B6',
  location: '#F39C12',
  default: '#95A5A6'
}

// 获取节点颜色
const getNodeColor = (type, settings) => {
  if (settings?.nodeTypes?.[type]?.color) {
    return settings.nodeTypes[type].color
  }
  return defaultNodeColors[type] || defaultNodeColors.default
}

// 使用 Node.js 兼容的方式测量文本宽度
// 基于字符平均宽度的简单估算
const getTextWidth = (text, fontSize = 12) => {
  if (!text) return 0
  // 估算：每个字符的平均宽度约为 fontSize * 0.6 + 2
  // 加上一些 padding
  const avgCharWidth = fontSize * 0.6
  return text.length * avgCharWidth + 10
}

// 截断文本（Node.js 兼容版本）
const truncateText = (text, maxWidth, fontSize = 12) => {
  if (!text) return ''
  const avgCharWidth = fontSize * 0.6
  
  let result = ''
  for (const char of text) {
    const width = (result.length + 1) * avgCharWidth + 10
    if (width > maxWidth) {
      break
    }
    result += char
  }
  return result !== text ? result + '...' : result
}

const MAX_NODE_WIDTH = 200

// 字体缩放比例（与 SVG 渲染保持一致）
const FONT_SCALE = 3

// 获取节点大小（用于动态调整力的大小，考虑字体放大）
function getNodeSize(node) {
  const label = node.label || ''
  const type = node.type || 'default'
  const props = node.properties || {}
  
  let content = type
  if (Object.keys(props).length > 0) {
    const firstProp = props[Object.keys(props)[0]]
    content = `${type}: ${typeof firstProp === 'string' ? firstProp : JSON.stringify(firstProp)}`
  }
  
  // 考虑字体放大
  const labelWidth = getTextWidth(label, 12 * FONT_SCALE)
  const contentWidth = getTextWidth(content, 10 * FONT_SCALE)
  const rawMaxWidth = Math.max(labelWidth, contentWidth) + 20 * FONT_SCALE
  const maxWidth = Math.min(rawMaxWidth, MAX_NODE_WIDTH * FONT_SCALE)
  
  return Math.max(maxWidth / 2, 22 * FONT_SCALE)
}

// 生成边的 SVG 路径
const getEdgePath = (source, target) => {
  if (!source || !target) return ''
  
  const sx = source.x || 0
  const sy = source.y || 0
  const tx = target.x || 0
  const ty = target.y || 0
  
  // 自环
  if (source.id === target.id) {
    return `M ${sx} ${sy - 25} 
            C ${sx - 40} ${sy - 60}, ${sx + 40} ${sy - 60}, ${sx} ${sy - 25}`
  }
  
  // 直线
  return `M ${sx} ${sy} L ${tx} ${ty}`
}

/**
 * 使用 D3 渲染图谱并返回 SVG 字符串
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {Object} settings - 配置
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {string} SVG 字符串
 */
export function renderGraphToSVG(nodes, edges, settings = {}, width = 1920, height = 1080) {
  // 准备节点数据
  let nodesWithPositions = nodes.map(n => ({
    ...n,
    x: n.x || Math.random() * width,
    y: n.y || Math.random() * height
  }))
  
  // 检查节点位置是否有效（如果有位置且范围合理）
  const hasValidPositions = nodesWithPositions.every(n => 
    typeof n.x === 'number' && typeof n.y === 'number' && 
    !isNaN(n.x) && !isNaN(n.y)
  )
  
  // 计算节点位置的范围
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  nodesWithPositions.forEach(n => {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y)
    maxY = Math.max(maxY, n.y)
  })
  const rangeX = maxX - minX
  const rangeY = maxY - minY
  
  // 方案1+2: 使用 D3.js force layout + 8K 画布 + 不缩放
  console.log(`[图谱导出] 使用 D3.js Force Layout，节点数: ${nodesWithPositions.length}`)
  
  // 使用 8K 画布让节点更舒展
  const largeWidth = 7680   // 8K 宽度
  const largeHeight = 4320  // 8K 高度
  
  // 使用 D3 force layout，多次迭代让节点更舒展（不缩放）
  nodesWithPositions = runD3ForceLayout(nodesWithPositions, edges, largeWidth, largeHeight, 120)
  
  // 生成 SVG - 使用 8K 尺寸（不缩放）
  // 字体大小放大 3 倍以适应 8K 分辨率（12px -> 36px, 10px -> 30px, 9px -> 27px）
  const fontScale = 3
  const nodeLabelSize = 12 * fontScale
  const nodeContentSize = 10 * fontScale
  const linkLabelSize = 9 * fontScale
  const nodeHeight = 44 * fontScale
  const nodeY = -22 * fontScale
  const nodeBoxPadding = 8 * fontScale
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${largeWidth}" height="${largeHeight}" viewBox="0 0 ${largeWidth} ${largeHeight}">
  <defs>
    <marker id="arrow" viewBox="0 -5 10 10" refX="20" refY="0" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M0,-5L10,0L0,5" fill="#999"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="white"/>
  <g class="graph-container">
`
  
  // 绘制边
  edges.forEach(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    const source = nodesWithPositions.find(n => n.id === sourceId)
    const target = nodesWithPositions.find(n => n.id === targetId)
    
    if (source && target) {
      const path = getEdgePath(source, target)
      const label = edge.label || ''
      const labelWidth = getTextWidth(label, linkLabelSize)
      const mx = (source.x + target.x) / 2
      const my = (source.y + target.y) / 2
      
      svg += `    <path class="link" d="${path}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#arrow)"/>
`
      if (label) {
        svg += `    <g class="link-label-group" transform="translate(${mx}, ${my - 8 * fontScale})">
      <rect class="link-label-bg" x="${-labelWidth/2}" y="-8" width="${Math.max(30 * fontScale, labelWidth)}" height="${16 * fontScale}" fill="white" stroke="#ddd" stroke-width="1" rx="4"/>
      <text class="link-label" text-anchor="middle" dy="0.35em" font-size="${linkLabelSize}px" fill="#666">${label}</text>
    </g>
`
      }
    }
  })
  
  // 绘制节点
  nodesWithPositions.forEach(node => {
    const color = getNodeColor(node.type, settings)
    const label = node.label || ''
    const type = node.type || 'default'
    const props = node.properties || {}
    
    let content = type
    if (Object.keys(props).length > 0) {
      const firstProp = props[Object.keys(props)[0]]
      content = `${type}: ${typeof firstProp === 'string' ? firstProp : JSON.stringify(firstProp)}`
    }
    
    const labelWidth = getTextWidth(label, nodeLabelSize)
    const contentWidth = getTextWidth(content, nodeContentSize)
    const rawMaxWidth = Math.max(labelWidth, contentWidth) + 20 * fontScale
    const maxWidth = Math.min(rawMaxWidth, MAX_NODE_WIDTH * fontScale)
    
    const truncatedLabel = truncateText(label, MAX_NODE_WIDTH * fontScale, nodeLabelSize)
    const truncatedContent = truncateText(content, MAX_NODE_WIDTH * fontScale, nodeContentSize)
    
    svg += `    <g class="node" transform="translate(${node.x}, ${node.y})">
      <rect class="node-bg" x="${-maxWidth/2}" y="${nodeY}" width="${maxWidth}" height="${nodeHeight}" rx="8" fill="white" stroke="${color}" stroke-width="2"/>
      <text class="node-label" text-anchor="middle" dy="${-4 * fontScale}" font-size="${nodeLabelSize}px" font-weight="600" fill="${color}">${truncatedLabel}</text>
      <text class="node-content" text-anchor="middle" dy="${14 * fontScale}" font-size="${nodeContentSize}px" fill="#888">${truncatedContent}</text>
    </g>
`
  })
  
  svg += `  </g>
</svg>`
  
  return svg
}

/**
 * D3.js Force Layout - 使用 d3-force 模块进行布局（与前端一致）
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} iterations - 迭代次数
 * @returns {Array} 布局后的节点数组
 */
function runD3ForceLayout(nodes, edges, width, height, iterations = 800) {
  if (nodes.length === 0) return nodes
  
  console.log(`[D3 Force] 开始布局: ${nodes.length} 节点, ${iterations} 次迭代, ${width}x${height} 画布`)
  
  // 复制节点避免修改原始数据
  const nodeData = nodes.map(n => ({ ...n }))
  
  // 准备边数据
  const linkData = edges.map(e => ({
    source: e.source?.id || e.source,
    target: e.target?.id || e.target
  })).filter(e => e.source && e.target)
  
  // 创建 simulation（与前端 GraphPanel.vue 一致）
  const simulation = d3.forceSimulation(nodeData)
    // 速度衰减
    .velocityDecay(0.4)
    // 边连接力（距离70）
    .force('link', d3.forceLink(linkData)
      .id(d => d.id)
      .distance(70)
      .strength(0.3))
    // 斥力（动态：根据节点大小 * 4）
    .force('charge', d3.forceManyBody().strength(d => -getNodeSize(d) * 4))
    // 中心引力（0.15）
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))
    // 碰撞检测（节点大小 + 20）
    .force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 20))
    // 径向引力（0.08）
    .force('radial', d3.forceRadial(
      Math.min(width, height) / 4,
      width / 2,
      height / 2
    ).strength(0.08))
  
  // 运行模拟（同步执行）
  simulation.tick(iterations)
  
  // 停止模拟
  simulation.stop()
  
  // 更新原始节点的位置
  nodes.forEach((node, i) => {
    if (nodeData[i]) {
      node.x = nodeData[i].x || node.x
      node.y = nodeData[i].y || node.y
    }
  })
  
  console.log(`[D3 Force] 布局完成`)
  
  return nodes
}

/**
 * 居中和缩放图谱以充满画布
 * @param {Array} nodes - 节点数组
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @returns {Array} 调整后的节点数组
 */
function centerAndScaleGraph(nodes, canvasWidth, canvasHeight) {
  if (!nodes || nodes.length === 0) return nodes
  
  // 计算节点的实际边界（使用节点的位置，不加额外边距）
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  nodes.forEach(node => {
    const x = node.x || 0
    const y = node.y || 0
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  })
  
  // 如果所有节点都在同一位置，给一个默认范围
  if (minX === maxX) { minX -= 100; maxX += 100 }
  if (minY === maxY) { minY -= 100; maxY += 100 }
  
  // 添加节点尺寸作为边距
  const nodeMargin = 60 // 节点周围的空间
  minX -= nodeMargin
  minY -= nodeMargin
  maxX += nodeMargin
  maxY += nodeMargin
  
  // 计算图谱实际尺寸
  const graphWidth = maxX - minX
  const graphHeight = maxY - minY
  
  // 计算缩放比例（留出 5% 边距）
  const scaleX = canvasWidth / graphWidth
  const scaleY = canvasHeight / graphHeight
  const scale = Math.min(scaleX, scaleY) * 0.95 // 95% 使用画布
  
  // 计算居中偏移
  const scaledWidth = graphWidth * scale
  const scaledHeight = graphHeight * scale
  const offsetX = (canvasWidth - scaledWidth) / 2 - minX * scale
  const offsetY = (canvasHeight - scaledHeight) / 2 - minY * scale
  
  // 应用变换
  return nodes.map(node => ({
    ...node,
    x: (node.x || 0) * scale + offsetX,
    y: (node.y || 0) * scale + offsetY
  }))
}

/**
 * 将 SVG 转换为 PNG (Node.js 版本使用 sharp)
 * @param {string} svgString - SVG 字符串
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {number} scale - 缩放比例
 * @returns {Promise<Uint8Array>} PNG 数据
 */
export async function svgToPNG(svgString, width = 1920, height = 1080, scale = 1) {
  // 动态导入 sharp
  const sharp = (await import('sharp')).default
  
  // 创建 SVG Buffer
  const svgBuffer = Buffer.from(svgString)
  
  // 使用 sharp 转换 SVG 到 PNG
  const pngBuffer = await sharp(svgBuffer, {
    density: 72 * scale // 根据缩放调整清晰度
  })
    .resize(Math.floor(width * scale), Math.floor(height * scale), {
      fit: 'fill',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer()
  
  return new Uint8Array(pngBuffer)
}

/**
 * 导出图谱为 PNG
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {Object} settings - 配置
 * @param {Object} options - 导出选项 { width, height, scale }
 * @returns {Promise<Uint8Array>} PNG 数据
 */
export async function exportGraphToPNG(nodes, edges, settings = {}, options = {}) {
  const { width = 1920, height = 1080, scale = 1 } = options
  
  // 渲染 SVG
  const svgString = renderGraphToSVG(nodes, edges, settings, width, height)
  
  // 转换为 PNG
  const pngBuffer = await svgToPNG(svgString, width, height, scale)
  
  return pngBuffer
}

export default {
  renderGraphToSVG,
  svgToPNG,
  exportGraphToPNG
}