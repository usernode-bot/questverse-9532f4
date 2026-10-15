// RetroRig's client side of the rig's own API.
//
// One place that knows how to talk to the server, so every screen sends the
// iframe token the same way and reads the same shapes. Nothing here writes
// settings, saves or the collection anywhere but the server: the rig keeps no
// per-user state in the browser.

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
// The signed-in person's own rig, once the server has told us who they are.
// The screen shows the first part of it in the corner, like a login name.
let who = { id: null, username: '', signedIn: false };

export function setToken(value) {
  token = value || '';
}

export function identity() {
  return who;
}

// Every API call goes through here. The token rides in the same header the
// platform's iframe contract names, and the server decides everything else.
export async function api(path, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers || {});
  if (token) opts.headers['x-usernode-token'] = token;
  if (opts.body != null && !opts.headers['content-type']) {
    opts.headers['content-type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError(0, 'The rig could not reach the server.');
  }
  if (res.status === 204) return null;
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    throw new ApiError(res.status, (body && body.error) || 'The rig returned ' + res.status, body && body.code);
  }
  return body;
}

// Who is signed in, what the rig's settings are, the save slots and the
// catalogue, in one round trip.
export async function loadRig() {
  const me = await api('/api/me');
  who = { id: me.id != null ? String(me.id) : null, username: me.username || '', signedIn: !!me.username };
  return me;
}

export function isGuest() {
  return !who.signedIn;
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export async function saveSettings(settings) {
  return api('/api/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
}

/* ── The catalogue ──────────────────────────────────────────────────────── */

export async function listCatalogue() {
  const body = await api('/api/catalogue');
  return (body && body.entries) || [];
}

// The file never leaves the browser: the rig records its name, type and size,
// which is all "catalogued" ever meant. `usernode.uploadFile` is offered the
// file only when the viewer asks for a copy in platform storage, and its
// answer is stored alongside.
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

/* ── The Keyboard window's joystick mapping ─────────────────────────────── */

export async function saveBindings(bindings) {
  const body = await api('/api/keymap', { method: 'PUT', body: JSON.stringify({ bindings }) });
  return (body && body.bindings) || {};
}
