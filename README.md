# QuestVerse

> Your gateway to web3 text-based adventures and arcade games.

QuestVerse is a browsable arcade of text-adventure titles that you play
right in the app. It ships with five launch titles and a built-in runner
that plays any of them as a web page, straight from each game's prompt.

## The five launch titles

- **Timun Suri: Run from the Giant** (Indonesian folklore, survival)
- **Awas Ada Pocong: Escape from Kampung Sinden** (folklore, stealth)
- **Neon Syndicate: Breach at Sector 7** (cyberpunk, heist)
- **Starship Salvage** (sci-fi, salvage)
- **Uncover the Ancient Tale of Xylos** (sci-fi, exploration)

## How it works

- **The Arcade** is the home screen: a card per title with its tags, key
  art, and a status line (Not started, In progress, Completed). One tap
  runs or resumes a title.
- **The Runner** plays a title. It shows the game's own state block (the
  bracketed readout its prompt defines), the narrative scene, three A/B/C
  choices, and a custom-action field for anything else you want to try.
  Winning shows a Victory screen, running out of a gauge shows Game over.
- **The Details drawer** has each title's lore, state variables, starting
  inventory, stages, and achievements. It is also its own address.
- **Progress and achievements** are saved in this browser (per signed-in
  person when the platform provides one) and are private to it.

The mechanics live in `public/engine.js` (a pure, deterministic engine)
and the five title scripts in `public/catalog.js`. There is no server
state: the only API the app needs is the caller's own identity.

## Running it

The app is a Node/Express server with a static frontend:

```sh
npm ci --include=dev
npm run build      # compiles styles/tailwind-input.css to public/tailwind.css
npm start          # node server.js, on PORT (default 3000)
```

`DATABASE_URL`, `USERNODE_JWT_PUBLIC_KEY` and `USERNODE_APP_ID` are
injected by the platform at runtime.
