const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Staging swaps DATA and suppresses irreversible outbound effects, never a
// feature or a code path. Here it gates the demo seed rows only.
const IS_STAGING = process.env.USERNODE_ENV === 'staging';

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;

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

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
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

/* ── The rig's data ────────────────────────────────────────────────────────
 * Everything a person's rig keeps lives here, keyed by the platform user id
 * from the verified token: the settings the modules read, the catalogue of
 * uploaded files, the Memory Card slots and the joystick mapping. Nothing is
 * kept in the browser.
 *
 * All four tables are public by default: they hold one person's own game
 * settings, their own file names and their own save states. A stranger seeing
 * every row would see a save state and a list of file names — the same thing
 * the rig shows that person on their own screen. No secrets, no messages, no
 * personal information beyond the platform username.
 */

// The settings columns are the six sliders the Settings module drives, each
// with the range the on-screen slider offers. The defaults are the rig's
// shipping picture: 4:3, scanlines on, sound up.
const SETTINGS_DEFAULTS = { volume: 70, gamma: 1, brightness: 0, scanline: 35, aspect: 0, frameSkip: 0 };
const SETTINGS_RANGE = {
  volume: [0, 100], gamma: [0.5, 2], brightness: [-50, 50],
  scanline: [0, 100], aspect: [0, 3], frameSkip: [0, 2],
};

function clampSetting(key, value) {
  const range = SETTINGS_RANGE[key];
  if (!range) return SETTINGS_DEFAULTS[key];
  const n = Number(value);
  if (!Number.isFinite(n)) return SETTINGS_DEFAULTS[key];
  return Math.max(range[0], Math.min(range[1], n));
}

function userKey(req) {
  return String(req.user.id);
}

async function readSettings(userId) {
  const { rows } = await pool.query(
    'SELECT volume, gamma, brightness, scanline, aspect, frame_skip FROM rr_settings WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row) return Object.assign({}, SETTINGS_DEFAULTS);
  return {
    volume: Number(row.volume), gamma: Number(row.gamma), brightness: Number(row.brightness),
    scanline: Number(row.scanline), aspect: Number(row.aspect), frameSkip: Number(row.frame_skip),
  };
}

function readBindings(userId) {
  return pool.query('SELECT up_key, down_key, left_key, right_key, confirm_key, second_key FROM rr_keymap WHERE user_id = $1', [userId])
    .then(({ rows }) => {
      const row = rows[0];
      if (!row) return null;
      return {
        up: row.up_key, down: row.down_key, left: row.left_key,
        right: row.right_key, confirm: row.confirm_key, second: row.second_key,
      };
    });
}

async function readCatalogue(userId) {
  const { rows } = await pool.query(
    `SELECT id, title, filename, content_type, size_bytes, source, storage_url, added_at
       FROM rr_catalogue WHERE user_id = $1 ORDER BY added_at DESC, id DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    source: r.source,
    // The rig renders a copy only when the platform storage accepted one. The
    // URL is what is kept, never the bytes.
    storageUrl: r.storage_url || null,
    addedAt: r.added_at,
  }));
}

async function readSaves(userId) {
  const { rows } = await pool.query(
    `SELECT game_id, slot, label, state, saved_at FROM rr_saves
      WHERE user_id = $1 ORDER BY saved_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    gameId: r.game_id,
    slot: Number(r.slot),
    label: r.label || '',
    state: r.state,
    savedAt: r.saved_at,
  }));
}

// Who the rig is signed in as. `username` is the platform's own answer; the
// screen shows it as the rig's owner, and never a role.
app.get('/api/me', async (req, res) => {
  try {
    const [settings, bindings, catalogue, saves] = await Promise.all([
      readSettings(userKey(req)), readBindings(userKey(req)), readCatalogue(userKey(req)), readSaves(userKey(req)),
    ]);
    res.json({
      id: req.user.id,
      username: req.user.username,
      settings,
      bindings,
      catalogue,
      saves,
    });
  } catch (err) {
    console.error('rig load failed: ' + err.message);
    // The rig still tells the screen who is signed in; only the stored parts
    // are missing, and the screen says so rather than showing a blank rig.
    res.status(500).json({ error: 'Could not read this rig', code: 'rig_unavailable' });
  }
});

// The Settings module: the six sliders, stored for this person and applied to
// every built-in game they run.
app.put('/api/settings', async (req, res) => {
  const raw = (req.body && req.body.settings) || {};
  const next = {};
  for (const key of Object.keys(SETTINGS_DEFAULTS)) next[key] = clampSetting(key, raw[key]);
  try {
    await pool.query(
      `INSERT INTO rr_settings (user_id, volume, gamma, brightness, scanline, aspect, frame_skip, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         volume = EXCLUDED.volume, gamma = EXCLUDED.gamma, brightness = EXCLUDED.brightness,
         scanline = EXCLUDED.scanline, aspect = EXCLUDED.aspect, frame_skip = EXCLUDED.frame_skip,
         updated_at = NOW()`,
      [userKey(req), next.volume, next.gamma, next.brightness, next.scanline, next.aspect, next.frameSkip],
    );
    res.json({ settings: next });
  } catch (err) {
    console.error('settings write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save the settings' });
  }
});

// The Keyboard window's joystick mapper.
app.put('/api/keymap', async (req, res) => {
  const raw = (req.body && req.body.bindings) || {};
  const clean = {};
  for (const key of ['up', 'down', 'left', 'right', 'confirm', 'second']) {
    const value = raw[key];
    clean[key] = typeof value === 'string' && value.length <= 24 ? value : null;
  }
  try {
    await pool.query(
      `INSERT INTO rr_keymap (user_id, up_key, down_key, left_key, right_key, confirm_key, second_key, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         up_key = EXCLUDED.up_key, down_key = EXCLUDED.down_key, left_key = EXCLUDED.left_key,
         right_key = EXCLUDED.right_key, confirm_key = EXCLUDED.confirm_key,
         second_key = EXCLUDED.second_key, updated_at = NOW()`,
      [userKey(req), clean.up, clean.down, clean.left, clean.right, clean.confirm, clean.second],
    );
    res.json({ bindings: clean });
  } catch (err) {
    console.error('keymap write failed: ' + err.message);
    res.status(500).json({ error: 'Could not save the mapping' });
  }
});

// The Game Collection. An entry is a catalogue record: the title the viewer
// gave it, the file's own name, type and size. The bytes are never sent here,
// and a stored entry is never executed by the rig.
app.get('/api/catalogue', async (req, res) => {
  try {
    res.json({ entries: await readCatalogue(userKey(req)) });
  } catch (err) {
    console.error('catalogue read failed: ' + err.message);
    res.status(500).json({ error: 'Could not read the collection' });
  }
});

app.post('/api/catalogue', async (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const filename = typeof body.filename === 'string' ? body.filename.trim().slice(0, 200) : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType.slice(0, 100) : '';
  const sizeBytes = Number(body.sizeBytes);
  const storageUrl = typeof body.storageUrl === 'string' && /^https?:\/\//.test(body.storageUrl)
    ? body.storageUrl.slice(0, 500) : null;
  const source = storageUrl ? 'platform' : 'catalogue';
  if (!title) return res.status(400).json({ error: 'Give the entry a title.' });
  if (!filename) return res.status(400).json({ error: 'Choose a file to catalogue.' });
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return res.status(400).json({ error: 'That file has no readable size.' });
  }
  try {
    const id = require('crypto').randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO rr_catalogue (id, user_id, title, filename, content_type, size_bytes, source, storage_url, added_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, title, filename, content_type, size_bytes, source, storage_url, added_at`,
      [id, userKey(req), title, filename, contentType, Math.round(sizeBytes), source, storageUrl],
    );
    const r = rows[0];
    res.status(201).json({
      entry: {
        id: String(r.id), title: r.title, filename: r.filename, contentType: r.content_type,
        sizeBytes: Number(r.size_bytes), source: r.source, storageUrl: r.storage_url || null, addedAt: r.added_at,
      },
    });
  } catch (err) {
    console.error('catalogue write failed: ' + err.message);
    res.status(500).json({ error: 'Could not add that entry' });
  }
});

app.delete('/api/catalogue/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM rr_catalogue WHERE user_id = $1 AND id = $2',
      [userKey(req), String(req.params.id).slice(0, 80)],
    );
    if (!rowCount) return res.status(404).json({ error: 'That entry is not in this collection.' });
    res.status(204).end();
  } catch (err) {
    console.error('catalogue delete failed: ' + err.message);
    res.status(500).json({ error: 'Could not remove that entry' });
  }
});

// The Memory Card: one save state per game and slot.
app.get('/api/saves', async (req, res) => {
  try {
    res.json({ saves: await readSaves(userKey(req)) });
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
    return res.status(400).json({ error: 'Slots run from 1 to 4.' });
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
      [userKey(req), gameId, slot, label, body.state],
    );
    const r = rows[0];
    res.json({
      save: {
        gameId: r.game_id, slot: Number(r.slot), label: r.label || '', state: r.state, savedAt: r.saved_at,
      },
    });
  } catch (err) {
    console.error('save write failed: ' + err.message);
    res.status(500).json({ error: 'Could not write that slot' });
  }
});

app.delete('/api/saves/:gameId/:slot', async (req, res) => {
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot)) return res.status(400).json({ error: 'Slots run from 1 to 4.' });
  try {
    await pool.query(
      'DELETE FROM rr_saves WHERE user_id = $1 AND game_id = $2 AND slot = $3',
      [userKey(req), String(req.params.gameId).slice(0, 60), slot],
    );
    res.status(204).end();
  } catch (err) {
    console.error('save delete failed: ' + err.message);
    res.status(500).json({ error: 'Could not clear that slot' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works.
app.get('*', (req, res) => {
  if (!req.user) {
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
    aspect INTEGER NOT NULL DEFAULT 0,
    frame_skip INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_catalogue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'catalogue',
    storage_url TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_catalogue_user_idx ON rr_catalogue (user_id, added_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_saves (
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    slot INTEGER NOT NULL,
    label TEXT,
    state JSONB NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, game_id, slot)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_keymap (
    user_id TEXT PRIMARY KEY,
    up_key TEXT, down_key TEXT, left_key TEXT, right_key TEXT,
    confirm_key TEXT, second_key TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

/* ── Staging demo rows ────────────────────────────────────────────────────
 * Staging starts from a copy of production, so the four tables this app
 * creates are empty there. The demo rows below belong to a fake identity, are
 * idempotent, and never touch the account opening the preview: nothing the
 * rig's own logic reads ("has this person saved anything?") is fabricated by
 * them. They exist so the collection, the Memory Card and the keyboard
 * mapping have something to show in a preview.
 */
const DEMO_USER = 'staging-demo-rig';
const DEMO_ENTRIES = [
  { id: 'staging-demo-entry-1', title: 'Trench chart, 1996', filename: 'trench-chart.gif', contentType: 'image/gif', sizeBytes: 214016 },
  { id: 'staging-demo-entry-2', title: 'Mandate shareware disk', filename: 'mandate-share.zip', contentType: 'application/zip', sizeBytes: 3145728 },
  { id: 'staging-demo-entry-3', title: 'Sonar notes, spring', filename: 'sonar-notes.txt', contentType: 'text/plain', sizeBytes: 8192 },
];

async function seedStaging() {
  if (!IS_STAGING) return;
  try {
    await pool.query(
      `INSERT INTO rr_settings (user_id, volume, gamma, brightness, scanline, aspect, frame_skip)
       VALUES ($1, 70, 1, 0, 35, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER],
    );
    await pool.query(
      `INSERT INTO rr_keymap (user_id, up_key, down_key, left_key, right_key, confirm_key, second_key)
       VALUES ($1, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ') ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER],
    );
    for (const entry of DEMO_ENTRIES) {
      await pool.query(
        `INSERT INTO rr_catalogue (id, user_id, title, filename, content_type, size_bytes, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'catalogue') ON CONFLICT (id) DO NOTHING`,
        [entry.id, DEMO_USER, entry.title, entry.filename, entry.contentType, entry.sizeBytes],
      );
    }
    // One obvious fake save in the Memory Card, so the screen shows a written
    // slot rather than only empty ones.
    await pool.query(
      `INSERT INTO rr_saves (user_id, game_id, slot, label, state)
       VALUES ($1, 'deepwatch', 1, 'Staging demo save', $2::jsonb) ON CONFLICT (user_id, game_id, slot) DO NOTHING`,
      [DEMO_USER, JSON.stringify({
        v: 1, game: 'deepwatch', heading: 45, depth: 1, quiet: 82, fix: 40, index: 0, logged: 1,
        message: 'Staging demo save: contact two is still open.', ended: null, score: 0,
        contacts: [{ name: 'Contact two', bearing: 120, range: 3100, band: 1, drift: -0.9 }],
      })],
    );
  } catch (err) {
    // A database outage must not stop the rig: the screens fall back to their
    // empty states.
    console.warn('staging seed failed: ' + err.message);
  }
}

async function start() {
  try {
    await ensureSchema();
  } catch (err) {
    console.warn('schema setup failed: ' + err.message);
  }
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
