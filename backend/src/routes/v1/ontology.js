import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../../auth.js';
import { uploadRateLimiter } from '../../middleware/rateLimit.js';
import { FileParser } from '../../utils/fileParser.js';
import { TextProcessor } from '../../services/textProcessor.js';
import { OntologyGenerator } from '../../services/ontologyGenerator.js';
import { upload } from './_upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ========== 本体生成 API（需要认证）==========

/**
 * 生成本体定义 (带 SSE 进度)
 * POST /api/graph/ontology/generate
 *
 * 请求参数 (FormData):
 * - files: File[] - 上传的文件，支持 PDF/MD/TXT 格式
 * - simulation_requirement: String - 模拟需求描述
 * - project_name: String (可选) - 项目名称
 * - additional_context: String (可选) - 额外说明上下文
 */
router.post('/graph/ontology/generate', authMiddleware, uploadRateLimiter, upload.array('files', 10), async (req, res) => {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { simulation_requirement, project_name, additional_context } = req.body;

    if (!simulation_requirement) {
      return res.status(400).json({ error: '模拟需求不能为空' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请上传至少一个文件' });
    }

    // 1. 解析文件提取文本
    console.log(`[本体生成] 收到 ${req.files.length} 个文件，开始解析...`);
    const documentTexts = [];
    const fileInfos = [];

    for (const file of req.files) {
      try {
        console.log(`[本体生成] 解析文件: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB)`);
        const text = await FileParser.extractText(file.path);
        const processedText = TextProcessor.preprocessText(text);

        if (processedText.trim()) {
          documentTexts.push(processedText);
          fileInfos.push(FileParser.getFileInfo(file));
          console.log(`[本体生成] ✓ ${file.originalname} - 提取 ${processedText.length} 字符`);
        }

        // 清理上传的临时文件
        fs.unlinkSync(file.path);
      } catch (parseError) {
        console.error(`[本体生成] ✗ 文件解析失败: ${file.originalname}`, parseError.message);
        // 继续处理其他文件
      }
    }

    if (documentTexts.length === 0) {
      console.error('[本体生成] ✗ 无法从上传的文件中提取有效文本');
      sendEvent({ type: 'error', message: '无法从上传的文件中提取有效文本' });
      return res.end();
    }

    const totalTextLength = documentTexts.join('').length;
    console.log(`[本体生成] ✓ 共提取 ${documentTexts.length} 个文档，总计 ${totalTextLength} 字符`);

    // 2. 生成项目 ID
    const projectId = `proj_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const projectName = project_name || '未命名项目';
    console.log(`[本体生成] 项目ID: ${projectId}, 项目名称: ${projectName}`);
    console.log(`[本体生成] 需求: ${simulation_requirement?.slice(0, 50)}...`);

    // 3. 使用 LLM 生成本体（显示进度）
    console.log('[本体生成] 🚀 开始调用 LLM 分析文档...');
    sendEvent({ type: 'progress', message: '🔄 正在调用 LLM 分析文档...', progress: 0.1 });

    const ontology = await OntologyGenerator.generate(
      documentTexts,
      simulation_requirement,
      additional_context || ''
    );

    const entityCount = ontology.entity_types?.length || 0;
    const edgeCount = ontology.edge_types?.length || 0;
    console.log(`[本体生成] ✅ 本体生成完成! 实体类型: ${entityCount}, 关系类型: ${edgeCount}`);

    sendEvent({
      type: 'progress',
      stage: 'ontology',
      message: '本体生成完成!',
      progress: 1.0,
      entityTypes: entityCount,
      edgeTypes: edgeCount
    });

    // 4. 返回最终结果
    sendEvent({
      type: 'complete',
      data: {
        project_id: projectId,
        project_name: projectName,
        ontology,
        analysis_summary: ontology.analysis_summary,
        files: fileInfos,
        total_text_length: totalTextLength
      }
    });

    res.end();
  } catch (error) {
    console.error('本体生成失败:', error);
    sendEvent({ type: 'error', message: error.message });
    res.end();
  }
});

export default router;
