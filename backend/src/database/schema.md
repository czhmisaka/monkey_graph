# Knowledge Graph Database Schema

SQLite 数据库，使用 [sqlite-vec](https://github.com/asg017/sqlite-vec) 扩展支持向量搜索。

## 表结构

### users - 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| username | TEXT | 用户名，唯一 |
| password | TEXT | bcrypt 哈希密码 |
| avatar | TEXT | 头像 URL |
| bio | TEXT | 用户简介 |
| is_admin | INTEGER | 是否管理员 (0/1) |
| created_at | TEXT | 创建时间 (ISO 8601) |
| updated_at | TEXT | 更新时间 (ISO 8601) |

### user_llm_configs - 用户 LLM 配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| user_id | TEXT | 关联用户 ID |
| provider | TEXT | LLM 提供商 (openai 等) |
| api_key | TEXT | 加密存储的 API Key |
| base_url | TEXT | API Base URL |
| model_name | TEXT | 模型名称 |
| is_active | INTEGER | 是否激活 (0/1) |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

**外键**: `user_id` -> `users(id)` ON DELETE CASCADE

### graphs - 图谱表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| user_id | TEXT | 所有者用户 ID (可为空，支持 Agent 创建的图谱) |
| name | TEXT | 图谱名称 |
| description | TEXT | 图谱描述 |
| is_active | INTEGER | 是否为当前活跃图谱 (0/1) |
| settings | TEXT | JSON 配置 (节点/边类型样式等) |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### nodes - 节点表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| graph_id | TEXT | 所属图谱 ID |
| label | TEXT | 节点标签/名称 |
| type | TEXT | 节点类型 (default/person/organization 等) |
| properties | TEXT | JSON 额外属性 |
| embedding | TEXT | 向量嵌入 (JSON 格式 Float32Array) |
| x | REAL | X 坐标 |
| y | REAL | Y 坐标 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

**外键**: `graph_id` -> `graphs(id)` ON DELETE CASCADE

### edges - 边表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| graph_id | TEXT | 所属图谱 ID |
| source | TEXT | 源节点 ID |
| target | TEXT | 目标节点 ID |
| label | TEXT | 边标签 |
| type | TEXT | 边类型 (default/related 等) |
| properties | TEXT | JSON 额外属性 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

**外键**: `graph_id` -> `graphs(id)` ON DELETE CASCADE
**外键**: `source` -> `nodes(id)` ON DELETE CASCADE
**外键**: `target` -> `nodes(id)` ON DELETE CASCADE

### history - 变更历史记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增主键 |
| graph_id | TEXT | 图谱 ID |
| operation_type | TEXT | 操作类型 (create/update/delete) |
| target_type | TEXT | 目标类型 (node/edge) |
| target_id | TEXT | 目标 ID |
| old_data | TEXT | 修改前的数据 (JSON) |
| new_data | TEXT | 修改后的数据 (JSON) |
| timestamp | TEXT | 操作时间 |

**外键**: `graph_id` -> `graphs(id)` ON DELETE CASCADE

### agents - Agent 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| name | TEXT | Agent 名称 |
| description | TEXT | Agent 描述 |
| api_key | TEXT | API Key (唯一) |
| user_id | TEXT | 创建者用户 ID |
| workspace_id | TEXT | 工作空间 ID |
| tenant_id | TEXT | 租户 ID |
| permissions | TEXT | JSON 权限配置 |
| rate_limit | INTEGER | 速率限制 (请求/分钟) |
| monthly_quota | INTEGER | 月度配额 |
| requests_used | INTEGER | 已使用请求数 |
| is_active | INTEGER | 是否激活 (0/1) |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### graph_agent_permissions - 图谱 Agent 授权表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| graph_id | TEXT | 图谱 ID |
| agent_id | TEXT | Agent ID |
| permission | TEXT | 权限级别 (read/write) |
| created_by | TEXT | 授权创建者用户 ID |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

**外键**: `graph_id` -> `graphs(id)` ON DELETE CASCADE
**外键**: `agent_id` -> `agents(id)` ON DELETE CASCADE
**唯一索引**: `(graph_id, agent_id)`

### user_agents - 用户关联 Agent 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| user_id | TEXT | 用户 ID |
| agent_id | TEXT | Agent ID |
| role | TEXT | 角色 (member/admin) |
| created_at | TEXT | 创建时间 |

**外键**: `user_id` -> `users(id)` ON DELETE CASCADE
**外键**: `agent_id` -> `agents(id)` ON DELETE CASCADE
**唯一索引**: `(user_id, agent_id)`

### workspaces - 工作空间表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| name | TEXT | 工作空间名称 |
| description | TEXT | 描述 |
| owner_type | TEXT | 所有者类型 (user/agent) |
| owner_id | TEXT | 所有者 ID |
| agent_id | TEXT | 关联 Agent ID |
| settings | TEXT | JSON 配置 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### graph_shares - 图谱分享表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| graph_id | TEXT | 图谱 ID |
| share_token | TEXT | 分享 Token (唯一) |
| allow_edit | INTEGER | 是否允许编辑 (0/1) |
| created_at | TEXT | 创建时间 |
| expires_at | TEXT | 过期时间 (可为空) |

**外键**: `graph_id` -> `graphs(id)` ON DELETE CASCADE

### graph_versions - 图谱版本表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增主键 |
| graph_id | TEXT | 图谱 ID |
| version | INTEGER | 版本号 |
| name | TEXT | 版本名称 |
| description | TEXT | 版本描述 |
| snapshot | TEXT | 完整快照 (JSON) |
| created_at | TEXT | 创建时间 |

**外键**: `graph_id` -> `graphs(id)` ON DELETE CASCADE

### agent_api_logs - Agent API 调用日志表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增主键 |
| agent_id | TEXT | Agent ID |
| method | TEXT | HTTP 方法 |
| path | TEXT | 请求路径 |
| status_code | INTEGER | 响应状态码 |
| response_time | INTEGER | 响应时间 (ms) |
| ip | TEXT | 客户端 IP |
| user_agent | TEXT | User Agent |
| request_body | TEXT | 请求体 |
| graph_id | TEXT | 关联图谱 ID |
| graph_name | TEXT | 图谱名称 |
| operation_type | TEXT | 操作类型 |
| nodes_affected | INTEGER | 受影响节点数 |
| created_at | TEXT | 创建时间 |

**外键**: `agent_id` -> `agents(id)` ON DELETE CASCADE

### vec_nodes - sqlite-vec 向量索引表 (虚拟表)

| 字段 | 类型 | 说明 |
|------|------|------|
| node_id | TEXT | 节点 ID |
| graph_id | TEXT | 图谱 ID |
| embedding | FLOAT[1536] | 1536 维向量 |

## 索引

### nodes 表
- `idx_nodes_graph_id` ON `graph_id`
- `idx_nodes_label` ON `label`
- `idx_nodes_type` ON `type`

### edges 表
- `idx_edges_graph_id` ON `graph_id`
- `idx_edges_source` ON `source`
- `idx_edges_target` ON `target`

### history 表
- `idx_history_graph_id` ON `graph_id`
- `idx_history_timestamp` ON `timestamp`

### 其他索引
- `idx_user_llm_configs_user_id` ON `user_llm_configs(user_id)`
- `idx_graph_shares_token` ON `graph_shares(share_token)`
- `idx_graph_agent_permissions_graph_id` ON `graph_agent_permissions(graph_id)`
- `idx_graph_agent_permissions_agent_id` ON `graph_agent_permissions(agent_id)`
- `idx_agents_api_key` ON `agents(api_key)`
- `idx_agents_workspace` ON `agents(workspace_id)`
- `idx_agents_tenant` ON `agents(tenant_id)`
- `idx_agents_user_id` ON `agents(user_id)`
- `idx_user_agents_user_id` ON `user_agents(user_id)`
- `idx_user_agents_agent_id` ON `user_agents(agent_id)`
- `idx_workspaces_owner` ON `workspaces(owner_type, owner_id)`
- `idx_graph_versions_graph_id` ON `graph_versions(graph_id)`
- `idx_agent_api_logs_agent_id` ON `agent_api_logs(agent_id)`
- `idx_agent_api_logs_created_at` ON `agent_api_logs(created_at)`
