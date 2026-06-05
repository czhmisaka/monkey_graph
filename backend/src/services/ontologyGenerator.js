import { getOpenAIClient } from '../llmService.js';
import { v4 as uuidv4 } from 'uuid';

// 获取环境变量中的模型配置
const MODEL_NAME = process.env.LLM_CLOUD_MODEL_NAME || 'gpt-4o';

/**
 * 本体生成器 - 使用 LLM 分析文档内容，生成本体定义
 */
export class OntologyGenerator {
  /**
   * 生成本体定义
   * @param {string[]} documentTexts - 文档文本列表
   * @param {string} simulationRequirement - 模拟需求描述
   * @param {string} additionalContext - 额外上下文
   * @returns {Promise<Object>} 本体定义
   */
  static async generate(documentTexts, simulationRequirement, additionalContext = '') {
    const openai = getOpenAIClient();
    
    // 合并文档文本（截取前10000字符以避免超出上下文限制）
    const combinedText = documentTexts
      .join('\n\n')
      .slice(0, 10000);
    
    const systemPrompt = `你是一个专业的知识图谱本体设计师。你的任务是根据提供的文档内容和模拟需求，分析并设计合适的本体结构（实体类型和关系类型）。

## 重要规则
1. 根据文档内容，提取最合适的实体类型（5-15个）
2. 为每个实体类型定义属性
3. 定义实体类型之间的关系（3-10个）
4. 确保本体结构能够支撑模拟需求
5. 必须以纯 JSON 格式输出，不要包含任何其他内容`;

    const userPrompt = `## 模拟需求
${simulationRequirement}

${additionalContext ? `## 额外上下文\n${additionalContext}` : ''}

## 文档内容
${combinedText}

请严格按照以下JSON格式输出：
{
    "entity_types": [
        {
            "name": "实体类型名称",
            "description": "实体类型描述",
            "attributes": [
                {"name": "属性名", "type": "属性类型", "description": "属性描述"}
            ],
            "examples": ["具体示例"]
        }
    ],
    "edge_types": [
        {
            "name": "关系类型名称",
            "description": "关系类型描述",
            "source_targets": [
                {"source": "源实体类型", "target": "目标实体类型"}
            ]
        }
    ],
    "analysis_summary": "对本体设计的简要说明"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 4000
      });

      const content = response.choices[0]?.message?.content || '';
      
      // 调试：打印 LLM 返回的原始内容（截取前 500 字符）
      console.log('[本体生成] LLM 返回内容预览:', content.slice(0, 500));
      
      // 提取 JSON - 尝试多种方式
      let ontology = null;
      let parseError = null;
      
      // 方法 1: 尝试找到完整的 JSON 对象（从第一个 { 到最后一个 }）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          ontology = JSON.parse(jsonMatch[0]);
        } catch (e) {
          parseError = e;
          console.log('[本体生成] 方法1解析失败，尝试方法2...');
        }
      }
      
      // 方法 2: 尝试找到 markdown 代码块中的 JSON
      if (!ontology) {
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          try {
            ontology = JSON.parse(codeBlockMatch[1]);
            console.log('[本体生成] 方法2成功 - 从代码块提取');
          } catch (e) {
            parseError = e;
            console.log('[本体生成] 方法2解析失败，尝试方法3...');
          }
        }
      }
      
      // 方法 3: 尝试找到所有 { } 对，递归找到最外层
      if (!ontology) {
        const tryParseBrackets = (str) => {
          let start = str.indexOf('{');
          let end = str.lastIndexOf('}');
          if (start === -1 || end === -1) return null;
          
          const jsonStr = str.slice(start, end + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            // 尝试更小的范围
            return tryParseBrackets(jsonStr);
          }
        };
        
        ontology = tryParseBrackets(content);
        if (ontology) {
          console.log('[本体生成] 方法3成功 - 从括号匹配提取');
        }
      }
      
      // 方法 4: 尝试使用正则找到 JSON 数组
      if (!ontology) {
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try {
            // 如果返回的是数组，包装成对象
            const arr = JSON.parse(arrayMatch[0]);
            ontology = {
              entity_types: arr,
              edge_types: [],
              analysis_summary: '从数组格式转换'
            };
            console.log('[本体生成] 方法4成功 - 从数组提取');
          } catch (e) {
            parseError = e;
          }
        }
      }
      
      if (!ontology) {
        console.error('[本体生成] 所有解析方法都失败');
        console.error('[本体生成] 原始内容:', content);
        throw new Error(`无法解析 LLM 返回的 JSON: ${parseError?.message || '未知错误'}`);
      }
      
      console.log('[本体生成] JSON 解析成功!');
      
      // 验证和规范化
      return this.validateAndNormalize(ontology);
    } catch (error) {
      console.error('本体生成失败:', error);
      throw new Error(`本体生成失败: ${error.message}`);
    }
  }

  /**
   * 验证并规范化本体定义
   * @param {Object} ontology - 原始本体定义
   * @returns {Object} 规范化后的本体定义
   */
  static validateAndNormalize(ontology) {
    // 确保 entity_types 存在
    const entityTypes = Array.isArray(ontology.entity_types) 
      ? ontology.entity_types 
      : [];
    
    // 确保 edge_types 存在
    const edgeTypes = Array.isArray(ontology.edge_types)
      ? ontology.edge_types
      : [];

    // 规范化实体类型
    const normalizedEntityTypes = entityTypes.map(et => ({
      name: et.name || '未命名',
      description: et.description || '',
      attributes: Array.isArray(et.attributes) 
        ? et.attributes.map(a => ({
          name: a.name || '未命名属性',
          type: a.type || 'string',
          description: a.description || ''
        }))
        : [],
      examples: Array.isArray(et.examples) ? et.examples : []
    }));

    // 规范化关系类型
    const normalizedEdgeTypes = edgeTypes.map(et => ({
      name: et.name || '未命名关系',
      description: et.description || '',
      source_targets: Array.isArray(et.source_targets)
        ? et.source_targets.map(st => ({
          source: st.source || '',
          target: st.target || ''
        }))
        : []
    }));

    return {
      entity_types: normalizedEntityTypes,
      edge_types: normalizedEdgeTypes,
      analysis_summary: ontology.analysis_summary || ''
    };
  }

  /**
   * 从已有本体扩展实体类型
   * @param {Object} currentOntology - 当前本体
   * @param {string} newText - 新增文本
   * @returns {Promise<Object>} 扩展后的本体
   */
  static async extend(currentOntology, newText) {
    const openai = getOpenAIClient();
    
    const systemPrompt = `你是一个专业的知识图谱本体设计师。你的任务是扩展现有的本体结构，添加新的实体类型和关系类型。

## 重要规则
1. 只返回需要新增或修改的内容
2. 保持与现有本体的一致性
3. 必须以纯 JSON 格式输出`;

    const userPrompt = `## 现有本体
${JSON.stringify(currentOntology, null, 2)}

## 新增文档内容
${newText.slice(0, 5000)}

请返回需要新增或修改的实体类型和关系类型，格式如下：
{
    "new_entity_types": [
        {
            "name": "新实体类型名称",
            "description": "实体类型描述",
            "attributes": [{"name": "属性名", "type": "属性类型", "description": "属性描述"}],
            "examples": ["示例"]
        }
    ],
    "new_edge_types": [
        {
            "name": "新关系类型名称",
            "description": "关系类型描述",
            "source_targets": [{"source": "源实体类型", "target": "目标实体类型"}]
        }
    ],
    "analysis_summary": "扩展说明"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        return currentOntology;
      }

      const extension = JSON.parse(jsonMatch[0]);
      
      // 合并扩展
      return this.mergeExtension(currentOntology, extension);
    } catch (error) {
      console.error('本体扩展失败:', error);
      return currentOntology;
    }
  }

  /**
   * 合并本体扩展
   * @param {Object} current - 当前本体
   * @param {Object} extension - 扩展内容
   * @returns {Object} 合并后的本体
   */
  static mergeExtension(current, extension) {
    const entityTypes = [...current.entity_types];
    const edgeTypes = [...current.edge_types];
    
    // 添加新的实体类型（避免重复）
    if (extension.new_entity_types) {
      const existingNames = new Set(entityTypes.map(et => et.name));
      for (const newEt of extension.new_entity_types) {
        if (!existingNames.has(newEt.name)) {
          entityTypes.push(newEt);
        }
      }
    }

    // 添加新的关系类型（避免重复）
    if (extension.new_edge_types) {
      const existingNames = new Set(edgeTypes.map(et => et.name));
      for (const newEt of extension.new_edge_types) {
        if (!existingNames.has(newEt.name)) {
          edgeTypes.push(newEt);
        }
      }
    }

    return {
      entity_types: entityTypes,
      edge_types: edgeTypes,
      analysis_summary: extension.analysis_summary || current.analysis_summary
    };
  }

  /**
   * 导出本体为 JSON 字符串
   * @param {Object} ontology - 本体定义
   * @returns {string} JSON 字符串
   */
  static toJSON(ontology) {
    return JSON.stringify(ontology, null, 2);
  }

  /**
   * 从 JSON 字符串导入本体
   * @param {string} jsonString - JSON 字符串
   * @returns {Object} 本体定义
   */
  static fromJSON(jsonString) {
    try {
      const ontology = JSON.parse(jsonString);
      return this.validateAndNormalize(ontology);
    } catch (error) {
      throw new Error(`无效的 JSON: ${error.message}`);
    }
  }
}

export default OntologyGenerator;