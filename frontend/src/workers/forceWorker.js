/**
 * 力导向图 Web Worker
 * 用于在后台线程中执行力导向计算，避免阻塞主线程
 * 
 * 使用方式:
 * const worker = new Worker(new URL('./forceWorker.js', import.meta.url))
 * worker.postMessage({ type: 'init', nodes, edges, width, height })
 * worker.onmessage = (e) => { if (e.data.type === 'tick') updateNodes(e.data.nodes) }
 */

let simulation = null;
let nodes = [];
let links = [];
let width = 800;
let height = 600;
let isRunning = false;
let tickCount = 0;
let lastTickTime = 0;

// 简化的力导向算法实现
class SimpleSimulation {
  constructor() {
    this.alpha = 1;
    this.alphaMin = 0.001;
    this.alphaDecay = 0.02;
    this.alphaTarget = 0;
    this.velocityDecay = 0.4;
    this.forces = {};
  }

  set forces(value) {
    this._forces = value;
  }

  get forces() {
    return this._forces;
  }

  alphaTarget(value) {
    this.alphaTarget = value;
    return this;
  }

  stop() {
    this.alpha = 0;
    isRunning = false;
  }

  restart() {
    this.alpha = 0.3;
    isRunning = true;
  }

  tick() {
    if (this.alpha < this.alphaMin) {
      this.alpha = 0;
      isRunning = false;
      return;
    }

    // 应用力
    this._applyForces();

    // 更新位置
    nodes.forEach(node => {
      if (node.fx !== undefined && node.fx !== null) {
        node.x = node.fx;
        node.vx = 0;
      } else {
        node.x += node.vx;
        node.vx *= this.velocityDecay;
      }

      if (node.fy !== undefined && node.fy !== null) {
        node.y = node.fy;
        node.vy = 0;
      } else {
        node.y += node.vy;
        node.vy *= this.velocityDecay;
      }

      // 边界约束
      node.x = Math.max(0, Math.min(width, node.x));
      node.y = Math.max(0, Math.min(height, node.y));
    });

    // 衰减 alpha
    this.alpha += (this.alphaTarget - this.alpha) * 0.1;
    this.alpha *= (1 - this.alphaDecay);
    
    tickCount++;
  }

  _applyForces() {
    // 计算节点之间的力
    const alpha = this.alpha;

    // 中心力
    const centerForce = this.forces.center;
    if (centerForce) {
      const cx = width / 2;
      const cy = height / 2;
      const strength = centerForce.strength || 0.1;

      nodes.forEach(node => {
        if (node.fx !== undefined && node.fx !== null) return;
        node.vx += (cx - node.x) * alpha * strength;
        node.vy += (cy - node.y) * alpha * strength;
      });
    }

    // 连接力
    const linkForce = this.forces.link;
    if (linkForce) {
      const distance = linkForce.distance || 70;

      links.forEach(link => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        const target = typeof link.target === 'object' ? link.target : nodes.find(n => n.id === link.target);

        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = (dist - distance) / dist;
        const k = diff * alpha * 0.3;

        if (source.fx === undefined || source.fx === null) {
          source.vx += dx * k;
          source.vy += dy * k;
        }
        if (target.fx === undefined || target.fx === null) {
          target.vx -= dx * k;
          target.vy -= dy * k;
        }
      });
    }

    // 排斥力
    const chargeForce = this.forces.charge;
    if (chargeForce) {
      const strength = chargeForce.strength || -50;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];

          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          // 超过一定距离不计算
          if (dist > 500) continue;

          const k = strength * alpha / (dist * dist);

          if (nodeA.fx === undefined || nodeA.fx === null) {
            nodeA.vx -= dx * k;
            nodeA.vy -= dy * k;
          }
          if (nodeB.fx === undefined || nodeB.fx === null) {
            nodeB.vx += dx * k;
            nodeB.vy += dy * k;
          }
        }
      }
    }

    // 碰撞力
    const collisionForce = this.forces.collision;
    if (collisionForce) {
      const radius = collisionForce.radius || 10;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];

          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = radius * 2;

          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const kx = (dx / dist) * overlap * alpha * 0.5;
            const ky = (dy / dist) * overlap * alpha * 0.5;

            if (nodeA.fx === undefined || nodeA.fx === null) {
              nodeA.vx -= kx;
            }
            if (nodeA.fy === undefined || nodeA.fy === null) {
              nodeA.vy -= ky;
            }
            if (nodeB.fx === undefined || nodeB.fx === null) {
              nodeB.vx += kx;
            }
            if (nodeB.fy === undefined || nodeB.fy === null) {
              nodeB.vy += ky;
            }
          }
        }
      }
    }
  }
}

// 初始化力导向模拟
function initSimulation(options) {
  simulation = new SimpleSimulation();
  simulation.forces = {
    center: { strength: options.centerStrength || 0.1 },
    link: { distance: options.linkDistance || 70, links: [] },
    charge: { strength: options.chargeStrength || -50 },
    collision: { radius: options.collisionRadius || 10 }
  };

  nodes = options.nodes || [];
  links = (options.edges || []).map(e => ({
    ...e,
    source: typeof e.source === 'object' ? e.source.id : e.source,
    target: typeof e.target === 'object' ? e.target.id : e.target
  }));

  width = options.width || 800;
  height = options.height || 600;

  simulation.forces.link.links = links;

  isRunning = true;
  tickCount = 0;

  console.log('[ForceWorker] 初始化完成:', nodes.length, '节点', links.length, '边');
}

// 运行一次 tick
function runTick() {
  if (!simulation || !isRunning) return;

  simulation.tick();

  // 发送更新
  self.postMessage({
    type: 'tick',
    nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
    alpha: simulation.alpha,
    tickCount: tickCount
  });
}

// 消息处理
self.onmessage = function(e) {
  const { type, ...data } = e.data;

  switch (type) {
    case 'init':
      initSimulation(data);
      // 开始运行
      runSimulation();
      break;

    case 'updateNodes':
      nodes = data.nodes.map(n => {
        const existing = nodes.find(ex => ex.id === n.id);
        return existing ? { ...existing, ...n } : n;
      });
      break;

    case 'updateLinks':
      links = data.links.map(e => ({
        ...e,
        source: typeof e.source === 'object' ? e.source.id : e.source,
        target: typeof e.target === 'object' ? e.target.id : e.target
      }));
      simulation.forces.link.links = links;
      break;

    case 'pin':
      const node = nodes.find(n => n.id === data.nodeId);
      if (node) {
        node.fx = data.x;
        node.fy = data.y;
      }
      break;

    case 'unpin':
      const unpinNode = nodes.find(n => n.id === data.nodeId);
      if (unpinNode) {
        unpinNode.fx = null;
        unpinNode.fy = null;
      }
      break;

    case 'pinAll':
      nodes.forEach(node => {
        node.fx = node.x;
        node.fy = node.y;
      });
      isRunning = false;
      self.postMessage({ type: 'stopped', reason: 'pinned' });
      break;

    case 'unpinAll':
      nodes.forEach(node => {
        node.fx = null;
        node.fy = null;
      });
      simulation.restart();
      break;

    case 'resume':
      simulation.restart();
      runSimulation();
      break;

    case 'stop':
      isRunning = false;
      if (simulation) simulation.stop();
      self.postMessage({ type: 'stopped', reason: 'manual' });
      break;

    case 'resize':
      width = data.width;
      height = data.height;
      break;

    case 'tick':
      // 手动触发一次 tick
      if (simulation) {
        simulation.tick();
        self.postMessage({
          type: 'tick',
          nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
          alpha: simulation.alpha
        });
      }
      break;

    case 'getPositions':
      self.postMessage({
        type: 'positions',
        nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y }))
      });
      break;
  }
};

// 运行模拟循环
function runSimulation() {
  if (!isRunning) return;

  const startTime = performance.now();

  // 运行多个 tick 直到达到时间预算
  while (isRunning && performance.now() - startTime < 16) { // 16ms = 60fps
    if (simulation.alpha < simulation.alphaMin) {
      isRunning = false;
      self.postMessage({ type: 'completed', tickCount: tickCount });
      return;
    }
    simulation.tick();
  }

  // 发送当前位置
  self.postMessage({
    type: 'tick',
    nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
    alpha: simulation.alpha,
    tickCount: tickCount
  });

  // 继续下一帧
  if (isRunning) {
    setTimeout(runSimulation, 0);
  }
}

console.log('[ForceWorker] 已加载');
