# GameWatch

> A simulated LCD handheld arcade hybrid: eight original titles, a Memory Card and a dashboard of simulated modules.

GameWatch boots like the handheld it is pretending to be. The screen shows a
six-module dashboard, and the Arcade is where most of it happens: a sliding
cover-art header, genre filter tags, and the eight built-in titles as
poster-plus-title rows, each with its own How to Play drawer, its own LCD play
screen and its own Memory Card cards.

## The dashboard modules

- **Arcade** is the default screen. The cover strip slides sideways, the genre
  tags filter the list, and each title's row opens its How to Play drawer or
  starts it on the panel.
- **Terminal** is a simulated handheld terminal. `HELP`, `TITLES`, `RUN
  <title>`, `CARDS`, `SYSINFO`, `SKIN`, `COVERS`, `UFW` and `CLS` all work.
- **FTP** is a read-only simulated view of what the handheld holds: the eight
  titles, your Memory Card, your added titles and the OS settings. It uploads
  and downloads nothing.
- **OS** is the handheld's own OS screen. Three panel skins (classic, silver,
  night) and a provisioning transcript that reads back what it last said it
  did.
- **Features** covers the snapshot retention: snapshots are kept for two
  months, in UTC, and an older one is removed on the next start. It also
  streams a fixed, obviously simulated **Install UFW** transcript.
- **Settings** is the panel's picture and sound (volume, gamma, brightness,
  contrast, scanlines, curvature) and the mapping for the handheld's nine keys.

## The eight built-in titles

Each is original to this app, has its own segment art and its own scoring
tiers, and is played with the handheld's own keys.

| Title | Genre box | Genres |
| --- | --- | --- |
| Western Bar | Soda jerk | Serve, Reflex, Timing |
| Battle Field | Obstacle course | Hurdle, Rhythm, Reflex |
| Airforce Fighter | Glider | Lift, Balance, Endurance |
| Guerrilla Warfare | Jungle trail | Trail, Choice, Memory |
| Submarine Battle | Deep-sea salvage | Dive, Winch, Careful |
| Space Attacker | Asteroid dodging | Dodge, Reaction, Endurance |
| Hungry Dragon | Catch and dodge | Catch, Dodge, Nerve |
| SL Bankman | Coin sorting | Sort, Speed, Precision |

All eight are simulations, and the app says so on every surface. There is no
violence, no weaponry, no gambling, no betting and no loot box anywhere in
them. Nothing here borrows a real hardware brand.

## How it works

The app is a Node/Express server with a static frontend, and every piece of
the viewer's own state lives in Postgres, keyed by the platform user id:

- `public/lcd.js` is the segment kit: the art language, the seven-segment
  digits, the printed labels and the cell bars.
- `public/games.js` holds all eight titles as pure, deterministic state
  machines and their segment drawing, with no DOM or storage.
- `public/crt.js` is the picture pipeline: a 320x200 segment backbuffer scaled
  onto the visible canvas with the viewer's gamma, brightness, contrast,
  scanlines and curvature.
- `public/play.js` is the play screen (panel, keypad, readout, Memory Card, How
  to Play drawer) and the standalone how-to screen. `public/admin.js` is the
  panel for titles a person has added.
- `public/app.js` is the shell, the six dashboard modules and the boot
  sequence.
- `server.js` serves the API and the shell, verifies the platform's iframe
  token, and owns the six tables: `rr_settings`, `rr_keymap`, `rr_saves`,
  `rr_catalogue`, `rr_skins` and `rr_snapshots`.

## Running it

```sh
npm ci --include=dev
npm run build      # compiles styles/tailwind-input.css to public/tailwind.css
npm start          # node server.js, on PORT (default 3000)
```

`DATABASE_URL`, `USERNODE_JWT_PUBLIC_KEY` and `USERNODE_APP_ID` are injected
by the platform at runtime.
