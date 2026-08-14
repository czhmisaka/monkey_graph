import express from 'express';
import { graphOperations, nodeOperations } from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import {
  getEmbedding,
  findSimilarNodes,
  filterBySimilarityThreshold
} from '../../../services/embeddingService.js';
import { logger } from '../../../logger.js';

const router = express.Router();

// ========== Embedding Search Routes ==========

/**
 * 语义搜索节点
 * GET /api/graphs/:graphId/embedding/search?q=xxx&limit=10
 */
router.get('/graphs/:graphId/embedding/search', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { q, limit = 10 } = req.query;

    logger.info('【Search】', `[Semantic Search] 收到搜索请求: graphId=${graphId}, query="${q}", limit=${limit}`);

    if (!q) {
      logger.info('【Search】', '[Semantic Search] 搜索关键词为空');
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }

    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);

    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;

    // 如果不是管理员且图谱不属于当前用户，检查是否是 Agent 创建的图谱
    if (!graph && !isAdmin) {
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        graph = anyGraph;
      }
    }

    // 如果是管理员，检查图谱是否存在
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
    }

    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      logger.info('【Search】', `[Semantic Search] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    logger.info('【Search】', `[Semantic Search] 图谱 ${graphId} 中有 ${nodesWithEmbedding.length} 个节点有 embedding`);

    if (nodesWithEmbedding.length === 0) {
      logger.info('【Search】', '[Semantic Search] 图谱中没有计算 embedding');
      return res.status(400).json({ error: '图谱中还没有计算 embedding，请先点击"计算 Embedding"' });
    }

    // 计算查询的 embedding
    logger.info('【Search】', `[Semantic Search] 正在为查询 "${q}" 计算 embedding...`);
    const queryEmbedding = await getEmbedding(q);
    logger.info('【Search】', `[Semantic Search] 查询 embedding 维度: ${queryEmbedding?.length || 0}`);

    // 查找相似节点
    const candidates = nodesWithEmbedding.map(n => ({
      id: n.id,
      label: n.label,
      embedding: JSON.parse(n.embedding)
    }));
    logger.info('【Search】', `[Semantic Search] 候选节点: ${candidates.map(c => c.label).join(', ')}`);

    logger.info('【Search】', `[Semantic Search] 正在计算余弦相似度，limit=${limit}...`);
    const similarNodes = findSimilarNodes(queryEmbedding, candidates, parseInt(limit));
    logger.info('【Search】', `[Semantic Search] 找到 ${similarNodes.length} 个相似节点`);

    // 获取完整节点信息（排除 embedding 字段以减少响应大小）
    const results = similarNodes.map(similarity => {
      const node = nodesWithEmbedding.find(n => n.id === similarity.id);
      logger.info('【Search】', `[Semantic Search] 相似节点: ${node?.label}, 相似度: ${(similarity.similarity * 100).toFixed(2)}%`);
      // 排除 embedding 字段
      const { embedding, ...nodeWithoutEmbedding } = node;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(node.properties || '{}'),
        similarity: similarity.similarity
      };
    });

    logger.info('【Search】', `[Semantic Search] 搜索完成，返回 ${results.length} 个结果`);
    res.json({
      success: true,
      query: q,
      results
    });
  } catch (error) {
    logger.error('【Search】', '[Semantic Search] 语义搜索失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取节点的相似节点
 * GET /api/graphs/:graphId/embedding/similar/:nodeId?limit=10
 */
router.get('/graphs/:graphId/embedding/similar/:nodeId', authMiddleware, async (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { limit = 10 } = req.query;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取目标节点
    const targetNode = nodeOperations.getById(nodeId);
    if (!targetNode || targetNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }

    // 检查是否有 embedding
    if (!targetNode.embedding) {
      return res.status(400).json({ error: '该节点还没有 embedding，请先点击"计算 Embedding"' });
    }

    // 获取其他有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    const otherNodes = nodesWithEmbedding.filter(n => n.id !== nodeId);

    if (otherNodes.length === 0) {
      return res.json({
        success: true,
        node: { ...targetNode, properties: JSON.parse(targetNode.properties || '{}') },
        similarNodes: []
      });
    }

    // 解析目标节点的 embedding
    const targetEmbedding = JSON.parse(targetNode.embedding);

    // 查找相似节点
    const candidates = otherNodes.map(n => ({
      id: n.id,
      embedding: JSON.parse(n.embedding)
    }));

    const similarNodes = findSimilarNodes(targetEmbedding, candidates, parseInt(limit));

    // 获取完整节点信息
    const results = similarNodes.map(similarity => {
      const node = otherNodes.find(n => n.id === similarity.id);
      return {
        ...node,
        properties: JSON.parse(node.properties || '{}'),
        similarity: similarity.similarity
      };
    });

    res.json({
      success: true,
      node: { ...targetNode, properties: JSON.parse(targetNode.properties || '{}') },
      similarNodes: results
    });
  } catch (error) {
    logger.error('【Search】', '获取相似节点失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 使用指定相似度算法进行搜索
 * GET /api/graphs/:graphId/embedding/search/advanced
 */
router.get('/graphs/:graphId/embedding/search/advanced', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { q, limit = 10, metric = 'cosine', threshold } = req.query;

    if (!q) {
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);

    if (nodesWithEmbedding.length === 0) {
      return res.status(400).json({ error: '图谱中还没有计算 embedding' });
    }

    // 计算查询的 embedding
    const queryEmbedding = await getEmbedding(q);

    // 准备候选节点
    const candidates = nodesWithEmbedding.map(n => ({
      id: n.id,
      embedding: JSON.parse(n.embedding)
    }));

    // 根据算法类型计算相似度
    let results;
    if (threshold !== undefined) {
      // 使用阈值过滤
      results = filterBySimilarityThreshold(
        queryEmbedding,
        candidates,
        parseFloat(threshold)
      ).slice(0, parseInt(limit));
    } else {
      // 直接查找相似节点
      results = findSimilarNodes(queryEmbedding, candidates, parseInt(limit));
    }

    // 获取完整节点信息
    const searchResults = results.map(item => {
      const node = nodesWithEmbedding.find(n => n.id === item.id);
      return {
        ...node,
        properties: JSON.parse(node.properties || '{}'),
        similarity: item.similarity
      };
    });

    res.json({
      success: true,
      query: q,
      metric,
      results: searchResults
    });
  } catch (error) {
    logger.error('【Search】', '高级搜索失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
