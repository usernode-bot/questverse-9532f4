// The studio's pieces, one job per export. Each takes the whole state and the
// handlers and keeps no state of its own: public/app.js owns the state and
// re-renders after every change.

import { el } from './dom.js';
import {
  timecodePair, formatTimecode, trackModel, clipAt, rulerTicks, clampMs,
} from './timeline.js';
import {
  CAMERA_PRESETS, MOTION_PRESETS, RESOLUTIONS, ASPECTS, SFX_BANK, VOICES, TONES, LANGUAGES,
  DURATION_RANGE, GENERATION_KINDS, describeRequest, describeExport, aspectLabel, resolutionLabel,
  cameraLabel, motionLabel, SIM_LINE,
} from './generate.js';
import { MESSAGES } from './assistant.js';

export const APP_NAME = 'Homeroom Studio';

export const TABS = [
  { id: 'video', label: 'Video' },
  { id: 'animation', label: 'Animation' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'audio', label: 'Audio & FX' },
];

export const SIM = {
  collaborators: 'Simulated collaborators',
  preview: 'Simulated preview. Nothing here is rendered video.',
  timeline: 'Simulated timeline. No clip, no waveform and no playhead is real media.',
  library: 'Simulated',
  frame: 'Preview. This project is a simulation.',
};

function simLamp(text, attrs) {
  return el('span', Object.assign({ class: 'rig-sim', 'data-simulated': 'true', text: text || 'Simulated' }, attrs || {}));
}

function iconButton(label, glyph, attrs) {
  return el('button', Object.assign({ class: 'st-icon', type: 'button', 'aria-label': label, title: label }, attrs || {}), glyph);
}

/* ── The top bar ─────────────────────────────────────────────────────────── */

export function renderTopBar(state, h) {
  const project = state.project || {};
  const tools = [
    { id: 'select', label: 'Select', glyph: '↖' },
    { id: 'text', label: 'Text', glyph: 'T' },
    { id: 'image', label: 'Image', glyph: '□' },
    { id: 'effects', label: 'Effects', glyph: '✨' },
  ];
  return el('header', { class: 'st-topbar st-glass', 'data-topbar': '' },
    el('div', { class: 'flex items-center gap-2' },
      iconButton('Back', '‹', { 'data-back': '', onclick: () => h.go('#/about') }),
      el('div', { class: 'st-crumb', 'data-crumbs': '' },
        el('strong', { class: 'text-fg', text: APP_NAME }),
        el('span', { 'aria-hidden': 'true', text: '/' }),
        el('span', { text: project.name || 'Untitled project' }),
      ),
    ),
    el('div', { class: 'flex items-center gap-1' },
      iconButton('Undo', '↺', { 'data-undo': '', disabled: !state.undo.length || state.readOnlyWrite, onclick: h.undo }),
      iconButton('Redo', '↻', { 'data-redo': '', disabled: !state.redo.length || state.readOnlyWrite, onclick: h.redo }),
    ),
    el('div', { class: 'st-tools', role: 'group', 'aria-label': 'Tools' },
      tools.map((t) => el('button', {
        class: 'st-tool' + (state.tool === t.id ? ' st-tool-on' : ''), type: 'button',
        'data-tool': t.id, 'aria-pressed': state.tool === t.id ? 'true' : 'false',
        onclick: () => h.useTool(t.id),
      }, el('span', { class: 'st-tool-dot', 'aria-hidden': 'true' }), el('span', { 'aria-hidden': 'true', text: t.glyph + ' ' }), t.label)),
    ),
    el('div', { class: 'flex flex-wrap items-center gap-2 lg:ml-auto' },
      el('div', { class: 'st-avatars', 'aria-label': 'Collaborator avatars, simulated' },
        el('span', { class: 'st-avatar', text: 'AN' }),
        el('span', { class: 'st-avatar', text: 'MI' }),
      ),
      simLamp(SIM.collaborators),
      renderAiMeter(state.usage),
      el('button', {
        class: 'btn-primary', type: 'button', 'data-export': '', text: 'Export',
        onclick: () => h.go('#/studio/export'),
      }),
    ),
  );
}

// The AI usage meter: one of three states from the usage object. A reading
// prints the figure in the app's own voice (.rig-print) with a thin bar that
// turns to the caution colour at 90% of the cap.
export function renderAiMeter(usage) {
  const u = usage || { state: 'unavailable', text: MESSAGES.unavailable, pct: 0 };
  const node = el('div', {
    class: 'st-meter' + (u.warn ? ' st-meter-warn' : ''), 'data-ai-meter': '', 'data-ai-state': u.state,
    role: 'status', 'aria-live': 'polite', title: MESSAGES.manage,
  });
  if (u.state === 'reading') {
    node.append(
      el('span', { class: 'st-meter-line' },
        el('span', { class: 'text-small text-muted', text: MESSAGES.meterLabel + ' ' }),
        el('span', { class: 'rig-print st-meter-figure', text: u.text.replace(MESSAGES.meterLabel + ' ', '') }),
      ),
      el('span', { class: 'st-meter-bar', 'aria-hidden': 'true' },
        el('span', { class: 'st-meter-fill', style: 'width:' + Math.round(u.pct) + '%' }),
      ),
    );
  } else {
    node.append(el('span', { class: 'text-small text-muted', text: u.text }));
  }
  return node;
}

/* ── The media library ───────────────────────────────────────────────────── */

export function renderLibrary(state, h) {
  const q = (state.query || '').trim().toLowerCase();
  const rows = state.media.filter((m) => !q || (m.title || '').toLowerCase().includes(q));
  const list = el('ul', { class: 'st-lib-list', 'data-library-rows': '' },
    rows.map((m) => el('li', {},
      el('button', {
        class: 'st-lib-thumb' + (state.selection.mediaId === m.id ? ' st-lib-thumb-on' : ''), type: 'button',
        'data-media-row': m.id, 'aria-pressed': state.selection.mediaId === m.id ? 'true' : 'false',
        onclick: () => h.selectMedia(m.id),
      },
        el('span', { class: 'st-lib-art', 'aria-hidden': 'true' }, m.artUrl && !m.artUrl.startsWith('data:')
          ? el('img', { src: m.artUrl, alt: '', class: 'st-lib-img' }) : null),
        el('span', { class: 'st-lib-badge', 'data-media-badge': '', text: formatTimecode(m.durationMs) }),
        el('span', { class: 'st-lib-cap' },
          el('span', { class: 'truncate', text: m.title }),
          m.simulated ? el('span', { class: 'st-lib-sim', 'data-simulated': 'true', text: m.kind === 'placeholder' ? 'Simulated placeholder' : 'Simulated' }) : null,
        ),
      ),
      state.signedIn && !state.sample ? el('button', {
        class: 'st-lib-remove', type: 'button', 'data-media-remove': m.id, 'aria-label': 'Remove ' + m.title,
        onclick: () => h.removeMedia(m.id),
      }, '×') : null,
    )),
  );
  return el('section', {
    class: 'st-panel st-glass', 'data-library': '', 'data-query': q, 'data-count': String(rows.length),
    'aria-label': 'Project media',
  },
    el('div', { class: 'flex items-center justify-between gap-2' },
      el('h2', { class: 'text-heading', text: 'Project media' }),
      simLamp(SIM.library),
    ),
    el('input', {
      class: 'field', type: 'search', placeholder: 'Search this project', value: state.query || '',
      'data-library-search': '', 'aria-label': 'Search this project',
      oninput: (e) => h.setQuery(e.target.value),
    }),
    rows.length ? list : el('p', {
      class: 'state-empty text-body text-muted', 'data-library-empty': '',
      text: state.media.length ? 'Nothing in this project matches that search.' : 'This project has no media yet. A placeholder from the assistant lands here.',
    }),
  );
}

/* ── The preview player ──────────────────────────────────────────────────── */

export function renderPreview(state, h) {
  const project = state.project || {};
  const length = Number(project.durationMs) || 0;
  const selected = state.media.find((m) => m.id === state.selection.mediaId) || null;
  // The plate names what the clip lane shows under the playhead, then the
  // selected row; the audio lane never takes the picture.
  const clipLanes = new Set(state.tracks.filter((t) => t.kind === 'clip').map((t) => t.id));
  const under = clipAt(state.clips, state.playhead).find((c) => c.mediaId && clipLanes.has(c.trackId));
  const showing = (under && state.media.find((m) => m.id === under.mediaId)) || selected;
  return el('section', { class: 'st-stage st-glass', 'data-stage': '', 'aria-label': 'Preview' },
    el('div', { class: 'st-stage-frame', 'data-stage-frame': '' },
      el('span', { class: 'st-stage-title', text: showing ? showing.title : 'No clip selected' }),
      el('span', { class: 'text-small text-muted', text: SIM.frame }),
    ),
    el('div', { class: 'st-scrub-row' },
      el('button', {
        class: 'st-icon', type: 'button', 'data-play': '', 'aria-label': state.playing ? 'Pause' : 'Play',
        'aria-pressed': state.playing ? 'true' : 'false', onclick: h.togglePlay,
      }, state.playing ? '⏸' : '▶'),
      el('span', { class: 'st-timecode rig-print', 'data-timecode': '', text: timecodePair(state.playhead, length) }),
      iconButton('Loop', '↻', {
        'data-loop': '', 'aria-pressed': state.loop ? 'true' : 'false',
        class: 'st-icon' + (state.loop ? ' st-icon-on' : ''), onclick: h.toggleLoop,
      }),
      iconButton('Jump one second forward', '⇥', { 'data-jump': '', onclick: () => h.seek(state.playhead + 1000) }),
      el('input', {
        class: 'st-scrub', type: 'range', min: '0', max: String(length), step: '250', value: String(clampMs(state.playhead, length)),
        'data-scrub': '', 'aria-label': 'Scrub', oninput: (e) => h.seek(Number(e.target.value)),
      }),
      iconButton('Fullscreen (simulated)', '⤢', { 'data-fullscreen': '', onclick: () => h.notice('Fullscreen is simulated: the preview is a drawn plate.') }),
      el('button', {
        class: 'st-icon', type: 'button', 'data-quality': '', 'aria-label': 'Quality',
        onclick: () => h.notice('Quality toggle is simulated: the plate has no pixels to scale.'),
      }, project.resolution === '4K' ? '4K' : 'HD'),
    ),
    simLamp(SIM.preview),
  );
}

/* ── The inspector ───────────────────────────────────────────────────────── */

function selectControl(id, label, options, value, onChange, disabled) {
  return el('label', { class: 'st-group', 'data-control': id },
    el('span', { class: 'section-label', text: label }),
    el('select', {
      class: 'field st-select', 'data-control-input': id, disabled: disabled || null,
      onchange: (e) => onChange(e.target.value),
    }, options.map((o) => {
      const opt = el('option', { value: o.id, text: o.label });
      if (o.id === value) opt.selected = true;
      return opt;
    })),
  );
}

function sliderControl(id, label, min, max, step, value, print, onInput, disabled) {
  const readout = el('span', { class: 'rig-print', 'data-control-readout': id, text: print(value) });
  return el('div', { class: 'st-group', 'data-control': id },
    el('div', { class: 'flex items-center justify-between gap-2' },
      el('label', { class: 'section-label mb-0', for: 'control-' + id, text: label }),
      readout,
    ),
    el('input', {
      class: 'st-slider', id: 'control-' + id, type: 'range', min: String(min), max: String(max), step: String(step),
      value: String(value), disabled: disabled || null,
      oninput: (e) => { readout.textContent = print(Number(e.target.value)); onInput(Number(e.target.value)); },
    }),
  );
}

export function renderInspector(state, h) {
  const p = state.project || {};
  const tab = TABS.some((t) => t.id === state.tab) ? state.tab : 'video';
  const locked = !state.signedIn;
  const change = (patch) => h.changeProject(patch);
  let body;
  if (tab === 'video') {
    body = [
      sliderControl('volume', 'Volume', 0, 100, 1, p.volume, (v) => v + '%', (v) => change({ volume: v }), locked),
      selectControl('camera-preset', 'Camera preset', CAMERA_PRESETS, p.cameraPreset, (v) => change({ cameraPreset: v }), locked),
      sliderControl('motion-realism', 'Motion realism', 0, 10, 1, p.motionRealism, (v) => v + ' of 10', (v) => change({ motionRealism: v }), locked),
      selectControl('resolution', 'Resolution', RESOLUTIONS, p.resolution, (v) => change({ resolution: v }), locked),
      selectControl('aspect', 'Aspect ratio', ASPECTS, p.aspect, (v) => change({ aspect: v }), locked),
      sliderControl('duration', 'Video length', DURATION_RANGE.min, DURATION_RANGE.max, DURATION_RANGE.step,
        Math.round((p.durationMs || 0) / 1000), (v) => formatTimecode(v * 1000), (v) => change({ durationMs: v * 1000 }), locked),
    ];
  } else if (tab === 'animation') {
    body = [
      selectControl('motion-preset', 'Stylised motion', MOTION_PRESETS, p.motionPreset, (v) => change({ motionPreset: v }), locked),
      selectControl('camera-preset', 'Camera preset', CAMERA_PRESETS, p.cameraPreset, (v) => change({ cameraPreset: v }), locked),
      sliderControl('motion-realism', 'Motion realism', 0, 10, 1, p.motionRealism, (v) => v + ' of 10', (v) => change({ motionRealism: v }), locked),
      el('p', { class: 'text-small text-muted', text: 'The animation presets really write the project and the export panel really names them. No frame is rendered.' }),
    ];
  } else if (tab === 'tracking') {
    body = [
      el('div', { class: 'st-subtabs', role: 'group', 'aria-label': 'Colour tools' },
        ['Curves', 'HSL', 'Color Wheel', 'Basic'].map((name, i) => el('span', {
          class: 'st-subtab' + (i === 0 ? ' st-subtab-on' : ''), 'data-subtab': name.toLowerCase().replace(/\s+/g, '-'), text: name,
        })),
      ),
      el('div', { class: 'card flex flex-col gap-2', 'data-control': 'tracking' },
        el('p', { class: 'text-body', text: 'Motion tracking and colour grading work on real pixels.' }),
        el('p', { class: 'text-small text-muted', text: 'With no decoded media there is nothing to track or grade, so these controls are the reference layout\'s labelled placeholders.' }),
        simLamp('Simulated'),
      ),
    ];
  } else {
    body = [
      sliderControl('volume', 'Volume', 0, 100, 1, p.volume, (v) => v + '%', (v) => change({ volume: v }), locked),
      el('div', { class: 'st-group', 'data-control': 'sfx' },
        el('span', { class: 'section-label', text: 'SFX bank' }),
        el('div', { class: 'flex flex-wrap gap-2' }, SFX_BANK.map((s) => el('button', {
          class: 'btn-secondary', type: 'button', 'data-sfx': s.id, text: s.label,
          onclick: () => h.go('#/studio/generate/sfx?sfx=' + encodeURIComponent(s.id)),
        }))),
      ),
      el('div', { class: 'st-group', 'data-control': 'voice' },
        el('span', { class: 'section-label', text: 'Voice talent' }),
        el('div', { class: 'grid gap-2 sm:grid-cols-3' },
          selectControl('voice-name', 'Voice', VOICES, state.voice.voice, (v) => h.setVoice({ voice: v })),
          selectControl('voice-tone', 'Tone', TONES, state.voice.tone, (v) => h.setVoice({ tone: v })),
          selectControl('voice-language', 'Language', LANGUAGES, state.voice.language, (v) => h.setVoice({ language: v })),
        ),
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-voice-add': '', text: 'Add voice-over',
          onclick: () => h.go('#/studio/generate/voice'),
        }),
      ),
      el('label', { class: 'st-group', 'data-control': 'instructions' },
        el('span', { class: 'section-label', text: 'Detail instructions for attached media' }),
        el('textarea', {
          class: 'field min-h-24', rows: '3', placeholder: 'Describe what the attached media should do.',
          'data-instructions': '', oninput: (e) => h.setInstructions(e.target.value),
        }, state.instructions || ''),
      ),
    ];
  }
  return el('section', { class: 'st-panel st-glass', 'data-inspector': '', 'aria-label': 'Inspector' },
    el('div', { class: 'st-tabs', role: 'tablist', 'aria-label': 'Inspector tabs' },
      TABS.map((t) => el('button', {
        class: 'st-tab' + (t.id === tab ? ' st-tab-on' : ''), type: 'button', role: 'tab',
        'data-inspector-tab': t.id, 'aria-selected': t.id === tab ? 'true' : 'false',
        onclick: () => h.go('#/studio/inspector/' + t.id),
      }, t.label)),
    ),
    el('div', { class: 'flex flex-col gap-3', role: 'tabpanel', 'data-inspector-panel': tab }, body),
    locked ? el('p', { class: 'text-small text-muted', text: 'A guest reads the inspector. Sign in to Homeroom to change a project.' }) : null,
  );
}

/* ── The assistant widget ────────────────────────────────────────────────── */

export function renderAssistant(state, h) {
  const name = state.username || (state.project && state.project.assistantName) || 'there';
  const usage = state.usage || { state: 'unavailable' };
  const unavailable = usage.state === 'unavailable';
  const chat = state.chat || {};
  const quick = [
    { id: 'text', label: 'Generate Text', real: true },
    { id: 'images', label: 'Generate Images' },
    { id: 'avatar', label: 'Generate Avatar' },
    { id: 'video', label: 'Generate Video' },
  ];
  const turns = state.transcript.slice(-8);
  const noteText = unavailable
    ? MESSAGES.unavailable + ' ' + MESSAGES.unavailableDetail
    : (chat.note || (MESSAGES.sends + ' ' + MESSAGES.declines));
  return el('section', { class: 'st-assist st-glass', 'data-assistant': '', 'aria-label': 'Assistant' },
    el('h2', { class: 'text-heading', text: 'Hi ' + name + '! How can I help you?' }),
    el('div', { class: 'st-assist-quick-list' },
      quick.map((q) => el('button', {
        class: 'st-assist-quick', type: 'button', 'data-quick': q.id,
        'data-real': q.real ? 'true' : null, 'data-simulated': q.real ? null : 'true',
        onclick: () => h.quick(q.id),
      },
        el('strong', { class: 'text-body', text: q.label }),
        q.real ? el('span', { class: 'st-real', text: 'Platform AI' }) : el('span', { class: 'rig-sim', text: 'Simulated' }),
      )),
    ),
    turns.length ? el('ol', { class: 'st-assist-log', 'data-assistant-log': '' },
      turns.map((t) => el('li', { class: 'st-assist-turn st-assist-turn-' + t.role, 'data-turn': t.role },
        el('span', { class: 'text-small text-muted', text: t.role === 'assistant' ? 'Assistant' : 'You' }),
        el('p', { class: 'text-body whitespace-pre-wrap', text: t.body }),
      )),
    ) : null,
    el('form', {
      class: 'st-assist-prompt', 'data-assistant-form': '',
      onsubmit: (e) => { e.preventDefault(); h.sendMessage(); },
    },
      el('input', {
        class: 'field', type: 'text', placeholder: 'Type a message', value: chat.draft || '',
        'data-assistant-prompt': '', 'aria-label': 'Message to the assistant',
        disabled: unavailable || chat.busy || null, maxlength: '2000',
        oninput: (e) => h.setDraft(e.target.value),
      }),
      el('label', { class: 'st-icon', title: state.uploads ? 'Attach a picture to the selected clip' : 'Attach is unavailable: platform storage is not reachable here' },
        el('span', { 'aria-hidden': 'true', text: '+' }),
        el('input', {
          type: 'file', accept: 'image/*', class: 'sr-only', 'data-attach': '',
          disabled: !state.uploads || !state.signedIn || null,
          onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) h.attach(f); e.target.value = ''; },
        }),
      ),
      iconButton('Voice input (simulated)', '☺', { 'data-mic': '', onclick: () => h.notice('Voice input is simulated: type your message instead.') }),
      el('button', {
        class: 'btn-secondary', type: 'submit', 'data-assistant-send': '', text: chat.busy ? 'Sending' : 'Send',
        disabled: unavailable || chat.busy || null,
      }),
    ),
    el('p', { class: 'st-assist-note', 'data-assistant-note': '', 'data-ai-state': usage.state, role: 'status', text: noteText }),
    el('p', { class: 'text-small text-muted', 'data-ai-permissions-note': '', text: MESSAGES.manage }),
    !state.uploads ? el('p', { class: 'text-small text-muted', 'data-uploads-note': '', text: 'Platform storage is not reachable here, so the attach control is off and the drawn plate is used.' }) : null,
  );
}

/* ── The timeline ────────────────────────────────────────────────────────── */

export function renderTimeline(state, h) {
  const project = state.project || {};
  const length = Number(project.durationMs) || 1;
  const lanes = trackModel(state.tracks, state.clips, state.media, length);
  const pct = (clampMs(state.playhead, length) / length) * 100;
  const ticks = rulerTicks(length, 8);
  const playhead = () => el('span', { class: 'st-playhead', 'data-playhead': '', style: 'left:' + pct + '%', 'aria-hidden': 'true' });
  return el('section', { class: 'st-track st-glass', 'data-timeline': '', 'aria-label': 'Timeline' },
    el('div', { class: 'st-lane' },
      el('div', { class: 'st-lane-head' }, el('span', { class: 'text-small text-muted', text: 'Timeline' })),
      el('div', {
        class: 'st-ruler', 'data-ruler': '',
        onpointerdown: (e) => h.scrubStart(e, e.currentTarget),
      }, ticks.map((t) => el('span', { class: 'st-ruler-tick rig-print', style: 'left:' + t.pct + '%', text: t.label })), playhead()),
    ),
    lanes.map(({ track, clips }) => el('div', { class: 'st-lane', 'data-lane': track.kind, 'data-track': track.id },
      el('div', { class: 'st-lane-head' },
        el('span', { class: 'text-small truncate', text: track.label }),
        el('span', { class: 'flex gap-1' },
          el('button', {
            class: 'st-lane-btn' + (track.locked ? ' st-lane-btn-on' : ''), type: 'button', 'data-lane-lock': track.id,
            'aria-label': (track.locked ? 'Unlock ' : 'Lock ') + track.label, 'aria-pressed': track.locked ? 'true' : 'false',
            disabled: !state.signedIn || null, onclick: () => h.toggleTrack(track.id, 'locked'),
          }, track.locked ? '\u{1F512}' : '\u{1F513}'),
          el('button', {
            class: 'st-lane-btn' + (track.hidden ? ' st-lane-btn-on' : ''), type: 'button', 'data-lane-hide': track.id,
            'aria-label': (track.hidden ? 'Show ' : 'Hide ') + track.label, 'aria-pressed': track.hidden ? 'true' : 'false',
            disabled: !state.signedIn || null, onclick: () => h.toggleTrack(track.id, 'hidden'),
          }, track.hidden ? '◌' : '◉'),
        ),
      ),
      el('div', {
        class: 'st-lane-body' + (track.hidden ? ' st-lane-hidden' : ''), 'data-lane-body': track.id,
        onpointerdown: (e) => h.scrubStart(e, e.currentTarget),
      },
        clips.map((c) => {
          const on = state.selection.clipId === c.id;
          const style = 'left:' + c.leftPct + '%;width:' + c.widthPct + '%';
          const kindClass = track.kind === 'audio' || track.kind === 'voice' ? ' st-clip-audio'
            : track.kind === 'text' ? ' st-clip-text' : track.kind === 'transition' ? ' st-clip-transition' : '';
          return el('div', {
            class: 'st-clip' + kindClass + (on ? ' st-clip-on' : '') + (c.simulated ? ' st-clip-sim' : ''),
            'data-clip': c.id, 'data-simulated': c.simulated ? 'true' : 'false', style,
            role: 'button', tabindex: '0', 'aria-label': c.title + ', ' + formatTimecode(c.startMs) + ' to ' + formatTimecode(c.endMs),
            'aria-pressed': on ? 'true' : 'false',
            onpointerdown: (e) => { e.stopPropagation(); h.selectClip(c.id, c.mediaId); },
            onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.selectClip(c.id, c.mediaId); } },
          },
            track.kind === 'audio' || track.kind === 'voice'
              ? el('span', { class: 'st-wave', 'aria-hidden': 'true' })
              : null,
            el('span', { class: 'st-clip-label', text: (track.kind === 'text' ? 'Text: ' : '') + c.title }),
            c.trimInMs ? el('span', { class: 'st-clip-trimmed', style: 'width:' + Math.min(100, (c.trimInMs / Math.max(1, c.endMs - c.startMs)) * 100) + '%', 'aria-hidden': 'true' }) : null,
            on && state.signedIn && !track.locked ? el('span', {
              class: 'st-clip-handle st-clip-handle-in', 'data-trim': 'in', 'aria-label': 'Trim in',
              onpointerdown: (e) => { e.stopPropagation(); h.trimStart(e, c, 'in', e.currentTarget.parentNode.parentNode); },
            }) : null,
            on && state.signedIn && !track.locked ? el('span', {
              class: 'st-clip-handle st-clip-handle-out', 'data-trim': 'out', 'aria-label': 'Trim out',
              onpointerdown: (e) => { e.stopPropagation(); h.trimStart(e, c, 'out', e.currentTarget.parentNode.parentNode); },
            }) : null,
            on && (!state.signedIn || track.locked) ? el('span', { class: 'st-clip-handle st-clip-handle-in', 'data-trim': 'in', 'aria-hidden': 'true' }) : null,
          );
        }),
        playhead(),
      ),
    )),
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      simLamp(SIM.timeline),
      el('span', { class: 'rig-print', 'data-timeline-readout': '', text: timecodePair(state.playhead, length) }),
    ),
  );
}

/* ── The generation and export panels ────────────────────────────────────── */

export function renderGeneratePanel(state, h) {
  const sheet = state.sheet || {};
  const kind = GENERATION_KINDS[sheet.kind];
  if (!kind) return null;
  const options = Object.assign({}, state.voice, sheet.options || {});
  const lines = describeRequest(kind.id, state.project, options);
  return el('div', { class: 'rig-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': kind.label },
    el('div', { class: 'rig-sheet-panel' },
      el('section', { class: 'rig-window', 'data-generate-panel': '', 'data-generate-panel-kind': kind.id },
        el('div', { class: 'rig-window-bar' },
          el('strong', { class: 'text-body', text: kind.label }),
          simLamp('Simulated'),
        ),
        el('div', { class: 'rig-window-body' },
          el('div', { class: 'rig-readout' }, lines.map((line) => el('p', { class: 'rig-print', text: line }))),
          el('p', { class: 'text-body', text: 'Adding the placeholder puts a clearly marked row in the library and a block on the ' + (kind.lane === 'audio' ? 'audio' : 'clip') + ' lane. Nothing is generated.' }),
          el('div', { class: 'flex flex-wrap gap-2' },
            el('button', {
              class: 'btn-primary', type: 'button', 'data-placeholder-add': '', text: 'Add to project as a placeholder',
              disabled: !state.signedIn || state.saving || null,
              onclick: () => h.addPlaceholder(kind.id, options),
            }),
            el('button', { class: 'btn-secondary', type: 'button', 'data-sheet-close': '', text: 'Close', onclick: () => h.go('#/studio') }),
          ),
          !state.signedIn ? el('p', { class: 'text-small text-muted', text: 'A guest reads this panel. Sign in to Homeroom to add a placeholder.' }) : null,
        ),
      ),
    ),
  );
}

export function renderExportPanel(state, h) {
  const lines = describeExport(state.project);
  return el('div', { class: 'rig-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Export' },
    el('div', { class: 'rig-sheet-panel' },
      el('section', { class: 'rig-window', 'data-export-panel': '' },
        el('div', { class: 'rig-window-bar' },
          el('strong', { class: 'text-body', text: 'Export' }),
          simLamp('Simulated'),
        ),
        el('div', { class: 'rig-window-body' },
          el('div', { class: 'rig-readout' }, lines.map((line) => el('p', { class: 'rig-print', text: line }))),
          el('p', { class: 'text-body', text: 'The aspect ratio, resolution and length above are the project\'s own settings, written by the inspector. Encoding a file is not something this platform can do, so no file was produced.' }),
          el('button', { class: 'btn-primary', type: 'button', 'data-sheet-close': '', text: 'Back to the studio', onclick: () => h.go('#/studio') }),
        ),
      ),
    ),
  );
}

/* ── The readout under the studio ────────────────────────────────────────── */

export function studioReadout(state) {
  const p = state.project || {};
  const lanes = state.tracks.length;
  return [
    'PROJECT ' + (p.name || 'Untitled project') + ' / ' + aspectLabel(p.aspect) + ' / ' + resolutionLabel(p.resolution)
      + ' / ' + formatTimecode(p.durationMs),
    'CAMERA ' + cameraLabel(p.cameraPreset) + ' / MOTION ' + motionLabel(p.motionPreset) + ' ' + (p.motionRealism || 0) + ' of 10'
      + ' / VOLUME ' + (p.volume || 0) + '%',
    'LIBRARY ' + state.media.length + ' rows / TIMELINE ' + lanes + ' lanes, ' + state.clips.length + ' blocks',
    'AI ' + (state.usage ? state.usage.text : MESSAGES.unavailable),
    SIM_LINE,
  ];
}

/* ── The whole studio ────────────────────────────────────────────────────── */

export function renderStudio(state, h) {
  const sheet = state.sheet || {};
  return el('main', { class: 'st-root', 'data-studio': '' },
    renderTopBar(state, h),
    state.sample ? el('p', { class: 'st-sample-note text-small text-muted', 'data-sample-note': '',
      text: 'This is the staging demo project, shown because you have no project yet. Your first change starts your own copy of it.' }) : null,
    el('div', { class: 'st-body' },
      renderLibrary(state, h),
      renderPreview(state, h),
      el('div', { class: 'st-side' },
        renderInspector(state, h),
        renderAssistant(state, h),
      ),
    ),
    renderTimeline(state, h),
    el('div', { class: 'rig-readout', 'data-studio-readout': '' },
      studioReadout(state).map((line) => el('p', { class: 'rig-print', text: line })),
    ),
    sheet.kind === 'export' ? renderExportPanel(state, h) : null,
    sheet.kind && sheet.kind !== 'export' ? renderGeneratePanel(state, h) : null,
  );
}
