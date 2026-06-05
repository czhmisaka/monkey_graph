/**
 * 查询解析器 - Query Parser
 * 
 * 提供属性筛选、排序和聚合统计的查询能力
 * 支持的查询语法:
 * {
 *   filters: [
 *     { field: "properties.amount", operator: ">", value: 0 },
 *     { field: "properties.name", operator: "contains", value: "公司" }
 *   ],
 *   sort: [
 *     { field: "properties.amount", order: "desc" },
 *     { field: "label", order: "asc" }
 *   ],
 *   pagination: { page: 1, limit: 50 }
 * }
 */

import db from '../database.js';

// ========== 常量定义 ==========

/**
 * 支持的操作符
 */
export const OPERATORS = {
  '=': '等于',
  '!=': '不等于',
  '>': '大于',
  '<': '小于',
  '>=': '大于等于',
  '<=': '小于等于',
  'contains': '包含',
  'startsWith': '开头匹配',
  'endsWith': '结尾匹配',
  'exists': '字段存在',
  'in': '在列表中'
};

/**
 * 支持的聚合操作
 */
export const AGGREGATE_OPERATIONS = {
  'sum': '求和',
  'avg': '平均值',
  'max': '最大值',
  'min': '最小值',
  'count': '计数'
};

/**
 * 节点表允许查询的字段
 */
const ALLOWED_FIELDS = new Set([
  'id', 'graph_id', 'label', 'type', 'properties', 'x', 'y', 'created_at', 'updated_at'
]);

/**
 * 节点表允许排序的字段
 */
const ALLOWED_SORT_FIELDS = new Set([
  'id', 'label', 'type', 'x', 'y', 'created_at', 'updated_at'
]);

// ========== 查询解析器类 ==========

/**
 * 查询解析器
 */
export class QueryParser {
  constructor() {
    this.errors = [];
  }

  /**
   * 验证查询表达式
   * @param {Object} query - 查询表达式
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate(query) {
    this.errors = [];

    // 验证 filters
    if (query.filters) {
      if (!Array.isArray(query.filters)) {
        this.errors.push('filters 必须是数组');
      } else {
        query.filters.forEach((filter, index) => {
          this.validateFilter(filter, index);
        });
      }
    }

    // 验证 sort
    if (query.sort) {
      this.validateSort(query.sort);
    }

    // 验证 pagination
    if (query.pagination) {
      this.validatePagination(query.pagination);
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors
    };
  }

  /**
   * 验证单个过滤器
   */
  validateFilter(filter, index) {
    if (!filter.field) {
      this.errors.push(`filters[${index}]: 缺少 field 字段`);
      return;
    }

    // 检查是否为允许的字段
    const fieldName = filter.field.split('.')[1] || filter.field;
    if (!ALLOWED_FIELDS.has(fieldName) && !filter.field.startsWith('properties.')) {
      this.errors.push(`filters[${index}]: 不支持的字段 '${filter.field}'`);
    }

    if (!filter.operator) {
      this.errors.push(`filters[${index}]: 缺少 operator 字段`);
      return;
    }

    if (!OPERATORS[filter.operator]) {
      this.errors.push(`filters[${index}]: 不支持的操作符 '${filter.operator}'`);
      return;
    }

    // 部分操作符不需要 value
    const needsValue = !['exists'].includes(filter.operator);
    if (needsValue && (filter.value === undefined || filter.value === null)) {
      this.errors.push(`filters[${index}]: 操作符 '${filter.operator}' 需要 value 字段`);
    }
  }

  /**
   * 验证排序表达式
   */
  validateSort(sort) {
    // 单个排序
    if (typeof sort === 'object' && !Array.isArray(sort)) {
      this.validateSortItem(sort, 'sort');
      return;
    }

    // 多个排序
    if (Array.isArray(sort)) {
      sort.forEach((item, index) => {
        this.validateSortItem(item, `sort[${index}]`);
      });
    }
  }

  /**
   * 验证单个排序项
   */
  validateSortItem(item, path) {
    if (!item.field) {
      this.errors.push(`${path}: 缺少 field 字段`);
      return;
    }

    // 允许的排序字段：直接字段名 或 properties.xxx 或不带前缀的属性名
    const fieldName = item.field.split('.')[1] || item.field;
    const isAllowedField = ALLOWED_SORT_FIELDS.has(fieldName) || 
                           item.field.startsWith('properties.') ||
                           !item.field.includes('.');
    
    if (!isAllowedField) {
      this.errors.push(`${path}: 不支持的排序字段 '${item.field}'`);
    }

    if (item.order && !['asc', 'desc'].includes(item.order.toLowerCase())) {
      this.errors.push(`${path}: 排序方向必须是 'asc' 或 'desc'`);
    }
  }

  /**
   * 验证分页参数
   */
  validatePagination(pagination) {
    if (pagination.page !== undefined) {
      const page = parseInt(pagination.page);
      if (isNaN(page) || page < 1) {
        this.errors.push('pagination.page 必须是大于等于 1 的整数');
      }
    }

    if (pagination.limit !== undefined) {
      const limit = parseInt(pagination.limit);
      if (isNaN(limit) || limit < 1) {
        this.errors.push('pagination.limit 必须是大于等于 1 的整数');
      }
      if (limit > 1000) {
        this.errors.push('pagination.limit 最大值为 1000');
      }
    }
  }

  /**
   * 将查询表达式转换为 SQLite WHERE 子句
   * @param {Object[]} filters - 过滤器数组
   * @returns {Object} { where: string, params: any[] }
   */
  toSQLWhere(filters) {
    if (!filters || filters.length === 0) {
      return { where: '', params: [] };
    }

    const conditions = [];
    const params = [];

    for (const filter of filters) {
      const condition = this.filterToSQL(filter, params);
      if (condition) {
        conditions.push(`(${condition})`);
      }
    }

    return {
      where: conditions.length > 0 ? conditions.join(' AND ') : '',
      params
    };
  }

  /**
   * 将单个过滤器转换为 SQL 条件
   */
  filterToSQL(filter, params) {
    const { field, operator, value } = filter;

    // 处理 properties.xxx 字段
    let sqlField;
    if (field.startsWith('properties.')) {
      const propName = field.split('.')[1];
      sqlField = `json_extract(properties, '$.${propName}')`;
    } else {
      sqlField = field;
    }

    switch (operator) {
      case '=':
        params.push(value);
        return `${sqlField} = ?`;

      case '!=':
        params.push(value);
        return `${sqlField} != ?`;

      case '>':
        params.push(value);
        return `${sqlField} > ?`;

      case '<':
        params.push(value);
        return `${sqlField} < ?`;

      case '>=':
        params.push(value);
        return `${sqlField} >= ?`;

      case '<=':
        params.push(value);
        return `${sqlField} <= ?`;

      case 'contains':
        params.push(`%${value}%`);
        return `${sqlField} LIKE ?`;

      case 'startsWith':
        params.push(`${value}%`);
        return `${sqlField} LIKE ?`;

      case 'endsWith':
        params.push(`%${value}`);
        return `${sqlField} LIKE ?`;

      case 'exists':
        if (value === false || value === 0) {
          return `${sqlField} IS NULL`;
        }
        return `${sqlField} IS NOT NULL`;

      case 'in':
        if (!Array.isArray(value)) {
          params.push(value);
          return `${sqlField} = ?`;
        }
        const placeholders = value.map(() => '?').join(', ');
        params.push(...value);
        return `${sqlField} IN (${placeholders})`;

      default:
        return null;
    }
  }

  /**
   * 将排序表达式转换为 SQLite ORDER BY 子句
   * @param {Object|Object[]} sort - 排序表达式
   * @returns {string} ORDER BY 子句
   */
  toSQLOrderBy(sort) {
    if (!sort) return '';

    const items = Array.isArray(sort) ? sort : [sort];
    const orderClauses = [];

    for (const item of items) {
      if (!item.field) continue;

      // 处理 properties.xxx 字段
      let sqlField;
      if (item.field.startsWith('properties.')) {
        const propName = item.field.split('.')[1];
        sqlField = `json_extract(properties, '$.${propName}')`;
      } else if (!item.field.includes('.')) {
        // 支持直接字段名，如 "金额" -> json_extract(properties, '$.金额')
        sqlField = `json_extract(properties, '$.${item.field}')`;
      } else {
        sqlField = item.field;
      }

      const order = (item.order || 'asc').toLowerCase();
      
      // 处理数值排序 vs 字符串排序
      if (item.type === 'number' || item.type === 'numeric') {
        // 数值排序：使用 CAST + 0 转换为数值，NULL 值排在最后
        orderClauses.push(`(CASE WHEN ${sqlField} IS NULL THEN 1 ELSE 0 END) ASC, (${sqlField} + 0) ${order}`);
      } else {
        // 字符串排序：NULL 值排在最后
        orderClauses.push(`(CASE WHEN ${sqlField} IS NULL THEN 1 ELSE 0 END) ASC, ${sqlField} ${order}`);
      }
    }

    return orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
  }

  /**
   * 获取分页参数
   * @param {Object} pagination - 分页参数
   * @returns {Object} { limit: number, offset: number }
   */
  getPagination(pagination) {
    const page = parseInt(pagination?.page) || 1;
    const limit = Math.min(parseInt(pagination?.limit) || 50, 1000);
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }
}

// ========== 便捷函数 ==========

/**
 * 执行节点查询
 * @param {string} graphId - 图谱ID
 * @param {Object} query - 查询表达式
 * @returns {Promise<Object>} 查询结果
 */
export async function queryNodes(graphId, query) {
  const parser = new QueryParser();

  // 验证查询表达式
  const validation = parser.validate(query);
  if (!validation.valid) {
    throw new Error(`查询验证失败: ${validation.errors.join(', ')}`);
  }

  // 解析查询条件
  const { where: whereClause, params: whereParams } = parser.toSQLWhere(query.filters);
  const orderByClause = parser.toSQLOrderBy(query.sort);
  const { page, limit, offset } = parser.getPagination(query.pagination);

  // 构建查询
  let where = `WHERE graph_id = ?`;
  const params = [graphId, ...whereParams];

  if (whereClause) {
    where += ` AND ${whereClause}`;
  }

  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM nodes ${where}`;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult?.total || 0;

  // 获取数据
  let dataSql = `SELECT * FROM nodes ${where}`;
  if (orderByClause) {
    dataSql += ` ${orderByClause}`;
  }
  dataSql += ` LIMIT ? OFFSET ?`;

  const nodes = db.prepare(dataSql).all(...params, limit, offset);

  // 转换 properties，排除 embedding 字段以节省带宽
  const formattedNodes = nodes.map(n => {
    const { embedding, ...rest } = n;
    return {
      ...rest,
      properties: JSON.parse(rest.properties || '{}')
    };
  });

  return {
    nodes: formattedNodes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total
    }
  };
}

/**
 * 执行聚合统计
 * @param {string} graphId - 图谱ID
 * @param {string} field - 聚合字段
 * @param {string[]} operations - 聚合操作
 * @param {Object} filters - 过滤器（可选）
 * @returns {Promise<Object>} 聚合结果
 */
export async function aggregateNodes(graphId, field, operations, filters = []) {
  const parser = new QueryParser();

  // 解析过滤条件
  const { where: whereClause, params: whereParams } = parser.toSQLWhere(filters);

  // 构建 WHERE
  let where = `WHERE graph_id = ?`;
  const params = [graphId, ...whereParams];

  if (whereClause) {
    where += ` AND ${whereClause}`;
  }

  // 确定聚合字段
  let aggField;
  if (field.startsWith('properties.')) {
    const propName = field.split('.')[1];
    aggField = `json_extract(properties, '$.${propName}')`;
  } else {
    aggField = field;
  }

  // 构建聚合查询（使用别名便于访问返回值）
  const aggFunctions = operations.map(op => {
    const opLower = op.toLowerCase();
    switch (opLower) {
      case 'sum':
        return `SUM(${aggField}) as sum_result`;
      case 'avg':
        return `AVG(${aggField}) as avg_result`;
      case 'max':
        return `MAX(${aggField}) as max_result`;
      case 'min':
        return `MIN(${aggField}) as min_result`;
      case 'count':
        return `COUNT(*) as count_result`;
      default:
        return null;
    }
  }).filter(Boolean);

  if (aggFunctions.length === 0) {
    throw new Error('没有有效的聚合操作');
  }

  const sql = `SELECT ${aggFunctions.join(', ')} FROM nodes ${where}`;
  const result = db.prepare(sql).get(...params);

  // 格式化结果
  const results = {};
  operations.forEach((op) => {
    const key = op.toLowerCase();
    let value;
    
    // 根据操作类型获取对应的别名结果
    switch (key) {
      case 'sum':
        value = result.sum_result;
        break;
      case 'avg':
        value = result.avg_result;
        break;
      case 'max':
        value = result.max_result;
        break;
      case 'min':
        value = result.min_result;
        break;
      case 'count':
        value = result.count_result;
        break;
      default:
        value = null;
    }
    
    // 处理 NULL 值和数值格式化
    if (value === null || value === undefined) {
      results[key] = null;
    } else if (key === 'avg' || key === 'sum') {
      results[key] = parseFloat(parseFloat(value).toFixed(2));
    } else {
      results[key] = value;
    }
  });

  return {
    field,
    results
  };
}

/**
 * 按类型分组聚合
 * @param {string} graphId - 图谱ID
 * @param {string} aggField - 聚合字段
 * @param {string[]} operations - 聚合操作
 * @returns {Promise<Object>} 分组聚合结果
 */
export async function groupByType(graphId, aggField, operations) {
  // 确定聚合字段
  let sqlAggField;
  if (aggField.startsWith('properties.')) {
    const propName = aggField.split('.')[1];
    sqlAggField = `json_extract(properties, '$.${propName}')`;
  } else {
    sqlAggField = aggField;
  }

  // 构建聚合函数（COUNT(*) 特殊处理，不需要别名）
  const aggFunctions = operations.map(op => {
    switch (op.toLowerCase()) {
      case 'sum':
        return `SUM(${sqlAggField}) as sum_result`;
      case 'avg':
        return `AVG(${sqlAggField}) as avg_result`;
      case 'max':
        return `MAX(${sqlAggField}) as max_result`;
      case 'min':
        return `MIN(${sqlAggField}) as min_result`;
      case 'count':
        return `COUNT(*) as count_result`;
      default:
        return null;
    }
  }).filter(Boolean);

  const sql = `
    SELECT type, ${aggFunctions.join(', ')}
    FROM nodes
    WHERE graph_id = ?
    GROUP BY type
  `;

  const results = db.prepare(sql).all(graphId);

  // 格式化结果
  return results.map(row => ({
    type: row.type,
    stats: {
      count: row.count_result || 0,
      sum: row.sum_result !== null ? parseFloat(row.sum_result.toFixed(2)) : null,
      avg: row.avg_result !== null ? parseFloat(row.avg_result.toFixed(2)) : null,
      max: row.max_result,
      min: row.min_result
    }
  }));
}

// ========== 排名查询函数 ==========

/**
 * 按属性值排名查询节点
 * @param {string} graphId - 图谱ID
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 排名结果
 */
export async function rankNodes(graphId, options = {}) {
  const parser = new QueryParser();
  const { field, order = 'desc', filters = [], limit = 100 } = options;

  if (!field) {
    throw new Error('排名字段不能为空');
  }

  // 解析过滤条件
  const { where: whereClause, params: whereParams } = parser.toSQLWhere(filters);

  // 构建 WHERE
  let where = `WHERE graph_id = ?`;
  const params = [graphId, ...whereParams];

  if (whereClause) {
    where += ` AND ${whereClause}`;
  }

  // 处理属性字段
  let rankField;
  if (field.startsWith('properties.')) {
    const propName = field.split('.')[1];
    rankField = `json_extract(properties, '$.${propName}')`;
  } else {
    rankField = `json_extract(properties, '$.${field}')`;
  }

  // 获取所有节点及其数值（用于排名）
  let sql = `SELECT id, label, type, properties, ${rankField} as rank_value FROM nodes ${where}`;
  const nodes = db.prepare(sql).all(...params);

  // 过滤掉 NULL 值，只对有值的节点进行排名
  const validNodes = nodes.filter(n => n.rank_value !== null);
  
  // 转换为数值进行排序，排除 embedding 字段以节省带宽
  const parsedNodes = validNodes.map(n => {
    const { embedding, ...rest } = n;
    return {
      ...rest,
      rankValue: parseFloat(n.rank_value),
      properties: JSON.parse(rest.properties || '{}')
    };
  });

  // 排序：desc 从大到小（return a - b），asc 从小到大（return b - a）
  parsedNodes.sort((a, b) => {
    if (order.toLowerCase() === 'desc') {
      return b.rankValue - a.rankValue; // 降序：大的在前
    } else {
      return a.rankValue - b.rankValue; // 升序：小的在前
    }
  });

  // 添加排名
  const rankedNodes = parsedNodes.slice(0, limit).map((n, index) => ({
    ...n,
    rank: index + 1,
    [field]: n.rankValue
  }));

  // 构建原始节点列表（包含 NULL 值的节点），排除 embedding 字段
  const formattedNodes = nodes.map(n => {
    const { embedding, ...rest } = n;
    return {
      ...rest,
      properties: JSON.parse(rest.properties || '{}'),
      [field]: n.rank_value !== null ? parseFloat(n.rank_value) : null
    };
  });

  return {
    nodes: formattedNodes,
    ranking: {
      field,
      order,
      validCount: validNodes.length,
      rankings: rankedNodes.map(n => ({
        nodeId: n.id,
        label: n.label,
        rank: n.rank,
        value: n.rankValue
      }))
    },
    pagination: {
      page: 1,
      limit,
      total: validNodes.length,
      totalPages: 1,
      hasMore: false
    }
  };
}

/**
 * 获取 Top-N 节点
 * @param {string} graphId - 图谱ID
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} Top-N 结果
 */
export async function getTopNodes(graphId, options = {}) {
  const parser = new QueryParser();
  const { field, order = 'desc', limit = 10, filters = [] } = options;

  if (!field) {
    throw new Error('字段不能为空');
  }

  // 解析过滤条件
  const { where: whereClause, params: whereParams } = parser.toSQLWhere(filters);

  // 构建 WHERE
  let where = `WHERE graph_id = ?`;
  const params = [graphId, ...whereParams];

  if (whereClause) {
    where += ` AND ${whereClause}`;
  }

  // 处理属性字段
  let rankField;
  if (field.startsWith('properties.')) {
    const propName = field.split('.')[1];
    rankField = `json_extract(properties, '$.${propName}')`;
  } else {
    rankField = `json_extract(properties, '$.${field}')`;
  }

  // 获取所有节点及其数值
  let sql = `SELECT id, label, type, properties, ${rankField} as rank_value FROM nodes ${where}`;
  const nodes = db.prepare(sql).all(...params);

  // 过滤掉 NULL 值
  const validNodes = nodes.filter(n => n.rank_value !== null);
  
  // 转换为数值进行排序，排除 embedding 字段以节省带宽
  const parsedNodes = validNodes.map(n => {
    const { embedding, ...rest } = n;
    return {
      ...rest,
      rankValue: parseFloat(n.rank_value),
      properties: JSON.parse(rest.properties || '{}')
    };
  });

  // 排序：desc 从大到小（return a - b），asc 从小到大（return b - a）
  parsedNodes.sort((a, b) => {
    if (order.toLowerCase() === 'desc') {
      return b.rankValue - a.rankValue; // 降序：大的在前
    } else {
      return a.rankValue - b.rankValue; // 升序：小的在前
    }
  });

  // 取 Top-N 并添加排名
  const topNodes = parsedNodes.slice(0, limit).map((n, index) => ({
    rank: index + 1,
    id: n.id,
    label: n.label,
    type: n.type,
    properties: n.properties,
    [field]: n.rankValue
  }));

  return {
    field,
    order,
    top: topNodes
  };
}

/**
 * 获取字段统计信息（增强版）
 * @param {string} graphId - 图谱ID
 * @returns {Promise<Object>} 字段统计
 */
export async function getFieldStatsEnhanced(graphId) {
  // 获取所有节点
  const nodes = db.prepare(`
    SELECT id, type, properties FROM nodes WHERE graph_id = ?
  `).all(graphId);

  const totalNodes = nodes.length;

  // 按类型统计
  const typeCounts = {};
  nodes.forEach(node => {
    const type = node.type || 'default';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  // 收集所有属性字段
  const fieldStats = {};
  
  nodes.forEach(node => {
    try {
      const props = JSON.parse(node.properties || '{}');
      Object.keys(props).forEach(key => {
        if (!fieldStats[key]) {
          fieldStats[key] = {
            type: 'unknown',
            count: 0,
            numericStats: null,
            sample: []
          };
        }
        fieldStats[key].count++;
        
        // 收集样本（前10个）
        if (fieldStats[key].sample.length < 10) {
          fieldStats[key].sample.push(props[key]);
        }
      });
    } catch (e) {
      // 忽略解析错误
    }
  });

  // 分析每个字段的类型
  const fields = {};
  for (const [fieldName, stats] of Object.entries(fieldStats)) {
    // 尝试判断是否为数值类型
    let isNumeric = true;
    let numericValues = [];
    
    for (const sample of stats.sample) {
      const num = parseFloat(sample);
      if (isNaN(num) || String(sample).replace(/[0-9.-]/g, '') !== '') {
        isNumeric = false;
        break;
      }
      numericValues.push(num);
    }

    const fieldInfo = {
      type: isNumeric ? 'number' : 'string',
      count: stats.count,
      sample: stats.sample.slice(0, 5),
      recommendSort: isNumeric ? 'numeric' : 'alphabetical'
    };

    if (isNumeric && numericValues.length > 0) {
      numericValues.sort((a, b) => a - b);
      fieldInfo.numericStats = {
        min: numericValues[0],
        max: numericValues[numericValues.length - 1],
        avg: parseFloat((numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2)),
        count: numericValues.length
      };
    }

    fields[fieldName] = fieldInfo;
  }

  return {
    totalNodes,
    typeCounts,
    fields
  };
}

// ========== 导出默认实例 ==========

export default new QueryParser();
