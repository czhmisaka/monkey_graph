import express from 'express';
import { graphOperations, historyOperations } from '../database.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

// ========== 历史记录（需要认证）==========

// 获取指定图谱的历史记录
router.get('/graphs/:graphId/history', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    const limit = parseInt(req.query.limit) || 50;
    const history = historyOperations.getByGraphId(graphId, limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 撤销操作
router.post('/graphs/:graphId/history/undo', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    const result = historyOperations.undo(graphId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
