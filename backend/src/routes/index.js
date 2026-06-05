import express from 'express';

// Import v1 route modules
import v1Routes from './v1/index.js';

// Create v1 router with X-API-Version header middleware
const createV1Router = () => {
  const router = express.Router();

  // Add X-API-Version header to all v1 responses
  router.use((req, res, next) => {
    res.setHeader('X-API-Version', 'v1');
    next();
  });

  // Mount all v1 routes
  router.use('/', v1Routes);

  return router;
};

const router = express.Router();

// Mount v1 routes at /api/v1 (new versioned API)
router.use('/v1', createV1Router());

// Also mount v1 routes at root /api/* for backward compatibility
// This ensures existing clients continue to work
router.use('/', createV1Router());

// Mount v2 placeholder at /api/v2
import v2Routes from './v2/index.js';
router.use('/v2', v2Routes);

export default router;
