import express from 'express';

// Import v1 route modules
import v1Routes from './v1/index.js';

const router = express.Router();

// Mount v1 routes at root /api/*（前端唯一调用路径）
// 移除 /api/v1 双挂载与 /api/v2 410 占位：无实际消费者，避免每请求多穿一层 router
router.use('/', v1Routes);

export default router;
