import express from 'express';
import embeddingRoutes from './embedding/index.js';

const router = express.Router();

// Mount all embedding routes under /embedding and /graphs/:graphId/embedding
router.use('/', embeddingRoutes);

export default router;
