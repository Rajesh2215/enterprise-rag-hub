import { Router, type Request, type Response } from 'express';
import authRouter from './auth.routes.js';
import chatbotRouter from './chatbot.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/chatbots', chatbotRouter);

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;
