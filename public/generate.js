// The simulation catalogue: the three simulated generation kinds, the
// inspector's presets, the SFX bank and the voice-talent bank, and the one
// builder for a labelled result line.
//
// Pure data. There is no price list and no credit arithmetic anywhere in
// this file: the platform has no image, video or audio model behind its
// proxy, so nothing here can be generated and nothing here can cost.

export const CAMERA_PRESETS = [
  { id: 'static', label: 'Static' },
  { id: 'dolly-zoom', label: 'Dolly zoom' },
  { id: 'slow-pan', label: 'Slow pan' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'crane-up', label: 'Crane up' },
];

export const MOTION_PRESETS = [
  { id: 'natural', label: 'Natural' },
  { id: 'stylised', label: 'Stylised' },
  { id: 'slow-motion', label: 'Slow motion' },
  { id: 'handheld', label: 'Handheld' },
];

export const RESOLUTIONS = [
  { id: '1K', label: '1K (1080p Full HD)' },
  { id: '2K', label: '2K (1440p)' },
  { id: '4K', label: '4K (2160p Ultra HD)' },
];

export const ASPECTS = [
  { id: '16:9', label: 'YouTube 16:9' },
  { id: '9:16', label: 'Shorts 9:16' },
  { id: '9:16-tiktok', label: 'TikTok 9:16' },
  { id: '9:16-reels', label: 'Reels and Story 9:16' },
  { id: '1:1', label: 'Instagram post 1:1' },
  { id: '4:5', label: 'Instagram post 4:5' },
  { id: '16:9-facebook', label: 'Facebook 16:9' },
  { id: '1:1-facebook', label: 'Facebook 1:1' },
];

export const SFX_BANK = [
  { id: 'whoosh', label: 'Whoosh' },
  { id: 'chime', label: 'Soft chime' },
  { id: 'page-turn', label: 'Page turn' },
  { id: 'rain', label: 'Rain ambience' },
  { id: 'typing', label: 'Keyboard typing' },
  { id: 'applause', label: 'Applause' },
];

export const VOICES = [
  { id: 'river', label: 'River' },
  { id: 'sage', label: 'Sage' },
  { id: 'harbor', label: 'Harbor' },
  { id: 'juniper', label: 'Juniper' },
];

export const TONES = [
  { id: 'warm', label: 'Warm' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'calm', label: 'Calm' },
];

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'ja', label: 'Japanese' },
];

// Project length, in seconds: the inspector's video-length slider.
export const DURATION_RANGE = { min: 5, max: 600, step: 5 };

// The simulated generation kinds. `text` is not here: Generate Text is the
// one real action and goes through the assistant, not this catalogue.
export const GENERATION_KINDS = {
  images: {
    id: 'images',
    label: 'Generate Images',
    noun: 'image',
    mediaKind: 'placeholder',
    lane: 'clip',
    lengthMs: 5000,
    describe: (p) => ['An image at ' + aspectLabel(p.aspect) + ', ' + resolutionLabel(p.resolution) + '.'],
  },
  avatar: {
    id: 'avatar',
    label: 'Generate Avatar',
    noun: 'avatar',
    mediaKind: 'placeholder',
    lane: 'clip',
    lengthMs: 8000,
    describe: (p, o) => ['A presenter avatar reading in the ' + (voiceLabel(o && o.voice)) + ' voice, '
      + toneLabel(o && o.tone).toLowerCase() + ' tone, ' + languageLabel(o && o.language) + '.'],
  },
  video: {
    id: 'video',
    label: 'Generate Video',
    noun: 'video clip',
    mediaKind: 'placeholder',
    lane: 'clip',
    lengthMs: 10000,
    describe: (p) => [
      'A ' + resolutionLabel(p.resolution) + ' clip at ' + aspectLabel(p.aspect) + '.',
      'Camera: ' + cameraLabel(p.cameraPreset) + '. Motion: ' + motionLabel(p.motionPreset)
        + ', realism ' + (Number(p.motionRealism) || 0) + ' of 10.',
    ],
  },
  sfx: {
    id: 'sfx',
    label: 'Add sound effect',
    noun: 'sound effect',
    mediaKind: 'placeholder',
    lane: 'audio',
    lengthMs: 3000,
    describe: (p, o) => ['The ' + sfxLabel(o && o.sfx).toLowerCase() + ' effect from the SFX bank.'],
  },
  voice: {
    id: 'voice',
    label: 'Add voice-over',
    noun: 'voice-over',
    mediaKind: 'placeholder',
    lane: 'audio',
    lengthMs: 12000,
    describe: (p, o) => ['A voice-over read by ' + voiceLabel(o && o.voice) + ', '
      + toneLabel(o && o.tone).toLowerCase() + ' tone, ' + languageLabel(o && o.language) + '.'],
  },
};

function labelOf(list, id, fallback) {
  const hit = list.find((x) => x.id === id);
  return hit ? hit.label : fallback;
}
export function cameraLabel(id) { return labelOf(CAMERA_PRESETS, id, CAMERA_PRESETS[0].label); }
export function motionLabel(id) { return labelOf(MOTION_PRESETS, id, MOTION_PRESETS[0].label); }
export function resolutionLabel(id) { return labelOf(RESOLUTIONS, id, RESOLUTIONS[0].label); }
export function aspectLabel(id) { return labelOf(ASPECTS, id, ASPECTS[0].label); }
export function sfxLabel(id) { return labelOf(SFX_BANK, id, SFX_BANK[0].label); }
export function voiceLabel(id) { return labelOf(VOICES, id, VOICES[0].label); }
export function toneLabel(id) { return labelOf(TONES, id, TONES[0].label); }
export function languageLabel(id) { return labelOf(LANGUAGES, id, LANGUAGES[0].label); }

export function generationKind(id) {
  return GENERATION_KINDS[id] || null;
}

// The words every simulated surface prints, so the panel, the row it leaves
// behind and the readout cannot drift.
export const SIM_LINE = 'Simulated. No image, video, sound or file was produced: the platform has no such '
  + 'service behind its AI proxy.';
export const EXPORT_LINE = 'Simulated export. No file was written: this platform cannot encode or render media.';

// The labelled result: the exact request in the app's own words, then the
// plain statement that nothing was produced. Never a price.
export function describeRequest(kindId, project, options) {
  const kind = generationKind(kindId);
  if (!kind) return [];
  const p = project || {};
  return [kind.label + ' requested for ' + (p.name || 'this project') + '.']
    .concat(kind.describe(p, options || {}))
    .concat([SIM_LINE]);
}

// The title the placeholder row carries in the library and on the lane.
export function placeholderTitle(kindId, options) {
  const kind = generationKind(kindId);
  if (!kind) return 'Placeholder';
  if (kindId === 'sfx') return 'Placeholder: ' + sfxLabel(options && options.sfx);
  if (kindId === 'voice') return 'Placeholder: voice-over by ' + voiceLabel(options && options.voice);
  return 'Placeholder: ' + kind.noun;
}

// What the export panel names: the project's own settings, really written to
// its row by the inspector, and the plain statement that no file exists.
export function describeExport(project) {
  const p = project || {};
  return [
    'Export requested for ' + (p.name || 'this project') + '.',
    aspectLabel(p.aspect) + ', ' + resolutionLabel(p.resolution) + ', '
      + Math.round((Number(p.durationMs) || 0) / 1000) + ' seconds.',
    EXPORT_LINE,
  ];
}
