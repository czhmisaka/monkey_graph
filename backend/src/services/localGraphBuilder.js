import { getOpenAIClient } from '../llmService.js';
import { v4 as uuidv4 } from 'uuid';
import { TextProcessor } from './textProcessor.js';
import { nodeOperations, edgeOperations, graphOperations } from '../database.js';

// 获取环境变量中的模型配置
const MODEL_NAME = process.env.LLM_CLOUD_MODEL_NAME || 'gpt-4o';

/**
 * 图谱构建器 - 从文本中提取实体和关系构建知识图谱
 */
export class LocalGraphBuilder {
  /**
   * 构建知识图谱
   * @param {string} text - 输入文本
   * @param {Object} ontology - 本体定义
   * @param {string} graphId - 图谱ID
   * @param {string} graphName - 图谱名称
   * @param {number} chunkSize - 文本块大小
   * @param {number} chunkOverlap - 块重叠大小
   * @param {number} maxWorkers - 并行线程数
   * @param {boolean} useParallel - 是否并行提取
   * @param {Function} progressCallback - 进度回调函数
   * @returns {Promise<Object>} 构建结果
   */
  static async buildGraph(
    text,
    ontology,
    graphId,
    graphName = 'Local Graph',
    chunkSize = 1000,
    chunkOverlap = 100,
    maxWorkers = 5,
    useParallel = true,
    progressCallback = null
  ) {
    const reportProgress = (message, progressRatio = 0) => {
      if (progressCallback) {
        progressCallback(message, progressRatio);
      }
    };

    try {
      // 1. 文本预处理
      reportProgress('正在预处理文本...', 0.05);
      const processedText = TextProcessor.preprocessText(text);
      
      // 2. 文本分块
      reportProgress('正在分块文本...', 0.1);
      const chunks = TextProcessor.smartSplit(processedText, chunkSize, chunkOverlap);
      const totalChunks = chunks.length;
      console.log(`[图谱构建] 文本分块完成，共 ${totalChunks} 个块`);
      
      // 3. 获取实体类型和关系类型列表
      const entityTypes = ontology.entity_types || [];
      const edgeTypes = ontology.edge_types || [];
      
      const entityTypeStr = entityTypes.map(et => 
        `- ${et.name}: ${et.description}`
      ).join('\n');
      
      const relationTypeStr = edgeTypes.map(et => {
        const sources = et.source_targets?.map(st => `${st.source}→${st.target}`).join(', ') || '';
        return `- ${et.name}: ${et.description} (${sources})`;
      }).join('\n');

      // 4. 提取实体和关系
      let allEntities = [];
      let allRelations = [];
      
      if (useParallel && totalChunks > 1) {
        // 并行提取
        reportProgress(`正在并行提取实体和关系 (${maxWorkers} 线程)...`, 0.15);
        const results = await this._extractFromChunksParallel(
          chunks,
          entityTypes,
          edgeTypes,
          entityTypeStr,
          relationTypeStr,
          maxWorkers,
          (msg, ratio) => reportProgress(msg, 0.15 + ratio * 0.5)
        );
        allEntities = results.entities;
        allRelations = results.relations;
      } else {
        // 串行提取
        for (let i = 0; i < chunks.length; i++) {
          reportProgress(`正在提取实体和关系 (${i + 1}/${totalChunks})...`, 0.15 + (i / totalChunks) * 0.5);
          const result = await this._extractFromChunk(
            chunks[i],
            entityTypes,
            edgeTypes,
            entityTypeStr,
            relationTypeStr
          );
          allEntities = [...allEntities, ...result.entities];
          allRelations = [...allRelations, ...result.relations];
        }
      }
      
      // 5. 去重合并
      reportProgress('正在去重合并...', 0.7);
      const uniqueEntities = this._deduplicateEntities(allEntities);
      const uniqueRelations = this._deduplicateRelations(allRelations, uniqueEntities);
      
      console.log(`[图谱构建] 去重后: ${uniqueEntities.length} 个实体, ${uniqueRelations.length} 条关系`);
      
      // 6. 创建节点
      reportProgress('正在创建节点...', 0.8);
      const nodeIdMap = new Map();
      
      for (const entity of uniqueEntities) {
        const nodeId = uuidv4();
        nodeIdMap.set(entity.name, nodeId);
        
        nodeOperations.createForGraph({
          id: nodeId,
          label: entity.name,
          type: entity.type,
          properties: {
            description: entity.description || '',
            confidence: entity.confidence || 0.9
          }
        }, graphId);
      }
      
      // 7. 创建边
      reportProgress('正在创建边...', 0.9);
      let edgeCount = 0;
      
      for (const relation of uniqueRelations) {
        const sourceId = nodeIdMap.get(relation.source);
        const targetId = nodeIdMap.get(relation.target);
        
        if (sourceId && targetId) {
          edgeOperations.createForGraph({
            id: uuidv4(),
            source: sourceId,
            target: targetId,
            label: relation.type,
            type: relation.type,
            properties: {
              description: relation.description || '',
              confidence: relation.confidence || 0.9
            }
          }, graphId);
          edgeCount++;
        }
      }
      
      // 8. 完成
      reportProgress('图谱构建完成!', 1.0);
      
      return {
        success: true,
        nodeCount: uniqueEntities.length,
        edgeCount: edgeCount,
        chunkCount: totalChunks,
        entityTypes: entityTypes.map(et => et.name)
      };
    } catch (error) {
      console.error('[图谱构建] 构建失败:', error);
      reportProgress(`构建失败: ${error.message}`, 0);
      throw error;
    }
  }

  /**
   * 从单个文本块提取实体和关系
   */
  static async _extractFromChunk(
    chunk,
    entityTypes,
    edgeTypes,
    entityTypeStr,
    relationTypeStr,
    maxRetries = 3
  ) {
    const openai = getOpenAIClient();
    
    const systemPrompt = `你是一个专业的知识图谱构建助手，专门从文本中提取实体和关系。

你的任务：
1. 严格按照指定的实体类型和关系类型进行提取
2. 必须以纯 JSON 格式输出结果
3. 不要输出任何 thinking 过程或解释
4. 只返回 JSON 对象，不要其他内容
5. 如果没有找到实体或关系，返回空的 JSON 对象 {"entities": [], "relations": []}`;

    const userPrompt = `从以下文本中提取实体和关系。

实体类型:
${entityTypeStr}

关系类型:
${relationTypeStr}

文本内容:
${chunk}

要求：
- 只返回 JSON，不要thinking过程或其他内容
- JSON 格式如下：
{
    "entities": [
        {"name": "实体名称", "type": "实体类型", "description": "简洁描述", "confidence": 0.9}
    ],
    "relations": [
        {"source": "源实体名称", "target": "目标实体名称", "type": "关系类型", "description": "关系描述", "confidence": 0.9}
    ]
}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          console.warn(`[图谱构建] 无法从响应中提取 JSON，重试 ${attempt + 1}/${maxRetries}`);
          continue;
        }

        const result = JSON.parse(jsonMatch[0]);
        
        return {
          entities: Array.isArray(result.entities) ? result.entities : [],
          relations: Array.isArray(result.relations) ? result.relations : []
        };
      } catch (error) {
        console.warn(`[图谱构建] 提取失败，重试 ${attempt + 1}/${maxRetries}:`, error.message);
        
        if (attempt === maxRetries - 1) {
          // 最后一次尝试失败，使用降级处理
          return this._fallbackExtract(chunk, entityTypes, edgeTypes);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    
    return { entities: [], relations: [] };
  }

  /**
   * 并行从多个文本块提取实体和关系
   */
  static async _extractFromChunksParallel(
    chunks,
    entityTypes,
    edgeTypes,
    entityTypeStr,
    relationTypeStr,
    maxWorkers,
    progressCallback
  ) {
    const allEntities = [];
    const allRelations = [];
    const batchSize = Math.ceil(chunks.length / maxWorkers);
    
    // 分批处理
    for (let batchIdx = 0; batchIdx < Math.ceil(chunks.length / batchSize); batchIdx++) {
      const start = batchIdx * batchSize;
      const end = Math.min(start + batchSize, chunks.length);
      const batchChunks = chunks.slice(start, end);
      
      const batchPromises = batchChunks.map(async (chunk, idx) => {
        const result = await this._extractFromChunk(
          chunk,
          entityTypes,
          edgeTypes,
          entityTypeStr,
          relationTypeStr
        );
        
        if (progressCallback) {
          const globalIdx = start + idx;
          progressCallback(
            `提取中 (${globalIdx + 1}/${chunks.length})`,
            globalIdx / chunks.length
          );
        }
        
        return result;
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        allEntities.push(...result.entities);
        allRelations.push(...result.relations);
      }
    }
    
    return { entities: allEntities, relations: allRelations };
  }

  /**
   * 降级处理：当 LLM 提取失败时使用简单关键词匹配
   */
  static _fallbackExtract(chunk, entityTypes, edgeTypes) {
    const entities = [];
    const relations = [];
    
    // 简单匹配实体名称
    for (const entityType of entityTypes) {
      const examples = entityType.examples || [];
      for (const example of examples) {
        if (chunk.includes(example)) {
          // 检查是否已添加
          if (!entities.find(e => e.name === example && e.type === entityType.name)) {
            entities.push({
              name: example,
              type: entityType.name,
              description: entityType.description,
              confidence: 0.5
            });
          }
        }
      }
    }
    
    return { entities, relations };
  }

  /**
   * 实体去重
   */
  static _deduplicateEntities(entities) {
    const entityMap = new Map();
    
    for (const entity of entities) {
      if (!entity.name || !entity.type) continue;
      
      const key = `${entity.type}:${entity.name}`;
      
      if (entityMap.has(key)) {
        // 合并描述（取较长的）
        const existing = entityMap.get(key);
        if (entity.description && entity.description.length > (existing.description || '').length) {
          existing.description = entity.description;
        }
        // 合并置信度（取较高的）
        existing.confidence = Math.max(existing.confidence || 0, entity.confidence || 0);
      } else {
        entityMap.set(key, {
          name: entity.name,
          type: entity.type,
          description: entity.description || '',
          confidence: entity.confidence || 0.9
        });
      }
    }
    
    return Array.from(entityMap.values());
  }

  /**
   * 关系去重
   */
  static _deduplicateRelations(relations, entities) {
    const relationMap = new Map();
    const entityNames = new Set(entities.map(e => e.name));
    
    for (const relation of relations) {
      if (!relation.source || !relation.target || !relation.type) continue;
      
      // 检查实体是否存在
      if (!entityNames.has(relation.source) || !entityNames.has(relation.target)) {
        continue;
      }
      
      const key = `${relation.source}:${relation.type}:${relation.target}`;
      
      if (relationMap.has(key)) {
        const existing = relationMap.get(key);
        if (relation.description && relation.description.length > (existing.description || '').length) {
          existing.description = relation.description;
        }
        existing.confidence = Math.max(existing.confidence || 0, relation.confidence || 0);
      } else {
        relationMap.set(key, {
          source: relation.source,
          target: relation.target,
          type: relation.type,
          description: relation.description || '',
          confidence: relation.confidence || 0.9
        });
      }
    }
    
    return Array.from(relationMap.values());
  }
}

export default LocalGraphBuilder;