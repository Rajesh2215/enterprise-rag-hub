// src/services/chat.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { embedText } from '../utils/embeddings.js';
import { env } from '../config/env.js';
import { rerankDocuments } from '../utils/rerank.js';
import { memoryService } from './memory.service.js';
import { rewriteQuery } from '../utils/queryRewriter.js';
import { BM25Index, reciprocalRankFusion, type SearchCandidate } from '../utils/bm25.js';
import { chunkRepo } from '../repositories/chunk.repository.js';
import { parentChunkRepo } from '../repositories/parentChunk.repository.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export interface SourceCitation {
  sourceNumber: number;
  documentId: string;
  documentTitle: string;
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

    // ─── 5. HYBRID SEARCH: Run Dense (Pinecone) & Sparse (BM25) in parallel ───
    console.log(`⏳ Running Hybrid Search (Dense + BM25) for query: "${searchQuery}"...`);
    const [denseCandidates, sparseCandidates] = await Promise.all([
      // A. Dense Search (Pinecone)
      (async (): Promise<SearchCandidate[]> => {
        const queryEmbedding = await embedText(searchQuery);
        const index = getPineconeIndex();
        const queryResponse = await index.namespace(chatbotId).query({
          vector: queryEmbedding,
          topK: 15,
          includeMetadata: true,
        });

        return (queryResponse.matches || [])
          .filter((m) => m.metadata && typeof m.metadata['text'] === 'string')
          .map((m) => ({
            id: m.id,
            text: m.metadata!['text'] as string,
            documentId: (m.metadata!['documentId'] as string) || 'unknown',
            documentTitle: (m.metadata!['documentTitle'] as string) || 'Document',
            chunkIndex: m.metadata!['chunkIndex'] as number | undefined,
            parentId: m.metadata!['parentId'] as string | undefined,
          }));
      })(),

      // B. Sparse Search (BM25 over MongoDB Chunks)
      (async (): Promise<SearchCandidate[]> => {
        const mongoChunks = await chunkRepo.findAllByChatbot(chatbotId);
        if (mongoChunks.length === 0) return [];

        const bm25 = new BM25Index(mongoChunks);
        const bm25Matches = bm25.search(searchQuery, 15);

        return bm25Matches.map((doc) => ({
          id: doc.id,
          text: doc.text,
          documentId: doc.documentId,
          documentTitle: doc.documentTitle,
          chunkIndex: doc.chunkIndex,
        }));
      })(),
    ]);

    console.log(`🔍 Dense returned ${denseCandidates.length}, BM25 returned ${sparseCandidates.length} candidates.`);

    // ─── 6. Reciprocal Rank Fusion (RRF) ───
    const fusedCandidates = reciprocalRankFusion(denseCandidates, sparseCandidates, 60);
    console.log(`🔀 RRF merged into ${fusedCandidates.length} unique candidates.`);

    const candidateTexts = fusedCandidates.map((c) => c.text);

    // ─── 7. Re-rank with Cohere Cross-Encoder ───
    const rerankedResults = await rerankDocuments(searchQuery, candidateTexts, 5);

    // ─── 8. PARENT-CHILD AUTO-MERGING: Expand Child Chunks to Parent Paragraphs ───
    const topRerankedCandidates = rerankedResults.map((res) => ({
      ...fusedCandidates[res.originalIndex]!,
      relevanceScore: res.relevanceScore,
    }));

    // Collect all parent IDs from the top matches
    const parentIdsToFetch = Array.from(
      new Set(
        topRerankedCandidates
          .map((c) => (c as any).parentId)
          .filter((p): p is string => Boolean(p))
      )
    );

    let parentMap = new Map<string, string>();
    if (parentIdsToFetch.length > 0) {
      const parentDocs = await parentChunkRepo.findByParentIds(chatbotId, parentIdsToFetch);
      parentDocs.forEach((p) => parentMap.set(p.parentId, p.text));
      console.log(`👶 Auto-merged ${topRerankedCandidates.length} child chunks into ${parentDocs.length} full Parent paragraphs.`);
    }

    // ─── 9. Build structured source citations and prompt context ───
    const sources: SourceCitation[] = [];
    const contextBlocks: string[] = [];
    const seenContexts = new Set<string>();

    topRerankedCandidates.forEach((candidate) => {
      const parentId = (candidate as any).parentId;
      const fullText = (parentId && parentMap.get(parentId)) || candidate.text;

      // Auto-Merge: Deduplicate so identical parent blocks aren't repeated in context
      if (seenContexts.has(fullText)) {
        return;
      }
      seenContexts.add(fullText);

      const sourceNumber = sources.length + 1;
      const docId = candidate.documentId || 'unknown';
      const docTitle = candidate.documentTitle || `Document (${docId})`;
      const chunkIdx = candidate.chunkIndex;

      sources.push({
        sourceNumber,
        documentId: docId,
        documentTitle: docTitle,
        chunkIndex: chunkIdx,
        snippet: fullText.slice(0, 200) + '...',
        relevanceScore: Number(candidate.relevanceScore.toFixed(4)),
      });

      contextBlocks.push(
        `[Source ${sourceNumber}] (Document: "${docTitle}"):\n${fullText}`
      );
    });

    const context = contextBlocks.join('\n\n');

    // ─── 10. Structure Grounded Prompt with Citations ───
    const systemInstruction = `
      You are a helpful AI assistant.
      Your custom chatbot persona instructions:
      ${chatbot.systemPrompt || 'Answer the user query professionally.'}

      Grounding & Citation Instructions:
      1. You must answer the user's question ONLY using the provided retrieved context and conversation history.
      2. If the context does not contain the answer, say exactly: "I cannot find the answer in the uploaded documents." Do not try to make up or hallucinate any facts.
      3. Whenever you use facts or statements from a source, cite it inline using bracketed numbers, like [1] or [2].
      4. Always ground your facts directly in the sources provided.

      Retrieved Context:
      ${context}
    `.trim();

    // ─── 11. Multi-turn generation with Gemini ───
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

    console.log(`⏳ Generating grounded response using gemini-3.1-flash-lite...`);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent({ contents });
    const answer = result.response.text();

    // ─── 12. Persist turn into Redis ───
    await memoryService.addTurn(activeSessionId, message, answer);
    console.log(`💾 Saved conversation turn into Redis session: ${activeSessionId}`);

    return {
      sessionId: activeSessionId,
      response: answer,
      sources,
    };
  },
};
