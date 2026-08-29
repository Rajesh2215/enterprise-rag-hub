import { Router, type Response } from 'express';
import { evalController } from '../controllers/eval.controller.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/', (req, res) =>
  evalController.runEvaluation(req as AuthRequest, res)
);

export default router;
