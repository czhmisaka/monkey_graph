import express from 'express';
import { graphOperations, nodeOperations } from '../../../database.js';
import { authMiddleware } from '../../../auth.js';
import {
  kMeansClustering,
  dbscanClustering
} from '../../../services/embeddingService.js';
import { isLLMConfigured, getOpenAIClient, getCurrentModel } from '../../../llmService.js';
import { logger } from '../../../logger.js';

const router = express.Router();

// 存储聚类分析进度
// key: graphId, value: { status: 'running'|'completed'|'failed', progress: number, current: number, total: number, message: string }
const clusteringProgress = new Map();

// ========== Embedding Cluster Routes ==========

/**
 * 对图谱中的节点进行聚类分析
 * POST /api/graphs/:graphId/embedding/cluster
 */
router.post('/graphs/:graphId/embedding/cluster', authMiddleware, async (req, res) => {
  try {
    const { graphId } = req.params;
    const { k = 3 } = req.body;

    logger.info('【Cluster】', `[Cluster API] 开始聚类分析: graphId=${graphId}, k=${k}`);

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
      logger.info('【Cluster】', `[Cluster API] 图谱 ${graphId} 不存在`);
      return res.status(404).json({ error: '图谱不存在' });
    }

    // 获取有 embedding 的节点
    const nodesWithEmbedding = nodeOperations.getNodesWithEmbedding(graphId);
    logger.info('【Cluster】', `[Cluster API] 图谱 ${graphId} 有 ${nodesWithEmbedding.length} 个节点有 embedding`);

    if (nodesWithEmbedding.length < 2) {
      logger.info('【Cluster】', `[Cluster API] 节点数量不足: ${nodesWithEmbedding.length}`);
      return res.status(400).json({ error: '需要至少 2 个节点才能进行聚类，请先点击"计算 Embedding"' });
    }

    if (nodesWithEmbedding.length < k) {
      logger.info('【Cluster】', `[Cluster API] 节点数量 ${nodesWithEmbedding.length} 少于聚类数量 ${k}`);
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
    logger.info('【Cluster】', `[Cluster API] 执行 K-means 聚类，k=${k}...`);
    const clusters = kMeansClustering(vectors, k);
    logger.info('【Cluster】', `[Cluster API] K-means 聚类完成，生成了 ${clusters.length} 个聚类`);

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
    logger.info('【Cluster】', `[Cluster API] 开始调用 LLM 为 ${clusterResults.length} 个聚类逐一生成名称...`);
    logger.info('【Cluster】', `[Cluster API] LLM 配置状态: ${isLLMConfigured()}`);

    // 检查 LLM 是否可用
    if (!isLLMConfigured()) {
      logger.info('【Cluster】', '[Cluster API] ⚠️ LLM 未配置，使用默认聚类名称');
      // 使用默认名称
      clusterResults = clusterResults.map((cluster, index) => ({
        ...cluster,
        name: `聚类 ${index + 1}`,
        description: `包含 ${cluster.nodes.length} 个节点`
      }));

      // 清除进度
      clusteringProgress.delete(graphId);
    } else {
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
          logger.info('【Cluster】', `[Cluster API] 正在为聚类 ${i + 1}/${clusterResults.length} 生成名称...`);

          const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 200
          });

          const responseText = completion.choices[0]?.message?.content || '';
          logger.info('【Cluster】', `[Cluster API] 聚类 ${i + 1} LLM 返回: ${responseText.slice(0, 200)}...`);

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
                  logger.info('【Cluster】', `[Cluster API] 聚类 ${i + 1} JSON 解析失败`);
                }
              }
            }

            if (parsed && parsed.name) {
              let name = parsed.name.replace(/^["']|["']$/g, '').replace(/[,，。.]/g, '').trim();
              let description = (parsed.description || '').replace(/^["']|["']$/g, '').replace(/[,，。.]/g, '').trim();
              cluster.name = name;
              cluster.description = description;
              logger.info('【Cluster】', `[Cluster API] ✅ 聚类 ${i + 1} 命名成功: ${name}`);
            } else {
              throw new Error('无法解析 LLM 响应');
            }
          } catch (parseError) {
            logger.error('【Cluster】', `[Cluster API] 聚类 ${i + 1} 解析失败:`, parseError.message);
            cluster.name = `聚类 ${i + 1}`;
            cluster.description = `包含 ${cluster.nodes.length} 个节点`;
          }
        } catch (llmError) {
          logger.error('【Cluster】', `[Cluster API] 聚类 ${i + 1} LLM 调用失败:`, llmError.message);
          cluster.name = `聚类 ${i + 1}`;
          cluster.description = `包含 ${cluster.nodes.length} 个节点`;
        }
      }

      logger.info('【Cluster】', `[Cluster API] ✅ 所有聚类命名完成: ${clusterResults.map(c => c.name).join(', ')}`);

      // 清除进度
      clusteringProgress.delete(graphId);
    }

    logger.info('【Cluster】', `[Cluster API] 聚类分析完成，返回 ${clusterResults.length} 个聚类`);

    res.json({
      success: true,
      k,
      totalNodes: nodesWithEmbedding.length,
      clusters: clusterResults
    });
  } catch (error) {
    logger.error('【Cluster】', '[Cluster API] 聚类分析失败:', error);
    // 清除进度
    clusteringProgress.delete(req.params.graphId);
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
    logger.info('【Cluster】', `[DBSCAN] 开始聚类: eps=${eps}, minPts=${minPts}`);
    const clusters = dbscanClustering(vectors, eps, minPts);
    logger.info('【Cluster】', `[DBSCAN] 聚类完成: 生成了 ${clusters.length} 个聚类`);

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
    logger.error('【Cluster】', 'DBSCAN 聚类失败:', error);
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
    logger.error('【Cluster】', '[Cluster Progress API] 获取进度失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
