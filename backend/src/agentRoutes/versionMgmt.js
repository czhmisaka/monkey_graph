import express from 'express';
import { graphOperations, graphVersionOperations } from '../database.js';
import { agentAuthMiddleware, requirePermission } from '../agentAuth.js';
import { requireGraphAccess } from './_helpers.js';
import { formatListResponse, formatError } from '../utils/responseFormatter.js';

const router = express.Router();

// 创建快照
router.post('/graphs/:graphId/snapshot', agentAuthMiddleware, requirePermission('graphs', 'write'), requireGraphAccess('write'), (req, res) => {
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
router.get('/graphs/:graphId/versions', agentAuthMiddleware, requirePermission('graphs', 'read'), requireGraphAccess('read'), (req, res) => {
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
router.post('/graphs/:graphId/rollback', agentAuthMiddleware, requirePermission('graphs', 'write'), requireGraphAccess('write'), (req, res) => {
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

export default router;
