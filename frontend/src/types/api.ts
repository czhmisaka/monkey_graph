/**
 * API相关类型定义 - 前端
 * @module types/api
 */

/**
 * 用户公开信息
 */
export interface PublicUser {
  /** 用户ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 头像URL */
  avatar: string;
  /** 简介 */
  bio: string;
  /** 是否为管理员 */
  is_admin: number;
}

/**
 * 登录请求
 */
export interface LoginRequest {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
}

/**
 * 注册请求
 */
export interface RegisterRequest {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
}

/**
 * 登录响应
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
  /** 用户名 */
  username?: string;
  /** 头像URL */
  avatar?: string;
  /** 简介 */
  bio?: string;
}

/**
 * LLM提供商
 */
export type LLMProvider = 'openai' | 'anthropic' | 'azure' | 'ollama' | 'custom';

/**
 * 用户LLM配置
 */
export interface UserLLMConfig {
  /** 配置ID */
  id: string;
  /** 提供商 */
  provider: LLMProvider;
  /** API Key（掩码） */
  api_key: string;
  /** Base URL */
  base_url: string;
  /** 模型名称 */
  model_name: string;
  /** 是否激活 */
  is_active: boolean;
}

/**
 * 聊天消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 工具调用 */
  tool_calls?: ToolCall[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 调用ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/**
 * 聊天工具
 */
export interface ChatTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数Schema */
  parameters: Record<string, unknown>;
}

/**
 * SSE聊天事件类型
 */
export type ChatEventType = 'token' | 'tool_call' | 'tool_result' | 'complete' | 'error';

/**
 * 聊天Token事件
 */
export interface ChatTokenEvent {
  type: 'token';
  content: string;
}

/**
 * 聊天工具调用事件
 */
export interface ChatToolCallEvent {
  type: 'tool_call';
  tool: ToolCall;
}

/**
 * 聊天工具结果事件
 */
export interface ChatToolResultEvent {
  type: 'tool_result';
  tool_call_id: string;
  result: unknown;
}

/**
 * 聊天完成事件
 */
export interface ChatCompleteEvent {
  type: 'complete';
  message: string;
}

/**
 * 聊天错误事件
 */
export interface ChatErrorEvent {
  type: 'error';
  message: string;
}

/**
 * 聊天事件联合类型
 */
export type ChatEvent = ChatTokenEvent | ChatToolCallEvent | ChatToolResultEvent | ChatCompleteEvent | ChatErrorEvent;

/**
 * Agent信息
 */
export interface Agent {
  /** Agent ID */
  id: string;
  /** Agent名称 */
  name: string;
  /** Agent描述 */
  description: string;
  /** 是否激活 */
  is_active: boolean;
  /** 速率限制 */
  rate_limit: number;
  /** 月度配额 */
  monthly_quota: number;
  /** 已使用量 */
  requests_used: number;
}

/**
 * 用户关联的Agent
 */
export interface UserAgent {
  /** 关联ID */
  id: string;
  /** Agent信息 */
  agent: Agent;
  /** 角色 */
  role: 'owner' | 'admin' | 'member';
  /** API Key（仅我的Agent返回） */
  api_key?: string;
}

/**
 * Embedding状态
 */
export interface EmbeddingStatus {
  /** 是否已初始化 */
  initialized: boolean;
  /** 已计算embedding的节点数 */
  computed_nodes: number;
  /** 总节点数 */
  total_nodes: number;
  /** 状态 */
  status: 'idle' | 'computing' | 'error';
}

/**
 * 本体定义
 */
export interface OntologyDefinition {
  /** 节点类型 */
  nodeTypes: OntologyNodeType[];
  /** 边类型 */
  edgeTypes: OntologyEdgeType[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 本体节点类型
 */
export interface OntologyNodeType {
  /** 类型名称 */
  name: string;
  /** 类型描述 */
  description: string;
  /** 建议颜色 */
  color?: string;
  /** 建议形状 */
  shape?: string;
  /** 属性 */
  properties: OntologyProperty[];
}

/**
 * 本体边类型
 */
export interface OntologyEdgeType {
  /** 类型名称 */
  name: string;
  /** 类型描述 */
  description: string;
  /** 建议颜色 */
  color?: string;
  /** 建议样式 */
  style?: string;
  /** 源节点类型 */
  sourceType?: string;
  /** 目标节点类型 */
  targetType?: string;
  /** 属性 */
  properties: OntologyProperty[];
}

/**
 * 本体属性
 */
export interface OntologyProperty {
  /** 属性名称 */
  name: string;
  /** 属性类型 */
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array';
  /** 属性描述 */
  description?: string;
  /** 是否必填 */
  required?: boolean;
  /** 枚举值 */
  enumValues?: string[];
}

/**
 * 图谱构建任务状态
 */
export interface BuildTaskStatus {
  /** 任务ID */
  taskId: string;
  /** 状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** 进度 */
  progress?: number;
  /** 当前阶段 */
  stage?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 使用量统计
 */
export interface UsageStats {
  /** API调用次数 */
  api_calls: number;
  /** 月均API调用 */
  average_api_calls: number;
  /** 最大API调用 */
  max_api_calls: number;
  /** 趋势 */
  trend: 'increasing' | 'decreasing' | 'stable';
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

/**
 * 租户信息
 */
export interface Tenant {
  /** 租户ID */
  id: string;
  /** 租户名称 */
  name: string;
  /** 计划 */
  plan: string;
  /** 状态 */
  status: 'active' | 'suspended' | 'cancelled';
}

/**
 * 订阅信息
 */
export interface Subscription {
  /** 订阅ID */
  id: string;
  /** 计划名称 */
  plan_name: string;
  /** 状态 */
  status: 'active' | 'past_due' | 'cancelled';
  /** 当前周期开始 */
  current_period_start: string;
  /** 当前周期结束 */
  current_period_end: string;
}

/**
 * 套餐信息
 */
export interface Plan {
  /** 计划ID */
  id: string;
  /** 计划名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 价格 */
  price: number;
  /** 特性 */
  features: string[];
  /** 图谱限制 */
  graph_limit: number;
  /** 节点限制 */
  node_limit: number;
  /** API限制 */
  api_limit: number;
}

/**
 * Agent API日志
 */
export interface AgentApiLog {
  /** 日志ID */
  id: number;
  /** Agent名称 */
  agent_name: string;
  /** HTTP方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 状态码 */
  status_code: number;
  /** 响应时间 */
  response_time: number;
  /** 图谱名称 */
  graph_name: string;
  /** 操作类型 */
  operation_type: string;
  /** 受影响节点数 */
  nodes_affected: number;
  /** 创建时间 */
  created_at: string;
}

/**
 * GraphAgent权限
 */
export interface GraphAgentPermission {
  /** 权限ID */
  id: string;
  /** Agent ID */
  agent_id: string;
  /** Agent名称 */
  agent_name: string;
  /** 权限类型 */
  permission: 'read' | 'write';
  /** 创建时间 */
  created_at: string;
}

/**
 * API错误
 */
export interface ApiError extends Error {
  /** 错误信息 */
  message: string;
  /** 状态码 */
  status?: number;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  items: T[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页大小 */
  limit: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 日志文件
 */
export interface LogFile {
  /** 文件名 */
  name: string;
  /** 文件大小 */
  size: number;
  /** 修改时间 */
  modified_at: string;
}

/**
 * 日志内容
 */
export interface LogContent {
  /** 文件名 */
  file: string;
  /** 行数 */
  lines: number;
  /** 内容 */
  content: string;
}
