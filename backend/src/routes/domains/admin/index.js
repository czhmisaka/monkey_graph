import express from 'express';
import db from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import { userLLMConfigOperations } from '../../../database.js';
import { userAgentOperations, agentOperations } from '../../../database.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../../../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ========== 管理员 API（需要认证）==========

// 检查是否为管理员的辅助函数
function requireAdmin(req, res) {
  const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
  if (!isAdmin) {
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }
  return true;
}

// 确保所有存量用户都有对应租户（懒创建兜底）
function ensureTenants() {
  try {
    const users = db.prepare('SELECT id, username FROM users').all();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO tenants (id, name, slug)
      VALUES (?, ?, ?)
    `);
    for (const u of users) {
      insert.run(u.id, `${u.username} 的租户`, u.username);
    }
  } catch (e) {
    // 表不存在或创建失败时静默（租户功能降级）
  }
}

/**
 * 获取所有租户列表
 * GET /api/admin/tenants
 */
router.get('/admin/tenants', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;

  // 懒创建兜底：确保存量用户都有租户
  ensureTenants();

  try {
    let tenants = [];
    try {
      tenants = db.prepare(`
        SELECT t.*,
               (SELECT COUNT(*) FROM graphs WHERE user_id = t.id) as graph_count,
               (SELECT COUNT(*) FROM users WHERE users.id = t.id) as user_count
        FROM tenants t
        ORDER BY t.created_at DESC
      `).all();
    } catch (e) {
      logger.warn('【Admin】', '获取租户列表失败(降级为空):', e.message);
      tenants = [];
    }

    res.json({
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        plan: t.plan || 'free',
        graph_count: t.graph_count || 0,
        user_count: t.user_count || 1,
        created_at: t.created_at,
        updated_at: t.updated_at
      }))
    });
  } catch (error) {
    logger.error('【Admin】', '获取租户列表失败:', error);
    res.status(500).json({ error: '获取租户列表失败' });
  }
});

/**
 * 获取单个租户详情
 * GET /api/admin/tenants/:id
 */
router.get('/admin/tenants/:id', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }

    const graphCount = db.prepare('SELECT COUNT(*) as count FROM graphs WHERE user_id = ?').get(id)?.count || 0;

    let apiCalls = 0;
    try {
      const usage = db.prepare(`
        SELECT COUNT(*) as count FROM api_usage_log
        WHERE user_id = ? AND created_at >= datetime('now', 'start of month')
      `).get(id);
      apiCalls = usage?.count || 0;
    } catch (e) {}

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan || 'free',
        graph_count: graphCount,
        api_calls_monthly: apiCalls,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at
      }
    });
  } catch (error) {
    logger.error('【Admin】', '获取租户详情失败:', error);
    res.status(500).json({ error: '获取租户详情失败' });
  }
});

/**
 * 暂停租户
 * POST /api/admin/tenants/:id/suspend
 */
router.post('/admin/tenants/:id/suspend', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }

    db.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('suspended', id);

    res.json({
      success: true,
      message: '租户已暂停'
    });
  } catch (error) {
    logger.error('【Admin】', '暂停租户失败:', error);
    res.status(500).json({ error: '暂停租户失败' });
  }
});

/**
 * 激活租户
 * POST /api/admin/tenants/:id/activate
 */
router.post('/admin/tenants/:id/activate', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }

    db.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('active', id);

    res.json({
      success: true,
      message: '租户已激活'
    });
  } catch (error) {
    logger.error('【Admin】', '激活租户失败:', error);
    res.status(500).json({ error: '激活租户失败' });
  }
});

/**
 * 删除租户
 * DELETE /api/admin/tenants/:id
 */
router.delete('/admin/tenants/:id', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;

    if (id === 'admin' || id === 1) {
      return res.status(400).json({ error: '不能删除管理员账户' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }

    try {
      db.prepare('DELETE FROM subscriptions WHERE tenant_id = ?').run(id);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    } catch (e) {
      logger.info('【Admin】', '删除租户关联数据失败:', e.message);
    }

    res.json({
      success: true,
      message: '租户已删除'
    });
  } catch (error) {
    logger.error('【Admin】', '删除租户失败:', error);
    res.status(500).json({ error: '删除租户失败' });
  }
});

// ========== 套餐 API（无需认证）==========

/**
 * 获取所有可用套餐
 * GET /api/plans
 */
router.get('/plans', (req, res) => {
  try {
    const plans = [
      {
        id: 'plan_free',
        name: '免费版',
        slug: 'free',
        description: '适合个人学习和小规模项目',
        price_monthly: 0,
        price_yearly: 0,
        features: [
          '3 个图谱',
          '1,000 节点',
          '100 次 API 调用/月',
          '基础图谱可视化',
          '社区支持'
        ],
        limits: {
          graphs_limit: 3,
          nodes_limit: 1000,
          api_quota: 100,
          snapshots_limit: 1,
          workspaces_limit: 1,
          storage_mb: 10
        },
        is_active: true
      },
      {
        id: 'plan_personal',
        name: '个人版',
        slug: 'personal',
        description: '适合个人开发者和爱好者',
        price_monthly: 29,
        price_yearly: 290,
        features: [
          '10 个图谱',
          '10,000 节点',
          '10,000 次 API 调用/月',
          '高级图谱可视化',
          'Embedding 语义搜索',
          'Email 支持'
        ],
        limits: {
          graphs_limit: 10,
          nodes_limit: 10000,
          api_quota: 10000,
          snapshots_limit: 5,
          workspaces_limit: 3,
          storage_mb: 100
        },
        is_active: true
      },
      {
        id: 'plan_team',
        name: '团队版',
        slug: 'team',
        description: '适合小团队协作',
        price_monthly: 99,
        price_yearly: 990,
        features: [
          '50 个图谱',
          '100,000 节点',
          '100,000 次 API 调用/月',
          '团队协作功能',
          '高级可视化与主题',
          'Priority 支持'
        ],
        limits: {
          graphs_limit: 50,
          nodes_limit: 100000,
          api_quota: 100000,
          snapshots_limit: 20,
          workspaces_limit: 10,
          storage_mb: 1024
        },
        is_active: true
      },
      {
        id: 'plan_enterprise',
        name: '企业版',
        slug: 'enterprise',
        description: '适合企业级应用',
        price_monthly: 299,
        price_yearly: 2990,
        features: [
          '无限图谱',
          '无限节点',
          '无限 API 调用',
          '私有化部署选项',
          '专属客户成功经理',
          'SLA 保障'
        ],
        limits: {
          graphs_limit: -1,
          nodes_limit: -1,
          api_quota: -1,
          snapshots_limit: -1,
          workspaces_limit: -1,
          storage_mb: 10240
        },
        is_active: true
      }
    ];

    res.json(plans);
  } catch (error) {
    logger.error('【Admin】', '获取套餐列表失败:', error);
    res.status(500).json({ error: '获取套餐列表失败' });
  }
});

// ========== 租户 API（需要认证）==========

/**
 * 获取当前用户的租户信息
 * GET /api/tenant/me
 */
router.get('/tenant/me', authMiddleware, (req, res) => {
  try {
    const user = req.user;

    let tenant = null;
    try {
      tenant = db.prepare(`
        SELECT * FROM tenants WHERE id = ?
      `).get(user.tenant_id || user.id);
    } catch (e) {}

    if (tenant) {
      return res.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan || 'free',
          created_at: tenant.created_at
        }
      });
    }

    res.json({
      tenant: {
        id: user.id,
        name: user.username + ' 的租户',
        slug: user.username,
        status: 'active',
        plan: 'free'
      }
    });
  } catch (error) {
    logger.error('【Admin】', '获取租户信息失败:', error);
    res.json({
      tenant: {
        id: req.user.id,
        name: req.user.username + ' 的租户',
        slug: req.user.username,
        status: 'active',
        plan: 'free'
      }
    });
  }
});

/**
 * 获取当前租户的订阅信息
 * GET /api/tenant/subscription
 */
router.get('/tenant/subscription', authMiddleware, (req, res) => {
  res.json({
    subscription: {
      plan: 'free',
      status: 'active'
    }
  });
});

/**
 * 更改套餐
 * POST /api/tenant/change-plan
 */
router.post('/tenant/change-plan', authMiddleware, (req, res) => {
  try {
    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: '请选择要升级的套餐' });
    }

    const plans = [
      { id: 'plan_free', slug: 'free' },
      { id: 'plan_personal', slug: 'personal' },
      { id: 'plan_team', slug: 'team' },
      { id: 'plan_enterprise', slug: 'enterprise' }
    ];

    const plan = plans.find(p => p.id === plan_id);
    if (!plan) {
      return res.status(400).json({ error: '无效的套餐 ID' });
    }

    res.json({
      success: true,
      message: `已成功切换到 ${plan.slug} 套餐（本地模式暂不支持订阅更改）`,
      plan: plan.slug
    });
  } catch (error) {
    logger.error('【Admin】', '更改套餐失败:', error);
    res.status(500).json({ error: '更改套餐失败' });
  }
});

/**
 * 取消订阅
 * POST /api/tenant/cancel-subscription
 */
router.post('/tenant/cancel-subscription', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: '订阅已取消（本地模式暂不支持）'
  });
});

// ========== 使用量 API（需要认证）==========

/**
 * 获取当前用户的使用量
 * GET /api/usage/current
 */
router.get('/usage/current', authMiddleware, (req, res) => {
  try {
    const user = req.user;

    let graphCount = 0;
    let nodeCount = 0;

    try {
      graphCount = db.prepare(`
        SELECT COUNT(*) as count FROM graphs WHERE user_id = ?
      `).get(user.id)?.count || 0;

      nodeCount = db.prepare(`
        SELECT COUNT(*) as count FROM nodes n
        JOIN graphs g ON n.graph_id = g.id
        WHERE g.user_id = ?
      `).get(user.id)?.count || 0;
    } catch (e) {}

    res.json({
      plan: 'free',
      period: new Date().toISOString().slice(0, 7),
      usage: {
        graphs: graphCount,
        nodes: nodeCount,
        api_calls: 0
      },
      quota: {
        graphs_limit: 3,
        nodes_limit: 1000,
        api_quota: 100,
        snapshots_limit: 1,
        workspaces_limit: 1,
        storage_mb: 10
      }
    });
  } catch (error) {
    logger.error('【Admin】', '获取使用量失败:', error);
    res.json({
      plan: 'free',
      period: new Date().toISOString().slice(0, 7),
      usage: {
        graphs: 0,
        nodes: 0,
        api_calls: 0
      },
      quota: {
        graphs_limit: 3,
        nodes_limit: 1000,
        api_quota: 100,
        snapshots_limit: 1,
        workspaces_limit: 1,
        storage_mb: 10
      }
    });
  }
});

// ========== 用户 LLM 配置（需要认证）==========

/**
 * 获取用户的所有 LLM 配置
 * GET /api/user/llm-configs
 */
router.get('/user/llm-configs', authMiddleware, (req, res) => {
  try {
    const configs = userLLMConfigOperations.getByUserId(req.user.id);
    const safeConfigs = configs.map(c => ({
      ...c,
      api_key: c.api_key ? '••••••••' : ''
    }));
    res.json(safeConfigs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 创建 LLM 配置
 * POST /api/user/llm-configs
 */
router.post('/user/llm-configs', authMiddleware, (req, res) => {
  try {
    const { provider, api_key, base_url, model_name, is_active } = req.body;

    if (!api_key) {
      return res.status(400).json({ error: 'API Key 不能为空' });
    }

    const config = userLLMConfigOperations.create({
      user_id: req.user.id,
      provider: provider || 'openai',
      api_key,
      base_url: base_url || '',
      model_name: model_name || 'gpt-4o',
      is_active: is_active || false
    });

    res.status(201).json({
      ...config,
      api_key: '••••••••'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新 LLM 配置
 * PUT /api/user/llm-configs/:id
 */
router.put('/user/llm-configs/:id', authMiddleware, (req, res) => {
  try {
    const config = userLLMConfigOperations.getById(req.params.id);

    if (!config || config.user_id !== req.user.id) {
      return res.status(404).json({ error: '配置不存在' });
    }

    const updatedConfig = userLLMConfigOperations.update(req.params.id, req.body);
    res.json({
      ...updatedConfig,
      api_key: updatedConfig.api_key ? '••••••••' : ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除 LLM 配置
 * DELETE /api/user/llm-configs/:id
 */
router.delete('/user/llm-configs/:id', authMiddleware, (req, res) => {
  try {
    const config = userLLMConfigOperations.getById(req.params.id);

    if (!config || config.user_id !== req.user.id) {
      return res.status(404).json({ error: '配置不存在' });
    }

    userLLMConfigOperations.delete(req.params.id);
    res.json({ success: true, message: '配置已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 用户 Agent 管理（需要认证）==========

/**
 * 获取用户关联的所有 Agent
 * GET /api/user/agents
 */
router.get('/user/agents', authMiddleware, (req, res) => {
  try {
    const agents = userAgentOperations.getByUserId(req.user.id);
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取用户创建的所有 Agent（含 API Key）
 * GET /api/user/agents/my
 */
router.get('/user/agents/my', authMiddleware, (req, res) => {
  try {
    const agents = agentOperations.getByUserId(req.user.id);
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 用户创建自己的 Agent
 * POST /api/user/agents/my
 */
router.post('/user/agents/my', authMiddleware, (req, res) => {
  try {
    const { name, description, permissions, tenant_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Agent 名称不能为空' });
    }

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

    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        api_key: agent.api_key,
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

/**
 * 更新用户的 Agent
 * PUT /api/user/agents/my/:id
 */
router.put('/user/agents/my/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, is_active } = req.body;

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

    const { api_key, ...safeAgent } = updated;
    res.json({
      success: true,
      agent: safeAgent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除用户的 Agent
 * DELETE /api/user/agents/my/:id
 */
router.delete('/user/agents/my/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

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

/**
 * 轮换用户的 Agent API Key
 * POST /api/user/agents/my/:id/rotate-key
 */
router.post('/user/agents/my/:id/rotate-key', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

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

/**
 * 获取所有可用的 Agent（公开列表，用于关联）
 * GET /api/agents
 */
router.get('/agents', authMiddleware, (req, res) => {
  try {
    const agents = agentOperations.getAll().filter(a => a.is_active === 1);
    const safeAgents = agents.map(a => {
      const { api_key, ...rest } = a;
      return rest;
    });
    res.json(safeAgents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 关联 Agent 到用户
 * POST /api/user/agents
 */
router.post('/user/agents', authMiddleware, (req, res) => {
  try {
    const { agent_id, role } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID 不能为空' });
    }

    const agent = agentOperations.getById(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }

    if (userAgentOperations.exists(req.user.id, agent_id)) {
      return res.status(400).json({ error: '该 Agent 已经关联到您的账户' });
    }

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

/**
 * 取消关联 Agent
 * DELETE /api/user/agents/:id
 */
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

/**
 * 更新关联角色
 * PUT /api/user/agents/:id/role
 */
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

// ========== 全局统计缓存（定时更新）==========

let statsCache = {
  users: 0,
  graphs: 0,
  nodes: 0,
  edges: 0,
  databaseSize: 0,
  updatedAt: null
};

function updateStatsCache() {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const graphCount = db.prepare('SELECT COUNT(*) as count FROM graphs').get().count;
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get().count;
    const edgeCount = db.prepare('SELECT COUNT(*) as count FROM edges').get().count;

    let databaseSize = 0;
    // 从 backend/src/routes/domains/admin/ 到 backend/data/ 需要 4 层 ..
    const dbPath = path.join(__dirname, '..', '..', '..', '..', 'data', 'knowledge-graph.db');
    try {
      const stats = fs.statSync(dbPath);
      databaseSize = stats.size;
    } catch (e) {
      logger.info('【Admin】', '[Stats Cache] 无法获取数据库文件大小:', e.message);
    }

    statsCache = {
      users: userCount,
      graphs: graphCount,
      nodes: nodeCount,
      edges: edgeCount,
      databaseSize,
      updatedAt: new Date().toISOString()
    };

    logger.info('【Admin】', `[Stats Cache] 统计已更新: 用户=${userCount}, 图谱=${graphCount}, 节点=${nodeCount}, 边=${edgeCount}, 数据库大小=${(databaseSize / 1024 / 1024).toFixed(2)}MB`);
  } catch (error) {
    logger.error('【Admin】', '[Stats Cache] 更新统计缓存失败:', error);
  }
}

// 启动定时任务：每隔1分钟更新一次缓存
setInterval(updateStatsCache, 60 * 1000);
// 启动时立即更新一次
updateStatsCache();

/**
 * 全局统计路由 - 读取缓存（无需登录）
 * GET /api/stats/global
 */
router.get('/stats/global', (req, res) => {
  try {
    res.json(statsCache);
  } catch (error) {
    logger.error('【Admin】', '获取全局统计失败:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

/**
 * 强制刷新统计缓存（管理员可调用）
 * POST /api/stats/global/refresh
 */
router.post('/stats/global/refresh', authMiddleware, (req, res) => {
  try {
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    if (!isAdmin) {
      return res.status(403).json({ error: '只有管理员可以刷新统计缓存' });
    }

    updateStatsCache();
    res.json({
      success: true,
      message: '统计缓存已刷新',
      ...statsCache
    });
  } catch (error) {
    logger.error('【Admin】', '刷新全局统计失败:', error);
    res.status(500).json({ error: '刷新统计数据失败' });
  }
});

export default router;