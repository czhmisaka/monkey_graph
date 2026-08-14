import express from 'express';
import { graphOperations, nodeOperations, vecSearchOperations } from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import { exportVectorsToJSON, importVectorsFromJSON } from '../../../services/embeddingService.js';
import { logger } from '../../../logger.js';

const router = express.Router();

// ========== Embedding Import/Export Routes ==========

/**
 * 导出图谱的向量数据
 * GET /api/graphs/:graphId/embedding/export
 */
router.get('/graphs/:graphId/embedding/export', authMiddleware, async (req, res) => {
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
      return res.status(400).json({ error: '图谱中还没有计算 embedding' });
    }

    // 导出向量数据
    const nodes = nodesWithEmbedding.map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
      embedding: JSON.parse(n.embedding)
    }));

    const jsonData = exportVectorsToJSON(nodes);

    // 设置响应头
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="graph_${graphId}_vectors.json"`);

    res.send(jsonData);
  } catch (error) {
    logger.error('【Embedding】', '导出向量数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 导入向量数据
 * POST /api/graphs/:graphId/embedding/import
 */
router.post('/graphs/:graphId/embedding/import', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { data } = req.body;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    if (!data) {
      return res.status(400).json({ error: '导入数据不能为空' });
    }

    // 解析导入数据
    const vectors = importVectorsFromJSON(data);
    logger.info('【Embedding】', `[Embedding Import] 准备导入 ${vectors.length} 个向量`);

    // 更新节点的 embedding
    let updatedCount = 0;
    for (const item of vectors) {
      // 查找对应的节点
      const node = nodeOperations.getById(item.id);
      if (node && node.graph_id === graphId) {
        nodeOperations.updateEmbedding(item.id, item.embedding);
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `成功导入 ${updatedCount} 个节点的向量`,
      imported: updatedCount
    });
  } catch (error) {
    logger.error('【Embedding】', '导入向量数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
