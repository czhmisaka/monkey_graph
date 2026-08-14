import express from 'express';
import { agentOperations, workspaceOperations } from '../database.js';
import { agentAuthMiddleware } from '../agentAuth.js';
import { jwtAuth } from '../auth.js';
import { formatItemResponse, formatError } from '../utils/responseFormatter.js';
import { getNextMonthReset } from './_helpers.js';
import { validate, agentRegisterSchema } from '../middleware/validate.js';

const router = express.Router();

// 注册新 Agent（需要用户登录认证；权限/配额由服务端默认值决定，客户端不可自选）
router.post('/register', jwtAuth, validate(agentRegisterSchema), (req, res) => {
  try {
    const { name, description, workspace_id } = req.body;

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
      user_id: req.user.id,
      // 权限/配额由服务端默认值决定，不信任客户端传入值
      permissions: undefined,
      rate_limit: undefined,
      monthly_quota: undefined
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

// 更新 Agent 信息（仅允许修改 name/description；权限、配额、启停仅管理员接口可改）
router.put('/me', agentAuthMiddleware, (req, res) => {
  try {
    const { name, description } = req.body;

    const updated = agentOperations.update(req.agent.id, {
      name,
      description
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
