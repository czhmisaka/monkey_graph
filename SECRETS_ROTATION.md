# Secrets Rotation Guide

> ⚠️ **状态**：本轮修复不轮换密钥（用户决定保留当前 `.env`）。本文档作为执行清单，供后续任何时刻手动执行。

## 背景

`backend/.env` 当前以**明文**形式包含三组高敏感凭据：

| 变量 | 类型 | 当前风险 |
|---|---|---|
| `LLM_CLOUD_API_KEY` | MiniMax API 密钥 | 任何人读取本地磁盘即可调用 LLM 计费 |
| `JWT_SECRET` | 用户会话签名密钥 | 伪造任意用户 JWT Token |
| `ENCRYPTION_KEY` | 用户 LLM API Key 加密密钥 | 解密所有用户的 LLM 配置 |

`.env` 文件已被 `.gitignore` 正确忽略（不会进 git 历史），但**磁盘上仍然明文**。一旦发生机器失陷、日志泄露、备份被拷贝，均会暴露。

## 轮换顺序

三个密钥必须**按顺序轮换**，每一步完成后验证通过再做下一步：

1. `LLM_CLOUD_API_KEY` — 先停服务、更新 `.env`、重启、再做下一步
2. `JWT_SECRET` — 所有现有用户 token 立即失效（**预期**）
3. `ENCRYPTION_KEY` — **最敏感**，因为现有数据库中所有 `user_llm_configs.api_key` 是用旧 KEY 加密的；必须先迁移数据

---

## Step 1: 轮换 `LLM_CLOUD_API_KEY` (MiniMax)

### 1.1 在 MiniMax 控制台重置

1. 登录 MiniMax 平台
2. 进入 API Keys 管理 → 重置 / 重新生成
3. 复制新 key（形如 `sk-cp-...`）

### 1.2 在服务器更新

```bash
cd /Users/chenzhihan/Desktop/test/czh_graph/backend
# 备份当前 .env（仅本地保留，不要进 git）
cp .env .env.bak-$(date +%Y%m%d-%H%M%S)

# 用编辑器替换 LLM_CLOUD_API_KEY= 后面的整行
nano .env
```

### 1.3 重启服务

```bash
# 在项目根目录
./start.sh
# 或 docker
docker compose restart app
```

### 1.4 验证

- 在管理后台走一次对话 → 应正常返回
- 旧 key 调用 `/v1/chat/completions` → 返回 401

---

## Step 2: 轮换 `JWT_SECRET`

### 2.1 生成新密钥

```bash
# 推荐：base64 48 字符（256 位熵）
openssl rand -base64 48
```

### 2.2 更新 `.env`

```bash
# 替换 JWT_SECRET= 后面的整行
nano .env
```

### 2.3 重启 + 验证

```bash
./start.sh
```

- 所有用户必须重新登录（预期，token 全部失效）
- 浏览器刷新页面应被踢回登录页
- DevTools → Network 任意调用 → 应返回 401

---

## Step 3: 轮换 `ENCRYPTION_KEY` ⚠️ 最危险

### 3.1 约束

`backend/src/database.js` 中的 `encryptAPIKey` 历史上使用了：

```js
Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0').slice(0, 32))
```

实际取的是 `ENCRYPTION_KEY` 前 32 个字符（不足则用 `'0'` 填充）。

**新策略**：改用 `Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32)`，要求 `ENCRYPTION_KEY` 是 **64 字符的 hex 字符串**（= 32 字节 = 256 位）。

### 3.2 生成新密钥

```bash
openssl rand -hex 32
# 输出形如：9b5cd65af5a0011b7bf93f74a2be2b3eb443d4981cf0b87c0bade53d75528898
```

### 3.3 迁移现有数据（必须先做）

数据库 `user_llm_configs.api_key_encrypted` 列当前用旧 KEY 加密。直接换 KEY 会导致所有用户的 LLM 配置无法解密。

**方案 A: 一次性迁移脚本**（推荐）

执行以下脚本（先用旧 KEY 解密，再用新 KEY 重加密）：

```js
// scripts/migrate-encryption-key.js
import crypto from 'crypto';
import Database from 'better-sqlite3';

const OLD_KEY = process.env.OLD_ENCRYPTION_KEY;
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY;
const DB_PATH = process.env.DB_PATH || './backend/data/knowledge-graph.db';

if (!OLD_KEY || !NEW_KEY) {
  console.error('需设置 OLD_ENCRYPTION_KEY 与 NEW_ENCRYPTION_KEY');
  process.exit(1);
}

const oldKeyBuf = Buffer.from(OLD_KEY.slice(0, 32).padEnd(32, '0').slice(0, 32));
const newKeyBuf = Buffer.from(NEW_KEY, 'hex').subarray(0, 32);

const db = new Database(DB_PATH);
const rows = db.prepare('SELECT id, api_key_encrypted FROM user_llm_configs WHERE api_key_encrypted IS NOT NULL').all();

function decryptOld(blob) {
  const [ivHex, ctHex] = blob.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', oldKeyBuf, iv);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function encryptNew(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', newKeyBuf, iv);
  cipher.setAAD(Buffer.from('user_llm_config'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

const txn = db.transaction(() => {
  let ok = 0, fail = 0;
  for (const row of rows) {
    try {
      const plain = decryptOld(row.api_key_encrypted);
      const newBlob = encryptNew(plain);
      db.prepare('UPDATE user_llm_configs SET api_key_encrypted = ? WHERE id = ?').run(newBlob, row.id);
      ok++;
    } catch (e) {
      console.error(`[FAIL] id=${row.id}: ${e.message}`);
      fail++;
    }
  }
  console.log(`完成: ${ok} 成功, ${fail} 失败`);
});
txn();
db.close();
```

执行：

```bash
cd /Users/chenzhihan/Desktop/test/czh_graph
OLD_ENCRYPTION_KEY=<旧的 .env 中的值> \
NEW_ENCRYPTION_KEY=<新生成的 hex 64 字符> \
node scripts/migrate-encryption-key.js
```

### 3.4 验证迁移

```bash
# 抽查一行解密是否成功（需先启动服务，在管理后台看 LLM 配置是否正常显示）
./start.sh
# 浏览器 → 管理 → LLM 配置 → 应该看到已保存的 provider 和模型
```

### 3.5 替换 `.env` 中的 `ENCRYPTION_KEY`

```bash
nano backend/.env
# 把 ENCRYPTION_KEY= 后面的整行替换为新值
```

### 3.6 重启

```bash
./start.sh
```

---

## Step 4: 验证整体

| 项目 | 命令 / 现象 |
|---|---|
| 服务启动 | `./start.sh` 无错误 |
| 登录 | admin + ADMIN_PASSWORD 登录成功 |
| LLM 对话 | 走一轮对话，返回正常 |
| 用户 LLM 配置 | 已保存的 provider/model 仍可解密 |
| 旧 JWT | 任意请求 → 401 |
| 旧 LLM Key | 调用 MiniMax API → 401 |

---

## Step 5: 清理

```bash
# 删除临时备份（确认无误后）
rm backend/.env.bak-*

# 永远不要把 .env 进 git（已 .gitignore）
```

---

## 紧急回滚

如果新密钥出问题，立即回滚：

```bash
# 1. 停服务
./start.sh stop || pkill -f "node src/index.js"

# 2. 还原 .env
cp .env.bak-<timestamp> .env

# 3. 如果是 ENCRYPTION_KEY 出问题：恢复旧 .env 后，跑 migrate-encryption-key.js 反向迁移
# （旧 → 新），重新启动

# 4. 重启
./start.sh
```

---

## 长期建议

- [ ] 把 `.env` 改用 [Doppler](https://www.doppler.com/) / [Infisical](https://infisical.com/) 等密钥管理服务
- [ ] 给 `.env` 文件加 `chmod 600` 权限（仅 owner 可读写）
- [ ] 季度轮换 `JWT_SECRET` 与 `ENCRYPTION_KEY`
- [ ] 启用 MiniMax 控制台的 IP 白名单 + 速率告警