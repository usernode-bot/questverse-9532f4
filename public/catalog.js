// QuestVerse launch catalog.
//
// Five text-adventure titles, each with its metadata (what the arcade card
// and the details drawer show) and its script (what the runner plays).
// This is committed static data: nothing is fetched and nothing is seeded,
// so the arcade and every title render on an empty staging database.
//
// Content note: every title is suspense, evasion and puzzles. Items are
// survival utility (seeds, needles used as a caltrop decoy, salt, terasi,
// a light) used as wards and decoys, never as weapons, and the prose keeps
// to that.

const ACHIEVEMENT = (key, label, hint, test) => ({ key, label, hint, test });

export const CATALOG = [
  {
    id: 'timun-suri',
    title: 'Timun Suri: Run from the Giant',
    tagline: 'Outrun a hungry giant through an enchanted jungle.',
    tags: ['Indonesian folklore', 'Survival', 'Chase'],
    publisher: 'QuestVerse Originals',
    version: '1.0',
    accent: 'accent',
    lore: 'An ancient, enchanted Indonesian jungle where the old stories still walk. A monstrous, hungry giant is hunting you, and every sound you make carries through the mist.',
    background:
      'You are Timun Suri, born from a golden cucumber after years of prayer. The giant who bargained for you has come to collect, and tonight the jungle is your only ally.',
    stateVars: [
      { label: 'Distance gap', value: 'MODERATE (heavy footsteps)' },
      { label: 'Seeds', value: '1 of 1' },
      { label: 'Needles', value: '1 of 1' },
      { label: 'Salt', value: '1 of 1' },
      { label: 'Terasi', value: '1 of 1' },
    ],
    stageNames: ['Misty trail', 'Stone gap', 'Root river and haunted clearing', 'Mountain ascent'],
    startingInventory: ['Cucumber seeds', 'Sewing needles', 'Salt', 'Terasi (shrimp paste)'],
    achievements: [
      ACHIEVEMENT('escaped-giant', 'Escaped the Giant', 'Reach the Mountain Sanctuary and win.', (s) => s.finished && s.outcome === 'win'),
      ACHIEVEMENT('full-pouch', 'Full Pouch', 'Reach Stage 4 without using any item.', (s) => s.stageIndex >= 3 && Object.values(s.inventory).every((v) => v > 0)),
    ],
    inventoryPrefix: 'INVENTORY',
    nudge: 'The mist swallows your move. Pick one of the three paths, or name an item from your pouch.',
    itemText: {
      good: 'Your choice buys precious ground. The footsteps fall behind.',
      poor: 'It is the wrong trick for this ground, and the giant gains on you.',
      neutral: 'Nothing changes. The giant keeps its pace.',
    },
    gauges: [
      { key: 'gap', blockLabel: 'DISTANCE GAP', type: 'tier', steps: ['CAUGHT', 'CLOSE', 'MODERATE', 'FAR'], start: 'MODERATE' },
    ],
    inventory: [
      { key: 'seeds', label: 'Seeds', start: 1, aliases: ['seed', 'cucumber', 'timun'] },
      { key: 'needles', label: 'Needles', start: 1, aliases: ['needle', 'sewing'] },
      { key: 'salt', label: 'Salt', start: 1, aliases: ['garam'] },
      { key: 'terasi', label: 'Terasi', start: 1, aliases: ['shrimp paste', 'paste'] },
    ],
    flags: [],
    opening: "The trees fracture and collapse behind you. The Giant's roar shakes the ground. You clutch your pouch. A thick mist obstructs the path.",
    stages: [
      {
        scene: 'Mist beads on your arms. Somewhere behind you, trees snap like kindling. The trail forks at a mossy stone.',
        itemGauge: 'gap',
        items: { seeds: 'good', needles: 'poor', salt: 'neutral', terasi: 'poor' },
        keywords: [{ match: ['climb', 'tree', 'scout', 'look'], effects: [{ gauge: 'gap', delta: -1 }], text: 'You climb just high enough to read the mist, then drop back down. The pause costs you ground.' }],
        choices: [
          { key: 'A', text: 'Throw Cucumber Seeds behind you to sprout an overgrown vine barrier.', uses: 'seeds', outcome: 'The seeds burst into a wall of vines. The Giant tears at it, roaring, and you gain ground.' },
          { key: 'B', text: 'Scatter Sewing Needles across the narrow stone gap between the hills.', uses: 'needles', outcome: 'The needles skitter over bare stone with nothing to catch. The Giant is closer now.' },
          { key: 'C', text: 'Try to climb a tall tree to scout the terrain ahead.', effects: [{ gauge: 'gap', delta: -1 }], outcome: 'From the branch you see the sanctuary ridge, but the climb costs you the lead you had.' },
        ],
      },
      {
        scene: 'The stone gap yawns between two hills. The Giant moves faster where the ground is flat, and its breath is warm on the rocks.',
        itemGauge: 'gap',
        items: { seeds: 'poor', needles: 'good', salt: 'poor', terasi: 'good' },
        keywords: [{ match: ['hide', 'duck', 'still', 'quiet', 'wait'], effects: [{ gauge: 'gap', delta: -1 }], text: 'You press into the rocks and hold still. The Giant passes near, but you lose ground waiting.' }],
        choices: [
          { key: 'A', text: 'Sprinkle Cucumber Seeds across the flat stone.', uses: 'seeds', outcome: 'Vines need soil. On bare stone the seeds are wasted, and the Giant closes.' },
          { key: 'B', text: 'Scatter Sewing Needles across the narrow stone gap.', uses: 'needles', outcome: 'The needles find the Giant\'s feet. It bellows and stumbles, and you slip across the gap.' },
          { key: 'C', text: 'Rub Terasi on a far boulder and slip away downwind.', uses: 'terasi', outcome: 'The shrimp paste reeks. The Giant turns toward the boulder, hunting the smell, and you gain ground.' },
        ],
      },
      {
        scene: 'A root river twists through a haunted clearing. Pale lights drift between the trunks. The Giant wades behind you, and the water carries every step you take.',
        itemGauge: 'gap',
        items: { seeds: 'good', needles: 'poor', salt: 'good', terasi: 'poor' },
        keywords: [{ match: ['pray', 'chant', 'name', 'call'], effects: [{ gauge: 'gap', delta: 1 }], text: 'You speak the old words your grandmother taught you. The drifting lights part, and the Giant hesitates at the edge of the clearing.' }],
        choices: [
          { key: 'A', text: 'Drop Cucumber Seeds in the river to knot a vine raft of roots.', uses: 'seeds', outcome: 'The seeds take to the wet roots at once. A raft of green knots carries you downstream and the Giant loses the trail.' },
          { key: 'B', text: 'Cast Sewing Needles into the water.', uses: 'needles', outcome: 'The current takes the needles away in a flash. You have thrown away a good tool for nothing.' },
          { key: 'C', text: 'Scatter Salt along the clearing path.', uses: 'salt', outcome: 'The salt burns a line the drifting lights will not cross. The Giant will not step over it, and you gain ground.' },
        ],
      },
      {
        scene: 'The Mountain Sanctuary waits above the last ridge. The Giant is right behind you, and the stone door only opens for those who are not caught.',
        itemGauge: 'gap',
        items: { seeds: 'neutral', needles: 'neutral', salt: 'good', terasi: 'neutral' },
        keywords: [{ match: ['run', 'sprint', 'charge', 'dash', 'door', 'sanctuary'], effects: [{ gauge: 'gap', delta: -1 }], text: 'You sprint the last stretch in the open. The Giant gains, and the ridge is far.' }],
        choices: [
          { key: 'A', text: 'Scatter Salt across the sanctuary threshold and step inside.', uses: 'salt', effects: [{ gauge: 'gap', delta: 1 }], final: true, outcome: 'Salt seals the threshold. The Giant cannot cross it, and the sanctuary door closes behind you.' },
          { key: 'B', text: 'Climb the final rockfall and haul yourself to the door.', effects: [{ gauge: 'gap', delta: -1 }], final: true, outcome: 'You climb in the open, and the Giant takes the ground you cannot spare.' },
          { key: 'C', text: 'Stand and shout a challenge to draw the Giant away from the door.', effects: [{ gauge: 'gap', delta: -1 }], final: true, outcome: 'Your shout carries far. The Giant turns, but the sound has cost you the last of your lead.' },
        ],
      },
    ],
    win: (s) => s.gauges.gap >= 2,
    winText: 'The sanctuary door closes. The Giant strikes the salt line once, twice, and then the mountain itself seems to swallow the sound. You are safe, for now.',
    lose: (s) => (s.gauges.gap <= 0 ? 'A hand closes around your shoulder before you can take another step. The jungle goes quiet.' : null),
    loseText: 'A hand closes around your shoulder before you can take another step. The jungle goes quiet.',
    fizzle: 'You reach the ridge with nothing left to give. The Giant takes the ground you cannot spare, and the door stays shut.',
  },

  {
    id: 'awas-ada-pocong',
    title: 'Awas Ada Pocong: Escape from Kampung Sinden',
    tagline: 'Keep quiet, keep your nerve, and reach the gate before the hour.',
    tags: ['Indonesian folklore', 'Horror', 'Stealth'],
    publisher: 'QuestVerse Originals',
    version: '1.0',
    accent: 'accent',
    lore: 'A deserted village ringed by dense bamboo at midnight. The dark is total, the air is cold, and something in a burial shroud is walking the lanes.',
    background:
      'You are stranded on the edge of Kampung Sinden in a dead car: no engine, no fuel, no signal. The village gate is the only way out, and it closes at first light.',
    stateVars: [
      { label: 'Time remaining', value: '2h 00m' },
      { label: 'Sanity', value: 'CALM' },
      { label: 'Light', value: 'NONE' },
      { label: 'Light source', value: 'false' },
    ],
    stageNames: ['The dead car', 'The bamboo lane', 'The village well', 'The gate'],
    startingInventory: ['Flashlight (found in the village)'],
    achievements: [
      ACHIEVEMENT('through-the-gate', 'Through the Gate', 'Reach the gate with your nerve intact.', (s) => s.finished && s.outcome === 'win'),
      ACHIEVEMENT('steady-hands', 'Steady Hands', 'Finish with Sanity at STEADY or better.', (s) => s.finished && s.outcome === 'win' && s.gauges.sanity >= 3),
    ],
    inventoryPrefix: 'SUPPLIES',
    nudge: 'The dark swallows the move. Pick a path, or name what you do more plainly.',
    itemText: {
      good: 'You keep your footing and your nerve holds.',
      poor: 'The dark closes in a little tighter.',
      neutral: 'Nothing answers but the cold.',
    },
    gauges: [
      { key: 'time', blockLabel: 'TIME REMAINING', type: 'percent', start: 120, min: 0, max: 120, format: (v) => Math.floor(v / 60) + 'h ' + String(v % 60).padStart(2, '0') + 'm' },
      { key: 'sanity', blockLabel: 'SANITY', type: 'tier', steps: ['BROKEN', 'SHAKEN', 'CALM', 'STEADY'], start: 'CALM' },
    ],
    inventory: [],
    flags: [{ key: 'light', start: false }],
    extraBlock: (s) => ['LIGHT: ' + (s.flags.light ? 'ON' : 'NONE')],
    opening: 'A burst of radio static snaps you awake in the dead car. Outside the window, something thumps the door. The clock on the dash reads a little past midnight.',
    stages: [
      {
        scene: 'The car sits at the edge of the village. The radio hisses, then goes quiet. Something walks past the bonnet, dragging cloth across the metal.',
        itemGauge: 'sanity',
        keywords: [{ match: ['radio', 'off', 'switch'], effects: [{ gauge: 'sanity', delta: 1 }, { gauge: 'time', delta: -5 }], text: 'You kill the radio. The silence is worse, but your head clears.' }],
        choices: [
          { key: 'A', text: 'Slip out of the car and freeze in the shadows until the footsteps pass.', effects: [{ gauge: 'time', delta: -30 }, { gauge: 'sanity', delta: 1 }], outcome: 'You hold your breath as the cloth drags past your shoes, then fades. Your nerve holds.' },
          { key: 'B', text: 'Flip on the headlights to see what is out there.', effects: [{ gauge: 'time', delta: -20 }, { gauge: 'sanity', delta: -1 }], outcome: 'The beams catch a shroud standing in the road, facing you. Your hands shake as you kill the lights.' },
          { key: 'C', text: 'Stay put and lock the doors, listening.', effects: [{ gauge: 'time', delta: -45 }], outcome: 'You wait out the footsteps behind the glass. Time bleeds away, and the dark does not blink.' },
        ],
      },
      {
        scene: 'A bamboo lane runs between the houses, black between the culms. Cold air pours down it, and the path is too narrow to run.',
        itemGauge: 'sanity',
        keywords: [{ match: ['hide', 'listen', 'still', 'quiet', 'wait'], effects: [{ gauge: 'sanity', delta: 1 }, { gauge: 'time', delta: -10 }], text: 'You stand still in the dark and listen until you know which way the lane bends.' }],
        choices: [
          { key: 'A', text: 'Feel your way along the bamboo wall, slow but silent.', effects: [{ gauge: 'time', delta: -35 }, { gauge: 'sanity', delta: 1 }], outcome: 'Your fingers find each culm. You come out the far side with your nerve intact.' },
          { key: 'B', text: 'Run down the lane with your hands out in front.', effects: [{ gauge: 'time', delta: -25 }, { gauge: 'sanity', delta: -1 }], outcome: 'You crash into a low branch. The noise echoes through the whole lane.' },
          { key: 'C', text: 'Cut across the open paddy behind the houses.', effects: [{ gauge: 'time', delta: -25 }, { gauge: 'sanity', delta: -1 }], outcome: 'The open ground is quick, but the shroud on the far treeline turns its head as you cross.' },
        ],
      },
      {
        scene: 'The old village well sits at the crossroads. A rope hangs down into the black water, and a cold draught rises out of it.',
        itemGauge: 'sanity',
        keywords: [{ match: ['light', 'torch', 'lamp', 'match'], sets: 'light', uses: 'flashlight', effects: [{ gauge: 'sanity', delta: 2 }], text: 'You find a serviceable torch on the well wall and switch it on. The dark pulls back.' }],
        choices: [
          { key: 'A', text: 'Freeze at the sound of the rope creaking behind you.', effects: [{ gauge: 'time', delta: -30 }, { gauge: 'sanity', delta: -1 }], outcome: 'The rope swings on its own. You cannot move until it stops, and the dark presses in.' },
          { key: 'B', text: 'Search the well and the houses for a light you can use.', sets: 'light', effects: [{ gauge: 'time', delta: -40 }, { gauge: 'sanity', delta: 1 }], outcome: 'You find a torch hanging inside the well shelter. It sputters, then holds. The lane behind you is no longer absolutely black.' },
          { key: 'C', text: 'Back away from the well toward the lane, eyes on the rope.', effects: [{ gauge: 'time', delta: -20 }, { gauge: 'sanity', delta: -1 }], outcome: 'You keep the rope in sight the whole way, and see it move one more time.' },
        ],
      },
      {
        scene: 'The village gate stands at the end of the last lane, tall and barred. It will close at first light, and the shroud is walking the lane behind you.',
        itemGauge: 'sanity',
        keywords: [{ match: ['gate', 'through', 'run', 'sprint', 'leave', 'open'], effects: [{ gauge: 'time', delta: -15 }, { gauge: 'sanity', delta: -1 }], text: 'You make a dash for the bars. The lane behind you answers with a sound like dry cloth.' }],
        choices: [
          { key: 'A', text: 'Walk the last lane by your light, steady and quiet.', requires: 'light', effects: [{ gauge: 'time', delta: -25 }, { gauge: 'sanity', delta: 1 }], final: true, outcome: 'Your light holds the dark off the whole way. You slip the bar and step through the gate just as it closes.' },
          { key: 'B', text: 'Dash the last lane and haul the bar open.', effects: [{ gauge: 'time', delta: -20 }, { gauge: 'sanity', delta: -1 }], final: true, outcome: 'You reach the gate, but the run has cost you. You get through as the bar drops behind you, shaking.' },
          { key: 'C', text: 'Turn and face what is following you.', effects: [{ gauge: 'time', delta: -10 }, { gauge: 'sanity', delta: -2 }], final: true, outcome: 'You turn to look. That is what it wanted. Your nerve breaks before you remember the gate.' },
        ],
      },
    ],
    win: (s) => s.gauges.time > 0 && s.gauges.sanity >= 2,
    winText: 'Behind you the gate bars fall, and the lane goes quiet. The first grey line of dawn touches the bamboo. You are out of Kampung Sinden.',
    lose: (s) => {
      if (s.gauges.time <= 0) return 'The gate bars fall with a sound like a coffin lid. Dawn finds you on the wrong side.';
      if (s.gauges.sanity <= 0) return 'Your nerve breaks completely. The cold wraps around your shoulders, and the shroud does not have to hurry.';
      return null;
    },
    loseText: 'The gate bars fall with a sound like a coffin lid. Dawn finds you on the wrong side.',
    fizzle: 'You reach the gate with nothing left of your nerve. The bars fall before you can lift them.',
  },

  {
    id: 'neon-syndicate',
    title: 'Neon Syndicate: Breach at Sector 7',
    tagline: 'Steal the chip, keep your brain, beat the heat.',
    tags: ['Cyberpunk', 'Heist', 'Netrunning'],
    publisher: 'QuestVerse Originals',
    version: '1.0',
    accent: 'accent',
    lore: 'Neo-Veridia: rain-drenched, neon-lit, and ruled by megacorporations. Above the streets the hover-traffic hums; below them netrunners fight corporate AI in the dark.',
    background:
      'You are Kaelen, a rogue netrunner. After a failed data heist your cyberware is glitching and overheating, and AetherCorp knows someone is inside Sector 7.',
    stateVars: [
      { label: 'Neural integrity', value: '60%' },
      { label: 'Corporate heat', value: 'LOW' },
    ],
    stageNames: ['Safehouse', 'Service duct', 'Sub-level 7', 'The extraction run'],
    startingInventory: [],
    achievements: [
      ACHIEVEMENT('clean-extraction', 'Clean Extraction', 'Get out with the chip and keep the heat below MAX.', (s) => s.finished && s.outcome === 'win'),
      ACHIEVEMENT('icebreaker', 'Icebreaker', 'Win with a quarter of your integrity or better.', (s) => s.finished && s.outcome === 'win' && s.gauges.integrity >= 25),
    ],
    inventoryPrefix: 'GEAR',
    nudge: 'The deck waits. Pick a route, or describe your intrusion more precisely.',
    itemText: {
      good: 'The deck holds. You keep the signal clean.',
      poor: 'The deck overheats and something upstream notices.',
      neutral: 'Nothing moves on the board.',
    },
    gauges: [
      { key: 'integrity', blockLabel: 'NEURAL INTEGRITY', type: 'percent', start: 60, min: 0, max: 100 },
      { key: 'heat', blockLabel: 'CORPORATE HEAT', type: 'tier', steps: ['LOW', 'WARM', 'HOT', 'MAX'], start: 'LOW' },
    ],
    inventory: [],
    flags: [],
    opening: 'Rain taps hard against the basement window. A neural glitch warning flares across your vision, red and insistent: 60%. The console beside you has one route into Sector 7.',
    stages: [
      {
        scene: 'The safehouse smells of ozone and wet concrete. Your deck is warm in your hands and the warning is still red in the corner of your eye.',
        itemGauge: 'integrity',
        keywords: [{ match: ['cool', 'rest', 'patch', 'repair', 'stable', 'meditate'], effects: [{ gauge: 'heat', delta: 1 }], text: 'You patch the overheating core. It stabilizes, but the delay has warmed the trail.' }],
        choices: [
          { key: 'A', text: 'Jack in and ride the maintenance mesh.', effects: [{ gauge: 'integrity', delta: 12 }, { gauge: 'heat', delta: -1 }], outcome: 'You keep to the maintenance lanes. The deck cools, the warning drops to green, and no one notices you.' },
          { key: 'B', text: 'Go in hard and loud with an AI distraction.', effects: [{ gauge: 'heat', delta: 2 }], outcome: 'The distraction lands. AetherCorp notices, and starts turning its cameras toward your block.' },
          { key: 'C', text: 'Burn your amplifier for a faster deck.', effects: [{ gauge: 'integrity', delta: -12 }, { gauge: 'heat', delta: 1 }], outcome: 'You overclock the deck. Your vision tears at the edges, and the warning spikes.' },
        ],
      },
      {
        scene: 'The service duct is a low tube of hot cabling that smells of burnt dust. Corporate cameras sweep the ceiling in a slow rhythm.',
        itemGauge: 'integrity',
        keywords: [{ match: ['wait', 'time', 'sweep', 'count', 'pause'], effects: [{ gauge: 'heat', delta: -1 }], text: 'You count the sweep and move on the dead beat. The cameras keep their silence.' }],
        choices: [
          { key: 'A', text: 'Hack the camera rotation from a junction box.', effects: [{ gauge: 'integrity', delta: 8 }, { gauge: 'heat', delta: 1 }], outcome: 'You bend the rotation by two seconds. Enough to pass, and your rig is running clean.' },
          { key: 'B', text: 'Crawl the whole duct on your elbows.', effects: [{ gauge: 'integrity', delta: -6 }], outcome: 'Slow and quiet, but the heat press is brutal on your overheating deck.' },
          { key: 'C', text: 'Write a loop into the camera feed.', effects: [{ gauge: 'heat', delta: 2 }], outcome: 'The feed loops perfectly, until a human analyst notices the same pigeon twice.' },
        ],
      },
      {
        scene: 'Sub-level 7 is a black vault full of humming server racks. The decryptor chip sits in a cradle behind a corporate ICE lattice that is wider than you expected.',
        itemGauge: 'integrity',
        keywords: [{ match: ['scan', 'map', 'study', 'look'], effects: [{ gauge: 'heat', delta: 1 }], text: 'You map the ICE lattice. It is beautiful, and it is watching back.' }],
        choices: [
          { key: 'A', text: 'Slice a narrow hole in the ICE and thread the deck through.', effects: [{ gauge: 'integrity', delta: 10 }, { gauge: 'heat', delta: 1 }], outcome: 'A single clean cut. The lattice does not even shiver, and you are through.' },
          { key: 'B', text: 'Blast a wide opening and take the chip immediately.', effects: [{ gauge: 'integrity', delta: -14 }, { gauge: 'heat', delta: 2 }], outcome: 'The opening holds long enough. Your neural overlay floods with static, and alarms bloom across the board.' },
          { key: 'C', text: 'Spoof an executive badge to walk the cradle open.', effects: [{ gauge: 'integrity', delta: 8 }, { gauge: 'heat', delta: 1 }], outcome: 'The cradle reads the spoof and opens. Somewhere in the tower, a log records an executive who never arrived.' },
        ],
      },
      {
        scene: 'Alarms paint the sub-level red. The chip is in your hand and the only way out is the sub-level 6 window, if you get there before the ICE locks the whole sector.',
        itemGauge: 'integrity',
        keywords: [{ match: ['flee', 'run', 'exit', 'jump', 'window', 'extract', 'out'], effects: [{ gauge: 'heat', delta: 1 }], text: 'You run for the window in the open. The sector keeps talking about you.' }],
        choices: [
          { key: 'A', text: 'Jump out the sub-level 6 window into the rain.', effects: [{ gauge: 'integrity', delta: -12 }], final: true, outcome: 'The rain takes you. You roll off a delivery drone and vanish into the wet neon before the drones arrive.' },
          { key: 'B', text: 'Ride the maintenance drone into the transit tunnels.', final: true, outcome: 'The drone carries you under the tower and out along the mag-rail trench, unseen.' },
          { key: 'C', text: 'Turn and confront the pursuing ICE program end to end.', effects: [{ gauge: 'heat', delta: 2 }], final: true, outcome: 'You fight the ICE in the open. Even if you win the exchange, the whole sector watched you do it.' },
        ],
      },
    ],
    win: (s) => s.gauges.integrity > 0 && s.gauges.heat <= 2,
    winText: 'The chip clicks into the cradle on your deck and your link snaps back to green. The rain washes the tower lights into long streaks. You are out, and the board is quiet behind you.',
    lose: (s) => {
      if (s.gauges.integrity <= 0) return 'Neural integrity hits zero. Your overlay whites out and does not come back. Flatlined.';
      if (s.gauges.heat >= 3) return 'Corporate heat maxes out. The sector locks from the top down, and the drones find you in the duct. Captured.';
      return null;
    },
    loseText: 'Neural integrity hits zero. Your overlay whites out and does not come back. Flatlined.',
    fizzle: 'The window closes before you reach it. The ICE finishes its lock, and the chip is the only thing that leaves the sector.',
  },

  {
    id: 'starship-salvage',
    title: 'Starship Salvage',
    tagline: 'Strip the wreck, watch your air, and get back to the airlock.',
    tags: ['Sci-fi', 'Salvage', 'Survival'],
    publisher: 'QuestVerse Originals',
    version: '1.0',
    accent: 'accent',
    lore: 'A dead colony ship drifts at the edge of a broken moon. Its corridors are dark and cold, and its cargo is worth more than the ship that killed it.',
    background:
      'You are a contract salvager on a single tank of air. The wreck of the Kestrel Maru holds three salvage caches, and your airlock is your only way home.',
    stateVars: [
      { label: 'Hull integrity', value: '100%' },
      { label: 'Oxygen', value: '100%' },
      { label: 'Salvage', value: '0 of 3' },
    ],
    stageNames: ['Docking collar', 'Cargo spine', 'Reactor deck', 'Return to the airlock'],
    startingInventory: ['Cutting torch'],
    achievements: [
      ACHIEVEMENT('skin-of-your-teeth', 'Skin of Your Teeth', 'Return with all three caches.', (s) => s.finished && s.outcome === 'win'),
      ACHIEVEMENT('full-tank', 'Full Tank', 'Win with half your oxygen or better.', (s) => s.finished && s.outcome === 'win' && s.gauges.oxygen >= 50),
    ],
    inventoryPrefix: 'GEAR',
    nudge: 'The corridor is silent. Pick a route, or name the cache you want.',
    itemText: {
      good: 'You recover the cache intact.',
      poor: 'The cut goes wrong and the hull plates complain.',
      neutral: 'Nothing moves but your own air.',
    },
    gauges: [
      { key: 'hull', blockLabel: 'HULL INTEGRITY', type: 'percent', start: 100, min: 0, max: 100 },
      { key: 'oxygen', blockLabel: 'OXYGEN', type: 'percent', start: 100, min: 0, max: 100 },
      { key: 'salvage', blockLabel: 'SALVAGE', type: 'count', start: 0, max: 3 },
    ],
    inventory: [],
    flags: [],
    opening: 'The docking collar seals with a thud you feel through your boots. Ahead, the Kestrel Maru runs dark for a hundred metres. Your tank reads 100%.',
    stages: [
      {
        scene: 'The collar opens into a cargo spine full of frosted crates. One cache sits in the mouth of the corridor, easy to reach, and the deck beyond is very dark.',
        itemGauge: 'hull',
        keywords: [{ match: ['light', 'torch', 'lamp'], effects: [{ gauge: 'oxygen', delta: -5 }], text: 'You light the corridor ahead. The layout makes sense now, and you can move with purpose.' }],
        choices: [
          { key: 'A', text: 'Take the near cache quickly and move on.', effects: [{ gauge: 'salvage', delta: 1 }, { gauge: 'oxygen', delta: -10 }], outcome: 'The cache slides free with a hiss of frost. You clip it to your harness and push deeper.' },
          { key: 'B', text: 'Search the frosted crates for something better first.', effects: [{ gauge: 'salvage', delta: 1 }, { gauge: 'oxygen', delta: -20 }, { gauge: 'hull', delta: -5 }], outcome: 'You find a second, heavier cache under the crates and wrestle it loose. It costs you air and a bone-rattling bump.' },
          { key: 'C', text: 'Seal the collar hatch and vent the corridor.', effects: [{ gauge: 'oxygen', delta: -2 }], outcome: 'You seal the hatch and lose a little air doing it, but the corridor is stable behind you.' },
        ],
      },
      {
        scene: 'The cargo spine runs the length of the ship, lined with frozen lockers. A second cache glints behind a buckled bulkhead, and the floor is thin here.',
        itemGauge: 'hull',
        keywords: [{ match: ['brace', 'careful', 'slow', 'test', 'probe'], effects: [{ gauge: 'hull', delta: 5 }, { gauge: 'oxygen', delta: -5 }], text: 'You brace the bulkhead before you work. The floor takes your weight.' }],
        choices: [
          { key: 'A', text: 'Cut the bulkhead with a careful plume.', effects: [{ gauge: 'salvage', delta: 1 }, { gauge: 'oxygen', delta: -10 }, { gauge: 'hull', delta: 5 }], outcome: 'A clean cut. The cache comes out and the spine holds.' },
          { key: 'B', text: 'Rip the bulkhead with brute force.', effects: [{ gauge: 'salvage', delta: 1 }, { gauge: 'oxygen', delta: -5 }, { gauge: 'hull', delta: -15 }], outcome: 'The bulkhead tears away and takes a length of floor with it. You scramble back as the hull complains.' },
          { key: 'C', text: 'Brace the floor and edge past the buckled plate.', effects: [{ gauge: 'oxygen', delta: -15 }, { gauge: 'hull', delta: 10 }], outcome: 'You cross safely, though the detour costs you air.' },
        ],
      },
      {
        scene: 'The reactor deck is hot and shadowed. One last cache sits inside a shielded alcove, and the shielding does not want to open.',
        itemGauge: 'hull',
        keywords: [{ match: ['shield', 'panel', 'routine', 'sequence', 'open'], effects: [{ gauge: 'salvage', delta: 1 }, { gauge: 'oxygen', delta: -10 }, { gauge: 'hull', delta: -5 }], text: 'You crack the shield routine. The alcove opens, and you take the cache as the deck heats around you.' }],
        choices: [
          { key: 'A', text: 'Crack the shielding with the torch and take the cache.', effects: [{ gauge: 'salvage', delta: 1 }, { gauge: 'oxygen', delta: -5 }, { gauge: 'hull', delta: -10 }], outcome: 'The cache is yours. The alcove scorches the plating behind you as you pull free.' },
          { key: 'B', text: 'Leave it and turn back for the airlock while you still have air.', outcome: 'You leave the last cache in its cradle. The salvage manifest will be short, but your tank is not.' },
        ],
      },
      {
        scene: 'The docking collar is in sight. Behind you the reactor deck begins to vent, and ahead the airlock cycles slowly.',
        itemGauge: 'oxygen',
        keywords: [{ match: ['airlock', 'seal', 'cycle', 'through'], effects: [{ gauge: 'oxygen', delta: -5 }], text: 'You cycle the lock by hand and step through as the collar groans.' }],
        choices: [
          { key: 'A', text: 'Seal the collar and cycle the airlock.', final: true, outcome: 'The lock closes behind you. Your tank needle stops falling, and the wreck drifts on without you.' },
          { key: 'B', text: 'Cut the collar free and let the wreck go.', effects: [{ gauge: 'hull', delta: -15 }], final: true, outcome: 'The collar shears away and knocks you against the bulkhead. You are clear of the wreck, and battered.' },
          { key: 'C', text: 'Run the last stretch on the flaring deck.', effects: [{ gauge: 'oxygen', delta: -10 }], final: true, outcome: 'You sprint through the flare and reach the lock with your tank screaming.' },
        ],
      },
    ],
    win: (s) => s.gauges.salvage >= 3 && s.gauges.hull > 0 && s.gauges.oxygen > 0,
    winText: 'The airlock closes and the collar releases. Three caches settle against the deck plates. The Kestrel Maru turns slowly away, still full of the things you did not carry.',
    lose: (s) => {
      if (s.gauges.hull <= 0) return 'A seam opens along the spine and the section decompresses around you. The wreck keeps your air, and you.';
      if (s.gauges.oxygen <= 0) return 'Your tank needle touches zero. The corridor slides sideways and the dark comes in quietly.';
      return null;
    },
    loseText: 'A seam opens along the spine and the section decompresses around you. The wreck keeps your air, and you.',
    fizzle: 'You reach the airlock with an empty manifest. The contract pays nothing, and the wreck drifts on with the caches still aboard.',
  },

  {
    id: 'xylos',
    title: 'Uncover the Ancient Tale of Xylos',
    tagline: 'Read the wreck like a book, and keep hold of what you are.',
    tags: ['Sci-fi', 'Exploration', 'Lore'],
    publisher: 'QuestVerse Originals',
    version: '1.0',
    accent: 'accent',
    lore: 'Xylos is an old planet with a stranger geology, and older things buried in it. Every component you recover opens another page of its story.',
    background:
      'You are the archivist of the Xylos survey, not its prospector. Salvage is the means. The tale of the last colony is the end.',
    stateVars: [
      { label: 'Archival integrity', value: '70%' },
      { label: 'Clarity', value: 'STABLE' },
      { label: 'Data paths', value: '0 of 3' },
    ],
    stageNames: ['Recovery log entry 1', 'The repurposed wire', 'The heat exchanger panel', 'The final recovery log'],
    startingInventory: ['Data tablet'],
    achievements: [
      ACHIEVEMENT('the-whole-tale', 'The Whole Tale', 'Recover all three data paths and keep hold of yourself.', (s) => s.finished && s.outcome === 'win'),
      ACHIEVEMENT('clear-eyed', 'Clear-Eyed', 'Win with Clarity at STABLE or better.', (s) => s.finished && s.outcome === 'win' && s.gauges.clarity >= 2),
    ],
    inventoryPrefix: 'SUPPLIES',
    nudge: 'The tablet waits. Choose a data path, or describe what you scan.',
    itemText: {
      good: 'The archive holds. Another fragment of the tale settles into place.',
      poor: 'The pattern slips through your fingers and the record frays.',
      neutral: 'The silence here is ancient. It gives nothing back.',
    },
    gauges: [
      { key: 'integrity', blockLabel: 'ARCHIVAL INTEGRITY', type: 'percent', start: 70, min: 0, max: 100 },
      { key: 'clarity', blockLabel: 'CLARITY', type: 'tier', steps: ['LOST', 'CLOUDED', 'STABLE', 'SHARP'], start: 'STABLE' },
      { key: 'paths', blockLabel: 'DATA PATHS', type: 'count', start: 0, max: 3 },
    ],
    inventory: [],
    flags: [],
    opening: 'The silence here is ancient. It speaks louder than the wreckage. Your tablet wakes to a recovery log, and three data paths glow along the stone.',
    stages: [
      {
        scene: 'The wreck lies open across a shelf of pale rock. Three threads of signal run out of it: a broken data link, a repurposed wire, and a heat exchanger panel.',
        itemGauge: 'integrity',
        keywords: [{ match: ['scan', 'survey', 'anomaly', 'new', 'map'], effects: [{ gauge: 'clarity', delta: 1 }, { gauge: 'integrity', delta: -5 }], text: 'You sweep for new anomalies. The map gains a shape, and the tablet works hard for it.' }],
        choices: [
          { key: 'A', text: 'Recover data path A, the broken data link (unlocks colony logs).', effects: [{ gauge: 'paths', delta: 1 }, { gauge: 'integrity', delta: -10 }], outcome: 'The link gives up a colony log: a settlement counting its first winter in a place that never had one.' },
          { key: 'B', text: 'Standard salvage of the repurposed wire.', effects: [{ gauge: 'paths', delta: 1 }, { gauge: 'integrity', delta: -5 }], outcome: 'The wire carries a piece of a crew transmission, half eaten by the rock. Someone was counting down.' },
          { key: 'C', text: 'Search for new anomalies along the shelf.', effects: [{ gauge: 'clarity', delta: 1 }, { gauge: 'integrity', delta: -5 }], outcome: 'You find a fresh seam in the stone, and add it to the map. Clarity improves with a clear line of investigation.' },
        ],
      },
      {
        scene: 'The wire runs into a hollow of pale stone. Reading it means following the signal down, and the deeper you go the harder it is to hold the shape of the story.',
        itemGauge: 'integrity',
        keywords: [{ match: ['steady', 'breathe', 'anchor', 'stabilize', 'focus'], effects: [{ gauge: 'clarity', delta: 1 }, { gauge: 'integrity', delta: -5 }], text: 'You steady the tablet against the stone and slow your breathing until the signal resolves.' }],
        choices: [
          { key: 'A', text: 'Drop a deep probe down the wire for the clearest record.', effects: [{ gauge: 'paths', delta: 1 }, { gauge: 'integrity', delta: -15 }, { gauge: 'clarity', delta: -1 }], outcome: 'The record is beautiful and complete: the colony arguing about whether to leave. Holding it costs you, and your focus splinters.' },
          { key: 'B', text: 'Take the surface reading and move on.', effects: [{ gauge: 'paths', delta: 1 }, { gauge: 'integrity', delta: -5 }, { gauge: 'clarity', delta: 1 }], outcome: 'You take the first layer: a date, a name, a direction. Your head stays clear.' },
          { key: 'C', text: 'Anchor the tablet and wait for the signal to settle.', effects: [{ gauge: 'clarity', delta: 1 }, { gauge: 'integrity', delta: -10 }], outcome: 'You wait it out. The wire quiets down into something readable, though the wait costs you.' },
        ],
      },
      {
        scene: 'The heat exchanger panel sits at the bottom of the excavation, warm to the touch. Its geological notes are dense, and the deep scan to read them hurts.',
        itemGauge: 'integrity',
        keywords: [{ match: ['note', 'record', 'write', 'log', 'archive'], effects: [{ gauge: 'clarity', delta: 1 }], text: 'You write down what you have before you forget the shape of it. The record settles.' }],
        choices: [
          { key: 'A', text: 'Run a full-spectrum scan of the panel.', effects: [{ gauge: 'paths', delta: 1 }, { gauge: 'integrity', delta: -15 }], outcome: 'The panel yields three pages of geological notes. The planet is younger than it should be, and the colony knew.' },
          { key: 'B', text: 'Read the panel with the tablet held still.', effects: [{ gauge: 'paths', delta: 1 }, { gauge: 'integrity', delta: -5 }, { gauge: 'clarity', delta: -1 }], outcome: 'You read it line by line. The notes come through, though the words begin to slide.' },
          { key: 'C', text: 'Record the panel and stabilize your own readings.', effects: [{ gauge: 'clarity', delta: 2 }, { gauge: 'integrity', delta: -10 }], outcome: 'You log the panel and take the time to steady yourself. The archive is not built in a hurry.' },
        ],
      },
      {
        scene: 'The final recovery log waits on the tablet. Reading it will finish the tale of Xylos, and it is the last thing between you and the answer.',
        itemGauge: 'integrity',
        keywords: [{ match: ['read', 'open', 'final', 'log', 'finish'], effects: [{ gauge: 'integrity', delta: -10 }], text: 'You open the log. The planet has been talking the whole time, and now you can hear it.' }],
        choices: [
          { key: 'A', text: 'Read the final log and stitch the tale together.', effects: [{ gauge: 'integrity', delta: -10 }], final: true, outcome: 'The logs line up. The colony did not die here. It left, and it left a reader in mind.' },
          { key: 'B', text: 'Stabilize your archive and read the log calmly.', effects: [{ gauge: 'clarity', delta: 1 }, { gauge: 'integrity', delta: -5 }], final: true, outcome: 'You steady yourself first, and the tale comes together cleanly, from the first winter to the last transmission.' },
          { key: 'C', text: 'Dive the full archive in one pass.', effects: [{ gauge: 'integrity', delta: -25 }, { gauge: 'clarity', delta: -1 }], final: true, outcome: 'You take every fragment at once. The tale is complete, and it is almost more than you can carry.' },
        ],
      },
    ],
    win: (s) => s.gauges.integrity > 0 && s.gauges.clarity >= 1 && s.gauges.paths >= 3,
    winText: 'The tale of Xylos closes on the tablet: a colony that read the planet and chose to leave, and one archivist who finally finished the account. The silence here is ancient. It is also, at last, complete.',
    lose: (s) => {
      if (s.gauges.integrity <= 0) return 'The archive corrupts around you. The fragments scatter back into the stone, and the tale is lost with the reader.';
      if (s.gauges.clarity <= 0) return 'Your clarity fails completely. The logs run together into a single voice, and you cannot tell any more whose it is.';
      return null;
    },
    loseText: 'The archive corrupts around you. The fragments scatter back into the stone, and the tale is lost with the reader.',
    fizzle: 'You close the tablet with the tale unfinished. Somewhere on Xylos there is still a page waiting, and no one left to read it.',
  },
];

export function findTitle(id) {
  return CATALOG.find((t) => t.id === id) || null;
}

// A fixed mid-run state for the ?demo=1 runner route, in memory only.
// Never written to the saved slot.
export function demoState(title) {
  const state = {
    v: 1,
    titleId: title.id,
    stageIndex: Math.min(2, title.stages.length - 1),
    gauges: {},
    inventory: {},
    flags: {},
    finished: false,
    outcome: null,
    transcript: [
      { kind: 'scene', text: title.opening },
      { kind: 'scene', text: title.stages[0].scene },
      { kind: 'outcome', text: 'Demo state: a mid-run snapshot from the archive.' },
      { kind: 'scene', text: title.stages[Math.min(2, title.stages.length - 1)].scene },
    ],
    updatedAt: Date.now(),
  };
  for (const g of title.gauges || []) {
    state.gauges[g.key] = g.type === 'tier' ? g.steps.indexOf(g.start) : g.start;
  }
  for (const it of title.inventory || []) state.inventory[it.key] = it.start;
  for (const f of title.flags || []) state.flags[f.key] = f.start;
  // Move one gauge one step so the demo does not look untouched.
  const first = (title.gauges || [])[0];
  if (first) {
    if (first.type === 'tier') state.gauges[first.key] = Math.max(1, state.gauges[first.key] - 1);
    else state.gauges[first.key] = Math.max(1, state.gauges[first.key] - 10);
  }
  return state;
}
