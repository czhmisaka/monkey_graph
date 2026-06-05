# JavaScript SDK 示例

## 安装

```bash
npm install axios
```

## 基本使用

```javascript
import axios from 'axios';

const BASE_URL = 'http://localhost:13001';

class MonkeyGraphAgent {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Agent ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // ========== Agent 管理 ==========
  
  // 获取当前 Agent 信息
  async getMe() {
    const response = await this.client.get('/api/agent/me');
    return response.data;
  }

  // 获取配额信息
  async getQuota() {
    const response = await this.client.get('/api/agent/quota');
    return response.data;
  }

  // 轮换 API Key
  async rotateKey() {
    const response = await this.client.post('/api/agent/rotate-key');
    return response.data;
  }

  // ========== 图谱操作 ==========

  // 获取图谱列表
  async getGraphs() {
    const response = await this.client.get('/api/agent/graphs');
    return response.data;
  }

  // 创建图谱
  async createGraph(name, description = '') {
    const response = await this.client.post('/api/agent/graphs', { name, description });
    return response.data;
  }

  // 获取图谱详情
  async getGraph(graphId) {
    const response = await this.client.get(`/api/agent/graphs/${graphId}`);
    return response.data;
  }

  // 删除图谱
  async deleteGraph(graphId) {
    const response = await this.client.delete(`/api/agent/graphs/${graphId}`);
    return response.data;
  }

  // ========== 节点操作 ==========

  // 批量创建节点
  async createNodes(graphId, nodes, autoEmbedding = true) {
    const response = await this.client.post(`/api/agent/graphs/${graphId}/batch/nodes`, {
      nodes,
      auto_embedding: autoEmbedding
    });
    return response.data;
  }

  // 批量更新节点
  async updateNodes(graphId, nodes) {
    const response = await this.client.put(`/api/agent/graphs/${graphId}/batch/nodes`, { nodes });
    return response.data;
  }

  // 批量删除节点
  async deleteNodes(graphId, nodeIds) {
    const response = await this.client.delete(`/api/agent/graphs/${graphId}/batch/nodes`, {
      data: { node_ids: nodeIds }
    });
    return response.data;
  }

  // ========== 边操作 ==========

  // 批量创建边
  async createEdges(graphId, edges) {
    const response = await this.client.post(`/api/agent/graphs/${graphId}/batch/edges`, { edges });
    return response.data;
  }

  // ========== 图算法 ==========

  // 获取度统计
  async getDegrees(graphId) {
    const response = await this.client.get(`/api/agent/graphs/${graphId}/degrees`);
    return response.data;
  }

  // 获取邻居
  async getNeighbors(graphId, nodeId, options = {}) {
    const response = await this.client.get(`/api/agent/graphs/${graphId}/nodes/${nodeId}/neighbors`, {
      params: options
    });
    return response.data;
  }

  // 路径查找
  async findPath(graphId, source, target, maxDepth = 10) {
    const response = await this.client.get(`/api/agent/graphs/${graphId}/path`, {
      params: { source, target, max_depth: maxDepth }
    });
    return response.data;
  }

  // ========== 版本管理 ==========

  // 创建快照
  async createSnapshot(graphId, name, description = '') {
    const response = await this.client.post(`/api/agent/graphs/${graphId}/snapshot`, {
      name,
      description
    });
    return response.data;
  }

  // 获取版本列表
  async getVersions(graphId) {
    const response = await this.client.get(`/api/agent/graphs/${graphId}/versions`);
    return response.data;
  }

  // 回滚版本
  async rollback(graphId, version) {
    const response = await this.client.post(`/api/agent/graphs/${graphId}/rollback`, { version });
    return response.data;
  }

  // ========== Workspace ==========

  // 创建 Workspace
  async createWorkspace(name, description = '') {
    const response = await this.client.post('/api/agent/workspaces', { name, description });
    return response.data;
  }

  // 获取 Workspace 列表
  async getWorkspaces() {
    const response = await this.client.get('/api/agent/workspaces');
    return response.data;
  }
}

// ========== 完整示例 ==========

async function main() {
  // 1. 注册 Agent（只需要执行一次）
  const registerResponse = await axios.post(`${BASE_URL}/api/agent/register`, {
    name: 'my-knowledge-agent',
    description: '用于构建知识图谱的 AI Agent'
  });
  const { agent } = registerResponse.data;
  console.log('Agent 注册成功:', agent.id);
  console.log('API Key:', agent.api_key);

  // 保存好 API Key
  const apiKey = agent.api_key;

  // 2. 初始化 SDK
  const client = new MonkeyGraphAgent(apiKey);

  // 3. 创建图谱
  const graph = await client.createGraph('电影知识图谱', '包含电影、演员、导演等信息');
  console.log('图谱创建成功:', graph.graph.id);

  // 4. 批量创建节点
  const nodes = await client.createNodes(graph.graph.id, [
    { label: '流浪地球', type: 'movie', properties: { year: 2019, rating: 8.5 } },
    { label: '吴京', type: 'person', properties: { role: 'actor' } },
    { label: '郭帆', type: 'person', properties: { role: 'director' } },
    { label: '科幻电影', type: 'concept' }
  ]);
  console.log(`创建了 ${nodes.count} 个节点`);

  // 5. 批量创建边
  const edges = await client.createEdges(graph.graph.id, [
    { source: nodes.nodes[0].id, target: nodes.nodes[1].id, label: '主演' },
    { source: nodes.nodes[0].id, target: nodes.nodes[2].id, label: '导演' },
    { source: nodes.nodes[0].id, target: nodes.nodes[3].id, label: '类型' }
  ]);
  console.log(`创建了 ${edges.count} 条边`);

  // 6. 查询度统计
  const degrees = await client.getDegrees(graph.graph.id);
  console.log('节点度统计:', degrees.degrees);

  // 7. 创建快照
  const snapshot = await client.createSnapshot(graph.graph.id, '初始版本', '包含基本信息');
  console.log('快照创建成功:', snapshot.snapshot.version);

  // 8. 获取配额
  const quota = await client.getQuota();
  console.log('配额信息:', quota.quota);
}

main().catch(console.error);
```

## 导出 PNG

```javascript
// 导出图谱为 PNG
async function exportGraph(client, graphId) {
  const response = await axios.get(
    `${BASE_URL}/api/agent/graphs/${graphId}/export`,
    {
      headers: { 'Authorization': `Agent ${client.apiKey}` },
      responseType: 'blob'
    }
  );
  
  // 保存图片
  const fs = await import('fs');
  fs.writeFileSync('graph.png', response.data);
  console.log('图片已保存为 graph.png');
}