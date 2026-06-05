-- Migration: 005_versions_and_logs
-- Description: 添加图谱版本表和 Agent API 日志表
-- Created: 2026-04-27

-- 图谱版本表
CREATE TABLE IF NOT EXISTS graph_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  snapshot TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_versions_graph_id ON graph_versions(graph_id);

-- Agent API 调用日志表
CREATE TABLE IF NOT EXISTS agent_api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time INTEGER NOT NULL,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  request_body TEXT DEFAULT '',
  graph_id TEXT DEFAULT '',
  graph_name TEXT DEFAULT '',
  operation_type TEXT DEFAULT '',
  nodes_affected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_api_logs_agent_id ON agent_api_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_logs_created_at ON agent_api_logs(created_at);
