#!/usr/bin/env node

/**
 * Database Migrator
 *
 * 使用方法:
 *   node migrator.js              # 运行所有待执行迁移
 *   node migrator.js --status     # 查看迁移状态
 *   node migrator.js --rollback   # 回滚最后一个迁移
 *   node migrator.js --fresh      # 重置数据库并重新运行所有迁移
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'backend', 'data', 'knowledge-graph.db');
const MIGRATIONS_DIR = __dirname;

// 获取数据库连接
function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

// 初始化 migrations 表
function initMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// 获取已应用的迁移列表
function getAppliedMigrations(db) {
  const rows = db.prepare('SELECT name FROM _migrations ORDER BY id').all();
  return rows.map(r => r.name);
}

// 获取待执行的迁移列表
function getPendingMigrations(db) {
  const applied = getAppliedMigrations(db);
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.filter(f => !applied.includes(f));
}

// 运行单个迁移
function applyMigration(db, filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf-8');

  console.log(`  Applying: ${filename}`);

  const apply = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(filename);
  });

  try {
    apply();
    console.log(`  ✓ ${filename} applied`);
    return true;
  } catch (error) {
    console.error(`  ✗ ${filename} failed: ${error.message}`);
    throw error;
  }
}

// 回滚最后一个迁移
function rollbackLastMigration(db) {
  const last = db.prepare('SELECT * FROM _migrations ORDER BY id DESC LIMIT 1').get();
  if (!last) {
    console.log('No migrations to rollback');
    return;
  }

  console.log(`Rolling back: ${last.name}`);

  // 注意: SQLite 不支持 DDL 回滚，需要手动编写回滚 SQL
  // 这里只是从 _migrations 表中移除记录
  // 实际回滚需要创建回滚脚本

  console.warn('Warning: Rollback only removes migration record. Manual cleanup may be required.');
  db.prepare('DELETE FROM _migrations WHERE id = ?').run(last.id);
  console.log(`  ✓ Rolled back: ${last.name}`);
}

// 显示迁移状态
function showStatus(db) {
  const applied = getAppliedMigrations(db);
  const pending = getPendingMigrations(db);
  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log('\n=== Migration Status ===\n');
  console.log(`Database: ${DB_PATH}\n`);

  console.log('Applied migrations:');
  if (applied.length === 0) {
    console.log('  (none)');
  } else {
    applied.forEach(m => console.log(`  ✓ ${m}`));
  }

  console.log('\nPending migrations:');
  if (pending.length === 0) {
    console.log('  (none - database is up to date)');
  } else {
    pending.forEach(m => console.log(`  ○ ${m}`));
  }

  console.log(`\nTotal: ${applied.length} applied, ${pending.length} pending`);
}

// 重置数据库
function resetDatabase(db) {
  console.log('Warning: This will drop all tables and re-run all migrations.');
  console.log('Press Ctrl+C to cancel...');

  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('\nProceeding with reset...\n');

      // 获取所有表
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE '_%' AND name NOT LIKE 'sqlite_%'
      `).all();

      // 删除所有表
      db.exec('PRAGMA foreign_keys = OFF');
      const dropAll = db.transaction(() => {
        for (const { name } of tables) {
          console.log(`  Dropping: ${name}`);
          db.exec(`DROP TABLE IF EXISTS ${name}`);
        }
        // 删除 migrations 表
        db.exec('DROP TABLE IF EXISTS _migrations');
      });
      dropAll();
      db.exec('PRAGMA foreign_keys = ON');

      console.log('\nAll tables dropped. Re-running migrations...\n');
      resolve();
    }, 3000);
  });
}

// 运行所有迁移
async function runMigrations() {
  const db = getDb();
  initMigrationsTable(db);

  const pending = getPendingMigrations(db);

  if (pending.length === 0) {
    console.log('Database is already up to date');
    db.close();
    return;
  }

  console.log(`Found ${pending.length} pending migration(s)\n`);

  for (const filename of pending) {
    applyMigration(db, filename);
  }

  console.log(`\n✓ ${pending.length} migration(s) completed`);
  db.close();
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    const db = getDb();
    initMigrationsTable(db);
    showStatus(db);
    db.close();
    return;
  }

  if (args.includes('--rollback')) {
    const db = getDb();
    initMigrationsTable(db);
    rollbackLastMigration(db);
    db.close();
    return;
  }

  if (args.includes('--fresh')) {
    const db = getDb();
    initMigrationsTable(db);
    await resetDatabase(db);
    initMigrationsTable(db);
    // 重新运行所有迁移
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    for (const filename of files) {
      applyMigration(db, filename);
    }
    console.log(`\n✓ ${files.length} migration(s) completed (fresh reset)`);
    db.close();
    return;
  }

  // 默认: 运行迁移
  await runMigrations();
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
