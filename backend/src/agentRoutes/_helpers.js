import { edgeOperations, nodeOperations, graphOperations, graphAgentPermissionOperations } from '../database.js';

/**
 * 图谱级访问控制中间件工厂
 * 校验请求中的 :graphId 是否对该 Agent 可访问（或可写）
 * 用于封堵"仅校验 permission 未校验图谱归属"的越权路径
 * @param {'read'|'write'} mode - 需要的访问级别
 */
export function requireGraphAccess(mode = 'read') {
  return (req, res, next) => {
    const graphId = req.params.graphId;
    if (!graphId) {
      return res.status(400).json({ error: '缺少 graphId 参数', code: 'MISSING_GRAPH_ID' });
    }

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在', code: 'GRAPH_NOT_FOUND' });
    }

    const hasAccess = mode === 'write'
      ? graphAgentPermissionOperations.hasWriteAccess(req.agent.id, graphId)
      : graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);

    if (!hasAccess) {
      return res.status(403).json({
        error: '没有权限访问此图谱',
        code: 'GRAPH_ACCESS_DENIED',
        required: { graphId, mode }
      });
    }

    next();
  };
}

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
