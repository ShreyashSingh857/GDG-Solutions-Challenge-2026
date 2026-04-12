import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) throw new Error('[Gemini] GEMINI_API_KEY is not set in environment variables');
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const MODEL_NAME = 'gemini-1.5-flash';

/**
 * Standard (non-streaming) Gemini generation.
 * @param {string} prompt - The user prompt
 * @param {object[]} [tools] - Optional Gemini function declarations array
 * @returns {Promise<string>} - The text response from Gemini
 */
export async function generate(prompt, tools = []) {
  try {
    const model = getGenAI().getGenerativeModel({
      model: MODEL_NAME,
      ...(tools.length > 0 && { tools: [{ functionDeclarations: tools }] }),
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    // Strip markdown code fences if present - Gemini sometimes wraps JSON in ```json
    const text = response.text();
    return text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  } catch (err) {
    console.error('[Gemini] generate() error:', err.message);
    throw err;
  }
}

/**
 * Streaming Gemini generation - yields text chunks as they arrive.
 * Used by the Resolution Agent to stream reasoning tokens to the dashboard via SSE.
 * @param {string} prompt - The user prompt
 * @param {object[]} [tools] - Optional Gemini function declarations array
 * @returns {AsyncGenerator<string>} - Async generator yielding text chunks
 */
export async function* generateStream(prompt, tools = []) {
  try {
    const model = getGenAI().getGenerativeModel({
      model: MODEL_NAME,
      ...(tools.length > 0 && { tools: [{ functionDeclarations: tools }] }),
    });

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (err) {
    console.error('[Gemini] generateStream() error:', err.message);
    throw err;
  }
}
