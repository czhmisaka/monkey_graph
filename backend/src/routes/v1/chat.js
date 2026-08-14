import express from 'express';
import { graphOperations, nodeOperations, edgeOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import { chat, agentChat, tools } from '../../llmService.js';
import { registerConversation, cancelConversation, clearConversation, isConversationCancelled } from '../../conversationStore.js';
import { getMCPStatus } from '../../mcpClient.js';
import { chatRateLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// ========== 聊天接口（需要认证）==========

// 发送消息 (Agent 模式)
router.post('/chat', authMiddleware, chatRateLimiter, async (req, res) => {
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
router.post('/chat/stream', authMiddleware, chatRateLimiter, async (req, res) => {
  // 创建 AbortController 用于取消
  const abortController = new AbortController();
  const signal = abortController.signal;

  const { graphId } = req.body;
  const userId = req.user.id;

  // SSE 超时配置（默认 5 分钟，防止连接无限保持）
  const SSE_TIMEOUT = parseInt(process.env.SSE_TIMEOUT || '300', 10) * 1000;
  let sseTimeoutTimer = null;
  let timedOut = false;
  let cleanedUp = false;

  // 心跳间隔（毫秒），0 表示禁用
  const heartbeatInterval = parseInt(process.env.SSE_HEARTBEAT_INTERVAL || '30', 10) * 1000;
  let heartbeatTimer = null;
  let cancelCheckInterval = null;

  // 启动心跳
  const startHeartbeat = () => {
    if (heartbeatInterval > 0) {
      heartbeatTimer = setInterval(() => {
        if (!signal.aborted && res.writable && !timedOut) {
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

  // SSE 超时保护
  const startSseTimeout = () => {
    if (SSE_TIMEOUT > 0) {
      sseTimeoutTimer = setTimeout(() => {
        timedOut = true;
        abortController.abort();
        if (res.writable) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: '请求超时，连接已关闭' })}\n\n`);
        }
        cleanup();
        res.end();
      }, SSE_TIMEOUT);
    }
  };

  const clearSseTimeout = () => {
    if (sseTimeoutTimer) {
      clearTimeout(sseTimeoutTimer);
      sseTimeoutTimer = null;
    }
  };

  // 统一清理函数（幂等）
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    stopHeartbeat();
    clearSseTimeout();
    if (cancelCheckInterval) clearInterval(cancelCheckInterval);
    if (graphId && userId) clearConversation(graphId, userId);
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

    // 校验通过后才注册对话（避免失败请求泄漏 Map 条目）
    registerConversation(graphId, userId, abortController);

    // 客户端断开时统一清理（心跳、超时、轮询、LLM 任务）
    req.on('close', () => {
      if (!signal.aborted) abortController.abort();
      cleanup();
    });

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 启动心跳与超时保护
    startHeartbeat();
    startSseTimeout();

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
      if (signal.aborted || timedOut) {
        return;
      }
      if (res.writable) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // 启动取消检查轮询（每 500ms）
    cancelCheckInterval = setInterval(async () => {
      if (await checkCancellation()) {
        clearInterval(cancelCheckInterval);
        cancelCheckInterval = null;
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

    // 清理
    cleanup();
    res.end();
  } catch (error) {
    // 如果是取消操作，不发送错误
    if (signal.aborted) {
      sendEvent({ type: 'cancelled', message: '对话已被用户取消' });
      cleanup();
      res.end();
      return;
    }
    if (res.writable) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    }
    cleanup();
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
  res.json(tools);
});

// 获取 MCP 状态
router.get('/mcp/status', (req, res) => {
  try {
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
