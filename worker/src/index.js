const ALLOWED_ORIGINS = new Set([
  'https://gobeynd.app',
  'https://www.gobeynd.app',
  'http://localhost:3000',
  'http://localhost:8787',
  'http://localhost:5500'
]);

const MAX_BODY_BYTES = 32 * 1024;
const MAX_QUESTION_CHARS = 800;
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CONTENT_CHARS = 2000;
const MAX_CONTEXT_CHARS = 12000;
const OPENAI_TIMEOUT_MS = 12000;
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const PLACEHOLDER_OPENAI_MODEL = 'gpt-4o-mini'; // Placeholder fallback only; prefer env.OPENAI_MODEL.
const WORKER_SYSTEM_PROMPT =
  'You are Beynd, a calm financial thinking partner and behavioural coach—not a financial adviser, therapist, hype coach, or budgeting robot. Answer only from the plan and conversation in Beynd. Bank connection is not live; do not imply live balances, transactions, or certainty beyond the context. Use softer framing such as "your plan suggests", "this month looks tighter", "this may help", and "it may be easier to". Avoid hard certainty, praise language, motivational hype, and generic assistant phrasing. Do not invent figures, targets, dates, or guarantees. Stay stability-first when the context calls for it, without repeating boilerplate or leaning on stability, priorities, and extra room in every reply. Prefer one practical next step; keep replies brief, human, and quiet—stop when the point is clear. Trust the user\'s intelligence; do not over-explain or add filler sentences. Prefer observational grounding ("this month looks heavier than expected") over naming emotions ("It sounds like you are feeling..."). When the user sounds scared, ashamed, or overwhelmed, one quiet grounding line and one gentle step—not therapy-style check-ins like "How does that feel?" or "Would that feel manageable?". Do not end every reply with a question; let answers land. Ask a follow-up only when it clearly reduces uncertainty or helps a real choice. No markdown, bold text, corporate advice tone, or long disclaimers.';

function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'req_' + Math.random().toString(36).slice(2);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function jsonResponse(body, status, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    Object.assign(headers, corsHeaders(origin));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isJsonRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

async function readJsonWithLimit(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: 'too_large' };
  }

  const body = await request.text();
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > MAX_BODY_BYTES) {
    return { error: 'too_large' };
  }
  try {
    return { value: JSON.parse(body) };
  } catch (_err) {
    return { error: 'invalid_json' };
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  if (
    typeof payload.question !== 'string' ||
    payload.question.trim().length === 0 ||
    payload.question.length > MAX_QUESTION_CHARS
  ) {
    return false;
  }
  if (!Array.isArray(payload.messages) || payload.messages.length > MAX_MESSAGES) {
    return false;
  }
  for (const message of payload.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return false;
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      return false;
    }
    if (
      typeof message.content !== 'string' ||
      message.content.trim().length === 0 ||
      message.content.length > MAX_MESSAGE_CONTENT_CHARS
    ) {
      return false;
    }
  }
  if (
    typeof payload.context !== 'string' ||
    payload.context.trim().length === 0 ||
    payload.context.length > MAX_CONTEXT_CHARS
  ) {
    return false;
  }
  if (
    payload.clientVersion != null &&
    (typeof payload.clientVersion !== 'string' || payload.clientVersion.length > 40)
  ) {
    return false;
  }
  return true;
}

function providerMessages(payload) {
  return [
    { role: 'system', content: WORKER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Context:\n${payload.context}`
    },
    ...payload.messages.map((message) => ({
      role: message.role,
      content: message.content
    })),
    { role: 'user', content: payload.question }
  ];
}

async function callOpenAI(payload, env) {
  if (!env || typeof env.OPENAI_API_KEY !== 'string' || env.OPENAI_API_KEY.trim().length === 0) {
    return { error: 'provider_unavailable' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model:
          typeof env.OPENAI_MODEL === 'string' && env.OPENAI_MODEL.trim().length > 0
            ? env.OPENAI_MODEL
            : PLACEHOLDER_OPENAI_MODEL,
        messages: providerMessages(payload),
        temperature: 0.4,
        max_completion_tokens: 500
      }),
      signal: controller.signal
    });

    if (response.status === 429) {
      return { error: 'rate_limit' };
    }
    if (!response.ok) {
      return { error: 'provider_unavailable' };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { error: 'provider_unavailable' };
    }

    return { text };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { error: 'timeout' };
    }
    return { error: 'provider_unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}

function safeErrorResponse(error, id, origin) {
  if (error === 'timeout') {
    return jsonResponse(
      { error: 'timeout', message: 'The provider timed out.', requestId: id },
      504,
      origin
    );
  }
  if (error === 'rate_limit') {
    return jsonResponse(
      { error: 'rate_limit', message: 'The provider is rate limited.', requestId: id },
      429,
      origin
    );
  }
  if (error === 'oversized_payload') {
    return jsonResponse(
      { error: 'oversized_payload', message: 'That was a bit too much to send.', requestId: id },
      413,
      origin
    );
  }
  if (error === 'invalid_payload') {
    return jsonResponse(
      { error: 'invalid_payload', message: 'That request was missing something.', requestId: id },
      400,
      origin
    );
  }
  return jsonResponse(
    { error: 'provider_unavailable', message: 'The provider is unavailable.', requestId: id },
    503,
    origin
  );
}

export default {
  async fetch(request, env) {
    const id = requestId();
    const origin = request.headers.get('origin') || '';

    if (!ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(
        { error: 'forbidden', message: 'Request origin is not allowed.', requestId: id },
        403,
        null
      );
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        { error: 'method_not_allowed', message: 'Method not allowed.', requestId: id },
        405,
        origin
      );
    }

    if (!isJsonRequest(request)) {
      return jsonResponse(
        { error: 'unsupported_media_type', message: 'Request must be JSON.', requestId: id },
        415,
        origin
      );
    }

    const parsed = await readJsonWithLimit(request);
    if (parsed.error === 'too_large') {
      return safeErrorResponse('oversized_payload', id, origin);
    }
    if (parsed.error === 'invalid_json') {
      return safeErrorResponse('invalid_payload', id, origin);
    }

    if (!validatePayload(parsed.value)) {
      return safeErrorResponse('invalid_payload', id, origin);
    }

    const providerResult = await callOpenAI(parsed.value, env);
    if (providerResult.error) {
      return safeErrorResponse(providerResult.error, id, origin);
    }

    return jsonResponse({ text: providerResult.text, requestId: id }, 200, origin);
  }
};
