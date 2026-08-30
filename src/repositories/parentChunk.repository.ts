import mongoose from 'mongoose';
import { ParentChunkModel } from '../utils/parentChunk.js';

export interface ParentChunkDoc {
  id: string;
  chatbotId: string;
  documentId: string;
  documentTitle: string;
  parentId: string;
  parentIndex: number;
  text: string;
}

export const parentChunkRepo = {
  async insertMany(
    parents: Array<{
      chatbotId: string;
      documentId: string;
      documentTitle: string;
      parentId: string;
      parentIndex: number;
      text: string;
    }>
  ) {
    return ParentChunkModel.insertMany(parents);
  },

  async findByParentIds(
    chatbotId: string,
    parentIds: string[]
  ): Promise<ParentChunkDoc[]> {
    if (!mongoose.Types.ObjectId.isValid(chatbotId) || parentIds.length === 0) {
      return [];
    }
    const docs = await ParentChunkModel.find({
      chatbotId,
      parentId: { $in: parentIds },
    }).lean();

    return docs.map((d) => ({
      id: d._id.toString(),
      chatbotId: d.chatbotId.toString(),
      documentId: d.documentId.toString(),
      documentTitle: d.documentTitle,
      parentId: d.parentId,
      parentIndex: d.parentIndex,
      text: d.text,
    }));
  },

  async deleteByDocument(documentId: string, chatbotId: string) {
    if (
      !mongoose.Types.ObjectId.isValid(documentId) ||
      !mongoose.Types.ObjectId.isValid(chatbotId)
    ) {
      return { deletedCount: 0 };
    }
    return ParentChunkModel.deleteMany({ documentId, chatbotId });
  },
};
