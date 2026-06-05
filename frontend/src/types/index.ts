/**
 * 前端类型定义索引
 * @module types
 *
 * @example
 * ```typescript
 * import type { Graph, GraphNode, GraphEdge } from './types/graph';
 * import type { PublicUser, ChatMessage } from './types/api';
 * ```
 */

/**
 * 图谱相关类型
 * @see {@link graph.Graph}
 * @see {@link graph.GraphNode}
 * @see {@link graph.GraphEdge}
 */
export * from './graph';

/**
 * API相关类型
 * @see {@link api.PublicUser}
 * @see {@link api.ChatMessage}
 * @see {@link api.Agent}
 */
export * from './api';
