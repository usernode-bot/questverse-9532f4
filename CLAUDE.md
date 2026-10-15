# RetroRig — notes for Claude Code

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

## Starter template (already replaced)

The Homeroom starter screen (the hero, the "What's already working" card and
the Press! example, with its `/api/press`, `/api/leaderboard` routes and
`presses` table) was removed when RetroRig became the app. It is gone: do not
look for it, and do not reintroduce it.

Two pieces of that scaffolding are NOT starter content and must stay:

- the `usernode-dev-console@1` forwarder `<script>` in `public/index.html`
  (platform infrastructure), and
- the bridge `<script>` and the theme `<script>` right after it.

---

## About RetroRig

A simulated mid-1990s home computer, drawn on the screen as its own CRT
desktop. The app boots, shows a Start menu, and offers five windows: the
**Game Collection**, the **Memory Card**, the **Keyboard** mapper, the
**Settings**, and a simulated **DOS prompt**. Two original games ship built
in and run inside the rig: **Deepwatch: Trench Patrol** and **Mandate of
Seasons**.

The point of the app is the machine, not only the games: the settings really
change the picture a game is drawn with, the keyboard mapper really changes
which keys play it, and the Memory Card really stores where a run had got to.

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** ground is the near-black CRT glass; surface and raised are
  lifted greys for windows; **phosphor green** is the one accent (the Start
  button, the primary action); **signal cyan** is what the rig PRINTS (the
  boot log, a prompt reply, every readout); **amber** is a caution lamp (a key
  conflict, the "simulated" pills); **alarm red** is a destructive action or a
  game ending.
- **Signature element:** the bracketed readout block (`.rig-readout`) of
  monospaced cyan lines, printed under every screen the rig produces.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  (sizes in `tailwind.config.js`); anything the rig prints in its own voice is
  `.rig-print`, monospace.
- **One fixed look:** DARK. RetroRig is drawn as its own scene, a machine,
  which is the documented exception to the two-look rule. `:root` and `.dark`
  carry the same token values in `styles/tailwind-input.css`, so the app
  renders identically in Homeroom's light and dark themes. Do not "fix" this
  by adding a light look.
- **Every simulated readout is labelled.** The Simulation lamp (`.rig-sim`)
  says so on the desktop, in the DOS prompt and on every game's own screen.
  This is a content rule, not decoration: a viewer must never mistake the
  rig's output for real hardware.

The kit is in `styles/tailwind-input.css`: colour tokens (named in
`tailwind.config.js`), the components (`btn-primary`, `btn-secondary`,
`field`, `list` and `list-row`, `card`, `section-label`, the load states) and
the rig's own pieces (`.rig`, `.rig-bezel`, `.rig-glass`, `.rig-scanlines`,
`.rig-window`, `.rig-readout`, `.rig-prompt`, `.rig-sim`, `.rig-key`,
`.rig-sheet`).

- Colour comes only from the tokens, never a raw hex value or a stock palette
  class. The one deliberate exception is inside the canvas games, which paint
  their own phosphor palettes in `public/games.js`.
- Tap targets are at least 44 px; the buttons, fields and keys already are.
- A window that loads data has honest states (skeleton, empty, error with a
  Retry).
- Seed obviously fake staging data so the populated screens can be seen
  ("Staging mock data" in the platform conventions).

## App-specific conventions

- **Three files, one job each.** `public/games.js` holds both games as pure,
  deterministic state machines plus their canvas drawing, and never touches
  the DOM (a save slot serializes its state, and a test can drive it with no
  browser). `public/crt.js` is the picture pipeline: a 320x200 backbuffer
  scaled onto the visible canvas with the viewer's gamma, brightness,
  scanlines and aspect, plus the frame-skip loop. `public/play.js` is the game
  host (canvas, input through the joystick mapping, readout, save controls)
  and the how-to-play screen. Keep the games free of DOM and storage.
- **The rig's data is four public tables**, keyed by the platform user id and
  read or written only through `server.js`: `rr_settings` (the six settings),
  `rr_catalogue` (catalogued files), `rr_saves` (one row per game and slot,
  the run's state as JSONB) and `rr_keymap` (the joystick mapping). They hold
  one person's own settings and file names, so they are public by default; no
  secrets, no messages, no personal information beyond the platform username.
  Nothing is kept in the browser.
- **Uploads are catalogued, never executed.** A file added in the Game
  Collection is recorded by name, type, size and the title the viewer gave it.
  The bytes never leave the browser and the rig never runs them; the Memory
  Card slots are the only thing the rig restores and plays. Never add a code
  path that executes, renders or previews an uploaded file.
- **Slots are fixed at four per game** (ids 1 to 4, clamped again on the
  server). A save stores the game's own state object, so a snapshot that does
  not match the current shape still loads into a playable run: both
  `loadDeepwatch` and `loadMandate` clamp every field and fall back to a fresh
  run.
- **The settings are the rig's picture and sound**, not decoration. Volume
  scales the synthesised tone, gamma and brightness filter the canvas,
  scanlines overlay it, aspect sets the canvas height and frame skip decides
  how often a game redraws (never how fast it runs). `describeSettings()` is
  the single place that turns them into the printed lines, so the desktop,
  the Settings window and the prompt's `VER` cannot drift apart.
- **The DOS prompt is a simulation** and says so. It answers `HELP`, `DIR`,
  `VER`, `CLS` and `RUN <title>`; `RUN` starts a built-in title and refuses a
  catalogued file by explaining that the rig catalogues files and never runs
  them.
- **The two built-in titles are original to this app**, and deliberately not
  the names, art or scenarios of any commercial game: **Deepwatch: Trench
  Patrol** (a hydrography patrol: sonar, depth bands, a quiet budget) and
  **Mandate of Seasons** (eight seasons over seven provinces: granaries,
  dikes, trade roads and loyalty). Add a third by adding one entry to
  `BUILT_IN` in `public/games.js` with its own pure state machine, drawer and
  `howTo` blocks.
- **Content:** both games are non-violent by construction. Conflict in
  Deepwatch is sonar and positioning; Mandate of Seasons is harvests, works
  and loyalty. There is no weaponry, no combat, no gore and no gambling
  anywhere, including in the seed rows. User-facing copy avoids em dashes.
- **The rig's clock** is only ever displayed (the Start menu's taskbar), never
  used to decide what shows, so it reads through `usernode.now()` for
  consistency with the platform but needs no preview moment.
