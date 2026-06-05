# 类型定义迁移指南 / TypeScript Migration Guide

## 概述 / Overview

本项目已添加 TypeScript 类型定义文件，为前后端代码提供类型安全保障。

Type definitions have been added to provide type safety for both frontend and backend code.

## 文件结构 / File Structure

```
backend/src/types/
├── index.d.ts      # 类型索引
├── graph.d.ts      # 图谱相关类型
├── user.d.ts       # 用户/Agent相关类型
└── api.d.ts        # API请求/响应类型

frontend/src/types/
├── index.ts        # 类型索引
├── graph.ts        # 图谱相关类型
└── api.ts          # API相关类型
```

## 后端类型 / Backend Types

### graph.d.ts
- `Graph` - 图谱基本信息
- `Node` - 图谱节点
- `Edge` - 图谱边
- `GraphSettings` - 图谱配置
- `CreateNodeData` / `UpdateNodeData` - 节点操作数据
- `CreateEdgeData` / `UpdateEdgeData` - 边操作数据
- `StreamEvent` - SSE流式事件类型

### user.d.ts
- `User` / `PublicUser` - 用户类型
- `Agent` - Agent类型
- `UserLLMConfig` - LLM配置
- `Workspace` - 工作空间
- `TokenPayload` - JWT Payload

### api.d.ts
- `ApiResponse<T>` - 通用API响应
- `PaginatedResponse<T>` - 分页响应
- `ChatTypes.Message` - 聊天消息
- `OntologyTypes.OntologyDefinition` - 本体定义

## 前端类型 / Frontend Types

### graph.ts
- `Graph` - 图谱类型
- `GraphNode` - 节点类型
- `GraphEdge` - 边类型
- `GraphData` - 图谱完整数据
- `GraphMode` - 渲染模式类型
- `NodePosition` - 节点位置
- `PaginationParams` - 分页参数

### api.ts
- `PublicUser` - 用户公开信息
- `ChatMessage` - 聊天消息
- `Agent` / `UserAgent` - Agent类型
- `EmbeddingStatus` - Embedding状态
- `UsageStats` - 使用量统计

## 使用示例 / Usage Examples

### 后端使用 / Backend Usage

```typescript
// database.js
import type { Graph, Node, Edge } from './types/graph.js';

function getGraphData(graphId: string): { nodes: Node[]; edges: Edge[] } {
  // ...
}
```

```typescript
// auth.js
import type { TokenPayload } from './types/user.js';

function verifyToken(token: string): TokenPayload | null {
  // ...
}
```

### 前端使用 / Frontend Usage

```typescript
// api/index.js
import type { Graph, GraphNode, GraphEdge } from './types/graph';
import type { PublicUser, ChatMessage } from './types/api';

interface GraphAPI {
  getGraph(graphId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  createNode(graphId: string, data: CreateNodeParams): Promise<GraphNode>;
}
```

## 命名差异 / Naming Differences

后端和前端类型命名存在一些差异，以适应各自生态：

| 后端 / Backend | 前端 / Frontend | 说明 / Note |
|----------------|-----------------|-------------|
| `Node` | `GraphNode` | 避免与HTML节点混淆 |
| `Edge` | `GraphEdge` | 明确图谱边类型 |
| `GraphData` | `GraphData` | 相同 |
| `User` | `PublicUser` | 前端仅暴露公开信息 |

## 添加JSDoc / Adding JSDoc

类型文件已包含完整的JSDoc注释，支持IDE智能提示：

```typescript
/**
 * 图谱节点
 * @interface GraphNode
 * @property {string} id - 节点唯一标识符
 * @property {string} label - 节点标签/名称
 * @property {Record<string, unknown>} properties - 节点属性
 */
```

## 后续步骤 / Next Steps

1. **配置TypeScript** - 在 `backend` 和 `frontend` 添加 `tsconfig.json`
2. **渐进式迁移** - 逐步将 `.js` 文件重命名为 `.ts`
3. **添加类型检查** - 在CI/CD中添加类型检查步骤
4. **完善类型** - 根据实际使用情况补充更多类型定义

## 配置示例 / Configuration Example

### backend/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowJs": true,
    "checkJs": true,
    "declaration": true,
    "outDir": "./dist",
    "strict": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### frontend/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "declaration": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 参考资源 / Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [JSDoc Reference](https://jsdoc.app/)
- [Vue 3 + TypeScript Guide](https://vuejs.org/guide/typescript/overview.html)
