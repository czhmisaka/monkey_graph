import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { graphOperations, nodeOperations, edgeOperations } from '../database.js';
import { authMiddleware } from '../auth.js';
import { canAccessGraph, canWriteGraph } from './_helpers.js';
import { logger, auditLogger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ========== 图谱管理（需要认证）==========

// 获取当前用户的所有图谱（管理员可查看所有）
router.get('/graphs', authMiddleware, (req, res) => {
  try {
    let graphs;

    // 检查是否是管理员用户
    const isAdmin = req.user.is_admin === 1;

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

  const demoGraphsDir = path.join(__dirname, '..', 'data', 'demo-graphs');

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
    const isAdmin = req.user.is_admin === 1;

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

    // 审计日志
    auditLogger.log('CREATE_GRAPH', { graphId: newGraph.id, name, description }, req.user);
    logger.info('【图谱操作】', `创建图谱: ${name} (${newGraph.id})`);
    
    res.status(201).json(newGraph);
  } catch (error) {
    logger.error('【图谱操作】', `创建图谱失败: ${error.message}`);
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
    
    // 审计日志
    auditLogger.log('UPDATE_GRAPH', { graphId: req.params.id, changes: req.body }, req.user);
    logger.info('【图谱操作】', `更新图谱: ${oldGraph.name} (${req.params.id})`);
    
    res.json(updatedGraph);
  } catch (error) {
    logger.error('【图谱操作】', `更新图谱失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 删除图谱
router.delete('/graphs/:id', authMiddleware, (req, res) => {
  try {
    // 首先尝试按用户ID查找
    let oldGraph = graphOperations.getByIdAndUserId(req.params.id, req.user.id);

    // 如果找不到，检查是否是管理员
    const isAdmin = req.user.is_admin === 1;

    // 如果是管理员，可以删除任何图谱
    if (!oldGraph && isAdmin) {
      oldGraph = graphOperations.getById(req.params.id);
      if (!oldGraph) {
        return res.status(404).json({ error: '图谱不存在' });
      }
    }

    // 如果仍然找不到,返回 403(权限不足,不暴露存在性)
    if (!oldGraph) {
      return res.status(403).json({ error: '无权删除此图谱' });
    }

    graphOperations.delete(req.params.id);
    
    // 审计日志 - 危险操作必须记录
    auditLogger.log('DELETE_GRAPH', { graphId: req.params.id, graphName: oldGraph.name }, req.user);
    logger.info('【图谱操作】', `删除图谱: ${oldGraph.name} (${req.params.id})`);
    
    res.json({ success: true, message: '图谱已删除' });
  } catch (error) {
    logger.error('【图谱操作】', `删除图谱失败: ${error.message}`);
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
    const isAdmin = req.user.is_admin === 1;

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
    const isAdmin = req.user.is_admin === 1;

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

export default router;
