// src/utils/rerank.ts
import { env } from '../config/env.js';

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

interface CohereRerankResponse {
  results: CohereRerankResult[];
}

/**
 * Re-ranks a list of candidate text chunks against a query using Cohere's Cross-Encoder model.
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topN: number = 5
): Promise<string[]> {
  // Safe Fallback: If no Cohere key is configured, bypass rerank and return first-stage results
  if (!env.COHERE_API_KEY) {
    console.warn('⚠️ COHERE_API_KEY is not defined. Skipping reranking step.');
    return documents.slice(0, topN);
  }
  try {
    console.log(`⏳ Sending ${documents.length} candidates to Cohere Rerank...`);
    const response = await fetch('https://api.cohere.com/v1/rerank', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.COHERE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'rerank-english-v3.0',
        query,
        documents,
        top_n: topN,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cohere API error: ${response.status} - ${errorText}`);
    }
    const data = (await response.json()) as CohereRerankResponse;
    // Map rerank results back to original text chunks in their new order
    const rerankedTexts = data.results.map((res) => documents[res.index]!);
    console.log(`✅ Cohere Rerank complete. Kept top ${rerankedTexts.length} chunks.`);
    return rerankedTexts;
  } catch (error) {
    console.error('❌ Error during Cohere reranking:', error);
    // Fallback to top-n initial results if reranking fails
    return documents.slice(0, topN);
  }
}