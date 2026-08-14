import express from 'express';
import { historyOperations, vecSearchOperations, nodeOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import { getEmbedding, nodeToEmbeddingText } from '../../services/embeddingService.js';
import * as graphService from '../../services/graphService.js';
import { logger, auditLogger } from '../../logger.js';

const router = express.Router();

// ========== 节点操作（需要认证）==========

// 获取指定图谱的所有节点（排除 embedding 字段以减少响应大小）
// 支持可选分页参数：page, limit, type, sort, order
router.get('/graphs/:graphId/nodes', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { page, limit, type, sort, order } = req.query;

    // 图谱访问校验（属主 / 管理员 / Agent 创建图谱）
    const access = graphService.assertGraphReadable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    // 分页参数解析（与现状一致：仅当 page 与 limit 同时提供时分页）
    let parsedPage, parsedLimit;
    if (page !== undefined && limit !== undefined) {
      parsedPage = Math.max(1, parseInt(page) || 1);
      parsedLimit = Math.min(Math.max(1, parseInt(limit) || 20), 500);
    }

    const { nodes, pagination } = graphService.listNodes(graphId, {
      page: parsedPage,
      limit: parsedLimit,
      type,
      sort,
      order
    });

    // 排除 embedding 字段
    const result = nodes.map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return nodeWithoutEmbedding;
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

    // 图谱访问校验
    const access = graphService.assertGraphReadable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    // 验证节点是否属于该图谱
    const node = graphService.getNode(graphId, id);
    if (!node) {
      return res.status(404).json({ error: '节点不存在' });
    }
    res.json(node);
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

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const newNode = graphService.createNode(graphId, { label, type, properties, x, y });

    historyOperations.add(graphId, 'create', 'node', newNode.id, null, newNode);

    // 审计日志
    auditLogger.log('CREATE_NODE', { graphId, nodeId: newNode.id, label, type }, req.user);
    logger.info('【节点操作】', `创建节点: ${newNode.label} (${newNode.id})`);

    res.status(201).json(graphService.serializeNode(newNode));
  } catch (error) {
    logger.error('【节点操作】', `创建节点失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 更新节点
router.put('/graphs/:graphId/nodes/:id', authMiddleware, async (req, res) => {
  try {
    const { graphId, id } = req.params;

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const result = graphService.updateNode(graphId, id, req.body);
    if (!result) {
      return res.status(404).json({ error: '节点不存在' });
    }
    const { oldNode, updatedNode } = result;

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

    res.json(graphService.serializeNode(updatedNode));
  } catch (error) {
    logger.error('【节点操作】', `更新节点失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 删除节点
router.delete('/graphs/:graphId/nodes/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const oldNode = graphService.deleteNode(graphId, id);
    if (!oldNode) {
      return res.status(404).json({ error: '节点不存在' });
    }

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

    // 搜索是读操作：沿用列表读权限（属主 / agent- 前缀放行 / 管理员放行）
    const access = graphService.assertGraphReadable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const results = graphService.searchNodes(graphId, req.params.keyword);
    res.json(results);
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

    // 写操作：属主校验
    const access = graphService.assertGraphWritable(graphId, { kind: 'user', user: req.user });
    if (access.error) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    graphService.updateNodePositions(graphId, positions);
    res.json({ success: true, message: '位置已保存' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
