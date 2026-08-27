// src/services/chat.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { embedText } from '../utils/embeddings.js';
import { env } from '../config/env.js';
import { rerankDocuments } from '../utils/rerank.js';
import { memoryService } from './memory.service.js';
import { rewriteQuery } from '../utils/queryRewriter.js';

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export interface SourceCitation {
  /**
  * 1-based index (1, 2, 3...) linking this metadata to inline footnote tags
  * like `[1]` or `[2]` in the LLM's response text.
  */
  sourceNumber: number;
  documentId: string;
  documentTitle: string;
  /**
   * 0-based index of this specific 500-char chunk within the document.
   * Useful for frontend PDF viewers to highlight or jump directly to this paragraph.
   */
  chunkIndex?: number | undefined;
  snippet: string;
  relevanceScore: number;
}
export interface ChatResult {
  sessionId: string;
  response: string;
  sources: SourceCitation[];
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

    // 4. Rewrite query to be standalone if conversation history exists
    const searchQuery = await rewriteQuery(message, history);

    // 5. Convert standalone search query into a 768-dimensional vector
    console.log(`⏳ Embedding search query: "${searchQuery}"...`);
    const queryEmbedding = await embedText(searchQuery);

    // 6. Search Pinecone for top 15 closest candidate chunks
    console.log(`⏳ Querying Pinecone namespace: ${chatbotId}...`);
    const index = getPineconeIndex();
    const queryResponse = await index.namespace(chatbotId).query({
      vector: queryEmbedding,
      topK: 15,
      includeMetadata: true,
    });

    // 7. Extract candidate metadata from Pinecone
    const candidateMatches = (queryResponse.matches || []).filter(
      (m) => m.metadata && typeof m.metadata['text'] === 'string'
    );
    const candidateTexts = candidateMatches.map(
      (m) => m.metadata!['text'] as string
    );
    console.log(`🎯 Retrieved ${candidateTexts.length} candidates from Pinecone.`);

    // 8. Re-rank using standalone query
    const rerankedResults = await rerankDocuments(searchQuery, candidateTexts, 5);

    // 9. Build structured source citations and prompt context
    const sources: SourceCitation[] = [];
    const contextBlocks: string[] = [];
    rerankedResults.forEach((res, i) => {
      const sourceNumber = i + 1;
      const originalMatch = candidateMatches[res.originalIndex];
      const docId = (originalMatch?.metadata?.['documentId'] as string) || 'unknown';
      const docTitle =
        (originalMatch?.metadata?.['documentTitle'] as string) ||
        `Document (${docId})`;
      const chunkIdx = originalMatch?.metadata?.['chunkIndex'] as number | undefined;
      sources.push({
        sourceNumber,
        documentId: docId,
        documentTitle: docTitle,
        chunkIndex: chunkIdx,
        snippet: res.text.slice(0, 200) + '...',
        relevanceScore: Number(res.relevanceScore.toFixed(4)),
      });
      contextBlocks.push(
        `[Source ${sourceNumber}] (Document: "${docTitle}"):\n${res.text}`
      );
    });

    const context = contextBlocks.join('\n\n');

    // 10. Structure the Grounded Prompt with citation instructions
    const systemInstruction = `
      You are a helpful AI assistant.
      Your custom chatbot persona instructions:
      ${chatbot.systemPrompt || 'Answer the user query professionally.'}
      Grounding & Citation Instructions:
      1. You must answer the user's question ONLY using the provided retrieved context and conversation history.
      2. If the context does not contain the answer, say exactly: "I cannot find the answer in the uploaded documents." Do not make up or hallucinate any facts.
      3. Whenever you use facts or statements from a source, cite it inline using bracketed numbers, like [1] or [2].
      4. Always ground your facts directly in the sources provided.
      Retrieved Context:
      ${context}
    `.trim();

    // 11. Prepare Gemini conversation contents with history + current message
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

    // 12. Request answer generation from Gemini Flash
    console.log(`⏳ Generating grounded response using gemini-3.1-flash-lite...`);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemInstruction,
    });
    const result = await model.generateContent({ contents });
    const answer = result.response.text();

    // 13. Persist turn into Redis memory
    await memoryService.addTurn(activeSessionId, message, answer);
    console.log(`💾 Saved conversation turn into Redis session: ${activeSessionId}`);

    return {
      sessionId: activeSessionId,
      response: answer,
      sources,
    };
  },
};
