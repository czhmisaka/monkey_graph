// 图谱渲染组件 - 支持多种渲染模式
export { default as GraphBase } from './GraphBase.vue'
export { default as ForceGraphPanel } from './ForceGraphPanel.vue'
export { default as RadialGraphPanel } from './RadialGraphPanel.vue'
export { default as ThreeGraphPanel } from './ThreeGraphPanel.vue'

// 渲染模式常量
export const GRAPH_MODES = {
  FORCE: 'force',     // 力导向图模式 (D3) - 适合 <4K 节点
  RADIAL: 'radial',   // 原点/放射状模式 (D3) - 适合 4K+ 节点
  THREE: 'three'      // 3D 星云模式 (Three.js) - 震撼的 3D 可视化效果
}

// 节点数量阈值
export const NODE_COUNT_THRESHOLD = 4000

// 自动选择渲染模式
export const getGraphMode = (nodeCount) => {
  if (nodeCount >= NODE_COUNT_THRESHOLD) {
    return GRAPH_MODES.RADIAL
  }
  return GRAPH_MODES.FORCE
}

// 获取对应组件
export const getGraphComponent = (mode) => {
  switch (mode) {
    case GRAPH_MODES.THREE:
      return 'ThreeGraphPanel'
    case GRAPH_MODES.RADIAL:
      return 'RadialGraphPanel'
    case GRAPH_MODES.FORCE:
    default:
      return 'ForceGraphPanel'
  }
}
