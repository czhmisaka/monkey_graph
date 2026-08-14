import express from 'express';
import { graphOperations, nodeOperations, vecSearchOperations } from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import { isEmbeddingServiceAvailable, getEmbeddingConfig, computeVectorStats } from '../../../services/embeddingService.js';
import { logger } from '../../../logger.js';

const router = express.Router();

// ========== Embedding Status Routes ==========

/**
 * 检查 embedding 服务状态
 * GET /api/embedding/status
 */
router.get('/embedding/status', authMiddleware, async (req, res) => {
  try {
    const available = await isEmbeddingServiceAvailable();
    const config = getEmbeddingConfig();
    res.json({
      available,
      config
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取图谱的 embedding 状态
 * GET /api/graphs/:graphId/embedding/status
 */
router.get('/graphs/:graphId/embedding/status', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;

    logger.info('【Embedding】', `[Embedding Status] 获取图谱 ${graphId} 的 embedding 状态...`);

    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);

    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;

    // 如果不是管理员且图谱不属于当前用户，返回 404
    if (!graph && !isAdmin) {
      // 检查图谱是否是 Agent 创建的（user_id 以 agent- 开头）
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        // Agent 创建的图谱，允许访问
        graph = anyGraph;
      }
    }

    // 如果图谱不属于当前用户，但当前用户是管理员，则获取图谱（不验证 owner）
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
      if (!graph) {
        logger.info('【Embedding】', `[Embedding Status] 图谱 ${graphId} 不存在`);
        return res.status(404).json({ error: '图谱不存在' });
      }
    }

    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      logger.info('【Embedding】', `[Embedding Status] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    const totalNodes = nodes.length;
    logger.info('【Embedding】', `[Embedding Status] 图谱 ${graphId} 共有 ${totalNodes} 个节点`);

    // 统计已有 embedding 的节点数量
    const nodesWithEmbedding = nodes.filter(n => n.embedding && n.embedding.length > 0);
    const computedNodes = nodesWithEmbedding.length;

    // 计算进度
    const progress = totalNodes > 0 ? Math.round((computedNodes / totalNodes) * 100) : 0;

    logger.info('【Embedding】', `[Embedding Status] 已计算 embedding: ${computedNodes}/${totalNodes} (${progress}%)`);

    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    const config = getEmbeddingConfig();
    logger.info('【Embedding】', `[Embedding Status] Embedding 服务可用: ${available}, 配置: ${JSON.stringify(config)}`);

    res.json({
      available,
      config,
      totalNodes,
      computedNodes,
      progress,
      isComplete: computedNodes === totalNodes && totalNodes > 0
    });
  } catch (error) {
    logger.error('【Embedding】', '[Embedding Status] 获取 embedding 状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除图谱的所有 embedding
 * DELETE /api/graphs/:graphId/embedding
 */
router.delete('/graphs/:graphId/embedding', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 删除 nodes 表中的 embedding
    nodeOperations.deleteEmbeddingsByGraphId(graphId);

    // 清理 sqlite-vec 索引
    vecSearchOperations.clearIndexByGraphId(graphId);

    res.json({
      success: true,
      message: '已删除所有节点的 embedding 及向量索引'
    });
  } catch (error) {
    logger.error('【Embedding】', '删除 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取向量统计信息
 * GET /api/graphs/:graphId/embedding/stats
 */
router.get('/graphs/:graphId/embedding/stats', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);

    if (nodesWithEmbedding.length === 0) {
      return res.json({
        success: true,
        hasVectors: false,
        message: '图谱中还没有计算 embedding'
      });
    }

    // 提取所有向量
    const vectors = nodesWithEmbedding.map(n => JSON.parse(n.embedding));

    // 计算统计信息
    const stats = computeVectorStats(vectors);

    res.json({
      success: true,
      hasVectors: true,
      nodeCount: nodesWithEmbedding.length,
      dimensions: stats.dimensions,
      mean: stats.mean.slice(0, 10), // 只返回前10维
      std: stats.std.slice(0, 10),
      min: stats.min.slice(0, 10),
      max: stats.max.slice(0, 10)
    });
  } catch (error) {
    logger.error('【Embedding】', '获取向量统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
