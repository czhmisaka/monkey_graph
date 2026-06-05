import { edgeOperations, nodeOperations } from '../database.js';

// BFS 路径查找
export function findPathBFS(graphId, startNodeId, endNodeId, maxDepth) {
  const edges = edgeOperations.getByGraphId(graphId);
  const nodes = nodeOperations.getByGraphId(graphId);

  // 构建邻接表
  const adjacency = {};
  for (const node of nodes) {
    adjacency[node.id] = [];
  }
  for (const edge of edges) {
    if (adjacency[edge.source]) {
      adjacency[edge.source].push({ nodeId: edge.target, label: edge.label });
    }
  }

  // BFS
  const queue = [[startNodeId]];
  const visited = new Set([startNodeId]);

  while (queue.length > 0) {
    const path = queue.shift();
    const currentNode = path[path.length - 1];

    if (currentNode === endNodeId) {
      // 返回路径详情
      return path.map((nodeId, index) => {
        const node = nodes.find(n => n.id === nodeId);
        let relation = null;
        if (index > 0) {
          const prevNode = path[index - 1];
          const edge = edges.find(e => e.source === prevNode && e.target === nodeId);
          if (edge) {
            relation = { label: edge.label, type: edge.type };
          }
        }
        return {
          id: nodeId,
          label: node?.label,
          type: node?.type,
          relation
        };
      });
    }

    if (path.length >= maxDepth) continue;

    const neighbors = adjacency[currentNode] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.nodeId)) {
        visited.add(neighbor.nodeId);
        queue.push([...path, neighbor.nodeId]);
      }
    }
  }

  return null;
}

// 获取下个月配额重置时间
export function getNextMonthReset() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}
