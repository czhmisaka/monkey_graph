import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { graphOperations, nodeOperations, edgeOperations, graphShareOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';

const router = express.Router();

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

export default router;
