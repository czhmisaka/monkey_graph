import express from 'express';
import { graphOperations, nodeOperations, vecSearchOperations } from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import {
  getEmbeddings,
  getEmbeddingsInBatches,
  nodeToEmbeddingText,
  isEmbeddingServiceAvailable,
  computeMissingEmbeddings
} from '../../../services/embeddingService.js';

const router = express.Router();

// ========== Embedding Compute Routes ==========

/**
 * 计算图谱中所有节点的 embedding
 * POST /api/graphs/:graphId/embedding/compute
 */
router.post('/graphs/:graphId/embedding/compute', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    console.log(`[Embedding Compute] 开始为图谱 ${graphId} 计算 embedding...`);

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
      console.log(`[Embedding Compute] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    console.log(`[Embedding Compute] 图谱 ${graphId} 共有 ${nodes.length} 个节点`);

    if (nodes.length === 0) {
      console.log(`[Embedding Compute] 图谱 ${graphId} 没有节点`);
      return res.status(400).json({ error: '图谱中没有节点' });
    }

    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    console.log(`[Embedding Compute] Embedding 服务可用: ${available}`);

    if (!available) {
      console.error('[Embedding Compute] Embedding 服务不可用');
      return res.status(503).json({ error: 'Embedding 服务不可用，请确保本地 embedding 服务正在运行' });
    }

    // 批量计算 embedding
    console.log(`[Embedding Compute] 正在调用 embedding API 计算 ${nodes.length} 个节点的向量...`);
    const nodeTexts = nodes.map(n => nodeToEmbeddingText(n));
    console.log(`[Embedding Compute] 节点文本示例: ${nodeTexts[0]?.slice(0, 50)}...`);

    const embeddings = await getEmbeddings(nodeTexts);
    console.log(`[Embedding Compute] 成功获取 ${embeddings.length} 个 embedding 向量`);

    // 批量更新到数据库
    const updateData = nodes.map((node, index) => ({
      id: node.id,
      embedding: embeddings[index]
    })).filter(item => item.embedding);

    console.log(`[Embedding Compute] 正在更新数据库，节点 ID: ${updateData.map(d => d.id).join(', ')}`);
    nodeOperations.batchUpdateEmbeddings(graphId, updateData);
    console.log(`[Embedding Compute] ✅ 成功保存 ${updateData.length} 个节点的 embedding 到数据库`);

    // 同步到 sqlite-vec 索引
    const items = updateData.map(item => ({
      nodeId: item.id,
      embedding: item.embedding
    }));
    vecSearchOperations.batchAddToIndex(graphId, items);
    console.log(`[Embedding Compute] ✅ 成功同步 ${items.length} 个节点到向量索引`);

    res.json({
      success: true,
      message: `成功计算 ${updateData.length} 个节点的 embedding`,
      total: nodes.length,
      computed: updateData.length
    });
  } catch (error) {
    console.error('[Embedding Compute] 计算 embedding 失败:', error);
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
    console.log(`[Incremental Compute] 开始增量计算图谱 ${graphId} 的 embedding...`);

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    console.log(`[Incremental Compute] 图谱 ${graphId} 共有 ${nodes.length} 个节点`);

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
      console.log(`[Incremental Compute] 进度: ${current}/${total} (${stage})`);
    });

    console.log(`[Incremental Compute] 增量计算完成: 计算了 ${result.computed} 个, 跳过了 ${result.skipped} 个`);

    // 同步新计算的 embedding 到向量索引
    if (result.computed > 0 && result.newEmbeddings) {
      const items = result.newEmbeddings.map(item => ({
        nodeId: item.id,
        embedding: item.embedding
      }));
      vecSearchOperations.batchAddToIndex(graphId, items);
      console.log(`[Incremental Compute] ✅ 成功同步 ${items.length} 个新向量到索引`);
    }

    res.json({
      success: true,
      message: `增量计算完成: 计算了 ${result.computed} 个新向量, 跳过了 ${result.skipped} 个已有向量`,
      ...result
    });
  } catch (error) {
    console.error('增量计算 embedding 失败:', error);
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

    console.log(`[Batch Compute] 开始批量计算图谱 ${graphId} 的 embedding, 节点数: ${nodeIds?.length || 0}`);

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
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
    console.log(`[Batch Compute] 找到 ${nodes.length} 个有效节点`);

    if (nodes.length === 0) {
      return res.status(400).json({ error: '没有找到有效的节点' });
    }

    // 提取节点文本
    const texts = nodes.map(n => nodeToEmbeddingText(n));

    // 分批计算
    const embeddings = await getEmbeddingsInBatches(texts, 16, (current, total) => {
      console.log(`[Batch Compute] 进度: ${current}/${total}`);
    });

    // 更新到数据库
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
      console.log(`[Batch Compute] ✅ 成功同步 ${items.length} 个节点到向量索引`);
    }

    res.json({
      success: true,
      message: `成功计算 ${updateData.length} 个节点的 embedding`,
      computed: updateData.length
    });
  } catch (error) {
    console.error('批量计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
