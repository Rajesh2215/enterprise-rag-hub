import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

/**
 * Expands a single user query into 3 distinct, keyword-rich search variations.
 */
export async function expandQuery(query: string): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      generationConfig: {
        temperature: 0.0,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `
      You are an expert AI search optimizer.
      Given the following user search query, generate 3 diverse search query variations with complementary keywords, synonyms, and sub-topics.

      [Original Query]:
      "${query}"

      Output ONLY a JSON array of strings containing exactly 3 query variations:
      ["variation 1", "variation 2", "variation 3"]
    `.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const variations = JSON.parse(text) as string[];

    if (Array.isArray(variations) && variations.length > 0) {
      return variations.slice(0, 3);
    }
    return [query];
  } catch (error) {
    console.error('Query expansion error:', error);
    return [query]; // Fallback to original
  }
}
