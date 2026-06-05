-- Migration: 002_vec_index
-- Description: 添加向量索引支持
-- Created: 2026-04-27

-- 节点 Embedding 索引表
CREATE TABLE IF NOT EXISTS node_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  graph_id TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (graph_id) REFERENCES graphs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_node_embeddings_node_id ON node_embeddings(node_id);
CREATE INDEX IF NOT EXISTS idx_node_embeddings_graph_id ON node_embeddings(graph_id);
