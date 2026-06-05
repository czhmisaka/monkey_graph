import express from 'express';
import statusRoutes from './status.js';
import computeRoutes from './compute.js';
import searchRoutes from './search.js';
import clusterRoutes from './cluster.js';
import importExportRoutes from './importExport.js';

const router = express.Router();

// Mount all embedding sub-routes
router.use('/', statusRoutes);
router.use('/', computeRoutes);
router.use('/', searchRoutes);
router.use('/', clusterRoutes);
router.use('/', importExportRoutes);

export default router;
