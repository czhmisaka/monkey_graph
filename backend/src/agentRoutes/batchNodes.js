import express from 'express';
import { agentAuthMiddleware, requirePermission, checkPerRequestLimit } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import * as graphService from '../services/graphService.js';
import { formatBatchResponse, formatItemResponse, formatError } from '../utils/responseFormatter.js';
import { getEmbeddings, nodeToEmbeddingText, isEmbeddingServiceAvailable } from '../services/embeddingService.js';
import { getBatchLimits } from '../config/batchConfig.js';
import { logger } from '../logger.js';

const router = express.Router();

// 批量创建节点（自动计算 Embedding）
router.post('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'write'), requireGraphAccess('write'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodes, auto_embedding = true } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json(formatError('节点列表不能为空', 'MISSING_NODES'));
    }

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphWritable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    // 检查 per-request 限制
    const limitError = checkPerRequestLimit(req.agent, 'nodes', 'write', nodes.length);
    if (limitError) {
      return res.status(403).json(limitError);
    }

    // 限制批量大小
    const maxBatchSize = getBatchLimits().nodes.create;
    if (nodes.length > maxBatchSize) {
      return res.status(400).json(formatError(`批量大小不能超过 ${maxBatchSize}`, 'BATCH_SIZE_EXCEEDED'));
    }

    const createdNodes = [];

    for (const node of nodes) {
      const newNode = graphService.createNode(graphId, {
        id: node.id,
        label: node.label,
        type: node.type,
        properties: node.properties,
        x: node.x,
        y: node.y
      });

      createdNodes.push(graphService.serializeNode(newNode));
    }

    // 默认自动计算 Embedding
    let embeddingResult = null;
    if (auto_embedding) {
      try {
        const embeddingAvailable = await isEmbeddingServiceAvailable();
        if (embeddingAvailable && createdNodes.length > 0) {
          const nodeTexts = createdNodes.map(n => nodeToEmbeddingText(n));
          const embeddings = await getEmbeddings(nodeTexts);

          // 批量更新 embedding（nodes.embedding + vec_nodes 单事务同步）
          const updateData = createdNodes.map((node, index) => ({
            id: node.id,
            embedding: embeddings[index]
          })).filter(item => item.embedding);

          const computed = graphService.syncEmbeddings(graphId, updateData);

          embeddingResult = { computed, total: createdNodes.length };
          logger.info('【AgentBatch】', `[Agent] 自动计算 embedding 完成: ${computed}/${createdNodes.length}`);
        }
      } catch (embError) {
        logger.error('【AgentBatch】', '[Agent] 自动计算 embedding 失败:', embError.message);
      }
    }

    // 精简返回：只返回 ID 列表
    res.status(201).json({
      ...formatBatchResponse(createdNodes),
      embedding: embeddingResult
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_CREATE_NODES_FAILED'));
  }
});

// 批量更新节点
router.put('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'write'), requireGraphAccess('write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodes } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json(formatError('节点列表不能为空', 'MISSING_NODES'));
    }

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphWritable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    // 检查 per-request 限制
    const limitError = checkPerRequestLimit(req.agent, 'nodes', 'write', nodes.length);
    if (limitError) {
      return res.status(403).json(limitError);
    }

    // 限制批量大小
    const maxBatchSize = getBatchLimits().nodes.update;
    if (nodes.length > maxBatchSize) {
      return res.status(400).json(formatError(`批量大小不能超过 ${maxBatchSize}`, 'BATCH_SIZE_EXCEEDED'));
    }

    const updatedNodes = [];

    for (const node of nodes) {
      if (!node.id) continue;

      const result = graphService.updateNode(graphId, node.id, node);
      if (result) {
        updatedNodes.push(graphService.serializeNode(result.updatedNode));
      }
    }

    // 精简返回
    res.json(formatBatchResponse(updatedNodes));
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_UPDATE_NODES_FAILED'));
  }
});

// 批量删除节点
router.delete('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'delete'), requireGraphAccess('write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { node_ids } = req.body;

    if (!node_ids || !Array.isArray(node_ids) || node_ids.length === 0) {
      return res.status(400).json(formatError('节点 ID 列表不能为空', 'MISSING_NODE_IDS'));
    }

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphWritable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    // 检查 per-request 限制
    const limitError = checkPerRequestLimit(req.agent, 'nodes', 'delete', node_ids.length);
    if (limitError) {
      return res.status(403).json(limitError);
    }

    // 限制批量大小
    const maxBatchSize = getBatchLimits().nodes.delete;
    if (node_ids.length > maxBatchSize) {
      return res.status(400).json(formatError(`批量大小不能超过 ${maxBatchSize}`, 'BATCH_SIZE_EXCEEDED'));
    }

    let deletedCount = 0;

    for (const nodeId of node_ids) {
      const node = graphService.deleteNode(graphId, nodeId);
      if (node) {
        deletedCount++;
      }
    }

    // 精简返回
    res.json({ count: deletedCount });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_DELETE_NODES_FAILED'));
  }
});

// 删除单个节点
router.delete('/graphs/:graphId/nodes/:nodeId', agentAuthMiddleware, requirePermission('nodes', 'delete'), requireGraphAccess('write'), (req, res) => {
  try {
    const { graphId, nodeId } = req.params;

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphWritable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    const node = graphService.deleteNode(graphId, nodeId);
    if (!node) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }

    res.json({ message: '节点已删除', node_id: nodeId });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_NODE_FAILED'));
  }
});

// 更新单个节点
router.put('/graphs/:graphId/nodes/:nodeId', agentAuthMiddleware, requirePermission('nodes', 'write'), requireGraphAccess('write'), (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { label, type, properties, x, y } = req.body;

    // 图谱访问校验（Agent viewer）
    const access = graphService.assertGraphWritable(graphId, { kind: 'agent', agent: req.agent });
    if (access.error) {
      return res.status(access.error.status).json(formatError(access.error.message, access.error.code));
    }

    const result = graphService.updateNode(graphId, nodeId, {
      label,
      type,
      properties,
      x,
      y
    });

    if (!result) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }

    res.json({
      node: formatItemResponse(graphService.serializeNode(result.updatedNode), req.query, 'node')
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_NODE_FAILED'));
  }
});

export default router;
