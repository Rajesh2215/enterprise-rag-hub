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
      if (!chatbotId || typeof chatbotId !== 'string') {
        res.status(400).json({ error: 'Chatbot ID is required' });
        return;
      }
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
      if (!sessionId || typeof sessionId !== 'string') {
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
      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }
      await memoryService.clearSession(sessionId);
      res.json({ message: 'Session history cleared successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },

  // POST /api/chatbots/:chatbotId/chat/stream
  async stream(req: AuthRequest, res: Response) {
    const result = chatSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { chatbotId } = req.params;
    const { message, sessionId } = result.data;

    if (!chatbotId || typeof chatbotId !== 'string') {
      res.status(400).json({ error: 'Valid Chatbot ID is required' });
      return;
    }

    // 1. Set Server-Sent Events (SSE) Headers
    // - text/event-stream: Tells client this is an ongoing stream of events
    // - no-cache: Prevents browsers & proxies (NGINX/Cloudflare) from caching or buffering tokens
    // - keep-alive: Keeps TCP connection open for continuous data flow
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Forces Express to send the 200 OK and headers over the network immediately,
    // so the client connection opens with zero delay before the first token arrives.
    res.flushHeaders();

    try {
      // 2. Consume the generator and write SSE events
      const generator = chatService.chatStream(
        chatbotId,
        message,
        req.user!.id,
        sessionId
      );

      for await (const event of generator) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // 3. End the stream
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      console.error('Streaming error:', err);
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      res.end();
    }
  },
};