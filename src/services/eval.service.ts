import { GoogleGenerativeAI } from '@google/generative-ai';
import { chatbotRepo } from '../repositories/chatbot.repository.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { embedText } from '../utils/embeddings.js';
import { env } from '../config/env.js';
import { rerankDocuments } from '../utils/rerank.js';
import { BM25Index, reciprocalRankFusion, type SearchCandidate } from '../utils/bm25.js';
import { chunkRepo } from '../repositories/chunk.repository.js';
import { parentChunkRepo } from '../repositories/parentChunk.repository.js';
import { evaluateRagResponse, type RagEvaluationResult } from '../utils/evaluator.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export interface EvaluationReport {
  testQuery: string;
  generatedAnswer: string;
  retrievedContextSnippets: string[];
  evaluation: RagEvaluationResult;
}

export const evalService = {
  async evaluate(
    chatbotId: string,
    testQuery: string,
    userId: string
  ): Promise<EvaluationReport> {
    const chatbot = await chatbotRepo.findById(chatbotId, userId);
    if (!chatbot) throw new Error('Chatbot not found');

    // 1. Run Parallel Hybrid Search (Dense + Sparse)
    const [denseCandidates, sparseCandidates] = await Promise.all([
      (async (): Promise<SearchCandidate[]> => {
        const queryEmbedding = await embedText(testQuery);
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

      (async (): Promise<SearchCandidate[]> => {
        const mongoChunks = await chunkRepo.findAllByChatbot(chatbotId);
        if (mongoChunks.length === 0) return [];
        const bm25 = new BM25Index(mongoChunks);
        const bm25Matches = bm25.search(testQuery, 15);
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

    // 2. RRF Fusion & Cohere Rerank
    const fusedCandidates = reciprocalRankFusion(denseCandidates, sparseCandidates, 60);
    const rerankedResults = await rerankDocuments(
      testQuery,
      fusedCandidates.map((c) => c.text),
      5
    );

    // 3. Parent-Child Auto-Merging
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

    const contextBlocks: string[] = [];
    const seenContexts = new Set<string>();

    topCandidates.forEach((candidate) => {
      const parentId = (candidate as any).parentId;
      const fullText = (parentId && parentMap.get(parentId)) || candidate.text;
      if (seenContexts.has(fullText)) return;
      seenContexts.add(fullText);

      contextBlocks.push(
        `[Document: "${candidate.documentTitle}"]:\n${fullText}`
      );
    });

    const context = contextBlocks.join('\n\n');

    // 4. Generate Response with Gemini
    const systemInstruction = `
      You are a helpful AI assistant.
      Your custom chatbot persona instructions:
      ${chatbot.systemPrompt || 'Answer the user query professionally.'}

      Grounding & Citation Instructions:
      1. You must answer the user's question ONLY using the provided retrieved context.
      2. If the context does not contain the answer, say exactly: "I cannot find the answer in the uploaded documents." Do not try to make up or hallucinate any facts.
      3. Always ground your facts directly in the sources provided.

      Retrieved Context:
      ${context}
    `.trim();

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction,
    });

    const genResult = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: testQuery }] }],
    });
    const generatedAnswer = genResult.response.text();

    // 5. Run LLM-as-a-Judge Evaluation on the output
    console.log(`⚖️ Running LLM-as-a-Judge evaluation for query: "${testQuery}"...`);
    const evaluation = await evaluateRagResponse(testQuery, context, generatedAnswer);

    return {
      testQuery,
      generatedAnswer,
      retrievedContextSnippets: contextBlocks.map((b) => b.slice(0, 150) + '...'),
      evaluation,
    };
  },
};
