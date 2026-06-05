-- Migration: 001_initial_schema
-- Description: 初始数据库结构
-- Created: 2026-04-27

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 用户 LLM 配置表
CREATE TABLE IF NOT EXISTS user_llm_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT DEFAULT 'openai',
  api_key TEXT DEFAULT '',
  base_url TEXT DEFAULT '',
  model_name TEXT DEFAULT 'gpt-4o',
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 图谱表
CREATE TABLE IF NOT EXISTS graphs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 0,
  settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 节点表
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

-- 变更历史记录表
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  old_data TEXT,
  new_data TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_nodes_graph_id ON nodes(graph_id);
CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_graph_id ON edges(graph_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
CREATE INDEX IF NOT EXISTS idx_history_graph_id ON history(graph_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_llm_configs_user_id ON user_llm_configs(user_id);
