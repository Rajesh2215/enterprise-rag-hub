import { Router, type Request, type Response } from 'express';
import authRouter from './auth.routes.js';
import chatbotRouter from './chatbot.routes.js';
import documentRouter from './document.routes.js';
import chatRouter from './chat.routes.js';
import evalRouter from './eval.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/chatbots', chatbotRouter);
router.use('/chatbots/:chatbotId/documents', documentRouter);
router.use('/chatbots/:chatbotId/chat', chatRouter);
router.use('/chatbots/:chatbotId/eval', evalRouter);

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;
