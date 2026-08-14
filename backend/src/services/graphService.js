/**
 * graphService - 图谱业务逻辑共享层（P1.1）
 *
 * 从 v1 用户侧路由（routes/v1）与 Agent 侧路由（agentRoutes）中抽取的
 * 共用业务逻辑：节点/边操作、图谱访问校验、embedding 同步。
 *
 * 设计约定：
 * - 路由层只保留：认证/权限差异（authMiddleware vs agentAuthMiddleware）、
 *   请求参数校验（如 label 非空、positions 格式）、系统特有副作用
 *   （v1 的 history/audit/log、Agent 的批量错误收集）以及响应格式。
 * - 本层返回的节点/边对象保持与 database.js 的原始行一致（properties 为 JSON 字符串），
 *   路由如需响应展示请使用 serializeNode / serializeEdge 解析 properties。
 *   —— 这样 historyOperations.add 存储的 old/new 数据与重构前完全一致。
 * - viewer 适配器：v1 传入 { kind: 'user', user: req.user }，
 *   Agent 侧传入 { kind: 'agent', agent: req.agent }。
 */

import { v4 as uuidv4 } from 'uuid';
import db, {
  graphOperations,
  nodeOperations,
  edgeOperations,
  graphAgentPermissionOperations,
  vecSearchOperations,
} from '../database.js';

// ========== 序列化辅助（路由层响应用） ==========

/** 解析节点的 properties JSON，用于响应展示 */
export function serializeNode(node) {
  if (!node) return null;
  return { ...node, properties: JSON.parse(node.properties || '{}') };
}

/** 解析边的 properties JSON，用于响应展示 */
export function serializeEdge(edge) {
  if (!edge) return null;
  return { ...edge, properties: JSON.parse(edge.properties || '{}') };
}

// ========== 图谱访问校验（viewer 适配器） ==========

/**
 * 用户 viewer 的图谱解析。
 * read: 沿用 v1 的"属主 → 管理员 → Agent 创建图谱 → 404"四步块；
 * write: 沿用 v1 写操作仅校验属主（getByIdAndUserId）的行为。
 */
function resolveUserGraph(graphId, user, mode) {
  if (mode === 'write') {
    // v1 写操作（create/update/delete/positions/search）只做属主校验
    return graphOperations.getByIdAndUserId(graphId, user.id);
  }

  // v1 读操作四步块
  let graph = graphOperations.getByIdAndUserId(graphId, user.id);
  const isAdmin = user.username === 'admin' || user.is_admin === 1;
  if (!graph && !isAdmin) {
    const anyGraph = graphOperations.getById(graphId);
    if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
      graph = anyGraph;
    }
  }
  if (!graph && isAdmin) {
    graph = graphOperations.getById(graphId);
  }
  return graph;
}

/**
 * Agent viewer 的图谱解析：getById + hasAccess / hasWriteAccess。
 */
function resolveAgentGraph(graphId, agent, mode) {
  const graph = graphOperations.getById(graphId);
  if (!graph) return null;
  const ok = mode === 'write'
    ? graphAgentPermissionOperations.hasWriteAccess(agent.id, graphId)
    : graphAgentPermissionOperations.hasAccess(agent.id, graphId);
  return ok ? graph : null;
}

/**
 * 统一图谱访问校验入口。
 * @param {string} graphId
 * @param {{kind: 'user', user: object} | {kind: 'agent', agent: object}} viewer
 * @param {'read'|'write'} mode
 * @returns {{graph: object} | {error: {status: number, message: string, code: string}}}
 */
function resolveGraphAccess(graphId, viewer, mode) {
  if (viewer.kind === 'agent') {
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return { error: { status: 404, message: '图谱不存在', code: 'GRAPH_NOT_FOUND' } };
    }
    const ok = mode === 'write'
      ? graphAgentPermissionOperations.hasWriteAccess(viewer.agent.id, graphId)
      : graphAgentPermissionOperations.hasAccess(viewer.agent.id, graphId);
    if (!ok) {
      return { error: { status: 403, message: '没有权限访问此图谱', code: 'GRAPH_ACCESS_DENIED' } };
    }
    return { graph };
  }

  const graph = resolveUserGraph(graphId, viewer.user, mode);
  if (!graph) {
    // v1 侧无权限与不存在均按 404 处理（避免泄露图谱存在性）
    return { error: { status: 404, message: '图谱不存在', code: 'GRAPH_NOT_FOUND' } };
  }
  return { graph };
}

/** 校验 viewer 是否可读该图谱 */
export function assertGraphReadable(graphId, viewer) {
  return resolveGraphAccess(graphId, viewer, 'read');
}

/** 校验 viewer 是否可写该图谱 */
export function assertGraphWritable(graphId, viewer) {
  return resolveGraphAccess(graphId, viewer, 'write');
}

// ========== 节点操作 ==========

/**
 * 分页/过滤/排序节点列表。
 * @param {string} graphId
 * @param {object} [options]
 * @param {number} [options.page] 已解析的页码；与 limit 同时提供才分页（v1 语义）
 * @param {number} [options.limit] 已解析的每页数量（上限 500 由路由层解析时约束）
 * @param {string} [options.type] 按类型过滤
 * @param {string} [options.sort] 排序字段：label | type | created_at（v1 语义）
 * @param {string} [options.order] asc | desc
 * @returns {{nodes: object[], total: number, pagination: object|null}}
 */
export function listNodes(graphId, options = {}) {
  const { page, limit, type, sort, order } = options;

  let nodes = nodeOperations.getByGraphId(graphId);

  // 按类型过滤
  if (type) {
    nodes = nodes.filter(n => n.type === type);
  }

  // 排序（与 v1 现状一致：label / type / created_at）
  if (sort) {
    const sortOrder = order === 'asc' ? 1 : -1;
    nodes.sort((a, b) => {
      let valA, valB;
      switch (sort) {
        case 'label':
          valA = (a.label || '').toLowerCase();
          valB = (b.label || '').toLowerCase();
          break;
        case 'type':
          valA = a.type || '';
          valB = b.type || '';
          break;
        case 'created_at':
        default:
          valA = new Date(a.created_at || 0).getTime();
          valB = new Date(b.created_at || 0).getTime();
      }
      return sortOrder === 1 ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }

  const total = nodes.length;

  // 分页处理（仅当 page 与 limit 同时提供）
  let pagination = null;
  let pageNodes = nodes;
  if (page !== undefined && limit !== undefined) {
    const offset = (page - 1) * limit;
    pageNodes = nodes.slice(offset, offset + limit);
    pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  return {
    nodes: pageNodes.map(n => serializeNode(n)),
    total,
    pagination
  };
}

/** 获取单个节点（解析 properties），不存在或不属于该图谱返回 null */
export function getNode(graphId, nodeId) {
  const node = nodeOperations.getById(nodeId);
  if (!node || node.graph_id !== graphId) return null;
  return serializeNode(node);
}

/**
 * 创建节点。返回原始行（properties 为 JSON 字符串）。
 * id 缺省时自动生成；x/y 缺省时由 createForGraph 生成随机位置。
 */
export function createNode(graphId, data = {}) {
  const newNode = nodeOperations.createForGraph({
    id: data.id || uuidv4(),
    label: data.label,
    type: data.type || 'default',
    properties: data.properties || {},
    x: data.x,
    y: data.y
  }, graphId);
  return newNode;
}

/**
 * 更新节点。节点不存在或不属于该图谱返回 null。
 * @returns {{oldNode: object, updatedNode: object}|null} 原始行
 */
export function updateNode(graphId, nodeId, data) {
  const oldNode = nodeOperations.getById(nodeId);
  if (!oldNode || oldNode.graph_id !== graphId) return null;
  const updatedNode = nodeOperations.update(nodeId, data);
  if (!updatedNode) return null;
  return { oldNode, updatedNode };
}

/**
 * 删除节点（同步从向量索引移除）。返回被删除的原始行，不存在返回 null。
 */
export function deleteNode(graphId, nodeId) {
  const node = nodeOperations.getById(nodeId);
  if (!node || node.graph_id !== graphId) return null;

  // 从向量索引中移除（尽力而为）
  try {
    vecSearchOperations.removeFromIndex(nodeId);
  } catch (e) {
    // 忽略索引移除失败，继续删除
  }

  return nodeOperations.delete(nodeId);
}

/** 关键词搜索节点（LIKE），返回解析 properties 后的列表 */
export function searchNodes(graphId, keyword) {
  return nodeOperations.searchByGraphId(graphId, keyword).map(n => serializeNode(n));
}

/** 批量更新节点位置 */
export function updateNodePositions(graphId, positions) {
  nodeOperations.updatePositions(graphId, positions);
  return true;
}

// ========== 边操作 ==========

/**
 * 分页/过滤边列表（v1 无分页参数时返回全量数组）。
 * @param {string} graphId
 * @param {object} [options]
 * @param {number} [options.page] 已解析页码；与 limit 同时提供才分页
 * @param {number} [options.limit] 已解析每页数量
 * @param {string} [options.type] 按类型过滤
 * @returns {{edges: object[], total: number, pagination: object|null}}
 */
export function listEdges(graphId, options = {}) {
  const { page, limit, type } = options;

  let edges = edgeOperations.getByGraphId(graphId);

  if (type) {
    edges = edges.filter(e => e.type === type);
  }

  const total = edges.length;

  let pagination = null;
  let pageEdges = edges;
  if (page !== undefined && limit !== undefined) {
    const offset = (page - 1) * limit;
    pageEdges = edges.slice(offset, offset + limit);
    pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  return {
    edges: pageEdges.map(e => serializeEdge(e)),
    total,
    pagination
  };
}

/**
 * 创建边（校验源/目标节点属于该图谱）。
 * @returns {{edge: object, sourceNode: object, targetNode: object}
 *          | {error: {missing: 'source'|'target'}}}
 */
export function createEdge(graphId, data = {}) {
  const sourceNode = nodeOperations.getById(data.source);
  const targetNode = nodeOperations.getById(data.target);

  const sourceOk = sourceNode && sourceNode.graph_id === graphId;
  const targetOk = targetNode && targetNode.graph_id === graphId;

  if (!sourceOk) return { error: { missing: 'source' } };
  if (!targetOk) return { error: { missing: 'target' } };

  const newEdge = edgeOperations.createForGraph({
    id: data.id || uuidv4(),
    source: data.source,
    target: data.target,
    label: data.label || '',
    type: data.type || 'default',
    properties: data.properties || {}
  }, graphId);

  return { edge: newEdge, sourceNode, targetNode };
}

/**
 * 更新边。边不存在或不属于该图谱返回 null。
 * @returns {{oldEdge: object, updatedEdge: object}|null} 原始行
 */
export function updateEdge(graphId, edgeId, data) {
  const oldEdge = edgeOperations.getById(edgeId);
  if (!oldEdge || oldEdge.graph_id !== graphId) return null;
  const updatedEdge = edgeOperations.update(edgeId, data);
  if (!updatedEdge) return null;
  return { oldEdge, updatedEdge };
}

/** 删除边。返回被删除的原始行，不存在返回 null */
export function deleteEdge(graphId, edgeId) {
  const oldEdge = edgeOperations.getById(edgeId);
  if (!oldEdge || oldEdge.graph_id !== graphId) return null;
  return edgeOperations.delete(edgeId);
}

// ========== Embedding 同步 ==========

/**
 * 单事务同步 embedding 双份存储：
 *   1. 更新 nodes.embedding（JSON 列，供展示）
 *   2. 同步 vec_nodes（sqlite-vec 虚拟表，供向量查询）
 *
 * 此前调用方分别调用 nodeOperations.batchUpdateEmbeddings() 与
 * vecSearchOperations.batchAddToIndex()（两个独立事务），现在用
 * db.transaction() 包裹为单个事务（P1.3）。
 *
 * @param {string} graphId
 * @param {Array<{id: string, embedding: number[]}>} updateData
 * @param {object} [options]
 * @returns {number} 成功同步的节点数
 */
export function syncEmbeddings(graphId, updateData, options = {}) {
  const items = (updateData || []).filter(item => item && item.embedding);
  if (items.length === 0) return 0;

  const sync = db.transaction(() => {
    nodeOperations.batchUpdateEmbeddings(graphId, items);

    const vecItems = items.map(item => ({
      nodeId: item.id,
      embedding: item.embedding
    }));
    vecSearchOperations.batchAddToIndex(graphId, vecItems);
  });

  sync();
  return items.length;
}
