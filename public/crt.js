// RetroRig's CRT picture pipeline.
//
// One job: turn the viewer's Settings into the pixels a screen shows. Every
// built-in game draws into a low-resolution backbuffer (the rig's own video
// card), and this module scales that backbuffer onto the visible canvas
// applying the Settings the viewer set: gamma, brightness, scanlines and
// aspect. A game's rules never touch the DOM, so they are testable without
// any of this.

// The rig's native video mode. A 1996 desktop ran at a low resolution and
// the monitor stretched it; drawing at this size and blowing it up is what
// gives the rig its chunky pixels, so it is a look decision as much as a
// performance one.
export const VIDEO_W = 320;
export const VIDEO_H = 200;

// The aspect ratios the Aspect slider picks from, as visible width / height.
// 4:3 is the period-correct default: 320x200 was displayed on a 4:3 tube,
// which is why its pixels were taller than they were wide.
export const ASPECTS = [
  { key: '4:3', label: '4:3', value: 4 / 3 },
  { key: '16:10', label: '16:10', value: 16 / 10 },
  { key: '16:9', label: '16:9', value: 16 / 9 },
  { key: 'stretch', label: 'Stretch', value: 0 },
];

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function aspectLabel(index) {
  const a = ASPECTS[clampInt(index, 0, ASPECTS.length - 1)];
  return a ? a.label : ASPECTS[0].label;
}

export function aspectValue(index) {
  const a = ASPECTS[clampInt(index, 0, ASPECTS.length - 1)];
  return a ? a.value : ASPECTS[0].value;
}

// Everything the Settings window can change, in one object, so a game, the
// preview and the picture all read the same numbers.
export const DEFAULT_SETTINGS = {
  volume: 70,
  gamma: 1,
  brightness: 0,
  scanline: 35,
  aspect: 0,
  frameSkip: 0,
};

export const FRAME_SKIP_LABELS = ['Off', 'Every other frame', 'Every third frame'];

// Clamp anything that arrives from the server, storage or a slider into the
// range the rig promises. A missing or broken value falls back to the
// default rather than throwing.
export function normalizeSettings(raw) {
  const s = Object.assign({}, DEFAULT_SETTINGS, raw || {});
  const gamma = Number(s.gamma);
  return {
    volume: clampInt(s.volume, 0, 100),
    gamma: Number.isFinite(gamma) ? Math.max(0.5, Math.min(2, gamma)) : DEFAULT_SETTINGS.gamma,
    brightness: clampInt(s.brightness, -50, 50),
    scanline: clampInt(s.scanline, 0, 100),
    aspect: clampInt(s.aspect, 0, ASPECTS.length - 1),
    frameSkip: clampInt(s.frameSkip, 0, 2),
  };
}

// The readout lines the rig prints for the current settings. Used by the
// Settings window, the desktop readout and the DOS prompt's VER command.
export function describeSettings(raw) {
  const v = normalizeSettings(raw);
  return [
    'DISPLAY: ' + aspectLabel(v.aspect) + ' | scanlines ' + v.scanline
      + ' | frame skip ' + FRAME_SKIP_LABELS[v.frameSkip].toLowerCase(),
    'SOUND: ' + v.volume,
    'PICTURE: gamma ' + v.gamma.toFixed(2)
      + ' | brightness ' + (v.brightness > 0 ? '+' : '') + v.brightness,
  ];
}

// The visible height, in whole canvas pixels, for a picture `width` device
// pixels wide at a given aspect index.
export function heightForWidth(width, aspectIndex) {
  const want = aspectValue(aspectIndex);
  if (!want) return Math.round(width * (VIDEO_H / VIDEO_W));
  return Math.round(width / want);
}

/* ── The picture ─────────────────────────────────────────────────────────── */

// A CRT picture: an off-screen backbuffer a game paints, plus the visible
// canvas the pipeline scales it onto.
export function createPicture(canvas) {
  const back = document.createElement('canvas');
  back.width = VIDEO_W;
  back.height = VIDEO_H;
  const bctx = back.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  const ctx = canvas.getContext('2d');

  const picture = {
    canvas,
    ctx,
    back,
    bctx,
    settings: normalizeSettings(null),
  };

  // A 2D filter string for the two settings that are pure colour maths.
  function filterString(s) {
    const parts = [];
    if (s.brightness) parts.push('brightness(' + (1 + s.brightness / 100).toFixed(3) + ')');
    if (s.gamma !== 1) parts.push('gamma(' + s.gamma.toFixed(3) + ')');
    return parts.length ? parts.join(' ') : 'none';
  }

  // The viewer's settings, applied to the next presented frame.
  picture.applySettings = function (raw) {
    picture.settings = normalizeSettings(raw);
  };

  // Size the visible canvas to a whole multiple of the video mode, so every
  // backbuffer pixel lands on an exact block of screen pixels and a
  // screenshot of two builds is comparable. The multiple is chosen from the
  // canvas's own laid-out width, which is why this works at any frame size
  // without a game knowing anything about it.
  picture.resize = function () {
    const box = canvas.parentElement || canvas;
    const cssWidth = Math.max(VIDEO_W, Math.round(box.clientWidth || VIDEO_W));
    const scale = Math.max(1, Math.floor(cssWidth / VIDEO_W));
    const shownW = VIDEO_W * scale;
    const shownH = heightForWidth(shownW, picture.settings.aspect);
    canvas.width = shownW;
    canvas.height = shownH;
    canvas.style.width = shownW + 'px';
    canvas.style.height = shownH + 'px';
    ctx.imageSmoothingEnabled = false;
  };

  // Paint the frame: the game's backbuffer, then the CRT effects. Games call
  // present() once per drawn frame; the pipeline owns everything after the
  // backbuffer.
  picture.present = function () {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.filter = filterString(picture.settings);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(back, 0, 0, w, h);
    ctx.filter = 'none';
    // Scanlines: thin dark rows over the picture. The strength is the
    // viewer's Scanline setting, and the pitch follows the zoom so the lines
    // stay one visible row apart however big the screen is.
    const strength = picture.settings.scanline / 100;
    if (strength > 0) {
      const step = Math.max(2, Math.round(h / (VIDEO_H * 0.75)));
      ctx.fillStyle = 'rgba(0, 0, 0, ' + (0.55 * strength).toFixed(3) + ')';
      for (let y = step - 1; y < h; y += step) ctx.fillRect(0, y, w, 1);
    }
    // The tube's corner falloff, in the app's own ground colour.
    const grad = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42,
      w / 2, h / 2, Math.max(w, h) * 0.72,
    );
    grad.addColorStop(0, 'rgba(6,8,10,0)');
    grad.addColorStop(1, 'rgba(6,8,10,0.62)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  // Clear the backbuffer to a colour (the rig's screen ground by default).
  picture.clear = function (fill) {
    picture.bctx.fillStyle = fill || '#06080a';
    picture.bctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  };

  picture.resize();
  return picture;
}

// A game loop that honours frame skip. `step(dtMs)` always runs (the
// simulation keeps up); `draw()` runs on whole skipped frames only, which is
// what the setting meant on the period hardware. Returns a stop function.
export function startLoop(picture, step, draw) {
  let raf = 0;
  let last = 0;
  let frame = 0;
  let stopped = false;

  function tick(now) {
    if (stopped) return;
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    if (typeof step === 'function') step(dt);
    const skip = normalizeSettings(picture.settings).frameSkip;
    const drawThisFrame = skip === 0 || (frame % (skip + 1) === 0);
    frame += 1;
    if (drawThisFrame) {
      draw();
      picture.present();
    }
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);
  return function stop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
}
