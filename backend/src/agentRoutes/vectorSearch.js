import express from 'express';
import { graphOperations, nodeOperations, vecSearchOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import { formatError } from '../utils/responseFormatter.js';
import {
  getEmbedding,
  getEmbeddings,
  findSimilarNodes,
  kMeansClustering,
  nodeToEmbeddingText,
  isEmbeddingServiceAvailable
} from '../services/embeddingService.js';
import { logger } from '../logger.js';

const router = express.Router();

// 获取图谱的 embedding 状态
router.get('/graphs/:graphId/embedding/status', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const nodes = nodeOperations.getByGraphId(graphId);
    const totalNodes = nodes.length;
    const nodesWithEmbedding = nodes.filter(n => n.embedding && n.embedding.length > 0);
    const computedNodes = nodesWithEmbedding.length;
    const progress = totalNodes > 0 ? Math.round((computedNodes / totalNodes) * 100) : 0;
    const available = await isEmbeddingServiceAvailable();

    res.json({
      totalNodes,
      computedNodes,
      progress,
      isComplete: computedNodes === totalNodes && totalNodes > 0,
      available
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'EMBEDDING_STATUS_FAILED'));
  }
});

// 计算图谱中所有节点的 embedding
router.post('/graphs/:graphId/embedding/compute', agentAuthMiddleware, requirePermission('nodes', 'write'), requireGraphAccess('write'), async (req, res) => {
  try {
    const { graphId } = req.params;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const nodes = nodeOperations.getByGraphId(graphId);
    if (nodes.length === 0) {
      return res.status(400).json(formatError('图谱中没有节点', 'NO_NODES'));
    }

    const available = await isEmbeddingServiceAvailable();
    if (!available) {
      return res.status(503).json(formatError('Embedding 服务不可用', 'EMBEDDING_UNAVAILABLE'));
    }

    const nodeTexts = nodes.map(n => nodeToEmbeddingText(n));
    const embeddings = await getEmbeddings(nodeTexts);

    const updateData = nodes.map((node, index) => ({
      id: node.id,
      embedding: embeddings[index]
    })).filter(item => item.embedding);

    nodeOperations.batchUpdateEmbeddings(graphId, updateData);

    // 同步到向量索引
    if (updateData.length > 0) {
      const items = updateData.map(item => ({
        nodeId: item.id,
        embedding: item.embedding
      }));
      vecSearchOperations.batchAddToIndex(graphId, items);
    }

    res.json({
      message: `成功计算 ${updateData.length} 个节点的 embedding`,
      total: nodes.length,
      computed: updateData.length
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'EMBEDDING_COMPUTE_FAILED'));
  }
});

// 语义搜索节点（向量检索）
router.get('/graphs/:graphId/embedding/search', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { q, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json(formatError('搜索关键词不能为空', 'MISSING_QUERY'));
    }

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    if (nodesWithEmbedding.length === 0) {
      return res.status(400).json(formatError('图谱中还没有计算 embedding', 'NO_EMBEDDING'));
    }

    const queryEmbedding = await getEmbedding(q);
    const candidates = nodesWithEmbedding.map(n => ({
      id: n.id,
      label: n.label,
      embedding: JSON.parse(n.embedding)
    }));

    const similarNodes = findSimilarNodes(queryEmbedding, candidates, parseInt(limit));

    const results = similarNodes.map(similarity => {
      const node = nodesWithEmbedding.find(n => n.id === similarity.id);
      const { embedding, ...nodeWithoutEmbedding } = node;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(node.properties || '{}'),
        similarity: similarity.similarity
      };
    });

    res.json({
      query: q,
      results
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'EMBEDDING_SEARCH_FAILED'));
  }
});

// 获取节点的相似节点（向量检索）
router.get('/graphs/:graphId/embedding/similar/:nodeId', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { limit = 10 } = req.query;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const targetNode = nodeOperations.getById(nodeId);
    if (!targetNode || targetNode.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }

    if (!targetNode.embedding) {
      return res.status(400).json(formatError('该节点还没有 embedding', 'NO_EMBEDDING'));
    }

    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    const otherNodes = nodesWithEmbedding.filter(n => n.id !== nodeId);

    if (otherNodes.length === 0) {
      return res.json({
        node: { id: targetNode.id, label: targetNode.label },
        similarNodes: []
      });
    }

    const targetEmbedding = JSON.parse(targetNode.embedding);
    const candidates = otherNodes.map(n => ({
      id: n.id,
      embedding: JSON.parse(n.embedding)
    }));

    const similarNodes = findSimilarNodes(targetEmbedding, candidates, parseInt(limit));

    const results = similarNodes.map(similarity => {
      const node = otherNodes.find(n => n.id === similarity.id);
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        similarity: similarity.similarity
      };
    });

    res.json({
      node: { id: targetNode.id, label: targetNode.label },
      similarNodes: results
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'SIMILAR_NODES_FAILED'));
  }
});

// 聚类分析（向量检索）
router.post('/graphs/:graphId/embedding/cluster', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { k = 3 } = req.body;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    if (nodesWithEmbedding.length < 2) {
      return res.status(400).json(formatError('需要至少 2 个节点才能进行聚类', 'INSUFFICIENT_NODES'));
    }

    if (nodesWithEmbedding.length < k) {
      return res.status(400).json(formatError(`节点数量 (${nodesWithEmbedding.length}) 少于聚类数量 (${k})`, 'K_TOO_LARGE'));
    }

    const vectors = nodesWithEmbedding.map(n => JSON.parse(n.embedding));
    const clusters = kMeansClustering(vectors, k);

    const nodeIdList = nodesWithEmbedding.map(n => n.id);
    const clusterResults = clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      nodeIds: cluster.indices.map(index => nodeIdList[index])
    }));

    res.json({
      k,
      totalNodes: nodesWithEmbedding.length,
      clusters: clusterResults
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CLUSTER_FAILED'));
  }
});

// 删除图谱的所有 embedding
router.delete('/graphs/:graphId/embedding', agentAuthMiddleware, requirePermission('nodes', 'write'), requireGraphAccess('write'), async (req, res) => {
  try {
    const { graphId } = req.params;

    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    nodeOperations.deleteEmbeddingsByGraphId(graphId);

    // 清理向量索引
    try {
      vecSearchOperations.clearIndexByGraphId(graphId);
    } catch (e) {
      logger.info('【AgentVector】', `[Agent] 清理图谱 ${graphId} 的向量索引失败:`, e.message);
    }

    res.json({
      message: '已删除所有节点的 embedding'
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_EMBEDDING_FAILED'));
  }
});

export default router;
