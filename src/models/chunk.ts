import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema(
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
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

// Compound index for fast retrieval per chatbot
chunkSchema.index({ chatbotId: 1, documentId: 1 });

export const ChunkModel = mongoose.model('Chunk', chunkSchema);
