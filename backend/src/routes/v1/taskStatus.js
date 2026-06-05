import express from 'express';
import { TaskManager } from '../../tasks/taskManager.js';
import { authMiddleware } from '../../auth.js';

const router = express.Router();

// ========== 任务状态查询 API（需要认证）==========

/**
 * 获取任务状态
 * GET /api/graph/task/:taskId
 */
router.get('/graph/task/:taskId', authMiddleware, (req, res) => {
  try {
    const { taskId } = req.params;
    const task = TaskManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json({
      success: true,
      data: {
        task_id: task.taskId,
        status: task.status,
        message: task.message,
        progress: task.progress,
        result: task.result,
        error: task.error,
        created_at: task.createdAt,
        updated_at: task.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
