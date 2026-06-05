import { agentOperations } from '../database.js';

/**
 * 检查用户是否有权限访问图谱
 * @param {Object} graph - 图谱对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否有权限
 */
export function canAccessGraph(graph, user) {
  if (!graph || !user) return false;

  // 1. 用户是图谱所有者
  if (graph.user_id === user.id) {
    return true;
  }

  // 2. 图谱是 Agent 创建的，检查该 Agent 是否属于当前用户
  if (graph.user_id && graph.user_id.startsWith('agent-')) {
    const agentId = graph.user_id;
    const agent = agentOperations.getById(agentId);
    if (agent && agent.user_id === user.id) {
      return true;  // 用户的 Agent 创建的图谱，用户可以访问
    }
  }

  return false;
}

/**
 * 检查用户是否有权限修改图谱（写权限）
 * @param {Object} graph - 图谱对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否有写权限
 */
export function canWriteGraph(graph, user) {
  // 写权限与读权限相同
  return canAccessGraph(graph, user);
}

/**
 * 检查是否为管理员
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否为管理员
 */
export function isAdmin(user) {
  return user.username === 'admin' || user.is_admin === 1;
}
