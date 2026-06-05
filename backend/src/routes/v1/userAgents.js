import express from 'express';
import { userAgentOperations, agentOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';

const router = express.Router();

// ========== 用户关联的 Agent（需要认证）==========

// 获取用户关联的所有 Agent
router.get('/user/agents', authMiddleware, (req, res) => {
  try {
    const agents = userAgentOperations.getByUserId(req.user.id);
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取用户创建的所有 Agent（含 API Key）
router.get('/user/agents/my', authMiddleware, (req, res) => {
  try {
    const agents = agentOperations.getByUserId(req.user.id);
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 用户创建自己的 Agent
router.post('/user/agents/my', authMiddleware, (req, res) => {
  try {
    const { name, description, permissions, tenant_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Agent 名称不能为空' });
    }

    // 创建 Agent 并关联到用户
    const agent = agentOperations.create({
      name,
      description: description || '',
      user_id: req.user.id,
      tenant_id: tenant_id || null,
      permissions: permissions || {
        graphs: ['read', 'write'],
        nodes: ['read', 'write', 'delete'],
        edges: ['read', 'write', 'delete']
      }
    });

    // 返回创建的 Agent，包含 API Key（只显示一次）
    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        api_key: agent.api_key, // 只在此处返回一次
        permissions: agent.permissions,
        is_active: agent.is_active,
        created_at: agent.created_at
      },
      message: '请妥善保存 API Key，它只会显示一次'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新用户的 Agent
router.put('/user/agents/my/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, is_active } = req.body;

    // 验证 Agent 属于当前用户
    const agent = agentOperations.getById(id);
    if (!agent || agent.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Agent 不存在或无权修改' });
    }

    const updated = agentOperations.update(id, {
      name,
      description,
      permissions,
      is_active
    });

    // 不返回 API Key
    const { api_key, ...safeAgent } = updated;
    res.json({
      success: true,
      agent: safeAgent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除用户的 Agent
router.delete('/user/agents/my/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // 验证 Agent 属于当前用户
    const agent = agentOperations.getById(id);
    if (!agent || agent.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Agent 不存在或无权删除' });
    }

    agentOperations.delete(id);
    res.json({ success: true, message: 'Agent 已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 轮换用户的 Agent API Key
router.post('/user/agents/my/:id/rotate-key', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // 验证 Agent 属于当前用户
    const agent = agentOperations.getById(id);
    if (!agent || agent.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Agent 不存在或无权操作' });
    }

    const result = agentOperations.rotateApiKey(id);
    res.json({
      success: true,
      api_key: result.api_key,
      message: '请妥善保存新的 API Key，它只会显示一次'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有可用的 Agent（公开列表，用于关联）
router.get('/agents', authMiddleware, (req, res) => {
  try {
    // 获取所有活跃的 Agent
    const agents = agentOperations.getAll().filter(a => a.is_active === 1);
    // 排除 API Key
    const safeAgents = agents.map(a => {
      const { api_key, ...rest } = a;
      return rest;
    });
    res.json(safeAgents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 关联 Agent 到用户
router.post('/user/agents', authMiddleware, (req, res) => {
  try {
    const { agent_id, role } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID 不能为空' });
    }

    // 检查 Agent 是否存在
    const agent = agentOperations.getById(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }

    // 检查是否已经关联
    if (userAgentOperations.exists(req.user.id, agent_id)) {
      return res.status(400).json({ error: '该 Agent 已经关联到您的账户' });
    }

    // 关联 Agent
    const userAgent = userAgentOperations.create({
      user_id: req.user.id,
      agent_id,
      role: role || 'member'
    });

    res.status(201).json({
      success: true,
      message: 'Agent 关联成功',
      user_agent: userAgent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取消关联 Agent
router.delete('/user/agents/:id', authMiddleware, (req, res) => {
  try {
    const userAgent = userAgentOperations.getById(req.params.id);

    if (!userAgent || userAgent.user_id !== req.user.id) {
      return res.status(404).json({ error: '关联不存在' });
    }

    userAgentOperations.delete(req.params.id);
    res.json({ success: true, message: '已取消关联' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新关联角色
router.put('/user/agents/:id/role', authMiddleware, (req, res) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: '角色不能为空' });
    }

    const userAgent = userAgentOperations.getById(req.params.id);

    if (!userAgent || userAgent.user_id !== req.user.id) {
      return res.status(404).json({ error: '关联不存在' });
    }

    const updated = userAgentOperations.updateRole(req.params.id, role);
    res.json({
      success: true,
      message: '角色更新成功',
      user_agent: updated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
