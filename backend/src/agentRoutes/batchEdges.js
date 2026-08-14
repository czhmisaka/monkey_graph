import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { graphOperations, nodeOperations, edgeOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission, checkPerRequestLimit } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import { formatBatchResponse, formatError } from '../utils/responseFormatter.js';
import { getBatchLimits } from '../config/batchConfig.js';

const router = express.Router();

// 批量创建边
router.post('/graphs/:graphId/batch/edges', agentAuthMiddleware, requirePermission('edges', 'write'), requireGraphAccess('write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { edges } = req.body;

    if (!edges || !Array.isArray(edges) || edges.length === 0) {
      return res.status(400).json(formatError('边列表不能为空', 'MISSING_EDGES'));
    }

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 检查 per-request 限制
    const limitError = checkPerRequestLimit(req.agent, 'edges', 'write', edges.length);
    if (limitError) {
      return res.status(403).json(limitError);
    }

    // 限制批量大小
    const maxBatchSize = getBatchLimits().edges.create;
    if (edges.length > maxBatchSize) {
      return res.status(400).json(formatError(`批量大小不能超过 ${maxBatchSize}`, 'BATCH_SIZE_EXCEEDED'));
    }

    const createdEdges = [];
    const errors = [];

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];

      // 验证源节点和目标节点存在
      const sourceNode = nodeOperations.getById(edge.source);
      const targetNode = nodeOperations.getById(edge.target);

      if (!sourceNode || sourceNode.graph_id !== graphId) {
        errors.push({ index: i, error: `源节点 ${edge.source} 不存在` });
        continue;
      }

      if (!targetNode || targetNode.graph_id !== graphId) {
        errors.push({ index: i, error: `目标节点 ${edge.target} 不存在` });
        continue;
      }

      const edgeId = edge.id || uuidv4();
      const newEdge = edgeOperations.createForGraph({
        id: edgeId,
        source: edge.source,
        target: edge.target,
        label: edge.label || '',
        type: edge.type || 'default',
        properties: edge.properties || {}
      }, graphId);

      createdEdges.push({ ...newEdge, properties: JSON.parse(newEdge.properties || '{}') });
    }

    // 精简返回
    res.status(201).json({
      ...formatBatchResponse(createdEdges),
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_CREATE_EDGES_FAILED'));
  }
});

export default router;
