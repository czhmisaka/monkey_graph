/**
 * 用户相关类型定义
 * @module types/user
 */

/**
 * 用户基本信息
 */
export interface User {
  /** 用户唯一标识符 */
  id: string;
  /** 用户名 */
  username: string;
  /** 密码（数据库中为哈希值） */
  password: string;
  /** 用户头像URL */
  avatar: string;
  /** 用户简介 */
  bio: string;
  /** 是否为管理员 */
  is_admin: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 用户公开信息（API响应）
 */
export interface PublicUser {
  /** 用户唯一标识符 */
  id: string;
  /** 用户名 */
  username: string;
  /** 用户头像URL */
  avatar: string;
  /** 用户简介 */
  bio: string;
  /** 是否为管理员 */
  is_admin: number;
}

/**
 * JWT Token Payload
 */
export interface TokenPayload {
  /** 用户ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 是否为管理员 */
  is_admin: number;
}

/**
 * 用户注册请求
 */
export interface RegisterRequest {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
}

/**
 * 用户登录请求
 */
export interface LoginRequest {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
}

/**
 * 用户登录响应
 */
export interface LoginResponse {
  /** JWT Token */
  token: string;
  /** 用户信息 */
  user: PublicUser;
}

/**
 * 更新用户资料请求
 */
export interface UpdateProfileRequest {
  /** 用户名（可选） */
  username?: string;
  /** 头像URL（可选） */
  avatar?: string;
  /** 简介（可选） */
  bio?: string;
}

/**
 * 用户LLM配置提供商
 */
export type LLMProvider = 'openai' | 'anthropic' | 'azure' | 'ollama' | 'custom';

/**
 * 用户LLM配置
 */
export interface UserLLMConfig {
  /** 配置ID */
  id: string;
  /** 所属用户ID */
  user_id: string;
  /** 提供商 */
  provider: LLMProvider;
  /** API Key（已掩码） */
  api_key: string;
  /** API Base URL */
  base_url: string;
  /** 模型名称 */
  model_name: string;
  /** 是否激活 */
  is_active: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 创建LLM配置请求
 */
export interface CreateLLMConfigRequest {
  /** 提供商（默认'openai'） */
  provider?: LLMProvider;
  /** API Key */
  api_key: string;
  /** API Base URL */
  base_url?: string;
  /** 模型名称（默认'gpt-4o'） */
  model_name?: string;
  /** 是否激活 */
  is_active?: boolean;
}

/**
 * 更新LLM配置请求
 */
export interface UpdateLLMConfigRequest {
  /** 提供商 */
  provider?: LLMProvider;
  /** API Key */
  api_key?: string;
  /** API Base URL */
  base_url?: string;
  /** 模型名称 */
  model_name?: string;
  /** 是否激活 */
  is_active?: boolean;
}

/**
 * Agent权限资源
 */
export type PermissionResource = 'graphs' | 'nodes' | 'edges' | 'chat' | 'embedding';

/**
 * Agent权限动作
 */
export type PermissionAction = 'read' | 'write' | 'delete';

/**
 * 字段级权限配置
 */
export interface FieldPermission {
  /** 允许的字段列表 */
  fields?: string[];
}

/**
 * 操作级权限配置
 */
export interface OperationPermission {
  /** 允许所有字段，或指定字段列表 */
  fields?: string[] | boolean;
  /** 单次请求最大数量限制 */
  maxPerRequest?: number;
}

/**
 * 资源级权限配置（支持旧格式和操作级格式）
 */
export type ResourcePermission = PermissionAction[] | {
  read?: boolean | FieldPermission;
  write?: boolean | FieldPermission;
  delete?: boolean | FieldPermission;
};

/**
 * Agent权限配置
 */
export interface AgentPermissions {
  /** 图谱权限 */
  graphs?: ResourcePermission;
  /** 节点权限 */
  nodes?: ResourcePermission;
  /** 边权限 */
  edges?: ResourcePermission;
  /** 聊天权限 */
  chat?: ResourcePermission;
  /** Embedding权限 */
  embedding?: ResourcePermission;
}

/**
 * Agent
 */
export interface Agent {
  /** Agent唯一标识符 */
  id: string;
  /** Agent名称 */
  name: string;
  /** Agent描述 */
  description: string;
  /** API Key（创建时返回，之后不暴露） */
  api_key?: string;
  /** 所属用户ID */
  user_id: string | null;
  /** Workspace ID */
  workspace_id: string | null;
  /** 租户ID */
  tenant_id: string | null;
  /** 权限配置 */
  permissions: AgentPermissions;
  /** 速率限制（请求/分钟） */
  rate_limit: number;
  /** 月度配额 */
  monthly_quota: number;
  /** 已使用请求数 */
  requests_used: number;
  /** 是否激活 */
  is_active: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 创建Agent请求
 */
export interface CreateAgentRequest {
  /** Agent名称 */
  name: string;
  /** Agent描述 */
  description?: string;
  /** Workspace ID */
  workspace_id?: string;
  /** 租户ID */
  tenant_id?: string;
  /** 权限配置 */
  permissions?: AgentPermissions;
  /** 速率限制 */
  rate_limit?: number;
  /** 月度配额 */
  monthly_quota?: number;
}

/**
 * 更新Agent请求
 */
export interface UpdateAgentRequest {
  /** Agent名称 */
  name?: string;
  /** Agent描述 */
  description?: string;
  /** 权限配置 */
  permissions?: AgentPermissions;
  /** 速率限制 */
  rate_limit?: number;
  /** 月度配额 */
  monthly_quota?: number;
  /** 是否激活 */
  is_active?: boolean;
}

/**
 * 用户关联的Agent角色
 */
export type UserAgentRole = 'owner' | 'admin' | 'member';

/**
 * 用户关联的Agent
 */
export interface UserAgent {
  /** 关联记录ID */
  id: string;
  /** 用户ID */
  user_id: string;
  /** Agent ID */
  agent_id: string;
  /** 角色 */
  role: UserAgentRole;
  /** 创建时间 */
  created_at: string;
  /** Agent名称（JOIN查询） */
  name?: string;
  /** Agent描述（JOIN查询） */
  description?: string;
  /** Agent是否激活（JOIN查询） */
  is_active?: number;
  /** API Key（仅在特定查询中返回） */
  api_key?: string;
}

/**
 * 创建用户-Agent关联请求
 */
export interface CreateUserAgentRequest {
  /** Agent ID */
  agent_id: string;
  /** 角色（默认'member'） */
  role?: UserAgentRole;
}

/**
 * 更新用户-Agent关联角色请求
 */
export interface UpdateUserAgentRoleRequest {
  /** 新角色 */
  role: UserAgentRole;
}

/**
 * Agent API调用日志
 */
export interface AgentApiLog {
  /** 日志ID */
  id: number;
  /** Agent ID */
  agent_id: string;
  /** HTTP方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 响应状态码 */
  status_code: number;
  /** 响应时间（毫秒） */
  response_time: number;
  /** 客户端IP */
  ip: string;
  /** User-Agent */
  user_agent: string;
  /** 请求体 */
  request_body: string;
  /** 关联图谱ID */
  graph_id: string;
  /** 关联图谱名称 */
  graph_name: string;
  /** 操作类型 */
  operation_type: string;
  /** 受影响的节点数量 */
  nodes_affected: number;
  /** 创建时间 */
  created_at: string;
  /** Agent名称（JOIN查询） */
  agent_name?: string;
}

/**
 * Workspace
 */
export interface Workspace {
  /** Workspace唯一标识符 */
  id: string;
  /** Workspace名称 */
  name: string;
  /** Workspace描述 */
  description: string;
  /** 所有者类型 ('user' | 'agent') */
  owner_type: 'user' | 'agent';
  /** 所有者ID */
  owner_id: string | null;
  /** 关联Agent ID */
  agent_id: string | null;
  /** Workspace设置 */
  settings: Record<string, unknown>;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 创建Workspace请求
 */
export interface CreateWorkspaceRequest {
  /** Workspace名称 */
  name: string;
  /** Workspace描述 */
  description?: string;
  /** 所有者类型 */
  owner_type?: 'user' | 'agent';
  /** 所有者ID */
  owner_id?: string;
  /** 关联Agent ID */
  agent_id?: string;
  /** Workspace设置 */
  settings?: Record<string, unknown>;
}

/**
 * 租户信息（用于SaaS）
 */
export interface Tenant {
  /** 租户ID */
  id: string;
  /** 租户名称 */
  name: string;
  /** 计划类型 */
  plan: string;
  /** 状态 */
  status: 'active' | 'suspended' | 'cancelled';
  /** 创建时间 */
  created_at: string;
}

/**
 * 订阅信息（用于SaaS）
 */
export interface Subscription {
  /** 订阅ID */
  id: string;
  /** 租户ID */
  tenant_id: string;
  /** 计划ID */
  plan_id: string;
  /** 计划名称 */
  plan_name: string;
  /** 状态 */
  status: 'active' | 'past_due' | 'cancelled';
  /** 当前周期开始时间 */
  current_period_start: string;
  /** 当前周期结束时间 */
  current_period_end: string;
}

/**
 * 套餐信息（用于SaaS）
 */
export interface Plan {
  /** 计划ID */
  id: string;
  /** 计划名称 */
  name: string;
  /** 计划描述 */
  description: string;
  /** 价格（月费） */
  price: number;
  /** 特性列表 */
  features: string[];
  /** 图谱数量限制 */
  graph_limit: number;
  /** 节点数量限制 */
  node_limit: number;
  /** API调用限制 */
  api_limit: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 使用量统计
 */
export interface UsageStats {
  /** API调用次数 */
  api_calls: number;
  /** 图谱数量 */
  graphs_count: number;
  /** 节点总数 */
  nodes_count: number;
  /** 边总数 */
  edges_count: number;
}

/**
 * 全局统计
 */
export interface GlobalStats {
  /** 总图谱数 */
  total_graphs: number;
  /** 总用户数 */
  total_users: number;
  /** 总节点数 */
  total_nodes: number;
  /** 总边数 */
  total_edges: number;
  /** 活跃图谱数 */
  active_graphs: number;
}
