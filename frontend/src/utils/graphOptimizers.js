/**
 * 图谱性能优化工具类
 * 包含节点-边索引、四叉树空间索引等优化数据结构
 */

import * as d3 from 'd3'

// ========== 节点-边索引 ==========

/**
 * 边索引类 - 快速查找节点关联的边和节点
 */
export class EdgeIndex {
  constructor() {
    this.sourceToEdges = new Map(); // sourceId -> Set of edgeIds
    this.targetToEdges = new Map(); // targetId -> Set of edgeIds
    this.edgeToNodes = new Map();  // edgeId -> { source, target }
    this.degree = new Map();        // nodeId -> degree count
  }

  /**
   * 从边数组构建索引
   * @param {Array} edges - 边数组
   */
  build(edges) {
    // 清空现有数据
    this.sourceToEdges.clear();
    this.targetToEdges.clear();
    this.edgeToNodes.clear();
    this.degree.clear();

    edges.forEach(edge => {
      const edgeId = edge.id;
      const sourceId = edge.source?.id || edge.source;
      const targetId = edge.target?.id || edge.target;

      // 建立边到节点的映射
      this.edgeToNodes.set(edgeId, { source: sourceId, target: targetId });

      // 建立源节点到边的映射
      if (!this.sourceToEdges.has(sourceId)) {
        this.sourceToEdges.set(sourceId, new Set());
      }
      this.sourceToEdges.get(sourceId).add(edgeId);

      // 建立目标节点到边的映射
      if (!this.targetToEdges.has(targetId)) {
        this.targetToEdges.set(targetId, new Set());
      }
      this.targetToEdges.get(targetId).add(edgeId);

      // 更新度数
      this.degree.set(sourceId, (this.degree.get(sourceId) || 0) + 1);
      this.degree.set(targetId, (this.degree.get(targetId) || 0) + 1);
    });
  }

  /**
   * 获取节点的所有相关边ID
   * @param {string} nodeId - 节点ID
   * @returns {Set} 边ID集合
   */
  getRelatedEdges(nodeId) {
    const edges = new Set();
    
    if (this.sourceToEdges.has(nodeId)) {
      this.sourceToEdges.get(nodeId).forEach(id => edges.add(id));
    }
    if (this.targetToEdges.has(nodeId)) {
      this.targetToEdges.get(nodeId).forEach(id => edges.add(id));
    }
    
    return edges;
  }

  /**
   * 获取节点的所有相关节点ID
   * @param {string} nodeId - 节点ID
   * @returns {Set} 节点ID集合
   */
  getRelatedNodes(nodeId) {
    const relatedNodes = new Set();
    const relatedEdges = this.getRelatedEdges(nodeId);

    relatedEdges.forEach(edgeId => {
      const edge = this.edgeToNodes.get(edgeId);
      if (edge) {
        if (edge.source !== nodeId) relatedNodes.add(edge.source);
        if (edge.target !== nodeId) relatedNodes.add(edge.target);
      }
    });

    return relatedNodes;
  }

  /**
   * 获取节点的度数（连接数）
   * @param {string} nodeId - 节点ID
   * @returns {number} 度数
   */
  getDegree(nodeId) {
    return this.degree.get(nodeId) || 0;
  }

  /**
   * 检查边是否存在
   * @param {string} edgeId - 边ID
   * @returns {boolean}
   */
  hasEdge(edgeId) {
    return this.edgeToNodes.has(edgeId);
  }

  /**
   * 获取边的两端节点
   * @param {string} edgeId - 边ID
   * @returns {{source, target}|null}
   */
  getEdgeEndpoints(edgeId) {
    return this.edgeToNodes.get(edgeId) || null;
  }

  /**
   * 获取度数最高的N个节点
   * @param {number} n - 数量
   * @returns {Array} 节点ID数组
   */
  getTopDegreeNodes(n) {
    return Array.from(this.degree.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id);
  }
}

// ========== 空间索引 (四叉树 + 网格混合) ==========

/**
 * 空间索引类 - 四叉树 + 网格混合索引
 */
export class SpatialIndex {
  constructor(gridSize = 50) {
    this.quadtree = null;
    this.gridSize = gridSize;
    this.grid = new Map(); // cellKey -> nodeIds[]
    this.nodeMap = new Map(); // nodeId -> node
    this.gridBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  /**
   * 构建空间索引
   * @param {Array} nodes - 节点数组
   */
  build(nodes) {
    this.clear();
    
    // 保存节点映射
    nodes.forEach(node => {
      if (node.id) {
        this.nodeMap.set(node.id, node);
      }
    });

    // 构建四叉树
    const validNodes = nodes.filter(n => 
      n.x !== undefined && n.y !== undefined && 
      !isNaN(n.x) && !isNaN(n.y)
    );

    if (validNodes.length === 0) return;

    // 计算边界
    this.gridBounds = {
      minX: Math.min(...validNodes.map(n => n.x)),
      minY: Math.min(...validNodes.map(n => n.y)),
      maxX: Math.max(...validNodes.map(n => n.x)),
      maxY: Math.max(...validNodes.map(n => n.y))
    };

    // 添加边界缓冲
    const padding = 100;
    this.gridBounds.minX -= padding;
    this.gridBounds.minY -= padding;
    this.gridBounds.maxX += padding;
    this.gridBounds.maxY += padding;

    // 构建四叉树
    this.quadtree = d3.quadtree()
      .x(d => d.x)
      .y(d => d.y)
      .extent([[this.gridBounds.minX, this.gridBounds.minY], [this.gridBounds.maxX, this.gridBounds.maxY]])
      .addAll(validNodes);

    // 构建网格索引
    validNodes.forEach(node => {
      const cellKey = this.getCellKey(node.x, node.y);
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, []);
      }
      this.grid.get(cellKey).push(node.id);
    });
  }

  /**
   * 清空索引
   */
  clear() {
    this.quadtree = null;
    this.grid.clear();
    this.nodeMap.clear();
  }

  /**
   * 获取网格单元格的键
   */
  getCellKey(x, y) {
    const gx = Math.floor(x / this.gridSize);
    const gy = Math.floor(y / this.gridSize);
    return `${gx}_${gy}`;
  }

  /**
   * 查找指定点处的节点
   * @param {number} x - x坐标
   * @param {number} y - y坐标
   * @param {number} threshold - 检测阈值
   * @returns {Object|null} 找到的节点
   */
  findNodeAtPoint(x, y, threshold = 22) {
    if (!this.quadtree) return null;

    let closest = null;
    let closestDist = Infinity;

    // 使用四叉树查找最近的节点
    this.quadtree.visit((node, x1, y1, x2, y2) => {
      // 如果当前最小距离已经大于包围盒距离，跳过
      const p = Math.min(
        Math.sqrt(Math.pow(Math.max(x1 - x, 0), 2) + Math.pow(Math.max(y1 - y, 0), 2)),
        Math.sqrt(Math.pow(Math.max(x - x2, 0), 2) + Math.pow(Math.max(y - y2, 0), 2)),
        Math.sqrt(Math.pow(Math.max(x - x1, 0), 2) + Math.pow(Math.max(y - y2, 0), 2)),
        Math.sqrt(Math.pow(Math.max(x2 - x, 0), 2) + Math.pow(Math.max(y1 - y, 0), 2))
      );

      if (p > closestDist) {
        return true; // 剪枝
      }

      if (!node.length) {
        // 叶子节点
        const nodeData = node.data;
        if (nodeData) {
          const dx = x - nodeData.x;
          const dy = y - nodeData.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // 检查是否在阈值范围内
          const nodeSize = this.estimateNodeSize(nodeData);
          if (dist < Math.max(nodeSize, threshold)) {
            if (dist < closestDist) {
              closestDist = dist;
              closest = nodeData;
            }
          }
        }
      }

      return false;
    });

    return closest;
  }

  /**
   * 估算节点大小
   */
  estimateNodeSize(node) {
    const label = node.label || '';
    const type = node.type || 'default';
    // 简单估算：标签长度 * 6 + padding
    return Math.max(label.length * 6 + 20, 22);
  }

  /**
   * 获取视口内的所有节点
   * @param {Object} viewport - 视口范围 { minX, minY, maxX, maxY }
   * @returns {Array} 节点数组
   */
  getNodesInViewport(viewport) {
    if (!this.quadtree) return [];

    const result = [];
    const { minX, minY, maxX, maxY } = viewport;

    this.quadtree.visit((node, x1, y1, x2, y2) => {
      // 如果节点区域与视口不相交，跳过
      if (x1 > maxX || x2 < minX || y1 > maxY || y2 < minY) {
        return true;
      }

      if (!node.length && node.data) {
        const n = node.data;
        if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
          result.push(n);
        }
      }

      return false;
    });

    return result;
  }

  /**
   * 获取最近的N个节点
   * @param {number} x - x坐标
   * @param {number} y - y坐标
   * @param {number} n - 数量
   * @returns {Array} 节点数组
   */
  findNearest(x, y, n = 10) {
    if (!this.quadtree) return [];

    const candidates = [];

    // 从网格获取候选节点
    const centerKey = this.getCellKey(x, y);
    const [cgx, cgy] = centerKey.split('_').map(Number);

    // 检查周围3x3的网格
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const key = `${cgx + dx}_${cgy + dy}`;
        if (this.grid.has(key)) {
          candidates.push(...this.grid.get(key));
        }
      }
    }

    // 去重并计算距离
    const uniqueIds = [...new Set(candidates)];
    const withDist = uniqueIds.map(id => {
      const node = this.nodeMap.get(id);
      if (!node) return null;
      const dist = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
      return { node, dist };
    }).filter(item => item !== null);

    // 按距离排序并返回前N个
    return withDist
      .sort((a, b) => a.dist - b.dist)
      .slice(0, n)
      .map(item => item.node);
  }

  /**
   * 更新单个节点的位置
   * @param {Object} node - 节点
   */
  updateNode(node) {
    if (!node || !node.id) return;

    const oldKey = this.getCellKey(node.x, node.y);
    
    // 更新节点数据
    this.nodeMap.set(node.id, node);

    // 更新网格
    const newKey = this.getCellKey(node.x, node.y);
    if (oldKey !== newKey) {
      // 从旧格子移除
      if (this.grid.has(oldKey)) {
        const arr = this.grid.get(oldKey);
        const idx = arr.indexOf(node.id);
        if (idx !== -1) arr.splice(idx, 1);
      }
      // 添加到新格子
      if (!this.grid.has(newKey)) {
        this.grid.set(newKey, []);
      }
      this.grid.get(newKey).push(node.id);
    }
  }

  /**
   * 获取节点总数
   */
  get size() {
    return this.nodeMap.size;
  }
}

// ========== 增量渲染器 ==========

/**
 * 增量渲染器 - 控制每帧渲染数量，避免阻塞
 */
export class IncrementalRenderer {
  constructor(renderFn, options = {}) {
    this.renderFn = renderFn;
    this.pendingItems = [];
    this.batchSize = options.batchSize || 500;
    this.frameBudget = options.frameBudget || 16; // 16ms = 60fps
    this.isRunning = false;
    this.startTime = 0;
  }

  /**
   * 添加要渲染的项目
   * @param {*} item - 要渲染的项目
   */
  add(item) {
    this.pendingItems.push(item);
    
    if (!this.isRunning) {
      this.flush();
    }
  }

  /**
   * 批量添加项目
   * @param {Array} items - 项目数组
   */
  addBatch(items) {
    this.pendingItems.push(...items);
    
    if (!this.isRunning) {
      this.flush();
    }
  }

  /**
   * 刷新渲染
   */
  flush() {
    if (this.pendingItems.length === 0) {
      this.isRunning = false;
      return;
    }

    this.isRunning = true;
    this.startTime = performance.now();

    const renderBatch = () => {
      const batch = [];
      
      // 收集一批项目，控制时间预算
      while (this.pendingItems.length > 0 && batch.length < this.batchSize) {
        if (performance.now() - this.startTime > this.frameBudget) {
          // 时间超预算，等待下一帧
          break;
        }
        batch.push(this.pendingItems.shift());
      }

      // 渲染这一批
      if (batch.length > 0) {
        this.renderFn(batch);
      }

      // 如果还有剩余，继续下一帧
      if (this.pendingItems.length > 0) {
        requestAnimationFrame(renderBatch);
      } else {
        this.isRunning = false;
      }
    };

    requestAnimationFrame(renderBatch);
  }

  /**
   * 清空待渲染队列
   */
  clear() {
    this.pendingItems = [];
    this.isRunning = false;
  }

  /**
   * 获取待渲染数量
   */
  get pendingCount() {
    return this.pendingItems.length;
  }
}

// ========== LRU 缓存 ==========

/**
 * LRU 缓存实现
 */
export class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * 获取值
   */
  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key);
    // 移到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }

  /**
   * 设置值
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最老的项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  /**
   * 检查是否存在
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取大小
   */
  get size() {
    return this.cache.size;
  }
}
