import express from 'express';
import { graphOperations, nodeOperations, edgeOperations } from '../database.js';
import { authMiddleware } from '../auth.js';
import { chat, agentChat } from '../llmService.js';
import { registerConversation, cancelConversation, clearConversation, isConversationCancelled } from '../conversationStore.js';

const router = express.Router();

// ========== 聊天接口（需要认证）==========

// 发送消息 (Agent 模式)
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { messages, maxIterations, graphId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '消息格式错误' });
    }

    if (!graphId) {
      return res.status(400).json({ error: '图谱ID不能为空' });
    }

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 使用 Agent 模式执行（无迭代限制）
    const result = await chat(messages, maxIterations || Infinity, graphId);

    res.json({
      success: result.success,
      iterations: result.iterations,
      message: result.message,
      executionTrace: result.executionTrace,
      summary: result.summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE 流式聊天接口
router.post('/chat/stream', authMiddleware, async (req, res) => {
  // 创建 AbortController 用于取消
  const abortController = new AbortController();
  const signal = abortController.signal;

  const { graphId } = req.body;
  const userId = req.user.id;

  // 注册此对话
  registerConversation(graphId, userId, abortController);

  // 心跳间隔（毫秒），0 表示禁用
  const heartbeatInterval = parseInt(process.env.SSE_HEARTBEAT_INTERVAL || '30', 10) * 1000;
  let heartbeatTimer = null;

  // 启动心跳
  const startHeartbeat = () => {
    if (heartbeatInterval > 0) {
      heartbeatTimer = setInterval(() => {
        if (!signal.aborted && res.writable) {
          res.write(': ping\n\n');
        }
      }, heartbeatInterval);
    }
  };

  // 停止心跳
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  try {
    const { messages, maxIterations } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '消息格式错误' });
    }

    if (!graphId) {
      return res.status(400).json({ error: '图谱ID不能为空' });
    }

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, userId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 启动心跳
    startHeartbeat();

    // 检查是否已取消（轮询 Redis 状态，检测其他实例的取消操作）
    const checkCancellation = async () => {
      if (signal.aborted) return true;
      try {
        const cancelled = await isConversationCancelled(graphId, userId);
        if (cancelled) {
          abortController.abort();
          return true;
        }
      } catch (error) {
        // 忽略错误，继续执行
      }
      return false;
    };

    const sendEvent = (data) => {
      // 检查是否已取消
      if (signal.aborted) {
        return;
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 启动取消检查轮询（每 500ms）
    const cancelCheckInterval = setInterval(async () => {
      if (await checkCancellation()) {
        clearInterval(cancelCheckInterval);
      }
    }, 500);

    // 发送用户需求
    const userMsg = messages.find(m => m.role === 'user');
    sendEvent({ type: 'start', message: userMsg?.content || '' });

    // 获取当前图谱状态（排除 embedding 字段以减少响应大小）
    const rawNodes = nodeOperations.getByGraphId(graphId);
    const currentNodes = rawNodes.map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    const currentEdges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    sendEvent({ type: 'graph', nodes: currentNodes, edges: currentEdges });

    // Agent 模式执行（传递 signal）
    const result = await agentChat(messages, maxIterations || Infinity, sendEvent, graphId, signal);

    // 发送完成事件
    sendEvent({
      type: 'done',
      success: result.success,
      iterations: result.iterations,
      message: result.message?.content || '',
      summary: result.summary,
      cancelled: result.cancelled || false
    });

    // 清理注册
    stopHeartbeat();
    clearInterval(cancelCheckInterval);
    clearConversation(graphId, userId);
    res.end();
  } catch (error) {
    // 如果是取消操作，不发送错误
    if (signal.aborted) {
      sendEvent({ type: 'cancelled', message: '对话已被用户取消' });
      stopHeartbeat();
      clearInterval(cancelCheckInterval);
      clearConversation(graphId, userId);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    stopHeartbeat();
    clearInterval(cancelCheckInterval);
    clearConversation(graphId, userId);
    res.end();
  }
});

// 取消对话接口
router.post('/chat/cancel', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.body;
    const userId = req.user.id;

    if (!graphId) {
      return res.status(400).json({ error: '图谱ID不能为空' });
    }

    const cancelled = cancelConversation(graphId, userId);

    if (cancelled) {
      res.json({ success: true, message: '对话已取消' });
    } else {
      res.json({ success: false, message: '没有正在进行的对话' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取可用工具
router.get('/tools', (req, res) => {
  const { tools } = require('../llmService.js');
  res.json(tools);
});

// 获取 MCP 状态
router.get('/mcp/status', (req, res) => {
  try {
    const { getMCPStatus } = require('../mcpClient.js');
    const status = getMCPStatus();
    res.json(status);
  } catch (error) {
    res.json({
      connected: false,
      degraded: true,
      message: 'MCP 服务不可用: ' + error.message
    });
  }
});

export default router;
