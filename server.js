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
 * Nothing in the studio reasons about a date today, but the moment a preview
 * was opened at still reaches the server as req.now, kept for any screen that
 * does. Staging only, and only the value of "now" changes: the code path is
 * the same everywhere.
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

/* ── Pixmotion AI's data ─────────────────────────────────────────────────
 * One person's own project, its media, its tracks, its clips and its
 * assistant transcript, keyed by the platform user id from the verified
 * token. Nothing is kept in the browser.
 *
 * Every table is public by default: a row is one person's own project and
 * the words of their own chat with the assistant, which the app shows them
 * on their own screen. No secrets, no messages between people, no payment
 * record (the spend figures are the platform's own meter readings, already
 * shown to that person in the platform's Settings), no personal information
 * beyond the platform username.
 */

const crypto = require('crypto');
const { callProxy, overLimit } = require('./lib/llm-proxy');

/* ── The platform's text AI ───────────────────────────────────────────────
 * The one real generation. Production containers carry the proxy's URL and
 * this app's token; staging containers carry NEITHER, by the platform's own
 * design, so an unreviewed build can spend nobody's budget. The route below
 * detects the absence and answers plainly instead of calling anything. This
 * is an environment fact, not a feature gate: nothing here reads IS_STAGING.
 */
const LLM_ENABLED = !!process.env.USERNODE_LLM_PROXY_TOKEN;
const LLM_URL = (process.env.USERNODE_LLM_PROXY_URL || '').replace(/\/+$/, '');
const ASSISTANT_MODEL = 'claude-sonnet-5-5';
const ASSISTANT_MAX_TOKENS = 600;
const ASSISTANT_SYSTEM = [
  'You are the Pixmotion AI assistant for one media project in a dark video editing suite.',
  'You answer questions about the project and draft titles, captions, scripts, descriptions and shot lists.',
  'You cannot generate images, video or audio. If asked, say so plainly and point at the studio\'s',
  'labelled placeholders, which are simulations.',
  'Decline anything sexual, suggestive, nude or explicit, at any level of detail. Decline any depiction',
  'of children, minors or kids\' activities, including captions or scripts about them. Decline anything',
  'violent or about weapons, and anything about gambling, betting or loot boxes. Answer such a request',
  'with one short neutral sentence and nothing more.',
  'Keep replies short and practical. Write plain prose without em dashes.',
].join(' ');

// The default project a person starts with, until they have one of their
// own. The inspector's own controls are its columns.
const PROJECT_DEFAULTS = {
  name: 'Untitled project',
  aspect: '16:9',
  resolution: '1K',
  durationMs: 100000,
  cameraPreset: 'dolly-zoom',
  motionPreset: 'natural',
  motionRealism: 7,
  volume: 75,
};
const DEFAULT_TRACKS = [
  { kind: 'text', label: 'Text' },
  { kind: 'clip', label: 'Clips' },
  { kind: 'transition', label: 'Transitions' },
  { kind: 'audio', label: 'Audio' },
];
const TRACK_KINDS = ['text', 'clip', 'transition', 'audio', 'voice'];
const MEDIA_KINDS = ['clip', 'image', 'avatar', 'audio', 'placeholder'];
const ASPECTS = ['16:9', '9:16', '9:16-tiktok', '9:16-reels', '1:1', '4:5', '16:9-facebook', '1:1-facebook'];
const RESOLUTIONS = ['1K', '2K', '4K'];
const CAMERAS = ['static', 'dolly-zoom', 'slow-pan', 'orbit', 'crane-up'];
const MOTIONS = ['natural', 'stylised', 'slow-motion', 'handheld'];
const DURATION_MS = [5000, 600000];

function userId(req) {
  return req.user ? String(req.user.id) : null;
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// Art is only ever an https URL the platform's storage handed back. Image
// bytes are never stored here.
function httpsUrl(value) {
  return typeof value === 'string' && /^https:\/\//.test(value) ? value.slice(0, 500) : null;
}

function pick(list, value, fallback) {
  return list.includes(value) ? value : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

function shapeProject(row) {
  return {
    id: String(row.id),
    ownerId: row.owner_id == null ? null : String(row.owner_id),
    name: row.name || PROJECT_DEFAULTS.name,
    aspect: pick(ASPECTS, row.aspect, PROJECT_DEFAULTS.aspect),
    resolution: pick(RESOLUTIONS, row.resolution, PROJECT_DEFAULTS.resolution),
    durationMs: clampInt(row.duration_ms, DURATION_MS[0], DURATION_MS[1], PROJECT_DEFAULTS.durationMs),
    cameraPreset: pick(CAMERAS, row.camera_preset, PROJECT_DEFAULTS.cameraPreset),
    motionPreset: pick(MOTIONS, row.motion_preset, PROJECT_DEFAULTS.motionPreset),
    motionRealism: clampInt(row.motion_realism, 0, 10, PROJECT_DEFAULTS.motionRealism),
    volume: clampInt(row.volume, 0, 100, PROJECT_DEFAULTS.volume),
    assistantName: row.assistant_name || null,
    sample: !!row.sample,
    updatedAt: row.updated_at || null,
  };
}

function shapeMedia(row) {
  return {
    id: String(row.id),
    projectId: row.project_id == null ? null : String(row.project_id),
    title: row.title,
    kind: pick(MEDIA_KINDS, row.kind, 'clip'),
    durationMs: Math.max(0, Number(row.duration_ms) || 0),
    artUrl: row.art_url || null,
    artFileId: row.art_file_id || null,
    simulated: row.simulated !== false,
    sortOrder: Number(row.sort_order) || 100,
    createdAt: row.created_at || null,
  };
}

function shapeTrack(row) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    kind: pick(TRACK_KINDS, row.kind, 'clip'),
    label: row.label || row.kind,
    locked: !!row.locked,
    hidden: !!row.hidden,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function shapeClip(row) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    trackId: String(row.track_id),
    mediaId: row.media_id == null ? null : String(row.media_id),
    label: row.label || '',
    startMs: Math.max(0, Number(row.start_ms) || 0),
    endMs: Math.max(0, Number(row.end_ms) || 0),
    trimInMs: Math.max(0, Number(row.trim_in_ms) || 0),
    simulated: row.simulated !== false,
  };
}

function shapeTurn(row) {
  return {
    id: String(row.id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    body: row.body || '',
    model: row.model || null,
    spentCents: row.spent_cents == null ? null : Number(row.spent_cents),
    capCents: row.cap_cents == null ? null : Number(row.cap_cents),
    createdAt: row.created_at || null,
  };
}

// A person's own project. The studio shows one project per person, the
// first one they have.
async function ownProjectRow(ownerId) {
  if (!ownerId) return null;
  const { rows } = await pool.query(
    'SELECT * FROM rr_projects WHERE owner_id = $1 ORDER BY sort_order ASC, updated_at ASC LIMIT 1',
    [ownerId],
  );
  return rows[0] || null;
}

// The sample project: a row marked `sample`, shown read-only to anyone who
// has no project of their own yet. Production holds none, so there a person
// with no project sees the default shape; the staging seed below writes one
// under a fake account, which is what the checks and the shots land on.
async function sampleProjectRow() {
  const { rows } = await pool.query(
    'SELECT * FROM rr_projects WHERE sample = TRUE ORDER BY sort_order ASC, id ASC LIMIT 1',
  );
  return rows[0] || null;
}

async function readProjectParts(project) {
  const [media, tracks, clips, turns] = await Promise.all([
    pool.query('SELECT * FROM rr_media WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC, id ASC', [project.id]),
    pool.query('SELECT * FROM rr_tracks WHERE project_id = $1 ORDER BY sort_order ASC, id ASC', [project.id]),
    pool.query('SELECT * FROM rr_clips WHERE project_id = $1 ORDER BY start_ms ASC, id ASC', [project.id]),
    pool.query('SELECT * FROM rr_assistant WHERE project_id = $1 ORDER BY created_at ASC, id ASC', [project.id]),
  ]);
  return {
    media: media.rows.map(shapeMedia),
    tracks: tracks.rows.map(shapeTrack),
    clips: clips.rows.map(shapeClip),
    transcript: turns.rows.map(shapeTurn),
  };
}

// The default project's shape, for a person with none and no sample to show.
// Nothing is written until they make a change.
function draftStudio(ownerId) {
  return {
    project: Object.assign({ id: 'draft', ownerId, assistantName: null, sample: false, updatedAt: null }, PROJECT_DEFAULTS),
    media: [],
    tracks: DEFAULT_TRACKS.map((t, i) => ({
      id: 'draft-' + t.kind, projectId: 'draft', kind: t.kind, label: t.label, locked: false, hidden: false, sortOrder: i,
    })),
    clips: [],
    transcript: [],
    readOnly: false,
    sample: false,
  };
}

// The whole studio for one viewer, in one shape.
async function readStudio(viewerId) {
  let row = await ownProjectRow(viewerId);
  let sample = false;
  if (!row) {
    row = await sampleProjectRow();
    sample = !!row;
  }
  if (!row) return draftStudio(viewerId);
  const project = shapeProject(row);
  const parts = await readProjectParts(project);
  return Object.assign({ project, readOnly: sample, sample }, parts);
}

// The last meter reading this person's own replies carried, for the meter's
// fallback when the bridge cannot answer.
async function lastMeter(ownerId) {
  if (!ownerId) return { lastSpentCents: null, lastCapCents: null };
  const { rows } = await pool.query(
    `SELECT spent_cents, cap_cents FROM rr_assistant
      WHERE owner_id = $1 AND role = 'assistant' AND spent_cents IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [ownerId],
  );
  const row = rows[0];
  return {
    lastSpentCents: row ? Number(row.spent_cents) : null,
    lastCapCents: row && row.cap_cents != null ? Number(row.cap_cents) : null,
  };
}

// Today's meter reading, for the app's own spend limit. Unlike lastMeter it
// only reads rows from the current UTC day, so a reading from an earlier day
// never trips the limit; the platform resets its cap at midnight UTC.
async function todayMeter(ownerId) {
  if (!ownerId) return { lastSpentCents: null, lastCapCents: null };
  const { rows } = await pool.query(
    `SELECT spent_cents, cap_cents FROM rr_assistant
      WHERE owner_id = $1 AND role = 'assistant' AND spent_cents IS NOT NULL
        AND cap_cents IS NOT NULL
        AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      ORDER BY created_at DESC LIMIT 1`,
    [ownerId],
  );
  const row = rows[0];
  return {
    lastSpentCents: row ? Number(row.spent_cents) : null,
    lastCapCents: row && row.cap_cents != null ? Number(row.cap_cents) : null,
  };
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

// A write always lands on the writer's OWN project. A person with none gets
// one now: a copy of the sample project when there is one (so the studio
// they were looking at is the one they keep), the default shape otherwise.
// The transcript is never copied: a chat is the person's own.
async function ensureOwnProject(ownerId) {
  const existing = await ownProjectRow(ownerId);
  if (existing) return shapeProject(existing);
  const sample = await sampleProjectRow();
  const id = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (sample) {
      const src = shapeProject(sample);
      await client.query(
        `INSERT INTO rr_projects (id, owner_id, name, aspect, resolution, duration_ms, camera_preset, motion_preset,
           motion_realism, volume, assistant_name, sample, sort_order, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, FALSE, 100, NOW())`,
        [id, ownerId, src.name.replace(/^Staging demo project$/, 'My project'), src.aspect, src.resolution,
          src.durationMs, src.cameraPreset, src.motionPreset, src.motionRealism, src.volume],
      );
      const parts = await readProjectParts(src);
      const mediaIds = new Map();
      for (const m of parts.media) {
        const nid = crypto.randomUUID();
        mediaIds.set(m.id, nid);
        await client.query(
          `INSERT INTO rr_media (id, owner_id, project_id, title, kind, duration_ms, art_url, art_file_id, simulated, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
          [nid, ownerId, id, m.title, m.kind, m.durationMs, m.artUrl, m.artFileId, m.sortOrder],
        );
      }
      const trackIds = new Map();
      for (const t of parts.tracks) {
        const nid = crypto.randomUUID();
        trackIds.set(t.id, nid);
        await client.query(
          `INSERT INTO rr_tracks (id, owner_id, project_id, kind, label, locked, hidden, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [nid, ownerId, id, t.kind, t.label, t.locked, t.hidden, t.sortOrder],
        );
      }
      for (const c of parts.clips) {
        const track = trackIds.get(c.trackId);
        if (!track) continue;
        await client.query(
          `INSERT INTO rr_clips (id, owner_id, project_id, track_id, media_id, label, start_ms, end_ms, trim_in_ms, simulated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
          [crypto.randomUUID(), ownerId, id, track, c.mediaId ? mediaIds.get(c.mediaId) || null : null,
            c.label, c.startMs, c.endMs, c.trimInMs],
        );
      }
    } else {
      const d = PROJECT_DEFAULTS;
      await client.query(
        `INSERT INTO rr_projects (id, owner_id, name, aspect, resolution, duration_ms, camera_preset, motion_preset,
           motion_realism, volume, assistant_name, sample, sort_order, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, FALSE, 100, NOW())`,
        [id, ownerId, d.name, d.aspect, d.resolution, d.durationMs, d.cameraPreset, d.motionPreset, d.motionRealism, d.volume],
      );
      for (let i = 0; i < DEFAULT_TRACKS.length; i += 1) {
        await client.query(
          `INSERT INTO rr_tracks (id, owner_id, project_id, kind, label, locked, hidden, sort_order)
           VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6)`,
          [crypto.randomUUID(), ownerId, id, DEFAULT_TRACKS[i].kind, DEFAULT_TRACKS[i].label, i],
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const row = await ownProjectRow(ownerId);
  return shapeProject(row);
}

function fail(res, err, what) {
  console.error(what + ': ' + err.message);
  res.status(500).json({ error: 'Could not ' + what });
}

/* ── Routes ──────────────────────────────────────────────────────────────── */

// The whole studio in one round trip: this person's project (or the sample,
// or the default shape), its media, its tracks and clips, the transcript,
// and the assistant's own state. It never calls the proxy.
async function studioFor(req) {
  const id = userId(req);
  const studio = await readStudio(id);
  const meter = await lastMeter(id);
  return Object.assign(studio, {
    username: req.user ? (req.user.username || '') : '',
    signedIn: !!req.user,
    assistant: Object.assign({ enabled: LLM_ENABLED, model: ASSISTANT_MODEL }, meter),
  });
}

app.get('/api/studio', async (req, res) => {
  try {
    res.json(await studioFor(req));
  } catch (err) {
    fail(res, err, 'read the studio');
  }
});

// Starts a person's own project (a copy of the sample when there is one).
// A write on the sample calls this first.
app.post('/api/projects', async (req, res) => {
  try {
    await ensureOwnProject(userId(req));
    res.json(await studioFor(req));
  } catch (err) {
    fail(res, err, 'start the project');
  }
});

// The inspector's own controls, only the keys present.
app.put('/api/projects/:id', async (req, res) => {
  const owner = userId(req);
  const body = req.body || {};
  try {
    const project = await ensureOwnProject(owner);
    if (String(req.params.id) !== project.id) return res.status(404).json({ error: 'That is not your project.' });
    const next = {
      name: typeof body.name === 'string' ? (text(body.name, 120).trim() || project.name) : project.name,
      aspect: 'aspect' in body ? pick(ASPECTS, body.aspect, project.aspect) : project.aspect,
      resolution: 'resolution' in body ? pick(RESOLUTIONS, body.resolution, project.resolution) : project.resolution,
      durationMs: 'durationMs' in body ? clampInt(body.durationMs, DURATION_MS[0], DURATION_MS[1], project.durationMs) : project.durationMs,
      cameraPreset: 'cameraPreset' in body ? pick(CAMERAS, body.cameraPreset, project.cameraPreset) : project.cameraPreset,
      motionPreset: 'motionPreset' in body ? pick(MOTIONS, body.motionPreset, project.motionPreset) : project.motionPreset,
      motionRealism: 'motionRealism' in body ? clampInt(body.motionRealism, 0, 10, project.motionRealism) : project.motionRealism,
      volume: 'volume' in body ? clampInt(body.volume, 0, 100, project.volume) : project.volume,
    };
    await pool.query(
      `UPDATE rr_projects SET name = $3, aspect = $4, resolution = $5, duration_ms = $6, camera_preset = $7,
         motion_preset = $8, motion_realism = $9, volume = $10, updated_at = NOW()
       WHERE id = $1 AND owner_id = $2`,
      [project.id, owner, next.name, next.aspect, next.resolution, next.durationMs, next.cameraPreset,
        next.motionPreset, next.motionRealism, next.volume],
    );
    // A shorter project clamps every block to the new end.
    await pool.query(
      `UPDATE rr_clips SET end_ms = LEAST(end_ms, $2), start_ms = LEAST(start_ms, GREATEST(0, $2 - 250))
       WHERE project_id = $1`,
      [project.id, next.durationMs],
    );
    res.json(await studioFor(req));
  } catch (err) {
    fail(res, err, 'save the project');
  }
});

// One library row. Every row this app writes is simulated: it has no real
// media of its own, and a client cannot claim a real generation.
app.post('/api/media', async (req, res) => {
  const owner = userId(req);
  const body = req.body || {};
  const title = text(body.title, 160).trim();
  if (!title) return res.status(400).json({ error: 'Give the media row a title.' });
  try {
    const project = await ensureOwnProject(owner);
    const id = crypto.randomUUID();
    const artUrl = httpsUrl(body.artUrl);
    await pool.query(
      `INSERT INTO rr_media (id, owner_id, project_id, title, kind, duration_ms, art_url, art_file_id, simulated, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
      [id, owner, project.id, title, pick(MEDIA_KINDS, body.kind, 'placeholder'),
        clampInt(body.durationMs, 250, 3600000, 5000), artUrl, artUrl ? text(body.artFileId, 200) || null : null,
        clampInt(body.sortOrder, 0, 10000, 200)],
    );
    res.json(Object.assign({ mediaId: id }, await studioFor(req)));
  } catch (err) {
    fail(res, err, 'add the media');
  }
});

app.delete('/api/media/:id', async (req, res) => {
  const owner = userId(req);
  const id = text(req.params.id, 80);
  try {
    const { rowCount } = await pool.query('DELETE FROM rr_media WHERE id = $1 AND owner_id = $2', [id, owner]);
    if (!rowCount) return res.status(404).json({ error: 'That media is not in your library.' });
    await pool.query('UPDATE rr_clips SET media_id = NULL WHERE media_id = $1 AND owner_id = $2', [id, owner]);
    res.json(await studioFor(req));
  } catch (err) {
    fail(res, err, 'remove the media');
  }
});

// A picture the bridge already uploaded: the pair is stored, the bytes never
// come here. Platform files are immutable, so a replace keeps the new pair.
app.put('/api/media/:id/art', async (req, res) => {
  const owner = userId(req);
  const body = req.body || {};
  const url = httpsUrl(body.url);
  if (!url) return res.status(400).json({ error: 'The picture must be an https URL from platform storage.' });
  try {
    const { rowCount } = await pool.query(
      'UPDATE rr_media SET art_url = $3, art_file_id = $4 WHERE id = $1 AND owner_id = $2',
      [text(req.params.id, 80), owner, url, text(body.fileId, 200) || null],
    );
    if (!rowCount) return res.status(404).json({ error: 'That media is not in your library.' });
    res.json(await studioFor(req));
  } catch (err) {
    fail(res, err, 'save the picture');
  }
});

// The whole track and clip list, replaced in one transaction, so a moved
// block never half-applies. Every time is clamped to the project's length.
app.put('/api/timeline', async (req, res) => {
  const owner = userId(req);
  const raw = req.body && Array.isArray(req.body.tracks) ? req.body.tracks : null;
  if (!raw) return res.status(400).json({ error: 'The timeline needs a list of tracks.' });
  try {
    const project = await ensureOwnProject(owner);
    const length = project.durationMs;
    const mediaRows = await pool.query('SELECT id FROM rr_media WHERE project_id = $1', [project.id]);
    const mediaIds = new Set(mediaRows.rows.map((r) => String(r.id)));
    const tracks = raw.slice(0, 8).map((t, i) => ({
      id: text(t && t.id, 80) || crypto.randomUUID(),
      kind: pick(TRACK_KINDS, t && t.kind, 'clip'),
      label: text(t && t.label, 60).trim() || 'Track',
      locked: !!(t && t.locked),
      hidden: !!(t && t.hidden),
      sortOrder: i,
      clips: Array.isArray(t && t.clips) ? t.clips.slice(0, 60).map((c) => {
        const start = clampInt(c && c.startMs, 0, length, 0);
        const end = Math.max(start + 250, clampInt(c && c.endMs, 0, length, start + 250));
        const trim = clampInt(c && c.trimInMs, 0, Math.max(0, end - start - 250), 0);
        const media = c && typeof c.mediaId === 'string' && mediaIds.has(c.mediaId) ? c.mediaId : null;
        return {
          id: text(c && c.id, 80) || crypto.randomUUID(),
          mediaId: media,
          label: text(c && c.label, 160).trim(),
          startMs: start,
          endMs: Math.min(length, end),
          trimInMs: trim,
        };
      }).filter((c) => c.endMs > c.startMs) : [],
    }));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM rr_clips WHERE project_id = $1 AND owner_id = $2', [project.id, owner]);
      await client.query('DELETE FROM rr_tracks WHERE project_id = $1 AND owner_id = $2', [project.id, owner]);
      for (const t of tracks) {
        await client.query(
          `INSERT INTO rr_tracks (id, owner_id, project_id, kind, label, locked, hidden, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [t.id, owner, project.id, t.kind, t.label, t.locked, t.hidden, t.sortOrder],
        );
        for (const c of t.clips) {
          await client.query(
            `INSERT INTO rr_clips (id, owner_id, project_id, track_id, media_id, label, start_ms, end_ms, trim_in_ms, simulated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
            [c.id, owner, project.id, t.id, c.mediaId, c.label, c.startMs, c.endMs, c.trimInMs],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(await studioFor(req));
  } catch (err) {
    fail(res, err, 'save the timeline');
  }
});

/* ── The assistant: the one real AI route ─────────────────────────────────
 * Forwards the message to the platform's Claude proxy with this app's token
 * and the caller's own forwarded iframe token, under the caller's consent
 * grant. It never asks for a key, never names a third-party host, never
 * retries and never leaks upstream text. Its failures are codes the widget
 * turns into its own sentences.
 */
app.post('/api/assistant', async (req, res) => {
  const owner = userId(req);
  const body = req.body || {};
  const message = text(body.text, 2000).trim();
  if (!message) return res.status(400).json({ error: 'Type a message first.' });
  if (!LLM_ENABLED || !LLM_URL) {
    return res.status(503).json({ error: 'AI assistant unavailable in this environment', code: 'assistant_unavailable' });
  }
  // The app's own hard limit: a quarter of the platform's reported daily cap
  // for this app. Once reached, nothing is sent to the proxy and no turn is
  // stored for the rest of the UTC day. A failed read falls through: the
  // platform's own cap still applies.
  let today;
  try {
    today = await todayMeter(owner);
  } catch (err) {
    console.warn('assistant limit read failed: ' + err.message);
    today = null;
  }
  if (today && overLimit(today.lastSpentCents, today.lastCapCents)) {
    if (today.lastSpentCents != null) res.set('x-usernode-llm-spent-cents', String(today.lastSpentCents));
    if (today.lastCapCents != null) res.set('x-usernode-llm-cap-cents', String(today.lastCapCents));
    return res.status(429).json({ error: 'App AI limit reached', code: 'app_limit_reached' });
  }
  const history = Array.isArray(body.history)
    ? body.history
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
      .slice(-10)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }))
    : [];
  // The proxy wants alternating turns starting with the user; drop a leading
  // assistant turn and collapse a repeated role.
  const turns = [];
  for (const t of history) {
    if (!turns.length && t.role !== 'user') continue;
    if (turns.length && turns[turns.length - 1].role === t.role) turns[turns.length - 1] = t;
    else turns.push(t);
  }
  if (turns.length && turns[turns.length - 1].role === 'user') turns.pop();
  turns.push({ role: 'user', content: message });

  const result = await callProxy({
    proxyUrl: LLM_URL,
    appToken: process.env.USERNODE_LLM_PROXY_TOKEN,
    userToken: req.headers['x-usernode-token'],
    body: { model: ASSISTANT_MODEL, max_tokens: ASSISTANT_MAX_TOKENS, system: ASSISTANT_SYSTEM, messages: turns },
  });
  if (result.meter.spentCents != null) res.set('x-usernode-llm-spent-cents', String(result.meter.spentCents));
  if (result.meter.capCents != null) res.set('x-usernode-llm-cap-cents', String(result.meter.capCents));
  if (result.status === 403) return res.status(403).json({ error: 'AI permission needed', code: 'grant_required' });
  if (result.status === 429) return res.status(429).json({ error: 'Daily AI limit reached', code: result.code });
  if (result.status !== 200 || !result.text) {
    return res.status(502).json({ error: 'The assistant did not answer', code: 'assistant_failed' });
  }
  try {
    const project = await ensureOwnProject(owner);
    await pool.query(
      `INSERT INTO rr_assistant (id, owner_id, project_id, role, body, model, spent_cents, cap_cents)
       VALUES ($1, $2, $3, 'user', $4, NULL, NULL, NULL)`,
      [crypto.randomUUID(), owner, project.id, message],
    );
    await pool.query(
      `INSERT INTO rr_assistant (id, owner_id, project_id, role, body, model, spent_cents, cap_cents)
       VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7)`,
      [crypto.randomUUID(), owner, project.id, result.text, result.model || ASSISTANT_MODEL,
        result.meter.spentCents, result.meter.capCents],
    );
  } catch (err) {
    console.warn('assistant turn was not stored: ' + err.message);
  }
  res.json({
    reply: result.text,
    model: result.model || ASSISTANT_MODEL,
    spentCents: result.meter.spentCents,
    capCents: result.meter.capCents,
  });
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
  // The handheld's tables go. Nothing in the studio reads them, and leaving
  // them behind would leave eight tables that look load-bearing and are not.
  // A production database loses the eight titles, their slides, their saves,
  // their key mapping and their snapshots on the first boot after this
  // change, which is the intended consequence of the rewrite.
  for (const table of ['rr_titles', 'rr_title_slides', 'rr_saves', 'rr_keymap', 'rr_catalogue',
    'rr_skins', 'rr_snapshots', 'rr_settings']) {
    await pool.query('DROP TABLE IF EXISTS ' + table);
  }

  // One editing project. Its columns are the inspector's own controls.
  // `sample` marks the one project shown read-only to a person with none.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    aspect TEXT,
    resolution TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 100000,
    camera_preset TEXT,
    motion_preset TEXT,
    motion_realism INTEGER NOT NULL DEFAULT 7,
    volume INTEGER NOT NULL DEFAULT 75,
    assistant_name TEXT,
    sample BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_projects_owner_idx ON rr_projects (owner_id, sort_order ASC)');

  // One clip, image, avatar, audio or placeholder row in a project's library.
  // `simulated` is what the badge reads, so a placeholder is labelled from
  // data. Art is a platform-storage URL and its file id, never bytes. There
  // is no price column: a placeholder costs nothing and claims nothing.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_media (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    project_id TEXT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    art_url TEXT,
    art_file_id TEXT,
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_media_project_idx ON rr_media (project_id, sort_order ASC)');

  // One lane of the timeline, with the lane head's own lock and hide flags.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_tracks (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_tracks_project_idx ON rr_tracks (project_id, sort_order ASC)');

  // One block on a lane. trim_in_ms is the trim handle's own offset.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_clips (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    media_id TEXT,
    label TEXT,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    trim_in_ms INTEGER NOT NULL DEFAULT 0,
    simulated BOOLEAN NOT NULL DEFAULT TRUE
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_clips_project_idx ON rr_clips (project_id, start_ms ASC)');

  // One assistant turn. spent_cents and cap_cents are the two meter headers
  // the proxy returned with that reply, null on a seeded or failed turn.
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_assistant (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    project_id TEXT,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    model TEXT,
    spent_cents NUMERIC(10,4),
    cap_cents INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS rr_assistant_project_idx ON rr_assistant (project_id, created_at ASC)');
}

/* ── Staging demo rows ────────────────────────────────────────────────────
 * Staging starts from a copy of production, so the tables this change creates
 * are empty there. The rows below belong to a FAKE account, are idempotent,
 * and never touch the account opening the preview: the reviewer still starts
 * with no project of their own, and their first change starts one (a copy of
 * this sample). No seeded row carries a spend figure, so the AI meter cannot
 * mistake one for a real reading. The demo project is what the checks, the
 * before/after shots and the "Test this change" links land on.
 */
const DEMO_USER = 'staging-demo-rig';
const DEMO_PROJECT = 'staging-demo-project';
// A 1x1 pixel, so a demo thumbnail is a real image URL without depending on a
// file staging does not hold. Never a real /app-files/ URL.
const DEMO_ART = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

async function seedStaging() {
  if (!IS_STAGING) return;
  try {
    await pool.query(
      `INSERT INTO rr_projects (id, owner_id, name, aspect, resolution, duration_ms, camera_preset, motion_preset,
         motion_realism, volume, assistant_name, sample, sort_order, updated_at)
       VALUES ($1, $2, 'Staging demo project', '16:9', '1K', 100000, 'dolly-zoom', 'natural', 7, 75, 'Mike', TRUE, 1, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_PROJECT, DEMO_USER],
    );
    const media = [
      ['staging-demo-clip-text', 'Staging demo clip: Introduction to text', 'clip', 640000, 1],
      ['staging-demo-clip-audio', 'Staging demo clip: Introduction to audio', 'audio', 152000, 2],
      ['staging-demo-clip-video', 'Staging demo clip: Introduction to video', 'clip', 431000, 3],
      ['staging-demo-placeholder-image', 'Staging demo placeholder: Generate Images', 'placeholder', 5000, 4],
    ];
    for (const m of media) {
      await pool.query(
        `INSERT INTO rr_media (id, owner_id, project_id, title, kind, duration_ms, art_url, art_file_id, simulated, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, TRUE, $8) ON CONFLICT (id) DO NOTHING`,
        [m[0], DEMO_USER, DEMO_PROJECT, m[1], m[2], m[3], DEMO_ART, m[4]],
      );
    }
    const tracks = [
      ['staging-demo-track-text', 'text', 'Text', 0],
      ['staging-demo-track-clip', 'clip', 'Clips', 1],
      ['staging-demo-track-transition', 'transition', 'Transitions', 2],
      ['staging-demo-track-audio', 'audio', 'Audio', 3],
    ];
    for (const t of tracks) {
      await pool.query(
        `INSERT INTO rr_tracks (id, owner_id, project_id, kind, label, locked, hidden, sort_order)
         VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6) ON CONFLICT (id) DO NOTHING`,
        [t[0], DEMO_USER, DEMO_PROJECT, t[1], t[2], t[3]],
      );
    }
    const clips = [
      ['staging-demo-clip-text-1', 'staging-demo-track-text', null, 'Welcome to our training session', 0, 46000, 0],
      ['staging-demo-clip-intro', 'staging-demo-track-clip', 'staging-demo-clip-text', '', 6000, 28000, 0],
      ['staging-demo-clip-a', 'staging-demo-track-clip', 'staging-demo-clip-video', '', 34000, 54000, 1500],
      ['staging-demo-clip-b', 'staging-demo-track-clip', 'staging-demo-clip-video', '', 58000, 80000, 0],
      ['staging-demo-transition-1', 'staging-demo-track-transition', null, 'Cross fade', 27000, 35000, 0],
      ['staging-demo-audio-1', 'staging-demo-track-audio', 'staging-demo-clip-audio', 'Voice: narration', 0, 100000, 0],
    ];
    for (const c of clips) {
      await pool.query(
        `INSERT INTO rr_clips (id, owner_id, project_id, track_id, media_id, label, start_ms, end_ms, trim_in_ms, simulated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) ON CONFLICT (id) DO NOTHING`,
        [c[0], DEMO_USER, DEMO_PROJECT, c[1], c[2], c[3], c[4], c[5], c[6]],
      );
    }
    // Two turns, with every meter field null: a seeded reply must never hand
    // the meter a figure.
    await pool.query(
      `INSERT INTO rr_assistant (id, owner_id, project_id, role, body, model, spent_cents, cap_cents, created_at)
       VALUES ($1, $2, $3, 'user', 'Draft a caption for the training session clip.', NULL, NULL, NULL, NOW() - interval '2 minutes')
       ON CONFLICT (id) DO NOTHING`,
      ['staging-demo-turn-1', DEMO_USER, DEMO_PROJECT],
    );
    await pool.query(
      `INSERT INTO rr_assistant (id, owner_id, project_id, role, body, model, spent_cents, cap_cents, created_at)
       VALUES ($1, $2, $3, 'assistant', 'Staging demo reply: this sentence was seeded by the app and not written by the platform''s AI.', NULL, NULL, NULL, NOW() - interval '1 minute')
       ON CONFLICT (id) DO NOTHING`,
      ['staging-demo-turn-2', DEMO_USER, DEMO_PROJECT],
    );
  } catch (err) {
    // A database outage must not stop the studio: the screens fall back to
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
