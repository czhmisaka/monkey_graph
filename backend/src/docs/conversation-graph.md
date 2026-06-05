# MonkeyGraph 对话生成图谱功能文档

## 1. 功能概述

MonkeyGraph 的对话生成图谱功能是一个基于大语言模型（LLM）的智能知识图谱构建系统。用户可以通过自然语言描述，系统会自动理解需求、调用工具、执行操作，最终生成或更新知识图谱。

### 1.1 核心能力

- **自然语言交互**：用户无需了解底层实现，直接用自然语言描述需求
- **自主决策执行**：LLM Agent 会自主分析需求并决定下一步操作
- **实时反馈**：通过 SSE 流式响应，用户可以实时看到 Agent 的思考和操作过程
- **外部知识获取**：集成网络搜索和图片理解能力，可获取最新信息
- **迭代式构建**：通过多轮对话和迭代，确保图谱满足用户需求

### 1.2 应用场景

- **知识抽取**：从文本、文档中自动提取实体和关系构建图谱
- **信息整合**：将分散的知识整合到统一的知识图谱中
- **实体关联**：为现有实体添加新的关系和属性
- **网络信息收集**：搜索最新信息并添加到图谱中
- **图片知识提取**：从图片中提取信息并可视化

---

## 2. 技术架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                              前端 (Vue 3)                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │  ChatPanel  │───→│  GraphPanel │───→│  SSE Event Stream       │  │
│  │  (对话面板) │    │  (图谱面板) │    │  - thought (思考)       │  │
│  │             │    │             │    │  - action (操作)        │  │
│  │  - 输入框    │    │  - D3.js    │    │  - graph (图谱更新)     │  │
│  │  - 文件上传  │    │  - 力导向图  │    │  - highlight (高亮)     │  │
│  │  - 消息展示  │    │  - 交互操作  │    │  - settings (样式更新)  │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP POST /chat/stream (SSE)
┌─────────────────────────────────────────────────────────────────────┐
│                           后端 (Express + Node.js)                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                        routes.js (API 路由)                      │  │
│  │  - POST /api/chat        (普通对话)                              │  │
│  │  - POST /api/chat/stream (SSE 流式对话)                         │  │
│  │  - POST /api/chat/cancel (取消对话)                             │  │
│  │  - GET  /api/tools       (获取工具列表)                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                    │                                  │
│                                    ▼                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      llmService.js (LLM 服务)                    │  │
│  │                                                                 │  │
│  │  ┌─────────────────┐    ┌──────────────────┐                   │  │
│  │  │   Agent 核心     │    │   工具系统       │                   │  │
│  │  │  - agentChat()  │───→│  - add_node     │                   │  │
│  │  │  - 迭代循环      │    │  - add_edge     │                   │  │
│  │  │  - 决策逻辑      │    │  - search_nodes │                   │  │
│  │  │  - SSE 流推送    │    │  - ...          │                   │  │
│  │  └─────────────────┘    └──────────────────┘                   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                    │                                  │
│              ┌─────────────────────┼─────────────────────┐         │
│              ▼                     ▼                     ▼         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  mcpClient.js    │  │   database.js    │  │  taskManager.js  │  │
│  │  (MCP 客户端)    │  │   (数据库操作)    │  │   (任务管理)      │  │
│  │                  │  │                  │  │                  │  │
│  │  - web_search    │  │  - nodeOperations│  │  - 创建任务       │  │
│  │  - understand_   │  │  - edgeOperations│  │  - 更新进度       │  │
│  │    image         │  │  - historyOps    │  │  - 完成任务       │  │
│  │                  │  │                  │  │                  │  │
│  │  (MiniMax MCP)  │  │  (SQLite)        │  │  (内存存储)       │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                      ┌─────────────────────────────────┐
                      │      MiniMax API (LLM)           │
                      │  - GPT-4 / GPT-3.5              │
                      │  - 支持 Function Calling         │
                      │  - 流式响应                      │
                      └─────────────────────────────────┘
```

### 2.2 核心组件说明

| 组件 | 文件路径 | 职责说明 |
|------|----------|----------|
| API 路由 | `backend/src/routes.js` | 定义对话相关的 API 接口，处理请求和响应 |
| LLM 服务 | `backend/src/llmService.js` | Agent 核心逻辑、工具定义、模型调用 |
| MCP 客户端 | `backend/src/mcpClient.js` | 与 MCP 服务器通信，调用外部工具 |
| 任务管理 | `backend/src/tasks/taskManager.js` | 跟踪异步任务进度状态 |
| 数据库 | `backend/src/database.js` | 图谱数据持久化存储 |
| 前端对话 | `frontend/src/components/ChatPanel.vue` | 用户输入、消息展示、SSE 事件处理 |

---

## 3. API 接口详解

### 3.1 对话接口

#### 3.1.1 普通对话接口

**接口**: `POST /api/chat`

**描述**: 发送对话请求，获取 Agent 处理结果（非流式）

**请求参数**:
```json
{
  "messages": [
    { "role": "user", "content": "添加 Python 编程语言节点" }
  ],
  "maxIterations": 50,
  "graphId": "graph-uuid-xxx"
}
```

**响应**:
```json
{
  "success": true,
  "iterations": 3,
  "message": {
    "role": "assistant",
    "content": "已成功添加 Python 节点到图谱中"
  },
  "executionTrace": [
    {
      "iteration": 1,
      "type": "thought",
      "content": "用户想要添加一个 Python 节点..."
    },
    {
      "iteration": 1,
      "type": "action",
      "toolName": "add_node",
      "result": { "success": true, "data": {...} }
    }
  ],
  "summary": {
    "totalNodes": 15,
    "totalEdges": 23
  }
}
```

#### 3.1.2 SSE 流式对话接口

**接口**: `POST /api/chat/stream`

**描述**: 通过 Server-Sent Events 实现实时流式响应

**请求参数**: 同普通对话接口

**SSE 事件流格式**:

```text
data: {"type": "start", "message": "用户输入内容"}

data: {"type": "graph", "nodes": [...], "edges": [...]}

data: {"type": "thought", "iteration": 1, "content": "思考内容..."}

data: {"type": "action", "iteration": 1, "toolName": "add_node", "arguments": {...}, "result": {...}}

data: {"type": "graph", "nodes": [...], "edges": [...]}

data: {"type": "highlight", "nodeId": "xxx", "label": "Python"}

data: {"type": "settings", "settings": {...}}

data: {"type": "done", "success": true, "iterations": 3, "message": "..."}
```

**SSE 事件类型说明**:

| 事件类型 | 说明 | 包含字段 |
|----------|------|----------|
| `start` | 对话开始 | `message` (用户输入) |
| `graph` | 图谱数据更新 | `nodes`, `edges` |
| `thought` | AI 思考过程 | `iteration`, `content` |
| `action` | 工具执行 | `iteration`, `toolName`, `arguments`, `result` |
| `highlight` | 节点高亮 | `nodeId`, `label` |
| `settings` | 样式更新 | `settings` |
| `done` | 对话完成 | `success`, `iterations`, `message`, `summary` |
| `error` | 错误发生 | `message` |
| `cancelled` | 已取消 | `message` |

#### 3.1.3 取消对话接口

**接口**: `POST /api/chat/cancel`

**请求参数**:
```json
{
  "graphId": "graph-uuid-xxx"
}
```

**响应**:
```json
{
  "success": true,
  "message": "对话已取消"
}
```

### 3.2 工具列表接口

**接口**: `GET /api/tools`

**描述**: 获取所有可用的 Agent 工具列表

---

## 4. 模型调用机制

### 4.1 LLM 配置

MonkeyGraph 支持多种 LLM 配置方式：

#### 4.1.1 环境变量配置

```bash
# .env 文件
LLM_CLOUD_API_KEY=your_api_key_here
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1/
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
```

#### 4.1.2 运行时配置

通过 API 动态配置：

```javascript
// POST /api/config/llm
{
  "apiKey": "your_api_key",
  "baseURL": "https://api.minimaxi.com/v1/",
  "model": "MiniMax-M2.5"
}
```

### 4.2 模型调用流程

```javascript
// llmService.js 中的核心调用
const response = await openai.chat.completions.create({
  model: currentModel,           // 当前配置的模型
  messages: conversationHistory, // 对话历史
  tools: tools,                  // 可用工具列表
  tool_choice: 'auto',           // 模型自主选择工具
  temperature: 0.7               // 温度参数
});
```

### 4.3 提示词工程设计

#### 4.3.1 系统提示词

系统提示词定义了 Agent 的角色定位、能力边界和工作模式：

```javascript
const systemPrompt = `你是一个智能知识图谱助手（Agent模式），你的目标是以完成任务为导向。

## 你的能力
你可以使用以下工具来操作知识图谱：
### 图谱操作工具
1. add_node - 添加新节点
2. add_edge - 添加边（连接两个节点）
3. update_node - 更新节点属性
4. delete_node - 删除节点
5. delete_edge - 删除边
6. search_nodes - 搜索图谱中的节点
7. get_graph_info - 获取完整图谱信息
8. highlight_node - 居中高亮显示指定节点
9. get_graph_settings - 获取图谱的基础设定
10. update_graph_settings - 更新图谱的基础设定
11. delete_graph_settings - 删除图谱的基础设定

### MCP 工具（外部能力）
12. web_search - 通过网络搜索获取最新信息
13. understand_image - 分析图片内容

## 工作模式
1. 首先使用 get_graph_info 了解当前图谱状态
2. 分析用户需求，执行相应操作
3. 每次工具调用后检查任务是否完成
4. 如果未完成继续执行，否则总结结果
5. 你应该全面的分析文档并尽可能的抽离每个关键知识点！
6. 如果用户需求中包含某个实体但图谱中没有，需要主动添加这个实体。`;
```

#### 4.3.2 进度检查提示

每次工具执行后，会插入进度检查提示词，让模型判断任务是否完成：

```javascript
const progressCheck = {
  role: 'user',
  content: `【进度检查】当前图谱有 ${currentNodes.length} 个节点和 ${currentEdges.length} 条边。
            请判断用户需求是否已满足？如果已完成，请给出最终总结并回复完成任务；
            如果未完成，请继续执行下一步操作。`
};
```

---

## 5. 工具系统详解

### 5.1 工具分类

| 类别 | 工具数量 | 说明 |
|------|----------|------|
| 图谱操作工具 | 11 个 | 直接操作图谱数据 |
| MCP 外部工具 | 2 个 | 网络搜索、图片理解 |
| **总计** | **13 个** | 完整的 Agent 能力集 |

### 5.2 图谱操作工具详解

#### 5.2.1 add_node - 添加节点

**定义**:
```javascript
{
  name: 'add_node',
  description: '添加一个新的节点到知识图谱中',
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: '节点的标签/名称' },
      type: { type: 'string', description: '节点类型（如 person, organization, concept 等）' },
      properties: { type: 'object', description: '节点的额外属性' }
    },
    required: ['label']
  }
}
```

**执行逻辑**:
```javascript
case 'add_node': {
  const nodeId = uuidv4();
  const newNode = nodeOperations.createForGraph({
    id: nodeId,
    label: args.label,
    type: args.type || 'default',
    properties: args.properties || {}
  }, graphId);
  historyOperations.add(graphId, 'create', 'node', newNode.id, null, newNode);
  return { success: true, data: newNode };
}
```

#### 5.2.2 add_edge - 添加边

**定义**:
```javascript
{
  name: 'add_edge',
  description: '在两个节点之间添加一条边（关系）',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: '源节点 ID' },
      target: { type: 'string', description: '目标节点 ID' },
      label: { type: 'string', description: '边的标签/关系名称' },
      type: { type: 'string', description: '边的类型' }
    },
    required: ['source', 'target', 'label']
  }
}
```

**关键特性**:
- 自动验证源节点和目标节点是否存在
- 验证节点是否属于当前图谱
- 记录操作历史到 `historyOperations`

#### 5.2.3 update_node - 更新节点

**定义**:
```javascript
{
  name: 'update_node',
  description: '更新现有节点的属性',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '节点 ID' },
      label: { type: 'string', description: '新的标签' },
      type: { type: 'string', description: '新的类型' },
      properties: { type: 'object', description: '新的属性' }
    },
    required: ['id']
  }
}
```

#### 5.2.4 delete_node - 删除节点

**定义**:
```javascript
{
  name: 'delete_node',
  description: '删除一个节点（同时会删除所有关联的边）',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '节点 ID' }
    },
    required: ['id']
  }
}
```

**注意**: 删除节点会自动删除所有与该节点相连的边

#### 5.2.5 search_nodes - 搜索节点

**定义**:
```javascript
{
  name: 'search_nodes',
  description: '搜索图谱中的节点',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词' }
    },
    required: ['keyword']
  }
}
```

**返回格式**:
```javascript
return { 
  success: true, 
  data: { 
    count: summary.length, 
    results: [{ label, type }, ...] 
  } 
};
```

#### 5.2.6 get_graph_info - 获取图谱信息

**定义**:
```javascript
{
  name: 'get_graph_info',
  description: '获取当前知识图谱的完整信息',
  parameters: { type: 'object', properties: {} }
}
```

**返回格式**:
```javascript
return { 
  success: true, 
  data: { 
    nodes: [{ id, label, type, properties }, ...],
    edges: [{ id, source, target, label, type }, ...]
  } 
};
```

#### 5.2.7 highlight_node - 高亮节点

**定义**:
```javascript
{
  name: 'highlight_node',
  description: '在图谱视图中居中并高亮显示指定节点',
  parameters: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '要高亮显示的节点ID' },
      keyword: { type: 'string', description: '搜索关键词，会高亮第一个匹配到的节点' }
    }
  }
}
```

**特性**: 支持通过 `nodeId` 直接指定或通过 `keyword` 关键词搜索匹配节点

#### 5.2.8 get_graph_settings - 获取样式设置

**定义**:
```javascript
{
  name: 'get_graph_settings',
  description: '获取当前图谱的基础设定配置',
  parameters: { type: 'object', properties: {} }
}
```

#### 5.2.9 update_graph_settings - 更新样式设置

**定义**:
```javascript
{
  name: 'update_graph_settings',
  description: '更新当前图谱的基础设定配置',
  parameters: {
    type: 'object',
    properties: {
      nodeTypes: { type: 'object', description: '节点类型配置 {color, shape}' },
      edgeTypes: { type: 'object', description: '边类型配置 {color, style}' }
    }
  }
}
```

#### 5.2.10 delete_graph_settings - 删除样式设置

**定义**:
```javascript
{
  name: 'delete_graph_settings',
  description: '删除图谱的基础设定配置',
  parameters: {
    type: 'object',
    properties: {
      nodeTypes: { type: 'array', description: '要删除的节点类型名称数组' },
      edgeTypes: { type: 'array', description: '要删除的边类型名称数组' },
      clearAll: { type: 'boolean', description: '是否清除所有设定' }
    }
  }
}
```

#### 5.2.11 delete_edge - 删除边

**定义**:
```javascript
{
  name: 'delete_edge',
  description: '删除一条边',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '边 ID' }
    },
    required: ['id']
  }
}
```

### 5.3 MCP 外部工具

#### 5.3.1 web_search - 网络搜索

**定义**:
```javascript
{
  name: 'web_search',
  description: '通过网络搜索获取最新信息。当查询需要实时数据、新闻或其他网络资源时使用此工具。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    },
    required: ['query']
  }
}
```

**实现原理**:
- 通过 MCP 协议调用 `minimax-coding-plan-mcp` 服务器
- MCP 服务器内部调用 MiniMax API 的 web_search 能力
- 包含重试机制（默认重试 2 次）

**错误处理**:
```javascript
// 检查 SSL、网络等可重试错误
const isRetryableError = lastError && (
  lastError.includes('SSL') || 
  lastError.includes('EOF') || 
  lastError.includes('connection') ||
  lastError.includes('timeout')
);
```

#### 5.3.2 understand_image - 图片理解

**定义**:
```javascript
{
  name: 'understand_image',
  description: '分析图片内容，提取图片中的信息',
  parameters: {
    type: 'object',
    properties: {
      image_source: { type: 'string', description: '图片 URL 或本地路径' },
      prompt: { type: 'string', description: '需要图片分析的问题' }
    },
    required: ['image_source', 'prompt']
  }
}
```

---

## 6. Agent 模式详解

### 6.1 ReAct 循环机制

MonkeyGraph 采用 ReAct（Reasoning + Acting）范式实现 Agent：

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 迭代循环                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                          │
│   │ 1. 思考     │  根据当前状态和用户需求，决定下一步操作      │
│   └──────┬──────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                          │
│   │ 2. 选择工具  │  从 13 个工具中选择合适的工具             │
│   └──────┬──────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                          │
│   │ 3. 执行工具  │  调用工具函数，操作图谱或外部服务          │
│   └──────┬──────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                          │
│   │ 4. 观察结果  │  获取工具执行结果                         │
│   └──────┬──────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                          │
│   │ 5. 进度检查  │  判断任务是否完成？                       │
│   └──────┬──────┘                                          │
│          │                                                  │
│    ┌─────┴─────┐                                           │
│    │ 完成?     │                                           │
│    └─────┬─────┘                                           │
│      是  │  否                                              │
│      │   └──→ 返回步骤 1 继续迭代                           │
│      │                                                       │
│      ▼                                                       │
│   ┌─────────────┐                                          │
│   │ 6. 返回结果  │  总结完成的工作                           │
│   └─────────────┘                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 迭代控制策略

```javascript
// llmService.js 中的迭代循环
let iteration = 0;
const maxIterations = maxIterations || Infinity;  // 默认无限制

while (iteration < maxIterations) {
  iteration++;
  
  // 1. 调用 LLM 获取响应
  const response = await openai.chat.completions.create({
    model: currentModel,
    messages: conversationHistory,
    tools: tools,
    tool_choice: 'auto'
  });
  
  // 2. 如果没有工具调用，任务完成
  if (!assistantMessage.tool_calls) {
    finalMessage = assistantMessage;
    taskCompleted = true;
    break;
  }
  
  // 3. 执行所有工具调用
  for (const toolCall of assistantMessage.tool_calls) {
    const result = await executeTool(toolCall, graphId, sendEvent);
    // ...
  }
  
  // 4. 插入进度检查
  conversationHistory.push(progressCheck);
}
```

### 6.3 取消机制实现

#### 6.3.1 后端取消机制

```javascript
// routes.js 中注册活跃对话
const activeConversations = new Map();

export function registerConversation(graphId, abortController) {
  activeConversations.set(graphId, { abortController, signal: abortController.signal });
}

export function cancelConversation(graphId) {
  const conversation = activeConversations.get(graphId);
  if (conversation && !conversation.signal.aborted) {
    conversation.abortController.abort();
    return true;
  }
  return false;
}
```

#### 6.3.2 SSE 请求级取消

```javascript
// llmService.js 中检查取消信号
export async function agentChat(messages, maxIterations, sendEvent, graphId, signal) {
  
  // 检查是否已取消
  if (signal?.aborted) {
    return {
      success: false,
      iterations: 0,
      cancelled: true
    };
  }
  
  // 在每次操作前检查
  if (signal?.aborted) {
    break;  // 退出迭代循环
  }
}
```

---

## 7. MCP 集成详解

### 7.1 MCP 服务架构

MCP（Model Context Protocol）是一种标准化协议，用于连接 LLM 与外部工具：

```
┌─────────────────┐         MCP 协议          ┌─────────────────┐
│  MonkeyGraph    │ ◄─────────────────────► │  MiniMax MCP    │
│  (MCP Client)   │                          │  (MCP Server)   │
│                 │                          │                 │
│  mcpClient.js  │                          │ minimax-       │
│                 │                          │ coding-plan-mcp │
└─────────────────┘                          └─────────────────┘
        │                                              │
        │  JSON-RPC 请求                               │
        │  - tools/list                               │
        │  - tools/call                               │
        │                                             │
        └────────────────────────────────────────────┘
                         │
                         ▼
               ┌─────────────────────┐
               │    MiniMax API      │
               │  - web_search      │
               │  - understand_image│
               └─────────────────────┘
```

### 7.2 MCP 客户端初始化

```javascript
// mcpClient.js
export async function initMCPClient(forceReconnect = false) {
  // 1. 启动 Python MCP 服务器进程
  mcpProcess = spawn('uvx', ['minimax-coding-plan-mcp', '-y'], {
    env: {
      MINIMAX_API_KEY: process.env.LLM_CLOUD_API_KEY,
      MINIMAX_API_HOST: process.env.LLM_CLOUD_BASE_URL
    }
  });
  
  // 2. 发送 initialize 请求
  await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'czhgraph', version: '1.0.0' }
  });
  
  // 3. 发送 initialized 通知
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  }) + '\n');
}
```

### 7.3 MCP 工具调用流程

```javascript
// 调用 MCP 工具
export async function callMCPTool(toolName, args) {
  const result = await sendRequest('tools/call', {
    name: toolName,
    arguments: args
  });
  return result;
}

// web_search 工具（包含重试）
export async function webSearch(query, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await callMCPTool('web_search', { query });
    if (result.success) return result;
    
    // 检查是否可重试
    if (!isRetryableError(result.error)) break;
  }
  return { success: false, error: lastError };
}
```

### 7.4 MCP 降级模式

当 MCP 服务不可用时，系统会进入降级模式：

```javascript
// mcpClient.js
let isDegraded = false;

// 处理断开连接
function handleDisconnect() {
  isConnected = false;
  
  // 重试 3 次后进入降级模式
  if (initAttemptCount >= MAX_INIT_ATTEMPTS) {
    isDegraded = true;
    logger.warn('MCP 进入降级模式');
  }
  
  // 每 30 秒尝试重连
  reconnectTimer = setTimeout(() => {
    initMCPClient(true);
  }, 30000);
}
```

---

## 8. 前端集成详解

### 8.1 SSE 事件处理

前端通过 EventSource 或 fetch + ReadableStream 接收 SSE 事件：

```javascript
// Home.vue 中的 SSE 处理
async function handleSend(message) {
  // 创建 SSE 连接
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      graphId: currentGraphId
    })
  });
  
  // 读取 SSE 流
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    // 解析 SSE 事件
    const events = parseSSEvents(chunk);
    
    for (const event of events) {
      handleSSEEvent(event);
    }
  }
}
```

### 8.2 SSE 事件处理函数

```javascript
function handleSSEEvent(event) {
  switch (event.type) {
    case 'start':
      // 显示加载状态
      setLoading(true);
      break;
      
    case 'graph':
      // 更新图谱数据
      updateGraphData(event.nodes, event.edges);
      break;
      
    case 'thought':
      // 显示 AI 思考过程
      addThoughtMessage(event.iteration, event.content);
      break;
      
    case 'action':
      // 显示工具执行结果
      addActionResult(event.toolName, event.result);
      break;
      
    case 'highlight':
      // 高亮节点
      highlightNode(event.nodeId);
      break;
      
    case 'settings':
      // 更新样式配置
      updateSettings(event.settings);
      break;
      
    case 'done':
      // 任务完成
      setLoading(false);
      showFinalResult(event);
      break;
      
    case 'error':
      // 显示错误
      showError(event.message);
      break;
  }
}
```

### 8.3 取消功能实现

```javascript
// 取消对话
async function cancelChat() {
  await fetch('/api/chat/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ graphId: currentGraphId })
  });
  
  setLoading(false);
}
```

---

## 9. 使用示例

### 9.1 基础对话操作

**用户输入**: "添加一个名为 Python 的编程语言节点"

**Agent 执行流程**:
1. 调用 `get_graph_info` 获取当前图谱状态
2. 调用 `add_node` 添加 Python 节点
3. 判断任务完成，返回结果

**返回结果**:
```json
{
  "success": true,
  "iterations": 2,
  "summary": {
    "totalNodes": 16,
    "totalEdges": 23
  }
}
```

### 9.2 复杂知识抽取

**用户输入**: "我有一段文字：'张三在苹果公司工作，使用 Python 开发后端服务。他和李四是同事关系。'请提取实体和关系。"

**Agent 执行流程**:
1. 分析文本，识别实体： 张三、苹果公司、Python、后端服务、李四
2. 调用 `add_node` 添加：张三（person）、苹果公司（organization）、Python（concept）
3. 调用 `add_edge` 添加关系：
   - 张三 - 工作于 -> 苹果公司
   - 张三 - 使用 -> Python
   - 张三 - 是...同事 -> 李四
4. 判断任务完成

### 9.3 网络信息整合

**用户输入**: "搜索一下最新的 AI 大模型发展趋势，然后添加到图谱中"

**Agent 执行流程**:
1. 调用 `web_search` 搜索："AI 大模型发展趋势 2024"
2. 分析搜索结果，提取关键信息
3. 调用 `add_node` 添加新节点
4. 调用 `add_edge` 建立关系
5. 重复直到信息收集完整

### 9.4 图片知识提取

**用户输入**: "分析这张图片中的组织架构关系：[图片URL]"

**Agent 执行流程**:
1. 调用 `understand_image` 分析图片
2. 解析返回的结构化信息
3. 根据组织架构创建对应的节点和边

---

## 10. 任务管理模式

### 10.1 TaskManager 概述

对于需要长时间运行的异步任务（如图谱构建），系统使用 TaskManager 管理任务状态：

```javascript
// taskManager.js
export class TaskManager {
  // 创建任务
  static createTask(type, data) {
    const taskId = `task_${uuidv4()}`;
    tasks.set(taskId, {
      taskId,
      type,
      status: 'PENDING',
      progress: 0,
      message: '任务已创建'
    });
    return taskId;
  }
  
  // 更新进度
  static updateProgress(taskId, progress, message) {
    // ...
  }
  
  // 完成任务
  static completeTask(taskId, result) {
    // ...
  }
  
  // 任务失败
  static failTask(taskId, error) {
    // ...
  }
}
```

### 10.2 任务状态

```javascript
export const TaskStatus = {
  PENDING: 'PENDING',      // 等待中
  PROCESSING: 'PROCESSING', // 处理中
  COMPLETED: 'COMPLETED',  // 已完成
  FAILED: 'FAILED'        // 失败
};
```

### 10.3 任务查询接口

**接口**: `GET /api/graph/task/:taskId`

**响应**:
```json
{
  "success": true,
  "data": {
    "task_id": "task_xxx",
    "status": "PROCESSING",
    "message": "正在构建图谱...",
    "progress": 0.5,
    "result": null,
    "error": null
  }
}
```

---

## 11. 错误处理机制

### 11.1 错误类型

| 错误类型 | 说明 | 处理方式 |
|----------|------|----------|
| `ValidationError` | 请求参数验证失败 | 返回 400 错误 |
| `NotFoundError` | 资源不存在 | 返回 404 错误 |
| `UnauthorizedError` | 未授权 | 返回 401 错误 |
| `ToolExecutionError` | 工具执行失败 | 返回工具错误信息 |
| `LLMError` | LLM 调用失败 | 返回 500 错误 |
| `MCPError` | MCP 服务错误 | 进入降级模式 |

### 11.2 工具执行错误处理

```javascript
// llmService.js
case 'add_edge': {
  const sourceNode = nodeOperations.getById(args.source);
  const targetNode = nodeOperations.getById(args.target);
  
  if (!sourceNode || !targetNode) {
    return { 
      success: false, 
      error: '源节点或目标节点不存在' 
    };
  }
  
  if (sourceNode.graph_id !== graphId || targetNode.graph_id !== graphId) {
    return { 
      success: false, 
      error: '源节点或目标节点不属于当前图谱' 
    };
  }
  // ...
}
```

### 11.3 前端错误展示

```javascript
function handleSSEEvent(event) {
  if (event.type === 'error') {
    showToast({
      type: 'error',
      message: event.message,
      duration: 5000
    });
  }
}
```

---

## 12. 配置与部署

### 12.1 环境变量配置

```bash
# .env 文件示例
LLM_CLOUD_API_KEY=your_api_key_here
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1/
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
PORT=13001
```

### 12.2 启动服务

```bash
# 方式一：使用启动脚本
chmod +x start.sh
./start.sh

# 方式二：手动启动
# 终端 1: 后端
cd backend && npm install && npm start

# 终端 2: 前端
cd frontend && npm install && npm run dev
```

### 12.3 MCP 服务要求

确保系统已安装 uvx：
```bash
# 安装 uvx
pip install uvx

# 或使用 pipx
pipx install uvx
```

---

## 13. 常见问题

### Q1: 对话没有响应怎么办？

**检查项**:
1. 确认 LLM API Key 配置正确
2. 检查后端日志：`tail -f backend/logs/app.log`
3. 确认 MCP 服务是否正常运行

### Q2: 如何控制 Agent 的迭代次数？

通过 `maxIterations` 参数控制：
```javascript
// 限制最多 10 次迭代
const result = await chat(messages, 10, graphId);
```

### Q3: MCP 工具不可用怎么办？

系统会自动进入降级模式，仍可使用图谱操作工具，但网络搜索功能不可用。可以尝试：
```javascript
// 手动重连 MCP
await initMCPClient(true);
```

### Q4: 如何查看 Agent 的执行过程？

通过 SSE 流式响应的 `thought` 和 `action` 事件可以看到完整的执行轨迹。

### Q5: 如何取消正在进行的对话？

点击前端的取消按钮，或调用 `POST /api/chat/cancel` 接口。

---

## 附录：工具完整定义

### A.1 图谱操作工具

```javascript
const graphTools = [
  {
    type: 'function',
    function: {
      name: 'add_node',
      description: '添加一个新的节点到知识图谱中',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '节点的标签/名称' },
          type: { type: 'string', description: '节点类型' },
          properties: { type: 'object', description: '节点的额外属性' }
        },
        required: ['label']
      }
    }
  },
  // ... 其他 10 个工具
];
```

### A.2 MCP 工具

```javascript
const mcpTools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '通过网络搜索获取最新信息',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'understand_image',
      description: '分析图片内容，提取图片中的信息',
      parameters: {
        type: 'object',
        properties: {
          image_source: { type: 'string', description: '图片 URL 或本地路径' },
          prompt: { type: 'string', description: '需要图片分析的问题' }
        },
        required: ['image_source', 'prompt']
      }
    }
  }
];
```

---

*文档版本: 1.0.0*
*最后更新: 2024-03-19*