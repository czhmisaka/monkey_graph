import express from 'express';

const router = express.Router();

// ========== 套餐 API（无需认证）==========

/**
 * 获取所有可用套餐
 * GET /api/plans
 */
router.get('/plans', (req, res) => {
  try {
    // 返回预定义的套餐列表
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
          graphs_limit: -1,  // 无限制
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
    console.error('获取套餐列表失败:', error);
    res.status(500).json({ error: '获取套餐列表失败' });
  }
});

export default router;
