# Pixmotion AI: notes for Claude Code

This app runs on **Homeroom**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

Fetch that URL at the start of each session; it is the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, the LLM proxy, "don't `git push`", etc.). The
hosted copy is updated in place when platform rules change, so fetching
it gives you today's rules, not a stale snapshot.

When running inside Homeroom's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path. It is the right reflex when someone runs Claude Code
against this repo locally or from another harness.

## Connector permission prompts

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) so they stop prompting one at a time. Everything
that acts (filing a request, opening or advancing a proposal) still asks.
Claude Code applies those rules only after you accept the
workspace trust dialog, which lists them for review. See `.claude/README.md`
for the whole story.

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. The canonical repository is named in
`.claude/homeroom-canonical-repo`. Check against it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`).
To change code, start from the exact base commit your Homeroom work order
gives, and never merge or rebase onto the canonical `main` yourself. A
session-start hook (`.claude/hooks/homeroom-freshness.sh`) runs this check
for you; it is silent offline, so its silence is not proof the checkout is
current. Inside Homeroom's dev-chat the platform fixes the base commit.

## Scaffolding that must stay

Two pieces of `public/index.html` are platform infrastructure, not content:

- the `usernode-dev-console@1` forwarder `<script>`, and
- the bridge `<script>` and the theme `<script>` right after it.

The handheld arcade this app used to be (GameWatch, and RetroRig before it)
is gone. Do not look for it and do not reintroduce it: its screens, its
segment art, its eight titles and its eight tables were all retired when the
studio replaced it, and a retired address renders the studio's own not-here
state.

---

## About Pixmotion AI

A dark **AI media editor**, laid out like a professional video editor: a
top bar (Back, a breadcrumb, Undo and Redo, the tool row, the collaborator
avatars, the **AI usage meter** and **Export**), a left **Project media**
library with a search box, a centre **Preview** player with a scrub bar and a
`01:38/01:40` timecode, a right **Inspector** of four tabs (**Video**,
**Animation**, **Tracking**, **Audio & FX**), a bottom-right **assistant
widget**, and a full-width **multi-track timeline** (text, clips,
transitions, audio) with a playhead and trim handles.

The point of the app is the honest boundary. The platform has no image,
video or audio model behind its AI proxy, no credit balance and no way to
encode a file, so **everything of that kind is simulated and says so on
screen**. The one real generation is the assistant chat, which answers
through the platform's own text AI under the reader's own consent grant,
and the one real money figure is the platform's own daily spend and cap,
which the app only reads.

## Design

This app's look. Every change follows it, and updates it when a request
changes the look on purpose.

- **Palette:** a two-tone charcoal ground (`--ground` #0D0F12, `--surface`,
  `--raised`), translucent glass panels (`.st-glass`), a **neon purple**
  `--accent` (#8B5CF6) for the one primary action (**Export**, **Add to
  project as a placeholder**), the active tab underline, the scrub fill and
  the playhead; **magenta** `--amber` (#EC4899) for the simulation lamp
  `.rig-sim`, the collaborator chips, the trim handle and the AI meter once it
  is at 90% of its cap; **indigo** `--signal` for everything the studio
  PRINTS (the readout lines, the AI meter's figure and bar, the **Platform
  AI** tag, the waveform, the ruler ticks); `--focus` magenta for the
  keyboard ring; alarm red for a destructive action.
- **Signature element:** the readout block (`.rig-readout`) of monospaced
  `.rig-print` lines under the studio, and the timecode printed in the same
  voice.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  (sizes in `tailwind.config.js`).
- **One fixed look:** DARK. The studio is drawn as its own console, which is
  the documented exception to the two-look rule. `:root` and `.dark` carry
  the same token values in `styles/tailwind-input.css`, so the app renders
  identically in Homeroom's light and dark themes. Do not "fix" this by
  adding a light look.
- **The glassmorphism is one class.** `.st-glass` is a low-alpha surface
  with a blur and a lit rim, applied to the top bar, the panels, the
  timeline and the assistant widget, and nowhere else.
- **Every simulated surface is labelled.** The lamp `.rig-sim` (the word
  **Simulated**) sits on the library, the preview, the timeline, the
  collaborator avatars, the three simulated quick actions, every generation
  panel and the export panel. The one real action carries `.st-real`
  (**Platform AI**) instead. This is a content rule, not decoration: a
  viewer must never mistake a drawn plate or a placeholder for a generated
  thing.

The kit is in `styles/tailwind-input.css`: colour tokens (named in
`tailwind.config.js`), the components (`btn-primary`, `btn-secondary`,
`field`, `list` and `list-row`, `card`, `section-label`, the load states),
the pieces kept from the handheld (`.rig-window`, `.rig-readout`,
`.rig-print`, `.rig-sim`, `.rig-sheet`, `.toast`) and the studio's own
(`.st-glass`, `.st-topbar`, `.st-meter`, `.st-lib-*`, `.st-stage*`,
`.st-scrub`, `.st-tabs`, `.st-group`, `.st-slider`, `.st-select`,
`.st-assist*`, `.st-track`, `.st-ruler`, `.st-lane*`, `.st-clip*`,
`.st-wave`, `.st-playhead`).

- Colour comes only from the tokens, never a raw hex value or a stock palette
  class.
- Tap targets are at least 44 px; the buttons, fields, tabs and tool chips
  already are.
- A screen that loads data has honest states (skeleton, empty, error with a
  Retry).
- Seed obviously fake staging data so the populated screens can be seen
  ("Staging mock data" in the platform conventions).

## App-specific conventions

- **One job per file.** `public/timeline.js` is the pure timeline model
  (lanes, the printed timecode, the clamps) and knows no DOM and no clock.
  `public/generate.js` is the simulation catalogue (the presets, the banks,
  the labelled result lines) with no price list anywhere in it.
  `public/assistant.js` is the one place that talks to the text AI and the
  bridge's grant functions, with every platform sentence as a constant.
  `public/studio.js` draws the pieces from the state and the handlers and
  keeps no state. `public/app.js` owns the state, the router and the
  handlers. `public/server-api.js` is the client API. `lib/llm-proxy.js` is
  the server's one path to the proxy, kept apart so a test can drive it.
- **The simulation has to be visible, not merely true.** Generate Images,
  Generate Avatar, Generate Video, an SFX or voice selection and Export open a
  labelled panel that names the request, states that nothing was produced,
  quotes **no price**, and offers **Add to project as a placeholder**. The
  placeholder row and its timeline block are labelled from data
  (`simulated`), not from a class name someone can forget. There is no
  credit price table and no Top Up anywhere: the request's AI-credit list is
  invented and is not built.
- **The assistant is the one real generation, and its absence is a normal
  state.** `POST /api/assistant` forwards to
  `USERNODE_LLM_PROXY_URL/v1/messages` with the app token and the caller's
  own forwarded `x-usernode-token`. `LLM_ENABLED = !!USERNODE_LLM_PROXY_TOKEN`;
  staging carries no token by the platform's design, so there the route
  answers `503 assistant_unavailable` without calling anything and the widget
  and the meter print **AI assistant unavailable in this environment**.
  Nothing is keyed on `IS_STAGING`. The system prompt (`ASSISTANT_SYSTEM`)
  tells the model to decline sexual or explicit content including nudity,
  anything depicting children or minors, and violent, weapon, gambling and
  loot-box topics with one neutral sentence, and the widget's copy says so.
- **Grant, caps and the meter.** On the proxy's `403 grant_required` the
  client calls `usernode.requestLlmAccess()` and retries the same message
  once if granted; on `429 app_cap_exceeded` and `429 budget_exceeded` it
  prints the platform's own words and never retries. The assistant also stops
  at `SPEND_SHARE` (25%) of the platform's reported daily cap for this app,
  enforced server side (`app_limit_reached`, no proxy call and no stored row)
  and client side (`usage.limited`, Send prints the line and posts nothing),
  and the meter prints the limit next to the platform's own figures. The top bar's meter
  reads `usernode.getLlmUsage()` first and the proxy's
  `x-usernode-llm-spent-cents` / `x-usernode-llm-cap-cents` headers after
  every reply; the app keeps no token-price table. **Manage AI permissions in
  the platform's Settings** is the note under both. `dapp.json` declares the
  `llm` block (purpose and a modest suggested cap); the proxy's two
  variables are reserved and are never declared as secrets. No API key,
  ever.
- **The studio's data is five public tables**, keyed by the platform user
  id and read or written only through `server.js`: `rr_projects` (one
  project; `sample = TRUE` marks the one shown read-only to a person with
  none, which only the staging seed writes), `rr_media`, `rr_tracks`,
  `rr_clips` and `rr_assistant` (one turn, with the meter headers the reply
  carried). A write always lands on the writer's own project; a person with
  none gets one on their first write, a copy of the sample when there is one.
  Nothing is kept in the browser.
- **Art travels through platform storage.** A clip's picture goes up through
  `usernode.uploadFile()` on the bridge and only the returned `{url, fileId}`
  pair is persisted, never image bytes in Postgres. Platform files are
  immutable, so a replace uploads a new file. Where storage is not reachable
  the attach control is disabled and the screen says so.
- **The timecode is one reading.** `formatTimecode` in `public/timeline.js`
  is the only place a time is printed, so the scrub readout, the ruler and
  the timeline's readout cannot drift. The playhead is one number clamped to
  `duration_ms`, moved by a pointer on one element; no drag library.
- **The collaborator avatars are a labelled simulation.** The app reads no
  member list, so the avatars are drawn initials under **Simulated
  collaborators** and never claim a live presence.
- **The stack is fixed.** One `server.js` with Express routes, a hash-routed
  vanilla-JS frontend, Tailwind compiled at build time. No Next.js, no
  Zustand, no shadcn, no Framer Motion, no Lucide, no runtime Tailwind, no
  third-party generation API, no key. Those refusals are deliberate.
- **Content rules.** No violence, no weapons, no sexual or suggestive
  content, no gambling, no loot box anywhere, including the seed rows, the
  presets and the assistant's replies. User-facing copy avoids em dashes.
