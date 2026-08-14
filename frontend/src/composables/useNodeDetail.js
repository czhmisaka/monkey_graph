import { nextTick } from 'vue'

/**
 * 节点详情编排：把 useGraphOperations 提供的底层节点点击/详情函数
 * 与 useMiniGraph 的渲染函数组合成模板可直接绑定的处理器。
 *
 * @param {Function} handleNodeClickFn - useGraphOperations.handleNodeClick(node, renderMiniGraph)
 * @param {Function} viewNodeDetailFn  - useGraphOperations.viewNodeDetail(nodeId, renderMiniGraph)
 * @param {Function} renderMiniGraph   - useMiniGraph.renderMiniGraph
 */
export function useNodeDetail(handleNodeClickFn, viewNodeDetailFn, renderMiniGraph) {
  const handleNodeClick = (node) => {
    handleNodeClickFn(node, renderMiniGraph)
  }

  const viewNodeDetail = (nodeId) => {
    viewNodeDetailFn(nodeId, renderMiniGraph)
  }

  const handleEdgeHover = () => {
    // Mini graph edge hover handling - delegated to useMiniGraph
  }

  const onAssociationLevelChange = () => {
    nextTick(() => {
      renderMiniGraph()
    })
  }

  return {
    handleNodeClick,
    viewNodeDetail,
    handleEdgeHover,
    onAssociationLevelChange
  }
}
