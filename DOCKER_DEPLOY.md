# 🐒 MonkeyGraph Docker 部署指南

> 适用于小型生产环境的 Docker 容器化部署方案

## 📋 目录

- [快速开始](#快速开始)
- [架构说明](#架构说明)
- [环境要求](#环境要求)
- [部署步骤](#部署步骤)
- [配置说明](#配置说明)
- [运维管理](#运维管理)
- [数据备份](#数据备份)
- [故障排查](#故障排查)

---

## 🚀 快速开始

### 1. 准备环境变量

```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑配置文件，填写 MiniMax API Key
vim backend/.env
```

### 2. 一键部署

```bash
# 添加执行权限
chmod +x deploy-docker.sh

# 启动服务
./deploy-docker.sh start
```

### 3. 访问服务

- **本地访问**: http://localhost:13001
- **外部访问**: http://服务器IP:13001

---

## 🏗 架构说明

```
┌─────────────────────────────────────────────┐
│              Docker Container                 │
│                                             │
│   ┌───────────────────────────────────┐   │
│   │         Node.js App                │   │
│   │                                    │   │
│   │   ┌─────────┐  ┌─────────┐       │   │
│   │   │ Backend │  │ Frontend│       │   │
│   │   │ (API)  │  │ (Static)│       │   │
│   │   │ :13001 │  │  Serve  │       │   │
│   │   └─────────┘  └─────────┘       │   │
│   │                                    │   │
│   └───────────────────────────────────┘   │
│                                             │
│   📁 Volume Mounts                         │
│   ├── /app/data → SQLite Database         │
│   └── /app/logs → Application Logs       │
└─────────────────────────────────────────────┘
```

### 技术栈

- **容器运行时**: Docker Engine 20.10+
- **编排工具**: Docker Compose v2+
- **基础镜像**: Node.js 18 Alpine
- **数据库**: SQLite 3 (本地持久化)
- **前端**: Vue 3 + Vite (构建后静态托管)

---

## 📦 环境要求

### 硬件要求

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 1 核 | 2 核 |
| 内存 | 512MB | 1GB+ |
| 磁盘 | 5GB | 20GB+ |
| 网络 | 1Mbps | 10Mbps+ |

### 软件要求

- **Docker**: 20.10.0 或更高版本
- **Docker Compose**: v2.0.0 或更高版本
- **操作系统**: Linux (Ubuntu 20.04+, CentOS 8+, Debian 11+)

### 检查 Docker 安装

```bash
# 检查 Docker 版本
docker --version

# 检查 Docker Compose 版本
docker-compose --version

# 验证 Docker 服务
docker info
```

---

## 📝 部署步骤

### 步骤 1: 克隆项目

```bash
git clone https://github.com/czhmisaka/monkey_graph.git
cd monkey_graph
```

### 步骤 2: 配置环境变量

```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑配置文件
vim backend/.env
```

**必需配置项**:

```env
# MiniMax API 配置（必需）
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
LLM_CLOUD_API_KEY=your_api_key_here

# 服务配置
PORT=13001
HOST=0.0.0.0
NODE_ENV=production
```

### 步骤 3: 构建和启动

```bash
# 方式一：使用部署脚本（推荐）
chmod +x deploy-docker.sh
./deploy-docker.sh start

# 方式二：手动部署
docker-compose build
docker-compose up -d
```

### 步骤 4: 验证部署

```bash
# 检查容器状态
docker ps

# 检查健康状态
curl http://localhost:13001/health

# 查看日志
docker logs -f monkeygraph-app
```

---

## ⚙ 配置说明

### 环境变量配置

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `LLM_CLOUD_API_KEY` | ✅ | - | MiniMax API Key |
| `LLM_CLOUD_BASE_URL` | ❌ | https://api.minimaxi.com/v1 | API 基础地址 |
| `LLM_CLOUD_MODEL_NAME` | ❌ | MiniMax-M2.5 | 模型名称 |
| `PORT` | ❌ | 13001 | 服务端口 |
| `HOST` | ❌ | 0.0.0.0 | 监听地址 |
| `NODE_ENV` | ❌ | production | 运行环境 |

### 端口配置

默认使用端口 **13001**，如需修改：

1. 修改 `backend/.env` 中的 `PORT`
2. 修改 `docker-compose.yml` 中的端口映射
3. 重新部署

```yaml
ports:
  - "新端口:13001"
```

### 数据持久化

SQLite 数据库文件存储在 `backend/data/` 目录：

```
backend/data/
└── knowledge-graph.db    # SQLite 数据库文件
```

**重要**: 该目录通过 Docker Volume 持久化，删除容器不会丢失数据。

---

## 🔧 运维管理

### 常用命令

```bash
# 启动服务
./deploy-docker.sh start

# 停止服务
./deploy-docker.sh stop

# 重启服务
./deploy-docker.sh restart

# 查看状态
./deploy-docker.sh status

# 查看日志
./deploy-docker.sh logs

# 重新构建
./deploy-docker.sh rebuild
```

### Docker Compose 命令

```bash
# 后台启动
docker-compose up -d

# 查看容器
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重新构建
docker-compose build --no-cache
docker-compose up -d
```

### 容器管理

```bash
# 进入容器
docker exec -it monkeygraph-app sh

# 查看进程
docker exec monkeygraph-app ps

# 执行命令
docker exec monkeygraph-app node -v
```

---

## 💾 数据备份

### 备份数据库

```bash
# 备份数据库文件
cp backend/data/knowledge-graph.db backend/data/knowledge-graph.db.backup.$(date +%Y%m%d)

# 或使用 docker cp
docker cp monkeygraph-app:/app/data/knowledge-graph.db ./backup/
```

### 恢复数据库

```bash
# 停止服务
docker-compose down

# 恢复数据库
cp backup/knowledge-graph.db backend/data/

# 启动服务
docker-compose up -d
```

### 自动备份脚本

创建 `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
docker cp monkeygraph-app:/app/data/knowledge-graph.db $BACKUP_DIR/knowledge-graph.db.$DATE

# 保留最近 7 天的备份
find $BACKUP_DIR -name "knowledge-graph.db.*" -mtime +7 -delete

echo "备份完成: $BACKUP_DIR/knowledge-graph.db.$DATE"
```

---

## 🐛 故障排查

### 常见问题

#### 1. 容器启动失败

```bash
# 查看详细错误
docker logs monkeygraph-app

# 检查端口占用
netstat -tlnp | grep 13001
```

#### 2. 健康检查失败

```bash
# 检查容器网络
docker exec monkeygraph-app wget -qO- http://localhost:13001/health

# 检查 Node.js 进程
docker exec monkeygraph-app ps aux
```

#### 3. 数据库连接错误

```bash
# 检查数据库文件权限
ls -la backend/data/

# 修复权限
chmod 755 backend/data/
chmod 644 backend/data/knowledge-graph.db
```

#### 4. 前端资源加载失败

```bash
# 检查前端构建目录
docker exec monkeygraph-app ls -la /app/frontend/dist/

# 重新构建镜像
docker-compose build --no-cache
docker-compose up -d
```

### 日志分析

```bash
# 查看应用日志
docker logs --tail 100 monkeygraph-app

# 实时跟踪日志
docker logs -f monkeygraph-app

# 搜索错误关键字
docker logs monkeygraph-app | grep -i error
```

---

## 🔐 安全建议

### 生产环境加固

1. **配置防火墙**
   ```bash
   # 仅允许特定 IP 访问
   ufw allow from 192.168.1.0/24 to any port 13001
   ```

2. **使用 HTTPS**
   
   使用 Nginx/Caddy 反向代理并配置 SSL 证书

3. **定期更新**
   ```bash
   # 定期拉取最新代码
   git pull origin main
   
   # 重新构建部署
   ./deploy-docker.sh rebuild
   ```

4. **监控告警**
   
   配置 Docker Healthcheck + 外部监控服务

---

## 📚 相关资源

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [MonkeyGraph GitHub](https://github.com/czhmisaka/monkey_graph)

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](../LICENSE) 文件

---

**🐒 Made with ❤️ by MonkeyGraph Team**
