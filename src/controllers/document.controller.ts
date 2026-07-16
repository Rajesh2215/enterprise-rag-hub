import type { Response } from 'express';
import type { AuthRequest } from '../middleware/authenticate.js';
import { documentService } from '../services/document.service.js';

export const documentController = {
  // POST /chatbots/:chatbotId/documents
  async upload(req: AuthRequest, res: Response) {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No PDF file uploaded' });
      return;
    }
    try {
      const doc = await documentService.upload(
        req.params.chatbotId as string,
        req.user!.id,
        file
      );
      res.status(201).json(doc);
    } catch (err) {
      console.error('[document.upload]', err);
      const message = (err as Error).message;
      if (message === 'Chatbot not found') res.status(404).json({ error: message });
      else if (message === 'Forbidden') res.status(403).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },

  // GET /chatbots/:chatbotId/documents
  async getAll(req: AuthRequest, res: Response) {
    try {
      const docs = await documentService.getAll(req.params.chatbotId as string, req.user!.id);
      res.json(docs);
    } catch (err) {
      console.error('[document.getAll]', err);
      const message = (err as Error).message;
      if (message === 'Chatbot not found') res.status(404).json({ error: message });
      else if (message === 'Forbidden') res.status(403).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },

  // GET /chatbots/:chatbotId/documents/:documentId
  async getById(req: AuthRequest, res: Response) {
    try {
      const doc = await documentService.getById(
        req.params.chatbotId as string,
        req.params.documentId as string,
        req.user!.id
      );
      res.json(doc);
    } catch (err) {
      console.error('[document.getById]', err);
      const message = (err as Error).message;
      if (message === 'Chatbot not found' || message === 'Document not found')
        res.status(404).json({ error: message });
      else if (message === 'Forbidden') res.status(403).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },

  // DELETE /chatbots/:chatbotId/documents/:documentId
  async delete(req: AuthRequest, res: Response) {
    try {
      await documentService.delete(
        req.params.chatbotId as string,
        req.params.documentId as string,
        req.user!.id
      );
      res.json({ message: 'Document deleted successfully' });
    } catch (err) {
      console.error('[document.delete]', err);
      const message = (err as Error).message;
      if (message === 'Chatbot not found' || message === 'Document not found')
        res.status(404).json({ error: message });
      else if (message === 'Forbidden') res.status(403).json({ error: message });
      else res.status(500).json({ error: message });
    }
  },
};
