import express from 'express';
import { graphOperations, nodeOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import { formatError } from '../utils/responseFormatter.js';
import {
  queryNodes,
  aggregateNodes,
  groupByType,
  rankNodes,
  getTopNodes,
  OPERATORS,
  AGGREGATE_OPERATIONS
} from '../utils/queryParser.js';
import { logger } from '../logger.js';

const router = express.Router();

// 排名查询（支持数值排序）
router.post('/graphs/:graphId/nodes/rank', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, order = 'desc', filters, limit = 100 } = req.body;

    if (!field) {
      return res.status(400).json(formatError('排名字段不能为空', 'MISSING_FIELD'));
    }

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行排名查询
    const result = await rankNodes(graphId, { field, order, filters, limit });

    res.json(result);
  } catch (error) {
    logger.error('【AgentQuery】', '[Rank] 排名查询失败:', error.message);
    res.status(400).json(formatError(error.message, 'RANK_FAILED'));
  }
});

// Top-N 查询（快速获取排名前 N 的节点）
router.get('/graphs/:graphId/nodes/top', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, order = 'desc', limit = 10, filters } = req.query;

    if (!field) {
      return res.status(400).json(formatError('字段不能为空', 'MISSING_FIELD'));
    }

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行 Top-N 查询
    const result = await getTopNodes(graphId, {
      field,
      order: order || 'desc',
      limit: parseInt(limit) || 10,
      filters: filters ? JSON.parse(filters) : []
    });

    res.json(result);
  } catch (error) {
    logger.error('【AgentQuery】', '[TopN] Top-N 查询失败:', error.message);
    res.status(400).json(formatError(error.message, 'TOP_N_FAILED'));
  }
});

// 获取支持的查询操作符列表
router.get('/query/operators', (req, res) => {
  res.json({
    operators: OPERATORS,
    aggregateOperations: AGGREGATE_OPERATIONS
  });
});

// 属性筛选 + 排序查询（核心接口）
router.post('/graphs/:graphId/nodes/query', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const query = req.body;

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行查询
    const result = await queryNodes(graphId, query);

    res.json(result);
  } catch (error) {
    logger.error('【AgentQuery】', '[Query] 查询失败:', error.message);
    res.status(400).json(formatError(error.message, 'QUERY_FAILED'));
  }
});

// 聚合统计接口
router.post('/graphs/:graphId/nodes/aggregate', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations, filters } = req.body;

    if (!field) {
      return res.status(400).json(formatError('聚合字段不能为空', 'MISSING_FIELD'));
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json(formatError('聚合操作不能为空', 'MISSING_OPERATIONS'));
    }

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行聚合查询
    const result = await aggregateNodes(graphId, field, operations, filters || []);

    res.json(result);
  } catch (error) {
    logger.error('【AgentQuery】', '[Aggregate] 聚合失败:', error.message);
    res.status(400).json(formatError(error.message, 'AGGREGATE_FAILED'));
  }
});

// 按类型分组聚合
router.get('/graphs/:graphId/nodes/aggregate/by-type', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations } = req.query;

    if (!field) {
      return res.status(400).json(formatError('聚合字段不能为空', 'MISSING_FIELD'));
    }

    if (!operations) {
      return res.status(400).json(formatError('聚合操作不能为空', 'MISSING_OPERATIONS'));
    }

    const ops = operations.split(',').map(op => op.trim());

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行分组聚合
    const result = await groupByType(graphId, field, ops);

    res.json({
      field,
      operations: ops,
      groups: result
    });
  } catch (error) {
    logger.error('【AgentQuery】', '[GroupBy] 分组聚合失败:', error.message);
    res.status(400).json(formatError(error.message, 'GROUP_BY_FAILED'));
  }
});

// 获取字段统计信息（用于了解图谱数据结构）
router.get('/graphs/:graphId/nodes/field-stats', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
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
            sample: null,
            numericStats: null
          };
        }
        fieldStats[key].count++;
        fieldStats[key].sample = fieldStats[key].sample || value;

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
      delete stats.sample; // 移除 sample 字段
    }

    res.json({
      totalNodes: nodes.length,
      typeCounts,
      fields: fieldStats
    });
  } catch (error) {
    logger.error('【AgentQuery】', '[FieldStats] 获取字段统计失败:', error.message);
    res.status(500).json(formatError(error.message, 'FIELD_STATS_FAILED'));
  }
});

export default router;
