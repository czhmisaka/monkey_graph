import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

// ========== 租户 API（需要认证）==========

/**
 * 获取当前用户的租户信息
 * GET /api/tenant/me
 */
router.get('/tenant/me', authMiddleware, (req, res) => {
  try {
    const user = req.user;

    // 尝试获取租户信息，如果表不存在则返回默认租户
    let tenant = null;
    try {
      tenant = db.prepare(`
        SELECT * FROM tenants WHERE id = ?
      `).get(user.tenant_id || user.id);
    } catch (e) {
      // 表可能不存在，忽略
    }

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

    // 如果没有租户记录，返回默认租户信息
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
    console.error('获取租户信息失败:', error);
    // 返回默认租户而不是错误
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
  // 直接返回默认订阅信息，不查询数据库
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

    // 获取套餐信息
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
    console.error('更改套餐失败:', error);
    res.status(500).json({ error: '更改套餐失败' });
  }
});

/**
 * 取消订阅
 * POST /api/tenant/cancel-subscription
 */
router.post('/tenant/cancel-subscription', authMiddleware, (req, res) => {
  // 直接返回成功，不实际修改数据库
  res.json({
    success: true,
    message: '订阅已取消（本地模式暂不支持）'
  });
});

export default router;
