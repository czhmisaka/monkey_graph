import * as graphTools from './graphTools.js';
import * as settingsTools from './settingsTools.js';
import * as queryTools from './queryTools.js';
import * as mcpTools from './mcpTools.js';

export async function executeTool(toolName, args, graphId, sendEvent) {
  switch (toolName) {
    // Graph tools
    case 'add_node':
      return await graphTools.addNode(args, graphId);
    case 'add_edge':
      return await graphTools.addEdge(args, graphId);
    case 'update_node':
      return await graphTools.updateNode(args, graphId);
    case 'delete_node':
      return await graphTools.deleteNode(args, graphId);
    case 'delete_edge':
      return await graphTools.deleteEdge(args, graphId);
    case 'search_nodes':
      return await graphTools.searchNodes(args, graphId);
    case 'get_graph_info':
      return await graphTools.getGraphInfo(graphId);
    case 'highlight_node':
      return await graphTools.highlightNode(args, graphId);

    // Settings tools
    case 'get_graph_settings':
      return await settingsTools.getGraphSettings(graphId);
    case 'update_graph_settings':
      return await settingsTools.updateGraphSettings(args, graphId, sendEvent);
    case 'delete_graph_settings':
      return await settingsTools.deleteGraphSettings(args, graphId);

    // Query tools
    case 'query_nodes':
      return await queryTools.queryNodesTool(args, graphId);
    case 'aggregate_nodes':
      return await queryTools.aggregateNodesTool(args, graphId);
    case 'group_by_type':
      return await queryTools.groupByTypeTool(args, graphId);
    case 'get_field_stats':
      return await queryTools.getFieldStatsTool(graphId);

    // MCP tools
    case 'web_search':
    case 'understand_image':
      return await mcpTools.executeMCP(toolName, args);

    default:
      return { success: false, error: `未知工具: ${toolName}` };
  }
}
