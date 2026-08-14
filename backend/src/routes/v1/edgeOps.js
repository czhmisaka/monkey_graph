import express from 'express';
import { historyOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import * as graphService from '../../services/graphService.js';
import { logger, auditLogger } from '../../logger.js';

const router = express.Router();

// ========== 边操作（需要认证）==========

// 获取指定图谱的所有边
router.get('/graphs/:graphId/edges', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;

    // 图谱访问校验（属主 / 管理员 / Agent 创建图谱）
    const access = graphService.assertGraphReadable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const { edges } = graphService.listEdges(graphId);
    res.json(edges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建边
router.post('/graphs/:graphId/edges', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { source, target, label, type, properties } = req.body;

    if (!source || !target) {
      return res.status(400).json({ error: '源节点和目标节点不能为空' });
    }

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    // 校验源/目标节点属于该图谱
    const result = graphService.createEdge(graphId, { source, target, label, type, properties });
    if (result.error) {
      return res.status(404).json({ error: '源节点或目标节点不存在于当前图谱中' });
    }

    const newEdge = result.edge;
    historyOperations.add(graphId, 'create', 'edge', newEdge.id, null, newEdge);

    // 审计日志
    auditLogger.log('CREATE_EDGE', { graphId, edgeId: newEdge.id, source, target, label }, req.user);
    logger.info('【边操作】', `创建边: ${result.sourceNode.label} -> ${result.targetNode.label} (${newEdge.id})`);

    res.status(201).json(graphService.serializeEdge(newEdge));
  } catch (error) {
    logger.error('【边操作】', `创建边失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 更新边
router.put('/graphs/:graphId/edges/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const result = graphService.updateEdge(graphId, id, req.body);
    if (!result) {
      return res.status(404).json({ error: '边不存在' });
    }
    const { oldEdge, updatedEdge } = result;

    historyOperations.add(graphId, 'update', 'edge', id, oldEdge, updatedEdge);

    // 审计日志
    auditLogger.log('UPDATE_EDGE', { graphId, edgeId: id, changes: req.body }, req.user);
    logger.info('【边操作】', `更新边: ${id}`);

    res.json(graphService.serializeEdge(updatedEdge));
  } catch (error) {
    logger.error('【边操作】', `更新边失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 删除边
router.delete('/graphs/:graphId/edges/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const oldEdge = graphService.deleteEdge(graphId, id);
    if (!oldEdge) {
      return res.status(404).json({ error: '边不存在' });
    }

    // 记录删除操作到历史记录
    historyOperations.add(graphId, 'delete', 'edge', id, oldEdge, null);

    // 审计日志 - 重要操作必须记录
    auditLogger.log('DELETE_EDGE', { graphId, edgeId: id, source: oldEdge.source, target: oldEdge.target, label: oldEdge.label }, req.user);
    logger.info('【边操作】', `删除边: ${id}`);

    res.json({ success: true, message: '边已删除' });
  } catch (error) {
    logger.error('【边操作】', `删除边失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
