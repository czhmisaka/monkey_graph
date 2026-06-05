import express from 'express';
import { agentOperations, graphOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware } from '../agentAuth.js';
import { formatListResponse, formatItemResponse, formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 获取图谱已授权的 Agent 列表
router.get('/graphs/:graphId/agents', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 获取授权列表
    const permissions = graphAgentPermissionOperations.getByGraphId(graphId);
    const response = formatListResponse(permissions, req.query, 'agent');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_AGENTS_FAILED'));
  }
});

// 授权 Agent 访问图谱
router.post('/graphs/:graphId/agents', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { agent_id, permission = 'read' } = req.body;

    if (!agent_id) {
      return res.status(400).json(formatError('Agent ID 不能为空', 'MISSING_AGENT_ID'));
    }

    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 验证 Agent 是否存在
    const targetAgent = agentOperations.getById(agent_id);
    if (!targetAgent) {
      return res.status(404).json(formatError('Agent 不存在', 'AGENT_NOT_FOUND'));
    }

    // 检查是否已经授权
    const existingPermission = graphAgentPermissionOperations.getByAgentAndGraph(agent_id, graphId);
    if (existingPermission) {
      return res.status(400).json(formatError('该 Agent 已经被授权', 'ALREADY_AUTHORIZED'));
    }

    // 创建授权
    const newPermission = graphAgentPermissionOperations.create({
      graph_id: graphId,
      agent_id,
      permission,
      created_by: req.agent.id
    });

    res.status(201).json({ permission: formatItemResponse(newPermission, req.query, 'agent') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_PERMISSION_FAILED'));
  }
});

// 更新 Agent 对图谱的权限
router.put('/graphs/:graphId/agents/:agentId', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId, agentId } = req.params;
    const { permission } = req.body;

    if (!permission) {
      return res.status(400).json(formatError('权限不能为空', 'MISSING_PERMISSION'));
    }

    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 获取现有授权
    const existingPermission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    if (!existingPermission) {
      return res.status(404).json(formatError('授权不存在', 'PERMISSION_NOT_FOUND'));
    }

    // 更新权限
    const updated = graphAgentPermissionOperations.update(existingPermission.id, { permission });

    res.json({ permission: formatItemResponse(updated, req.query, 'agent') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_PERMISSION_FAILED'));
  }
});

// 撤销 Agent 对图谱的授权
router.delete('/graphs/:graphId/agents/:agentId', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId, agentId } = req.params;

    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 获取现有授权
    const existingPermission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    if (!existingPermission) {
      return res.status(404).json(formatError('授权不存在', 'PERMISSION_NOT_FOUND'));
    }

    // 撤销授权
    graphAgentPermissionOperations.delete(existingPermission.id);

    res.json({ message: '已撤销授权' });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_PERMISSION_FAILED'));
  }
});

export default router;
