#!/bin/bash

# MonkeyGraph 启动脚本 - 同时启动前后端服务
# 前后端现在可以通过单一端口访问

# 解析参数
# 默认使用 localhost (127.0.0.1)，使用 -p 参数切换到 0.0.0.0
HOST="127.0.0.1"
MODE="dev"  # dev: 开发模式, prod: 生产模式
while getopts "ph" opt; do
  case $opt in
    p)
      HOST="0.0.0.0"
      ;;
    h)
      echo "用法: ./start.sh [-p] [-m mode]"
      echo "  -p  使用 0.0.0.0 host（允许外部访问）"
      echo "  -m  模式: dev (开发模式，默认) 或 prod (生产模式，需要先构建)"
      echo ""
      echo "示例:"
      echo "  ./start.sh          # 开发模式，本地访问"
      echo "  ./start.sh -p       # 开发模式，允许外部访问"
      echo "  ./start.sh -m prod  # 生产模式（需先构建）"
      exit 0
      ;;
    \?)
      echo "用法: ./start.sh [-p]"
      echo "  -p  使用 0.0.0.0 host（允许外部访问）"
      exit 1
      ;;
  esac
done

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   🐒 MonkeyGraph 知识图谱系统                             ║"
echo "║   ─────────────────────────────────────────────           ║"
echo "║   🌐 Host: $HOST                                          ║"
echo "║   📦 Mode: $MODE                                          ║"
echo "║                                                           ║"

# 检查端口是否被占用，如果占用则杀掉
if lsof -ti:13001 > /dev/null 2>&1; then
    echo "║   ⚠ 后端端口 13001 已被占用，正在关闭...                  ║"
    lsof -ti:13001 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

if lsof -ti:13002 > /dev/null 2>&1; then
    echo "║   ⚠ 前端开发端口 13002 已被占用，正在关闭...               ║"
    lsof -ti:13002 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 加载 nvm（兼容不同 shell 环境）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# 导出 HOST 环境变量
export HOST

if [ "$MODE" = "prod" ]; then
    # 生产模式
    echo "║   📦 生产模式：托管前端静态文件                          ║"
    
    # 检查前端构建目录
    if [ ! -d "$SCRIPT_DIR/frontend/dist" ]; then
        echo "║   ⚠ 警告：前端构建目录不存在！                         ║"
        echo "║   ⚠ 提示：请先运行: cd frontend && npm run build       ║"
        sleep 2
    fi
    
    # 启动后端（生产模式）
    echo "║   📡 启动后端服务（生产模式）...                      ║"
    cd "$SCRIPT_DIR/backend"
    HOST="$HOST" NODE_ENV=production npm start &
    BACKEND_PID=$!
    
    # 等待后端启动
    sleep 2
    
    echo "║                                                           ║"
    echo "║   ✅ 服务启动完成！                                       ║"
    echo "║   ─────────────────────────────────────────────           ║"
    if [ "$HOST" = "0.0.0.0" ]; then
        echo "║   🌐 访问地址: http://localhost:13001                      ║"
        echo "║   🌐 外部访问: http://<你的IP>:13001                    ║"
    else
        echo "║   🌐 访问地址: http://localhost:13001                      ║"
    fi
    echo "║                                                           ║"
    echo "║   API 文档: http://localhost:13001/api                    ║"
    echo "║   按 Ctrl+C 停止所有服务                                  ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
else
    # 开发模式
    echo "║   📦 开发模式：后端代理前端开发服务器                      ║"
    
    # 启动后端（Node 24）
    echo "║   📡 启动后端服务 (Node 24)...                          ║"
    cd "$SCRIPT_DIR/backend"
    nvm use 24 > /dev/null 2>&1
    # 确保 better-sqlite3 与当前 Node 版本兼容
    npm rebuild better-sqlite3 2>/dev/null
    HOST="$HOST" npm start &
    BACKEND_PID=$!
    
    # 等待后端启动
    sleep 2
    
    # 启动前端开发服务器（Node 24，Vite 7 兼容）
    echo "║   🌐 启动前端开发服务器 (Node 24)...                    ║"
    cd "$SCRIPT_DIR/frontend"
    nvm use 24 > /dev/null 2>&1
    HOST="$HOST" npm run dev &
    FRONTEND_PID=$!
    
    # 等待前端启动
    sleep 3
    
    echo "║                                                           ║"
    echo "║   ✅ 服务启动完成！                                       ║"
    echo "║   ─────────────────────────────────────────────           ║"
    if [ "$HOST" = "0.0.0.0" ]; then
        echo "║   🌐 主入口: http://localhost:13001                        ║"
        echo "║   🌐 前端直连: http://localhost:13002                      ║"
        echo "║   🌐 外部访问: http://<你的IP>:13001                    ║"
    else
        echo "║   🌐 主入口: http://localhost:13001                        ║"
        echo "║   🌐 前端直连: http://localhost:13002                      ║"
    fi
    echo "║                                                           ║"
    echo "║   💡 提示：前后端已合并到同一端口                          ║"
    echo "║      访问 http://localhost:13001 即可使用                  ║"
    echo "║   按 Ctrl+C 停止所有服务                                  ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
fi

# 捕获 Ctrl+C 信号，停止所有服务
cleanup() {
    echo ""
    echo "正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    lsof -ti:13001 | xargs kill -9 2>/dev/null
    lsof -ti:13002 | xargs kill -9 2>/dev/null
    echo "服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 保持脚本运行
wait