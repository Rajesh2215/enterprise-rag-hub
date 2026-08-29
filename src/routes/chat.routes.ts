// src/routes/chat.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import type { AuthRequest } from '../middleware/authenticate.js';
import type { Response } from 'express';
import { chatController } from '../controllers/chat.controller.js';

// mergeParams: true allows access to parent router params (like chatbotId)
const router = Router({ mergeParams: true });

// Protect all chat endpoints with JWT authentication
router.use(authenticate);

// POST /api/chatbots/:chatbotId/chat
router.post('/', (req, res) => chatController.send(req as AuthRequest, res as Response));

// POST /api/chatbots/:chatbotId/chat/stream
router.post('/stream', (req, res) =>
  chatController.stream(req as AuthRequest, res as Response)
);

// GET /api/chatbots/:chatbotId/chat/sessions/:sessionId/history
router.get('/sessions/:sessionId/history', (req, res) =>
  chatController.getHistory(req as AuthRequest, res as Response)
);
// DELETE /api/chatbots/:chatbotId/chat/sessions/:sessionId
router.delete('/sessions/:sessionId', (req, res) =>
  chatController.clearHistory(req as AuthRequest, res as Response)
);

export default router;
