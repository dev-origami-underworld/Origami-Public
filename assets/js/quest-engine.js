(function (global) {
  class QuestEngine {
    constructor() {
      this.themes = [
        {
          id: "cursed_festival",
          name: "The Cursed Festival",
          mood: "eerie",
          intro:
            "The paper lanterns are torn, and the festival music is distorted by the wind.",
          boss: "Masked Oni",
          items: ["Spirit Mask", "Broken Drum", "Paper Fan"],
          rooms: ["Festival Plaza", "Lantern Workshop", "Shrine of Echoes"],
        },
        {
          id: "clockwork_ruins",
          name: "The Clockwork Ruins",
          mood: "mechanical",
          intro:
            "The ticking of unseen gears echoes through the halls. Oil stains the paper floor.",
          boss: "Clockwork Dragon",
          items: ["Brass Gear", "Winding Key", "Oil Can"],
          rooms: ["Gear Hall", "Steam Vent", "Assembly Line"],
        },
        {
          id: "ink_flood",
          name: "The Ink Flood",
          mood: "dark",
          intro:
            "Black ink seeps from the walls, corrupting the origami creatures within.",
          boss: "Ink Blot Horror",
          items: ["Pure Water", "Calligraphy Brush", "Blotting Paper"],
          rooms: ["Ink Well", "Scribe's Study", "Corrupted Gallery"],
        },
      ];

      this.questTemplates = [
        {
          type: "fetch",
          name: "Retrieve the Artifacts",
          steps: ["find_items", "unlock_boss", "defeat_boss"],
        },
        {
          type: "rescue",
          name: "Rescue the Lost",
          steps: ["find_npc", "escort_npc", "escape"],
        },
      ];
    }

    generateQuest(dungeon) {
      // 1. Pick a Theme
      const theme = this.pickRandom(this.themes);
      console.log(`QuestEngine: Generating quest with theme "${theme.name}"`);

      // 2. Pick a Quest Template
      const template = this.pickRandom(this.questTemplates);

      // 3. Assign Roles to Rooms
      const rooms = dungeon.rooms;
      const startRoom = rooms.find((r) => r.id === 1);
      const bossRoom = rooms[rooms.length - 1]; // Last room is boss

      // Shuffle middle rooms
      const middleRooms = rooms.filter(
        (r) => r.id !== 1 && r.id !== bossRoom.id
      );
      this.shuffle(middleRooms);

      // 4. Generate Story
      const story = {
        title: theme.name,
        intro: theme.intro,
        objective: template.name,
        theme: theme,
        steps: [],
      };

      // 5. Populate Rooms based on Story

      // Start Room
      if (startRoom) {
        startRoom.style = startRoom.style || {};
        startRoom.style.name = "Entrance Hall";
        startRoom.style.description = `A mysterious hallway. ${theme.intro} The smell is musty and ancient. A magical glowing lantern lies nearby.`;
        startRoom.guideActions = [
          { label: "Take Lantern", action: "take_lantern", icon: "🏮" },
          { label: "Read Warning", action: "read_sign", icon: "📜" },
        ];
      }

      // Distribute Quest Items
      let itemIndex = 0;
      middleRooms.forEach((room) => {
        // 30% chance to be a "Story Room"
        if (Math.random() < 0.3 && itemIndex < theme.items.length) {
          const item = theme.items[itemIndex++];
          room.style = room.style || {};
          room.style.name = `${
            theme.rooms[itemIndex % theme.rooms.length]
          } (Ruined)`;
          room.style.description = `You find yourself in what looks like a ${
            room.style.name
          }. ${this.getFlavorText(theme.mood)}`;
          room.questItem = item;
          room.guideActions = [
            {
              label: `Take ${item}`,
              action: `take_${item.toLowerCase().replace(/\s/g, "_")}`,
              icon: "✨",
            },
            { label: "Search Area", action: "search", icon: "🔍" },
          ];
        } else {
          // Generic Room
          room.style = room.style || {};
          room.style.description = `A quiet chamber. ${this.getFlavorText(
            theme.mood
          )}`;
          room.guideActions = [
            { label: "Search", action: "search", icon: "🔍" },
            { label: "Rest", action: "rest", icon: "💤" },
          ];
        }
      });

      // Boss Room
      if (bossRoom) {
        bossRoom.style = bossRoom.style || {};
        bossRoom.style.name = "The Inner Sanctum";
        bossRoom.style.description = `The lair of the ${theme.boss}. The air is heavy with power.`;
        bossRoom.isBossRoom = true;
        bossRoom.boss = theme.boss;
        bossRoom.guideActions = [
          {
            label: `Challenge ${theme.boss}`,
            action: "fight_boss",
            icon: "⚔️",
          },
          { label: "Sneak", action: "sneak", icon: "👣" },
        ];
      }

      return story;
    }

    getFlavorText(mood) {
      const texts = {
        eerie: [
          "Shadows dance on the walls.",
          "You hear a faint whisper.",
          "The paper walls rustle.",
        ],
        mechanical: [
          "Steam hisses from a pipe.",
          "Something clicks beneath the floor.",
          "The air smells of oil.",
        ],
        dark: [
          "It is unnaturally dark here.",
          "The ink stains look like faces.",
          "You feel watched.",
        ],
      };
      return this.pickRandom(texts[mood] || texts.eerie);
    }

    pickRandom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
  }

  global.QuestEngine = new QuestEngine();
})(window);
