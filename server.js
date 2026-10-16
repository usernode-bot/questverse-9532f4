const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Staging swaps DATA and suppresses irreversible outbound effects, never a
// feature or a code path. Here it gates the demo seed rows, and the preview
// moment a tester may open the app at.
const IS_STAGING = process.env.USERNODE_ENV === 'staging';

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// A guest (someone with no Homeroom account) carries a token from a key of
// its own, in the same header. It is verified separately below and only ever
// sets `req.guest`: a guest reads, and every write needs an account.
const GUEST_JWT_PUBLIC_KEY = (process.env.USERNODE_GUEST_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;
const GUEST_AUDIENCE = APP_AUDIENCE ? APP_AUDIENCE + ':guest' : null;

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

app.use(express.json({ limit: '64kb' }));

// The platform's three centrally hosted files — the bridge, the native UI
// kit and the Tailwind runtime — are reachable at these paths on this app's
// OWN origin, so index.html can load them with a RELATIVE path and never
// name the platform's hostname. A hostname baked into an app is what breaks
// every app at once when the platform's domain moves.
//
// In production and on a staging preview the platform's edge answers these
// before the request ever reaches this process. This handler is what makes
// the same relative paths work under a plain `node server.js`, where there
// is no edge in front of the app at all. It is registered BEFORE the auth
// middleware because these files are public.
//
// The platform's origin, at RUNTIME, and ONLY from the variable the platform
// injects. No hostname is written into this file.
const PLATFORM_ORIGIN = (process.env.USERNODE_PLATFORM_ORIGIN || '')
  .replace(/\/+$/, '');

app.get(/^\/usernode-(?:bridge|native|tailwind)\//, async (req, res) => {
  try {
    if (!PLATFORM_ORIGIN) return res.sendStatus(503);
    const upstream = await fetch(PLATFORM_ORIGIN + req.path);
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type');
    if (type) res.type(type);
    // max-age=0 with revalidation, never a long TTL: the whole point of
    // central hosting is that a platform-side fix lands on the next load.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.warn('hosted asset fetch failed: ' + err.message);
    return res.sendStatus(502);
  }
});

/* ── "Now", so a preview can be shown as of a chosen moment ───────────────
 * The Features screen's two-month snapshot retention is the only thing here
 * that reasons about a date, so the moment a preview was opened at has to
 * reach the server. Staging only, and only the value of "now" changes: the
 * code path is the same everywhere.
 */
const PREVIEW_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function requestNow(req) {
  const raw = IS_STAGING ? (req.headers['x-usernode-now'] || req.query['un-now']) : null;
  return typeof raw === 'string' && PREVIEW_NOW.test(raw) ? new Date(raw) : new Date();
}
app.use((req, _res, next) => { req.now = requestNow(req); next(); });

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_PUBLIC_KEY && APP_AUDIENCE) {
    try {
      // Pin the algorithm, issuer and audience. Without `algorithms` a
      // caller could hand us an HS256 token signed with the public PEM
      // (which every app knows) and forge any user.
      const claims = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'usernode',
        audience: APP_AUDIENCE,
      });
      // `pur` names what the token is for. Only user-identity tokens
      // authenticate a person here.
      if (claims && claims.pur === 'iframe') req.user = claims;
    } catch {}
  }
  // A separate key and a separate audience, so a verifier written for a
  // person's token can never accept a guest's, or the other way round. A
  // guest is never req.user.
  if (!req.user && token && GUEST_JWT_PUBLIC_KEY && GUEST_AUDIENCE) {
    try {
      const claims = jwt.verify(token, GUEST_JWT_PUBLIC_KEY, {
        algorithms: ['ES256'],
        issuer: 'usernode',
        audience: GUEST_AUDIENCE,
      });
      if (claims && claims.pur === 'guest' && claims.guest === true) req.guest = true;
    } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (req.method === 'GET' && req.path.startsWith('/api/') && req.guest) return next();
    if (!req.user) {
      // A guest's write is refused by name, so the platform's own sheet can
      // offer to make an account and come back to this screen.
      if (req.guest) return res.status(401).json({ error: 'account_required' });
      return res.status(401).json({ error: 'Not authenticated' });
    }
  }
  next();
});

app.get('/health', (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'draining' });
  res.json({ status: 'ok' });
});

// The template shipped no favicon file; index.html carries an inline SVG
// icon instead. Answer 204 here so anything that still probes
// /favicon.ico doesn't fall through to the auth-gated catch-all.
app.get('/favicon.ico', (_req, res) => res.status(204).end());

/* ── GameWatch's data ──────────────────────────────────────────────────────
 * Everything a person's handheld keeps lives here, keyed by the platform
 * user id from the verified token: the settings the screens read, the
 * handheld key mapping, the Memory Card slots, the OS skin, the snapshots
 * and the covers added in the Arcade. Nothing is kept in the browser.
 *
 * Every table is public by default: they hold one person's own panel
 * settings, their own key mapping, their own save states and their own
 * snapshot labels. A stranger seeing every row would see the same thing the
 * app shows that person on their own screen. No secrets, no messages, no
 * personal information beyond the platform username.
 */

// The settings are the panel's picture and sound, each with the range the
// on-screen slider offers. The defaults are the handheld's shipping picture:
// soft scanlines, a gently curved panel, sound up. A fixed LCD panel has no
// aspect to choose and no frame skip to set, so neither is offered any more.
const SETTINGS_DEFAULTS = { volume: 70, gamma: 1, brightness: 0, scanline: 35, contrast: 0, curvature: 30 };
const SETTINGS_RANGE = {
  volume: [0, 100], gamma: [0.5, 2], brightness: [-50, 50],
  scanline: [0, 100], contrast: [-50, 50], curvature: [0, 100],
};

// The handheld's nine keys, as columns in rr_keymap. Six were already there
// under their old names (the joystick's confirm and second are this
// handheld's Game A and Game B), so the mapping is not thrown away: it is
// read and written through the handheld's own names.
const KEY_COLUMNS = {
  up: 'up_key',
  down: 'down_key',
  left: 'left_key',
  right: 'right_key',
  game_a: 'confirm_key',
  game_b: 'second_key',
  sound: 'sound_key',
  time: 'time_key',
  reset: 'reset_key',
};
const KEY_NAMES = Object.keys(KEY_COLUMNS);

// The OS skins. A skin is a choice of palette for the handheld's own OS
// screen, so it is validated against this list rather than stored as it
// arrives.
const SKINS = ['classic', 'silver', 'night'];
const DEFAULT_SKIN = 'classic';

// Snapshots are kept for two months. The app reasons in UTC.
const RETENTION_DAYS = 60;

function clampSetting(key, value) {
  const range = SETTINGS_RANGE[key];
  if (!range) return SETTINGS_DEFAULTS[key];
  const n = Number(value);
  if (!Number.isFinite(n)) return SETTINGS_DEFAULTS[key];
  return Math.max(range[0], Math.min(range[1], n));
}

// A read route must never assume there is a person: a guest reads the Arcade
// and its How to Play overlays, so every read answers a guest-shaped empty
// document rather than failing.
function userId(req) {
  return req.user ? String(req.user.id) : null;
}

function signedIn(req) {
  return !!req.user;
}

async function readSettings(id) {
  if (!id) return Object.assign({}, SETTINGS_DEFAULTS);
  const { rows } = await pool.query(
    `SELECT volume, gamma, brightness, scanline, contrast, curvature
       FROM rr_settings WHERE user_id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return Object.assign({}, SETTINGS_DEFAULTS);
  return {
    volume: Number(row.volume), gamma: Number(row.gamma), brightness: Number(row.brightness),
    scanline: Number(row.scanline), contrast: Number(row.contrast), curvature: Number(row.curvature),
  };
}

async function readBindings(id) {
  if (!id) return null;
  const cols = Object.values(KEY_COLUMNS).join(', ');
  const { rows } = await pool.query(`SELECT ${cols} FROM rr_keymap WHERE user_id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  const out = {};
  for (const name of KEY_NAMES) out[name] = row[KEY_COLUMNS[name]];
  return out;
}

async function readSkins(id) {
  if (!id) return { skin: DEFAULT_SKIN, transcript: [] };
  const { rows } = await pool.query('SELECT skin, transcript FROM rr_skins WHERE user_id = $1', [id]);
  const row = rows[0];
  if (!row) return { skin: DEFAULT_SKIN, transcript: [] };
  return {
    skin: SKINS.includes(row.skin) ? row.skin : DEFAULT_SKIN,
    transcript: Array.isArray(row.transcript) ? row.transcript.filter((l) => typeof l === 'string').slice(-40) : [],
  };
}

// A snapshot, with its age and expiry worked out against the request's own
// "now", so a preview opened at a moment shows that moment's retention.
function shapeSnapshot(row, now) {
  const taken = row.taken_at ? new Date(row.taken_at) : null;
  const ageDays = taken && !Number.isNaN(taken.getTime())
    ? Math.max(0, Math.floor((now.getTime() - taken.getTime()) / 86400000))
    : 0;
  const expiresAt = taken && !Number.isNaN(taken.getTime())
    ? new Date(taken.getTime() + RETENTION_DAYS * 86400000)
    : null;
  return {
    id: String(row.id),
    label: row.label,
    takenAt: row.taken_at,
    ageDays,
    expiresAt,
    pastRetention: ageDays >= RETENTION_DAYS,
  };
}

async function readSnapshots(id, now) {
  if (!id) return [];
  const { rows } = await pool.query(
    'SELECT id, label, taken_at FROM rr_snapshots WHERE user_id = $1 ORDER BY taken_at DESC, id DESC',
    [id],
  );
  return rows.map((row) => shapeSnapshot(row, now));
}

/* ── The Arcade's titles ──────────────────────────────────────────────────
 * A title's WORDS are rows in rr_titles (seeded from the eight originals).
 * What a title DOES is code in public/games.js, so an edit changes what a
 * title says and shows, never how it plays.
 */

// The eight originals' own words, read from the same file the browser reads so
// there is exactly one copy of each title. Loaded once, on boot: the seed needs
// it on every start and it cannot change while the app runs.
let BUILT_IN_TITLES = [];

async function loadOriginals() {
  if (BUILT_IN_TITLES.length) return BUILT_IN_TITLES;
  try {
    const mod = await import('./public/titles.originals.js');
    BUILT_IN_TITLES = Array.isArray(mod.BUILT_IN_TITLES) ? mod.BUILT_IN_TITLES : [];
  } catch (err) {
    console.warn('could not load the built-in titles: ' + err.message);
    BUILT_IN_TITLES = [];
  }
  return BUILT_IN_TITLES;
}

// One title row, as the API answers it. `viewerId` is who is asking, so the
// row can say whether it is theirs; a built-in belongs to the collection, and
// any signed-in person may edit it (the edit is shared).
function shapeTitle(row, viewerId) {
  const builtIn = !!row.built_in;
  const owner = row.owner_id == null ? null : String(row.owner_id);
  const json = (v) => (Array.isArray(v) ? v : []);
  return {
    id: String(row.id),
    title: row.title,
    year: row.year == null ? 0 : Number(row.year),
    category: row.category || 'Other',
    genreBox: row.genre_box || '',
    genres: json(row.genres),
    tagline: row.tagline || '',
    summary: row.summary || '',
    controls: json(row.controls),
    howTo: json(row.how_to),
    coverArt: json(row.cover_art),
    tiers: json(row.tiers),
    thumbnailUrl: row.thumbnail_url || null,
    thumbnailFileId: row.thumbnail_file_id || null,
    bezelUrl: row.bezel_url || null,
    bezelFileId: row.bezel_file_id || null,
    builtIn,
    ownerId: owner,
    mine: !builtIn && !!viewerId && owner === String(viewerId),
    sortOrder: Number(row.sort_order) || 999,
  };
}

async function readTitles(viewerId) {
  const { rows } = await pool.query(
    'SELECT * FROM rr_titles ORDER BY built_in DESC, sort_order ASC, title ASC',
  );
  return rows.map((r) => shapeTitle(r, viewerId));
}

// The hero banner's slide list, for one person.
function shapeSlide(row) {
  return {
    id: String(row.id),
    titleId: row.title_id ? String(row.title_id) : null,
    artUrl: row.art_url || null,
    artFileId: row.art_file_id || null,
    sortOrder: Number(row.sort_order) || 0,
  };
}

async function readSlides(ownerId) {
  if (!ownerId) return [];
  const { rows } = await pool.query(
    'SELECT id, title_id, art_url, art_file_id, sort_order FROM rr_title_slides WHERE owner_id = $1 ORDER BY sort_order ASC, id ASC',
    [ownerId],
  );
  return rows.map(shapeSlide);
}

// ── Validation for a title write ─────────────────────────────────────────
// Everything a manager can type is clamped to the shape the screens expect,
// and the art is only ever a URL the platform's storage handed back. Image
// bytes are never stored here.
const TITLE_KEYS = ['up', 'down', 'left', 'right', 'game_a', 'game_b', 'sound', 'time', 'reset'];

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value) ? value.slice(0, 500) : null;
}

function cleanTitleWrite(body, id) {
  const raw = body || {};
  const genres = Array.isArray(raw.genres)
    ? raw.genres.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim().slice(0, 40)).slice(0, 8)
    : [];
  const controls = Array.isArray(raw.controls)
    ? raw.controls.map((c) => ({
      keys: text(c && c.keys, 60).trim(),
      action: text(c && c.action, 160).trim(),
      plays: Array.isArray(c && c.plays)
        ? c.plays.filter((k) => TITLE_KEYS.includes(k)).slice(0, 6) : [],
    })).filter((c) => c.keys || c.action).slice(0, 12)
    : [];
  const howTo = Array.isArray(raw.howTo)
    ? raw.howTo.map((b) => ({
      heading: text(b && b.heading, 80).trim(),
      lines: Array.isArray(b && b.lines)
        ? b.lines.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim().slice(0, 400)).slice(0, 12)
        : [],
    })).filter((b) => b.heading || b.lines.length).slice(0, 8)
    : [];
  const tiers = Array.isArray(raw.tiers)
    ? raw.tiers.map((t) => ({
      name: text(t && t.name, 40).trim() || 'Tier',
      min: Number.isFinite(Number(t && t.min)) ? Math.round(Number(t.min)) : 0,
      max: t && t.max == null ? null : (Number.isFinite(Number(t.max)) ? Math.round(Number(t.max)) : null),
    })).slice(0, 6)
    : [];
  const coverArt = Array.isArray(raw.coverArt)
    ? raw.coverArt.filter((r) => typeof r === 'string').map((r) => r.slice(0, 80)).slice(0, 40)
    : [];
  const year = Number(raw.year);
  return {
    id: String(id),
    title: text(raw.title, 120).trim(),
    year: Number.isFinite(year) && year >= 1900 && year <= 2100 ? Math.round(year) : null,
    category: text(raw.category, 40).trim() || 'Other',
    genreBox: text(raw.genreBox, 60).trim(),
    genres: genres.length ? genres : ['Other'],
    tagline: text(raw.tagline, 200).trim(),
    summary: text(raw.summary, 2000).trim(),
    controls,
    howTo,
    coverArt,
    tiers,
    thumbnailUrl: raw.thumbnail === null ? null : httpUrl(raw.thumbnail && raw.thumbnail.url),
    thumbnailFileId: raw.thumbnail === null ? null : text(raw.thumbnail && raw.thumbnail.fileId, 200) || null,
    bezelUrl: raw.bezel === null ? null : httpUrl(raw.bezel && raw.bezel.url),
    bezelFileId: raw.bezel === null ? null : text(raw.bezel && raw.bezel.fileId, 200) || null,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Math.round(Number(raw.sortOrder)) : 100,
  };
}

async function readCatalogue(id) {
  if (!id) return [];
  const { rows } = await pool.query(
    `SELECT id, title, filename, storage_url, added_at
       FROM rr_catalogue WHERE user_id = $1 ORDER BY added_at DESC, id DESC`,
    [id],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    filename: r.filename || null,
    // A cover's image URL. The bytes never come here; only the URL the
    // platform's storage returned.
    storageUrl: r.storage_url || null,
    addedAt: r.added_at,
  }));
}

// The Memory Card. A slot's shape is the same for every title, so a slot
// lists its own high score without the server knowing which title it is.
function shapeSave(row) {
  const state = row.state && typeof row.state === 'object' ? row.state : {};
  return {
    gameId: row.game_id,
    slot: Number(row.slot),
    label: row.label || '',
    highScore: Number.isFinite(Number(state.highScore)) ? Math.round(Number(state.highScore)) : 0,
    progress: typeof state.progress === 'string' ? state.progress : '',
    ended: typeof state.ended === 'string' ? state.ended : null,
    state,
    savedAt: row.saved_at,
  };
}

async function readSaves(id) {
  if (!id) return [];
  const { rows } = await pool.query(
    `SELECT game_id, slot, label, state, saved_at FROM rr_saves
      WHERE user_id = $1 ORDER BY saved_at DESC`,
    [id],
  );
  return rows.map(shapeSave);
}

// Who GameWatch is signed in as, and everything it keeps for them, in one
// round trip. `username` is the platform's own answer and never a role.
app.get('/api/me', async (req, res) => {
  const id = userId(req);
  try {
    const [settings, bindings, saves, skins, snapshots, titles, slides] = await Promise.all([
      readSettings(id), readBindings(id), readSaves(id), readSkins(id), readSnapshots(id, req.now),
      readTitles(id), readSlides(id),
    ]);
    res.json({
      id: req.user ? req.user.id : null,
      username: req.user ? req.user.username : null,
      signedIn: signedIn(req),
      retentionDays: RETENTION_DAYS,
      skins: SKINS,
      settings,
      bindings,
      saves,
      skin: skins.skin,
      transcript: skins.transcript,
      snapshots,
      titles,
      slides,
    });
  } catch (err) {
    console.error('watch load failed: ' + err.message);
    res.status(500).json({ error: 'Could not read this handheld', code: 'watch_unavailable' });
  }
});

// The Settings screen: the panel's picture and sound, stored for this person
// and applied to every title they run.
app.put('/api/settings', async (req, res) => {
  const raw = (req.body && req.body.settings) || {};
  const next = {};
  for (const key of Object.keys(SETTINGS_DEFAULTS)) next[key] = clampSetting(key, raw[key]);
  try {
    await pool.query(
      `INSERT INTO rr_settings (user_id, volume, gamma, brightness, scanline, contrast, curvature, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         volume = EXCLUDED.volume, gamma = EXCLUDED.gamma, brightness = EXCLUDED.brightness,
         scanline = EXCLUDED.scanline, contrast = EXCLUDED.contrast, curvature = EXCLUDED.curvature,
         updated_at = NOW()`,
      [userId(req), next.volume, next.gamma, next.brightness, next.scanline, next.contrast, next.curvature],
    );
    res.json({ settings: next });
  } catch (err) {
    console.error('settings write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save the settings' });
  }
});

// The key mapping screen: the handheld's nine keys.
app.put('/api/keymap', async (req, res) => {
  const raw = (req.body && req.body.bindings) || {};
  const clean = {};
  for (const name of KEY_NAMES) {
    const value = raw[name];
    clean[name] = typeof value === 'string' && value.length <= 24 ? value : null;
  }
  const columns = Object.keys(KEY_COLUMNS);
  try {
    await pool.query(
      `INSERT INTO rr_keymap (user_id, ${columns.map((k) => KEY_COLUMNS[k]).join(', ')}, updated_at)
       VALUES ($1, ${columns.map((_, i) => '$' + (i + 2)).join(', ')}, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         ${columns.map((k) => KEY_COLUMNS[k] + ' = EXCLUDED.' + KEY_COLUMNS[k]).join(', ')},
         updated_at = NOW()`,
      [userId(req)].concat(columns.map((k) => clean[k])),
    );
    res.json({ bindings: clean });
  } catch (err) {
    console.error('keymap write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save the mapping' });
  }
});

/* ── The Arcade's collections ─────────────────────────────────────────────
 * `GET /api/titles` is the whole Arcade: the eight built-ins (rows, seeded on
 * boot) and every added title. `PUT /api/titles/:id` is the manager's write.
 */

app.get('/api/titles', async (req, res) => {
  try {
    const titles = await readTitles(userId(req));
    res.json({ titles });
  } catch (err) {
    console.error('titles read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the Arcade titles' });
  }
});

// The manager's write. A new id creates an added title owned by the caller; an
// existing id edits it. A built-in may be edited by any signed-in person (the
// edit is shared), but never re-owned, and its drawing stays in code.
app.put('/api/titles/:id', async (req, res) => {
  const id = String(req.params.id).slice(0, 80);
  if (!id) return res.status(400).json({ error: 'That title has no id.' });
  const next = cleanTitleWrite(req.body || {}, id);
  if (!next.title) return res.status(400).json({ error: 'Give the title a name.' });
  const viewer = userId(req);
  try {
    const existing = await pool.query('SELECT built_in, owner_id FROM rr_titles WHERE id = $1', [id]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (!row.built_in && String(row.owner_id || '') !== String(viewer)) {
        return res.status(403).json({ error: 'That title belongs to another Arcade.' });
      }
      await pool.query(
        `UPDATE rr_titles SET title = $2, year = $3, category = $4, genre_box = $5, genres = $6::jsonb,
           tagline = $7, summary = $8, controls = $9::jsonb, how_to = $10::jsonb, cover_art = $11::jsonb,
           tiers = $12::jsonb, thumbnail_url = $13, thumbnail_file_id = $14, bezel_url = $15,
           bezel_file_id = $16, updated_at = NOW()
         WHERE id = $1`,
        [id, next.title, next.year, next.category, next.genreBox, JSON.stringify(next.genres),
          next.tagline, next.summary, JSON.stringify(next.controls), JSON.stringify(next.howTo),
          JSON.stringify(next.coverArt), JSON.stringify(next.tiers), next.thumbnailUrl,
          next.thumbnailFileId, next.bezelUrl, next.bezelFileId],
      );
    } else {
      await pool.query(
        `INSERT INTO rr_titles
           (id, built_in, owner_id, title, year, category, genre_box, genres, tagline, summary,
            controls, how_to, cover_art, tiers, thumbnail_url, thumbnail_file_id, bezel_url,
            bezel_file_id, sort_order, updated_at)
         VALUES ($1, FALSE, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
            $13::jsonb, $14, $15, $16, $17, $18, NOW())`,
        [id, viewer, next.title, next.year, next.category, next.genreBox, JSON.stringify(next.genres),
          next.tagline, next.summary, JSON.stringify(next.controls), JSON.stringify(next.howTo),
          JSON.stringify(next.coverArt), JSON.stringify(next.tiers), next.thumbnailUrl,
          next.thumbnailFileId, next.bezelUrl, next.bezelFileId, next.sortOrder],
      );
    }
    const { rows } = await pool.query('SELECT * FROM rr_titles WHERE id = $1', [id]);
    res.json({ title: shapeTitle(rows[0], viewer) });
  } catch (err) {
    console.error('title write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save that title' });
  }
});

// A built-in is the collection's: it is refused rather than deleted, because
// its Memory Card rows and its play screen resolve a title by id. An added
// title is the one who added it, and its cards are cleared with it.
app.delete('/api/titles/:id', async (req, res) => {
  const id = String(req.params.id).slice(0, 80);
  try {
    const { rows } = await pool.query('SELECT built_in, owner_id FROM rr_titles WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'That title is not in this Arcade.' });
    if (rows[0].built_in) return res.status(400).json({ error: 'A built-in title cannot be removed.' });
    if (String(rows[0].owner_id || '') !== String(userId(req))) {
      return res.status(403).json({ error: 'That title belongs to another Arcade.' });
    }
    await pool.query('DELETE FROM rr_saves WHERE game_id = $1 AND user_id = $2', [id, userId(req)]);
    await pool.query('DELETE FROM rr_title_slides WHERE title_id = $1 AND owner_id = $2', [id, userId(req)]);
    await pool.query('DELETE FROM rr_titles WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('title delete failed: ' + err.message);
    res.status(500).json({ error: 'Could not remove that title' });
  }
});

/* ── The hero banner ──────────────────────────────────────────────────────
 * A person's own slide list: which titles the banner shows, in what order,
 * and which picture each one uses. It belongs to whoever set it, unlike a
 * title's words, which are shared.
 */
app.get('/api/banner', async (req, res) => {
  try {
    res.json({ slides: await readSlides(userId(req)) });
  } catch (err) {
    console.error('banner read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the banner' });
  }
});

app.put('/api/banner', async (req, res) => {
  const raw = req.body && req.body.slides;
  if (!Array.isArray(raw)) return res.status(400).json({ error: 'The banner needs a list of slides.' });
  const owner = userId(req);
  const clean = raw.slice(0, 12).map((s, i) => ({
    titleId: typeof (s && s.titleId) === 'string' ? s.titleId.slice(0, 80) : null,
    artUrl: s && s.art && s.art.url ? httpUrl(s.art.url) : null,
    artFileId: s && s.art && typeof s.art.fileId === 'string' ? s.art.fileId.slice(0, 200) : null,
    sortOrder: i + 1,
  }));
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rr_title_slides WHERE owner_id = $1', [owner]);
      for (const s of clean) {
        await client.query(
          `INSERT INTO rr_title_slides (id, owner_id, title_id, art_url, art_file_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [require('crypto').randomUUID(), owner, s.titleId, s.artUrl, s.artFileId, s.sortOrder],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ slides: await readSlides(owner) });
  } catch (err) {
    console.error('banner write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save the banner' });
  }
});

/* ── The Arcade's added titles, as the older admin panel reads them ───────
 * An added title is a rr_titles row now, so the panel and the manager see the
 * same collection. The entry shape is kept for the panel that already uses it.
 */
app.get('/api/catalogue', async (req, res) => {
  try {
    const id = userId(req);
    const titles = await readTitles(id);
    const entries = titles.filter((t) => !t.builtIn && t.mine).map((t) => ({
      id: t.id, title: t.title, filename: null, storageUrl: t.thumbnailUrl, addedAt: null,
    }));
    res.json({ entries });
  } catch (err) {
    console.error('catalogue read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the Arcade collection' });
  }
});

app.post('/api/catalogue', async (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const storageUrl = typeof body.storageUrl === 'string' && /^https?:\/\//.test(body.storageUrl)
    ? body.storageUrl.slice(0, 500) : null;
  if (!title) return res.status(400).json({ error: 'Give the title a name.' });
  const id = require('crypto').randomUUID();
  const viewer = userId(req);
  try {
    await pool.query(
      `INSERT INTO rr_titles (id, built_in, owner_id, title, year, category, genre_box, genres, tagline,
         summary, controls, how_to, cover_art, tiers, thumbnail_url, sort_order, updated_at)
       VALUES ($1, FALSE, $2, $3, NULL, 'Added by you', 'Added by you', '[]'::jsonb, '', '', '[]'::jsonb,
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $4, $5, NOW())`,
      [id, viewer, title, storageUrl, 100],
    );
    res.status(201).json({ entry: { id, title, filename: null, storageUrl, addedAt: null } });
  } catch (err) {
    console.error('catalogue write failed: ' + err.message);
    res.status(500).json({ error: 'Could not add that title' });
  }
});

app.delete('/api/catalogue/:id', async (req, res) => {
  const id = String(req.params.id).slice(0, 80);
  try {
    const { rows } = await pool.query('SELECT built_in, owner_id FROM rr_titles WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'That title is not in this collection.' });
    if (rows[0].built_in) return res.status(400).json({ error: 'A built-in title cannot be removed.' });
    if (String(rows[0].owner_id || '') !== String(userId(req))) {
      return res.status(403).json({ error: 'That title belongs to another Arcade.' });
    }
    await pool.query('DELETE FROM rr_saves WHERE game_id = $1 AND user_id = $2', [id, userId(req)]);
    await pool.query('DELETE FROM rr_title_slides WHERE title_id = $1 AND owner_id = $2', [id, userId(req)]);
    await pool.query('DELETE FROM rr_titles WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('catalogue delete failed: ' + err.message);
    res.status(500).json({ error: 'Could not remove that title' });
  }
});

// The Memory Card: one run per title and card.
app.get('/api/saves', async (req, res) => {
  try {
    res.json({ saves: await readSaves(userId(req)) });
  } catch (err) {
    console.error('saves read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the Memory Card' });
  }
});

app.put('/api/saves/:gameId/:slot', async (req, res) => {
  const gameId = String(req.params.gameId).slice(0, 60);
  const slot = Number(req.params.slot);
  const body = req.body || {};
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
    return res.status(400).json({ error: 'Cards run from 1 to 4.' });
  }
  if (!body.state || typeof body.state !== 'object') {
    return res.status(400).json({ error: 'There is nothing to save from that run.' });
  }
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  try {
    const { rows } = await pool.query(
      `INSERT INTO rr_saves (user_id, game_id, slot, label, state, saved_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, game_id, slot) DO UPDATE SET
         label = EXCLUDED.label, state = EXCLUDED.state, saved_at = NOW()
       RETURNING game_id, slot, label, state, saved_at`,
      [userId(req), gameId, slot, label, body.state],
    );
    res.json({ save: shapeSave(rows[0]) });
  } catch (err) {
    console.error('save write failed: ' + err.message);
    res.status(500).json({ error: 'Could not write that card' });
  }
});

app.delete('/api/saves/:gameId/:slot', async (req, res) => {
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot)) return res.status(400).json({ error: 'Cards run from 1 to 4.' });
  try {
    await pool.query(
      'DELETE FROM rr_saves WHERE user_id = $1 AND game_id = $2 AND slot = $3',
      [userId(req), String(req.params.gameId).slice(0, 60), slot],
    );
    res.status(204).end();
  } catch (err) {
    console.error('save delete failed: ' + err.message);
    res.status(500).json({ error: 'Could not clear that card' });
  }
});

// The OS screen. `transcript` is what a re-provision said it did, kept so the
// screen reads back its own last run.
app.get('/api/skin', async (req, res) => {
  try {
    const skins = await readSkins(userId(req));
    res.json({ skin: skins.skin, transcript: skins.transcript, skins: SKINS });
  } catch (err) {
    console.error('skin read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the OS settings' });
  }
});

app.put('/api/skin', async (req, res) => {
  const body = req.body || {};
  const skin = SKINS.includes(body.skin) ? body.skin : DEFAULT_SKIN;
  const transcript = Array.isArray(body.transcript)
    ? body.transcript.filter((l) => typeof l === 'string').slice(-40) : [];
  try {
    await pool.query(
      `INSERT INTO rr_skins (user_id, skin, transcript, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         skin = EXCLUDED.skin, transcript = EXCLUDED.transcript, updated_at = NOW()`,
      [userId(req), skin, JSON.stringify(transcript)],
    );
    res.json({ skin, transcript, skins: SKINS });
  } catch (err) {
    console.error('skin write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save the OS settings' });
  }
});

// The Features screen: snapshots and their two-month retention. The age comes
// from the request's own "now", so a preview opened at a moment reads that
// moment.
app.get('/api/snapshots', async (req, res) => {
  try {
    res.json({
      retentionDays: RETENTION_DAYS,
      now: req.now.toISOString(),
      snapshots: await readSnapshots(userId(req), req.now),
    });
  } catch (err) {
    console.error('snapshots read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the snapshots' });
  }
});

app.post('/api/snapshots', async (req, res) => {
  const body = req.body || {};
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim().slice(0, 120) : 'Snapshot';
  try {
    const id = require('crypto').randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO rr_snapshots (id, user_id, label, taken_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, label, taken_at`,
      [id, userId(req), label, req.now],
    );
    res.status(201).json({ snapshot: shapeSnapshot(rows[0], req.now) });
  } catch (err) {
    console.error('snapshot write failed: ' + err.message);
    res.status(500).json({ error: 'Could not take that snapshot' });
  }
});

app.delete('/api/snapshots/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM rr_snapshots WHERE user_id = $1 AND id = $2',
      [userId(req), String(req.params.id).slice(0, 80)],
    );
    if (!rowCount) return res.status(404).json({ error: 'That snapshot is not here.' });
    res.status(204).end();
  } catch (err) {
    console.error('snapshot delete failed: ' + err.message);
    res.status(500).json({ error: 'Could not remove that snapshot' });
  }
});

/* ── Install UFW: a transcript, not a package manager ────────────────────
 * The whole reply is a fixed, obviously simulated log, streamed out a line at
 * a time. It installs nothing, runs no shell and reaches no host, so staging
 * and production run the identical path and IS_STAGING never gates it.
 */
const UFW_TRANSCRIPT = [
  'gamewatch-sim> ufw --version',
  'ufw 0.36.2 (simulated: this line was not produced by a real ufw)',
  'gamewatch-sim> ufw default deny incoming',
  'Default incoming policy changed to deny (simulated, nothing was changed)',
  'gamewatch-sim> ufw default allow outgoing',
  'Default outgoing policy changed to allow (simulated, nothing was changed)',
  'gamewatch-sim> ufw allow 22/tcp',
  'Rule added: allow 22/tcp (simulated)',
  'gamewatch-sim> ufw allow 80/tcp',
  'Rule added: allow 80/tcp (simulated)',
  'gamewatch-sim> ufw allow 443/tcp',
  'Rule added: allow 443/tcp (simulated)',
  'gamewatch-sim> ufw --force enable',
  'Firewall is active and enabled on system startup (simulated)',
  'gamewatch-sim> ufw status verbose',
  'Status: active (simulated)',
  'To                         Action      From',
  '--                         ------      ----',
  '22/tcp                     ALLOW       Anywhere',
  '80/tcp                     ALLOW       Anywhere',
  '443/tcp                    ALLOW       Anywhere',
  'gamewatch-sim> done. 0 packages installed, 0 hosts contacted.',
];

app.post('/api/install-ufw', async (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });
  let i = 0;
  let closed = false;
  req.on('close', () => { closed = true; });
  const pump = () => {
    if (closed) return;
    if (i >= UFW_TRANSCRIPT.length) { res.end(); return; }
    res.write(UFW_TRANSCRIPT[i] + '\n');
    i += 1;
    setTimeout(pump, 90);
  };
  pump();
});

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works.
app.get('*', (req, res) => {
  if (!req.user && !req.guest) {
    // Deep-link pass-through: carry the visited path+query into the
    // chromeless view so share links land on the shared screen, not Home.
    const deepPath = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@\/%?]*$/.test(req.originalUrl)
      ? '?path=' + encodeURIComponent(req.originalUrl) : '';
    if (PLATFORM_ORIGIN && req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, PLATFORM_ORIGIN + '/app/questverse-9532f4/full' + deepPath);
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Homeroom</title>
<body style="font-family:system-ui;background:#06080a;color:#e2ece8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Homeroom</h1>
    <p style="color:#929e9a;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="${PLATFORM_ORIGIN}/app/questverse-9532f4/full${deepPath}" style="display:inline-block;padding:0.5rem 1rem;background:#4ade80;color:#04180c;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Homeroom</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const DRAIN_MS = 3000;
let shuttingDown = false;

/* ── Schema, applied idempotently on boot ───────────────────────────────── */

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_settings (
    user_id TEXT PRIMARY KEY,
    volume INTEGER NOT NULL DEFAULT 70,
    gamma NUMERIC(4,2) NOT NULL DEFAULT 1,
    brightness INTEGER NOT NULL DEFAULT 0,
    scanline INTEGER NOT NULL DEFAULT 35,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // The Settings screen offers contrast and curvature now: both are real
  // picture effects, so both are stored. A fixed LCD panel has no aspect to
  // choose and no frame skip to set, so those two columns go.
  await pool.query('ALTER TABLE rr_settings ADD COLUMN IF NOT EXISTS contrast INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE rr_settings ADD COLUMN IF NOT EXISTS curvature INTEGER NOT NULL DEFAULT 30');
  await pool.query('ALTER TABLE rr_settings DROP COLUMN IF EXISTS aspect');
  await pool.query('ALTER TABLE rr_settings DROP COLUMN IF EXISTS frame_skip');

  await pool.query(`CREATE TABLE IF NOT EXISTS rr_catalogue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT,
    storage_url TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // A cover-only entry has no file name, so the older NOT NULL column has to
  // relax for rows this build writes.
  await pool.query('ALTER TABLE rr_catalogue ALTER COLUMN filename DROP NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS rr_catalogue_user_idx ON rr_catalogue (user_id, added_at DESC)');

  // The Arcade's titles are ROWS now. What a title SAYS (its name, year, its
  // broad genre, its sub-genres, its words, its control list and its three
  // pictures) lives here, so the manager can edit it and the Arcade is drawn
  // from what the app actually holds. What a title DOES stays in code
  // (public/games.js): an added title has no rules and cannot be run, and an
  // edit never changes how a built-in plays.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_titles (
    id TEXT PRIMARY KEY,
    built_in BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id TEXT,
    title TEXT NOT NULL,
    year INTEGER,
    category TEXT,
    genre_box TEXT,
    genres JSONB NOT NULL DEFAULT '[]'::jsonb,
    tagline TEXT,
    summary TEXT,
    controls JSONB NOT NULL DEFAULT '[]'::jsonb,
    how_to JSONB NOT NULL DEFAULT '[]'::jsonb,
    cover_art JSONB NOT NULL DEFAULT '[]'::jsonb,
    tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    thumbnail_url TEXT,
    thumbnail_file_id TEXT,
    bezel_url TEXT,
    bezel_file_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 999,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_titles_order_idx ON rr_titles (built_in DESC, sort_order ASC, title ASC)');

  // The hero banner's slide list. A slide is a title plus, when the platform's
  // storage took one, the picture to show for it. The list is per person: it
  // is a view preference, unlike a title's own words.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_title_slides (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title_id TEXT,
    art_url TEXT,
    art_file_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_title_slides_owner_idx ON rr_title_slides (owner_id, sort_order ASC)');

  await pool.query(`CREATE TABLE IF NOT EXISTS rr_saves (
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    slot INTEGER NOT NULL,
    label TEXT,
    state JSONB NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, game_id, slot)
  )`);

  // The mapping table keeps its six columns and gains the three system keys.
  // The joystick's confirm and second are this handheld's Game A and Game B,
  // so an existing mapping is read and written under the handheld's names.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_keymap (
    user_id TEXT PRIMARY KEY,
    up_key TEXT, down_key TEXT, left_key TEXT, right_key TEXT,
    confirm_key TEXT, second_key TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE rr_keymap ADD COLUMN IF NOT EXISTS sound_key TEXT');
  await pool.query('ALTER TABLE rr_keymap ADD COLUMN IF NOT EXISTS time_key TEXT');
  await pool.query('ALTER TABLE rr_keymap ADD COLUMN IF NOT EXISTS reset_key TEXT');

  await pool.query(`CREATE TABLE IF NOT EXISTS rr_skins (
    user_id TEXT PRIMARY KEY,
    skin TEXT NOT NULL DEFAULT 'classic',
    transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS rr_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_snapshots_user_idx ON rr_snapshots (user_id, taken_at DESC)');
}

// The two-month retention, applied on boot: a snapshot older than the
// retention window is removed. This runs before the staging seed, so the
// seeded "past retention" row is put back each boot and a reviewer can see
// what the retention does.
async function sweepSnapshots() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM rr_snapshots WHERE taken_at < NOW() - ($1 || ' days')::interval`,
      [String(RETENTION_DAYS)],
    );
    if (rowCount) console.log(`retention: removed ${rowCount} snapshot(s) past ${RETENTION_DAYS} days`);
  } catch (err) {
    console.warn('retention sweep failed: ' + err.message);
  }
}

/* ── The eight built-in titles, seeded on every boot ──────────────────────
 * These are the app's OWN data, not demo data: without them the Arcade is
 * empty and no title can run. So this runs in EVERY environment, is
 * idempotent, and never overwrites a row a person has edited (ON CONFLICT DO
 * NOTHING). A production database gains them on its next boot, which is also
 * what moves the existing rr_catalogue rows across.
 *
 * It is what makes a fresh staging database render the full collection: the
 * code no longer carries the eight titles' words, only their rules.
 */
async function seedBuiltInTitles() {
  const originals = await loadOriginals();
  for (const t of originals) {
    try {
      await pool.query(
        `INSERT INTO rr_titles
           (id, built_in, owner_id, title, year, category, genre_box, genres, tagline, summary,
            controls, how_to, cover_art, tiers, thumbnail_url, bezel_url, sort_order, updated_at)
         VALUES ($1, TRUE, NULL, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
            $12::jsonb, NULL, NULL, $13, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [t.id, t.title, t.year, t.category, t.genreBox, JSON.stringify(t.genres), t.tagline, t.summary,
          JSON.stringify(t.controls || []), JSON.stringify(t.howTo || []), JSON.stringify(t.coverArt || []),
          JSON.stringify(t.tiers || []), t.sortOrder || 100],
      );
    } catch (err) {
      console.warn('built-in seed failed for ' + t.id + ': ' + err.message);
    }
  }
  // A title someone added before this build lived in rr_catalogue. It is
  // copied across once, with the drawn cover as its art, so nobody loses one.
  try {
    await pool.query(
      `INSERT INTO rr_titles
         (id, built_in, owner_id, title, year, category, genre_box, genres, tagline, summary,
          controls, how_to, cover_art, tiers, thumbnail_url, sort_order, updated_at)
       SELECT c.id, FALSE, c.user_id, c.title, NULL, 'Added by you', 'Added by you', '[]'::jsonb, '',
         '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, c.storage_url, 100, NOW()
       FROM rr_catalogue c
       WHERE NOT EXISTS (SELECT 1 FROM rr_titles t WHERE t.id = c.id)
       ON CONFLICT (id) DO NOTHING`,
    );
  } catch (err) {
    console.warn('catalogue migration failed: ' + err.message);
  }
}

/* ── Staging demo rows ────────────────────────────────────────────────────
 * Staging starts from a copy of production, so the tables this app creates
 * are empty there. The demo rows below belong to a fake identity, are
 * idempotent, and never touch the account opening the preview: nothing the
 * app's own logic reads ("has this person saved anything?") is fabricated by
 * them. They exist so the Arcade's collection, the Memory Card, the OS
 * screen, the key mapping and the Features screen have something to show.
 */
const DEMO_USER = 'staging-demo-rig';
// A 1x1 pixel, so the demo cover is a real image URL without depending on a
// file staging does not hold.
const DEMO_COVER = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

async function seedStaging() {
  if (!IS_STAGING) return;
  try {
    await pool.query(
      `INSERT INTO rr_settings (user_id, volume, gamma, brightness, scanline, contrast, curvature)
       VALUES ($1, 70, 1, 0, 35, 0, 30) ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER],
    );
    await pool.query(
      `INSERT INTO rr_keymap (user_id, up_key, down_key, left_key, right_key, confirm_key, second_key, sound_key, time_key, reset_key)
       VALUES ($1, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'm', 't', 'r')
       ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER],
    );
    await pool.query(
      `INSERT INTO rr_skins (user_id, skin, transcript)
       VALUES ($1, 'silver', $2::jsonb) ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER, JSON.stringify([
        'Staging demo OS: the handheld was re-provisioned to the silver skin.',
        'Staging demo OS: 8 titles present, 4 Memory Card cards free.',
      ])],
    );
    await pool.query(
      `INSERT INTO rr_catalogue (id, user_id, title, filename, storage_url)
       VALUES ($1, $2, 'Staging demo cover', NULL, $3) ON CONFLICT (id) DO NOTHING`,
      ['staging-demo-cover', DEMO_USER, DEMO_COVER],
    );
    // One obvious fake save in the Memory Card, so a slot shows a written run
    // rather than only empty ones.
    await pool.query(
      `INSERT INTO rr_saves (user_id, game_id, slot, label, state)
       VALUES ($1, 'battle-field', 1, 'Staging demo save', $2::jsonb)
       ON CONFLICT (user_id, game_id, slot) DO NOTHING`,
      [DEMO_USER, JSON.stringify({
        v: 1, game: 'battle-field', highScore: 128, progress: 'track at distance 128',
        ended: null, score: 128, distance: 128, obstacleIndex: 7, gapMs: 1100,
        action: 'run', actionMs: 0, cleared: 7, stumbles: 1, stridedIndex: 7,
        message: 'Staging demo save: two hurdles and a low bar to go.',
      })],
    );
    await pool.query(
      `INSERT INTO rr_saves (user_id, game_id, slot, label, state)
       VALUES ($1, 'submarine-battle', 2, 'Staging demo save', $2::jsonb)
       ON CONFLICT (user_id, game_id, slot) DO NOTHING`,
      [DEMO_USER, JSON.stringify({
        v: 1, game: 'submarine-battle', highScore: 30, progress: 'winch at notch 6',
        ended: null, score: 30, winch: 6, crateIndex: 2, crate: 4, raised: 3, lost: 1,
        holdMs: 0, phase: 'dive', haulMs: 0,
        message: 'Staging demo save: the hook is payed out to notch 6.',
      })],
    );
    // The banner's slide list is a real feature, so the preview shows one: three
    // slides belonging to the FAKE account, never to whoever opens the preview.
    // One of them carries an uploaded picture.
    const slides = [
      { titleId: 'western-bar', artUrl: null },
      { titleId: 'battle-field', artUrl: DEMO_COVER },
      { titleId: 'submarine-battle', artUrl: null },
    ];
    for (let i = 0; i < slides.length; i += 1) {
      await pool.query(
        `INSERT INTO rr_title_slides (id, owner_id, title_id, art_url, art_file_id, sort_order)
         VALUES ($1, $2, $3, $4, NULL, $5) ON CONFLICT (id) DO NOTHING`,
        ['staging-demo-slide-' + (i + 1), DEMO_USER, slides[i].titleId, slides[i].artUrl, i + 1],
      );
    }
    // One ADDED title, so the manager shows a row beside the eight built-ins
    // and the edit a reviewer makes has something that is not a built-in to
    // touch. It belongs to the fake account.
    await pool.query(
      `INSERT INTO rr_titles
         (id, built_in, owner_id, title, year, category, genre_box, genres, tagline, summary,
          controls, how_to, cover_art, tiers, thumbnail_url, bezel_url, sort_order, updated_at)
       VALUES ($1, FALSE, $2, 'Staging demo title', 1985, 'Added by you', 'Staging demo',
         $3::jsonb, 'A staging demo title, added so the manager has one that is not a built-in.',
         'Staging demo entry. Any signed-in person may edit a preloaded built-in title, or add one of their own.',
         $4::jsonb, '[]'::jsonb, $5::jsonb, '[]'::jsonb, $6, NULL, 100, NOW())
       ON CONFLICT (id) DO NOTHING`,
      ['staging-demo-title', DEMO_USER, JSON.stringify(['Staging demo']),
        JSON.stringify([{ keys: 'Game A', action: 'A staging demo control row', plays: ['game_a'] }]),
        JSON.stringify([]), DEMO_COVER],
    );
    // Three snapshots, one of them past the two-month retention window, so
    // the Features screen has something true to say about it.
    const snapshots = [
      { id: 'staging-demo-snapshot-1', label: 'Staging demo snapshot (four days old)', days: 4 },
      { id: 'staging-demo-snapshot-2', label: 'Staging demo snapshot (three weeks old)', days: 21 },
      { id: 'staging-demo-snapshot-3', label: 'Staging demo snapshot (past retention)', days: 75 },
    ];
    for (const snap of snapshots) {
      await pool.query(
        `INSERT INTO rr_snapshots (id, user_id, label, taken_at)
         VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval) ON CONFLICT (id) DO NOTHING`,
        [snap.id, DEMO_USER, snap.label, String(snap.days)],
      );
    }
  } catch (err) {
    // A database outage must not stop the handheld: the screens fall back to
    // their empty states.
    console.warn('staging seed failed: ' + err.message);
  }
}

async function start() {
  try {
    await ensureSchema();
  } catch (err) {
    console.warn('schema setup failed: ' + err.message);
  }
  await sweepSnapshots();
  await seedBuiltInTitles();
  await seedStaging();
  const server = app.listen(port, () => console.log(`Listening on :${port}`));
  // Let Envoy retire idle upstream connections at 60s, with a 15s margin.
  server.keepAliveTimeout = 75_000;

  // Every container is replaced on each deploy, so drain cleanly: stop
  // accepting connections, let in-flight requests finish under a hard
  // deadline, close the pool, exit. Idempotent, since SIGTERM then SIGINT
  // must not run teardown twice.
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining`);
    server.close(() => {});
    server.closeIdleConnections?.();
    const t = setTimeout(() => server.closeAllConnections?.(), DRAIN_MS);
    t.unref?.();
    try {
      await pool.end();
    } catch (e) {
      console.error('[shutdown] pool.end failed', e.message);
    }
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => { console.error(err); process.exit(1); });
