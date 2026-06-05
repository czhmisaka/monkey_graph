# OpenClaw 接入手册 - MonkeyGraph 知识图谱服务

本手册介绍如何将 MonkeyGraph 作为工具接入 OpenClaw，使 AI Agent 能够操作知识图谱。

---

## 概述

MonkeyGraph 提供 REST API 接口，OpenClaw 可以通过自定义 Skill（技能）来调用这些接口，实现：
- 创建和管理知识图谱
- 批量添加节点和边
- 图算法查询（路径查找、度统计、邻居查询）
- 图谱版本管理
- Workspace 命名空间管理
- 向量检索与语义搜索
- 属性查询与数值排序

---

## 快速开始

### 1. 创建 Agent

访问 MonkeyGraph 前端界面，创建您的 API Agent：

1. 打开浏览器访问：`http://localhost:13002/agents`
2. 登录您的账户
3. 点击"**+ 创建 Agent**"按钮
4. 填写 Agent 名称（例如：`my-knowledge-agent`）
5. 填写描述（可选）
6. 点击"创建"

### 2. 保存 API Key

创建成功后，弹窗会显示 API Key：
- **API Key 只显示一次！**
- 请立即复制并妥善保存
- 如果忘记保存，可以后续"轮换"生成新的 Key

### 3. 开始使用

使用获得的 API Key 即可调用 Agent API：

```javascript
const API_KEY = '您的API Key'; // 从前端获取
const API_BASE = 'http://localhost:13001/api/agent';

// 调用示例：创建图谱
async function createGraph() {
  const response = await fetch(`${API_BASE}/graphs`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${API_KEY}`
    },
    body: JSON.stringify({ 
      name: '公司员工图谱', 
      description: '记录公司员工信息' 
    })
  });
  return await response.json();
}
```

---

## 认证方式

所有 Agent API 使用 `Authorization` 头认证：

```
Authorization: Agent your-api-key
```

**注意**：API Key 只在注册时返回一次，请妥善保存！

---

## API 端点完整参考

### 1. Agent 管理 API

#### 1.1 获取当前 Agent 信息

```bash
GET /api/agent/me
```

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/me" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "agent": {
    "id": "agent_xxx",
    "name": "我的Agent",
    "description": "描述信息",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**JavaScript 示例：**
```javascript
async function getAgentInfo() {
  const response = await fetch(`${API_BASE}/me`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}
```

---

#### 1.2 更新 Agent 信息

```bash
PUT /api/agent/me
```

**请求头：**
- `Content-Type: application/json`

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | Agent 名称 |
| description | string | 否 | 描述信息 |
| permissions | object | 否 | 权限配置 |
| is_active | boolean | 否 | 是否激活 |

**请求示例：**
```bash
curl -X PUT "http://localhost:13001/api/agent/me" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "新名称", "description": "新描述"}'
```

**JavaScript 示例：**
```javascript
async function updateAgentInfo({ name, description }) {
  const response = await fetch(`${API_BASE}/me`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ name, description })
  });
  return await response.json();
}
```

---

#### 1.3 轮换 API Key

```bash
POST /api/agent/rotate-key
```

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/rotate-key" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "api_key": "new_api_key_here",
  "message": "请妥善保存新的 API Key，它只会显示一次"
}
```

**注意**：轮换后旧的 API Key 立即失效。

---

#### 1.4 获取配额使用情况

```bash
GET /api/agent/quota
```

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/quota" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "quota": {
    "monthly_quota": 100000,
    "requests_used": 1500,
    "remaining": 98500,
    "reset_at": "2024-02-01T00:00:00Z"
  }
}
```

---

### 2. 图谱操作 API

#### 2.1 获取图谱列表

```bash
GET /api/agent/graphs
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| summary | boolean | 否 | 摘要模式，只返回核心字段 |
| fields | string | 否 | 指定返回字段，逗号分隔 |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 100） |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs?summary=true" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "data": [
    {
      "id": "graph_xxx",
      "name": "公司组织图谱",
      "description": "记录公司部门结构",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

**JavaScript 示例：**
```javascript
async function getGraphs({ page = 1, limit = 100, summary = false } = {}) {
  const params = new URLSearchParams({ page, limit, summary });
  const response = await fetch(`${API_BASE}/graphs?${params}`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}
```

---

#### 2.2 获取图谱详情

```bash
GET /api/agent/graphs/:id
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 图谱 ID |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "graph": {
    "id": "graph_xxx",
    "name": "公司组织图谱",
    "description": "记录公司部门结构",
    "user_id": "user_xxx",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T12:00:00Z"
  }
}
```

---

#### 2.3 获取图谱概览（轻量接口）

```bash
GET /api/agent/graphs/:id/summary
```

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/summary" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "graph": {
    "id": "graph_xxx",
    "name": "公司组织图谱",
    "description": "记录公司部门结构",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "stats": {
    "nodeCount": 50,
    "edgeCount": 120,
    "typeDistribution": {
      "person": 30,
      "organization": 10,
      "location": 10
    }
  },
  "nodes": [...],
  "edges": [...]
}
```

---

#### 2.4 创建图谱

```bash
POST /api/agent/graphs
```

**请求头：**
- `Content-Type: application/json`

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 图谱名称 |
| description | string | 否 | 图谱描述 |
| workspace_id | string | 否 | Workspace ID |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "新图谱", "description": "图谱描述"}'
```

**响应示例：**
```json
{
  "graph": {
    "id": "new_graph_id",
    "name": "新图谱",
    "description": "图谱描述",
    "user_id": "agent-xxx",
    "is_active": true,
    "created_at": "2024-01-15T12:00:00Z"
  }
}
```

**JavaScript 示例：**
```javascript
async function createGraph({ name, description = '' }) {
  const response = await fetch(`${API_BASE}/graphs`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ name, description })
  });
  return await response.json();
}
```

---

#### 2.5 删除图谱

```bash
DELETE /api/agent/graphs/:id
```

**请求示例：**
```bash
curl -X DELETE "http://localhost:13001/api/agent/graphs/graph_xxx" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "message": "图谱已删除"
}
```

---

#### 2.6 获取图谱权限

```bash
GET /api/agent/graphs/:graphId/permission
```

**响应示例：**
```json
{
  "permission": "write"
}
```

---

### 3. 图谱授权管理 API

#### 3.1 获取图谱已授权的 Agent 列表

```bash
GET /api/agent/graphs/:graphId/agents
```

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/agents" \
  -H "Authorization: Agent your-api-key"
```

---

#### 3.2 授权 Agent 访问图谱

```bash
POST /api/agent/graphs/:graphId/agents
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agent_id | string | 是 | 要授权的 Agent ID |
| permission | string | 否 | 权限类型（read/write），默认 read |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/agents" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "target_agent_id", "permission": "write"}'
```

---

#### 3.3 更新 Agent 权限

```bash
PUT /api/agent/graphs/:graphId/agents/:agentId
```

**请求体：**
```json
{
  "permission": "read"
}
```

---

#### 3.4 撤销授权

```bash
DELETE /api/agent/graphs/:graphId/agents/:agentId
```

---

### 4. 节点操作 API

#### 4.1 分页获取节点列表

```bash
GET /api/agent/graphs/:graphId/nodes
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 100，最大 500） |
| type | string | 否 | 按节点类型过滤 |
| fields | string | 否 | 指定返回字段，逗号分隔 |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/nodes?page=1&limit=50&type=person" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "nodes": [
    {
      "id": "node_xxx",
      "label": "张三",
      "type": "person",
      "properties": {
        "职位": "工程师",
        "部门": "技术部"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

**JavaScript 示例：**
```javascript
async function getNodes({ graphId, page = 1, limit = 100, type = null }) {
  const params = new URLSearchParams({ page, limit });
  if (type) params.append('type', type);
  
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes?${params}`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}
```

---

#### 4.2 创建节点

```bash
POST /api/agent/graphs/:graphId/nodes
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点标签/名称 |
| type | string | 否 | 节点类型（person/organization/location/concept/event/product/default） |
| properties | object | 否 | 节点属性 |
| x | number | 否 | X 坐标 |
| y | number | 否 | Y 坐标 |
| auto_embedding | boolean | 否 | 是否自动计算 embedding（默认 true） |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/nodes" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "张三",
    "type": "person",
    "properties": {
      "职位": "工程师",
      "部门": "技术部"
    }
  }'
```

**响应示例：**
```json
{
  "node": {
    "id": "new_node_id",
    "label": "张三",
    "type": "person",
    "properties": {
      "职位": "工程师",
      "部门": "技术部"
    },
    "x": 400,
    "y": 300
  },
  "embedding": {
    "computed": 1
  }
}
```

---

#### 4.3 更新单个节点

```bash
PUT /api/agent/graphs/:graphId/nodes/:nodeId
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 否 | 节点标签 |
| type | string | 否 | 节点类型 |
| properties | object | 否 | 节点属性 |
| x | number | 否 | X 坐标 |
| y | number | 否 | Y 坐标 |

**请求示例：**
```bash
curl -X PUT "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/node_xxx" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"label": "张三（已离职）", "properties": {"状态": "已离职"}}'
```

---

#### 4.4 删除单个节点

```bash
DELETE /api/agent/graphs/:graphId/nodes/:nodeId
```

**响应示例：**
```json
{
  "message": "节点已删除",
  "node_id": "node_xxx"
}
```

---

#### 4.5 批量创建节点

```bash
POST /api/agent/graphs/:graphId/batch/nodes
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nodes | array | 是 | 节点列表（最多 500 个） |
| auto_embedding | boolean | 否 | 是否自动计算 embedding（默认 true） |

**节点结构：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 否 | 节点 ID（不提供则自动生成） |
| label | string | 是 | 节点标签 |
| type | string | 否 | 节点类型 |
| properties | object | 否 | 节点属性 |
| x | number | 否 | X 坐标 |
| y | number | 否 | Y 坐标 |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/batch/nodes" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {"label": "张三", "type": "person", "properties": {"职位": "工程师"}},
      {"label": "李四", "type": "person", "properties": {"职位": "产品经理"}},
      {"label": "科技公司", "type": "organization", "properties": {"名称": "科技有限公司"}}
    ]
  }'
```

**响应示例：**
```json
{
  "count": 3,
  "ids": ["node_id_1", "node_id_2", "node_id_3"],
  "embedding": {
    "computed": 3,
    "total": 3
  }
}
```

**JavaScript 示例：**
```javascript
async function batchCreateNodes({ graphId, nodes, autoEmbedding = true }) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/batch/nodes`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ nodes, auto_embedding: autoEmbedding })
  });
  return await response.json();
}

// 使用示例
const result = await batchCreateNodes({
  graphId: 'graph_xxx',
  nodes: [
    { label: '张三', type: 'person', properties: { 职位: '工程师' } },
    { label: '李四', type: 'person', properties: { 职位: '产品经理' } }
  ]
});
console.log('创建了', result.count, '个节点');
```

---

#### 4.6 批量更新节点

```bash
PUT /api/agent/graphs/:graphId/batch/nodes
```

**请求体：**
```json
{
  "nodes": [
    {
      "id": "node_id_1",
      "label": "新名称",
      "properties": {"状态": "已完成"}
    },
    {
      "id": "node_id_2",
      "properties": {"进度": "80%"}
    }
  ]
}
```

**JavaScript 示例：**
```javascript
async function batchUpdateNodes({ graphId, nodes }) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/batch/nodes`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ nodes })
  });
  return await response.json();
}
```

---

#### 4.7 批量删除节点

```bash
DELETE /api/agent/graphs/:graphId/batch/nodes
```

**请求体：**
```json
{
  "node_ids": ["node_id_1", "node_id_2", "node_id_3"]
}
```

**响应示例：**
```json
{
  "count": 3
}
```

---

### 5. 边操作 API

#### 5.1 分页获取边列表

```bash
GET /api/agent/graphs/:graphId/edges
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 100，最大 500） |
| fields | string | 否 | 指定返回字段 |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/edges?page=1&limit=100" \
  -H "Authorization: Agent your-api-key"
```

---

#### 5.2 批量创建边

```bash
POST /api/agent/graphs/:graphId/batch/edges
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| edges | array | 是 | 边列表（最多 500 条） |

**边结构：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 否 | 边 ID（不提供则自动生成） |
| source | string | 是 | 源节点 ID |
| target | string | 是 | 目标节点 ID |
| label | string | 否 | 边标签/关系名称 |
| type | string | 否 | 边类型 |
| properties | object | 否 | 边属性 |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/batch/edges" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "edges": [
      {"source": "node_1", "target": "node_3", "label": "工作于"},
      {"source": "node_2", "target": "node_3", "label": "管理"}
    ]
  }'
```

**响应示例：**
```json
{
  "count": 2,
  "ids": ["edge_id_1", "edge_id_2"],
  "errors": []
}
```

**JavaScript 示例：**
```javascript
async function batchCreateEdges({ graphId, edges }) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/batch/edges`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ edges })
  });
  return await response.json();
}
```

---

### 6. 高级查询 API

#### 6.1 属性筛选 + 排序查询

```bash
POST /api/agent/graphs/:graphId/nodes/query
```

**请求体：**
```json
{
  "type": "book",
  "filters": [
    {"field": "评分", "operator": ">=", "value": 8}
  ],
  "sort": {
    "field": "评分",
    "order": "desc",
    "type": "number"
  },
  "pagination": {
    "page": 1,
    "limit": 10
  }
}
```

**筛选操作符：**

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `=` | 等于 | `{"field": "状态", "operator": "=", "value": "已完成"}` |
| `!=` | 不等于 | `{"field": "状态", "operator": "!=", "value": "已删除"}` |
| `>` | 大于 | `{"field": "评分", "operator": ">", "value": 8}` |
| `<` | 小于 | `{"field": "价格", "operator": "<", "value": 100}` |
| `>=` | 大于等于 | `{"field": "评分", "operator": ">=", "value": 8}` |
| `<=` | 小于等于 | `{"field": "库存", "operator": "<=", "value": 10}` |
| `contains` | 包含 | `{"field": "名称", "operator": "contains", "value": "公司"}` |
| `startsWith` | 开头匹配 | `{"field": "编号", "operator": "startsWith", "value": "A"}` |
| `endsWith` | 结尾匹配 | `{"field": "编号", "operator": "endsWith", "value": "X"}` |
| `in` | 在列表中 | `{"field": "类型", "operator": "in", "value": ["A", "B"]}` |
| `exists` | 字段存在 | `{"field": "描述", "operator": "exists", "value": true}` |

**排序参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | 是 | 排序字段 |
| order | string | 否 | asc/desc（默认 desc） |
| type | string | 否 | number/numeric（数值排序必须指定） |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/query" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "book",
    "filters": [{"field": "评分", "operator": ">=", "value": 8}],
    "sort": {"field": "评分", "order": "desc", "type": "number"},
    "pagination": {"page": 1, "limit": 10}
  }'
```

**JavaScript 示例：**
```javascript
async function queryNodes({ graphId, filters, sort, pagination, type }) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes/query`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ filters, sort, pagination, type })
  });
  return await response.json();
}

// 使用示例：查询评分 >= 8 的书籍，按评分降序
const result = await queryNodes({
  graphId: 'graph_xxx',
  type: 'book',
  filters: [{ field: '评分', operator: '>=', value: 8 }],
  sort: { field: '评分', order: 'desc', type: 'number' },
  pagination: { page: 1, limit: 10 }
});
```

---

#### 6.2 Top-N 查询（快速获取排名前 N 的节点）

```bash
GET /api/agent/graphs/:graphId/nodes/top
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | 是 | 排序字段 |
| order | string | 否 | asc/desc（默认 desc） |
| limit | number | 否 | 返回数量（默认 10） |
| filters | string | 否 | 过滤条件（JSON 数组） |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/top?field=评分&order=desc&limit=5" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "field": "评分",  
  "order": "desc",
  "top": [
    {"rank": 1, "id": "node_1", "label": "书籍A", "评分": 9.5},
    {"rank": 2, "id": "node_2", "label": "书籍B", "评分": 9.2},
    {"rank": 3, "id": "node_3", "label": "书籍C", "评分": 8.9}
  ]
}
```

**JavaScript 示例：**
```javascript
async function getTopNodes({ graphId, field, order = 'desc', limit = 10 }) {
  const params = new URLSearchParams({ field, order, limit });
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes/top?${params}`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}

// 使用示例：获取评分最高的 5 本书
const topBooks = await getTopNodes({
  graphId: 'graph_xxx',
  field: '评分',
  limit: 5
});
```

---

#### 6.3 排名查询

```bash
POST /api/agent/graphs/:graphId/nodes/rank
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | 是 | 排名字段 |
| order | string | 否 | asc/desc（默认 desc） |
| limit | number | 否 | 返回数量（默认 100） |
| filters | array | 否 | 过滤条件 |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/rank" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "field": "销售额",
    "order": "desc",
    "limit": 20,
    "filters": [{"field": "类型", "operator": "=", "value": "电子产品"}]
  }'
```

**JavaScript 示例：**
```javascript
async function rankNodes({ graphId, field, order = 'desc', limit = 100, filters = [] }) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes/rank`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ field, order, limit, filters })
  });
  return await response.json();
}

// 使用示例：获取销售额前 20 的电子产品
const rankings = await rankNodes({
  graphId: 'graph_xxx',
  field: '销售额',
  limit: 20,
  filters: [{ field: '类型', operator: '=', value: '电子产品' }]
});
```

---

#### 6.4 聚合统计

```bash
POST /api/agent/graphs/:graphId/nodes/aggregate
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | 是 | 聚合字段 |
| operations | array | 是 | 聚合操作列表 |
| filters | array | 否 | 过滤条件 |

**支持的聚合操作：**
| 操作 | 说明 |
|------|------|
| `sum` | 求和 |
| `avg` | 平均值 |
| `max` | 最大值 |
| `min` | 最小值 |
| `count` | 计数 |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/aggregate" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "field": "销售额",
    "operations": ["sum", "avg", "max", "min", "count"]
  }'
```

**响应示例：**
```json
{
  "field": "销售额",
  "results": {
    "sum": 5000000,
    "avg": 250000,
    "max": 1000000,
    "min": 50000,
    "count": 20
  }
}
```

**JavaScript 示例：**
```javascript
async function aggregateNodes({ graphId, field, operations, filters = [] }) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes/aggregate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ field, operations, filters })
  });
  return await response.json();
}

// 使用示例：统计销售额
const stats = await aggregateNodes({
  graphId: 'graph_xxx',
  field: '销售额',
  operations: ['sum', 'avg', 'count']
});
console.log(`总销售额: ${stats.results.sum}, 平均: ${stats.results.avg}`);
```

---

#### 6.5 按类型分组聚合

```bash
GET /api/agent/graphs/:graphId/nodes/aggregate/by-type
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | 是 | 聚合字段 |
| operations | string | 是 | 聚合操作（逗号分隔） |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/aggregate/by-type?field=销售额&operations=sum,avg,count" \
  -H "Authorization: Agent your-api-key"
```

---

#### 6.6 字段统计（了解图谱数据结构）

```bash
GET /api/agent/graphs/:graphId/nodes/field-stats
```

**响应示例：**
```json
{
  "totalNodes": 100,
  "typeCounts": {
    "book": 50,
    "person": 30,
    "organization": 20
  },
  "fields": {
    "评分": {
      "type": "number",
      "count": 50,
      "numericStats": {
        "min": 7.0,
        "max": 9.5,
        "avg": 8.2,
        "count": 50
      }
    },
    "作者": {
      "type": "string",
      "count": 50
    }
  }
}
```

**JavaScript 示例：**
```javascript
async function getFieldStats(graphId) {
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes/field-stats`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}

// 使用示例：了解图谱中有哪些数值字段可用于排序
const stats = await getFieldStats('graph_xxx');
const numericFields = Object.entries(stats.fields)
  .filter(([_, info]) => info.type === 'number')
  .map(([name]) => name);
console.log('可排序的数值字段:', numericFields);
```

---

### 7. 图算法 API

#### 7.1 路径查找

```bash
GET /api/agent/graphs/:graphId/path
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source | string | 是 | 源节点 ID |
| target | string | 是 | 目标节点 ID |
| max_depth | number | 否 | 最大搜索深度（默认 10） |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/path?source=node_1&target=node_5" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "path": [
    {"id": "node_1", "label": "张三", "type": "person"},
    {"id": "node_2", "label": "技术部", "type": "organization", "relation": {"label": "属于"}},
    {"id": "node_5", "label": "总部", "type": "location", "relation": {"label": "位于"}}
  ],
  "length": 3,
  "found": true
}
```

**JavaScript 示例：**
```javascript
async function findPath({ graphId, source, target, maxDepth = 10 }) {
  const params = new URLSearchParams({ source, target, max_depth: maxDepth });
  const response = await fetch(`${API_BASE}/graphs/${graphId}/path?${params}`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}
```

---

#### 7.2 度统计

```bash
GET /api/agent/graphs/:graphId/degrees
```

**响应示例：**
```json
{
  "degrees": [
    {"id": "node_1", "label": "张三", "type": "person", "in": 5, "out": 3, "total": 8},
    {"id": "node_2", "label": "李四", "type": "person", "in": 3, "out": 4, "total": 7}
  ],
  "totalEdges": 120
}
```

---

#### 7.3 邻居查询

```bash
GET /api/agent/graphs/:graphId/nodes/:nodeId/neighbors
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 过滤方向（in/out） |
| limit | number | 否 | 返回数量（默认 50） |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/nodes/node_xxx/neighbors?type=out&limit=10" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "node": {"id": "node_xxx", "label": "张三"},
  "neighbors": [
    {"id": "node_1", "label": "公司", "type": "organization", "relation": {"direction": "outgoing", "label": "工作于"}},
    {"id": "node_2", "label": "王五", "type": "person", "relation": {"direction": "incoming", "label": "下属"}}
  ],
  "total": 10
}
```

**JavaScript 示例：**
```javascript
async function getNeighbors({ graphId, nodeId, type = null, limit = 50 }) {
  const params = new URLSearchParams({ limit });
  if (type) params.append('type', type);
  
  const response = await fetch(`${API_BASE}/graphs/${graphId}/nodes/${nodeId}/neighbors?${params}`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}
```

---

### 8. 版本管理 API

#### 8.1 创建快照

```bash
POST /api/agent/graphs/:graphId/snapshot
```

**请求体：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 快照名称 |
| description | string | 否 | 快照描述 |

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/snapshot" \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "版本备份 2024-01", "description": "月度备份"}'
```

---

#### 8.2 获取版本列表

```bash
GET /api/agent/graphs/:graphId/versions
```

---

#### 8.3 回滚到指定版本

```bash
POST /api/agent/graphs/:graphId/rollback
```

**请求体：**
```json
{
  "version": 5
}
```

---

### 9. 向量检索 API（语义搜索）

#### 9.1 获取 Embedding 状态

```bash
GET /api/agent/graphs/:graphId/embedding/status
```

**响应示例：**
```json
{
  "totalNodes": 100,
  "computedNodes": 100,
  "progress": 100,
  "isComplete": true,
  "available": true
}
```

---

#### 9.2 计算所有节点 Embedding

```bash
POST /api/agent/graphs/:graphId/embedding/compute
```

**请求示例：**
```bash
curl -X POST "http://localhost:13001/api/agent/graphs/graph_xxx/embedding/compute" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "message": "成功计算 100 个节点的 embedding",
  "total": 100,
  "computed": 100
}
```

**注意**：需要本地运行 embedding 服务（默认 http://127.0.0.1:1234）

---

#### 9.3 语义搜索节点

```bash
GET /api/agent/graphs/:graphId/embedding/search
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 是 | 搜索关键词 |
| limit | number | 否 | 返回数量（默认 10） |

**请求示例：**
```bash
curl -X GET "http://localhost:13001/api/agent/graphs/graph_xxx/embedding/search?q=人工智能书籍&limit=5" \
  -H "Authorization: Agent your-api-key"
```

**响应示例：**
```json
{
  "query": "人工智能书籍",
  "results": [
    {
      "id": "node_1",
      "label": "深度学习入门",
      "type": "book",
      "similarity": 0.95
    },
    {
      "id": "node_2",
      "label": "机器学习实战",
      "type": "book",
      "similarity": 0.89
    }
  ]
}
```

**JavaScript 示例：**
```javascript
async function semanticSearch({ graphId, query, limit = 10 }) {
  const params = new URLSearchParams({ q: query, limit });
  const response = await fetch(`${API_BASE}/graphs/${graphId}/embedding/search?${params}`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}
```

---

#### 9.4 获取相似节点

```bash
GET /api/agent/graphs/:graphId/embedding/similar/:nodeId
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认 10） |

---

#### 9.5 聚类分析

```bash
POST /api/agent/graphs/:graphId/embedding/cluster
```

**请求体：**
```json
{
  "k": 3
}
```

**响应示例：**
```json
{
  "k": 3,
  "totalNodes": 100,
  "clusters": [
    {"clusterId": 0, "nodeIds": ["node_1", "node_2", "node_3"]},
    {"clusterId": 1, "nodeIds": ["node_4", "node_5"]},
    {"clusterId": 2, "nodeIds": ["node_6", "node_7", "node_8"]}
  ]
}
```

---

#### 9.6 删除所有 Embedding

```bash
DELETE /api/agent/graphs/:graphId/embedding
```

---

### 10. Workspace API

#### 10.1 创建 Workspace

```bash
POST /api/agent/workspaces
```

**请求体：**
```json
{
  "name": "我的工作空间",
  "description": "描述信息",
  "settings": {}
}
```

---

#### 10.2 获取 Workspace 列表

```bash
GET /api/agent/workspaces
```

---

### 11. 管理员 API（需要 admin 权限）

#### 11.1 获取所有图谱

```bash
GET /api/agent/admin/graphs
```

**注意**：需要 Agent 的 permissions 中包含 `special: ["admin"]`

---

#### 11.2 获取所有 Agent

```bash
GET /api/agent/admin/agents
```

---

### 12. 导出 API

#### 12.1 导出图谱为 PNG

```bash
GET /api/agent/graphs/:id/export
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| width | number | 否 | 图片宽度（默认 7680） |
| height | number | 否 | 图片高度（默认 4320） |
| scale | number | 否 | 缩放比例（默认 1） |

**JavaScript 示例：**
```javascript
async function exportGraphAsPNG({ graphId, width = 7680, height = 4320 }) {
  const response = await fetch(
    `${API_BASE}/graphs/${graphId}/export?width=${width}&height=${height}`,
    { 
      headers: { 'Authorization': `Agent ${apiKey}` },
      responseType: 'blob'
    }
  );
  
  if (response.ok) {
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    return { success: true, imageUrl, blob };
  }
  return { success: false, error: '导出失败' };
}
```

---

## 响应格式说明

### 成功响应

```json
{
  "data": [...],      // 数据
  "total": 10         // 总数
}
```

或

```json
{
  "count": 10,
  "ids": ["id1", "id2", ...]
}
```

### 错误响应

```json
{
  "error": "错误信息",
  "code": "ERROR_CODE"
}
```

**常见错误代码：**
| 代码 | 说明 |
|------|------|
| `MISSING_NAME` | 缺少必需字段 |
| `GRAPH_NOT_FOUND` | 图谱不存在 |
| `NODE_NOT_FOUND` | 节点不存在 |
| `ACCESS_DENIED` | 权限不足 |
| `ADMIN_REQUIRED` | 需要管理员权限 |
| `BATCH_TOO_LARGE` | 批量大小超限 |
| `EMBEDDING_UNAVAILABLE` | Embedding 服务不可用 |

---

## 常见使用场景

### 场景 1: 创建知识图谱并添加节点

```
用户：帮我创建一个"公司员工"知识图谱，添加张三、李四、王五三个员工节点
```

```javascript
// 1. 创建图谱
const graph = await createGraph({ name: '公司员工图谱' });

// 2. 批量创建节点
const nodes = await batchCreateNodes({
  graphId: graph.graph.id,
  nodes: [
    { label: '张三', type: 'person', properties: { 职位: '工程师', 部门: '技术部' }},
    { label: '李四', type: 'person', properties: { 职位: '产品经理', 部门: '产品部' }},
    { label: '王五', type: 'person', properties: { 职位: '设计师', 部门: '设计部' }}
  ]
});
```

---

### 场景 2: 查询员工关系

```
用户：张三和李四之间是什么关系？
```

```javascript
// 查找路径
const result = await findPath({
  graphId: 'graph_xxx',
  source: 'zhangsan_node_id',
  target: 'lisi_node_id'
});

if (result.found) {
  console.log('关系路径:', result.path.map(n => n.label).join(' -> '));
}
```

---

### 场景 3: 获取评分最高的书籍

```
用户：找出评分最高的前 5 本书
```

```javascript
// 方法1: 使用 Top-N 查询
const topBooks = await getTopNodes({
  graphId: 'graph_xxx',
  field: '评分',
  limit: 5
});

// 方法2: 使用属性查询
const books = await queryNodes({
  graphId: 'graph_xxx',
  type: 'book',
  sort: { field: '评分', order: 'desc', type: 'number' },
  pagination: { page: 1, limit: 5 }
});
```

---

### 场景 4: 统计销售额

```
用户：统计一下我们所有产品的总销售额和平均销售额
```

```javascript
const stats = await aggregateNodes({
  graphId: 'graph_xxx',
  field: '销售额',
  operations: ['sum', 'avg', 'count']
});

console.log(`总销售额: ${stats.results.sum}`);
console.log(`平均销售额: ${stats.results.avg}`);
console.log(`产品数量: ${stats.results.count}`);
```

---

### 场景 5: 语义搜索相似书籍

```
用户：找一些和《深度学习》类似的书籍
```

```javascript
// 确保先计算了 embedding
await computeEmbeddings('graph_xxx');

// 语义搜索
const similar = await semanticSearch({
  graphId: 'graph_xxx',
  query: '深度学习 神经网络 机器学习',
  limit: 10
});

console.log('相似书籍:', similar.results.map(r => r.label));
```

---

## 注意事项

1. **API Key 管理**：注册后务必保存 API Key，只返回一次
2. **批量限制**：单次批量操作最多 500 条
3. **配额限制**：默认月度配额 100000 次请求
4. **图谱 ID**：所有图操作需要先获取图谱 ID
5. **节点 ID**：边操作需要先知道源节点和目标节点的 ID
6. **Embedding 服务**：向量检索需要本地运行 embedding 服务（默认 http://127.0.0.1:1234）
7. **导出图片**：导出接口返回 PNG 格式图片，需要处理 blob 响应

---

## 相关链接

- MonkeyGraph 项目：https://github.com/czhmisaka/monkey_graph
- OpenClaw 项目：https://github.com/openclaw
- 本文档版本：1.3.0
- 更新日期：2026/3/25
