/**
 * Adventure Director - Unified Dungeon Generation System
 * Creates room-based dungeon layouts for all Origami game views
 */

const ENTRANCE_TITLE = "Mysterious Entrance";
const ENTRANCE_DESCRIPTION =
  "The darkness permeates the entrance as you climb down the stairs. A long hallway stretches out into the darkness before you. It is the path to your destiny. The hallway is lit by a bright lantern on the floor.<br><br><span class='text-bloom font-bold'>You see a Magical Glow Worm Lantern!</span>";

const randomUtil = {
  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },
  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },
};

const events = {
  heal: (amount, message) => ({ type: "heal", amount, message }),
  damage: (amount, message) => ({ type: "damage", amount, message }),
  gold: (amount, message) => ({
    type: "find_item",
    itemType: "gold",
    amount,
    message,
  }),
  loot: (name, message, icon = "🎁") => ({
    type: "find_item",
    itemType: "loot",
    itemName: name,
    message,
    icon,
  }),
  fragment: (message) => ({
    type: "find_puzzle_item",
    message: message || "You recover a shimmering Serpent Seal Fragment!",
  }),
};

const roomBlueprints = [
  {
    id: "warden-hall",
    title: "Lantern Warden Antechamber",
    description:
      "Paper banners hang in tight rows. A stern warden blocks the passage north, spear planted firmly.",
    features: [],
    monsters: [
      {
        id: "lantern-warden",
        name: "Lantern Warden",
        hp: 24,
        maxHp: 24,
        attack: 5,
        evasion: 0.05,
        mustTalk: true,
        intro: "A towering origami warden stands guard.",
        talkText: '"State your vow to pass," the warden intones deeply.',
        talkEvent: events.gold(12, "He accepts your vow. +12 Gold."),
      },
    ],
    quest: {
      id: "warden-oath",
      title: "State Your Vow",
      description: "Speak with the Lantern Warden to proceed.",
      actionLabel: "Talk to the Lantern Warden",
      event: events.fragment("The warden steps aside, gifting a fragment."),
    },
  },
  {
    id: "crane-garden",
    title: "Inkleaf Conservatory",
    description:
      "Paper cranes circle above an indoor grove. The trees are folded from green parchment.",
    features: [
      {
        keyword: "fountain",
        label: "Ink Fountain",
        actionLabel: "Drink from the fountain",
        details:
          "The black ink smells of pine. You drink and feel muscles relax.",
        event: events.heal(18, "You feel refreshed."),
      },
    ],
    monsters: [],
  },
  {
    id: "tide-shrine",
    title: "Ryujin Tide Shrine",
    description:
      "Foam-white paper waves curl around a shrine. Shell chimes sing of a lost princess.",
    features: [],
    monsters: [
      {
        id: "tide-kappa",
        name: "Tide Kappa",
        hp: 22,
        maxHp: 22,
        attack: 5,
        evasion: 0.12,
        mustTalk: true,
        intro: "A kappa in lacquered armor watches.",
        canGamble: true,
        talkText: '"Honor Ryujin with light," says the kappa.',
        talkEvent: events.fragment(
          "The kappa bows and slides a fragment to you."
        ),
      },
    ],
  },
  {
    id: "bamboo-courier",
    title: "Moonlit Bamboo Walk",
    description:
      "Tall bamboo of folded jade arcs overhead. A fox's lantern sways in the breeze.",
    features: [
      {
        keyword: "letter",
        label: "Bamboo Letter",
        actionLabel: "Take the bamboo letter",
        details: "You take the tube. It rattles with a letter inside.",
        event: events.loot("Bamboo Letter", "Addressed to a princess.", "🎋"),
      },
    ],
    monsters: [],
  },
  {
    id: "ridge-of-scales",
    title: "Ridge of Scales",
    description:
      "Paper ridges jut like dragon spines. Glyphs glow between the peaks, warning trespassers.",
    features: [],
    monsters: [
      {
        id: "shellback-oni",
        name: "Shellback Oni",
        hp: 30,
        maxHp: 30,
        attack: 7,
        evasion: 0.08,
        mustTalk: true,
        intro: "An oni with a shell shield stamps the ground.",
        talkText: '"Show respect or break on my shell," he rumbles.',
        talkEvent: events.gold(18, "He respects your bow. +18 Gold."),
      },
    ],
  },
  {
    id: "riddle-stack",
    title: "Origami Archive",
    description:
      "Stacks of folded books line the walls, inked with riddles and origami lore.",
    features: [
      {
        keyword: "book",
        label: "Whispering Tome",
        actionLabel: "Read the whispering tome",
        details: "The book flutters open. You find a secret pocket.",
        event: events.fragment("A fragment was hidden in the binding."),
      },
    ],
    monsters: [],
  },
  {
    id: "bridge",
    title: "Crimson Bridge Span",
    description:
      "A narrow bridge of red paper stretches over an ink-black void.",
    features: [],
    monsters: [
      {
        id: "bridge-oni",
        name: "Bridge Oni",
        hp: 32,
        maxHp: 32,
        attack: 7,
        evasion: 0.1,
        mustTalk: true,
        intro: "A hulking oni guards the bridge center.",
        talkText: '"None pass without a greeting," he grunts.',
        talkEvent: events.gold(20, "He nods at your greeting. +20 Gold."),
      },
    ],
  },
];

/**
 * AdventureDirector - Master dungeon architect
 * Generates room-based dungeons with linear hallways and feature rooms
 * REFACTORED: Now generates a proper Rogue/Nethack style dungeon
 */
class AdventureDirector {
  constructor() {
    this.nextRoomId = 1;
    this.MAP_WIDTH = 60;
    this.MAP_HEIGHT = 40;
    this.MIN_ROOM_SIZE = 5;
    this.MAX_ROOM_SIZE = 12;
    this.MAX_ROOMS = 25;
  }

  /**
   * Build a complete adventure with rooms, hallways, and encounters
   * @returns {Object} { map: Map<roomId, room>, startRoomId: number, grid: [][], rooms: [] }
   */
  buildAdventure() {
    this.nextRoomId = 1;
    const level = this.generateDungeon();

    return {
      map: level.roomMap,
      startRoomId: level.startRoomId,
      grid: level.grid,
      rooms: level.rooms,
    };
  }

  /**
   * Generate a Rogue-like dungeon layout
   */
  generateDungeon() {
    // 1. Initialize Grid with Walls
    const grid = Array(this.MAP_HEIGHT)
      .fill(null)
      .map(() =>
        Array(this.MAP_WIDTH)
          .fill(null)
          .map(() => ({ type: "wall" }))
      );
    const rooms = [];
    const roomMap = new Map();

    // 2. Place Rooms
    for (let i = 0; i < this.MAX_ROOMS; i++) {
      const w = randomUtil.range(this.MIN_ROOM_SIZE, this.MAX_ROOM_SIZE);
      const h = randomUtil.range(this.MIN_ROOM_SIZE, this.MAX_ROOM_SIZE);
      const x = randomUtil.range(1, this.MAP_WIDTH - w - 1);
      const y = randomUtil.range(1, this.MAP_HEIGHT - h - 1);

      const newRoom = { x, y, w, h };

      // Check collision
      let failed = false;
      for (const other of rooms) {
        if (
          newRoom.x <= other.x + other.w + 1 &&
          newRoom.x + newRoom.w + 1 >= other.x &&
          newRoom.y <= other.y + other.h + 1 &&
          newRoom.y + newRoom.h + 1 >= other.y
        ) {
          failed = true;
          break;
        }
      }

      if (!failed) {
        this.createRoom(newRoom, grid);
        rooms.push(newRoom);
      }
    }

    // 3. Connect Rooms with Corridors
    // Sort rooms to make connections cleaner (optional, but helps linear progression feel)
    // We'll just connect i to i+1 for a "snake" dungeon, or use a Minimum Spanning Tree for better layouts.
    // Simple approach: Connect center to center sequentially.

    for (let i = 0; i < rooms.length - 1; i++) {
      const r1 = rooms[i];
      const r2 = rooms[i + 1];

      const c1 = {
        x: Math.floor(r1.x + r1.w / 2),
        y: Math.floor(r1.y + r1.h / 2),
      };
      const c2 = {
        x: Math.floor(r2.x + r2.w / 2),
        y: Math.floor(r2.y + r2.h / 2),
      };

      if (Math.random() < 0.5) {
        this.createHCorridor(c1.x, c2.x, c1.y, grid);
        this.createVCorridor(c1.y, c2.y, c2.x, grid);
      } else {
        this.createVCorridor(c1.y, c2.y, c1.x, grid);
        this.createHCorridor(c1.x, c2.x, c2.y, grid);
      }
    }

    // 4. Assign Content to Rooms
    // Room 0 is Entrance
    const startRoom = rooms[0];
    const entranceData = this.createEntrance(startRoom);
    roomMap.set(entranceData.id, entranceData);

    // Assign this data back to the room object for reference
    startRoom.id = entranceData.id;
    startRoom.title = entranceData.title;
    startRoom.isHallway = false;

    // Shuffle blueprints for other rooms
    const blueprints = randomUtil.shuffle(roomBlueprints);

    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const bp = blueprints[(i - 1) % blueprints.length]; // Cycle through blueprints

      const roomData = this.instantiateRoom(bp, room);
      roomMap.set(roomData.id, roomData);

      room.id = roomData.id;
      room.title = roomData.title;
      room.isHallway = false;
    }

    // 5. Finalize Grid Data
    // Update grid cells with room IDs
    rooms.forEach((room) => {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (grid[y][x]) {
            grid[y][x].roomId = room.id;
            grid[y][x].visited = true; // Auto-visit for now
          }
        }
      }
    });

    // Add center point to rooms for labels
    rooms.forEach((room) => {
      room.center = {
        x: Math.floor(room.x + room.w / 2),
        y: Math.floor(room.y + room.h / 2),
      };
    });

    return {
      grid,
      rooms,
      roomMap,
      startRoomId: startRoom.id,
    };
  }

  createRoom(room, grid) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        grid[y][x] = { type: "floor" };
      }
    }
  }

  createHCorridor(x1, x2, y, grid) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      if (!grid[y][x]) grid[y][x] = { type: "floor", hallway: true };
    }
  }

  createVCorridor(y1, y2, x, grid) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      if (!grid[y][x]) grid[y][x] = { type: "floor", hallway: true };
    }
  }

  createEntrance(roomRect) {
    const roomId = this.nextRoomId++;
    return {
      id: roomId,
      title: ENTRANCE_TITLE,
      description: ENTRANCE_DESCRIPTION,
      exits: {},
      features: [
        {
          id: "starting-lantern",
          keyword: "lantern",
          label: "Magical Glowworm Lantern",
          actionLabel: "Take Lantern",
          details:
            "A brass lantern housing bioluminescent glowworms. Their soft light never fades.",
          event: events.loot(
            "Magical Glowworm Lantern",
            "You carefully lift the lantern. The glowworms pulse warmly in your hands.",
            "🏮"
          ),
          consumed: false,
        },
      ],
      monsters: [],
      quest: null,
      x: roomRect.x,
      y: roomRect.y,
      w: roomRect.w,
      h: roomRect.h,
      isHallway: false,
    };
  }

  instantiateRoom(blueprint, roomRect) {
    const roomId = this.nextRoomId++;
    return {
      id: roomId,
      title: blueprint.title,
      description: blueprint.description,
      exits: {},
      features: blueprint.features
        ? blueprint.features.map((f) => ({ ...f, consumed: false }))
        : [],
      monsters: blueprint.monsters
        ? blueprint.monsters.map((m) => ({ ...m }))
        : [],
      quest: blueprint.quest
        ? { ...blueprint.quest, status: "available" }
        : null,
      x: roomRect.x,
      y: roomRect.y,
      w: roomRect.w,
      h: roomRect.h,
      isHallway: false,
    };
  }
}

// Export for module systems or window global
if (typeof module !== "undefined" && module.exports) {
  module.exports = { AdventureDirector, roomBlueprints, events, randomUtil };
} else if (typeof window !== "undefined") {
  window.AdventureDirector = AdventureDirector;
  window.OrigamiEvents = events;
  window.OrigamiRandomUtil = randomUtil;
}
