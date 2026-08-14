# MonkeyGraph 代码审查与修复任务计划

> 创建时间: 2026-07-21 10:02  
> 最后更新: 2026-07-21 10:15  
> 基于: 2026-07-21 全面代码审查（5个并行审查）  
> 状态: 阶段二/四已完成，阶段三/六/七待执行  

---

## ✅ 已完成的审查发现

### 阶段一验证（无需修改 — 已确认完成）
| 任务 | 状态 | 验证结果 |
|------|------|----------|
| T1.1 强制环境变量 | ✅ | `ENCRYPTION_KEY`（database.js:22-24）和 `JWT_SECRET`（auth.js:32-35）均已强制 |
| T1.2 PUT字段白名单 | ✅ | `graphOperations.update()`（database.js:798-821）使用显式字段白名单 |
| T1.3 CORS白名单 | ✅ | `index.js:99-127` 已配置白名单 + CSRF保护 |
| 默认管理员凭据 | ✅ | `index.js:32-64` 强制 ADMIN_PASSWORD >= 12字符 |
| SQL LIKE注入 | ✅ | `database.js:47-50` `escapeLikePattern()` 已添加 |
| 文件上传安全 | ✅ | `_upload.js` MIME 验证已添加 |
| MCP重连竞态 | ✅ | MAX_INIT_ATTEMPTS + 降级模式 |

---

## 📊 进度总览

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| 一、安全加固 | ✅ 已完成 | 100%（已验证，无需修改） |
| 二、内存泄漏修复 | ✅ 已完成 | 100%（4/4） |
| 三、代码重复消除 | ⬜ 待执行 | 0%（大型重构，需单独执行） |
| 四、错误处理与健壮性 | ✅ 已完成 | 100%（4/4） |
| 五、质量提升 | 🔶 部分完成 | 60%（3/5，T5.1/T5.2 待执行） |
| 六、性能优化 | ⬜ 待执行 | 0% |
| 七、测试补充 | ⬜ 待执行 | 0% |

---

## ✅ 阶段二：内存泄漏修复（已完成）

| 任务 | 文件 | 修改 |
|------|------|------|
| T2.1 ✅ | `frontend/src/composables/useClustering.js` | 添加 `onUnmounted` 清理 `setInterval` |
| T2.2 ✅ | `frontend/src/composables/useSearch.js` | 添加 `onUnmounted` 清理定时器 + `AbortController` |
| T2.3 ✅ | `frontend/src/components/Panels/GraphPanel.vue` | 已验证 `onUnmounted` → `forceWorker.terminate()` |
| T2.4 ✅ | `frontend/src/composables/useAuth.js` | `inject('auth')` 添加默认值降级模式 |

---

## ✅ 阶段四：错误处理与健壮性（已完成）

| 任务 | 文件 | 修改 |
|------|------|------|
| T4.1 ✅ | `backend/src/routes/chat.js` | SSE 超时保护（默认 5 分钟）+ 统一 `cleanup()` |
| T4.2 ✅ | 新建 `backend/src/middleware/errorHandler.js` | `errorHandler` + `createHttpError` + 已注册到 `index.js` |
| T4.3 ✅ | `backend/src/services/embeddingService.js` | `sanitizeText()` — MAX_TEXT_LENGTH=8000 + 控制字符移除 |
| T4.4 ✅ | `frontend/src/composables/useSearch.js` | `AbortController` 取消搜索请求 |

---

## 🔶 阶段五：质量提升（部分完成）

| 任务 | 状态 | 说明 |
|------|------|------|
| T5.3 启用 SQLite WAL 模式 | ✅ 已验证 | `database.js` 已设置 `journal_mode = WAL` |
| T5.4 rateLimit 中间件扩展 | ✅ 已完成 | 添加 `chatRateLimiter`（10/min）和 `agentRateLimiter`（100/min） |
| T5.5 Agent API Key 频率限制 | ✅ 已完成 | `agentRateLimiter` 按 API Key 限流 |
| T5.1 引入 zod schema 验证 | ❌ 待执行 | 需 `npm install zod` + 路由中间件 |
| T5.2 消除 console.* 调用 | ❌ 待执行 | `database.js` ~30 处 console 调用，需逐步迁移 |

---

## 📋 阶段三：代码重复消除（待执行 — 大型重构）

| 任务 | 预估工时 | 说明 |
|------|----------|------|
| T3.1 抽取共享 controller 层 | 4h | routes/v1 ↔ agentRoutes 消除 ~2000 行重复 |
| T3.2 拆分 Home.vue God 组件 | 1.5h | 1085行 → ~200行 + 子组件 |
| T3.3 拆分 api/index.js | 0.5h | 1030行 → 按域拆分 |

---

## 📋 阶段六：性能优化（待执行）

| 任务 | 说明 |
|------|------|
| T6.1 D3 力导向图增量更新 | 四叉树增量而非全量重建 |
| T6.2 main.css 按需拆分 | 减少首屏 CSS |
| T6.3 历史记录分页加载 | 添加 page/limit 参数 |

---

## 📋 阶段七：测试补充（待执行）

| 任务 | 说明 |
|------|------|
| T7.1 后端核心路由测试 | auth / graphs / nodes / chat |
| T7.2 前端 composable 测试 | useAuth / useSearch / useClustering |

---

## 📁 本次修改文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `frontend/src/composables/useClustering.js` | 修复 | T2.1 — 添加 onUnmounted 清理 |
| `frontend/src/composables/useSearch.js` | 修复 | T2.2/T4.4 — 定时器清理 + AbortController |
| `frontend/src/composables/useAuth.js` | 修复 | T2.4 — inject 默认值降级 |
| `backend/src/middleware/errorHandler.js` | 新建 | T4.2 — 统一错误响应 |
| `backend/src/index.js` | 修改 | T4.2 — 注册 errorHandler |
| `backend/src/routes/chat.js` | 修改 | T4.1 — SSE 超时保护 |
| `backend/src/services/embeddingService.js` | 修改 | T4.3 — 输入清理 |
| `backend/src/middleware/rateLimit.js` | 修改 | T5.4/T5.5 — chat + agent 限制器 |
| `task.md` | 更新 | 进度更新 |