# MonkeyGraph - 智能知识图谱对话构建系统

🤖 **OpenClaw Agent 集成** - 支持 AI Agent 通过 REST API 操作知识图谱，实现图谱管理、节点/边批量操作、图算法查询、版本管理等功能，可导出 8K 超高清图谱图片。

🧠 **Embedding 记忆能力** - 利用本地 Embedding 模型实现向量嵌入，支持语义搜索、相似节点推荐和智能记忆检索，让 AI 更好地理解和记忆知识图谱中的信息。

☁️ **多租户 SaaS 平台** - 支持多企业/团队共享系统，数据完全隔离，按套餐使用量计费，提供完整的租户管理后台和管理员控制台。

通过自然语言对话构建和可视化知识图谱的完整解决方案。

## ✨ 功能特性

### ☁️ 多租户 SaaS 平台
- 多企业/团队共享同一套系统，数据完全隔离
- 四档套餐：免费版、个人版、团队版、企业版
- 按套餐限额管理（图谱数量、节点数量、API 配额、Agent 数量）
- 租户管理后台（套餐切换、使用量统计）
- 管理员控制台（租户管理、运营统计）

### 🗂️ 多图谱管理
- 支持创建、复制、编辑、删除多个独立图谱
- 分享链接给其他用户
- 图谱基础样式自定义配置

### 🔍 智能搜索
- 关键词快速搜索图谱中的节点
- 快捷键 `Ctrl+F` 快速打开搜索

### 📊 知识图谱可视化
- **D3.js 力导向图布局** - 经典力导向布局，节点自动分布
- **3D 星云模式** - Three.js 驱动的三维粒子图谱，震撼视觉效果
- **径向布局** - 以中心节点为核心的放射状布局
- 节点拖拽、缩放、点击交互
- 悬停高亮显示
- 自定义节点/边类型样式
- 支持自环和曲线边
- 导出超高清 PNG 图片（3x分辨率）

### 📚 示例图谱
项目内置 5 个示例图谱，可快速体验功能：
- `academic.json` - 学术知识（论文、作者、研究领域）
- `business.json` - 商业知识（公司、产品、市场）
- `literature.json` - 文学知识（作品、人物、文学流派）
- `tech-knowledge.json` - 科技知识（技术栈、框架、工具）
- `transport.json` - 交通知识（城市、交通方式、路线）

### 💬 对话式编辑
- 通过自然语言添加节点和关系
- AI 自动理解并执行操作
- 实时流式响应显示执行过程

### 📋 节点详情
- 节点信息完整展示（ID、标签、类型、时间戳、属性）
- 1/2/3阶关联关系可视化
- 关联边悬停高亮
- 点击关联节点快速跳转

### ⌨️ 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+F` | 打开搜索弹窗 |
| `Ctrl+Z` | 撤销操作 |
| `Delete` | 删除选中节点（在节点详情弹窗中） |
| `Esc` | 关闭弹窗 |

### 🔧 节点类型
支持自定义节点类型，默认类型包括：
- person (人物) - 蓝色
- organization (组织) - 绿色
- concept (概念) - 紫色
- location (地点) - 橙色
- default (默认) - 灰色

## 🚀 快速开始

### 环境要求
- Node.js 22+（推荐使用 nvm 管理 Node 版本）
- npm 或 pnpm

### 方式一：使用启动脚本（推荐）

项目提供了 `start.sh` 启动脚本，可以一键启动前后端服务：

```bash
# 一键启动（推荐）
chmod +x start.sh
./start.sh
```

启动脚本功能：
- ✅ 自动检查并清理占用端口的进程
- ✅ 同时启动前端和后端服务
- ✅ 显示服务地址和操作提示
- ✅ 支持 Ctrl+C 一键停止所有服务

### 方式二：使用部署脚本

项目提供了双语部署脚本，支持自动安装依赖、配置 MiniMax API Key 和启动服务：

```bash
# 交互式部署（推荐）
chmod +x deploy.sh
./deploy.sh

# 跳过语言选择，直接使用中文
LANG=zh_CN ./deploy.sh
```

### 方式三：手动启动

```bash
# 后端
cd backend && npm install && npm start

# 前端（另一个终端）
cd frontend && npm install && npm run dev
```

### 方式四：Docker 部署（推荐用于生产环境）

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
vim backend/.env  # 填写 LLM_CLOUD_API_KEY

# 2. 一键部署
chmod +x deploy-docker.sh
./deploy-docker.sh start
```

**Docker 部署功能：**
- ✅ 容器化部署，开箱即用
- ✅ 自动健康检查
- ✅ 数据持久化（SQLite 数据库）
- ✅ 日志管理
- ✅ 快速启动/停止/重启

**详细文档：**
- [Docker 快速开始](./DOCKER_QUICKSTART.md) - 5 分钟快速部署
- [Docker 完整部署指南](./DOCKER_DEPLOY.md) - 生产环境部署详解

### 访问地址
| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:13002 |
| 后端 API | http://localhost:13001 |
| 默认管理员 | admin / admin123 |

### 3. 配置 LLM

#### 方式一：前端界面配置

1. 打开浏览器访问 http://localhost:13002
2. 点击右上角的「⚙ 配置」按钮
3. 输入你的 API Key 和 Base URL（可选）
4. 点击「保存配置」

支持的 LLM 服务：
- OpenAI API
- 本地 LLM Studio (OpenAI 兼容格式)
- 任何兼容 OpenAI API 的服务

#### 方式二：后端环境变量配置（推荐）

> ⚠️ **强烈建议使用 MiniMax 的 coding plan 计划**，该计划集成了 MCP 工具，支持：
> - 🔍 `web_search` - 网络搜索，获取实时信息
> - 🖼️ `understand_image` - 图片理解与分析
>
> 使用 coding plan 可以让 AI 在对话中自动调用这些工具，实现更强大的功能。

如果你使用 **MiniMax** 大语言模型，建议通过环境变量配置：

1. 编辑 `backend/.env` 文件：

```bash
# MiniMax API 配置
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1/
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
LLM_CLOUD_API_KEY=你的MiniMax_API_Key

# 后端服务端口（可选）
PORT=13001
```

2. 重启后端服务：

```bash
cd backend
npm start
```

**配置说明：**

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `LLM_CLOUD_BASE_URL` | API 基础地址 | `https://api.minimaxi.com/v1/` |
| `LLM_CLOUD_MODEL_NAME` | 模型名称 | `MiniMax-M2.5` |
| `LLM_CLOUD_API_KEY` | API Key | 从 MiniMax 开放平台获取 |
| `PORT` | 后端端口 | `13001`（默认） |

**获取 MiniMax API Key：**

1. 访问 [MiniMax 开放平台](https://platform.minimaxi.com/)
2. 注册/登录账号
3. 在「API Keys」页面创建新的 API Key
4. 复制 Key 并填入 `.env` 文件

**使用 MCP 工具：**

项目集成了 MiniMax MCP 工具，支持：
- 🔍 `web_search` - 网络搜索，获取实时信息
- 🖼️ `understand_image` - 图片理解与分析

这些工具会在对话中自动调用，例如：
- "搜索最近的 AI 新闻"
- "分析这张图片中的内容"

## 📖 使用示例

### 智能整理文章
用户：「请帮我整理【这里输入一篇文章之类的内容....】」

AI 会自动分析文章内容，提取关键信息并创建知识图谱。

### 添加节点
用户：「添加一个名为 Python 的编程语言节点」

AI 会自动执行 `add_node` 工具，添加相应节点。

### 添加关系
用户：「在 Python 和编程语言之间添加一个关系」

AI 会先搜索节点，然后执行 `add_edge` 添加关系。

### 搜索节点
用户：「查找所有与编程相关的节点」

AI 会执行 `search_nodes` 工具进行搜索。

### 美化布局
用户：「帮我美化图谱布局」

AI 会优化节点位置，使图谱更加整齐美观。

### 网络搜索
用户：「搜索最新的 AI 新闻」

AI 会使用 web_search 工具获取最新信息（需使用 MiniMax coding plan）。

## 🔌 API 接口

### 用户 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/graphs` | GET/POST | 图谱 CRUD |
| `/api/graph/:id` | GET | 获取图谱数据 |
| `/api/nodes` | GET/POST | 节点 CRUD |
| `/api/edges` | GET/POST | 边 CRUD |
| `/api/history` | GET | 获取历史记录 |
| `/api/history/undo` | POST | 撤销操作 |
| `/api/chat` | POST | 对话接口（流式） |
| `/api/config/llm` | POST | LLM 配置 |

---

## 🤖 Agent API

MonkeyGraph 提供 Agent API 接口服务，允许外部 AI Agent 通过 API 操作知识图谱。

### 认证方式

所有 Agent API 使用 `Authorization` 头进行认证：

```bash
curl http://localhost:13001/api/agent/graphs \
  -H "Authorization: Agent your-api-key"
```

### 1. Agent 管理

#### 注册 Agent
```bash
curl -X POST http://localhost:13001/api/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "description": "My AI Agent",
    "permissions": {
      "graphs": ["read", "write", "delete"],
      "nodes": ["read", "write", "delete"],
      "edges": ["read", "write", "delete"]
    }
  }'
```

响应：
```json
{
  "success": true,
  "agent": {
    "id": "agent-id",
    "name": "my-agent",
    "api_key": "your-api-key",
    "permissions": {...},
    "monthly_quota": 100000,
    "requests_used": 0
  }
}
```

> ⚠️ **注意**: API Key 只会在注册时返回一次，请妥善保存！

#### 获取当前 Agent 信息
```bash
curl http://localhost:13001/api/agent/me \
  -H "Authorization: Agent your-api-key"
```

#### 获取配额信息
```bash
curl http://localhost:13001/api/agent/quota \
  -H "Authorization: Agent your-api-key"
```

#### 轮换 API Key
```bash
curl -X POST http://localhost:13001/api/agent/rotate-key \
  -H "Authorization: Agent your-api-key"
```

---

### 2. 图谱操作

#### 创建图谱
```bash
curl -X POST http://localhost:13001/api/agent/graphs \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Knowledge Graph",
    "description": "Description"
  }'
```

#### 获取图谱列表
```bash
curl http://localhost:13001/api/agent/graphs \
  -H "Authorization: Agent your-api-key"
```

#### 获取图谱详情
```bash
curl http://localhost:13001/api/agent/graphs/{graphId} \
  -H "Authorization: Agent your-api-key"
```

#### 删除图谱
```bash
curl -X DELETE http://localhost:13001/api/agent/graphs/{graphId} \
  -H "Authorization: Agent your-api-key"
```

---

### 3. 节点操作

#### 批量创建节点
```bash
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/batch/nodes \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {"label": "节点1", "type": "person", "properties": {"name": "张三"}},
      {"label": "节点2", "type": "organization", "properties": {"name": "公司"}},
      {"label": "节点3", "type": "concept"}
    ]
  }'
```

#### 批量更新节点
```bash
curl -X PUT http://localhost:13001/api/agent/graphs/{graphId}/batch/nodes \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {"id": "node-id", "label": "新名称", "properties": {"key": "value"}}
    ]
  }'
```

#### 批量删除节点
```bash
curl -X DELETE http://localhost:13001/api/agent/graphs/{graphId}/batch/nodes \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"node_ids": ["node-id-1", "node-id-2"]}'
```

---

### 4. 边操作

#### 批量创建边
```bash
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/batch/edges \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "edges": [
      {"source": "node-id-1", "target": "node-id-2", "label": "关系"},
      {"source": "node-id-2", "target": "node-id-3", "label": "属于"}
    ]
  }'
```

---

### 5. 图算法

#### 节点度统计
```bash
curl "http://localhost:13001/api/agent/graphs/{graphId}/degrees" \
  -H "Authorization: Agent your-api-key"
```

响应：
```json
{
  "success": true,
  "degrees": [
    {"id": "node-id", "label": "节点", "type": "person", "in": 2, "out": 1, "total": 3}
  ],
  "totalEdges": 5
}
```

#### 邻居查询
```bash
curl "http://localhost:13001/api/agent/graphs/{graphId}/nodes/{nodeId}/neighbors" \
  -H "Authorization: Agent your-api-key"
```

#### 路径查找 (BFS)
```bash
curl "http://localhost:13001/api/agent/graphs/{graphId}/path?source={nodeId1}&target={nodeId2}" \
  -H "Authorization: Agent your-api-key"
```

---

### 6. 版本管理

#### 创建快照
```bash
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/snapshot \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "快照名称", "description": "描述"}'
```

#### 获取版本列表
```bash
curl http://localhost:13001/api/agent/graphs/{graphId}/versions \
  -H "Authorization: Agent your-api-key"
```

#### 回滚版本
```bash
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/rollback \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"version": 1}'
```

---

### 7. Workspace (命名空间)

#### 创建 Workspace
```bash
curl -X POST http://localhost:13001/api/agent/workspaces \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "workspace名称", "description": "描述"}'
```

#### 获取 Workspace 列表
```bash
curl http://localhost:13001/api/agent/workspaces \
  -H "Authorization: Agent your-api-key"
```

---

### 8. 图谱检索增强（属性查询与数值排序）

MonkeyGraph 支持强大的图谱节点检索功能，包括属性筛选、数值排序、Top-N 查询、排名计算和聚合统计。

#### 8.1 属性筛选 + 排序查询（核心接口）

```bash
# 查询评分 >= 8.0 的书籍，按评分降序排列（数值排序）
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/nodes/query \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

**支持的筛选操作符：**
| 操作符 | 说明 | 示例 |
|--------|------|------|
| `=` | 等于 | `{"field": "类型", "operator": "=", "value": "小说"}` |
| `!=` | 不等于 | `{"field": "状态", "operator": "!=", "value": "已删除"}` |
| `>` | 大于 | `{"field": "评分", "operator": ">", "value": 8}` |
| `<` | 小于 | `{"field": "价格", "operator": "<", "value": 100}` |
| `>=` | 大于等于 | `{"field": "评分", "operator": ">=", "value": 8}` |
| `<=` | 小于等于 | `{"field": "销量", "operator": "<=", "value": 1000}` |
| `contains` | 包含 | `{"field": "作者", "operator": "contains", "value": "鲁迅"}` |
| `startsWith` | 开头匹配 | `{"field": "书名", "operator": "startsWith", "value": "三体"}` |
| `in` | 在列表中 | `{"field": "类型", "operator": "in", "value": ["小说", "散文"]}` |
| `exists` | 字段存在 | `{"field": "评分", "operator": "exists", "value": true}` |

**排序参数：**
- `field`: 排序字段名
- `order`: `asc`（升序）或 `desc`（降序）
- `type`: `number`（数值排序）或 `string`（字符串排序）

#### 8.2 Top-N 查询

```bash
# 获取评分最高的前 5 本书
curl "http://localhost:13001/api/agent/graphs/{graphId}/nodes/top?field=评分&order=desc&limit=5" \
  -H "Authorization: Agent your-api-key"
```

响应：
```json
{
  "field": "评分",
  "order": "desc",
  "top": [
    {"rank": 1, "id": "xxx", "label": "三体", "评分": 9.5},
    {"rank": 2, "id": "yyy", "label": "活着", "评分": 9.2},
    {"rank": 3, "id": "zzz", "label": "围城", "评分": 9.0}
  ]
}
```

#### 8.3 排名查询

```bash
# 获取节点的完整排名信息
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/nodes/rank \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "field": "评分",
    "order": "desc",
    "limit": 10
  }'
```

#### 8.4 聚合统计

```bash
# 统计评分的平均值、总和、最大最小值
curl -X POST http://localhost:13001/api/agent/graphs/{graphId}/nodes/aggregate \
  -H "Authorization: Agent your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "field": "评分",
    "operations": ["sum", "avg", "max", "min", "count"]
  }'
```

响应：
```json
{
  "field": "评分",
  "results": {
    "sum": 125.5,
    "avg": 8.96,
    "max": 9.8,
    "min": 7.5,
    "count": 14
  }
}
```

#### 8.5 按类型分组聚合

```bash
curl "http://localhost:13001/api/agent/graphs/{graphId}/nodes/aggregate/by-type?field=评分&operations=count,avg" \
  -H "Authorization: Agent your-api-key"
```

#### 8.6 字段统计

```bash
# 获取图谱中所有字段的类型和统计信息
curl "http://localhost:13001/api/agent/graphs/{graphId}/nodes/field-stats" \
  -H "Authorization: Agent your-api-key"
```

响应：
```json
{
  "totalNodes": 100,
  "typeCounts": {"book": 20, "author": 15},
  "fields": {
    "评分": {
      "type": "number",
      "count": 50,
      "numericStats": {"min": 7.0, "max": 9.8, "avg": 8.5},
      "recommendSort": "numeric"
    },
    "作者": {
      "type": "string",
      "count": 50,
      "recommendSort": "alphabetical"
    }
  }
}
```

#### 8.7 数值排序 vs 字符串排序

**重要**：对于数值字段（如评分、价格、数量），必须指定 `sort.type: "number"`：

```json
// ✅ 正确：数值排序
{"sort": {"field": "评分", "order": "desc", "type": "number"}}
// 结果：9.8 > 9.5 > 8.0

// ❌ 错误：字符串排序（字典序）
{"sort": {"field": "评分", "order": "desc"}}
// 结果：9.8 < 9.5 < 8.0（按字符串比较）
```

---

### 完整示例

```javascript
// 1. 注册 Agent
const registerResponse = await fetch('http://localhost:13001/api/agent/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'my-agent' })
});
const { agent } = await registerResponse.json();
const apiKey = agent.api_key;

// 2. 创建图谱
const graphResponse = await fetch('http://localhost:13001/api/agent/graphs', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Agent ${apiKey}`
  },
  body: JSON.stringify({ name: 'Test Graph' })
});
const { graph } = await graphResponse.json();

// 3. 批量创建节点
await fetch(`http://localhost:13001/api/agent/graphs/${graph.id}/batch/nodes`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Agent ${apiKey}`
  },
  body: JSON.stringify({
    nodes: [
      { label: '张三', type: 'person' },
      { label: '李四', type: 'person' },
      { label: '公司', type: 'organization' }
    ]
  })
});

// 4. 批量创建边
await fetch(`http://localhost:13001/api/agent/graphs/${graph.id}/batch/edges`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Agent ${apiKey}`
  },
  body: JSON.stringify({
    edges: [
      { source: 'node-id-1', target: 'node-id-3', label: '工作于' },
      { source: 'node-id-2', target: 'node-id-3', label: '工作于' }
    ]
  })
});

// 5. 查询度统计
const degreesResponse = await fetch(
  `http://localhost:13001/api/agent/graphs/${graph.id}/degrees`,
  { headers: { 'Authorization': `Agent ${apiKey}` } }
);
const { degrees } = await degreesResponse.json();
console.log('节点度:', degrees);
```

---

### 错误响应格式

所有错误响应统一格式：

```json
{
  "error": "错误信息"
}
```

常见错误码：
- `400` - 请求参数错误
- `401` - 认证失败（无效的 API Key）
- `403` - 权限不足
- `404` - 资源不存在
- `429` - 请求频率超限
- `500` - 服务器内部错误

---

## 🔗 OpenCLAW 集成

MonkeyGraph 可以作为工具接入 OpenClaw，使 AI Agent 能够操作知识图谱。

### 快速开始

#### 1. 启动 MonkeyGraph 服务

```bash
cd /path/to/czh_graph
./start.sh
```

服务地址：`http://localhost:13001`

#### 2. 技能配置

```yaml
name: monkeygraph
description: 知识图谱管理 - 创建节点、边，进行图算法查询
version: 1.0.0

tools:
  - name: mg_register_agent
    description: 注册一个新的 Agent，获取 API Key

  - name: mg_create_graph
    description: 创建知识图谱

  - name: mg_batch_create_nodes
    description: 批量创建节点

  - name: mg_batch_create_edges
    description: 批量创建边（关系）

  - name: mg_get_degrees
    description: 获取节点的度统计（入度/出度）

  - name: mg_get_neighbors
    description: 获取节点的邻居（关联节点）

  - name: mg_find_path
    description: 查找两个节点之间的路径

  - name: mg_create_snapshot
    description: 创建图谱快照（版本备份）

  - name: mg_export_graph
    description: 导出图谱为 PNG 全景图片（默认 8K 分辨率）
```

### 核心函数实现

```javascript
const API_BASE = 'http://localhost:13001/api/agent';
let apiKey = null;

// 注册 Agent
async function mg_register_agent({ name, description = '' }) {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description })
  });
  const data = await response.json();
  if (data.success) {
    apiKey = data.agent.api_key;
    return { success: true, agent_id: data.agent.id, api_key: apiKey };
  }
  return { success: false, error: data.error };
}

// 创建图谱
async function mg_create_graph({ name, description = '' }) {
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

// 批量创建节点
async function mg_batch_create_nodes({ graph_id, nodes }) {
  const response = await fetch(`${API_BASE}/graphs/${graph_id}/batch/nodes`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ nodes })
  });
  return await response.json();
}

// 批量创建边
async function mg_batch_create_edges({ graph_id, edges }) {
  const response = await fetch(`${API_BASE}/graphs/${graph_id}/batch/edges`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ edges })
  });
  return await response.json();
}

// 度统计
async function mg_get_degrees({ graph_id }) {
  const response = await fetch(`${API_BASE}/graphs/${graph_id}/degrees`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}

// 邻居查询
async function mg_get_neighbors({ graph_id, node_id }) {
  const response = await fetch(`${API_BASE}/graphs/${graph_id}/nodes/${node_id}/neighbors`, {
    headers: { 'Authorization': `Agent ${apiKey}` }
  });
  return await response.json();
}

// 路径查找
async function mg_find_path({ graph_id, source, target }) {
  const response = await fetch(
    `${API_BASE}/graphs/${graph_id}/path?source=${source}&target=${target}`, 
    { headers: { 'Authorization': `Agent ${apiKey}` } }
  );
  return await response.json();
}

// 创建快照
async function mg_create_snapshot({ graph_id, name }) {
  const response = await fetch(`${API_BASE}/graphs/${graph_id}/snapshot`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Agent ${apiKey}`
    },
    body: JSON.stringify({ name })
  });
  return await response.json();
}

// 导出图谱为 PNG（默认 8K 分辨率）
async function mg_export_graph({ graph_id, width = 7680, height = 4320 }) {
  const response = await fetch(
    `${API_BASE}/graphs/${graph_id}/export?width=${width}&height=${height}`, 
    { headers: { 'Authorization': `Agent ${apiKey}` } }
  );
  if (response.ok) {
    const blob = await response.blob();
    return { success: true, blob, contentType: blob.type, size: blob.size };
  }
  return { success: false, error: '导出失败' };
}
```

### 使用场景

| 场景 | 调用的函数 |
|------|-----------|
| 创建知识图谱并添加节点 | `mg_create_graph` → `mg_batch_create_nodes` |
| 查询员工关系 | `mg_get_neighbors` |
| 查找关联路径 | `mg_find_path` |
| 备份图谱 | `mg_create_snapshot` |
| 生成全景图谱图片 | `mg_export_graph` |

### OpenCLAW API 端点

| 功能 | 方法 | 路径 |
|------|------|------|
| 注册 Agent | POST | /api/agent/register |
| 创建图谱 | POST | /api/agent/graphs |
| 批量创建节点 | POST | /api/agent/graphs/:id/batch/nodes |
| 批量创建边 | POST | /api/agent/graphs/:id/batch/edges |
| 度统计 | GET | /api/agent/graphs/:id/degrees |
| 邻居查询 | GET | /api/agent/graphs/:id/nodes/:id/neighbors |
| 路径查找 | GET | /api/agent/graphs/:id/path |
| 创建快照 | POST | /api/agent/graphs/:id/snapshot |
| 导出全景图谱 | GET | /api/agent/graphs/:id/export |

### 注意事项

1. **API Key 管理**：注册后务必保存 API Key，只返回一次
2. **批量限制**：单次批量操作最多 500 条
3. **配额限制**：默认月度配额 100000 次请求
4. **导出图片**：导出接口返回 PNG 格式图片，支持 8K 超高清分辨率

---

## 🛠️ 技术栈

### 前端
- Vue 3 + Vue Router + Vite
- D3.js（力导向图可视化）
- Three.js（3D 星云图可视化）
- ECharts（图表）
- axios

### 后端
- Node.js + Express
- SQLite (better-sqlite3) + sqlite-vec（向量搜索）
- OpenAI SDK
- JWT 认证

## 📁 项目结构

```
czh_graph/
├── frontend/                     # Vue 3 前端
│   ├── src/
│   │   ├── api/                 # API 封装
│   │   ├── components/          # Vue 组件
│   │   │   ├── ChatPanel.vue      # 对话面板
│   │   │   ├── FileUpload.vue     # 文件上传
│   │   │   ├── LogPanel.vue       # 日志面板
│   │   │   ├── OntologyPanel.vue  # 本体面板
│   │   │   └── graph/            # 图谱渲染组件（多模式）
│   │   │       ├── ForceGraphPanel.vue    # D3.js 力导向图
│   │   │       ├── RadialGraphPanel.vue    # 径向布局图
│   │   │       ├── ThreeGraphPanel.vue     # Three.js 3D 星云图
│   │   │       └── GraphBase.vue           # 图谱基础组件
│   │   ├── views/                # 页面
│   │   │   ├── Home.vue              # 主页面
│   │   │   ├── LandingPage.vue       # 落地页
│   │   │   ├── ShareView.vue         # 分享视图
│   │   │   ├── AgentManagement.vue   # Agent 管理
│   │   │   ├── TenantDashboard.vue   # 租户仪表盘
│   │   │   └── AdminDashboard.vue    # 管理员后台
│   │   └── router/                # 路由配置
│   └── vite.config.js
│
├── backend/                     # Express 后端
│   ├── src/
│   │   ├── index.js            # 入口文件
│   │   ├── database.js         # SQLite 数据库
│   │   ├── routes.js          # API 路由（核心）
│   │   ├── auth.js            # JWT 认证
│   │   ├── agentAuth.js       # Agent API 认证
│   │   ├── llmService.js      # LLM 服务
│   │   ├── mcpClient.js       # MCP 客户端
│   │   ├── logger.js          # 日志服务
│   │   ├── services/          # 业务服务
│   │   │   ├── embeddingService.js   # 向量嵌入
│   │   │   ├── textProcessor.js      # 文本处理
│   │   │   ├── ontologyGenerator.js  # 本体生成
│   │   │   └── localGraphBuilder.js  # 图谱构建
│   │   ├── tasks/             # 任务管理
│   │   ├── utils/             # 工具函数
│   │   └── docs/              # 文档和 SDK 示例
│   │       ├── openapi.json       # OpenAPI 规范
│   │       └── sdk/               # SDK 示例代码
│   │           ├── curl/
│   │           ├── javascript/
│   │           └── python/
│   ├── data/                   # 数据目录
│   │   ├── knowledge-graph.db  # SQLite 数据库
│   │   └── demo-graphs/       # 示例图谱
│   │       ├── academic.json
│   │       ├── business.json
│   │       ├── literature.json
│   │       ├── tech-knowledge.json
│   │       └── transport.json
│   ├── logs/                  # 日志目录
│   └── package.json
│
├── design/                     # 设计文档
│   └── README.md              # SaaS 升级设计方案
│
├── start.sh                    # 启动脚本
└── deploy.sh                   # 部署脚本
```

## 🔌 API 接口

### 用户 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/graphs` | GET/POST | 图谱 CRUD |
| `/api/graph/:id` | GET | 获取图谱数据 |
| `/api/nodes` | GET/POST | 节点 CRUD |
| `/api/edges` | GET/POST | 边 CRUD |
| `/api/history` | GET | 获取历史记录 |
| `/api/history/undo` | POST | 撤销操作 |
| `/api/chat` | POST | 对话接口（流式） |
| `/api/config/llm` | POST | LLM 配置 |

### 租户 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tenants/me` | GET | 获取当前租户信息 |
| `/api/tenants/me` | PUT | 更新租户信息 |
| `/api/tenants/me/subscription` | GET | 获取订阅信息 |
| `/api/tenants/me/subscription/change` | POST | 切换套餐 |
| `/api/plans` | GET | 获取所有套餐 |
| `/api/usage/current` | GET | 本月使用量 |
| `/api/usage/history` | GET | 历史使用量 |

### 管理员 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tenants/admin/tenants` | GET | 租户列表 |
| `/api/tenants/admin/tenants/:id` | GET | 租户详情 |
| `/api/tenants/admin/tenants/:id/suspend` | POST | 暂停租户 |
| `/api/tenants/admin/tenants/:id/activate` | POST | 恢复租户 |

## 📝 许可证

**MonkeyGraph License** (基于 Apache License 2.0 + 商业使用限制)

本项目采用自定义许可证：

- ✅ **允许**：个人非商业目的使用、本地部署、学习研究
- ✅ **允许**：个人出于教育目的的源代码修改和再分发
- ❌ **禁止**：未经授权的商业使用（包括商业产品、SaaS服务、收费服务等）
- 📧 **商业授权**：如需商业使用，请联系项目作者获取书面授权

完整许可证条款请参阅 [LICENSE](./LICENSE) 文件。

---

Made with ♥ by MonkeyGraph
