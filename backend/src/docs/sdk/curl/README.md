# cURL 命令示例

## 基础配置

```bash
# 设置变量
BASE_URL="http://localhost:13001"
API_KEY="your-api-key"
```

## Agent 管理

### 注册 Agent

```bash
curl -X POST "$BASE_URL/api/agent/register" \
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

### 获取当前 Agent 信息

```bash
curl "$BASE_URL/api/agent/me" \
  -H "Authorization: Agent $API_KEY"
```

### 获取配额信息

```bash
curl "$BASE_URL/api/agent/quota" \
  -H "Authorization: Agent $API_KEY"
```

### 轮换 API Key

```bash
curl -X POST "$BASE_URL/api/agent/rotate-key" \
  -H "Authorization: Agent $API_KEY"
```

## 图谱操作

### 获取图谱列表

```bash
curl "$BASE_URL/api/agent/graphs" \
  -H "Authorization: Agent $API_KEY"
```

### 创建图谱

```bash
curl -X POST "$BASE_URL/api/agent/graphs" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Knowledge Graph",
    "description": "Description"
  }'
```

### 获取图谱详情

```bash
curl "$BASE_URL/api/agent/graphs/{graphId}" \
  -H "Authorization: Agent $API_KEY"
```

### 删除图谱

```bash
curl -X DELETE "$BASE_URL/api/agent/graphs/{graphId}" \
  -H "Authorization: Agent $API_KEY"
```

## 节点操作

### 批量创建节点

```bash
curl -X POST "$BASE_URL/api/agent/graphs/{graphId}/batch/nodes" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {"label": "节点1", "type": "person", "properties": {"name": "张三"}},
      {"label": "节点2", "type": "organization", "properties": {"name": "公司"}},
      {"label": "节点3", "type": "concept"}
    ],
    "auto_embedding": true
  }'
```

### 批量更新节点

```bash
curl -X PUT "$BASE_URL/api/agent/graphs/{graphId}/batch/nodes" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {"id": "node-id", "label": "新名称", "properties": {"key": "value"}}
    ]
  }'
```

### 批量删除节点

```bash
curl -X DELETE "$BASE_URL/api/agent/graphs/{graphId}/batch/nodes" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"node_ids": ["node-id-1", "node-id-2"]}'
```

## 边操作

### 批量创建边

```bash
curl -X POST "$BASE_URL/api/agent/graphs/{graphId}/batch/edges" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "edges": [
      {"source": "node-id-1", "target": "node-id-2", "label": "关系"},
      {"source": "node-id-2", "target": "node-id-3", "label": "属于"}
    ]
  }'
```

## 图算法

### 获取节点度统计

```bash
curl "$BASE_URL/api/agent/graphs/{graphId}/degrees" \
  -H "Authorization: Agent $API_KEY"
```

### 获取邻居节点

```bash
curl "$BASE_URL/api/agent/graphs/{graphId}/nodes/{nodeId}/neighbors?limit=50" \
  -H "Authorization: Agent $API_KEY"
```

### 路径查找

```bash
curl "$BASE_URL/api/agent/graphs/{graphId}/path?source={nodeId1}&target={nodeId2}&max_depth=10" \
  -H "Authorization: Agent $API_KEY"
```

## 版本管理

### 创建快照

```bash
curl -X POST "$BASE_URL/api/agent/graphs/{graphId}/snapshot" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "快照名称", "description": "描述"}'
```

### 获取版本列表

```bash
curl "$BASE_URL/api/agent/graphs/{graphId}/versions" \
  -H "Authorization: Agent $API_KEY"
```

### 回滚版本

```bash
curl -X POST "$BASE_URL/api/agent/graphs/{graphId}/rollback" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": 1}'
```

## Workspace

### 创建 Workspace

```bash
curl -X POST "$BASE_URL/api/agent/workspaces" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "workspace名称", "description": "描述"}'
```

### 获取 Workspace 列表

```bash
curl "$BASE_URL/api/agent/workspaces" \
  -H "Authorization: Agent $API_KEY"
```

## 完整示例脚本

```bash
#!/bin/bash

BASE_URL="http://localhost:13001"

# 1. 注册 Agent
echo "=== 注册 Agent ==="
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agent/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent"}')

API_KEY=$(echo $REGISTER_RESPONSE | jq -r '.agent.api_key')
echo "API Key: $API_KEY"

# 2. 创建图谱
echo "=== 创建图谱 ==="
GRAPH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agent/graphs" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "测试图谱"}')

GRAPH_ID=$(echo $GRAPH_RESPONSE | jq -r '.graph.id')
echo "Graph ID: $GRAPH_ID"

# 3. 批量创建节点
echo "=== 批量创建节点 ==="
NODES_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agent/graphs/$GRAPH_ID/batch/nodes" \
  -H "Authorization: Agent $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {"label": "张三", "type": "person"},
      {"label": "李四", "type": "person"},
      {"label": "公司", "type": "organization"}
    ]
  }')

echo "$NODES_RESPONSE" | jq '.'

# 4. 获取度统计
echo "=== 获取度统计 ==="
curl -s "$BASE_URL/api/agent/graphs/$GRAPH_ID/degrees" \
  -H "Authorization: Agent $API_KEY" | jq '.'

echo "=== 完成 ==="