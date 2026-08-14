// API 入口：按域拆分后的统一 re-export
// - 共享基础设施与用户单例来自 ./core.js
// - 各域 API 对象定义在 ./domains/ 下，此处统一导出，保持对所有旧 import 点的向后兼容
export { getCurrentUser, setCurrentUser, onUserChange } from './core.js'
export { default } from './core.js'

export { graphsAPI, graphAPI } from './domains/graphs.js'
export { historyAPI } from './domains/history.js'
export { chatAPI } from './domains/chat.js'
export { configAPI, mcpAPI } from './domains/config.js'
export { authAPI, userLLMConfigAPI } from './domains/auth.js'
export { userAgentAPI, myAgentAPI, agentAPI, agentLogsAPI } from './domains/agent.js'
export { shareAPI } from './domains/share.js'
export { ontologyAPI, graphBuildAPI } from './domains/ontology.js'
export { logsAPI } from './domains/logs.js'
export { embeddingAPI } from './domains/embedding.js'
export { statsAPI, usageAPI, tenantAPI, plansAPI, adminAPI, graphAgentPermissionAPI } from './domains/admin.js'
