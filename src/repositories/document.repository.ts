import { DocumentModel } from '../models/document.js';

export interface DocumentDoc {
  id: string;
  chatbotId: string;
  title: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  fileType: string;
  totalPages?: number | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function toDoc(raw: InstanceType<typeof DocumentModel>): DocumentDoc {
  return {
    id: raw.id as string,
    chatbotId: (raw.chatbotId as unknown as { toString(): string }).toString(),
    title: raw.title,
    fileName: raw.fileName,
    originalFileName: raw.originalFileName,
    fileSize: raw.fileSize,
    fileType: raw.fileType,
    totalPages: raw.totalPages ?? null,
    status: raw.status as 'PROCESSING' | 'READY' | 'FAILED',
    uploadedAt: raw.uploadedAt as Date,
    createdAt: (raw as any).createdAt as Date,
    updatedAt: (raw as any).updatedAt as Date,
  };
}

export const documentRepo = {
  async create(data: {
    chatbotId: string;
    title: string;
    fileName: string;
    originalFileName: string;
    fileSize: number;
    totalPages?: number | null;
    fileType: string;
    status: 'PROCESSING' | 'READY' | 'FAILED';
  }): Promise<DocumentDoc> {
    const doc = await DocumentModel.create({ ...data, uploadedAt: new Date() });
    return toDoc(doc);
  },

  async findAllByChatbot(chatbotId: string): Promise<DocumentDoc[]> {
    const docs = await DocumentModel.find({ chatbotId }).sort({ createdAt: -1 });
    return docs.map(toDoc);
  },

  async findById(id: string, chatbotId: string): Promise<DocumentDoc | null> {
    const doc = await DocumentModel.findOne({ _id: id, chatbotId });
    return doc ? toDoc(doc) : null;
  },

  async update(
    id: string,
    updateData: { status?: 'PROCESSING' | 'READY' | 'FAILED'; totalPages?: number }
  ): Promise<DocumentDoc | null> {
    const doc = await DocumentModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { returnDocument: "after" }
    );
    return doc ? toDoc(doc) : null;
  },


  async delete(id: string, chatbotId: string): Promise<boolean> {
    const result = await DocumentModel.findOneAndDelete({ _id: id, chatbotId });
    return result !== null;
  },
};
