-- Migration: 003_agents
-- Description: 添加 Agent 相关表
-- Created: 2026-04-27

-- Agent 表
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  api_key TEXT UNIQUE NOT NULL,
  user_id TEXT,
  workspace_id TEXT,
  tenant_id TEXT,
  permissions TEXT DEFAULT '{"graphs":["read","write"],"nodes":["read","write","delete"],"edges":["read","write","delete"]}',
  rate_limit INTEGER DEFAULT 1000,
  monthly_quota INTEGER DEFAULT 100000,
  requests_used INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 图谱授权表
CREATE TABLE IF NOT EXISTS graph_agent_permissions (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  permission TEXT DEFAULT 'read',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(graph_id, agent_id)
);

-- 用户关联 Agent 表
CREATE TABLE IF NOT EXISTS user_agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_agent_permissions_graph_id ON graph_agent_permissions(graph_id);
CREATE INDEX IF NOT EXISTS idx_graph_agent_permissions_agent_id ON graph_agent_permissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agents_user_id ON user_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agents_agent_id ON user_agents(agent_id);
