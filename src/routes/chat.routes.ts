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

export default router;
