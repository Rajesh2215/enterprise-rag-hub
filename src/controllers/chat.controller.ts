// src/controllers/chat.controller.ts
import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/authenticate.js';
import { chatService } from '../services/chat.service.js';

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').trim(),
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
      const { message } = result.data;

      if (!chatbotId) {
        throw new Error("Chatbot ID is required");
      }

      // Delegate chat logic to the chatService
      const answer = await chatService.chat(chatbotId as string, message, req.user!.id);

      res.json({ response: answer });
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
};
