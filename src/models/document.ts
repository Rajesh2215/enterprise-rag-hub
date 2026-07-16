import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true, index: true },
    title: { type: String, required: true, trim: true },
    fileName: { type: String, required: true },
    originalFileName: { type: String, required: true },
    fileType: { type: String, required: true },
    totalPages: { type: Number },
    fileSize: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PROCESSING', 'READY', 'FAILED'],
      default: 'PROCESSING',
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const DocumentModel = mongoose.model('Document', documentSchema);
