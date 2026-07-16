import path from 'path';
import fs from 'fs';
import { documentRepo } from '../repositories/document.repository.js';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { PDFParse } from 'pdf-parse';
import { cleanExtractedText } from '../utils/textCleaner.js';

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
      fileType: file.mimetype,
      status: 'PROCESSING',
    });

    console.log('Created doc:', doc);
    const filePath = path.join(path.resolve('uploads'), file.filename);

    return documentService.processDocument(doc.id, filePath)
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

    const deleted = await documentRepo.delete(documentId, chatbotId);
    if (!deleted) throw new Error('Document not found');
  },

  async processDocument(documentId: string, filePath: string) {
    try {
      console.log(`Starting parsing for document: ${documentId}`);

      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = new PDFParse({ data: dataBuffer });
      const parsedText = await pdfData.getText();

      const cleanedText = cleanExtractedText(parsedText.text);
      console.log(`Cleaned text: ${cleanedText.length} characters`);

      const doc = await documentRepo.update(documentId, {
        status: 'READY',
        totalPages: parsedText?.total || 0,
      });

      console.log(` Document ${documentId} processed successfully.`);
      return doc
    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
      await documentRepo.update(documentId, { status: 'FAILED' });

    }
  }
};
