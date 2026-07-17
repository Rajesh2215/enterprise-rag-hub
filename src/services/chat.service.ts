// src/services/chat.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { embedText } from '../utils/embeddings.js';
import { env } from '../config/env.js';
import { rerankDocuments } from '../utils/rerank.js';

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export const chatService = {
  async chat(chatbotId: string, message: string, userId: string): Promise<string> {
    // 1. Verify chatbot exists and belongs to the user
    const chatbot = await chatbotRepo.findById(chatbotId, userId);
    if (!chatbot) {
      throw new Error('Chatbot not found');
    }

    // 2. Convert user's question into a 768-dimensional vector
    console.log(`⏳ Embedding user question...`);
    const queryEmbedding = await embedText(message);

    // 3. Search Pinecone for the top 5 closest chunks in the chatbot's namespace
    console.log(`⏳ Querying Pinecone namespace: ${chatbotId}...`);
    const index = getPineconeIndex();
    const queryResponse = await index.namespace(chatbotId).query({
      vector: queryEmbedding,
      topK: 15,
      includeMetadata: true,
    });

    // 4. Extract candidate texts
    const candidateTexts = queryResponse.matches
      ?.map((match) => match.metadata?.text)
      .filter(Boolean) as string[] || [];

    console.log(`🎯 Retrieved ${candidateTexts.length} candidates from Pinecone.`);

    const rerankedContexts = await rerankDocuments(message, candidateTexts, 5);
    const context = rerankedContexts.join('\n\n')

    // 5. Structure the Grounded Prompt for Gemini
    // We pass the System Prompt (persona) and Retrieved Context as instructions
    const systemInstruction = `
      You are a helpful AI assistant.
      Your custom chatbot persona instructions:
      ${chatbot.systemPrompt || 'Answer the user query professionally.'}

      Grounding Instruction:
      You must answer the user's question ONLY using the provided retrieved context. 
      If the context does not contain the answer, say exactly: "I cannot find the answer in the uploaded documents." Do not try to make up or hallucinate any facts.

      Retrieved Context:
      ${context}
    `.trim();

    // 6. Request answer generation from Gemini Flash
    console.log(`⏳ Generating grounded response using gemini-3.1-flash-lite...`);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemInstruction, // Passes instructions as system prompt
    });

    const result = await model.generateContent(message);
    const answer = result.response.text();

    console.log(`✅ Chat response generated successfully.`);
    return answer;
  },
};
