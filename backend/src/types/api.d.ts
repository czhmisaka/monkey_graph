/**
 * API请求/响应类型定义
 * @module types/api
 */

/**
 * 通用API响应
 */
export interface ApiResponse<T = unknown> {
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 成功状态 */
  success?: boolean;
  /** 消息 */
  message?: string;
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
 * 搜索结果
 */
export interface SearchResult<T> {
  /** 搜索关键词 */
  keyword: string;
  /** 总结果数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页大小 */
  limit: number;
  /** 总页数 */
  totalPages: number;
  /** 结果列表 */
  results: T[];
}

/**
 * 图谱相关请求
 */
export interface GraphRequests {
  /** 创建图谱请求 */
  create: {
    /** 图谱名称 */
    name: string;
    /** 图谱描述 */
    description?: string;
  };

  /** 更新图谱请求 */
  update: {
    /** 图谱名称 */
    name?: string;
    /** 图谱描述 */
    description?: string;
  };

  /** 更新图谱设置请求 */
  updateSettings: {
    /** 节点类型配置 */
    nodeTypes?: Record<string, { color: string; shape: string }>;
    /** 边类型配置 */
    edgeTypes?: Record<string, { color: string; style: string }>;
    /** 其他设置 */
    [key: string]: unknown;
  };

  /** 复制图谱请求 */
  duplicate: {
    /** 新图谱名称 */
    name: string;
  };
}

/**
 * 分享相关请求
 */
export interface ShareRequests {
  /** 生成分享链接请求 */
  createShare: {
    /** 是否允许编辑 */
    allow_edit?: boolean;
    /** 过期时间（ISO格式） */
    expires_at?: string;
  };
}

/**
 * Embedding相关请求
 */
export interface EmbeddingRequests {
  /** 聚类请求 */
  cluster: {
    /** 聚类数量 */
    k: number;
  };

  /** 语义搜索请求参数 */
  semanticSearch: {
    /** 搜索关键词 */
    q: string;
    /** 返回数量限制 */
    limit?: number;
  };
}

/**
 * LLM配置相关请求
 */
export interface LLMConfigRequests {
  /** 配置LLM请求 */
  configureLLM: {
    /** 提供商 */
    provider: string;
    /** API Key */
    api_key: string;
    /** Base URL */
    base_url?: string;
    /** 模型名称 */
    model_name?: string;
  };
}

/**
 * 聊天相关类型
 */
export namespace ChatTypes {
  /**
   * 聊天消息角色
   */
  export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

  /**
   * 聊天消息
   */
  export interface Message {
    /** 消息角色 */
    role: MessageRole;
    /** 消息内容 */
    content: string;
    /** 工具调用（可选） */
    tool_calls?: ToolCall[];
  }

  /**
   * 工具调用
   */
  export interface ToolCall {
    /** 工具ID */
    id: string;
    /** 工具名称 */
    name: string;
    /** 工具参数 */
    arguments: Record<string, unknown>;
  }

  /**
   * 聊天请求
   */
  export interface ChatRequest {
    /** 消息列表 */
    messages: Message[];
    /** 图谱ID */
    graphId?: string;
  }

  /**
   * SSE聊天事件类型
   */
  export type ChatEventType = 'token' | 'tool_call' | 'tool_result' | 'complete' | 'error';

  /**
   * SSE聊天Token事件
   */
  export interface ChatTokenEvent {
    type: 'token';
    content: string;
  }

  /**
   * SSE聊天工具调用事件
   */
  export interface ChatToolCallEvent {
    type: 'tool_call';
    tool: ToolCall;
  }

  /**
   * SSE聊天工具结果事件
   */
  export interface ChatToolResultEvent {
    type: 'tool_result';
    tool_call_id: string;
    result: unknown;
  }

  /**
   * SSE聊天完成事件
   */
  export interface ChatCompleteEvent {
    type: 'complete';
    message: string;
  }

  /**
   * SSE聊天错误事件
   */
  export interface ChatErrorEvent {
    type: 'error';
    message: string;
  }

  /**
   * SSE聊天事件联合类型
   */
  export type ChatEvent = ChatTokenEvent | ChatToolCallEvent | ChatToolResultEvent | ChatCompleteEvent | ChatErrorEvent;

  /**
   * 工具定义
   */
  export interface Tool {
    /** 工具名称 */
    name: string;
    /** 工具描述 */
    description: string;
    /** 工具参数Schema */
    parameters: Record<string, unknown>;
  }
}

/**
 * 本体生成相关类型
 */
export namespace OntologyTypes {
  /**
   * 本体生成请求（FormData）
   */
  export interface GenerateRequest {
    /** 上传的文件列表 */
    files: File[];
    /** 模拟需求 */
    simulation_requirement?: string;
    /** 项目名称 */
    project_name?: string;
    /** 额外上下文 */
    additional_context?: string;
  }

  /**
   * SSE本体生成事件类型
   */
  export type OntologyEventType = 'progress' | 'complete' | 'error';

  /**
   * SSE本体生成进度事件
   */
  export interface OntologyProgressEvent {
    type: 'progress';
    stage: string;
    message: string;
    progress?: number;
  }

  /**
   * SSE本体生成完成事件
   */
  export interface OntologyCompleteEvent {
    type: 'complete';
    data: OntologyDefinition;
  }

  /**
   * SSE本体生成错误事件
   */
  export interface OntologyErrorEvent {
    type: 'error';
    message: string;
  }

  /**
   * SSE本体生成事件联合类型
   */
  export type OntologyEvent = OntologyProgressEvent | OntologyCompleteEvent | OntologyErrorEvent;

  /**
   * 本体定义
   */
  export interface OntologyDefinition {
    /** 节点类型定义 */
    nodeTypes: OntologyNodeType[];
    /** 边类型定义 */
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
    /** 属性定义 */
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
    /** 属性定义 */
    properties: OntologyProperty[];
  }

  /**
   * 本体属性定义
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
    /** 枚举值（仅type为enum时） */
    enumValues?: string[];
    /** 默认值 */
    defaultValue?: unknown;
  }
}

/**
 * 图谱构建相关类型
 */
export namespace GraphBuildTypes {
  /**
   * 图谱构建请求
   */
  export interface BuildRequest {
    /** 文本内容 */
    text?: string;
    /** 文件路径列表 */
    files?: string[];
    /** 是否启用Embedding */
    enable_embedding?: boolean;
    /** 节点类型（可选） */
    node_type?: string;
    /** 其他配置 */
    config?: Record<string, unknown>;
  }

  /**
   * 任务状态
   */
  export interface TaskStatus {
    /** 任务ID */
    taskId: string;
    /** 任务状态 */
    status: 'pending' | 'processing' | 'completed' | 'failed';
    /** 进度（0-100） */
    progress?: number;
    /** 当前阶段 */
    stage?: string;
    /** 错误信息 */
    error?: string;
    /** 结果 */
    result?: unknown;
    /** 创建时间 */
    created_at: string;
    /** 完成时间 */
    completed_at?: string;
  }
}

/**
 * 日志相关类型
 */
export namespace LogTypes {
  /**
   * 日志文件信息
   */
  export interface LogFile {
    /** 文件名 */
    name: string;
    /** 文件大小（字节） */
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
    /** 日志行数 */
    lines: number;
    /** 日志内容 */
    content: string;
  }
}

/**
 * 管理员相关请求
 */
export interface AdminRequests {
  /** 暂停租户 */
  suspendTenant: never;

  /** 激活租户 */
  activateTenant: never;

  /** 删除租户 */
  deleteTenant: never;
}

/**
 * 租户相关请求
 */
export interface TenantRequests {
  /** 更改套餐 */
  changePlan: {
    /** 计划ID */
    plan_id: string;
  };
}

/**
 * HTTP状态码
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * 认证错误码
 */
export enum AuthError {
  TOKEN_MISSING = 'TOKEN_MISSING',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}

/**
 * API错误响应
 */
export interface ApiError {
  /** 错误信息 */
  error: string;
  /** 错误码 */
  code?: string;
  /** 详细信息 */
  details?: unknown;
}
