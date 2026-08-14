import express from 'express';
import { agentOperations, agentApiLogOperations, graphOperations } from '../database.js';
import { formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 获取当前用户下所有 Agent 的接口调用日志（最新100条）
// 支持通过 agentId 参数过滤特定 Agent 的日志
router.get('/user/agents/logs', async (req, res) => {
  try {
    // 从请求头获取用户认证信息
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : '';

    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }

    // 动态导入 auth 模块（ES Module 兼容）
    const authModule = await import('../auth.js');
    const verifyToken = authModule.verifyToken;
    const user = verifyToken(token);

    if (!user) {
      return res.status(401).json({ error: '无效的认证令牌' });
    }

    // 获取用户创建的所有 Agent（通过 user_id 关联）
    const userCreatedAgents = agentOperations.getByUserId(user.id);
    const agentIds = userCreatedAgents.map(a => a.id);

    // 如果用户没有创建任何 Agent，返回空数组
    if (agentIds.length === 0) {
      console.log('[日志API] 用户没有创建任何Agent');
      return res.json({ logs: [], total: 0 });
    }

    // 获取过滤参数
    const { agentId, limit: limitStr } = req.query;
    const limit = parseInt(limitStr) || 100;

    let logs;
    if (agentId) {
      // 如果指定了 agentId，过滤该 Agent 的日志
      if (!agentIds.includes(agentId)) {
        return res.status(403).json({ error: '无权查看该 Agent 的日志' });
      }
      logs = agentApiLogOperations.getByAgentId(agentId, limit);
    } else {
      // 否则获取所有用户创建的 Agent 的日志
      logs = agentApiLogOperations.getByAgentIds(agentIds, limit);
    }

    // 为每条日志获取图谱名称
    const logsWithGraphNames = logs.map(log => {
      let graphName = log.graph_name || '';
      // 如果 graph_id 存在但 graph_name 为空，尝试获取图谱名称
      if (log.graph_id && !graphName) {
        try {
          const graph = graphOperations.getById(log.graph_id);
          graphName = graph ? graph.name : '';
        } catch (e) {
          console.error('获取图谱名称失败:', e);
        }
      }
      return {
        ...log,
        graph_name: graphName
      };
    });

    res.json({ logs: logsWithGraphNames, total: logs.length });
  } catch (error) {
    console.error('获取 Agent 日志失败:', error);
    res.status(500).json(formatError(error.message, 'GET_AGENT_LOGS_FAILED'));
  }
});

export default router;
