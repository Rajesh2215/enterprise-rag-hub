import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { chatbotController } from '../controllers/chatbot.controller.js';
import type { AuthRequest } from '../middleware/authenticate.js';
import type { Response } from 'express';

const router = Router();

// All chatbot routes require authentication
router.use(authenticate);

router.post('/', (req, res) => chatbotController.create(req as AuthRequest, res as Response));
router.get('/', (req, res) => chatbotController.getAll(req as AuthRequest, res as Response));
router.get('/:id', (req, res) => chatbotController.getById(req as AuthRequest, res as Response));
router.patch('/:id', (req, res) => chatbotController.update(req as AuthRequest, res as Response));
router.delete('/:id', (req, res) => chatbotController.delete(req as AuthRequest, res as Response));

export default router;
