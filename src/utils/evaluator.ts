import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export interface RagEvaluationResult {
  faithfulnessScore: number;
  faithfulnessReason: string;
  answerRelevanceScore: number;
  answerRelevanceReason: string;
  contextRelevanceScore: number;
  contextRelevanceReason: string;
  overallScore: number;            // Average of the three
  verdict: 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'FAILED';
}

/**
 * LLM-as-a-Judge Evaluation Engine.
 * Evaluates Faithfulness, Answer Relevance, and Context Relevance.
 */
export async function evaluateRagResponse(
  query: string,
  context: string,
  response: string
): Promise<RagEvaluationResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    generationConfig: {
      temperature: 0.0,
      responseMimeType: 'application/json',
    },
  });

  const prompt = `
    You are an expert AI Evaluator benchmarking a Retrieval-Augmented Generation (RAG) system.
    Analyze the following Question, Retrieved Context, and Generated Response based on the RAG Triad.

    [User Query]:
    ${query}

    [Retrieved Context]:
    ${context}

    [Generated Response]:
    ${response}

    Evaluation Criteria:
    1. Faithfulness (0.0 to 1.0):
    - Break down the generated response into individual factual claims.
    - What fraction of those claims are strictly supported by the Retrieved Context?
    - If the response contains claims not in the context, penalize heavily (hallucination).
    - If the response honestly states "I cannot find the answer", score 1.0.

    2. Answer Relevance (0.0 to 1.0):
    - Does the generated response directly and completely answer the User Query?
    - Penalize if it goes off-topic or avoids the core question.

    3. Context Relevance (0.0 to 1.0):
    - Did the retrieved context contain the necessary facts to answer the user query, or was it mostly irrelevant noise?

    Output ONLY a JSON object matching this schema:
    {
    "faithfulnessScore": number,
    "faithfulnessReason": "string explanation",
    "answerRelevanceScore": number,
    "answerRelevanceReason": "string explanation",
    "contextRelevanceScore": number,
    "contextRelevanceReason": "string explanation",
    "overallScore": number,
    "verdict": "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT" | "FAILED"
    }
  `.trim();

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = JSON.parse(text) as RagEvaluationResult;
    // Calculate overall average if not provided
    const avg = Number(
      (
        (parsed.faithfulnessScore +
          parsed.answerRelevanceScore +
          parsed.contextRelevanceScore) /
        3
      ).toFixed(2)
    );
    parsed.overallScore = avg;

    if (avg >= 0.85) parsed.verdict = 'EXCELLENT';
    else if (avg >= 0.7) parsed.verdict = 'GOOD';
    else if (avg >= 0.5) parsed.verdict = 'NEEDS_IMPROVEMENT';
    else parsed.verdict = 'FAILED';

    return parsed;
  } catch (err) {
    console.error('Failed to parse evaluation response:', text);
    throw new Error('Evaluation parsing error');
  }
}
