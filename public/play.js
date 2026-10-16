// GameWatch's play screen: the panel, the handheld's own keys, the Memory
// Card and the How to Play drawer.
//
// The host owns everything around a title: the LCD picture, the handheld key
// mapping, the readout under the panel, the Reset confirmation and the save
// controls. What each title DOES lives in games.js, which never touches the
// DOM.

import { el } from './dom.js';
import { createPicture, startLoop, describeSettings } from './crt.js';
import {
  runnerFor, tierFor, tierLine, licenceLine, progressLine,
} from './games.js';

/* ── The handheld's own keys ─────────────────────────────────────────────
 * Nine keys, and every one of them does something: the four D-Pad
 * directions, the two game buttons, and the three system keys a handheld has
 * along the bottom edge.
 */
export const ACTIONS = [
  { key: 'up', label: 'D-Pad up', blurb: 'Up, or the title\'s own use for it', group: 'dpad' },
  { key: 'down', label: 'D-Pad down', blurb: 'Down, or the title\'s own use for it', group: 'dpad' },
  { key: 'left', label: 'D-Pad left', blurb: 'Left, or the title\'s own use for it', group: 'dpad' },
  { key: 'right', label: 'D-Pad right', blurb: 'Right, or the title\'s own use for it', group: 'dpad' },
  { key: 'game_a', label: 'Game A', blurb: 'The title\'s first action: serve, jump, catch, sort', group: 'game' },
  { key: 'game_b', label: 'Game B', blurb: 'The title\'s second action, documented on its drawer', group: 'game' },
  { key: 'sound', label: 'Sound', blurb: 'Mute and unmute the tone generator', group: 'system' },
  { key: 'time', label: 'Time', blurb: 'Show and hide the clock readout', group: 'system' },
  { key: 'reset', label: 'Reset', blurb: 'Start the current run again, after confirming', group: 'system' },
];

export const ACTION_KEYS = ACTIONS.map((a) => a.key);

// The six actions a title's own rules understand. Sound, Time and Reset are
// the handheld's, not the title's, and the host handles them itself.
export const PLAY_ACTIONS = ['up', 'down', 'left', 'right', 'game_a', 'game_b'];

// The keys the handheld ships bound, as a physical keyboard sees them.
export const DEFAULT_BINDINGS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  game_a: 'Enter',
  game_b: ' ',
  sound: 'm',
  time: 't',
  reset: 'r',
};

// A physical key's own name, as the mapping screen shows it.
export function keyLabel(key) {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key.replace('Arrow', 'Arrow ');
}

// A handheld key's own name, for a conflict message ("S is already Game A.").
export function actionLabel(action) {
  const hit = ACTIONS.find((a) => a.key === action);
  return hit ? hit.label : String(action);
}

// Which handheld key a pressed key fires, or null.
export function actionFor(bindings, key) {
  const map = Object.assign({}, DEFAULT_BINDINGS, bindings || {});
  const hit = ACTIONS.find((a) => map[a.key] === key);
  return hit ? hit.key : null;
}

// Which handheld keys already hold a key: the conflict check. A key keeps at
// least one binding, and a clash is refused rather than swapped silently.
export function conflictsFor(bindings, action, key) {
  const map = Object.assign({}, DEFAULT_BINDINGS, bindings || {});
  return ACTIONS
    .filter((a) => a.key !== action && map[a.key] === key)
    .map((a) => a.label);
}

/* ── The handheld's tone ─────────────────────────────────────────────────
 * One AudioContext for the whole app, created inside a tap (a phone refuses
 * audio started anywhere else) and reused afterwards. Every sound is
 * synthesised: GameWatch ships no audio files.
 */
let audioCtx = null;
let volume = 70;
let muted = false;

export function setVolume(percent) {
  volume = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
}

// The Sound key mutes and unmutes this one generator rather than adding a
// second one.
export function setMuted(next) {
  muted = !!next;
}

export function isMuted() {
  return muted;
}

export function toggleMuted() {
  muted = !muted;
  if (!muted) unlockAudio();
  return muted;
}

// Called from a click or key handler.
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return true;
  } catch {
    return false;
  }
}

// A short synthesised blip. Silent at volume 0, while muted, and when no
// context could be started, which is the graceful case on a device that
// refuses audio.
export function tone(kind = 'tick') {
  if (!audioCtx || volume <= 0 || muted) return;
  const shapes = {
    tick: { freq: 880, ms: 60, type: 'square' },
    ping: { freq: 440, ms: 320, type: 'sine' },
    confirm: { freq: 660, ms: 180, type: 'triangle' },
    deny: { freq: 160, ms: 220, type: 'sawtooth' },
  };
  const s = shapes[kind] || shapes.tick;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.freq, now);
    if (kind === 'ping') osc.frequency.exponentialRampToValueAtTime(s.freq / 2, now + s.ms / 1000);
    gain.gain.setValueAtTime((volume / 100) * 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + s.ms / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + s.ms / 1000);
  } catch { /* a refused tone is never a failure the viewer needs to see */ }
}

/* ── The How to Play drawer ──────────────────────────────────────────────
 * The same blocks are the play screen's drawer and the standalone screen at
 * #/how/<id>, so a reviewer can reach the tutorial as its own address and
 * the two can never disagree.
 */
export function howToBlocks(title) {
  return [
    el('section', { class: 'card flex flex-col gap-3', 'data-how-controls': '' },
      el('h3', { class: 'text-heading', text: 'Controls' }),
      el('ul', { class: 'list', 'data-how-control-list': title.id },
        (Array.isArray(title.controls) ? title.controls : []).map((c) => el('li', {
          class: 'list-row justify-between gap-3', 'data-how-control': c.keys,
        },
          el('span', { class: 'text-body font-medium', text: c.keys }),
          el('span', { class: 'text-body text-muted', text: c.action }),
        )),
      ),
      el('p', { class: 'text-small text-muted', text: 'These are the handheld\'s own buttons. Which key on your keyboard each one is bound to is set on the Settings screen, so the words here and the key you press cannot disagree.' }),
    ),
    el('section', { class: 'card flex flex-col gap-2', 'data-how-tiers': '' },
      el('h3', { class: 'text-heading', text: 'The scoring tiers' }),
      el('ul', { class: 'list' },
        title.tiers.map((t) => el('li', { class: 'list-row justify-between gap-3' },
          el('span', { class: 'text-body font-medium', text: t.name }),
          el('span', { class: 'text-body text-muted', text: t.min + ' to ' + (t.max == null ? 'and up' : t.max) }),
        )),
      ),
      el('p', { class: 'rig-print', 'data-how-tier-line': title.id, text: tierLine(title) }),
    ),
    title.howTo.map((block) => el('section', { class: 'card flex flex-col gap-2' },
      el('h3', { class: 'text-heading', text: block.heading }),
      block.lines.map((line) => el('p', { class: 'text-body text-muted', text: line })),
    )),
    el('p', { class: 'text-small text-muted', text: 'There is no violence, no weaponry, no betting and no loot box anywhere in this title. It is a simulation drawn by GameWatch, and nothing on the panel is real machinery.' }),
  ];
}

// The drawer on the play screen: closed until a player opens it, so the panel
// stays the first thing on the screen.
export function howToDrawer(title) {
  return el('details', { class: 'card', 'data-how-drawer': title.id },
    el('summary', { class: 'text-body font-medium', text: 'How to play ' + title.title }),
    el('div', { class: 'flex flex-col gap-4 pt-4' },
      el('p', { class: 'text-body text-muted', text: title.summary }),
      howToBlocks(title),
    ),
  );
}

// The standalone How to Play screen (#/how/<id>).
export function renderHowTo(title, opts) {
  if (!title) return null;
  const options = opts || {};
  const state = options.state || null;
  return el('div', { class: 'rig-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title.title + ' how to play', 'data-how-to': title.id },
    el('div', { class: 'rig-sheet-panel' },
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        el('button', { class: 'btn-secondary', type: 'button', text: 'Back to the Arcade', onclick: options.onBack }),
        el('button', { class: 'btn-primary', type: 'button', text: 'Play this title', onclick: options.onRun }),
      ),
      el('header', { class: 'flex flex-col gap-1' },
        el('p', { class: 'section-label', text: 'How to play' }),
        el('h2', { class: 'text-title', 'data-how-to-title': title.id, text: title.title }),
        el('p', { class: 'text-body text-muted', text: title.tagline }),
      ),
      el('p', { class: 'rig-print', text: licenceLine(title) }),
      el('p', { class: 'text-body', text: title.summary }),
      state ? el('p', { class: 'rig-print', 'data-how-hiscore': title.id, text: progressLine(title, state) }) : null,
      howToBlocks(title),
    ),
  );
}

/* ── The play screen ───────────────────────────────────────────────────── */

function readoutBlock(rows) {
  return el('div', { class: 'rig-readout', role: 'status', 'aria-live': 'polite', 'data-readout': '' },
    rows.map((line) => el('div', { class: 'rig-print', text: line })),
  );
}

function formatWhen(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return 'saved earlier';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Mount one built-in title. `snapshot` is a Memory Card slot's state to start
// from, or null for a fresh run.
export function renderPlay(title, opts) {
  if (!title) return null;
  const runner = runnerFor(title.id);
  if (!runner) return null;

  const options = opts || {};
  const settings = options.settings || {};
  const bindings = Object.assign({}, DEFAULT_BINDINGS, options.bindings || {});
  // The card list is read live from the host after a write, so a card that
  // was just saved shows the run without leaving the screen. The captured
  // array is the fallback for a host that passes no reader.
  const capturedSlots = options.slots || [];
  const readSlots = () => (typeof options.readSlots === 'function' ? options.readSlots() : capturedSlots);
  const saved = options.snapshot || null;
  let slot = options.slot || null;
  let clockOn = options.clockOn !== false;
  let confirmReset = false;
  let outcomeTone = null;

  let state = saved ? runner.load(saved) : runner.newRun();

  const canvas = el('canvas', { class: 'rig-canvas', 'data-lcd-canvas': title.id });
  // The bezel picture sits BEHIND the canvas, as art around the panel. The
  // panel itself stays the drawn simulation: an uploaded image cannot become
  // the segment drawing, so it frames it rather than replacing it.
  const panel = el('div', { class: 'rig-screen', 'data-lcd-panel': title.id },
    title.bezelUrl
      ? el('img', { class: 'rig-bezel-art', src: title.bezelUrl, alt: title.title + ' bezel art', 'data-lcd-bezel': title.id, 'aria-hidden': 'true' })
      : null,
    canvas,
    el('span', { class: 'rig-sim', text: 'Simulated panel' }),
  );
  const readout = el('div', { class: 'flex flex-col gap-3' });
  const resetBlock = el('div', { class: 'flex flex-col gap-2' });
  const outcomeBlock = el('div', { class: 'flex flex-col gap-2' });
  const cardBlock = el('div', { class: 'flex flex-col gap-2' });
  const keypad = el('div', { class: 'rig-keypad', 'data-keypad': title.id });
  let exit = () => {};

  // The clock is a display of the platform's "now", never a rule: the Time
  // key shows and hides it. It reads through usernode.now() so a preview
  // opened at a chosen moment shows that moment.
  function nowText() {
    let d = new Date();
    try {
      if (window.usernode && typeof window.usernode.now === 'function') d = window.usernode.now();
    } catch { /* fall back to the device clock */ }
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }

  function rows() {
    return runner.readout(state).concat([
      'PANEL CLOCK: ' + (clockOn ? nowText() : 'hidden (press the Time key)'),
      'SOUND: ' + (muted ? 'muted (press the Sound key)' : 'on'),
      progressLine(title, state),
    ]);
  }

  function messageRow() {
    return el('div', { class: 'flex flex-wrap items-center gap-2' },
      el('span', { class: 'rig-sim', text: 'Simulated readout' }),
      el('span', { class: 'text-small text-muted', 'data-message': title.id, text: state.message }),
    );
  }

  function paintReadout() {
    readout.replaceChildren(readoutBlock(rows()), messageRow());
  }

  function paintOutcome() {
    if (!state.ended) { outcomeBlock.replaceChildren(); return; }
    const done = state.ended === 'complete';
    const tier = tierFor(title, state.score);
    if (outcomeTone !== state.ended) {
      outcomeTone = state.ended;
      tone(done ? 'ping' : 'deny');
    }
    outcomeBlock.replaceChildren(
      el('p', { class: 'text-heading ' + (done ? 'text-accent' : 'text-danger'), 'data-outcome': state.ended,
        text: done ? 'Run complete' : 'Run over' }),
      el('p', { class: 'text-body text-muted', text: state.message }),
      el('p', { class: 'rig-print', 'data-outcome-tier': title.id, text: progressLine(title, state) + ' | tier ' + tierLine(title) }),
      el('button', {
        class: 'btn-secondary', type: 'button', 'data-fresh-run': title.id, text: 'Start a fresh run',
        onclick: () => { unlockAudio(); tone('confirm'); freshRun(); },
      }),
    );
  }

  function paintReset() {
    if (!confirmReset) { resetBlock.replaceChildren(); return; }
    resetBlock.replaceChildren(
      el('div', { class: 'card flex flex-wrap items-center gap-2', 'data-reset-confirm': title.id },
        el('p', { class: 'text-body', text: 'Start this run again? Anything since the last Memory Card save is lost.' }),
        el('button', {
          class: 'btn-primary', type: 'button', 'data-reset-yes': title.id, text: 'Reset the run',
          onclick: () => { confirmReset = false; tone('confirm'); freshRun(); },
        }),
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-reset-no': title.id, text: 'Keep playing',
          onclick: () => { confirmReset = false; paint(); },
        }),
      ),
    );
  }

  function paintCard() {
    const nodes = [
      el('h3', { class: 'text-heading', text: 'Memory Card' }),
      el('ul', { class: 'list', 'data-card': title.id },
        [1, 2, 3, 4].map((n) => {
          const entry = readSlots().find((s) => Number(s.slot) === n);
          const key = title.id + ':' + n;
          if (!entry) {
            return el('li', { class: 'list-row flex-wrap justify-between gap-3', 'data-slot': key, 'data-slot-empty': '' },
              el('div', { class: 'flex flex-col gap-0.5' },
                el('strong', { class: 'text-body', text: 'Card ' + n }),
                el('span', { class: 'text-small text-muted', text: 'Empty' }),
              ),
              el('span', { class: 'text-small text-muted', text: 'Nothing saved here' }),
            );
          }
          return el('li', { class: 'list-row flex-wrap justify-between gap-3', 'data-slot': key },
            el('div', { class: 'flex flex-col gap-0.5' },
              el('strong', { class: 'text-body', text: 'Card ' + n }),
              el('span', { class: 'text-small text-muted', text: (entry.label || 'Saved run') + ' | ' + formatWhen(entry.savedAt) }),
              el('span', { class: 'rig-print', text: progressLine(title, { score: entry.highScore }) }),
            ),
            el('div', { class: 'flex flex-wrap gap-2' },
              el('button', {
                class: 'btn-primary', type: 'button', 'data-load-slot': key, text: 'Load',
                onclick: () => { unlockAudio(); tone('confirm'); loadSlot(entry); },
              }),
              el('button', {
                class: 'btn-secondary', type: 'button', 'data-clear-slot': key, text: 'Clear',
                onclick: () => { if (options.onClear) options.onClear(n); },
              }),
            ),
          );
        }),
      ),
      el('div', { class: 'flex flex-wrap gap-2' },
        el('button', {
          class: 'btn-primary', type: 'button', 'data-save-run': title.id,
          text: slot ? 'Save to card ' + slot : 'Save this run',
          onclick: async () => {
            if (!options.onSave) return;
            const target = slot || [1, 2, 3, 4].find((n) => !readSlots().some((s) => Number(s.slot) === n)) || 1;
            slot = target;
            await options.onSave(runner.save(state), target);
            paint();
          },
        }),
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-pick-slot': title.id, text: 'Save to the first free card',
          onclick: async () => {
            if (!options.onSave) return;
            const free = [1, 2, 3, 4].find((n) => !readSlots().some((s) => Number(s.slot) === n)) || 1;
            slot = free;
            await options.onSave(runner.save(state), free);
            paint();
          },
        }),
      ),
      el('p', { class: 'text-small text-muted', text: 'A card keeps the whole run, so loading one carries on where it stopped.' }),
    ];
    cardBlock.replaceChildren(...nodes);
  }

  // A control row a title carries names the buttons it covers, so the keypad
  // prints the title's OWN words over them. That is the manager's control
  // editor reaching the on-screen keypad; which physical key is bound to the
  // button stays the person's own mapping on the Settings screen.
  const controlWords = {};
  for (const row of Array.isArray(title.controls) ? title.controls : []) {
    for (const key of Array.isArray(row.plays) ? row.plays : []) {
      if (row.action && !controlWords[key]) controlWords[key] = row.action;
    }
  }

  function paintKeypad() {
    const groups = [
      { id: 'dpad', label: 'D-Pad', acts: ACTIONS.filter((a) => a.group === 'dpad') },
      { id: 'game', label: 'Game buttons', acts: ACTIONS.filter((a) => a.group === 'game') },
      { id: 'system', label: 'Handheld keys', acts: ACTIONS.filter((a) => a.group === 'system') },
    ];
    keypad.replaceChildren(...groups.map((group) => el('div', { class: 'flex flex-col gap-1', 'data-keypad-group': group.id },
      el('p', { class: 'section-label mb-0', text: group.label }),
      el('div', { class: 'rig-keypad-row' }, group.acts.map((action) => el('button', {
        class: 'rig-button', type: 'button', 'data-keypad-key': action.key, title: controlWords[action.key] || action.blurb,
        onclick: () => press(action.key, controlWords[action.key] || action.label),
      },
        el('span', { class: 'font-mono text-small', text: keyLabel(bindings[action.key]) }),
        el('span', { class: 'text-small', text: action.label }),
        controlWords[action.key]
          ? el('span', { class: 'text-small text-muted', 'data-keypad-control': action.key, text: controlWords[action.key] })
          : null,
      ))),
    )));
  }

  function paint() {
    paintReadout();
    paintKeypad();
    paintReset();
    paintOutcome();
    paintCard();
  }

  // One press, from the on-screen keypad or from the mapped physical key.
  // The host owns the three system keys; the title owns the other six.
  function press(action, label) {
    unlockAudio();
    if (action === 'sound') {
      const nowMuted = toggleMuted();
      tone('tick');
      toastLine(nowMuted ? 'Sound off.' : 'Sound on.');
      paintReadout();
      return;
    }
    if (action === 'time') {
      clockOn = !clockOn;
      tone('tick');
      paintReadout();
      return;
    }
    if (action === 'reset') {
      confirmReset = true;
      tone('deny');
      paintReset();
      return;
    }
    if (!PLAY_ACTIONS.includes(action)) return;
    const handled = runner.key(state, action);
    if (!handled) { tone('deny'); return; }
    tone('tick');
    if (label) state.message = state.message || (label + '.');
    draw();
    picture.present();
    paint();
  }

  // A short line under the panel, for the keys that change something the
  // panel itself does not show.
  function toastLine(text) {
    if (window.unNative && typeof window.unNative.toast === 'function') {
      try { window.unNative.toast(text); return; } catch { /* fall through */ }
    }
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    setTimeout(() => { node.hidden = true; }, 2200);
  }

  function freshRun() {
    state = runner.newRun();
    outcomeTone = null;
    confirmReset = false;
    if (options.onFresh) options.onFresh();
    draw();
    picture.present();
    paint();
  }

  function loadSlot(entry) {
    state = runner.load(entry.state);
    slot = Number(entry.slot);
    outcomeTone = null;
    confirmReset = false;
    draw();
    picture.present();
    paint();
    toastLine('Loaded card ' + slot + '.');
  }

  // A physical key, routed through the handheld's own mapping, so the key
  // mapping screen really changes how the titles are played.
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const action = actionFor(bindings, event.key);
    if (!action) return;
    if (confirmReset && action !== 'reset') return;
    event.preventDefault();
    press(action);
  }

  const picture = createPicture(canvas);

  function draw() {
    runner.draw(picture, state);
  }

  const stop = startLoop(
    picture,
    (dtMs) => { runner.step(state, dtMs); },
    () => { draw(); },
  );

  function applySettings(next) {
    picture.applySettings(next);
    picture.resize();
    picture.present();
    setVolume(next && next.volume);
  }
  applySettings(settings);

  const root = el('section', { class: 'flex flex-col gap-4', 'data-playing': title.id },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      el('div', { class: 'flex flex-wrap gap-2' },
        el('button', { class: 'btn-secondary', type: 'button', text: 'Back to the Arcade', onclick: () => exit() }),
        el('button', { class: 'btn-secondary', type: 'button', text: 'How to play', onclick: options.onHowTo }),
      ),
      el('span', { class: 'rig-sim', text: 'Simulated handheld' }),
    ),
    el('header', { class: 'flex flex-col gap-1' },
      el('p', { class: 'section-label', text: 'GameWatch ' + title.year + ' | ' + title.genreBox }),
      el('h2', { class: 'text-title', 'data-play-title': title.id, text: title.title }),
      el('p', { class: 'text-body text-muted', text: title.tagline }),
    ),
    panel,
    outcomeBlock,
    readout,
    resetBlock,
    el('section', { class: 'flex flex-col gap-2', 'data-handheld-keys': '' },
      el('h3', { class: 'text-heading', text: 'The handheld keys' }),
      keypad,
      el('p', { class: 'text-small text-muted', text: 'These are the same keys the mapping screen binds, so a physical key and a tap here do the same thing.' }),
    ),
    cardBlock,
    howToDrawer(title),
    el('details', { class: 'card' },
      el('summary', { class: 'text-body', text: 'Picture and sound settings at work' }),
      describeSettings(picture.settings).map((line) => el('p', { class: 'rig-print mt-2', text: line })),
    ),
  );

  exit = options.onExit || (() => {});
  paint();
  picture.resize();
  draw();
  picture.present();

  // Watch the panel for resizes: a phone rotation or a desktop window change
  // re-measures the picture so the screen never scrolls sideways.
  const onResize = () => { picture.resize(); draw(); picture.present(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (observer) observer.observe(panel);

  return {
    el: root,
    stop() {
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      if (observer) observer.disconnect();
    },
    applySettings,
    // The Arcade row uses this to show a card's run without mounting the
    // title, so it must stay live too.
    refreshCards: paintCard,
    getState: () => state,
    save: () => runner.save(state),
  };
}
