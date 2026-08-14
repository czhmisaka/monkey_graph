/**
 * 单元测试: AES-GCM 加解密、redactSecrets、JWT
 * 运行: node --test tests/unit.test.js
 *
 * 注意: 本测试直接 import 真实实现（database.js / auth.js），
 *       使用测试专用密钥与临时数据库文件，不影响生产数据。
 */

process.env.ENCRYPTION_KEY = '8f3a1c9e2b7d4f6a0c5e8b2d9f1a7c3e5b8d2f4a6c0e9b1d3f5a7c9e2b4d6f8a';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
process.env.DB_PATH = process.env.TEST_DB_PATH || ':memory:';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

let encryptAPIKey, decryptAPIKey, redactSecrets;

before(async () => {
  const dbModule = await import('../src/database.js');
  encryptAPIKey = dbModule.encryptAPIKey;
  decryptAPIKey = dbModule.decryptAPIKey;
  const authModule = await import('../src/auth.js');
  redactSecrets = authModule.redactSecrets;
});

test('AES-GCM: 加解密可逆', () => {
  const plain = 'sk-cp-test-1234567890abcdef';
  const ct = encryptAPIKey(plain);
  assert.ok(ct.startsWith('gcm1:'), '应输出 gcm1 前缀格式');
  const pt = decryptAPIKey(ct);
  assert.equal(pt, plain);
});

test('AES-GCM: 密文篡改应返回 null（认证失败）', () => {
  const ct = encryptAPIKey('test');
  const tampered = ct.slice(0, -2) + 'ff';
  const result = decryptAPIKey(tampered);
  assert.equal(result, null);
});

test('AES-GCM: 每次加密产生不同 IV（随机性）', () => {
  const a = encryptAPIKey('same');
  const b = encryptAPIKey('same');
  assert.notEqual(a, b);
});

test('AES-GCM: 非法输入返回空/null', () => {
  assert.equal(encryptAPIKey(''), '');
  assert.equal(decryptAPIKey(''), '');
  assert.equal(decryptAPIKey('garbage-not-valid-format'), null);
});

test('redactSecrets: 顶层敏感字段', () => {
  const input = { apiKey: 'sk-123', password: 'pw', name: 'foo' };
  const out = redactSecrets(input);
  assert.equal(out.apiKey, '[REDACTED]');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.name, 'foo');
});

test('redactSecrets: 嵌套对象', () => {
  const input = { user: { name: 'alice', password: 'pw', token: 'tk' } };
  const out = redactSecrets(input);
  assert.equal(out.user.password, '[REDACTED]');
  assert.equal(out.user.token, '[REDACTED]');
  assert.equal(out.user.name, 'alice');
});

test('redactSecrets: 数组递归', () => {
  const input = [{ api_key: 'a' }, { api_key: 'b', other: 1 }];
  const out = redactSecrets(input);
  assert.equal(out[0].api_key, '[REDACTED]');
  assert.equal(out[1].api_key, '[REDACTED]');
  assert.equal(out[1].other, 1);
});

test('redactSecrets: 大小写不敏感 + 多种命名', () => {
  const input = { API_KEY: 'a', ApiKey: 'b', apikey: 'c', 'x-api-key': 'd' };
  const out = redactSecrets(input);
  assert.equal(out.API_KEY, '[REDACTED]');
  assert.equal(out.ApiKey, '[REDACTED]');
  assert.equal(out.apikey, '[REDACTED]');
  assert.equal(out['x-api-key'], '[REDACTED]');
});

test('redactSecrets: 深度限制', () => {
  const deep = { a: { b: { c: { d: { e: { f: 'deep' } } } } } };
  const out = redactSecrets(deep);
  // e 位于 depth 5，其子字段 f 触发 depth>5 限制
  assert.equal(out.a.b.c.d.e.f, '[DEPTH_LIMIT]');
});

test('JWT: 含 exp 字段', () => {
  const SECRET = process.env.JWT_SECRET;
  const token = jwt.sign({ id: 'u1' }, SECRET, { expiresIn: '1h' });
  const decoded = jwt.verify(token, SECRET);
  assert.ok(decoded.exp, '应有 exp 字段');
  assert.ok(decoded.exp > Math.floor(Date.now() / 1000), 'exp 应在未来');
});

test('JWT: 过期 token 验证失败', async () => {
  const SECRET = process.env.JWT_SECRET;
  const token = jwt.sign({ id: 'u1' }, SECRET, { expiresIn: '1ms' });
  // 等待过期生效
  await new Promise(r => setTimeout(r, 50));
  assert.throws(() => jwt.verify(token, SECRET), /expired/i);
});
