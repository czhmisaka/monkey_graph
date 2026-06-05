-- Migration: 004_workspaces_and_shares
-- Description: 添加工作空间和图谱分享表
-- Created: 2026-04-27

-- Workspace 表
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_type TEXT DEFAULT 'user',
  owner_id TEXT,
  agent_id TEXT,
  settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_type, owner_id);

-- 图谱分享表
CREATE TABLE IF NOT EXISTS graph_shares (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  share_token TEXT UNIQUE NOT NULL,
  allow_edit INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_shares_token ON graph_shares(share_token);
