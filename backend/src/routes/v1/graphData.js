import express from 'express';
import { graphOperations, nodeOperations, edgeOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';

const router = express.Router();

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

export default router;
