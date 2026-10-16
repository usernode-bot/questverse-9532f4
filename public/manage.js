// GameWatch's manager panel: every title in this Arcade, and everything a
// title says.
//
// The manager edits a title's WORDS: its name, its year, the broad genre it is
// filed under, its genre box, its sub-genres, its one-line description, its
// longer description, the control list How to Play prints, and the three
// pictures it shows (the thumbnail in the catalogue, the banner artwork and
// the bezel drawn around the panel). It does NOT author a title's rules: the
// panel, the scoring and the key handling stay in public/games.js, so an edit
// changes what a title says and shows and never how it plays.
//
// Who may edit what is the platform's own answer. The platform tells the app
// who is signed in, never their role, so the gate is an action, not a name:
// any signed-in person may edit a built-in title (the edit is shared, like the
// collection it belongs to), and only the person who added a title may edit or
// remove that one, because every added row is keyed to the platform user id
// from the verified token.
//
// The key mapping on the Settings screen stays per person. The "button to
// key" a title's How to Play names is the handheld's own button (Game A, D-Pad
// left and so on), which is what the manager's control editor edits; which
// physical key that button is bound to is a separate, personal choice.

import { el } from './dom.js';

// The reason the panel is available, in the words the screen uses. Kept here
// beside the rule itself so the two cannot drift apart.
export const MANAGE_NOTE = 'Any signed-in person may edit a built-in title: that edit is shared, '
  + 'because the eight titles belong to the collection, not to one account. An added title belongs '
  + 'to whoever added it, and only that person may edit or remove it. Nothing is gated behind a role '
  + 'the app is never told.';

// The six buttons a title's own rules understand, plus the three the handheld
// owns. A control row names which of these it covers, so the play screen's
// keypad can print the title's own words over the key it is bound to.
export const CONTROL_KEYS = [
  { key: 'up', label: 'D-Pad up' },
  { key: 'down', label: 'D-Pad down' },
  { key: 'left', label: 'D-Pad left' },
  { key: 'right', label: 'D-Pad right' },
  { key: 'game_a', label: 'Game A' },
  { key: 'game_b', label: 'Game B' },
  { key: 'sound', label: 'Sound' },
  { key: 'time', label: 'Time' },
  { key: 'reset', label: 'Reset' },
];

// The broad genres the pill row is built from. A title filed under a word the
// list does not carry still gets its own pill, so the list is a starting point
// rather than a fence.
export const CATEGORIES = ['Action', 'Strategy', 'Simulation', 'Added by you'];

// Whether this person may edit this title. A built-in belongs to the
// collection and is edited by anyone signed in; an added title is the one who
// added it, and a guest may change nothing.
export function canEditTitle(title, identity) {
  const who = identity || {};
  if (!who.signedIn) return false;
  if (!title) return false;
  if (title.builtIn) return true;
  return title.mine !== false;
}

export function canAddTitle(identity) {
  return !!(identity && identity.signedIn);
}

// A short line naming where a title came from and who may change it.
export function ownershipLine(title) {
  if (title.builtIn) return 'Built in: any signed-in person may edit it, and the edit is shared';
  if (title.mine === false) return 'Added by another account: not yours to change';
  return 'Added by you: you may edit or remove it';
}

/* ── The manager's list of titles ──────────────────────────────────────── */

// One row per title, with its Edit button. The row is the unit, so the picture
// and the words about the title stay together.
export function managerRows(titles, opts) {
  const options = opts || {};
  const identity = options.identity || {};
  const editingId = options.editingId || null;
  return (titles || []).map((title) => {
    const editable = canEditTitle(title, identity);
    return el('li', {
      class: 'list-row flex-wrap justify-between gap-3',
      'data-manage-title-row': title.id,
    },
      el('div', { class: 'flex min-w-0 flex-col gap-0.5' },
        el('strong', { class: 'text-body', 'data-manage-title-name': title.id, text: title.title }),
        el('span', { class: 'rig-print', 'data-manage-title-licence': title.id, text: licenceOf(title) }),
        el('span', {
          class: 'text-small ' + (editable ? 'text-muted' : 'text-amber'),
          'data-manage-owner': title.id, text: ownershipLine(title),
        }),
      ),
      el('div', { class: 'flex flex-wrap items-center gap-2' },
        el('span', { class: 'gw-cat-tag', text: title.genreBox || title.category }),
        editable ? el('button', {
          class: editingId === title.id ? 'btn-primary' : 'btn-secondary', type: 'button',
          'data-manage-edit': title.id, 'aria-expanded': editingId === title.id ? 'true' : 'false',
          text: editingId === title.id ? 'Editing' : 'Edit',
          onclick: () => { if (options.onEdit) options.onEdit(title.id); },
        }) : null,
      ),
    );
  });
}

function licenceOf(title) {
  const genre = [title.genreBox].concat(title.genres || []).filter(Boolean).join(' | ');
  return 'GameWatch ' + (title.year || '') + ' | ' + (genre || 'no genre yet');
}

/* ── The editor for one title ──────────────────────────────────────────── */

// The form for one title. `opts.onSave(patch)` receives the whole title as it
// now reads, with the two uploaded art pairs when a file was chosen.
export function renderTitleForm(title, opts) {
  const options = opts || {};
  const uploads = !!options.uploadsAvailable;
  const editable = canEditTitle(title, options.identity);
  const isNew = !!options.isNew;
  const draft = draftFrom(title);
  const art = { thumbnail: title.thumbnailUrl || null, bezel: title.bezelUrl || null };

  const errorLine = el('p', { class: 'text-small text-danger', 'data-manage-error': '', hidden: 'hidden' });
  const showError = (text) => { errorLine.textContent = text; errorLine.hidden = false; };

  function field(key, label, attrs) {
    return el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: 'manage-' + key, text: label }),
      el('input', Object.assign({
        class: 'field', id: 'manage-' + key, 'data-manage-field': key,
        value: draft[key], disabled: !editable ? 'disabled' : null,
      }, attrs || {})),
    );
  }

  function area(key, label, attrs) {
    return el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: 'manage-' + key, text: label }),
      el('textarea', Object.assign({
        class: 'field min-h-24', id: 'manage-' + key, 'data-manage-field': key,
        text: draft[key], disabled: !editable ? 'disabled' : null,
      }, attrs || {})),
    );
  }

  const fields = el('div', { class: 'flex flex-col gap-3', 'data-manage-fields': '' },
    el('div', { class: 'grid gap-3 sm:grid-cols-2' },
      field('title', 'Title', { placeholder: 'Western Bar' }),
      field('year', 'Year', { type: 'number', min: '1900', max: '2100', placeholder: '1981' }),
    ),
    el('div', { class: 'grid gap-3 sm:grid-cols-2' },
      el('div', { class: 'flex flex-col gap-1' },
        el('label', { class: 'text-small text-muted', for: 'manage-category', text: 'Broad genre' }),
        el('input', {
          class: 'field', id: 'manage-category', 'data-manage-field': 'category', value: draft.category,
          list: 'manage-categories', disabled: !editable ? 'disabled' : null,
        }),
        el('datalist', { id: 'manage-categories' }, CATEGORIES.map((c) => el('option', { value: c }))),
      ),
      field('genreBox', 'Genre box', { placeholder: 'Soda jerk' }),
    ),
    el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: 'manage-genres', text: 'Sub-genres (separated by commas)' }),
      el('input', {
        class: 'field', id: 'manage-genres', 'data-manage-field': 'genres', value: draft.genres.join(', '),
        placeholder: 'Serve, Reflex, Timing', disabled: !editable ? 'disabled' : null,
      }),
    ),
    area('tagline', 'One-line description', { rows: '2', maxlength: '200' }),
    area('summary', 'Description', { rows: '4', maxlength: '2000' }),
  );

  // ── The controls editor: the How to Play control list, and the handheld
  //    buttons each row covers ─────────────────────────────────────────────
  const controlRows = el('div', { class: 'flex flex-col gap-3', 'data-manage-controls': '' });

  function paintControls() {
    controlRows.replaceChildren(
      ...draft.controls.map((row, index) => el('div', {
        class: 'card flex flex-col gap-2', 'data-manage-control': String(index),
      },
        el('div', { class: 'grid gap-3 sm:grid-cols-2' },
          el('div', { class: 'flex flex-col gap-1' },
            el('label', { class: 'text-small text-muted', text: 'Buttons' }),
            el('input', {
              class: 'field', 'data-manage-control-keys': String(index), value: row.keys,
              placeholder: 'Game A', disabled: !editable ? 'disabled' : null,
            }),
          ),
          el('div', { class: 'flex flex-col gap-1' },
            el('label', { class: 'text-small text-muted', text: 'What they do' }),
            el('input', {
              class: 'field', 'data-manage-control-action': String(index), value: row.action,
              placeholder: 'Serve the glass', disabled: !editable ? 'disabled' : null,
            }),
          ),
        ),
        el('div', { class: 'flex flex-col gap-1' },
          el('span', { class: 'text-small text-muted', text: 'Handheld buttons this row covers' }),
          el('div', { class: 'flex flex-wrap gap-2', 'data-manage-control-plays': String(index) },
            CONTROL_KEYS.map((k) => el('label', {
              class: 'gw-pill' + (row.plays.includes(k.key) ? ' gw-pill-on' : ''),
              'data-manage-control-play': k.key + ':' + index,
            },
              el('input', {
                class: 'sr-only', type: 'checkbox', checked: row.plays.includes(k.key) ? 'checked' : null,
                disabled: !editable ? 'disabled' : null,
                onchange: (event) => {
                  const on = event.currentTarget.checked;
                  const list = row.plays;
                  const at = list.indexOf(k.key);
                  if (on && at < 0) list.push(k.key);
                  if (!on && at >= 0) list.splice(at, 1);
                },
              }),
              el('span', { text: k.label }),
            )),
          ),
        ),
        editable ? el('div', { class: 'flex flex-wrap gap-2' },
          el('button', {
            class: 'btn-secondary', type: 'button', 'data-manage-control-up': String(index),
            text: 'Move up', disabled: index === 0 ? 'disabled' : null,
            onclick: () => { moveControl(index, -1); },
          }),
          el('button', {
            class: 'btn-secondary', type: 'button', 'data-manage-control-down': String(index),
            text: 'Move down', disabled: index === draft.controls.length - 1 ? 'disabled' : null,
            onclick: () => { moveControl(index, 1); },
          }),
          el('button', {
            class: 'btn-secondary', type: 'button', 'data-manage-control-remove': String(index),
            text: 'Remove this row',
            onclick: () => { readControls(); draft.controls.splice(index, 1); paintControls(); },
          }),
        ) : null,
      )),
    );
    if (!draft.controls.length) {
      controlRows.append(el('p', { class: 'text-small text-muted', 'data-manage-controls-empty': '',
        text: 'No control rows yet. Add one and it appears on How to Play.' }));
    }
    if (editable) {
      controlRows.append(el('div', { class: 'flex flex-wrap gap-2' },
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-manage-control-add': '', text: 'Add a control row',
          onclick: () => { readControls(); draft.controls.push({ keys: '', action: '', plays: [] }); paintControls(); },
        }),
      ));
    }
  }

  // Read the live inputs back into the draft, so a move or a remove never
  // drops what was typed.
  function readControls() {
    for (const node of controlRows.querySelectorAll('[data-manage-control-keys]')) {
      const at = Number(node.dataset.manageControlKeys);
      if (draft.controls[at]) draft.controls[at].keys = node.value;
    }
    for (const node of controlRows.querySelectorAll('[data-manage-control-action]')) {
      const at = Number(node.dataset.manageControlAction);
      if (draft.controls[at]) draft.controls[at].action = node.value;
    }
  }

  function moveControl(index, by) {
    readControls();
    const to = index + by;
    if (to < 0 || to >= draft.controls.length) return;
    const [row] = draft.controls.splice(index, 1);
    draft.controls.splice(to, 0, row);
    paintControls();
  }

  // ── The artwork: three pictures, uploaded through the platform's storage ──
  const artBlock = el('div', { class: 'flex flex-col gap-3', 'data-manage-art': '' });
  const fileInputs = { thumbnail: null, bezel: null };

  function artPicker(kind, label, note) {
    const input = el('input', {
      class: 'field', id: 'manage-art-' + kind, type: 'file', accept: 'image/*',
      'data-manage-art-file': kind, disabled: !editable || !uploads ? 'disabled' : null,
      onchange: () => { /* read at save time */ },
    });
    fileInputs[kind] = input;
    const current = art[kind];
    return el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: 'manage-art-' + kind, text: label }),
      input,
      el('p', { class: 'text-small text-muted', 'data-manage-art-note': kind,
        text: uploads
          ? (current ? 'A picture is already set. Choose a file to replace it.' : note)
          : 'No platform file storage is reachable here, so the drawn art is used instead.' }),
      current ? el('img', {
        class: 'mt-1 h-16 w-auto rounded border border-line bg-ground',
        src: current, alt: label + ' preview', 'data-manage-art-preview': kind,
      }) : null,
    );
  }

  artBlock.append(
    el('h4', { class: 'text-body font-medium', text: 'Artwork' }),
    artPicker('thumbnail', 'Thumbnail picture',
      'Used in the catalogue, beside the title. The drawn cover is used while none is set.'),
    artPicker('bezel', 'Bezel picture',
      'Drawn around the LCD panel on the play screen. The panel itself stays the drawn simulation.'),
    el('p', { class: 'text-small text-muted', text: 'An upload goes to the platform\'s file storage and only its URL and file id are kept. '
      + 'Replacing a picture uploads a new file: platform files are immutable, so nothing is overwritten.' }),
  );

  // ── Assemble the title as it now reads ──────────────────────────────────
  function readFields() {
    const get = (key) => {
      const node = fields.querySelector('[data-manage-field="' + key + '"]');
      return node ? node.value : '';
    };
    readControls();
    return {
      id: title.id,
      title: get('title').trim(),
      year: Number(get('year')) || null,
      category: get('category').trim() || 'Other',
      genreBox: get('genreBox').trim(),
      genres: get('genres').split(',').map((g) => g.trim()).filter(Boolean),
      tagline: get('tagline').trim(),
      summary: get('summary').trim(),
      controls: draft.controls
        .map((c) => ({ keys: c.keys.trim(), action: c.action.trim(), plays: c.plays.slice() }))
        .filter((c) => c.keys || c.action),
      howTo: title.howTo || [],
      coverArt: title.coverArt || [],
      tiers: title.tiers || [],
      sortOrder: title.sortOrder,
      thumbnail: title.thumbnailUrl ? { url: title.thumbnailUrl, fileId: title.thumbnailFileId || null } : null,
      bezel: title.bezelUrl ? { url: title.bezelUrl, fileId: title.bezelFileId || null } : null,
    };
  }

  const saveButton = el('button', {
    class: 'btn-primary', type: 'submit', 'data-manage-save': title.id,
    text: isNew ? 'Add the title' : 'Save the change', disabled: !editable ? 'disabled' : null,
  });

  const form = el('form', {
    class: 'card flex flex-col gap-4', 'data-manage-form': title.id,
    onsubmit: (event) => {
      event.preventDefault();
      if (!editable) { showError('Sign in to change a title.'); return; }
      const patch = readFields();
      if (!patch.title) { showError('Give the title a name.'); return; }
      errorLine.hidden = true;
      Promise.resolve(options.onSave ? options.onSave(patch, { thumbnail: fileInputs.thumbnail, bezel: fileInputs.bezel }) : null)
        .catch((err) => showError(err && err.message ? err.message : 'Could not save that title.'));
    },
  },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      el('h3', { class: 'text-heading', 'data-manage-form-title': title.id,
        text: isNew ? 'Add a title' : 'Editing ' + title.title }),
      el('span', { class: 'rig-sim', text: 'A title\'s words, not its rules' }),
    ),
    el('p', { class: 'text-small text-muted', text: 'A title\'s name, its genres, its descriptions, its control list and its pictures are edited here. '
      + 'Its rules and its panel stay in the app, so an edit changes what a title says and shows, never how it plays.' }),
    fields,
    el('section', { class: 'flex flex-col gap-2', 'data-manage-controls-section': '' },
      el('h4', { class: 'text-body font-medium', text: 'Controls' }),
      el('p', { class: 'text-small text-muted', text: 'These rows are the Controls list on How to Play, and the words the play screen prints over each handheld button. '
        + 'Which physical key a button is bound to stays a personal choice on the Settings screen.' }),
      controlRows,
    ),
    artBlock,
    errorLine,
    el('div', { class: 'flex flex-wrap gap-2' },
      saveButton,
      el('button', {
        class: 'btn-secondary', type: 'button', 'data-manage-cancel': title.id, text: 'Close the editor',
        onclick: () => { if (options.onCancel) options.onCancel(); },
      }),
    ),
    editable ? null : el('p', { class: 'text-small text-amber', text: 'You are reading this Arcade without an account, or this title belongs to another Arcade. The editor is read-only.' }),
  );

  paintControls();
  return form;
}

// One title's worth of editable defaults, so a field never reads `undefined`.
function draftFrom(title) {
  return {
    title: title.title || '',
    year: title.year || '',
    category: title.category || '',
    genreBox: title.genreBox || '',
    genres: Array.isArray(title.genres) ? title.genres.slice() : [],
    tagline: title.tagline || '',
    summary: title.summary || '',
    controls: Array.isArray(title.controls)
      ? title.controls.map((c) => ({ keys: c.keys || '', action: c.action || '', plays: (c.plays || []).slice() }))
      : [],
  };
}

/* ── The hero banner's slide list ──────────────────────────────────────── */

// One row per slide: which title it shows, its picture, and its own move and
// remove controls.
export function renderBannerEditor(titles, slides, opts) {
  const options = opts || {};
  const uploads = !!options.uploadsAvailable;
  const editable = canAddTitle(options.identity);
  // The editor starts from the list the banner is actually showing. A person
  // who has never set one sees the fallback: the first eight titles, in the
  // Arcade's own order. Saving writes their own list from there, so reordering
  // what the banner already shows is one drag rather than eight picks.
  const saved = (slides || []).filter((s) => s && s.titleId);
  const draft = (saved.length
    ? saved
    : (titles || []).slice(0, 8).map((t) => ({ titleId: t.id }))
  ).map((s) => ({
    titleId: s.titleId || null,
    artUrl: s.artUrl || null,
    artFileId: s.artFileId || null,
  }));
  const errorLine = el('p', { class: 'text-small text-danger', 'data-manage-banner-error': '', hidden: 'hidden' });
  const list = el('ul', { class: 'list', 'data-manage-slides': '' });

  function titleName(id) {
    const hit = (titles || []).find((t) => t.id === id);
    return hit ? hit.title : 'A title that is no longer here';
  }

  function paint() {
    list.replaceChildren(...draft.map((slide, index) => el('li', {
      class: 'list-row flex-wrap justify-between gap-3', 'data-manage-slide': String(index),
    },
      el('div', { class: 'flex min-w-0 flex-col gap-1' },
        el('label', { class: 'text-small text-muted', text: 'Shows' }),
        el('select', {
          class: 'field', 'data-manage-slide-title': String(index),
          disabled: !editable ? 'disabled' : null,
          onchange: (event) => { slide.titleId = event.currentTarget.value; },
        },
          el('option', { value: '', text: 'Pick a title' }),
          (titles || []).map((t) => el('option', {
            value: t.id, selected: t.id === slide.titleId ? 'selected' : null, text: t.title,
          })),
        ),
        el('span', { class: 'rig-print', 'data-manage-slide-name': String(index),
          text: slide.titleId ? titleName(slide.titleId) : 'No title chosen yet' }),
      ),
      el('div', { class: 'flex flex-col gap-1' },
        el('label', { class: 'text-small text-muted', text: 'Slide picture' }),
        el('input', {
          class: 'field', type: 'file', accept: 'image/*', 'data-manage-slide-art': String(index),
          disabled: !editable || !uploads ? 'disabled' : null,
        }),
        el('span', { class: 'text-small text-muted', text: slide.artUrl
          ? 'A picture is set. Choose a file to replace it.' : 'No picture: the title\'s own art is shown.' }),
      ),
      el('div', { class: 'flex flex-wrap gap-2' },
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-manage-slide-up': String(index), text: 'Move up',
          disabled: !editable || index === 0 ? 'disabled' : null,
          onclick: () => { readInputs(); const [row] = draft.splice(index, 1); draft.splice(index - 1, 0, row); paint(); },
        }),
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-manage-slide-down': String(index), text: 'Move down',
          disabled: !editable || index === draft.length - 1 ? 'disabled' : null,
          onclick: () => { readInputs(); const [row] = draft.splice(index, 1); draft.splice(index + 1, 0, row); paint(); },
        }),
        el('button', {
          class: 'btn-secondary', type: 'button', 'data-manage-slide-remove': String(index), text: 'Remove this slide',
          disabled: !editable ? 'disabled' : null,
          onclick: () => { readInputs(); draft.splice(index, 1); paint(); },
        }),
      ),
    )));
    if (!draft.length) {
      list.append(el('li', { class: 'list-row', 'data-manage-slides-empty': '',
        text: 'No slides yet. The banner falls back to the eight built-in titles.' }));
    }
  }

  function readInputs() {
    for (const node of list.querySelectorAll('[data-manage-slide-title]')) {
      const at = Number(node.dataset.manageSlideTitle);
      if (draft[at]) draft[at].titleId = node.value || null;
    }
  }

  const form = el('form', {
    class: 'card flex flex-col gap-4', 'data-manage-banner': '',
    onsubmit: (event) => {
      event.preventDefault();
      if (!editable) { errorLine.textContent = 'Sign in to change the banner.'; errorLine.hidden = false; return; }
      readInputs();
      errorLine.hidden = true;
      const files = {};
      for (const node of list.querySelectorAll('[data-manage-slide-art]')) {
        const at = Number(node.dataset.manageSlideArt);
        const file = node.files && node.files[0];
        if (file) files[at] = file;
      }
      Promise.resolve(options.onSave ? options.onSave(draft, files) : null)
        .catch((err) => { errorLine.textContent = err && err.message ? err.message : 'Could not save the banner.'; errorLine.hidden = false; });
    },
  },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
      el('h3', { class: 'text-heading', text: 'The banner slides' }),
      el('span', { class: 'rig-sim', text: 'Your own slide list' }),
    ),
    el('p', { class: 'text-small text-muted', text: 'The banner at the top of the Arcade slides through this list. It belongs to your account, so your order is yours. '
      + 'A slide shows one title, with a picture of your own in place of the drawn art.' }),
    list,
    errorLine,
    editable ? el('div', { class: 'flex flex-wrap gap-2' },
      el('button', {
        class: 'btn-secondary', type: 'button', 'data-manage-slide-add': '',
        text: 'Add a slide',
        onclick: () => { readInputs(); draft.push({ titleId: null, artUrl: null, artFileId: null }); paint(); },
      }),
      el('button', { class: 'btn-primary', type: 'submit', 'data-manage-banner-save': '', text: 'Save the slide list' }),
    ) : el('p', { class: 'text-small text-amber', text: 'A guest reads the banner; changing it needs an account.' }),
  );

  paint();
  return form;
}
