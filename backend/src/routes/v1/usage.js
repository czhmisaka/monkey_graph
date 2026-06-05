import express from 'express';
import db from '../../database.js';
import { authMiddleware } from '../../auth.js';

const router = express.Router();

// ========== 使用量 API（需要认证）==========

/**
 * 获取当前用户的使用量
 * GET /api/usage/current
 */
router.get('/usage/current', authMiddleware, (req, res) => {
  try {
    const user = req.user;

    // 获取用户的图谱数量
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
    } catch (e) {
      // 表查询失败，保持默认值 0
    }

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
    console.error('获取使用量失败:', error);
    // 返回默认值而不是错误
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

export default router;
