/**
 * 单元测试: AES-GCM 加解密、redactSecrets、JWT
 * 运行: node --test tests/unit.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// 模拟 encryptAPIKey / decryptAPIKey (与 database.js 中的实现保持一致)
const ENCRYPTION_KEY = '9b5cd65af5a0011b7bf93f74a2be2b3eb443d4981cf0b87c0bade53d75528898';
const KEY_BUF = Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32);
const GCM_AAD = Buffer.from('user_llm_config');

function encryptAPIKey(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUF, iv);
  cipher.setAAD(GCM_AAD);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decryptAPIKey(text) {
  if (!text.startsWith('gcm1:')) return null;
  const parts = text.split(':');
  if (parts.length !== 4) return null;
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const ctBuf = Buffer.from(parts[3], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUF, iv);
  decipher.setAAD(GCM_AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ctBuf), decipher.final()]).toString('utf8');
}

// 模拟 redactSecrets (与 auth.js 一致)
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i, /token/i, /password/i, /secret/i,
  /^authorization$/i, /^cookie$/i
];

function redactSecrets(obj, depth = 0) {
  if (depth > 5) return '[DEPTH_LIMIT]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => redactSecrets(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_PATTERNS.some(p => p.test(k))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out;
}

test('AES-GCM: 加解密可逆', () => {
  const plain = 'sk-cp-test-1234567890abcdef';
  const ct = encryptAPIKey(plain);
  const pt = decryptAPIKey(ct);
  assert.equal(pt, plain);
});

test('AES-GCM: 密文篡改应抛错', () => {
  const ct = encryptAPIKey('test');
  const tampered = ct.slice(0, -2) + 'ff';
  assert.throws(() => decryptAPIKey(tampered));
});

test('AES-GCM: 每次加密产生不同 IV', () => {
  const a = encryptAPIKey('same');
  const b = encryptAPIKey('same');
  assert.notEqual(a, b);
});

test('AES-GCM: 旧 CBC 格式返回 null', () => {
  const cbc = '0123456789abcdef0123456789abcdef:abcdef0123456789abcdef0123456789';
  assert.equal(decryptAPIKey(cbc), null);
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

test('JWT: 含 exp 字段', () => {
  process.env.JWT_SECRET = 'test-secret';
  const SECRET = process.env.JWT_SECRET;
  const token = jwt.sign({ id: 'u1' }, SECRET, { expiresIn: '1h' });
  const decoded = jwt.verify(token, SECRET);
  assert.ok(decoded.exp, '应有 exp 字段');
  assert.ok(decoded.exp > Math.floor(Date.now() / 1000), 'exp 应在未来');
});

test('JWT: 过期 token 验证失败', () => {
  process.env.JWT_SECRET = 'test-secret';
  const SECRET = process.env.JWT_SECRET;
  const token = jwt.sign({ id: 'u1' }, SECRET, { expiresIn: '0s' });
  // 等待 1s 让过期生效
  setTimeout(() => {
    assert.throws(() => jwt.verify(token, SECRET), /expired/i);
  }, 1100);
});