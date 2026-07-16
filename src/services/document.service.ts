import path from 'path';
import fs from 'fs';
import { documentRepo } from '../repositories/document.repository.js';
import { chatbotRepo } from '../repositories/chatbot.repository.js';

export const documentService = {
  async upload(
    chatbotId: string,
    userId: string,
    file: Express.Multer.File
  ) {
    // Verify the chatbot belongs to the user
    const chatbot = await chatbotRepo.findById(chatbotId);
    if (!chatbot) throw new Error('Chatbot not found');
    if (chatbot.userId.toString() !== userId) throw new Error('Forbidden');

    const title = path.parse(file.originalname).name;

    const doc = await documentRepo.create({
      chatbotId,
      title,
      fileName: file.filename,
      originalFileName: file.originalname,
      fileSize: file.size,
      status: 'PROCESSING',
    });

    return doc;
  },

  async getAll(chatbotId: string, userId: string) {
    const chatbot = await chatbotRepo.findById(chatbotId);
    if (!chatbot) throw new Error('Chatbot not found');
    if (chatbot.userId.toString() !== userId) throw new Error('Forbidden');
    return documentRepo.findAllByChatbot(chatbotId);
  },

  async getById(chatbotId: string, documentId: string, userId: string) {
    const chatbot = await chatbotRepo.findById(chatbotId);
    if (!chatbot) throw new Error('Chatbot not found');
    if (chatbot.userId.toString() !== userId) throw new Error('Forbidden');
    const doc = await documentRepo.findById(documentId, chatbotId);
    if (!doc) throw new Error('Document not found');
    return doc;
  },

  async delete(chatbotId: string, documentId: string, userId: string) {
    const chatbot = await chatbotRepo.findById(chatbotId);
    if (!chatbot) throw new Error('Chatbot not found');
    if (chatbot.userId.toString() !== userId) throw new Error('Forbidden');

    const doc = await documentRepo.findById(documentId, chatbotId);
    if (!doc) throw new Error('Document not found');

    // Remove file from disk
    const uploadsDir = path.resolve('uploads');
    const filePath = path.join(uploadsDir, doc.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // TODO: Delete vectors from Qdrant by documentId

    const deleted = await documentRepo.delete(documentId, chatbotId);
    if (!deleted) throw new Error('Document not found');
  },
};
