// QuestVerse client app.
//
// One HTML shell, these screens off the URL hash:
//   #/                  the Arcade catalog
//   #/title/<titleId>   a title's Details (the drawer as its own address)
//   #/play/<titleId>    the Runner (?demo=1 opens a fixed mid-run state)
//   #/admin             the Creator Studio (publish, edit and remove listings)
//   #/embed/<listingId> a listing's embed source, previewed
//
// Progress, achievements and the Creator Studio's listings live in
// localStorage, namespaced per signed-in person when /api/me answers and per
// browser otherwise. No server state.

import { CATALOG, findTitle, demoState } from './catalog.js';
import {
  createRun, applyChoice, applyCustom, renderBlock, titleStatus,
  achievementsFor,
} from './engine.js';
import { el } from './dom.js';
import {
  DEFAULT_LISTINGS, loadListings, findListing, renderAdmin, renderEmbed,
} from './admin.js';
import {
  DEFAULT_THEME, isTheme, themeName, applyTheme, cachedTheme, cacheTheme,
} from './themes.js';
import {
  triggerKey, preloadTitle, playUrl, stopMusic, setMuted, isMuted,
} from './music.js';

const app = document.getElementById('app');
const token = new URLSearchParams(window.location.search).get('token') || '';

/* ── Storage ─────────────────────────────────────────────────────────────
 * Everything is namespaced qv1:<uid>:... and versioned with v so the shape
 * can migrate. A browser that refuses storage still plays; we say so once.
 */
const NS = 'qv1';
let uid = 'anon';
// Only the allowed Homeroom account may open the Creator Studio. The flag
// comes from the server (it authorises from the verified iframe token's
// username), never from storage or the client, so it cannot be spoofed here.
let studio = false;
let storageOk = true;
let warnedAboutStorage = false;
// The seasonal theme live for every player. Start from the last one this
// browser saw, then take the server's answer in loadIdentity().
let liveTheme = cachedTheme();
applyTheme(liveTheme);

function lsGet(key) {
  if (!storageOk) return null;
  try {
    const raw = window.localStorage.getItem(NS + ':' + uid + ':' + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  if (!storageOk) return;
  try {
    window.localStorage.setItem(NS + ':' + uid + ':' + key, JSON.stringify(value));
  } catch {
    storageOk = false;
    noteStorage();
  }
}

function lsDel(key) {
  if (!storageOk) return;
  try { window.localStorage.removeItem(NS + ':' + uid + ':' + key); } catch { /* ignore */ }
}

// In-memory fallback so a run still works when storage is refused.
const memory = new Map();
const memGet = (k) => (memory.has(k) ? memory.get(k) : null);
const memSet = (k, v) => memory.set(k, v);

function progressKey(titleId) { return 'progress:' + titleId; }
function getProgress(titleId) {
  const p = lsGet(progressKey(titleId));
  if (p) return p;
  return storageOk ? null : memGet(progressKey(titleId));
}
function setProgress(titleId, state) {
  const copy = Object.assign({}, state);
  lsSet(progressKey(titleId), copy);
  memSet(progressKey(titleId), copy);
}
function clearProgress(titleId) {
  lsDel(progressKey(titleId));
  memory.delete(progressKey(titleId));
}

const GLOBAL_ACHIEVEMENTS = [
  { key: 'arcade-explorer', label: 'Arcade Explorer', hint: 'Open all five titles.' },
];

function getUnlocked() { return lsGet('achievements') || {}; }
function unlock(keys) {
  if (!keys.length) return [];
  const unlocked = getUnlocked();
  const fresh = [];
  for (const k of keys) {
    if (!unlocked[k]) { unlocked[k] = Date.now(); fresh.push(k); }
  }
  if (fresh.length) lsSet('achievements', unlocked);
  return fresh;
}
function getSeen() { return lsGet('seen') || {}; }
function markSeen(titleId) {
  const seen = getSeen();
  seen[titleId] = true;
  lsSet('seen', seen);
  const all = CATALOG.every((t) => seen[t.id]);
  if (all) return unlock(['arcade-explorer']);
  return [];
}

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function noteStorage() {
  if (warnedAboutStorage) return;
  warnedAboutStorage = true;
  toast('Progress will not be saved in this browser.');
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// The published catalog: the built-in titles plus anything the Creator
// Studio has stored. Reloaded whenever the admin screen changes a listing.
let listings = DEFAULT_LISTINGS;
function reloadListings() { listings = loadListings(uid); }

/* ── Key art ─────────────────────────────────────────────────────────────
 * Drawn in the app's own colours (currentColor + tokens). One motif per
 * built-in title, chosen by its index. A listing that carries a banner
 * shows it instead; built-in titles ship no banner, so they keep the art.
 */
function artSvg(listing) {
  const motifs = [
    // jungle ridge
    '<path d="M0 62 L28 30 L46 50 L70 18 L100 62 Z" fill="currentColor" opacity="0.55"/>' +
    '<circle cx="78" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="2"/>',
    // village gate and shroud
    '<path d="M18 64 V34 h22 v30" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M62 20 c10 0 16 9 16 20 v24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.6"/>' +
    '<path d="M52 64 V40 h20 v24" fill="none" stroke="currentColor" stroke-width="2"/>',
    // chip and signal
    '<rect x="30" y="22" width="40" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M40 30 v18 M50 30 v18 M60 30 v18" stroke="currentColor" stroke-width="2" opacity="0.6"/>' +
    '<path d="M6 39 h16 M78 39 h16" stroke="currentColor" stroke-width="2"/>',
    // ship and airlock
    '<path d="M20 44 L84 24 L70 52 L34 58 Z" fill="none" stroke="currentColor" stroke-width="2" opacity="0.7"/>' +
    '<circle cx="52" cy="42" r="6" fill="none" stroke="currentColor" stroke-width="2"/>',
    // tablet and strata
    '<rect x="34" y="16" width="32" height="44" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M40 28 h20 M40 36 h20 M40 44 h12" stroke="currentColor" stroke-width="2" opacity="0.6"/>',
  ];
  const i = DEFAULT_LISTINGS.findIndex((t) => t.id === listing.id);
  return '<svg viewBox="0 0 100 72" class="h-16 w-full text-accent" aria-hidden="true" fill="none">' +
    motifs[(i + motifs.length) % motifs.length] + '</svg>';
}

function keyArt(listing) {
  const wrap = el('div', { class: 'card-art', html: artSvg(listing) });
  if (listing.banner) {
    const img = el('img', {
      class: 'card-art-img', src: listing.banner, alt: '',
      onerror: () => { img.remove(); },
    });
    wrap.append(img);
  }
  return wrap;
}

/* ── Arcade ────────────────────────────────────────────────────────────── */
function statusPill(listing) {
  const builtIn = findTitle(listing.id);
  if (!builtIn) return el('span', { class: 'status-pill text-muted', 'data-status': 'not-started', text: 'Not started' });
  const progress = getProgress(listing.id);
  const status = titleStatus(builtIn, progress && progress.started ? progress : null);
  const tone = status.key === 'completed'
    ? (progress && progress.outcome === 'win' ? 'border-accent text-accent' : 'border-danger text-danger')
    : (status.key === 'in-progress' ? 'border-signal text-signal' : 'text-muted');
  return el('span', { class: 'status-pill ' + tone, 'data-status': status.key, text: status.label });
}

function tagList(listing) {
  return String(listing.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
}

function gameNav(active) {
  const tab = (label, href, key) => el('a', {
    class: 'tab' + (active === key ? ' tab-active' : ''),
    href,
    'aria-current': active === key ? 'page' : null,
    text: label,
  });
  const tabs = [tab('Arcade', '#/', 'arcade')];
  // The Creator Studio tab is hidden from everyone but the allowed account.
  if (studio) tabs.push(tab('Creator Studio', '#/admin', 'admin'));
  return el('nav', { class: 'tabs', 'aria-label': 'Views' },
    tabs,
    el('span', { class: 'status-pill text-muted', 'data-count': listings.length, text: String(listings.length) }),
  );
}

function renderArcade() {
  const cards = listings.map((listing) => {
    const builtIn = findTitle(listing.id);
    const progress = getProgress(listing.id);
    const started = !!(progress && progress.started);
    const running = started && !progress.finished;
    const primary = builtIn
      ? { href: '#/play/' + listing.id, text: running ? 'Resume' : 'Run', action: running ? 'resume' : 'run' }
      : { href: '#/embed/' + listing.id, text: 'Play', action: 'play' };
    return el('article', { class: 'card flex flex-col gap-3', 'data-title-id': listing.id },
      keyArt(listing),
      el('div', { class: 'flex flex-col gap-1' },
        el('h2', { class: 'text-heading', text: listing.title }),
        el('p', { class: 'text-body text-muted', text: listing.tagline }),
      ),
      el('div', { class: 'flex flex-wrap gap-2' }, tagList(listing).map((t) => el('span', { class: 'tag', text: t }))),
      el('div', {}, statusPill(listing)),
      el('div', { class: 'mt-auto flex flex-wrap gap-2' },
        el('a', {
          class: 'btn-primary',
          href: primary.href,
          text: primary.text,
          'data-action': primary.action,
        }),
        el('a', {
          class: 'btn-secondary',
          href: '#/title/' + listing.id,
          text: 'Details',
          'data-action': 'details',
        }),
      ),
    );
  });

  return el('main', { class: 'mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10' },
    gameNav('arcade'),
    el('header', { class: 'flex flex-col gap-2' },
      el('p', { class: 'section-label', text: 'Arcade' }),
      el('h1', { class: 'text-title', text: 'QuestVerse' }),
      el('p', { class: 'text-body text-muted', text: 'Text adventures. Pick a title and play it right here.' }),
      liveTheme !== DEFAULT_THEME
        ? el('span', { class: 'status-pill w-fit border-accent text-accent', 'data-event-theme': liveTheme, text: themeName(liveTheme) + ' event' })
        : null,
    ),
    cards.length
      ? el('section', { class: 'arcade grid gap-4 sm:grid-cols-2' }, cards)
      : el('p', { class: 'state-empty text-body text-muted', text: 'No games are published. Open the Creator Studio to add one.' }),
  );
}

/* ── Details drawer ────────────────────────────────────────────────────── */
function renderNotFound() {
  return el('main', { class: 'mx-auto flex max-w-md flex-col gap-8 px-4 py-10' },
    el('h1', { class: 'text-title', text: 'Title not found' }),
    el('p', { class: 'text-body text-muted', text: 'That title is not in the Arcade.' }),
    el('div', {}, el('a', { class: 'btn-primary', href: '#/', text: 'Back to Arcade' })),
  );
}

// Reached when someone other than the allowed account opens #/admin. The
// Creator Studio tab is hidden for them, so this only shows on a direct
// visit to the URL.
function renderNotAuthorised() {
  return el('main', { class: 'mx-auto flex max-w-md flex-col gap-8 px-4 py-10' },
    el('h1', { class: 'text-title', 'data-unauthorised': 'studio', text: 'Not authorised' }),
    el('p', { class: 'text-body text-muted', text: 'The Creator Studio is private to this account.' }),
    el('div', {}, el('a', { class: 'btn-primary', href: '#/', text: 'Back to Arcade' })),
  );
}

function detailList(rows) {
  return el('ul', { class: 'list' }, rows.map(([label, value]) => el('li', { class: 'list-row justify-between' },
    el('span', { class: 'text-body', text: label }),
    el('span', { class: 'text-body text-muted', text: value }),
  )));
}

function splitItems(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function renderDetails(listing, builtIn, onClose) {
  // Move focus into the dialog on open; return it to whatever opened the
  // drawer when it closes (spec: the drawer is a real dialog).
  const opener = document.activeElement;
  const close = () => {
    if (opener && opener.focus) { try { opener.focus(); } catch { /* ignore */ } }
    onClose();
  };
  const progress = getProgress(listing.id);
  const status = builtIn && progress && progress.started
    ? titleStatus(builtIn, progress)
    : { key: 'not-started', label: 'Not started' };
  const unlocked = getUnlocked();
  const running = progress && progress.started && !progress.finished;
  const primary = builtIn
    ? { href: '#/play/' + listing.id, text: running ? 'Resume' : 'Run' }
    : { href: '#/embed/' + listing.id, text: 'Play' };
  let confirming = false;

  const resetRow = el('div', { class: 'flex flex-wrap items-center gap-2' });

  function paintReset() {
    resetRow.replaceChildren();
    if (!progress || !progress.started) {
      resetRow.append(el('span', { class: 'text-small text-muted', text: 'No progress saved for this title.' }));
      return;
    }
    if (!confirming) {
      resetRow.append(el('button', {
        class: 'btn-secondary', type: 'button', text: 'Reset progress',
        onClick: () => { confirming = true; paintReset(); },
      }));
      return;
    }
    resetRow.append(
      el('span', { class: 'text-small text-muted', text: 'Reset your progress for this title?' }),
      el('button', {
        class: 'btn-secondary', type: 'button', text: 'Confirm reset',
        onClick: () => { clearProgress(title.id); confirming = false; onClose(); }
      }),
      el('button', {
        class: 'btn-secondary', type: 'button', text: 'Cancel',
        onClick: () => { confirming = false; paintReset(); },
      }),
    );
  }
  paintReset();

  const body = el('div', { class: 'flex flex-col gap-6' },
    el('div', { class: 'flex items-start justify-between gap-3' },
      el('div', { class: 'flex flex-col gap-1' },
        el('p', { class: 'section-label', text: 'Title details' }),
        el('h2', { class: 'text-title', text: listing.title }),
        el('p', { class: 'text-body text-muted', text: listing.tagline }),
      ),
      el('button', {
        class: 'btn-secondary', type: 'button', text: 'Close', 'aria-label': 'Close details',
        onClick: close,
      }),
    ),
    el('div', { class: 'flex flex-wrap items-center gap-2' },
      tagList(listing).map((t) => el('span', { class: 'tag', text: t })),
      el('span', { class: 'status-pill ' + (status.key === 'completed' ? 'border-accent text-accent' : 'text-muted'), text: status.label }),
    ),
    el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: builtIn ? 'Lore' : 'Story' }),
      el('p', { class: 'text-body', text: builtIn ? builtIn.lore : listing.story }),
      builtIn ? el('p', { class: 'text-body text-muted', text: builtIn.background }) : null,
    ),
    builtIn ? el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: 'State variables' }),
      detailList(builtIn.stateVars.map((v) => [v.label, v.value])),
    ) : el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: 'Starting scene' }),
      el('p', { class: 'state-block', text: listing.startScene }),
    ),
    splitItems(listing.inventory).length ? el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: 'Starting inventory' }),
      el('ul', { class: 'list' }, splitItems(listing.inventory).map((i) => el('li', { class: 'list-row', text: i }))),
    ) : null,
    builtIn ? el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: 'Stages' }),
      el('ol', { class: 'list' }, builtIn.stageNames.map((s, i) => el('li', { class: 'list-row gap-3' },
        el('span', { class: 'text-small text-muted', text: 'Stage ' + (i + 1) }),
        el('span', { class: 'text-body', text: s }),
      ))),
    ) : null,
    builtIn ? el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: 'Achievements' }),
      el('ul', { class: 'list' }, builtIn.achievements.map((a) => {
        const got = !!unlocked[a.key];
        return el('li', { class: 'list-row items-start gap-3' },
          el('span', { class: 'mt-0.5 text-small ' + (got ? 'text-accent' : 'text-muted'), text: got ? 'Earned' : 'Locked' }),
          el('div', {},
            el('p', { class: 'text-body font-medium', text: a.label }),
            el('p', { class: 'text-small text-muted', text: a.hint }),
          ),
        );
      })),
    ) : null,
    el('section', { class: 'flex flex-col gap-2' },
      el('h3', { class: 'section-label', text: builtIn ? 'Progress' : 'Listing' }),
      builtIn ? resetRow : el('p', { class: 'text-small text-muted', text: 'Embed source: ' + listing.embedUrl }),
    ),
    el('p', { class: 'text-small text-muted', text: 'Publisher: ' + listing.author + (builtIn ? ' | Version ' + builtIn.version : '') }),
    el('div', { class: 'flex flex-wrap gap-2' },
      el('a', { class: 'btn-primary', href: primary.href, text: primary.text, 'data-action': 'run' }),
    ),
  );

  const panel = el('aside', {
    class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': listing.title + ' details',
  }, body);

  const backdrop = el('div', { class: 'sheet-backdrop', onClick: close });

  return el('div', {}, [backdrop, panel]);
}

/* ── Runner ────────────────────────────────────────────────────────────── */
let runner = null; // { title, state, demo, resumeBanner }
let typeToken = 0;   // cancels an in-flight typewriter when the runner repaints

function saveRunner() {
  if (!runner || runner.demo) return;
  runner.state.started = true;
  setProgress(runner.title.id, runner.state);
}

// Types one line out, character by character. Cancelled by bumping typeToken.
// A viewer who prefers reduced motion gets the whole line at once.
function typeInto(node, text) {
  if (reducedMotion.matches) { node.textContent = text; return; }
  const my = ++typeToken;
  node.textContent = '';
  let i = 0;
  (function step() {
    if (my !== typeToken) return;
    node.textContent = text.slice(0, i++);
    if (i <= text.length) setTimeout(step, 16);
  })();
}

function afterAction(nextState) {
  runner.resumeBanner = null;
  runner.state = nextState;
  const earned = achievementsFor(runner.title, nextState, nextState.finished ? nextState.outcome : 'move');
  const fresh = unlock(earned);
  if (fresh.length) {
    const title = runner.title;
    const a = title.achievements.find((x) => x.key === fresh[0]);
    if (a) toast('Achievement unlocked: ' + a.label);
  }
  saveRunner();
  paintRunner();
}

function paintRunner() {
  const { title, state, demo } = runner;
  const screen = document.getElementById('runner-screen');
  if (!screen) return;

  const stage = title.stages[state.stageIndex];
  const terminal = state.outcome;
  const blockLines = renderBlock(title, state);

  const stateBlock = el('div', { class: 'state-block', role: 'status', 'aria-live': 'polite' },
    blockLines.map((line) => el('div', { text: line })));

  const log = el('div', { class: 'flex flex-col gap-3', 'data-testid': 'transcript' });
  const entries = state.transcript;
  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    let cls = 'log-line text-signal';
    let text = entry.text;
    if (entry.kind === 'scene') cls = 'log-line text-fg';
    else if (entry.kind === 'action') { cls = 'log-line text-small text-muted'; text = '> ' + entry.text; }
    else if (entry.kind === 'win') cls = 'log-line text-accent';
    else if (entry.kind === 'lose') cls = 'log-line text-danger';
    const p = el('p', { class: cls });
    log.append(p);
    // Only the newest scene types itself out; everything already read is
    // instant, so a check or a re-render never waits on the animation.
    if (isLast && entry.kind === 'scene' && !terminal) typeInto(p, text);
    else p.textContent = text;
  });

  const banner = runner.resumeBanner
    ? el('section', { class: 'card flex flex-wrap items-center justify-between gap-3' },
        el('p', { class: 'text-body', text: 'You left off at Stage ' + (runner.resumeBanner.stageIndex + 1) + '.' }),
        el('div', { class: 'flex gap-2' },
          el('button', {
            class: 'btn-primary', type: 'button', text: 'Resume',
            onClick: () => { runner.resumeBanner = null; paintRunner(); },
          }),
          el('button', {
            class: 'btn-secondary', type: 'button', text: 'Start over',
            onClick: () => { stopMusic(); runner.resumeBanner = null; runner.state = createRun(title); saveRunner(); paintRunner(); },
          }),
        ),
      )
    : null;

  const header = el('header', { class: 'flex flex-col gap-3' },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      el('a', { class: 'btn-secondary', href: '#/', text: 'Back to Arcade' }),
      el('div', { class: 'flex gap-2' },
        runner.music && runner.music.size
          ? el('button', {
            class: 'btn-secondary', type: 'button', 'data-music-toggle': '',
            text: isMuted() ? 'Music off' : 'Music on', 'aria-pressed': isMuted() ? 'false' : 'true',
            onClick: () => { setMuted(!isMuted()); paintRunner(); },
          })
          : null,
        el('button', {
          class: 'btn-secondary', type: 'button', text: 'Restart',
          onClick: () => { stopMusic(); runner.state = createRun(title); saveRunner(); paintRunner(); },
        }),
      ),
    ),
    el('div', { class: 'flex flex-col gap-1' },
      el('p', { class: 'section-label', text: demo ? 'Demo run' : 'Stage ' + (state.stageIndex + 1) + ' of ' + title.stages.length }),
      el('h1', { class: 'text-title', text: title.title }),
    ),
    stateBlock,
  );

  let choicesArea;
  if (terminal) {
    choicesArea = el('section', { class: 'flex flex-col gap-3' },
      el('p', { class: 'text-heading ' + (terminal === 'win' ? 'text-accent' : 'text-danger'),
        text: terminal === 'win' ? 'Victory' : 'Game over' }),
      el('div', { class: 'flex flex-wrap gap-2' },
        el('button', {
          class: 'btn-primary', type: 'button', text: 'Play again',
          onClick: () => { stopMusic(); runner.state = createRun(title); saveRunner(); paintRunner(); },
        }),
        el('a', { class: 'btn-secondary', href: '#/', text: 'Back to Arcade' }),
      ),
    );
  } else {
    const choiceButtons = stage.choices.map((c) => el('button', {
      class: 'choice', type: 'button', 'data-choice': c.key,
      onClick: (e) => {
        if (runner.busy || runner.state.finished) return;
        runner.busy = true;
        // The choice is an action trigger: if the creator gave it a track,
        // that track takes over now, inside the tap so phones allow it.
        const key = triggerKey(title.id, runner.state.stageIndex, c.key);
        const track = runner.music && runner.music.get(key);
        if (track) playUrl(key, track);
        const next = applyChoice(title, runner.state, c.key);
        runner.busy = false;
        afterAction(next);
        // A slow double tap can reach a button that has already been
        // replaced; blur it so the same key cannot fire twice.
        try { e.currentTarget.blur(); } catch {}
      },
    },
      el('span', { class: 'choice-key', text: c.key }),
      el('span', { class: 'flex-1', text: c.text }),
    ));

    const input = el('input', {
      class: 'field flex-1', type: 'text', id: 'custom-action',
      placeholder: 'Type your own action', 'aria-label': 'Custom action',
    });
    const submit = el('button', {
      class: 'btn-secondary shrink-0 whitespace-nowrap', type: 'button', text: 'Do it', disabled: 'disabled',
      onClick: () => {
        const text = input.value.trim();
        if (!text || runner.busy) return;
        runner.busy = true;
        const next = applyCustom(title, runner.state, text);
        runner.busy = false;
        input.value = '';
        submit.setAttribute('disabled', 'disabled');
        afterAction(next);
      },
    });
    input.addEventListener('input', () => {
      if (input.value.trim()) submit.removeAttribute('disabled');
      else submit.setAttribute('disabled', 'disabled');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });

    choicesArea = el('section', { class: 'flex flex-col gap-3' },
      el('h2', { class: 'section-label', text: 'What do you do?' }),
      el('div', { class: 'flex flex-col gap-2' }, choiceButtons),
      el('div', { class: 'flex flex-col gap-2' },
        el('label', { class: 'text-small text-muted', for: 'custom-action', text: 'Custom action' }),
        el('div', { class: 'flex gap-2' }, input, submit),
      ),
    );
  }

  screen.replaceChildren(...[banner, header, log, choicesArea].filter(Boolean));
}

function renderRunner(title, params) {
  const demo = params.get('demo') === '1';
  const fresh = demo ? demoState(title) : createRun(title);
  const saved = demo ? null : getProgress(title.id);
  runner = { title, state: fresh, demo, resumeBanner: null, music: new Map() };
  // Resolve the title's tracks now, so a choice tap can start one at once.
  const mine = runner;
  preloadTitle(uid, title).then((m) => {
    if (runner !== mine) return;
    const had = mine.music.size;
    mine.music = m;
    if (!had && m.size) paintRunner();
  }).catch(() => {});

  const screen = el('main', { id: 'runner-screen', class: 'mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8' });

  // Resume prompt: a saved, unfinished run exists and the route was not
  // asked for a demo state. Load it, then offer Resume / Start over.
  if (saved && saved.started && !saved.finished && !demo) {
    runner.state = saved;
    runner.resumeBanner = saved;
  } else {
    runner.resumeBanner = null;
  }

  screen.dataset.titleId = title.id;
  return screen;
}

/* ── Router ────────────────────────────────────────────────────────────── */
let drawerPanel = null;

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const qIndex = raw.indexOf('?');
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function closeDrawer() {
  window.location.hash = '#/';
}

function route() {
  const { parts, params } = parseHash();
  if (parts[0] === 'play') {
    const title = findTitle(parts[1]);
    if (!title) { app.replaceChildren(renderNotFound()); return; }
    app.replaceChildren(renderRunner(title, params));
    paintRunner();
    return;
  }
  if (parts[0] === 'admin') {
    // Server-side flag only: another account cannot open the studio even by
    // typing the URL.
    if (!studio) { app.replaceChildren(renderNotAuthorised()); return; }
    app.replaceChildren(renderAdmin({
      uid,
      token,
      liveTheme,
      onThemeChange: (id) => { liveTheme = id; cacheTheme(id); },
      nav: gameNav('admin'),
      onCountChange: (n) => {
        reloadListings();
        const badge = document.querySelector('[data-count]');
        if (badge) { badge.textContent = String(n); badge.dataset.count = String(n); }
      },
    }));
    return;
  }
  if (parts[0] === 'embed') {
    const listing = findListing(listings, parts[1]);
    if (!listing) { app.replaceChildren(renderNotFound()); return; }
    app.replaceChildren(renderEmbed(listing, { onBack: () => closeDrawer(), nav: gameNav(null), studio }));
    return;
  }
  if (parts[0] === 'title') {
    const listing = findListing(listings, parts[1]);
    const builtIn = findTitle(parts[1]);
    const earned = builtIn ? markSeen(builtIn.id) : [];
    if (earned.length) toast('Achievement unlocked: Arcade Explorer');
    // Arcade underneath, details drawer over it.
    const arcade = renderArcade();
    app.replaceChildren(arcade);
    if (listing) {
      drawerPanel = renderDetails(listing, builtIn, closeDrawer);
      app.append(drawerPanel);
      const first = drawerPanel.querySelector('button, [href], input');
      if (first) { try { first.focus({ preventScroll: true }); } catch { /* ignore */ } }
    } else {
      app.replaceChildren(renderNotFound());
    }
    return;
  }
  app.replaceChildren(renderArcade());
}

/* ── Boot ──────────────────────────────────────────────────────────────── */
async function loadIdentity() {
  // Only ask when the platform handed us a token. Standalone and offline
  // loads have none, and a tokenless request would just 401 into the
  // console; there the store stays in the shared 'anon' namespace.
  if (token) {
    try {
      const res = await fetch('/api/me', { headers: { 'x-usernode-token': token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const me = await res.json();
      if (me && me.id != null) uid = String(me.id);
      studio = !!(me && me.studio);
      if (me && isTheme(me.theme)) {
        liveTheme = me.theme;
        cacheTheme(liveTheme);
        applyTheme(liveTheme);
      }
    } catch {
      uid = 'anon';
      studio = false;
    }
  }
  try {
    const probe = '__qv_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    storageOk = false;
    if (!warnedAboutStorage) {
      warnedAboutStorage = true;
      setTimeout(() => toast('Progress will not be saved in this browser.'), 400);
    }
  }
}

window.addEventListener('hashchange', (e) => {
  // A new navigation clears an open runner.
  if (runner && !window.location.hash.startsWith('#/play/')) runner = null;
  // Music belongs to one run (or one studio preview); leaving the screen
  // ends it.
  stopMusic();
  if (drawerPanel && !window.location.hash.startsWith('#/title/')) drawerPanel = null;
  // A theme picked in the Creator Studio but not applied is a preview for
  // that screen only; anywhere else shows the live theme.
  applyTheme(liveTheme);
  route();
  if (e.type === 'hashchange') window.scrollTo(0, 0);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawerPanel) closeDrawer();
});

loadIdentity().then(() => {
  reloadListings();
  route();
});
