const ALLOWED_ORIGINS = new Set([
  'https://gobeynd.app',
  'https://www.gobeynd.app',
  'http://localhost:8787',
  'http://localhost:5500'
]);

const MAX_BODY_BYTES = 16 * 1024;

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
  if (typeof payload.question !== 'string' || payload.question.trim().length === 0) {
    return false;
  }
  if (!Array.isArray(payload.messages)) {
    return false;
  }
  if (typeof payload.context !== 'string' || payload.context.trim().length === 0) {
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

export default {
  async fetch(request) {
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
      return jsonResponse(
        { error: 'too_large', message: 'That was a bit too much to send.', requestId: id },
        413,
        origin
      );
    }
    if (parsed.error === 'invalid_json') {
      return jsonResponse(
        { error: 'invalid_json', message: 'That request could not be read.', requestId: id },
        400,
        origin
      );
    }

    if (!validatePayload(parsed.value)) {
      return jsonResponse(
        { error: 'invalid_payload', message: 'That request was missing something.', requestId: id },
        400,
        origin
      );
    }

    return jsonResponse(
      { text: 'Ask Beynd worker is reachable.', requestId: id },
      200,
      origin
    );
  }
};
