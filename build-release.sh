#!/bin/bash

# ==============================================================================
# MonkeyGraph 发布包构建脚本
# 构建一个包含 Docker 镜像、部署脚本、数据库的完整部署包
# ==============================================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m' 
NC='\033[0m' # No Color

# 路径配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="monkeygraph"
RELEASE_DIR="$SCRIPT_DIR/release-package"
BACKEND_DB="$SCRIPT_DIR/backend/data/knowledge-graph.db"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"

# ==============================================================================
# 打印函数
# ==============================================================================

print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🐒 MonkeyGraph 发布包构建脚本                             ║"
    echo "║   ─────────────────────────────────────────────               ║"
    echo "║   包含：Docker镜像 | 数据库 | 部署脚本 | 部署手册             ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

print_step() {
    printf "${BLUE}[STEP]${NC} %s\n" "$1"
}

print_success() {
    printf "${GREEN}[✓]${NC} %s\n" "$1"
}

print_warning() {
    printf "${YELLOW}[⚠]${NC} %s\n" "$1"
}

print_error() {
    printf "${RED}[✗]${NC} %s\n" "$1"
}

# ==============================================================================
# 环境检查
# ==============================================================================

check_environment() {
    print_step "检查构建环境..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装"
        exit 1
    fi
    
    # 检查 Docker 服务
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未运行，请先启动 Docker"
        exit 1
    fi
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装"
        exit 1
    fi
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        print_error "npm 未安装"
        exit 1
    fi
    
    print_success "环境检查通过"
    echo "   Node.js: $(node --version)"
    echo "   Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
}

# ==============================================================================
# 清理旧文件
# ==============================================================================

cleanup_old_build() {
    print_step "清理旧构建文件..."
    
    # 确保 release-package 目录存在
    mkdir -p "$RELEASE_DIR"
    
    # 删除旧镜像文件
    if [ -f "$RELEASE_DIR/monkeygraph-image.tar" ]; then
        rm -f "$RELEASE_DIR/monkeygraph-image.tar"
        print_warning "已删除旧镜像文件"
    fi
    
    # 删除旧 zip 包
    if [ -f "$SCRIPT_DIR/${PROJECT_NAME}-release.zip" ]; then
        rm -f "$SCRIPT_DIR/${PROJECT_NAME}-release.zip"
        print_warning "已删除旧 zip 包"
    fi
    
    print_success "清理完成"
}

# ==============================================================================
# 构建前端
# ==============================================================================

build_frontend() {
    print_step "构建前端..."
    
    cd "$FRONTEND_DIR"
    
    # 检查是否需要安装依赖
    if [ ! -d "node_modules" ]; then
        print_warning "前端依赖未安装，开始安装..."
        npm install
    fi
    
    # 构建前端
    npm run build
    
    if [ ! -d "dist" ]; then
        print_error "前端构建失败，dist 目录不存在"
        exit 1
    fi
    
    print_success "前端构建完成"
    echo "   构建目录: $FRONTEND_DIR/dist"
}

# ==============================================================================
# 构建 Docker 镜像
# ==============================================================================

build_docker_image() {
    print_step "构建 Docker 镜像..."
    
    cd "$SCRIPT_DIR"
    
    # 检查是否有正在运行的容器
    if docker ps | grep -q "monkeygraph-app"; then
        print_warning "检测到运行中的容器，停止中..."
        docker stop monkeygraph-app 2>/dev/null || true
    fi
    
    # 构建镜像
    print_warning "开始构建镜像（可能需要几分钟）..."
    docker build -t czh_graph-${PROJECT_NAME}:latest .
    
    if [ $? -ne 0 ]; then
        print_error "Docker 镜像构建失败"
        exit 1
    fi
    
    print_success "Docker 镜像构建完成"
}

# ==============================================================================
# 导出 Docker 镜像
# ==============================================================================

export_docker_image() {
    print_step "导出 Docker 镜像为 tar 文件..."
    
    # 导出镜像
    docker save czh_graph-${PROJECT_NAME}:latest -o "$RELEASE_DIR/monkeygraph-image.tar"
    
    if [ $? -ne 0 ]; then
        print_error "镜像导出失败"
        exit 1
    fi
    
    local size=$(du -h "$RELEASE_DIR/monkeygraph-image.tar" | cut -f1)
    print_success "镜像导出完成"
    echo "   镜像大小: $size"
}

# ==============================================================================
# 准备部署文件
# ==============================================================================

prepare_deploy_files() {
    print_step "准备部署文件..."
    
    # 确保目录存在
    mkdir -p "$RELEASE_DIR/data"
    mkdir -p "$RELEASE_DIR/logs"
    mkdir -p "$RELEASE_DIR/data/uploads"
    
    # 复制测试数据库（重要！包含完整的测试数据）
    if [ -f "$BACKEND_DB" ]; then
        # 清理 WAL 文件，避免数据库不一致
        rm -f "${BACKEND_DB}-wal" "${BACKEND_DB}-shm" 2>/dev/null || true
        
        local db_size=$(du -h "$BACKEND_DB" | cut -f1)
        cp "$BACKEND_DB" "$RELEASE_DIR/data/knowledge-graph.db"
        print_success "已复制测试数据库"
        echo "   数据库大小: $db_size"
    else
        print_error "测试数据库不存在: $BACKEND_DB"
        exit 1
    fi
    
    # 复制额外数据库（如有）
    if [ -f "$MONKEYGRAPH_DB" ]; then
        # 清理 WAL 文件
        rm -f "${MONKEYGRAPH_DB}-wal" "${MONKEYGRAPH_DB}-shm" 2>/dev/null || true
        cp "$BACKEND_DIR/data/monkeygraph.db" "$RELEASE_DIR/data/monkeygraph.db"
        print_success "已复制额外数据库"
    fi
    
    # 复制环境变量文件（优先使用包含 API Key 的真实配置）
    if [ -f "$BACKEND_DIR/.env" ]; then
        cp "$BACKEND_DIR/.env" "$RELEASE_DIR/.env"
        print_success "已复制环境变量文件（含 API Key）"
    elif [ -f "$BACKEND_DIR/.env.example" ]; then
        cp "$BACKEND_DIR/.env.example" "$RELEASE_DIR/.env"
        print_warning "未找到 .env，已复制模板，请手动填写 API Key"
    fi
    
    # 复制 Docker Compose 文件
    if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
        cp "$SCRIPT_DIR/docker-compose.yml" "$RELEASE_DIR/docker-compose.yml"
        print_success "已复制 docker-compose.yml"
    fi
    
    # 复制部署脚本
    if [ -f "$SCRIPT_DIR/deploy-docker.sh" ]; then
        cp "$SCRIPT_DIR/deploy-docker.sh" "$RELEASE_DIR/deploy-docker.sh"
        chmod +x "$RELEASE_DIR/deploy-docker.sh"
        print_success "已复制部署脚本"
    else
        print_error "部署脚本不存在: $SCRIPT_DIR/deploy-docker.sh"
        exit 1
    fi
    
    # 复制 Dockerfile
    if [ -f "$SCRIPT_DIR/Dockerfile" ]; then
        cp "$SCRIPT_DIR/Dockerfile" "$RELEASE_DIR/Dockerfile"
        print_success "已复制 Dockerfile"
    else
        print_error "Dockerfile 不存在: $SCRIPT_DIR/Dockerfile"
        exit 1
    fi
    print_success "部署文件准备完成"
}

# ==============================================================================
# 创建部署手册
# ==============================================================================

create_deploy_manual() {
    print_step "检查部署手册..."
    
    # 如果 DEPLOY.md 已存在且不为空，则保留
    if [ -f "$RELEASE_DIR/DEPLOY.md" ] && [ -s "$RELEASE_DIR/DEPLOY.md" ]; then
        print_success "部署手册已存在，跳过创建"
        return 0
    fi
    
    # 如果不存在，则创建默认版本
    cat > "$RELEASE_DIR/DEPLOY.md" << 'EOF'
# 🐒 MonkeyGraph 服务器部署手册

## 📦 包含内容

```
release-package/
├── monkeygraph-image.tar    # Docker 镜像包 (~420MB)
├── knowledge-graph.db       # 测试数据库 (298MB，含完整测试数据)
├── Dockerfile               # Docker 构建文件
├── docker-compose.yml       # Docker Compose 配置
├── deploy-docker.sh        # 部署脚本
├── .env                    # 环境变量配置（包含 API Key）
├── DEPLOY.md               # 部署说明文档
├── data/                   # 数据目录（持久化）
│   └── uploads/           # 上传文件存储
└── logs/                   # 日志目录（持久化）
```

## 🚀 快速部署

### 1. 上传文件
```bash
scp -r ./release-package user@your-server:/path/to/
```

### 2. 加载镜像
```bash
docker load -i monkeygraph-image.tar
```

### 3. 启动服务
```bash
chmod +x deploy-docker.sh
./deploy-docker.sh start
```

### 4. 验证
```bash
curl http://localhost:9102/health
```

## 🔧 管理命令

- `./deploy-docker.sh start` - 启动
- `./deploy-docker.sh stop` - 停止
- `./deploy-docker.sh restart` - 重启
- `./deploy-docker.sh logs` - 查看日志

## 📋 环境要求

- Docker 20.10+
- Docker Compose v2+
- 1GB+ 内存
- 5GB+ 磁盘空间

---
**MonkeyGraph** - 知识图谱对话构建系统
**Version: $(date '+%Y-%m-%d')**
EOF
    
    print_success "部署手册创建完成"
}

# ==============================================================================
# 打包发布
# ==============================================================================

create_release_package() {
    print_step "创建发布包..."
    
    cd "$SCRIPT_DIR"
    
    # 创建 zip 包（排除临时文件）
    zip -r "${PROJECT_NAME}-release.zip" release-package/ \
        -x "*.DS_Store" \
        -x "*/.git/*" \
        -x "*/node_modules/*" \
        -x "*/dist/*" \
        -x "*.log" \
        -x "*/__pycache__/*"
    
    if [ $? -ne 0 ]; then
        print_error "打包失败"
        exit 1
    fi
    
    print_success "发布包创建完成"
}

# ==============================================================================
# 显示完成信息
# ==============================================================================

show_summary() {
    local zip_path="$SCRIPT_DIR/${PROJECT_NAME}-release.zip"
    local zip_size=$(du -h "$zip_path" | cut -f1)
    local image_size=$(du -h "$RELEASE_DIR/monkeygraph-image.tar" | cut -f1)
    local db_size=$(du -h "$RELEASE_DIR/data/knowledge-graph.db" | cut -f1)
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🎉 MonkeyGraph 发布包构建完成！                           ║"
    echo "║                                                              ║"
    echo "║   ─────────────────────────────────────────────               ║"
    echo "║   📦 发布包路径: $zip_path"
    echo "║   📊 发布包大小: $zip_size"
    echo "║                                                              ║"
    echo "║   ─────────────────────────────────────────────               ║"
    echo "║   📋 包含内容:                                              ║"
    echo "║   ├─ 🐳 Docker 镜像: $image_size"
    echo "║   ├─ 🗄️  测试数据库: $db_size"
    echo "║   ├─ 📜  部署脚本: deploy-docker.sh"
    echo "║   └─ 📖  部署手册: DEPLOY.md"
    echo "║                                                              ║"
    echo "║   ─────────────────────────────────────────────               ║"
    echo "║   🚀 下一步:                                                  ║"
    echo "║   1. 上传 zip 包到服务器"
    echo "║   2. 解压并执行部署"
    echo "║   3. 配置 .env 中的 API Key"
    echo "║   4. 运行 ./deploy-docker.sh start"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# ==============================================================================
# 主程序
# ==============================================================================

main() {
    print_header
    
    check_environment
    cleanup_old_build
    build_frontend
    build_docker_image
    export_docker_image
    prepare_deploy_files
    create_deploy_manual
    create_release_package
    show_summary
}

# 运行主程序
main "$@"
