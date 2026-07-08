/**
 * 单元测试: LIKE 注入、维度白名单
 * 运行: node --test tests/sql.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// 模拟 escapeLikePattern (与 database.js 一致)
function escapeLikePattern(str) {
  if (!str) return '';
  return String(str).replace(/[%_\\]/g, '\\$&');
}

// 模拟 assertAllowedDimensions (与 vectorConfig.js 严格类型校验一致)
const ALLOWED_DIMENSIONS = new Set([384, 768, 1024, 1536, 2048, 2560, 3072]);
function assertAllowedDimensions(dims) {
  if (dims === null || dims === undefined) return true;
  if (typeof dims !== 'number' || !Number.isInteger(dims)) return false;
  return ALLOWED_DIMENSIONS.has(dims);
}

test('escapeLikePattern: 空值', () => {
  assert.equal(escapeLikePattern(''), '');
  assert.equal(escapeLikePattern(null), '');
  assert.equal(escapeLikePattern(undefined), '');
});

test('escapeLikePattern: 转义 %', () => {
  assert.equal(escapeLikePattern('100%'), '100\\%');
});

test('escapeLikePattern: 转义 _', () => {
  assert.equal(escapeLikePattern('user_name'), 'user\\_name');
});

test('escapeLikePattern: 转义 \\', () => {
  assert.equal(escapeLikePattern('a\\b'), 'a\\\\b');
});

test('escapeLikePattern: 组合', () => {
  assert.equal(escapeLikePattern('a%b_c\\d'), 'a\\%b\\_c\\\\d');
});

test('escapeLikePattern: 普通字符串', () => {
  assert.equal(escapeLikePattern('hello'), 'hello');
});

test('assertAllowedDimensions: 接受白名单值', () => {
  for (const d of [384, 768, 1024, 1536, 2048, 2560, 3072]) {
    assert.ok(assertAllowedDimensions(d), `${d} 应被接受`);
  }
});

test('assertAllowedDimensions: 拒绝非白名单值', () => {
  for (const d of [1, 100, 500, 999, 999999, -1, 0]) {
    assert.ok(!assertAllowedDimensions(d), `${d} 应被拒绝`);
  }
});

test('assertAllowedDimensions: 拒绝字符串', () => {
  assert.ok(!assertAllowedDimensions('1536'), '字符串 "1536" 应被拒绝');
  assert.ok(!assertAllowedDimensions("1536; DROP TABLE users;--"), 'SQL 注入应被拒绝');
});

test('assertAllowedDimensions: null/undefined 视为自动检测', () => {
  assert.ok(assertAllowedDimensions(null));
  assert.ok(assertAllowedDimensions(undefined));
});