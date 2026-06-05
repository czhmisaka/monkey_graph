import express from 'express';

const router = express.Router();

// v2 API placeholder
// This endpoint will return a 410 Gone status indicating
// the v2 API is not yet available

router.use((req, res, next) => {
  res.status(410).json({
    error: 'API v2 Not Available',
    message: 'The v2 API is reserved for future expansion.',
    currentVersion: 'v1',
    supportedVersions: ['v1']
  });
});

export default router;
