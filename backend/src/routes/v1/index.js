import express from 'express';

// Import domain-based route modules
import authRoutes from '../domains/auth/index.js';
import adminRoutes from '../domains/admin/index.js';
import ontologyRoutes from '../domains/ontology/index.js';

// Import independent route modules (no domain needed)
import graphBuildRoutes from './graphBuild.js';
import taskStatusRoutes from './taskStatus.js';
import logsRoutes from './logs.js';

// Import remaining v1 route modules (not yet migrated to domains)
import graphShareRoutes from './graphShare.js';
import graphAuthRoutes from './graphAuth.js';
import graphMgmtRoutes from './graphMgmt.js';
import graphDataRoutes from './graphData.js';
import nodeOpsRoutes from './nodeOps.js';
import advancedQueryRoutes from './advancedQuery.js';
import edgeOpsRoutes from './edgeOps.js';
import historyRoutes from './history.js';
import chatRoutes from './chat.js';
import embeddingRoutes from './embedding/index.js';
import vectorConfigRoutes from './vectorConfig.js';

const router = express.Router();

// Mount domain-based routes
// Auth routes
router.use('/', authRoutes);

// Admin domain routes (includes tenant, usage, plans, llmConfig, userAgents, stats)
router.use('/', adminRoutes);

// Ontology routes
router.use('/', ontologyRoutes);

// Mount independent routes (no domain needed)
router.use('/', graphBuildRoutes);
router.use('/', taskStatusRoutes);
router.use('/', logsRoutes);

// Mount remaining v1 routes (not yet migrated)
router.use('/', graphShareRoutes);
router.use('/', graphAuthRoutes);
router.use('/', graphMgmtRoutes);
router.use('/', graphDataRoutes);
router.use('/', nodeOpsRoutes);
router.use('/', advancedQueryRoutes);
router.use('/', edgeOpsRoutes);
router.use('/', historyRoutes);
router.use('/', chatRoutes);
router.use('/', embeddingRoutes);
router.use('/', vectorConfigRoutes);

export default router;