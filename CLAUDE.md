# GameWatch: notes for Claude Code

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
`presses` table) was removed when the arcade became this app. It is gone: do
not look for it, and do not reintroduce it.

Two pieces of that scaffolding are NOT starter content and must stay:

- the `usernode-dev-console@1` forwarder `<script>` in `public/index.html`
  (platform infrastructure), and
- the bridge `<script>` and the theme `<script>` right after it.

---

## About GameWatch

A simulated **LCD handheld arcade hybrid**: one device, drawn on the screen as
its own machine, holding a six-module dashboard and an arcade of **eight
original titles**. The dashboard modules are the **Arcade** (the default
screen), the **Terminal**, the **FTP** view, the **OS**, the **Features**
screen and the **Settings**.

The arcade is the point: an auto-sliding **hero banner** with amber arrows,
a glassmorphic `PLATFORM: GAMEWATCH` badge and optional uploaded art; **amber
genre pills**; and the titles as **catalog rows** carrying an LCD thumbnail, a
boxed genre tag, the uppercase title, its sub-genre line, a `PLATFORM:
GAMEWATCH` line and a **How to Play** link, then a `+ ADD NEW GAME` footer.
Each title carries its own **How to Play** drawer, its own **LCD play screen**,
its own readout, its own entry in the **key mapping** and its own **Memory
Card** slots. A **manager** (`#/manage`, with `#/manage/banner` for the
banner's own slide list) edits every title's words, its descriptions and its
control list, and replaces its thumbnail, banner and bezel art.

The point of the app is the machine, not only the titles: the settings really
change the picture a title is drawn with, the key mapping really changes which
keys play it, and the Memory Card really stores where a run had got to.

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** the shell is dark **brushed metal** (near-black ground, a
  lifted-grey surface for windows and catalog rows, a warmer raised metal for
  title bars and hovers, and a **bronze hairline** `--line` with an `--edge`
  highlight along a brushed panel); the **panel's own green-grey LCD** is the
  screen itself; **amber** `--accent` is the one action (the primary button,
  the focus ring `--focus`, the genre pills, the hero's glass badge) with
  `--on-accent` for text on it; **pale bronze** `--signal` is what the handheld
  PRINTS (the boot log, a terminal reply, every readout); the **bronze** amber
  token is the caution lamp (a key conflict, the "simulated" pills, the genre
  box); **alarm red** is a destructive action or a run ending.
- **Signature element:** the bracketed readout block (`.rig-readout`) of
  monospaced cyan lines, printed under every screen the handheld produces.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  (sizes in `tailwind.config.js`); anything the handheld prints in its own
  voice is `.rig-print`, monospace.
- **The LCD, not a smooth canvas, is the look decision.** A title draws fixed
  segments that appear and disappear (`public/lcd.js`), not a painted scene.
  Covers are drawn in segments too, so no title's art is a picture of anything.
- **One fixed look:** DARK, the machine's own scene. GameWatch is drawn as its
  own scene, a handheld, which is the documented exception to the two-look
  rule. `:root` and `.dark` carry the same token values in
  `styles/tailwind-input.css`, so the app renders identically in Homeroom's
  light and dark themes. Do not "fix" this by adding a light look.
- **The OS skins are shades of that one look, not a second one.** The OS
  screen sets `classic`, `silver` or `night` on the shell (`data-skin`), which
  repaints the shell, bezel and panel tones from a block at the bottom of
  `styles/tailwind-input.css`. No component and no layout changes with a skin.
- **Every simulated surface is labelled.** The Simulation lamp (`.rig-sim`)
  says so on the Arcade's covers, in the Terminal, on each title's panel, on
  the OS screen, on the FTP tree and on the Features screen. This is a content
  rule, not decoration: a viewer must never mistake the handheld's output for
  real hardware.

The kit is in `styles/tailwind-input.css`: colour tokens (named in
`tailwind.config.js`), the components (`btn-primary`, `btn-secondary`,
`field`, `list` and `list-row`, `card`, `section-label`, the load states), the
handheld's own pieces (`.rig`, `.rig-bezel`, `.rig-glass`, `.rig-scanlines`,
`.rig-vignette`, `.rig-nav`, `.rig-window`, `.rig-readout`, `.rig-prompt`,
`.rig-sim`, `.rig-keypad`, `.rig-button`, `.rig-sheet`) and the Arcade's
(`.gw-grain`, `.gw-header`, `.gw-wordmark`, `.gw-menu-button`, `.gw-hero`,
`.gw-hero-badge`, `.gw-hero-arrow`, `.gw-hero-dot`, `.gw-pill`,
`.gw-cat-list`, `.gw-cat-row`, `.gw-cat-title`, `.gw-cat-tag`,
`.gw-cat-detail`, `.gw-thumb`, `.gw-platform`, `.gw-howto`, `.gw-add-foot`,
`.gw-slide-row`, `.gw-ftp`, `.gw-install-log`).

- Colour comes only from the tokens, never a raw hex value or a stock palette
  class. The one deliberate exception is inside the panel art, which paints
  the LCD's own inks (picked from `public/lcd.js`).
- Tap targets are at least 44 px; the buttons, fields, tags and keys already are.
- A screen that loads data has honest states (skeleton, empty, error with a Retry).
- Seed obviously fake staging data so the populated screens can be seen
  ("Staging mock data" in the platform conventions).

## App-specific conventions

- **One job per file.** `public/lcd.js` is the segment kit (the art language,
  the seven-segment digits, the printed labels, the cell bars) and knows nothing
  about any title. `public/games.js` holds the code side of the titles: eight
  pure, deterministic state machines plus their segment drawing, and never
  touches the DOM (a save slot serializes a state, and a test can drive it with
  no browser). `public/titles.originals.js` is the eight built-in titles as
  plain data, the app's seed. `public/manage.js` is the manager's forms. `public/crt.js` is the picture pipeline: a 320x200 segment
  backbuffer scaled onto the visible canvas with the viewer's gamma,
  brightness, contrast, scanlines and curvature. `public/play.js` is the play
  screen (panel, keypad, readout, Memory Card, How to Play drawer) and the
  standalone how-to screen. Keep a title free of DOM, storage and the clock.
- **A title's words are data; its rules stay code.** The eight built-ins live
  in the `rr_titles` table (seeded on every boot from
  `public/titles.originals.js`, so a fresh database renders the full Arcade)
  and a person's own added titles are rows in the same table. `RUNNERS` in
  `public/games.js` carries each built-in's six functions. `runnerFor(id)`
  merges a loaded row with its code register, so a title is reached by id only
  and cannot be half-registered, and an added title (no register entry) lists
  and shows its picture but cannot run. `findTitle(id)` reads the loaded rows.
  Adding a playable ninth title is still code: its rules and its panel, plus
  its seed row.
- **One save shape covers all eight.** A slot's JSONB carries at least
  `{ v, highScore, progress, ended }` plus whatever that title needs, so the
  Memory Card can list any title's slot. Every `load*` clamps each field and
  falls back to a fresh run, so a slot written by an older build still loads
  into a playable run.
- **The handheld's data is eight public tables**, keyed by the platform user id
  and read or written only through `server.js`: `rr_titles` (every title in the
  Arcade, the eight built-ins with `built_in = true` and `owner_id = NULL` and
  each added title owned by whoever added it), `rr_title_slides` (one person's
  own banner slide list), `rr_settings` (the panel's picture and sound),
  `rr_keymap` (the nine handheld keys), `rr_saves` (one row per title and
  card), `rr_catalogue` (the older added-title table, kept and copied into
  `rr_titles` on boot), `rr_skins` (the OS skin and the last provisioning
  transcript) and `rr_snapshots` (the Features screen's snapshots). They hold
  the collection plus one person's own settings, key mapping, runs and labels,
  so they are public by default; no secrets, no messages, no personal
  information beyond the platform username. Nothing is kept in the browser.
- **The settings are the panel's picture and sound**, not decoration. Volume
  scales the synthesised tone, gamma, brightness and contrast filter the
  canvas, scanlines overlay it and curvature is the corner falloff, both in the
  picture and on the shell around it. `describeSettings()` is the single place
  that turns them into the printed lines, so the Settings screen, the Arcade's
  readout and the Terminal's `SYSINFO` cannot drift apart. A fixed LCD panel
  has no aspect to choose and no frame skip to set, so neither is offered.
- **Nine handheld keys.** D-Pad up/down/left/right, Game A, Game B, Sound,
  Time and Reset. The mapping screen keeps its old job: rebind a key, refuse a
  conflict, persist the map. `conflictsFor` names the clash with the handheld's
  own key name. Sound mutes and unmutes the one tone generator rather than
  adding a second; Time shows and hides the panel clock; Reset asks for
  confirmation, so a run is never lost to a stray key.
- **The clock is only ever displayed.** It reads through `usernode.now()` on
  the page and `req.now` on the server, so a preview opened at a chosen moment
  shows that moment. The app reasons in **UTC** and says so on screen: the
  Features screen's two-month snapshot retention is the one rule that depends
  on it, and the retention sweep on boot is what removes an expired snapshot.
- **Install UFW is a transcript, not a package manager.** `POST
  /api/install-ufw` streams a fixed, obviously simulated log. It installs
  nothing, runs no shell and reaches no host, so staging and production run the
  identical path and `IS_STAGING` never gates it.
- **The FTP tree is a read-only view** of what the app already holds. It
  uploads and downloads nothing and names no directory outside this app.
- **Art travels through platform storage.** A title's thumbnail, banner and
  bezel picture go up through `usernode.uploadFile()` on the bridge path and
  only the returned URL and its file id are persisted, never image bytes in
  Postgres. Platform files are immutable, so replacing a picture uploads a new
  file and keeps the old file's id beside the URL for a later cleanup. Where
  storage is not reachable, the file inputs are disabled, the drawn art is used
  and the screen says so. An uploaded bezel sits in the frame around the panel;
  the panel itself stays the drawn simulation, because an image cannot become
  the animated segments.
- **The eight titles are original to this app.** Four of their names carry a
  harmless reading on purpose: Battle Field is a hurdle track, Airforce Fighter
  a ridge glider, Guerrilla Warfare a blazed jungle trail, Submarine Battle a
  deep-sea salvage dive, Space Attacker is dodging drifting rock, Hungry Dragon
  is catching fruit and keeping clear of campfire embers, SL Bankman is sorting
  coins into trays and Western Bar is a soda counter. There is **no violence,
  no weaponry, no gambling, no betting and no loot box** anywhere, including
  the seed rows, the covers and the copy. Nothing borrows a real hardware
  brand: no brand name, logo, bezel artwork, model number or photograph of real
  hardware appears anywhere. User-facing copy avoids em dashes.
- **Two panels, gated on an action, not a name.** The platform tells the app
  who is signed in, never their role, so a panel gated on a hard-coded username
  would refuse every reviewer and every voter. The **manager** (`#/manage`) is
  where the collection is edited: any signed-in person may edit a built-in
  title and that edit is shared, because the eight titles belong to the
  collection; an added title belongs to whoever added it, and only that person
  may edit or remove it. The **admin panel** (`#/admin`) is the older view of a
  person's own added titles. Every row is keyed to the platform user id from
  the verified token, so nobody edits in someone else's name; the screens name
  that path in words (`MANAGE_NOTE` in `public/manage.js`, `ADMIN_NOTE` in
  `public/admin.js`), and a guest reads both read-only with the forms turned
  off and a line saying why.
- **The manager edits what a title SAYS, never how it PLAYS.** Its fields are
  the name, year, broad genre, genre box, sub-genres, the one-line description,
  the description, the control list (each row's words plus which handheld
  buttons it covers) and the three pictures. The words a row's `plays` names
  are what the keypad prints on that button and what How to Play lists; which
  physical key a handheld button is bound to stays the personal choice on the
  Settings screen. The play rules, the panel art and the scoring stay in code,
  so editing an added title's name never makes it playable and never breaks a
  built-in's play screen. A run keys on the title's id, so renaming a title
  leaves its Memory Card cards and its high score where they were.
