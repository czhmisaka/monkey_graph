import express from 'express';
import { graphOperations, nodeOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import {
  queryNodes as doQueryNodes,
  aggregateNodes as doAggregateNodes,
  groupByType as doGroupByType,
  OPERATORS,
  AGGREGATE_OPERATIONS
} from '../../utils/queryParser.js';
import { logger } from '../../logger.js';

const router = express.Router();

// ========== 高级查询 API（需要认证）==========

// 获取支持的查询操作符列表
router.get('/query/operators', (req, res) => {
  res.json({
    operators: OPERATORS,
    aggregateOperations: AGGREGATE_OPERATIONS
  });
});

// 属性筛选 + 排序查询（用户版）
router.post('/graphs/:graphId/nodes/query', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const query = req.body;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 执行查询
    const result = await doQueryNodes(graphId, query);

    res.json(result);
  } catch (error) {
    logger.error('【AdvancedQuery】', '[User Query] 查询失败:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 聚合统计接口（用户版）
router.post('/graphs/:graphId/nodes/aggregate', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations, filters } = req.body;

    if (!field) {
      return res.status(400).json({ error: '聚合字段不能为空' });
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: '聚合操作不能为空' });
    }

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 执行聚合查询
    const result = await doAggregateNodes(graphId, field, operations, filters || []);

    res.json(result);
  } catch (error) {
    logger.error('【AdvancedQuery】', '[User Aggregate] 聚合失败:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 按类型分组聚合（用户版）
router.get('/graphs/:graphId/nodes/aggregate/by-type', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations } = req.query;

    if (!field) {
      return res.status(400).json({ error: '聚合字段不能为空' });
    }

    if (!operations) {
      return res.status(400).json({ error: '聚合操作不能为空' });
    }

    const ops = operations.split(',').map(op => op.trim());

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 执行分组聚合
    const result = await doGroupByType(graphId, field, ops);

    res.json({
      field,
      operations: ops,
      groups: result
    });
  } catch (error) {
    logger.error('【AdvancedQuery】', '[User GroupBy] 分组聚合失败:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 获取字段统计信息（用户版）
router.get('/graphs/:graphId/nodes/field-stats', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);

    if (nodes.length === 0) {
      return res.json({
        totalNodes: 0,
        fields: []
      });
    }

    // 分析 properties 中的所有字段
    const fieldStats = {};
    const typeCounts = {};

    for (const node of nodes) {
      // 统计类型
      const type = node.type || 'default';
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      // 解析 properties
      let properties = {};
      try {
        properties = JSON.parse(node.properties || '{}');
      } catch (e) {
        properties = {};
      }

      // 统计每个字段
      for (const [key, value] of Object.entries(properties)) {
        if (!fieldStats[key]) {
          fieldStats[key] = {
            type: typeof value,
            count: 0,
            numericStats: null
          };
        }
        fieldStats[key].count++;

        // 如果是数值类型，收集数值统计
        if (typeof value === 'number' || !isNaN(parseFloat(value))) {
          if (!fieldStats[key].numericStats) {
            fieldStats[key].numericStats = { values: [] };
          }
          fieldStats[key].numericStats.values.push(parseFloat(value));
        }
      }
    }

    // 计算数值统计
    for (const [key, stats] of Object.entries(fieldStats)) {
      if (stats.numericStats && stats.numericStats.values.length > 0) {
        const values = stats.numericStats.values;
        stats.numericStats = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length
        };
      }
    }

    res.json({
      totalNodes: nodes.length,
      typeCounts,
      fields: fieldStats
    });
  } catch (error) {
    logger.error('【AdvancedQuery】', '[User FieldStats] 获取字段统计失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
