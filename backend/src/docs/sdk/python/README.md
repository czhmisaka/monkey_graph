# Python SDK 示例

## 安装

```bash
pip install requests
```

## 基本使用

```python
import requests
from typing import Optional, List, Dict, Any

BASE_URL = "http://localhost:13001"


class MonkeyGraphAgent:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Agent {api_key}",
            "Content-Type": "application/json"
        })

    # ========== Agent 管理 ==========

    def get_me(self) -> Dict[str, Any]:
        """获取当前 Agent 信息"""
        response = self.session.get(f"{BASE_URL}/api/agent/me")
        response.raise_for_status()
        return response.json()

    def get_quota(self) -> Dict[str, Any]:
        """获取配额信息"""
        response = self.session.get(f"{BASE_URL}/api/agent/quota")
        response.raise_for_status()
        return response.json()

    def rotate_key(self) -> Dict[str, Any]:
        """轮换 API Key"""
        response = self.session.post(f"{BASE_URL}/api/agent/rotate-key")
        response.raise_for_status()
        return response.json()

    # ========== 图谱操作 ==========

    def get_graphs(self) -> Dict[str, Any]:
        """获取图谱列表"""
        response = self.session.get(f"{BASE_URL}/api/agent/graphs")
        response.raise_for_status()
        return response.json()

    def create_graph(self, name: str, description: str = "") -> Dict[str, Any]:
        """创建图谱"""
        response = self.session.post(
            f"{BASE_URL}/api/agent/graphs",
            json={"name": name, "description": description}
        )
        response.raise_for_status()
        return response.json()

    def get_graph(self, graph_id: str) -> Dict[str, Any]:
        """获取图谱详情"""
        response = self.session.get(f"{BASE_URL}/api/agent/graphs/{graph_id}")
        response.raise_for_status()
        return response.json()

    def delete_graph(self, graph_id: str) -> Dict[str, Any]:
        """删除图谱"""
        response = self.session.delete(f"{BASE_URL}/api/agent/graphs/{graph_id}")
        response.raise_for_status()
        return response.json()

    # ========== 节点操作 ==========

    def create_nodes(
        self,
        graph_id: str,
        nodes: List[Dict[str, Any]],
        auto_embedding: bool = True
    ) -> Dict[str, Any]:
        """批量创建节点"""
        response = self.session.post(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/batch/nodes",
            json={"nodes": nodes, "auto_embedding": auto_embedding}
        )
        response.raise_for_status()
        return response.json()

    def update_nodes(self, graph_id: str, nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """批量更新节点"""
        response = self.session.put(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/batch/nodes",
            json={"nodes": nodes}
        )
        response.raise_for_status()
        return response.json()

    def delete_nodes(self, graph_id: str, node_ids: List[str]) -> Dict[str, Any]:
        """批量删除节点"""
        response = self.session.delete(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/batch/nodes",
            json={"node_ids": node_ids}
        )
        response.raise_for_status()
        return response.json()

    # ========== 边操作 ==========

    def create_edges(self, graph_id: str, edges: List[Dict[str, Any]]) -> Dict[str, Any]:
        """批量创建边"""
        response = self.session.post(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/batch/edges",
            json={"edges": edges}
        )
        response.raise_for_status()
        return response.json()

    # ========== 图算法 ==========

    def get_degrees(self, graph_id: str) -> Dict[str, Any]:
        """获取度统计"""
        response = self.session.get(f"{BASE_URL}/api/agent/graphs/{graph_id}/degrees")
        response.raise_for_status()
        return response.json()

    def get_neighbors(
        self,
        graph_id: str,
        node_id: str,
        neighbor_type: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """获取邻居"""
        params = {"limit": limit}
        if neighbor_type:
            params["type"] = neighbor_type
        response = self.session.get(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/nodes/{node_id}/neighbors",
            params=params
        )
        response.raise_for_status()
        return response.json()

    def find_path(
        self,
        graph_id: str,
        source: str,
        target: str,
        max_depth: int = 10
    ) -> Dict[str, Any]:
        """路径查找"""
        response = self.session.get(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/path",
            params={"source": source, "target": target, "max_depth": max_depth}
        )
        response.raise_for_status()
        return response.json()

    # ========== 版本管理 ==========

    def create_snapshot(
        self,
        graph_id: str,
        name: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """创建快照"""
        response = self.session.post(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/snapshot",
            json={"name": name, "description": description}
        )
        response.raise_for_status()
        return response.json()

    def get_versions(self, graph_id: str) -> Dict[str, Any]:
        """获取版本列表"""
        response = self.session.get(f"{BASE_URL}/api/agent/graphs/{graph_id}/versions")
        response.raise_for_status()
        return response.json()

    def rollback(self, graph_id: str, version: int) -> Dict[str, Any]:
        """回滚版本"""
        response = self.session.post(
            f"{BASE_URL}/api/agent/graphs/{graph_id}/rollback",
            json={"version": version}
        )
        response.raise_for_status()
        return response.json()

    # ========== Workspace ==========

    def create_workspace(self, name: str, description: str = "") -> Dict[str, Any]:
        """创建 Workspace"""
        response = self.session.post(
            f"{BASE_URL}/api/agent/workspaces",
            json={"name": name, "description": description}
        )
        response.raise_for_status()
        return response.json()

    def get_workspaces(self) -> Dict[str, Any]:
        """获取 Workspace 列表"""
        response = self.session.get(f"{BASE_URL}/api/agent/workspaces")
        response.raise_for_status()
        return response.json()


# ========== 完整示例 ==========

def main():
    # 1. 注册 Agent（只需要执行一次）
    register_response = requests.post(
        f"{BASE_URL}/api/agent/register",
        json={
            "name": "my-knowledge-agent",
            "description": "用于构建知识图谱的 AI Agent"
        }
    )
    agent_data = register_response.json()["agent"]
    print(f"Agent 注册成功: {agent_data['id']}")
    print(f"API Key: {agent_data['api_key']}")
    
    api_key = agent_data["api_key"]
    
    # 2. 初始化 SDK
    client = MonkeyGraphAgent(api_key)
    
    # 3. 创建图谱
    graph = client.create_graph("电影知识图谱", "包含电影、演员、导演等信息")
    graph_id = graph["graph"]["id"]
    print(f"图谱创建成功: {graph_id}")
    
    # 4. 批量创建节点
    nodes = client.create_nodes(graph_id, [
        {"label": "流浪地球", "type": "movie", "properties": {"year": 2019, "rating": 8.5}},
        {"label": "吴京", "type": "person", "properties": {"role": "actor"}},
        {"label": "郭帆", "type": "person", "properties": {"role": "director"}},
        {"label": "科幻电影", "type": "concept"}
    ])
    print(f"创建了 {nodes['count']} 个节点")
    
    # 5. 批量创建边
    edges = client.create_edges(graph_id, [
        {"source": nodes["nodes"][0]["id"], "target": nodes["nodes"][1]["id"], "label": "主演"},
        {"source": nodes["nodes"][0]["id"], "target": nodes["nodes"][2]["id"], "label": "导演"},
        {"source": nodes["nodes"][0]["id"], "target": nodes["nodes"][3]["id"], "label": "类型"}
    ])
    print(f"创建了 {edges['count']} 条边")
    
    # 6. 查询度统计
    degrees = client.get_degrees(graph_id)
    print(f"节点度统计: {degrees['degrees']}")
    
    # 7. 创建快照
    snapshot = client.create_snapshot(graph_id, "初始版本", "包含基本信息")
    print(f"快照创建成功: 版本 {snapshot['snapshot']['version']}")
    
    # 8. 获取配额
    quota = client.get_quota()
    print(f"配额信息: {quota['quota']}")


if __name__ == "__main__":
    main()
```

## 导出 PNG

```python
import os

def export_graph(client, graph_id, output_path="graph.png"):
    """导出图谱为 PNG"""
    response = client.session.get(
        f"{BASE_URL}/api/agent/graphs/{graph_id}/export",
    )
    response.raise_for_status()
    
    with open(output_path, "wb") as f:
        f.write(response.content)
    print(f"图片已保存为 {output_path}")