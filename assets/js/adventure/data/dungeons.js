export const DungeonData = {
  "dungeons": [
    {
      "id": "origami_catacombs",
      "name": "Origami Catacombs",
      "description": "The first experimental dungeon in Origami Dungeon.",
      "levels": [
        {
          "id": "level_1",
          "name": "Level 1 – Entrance",
          "width": 10,
          "height": 10,

          "rooms": [
            {
              "id": "room_entrance",
              "x": 4,
              "y": 9,
              "title": "Dungeon Entrance",
              "description": "A stairwell descends into the cool stone corridor.",
              "tags": ["entrance", "safe"],
              "exits": {
                "north": "room_corridor_1"
              },
              "loot": [
                {
                  "id": "lantern_001",
                  "name": "Magical Glowworm Lantern",
                  "type": "light-source",
                  "rarity": "uncommon",
                  "quantity": 1
                }
              ],
              "monsters": []
            },
            {
              "id": "room_corridor_1",
              "x": 4,
              "y": 8,
              "title": "Long Corridor",
              "description": "The corridor stretches into darkness, with faint scratch marks on the walls.",
              "tags": ["corridor"],
              "exits": {
                "south": "room_entrance",
                "north": "room_guard_post"
              },
              "loot": [],
              "monsters": [
                {
                  "id": "rat_001",
                  "name": "Giant Dungeon Rat",
                  "hp": 8,
                  "attack": 2,
                  "defense": 0,
                  "xp": 5,
                  "behavior": "aggressive"
                }
              ]
            },
            {
              "id": "room_guard_post",
              "x": 4,
              "y": 7,
              "title": "Abandoned Guard Post",
              "description": "An old wooden table sits overturned. The air smells of stale ale.",
              "tags": ["room"],
              "exits": {
                "south": "room_corridor_1",
                "east": "room_armory"
              },
              "loot": [
                 { "id": "rusty_sword", "name": "Rusty Sword", "type": "weapon" }
              ],
              "monsters": []
            },
            {
              "id": "room_armory",
              "x": 5,
              "y": 7,
              "title": "Looted Armory",
              "description": "Empty weapon racks line the walls.",
              "tags": ["room"],
              "exits": {
                "west": "room_guard_post"
              },
              "loot": [],
              "monsters": [
                  {
                      "id": "goblin_scout",
                      "name": "Goblin Scout",
                      "hp": 12,
                      "attack": 3,
                      "behavior": "hostile"
                  }
              ]
            }
          ],

          "monsters": [],
          "lootTables": []
        }
      ]
    }
  ]
};
