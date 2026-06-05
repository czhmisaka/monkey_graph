# Database Migrations

## 目录结构

```
migrations/
├── 001_initial_schema.sql      # 基础表结构 (users, graphs, nodes, edges, history)
├── 002_vec_index.sql           # 向量索引支持 (node_embeddings)
├── 003_agents.sql              # Agent 相关表 (agents, graph_agent_permissions, user_agents)
├── 004_workspaces_and_shares.sql # 工作空间和分享 (workspaces, graph_shares)
├── 005_versions_and_logs.sql   # 版本和日志 (graph_versions, agent_api_logs)
├── migrator.js                 # 迁移执行脚本
└── README.md                   # 本文档
```

## 使用方法

### 运行所有待执行迁移

```bash
node migrations/migrator.js
```

### 查看迁移状态

```bash
node migrations/migrator.js --status
```

### 回滚最后一个迁移

```bash
node migrations/migrator.js --rollback
```

### 重置数据库（清空所有表并重新运行迁移）

```bash
node migrations/migrator.js --fresh
```

### 指定数据库路径

```bash
DB_PATH=./data/test.db node migrations/migrator.js
```

## 添加新的迁移

1. 在 `migrations/` 目录创建新的 SQL 文件，命名格式: `NNN_description.sql`
2. 文件名使用序号（如 `006_xxx.sql`）确保执行顺序
3. 每个迁移文件应包含:
   - 迁移编号和描述的注释
   - `CREATE TABLE IF NOT EXISTS` 或 `ALTER TABLE` 语句
   - 索引创建语句

## 迁移规范

- 始终使用 `IF NOT EXISTS` 防止重复创建
- 迁移应该是幂等的（可以安全地多次运行）
- 使用 `ON DELETE CASCADE` 管理外键关系
- 新增字段使用 `DEFAULT` 提供默认值以兼容现有数据

## schema.md

数据库表结构文档位于: `backend/src/database/schema.md`
