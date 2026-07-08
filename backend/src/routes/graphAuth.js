import express from 'express';
import { graphOperations, agentOperations, graphAgentPermissionOperations } from '../database.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

// ========== 图谱 Agent 授权管理（需要认证）==========

// 批量获取多个图谱的授权(单次请求替代 N+1)
// POST /api/graphs/agents/batch  body: { graphIds: [...] }
router.post('/graphs/agents/batch', authMiddleware, (req, res) => {
  try {
    const { graphIds } = req.body || {};
    if (!Array.isArray(graphIds) || graphIds.length === 0) {
      return res.status(400).json({ error: 'graphIds 必须是非空数组' });
    }
    if (graphIds.length > 100) {
      return res.status(400).json({ error: '一次最多查询 100 个图谱' });
    }

    // 权限校验: 过滤出当前用户可访问的图谱(拥有者 / 管理员)
    const accessible = [];
    for (const id of graphIds) {
      const graph = graphOperations.getById(id);
      if (!graph) continue;
      const isOwner = graph.user_id === req.user.id;
      const isAgentGraph = typeof graph.user_id === 'string' && graph.user_id.startsWith('agent-');
      const isAdmin = req.user.is_admin === 1;
      if (isOwner || isAgentGraph || isAdmin) {
        accessible.push(id);
      }
    }

    if (accessible.length === 0) {
      return res.json({});  // 空对象
    }

    // 单次 SQL 查所有授权
    const rows = graphAgentPermissionOperations.getByGraphIds(accessible);

    // 按 graphId 分组
    const result = {};
    for (const id of accessible) result[id] = [];
    for (const p of rows) {
      if (!result[p.graph_id]) result[p.graph_id] = [];
      result[p.graph_id].push({
        id: p.id,
        graph_id: p.graph_id,
        agent_id: p.agent_id,
        permission: p.permission,
        created_by: p.created_by,
        created_at: p.created_at,
        updated_at: p.updated_at,
        agent: {
          id: p.agent_id,
          name: p.agent_name,
          description: p.agent_description,
          is_active: p.agent_is_active
        }
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取图谱已授权的 Agent 列表
router.get('/graphs/:id/agents', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱（user_id 以 agent- 开头）
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');

    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }

    // 获取已授权的 Agent 列表（数据库已返回 agent 信息）
    const permissions = graphAgentPermissionOperations.getByGraphId(id);

    // 格式化返回结果
    const result = permissions.map(p => ({
      id: p.id,
      graph_id: p.graph_id,
      agent_id: p.agent_id,
      permission: p.permission,
      created_by: p.created_by,
      created_at: p.created_at,
      updated_at: p.updated_at,
      agent: {
        id: p.agent_id,
        name: p.agent_name,
        description: p.agent_description,
        is_active: p.agent_is_active
      }
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 授权 Agent 访问图谱
router.post('/graphs/:id/agents', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { agent_id, permission = 'read' } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID 不能为空' });
    }

    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱（user_id 以 agent- 开头）
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');

    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }

    // 检查 Agent 是否存在
    const agent = agentOperations.getById(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }

    // 检查是否已经授权
    const existing = graphAgentPermissionOperations.getByAgentAndGraph(agent_id, id);
    if (existing) {
      return res.status(400).json({ error: '该 Agent 已经被授权访问此图谱' });
    }

    // 创建授权
    const newPermission = graphAgentPermissionOperations.create({
      graph_id: id,
      agent_id,
      permission,
      created_by: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Agent 授权成功',
      permission: {
        ...newPermission,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          is_active: agent.is_active
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新 Agent 对图谱的权限
router.put('/graphs/:id/agents/:agentId', authMiddleware, (req, res) => {
  try {
    const { id, agentId } = req.params;
    const { permission } = req.body;

    if (!permission) {
      return res.status(400).json({ error: '权限不能为空' });
    }

    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱（user_id 以 agent- 开头）
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');

    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }

    // 检查授权是否存在
    const existing = graphAgentPermissionOperations.getByAgentAndGraph(agentId, id);
    if (!existing) {
      return res.status(404).json({ error: '授权不存在' });
    }

    // 更新权限
    const updated = graphAgentPermissionOperations.update(existing.id, { permission });

    // 获取 Agent 信息
    const agent = agentOperations.getById(agentId);

    res.json({
      success: true,
      message: '权限更新成功',
      permission: {
        ...updated,
        agent: agent ? {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          is_active: agent.is_active
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 撤销 Agent 对图谱的授权
router.delete('/graphs/:id/agents/:agentId', authMiddleware, (req, res) => {
  try {
    const { id, agentId } = req.params;

    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');

    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }

    // 检查授权是否存在
    const existing = graphAgentPermissionOperations.getByAgentAndGraph(agentId, id);
    if (!existing) {
      return res.status(404).json({ error: '授权不存在' });
    }

    // 撤销授权
    graphAgentPermissionOperations.deleteByAgentAndGraph(agentId, id);

    res.json({
      success: true,
      message: '授权已撤销'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
