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
import { expandQuery } from '../utils/queryExpander.js';
import { classifyIntent } from '../utils/intentRouter.js';

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

export interface RetrievedRAGContext {
  isOutOfScope: boolean;
  context: string;
  sources: SourceCitation[];
}

/**
 * ─── SHARED RETRIEVAL & CRAG DECISION PIPELINE ───
 * Runs Parallel Hybrid Search (Dense + Sparse), RRF Fusion, Cohere Cross-Encoder,
 * CRAG Confidence Branching (< 0.20 Fallback, 0.20 - 0.50 Query Expansion),
 * and Parent-Child Auto-Merging context assembly.
 */
async function retrieveAndExpandContext(
  chatbotId: string,
  searchQuery: string
): Promise<RetrievedRAGContext> {
  // 1. Run Hybrid Search (Dense + Sparse in parallel)
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
        parentId: doc.parentId,
      }));
    })(),
  ]);

  // 2. RRF Fusion & Cohere Cross-Encoder Reranking
  const fusedCandidates = reciprocalRankFusion(denseCandidates, sparseCandidates, 60);
  const candidateTexts = fusedCandidates.map((c) => c.text);
  const rerankedResults = await rerankDocuments(searchQuery, candidateTexts, 5);

  // 3. CRAG Confidence Threshold Evaluation
  const topScore = rerankedResults.length > 0 ? rerankedResults[0]!.relevanceScore : 0;
  console.log(`🛡️ [CRAG Confidence Check] Top Cohere Score: ${topScore.toFixed(4)}`);

  // ❌ CRAG Branch 1: Irrelevant / Out-of-Scope (Score < 0.20)
  if (topScore < 0.20) {
    console.log(`🛡️ [CRAG Action: FALLBACK] Query is out-of-scope. Skipping LLM generation.`);
    return { isOutOfScope: true, context: '', sources: [] };
  }

  // ⚠️ CRAG Branch 2: Ambiguous (0.20 <= Score < 0.50) ➔ Query Expansion
  if (topScore < 0.50) {
    console.log(`🛡️ [CRAG Action: QUERY EXPANSION] Ambiguous confidence. Expanding query variations...`);
    const expandedQueries = await expandQuery(searchQuery);
    console.log(`🔍 Expanded queries:`, expandedQueries);

    const mongoChunks = await chunkRepo.findAllByChatbot(chatbotId);
    if (mongoChunks.length > 0) {
      const bm25 = new BM25Index(mongoChunks);
      for (const eq of expandedQueries) {
        const extraMatches = bm25.search(eq, 5);
        extraMatches.forEach((m) => {
          if (!fusedCandidates.some((c) => c.text === m.text)) {
            fusedCandidates.push({
              id: m.id,
              text: m.text,
              documentId: m.documentId,
              documentTitle: m.documentTitle,
              chunkIndex: m.chunkIndex,
              parentId: m.parentId,
            });
          }
        });
      }
    }
  }

  // 4. Parent-Child Auto-Merging Expansion
  const topCandidates = rerankedResults.map((res) => ({
    ...fusedCandidates[res.originalIndex]!,
    relevanceScore: res.relevanceScore,
  }));

  const parentIds = Array.from(
    new Set(topCandidates.map((c) => (c as any).parentId).filter(Boolean))
  );

  const parentMap = new Map<string, string>();
  if (parentIds.length > 0) {
    const parentDocs = await parentChunkRepo.findByParentIds(
      chatbotId,
      parentIds as string[]
    );
    parentDocs.forEach((p) => parentMap.set(p.parentId, p.text));
  }

  // 5. Assemble Context and Deduplicate Repeated Parents
  const sources: SourceCitation[] = [];
  const contextBlocks: string[] = [];
  const seenContexts = new Set<string>();

  topCandidates.forEach((candidate) => {
    const parentId = (candidate as any).parentId;
    const fullText = (parentId && parentMap.get(parentId)) || candidate.text;

    if (seenContexts.has(fullText)) return;
    seenContexts.add(fullText);

    const sourceNumber = sources.length + 1;
    const docId = candidate.documentId || 'unknown';
    const docTitle = candidate.documentTitle || 'Document';

    sources.push({
      sourceNumber,
      documentId: docId,
      documentTitle: docTitle,
      chunkIndex: candidate.chunkIndex,
      snippet: fullText.slice(0, 200) + '...',
      relevanceScore: Number(candidate.relevanceScore.toFixed(4)),
    });

    contextBlocks.push(`[Source ${sourceNumber}] (Document: "${docTitle}"):\n${fullText}`);
  });

  return {
    isOutOfScope: false,
    context: contextBlocks.join('\n\n'),
    sources,
  };
}

export const chatService = {
  // ─── 1. STANDARD BUFFERED CHAT ───
  async chat(
    chatbotId: string,
    message: string,
    userId: string,
    sessionId?: string
  ): Promise<ChatResult> {
    const activeSessionId = sessionId || crypto.randomUUID();

    const chatbot = await chatbotRepo.findById(chatbotId, userId);
    if (!chatbot) throw new Error('Chatbot not found');

    const history = await memoryService.getHistory(activeSessionId);
    const searchQuery = await rewriteQuery(message, history);

    const intent = await classifyIntent(message);
    if (intent === "CHITCHAT") {
      console.log(`🚦 [Intent Router] Chitchat detected ("${message}"). Bypassing RAG retrieval.`);
      const chitchatModel = await genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        systemInstruction: chatbot.systemPrompt || 'You are a helpful, polite AI assistant'
      })

      const formattedHistory = history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }))

      const result = await chitchatModel.generateContent({
        contents: [...formattedHistory, { role: 'user', parts: [{ text: message }] }]
      })

      const answer = result.response.text();
      await memoryService.addTurn(activeSessionId, message, answer);

      return {
        sessionId: activeSessionId,
        response: answer,
        sources: []
      }
    }

    // Retrieve & evaluate context through CRAG pipeline
    const { isOutOfScope, context, sources } = await retrieveAndExpandContext(
      chatbotId,
      searchQuery
    );

    if (isOutOfScope) {
      const fallbackResponse = 'I cannot find the answer to your question in the uploaded documents.';
      await memoryService.addTurn(activeSessionId, message, fallbackResponse);
      return {
        sessionId: activeSessionId,
        response: fallbackResponse,
        sources: [],
      };
    }

    // Grounded Generation
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

    const formattedHistory = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    const contents = [...formattedHistory, { role: 'user', parts: [{ text: message }] }];

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction,
    });

    const result = await model.generateContent({ contents });
    const answer = result.response.text();

    await memoryService.addTurn(activeSessionId, message, answer);

    return {
      sessionId: activeSessionId,
      response: answer,
      sources,
    };
  },

  /**
   * ─── 2. STREAMING CHAT (Server-Sent Events) ───
   *
   * How Streaming Works via 2 Decoupled Pipes:
   * ┌─────────────────────────┐
   * │ Service (chat.service)  │ ──► [Pipe 1: `yield token`] ──► ┌───────────────────────────┐
   * └─────────────────────────┘                                 │ Controller (chat.ctrl)    │ ──► [Pipe 2: `res.write('data: ...\n\n')`] ──► Client / UI
   *                                                             └───────────────────────────┘
   */
  async *chatStream(
    chatbotId: string,
    message: string,
    userId: string,
    sessionId?: string
  ): AsyncGenerator<{ type: 'sources' | 'token' | 'done'; data: any }> {
    const activeSessionId = sessionId || crypto.randomUUID();

    const chatbot = await chatbotRepo.findById(chatbotId, userId);
    if (!chatbot) throw new Error('Chatbot not found');

    const history = await memoryService.getHistory(activeSessionId);
    const searchQuery = await rewriteQuery(message, history);

    // ─── INTENT ROUTING FAST-PATH FOR STREAM ───
    const intent = await classifyIntent(message);
    if (intent === "CHITCHAT") {
      console.log(`🚦 [Intent Router Stream] Chitchat detected ("${message}"). Bypassing RAG retrieval.`);
      yield { type: 'sources', data: { sessionId: activeSessionId, sources: [] } };

      const chitchatModel = await genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        systemInstruction: chatbot.systemPrompt || 'You are a helpful, polite AI assistant'
      })

      const formatedHistory = history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }))

      const responseStream = await chitchatModel.generateContentStream({
        contents: [...formatedHistory, { role: 'user', parts: [{ text: message }] }]
      })

      let fullAnswer = '';
      for await (const chunk of responseStream.stream) {
        const token = chunk.text();
        fullAnswer += token;
        yield { type: 'token', data: { token } };

      }

      await memoryService.addTurn(activeSessionId, message, fullAnswer);
      yield { type: 'done', data: { sessionId: activeSessionId } };
      return;
    }
    // Retrieve & evaluate context through CRAG pipeline
    const { isOutOfScope, context, sources } = await retrieveAndExpandContext(
      chatbotId,
      searchQuery
    );

    if (isOutOfScope) {
      const fallbackResponse = 'I cannot find the answer to your question in the uploaded documents.';
      yield { type: 'sources', data: { sessionId: activeSessionId, sources: [] } };
      yield { type: 'token', data: { token: fallbackResponse } };
      await memoryService.addTurn(activeSessionId, message, fallbackResponse);
      yield { type: 'done', data: { sessionId: activeSessionId } };
      return;
    }

    // Yield sources immediately so client can render citations while streaming
    yield { type: 'sources', data: { sessionId: activeSessionId, sources } };

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

    const formattedHistory = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    const contents = [...formattedHistory, { role: 'user', parts: [{ text: message }] }];

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction,
    });

    const responseStream = await model.generateContentStream({ contents });
    let fullAnswer = '';

    for await (const chunk of responseStream.stream) {
      const token = chunk.text();
      fullAnswer += token;
      yield { type: 'token', data: { token } };
    }

    await memoryService.addTurn(activeSessionId, message, fullAnswer);
    yield { type: 'done', data: { sessionId: activeSessionId } };
  },
};
