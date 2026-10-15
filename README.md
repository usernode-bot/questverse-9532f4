# RetroRig

> A simulated mid-1990s home computer: games, saves and a DOS-style prompt.

RetroRig boots like the machine it is pretending to be. The screen shows the
CRT desktop, a Start menu opens five windows, and two original games run
inside the rig on a picture the viewer's own settings control.

## The windows

- **Game Collection** lists the built-in titles and any files the viewer has
  catalogued. A catalogued file is recorded by name, type and size; the rig
  never runs it.
- **Memory Card** holds four save slots for each built-in title. Load one to
  carry on where a run left off.
- **Keyboard** maps the rig's joystick to any six keys and lights a keybed.
  The mapping is what the games read, so they can be played with keys the
  viewer chooses.
- **Settings** is the picture and sound: volume, gamma, brightness, scanlines,
  aspect and frame skip, applied to every game the rig starts.
- **Prompt** is a simulated DOS prompt. `HELP`, `DIR`, `VER`, `CLS` and
  `RUN <title>` all work, and `RUN` starts a built-in title.

## The two built-in titles

- **Deepwatch: Trench Patrol** (1996) is a hydrography patrol: read sonar
  contacts, pick your depth band, and hold the lane before the quiet budget
  runs out.
- **Mandate of Seasons** (1996) is eight seasons over seven provinces: build
  granaries, dikes and trade roads, send your one officer, and keep the valley
  loyal enough for the mandate to be renewed.

Both are simulations, and the rig says so on screen. Neither has any violence,
weaponry or betting in it.

## How it works

The app is a Node/Express server with a static frontend, and every piece of
the viewer's own state lives in Postgres, keyed by the platform user id:

- `public/games.js` holds both games as pure, deterministic state machines and
  their canvas drawing, with no DOM or storage.
- `public/crt.js` is the picture pipeline: a 320x200 backbuffer scaled onto
  the visible canvas with the viewer's gamma, brightness, scanlines and aspect,
  plus the frame-skip loop.
- `public/play.js` is the game host and the how-to-play screen; `public/app.js`
  is the CRT desktop, the Start menu and the five windows.
- `server.js` serves the API and the shell, verifies the platform's iframe
  token, and owns the four tables: `rr_settings`, `rr_catalogue`, `rr_saves`
  and `rr_keymap`.

## Running it

```sh
npm ci --include=dev
npm run build      # compiles styles/tailwind-input.css to public/tailwind.css
npm start          # node server.js, on PORT (default 3000)
```

`DATABASE_URL`, `USERNODE_JWT_PUBLIC_KEY` and `USERNODE_APP_ID` are injected
by the platform at runtime.
