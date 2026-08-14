// 配置域 API：LLM 配置 (configAPI) + MCP 状态 (mcpAPI)
import { api } from '../core.js'

// LLM 配置
export const configAPI = {
  configureLLM(config) {
    return api.post('/config/llm', config)
  },
  getLLMStatus() {
    return api.get('/config/llm/status')
  }
}

// MCP 状态
export const mcpAPI = {
  getStatus() {
    return api.get('/mcp/status')
  }
}
