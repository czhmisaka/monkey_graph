import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { 
  agentOperations, 
  workspaceOperations, 
  graphOperations, 
  nodeOperations, 
  edgeOperations,
  graphVersionOperations,
  graphAgentPermissionOperations,
  agentApiLogOperations,
  userAgentOperations,
  vecSearchOperations
} from './database.js';
import { agentAuthMiddleware, requirePermission } from './agentAuth.js';
import { 
  getEmbedding,
  getEmbeddings, 
  findSimilarNodes,
  kMeansClustering,
  nodeToEmbeddingText,
  isEmbeddingServiceAvailable 
} from './services/embeddingService.js';
import { 
  formatListResponse,
  formatItemResponse,
  formatBatchResponse,
  formatError,
  parseFieldsParam,
  isSummaryMode,
  getSummaryFields,
  filterFields
} from './utils/responseFormatter.js';
import { 
  queryNodes, 
  aggregateNodes, 
  groupByType,
  rankNodes,
  getTopNodes,
  getFieldStatsEnhanced,
  QueryParser,
  OPERATORS,
  AGGREGATE_OPERATIONS
} from './utils/queryParser.js';

const router = express.Router();

// ========== Agent 管理 API ==========

// 注册新 Agent (需要用户认证)
router.post('/register', (req, res) => {
  try {
    const { name, description, workspace_id, permissions, rate_limit, monthly_quota } = req.body;
    
    if (!name) {
      return res.status(400).json(formatError('Agent 名称不能为空', 'MISSING_NAME'));
    }
    
    // 如果指定了 workspace_id，验证 workspace 存在
    if (workspace_id) {
      const workspace = workspaceOperations.getById(workspace_id);
      if (!workspace) {
        return res.status(400).json(formatError('指定的 workspace 不存在', 'WORKSPACE_NOT_FOUND'));
      }
    }
    
    const agent = agentOperations.create({
      name,
      description,
      workspace_id,
      permissions,
      rate_limit,
      monthly_quota
    });
    
    // 注册成功返回完整信息（需要显示 API key）
    res.status(201).json({ agent });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'REGISTER_FAILED'));
  }
});

// 获取当前 Agent 信息
router.get('/me', agentAuthMiddleware, (req, res) => {
  res.json({ agent: formatItemResponse(req.agent, req.query, 'agent') });
});

// 更新 Agent 信息
router.put('/me', agentAuthMiddleware, (req, res) => {
  try {
    const { name, description, permissions, rate_limit, monthly_quota, is_active } = req.body;
    
    const updated = agentOperations.update(req.agent.id, {
      name,
      description,
      permissions,
      rate_limit,
      monthly_quota,
      is_active
    });
    
    res.json({ agent: formatItemResponse(updated, req.query, 'agent') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_AGENT_FAILED'));
  }
});

// 轮换 API Key
router.post('/rotate-key', agentAuthMiddleware, (req, res) => {
  try {
    const result = agentOperations.rotateApiKey(req.agent.id);
    res.json({
      api_key: result.api_key,
      message: '请妥善保存新的 API Key，它只会显示一次'
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ROTATE_KEY_FAILED'));
  }
});

// 获取配额使用情况
router.get('/quota', agentAuthMiddleware, (req, res) => {
  res.json({
    quota: {
      monthly_quota: req.agent.monthly_quota,
      requests_used: req.agent.requests_used,
      remaining: req.agent.monthly_quota - req.agent.requests_used,
      reset_at: getNextMonthReset()
    }
  });
});

// ========== 图谱操作 API ==========

// 获取 Agent 可访问的图谱列表（包括自己创建的 + 被授权的）
router.get('/graphs', agentAuthMiddleware, (req, res) => {
  try {
    // 使用授权系统获取可访问的图谱
    const graphs = graphAgentPermissionOperations.getAccessibleGraphs(req.agent.id);
    const response = formatListResponse(graphs, req.query, 'graph');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_GRAPHS_FAILED'));
  }
});

// 获取 Agent 对指定图谱的权限
router.get('/graphs/:graphId/permission', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有访问权限', 'ACCESS_DENIED'));
    }
    
    const hasWriteAccess = graphAgentPermissionOperations.hasWriteAccess(req.agent.id, graphId);
    res.json({
      permission: hasWriteAccess ? 'write' : 'read'
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_PERMISSION_FAILED'));
  }
});

// ========== 图谱授权管理 API ==========

// 获取图谱已授权的 Agent 列表
router.get('/graphs/:graphId/agents', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 获取授权列表
    const permissions = graphAgentPermissionOperations.getByGraphId(graphId);
    const response = formatListResponse(permissions, req.query, 'agent');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_AGENTS_FAILED'));
  }
});

// 授权 Agent 访问图谱
router.post('/graphs/:graphId/agents', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId } = req.params;
    const { agent_id, permission = 'read' } = req.body;
    
    if (!agent_id) {
      return res.status(400).json(formatError('Agent ID 不能为空', 'MISSING_AGENT_ID'));
    }
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 验证 Agent 是否存在
    const targetAgent = agentOperations.getById(agent_id);
    if (!targetAgent) {
      return res.status(404).json(formatError('Agent 不存在', 'AGENT_NOT_FOUND'));
    }
    
    // 检查是否已经授权
    const existingPermission = graphAgentPermissionOperations.getByAgentAndGraph(agent_id, graphId);
    if (existingPermission) {
      return res.status(400).json(formatError('该 Agent 已经被授权', 'ALREADY_AUTHORIZED'));
    }
    
    // 创建授权
    const newPermission = graphAgentPermissionOperations.create({
      graph_id: graphId,
      agent_id,
      permission,
      created_by: req.agent.id
    });
    
    res.status(201).json({ permission: formatItemResponse(newPermission, req.query, 'agent') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_PERMISSION_FAILED'));
  }
});

// 更新 Agent 对图谱的权限
router.put('/graphs/:graphId/agents/:agentId', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId, agentId } = req.params;
    const { permission } = req.body;
    
    if (!permission) {
      return res.status(400).json(formatError('权限不能为空', 'MISSING_PERMISSION'));
    }
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 获取现有授权
    const existingPermission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    if (!existingPermission) {
      return res.status(404).json(formatError('授权不存在', 'PERMISSION_NOT_FOUND'));
    }
    
    // 更新权限
    const updated = graphAgentPermissionOperations.update(existingPermission.id, { permission });
    
    res.json({ permission: formatItemResponse(updated, req.query, 'agent') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_PERMISSION_FAILED'));
  }
});

// 撤销 Agent 对图谱的授权
router.delete('/graphs/:graphId/agents/:agentId', agentAuthMiddleware, (req, res) => {
  try {
    const { graphId, agentId } = req.params;
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 获取现有授权
    const existingPermission = graphAgentPermissionOperations.getByAgentAndGraph(agentId, graphId);
    if (!existingPermission) {
      return res.status(404).json(formatError('授权不存在', 'PERMISSION_NOT_FOUND'));
    }
    
    // 撤销授权
    graphAgentPermissionOperations.delete(existingPermission.id);
    
    res.json({ message: '已撤销授权' });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_PERMISSION_FAILED'));
  }
});

// ========== 管理员 API ==========

// 获取所有图谱（需要管理员权限）
router.get('/admin/graphs', agentAuthMiddleware, (req, res) => {
  try {
    // 检查是否是管理员 Agent（通过 special 标记）
    if (!req.agent.permissions || !req.agent.permissions.special || !req.agent.permissions.special.includes('admin')) {
      return res.status(403).json(formatError('需要管理员权限', 'ADMIN_REQUIRED'));
    }
    
    const graphs = graphOperations.getAll();
    const response = formatListResponse(graphs, req.query, 'graph');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_GET_GRAPHS_FAILED'));
  }
});

// 获取所有 Agent 列表（需要管理员权限）
router.get('/admin/agents', agentAuthMiddleware, (req, res) => {
  try {
    // 检查是否是管理员 Agent
    if (!req.agent.permissions || !req.agent.permissions.special || !req.agent.permissions.special.includes('admin')) {
      return res.status(403).json(formatError('需要管理员权限', 'ADMIN_REQUIRED'));
    }
    
    const agents = agentOperations.getAll();
    const response = formatListResponse(agents, req.query, 'agent');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ADMIN_GET_AGENTS_FAILED'));
  }
});

// 创建图谱
router.post('/graphs', agentAuthMiddleware, requirePermission('graphs', 'write'), (req, res) => {
  try {
    const { name, description, workspace_id } = req.body;
    
    if (!name) {
      return res.status(400).json(formatError('图谱名称不能为空', 'MISSING_NAME'));
    }
    
    // Agent 创建的图谱需要关联到一个默认用户
    // 检查是否有用户存在，如果没有则使用 agent id 作为标识
    const defaultUserId = 'agent-' + req.agent.id;
    
    const graph = graphOperations.create({
      id: uuidv4(),
      user_id: defaultUserId,
      name,
      description: description || ''
    });
    
    // 自动给创建此图谱的 Agent 添加读写权限
    const existingAuth = graphAgentPermissionOperations.getByAgentAndGraph(req.agent.id, graph.id);
    if (!existingAuth) {
      graphAgentPermissionOperations.create({
        graph_id: graph.id,
        agent_id: req.agent.id,
        permission: 'write',
        created_by: req.agent.id
      });
      console.log(`[Agent] 自动授权 Agent ${req.agent.id} 访问图谱 ${graph.id} (读写权限)`);
    }
    
    res.status(201).json({ graph: formatItemResponse(graph, req.query, 'graph') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_GRAPH_FAILED'));
  }
});

// 创建节点（自动计算 Embedding）
router.post('/graphs/:graphId/nodes', agentAuthMiddleware, requirePermission('nodes', 'write'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { label, type, properties, x, y, auto_embedding = true } = req.body;
    
    if (!label) {
      return res.status(400).json(formatError('节点标签不能为空', 'MISSING_LABEL'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const nodeId = req.body.id || uuidv4();
    const newNode = nodeOperations.createForGraph({
      id: nodeId,
      label,
      type: type || 'default',
      properties: properties || {},
      x: x || Math.random() * 800,
      y: y || Math.random() * 600
    }, graphId);
    
    const resultNode = { ...newNode, properties: JSON.parse(newNode.properties || '{}') };
    
    // 默认自动计算 Embedding
    let embeddingResult = null;
    if (auto_embedding) {
      try {
        const embeddingAvailable = await isEmbeddingServiceAvailable();
        if (embeddingAvailable) {
          const { getEmbedding } = await import('./services/embeddingService.js');
          const embedding = await getEmbedding(nodeToEmbeddingText(resultNode));
          if (embedding) {
            nodeOperations.update(nodeId, { embedding });
            
            // 同步到向量索引
            try {
              vecSearchOperations.addToIndex(nodeId, graphId, embedding);
            } catch (e) {
              console.log(`[Agent] 节点 ${nodeId} 添加到向量索引失败:`, e.message);
            }
            
            embeddingResult = { computed: 1 };
            console.log(`[Agent] 节点 "${label}" embedding 计算完成`);
          }
        }
      } catch (embError) {
        console.error('[Agent] 节点 embedding 计算失败:', embError.message);
      }
    }
    
    res.status(201).json({
      node: formatItemResponse(resultNode, req.query, 'node'),
      embedding: embeddingResult
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_NODE_FAILED'));
  }
});

// 获取图谱详情（精简版：默认不返回 nodes 和 edges）
router.get('/graphs/:id', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const graph = graphOperations.getById(req.params.id);
    
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 检查 Agent 是否有权限访问此图谱（支持 owner 和授权两种方式）
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, req.params.id);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }
    
    // 默认只返回图谱基本信息，nodes/edges 需要通过单独接口获取
    res.json({ 
      graph: formatItemResponse(graph, req.query, 'graph')
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_GRAPH_FAILED'));
  }
});

// ========== 图谱概览 API（方案1：Summary 模式）==========

// 获取图谱概览（轻量接口：节点列表 + 边列表 + 统计信息）
router.get('/graphs/:id/summary', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const graph = graphOperations.getById(req.params.id);
    
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 检查 Agent 是否有权限访问此图谱
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, req.params.id);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }
    
    // 获取节点和边（只返回基本字段）
    const nodes = nodeOperations.getByGraphId(req.params.id).map(n => ({
      id: n.id,
      label: n.label,
      type: n.type
    }));
    const edges = edgeOperations.getByGraphId(req.params.id).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type
    }));
    
    // 统计信息
    const typeCounts = {};
    nodes.forEach(n => {
      typeCounts[n.type || 'default'] = (typeCounts[n.type || 'default'] || 0) + 1;
    });
    
    res.json({ 
      graph: {
        id: graph.id,
        name: graph.name,
        description: graph.description,
        created_at: graph.created_at
      },
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        typeDistribution: typeCounts
      },
      nodes,
      edges
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_GRAPH_SUMMARY_FAILED'));
  }
});

// ========== 分页节点/边 API（方案2：分页加载）==========

// 分页获取节点列表
router.get('/graphs/:graphId/nodes', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, type, fields } = req.query;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }
    
    let nodes = nodeOperations.getByGraphId(graphId);
    
    // 按类型过滤
    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }
    
    const total = nodes.length;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 100, 500); // 最多500条
    const offset = (pageNum - 1) * limitNum;
    
    // 分页
    nodes = nodes.slice(offset, offset + limitNum);
    
    // 解析 properties 并处理字段过滤
    const parsedNodes = nodes.map(n => {
      const node = {
        ...n,
        properties: JSON.parse(n.properties || '{}')
      };
      
      // 字段过滤
      if (fields) {
        const fieldSet = new Set(fields.split(',').map(f => f.trim()));
        const filtered = {};
        fieldSet.forEach(f => {
          if (node[f] !== undefined) filtered[f] = node[f];
        });
        return filtered;
      }
      
      // 默认排除 embedding
      const { embedding, ...rest } = node;
      return rest;
    });
    
    res.json({
      nodes: parsedNodes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_NODES_FAILED'));
  }
});

// 分页获取边列表
router.get('/graphs/:graphId/edges', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { page = 1, limit = 100, fields } = req.query;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }
    
    let edges = edgeOperations.getByGraphId(graphId);
    const total = edges.length;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offset = (pageNum - 1) * limitNum;
    
    // 分页
    edges = edges.slice(offset, offset + limitNum);
    
    // 解析 properties 并处理字段过滤
    const parsedEdges = edges.map(e => {
      const edge = {
        ...e,
        properties: JSON.parse(e.properties || '{}')
      };
      
      if (fields) {
        const fieldSet = new Set(fields.split(',').map(f => f.trim()));
        const filtered = {};
        fieldSet.forEach(f => {
          if (edge[f] !== undefined) filtered[f] = edge[f];
        });
        return filtered;
      }
      
      // 默认排除 embedding
      const { embedding, ...rest } = edge;
      return rest;
    });
    
    res.json({
      edges: parsedEdges,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_EDGES_FAILED'));
  }
});

// 导出图谱为 PNG 图片（全景图谱）
router.get('/graphs/:id/export', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { id: graphId } = req.params;
    const { width, height, scale } = req.query;
    
    console.log(`[Agent Export] 收到导出请求: graphId=${graphId}`);
    
    // 验证图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json({ error: '图谱不存在' });
    }
    
    // 检查 Agent 是否有权限访问此图谱（支持 owner 和授权两种方式）
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json({ error: '没有权限导出此图谱', code: 'GRAPH_ACCESS_DENIED' });
    }
    
    // 直接从数据库获取图谱数据
    const nodes = nodeOperations.getByGraphId(graphId).map(n => ({
      ...n,
      properties: JSON.parse(n.properties || '{}')
    }));
    const edges = edgeOperations.getByGraphId(graphId).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));
    
    if (!nodes || nodes.length === 0) {
      return res.status(400).json({ error: '图谱中没有节点' });
    }
    
    console.log(`[Agent Export] 图谱数据: ${nodes.length} 个节点, ${edges?.length || 0} 条边`);
    
    // 调用前端服务生成图片（传递图谱数据）
    const frontendUrl = new URL('/api/export/png', process.env.FRONTEND_URL || 'http://localhost:13002');
    
    console.log(`[Agent Export] 调用前端服务 (POST): ${frontendUrl.toString()}`);
    
    // 默认使用 8K 分辨率 (7680x4320) - 更大的画布让布局更舒展
    const defaultWidth = 7680
    const defaultHeight = 4320
    
    const finalWidth = width ? parseInt(width) : defaultWidth
    const finalHeight = height ? parseInt(height) : defaultHeight
    
    console.log(`[Agent Export] 分辨率: ${finalWidth}x${finalHeight}`)
    
    // 发送 POST 请求，带上图谱数据
    const response = await fetch(frontendUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'image/png'
      },
      body: JSON.stringify({
        nodes,
        edges,
        width: finalWidth,
        height: finalHeight,
        scale: scale ? parseFloat(scale) : 1
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Agent Export] 前端服务返回错误: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `导出图片失败: ${response.status}`,
        details: errorText
      });
    }
    
    // 获取图片数据
    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    
    console.log(`[Agent Export] 导出成功: ${buffer.length} bytes`);
    
    // 返回图片
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="graph-${graphId}.png"`);
    res.send(buffer);
  } catch (error) {
    console.error('[Agent Export] 导出失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除图谱
router.delete('/graphs/:id', agentAuthMiddleware, requirePermission('graphs', 'delete'), (req, res) => {
  try {
    const graph = graphOperations.getById(req.params.id);
    
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 检查图谱是否属于当前 Agent
    const agentUserId = 'agent-' + req.agent.id;
    if (graph.user_id !== agentUserId) {
      return res.status(403).json(formatError('没有权限删除此图谱', 'GRAPH_ACCESS_DENIED'));
    }
    
    graphOperations.delete(req.params.id);
    res.json({ message: '图谱已删除' });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_GRAPH_FAILED'));
  }
});

// ========== 批量节点操作 API ==========

// 批量创建节点（自动计算 Embedding）
router.post('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'write'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodes, auto_embedding = true } = req.body;
    
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json(formatError('节点列表不能为空', 'MISSING_NODES'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 限制批量大小
    const maxBatchSize = 500;
    if (nodes.length > maxBatchSize) {
      return res.status(400).json(formatError(`批量大小不能超过 ${maxBatchSize}`, 'BATCH_TOO_LARGE'));
    }
    
    const createdNodes = [];
    
    for (const node of nodes) {
      const nodeId = node.id || uuidv4();
      const newNode = nodeOperations.createForGraph({
        id: nodeId,
        label: node.label,
        type: node.type || 'default',
        properties: node.properties || {},
        x: node.x || Math.random() * 800,
        y: node.y || Math.random() * 600
      }, graphId);
      
      createdNodes.push({ ...newNode, properties: JSON.parse(newNode.properties || '{}') });
    }
    
    // 默认自动计算 Embedding
    let embeddingResult = null;
    if (auto_embedding) {
      try {
        const embeddingAvailable = await isEmbeddingServiceAvailable();
        if (embeddingAvailable && createdNodes.length > 0) {
          const nodeTexts = createdNodes.map(n => nodeToEmbeddingText(n));
          const embeddings = await getEmbeddings(nodeTexts);
          
          // 批量更新 embedding
          const updateData = createdNodes.map((node, index) => ({
            id: node.id,
            embedding: embeddings[index]
          })).filter(item => item.embedding);
          
          nodeOperations.batchUpdateEmbeddings(graphId, updateData);
          
          // 同步到向量索引
          const items = updateData.map(item => ({
            nodeId: item.id,
            embedding: item.embedding
          }));
          vecSearchOperations.batchAddToIndex(graphId, items);
          
          embeddingResult = { computed: updateData.length, total: createdNodes.length };
          console.log(`[Agent] 自动计算 embedding 完成: ${updateData.length}/${createdNodes.length}`);
        }
      } catch (embError) {
        console.error('[Agent] 自动计算 embedding 失败:', embError.message);
      }
    }
    
    // 精简返回：只返回 ID 列表
    res.status(201).json({
      ...formatBatchResponse(createdNodes),
      embedding: embeddingResult
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_CREATE_NODES_FAILED'));
  }
});

// 批量更新节点
router.put('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { nodes } = req.body;
    
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json(formatError('节点列表不能为空', 'MISSING_NODES'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const updatedNodes = [];
    
    for (const node of nodes) {
      if (!node.id) continue;
      
      const oldNode = nodeOperations.getById(node.id);
      if (!oldNode || oldNode.graph_id !== graphId) continue;
      
      const updated = nodeOperations.update(node.id, node);
      updatedNodes.push({ ...updated, properties: JSON.parse(updated.properties || '{}') });
    }
    
    // 精简返回
    res.json(formatBatchResponse(updatedNodes));
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_UPDATE_NODES_FAILED'));
  }
});

// 批量删除节点
router.delete('/graphs/:graphId/batch/nodes', agentAuthMiddleware, requirePermission('nodes', 'delete'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { node_ids } = req.body;
    
    if (!node_ids || !Array.isArray(node_ids) || node_ids.length === 0) {
      return res.status(400).json(formatError('节点 ID 列表不能为空', 'MISSING_NODE_IDS'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    let deletedCount = 0;
    
    for (const nodeId of node_ids) {
      const node = nodeOperations.getById(nodeId);
      if (node && node.graph_id === graphId) {
        // 从向量索引中移除
        try {
          vecSearchOperations.removeFromIndex(nodeId);
        } catch (e) {
          // 忽略错误，继续删除
        }
        nodeOperations.delete(nodeId);
        deletedCount++;
      }
    }
    
    // 精简返回
    res.json({ count: deletedCount });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_DELETE_NODES_FAILED'));
  }
});

// 删除单个节点
router.delete('/graphs/:graphId/nodes/:nodeId', agentAuthMiddleware, requirePermission('nodes', 'delete'), (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const node = nodeOperations.getById(nodeId);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }
    
    // 从向量索引中移除（如果存在）
    try {
      vecSearchOperations.removeFromIndex(nodeId);
    } catch (e) {
      console.log(`[Agent Node Delete] 从向量索引移除节点 ${nodeId} 失败:`, e.message);
    }
    
    nodeOperations.delete(nodeId);
    
    res.json({ message: '节点已删除', node_id: nodeId });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_NODE_FAILED'));
  }
});

// 更新单个节点
router.put('/graphs/:graphId/nodes/:nodeId', agentAuthMiddleware, requirePermission('nodes', 'write'), (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { label, type, properties, x, y } = req.body;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const node = nodeOperations.getById(nodeId);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }
    
    const updated = nodeOperations.update(nodeId, {
      label,
      type,
      properties,
      x,
      y
    });
    
    res.json({ 
      node: formatItemResponse({
        ...updated,
        properties: JSON.parse(updated.properties || '{}')
      }, req.query, 'node') 
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'UPDATE_NODE_FAILED'));
  }
});

// ========== 批量边操作 API ==========

// 批量创建边
router.post('/graphs/:graphId/batch/edges', agentAuthMiddleware, requirePermission('edges', 'write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { edges } = req.body;
    
    if (!edges || !Array.isArray(edges) || edges.length === 0) {
      return res.status(400).json(formatError('边列表不能为空', 'MISSING_EDGES'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 限制批量大小
    const maxBatchSize = 500;
    if (edges.length > maxBatchSize) {
      return res.status(400).json(formatError(`批量大小不能超过 ${maxBatchSize}`, 'BATCH_TOO_LARGE'));
    }
    
    const createdEdges = [];
    const errors = [];
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      
      // 验证源节点和目标节点存在
      const sourceNode = nodeOperations.getById(edge.source);
      const targetNode = nodeOperations.getById(edge.target);
      
      if (!sourceNode || sourceNode.graph_id !== graphId) {
        errors.push({ index: i, error: `源节点 ${edge.source} 不存在` });
        continue;
      }
      
      if (!targetNode || targetNode.graph_id !== graphId) {
        errors.push({ index: i, error: `目标节点 ${edge.target} 不存在` });
        continue;
      }
      
      const edgeId = edge.id || uuidv4();
      const newEdge = edgeOperations.createForGraph({
        id: edgeId,
        source: edge.source,
        target: edge.target,
        label: edge.label || '',
        type: edge.type || 'default',
        properties: edge.properties || {}
      }, graphId);
      
      createdEdges.push({ ...newEdge, properties: JSON.parse(newEdge.properties || '{}') });
    }
    
    // 精简返回
    res.status(201).json({
      ...formatBatchResponse(createdEdges),
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'BATCH_CREATE_EDGES_FAILED'));
  }
});

// ========== 高级查询 API ==========

// 获取支持的查询操作符列表
// ========== 排名查询 API ==========

// 排名查询（支持数值排序）
router.post('/graphs/:graphId/nodes/rank', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, order = 'desc', filters, limit = 100 } = req.body;

    if (!field) {
      return res.status(400).json(formatError('排名字段不能为空', 'MISSING_FIELD'));
    }

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行排名查询
    const result = await rankNodes(graphId, { field, order, filters, limit });

    res.json(result);
  } catch (error) {
    console.error('[Rank] 排名查询失败:', error.message);
    res.status(400).json(formatError(error.message, 'RANK_FAILED'));
  }
});

// Top-N 查询（快速获取排名前 N 的节点）
router.get('/graphs/:graphId/nodes/top', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, order = 'desc', limit = 10, filters } = req.query;

    if (!field) {
      return res.status(400).json(formatError('字段不能为空', 'MISSING_FIELD'));
    }

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行 Top-N 查询
    const result = await getTopNodes(graphId, {
      field,
      order: order || 'desc',
      limit: parseInt(limit) || 10,
      filters: filters ? JSON.parse(filters) : []
    });

    res.json(result);
  } catch (error) {
    console.error('[TopN] Top-N 查询失败:', error.message);
    res.status(400).json(formatError(error.message, 'TOP_N_FAILED'));
  }
});

// ========== 查询操作符 ==========

router.get('/query/operators', (req, res) => {
  res.json({
    operators: OPERATORS,
    aggregateOperations: AGGREGATE_OPERATIONS
  });
});

// 属性筛选 + 排序查询（核心接口）
router.post('/graphs/:graphId/nodes/query', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const query = req.body;

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行查询
    const result = await queryNodes(graphId, query);

    res.json(result);
  } catch (error) {
    console.error('[Query] 查询失败:', error.message);
    res.status(400).json(formatError(error.message, 'QUERY_FAILED'));
  }
});

// 聚合统计接口
router.post('/graphs/:graphId/nodes/aggregate', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations, filters } = req.body;

    if (!field) {
      return res.status(400).json(formatError('聚合字段不能为空', 'MISSING_FIELD'));
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json(formatError('聚合操作不能为空', 'MISSING_OPERATIONS'));
    }

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行聚合查询
    const result = await aggregateNodes(graphId, field, operations, filters || []);

    res.json(result);
  } catch (error) {
    console.error('[Aggregate] 聚合失败:', error.message);
    res.status(400).json(formatError(error.message, 'AGGREGATE_FAILED'));
  }
});

// 按类型分组聚合
router.get('/graphs/:graphId/nodes/aggregate/by-type', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { field, operations } = req.query;

    if (!field) {
      return res.status(400).json(formatError('聚合字段不能为空', 'MISSING_FIELD'));
    }

    if (!operations) {
      return res.status(400).json(formatError('聚合操作不能为空', 'MISSING_OPERATIONS'));
    }

    const ops = operations.split(',').map(op => op.trim());

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 执行分组聚合
    const result = await groupByType(graphId, field, ops);

    res.json({
      field,
      operations: ops,
      groups: result
    });
  } catch (error) {
    console.error('[GroupBy] 分组聚合失败:', error.message);
    res.status(400).json(formatError(error.message, 'GROUP_BY_FAILED'));
  }
});

// 获取字段统计信息（用于了解图谱数据结构）
router.get('/graphs/:graphId/nodes/field-stats', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;

    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
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
            sample: null,
            numericStats: null
          };
        }
        fieldStats[key].count++;
        fieldStats[key].sample = fieldStats[key].sample || value;

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
      delete stats.sample; // 移除 sample 字段
    }

    res.json({
      totalNodes: nodes.length,
      typeCounts,
      fields: fieldStats
    });
  } catch (error) {
    console.error('[FieldStats] 获取字段统计失败:', error.message);
    res.status(500).json(formatError(error.message, 'FIELD_STATS_FAILED'));
  }
});

// ========== Agent LIKE 关键词检索 API ==========

// 关键词搜索节点（基于 SQL LIKE 的模糊匹配）
router.get('/graphs/:graphId/nodes/search', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { keyword, type, page = 1, limit = 20 } = req.query;
    
    // 验证图谱存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    // 获取所有节点
    let nodes = nodeOperations.getByGraphId(graphId);
    
    // 如果有关键词，进行 LIKE 匹配
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      
      // 为每个节点计算相关性评分
      nodes = nodes.map(node => {
        let score = 0;
        
        // 解析 properties
        let properties = {};
        try {
          properties = JSON.parse(node.properties || '{}');
        } catch (e) {
          properties = {};
        }
        
        // label 完全匹配: +20 分
        if (node.label && node.label.toLowerCase() === lowerKeyword) {
          score += 20;
        }
        
        // label 包含关键词: +10 分
        if (node.label && node.label.toLowerCase().includes(lowerKeyword)) {
          score += 10;
        }
        
        // type 包含关键词: +5 分
        if (node.type && node.type.toLowerCase().includes(lowerKeyword)) {
          score += 5;
        }
        
        // properties 包含关键词: +3 分
        const propsStr = JSON.stringify(properties).toLowerCase();
        if (propsStr.includes(lowerKeyword)) {
          score += 3;
        }
        
        return { ...node, score };
      }).filter(node => node.score > 0);
      
      // 按相关性评分降序排序
      nodes.sort((a, b) => b.score - a.score);
    }
    
    // 按类型过滤
    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }
    
    const total = nodes.length;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;
    
    // 分页
    const paginatedNodes = nodes.slice(offset, offset + limitNum);
    
    // 解析 properties 并构建返回数据
    const results = paginatedNodes.map(node => ({
      id: node.id,
      label: node.label,
      type: node.type,
      properties: JSON.parse(node.properties || '{}'),
      score: node.score || 0,
      created_at: node.created_at
    }));
    
    res.json({
      keyword: keyword || '',
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      nodes: results
    });
  } catch (error) {
    console.error('[Search] 关键词搜索失败:', error.message);
    res.status(500).json(formatError(error.message, 'SEARCH_FAILED'));
  }
});

// ========== 图算法 API ==========

// 获取两个节点之间的路径 (BFS)
router.get('/graphs/:graphId/path', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { source, target, max_depth } = req.query;
    
    if (!source || !target) {
      return res.status(400).json(formatError('源节点和目标节点不能为空', 'MISSING_SOURCE_TARGET'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const maxDepth = parseInt(max_depth) || 10;
    
    // BFS 查找路径
    const path = findPathBFS(graphId, source, target, maxDepth);
    
    res.json({
      path,
      length: path ? path.length : 0,
      found: !!path
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'PATH_FIND_FAILED'));
  }
});

// 获取节点的度统计
router.get('/graphs/:graphId/degrees', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const nodes = nodeOperations.getByGraphId(graphId);
    const edges = edgeOperations.getByGraphId(graphId);
    
    // 计算每个节点的度
    const degrees = {};
    for (const node of nodes) {
      degrees[node.id] = { in: 0, out: 0, total: 0 };
    }
    
    for (const edge of edges) {
      if (degrees[edge.source]) {
        degrees[edge.source].out++;
        degrees[edge.source].total++;
      }
      if (degrees[edge.target]) {
        degrees[edge.target].in++;
        degrees[edge.target].total++;
      }
    }
    
    // 精简返回：只返回必要字段
    const result = nodes.map(node => ({
      id: node.id,
      label: node.label,
      type: node.type,
      ...degrees[node.id]
    }));
    
    // 排序（按总度降序）
    result.sort((a, b) => b.total - a.total);
    
    res.json({
      degrees: result,
      totalEdges: edges.length
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_DEGREES_FAILED'));
  }
});

// 获取节点的邻居
router.get('/graphs/:graphId/nodes/:nodeId/neighbors', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { type, limit } = req.query;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const node = nodeOperations.getById(nodeId);
    if (!node || node.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }
    
    const edges = edgeOperations.getByGraphId(graphId);
    const nodes = nodeOperations.getByGraphId(graphId);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    const neighbors = [];
    const maxLimit = parseInt(limit) || 50;
    
    for (const edge of edges) {
      let neighborId = null;
      let relation = null;
      
      if (edge.source === nodeId) {
        neighborId = edge.target;
        relation = { direction: 'outgoing', label: edge.label, type: edge.type };
      } else if (edge.target === nodeId) {
        neighborId = edge.source;
        relation = { direction: 'incoming', label: edge.label, type: edge.type };
      }
      
      if (neighborId) {
        const neighbor = nodeMap.get(neighborId);
        if (neighbor) {
          if (!type || type === 'all' || relation.direction === type) {
            neighbors.push({
              id: neighbor.id,
              label: neighbor.label,
              type: neighbor.type,
              relation
            });
            
            if (neighbors.length >= maxLimit) break;
          }
        }
      }
    }
    
    res.json({
      node: { id: node.id, label: node.label },
      neighbors,
      total: neighbors.length
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_NEIGHBORS_FAILED'));
  }
});

// ========== 版本管理 API ==========

// 创建快照
router.post('/graphs/:graphId/snapshot', agentAuthMiddleware, requirePermission('graphs', 'write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { name, description } = req.body;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const snapshot = graphVersionOperations.createSnapshot(
      graphId, 
      name || `Snapshot ${new Date().toISOString()}`,
      description || ''
    );
    
    res.status(201).json({
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        name: snapshot.name,
        created_at: snapshot.created_at
      }
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_SNAPSHOT_FAILED'));
  }
});

// 获取版本列表
router.get('/graphs/:graphId/versions', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const versions = graphVersionOperations.getVersions(graphId);
    const response = formatListResponse(versions, req.query, 'version');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_VERSIONS_FAILED'));
  }
});

// 回滚到指定版本
router.post('/graphs/:graphId/rollback', agentAuthMiddleware, requirePermission('graphs', 'write'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { version } = req.body;
    
    if (version === undefined) {
      return res.status(400).json(formatError('版本号不能为空', 'MISSING_VERSION'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const result = graphVersionOperations.rollback(graphId, version);
    
    if (!result) {
      return res.status(404).json(formatError('版本不存在', 'VERSION_NOT_FOUND'));
    }
    
    res.json({
      message: `已回滚到版本 ${version}`,
      version: result.version
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'ROLLBACK_FAILED'));
  }
});

// ========== Workspace API ==========

// 创建 Workspace
router.post('/workspaces', agentAuthMiddleware, (req, res) => {
  try {
    const { name, description, settings } = req.body;
    
    if (!name) {
      return res.status(400).json(formatError('Workspace 名称不能为空', 'MISSING_NAME'));
    }
    
    const workspace = workspaceOperations.create({
      name,
      description,
      owner_type: 'agent',
      owner_id: req.agent.id,
      settings
    });
    
    res.status(201).json({ workspace: formatItemResponse(workspace, req.query, 'workspace') });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CREATE_WORKSPACE_FAILED'));
  }
});

// 获取 Workspace 列表
router.get('/workspaces', agentAuthMiddleware, (req, res) => {
  try {
    // 获取 Agent 创建的 workspaces 和所属的 workspace
    const workspaces = workspaceOperations.getAll().filter(ws => 
      ws.owner_type === 'agent' && ws.owner_id === req.agent.id ||
      ws.id === req.agent.workspace_id
    );
    
    const response = formatListResponse(workspaces, req.query, 'workspace');
    res.json(response);
  } catch (error) {
    res.status(500).json(formatError(error.message, 'GET_WORKSPACES_FAILED'));
  }
});

// ========== 辅助函数 ==========

// BFS 路径查找
function findPathBFS(graphId, startNodeId, endNodeId, maxDepth) {
  const edges = edgeOperations.getByGraphId(graphId);
  const nodes = nodeOperations.getByGraphId(graphId);
  
  // 构建邻接表
  const adjacency = {};
  for (const node of nodes) {
    adjacency[node.id] = [];
  }
  for (const edge of edges) {
    if (adjacency[edge.source]) {
      adjacency[edge.source].push({ nodeId: edge.target, label: edge.label });
    }
  }
  
  // BFS
  const queue = [[startNodeId]];
  const visited = new Set([startNodeId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const currentNode = path[path.length - 1];
    
    if (currentNode === endNodeId) {
      // 返回路径详情
      return path.map((nodeId, index) => {
        const node = nodes.find(n => n.id === nodeId);
        let relation = null;
        if (index > 0) {
          const prevNode = path[index - 1];
          const edge = edges.find(e => e.source === prevNode && e.target === nodeId);
          if (edge) {
            relation = { label: edge.label, type: edge.type };
          }
        }
        return {
          id: nodeId,
          label: node?.label,
          type: node?.type,
          relation
        };
      });
    }
    
    if (path.length >= maxDepth) continue;
    
    const neighbors = adjacency[currentNode] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.nodeId)) {
        visited.add(neighbor.nodeId);
        queue.push([...path, neighbor.nodeId]);
      }
    }
  }
  
  return null;
}

// ========== 向量检索 API ==========

// 获取图谱的 embedding 状态
router.get('/graphs/:graphId/embedding/status', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const nodes = nodeOperations.getByGraphId(graphId);
    const totalNodes = nodes.length;
    const nodesWithEmbedding = nodes.filter(n => n.embedding && n.embedding.length > 0);
    const computedNodes = nodesWithEmbedding.length;
    const progress = totalNodes > 0 ? Math.round((computedNodes / totalNodes) * 100) : 0;
    const available = await isEmbeddingServiceAvailable();
    
    res.json({
      totalNodes,
      computedNodes,
      progress,
      isComplete: computedNodes === totalNodes && totalNodes > 0,
      available
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'EMBEDDING_STATUS_FAILED'));
  }
});

// 计算图谱中所有节点的 embedding
router.post('/graphs/:graphId/embedding/compute', agentAuthMiddleware, requirePermission('nodes', 'write'), async (req, res) => {
  try {
    const { graphId } = req.params;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const nodes = nodeOperations.getByGraphId(graphId);
    if (nodes.length === 0) {
      return res.status(400).json(formatError('图谱中没有节点', 'NO_NODES'));
    }
    
    const available = await isEmbeddingServiceAvailable();
    if (!available) {
      return res.status(503).json(formatError('Embedding 服务不可用', 'EMBEDDING_UNAVAILABLE'));
    }
    
    const nodeTexts = nodes.map(n => nodeToEmbeddingText(n));
    const embeddings = await getEmbeddings(nodeTexts);
    
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
    }
    
    res.json({
      message: `成功计算 ${updateData.length} 个节点的 embedding`,
      total: nodes.length,
      computed: updateData.length
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'EMBEDDING_COMPUTE_FAILED'));
  }
});

// 语义搜索节点（向量检索）
router.get('/graphs/:graphId/embedding/search', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { q, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json(formatError('搜索关键词不能为空', 'MISSING_QUERY'));
    }
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    if (nodesWithEmbedding.length === 0) {
      return res.status(400).json(formatError('图谱中还没有计算 embedding', 'NO_EMBEDDING'));
    }
    
    const queryEmbedding = await getEmbedding(q);
    const candidates = nodesWithEmbedding.map(n => ({
      id: n.id,
      label: n.label,
      embedding: JSON.parse(n.embedding)
    }));
    
    const similarNodes = findSimilarNodes(queryEmbedding, candidates, parseInt(limit));
    
    const results = similarNodes.map(similarity => {
      const node = nodesWithEmbedding.find(n => n.id === similarity.id);
      const { embedding, ...nodeWithoutEmbedding } = node;
      return {
        ...nodeWithoutEmbedding,
        properties: JSON.parse(node.properties || '{}'),
        similarity: similarity.similarity
      };
    });
    
    res.json({
      query: q,
      results
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'EMBEDDING_SEARCH_FAILED'));
  }
});

// 获取节点的相似节点（向量检索）
router.get('/graphs/:graphId/embedding/similar/:nodeId', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId, nodeId } = req.params;
    const { limit = 10 } = req.query;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const targetNode = nodeOperations.getById(nodeId);
    if (!targetNode || targetNode.graph_id !== graphId) {
      return res.status(404).json(formatError('节点不存在', 'NODE_NOT_FOUND'));
    }
    
    if (!targetNode.embedding) {
      return res.status(400).json(formatError('该节点还没有 embedding', 'NO_EMBEDDING'));
    }
    
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    const otherNodes = nodesWithEmbedding.filter(n => n.id !== nodeId);
    
    if (otherNodes.length === 0) {
      return res.json({
        node: { id: targetNode.id, label: targetNode.label },
        similarNodes: []
      });
    }
    
    const targetEmbedding = JSON.parse(targetNode.embedding);
    const candidates = otherNodes.map(n => ({
      id: n.id,
      embedding: JSON.parse(n.embedding)
    }));
    
    const similarNodes = findSimilarNodes(targetEmbedding, candidates, parseInt(limit));
    
    const results = similarNodes.map(similarity => {
      const node = otherNodes.find(n => n.id === similarity.id);
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        similarity: similarity.similarity
      };
    });
    
    res.json({
      node: { id: targetNode.id, label: targetNode.label },
      similarNodes: results
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'SIMILAR_NODES_FAILED'));
  }
});

// 聚类分析（向量检索）
router.post('/graphs/:graphId/embedding/cluster', agentAuthMiddleware, requirePermission('graphs', 'read'), async (req, res) => {
  try {
    const { graphId } = req.params;
    const { k = 3 } = req.body;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    if (nodesWithEmbedding.length < 2) {
      return res.status(400).json(formatError('需要至少 2 个节点才能进行聚类', 'INSUFFICIENT_NODES'));
    }
    
    if (nodesWithEmbedding.length < k) {
      return res.status(400).json(formatError(`节点数量 (${nodesWithEmbedding.length}) 少于聚类数量 (${k})`, 'K_TOO_LARGE'));
    }
    
    const vectors = nodesWithEmbedding.map(n => JSON.parse(n.embedding));
    const clusters = kMeansClustering(vectors, k);
    
    const nodeIdList = nodesWithEmbedding.map(n => n.id);
    const clusterResults = clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      nodeIds: cluster.indices.map(index => nodeIdList[index])
    }));
    
    res.json({
      k,
      totalNodes: nodesWithEmbedding.length,
      clusters: clusterResults
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'CLUSTER_FAILED'));
  }
});

// 删除图谱的所有 embedding
router.delete('/graphs/:graphId/embedding', agentAuthMiddleware, requirePermission('nodes', 'write'), async (req, res) => {
  try {
    const { graphId } = req.params;
    
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }
    
    nodeOperations.deleteEmbeddingsByGraphId(graphId);
    
    // 清理向量索引
    try {
      vecSearchOperations.clearIndexByGraphId(graphId);
    } catch (e) {
      console.log(`[Agent] 清理图谱 ${graphId} 的向量索引失败:`, e.message);
    }
    
    res.json({
      message: '已删除所有节点的 embedding'
    });
  } catch (error) {
    res.status(500).json(formatError(error.message, 'DELETE_EMBEDDING_FAILED'));
  }
});

// 获取下个月配额重置时间
function getNextMonthReset() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

// ========== 用户关联 Agent 的日志 API ==========

// 获取当前用户下所有 Agent 的接口调用日志（最新100条）
// 支持通过 agentId 参数过滤特定 Agent 的日志
router.get('/user/agents/logs', async (req, res) => {
  try {
    // 从请求头获取用户认证信息
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : '';
    
    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }
    
    // 动态导入 auth 模块（ES Module 兼容）
    const authModule = await import('./auth.js');
    const verifyToken = authModule.verifyToken;
    const user = verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ error: '无效的认证令牌' });
    }
    
    // 获取用户创建的所有 Agent（通过 user_id 关联）
    console.log('[日志API] 用户ID:', user.id);
    const userCreatedAgents = agentOperations.getByUserId(user.id);
    console.log('[日志API] 用户创建的Agent:', userCreatedAgents);
    const agentIds = userCreatedAgents.map(a => a.id);
    console.log('[日志API] Agent ID列表:', agentIds);

    // 如果用户没有创建任何 Agent，返回空数组
    if (agentIds.length === 0) {
      console.log('[日志API] 用户没有创建任何Agent');
      return res.json({ logs: [], total: 0 });
    }
    
    // 获取过滤参数
    const { agentId, limit: limitStr } = req.query;
    const limit = parseInt(limitStr) || 100;
    
    let logs;
    if (agentId) {
      // 如果指定了 agentId，过滤该 Agent 的日志
      if (!agentIds.includes(agentId)) {
        return res.status(403).json({ error: '无权查看该 Agent 的日志' });
      }
      logs = agentApiLogOperations.getByAgentId(agentId, limit);
    } else {
      // 否则获取所有用户创建的 Agent 的日志
      logs = agentApiLogOperations.getByAgentIds(agentIds, limit);
    }
    
    // 为每条日志获取图谱名称
    const logsWithGraphNames = logs.map(log => {
      let graphName = log.graph_name || '';
      // 如果 graph_id 存在但 graph_name 为空，尝试获取图谱名称
      if (log.graph_id && !graphName) {
        try {
          const graph = graphOperations.getById(log.graph_id);
          graphName = graph ? graph.name : '';
        } catch (e) {
          console.error('获取图谱名称失败:', e);
        }
      }
      return {
        ...log,
        graph_name: graphName
      };
    });
    
    res.json({ logs: logsWithGraphNames, total: logs.length });
  } catch (error) {
    console.error('获取 Agent 日志失败:', error);
    res.status(500).json(formatError(error.message, 'GET_AGENT_LOGS_FAILED'));
  }
});

export default router;
