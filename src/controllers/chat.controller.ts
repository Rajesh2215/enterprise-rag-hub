// src/controllers/chat.controller.ts
import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/authenticate.js';
import { chatService } from '../services/chat.service.js';
import { memoryService } from '../services/memory.service.js';

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').trim(),
  sessionId: z.string().optional(),
});


export const chatController = {
  // POST /api/chatbots/:chatbotId/chat
  async send(req: AuthRequest, res: Response) {
    const result = chatSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }
    try {
      const { chatbotId } = req.params;
      const { message, sessionId } = result.data;
      if (!chatbotId) {
        throw new Error('Chatbot ID is required');
      }
      // Delegate chat logic to chatService
      const chatResult = await chatService.chat(
        chatbotId,
        message,
        req.user!.id,
        sessionId
      );
      res.json(chatResult);
    } catch (err) {
      console.error('Chat error:', err);
      const message = (err as Error).message;
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message === 'Forbidden') {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  },
  // GET /api/chatbots/:chatbotId/chat/sessions/:sessionId/history
  async getHistory(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }
      const history = await memoryService.getHistory(sessionId);
      res.json({ sessionId, history });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
  // DELETE /api/chatbots/:chatbotId/chat/sessions/:sessionId
  async clearHistory(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }
      await memoryService.clearSession(sessionId);
      res.json({ message: 'Session history cleared successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
};