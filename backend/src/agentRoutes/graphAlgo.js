import express from 'express';
import { graphOperations, nodeOperations, edgeOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { formatError } from '../utils/responseFormatter.js';
import { findPathBFS } from './_helpers.js';

const router = express.Router();

// 获取两个节点之间的路径 (BFS)
router.get('/graphs/:graphId/path', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { source, target, max_depth } = req.query;

    if (!source || !target) {
      return res.status(400).json(formatError('源节点和目标节点不能为空', 'MISSING_SOURCE_TARGET'));
    }

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const maxDepth = parseInt(max_depth) || 10;

    // BFS 查找路径
    const path = findPathBFS(graphId, source, target, maxDepth);

    res.json({
      path,
      length: path ? path.length : 0,
      found: !!path
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'PATH_FIND_FAILED'));
  }
});

// 获取节点的度统计
router.get('/graphs/:graphId/degrees', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const nodes = nodeOperations.getByGraphId(graphId);
    const edges = edgeOperations.getByGraphId(graphId);

    // 计算每个节点的度
    const degrees = {};
    for (const node of nodes) {
      degrees[node.id] = { in: 0, out: 0, total: 0 };
    }

    for (const edge of edges) {
      if (degrees[edge.source]) {
        degrees[edge.source].out++;
        degrees[edge.source].total++;
      }
      if (degrees[edge.target]) {
        degrees[edge.target].in++;
        degrees[edge.target].total++;
      }
    }

    // 精简返回：只返回必要字段
    const result = nodes.map(node => ({
      id: node.id,
      label: node.label,
      type: node.type,
      ...degrees[node.id]
    }));

    // 排序（按总度降序）
    result.sort((a, b) => b.total - a.total);

    res.json({
      degrees: result,
      totalEdges: edges.length
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_DEGREES_FAILED'));
  }
});

// 获取节点的邻居
router.get('/graphs/:graphId/nodes/:nodeId/neighbors', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { type, limit } = req.query;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const node = nodeOperations.getById(nodeId);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }

    const edges = edgeOperations.getByGraphId(graphId);
    const nodes = nodeOperations.getByGraphId(graphId);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const neighbors = [];
    const maxLimit = parseInt(limit) || 50;

    for (const edge of edges) {
      let neighborId = null;
      let relation = null;

      if (edge.source === nodeId) {
        neighborId = edge.target;
        relation = { direction: 'outgoing', label: edge.label, type: edge.type };
      } else if (edge.target === nodeId) {
        neighborId = edge.source;
        relation = { direction: 'incoming', label: edge.label, type: edge.type };
      }

      if (neighborId) {
        const neighbor = nodeMap.get(neighborId);
        if (neighbor) {
          if (!type || type === 'all' || relation.direction === type) {
            neighbors.push({
              id: neighbor.id,
              label: neighbor.label,
              type: neighbor.type,
              relation
            });

            if (neighbors.length >= maxLimit) break;
          }
        }
      }
    }

    res.json({
      node: { id: node.id, label: node.label },
      neighbors,
      total: neighbors.length
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_NEIGHBORS_FAILED'));
  }
});

export default router;
