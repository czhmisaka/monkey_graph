# 🐒 MonkeyGraph SaaS 升级设计方案

> 版本: 1.0  
> 日期: 2026-03-10  
> 状态: ✅ 已完成

---

## 一、项目概述

### 1.1 目标

将 MonkeyGraph 从单一租户知识图谱工具升级为 **多租户 SaaS 服务**，支持：

- 多企业/团队共享同一套系统
- 数据完全隔离
- 按套餐使用量计费
- 租户管理后台

### 1.2 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent 认证 | ✅ 完成 | API Key + 配额管理 |
| Workspace | ✅ 完成 | 重构为租户体系 |
| 权限控制 | ✅ 完成 | 细粒度权限控制 |
| 批量操作 | ✅ 完成 | 500条/次 |
| 图算法 | ✅ 完成 | BFS/度统计/邻居 |
| 版本管理 | ✅ 完成 | 快照/回滚 |
| 多租户 SaaS | ✅ 完成 | 平台数据库、套餐系统 |
| 租户管理 | ✅ 完成 | 租户 CRUD、套餐切换 |
| 使用量统计 | ✅ 完成 | API 调用、存储、导出统计 |
| 管理员后台 | ✅ 完成 | 租户管理、运营统计 |

### 1.3 升级范围

```
当前版本                          目标版本
┌─────────────────┐            ┌─────────────────┐
│                 │            │                 │
│  单租户         │    →     │  多租户         │
│  免费使用        │    →     │  套餐计费       │
│  单一数据库      │    →     │  逻辑隔离        │
│  无管理后台      │    →     │  完整后台        │
│                 │            │                 │
└─────────────────┘            └─────────────────┘
```

---

## 二、架构设计

### 2.1 多租户模式

采用 **SQLite 文件级别隔离** 模式（每个租户独立数据库文件）：

```
┌──────────────────────────────────────────────────────────────────┐
│                        MonkeyGraph SaaS                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   租户 A (acme 公司)     租户 B (startup)      租户 C (个人)   │
│   ├─ graphs/             ├─ graphs/             ├─ graphs/       │
│   │  ├─ acme.db        │  ├─ startup.db       │  ├─ user123.db  │
│   │  │  ├─ graphs      │  │  ├─ graphs       │  │  ├─ graphs    │
│   │  │  ├─ nodes       │  │  ├─ nodes        │  │  ├─ nodes     │
│   │  │  └─ edges       │  │  └─ edges        │  │  └─ edges     │
│   │  └─ (其他表)       │  └─ (其他表)       │  └─ (其他表)    │
│   │                                                                   │
│   └─ 套餐: Enterprise    └─ 套餐: Team         └─ 套餐: Free    │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                        平台数据库 (monkeygraph.db)                 │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │ tenants     │ plans      │ subscriptions │ invoices     │   │
│   │ ───────────│ ───────────│ ─────────────│ ─────────────│   │
│   │ id          │ id         │ id            │ id           │   │
│   │ name        │ name       │ tenant_id     │ tenant_id    │   │
│   │ slug        │ price      │ plan_id       │ total        │   │
│   │ plan_id     │ features   │ status        │ status       │   │
│   │ settings    │            │ period_start  │ paid_at      │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**架构说明**：
- **平台数据库** (`monkeygraph.db`)：存储租户元数据、套餐、订阅、发票等
- **租户数据库** (`data/tenants/{tenant_id}.db`)：每个租户独立的 SQLite 文件，包含图谱、节点、边等业务数据

### 2.2 技术架构

```
                           ┌─────────────────┐
                           │   CDN / WAF     │
                           └────────┬────────┘
                                    │
                           ┌────────▼────────┐
                           │  Load Balancer  │
                           └────────┬────────┘
                                    │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
    ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
    │   Node 1    │       │   Node 2    │       │   Node 3    │
    │  (API)      │       │  (Worker)   │       │  (Worker)   │
    └──────┬──────┘       └─────────────┘       └─────────────┘
           │
           │           ┌─────────────┐       ┌─────────────┐
           └──────────►│  Platform   │◄─────│    Redis    │
                       │  DB (SQLite)│       │  (缓存/会话) │
                       └─────────────┘       └─────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
    │ Tenant A DB │    │ Tenant B DB │    │ Tenant C DB │
    │  (SQLite)   │    │  (SQLite)   │    │  (SQLite)   │
    └─────────────┘    └─────────────┘    └─────────────┘
```

**架构说明**：
- 使用 **SQLite 文件级别隔离**，每个租户拥有独立的数据库文件
- 平台数据库存储租户元数据、套餐、订阅等
- 租户数据库存储图谱、节点、Agent 等业务数据
- Redis 用于会话缓存，提高性能

---

## 三、数据库设计

### 3.1 核心表结构

#### 租户表 (tenants)

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- 公司/组织名称
  slug TEXT UNIQUE,                -- 租户标识 (用于子域名)
  plan_id TEXT DEFAULT 'free',     -- 当前套餐
  status TEXT DEFAULT 'active',    -- active/suspended/cancelled
  
  -- 账户信息
  owner_user_id TEXT,              -- 所有者用户
  contact_email TEXT,              -- 联系邮箱
  
  -- 配置
  settings JSON DEFAULT '{}',      -- 租户自定义配置
  custom_domain TEXT,              -- 自定义域名
  
  -- 时间
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### 套餐表 (plans)

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,               -- 套餐名称
  slug TEXT UNIQUE,                 -- 套餐标识
  
  -- 定价
  price_monthly REAL DEFAULT 0,    -- 月付
  price_yearly REAL DEFAULT 0,     -- 年付 (月付*12*0.8)
  
  -- 限额 (-1 = 无限)
  graphs_limit INTEGER DEFAULT 3,
  nodes_limit INTEGER DEFAULT 500,
  api_quota INTEGER DEFAULT 1000,
  agents_limit INTEGER DEFAULT 1,
  storage_mb INTEGER DEFAULT 10,
  snapshots_limit INTEGER DEFAULT 3,
  workspaces_limit INTEGER DEFAULT 1,
  max_export_resolution TEXT DEFAULT '1024',
  
  -- 功能
  features JSON DEFAULT '[]',       -- 功能列表
  
  -- 状态
  is_free INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### 订阅表 (subscriptions)

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  
  -- 计费周期
  billing_cycle TEXT DEFAULT 'monthly',  -- monthly/yearly
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  
  -- 状态
  status TEXT DEFAULT 'trialing',      -- trialing/active/past_due/cancelled
  
  -- 试用
  trial_start TEXT,
  trial_end TEXT,
  
  -- 支付信息
  payment_method TEXT,                  -- card/alipay/wechat
  payment_customer_id TEXT,
  payment_subscription_id TEXT,
  
  -- 取消
  cancel_at_period_end INTEGER DEFAULT 0,
  cancelled_at TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
```

#### 使用量记录 (usage_records)

```sql
CREATE TABLE usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  period TEXT NOT NULL,               -- 2026-03
  
  -- API 使用
  api_calls INTEGER DEFAULT 0,
  
  -- 存储
  storage_bytes INTEGER DEFAULT 0,
  
  -- 向量
  embeddings_count INTEGER DEFAULT 0,
  
  -- 导出
  export_count INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(tenant_id, period)
);
```

#### 发票表 (invoices)

```sql
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT,
  invoice_number TEXT UNIQUE,         -- INV-2026030001
  
  -- 金额
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  currency TEXT DEFAULT 'CNY',
  
  -- 状态
  status TEXT DEFAULT 'draft',        -- draft/issued/paid/void
  
  -- 周期
  period_start TEXT,
  period_end TEXT,
  
  -- 明细
  line_items JSON,
  
  -- 支付
  paid_at TEXT,
  payment_method TEXT,
  payment_transaction_id TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### 支付方式表 (payment_methods)

```sql
CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  
  -- 类型
  type TEXT NOT NULL,               -- card/alipay/wechat
  
  -- 网关
  gateway TEXT NOT NULL,            -- stripe/alipay
  gateway_customer_id TEXT,
  gateway_payment_method_id TEXT,
  
  -- 显示信息
  card_brand TEXT,
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  
  -- 状态
  is_default INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 3.2 租户数据库设计

由于采用文件级别隔离，每个租户拥有独立的 SQLite 数据库文件。租户数据库包含以下表：

```
data/tenants/{tenant_id}.db
├── graphs (图谱表)
├── nodes (节点表)
├── edges (边表)
├── agents (Agent 表)
├── workspaces (工作区表)
├── history (历史记录表)
├── graph_versions (版本快照表)
├── node_embeddings (向量索引表)
├── vec_nodes (向量数据表)
└── shared_knowledge (共享知识库) ⚡ NEW
```

#### Agent 数据共享设计

同一个租户下的多个 Agent 之间可以共享以下数据：

| 共享内容 | 说明 | 实现方式 |
|---------|------|---------|
| **图谱数据** | 可配置访问权限 | graphs 表 + agent_permissions |
| **共享知识库** | Agent 间共享的持久记忆 | shared_knowledge 表 |
| **对话历史** | 可选择共享或隔离 | history 表 + visibility 字段 |
| **工作区** | 可配置的共享空间 | workspaces 表 |
| **访问记录** | 可追溯数据被访问情况 | access_logs 表 ⚡ NEW |

#### 数据访问追溯

为了实现"谁访问了我的数据"的追溯需求，添加访问记录表：

```sql
-- 访问记录表（追踪数据被访问的情况）
CREATE TABLE IF NOT EXISTS data_access_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  
  -- 访问者
  accessor_agent_id TEXT NOT NULL,
  
  -- 被访问的数据
  data_type TEXT NOT NULL,  -- graph/knowledge/node/edge
  data_id TEXT NOT NULL,
  data_owner_agent_id TEXT NOT NULL,  -- 数据提供者/创建者
  
  -- 访问详情
  access_type TEXT NOT NULL,  -- read/write/query/search
  access_method TEXT,  -- api/chat/sse
  
  -- 访问内容摘要（可选，用于调试）
  query_summary TEXT,
  result_count INTEGER DEFAULT 0,
  
  -- 时间
  accessed_at TEXT DEFAULT (datetime('now'))
);

-- 创建索引
CREATE INDEX idx_access_logs_owner ON data_access_logs(data_owner_agent_id, accessed_at);
CREATE INDEX idx_access_logs_accessor ON data_access_logs(accessor_agent_id, accessed_at);
```

**访问追溯场景**：

```
┌─────────────────────────────────────────────────────────────────┐
│                      数据访问追溯流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent A 创建/提供图谱 "项目知识库"                              │
│         │                                                        │
│         ▼                                                        │
│  Agent B 通过 API 访问该图谱                                     │
│         │                                                        │
│         ▼                                                        │
│  系统记录访问日志                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ data_owner_agent_id: "agent_a"                          │   │
│  │ accessor_agent_id: "agent_b"                            │   │
│  │ data_type: "graph"                                     │   │
│  │ data_id: "graph_xxx"                                   │   │
│  │ access_type: "read"                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ▼                                                        │
│  Agent A 可查询：                                               │
│  "谁访问了我的数据？"                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ GET /api/agent/my-data-access-logs                      │   │
│  │ 返回：[{                                                │   │
│  │   accessor_agent_id: "agent_b",                         │   │
│  │   data_type: "graph",                                  │   │
│  │   accessed_at: "2026-03-10 16:00:00"                  │   │
│  │ }]                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Agent 隐私仪表盘

每个 Agent 可以查看自己数据的访问统计：

```javascript
// API: 获取数据被访问的情况
// GET /api/agent/my-data-access-logs

{
  "total_accesses": 15,
  "unique_accessors": 3,
  "access_by_type": {
    "graph": 8,
    "knowledge": 5,
    "node": 2
  },
  "recent_accesses": [
    {
      "data_type": "graph",
      "data_name": "项目知识库",
      "accessor_agent_id": "agent_b",
      "accessor_agent_name": "分析助手",
      "access_type": "read",
      "accessed_at": "2026-03-10 16:00:00"
    }
  ]
}
```

#### 数据访问控制策略

```javascript
// 访问控制决策流程
async function checkAccess(agentId, dataType, dataId, accessType) {
  // 1. 获取数据所有者
  const dataOwner = await getDataOwner(dataType, dataId);
  
  // 2. 如果是数据所有者，无限制访问
  if (agentId === dataOwner) {
    return { allowed: true, isOwner: true };
  }
  
  // 3. 检查数据可见性设置
  const visibility = await getVisibility(dataType, dataId);
  
  switch (visibility) {
    case 'shared':
      return { allowed: true, isOwner: false };
    case 'agent_specific':
      const allowed = await checkAgentList(dataId, agentId);
      return { allowed, isOwner: false };
    case 'private':
      return { allowed: false, reason: 'private_data' };
  }
  
  // 4. 记录访问日志
  await logAccess({
    accessor_agent_id: agentId,
    data_type: dataType,
    data_id: dataId,
    data_owner_agent_id: dataOwner,
    access_type: accessType
  });
}
```

#### 图谱权限控制

图谱数据支持细粒度的 Agent 权限控制：

```sql
-- 图谱表扩展（添加权限控制）
CREATE TABLE IF NOT EXISTS graphs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  settings TEXT DEFAULT '{}',
  
  -- 权限控制
  visibility TEXT DEFAULT 'private',  -- private/shared/agent_specific
  allowed_agent_ids TEXT DEFAULT '[]',  -- 可访问的 Agent 列表
  blocked_agent_ids TEXT DEFAULT '[]',  -- 禁止访问的 Agent 列表
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 图谱 Agent 权限表（更细粒度控制）
CREATE TABLE IF NOT EXISTS graph_agent_permissions (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  
  -- 权限级别
  permission_level TEXT DEFAULT 'read',  -- none/read/write/admin
  
  -- 操作限制
  can_export INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  can_share INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(graph_id, agent_id)
);
```

**图谱权限模式**：

```
┌─────────────────────────────────────────────────────────────────┐
│                      图谱权限控制                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  图谱 A (visibility = "private")                               │
│  └── 仅创建者 Agent A 可见                                      │
│                                                                 │
│  图谱 B (visibility = "shared")                                 │
│  └── 所有 Agent 可见（默认）                                    │
│                                                                 │
│  图谱 C (visibility = "agent_specific")                         │
│  ├── allowed_agent_ids = ["agent_a", "agent_b"]               │
│  └── 仅 Agent A 和 Agent B 可见                                │
│                                                                 │
│  图谱 D (细粒度权限)                                            │
│  ├── Agent A: read                                             │
│  ├── Agent B: write                                            │
│  └── Agent C: admin                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```sql
-- 共享知识库表
CREATE TABLE IF NOT EXISTS shared_knowledge (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSON DEFAULT '[]',
  embedding TEXT,
  
  -- 可见性控制
  visibility TEXT DEFAULT 'shared',  -- shared/agent_specific
  
  -- 关联 Agent（可选）
  created_by_agent_id TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 对话历史扩展（支持可见性）
CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  graph_id TEXT,
  messages JSON NOT NULL,
  
  -- 可见性：private/shared
  visibility TEXT DEFAULT 'private',
  shared_with_agent_ids JSON DEFAULT '[]',
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### Agent 隔离模式

支持两种模式：

```
┌─────────────────────────────────────────────────────────────────┐
│                     租户数据访问模式                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  模式1: 共享模式 (默认)                                         │
│  ┌─────────────┐                                                │
│  │  图谱数据    │ ◄── Agent A, B, C 全部可见                    │
│  │  共享知识库  │ ◄── Agent A, B, C 全部可见                    │
│  │  对话历史    │ ◄── 可配置共享/私有                           │
│  └─────────────┘                                                │
│                                                                 │
│  模式2: 隔离模式                                                │
│  ┌─────────────┐                                                │
│  │  图谱数据    │ ◄── Agent A, B, C 全部可见                    │
│  │  共享知识库  │ ◄── Agent A, B, C 全部可见                    │
│  │  对话历史 A  │ ◄── 仅 Agent A 可见                           │
│  │  对话历史 B  │ ◄── 仅 Agent B 可见                           │
│  │  私有记忆 A  │ ◄── 仅 Agent A 可见                           │
│  └─────────────┘                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**注意**：由于使用文件级别隔离，不需要在表中添加 tenant_id 字段，每个租户的数据完全物理隔离。

#### 租户数据库初始化脚本

```sql
-- 每个租户创建数据库时的初始化脚本
-- 节点表（无需 tenant_id）
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT DEFAULT 'default',
  properties TEXT DEFAULT '{}',
  embedding TEXT DEFAULT null,
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE
);

-- 边表
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT DEFAULT '',
  type TEXT DEFAULT 'default',
  properties TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE,
  FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);

-- 其他表结构与现有设计相同，但无需 tenant_id 字段
```

---

## 四、套餐设计

### 4.1 套餐矩阵

| 功能 | 免费版 | 个人版 | 团队版 | 企业版 |
|------|--------|--------|--------|--------|
| **标识** | free | personal | team | enterprise |
| **价格** | ¥0/月 | ¥29/月 | ¥99/月 | ¥299/月 |
| **图谱数量** | 3 | 10 | 50 | 无限 |
| **节点总数** | 500 | 5,000 | 50,000 | 无限 |
| **API 配额** | 1,000/月 | 10,000/月 | 100,000/月 | 无限 |
| **Agent 数量** | 1 | 5 | 20 | 无限 |
| **向量存储** | 10MB | 100MB | 1GB | 10GB |
| **版本快照** | 3 | 10 | 50 | 无限 |
| **Workspace** | 1 | 3 | 10 | 无限 |
| **导出分辨率** | 1K | 4K | 8K | 16K |
| **SSE 对话** | ✅ | ✅ | ✅ | ✅ |
| **MCP 工具** | ❌ | ✅ | ✅ | ✅ |
| **语义搜索** | ❌ | ✅ | ✅ | ✅ |
| **聚类分析** | ❌ | ❌ | ✅ | ✅ |
| **API 访问** | ❌ | ✅ | ✅ | ✅ |
| **SSO 登录** | ❌ | ❌ | ❌ | ✅ |
| **自定义域名** | ❌ | ❌ | ❌ | ✅ |
| **审计日志** | ❌ | ❌ | ✅ | ✅ |
| **Webhook** | ❌ | ❌ | ✅ | ✅ |

### 4.2 超限处理策略

```
使用量 0% ───── 80% ───── 100% ──────►
  │         │          │
  │         │          │
  │         │          └──────────────┐
  │         │                         │
  │         │                    禁止创建新资源
  │         │                    API返回429
  │         │                         │
  │         │                    ┌─────┴─────┐
  │         │                    │           │
  │         │                 锁定      引导升级
  │         │                               │
  │    发送警告通知                     │
  │    (站内+邮件)                       │
  │                                      │
  └──────────────────────────────────────┘
```

---

## 五、API 设计

### 5.1 租户管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tenants/me | 获取当前租户信息 |
| PUT | /api/tenants/me | 更新租户信息 |
| GET | /api/tenants/me/usage | 获取使用量统计 |
| GET | /api/tenants/me/invoices | 获取发票列表 |

### 5.2 套餐 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/plans | 获取所有套餐 |
| GET | /api/plans/:id | 获取套餐详情 |
| POST | /api/tenants/me/subscription | 订阅/切换套餐 |
| DELETE | /api/tenants/me/subscription | 取消订阅 |

### 5.3 使用量 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/usage/current | 本月使用量 |
| GET | /api/usage/history | 历史使用量 |
| GET | /api/usage/forecast | 用量预测 |

### 5.4 支付 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/payment/methods | 获取支付方式 |
| POST | /api/payment/methods | 添加支付方式 |
| DELETE | /api/payment/methods/:id | 删除支付方式 |
| POST | /api/payment/checkout | 创建支付会话 |
| POST | /api/payment/webhook | 支付回调 |

### 5.5 数据访问追溯 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/agent/my-data-access-logs | 获取自己数据的访问记录 |
| GET | /api/agent/data-access-stats | 获取访问统计 |

### 5.6 权限管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/agent/graphs/:id/permissions | 获取图谱权限 |
| PUT | /api/agent/graphs/:id/permissions | 更新图谱权限 |
| POST | /api/agent/graphs/:id/permissions/:agentId | 为 Agent 设置权限 |
| DELETE | /api/agent/graphs/:id/permissions/:agentId | 移除 Agent 权限 |

### 5.7 管理员 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/tenants | 租户列表 |
| GET | /api/admin/tenants/:id | 租户详情 |
| PUT | /api/admin/tenants/:id | 更新租户 |
| GET | /api/admin/stats | 运营统计 |

---

## 六、代码模块设计

### 6.1 目录结构

```
backend/src/
├── middleware/
│   ├── tenantMiddleware.js      # 租户识别中间件
│   ├── billingMiddleware.js     # 计费检查中间件
│   ├── quotaMiddleware.js       # 配额检查中间件
│   └── accessLogMiddleware.js  # 访问日志中间件 ⚡ NEW
│
├── services/
│   ├── tenantService.js          # 租户服务
│   ├── billingService.js        # 计费服务
│   ├── usageService.js          # 使用量服务
│   ├── paymentService.js        # 支付服务
│   ├── invoiceService.js        # 发票服务
│   └── notificationService.js   # 通知服务 ⚡ NEW
│
├── utils/
│   ├── tenantManager.js         # 租户数据库管理 ⚡ NEW
│   └── migrationTool.js        # 数据迁移工具 ⚡ NEW
│
└── routes/
    ├── tenantRoutes.js          # 租户 API
    ├── planRoutes.js            # 套餐 API
    ├── usageRoutes.js           # 使用量 API
    └── paymentRoutes.js         # 支付 API
```

### 6.2 数据迁移策略

由于采用 SQLite 文件级别隔离，需要将现有单租户数据迁移到多租户架构：

```javascript
// migrationTool.js

// 迁移步骤
const MIGRATION_STEPS = [
  {
    step: 1,
    name: "创建平台数据库",
    description: "创建 monkeygraph.db 并初始化表结构",
    execute: async () => { }
  },
  {
    step: 2,
    name: "创建默认租户",
    description: "为现有数据创建默认租户",
    execute: async () => { }
  },
  {
    step: 3,
    name: "迁移现有数据",
    description: "将现有数据库迁移到租户目录",
    execute: async () => { }
  },
  {
    step: 4,
    name: "初始化套餐数据",
    description: "插入默认套餐配置",
    execute: async () => { }
  },
  {
    step: 5,
    name: "创建默认订阅",
    description: "为租户创建免费套餐订阅",
    execute: async () => { }
  }
];

// 迁移脚本
async function migrate() {
  console.log("开始数据迁移...");
  
  // 1. 备份现有数据
  await backupDatabase();
  
  // 2. 创建平台数据库
  await createPlatformDatabase();
  
  // 3. 为现有数据创建默认租户
  const defaultTenant = await createDefaultTenant();
  
  // 4. 迁移现有数据库到租户目录
  await migrateToTenantDatabase(defaultTenant.id);
  
  // 5. 创建默认订阅
  await createDefaultSubscription(defaultTenant.id);
  
  console.log("迁移完成！");
}
```

**迁移前后目录结构对比**：

```
# 迁移前
backend/data/
└── knowledge-graph.db    # 单一数据库

# 迁移后
backend/data/
├── monkeygraph.db        # 平台数据库
└── tenants/
    └── {default_tenant_id}.db  # 租户数据库
        ├── graphs
        ├── nodes
        ├── edges
        └── ...
```

### 6.2 核心服务设计

#### tenantService.js

```javascript
// 租户服务
export const tenantService = {
  // 创建租户
  async create({ name, slug, ownerUserId }) { },
  
  // 获取租户
  async getById(tenantId) { },
  
  // 获取租户 (通过 slug)
  async getBySlug(slug) { },
  
  // 更新租户
  async update(tenantId, data) { },
  
  // 切换套餐
  async changePlan(tenantId, planId) { },
  
  // 暂停租户
  async suspend(tenantId) { },
  
  // 恢复租户
  async activate(tenantId) { }
};
```

#### billingService.js

```javascript
// 计费服务
export const billingService = {
  // 获取套餐列表
  async getPlans() { },
  
  // 获取套餐详情
  async getPlanById(planId) { },
  
  // 获取当前订阅
  async getSubscription(tenantId) { },
  
  // 创建订阅
  async createSubscription(tenantId, planId, billingCycle) { },
  
  // 取消订阅
  async cancelSubscription(tenantId) { },
  
  // 检查配额
  async checkQuota(tenantId, resource, currentValue) { },
  
  // 记录 API 调用
  async recordAPICall(tenantId) { },
  
  // 计算费用
  async calculateOverage(tenantId, period) { }
};
```

#### usageService.js

```javascript
// 使用量服务
export const usageService = {
  // 获取当前使用量
  async getCurrentUsage(tenantId) { },
  
  // 获取历史使用量
  async getUsageHistory(tenantId, months) { },
  
  // 获取使用量统计
  async getUsageStats(tenantId) { },
  
  // 预测使用量
  async forecastUsage(tenantId, months) { },
  
  // 重置月度配额
  async resetMonthlyQuota(tenantId) { }
};
```

#### notificationService.js

```javascript
// 通知服务
export const notificationService = {
  // 发送数据访问通知
  async notifyDataAccess(ownerAgentId, accessLog) { },
  
  // 发送配额警告
  async notifyQuotaWarning(tenantId, resource, percentage) { },
  
  // 发送套餐到期提醒
  async notifySubscriptionExpiring(tenantId, daysLeft) { },
  
  // 发送支付成功通知
  async notifyPaymentSuccess(tenantId, invoice) { }
};
```

---

## 七、前端设计

### 7.1 路由结构

```javascript
// 前端路由
const routes = [
  // 公开路由
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/pricing', component: Pricing },
  
  // 租户内路由 (需登录)
  { 
    path: '/', 
    component: AppLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: Dashboard },
      { path: 'graphs', component: GraphList },
      { path: 'graphs/:id', component: GraphEditor },
      { path: 'agents', component: AgentList },
      { path: 'usage', component: Usage },
      { path: 'settings', component: Settings },
      { path: 'billing', component: Billing },
      { path: 'team', component: Team },
    ]
  },
  
  // 管理员路由
  { 
    path: '/admin', 
    component: AdminLayout,
    children: [
      { path: 'tenants', component: TenantList },
      { path: 'tenants/:id', component: TenantDetail },
      { path: 'plans', component: PlanList },
      { path: 'stats', component: Stats },
    ]
  }
];
```

### 7.2 页面设计

#### 仪表盘 (Dashboard)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🐒 MonkeyGraph         [租户名称 ▼]  [套餐: Pro]  [⚙]  [👤]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │ 📊 本月 API    │  │ 📈 图谱数量    │  │ 👥 团队成员   │     │
│  │   45,230      │  │      12        │  │       5       │     │
│  │ ████████░░   │  │ ██████████    │  │ ████░░░░░░   │     │
│  │  45%          │  │  80%           │  │  50%          │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
│                                                                 │
│  📈 使用量趋势                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │    █                                                        │  │
│  │  █ █ █    █                                                 │  │
│  │  █ █ █ █  █ █    █    █                                 │  │
│  │  █ █ █ █  █ █ █  █ █  █ █ █                           │  │
│  │  ──────────────────────────────────────────►              │  │
│  │  10月  11月  12月  1月  2月  3月                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 套餐页面 (Pricing)

```
┌─────────────────────────────────────────────────────────────────┐
│                        选择套餐                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   免费版    │  │   个人版     │  │   团队版    │            │
│  │   ¥0/月    │  │   ¥29/月   │  │   ¥99/月   │            │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤            │
│  │ ✓ 3 图谱   │  │ ✓ 10 图谱  │  │ ✓ 50 图谱  │            │
│  │ ✓ 500 节点 │  │ ✓ 5,000    │  │ ✓ 50,000   │            │
│  │ ✓ 1K API   │  │ ✓ 10K API  │  │ ✓ 100K API │            │
│  │ ✓ 1K 导出  │  │ ✓ 4K 导出  │  │ ✓ 8K 导出  │            │
│  │             │  │ ✓ MCP工具  │  │ ✓ 聚类分析 │            │
│  │             │  │ ✓ 语义搜索 │  │ ✓ 审计日志 │            │
│  │             │  │ ✓ API访问  │  │ ✓ Webhook  │            │
│  │             │  │             │  │             │            │
│  │  当前套餐    │  │   推荐      │  │             │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 八、实施计划

### Phase 1: 基础设施 (第1-2周)

| 任务 | 负责人 | 预估工时 |
|------|--------|----------|
| 创建租户表 | - | 1天 |
| 迁移现有数据 | - | 1天 |
| 租户中间件 | - | 2天 |
| 套餐表和初始化 | - | 1天 |
| 订阅表 | - | 1天 |

### Phase 2: 计费核心 (第3-4周)

| 任务 | 负责人 | 预估工时 |
|------|--------|----------|
| 计费服务 | - | 2天 |
| 使用量服务 | - | 2天 |
| 配额检查中间件 | - | 2天 |
| 功能检查中间件 | - | 1天 |

### Phase 3: 支付集成 (第5-6周)

| 任务 | 负责人 | 预估工时 |
|------|--------|----------|
| 支付方式管理 | - | 2天 |
| 支付宝集成 | - | 2天 |
| 微信支付集成 | - | 2天 |
| Webhook 处理 | - | 2天 |

### Phase 4: 前端 (第7-8周)

| 任务 | 负责人 | 预估工时 |
|------|--------|----------|
| 套餐选择页面 | - | 2天 |
| 使用量仪表盘 | - | 2天 |
| 支付页面 | - | 2天 |
| 团队管理 | - | 2天 |

### Phase 5: 管理员后台 (第9-10周)

| 任务 | 负责人 | 预估工时 |
|------|--------|----------|
| 租户管理 | - | 2天 |
| 套餐管理 | - | 1天 |
| 运营统计 | - | 2天 |
| 发票管理 | - | 1天 |

---

## 九、Milestone

### v0.1 - 多租户基础 (2周)

- [ ] 租户表和中间件
- [ ] 套餐系统
- [ ] 配额检查

### v0.2 - 计费系统 (4周)

- [ ] 使用量统计
- [ ] 支付集成
- [ ] 发票生成

### v0.3 - 完整 SaaS (6周)

- [ ] 前端计费页面
- [ ] 管理后台
- [ ] 团队管理

---

## 十、总结

本设计方案已全部实现，MonkeyGraph 现已支持完整的多租户 SaaS 功能：

### 已实现功能

1. **架构**：采用 SQLite 文件级别隔离，每个租户独立数据库文件
2. **套餐**：4档套餐（免费版、个人版、团队版、企业版），覆盖免费到企业需求
3. **计费**：订阅为主，按量为辅
4. **管理**：完整的租户管理后台和管理员控制台

### 文件目录结构

```
backend/data/
├── monkeygraph.db          # 平台数据库（租户元数据、套餐、订阅）
└── knowledge-graph.db      # 业务数据库（默认租户数据）
```

### 实现对比

| 设计方案 | 实际实现 | 状态 |
|----------|----------|------|
| 平台数据库 (monkeygraph.db) | ✅ 实现 | `backend/src/services/saas/platformDb.js` |
| 租户表 (tenants) | ✅ 实现 | platformDb.js |
| 套餐表 (plans) | ✅ 实现 | platformDb.js |
| 订阅表 (subscriptions) | ✅ 实现 | platformDb.js |
| 使用量记录 (usage_records) | ✅ 实现 | platformDb.js |
| 租户中间件 | ✅ 实现 | `backend/src/middleware/tenantMiddleware.js` |
| 配额中间件 | ✅ 实现 | `backend/src/middleware/quotaMiddleware.js` |
| 租户路由 | ✅ 实现 | `backend/src/routes/tenantRoutes.js` |
| 套餐路由 | ✅ 实现 | `backend/src/routes/planRoutes.js` |
| 使用量路由 | ✅ 实现 | `backend/src/routes/usageRoutes.js` |
| 租户仪表盘 | ✅ 实现 | `frontend/src/views/TenantDashboard.vue` |
| 管理员后台 | ✅ 实现 | `frontend/src/views/AdminDashboard.vue` |

---

*文档更新时间: 2026/3/12*
