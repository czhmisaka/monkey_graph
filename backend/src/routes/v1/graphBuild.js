import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { graphOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import { TaskManager } from '../../tasks/taskManager.js';
import { LocalGraphBuilder } from '../../services/localGraphBuilder.js';

const router = express.Router();

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

export default router;
