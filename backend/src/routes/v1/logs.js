import express from 'express';
import { authMiddleware } from '../../auth.js';
import { getLogFiles, readLogFile, getRecentLogs, clearLogs } from '../../logger.js';

const router = express.Router();

// ========== 日志查询 API（需要认证）==========

/**
 * 获取日志文件列表
 * GET /api/logs/files
 */
router.get('/logs/files', authMiddleware, (req, res) => {
  try {
    const files = getLogFiles();
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 读取日志文件内容
 * GET /api/logs/read?file=xxx&lines=100
 */
router.get('/logs/read', authMiddleware, (req, res) => {
  try {
    const { file, lines } = req.query;

    if (!file) {
      return res.status(400).json({ error: '请指定日志文件名' });
    }

    const lineCount = parseInt(lines) || 100;
    const logs = readLogFile(file, lineCount);

    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取最近的日志（聚合）
 * GET /api/logs/recent?count=50
 */
router.get('/logs/recent', authMiddleware, (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const logs = getRecentLogs(count);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 清理日志文件
 * POST /api/logs/clear
 */
router.post('/logs/clear', authMiddleware, (req, res) => {
  try {
    // 只有管理员可以清理日志（这里简化为任何登录用户）
    const result = clearLogs();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取后端实时日志（通过 SSE）
 * GET /api/logs/stream
 */
router.get('/logs/stream', authMiddleware, (req, res) => {
  try {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 发送最近的日志
    const recentLogs = getRecentLogs(20);
    res.write(`data: ${JSON.stringify({ type: 'init', logs: recentLogs })}\n\n`);

    // 保持连接，每隔一段时间发送健康检查
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);

    // 清理
    req.on('close', () => {
      clearInterval(keepAlive);
      res.end();
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
