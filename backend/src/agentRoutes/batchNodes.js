import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  graphOperations,
  nodeOperations,
  edgeOperations,
  graphAgentPermissionOperations,
  vecSearchOperations
} from '../database.js';
import { agentAuthMiddleware, requirePermission, checkPerRequestLimit } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import { formatBatchResponse, formatItemResponse, formatError } from '../utils/responseFormatter.js';
import { getEmbeddings, nodeToEmbeddingText, isEmbeddingServiceAvailable } from '../services/embeddingService.js';
import { getBatchLimits } from '../config/batchConfig.js';

const router = express.Router();

// 批量创建节点（自动计算 Embedding）
router.post('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'write'), requireGraphAccess('write'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodes, auto_embedding = true } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json(formatError('节点列表不能为空', 'MISSING_NODES'));
    }

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
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
      const nodeId = node.id || uuidv4();
      const newNode = nodeOperations.createForGraph({
        id: nodeId,
        label: node.label,
        type: node.type || 'default',
        properties: node.properties || {},
        x: node.x || Math.random() * 800,
        y: node.y || Math.random() * 600
      }, graphId);

      createdNodes.push({ ...newNode, properties: JSON.parse(newNode.properties || '{}') });
    }

    // 默认自动计算 Embedding
    let embeddingResult = null;
    if (auto_embedding) {
      try {
        const embeddingAvailable = await isEmbeddingServiceAvailable();
        if (embeddingAvailable && createdNodes.length > 0) {
          const nodeTexts = createdNodes.map(n => nodeToEmbeddingText(n));
          const embeddings = await getEmbeddings(nodeTexts);

          // 批量更新 embedding
          const updateData = createdNodes.map((node, index) => ({
            id: node.id,
            embedding: embeddings[index]
          })).filter(item => item.embedding);

          nodeOperations.batchUpdateEmbeddings(graphId, updateData);

          // 同步到向量索引
          const items = updateData.map(item => ({
            nodeId: item.id,
            embedding: item.embedding
          }));
          vecSearchOperations.batchAddToIndex(graphId, items);

          embeddingResult = { computed: updateData.length, total: createdNodes.length };
          console.log(`[Agent] 自动计算 embedding 完成: ${updateData.length}/${createdNodes.length}`);
        }
      } catch (embError) {
        console.error('[Agent] 自动计算 embedding 失败:', embError.message);
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

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
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

      const oldNode = nodeOperations.getById(node.id);
      if (!oldNode || oldNode.graph_id !== graphId) continue;

      const updated = nodeOperations.update(node.id, node);
      updatedNodes.push({ ...updated, properties: JSON.parse(updated.properties || '{}') });
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

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
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
      const node = nodeOperations.getById(nodeId);
      if (node && node.graph_id === graphId) {
        // 从向量索引中移除
        try {
          vecSearchOperations.removeFromIndex(nodeId);
        } catch (e) {
          // 忽略错误，继续删除
        }
        nodeOperations.delete(nodeId);
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

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const node = nodeOperations.getById(nodeId);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }

    // 从向量索引中移除（如果存在）
    try {
      vecSearchOperations.removeFromIndex(nodeId);
    } catch (e) {
      console.log(`[Agent Node Delete] 从向量索引移除节点 ${nodeId} 失败:`, e.message);
    }

    nodeOperations.delete(nodeId);

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

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const node = nodeOperations.getById(nodeId);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }

    const updated = nodeOperations.update(nodeId, {
      label,
      type,
      properties,
      x,
      y
    });

    res.json({
      node: formatItemResponse({
        ...updated,
        properties: JSON.parse(updated.properties || '{}')
      }, req.query, 'node')
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_NODE_FAILED'));
  }
});

export default router;
