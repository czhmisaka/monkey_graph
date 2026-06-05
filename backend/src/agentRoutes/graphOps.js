import express from 'express';
import { graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware } from '../agentAuth.js';
import { formatListResponse, formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 获取 Agent 可访问的图谱列表（包括自己创建的 + 被授权的）
router.get('/graphs', agentAuthMiddleware, (req, res) => {
  try {
    // 使用授权系统获取可访问的图谱
    const graphs = graphAgentPermissionOperations.getAccessibleGraphs(req.agent.id);
    const response = formatListResponse(graphs, req.query, 'graph');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_GRAPHS_FAILED'));
  }
});

// 获取 Agent 对指定图谱的权限
router.get('/graphs/:graphId/permission', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;

    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有访问权限', 'ACCESS_DENIED'));
    }

    const hasWriteAccess = graphAgentPermissionOperations.hasWriteAccess(req.agent.id, graphId);
    res.json({
      permission: hasWriteAccess ? 'write' : 'read'
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_PERMISSION_FAILED'));
  }
});

export default router;
