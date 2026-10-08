// QuestVerse background music.
//
// A creator attaches one track (.mp3 or .aac) to any choice in a built-in
// title. When a player picks that choice, its track starts looping as the
// background music and replaces whatever was playing; a choice with no track
// leaves the current music alone.
//
// Where a track lives: the Creator Studio first offers it to the platform's
// file storage (usernode.uploadFile). That store only takes images today, so
// when it refuses, the track is kept in this browser's IndexedDB instead,
// the same browser the Creator Studio keeps its listings in. The index of
// which choice has which track sits in localStorage at qv1:<uid>:music.

const STORE_VERSION = 1;
export const MAX_TRACK_BYTES = 10 * 1024 * 1024;
const PLATFORM_MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPT = '.mp3,.aac,audio/mpeg,audio/mp3,audio/aac,audio/x-aac';

const DB_NAME = 'questverse-music';
const DB_STORE = 'tracks';

// One id per action trigger: the title, the stage it is offered in, and the
// choice key the player picks.
export function triggerKey(titleId, stageIndex, choiceKey) {
  return titleId + ':' + stageIndex + ':' + choiceKey;
}

/* ── Validation ────────────────────────────────────────────────────────── */

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// MP3 starts with an ID3 tag or an MPEG frame sync; raw AAC (ADTS) starts
// with the same 12-bit sync word. Anything else is not a track we can play.
export function looksLikeAudio(bytes) {
  if (!bytes || bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true; // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

// Returns null when the file can be used, or the message to show.
export async function validateTrackFile(file) {
  if (!file) return 'Choose an .mp3 or .aac file.';
  const ext = extOf(file.name);
  if (ext !== 'mp3' && ext !== 'aac') return 'Only .mp3 or .aac files can be used.';
  if (file.size > MAX_TRACK_BYTES) return 'This track is over 10 MB. Pick a shorter or smaller file.';
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (!looksLikeAudio(head)) return 'This file is not a playable .mp3 or .aac track.';
  } catch {
    return 'Could not read this file. Try again.';
  }
  return null;
}

/* ── Index (localStorage) ──────────────────────────────────────────────── */

function ns(uid) { return 'qv1:' + uid + ':music'; }

export function readTracks(uid) {
  try {
    const raw = window.localStorage.getItem(ns(uid));
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed.tracks === 'object' && parsed.tracks) || {};
  } catch {
    return {};
  }
}

function writeTracks(uid, tracks) {
  window.localStorage.setItem(ns(uid), JSON.stringify({ v: STORE_VERSION, tracks }));
}

/* ── Local track bytes (IndexedDB) ─────────────────────────────────────── */

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

async function dbRun(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function blobKey(uid, key) { return uid + '|' + key; }

/* ── Save, remove, resolve ─────────────────────────────────────────────── */

const urlCache = new Map(); // blobKey -> object URL for a local track

async function uploadToPlatform(file) {
  const u = window.usernode;
  if (!u || typeof u.uploadFile !== 'function' || file.size > PLATFORM_MAX_BYTES) return null;
  try {
    const stored = await u.uploadFile(file, { visibility: 'public' });
    return stored && stored.url ? stored : null;
  } catch {
    return null; // refused (images only today) or no platform shell
  }
}

// Stores the file for this trigger, replacing any track it had. Resolves the
// stored record; throws when neither the platform nor this browser can keep it.
export async function saveTrack(uid, key, file) {
  const record = {
    name: file.name, type: file.type || (extOf(file.name) === 'aac' ? 'audio/aac' : 'audio/mpeg'),
    size: file.size, addedAt: Date.now(),
  };
  const stored = await uploadToPlatform(file);
  if (stored) {
    record.source = 'platform';
    record.url = stored.url;
    record.fileId = stored.id;
  } else {
    await dbRun('readwrite', (s) => s.put(file, blobKey(uid, key)));
    record.source = 'local';
  }
  const previous = readTracks(uid)[key];
  const tracks = readTracks(uid);
  tracks[key] = record;
  writeTracks(uid, tracks);
  await forgetBytes(uid, key, previous, record);
  return record;
}

async function forgetBytes(uid, key, previous, keep) {
  if (!previous) return;
  if (previous.source === 'platform' && previous.fileId && (!keep || keep.fileId !== previous.fileId)) {
    try { await window.usernode.deleteFile(previous.fileId); } catch { /* already gone */ }
  }
  if (previous.source === 'local' && (!keep || keep.source !== 'local')) {
    try { await dbRun('readwrite', (s) => s.delete(blobKey(uid, key))); } catch { /* ignore */ }
  }
  const bk = blobKey(uid, key);
  if (urlCache.has(bk)) { URL.revokeObjectURL(urlCache.get(bk)); urlCache.delete(bk); }
}

export async function removeTrack(uid, key) {
  const tracks = readTracks(uid);
  const previous = tracks[key];
  delete tracks[key];
  writeTracks(uid, tracks);
  await forgetBytes(uid, key, previous, null);
}

// A playable URL for the trigger's track, or null when it has none.
export async function trackUrl(uid, key) {
  const rec = readTracks(uid)[key];
  if (!rec) return null;
  if (rec.source === 'platform') return rec.url || null;
  const bk = blobKey(uid, key);
  if (urlCache.has(bk)) return urlCache.get(bk);
  const blob = await dbRun('readonly', (s) => s.get(bk));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(bk, url);
  return url;
}

/* ── Playback ──────────────────────────────────────────────────────────── */

// One shared element: the game's background music and the studio preview
// both go through it, so starting one always replaces the other.
let audio = null;
let playingKey = null;
let pausedByHide = false;
let muted = false;

function player() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => { if (!audio.loop) playingKey = null; notify(); });
  }
  return audio;
}

const listeners = new Set();
function notify() { for (const fn of listeners) { try { fn(playingKey); } catch { /* ignore */ } } }
export function onPlaybackChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function nowPlaying() { return playingKey; }

// Call this synchronously inside a tap handler with an already resolved URL:
// phones only let audio start from a user gesture.
export function playUrl(key, url, { loop = true } = {}) {
  const a = player();
  playingKey = key;
  a.loop = loop;
  a.muted = muted;
  if (a.src !== url) a.src = url;
  a.currentTime = 0;
  const p = a.play();
  if (p && p.catch) p.catch(() => { if (playingKey === key) { playingKey = null; notify(); } });
  notify();
}

export function stopMusic() {
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  playingKey = null;
  pausedByHide = false;
  notify();
}

export function setMuted(on) {
  muted = !!on;
  if (audio) audio.muted = muted;
}
export function isMuted() { return muted; }

// Resolves every track URL for a title ahead of time, so a choice tap can
// start its music synchronously. Returns Map<triggerKey, url>.
export async function preloadTitle(uid, title) {
  const out = new Map();
  const tracks = readTracks(uid);
  const prefix = title.id + ':';
  for (const key of Object.keys(tracks)) {
    if (!key.startsWith(prefix)) continue;
    try {
      const url = await trackUrl(uid, key);
      if (url) out.set(key, url);
    } catch { /* a missing local track just stays silent */ }
  }
  return out;
}

// The shell keeps hidden apps loaded; pause while nobody is looking.
window.addEventListener('usernode:visibility-changed', (e) => {
  if (!audio || !playingKey) return;
  if (e.detail && e.detail.hidden) {
    if (!audio.paused) { audio.pause(); pausedByHide = true; }
  } else if (pausedByHide) {
    pausedByHide = false;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }
});
