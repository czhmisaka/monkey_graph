import express from 'express';
import { agentAuthMiddleware, requirePermission, checkPerRequestLimit } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import * as graphService from '../services/graphService.js';
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

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphWritable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
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

      // 校验源/目标节点属于该图谱
      const result = graphService.createEdge(graphId, {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: edge.type,
        properties: edge.properties
      });

      if (result.error) {
        errors.push({
          index: i,
          error: result.error.missing === 'source'
            ? `源节点 ${edge.source} 不存在`
            : `目标节点 ${edge.target} 不存在`
        });
        continue;
      }

      createdEdges.push(graphService.serializeEdge(result.edge));
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
