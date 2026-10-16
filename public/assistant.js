// The one place that knows how to talk to the platform's text AI and to the
// bridge's grant functions.
//
// It never holds a key and never calls a third party: a message goes to this
// app's own /api/assistant, which forwards it to the platform's Claude proxy
// under the reader's own consent grant. The three response handlers below
// are pure functions of a status and a code, so a test can drive them with
// fabricated answers and no browser.

// Every sentence the widget prints for a platform state, once.
export const MESSAGES = {
  sends: 'Sends your message to the platform\'s text AI. Charged to your own daily AI budget.',
  manage: 'Manage AI permissions in the platform\'s Settings.',
  declines: 'The assistant declines sexual or explicit content, anything showing children, and violent, weapon and gambling topics.',
  unavailable: 'AI assistant unavailable in this environment.',
  unavailableDetail: 'In the published app the assistant answers with the platform\'s own text AI, '
    + 'charged to your own daily AI budget.',
  notGranted: 'AI permission not granted',
  declined: 'AI permission declined. Manage AI permissions in the platform\'s Settings.',
  appCap: 'Daily AI cap for this app reached, resets at midnight UTC.',
  budget: 'Your daily AI budget is used up for today, resets at midnight UTC.',
  guest: 'Sign in to Homeroom to send a message. A guest can read the transcript.',
  failed: 'The assistant did not answer. Nothing was charged. Try again in a moment.',
  meterLabel: 'AI today',
  limitLabel: 'limit',
  appLimit: 'This app\'s AI limit is reached: a quarter of your daily AI cap for this app. It resets at midnight UTC.',
};

// The share of the platform's reported daily cap the app stops at. The
// server mirrors it (SPEND_SHARE in lib/llm-proxy.js); a test asserts the
// two stay equal.
export const LIMIT_SHARE = 0.25;

// A cents figure, possibly fractional, printed as dollars. The one place.
export function formatCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n < 0) return '$0.00';
  return '$' + (n / 100).toFixed(2);
}

// The meter's three states, from the pieces the widget has:
//   enabled      the server's own LLM_ENABLED flag
//   grant        what usernode.getLlmUsage() resolved, or null when it rejected
//   last         { spentCents, capCents } from the last reply, or null
export function usageState(enabled, grant, last) {
  if (!enabled) return { state: 'unavailable', text: MESSAGES.unavailable, spent: null, cap: null, pct: 0 };
  if (grant && grant.granted === true) {
    return reading(grant.spentCentsToday, grant.dailyCapCents);
  }
  if (grant && grant.granted === false) {
    return { state: 'not-granted', text: MESSAGES.notGranted, spent: null, cap: null, pct: 0 };
  }
  if (last && Number.isFinite(Number(last.spentCents)) && Number.isFinite(Number(last.capCents))) {
    return reading(last.spentCents, last.capCents);
  }
  return { state: 'unavailable', text: MESSAGES.unavailable, spent: null, cap: null, pct: 0 };
}

function reading(spent, cap) {
  const s = Math.max(0, Number(spent) || 0);
  const c = Math.max(0, Number(cap) || 0);
  const limit = c * LIMIT_SHARE;
  const pct = limit > 0 ? Math.min(100, (s / limit) * 100) : 0;
  return {
    state: 'reading',
    text: MESSAGES.meterLabel + ' ' + formatCents(s) + ' of ' + formatCents(c)
      + ', ' + MESSAGES.limitLabel + ' ' + formatCents(limit),
    spent: s,
    cap: c,
    limit,
    pct,
    warn: limit > 0 && pct >= 90,
    limited: limit > 0 && s >= limit,
  };
}

// Reads the meter: the bridge first (no consent dialog, no spend), then the
// last reply's headers. A rejection means there is no platform shell.
export async function readUsage(assistant, bridge) {
  const info = assistant || {};
  let grant = null;
  const fn = bridge && typeof bridge.getLlmUsage === 'function' ? bridge.getLlmUsage : null;
  if (info.enabled && fn) {
    try { grant = await fn.call(bridge); } catch { grant = null; }
  }
  const last = info.lastSpentCents != null && info.lastCapCents != null
    ? { spentCents: info.lastSpentCents, capCents: info.lastCapCents } : null;
  return usageState(!!info.enabled, grant, last);
}

// What one server answer means to the widget. `status` and `code` are what
// /api/assistant answered; the result names the state and the sentence.
export function classify(status, code) {
  if (status === 200) return { state: 'reply' };
  if (status === 401) return { state: 'guest', text: MESSAGES.guest };
  if (status === 403 && code === 'grant_required') return { state: 'grant_required' };
  if (status === 429 && code === 'app_cap_exceeded') return { state: 'app_cap', text: MESSAGES.appCap };
  if (status === 429 && code === 'app_limit_reached') return { state: 'app_limit', text: MESSAGES.appLimit };
  if (status === 429 && code === 'budget_exceeded') return { state: 'budget', text: MESSAGES.budget };
  if (status === 503 && code === 'assistant_unavailable') {
    return { state: 'unavailable', text: MESSAGES.unavailable };
  }
  return { state: 'failed', text: MESSAGES.failed };
}

// Sends one message. `deps.post(text, history)` resolves the server's body
// on 200 and rejects with an error carrying `status` and `code` otherwise;
// `deps.requestAccess()` is usernode.requestLlmAccess. On grant_required the
// platform's own dialog is opened and the same message is posted once more
// if granted. A 429 is never retried.
export async function sendMessage(text, history, deps) {
  const post = deps && deps.post;
  const requestAccess = deps && deps.requestAccess;
  const attempt = async () => {
    try {
      const body = await post(text, history);
      return { ok: true, status: 200, body };
    } catch (err) {
      return { ok: false, status: Number(err && err.status) || 0, code: (err && err.code) || '' };
    }
  };
  let res = await attempt();
  if (res.ok) return { state: 'reply', reply: res.body };
  let outcome = classify(res.status, res.code);
  if (outcome.state === 'grant_required') {
    let grant = null;
    if (typeof requestAccess === 'function') {
      try { grant = await requestAccess(); } catch { grant = null; }
    }
    if (!grant || grant.granted !== true) {
      return { state: 'declined', text: MESSAGES.declined };
    }
    res = await attempt();
    if (res.ok) return { state: 'reply', reply: res.body };
    outcome = classify(res.status, res.code);
    if (outcome.state === 'grant_required') return { state: 'declined', text: MESSAGES.declined };
  }
  return outcome;
}

// The transcript, trimmed to the last ten turns in the shape the proxy takes.
export function historyFor(transcript) {
  return (Array.isArray(transcript) ? transcript : [])
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.body === 'string' && t.body.trim())
    .slice(-10)
    .map((t) => ({ role: t.role, content: t.body }));
}
