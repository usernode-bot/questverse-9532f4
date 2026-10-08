# QuestVerse — notes for Claude Code

This app runs on **Homeroom**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

Fetch that URL at the start of each session — it's the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.). The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

When running inside Homeroom's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path — but it's the right reflex when someone runs Claude Code
against this repo locally or from another harness.

## Connector permission prompts

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) so they stop prompting one at a time. Everything
that acts — filing a request, opening or advancing a proposal — still asks.
Claude Code applies those rules only after you accept the
workspace trust dialog, which lists them for review. See `.claude/README.md`
for the whole story, including what to do if you are still being prompted
(usually: your connector is registered under a different name than the rules
assume).

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom's dev-chat
the platform fixes the base commit, and none of this applies.

## Starter template

The screen this app currently ships — the hero, the "What's already
working" card, and the Press! example (the demo markup in
`public/index.html`, the `/api/press` and `/api/leaderboard` routes, and
the `presses` table bootstrap in `server.js`) — is placeholder content
from the Homeroom starter template, not product intent.

When the user asks for their first real feature, REPLACE the template
screen rather than building alongside it:

- remove the `usernode-starter-notice@1` block in `public/index.html`
  (both sentinel comments and everything between them),
- remove or repurpose the "Try the example" card, its demo endpoints and
  the `presses` table as appropriate,
- rewrite `README.md` to describe the actual app.

Keep the `usernode-dev-console@1` forwarder `<script>` when rewriting the
HTML — that block is platform infrastructure, not template content. So is
the bridge `<script>`. The design kit is not placeholder either: build the
real app with it, and fill in "## Design" below.

The screen has a light and a dark look and follows the viewer's Homeroom
theme, switching live when they change it: the theme `<script>` right after
the bridge tag sets a `dark` class on `<html>`. Keep that script, and give
everything you build both looks (the design kit's colour tokens carry both), unless one
fixed look is the point of this app, like a game's own scene; then say so
under "## Design" below. Unless a request asks for one, add
no theme picker: the viewer's Homeroom setting is the control. "The
platform's light/dark theme inside the app frame" in the platform
conventions has the details.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About QuestVerse

Your Gateway to Web3 Text-Based Adventures & Arcade Games.

QuestVerse is a browsable arcade of text-adventure titles you play in the
app. Five launch titles ship as committed static data (`public/catalog.js`),
played by a pure, deterministic engine (`public/engine.js`) through a
built-in runner. A Creator Studio tab (`public/admin.js`) lets someone
publish, edit, preview and remove listings on top of that catalog. The only
server state is the live seasonal theme (below); progress, achievements and
the Creator Studio's listings live in the browser (localStorage, namespaced
per signed-in person).

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** accent: neon violet; second: signal cyan (used for the
  terminal-style state readout); danger: alarm magenta (game over and
  destructive actions); neutrals: deep indigo-blacks and lilac-greys.
- **Signature element:** the bracketed terminal state block, mirroring
  each title's own prompt, in the signal cyan.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  (change their sizes in `tailwind.config.js` if you must, not their number).
- **One fixed look:** DARK. QuestVerse is drawn as its own scene, a game,
  which is the documented exception to the two-look rule. `:root` and
  `.dark` carry the same token values in `styles/tailwind-input.css`, so
  the app renders identically in Homeroom's light and dark themes. Do not
  "fix" this by adding a light look.
- **Seasonal themes:** Neon (the default, the palette above), Halloween,
  Winter Lights and Lunar New Year. Each re-tints the neutrals, the accent
  and the signal, and keeps the alarm magenta, the single dark look and the
  4.5:1 rule. Neon must look exactly as it did before themes existed.

The kit is in `styles/tailwind-input.css`: colour tokens with a light and
a dark value (named in `tailwind.config.js`), and a few components
(`btn-primary`, `btn-secondary`, `field`, `list` and `list-row`,
`card`, `section-label`, `skeleton`, `state-empty`, `state-error`).
Re-theme by changing the token values there, keeping every text pair at
4.5:1 or more in both looks.

- Colour comes only from the tokens (`bg-ground`, `bg-surface`,
  `text-fg`, `text-muted`, `border-line`, `bg-accent` with
  `text-on-accent`, ...): never a raw hex value or a stock palette class.
- Tap targets are at least 44 px; the buttons and fields already are.
- Every screen that loads data has honest loading, empty and error states.
  Never show the empty state while loading or after a failure; an error says
  what failed, what still works, and offers Retry.
- Seed obviously fake staging demo data so the populated screen can be seen
  ("Staging mock data" in the platform conventions).
- No cards in cards, no uppercase eyebrows, no emoji as icons.

## App-specific conventions

- Titles are committed static data in `public/catalog.js`; there is no
  database table and nothing to seed. A new title is a new entry there,
  not a migration.
- The Creator Studio (`public/admin.js`) stores its edits in
  `localStorage` at `qv1:<userId>:listings` as `{ v, overrides, deleted }`.
  Stored listings are remapped onto the static catalog by id: an override
  wins, and removing a built-in is a tombstone (not a deletion) so it can
  be restored. Do not add a table for listings; the browser is the store.
- The Creator Studio is locked to the `STUDIO_USERNAMES` allowlist in
  `server.js` (`scraido2`, plus the platform's `usernode-capture` and
  `usernode-capture-admin` service identities, which sign the proposal
  checks). The nav tab and the `#/admin` route are hidden for everyone else,
  who see a "Not authorised" screen if they reach the URL, and `GET /api/me`
  reports the `studio` flag the client reads. The decision is authorised from
  the verified iframe token's `req.user.username`, never from a
  client-supplied value. Add a person by editing that set.
- Background music (`public/music.js`): the Creator Studio attaches one
  .mp3 or .aac track to a choice, keyed `<titleId>:<stageIndex>:<choiceKey>`.
  Picking that choice in the runner starts its track looping and replaces the
  current one; a choice with no track leaves the music alone. Leaving the
  runner, Restart and Play again stop it. The index lives at
  `qv1:<userId>:music`. A track is offered to `usernode.uploadFile` first, but
  platform storage only accepts images today, so in practice the bytes are
  kept in this browser's IndexedDB (`questverse-music`), like the listings.
  Playback starts inside the choice's tap handler from a URL resolved when the
  runner opened, because phones only allow audio from a gesture.
- A listing's `embedUrl` decides how it opens: `internal:<title-id>` runs
  the built-in runner, an `https` URL is embedded in a sandboxed frame.
- The engine in `public/engine.js` is pure and deterministic (no DOM, no
  storage, no network, no randomness), so a run is reproducible. Keep it
  that way; the runner and any future unit suite both depend on it.
- Progress and achievements live in `localStorage`, keyed
  `qv1:<userId>:...`. An offline load carries no token, so the store falls
  back to a shared `anon` namespace rather than deleting real data.
- The seasonal theme is one global setting, the row `key = 'theme'` in the
  public `qv_settings` table, read by every client from `GET /api/me`
  (`theme`) and written only by `PUT /api/theme`, gated by the same
  `STUDIO_USERNAMES` allowlist. A theme is a set of token overrides under
  `html[data-theme="<id>"]` in `styles/tailwind-input.css`; Neon sets no
  attribute. A new theme is a block there, an entry in `public/themes.js`
  and an id in `THEME_IDS` in `server.js`. Picking a theme in the studio
  previews it on that screen only until Apply theme. There is no automatic,
  date-based switching yet; if one is added, read the date through
  `usernode.now()` / `req.now` ("Time-dependent features").
- Content: every title is suspense, evasion and puzzles. Items are survival
  utility used as wards and decoys, never weapons, and there is no combat,
  gore or gambling. User-facing copy avoids em dashes.
