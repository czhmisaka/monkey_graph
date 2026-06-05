/**
 * agentAuth.js - 向后兼容模块
 *
 * 此模块已弃用，请优先使用 auth.js
 * 所有功能已迁移到统一的 auth.js 模块
 */

import {
  createAuthMiddleware,
  requirePermission,
  requirePermissionWithFields,
  checkPerRequestLimit,
  jwtAuth,
  apiKeyAuth,
  optionalAuth
} from './auth.js';

// ============ 向后兼容别名 ============

// Agent 认证中间件 (原 agentAuthMiddleware)
export const agentAuthMiddleware = apiKeyAuth;

// 可选的 Agent 认证中间件 (原 optionalAgentAuth)
export const optionalAgentAuth = optionalAuth;

export {
  createAuthMiddleware,
  requirePermission,
  requirePermissionWithFields,
  checkPerRequestLimit,
  jwtAuth,
  apiKeyAuth,
  optionalAuth
};

export default {
  agentAuthMiddleware,
  optionalAgentAuth,
  requirePermission,
  requirePermissionWithFields,
  checkPerRequestLimit,
  createAuthMiddleware,
  jwtAuth,
  apiKeyAuth,
  optionalAuth
};
