import { nodeOperations } from '../../database.js';
import { queryNodes, aggregateNodes, groupByType } from '../../utils/queryParser.js';

export async function queryNodesTool(args, graphId) {
  if (!graphId) {
    return { success: false, error: '没有指定图谱ID' };
  }
  try {
    const result = await queryNodes(graphId, args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function aggregateNodesTool(args, graphId) {
  if (!graphId) {
    return { success: false, error: '没有指定图谱ID' };
  }
  try {
    const result = await aggregateNodes(graphId, args.field, args.operations, args.filters || []);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function groupByTypeTool(args, graphId) {
  if (!graphId) {
    return { success: false, error: '没有指定图谱ID' };
  }
  try {
    const result = await groupByType(graphId, args.field, args.operations);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getFieldStatsTool(graphId) {
  if (!graphId) {
    return { success: false, error: '没有指定图谱ID' };
  }
  const nodes = nodeOperations.getByGraphId(graphId);
  const fieldStats = {};
  const typeCounts = {};

  for (const node of nodes) {
    const type = node.type || 'default';
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    let properties = {};
    try {
      properties = JSON.parse(node.properties || '{}');
    } catch (e) {
      properties = {};
    }

    for (const [key, value] of Object.entries(properties)) {
      if (!fieldStats[key]) {
        fieldStats[key] = { type: typeof value, count: 0, numericStats: null };
      }
      fieldStats[key].count++;

      if (typeof value === 'number' || !isNaN(parseFloat(value))) {
        if (!fieldStats[key].numericStats) {
          fieldStats[key].numericStats = { values: [] };
        }
        fieldStats[key].numericStats.values.push(parseFloat(value));
      }
    }
  }

  for (const [key, stats] of Object.entries(fieldStats)) {
    if (stats.numericStats && stats.numericStats.values.length > 0) {
      const values = stats.numericStats.values;
      stats.numericStats = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
        count: values.length
      };
    }
  }

  return { success: true, data: { totalNodes: nodes.length, typeCounts, fields: fieldStats } };
}
