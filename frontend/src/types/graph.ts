/**
 * 图谱相关类型定义 - 前端
 * @module types/graph
 */

/**
 * 图谱基本信息
 */
export interface Graph {
  /** 图谱唯一标识符 */
  id: string;
  /** 所属用户ID */
  user_id: string | null;
  /** 图谱名称 */
  name: string;
  /** 图谱描述 */
  description: string;
  /** 是否为当前活跃图谱 */
  is_active: number;
  /** 图谱配置 */
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
export interface GraphNode {
  /** 节点唯一标识符 */
  id: string;
  /** 所属图谱ID */
  graph_id: string;
  /** 节点标签/名称 */
  label: string;
  /** 节点类型 */
  type: string;
  /** 节点属性 */
  properties: Record<string, unknown>;
  /** 节点embedding向量 */
  embedding?: number[] | null;
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
 * 图谱边
 */
export interface GraphEdge {
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
  /** 边属性 */
  properties: Record<string, unknown>;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 图谱完整数据
 */
export interface GraphData {
  /** 节点列表 */
  nodes: GraphNode[];
  /** 边列表 */
  edges: GraphEdge[];
}

/**
 * 图谱模式
 */
export type GraphMode = 'force' | 'radial' | 'three';

/**
 * 图谱渲染模式常量
 */
export const GRAPH_MODES = {
  FORCE: 'force' as GraphMode,
  RADIAL: 'radial' as GraphMode,
  THREE: 'three' as GraphMode,
};

/**
 * 节点数量阈值
 */
export const NODE_COUNT_THRESHOLD = 4000;

/**
 * 获取图谱渲染模式
 * @param nodeCount - 节点数量
 * @returns 推荐使用的渲染模式
 */
export function getGraphMode(nodeCount: number): GraphMode {
  if (nodeCount >= NODE_COUNT_THRESHOLD) {
    return GRAPH_MODES.RADIAL;
  }
  return GRAPH_MODES.FORCE;
}

/**
 * 节点位置
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
 * 节点批次事件
 */
export interface NodesBatchEvent {
  /** 批次类型 */
  type: 'nodes';
  /** 节点批次 */
  batch: GraphNode[];
  /** 当前已加载数 */
  loaded: number;
  /** 总数 */
  total: number;
}

/**
 * 边批次事件
 */
export interface EdgesBatchEvent {
  /** 批次类型 */
  type: 'edges';
  /** 边批次 */
  batch: GraphEdge[];
  /** 当前已加载数 */
  loaded: number;
  /** 总数 */
  total: number;
}

/**
 * 流式加载进度回调
 */
export type ProgressCallback = (loaded: number, total: number, type: 'nodes' | 'edges') => void;

/**
 * 流式加载批次回调
 */
export type BatchCallback = (data: NodesBatchEvent | EdgesBatchEvent) => void;

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
  allow_edit: boolean;
  /** 创建时间 */
  created_at: string;
  /** 过期时间 */
  expires_at: string | null;
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
 * 历史记录
 */
export interface HistoryRecord {
  /** 操作类型 */
  operation_type: OperationType;
  /** 目标类型 */
  target_type: TargetType;
  /** 目标ID */
  target_id: string;
  /** 旧数据 */
  old_data: unknown;
  /** 新数据 */
  new_data: unknown;
  /** 操作时间 */
  timestamp: string;
}

/**
 * Embedding搜索结果
 */
export interface SimilarNode {
  /** 节点ID */
  node_id: string;
  /** 节点标签 */
  label: string;
  /** 节点类型 */
  type: string;
  /** 相似度 */
  similarity: number;
  /** 节点属性 */
  properties: Record<string, unknown>;
  /** 位置 */
  x: number;
  y: number;
}

/**
 * 聚类结果
 */
export interface ClusterResult {
  /** 聚类数量 */
  k: number;
  /** 聚类标签 */
  labels: Record<string, number>;
}

/**
 * 创建节点参数
 */
export interface CreateNodeParams {
  /** 节点标签 */
  label: string;
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
 * 更新节点参数
 */
export interface UpdateNodeParams {
  /** 节点标签 */
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
 * 创建边参数
 */
export interface CreateEdgeParams {
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边标签 */
  label?: string;
  /** 边类型 */
  type?: string;
  /** 边属性 */
  properties?: Record<string, unknown>;
}

/**
 * 更新边参数
 */
export interface UpdateEdgeParams {
  /** 边标签 */
  label?: string;
  /** 边类型 */
  type?: string;
  /** 边属性 */
  properties?: Record<string, unknown>;
}

/**
 * 节点搜索结果
 */
export interface NodeSearchResult {
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
  /** 节点列表 */
  nodes: GraphNode[];
}

/**
 * 分页参数
 */
export interface PaginationParams {
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段 */
  sort?: string;
  /** 排序方向 */
  order?: 'asc' | 'desc';
}

/**
 * 图谱统计数据
 */
export interface GraphStats {
  /** 总节点数 */
  totalNodes: number;
  /** 总边数 */
  totalEdges: number;
  /** 节点类型分布 */
  nodeTypeDistribution: Record<string, number>;
  /** 边类型分布 */
  edgeTypeDistribution: Record<string, number>;
}
