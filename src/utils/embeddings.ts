// src/utils/embeddings.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Generates a 768-dimensional vector embedding for a single text string.
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text }] },
      outputDimensionality: 768 // Truncates from 3072 to 768
    } as any);
    return result.embedding.values;
  } catch (error) {
    console.error('❌ Error generating single embedding:', error);
    throw error;
  }
}

/**
 * Generates vector embeddings for an array of text chunks in a multi-batch request.
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  try {
    if (chunks.length === 0) return [];

    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];

    // Loop through all chunks in steps of 100
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const currentBatchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

      console.log(`⏳ Embedding batch ${currentBatchNumber}/${totalBatches}...`);

      const result = await model.batchEmbedContents({
        requests: batch.map((chunk) => ({
          content: { role: 'user', parts: [{ text: chunk }] },
          model: `models/${EMBEDDING_MODEL}`,
          outputDimensionality: 768 // Truncates from 3072 to 768
        })),
      });

      const batchEmbeds = result.embeddings.map((e) => e.values);
      allEmbeddings.push(...batchEmbeds);
    }

    return allEmbeddings;
  } catch (error) {
    console.error('❌ Error generating batch embeddings:', error);
    throw error;
  }
}
