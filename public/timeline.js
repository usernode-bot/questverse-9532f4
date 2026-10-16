// The timeline as a small pure module: no DOM, no clock, no storage.
//
// It turns a project's tracks, clips and media into the lanes the studio
// draws, answers what sits under the playhead, prints every timecode the
// app shows and clamps every edit to the project's own length. A test can
// drive all of it with plain objects.

// The one place a time is printed. Whole seconds, MM:SS, clamped at zero.
export function formatTimecode(ms) {
  const n = Number(ms);
  const total = Number.isFinite(n) && n > 0 ? Math.floor(n / 1000) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const pad = (v) => (v < 10 ? '0' + v : String(v));
  return pad(minutes) + ':' + pad(seconds);
}

// The readout the preview, the scrub bar and the ruler all share: 01:38/01:40.
export function timecodePair(ms, durationMs) {
  return formatTimecode(clampMs(ms, durationMs)) + '/' + formatTimecode(durationMs);
}

export function clampMs(ms, durationMs) {
  const length = Math.max(0, Number(durationMs) || 0);
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(length, Math.round(n));
}

// Moving the playhead returns the new position rather than mutating anything;
// the caller stores it as one number on the project's state.
export function movePlayhead(durationMs, ms) {
  return clampMs(ms, durationMs);
}

// The ruler's labels: `count` evenly spaced ticks plus the end.
export function rulerTicks(durationMs, count) {
  const length = Math.max(0, Number(durationMs) || 0);
  const n = Math.max(1, Math.round(count) || 1);
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const ms = Math.round((length * i) / n);
    out.push({ ms, label: formatTimecode(ms), pct: n ? (i / n) * 100 : 0 });
  }
  return out;
}

// A clip's trim handle writes trim_in_ms; a bad value can never make a block
// shorter than one frame or push it past the project's end.
export function withTrim(clip, trimInMs, durationMs) {
  const start = clampMs(clip.startMs, durationMs);
  const end = Math.max(start + 250, clampMs(clip.endMs, durationMs));
  const maxTrim = Math.max(0, end - start - 250);
  const trim = Math.max(0, Math.min(maxTrim, Math.round(Number(trimInMs) || 0)));
  return Object.assign({}, clip, { startMs: start, endMs: end, trimInMs: trim });
}

// Every clip, clamped to the project, so a stale row cannot draw past the end
// or with a negative length.
export function normaliseClips(clips, durationMs) {
  return (Array.isArray(clips) ? clips : []).map((c) => withTrim(c, c.trimInMs, durationMs));
}

// The lanes the timeline draws: one per track, in order, each carrying its
// clips with their place on the lane as a percentage of the project.
export function trackModel(tracks, clips, media, durationMs) {
  const length = Math.max(1, Number(durationMs) || 1);
  const byMedia = new Map((Array.isArray(media) ? media : []).map((m) => [String(m.id), m]));
  const safeClips = normaliseClips(clips, length);
  return (Array.isArray(tracks) ? tracks : [])
    .slice()
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((track) => ({
      track,
      clips: safeClips
        .filter((c) => String(c.trackId) === String(track.id))
        .sort((a, b) => a.startMs - b.startMs)
        .map((c) => {
          const item = c.mediaId != null ? byMedia.get(String(c.mediaId)) : null;
          return Object.assign({}, c, {
            title: c.label || (item && item.title) || 'Untitled block',
            simulated: c.simulated !== false,
            leftPct: (c.startMs / length) * 100,
            widthPct: Math.max(0.5, ((c.endMs - c.startMs) / length) * 100),
            trimPct: ((c.trimInMs || 0) / length) * 100,
          });
        }),
    }));
}

// What is under the playhead on each lane, so the preview can name the clip
// that is showing.
export function clipAt(clips, ms) {
  const at = Number(ms) || 0;
  return (Array.isArray(clips) ? clips : []).filter((c) => c.startMs <= at && at < c.endMs);
}

// The next free place on a lane: after its last block, or at the playhead if
// that is later, never past the end.
export function nextSlot(laneClips, playheadMs, lengthMs, durationMs) {
  const length = Math.max(0, Number(durationMs) || 0);
  const after = (Array.isArray(laneClips) ? laneClips : []).reduce((top, c) => Math.max(top, c.endMs), 0);
  const start = clampMs(Math.max(after, playheadMs || 0), length);
  const want = Math.max(250, Number(lengthMs) || 5000);
  const end = Math.min(length, start + want);
  if (end - start < 250) return null;
  return { startMs: start, endMs: end };
}
