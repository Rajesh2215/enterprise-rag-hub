import mongoose from 'mongoose';

const parentChunkSchema = new mongoose.Schema(
  {
    chatbotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chatbot',
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    documentTitle: { type: String, required: true },
    parentId: { type: String, required: true, index: true },
    parentIndex: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

parentChunkSchema.index({ chatbotId: 1, documentId: 1, parentId: 1 });

export const ParentChunkModel = mongoose.model('ParentChunk', parentChunkSchema);

