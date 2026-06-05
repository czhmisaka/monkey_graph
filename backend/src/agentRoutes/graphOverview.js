import express from 'express';
import { graphOperations, nodeOperations, edgeOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { formatItemResponse, formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 获取图谱概览（轻量接口：节点列表 + 边列表 + 统计信息）
router.get('/graphs/:id/summary', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const graph = graphOperations.getById(req.params.id);

    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 检查 Agent 是否有权限访问此图谱
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, req.params.id);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }

    // 获取节点和边（只返回基本字段）
    const nodes = nodeOperations.getByGraphId(req.params.id).map(n => ({
      id: n.id,
      label: n.label,
      type: n.type
    }));
    const edges = edgeOperations.getByGraphId(req.params.id).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type
    }));

    // 统计信息
    const typeCounts = {};
    nodes.forEach(n => {
      typeCounts[n.type || 'default'] = (typeCounts[n.type || 'default'] || 0) + 1;
    });

    res.json({
      graph: {
        id: graph.id,
        name: graph.name,
        description: graph.description,
        created_at: graph.created_at
      },
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        typeDistribution: typeCounts
      },
      nodes,
      edges
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_GRAPH_SUMMARY_FAILED'));
  }
});

// 获取图谱详情（精简版：默认不返回 nodes 和 edges）
router.get('/graphs/:id', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const graph = graphOperations.getById(req.params.id);

    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 检查 Agent 是否有权限访问此图谱（支持 owner 和授权两种方式）
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, req.params.id);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }

    // 默认只返回图谱基本信息，nodes/edges 需要通过单独接口获取
    res.json({
      graph: formatItemResponse(graph, req.query, 'graph')
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_GRAPH_FAILED'));
  }
});

export default router;
