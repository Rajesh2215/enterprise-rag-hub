import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp?: number;
}

const MAX_MESSAGES = 10; // Sliding window: keeps the last 10 messages (5 user-model turns)

export const memoryService = {
  // Helper to generate consistent Redis keys
  getKey(sessionId: string): string {
    return `chat:session:${sessionId}:messages`;
  },

  // 1. Retrieve the recent conversation history
  async getHistory(sessionId: string, limit: number = MAX_MESSAGES): Promise<ChatMessage[]> {
    const key = this.getKey(sessionId);
    // LRANGE with negative indices fetches the most recent messages in chronological order
    const rawMessages = await redis.lrange(key, -limit, -1);

    return rawMessages.map((msg) => JSON.parse(msg) as ChatMessage);
  },

  // 2. Add a complete turn (user query + model answer) to Redis in a single atomic pipeline
  async addTurn(sessionId: string, userMessage: string, modelMessage: string): Promise<void> {
    const key = this.getKey(sessionId);

    const userEntry: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };

    const modelEntry: ChatMessage = {
      role: 'model',
      content: modelMessage,
      timestamp: Date.now(),
    };

    // Use a pipeline so all operations execute in a single round-trip
    const pipeline = redis.pipeline();
    pipeline.rpush(key, JSON.stringify(userEntry));
    pipeline.rpush(key, JSON.stringify(modelEntry));
    pipeline.ltrim(key, -MAX_MESSAGES, -1); // Enforce sliding window
    pipeline.expire(key, env.REDIS_SESSION_TTL); // Refresh session expiration TTL

    await pipeline.exec();
  },

  // 3. Clear session history (e.g. when user clicks "New Chat")
  async clearSession(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await redis.del(key);
  },
};
