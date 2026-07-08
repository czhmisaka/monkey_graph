import express from 'express';
import { graphOperations, nodeOperations, graphAgentPermissionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { formatError } from '../utils/responseFormatter.js';

const router = express.Router();

/**
 * Agent LIKE 关键词搜索节点
 * GET /agent/graphs/:graphId/nodes/search?keyword=xxx&type=xxx&page=1&limit=20
 * 
 * 相关性评分规则：
 * - label 完全匹配: +20 分
 * - label 包含关键词: +10 分
 * - type 包含关键词: +5 分
 * - properties 包含关键词: +3 分
 */
router.get('/graphs/:graphId/nodes/search', agentAuthMiddleware, requirePermission('graphs', 'read'), (req, res) => {
  try {
    const { graphId } = req.params;
    const { keyword, type, page = 1, limit = 20 } = req.query;

    // 输入长度限制(防 DoS)
    if (keyword && String(keyword).length > 200) {
      return res.status(400).json(formatError('搜索关键词不能超过 200 字符', 'KEYWORD_TOO_LONG'));
    }
    if (type && String(type).length > 100) {
      return res.status(400).json(formatError('类型过滤不能超过 100 字符', 'TYPE_TOO_LONG'));
    }

    // 检查图谱是否存在
    const graph = graphOperations.getById(graphId);
    if (!graph) {
      return res.status(404).json(formatError('图谱不存在', 'GRAPH_NOT_FOUND'));
    }

    // 检查访问权限
    const hasAccess = graphAgentPermissionOperations.hasAccess(req.agent.id, graphId);
    if (!hasAccess) {
      return res.status(403).json(formatError('没有权限访问此图谱', 'GRAPH_ACCESS_DENIED'));
    }

    // 获取所有节点
    let nodes = nodeOperations.getByGraphId(graphId);

    // 如果有关键词，进行 LIKE 搜索和评分
    if (keyword && keyword.trim()) {
      const searchTerm = keyword.trim().toLowerCase();
      
      nodes = nodes.map(node => {
        let score = 0;
        const nodeLabel = (node.label || '').toLowerCase();
        const nodeType = (node.type || '').toLowerCase();
        
        // 解析 properties
        let propertiesText = '';
        try {
          const props = JSON.parse(node.properties || '{}');
          propertiesText = JSON.stringify(props).toLowerCase();
        } catch (e) {
          propertiesText = '';
        }

        // 评分规则
        // 1. label 完全匹配
        if (nodeLabel === searchTerm) {
          score += 20;
        }
        
        // 2. label 包含关键词
        if (nodeLabel.includes(searchTerm)) {
          score += 10;
        }
        
        // 3. type 包含关键词
        if (nodeType.includes(searchTerm)) {
          score += 5;
        }
        
        // 4. properties 包含关键词
        if (propertiesText.includes(searchTerm)) {
          score += 3;
        }

        // 如果没有任何匹配，跳过这个节点
        if (score === 0) {
          return null;
        }

        return {
          ...node,
          score,
          properties: JSON.parse(node.properties || '{}')
        };
      }).filter(n => n !== null);

      // 按相关性评分降序排序
      nodes.sort((a, b) => b.score - a.score);
    } else {
      // 没有关键词时，解析 properties 并按创建时间排序
      nodes = nodes.map(node => ({
        ...node,
        score: 0,
        properties: JSON.parse(node.properties || '{}')
      }));
      nodes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // 按类型过滤
    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }

    // 分页
    const total = nodes.length;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;
    const paginatedNodes = nodes.slice(offset, offset + limitNum);

    // 排除 embedding 字段
    const result = paginatedNodes.map(({ embedding, ...rest }) => rest);

    res.json({
      keyword: keyword || '',
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      nodes: result
    });

  } catch (error) {
    console.error('关键词搜索失败:', error);
    res.status(500).json(formatError(error.message, 'SEARCH_FAILED'));
  }
});

export default router;
