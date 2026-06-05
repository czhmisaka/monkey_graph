# 🐒 MonkeyGraph 代码审查报告

> 审查日期: 2026-04-09  
> 审查人: AI Assistant  
> 项目版本: 460eb650c373b7747b6906dfea6cd2fa3f03ca98

---

## 📋 审查历史

### 2026-04-09 (第二次审查)

| 问题 | 状态 | 修复说明 |
|------|------|----------|
| SQL LIKE 注入风险 | ✅ **已修复** | 添加 `escapeLikePattern()` 函数转义特殊字符 |
| 文件上传安全 | ✅ **已修复** | 添加 MIME 类型验证、文件名清理 |

**修复的文件**:
- `backend/src/database.js` - 添加 SQL LIKE 转义
- `backend/src/routes/_upload.js` - 增强文件上传安全

---

### 2026-03-31 (第一次审查)

| 问题 | 状态 | 修复说明 |
|------|------|----------|
| JWT_SECRET 硬编码 | ✅ **已修复** | 必须通过环境变量配置 |
| ENCRYPTION_KEY 硬编码 | ✅ **已修复** | 必须通过环境变量配置 |
| 默认管理员凭据暴露 | ✅ **已修复** | 生产环境必须配置环境变量 |
| CORS 配置过宽 | ✅ **已修复** | 支持 ALLOWED_ORIGINS 环境变量 |
| MCP 重连竞态 | ✅ **已修复** | 添加 MAX_INIT_ATTEMPTS 限制和降级模式 |
| 前端资源清理 | ✅ **已修复** | ForceGraphPanel.vue 已正确清理资源 |

---

## 📋 项目概述

| 项目 | 描述 |
|------|------|
| **名称** | MonkeyGraph (知识图谱对话构建系统) |
| **技术栈** | Node.js + Express + SQLite / Vue 3 + D3.js |
| **主要功能** | Agent 模式对话、MCP 网络搜索、向量嵌入、语义搜索 |

---

## 🔴 严重问题 (Critical Issues)

### 1. 硬编码密钥和默认值 ⚠️

**位置**: `backend/src/database.js`, `backend/src/auth.js`

```javascript
// ❌ database.js - 危险!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'monkeygraph-encryption-key-2024';

// ❌ auth.js - 危险!
const JWT_SECRET = process.env.JWT_SECRET || 'monkeygraph-secret-key-2024';
```

**风险**: 
- 如果环境变量未设置，系统使用默认密钥
- 攻击者可利用默认密钥解密敏感数据或伪造 JWT

**修复建议**:
```javascript
// ✅ 验证密钥存在，不存在则抛出错误
const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量未设置');
}
```

---

### 2. 默认管理员凭据暴露 ⚠️

**位置**: `backend/src/index.js`

```javascript
// ❌ createDefaultAdmin() 函数
const hashedPassword = bcrypt.hashSync('admin123', 10);
db.prepare(`
  INSERT INTO users (id, username, password, is_admin)
  VALUES (?, ?, ?, ?)
`).run(adminId, 'admin', hashedPassword, 1);
```

**风险**: 
- 生产环境中任何人都可使用 admin/admin123 登录
- 攻击者可直接获取管理员权限

**修复建议**:
```javascript
// ✅ 仅在非生产环境创建默认账户
if (process.env.NODE_ENV !== 'production') {
  // 创建默认账户...
} else {
  // 生产环境必须通过环境变量配置管理员
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    throw new Error('生产环境必须配置管理员账户');
  }
}
```

---

### 3. SQL 注入风险 ⚠️

**位置**: `backend/src/routes.js` 多处

```javascript
// ❌ 未验证的 LIKE 查询
router.get('/graphs/:graphId/nodes/search/:keyword', (req, res) => {
  const keyword = req.params.keyword;
  // 直接拼接到 SQL
  return db.prepare(`
    SELECT * FROM nodes 
    WHERE graph_id = ? AND (label LIKE ? OR type LIKE ?)
  `).all(graphId, `%${keyword}%`, `%${keyword}%`);
});
```

**风险**: 
- 用户输入 `keyword = "% OR 1=1--"` 可绕过权限
- 可枚举数据库内容

**修复建议**:
```javascript
// ✅ 使用参数化查询 + 输入验证
import validator from 'validator';

const keyword = validator.escape(req.params.keyword);
if (!validator.isLength(keyword, { min: 1, max: 100 })) {
  return res.status(400).json({ error: '关键词长度超出限制' });
}

// 或使用白名单验证
const safeKeyword = keyword.replace(/[%_]/g, '\\$&'); // 转义通配符
```

---

### 4. 文件上传安全 ⚠️

**位置**: `backend/src/routes.js`

```javascript
// ❌ 仅检查扩展名
fileFilter: (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.md', '.markdown', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'));
  }
}
```

**风险**:
- 可通过 `test.pdf.exe` 等方式绕过
- 未验证文件魔数 (Magic Bytes)
- 未限制文件名特殊字符

**修复建议**:
```javascript
// ✅ 多重验证
const allowedExtensions = ['.pdf', '.md', '.txt'];
const allowedMimeTypes = [
  'application/pdf',
  'text/plain',
  'text/markdown'
];

const ext = path.extname(file.originalname).toLowerCase();
const mime = file.mimetype;

if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(mime)) {
  return cb(new Error('不支持的文件类型'));
}

// 验证文件魔数
const buffer = Buffer.alloc(8);
fs.createReadStream(file.path, { start: 0, end: 7 }).read(buffer);
// 检查 PDF: %PDF, 文本: 无特殊头部
```

---

### 5. Agent API Key 安全 ⚠️

**位置**: `backend/src/database.js`

```javascript
// ❌ rotateApiKey 返回完整密钥无限制
rotateApiKey(id) {
  const newApiKey = crypto.randomUUID().replace(/-/g, '');
  db.prepare('UPDATE agents SET api_key = ? ...').run(newApiKey, id);
  return agentOperations.getById(id, true); // includeApiKey=true
}
```

**风险**:
- API Key 以明文形式在日志/响应中暴露
- 无请求频率限制，可被暴力遍历

**修复建议**:
```javascript
// ✅ 添加 IP 白名单和频率限制
const rateLimitStore = new Map();

// 在 agentAuthMiddleware 中
const clientIp = req.ip;
const rateKey = `agent:${agent.id}:${clientIp}`;
const count = rateLimitStore.get(rateKey) || 0;

if (count > 100) { // 每分钟限制
  return res.status(429).json({ error: '请求过于频繁' });
}
rateLimitStore.set(rateKey, count + 1);
```

---

## 🟠 中等问题 (Medium Issues)

### 6. 错误处理不一致

**现状**: 部分路由返回详细错误，部分返回 500 无信息

```javascript
// ❌ 不统一的错误处理
router.post('/graphs', (req, res) => {
  try {
    // ...
  } catch (error) {
    res.status(500).json({ error: error.message }); // 暴露内部错误
  }
});

// ✅ 统一错误响应
const errorHandler = (err, req, res, next) => {
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}]`, err);
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    requestId,
    ...(process.env.NODE_ENV !== 'production' && { details: err.message })
  });
};
```

---

### 7. 日志记录级别混乱

**现状**: 混合使用 `console.log` 和 `logger`

```javascript
// ❌ 混合使用
console.log('节点发送完成');      // 应该用 logger
logger.info(p, '✅ 任务完成');    // 正确
console.error('错误:', err);      // 应该用 logger.error
```

**修复**: 统一使用 `logger` 模块，移除所有 `console.*` 调用

---

### 8. MCP 客户端重连竞态

**位置**: `backend/src/mcpClient.js`

```javascript
// ⚠️ 竞态条件
if (isDegraded && !forceReconnect) {
  return; // 降级模式下跳过重连
}

// 但定时器可能同时触发多次
reconnectTimer = setTimeout(() => {
  initMCPClient(true).catch(...); // 可能同时执行多次
}, 30000);
```

**修复建议**: 添加互斥锁防止并发重连

---

### 9. 数据库单连接

**现状**: `better-sqlite3` 单连接，高并发受限

**修复建议**:
```javascript
// 方案1: 使用连接池
import Database from 'better-sqlite3';
const dbPool = {
  primary: new Database('main.db'),
  replicas: [new Database('replica1.db'), new Database('replica2.db')]
};

// 方案2: WAL 模式优化
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB 缓存
```

---

### 10. 前端资源泄漏

**位置**: `frontend/src/components/GraphPanel.vue`

```javascript
// ❌ 未清理资源
onUnmounted(() => {
  if (simulation) simulation.stop();
  // 缺少: resizeObserver.disconnect();
  // 缺少: forceWorker.terminate();
})
```

**修复**:
```javascript
onUnmounted(() => {
  simulation?.stop();
  resizeObserver?.disconnect();
  forceWorker?.terminate();
  measureCanvas = null;
  measureCtx = null;
  textWidthCache.clear();
  nodeSizeCache.clear();
})
```

---

## 🟡 建议改进 (Improvements)

### 11. 代码组织

**问题**: `routes.js` 超过 3000 行，难以维护

**建议拆分**:
```
routes/
├── index.js           # 路由汇总
├── auth.js            # 认证相关
├── graphs.js          # 图谱 CRUD
├── nodes.js           # 节点操作
├── edges.js           # 边操作
├── chat.js            # 对话接口
├── embedding.js       # 向量搜索
└── agent.js          # Agent API
```

---

### 12. 输入验证

**现状**: 大量接口缺少参数校验

**建议使用 zod**:
```javascript
import { z } from 'zod';

const createNodeSchema = z.object({
  label: z.string().min(1).max(200),
  type: z.enum(['person', 'organization', 'concept', 'location', 'default']),
  properties: z.record(z.any()).optional(),
  x: z.number().optional(),
  y: z.number().optional()
});

router.post('/graphs/:graphId/nodes', (req, res) => {
  const result = createNodeSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ 
      error: '参数验证失败',
      details: result.error.issues 
    });
  }
  // ...
});
```

---

### 13. CORS 配置

**现状**:
```javascript
app.use(cors()); // 允许所有来源
```

**建议**:
```javascript
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:13002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
```

---

### 14. GraphPanel.vue 性能优化

**当前问题**:
- 四叉树每次数据变化都全量重建
- 缓存无过期机制
- LOD 逻辑复杂

**建议**:
```javascript
// 使用增量更新代替全量重建
const updateIndexes = (changedNodes, deletedNodeIds) => {
  spatialIndex.remove(deletedNodeIds);
  spatialIndex.insert(changedNodes);
};

// 添加缓存过期时间
const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const nodeCache = new Map();

const getCachedNode = (nodeId) => {
  const cached = nodeCache.get(nodeId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
};
```

---

## ✅ 做得好的地方

| 方面 | 评价 |
|------|------|
| **模块化设计** | 后端按职责分离，前端组件化，结构清晰 |
| **数据库索引** | 为常用查询字段创建了索引 (idx_nodes_graph_id, idx_edges_source 等) |
| **事务支持** | 批量操作使用 `db.transaction()` 保证一致性 |
| **API 版本管理** | `/api/agent/` 前缀分离不同版本的 API |
| **日志系统** | 统一的日志记录器，支持多级别 |
| **安全实践** | 密码 bcrypt 哈希、API Key 加密存储、JWT 认证 |
| **错误处理** | AI 工具调用失败时有降级处理和重试机制 |
| **类型注释** | 大部分函数有 JSDoc 注释 |

---

## 📊 代码质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **安全性** | ⭐⭐⭐☆☆ | 密钥硬编码、SQL注入风险、CORS过宽 |
| **可维护性** | ⭐⭐⭐⭐☆ | 代码组织良好，但 routes.js 过胖 (3000+ 行) |
| **性能** | ⭐⭐⭐⭐☆ | Canvas 渲染优化好，数据库可加连接池 |
| **测试覆盖** | ⭐⭐☆☆☆ | 缺少单元测试和集成测试 |
| **文档** | ⭐⭐⭐⭐☆ | 有 README 和代码注释 |

**综合评分: 6.5/10**

---

## 🔧 推荐行动项

### 立即修复 (P0)

| 优先级 | 问题 | 修复方式 |
|--------|------|----------|
| 🔴 P0 | 修改硬编码密钥 | 创建 `.env` 文件，使用 `dotenv` 加载 |
| 🔴 P0 | 禁用默认管理员 | 仅非生产环境创建，或完全移除 |
| 🔴 P0 | SQL 参数验证 | 使用 `validator` 库验证输入 |
| 🔴 P0 | 限制 CORS | 配置白名单域名 |

### 短期优化 (P1)

| 优先级 | 问题 | 修复方式 |
|--------|------|----------|
| 🟠 P1 | 拆分 routes.js | 按职责拆分为多个文件 |
| 🟠 P1 | 添加参数验证 | 引入 zod/schema-utils |
| 🟠 P1 | 统一日志 | 移除所有 console.* 调用 |
| 🟠 P1 | 清理资源泄漏 | 在 onUnmounted 中清理 |

### 长期规划 (P2)

| 优先级 | 问题 | 修复方式 |
|--------|------|----------|
| 🟡 P2 | API 限流 | 引入 rate-limiter-flexible |
| 🟡 P2 | 数据库连接池 | 配置 better-sqlite3 WAL 模式 |
| 🟡 P2 | 缓存层 | 引入 Redis 缓存热点数据 |
| 🟡 P2 | 单元测试 | 引入 Jest/Vitest 测试框架 |

---

## 📁 关键文件清单

| 文件路径 | 重要性 | 说明 |
|----------|--------|------|
| `backend/src/index.js` | ⭐⭐⭐⭐⭐ | 入口文件，包含默认管理员创建 |
| `backend/src/database.js` | ⭐⭐⭐⭐⭐ | 核心数据库操作，硬编码密钥 |
| `backend/src/auth.js` | ⭐⭐⭐⭐⭐ | JWT 认证，硬编码密钥 |
| `backend/src/routes.js` | ⭐⭐⭐⭐⭐ | 主路由，3000+ 行，SQL 注入风险 |
| `backend/src/llmService.js` | ⭐⭐⭐⭐ | AI 服务，包含工具执行逻辑 |
| `backend/src/mcpClient.js` | ⭐⭐⭐⭐ | MCP 客户端，网络搜索功能 |
| `frontend/src/components/GraphPanel.vue` | ⭐⭐⭐⭐ | 核心可视化组件，资源泄漏 |
| `backend/src/agentAuth.js` | ⭐⭐⭐ | Agent 认证中间件 |

---

## 📞 联系方式

如有问题，请联系项目维护者或提交 Issue。

**祝编码愉快！🐒**
