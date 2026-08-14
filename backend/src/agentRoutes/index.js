import express from 'express';
import { agentRateLimiter } from '../middleware/rateLimit.js';
import agentMgmt from './agentMgmt.js';
import graphOps from './graphOps.js';
import agentAuthMgmt from './agentAuthMgmt.js';
import admin from './admin.js';
import graphOverview from './graphOverview.js';
import pagedNodesEdges from './pagedNodesEdges.js';
import batchNodes from './batchNodes.js';
import batchEdges from './batchEdges.js';
import advancedQuery from './advancedQuery.js';
import graphAlgo from './graphAlgo.js';
import versionMgmt from './versionMgmt.js';
import workspace from './workspace.js';
import vectorSearch from './vectorSearch.js';
import agentLogs from './agentLogs.js';
import keywordSearch from './keywordSearch.js';

const router = express.Router();

// 全局 Agent API 速率限制（按 API Key 100/min，防滥用）
// 注意: /register 已挂 jwtAuth，此限流在认证之前执行，未认证请求按 IP 限流
router.use(agentRateLimiter);

// Mount all route modules
// Agent management routes: /register, /me, /rotate-key, /quota
router.use('/', agentMgmt);

// Graph operations: /graphs, /graphs/:graphId/permission
router.use('/', graphOps);

// Agent authorization CRUD for graphs: /graphs/:graphId/agents
router.use('/', agentAuthMgmt);

// Admin routes: /admin/graphs, /admin/agents, /graphs (POST)
router.use('/', admin);

// Graph overview: /graphs/:id, /graphs/:id/summary
router.use('/', graphOverview);

// Paginated nodes/edges: /graphs/:graphId/nodes, /graphs/:graphId/edges
router.use('/', pagedNodesEdges);

// Batch node operations: /graphs/:graphId/batch/nodes, /graphs/:graphId/nodes/:nodeId
router.use('/', batchNodes);

// Batch edge operations: /graphs/:graphId/batch/edges
router.use('/', batchEdges);

// Advanced query: /query/operators, /graphs/:graphId/nodes/query, /rank, /top, /aggregate
router.use('/', advancedQuery);

// Graph algorithms: /graphs/:graphId/path, /degrees, /nodes/:nodeId/neighbors
router.use('/', graphAlgo);

// Version management: /graphs/:graphId/snapshot, /versions, /rollback
router.use('/', versionMgmt);

// Workspace CRUD: /workspaces
router.use('/', workspace);

// Vector search: /graphs/:graphId/embedding/status, /compute, /search, /similar, /cluster
router.use('/', vectorSearch);

// Agent logs: /user/agents/logs
router.use('/', agentLogs);

// Keyword search: /graphs/:graphId/nodes/search
router.use('/', keywordSearch);

export default router;
