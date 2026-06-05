import express from 'express';
import { userLLMConfigOperations } from '../database.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

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

export default router;
