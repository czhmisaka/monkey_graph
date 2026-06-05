import jwt from 'jsonwebtoken';
import { userOperations, agentOperations, agentApiLogOperations } from './database.js';

// JWT 密钥 - 必须通过环境变量配置
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('❌ 错误: JWT_SECRET 环境变量未设置。请在 .env 文件中配置 JWT_SECRET');
}

// Token 过期时间（默认永久不过期，可通过环境变量设置）
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || null;

// 生成 JWT Token
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    is_admin: user.is_admin || 0
  };
  return TOKEN_EXPIRY ? jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }) : jwt.sign(payload, JWT_SECRET);
}

// 验证 JWT Token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// ============ JWT 认证中间件 ============

function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: '无效或已过期的令牌' });
  }

  const user = userOperations.findById(decoded.id);

  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }

  req.user = user;
  next();
}

// ============ API Key 认证中间件 ============

function apiKeyAuthMiddleware(req, res, next) {
  req._startTime = Date.now();

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Agent ')) {
    return res.status(401).json({
      error: '未提供 Agent 认证令牌',
      code: 'MISSING_AGENT_TOKEN',
      hint: '请使用 "Agent <api_key>" 格式'
    });
  }

  const apiKey = authHeader.substring(6);

  if (!apiKey) {
    return res.status(401).json({
      error: 'API Key 不能为空',
      code: 'EMPTY_API_KEY'
    });
  }

  const agent = agentOperations.getByApiKey(apiKey);

  if (!agent) {
    return res.status(401).json({
      error: '无效的 API Key',
      code: 'INVALID_API_KEY'
    });
  }

  if (!agent.is_active) {
    return res.status(403).json({
      error: 'Agent 已被禁用',
      code: 'AGENT_DISABLED'
    });
  }

  if (!agentOperations.checkQuota(agent)) {
    return res.status(429).json({
      error: '月度请求配额已用完',
      code: 'QUOTA_EXCEEDED',
      quota: agent.monthly_quota,
      used: agent.requests_used
    });
  }

  agentOperations.incrementRequestCount(agent.id);
  req.agent = agent;

  // 记录 API 调用日志
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - (req._startTime || Date.now());

    let graphId = '';
    let operationType = '';
    let nodesAffected = 0;

    const requestPath = req.originalUrl || req.url || '-';
    const graphIdMatch = requestPath.match(/\/api\/agent\/graphs\/([^\/]+)/);
    if (graphIdMatch) {
      graphId = graphIdMatch[1];
    }

    const urlPath = req.originalUrl || req.url || '';

    if (req.method === 'POST') {
      if (urlPath.includes('/nodes')) {
        operationType = 'create_nodes';
        if (req.body && req.body.nodes) {
          nodesAffected = Array.isArray(req.body.nodes) ? req.body.nodes.length : 1;
        } else if (req.body && req.body.label) {
          nodesAffected = 1;
        }
      } else if (urlPath.includes('/edges')) {
        operationType = 'create_edges';
        if (req.body && req.body.edges) {
          nodesAffected = Array.isArray(req.body.edges) ? req.body.edges.length : 1;
        }
      } else if (urlPath.includes('/graphs')) {
        operationType = 'create_graph';
      }
    } else if (req.method === 'PUT') {
      if (urlPath.match(/\/nodes(?:\/|$)/) || urlPath.includes('/batch/nodes')) {
        operationType = 'update_nodes';
        if (req.body && req.body.nodes) {
          nodesAffected = Array.isArray(req.body.nodes) ? req.body.nodes.length : 1;
        } else if (req.body && (req.body.label || req.body.type || req.body.properties)) {
          nodesAffected = 1;
        }
      }
    } else if (req.method === 'DELETE') {
      if (urlPath.match(/\/api\/agent\/graphs\/[^\/]+\/nodes\/[^\/]+/)) {
        operationType = 'delete_node';
        nodesAffected = 1;
      } else if (urlPath.includes('/batch/nodes')) {
        operationType = 'delete_nodes';
        if (req.body && req.body.node_ids) {
          nodesAffected = Array.isArray(req.body.node_ids) ? req.body.node_ids.length : 1;
        }
      } else if (urlPath.match(/\/api\/agent\/graphs\/[^\/]+$/) && !urlPath.includes('/nodes')) {
        operationType = 'delete_graph';
      }
    } else if (req.method === 'GET') {
      if (urlPath.includes('/graphs/') && !urlPath.endsWith('/graphs')) {
        operationType = 'read_graph';
      } else if (urlPath.includes('/export')) {
        operationType = 'export_graph';
      }
    }

    try {
      agentApiLogOperations.create({
        agent_id: agent.id,
        method: req.method,
        path: requestPath,
        status_code: res.statusCode,
        response_time: responseTime,
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        user_agent: req.get('user-agent') || '',
        request_body: req.body ? JSON.stringify(req.body).substring(0, 500) : '',
        graph_id: graphId,
        graph_name: '',
        operation_type: operationType,
        nodes_affected: nodesAffected
      });
    } catch (logError) {
      console.error('记录 API 日志失败:', logError.message);
    }

    return originalSend.call(this, data);
  };

  next();
}

// ============ 可选认证中间件 ============

function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.user = null;
    req.agent = null;
    return next();
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      const user = userOperations.findById(decoded.id);
      req.user = user || null;
    } else {
      req.user = null;
    }
    req.agent = null;
  } else if (authHeader.startsWith('Agent ')) {
    const apiKey = authHeader.substring(6);
    if (apiKey) {
      const agent = agentOperations.getByApiKey(apiKey);
      if (agent && agent.is_active && agentOperations.checkQuota(agent)) {
        agentOperations.incrementRequestCount(agent.id);
        req.agent = agent;
      } else {
        req.agent = null;
      }
    } else {
      req.agent = null;
    }
    req.user = null;
  } else {
    req.user = null;
    req.agent = null;
  }

  next();
}

// ============ 统一认证中间件工厂 ============

/**
 * 创建认证中间件
 * @param {string} type - 认证类型: 'jwt', 'apiKey', 'optional'
 * @returns {Function} Express 中间件
 */
export function createAuthMiddleware(type = 'jwt') {
  switch (type) {
    case 'jwt':
      return jwtAuthMiddleware;
    case 'apiKey':
      return apiKeyAuthMiddleware;
    case 'optional':
      return optionalAuthMiddleware;
    default:
      throw new Error(`Unknown auth type: ${type}`);
  }
}

// ============ 权限检查中间件 ============

export function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(401).json({ error: 'Agent 未认证' });
    }

    if (!agentOperations.hasPermission(req.agent, resource, action)) {
      return res.status(403).json({
        error: '没有权限执行此操作',
        code: 'PERMISSION_DENIED',
        required: { resource, action },
        current: req.agent.permissions
      });
    }

    next();
  };
}

// 支持字段级权限检查的中间件
export function requirePermissionWithFields(resource, action, getFields) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(401).json({ error: 'Agent 未认证' });
    }

    if (!agentOperations.hasPermission(req.agent, resource, action)) {
      return res.status(403).json({
        error: '没有权限执行此操作',
        code: 'PERMISSION_DENIED',
        required: { resource, action },
        current: req.agent.permissions
      });
    }

    // 获取请求中的字段列表
    const fields = getFields(req);
    if (fields) {
      for (const field of fields) {
        if (!agentOperations.checkFieldPermission(req.agent, resource, action, field)) {
          return res.status(403).json({
            error: `没有权限修改字段 ${field}`,
            code: 'FIELD_PERMISSION_DENIED',
            required: { resource, action, field },
            current: req.agent.permissions
          });
        }
      }
    }

    next();
  };
}

// 检查 per-request 限制的辅助函数
export function checkPerRequestLimit(agent, resource, action, requestedCount) {
  const config = agentOperations.getOperationConfig(agent, resource, action);
  if (!config || !config.maxPerRequest) return null;

  if (requestedCount > config.maxPerRequest) {
    return {
      error: `请求数量 ${requestedCount} 超过限制 ${config.maxPerRequest}`,
      code: 'PER_REQUEST_LIMIT_EXCEEDED',
      maxPerRequest: config.maxPerRequest,
      requested: requestedCount
    };
  }
  return null;
}

// ============ 向后兼容别名 ============

// JWT 认证中间件别名
export const jwtAuth = jwtAuthMiddleware;

// API Key 认证中间件别名
export const apiKeyAuth = apiKeyAuthMiddleware;

// 可选认证中间件别名
export const optionalAuth = optionalAuthMiddleware;

// 保留原有的导出名
export const authMiddleware = jwtAuthMiddleware;

export default {
  generateToken,
  verifyToken,
  createAuthMiddleware,
  jwtAuth,
  apiKeyAuth,
  optionalAuth,
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission
};
