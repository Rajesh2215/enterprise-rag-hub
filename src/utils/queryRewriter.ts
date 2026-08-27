// src/utils/queryRewriter.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import type { ChatMessage } from '../services/memory.service.js';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const REWRITE_SYSTEM_PROMPT = `
  You are an expert query reformulation assistant for a Retrieval-Augmented Generation (RAG) search engine.
  Your task:
  Given a chat history between a user and an AI assistant, and a follow-up question from the user:
  1. Reformulate the follow-up question into a standalone, fully self-contained search query.
  2. Resolve all pronouns (like "it", "he", "she", "that policy", "this error", etc.) using the conversation context.
  3. Keep domain keywords intact.
  4. If the question is ALREADY standalone and does not depend on history, return it exactly as is.
  5. DO NOT answer the question. ONLY return the standalone rewritten search query string.
`.trim();

export async function rewriteQuery(
  currentMessage: string,
  history: ChatMessage[]
): Promise<string> {
  // If there is no previous history, no rewriting is needed
  if (!history || history.length === 0) {
    return currentMessage;
  }

  try {
    const formattedHistory = history
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const prompt = `
      <conversation_history>
      ${formattedHistory}
      </conversation_history>

      <follow_up_question>
      ${currentMessage}
      </follow_up_question>

      Standalone Search Query:
    `.trim();

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: REWRITE_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.0, // Zero temperature for deterministic rewriting
      },
    });

    const result = await model.generateContent(prompt);
    const rewrittenQuery = result.response.text().trim();

    console.log(`🔄 Query Rewritten: "${currentMessage}" ➔ "${rewrittenQuery}"`);
    return rewrittenQuery || currentMessage;
  } catch (error) {
    console.error('⚠️ Query rewriting failed, falling back to original message:', error);
    return currentMessage;
  }
}
