// RetroRig's game host, how-to-play screen and the rig's small tone generator.
//
// The host owns everything around a game: the CRT picture, the keyboard and
// pointer input routed through the viewer's joystick mapping, the readout
// under the screen, and the save controls. What each game DOES lives in
// games.js, which never touches the DOM.

import { el } from './dom.js';
import { createPicture, startLoop, describeSettings } from './crt.js';
import {
  newDeepwatch, loadDeepwatch, stepDeepwatch, deepwatchKey, deepwatchReadout,
  newMandate, loadMandate, mandateDevelop, mandateOfficer, mandateEndSeason, mandateReadout,
  mandateProvinces, developmentCost, drawDeepwatch, drawMandate,
} from './games.js';

/* ── The rig's tone ──────────────────────────────────────────────────────── */

// One AudioContext for the whole rig, created inside a tap (a phone refuses
// audio started anywhere else) and reused afterwards. Every sound is
// synthesised: the rig ships no audio files.
let audioCtx = null;
let volume = 70;

export function setVolume(percent) {
  volume = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
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

// A short synthesised blip. Silent at volume 0 and when no context could be
// started, which is the graceful case on a device that refuses audio.
export function tone(kind = 'tick') {
  if (!audioCtx || volume <= 0) return;
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

/* ── The joystick mapping ───────────────────────────────────────────────── */

// The actions a joystick has, in the order the Keyboard window lists them.
export const ACTIONS = [
  { key: 'up', label: 'Joystick up' },
  { key: 'down', label: 'Joystick down' },
  { key: 'left', label: 'Joystick left' },
  { key: 'right', label: 'Joystick right' },
  { key: 'confirm', label: 'Joystick button one' },
  { key: 'second', label: 'Joystick button two' },
];

export const DEFAULT_BINDINGS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  confirm: 'Enter',
  second: 'Space',
};

// A physical key's own name, as the Keyboard window shows it. Space and the
// arrows read better as words than as KeyboardEvent.key's raw value.
export function keyLabel(key) {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key.replace('Arrow', 'Arrow ');
}

// Which action a pressed key fires, or null. The mapping is what makes the
// Keyboard window's mapper actually drive the games.
export function actionFor(bindings, key) {
  const map = Object.assign({}, DEFAULT_BINDINGS, bindings || {});
  const hit = ACTIONS.find((a) => map[a.key] === key);
  return hit ? hit.key : null;
}

// Which actions already hold a key: the Keyboard window's conflict check.
export function conflictsFor(bindings, action, key) {
  const map = Object.assign({}, DEFAULT_BINDINGS, bindings || {});
  return ACTIONS.filter((a) => a.key !== action && map[a.key] === key).map((a) => a.label);
}

/* ── The how-to-play screen ─────────────────────────────────────────────── */

// A game's tutorial, as its own screen and its own address (#/how/<id>), so a
// reviewer can reach it and the check for it runs the real code path.
export function renderHowTo(game, { onBack, onRun }) {
  if (!game) return null;
  return el('div', { class: 'rig-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': game.title + ' how to play', 'data-how-to': game.id },
    el('div', { class: 'rig-sheet-panel' },
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        el('button', { class: 'btn-secondary', type: 'button', text: 'Back to the rig', onclick: onBack }),
        el('button', { class: 'btn-primary', type: 'button', text: 'Start the game', onclick: onRun }),
      ),
      el('header', { class: 'flex flex-col gap-1' },
        el('p', { class: 'section-label', text: 'How to play' }),
        el('h2', { class: 'text-title', 'data-how-to-title': game.id, text: game.title }),
        el('p', { class: 'text-body text-muted', text: game.tagline }),
      ),
      el('p', { class: 'rig-print', text: 'RetroRig ' + game.year + ' | ' + game.genre }),
      el('p', { class: 'text-body', text: game.summary }),
      el('section', { class: 'card flex flex-col gap-3' },
        el('h3', { class: 'text-heading', text: 'Controls' }),
        el('ul', { class: 'list' },
          game.controls.map((c) => el('li', { class: 'list-row justify-between gap-3' },
            el('span', { class: 'text-body font-medium', text: c.keys }),
            el('span', { class: 'text-body text-muted', text: c.action }),
          )),
        ),
      ),
      game.howTo.map((block) => el('section', { class: 'card flex flex-col gap-2' },
        el('h3', { class: 'text-heading', text: block.heading }),
        block.lines.map((line) => el('p', { class: 'text-body text-muted', text: line })),
      )),
      el('p', { class: 'text-small text-muted', text: 'The game is a simulation drawn by RetroRig. Nothing here is real machinery, and there is no violence, no weaponry and no betting anywhere in it.' }),
    ),
  );
}

/* ── The game host ──────────────────────────────────────────────────────── */

function readoutBlock(rows) {
  return el('div', { class: 'rig-readout', role: 'status', 'aria-live': 'polite' },
    rows.map((line) => el('div', { class: 'rig-print', text: line })),
  );
}

// Mount one built-in game. `state` is a snapshot to start from (a Memory Card
// slot) or null for a fresh run.
export function renderPlay(game, opts) {
  if (!game) return null;
  const {
    settings = {},
    bindings = {},
    state: saved = null,
    slot = null,
    onExit = () => {},
    onSave = () => {},
    onHowTo = () => {},
  } = opts || {};

  // Deepwatch reads the real clock, so a slower device does not change the
  // result. Mandate is turn-based and takes no time at all.
  const state = game.id === 'deepwatch'
    ? (saved ? loadDeepwatch(saved) : newDeepwatch())
    : (saved ? loadMandate(saved) : newMandate());

  const canvas = el('canvas', { class: 'rig-canvas', 'data-game-canvas': game.id });
  const screen = el('div', { class: 'rig-screen', 'data-game': game.id }, canvas);
  const readout = el('div', { class: 'flex flex-col gap-3' });
  const secondary = el('div', { class: 'flex flex-wrap gap-2' });
  let exit = () => {};

  function rows() {
    return game.id === 'deepwatch' ? deepwatchReadout(state) : mandateReadout(state);
  }

  function messageRow() {
    return el('div', { class: 'flex flex-wrap items-center gap-2' },
      el('span', { class: 'rig-sim', text: 'Simulated readout' }),
      el('span', { class: 'text-small text-muted', text: state.message }),
    );
  }

  function paintReadout() {
    readout.replaceChildren(readoutBlock(rows()), messageRow());
  }

  function paintSecondary() {
    const nodes = [
      el('button', { class: 'btn-secondary', type: 'button', text: 'How to play', onclick: onHowTo }),
      el('button', {
        class: 'btn-secondary', type: 'button', text: slot ? 'Save to slot ' + slot : 'Save to a Memory Card slot',
        onclick: () => { onSave(state); },
      }),
    ];
    if (game.id === 'mandate') {
      for (const key of ['granary', 'dike', 'road']) {
        nodes.push(el('button', {
          class: 'btn-secondary', type: 'button',
          text: 'Build ' + key + ' (' + developmentCost(key) + ')',
          onclick: () => {
            unlockAudio();
            if (mandateDevelop(state, key)) { tone('confirm'); paint(); }
            else tone('deny');
          },
        }));
      }
      nodes.push(el('button', {
        class: 'btn-secondary', type: 'button', text: 'Send officer',
        onclick: () => {
          unlockAudio();
          if (mandateOfficer(state, state.selected)) { tone('confirm'); paint(); }
          else tone('deny');
        },
      }));
    }
    secondary.replaceChildren(...nodes);
  }

  let previousTurn = state.turn;
  function paint() {
    paintReadout();
    paintSecondary();
    paintEnd();
  }

  // A finished run shows its own line and a way to start again. It is the
  // one place a game ends, so it is where the tone for an ending plays.
  const endBlock = el('div', { class: 'flex flex-col gap-2' });
  function paintEnd() {
    if (!state.ended) { endBlock.replaceChildren(); return; }
    const won = state.ended === 'complete' || state.ended === 'renewed';
    endBlock.replaceChildren(
      el('p', { class: 'text-heading ' + (won ? 'text-accent' : 'text-danger'), 'data-outcome': state.ended,
        text: won ? 'Patrol complete' : game.id === 'mandate' ? 'Mandate lapsed' : 'Patrol recalled' }),
      el('p', { class: 'text-body text-muted', text: state.message }),
      el('button', {
        class: 'btn-secondary', type: 'button', text: 'Start a fresh run',
        onclick: () => {
          const fresh = game.id === 'deepwatch' ? newDeepwatch() : newMandate();
          Object.assign(state, fresh);
          paint();
        },
      }),
    );
  }

  // Pointer input, so the rig is playable on a phone with no keyboard.
  canvas.addEventListener('pointerdown', (event) => {
    unlockAudio();
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 320);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 200);
    if (game.id === 'deepwatch') {
      // Steer toward the point tapped on the plot.
      const cx = 160;
      const cy = 112;
      const deg = Math.atan2(y - cy, x - cx) * (180 / Math.PI) + 90;
      state.heading = ((Math.round(deg) % 360) + 360) % 360;
      state.message = 'Rudder to ' + state.heading + ' degrees.';
    } else {
      const provinces = mandateProvinces(state);
      const hit = provinces.find((p) => Math.abs(p.x - x) <= 16 && Math.abs(p.y - y) <= 16);
      if (hit) {
        state.selected = hit.id;
        state.message = 'Looking at ' + hit.name + '.';
      }
    }
    tone('tick');
    draw();
    picture.present();
    paint();
  });

  // Keyboard input, routed through the joystick mapping so the Keyboard
  // window's mapper changes how the games are played.
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = actionFor(bindings, event.key);
    const handled = game.id === 'deepwatch'
      ? deepwatchKey(state, mappedKey(action) || event.key)
      : mandateKey(action, event.key);
    if (!handled) return;
    event.preventDefault();
    unlockAudio();
    if (state.turn !== previousTurn) { previousTurn = state.turn; tone('ping'); }
    draw();
    picture.present();
    paint();
  }

  // The physical key an action is mapped to, as games.js understands it.
  function mappedKey(action) {
    if (action === 'left') return 'ArrowLeft';
    if (action === 'right') return 'ArrowRight';
    if (action === 'up') return 'ArrowUp';
    if (action === 'down') return 'ArrowDown';
    if (action === 'confirm') return 'Enter';
    if (action === 'second') return ' ';
    return null;
  }

  function mandateKey(action, rawKey) {
    const provinces = mandateProvinces(state);
    const at = provinces.findIndex((p) => p.id === state.selected);
    if (action === 'left' || action === 'up') {
      state.selected = provinces[(at + provinces.length - 1) % provinces.length].id;
      state.message = 'Looking at ' + provinces[(at + provinces.length - 1) % provinces.length].name + '.';
      return true;
    }
    if (action === 'right' || action === 'down') {
      state.selected = provinces[(at + 1) % provinces.length].id;
      state.message = 'Looking at ' + provinces[(at + 1) % provinces.length].name + '.';
      return true;
    }
    if (action === 'confirm') return mandateEndSeason(state);
    if (action === 'second') return mandateOfficer(state, state.selected);
    if (/^[edtEDT]$/.test(rawKey || '')) {
      return mandateDevelop(state, rawKey.toLowerCase() === 'e' ? 'granary' : rawKey.toLowerCase() === 'd' ? 'dike' : 'road');
    }
    if (/^[1-7]$/.test(rawKey || '')) {
      const p = provinces[Number(rawKey) - 1];
      if (p) {
        state.selected = p.id;
        return mandateOfficer(state, p.id);
      }
    }
    return false;
  }

  const picture = createPicture(canvas);

  // One funnel for painting the picture, so every input path ends the same
  // way: redraw the backbuffer, then present it through the CRT pipeline.
  function draw() {
    if (game.id === 'deepwatch') drawDeepwatch(picture, state);
    else drawMandate(picture, state);
  }

  const stop = startLoop(
    picture,
    (dt) => { if (game.id === 'deepwatch') stepDeepwatch(state, dt); },
    () => { draw(); },
  );

  function applySettings(next) {
    picture.applySettings(next);
    picture.resize();
    picture.present();
    setVolume(next && next.volume);
  }
  applySettings(settings);

  const root = el('section', { class: 'flex flex-col gap-4', 'data-playing': game.id },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      el('div', { class: 'flex flex-wrap gap-2' },
        el('button', { class: 'btn-secondary', type: 'button', text: 'Back to the rig', onclick: () => exit() }),
        el('button', { class: 'btn-secondary', type: 'button', text: 'How to play', onclick: onHowTo }),
      ),
      el('span', { class: 'rig-sim', text: 'Simulated screen' }),
    ),
    el('header', { class: 'flex flex-col gap-1' },
      el('p', { class: 'section-label', text: 'RetroRig ' + game.year }),
      el('h2', { class: 'text-title', 'data-play-title': game.id, text: game.title }),
      el('p', { class: 'text-body text-muted', text: game.genre }),
    ),
    screen,
    readout,
    secondary,
    endBlock,
    el('details', { class: 'card' },
      el('summary', { class: 'text-body', text: 'Picture and sound settings at work' }),
      describeSettings(picture.settings).map((line) => el('p', { class: 'rig-print mt-2', text: line })),
    ),
  );

  exit = onExit;
  paint();
  picture.resize();
  draw();
  picture.present();

  // Watch the glass for resizes: a phone rotation or a desktop window change
  // re-measures the picture so the screen never scrolls sideways.
  const onResize = () => { picture.resize(); draw(); picture.present(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (observer) observer.observe(screen);

  return {
    el: root,
    stop() {
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      if (observer) observer.disconnect();
    },
    applySettings,
    state,
  };
}
