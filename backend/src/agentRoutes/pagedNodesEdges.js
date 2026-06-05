import express from 'express';
import { graphOperations, nodeOperations, edgeOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 分页获取节点列表
router.get('/graphs/:graphId/nodes', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, type, fields } = req.query;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }

    let nodes = nodeOperations.getByGraphId(graphId);

    // 按类型过滤
    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }

    const total = nodes.length;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 100, 500); // 最多500条
    const offset = (pageNum - 1) * limitNum;

    // 分页
    nodes = nodes.slice(offset, offset + limitNum);

    // 解析 properties 并处理字段过滤
    const parsedNodes = nodes.map(n => {
      const node = {
        ...n,
        properties: JSON.parse(n.properties || '{}')
      };

      // 字段过滤
      if (fields) {
        const fieldSet = new Set(fields.split(',').map(f => f.trim()));
        const filtered = {};
        fieldSet.forEach(f => {
          if (node[f] !== undefined) filtered[f] = node[f];
        });
        return filtered;
      }

      // 默认排除 embedding
      const { embedding, ...rest } = node;
      return rest;
    });

    res.json({
      nodes: parsedNodes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_NODES_FAILED'));
  }
});

// 分页获取边列表
router.get('/graphs/:graphId/edges', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, fields } = req.query;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }

    let edges = edgeOperations.getByGraphId(graphId);
    const total = edges.length;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offset = (pageNum - 1) * limitNum;

    // 分页
    edges = edges.slice(offset, offset + limitNum);

    // 解析 properties 并处理字段过滤
    const parsedEdges = edges.map(e => {
      const edge = {
        ...e,
        properties: JSON.parse(e.properties || '{}')
      };

      if (fields) {
        const fieldSet = new Set(fields.split(',').map(f => f.trim()));
        const filtered = {};
        fieldSet.forEach(f => {
          if (edge[f] !== undefined) filtered[f] = edge[f];
        });
        return filtered;
      }

      // 默认排除 embedding
      const { embedding, ...rest } = edge;
      return rest;
    });

    res.json({
      edges: parsedEdges,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_EDGES_FAILED'));
  }
});

export default router;
