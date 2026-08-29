import path from 'path';
import fs from 'fs';
import { documentRepo } from '../repositories/document.repository.js';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { PDFParse } from 'pdf-parse';
import { cleanExtractedText } from '../utils/textCleaner.js';
import { embedChunks } from '../utils/embeddings.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { chunkRepo } from '../repositories/chunk.repository.js';
import { parentChunkRepo } from '../repositories/parentChunk.repository.js';
import { chunkParentChild } from '../utils/parentChildChunker.js';

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

    const filePath = path.join(path.resolve('uploads'), file.filename);

    return documentService.processDocument(doc.id, filePath);
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

    // ─── Delete vectors from Pinecone ───
    const index = getPineconeIndex();
    await index.namespace(chatbotId).deleteMany({
      filter: {
        documentId: { '$eq': documentId }
      }
    });

    await chunkRepo.deleteByDocument(documentId, chatbotId);
    await parentChunkRepo.deleteByDocument(documentId, chatbotId);

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

      if (!doc) {
        throw new Error(`Failed to update status for document ${documentId}`);
      }

      // ─── 1. Generate Parent-Child Hierarchy ───
      const { parents, allChildren } = chunkParentChild(cleanedText, 1500, 150, 300, 50);
      console.log(`Generated ${parents.length} Parent chunks and ${allChildren.length} Child chunks.`);

      // ─── 2. Save Parents to MongoDB ───
      await parentChunkRepo.insertMany(
        parents.map((p) => ({
          chatbotId: doc.chatbotId,
          documentId: doc.id,
          documentTitle: doc.title,
          parentId: p.parentId,
          parentIndex: p.parentIndex,
          text: p.text,
        }))
      );

      // ─── 3. Save Child Chunks to MongoDB for BM25 ───
      await chunkRepo.insertMany(
        allChildren.map((c) => ({
          chatbotId: doc.chatbotId,
          documentId: doc.id,
          documentTitle: doc.title,
          parentId: c.parentId,
          chunkIndex: c.childIndex,
          text: c.text,
        }))
      );

      // ─── 4. Embed Child Chunks for High-Precision Pinecone Indexing ───
      const childTexts = allChildren.map((c) => c.text);
      const embeddings = await embedChunks(childTexts);
      console.log(`✅ Generated ${embeddings.length} child embeddings.`);

      const vectors = allChildren.map((child, index) => ({
        id: `doc_${documentId}_${child.childId}`,
        values: embeddings[index]!,
        metadata: {
          text: child.text,
          documentId,
          chatbotId: doc.chatbotId,
          documentTitle: doc.title,
          parentId: child.parentId,
          chunkIndex: child.childIndex,
        },
      }));

      // ─── 5. Upsert Child Vectors into Pinecone Namespace ───
      console.log(`⏳ Storing ${vectors.length} child vectors in Pinecone namespace: ${doc.chatbotId}...`);
      const index = getPineconeIndex();
      await index.namespace(doc.chatbotId).upsert({ records: vectors });
      console.log(`✅ Storing in Pinecone complete.`);

      return doc;
    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
      await documentRepo.update(documentId, { status: 'FAILED' });
    }
  }
};
