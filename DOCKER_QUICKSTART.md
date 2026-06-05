# 🐒 MonkeyGraph Docker 快速开始指南

## ⚡ 5分钟快速部署

### 1. 配置环境变量（1分钟）

```bash
# 复制配置模板
cp backend/.env.example backend/.env

# 编辑配置文件，填写 API Key
vim backend/.env
```

**必须修改的配置：**
```env
LLM_CLOUD_API_KEY=你的MiniMax_API_Key
```

### 2. 一键部署（3分钟）

```bash
# 添加执行权限
chmod +x deploy-docker.sh

# 启动服务
./deploy-docker.sh start
```

部署脚本会自动：
- ✅ 检查 Docker 环境
- ✅ 验证配置文件
- ✅ 构建 Docker 镜像
- ✅ 启动容器
- ✅ 执行健康检查

### 3. 访问服务（1分钟）

- **本地访问**: http://localhost:13001
- **默认账号**: `admin` / `admin123`

## 📋 常用命令

```bash
# 启动服务
./deploy-docker.sh start

# 停止服务
./deploy-docker.sh stop

# 重启服务
./deploy-docker.sh restart

# 查看日志
./deploy-docker.sh logs

# 查看状态
./deploy-docker.sh status

# 重新构建
./deploy-docker.sh rebuild

# 查看帮助
./deploy-docker.sh help
```

## 🔧 手动部署（可选）

如果你不使用部署脚本：

```bash
# 1. 构建镜像
docker-compose build

# 2. 启动容器
docker-compose up -d

# 3. 查看日志
docker logs -f monkeygraph-app

# 4. 停止服务
docker-compose down
```

## 🌐 访问地址

部署成功后，访问以下地址：

| 环境 | 地址 | 说明 |
|------|------|------|
| 本地 | http://localhost:13001 | 本机访问 |
| 局域网 | http://192.168.x.x:13001 | 局域网其他设备访问 |
| 公网 | http://你的服务器IP:13001 | 需要配置防火墙 |

## 📊 健康检查

```bash
# 检查容器状态
docker ps | grep monkeygraph-app

# 检查健康端点
curl http://localhost:13001/health

# 查看资源使用
docker stats monkeygraph-app
```

## 💾 数据持久化

所有数据都存储在宿主机的以下目录：

```
backend/data/
├── knowledge-graph.db    # SQLite 数据库
└── uploads/             # 上传的文件

backend/logs/
└── app.log             # 应用日志
```

**重要**：删除容器不会丢失数据！

## 🐛 故障排查

### 容器启动失败

```bash
# 查看详细错误
docker logs monkeygraph-app

# 检查端口占用
lsof -i :13001
```

### 健康检查失败

```bash
# 检查容器网络
docker exec monkeygraph-app wget -qO- http://localhost:13001/health

# 检查 Node.js 进程
docker exec monkeygraph-app ps aux
```

### 数据库连接错误

```bash
# 检查数据目录权限
ls -la backend/data/

# 修复权限
chmod 755 backend/data/
chmod 644 backend/data/knowledge-graph.db
```

## 🔐 安全建议

### 1. 修改默认密码

首次登录后，立即修改 `admin` 账户密码！

### 2. 配置防火墙

```bash
# 只允许特定 IP 访问
sudo ufw allow from 192.168.1.0/24 to any port 13001

# 或只允许必要端口
sudo ufw allow 13001/tcp
```

### 3. 使用 HTTPS（生产环境）

推荐使用 Nginx/Caddy 作为反向代理，配置 SSL 证书。

## 📚 详细文档

- [完整部署文档](./DOCKER_DEPLOY.md) - 包含架构说明、配置详解、运维管理、故障排查
- [项目主文档](./README.md) - MonkeyGraph 功能介绍

## 🆘 获取帮助

- 查看详细日志：`./deploy-docker.sh logs`
- 查看健康状态：`curl http://localhost:13001/health`
- 访问文档：[DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)

---

**🐒 祝你部署顺利！有问题请提 Issue**

*Last updated: 2026-03-22*
