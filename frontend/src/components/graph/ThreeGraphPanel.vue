<template>
  <div class="three-graph-panel" ref="containerRef">
    <canvas ref="canvasRef" class="three-canvas"></canvas>
    
    <!-- 节点详情提示框 -->
    <div v-if="hoveredNode" 
         class="node-tooltip"
         :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-title">{{ hoveredNode.label }}</div>
      <div class="tooltip-type">{{ hoveredNode.type }}</div>
      <div class="tooltip-degree">
        <span class="degree-icon">✧</span>
        <span>连接数: {{ getNodeDegree(hoveredNode) }}</span>
      </div>
    </div>
    
    <!-- 控制提示 -->
    <div class="control-hint">
      🖱️ 拖拽旋转 · 滚轮缩放 · 点击节点查看详情
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { graphAPI } from '../../api/index.js'

const props = defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  edges: {
    type: Array,
    default: () => []
  },
  settings: {
    type: Object,
    default: () => ({ nodeTypes: {}, edgeTypes: {} })
  }
})

const emit = defineEmits(['node-click', 'edge-click', 'refresh', 'loaded'])

// DOM 引用
const containerRef = ref(null)
const canvasRef = ref(null)

// Three.js 变量
let scene = null
let camera = null
let renderer = null
let controls = null
let particles = null
let raycaster = null
let mouse = null

// 节点数据
let nodesData = []
let nodeDegrees = new Map()
let nodeMeshes = new Map()
let nodeMeshesGroup = null  // 用于统一管理交互球体，跟随粒子旋转

// 状态
const hoveredNode = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
const selectedNode = ref(null)

// 流式加载状态
const streamingNodes = ref([])
const streamingEdges = ref([])
const loadProgress = ref({ loaded: 0, total: 0 })

// 获取节点颜色 - 强制返回白色，忽略 settings 配置
const getNodeColor = (type) => {
  // 星云模式强制使用白色，忽略所有 settings 配置
  return '#FFFFFF'
}

// 计算节点度数（连接数）
const calculateDegrees = () => {
  nodeDegrees.clear()
  
  props.nodes.forEach(node => {
    nodeDegrees.set(node.id, 0)
  })
  
  props.edges.forEach(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    
    if (nodeDegrees.has(sourceId)) {
      nodeDegrees.set(sourceId, nodeDegrees.get(sourceId) + 1)
    }
    if (nodeDegrees.has(targetId)) {
      nodeDegrees.set(targetId, nodeDegrees.get(targetId) + 1)
    }
  })
}

// 获取节点度数
const getNodeDegree = (node) => {
  return nodeDegrees.get(node.id) || 0
}

// 获取归一化的亮度值 [0.5, 1.0]
const getNormalizedBrightness = (degree) => {
  const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1)
  const normalized = degree / maxDegree
  return 0.5 + normalized * 0.5 // 范围 [0.5, 1.0]，基础亮度提高让所有节点都可见
}

// 初始化 Three.js 场景
const initScene = () => {
  if (!containerRef.value || !canvasRef.value) return
  
  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight
  
  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0a0f) // 深空背景
  
  // 创建相机
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000)
  camera.position.z = 500
  
  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvasRef.value,
    antialias: true,
    alpha: true
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  
  // 添加雾效果营造深度感
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.0008)
  
  // 添加星空背景
  addStarfield()
  
  // 创建粒子系统
  createParticles()
  
  // 创建 OrbitControls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 100
  controls.maxDistance = 1500
  controls.enablePan = true
  controls.panSpeed = 0.5
  
  // 初始化 Raycaster
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()
  
  // 添加事件监听
  canvasRef.value.addEventListener('mousemove', onMouseMove)
  canvasRef.value.addEventListener('click', onClick)
  
  // 开始动画循环
  animate()
}

// 添加星空背景
const addStarfield = () => {
  const starGeometry = new THREE.BufferGeometry()
  const starCount = 2000
  const positions = new Float32Array(starCount * 3)
  
  for (let i = 0; i < starCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 3000
    positions[i + 1] = (Math.random() - 0.5) * 3000
    positions[i + 2] = (Math.random() - 0.5) * 3000
  }
  
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  })
  
  const stars = new THREE.Points(starGeometry, starMaterial)
  scene.add(stars)
}

// 创建粒子系统
const createParticles = () => {
  // 清除旧粒子
  if (particles) {
    scene.remove(particles)
    particles.geometry.dispose()
    particles.material.dispose()
  }
  
  // 清除旧的交互球体组
  if (nodeMeshesGroup) {
    scene.remove(nodeMeshesGroup)
    nodeMeshesGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    })
  }
  
  nodeMeshes.clear()
  
  if (nodesData.length === 0) return
  
  // 创建粒子几何体
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(nodesData.length * 3)
  const colors = new Float32Array(nodesData.length * 3)
  const sizes = new Float32Array(nodesData.length)
  
  // 初始化粒子数据
  nodesData.forEach((node, i) => {
    const degree = getNodeDegree(node)
    const brightness = getNormalizedBrightness(degree)
    
    // 随机球形分布 - 减小初始半径
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 50 + Math.random() * 50  // 减小到 50~100
    
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    
    // 节点颜色
    const color = new THREE.Color(getNodeColor(node.type))
    colors[i * 3] = color.r * brightness
    colors[i * 3 + 1] = color.g * brightness
    colors[i * 3 + 2] = color.b * brightness
    
    // 节点大小根据度数变化，范围 10~60
    const baseSize = 10
    const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1)
    const sizeBoost = 50 * (degree / maxDegree)
    sizes[i] = baseSize + sizeBoost
  })
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  
  // 自定义 ShaderMaterial 实现发光效果
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float time;
      
      void main() {
        vColor = color;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // 添加微小的呼吸动画
        float breathe = 1.0 + sin(time * 2.0 + position.x * 0.01) * 0.1;
        
        gl_PointSize = size * breathe * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      
      void main() {
        // 创建圆形粒子
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        
        if (dist > 0.5) discard;
        
        // 更强的发光效果
        float glow = 1.0 - dist * 2.0;
        glow = pow(glow, 1.2); // 增强光晕扩散
        
        // 核心更亮更大
        float core = 1.0 - smoothstep(0.0, 0.3, dist);
        
        // 外层光晕
        float outerGlow = 1.0 - smoothstep(0.3, 0.5, dist);
        
        vec3 finalColor = vColor * (glow + core * 0.8 + outerGlow * 0.3);
        float alpha = glow * 0.9 + core * 0.1;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  
  particles = new THREE.Points(geometry, material)
  scene.add(particles)
  
  // 创建交互球体组，统一管理所有交互检测球体
  nodeMeshesGroup = new THREE.Group()
  scene.add(nodeMeshesGroup)
  
  // 为每个节点创建独立的发光球体用于交互检测
  nodesData.forEach((node, i) => {
    const degree = getNodeDegree(node)
    const brightness = getNormalizedBrightness(degree)
    
    const sphereGeometry = new THREE.SphereGeometry(
      2 + (degree / Math.max(...Array.from(nodeDegrees.values()), 1)) * 5,
      8, 8
    )
    
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(getNodeColor(node.type)).multiplyScalar(brightness),
      transparent: true,
      opacity: 0
    })
    
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.set(
      particles.geometry.attributes.position.array[i * 3],
      particles.geometry.attributes.position.array[i * 3 + 1],
      particles.geometry.attributes.position.array[i * 3 + 2]
    )
    sphere.userData = { node }
    
    // 添加到 Group 中，而不是直接添加到 scene
    nodeMeshesGroup.add(sphere)
    nodeMeshes.set(node.id, sphere)
  })
}

// 3D 力导向布局
const runForceSimulation = () => {
  if (nodesData.length === 0) return
  
  // 简化的 3D 力导向模拟 - 调整参数让节点更紧凑
  const iterations = 100
  const repulsion = 1500  // 减小斥力，节点不会散得太开
  const attraction = 0.05  // 增加吸引力，边连接的节点更近
  const centerForce = 0.05  // 增加向心力，聚集到中心
  for (let iter = 0; iter < iterations; iter++) {
    // 计算排斥力（所有节点互相排斥）
    for (let i = 0; i < nodesData.length; i++) {
      for (let j = i + 1; j < nodesData.length; j++) {
        const nodeA = nodesData[i]
        const nodeB = nodesData[j]
        
        const dx = nodeB.x - nodeA.x
        const dy = nodeB.y - nodeA.y
        const dz = nodeB.z - nodeA.z
        const distSq = dx * dx + dy * dy + dz * dz + 0.01
        const dist = Math.sqrt(distSq)
        
        // 斥力
        const force = repulsion / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        const fz = (dz / dist) * force
        
        nodeA.vx -= fx
        nodeA.vy -= fy
        nodeA.vz -= fz
        
        nodeB.vx += fx
        nodeB.vy += fy
        nodeB.vz += fz
      }
    }
    
    // 计算吸引力（边连接的节点互相吸引）
    props.edges.forEach(edge => {
      const sourceId = edge.source?.id || edge.source
      const targetId = edge.target?.id || edge.target
      
      const sourceNode = nodesData.find(n => n.id === sourceId)
      const targetNode = nodesData.find(n => n.id === targetId)
      
      if (sourceNode && targetNode) {
        const dx = targetNode.x - sourceNode.x
        const dy = targetNode.y - sourceNode.y
        const dz = targetNode.z - sourceNode.z
        
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01
        
        const force = dist * attraction
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        const fz = (dz / dist) * force
        
        sourceNode.vx += fx
        sourceNode.vy += fy
        sourceNode.vz += fz
        
        targetNode.vx -= fx
        targetNode.vy -= fy
        targetNode.vz -= fz
      }
    })
    
    // 向心力（将节点拉向中心）
    nodesData.forEach(node => {
      node.vx -= node.x * centerForce
      node.vy -= node.y * centerForce
      node.vz -= node.z * centerForce
    })
    
    // 应用速度并限制
    nodesData.forEach(node => {
      node.vx *= 0.9
      node.vy *= 0.9
      node.vz *= 0.9
      
      node.x += node.vx
      node.y += node.vy
      node.z += node.vz
    })
  }
  
  // 更新粒子位置
  updateParticlePositions()
}

// 更新粒子位置
const updateParticlePositions = () => {
  if (!particles || nodesData.length === 0) return
  
  const positions = particles.geometry.attributes.position.array
  const colors = particles.geometry.attributes.color.array
  const sizes = particles.geometry.attributes.size.array
  
  nodesData.forEach((node, i) => {
    positions[i * 3] = node.x
    positions[i * 3 + 1] = node.y
    positions[i * 3 + 2] = node.z
    
    // 更新颜色（根据度数）
    const degree = getNodeDegree(node)
    const brightness = getNormalizedBrightness(degree)
    const color = new THREE.Color(getNodeColor(node.type))
    colors[i * 3] = color.r * brightness
    colors[i * 3 + 1] = color.g * brightness
    colors[i * 3 + 2] = color.b * brightness
    
    // 更新大小，与 createParticles 保持一致
    const baseSize = 10
    const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1)
    const sizeBoost = 50 * (degree / maxDegree)
    sizes[i] = baseSize + sizeBoost
    
    // 更新交互球体位置
    const sphere = nodeMeshes.get(node.id)
    if (sphere) {
      sphere.position.set(node.x, node.y, node.z)
    }
  })
  
  particles.geometry.attributes.position.needsUpdate = true
  particles.geometry.attributes.color.needsUpdate = true
  particles.geometry.attributes.size.needsUpdate = true
}

// 动画循环（rAF id 用于卸载时停止）
let animationFrameId = null
const animate = () => {
  animationFrameId = requestAnimationFrame(animate)
  
  // 更新控制
  controls.update()
  
  // 更新 shader 时间
  if (particles && particles.material.uniforms) {
    particles.material.uniforms.time.value += 0.016
  }
  
  // 旋转粒子系统和交互球体组（缓慢自转，保持同步）
  if (particles) {
    particles.rotation.y += 0.0002
  }
  
  // 同步旋转交互球体组，使其与粒子系统保持一致
  if (nodeMeshesGroup) {
    nodeMeshesGroup.rotation.y = particles ? particles.rotation.y : 0
  }
  
  renderer.render(scene, camera)
}

// 鼠标移动处理
const onMouseMove = (event) => {
  const rect = canvasRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  
  // Raycaster 检测
  raycaster.setFromCamera(mouse, camera)
  
  const intersects = raycaster.intersectObjects(Array.from(nodeMeshes.values()))
  
  if (intersects.length > 0) {
    const intersect = intersects[0]
    const node = intersect.object.userData.node
    
    if (hoveredNode.value?.id !== node.id) {
      hoveredNode.value = node
      tooltipPos.value = {
        x: event.clientX - rect.left + 15,
        y: event.clientY - rect.top + 15
      }
      
      // 高亮效果
      nodeMeshes.forEach((mesh, id) => {
        if (id === node.id) {
          mesh.material.opacity = 0.3
        } else {
          mesh.material.opacity = 0
        }
      })
    }
    
    canvasRef.value.style.cursor = 'pointer'
  } else {
    hoveredNode.value = null
    nodeMeshes.forEach(mesh => {
      mesh.material.opacity = 0
    })
    canvasRef.value.style.cursor = 'grab'
  }
}

// 点击处理
const onClick = (event) => {
  if (hoveredNode.value) {
    selectedNode.value = hoveredNode.value
    emit('node-click', hoveredNode.value)
  }
}

// 更新图谱数据
const updateGraph = () => {
  calculateDegrees()
  
  nodesData = props.nodes.map(n => {
    // 球形随机初始化 - 减小初始半径让节点更紧凑
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 50 + Math.random() * 50  // 减小到 50~100
    
    return {
      ...n,
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      vx: 0,
      vy: 0,
      vz: 0
    }
  })
  
  if (nodesData.length > 0) {
    runForceSimulation()
  }
  
  createParticles()
}

// 窗口大小变化
let resizeObserver = null

onMounted(() => {
  nextTick(() => {
    initScene()
    updateGraph()
  })
  
  resizeObserver = new ResizeObserver(() => {
    if (containerRef.value && camera && renderer) {
      const width = containerRef.value.clientWidth
      const height = containerRef.value.clientHeight
      
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      
      renderer.setSize(width, height)
    }
  })
  
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  // 停止动画循环（防止卸载后持续空转）
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  if (resizeObserver) resizeObserver.disconnect()
  
  // 清理事件监听
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('mousemove', onMouseMove)
    canvasRef.value.removeEventListener('click', onClick)
  }
  
  // 清理 Three.js 对象
  if (particles) {
    particles.geometry.dispose()
    particles.material.dispose()
  }
  
  nodeMeshes.forEach(mesh => {
    mesh.geometry.dispose()
    mesh.material.dispose()
  })
  
  if (renderer) {
    renderer.dispose()
  }
  
  if (controls) {
    controls.dispose()
  }
})

// ========== 流式加载功能 ==========

/**
 * 流式加载图谱数据
 * 使用 SSE 分批获取节点和边，实时更新可视化
 */
const loadGraphStream = async (id, onBatch, onProgress) => {
  streamingNodes.value = []
  streamingEdges.value = []
  loadProgress.value = { loaded: 0, total: 0 }

  try {
    console.log('[ThreeGraphPanel] 开始流式加载图谱', id)
    
    await graphAPI.getGraphStream(
      id,
      // 每批数据回调
      (data) => {
        if (data.type === 'nodes_batch') {
          // 添加新节点
          streamingNodes.value.push(...data.batch)
          // 立即更新可视化
          updateGraphWithStreamingData()
        } else if (data.type === 'edges_batch') {
          // 添加新边
          streamingEdges.value.push(...data.batch)
          // 更新边的可视化
          updateGraphWithStreamingData()
        }
      },
      // 进度回调
      (loaded, total, type) => {
        loadProgress.value = { loaded, total }
        if (onProgress) {
          onProgress(loaded, total, type)
        }
      }
    )
    
    console.log(`[ThreeGraphPanel] 流式加载完成: ${streamingNodes.value.length} 节点, ${streamingEdges.value.length} 边`)
    
    // 加载完成后，通过 emit 通知 Home.vue 更新 graphData
    // 这样节点详情弹窗中的小型图谱才能正确显示关联边
    const emitData = {
      nodes: [...streamingNodes.value],
      edges: [...streamingEdges.value]
    }
    console.log('[ThreeGraphPanel] 准备发送 loaded 事件:', { 
      nodesCount: emitData.nodes.length, 
      edgesCount: emitData.edges.length 
    })
    emit('loaded', emitData)
    console.log('[ThreeGraphPanel] loaded 事件已发送')
  } catch (error) {
    console.error('[ThreeGraphPanel] 流式加载失败:', error)
    throw error
  }
}

/**
 * 使用流式数据更新图谱
 */
const updateGraphWithStreamingData = () => {
  const allNodes = streamingNodes.value
  const allEdges = streamingEdges.value
  
  if (allNodes.length === 0) return
  
  // 计算度数
  const tempDegrees = new Map()
  allNodes.forEach(node => tempDegrees.set(node.id, 0))
  allEdges.forEach(edge => {
    const sourceId = edge.source?.id || edge.source
    const targetId = edge.target?.id || edge.target
    if (tempDegrees.has(sourceId)) tempDegrees.set(sourceId, tempDegrees.get(sourceId) + 1)
    if (tempDegrees.has(targetId)) tempDegrees.set(targetId, tempDegrees.get(targetId) + 1)
  })
  
  // 更新节点数据
  nodesData = allNodes.map(n => {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 50 + Math.random() * 50  // 减小到 50~100
    return {
      ...n,
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      vx: 0, vy: 0, vz: 0
    }
  })
  
  // 更新边数据（临时使用）
  // 注意：Three.js 3D 视图目前不绘制边，只显示节点
  
  // 运行力模拟
  if (nodesData.length > 0) {
    // 重新计算度数
    nodeDegrees.clear()
    allEdges.forEach(edge => {
      const sourceId = edge.source?.id || edge.source
      const targetId = edge.target?.id || edge.target
      nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1)
      nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1)
    })
    
    runForceSimulation()
    createParticles()
  }
}

// 监听数据变化
watch(() => props.nodes, () => {
  nextTick(updateGraph)
}, { deep: true })

watch(() => props.edges, () => {
  nextTick(() => {
    calculateDegrees()
    updateParticlePositions()
  })
}, { deep: true })

// 暴露方法
defineExpose({
  setGraphId: (id) => {},
  getSelectedNode: () => selectedNode.value,
  getSvgElement: () => canvasRef.value,
  getContainerElement: () => containerRef.value,
  loadGraphStream
})
</script>

<style scoped>
.three-graph-panel {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #0a0a0f;
}

.three-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.three-canvas:active {
  cursor: grabbing;
}

.node-tooltip {
  position: absolute;
  padding: 12px 16px;
  background: rgba(10, 10, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  min-width: 120px;
}

.tooltip-title {
  font-weight: 600;
  font-size: 14px;
  color: white;
  margin-bottom: 4px;
  font-family: var(--font-display);
}

.tooltip-type {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.tooltip-degree {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.degree-icon {
  color: #FFD700;
  animation: twinkle 1.5s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.control-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  backdrop-filter: blur(4px);
}
</style>