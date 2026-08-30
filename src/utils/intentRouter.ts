import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export type QueryIntent = 'CHITCHAT' | 'KNOWLEDGE_QUERY';

/**
 * Classifies whether a user message is general chitchat/greeting
 * or a knowledge query requiring document retrieval.
 */
export async function classifyIntent(message: string): Promise<QueryIntent> {
  const trimmed = message.trim().toLowerCase();

  // Instant heuristic fast-path for common single-word greetings (0ms)
  const commonChitchat = new Set([
    'hi', 'hello', 'hey', 'good morning', 'good evening',
    'good afternoon', 'thanks', 'thank you', 'bye', 'goodbye', 'help'
  ]);
  if (commonChitchat.has(trimmed)) {
    return 'CHITCHAT';
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      generationConfig: {
        temperature: 0.0,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `
      You are an expert intent classifier for an enterprise chatbot.
      Classify the user message into exactly one of two categories:
      1. "CHITCHAT": General greetings, politeness, pleasantries, thanking, bot identity questions ("who are you?", "what can you do?").
      2. "KNOWLEDGE_QUERY": Any question or request asking for factual information, business policies, technical details, or document lookup.

      [User Message]:
      "${message}"

      Output ONLY a JSON object:
      { "intent": "CHITCHAT" | "KNOWLEDGE_QUERY" }
    `.trim();

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as { intent: QueryIntent };

    return parsed.intent === 'CHITCHAT' ? 'CHITCHAT' : 'KNOWLEDGE_QUERY';
  } catch (error) {
    console.error('Intent classification error, defaulting to KNOWLEDGE_QUERY:', error);
    return 'KNOWLEDGE_QUERY'; // Safe default
  }
}
