import { chatbotRepo } from '../repositories/chatbot.repository.js';

export const chatbotService = {
  async create(userId: string, name: string, description: string, systemPrompt: string) {
    return chatbotRepo.create(userId, name, description, systemPrompt);
  },

  async getAll(userId: string) {
    return chatbotRepo.findAllByUser(userId);
  },

  async getById(id: string, userId: string) {
    const chatbot = await chatbotRepo.findById(id);
    if (!chatbot) throw new Error('Chatbot not found');
    if (chatbot.userId !== userId) throw new Error('Forbidden');
    return chatbot;
  },

  async update(
    id: string,
    userId: string,
    fields: Partial<{ name: string; description: string; systemPrompt: string }>
  ) {
    const chatbot = await chatbotRepo.update(id, userId, fields);
    if (!chatbot) throw new Error('Chatbot not found or forbidden');
    return chatbot;
  },

  async delete(id: string, userId: string) {
    const deleted = await chatbotRepo.delete(id, userId);
    if (!deleted) throw new Error('Chatbot not found or forbidden');
  },
};
