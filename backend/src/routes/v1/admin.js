import express from 'express';
import db from '../../database.js';
import { authMiddleware } from '../../auth.js';

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

/**
 * 获取所有租户列表
 * GET /api/admin/tenants
 */
router.get('/admin/tenants', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    // 获取所有租户
    let tenants = [];
    try {
      tenants = db.prepare(`
        SELECT t.*,
               (SELECT COUNT(*) FROM graphs WHERE user_id = t.id) as graph_count,
               (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count
        FROM tenants t
        ORDER BY t.created_at DESC
      `).all();
    } catch (e) {
      // 表可能不存在，返回空列表
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
    console.error('获取租户列表失败:', error);
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

    // 获取租户的图谱数量
    const graphCount = db.prepare('SELECT COUNT(*) as count FROM graphs WHERE user_id = ?').get(id)?.count || 0;

    // 获取租户的 API 调用次数（本月）
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
    console.error('获取租户详情失败:', error);
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

    // 更新租户状态为暂停
    db.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('suspended', id);

    res.json({
      success: true,
      message: '租户已暂停'
    });
  } catch (error) {
    console.error('暂停租户失败:', error);
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

    // 更新租户状态为活跃
    db.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('active', id);

    res.json({
      success: true,
      message: '租户已激活'
    });
  } catch (error) {
    console.error('激活租户失败:', error);
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

    // 不允许删除管理员账户
    if (id === 'admin' || id === 1) {
      return res.status(400).json({ error: '不能删除管理员账户' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }

    // 删除租户（及其关联数据通过外键级联或手动删除）
    try {
      // 删除租户的订阅
      db.prepare('DELETE FROM subscriptions WHERE tenant_id = ?').run(id);

      // 删除租户
      db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    } catch (e) {
      console.log('删除租户关联数据失败:', e.message);
    }

    res.json({
      success: true,
      message: '租户已删除'
    });
  } catch (error) {
    console.error('删除租户失败:', error);
    res.status(500).json({ error: '删除租户失败' });
  }
});

export default router;
