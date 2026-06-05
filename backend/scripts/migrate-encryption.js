#!/usr/bin/env node
/**
 * 加密算法迁移脚本
 *
 * 将用户 LLM API Key 的加密算法从 AES-256-CBC 升级为 ChaCha20-Poly1305
 *
 * 使用方法:
 *   node scripts/migrate-encryption.js [--dry-run] [--verbose]
 *
 * 选项:
 *   --dry-run   只显示将要进行的更改，不实际修改数据库
 *   --verbose   显示详细的处理信息
 *
 * 环境变量:
 *   ENCRYPTION_KEY          加密密钥 (必需)
 *   ENCRYPTION_ALGORITHM    目标加密算法 (默认: chacha20-poly1305)
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';

// 配置
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'knowledge-graph.db');

// 命令行参数
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
加密算法迁移脚本

将用户 LLM API Key 的加密算法从 AES-256-CBC 升级为 ChaCha20-Poly1305

使用方法:
  node scripts/migrate-encryption.js [选项]

选项:
  --dry-run   只显示将要进行的更改，不实际修改数据库
  --verbose   显示详细的处理信息
  --help, -h  显示此帮助信息

环境变量:
  ENCRYPTION_KEY   加密密钥 (必需)
`);
  process.exit(0);
}

// 日志函数
const log = (...args) => console.log('[迁移]', ...args);
const info = (...args) => console.log('[INFO]', ...args);
const warn = (...args) => console.warn('[WARN]', ...args);
const error = (...args) => console.error('[ERROR]', ...args);

// 加载环境变量
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  error('ENCRYPTION_KEY 环境变量未设置');
  error('请在 .env 文件中配置或设置环境变量: export ENCRYPTION_KEY=your_key');
  process.exit(1);
}

const TARGET_ALGORITHM = process.env.ENCRYPTION_ALGORITHM || 'chacha20-poly1305';
const AES_KEY = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0').slice(0, 32));
const CHACHA_KEY = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0').slice(0, 32));

// 格式前缀
const FORMAT_PREFIX_AES = 'aes:';
const FORMAT_PREFIX_CHACHA = 'chacha:';
const AES_IV_LENGTH = 16;
const CHACHA_NONCE_LENGTH = 12;

/**
 * 使用 AES-256-CBC 解密 (旧格式)
 */
function decryptAES(text) {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return null;

    let prefix = parts[0];
    let encryptedText = parts[1];

    // 提取 IV
    let iv;
    if (text.startsWith(FORMAT_PREFIX_AES)) {
      iv = Buffer.from(prefix.slice(FORMAT_PREFIX_AES.length), 'hex');
    } else {
      iv = Buffer.from(prefix, 'hex');
    }

    if (iv.length !== AES_IV_LENGTH) return null;

    const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

/**
 * 使用 ChaCha20-Poly1305 加密
 */
function encryptChaCha(plaintext) {
  const nonce = crypto.randomBytes(CHACHA_NONCE_LENGTH);
  const cipher = crypto.createCipheriv('chacha20-poly1305', CHACHA_KEY, nonce);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return FORMAT_PREFIX_CHACHA + nonce.toString('hex') + ':' + encrypted;
}

/**
 * 检测是否为 ChaCha20-Poly1305 格式
 */
function isChaChaFormat(text) {
  if (!text) return false;
  if (text.startsWith(FORMAT_PREFIX_CHACHA)) return true;

  // 检测是否为 12 字节 nonce (24 hex chars)
  const parts = text.split(':');
  if (parts.length !== 2) return false;

  const prefix = parts[0];
  if (prefix.length === 24) {
    // 可能是 ChaCha (无前缀) 或 AES (无前缀但 32 hex chars)
    // 如果是 24 hex chars 且不以 aes: 开头，很可能是 ChaCha
    return !text.startsWith(FORMAT_PREFIX_AES);
  }
  return false;
}

/**
 * 检测是否为 AES 格式
 */
function isAESFormat(text) {
  if (!text) return false;
  if (text.startsWith(FORMAT_PREFIX_AES)) return true;

  const parts = text.split(':');
  if (parts.length !== 2) return false;

  const prefix = parts[0];
  // AES IV 是 16 字节 = 32 hex chars
  return prefix.length === 32 && !text.startsWith(FORMAT_PREFIX_CHACHA);
}

// 主迁移逻辑
async function migrate() {
  log(`开始加密算法迁移 (目标: ${TARGET_ALGORITHM})`);
  log(`模式: ${DRY_RUN ? '预览 (dry-run)' : '实际执行'}`);
  log('');

  // 检查数据库文件
  if (!fs.existsSync(dbPath)) {
    error(`数据库文件不存在: ${dbPath}`);
    process.exit(1);
  }

  // 连接数据库
  const db = new Database(dbPath, { readonly: false });

  try {
    // 检查 user_llm_configs 表
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_llm_configs'").get();
    if (!tableInfo) {
      warn('user_llm_configs 表不存在，无需迁移');
      return;
    }

    // 获取所有 LLM 配置
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

      if (VERBOSE) {
        info(`处理记录 ID: ${id}, User: ${user_id}`);
        info(`  原始值: ${api_key.substring(0, 50)}...`);
      }

      // 检测格式
      if (isChaChaFormat(api_key)) {
        if (VERBOSE) info(`  状态: 已是 ChaCha20-Poly1305 格式，跳过`);
        alreadyNew++;
        continue;
      }

      if (isAESFormat(api_key)) {
        if (VERBOSE) info(`  状态: AES-256-CBC 格式，需要迁移`);
        toMigrate++;

        // 解密旧格式
        const plaintext = decryptAES(api_key);
        if (plaintext === null) {
          error(`  解密失败: ${id}`);
          failed++;
          continue;
        }

        // 加密为新格式
        const newEncrypted = encryptChaCha(plaintext);

        if (VERBOSE) {
          info(`  解密成功`);
          info(`  新格式: ${newEncrypted.substring(0, 50)}...`);
        }

        toUpdate.push({ id, newEncrypted });
      } else {
        warn(`  无法识别格式，跳过: ${api_key.substring(0, 30)}...`);
        failed++;
      }
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

    // 执行迁移
    if (DRY_RUN) {
      log('=== 预览模式：将要执行的更新 ===');
      for (const { id, newEncrypted } of toUpdate) {
        info(`UPDATE user_llm_configs SET api_key = '${newEncrypted}' WHERE id = '${id}'`);
      }
      log('');
      info('使用 --dry-run 参数预览，实际执行请移除此参数');
    } else {
      log('开始执行迁移...');

      const updateStmt = db.prepare('UPDATE user_llm_configs SET api_key = ? WHERE id = ?');
      const migrateTransaction = db.transaction((records) => {
        for (const { id, newEncrypted } of records) {
          updateStmt.run(newEncrypted, id);
          info(`已迁移: ${id}`);
        }
      });

      migrateTransaction(toUpdate);

      log('');
      info(`迁移完成！已更新 ${toUpdate.length} 条记录`);
      info('建议: 迁移完成后，将 ENCRYPTION_ALGORITHM=chacha20-poly1305 添加到 .env 文件');
    }

  } finally {
    db.close();
  }
}

migrate().catch(err => {
  error('迁移过程出错:', err);
  process.exit(1);
});
