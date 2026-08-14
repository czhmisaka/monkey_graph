#!/bin/bash

# ==============================================================================
# MonkeyGraph Docker 部署脚本
# 小型生产环境 - 单容器部署
# ==============================================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认端口配置
DEPLOY_PORT=""

# ==============================================================================
# 参数解析
# ==============================================================================

parse_arguments() {
    # 优先使用环境变量 PORT 作为默认值
    local default_port="${PORT:-13001}"
    
    # 初始化命令为空（默认为 start）
    COMMAND="start"
    DEPLOY_PORT=""
    
    # 处理所有参数
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                if [[ $# -lt 2 ]]; then
                    echo "错误: --port 参数需要指定端口号"
                    exit 1
                fi
                DEPLOY_PORT="$2"
                # 验证端口是否为数字
                if ! [[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] || [ "$DEPLOY_PORT" -lt 1 ] || [ "$DEPLOY_PORT" -gt 65535 ]; then
                    echo "错误: 端口号无效 (1-65535)"
                    exit 1
                fi
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            start|stop|restart|logs|status|rebuild|help)
                COMMAND="$1"
                shift
                ;;
            *)
                # 忽略未知参数
                shift
                ;;
        esac
    done
    
    # 如果没有指定端口，使用默认值
    if [ -z "$DEPLOY_PORT" ]; then
        DEPLOY_PORT="$default_port"
    fi
}

# ==============================================================================
# 显示帮助
# ==============================================================================

show_help() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🐒 MonkeyGraph Docker 部署脚本                            ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "用法: $0 [command] [options]"
    echo ""
    echo "命令:"
    echo "  start    - 启动服务（默认）"
    echo "  stop     - 停止服务"
    echo "  restart  - 重启服务"
    echo "  logs     - 查看日志"
    echo "  status   - 查看状态"
    echo "  rebuild  - 重新构建并启动"
    echo "  help     - 显示帮助"
    echo ""
    echo "选项:"
    echo "  -p, --port <端口>  指定部署端口（默认: 13001）"
    echo ""
    echo "示例:"
    echo "  $0 start                      # 使用默认端口 13001 启动"
    echo "  $0 start --port 8080          # 使用端口 8080 启动"
    echo "  $0 start -p 3000              # 使用端口 3000 启动"
    echo "  $0 stop                       # 停止服务"
    echo "  $0 logs                       # 查看日志"
    echo ""
}

# ==============================================================================
# Docker Compose 命令检测（兼容 docker-compose 和 docker compose）
# ==============================================================================
detect_docker_compose_command() {
    # 优先使用 docker compose（Docker v2+ 内置）
    if docker compose version &> /dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
        print_success "检测到 Docker Compose v2+ (docker compose)"
    # 备用 docker-compose（独立安装）
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
        print_success "检测到 Docker Compose (docker-compose)"
    else
        print_error "未找到 Docker Compose 命令"
        echo "请安装 Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
}

# ==============================================================================
# 多语言支持
# ==============================================================================

print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🐒 MonkeyGraph Docker 部署脚本                            ║"
    echo "║   ─────────────────────────────────────────────               ║"
    printf "║   部署端口: %-47s║\n" "${DEPLOY_PORT}"
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

check_docker() {
    print_step "检查 Docker 环境..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        echo "安装指南: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # 检测 Docker Compose 命令（优先 docker compose，备用 docker-compose）
    if ! docker compose version &> /dev/null 2>&1 && ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        echo "安装指南: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # 检查 Docker 服务状态
    if ! docker info &> /dev/null; then
        print_error "Docker 服务未启动，请先启动 Docker"
        exit 1
    fi
    
    print_success "Docker 环境检查通过"
}

check_env() {
    print_step "检查环境变量配置..."
    
    # .env 文件在脚本同目录下
    ENV_FILE="$SCRIPT_DIR/.env"
    
    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env 文件不存在，正在创建..."
        
        # 生成安全密钥（代码强制要求 JWT_SECRET/ENCRYPTION_KEY/ADMIN_PASSWORD，缺失会启动失败）
        local generated_jwt="$(openssl rand -base64 32 2>/dev/null | tr -d '\n')"
        local generated_enc="$(openssl rand -hex 32 2>/dev/null | tr -d '\n')"
        local generated_admin_pw="$(openssl rand -base64 18 2>/dev/null | tr -d '+/=' | tr -d '\n')"
        [ -z "$generated_jwt" ] && generated_jwt="dev-jwt-secret-$(date +%s)"
        [ -z "$generated_enc" ] && generated_enc="dev-encryption-key-0123456789abcdef"
        [ -z "$generated_admin_pw" ] && generated_admin_pw="Admin$(date +%s)!"

        cat > "$ENV_FILE" << EOF
# MiniMax API 配置
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
LLM_CLOUD_API_KEY=your_api_key_here

# 安全密钥（代码强制要求，缺失将导致服务无法启动）
JWT_SECRET=${generated_jwt}
ENCRYPTION_KEY=${generated_enc}

# 管理员账户（默认用户名 admin）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${generated_admin_pw}

# 服务配置
PORT=${DEPLOY_PORT}
HOST=0.0.0.0
NODE_ENV=production
EOF
        
        print_warning "已生成 .env 模板（含随机安全密钥与管理员密码）"
        print_warning "请编辑 $ENV_FILE 填写 API Key，并按需修改管理员密码后重新运行"
        exit 1
    fi
    
    # 检查 API Key
    if grep -q "your_api_key_here" "$ENV_FILE"; then
        print_error "请先在 .env 文件中填写 MiniMax API Key"
        exit 1
    fi
    
    print_success "环境变量检查通过"
}

# ==============================================================================
# 数据目录准备
# ==============================================================================

prepare_data_dirs() {
    print_step "准备数据目录..."
    
    # 创建数据目录
    mkdir -p "$SCRIPT_DIR/data"
    mkdir -p "$SCRIPT_DIR/logs"
    
    # 设置权限（UID 1001:1001 对应容器内的 nodejs 用户）
    # 方案1: 直接设置 1001 权限（适用于已存在的目录）
    chown -R 1001:1001 "$SCRIPT_DIR/data" 2>/dev/null || true
    chown -R 1001:1001 "$SCRIPT_DIR/logs" 2>/dev/null || true
    chmod 750 "$SCRIPT_DIR/data"
    chmod 750 "$SCRIPT_DIR/logs"
    
    # 如果上面失败，尝试递归设置（适用于新创建的目录）
    if [ "$(stat -c '%u' "$SCRIPT_DIR/data" 2>/dev/null)" != "1001" ]; then
        print_warning "权限设置遇到问题，尝试使用 root 方式..."
        # 创建 .nomask 文件确保容器内可以写入
        touch "$SCRIPT_DIR/data/.permission_ok"
        touch "$SCRIPT_DIR/logs/.permission_ok"
    fi
    
    print_success "数据目录准备完成"
}

# ==============================================================================
# Docker 构建和启动
# ==============================================================================

build_and_start() {
    print_step "准备 Docker 镜像..."
    
    # 检测 Docker Compose 命令
    detect_docker_compose_command
    
    # 停止旧容器
    if docker ps -a | grep -q "monkeygraph-app"; then
        print_warning "停止旧容器..."
        docker stop monkeygraph-app 2>/dev/null || true
        docker rm monkeygraph-app 2>/dev/null || true
    fi
    
    # 检查是否有预构建镜像
    if [ -f "$SCRIPT_DIR/monkeygraph-image.tar" ]; then
        print_step "加载预构建镜像..."
        if docker load -i "$SCRIPT_DIR/monkeygraph-image.tar"; then
            print_success "预构建镜像加载成功"
            return 0
        else
            print_error "预构建镜像加载失败"
            exit 1
        fi
    fi
    
    # 如果没有预构建镜像，检查是否有 Dockerfile
    if [ -f "$SCRIPT_DIR/Dockerfile" ]; then
        print_step "构建 Docker 镜像..."
        if PORT=${DEPLOY_PORT} $DOCKER_COMPOSE_CMD build --no-cache; then
            print_success "Docker 镜像构建成功"
        else
            print_error "Docker 镜像构建失败"
            exit 1
        fi
    else
        print_error "未找到镜像文件，请确保 monkeygraph-image.tar 存在"
        exit 1
    fi
}

start_services() {
    print_step "启动容器服务..."
    
    # 检测 Docker Compose 命令
    detect_docker_compose_command
    
    # 使用检测到的命令启动（传入端口环境变量），--no-build 确保不构建
    if PORT=${DEPLOY_PORT} $DOCKER_COMPOSE_CMD up -d --no-build; then
        print_success "容器启动成功"
    else
        print_error "容器启动失败"
        exit 1
    fi
    
    # 等待服务启动
    print_step "等待服务启动..."
    sleep 5
    
    # 检查容器状态
    if docker ps | grep -q "monkeygraph-app"; then
        print_success "容器运行中"
    else
        print_error "容器未正常运行，查看日志："
        docker logs monkeygraph-app
        exit 1
    fi
}

# ==============================================================================
# 健康检查
# ==============================================================================

health_check() {
    print_step "执行健康检查..."
    
    # 等待健康检查通过（最多 30 秒）
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:${DEPLOY_PORT}/health > /dev/null 2>&1; then
            print_success "健康检查通过"
            return 0
        fi
        
        attempt=$((attempt + 1))
        print_warning "等待服务就绪... ($attempt/$max_attempts)"
        sleep 3
    done
    
    print_error "健康检查失败，查看日志："
    docker logs monkeygraph-app
    return 1
}

# ==============================================================================
# 显示服务信息
# ==============================================================================

show_info() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🐒 MonkeyGraph 部署完成！                                 ║"
    echo "║                                                              ║"
    echo "║   ─────────────────────────────────────────────               ║"
    printf "║   🌐 访问地址: http://localhost:%s\n" "${DEPLOY_PORT}"
    printf "║   🌐 外部访问: http://<你的IP>:%s\n" "${DEPLOY_PORT}"
    echo "║                                                              ║"
    echo "║   ─────────────────────────────────────────────               ║"
    echo "║   管理命令:                                                  ║"
    echo "║   ├─ 查看状态: docker ps                                    ║"
    echo "║   ├─ 查看日志: docker logs -f monkeygraph-app               ║"
    printf "║   ├─ 停止服务: PORT=%s docker-compose down\n" "${DEPLOY_PORT}"
    printf "║   ├─ 重启服务: PORT=%s docker-compose restart\n" "${DEPLOY_PORT}"
    echo "║   └─ 重新部署: ./deploy-docker.sh                           ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# ==============================================================================
# 停止服务
# ==============================================================================

stop_services() {
    print_step "停止服务..."
    
    # 检测 Docker Compose 命令
    detect_docker_compose_command
    
    $DOCKER_COMPOSE_CMD down
    
    print_success "服务已停止"
}

# ==============================================================================
# 查看日志
# ==============================================================================

view_logs() {
    docker logs -f monkeygraph-app
}

# ==============================================================================
# 主程序
# ==============================================================================

main() {
    # 解析命令行参数
    parse_arguments "$@"
    
    print_header
    
    case "$COMMAND" in
        start)
            check_docker
            check_env
            prepare_data_dirs
            build_and_start
            start_services
            health_check
            show_info
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            start_services
            health_check
            show_info
            ;;
        logs)
            view_logs
            ;;
        status)
            docker ps | grep monkeygraph-app
            ;;
        rebuild)
            build_and_start
            start_services
            health_check
            show_info
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $COMMAND"
            echo "使用 '$0 help' 查看帮助"
            exit 1
            ;;
    esac
}

# 运行主程序
main "$@"
