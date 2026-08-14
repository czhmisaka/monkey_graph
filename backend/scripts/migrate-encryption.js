#!/usr/bin/env node
/**
 * 加密密钥迁移脚本（与 database.js 的 encryptAPIKey/decryptAPIKey 格式完全兼容）
 *
 * 用途:
 *   1. 密钥轮换：用新 ENCRYPTION_KEY 重加密所有 user_llm_configs.api_key
 *   2. 兼容旧 AES-256-CBC（iv:ct 2 段）与当前 AES-256-GCM（gcm1:iv:tag:ct 4 段）
 *
 * 使用方法:
 *   OLD_ENCRYPTION_KEY=<旧密钥> NEW_ENCRYPTION_KEY=<新密钥> node scripts/migrate-encryption.js [--dry-run] [--verbose]
 *
 * 注意:
 *   - 若只需把旧 CBC 迁移为当前 GCM（同一把 KEY），可不设 NEW_ENCRYPTION_KEY
 *   - 密文格式必须与 backend/src/database.js 的 encryptAPIKey 保持一致：
 *     gcm1:<iv-hex>:<authTag-hex>:<ciphertext-hex>（AAD = 'user_llm_config'）
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'knowledge-graph.db');

// 命令行参数
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
加密密钥迁移脚本（兼容 database.js 的 gcm1 格式）

用法:
  OLD_ENCRYPTION_KEY=<旧密钥> [NEW_ENCRYPTION_KEY=<新密钥>] node scripts/migrate-encryption.js [选项]

选项:
  --dry-run   只显示将要进行的更改，不实际修改数据库
  --verbose   显示详细的处理信息
  --help, -h  显示此帮助信息

环境变量:
  OLD_ENCRYPTION_KEY  旧加密密钥 (必需)
  NEW_ENCRYPTION_KEY  新加密密钥 (可选；不设置则用同一把 KEY 把旧 CBC 迁移为 GCM)
`);
  process.exit(0);
}

const log = (...a) => console.log('[迁移]', ...a);
const info = (...a) => console.log('[INFO]', ...a);
const warn = (...a) => console.warn('[WARN]', ...a);
const error = (...a) => console.error('[ERROR]', ...a);

// 与 database.js resolveEncryptionKey 保持一致
function resolveKey(raw) {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex').subarray(0, 32);
  }
  return Buffer.from(raw.slice(0, 32).padEnd(32, '0').slice(0, 32), 'utf8');
}

const GCM_AAD = Buffer.from('user_llm_config');
const IV_LENGTH_GCM = 12;

function decryptKey(text, keyBuf) {
  if (!text) return '';
  if (text.startsWith('gcm1:')) {
    const parts = text.split(':');
    if (parts.length !== 4) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(parts[1], 'hex'));
    decipher.setAAD(GCM_AAD);
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
  }
  // 旧 CBC: iv:ct (2 段)
  const parts = text.split(':');
  if (parts.length !== 2) return null;
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, Buffer.from(parts[0], 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[1], 'hex')), decipher.final()]).toString('utf8');
}

function encryptKey(text, keyBuf) {
  const iv = crypto.randomBytes(IV_LENGTH_GCM);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  cipher.setAAD(GCM_AAD);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function migrate() {
  const OLD_KEY = process.env.OLD_ENCRYPTION_KEY;
  const NEW_KEY = process.env.NEW_ENCRYPTION_KEY;
  if (!OLD_KEY) {
    error('OLD_ENCRYPTION_KEY 环境变量未设置');
    process.exit(1);
  }
  const oldKeyBuf = resolveKey(OLD_KEY);
  const newKeyBuf = NEW_KEY ? resolveKey(NEW_KEY) : oldKeyBuf;
  const rotating = !!NEW_KEY;

  log(`模式: ${DRY_RUN ? '预览 (dry-run)' : '实际执行'}`);
  log(`密钥: ${rotating ? '轮换（旧 → 新）' : '同 KEY 迁移 CBC → GCM'}`);
  log('');

  if (!fs.existsSync(dbPath)) {
    error(`数据库文件不存在: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: false });

  try {
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_llm_configs'").get();
    if (!tableInfo) {
      warn('user_llm_configs 表不存在，无需迁移');
      return;
    }

    const configs = db.prepare('SELECT id, user_id, api_key FROM user_llm_configs WHERE api_key IS NOT NULL AND api_key != ""').all();
    if (configs.length === 0) {
      info('没有需要迁移的 API Key');
      return;
    }

    log(`找到 ${configs.length} 条 API Key 记录`);
    log('');

    let toMigrate = 0;
    let alreadyNew = 0;
    let failed = 0;
    const toUpdate = [];

    for (const config of configs) {
      const { id, user_id, api_key } = config;
      if (VERBOSE) info(`处理记录 ID: ${id}, User: ${user_id}`);

      // 已是新 KEY 的 GCM 格式则跳过（解密验证一次）
      if (!rotating && api_key.startsWith('gcm1:')) {
        const check = decryptKey(api_key, oldKeyBuf);
        if (check !== null && check !== '') {
          alreadyNew++;
          continue;
        }
      }

      const plaintext = decryptKey(api_key, oldKeyBuf);
      if (plaintext === null) {
        error(`解密失败: ${id}`);
        failed++;
        continue;
      }

      const newEncrypted = encryptKey(plaintext, newKeyBuf);
      if (VERBOSE) info(`  新格式: ${newEncrypted.substring(0, 50)}...`);
      toMigrate++;
      toUpdate.push({ id, newEncrypted });
    }

    log('');
    log('=== 迁移统计 ===');
    log(`总计记录: ${configs.length}`);
    log(`已是新格式: ${alreadyNew}`);
    log(`需要迁移: ${toMigrate}`);
    log(`迁移失败: ${failed}`);
    log('');

    if (toUpdate.length === 0) {
      info('没有需要迁移的记录');
      return;
    }

    if (DRY_RUN) {
      log('=== 预览模式：将要执行的更新 ===');
      for (const { id } of toUpdate) {
        info(`UPDATE user_llm_configs SET api_key = <新密文> WHERE id = '${id}'`);
      }
      log('');
      info('使用 --dry-run 参数预览，实际执行请移除此参数');
    } else {
      log('开始执行迁移...');
      const updateStmt = db.prepare('UPDATE user_llm_configs SET api_key = ? WHERE id = ?');
      const migrateTransaction = db.transaction((records) => {
        for (const { id, newEncrypted } of records) {
          updateStmt.run(newEncrypted, id);
        }
      });
      migrateTransaction(toUpdate);
      log(`迁移完成！已更新 ${toUpdate.length} 条记录`);
      if (rotating) {
        info('请将新 ENCRYPTION_KEY 写入 backend/.env 后重启服务');
      }
    }
  } finally {
    db.close();
  }
}

migrate();
