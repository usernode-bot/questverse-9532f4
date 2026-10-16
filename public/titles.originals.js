// The eight built-in GameWatch titles: their words, their tiers and their
// drawn cover art.
//
// This file is DATA. It is the single source the app seeds rr_titles from, so
// the eight originals are rows like every other title and the Arcade renders
// on a database that has never seen them. It is read by `public/games.js` in
// the browser and by `server.js` in Node (a dynamic import), so there is
// exactly one copy of each title's words.
//
// What a title DOES is not here. Its rules and its panel drawing stay in
// public/games.js, so an edit to this data changes what a title says and
// shows, never how it plays.
//
// Content note: no violence, no weaponry, no gambling and no loot box appears
// in any title, its cover or its copy. The names that sound martial are played
// as their harmless readings: a hurdle race, a ridge glider, a jungle trek, a
// salvage dive, a rock-dodging flight, fruit caught and embers dodged, and
// coins sorted into trays.

export const BUILT_IN_TITLES = [
  {
    id: 'western-bar',
    title: 'Western Bar',
    year: 1981,
    category: 'Action',
    genreBox: 'Soda jerk',
    genres: ['Serve', 'Reflex', 'Timing'],
    tagline: 'Three taps, one glass, and the pour has to land in the band.',
    summary:
      'You are the soda jerk behind a three-tap counter. A customer calls for one of the taps, the pour meter runs up and down, and you serve when the meter is inside the band and your head is over the tap they asked for. Nothing here is a fight: it is a drinks counter on a busy afternoon.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Left and Right', action: 'Move the pour head along the three taps', plays: ['left', 'right'] },
      { keys: 'Game A', action: 'Serve: pour the glass when the meter is in the band', plays: ['game_a'] },
      { keys: 'Game B', action: 'Ease off: turn the meter back the other way', plays: ['game_b'] },
      { keys: 'Reset', action: 'Start the shift again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The three cells along the top are the taps: LEFT, MIDDLE and RIGHT.',
          'The lit cell is the tap the customer ordered. The pour head sits under a cell of its own.',
          'POUR is the meter: a column of cells that fills and empties on its own.',
          'The two marked cells in the middle are the band. Serving inside the band is a good glass.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Left and Right slide the pour head one tap at a time.',
          'Game A serves. It is a good glass only when the head is over the ordered tap AND the pour meter is inside the band.',
          'Game B eases off: it turns the meter back the other way, which is how a pour that runs too fast is rescued.',
          'Serving at the wrong tap, or outside the band, is a spilled glass and one of your three spills.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'SERVED counts the good glasses. Every good glass makes the meter slightly quicker.',
          'Three spills and the shift closes. Your high score is the glasses served.',
          'The Memory Card keeps the whole run: the count, the meter and the tap you were on.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 29 },
      { name: 'Regular', min: 30, max: 79 },
      { name: 'Ace', min: 80, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '...#####################..',
      '...#...................#..',
      '...#..##.......##......#..',
      '...#.###.......###.....#..',
      '...#..##.......##......#..',
      '...#...................#..',
      '...#..#####...#####....#..',
      '...#..#...#...#...#....#..',
      '...#..#...#...#...#....#..',
      '...#..#####...#####....#..',
      '...#...................#..',
      '...#.....#########.....#..',
      '...#.....#.......#.....#..',
      '...#.....#########.....#..',
      '...#...................#..',
      '...#####################..',
      '..........................',
    ],
    sortOrder: 1,
  },
  {
    id: 'battle-field',
    title: 'Battle Field',
    year: 1981,
    category: 'Action',
    genreBox: 'Obstacle course',
    genres: ['Hurdle', 'Rhythm', 'Reflex'],
    tagline: 'A practice track of hurdles and low bars, and a steady stride.',
    summary:
      'An athletics track with two kinds of obstacle: a high hurdle you jump, and a low bar you duck under. The track runs at you at a fixed speed and the obstacles are spaced in a rhythm, so the whole title is timing. There is no contest beyond the track itself.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Game A', action: 'Jump a high hurdle', plays: ['game_a'] },
      { keys: 'Game B', action: 'Duck under a low bar', plays: ['game_b'] },
      { keys: 'Left and Right', action: 'Lean into the next stride (a shorter hop)', plays: ['left', 'right'] },
      { keys: 'Reset', action: 'Start the track again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The lit figure on the left is your runner. The track runs to the right.',
          'A tall cell coming down the track is a HIGH hurdle: jump it.',
          'A short cell coming down the track is a LOW bar: duck under it.',
          'DISTANCE is the track behind you, in stride cells. HURDLES is how many you cleared.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Game A jumps. A jump lasts a short beat, so jumping early puts you back on the ground too soon.',
          'Game B ducks. A duck lasts a shorter beat than a jump.',
          'Left and Right are a stride: they shorten the next gap, which is how you set the rhythm again after a stumble.',
          'Clipping a hurdle, or standing up into a low bar, is a stumble and one of your three.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'The track speeds up a little after every ten cleared obstacles.',
          'Three stumbles and the trial ends. Your high score is the distance run.',
          'The Memory Card keeps the distance, the next obstacle and the rhythm you were in.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 49 },
      { name: 'Regular', min: 50, max: 149 },
      { name: 'Ace', min: 150, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '..#####################...',
      '..#...................#...',
      '..#..##..........##...#...',
      '..#.#..#........#..#..#...',
      '..#.#..#........#..#..#...',
      '..#..##..........##...#...',
      '..#...................#...',
      '..#..########..........#..',
      '..#..#......#.........#...',
      '..#..#......#.........#...',
      '..#..########.........#...',
      '..#...................#...',
      '..#.....####.....####.#...',
      '..#.....#..#.....#..#.#...',
      '..#.....####.....####.#...',
      '..#####################...',
      '..........................',
    ],
    sortOrder: 2,
  },
  {
    id: 'airforce-fighter',
    title: 'Airforce Fighter',
    year: 1982,
    category: 'Simulation',
    genreBox: 'Glider',
    genres: ['Lift', 'Balance', 'Endurance'],
    tagline: 'Ride the ridge line and stay inside the lifting band.',
    summary:
      'A ridge-soaring glider. The ridge throws a band of rising air along its face and the band drifts up and down; hold the glider inside it and the flight goes on. Outside the band the glider loses height. It is an endurance title: the score is time in the lift.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Game A', action: 'Pull up: a short burst of lift', plays: ['game_a'] },
      { keys: 'Game B', action: 'Nose down: trade height for speed', plays: ['game_b'] },
      { keys: 'Left and Right', action: 'Trim along the ridge face', plays: ['left', 'right'] },
      { keys: 'Reset', action: 'Launch again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The column on the left is ALTITUDE: one cell for every step of height.',
          'The moving block on the right is the lifting BAND rising off the ridge.',
          'LIFT is the glider\'s energy. Inside the band it refills; outside it drains.',
          'ALOFT is the flight so far, in whole seconds. That is the score.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Game A pulls up. It costs a little lift energy and climbs two cells.',
          'Game B noses down. It drops three cells and puts a little energy back.',
          'Left and Right trim: they slide the glider a cell along the ridge, which is how you meet the band as it drifts.',
          'Outside the band the altitude sinks on its own, a cell at a time.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'The band drifts faster as the flight goes on, so an early trim is a long flight and a late one is a short one.',
          'When LIFT reaches zero the glider settles onto the ridge and the flight ends.',
          'The Memory Card keeps the altitude, the band and the seconds aloft.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 39 },
      { name: 'Regular', min: 40, max: 119 },
      { name: 'Ace', min: 120, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '...........................',
      '...####################....',
      '...#..................#....',
      '...#.....##...........#....',
      '...#....#..#..........#....',
      '...#...#....#.........#....',
      '...#..#......#........#....',
      '...#...........#......#....',
      '...#............##.....#...',
      '...#............#......#...',
      '...#############.......#...',
      '...#...................#...',
      '...#....########.......#...',
      '...#....#......#.......#...',
      '...#....########.......#...',
      '...#...................#...',
      '...####################....',
      '...........................',
    ],
    sortOrder: 3,
  },
  {
    id: 'guerrilla-warfare',
    title: 'Guerrilla Warfare',
    year: 1982,
    category: 'Strategy',
    genreBox: 'Jungle trail',
    genres: ['Trail', 'Choice', 'Memory'],
    tagline: 'A blazed trail through the green: read the signpost, then recall it.',
    summary:
      'A walking trail through dense green, with a junction every so often. A guide signpost shows the way for a moment and then the green closes over it, so the rest of the trek is your own memory of which fork was blazed. No one is chased and nothing is fought.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Game A', action: 'Take the left fork', plays: ['game_a'] },
      { keys: 'Game B', action: 'Take the right fork', plays: ['game_b'] },
      { keys: 'Left and Right', action: 'Look down the fork before you commit', plays: ['left', 'right'] },
      { keys: 'Reset', action: 'Walk the trail again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The two columns are the fork in front of you: LEFT and RIGHT.',
          'A lit mark beside a column is the blaze the signpost showed.',
          'The green closes over the signpost after a moment, so the blaze is only there to be read once.',
          'JUNCTIONS is the trail behind you. The trek is ten junctions long.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Left and Right look down a fork. Looking costs nothing and is not the choice.',
          'Game A takes the left fork, Game B the right one. Only one of them is the blazed one.',
          'The signpost stays up for less and less time as the trek goes on.',
          'A wrong fork is a lost trail and one of your three; the trek picks up from the next junction.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'Ten junctions make a completed trek, and the score is the junctions walked correctly.',
          'Three wrong forks end the walk early.',
          'The Memory Card keeps the junction you were at and the blaze you were shown.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 29 },
      { name: 'Regular', min: 30, max: 89 },
      { name: 'Ace', min: 90, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '..####################....',
      '..#.................#.....',
      '..#..###....###.....#.....',
      '..#..#......#.......#.....',
      '..#..#......#.......#.....',
      '..#..###....###.....#.....',
      '..#.................#.....',
      '..#....###....###...#.....',
      '..#....#......#.....#.....',
      '..#....#......#.....#.....',
      '..#....###....###...#.....',
      '..#.................#.....',
      '..#..###....###.....#.....',
      '..#..#......#.......#.....',
      '..#..#......#.......#.....',
      '..####################....',
      '..........................',
    ],
    sortOrder: 4,
  },
  {
    id: 'submarine-battle',
    title: 'Submarine Battle',
    year: 1983,
    category: 'Simulation',
    genreBox: 'Deep-sea salvage',
    genres: ['Dive', 'Winch', 'Careful'],
    tagline: 'Pay the winch out to the crate, clamp it, and bring it back up.',
    summary:
      'A salvage dive. A crate sits on the seabed shelf at an unknown depth and the winch hook has to be paid out to it, then clamped and raised. The hook sinks on its own, so the whole title is a careful hand on the winch and an eye on the reef line.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Down', action: 'Pay the winch out one notch', plays: ['down'] },
      { keys: 'Up', action: 'Haul the winch in one notch', plays: ['up'] },
      { keys: 'Game A', action: 'Clamp the hook onto the crate', plays: ['game_a'] },
      { keys: 'Game B', action: 'Hold the winch: arrest the sink for a beat', plays: ['game_b'] },
      { keys: 'Reset', action: 'Surface and start the dive again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The column on the right is the WINCH: one cell for every notch of cable.',
          'The lit cell near the bottom is the crate. The pale band under it is the seabed.',
          'The dashed line is the REEF. A hook that reaches the reef has gone too deep.',
          'RAISED is the crates on deck. Six crates make a full dive.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Down pays the cable out a notch, Up hauls it in a notch.',
          'The hook sinks a notch on its own every moment, so hauling in is what holds depth.',
          'Game B holds the winch: for a beat the hook neither sinks nor rises, which is how a crate is lined up.',
          'Game A clamps. It only takes the crate when the hook is within one notch of it and above the reef.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'A clamped crate is raised a notch at a time; a hook lost to the reef starts again from the top.',
          'Three lost hooks end the dive. The score is the crates raised.',
          'The Memory Card keeps the winch depth, the crate and the crates raised.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 19 },
      { name: 'Regular', min: 20, max: 59 },
      { name: 'Ace', min: 60, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '...####################...',
      '...#..................#...',
      '...#....####..........#...',
      '...#....#.............#...',
      '...#....####..........#...',
      '...#..................#...',
      '...#.....#............#...',
      '...#....#.#...........#...',
      '...#...#...#..........#...',
      '...#..#.....#.........#...',
      '...#.#########........#...',
      '...#..................#...',
      '...#....######........#...',
      '...#....######........#...',
      '...#..##########......#...',
      '...####################...',
      '..........................',
    ],
    sortOrder: 5,
  },
  {
    id: 'space-attacker',
    title: 'Space Attacker',
    year: 1983,
    category: 'Action',
    genreBox: 'Asteroid dodging',
    genres: ['Dodge', 'Reaction', 'Endurance'],
    tagline: 'Four lanes of drifting rock, and one small ferry threading them.',
    summary:
      'A rock field in four lanes with a supply ferry working its way through. Rocks drift down the lanes and the ferry changes lane to let them past. Nothing is fired and nothing is attacked: the flight is dodging and the score is the distance made good.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Left and Right', action: 'Change lane', plays: ['left', 'right'] },
      { keys: 'Game A', action: 'Burst: a short, faster, better-paying stretch', plays: ['game_a'] },
      { keys: 'Game B', action: 'Brake: slow the field for a beat', plays: ['game_b'] },
      { keys: 'Reset', action: 'Restart the crossing, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The four columns are LANES. The lit cell at the bottom is the ferry.',
          'The blocks drifting down a column are rocks. A rock that reaches the ferry\'s lane is a hit.',
          'DISTANCE is the crossing so far. Because the field is dodged, it is the score.',
          'BURST is the multiplier lamp: it lights while a burst is running.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Left and Right move the ferry one lane at a time, and it can always move: there is no wall at the edge.',
          'Game A bursts: for a short stretch the crossing pays double, and the rock field comes at you faster.',
          'Game B brakes: the whole field slows for a beat, which is the one save when two lanes are blocked at once.',
          'A rock in the ferry\'s lane is a hit and one of your three hulls.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'The field drifts faster every hundred of distance.',
          'Three hits and the crossing ends. The Memory Card keeps the distance, the lanes and the ferry\'s own lane.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 49 },
      { name: 'Regular', min: 50, max: 199 },
      { name: 'Ace', min: 200, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '..####################....',
      '..#..................#....',
      '..#.....#....##......#....',
      '..#....###...#.......#....',
      '..#.....#....#.......#....',
      '..#..........#.......#....',
      '..#....##....##......#....',
      '..#...#......#.......#....',
      '..#...#......#.......#....',
      '..#....##....##......#....',
      '..#..................#....',
      '..#.....##...##......#....',
      '..#....#....#........#....',
      '..#.....##...##......#....',
      '..#..................#....',
      '..####################....',
      '..........................',
    ],
    sortOrder: 6,
  },
  {
    id: 'hungry-dragon',
    title: 'Hungry Dragon',
    year: 1984,
    category: 'Action',
    genreBox: 'Catch and dodge',
    genres: ['Catch', 'Dodge', 'Nerve'],
    tagline: 'Catch the fruit as it falls, and keep clear of the embers.',
    summary:
      'A young dragon sits under three chutes of falling things: ripe fruit to catch, and glowing campfire embers to keep away from. Open the mouth for the fruit, move away from the embers. Everything falling here is fruit, ash and cinders.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Left and Right', action: 'Move under another chute', plays: ['left', 'right'] },
      { keys: 'Game A', action: 'Open the mouth to catch what is falling', plays: ['game_a'] },
      { keys: 'Game B', action: 'Puff: lift the nearest falling thing a little way', plays: ['game_b'] },
      { keys: 'Reset', action: 'Start the orchard again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The three columns are CHUTES. The lit figure at the bottom is the dragon.',
          'A round block coming down a chute is fruit. A jagged block is an ember.',
          'CAUGHT is the fruit eaten. EMBERS is the embers you let through.',
          'The mouth cell under the dragon\'s head lights while the mouth is open.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Left and Right move the dragon one chute at a time.',
          'Game A opens the mouth for a beat. Fruit lands in an open mouth and is eaten; fruit that lands in a closed one is wasted.',
          'An ember that lands on the dragon is a singe and one of your three, whether the mouth is open or not. Move away from embers.',
          'Game B puffs: the nearest falling thing is lifted a little way, which buys a moment when both other chutes are crowded.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'The chutes fill faster as the orchard goes on.',
          'Three singes, or three wasted fruit, and the run ends. The score is the fruit eaten.',
          'The Memory Card keeps the dragon\'s chute, the mouth and the falling things.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 24 },
      { name: 'Regular', min: 25, max: 74 },
      { name: 'Ace', min: 75, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '...####################...',
      '...#.....#....#.......#...',
      '...#....#.#...#.......#...',
      '...#...#####..#.......#...',
      '...#..#.....##........#...',
      '...#..#.....##........#...',
      '...#...#####..#.......#...',
      '...#.....#....#.......#...',
      '...#.....#....#.......#...',
      '...#....###...##......#...',
      '...#...#..##..#.......#...',
      '...#...#...#..#.......#...',
      '...#....###...##......#...',
      '...#..................#...',
      '...####################...',
      '..........................',
    ],
    sortOrder: 7,
  },
  {
    id: 'sl-bankman',
    title: 'SL Bankman',
    year: 1984,
    category: 'Strategy',
    genreBox: 'Coin sorting',
    genres: ['Sort', 'Speed', 'Precision'],
    tagline: 'Read the coin on the rail and drop it in the tray that matches.',
    summary:
      'A coin counting house. Coins ride a rail past three trays, and each tray takes one denomination: the coin has to be read and dropped in the matching tray while it is over the window. It is a sorting title, and the score is correct sorts.',
    // The How to Play control list. `plays` names the handheld
    // buttons the row covers, so the play screen keypad can print
    // this title's own words over the key it is bound to.
    controls: [
      { keys: 'Left and Right', action: 'Move the drop head between the three trays', plays: ['left', 'right'] },
      { keys: 'Game A', action: 'Drop the coin into the tray under the head', plays: ['game_a'] },
      { keys: 'Game B', action: 'Set the coin aside: keep it, but do not sort it', plays: ['game_b'] },
      { keys: 'Reset', action: 'Start the shift again, after confirming', plays: ['reset'] },
    ],
    howTo: [
      {
        heading: 'What the segments mean',
        lines: [
          'The rail along the top carries one coin at a time toward the right.',
          'The three cells below are the TRAYS. Each tray takes one denomination, printed above it.',
          'The lit tray cell is the one the drop head is over.',
          'SORTED is the coins counted. SET ASIDE is the coins you kept back.',
        ],
      },
      {
        heading: 'How the keys behave',
        lines: [
          'Left and Right move the drop head one tray at a time.',
          'Game A drops the coin. It only counts when the head is over the tray that takes that coin.',
          'A coin that reaches the end of the rail unsorted is a miss, and so is a coin dropped in the wrong tray.',
          'Game B sets the coin aside, which keeps you from a miss when two odd coins come in a row. It is offered once every few coins.',
        ],
      },
      {
        heading: 'How a run is kept',
        lines: [
          'The rail runs faster as the shift goes on, and the window at each tray is narrower.',
          'Three misses and the shift closes. The score is the coins counted.',
          'The Memory Card keeps the rail, the trays and the count.',
        ],
      },
    ],
    tiers: [
      { name: 'Rookie', min: 0, max: 34 },
      { name: 'Regular', min: 35, max: 99 },
      { name: 'Ace', min: 100, max: null },
    ],
    // The drawn cover, as segment rows: this app's own art, kept so a
    // title with no uploaded picture still shows one.
    coverArt: [
      '..........................',
      '..####################....',
      '..#..................#....',
      '..#..##..####..##....#....',
      '..#.#..#.#..#.#..#...#....',
      '..#.#..#.#..#.#..#...#....',
      '..#..##..####..##....#....',
      '..#..................#....',
      '..#....###...###.....#....',
      '..#...#.......#......#....',
      '..#...##########.....#....',
      '..#...#.......#......#....',
      '..#....###...###.....#....',
      '..#..................#....',
      '..####################....',
      '..........................',
    ],
    sortOrder: 8,
  },
];
