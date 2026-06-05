import { executeMCPTool } from '../../mcpClient.js';

export async function executeMCP(toolName, args) {
  return await executeMCPTool(toolName, args);
}
