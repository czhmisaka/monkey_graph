import { agentOperations, graphOperations } from '../database.js';

/**
 * 检查用户是否有权限访问图谱
 * @param {Object} graph - 图谱对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否有权限
 */
export function canAccessGraph(graph, user) {
  if (!graph || !user) return false;

  // 1. 管理员
  if (user.is_admin === 1) return true;

  // 2. 用户是图谱所有者
  if (graph.user_id === user.id) return true;

  // 3. 图谱是 Agent 创建的,检查该 Agent 是否属于当前用户
  if (graph.user_id && graph.user_id.startsWith('agent-')) {
    const agent = agentOperations.getById(graph.user_id);
    if (agent && agent.user_id === user.id) return true;
  }

  return false;
}

/**
 * 检查用户是否有权限修改图谱（写权限）
 */
export function canWriteGraph(graph, user) {
  return canAccessGraph(graph, user);
}

/**
 * 检查是否为管理员（统一从数据库字段读取,不再硬编码 username）
 */
export function isAdmin(user) {
  return user?.is_admin === 1;
}

/**
 * Express 路由级断言: 验证 req.user 对 graphId 的读写权限
 * - 失败时直接 res.status(...).json(...) 并返回 null
 * - 成功时返回 graph 对象
 */
export function assertGraphAccess(req, res, graphId) {
  const graph = graphOperations.getById(graphId);
  if (!graph) {
    res.status(404).json({ error: '图谱不存在' });
    return null;
  }
  if (!canAccessGraph(graph, req.user)) {
    res.status(403).json({ error: '无权访问此图谱' });
    return null;
  }
  return graph;
}