# 🐒 MonkeyGraph 发布包构建说明

## 📋 快速开始

### 构建完整发布包

```bash
# 进入项目目录
cd /Users/chenzhihan/Desktop/test/czh_graph

# 执行打包脚本
./build-release.sh
```

脚本将自动完成：
1. ✅ 环境检查（Node.js、Docker）
2. ✅ 清理旧构建文件
3. ✅ 构建前端（npm run build）
4. ✅ 构建 Docker 镜像
5. ✅ 导出镜像为 tar 文件
6. ✅ 复制测试数据库（298MB）
7. ✅ 准备部署文件
8. ✅ 打包为 zip 文件

## 📦 输出内容

### 发布包结构

```
release-package/
├── monkeygraph-image.tar     # Docker 镜像 (~420MB)
├── knowledge-graph.db        # 测试数据库 (298MB)
├── Dockerfile                # Docker 构建文件
├── docker-compose.yml        # Docker Compose 配置
├── .env                      # 环境变量
├── deploy-docker.sh          # 部署脚本
├── data/                     # 数据目录
│   ├── uploads/             # 上传文件
│   └── *.db                 # SQLite 数据库
├── logs/                     # 日志目录
└── DEPLOY.md                 # 部署手册
```

### 生成的文件

- `monkeygraph-release.zip` - 完整发布包
- `release-package/` - 发布包目录（可直接使用）

## 🚀 部署到服务器

### 1. 上传 zip 包

```bash
scp monkeygraph-release.zip user@your-server:/home/user/
```

### 2. SSH 到服务器并解压

```bash
ssh user@your-server
cd /home/user
unzip monkeygraph-release.zip
cd release-package
```

### 3. 启动服务

```bash
# 加载 Docker 镜像
docker load -i monkeygraph-image.tar

# 启动服务
chmod +x deploy-docker.sh
./deploy-docker.sh start

# 验证
curl http://localhost:9102/health
```

### 4. 访问应用

- **本地**: http://localhost:9102
- **外部**: http://服务器IP:9102
- **默认账号**: admin / admin123

## 📊 发布包大小估算

| 组件 | 大小 |
|------|------|
| Docker 镜像 | ~420 MB |
| 测试数据库 | ~298 MB |
| 配置文件 | ~10 KB |
| **总计** | **~718 MB** |

## 🔧 管理命令

```bash
# 在服务器上
./deploy-docker.sh start    # 启动
./deploy-docker.sh stop     # 停止
./deploy-docker.sh restart  # 重启
./deploy-docker.sh logs     # 查看日志
./deploy-docker.sh status   # 查看状态
```

## ⚠️ 注意事项

1. **测试数据库**: 已包含完整的测试数据，开箱即用
2. **API Key**: `.env` 文件中已配置 MiniMax API Key
3. **Embedding 服务**: 需要能访问 `http://20.6.2.59:23331`
4. **磁盘空间**: 确保服务器有至少 5GB 可用空间
5. **端口**: 默认使用 9102，确保防火墙开放

## 🔄 重新构建

如果需要更新发布包：

```bash
./build-release.sh
```

会自动清理旧文件并重新构建。

## 📝 故障排查

### 镜像加载失败

```bash
# 检查镜像文件完整性
ls -lh monkeygraph-image.tar

# 重新加载
docker load -i monkeygraph-image.tar
```

### 容器启动失败

```bash
# 查看详细日志
docker logs monkeygraph-app

# 检查端口占用
netstat -tlnp | grep 9102
```

### 数据库连接错误

```bash
# 检查文件权限
ls -la data/
chmod -R 777 data/
chmod 666 data/*.db
```

---

**构建时间**: $(date '+%Y-%m-%d %H:%M:%S')
**MonkeyGraph** - 知识图谱对话构建系统
