#!/bin/bash

#===============================================================================
# MonkeyGraph Bilingual Deployment Script / 双语部署脚本
# 支持中文 (zh-CN) 和英文 (en)
# 支持前后端合并到同一端口
#===============================================================================

# 语言设置 / Language Setting
LANG=${LANG:-zh_CN}
case "$LANG" in
    en*|EN*) LANGUAGE="en" ;;
    *) LANGUAGE="zh" ;;
esac

# 颜色定义 / Color Definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#===============================================================================
# 多语言文本 / Multilingual Text
#===============================================================================

if [ "$LANGUAGE" = "en" ]; then
    # English strings
    MSG_TITLE="🐒 MonkeyGraph Deployment Script"
    MSG_SELECT_LANG="Select language / 选择语言: [1] English  [2] 中文"
    MSG_ENV_CHECK="🔍 Checking environment..."
    MSG_NODE_VERSION="Node.js version"
    MSG_NODE_REQUIRED="Node.js 18+ is required"
    MSG_PORT_CHECK="Checking port availability..."
    MSG_PORT_WARNING="Port %s is in use, will try to free it"
    MSG_PORT_FREED="Port %s has been freed"
    MSG_DEPENDENCY="📦 Installing dependencies..."
    MSG_DEPENDENCY_DONE="Dependencies installed successfully"
    MSG_API_KEY_PROMPT="Enter your MiniMax API Key (press Enter to skip):"
    MSG_API_KEY_SKIP="Skipping API Key configuration"
    MSG_API_KEY_SET="API Key configured"
    MSG_CONFIGURING="⚙️  Configuring environment..."
    MSG_CONFIG_DONE="Environment configured successfully"
    MSG_BUILD_FRONTEND="🔨 Building frontend..."
    MSG_BUILD_DONE="Frontend built successfully"
    MSG_BUILD_SKIP="Skipping frontend build"
    MSG_STARTING="🚀 Starting services..."
    MSG_START_DONE="✅ All services started successfully!"
    MSG_ACCESS="Access"
    MSG_PRESS_STOP="Press Ctrl+C to stop all services"
    MSG_CLEANUP="Cleaning up..."
    MSG_DONE="Deployment complete! 🎉"
    MSG_ERROR="❌ Error occurred"
    MSG_NVM_NOTE="Note: Use 'nvm use 18' or 'nvm use 20' to switch Node version"
    MSG_MODE_DEV="Development Mode"
    MSG_MODE_PROD="Production Mode"
else
    # 中文 strings
    MSG_TITLE="🐒 MonkeyGraph 部署脚本"
    MSG_SELECT_LANG="选择语言 / Select language: [1] English  [2] 中文"
    MSG_ENV_CHECK="🔍 正在检查环境..."
    MSG_NODE_VERSION="Node.js 版本"
    MSG_NODE_REQUIRED="需要 Node.js 18 或更高版本"
    MSG_PORT_CHECK="检查端口占用情况..."
    MSG_PORT_WARNING="端口 %s 已被占用，将尝试释放"
    MSG_PORT_FREED="端口 %s 已释放"
    MSG_DEPENDENCY="📦 正在安装依赖..."
    MSG_DEPENDENCY_DONE="依赖安装成功"
    MSG_API_KEY_PROMPT="请输入您的 MiniMax API Key（直接回车跳过）:"
    MSG_API_KEY_SKIP="跳过 API Key 配置"
    MSG_API_KEY_SET="API Key 已配置"
    MSG_CONFIGURING="⚙️  正在配置环境..."
    MSG_CONFIG_DONE="环境配置完成"
    MSG_BUILD_FRONTEND="🔨 正在构建前端..."
    MSG_BUILD_DONE="前端构建成功"
    MSG_BUILD_SKIP="跳过前端构建"
    MSG_STARTING="🚀 正在启动服务..."
    MSG_START_DONE="✅ 所有服务启动成功！"
    MSG_ACCESS="访问地址"
    MSG_PRESS_STOP="按 Ctrl+C 停止所有服务"
    MSG_CLEANUP="正在清理..."
    MSG_DONE="部署完成！🎉"
    MSG_ERROR="❌ 发生错误"
    MSG_NVM_NOTE="提示：使用 'nvm use 18' 或 'nvm use 20' 切换 Node 版本"
    MSG_MODE_DEV="开发模式"
    MSG_MODE_PROD="生产模式"
fi

#===============================================================================
# Utility Functions / 工具函数
#===============================================================================

print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    printf "║   $MSG_TITLE\n"
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

#===============================================================================
# Environment Check / 环境检查
#===============================================================================

check_environment() {
    print_step "$MSG_ENV_CHECK"
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js 18+: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "$MSG_NODE_VERSION: $(node -v). $MSG_NODE_REQUIRED"
        echo "$MSG_NVM_NOTE"
        exit 1
    fi
    
    print_success "$MSG_NODE_VERSION: $(node -v)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_success "npm: $(npm -v)"
    
    # Check uvx (for MCP)
    if ! command -v uvx &> /dev/null; then
        print_warning "uvx is not installed (required for MCP tools)"
        print_warning "Install with: pip install uvx"
    else
        print_success "uvx: $(uvx --version 2>&1 | head -1)"
    fi
}

#===============================================================================
# Port Management / 端口管理
#===============================================================================

check_ports() {
    print_step "$MSG_PORT_CHECK"
    
    # Check port 13001 (backend)
    if lsof -ti:13001 > /dev/null 2>&1; then
        print_warning "$(printf "$MSG_PORT_WARNING" "13001")"
        lsof -ti:13001 | xargs kill -9 2>/dev/null || true
        sleep 1
        print_success "$(printf "$MSG_PORT_FREED" "13001")"
    else
        print_success "Port 13001: ✓"
    fi
    
    # Check port 13002 (frontend dev)
    if lsof -ti:13002 > /dev/null 2>&1; then
        print_warning "$(printf "$MSG_PORT_WARNING" "13002")"
        lsof -ti:13002 | xargs kill -9 2>/dev/null || true
        sleep 1
        print_success "$(printf "$MSG_PORT_FREED" "13002")"
    else
        print_success "Port 13002: ✓"
    fi
}

#===============================================================================
# Install Dependencies / 安装依赖
#===============================================================================

install_dependencies() {
    print_step "$MSG_DEPENDENCY"
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Install backend dependencies
    echo "→ Installing backend dependencies..."
    cd "$SCRIPT_DIR/backend"
    npm install
    
    if [ $? -ne 0 ]; then
        print_error "Backend dependency installation failed"
        exit 1
    fi
    print_success "Backend dependencies installed"
    
    # Install frontend dependencies
    echo "→ Installing frontend dependencies..."
    cd "$SCRIPT_DIR/frontend"
    npm install
    
    if [ $? -ne 0 ]; then
        print_error "Frontend dependency installation failed"
        exit 1
    fi
    print_success "Frontend dependencies installed"
    
    cd "$SCRIPT_DIR"
    print_success "$MSG_DEPENDENCY_DONE"
}

#===============================================================================
# Configure Environment / 配置环境
#===============================================================================

configure_environment() {
    print_step "$MSG_CONFIGURING"
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ENV_FILE="$SCRIPT_DIR/backend/.env"
    
    # Check if .env exists
    if [ -f "$ENV_FILE" ]; then
        # Backup existing .env
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        print_success "Existing .env backed up"
    fi
    
    # Ask for API Key
    echo ""
    read -p "$MSG_API_KEY_PROMPT" API_KEY
    
    if [ -z "$API_KEY" ]; then
        print_warning "$MSG_API_KEY_SKIP"
        # Use default config if exists
        if [ -f "$ENV_FILE" ]; then
            print_success "Using existing configuration"
        fi
    else
        # Create or update .env
        cat > "$ENV_FILE" << EOF
# MiniMax API Configuration
LLM_CLOUD_BASE_URL=https://api.minimaxi.com/v1
LLM_CLOUD_MODEL_NAME=MiniMax-M2.5
LLM_CLOUD_API_KEY=$API_KEY

# Backend Port
PORT=13001
EOF
        print_success "$MSG_API_KEY_SET"
    fi
    
    print_success "$MSG_CONFIG_DONE"
}

#===============================================================================
# Build Frontend / 构建前端
#===============================================================================

build_frontend() {
    print_step "$MSG_BUILD_FRONTEND"
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR/frontend"
    
    npm run build
    
    if [ $? -eq 0 ]; then
        print_success "$MSG_BUILD_DONE"
    else
        print_error "Frontend build failed"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

#===============================================================================
# Start Services / 启动服务
#===============================================================================

start_services() {
    local MODE=$1
    print_step "$MSG_STARTING"
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if [ "$MODE" = "prod" ]; then
        print_success "$MSG_MODE_PROD"
        
        # Start backend only (production mode)
        echo "→ Starting backend service..."
        cd "$SCRIPT_DIR/backend"
        npm start &
        BACKEND_PID=$!
        
        sleep 2
        
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║                                                              ║"
        echo "║   $MSG_START_DONE"
        echo "║                                                              ║"
        echo "║   ─────────────────────────────────────────────               ║"
        printf "║   🌐 $MSG_ACCESS:  http://localhost:13001\n"
        printf "║   📖 API Docs:    http://localhost:13001/api\n"
        echo "║                                                              ║"
        printf "║   $MSG_PRESS_STOP\n"
        echo "║                                                              ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        
        # Cleanup function
        cleanup() {
            echo ""
            print_step "$MSG_CLEANUP"
            kill $BACKEND_PID 2>/dev/null
            lsof -ti:13001 | xargs kill -9 2>/dev/null
            print_success "Services stopped"
            exit 0
        }
        
        trap cleanup SIGINT SIGTERM
        wait $BACKEND_PID
    else
        print_success "$MSG_MODE_DEV"
        
        # Start backend
        echo "→ Starting backend service..."
        cd "$SCRIPT_DIR/backend"
        npm start &
        BACKEND_PID=$!
        
        # Wait for backend to start
        sleep 2
        
        # Start frontend dev server
        echo "→ Starting frontend dev server..."
        cd "$SCRIPT_DIR/frontend"
        npm run dev &
        FRONTEND_PID=$!
        
        # Wait for frontend to start
        sleep 2
        
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║                                                              ║"
        echo "║   $MSG_START_DONE"
        echo "║                                                              ║"
        echo "║   ─────────────────────────────────────────────               ║"
        printf "║   🌐 $MSG_ACCESS:  http://localhost:13001\n"
        printf "║   🌐 前端直连:   http://localhost:13002\n"
        echo "║                                                              ║"
        printf "║   $MSG_PRESS_STOP\n"
        echo "║                                                              ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        
        # Cleanup function
        cleanup() {
            echo ""
            print_step "$MSG_CLEANUP"
            kill $BACKEND_PID 2>/dev/null
            kill $FRONTEND_PID 2>/dev/null
            lsof -ti:13001 | xargs kill -9 2>/dev/null
            lsof -ti:13002 | xargs kill -9 2>/dev/null
            print_success "Services stopped"
            exit 0
        }
        
        trap cleanup SIGINT SIGTERM
        wait
    fi
}

#===============================================================================
# Main / 主程序
#===============================================================================

main() {
    print_header
    
    # Language selection
    echo "$MSG_SELECT_LANG"
    read -n1 -s LANG_choice
    echo ""
    case "$LANG_choice" in
        1) LANGUAGE="en" ;;
        2) LANGUAGE="zh" ;;
    esac
    
    # Re-print header with selected language
    print_header
    
    # Ask deployment mode
    echo ""
    echo "Select deployment mode / 选择部署模式:"
    echo "  [1] $MSG_MODE_DEV (前端需要单独启动)"
    echo "  [2] $MSG_MODE_PROD (前后端合并，单端口服务)"
    read -n1 -s MODE_choice
    echo ""
    
    local DEPLOY_MODE="dev"
    case "$MODE_choice" in
        2) DEPLOY_MODE="prod" ;;
    esac
    
    # Run deployment steps
    check_environment
    check_ports
    install_dependencies
    configure_environment
    
    if [ "$DEPLOY_MODE" = "prod" ]; then
        build_frontend
    fi
    
    start_services "$DEPLOY_MODE"
}

# Run main
main "$@"