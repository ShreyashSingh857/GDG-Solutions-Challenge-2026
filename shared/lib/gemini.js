// Best-effort local env loading: skip if dotenv is unavailable in this package context.
try {
  await import('dotenv/config');
} catch {
  // no-op
}

let GoogleGenerativeAIClass = null;

async function getGoogleGenerativeAIClass() {
  if (GoogleGenerativeAIClass) return GoogleGenerativeAIClass;

  try {
    const mod = await import('@google/generative-ai');
    GoogleGenerativeAIClass = mod.GoogleGenerativeAI;
    return GoogleGenerativeAIClass;
  } catch (err) {
    throw new Error(`[Gemini] @google/generative-ai is not available: ${err.message}`);
  }
}

async function getGenAI() {
  if (!process.env.GEMINI_API_KEY) throw new Error('[Gemini] GEMINI_API_KEY is not set in environment variables');
  const GoogleGenerativeAI = await getGoogleGenerativeAIClass();
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const rateLimitState = { blocked: false, unblockAt: 0, strikes: 0 };

function makeCooldownError(retryAfterMs) {
  const err = new Error('[Gemini] Rate-limited, cooling down before next request');
  err.code = 'GEMINI_RATE_LIMITED';
  err.retryAfterMs = retryAfterMs;
  return err;
}

function ensureNotRateLimited() {
  const now = Date.now();
  if (rateLimitState.blocked && now < rateLimitState.unblockAt) {
    throw makeCooldownError(rateLimitState.unblockAt - now);
  }
  if (now >= rateLimitState.unblockAt) {
    rateLimitState.blocked = false;
  }
}

function clearRateLimitState() {
  rateLimitState.blocked = false;
  rateLimitState.unblockAt = 0;
  rateLimitState.strikes = 0;
}

function handleRateLimit(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) {
    const baseMs = 60_000;
    const maxMs = 10 * 60_000;
    rateLimitState.strikes = Math.min(rateLimitState.strikes + 1, 8);
    const cooldownMs = Math.min(baseMs * (2 ** (rateLimitState.strikes - 1)), maxMs);
    rateLimitState.blocked = true;
    rateLimitState.unblockAt = Date.now() + cooldownMs;
    console.warn(`[Gemini] Rate limit detected; cooling down ${Math.round(cooldownMs / 1000)}s`);
  }
}

function extractSafeText(response) {
  const candidate = response?.candidates?.[0];
  if (!candidate || String(candidate.finishReason || '').toUpperCase() === 'SAFETY') {
    console.warn('[Gemini] Response blocked by safety filter');
    return null;
  }

  const text = response?.text?.() ?? '';
  return text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
}

/**
 * Standard (non-streaming) Gemini generation.
 * @param {string} prompt - The user prompt
 * @param {object[]} [tools] - Optional Gemini function declarations array
 * @returns {Promise<string>} - The text response from Gemini
 */
export async function generate(prompt, tools = []) {
  try {
    ensureNotRateLimited();
    const genAI = await getGenAI();
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      ...(tools.length > 0 && { tools: [{ functionDeclarations: tools }] }),
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    clearRateLimitState();

    return extractSafeText(response);
  } catch (err) {
    handleRateLimit(err);
    console.error('[Gemini] generate() error:', err.message);
    throw err;
  }
}

export async function generateWithTools(prompt, tools = [], toolHandlers = {}) {
  try {
    ensureNotRateLimited();
    const genAI = await getGenAI();
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
    });
    const chat = model.startChat();
    let result = await chat.sendMessage(prompt);
    for (let i = 0; i < 5; i++) {
      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      const toolCalls = parts.filter((p) => p.functionCall);
      if (toolCalls.length === 0) break;
      const toolResults = await Promise.all(toolCalls.map(async (p) => {
        const fn = p.functionCall;
        const handler = toolHandlers[fn.name];
        const output = handler ? await handler(fn.args).catch((e) => ({ error: e.message })) : { error: 'no handler' };
        return { functionResponse: { name: fn.name, response: output } };
      }));
      result = await chat.sendMessage(toolResults);
    }
    const text = extractSafeText(result.response);
    clearRateLimitState();
    return text;
  } catch (err) {
    handleRateLimit(err);
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
    ensureNotRateLimited();
    const genAI = await getGenAI();
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      ...(tools.length > 0 && { tools: [{ functionDeclarations: tools }] }),
    });

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
    const candidate = result.response?.candidates?.[0];
    if (!candidate || String(candidate.finishReason || '').toUpperCase() === 'SAFETY') {
      console.warn('[Gemini] Stream blocked by safety filter');
      return;
    }
    clearRateLimitState();
  } catch (err) {
    handleRateLimit(err);
    console.error('[Gemini] generateStream() error:', err.message);
    throw err;
  }
}
