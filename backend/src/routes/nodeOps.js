import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { graphOperations, nodeOperations, historyOperations, vecSearchOperations } from '../database.js';
import { authMiddleware } from '../auth.js';
import { getEmbedding, nodeToEmbeddingText } from '../services/embeddingService.js';
import { logger, auditLogger } from '../logger.js';
import { assertGraphAccess } from './_helpers.js';

const router = express.Router();

// ========== 节点操作（需要认证）==========

// 获取指定图谱的所有节点（排除 embedding 字段以减少响应大小）
// 支持可选分页参数：page, limit, type, sort, order
router.get('/graphs/:graphId/nodes', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { page, limit, type, sort, order } = req.query;

    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;
    
    // 获取所有节点
    let nodes = nodeOperations.getByGraphId(graphId);
    
    // 按类型过滤
    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }
    
    // 排序
    if (sort) {
      const sortOrder = order === 'asc' ? 1 : -1;
      nodes.sort((a, b) => {
        let valA, valB;
        switch (sort) {
          case 'label':
            valA = (a.label || '').toLowerCase();
            valB = (b.label || '').toLowerCase();
            break;
          case 'type':
            valA = a.type || '';
            valB = b.type || '';
            break;
          case 'created_at':
          default:
            valA = new Date(a.created_at || 0).getTime();
            valB = new Date(b.created_at || 0).getTime();
        }
        return sortOrder === 1 ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      });
    }
    
    const total = nodes.length;
    
    // 分页处理
    let paginatedNodes = nodes;
    let pagination = null;
    
    if (page !== undefined && limit !== undefined) {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 500);
      const offset = (pageNum - 1) * limitNum;
      
      paginatedNodes = nodes.slice(offset, offset + limitNum);
      pagination = {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      };
    }
    
    // 排除 embedding 字段并解析 properties
    const result = paginatedNodes.map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    
    // 如果有分页，返回分页格式
    if (pagination) {
      res.json({
        nodes: result,
        pagination
      });
    } else {
      // 保持向后兼容，不传分页参数时返回数组
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个节点
router.get('/graphs/:graphId/nodes/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;

    const node = nodeOperations.getById(id);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }
    res.json({ ...node, properties: JSON.parse(node.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建节点
router.post('/graphs/:graphId/nodes', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { label, type, properties, x, y } = req.body;

    if (!label) {
      return res.status(400).json({ error: '节点标签不能为空' });
    }

    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;

    const newNode = nodeOperations.createForGraph({
      id: uuidv4(),
      label,
      type: type || 'default',
      properties: properties || {},
      x,
      y
    }, graphId);

    historyOperations.add(graphId, 'create', 'node', newNode.id, null, newNode);
    
    // 审计日志
    auditLogger.log('CREATE_NODE', { graphId, nodeId: newNode.id, label, type }, req.user);
    logger.info('【节点操作】', `创建节点: ${newNode.label} (${newNode.id})`);
    
    res.status(201).json({ ...newNode, properties: JSON.parse(newNode.properties || '{}') });
  } catch (error) {
    logger.error('【节点操作】', `创建节点失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 更新节点
router.put('/graphs/:graphId/nodes/:id', authMiddleware, async (req, res) => {
  try {
    const { graphId, id } = req.params;
    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;
    const oldNode = nodeOperations.getById(id);
    if (!oldNode || oldNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }

    const updatedNode = nodeOperations.update(id, req.body);
    historyOperations.add(graphId, 'update', 'node', id, oldNode, updatedNode);

    // 审计日志
    auditLogger.log('UPDATE_NODE', { graphId, nodeId: id, changes: req.body }, req.user);
    logger.info('【节点操作】', `更新节点: ${updatedNode.label} (${id})`);

    // 如果 label 或 properties 发生变化，且节点有 embedding，则更新向量索引
    const labelChanged = req.body.label && req.body.label !== oldNode.label;
    const propertiesChanged = req.body.properties && JSON.stringify(req.body.properties) !== oldNode.properties;

    if ((labelChanged || propertiesChanged) && oldNode.embedding) {
      try {
        // 重新计算新的 embedding
        const newEmbeddingText = nodeToEmbeddingText(updatedNode);
        const embeddingValue = await getEmbedding(newEmbeddingText);

        // 更新数据库中的 embedding
        nodeOperations.updateEmbedding(id, embeddingValue);

        // 更新向量索引
        vecSearchOperations.updateInIndex(id, embeddingValue);

        logger.info('【向量索引】', `已更新节点 ${id} 的向量索引`);
      } catch (e) {
        logger.warn('【向量索引】', `更新节点 ${id} 的向量索引失败: ${e.message}`);
      }
    }

    res.json({ ...updatedNode, properties: JSON.parse(updatedNode.properties || '{}') });
  } catch (error) {
    logger.error('【节点操作】', `更新节点失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 删除节点
router.delete('/graphs/:graphId/nodes/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;
    const oldNode = nodeOperations.getById(id);
    if (!oldNode || oldNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }

    // 从向量索引中移除（如果存在）
    try {
      vecSearchOperations.removeFromIndex(id);
    } catch (e) {
      logger.warn('【向量索引】', `从向量索引移除节点 ${id} 失败: ${e.message}`);
    }

    const deletedNode = nodeOperations.delete(id);
    // 记录删除操作到历史记录
    historyOperations.add(graphId, 'delete', 'node', id, oldNode, null);
    
    // 审计日志 - 重要操作必须记录
    auditLogger.log('DELETE_NODE', { graphId, nodeId: id, label: oldNode.label, type: oldNode.type }, req.user);
    logger.info('【节点操作】', `删除节点: ${oldNode.label} (${id})`);
    
    res.json({ success: true, message: '节点已删除' });
  } catch (error) {
    logger.error('【节点操作】', `删除节点失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 搜索节点
router.get('/graphs/:graphId/nodes/search/:keyword', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;
    const results = nodeOperations.searchByGraphId(graphId, req.params.keyword);
    res.json(results.map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批量更新节点位置
router.put('/graphs/:graphId/nodes/positions', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { positions } = req.body;

    if (!positions || !Array.isArray(positions)) {
      return res.status(400).json({ error: '位置数据格式错误' });
    }

    const graph = assertGraphAccess(req, res, graphId);
    if (!graph) return;

    nodeOperations.updatePositions(graphId, positions);
    res.json({ success: true, message: '位置已保存' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
