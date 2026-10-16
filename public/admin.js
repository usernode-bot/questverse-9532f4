// GameWatch's admin panel: the handheld's own titles, and the covers on them.
//
// Who may do what is the question this module answers, and it answers it the
// way the platform allows. The platform tells the app who is signed in, never
// their role, so a panel gated on a hard-coded name would refuse every
// reviewer and every voter. The gate here is the account's own action
// instead: an entry a person added is an entry that person may edit, because
// every row the app reads and writes is keyed to the platform user id from
// the verified token. Nobody can edit anyone else's title, and a signed-in
// person can always add one of their own.
//
// The eight built-in titles are rows now, like every other title, so they are
// edited in the manager (#/manage) rather than here: this panel is the short
// path to a title a person has added to their own Arcade.

import { el } from './dom.js';

// The reason the panel is available, in the words the screen uses. Kept here
// beside the rule itself so the two cannot drift apart.
export const ADMIN_NOTE = 'Any signed-in person can add a title to their own Arcade. '
  + 'Whoever added a title is the one who may edit or remove it: every entry is '
  + 'kept against the account that added it, so nobody else\'s is touched. The manager '
  + '(Manage titles, on the Arcade) is where a title\'s words, its control list and '
  + 'its pictures are edited, including the eight built-in titles, whose edits are shared.';

// Whether this person may edit this entry. An entry carries `mine` when the
// server answered with one of this account's own rows; a guest may add
// nothing.
export function canEdit(entry, identity) {
  const who = identity || {};
  if (!who.signedIn) return false;
  if (!entry) return false;
  return entry.mine !== false;
}

// Whether this person may add a title at all. A guest reads the Arcade; a
// write needs an account.
export function canAdd(identity) {
  const who = identity || {};
  return !!who.signedIn;
}

// The panel. `opts` supplies the catalogue, the identity, the handlers and
// whether the platform's file storage is reachable.
export function renderAdminPanel(opts) {
  const options = opts || {};
  const entries = options.entries || [];
  const identity = options.identity || {};
  const uploads = !!options.uploadsAvailable;
  const adding = canAdd(identity);

  const titleInput = el('input', {
    class: 'field', id: 'admin-title', type: 'text', 'data-admin-title': '',
    placeholder: 'Title, for example Ridge Glider Club', maxlength: '120',
    disabled: !adding ? 'disabled' : null,
  });
  const coverInput = el('input', {
    class: 'field', id: 'admin-cover', type: 'file', accept: 'image/*', 'data-admin-cover': '',
    'aria-describedby': 'admin-cover-note',
    disabled: !adding ? 'disabled' : null,
  });
  const errorLine = el('p', { class: 'text-small text-danger', 'data-admin-error': '', hidden: 'hidden' });

  function showError(text) {
    errorLine.textContent = text;
    errorLine.hidden = false;
  }

  const form = el('form', {
    class: 'card flex flex-col gap-3', 'data-admin-add': '',
    onsubmit: (event) => {
      event.preventDefault();
      if (!adding) { showError('Sign in to add a title to your Arcade.'); return; }
      const title = titleInput.value.trim();
      if (!title) { showError('Give the title a name.'); return; }
      const file = coverInput.files && coverInput.files[0];
      errorLine.hidden = true;
      Promise.resolve(options.onAdd ? options.onAdd(title, file) : null)
        .catch((err) => showError(err && err.message ? err.message : 'Could not add that title.'));
    },
  },
    el('h3', { class: 'text-heading', text: 'Add a title to this Arcade' }),
    el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: 'admin-title', text: 'Title' }),
      titleInput,
    ),
    el('div', { class: 'flex flex-col gap-1' },
      el('label', { class: 'text-small text-muted', for: 'admin-cover', text: 'Cover image (optional)' }),
      coverInput,
      el('p', { class: 'text-small text-muted', id: 'admin-cover-note', 'data-cover-note': '',
        text: uploads
          ? 'The image goes to the platform\'s file storage and only its URL is kept. The image bytes are never stored here.'
          : 'No platform file storage is reachable from this page, so the drawn cover is used instead and only the title is kept.' }),
    ),
    errorLine,
    el('div', { class: 'flex flex-wrap gap-2' },
      el('button', { class: 'btn-primary', type: 'submit', 'data-admin-submit': '', text: 'Add the title', disabled: !adding ? 'disabled' : null }),
    ),
    adding ? null : el('p', { class: 'text-small text-amber', text: 'You are reading this Arcade without an account, so the add form is turned off.' }),
  );

  function row(entry) {
    const editable = canEdit(entry, identity);
    return el('li', { class: 'list-row flex-wrap justify-between gap-3', 'data-admin-entry': entry.id },
      el('div', { class: 'flex flex-col gap-0.5' },
        el('strong', { class: 'text-body', 'data-admin-entry-title': entry.id, text: entry.title }),
        el('span', { class: 'text-small text-muted', text: entry.storageUrl ? 'Cover image uploaded to platform storage' : 'No cover image: the drawn cover is used' }),
      ),
      el('div', { class: 'flex flex-wrap items-center gap-2' },
        el('span', { class: 'text-small ' + (editable ? 'text-muted' : 'text-amber'),
          text: editable ? 'Added by you: you may edit or remove it' : 'Not yours to change' }),
        editable ? el('button', {
          class: 'btn-secondary', type: 'button', 'data-admin-remove': entry.id, text: 'Remove',
          onclick: () => { if (options.onRemove) options.onRemove(entry); },
        }) : null,
      ),
    );
  }

  return el('section', { class: 'flex flex-col gap-4', 'data-admin-panel': '' },
    el('p', { class: 'text-body text-muted', text: ADMIN_NOTE }),
    el('section', { class: 'flex flex-col gap-2', 'data-admin-list': '' },
      el('h3', { class: 'text-heading', text: entries.length ? 'Titles you added (' + entries.length + ')' : 'Titles you added' }),
      entries.length
        ? el('ul', { class: 'list' }, entries.map(row))
        : el('p', { class: 'state-empty text-body text-muted', text: 'You have not added a title to this Arcade yet. The eight built-in titles are already here, and the manager edits them.' }),
    ),
    form,
    el('p', { class: 'text-small text-muted', text: 'An added title is a name and a cover for your own Arcade. GameWatch does not run it: it catalogues it, exactly as the collection always said.' }),
  );
}
