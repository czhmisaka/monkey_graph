/**
 * 响应格式化工具 - 用于优化 Agent 接口返回的信息密度
 */

/**
 * 解析 fields 参数
 * @param {string} fieldsStr - 逗号分隔的字段字符串，如 "id,name,type" 或 "-embedding,-properties"
 * @returns {Object} { include: Set<string>, exclude: Set<string> }
 */
export function parseFieldsParam(fieldsStr) {
  if (!fieldsStr) return null;
  
  const include = new Set();
  const exclude = new Set();
  
  const parts = fieldsStr.split(',').map(s => s.trim()).filter(Boolean);
  
  for (const part of parts) {
    if (part.startsWith('-')) {
      exclude.add(part.slice(1));
    } else {
      include.add(part);
    }
  }
  
  return { include, exclude };
}

/**
 * 过滤对象字段
 * @param {Object} obj - 要过滤的对象
 * @param {Object} fields - parseFieldsParam 返回的结果
 * @param {Array} defaultFields - 默认包含的字段（当没有指定 fields 时）
 * @returns {Object} 过滤后的对象
 */
export function filterFields(obj, fields, defaultFields = null) {
  if (!fields && !defaultFields) return obj;
  
  const result = {};
  
  if (fields) {
    const { include, exclude } = fields;
    
    // 如果指定了 include，只返回这些字段
    if (include.size > 0) {
      for (const key of include) {
        if (obj[key] !== undefined) {
          result[key] = obj[key];
        }
      }
      return result;
    }
    
    // 如果指定了 exclude，排除这些字段
    if (exclude.size > 0) {
      for (const key of Object.keys(obj)) {
        if (!exclude.has(key)) {
          result[key] = obj[key];
        }
      }
      return result;
    }
  }
  
  // 默认：返回指定字段
  if (defaultFields) {
    for (const key of defaultFields) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * 判断是否启用摘要模式
 * @param {Object} query - req.query 对象
 * @returns {boolean}
 */
export function isSummaryMode(query) {
  return query.summary === 'true' || query.summary === '1';
}

/**
 * 获取摘要模式的默认字段
 * @param {string} resourceType - 资源类型: 'graph' | 'node' | 'edge'
 * @returns {Array<string>}
 */
export function getSummaryFields(resourceType) {
  const summaryFields = {
    graph: ['id', 'name', 'description'],
    node: ['id', 'label', 'type'],
    edge: ['id', 'source', 'target', 'label'],
    agent: ['id', 'name', 'description'],
    workspace: ['id', 'name', 'description']
  };
  
  return summaryFields[resourceType] || null;
}

/**
 * 格式化列表响应
 * @param {Array} items - 数据列表
 * @param {Object} query - req.query 对象
 * @param {string} resourceType - 资源类型
 * @returns {Object} 格式化后的响应
 */
export function formatListResponse(items, query, resourceType) {
  const summaryMode = isSummaryMode(query);
  const fields = parseFieldsParam(query.fields);
  
  // 过滤字段
  let formattedItems = items;
  if (summaryMode || fields) {
    const defaultFields = summaryMode ? getSummaryFields(resourceType) : null;
    formattedItems = items.map(item => filterFields(item, fields, defaultFields));
  } else {
    // 默认排除 embedding 字段以节省带宽
    formattedItems = items.map(item => {
      const { embedding, ...rest } = item;
      return rest;
    });
  }
  
  const response = {
    data: formattedItems,
    total: items.length
  };
  
  // 如果有分页参数，添加分页信息
  if (query.limit || query.offset) {
    response.pagination = {
      limit: parseInt(query.limit) || items.length,
      offset: parseInt(query.offset) || 0,
      total: items.length
    };
  }
  
  return response;
}

/**
 * 格式化单个资源响应
 * @param {Object} item - 数据对象
 * @param {Object} query - req.query 对象
 * @param {string} resourceType - 资源类型
 * @returns {Object} 格式化后的响应
 */
export function formatItemResponse(item, query, resourceType) {
  if (!item) return null;
  
  const summaryMode = isSummaryMode(query);
  const fields = parseFieldsParam(query.fields);
  const defaultFields = summaryMode ? getSummaryFields(resourceType) : null;
  
  let formattedItem = filterFields(item, fields, defaultFields);
  
  // 默认排除 embedding
  if (!fields && !summaryMode && formattedItem.embedding) {
    const { embedding, ...rest } = formattedItem;
    formattedItem = rest;
  }
  
  return formattedItem;
}

/**
 * 格式化批量操作响应
 * @param {Array} items - 操作结果数组
 * @param {string} idField - ID 字段名，默认 'id'
 * @returns {Object} 精简的响应
 */
export function formatBatchResponse(items, idField = 'id') {
  return {
    count: items.length,
    ids: items.map(item => item[idField]).filter(Boolean)
  };
}

/**
 * 格式化错误响应
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @param {Object} details - 详细信息
 * @returns {Object}
 */
export function formatError(message, code = 'ERROR', details = null) {
  const error = { error: message, code };
  if (details) {
    error.details = details;
  }
  return error;
}