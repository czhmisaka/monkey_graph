import dotenv from 'dotenv';
dotenv.config();

import { spawn } from 'child_process';
import logger from './logger.js';

// MCP 服务器配置
const MCP_SERVER_COMMAND = 'uvx';
const MCP_SERVER_ARGS = ['minimax-coding-plan-mcp', '-y'];

// 存储进程和状态
let mcpProcess = null;
let isConnected = false;
let isDegraded = false; // 降级模式
let requestId = 0;
let serverCapabilities = null;
let reconnectTimer = null;
let initAttemptCount = 0;
const MAX_INIT_ATTEMPTS = 3;

// 初始化 MCP 客户端
export async function initMCPClient(forceReconnect = false) {
  if (isConnected && !forceReconnect) {
    logger.info('【MCP】', '✅ MCP 客户端已连接');
    return;
  }
  
  // 如果已经在降级模式且不是强制重连，则不尝试
  if (isDegraded && !forceReconnect) {
    logger.info('【MCP】', '⚠️ MCP 处于降级模式，请稍后重试');
    return;
  }

  // 如果正在重连，清除之前的定时器
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    // 如果已有进程，先关闭
    if (mcpProcess) {
      try {
        mcpProcess.kill();
      } catch (e) {
        // 忽略关闭错误
      }
      mcpProcess = null;
    }
    
    logger.info('【MCP】', '🔄 正在启动 MCP 服务器...');
    initAttemptCount++;
    
    // 设置环境变量 - 使用与 LLM 相同的 API 配置
    // 使用正则表达式同时处理 /v1 和 /v1/ 两种情况
    const env = {
      ...process.env,
      MINIMAX_API_KEY: process.env.LLM_CLOUD_API_KEY,
      MINIMAX_API_HOST: process.env.LLM_CLOUD_BASE_URL?.replace(/\/v1\/?$/, '') || 'https://api.minimaxi.com'
    };
    
    logger.info('【MCP】', `   API Host: ${env.MINIMAX_API_HOST}`);
    
    // 启动 Python 进程
    mcpProcess = spawn(MCP_SERVER_COMMAND, MCP_SERVER_ARGS, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let buffer = '';
    
    mcpProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      // 处理收到的消息
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line);
            logger.debug('【MCP】', `📥 收到: ${JSON.stringify(msg).substring(0, 100)}`);
          } catch (e) {
            // 忽略非 JSON 消息
          }
        }
      }
    });
    
    mcpProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      logger.info('【MCP】', `📡 stderr: ${msg}`);
    });
    
    mcpProcess.on('error', (error) => {
      logger.error('【MCP】', `❌ 进程错误: ${error.message}`);
      isConnected = false;
      handleDisconnect();
    });
    
    mcpProcess.on('close', (code) => {
      logger.info('【MCP】', `🔴 进程退出: ${code}`);
      isConnected = false;
      handleDisconnect();
    });
    
    // 等待进程启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 检查进程是否成功启动
    if (!mcpProcess || mcpProcess.exitCode !== null) {
      throw new Error('MCP 进程启动失败');
    }
    
    // 发送 initialize 请求来初始化会话
    logger.info('【MCP】', '🔄 正在初始化会话...');
    try {
      const initResult = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'czhgraph',
          version: '1.0.0'
        }
      }, true); // skipConnectedCheck = true
      serverCapabilities = initResult.capabilities;
      logger.info('【MCP】', `✅ 会话初始化成功: ${JSON.stringify(serverCapabilities)}`);
    } catch (error) {
      logger.error('【MCP】', `❌ 会话初始化失败: ${error.message}`);
      throw error;
    }
    
    // 发送 initialized 通知
    mcpProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    }) + '\n');
    
    isConnected = true;
    isDegraded = false;
    initAttemptCount = 0;
    logger.info('【MCP】', '✅ MCP 服务器连接成功');
    
  } catch (error) {
    logger.error('【MCP】', `❌ MCP 连接失败: ${error.message}`);
    isConnected = false;
    handleDisconnect();
    throw error;
  }
}

// 处理断开连接
function handleDisconnect() {
  isConnected = false;
  
  // 如果不是强制重连，设置降级模式
  if (initAttemptCount >= MAX_INIT_ATTEMPTS) {
    isDegraded = true;
    logger.warn('【MCP】', `⚠️ MCP 连接失败次数过多，进入降级模式`);
  }
  
  // 设置定期重连（每30秒尝试一次）
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      logger.info('【MCP】', '🔄 尝试重新连接 MCP...');
      reconnectTimer = null;
      initMCPClient(true).catch(err => {
        logger.error('【MCP】', `❌ 重连失败: ${err.message}`);
      });
    }, 30000);
  }
}

/**
 * 发送 JSON-RPC 请求到 MCP 服务器
 * @param {string} method - 方法名
 * @param {object} params - 参数
 * @param {boolean} skipConnectedCheck - 是否跳过连接检查（用于初始化过程）
 */
function sendRequest(method, params = {}, skipConnectedCheck = false) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || (!isConnected && !skipConnectedCheck)) {
      reject(new Error('MCP 未连接'));
      return;
    }
    
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    const requestStr = JSON.stringify(request) + '\n';
    
    logger.info('【MCP】', `📤 发送请求: ${JSON.stringify(request)}`);
    
    mcpProcess.stdin.write(requestStr);
    
    // 设置超时
    const timeout = setTimeout(() => {
      reject(new Error('请求超时'));
    }, 30000);
    
    // 收集响应
    let responseBuffer = '';
    
    const onData = (data) => {
      responseBuffer += data.toString();
      
      // 尝试解析响应
      const lines = responseBuffer.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            clearTimeout(timeout);
            mcpProcess.stdout.removeListener('data', onData);
            
            if (response.id === id) {
              if (response.error) {
                reject(new Error(response.error.message || JSON.stringify(response.error)));
              } else {
                resolve(response.result);
              }
            }
          } catch (e) {
            // 继续等待
          }
        }
      }
    };
    
    mcpProcess.stdout.on('data', onData);
  });
}

/**
 * 列出所有可用的 MCP 工具
 */
export async function listTools() {
  if (!isConnected) {
    await initMCPClient();
  }
  
  try {
    const result = await sendRequest('tools/list');
    return result.tools || [];
  } catch (error) {
    logger.error('【MCP】', `❌ 获取工具列表失败: ${error.message}`);
    return [];
  }
}

/**
 * 检查结果是否包含错误信息
 */
function checkResultForError(result) {
  if (!result) return { isError: false, error: null };
  
  // 检查 result 是否为对象
  if (typeof result !== 'object') return { isError: false, error: null };
  
  // 检查 isError 字段
  if (result.isError === true) {
    const errorMsg = result.content?.[0]?.text || 'Unknown error';
    return { isError: true, error: errorMsg };
  }
  
  // 检查 content 中是否包含错误信息
  const content = result.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text') {
        const text = item.text || '';
        // 检查常见的错误关键词
        if (text.includes('Failed to perform search') ||
            text.includes('error') ||
            text.includes('Error') ||
            text.includes('失败') ||
            text.includes('SSL') ||
            text.includes('connection')) {
          return { isError: true, error: text };
        }
      }
    }
  }
  
  return { isError: false, error: null };
}

/**
 * 调用 MCP 工具
 */
export async function callMCPTool(toolName, args) {
  if (!isConnected) {
    await initMCPClient();
  }
  
  try {
    logger.info('【MCP】', `🔧 调用工具: ${toolName}`);
    logger.debug('【MCP】', `   参数: ${JSON.stringify(args)}`);
    
    const result = await sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    
    // 检查结果中是否包含错误信息
    const errorCheck = checkResultForError(result);
    if (errorCheck.isError) {
      logger.error('【MCP】', `❌ 工具执行失败: ${errorCheck.error}`);
      return { success: false, error: errorCheck.error };
    }
    
    logger.info('【MCP】', `✅ 工具调用成功`);
    return { success: true, data: result };
  } catch (error) {
    logger.error('【MCP】', `❌ 工具调用失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Web Search 工具（通过 MCP 调用）
 * 包含重试机制和更好的错误处理
 */
export async function webSearch(query, maxRetries = 2) {
  logger.info('【WebSearch】', `🔍 搜索: ${query}`);
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      logger.info('【WebSearch】', `🔄 重试 ${attempt}/${maxRetries}...`);
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
    
    const result = await callMCPTool('web_search', { query });
    
    if (result.success) {
      logger.info('【WebSearch】', `✅ 搜索完成`);
      return result;
    }
    
    lastError = result.error;
    
    // 如果错误包含 SSL 或网络相关错误，才进行重试
    const isRetryableError = lastError && (
      lastError.includes('SSL') || 
      lastError.includes('EOF') || 
      lastError.includes('connection') ||
      lastError.includes('timeout') ||
      lastError.includes('网络')
    );
    
    if (!isRetryableError || attempt >= maxRetries) {
      break;
    }
  }
  
  logger.error('【WebSearch】', `❌ 搜索失败: ${lastError}`);
  
  // 返回结构化的错误信息
  return {
    success: false,
    error: lastError,
    isNetworkError: lastError?.includes('SSL') || lastError?.includes('connection')
  };
}

/**
 * 图片理解工具（通过 MCP 调用）
 */
export async function understandImage(imageSource, prompt) {
  logger.info('【UnderstandImage】', `🖼️ 分析图片: ${imageSource}`);
  
  const result = await callMCPTool('understand_image', {
    image_url: imageSource,
    prompt: prompt
  });
  
  if (result.success) {
    logger.info('【UnderstandImage】', `✅ 图片分析完成`);
  } else {
    logger.error('【UnderstandImage】', `❌ 图片分析失败: ${result.error}`);
  }
  
  return result;
}

/**
 * 获取 MCP 工具定义（用于 LLM 工具列表）
 */
export function getMCPToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: '通过网络搜索获取最新信息。当查询需要实时数据、新闻或其他网络资源时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词'
            }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'understand_image',
        description: '分析图片内容，提取图片中的信息',
        parameters: {
          type: 'object',
          properties: {
            image_source: {
              type: 'string',
              description: '图片 URL 或本地路径'
            },
            prompt: {
              type: 'string',
              description: '需要图片分析的问题'
            }
          },
          required: ['image_source', 'prompt']
        }
      }
    }
  ];
}

/**
 * 执行 MCP 工具（供 llmService 调用）
 */
export async function executeMCPTool(toolName, args) {
  switch (toolName) {
    case 'web_search':
      return await webSearch(args.query);
    case 'understand_image':
      return await understandImage(args.image_url, args.prompt);
    default:
      return await callMCPTool(toolName, args);
  }
}

/**
 * 检查 MCP 连接状态
 */
export function isMCPConnected() {
  return isConnected;
}

/**
 * 检查 MCP 是否处于降级模式
 */
export function isMCPDegraded() {
  return isDegraded;
}

/**
 * 获取 MCP 详细状态
 */
export function getMCPStatus() {
  return {
    connected: isConnected,
    degraded: isDegraded,
    message: isDegraded 
      ? 'MCP 服务暂时不可用，将无法使用网络搜索功能。系统正在尝试重新连接...'
      : isConnected 
        ? 'MCP 服务已连接'
        : 'MCP 服务未连接'
  };
}

/**
 * 断开 MCP 连接
 */
export async function disconnectMCP() {
  if (mcpProcess) {
    try {
      mcpProcess.kill();
      isConnected = false;
      isDegraded = false;
      mcpProcess = null;
      logger.info('【MCP】', '✅ MCP 连接已断开');
    } catch (error) {
      logger.error('【MCP】', `❌ 断开连接失败: ${error.message}`);
    }
  }
}

// 导出默认对象
export default {
  initMCPClient,
  listTools,
  callMCPTool,
  webSearch,
  understandImage,
  getMCPToolDefinitions,
  executeMCPTool,
  isMCPConnected,
  getMCPStatus,
  disconnectMCP
};
