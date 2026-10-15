// GameWatch's LCD picture pipeline.
//
// One job: turn the viewer's Settings into the pixels the handheld's screen
// shows. Every title draws into a low-resolution backbuffer (the panel's own
// segment grid), and this module scales that backbuffer onto the visible
// canvas applying the Settings the viewer set: gamma, brightness, contrast,
// scanlines and curvature. A title's rules never touch the DOM, so they are
// testable without any of this.

// The panel's native segment grid. A 1996 handheld LCD had a fixed, small
// dot grid and no aspect choice, so drawing at this size and blowing it up by
// a whole number is what gives the panel its chunky segments: a look decision
// as much as a performance one.
export const VIDEO_W = 320;
export const VIDEO_H = 200;

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// Everything the Settings screen can change, in one object, so a title, the
// preview and the picture all read the same numbers.
export const DEFAULT_SETTINGS = {
  volume: 70,
  gamma: 1,
  brightness: 0,
  scanline: 35,
  contrast: 0,
  curvature: 30,
};

// The range each setting is clamped into, shared with the server's own clamp
// by value rather than by reference (the server is a separate process).
export const SETTING_RANGE = {
  volume: [0, 100],
  gamma: [0.5, 2],
  brightness: [-50, 50],
  scanline: [0, 100],
  contrast: [-50, 50],
  curvature: [0, 100],
};

// Clamp anything that arrives from the server, storage or a slider into the
// range the handheld promises. A missing or broken value falls back to the
// default rather than throwing.
export function normalizeSettings(raw) {
  const s = Object.assign({}, DEFAULT_SETTINGS, raw || {});
  const gamma = Number(s.gamma);
  return {
    volume: clampInt(s.volume, 0, 100),
    gamma: Number.isFinite(gamma) ? Math.max(0.5, Math.min(2, gamma)) : DEFAULT_SETTINGS.gamma,
    brightness: clampInt(s.brightness, -50, 50),
    scanline: clampInt(s.scanline, 0, 100),
    contrast: clampInt(s.contrast, -50, 50),
    curvature: clampInt(s.curvature, 0, 100),
  };
}

// The readout lines the handheld prints for the current settings. This is the
// single place the numbers become words, so the Settings screen, the Arcade's
// readout and the Terminal's SYSINFO can never drift apart.
export function describeSettings(raw) {
  const v = normalizeSettings(raw);
  return [
    'PANEL: scanlines ' + v.scanline + ' | curvature ' + v.curvature,
    'SOUND: ' + v.volume,
    'PICTURE: gamma ' + v.gamma.toFixed(2)
      + ' | brightness ' + (v.brightness > 0 ? '+' : '') + v.brightness
      + ' | contrast ' + (v.contrast > 0 ? '+' : '') + v.contrast,
  ];
}

// The visible height, in whole canvas pixels, for a picture `width` device
// pixels wide. A handheld panel has one shape, so there is nothing to choose.
export function heightForWidth(width) {
  return Math.round((width * VIDEO_H) / VIDEO_W);
}

/* ── The picture ─────────────────────────────────────────────────────────── */

// The panel: an off-screen backbuffer a title paints segments onto, plus the
// visible canvas the pipeline scales it onto.
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

  // A 2D filter string for the three settings that are pure colour maths.
  // Contrast is a real filter strength, not a decoration.
  function filterString(s) {
    const parts = [];
    if (s.brightness) parts.push('brightness(' + (1 + s.brightness / 100).toFixed(3) + ')');
    if (s.gamma !== 1) parts.push('gamma(' + s.gamma.toFixed(3) + ')');
    if (s.contrast) parts.push('contrast(' + (1 + s.contrast / 100).toFixed(3) + ')');
    return parts.length ? parts.join(' ') : 'none';
  }

  // The viewer's settings, applied to the next presented frame.
  picture.applySettings = function (raw) {
    picture.settings = normalizeSettings(raw);
  };

  // Size the visible canvas to a whole multiple of the segment grid, so every
  // backbuffer pixel lands on an exact block of screen pixels and a
  // screenshot of two builds is comparable. The multiple is chosen from the
  // canvas's own laid-out width, which is why this works at any frame size
  // without a title knowing anything about it.
  picture.resize = function () {
    const box = canvas.parentElement || canvas;
    const cssWidth = Math.max(VIDEO_W, Math.round(box.clientWidth || VIDEO_W));
    const scale = Math.max(1, Math.floor(cssWidth / VIDEO_W));
    const shownW = VIDEO_W * scale;
    const shownH = heightForWidth(shownW);
    canvas.width = shownW;
    canvas.height = shownH;
    canvas.style.width = shownW + 'px';
    canvas.style.height = shownH + 'px';
    ctx.imageSmoothingEnabled = false;
  };

  // Paint the frame: the title's backbuffer, then the panel effects. A title
  // calls present() once per drawn frame; the pipeline owns everything after
  // the backbuffer.
  picture.present = function () {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.filter = filterString(picture.settings);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(back, 0, 0, w, h);
    ctx.filter = 'none';
    // Scanlines: thin dark rows over the panel. The strength is the viewer's
    // Scanline setting, and the pitch follows the zoom so the lines stay one
    // visible row apart however big the panel is.
    const strength = picture.settings.scanline / 100;
    if (strength > 0) {
      const step = Math.max(2, Math.round(h / (VIDEO_H * 0.75)));
      ctx.fillStyle = 'rgba(6, 8, 10, ' + (0.45 * strength).toFixed(3) + ')';
      for (let y = step - 1; y < h; y += step) ctx.fillRect(0, y, w, 1);
    }
    // Curvature: the tube's corner falloff, in the app's own ground colour.
    // It is a real strength: at 0 the panel is flat, and the higher the
    // setting the further in the falloff starts and the darker it gets. The
    // shell mirrors the same number onto its own glass frame.
    const k = picture.settings.curvature / 100;
    if (k > 0) {
      const rMax = Math.hypot(w, h) / 2;
      const grad = ctx.createRadialGradient(
        w / 2, h / 2, rMax * (1 - 0.8 * k),
        w / 2, h / 2, rMax,
      );
      grad.addColorStop(0, 'rgba(6,8,10,0)');
      grad.addColorStop(0.72, 'rgba(6,8,10,' + (0.34 * k).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(6,8,10,' + (0.9 * k).toFixed(3) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  };

  // Clear the backbuffer to a colour (the panel's own ground by default).
  picture.clear = function (fill) {
    picture.bctx.fillStyle = fill || '#9aa892';
    picture.bctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  };

  picture.resize();
  return picture;
}

// The frame loop every title runs on. `step(dtMs)` advances the simulation
// and `draw()` paints the backbuffer; both run on every animation frame, so
// what a title does never depends on how fast the device draws.
export function startLoop(picture, step, draw) {
  let raf = 0;
  let last = 0;
  let stopped = false;

  function tick(now) {
    if (stopped) return;
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    if (typeof step === 'function') step(dt);
    draw();
    picture.present();
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);
  return function stop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
}
