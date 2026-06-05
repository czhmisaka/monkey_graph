import { v4 as uuidv4 } from 'uuid';
import { nodeOperations, edgeOperations, historyOperations } from '../../database.js';

export async function addNode(args, graphId) {
  const nodeId = uuidv4();
  const newNode = nodeOperations.createForGraph({
    id: nodeId,
    label: args.label,
    type: args.type || 'default',
    properties: args.properties || {}
  }, graphId);
  historyOperations.add(graphId, 'create', 'node', newNode.id, null, newNode);
  return { success: true, data: newNode };
}

export async function addEdge(args, graphId) {
  const edgeId = uuidv4();
  const sourceNode = nodeOperations.getById(args.source);
  const targetNode = nodeOperations.getById(args.target);
  if (!sourceNode || !targetNode) {
    return { success: false, error: '源节点或目标节点不存在' };
  }
  if (sourceNode.graph_id !== graphId || targetNode.graph_id !== graphId) {
    return { success: false, error: '源节点或目标节点不属于当前图谱' };
  }
  const newEdge = edgeOperations.createForGraph({
    id: edgeId,
    source: args.source,
    target: args.target,
    label: args.label || '',
    type: args.type || 'default'
  }, graphId);
  historyOperations.add(graphId, 'create', 'edge', newEdge.id, null, newEdge);
  return { success: true, data: newEdge };
}

export async function updateNode(args, graphId) {
  const oldNode = nodeOperations.getById(args.id);
  if (!oldNode) return { success: false, error: '节点不存在' };
  if (oldNode.graph_id !== graphId) {
    return { success: false, error: '节点不属于当前图谱' };
  }
  const updatedNode = nodeOperations.update(args.id, args);
  historyOperations.add(graphId, 'update', 'node', args.id, oldNode, updatedNode);
  return { success: true, data: updatedNode };
}

export async function deleteNode(args, graphId) {
  const oldNode = nodeOperations.getById(args.id);
  if (!oldNode) return { success: false, error: '节点不存在' };
  if (oldNode.graph_id !== graphId) {
    return { success: false, error: '节点不属于当前图谱' };
  }
  nodeOperations.delete(args.id);
  historyOperations.add(graphId, 'delete', 'node', args.id, oldNode, null);
  return { success: true, data: oldNode };
}

export async function deleteEdge(args, graphId) {
  const oldEdge = edgeOperations.getById(args.id);
  if (!oldEdge) return { success: false, error: '边不存在' };
  if (oldEdge.graph_id !== graphId) {
    return { success: false, error: '边不属于当前图谱' };
  }
  edgeOperations.delete(args.id);
  historyOperations.add(graphId, 'delete', 'edge', args.id, oldEdge, null);
  return { success: true, data: oldEdge };
}

export async function searchNodes(args, graphId) {
  const results = nodeOperations.searchByGraphId(graphId, args.keyword);
  const summary = results.map(n => ({ label: n.label, type: n.type }));
  return { success: true, data: { count: summary.length, results: summary } };
}

export async function getGraphInfo(graphId) {
  const nodes = nodeOperations.getByGraphId(graphId).map(n => ({
    id: n.id,
    label: n.label,
    type: n.type,
    properties: JSON.parse(n.properties || '{}')
  }));
  const edges = edgeOperations.getByGraphId(graphId).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: e.type
  }));
  return { success: true, data: { nodes, edges } };
}

export async function highlightNode(args, graphId) {
  let node = null;

  if (args.nodeId) {
    node = nodeOperations.getById(args.nodeId);
    if (!node) {
      return { success: false, error: '节点不存在' };
    }
    if (node.graph_id !== graphId) {
      return { success: false, error: '节点不属于当前图谱' };
    }
  } else if (args.keyword) {
    const searchResults = nodeOperations.searchByGraphId(graphId, args.keyword);
    if (searchResults.length === 0) {
      return { success: false, error: `未找到匹配"${args.keyword}"的节点` };
    }
    node = searchResults[0];
  } else {
    return { success: false, error: '请提供 nodeId 或 keyword 参数' };
  }

  return {
    success: true,
    data: {
      nodeId: node.id,
      label: node.label,
      type: node.type,
      matchedBy: args.keyword ? 'keyword' : 'nodeId'
    }
  };
}
