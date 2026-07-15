import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/authenticate.js';
import { chatbotService } from '../services/chatbot.service.js';

// ---------- Zod Schemas ----------

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  description: z.string().default(''),
  systemPrompt: z.string().default(''),
});

const updateSchema = z
  .object({
    name: z.string().min(1).trim().optional(),
    description: z.string().optional(),
    systemPrompt: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// ---------- Controller ----------

export const chatbotController = {
  // POST /chatbots
  async create(req: AuthRequest, res: Response) {
    const result = createSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }
    try {
      const { name, description, systemPrompt } = result.data;
      const chatbot = await chatbotService.create(req.user!.id, name, description, systemPrompt);
      res.status(201).json(chatbot);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },

  // GET /chatbots
  async getAll(req: AuthRequest, res: Response) {
    try {
      const chatbots = await chatbotService.getAll(req.user!.id);
      res.json(chatbots);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },

  // GET /chatbots/:id
  async getById(req: AuthRequest, res: Response) {
    try {
      const chatbot = await chatbotService.getById(req.params.id, req.user!.id);
      res.json(chatbot);
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'Chatbot not found') res.status(404).json({ error: message });
      else if (message === 'Forbidden') res.status(403).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },

  // PATCH /chatbots/:id
  async update(req: AuthRequest, res: Response) {
    const result = updateSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }
    try {
      const chatbot = await chatbotService.update(req.params.id, req.user!.id, result.data);
      res.json(chatbot);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found')) res.status(404).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },

  // DELETE /chatbots/:id
  async delete(req: AuthRequest, res: Response) {
    try {
      await chatbotService.delete(req.params.id, req.user!.id);
      res.json({ message: 'Chatbot deleted successfully' });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found')) res.status(404).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },
};
