import express from 'express';
import { runAgentController, getAgentLogsController } from '../../controllers/agentController.js';

const router = express.Router();

router.post('/', runAgentController);
router.get('/:projectId/logs', getAgentLogsController);

export default router;
