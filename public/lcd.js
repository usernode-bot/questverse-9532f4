// GameWatch's LCD segment kit.
//
// The handheld's panel is not a canvas of smooth pixels: it is a fixed grid of
// segments that are either printed on the glass, lit, or dark. This module is
// the small vocabulary every title draws with, so eight titles share one look
// and no title has to know how a panel works.
//
// Nothing here touches the DOM beyond creating an offscreen canvas, and
// nothing here keeps state: a caller passes a context and the numbers, and
// gets segments back. The picture pipeline in crt.js owns everything after
// the backbuffer.

import { VIDEO_W, VIDEO_H } from './crt.js';

// The off state of the panel: a green-grey LCD, the colour a segment shows
// when it is not energised.
export const LCD_GROUND = '#9aa892';
// A lit segment: the panel's ink.
export const LCD_INK = '#22301f';
// A segment that is printed on the glass but not lit. Everything the player
// can move around is printed, so the panel reads as a real one.
export const LCD_GHOST = 'rgba(34, 48, 31, 0.16)';
// The darker ghost a printed label or a dial uses, so it is legible on the
// ground without ever looking lit.
export const LCD_PALE = 'rgba(34, 48, 31, 0.42)';
// The panel's one accent, used for a caution cell and for a win or loss mark.
export const LCD_WARN = '#7a3d12';
// A dim ink, for a value that is present but not the one being read.
export const LCD_DIM = 'rgba(34, 48, 31, 0.55)';

/* ── Segment art ────────────────────────────────────────────────────────── */

// A piece of segment art, written as rows of characters:
//   ' ' or '.'  nothing
//   '#'         a segment
//   'o'         a segment that is often drawn in another colour (a lamp)
//   '+'         a segment on the other half of a symmetric piece
// The rows are turned into a rectangle list once, at import time, so drawing
// a piece is a run of fillRects rather than a per-pixel loop.
export function art(rows) {
  const h = rows.length;
  const w = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const runs = [];
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      const ch = rows[y][x] || ' ';
      if (ch === ' ' || ch === '.') { x += 1; continue; }
      let end = x;
      while (end < w && (rows[y][end] || ' ') === ch) end += 1;
      runs.push({ x, y, w: end - x, ch });
      x = end;
    }
  }
  return { w, h, runs };
}

// Draw a piece at (x, y). `palette` maps a character to a colour, which is
// how one piece is a printed ghost in one place and lit ink in another. The
// coordinates are rounded so segments always land on the dot grid.
export function blit(ctx, piece, x, y, palette) {
  const map = palette || {};
  const ox = Math.round(x);
  const oy = Math.round(y);
  for (const r of piece.runs) {
    const colour = map[r.ch] || map['#'] || LCD_INK;
    ctx.fillStyle = colour;
    ctx.fillRect(ox + r.x, oy + r.y, r.w, 1);
  }
}

/* ── Seven-segment numbers ──────────────────────────────────────────────── */

// The segments a digit lights, as the classic seven-segment set: a is the
// top bar, b top right, c bottom right, d the bottom bar, e bottom left,
// f top left and g the middle bar.
const DIGIT_SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
  A: 'abcefg',
  B: 'cdefg',
  C: 'adef',
  D: 'bcdeg',
  E: 'adefg',
  F: 'aefg',
  H: 'bcefg',
  L: 'def',
  P: 'abefg',
  '-': 'g',
  ' ': '',
};

// One seven-segment character, drawn from simple rectangles. `thickness` is
// the weight of a bar, `gap` the space between a bar and the corner beside
// it, so a bigger digit stays crisp.
export function segmentChar(ctx, ch, x, y, o, colour) {
  const opts = o || {};
  const w = opts.width || 10;
  const h = opts.height || 18;
  const t = opts.thickness || Math.max(2, Math.round(h / 7));
  const g = opts.gap == null ? 1 : opts.gap;
  const on = DIGIT_SEGMENTS[String(ch).toUpperCase()] || '';
  const px = Math.round(x);
  const py = Math.round(y);
  const half = Math.round(h / 2);
  ctx.fillStyle = colour || LCD_INK;
  const bar = (bx, by, bw, bh) => ctx.fillRect(px + bx, py + by, bw, bh);
  if (on.includes('a')) bar(t + g, 0, w - 2 * (t + g), t);
  if (on.includes('g')) bar(t + g, half - Math.floor(t / 2), w - 2 * (t + g), t);
  if (on.includes('d')) bar(t + g, h - t, w - 2 * (t + g), t);
  if (on.includes('f')) bar(0, t + g, t, half - t - 2 * g);
  if (on.includes('b')) bar(w - t, t + g, t, half - t - 2 * g);
  if (on.includes('e')) bar(0, half + g, t, half - t - 2 * g);
  if (on.includes('c')) bar(w - t, half + g, t, half - t - 2 * g);
}

// A whole number in the panel's own digits, right-aligned into `digits`
// cells, with leading cells left blank (a dash when `blank` says so). A
// value too wide for its cells keeps its last cells, which is what a real
// panel does when a score rolls past its display.
export function segmentNumber(ctx, value, x, y, o, digits) {
  const opts = Object.assign({}, o || {});
  const cells = digits || 3;
  const step = (opts.width || 10) + (opts.spacing == null ? 3 : opts.spacing);
  const text = String(value == null ? '' : value);
  const shown = text.length > cells ? text.slice(text.length - cells) : text.padStart(cells, ' ');
  for (let i = 0; i < cells; i += 1) {
    segmentChar(ctx, shown[i], x + i * step, y, opts, opts.colour);
  }
  return cells * step;
}

/* ── Printed labels and dials ───────────────────────────────────────────── */

// A label PRINTED on the glass (the panel's own printing, never lit).
export function printed(ctx, text, x, y, o) {
  const opts = o || {};
  ctx.fillStyle = opts.colour || LCD_PALE;
  ctx.font = 'bold ' + (opts.size || 8) + 'px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = opts.align || 'left';
  ctx.fillText(String(text), Math.round(x), Math.round(y));
  ctx.textAlign = 'left';
}

// A lit readout line, for the small values a title shows in words.
export function lit(ctx, text, x, y, o) {
  printed(ctx, text, x, y, Object.assign({}, o || {}, { colour: LCD_INK }));
}

/* ── The panel itself ───────────────────────────────────────────────────── */

// Start a frame: the LCD ground, then the printed furniture every title
// shares. A title calls this first, paints its segments, and the pipeline
// presents the result.
export function beginPanel(picture, o) {
  const opts = o || {};
  const ctx = picture.bctx;
  picture.clear(opts.ground || LCD_GROUND);
  // The panel's dot grid: a faint one-pixel lattice, which is what makes a
  // block of segments read as a printed panel rather than a drawn picture.
  ctx.fillStyle = 'rgba(34, 48, 31, 0.06)';
  for (let y = 3; y < VIDEO_H; y += 4) {
    for (let x = 3; x < VIDEO_W; x += 4) ctx.fillRect(x, y, 1, 1);
  }
  return ctx;
}

// The panel's outer frame and the game's own score strip, both shared so the
// eight titles line up with each other in a screenshot.
export function frame(ctx, o) {
  const opts = o || {};
  ctx.fillStyle = 'rgba(34, 48, 31, 0.55)';
  ctx.fillRect(3, 3, VIDEO_W - 6, 1);
  ctx.fillRect(3, VIDEO_H - 4, VIDEO_W - 6, 1);
  ctx.fillRect(3, 3, 1, VIDEO_H - 6);
  ctx.fillRect(VIDEO_W - 4, 3, 1, VIDEO_H - 6);
  if (opts.label) printed(ctx, opts.label, 8, 8, { size: 8 });
  if (opts.right) {
    printed(ctx, opts.right, VIDEO_W - 8, 8, { size: 8, align: 'right' });
  }
}

// A segmented progress bar, the panel way to show a budget or a fill: it is
// drawn as a row of cells, empty ones printed and filled ones lit.
export function cellBar(ctx, x, y, cells, filled, o) {
  const opts = o || {};
  const w = opts.cellWidth || 8;
  const h = opts.height || 6;
  const gap = opts.gap == null ? 2 : opts.gap;
  for (let i = 0; i < cells; i += 1) {
    const on = i < Math.max(0, Math.min(cells, filled));
    ctx.fillStyle = on ? (opts.colour || LCD_INK) : (opts.empty || LCD_GHOST);
    ctx.fillRect(Math.round(x + i * (w + gap)), Math.round(y), w, h);
  }
}
