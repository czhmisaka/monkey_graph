import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import { graphOperations } from './database.js';
import logger from './logger.js';
import { initMCPClient, getMCPToolDefinitions, isMCPConnected, isMCPDegraded } from './mcpClient.js';
import { executeTool } from './services/tools/executor.js';

// MCP 降级状态
let mcpDegraded = false;
let mcpErrorMessage = 'MCP 服务暂时不可用，网络搜索功能暂时不可用。请稍后再试。';

// 存储 LLM 配置（不再存储客户端实例）
let currentModel = process.env.LLM_CLOUD_MODEL_NAME || 'gpt-4o';
let currentBaseURL = process.env.LLM_CLOUD_BASE_URL || '';
let currentApiKey = process.env.LLM_CLOUD_API_KEY || '';

// 检查是否已配置（通过 apiKey 判断）
let isConfigured = !!currentApiKey;

// 启动时记录配置信息
if (currentApiKey) {
  logger.info('【后端】', '✅ LLM 已通过环境变量自动初始化');
  logger.info('【后端】', `   模型: ${currentModel}`);
  logger.info('【后端】', `   API: ${currentBaseURL || 'OpenAI 默认'}`);
}

// 请求级创建 OpenAI 客户端
function createOpenAIClient() {
  if (!currentApiKey) {
    throw new Error('LLM 服务未初始化，请先配置 API Key');
  }
  return new OpenAI({
    apiKey: currentApiKey,
    baseURL: currentBaseURL || 'https://api.openai.com/v1'
  });
}

export function initOpenAI(config) {
  if (!config.apiKey) {
    throw new Error('API Key is required');
  }
  
  currentApiKey = config.apiKey;
  currentBaseURL = config.baseURL || '';
  if (config.model) {
    currentModel = config.model;
  }
  
  isConfigured = true;
  
  logger.info('【后端】', '✅ LLM 配置已更新');
  logger.info('【后端】', `   模型: ${currentModel}`);
  logger.info('【后端】', `   API: ${currentBaseURL || 'OpenAI 默认'}`);
  
  return createOpenAIClient();
}

export function getOpenAIClient() {
  return createOpenAIClient();
}

export function isLLMConfigured() {
  return isConfigured;
}

export function getCurrentModel() {
  return currentModel;
}

// 工具定义（包含图谱工具 + MCP 工具）
const graphTools = [
  {
    type: 'function',
    function: {
      name: 'add_node',
      description: '添加一个新的节点到知识图谱中',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '节点的标签/名称' },
          type: { type: 'string', description: '节点的类型（如 person, organization, concept 等）' },
          properties: { type: 'object', description: '节点的额外属性' }
        },
        required: ['label']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_edge',
      description: '在两个节点之间添加一条边（关系）',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: '源节点 ID' },
          target: { type: 'string', description: '目标节点 ID' },
          label: { type: 'string', description: '边的标签/关系名称' },
          type: { type: 'string', description: '边的类型' }
        },
        required: ['source', 'target', 'label']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_node',
      description: '更新现有节点的属性',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '节点 ID' },
          label: { type: 'string', description: '新的标签' },
          type: { type: 'string', description: '新的类型' },
          properties: { type: 'object', description: '新的属性' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_node',
      description: '删除一个节点（同时会删除所有关联的边）',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '节点 ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_edge',
      description: '删除一条边',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '边 ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_nodes',
      description: '搜索图谱中的节点',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_graph_info',
      description: '获取当前知识图谱的完整信息',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'highlight_node',
      description: '在图谱视图中居中并高亮显示指定节点，用于向用户展示相关节点。支持通过nodeId直接指定或通过keyword关键词搜索匹配节点',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '要高亮显示的节点ID' },
          keyword: { type: 'string', description: '搜索关键词，会高亮第一个匹配到的节点' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_graph_settings',
      description: '获取当前图谱的基础设定配置，包括节点类型样式、边类型样式等',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_graph_settings',
      description: '更新当前图谱的基础设定配置，可以添加/编辑节点类型样式、边类型样式等，美化样式的时候需要注意参考当前图谱的节点的类型严格一致，不要擅自翻译',
      parameters: {
        type: 'object',
        properties: {
          nodeTypes: { type: 'object', description: '节点类型配置对象，key为类型名（严格和节点类型保持一致），value为样式配置 {color, shape}' },
          edgeTypes: { type: 'object', description: '边类型配置对象，key为类型名（严格和边类型保持一致），value为样式配置 {color, style}' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_graph_settings',
      description: '删除当前图谱的基础设定配置，可以删除指定的节点类型样式或边类型样式，也可以清除所有设定',
      parameters: {
        type: 'object',
        properties: {
          nodeTypes: { type: 'array', description: '要删除的节点类型名称数组，如 ["person", "organization"]' },
          edgeTypes: { type: 'array', description: '要删除的边类型名称数组，如 ["related", "default"]' },
          clearAll: { type: 'boolean', description: '是否清除所有设定（包括所有节点类型和边类型），默认为false' }
        }
      }
    }
  },
  // ========== 高级查询工具 ==========
  {
    type: 'function',
    function: {
      name: 'query_nodes',
      description: '高级节点查询：支持属性筛选、多字段排序、分页。用于高效获取符合条件的节点，避免全量获取。示例：查询金额大于0的业务节点按金额降序排列前50个',
      parameters: {
        type: 'object',
        properties: {
          filters: {
            type: 'array',
            description: '筛选条件数组，支持操作符: =, !=, >, <, >=, <=, contains, startsWith, endsWith, exists, in。字段格式: properties.xxx 或 label, type 等'
          },
          sort: {
            type: 'object',
            description: '排序规则，字段格式同上。示例: { "field": "properties.amount", "order": "desc" }'
          },
          pagination: {
            type: 'object',
            description: '分页参数，示例: { "page": 1, "limit": 50 }'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aggregate_nodes',
      description: '聚合统计节点属性：计算字段的 SUM/AVG/MAX/MIN/COUNT 等统计值。用于获取业务数据的汇总信息，如总金额、平均值、最大值等',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: '要聚合的字段，如 "properties.amount" 或 "label"' },
          operations: { type: 'array', description: '聚合操作数组，支持: sum, avg, max, min, count' },
          filters: { type: 'array', description: '可选的筛选条件，只统计符合条件的节点' }
        },
        required: ['field', 'operations']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'group_by_type',
      description: '按节点类型分组聚合：分别统计每种类型节点的数值字段汇总。用于分析不同类型节点的数据分布',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: '要聚合的字段，如 "properties.amount"' },
          operations: { type: 'array', description: '聚合操作数组，支持: sum, avg, max, min, count' }
        },
        required: ['field', 'operations']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_field_stats',
      description: '获取图谱字段统计信息：了解图谱中所有节点属性字段的类型、分布和数值范围。用于在执行聚合查询前了解数据结构',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// MCP 工具列表（web_search, understand_image）
const mcpTools = getMCPToolDefinitions();

// 合并所有工具
const tools = [...graphTools, ...mcpTools];

// executeTool 已迁移至 services/tools/executor.js

// 系统提示词
const systemPrompt = `你是一个智能知识图谱助手（Agent模式），你的目标是以完成任务为导向。

## 你的能力
你可以使用以下工具来操作知识图谱：
### 图谱操作工具
1. add_node - 添加新节点
2. add_edge - 添加边（连接两个节点）
3. update_node - 更新节点属性
4. delete_node - 删除节点
5. delete_edge - 删除边
6. search_nodes - 搜索图谱中的节点
7. get_graph_info - 获取完整图谱信息
8. highlight_node - 居中高亮显示指定节点
9. get_graph_settings - 获取图谱的基础设定（节点类型样式、边类型样式等）
10. update_graph_settings - 更新图谱的基础设定，可以添加/编辑节点类型样式、边类型样式等
11. delete_graph_settings - 删除图谱的基础设定，可以删除指定的节点类型样式或边类型样式，也可以清除所有设定

### MCP 工具（外部能力）
12. web_search - 通过网络搜索获取最新信息。当查询需要实时数据、新闻或其他网络资源时使用此工具。搜索完成后，你可以将搜索到的信息添加到知识图谱中。
13. understand_image - 分析图片内容，提取图片中的信息。可以用于理解用户上传的图片并将其内容添加到知识图谱中。

## 工作模式
1. 首先使用 get_graph_info 了解当前图谱状态
2. 分析用户需求，执行相应操作
3. 每次工具调用后检查任务是否完成
4. 如果未完成继续执行，否则总结结果
5. 你应该全面的分析文档并尽可能的抽离每个关键知识点！每个节点的内容都应该是非常详细、且如果可以细分成更小的节点就细分成更小的节点。
6. 如果用户对知识图谱的编辑or 变更or整理 类的需求中包含了某个实体但图谱中没有，你需要主动添加这个实体为节点，并且添加与其他相关节点的边。

## 重要规则
1. **自主决策**：不要问用户确认，自己决定下一步
2. **完成任务**：直到图谱满足用户需求才算完成
3. **中文交流**：使用中文与用户交流
4. **边存在性**：添加边时需确保两个节点都存在
5. **删除影响**：删除节点会同时删除所有关联的边
6. **工具失败处理**：当工具调用返回 success: false 或包含 error 信息时，必须明确告知用户失败原因，不要假设操作成功了！

当前图谱状态（使用 get_graph_info 工具获取完整信息）：`;

// Agent 模式主函数 - 支持传入 graphId 和 signal (用于取消)
export async function agentChat(messages, maxIterations = Infinity, sendEvent = null, graphId = null, signal = null) {
  const p = '【Agent】';
  
  // 获取图谱名称
  const graph = graphId ? graphOperations.getById(graphId) : null;
  const graphName = graph?.name || '未知图谱';
  const graphIdDisplay = graphId ? `${graphName}(${graphId.slice(0, 8)}...)` : '(未指定)';
  
  // 任务开始日志（使用 debug 级别，生产环境可关闭）
  logger.debug(p, '╔═══════════════════════════════════════════════════════╗');
  logger.debug(p, '║  🚀 新任务开始                                        ║');
  logger.debug(p, '╚═══════════════════════════════════════════════════════╝');
  
  // 检查是否已取消
  if (signal?.aborted) {
    logger.info(p, '⚠️ 任务已被取消');
    return {
      success: false,
      iterations: 0,
      message: null,
      executionTrace: [],
      summary: { totalNodes: 0, totalEdges: 0 },
      cancelled: true
    };
  }
  
  const userMsg = messages.find(m => m.role === 'user');
  logger.info(p, `📝 用户需求: ${userMsg?.content || '(无内容)'}`);
  logger.info(p, `📋 操作图谱: ${graphName} (ID: ${graphId || '未指定'})`);
  logger.debug(p, `⚙️  最大迭代次数: 无限制`);
  logger.debug(p, '');
  
  // 流式推送开始
  if (sendEvent) {
    sendEvent({ type: 'start', message: userMsg?.content || '' });
  }
  
  // 初始化 MCP 客户端（如果尚未连接）
  if (!isMCPConnected()) {
    try {
      await initMCPClient();
    } catch (error) {
      logger.warn('【MCP】', `⚠️ MCP 连接失败，将无法使用 web_search 等工具: ${error.message}`);
    }
  }
  
  // 请求级创建 OpenAI 客户端
  const openai = createOpenAIClient();
  
  if (!openai) {
    throw new Error('LLM 服务未初始化，请先配置 API Key');
  }

  // 根据 graphId 获取对应图谱数据
  const nodes = graphId 
    ? nodeOperations.getByGraphId(graphId).map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') }))
    : nodeOperations.getAll().map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') }));
  const edges = graphId
    ? edgeOperations.getByGraphId(graphId).map(e => ({ ...e, properties: JSON.parse(e.properties || '{}') }))
    : edgeOperations.getAll().map(e => ({ ...e, properties: JSON.parse(e.properties || '{}') }));

  const graphInfo = `节点数量: ${nodes.length}, 边数量: ${edges.length}`;
  const userMessages = messages.filter(m => m.role === 'user');
  
  let conversationHistory = [
    { role: 'user', content: systemPrompt + graphInfo }
  ];
  
  if (userMessages.length > 0) {
    conversationHistory.push(userMessages[0]);
  }
  
  const executionTrace = [];
  let iteration = 0;
  let finalMessage = null;
  let taskCompleted = false;

  while (iteration < maxIterations) {
    iteration++;
    
    logger.debug(p, `╔═══════════════════════════════════════════════════════╗`);
    logger.debug(p, `║  🔄 第 ${iteration} 轮迭代                                     ║`);
    logger.debug(p, `╚═══════════════════════════════════════════════════════╝`);
    
    const response = await openai.chat.completions.create({
      model: currentModel,
      messages: conversationHistory,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.7
    });

    const assistantMessage = response.choices[0].message;
    
    // 打印 AI 思考内容
    const aiContent = assistantMessage.content || '(无回复内容)';
    logger.debug(p, `💭 AI 思考:`);
    const contentLines = aiContent.split('\n');
    for (const line of contentLines) {
      logger.debug(p, `   ${line}`);
    }
    
    // 流式推送思考
    if (sendEvent) {
      sendEvent({ 
        type: 'thought', 
        iteration,
        content: assistantMessage.content || '' 
      });
    }
    
    executionTrace.push({
      iteration,
      type: 'thought',
      content: assistantMessage.content || '(无文字回复)',
      toolCalls: assistantMessage.tool_calls || null
    });

    if (!assistantMessage.tool_calls) {
      finalMessage = assistantMessage;
      taskCompleted = true;
      logger.info(p, `✅ 任务完成！无更多工具调用`);
      break;
    }

    const toolResults = [];
    
    // 记录工具执行前的节点/边数量
    const prevNodeCount = graphId ? nodeOperations.getByGraphId(graphId).length : nodeOperations.getAll().length;
    const prevEdgeCount = graphId ? edgeOperations.getByGraphId(graphId).length : edgeOperations.getAll().length;
    
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      
      // 生成操作描述
      let actionDesc = '';
      switch (toolName) {
        case 'add_node':
          actionDesc = `添加节点 "${toolArgs.label || '未命名'}"`;
          break;
        case 'add_edge':
          actionDesc = `添加边 "${toolArgs.label || ''}"`;
          break;
        case 'update_node':
          actionDesc = `更新节点 "${toolArgs.label || toolArgs.id}"`;
          break;
        case 'delete_node':
          actionDesc = `删除节点`;
          break;
        case 'delete_edge':
          actionDesc = `删除边`;
          break;
        case 'search_nodes':
          actionDesc = `搜索节点 "${toolArgs.keyword}"`;
          break;
        case 'get_graph_info':
          actionDesc = `获取图谱信息`;
          break;
        case 'highlight_node':
          actionDesc = `高亮节点 "${toolArgs.keyword || toolArgs.nodeId}"`;
          break;
        case 'get_graph_settings':
          actionDesc = `获取图谱设置`;
          break;
        case 'update_graph_settings':
          actionDesc = `更新图谱设置`;
          break;
        case 'delete_graph_settings':
          actionDesc = `删除图谱设置`;
          break;
        case 'web_search':
          actionDesc = `网络搜索 "${toolArgs.query}"`;
          break;
        case 'understand_image':
          actionDesc = `理解图片`;
          break;
        default:
          actionDesc = `执行 ${toolName}`;
      }
      
      logger.info(p, `⚡ [${graphName}] 执行工具: ${toolName}`);
      logger.info(p, `   📋 操作: ${actionDesc}`);
      logger.debug(p, `   📝 参数: ${JSON.stringify(toolArgs)}`);
      
      // 传递 graphId 和 sendEvent 给工具执行函数
      const result = await executeTool(toolName, toolArgs, graphId, sendEvent);
      
      // 计算操作后的变化
      const afterNodeCount = graphId ? nodeOperations.getByGraphId(graphId).length : nodeOperations.getAll().length;
      const afterEdgeCount = graphId ? edgeOperations.getByGraphId(graphId).length : edgeOperations.getAll().length;
      const nodeDiff = afterNodeCount - prevNodeCount;
      const edgeDiff = afterEdgeCount - prevEdgeCount;
      
      // 生成影响描述
      let impactDesc = '';
      if (['add_node', 'delete_node', 'update_node'].includes(toolName)) {
        impactDesc = `影响: ${afterNodeCount} 节点`;
        if (nodeDiff !== 0) {
          impactDesc = `影响: ${nodeDiff > 0 ? '+' : ''}${nodeDiff} 节点 (共${afterNodeCount})`;
        }
      } else if (['add_edge', 'delete_edge'].includes(toolName)) {
        impactDesc = `影响: ${afterEdgeCount} 边`;
        if (edgeDiff !== 0) {
          impactDesc = `影响: ${edgeDiff > 0 ? '+' : ''}${edgeDiff} 边 (共${afterEdgeCount})`;
        }
      } else if (toolName === 'get_graph_info' || toolName === 'search_nodes') {
        const count = result.data?.count || result.data?.nodes?.length || 0;
        impactDesc = `查询结果: ${count} 条`;
      }
      
      if (result.success) {
        logger.info(p, `   ✅ 结果: 成功 - ${result.data?.label || result.data?.id || 'OK'}`);
        if (impactDesc) {
          logger.info(p, `   📊 ${impactDesc}`);
        }
      } else {
        logger.warn(p, `   ❌ 结果: 失败 - ${result.error}`);
      }
      
      // 流式推送工具执行结果
      if (sendEvent) {
        sendEvent({ 
          type: 'action', 
          iteration,
          toolName,
          arguments: toolArgs,
          result
        });
        
        // 推送图谱更新
        const updatedNodes = graphId 
          ? nodeOperations.getByGraphId(graphId).map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') }))
          : nodeOperations.getAll().map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') }));
        const updatedEdges = graphId
          ? edgeOperations.getByGraphId(graphId).map(e => ({ ...e, properties: JSON.parse(e.properties || '{}') }))
          : edgeOperations.getAll().map(e => ({ ...e, properties: JSON.parse(e.properties || '{}') }));
        sendEvent({ 
          type: 'graph', 
          nodes: updatedNodes, 
          edges: updatedEdges 
        });
        
        // 如果是 highlight_node 工具，推送高亮事件
        if (toolName === 'highlight_node' && result.success) {
          sendEvent({
            type: 'highlight',
            nodeId: result.data.nodeId,
            label: result.data.label
          });
        }
      }
      
      toolResults.push({
        tool_call_id: toolCall.id,
        toolName,
        arguments: toolArgs,
        result
      });
      
      executionTrace.push({
        iteration,
        type: 'action',
        toolName,
        arguments: toolArgs,
        result
      });
    }

    const toolResultMessages = toolResults.map(tr => ({
      tool_call_id: tr.tool_call_id,
      role: 'tool',
      content: JSON.stringify(tr.result)
    }));

    conversationHistory = [
      ...conversationHistory,
      assistantMessage,
      ...toolResultMessages
    ];

    const currentNodes = graphId 
      ? nodeOperations.getByGraphId(graphId).map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') }))
      : nodeOperations.getAll().map(n => ({ ...n, properties: JSON.parse(n.properties || '{}') }));
    const currentEdges = graphId
      ? edgeOperations.getByGraphId(graphId).map(e => ({ ...e, properties: JSON.parse(e.properties || '{}') }))
      : edgeOperations.getAll().map(e => ({ ...e, properties: JSON.parse(e.properties || '{}') }));
    
    const progressCheck = {
      role: 'user',
      content: `【进度检查】当前图谱有 ${currentNodes.length} 个节点和 ${currentEdges.length} 条边。请判断用户需求是否已满足？如果已完成，请给出最终总结并回复完成任务；如果未完成，请继续执行下一步操作。`
    };
    
    conversationHistory.push(progressCheck);
  }

  const finalNodes = graphId ? nodeOperations.getByGraphId(graphId).length : nodeOperations.getAll().length;
  const finalEdges = graphId ? edgeOperations.getByGraphId(graphId).length : edgeOperations.getAll().length;
  
  logger.debug(p, '');
  const iterDisplay = maxIterations === Infinity ? '无限制' : maxIterations;
  logger.info(p, `╔═══════════════════════════════════════════════════════╗`);
  logger.info(p, `║  🏁 任务结束                                        ║`);
  logger.info(p, `╚═══════════════════════════════════════════════════════╝`);
  logger.info(p, `📊 图谱: ${graphName}`);
  logger.info(p, `📊 迭代次数: ${iteration} / ${iterDisplay}`);
  logger.info(p, `📈 图谱变化: ${finalNodes} 个节点, ${finalEdges} 条边`);
  logger.info(p, `🎯 任务状态: ${taskCompleted ? '✅ 已完成' : '⚠️ 已停止（达到上限）'}`);
  logger.debug(p, '');
  
  return {
    success: taskCompleted,
    iterations: iteration,
    message: finalMessage,
    executionTrace,
    summary: {
      totalNodes: finalNodes,
      totalEdges: finalEdges
    }
  };
}

export async function chat(messages) {
  return agentChat(messages, Infinity);
}

export async function chatSync(userMessage) {
  return chat([{ role: 'user', content: userMessage }]);
}

export { tools };