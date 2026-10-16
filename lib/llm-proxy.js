// The server's one path to the platform's Claude proxy.
//
// Kept apart from server.js so a test can assert the request it builds and
// the way it reads the proxy's meter headers without a database or a
// network. It never retries anything and never leaks upstream text.

const ANTHROPIC_VERSION = '2023-06-01';

// The request to the proxy: the app's own token plus the caller's forwarded
// iframe token. The user token is the one from the verified request header,
// never a value from the body.
function buildProxyRequest({ proxyUrl, appToken, userToken, body }) {
  const base = String(proxyUrl || '').replace(/\/+$/, '');
  return {
    url: base + '/v1/messages',
    options: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        'x-usernode-app-token': String(appToken || ''),
        'x-usernode-user-token': String(userToken || ''),
      },
      body: JSON.stringify(body || {}),
    },
  };
}

// The spend meter the proxy puts on every reply after auth. Spent may be
// fractional; cap is integer cents. Either is null when absent.
function parseMeterHeaders(headers) {
  const get = (name) => {
    if (!headers) return null;
    const v = typeof headers.get === 'function' ? headers.get(name) : headers[name];
    return v == null ? null : String(v);
  };
  const num = (raw) => (raw == null || raw === '' ? null : Number(raw));
  const spent = num(get('x-usernode-llm-spent-cents'));
  const cap = num(get('x-usernode-llm-cap-cents'));
  return {
    spentCents: Number.isFinite(spent) ? spent : null,
    capCents: Number.isFinite(cap) ? Math.round(cap) : null,
  };
}

// The reply's text: the concatenation of its text blocks, nothing else.
function replyText(body) {
  const content = body && Array.isArray(body.content) ? body.content : [];
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
    .trim();
}

// One call. Resolves { status, code, text, model, meter }. `fetchImpl` is
// injectable for a test; `status` 0 means the proxy could not be reached.
async function callProxy({ proxyUrl, appToken, userToken, body, fetchImpl }) {
  const req = buildProxyRequest({ proxyUrl, appToken, userToken, body });
  const doFetch = fetchImpl || fetch;
  let res;
  try {
    res = await doFetch(req.url, req.options);
  } catch {
    return { status: 0, code: 'assistant_failed', text: '', model: null, meter: { spentCents: null, capCents: null } };
  }
  const meter = parseMeterHeaders(res.headers);
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status === 200) {
    return { status: 200, code: '', text: replyText(json), model: (json && json.model) || null, meter };
  }
  const code = json && typeof json.code === 'string' ? json.code : '';
  if (res.status === 403 && code === 'grant_required') return { status: 403, code, text: '', model: null, meter };
  if (res.status === 429 && (code === 'app_cap_exceeded' || code === 'budget_exceeded')) {
    return { status: 429, code, text: '', model: null, meter };
  }
  return { status: 502, code: 'assistant_failed', text: '', model: null, meter };
}

module.exports = { buildProxyRequest, parseMeterHeaders, replyText, callProxy, ANTHROPIC_VERSION };
