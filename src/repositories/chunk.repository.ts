import { ChunkModel } from '../models/chunk.js';

export interface ChunkDoc {
  id: string;
  chatbotId: string;
  documentId: string;
  documentTitle: string;
  parentId?: string;
  chunkIndex: number;
  text: string;
}

export const chunkRepo = {
  async insertMany(
    chunks: Array<{
      chatbotId: string;
      documentId: string;
      documentTitle: string;
      parentId?: string;
      chunkIndex: number;
      text: string;
    }>
  ) {
    return ChunkModel.insertMany(chunks);
  },

  async findAllByChatbot(chatbotId: string): Promise<ChunkDoc[]> {
    const docs = await ChunkModel.find({ chatbotId }).lean();
    return docs.map((d) => ({
      id: d._id.toString(),
      chatbotId: d.chatbotId.toString(),
      documentId: d.documentId.toString(),
      documentTitle: d.documentTitle,
      parentId: (d as any).parentId,
      chunkIndex: d.chunkIndex,
      text: d.text,
    }));
  },

  async deleteByDocument(documentId: string, chatbotId: string) {
    return ChunkModel.deleteMany({ documentId, chatbotId });
  },
};