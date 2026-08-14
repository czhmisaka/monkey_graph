import express from 'express';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import * as graphService from '../services/graphService.js';
import { formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 分页获取节点列表
router.get('/graphs/:graphId/nodes', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, type, fields } = req.query;

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphReadable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    // 分页参数解析（与现状一致：最多 500 条）
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 100, 500);

    const { nodes, pagination } = graphService.listNodes(graphId, {
      page: pageNum,
      limit: limitNum,
      type
    });

    // 解析 properties 并处理字段过滤
    const parsedNodes = nodes.map(n => {
      // 字段过滤
      if (fields) {
        const fieldSet = new Set(fields.split(',').map(f => f.trim()));
        const filtered = {};
        fieldSet.forEach(f => {
          if (n[f] !== undefined) filtered[f] = n[f];
        });
        return filtered;
      }

      // 默认排除 embedding
      const { embedding, ...rest } = n;
      return rest;
    });

    res.json({
      nodes: parsedNodes,
      pagination
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

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphReadable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    // 分页参数解析（与现状一致：最多 500 条）
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 100, 500);

    const { edges, pagination } = graphService.listEdges(graphId, {
      page: pageNum,
      limit: limitNum
    });

    // 解析 properties 并处理字段过滤
    const parsedEdges = edges.map(e => {
      // 字段过滤
      if (fields) {
        const fieldSet = new Set(fields.split(',').map(f => f.trim()));
        const filtered = {};
        fieldSet.forEach(f => {
          if (e[f] !== undefined) filtered[f] = e[f];
        });
        return filtered;
      }

      // 默认排除 embedding
      const { embedding, ...rest } = e;
      return rest;
    });

    res.json({
      edges: parsedEdges,
      pagination
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_EDGES_FAILED'));
  }
});

export default router;
