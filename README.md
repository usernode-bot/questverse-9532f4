# Homeroom Studio

> A dark AI media editor: one project, built from clips, text, transitions and audio, with an inspector, a multi-track timeline and an assistant.

Homeroom Studio is laid out like a professional video editor. A top bar
carries the breadcrumb, Undo and Redo, the tool row, the collaborator
avatars, the AI usage meter and Export. The Project media library sits on
the left, the Preview player with its scrub bar and `01:38/01:40` timecode
in the centre, the Inspector (Video, Animation, Tracking, Audio & FX) on the
right with the assistant widget under it, and the multi-track timeline runs
the full width underneath.

## What is real and what is simulated

The platform has no image, video or audio model behind its AI proxy, no
credit balance and no way to encode a file, so:

- **Generate Images, Generate Avatar, Generate Video, the SFX bank, the
  voice talent and Export are simulated.** Each opens a labelled panel that
  names the request, says plainly that nothing was produced, quotes no price,
  and offers **Add to project as a placeholder**, which leaves a clearly
  marked row in the library and a block on the timeline.
- **The assistant chat is real.** Generate Text and anything typed into the
  prompt bar go through the platform's own text AI, charged to your own daily
  AI budget under a permission you approve the first time. The platform's own
  dialog asks; the app never asks for a key.
- **The AI usage meter is real.** It reads today's spend through this app
  against the cap you chose, the same two numbers the platform's Settings
  show. **Manage AI permissions in the platform's Settings** is where the cap
  changes or the permission is withdrawn. There is no Top Up.
- **Where the platform gives the app no AI** (every staging preview, and any
  copy outside the platform) the meter and the widget read **AI assistant
  unavailable in this environment**, and the simulated quick actions still
  open their labelled panels.

## The screens

- `#/studio` is the editor and the default route. `#/studio/library?q=`
  applies a search, `#/studio/clips/<id>` selects a clip,
  `#/studio/inspector/<tab>` shows a tab, `#/studio/timeline` and
  `#/studio/assistant` scroll to those regions, `#/studio/export` opens the
  simulated export panel and `#/studio/generate/<kind>` a simulated
  generation panel.
- `#/about` says what the studio is and what in it is simulated.
- Any retired handheld address lands on the studio's not-here state.

## Data

Five public tables, keyed by the platform user id: `rr_projects`,
`rr_media`, `rr_tracks`, `rr_clips` and `rr_assistant`. A project is one
person's own; a person with none sees the sample project read-only (staging
only, seeded under a fake account) and their first change starts their own
copy of it. A clip's picture is a platform-storage URL and file id, never
bytes.

## Development

```sh
npm ci --include=dev
npm run build      # compiles styles/tailwind-input.css to public/tailwind.css
npm test           # the assistant, proxy, timeline and catalogue tests
node server.js
```

The platform injects `DATABASE_URL`, `USERNODE_JWT_PUBLIC_KEY`,
`USERNODE_APP_ID`, `PORT`, `USERNODE_ENV` and, in production only,
`USERNODE_LLM_PROXY_URL` and `USERNODE_LLM_PROXY_TOKEN`. See `CLAUDE.md`
for the design and the app-specific conventions.
