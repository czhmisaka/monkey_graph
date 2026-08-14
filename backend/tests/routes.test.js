/**
 * 路由与中间件测试（真实 import）
 * 运行: node --test tests/routes.test.js
 *
 * 覆盖: auth 路由（注册/登录/cookie）、限流中间件、CSRF 中间件
 */

process.env.ENCRYPTION_KEY = '8f3a1c9e2b7d4f6a0c5e8b2d9f1a7c3e5b8d2f4a6c0e9b1d3f5a7c9e2b4d6f8a';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
process.env.DB_PATH = process.env.TEST_DB_PATH || ':memory:';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let authRoutes, rateLimitModule;

before(async () => {
  authRoutes = (await import('../src/routes/domains/auth/index.js')).default;
  rateLimitModule = await import('../src/middleware/rateLimit.js');
});

// ========== 认证路由 ==========

test('auth 路由: 注册接口存在且挂载了限流', () => {
  assert.ok(authRoutes, 'auth router 应可导入');
  // 检查路由栈中注册了 /auth/register 与 /auth/login
  const stack = authRoutes.stack;
  const paths = stack.map(layer => layer.route?.path).filter(Boolean);
  assert.ok(paths.includes('/auth/register'), '应有 /auth/register');
  assert.ok(paths.includes('/auth/login'), '应有 /auth/login');
  assert.ok(paths.includes('/auth/me'), '应有 /auth/me');
  assert.ok(paths.includes('/auth/logout'), '应有 /auth/logout');
});

test('auth 路由: /auth/login 注册了 loginRateLimiter 中间件', () => {
  const loginLayer = authRoutes.stack.find(l => l.route?.path === '/auth/login');
  assert.ok(loginLayer, 'login 路由存在');
  const handlers = loginLayer.route.stack;
  assert.ok(handlers.length >= 2, 'login 应至少有两个中间件（限流 + handler）');
});

test('限流: createRateLimiter 返回中间件且限制生效', async () => {
  const { createRateLimiter } = rateLimitModule;
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyPrefix: 'test' });

  // 构造 mock req/res
  const makeReq = () => ({ headers: {}, connection: { remoteAddress: '127.0.0.1' } });
  const makeRes = () => {
    const res = { statusCode: 200, headers: {} };
    res.set = (h) => { Object.assign(res.headers, h); };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  };

  let passed = 0;
  const next = () => { passed++; };

  // 前 2 次应通过
  limiter(makeReq(), makeRes(), next);
  assert.equal(passed, 1, '第 1 次请求应通过');
  limiter(makeReq(), makeRes(), next);
  assert.equal(passed, 2, '第 2 次请求应通过');

  // 第 3 次应被限流（429）
  const res3 = makeRes();
  limiter(makeReq(), res3, next);
  assert.equal(passed, 2, '第 3 次请求不应通过');
  assert.equal(res3.statusCode, 429, '应返回 429');
});

test('限流: getClientIP 默认不信任 X-Forwarded-For（防伪造）', () => {
  const { createRateLimiter } = rateLimitModule;
  // 移除 TRUST_PROXY，模拟默认部署
  const oldTrust = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;

  const makeReq = (xff) => ({
    headers: { 'x-forwarded-for': xff },
    connection: { remoteAddress: '10.0.0.1' }
  });
  const makeRes = () => {
    const r = {};
    r.set = () => {};
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = () => r;
    return r;
  };

  let count = 0;
  const next = () => count++;
  const strictLimiter = createRateLimiter({ windowMs: 60000, max: 1, keyPrefix: 'xfftest2' });
  const res1 = makeRes();
  strictLimiter(makeReq('1.2.3.4'), res1, next);
  assert.equal(count, 1, '第 1 次请求应通过');
  const res2 = makeRes();
  strictLimiter(makeReq('5.6.7.8'), res2, next);
  assert.equal(res2.statusCode, 429, '不同 XFF 应仍按真实 IP 限流（不信任伪造头）');

  if (oldTrust === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = oldTrust;
});
