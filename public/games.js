// RetroRig's built-in games.
//
// Two original titles, both drawn on the canvas and both keeping their whole
// state in a plain object so a save slot can serialize it and a test can
// drive it with no DOM at all.
//
// Content note: neither game has any violence, weaponry or gambling. Conflict
// in Deepwatch is sonar and depth, not fire; Mandate of Seasons is seasons,
// harvests and loyalty, not battles.
//
// Names are original to this app. They are deliberately not the names, art or
// scenarios of any commercial title.

import { VIDEO_W, VIDEO_H } from './crt.js';

export const DEEPWATCH_ID = 'deepwatch';
export const MANDATE_ID = 'mandate';

// A stable id for one game's save slot. The Memory Card stores one row per
// (user, game, slot), so this names the game half of that key.
export const BUILT_IN = [
  {
    id: DEEPWATCH_ID,
    title: 'Deepwatch: Trench Patrol',
    year: 1996,
    genre: 'Tactical submarine simulator',
    tagline: 'Read the water, place the towed array, hold the lane.',
    summary:
      'A peacetime hydrography patrol. You take a survey boat down a charted trench, '
      + 'reading sonar contacts, choosing your depth, and working out where each contact is '
      + 'going before the lane closes behind you. Nothing here shoots; the whole job is '
      + 'listening and positioning.',
    controls: [
      { keys: 'Arrow keys', action: 'Turn left or right, and change your heading' },
      { keys: 'W and S', action: 'Come up or go down, one band of depth at a time' },
      { keys: 'Space', action: 'Drop the towed array to take a careful sonar fix' },
      { keys: 'Enter', action: 'Log the contact as charted and move to the next' },
    ],
    howTo: [
      {
        heading: 'What you are doing',
        lines: [
          'You are the survey officer on Deepwatch, a hydrography boat working a charted trench.',
          'Five contacts are logged for the patrol. You do not chase anything and nothing chases you:',
          'the job is to work out where each contact is, and to log it before you run out of quiet.',
        ],
      },
      {
        heading: 'The console',
        lines: [
          'HEADING is the direction your boat points, in compass degrees.',
          'DEPTH is the band your hull is sitting in: SURFACE, SHALLOW, MID or DEEP.',
          'SONAR FIX is how sure the array is: WEAK, FAIR or SOLID.',
          'QUIET is the patrol budget. Taking a careful fix, or running your machinery hard, uses it up.',
        ],
      },
      {
        heading: 'How a contact works',
        lines: [
          'A contact shows as a bearing line and a range ring on the plot.',
          'Turn toward a contact and close the range to bring the fix up from WEAK to FAIR to SOLID.',
          'Your depth band matters: a boat sitting in the same band as the contact reads it far better.',
          'When the fix is SOLID, press Enter to log the contact. It leaves the plot and the next one appears.',
        ],
      },
      {
        heading: 'How the patrol ends',
        lines: [
          'Log all five contacts and the patrol is complete.',
          'Run QUIET down to zero before that and the patrol is recalled. The Memory Card keeps the log either way.',
        ],
      },
    ],
  },
  {
    id: MANDATE_ID,
    title: 'Mandate of Seasons',
    year: 1996,
    genre: 'Turn-based strategy and simulation',
    tagline: 'Eight seasons, seven provinces, one mandate to renew.',
    summary:
      'A turn-based map of an ancient river valley. You are the new magistrate of one province, '
      + 'and every season you choose where to send your one officer, what to develop, and how to '
      + 'keep the provinces loyal. There is no fighting: influence comes from granaries, roads and '
      + 'good harvests.',
    controls: [
      { keys: 'Tap a province', action: 'Make it the one you are looking at this season' },
      { keys: 'E, D or T', action: 'Develop it: Granary, Dike or Trade road' },
      { keys: '1 to 7', action: 'Send your officer to that province to raise loyalty there' },
      { keys: 'Enter', action: 'End the season and resolve it' },
    ],
    howTo: [
      {
        heading: 'What you are doing',
        lines: [
          'You hold the mandate over one province of a river valley, for eight seasons.',
          'Four of the other provinces answer to you only loosely. Their loyalty decides whether your mandate is renewed.',
          'You never fight anyone. You spend seasons on granaries, dikes, trade roads and your officer\'s attention.',
        ],
      },
      {
        heading: 'A season',
        lines: [
          'A season has three parts: the season itself, then the harvest, then loyalty.',
          'In SPRING and SUMMER your granary fills. In AUTUMN you collect the harvest. In WINTER the granary is drawn down and loyalty is read.',
          'Each season you get one officer action and any number of developments you can pay for.',
        ],
      },
      {
        heading: 'The three developments',
        lines: [
          'A GRANARY costs 40 grain and raises the province\'s stores for the rest of the mandate.',
          'A DIKE costs 60 grain and raises that province\'s loyalty by 3, but only near the river.',
          'A TRADE ROAD costs 50 grain and raises loyalty by 2 in the province it joins to your seat.',
          'Grain is shared across the valley, so a rich province can pay for a poor one\'s development.',
        ],
      },
      {
        heading: 'How the mandate ends',
        lines: [
          'After the eighth season the elder council reads the valley\'s loyalty.',
          'An average of 60 or more renews your mandate. Below that, it passes to someone else.',
          'The final readout names the provinces that decided it.',
        ],
      },
    ],
  },
];

export function findGame(id) {
  return BUILT_IN.find((g) => g.id === id) || null;
}

// A CD-key style licence line, printed by the collection and the prompt, so a
// built-in title reads like something that shipped on a disk.
export function licenceLine(game) {
  return 'RetroRig ' + game.year + ' | ' + game.genre;
}

/* ── Deepwatch: Trench Patrol ────────────────────────────────────────────── */

const DEPTH_BANDS = ['SURFACE', 'SHALLOW', 'MID', 'DEEP'];
// Contacts live in a fixed, committed layout so a run is reproducible and two
// builds' screenshots line up. Each has a bearing, a range, a depth band and
// a drift (how its bearing moves per second, in degrees).
const CONTACTS = [
  { name: 'Contact one', bearing: 45, range: 4200, band: 1, drift: 1.4 },
  { name: 'Contact two', bearing: 120, range: 3100, band: 2, drift: -0.9 },
  { name: 'Contact three', bearing: 200, range: 5200, band: 0, drift: 0.6 },
  { name: 'Contact four', bearing: 275, range: 2600, band: 3, drift: -1.8 },
  { name: 'Contact five', bearing: 330, range: 4800, band: 2, drift: 1.1 },
];

function normalizeDeg(d) {
  return ((Math.round(d) % 360) + 360) % 360;
}

export function newDeepwatch() {
  return {
    v: 1,
    game: DEEPWATCH_ID,
    heading: 0,
    depth: 2,
    quiet: 100,
    fix: 0,
    index: 0,
    logged: 0,
    fixed: false,
    initial: [
      { name: 'Contact one', bearing: 45, band: 1 },
    ],
    contacts: CONTACTS.map((c) => Object.assign({}, c)),
    message: 'Patrol started. Five contacts are logged for this lane.',
    ended: null,
    score: 0,
  };
}

// Rebuild the live model from a stored snapshot. The array is normalized into
// a plain array of contacts, so a snapshot carrying anything unexpected (a
// string, an object) still produces a playable game rather than a crash.
export function loadDeepwatch(snapshot) {
  const fresh = newDeepwatch();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const raw = Array.isArray(snapshot.contacts) ? snapshot.contacts : [];
  const contacts = raw
    .filter((c) => c && typeof c === 'object')
    .map((c, i) => ({
      name: typeof c.name === 'string' ? c.name : 'Contact ' + (i + 1),
      bearing: Number.isFinite(Number(c.bearing)) ? normalizeDeg(c.bearing) : 0,
      range: Number.isFinite(Number(c.range)) ? Math.max(0, Math.round(Number(c.range))) : 4000,
      band: Number.isFinite(Number(c.band)) ? Math.max(0, Math.min(DEPTH_BANDS.length - 1, Math.round(Number(c.band)))) : 0,
      drift: Number.isFinite(Number(c.drift)) ? Number(c.drift) : 0,
    }));
  const state = Object.assign(fresh, {
    heading: Number.isFinite(Number(snapshot.heading)) ? normalizeDeg(snapshot.heading) : 0,
    depth: Number.isFinite(Number(snapshot.depth)) ? Math.max(0, Math.min(3, Math.round(snapshot.depth))) : 2,
    quiet: Number.isFinite(Number(snapshot.quiet)) ? Math.max(0, Math.min(100, Math.round(snapshot.quiet))) : 100,
    fix: Number.isFinite(Number(snapshot.fix)) ? Math.max(0, Math.min(100, Math.round(snapshot.fix))) : 0,
    logged: Number.isFinite(Number(snapshot.logged)) ? Math.max(0, Math.round(snapshot.logged)) : 0,
    index: Number.isFinite(Number(snapshot.index)) ? Math.max(0, Math.round(snapshot.index)) : 0,
    message: typeof snapshot.message === 'string' ? snapshot.message : fresh.message,
    ended: snapshot.ended === 'complete' || snapshot.ended === 'recalled' ? snapshot.ended : null,
    score: Number.isFinite(Number(snapshot.score)) ? Math.round(snapshot.score) : 0,
  });
  state.contacts = contacts.length ? contacts : fresh.contacts;
  if (state.index >= state.contacts.length && !state.ended) state.index = 0;
  return state;
}

// How sure the array is about the current contact: closing the range and
// sharing its depth band both sharpen the fix, which is the whole tactical
// content of the patrol.
export function fixQuality(state) {
  const c = state.contacts[state.index];
  if (!c) return 100;
  const rangeTerm = Math.max(0, 1 - c.range / 6000);
  const bandTerm = state.depth === c.band ? 1 : Math.abs(state.depth - c.band) === 1 ? 0.55 : 0.25;
  return Math.round(Math.max(0, Math.min(1, rangeTerm * 0.68 + bandTerm * 0.32)) * 100);
}

export function fixLabel(percent) {
  if (percent >= 75) return 'SOLID';
  if (percent >= 45) return 'FAIR';
  return 'WEAK';
}

// One step of the patrol's simulation. `dtMs` is real time, so a slower
// device does not change the result. Returns true when it changed anything a
// caller needs to redraw.
export function stepDeepwatch(state, dtMs) {
  if (state.ended) return false;
  const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
  const c = state.contacts[state.index];
  if (!c) return false;
  c.bearing = normalizeDeg(c.bearing + c.drift * dt);
  // The boat closes on whatever it is pointing at: a small range gain in the
  // direction of the heading, scaled by how well it is aligned.
  const delta = Math.abs(((c.bearing - state.heading + 540) % 360) - 180);
  const aligned = Math.max(0, 1 - delta / 90);
  const before = c.range;
  c.range = Math.max(400, Math.round(c.range - aligned * 260 * dt));
  state.fix = fixQuality(state);
  // Machinery cost: the further you run from your best depth band, the more
  // of the patrol's quiet budget you spend.
  const bandCost = state.depth === c.band ? 1.1 : 2.3;
  state.quiet = Math.max(0, Math.round((state.quiet - bandCost * dt) * 100) / 100);
  if (state.quiet <= 0) {
    state.ended = 'recalled';
    state.message = 'Quiet budget spent. The patrol is recalled after logging ' + state.logged + ' of 5.';
    state.score = state.logged * 100 + 25;
    return true;
  }
  return before !== c.range;
}

function applyKey(state, key) {
  if (state.ended) return false;
  switch (key) {
    case 'ArrowLeft': state.heading = normalizeDeg(state.heading - 6); return true;
    case 'ArrowRight': state.heading = normalizeDeg(state.heading + 6); return true;
    case 'ArrowUp': case 'w': case 'W': state.depth = Math.max(0, state.depth - 1); return true;
    case 'ArrowDown': case 's': case 'S': state.depth = Math.min(3, state.depth + 1); return true;
    default: return false;
  }
}

// The two commands a key can be. Everything else falls through to movement,
// so an arrow key is always usable.
export function deepwatchKey(state, key, pressedKeys) {
  if (state.ended) return false;
  if (key === ' ' || key === 'Spacebar') {
    // A careful fix costs quiet and buys certainty.
    state.quiet = Math.max(0, Math.round((state.quiet - 4) * 100) / 100);
    state.fix = Math.min(100, fixQuality(state) + 25);
    state.fixed = true;
    state.message = 'Towed array streamed. Sonar fix sharpened to ' + fixLabel(state.fix) + '.';
    if (state.quiet <= 0) {
      state.ended = 'recalled';
      state.message = 'Quiet budget spent on the fix. The patrol is recalled.';
      state.score = state.logged * 100 + 25;
    }
    return true;
  }
  if (key === 'Enter') {
    if (state.fix < 75) {
      state.message = 'The fix is only ' + fixLabel(state.fix) + '. Close the range, or match its depth band, before logging.';
      return true;
    }
    const c = state.contacts[state.index];
    state.logged += 1;
    state.message = 'Logged ' + c.name + ' at ' + c.bearing + ' degrees, ' + c.range + ' metres, ' + DEPTH_BANDS[c.band] + '.';
    state.contacts.splice(state.index, 1);
    state.fixed = false;
    if (!state.contacts.length) {
      state.ended = 'complete';
      state.message = 'Patrol complete. Every contact in the lane is charted.';
      state.score = 500 + Math.round(state.quiet);
    } else {
      state.fix = fixQuality(state);
    }
    return true;
  }
  // Movement keys may be held; a repeated press only moves once per repeat
  // tick, which the browser already rate-limits.
  const moved = applyKey(state, key);
  if (moved && state.contacts[state.index]) {
    state.fix = fixQuality(state);
    state.message = 'Holding ' + state.heading + ' degrees at ' + DEPTH_BANDS[state.depth] + '.';
  }
  return moved;
}

export function deepwatchReadout(state) {
  const c = state.contacts[state.index];
  const rows = [
    'HEADING: ' + state.heading + ' degrees',
    'DEPTH: ' + DEPTH_BANDS[state.depth],
    'SONAR FIX: ' + fixLabel(state.fix) + ' (' + state.fix + ' percent)',
    'QUIET: ' + Math.round(state.quiet) + ' of 100',
    'CHARTED: ' + state.logged + ' of 5',
  ];
  if (c) {
    rows.push('CONTACT: ' + c.bearing + ' degrees at ' + c.range + ' metres, ' + DEPTH_BANDS[c.band]);
  } else {
    rows.push('CONTACT: lane clear');
  }
  return rows;
}

export function deepwatchDepths() {
  return DEPTH_BANDS.slice();
}

/* ── Mandate of Seasons ──────────────────────────────────────────────────── */

// The valley. Every province is committed data: where it sits on the map,
// whether it touches the river (so a dike is possible) and what it produces.
// Loyalty and stores are the mutable half.
const PROVINCES = [
  { id: 'seat', name: 'Jade Ford', x: 96, y: 96, river: true, granary: 60, loyalty: 80, seat: true },
  { id: 'north', name: 'North Terraces', x: 150, y: 44, river: false, granary: 45, loyalty: 48, seat: false },
  { id: 'east', name: 'East Weir', x: 220, y: 78, river: true, granary: 40, loyalty: 44, seat: false },
  { id: 'south', name: 'South Kilns', x: 168, y: 150, river: false, granary: 35, loyalty: 40, seat: false },
  { id: 'west', name: 'West Granary', x: 46, y: 132, river: true, granary: 50, loyalty: 52, seat: false },
  { id: 'pass', name: 'Cloud Pass', x: 250, y: 140, river: false, granary: 25, loyalty: 36, seat: false },
  { id: 'river', name: 'River Market', x: 130, y: 104, river: true, granary: 30, loyalty: 58, seat: false },
];

const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
// Eight seasons is two years, which is the mandate's whole term.
export const MANDATE_SEASONS = 8;
export const MANDATE_TARGET = 60;

const DEVELOPMENTS = {
  granary: { key: 'granary', label: 'Granary', cost: 40, hint: 'Raises this province\'s stores.' },
  dike: { key: 'dike', label: 'Dike', cost: 60, hint: 'Only on the river. Raises loyalty by 3.' },
  road: { key: 'road', label: 'Trade road', cost: 50, hint: 'Joins this province to your seat. Raises loyalty by 2.' },
};

export function developments() {
  return Object.values(DEVELOPMENTS);
}

export function newMandate() {
  return {
    v: 1,
    game: MANDATE_ID,
    turn: 0,
    grain: 220,
    selected: 'north',
    officerUsed: false,
    log: ['Year one, spring. The mandate begins with ' + MANDATE_SEASONS + ' seasons to run.'],
    message: 'Pick a province, develop it, and send your officer. Then end the season.',
    ended: null,
    score: 0,
  };
}

export function loadMandate(snapshot) {
  const fresh = newMandate();
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  const state = Object.assign(fresh, {
    turn: Number.isFinite(Number(snapshot.turn)) ? Math.max(0, Math.min(MANDATE_SEASONS, Math.round(snapshot.turn))) : 0,
    grain: Number.isFinite(Number(snapshot.grain)) ? Math.max(0, Math.round(snapshot.grain)) : fresh.grain,
    selected: typeof snapshot.selected === 'string' && PROVINCES.some((p) => p.id === snapshot.selected)
      ? snapshot.selected : fresh.selected,
    officerUsed: !!snapshot.officerUsed,
    message: typeof snapshot.message === 'string' ? snapshot.message : fresh.message,
    ended: snapshot.ended === 'renewed' || snapshot.ended === 'lapsed' ? snapshot.ended : null,
    score: Number.isFinite(Number(snapshot.score)) ? Math.round(snapshot.score) : 0,
  });
  const log = Array.isArray(snapshot.log) ? snapshot.log.filter((l) => typeof l === 'string') : [];
  state.log = log.slice(-40);
  if (!state.log.length) state.log = fresh.log;
  state.provinces = provincesFrom(snapshot.provinces);
  return state;
}

// Province state is committed data plus whatever a save slot changed. A
// snapshot is untrusted here, so every number is clamped into the range the
// screen promises rather than trusted.
function provincesFrom(saved) {
  const rows = Array.isArray(saved) ? saved : [];
  return PROVINCES.map((p) => {
    const s = rows.find((r) => r && r.id === p.id) || {};
    return {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      river: p.river,
      seat: p.seat,
      granary: Number.isFinite(Number(s.granary)) ? Math.max(0, Math.min(200, Math.round(s.granary))) : p.granary,
      loyalty: Number.isFinite(Number(s.loyalty)) ? Math.max(0, Math.min(100, Math.round(s.loyalty))) : p.loyalty,
      developments: Array.isArray(s.developments)
        ? s.developments.filter((d) => typeof d === 'string').slice(0, 20) : [],
    };
  });
}

// A province's standing, so a save carries the map's mutable half only.
export function mandateProvinces(state) {
  if (!state.provinces) state.provinces = provincesFrom(null);
  return state.provinces;
}

export function seasonName(turn) {
  return SEASONS[turn % 4];
}

export function yearOf(turn) {
  return Math.floor(turn / 4) + 1;
}

export function mandateAverageLoyalty(state) {
  const provinces = mandateProvinces(state);
  const total = provinces.reduce((sum, p) => sum + p.loyalty, 0);
  return Math.round(total / provinces.length);
}

export function developmentCost(key) {
  const d = DEVELOPMENTS[key];
  return d ? d.cost : 0;
}

// Develop the selected province. Returns true when the action happened.
export function mandateDevelop(state, key) {
  if (state.ended) return false;
  const d = DEVELOPMENTS[key];
  if (!d) return false;
  const provinces = mandateProvinces(state);
  const p = provinces.find((x) => x.id === state.selected);
  if (!p) return false;
  if (p.developments.filter((x) => x === key).length >= 2) {
    state.message = p.name + ' already has all the ' + d.label.toLowerCase() + ' it can use.';
    return true;
  }
  if (key === 'dike' && !p.river) {
    state.message = p.name + ' is inland, so a dike has nothing to hold back.';
    return true;
  }
  if (state.grain < d.cost) {
    state.message = 'Not enough grain. A ' + d.label.toLowerCase() + ' costs ' + d.cost + '.';
    return true;
  }
  state.grain -= d.cost;
  p.developments.push(key);
  if (key === 'granary') {
    p.granary += 25;
    state.message = 'A granary goes up in ' + p.name + '. Stores are now ' + p.granary + '.';
  } else if (key === 'dike') {
    p.loyalty = Math.min(100, p.loyalty + 3);
    state.message = 'A dike is finished at ' + p.name + '. Loyalty is now ' + p.loyalty + '.';
  } else {
    p.loyalty = Math.min(100, p.loyalty + 2);
    state.message = 'A trade road joins ' + p.name + ' to your seat. Loyalty is now ' + p.loyalty + '.';
  }
  return true;
}

// Send the one officer. One province a season, which is the game's real
// constraint: seven provinces, eight seasons, and loyalty that drifts.
export function mandateOfficer(state, provinceId) {
  if (state.ended) return false;
  const provinces = mandateProvinces(state);
  const p = provinces.find((x) => x.id === (provinceId || state.selected));
  if (!p) return false;
  if (state.officerUsed) {
    state.message = 'Your officer has already been sent this season.';
    return true;
  }
  state.officerUsed = true;
  const gain = 5 + Math.round(p.granary / 25);
  p.loyalty = Math.min(100, p.loyalty + gain);
  state.message = 'Your officer works the season in ' + p.name + '. Its loyalty rises by ' + gain + '.';
  return true;
}

// End the season: harvest, stores, drift, then the next season. This is the
// one place the calendar moves, so a save is always taken between seasons.
export function mandateEndSeason(state) {
  if (state.ended) return false;
  const provinces = mandateProvinces(state);
  const season = seasonName(state.turn);
  const lines = [];
  let harvested = 0;
  for (const p of provinces) {
    const yieldThis = Math.round(p.granary * (season === 'AUTUMN' ? 0.5 : season === 'WINTER' ? 0.1 : 0.3));
    harvested += yieldThis;
    // Winter draws a province's own stores down; the rest of the year fills
    // them. A province with nothing in the granary loses loyalty instead.
    if (season === 'WINTER') {
      const drawn = Math.round(p.granary * 0.35);
      p.granary = Math.max(0, p.granary - drawn);
      if (p.granary < 10) {
        lines.push(p.name + ' ran its granary dry and lost 2 loyalty.');
        p.loyalty = Math.max(0, p.loyalty - 2);
      }
    } else {
      p.granary = Math.min(200, p.granary + Math.round(yieldThis * 0.4));
    }
  }
  state.grain = Math.min(999, state.grain + harvested);
  lines.unshift(season + ' of year ' + yearOf(state.turn) + ': the valley brings in ' + harvested + ' grain.');

  // Loyalty drifts: a far province with few developments drifts away, and the
  // seat is the fallback everyone measures against.
  const seat = provinces.find((p) => p.seat);
  for (const p of provinces) {
    if (p.seat) continue;
    const distance = Math.hypot(p.x - seat.x, p.y - seat.y);
    const drift = p.developments.length >= 2 ? 0 : distance > 150 ? -1 : 0;
    if (drift) p.loyalty = Math.max(0, p.loyalty + drift);
  }

  state.turn += 1;
  state.officerUsed = false;
  state.selected = provinces.reduce((worst, p) => (p.loyalty < worst.loyalty ? p : worst), provinces[0]).id;
  state.log = state.log.concat(lines).slice(-40);
  if (state.turn >= MANDATE_SEASONS) {
    state.ended = mandateAverageLoyalty(state) >= MANDATE_TARGET ? 'renewed' : 'lapsed';
    state.score = mandateAverageLoyalty(state);
    state.message = state.ended === 'renewed'
      ? 'The elder council renews your mandate.'
      : 'The elder council lets the mandate pass to another house.';
  } else {
    state.message = 'Season ' + (state.turn + 1) + ' of ' + MANDATE_SEASONS + ': ' + seasonName(state.turn)
      + ' of year ' + yearOf(state.turn) + '. ' + lines[lines.length - 1];
  }
  return true;
}

export function mandateReadout(state) {
  const provinces = mandateProvinces(state);
  const p = provinces.find((x) => x.id === state.selected) || provinces[0];
  return [
    'SEASON: ' + (Math.min(state.turn, MANDATE_SEASONS - 1) + 1) + ' of ' + MANDATE_SEASONS
      + ' | ' + seasonName(Math.min(state.turn, MANDATE_SEASONS - 1)) + ', year ' + yearOf(Math.min(state.turn, MANDATE_SEASONS - 1)),
    'GRAIN: ' + state.grain,
    'LOOKING AT: ' + p.name + ' | loyalty ' + p.loyalty + ' | stores ' + p.granary,
    'OFFICER: ' + (state.officerUsed ? 'sent this season' : 'ready'),
    'VALLEY LOYALTY: ' + mandateAverageLoyalty(state) + ' | mandate renews at ' + MANDATE_TARGET,
  ];
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

const GREEN = '#4ade80';
const CYAN = '#22d3ee';
const AMBER = '#fbbf24';
const RED = '#f87171';
const DIM = '#5c6f6c';

function text(ctx, str, x, y, colour, size) {
  ctx.fillStyle = colour || CYAN;
  ctx.font = (size || 8) + 'px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

// A polar sonar plot: the boat at the centre, rings at fixed ranges, and the
// current contact as a line at its true bearing with a blip at its range.
export function drawDeepwatch(picture, state) {
  const ctx = picture.bctx;
  const cx = VIDEO_W / 2;
  const cy = VIDEO_H / 2 + 12;
  const maxR = 78;
  picture.clear('#04100b');

  // Range rings, labelled in thousands of metres.
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.round((maxR / 3) * i) + 0.5, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, (i * 2) + 'k', cx + 2, cy - Math.round((maxR / 3) * i) - 8, 'rgba(146,162,158,1)', 7);
  }
  // Cross hairs.
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
  ctx.beginPath();
  ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
  ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
  ctx.stroke();

  // The boat: a heading needle from the centre outward.
  const hr = (state.heading - 90) * (Math.PI / 180);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hr) * 20, cy + Math.sin(hr) * 20);
  ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  const c = state.contacts[state.index];
  if (c) {
    const br = (c.bearing - 90) * (Math.PI / 180);
    const rr = maxR * Math.min(1, c.range / 6000);
    const px = cx + Math.cos(br) * rr;
    const py = cy + Math.sin(br) * rr;
    // The in-range cone the boat can actually read.
    const half = 0.45;
    ctx.fillStyle = 'rgba(74, 222, 128, 0.10)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, hr - half, hr + half);
    ctx.closePath();
    ctx.fill();
    // The contact line and its blip, amber until the fix is solid.
    const colour = state.fix >= 75 ? GREEN : state.fix >= 45 ? CYAN : AMBER;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    text(ctx, c.name.toUpperCase(), px + 6, py - 4, colour, 7);
  }

  // The two printed bands: heading and depth compass at the top, the patrol's
  // own readout along the bottom.
  text(ctx, 'HEADING ' + state.heading + '  DEPTH ' + DEPTH_BANDS[state.depth], 6, 4, CYAN, 8);
  text(ctx, 'FIX ' + fixLabel(state.fix) + '  QUIET ' + Math.round(state.quiet) + '  CHARTED ' + state.logged + '/5', 6, VIDEO_H - 12,
    state.quiet < 25 ? RED : state.fix >= 75 ? GREEN : CYAN, 8);
}

// A stylized valley: a river band, seven provinces, and the one you are
// looking at ringed.
export function drawMandate(picture, state) {
  const ctx = picture.bctx;
  const provinces = mandateProvinces(state);
  picture.clear('#100b06');

  // The river: two soft bands down the middle of the valley.
  ctx.fillStyle = 'rgba(34, 211, 238, 0.10)';
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.bezierCurveTo(70, 60, 120, 150, 300, 200);
  ctx.lineTo(320, 200);
  ctx.lineTo(320, 168);
  ctx.bezierCurveTo(190, 130, 140, 60, 96, 0);
  ctx.closePath();
  ctx.fill();

  // Province links: a trade road is drawn as a heavier line to the seat.
  const seat = provinces.find((p) => p.seat) || provinces[0];
  for (const p of provinces) {
    if (p.seat) continue;
    const road = p.developments.includes('road');
    ctx.strokeStyle = road ? GREEN : 'rgba(94, 111, 108, 0.7)';
    ctx.lineWidth = road ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  for (const p of provinces) {
    const loyaltyTone = p.loyalty >= 60 ? GREEN : p.loyalty >= 45 ? CYAN : p.loyalty >= 35 ? AMBER : RED;
    ctx.fillStyle = p.seat ? 'rgba(74, 222, 128, 0.22)' : 'rgba(20, 28, 26, 0.92)';
    ctx.strokeStyle = loyaltyTone;
    ctx.lineWidth = p.id === state.selected ? 2 : 1;
    const size = p.seat ? 13 : 11;
    ctx.beginPath();
    ctx.rect(p.x - size, p.y - size, size * 2, size * 2);
    ctx.fill();
    ctx.stroke();
    // A dike and a granary are drawn onto the province so a season's work is
    // visible on the map, not only in a list.
    if (p.developments.includes('dike')) {
      ctx.strokeStyle = CYAN;
      ctx.beginPath();
      ctx.moveTo(p.x - size, p.y - size);
      ctx.lineTo(p.x - size - 4, p.y - size - 4);
      ctx.stroke();
    }
    if (p.developments.includes('granary')) {
      ctx.fillStyle = AMBER;
      ctx.fillRect(p.x + size - 4, p.y - size - 1, 4, 4);
    }
    text(ctx, p.name.slice(0, 14), p.x - size, p.y + size + 2, p.loyalty >= 45 ? CYAN : AMBER, 7);
    text(ctx, 'L ' + p.loyalty, p.x - size, p.y - 4, loyaltyTone, 8);
  }

  text(ctx, 'SEASON ' + (Math.min(state.turn, MANDATE_SEASONS - 1) + 1) + '/' + MANDATE_SEASONS + '  ' + seasonName(Math.min(state.turn, MANDATE_SEASONS - 1))
    + '  YEAR ' + yearOf(Math.min(state.turn, MANDATE_SEASONS - 1)), 6, 4, CYAN, 8);
  text(ctx, 'GRAIN ' + state.grain + '   VALLEY LOYALTY ' + mandateAverageLoyalty(state) + '   RENEW AT ' + MANDATE_TARGET, 6, VIDEO_H - 12,
    mandateAverageLoyalty(state) >= MANDATE_TARGET ? GREEN : AMBER, 8);
}
