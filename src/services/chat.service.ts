// src/services/chat.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { embedText } from '../utils/embeddings.js';
import { env } from '../config/env.js';
import { rerankDocuments } from '../utils/rerank.js';
import { memoryService } from './memory.service.js';

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export interface ChatResult {
  sessionId: string;
  response: string;
}

export const chatService = {
  async chat(
    chatbotId: string,
    message: string,
    userId: string,
    sessionId?: string
  ): Promise<ChatResult> {
    // 1. Ensure sessionId exists
    const activeSessionId = sessionId || crypto.randomUUID();
    // 2. Verify chatbot exists and belongs to the user
    const chatbot = await chatbotRepo.findById(chatbotId, userId);
    if (!chatbot) {
      throw new Error('Chatbot not found');
    }
    // 3. Fetch recent conversation history from Redis memory
    const history = await memoryService.getHistory(activeSessionId);
    console.log(`🧠 Loaded ${history.length} previous messages for session: ${activeSessionId}`);
    // 4. Convert user's question into a 768-dimensional vector
    console.log(`⏳ Embedding user question...`);
    const queryEmbedding = await embedText(message);
    // 5. Search Pinecone for top 15 closest candidate chunks
    console.log(`⏳ Querying Pinecone namespace: ${chatbotId}...`);
    const index = getPineconeIndex();
    const queryResponse = await index.namespace(chatbotId).query({
      vector: queryEmbedding,
      topK: 15,
      includeMetadata: true,
    });
    // 6. Extract candidate texts & re-rank to top 5
    const candidateTexts =
      queryResponse.matches
        ?.map((match) => match.metadata?.text)
        .filter(Boolean) as string[] || [];
    console.log(`🎯 Retrieved ${candidateTexts.length} candidates from Pinecone.`);
    const rerankedContexts = await rerankDocuments(message, candidateTexts, 5);
    const context = rerankedContexts.join('\n\n');
    // 7. Structure the Grounded Prompt for Gemini
    const systemInstruction = `
      You are a helpful AI assistant.
      Your custom chatbot persona instructions:
      ${chatbot.systemPrompt || 'Answer the user query professionally.'}
      Grounding Instruction:
      You must answer the user's question ONLY using the provided retrieved context and conversation history. 
      If the context does not contain the answer, say exactly: "I cannot find the answer in the uploaded documents." Do not try to make up or hallucinate any facts.
      Retrieved Context:
      ${context}
    `.trim();
    // 8. Prepare Gemini conversation contents with history + current message
    const formattedHistory = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));
    const contents = [
      ...formattedHistory,
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];
    // 9. Request answer generation from Gemini Flash
    console.log(`⏳ Generating grounded response using gemini-3.1-flash-lite...`);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemInstruction,
    });
    const result = await model.generateContent({ contents });
    const answer = result.response.text();
    // 10. Persist turn into Redis memory
    await memoryService.addTurn(activeSessionId, message, answer);
    console.log(`💾 Saved conversation turn into Redis session: ${activeSessionId}`);
    return {
      sessionId: activeSessionId,
      response: answer,
    };
  },
};
