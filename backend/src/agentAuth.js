/**
 * @deprecated 此模块已弃用,请直接 import './auth.js'
 * 保留此文件仅为向后兼容;下一次大版本将删除
 *
 * 直接 import 方式:
 *   import { apiKeyAuth, jwtAuth, requirePermission } from './auth.js'
 *   // 或者:
 *   import { agentAuthMiddleware } from '../auth.js'  // 重命名为 apiKeyAuth
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

// @deprecated 请使用 apiKeyAuth
export const agentAuthMiddleware = apiKeyAuth;

// @deprecated 请使用 optionalAuth
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
