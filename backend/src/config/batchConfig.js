// 批次大小限制配置
// 可通过管理员接口动态调整

const DEFAULT_LIMITS = {
  nodes: {
    create: 500,
    update: 500,
    delete: 100
  },
  edges: {
    create: 500,
    update: 500,
    delete: 100
  }
};

// 运行时配置（可动态修改）
let config = {
  nodes: { ...DEFAULT_LIMITS.nodes },
  edges: { ...DEFAULT_LIMITS.edges }
};

/**
 * 获取批次大小限制
 */
export function getBatchLimits() {
  return {
    nodes: { ...config.nodes },
    edges: { ...config.edges }
  };
}

/**
 * 更新批次大小限制
 * @param {Object} newLimits - 新的限制配置
 */
export function updateBatchLimits(newLimits) {
  if (newLimits.nodes) {
    if (typeof newLimits.nodes.create === 'number' && newLimits.nodes.create > 0) {
      config.nodes.create = newLimits.nodes.create;
    }
    if (typeof newLimits.nodes.update === 'number' && newLimits.nodes.update > 0) {
      config.nodes.update = newLimits.nodes.update;
    }
    if (typeof newLimits.nodes.delete === 'number' && newLimits.nodes.delete > 0) {
      config.nodes.delete = newLimits.nodes.delete;
    }
  }

  if (newLimits.edges) {
    if (typeof newLimits.edges.create === 'number' && newLimits.edges.create > 0) {
      config.edges.create = newLimits.edges.create;
    }
    if (typeof newLimits.edges.update === 'number' && newLimits.edges.update > 0) {
      config.edges.update = newLimits.edges.update;
    }
    if (typeof newLimits.edges.delete === 'number' && newLimits.edges.delete > 0) {
      config.edges.delete = newLimits.edges.delete;
    }
  }

  return getBatchLimits();
}

/**
 * 重置为默认配置
 */
export function resetBatchLimits() {
  config = {
    nodes: { ...DEFAULT_LIMITS.nodes },
    edges: { ...DEFAULT_LIMITS.edges }
  };
  return getBatchLimits();
}

export default {
  getBatchLimits,
  updateBatchLimits,
  resetBatchLimits
};
