import { ChatbotModel } from '../models/chatbot.js';

export interface ChatbotDoc {
  id: string;
  userId: string;
  name: string;
  description: string;
  systemPrompt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDoc(raw: InstanceType<typeof ChatbotModel>): ChatbotDoc {
  return {
    id: raw.id as string,
    userId: (raw.userId as unknown as { toString(): string }).toString(),
    name: raw.name,
    description: raw.description ?? '',
    systemPrompt: raw.systemPrompt ?? '',
    createdAt: (raw as any).createdAt as Date,
    updatedAt: (raw as any).updatedAt as Date,
  };
}

export const chatbotRepo = {
  async create(
    userId: string,
    name: string,
    description: string,
    systemPrompt: string
  ): Promise<ChatbotDoc> {
    const chatbot = await ChatbotModel.create({ userId, name, description, systemPrompt });
    return toDoc(chatbot);
  },

  async findAllByUser(userId: string): Promise<ChatbotDoc[]> {
    const chatbots = await ChatbotModel.find({ userId }).sort({ createdAt: -1 });
    return chatbots.map(toDoc);
  },

  async findById(id: string): Promise<ChatbotDoc | null> {
    const chatbot = await ChatbotModel.findById(id);
    return chatbot ? toDoc(chatbot) : null;
  },

  async update(
    id: string,
    userId: string,
    fields: Partial<{ name: string; description: string; systemPrompt: string }>
  ): Promise<ChatbotDoc | null> {
    const chatbot = await ChatbotModel.findOneAndUpdate(
      { _id: id, userId },
      { $set: fields },
      { new: true }
    );
    return chatbot ? toDoc(chatbot) : null;
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await ChatbotModel.findOneAndDelete({ _id: id, userId });
    return result !== null;
  },
};
