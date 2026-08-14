# ==============================================================================
# MonkeyGraph Docker 构建文件
# 小型生产环境 - 单容器部署
# ==============================================================================

# 基础镜像：使用 Node.js 22 Debian（更稳定，与本地环境保持一致）
FROM node:22-bookworm AS base

# 安装构建工具和运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# ==============================================================================
# 阶段1: 构建前端
# ==============================================================================
FROM base AS frontend-builder

# 复制前端代码
COPY frontend/package*.json ./
COPY frontend/vite.config.js ./
COPY frontend/index.html ./
COPY frontend/src ./src

# 安装前端依赖并构建
RUN npm install && \
    npm run build

# ==============================================================================
# 阶段2: 构建后端
# ==============================================================================
FROM base AS backend-builder

# 复制后端代码
COPY backend/package*.json ./
COPY backend/src ./src
COPY backend/src/data ./src/data

# 安装后端依赖
RUN npm install

# ==============================================================================
# 阶段3: 运行阶段
# ==============================================================================
FROM base AS runtime

# 创建非 root 用户（Debian 系统用户）
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# 设置工作目录
WORKDIR /app

# 复制后端代码
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/src ./src

# 复制数据库迁移
COPY migrations ./migrations

# 复制前端构建产物（后端期望路径：/app/frontend/dist）
COPY --from=frontend-builder /app/dist ./frontend/dist

# 创建数据目录并设置权限
RUN mkdir -p data logs && \
    chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 环境变量配置
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=13001

# 暴露端口
EXPOSE 13001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:13001/health || exit 1

# 启动命令: 先运行迁移,再启动后端
# 迁移失败时容器退出(让编排器感知)
# 注意: DB_PATH 必须与 database.js 的 dbPath (src/../data) 一致,即 /app/data
CMD ["sh", "-c", "cd /app && DB_PATH=/app/data/knowledge-graph.db node migrations/migrator.js && node src/index.js"]