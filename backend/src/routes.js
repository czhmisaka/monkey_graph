import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db, { graphOperations, nodeOperations, edgeOperations, historyOperations, userOperations, userLLMConfigOperations, graphShareOperations, userAgentOperations, agentOperations, graphAgentPermissionOperations } from './database.js';
import { chat, initOpenAI, getOpenAIClient, isLLMConfigured, tools } from './llmService.js';
import { authMiddleware, generateToken } from './auth.js';
import { agentAuthMiddleware } from './agentAuth.js';
import { FileParser } from './utils/fileParser.js';
import { TextProcessor } from './services/textProcessor.js';
import { OntologyGenerator } from './services/ontologyGenerator.js';
import { LocalGraphBuilder } from './services/localGraphBuilder.js';
import { TaskManager, TaskStatus } from './tasks/taskManager.js';
import { 
  getEmbedding, 
  getEmbeddings, 
  getEmbeddingsInBatches,
  findSimilarNodes, 
  filterBySimilarityThreshold,
  kMeansClustering, 
  dbscanClustering,
  computeVectorStats,
  nodeToEmbeddingText,
  isEmbeddingServiceAvailable,
  getEmbeddingConfig,
  getVectorConfig,
  updateVectorConfig,
  autoDetectDimensions,
  exportVectorsToJSON,
  importVectorsFromJSON,
  computeMissingEmbeddings,
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  manhattanDistance,
  computeSimilarity,
  SimilarityMetric
} from './services/embeddingService.js';

import { vecSearchOperations } from './database.js';
import { getCurrentModel } from './llmService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getLogFiles, readLogFile, getRecentLogs, clearLogs, logger, requestLogger, auditLogger } from './logger.js';
import { 
  queryNodes as doQueryNodes, 
  aggregateNodes as doAggregateNodes, 
  groupByType as doGroupByType,
  OPERATORS,
  AGGREGATE_OPERATIONS
} from './utils/queryParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========== 权限辅助函数 ==========

/**
 * 检查用户是否有权限访问图谱
 * @param {Object} graph - 图谱对象
 * @param {Object} user - 用户对象
 * @returns {boolean} 是否有权限
 */
function canAccessGraph(graph, user) {
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
function canWriteGraph(graph, user) {
  // 写权限与读权限相同
  return canAccessGraph(graph, user);
}

// 配置 multer 用于文件上传
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB 限制
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.md', '.markdown', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，仅支持 PDF、MD、TXT'));
    }
  }
});

const router = express.Router();

// ========== Agent 专用细粒度接口（需要认证）==========

/**
 * 双重认证中间件包装器
 * 支持用户认证和 Agent 认证
 */
function dualAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Agent ')) {
    return agentAuthMiddleware(req, res, next);
  } else {
    return authMiddleware(req, res, next);
  }
}

/**
 * Agent 节点分页查询
 * GET /api/agent/graphs/:graphId/nodes/paged
 * 
 * 查询参数:
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 100，最大 500）
 * - type: 节点类型过滤（可选）
 * - search: 标签模糊搜索（可选）
 * 
 * 用途: Agent 分批获取节点，避免全量加载
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.get('/agent/graphs/:graphId/nodes/paged', dualAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, type, search } = req.query;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 100));
    const offset = (pageNum - 1) * limitNum;
    
    // 获取所有节点并分页
    let allNodes = nodeOperations.getByGraphId(graphId);
    const total = allNodes.length;
    
    // 按类型过滤
    if (type) {
      allNodes = allNodes.filter(n => n.type === type);
    }
    
    // 按搜索关键词过滤
    if (search) {
      const keyword = search.toLowerCase();
      allNodes = allNodes.filter(n => 
        n.label?.toLowerCase().includes(keyword) ||
        n.properties?.toLowerCase().includes(keyword)
      );
    }
    
    const filteredTotal = allNodes.length;
    const totalPages = Math.ceil(filteredTotal / limitNum);
    const pagedNodes = allNodes.slice(offset, offset + limitNum);
    
    // 排除 embedding 字段以节省带宽
    res.json({
      success: true,
      data: {
        nodes: pagedNodes.map(n => {
          const { embedding, ...nodeWithoutEmbedding } = n;
          return {
            ...nodeWithoutEmbedding,
            properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
          };
        }),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: filteredTotal,
          totalPages,
          hasMore: pageNum < totalPages
        }
      }
    });
  } catch (error) {
    console.error('[Agent Nodes Paged] 分页查询失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Agent 边分页查询
 * GET /api/agent/graphs/:graphId/edges/paged
 * 
 * 查询参数:
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 100，最大 500）
 * - type: 边类型过滤（可选）
 * - sourceId: 源节点ID过滤（可选）
 * - targetId: 目标节点ID过滤（可选）
 * 
 * 用途: Agent 分批获取边，避免全量加载
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.get('/agent/graphs/:graphId/edges/paged', dualAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, type, sourceId, targetId } = req.query;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 100));
    const offset = (pageNum - 1) * limitNum;
    
    // 获取所有边并分页
    let allEdges = edgeOperations.getByGraphId(graphId);
    const total = allEdges.length;
    
    // 按类型过滤
    if (type) {
      allEdges = allEdges.filter(e => e.type === type);
    }
    
    // 按源节点过滤
    if (sourceId) {
      allEdges = allEdges.filter(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        return src === sourceId;
      });
    }
    
    // 按目标节点过滤
    if (targetId) {
      allEdges = allEdges.filter(e => {
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        return tgt === targetId;
      });
    }
    
    const filteredTotal = allEdges.length;
    const totalPages = Math.ceil(filteredTotal / limitNum);
    const pagedEdges = allEdges.slice(offset, offset + limitNum);
    
    res.json({
      success: true,
      data: {
        edges: pagedEdges.map(e => ({
          ...e,
          properties: JSON.parse(e.properties || '{}')
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: filteredTotal,
          totalPages,
          hasMore: pageNum < totalPages
        }
      }
    });
  } catch (error) {
    console.error('[Agent Edges Paged] 分页查询失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Agent 批量获取指定节点
 * POST /api/agent/graphs/:graphId/nodes/batch
 * 
 * 请求体: { nodeIds: string[] }
 * 
 * 用途: Agent 根据之前获取的上下文，批量获取特定节点详情
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.post('/agent/graphs/:graphId/nodes/batch', dualAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodeIds } = req.body;
    
    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return res.status(400).json({ error: '请提供有效的节点ID列表' });
    }
    
    // 限制批量大小
    const limitedIds = nodeIds.slice(0, 200);
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 批量获取节点（排除 embedding 字段以减少响应大小）
    const nodes = limitedIds.map(id => nodeOperations.getById(id))
      .filter(n => n && n.graph_id === graphId)
      .map(n => {
        const { embedding, ...nodeWithoutEmbedding } = n;
        return {
          ...nodeWithoutEmbedding,
          properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
        };
      });
    
    res.json({
      success: true,
      data: {
        nodes,
        count: nodes.length,
        requested: limitedIds.length
      }
    });
  } catch (error) {
    console.error('[Agent Nodes Batch] 批量获取失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Agent 批量获取指定边
 * POST /api/agent/graphs/:graphId/edges/batch
 * 
 * 请求体: { edgeIds: string[] }
 * 
 * 用途: Agent 根据之前获取的上下文，批量获取特定边详情
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.post('/agent/graphs/:graphId/edges/batch', dualAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { edgeIds } = req.body;
    
    if (!edgeIds || !Array.isArray(edgeIds) || edgeIds.length === 0) {
      return res.status(400).json({ error: '请提供有效的边ID列表' });
    }
    
    // 限制批量大小
    const limitedIds = edgeIds.slice(0, 200);
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 批量获取边
    const edges = limitedIds.map(id => edgeOperations.getById(id))
      .filter(e => e && e.graph_id === graphId)
      .map(e => ({
        ...e,
        properties: JSON.parse(e.properties || '{}')
      }));
    
    res.json({
      success: true,
      data: {
        edges,
        count: edges.length,
        requested: limitedIds.length
      }
    });
  } catch (error) {
    console.error('[Agent Edges Batch] 批量获取失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Agent 流式边查询（SSE）
 * GET /api/agent/graphs/:graphId/edges/stream
 * 
 * 查询参数:
 * - limit: 每批数量（默认 200）
 * - offset: 起始偏移（默认 0）
 * 
 * 用途: Agent 流式获取边，支持断点续传
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.get('/agent/graphs/:graphId/edges/stream', dualAuthMiddleware, async (req, res) => {
  const { graphId } = req.params;
  const { limit = 200, offset = 0 } = req.query;
  
  try {
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const batchSize = Math.min(500, Math.max(1, parseInt(limit) || 200));
    const startOffset = Math.max(0, parseInt(offset) || 0);
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // 获取所有边
    const allEdges = edgeOperations.getByGraphId(graphId);
    const total = allEdges.length;
    
    // 发送元数据
    sendEvent({
      type: 'meta',
      total,
      offset: startOffset,
      batchSize
    });
    
    // 分批发送
    for (let i = startOffset; i < allEdges.length; i += batchSize) {
      const batch = allEdges.slice(i, i + batchSize).map(e => ({
        ...e,
        properties: JSON.parse(e.properties || '{}')
      }));
      
      sendEvent({
        type: 'batch',
        batch,
        offset: i,
        loaded: Math.min(i + batchSize, total),
        total
      });
      
      // 如果还有更多数据，等待一下避免阻塞
      if (i + batchSize < allEdges.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // 发送完成事件
    sendEvent({ type: 'complete' });
    res.end();
  } catch (error) {
    console.error('[Agent Edges Stream] 流式查询失败:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

/**
 * Agent 获取节点统计信息
 * GET /api/agent/graphs/:graphId/stats
 * 
 * 用途: Agent 快速了解图谱规模，避免加载全量数据
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.get('/agent/graphs/:graphId/stats', dualAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取统计信息
    const nodes = nodeOperations.getByGraphId(graphId);
    const edges = edgeOperations.getByGraphId(graphId);
    
    // 节点类型分布
    const nodeTypeStats = {};
    nodes.forEach(n => {
      const type = n.type || 'default';
      nodeTypeStats[type] = (nodeTypeStats[type] || 0) + 1;
    });
    
    // 边类型分布
    const edgeTypeStats = {};
    edges.forEach(e => {
      const type = e.type || 'default';
      edgeTypeStats[type] = (edgeTypeStats[type] || 0) + 1;
    });
    
    // 节点度数统计
    const degreeCount = {};
    const nodeDegreeMap = {};
    edges.forEach(e => {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      nodeDegreeMap[src] = (nodeDegreeMap[src] || 0) + 1;
      nodeDegreeMap[tgt] = (nodeDegreeMap[tgt] || 0) + 1;
    });
    
    const degrees = Object.values(nodeDegreeMap);
    const degreeStats = {
      min: degrees.length ? Math.min(...degrees) : 0,
      max: degrees.length ? Math.max(...degrees) : 0,
      avg: degrees.length ? (degrees.reduce((a, b) => a + b, 0) / degrees.length).toFixed(2) : 0
    };
    
    res.json({
      success: true,
      data: {
        graph: {
          id: graph.id,
          name: graph.name
        },
        stats: {
          nodes: {
            total: nodes.length,
            byType: nodeTypeStats,
            degree: degreeStats
          },
          edges: {
            total: edges.length,
            byType: edgeTypeStats
          }
        }
      }
    });
  } catch (error) {
    console.error('[Agent Stats] 获取统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Agent 获取节点的所有邻居
 * GET /api/agent/graphs/:graphId/nodes/:nodeId/neighbors
 * 
 * 查询参数:
 * - depth: 邻居深度（默认 1，最大 2）
 * - direction: 方向 (out/in/both，默认 both)
 * 
 * 用途: Agent 获取某个节点的关联上下文
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.get('/agent/graphs/:graphId/nodes/:nodeId/neighbors', (req, res, next) => {
  // 检查认证类型并应用相应的中间件
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Agent ')) {
    // Agent 认证
    return agentAuthMiddleware(req, res, next);
  } else {
    // 用户认证
    return authMiddleware(req, res, next);
  }
}, (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { depth = 1, direction = 'both' } = req.query;
    
    const maxDepth = Math.min(3, Math.max(1, parseInt(depth) || 1));
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 验证节点是否存在
    const targetNode = nodeOperations.getById(nodeId);
    if (!targetNode || targetNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }
    
    // 获取所有边
    const allEdges = edgeOperations.getByGraphId(graphId);
    
    // 构建邻居索引
    const neighbors = new Map(); // nodeId -> { node, edges }
    
    // BFS 遍历
    const queue = [{ nodeId, depth: 0 }];
    const visited = new Set([nodeId]);
    
    while (queue.length > 0) {
      const { nodeId: currentId, depth: currentDepth } = queue.shift();
      
      if (currentDepth >= maxDepth) continue;
      
      // 找所有与当前节点相关的边
      for (const edge of allEdges) {
        const src = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const tgt = typeof edge.target === 'object' ? edge.target.id : edge.target;
        
        let neighborId = null;
        let isOutgoing = false;
        
        if (src === currentId && (direction === 'out' || direction === 'both')) {
          neighborId = tgt;
          isOutgoing = true;
        } else if (tgt === currentId && (direction === 'in' || direction === 'both')) {
          neighborId = src;
          isOutgoing = false;
        }
        
        if (neighborId && !visited.has(neighborId)) {
          visited.add(neighborId);
          
          const neighborNode = nodeOperations.getById(neighborId);
          if (neighborNode) {
            if (!neighbors.has(neighborId)) {
              // 排除 embedding 字段
              const { embedding, ...nodeWithoutEmbedding } = neighborNode;
              neighbors.set(neighborId, {
                node: {
                  ...nodeWithoutEmbedding,
                  properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
                },
                edges: [],
                distance: currentDepth + 1
              });
            }
            
            neighbors.get(neighborId).edges.push({
              ...edge,
              properties: JSON.parse(edge.properties || '{}'),
              isOutgoing
            });
            
            queue.push({ nodeId: neighborId, depth: currentDepth + 1 });
          }
        }
      }
    }
    
    // 排除 targetNode 的 embedding 字段
    const { embedding, ...centerWithoutEmbedding } = targetNode;
    res.json({
      success: true,
      data: {
        center: {
          ...centerWithoutEmbedding,
          properties: JSON.parse(centerWithoutEmbedding.properties || '{}')
        },
        neighbors: Array.from(neighbors.values()),
        stats: {
          total: neighbors.size,
          byDistance: Array.from(neighbors.values()).reduce((acc, n) => {
            acc[n.distance] = (acc[n.distance] || 0) + 1;
            return acc;
          }, {})
        }
      }
    });
  } catch (error) {
    console.error('[Agent Neighbors] 获取邻居失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Agent 获取图谱概览（轻量级）
 * GET /api/agent/graphs/:graphId/overview
 * 
 * 用途: Agent 快速了解图谱结构，不加载完整数据
 * 
 * 支持双重认证:
 * - 用户认证: Authorization: Bearer <token>
 * - Agent认证: Authorization: Agent <api_key>
 */
router.get('/agent/graphs/:graphId/overview', dualAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { sampleSize = 50 } = req.query;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const sampleNum = Math.min(200, Math.max(10, parseInt(sampleSize) || 50));
    
    // 获取节点和边
    const allNodes = nodeOperations.getByGraphId(graphId);
    const allEdges = edgeOperations.getByGraphId(graphId);
    
    // 随机抽样节点
    const sampledNodes = allNodes
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleNum)
      .map(n => ({
        id: n.id,
        label: n.label,
        type: n.type
      }));
    
    // 获取样本节点的边
    const sampledNodeIds = new Set(sampledNodes.map(n => n.id));
    const sampledEdges = allEdges.filter(e => {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      return sampledNodeIds.has(src) && sampledNodeIds.has(tgt);
    }).slice(0, sampleNum * 2).map(e => ({
      id: e.id,
      source: typeof e.source === 'object' ? e.source.id : e.source,
      target: typeof e.target === 'object' ? e.target.id : e.target,
      type: e.type,
      label: e.label
    }));
    
    res.json({
      success: true,
      data: {
        graph: {
          id: graph.id,
          name: graph.name,
          description: graph.description
        },
        overview: {
          totalNodes: allNodes.length,
          totalEdges: allEdges.length,
          sampledNodes: sampledNodes.length,
          sampledEdges: sampledEdges.length
        },
        sample: {
          nodes: sampledNodes,
          edges: sampledEdges
        }
      }
    });
  } catch (error) {
    console.error('[Agent Overview] 获取概览失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 用户认证 ==========

// 用户注册
router.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 个字符' });
    }

    // 检查用户名是否已存在
    const existingUser = userOperations.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 创建用户
    const newUser = await userOperations.create({ username, password });

    // 生成 Token
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      user: { id: newUser.id, username: newUser.username },
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 用户登录
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 查找用户
    const user = userOperations.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    if (!await userOperations.verifyPassword(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成 Token
    const token = generateToken(user);

    res.json({
      success: true,
      user: { id: user.id, username: user.username, is_admin: user.is_admin },
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取当前用户信息
router.get('/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: req.user
  });
});

// 更新用户资料
router.put('/auth/profile', authMiddleware, (req, res) => {
  try {
    const { username, avatar, bio } = req.body;
    
    // 如果要修改用户名，检查是否已存在
    if (username && username !== req.user.username) {
      const existingUser = userOperations.findByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: '用户名已被使用' });
      }
    }
    
    const updatedUser = userOperations.updateProfile(req.user.id, { username, avatar, bio });
    res.json({ 
      success: true, 
      user: { id: updatedUser.id, username: updatedUser.username, avatar: updatedUser.avatar, bio: updatedUser.bio }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 用户 LLM 配置（需要认证）==========

// 获取用户的所有 LLM 配置
router.get('/user/llm-configs', authMiddleware, (req, res) => {
  try {
    const configs = userLLMConfigOperations.getByUserId(req.user.id);
    // 不返回 api_key
    const safeConfigs = configs.map(c => ({
      ...c,
      api_key: c.api_key ? '••••••••' : ''
    }));
    res.json(safeConfigs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建 LLM 配置
router.post('/user/llm-configs', authMiddleware, (req, res) => {
  try {
    const { provider, api_key, base_url, model_name, is_active } = req.body;
    
    if (!api_key) {
      return res.status(400).json({ error: 'API Key 不能为空' });
    }
    
    const config = userLLMConfigOperations.create({
      user_id: req.user.id,
      provider: provider || 'openai',
      api_key,
      base_url: base_url || '',
      model_name: model_name || 'gpt-4o',
      is_active: is_active || false
    });
    
    res.status(201).json({
      ...config,
      api_key: '••••••••'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新 LLM 配置
router.put('/user/llm-configs/:id', authMiddleware, (req, res) => {
  try {
    const config = userLLMConfigOperations.getById(req.params.id);
    
    if (!config || config.user_id !== req.user.id) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    const updatedConfig = userLLMConfigOperations.update(req.params.id, req.body);
    res.json({
      ...updatedConfig,
      api_key: updatedConfig.api_key ? '••••••••' : ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除 LLM 配置
router.delete('/user/llm-configs/:id', authMiddleware, (req, res) => {
  try {
    const config = userLLMConfigOperations.getById(req.params.id);
    
    if (!config || config.user_id !== req.user.id) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    userLLMConfigOperations.delete(req.params.id);
    res.json({ success: true, message: '配置已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 用户关联的 Agent（需要认证）==========

// 获取用户关联的所有 Agent
router.get('/user/agents', authMiddleware, (req, res) => {
  try {
    const agents = userAgentOperations.getByUserId(req.user.id);
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取用户创建的所有 Agent（含 API Key）
router.get('/user/agents/my', authMiddleware, (req, res) => {
  try {
    const agents = agentOperations.getByUserId(req.user.id);
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 用户创建自己的 Agent
router.post('/user/agents/my', authMiddleware, (req, res) => {
  try {
    const { name, description, permissions, tenant_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Agent 名称不能为空' });
    }
    
    // 创建 Agent 并关联到用户
    const agent = agentOperations.create({
      name,
      description: description || '',
      user_id: req.user.id,
      tenant_id: tenant_id || null,
      permissions: permissions || {
        graphs: ['read', 'write'],
        nodes: ['read', 'write', 'delete'],
        edges: ['read', 'write', 'delete']
      }
    });
    
    // 返回创建的 Agent，包含 API Key（只显示一次）
    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        api_key: agent.api_key, // 只在此处返回一次
        permissions: agent.permissions,
        is_active: agent.is_active,
        created_at: agent.created_at
      },
      message: '请妥善保存 API Key，它只会显示一次'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新用户的 Agent
router.put('/user/agents/my/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, is_active } = req.body;
    
    // 验证 Agent 属于当前用户
    const agent = agentOperations.getById(id);
    if (!agent || agent.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Agent 不存在或无权修改' });
    }
    
    const updated = agentOperations.update(id, {
      name,
      description,
      permissions,
      is_active
    });
    
    // 不返回 API Key
    const { api_key, ...safeAgent } = updated;
    res.json({
      success: true,
      agent: safeAgent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除用户的 Agent
router.delete('/user/agents/my/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 Agent 属于当前用户
    const agent = agentOperations.getById(id);
    if (!agent || agent.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Agent 不存在或无权删除' });
    }
    
    agentOperations.delete(id);
    res.json({ success: true, message: 'Agent 已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 轮换用户的 Agent API Key
router.post('/user/agents/my/:id/rotate-key', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 Agent 属于当前用户
    const agent = agentOperations.getById(id);
    if (!agent || agent.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Agent 不存在或无权操作' });
    }
    
    const result = agentOperations.rotateApiKey(id);
    res.json({
      success: true,
      api_key: result.api_key,
      message: '请妥善保存新的 API Key，它只会显示一次'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有可用的 Agent（公开列表，用于关联）
router.get('/agents', authMiddleware, (req, res) => {
  try {
    // 获取所有活跃的 Agent
    const agents = agentOperations.getAll().filter(a => a.is_active === 1);
    // 排除 API Key
    const safeAgents = agents.map(a => {
      const { api_key, ...rest } = a;
      return rest;
    });
    res.json(safeAgents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 关联 Agent 到用户
router.post('/user/agents', authMiddleware, (req, res) => {
  try {
    const { agent_id, role } = req.body;
    
    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID 不能为空' });
    }
    
    // 检查 Agent 是否存在
    const agent = agentOperations.getById(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }
    
    // 检查是否已经关联
    if (userAgentOperations.exists(req.user.id, agent_id)) {
      return res.status(400).json({ error: '该 Agent 已经关联到您的账户' });
    }
    
    // 关联 Agent
    const userAgent = userAgentOperations.create({
      user_id: req.user.id,
      agent_id,
      role: role || 'member'
    });
    
    res.status(201).json({
      success: true,
      message: 'Agent 关联成功',
      user_agent: userAgent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取消关联 Agent
router.delete('/user/agents/:id', authMiddleware, (req, res) => {
  try {
    const userAgent = userAgentOperations.getById(req.params.id);
    
    if (!userAgent || userAgent.user_id !== req.user.id) {
      return res.status(404).json({ error: '关联不存在' });
    }
    
    userAgentOperations.delete(req.params.id);
    res.json({ success: true, message: '已取消关联' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新关联角色
router.put('/user/agents/:id/role', authMiddleware, (req, res) => {
  try {
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({ error: '角色不能为空' });
    }
    
    const userAgent = userAgentOperations.getById(req.params.id);
    
    if (!userAgent || userAgent.user_id !== req.user.id) {
      return res.status(404).json({ error: '关联不存在' });
    }
    
    const updated = userAgentOperations.updateRole(req.params.id, role);
    res.json({
      success: true,
      message: '角色更新成功',
      user_agent: updated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 图谱分享（需要认证）==========

// 生成分享链接
router.post('/graphs/:id/share', authMiddleware, (req, res) => {
  try {
    const { allow_edit, expires_at } = req.body;
    const graph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const share = graphShareOperations.createShare(
      req.params.id, 
      allow_edit || false, 
      expires_at || null
    );
    
    res.status(201).json({
      success: true,
      share_token: share.share_token,
      share_url: `/share/${share.share_token}`,
      allow_edit: share.allow_edit === 1,
      expires_at: share.expires_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取图谱的分享列表
router.get('/graphs/:id/shares', authMiddleware, (req, res) => {
  try {
    const graph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const shares = graphShareOperations.getByGraphId(req.params.id);
    res.json(shares.map(s => ({
      ...s,
      share_url: `/share/${s.share_token}`,
      allow_edit: s.allow_edit === 1
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取消分享
router.delete('/graphs/:id/shares/:shareId', authMiddleware, (req, res) => {
  try {
    const graph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    graphShareOperations.delete(req.params.shareId);
    res.json({ success: true, message: '分享已取消' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 公开访问分享的图谱（无需登录）
router.get('/share/:token', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    // 排除 embedding 字段以减少响应大小
    const nodes = nodeOperations.getByGraphId(share.graph_id).map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    const edges = edgeOperations.getByGraphId(share.graph_id).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    
    res.json({
      graph_id: share.graph_id,
      graph_name: share.graph_name,
      allow_edit: share.allow_edit === 1,
      nodes,
      edges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 验证分享链接是否允许编辑
router.get('/share/:token/check-edit', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期', allowed: false });
    }
    
    res.json({
      allowed: share.allow_edit === 1,
      graph_id: share.graph_id,
      graph_name: share.graph_name
    });
  } catch (error) {
    res.status(500).json({ error: error.message, allowed: false });
  }
});

// 分享编辑 - 创建节点
router.post('/share/:token/nodes', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    if (share.allow_edit !== 1) {
      return res.status(403).json({ error: '此分享不允许编辑' });
    }
    
    const { label, type, properties, x, y } = req.body;
    
    if (!label) {
      return res.status(400).json({ error: '节点标签不能为空' });
    }
    
    const newNode = nodeOperations.createForGraph({
      id: uuidv4(),
      label,
      type: type || 'default',
      properties: properties || {},
      x,
      y
    }, share.graph_id);
    
    res.status(201).json({ ...newNode, properties: JSON.parse(newNode.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 分享编辑 - 更新节点
router.put('/share/:token/nodes/:id', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    if (share.allow_edit !== 1) {
      return res.status(403).json({ error: '此分享不允许编辑' });
    }
    
    const oldNode = nodeOperations.getById(req.params.id);
    if (!oldNode || oldNode.graph_id !== share.graph_id) {
      return res.status(404).json({ error: '节点不存在' });
    }
    
    const updatedNode = nodeOperations.update(req.params.id, req.body);
    res.json({ ...updatedNode, properties: JSON.parse(updatedNode.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 分享编辑 - 删除节点
router.delete('/share/:token/nodes/:id', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    if (share.allow_edit !== 1) {
      return res.status(403).json({ error: '此分享不允许编辑' });
    }
    
    const oldNode = nodeOperations.getById(req.params.id);
    if (!oldNode || oldNode.graph_id !== share.graph_id) {
      return res.status(404).json({ error: '节点不存在' });
    }
    
    nodeOperations.delete(req.params.id);
    res.json({ success: true, message: '节点已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 分享编辑 - 创建边
router.post('/share/:token/edges', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    if (share.allow_edit !== 1) {
      return res.status(403).json({ error: '此分享不允许编辑' });
    }
    
    const { source, target, label, type, properties } = req.body;
    
    if (!source || !target) {
      return res.status(400).json({ error: '源节点和目标节点不能为空' });
    }
    
    const sourceNode = nodeOperations.getById(source);
    const targetNode = nodeOperations.getById(target);
    if (!sourceNode || !targetNode || sourceNode.graph_id !== share.graph_id || targetNode.graph_id !== share.graph_id) {
      return res.status(404).json({ error: '源节点或目标节点不存在于当前图谱中' });
    }
    
    const newEdge = edgeOperations.createForGraph({
      id: uuidv4(),
      source,
      target,
      label: label || '',
      type: type || 'default',
      properties: properties || {}
    }, share.graph_id);
    
    res.status(201).json({ ...newEdge, properties: JSON.parse(newEdge.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 分享编辑 - 更新边
router.put('/share/:token/edges/:id', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    if (share.allow_edit !== 1) {
      return res.status(403).json({ error: '此分享不允许编辑' });
    }
    
    const oldEdge = edgeOperations.getById(req.params.id);
    if (!oldEdge || oldEdge.graph_id !== share.graph_id) {
      return res.status(404).json({ error: '边不存在' });
    }
    
    const updatedEdge = edgeOperations.update(req.params.id, req.body);
    res.json({ ...updatedEdge, properties: JSON.parse(updatedEdge.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 分享编辑 - 删除边
router.delete('/share/:token/edges/:id', (req, res) => {
  try {
    const share = graphShareOperations.getByToken(req.params.token);
    
    if (!share) {
      return res.status(404).json({ error: '分享不存在或已过期' });
    }
    
    if (share.allow_edit !== 1) {
      return res.status(403).json({ error: '此分享不允许编辑' });
    }
    
    const oldEdge = edgeOperations.getById(req.params.id);
    if (!oldEdge || oldEdge.graph_id !== share.graph_id) {
      return res.status(404).json({ error: '边不存在' });
    }
    
    edgeOperations.delete(req.params.id);
    res.json({ success: true, message: '边已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 图谱 Agent 授权管理（需要认证）==========

// 获取图谱已授权的 Agent 列表
router.get('/graphs/:id/agents', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱（user_id 以 agent- 开头）
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');
    
    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }
    
    // 获取已授权的 Agent 列表（数据库已返回 agent 信息）
    const permissions = graphAgentPermissionOperations.getByGraphId(id);
    
    // 格式化返回结果
    const result = permissions.map(p => ({
      id: p.id,
      graph_id: p.graph_id,
      agent_id: p.agent_id,
      permission: p.permission,
      created_by: p.created_by,
      created_at: p.created_at,
      updated_at: p.updated_at,
      agent: {
        id: p.agent_id,
        name: p.agent_name,
        description: p.agent_description,
        is_active: p.agent_is_active
      }
    }));
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 授权 Agent 访问图谱
router.post('/graphs/:id/agents', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { agent_id, permission = 'read' } = req.body;
    
    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID 不能为空' });
    }
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱（user_id 以 agent- 开头）
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');
    
    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }
    
    // 检查 Agent 是否存在
    const agent = agentOperations.getById(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }
    
    // 检查是否已经授权
    const existing = graphAgentPermissionOperations.getByAgentAndGraph(agent_id, id);
    if (existing) {
      return res.status(400).json({ error: '该 Agent 已经被授权访问此图谱' });
    }
    
    // 创建授权
    const newPermission = graphAgentPermissionOperations.create({
      graph_id: id,
      agent_id,
      permission,
      created_by: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Agent 授权成功',
      permission: {
        ...newPermission,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          is_active: agent.is_active
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新 Agent 对图谱的权限
router.put('/graphs/:id/agents/:agentId', authMiddleware, (req, res) => {
  try {
    const { id, agentId } = req.params;
    const { permission } = req.body;
    
    if (!permission) {
      return res.status(400).json({ error: '权限不能为空' });
    }
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱（user_id 以 agent- 开头）
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');
    
    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }
    
    // 检查授权是否存在
    const existing = graphAgentPermissionOperations.getByAgentAndGraph(agentId, id);
    if (!existing) {
      return res.status(404).json({ error: '授权不存在' });
    }
    
    // 更新权限
    const updated = graphAgentPermissionOperations.update(existing.id, { permission });
    
    // 获取 Agent 信息
    const agent = agentOperations.getById(agentId);
    
    res.json({
      success: true,
      message: '权限更新成功',
      permission: {
        ...updated,
        agent: agent ? {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          is_active: agent.is_active
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 撤销 Agent 对图谱的授权
router.delete('/graphs/:id/agents/:agentId', authMiddleware, (req, res) => {
  try {
    const { id, agentId } = req.params;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查权限：图谱属于当前用户，或者是 Agent 创建的图谱
    const isOwner = graph.user_id === req.user.id;
    const isAgentGraph = graph.user_id.startsWith('agent-');
    
    if (!isOwner && !isAgentGraph) {
      return res.status(403).json({ error: '没有权限管理此图谱的授权' });
    }
    
    // 检查授权是否存在
    const existing = graphAgentPermissionOperations.getByAgentAndGraph(agentId, id);
    if (!existing) {
      return res.status(404).json({ error: '授权不存在' });
    }
    
    // 撤销授权
    graphAgentPermissionOperations.deleteByAgentAndGraph(agentId, id);
    
    res.json({
      success: true,
      message: '授权已撤销'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 存储活跃的对话请求，用于取消操作
// key: graphId, value: { abortController, signal }
const activeConversations = new Map();

// 存储聚类分析进度
// key: graphId, value: { status: 'running'|'completed'|'failed', progress: number, current: number, total: number, message: string }
const clusteringProgress = new Map();

/**
 * 注册一个活跃对话
 * @param {string} graphId - 图谱ID
 * @param {AbortController} abortController - AbortController 实例
 */
export function registerConversation(graphId, abortController) {
  activeConversations.set(graphId, { abortController, signal: abortController.signal });
}

/**
 * 取消指定图谱的对话
 * @param {string} graphId - 图谱ID
 * @returns {boolean} 是否成功取消
 */
export function cancelConversation(graphId) {
  const conversation = activeConversations.get(graphId);
  if (conversation && !conversation.signal.aborted) {
    conversation.abortController.abort();
    return true;
  }
  return false;
}

/**
 * 清除指定图谱的对话记录
 * @param {string} graphId - 图谱ID
 */
export function clearConversation(graphId) {
  activeConversations.delete(graphId);
}

// ========== 图谱管理（需要认证）==========
// 注意：这些路由使用了 authMiddleware

// 获取当前用户的所有图谱（管理员可查看所有）
router.get('/graphs', authMiddleware, (req, res) => {
  try {
    let graphs;
    
    // 检查是否是管理员用户
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    if (isAdmin) {
      // 管理员可以查看所有图谱
      graphs = graphOperations.getAll();
    } else {
      // 普通用户只查看自己的图谱
      graphs = graphOperations.getByUserId(req.user.id);
    }
    
    res.json(graphs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 从 JSON 文件加载示例图谱数据（用于首页背景展示）
// 共5个图谱，约250个节点
let DEMO_GRAPHS = [];
let demoGraphsLoaded = false;

/**
 * 加载示例图谱数据
 */
function loadDemoGraphs() {
  if (demoGraphsLoaded) return;
  
  const demoGraphsDir = path.join(__dirname, 'data', 'demo-graphs');
  
  try {
    const files = fs.readdirSync(demoGraphsDir).filter(f => f.endsWith('.json'));
    
    DEMO_GRAPHS = files.map(file => {
      const filePath = path.join(demoGraphsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    });
    
    demoGraphsLoaded = true;
    console.log(`[Demo Graphs] 已加载 ${DEMO_GRAPHS.length} 个示例图谱`);
  } catch (error) {
    console.error('[Demo Graphs] 加载示例图谱失败:', error);
    DEMO_GRAPHS = [];
  }
}

// 公开获取图谱列表（无需认证，用于首页背景展示）
router.get('/graphs/public', (req, res) => {
  try {
    // 确保示例图谱已加载
    loadDemoGraphs();
    
    // 返回预定义的示例图谱列表
    const publicGraphs = DEMO_GRAPHS.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      category: g.category || 'default',
      updated_at: new Date().toISOString()
    }));
    res.json(publicGraphs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 公开获取图谱数据（无需认证，用于首页背景展示）
router.get('/graphs/public/:id/graph', (req, res) => {
  try {
    // 确保示例图谱已加载
    loadDemoGraphs();
    
    const { id } = req.params;
    
    // 从预定义示例中查找
    const demoGraph = DEMO_GRAPHS.find(g => g.id === id);
    
    if (demoGraph) {
      return res.json({
        id: demoGraph.id,
        name: demoGraph.name,
        description: demoGraph.description,
        category: demoGraph.category || 'default',
        nodes: demoGraph.nodes,
        edges: demoGraph.edges
      });
    }
    
    // 如果找不到示例图谱，返回随机选择一个
    if (DEMO_GRAPHS.length === 0) {
      return res.status(404).json({ error: '没有可用的示例图谱' });
    }
    
    const randomGraph = DEMO_GRAPHS[Math.floor(Math.random() * DEMO_GRAPHS.length)];
    res.json({
      id: randomGraph.id,
      name: randomGraph.name,
      description: randomGraph.description,
      category: randomGraph.category || 'default',
      nodes: randomGraph.nodes,
      edges: randomGraph.edges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取当前用户的活跃图谱
router.get('/graphs/active', authMiddleware, (req, res) => {
  try {
    const graphs = graphOperations.getByUserId(req.user.id);
    const activeGraph = graphs.find(g => g.is_active === 1) || graphs[0];
    res.json(activeGraph || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取图谱详情（包含节点和边）
router.get('/graphs/:id', authMiddleware, (req, res) => {
  try {
    const graph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，返回 404
    if (!graph && !isAdmin) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 如果图谱不属于当前用户，但当前用户是管理员，则获取图谱（不验证 owner）
    if (!graph && isAdmin) {
      const adminGraph = graphOperations.getById(req.params.id);
      if (!adminGraph) {
        return res.status(404).json({ error: '图谱不存在' });
      }
      // 排除 embedding 字段以减少响应大小
      const nodes = nodeOperations.getByGraphId(req.params.id).map(n => {
        const { embedding, ...nodeWithoutEmbedding } = n;
        return {
          ...nodeWithoutEmbedding,
          properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
        };
      });
      const edges = edgeOperations.getByGraphId(req.params.id).map(e => ({
        ...e,
        properties: JSON.parse(e.properties || '{}')
      }));
      return res.json({ ...adminGraph, nodes, edges });
    }

    // 排除 embedding 字段以减少响应大小
    const nodes = nodeOperations.getByGraphId(req.params.id).map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    const edges = edgeOperations.getByGraphId(req.params.id).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    res.json({ ...graph, nodes, edges });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建新图谱
router.post('/graphs', authMiddleware, (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: '图谱名称不能为空' });
    }
    
    const newGraph = graphOperations.create({
      id: uuidv4(),
      user_id: req.user.id,
      name,
      description: description || ''
    });
    
    res.status(201).json(newGraph);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新图谱
router.put('/graphs/:id', authMiddleware, (req, res) => {
  try {
    const oldGraph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    if (!oldGraph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const updatedGraph = graphOperations.update(req.params.id, req.body);
    res.json(updatedGraph);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除图谱
router.delete('/graphs/:id', authMiddleware, (req, res) => {
  try {
    // 首先尝试按用户ID查找
    let oldGraph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    
    // 如果找不到，检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果是管理员，可以删除任何图谱
    if (!oldGraph && isAdmin) {
      oldGraph = graphOperations.getById(req.params.id);
      if (!oldGraph) {
        return res.status(404).json({ error: '图谱不存在' });
      }
    }
    
    // 如果仍然找不到，检查图谱的 user_id 是否为已删除的 Agent（以 agent- 开头但不存在于 agents 表）
    if (!oldGraph) {
      const graph = graphOperations.getById(req.params.id);
      if (graph && graph.user_id && graph.user_id.startsWith('agent-')) {
        // 检查这个 agent 是否存在
        const agentExists = db.prepare('SELECT id FROM agents WHERE id = ?').get(graph.user_id);
        if (!agentExists) {
          // Agent 已删除，允许创建图谱的原始用户删除（通过检查 graph_agent_permissions 或其他线索）
          // 这里简化为：任何认证用户都可以删除由已删除 Agent 创建的图谱
          oldGraph = graph;
        }
      }
    }
    
    if (!oldGraph) {
      return res.status(404).json({ error: '图谱不存在或无权限删除' });
    }
    
    graphOperations.delete(req.params.id);
    res.json({ success: true, message: '图谱已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 切换活跃图谱
router.post('/graphs/:id/activate', authMiddleware, (req, res) => {
  try {
    const graph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    graphOperations.setActive(req.params.id);
    res.json(graph);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 复制图谱
router.post('/graphs/:id/duplicate', authMiddleware, (req, res) => {
  try {
    const { name } = req.body;
    const newGraph = graphOperations.duplicate(req.params.id, name, req.user.id);
    if (!newGraph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    res.status(201).json(newGraph);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取图谱配置
router.get('/graphs/:id/settings', authMiddleware, (req, res) => {
  try {
    // 验证图谱是否存在
    const graph = graphOperations.getById(req.params.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 使用 canAccessGraph 函数检查权限（管理员除外）
    if (!isAdmin && !canAccessGraph(graph, req.user)) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const settings = graphOperations.getSettings(req.params.id);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新图谱配置
router.put('/graphs/:id/settings', authMiddleware, (req, res) => {
  try {
    // 验证图谱是否存在
    const graph = graphOperations.getById(req.params.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 使用 canWriteGraph 函数检查权限（管理员除外）
    if (!isAdmin && !canWriteGraph(graph, req.user)) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const settings = graphOperations.updateSettings(req.params.id, req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ========== 配置相关（需要认证）==========
// LLM 配置
router.post('/config/llm', authMiddleware, async (req, res) => {
  try {
    const { apiKey, baseURL, model } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key is required' });
    }
    
    initOpenAI({ apiKey, baseURL });
    res.json({ success: true, message: 'LLM 配置成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/config/llm/status', (req, res) => {
  res.json({ configured: isLLMConfigured() });
});

// ========== 图谱数据（需要认证）==========

// 流式获取图谱数据（SSE）- 分批返回节点和边
router.get('/graphs/:graphId/graph/stream', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { graphId } = req.params;
  
  console.log(`\n🌐 [SSE Stream] 开始流式加载图谱`);
  console.log(`   📋 图谱ID: ${graphId}`);
  console.log(`   👤 用户: ${req.user.username}`);
  console.time(`[SSE Stream] 图谱 ${graphId} 加载耗时`);
  
  try {
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，返回 404
    if (!graph && !isAdmin) {
      console.error(`❌ [SSE Stream] 图谱 ${graphId} 不存在或无权限访问`);
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 如果图谱不属于当前用户，但当前用户是管理员，则获取图谱（不验证 owner）
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
      if (!graph) {
        console.error(`❌ [SSE Stream] 图谱 ${graphId} 不存在`);
        return res.status(404).json({ error: '图谱不存在' });
      }
    }
    
    console.log(`✅ [SSE Stream] 权限验证通过: ${graph.name}`);
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // 获取节点和边总数（排除 embedding 字段以减少响应大小）
    console.log(`📊 [SSE Stream] 正在查询数据库...`);
    const allRawNodes = nodeOperations.getByGraphId(graphId);
    const nodes = allRawNodes.map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return nodeWithoutEmbedding;
    });
    const allRawEdges = edgeOperations.getByGraphId(graphId);
    const edges = allRawEdges;
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    
    console.log(`📈 [SSE Stream] 图谱统计:`);
    console.log(`   ├─ 总节点数: ${totalNodes}`);
    console.log(`   └─ 总边数: ${totalEdges}`);
    
    // 发送元数据
    console.log(`📤 [SSE Stream] 发送元数据...`);
    sendEvent({ 
      type: 'meta', 
      totalNodes, 
      totalEdges,
      graphName: graph.name,
      nodeBatchSize: 100,
      edgeBatchSize: 100
    });
    
    // 分批发送节点（每批 100 个）
    const NODE_BATCH_SIZE = 100;
    // 根据数据量动态调整延迟：数据量越大，延迟越小，避免等待时间过长
    // 小数据集（<1000节点）：100ms/批
    // 中数据集（1000-5000节点）：50ms/批
    // 大数据集（>5000节点）：30ms/批
    const NODE_DELAY = totalNodes < 1000 ? 100 : (totalNodes < 5000 ? 50 : 30);
    const nodeBatches = Math.ceil(nodes.length / NODE_BATCH_SIZE);
    
    console.log(`📦 [SSE Stream] 开始分批发送节点 (${nodeBatches} 批, 每批 ${NODE_BATCH_SIZE}, 延迟 ${NODE_DELAY}ms)`);
    
    for (let i = 0; i < nodes.length; i += NODE_BATCH_SIZE) {
      const batch = nodes.slice(i, i + NODE_BATCH_SIZE).map(n => ({
        ...n,
        properties: JSON.parse(n.properties || '{}')
      }));
      
      const batchIndex = Math.floor(i / NODE_BATCH_SIZE);
      const loaded = Math.min(i + NODE_BATCH_SIZE, nodes.length);
      const progress = ((loaded / totalNodes) * 100).toFixed(1);
      
      console.log(`   📦 [批次 ${batchIndex + 1}/${nodeBatches}] ${progress}% (${loaded}/${totalNodes}) +${batch.length} 个节点`);
      
      sendEvent({ 
        type: 'nodes_batch', 
        batch,
        batchIndex: batchIndex + 1,
        totalBatches: nodeBatches,
        loaded,
        total: totalNodes
      });
      
      // 每批之间延迟，让前端有时间处理和渲染
      if (i + NODE_BATCH_SIZE < nodes.length) {
        await new Promise(resolve => setTimeout(resolve, NODE_DELAY));
      }
    }
    
    console.log(`✅ [SSE Stream] 节点发送完成: ${totalNodes} 个`);
    
    // 分批发送边（每批 100 个）
    const EDGE_BATCH_SIZE = 100;
    // 根据数据量动态调整延迟
    // 小数据集（<1000边）：100ms/批
    // 中数据集（1000-5000边）：50ms/批
    // 大数据集（>5000边）：30ms/批
    const EDGE_DELAY = totalEdges < 1000 ? 100 : (totalEdges < 5000 ? 50 : 30);
    const edgeBatches = Math.ceil(edges.length / EDGE_BATCH_SIZE);
    
    console.log(`🔗 [SSE Stream] 开始分批发送边 (${edgeBatches} 批, 每批 ${EDGE_BATCH_SIZE}, 延迟 ${EDGE_DELAY}ms)`);
    
    for (let i = 0; i < edges.length; i += EDGE_BATCH_SIZE) {
      const batch = edges.slice(i, i + EDGE_BATCH_SIZE).map(e => ({
        ...e,
        properties: JSON.parse(e.properties || '{}')
      }));
      
      const batchIndex = Math.floor(i / EDGE_BATCH_SIZE);
      const loaded = Math.min(i + EDGE_BATCH_SIZE, edges.length);
      const progress = ((loaded / totalEdges) * 100).toFixed(1);
      
      console.log(`   🔗 [批次 ${batchIndex + 1}/${edgeBatches}] ${progress}% (${loaded}/${totalEdges}) +${batch.length} 条边`);
      
      sendEvent({ 
        type: 'edges_batch', 
        batch,
        batchIndex: batchIndex + 1,
        totalBatches: edgeBatches,
        loaded,
        total: totalEdges
      });
      
      // 每批之间延迟
      if (i + EDGE_BATCH_SIZE < edges.length) {
        await new Promise(resolve => setTimeout(resolve, EDGE_DELAY));
      }
    }
    
    console.log(`✅ [SSE Stream] 边发送完成: ${totalEdges} 条`);
    
    // 发送完成事件
    console.log(`🎉 [SSE Stream] 发送完成信号`);
    sendEvent({ type: 'complete' });
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [SSE Stream] 流式加载完成!`);
    console.log(`   ├─ 总耗时: ${totalTime}s`);
    console.log(`   ├─ 节点批次: ${nodeBatches}`);
    console.log(`   └─ 边批次: ${edgeBatches}`);
    console.timeEnd(`[SSE Stream] 图谱 ${graphId} 加载耗时`);
    console.log('');
    
    res.end();
  } catch (error) {
    console.error(`❌ [SSE Stream] 流式加载失败:`, error.message);
    console.timeEnd(`[SSE Stream] 图谱 ${graphId} 加载耗时`);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// 获取指定图谱的完整数据
router.get('/graphs/:graphId/graph', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，返回 404
    if (!graph && !isAdmin) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 如果图谱不属于当前用户，但当前用户是管理员，则获取图谱（不验证 owner）
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
      if (!graph) {
        return res.status(404).json({ error: '图谱不存在' });
      }
    }
    
    // 排除 embedding 字段以减少响应大小
    const nodes = nodeOperations.getByGraphId(graphId).map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    const edges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    res.json({ nodes, edges });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 性能优化 API（需要认证）==========

/**
 * 视口查询 API - 获取视口内的节点
 * GET /api/graphs/:graphId/viewport
 * 
 * 查询参数:
 * - minX: 视口左边界
 * - maxX: 视口右边界
 * - minY: 视口上边界
 * - maxY: 视口下边界
 * - padding: 视口外扩像素（默认 100）
 * 
 * 用途: 前端缩放/平移时，只请求视口内的节点，减少数据传输
 */
router.get('/graphs/:graphId/viewport', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { minX, maxX, minY, maxY, padding = 100 } = req.query;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 解析边界参数
    const bounds = {
      minX: parseFloat(minX) || -1000,
      maxX: parseFloat(maxX) || 1000,
      minY: parseFloat(minY) || -1000,
      maxY: parseFloat(maxY) || 1000,
      padding: parseInt(padding) || 100
    };
    
    // 扩大边界范围
    bounds.minX -= bounds.padding;
    bounds.maxX += bounds.padding;
    bounds.minY -= bounds.padding;
    bounds.maxY += bounds.padding;
    
    // 获取视口内的节点
    const allNodes = nodeOperations.getByGraphId(graphId);
    const visibleNodes = allNodes.filter(node => {
      const x = node.x || 0;
      const y = node.y || 0;
      return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    });
    
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    
    // 获取连接到视口内节点的边（两端点都在视口内）
    const allEdges = edgeOperations.getByGraphId(graphId);
    const visibleEdges = allEdges.filter(edge => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });
    
    console.log(`[Viewport API] 视口查询: ${visibleNodes.length}/${allNodes.length} 节点, ${visibleEdges.length}/${allEdges.length} 边`);
    
    res.json({
      success: true,
      total: { nodes: allNodes.length, edges: allEdges.length },
      visible: { nodes: visibleNodes.length, edges: visibleEdges.length },
      bounds,
      nodes: visibleNodes.map(n => ({
        ...n,
        properties: JSON.parse(n.properties || '{}')
      })),
      edges: visibleEdges.map(e => ({
        ...e,
        properties: JSON.parse(e.properties || '{}')
      }))
    });
  } catch (error) {
    console.error('[Viewport API] 视口查询失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 边抽样 API - 按度数或随机抽样边
 * GET /api/graphs/:graphId/edges/sample
 * 
 * 查询参数:
 * - method: 抽样方法 (degree/random/top) - 默认 degree
 * - limit: 抽样数量（默认 1000）
 * - minDegree: 最小度数（用于 degree 方法，默认 1）
 * 
 * 用途: 大规模图谱只显示部分边，减少渲染压力
 */
router.get('/graphs/:graphId/edges/sample', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { method = 'degree', limit = 1000, minDegree = 1 } = req.query;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const limitNum = Math.min(parseInt(limit) || 1000, 5000);
    const minDegreeNum = parseInt(minDegree) || 1;
    
    // 获取所有边
    const edges = edgeOperations.getByGraphId(graphId);
    
    if (edges.length <= limitNum) {
      // 边数量在限制内，直接返回
      return res.json({
        success: true,
        method: 'all',
        total: edges.length,
        sampled: edges.length,
        edges: edges.map(e => ({
          ...e,
          properties: JSON.parse(e.properties || '{}')
        }))
      });
    }
    
    let sampledEdges;
    
    switch (method) {
      case 'degree':
        // 按度数抽样：优先保留高度数边
        {
          // 计算每条边的度数（两端点度数之和）
          const degreeMap = new Map();
          edges.forEach(edge => {
            const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
            const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
            
            if (!degreeMap.has(sourceId)) degreeMap.set(sourceId, 0);
            if (!degreeMap.has(targetId)) degreeMap.set(targetId, 0);
            degreeMap.set(sourceId, degreeMap.get(sourceId) + 1);
            degreeMap.set(targetId, degreeMap.get(targetId) + 1);
          });
          
          // 按度数排序
          const edgesWithDegree = edges.map(edge => {
            const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
            const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
            const degree = (degreeMap.get(sourceId) || 0) + (degreeMap.get(targetId) || 0);
            return { edge, degree };
          });
          
          edgesWithDegree.sort((a, b) => b.degree - a.degree);
          
          // 优先保留度数 >= minDegree 的边
          const highDegreeEdges = edgesWithDegree.filter(e => e.degree >= minDegreeNum);
          const lowDegreeEdges = edgesWithDegree.filter(e => e.degree < minDegreeNum);
          
          // 合并：先取高度数边，再取低度数边直到达到限制
          const combined = [...highDegreeEdges];
          const remaining = limitNum - combined.length;
          if (remaining > 0 && lowDegreeEdges.length > 0) {
            // 从低度数边中随机抽样
            const shuffled = lowDegreeEdges.sort(() => Math.random() - 0.5);
            combined.push(...shuffled.slice(0, remaining));
          }
          
          sampledEdges = combined.slice(0, limitNum).map(e => e.edge);
        }
        break;
        
      case 'random':
        // 随机抽样
        {
          const shuffled = edges.sort(() => Math.random() - 0.5);
          sampledEdges = shuffled.slice(0, limitNum);
        }
        break;
        
      case 'top':
        // 按度数取前 N 条边
        {
          // 计算度数
          const degreeMap = new Map();
          edges.forEach(edge => {
            const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
            const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
            
            if (!degreeMap.has(sourceId)) degreeMap.set(sourceId, 0);
            if (!degreeMap.has(targetId)) degreeMap.set(targetId, 0);
            degreeMap.set(sourceId, degreeMap.get(sourceId) + 1);
            degreeMap.set(targetId, degreeMap.get(targetId) + 1);
          });
          
          // 按度数排序并取前 N
          const edgesWithDegree = edges.map(edge => {
            const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
            const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
            const degree = (degreeMap.get(sourceId) || 0) + (degreeMap.get(targetId) || 0);
            return { edge, degree };
          });
          
          edgesWithDegree.sort((a, b) => b.degree - a.degree);
          sampledEdges = edgesWithDegree.slice(0, limitNum).map(e => e.edge);
        }
        break;
        
      default:
        // 默认按度数抽样
        sampledEdges = edges.slice(0, limitNum);
    }
    
    console.log(`[Edge Sample API] 边抽样: ${method} 方法, ${sampledEdges.length}/${edges.length} 边`);
    
    res.json({
      success: true,
      method,
      total: edges.length,
      sampled: sampledEdges.length,
      limit: limitNum,
      edges: sampledEdges.map(e => ({
        ...e,
        properties: JSON.parse(e.properties || '{}')
      }))
    });
  } catch (error) {
    console.error('[Edge Sample API] 边抽样失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 边度数统计 API
 * GET /api/graphs/:graphId/edges/degrees
 * 
 * 返回每条边的度数信息，用于前端决定显示哪些边
 */
router.get('/graphs/:graphId/edges/degrees', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取所有边
    const edges = edgeOperations.getByGraphId(graphId);
    
    // 计算度数
    const degreeMap = new Map();
    edges.forEach(edge => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      
      if (!degreeMap.has(sourceId)) degreeMap.set(sourceId, 0);
      if (!degreeMap.has(targetId)) degreeMap.set(targetId, 0);
      degreeMap.set(sourceId, degreeMap.get(sourceId) + 1);
      degreeMap.set(targetId, degreeMap.get(targetId) + 1);
    });
    
    // 统计边度数
    const edgeDegrees = edges.map(edge => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const degree = (degreeMap.get(sourceId) || 0) + (degreeMap.get(targetId) || 0);
      return { id: edge.id, degree };
    });
    
    // 统计分布
    const degreeStats = {
      min: Math.min(...edgeDegrees.map(e => e.degree)),
      max: Math.max(...edgeDegrees.map(e => e.degree)),
      avg: (edgeDegrees.reduce((sum, e) => sum + e.degree, 0) / edgeDegrees.length).toFixed(2)
    };
    
    res.json({
      success: true,
      total: edges.length,
      degreeStats,
      degrees: edgeDegrees
    });
  } catch (error) {
    console.error('[Edge Degrees API] 边度数统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 节点操作（需要认证）==========

// 获取指定图谱的所有节点（排除 embedding 字段以减少响应大小）
router.get('/graphs/:graphId/nodes', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 排除 embedding 字段以减少响应大小
    const nodes = nodeOperations.getByGraphId(graphId).map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个节点
router.get('/graphs/:graphId/nodes/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，检查是否是 Agent 创建的图谱
    if (!graph && !isAdmin) {
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        graph = anyGraph;
      }
    }
    
    // 如果图谱不属于当前用户，但当前用户是管理员，则获取图谱（不验证 owner）
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
      if (!graph) {
        return res.status(404).json({ error: '图谱不存在' });
      }
    }
    
    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 验证节点是否属于该图谱
    const node = nodeOperations.getById(id);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }
    res.json({ ...node, properties: JSON.parse(node.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建节点
router.post('/graphs/:graphId/nodes', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { label, type, properties, x, y } = req.body;
    
    if (!label) {
      return res.status(400).json({ error: '节点标签不能为空' });
    }
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    const newNode = nodeOperations.createForGraph({
      id: uuidv4(),
      label,
      type: type || 'default',
      properties: properties || {},
      x,
      y
    }, graphId);
    
    historyOperations.add(graphId, 'create', 'node', newNode.id, null, newNode);
    res.status(201).json({ ...newNode, properties: JSON.parse(newNode.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新节点
router.put('/graphs/:graphId/nodes/:id', authMiddleware, async (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 验证节点是否属于该图谱
    const oldNode = nodeOperations.getById(id);
    if (!oldNode || oldNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }
    
    const updatedNode = nodeOperations.update(id, req.body);
    historyOperations.add(graphId, 'update', 'node', id, oldNode, updatedNode);
    
    // 如果 label 或 properties 发生变化，且节点有 embedding，则更新向量索引
    const labelChanged = req.body.label && req.body.label !== oldNode.label;
    const propertiesChanged = req.body.properties && JSON.stringify(req.body.properties) !== oldNode.properties;
    
    if ((labelChanged || propertiesChanged) && oldNode.embedding) {
      try {
        // 重新计算新的 embedding
        const newEmbeddingText = nodeToEmbeddingText(updatedNode);
        const embeddingValue = await getEmbedding(newEmbeddingText);
        
        // 更新数据库中的 embedding
        nodeOperations.updateEmbedding(id, embeddingValue);
        
        // 更新向量索引
        vecSearchOperations.updateInIndex(id, embeddingValue);
        
        console.log(`[Node Update] 已更新节点 ${id} 的向量索引`);
      } catch (e) {
        console.log(`[Node Update] 更新节点 ${id} 的向量索引失败:`, e.message);
      }
    }
    
    res.json({ ...updatedNode, properties: JSON.parse(updatedNode.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除节点
router.delete('/graphs/:graphId/nodes/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 验证节点是否属于该图谱
    const oldNode = nodeOperations.getById(id);
    if (!oldNode || oldNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }
    
    // 从向量索引中移除（如果存在）
    try {
      vecSearchOperations.removeFromIndex(id);
    } catch (e) {
      console.log(`[Node Delete] 从向量索引移除节点 ${id} 失败:`, e.message);
    }
    
    const deletedNode = nodeOperations.delete(id);
    // 记录删除操作到历史记录
    historyOperations.add(graphId, 'delete', 'node', id, oldNode, null);
    res.json({ success: true, message: '节点已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 搜索节点
router.get('/graphs/:graphId/nodes/search/:keyword', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    const results = nodeOperations.searchByGraphId(graphId, req.params.keyword);
    res.json(results.map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批量更新节点位置
router.put('/graphs/:graphId/nodes/positions', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { positions } = req.body;
    
    if (!positions || !Array.isArray(positions)) {
      return res.status(400).json({ error: '位置数据格式错误' });
    }
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    nodeOperations.updatePositions(graphId, positions);
    res.json({ success: true, message: '位置已保存' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 高级查询 API（需要认证）==========
// 这些接口同时支持用户和 Agent 访问

// 获取支持的查询操作符列表
router.get('/query/operators', (req, res) => {
  res.json({
    operators: OPERATORS,
    aggregateOperations: AGGREGATE_OPERATIONS
  });
});

// 属性筛选 + 排序查询（用户版）
router.post('/graphs/:graphId/nodes/query', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const query = req.body;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 执行查询
    const result = await doQueryNodes(graphId, query);

    res.json(result);
  } catch (error) {
    console.error('[User Query] 查询失败:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 聚合统计接口（用户版）
router.post('/graphs/:graphId/nodes/aggregate', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations, filters } = req.body;

    if (!field) {
      return res.status(400).json({ error: '聚合字段不能为空' });
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: '聚合操作不能为空' });
    }

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 执行聚合查询
    const result = await doAggregateNodes(graphId, field, operations, filters || []);

    res.json(result);
  } catch (error) {
    console.error('[User Aggregate] 聚合失败:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 按类型分组聚合（用户版）
router.get('/graphs/:graphId/nodes/aggregate/by-type', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations } = req.query;

    if (!field) {
      return res.status(400).json({ error: '聚合字段不能为空' });
    }

    if (!operations) {
      return res.status(400).json({ error: '聚合操作不能为空' });
    }

    const ops = operations.split(',').map(op => op.trim());

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 执行分组聚合
    const result = await doGroupByType(graphId, field, ops);

    res.json({
      field,
      operations: ops,
      groups: result
    });
  } catch (error) {
    console.error('[User GroupBy] 分组聚合失败:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 获取字段统计信息（用户版）
router.get('/graphs/:graphId/nodes/field-stats', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);

    if (nodes.length === 0) {
      return res.json({
        totalNodes: 0,
        fields: []
      });
    }

    // 分析 properties 中的所有字段
    const fieldStats = {};
    const typeCounts = {};

    for (const node of nodes) {
      // 统计类型
      const type = node.type || 'default';
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      // 解析 properties
      let properties = {};
      try {
        properties = JSON.parse(node.properties || '{}');
      } catch (e) {
        properties = {};
      }

      // 统计每个字段
      for (const [key, value] of Object.entries(properties)) {
        if (!fieldStats[key]) {
          fieldStats[key] = {
            type: typeof value,
            count: 0,
            numericStats: null
          };
        }
        fieldStats[key].count++;

        // 如果是数值类型，收集数值统计
        if (typeof value === 'number' || !isNaN(parseFloat(value))) {
          if (!fieldStats[key].numericStats) {
            fieldStats[key].numericStats = { values: [] };
          }
          fieldStats[key].numericStats.values.push(parseFloat(value));
        }
      }
    }

    // 计算数值统计
    for (const [key, stats] of Object.entries(fieldStats)) {
      if (stats.numericStats && stats.numericStats.values.length > 0) {
        const values = stats.numericStats.values;
        stats.numericStats = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length
        };
      }
    }

    res.json({
      totalNodes: nodes.length,
      typeCounts,
      fields: fieldStats
    });
  } catch (error) {
    console.error('[User FieldStats] 获取字段统计失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========== 边操作（需要认证）==========

// 获取指定图谱的所有边
router.get('/graphs/:graphId/edges', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    const edges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    res.json(edges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建边
router.post('/graphs/:graphId/edges', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { source, target, label, type, properties } = req.body;
    
    if (!source || !target) {
      return res.status(400).json({ error: '源节点和目标节点不能为空' });
    }
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查节点是否属于该图谱
    const sourceNode = nodeOperations.getById(source);
    const targetNode = nodeOperations.getById(target);
    if (!sourceNode || !targetNode || sourceNode.graph_id !== graphId || targetNode.graph_id !== graphId) {
      return res.status(404).json({ error: '源节点或目标节点不存在于当前图谱中' });
    }
    
    const newEdge = edgeOperations.createForGraph({
      id: uuidv4(),
      source,
      target,
      label: label || '',
      type: type || 'default',
      properties: properties || {}
    }, graphId);
    
    historyOperations.add(graphId, 'create', 'edge', newEdge.id, null, newEdge);
    res.status(201).json({ ...newEdge, properties: JSON.parse(newEdge.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新边
router.put('/graphs/:graphId/edges/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 验证边是否属于该图谱
    const oldEdge = edgeOperations.getById(id);
    if (!oldEdge || oldEdge.graph_id !== graphId) {
      return res.status(404).json({ error: '边不存在' });
    }
    
    const updatedEdge = edgeOperations.update(id, req.body);
    historyOperations.add(graphId, 'update', 'edge', id, oldEdge, updatedEdge);
    res.json({ ...updatedEdge, properties: JSON.parse(updatedEdge.properties || '{}') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除边
router.delete('/graphs/:graphId/edges/:id', authMiddleware, (req, res) => {
  try {
    const { graphId, id } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    // 验证边是否属于该图谱
    const oldEdge = edgeOperations.getById(id);
    if (!oldEdge || oldEdge.graph_id !== graphId) {
      return res.status(404).json({ error: '边不存在' });
    }
    
    const deletedEdge = edgeOperations.delete(id);
    // 记录删除操作到历史记录
    historyOperations.add(graphId, 'delete', 'edge', id, oldEdge, null);
    res.json({ success: true, message: '边已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 历史记录（需要认证）==========

// 获取指定图谱的历史记录
router.get('/graphs/:graphId/history', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    const limit = parseInt(req.query.limit) || 50;
    const history = historyOperations.getByGraphId(graphId, limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 撤销操作
router.post('/graphs/:graphId/history/undo', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    const result = historyOperations.undo(graphId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 聊天接口（需要认证）==========

// 发送消息 (Agent 模式)
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { messages, maxIterations, graphId } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '消息格式错误' });
    }
    
    if (!graphId) {
      return res.status(400).json({ error: '图谱ID不能为空' });
    }
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 使用 Agent 模式执行（无迭代限制）
    const result = await chat(messages, maxIterations || Infinity, graphId);
    
    res.json({
      success: result.success,
      iterations: result.iterations,
      message: result.message,
      executionTrace: result.executionTrace,
      summary: result.summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE 流式聊天接口
router.post('/chat/stream', authMiddleware, async (req, res) => {
  // 创建 AbortController 用于取消
  const abortController = new AbortController();
  const signal = abortController.signal;
  
  // 注册此对话
  registerConversation(req.body.graphId, abortController);
  
  try {
    const { messages, maxIterations, graphId } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '消息格式错误' });
    }
    
    if (!graphId) {
      return res.status(400).json({ error: '图谱ID不能为空' });
    }
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const sendEvent = (data) => {
      // 检查是否已取消
      if (signal.aborted) {
        return;
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // 发送用户需求
    const userMsg = messages.find(m => m.role === 'user');
    sendEvent({ type: 'start', message: userMsg?.content || '' });
    
    // 获取当前图谱状态（排除 embedding 字段以减少响应大小）
    const rawNodes = nodeOperations.getByGraphId(graphId);
    const currentNodes = rawNodes.map(n => {
      const { embedding, ...nodeWithoutEmbedding } = n;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(nodeWithoutEmbedding.properties || '{}')
      };
    });
    const currentEdges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    sendEvent({ type: 'graph', nodes: currentNodes, edges: currentEdges });
    
    // Agent 模式执行（传递 signal）
    const { agentChat } = await import('./llmService.js');
    const result = await agentChat(messages, maxIterations || Infinity, sendEvent, graphId, signal);
    
    // 发送完成事件
    sendEvent({ 
      type: 'done', 
      success: result.success,
      iterations: result.iterations,
      message: result.message?.content || '',
      summary: result.summary,
      cancelled: result.cancelled || false
    });
    
    // 清理注册
    clearConversation(graphId);
    res.end();
  } catch (error) {
    // 如果是取消操作，不发送错误
    if (signal.aborted) {
      sendEvent({ type: 'cancelled', message: '对话已被用户取消' });
      clearConversation(req.body.graphId);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    clearConversation(req.body.graphId);
    res.end();
  }
});

// 取消对话接口
router.post('/chat/cancel', (req, res) => {
  try {
    const { graphId } = req.body;
    
    if (!graphId) {
      return res.status(400).json({ error: '图谱ID不能为空' });
    }
    
    const cancelled = cancelConversation(graphId);
    
    if (cancelled) {
      res.json({ success: true, message: '对话已取消' });
    } else {
      res.json({ success: false, message: '没有正在进行的对话' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取可用工具
router.get('/tools', (req, res) => {
  res.json(tools);
});

// 获取 MCP 状态
router.get('/mcp/status', (req, res) => {
  try {
    const { getMCPStatus, isMCPConnected } = require('./mcpClient.js');
    const status = getMCPStatus();
    res.json(status);
  } catch (error) {
    res.json({
      connected: false,
      degraded: true,
      message: 'MCP 服务不可用: ' + error.message
    });
  }
});

// ========== 本体生成 API（需要认证）==========

/**
 * 生成本体定义 (带 SSE 进度)
 * POST /api/graph/ontology/generate
 * 
 * 请求参数 (FormData):
 * - files: File[] - 上传的文件，支持 PDF/MD/TXT 格式
 * - simulation_requirement: String - 模拟需求描述
 * - project_name: String (可选) - 项目名称
 * - additional_context: String (可选) - 额外说明上下文
 */
router.post('/graph/ontology/generate', authMiddleware, upload.array('files', 10), async (req, res) => {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    const { simulation_requirement, project_name, additional_context } = req.body;
    
    if (!simulation_requirement) {
      return res.status(400).json({ error: '模拟需求不能为空' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请上传至少一个文件' });
    }
    
    // 1. 解析文件提取文本
    console.log(`[本体生成] 收到 ${req.files.length} 个文件，开始解析...`);
    const documentTexts = [];
    const fileInfos = [];
    
    for (const file of req.files) {
      try {
        console.log(`[本体生成] 解析文件: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB)`);
        const text = await FileParser.extractText(file.path);
        const processedText = TextProcessor.preprocessText(text);
        
        if (processedText.trim()) {
          documentTexts.push(processedText);
          fileInfos.push(FileParser.getFileInfo(file));
          console.log(`[本体生成] ✓ ${file.originalname} - 提取 ${processedText.length} 字符`);
        }
        
        // 清理上传的临时文件
        fs.unlinkSync(file.path);
      } catch (parseError) {
        console.error(`[本体生成] ✗ 文件解析失败: ${file.originalname}`, parseError.message);
        // 继续处理其他文件
      }
    }
    
    if (documentTexts.length === 0) {
      console.error('[本体生成] ✗ 无法从上传的文件中提取有效文本');
      sendEvent({ type: 'error', message: '无法从上传的文件中提取有效文本' });
      return res.end();
    }
    
    const totalTextLength = documentTexts.join('').length;
    console.log(`[本体生成] ✓ 共提取 ${documentTexts.length} 个文档，总计 ${totalTextLength} 字符`);
    
    // 2. 生成项目 ID
    const projectId = `proj_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const projectName = project_name || '未命名项目';
    console.log(`[本体生成] 项目ID: ${projectId}, 项目名称: ${projectName}`);
    console.log(`[本体生成] 需求: ${simulation_requirement?.slice(0, 50)}...`);
    
    // 3. 使用 LLM 生成本体（显示进度）
    console.log('[本体生成] 🚀 开始调用 LLM 生成本体...');
    sendEvent({ type: 'progress', message: '🔄 正在调用 LLM 分析文档...', progress: 0.1 });
    
    const ontology = await OntologyGenerator.generate(
      documentTexts,
      simulation_requirement,
      additional_context || ''
    );
    
    const entityCount = ontology.entity_types?.length || 0;
    const edgeCount = ontology.edge_types?.length || 0;
    console.log(`[本体生成] ✅ 本体生成完成! 实体类型: ${entityCount}, 关系类型: ${edgeCount}`);
    
    sendEvent({ 
      type: 'progress', 
      stage: 'ontology', 
      message: '本体生成完成!',
      progress: 1.0,
      entityTypes: entityCount,
      edgeTypes: edgeCount
    });
    
    // 4. 返回最终结果
    sendEvent({
      type: 'complete',
      data: {
        project_id: projectId,
        project_name: projectName,
        ontology,
        analysis_summary: ontology.analysis_summary,
        files: fileInfos,
        total_text_length: totalTextLength
      }
    });
    
    res.end();
  } catch (error) {
    console.error('本体生成失败:', error);
    sendEvent({ type: 'error', message: error.message });
    res.end();
  }
});

// ========== 图谱构建 API（需要认证）==========

/**
 * 构建知识图谱
 * POST /api/graph/build
 * 
 * 请求参数 (JSON):
 * - project_id: String - 项目ID（来自阶段一）
 * - graph_name: String (可选) - 图谱名称，默认项目名称
 * - chunk_size: Integer (可选) - 文本块大小，默认 500
 * - chunk_overlap: Integer (可选) - 块重叠大小，默认 50
 * - force: Boolean (可选) - 强制重新构建，默认 false
 */
router.post('/graph/build', authMiddleware, async (req, res) => {
  try {
    const { 
      project_id, 
      graph_name, 
      chunk_size = 500, 
      chunk_overlap = 50,
      force = false,
      ontology,
      text
    } = req.body;
    
    if (!project_id) {
      return res.status(400).json({ error: '项目ID不能为空' });
    }
    
    if (!ontology) {
      return res.status(400).json({ error: '本体定义不能为空' });
    }
    
    if (!text) {
      return res.status(400).json({ error: '文本内容不能为空' });
    }
    
    // 创建新图谱
    const graphId = `local_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const graphName = graph_name || '知识图谱';
    
    // 为用户创建图谱
    const newGraph = graphOperations.create({
      id: graphId,
      user_id: req.user.id,
      name: graphName,
      description: `由项目 ${project_id} 构建`
    });
    
    // 创建构建任务
    const taskId = TaskManager.createTask('build_graph', {
      projectId: project_id,
      graphId: graphId
    });
    
    // 异步构建图谱
    (async () => {
      try {
        TaskManager.updateProgress(taskId, 0, '开始构建图谱...');
        
        const result = await LocalGraphBuilder.buildGraph(
          text,
          ontology,
          graphId,
          graphName,
          chunk_size,
          chunk_overlap,
          5, // maxWorkers
          true, // useParallel
          (message, progress) => {
            TaskManager.updateProgress(taskId, progress, message);
          }
        );
        
        TaskManager.completeTask(taskId, {
          project_id,
          graph_id: graphId,
          ...result
        });
      } catch (error) {
        TaskManager.failTask(taskId, error.message);
      }
    })();
    
    res.json({
      success: true,
      data: {
        project_id,
        graph_id: graphId,
        task_id: taskId,
        message: '本地图谱构建任务已启动'
      }
    });
  } catch (error) {
    console.error('图谱构建失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 任务状态查询 API（需要认证）==========

/**
 * 获取任务状态
 * GET /api/graph/task/:taskId
 */
router.get('/graph/task/:taskId', authMiddleware, (req, res) => {
  try {
    const { taskId } = req.params;
    const task = TaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    res.json({
      success: true,
      data: {
        task_id: task.taskId,
        status: task.status,
        message: task.message,
        progress: task.progress,
        result: task.result,
        error: task.error,
        created_at: task.createdAt,
        updated_at: task.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 日志查询 API（需要认证）==========

/**
 * 获取日志文件列表
 * GET /api/logs/files
 */
router.get('/logs/files', authMiddleware, (req, res) => {
  try {
    const files = getLogFiles();
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 读取日志文件内容
 * GET /api/logs/read?file=xxx&lines=100
 */
router.get('/logs/read', authMiddleware, (req, res) => {
  try {
    const { file, lines } = req.query;
    
    if (!file) {
      return res.status(400).json({ error: '请指定日志文件名' });
    }
    
    const lineCount = parseInt(lines) || 100;
    const logs = readLogFile(file, lineCount);
    
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取最近的日志（聚合）
 * GET /api/logs/recent?count=50
 */
router.get('/logs/recent', authMiddleware, (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const logs = getRecentLogs(count);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 清理日志文件
 * POST /api/logs/clear
 */
router.post('/logs/clear', authMiddleware, (req, res) => {
  try {
    // 只有管理员可以清理日志（这里简化为任何登录用户）
    const result = clearLogs();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取后端实时日志（通过 SSE）
 * GET /api/logs/stream
 */
router.get('/logs/stream', authMiddleware, (req, res) => {
  try {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // 发送最近的日志
    const recentLogs = getRecentLogs(20);
    res.write(`data: ${JSON.stringify({ type: 'init', logs: recentLogs })}\n\n`);
    
    // 保持连接，每隔一段时间发送健康检查
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);
    
    // 清理
    req.on('close', () => {
      clearInterval(keepAlive);
      res.end();
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Embedding API（需要认证）==========

/**
 * 检查 embedding 服务状态
 * GET /api/embedding/status
 */
router.get('/embedding/status', authMiddleware, async (req, res) => {
  try {
    const available = await isEmbeddingServiceAvailable();
    const config = getEmbeddingConfig();
    res.json({
      available,
      config
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取图谱的 embedding 状态
 * GET /api/graphs/:graphId/embedding/status
 */
router.get('/graphs/:graphId/embedding/status', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    
    console.log(`[Embedding Status] 获取图谱 ${graphId} 的 embedding 状态...`);
    
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，返回 404
    if (!graph && !isAdmin) {
      // 检查图谱是否是 Agent 创建的（user_id 以 agent- 开头）
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        // Agent 创建的图谱，允许访问
        graph = anyGraph;
      }
    }
    
    // 如果图谱不属于当前用户，但当前用户是管理员，则获取图谱（不验证 owner）
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
      if (!graph) {
        console.log(`[Embedding Status] 图谱 ${graphId} 不存在`);
        return res.status(404).json({ error: '图谱不存在' });
      }
    }
    
    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      console.log(`[Embedding Status] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    const totalNodes = nodes.length;
    console.log(`[Embedding Status] 图谱 ${graphId} 共有 ${totalNodes} 个节点`);
    
    // 统计已有 embedding 的节点数量
    const nodesWithEmbedding = nodes.filter(n => n.embedding && n.embedding.length > 0);
    const computedNodes = nodesWithEmbedding.length;
    
    // 计算进度
    const progress = totalNodes > 0 ? Math.round((computedNodes / totalNodes) * 100) : 0;
    
    console.log(`[Embedding Status] 已计算 embedding: ${computedNodes}/${totalNodes} (${progress}%)`);
    
    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    const config = getEmbeddingConfig();
    console.log(`[Embedding Status] Embedding 服务可用: ${available}, 配置: ${JSON.stringify(config)}`);
    
    res.json({
      available,
      config,
      totalNodes,
      computedNodes,
      progress,
      isComplete: computedNodes === totalNodes && totalNodes > 0
    });
  } catch (error) {
    console.error('[Embedding Status] 获取 embedding 状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 计算图谱中所有节点的 embedding
 * POST /api/graphs/:graphId/embedding/compute
 */
router.post('/graphs/:graphId/embedding/compute', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    console.log(`[Embedding Compute] 开始为图谱 ${graphId} 计算 embedding...`);
    
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，检查是否是 Agent 创建的图谱
    if (!graph && !isAdmin) {
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        graph = anyGraph;
      }
    }
    
    // 如果是管理员，检查图谱是否存在
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
    }
    
    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      console.log(`[Embedding Compute] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    console.log(`[Embedding Compute] 图谱 ${graphId} 共有 ${nodes.length} 个节点`);
    
    if (nodes.length === 0) {
      console.log(`[Embedding Compute] 图谱 ${graphId} 没有节点`);
      return res.status(400).json({ error: '图谱中没有节点' });
    }
    
    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    console.log(`[Embedding Compute] Embedding 服务可用: ${available}`);
    
    if (!available) {
      console.error('[Embedding Compute] Embedding 服务不可用');
      return res.status(503).json({ error: 'Embedding 服务不可用，请确保本地 embedding 服务正在运行' });
    }
    
    // 批量计算 embedding
    console.log(`[Embedding Compute] 正在调用 embedding API 计算 ${nodes.length} 个节点的向量...`);
    const nodeTexts = nodes.map(n => nodeToEmbeddingText(n));
    console.log(`[Embedding Compute] 节点文本示例: ${nodeTexts[0]?.slice(0, 50)}...`);
    
    const embeddings = await getEmbeddings(nodeTexts);
    console.log(`[Embedding Compute] 成功获取 ${embeddings.length} 个 embedding 向量`);
    
    // 批量更新到数据库
    const updateData = nodes.map((node, index) => ({
      id: node.id,
      embedding: embeddings[index]
    })).filter(item => item.embedding);
    
    console.log(`[Embedding Compute] 正在更新数据库，节点 ID: ${updateData.map(d => d.id).join(', ')}`);
    nodeOperations.batchUpdateEmbeddings(graphId, updateData);
    console.log(`[Embedding Compute] ✅ 成功保存 ${updateData.length} 个节点的 embedding 到数据库`);
    
    // 同步到 sqlite-vec 索引
    const items = updateData.map(item => ({
      nodeId: item.id,
      embedding: item.embedding
    }));
    vecSearchOperations.batchAddToIndex(graphId, items);
    console.log(`[Embedding Compute] ✅ 成功同步 ${items.length} 个节点到向量索引`);
    
    res.json({
      success: true,
      message: `成功计算 ${updateData.length} 个节点的 embedding`,
      total: nodes.length,
      computed: updateData.length
    });
  } catch (error) {
    console.error('[Embedding Compute] 计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 语义搜索节点
 * GET /api/graphs/:graphId/embedding/search?q=xxx&limit=10
 */
router.get('/graphs/:graphId/embedding/search', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { q, limit = 10 } = req.query;
    
    console.log(`[Semantic Search] 收到搜索请求: graphId=${graphId}, query="${q}", limit=${limit}`);
    
    if (!q) {
      console.log('[Semantic Search] 搜索关键词为空');
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }
    
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，检查是否是 Agent 创建的图谱
    if (!graph && !isAdmin) {
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        graph = anyGraph;
      }
    }
    
    // 如果是管理员，检查图谱是否存在
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
    }
    
    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      console.log(`[Semantic Search] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    console.log(`[Semantic Search] 图谱 ${graphId} 中有 ${nodesWithEmbedding.length} 个节点有 embedding`);
    
    if (nodesWithEmbedding.length === 0) {
      console.log('[Semantic Search] 图谱中没有计算 embedding');
      return res.status(400).json({ error: '图谱中还没有计算 embedding，请先点击"计算 Embedding"' });
    }
    
    // 计算查询的 embedding
    console.log(`[Semantic Search] 正在为查询 "${q}" 计算 embedding...`);
    const queryEmbedding = await getEmbedding(q);
    console.log(`[Semantic Search] 查询 embedding 维度: ${queryEmbedding?.length || 0}`);
    
    // 查找相似节点
    const candidates = nodesWithEmbedding.map(n => ({
      id: n.id,
      label: n.label,
      embedding: JSON.parse(n.embedding)
    }));
    console.log(`[Semantic Search] 候选节点: ${candidates.map(c => c.label).join(', ')}`);
    
    console.log(`[Semantic Search] 正在计算余弦相似度，limit=${limit}...`);
    const similarNodes = findSimilarNodes(queryEmbedding, candidates, parseInt(limit));
    console.log(`[Semantic Search] 找到 ${similarNodes.length} 个相似节点`);
    
    // 获取完整节点信息（排除 embedding 字段以减少响应大小）
    const results = similarNodes.map(similarity => {
      const node = nodesWithEmbedding.find(n => n.id === similarity.id);
      console.log(`[Semantic Search] 相似节点: ${node?.label}, 相似度: ${(similarity.similarity * 100).toFixed(2)}%`);
      // 排除 embedding 字段
      const { embedding, ...nodeWithoutEmbedding } = node;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(node.properties || '{}'),
        similarity: similarity.similarity
      };
    });
    
    console.log(`[Semantic Search] 搜索完成，返回 ${results.length} 个结果`);
    res.json({
      success: true,
      query: q,
      results
    });
  } catch (error) {
    console.error('[Semantic Search] 语义搜索失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取节点的相似节点
 * GET /api/graphs/:graphId/embedding/similar/:nodeId?limit=10
 */
router.get('/graphs/:graphId/embedding/similar/:nodeId', authMiddleware, async (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { limit = 10 } = req.query;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取目标节点
    const targetNode = nodeOperations.getById(nodeId);
    if (!targetNode || targetNode.graph_id !== graphId) {
      return res.status(404).json({ error: '节点不存在' });
    }
    
    // 检查是否有 embedding
    if (!targetNode.embedding) {
      return res.status(400).json({ error: '该节点还没有 embedding，请先点击"计算 Embedding"' });
    }
    
    // 获取其他有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    const otherNodes = nodesWithEmbedding.filter(n => n.id !== nodeId);
    
    if (otherNodes.length === 0) {
      return res.json({
        success: true,
        node: { ...targetNode, properties: JSON.parse(targetNode.properties || '{}') },
        similarNodes: []
      });
    }
    
    // 解析目标节点的 embedding
    const targetEmbedding = JSON.parse(targetNode.embedding);
    
    // 查找相似节点
    const candidates = otherNodes.map(n => ({
      id: n.id,
      embedding: JSON.parse(n.embedding)
    }));
    
    const similarNodes = findSimilarNodes(targetEmbedding, candidates, parseInt(limit));
    
    // 获取完整节点信息
    const results = similarNodes.map(similarity => {
      const node = otherNodes.find(n => n.id === similarity.id);
      return {
        ...node,
        properties: JSON.parse(node.properties || '{}'),
        similarity: similarity.similarity
      };
    });
    
    res.json({
      success: true,
      node: { ...targetNode, properties: JSON.parse(targetNode.properties || '{}') },
      similarNodes: results
    });
  } catch (error) {
    console.error('获取相似节点失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 对图谱中的节点进行聚类分析
 * POST /api/graphs/:graphId/embedding/cluster
 */
router.post('/graphs/:graphId/embedding/cluster', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { k = 3 } = req.body;
    
    console.log(`[Cluster API] 开始聚类分析: graphId=${graphId}, k=${k}`);
    
    // 验证图谱是否属于当前用户
    let graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    
    // 如果不是管理员且图谱不属于当前用户，检查是否是 Agent 创建的图谱
    if (!graph && !isAdmin) {
      const anyGraph = graphOperations.getById(graphId);
      if (anyGraph && anyGraph.user_id && anyGraph.user_id.startsWith('agent-')) {
        graph = anyGraph;
      }
    }
    
    // 如果是管理员，检查图谱是否存在
    if (!graph && isAdmin) {
      graph = graphOperations.getById(graphId);
    }
    
    // 如果仍然没有找到图谱，返回 404
    if (!graph) {
      console.log(`[Cluster API] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    console.log(`[Cluster API] 图谱 ${graphId} 有 ${nodesWithEmbedding.length} 个节点有 embedding`);
    
    if (nodesWithEmbedding.length < 2) {
      console.log(`[Cluster API] 节点数量不足: ${nodesWithEmbedding.length}`);
      return res.status(400).json({ error: '需要至少 2 个节点才能进行聚类，请先点击"计算 Embedding"' });
    }
    
    if (nodesWithEmbedding.length < k) {
      console.log(`[Cluster API] 节点数量 ${nodesWithEmbedding.length} 少于聚类数量 ${k}`);
      return res.status(400).json({ error: `节点数量 (${nodesWithEmbedding.length}) 少于聚类数量 (${k})，请减少聚类数量` });
    }
    
    // 初始化进度
    clusteringProgress.set(graphId, {
      status: 'running',
      progress: 0,
      current: 0,
      total: k + 1,  // K-means + k个LLM调用
      message: '正在执行 K-means 聚类...'
    });
    
    // 提取 embedding 向量
    const vectors = nodesWithEmbedding.map(n => JSON.parse(n.embedding));
    
    // 执行 K-means 聚类
    console.log(`[Cluster API] 执行 K-means 聚类，k=${k}...`);
    const clusters = kMeansClustering(vectors, k);
    console.log(`[Cluster API] K-means 聚类完成，生成了 ${clusters.length} 个聚类`);
    
    // 更新进度
    clusteringProgress.set(graphId, {
      status: 'running',
      progress: Math.round(100 / (k + 1)),
      current: 1,
      total: k + 1,
      message: `K-means 聚类完成，开始为 ${k} 个聚类生成名称...`
    });
    
    // 将聚类结果映射回节点
    const nodeIdList = nodesWithEmbedding.map(n => n.id);
    let clusterResults = clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      nodes: cluster.indices.map(index => {
        const nodeId = nodeIdList[index];
        const node = nodesWithEmbedding.find(n => n.id === nodeId);
        return {
          id: node.id,
          label: node.label,
          type: node.type,
          properties: JSON.parse(node.properties || '{}')
        };
      })
    }));
    
    // ========== 调用 LLM 为每个聚类逐一生成名称 ==========
    console.log(`[Cluster API] 开始调用 LLM 为 ${clusterResults.length} 个聚类逐一生成名称...`);
    console.log(`[Cluster API] LLM 配置状态: ${isLLMConfigured()}`);
    
    // 检查 LLM 是否可用
    if (!isLLMConfigured()) {
      console.log('[Cluster API] ⚠️ LLM 未配置，使用默认聚类名称');
      // 使用默认名称
      clusterResults = clusterResults.map((cluster, index) => ({
        ...cluster,
        name: `聚类 ${index + 1}`,
        description: `包含 ${cluster.nodes.length} 个节点`
      }));
      
      // 清除进度
      clusteringProgress.delete(graphId);
    } else {
      const { getOpenAIClient } = await import('./llmService.js');
      const openai = getOpenAIClient();
      const modelName = getCurrentModel() || 'gpt-4o';
      
      // 逐一为每个聚类生成名称
      for (let i = 0; i < clusterResults.length; i++) {
        const cluster = clusterResults[i];
        const nodeList = cluster.nodes.slice(0, 15).map(n => `- ${n.label} (${n.type})`).join('\n');
        const moreText = cluster.nodes.length > 15 ? `\n... 还有 ${cluster.nodes.length - 15} 个节点` : '';
        
        // 更新进度
        clusteringProgress.set(graphId, {
          status: 'running',
          progress: Math.round((i + 2) * 100 / (k + 1)),
          current: i + 2,
          total: k + 1,
          message: `正在为"聚类 ${i + 1}"生成名称... (${i + 1}/${k})`
        });
        
        const prompt = `请为以下知识图谱的聚类生成一个简洁的中文名称（2-4个字）和简短描述（不超过15个字）。

这个聚类包含 ${cluster.nodes.length} 个节点：
${nodeList}${moreText}

要求：
1. 名称要能准确反映该聚类中节点的共同特征
2. 使用通用的分类术语
3. 描述要简洁明了

请直接返回 JSON 格式，不要有任何其他内容：
{"name": "名称", "description": "描述"}`;

        try {
          console.log(`[Cluster API] 正在为聚类 ${i + 1}/${clusterResults.length} 生成名称...`);
          
          const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 200
          });
          
          const responseText = completion.choices[0]?.message?.content || '';
          console.log(`[Cluster API] 聚类 ${i + 1} LLM 返回: ${responseText.slice(0, 200)}...`);
          
          // 解析 JSON 响应
          try {
            // 移除 <thinking> 等标签
            let cleanResponse = responseText
              .replace(/<[\s\S]*?>/g, '')
              .replace(/```json/g, '')
              .replace(/```/g, '')
              .trim();
            
            let parsed = null;
            
            // 尝试直接解析
            try {
              parsed = JSON.parse(cleanResponse);
            } catch (e) {
              // 尝试提取 JSON 对象
              const match = cleanResponse.match(/\{[\s\S]*"name"[\s\S]*"description"[\s\S]*\}/);
              if (match) {
                try {
                  parsed = JSON.parse(match[0]);
                } catch (e2) {
                  console.log(`[Cluster API] 聚类 ${i + 1} JSON 解析失败`);
                }
              }
            }
            
            if (parsed && parsed.name) {
              let name = parsed.name.replace(/^["']|["']$/g, '').replace(/[,，。.]/g, '').trim();
              let description = (parsed.description || '').replace(/^["']|["']$/g, '').replace(/[,，。.]/g, '').trim();
              cluster.name = name;
              cluster.description = description;
              console.log(`[Cluster API] ✅ 聚类 ${i + 1} 命名成功: ${name}`);
            } else {
              throw new Error('无法解析 LLM 响应');
            }
          } catch (parseError) {
            console.error(`[Cluster API] 聚类 ${i + 1} 解析失败:`, parseError.message);
            cluster.name = `聚类 ${i + 1}`;
            cluster.description = `包含 ${cluster.nodes.length} 个节点`;
          }
        } catch (llmError) {
          console.error(`[Cluster API] 聚类 ${i + 1} LLM 调用失败:`, llmError.message);
          cluster.name = `聚类 ${i + 1}`;
          cluster.description = `包含 ${cluster.nodes.length} 个节点`;
        }
      }
      
      console.log(`[Cluster API] ✅ 所有聚类命名完成: ${clusterResults.map(c => c.name).join(', ')}`);
      
      // 清除进度
      clusteringProgress.delete(graphId);
    }
    
    console.log(`[Cluster API] 聚类分析完成，返回 ${clusterResults.length} 个聚类`);
    
    res.json({
      success: true,
      k,
      totalNodes: nodesWithEmbedding.length,
      clusters: clusterResults
    });
  } catch (error) {
    console.error('[Cluster API] 聚类分析失败:', error);
    // 清除进度
    clusteringProgress.delete(req.params.graphId);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取聚类进度
 * GET /api/graphs/:graphId/embedding/cluster/progress
 */
router.get('/graphs/:graphId/embedding/cluster/progress', authMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    
    const progress = clusteringProgress.get(graphId);
    
    if (!progress) {
      return res.json({
        status: 'idle',
        progress: 0,
        current: 0,
        total: 0,
        message: ''
      });
    }
    
    res.json(progress);
  } catch (error) {
    console.error('[Cluster Progress API] 获取进度失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除图谱的所有 embedding
 * DELETE /api/graphs/:graphId/embedding
 */
router.delete('/graphs/:graphId/embedding', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 删除 nodes 表中的 embedding
    nodeOperations.deleteEmbeddingsByGraphId(graphId);
    
    // 清理 sqlite-vec 索引
    vecSearchOperations.clearIndexByGraphId(graphId);
    
    res.json({
      success: true,
      message: '已删除所有节点的 embedding 及向量索引'
    });
  } catch (error) {
    console.error('删除 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取向量统计信息
 * GET /api/graphs/:graphId/embedding/stats
 */
router.get('/graphs/:graphId/embedding/stats', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    
    if (nodesWithEmbedding.length === 0) {
      return res.json({
        success: true,
        hasVectors: false,
        message: '图谱中还没有计算 embedding'
      });
    }
    
    // 提取所有向量
    const vectors = nodesWithEmbedding.map(n => JSON.parse(n.embedding));
    
    // 计算统计信息
    const stats = computeVectorStats(vectors);
    
    res.json({
      success: true,
      hasVectors: true,
      nodeCount: nodesWithEmbedding.length,
      dimensions: stats.dimensions,
      mean: stats.mean.slice(0, 10), // 只返回前10维
      std: stats.std.slice(0, 10),
      min: stats.min.slice(0, 10),
      max: stats.max.slice(0, 10)
    });
  } catch (error) {
    console.error('获取向量统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 导出图谱的向量数据
 * GET /api/graphs/:graphId/embedding/export
 */
router.get('/graphs/:graphId/embedding/export', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    
    if (nodesWithEmbedding.length === 0) {
      return res.status(400).json({ error: '图谱中还没有计算 embedding' });
    }
    
    // 导出向量数据
    const nodes = nodesWithEmbedding.map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
      embedding: JSON.parse(n.embedding)
    }));
    
    const jsonData = exportVectorsToJSON(nodes);
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="graph_${graphId}_vectors.json"`);
    
    res.send(jsonData);
  } catch (error) {
    console.error('导出向量数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 导入向量数据
 * POST /api/graphs/:graphId/embedding/import
 */
router.post('/graphs/:graphId/embedding/import', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { data } = req.body;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    if (!data) {
      return res.status(400).json({ error: '导入数据不能为空' });
    }
    
    // 解析导入数据
    const vectors = importVectorsFromJSON(data);
    console.log(`[Embedding Import] 准备导入 ${vectors.length} 个向量`);
    
    // 更新节点的 embedding
    let updatedCount = 0;
    for (const item of vectors) {
      // 查找对应的节点
      const node = nodeOperations.getById(item.id);
      if (node && node.graph_id === graphId) {
        nodeOperations.updateEmbedding(item.id, item.embedding);
        updatedCount++;
      }
    }
    
    res.json({
      success: true,
      message: `成功导入 ${updatedCount} 个节点的向量`,
      imported: updatedCount
    });
  } catch (error) {
    console.error('导入向量数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 增量计算 embedding（只计算新节点）
 * POST /api/graphs/:graphId/embedding/compute/incremental
 */
router.post('/graphs/:graphId/embedding/compute/incremental', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    console.log(`[Incremental Compute] 开始增量计算图谱 ${graphId} 的 embedding...`);
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取所有节点
    const nodes = nodeOperations.getByGraphId(graphId);
    console.log(`[Incremental Compute] 图谱 ${graphId} 共有 ${nodes.length} 个节点`);
    
    if (nodes.length === 0) {
      return res.status(400).json({ error: '图谱中没有节点' });
    }
    
    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Embedding 服务不可用' });
    }
    
    // 分离有 embedding 和没有 embedding 的节点
    const result = await computeMissingEmbeddings(nodes, async (current, total, stage) => {
      console.log(`[Incremental Compute] 进度: ${current}/${total} (${stage})`);
    });
    
    console.log(`[Incremental Compute] 增量计算完成: 计算了 ${result.computed} 个, 跳过了 ${result.skipped} 个`);
    
    // 同步新计算的 embedding 到向量索引
    if (result.computed > 0 && result.newEmbeddings) {
      const items = result.newEmbeddings.map(item => ({
        nodeId: item.id,
        embedding: item.embedding
      }));
      vecSearchOperations.batchAddToIndex(graphId, items);
      console.log(`[Incremental Compute] ✅ 成功同步 ${items.length} 个新向量到索引`);
    }
    
    res.json({
      success: true,
      message: `增量计算完成: 计算了 ${result.computed} 个新向量, 跳过了 ${result.skipped} 个已有向量`,
      ...result
    });
  } catch (error) {
    console.error('增量计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 指定节点批量计算 embedding
 * POST /api/graphs/:graphId/embedding/compute/batch
 */
router.post('/graphs/:graphId/embedding/compute/batch', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodeIds } = req.body;
    
    console.log(`[Batch Compute] 开始批量计算图谱 ${graphId} 的 embedding, 节点数: ${nodeIds?.length || 0}`);
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return res.status(400).json({ error: '请提供要计算 embedding 的节点 ID 列表' });
    }
    
    // 检查 embedding 服务是否可用
    const available = await isEmbeddingServiceAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Embedding 服务不可用' });
    }
    
    // 获取指定节点
    const nodes = nodeIds.map(id => nodeOperations.getById(id)).filter(n => n && n.graph_id === graphId);
    console.log(`[Batch Compute] 找到 ${nodes.length} 个有效节点`);
    
    if (nodes.length === 0) {
      return res.status(400).json({ error: '没有找到有效的节点' });
    }
    
    // 提取节点文本
    const texts = nodes.map(n => nodeToEmbeddingText(n));
    
    // 分批计算
    const embeddings = await getEmbeddingsInBatches(texts, 16, (current, total) => {
      console.log(`[Batch Compute] 进度: ${current}/${total}`);
    });
    
    // 更新到数据库
    const updateData = nodes.map((node, index) => ({
      id: node.id,
      embedding: embeddings[index]
    })).filter(item => item.embedding);
    
    nodeOperations.batchUpdateEmbeddings(graphId, updateData);
    
    // 同步到向量索引
    if (updateData.length > 0) {
      const items = updateData.map(item => ({
        nodeId: item.id,
        embedding: item.embedding
      }));
      vecSearchOperations.batchAddToIndex(graphId, items);
      console.log(`[Batch Compute] ✅ 成功同步 ${items.length} 个节点到向量索引`);
    }
    
    res.json({
      success: true,
      message: `成功计算 ${updateData.length} 个节点的 embedding`,
      computed: updateData.length
    });
  } catch (error) {
    console.error('批量计算 embedding 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 使用指定相似度算法进行搜索
 * GET /api/graphs/:graphId/embedding/search/advanced
 */
router.get('/graphs/:graphId/embedding/search/advanced', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { q, limit = 10, metric = 'cosine', threshold } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    
    if (nodesWithEmbedding.length === 0) {
      return res.status(400).json({ error: '图谱中还没有计算 embedding' });
    }
    
    // 计算查询的 embedding
    const queryEmbedding = await getEmbedding(q);
    
    // 准备候选节点
    const candidates = nodesWithEmbedding.map(n => ({
      id: n.id,
      embedding: JSON.parse(n.embedding)
    }));
    
    // 根据算法类型计算相似度
    let results;
    if (threshold !== undefined) {
      // 使用阈值过滤
      results = filterBySimilarityThreshold(
        queryEmbedding,
        candidates,
        parseFloat(threshold)
      ).slice(0, parseInt(limit));
    } else {
      // 直接查找相似节点
      results = findSimilarNodes(queryEmbedding, candidates, parseInt(limit));
    }
    
    // 获取完整节点信息
    const searchResults = results.map(item => {
      const node = nodesWithEmbedding.find(n => n.id === item.id);
      return {
        ...node,
        properties: JSON.parse(node.properties || '{}'),
        similarity: item.similarity
      };
    });
    
    res.json({
      success: true,
      query: q,
      metric,
      results: searchResults
    });
  } catch (error) {
    console.error('高级搜索失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DBSCAN 聚类分析
 * POST /api/graphs/:graphId/embedding/cluster/dbscan
 */
router.post('/graphs/:graphId/embedding/cluster/dbscan', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { eps = 0.5, minPts = 3 } = req.body;
    
    // 验证图谱是否属于当前用户
    const graph = graphOperations.getByIdAndUserId(graphId, req.user.id);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    
    if (nodesWithEmbedding.length < 2) {
      return res.status(400).json({ error: '需要至少 2 个节点才能进行聚类' });
    }
    
    // 提取向量
    const vectors = nodesWithEmbedding.map(n => JSON.parse(n.embedding));
    
    // 执行 DBSCAN 聚类
    console.log(`[DBSCAN] 开始聚类: eps=${eps}, minPts=${minPts}`);
    const clusters = dbscanClustering(vectors, eps, minPts);
    console.log(`[DBSCAN] 聚类完成: 生成了 ${clusters.length} 个聚类`);
    
    // 映射回节点
    const nodeIdList = nodesWithEmbedding.map(n => n.id);
    const clusterResults = clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      isNoise: cluster.isNoise || false,
      nodeCount: cluster.indices.length,
      nodes: cluster.indices.map(index => {
        const nodeId = nodeIdList[index];
        const node = nodesWithEmbedding.find(n => n.id === nodeId);
        return {
          id: node.id,
          label: node.label,
          type: node.type,
          properties: JSON.parse(node.properties || '{}')
        };
      })
    }));
    
    res.json({
      success: true,
      algorithm: 'DBSCAN',
      params: { eps, minPts },
      totalNodes: nodesWithEmbedding.length,
      clusterCount: clusters.length,
      clusters: clusterResults
    });
  } catch (error) {
    console.error('DBSCAN 聚类失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取向量配置信息
 * GET /api/embedding/config
 */
router.get('/embedding/config', authMiddleware, (req, res) => {
  try {
    const config = getVectorConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新向量配置
 * PUT /api/embedding/config
 */
router.put('/embedding/config', authMiddleware, async (req, res) => {
  try {
    const { cacheEnabled, batchSize, maxRetries, retryDelay } = req.body;
    
    // 验证参数
    if (batchSize !== undefined && (batchSize < 1 || batchSize > 100)) {
      return res.status(400).json({ error: 'batchSize 必须在 1-100 之间' });
    }
    
    if (maxRetries !== undefined && (maxRetries < 0 || maxRetries > 10)) {
      return res.status(400).json({ error: 'maxRetries 必须在 0-10 之间' });
    }
    
    // 更新配置 - 动态导入 updateVectorConfig 函数
    const { updateVectorConfig: updateConfig } = await import('./services/embeddingService.js');
    
    const newConfig = {};
    if (cacheEnabled !== undefined) newConfig.cacheEnabled = cacheEnabled;
    if (batchSize !== undefined) newConfig.batchSize = batchSize;
    if (maxRetries !== undefined) newConfig.maxRetries = maxRetries;
    if (retryDelay !== undefined) newConfig.retryDelay = retryDelay;
    
    updateConfig(newConfig);
    
    res.json({
      success: true,
      message: '配置已更新',
      config: getVectorConfig()
    });
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 全局统计缓存（定时更新）==========
// 缓存统计数据，每隔1分钟更新一次
let statsCache = {
  users: 0,
  graphs: 0,
  nodes: 0,
  edges: 0,
  databaseSize: 0,  // 数据库文件大小（字节）
  updatedAt: null
};

/**
 * 更新统计缓存
 */
function updateStatsCache() {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const graphCount = db.prepare('SELECT COUNT(*) as count FROM graphs').get().count;
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get().count;
    const edgeCount = db.prepare('SELECT COUNT(*) as count FROM edges').get().count;
    
    // 计算数据库文件大小
    let databaseSize = 0;
    const dbPath = path.join(__dirname, '..', 'data', 'knowledge-graph.db');
    try {
      const stats = fs.statSync(dbPath);
      databaseSize = stats.size;
    } catch (e) {
      console.log('[Stats Cache] 无法获取数据库文件大小:', e.message);
    }
    
    statsCache = {
      users: userCount,
      graphs: graphCount,
      nodes: nodeCount,
      edges: edgeCount,
      databaseSize,
      updatedAt: new Date().toISOString()
    };
    
    console.log(`[Stats Cache] 统计已更新: 用户=${userCount}, 图谱=${graphCount}, 节点=${nodeCount}, 边=${edgeCount}, 数据库大小=${(databaseSize / 1024 / 1024).toFixed(2)}MB`);
  } catch (error) {
    console.error('[Stats Cache] 更新统计缓存失败:', error);
  }
}

// 启动定时任务：每隔1分钟更新一次缓存
setInterval(updateStatsCache, 60 * 1000);
// 启动时立即更新一次
updateStatsCache();

// 全局统计路由 - 读取缓存（无需登录）
router.get('/stats/global', (req, res) => {
  try {
    res.json(statsCache);
  } catch (error) {
    console.error('获取全局统计失败:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 强制刷新统计缓存（管理员可调用）
router.post('/stats/global/refresh', authMiddleware, (req, res) => {
  try {
    // 检查是否是管理员
    const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
    if (!isAdmin) {
      return res.status(403).json({ error: '只有管理员可以刷新统计缓存' });
    }
    
    updateStatsCache();
    res.json({
      success: true,
      message: '统计缓存已刷新',
      ...statsCache
    });
  } catch (error) {
    console.error('刷新全局统计失败:', error);
    res.status(500).json({ error: '刷新统计数据失败' });
  }
});

// ========== 向量维度自动检测 API（需要认证）==========

/**
 * 自动检测向量维度
 * GET /api/embedding/dimensions/detect
 * 
 * 说明：调用 embedding API 获取实际的向量维度，并更新配置
 */
router.get('/embedding/dimensions/detect', authMiddleware, async (req, res) => {
  try {
    console.log('[Dimension Detection] 开始自动检测向量维度...');
    
    // 调用 embedding API 检测维度
    const detectedDimensions = await autoDetectDimensions();
    
    if (detectedDimensions === null) {
      console.error('[Dimension Detection] 向量维度检测失败');
      return res.status(503).json({ 
        success: false, 
        error: '无法连接到 embedding 服务，请确保本地 embedding 服务正在运行' 
      });
    }
    
    const config = getVectorConfig();
    console.log(`[Dimension Detection] ✅ 检测成功: ${detectedDimensions} 维 (当前配置: ${config.dimensions} 维)`);
    
    res.json({
      success: true,
      message: `向量维度检测成功: ${detectedDimensions} 维`,
      detectedDimensions,
      previousDimensions: config.dimensions,
      config: {
        url: config.url,
        model: config.model,
        dimensions: detectedDimensions
      }
    });
  } catch (error) {
    console.error('[Dimension Detection] 向量维度检测失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 重新初始化向量索引表
 * POST /api/embedding/dimensions/reinit
 * 
 * 说明：当向量维度发生变化时，需要重新创建向量索引表
 * 注意：这会清空现有的向量索引数据！
 */
router.post('/embedding/dimensions/reinit', authMiddleware, async (req, res) => {
  try {
    const { dimensions } = req.body;
    
    console.log(`[VecIndex Reinit] 收到重新初始化请求...`);
    
    // 1. 首先检测实际的向量维度
    const detectedDimensions = await autoDetectDimensions();
    
    if (detectedDimensions === null) {
      console.error('[VecIndex Reinit] 无法检测向量维度');
      return res.status(503).json({ 
        success: false, 
        error: '无法连接到 embedding 服务，请确保本地 embedding 服务正在运行' 
      });
    }
    
    // 使用检测到的维度或请求中指定的维度
    const targetDimensions = dimensions || detectedDimensions;
    
    console.log(`[VecIndex Reinit] 目标维度: ${targetDimensions}`);
    
    // 2. 检查是否需要重新初始化（维度是否变化）
    const currentConfig = getVectorConfig();
    if (currentConfig.dimensions === targetDimensions) {
      console.log(`[VecIndex Reinit] 维度未变化 (${targetDimensions})，无需重新初始化`);
      return res.json({
        success: true,
        message: `向量维度未变化 (${targetDimensions})，无需重新初始化`,
        dimensions: targetDimensions,
        reinitialized: false
      });
    }
    
    // 3. 重新初始化向量索引表
    console.log(`[VecIndex Reinit] 开始重新初始化向量索引表，维度: ${targetDimensions}`);
    const result = vecSearchOperations.reinitializeIndex(targetDimensions);
    
    if (!result) {
      console.error('[VecIndex Reinit] 重新初始化失败');
      return res.status(500).json({ 
        success: false, 
        error: '重新初始化向量索引表失败' 
      });
    }
    
    console.log(`[VecIndex Reinit] ✅ 重新初始化成功`);
    
    res.json({
      success: true,
      message: `向量索引表已重新初始化，维度: ${targetDimensions}`,
      dimensions: targetDimensions,
      previousDimensions: currentConfig.dimensions,
      reinitialized: true,
      warning: '向量索引已清空，请重新计算所有节点的 embedding'
    });
  } catch (error) {
    console.error('[VecIndex Reinit] 重新初始化失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取当前向量维度信息
 * GET /api/embedding/dimensions/info
 */
router.get('/embedding/dimensions/info', authMiddleware, async (req, res) => {
  try {
    const config = getVectorConfig();
    const available = await isEmbeddingServiceAvailable();
    
    let detectedDimensions = null;
    if (available) {
      detectedDimensions = await autoDetectDimensions();
    }
    
    res.json({
      success: true,
      config: {
        url: config.url,
        model: config.model,
        dimensions: config.dimensions,
        autoDetectEnabled: config.autoDetectDimensions
      },
      serviceAvailable: available,
      detectedDimensions,
      needsReinit: detectedDimensions !== null && detectedDimensions !== config.dimensions
    });
  } catch (error) {
    console.error('[Dimension Info] 获取维度信息失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 自动检测并重新初始化（组合操作）
 * POST /api/embedding/dimensions/auto-adapter
 * 
 * 说明：自动检测向量维度，如果与当前配置不一致，则重新初始化向量索引表
 */
router.post('/embedding/dimensions/auto-adapter', authMiddleware, async (req, res) => {
  try {
    console.log('[Auto Adapter] 开始自动适配向量维度...');
    
    // 1. 检测实际的向量维度
    const detectedDimensions = await autoDetectDimensions();
    
    if (detectedDimensions === null) {
      console.error('[Auto Adapter] 无法检测向量维度');
      return res.status(503).json({ 
        success: false, 
        error: '无法连接到 embedding 服务，请确保本地 embedding 服务正在运行' 
      });
    }
    
    const currentConfig = getVectorConfig();
    
    // 2. 比较维度
    if (currentConfig.dimensions === detectedDimensions) {
      console.log(`[Auto Adapter] 维度匹配，无需调整 (${detectedDimensions})`);
      return res.json({
        success: true,
        message: `向量维度匹配，无需调整`,
        dimensions: detectedDimensions,
        adjusted: false
      });
    }
    
    console.log(`[Auto Adapter] 维度不匹配: 当前 ${currentConfig.dimensions}，检测到 ${detectedDimensions}`);
    console.log(`[Auto Adapter] 开始重新初始化向量索引表...`);
    
    // 3. 重新初始化向量索引表
    const result = vecSearchOperations.reinitializeIndex(detectedDimensions);
    
    if (!result) {
      console.error('[Auto Adapter] 重新初始化失败');
      return res.status(500).json({ 
        success: false, 
        error: '重新初始化向量索引表失败' 
      });
    }
    
    console.log(`[Auto Adapter] ✅ 自动适配完成`);
    
    res.json({
      success: true,
      message: `向量维度已自动适配: ${currentConfig.dimensions} → ${detectedDimensions}`,
      dimensions: detectedDimensions,
      previousDimensions: currentConfig.dimensions,
      adjusted: true,
      warning: '向量索引已清空，请重新计算所有节点的 embedding'
    });
  } catch (error) {
    console.error('[Auto Adapter] 自动适配失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 套餐 API（无需认证）==========

/**
 * 获取所有可用套餐
 * GET /api/plans
 */
router.get('/plans', (req, res) => {
  try {
    // 返回预定义的套餐列表
    const plans = [
      {
        id: 'plan_free',
        name: '免费版',
        slug: 'free',
        description: '适合个人学习和小规模项目',
        price_monthly: 0,
        price_yearly: 0,
        features: [
          '3 个图谱',
          '1,000 节点',
          '100 次 API 调用/月',
          '基础图谱可视化',
          '社区支持'
        ],
        limits: {
          graphs_limit: 3,
          nodes_limit: 1000,
          api_quota: 100,
          snapshots_limit: 1,
          workspaces_limit: 1,
          storage_mb: 10
        },
        is_active: true
      },
      {
        id: 'plan_personal',
        name: '个人版',
        slug: 'personal',
        description: '适合个人开发者和爱好者',
        price_monthly: 29,
        price_yearly: 290,
        features: [
          '10 个图谱',
          '10,000 节点',
          '10,000 次 API 调用/月',
          '高级图谱可视化',
          'Embedding 语义搜索',
          'Email 支持'
        ],
        limits: {
          graphs_limit: 10,
          nodes_limit: 10000,
          api_quota: 10000,
          snapshots_limit: 5,
          workspaces_limit: 3,
          storage_mb: 100
        },
        is_active: true
      },
      {
        id: 'plan_team',
        name: '团队版',
        slug: 'team',
        description: '适合小团队协作',
        price_monthly: 99,
        price_yearly: 990,
        features: [
          '50 个图谱',
          '100,000 节点',
          '100,000 次 API 调用/月',
          '团队协作功能',
          '高级可视化与主题',
          'Priority 支持'
        ],
        limits: {
          graphs_limit: 50,
          nodes_limit: 100000,
          api_quota: 100000,
          snapshots_limit: 20,
          workspaces_limit: 10,
          storage_mb: 1024
        },
        is_active: true
      },
      {
        id: 'plan_enterprise',
        name: '企业版',
        slug: 'enterprise',
        description: '适合企业级应用',
        price_monthly: 299,
        price_yearly: 2990,
        features: [
          '无限图谱',
          '无限节点',
          '无限 API 调用',
          '私有化部署选项',
          '专属客户成功经理',
          'SLA 保障'
        ],
        limits: {
          graphs_limit: -1,  // 无限制
          nodes_limit: -1,
          api_quota: -1,
          snapshots_limit: -1,
          workspaces_limit: -1,
          storage_mb: 10240
        },
        is_active: true
      }
    ];
    
    res.json(plans);
  } catch (error) {
    console.error('获取套餐列表失败:', error);
    res.status(500).json({ error: '获取套餐列表失败' });
  }
});

// ========== 租户 API（需要认证）==========

/**
 * 获取当前用户的租户信息
 * GET /api/tenant/me
 */
router.get('/tenant/me', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    
    // 尝试获取租户信息，如果表不存在则返回默认租户
    let tenant = null;
    try {
      tenant = db.prepare(`
        SELECT * FROM tenants WHERE id = ?
      `).get(user.tenant_id || user.id);
    } catch (e) {
      // 表可能不存在，忽略
    }
    
    if (tenant) {
      return res.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan || 'free',
          created_at: tenant.created_at
        }
      });
    }
    
    // 如果没有租户记录，返回默认租户信息
    res.json({
      tenant: {
        id: user.id,
        name: user.username + ' 的租户',
        slug: user.username,
        status: 'active',
        plan: 'free'
      }
    });
  } catch (error) {
    console.error('获取租户信息失败:', error);
    // 返回默认租户而不是错误
    res.json({
      tenant: {
        id: req.user.id,
        name: req.user.username + ' 的租户',
        slug: req.user.username,
        status: 'active',
        plan: 'free'
      }
    });
  }
});

/**
 * 获取当前租户的订阅信息
 * GET /api/tenant/subscription
 */
router.get('/tenant/subscription', authMiddleware, (req, res) => {
  // 直接返回默认订阅信息，不查询数据库
  res.json({
    subscription: {
      plan: 'free',
      status: 'active'
    }
  });
});

/**
 * 更改套餐
 * POST /api/tenant/change-plan
 */
router.post('/tenant/change-plan', authMiddleware, (req, res) => {
  try {
    const { plan_id } = req.body;
    
    if (!plan_id) {
      return res.status(400).json({ error: '请选择要升级的套餐' });
    }
    
    // 获取套餐信息
    const plans = [
      { id: 'plan_free', slug: 'free' },
      { id: 'plan_personal', slug: 'personal' },
      { id: 'plan_team', slug: 'team' },
      { id: 'plan_enterprise', slug: 'enterprise' }
    ];
    
    const plan = plans.find(p => p.id === plan_id);
    if (!plan) {
      return res.status(400).json({ error: '无效的套餐 ID' });
    }
    
    res.json({
      success: true,
      message: `已成功切换到 ${plan.slug} 套餐（本地模式暂不支持订阅更改）`,
      plan: plan.slug
    });
  } catch (error) {
    console.error('更改套餐失败:', error);
    res.status(500).json({ error: '更改套餐失败' });
  }
});

/**
 * 取消订阅
 * POST /api/tenant/cancel-subscription
 */
router.post('/tenant/cancel-subscription', authMiddleware, (req, res) => {
  // 直接返回成功，不实际修改数据库
  res.json({
    success: true,
    message: '订阅已取消（本地模式暂不支持）'
  });
});

// ========== 使用量 API（需要认证）==========

/**
 * 获取当前用户的使用量
 * GET /api/usage/current
 */
router.get('/usage/current', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    
    // 获取用户的图谱数量
    let graphCount = 0;
    let nodeCount = 0;
    
    try {
      graphCount = db.prepare(`
        SELECT COUNT(*) as count FROM graphs WHERE user_id = ?
      `).get(user.id)?.count || 0;
      
      nodeCount = db.prepare(`
        SELECT COUNT(*) as count FROM nodes n
        JOIN graphs g ON n.graph_id = g.id
        WHERE g.user_id = ?
      `).get(user.id)?.count || 0;
    } catch (e) {
      // 表查询失败，保持默认值 0
    }
    
    res.json({
      plan: 'free',
      period: new Date().toISOString().slice(0, 7),
      usage: {
        graphs: graphCount,
        nodes: nodeCount,
        api_calls: 0
      },
      quota: {
        graphs_limit: 3,
        nodes_limit: 1000,
        api_quota: 100,
        snapshots_limit: 1,
        workspaces_limit: 1,
        storage_mb: 10
      }
    });
  } catch (error) {
    console.error('获取使用量失败:', error);
    // 返回默认值而不是错误
    res.json({
      plan: 'free',
      period: new Date().toISOString().slice(0, 7),
      usage: {
        graphs: 0,
        nodes: 0,
        api_calls: 0
      },
      quota: {
        graphs_limit: 3,
        nodes_limit: 1000,
        api_quota: 100,
        snapshots_limit: 1,
        workspaces_limit: 1,
        storage_mb: 10
      }
    });
  }
});

// ========== 管理员 API（需要认证）==========

// 检查是否为管理员的辅助函数
function requireAdmin(req, res) {
  const isAdmin = req.user.username === 'admin' || req.user.is_admin === 1;
  if (!isAdmin) {
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }
  return true;
}

/**
 * 获取所有租户列表
 * GET /api/admin/tenants
 */
router.get('/admin/tenants', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;
  
  try {
    // 获取所有租户
    let tenants = [];
    try {
      tenants = db.prepare(`
        SELECT t.*, 
               (SELECT COUNT(*) FROM graphs WHERE user_id = t.id) as graph_count,
               (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count
        FROM tenants t
        ORDER BY t.created_at DESC
      `).all();
    } catch (e) {
      // 表可能不存在，返回空列表
      tenants = [];
    }
    
    res.json({
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        plan: t.plan || 'free',
        graph_count: t.graph_count || 0,
        user_count: t.user_count || 1,
        created_at: t.created_at,
        updated_at: t.updated_at
      }))
    });
  } catch (error) {
    console.error('获取租户列表失败:', error);
    res.status(500).json({ error: '获取租户列表失败' });
  }
});

/**
 * 获取单个租户详情
 * GET /api/admin/tenants/:id
 */
router.get('/admin/tenants/:id', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;
  
  try {
    const { id } = req.params;
    
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }
    
    // 获取租户的图谱数量
    const graphCount = db.prepare('SELECT COUNT(*) as count FROM graphs WHERE user_id = ?').get(id)?.count || 0;
    
    // 获取租户的 API 调用次数（本月）
    let apiCalls = 0;
    try {
      const usage = db.prepare(`
        SELECT COUNT(*) as count FROM api_usage_log
        WHERE user_id = ? AND created_at >= datetime('now', 'start of month')
      `).get(id);
      apiCalls = usage?.count || 0;
    } catch (e) {}
    
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan || 'free',
        graph_count: graphCount,
        api_calls_monthly: apiCalls,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at
      }
    });
  } catch (error) {
    console.error('获取租户详情失败:', error);
    res.status(500).json({ error: '获取租户详情失败' });
  }
});

/**
 * 暂停租户
 * POST /api/admin/tenants/:id/suspend
 */
router.post('/admin/tenants/:id/suspend', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;
  
  try {
    const { id } = req.params;
    
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }
    
    // 更新租户状态为暂停
    db.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('suspended', id);
    
    res.json({
      success: true,
      message: '租户已暂停'
    });
  } catch (error) {
    console.error('暂停租户失败:', error);
    res.status(500).json({ error: '暂停租户失败' });
  }
});

/**
 * 激活租户
 * POST /api/admin/tenants/:id/activate
 */
router.post('/admin/tenants/:id/activate', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;
  
  try {
    const { id } = req.params;
    
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }
    
    // 更新租户状态为活跃
    db.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('active', id);
    
    res.json({
      success: true,
      message: '租户已激活'
    });
  } catch (error) {
    console.error('激活租户失败:', error);
    res.status(500).json({ error: '激活租户失败' });
  }
});

/**
 * 删除租户
 * DELETE /api/admin/tenants/:id
 */
router.delete('/admin/tenants/:id', authMiddleware, (req, res) => {
  if (!requireAdmin(req, res)) return;
  
  try {
    const { id } = req.params;
    
    // 不允许删除管理员账户
    if (id === 'admin' || id === 1) {
      return res.status(400).json({ error: '不能删除管理员账户' });
    }
    
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) {
      return res.status(404).json({ error: '租户不存在' });
    }
    
    // 删除租户（及其关联数据通过外键级联或手动删除）
    try {
      // 删除租户的订阅
      db.prepare('DELETE FROM subscriptions WHERE tenant_id = ?').run(id);
      
      // 删除租户
      db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    } catch (e) {
      console.log('删除租户关联数据失败:', e.message);
    }
    
    res.json({
      success: true,
      message: '租户已删除'
    });
  } catch (error) {
    console.error('删除租户失败:', error);
    res.status(500).json({ error: '删除租户失败' });
  }
});

export default router;
