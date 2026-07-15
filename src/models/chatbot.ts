import mongoose from 'mongoose';

const chatbotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    systemPrompt: { type: String, default: '' },
  },
  { timestamps: true }
);

export const ChatbotModel = mongoose.model('Chatbot', chatbotSchema);
