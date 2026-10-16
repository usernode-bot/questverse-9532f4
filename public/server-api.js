// Pixmotion AI's client side of its own API.
//
// One place that knows how to talk to the server, so every screen sends the
// iframe token the same way and reads the same shapes. Nothing here writes
// a project, a clip or a chat turn anywhere but the server: the studio keeps
// no per-user state in the browser.

// A tiny typed error so a screen can tell "you are not signed in" apart from
// "the server said no" without parsing strings. `code` is the server's own
// word for what happened, which the assistant's handling switches on.
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message || 'Request failed');
    this.status = status;
    this.code = code || '';
  }
}

let token = '';

export function setToken(value) {
  token = value || '';
}

// The platform's own "now", sent on every call so a preview opened at a
// chosen moment is served as of that moment. The server reads it only in
// staging.
function nowHeader() {
  try {
    if (window.usernode && window.usernode.previewNow && typeof window.usernode.now === 'function') {
      return window.usernode.now().toISOString();
    }
  } catch { /* no preview moment: the server uses its own clock */ }
  return '';
}

// Every API call goes through here. The token rides in the same header the
// platform's iframe contract names, and the server decides everything else.
// Resolves the JSON body, with the two AI meter headers attached as
// `_meter` when the server echoed them.
export async function api(path, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers || {});
  if (token) opts.headers['x-usernode-token'] = token;
  const now = nowHeader();
  if (now) opts.headers['x-usernode-now'] = now;
  if (opts.body != null && !opts.headers['content-type']) {
    opts.headers['content-type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError(0, 'The studio could not reach the server.');
  }
  if (res.status === 204) return null;
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  const spent = Number(res.headers.get('x-usernode-llm-spent-cents'));
  const cap = Number(res.headers.get('x-usernode-llm-cap-cents'));
  const meter = Number.isFinite(spent) || Number.isFinite(cap)
    ? { spentCents: Number.isFinite(spent) ? spent : null, capCents: Number.isFinite(cap) ? cap : null } : null;
  if (!res.ok) {
    const err = new ApiError(res.status, (body && body.error) || 'The server returned ' + res.status, body && body.code);
    // A refused assistant call still carries the platform's meter.
    if (meter) err.meter = meter;
    throw err;
  }
  if (body && typeof body === 'object' && meter) body._meter = meter;
  return body;
}

// The whole studio in one round trip: who is signed in, the project (their
// own, the sample, or the default shape), its media, tracks, clips and
// transcript, and the assistant's own state.
export async function loadStudio() {
  return shapeStudio(await api('/api/studio'));
}

export function shapeStudio(body) {
  const b = body || {};
  return {
    username: b.username || '',
    signedIn: !!b.signedIn,
    project: b.project || null,
    media: Array.isArray(b.media) ? b.media : [],
    tracks: Array.isArray(b.tracks) ? b.tracks : [],
    clips: Array.isArray(b.clips) ? b.clips : [],
    transcript: Array.isArray(b.transcript) ? b.transcript : [],
    sample: !!b.sample,
    readOnly: !!b.readOnly,
    assistant: b.assistant || { enabled: false, model: null, lastSpentCents: null, lastCapCents: null },
    mediaId: b.mediaId || null,
  };
}

/* ── The project ────────────────────────────────────────────────────────── */

// Starts a person's own project (a copy of the sample when there is one).
export async function startProject() {
  return shapeStudio(await api('/api/projects', { method: 'POST', body: '{}' }));
}

// Only the keys present are written.
export async function saveProject(id, patch) {
  return shapeStudio(await api('/api/projects/' + encodeURIComponent(id), {
    method: 'PUT', body: JSON.stringify(patch || {}),
  }));
}

/* ── The media library ──────────────────────────────────────────────────── */

export async function addMedia(entry) {
  return shapeStudio(await api('/api/media', { method: 'POST', body: JSON.stringify(entry || {}) }));
}

export async function removeMedia(id) {
  return shapeStudio(await api('/api/media/' + encodeURIComponent(id), { method: 'DELETE' }));
}

// Persists a picture the bridge already uploaded. Only the URL and its file
// id travel here, never image bytes.
export async function saveMediaArt(id, art) {
  return shapeStudio(await api('/api/media/' + encodeURIComponent(id) + '/art', {
    method: 'PUT', body: JSON.stringify({ url: art.url, fileId: art.fileId }),
  }));
}

/* ── The timeline ───────────────────────────────────────────────────────── */

// The whole track and clip list, replaced at once.
export async function saveTimeline(projectId, tracks) {
  return shapeStudio(await api('/api/timeline', { method: 'PUT', body: JSON.stringify({ projectId, tracks }) }));
}

/* ── The assistant ──────────────────────────────────────────────────────── */

// Posts one message. Resolves `{ reply, model, spentCents, capCents }` on a
// reply and rejects with an ApiError carrying the server's code otherwise.
export async function askAssistant(projectId, text, history) {
  return api('/api/assistant', { method: 'POST', body: JSON.stringify({ projectId, text, history }) });
}

/* ── Platform file storage, for a clip's thumbnail ───────────────────────
 * The bridge owns file storage. When it is not there (a plain browser, or a
 * platform without storage) the caller degrades to the drawn plate and says
 * so; it never asks for an API key.
 */
export function uploadsAvailable() {
  return !!(window.usernode && typeof window.usernode.uploadFile === 'function');
}

// Returns `{ url, fileId }`, or null when storage is not reachable or refused
// the file. `fileId` is kept beside the URL so a later cleanup can name the
// previous file after a replace (platform files are immutable, so a replace
// uploads a new one rather than overwriting).
export async function uploadArt(file) {
  if (!uploadsAvailable()) return null;
  const result = await window.usernode.uploadFile(file);
  const url = typeof result === 'string' ? result : (result && (result.url || result.href));
  const fileId = result && typeof result === 'object'
    ? (result.fileId || result.file_id || result.id || null) : null;
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  return { url, fileId: fileId == null ? null : String(fileId) };
}
