import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { authMiddleware } from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 全局统计缓存（定时更新）==========
// 缓存统计数据，每隔1分钟更新一次
let statsCache = {
  users: 0,
  graphs: 0,
  nodes: 0,
  edges: 0,
  databaseSize: 0,  // 数据库文件大小（字节）
  updatedAt: null
};

/**
 * 更新统计缓存
 */
function updateStatsCache() {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const graphCount = db.prepare('SELECT COUNT(*) as count FROM graphs').get().count;
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get().count;
    const edgeCount = db.prepare('SELECT COUNT(*) as count FROM edges').get().count;

    // 计算数据库文件大小
    let databaseSize = 0;
    const dbPath = path.join(__dirname, '..', 'data', 'knowledge-graph.db');
    try {
      const stats = fs.statSync(dbPath);
      databaseSize = stats.size;
    } catch (e) {
      console.log('[Stats Cache] 无法获取数据库文件大小:', e.message);
    }

    statsCache = {
      users: userCount,
      graphs: graphCount,
      nodes: nodeCount,
      edges: edgeCount,
      databaseSize,
      updatedAt: new Date().toISOString()
    };

    console.log(`[Stats Cache] 统计已更新: 用户=${userCount}, 图谱=${graphCount}, 节点=${nodeCount}, 边=${edgeCount}, 数据库大小=${(databaseSize / 1024 / 1024).toFixed(2)}MB`);
  } catch (error) {
    console.error('[Stats Cache] 更新统计缓存失败:', error);
  }
}

// 启动定时任务：每隔1分钟更新一次缓存
setInterval(updateStatsCache, 60 * 1000);
// 启动时立即更新一次
updateStatsCache();

const router = express.Router();

// 全局统计路由 - 读取缓存（无需登录）
router.get('/stats/global', (req, res) => {
  try {
    res.json(statsCache);
  } catch (error) {
    console.error('获取全局统计失败:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 强制刷新统计缓存（管理员可调用）
router.post('/stats/global/refresh', authMiddleware, (req, res) => {
  try {
    // 检查是否是管理员
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
    console.error('刷新全局统计失败:', error);
    res.status(500).json({ error: '刷新统计数据失败' });
  }
});

export default router;
