import express from 'express';
import { graphOperations, vecSearchOperations } from '../../database.js';
import { authMiddleware } from '../../auth.js';
import {
  getVectorConfig,
  updateVectorConfig,
  autoDetectDimensions,
  isEmbeddingServiceAvailable
} from '../../services/embeddingService.js';
import { logger } from '../../logger.js';

const router = express.Router();

// ========== 向量维度自动检测 API（需要认证）==========

/**
 * 自动检测向量维度
 * GET /api/embedding/dimensions/detect
 *
 * 说明：调用 embedding API 获取实际的向量维度，并更新配置
 */
router.get('/embedding/dimensions/detect', authMiddleware, async (req, res) => {
  try {
    logger.info('【VectorConfig】', '[Dimension Detection] 开始自动检测向量维度...');

    // 调用 embedding API 检测维度
    const detectedDimensions = await autoDetectDimensions();

    if (detectedDimensions === null) {
      logger.error('【VectorConfig】', '[Dimension Detection] 向量维度检测失败');
      return res.status(503).json({
        success: false,
        error: '无法连接到 embedding 服务，请确保本地 embedding 服务正在运行'
      });
    }

    const config = getVectorConfig();
    logger.info('【VectorConfig】', `[Dimension Detection] ✅ 检测成功: ${detectedDimensions} 维 (当前配置: ${config.dimensions} 维)`);

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
    logger.error('【VectorConfig】', '[Dimension Detection] 向量维度检测失败:', error);
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

    logger.info('【VectorConfig】', `[VecIndex Reinit] 收到重新初始化请求...`);

    // 1. 首先检测实际的向量维度
    const detectedDimensions = await autoDetectDimensions();

    if (detectedDimensions === null) {
      logger.error('【VectorConfig】', '[VecIndex Reinit] 无法检测向量维度');
      return res.status(503).json({
        success: false,
        error: '无法连接到 embedding 服务，请确保本地 embedding 服务正在运行'
      });
    }

    // 使用检测到的维度或请求中指定的维度
    const targetDimensions = dimensions || detectedDimensions;

    logger.info('【VectorConfig】', `[VecIndex Reinit] 目标维度: ${targetDimensions}`);

    // 2. 检查是否需要重新初始化（维度是否变化）
    const currentConfig = getVectorConfig();
    if (currentConfig.dimensions === targetDimensions) {
      logger.info('【VectorConfig】', `[VecIndex Reinit] 维度未变化 (${targetDimensions})，无需重新初始化`);
      return res.json({
        success: true,
        message: `向量维度未变化 (${targetDimensions})，无需重新初始化`,
        dimensions: targetDimensions,
        reinitialized: false
      });
    }

    // 3. 重新初始化向量索引表
    logger.info('【VectorConfig】', `[VecIndex Reinit] 开始重新初始化向量索引表，维度: ${targetDimensions}`);
    const result = vecSearchOperations.reinitializeIndex(targetDimensions);

    if (!result) {
      logger.error('【VectorConfig】', '[VecIndex Reinit] 重新初始化失败');
      return res.status(500).json({
        success: false,
        error: '重新初始化向量索引表失败'
      });
    }

    logger.info('【VectorConfig】', `[VecIndex Reinit] ✅ 重新初始化成功`);

    res.json({
      success: true,
      message: `向量索引表已重新初始化，维度: ${targetDimensions}`,
      dimensions: targetDimensions,
      previousDimensions: currentConfig.dimensions,
      reinitialized: true,
      warning: '向量索引已清空，请重新计算所有节点的 embedding'
    });
  } catch (error) {
    logger.error('【VectorConfig】', '[VecIndex Reinit] 重新初始化失败:', error);
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
    logger.error('【VectorConfig】', '[Dimension Info] 获取维度信息失败:', error);
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
    logger.info('【VectorConfig】', '[Auto Adapter] 开始自动适配向量维度...');

    // 1. 检测实际的向量维度
    const detectedDimensions = await autoDetectDimensions();

    if (detectedDimensions === null) {
      logger.error('【VectorConfig】', '[Auto Adapter] 无法检测向量维度');
      return res.status(503).json({
        success: false,
        error: '无法连接到 embedding 服务，请确保本地 embedding 服务正在运行'
      });
    }

    const currentConfig = getVectorConfig();

    // 2. 比较维度
    if (currentConfig.dimensions === detectedDimensions) {
      logger.info('【VectorConfig】', `[Auto Adapter] 维度匹配，无需调整 (${detectedDimensions})`);
      return res.json({
        success: true,
        message: `向量维度匹配，无需调整`,
        dimensions: detectedDimensions,
        adjusted: false
      });
    }

    logger.info('【VectorConfig】', `[Auto Adapter] 维度不匹配: 当前 ${currentConfig.dimensions}，检测到 ${detectedDimensions}`);
    logger.info('【VectorConfig】', `[Auto Adapter] 开始重新初始化向量索引表...`);

    // 3. 重新初始化向量索引表
    const result = vecSearchOperations.reinitializeIndex(detectedDimensions);

    if (!result) {
      logger.error('【VectorConfig】', '[Auto Adapter] 重新初始化失败');
      return res.status(500).json({
        success: false,
        error: '重新初始化向量索引表失败'
      });
    }

    logger.info('【VectorConfig】', `[Auto Adapter] ✅ 自动适配完成`);

    res.json({
      success: true,
      message: `向量维度已自动适配: ${currentConfig.dimensions} → ${detectedDimensions}`,
      dimensions: detectedDimensions,
      previousDimensions: currentConfig.dimensions,
      adjusted: true,
      warning: '向量索引已清空，请重新计算所有节点的 embedding'
    });
  } catch (error) {
    logger.error('【VectorConfig】', '[Auto Adapter] 自动适配失败:', error);
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
    logger.error('【VectorConfig】', '获取配置失败:', error);
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

    const newConfig = {};
    if (cacheEnabled !== undefined) newConfig.cacheEnabled = cacheEnabled;
    if (batchSize !== undefined) newConfig.batchSize = batchSize;
    if (maxRetries !== undefined) newConfig.maxRetries = maxRetries;
    if (retryDelay !== undefined) newConfig.retryDelay = retryDelay;

    updateVectorConfig(newConfig);

    res.json({
      success: true,
      message: '配置已更新',
      config: getVectorConfig()
    });
  } catch (error) {
    logger.error('【VectorConfig】', '更新配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
