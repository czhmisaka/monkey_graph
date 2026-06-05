/**
 * 图谱相关类型定义
 * @module types/graph
 */

/**
 * 图谱基本信息
 */
export interface Graph {
  /** 图谱唯一标识符 */
  id: string;
  /** 所属用户ID（Agent创建的图谱可能为空） */
  user_id: string | null;
  /** 图谱名称 */
  name: string;
  /** 图谱描述 */
  description: string;
  /** 是否为当前活跃图谱 */
  is_active: number;
  /** 图谱配置（JSON字符串解析后的对象） */
  settings: GraphSettings;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 图谱配置
 */
export interface GraphSettings {
  /** 节点类型配置 */
  nodeTypes?: Record<string, NodeTypeConfig>;
  /** 边类型配置 */
  edgeTypes?: Record<string, EdgeTypeConfig>;
  /** 其他自定义配置 */
  [key: string]: unknown;
}

/**
 * 节点类型配置
 */
export interface NodeTypeConfig {
  /** 节点颜色 */
  color: string;
  /** 节点形状 */
  shape: 'rect' | 'circle' | 'ellipse' | 'diamond' | 'triangle';
}

/**
 * 边类型配置
 */
export interface EdgeTypeConfig {
  /** 边颜色 */
  color: string;
  /** 边样式 */
  style: 'solid' | 'dashed' | 'dotted';
}

/**
 * 图谱节点
 */
export interface Node {
  /** 节点唯一标识符 */
  id: string;
  /** 所属图谱ID */
  graph_id: string;
  /** 节点标签/名称 */
  label: string;
  /** 节点类型 */
  type: string;
  /** 节点属性（JSON字符串解析后的对象） */
  properties: Record<string, unknown>;
  /** 节点embedding向量（可选，数据库中为字符串） */
  embedding?: string | number[] | null;
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 创建节点请求数据
 */
export interface CreateNodeData {
  /** 节点ID（可选，不提供则自动生成） */
  id?: string;
  /** 节点标签/名称 */
  label: string;
  /** 节点类型（默认'default'） */
  type?: string;
  /** 节点属性 */
  properties?: Record<string, unknown>;
  /** X坐标 */
  x?: number;
  /** Y坐标 */
  y?: number;
}

/**
 * 更新节点请求数据
 */
export interface UpdateNodeData {
  /** 节点标签/名称 */
  label?: string;
  /** 节点类型 */
  type?: string;
  /** 节点属性 */
  properties?: Record<string, unknown>;
  /** X坐标 */
  x?: number;
  /** Y坐标 */
  y?: number;
}

/**
 * 节点位置更新
 */
export interface NodePosition {
  /** 节点ID */
  id: string;
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
}

/**
 * 图谱边
 */
export interface Edge {
  /** 边唯一标识符 */
  id: string;
  /** 所属图谱ID */
  graph_id: string;
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边标签 */
  label: string;
  /** 边类型 */
  type: string;
  /** 边属性（JSON字符串解析后的对象） */
  properties: Record<string, unknown>;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 创建边请求数据
 */
export interface CreateEdgeData {
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边标签 */
  label?: string;
  /** 边类型（默认'default'） */
  type?: string;
  /** 边属性 */
  properties?: Record<string, unknown>;
}

/**
 * 更新边请求数据
 */
export interface UpdateEdgeData {
  /** 边标签 */
  label?: string;
  /** 边类型 */
  type?: string;
  /** 边属性 */
  properties?: Record<string, unknown>;
}

/**
 * 历史记录操作类型
 */
export type OperationType = 'create' | 'update' | 'delete';

/**
 * 历史记录目标类型
 */
export type TargetType = 'node' | 'edge';

/**
 * 图谱历史记录
 */
export interface HistoryRecord {
  /** 记录ID */
  id: number;
  /** 所属图谱ID */
  graph_id: string;
  /** 操作类型 */
  operation_type: OperationType;
  /** 目标类型 */
  target_type: TargetType;
  /** 目标ID */
  target_id: string;
  /** 更新前的数据（JSON字符串） */
  old_data: string | null;
  /** 更新后的数据（JSON字符串） */
  new_data: string | null;
  /** 操作时间 */
  timestamp: string;
}

/**
 * 图谱分享信息
 */
export interface GraphShare {
  /** 分享ID */
  id: string;
  /** 图谱ID */
  graph_id: string;
  /** 分享Token */
  share_token: string;
  /** 是否允许编辑 */
  allow_edit: number;
  /** 创建时间 */
  created_at: string;
  /** 过期时间 */
  expires_at: string | null;
}

/**
 * 图谱版本快照
 */
export interface GraphVersion {
  /** 版本记录ID */
  id: number;
  /** 图谱ID */
  graph_id: string;
  /** 版本号 */
  version: number;
  /** 版本名称 */
  name: string;
  /** 版本描述 */
  description: string;
  /** 快照数据（包含graph, nodes, edges） */
  snapshot: {
    graph: Graph;
    nodes: Node[];
    edges: Edge[];
  };
  /** 创建时间 */
  created_at: string;
}

/**
 * 图谱完整数据（API响应）
 */
export interface GraphData {
  /** 图谱节点列表 */
  nodes: Node[];
  /** 图谱边列表 */
  edges: Edge[];
}

/**
 * SSE流式事件类型
 */
export type StreamEventType = 'meta' | 'nodes_batch' | 'edges_batch' | 'complete' | 'error';

/**
 * SSE流式元数据事件
 */
export interface StreamMetaEvent {
  type: 'meta';
  totalNodes: number;
  totalEdges: number;
  graphName?: string;
  nodeBatchSize?: number;
  edgeBatchSize?: number;
}

/**
 * SSE节点批次事件
 */
export interface StreamNodesBatchEvent {
  type: 'nodes_batch';
  batch: Node[];
  batchIndex: number;
  totalBatches: number;
  loaded: number;
  total: number;
}

/**
 * SSE边批次事件
 */
export interface StreamEdgesBatchEvent {
  type: 'edges_batch';
  batch: Edge[];
  batchIndex: number;
  totalBatches: number;
  loaded: number;
  total: number;
}

/**
 * SSE完成事件
 */
export interface StreamCompleteEvent {
  type: 'complete';
}

/**
 * SSE错误事件
 */
export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

/**
 * SSE流式事件联合类型
 */
export type StreamEvent = StreamMetaEvent | StreamNodesBatchEvent | StreamEdgesBatchEvent | StreamCompleteEvent | StreamErrorEvent;

/**
 * 图谱Agent权限
 */
export interface GraphAgentPermission {
  /** 权限记录ID */
  id: string;
  /** 图谱ID */
  graph_id: string;
  /** Agent ID */
  agent_id: string;
  /** 权限类型 ('read' | 'write') */
  permission: 'read' | 'write';
  /** 创建者用户ID */
  created_by: string;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * Embedding向量搜索结果
 */
export interface SimilarNodeResult {
  /** 节点ID */
  node_id: string;
  /** 节点标签 */
  label: string;
  /** 节点类型 */
  type: string;
  /** 节点属性 */
  properties: Record<string, unknown>;
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
  /** 相似度分数 */
  similarity: number;
}
