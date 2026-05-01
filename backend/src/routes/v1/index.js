import express from 'express';
import { pingCheck } from '../../controllers/pingController.js';
import projectRouter from './projects.js';
import agentRouter from './agent.js';
const router = express.Router();

router.use('/ping', pingCheck);

router.use('/projects', projectRouter);

router.use('/agent', agentRouter);

export default router;