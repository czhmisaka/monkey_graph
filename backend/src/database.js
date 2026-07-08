// 优先加载环境变量（在其他模块之前）
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

import Database from 'better-sqlite3';
import crypto from 'crypto';
import * as vec from 'sqlite-vec';
import { EMBEDDING_CONFIG } from './services/embeddingService.js';
import { safeJsonParse } from './utils/safeParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'knowledge-graph.db');

// 获取向量维度配置（来自 embeddingService 的配置）
const VECTOR_DIMENSIONS = EMBEDDING_CONFIG.dimensions;
console.log(`[Database] 使用向量维度: ${VECTOR_DIMENSIONS}`);

// 加密配置 - 必须通过环境变量配置
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error('❌ 错误: ENCRYPTION_KEY 环境变量未设置。请在 .env 文件中配置 ENCRYPTION_KEY');
}

// 解析密钥：支持 hex 64 字符（推荐）或短字符串（前 32 字节填充）。
// 优先按 hex 解析；解析失败则回退到兼容旧实现的字符串截断方式（仅在迁移期）。
function resolveEncryptionKey(rawKey) {
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex').subarray(0, 32);
  }
  // 兼容旧实现：截取前 32 字符，padEnd 32 字节
  return Buffer.from(rawKey.slice(0, 32).padEnd(32, '0').slice(0, 32), 'utf8');
}
const KEY_BUF = resolveEncryptionKey(ENCRYPTION_KEY);

// 加密格式版本标识：用于检测旧 CBC 密文并自动迁移
const GCM_AAD = Buffer.from('user_llm_config');
const IV_LENGTH_GCM = 12; // GCM 推荐 12 字节

/**
 * 转义 SQL LIKE 模式中的特殊字符
 * 防止用户输入 % 或 _ 导致意外匹配
 * @param {string} str - 要转义的字符串
 * @returns {string} - 转义后的字符串
 */
const escapeLikePattern = (str) => {
  if (!str) return '';
  return str.replace(/[%_\\]/g, '\\$&');
};

// 加密 API Key（AES-256-GCM 认证加密）
// 输出格式：gcm1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
// 旧 CBC 格式为：<iv-hex>:<ciphertext-hex>（2 段）—— 通过前缀自动识别
function encryptAPIKey(text) {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(IV_LENGTH_GCM);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUF, iv);
    cipher.setAAD(GCM_AAD);
    const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
  } catch (error) {
    console.error('加密失败:', error);
    return text;
  }
}

// 解密 API Key。支持自动迁移旧 CBC 密文（一次性就地重加密）。
// 返回 null 表示认证失败 / 密文损坏。
function decryptAPIKey(text) {
  if (!text) return '';
  if (!text.startsWith('gcm1:')) {
    // 旧 CBC 格式：尝试解密并就地迁移
    try {
      const parts = text.split(':');
      if (parts.length !== 2) {
        console.warn('[decryptAPIKey] 非 GCM 格式且非 CBC 格式 (parts !== 2)');
        return null;
      }
      const iv = Buffer.from(parts[0], 'hex');
      const ctBuf = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY_BUF, iv);
      const plain = Buffer.concat([decipher.update(ctBuf), decipher.final()]).toString('utf8');
      // 就地升级为 GCM 格式（基于调用栈外层做 UPDATE）
      console.warn(`[decryptAPIKey] 检测到旧 CBC 密文,迁移至 GCM`);
      return { __migrate: plain };
    } catch (error) {
      console.error('[decryptAPIKey] 旧 CBC 解密失败:', error.message);
      return null;
    }
  }
  try {
    const parts = text.split(':');
    if (parts.length !== 4) {
      console.warn('[decryptAPIKey] GCM 格式错误 (parts !== 4)');
      return null;
    }
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ctBuf = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUF, iv);
    decipher.setAAD(GCM_AAD);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ctBuf), decipher.final()]).toString('utf8');
    return plain;
  } catch (error) {
    console.error('[decryptAPIKey] GCM 解密失败 (可能被篡改):', error.message);
    return null;
  }
}

// 提供给调用方在 UPDATE 后调用,完成旧密文迁移
function reencryptAPIKey(text) {
  return encryptAPIKey(text);
}

// 确保 data 目录存在
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// 加载 sqlite-vec 扩展
try {
  db.loadExtension(vec.getLoadablePath());
  console.log('✅ sqlite-vec 扩展已加载');
  
  // 测试扩展是否加载成功
  const version = db.prepare('SELECT vec_version() as v').get();
  console.log('   版本:', version?.v);
} catch (error) {
  console.error('加载 sqlite-vec 扩展失败:', error.message);
}

// 启用 WAL 模式优化性能
db.pragma('journal_mode = WAL');

import bcrypt from 'bcryptjs';

// 初始化 sqlite-vec 向量索引表（使用动态维度）
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(
      node_id TEXT NOT NULL,
      graph_id TEXT NOT NULL,
      embedding FLOAT[${VECTOR_DIMENSIONS}]
    );
  `);
  console.log(`✅ sqlite-vec 向量索引表已创建，维度: ${VECTOR_DIMENSIONS}`);
  
  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vec_nodes_graph_id ON vec_nodes(graph_id);`);
} catch (error) {
  console.error('创建向量索引表失败:', error.message);
}

// 初始化数据库表
db.exec(`
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
  
  CREATE INDEX IF NOT EXISTS idx_user_llm_configs_user_id ON user_llm_configs(user_id);
  CREATE INDEX IF NOT EXISTS idx_graph_shares_token ON graph_shares(share_token);

  -- 图谱表（user_id 可以为空，支持 Agent 创建的图谱）
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
  
  -- 节点 Embedding 索引表（用于加速相似度搜索）
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

  -- 创建索引以优化查询性能
  CREATE INDEX IF NOT EXISTS idx_nodes_graph_id ON nodes(graph_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);
  CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
  CREATE INDEX IF NOT EXISTS idx_edges_graph_id ON edges(graph_id);
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
  CREATE INDEX IF NOT EXISTS idx_history_graph_id ON history(graph_id);
  CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);

  -- Agent 表（用于 API 认证）
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

  -- 图谱授权表（用于管理 Agent 对图谱的访问权限）
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
  
  CREATE INDEX IF NOT EXISTS idx_graph_agent_permissions_graph_id ON graph_agent_permissions(graph_id);
  CREATE INDEX IF NOT EXISTS idx_graph_agent_permissions_agent_id ON graph_agent_permissions(agent_id);
  
  CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
  CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);

  -- 用户关联的 Agent 表
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
  
  CREATE INDEX IF NOT EXISTS idx_user_agents_user_id ON user_agents(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_agents_agent_id ON user_agents(agent_id);

  -- Workspace 表（命名空间）
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
`);

export default db;

// 获取当前活跃图谱ID
const getActiveGraphId = () => {
  const active = db.prepare('SELECT id FROM graphs WHERE is_active = 1').get();
  return active ? active.id : null;
};

// 设置活跃图谱
const setActiveGraph = (graphId) => {
  db.prepare('UPDATE graphs SET is_active = 0').run();
  if (graphId) {
    db.prepare('UPDATE graphs SET is_active = 1 WHERE id = ?').run(graphId);
  }
};

// 获取默认图谱配置
const getDefaultSettings = () => {
  return {
    nodeTypes: {
      person: { color: '#4A90D9', shape: 'rect' },
      organization: { color: '#50C878', shape: 'rect' },
      concept: { color: '#9B59B6', shape: 'rect' },
      location: { color: '#F39C12', shape: 'rect' },
      event: { color: '#E74C3C', shape: 'rect' },
      default: { color: '#95A5A6', shape: 'rect' }
    },
    edgeTypes: {
      default: { color: '#999', style: 'dashed' },
      related: { color: '#666', style: 'solid' }
    }
  };
};

// 用户操作
export const userOperations = {
  // 创建用户
  async create(user) {
    const id = crypto.randomUUID();
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(user.password, rounds);
    const stmt = db.prepare(`
      INSERT INTO users (id, username, password)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, user.username, hashedPassword);
    return { id, username: user.username };
  },

  // 根据用户名查找用户
  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  // 根据 ID 查找用户
  findById(id) {
    return db.prepare('SELECT id, username, avatar, bio, is_admin, created_at, updated_at FROM users WHERE id = ?').get(id);
  },

  // 验证密码 (异步,避免阻塞事件循环)
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  },

  // 获取用户列表（仅管理员使用）
  getAll() {
    return db.prepare('SELECT id, username, created_at, updated_at FROM users').all();
  },

  // 更新用户资料
  updateProfile(userId, data) {
    const updates = [];
    const params = { userId };
    
    if (data.avatar !== undefined) {
      updates.push('avatar = @avatar');
      params.avatar = data.avatar;
    }
    if (data.bio !== undefined) {
      updates.push('bio = @bio');
      params.bio = data.bio;
    }
    if (data.username !== undefined) {
      updates.push('username = @username');
      params.username = data.username;
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = @userId`);
      stmt.run(params);
    }

    return userOperations.findById(userId);
  }
};

// 用户关联 Agent 操作
export const userAgentOperations = {
  // 关联 Agent 到用户
  create(userAgent) {
    const id = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO user_agents (id, user_id, agent_id, role)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, userAgent.user_id, userAgent.agent_id, userAgent.role || 'member');
    return userAgentOperations.getById(id);
  },

  // 根据 ID 获取关联
  getById(id) {
    return db.prepare('SELECT * FROM user_agents WHERE id = ?').get(id);
  },

  // 获取用户关联的所有 Agent
  getByUserId(userId) {
    const userAgents = db.prepare(`
      SELECT ua.*, a.name, a.description, a.is_active, a.rate_limit, a.monthly_quota, a.requests_used
      FROM user_agents ua
      JOIN agents a ON ua.agent_id = a.id
      WHERE ua.user_id = ?
      ORDER BY ua.created_at DESC
    `).all(userId);
    return userAgents;
  },

  // 获取用户关联的 Agent 列表（包含 API Key）
  getByUserIdWithKey(userId) {
    const userAgents = db.prepare(`
      SELECT ua.*, a.name, a.description, a.api_key, a.is_active, a.rate_limit, a.monthly_quota, a.requests_used
      FROM user_agents ua
      JOIN agents a ON ua.agent_id = a.id
      WHERE ua.user_id = ?
      ORDER BY ua.created_at DESC
    `).all(userId);
    return userAgents;
  },

  // 获取 Agent 关联的用户
  getByAgentId(agentId) {
    return db.prepare('SELECT * FROM user_agents WHERE agent_id = ?').all(agentId);
  },

  // 检查用户是否关联了某个 Agent
  exists(userId, agentId) {
    const result = db.prepare('SELECT id FROM user_agents WHERE user_id = ? AND agent_id = ?').get(userId, agentId);
    return !!result;
  },

  // 更新关联角色
  updateRole(id, role) {
    db.prepare('UPDATE user_agents SET role = ? WHERE id = ?').run(role, id);
    return userAgentOperations.getById(id);
  },

  // 取消关联
  delete(id) {
    const userAgent = userAgentOperations.getById(id);
    if (!userAgent) return null;
    db.prepare('DELETE FROM user_agents WHERE id = ?').run(id);
    return userAgent;
  },

  // 取消用户和 Agent 的关联
  deleteByUserAndAgent(userId, agentId) {
    const userAgent = db.prepare('SELECT * FROM user_agents WHERE user_id = ? AND agent_id = ?').get(userId, agentId);
    if (!userAgent) return null;
    db.prepare('DELETE FROM user_agents WHERE user_id = ? AND agent_id = ?').run(userId, agentId);
    return userAgent;
  }
};

// 用户 LLM 配置操作（API Key 加密存储）
export const userLLMConfigOperations = {
  // 获取用户的 LLM 配置（不返回加密的 api_key）
  getByUserId(userId) {
    const configs = db.prepare('SELECT * FROM user_llm_configs WHERE user_id = ?').all(userId);
    return configs.map(c => ({ ...c, api_key: c.api_key ? '••••••••' : '' }));
  },

  // 获取用户当前激活的 LLM 配置
  getActiveByUserId(userId) {
    return db.prepare('SELECT * FROM user_llm_configs WHERE user_id = ? AND is_active = 1').get(userId);
  },

  // 获取解密后的 API Key（内部使用）
  // 如果遇到旧 CBC 密文,自动就地迁移至 GCM 格式
  getDecryptedApiKey(id) {
    const config = db.prepare('SELECT id, api_key FROM user_llm_configs WHERE id = ?').get(id);
    if (!config) return '';
    const result = decryptAPIKey(config.api_key);
    if (result === null) return '';
    if (typeof result === 'object' && result.__migrate) {
      // 旧 CBC 格式,就地升级为 GCM
      try {
        const newBlob = reencryptAPIKey(result.__migrate);
        db.prepare('UPDATE user_llm_configs SET api_key = ? WHERE id = ?').run(newBlob, config.id);
        console.log(`[getDecryptedApiKey] id=${config.id} 已从 CBC 迁移至 GCM`);
        return result.__migrate;
      } catch (e) {
        console.error(`[getDecryptedApiKey] 迁移失败 id=${config.id}:`, e.message);
        return result.__migrate;
      }
    }
    return result;
  },

  // 创建 LLM 配置（加密存储 API Key）
  create(config) {
    const id = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO user_llm_configs (id, user_id, provider, api_key, base_url, model_name, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      config.user_id,
      config.provider || 'openai',
      encryptAPIKey(config.api_key || ''),
      config.base_url || '',
      config.model_name || 'gpt-4o',
      config.is_active ? 1 : 0
    );
    return userLLMConfigOperations.getById(id);
  },

  // 根据 ID 获取配置
  getById(id) {
    const config = db.prepare('SELECT * FROM user_llm_configs WHERE id = ?').get(id);
    if (config) {
      config.api_key = config.api_key ? '••••••••' : '';
    }
    return config;
  },

  // 更新 LLM 配置
  update(id, data) {
    const oldConfig = userLLMConfigOperations.getById(id);
    if (!oldConfig) return null;

    const updates = [];
    const params = { id };
    
    if (data.provider !== undefined) {
      updates.push('provider = @provider');
      params.provider = data.provider;
    }
    if (data.api_key !== undefined) {
      updates.push('api_key = @api_key');
      params.api_key = encryptAPIKey(data.api_key);
    }
    if (data.base_url !== undefined) {
      updates.push('base_url = @base_url');
      params.base_url = data.base_url;
    }
    if (data.model_name !== undefined) {
      updates.push('model_name = @model_name');
      params.model_name = data.model_name;
    }
    if (data.is_active !== undefined) {
      // 如果激活此配置，先停用其他配置
      if (data.is_active) {
        db.prepare('UPDATE user_llm_configs SET is_active = 0 WHERE user_id = (SELECT user_id FROM user_llm_configs WHERE id = ?)').run(id);
      }
      updates.push('is_active = @is_active');
      params.is_active = data.is_active ? 1 : 0;
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE user_llm_configs SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return userLLMConfigOperations.getById(id);
  },

  // 删除 LLM 配置
  delete(id) {
    const oldConfig = userLLMConfigOperations.getById(id);
    if (!oldConfig) return null;
    db.prepare('DELETE FROM user_llm_configs WHERE id = ?').run(id);
    return oldConfig;
  }
};

// 图谱分享操作
export const graphShareOperations = {
  // 生成分享链接
  createShare(graphId, allowEdit = false, expiresAt = null) {
    const id = crypto.randomUUID();
    const shareToken = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO graph_shares (id, graph_id, share_token, allow_edit, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, graphId, shareToken, allowEdit ? 1 : 0, expiresAt);
    return graphShareOperations.getByToken(shareToken);
  },

  // 通过 token 获取分享
  getByToken(shareToken) {
    const share = db.prepare(`
      SELECT gs.*, g.name as graph_name, g.user_id as owner_user_id
      FROM graph_shares gs
      JOIN graphs g ON gs.graph_id = g.id
      WHERE gs.share_token = ?
    `).get(shareToken);
    
    if (!share) return null;
    
    // 检查是否过期
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return null;
    }
    
    return share;
  },

  // 获取图谱的所有分享
  getByGraphId(graphId) {
    return db.prepare('SELECT * FROM graph_shares WHERE graph_id = ?').all(graphId);
  },

  // 取消分享
  delete(id) {
    db.prepare('DELETE FROM graph_shares WHERE id = ?').run(id);
  },

  // 通过 token 删除分享
  deleteByToken(shareToken) {
    db.prepare('DELETE FROM graph_shares WHERE share_token = ?').run(shareToken);
  }
};

// 图谱操作（增加 user_id 支持）
export const graphOperations = {
  // 获取指定用户的所有图谱
  getByUserId(userId) {
    return db.prepare('SELECT * FROM graphs WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  },

  getAll() {
    return db.prepare('SELECT * FROM graphs ORDER BY updated_at DESC').all();
  },

  getActive() {
    return db.prepare('SELECT * FROM graphs WHERE is_active = 1').get();
  },

  getById(id) {
    return db.prepare('SELECT * FROM graphs WHERE id = ?').get(id);
  },

  // 验证图谱是否属于指定用户
  getByIdAndUserId(id, userId) {
    return db.prepare('SELECT * FROM graphs WHERE id = ? AND user_id = ?').get(id, userId);
  },

  // 获取图谱配置
  getSettings(id) {
    const graph = db.prepare('SELECT settings FROM graphs WHERE id = ?').get(id);
    if (!graph) return null;
    try {
      return JSON.parse(graph.settings || '{}');
    } catch {
      return {};
    }
  },

  // 更新图谱配置
  updateSettings(id, settings) {
    const graph = graphOperations.getById(id);
    if (!graph) return null;
    
    // 合并现有配置和新配置
    const currentSettings = graphOperations.getSettings(id) || {};
    const mergedSettings = { ...currentSettings, ...settings };
    
    db.prepare('UPDATE graphs SET settings = ? WHERE id = ?').run(
      JSON.stringify(mergedSettings),
      id
    );
    
    return mergedSettings;
  },

  // 创建图谱（需要 user_id）
  create(graph) {
    const id = graph.id || crypto.randomUUID();
    const defaultSettings = getDefaultSettings();
    const stmt = db.prepare(`
      INSERT INTO graphs (id, user_id, name, description, settings)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      graph.user_id,
      graph.name,
      graph.description || '',
      JSON.stringify(defaultSettings)
    );
    return graphOperations.getById(id);
  },

  update(id, data) {
    const oldGraph = graphOperations.getById(id);
    if (!oldGraph) return null;

    const updates = [];
    const params = { id };
    
    if (data.name !== undefined) {
      updates.push('name = @name');
      params.name = data.name;
    }
    if (data.description !== undefined) {
      updates.push('description = @description');
      params.description = data.description;
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE graphs SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return graphOperations.getById(id);
  },

  delete(id) {
    const oldGraph = graphOperations.getById(id);
    if (!oldGraph) return null;
    
    // 删除关联的节点和边
    db.prepare('DELETE FROM nodes WHERE graph_id = ?').run(id);
    db.prepare('DELETE FROM edges WHERE graph_id = ?').run(id);
    db.prepare('DELETE FROM history WHERE graph_id = ?').run(id);
    db.prepare('DELETE FROM graphs WHERE id = ?').run(id);
    
    return oldGraph;
  },

  setActive(id) {
    const graph = graphOperations.getById(id);
    if (!graph) return null;
    setActiveGraph(id);
    return graphOperations.getById(id);
  },

  // 复制图谱
  duplicate(id, newName, userId) {
    const sourceGraph = graphOperations.getById(id);
    if (!sourceGraph) return null;
    
    // 验证权限
    if (sourceGraph.user_id !== userId) {
      return null;
    }
    
    const newId = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO graphs (id, user_id, name, description)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(newId, userId, newName || `${sourceGraph.name} (副本)`, sourceGraph.description);
    
    // 复制节点
    const nodes = db.prepare('SELECT * FROM nodes WHERE graph_id = ?').all(id);
    const nodeIdMap = new Map();
    for (const node of nodes) {
      const newNodeId = crypto.randomUUID();
      nodeIdMap.set(node.id, newNodeId);
      db.prepare(`
        INSERT INTO nodes (id, graph_id, label, type, properties, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newNodeId, newId, node.label, node.type, node.properties, node.x, node.y);
    }
    
    // 复制边
    const edges = db.prepare('SELECT * FROM edges WHERE graph_id = ?').all(id);
    for (const edge of edges) {
      db.prepare(`
        INSERT INTO edges (id, graph_id, source, target, label, type, properties)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), newId, nodeIdMap.get(edge.source), nodeIdMap.get(edge.target), edge.label, edge.type, edge.properties);
    }
    
    return graphOperations.getById(newId);
  }
};

// 节点操作
export const nodeOperations = {
  getAll() {
    const graphId = getActiveGraphId();
    if (!graphId) return [];
    return db.prepare('SELECT * FROM nodes WHERE graph_id = ? ORDER BY created_at DESC').all(graphId);
  },

  getByGraphId(graphId) {
    return db.prepare('SELECT * FROM nodes WHERE graph_id = ? ORDER BY created_at DESC').all(graphId);
  },

  // 批量更新节点位置
  updatePositions(graphId, positions) {
    const stmt = db.prepare(`
      UPDATE nodes 
      SET x = @x, y = @y, updated_at = datetime('now')
      WHERE graph_id = @graphId AND id = @id
    `);
    
    const updateMany = db.transaction((nodes) => {
      for (const node of nodes) {
        stmt.run({ graphId, id: node.id, x: node.x, y: node.y });
      }
    });
    
    updateMany(positions);
    return true;
  },

  getById(id) {
    return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  },

  create(node) {
    const graphId = getActiveGraphId();
    if (!graphId) throw new Error('没有活跃的图谱');
    
    const stmt = db.prepare(`
      INSERT INTO nodes (id, graph_id, label, type, properties, x, y)
      VALUES (@id, @graphId, @label, @type, @properties, @x, @y)
    `);
    stmt.run({
      id: node.id,
      graphId,
      label: node.label,
      type: node.type || 'default',
      properties: JSON.stringify(node.properties || {}),
      x: node.x || Math.random() * 800,
      y: node.y || Math.random() * 600
    });
    return nodeOperations.getById(node.id);
  },

  createForGraph(node, graphId) {
    const stmt = db.prepare(`
      INSERT INTO nodes (id, graph_id, label, type, properties, x, y)
      VALUES (@id, @graphId, @label, @type, @properties, @x, @y)
    `);
    stmt.run({
      id: node.id,
      graphId,
      label: node.label,
      type: node.type || 'default',
      properties: JSON.stringify(node.properties || {}),
      x: node.x || Math.random() * 800,
      y: node.y || Math.random() * 600
    });
    return nodeOperations.getById(node.id);
  },

  update(id, data) {
    const oldNode = nodeOperations.getById(id);
    if (!oldNode) return null;

    const updates = [];
    const params = { id };
    
    if (data.label !== undefined) {
      updates.push('label = @label');
      params.label = data.label;
    }
    if (data.type !== undefined) {
      updates.push('type = @type');
      params.type = data.type;
    }
    if (data.properties !== undefined) {
      updates.push('properties = @properties');
      params.properties = JSON.stringify(data.properties);
    }
    if (data.x !== undefined) {
      updates.push('x = @x');
      params.x = data.x;
    }
    if (data.y !== undefined) {
      updates.push('y = @y');
      params.y = data.y;
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE nodes SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return nodeOperations.getById(id);
  },

  delete(id) {
    const oldNode = nodeOperations.getById(id);
    if (!oldNode) return null;
    
    // 删除关联的边
    db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(id, id);
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    
    return oldNode;
  },

  search(keyword) {
    const graphId = getActiveGraphId();
    if (!graphId) return [];
    // 转义 SQL LIKE 特殊字符，防止注入攻击
    const safeKeyword = escapeLikePattern(keyword);
    return db.prepare(`
      SELECT * FROM nodes 
      WHERE graph_id = ? AND (label LIKE ? OR type LIKE ?)
    `).all(graphId, `%${safeKeyword}%`, `%${safeKeyword}%`);
  },

  // 按图谱ID搜索节点
  searchByGraphId(graphId, keyword) {
    // 转义 SQL LIKE 特殊字符，防止注入攻击
    const safeKeyword = escapeLikePattern(keyword);
    return db.prepare(`
      SELECT * FROM nodes 
      WHERE graph_id = ? AND (label LIKE ? OR type LIKE ?)
    `).all(graphId, `%${safeKeyword}%`, `%${safeKeyword}%`);
  },

  // 更新节点的 embedding
  updateEmbedding(nodeId, embedding) {
    const stmt = db.prepare(`
      UPDATE nodes SET embedding = ?, updated_at = datetime('now') WHERE id = ?
    `);
    return stmt.run(JSON.stringify(embedding), nodeId);
  },

  // 获取有 embedding 的节点
  getNodesWithEmbedding(graphId) {
    return db.prepare(`
      SELECT * FROM nodes 
      WHERE graph_id = ? AND embedding IS NOT NULL AND embedding != ''
    `).all(graphId);
  },

  // 获取单个节点的 embedding
  getNodeEmbedding(nodeId) {
    const node = db.prepare('SELECT embedding FROM nodes WHERE id = ?').get(nodeId);
    if (node && node.embedding) {
      try {
        return JSON.parse(node.embedding);
      } catch {
        return null;
      }
    }
    return null;
  },

  // 批量更新 embedding（事务）
  batchUpdateEmbeddings(graphId, nodeEmbeddings) {
    const updateStmt = db.prepare(`
      UPDATE nodes SET embedding = ?, updated_at = datetime('now') WHERE id = ?
    `);
    
    const updateMany = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(JSON.stringify(item.embedding), item.id);
      }
    });
    
    updateMany(nodeEmbeddings);
    return true;
  },

  // 删除图谱的所有 embedding
  deleteEmbeddingsByGraphId(graphId) {
    const stmt = db.prepare(`UPDATE nodes SET embedding = NULL WHERE graph_id = ?`);
    return stmt.run(graphId);
  }
};

// 向量搜索操作（使用 sqlite-vec）
export const vecSearchOperations = {
  // 初始化向量索引（使用指定维度）
  initializeIndex(dimensions = 1536) {
    try {
      // 检查表是否存在
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='vec_nodes'
      `).get();
      
      if (!tables) {
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(
            node_id TEXT NOT NULL,
            graph_id TEXT NOT NULL,
            embedding FLOAT[${dimensions}]
          );
        `);
        console.log(`✅ sqlite-vec 向量索引表已创建，维度: ${dimensions}`);
      }
      return true;
    } catch (error) {
      console.error('初始化向量索引失败:', error);
      return false;
    }
  },

  // 重新初始化向量索引（用于维度不匹配时）
  reinitializeIndex(dimensions = 1536) {
    try {
      // 删除旧表
      db.exec(`DROP TABLE IF EXISTS vec_nodes;`);
      console.log('已删除旧的向量索引表');
      
      // 重新创建
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(
          node_id TEXT NOT NULL,
          graph_id TEXT NOT NULL,
          embedding FLOAT[${dimensions}]
        );
      `);
      console.log(`✅ sqlite-vec 向量索引表已重新创建，维度: ${dimensions}`);
      return true;
    } catch (error) {
      console.error('重新初始化向量索引失败:', error);
      return false;
    }
  },

  // 将节点 embedding 添加到向量索引
  addToIndex(nodeId, graphId, embedding) {
    try {
      // 使用 INSERT OR REPLACE 进行 upsert
      // 将 embedding 转换为 Float32Array
      const embeddingArray = new Float32Array(embedding);

      db.prepare(`
        INSERT OR REPLACE INTO vec_nodes (node_id, graph_id, embedding)
        VALUES (?, ?, ?)
      `).run(nodeId, graphId, embeddingArray.buffer);

      return true;
    } catch (error) {
      console.error('添加向量到索引失败:', error);
      return false;
    }
  },

  // 更新向量索引（与 addToIndex 相同，使用 INSERT OR REPLACE 实现 upsert）
  updateInIndex(nodeId, graphId, embedding) {
    return this.addToIndex(nodeId, graphId, embedding);
  },

  // 批量添加到向量索引
  batchAddToIndex(graphId, items) {
    try {
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO vec_nodes (node_id, graph_id, embedding)
        VALUES (?, ?, ?)
      `);
      
      const insertMany = db.transaction((nodes) => {
        for (const node of nodes) {
          const embeddingArray = new Float32Array(node.embedding);
          insertStmt.run(node.nodeId, graphId, embeddingArray.buffer);
        }
      });
      
      insertMany(items);
      return true;
    } catch (error) {
      console.error('批量添加向量到索引失败:', error);
      return false;
    }
  },

  // 从向量索引删除
  removeFromIndex(nodeId) {
    try {
      db.prepare('DELETE FROM vec_nodes WHERE node_id = ?').run(nodeId);
      return true;
    } catch (error) {
      console.error('从向量索引删除失败:', error);
      return false;
    }
  },

  // 清空图谱的向量索引
  clearIndexByGraphId(graphId) {
    try {
      db.prepare('DELETE FROM vec_nodes WHERE graph_id = ?').run(graphId);
      return true;
    } catch (error) {
      console.error('清空向量索引失败:', error);
      return false;
    }
  },

  // 相似度搜索（使用 sqlite-vec）
  searchSimilar(graphId, queryEmbedding, limit = 10) {
    try {
      const embeddingArray = new Float32Array(queryEmbedding);
      
      // 使用 sqlite-vec 的相似度搜索
      const results = db.prepare(`
        SELECT 
          vn.node_id,
          n.label,
          n.type,
          n.properties,
          n.x,
          n.y,
          vec_distance_cosine(vn.embedding, ?) as distance
        FROM vec_nodes vn
        JOIN nodes n ON vn.node_id = n.id
        WHERE vn.graph_id = ?
        ORDER BY distance ASC
        LIMIT ?
      `).all(embeddingArray.buffer, graphId, limit);
      
      return results.map(r => ({
        ...r,
        properties: r.properties ? JSON.parse(r.properties) : {},
        similarity: 1 - r.distance // 转换为相似度（距离越小相似度越高）
      }));
    } catch (error) {
      console.error('向量搜索失败:', error);
      return [];
    }
  },

  // 获取向量索引中的节点数量
  getIndexCount(graphId) {
    try {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM vec_nodes WHERE graph_id = ?
      `).get(graphId);
      return result.count;
    } catch (error) {
      console.error('获取索引数量失败:', error);
      return 0;
    }
  }
};

// 统一的 Embedding 更新操作（事务保证节点和向量索引一致性）
export const embeddingOperations = {
  /**
   * 单个节点 embedding 更新（事务）
   * 同时更新 nodes.embedding 字段和 vec_nodes 向量索引
   * @param {string} nodeId - 节点 ID
   * @param {string} graphId - 图谱 ID
   * @param {number[]} embedding - embedding 向量
   * @returns {boolean} 更新是否成功
   */
  updateWithEmbedding(nodeId, graphId, embedding) {
    try {
      const updateNode = db.prepare(`
        UPDATE nodes SET embedding = ?, updated_at = datetime('now') WHERE id = ?
      `);
      const upsertVec = db.prepare(`
        INSERT OR REPLACE INTO vec_nodes (node_id, graph_id, embedding)
        VALUES (?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        // 1. 更新节点的 embedding 字段
        updateNode.run(JSON.stringify(embedding), nodeId);
        // 2. 更新向量索引（使用 INSERT OR REPLACE 实现 upsert）
        const embeddingArray = new Float32Array(embedding);
        upsertVec.run(nodeId, graphId, embeddingArray.buffer);
      });

      transaction();
      return true;
    } catch (error) {
      console.error('updateWithEmbedding 失败:', error);
      return false;
    }
  },

  /**
   * 批量节点 embedding 更新（事务）
   * 同时更新多个节点的 nodes.embedding 字段和 vec_nodes 向量索引
   * @param {string} graphId - 图谱 ID
   * @param {Array<{id: string, embedding: number[]}>} items - 节点 embedding 数据
   * @returns {boolean} 更新是否成功
   */
  batchUpdateWithEmbeddings(graphId, items) {
    if (!items || items.length === 0) return true;

    try {
      const updateNode = db.prepare(`
        UPDATE nodes SET embedding = ?, updated_at = datetime('now') WHERE id = ?
      `);
      const upsertVec = db.prepare(`
        INSERT OR REPLACE INTO vec_nodes (node_id, graph_id, embedding)
        VALUES (?, ?, ?)
      `);

      const transaction = db.transaction((nodes) => {
        for (const node of nodes) {
          // 1. 更新节点的 embedding 字段
          updateNode.run(JSON.stringify(node.embedding), node.id);
          // 2. 更新向量索引
          const embeddingArray = new Float32Array(node.embedding);
          upsertVec.run(node.id, graphId, embeddingArray.buffer);
        }
      });

      transaction(items);
      return true;
    } catch (error) {
      console.error('batchUpdateWithEmbeddings 失败:', error);
      return false;
    }
  },

  /**
   * 删除节点的 embedding（事务）
   * 同时删除 nodes.embedding 字段和 vec_nodes 向量索引中的数据
   * @param {string} nodeId - 节点 ID
   * @returns {boolean} 删除是否成功
   */
  deleteEmbedding(nodeId) {
    try {
      const clearNode = db.prepare(`
        UPDATE nodes SET embedding = NULL, updated_at = datetime('now') WHERE id = ?
      `);
      const clearVec = db.prepare(`
        DELETE FROM vec_nodes WHERE node_id = ?
      `);

      const transaction = db.transaction(() => {
        clearNode.run(nodeId);
        clearVec.run(nodeId);
      });

      transaction();
      return true;
    } catch (error) {
      console.error('deleteEmbedding 失败:', error);
      return false;
    }
  },

  /**
   * 清空图谱的所有 embedding（事务）
   * @param {string} graphId - 图谱 ID
   * @returns {boolean} 删除是否成功
   */
  clearGraphEmbeddings(graphId) {
    try {
      const clearNodes = db.prepare(`
        UPDATE nodes SET embedding = NULL WHERE graph_id = ?
      `);
      const clearVec = db.prepare(`
        DELETE FROM vec_nodes WHERE graph_id = ?
      `);

      const transaction = db.transaction(() => {
        clearNodes.run(graphId);
        clearVec.run(graphId);
      });

      transaction();
      return true;
    } catch (error) {
      console.error('clearGraphEmbeddings 失败:', error);
      return false;
    }
  }
};

// 节点 Embedding 索引操作
export const nodeEmbeddingOperations = {
  // 保存节点 embedding 到索引表
  save(nodeId, graphId, embedding) {
    // 先删除旧的
    db.prepare('DELETE FROM node_embeddings WHERE node_id = ?').run(nodeId);
    
    const stmt = db.prepare(`
      INSERT INTO node_embeddings (node_id, graph_id, embedding)
      VALUES (?, ?, ?)
    `);
    return stmt.run(nodeId, graphId, JSON.stringify(embedding));
  },

  // 批量保存
  batchSave(graphId, embeddings) {
    const deleteStmt = db.prepare('DELETE FROM node_embeddings WHERE graph_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO node_embeddings (node_id, graph_id, embedding)
      VALUES (?, ?, ?)
    `);
    
    const saveMany = db.transaction((items) => {
      deleteStmt.run(graphId);
      for (const item of items) {
        insertStmt.run(item.nodeId, graphId, JSON.stringify(item.embedding));
      }
    });
    
    saveMany(embeddings);
    return true;
  },

  // 获取图谱的所有 embedding
  getByGraphId(graphId) {
    return db.prepare('SELECT * FROM node_embeddings WHERE graph_id = ?').all(graphId);
  },

  // 获取单个节点的 embedding
  getByNodeId(nodeId) {
    const row = db.prepare('SELECT * FROM node_embeddings WHERE node_id = ?').get(nodeId);
    if (row && row.embedding) {
      try {
        return { ...row, embedding: JSON.parse(row.embedding) };
      } catch {
        return null;
      }
    }
    return null;
  },

  // 删除节点的 embedding
  delete(nodeId) {
    return db.prepare('DELETE FROM node_embeddings WHERE node_id = ?').run(nodeId);
  },

  // 删除图谱的所有 embedding
  deleteByGraphId(graphId) {
    return db.prepare('DELETE FROM node_embeddings WHERE graph_id = ?').run(graphId);
  }
};

// 边操作
export const edgeOperations = {
  getAll() {
    const graphId = getActiveGraphId();
    if (!graphId) return [];
    return db.prepare('SELECT * FROM edges WHERE graph_id = ? ORDER BY created_at DESC').all(graphId);
  },

  getByGraphId(graphId) {
    return db.prepare('SELECT * FROM edges WHERE graph_id = ? ORDER BY created_at DESC').all(graphId);
  },

  getById(id) {
    return db.prepare('SELECT * FROM edges WHERE id = ?').get(id);
  },

  create(edge) {
    const graphId = getActiveGraphId();
    if (!graphId) throw new Error('没有活跃的图谱');
    
    const stmt = db.prepare(`
      INSERT INTO edges (id, graph_id, source, target, label, type, properties)
      VALUES (@id, @graphId, @source, @target, @label, @type, @properties)
    `);
    stmt.run({
      id: edge.id,
      graphId,
      source: edge.source,
      target: edge.target,
      label: edge.label || '',
      type: edge.type || 'default',
      properties: JSON.stringify(edge.properties || {})
    });
    return edgeOperations.getById(edge.id);
  },

  createForGraph(edge, graphId) {
    const stmt = db.prepare(`
      INSERT INTO edges (id, graph_id, source, target, label, type, properties)
      VALUES (@id, @graphId, @source, @target, @label, @type, @properties)
    `);
    stmt.run({
      id: edge.id,
      graphId,
      source: edge.source,
      target: edge.target,
      label: edge.label || '',
      type: edge.type || 'default',
      properties: JSON.stringify(edge.properties || {})
    });
    return edgeOperations.getById(edge.id);
  },

  update(id, data) {
    const oldEdge = edgeOperations.getById(id);
    if (!oldEdge) return null;

    const updates = [];
    const params = { id };
    
    if (data.label !== undefined) {
      updates.push('label = @label');
      params.label = data.label;
    }
    if (data.type !== undefined) {
      updates.push('type = @type');
      params.type = data.type;
    }
    if (data.properties !== undefined) {
      updates.push('properties = @properties');
      params.properties = JSON.stringify(data.properties);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE edges SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return edgeOperations.getById(id);
  },

  delete(id) {
    const oldEdge = edgeOperations.getById(id);
    if (!oldEdge) return null;
    
    db.prepare('DELETE FROM edges WHERE id = ?').run(id);
    return oldEdge;
  }
};

// 历史记录操作
export const historyOperations = {
  getAll(limit = 50) {
    const graphId = getActiveGraphId();
    if (!graphId) return [];
    return db.prepare('SELECT * FROM history WHERE graph_id = ? ORDER BY timestamp DESC LIMIT ?').all(graphId, limit);
  },

  // 按图谱ID获取历史记录
  getByGraphId(graphId, limit = 50) {
    return db.prepare('SELECT * FROM history WHERE graph_id = ? ORDER BY timestamp DESC LIMIT ?').all(graphId, limit);
  },

  add(graphId, operationType, targetType, targetId, oldData, newData) {
    if (!graphId) {
      graphId = getActiveGraphId();
    }
    if (!graphId) return;
    
    const stmt = db.prepare(`
      INSERT INTO history (graph_id, operation_type, target_type, target_id, old_data, new_data)
      VALUES (@graphId, @operationType, @targetType, @targetId, @oldData, @newData)
    `);
    stmt.run({
      graphId,
      operationType,
      targetType,
      targetId,
      oldData: oldData ? JSON.stringify(oldData) : null,
      newData: newData ? JSON.stringify(newData) : null
    });
  },

  // 支持指定图谱ID的撤销
  undo(graphId) {
    if (!graphId) {
      graphId = getActiveGraphId();
    }
    if (!graphId) return { success: false, message: '没有图谱ID' };
    
    // 获取最后一条记录
    const lastRecord = db.prepare('SELECT * FROM history WHERE graph_id = ? ORDER BY id DESC LIMIT 1').get(graphId);
    if (!lastRecord) return { success: false, message: '没有可撤销的记录' };

    try {
      if (lastRecord.target_type === 'node') {
        if (lastRecord.operation_type === 'create') {
          nodeOperations.delete(lastRecord.target_id);
        } else if (lastRecord.operation_type === 'update') {
          const oldData = JSON.parse(lastRecord.old_data);
          nodeOperations.update(lastRecord.target_id, oldData);
        } else if (lastRecord.operation_type === 'delete') {
          const oldData = JSON.parse(lastRecord.old_data);
          nodeOperations.createForGraph(oldData, graphId);
        }
      } else if (lastRecord.target_type === 'edge') {
        if (lastRecord.operation_type === 'create') {
          edgeOperations.delete(lastRecord.target_id);
        } else if (lastRecord.operation_type === 'update') {
          const oldData = JSON.parse(lastRecord.old_data);
          edgeOperations.update(lastRecord.target_id, oldData);
        } else if (lastRecord.operation_type === 'delete') {
          const oldData = JSON.parse(lastRecord.old_data);
          edgeOperations.createForGraph(oldData, graphId);
        }
      }

      db.prepare('DELETE FROM history WHERE id = ?').run(lastRecord.id);
      
      return { success: true, message: '撤销成功', record: lastRecord };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
};

// Agent 操作
export const agentOperations = {
  // 创建 Agent
  create(agent) {
    const id = crypto.randomUUID();
    const apiKey = crypto.randomUUID().replace(/-/g, '');
    const stmt = db.prepare(`
      INSERT INTO agents (id, name, description, api_key, workspace_id, tenant_id, user_id, permissions, rate_limit, monthly_quota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      agent.name,
      agent.description || '',
      apiKey,
      agent.workspace_id || null,
      agent.tenant_id || null,
      agent.user_id || null,
      JSON.stringify(agent.permissions || {
        graphs: ['read', 'write'],
        nodes: ['read', 'write', 'delete'],
        edges: ['read', 'write', 'delete']
      }),
      agent.rate_limit || 1000,
      agent.monthly_quota || 100000
    );
    return agentOperations.getById(id, true);
  },

  // 根据 ID 获取 Agent
  getById(id, includeApiKey = false) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (agent && !includeApiKey) {
      delete agent.api_key;
    }
    if (agent) {
      agent.permissions = JSON.parse(agent.permissions || '{}');
    }
    return agent;
  },

  // 根据 API Key 获取 Agent
  getByApiKey(apiKey) {
    const agent = db.prepare('SELECT * FROM agents WHERE api_key = ? AND is_active = 1').get(apiKey);
    if (agent) {
      agent.permissions = JSON.parse(agent.permissions || '{}');
    }
    return agent;
  },

  // 获取 Agent 列表
  getAll() {
    const agents = db.prepare('SELECT id, name, description, workspace_id, tenant_id, user_id, permissions, rate_limit, monthly_quota, requests_used, is_active, created_at, updated_at FROM agents ORDER BY created_at DESC').all();
    return agents.map(a => ({ ...a, permissions: JSON.parse(a.permissions || '{}') }));
  },

  // 根据用户获取 Agent 列表（用户自己创建的 Agent）
  getByUserId(userId) {
    const agents = db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return agents.map(a => ({ ...a, permissions: JSON.parse(a.permissions || '{}') }));
  },

  // 根据租户获取 Agent 列表
  getByTenantId(tenantId) {
    const agents = db.prepare('SELECT id, name, description, workspace_id, tenant_id, user_id, permissions, rate_limit, monthly_quota, requests_used, is_active, created_at, updated_at FROM agents WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
    return agents.map(a => ({ ...a, permissions: JSON.parse(a.permissions || '{}') }));
  },

  // 更新 Agent
  update(id, data) {
    const updates = [];
    const params = { id };

    if (data.name !== undefined) {
      updates.push('name = @name');
      params.name = data.name;
    }
    if (data.description !== undefined) {
      updates.push('description = @description');
      params.description = data.description;
    }
    if (data.tenant_id !== undefined) {
      updates.push('tenant_id = @tenant_id');
      params.tenant_id = data.tenant_id;
    }
    if (data.permissions !== undefined) {
      updates.push('permissions = @permissions');
      params.permissions = JSON.stringify(data.permissions);
    }
    if (data.rate_limit !== undefined) {
      updates.push('rate_limit = @rate_limit');
      params.rate_limit = data.rate_limit;
    }
    if (data.monthly_quota !== undefined) {
      updates.push('monthly_quota = @monthly_quota');
      params.monthly_quota = data.monthly_quota;
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = @is_active');
      params.is_active = data.is_active ? 1 : 0;
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return agentOperations.getById(id);
  },

  // 删除 Agent
  delete(id) {
    const agent = agentOperations.getById(id);
    if (!agent) return null;
    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    return agent;
  },

  // 验证权限（支持资源级和操作级）
  hasPermission(agent, resource, action) {
    if (!agent || !agent.permissions) return false;
    const perms = agent.permissions[resource];
    if (!perms) return false;

    // 旧格式: ['read', 'write']
    if (Array.isArray(perms)) {
      return perms.includes(action);
    }

    // 新格式: { read: true, write: { fields: [...] } }
    const actionPerm = perms[action];
    if (!actionPerm) return false;

    // boolean true 表示有权限
    if (actionPerm === true) return true;

    // 对象格式 { fields: [...] } 或 { fields: [...] | boolean, maxPerRequest: n }
    if (typeof actionPerm === 'object') return true;

    return false;
  },

  // 检查字段级权限
  checkFieldPermission(agent, resource, action, field) {
    if (!agent || !agent.permissions) return false;
    const perms = agent.permissions[resource];
    if (!perms) return false;

    // 旧格式不支持字段级权限
    if (Array.isArray(perms)) return true;

    // 新格式
    const actionPerm = perms[action];
    if (!actionPerm) return false;

    // boolean true 表示允许所有字段
    if (actionPerm === true) return true;

    // 对象格式
    if (typeof actionPerm === 'object') {
      // fields 为 true 表示允许所有字段
      if (actionPerm.fields === true) return true;
      // fields 为 undefined 或空数组表示允许所有字段
      if (!actionPerm.fields || actionPerm.fields.length === 0) return true;
      // 检查字段是否在允许列表中
      return actionPerm.fields.includes(field);
    }

    return false;
  },

  // 获取操作级权限配置
  getOperationConfig(agent, resource, action) {
    if (!agent || !agent.permissions) return null;
    const perms = agent.permissions[resource];
    if (!perms) return null;

    // 旧格式
    if (Array.isArray(perms)) return {};

    // 新格式
    const actionPerm = perms[action];
    if (!actionPerm) return null;

    // boolean true
    if (actionPerm === true) return {};

    // 对象格式
    if (typeof actionPerm === 'object') return actionPerm;

    return null;
  },

  // 检查配额
  checkQuota(agent) {
    return agent && agent.requests_used < agent.monthly_quota;
  },

  // 增加请求计数
  incrementRequestCount(agentId) {
    db.prepare('UPDATE agents SET requests_used = requests_used + 1, updated_at = datetime(\'now\') WHERE id = ?').run(agentId);
  },

  // 重置月度配额
  resetMonthlyQuota(agentId) {
    db.prepare('UPDATE agents SET requests_used = 0, updated_at = datetime(\'now\') WHERE id = ?').run(agentId);
  },

  // 轮换 API Key
  rotateApiKey(id) {
    const newApiKey = crypto.randomUUID().replace(/-/g, '');
    db.prepare('UPDATE agents SET api_key = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newApiKey, id);
    return agentOperations.getById(id, true);
  }
};

// Workspace 操作
export const workspaceOperations = {
  // 创建 Workspace
  create(workspace) {
    const id = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO workspaces (id, name, description, owner_type, owner_id, agent_id, settings)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      workspace.name,
      workspace.description || '',
      workspace.owner_type || 'user',
      workspace.owner_id || null,
      workspace.agent_id || null,
      JSON.stringify(workspace.settings || {})
    );
    return workspaceOperations.getById(id);
  },

  // 根据 ID 获取 Workspace
  getById(id) {
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if (ws) {
      ws.settings = JSON.parse(ws.settings || '{}');
    }
    return ws;
  },

  // 根据 Agent ID 获取 Workspace
  getByAgentId(agentId) {
    const ws = db.prepare('SELECT * FROM workspaces WHERE agent_id = ?').get(agentId);
    if (ws) {
      ws.settings = JSON.parse(ws.settings || '{}');
    }
    return ws;
  },

  // 获取用户的 Workspaces
  getByUserId(userId) {
    const workspaces = db.prepare('SELECT * FROM workspaces WHERE owner_type = ? AND owner_id = ?').all('user', userId);
    return workspaces.map(ws => ({ ...ws, settings: JSON.parse(ws.settings || '{}') }));
  },

  // 获取所有 Workspaces
  getAll() {
    const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all();
    return workspaces.map(ws => ({ ...ws, settings: JSON.parse(ws.settings || '{}') }));
  },

  // 更新 Workspace
  update(id, data) {
    const updates = [];
    const params = { id };

    if (data.name !== undefined) {
      updates.push('name = @name');
      params.name = data.name;
    }
    if (data.description !== undefined) {
      updates.push('description = @description');
      params.description = data.description;
    }
    if (data.settings !== undefined) {
      updates.push('settings = @settings');
      params.settings = JSON.stringify(data.settings);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return workspaceOperations.getById(id);
  },

  // 删除 Workspace
  delete(id) {
    const ws = workspaceOperations.getById(id);
    if (!ws) return null;
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    return ws;
  }
};

// 图谱 Agent 授权操作
export const graphAgentPermissionOperations = {
  // 授权 Agent 访问图谱
  create(permission) {
    const id = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO graph_agent_permissions (id, graph_id, agent_id, permission, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      permission.graph_id,
      permission.agent_id,
      permission.permission || 'read',
      permission.created_by
    );
    return graphAgentPermissionOperations.getById(id);
  },

  // 根据 ID 获取授权
  getById(id) {
    return db.prepare(`
      SELECT gap.*, a.name as agent_name, g.name as graph_name
      FROM graph_agent_permissions gap
      JOIN agents a ON gap.agent_id = a.id
      JOIN graphs g ON gap.graph_id = g.id
      WHERE gap.id = ?
    `).get(id);
  },

  // 获取图谱的所有授权
  getByGraphId(graphId) {
    return db.prepare(`
      SELECT gap.*, a.id as agent_id, a.name as agent_name, a.description as agent_description, a.is_active as agent_is_active
      FROM graph_agent_permissions gap
      JOIN agents a ON gap.agent_id = a.id
      WHERE gap.graph_id = ?
      ORDER BY gap.created_at DESC
    `).all(graphId);
  },

  // 获取 Agent 的所有授权
  getByAgentId(agentId) {
    return db.prepare(`
      SELECT gap.*, g.name as graph_name, g.description as graph_description
      FROM graph_agent_permissions gap
      JOIN graphs g ON gap.graph_id = g.id
      WHERE gap.agent_id = ?
      ORDER BY gap.created_at DESC
    `).all(agentId);
  },

  // 批量获取多个图谱的授权(单次 SQL,避免 N+1)
  getByGraphIds(graphIds) {
    if (!graphIds || graphIds.length === 0) return [];
    const placeholders = graphIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT gap.*, a.name as agent_name, a.description as agent_description, a.is_active as agent_is_active
      FROM graph_agent_permissions gap
      JOIN agents a ON gap.agent_id = a.id
      WHERE gap.graph_id IN (${placeholders})
      ORDER BY gap.created_at DESC
    `).all(...graphIds);
  },

  // 获取 Agent 对指定图谱的授权
  getByAgentAndGraph(agentId, graphId) {
    return db.prepare(`
      SELECT * FROM graph_agent_permissions 
      WHERE agent_id = ? AND graph_id = ?
    `).get(agentId, graphId);
  },

  // 更新授权权限
  update(id, data) {
    const updates = [];
    const params = { id };

    if (data.permission !== undefined) {
      updates.push('permission = @permission');
      params.permission = data.permission;
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const stmt = db.prepare(`UPDATE graph_agent_permissions SET ${updates.join(', ')} WHERE id = @id`);
      stmt.run(params);
    }

    return graphAgentPermissionOperations.getById(id);
  },

  // 撤销授权
  delete(id) {
    const permission = graphAgentPermissionOperations.getById(id);
    if (!permission) return null;
    db.prepare('DELETE FROM graph_agent_permissions WHERE id = ?').run(id);
    return permission;
  },

  // 撤销 Agent 对图谱的授权
  deleteByAgentAndGraph(agentId, graphId) {
    const permission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    if (!permission) return null;
    db.prepare('DELETE FROM graph_agent_permissions WHERE agent_id = ? AND graph_id = ?').run(agentId, graphId);
    return permission;
  },

  // 获取 Agent 可访问的所有图谱（包括自己创建的）
  getAccessibleGraphs(agentId) {
    // 获取 Agent 所有者（创建者）
    const agent = agentOperations.getById(agentId);
    if (!agent) return [];

    let graphs = [];

    // 1. Agent 自己创建的图谱（user_id 为空或等于 agent 的 user_id）
    if (agent.user_id) {
      const ownedGraphs = db.prepare(`
        SELECT g.*, 'owner' as access_type, 'write' as permission
        FROM graphs g
        WHERE g.user_id = ?
      `).all(agent.user_id);
      graphs = [...graphs, ...ownedGraphs];
    }

    // 2. 被授权访问的图谱
    const authorizedGraphs = db.prepare(`
      SELECT g.*, gap.permission as access_permission, 'authorized' as access_type
      FROM graph_agent_permissions gap
      JOIN graphs g ON gap.graph_id = g.id
      WHERE gap.agent_id = ?
    `).all(agentId);

    graphs = [...graphs, ...authorizedGraphs];

    return graphs;
  },

  // 检查 Agent 是否有权限访问图谱
  hasAccess(agentId, graphId) {
    const agent = agentOperations.getById(agentId);
    if (!agent) return false;

    // 检查是否是图谱所有者
    const graph = graphOperations.getById(graphId);
    if (graph && graph.user_id && graph.user_id === agent.user_id) {
      return true;
    }

    // 检查是否有授权
    const permission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    return !!permission;
  },

  // 检查 Agent 是否有写权限
  hasWriteAccess(agentId, graphId) {
    const agent = agentOperations.getById(agentId);
    if (!agent) return false;

    // 检查是否是图谱所有者
    const graph = graphOperations.getById(graphId);
    if (graph && graph.user_id && graph.user_id === agent.user_id) {
      return true;
    }

    // 检查授权权限
    const permission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    return permission && permission.permission === 'write';
  }
};

// Agent API 日志操作
export const agentApiLogOperations = {
  // 记录 API 调用日志
  create(logEntry) {
    const stmt = db.prepare(`
      INSERT INTO agent_api_logs (agent_id, method, path, status_code, response_time, ip, user_agent, request_body, graph_id, graph_name, operation_type, nodes_affected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      logEntry.agent_id,
      logEntry.method,
      logEntry.path,
      logEntry.status_code,
      logEntry.response_time,
      logEntry.ip || '',
      logEntry.user_agent || '',
      logEntry.request_body || '',
      logEntry.graph_id || '',
      logEntry.graph_name || '',
      logEntry.operation_type || '',
      logEntry.nodes_affected || 0
    );
  },

  // 获取 Agent 的最近日志
  getByAgentId(agentId, limit = 100) {
    return db.prepare(`
      SELECT * FROM agent_api_logs 
      WHERE agent_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(agentId, limit);
  },

  // 获取多个 Agent 的最近日志（用于用户查看所有关联 Agent 的日志）
  getByAgentIds(agentIds, limit = 100) {
    if (!agentIds || agentIds.length === 0) return [];
    const placeholders = agentIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT l.*, a.name as agent_name 
      FROM agent_api_logs l
      JOIN agents a ON l.agent_id = a.id
      WHERE l.agent_id IN (${placeholders})
      ORDER BY l.created_at DESC 
      LIMIT ?
    `).all(...agentIds, limit);
  },

  // 获取所有日志（管理员用）
  getAll(limit = 100) {
    return db.prepare(`
      SELECT l.*, a.name as agent_name 
      FROM agent_api_logs l
      JOIN agents a ON l.agent_id = a.id
      ORDER BY l.created_at DESC 
      LIMIT ?
    `).all(limit);
  },

  // 清理指定时间之前的日志
  cleanup(beforeDate) {
    return db.prepare(`
      DELETE FROM agent_api_logs WHERE created_at < ?
    `).run(beforeDate);
  }
};

// 图谱版本操作
export const graphVersionOperations = {
  // 创建快照
  createSnapshot(graphId, name, description = '') {
    // 获取当前图谱的完整数据
    const graph = graphOperations.getById(graphId);
    if (!graph) return null;

    const nodes = nodeOperations.getByGraphId(graphId).map(n => ({
      ...n,
      properties: JSON.parse(n.properties || '{}')
    }));
    const edges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));

    const snapshot = { graph, nodes, edges };

    // 获取当前最大版本号
    const maxVersion = db.prepare('SELECT MAX(version) as max FROM graph_versions WHERE graph_id = ?').get(graphId);
    const newVersion = (maxVersion?.max || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO graph_versions (graph_id, version, name, description, snapshot)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(graphId, newVersion, name, description, JSON.stringify(snapshot));

    return graphVersionOperations.getByVersion(graphId, newVersion);
  },

  // 根据版本获取快照
  getByVersion(graphId, version) {
    const v = db.prepare('SELECT * FROM graph_versions WHERE graph_id = ? AND version = ?').get(graphId, version);
    if (v) {
      v.snapshot = JSON.parse(v.snapshot || '{}');
    }
    return v;
  },

  // 获取图谱的所有版本
  getVersions(graphId) {
    return db.prepare('SELECT id, graph_id, version, name, description, created_at FROM graph_versions WHERE graph_id = ? ORDER BY version DESC').all(graphId);
  },

  // 获取最新版本
  getLatestVersion(graphId) {
    const v = db.prepare('SELECT * FROM graph_versions WHERE graph_id = ? ORDER BY version DESC LIMIT 1').get(graphId);
    if (v) {
      v.snapshot = JSON.parse(v.snapshot || '{}');
    }
    return v;
  },

  // 回滚到指定版本
  rollback(graphId, version) {
    const snapshot = graphVersionOperations.getByVersion(graphId, version);
    if (!snapshot) return null;

    const data = snapshot.snapshot;

    // 删除现有数据
    db.prepare('DELETE FROM nodes WHERE graph_id = ?').run(graphId);
    db.prepare('DELETE FROM edges WHERE graph_id = ?').run(graphId);

    // 恢复节点
    for (const node of data.nodes || []) {
      nodeOperations.createForGraph({
        id: node.id,
        label: node.label,
        type: node.type,
        properties: node.properties,
        x: node.x,
        y: node.y
      }, graphId);
    }

    // 恢复边
    for (const edge of data.edges || []) {
      edgeOperations.createForGraph({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: edge.type,
        properties: edge.properties
      }, graphId);
    }

    return { success: true, version };
  },

  // 删除版本
  deleteVersion(graphId, version) {
    const v = graphVersionOperations.getByVersion(graphId, version);
    if (!v) return null;
    db.prepare('DELETE FROM graph_versions WHERE graph_id = ? AND version = ?').run(graphId, version);
    return v;
  }
};
