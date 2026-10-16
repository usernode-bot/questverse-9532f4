// Pixmotion AI client app.
//
// One HTML shell, these screens off the URL hash:
//   #/studio                  the editor (also the default route)
//   #/studio/library?q=       the editor with the library's search applied
//   #/studio/clips/<id>       the editor with that media row selected
//   #/studio/inspector/<tab>  the editor with that inspector tab showing
//   #/studio/timeline         the editor, scrolled to the timeline
//   #/studio/assistant        the editor, scrolled to the assistant widget
//   #/studio/export           the editor with the simulated export panel open
//   #/studio/generate/<kind>  the editor with a simulated generation panel open
//   #/about                   what the studio is and what in it is simulated
//
// Everything the app keeps for a person lives on the server (server-api.js):
// the browser holds no per-user state. Image, avatar, video, sound and export
// generation are simulated and say so on screen. The assistant chat is the one
// real generation: the platform's text AI, under the reader's own grant.

import { el } from './dom.js';
import {
  setToken, loadStudio, startProject, saveProject, addMedia, removeMedia, saveMediaArt, saveTimeline,
  askAssistant, uploadsAvailable, uploadArt, ApiError,
} from './server-api.js';
import { renderStudio, APP_NAME, TABS } from './studio.js';
import { clampMs, movePlayhead, withTrim, nextSlot, timecodePair } from './timeline.js';
import { GENERATION_KINDS, placeholderTitle, SIM_LINE } from './generate.js';
import { readUsage, sendMessage, historyFor, MESSAGES } from './assistant.js';

const app = document.getElementById('app');
const token = new URLSearchParams(window.location.search).get('token') || '';
setToken(token);

/* ── The app's state ─────────────────────────────────────────────────────
 * One object, filled from GET /api/studio. Every screen reads it and every
 * write goes back to the server, so two surfaces never disagree about the
 * project.
 */
const studio = {
  ready: false,
  failure: null,
  username: '',
  signedIn: false,
  project: null,
  media: [],
  tracks: [],
  clips: [],
  transcript: [],
  sample: false,
  readOnly: false,
  readOnlyWrite: false,
  assistant: { enabled: false, model: null, lastSpentCents: null, lastCapCents: null },
  usage: null,
  uploads: false,
  selection: { mediaId: null, clipId: null },
  playhead: 0,
  playing: false,
  loop: false,
  tab: 'video',
  query: '',
  tool: 'select',
  voice: { voice: 'river', tone: 'warm', language: 'en' },
  instructions: '',
  sheet: { kind: null, options: null },
  chat: { busy: false, note: '', draft: '' },
  saving: false,
  undo: [],
  redo: [],
};

/* ── Small helpers ─────────────────────────────────────────────────────── */

let toastTimer = null;
// The platform's native kit owns the toast idiom (a capsule that never steals
// a tap). The app's own element is the fallback for a load without the kit.
function toast(message) {
  if (window.unNative && typeof window.unNative.toast === 'function') {
    try { window.unNative.toast(message); return; } catch { /* fall through */ }
  }
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

function apiMessage(err, fallback) {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Sign in to Homeroom to change anything in the studio.';
    return err.message || fallback;
  }
  return fallback;
}

function go(hash) {
  if (window.location.hash === hash) render();
  else window.location.hash = hash;
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const qIndex = raw.indexOf('?');
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

// Takes what the server answered into the state, keeping the selection and
// the playhead where they were when they still point at something.
function applyStudio(loaded) {
  studio.username = loaded.username || '';
  studio.signedIn = !!loaded.signedIn;
  studio.project = loaded.project;
  studio.media = loaded.media;
  studio.tracks = loaded.tracks;
  studio.clips = loaded.clips;
  studio.transcript = loaded.transcript;
  studio.sample = !!loaded.sample;
  studio.readOnly = !!loaded.readOnly;
  studio.readOnlyWrite = !studio.signedIn;
  studio.assistant = loaded.assistant || studio.assistant;
  const length = Number(studio.project && studio.project.durationMs) || 0;
  studio.playhead = clampMs(studio.playhead, length);
  if (!studio.media.some((m) => m.id === studio.selection.mediaId)) {
    studio.selection.mediaId = studio.media.length ? studio.media[0].id : null;
  }
  if (!studio.clips.some((c) => c.id === studio.selection.clipId)) {
    const firstSelected = studio.clips.find((c) => c.mediaId === studio.selection.mediaId && c.trimInMs) || null;
    studio.selection.clipId = firstSelected ? firstSelected.id : null;
  }
}

async function refreshUsage() {
  studio.usage = await readUsage(studio.assistant, window.usernode);
}

// After a reply, the meter reads what the reply carried without another
// bridge call: the headers are the platform's own figures.
function takeMeter(meter) {
  if (!meter) return;
  if (meter.spentCents != null) studio.assistant.lastSpentCents = meter.spentCents;
  if (meter.capCents != null) studio.assistant.lastCapCents = meter.capCents;
}

/* ── Undo and redo: the last two local edits ───────────────────────────── */

function snapshot() {
  return {
    project: Object.assign({}, studio.project),
    tracks: studio.tracks.map((t) => Object.assign({}, t)),
    clips: studio.clips.map((c) => Object.assign({}, c)),
  };
}

function remember() {
  studio.undo.push(snapshot());
  while (studio.undo.length > 2) studio.undo.shift();
  studio.redo = [];
}

async function restore(snap) {
  const { project, tracks, clips } = snap;
  const patch = {
    aspect: project.aspect, resolution: project.resolution, durationMs: project.durationMs,
    cameraPreset: project.cameraPreset, motionPreset: project.motionPreset,
    motionRealism: project.motionRealism, volume: project.volume, name: project.name,
  };
  await write(async () => {
    const own = await ensureOwn();
    await saveProject(own.project.id, patch);
    return saveTimeline(own.project.id, tracksPayload(tracks, clips));
  });
}

/* ── Writes ────────────────────────────────────────────────────────────── */

// Every write lands on the person's own project. On the sample, the first
// write starts their own copy, and the ids below are the copy's.
async function ensureOwn() {
  if (studio.signedIn && studio.sample) {
    const loaded = await startProject();
    applyStudio(loaded);
    return loaded;
  }
  return studio;
}

function tracksPayload(tracks, clips) {
  return tracks.map((t) => ({
    id: t.id, kind: t.kind, label: t.label, locked: !!t.locked, hidden: !!t.hidden,
    clips: clips.filter((c) => c.trackId === t.id).map((c) => ({
      id: c.id, mediaId: c.mediaId, label: c.label, startMs: c.startMs, endMs: c.endMs, trimInMs: c.trimInMs,
    })),
  }));
}

async function write(fn, okMessage) {
  if (!studio.signedIn) { toast('Sign in to Homeroom to change the project.'); return false; }
  studio.saving = true;
  try {
    const loaded = await fn();
    if (loaded) applyStudio(loaded);
    if (okMessage) toast(okMessage);
    return true;
  } catch (err) {
    toast(apiMessage(err, 'The studio could not save that.'));
    return false;
  } finally {
    studio.saving = false;
    render();
  }
}

let projectTimer = null;
let projectPatch = {};

// The inspector's controls write the project row, debounced so a slider drag
// is one write. The state updates at once so the readout keeps up.
function changeProject(patch) {
  if (!studio.project) return;
  if (!Object.keys(projectPatch).length) remember();
  Object.assign(projectPatch, patch);
  Object.assign(studio.project, patch);
  if (patch.durationMs != null) studio.playhead = clampMs(studio.playhead, patch.durationMs);
  clearTimeout(projectTimer);
  projectTimer = setTimeout(async () => {
    const pending = projectPatch;
    projectPatch = {};
    await write(async () => {
      const own = await ensureOwn();
      return saveProject(own.project.id, pending);
    });
  }, 600);
}

async function toggleTrack(trackId, flag) {
  const tracks = studio.tracks.map((t) => (t.id === trackId ? Object.assign({}, t, { [flag]: !t[flag] }) : t));
  remember();
  await write(async () => {
    const own = await ensureOwn();
    const mapped = own === studio ? tracks : own.tracks.map((t, i) => Object.assign({}, t, { [flag]: tracks[i] ? tracks[i][flag] : t[flag] }));
    return saveTimeline(own.project.id, tracksPayload(mapped, own.clips));
  });
}

async function addPlaceholder(kindId, options) {
  const kind = GENERATION_KINDS[kindId];
  if (!kind) return;
  remember();
  const ok = await write(async () => {
    const own = await ensureOwn();
    const added = await addMedia({
      projectId: own.project.id, title: placeholderTitle(kindId, options), kind: kind.mediaKind, durationMs: kind.lengthMs,
    });
    const lane = added.tracks.find((t) => t.kind === kind.lane) || added.tracks.find((t) => t.kind === 'clip');
    if (!lane || !added.mediaId) return added;
    const laneClips = added.clips.filter((c) => c.trackId === lane.id);
    const slot = nextSlot(laneClips, studio.playhead, kind.lengthMs, added.project.durationMs);
    if (!slot) return added;
    const clips = added.clips.concat([{
      id: 'new-' + Date.now(), trackId: lane.id, mediaId: added.mediaId, label: placeholderTitle(kindId, options),
      startMs: slot.startMs, endMs: slot.endMs, trimInMs: 0,
    }]);
    const saved = await saveTimeline(added.project.id, tracksPayload(added.tracks, clips));
    studio.selection.mediaId = added.mediaId;
    return saved;
  }, 'Placeholder added. Nothing was generated.');
  if (ok) go('#/studio');
}

async function removeMediaRow(id) {
  remember();
  await write(() => removeMedia(id), 'Removed from the library.');
}

// The Text tool: a text overlay block at the playhead on the text lane.
async function addTextBlock() {
  const lane = studio.tracks.find((t) => t.kind === 'text');
  if (!lane) { toast('This project has no text lane.'); return; }
  const words = window.prompt('The words the text overlay shows');
  if (!words || !words.trim()) return;
  remember();
  await write(async () => {
    const own = await ensureOwn();
    const ownLane = own.tracks.find((t) => t.kind === 'text') || lane;
    const slot = nextSlot(own.clips.filter((c) => c.trackId === ownLane.id), studio.playhead, 6000, own.project.durationMs);
    if (!slot) throw new ApiError(400, 'There is no room left on the text lane.');
    const clips = own.clips.concat([{
      id: 'new-' + Date.now(), trackId: ownLane.id, mediaId: null, label: words.trim().slice(0, 160),
      startMs: slot.startMs, endMs: slot.endMs, trimInMs: 0,
    }]);
    return saveTimeline(own.project.id, tracksPayload(own.tracks, clips));
  }, 'Text block added.');
}

async function attachPicture(file) {
  const id = studio.selection.mediaId;
  if (!id) { toast('Select a clip in the library first.'); return; }
  let art = null;
  try { art = await uploadArt(file); } catch { art = null; }
  if (!art) { toast('Platform storage did not take the picture. The drawn plate stays.'); return; }
  remember();
  await write(async () => {
    const own = await ensureOwn();
    const target = own === studio ? id : (own.media[studio.media.findIndex((m) => m.id === id)] || {}).id;
    if (!target) throw new ApiError(404, 'That clip is not in your library.');
    studio.selection.mediaId = target;
    return saveMediaArt(target, art);
  }, 'Picture saved to the clip.');
}

/* ── The assistant ─────────────────────────────────────────────────────── */

async function sendChat() {
  const text = (studio.chat.draft || '').trim();
  if (!text || studio.chat.busy) return;
  if (!studio.signedIn) { studio.chat.note = MESSAGES.guest; render(); return; }
  if (studio.usage && studio.usage.state === 'unavailable') return;
  studio.chat.busy = true;
  studio.chat.note = '';
  render();
  const projectId = studio.project ? studio.project.id : null;
  const history = historyFor(studio.transcript);
  const bridge = window.usernode;
  const result = await sendMessage(text, history, {
    post: (t, hist) => askAssistant(projectId, t, hist).then((body) => { takeMeter(body && body._meter); return body; })
      .catch((err) => { if (err && err.meter) takeMeter(err.meter); throw err; }),
    requestAccess: bridge && typeof bridge.requestLlmAccess === 'function' ? () => bridge.requestLlmAccess() : null,
  });
  studio.chat.busy = false;
  if (result.state === 'reply') {
    studio.chat.draft = '';
    studio.chat.note = '';
    takeMeter(result.reply);
    try { applyStudio(await loadStudio()); } catch { /* the reply is shown from the reload; a failed reload keeps the old transcript */ }
    await refreshUsage();
  } else {
    // The message stays in the prompt bar; the widget prints the platform's
    // own state in the app's words and never retries a cap on its own.
    studio.chat.note = result.text || MESSAGES.failed;
    if (result.state === 'app_cap' || result.state === 'budget') {
      await refreshUsage();
      if (studio.usage && studio.usage.state === 'reading' && studio.usage.cap > 0) {
        studio.usage = Object.assign({}, studio.usage, { pct: 100, warn: true });
      }
    } else if (result.state === 'declined') {
      await refreshUsage();
    }
  }
  render();
}

function quickAction(kindId) {
  if (kindId === 'text') {
    if (!studio.chat.draft) studio.chat.draft = 'Draft a title and a two-line description for this project.';
    render();
    const prompt = document.querySelector('[data-assistant-prompt]');
    if (prompt && !prompt.disabled) prompt.focus();
    return;
  }
  go('#/studio/generate/' + kindId);
}

/* ── Playback, scrubbing and trimming ──────────────────────────────────── */

let playTimer = null;
let playMark = 0;

// Only the playhead's own elements move during play: a full re-render ten
// times a second would steal focus from every control.
function paintPlayhead() {
  const length = Number(studio.project && studio.project.durationMs) || 1;
  const pct = (clampMs(studio.playhead, length) / length) * 100;
  for (const node of document.querySelectorAll('[data-playhead]')) node.style.left = pct + '%';
  const pair = timecodePair(studio.playhead, length);
  for (const node of document.querySelectorAll('[data-timecode], [data-timeline-readout]')) node.textContent = pair;
  const scrub = document.querySelector('[data-scrub]');
  if (scrub && document.activeElement !== scrub) scrub.value = String(clampMs(studio.playhead, length));
}

function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  studio.playing = false;
}

function togglePlay() {
  if (studio.playing) { stopPlay(); render(); return; }
  const length = Number(studio.project && studio.project.durationMs) || 0;
  if (!length) return;
  if (studio.playhead >= length) studio.playhead = 0;
  studio.playing = true;
  playMark = performance.now();
  playTimer = setInterval(() => {
    const now = performance.now();
    studio.playhead = movePlayhead(length, studio.playhead + (now - playMark));
    playMark = now;
    if (studio.playhead >= length) {
      if (studio.loop) studio.playhead = 0;
      else { stopPlay(); render(); return; }
    }
    paintPlayhead();
  }, 100);
  render();
}

function seek(ms) {
  const length = Number(studio.project && studio.project.durationMs) || 0;
  studio.playhead = movePlayhead(length, ms);
  paintPlayhead();
}

function msAt(event, lane) {
  const rect = lane.getBoundingClientRect();
  const length = Number(studio.project && studio.project.durationMs) || 0;
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  return rect.width ? Math.round((x / rect.width) * length) : 0;
}

// The playhead is one element and a pointer: down sets it, move drags it,
// up ends the drag. No library.
function scrubStart(event, lane) {
  if (event.button != null && event.button !== 0) return;
  event.preventDefault();
  stopPlay();
  seek(msAt(event, lane));
  const move = (e) => seek(msAt(e, lane));
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// A trim handle is the same drag with a clamp, then one timeline write.
function trimStart(event, clip, side, lane) {
  event.preventDefault();
  stopPlay();
  const node = lane.querySelector('[data-clip="' + clip.id + '"]');
  const length = Number(studio.project && studio.project.durationMs) || 1;
  let draft = Object.assign({}, clip);
  const move = (e) => {
    const at = msAt(e, lane);
    if (side === 'in') draft = withTrim(clip, at - clip.startMs, length);
    else draft = withTrim(Object.assign({}, clip, { endMs: Math.max(clip.startMs + 250, at) }), clip.trimInMs, length);
    if (node) {
      node.style.width = Math.max(0.5, ((draft.endMs - draft.startMs) / length) * 100) + '%';
      const trimmed = node.querySelector('.st-clip-trimmed');
      if (trimmed) trimmed.style.width = Math.min(100, (draft.trimInMs / Math.max(1, draft.endMs - draft.startMs)) * 100) + '%';
    }
  };
  const up = async () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (draft.trimInMs === clip.trimInMs && draft.endMs === clip.endMs) { render(); return; }
    remember();
    const clips = studio.clips.map((c) => (c.id === clip.id ? draft : c));
    await write(async () => {
      const own = await ensureOwn();
      return saveTimeline(own.project.id, tracksPayload(own === studio ? studio.tracks : own.tracks, own === studio ? clips : own.clips));
    });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/* ── The handlers the studio's pieces call ─────────────────────────────── */

const handlers = {
  go,
  notice: toast,
  selectMedia: (id) => {
    studio.selection.mediaId = id;
    const clip = studio.clips.find((c) => c.mediaId === id);
    studio.selection.clipId = clip ? clip.id : null;
    if (clip) { stopPlay(); studio.playhead = clip.startMs; }
    render();
  },
  selectClip: (clipId, mediaId) => {
    studio.selection.clipId = clipId;
    if (mediaId) studio.selection.mediaId = mediaId;
    render();
  },
  setQuery: (q) => {
    studio.query = q;
    const root = document.querySelector('[data-library]');
    // The list re-renders in place so the search box keeps its focus.
    if (root) {
      const fresh = renderStudioLibrary();
      root.replaceWith(fresh);
      const input = fresh.querySelector('[data-library-search]');
      if (input) { input.focus(); input.setSelectionRange(q.length, q.length); }
    }
  },
  useTool: (tool) => {
    studio.tool = tool;
    if (tool === 'text') { addTextBlock(); studio.tool = 'select'; return; }
    if (tool === 'image') { go('#/studio/generate/images'); return; }
    if (tool === 'effects') { go('#/studio/inspector/audio'); return; }
    render();
  },
  togglePlay,
  toggleLoop: () => { studio.loop = !studio.loop; render(); },
  seek,
  scrubStart,
  trimStart,
  changeProject,
  toggleTrack,
  setVoice: (patch) => { Object.assign(studio.voice, patch); },
  setInstructions: (v) => { studio.instructions = v; },
  addPlaceholder,
  removeMedia: removeMediaRow,
  attach: attachPicture,
  sendMessage: sendChat,
  setDraft: (v) => { studio.chat.draft = v; },
  quick: quickAction,
  undo: async () => {
    const snap = studio.undo.pop();
    if (!snap) return;
    studio.redo.push(snapshot());
    await restore(snap);
  },
  redo: async () => {
    const snap = studio.redo.pop();
    if (!snap) return;
    studio.undo.push(snapshot());
    await restore(snap);
  },
};

function renderStudioLibrary() {
  // The library alone, for the search box's in-place update.
  const whole = renderStudio(studio, handlers);
  return whole.querySelector('[data-library]');
}

/* ── The other screens ─────────────────────────────────────────────────── */

function renderAbout() {
  return el('main', { class: 'st-root', 'data-about': '' },
    el('section', { class: 'rig-window st-glass' },
      el('div', { class: 'rig-window-bar' }, el('strong', { class: 'text-body', text: APP_NAME })),
      el('div', { class: 'rig-window-body' },
        el('h1', { class: 'text-title', text: 'A dark studio for AI media work' }),
        el('p', { class: 'text-body text-muted', text: 'One project, built from clips, text, transitions and audio, with an inspector, a multi-track timeline and an assistant.' }),
        el('div', { class: 'rig-readout' },
          [
            'REAL: the project, its media, its tracks and clips, and the assistant chat through the platform\'s text AI.',
            'SIMULATED: image, avatar, video and sound generation, the collaborator avatars, the preview plate and the export.',
            SIM_LINE,
          ].map((line) => el('p', { class: 'rig-print', text: line })),
        ),
        el('button', { class: 'btn-primary', type: 'button', text: 'Open the studio', onclick: () => go('#/studio') }),
      ),
    ),
  );
}

function renderUnknown() {
  return el('main', { class: 'st-root', 'data-unknown': '' },
    el('section', { class: 'rig-window st-glass' },
      el('div', { class: 'rig-window-bar' }, el('strong', { class: 'text-body', text: APP_NAME })),
      el('div', { class: 'rig-window-body' },
        el('h2', { class: 'text-heading', text: 'That is not a screen in this studio' }),
        el('p', { class: 'text-body text-muted', text: 'The address you followed does not match a screen here. The handheld arcade this app used to be is gone.' }),
        el('button', { class: 'btn-primary', type: 'button', 'data-back-to-studio': '', text: 'Back to the studio', onclick: () => go('#/studio') }),
      ),
    ),
  );
}

function renderFailure() {
  const err = studio.failure;
  const message = err instanceof ApiError && err.status === 401
    ? 'The studio answers only inside Homeroom, because it needs to know whose project it is.'
    : 'The studio could not read your project. It is still there.';
  return el('main', { class: 'st-root' },
    el('section', { class: 'rig-window st-glass' },
      el('div', { class: 'rig-window-bar' }, el('strong', { class: 'text-body', text: APP_NAME })),
      el('div', { class: 'rig-window-body' },
        el('div', { class: 'state-error' },
          el('h2', { class: 'text-heading', text: 'The studio did not answer' }),
          el('p', { class: 'text-body text-muted', text: message }),
          el('button', {
            class: 'btn-primary', type: 'button', text: 'Try again',
            onclick: async () => { await loadIntoState(); render(); },
          }),
        ),
      ),
    ),
  );
}

function renderLoading() {
  return el('main', { class: 'st-root' },
    el('section', { class: 'rig-window st-glass' },
      el('div', { class: 'rig-window-bar' }, el('strong', { class: 'text-body', text: APP_NAME })),
      el('div', { class: 'rig-window-body' },
        el('div', { class: 'skeleton h-6 w-40' }),
        el('div', { class: 'skeleton h-11 w-full' }),
        el('div', { class: 'skeleton h-40 w-full' }),
      ),
    ),
  );
}

/* ── Routing ───────────────────────────────────────────────────────────── */

function render() {
  if (!studio.ready) { app.replaceChildren(renderLoading()); return; }
  if (studio.failure) { app.replaceChildren(renderFailure()); return; }

  const { parts, params } = parseHash();
  const first = parts[0] || '';
  if (first === 'about') { app.replaceChildren(renderAbout()); return; }
  if (first && first !== 'studio') { app.replaceChildren(renderUnknown()); return; }

  const second = parts[1] || '';
  const third = parts[2] || '';
  studio.sheet = { kind: null, options: null };
  let focus = null;
  if (second === 'library') {
    if (params.has('q')) studio.query = params.get('q') || '';
    focus = '[data-library]';
  } else if (second === 'clips' && third) {
    if (studio.media.some((m) => m.id === third)) selectSilently(third);
    focus = '[data-stage]';
  } else if (second === 'inspector') {
    studio.tab = TABS.some((t) => t.id === third) ? third : 'video';
    focus = '[data-inspector]';
  } else if (second === 'timeline') {
    focus = '[data-timeline]';
  } else if (second === 'assistant') {
    focus = '[data-assistant]';
  } else if (second === 'export') {
    studio.sheet = { kind: 'export', options: null };
  } else if (second === 'generate' && GENERATION_KINDS[third]) {
    const options = {};
    for (const key of ['sfx', 'voice', 'tone', 'language']) if (params.has(key)) options[key] = params.get(key);
    studio.sheet = { kind: third, options };
  } else if (second) {
    app.replaceChildren(renderUnknown());
    return;
  }

  app.replaceChildren(renderStudio(studio, handlers));
  if (focus) {
    const node = document.querySelector(focus);
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' });
  }
}

function selectSilently(id) {
  studio.selection.mediaId = id;
  const clip = studio.clips.find((c) => c.mediaId === id);
  studio.selection.clipId = clip ? clip.id : studio.selection.clipId;
  if (clip && !studio.playing) studio.playhead = clip.startMs;
}

/* ── Boot ──────────────────────────────────────────────────────────────── */

async function loadIntoState() {
  try {
    applyStudio(await loadStudio());
    studio.uploads = uploadsAvailable();
    // The first selected clip is the one with a trim, so the trim handles have
    // something to show; the playhead starts where it starts.
    const trimmed = studio.clips.find((c) => c.trimInMs && c.mediaId);
    if (trimmed) { studio.selection.clipId = trimmed.id; studio.selection.mediaId = trimmed.mediaId; studio.playhead = trimmed.startMs; }
    await refreshUsage();
    studio.failure = null;
  } catch (err) {
    studio.failure = err;
  } finally {
    studio.ready = true;
  }
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

render();
loadIntoState().then(render);
