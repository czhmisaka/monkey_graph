# MonkeyGraph 项目开发规范

## 1. 项目概述

**MonkeyGraph** 是一个通过自然语言对话构建和可视化知识图谱的完整解决方案。

### 技术栈
- **前端**: Vue 3 + Vue Router + Vite + D3.js + axios
- **后端**: Node.js + Express + SQLite (better-sqlite3) + OpenAI SDK
- **模块系统**: ES Module (`"type": "module"`)
- **协议**: MCP (Model Context Protocol) - 支持 web_search, understand_image

### 端口配置
- 前端: `http://localhost:13002`
- 后端: `http://localhost:13001`
- 数据库: `backend/data/knowledge-graph.db`

---

## 2. 项目结构

```
czh_graph/
├── backend/                    # Express 后端
│   ├── src/
│   │   ├── index.js           # 入口文件
│   │   ├── routes.js         # API 路由 (核心)
│   │   ├── database.js       # 数据库操作
│   │   ├── auth.js           # JWT 认证
│   │   ├── llmService.js     # LLM 服务
│   │   ├── mcpClient.js      # MCP 客户端
│   │   ├── logger.js         # 日志服务
│   │   ├── services/         # 业务服务
│   │   │   ├── embeddingService.js   # 向量嵌入服务
│   │   │   ├── ontologyGenerator.js  # 本体生成
│   │   │   ├── localGraphBuilder.js  # 图谱构建
│   │   │   └── textProcessor.js       # 文本处理
│   │   ├── utils/            # 工具函数
│   │   │   └── fileParser.js # 文件解析
│   │   └── tasks/            # 任务管理
│   │       └── taskManager.js
│   ├── data/                 # 数据目录 (SQLite)
│   ├── logs/                 # 日志目录
│   └── package.json
│
└── frontend/                 # Vue 3 前端
    ├── src/
    │   ├── main.js           # 入口
    │   ├── App.vue           # 根组件
    │   ├── api/              # API 封装
    │   │   └── index.js
    │   ├── components/       # 组件
    │   │   ├── ChatPanel.vue      # 对话面板
    │   │   ├── GraphPanel.vue     # 图谱面板
    │   │   ├── FileUpload.vue     # 文件上传
    │   │   ├── OntologyPanel.vue  # 本体面板
    │   │   └── LogPanel.vue       # 日志面板
    │   ├── views/            # 页面
    │   │   ├── Home.vue           # 主页面
    │   │   └── ShareView.vue      # 分享页面
    │   ├── router/           # 路由
    │   │   └── index.js
    │   ├── styles/           # 样式
    │   │   └── main.css
    │   └── utils/            # 工具
    │       └── logger.js
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 3. 代码规范

### 3.1 后端规范 (ES Module)

```javascript
// ✅ 正确: 使用 ES Module 导入
import express from 'express';
import { graphOperations, nodeOperations } from './database.js';

// ❌ 错误: 不要使用 require
// const express = require('express');
```

### 3.2 前端规范 (Vue 3 Composition API)

```vue
<script setup>
import { ref, computed, onMounted } from 'vue';

// 使用 ref 创建响应式变量
const nodes = ref([]);
const loading = ref(false);

// 使用 computed 创建计算属性
const nodeCount = computed(() => nodes.value.length);

// 使用 onMounted 处理生命周期
onMounted(() => {
  loadData();
});
</script>

<template>
  <!-- 模板内容 -->
</template>
```

### 3.3 API 路由规范

所有 API 路由遵循 RESTful 风格：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/graphs` | 获取图谱列表 |
| POST | `/api/graphs` | 创建图谱 |
| GET | `/api/graphs/:id` | 获取图谱详情 |
| PUT | `/api/graphs/:id` | 更新图谱 |
| DELETE | `/api/graphs/:id` | 删除图谱 |
| GET | `/api/graphs/:graphId/nodes` | 获取节点列表 |
| POST | `/api/graphs/:graphId/nodes` | 创建节点 |
| POST | `/api/chat` | 对话接口 |
| POST | `/api/chat/stream` | SSE 流式对话 |

### 3.4 错误处理

```javascript
// 后端错误处理
router.post('/endpoint', (req, res) => {
  try {
    // 业务逻辑
    if (!valid) {
      return res.status(400).json({ error: '错误信息' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 4. 数据库规范

### 4.1 核心表结构

- **users**: 用户表 (id, username, password, avatar, bio)
- **graphs**: 图谱表 (id, user_id, name, description, is_active, settings)
- **nodes**: 节点表 (id, graph_id, label, type, properties, x, y, embedding)
- **edges**: 边表 (id, graph_id, source, target, label, type, properties)
- **history**: 历史记录表 (id, graph_id, operation, target_type, target_id, old_data, new_data)
- **user_llm_configs**: LLM 配置表 (user_id, provider, api_key, base_url, model_name)
- **graph_shares**: 分享表 (graph_id, share_token, allow_edit, expires_at)

### 4.2 节点类型

| 类型 | 说明 | 颜色 |
|------|------|------|
| person | 人物 | 蓝色 |
| organization | 组织 | 绿色 |
| concept | 概念 | 紫色 |
| location | 地点 | 橙色 |
| default | 默认 | 灰色 |

---

## 5. 关键功能规范

### 5.1 对话系统

对话接口使用 SSE 流式响应：

```javascript
// 后端 SSE 响应格式
res.setHeader('Content-Type', 'text/event-stream');
res.write(`data: ${JSON.stringify({ type: 'start', message: '...' })}\n\n`);
res.write(`data: ${JSON.stringify({ type: 'graph', nodes: [], edges: [] })}\n\n`);
res.write(`data: ${JSON.stringify({ type: 'done', success: true })}\n\n`);
```

前端接收事件类型：`start`, `graph`, `message`, `done`, `error`, `cancelled`

### 5.2 Embedding 向量搜索

使用本地 qwen3 模型进行向量计算：

- **计算 Embedding**: `POST /api/graphs/:graphId/embedding/compute`
- **语义搜索**: `GET /api/graphs/:graphId/embedding/search?q=xxx`
- **相似节点**: `GET /api/graphs/:graphId/embedding/similar/:nodeId`
- **聚类分析**: `POST /api/graphs/:graphId/embedding/cluster`

### 5.3 MCP 工具集成

项目集成了 MiniMax MCP 工具：

- `web_search`: 网络搜索
- `understand_image`: 图片理解

使用示例：
```javascript
import { getMCPClient } from './mcpClient.js';
const client = await getMCPClient();
const result = await client.callTool('web_search', { query: '关键词' });
```

---

## 6. 开发环境

### 6.1 Node 版本

使用 nvm 切换 Node 版本：

```bash
# 查看可用版本
nvm list

# 使用项目指定的 Node 版本（已统一为 Node 24）
nvm use 24
# ABI 137 已验证
```

### 6.2 启动命令

```bash
# 方式一: 使用启动脚本 (推荐)
chmod +x start.sh
./start.sh

# 方式二: 手动启动
# 终端1: 后端
cd backend && npm install && npm start

# 终端2: 前端
cd frontend && npm install && npm run dev
```

### 6.3 环境变量

后端 `.env` 配置：

```bash
# MiniMax API 配置 (推荐)
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1/
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
LLM_CLOUD_API_KEY=your_api_key

# 服务端口
PORT=13001
```

---

## 7. 前端组件规范

### 7.1 GraphPanel 组件

核心 D3.js 可视化组件，负责：
- 力导向图布局
- 节点拖拽、缩放
- 悬停高亮
- 导出 PNG

### 7.2 ChatPanel 组件

对话面板，负责：
- 消息展示
- 文件上传
- SSE 流式响应处理
- AI Agent 调用

### 7.3 API 调用规范

```javascript
// 使用项目封装的 axios
import api from '@/api';

// GET 请求
const graphs = await api.get('/graphs');

// POST 请求 (带认证)
const result = await api.post('/chat', {
  messages: [{ role: 'user', content: '...' }],
  graphId: '...'
}, {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## 8. 注意事项

1. **不要重复启动服务**: 确认没有正在运行的前后端服务再启动
2. **使用绝对路径**: 文件操作使用 `path.join(__dirname, ...)`
3. **数据库事务**: 批量操作使用事务保证数据一致性
4. **SSE 连接管理**: 前端维护一个 SSE 连接，避免重复连接
5. **文件上传限制**: 限制 50MB，支持 PDF/MD/TXT 格式
6. **日志查看**: 使用 `backend/logs/` 目录下的日志文件排查问题

---

## 9. 常用调试命令

```bash
# 查看后端日志
tail -f backend/logs/app.log

# 查看最近 50 条日志
tail -n 50 backend/logs/app.log

# SQLite 查看数据
sqlite3 backend/data/knowledge-graph.db "SELECT * FROM nodes LIMIT 10;"

# 前端热重载
cd frontend && npm run dev

# 后端热重载
cd backend && npm run dev
```

---

## 10. 文件命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase + .vue | `GraphPanel.vue` |
| 工具函数 | camelCase + .js | `fileParser.js` |
| 服务模块 | camelCase + Service.js | `embeddingService.js` |
| 路由 | kebab-case.js | `graph-routes.js` |
| 样式 | main.css | `main.css` |