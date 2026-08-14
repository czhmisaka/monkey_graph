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
import helmet from 'helmet';
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
// 前端构建产物位于项目根 frontend/dist（backend/src → 上两级）
const frontendDistPath = process.env.FRONTEND_DIST_PATH || path.join(__dirname, '..', '..', 'frontend', 'dist');
const frontendDevPort = process.env.FRONTEND_DEV_PORT || '13002';

// 创建默认管理员账户（强制要求配置环境变量；缺失时启动失败）
function createDefaultAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      '[FATAL] 必须配置 ADMIN_PASSWORD (>=12 字符)。' +
      '出于安全考虑,缺失或弱密码将阻止服务启动。' +
      '请在 backend/.env 中设置 ADMIN_PASSWORD 后重启。'
    );
  }

  try {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);

    if (!existingAdmin) {
      const adminId = crypto.randomUUID();
      const hashedPassword = bcrypt.hashSync(adminPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

      db.prepare(`
        INSERT INTO users (id, username, password, is_admin)
        VALUES (?, ?, ?, ?)
      `).run(adminId, adminUsername, hashedPassword, 1);

      console.log(`✅ 管理员账户已创建: ${adminUsername}`);
    } else {
      console.log(`✅ 管理员账户已存在: ${adminUsername}`);
    }
  } catch (error) {
    console.error('创建管理员账户失败:', error.message);
    throw error;
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
          'http://localhost:13001',  // 统一入口
          'http://localhost:13002',  // 本地开发
          'http://localhost:5173',   // Vite 默认端口
          'http://127.0.0.1:13001',
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

// 安全响应头（helmet）
// SSE 需要禁用部分与流式响应冲突的头
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false  // SPA 内联样式/脚本较多，由前端自行控制
}));

// JSON body 大小限制（防大请求体 DoS）
app.use(express.json({ limit: '2mb' }));

// Cookie 解析中间件 (无需 cookie-parser 依赖)
// 仅解析 mg_token;格式: k1=v1; k2=v2
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return next();
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) req.cookies[k] = decodeURIComponent(v);
  }
  next();
});

// CSRF 简化保护: 对所有非 GET/HEAD/OPTIONS 请求校验 Origin/Referer
// 在 sameSite=lax cookie 的基础上再加一层防御
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use((req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // 无 Origin 的非安全请求：若携带认证凭证（cookie 或 Bearer）则拒绝（防 CSRF 纵深防御）；
    // 否则放行（curl / 内部服务等无浏览器上下文的调用）
    const hasCredentials = req.cookies?.['mg_token'] ||
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer '));
    if (hasCredentials) {
      console.warn(`[CSRF] 无 Origin 但携带凭证的非安全请求被拒绝: ${req.method} ${req.path}`);
      return res.status(403).json({ error: '跨站请求被拒绝 (CSRF)' });
    }
    return next();
  }
  try {
    const url = new URL(origin);
    const allowed = (process.env.ALLOWED_ORIGINS || [
      'http://localhost:13001',
      'http://localhost:13002',
      'http://localhost:5173',
      'http://127.0.0.1:13001',
      'http://127.0.0.1:13002',
      'http://127.0.0.1:5173'
    ].join(','));
    const allowedHosts = allowed.split(',').map(s => s.trim());
    if (allowedHosts.includes(`${url.protocol}//${url.host}`)) {
      return next();
    }
    console.warn(`[CSRF] 拒绝来源: ${origin}`);
    return res.status(403).json({ error: '跨站请求被拒绝 (CSRF)' });
  } catch {
    return next();  // 无法解析 origin 时放行(交给 sameSite 防御)
  }
});

import { errorHandler } from './middleware/errorHandler.js';

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
    // 跳过 API 请求、根路径和健康检查（健康检查必须直达后端）
    if (req.path.startsWith('/api') || req.path === '/' || req.path === '/health') {
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
      
      // SPA 路由支持：将所有非 API 路由回退到 index.html
      app.get('*', (req, res) => {
        // /api 路径不应回退到 SPA（未匹配的 API 请求交给 errorHandler 返回 JSON 404）
        if (req.path.startsWith('/api')) {
          return res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
        }
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

// 健康检查端点 - 增强:实际探测各依赖
app.get('/health', async (req, res) => {
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    checks: {}
  };

  // 1. 数据库探活（不泄露内部错误细节）
  try {
    const dbState = db.prepare('SELECT 1 as ok').get();
    status.checks.database = dbState?.ok === 1 ? 'ok' : 'fail';
  } catch {
    status.checks.database = 'fail';
    status.status = 'degraded';
  }

  // 2. LLM 配置(API Key 是否存在)
  status.checks.llm_configured = !!process.env.LLM_CLOUD_API_KEY;

  // 3. MCP 状态
  try {
    const { isMCPConnected, isMCPDegraded } = await import('./mcpClient.js');
    status.checks.mcp = {
      connected: isMCPConnected(),
      degraded: isMCPDegraded()
    };
  } catch (e) {
    status.checks.mcp = 'unavailable';
  }

  // 4. 关键环境变量
  status.checks.env = {
    JWT_SECRET: !!process.env.JWT_SECRET,
    ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD
  };

  res.json(status);
});

// 统一错误处理中间件（必须在所有路由、静态文件与 /health 之后注册）
app.use(errorHandler);

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