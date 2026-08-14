import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { agentOperations, graphOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { formatListResponse, formatItemResponse, formatError } from '../utils/responseFormatter.js';
import { getBatchLimits, updateBatchLimits, resetBatchLimits } from '../config/batchConfig.js';
import { logger } from '../logger.js';

const router = express.Router();

// 管理员权限检查中间件
const requireAdmin = (req, res, next) => {
  if (!req.agent.permissions || !req.agent.permissions.special || !req.agent.permissions.special.includes('admin')) {
    return res.status(403).json(formatError('需要管理员权限', 'ADMIN_REQUIRED'));
  }
  next();
};

// 获取所有图谱（需要管理员权限）
router.get('/admin/graphs', agentAuthMiddleware, requireAdmin, (req, res) => {
  try {
    const graphs = graphOperations.getAll();
    const response = formatListResponse(graphs, req.query, 'graph');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_GET_GRAPHS_FAILED'));
  }
});

// 获取所有 Agent 列表（需要管理员权限）
router.get('/admin/agents', agentAuthMiddleware, requireAdmin, (req, res) => {
  try {
    const agents = agentOperations.getAll();
    const response = formatListResponse(agents, req.query, 'agent');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_GET_AGENTS_FAILED'));
  }
});

// 获取批次大小限制配置
router.get('/admin/config/batch-limits', agentAuthMiddleware, requireAdmin, (req, res) => {
  try {
    const limits = getBatchLimits();
    res.json({ config: limits });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_GET_BATCH_LIMITS_FAILED'));
  }
});

// 更新批次大小限制配置
router.put('/admin/config/batch-limits', agentAuthMiddleware, requireAdmin, (req, res) => {
  try {
    const { nodes, edges } = req.body;

    if (!nodes && !edges) {
      return res.status(400).json(formatError('至少需要提供 nodes 或 edges 配置', 'MISSING_CONFIG'));
    }

    const newLimits = {};
    if (nodes) newLimits.nodes = nodes;
    if (edges) newLimits.edges = edges;

    const updatedLimits = updateBatchLimits(newLimits);
    res.json({ config: updatedLimits });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_UPDATE_BATCH_LIMITS_FAILED'));
  }
});

// 重置批次大小限制为默认值
router.post('/admin/config/batch-limits/reset', agentAuthMiddleware, requireAdmin, (req, res) => {
  try {
    const limits = resetBatchLimits();
    res.json({ config: limits });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_RESET_BATCH_LIMITS_FAILED'));
  }
});

// 创建图谱
router.post('/graphs', agentAuthMiddleware, requirePermission('graphs', 'write'), (req, res) => {
  try {
    const { name, description, workspace_id } = req.body;

    if (!name) {
      return res.status(400).json(formatError('图谱名称不能为空', 'MISSING_NAME'));
    }

    // Agent 创建的图谱需要关联到一个默认用户
    // 检查是否有用户存在，如果没有则使用 agent id 作为标识
    const defaultUserId = 'agent-' + req.agent.id;

    const graph = graphOperations.create({
      id: uuidv4(),
      user_id: defaultUserId,
      name,
      description: description || ''
    });

    // 自动给创建此图谱的 Agent 添加读写权限
    const existingAuth = graphAgentPermissionOperations.getByAgentAndGraph(req.agent.id, graph.id);
    if (!existingAuth) {
      graphAgentPermissionOperations.create({
        graph_id: graph.id,
        agent_id: req.agent.id,
        permission: 'write',
        created_by: req.agent.id
      });
      logger.info('【AgentAdmin】', `[Agent] 自动授权 Agent ${req.agent.id} 访问图谱 ${graph.id} (读写权限)`);
    }

    res.status(201).json({ graph: formatItemResponse(graph, req.query, 'graph') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_GRAPH_FAILED'));
  }
});

export default router;
