import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { graphOperations, edgeOperations, historyOperations, nodeOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import { logger, auditLogger } from '../../logger.js';

const router = express.Router();

// ========== 边操作（需要认证）==========

// 获取指定图谱的所有边
router.get('/graphs/:graphId/edges', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱权限（支持用户图谱、Agent 创建的图谱、管理员访问）
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    if (!graph && !isAdmin) {
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        graph = anyGraph;
      }
    }
    
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
    }
    
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const edges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
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

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 检查节点是否属于该图谱
    const sourceNode = nodeOperations.getById(source);
    const targetNode = nodeOperations.getById(target);
    if (!sourceNode || !targetNode || sourceNode.graph_id !== graphId || targetNode.graph_id !== graphId) {
      return res.status(404).json({ error: '源节点或目标节点不存在于当前图谱中' });
    }

    const newEdge = edgeOperations.createForGraph({
      id: uuidv4(),
      source,
      target,
      label: label || '',
      type: type || 'default',
      properties: properties || {}
    }, graphId);

    historyOperations.add(graphId, 'create', 'edge', newEdge.id, null, newEdge);
    
    // 审计日志
    auditLogger.log('CREATE_EDGE', { graphId, edgeId: newEdge.id, source, target, label }, req.user);
    logger.info('【边操作】', `创建边: ${sourceNode.label} -> ${targetNode.label} (${newEdge.id})`);
    
    res.status(201).json({ ...newEdge, properties: JSON.parse(newEdge.properties || '{}') });
  } catch (error) {
    logger.error('【边操作】', `创建边失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 更新边
router.put('/graphs/:graphId/edges/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 验证边是否属于该图谱
    const oldEdge = edgeOperations.getById(id);
    if (!oldEdge || oldEdge.graph_id !== graphId) {
      return res.status(404).json({ error: '边不存在' });
    }

    const updatedEdge = edgeOperations.update(id, req.body);
    historyOperations.add(graphId, 'update', 'edge', id, oldEdge, updatedEdge);
    
    // 审计日志
    auditLogger.log('UPDATE_EDGE', { graphId, edgeId: id, changes: req.body }, req.user);
    logger.info('【边操作】', `更新边: ${id}`);
    
    res.json({ ...updatedEdge, properties: JSON.parse(updatedEdge.properties || '{}') });
  } catch (error) {
    logger.error('【边操作】', `更新边失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 删除边
router.delete('/graphs/:graphId/edges/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 验证边是否属于该图谱
    const oldEdge = edgeOperations.getById(id);
    if (!oldEdge || oldEdge.graph_id !== graphId) {
      return res.status(404).json({ error: '边不存在' });
    }

    const deletedEdge = edgeOperations.delete(id);
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
