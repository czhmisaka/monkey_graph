# MonkeyGraph 后端启动问题修复记录

## 问题描述
后端服务启动时无法读取 .env 文件中的 ENCRYPTION_KEY 环境变量，导致启动失败并报错：
```
Error: ENCRYPTION_KEY 环境变量未设置。请在 .env 文件中配置 ENCRYPTION_KEY
```

## 根本原因
`database.js` 在模块加载时立即检查 `process.env.ENCRYPTION_KEY`，但此时环境变量还未从 .env 文件加载。

## 解决方案
在启动后端服务前，使用以下命令加载 .env 环境变量：

```bash
cd backend
export $(grep -v '^#' .env | xargs)
npm start
```

## 永久修复建议
修改 `start.sh` 脚本，在后端启动命令前添加环境变量加载：

```bash
# 在启动后端的部分，修改为：
cd "$SCRIPT_DIR/backend"
export $(grep -v '^#' .env | xargs)
HOST="$HOST" npm start &
```

## 验证结果
- ✅ 后端服务成功启动 (端口 13001)
- ✅ 前端服务成功启动 (端口 13002)
- ✅ API 接口 /api/stats/global 正常返回
- ✅ API 接口 /api/graphs/public 正常返回

## 数据统计
- 用户数: 3
- 图谱数: 16
- 节点数: 19,113
- 边数: 58,109
- 数据库大小: 333 MB

修复时间: 2026-04-16 08:56
