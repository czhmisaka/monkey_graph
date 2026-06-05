import express from 'express';
import { agentOperations, workspaceOperations } from '../database.js';
import { agentAuthMiddleware } from '../agentAuth.js';
import { formatItemResponse, formatError } from '../utils/responseFormatter.js';
import { getNextMonthReset } from './_helpers.js';

const router = express.Router();

// 注册新 Agent (需要用户认证)
router.post('/register', (req, res) => {
  try {
    const { name, description, workspace_id, permissions, rate_limit, monthly_quota } = req.body;

    if (!name) {
      return res.status(400).json(formatError('Agent 名称不能为空', 'MISSING_NAME'));
    }

    // 如果指定了 workspace_id，验证 workspace 存在
    if (workspace_id) {
      const workspace = workspaceOperations.getById(workspace_id);
      if (!workspace) {
        return res.status(400).json(formatError('指定的 workspace 不存在', 'WORKSPACE_NOT_FOUND'));
      }
    }

    const agent = agentOperations.create({
      name,
      description,
      workspace_id,
      permissions,
      rate_limit,
      monthly_quota
    });

    // 注册成功返回完整信息（需要显示 API key）
    res.status(201).json({ agent });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'REGISTER_FAILED'));
  }
});

// 获取当前 Agent 信息
router.get('/me', agentAuthMiddleware, (req, res) => {
  res.json({ agent: formatItemResponse(req.agent, req.query, 'agent') });
});

// 更新 Agent 信息
router.put('/me', agentAuthMiddleware, (req, res) => {
  try {
    const { name, description, permissions, rate_limit, monthly_quota, is_active } = req.body;

    const updated = agentOperations.update(req.agent.id, {
      name,
      description,
      permissions,
      rate_limit,
      monthly_quota,
      is_active
    });

    res.json({ agent: formatItemResponse(updated, req.query, 'agent') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_AGENT_FAILED'));
  }
});

// 轮换 API Key
router.post('/rotate-key', agentAuthMiddleware, (req, res) => {
  try {
    const result = agentOperations.rotateApiKey(req.agent.id);
    res.json({
      api_key: result.api_key,
      message: '请妥善保存新的 API Key，它只会显示一次'
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ROTATE_KEY_FAILED'));
  }
});

// 获取配额使用情况
router.get('/quota', agentAuthMiddleware, (req, res) => {
  res.json({
    quota: {
      monthly_quota: req.agent.monthly_quota,
      requests_used: req.agent.requests_used,
      remaining: req.agent.monthly_quota - req.agent.requests_used,
      reset_at: getNextMonthReset()
    }
  });
});

export default router;
