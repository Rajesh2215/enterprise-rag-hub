import type { Response } from 'express';
import { z } from 'zod';
import { evalService } from '../services/eval.service.js';
import type { AuthRequest } from '../middleware/authenticate.js';

const evalSchema = z.object({
  testQuery: z.string().min(1, 'testQuery is required'),
});

export const evalController = {

  async runEvaluation(req: AuthRequest, res: Response) {
    const result = evalSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { chatbotId } = req.params;
    const { testQuery } = result.data;

    if (!chatbotId || typeof chatbotId !== 'string') {
      res.status(400).json({ error: 'Valid Chatbot ID is required' });
      return;
    }

    try {
      const report = await evalService.evaluate(
        chatbotId,
        testQuery,
        req.user!.id
      );
      res.status(200).json(report);
    } catch (err) {
      console.error('Evaluation error:', err);
      const message = (err as Error).message;
      if (message === 'Chatbot not found') {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  },
};
