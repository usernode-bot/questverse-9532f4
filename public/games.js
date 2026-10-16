// GameWatch's eight built-in titles.
//
// Every title is an original to this app: its own name, its own segment art
// and its own rules. None of them is the name, art or scenario of any
// commercial game, and none of them borrows a real hardware brand.
//
// Each title is a PURE state machine plus a drawer:
//   newRun()            a fresh run
//   load(snapshot)      a run rebuilt from a Memory Card slot, every field
//                       clamped, falling back to a fresh run
//   step(state, dtMs)   advance the simulation by real time
//   key(state, action)  one of the handheld's own keys (up, down, left,
//                       right, game_a, game_b)
//   readout(state)      the printed lines under the panel
//   draw(picture, s)    the panel itself, in segments
// Nothing here touches the DOM, keeps storage or reads the clock, so a save
// slot serializes a whole run and a test can drive one with no browser.
//
// Content note: there is no violence, no weaponry, no gambling and no
// betting anywhere in the eight titles, their covers, their copy or the seed
// data. The names that sound martial are played as their harmless readings: a
// hurdle race, a ridge glider, a jungle trek, a salvage dive, a
// rock-dodging flight, fruit caught and embers dodged, and coins sorted into
// trays.

import { VIDEO_W, VIDEO_H } from './crt.js';
import {
  LCD_INK, LCD_GHOST, LCD_PALE, LCD_WARN, LCD_DIM, LCD_GROUND,
  art, segmentNumber, segmentChar, printed, lit, beginPanel, frame, cellBar,
} from './lcd.js';
import { BUILT_IN_TITLES } from './titles.originals.js';

/* ── The code each title is played with ─────────────────────────────────── */

// The six buttons a title's own rules understand, plus the three the host
// owns. A control row in the database names the buttons it covers, and it is
// checked against this list.
const PLAY_ACTION_KEYS = ['up', 'down', 'left', 'right', 'game_a', 'game_b', 'sound', 'time', 'reset'];

/* ── Shared helpers ─────────────────────────────────────────────────────── */

function clampNum(value, lo, hi, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function clampInt(value, lo, hi, fallback) {
  return Math.round(clampNum(value, lo, hi, fallback));
}

// A fixed cycle: every title's sequence of orders, hurdles or rocks is
// committed data rather than a random draw, so a run is reproducible and two
// builds' screenshots line up.
function cycle(list, i) {
  const at = ((Math.trunc(i) % list.length) + list.length) % list.length;
  return list[at];
}

// A run ends the same way in every title: a few misses and the panel shows
// its closing line. The host draws the outcome; the title only names it.
export function endRun(state, reason, message) {
  state.ended = reason;
  state.message = message;
  return true;
}

/* ── The eight titles ─────────────────────────────────────────────────────
 * A title's WORDS are rows in the database now (seeded from
 * public/titles.originals.js), so the manager can edit them and the Arcade is
 * drawn from what the app actually holds. A title's RULES and its panel
 * drawing stay here, in the code register at the bottom of this file: the
 * manager edits what a title says, never how it plays.
 *
 * `registerTitles(rows)` is what the host calls once, with what it loaded, so
 * every synchronous read below still answers without the caller plumbing the
 * collection through. The default is the eight originals, so a module loaded
 * with nothing registered still works.
 */
// Filled in below, once the code register exists: `shapeTitleRow` pairs a row
// with its code, and the register is defined after this point in the file.
let TITLES = [];

function cleanText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// One title row, as the app reads it everywhere. It carries the code register's
// drawing and label when the id has one, so an added title (a row with no
// register entry) still lists, filters and shows its picture.
function shapeTitleRow(row) {
  const code = CODE.get(String(row && row.id));
  return {
    id: String(row && row.id),
    title: cleanText(row && row.title, 120) || 'Untitled',
    year: Math.round(Number(row && row.year)) || 0,
    category: cleanText(row && row.category, 40) || 'Other',
    genreBox: cleanText(row && row.genreBox, 60),
    genres: Array.isArray(row && row.genres) ? row.genres.filter((g) => typeof g === 'string').slice(0, 8) : [],
    tagline: cleanText(row && row.tagline, 200),
    summary: cleanText(row && row.summary, 2000),
    controls: Array.isArray(row && row.controls)
      ? row.controls.map((c) => ({
        keys: cleanText(c && c.keys, 60),
        action: cleanText(c && c.action, 160),
        plays: Array.isArray(c && c.plays) ? c.plays.filter((k) => PLAY_ACTION_KEYS.includes(k)).slice(0, 6) : [],
      })) : [],
    howTo: Array.isArray(row && row.howTo)
      ? row.howTo.map((b) => ({
        heading: cleanText(b && b.heading, 80),
        lines: Array.isArray(b && b.lines) ? b.lines.filter((l) => typeof l === 'string').map((l) => l.slice(0, 400)).slice(0, 12) : [],
      })) : [],
    coverArt: Array.isArray(row && row.coverArt) ? row.coverArt.filter((r) => typeof r === 'string').slice(0, 40) : [],
    thumbnailUrl: cleanText(row && row.thumbnailUrl, 500) || null,
    bezelUrl: cleanText(row && row.bezelUrl, 500) || null,
    tiers: Array.isArray(row && row.tiers) && row.tiers.length
      ? row.tiers.map((t) => ({
        name: cleanText(t && t.name, 40) || 'Tier',
        min: Number.isFinite(Number(t && t.min)) ? Number(t.min) : 0,
        max: t && t.max == null ? null : Number(t.max),
      })) : [{ name: 'Rookie', min: 0, max: null }],
    builtIn: !!(row && row.builtIn),
    mine: !!(row && row.mine),
    sortOrder: Number.isFinite(Number(row && row.sortOrder)) ? Number(row.sortOrder) : 999,
    // What the title SHOWS and how it PLAYS stay in code: an added title has
    // neither, so `draw` is null and it is listed but not runnable.
    draw: code ? code.draw : null,
    label: code ? code.label : null,
  };
}

function shapeTitleList(rows) {
  if (!Array.isArray(rows) || !rows.length) return BUILT_IN_TITLES.map(shapeTitleRow);
  return rows.map(shapeTitleRow);
}

// The host calls this once with what GET /api/titles answered. An empty or
// missing list leaves the eight originals in place, so the module is never
// asked to draw from nothing.
export function registerTitles(rows) {
  TITLES = shapeTitleList(rows);
  return TITLES;
}

export function findTitle(id) {
  return TITLES.find((t) => t.id === String(id)) || null;
}

// A title's licence line, printed by the Arcade, the drawer and the Terminal.
export function licenceLine(title) {
  return 'GameWatch ' + title.year + ' | ' + title.genreBox + ' | ' + title.genres.join(' | ');
}

// The tier a score falls in, and the line that names every tier's range. The
// number is always shown next to the tier name on How to Play. Both tolerate a
// row whose tiers did not survive an edit: the lowest tier is the fallback.
export function tierFor(title, score) {
  const tiers = Array.isArray(title && title.tiers) && title.tiers.length
    ? title.tiers : [{ name: 'Rookie', min: 0, max: null }];
  const value = Number(score) || 0;
  let found = tiers[0];
  for (const tier of tiers) {
    if (value >= (Number(tier.min) || 0)) found = tier;
  }
  return found;
}

export function tierLine(title) {
  const tiers = Array.isArray(title && title.tiers) && title.tiers.length
    ? title.tiers : [{ name: 'Rookie', min: 0, max: null }];
  return tiers
    .map((t) => t.name + ' ' + t.min + ' to ' + (t.max == null ? 'and up' : t.max))
    .join(' | ');
}

export function progressLine(title, state) {
  const score = Number(state && state.score) || 0;
  const tier = tierFor(title, score);
  return 'HIGH SCORE ' + score + ' | ' + String(tier.name).toUpperCase();
}

/* ── Shared save shape ────────────────────────────────────────────────────
 * One snapshot shape covers all eight titles: `{ v, highScore, progress,
 * ended }` plus whatever that title needs. `highScore` is the run's score at
 * the moment it was written and `progress` a short line naming where the run
 * had got to, so the Memory Card can list any title's slot without knowing
 * which title it is. Every loader below clamps each field and falls back to a
 * fresh run, so a slot written by an older build still loads.
 */

const MISS_LIMIT = 3;

// The four fields every title's snapshot carries, assembled the same way.
function saveShape(game, state, progress) {
  return {
    v: 1,
    game,
    highScore: clampInt(state.score, 0, 999999, 0),
    progress: typeof progress === 'string' ? progress.slice(0, 120) : '',
    ended: state.ended === 'complete' || state.ended === 'ended' ? state.ended : null,
  };
}

/* ── Western Bar ────────────────────────────────────────────────────────── */

// The taps along the top, left to right, and the orders the shift calls for.
const WESTERN_TAPS = ['LEFT', 'MIDDLE', 'RIGHT'];
const WESTERN_ORDERS = [1, 0, 2, 1, 2, 0, 2, 1, 0, 2, 1, 0, 2, 1];
// The band the pour meter has to be inside to serve a good glass.
const POUR_LO = 40;
const POUR_HI = 62;

export function newWesternBar() {
  return {
    v: 1,
    game: 'western-bar',
    score: 0,
    highScore: 0,
    progress: 'shift not started',
    ended: null,
    message: 'Shift started. Serve the ordered tap inside the band.',
    head: 1,
    order: cycle(WESTERN_ORDERS, 0),
    orderIndex: 0,
    served: 0,
    spills: 0,
    meter: POUR_LO,
    pourDir: 1,
  };
}

export function loadWesternBar(snapshot) {
  const fresh = newWesternBar();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    served: clampInt(snapshot.served, 0, 9999, 0),
    spills: clampInt(snapshot.spills, 0, MISS_LIMIT, 0),
    orderIndex: clampInt(snapshot.orderIndex, 0, 999, 0),
    head: clampInt(snapshot.head, 0, WESTERN_TAPS.length - 1, 1),
    meter: clampNum(snapshot.meter, 0, 100, POUR_LO),
    pourDir: Number(snapshot.pourDir) < 0 ? -1 : 1,
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  state.order = cycle(WESTERN_ORDERS, state.orderIndex);
  return state;
}

function westernSpeed(state) {
  return 105 + state.served * 7;
}

export function stepWesternBar(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  const next = state.meter + state.pourDir * westernSpeed(state) * dt;
  if (next >= 100) { state.meter = 100; state.pourDir = -1; }
  else if (next <= 0) { state.meter = 0; state.pourDir = 1; }
  else state.meter = next;
  return true;
}

export function keyWesternBar(state, action) {
  if (state.ended) return false;
  if (action === 'left') {
    state.head = Math.max(0, state.head - 1);
    state.message = 'Pour head over the ' + WESTERN_TAPS[state.head] + ' tap.';
    return true;
  }
  if (action === 'right') {
    state.head = Math.min(WESTERN_TAPS.length - 1, state.head + 1);
    state.message = 'Pour head over the ' + WESTERN_TAPS[state.head] + ' tap.';
    return true;
  }
  if (action === 'game_b') {
    state.pourDir = -state.pourDir;
    state.message = 'Eased off: the meter is running the other way.';
    return true;
  }
  if (action === 'game_a') {
    const inBand = state.meter >= POUR_LO && state.meter <= POUR_HI;
    const rightTap = state.head === state.order;
    if (inBand && rightTap) {
      state.served += 1;
      state.score = state.served;
      state.orderIndex += 1;
      state.order = cycle(WESTERN_ORDERS, state.orderIndex);
      state.message = 'Good glass. ' + state.served + ' served, next tap is the '
        + WESTERN_TAPS[state.order] + '.';
      return true;
    }
    state.spills += 1;
    if (state.spills >= MISS_LIMIT) {
      return endRun(state, 'ended', 'Shift closed after ' + state.spills + ' spilled glasses. ' + state.served + ' served.');
    }
    state.message = !rightTap
      ? 'Spilled: the order was the ' + WESTERN_TAPS[state.order] + ' tap.'
      : 'Spilled: the pour meter was outside the band.';
    return true;
  }
  return false;
}

export function readoutWesternBar(state) {
  return [
    'ORDERED TAP: ' + WESTERN_TAPS[state.order],
    'POUR HEAD: ' + WESTERN_TAPS[state.head],
    'POUR METER: ' + Math.round(state.meter) + ' | band ' + POUR_LO + ' to ' + POUR_HI,
    'SERVED: ' + state.served + ' | SPILLS: ' + state.spills + ' of ' + MISS_LIMIT,
    progressLine(findTitle('western-bar'), state),
  ];
}

/* ── Battle Field ───────────────────────────────────────────────────────── */

// The track's committed rhythm: a high hurdle to jump or a low bar to duck.
const FIELD_OBSTACLES = ['high', 'high', 'low', 'high', 'low', 'low', 'high', 'low', 'high', 'high', 'low'];

export function newBattleField() {
  return {
    v: 1,
    game: 'battle-field',
    score: 0,
    highScore: 0,
    progress: 'at the start line',
    ended: null,
    message: 'Off the line. Jump the high hurdles and duck the low bars.',
    distance: 0,
    obstacle: cycle(FIELD_OBSTACLES, 0),
    obstacleIndex: 0,
    gapMs: 1700,
    action: 'run',
    actionMs: 0,
    cleared: 0,
    stumbles: 0,
    stridedIndex: -1,
  };
}

export function loadBattleField(snapshot) {
  const fresh = newBattleField();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    distance: clampInt(snapshot.distance, 0, 999999, 0),
    obstacleIndex: clampInt(snapshot.obstacleIndex, 0, 999, 0),
    gapMs: clampNum(snapshot.gapMs, 200, 4000, 1700),
    action: snapshot.action === 'jump' || snapshot.action === 'duck' ? snapshot.action : 'run',
    actionMs: clampNum(snapshot.actionMs, 0, 2000, 0),
    cleared: clampInt(snapshot.cleared, 0, 9999, 0),
    stumbles: clampInt(snapshot.stumbles, 0, MISS_LIMIT, 0),
    stridedIndex: clampInt(snapshot.stridedIndex, -1, 9999, -1),
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  state.obstacle = cycle(FIELD_OBSTACLES, state.obstacleIndex);
  return state;
}

function fieldSpeed(state) {
  return 7 + Math.floor(state.cleared / 10) * 0.8;
}

function fieldNextGap(state) {
  return Math.max(620, 1700 - state.cleared * 22);
}

export function stepBattleField(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  state.distance += fieldSpeed(state) * dt;
  state.score = Math.round(state.distance);
  if (state.actionMs > 0) {
    state.actionMs = Math.max(0, state.actionMs - dtMs);
    if (state.actionMs === 0 && state.action === 'jump') state.action = 'run';
  }
  state.gapMs -= dtMs;
  if (state.gapMs > 0) return true;

  // The obstacle is here: judge what the runner was doing.
  const ok = (state.obstacle === 'high' && state.action === 'jump')
    || (state.obstacle === 'low' && state.action === 'duck');
  if (ok) {
    state.cleared += 1;
    state.message = 'Cleared ' + (state.obstacle === 'high' ? 'the hurdle' : 'the low bar') + '. '
      + state.cleared + ' cleared.';
  } else {
    state.stumbles += 1;
    if (state.stumbles >= MISS_LIMIT) {
      return endRun(state, 'ended', 'Track closed after ' + state.stumbles + ' stumbles at distance ' + Math.round(state.distance) + '.');
    }
    state.message = state.obstacle === 'high'
      ? 'Clipped the hurdle. That is stumble ' + state.stumbles + '.'
      : 'Stood up into the low bar. That is stumble ' + state.stumbles + '.';
  }
  state.obstacleIndex += 1;
  state.obstacle = cycle(FIELD_OBSTACLES, state.obstacleIndex);
  state.gapMs = fieldNextGap(state);
  state.stridedIndex = state.obstacleIndex;
  state.action = 'run';
  state.actionMs = 0;
  return true;
}

export function keyBattleField(state, action) {
  if (state.ended) return false;
  if (action === 'game_a') {
    state.action = 'jump';
    state.actionMs = 420;
    state.message = 'Jumped.';
    return true;
  }
  if (action === 'game_b') {
    state.action = 'duck';
    state.actionMs = 340;
    state.message = 'Ducked.';
    return true;
  }
  if (action === 'left' || action === 'right') {
    if (state.stridedIndex === state.obstacleIndex) {
      state.message = 'Already leaning into this stride. It only closes in once.';
      return true;
    }
    state.stridedIndex = state.obstacleIndex;
    state.gapMs = Math.max(240, state.gapMs - 260);
    state.message = 'Leaning into the stride: the next obstacle is closer.';
    return true;
  }
  return false;
}

export function readoutBattleField(state) {
  return [
    'DISTANCE: ' + Math.round(state.distance) + ' cells',
    'NEXT: ' + (state.obstacle === 'high' ? 'HIGH hurdle (Game A to jump)' : 'LOW bar (Game B to duck)'),
    'ACTION: ' + (state.action === 'run' ? 'running' : state.action + ' for ' + Math.round(state.actionMs) + ' ms'),
    'CLEARED: ' + state.cleared + ' | STUMBLES: ' + state.stumbles + ' of ' + MISS_LIMIT,
    progressLine(findTitle('battle-field'), state),
  ];
}

/* ── Airforce Fighter ───────────────────────────────────────────────────── */

const RIDGE_CELLS = 15;
// The band drifts up and down the ridge face; the drift quickens with time.
const RIDGE_DRIFT = [1.4, 1.9, 2.4, 2.9, 3.4];

export function newAirforceFighter() {
  return {
    v: 1,
    game: 'airforce-fighter',
    score: 0,
    highScore: 0,
    progress: 'on the launch',
    ended: null,
    message: 'Launched. Hold the glider inside the lifting band.',
    altitude: 9,
    glider: 2,
    band: 3,
    bandSize: 4,
    lift: 70,
    aloft: 0,
    driftIndex: 0,
  };
}

export function loadAirforceFighter(snapshot) {
  const fresh = newAirforceFighter();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    altitude: clampInt(snapshot.altitude, 0, RIDGE_CELLS, 9),
    glider: clampInt(snapshot.glider, 0, RIDGE_CELLS - 1, 2),
    band: clampNum(snapshot.band, 0, RIDGE_CELLS - 1, 3),
    bandSize: clampInt(snapshot.bandSize, 2, 6, 4),
    lift: clampNum(snapshot.lift, 0, 100, 70),
    aloft: clampNum(snapshot.aloft, 0, 99999, 0),
    driftIndex: clampInt(snapshot.driftIndex, 0, RIDGE_DRIFT.length - 1, 0),
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  return state;
}

// Is the glider inside the rising band right now?
function inLift(state) {
  return state.glider >= Math.floor(state.band) && state.glider <= Math.floor(state.band) + state.bandSize - 1;
}

export function stepAirforceFighter(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  const drift = RIDGE_DRIFT[state.driftIndex];
  // The band runs up and down the face; it turns around at either end.
  state.band += drift * dt;
  if (state.band >= RIDGE_CELLS - state.bandSize) { state.band = RIDGE_CELLS - state.bandSize; state.driftIndex = Math.min(RIDGE_DRIFT.length - 1, state.driftIndex + (Math.random() < 0.5 ? 1 : 0)); }
  if (state.band <= 0) { state.band = 0; state.driftIndex = Math.min(RIDGE_DRIFT.length - 1, state.driftIndex + (Math.random() < 0.5 ? 1 : 0)); }
  if (inLift(state)) {
    state.lift = Math.min(100, state.lift + 16 * dt);
    state.aloft += dt;
    state.score = Math.floor(state.aloft);
    if (state.lift > 55) state.altitude = Math.min(RIDGE_CELLS, state.altitude + 1.4 * dt);
    state.message = 'In the band: ' + Math.floor(state.aloft) + ' seconds aloft.';
  } else {
    state.lift = Math.max(0, state.lift - 15 * dt);
    state.altitude -= 2.2 * dt;
    state.message = 'Out of the band. Trim along the face to meet it.';
  }
  if (state.altitude <= 0) {
    state.altitude = 0;
    return endRun(state, 'ended', 'Settled onto the ridge after ' + Math.floor(state.aloft) + ' seconds aloft.');
  }
  return true;
}

export function keyAirforceFighter(state, action) {
  if (state.ended) return false;
  if (action === 'game_a') {
    state.altitude = Math.min(RIDGE_CELLS, state.altitude + 2);
    state.lift = Math.max(0, state.lift - 6);
    state.message = 'Pulled up: two cells of height, a little energy spent.';
    return true;
  }
  if (action === 'game_b') {
    state.altitude = Math.max(0, state.altitude - 3);
    state.lift = Math.min(100, state.lift + 5);
    state.message = 'Nosed down: three cells lost, a little energy back.';
    return true;
  }
  if (action === 'left') {
    state.glider = Math.max(0, state.glider - 1);
    state.message = 'Trimmed a cell down the face.';
    return true;
  }
  if (action === 'right') {
    state.glider = Math.min(RIDGE_CELLS - 1, state.glider + 1);
    state.message = 'Trimmed a cell up the face.';
    return true;
  }
  return false;
}

export function readoutAirforceFighter(state) {
  return [
    'ALTITUDE: ' + Math.round(state.altitude) + ' of ' + RIDGE_CELLS + ' cells',
    'GLIDER CELL: ' + state.glider + ' | BAND: ' + Math.floor(state.band) + ' to ' + (Math.floor(state.band) + state.bandSize - 1),
    'IN THE LIFT: ' + (inLift(state) ? 'yes' : 'no'),
    'LIFT: ' + Math.round(state.lift) + ' of 100 | ALOFT: ' + Math.floor(state.aloft) + ' seconds',
    progressLine(findTitle('airforce-fighter'), state),
  ];
}

/* ── Guerrilla Warfare ──────────────────────────────────────────────────── */

const TREK_JUNCTIONS = 10;
// The blazed fork at each junction, in order. Ten junctions, so a completed
// trek is a hundred points.
const TREK_BLAZES = ['left', 'right', 'right', 'left', 'right', 'left', 'left', 'right', 'left', 'right'];

export function newGuerrillaWarfare() {
  return {
    v: 1,
    game: 'guerrilla-warfare',
    score: 0,
    highScore: 0,
    progress: 'at the trailhead',
    ended: null,
    message: 'At the trailhead. Read the signpost, then take the blazed fork.',
    junction: 0,
    blaze: TREK_BLAZES[0],
    phase: 'show',
    phaseMs: 900,
    correct: 0,
    wrong: 0,
    looked: null,
  };
}

export function loadGuerrillaWarfare(snapshot) {
  const fresh = newGuerrillaWarfare();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    junction: clampInt(snapshot.junction, 0, TREK_JUNCTIONS, 0),
    phase: snapshot.phase === 'choose' ? 'choose' : 'show',
    phaseMs: clampNum(snapshot.phaseMs, 0, 5000, 900),
    correct: clampInt(snapshot.correct, 0, TREK_JUNCTIONS, 0),
    wrong: clampInt(snapshot.wrong, 0, MISS_LIMIT, 0),
    looked: snapshot.looked === 'left' || snapshot.looked === 'right' ? snapshot.looked : null,
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'complete' || snapshot.ended === 'ended' ? snapshot.ended : null,
  });
  state.blaze = TREK_BLAZES[Math.min(state.junction, TREK_JUNCTIONS - 1)];
  return state;
}

function trekShowMs(state) {
  return Math.max(280, 900 - state.junction * 60);
}

function trekChooseMs(state) {
  return Math.max(900, 2200 - state.junction * 90);
}

// Move to the next junction, or close the trek. Shared by a right fork, a
// wrong fork and a fork left untaken.
function trekAdvance(state) {
  state.junction += 1;
  state.looked = null;
  if (state.junction >= TREK_JUNCTIONS) {
    return endRun(state, 'complete', 'Trek complete: all ' + TREK_JUNCTIONS + ' junctions walked, ' + state.correct + ' blazed.');
  }
  state.blaze = TREK_BLAZES[state.junction];
  state.phase = 'show';
  state.phaseMs = trekShowMs(state);
  return true;
}

export function stepGuerrillaWarfare(state, dtMs) {
  if (state.ended) return false;
  state.phaseMs = Math.max(0, state.phaseMs - dtMs);
  if (state.phaseMs > 0) return true;
  if (state.phase === 'show') {
    state.phase = 'choose';
    state.phaseMs = trekChooseMs(state);
    state.message = 'The green has closed over the signpost. Take the fork you remember.';
    return true;
  }
  // The choose window ran out with no fork taken: the trail is lost.
  state.wrong += 1;
  if (state.wrong >= MISS_LIMIT) {
    return endRun(state, 'ended', 'Trail lost ' + state.wrong + ' times at junction ' + (state.junction + 1) + '.');
  }
  state.message = 'You stood at the fork until the light went. That is lost trail ' + state.wrong + '.';
  return trekAdvance(state);
}

export function keyGuerrillaWarfare(state, action) {
  if (state.ended) return false;
  if (action === 'left' || action === 'right') {
    state.looked = action;
    state.message = action === 'left' ? 'Looking down the left fork.' : 'Looking down the right fork.';
    return true;
  }
  if (action !== 'game_a' && action !== 'game_b') return false;
  if (state.phase === 'show') {
    state.message = 'Wait for the signpost to come down: the fork is taken from memory, not from the sign.';
    return true;
  }
  const taken = action === 'game_a' ? 'left' : 'right';
  if (taken === state.blaze) {
    state.correct += 1;
    state.score = state.correct * 10;
    state.message = 'That fork was blazed. ' + state.correct + ' of ' + TREK_JUNCTIONS + ' walked.';
    return trekAdvance(state);
  }
  state.wrong += 1;
  if (state.wrong >= MISS_LIMIT) {
    return endRun(state, 'ended', 'Three wrong forks: the trail is lost at junction ' + (state.junction + 1) + '.');
  }
  state.message = 'Wrong fork. That is lost trail ' + state.wrong + ' of ' + MISS_LIMIT + '.';
  return trekAdvance(state);
}

export function readoutGuerrillaWarfare(state) {
  const showing = state.phase === 'show';
  return [
    'JUNCTION: ' + Math.min(state.junction + 1, TREK_JUNCTIONS) + ' of ' + TREK_JUNCTIONS,
    'SIGNPOST: ' + (showing ? 'UP, ' + Math.round(state.phaseMs) + ' ms left' : 'down (the green has closed)'),
    'BLAZE: ' + (showing ? state.blaze : 'hidden, remember it'),
    'WALKED: ' + state.correct + ' | LOST TRAIL: ' + state.wrong + ' of ' + MISS_LIMIT,
    progressLine(findTitle('guerrilla-warfare'), state),
  ];
}

/* ── Submarine Battle ───────────────────────────────────────────────────── */

const WINCH_CELLS = 12;
// The reef line, in winch cells. A hook that reaches it is lost.
const REEF_CELL = 11;
// The shelf the crates sit on, in order, so a dive's crates are reproducible.
const CRATE_DEPTHS = [5, 7, 4, 8, 6, 9, 5, 7];

export function newSubmarineBattle() {
  return {
    v: 1,
    game: 'submarine-battle',
    score: 0,
    highScore: 0,
    progress: 'hook at the surface',
    ended: null,
    message: 'Dive started. Pay the winch out to the crate, clamp it, then haul it up.',
    winch: 0,
    crate: CRATE_DEPTHS[0],
    crateIndex: 0,
    raised: 0,
    lost: 0,
    holdMs: 0,
    phase: 'dive',
    haulMs: 0,
  };
}

export function loadSubmarineBattle(snapshot) {
  const fresh = newSubmarineBattle();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    winch: clampNum(snapshot.winch, 0, WINCH_CELLS, 0),
    crateIndex: clampInt(snapshot.crateIndex, 0, 999, 0),
    crate: clampNum(snapshot.crate, 0, WINCH_CELLS, CRATE_DEPTHS[0]),
    raised: clampInt(snapshot.raised, 0, 9999, 0),
    lost: clampInt(snapshot.lost, 0, MISS_LIMIT, 0),
    holdMs: clampNum(snapshot.holdMs, 0, 3000, 0),
    phase: snapshot.phase === 'haul' ? 'haul' : 'dive',
    haulMs: clampNum(snapshot.haulMs, 0, 3000, 0),
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  state.crate = CRATE_DEPTHS[state.crateIndex % CRATE_DEPTHS.length];
  return state;
}

function nextCrate(state) {
  state.crateIndex += 1;
  state.crate = CRATE_DEPTHS[state.crateIndex % CRATE_DEPTHS.length];
}

export function stepSubmarineBattle(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  if (state.phase === 'haul') {
    state.haulMs -= dtMs;
    state.winch = Math.max(0, state.winch - 10 * dt);
    if (state.haulMs <= 0) {
      state.winch = 0;
      state.raised += 1;
      state.score = state.raised * 10;
      nextCrate(state);
      state.phase = 'dive';
      state.message = 'Crate on deck. ' + state.raised + ' raised. Next crate is on the shelf.';
    }
    return true;
  }
  if (state.holdMs > 0) {
    state.holdMs = Math.max(0, state.holdMs - dtMs);
    return true;
  }
  state.winch += 2 * dt;
  if (state.winch >= REEF_CELL) {
    state.winch = REEF_CELL;
    state.lost += 1;
    if (state.lost >= MISS_LIMIT) {
      return endRun(state, 'ended', 'Three hooks on the reef. The dive is over with ' + state.raised + ' crates raised.');
    }
    state.message = 'The hook reached the reef and was lost. That is ' + state.lost + ' of ' + MISS_LIMIT + '.';
    state.winch = 0;
    nextCrate(state);
    return true;
  }
  return true;
}

export function keySubmarineBattle(state, action) {
  if (state.ended) return false;
  if (state.phase === 'haul') return false;
  if (action === 'down') {
    state.winch = Math.min(WINCH_CELLS, state.winch + 1);
    state.message = 'Paid the winch out one notch.';
    return true;
  }
  if (action === 'up') {
    state.winch = Math.max(0, state.winch - 1);
    state.message = 'Hauled the winch in one notch.';
    return true;
  }
  if (action === 'game_b') {
    state.holdMs = 700;
    state.message = 'Holding the winch: the hook is neither sinking nor rising.';
    return true;
  }
  if (action === 'game_a') {
    const close = Math.abs(state.winch - state.crate) <= 1;
    const above = state.winch <= REEF_CELL - 1;
    if (close && above) {
      state.phase = 'haul';
      state.haulMs = 900;
      state.message = 'Clamped. Hauling the crate to the surface.';
      return true;
    }
    state.lost += 1;
    if (state.lost >= MISS_LIMIT) {
      return endRun(state, 'ended', 'Three empty clamps. The dive is over with ' + state.raised + ' crates raised.');
    }
    state.message = 'The clamp closed on nothing. The crate sits at notch ' + Math.round(state.crate) + '.';
    return true;
  }
  return false;
}

export function readoutSubmarineBattle(state) {
  return [
    'WINCH: ' + Math.round(state.winch) + ' of ' + WINCH_CELLS + ' notches',
    'CRATE ON THE SHELF: notch ' + Math.round(state.crate),
    'REEF LINE: notch ' + REEF_CELL + ' (a hook that reaches it is lost)',
    'WINCH STATE: ' + (state.phase === 'haul' ? 'hauling a crate up' : state.holdMs > 0 ? 'held' : 'paying out'),
    'RAISED: ' + state.raised + ' | HOOKS LOST: ' + state.lost + ' of ' + MISS_LIMIT,
    progressLine(findTitle('submarine-battle'), state),
  ];
}

/* ── Space Attacker ─────────────────────────────────────────────────────── */

const FIELD_LANES = 4;
// The lanes the rocks drift down, in order. The pattern repeats, and the
// spacing between rocks tightens as the crossing goes on.
const ROCK_LANES = [0, 2, 1, 3, 1, 0, 2, 3, 2, 1, 3, 0];

export function newSpaceAttacker() {
  return {
    v: 1,
    game: 'space-attacker',
    score: 0,
    highScore: 0,
    progress: 'at the edge of the field',
    ended: null,
    message: 'Crossing started. Move lanes to let the rocks past.',
    distance: 0,
    lane: 1,
    rockLane: ROCK_LANES[0],
    rockIndex: 0,
    rockAt: 26,
    hulls: MISS_LIMIT,
    burstMs: 0,
    brakeMs: 0,
  };
}

export function loadSpaceAttacker(snapshot) {
  const fresh = newSpaceAttacker();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    distance: clampNum(snapshot.distance, 0, 999999, 0),
    lane: clampInt(snapshot.lane, 0, FIELD_LANES - 1, 1),
    rockIndex: clampInt(snapshot.rockIndex, 0, 999, 0),
    rockAt: clampNum(snapshot.rockAt, 1, 200, 26),
    hulls: clampInt(snapshot.hulls, 0, MISS_LIMIT, MISS_LIMIT),
    burstMs: clampNum(snapshot.burstMs, 0, 5000, 0),
    brakeMs: clampNum(snapshot.brakeMs, 0, 5000, 0),
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  state.rockLane = ROCK_LANES[state.rockIndex % ROCK_LANES.length];
  return state;
}

function rockSpacing(state) {
  return Math.max(11, 26 - Math.floor(state.distance / 100) * 2);
}

export function stepSpaceAttacker(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  if (state.burstMs > 0) state.burstMs = Math.max(0, state.burstMs - dtMs);
  if (state.brakeMs > 0) state.brakeMs = Math.max(0, state.brakeMs - dtMs);
  let speed = 20 + Math.floor(state.distance / 100) * 2;
  if (state.burstMs > 0) speed *= 2;
  if (state.brakeMs > 0) speed *= 0.4;
  const gain = speed * dt;
  state.distance += gain;
  state.score += Math.round(gain * (state.burstMs > 0 ? 2 : 1));
  if (state.distance <= state.rockAt) return true;

  // A rock is level with the ferry now.
  if (state.rockLane === state.lane) {
    state.hulls -= 1;
    if (state.hulls <= 0) {
      return endRun(state, 'ended', 'Hull lost. The crossing ended at distance ' + Math.round(state.distance) + '.');
    }
    state.message = 'A rock came down your lane. Hulls left: ' + state.hulls + '.';
  } else {
    state.message = 'Rock passed in lane ' + (state.rockLane + 1) + '.';
  }
  state.rockIndex += 1;
  state.rockLane = ROCK_LANES[state.rockIndex % ROCK_LANES.length];
  state.rockAt = state.distance + rockSpacing(state);
  return true;
}

export function keySpaceAttacker(state, action) {
  if (state.ended) return false;
  if (action === 'left') {
    state.lane = (state.lane + FIELD_LANES - 1) % FIELD_LANES;
    state.message = 'Ferry in lane ' + (state.lane + 1) + '.';
    return true;
  }
  if (action === 'right') {
    state.lane = (state.lane + 1) % FIELD_LANES;
    state.message = 'Ferry in lane ' + (state.lane + 1) + '.';
    return true;
  }
  if (action === 'game_a') {
    state.burstMs = 1200;
    state.message = 'Burst: the crossing pays double, and the field comes faster.';
    return true;
  }
  if (action === 'game_b') {
    state.brakeMs = 800;
    state.message = 'Braking: the whole field slows for a beat.';
    return true;
  }
  return false;
}

export function readoutSpaceAttacker(state) {
  return [
    'DISTANCE: ' + Math.round(state.distance),
    'FERRY LANE: ' + (state.lane + 1) + ' of ' + FIELD_LANES,
    'ROCK: lane ' + (state.rockLane + 1) + ', ' + Math.max(0, Math.round(state.rockAt - state.distance)) + ' away',
    'BURST: ' + (state.burstMs > 0 ? Math.ceil(state.burstMs) + ' ms left' : 'ready')
      + ' | BRAKE: ' + (state.brakeMs > 0 ? Math.ceil(state.brakeMs) + ' ms left' : 'ready'),
    'HULLS: ' + Math.max(0, state.hulls) + ' of ' + MISS_LIMIT,
    progressLine(findTitle('space-attacker'), state),
  ];
}

/* ── Hungry Dragon ──────────────────────────────────────────────────────── */

const ORCHARD_CHUTES = 3;
// What falls next, in order: fruit to catch, ember to keep away from.
const FALLING = ['fruit', 'ember', 'fruit', 'fruit', 'ember', 'fruit', 'ember', 'fruit', 'fruit', 'ember'];
const FALLING_CHUTES = [0, 2, 1, 2, 0, 1, 2, 0, 1, 0];

export function newHungryDragon() {
  return {
    v: 1,
    game: 'hungry-dragon',
    score: 0,
    highScore: 0,
    progress: 'under the middle chute',
    ended: null,
    message: 'Under the orchard. Catch the fruit and keep clear of the embers.',
    chute: 1,
    mouthMs: 0,
    falling: 'fruit',
    fallingChute: 0,
    fallingIndex: 0,
    fallLs: 0,
    fallMs: 1500,
    caught: 0,
    wasted: 0,
    singes: 0,
    puffMs: 0,
    puffedIndex: -1,
  };
}

export function loadHungryDragon(snapshot) {
  const fresh = newHungryDragon();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    chute: clampInt(snapshot.chute, 0, ORCHARD_CHUTES - 1, 1),
    mouthMs: clampNum(snapshot.mouthMs, 0, 3000, 0),
    fallingIndex: clampInt(snapshot.fallingIndex, 0, 999, 0),
    fallMs: clampNum(snapshot.fallMs, 100, 4000, 1500),
    caught: clampInt(snapshot.caught, 0, 9999, 0),
    wasted: clampInt(snapshot.wasted, 0, MISS_LIMIT, 0),
    singes: clampInt(snapshot.singes, 0, MISS_LIMIT, 0),
    puffMs: clampNum(snapshot.puffMs, 0, 3000, 0),
    puffedIndex: clampInt(snapshot.puffedIndex, -1, 9999, -1),
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  state.falling = FALLING[state.fallingIndex % FALLING.length];
  state.fallingChute = FALLING_CHUTES[state.fallingIndex % FALLING_CHUTES.length];
  return state;
}

function fallSpeed(state) {
  return Math.max(620, 1500 - state.caught * 45);
}

export function stepHungryDragon(state, dtMs) {
  if (state.ended) return false;
  if (state.mouthMs > 0) state.mouthMs = Math.max(0, state.mouthMs - dtMs);
  if (state.puffMs > 0) {
    state.puffMs = Math.max(0, state.puffMs - dtMs);
    return true;
  }
  state.fallMs -= dtMs;
  if (state.fallMs > 0) return true;

  // The falling thing lands.
  const here = state.fallingChute === state.chute;
  if (state.falling === 'fruit') {
    if (here && state.mouthMs > 0) {
      state.caught += 1;
      state.score = state.caught;
      state.message = 'Fruit caught. ' + state.caught + ' eaten.';
    } else {
      state.wasted += 1;
      state.message = 'Fruit landed in a closed mouth. Wasted fruit: ' + state.wasted + ' of ' + MISS_LIMIT + '.';
      if (state.wasted >= MISS_LIMIT) {
        return endRun(state, 'ended', 'Three fruit wasted. The orchard closes with ' + state.caught + ' eaten.');
      }
    }
  } else if (here) {
    state.singes += 1;
    if (state.singes >= MISS_LIMIT) {
      return endRun(state, 'ended', 'Three embers on the dragon. The orchard closes with ' + state.caught + ' eaten.');
    }
    state.message = 'An ember landed on the dragon. Singes: ' + state.singes + ' of ' + MISS_LIMIT + '.';
  } else {
    state.message = 'An ember fell into an empty chute.';
  }
  state.fallingIndex += 1;
  state.falling = FALLING[state.fallingIndex % FALLING.length];
  state.fallingChute = FALLING_CHUTES[state.fallingIndex % FALLING_CHUTES.length];
  state.fallMs = fallSpeed(state);
  return true;
}

export function keyHungryDragon(state, action) {
  if (state.ended) return false;
  if (action === 'left') {
    state.chute = Math.max(0, state.chute - 1);
    state.message = 'Over chute ' + (state.chute + 1) + '.';
    return true;
  }
  if (action === 'right') {
    state.chute = Math.min(ORCHARD_CHUTES - 1, state.chute + 1);
    state.message = 'Over chute ' + (state.chute + 1) + '.';
    return true;
  }
  if (action === 'game_a') {
    state.mouthMs = 500;
    state.message = 'Mouth open.';
    return true;
  }
  if (action === 'game_b') {
    if (state.puffedIndex === state.fallingIndex) {
      state.message = 'Already puffed at this one: it only lifts once.';
      return true;
    }
    state.puffedIndex = state.fallingIndex;
    state.puffMs = 260;
    state.fallMs = Math.min(2600, state.fallMs + 300);
    state.message = 'Puffed: the nearest falling thing is lifted a little way.';
    return true;
  }
  return false;
}

export function readoutHungryDragon(state) {
  return [
    'CHUTE: ' + (state.chute + 1) + ' of ' + ORCHARD_CHUTES,
    'MOUTH: ' + (state.mouthMs > 0 ? 'open' : 'closed'),
    'FALLING INTO CHUTE ' + (state.fallingChute + 1) + ': ' + state.falling
      + ' (' + Math.max(0, Math.round(state.fallMs)) + ' ms)',
    'CAUGHT: ' + state.caught + ' | WASTED: ' + state.wasted + ' | SINGES: ' + state.singes,
    progressLine(findTitle('hungry-dragon'), state),
  ];
}

/* ── SL Bankman ─────────────────────────────────────────────────────────── */

// The three trays, left to right, and the denomination each one takes.
const BANK_TRAYS = ['1', '2', '5'];
// The coins on the rail, in order.
const BANK_COINS = ['2', '1', '5', '1', '2', '5', '5', '1', '2', '1', '5', '2'];
// The drop window, as a share of the rail: a coin outside it cannot be
// dropped onto a tray.
const WINDOW_LO = 26;
const WINDOW_HI = 74;

export function newSlBankman() {
  return {
    v: 1,
    game: 'sl-bankman',
    score: 0,
    highScore: 0,
    progress: 'first coin on the rail',
    ended: null,
    message: 'Shift started. Read the coin, then drop it in the tray that takes it.',
    head: 1,
    coin: cycle(BANK_COINS, 0),
    coinIndex: 0,
    rail: 0,
    sorted: 0,
    misses: 0,
    setAside: 1,
    coinsSeen: 0,
  };
}

export function loadSlBankman(snapshot) {
  const fresh = newSlBankman();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    score: clampInt(snapshot.score != null ? snapshot.score : snapshot.highScore, 0, 999999, 0),
    highScore: clampInt(snapshot.highScore, 0, 999999, 0),
    head: clampInt(snapshot.head, 0, BANK_TRAYS.length - 1, 1),
    coinIndex: clampInt(snapshot.coinIndex, 0, 999, 0),
    rail: clampNum(snapshot.rail, 0, 100, 0),
    sorted: clampInt(snapshot.sorted, 0, 9999, 0),
    misses: clampInt(snapshot.misses, 0, MISS_LIMIT, 0),
    setAside: clampInt(snapshot.setAside, 0, 3, 1),
    coinsSeen: clampInt(snapshot.coinsSeen, 0, 9999, 0),
    message: typeof snapshot.message === 'string' ? snapshot.message.slice(0, 200) : fresh.message,
    ended: snapshot.ended === 'ended' ? 'ended' : null,
  });
  state.coin = cycle(BANK_COINS, state.coinIndex);
  return state;
}

function railSpeed(state) {
  return 26 + Math.floor(state.sorted / 5) * 3;
}

export function stepSlBankman(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  state.rail += railSpeed(state) * dt;
  if (state.rail < 100) return true;
  // The coin reached the end of the rail without being sorted.
  state.misses += 1;
  if (state.misses >= MISS_LIMIT) {
    return endRun(state, 'ended', 'Three coins off the end of the rail. The shift closed with ' + state.sorted + ' counted.');
  }
  state.message = 'The coin left the rail unsorted. Misses: ' + state.misses + ' of ' + MISS_LIMIT + '.';
  return bankNextCoin(state);
}

function bankNextCoin(state) {
  state.coinIndex += 1;
  state.coinsSeen += 1;
  state.coin = cycle(BANK_COINS, state.coinIndex);
  state.rail = 0;
  if (state.coinsSeen % 4 === 0) state.setAside = Math.min(3, state.setAside + 1);
  return true;
}

export function keySlBankman(state, action) {
  if (state.ended) return false;
  if (action === 'left') {
    state.head = Math.max(0, state.head - 1);
    state.message = 'Drop head over the tray that takes ' + BANK_TRAYS[state.head] + '.';
    return true;
  }
  if (action === 'right') {
    state.head = Math.min(BANK_TRAYS.length - 1, state.head + 1);
    state.message = 'Drop head over the tray that takes ' + BANK_TRAYS[state.head] + '.';
    return true;
  }
  if (action === 'game_b') {
    if (state.setAside <= 0) {
      state.message = 'No set-asides left. A few more coins and one comes back.';
      return true;
    }
    state.setAside -= 1;
    state.message = 'Coin set aside. Set asides left: ' + state.setAside + '.';
    return bankNextCoin(state);
  }
  if (action === 'game_a') {
    if (state.rail < WINDOW_LO || state.rail > WINDOW_HI) {
      state.misses += 1;
      if (state.misses >= MISS_LIMIT) {
        return endRun(state, 'ended', 'Three misses. The shift closed with ' + state.sorted + ' counted.');
      }
      state.message = 'The drop window was not open. Misses: ' + state.misses + ' of ' + MISS_LIMIT + '.';
      return bankNextCoin(state);
    }
    if (BANK_TRAYS[state.head] === state.coin) {
      state.sorted += 1;
      state.score = state.sorted;
      state.message = 'Counted. ' + state.sorted + ' coins sorted.';
      return bankNextCoin(state);
    }
    state.misses += 1;
    if (state.misses >= MISS_LIMIT) {
      return endRun(state, 'ended', 'Three misses. The shift closed with ' + state.sorted + ' counted.');
    }
    state.message = 'Wrong tray: the coin was a ' + state.coin + '. Misses: ' + state.misses + ' of ' + MISS_LIMIT + '.';
    return bankNextCoin(state);
  }
  return false;
}

export function readoutSlBankman(state) {
  const inWindow = state.rail >= WINDOW_LO && state.rail <= WINDOW_HI;
  return [
    'COIN ON THE RAIL: ' + state.coin + (inWindow ? ' (in the drop window)' : ' (not yet in the window)'),
    'RAIL: ' + Math.round(state.rail) + ' | window ' + WINDOW_LO + ' to ' + WINDOW_HI,
    'DROP HEAD: tray that takes ' + BANK_TRAYS[state.head],
    'SORTED: ' + state.sorted + ' | MISSES: ' + state.misses + ' of ' + MISS_LIMIT
      + ' | SET ASIDES: ' + state.setAside,
    progressLine(findTitle('sl-bankman'), state),
  ];
}

/* ── The registers a title is chosen from ───────────────────────────────── */

// One entry per title, so the Arcade, the drawer and the host all reach a
// title the same way: by id only. A title's WORDS come from its row (see
// registerTitles above); its code lives here.
export const RUNNERS = {
  'western-bar': {
    newRun: newWesternBar, load: loadWesternBar, step: stepWesternBar,
    key: keyWesternBar, readout: readoutWesternBar, save: (s) => saveShape('western-bar', s, 'shift at ' + s.served + ' served'),
    draw: drawWesternBar, label: (s) => 'Shift, ' + s.score + ' served',
  },
  'battle-field': {
    newRun: newBattleField, load: loadBattleField, step: stepBattleField,
    key: keyBattleField, readout: readoutBattleField, save: (s) => saveShape('battle-field', s, 'track at distance ' + Math.round(s.distance)),
    draw: drawBattleField, label: (s) => 'Track, distance ' + s.score,
  },
  'airforce-fighter': {
    newRun: newAirforceFighter, load: loadAirforceFighter, step: stepAirforceFighter,
    key: keyAirforceFighter, readout: readoutAirforceFighter, save: (s) => saveShape('airforce-fighter', s, 'flight of ' + Math.floor(s.aloft) + ' seconds'),
    draw: drawAirforceFighter, label: (s) => 'Flight, ' + s.score + ' seconds aloft',
  },
  'guerrilla-warfare': {
    newRun: newGuerrillaWarfare, load: loadGuerrillaWarfare, step: stepGuerrillaWarfare,
    key: keyGuerrillaWarfare, readout: readoutGuerrillaWarfare, save: (s) => saveShape('guerrilla-warfare', s, 'junction ' + (s.junction + 1) + ' of ' + TREK_JUNCTIONS),
    draw: drawGuerrillaWarfare, label: (s) => 'Trek, ' + s.score + ' junctions walked',
  },
  'submarine-battle': {
    newRun: newSubmarineBattle, load: loadSubmarineBattle, step: stepSubmarineBattle,
    key: keySubmarineBattle, readout: readoutSubmarineBattle, save: (s) => saveShape('submarine-battle', s, 'winch at notch ' + Math.round(s.winch)),
    draw: drawSubmarineBattle, label: (s) => 'Dive, ' + s.score + ' crates raised',
  },
  'space-attacker': {
    newRun: newSpaceAttacker, load: loadSpaceAttacker, step: stepSpaceAttacker,
    key: keySpaceAttacker, readout: readoutSpaceAttacker, save: (s) => saveShape('space-attacker', s, 'crossing at distance ' + Math.round(s.distance)),
    draw: drawSpaceAttacker, label: (s) => 'Crossing, distance ' + s.score,
  },
  'hungry-dragon': {
    newRun: newHungryDragon, load: loadHungryDragon, step: stepHungryDragon,
    key: keyHungryDragon, readout: readoutHungryDragon, save: (s) => saveShape('hungry-dragon', s, 'orchard at ' + s.caught + ' fruit caught'),
    draw: drawHungryDragon, label: (s) => 'Orchard, ' + s.score + ' fruit caught',
  },
  'sl-bankman': {
    newRun: newSlBankman, load: loadSlBankman, step: stepSlBankman,
    key: keySlBankman, readout: readoutSlBankman, save: (s) => saveShape('sl-bankman', s, 'rail at ' + Math.round(s.rail)),
    draw: drawSlBankman, label: (s) => 'Shift, ' + s.score + ' coins counted',
  },
};

// The code a title's row pairs with, by id. `shapeTitleRow` reads it, so a
// row whose id has no entry here is still a title in the Arcade; it simply has
// no panel and cannot be run.
const CODE = CodeById(RUNNERS);

// With the register in hand, the eight originals become the starting rows.
TITLES = BUILT_IN_TITLES.map(shapeTitleRow);

function CodeById(runners) {
  const map = new Map();
  for (const [id, entry] of Object.entries(runners)) {
    for (const fn of [entry.newRun, entry.load, entry.step, entry.key, entry.readout, entry.save, entry.draw, entry.label]) {
      if (typeof fn !== 'function') throw new Error('title ' + id + ' is half-registered');
    }
    map.set(id, entry);
  }
  return map;
}

// Everything a title is, by id: its metadata (from the loaded rows) and its
// six functions (from RUNNERS). Every caller goes through this one register,
// so nothing reaches a title except by id.
export function runnerFor(id) {
  const title = findTitle(id);
  const entry = RUNNERS[String(id)];
  if (!title || !entry) return null;
  return {
    title,
    newRun: entry.newRun,
    load: entry.load,
    step: entry.step,
    key: entry.key,
    readout: entry.readout,
    save: entry.save,
    draw: entry.draw,
    label: entry.label,
  };
}

// A fresh run for a title, by id, or null for an unknown id.
export function newRunFor(id) {
  const runner = runnerFor(id);
  return runner ? runner.newRun() : null;
}

/* ── Drawing: the panel's shared furniture and the eight fields ───────────
 * Every title paints the same five bands: the printed strip, the field, and
 * a score strip at the bottom, so the eight titles line up with each other
 * and a screenshot of two builds stays comparable.
 */

const FIELD_TOP = 30;
const FIELD_BOTTOM = 168;

// The printed strip at the top and the score strip at the bottom.
function chrome(picture, title, rightText, score) {
  const ctx = picture.bctx;
  frame(ctx, { label: title.title.toUpperCase(), right: rightText });
  printed(ctx, 'SCORE', 8, VIDEO_H - 22, { size: 8 });
  segmentNumber(ctx, score, VIDEO_W - 8 - 52, VIDEO_H - 26, { width: 10, height: 18, spacing: 3 }, 4);
}

/* ── Western Bar ────────────────────────────────────────────────────────── */

export function drawWesternBar(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('western-bar');
  chrome(picture, title, state.spills + '/' + MISS_LIMIT + ' SPILLS', state.served);

  // The three taps along the top of the field, with the ordered one lit.
  const tapW = 54;
  const tapH = 26;
  const tapY = FIELD_TOP + 6;
  for (let i = 0; i < WESTERN_TAPS.length; i += 1) {
    const x = 70 + i * (tapW + 20);
    ctx.fillStyle = i === state.order ? LCD_INK : LCD_GHOST;
    ctx.fillRect(x, tapY, tapW, tapH);
    printed(ctx, WESTERN_TAPS[i], x + tapW / 2, tapY + tapH + 3, { size: 8, align: 'center' });
    // The pour head marker sits under the tap it is over.
    if (i === state.head) {
      ctx.fillStyle = LCD_INK;
      ctx.fillRect(x + tapW / 2 - 5, tapY - 8, 10, 6);
    }
  }
  printed(ctx, state.head === state.order ? 'POUR HEAD ON THE ORDERED TAP' : 'MOVE THE POUR HEAD TO THE LIT TAP',
    VIDEO_W / 2, tapY + tapH + 16, { size: 8, align: 'center' });

  // The pour meter: a column of cells, with the good band marked beside it.
  const meterX = 22;
  const meterTop = FIELD_TOP + 48;
  const cells = 12;
  const cellH = 6;
  const gap = 2;
  const columnH = cells * (cellH + gap) - gap;
  const filled = Math.round((state.meter / 100) * cells);
  for (let i = 0; i < cells; i += 1) {
    const y = meterTop + columnH - (i + 1) * (cellH + gap) + gap;
    ctx.fillStyle = i < filled ? LCD_INK : LCD_GHOST;
    ctx.fillRect(meterX, y, 44, cellH);
  }
  const bandCell = (v) => meterTop + columnH - (v / 100) * columnH;
  ctx.fillStyle = LCD_WARN;
  ctx.fillRect(meterX + 48, Math.round(bandCell(POUR_HI)), 12, 1);
  ctx.fillRect(meterX + 48, Math.round(bandCell(POUR_LO)), 12, 1);
  printed(ctx, 'BAND', meterX + 62, Math.round(bandCell(POUR_HI)) - 2, { size: 8 });
  printed(ctx, 'POUR', meterX, meterTop - 12, { size: 8 });
  lit(ctx, inBandNow(state) ? 'IN BAND' : 'OUT OF BAND', meterX + 48, Math.round(bandCell((POUR_LO + POUR_HI) / 2)) + 4,
    { size: 8 });
}

function inBandNow(state) {
  return state.meter >= POUR_LO && state.meter <= POUR_HI;
}

/* ── Battle Field ───────────────────────────────────────────────────────── */

export function drawBattleField(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('battle-field');
  chrome(picture, title, state.stumbles + '/' + MISS_LIMIT + ' STUMBLES', state.score);

  const groundY = FIELD_BOTTOM - 14;
  ctx.fillStyle = LCD_PALE;
  ctx.fillRect(20, groundY, VIDEO_W - 40, 1);

  // The runner: a body and a head, raised by a jump and squashed by a duck.
  const lifted = state.action === 'jump' ? 14 : 0;
  const bodyH = state.action === 'duck' ? 8 : 16;
  const bodyY = groundY - bodyH - lifted;
  ctx.fillStyle = LCD_INK;
  ctx.fillRect(44, bodyY, 8, bodyH);
  if (state.action !== 'duck') ctx.fillRect(44, bodyY - 8, 8, 7);
  printed(ctx, state.action === 'run' ? 'RUNNING' : state.action.toUpperCase(), 40, groundY + 6, { size: 8 });

  // The obstacle coming down the track, drawn tall for a hurdle and wide and
  // low for a bar.
  const total = Math.max(240, state.gapMs);
  const fraction = Math.max(0, Math.min(1, state.gapMs / 1700));
  const obstacleX = 60 + (1 - fraction) * 220;
  if (state.obstacle === 'high') {
    ctx.fillStyle = LCD_INK;
    ctx.fillRect(Math.round(obstacleX), groundY - 30, 6, 30);
    ctx.fillRect(Math.round(obstacleX) - 6, groundY - 32, 18, 4);
  } else {
    ctx.fillStyle = LCD_INK;
    ctx.fillRect(Math.round(obstacleX) - 10, groundY - 8, 28, 8);
    ctx.fillRect(Math.round(obstacleX) - 10, groundY - 12, 28, 2);
  }
  printed(ctx, state.obstacle === 'high' ? 'HIGH HURDLE: GAME A' : 'LOW BAR: GAME B',
    VIDEO_W / 2, FIELD_TOP + 4, { size: 8, align: 'center' });

  // The rhythm: a bar along the bottom that fills as the obstacle arrives, so
  // the timing is readable at a glance.
  cellBar(ctx, 40, groundY + 22, 24, Math.round((1 - Math.min(1, state.gapMs / total)) * 24),
    { cellWidth: 8, height: 6, colour: LCD_INK });
  printed(ctx, 'APPROACH', 40, groundY + 32, { size: 8 });
}

/* ── Airforce Fighter ───────────────────────────────────────────────────── */

export function drawAirforceFighter(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('airforce-fighter');
  chrome(picture, title, state.score + ' S ALOFT', state.score);

  const cellH = 8;
  const gap = 2;
  const top = FIELD_TOP + 4;

  // The altitude column on the left.
  for (let i = 0; i < RIDGE_CELLS; i += 1) {
    const y = FIELD_BOTTOM - 14 - (i + 1) * (cellH + gap) + gap;
    const on = i < Math.round(state.altitude);
    ctx.fillStyle = on ? LCD_INK : LCD_GHOST;
    ctx.fillRect(26, y, 26, cellH);
  }
  printed(ctx, 'ALTITUDE', 26, FIELD_TOP - 2, { size: 8 });

  // The ridge face with the lifting band running along it.
  const faceX = 90;
  const bandLo = Math.floor(state.band);
  const bandHi = bandLo + state.bandSize - 1;
  for (let i = 0; i < RIDGE_CELLS; i += 1) {
    const y = FIELD_BOTTOM - 14 - (i + 1) * (cellH + gap) + gap;
    const inBand = i >= bandLo && i <= bandHi;
    ctx.fillStyle = inBand ? LCD_DIM : LCD_GHOST;
    ctx.fillRect(faceX, y, 60, cellH);
    if (i === state.glider) {
      ctx.fillStyle = LCD_INK;
      ctx.fillRect(faceX + 60 + 6, y, 22, cellH);
      ctx.fillRect(faceX + 60 + 2, y + 2, 4, cellH - 4);
    }
    // The ridge outline: a printed slope to the right of the face.
    ctx.fillStyle = LCD_GHOST;
    ctx.fillRect(faceX + 100 + i, y, 2 + (RIDGE_CELLS - i), cellH - 2);
  }
  printed(ctx, 'LIFTING BAND', faceX, FIELD_TOP - 2, { size: 8 });
  lit(ctx, inLift(state) ? 'IN THE LIFT' : 'OUT OF THE LIFT', faceX + 60 + 6, FIELD_TOP - 2, { size: 8 });

  // The lift gauge along the bottom.
  cellBar(ctx, 90, FIELD_BOTTOM - 8, 16, Math.round((state.lift / 100) * 16), { cellWidth: 8, height: 6 });
  printed(ctx, 'LIFT', 90, FIELD_BOTTOM + 2, { size: 8 });
}

/* ── Guerrilla Warfare ──────────────────────────────────────────────────── */

export function drawGuerrillaWarfare(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('guerrilla-warfare');
  chrome(picture, title, state.wrong + '/' + MISS_LIMIT + ' LOST', state.correct * 10);

  // The green: printed foliage over the whole field, so the trail reads as
  // dense cover rather than a drawn scene.
  ctx.fillStyle = 'rgba(34, 48, 31, 0.10)';
  for (let y = FIELD_TOP + 2; y < FIELD_BOTTOM - 6; y += 6) {
    for (let x = 24 + ((y / 6) % 2) * 4; x < VIDEO_W - 24; x += 12) {
      ctx.fillRect(x, y, 6, 2);
    }
  }

  // The two forks.
  const forks = [
    { key: 'left', x: 74, label: 'LEFT' },
    { key: 'right', x: 186, label: 'RIGHT' },
  ];
  for (const fork of forks) {
    ctx.fillStyle = LCD_GHOST;
    ctx.fillRect(fork.x, FIELD_TOP + 24, 60, FIELD_BOTTOM - FIELD_TOP - 44);
    ctx.fillStyle = LCD_PALE;
    ctx.fillRect(fork.x + 28, FIELD_TOP + 24, 2, FIELD_BOTTOM - FIELD_TOP - 44);
    printed(ctx, fork.label, fork.x + 30, FIELD_TOP + 8, { size: 8, align: 'center' });
    // The blaze, while the signpost is up.
    if (state.phase === 'show' && state.blaze === fork.key) {
      ctx.fillStyle = LCD_INK;
      ctx.fillRect(fork.x + 12, FIELD_TOP + 40, 12, 4);
      ctx.fillRect(fork.x + 12, FIELD_TOP + 46, 20, 4);
      ctx.fillRect(fork.x + 12, FIELD_TOP + 52, 12, 4);
    }
    // Looking down a fork: a lit mark beside it.
    if (state.looked === fork.key) {
      ctx.fillStyle = LCD_WARN;
      ctx.fillRect(fork.x - 10, FIELD_TOP + 46, 6, 6);
    }
  }

  // The signpost itself, printed on the glass above the forks.
  const sign = state.phase === 'show' ? 'SIGNPOST UP: THE BLAZE IS MARKED' : 'SIGNPOST DOWN: REMEMBER THE BLAZE';
  lit(ctx, sign, VIDEO_W / 2, FIELD_TOP + 2, { size: 8, align: 'center' });
  printed(ctx, 'JUNCTION ' + Math.min(state.junction + 1, TREK_JUNCTIONS) + ' OF ' + TREK_JUNCTIONS,
    VIDEO_W / 2, FIELD_BOTTOM - 4, { size: 8, align: 'center' });
}

/* ── Submarine Battle ───────────────────────────────────────────────────── */

export function drawSubmarineBattle(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('submarine-battle');
  chrome(picture, title, state.lost + '/' + MISS_LIMIT + ' HOOKS LOST', state.raised * 10);

  const cellH = 9;
  const gap = 2;
  const top = FIELD_TOP + 2;
  const winchX = 210;
  const cellY = (i) => top + i * (cellH + gap);

  // The water: a printed surface line at the top and the shelf at the bottom.
  ctx.fillStyle = LCD_GHOST;
  ctx.fillRect(30, top, 160, 2);
  printed(ctx, 'SURFACE', 30, top - 10, { size: 8 });
  ctx.fillStyle = LCD_PALE;
  ctx.fillRect(30, cellY(REEF_CELL), 160, 3);
  printed(ctx, 'SEABED SHELF', 30, cellY(REEF_CELL) - 10, { size: 8 });

  // The winch column.
  for (let i = 0; i < WINCH_CELLS; i += 1) {
    ctx.fillStyle = i === REEF_CELL ? LCD_WARN : LCD_GHOST;
    ctx.fillRect(winchX, cellY(i), 44, cellH);
  }
  printed(ctx, 'WINCH', winchX, top - 10, { size: 8 });

  // The crate on the shelf.
  if (state.phase === 'dive') {
    const row = Math.round(state.crate);
    ctx.fillStyle = LCD_INK;
    ctx.fillRect(winchX + 8, cellY(row), 28, cellH);
    lit(ctx, 'CRATE', winchX + 8, cellY(row) - 10, { size: 8 });
  }

  // The hook, paid out along the winch row.
  const hookRow = Math.max(0, Math.min(WINCH_CELLS, Math.round(state.winch)));
  const hookY = hookRow >= WINCH_CELLS ? cellY(WINCH_CELLS - 1) : cellY(hookRow);
  ctx.fillStyle = LCD_INK;
  ctx.fillRect(30 + Math.max(0, Math.min(150, (hookRow / WINCH_CELLS) * 150)), hookY + 2, 14, 5);
  printed(ctx, state.phase === 'haul' ? 'HAULING' : state.holdMs > 0 ? 'HELD' : 'PAYING OUT', 30, FIELD_BOTTOM - 6, { size: 8 });
  lit(ctx, 'NOTCH ' + hookRow + ' OF ' + WINCH_CELLS, 190, FIELD_BOTTOM - 6, { size: 8 });
}

/* ── Space Attacker ─────────────────────────────────────────────────────── */

export function drawSpaceAttacker(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('space-attacker');
  chrome(picture, title, state.hulls + '/' + MISS_LIMIT + ' HULLS', state.score);

  const laneW = 46;
  const laneGap = 16;
  const laneX = (i) => 40 + i * (laneW + laneGap);
  const laneTop = FIELD_TOP + 4;
  const laneBottom = FIELD_BOTTOM - 16;

  for (let i = 0; i < FIELD_LANES; i += 1) {
    ctx.fillStyle = 'rgba(34, 48, 31, 0.08)';
    ctx.fillRect(laneX(i), laneTop, laneW, laneBottom - laneTop);
    printed(ctx, String(i + 1), laneX(i) + laneW / 2, laneBottom + 4, { size: 8, align: 'center' });
  }

  // The rock drifting down its lane.
  const remaining = Math.max(0, state.rockAt - state.distance);
  const range = 26;
  const down = Math.max(0, Math.min(1, 1 - remaining / range));
  const rockY = laneTop + down * (laneBottom - laneTop - 14);
  ctx.fillStyle = LCD_INK;
  ctx.fillRect(laneX(state.rockLane) + 10, Math.round(rockY), 26, 12);
  ctx.fillRect(laneX(state.rockLane) + 16, Math.round(rockY) - 4, 14, 4);

  // The ferry in its own lane.
  const ferryX = laneX(state.lane) + laneW / 2;
  ctx.fillStyle = LCD_INK;
  ctx.fillRect(ferryX - 12, laneBottom - 12, 24, 8);
  ctx.fillRect(ferryX - 4, laneBottom - 18, 8, 6);
  printed(ctx, 'FERRY', ferryX, laneBottom + 4, { size: 8, align: 'center' });

  // The burst and brake lamps, as the panel's own lamps.
  ctx.fillStyle = state.burstMs > 0 ? LCD_WARN : LCD_GHOST;
  ctx.fillRect(laneX(0), laneTop + 4, 20, 8);
  printed(ctx, 'BURST', laneX(0), laneTop + 14, { size: 8 });
  ctx.fillStyle = state.brakeMs > 0 ? LCD_WARN : LCD_GHOST;
  ctx.fillRect(laneX(3) + 16, laneTop + 4, 20, 8);
  printed(ctx, 'BRAKE', laneX(3) + 6, laneTop + 14, { size: 8 });
}

/* ── Hungry Dragon ──────────────────────────────────────────────────────── */

export function drawHungryDragon(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('hungry-dragon');
  chrome(picture, title, state.singes + ' SINGES ' + state.wasted + ' WASTED', state.score);

  const chuteW = 50;
  const chuteGap = 20;
  const chuteX = (i) => 44 + i * (chuteW + chuteGap);
  const chuteTop = FIELD_TOP + 4;
  const chuteBottom = FIELD_BOTTOM - 22;

  for (let i = 0; i < ORCHARD_CHUTES; i += 1) {
    ctx.fillStyle = 'rgba(34, 48, 31, 0.08)';
    ctx.fillRect(chuteX(i), chuteTop, chuteW, chuteBottom - chuteTop);
    printed(ctx, String(i + 1), chuteX(i) + chuteW / 2, chuteBottom + 4, { size: 8, align: 'center' });
  }

  // What is falling, this moment: round for fruit, jagged for an ember.
  const fallTotal = Math.max(200, fallSpeed(state));
  const down = Math.max(0, Math.min(1, 1 - state.fallMs / fallTotal));
  const fallY = chuteTop + 6 + down * (chuteBottom - chuteTop - 30);
  const fx = chuteX(state.fallingChute) + chuteW / 2;
  ctx.fillStyle = LCD_INK;
  if (state.falling === 'fruit') {
    ctx.fillRect(fx - 10, Math.round(fallY), 20, 12);
    ctx.fillRect(fx - 4, Math.round(fallY) - 4, 8, 4);
  } else {
    ctx.fillRect(fx - 10, Math.round(fallY), 20, 5);
    ctx.fillRect(fx - 6, Math.round(fallY) + 5, 12, 4);
    ctx.fillStyle = LCD_WARN;
    ctx.fillRect(fx - 10, Math.round(fallY), 20, 2);
  }
  printed(ctx, state.falling === 'fruit' ? 'FRUIT' : 'EMBER', fx, Math.round(fallY) - 14, { size: 8, align: 'center' });

  // The dragon: a body, a head over the lit chute, and the mouth cell.
  const dx = chuteX(state.chute) + chuteW / 2;
  const groundY = chuteBottom - 2;
  ctx.fillStyle = LCD_INK;
  ctx.fillRect(dx - 20, groundY - 10, 40, 10);
  ctx.fillRect(dx - 10, groundY - 20, 20, 10);
  ctx.fillRect(dx + 8, groundY - 26, 10, 8);
  ctx.fillStyle = state.mouthMs > 0 ? LCD_INK : LCD_GHOST;
  ctx.fillRect(dx + 4, groundY - 18, 8, 5);
  printed(ctx, state.mouthMs > 0 ? 'MOUTH OPEN' : 'MOUTH CLOSED', dx, groundY + 4, { size: 8, align: 'center' });
}

/* ── SL Bankman ─────────────────────────────────────────────────────────── */

export function drawSlBankman(picture, state) {
  const ctx = beginPanel(picture);
  const title = findTitle('sl-bankman');
  chrome(picture, title, state.misses + '/' + MISS_LIMIT + ' MISSES', state.sorted);

  // The rail, with the drop window marked along it.
  const railX = 30;
  const railW = 260;
  const railY = FIELD_TOP + 40;
  ctx.fillStyle = LCD_PALE;
  ctx.fillRect(railX, railY, railW, 2);
  const atRail = (v) => railX + (v / 100) * railW;
  ctx.fillStyle = LCD_WARN;
  ctx.fillRect(Math.round(atRail(WINDOW_LO)), railY - 6, 1, 14);
  ctx.fillRect(Math.round(atRail(WINDOW_HI)), railY - 6, 1, 14);
  printed(ctx, 'DROP WINDOW', atRail(WINDOW_LO), railY - 18, { size: 8 });
  printed(ctx, 'RAIL', railX, railY - 18, { size: 8 });

  // The coin riding the rail: its denomination is the panel's own digit.
  const coinX = Math.round(atRail(Math.max(0, Math.min(100, state.rail))));
  ctx.fillStyle = LCD_INK;
  ctx.fillRect(coinX - 10, railY - 12, 20, 22);
  segmentChar(picture.bctx, state.coin, coinX - 5, railY - 8, { width: 10, height: 14, thickness: 2 }, LCD_GROUND);
  lit(ctx, state.rail >= WINDOW_LO && state.rail <= WINDOW_HI ? 'IN THE WINDOW' : 'NOT YET',
    coinX, railY + 14, { size: 8, align: 'center' });

  // The three trays.
  const trayY = railY + 40;
  for (let i = 0; i < BANK_TRAYS.length; i += 1) {
    const x = 44 + i * 90;
    ctx.fillStyle = i === state.head ? LCD_DIM : LCD_GHOST;
    ctx.fillRect(x, trayY, 70, 26);
    printed(ctx, 'TAKES ' + BANK_TRAYS[i], x + 35, trayY + 30, { size: 8, align: 'center' });
    if (i === state.head) {
      ctx.fillStyle = LCD_INK;
      ctx.fillRect(x + 32, trayY - 8, 6, 6);
    }
  }
  lit(ctx, 'DROP HEAD OVER TRAY ' + (state.head + 1), VIDEO_W / 2, trayY + 44, { size: 8, align: 'center' });
  printed(ctx, 'SET ASIDES: ' + state.setAside, 44, FIELD_BOTTOM - 6, { size: 8 });
}
