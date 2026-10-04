// QuestVerse Creator Studio (admin).
//
// A small publishing overlay on top of the fixed catalog: any game can be
// added, edited, previewed or removed, and the listing is stored in the
// browser (localStorage) so it survives a reload. A stored listing only
// overrides what the catalog ships with; removing an override restores the
// built-in title.

import { CATALOG } from './catalog.js';
import { el } from './dom.js';

const STORE_VERSION = 1;

// The five built-in titles as editable listings, so the admin list and the
// arcade show a game that was never touched in the Creator Studio too.
export const DEFAULT_LISTINGS = CATALOG.map((t) => ({
  id: t.id,
  title: t.title,
  tagline: t.tagline,
  tags: (t.tags || []).join(', '),
  author: t.publisher || '',
  banner: '',
  story: [t.lore, t.background].filter(Boolean).join(' '),
  startScene: t.opening || '',
  inventory: (t.startingInventory || []).join(', '),
  embedUrl: 'internal:' + t.id,
}));

export const KEYS = [
  'title', 'tagline', 'tags', 'author', 'banner',
  'story', 'startScene', 'inventory', 'embedUrl',
];

function ns(uid) { return 'qv1:' + uid + ':listings'; }

function isListing(l) {
  return !!l && typeof l.id === 'string' && !!l.id && typeof l.title === 'string';
}

function readStore(uid) {
  try {
    const raw = window.localStorage.getItem(ns(uid));
    if (!raw) return { overrides: {}, deleted: [] };
    const parsed = JSON.parse(raw);
    const overrides = (parsed && typeof parsed.overrides === 'object' && parsed.overrides) || {};
    const deleted = Array.isArray(parsed && parsed.deleted) ? parsed.deleted : [];
    return { overrides, deleted };
  } catch {
    return { overrides: {}, deleted: [] };
  }
}

function writeStore(uid, store) {
  try {
    window.localStorage.setItem(ns(uid), JSON.stringify({
      v: STORE_VERSION, overrides: store.overrides, deleted: store.deleted,
    }));
    return true;
  } catch {
    return false;
  }
}

// The catalog the arcade reads: the built-in five, with any stored override
// winning by id, minus anything removed in the Creator Studio.
export function loadListings(uid) {
  const store = readStore(uid);
  const byId = new Map();
  for (const d of DEFAULT_LISTINGS) byId.set(d.id, Object.assign({}, d, { builtIn: true }));
  for (const [id, l] of Object.entries(store.overrides)) {
    if (!isListing(l)) continue;
    byId.set(id, Object.assign({}, l, { builtIn: CATALOG.some((t) => t.id === id) }));
  }
  for (const id of store.deleted) byId.delete(id);
  return [...byId.values()];
}

export function saveListing(uid, listing) {
  const store = readStore(uid);
  store.overrides[listing.id] = listing;
  store.deleted = store.deleted.filter((id) => id !== listing.id);
  return writeStore(uid, store);
}

export function deleteListing(uid, id) {
  const store = readStore(uid);
  delete store.overrides[id];
  if (!store.deleted.includes(id)) store.deleted.push(id);
  return writeStore(uid, store);
}

// Restore a built-in title: drop the override and the tombstone, so the
// catalog's own listing shows again.
export function resetListing(uid, id) {
  const store = readStore(uid);
  delete store.overrides[id];
  store.deleted = store.deleted.filter((x) => x !== id);
  return writeStore(uid, store);
}

export function findListing(catalog, id) {
  return catalog.find((l) => l.id === id) || null;
}

// The admin list, which also shows a built-in title that was removed so it
// can be restored. `removed` marks a built-in missing from the catalog;
// `overridden` marks a built-in carrying a stored edit of its own.
export function adminListings(uid) {
  const store = readStore(uid);
  const present = new Map(loadListings(uid).map((l) => [l.id, l]));
  const builtInIds = new Set(DEFAULT_LISTINGS.map((d) => d.id));
  const rows = [];
  for (const d of DEFAULT_LISTINGS) {
    const cur = present.get(d.id);
    if (cur) rows.push(Object.assign({}, cur, { builtIn: true, removed: false, overridden: !!store.overrides[d.id] }));
    else rows.push(Object.assign({}, d, { builtIn: true, removed: true, overridden: false }));
  }
  for (const l of present.values()) {
    if (!builtInIds.has(l.id)) rows.push(Object.assign({}, l, { builtIn: false, removed: false, overridden: true }));
  }
  return rows;
}

// Trim every field into the shape that is stored and rendered.
export function normalizeListing(form) {
  const out = { id: form.id };
  for (const key of KEYS) out[key] = String(form[key] || '').trim();
  return out;
}

export function emptyForm() {
  const form = { id: '' };
  for (const key of KEYS) form[key] = '';
  return form;
}

// Deterministic id from the title, made unique against the ids already in
// use. No random component, so a saved game keeps the same address.
function slug(title) {
  return String(title || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function newListingId(title, taken) {
  const head = slug(title) || 'new-game';
  const used = new Set(taken || []);
  let id = head;
  let n = 2;
  while (used.has(id)) { id = head + '-' + n; n += 1; }
  return id;
}

// The embed source decides how the game opens: `internal:<title-id>` runs
// QuestVerse's own engine, an https URL is embedded in a frame.
export function embedKind(embedUrl) {
  const v = String(embedUrl || '').trim();
  if (/^internal:\S+/.test(v)) return 'internal';
  if (/^https:\/\//i.test(v)) return 'iframe';
  return 'invalid';
}

export function internalId(embedUrl) {
  const m = /^internal:(\S+)$/.exec(String(embedUrl || '').trim());
  return m ? m[1] : null;
}

// What each field must have before it can be saved. The embed source is the
// only one with a shape rule beyond "not empty".
export function validateListing(form) {
  const errors = [];
  const need = (field, message) => { if (!String(form[field] || '').trim()) errors.push({ field, message }); };
  need('title', 'Add a game title.');
  need('tagline', 'Add a tagline.');
  need('tags', 'Add at least one tag, separated by commas.');
  need('author', 'Add a publisher or author.');
  need('story', 'Add a short story summary.');
  need('startScene', 'Add the starting scene text.');
  need('inventory', 'Add at least one inventory item, separated by commas.');
  need('embedUrl', 'Add an embed source, either internal:<title-id> or an https URL.');
  if (String(form.embedUrl || '').trim() && embedKind(form.embedUrl) === 'invalid') {
    errors.push({ field: 'embedUrl', message: 'Use internal:<title-id> or an https URL.' });
  }
  return errors;
}

/* ── Creator Studio screen ─────────────────────────────────────────────── */

function thumbFallback() {
  return '<svg viewBox="0 0 24 24" class="thumb-svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">' +
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/>' +
    '<path d="M21 16l-5-5-6 6-2-2-4 4"/></svg>';
}

function thumb(listing) {
  const svg = el('div', { class: 'thumb-fallback', html: thumbFallback() });
  const wrap = el('div', { class: 'thumb' }, svg);
  if (listing.banner) {
    const img = el('img', {
      class: 'thumb-img', src: listing.banner, alt: '',
      onerror: () => { img.remove(); },
    });
    wrap.append(img);
  }
  return wrap;
}

export function renderAdmin({ uid, onCountChange, nav }) {
  let rows = adminListings(uid);
  let mode = 'new';
  let editingId = '';
  let values = emptyForm();
  let errors = [];
  let attempted = false;
  const touched = new Set();
  let notice = '';
  let confirmingId = null;

  const controls = {};
  const errorNodes = {};

  function field(key, label, control, hint) {
    const err = el('p', { class: 'form-error', hidden: 'hidden' });
    errorNodes[key] = err;
    return el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: control.id, text: label }),
      control,
      hint || null,
      err,
    );
  }

  function textInput(key, type, placeholder) {
    const node = el('input', {
      class: 'field', type, id: 'admin-' + key, name: key, placeholder,
      oninput: () => { touched.add(key); onInput(); },
    });
    controls[key] = node;
    return node;
  }

  function textArea(key, placeholder, rows) {
    const node = el('textarea', {
      class: 'field', id: 'admin-' + key, name: key, placeholder, rows: String(rows),
      oninput: () => { touched.add(key); onInput(); },
    });
    controls[key] = node;
    return node;
  }

  const heading = el('h2', { class: 'text-heading', text: 'Upload adventure game' });
  const badge = el('span', { class: 'status-pill text-muted', text: 'New game' });
  const noticeNode = el('p', { class: 'form-notice', role: 'status', 'aria-live': 'polite', hidden: 'hidden' });

  const titleInput = textInput('title', 'text', 'Candi Sewu: The Thousandth Statue');
  const taglineInput = textInput('tagline', 'text', 'Build the temple before sunrise');
  const tagsInput = textInput('tags', 'text', 'Folklore, Puzzle, Fantasy');
  const authorInput = textInput('author', 'text', 'Nusantara Studio');
  const bannerInput = textInput('banner', 'url', 'https://images.example.com/banner.jpg');
  const storyInput = textArea('story', 'A short summary of the game lore.', 3);
  const sceneInput = textArea('startScene', 'The text printed to the player at the start.', 2);
  const inventoryInput = textInput('inventory', 'text', 'Cucumber Seeds: 1, Sewing Needles: 1, Salt: 1');
  const embedInput = textInput('embedUrl', 'text', 'internal:timun-suri');

  const saveBtn = el('button', { class: 'btn-primary', type: 'button', text: 'Save game', onclick: onSave });
  const cancelBtn = el('button', { class: 'btn-secondary', type: 'button', text: 'Cancel', onclick: () => resetForm() });
  const addBtn = el('button', { class: 'btn-primary', type: 'button', text: 'Add new game', onclick: () => resetForm() });

  const listEl = el('div', { class: 'list' });
  const countNode = el('p', { class: 'text-body text-muted' });

  const form = el('section', { class: 'card flex flex-col gap-4' },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      heading,
      badge,
    ),
    field('title', 'Game title', titleInput),
    field('tagline', 'Tagline', taglineInput),
    field('tags', 'Genres or tags (comma separated)', tagsInput),
    field('author', 'Publisher or author', authorInput),
    field('banner', 'Promotional banner image URL (optional)', bannerInput,
      el('p', { class: 'text-small text-muted', text: 'Leave blank to keep the drawn key art.' })),
    field('story', 'Short story summary and lore', storyInput),
    field('startScene', 'Starting scene text', sceneInput),
    field('inventory', 'Initial inventory items (comma separated)', inventoryInput),
    field('embedUrl', 'Embed source', embedInput,
      el('p', { class: 'text-small text-muted', text: 'Use internal:<title-id> for a built-in title, or an https URL for an external game.' })),
    noticeNode,
    el('div', { class: 'flex flex-wrap items-center justify-end gap-2' }, cancelBtn, saveBtn),
  );

  const root = el('main', { class: 'mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8' },
    nav || null,
    el('header', { class: 'flex flex-col gap-2' },
      el('p', { class: 'section-label', text: 'Creator Studio' }),
      el('h1', { class: 'text-title', id: 'admin-title', text: 'Admin dashboard' }),
      el('p', { class: 'text-body text-muted', text: 'Publish a game, update its listing, and manage what the arcade shows.' }),
    ),
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      countNode,
      addBtn,
    ),
    el('div', { class: 'grid gap-6' },
      form,
      el('section', { class: 'card flex flex-col gap-3' },
        el('h2', { class: 'text-heading', text: 'Platform catalog' }),
        el('p', { class: 'text-small text-muted', text: 'Stored in this browser. Removing a built-in title can be undone with Restore.' }),
        listEl,
      ),
    ),
  );

  function readControls() {
    const form = { id: editingId };
    for (const key of KEYS) form[key] = controls[key].value;
    return form;
  }

  function onInput() {
    values = readControls();
    errors = validateListing(values);
    paintErrors();
  }

  function paintErrors() {
    for (const key of KEYS) {
      const err = errors.find((e) => e.field === key);
      const show = !!err && (attempted || touched.has(key));
      errorNodes[key].textContent = show ? err.message : '';
      errorNodes[key].hidden = !show;
    }
  }

  function paintNotice() {
    noticeNode.textContent = notice;
    noticeNode.hidden = !notice;
  }

  function rowFor(l) {
    let actions;
    if (confirmingId === l.id) {
      actions = [
        el('button', {
          class: 'btn-secondary', type: 'button', text: 'Confirm remove',
          onclick: () => { deleteListing(uid, l.id); afterChange('Removed "' + l.title + '".'); },
        }),
        el('button', {
          class: 'btn-secondary', type: 'button', text: 'Keep',
          onclick: () => { confirmingId = null; paintList(); },
        }),
      ];
    } else if (l.removed) {
      actions = [el('button', {
        class: 'btn-secondary', type: 'button', text: 'Restore',
        onclick: () => { resetListing(uid, l.id); afterChange('Restored "' + l.title + '".'); },
      })];
    } else {
      actions = [
        el('button', { class: 'btn-secondary', type: 'button', text: 'Edit', onclick: () => loadIntoForm(l) }),
        el('a', { class: 'btn-secondary', href: '#/embed/' + l.id, text: 'Preview' }),
      ];
      if (l.overridden) actions.push(el('button', {
        class: 'btn-secondary', type: 'button', text: 'Restore',
        onclick: () => { resetListing(uid, l.id); afterChange('Restored "' + l.title + '".'); },
      }));
      actions.push(el('button', {
        class: 'btn-secondary', type: 'button', text: 'Remove',
        onclick: () => { confirmingId = l.id; paintList(); },
      }));
    }

    return el('div', { class: 'list-row items-start gap-3' },
      thumb(l),
      el('div', { class: 'flex min-w-0 flex-1 flex-col gap-1' },
        el('p', { class: 'text-body font-medium', text: l.title }),
        el('p', { class: 'text-small text-muted', text: l.removed ? 'Removed from the arcade.' : l.author + ' | ' + l.tags }),
        l.removed ? null : el('p', { class: 'text-small text-muted', text: 'Embed source: ' + l.embedUrl }),
      ),
      el('div', { class: 'flex flex-wrap items-center justify-end gap-2' }, actions),
    );
  }

  function paintList() {
    const live = rows.filter((l) => !l.removed).length;
    countNode.textContent = 'Live items: ' + live;
    if (!rows.length) {
      listEl.replaceChildren(el('p', {
        class: 'state-empty text-small text-muted', text: 'No games published yet. Add one on the left.',
      }));
      return;
    }
    listEl.replaceChildren(...rows.map((l) => rowFor(l)));
  }

  function paintForm() {
    heading.textContent = mode === 'edit' ? 'Edit adventure game' : 'Upload adventure game';
    badge.textContent = mode === 'edit' ? 'Edit mode' : 'New game';
    badge.className = mode === 'edit' ? 'status-pill border-accent text-accent' : 'status-pill text-muted';
    for (const key of KEYS) controls[key].value = values[key] || '';
    paintErrors();
    paintNotice();
  }

  function resetForm() {
    mode = 'new';
    editingId = '';
    values = emptyForm();
    errors = [];
    attempted = false;
    touched.clear();
    notice = '';
    confirmingId = null;
    paintForm();
    paintList();
    try { form.scrollIntoView({ block: 'start' }); } catch { /* ignore */ }
  }

  function loadIntoForm(l) {
    mode = 'edit';
    editingId = l.id;
    values = Object.assign({}, l);
    errors = [];
    attempted = false;
    touched.clear();
    notice = '';
    confirmingId = null;
    paintForm();
    try { form.scrollIntoView({ block: 'start' }); } catch { /* ignore */ }
  }

  // After a save or a removal: reload the catalog, refresh the list, and
  // tell the shell so the Creator Studio badge and the arcade stay in step.
  function afterChange(message) {
    rows = adminListings(uid);
    notice = message;
    confirmingId = null;
    if (onCountChange) onCountChange(rows.filter((l) => !l.removed).length);
    paintForm();
    paintList();
  }

  function onSave() {
    values = readControls();
    attempted = true;
    errors = validateListing(values);
    if (errors.length) {
      paintErrors();
      notice = '';
      paintNotice();
      return;
    }
    const listing = normalizeListing(values);
    if (mode === 'new') {
      const taken = rows.map((l) => l.id);
      listing.id = newListingId(listing.title, taken);
    }
    saveListing(uid, listing);
    const message = mode === 'edit' ? 'Saved "' + listing.title + '".' : 'Published "' + listing.title + '".';
    resetForm();
    afterChange(message);
  }

  paintForm();
  paintList();
  return root;
}

/* ── Preview screen ───────────────────────────────────────────────────── */

// Renders a game the way its embed source says it opens: a note pointing at
// the built-in runner for an internal title, or an embedded frame for an
// external URL. This is what the storefront links to for a game that is not
// one of the built-in runner titles.
export function renderEmbed(listing, { onBack, nav }) {
  const kind = embedKind(listing.embedUrl);

  const header = el('header', { class: 'flex flex-col gap-3' },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      el('a', { class: 'btn-secondary', href: '#/admin', text: 'Back to Creator Studio' }),
      el('a', { class: 'btn-secondary', href: '#/', text: 'Back to Arcade' }),
    ),
    el('div', { class: 'flex flex-col gap-1' },
      el('p', { class: 'section-label', text: 'Preview' }),
      el('h1', { class: 'text-title', text: listing.title }),
      el('p', { class: 'text-body text-muted', text: listing.tagline }),
    ),
    el('p', { class: 'state-block', text: 'EMBED SOURCE: ' + listing.embedUrl }),
  );

  let body;
  if (kind === 'internal') {
    const id = internalId(listing.embedUrl);
    const builtIn = CATALOG.some((t) => t.id === id);
    body = el('section', { class: 'card flex flex-col gap-3' },
      el('p', { class: 'text-body', text: 'This game runs in QuestVerse\'s built-in engine.' }),
      builtIn
        ? el('div', {}, el('a', { class: 'btn-primary', href: '#/play/' + id, text: 'Run ' + listing.title }))
        : el('p', { class: 'text-body text-danger', text: '"' + id + '" is not a title the built-in engine knows. Set the embed source to one of the five built-in titles, or point it at an https URL.' }),
    );
  } else if (kind === 'iframe') {
    body = el('section', { class: 'flex flex-col gap-3' },
      el('iframe', {
        class: 'embed-frame', src: listing.embedUrl, title: listing.title + ' embed',
        sandbox: 'allow-scripts allow-forms allow-popups allow-same-origin',
        referrerpolicy: 'no-referrer', loading: 'lazy',
      }),
      el('p', { class: 'text-small text-muted', text: 'Embedded from ' + listing.embedUrl }),
    );
  } else {
    body = el('section', { class: 'state-error' },
      el('p', { class: 'text-body text-danger', text: 'This embed source is not usable.' }),
      el('p', { class: 'text-small text-muted', text: 'Edit the game and set internal:<title-id> or an https URL.' }),
      el('div', {}, el('a', { class: 'btn-secondary', href: '#/admin', text: 'Edit the game' })),
    );
  }

  const root = el('main', { class: 'mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8' },
    nav || null,
    header,
    el('div', { class: 'card flex flex-col gap-2' },
      el('p', { class: 'text-body', text: listing.story }),
      el('p', { class: 'text-small text-muted', text: 'Starting inventory: ' + listing.inventory }),
    ),
    body,
  );
  if (onBack) root.dataset.back = onBack;
  return root;
}
