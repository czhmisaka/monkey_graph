import express from 'express';
import { nodeOperations, vecSearchOperations } from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import {
  getEmbeddings,
  getEmbeddingsInBatches,
  nodeToEmbeddingText,
  isEmbeddingServiceAvailable,
  computeMissingEmbeddings
} from '../../../services/embeddingService.js';
import * as graphService from '../../../services/graphService.js';
import { logger } from '../../../logger.js';

const router = express.Router();

// ========== Embedding Compute Routes ==========

/**
 * 计算图谱中所有节点的 embedding
 * POST /api/graphs/:graphId/embedding/compute
 */
router.post('/graphs/:graphId/embedding/compute', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    logger.info('【Embedding】', `[Embedding Compute] 开始为图谱 ${graphId} 计算 embedding...`);

    // 图谱访问校验（属主 / 管理员 / Agent 创建图谱）
    const access = graphService.assertGraphReadable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      logger.info('【Embedding】', `[Embedding Compute] 图谱 ${graphId} 不存在`);
      return res.status(access.error.status).json({ error: access.error.message });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    logger.info('【Embedding】', `[Embedding Compute] 图谱 ${graphId} 共有 ${nodes.length} 个节点`);

    if (nodes.length === 0) {
      logger.info('【Embedding】', `[Embedding Compute] 图谱 ${graphId} 没有节点`);
      return res.status(400).json({ error: '图谱中没有节点' });
    }

    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    logger.info('【Embedding】', `[Embedding Compute] Embedding 服务可用: ${available}`);

    if (!available) {
      logger.error('【Embedding】', '[Embedding Compute] Embedding 服务不可用');
      return res.status(503).json({ error: 'Embedding 服务不可用，请确保本地 embedding 服务正在运行' });
    }

    // 批量计算 embedding
    logger.info('【Embedding】', `[Embedding Compute] 正在调用 embedding API 计算 ${nodes.length} 个节点的向量...`);
    const nodeTexts = nodes.map(n => nodeToEmbeddingText(n));
    logger.info('【Embedding】', `[Embedding Compute] 节点文本示例: ${nodeTexts[0]?.slice(0, 50)}...`);

    const embeddings = await getEmbeddings(nodeTexts);
    logger.info('【Embedding】', `[Embedding Compute] 成功获取 ${embeddings.length} 个 embedding 向量`);

    // 批量更新到数据库（nodes.embedding + vec_nodes 单事务同步）
    const updateData = nodes.map((node, index) => ({
      id: node.id,
      embedding: embeddings[index]
    })).filter(item => item.embedding);

    logger.info('【Embedding】', `[Embedding Compute] 正在更新数据库，节点 ID: ${updateData.map(d => d.id).join(', ')}`);
    const computed = graphService.syncEmbeddings(graphId, updateData);
    logger.info('【Embedding】', `[Embedding Compute] ✅ 成功保存 ${computed} 个节点的 embedding 并同步到向量索引`);

    res.json({
      success: true,
      message: `成功计算 ${computed} 个节点的 embedding`,
      total: nodes.length,
      computed
    });
  } catch (error) {
    logger.error('【Embedding】', '[Embedding Compute] 计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 增量计算 embedding（只计算新节点）
 * POST /api/graphs/:graphId/embedding/compute/incremental
 */
router.post('/graphs/:graphId/embedding/compute/incremental', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    logger.info('【Embedding】', `[Incremental Compute] 开始增量计算图谱 ${graphId} 的 embedding...`);

    // 写操作：属主校验（与现状一致）
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    logger.info('【Embedding】', `[Incremental Compute] 图谱 ${graphId} 共有 ${nodes.length} 个节点`);

    if (nodes.length === 0) {
      return res.status(400).json({ error: '图谱中没有节点' });
    }

    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Embedding 服务不可用' });
    }

    // 分离有 embedding 和没有 embedding 的节点
    const result = await computeMissingEmbeddings(nodes, async (current, total, stage) => {
      logger.info('【Embedding】', `[Incremental Compute] 进度: ${current}/${total} (${stage})`);
    });

    logger.info('【Embedding】', `[Incremental Compute] 增量计算完成: 计算了 ${result.computed} 个, 跳过了 ${result.skipped} 个`);

    // 同步新计算的 embedding 到向量索引
    if (result.computed > 0 && result.newEmbeddings) {
      const items = result.newEmbeddings.map(item => ({
        nodeId: item.id,
        embedding: item.embedding
      }));
      vecSearchOperations.batchAddToIndex(graphId, items);
      logger.info('【Embedding】', `[Incremental Compute] ✅ 成功同步 ${items.length} 个新向量到索引`);
    }

    res.json({
      success: true,
      message: `增量计算完成: 计算了 ${result.computed} 个新向量, 跳过了 ${result.skipped} 个已有向量`,
      ...result
    });
  } catch (error) {
    logger.error('【Embedding】', '增量计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 指定节点批量计算 embedding
 * POST /api/graphs/:graphId/embedding/compute/batch
 */
router.post('/graphs/:graphId/embedding/compute/batch', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodeIds } = req.body;

    logger.info('【Embedding】', `[Batch Compute] 开始批量计算图谱 ${graphId} 的 embedding, 节点数: ${nodeIds?.length || 0}`);

    // 写操作：属主校验（与现状一致）
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return res.status(400).json({ error: '请提供要计算 embedding 的节点 ID 列表' });
    }

    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Embedding 服务不可用' });
    }

    // 获取指定节点
    const nodes = nodeIds.map(id => nodeOperations.getById(id)).filter(n => n && n.graph_id === graphId);
    logger.info('【Embedding】', `[Batch Compute] 找到 ${nodes.length} 个有效节点`);

    if (nodes.length === 0) {
      return res.status(400).json({ error: '没有找到有效的节点' });
    }

    // 提取节点文本
    const texts = nodes.map(n => nodeToEmbeddingText(n));

    // 分批计算
    const embeddings = await getEmbeddingsInBatches(texts, 16, (current, total) => {
      logger.info('【Embedding】', `[Batch Compute] 进度: ${current}/${total}`);
    });

    // 更新到数据库（nodes.embedding + vec_nodes 单事务同步）
    const updateData = nodes.map((node, index) => ({
      id: node.id,
      embedding: embeddings[index]
    })).filter(item => item.embedding);

    const computed = graphService.syncEmbeddings(graphId, updateData);
    logger.info('【Embedding】', `[Batch Compute] ✅ 成功同步 ${computed} 个节点到向量索引`);

    res.json({
      success: true,
      message: `成功计算 ${computed} 个节点的 embedding`,
      computed
    });
  } catch (error) {
    logger.error('【Embedding】', '批量计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
