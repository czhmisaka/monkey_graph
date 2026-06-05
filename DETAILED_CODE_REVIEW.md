# 🐒 MonkeyGraph 详细代码审核报告

> **审核日期**: 2026-04-15  
> **审查人**: AI Assistant  
> **项目版本**: 5cde6e11d15227138fad1eafb6aa2da524261f9b

---

## 📋 目录

1. [安全漏洞深度分析](#一安全漏洞深度分析)
2. [前端代码质量问题](#二前端代码质量问题)
3. [后端代码逻辑问题](#三后端代码逻辑问题)
4. [代码规范问题](#四代码规范问题)
5. [性能优化建议](#五性能优化建议)
6. [优先级修复建议](#六优先级修复建议)
7. [综合评分](#七综合评分)

---

## 一、安全漏洞深度分析

### 🚨 CRITICAL - 必须立即修复

#### 1.1 XSS 漏洞：ChatPanel.vue 使用 v-html 渲染 LLM 内容

**位置**: `frontend/src/components/ChatPanel.vue`

```vue
<!-- 第 52-125 行 -->
<div class="trace-content" v-html="formatContent(trace.content)"></div>
<div class="message-text" v-html="formatContent(msg.content)"></div>
<div class="final-reply">
  <div class="reply-label">最终回复:</div>
  <div class="message-text" v-html="formatContent(msg.content)"></div>
</div>
```

**风险**: 
- LLM 返回的内容可能包含恶意脚本
- 攻击者可以通过特殊构造的输入执行 XSS 攻击
- 会话劫持、Cookie 窃取等

**修复方案**:
```javascript
// 使用 DOMPurify 净化 HTML
import DOMPurify from 'dompurify';

const formatContent = (content) => {
  if (!content) return '';
  // 净化 HTML，保留基本格式
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['br', 'p', 'strong', 'em', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: []
  }).replace(/\n/g, '<br/>');
};
```

---

### ⚠️ HIGH - 高风险

#### 1.2 Rate Limiter 的 check-then-act 竞态条件

**位置**: `backend/src/middleware/rateLimit.js`

```javascript
// 第 58-70 行
let record = globalCache.get(key) || { count: 0, resetTime: ... };
if (Date.now() > record.resetTime) {
  record = { count: 0, resetTime: Date.now() + config.windowMs };
}
record.count++;
globalCache.set(key, record, config.windowMs);

// 检查是否超限
if (record.count > config.max) {
  // 这里返回错误
  return res.status(429).json({ ... });
}
```

**风险**:
- 多线程/并发请求可能导致计数不准确
- 攻击者可能绕过速率限制
- 内存存储的 check-then-act 不是原子操作

**修复方案**:
```javascript
// 使用原子操作或分布式锁
const key = `rate:${config.keyPrefix}:${ip}`;
const current = await redis.incr(key);
if (current === 1) {
  await redis.expire(key, Math.ceil(config.windowMs / 1000));
}
if (current > config.max) {
  return res.status(429).json({ ... });
}
```

---

#### 1.3 统一错误处理缺失

**位置**: `backend/src/routes/` 所有路由文件

```javascript
// 例如 routes/nodeOps.js, routes/edgeOps.js 等
res.status(500).json({ error: error.message }); // 直接暴露错误
```

**风险**:
- 原始错误信息可能泄露内部实现细节
- 数据库错误、文件路径可能暴露
- 不同路由错误响应格式不统一

**修复方案**:
```javascript
// 创建统一错误处理中间件
export const errorHandler = (err, req, res, next) => {
  const requestId = crypto.randomUUID();
  logger.error('【错误】', `${requestId}: ${err.message}`);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal Server Error' : err.message,
    code: err.code || 'INTERNAL_ERROR',
    requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};
```

---

### ✅ GOOD - 安全措施良好

#### 1.4 SQL 注入防护

- ✅ 所有数据库查询使用 better-sqlite3 参数化查询
- ✅ LIKE 查询使用 `escapeLikePattern()` 函数转义
- ✅ 查询参数全部通过 `?` 占位符传递

```javascript
// database.js 第 32-37 行
const escapeLikePattern = (str) => {
  if (!str) return '';
  return str.replace(/[%_\\]/g, '\\$&');
};
```

#### 1.5 认证/授权安全

- ✅ JWT_SECRET 必须通过环境变量配置，否则抛出错误
- ✅ ENCRYPTION_KEY 必须通过环境变量配置
- ✅ API Key 使用 AES-256-CBC 加密存储
- ✅ 密码使用 bcrypt 哈希存储
- ✅ CORS 配置支持环境变量白名单

#### 1.6 文件上传安全

- ✅ 三重验证：扩展名 + MIME 类型 + Magic Bytes
- ✅ 文件名清理函数移除危险字符
- ✅ 文件大小限制 50MB
- ✅ 文件数量限制 10 个

---

## 二、前端代码质量问题

### 🚨 CRITICAL - 必须立即修复

#### 2.1 GraphPanel.vue 内存泄漏

**位置**: `frontend/src/components/GraphPanel.vue`

**问题 1: Canvas 事件监听器未清理**
```javascript
// initGraph() 中添加的事件监听器
canvas.addEventListener('click', (e) => { ... });
canvas.addEventListener('mousemove', (e) => { ... });
canvas.addEventListener('mouseleave', () => { ... });

// onUnmounted 中没有清理
onUnmounted(() => {
  if (simulation) simulation.stop()
  if (resizeObserver) resizeObserver.disconnect()
  // ❌ 缺少: canvas.removeEventListener()
});
```

**问题 2: Web Worker 未清理**
```javascript
// initWorker() 创建的 Worker
forceWorker = new Worker(new URL('../workers/forceWorker.js', import.meta.url), { type: 'module' })

// onUnmounted 中没有终止
onUnmounted(() => {
  // ❌ 缺少: forceWorker?.terminate()
});
```

**问题 3: 大型数据结构未清理**
```javascript
// 缓存和数据结构
const textWidthCache = new Map()      // 可能持有 10000+ 条目
const nodeSizeCache = new Map()        // 可能持有 20000+ 条目
const nodePositions = new Map()        // 可能持有大量位置数据

// onUnmounted 中没有清理
```

**修复方案**:
```javascript
// 保存事件监听器引用以便清理
const canvasClickHandler = (e) => { ... };
const canvasMouseMoveHandler = (e) => { ... };
const canvasMouseLeaveHandler = () => { ... };

canvas.addEventListener('click', canvasClickHandler);
canvas.addEventListener('mousemove', canvasMouseMoveHandler);
canvas.addEventListener('mouseleave', canvasMouseLeaveHandler);

onUnmounted(() => {
  simulation?.stop();
  resizeObserver?.disconnect();
  
  // 清理事件监听器
  canvas?.removeEventListener('click', canvasClickHandler);
  canvas?.removeEventListener('mousemove', canvasMouseMoveHandler);
  canvas?.removeEventListener('mouseleave', canvasMouseLeaveHandler);
  
  // 清理 Web Worker
  forceWorker?.terminate();
  
  // 清理缓存
  textWidthCache.clear();
  nodeSizeCache.clear();
  nodePositions.clear();
  
  // 清理画布
  measureCanvas = null;
  measureCtx = null;
});
```

---

#### 2.2 ForceGraphPanel.vue 类似问题

**位置**: `frontend/src/components/graph/ForceGraphPanel.vue`

**问题**:
1. Canvas 事件监听器未清理
2. SSE 连接未显式关闭
3. 流式加载回调引用未清理
4. 大型数据结构未清理

```javascript
// 流式加载回调
let externalOnBatch = null;
let externalOnProgress = null;

// SSE 连接 (getGraphStream 方法中)
// 没有在组件卸载时关闭 reader

// onUnmounted 中没有清理
onUnmounted(() => {
  simulation?.stop();
  resizeObserver?.disconnect();
  // ❌ 缺少: externalOnBatch = null, externalOnProgress = null
  // ❌ 缺少: streamingNodes.value = [], streamingEdges.value = []
});
```

---

### ⚠️ HIGH - 高风险

#### 2.3 前端 Token 存储安全问题

**位置**: `frontend/src/api/index.js`

```javascript
// localStorage 易受 XSS 攻击
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token); // ❌
}
```

**风险**:
- XSS 攻击可直接窃取 Token
- localStorage 可被任何同源脚本访问

**修复方案**:
```javascript
// 方案1: 使用 HttpOnly Cookie (推荐)
// 需要后端配合设置

// 方案2: 加密存储
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.VUE_APP_TOKEN_KEY;

export function setToken(token) {
  const encrypted = CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
  localStorage.setItem(TOKEN_KEY, encrypted);
}

export function getToken() {
  const encrypted = localStorage.getItem(TOKEN_KEY);
  if (!encrypted) return null;
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

---

#### 2.4 SSE 连接断开处理不完善

**位置**: `frontend/src/api/index.js` - `streamMessage()` 和 `getGraphStream()`

```javascript
.catch(error => {
  // 只做了重试，没有通知用户连接状态
  if (retryCount < maxRetries) {
    retryCount++;
    setTimeout(attemptRequest, RETRY_DELAY);
  } else {
    reject(error); // 直接拒绝，没有友好提示
  }
});
```

**修复方案**:
```javascript
.catch(error => {
  if (retryCount < maxRetries) {
    retryCount++;
    onMessage?.({ type: 'retry', attempt: retryCount, maxRetries });
    setTimeout(attemptRequest, RETRY_DELAY);
  } else {
    onMessage?.({ 
      type: 'error', 
      message: '连接断开，请刷新页面重试',
      canRetry: true 
    });
    reject(error);
  }
});
```

---

## 三、后端代码逻辑问题

### ⚠️ HIGH - 高风险

#### 3.1 Agent 配额检查顺序问题

**位置**: `backend/src/agentAuth.js` 第 35-44 行

```javascript
// 先检查配额，再增加计数
if (!agentOperations.checkQuota(agent)) {
  return res.status(429).json({ ... });
}
// 这里增加计数
agentOperations.incrementRequestCount(agent.id);
```

**问题**:
- 如果配额刚好用完，最后一个合法请求可能通过检查
- 并发情况下可能出现配额超限

**修复方案**:
```javascript
// 方案1: 使用原子操作
const newCount = await atomicIncrementAndCheck(agent.id);
if (newCount > agent.monthly_quota) {
  return res.status(429).json({ error: '月度请求配额已用完' });
}

// 方案2: 先增加再检查
agentOperations.incrementRequestCount(agent.id);
const updatedAgent = agentOperations.getById(agent.id);
if (!agentOperations.checkQuota(updatedAgent)) {
  // 回滚
  agentOperations.decrementRequestCount(agent.id);
  return res.status(429).json({ error: '月度请求配额已用完' });
}
```

---

#### 3.2 LLM 服务错误处理不统一

**位置**: `backend/src/llmService.js`

```javascript
// 缺少请求超时处理
const response = await openai.chat.completions.create({
  model: currentModel,
  messages: conversationHistory,
  tools: tools,
  tool_choice: 'auto',
  temperature: 0.7
  // ❌ 缺少 timeout 配置
});
```

**修复方案**:
```javascript
import { setTimeout } from 'timers/promises';

const response = await Promise.race([
  openai.chat.completions.create({
    model: currentModel,
    messages: conversationHistory,
    tools: tools,
    tool_choice: 'auto',
    temperature: 0.7
  }),
  setTimeout(60000, 'timeout') // 60秒超时
]);

if (response === 'timeout') {
  throw new Error('LLM 请求超时，请稍后重试');
}
```

---

#### 3.3 内存存储 Map/Set 非原子操作

**位置**: 
- `backend/src/middleware/rateLimit.js` - `blacklistedIPs` Set
- `backend/src/routes/chat.js` - `activeConversations` Map
- `backend/src/tasks/taskManager.js` - `tasks` Map

```javascript
// chat.js 中的对话取消
export function cancelConversation(graphId) {
  const conversation = activeConversations.get(graphId);
  if (conversation && !conversation.signal.aborted) {
    conversation.abortController.abort();
    return true;
  }
  return false;
}

// 竞态条件：可能在 get 和 abort 之间被删除
```

**修复方案**:
```javascript
// 使用互斥锁
const conversationMutex = new Map();

export function cancelConversation(graphId) {
  const mutex = conversationMutex.get(graphId);
  if (mutex) {
    return false; // 已经有取消操作在进行
  }
  
  const lock = { released: false };
  conversationMutex.set(graphId, lock);
  
  try {
    const conversation = activeConversations.get(graphId);
    if (conversation && !conversation.signal.aborted) {
      conversation.abortController.abort();
      return true;
    }
    return false;
  } finally {
    conversationMutex.delete(graphId);
  }
}
```

---

## 四、代码规范问题

### ⚠️ MEDIUM - 中等风险

#### 4.1 日志输出不统一

**混用 console 和 logger**:
- `backend/src/database.js` 使用 `console.log`, `console.error`
- `backend/src/services/embeddingService.js` 使用 `console.log`, `console.warn`, `console.error`
- `backend/src/mcpClient.js` 使用 `logger`
- `backend/src/llmService.js` 使用 `logger`

**修复建议**:
```javascript
// embeddingService.js
// 替换前
console.log(`[Embedding API] 批量请求: ${validTexts.length} 个文本`);
console.error('[Embedding API] ❌ 获取 embedding 失败:', error.message);

// 替换后
import logger from '../logger.js';
logger.info('【Embedding】', `批量请求: ${validTexts.length} 个文本`);
logger.error('【Embedding】', `获取 embedding 失败: ${error.message}`);
```

---

#### 4.2 缺少输入验证

**位置**: 大部分路由文件

```javascript
// routes/auth.js - 缺少密码强度验证
router.post('/auth/register', (req, res) => {
  const { username, password } = req.body;
  // ❌ 没有验证密码复杂度
  // ❌ 没有验证用户名长度
});

// 修复建议
const passwordSchema = z.string()
  .min(8, '密码至少8位')
  .regex(/[A-Z]/, '密码必须包含大写字母')
  .regex(/[a-z]/, '密码必须包含小写字母')
  .regex(/[0-9]/, '密码必须包含数字');

const usernameSchema = z.string()
  .min(3, '用户名至少3位')
  .max(20, '用户名最多20位')
  .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线');
```

---

#### 4.3 缺少单元测试

**现状**: 项目没有测试框架和测试用例

**建议引入**:
```bash
# 后端
npm install -D jest @types/jest ts-jest

# 前端
npm install -D vitest @vue/test-utils jsdom
```

---

## 五、性能优化建议

### ⚡ HIGH - 高优先级

#### 5.1 GraphPanel 性能优化

**问题 1: findNodeAtPoint 线性搜索**
```javascript
// 当前实现：O(n) 线性搜索
const findNodeAtPoint = (x, y) => {
  if (!nodesData || nodesData.length === 0) {
    return null;
  }
  // 直接线性搜索所有节点 ❌
  for (const node of nodesData) { ... }
};
```

**修复方案**:
```javascript
// 使用 SpatialIndex 进行 O(log n) 搜索
const findNodeAtPoint = (x, y) => {
  if (!spatialIndex) return null;
  return spatialIndex.findNodeAtPoint(x, y, 22); // 搜索半径22px
};
```

**问题 2: render 中多次 findNodesByViewport**
```javascript
// 当前实现：每帧多次计算可见节点
const render = () => {
  // 边渲染时调用
  const visibleEdges = getVisibleEdges(); // 计算1
  
  // 节点渲染时调用
  const visibleNodes = getVisibleNodes(); // 计算2
  // ...
};
```

**修复方案**:
```javascript
// 缓存可见性计算结果
let cachedVisibleNodes = [];
let cachedVisibleEdges = [];
let lastViewTransform = null;

const invalidateVisibility = () => {
  cachedVisibleNodes = null;
  cachedVisibleEdges = null;
};

const getVisibleNodes = () => {
  if (cachedVisibleNodes && transform === lastViewTransform) {
    return cachedVisibleNodes;
  }
  // 计算...
  cachedVisibleNodes = result;
  lastViewTransform = transform;
  return result;
};
```

---

#### 5.2 数据库连接池优化

**当前问题**: better-sqlite3 单连接，高并发受限

**建议**:
```javascript
// database.js
// 启用 WAL 模式（已有）
db.pragma('journal_mode = WAL');

// 优化参数
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB 缓存
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB 内存映射
```

---

## 六、优先级修复建议

### 🔴 P0 - 立即修复 (24小时内)

| 优先级 | 问题 | 位置 | 修复方式 |
|--------|------|------|----------|
| P0 | XSS 漏洞 | ChatPanel.vue | 使用 DOMPurify 净化 HTML |
| P0 | GraphPanel 内存泄漏 | GraphPanel.vue | 完善 onUnmounted 清理 |
| P0 | ForceGraphPanel 内存泄漏 | ForceGraphPanel.vue | 完善 onUnmounted 清理 |

### 🟠 P1 - 短期优化 (1周内)

| 优先级 | 问题 | 位置 | 修复方式 |
|--------|------|------|----------|
| P1 | 统一错误处理 | routes/*.js | 创建错误处理中间件 |
| P1 | Rate Limiter 竞态 | rateLimit.js | 使用 Redis 原子操作 |
| P1 | 日志不统一 | 多文件 | 统一使用 logger |
| P1 | Token 存储安全 | api/index.js | 加密存储或使用 Cookie |

### 🟡 P2 - 中期规划 (1月内)

| 优先级 | 问题 | 位置 | 修复方式 |
|--------|------|------|----------|
| P2 | 缺少单元测试 | 全项目 | 引入 Jest/Vitest |
| P2 | 输入验证缺失 | routes/*.js | 引入 Zod 验证 |
| P2 | LLM 超时处理 | llmService.js | 添加请求超时 |
| P2 | 性能优化 | GraphPanel.vue | 使用空间索引 |

---

## 七、综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **安全性** | ⭐⭐⭐☆☆ | XSS 漏洞、Rate Limiter 竞态、Token 存储 |
| **可维护性** | ⭐⭐⭐⭐☆ | 路由已拆分，组件化良好，但缺少统一错误处理 |
| **性能** | ⭐⭐⭐⭐⭐ | Canvas 渲染优化、增量渲染、空间索引优秀 |
| **代码规范** | ⭐⭐⭐☆☆ | 日志不统一，缺少测试 |
| **错误处理** | ⭐⭐⭐☆☆ | 缺少统一错误处理机制 |

**综合评分: 7/10**

### 相比上次审核 (6.5/10) 提升原因:
1. ✅ SQL 注入已修复
2. ✅ 文件上传安全已完善
3. ✅ JWT_SECRET、ENCRYPTION_KEY 必须通过环境变量
4. ✅ 路由已拆分为模块化结构
5. ❌ 发现新的 XSS 漏洞需修复
6. ❌ 内存泄漏问题需要修复

---

## 📞 总结

项目整体代码质量良好，特别是在安全方面相比上次审核有显著改进。主要需要关注的是：

1. **XSS 漏洞** - 必须立即修复，使用 DOMPurify 净化 LLM 返回的 HTML 内容
2. **内存泄漏** - GraphPanel 和 ForceGraphPanel 需要完善 onUnmounted 清理逻辑
3. **错误处理** - 需要建立统一的错误处理中间件
4. **日志统一** - 全项目统一使用 logger 模块

建议优先修复 P0 级别的安全问题，然后逐步优化 P1、P2 级别的改进项。

**祝编码愉快！🐒**
