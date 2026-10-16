// GameWatch's client side of its own API.
//
// One place that knows how to talk to the server, so every screen sends the
// iframe token the same way and reads the same shapes. Nothing here writes
// settings, saves, the skin or a snapshot anywhere but the server: the
// handheld keeps no per-user state in the browser.

// A tiny typed error so a screen can tell "you are not signed in" apart from
// "the server said no" without parsing strings.
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
    throw new ApiError(0, 'GameWatch could not reach the server.');
  }
  if (res.status === 204) return null;
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    throw new ApiError(res.status, (body && body.error) || 'The server returned ' + res.status, body && body.code);
  }
  return body;
}

// Who is signed in and everything the handheld keeps for them, in one round
// trip: the settings, the key mapping, the saves, the skin, the snapshots, the
// Arcade's titles and the banner's own slide list.
export async function loadWatch() {
  const body = await api('/api/me');
  return {
    id: body && body.id != null ? String(body.id) : null,
    username: (body && body.username) || '',
    signedIn: !!(body && body.username),
    settings: (body && body.settings) || null,
    bindings: (body && body.bindings) || null,
    saves: (body && body.saves) || [],
    skin: (body && body.skin) || null,
    snapshots: (body && body.snapshots) || [],
    titles: (body && body.titles) || [],
    slides: (body && body.slides) || [],
  };
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export async function saveSettings(settings) {
  const body = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
  return body && body.settings;
}

/* ── The key mapping ────────────────────────────────────────────────────── */

export async function saveBindings(bindings) {
  const body = await api('/api/keymap', { method: 'PUT', body: JSON.stringify({ bindings }) });
  return (body && body.bindings) || {};
}

/* ── The Arcade's titles ─────────────────────────────────────────────────
 * The eight built-ins and every added title are rows now. `listTitles` is the
 * whole collection; `saveTitle` is the manager's write.
 */

export async function listTitles() {
  const body = await api('/api/titles');
  return (body && body.titles) || [];
}

// A title's words, its control list and its art. Art is always an image URL
// platform storage returned, never image bytes: the bytes go up through the
// bridge and only the URL (and its file id, so a later cleanup can name it) is
// stored here.
export async function saveTitle(title) {
  const body = await api('/api/titles/' + encodeURIComponent(title.id), {
    method: 'PUT',
    body: JSON.stringify(title),
  });
  return body && body.title;
}

export async function deleteTitle(id) {
  await api('/api/titles/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ── The hero banner's slides (per person) ─────────────────────────────── */

export async function listBanner() {
  const body = await api('/api/banner');
  return (body && body.slides) || [];
}

export async function saveBanner(slides) {
  const body = await api('/api/banner', { method: 'PUT', body: JSON.stringify({ slides }) });
  return (body && body.slides) || [];
}

/* ── The Arcade's own added titles (the older admin panel) ─────────────── */

export async function listCatalogue() {
  const body = await api('/api/catalogue');
  return (body && body.entries) || [];
}

export async function addCatalogueEntry(entry) {
  const body = await api('/api/catalogue', { method: 'POST', body: JSON.stringify(entry) });
  return body && body.entry;
}

export async function removeCatalogueEntry(id) {
  await api('/api/catalogue/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ── Memory Card slots ──────────────────────────────────────────────────── */

export async function listSaves() {
  const body = await api('/api/saves');
  return (body && body.saves) || [];
}

export async function saveSlot(gameId, slot, state, label) {
  const body = await api('/api/saves/' + encodeURIComponent(gameId) + '/' + encodeURIComponent(slot), {
    method: 'PUT',
    body: JSON.stringify({ state, label }),
  });
  return body && body.save;
}

export async function deleteSlot(gameId, slot) {
  await api('/api/saves/' + encodeURIComponent(gameId) + '/' + encodeURIComponent(slot), { method: 'DELETE' });
}

/* ── The OS screen: the chosen skin and the transcript ──────────────────── */

export async function getSkin() {
  const body = await api('/api/skin');
  return body || null;
}

// `transcript` is the lines the OS screen then reads back, so re-provisioning
// leaves a record of what it said it did.
export async function saveSkin(skin, transcript) {
  const body = await api('/api/skin', { method: 'PUT', body: JSON.stringify({ skin, transcript }) });
  return body || null;
}

/* ── The Features screen: snapshots and their retention ─────────────────── */

export async function listSnapshots() {
  const body = await api('/api/snapshots');
  return (body && body.snapshots) || [];
}

export async function takeSnapshot(label) {
  const body = await api('/api/snapshots', { method: 'POST', body: JSON.stringify({ label }) });
  return body && body.snapshot;
}

export async function deleteSnapshot(id) {
  await api('/api/snapshots/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ── Install UFW: a fixed, simulated transcript ──────────────────────────
 * The server streams a canned install log. Nothing is installed, no shell is
 * run and no host is reached, so staging and production run the identical
 * path. The caller appends each line as it arrives.
 */
export async function streamInstallUfw(onLine, options) {
  const opts = Object.assign({ method: 'POST', headers: {} }, options || {});
  if (token) opts.headers['x-usernode-token'] = token;
  const now = nowHeader();
  if (now) opts.headers['x-usernode-now'] = now;
  let res;
  try {
    res = await fetch('/api/install-ufw', opts);
  } catch {
    throw new ApiError(0, 'GameWatch could not reach the server.');
  }
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    throw new ApiError(res.status, (body && body.error) || 'The install did not start', body && body.code);
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    // No streaming support: fall back to the whole body at once.
    const text = await res.text();
    for (const line of text.split('\n')) if (line) onLine(line);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let at = buffer.indexOf('\n');
    while (at >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (line) onLine(line);
      at = buffer.indexOf('\n');
    }
  }
  if (buffer) onLine(buffer);
}

/* ── Platform file storage, for a title's cover image ────────────────────
 * The bridge owns file storage. When it is not there (a plain browser, or a
 * platform without storage) the caller degrades to the drawn cover and says
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

// Kept for the older admin panel, which only wants the URL.
export async function uploadCover(file) {
  const art = await uploadArt(file);
  return art ? art.url : null;
}
