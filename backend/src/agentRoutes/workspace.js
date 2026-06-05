import express from 'express';
import { workspaceOperations } from '../database.js';
import { agentAuthMiddleware } from '../agentAuth.js';
import { formatListResponse, formatItemResponse, formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 创建 Workspace
router.post('/workspaces', agentAuthMiddleware, (req, res) => {
  try {
    const { name, description, settings } = req.body;

    if (!name) {
      return res.status(400).json(formatError('Workspace 名称不能为空', 'MISSING_NAME'));
    }

    const workspace = workspaceOperations.create({
      name,
      description,
      owner_type: 'agent',
      owner_id: req.agent.id,
      settings
    });

    res.status(201).json({ workspace: formatItemResponse(workspace, req.query, 'workspace') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_WORKSPACE_FAILED'));
  }
});

// 获取 Workspace 列表
router.get('/workspaces', agentAuthMiddleware, (req, res) => {
  try {
    // 获取 Agent 创建的 workspaces 和所属的 workspace
    const workspaces = workspaceOperations.getAll().filter(ws =>
      ws.owner_type === 'agent' && ws.owner_id === req.agent.id ||
      ws.id === req.agent.workspace_id
    );

    const response = formatListResponse(workspaces, req.query, 'workspace');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_WORKSPACES_FAILED'));
  }
});

export default router;
