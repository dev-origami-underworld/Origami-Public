const COMMAND_DICTIONARY = {
  movement: [
    "go",
    "move",
    "walk",
    "north",
    "south",
    "east",
    "west",
    "up",
    "down",
  ],
  interaction: ["take", "examine", "look", "use", "open", "search"],
  shop: ["buy", "purchase"],
  combat: ["attack", "fight", "hit", "cast", "spell"],
  inventory: ["i", "inventory", "items"],
};

const CARDINAL_OFFSETS = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

const CARDINAL_LABELS = {
  north: "Head north",
  south: "Head south",
  east: "Head east",
  west: "Head west",
};

const ROOM_NARRATIVES = [
  "The air is still and smells of old paper.",
  "Shadows dance on the walls, whispering secrets.",
  "A faint breeze rustles the origami lanterns.",
  "Dust motes float in shafts of light.",
  "The floor creaks softly under your weight.",
  "You hear the distant sound of folding paper.",
  "An eerie silence hangs heavy in the air.",
  "The walls seem to be watching you.",
  "A cold draft chills you to the bone.",
  "The geometry of this room feels... wrong.",
];

const ROOM_LIBRARY = [
  {
    id: "lantern-warden",
    title: "Lantern Warden's Crossing",
    act: "Act I · Embers",
    stage: 1,
    description:
      "Lantern-lit planks float above an ink-black canal while a silent warden hovers nearby.",
    hint: "Gentle sounds keep the warden calm.",
    searchLabel: "Study the lantern glow",
    allowSearch: true,
    interactives: [
      {
        keyword: "lantern",
        name: "Lantern Warden",
        details:
          "The lantern's glyphs fold inward as you whisper a respectful greeting.",
        eventType: "find_puzzle_item",
        narration: "A watchful lantern floats to your side, expecting tribute.",
        guideLabel: "Calm the lantern warden",
      },
      {
        keyword: "chimes",
        name: "Canal Chimes",
        details:
          "You steady the chimes; a hollow tone reveals a hidden compartment in the railing.",
        eventType: "find_item",
        narration:
          "Mist-soaked chimes sway at the archway, begging to be silenced.",
      },
    ],
  },
  {
    id: "petal-scriptorium",
    title: "Petal Scriptorium",
    act: "Act I · Embers",
    stage: 2,
    description:
      "Stacks of petal-thin scrolls form aisles that rustle as if whispering notes to you.",
    hint: "One scroll holds a riddle. The quill knows the answer.",
    searchLabel: "Catalog the petals",
    allowSearch: true,
    interactives: [
      {
        keyword: "scroll",
        name: "Petal Scroll",
        details:
          "The scroll unfurls midair, presenting a looping script that asks for interpretation.",
        eventType: "riddle",
        narration:
          "A lone scroll hovers over an altar waiting for an attentive reader.",
      },
      {
        keyword: "quill",
        name: "Iridescent Quill",
        details:
          "Ink beads along the quill tip, eager to record whatever secret you offer it.",
        eventType: "find_item",
        narration:
          "An iridescent quill floats beside the scroll, dripping golden ink.",
      },
    ],
  },
  {
    id: "whisper-forge",
    title: "Whisper Forge",
    act: "Act II · Sparks",
    stage: 3,
    description:
      "An anvil of translucent paper smolders at the center of the room, exhaling ember motes.",
    hint: "Temper the forge, but beware the bellows' bite.",
    searchLabel: "Inspect the forge",
    allowSearch: true,
    interactives: [
      {
        keyword: "anvil",
        name: "Origami Anvil",
        details:
          "Folding the anvil's corners reveals etched patterns that shift under your touch.",
        eventType: "find_item",
        narration:
          "The anvil hums with contained heat, folding on itself like a breathing creature.",
      },
      {
        keyword: "bellows",
        name: "Crimson Bellows",
        details:
          "You squeeze the bellows and a jet of sparks races toward you!",
        eventType: "damage",
        narration: "Frayed bellows wheeze behind the anvil, coated in soot.",
      },
    ],
  },
  {
    id: "moonwell-conservatory",
    title: "Moonwell Conservatory",
    act: "Act II · Currents",
    stage: 4,
    description:
      "Moonlight pours through a lattice ceiling, feeding a fountain that flows upward.",
    hint: "Moonwater heals, lilies remember.",
    searchLabel: "Trace the moonwell",
    allowSearch: true,
    interactives: [
      {
        keyword: "fountain",
        name: "Moonlit Fountain",
        details:
          "The water reverses gravity; cupping it against your chest calms aching wounds.",
        eventType: "heal",
        narration:
          "A fountain spills light instead of water, casting soft halos.",
      },
      {
        keyword: "lily",
        name: "Sky Lily",
        details:
          "Folding the lily's petals reveals a wafer-thin shard of the Serpent Seal.",
        eventType: "find_puzzle_item",
        narration:
          "Sky lilies drift on the moonwell, each petal trimmed with runes.",
      },
    ],
  },
  {
    id: "obsidian-nursery",
    title: "Obsidian Nursery",
    act: "Act II · Currents",
    stage: 5,
    description:
      "Low cradles line the walls, each holding half-folded beasts that twitch as you enter.",
    hint: "Rock the cradle gently or the masks awaken hostile spirits.",
    allowSearch: false,
    interactives: [
      {
        keyword: "cradle",
        name: "Paper Cradle",
        details:
          "You rock the cradle; a small charm jingles loose from its ribbons.",
        eventType: "find_item",
        narration:
          "One cradle glows with a hopeful shimmer, inviting you closer.",
      },
      {
        keyword: "mask",
        name: "Caretaker Mask",
        details:
          "As you lift the mask, the nursery's guardians manifest from discarded scraps!",
        eventType: "spawn_monster",
        narration:
          "Caretaker masks hang above each cradle, their expressions unreadable.",
      },
    ],
  },
  {
    id: "ember-archive",
    title: "Ember Archive Vault",
    act: "Act III · Convergence",
    stage: 6,
    description:
      "Shelves of sealed ledgers are bound by waxen cords that pulse with stored memory.",
    hint: "Break only the seal that bears the serpent sigil.",
    searchLabel: "Audit the ledgers",
    allowSearch: true,
    interactives: [
      {
        keyword: "ledger",
        name: "Binder of Debts",
        details:
          "Numbers flare along the ledger. It demands a pledge before opening.",
        eventType: "sub_quest",
        narration: "A massive ledger thumps on the table as you approach.",
      },
      {
        keyword: "seal",
        name: "Waxen Seal",
        details:
          "You pry the seal loose and uncover a jagged fragment of the Serpent Seal.",
        eventType: "find_puzzle_item",
        narration: "One wax seal bears the serpent sigil, still warm.",
      },
    ],
  },
  {
    id: "thunder-drum",
    title: "Thunder Drum Causeway",
    act: "Act III · Convergence",
    stage: 7,
    description:
      "A suspended bridge of drums booms with every step, threatening to alert lurking foes.",
    hint: "Mute the drum before tracing the warding sigil.",
    allowSearch: false,
    interactives: [
      {
        keyword: "drum",
        name: "Storm Drum",
        details:
          "You press your palm into the drumhead; a shock ripples up your arm.",
        eventType: "damage",
        narration:
          "A single colossal drum blocks the path, vibrating with static.",
      },
      {
        keyword: "sigil",
        name: "Warding Sigil",
        details:
          "Tracing the sigil summons a vengeful shikigami from the bridge cables!",
        eventType: "spawn_monster",
        narration: "A crackling sigil hangs midair, waiting to be completed.",
      },
    ],
  },
  {
    id: "starlit-deck",
    title: "Starlit Navigator's Deck",
    act: "Finale · Ascent",
    stage: 8,
    description:
      "Charts float overhead, aligning with constellations punched through the ceiling.",
    hint: "Align the charts to reveal the final fragment.",
    searchLabel: "Align the charts",
    allowSearch: true,
    interactives: [
      {
        keyword: "astrolabe",
        name: "Golden Astrolabe",
        details:
          "You spin the astrolabe; starlight bends into a map of the lair ahead.",
        eventType: "find_puzzle_item",
        narration:
          "A golden astrolabe floats within arm's reach, ticking softly.",
      },
      {
        keyword: "chart",
        name: "Star Chart",
        details:
          "The star chart quizzes you with a final riddle before revealing a secret path.",
        eventType: "riddle",
        narration:
          "Ink-black charts drift like kites, strings tied to nothing at all.",
      },
    ],
  },
];

const MAX_LOG_ENTRIES = 8;
const STORY_BEATS = ROOM_LIBRARY;

const STORY_EVENTS = {
  heal: [
    {
      type: "heal",
      amount: 10,
      message: "A soothing energy washes over you.",
    },
  ],
  damage: [
    {
      type: "damage",
      amount: 5,
      message: "A sharp sting! You take damage.",
    },
  ],
  find_item: [
    {
      type: "find_item",
      itemType: "gold",
      amount: 10,
      message: "You found 10 gold coins!",
    },
    {
      type: "find_item",
      itemType: "key",
      itemName: "Crimson Key",
      message: "You found a Crimson Key!",
    },
  ],
  find_puzzle_item: [
    {
      type: "find_puzzle_item",
      message: "You discovered a Serpent Seal Fragment!",
    },
  ],
  spawn_monster: [
    {
      type: "spawn_monster",
      monsterName: "Paper Shikigami",
      monsterHp: 30,
      monsterAttack: 3,
      message: "A Paper Shikigami flutters out to attack!",
    },
    {
      type: "spawn_monster",
      monsterName: "Vampire Origami Bat",
      monsterHp: 1,
      monsterAttack: 1,
      evasion: 0.75,
      message: "A Vampire Origami Bat darts out from the shadows!",
    },
  ],
  sub_quest: [
    {
      type: "sub_quest",
      questId: "findKey",
      message:
        "A faint inscription reads: 'The one who holds the Crimson Key may pass.'",
    },
  ],
  riddle: [
    {
      type: "riddle",
      message:
        "A voice echoes: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?'",
      answers: [
        {
          text: "A Map",
          correct: true,
          reward: {
            type: "find_puzzle_item",
            message:
              "Correct! A secret compartment opens, revealing a Serpent Seal Fragment!",
          },
        },
        { text: "A Dream", correct: false },
        { text: "A Book", correct: false },
      ],
    },
  ],
};

function pickRandom(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export const ENTRANCE_HALLWAY = {
  title: "Entrance Hallway",
  act: "Act I · Embers",
  stage: 0,
  description:
    "A long, narrow hallway stretches before you. The paper walls are seamless and smooth. The only way is forward.",
  hint: "You are just starting your journey.",
  searchLabel: "Search the hallway",
  allowSearch: true,
  roomId: 1,
  callout:
    "A bioluminescent glowworm sits inside a paper lantern, bright enough to act as a flashlight.",
  interactives: [
    {
      keyword: "lantern",
      name: "Lantern",
      details:
        "A paper lantern lies on the floor. Inside, a glowworm pulses with a bright bioluminescent glow.",
      guideLabel: "TAKE LANTERN",
      featured: true,
      event: {
        type: "find_item",
        itemName: "Lantern",
        message:
          "You lift the lantern. The glowworm brightens and throws a steady beam down the hallway.",
      },
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRoomTemplate(roomId) {
  if (roomId === ENTRANCE_HALLWAY.roomId) return clone(ENTRANCE_HALLWAY);
  const direct = ROOM_LIBRARY.find(
    (beat) => typeof beat.roomId === "number" && beat.roomId === roomId
  );
  if (direct) return clone(direct);
  if (!ROOM_LIBRARY.length) return null;
  const index = Math.max(0, (roomId - 2) % ROOM_LIBRARY.length);
  return clone(ROOM_LIBRARY[index]);
}

function createStoryDeck(beats = STORY_BEATS) {
  let queue = [...beats];
  let lastDrawn = null;

  function shuffle() {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }

  shuffle();

  return {
    draw() {
      if (queue.length === 0) {
        queue = [...beats];
        shuffle();
      }

      // If the next card is the same as the last one, and there are other cards to choose from, move it.
      if (lastDrawn && queue[0].title === lastDrawn.title && queue.length > 1) {
        // Move the duplicate card from the start to a random position later in the queue
        const duplicate = queue.shift();
        const newIndex = 1 + Math.floor(Math.random() * (queue.length - 1));
        queue.splice(newIndex, 0, duplicate);
      }

      const drawn = queue.shift();
      lastDrawn = drawn;
      return JSON.parse(JSON.stringify(drawn));
    },
  };
}

export {
  COMMAND_DICTIONARY,
  CARDINAL_OFFSETS,
  CARDINAL_LABELS,
  ROOM_NARRATIVES,
  STORY_BEATS,
  ROOM_LIBRARY,
  STORY_EVENTS,
  MAX_LOG_ENTRIES,
  pickRandom,
  createStoryDeck,
  getRoomTemplate,
};
