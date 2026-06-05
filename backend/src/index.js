import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 文件（从 backend 目录）
dotenv.config({ path: path.join(__dirname, '.env') });

// 导入其他模块（在 dotenv.config() 之后）
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import http from 'http';
import routes from './routes/index.js';
import agentRoutes from './agentRoutes/index.js';
import db from './database.js';

const app = express();
const PORT = process.env.PORT || 13001;
const HOST = process.env.HOST || '127.0.0.1';

// 判断是否为生产模式（通过环境变量或检查前端构建目录是否存在）
const isProduction = process.env.NODE_ENV === 'production';
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const frontendDevPort = process.env.FRONTEND_DEV_PORT || '13002';

// 创建默认管理员账户（仅在非生产环境且配置了环境变量时创建）
function createDefaultAdmin() {
  // 生产环境不自动创建默认管理员
  if (isProduction) {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminUsername || !adminPassword) {
      console.log('⚠️ 生产环境警告: 未配置管理员账户 (ADMIN_USERNAME, ADMIN_PASSWORD)');
      return;
    }
    
    try {
      const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
      if (!existingAdmin) {
        const adminId = crypto.randomUUID();
        const hashedPassword = bcrypt.hashSync(adminPassword, 10);
        db.prepare(`
          INSERT INTO users (id, username, password, is_admin)
          VALUES (?, ?, ?, ?)
        `).run(adminId, adminUsername, hashedPassword, 1);
        console.log(`✅ 生产环境管理员账户已创建: ${adminUsername}`);
      }
    } catch (error) {
      console.error('创建管理员账户失败:', error.message);
    }
    return;
  }
  
  // 开发环境检查是否已存在 admin 用户
  try {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    
    if (!existingAdmin) {
      // 开发环境可以配置自定义管理员，也使用环境变量
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      
      const adminId = crypto.randomUUID();
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      
      db.prepare(`
        INSERT INTO users (id, username, password, is_admin)
        VALUES (?, ?, ?, ?)
      `).run(adminId, adminUsername, hashedPassword, 1);
      
      if (process.env.ADMIN_USERNAME) {
        console.log(`✅ 开发环境管理员账户已创建: ${adminUsername}`);
      } else {
        console.log('⚠️ 开发环境默认管理员已创建 (admin/admin123) - 建议通过 ADMIN_USERNAME/ADMIN_PASSWORD 环境变量配置');
      }
    }
  } catch (error) {
    console.error('创建默认管理员账户失败:', error.message);
  }
}

// 代理函数
function proxyToFrontend(req, res, targetPath) {
  const options = {
    hostname: 'localhost',
    port: frontendDevPort,
    path: targetPath || req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${frontendDevPort}`
    }
  };
  
  const proxyReq = http.request(options, (proxyRes) => {
    // 处理 SSE 流式响应
    if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });
  
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.status(502).send('Frontend not available');
    }
  });
  
  req.pipe(proxyReq);
}

// CORS 配置 - 仅允许配置的域名
const corsOptions = {
  origin: function (origin, callback) {
    // 允许的来源列表
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [
          'http://localhost:13002',  // 本地开发
          'http://localhost:5173',   // Vite 默认端口
          'http://127.0.0.1:13002',
          'http://127.0.0.1:5173'
        ];
    
    // 如果没有 origin（如同源请求）或 origin 在白名单中
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS 拒绝: ${origin} 不在允许列表中`);
      callback(new Error('CORS: 不允许的来源'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());

// 路由
app.use('/api', routes);

// Agent API 路由
app.use('/api/agent', agentRoutes);

// 根路径处理
app.get('/', (req, res) => {
  // 生产模式：使用前端 index.html
  if (isProduction) {
    import('fs').then(fs => {
      const indexPath = path.join(frontendDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Frontend not built. Run: cd frontend && npm run build');
      }
    });
    return;
  }
  
  // 开发模式：尝试代理到前端开发服务器
  const options = {
    hostname: 'localhost',
    port: frontendDevPort,
    path: '/',
    method: 'GET',
    headers: req.headers
  };
  
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', () => {
    // 前端未运行时，返回后端信息
    res.json({
      name: 'MonkeyGraph API',
      version: '1.0.0',
      description: '知识图谱对话构建系统后端',
      mode: 'development',
      status: 'backend_running',
      frontend: `http://localhost:${frontendDevPort}`,
      message: '前端开发服务器未运行',
      hint: '请先启动前端: cd frontend && npm run dev',
      endpoints: {
        graph: '/api/graphs',
        nodes: '/api/graphs/:graphId/nodes',
        edges: '/api/graphs/:graphId/edges',
        history: '/api/graphs/:graphId/history',
        chat: '/api/chat',
        config: '/api/config/llm',
        agent: '/api/agent'
      }
    });
  });
  
  proxyReq.end();
});

// 开发模式：代理非 API 请求到前端开发服务器
if (!isProduction) {
  app.use((req, res, next) => {
    // 跳过 API 请求和根路径
    if (req.path.startsWith('/api') || req.path === '/') {
      return next();
    }
    
    proxyToFrontend(req, res);
  });
  
  console.log(`[后端] 开发模式：前端将通过代理访问 (端口 ${frontendDevPort})`);
} else {
  // 生产模式：托管前端构建产物
  import('fs').then(fs => {
    if (fs.existsSync(frontendDistPath)) {
      // 使用 express.static 托管静态文件
      app.use(express.static(frontendDistPath));
      
      // SPA 路由支持：将所有路由回退到 index.html
      app.get('*', (req, res) => {
        const indexPath = path.join(frontendDistPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('Frontend not built. Run: cd frontend && npm run build');
        }
      });
      
      console.log(`[后端] 生产模式：托管前端静态文件 (${frontendDistPath})`);
    } else {
      console.warn(`[后端] 警告：前端构建目录不存在 (${frontendDistPath})`);
      console.warn(`[后端] 提示：请先构建前端：cd frontend && npm run build`);
    }
  });
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// 启动服务器
const server = HOST === '0.0.0.0' || HOST === '127.0.0.1' || HOST === 'localhost'
  ? app.listen(PORT, () => {
      // 创建默认管理员账户
      createDefaultAdmin();
      
      const prefix = '【后端】';
      console.log(`
${prefix} ╔═══════════════════════════════════════════════════════════╗
${prefix} ║                                                           ║
${prefix} ║   🐒 MonkeyGraph API Server                               ║
${prefix} ║   ─────────────────────────────────────────────           ║
${prefix} ║   📡 Server running at: http://localhost:${PORT}            ║
${prefix} ║   📖 API Documentation: http://localhost:${PORT}/            ║
${prefix} ║                                                           ║
${prefix} ║   Endpoints:                                              ║
${prefix} ║   ├─ GET/POST /api/graphs  - 图谱管理                    ║
${prefix} ║   ├─ POST /api/chat     - 对话接口                        ║
${prefix} ║   ├─ GET  /api/history  - 获取历史记录                    ║
${prefix} ║   └─ POST /api/agent    - Agent API                      ║
${prefix} ║                                                           ║
${prefix} ╚═══════════════════════════════════════════════════════════╝
      `);
    })
  : app.listen(PORT, HOST, () => {
      // 创建默认管理员账户
      createDefaultAdmin();
      
      const prefix = '【后端】';
      console.log(`
${prefix} ╔═══════════════════════════════════════════════════════════╗
${prefix} ║                                                           ║
${prefix} ║   🐒 MonkeyGraph API Server                               ║
${prefix} ║   ─────────────────────────────────────────────           ║
${prefix} ║   📡 Server running at: http://${HOST}:${PORT}              ║
${prefix} ║   📖 API Documentation: http://${HOST}:${PORT}/            ║
${prefix} ║                                                           ║
${prefix} ║   Endpoints:                                              ║
${prefix} ║   ├─ GET/POST /api/graphs  - 图谱管理                    ║
${prefix} ║   ├─ POST /api/chat     - 对话接口                        ║
${prefix} ║   ├─ GET  /api/history  - 获取历史记录                    ║
${prefix} ║   └─ POST /api/agent    - Agent API                      ║
${prefix} ║                                                           ║
${prefix} ╚═══════════════════════════════════════════════════════════╝
      `);
    });

export default app;