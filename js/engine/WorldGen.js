export const WorldGenMixin = {
generateMap() {
                // Room definitions for future dungeon editing
                const DUNGEON_ROOMS_SCHEMA = [
                  {
                    "id": 1,
                    "name": "Large Chamber",
                    "description": "A grand hall with multiple exits, echoing with ancient magic.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [10,5]},
                      {"direction": "east", "position": [5,10]}
                    ],
                    "triggers": [
                      {"position": [5,5], "action": "update_narrative", "value": "You enter a grand hall, its walls pulsing with arcane energy."}
                    ]
                  },
                  {
                    "id": 2,
                    "name": "Storage Room",
                    "description": "A cluttered room with a dusty chest in the center.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "chest", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "A dusty chest sits in the center, whispering secrets."}
                    ]
                  },
                  {
                    "id": 3,
                    "name": "Statue Room",
                    "description": "A solemn chamber with a statue of a fallen priest.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "statue", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "The statue's eyes seem to follow you."}
                    ]
                  },
                  {
                    "id": 4,
                    "name": "Trap Room",
                    "description": "A dangerous room with a hidden trap.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "trap", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "A trap clicks beneath your feet!"}
                    ]
                  },
                  {
                    "id": 5,
                    "name": "Altar Room",
                    "description": "A mystical room with a glowing altar.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "altar", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "The altar hums with dark energy."}
                    ]
                  },
                  {
                    "id": 6,
                    "name": "Library",
                    "description": "A dusty room filled with ancient tomes.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "chest", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [8,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "Ancient tomes whisper forgotten lore."}
                    ]
                  },
                  {
                    "id": 7,
                    "name": "Throne Room",
                    "description": "A regal hall with a crumbling throne.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "statue", "floor", "floor", "floor", "ascended", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [10,5]}
                    ],
                    "triggers": [
                      {"position": [5,5], "action": "update_narrative", "value": "The throne crumbles under the weight of time."}
                    ]
                  },
                  {
                    "id": 8,
                    "name": "Prison Cell",
                    "description": "A dank cell with iron bars.",
                    "grid": [
                      ["wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "wall"],
                      ["wall", "door", "floor", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [4,2]}
                    ],
                    "triggers": [
                      {"position": [2,2], "action": "update_narrative", "value": "The cell reeks of despair."}
                    ]
                  },
                  {
                    "id": 9,
                    "name": "Garden",
                    "description": "An overgrown garden with magical plants.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "altar", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [8,3]}
                    ],
                    "triggers": [
                      {"position": [4,4], "action": "update_narrative", "value": "Magical plants sway in an eerie breeze."}
                    ]
                  },
                  {
                    "id": 10,
                    "name": "Forge",
                    "description": "A hot forge with glowing embers.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "chest", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [7,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "The forge's heat is overwhelming."}
                    ]
                  },
                  {
                    "id": 11,
                    "name": "Straight Hallway",
                    "description": "A long, straight corridor.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The corridor stretches endlessly."}
                    ]
                  },
                  {
                    "id": 12,
                    "name": "L-Shaped Hallway",
                    "description": "A corridor with a sharp bend.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "wall", "door", "wall"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,9]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The corridor turns sharply."}
                    ]
                  },
                  {
                    "id": 13,
                    "name": "T-Shaped Hallway",
                    "description": "A corridor splitting into three paths.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]},
                      {"direction": "north", "position": [1,5]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "Three paths diverge ahead."}
                    ]
                  },
                  {
                    "id": 14,
                    "name": "Crossroads Hallway",
                    "description": "A corridor with four paths.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]},
                      {"direction": "north", "position": [1,5]},
                      {"direction": "south", "position": [2,5]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "A crossroads offers multiple choices."}
                    ]
                  },
                  {
                    "id": 15,
                    "name": "Narrow Passage",
                    "description": "A tight, claustrophobic hallway.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The walls close in tightly."}
                    ]
                  },
                  {
                    "id": 16,
                    "name": "Wide Hallway",
                    "description": "A spacious corridor for large groups.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The wide hall echoes with footsteps."}
                    ]
                  },
                  {
                    "id": 17,
                    "name": "Secret Passage",
                    "description": "A hidden corridor behind a wall.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "A secret passage reveals itself."}
                    ]
                  },
                  {
                    "id": 18,
                    "name": "Trapped Corridor",
                    "description": "A hallway rigged with traps.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "trap", "floor", "floor", "trap", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,3], "action": "update_narrative", "value": "A trap springs to life!"},
                      {"position": [2,6], "action": "update_narrative", "value": "Another trap clicks nearby!"}
                    ]
                  },
                  {
                    "id": 19,
                    "name": "Patrolled Corridor",
                    "description": "A hallway guarded by enemies.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "You hear the footsteps of guards."}
                    ]
                  },
                  {
                    "id": 20,
                    "name": "Collapsed Corridor",
                    "description": "A hallway blocked by rubble.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "chest", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "Rubble blocks part of the path."}
                    ]
                  }
                ];
                
                // Initialize rich grid map architecture [x][z]
                this.mapData = Array.from({ length: this.mapWidth }, () => Array.from({ length: this.mapHeight }, () => ({ type: 'wall', discovered: false })));
                this.rooms = [];
                let roomCounter = 0;
                
                // --- 1. PROCEDURAL ANCHOR (HALLWAY + ROOM 1) ---
                const roomSize = 7;
                // Anchor room placed at z=20 so the 7-tile hallway ends at z=27, player spawns at z=27 - close to goblins
                const rStartX = Math.floor(this.mapWidth / 2) - 3;
                const rStartZ = 20; 
                
                this.rooms.push({
                    id: roomCounter, 
                    x: rStartX, 
                    y: rStartZ, 
                    w: roomSize, 
                    h: roomSize, 
                    center: { x: rStartX + 3, y: rStartZ + 3 }
                });
                
                // Carve Room 1
                for(let ry = rStartZ; ry < rStartZ + roomSize; ry++) {
                    for(let rx = rStartX; rx < rStartX + roomSize; rx++) {
                        this.mapData[rx][ry] = { type: 'floor', room: true, roomId: roomCounter };
                    }
                }
                
                // --- SHOP ROOM (Level 1 Only) ---
                if (!this.level || this.level === 1) {
                    const shopW = 5;
                    const shopH = 5;
                    const shopStartX = rStartX - shopW - 1; // 1 wall gap for door
                    const shopStartZ = rStartZ + 1;
                    
                    this.rooms.push({
                        id: 99, // Shop ID
                        x: shopStartX, y: shopStartZ, w: shopW, h: shopH,
                        center: { x: shopStartX + Math.floor(shopW/2), y: shopStartZ + Math.floor(shopH/2) }
                    });
                    
                    // Carve Shop Floor
                    for(let ry = shopStartZ; ry < shopStartZ + shopH; ry++) {
                        for(let rx = shopStartX; rx < shopStartX + shopW; rx++) {
                            this.mapData[rx][ry] = { type: 'floor', room: true, roomId: 99, isShop: true };
                        }
                    }
                    // Carve Shop Door
                    this.mapData[shopStartX + shopW][shopStartZ + Math.floor(shopH/2)] = { type: 'floor', isShopDoor: true };
                }
                
                // Carve 3-Wide Entrance Hallway South
                const hallX = this.rooms[0].center.x;
                const hallStartTopZ = rStartZ + roomSize;
                
                for(let i = 0; i < 7; i++) {
                    this.mapData[hallX - 1][hallStartTopZ + i] = { type: 'floor', hallway: true };
                    this.mapData[hallX][hallStartTopZ + i] = { type: 'floor', hallway: true };
                    this.mapData[hallX + 1][hallStartTopZ + i] = { type: 'floor', hallway: true };
                }
                
                // Entrance precisely at the end of the center lane
                const entrancePos = { x: hallX, y: hallStartTopZ + 6 };
                this.mapData[entrancePos.x][entrancePos.y] = { type: 'entrance' };
                // Solid blocker at the rear of the hallway becomes stairs up
                this.mapData[hallX][entrancePos.y + 1] = { type: 'stairs_up' };
                
                // Player Spawn Location
                this.player.x = entrancePos.x;
                this.player.z = entrancePos.y;
                this.player.rot = 0;
                this.entrancePos = { x: entrancePos.x, z: entrancePos.y }; // Store for loot placement
                
                // --- 2. PROCEDURAL DUNGEON GROWTH (BSP / Drunkard's Anchor) ---
                const maxRooms = Math.floor(Math.random() * 10) + 11; // 11 to 20 rooms
                let attempts = 0;
                
                // Simple helper to check if a rect overlaps existing floor + 1 tile buffer
                const canPlaceRoom = (rx, rz, rw, rh) => {
                    if (rx < 2 || rz < 2 || rx + rw >= this.mapWidth - 2 || rz + rh >= this.mapHeight - 2) return false;
                    for (let x = rx - 1; x < rx + rw + 1; x++) {
                        for (let z = rz - 1; z < rz + rh + 1; z++) {
                            if (this.mapData[x][z].type !== 'wall') return false;
                        }
                    }
                    return true;
                };

                while (this.rooms.length < maxRooms && attempts < 500) { // increased attempts for denser dungeon
                    attempts++;
                    // Pick a random existing room to sprout from
                    const sourceRoom = this.rooms[Math.floor(Math.random() * this.rooms.length)];
                    
                    // Pick a random dimension for new room
                    const nw = Math.floor(Math.random() * 4) + 4; // 4 to 7 wide
                    const nh = Math.floor(Math.random() * 4) + 4; // 4 to 7 high
                    
                    // Pick direction (0: North, 1: East, 2: West) 
                    // (Omit South to keep progression generally pushing forward/sideways from the start point)
                    const dir = Math.floor(Math.random() * 3);
                    const hallLen = Math.floor(Math.random() * 3) + 3; // 3 to 5 tiles long
                    
                    let newRx, newRz, hx, hz, dx, dz;
                    
                    if (dir === 0) { // North
                        newRx = sourceRoom.center.x - Math.floor(nw/2);
                        newRz = sourceRoom.y - hallLen - nh;
                        hx = sourceRoom.center.x; hz = sourceRoom.y - 1; dx = 0; dz = -1;
                    } else if (dir === 1) { // East
                        newRx = sourceRoom.x + sourceRoom.w + hallLen;
                        newRz = sourceRoom.center.y - Math.floor(nh/2);
                        hx = sourceRoom.x + sourceRoom.w; hz = sourceRoom.center.y; dx = 1; dz = 0;
                    } else if (dir === 2) { // West
                        newRx = sourceRoom.x - hallLen - nw;
                        newRz = sourceRoom.center.y - Math.floor(nh/2);
                        hx = sourceRoom.x - 1; hz = sourceRoom.center.y; dx = -1; dz = 0;
                    }
                    
                    if (canPlaceRoom(newRx, newRz, nw, nh)) {
                        roomCounter++;
                        // Carve 3-Wide Hallway
                        for (let i = 0; i < hallLen; i++) {
                            const cx = hx + (dx * i);
                            const cz = hz + (dz * i);
                            const ox = dz !== 0 ? 1 : 0;
                            const oz = dx !== 0 ? 1 : 0;
                            this.mapData[cx - ox][cz - oz] = { type: 'floor', hallway: true };
                            this.mapData[cx][cz] = { type: 'floor', hallway: true };
                            this.mapData[cx + ox][cz + oz] = { type: 'floor', hallway: true };
                        }
                        // Carve Room
                        for (let rx = newRx; rx < newRx + nw; rx++) {
                            for (let rz = newRz; rz < newRz + nh; rz++) {
                                this.mapData[rx][rz] = { type: 'floor', room: true, roomId: roomCounter };
                            }
                        }
                        this.rooms.push({
                            id: roomCounter,
                            x: newRx, y: newRz, w: nw, h: nh,
                            center: { x: newRx + Math.floor(nw/2), y: newRz + Math.floor(nh/2) }
                        });
                    }
                }
                // --- 2.5 STAIRWAYS ---
                
                // Stairs Down (Next Level) located in the center of the final generated room
                if (!this.level || this.level < 3) {
                    const lastRoom = this.rooms[this.rooms.length - 1];
                    if (lastRoom.id !== 0) {
                        this.mapData[lastRoom.center.x][lastRoom.center.y] = { type: 'stairs_down', room: true, roomId: lastRoom.id };
                    }
                }
                
                // --- 3. ENTITY SPAWNING ---
                this.mobSpawns = [];
                
                // Spawn 1 monster in every generated room
                this.rooms.forEach((room, idx) => {
                  // Skip the shop room (id 99) if it exists
                  if (room.id === 99) return;

                  // Offset slightly from exact center if it's the last room to avoid standing ON the stairs
                  const isLastRoom =
                    idx === this.rooms.length - 1 &&
                    (!this.level || this.level < 3);
                  const spawnX = room.center.x + (isLastRoom ? 1 : 0);
                  const spawnZ = room.center.y;

                  this.mobSpawns.push({
                    id: `goblin-${idx}-${Date.now()}`,
                    name: "Yakuza Goblin",
                    type: "goblin",
                    x: spawnX,
                    z: spawnZ,
                    homeX: spawnX,
                    homeZ: spawnZ,
                    speed: 8.0,
                    hp: 50,
                    maxHp: 50,
                    state: "IDLE",
                    searchTimer: 0,
                    isHostile: true, // Fix: Ensure it bypasses Room 0 pacifism check
                  });

                  // Add two imp henchmen around single-goblin rooms. They use the same goblin model/texture path
                  const henchmanOffsets = [
                    { dx: 1, dz: 0 },
                    { dx: -1, dz: 0 },
                    { dx: 0, dz: 1 },
                    { dx: 0, dz: -1 },
                    { dx: 1, dz: 1 },
                    { dx: 1, dz: -1 },
                    { dx: -1, dz: 1 },
                    { dx: -1, dz: -1 },
                  ];
                  let impAdded = 0;
                  for (const offset of henchmanOffsets) {
                    if (impAdded >= 2) break;
                    const impX = spawnX + offset.dx;
                    const impZ = spawnZ + offset.dz;
                    if (
                      impX < room.x ||
                      impX >= room.x + room.w ||
                      impZ < room.y ||
                      impZ >= room.y + room.h
                    )
                      continue;
                    this.mobSpawns.push({
                      id: `imp-${idx}-${impAdded}-${Date.now()}`,
                      name: "Imp Henchman",
                      type: "imp",
                      x: impX,
                      z: impZ,
                      homeX: impX,
                      homeZ: impZ,
                      speed: 9.0,
                      hp: 30,
                      maxHp: 30,
                      state: "IDLE",
                      searchTimer: 0,
                      isHostile: true,
                    });
                    impAdded += 1;
                  }
                };);
            },

carveFuzzyHallway(start, end) {
                // Kept for signature compatibility if MapEngine relies on parsing this script directly
            },

makePaperTexture(baseColor) {
                const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
                ctx.fillStyle = baseColor; ctx.fillRect(0,0,256,256);
                for (let i=0;i<400;i++) { 
                    const x=Math.random()*256, y=Math.random()*256, w=Math.random()*24+6; 
                    const a=Math.random()*0.05+0.02; ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(x,y,w,1); 
                }
                ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                for (let x=0; x<256; x+=32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
                for (let y=0; y<256; y+=32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
                const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(8,8); return tex;
            },

makeWoodTexture(baseColor) {
                const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d');
                ctx.fillStyle = baseColor; ctx.fillRect(0,0,512,512);
                const plankH = 40;
                for (let y=0;y<512;y+=plankH){
                    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0,y,512,plankH/2);
                    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0,y+plankH/2,512,plankH/2);
                    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0,y+plankH-1,512,1);
                }
                for (let i=0;i<700;i++){
                    const y = Math.random()*512; const len = 40+Math.random()*120; const x = Math.random()*512; const a = Math.random()*0.12;
                    ctx.strokeStyle = `rgba(255,255,255,${a*0.5})`; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(Math.min(512,x+len), y+Math.sin(y*0.05)*2); ctx.stroke();
                    ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.moveTo(x,y+2); ctx.lineTo(Math.min(512,x+len), y+2+Math.sin((y+2)*0.05)*2); ctx.stroke();
                }
                const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2,2); return tex;
            },
            // Generate 8 tiers of procedurally torn Shoji screens
            createTornShojiTexture(tier) {
                const canvas = document.createElement("canvas");
                canvas.width = 512; // High-res for macro photography look
                canvas.height = 512;
                const ctx = canvas.getContext("2d");
                
                // Base: Aged, tea-stained shoji paper — dark and moody
                ctx.fillStyle = "#c8b89a";
                ctx.fillRect(0, 0, 512, 512);
                
                // Paper grain noise
                ctx.fillStyle = "rgba(0,0,0,0.02)";
                for (let i = 0; i < 3000; i++) {
                    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
                }
                
                // Wooden Frame
                ctx.strokeStyle = "#1a1a1a"; // Dark rotted wood
                ctx.lineWidth = 32;
                ctx.strokeRect(0, 0, 512, 512);
                ctx.lineWidth = 16;
                // Vertical beams
                for (let i = 96; i < 512; i += 96) {
                    ctx.beginPath(); ctx.moveTo(i, 16); ctx.lineTo(i, 496); ctx.stroke();
                }
                // Horizontal beams
                for (let i = 128; i < 512; i += 128) {
                    ctx.beginPath(); ctx.moveTo(16, i); ctx.lineTo(496, i); ctx.stroke();
                }

                // Procedural Tearing based on Tier
                // Tier 0 is pristine. Tier 7 is destroyed.
                if (tier > 0) {
                    const numHoles = tier * Math.floor(2 + Math.random() * 3);
                    
                    for (let h = 0; h < numHoles; h++) {
                        const holeX = 32 + Math.random() * (512 - 64);
                        const holeY = 32 + Math.random() * (512 - 64);
                        const maxRadius = 20 + (tier * 15) + (Math.random() * 40);
                        
                        // Draw jagged polygon hole
                        ctx.fillStyle = "#0c0d12"; // Deep dark void behind the paper
                        ctx.beginPath();
                        
                        const numPoints = 6 + Math.floor(Math.random() * 10);
                        for (let p = 0; p < numPoints; p++) {
                            const angle = (p / numPoints) * Math.PI * 2;
                            // Jagged edge
                            const rad = maxRadius * (0.3 + 0.7 * Math.random());
                            const px = holeX + Math.cos(angle) * rad;
                            const py = holeY + Math.sin(angle) * rad;
                            if (p === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.fill();
                        
                        // Tattered paper edges (shadow)
                        ctx.strokeStyle = "rgba(0,0,0,0.5)";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                }

                const tex = new THREE.CanvasTexture(canvas);
                tex.anisotropy = 4;
                return tex;
            },

            createDungeonFloorTexture() {
                const size = 512;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");

                // Base color: Ghostly dark ash gray
                ctx.fillStyle = "#15161a"; 
                ctx.fillRect(0, 0, size, size);

                // Very subtle, refined ash wood grain
                const imageData = ctx.getImageData(0, 0, size, size);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const noise = (Math.random() - 0.5) * 5; 
                    data[i]   = Math.max(0, data[i] + noise); 
                    data[i+1] = Math.max(0, data[i+1] + noise); 
                    data[i+2] = Math.max(0, data[i+2] + noise + 2); // slight cool tint
                }
                ctx.putImageData(imageData, 0, 0);

                // Draw wood planks
                const numPlanks = 4;
                const plankWidth = size / numPlanks;
                ctx.lineWidth = 1;
                
                for(let p = 0; p < numPlanks; p++) {
                    const x = p * plankWidth;
                    
                    // Dark crevices between planks
                    ctx.fillStyle = "rgba(5, 5, 10, 0.6)";
                    ctx.fillRect(x, 0, 2, size);
                    
                    // Polished ghostly wood grain streaks
                    ctx.strokeStyle = "rgba(40, 45, 55, 0.3)";
                    for(let g = 0; g < 8; g++) {
                        ctx.beginPath();
                        const grainX = x + 5 + Math.random() * (plankWidth - 10);
                        ctx.moveTo(grainX, 0);
                        for(let y = 0; y <= size; y += 120) {
                            ctx.lineTo(grainX + (Math.random() - 0.5) * 3, y);
                        }
                        ctx.stroke();
                    }
                }

                // Clean 1x1 tile border (darker and cooler)
                ctx.strokeStyle = "rgba(5, 5, 8, 0.9)";
                ctx.lineWidth = 12; // Solid, confident border
                ctx.strokeRect(6, 6, size - 12, size - 12);
                
                // Thin inner trim
                ctx.strokeStyle = "rgba(60, 65, 80, 0.2)";
                ctx.lineWidth = 2;
                ctx.strokeRect(16, 16, size - 32, size - 32);

                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                return tex;
            },

            createMegaDojoFloorTexture() {
                // The user requested to "remove the 3x3 rule". 
                // To keep draw call optimization while fulfilling the visual request, 
                // we simply reuse the 1x1 dungeon floor texture!
                return this.createDungeonFloorTexture();
            },

            createDarkWoodRafterTexture() {
                const size = 512;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");

                ctx.fillStyle = "#050505"; // Pitch black base
                ctx.fillRect(0, 0, size, size);

                const imageData = ctx.getImageData(0, 0, size, size);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const randomFactor = (Math.random() - 0.5) * 8;
                    data[i]   += randomFactor;
                    data[i+1] += randomFactor;
                    data[i+2] += randomFactor;
                }
                ctx.putImageData(imageData, 0, 0);

                ctx.fillStyle = "#111111"; // Dark charcoal horizontal rafters
                const beamWidth = 40;
                for (let y = 0; y < size; y += (80 + Math.random()*20)) {
                    ctx.fillRect(0, y, size, beamWidth + Math.random()*10);
                }

                ctx.fillStyle = "#0c0c0c"; // Even darker vertical beams
                const vertBeamWidth = 30;
                for (let x = 0; x < size; x += (120 + Math.random()*30)) {
                    ctx.fillRect(x, 0, vertBeamWidth + Math.random()*15, size);
                }

                ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
                ctx.lineWidth = 3;
                // Add wood grain noise lines to beams
                for (let i = 0; i < 150; i++) {
                    const y = Math.random() * size;
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + (Math.random()*10 - 5)); ctx.stroke();
                }

                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                return tex;
            },

createCobwebTexture() {
                const size = 256;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, size, size);
                
                ctx.strokeStyle = "rgba(200, 200, 210, 0.4)";
                ctx.lineWidth = 1.0;
                
                const cx = 0, cy = 0;
                const maxR = size;
                
                // Radiating lines
                for(let a=0; a<=90; a+=15) {
                    let rad = a * Math.PI / 180;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + Math.cos(rad)*maxR, cy + Math.sin(rad)*maxR);
                    ctx.stroke();
                }
                
                // Web rings
                ctx.strokeStyle = "rgba(200, 200, 210, 0.25)";
                for(let r=20; r<maxR; r+=25) {
                    ctx.beginPath();
                    for(let a=0; a<=90; a+=15) {
                        let rad = a * Math.PI / 180;
                        let sagR = r + (Math.random()*10 - 5);
                        let px = cx + Math.cos(rad)*sagR;
                        let py = cy + Math.sin(rad)*sagR;
                        if(a===0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
                return tex;
            },

            createBrokenFurnitureMesh() {
                if (!this._brokenFurnCache) {
                    this._brokenFurnCache = {
                        mats: [],
                        geos: {
                            top: new THREE.BoxGeometry(1.2, 0.1, 0.8),
                            leg1: new THREE.BoxGeometry(0.1, 0.8, 0.1),
                            seat: new THREE.BoxGeometry(0.5, 0.1, 0.5),
                            back: new THREE.BoxGeometry(0.5, 0.6, 0.05),
                            shelf: new THREE.BoxGeometry(1.0, 0.05, 0.4),
                            potBig: new THREE.CylinderGeometry(0.4, 0.28, 0.8, 8),
                            potSmall: new THREE.CylinderGeometry(0.2, 0.16, 0.4, 6)
                        },
                        ironMat: new THREE.MeshStandardMaterial({
                            color: 0x1a1a1a, roughness: 0.8, metalness: 0.7
                        })
                    };
                    // Pre-generate 10 variations of dark wood to share (Black/Dark Gray Japanese Wood)
                    for (let i=0; i<10; i++) {
                        const hue = 0.05 + Math.random() * 0.03;
                        const saturation = 0.05 + Math.random() * 0.10;
                        const lightness = 0.02 + Math.random() * 0.06;
                        this._brokenFurnCache.mats.push(new THREE.MeshStandardMaterial({ 
                            color: new THREE.Color().setHSL(hue, saturation, lightness), 
                            roughness: 0.95, 
                            metalness: 0.05 
                        }));
                    }
                }
                const cache = this._brokenFurnCache;
                const group = new THREE.Group();
                group.userData = { isDecor: true };
                
                const darkWoodMat = cache.mats[Math.floor(Math.random() * cache.mats.length)];
                
                const type = Math.floor(Math.random() * 5);
                if (type === 0) {
                    // Broken Table
                    const topMesh = new THREE.Mesh(cache.geos.top, darkWoodMat);
                    topMesh.rotation.z = 0.4;
                    topMesh.rotation.x = 0.2;
                    topMesh.position.y = 0.3;
                    group.add(topMesh);
                    
                    const leg1 = new THREE.Mesh(cache.geos.leg1, darkWoodMat);
                    leg1.rotation.z = 1.2;
                    leg1.position.set(-0.4, 0.1, -0.3);
                    group.add(leg1);
                } else if (type === 1) {
                    // Crushed Chair
                    const seat = new THREE.Mesh(cache.geos.seat, darkWoodMat);
                    seat.rotation.z = -0.3;
                    seat.position.y = 0.15;
                    group.add(seat);
                    
                    const back = new THREE.Mesh(cache.geos.back, darkWoodMat);
                    back.rotation.x = -0.8;
                    back.position.set(0, 0.2, 0.3);
                    group.add(back);
                } else if (type === 2) {
                    // Collapsed Shelf
                    for(let i=0; i<3; i++) {
                        const shelf = new THREE.Mesh(cache.geos.shelf, darkWoodMat);
                        shelf.rotation.x = Math.random() * 0.4 - 0.2;
                        shelf.rotation.z = Math.random() * 0.4 - 0.2;
                        shelf.rotation.y = Math.random() * 0.5;
                        shelf.position.y = 0.05 + i * 0.15;
                        group.add(shelf);
                    }
                } else {
                    if (type === 3) {
                        // Broken Big Iron Pot
                        const pot = new THREE.Mesh(cache.geos.potBig, cache.ironMat);
                        pot.rotation.x = Math.random() > 0.5 ? 1.5 : -1.5; // Tipped over
                        pot.position.y = 0.2;
                        pot.scale.z = 0.5; // Smashed flat
                        group.add(pot);
                    } else if (type === 4) {
                        // Smashed Small Iron Pots
                        for(let i=0; i<3; i++) {
                            const pot = new THREE.Mesh(cache.geos.potSmall, cache.ironMat);
                            pot.position.set((Math.random()-0.5)*0.6, 0.1, (Math.random()-0.5)*0.6);
                            pot.rotation.set(Math.random()*2, Math.random()*2, Math.random()*2);
                            pot.scale.y = 0.3; // Bent/smashed
                            group.add(pot);
                        }
                    }
                }
                
                group.traverse(c => {
                    if (c.isMesh) {
                        // Removed c.castShadow = true to fix FPS drop from thousands of debris shadows
                        c.receiveShadow = true;
                        c.layers.set(1); // FPV only
                    }
                });
                
                return group;
            },

createDungeonTopTexture() {
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1e1e1e';
                ctx.fillRect(0,0,128,128);
                // Subtle noise
                for (let i = 0; i < 500; i++) {
                    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
                    ctx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
                }
                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                return tex;
            },

createSpiderwebTexture() {
                const canvas = document.createElement('canvas');
                canvas.width = 512; canvas.height = 512;
                const ctx = canvas.getContext('2d');
                
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.lineWidth = 2.0;
                
                // Draw spiderweb centered at top-left corner
                const cx = 0;
                const cy = 0;
                
                // Radials
                for (let i = 0; i <= 90; i += 15) {
                    const rad = (i * Math.PI) / 180;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + Math.cos(rad) * 450, cy + Math.sin(rad) * 450);
                    ctx.stroke();
                }
                
                // Spirals (arcs)
                for (let r = 50; r <= 450; r += 40) {
                    ctx.beginPath();
                    for (let i = 0; i <= 90; i += 15) {
                        const rad = (i * Math.PI) / 180;
                        const px = cx + Math.cos(rad) * r;
                        const py = cy + Math.sin(rad) * r;
                        // Add a little sag
                        if (i === 0) ctx.moveTo(px, py);
                        else {
                            const midRad = ((i - 7.5) * Math.PI) / 180;
                            const sagR = r - 15; 
                            ctx.quadraticCurveTo(
                                cx + Math.cos(midRad) * sagR, cy + Math.sin(midRad) * sagR,
                                px, py
                            );
                        }
                    }
                    ctx.stroke();
                }
                
                return new THREE.CanvasTexture(canvas);
            },

buildWorldGeometry() {
                // Initialize geometry container to prevent "children of undefined" crashes on reset
                if (!this.worldGroup) {
                    this.worldGroup = new THREE.Group();
                    this.dynamicEntities = [];
                    const originalAdd = this.worldGroup.add.bind(this.worldGroup);
                    this.worldGroup.add = (...objects) => {
                        originalAdd(...objects);
                        objects.forEach(obj => {
                            if (obj.userData && (
                                obj.userData.type === 'enemy' || 
                                obj.userData.type === 'monster' ||
                                obj.userData.type === 'npc' ||
                                obj.userData.type === 'player' ||
                                obj.userData.type === 'imp' ||
                                obj.userData.type === 'gambler' ||
                                obj.userData.isSpellParticle ||
                                obj.userData.isRockFrag ||
                                obj.userData.isWindFrag ||
                                obj.userData.floatTimer !== undefined ||
                                obj.userData.idlePhase !== undefined ||
                                obj.userData.isShuriken ||
                                obj.userData.isArrow ||
                                obj.userData.isFire
                            )) {
                                if (!this.dynamicEntities.includes(obj)) {
                                    this.dynamicEntities.push(obj);
                                }
                            }
                        });
                        return this.worldGroup;
                    };
                    const originalRemove = this.worldGroup.remove.bind(this.worldGroup);
                    this.worldGroup.remove = (...objects) => {
                        originalRemove(...objects);
                        if (this.dynamicEntities) {
                            objects.forEach(obj => {
                                const idx = this.dynamicEntities.indexOf(obj);
                                if (idx !== -1) {
                                    this.dynamicEntities.splice(idx, 1);
                                }
                            });
                        }
                        return this.worldGroup;
                    };
                }

                // Clear old geometry and properly dispose to prevent GPU memory leak
                const disposeHierarchy = (node) => {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) {
                        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
                        else node.material.dispose();
                    }
                    if (node.children) node.children.forEach(disposeHierarchy);
                };
                while (this.worldGroup.children.length > 0) {
                    const child = this.worldGroup.children[0];
                    disposeHierarchy(child);
                    this.worldGroup.remove(child);
                }
                
                this.pathVisualsGroup = new THREE.Group();
                this.worldGroup.add(this.pathVisualsGroup);

                // Generate premium textures
                const floorTex = this.createDungeonFloorTexture();
                const floorLargeTex = this.createMegaDojoFloorTexture();
                const wallTopTex = this.createDungeonTopTexture();
                const ceilTex = this.createDarkWoodRafterTexture();
                const objTex = this.makePaperTexture('#444444');

                // Photo-Realistic Toy Aesthetic (Standard Materials with high roughness)
                const mats = {
                  floor: new THREE.MeshStandardMaterial({
                    map: floorTex,
                    roughness: 0.9,
                    metalness: 0.1,
                  }),
                  floorLarge: new THREE.MeshStandardMaterial({
                    map: floorLargeTex,
                    roughness: 0.8,
                    metalness: 0.2,
                  }),
                  ceil: new THREE.MeshStandardMaterial({
                    map: ceilTex,
                    color: 0x1a1a1a,
                    roughness: 1.0,
                    metalness: 0.0,
                  }),
                  pipWall: new THREE.MeshStandardMaterial({
                    color: 0x111111,
                    transparent: true,
                    opacity: 0.15,
                    depthWrite: false,
                  }),
                  wallTop: new THREE.MeshStandardMaterial({
                    map: wallTopTex,
                    color: 0x7a7a72,
                    roughness: 0.95,
                    metalness: 0.0,
                  }),
                  npc: new THREE.MeshStandardMaterial({
                    color: "#7cfc00",
                    map: objTex,
                    roughness: 0.6,
                  }),
                  monster: new THREE.MeshPhysicalMaterial({
                    color: "#2a4a3a", // Deep muted jade shadow
                    emissive: "#113322", // Barely-there green glow in darkness
                    emissiveIntensity: 0.3,
                    map: objTex,
                    roughness: 0.85,
                    metalness: 0.0,
                    transparent: true,
                    opacity: 0.75,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                  }),
                  spiderweb: new THREE.MeshBasicMaterial({
                    map: this.createSpiderwebTexture(),
                    color: 0xeeeeee,
                    transparent: true,
                    opacity: 0.6,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                  }),
                };
                this.mats = mats;

                const pipWallMaterials = [
                    mats.pipWall,    // Right
                    mats.pipWall,    // Left
                    mats.wallTop,    // Top
                    mats.pipWall,    // Bottom
                    mats.pipWall,    // Front
                    mats.pipWall     // Back
                ];

                // Merge geometry for insane performance (instead of 1000s of distinct meshes)
                // NEW: Walls are 1.33 cubes high                // 1. Grid Walls
                const wallHeight = this.gridSize * 1.85; // Additional 5% taller for realism
                const wallGeo = new THREE.BoxGeometry(this.gridSize, wallHeight, this.gridSize);
                
                const isExposed = (x, z) => {
                    for(let dx=-1; dx<=1; dx++) {
                        for(let dz=-1; dz<=1; dz++) {
                            const nx = x+dx, nz = z+dz;
                            if (nx>=0 && nx<this.mapWidth && nz>=0 && nz<this.mapHeight) {
                                if (this.mapData[nx]?.[nz]?.type !== 'wall') return true;
                            }
                        }
                    }
                    return false;
                };

                // 2. InstancedMesh setup
                let wallCount = 0;
                const PADDING = 20;
                for (let x = -PADDING; x < this.mapWidth + PADDING; x++) {
                    for (let z = -PADDING; z < this.mapHeight + PADDING; z++) {
                        const isMapArea = x >= 0 && x < this.mapWidth && z >= 0 && z < this.mapHeight;
                        const type = isMapArea ? this.mapData[x]?.[z]?.type : 'wall';
                        if (type === 'wall') wallCount++;
                    }
                }

                // Load single texture for performance and aesthetics
                const wallTex = new THREE.TextureLoader().load('./assets/textures/Wall.Panel.Basic.1.png');
                wallTex.wrapS = THREE.RepeatWrapping;
                wallTex.wrapT = THREE.RepeatWrapping;
                wallTex.repeat.set(1, 1);
                
                const wallMaterial = new THREE.MeshStandardMaterial({
                  map: wallTex,
                  color: 0x888880,
                  roughness: 0.95,
                  metalness: 0.0,
                });
                const meshMats = [wallMaterial, wallMaterial, mats.wallTop, wallMaterial, wallMaterial, wallMaterial];
                const fpvWallMesh = new THREE.InstancedMesh(wallGeo, meshMats, wallCount);
                fpvWallMesh.castShadow = false; // DISABLED TO RESTORE 60 FPS
                fpvWallMesh.receiveShadow = true;
                fpvWallMesh.frustumCulled = false;
                fpvWallMesh.layers.set(1); // Force FPV only

                const pipInstancedWalls = new THREE.InstancedMesh(wallGeo, pipWallMaterials, wallCount);
                pipInstancedWalls.frustumCulled = false;
                pipInstancedWalls.layers.set(3); // Force PiP only

                // Save references
                this.walls = [fpvWallMesh]; 
                
                // Build pure mathematical AABB boxes for perfect Raycasting fallback
                this.wallBoxes = [];
                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        if (this.mapData[x]?.[z]?.type === 'wall' && isExposed(x, z)) {
                            const minX = x * this.gridSize - (this.gridSize / 2);
                            const maxX = x * this.gridSize + (this.gridSize / 2);
                            const minZ = z * this.gridSize - (this.gridSize / 2);
                            const maxZ = z * this.gridSize + (this.gridSize / 2);
                            this.wallBoxes.push(new THREE.Box3(
                                new THREE.Vector3(minX, -1, minZ), // Floor overlap
                                new THREE.Vector3(maxX, wallHeight + 1, maxZ)
                            ));
                        }
                    }
                }

                const dummy = new THREE.Object3D();
                let pipWallIdx = 0;
                let fpvWallIdx = 0;

                for (let x = -PADDING; x < this.mapWidth + PADDING; x++) {
                    for (let z = -PADDING; z < this.mapHeight + PADDING; z++) {
                        const isMapArea = x >= 0 && x < this.mapWidth && z >= 0 && z < this.mapHeight;
                        const type = isMapArea ? this.mapData[x]?.[z]?.type : 'wall';

                        if (type === 'wall') {
                            dummy.position.set(x * this.gridSize, wallHeight / 2, z * this.gridSize);
                            dummy.updateMatrix();
                            
                            fpvWallMesh.setMatrixAt(fpvWallIdx, dummy.matrix);
                            pipInstancedWalls.setMatrixAt(pipWallIdx, dummy.matrix);
                            
                            fpvWallIdx++;
                            pipWallIdx++;
                        }
                    }
                }
                
                // Trim over-allocated instances and add to scene
                fpvWallMesh.count = fpvWallIdx;
                fpvWallMesh.instanceMatrix.needsUpdate = true;
                if (fpvWallMesh.count > 0) this.worldGroup.add(fpvWallMesh);
                
                pipInstancedWalls.count = pipWallIdx;
                pipInstancedWalls.instanceMatrix.needsUpdate = true;
                this.worldGroup.add(pipInstancedWalls);
                
                // --- 3. Rounded Wall Edge Fillets ("Dug Out" effect) ---
                // Removed per user request to maintain clean square corners without visual artifacts.
                
                // Ceiling
                ceilTex.repeat.set(this.mapWidth/2, this.mapHeight/2);
                const ceilGeo = new THREE.PlaneGeometry(this.mapWidth * this.gridSize, this.mapHeight * this.gridSize);
                const ceiling = new THREE.Mesh(ceilGeo, mats.ceil);
                ceiling.rotation.x = Math.PI / 2;
                // Match the wall height exactly
                ceiling.position.set((this.mapWidth * this.gridSize)/2 - this.gridSize/2, wallHeight, (this.mapHeight * this.gridSize)/2 - this.gridSize/2);
                ceiling.layers.set(2); // Layer 2: Exclusive FPV rendering, hid from map view
                this.worldGroup.add(ceiling);

                // Tactical Grid Floor: Instead of one massive plane, we use thick procedural tiles
                const depth = 0.001; // Eliminate massive floor edges to clean up the Isometric view
                
                // 1. Pattern Recognition Scanner for 3x3 Mega-Tiles
                const mergedCells = new Set();
                const megaTileCenters = [];
                let singleWalkCount = 0;
                
                for (let x = 0; x < this.mapWidth - 2; x++) {
                    for (let z = 0; z < this.mapHeight - 2; z++) {
                        let is3x3 = true;
                        // Check if 3x3 block is all floor/room and not already merged
                        for (let dx = 0; dx < 3; dx++) {
                            for (let dz = 0; dz < 3; dz++) {
                                const nx = x + dx;
                                const nz = z + dz;
                                const cell = this.mapData[nx]?.[nz];
                                if (!cell || cell.type === 'wall' || cell.type.startsWith('stairs') || mergedCells.has(`${nx},${nz}`)) {
                                    is3x3 = false;
                                    break;
                                }
                            }
                            if (!is3x3) break;
                        }
                        
                        if (is3x3) {
                            // Valid Mega-Tile! Register it.
                            megaTileCenters.push({ x: x + 1, z: z + 1 });
                            for (let dx = 0; dx < 3; dx++) {
                                for (let dz = 0; dz < 3; dz++) {
                                    mergedCells.add(`${x + dx},${z + dz}`);
                                }
                            }
                        }
                    }
                }
                
                // 2. Count remaining single tiles
                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        const cell = this.mapData[x]?.[z];
                        if (cell && cell.type !== 'wall' && !cell.type.startsWith('stairs') && !mergedCells.has(`${x},${z}`)) {
                            singleWalkCount++;
                        }
                    }
                }
                
                // 3. Build 1x1 InstancedFloor
                const floorBoxGeo = new THREE.BoxGeometry(this.gridSize * 1.0, depth, this.gridSize * 1.0);
                floorTex.repeat.set(1, 1);
                
                const instancedFloor = new THREE.InstancedMesh(floorBoxGeo, mats.floor, singleWalkCount > 0 ? singleWalkCount : 1);
                instancedFloor.receiveShadow = true; 
                instancedFloor.frustumCulled = true;
                
                let walkIdx = 0;
                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        if (mergedCells.has(`${x},${z}`)) continue;
                        const cell = this.mapData[x]?.[z];
                        if (!cell || cell.type === 'wall' || cell.type.startsWith('stairs')) continue;
                        
                        dummy.position.set(x * this.gridSize, -depth / 2, z * this.gridSize);
                        dummy.updateMatrix();
                        instancedFloor.setMatrixAt(walkIdx++, dummy.matrix);
                    }
                } // ADDED BACK THE MISSING CLOSING BRACE

                const mapCenter = new THREE.Vector3((this.mapWidth * this.gridSize) / 2, 0, (this.mapHeight * this.gridSize) / 2);
                const mapRadius = Math.max(this.mapWidth, this.mapHeight) * this.gridSize;

                if (singleWalkCount > 0) {
                    instancedFloor.instanceMatrix.needsUpdate = true;
                    floorBoxGeo.boundingSphere = new THREE.Sphere(mapCenter, mapRadius);
                    this.worldGroup.add(instancedFloor);
                }
                
                if (megaTileCenters.length > 0) {
                    const megaBoxGeo = new THREE.BoxGeometry(this.gridSize * 3.0, depth, this.gridSize * 3.0);
                    // Crucial: The floorLargeTex is now visually a 1x1 texture. 
                    // To maintain the 1x1 visual grid on a 3x3 plane, we must repeat it 3 times!
                    floorLargeTex.repeat.set(3, 3);
                    const instancedFloorLarge = new THREE.InstancedMesh(megaBoxGeo, mats.floorLarge, megaTileCenters.length);
                    instancedFloorLarge.receiveShadow = true;
                    instancedFloorLarge.frustumCulled = true;
                    
                    megaTileCenters.forEach((center, idx) => {
                        dummy.position.set(center.x * this.gridSize, -depth / 2, center.z * this.gridSize);
                        // Optional: rotate the mega-tile for variety if desired. Let's keep it aligned for now.
                        dummy.rotation.y = 0; 
                        dummy.updateMatrix();
                        instancedFloorLarge.setMatrixAt(idx, dummy.matrix);
                    });
                    
                    instancedFloorLarge.instanceMatrix.needsUpdate = true;
                    megaBoxGeo.boundingSphere = new THREE.Sphere(mapCenter, mapRadius);
                    this.worldGroup.add(instancedFloorLarge);
                }
                
                // --- ROOM NUMBERS & SPIDERWEBS ---
                if (this.rooms) {
                    this.rooms.forEach((room) => {
                        // Spiderwebs in room corners
                        if (room.w >= 2 && room.h >= 2 && Math.random() > 0.1) {
                            const webGeo = new THREE.PlaneGeometry(this.gridSize * 1.5, this.gridSize * 1.5);
                            const web = new THREE.Mesh(webGeo, mats.spiderweb);
                            
                            // Place in top-left corner of the room
                            const cornerX = room.x;
                            const cornerZ = room.y;
                            web.position.set(
                                cornerX * this.gridSize + (this.gridSize * 0.75),
                                wallHeight - 0.05, // Right below ceiling
                                cornerZ * this.gridSize + (this.gridSize * 0.75)
                            );
                            web.rotation.x = Math.PI / 2; // Flat against ceiling
                            web.layers.enable(0);
                            web.layers.enable(1);
                            
                            // Add a random slight rotation on Y axis to angle it into the corner occasionally
                            if (Math.random() > 0.5) {
                                web.rotation.y = Math.PI / 4;
                            }
                            this.worldGroup.add(web);
                        }

                        // Room ID decal
                        const canvas = document.createElement('canvas');
                        canvas.width = 256; canvas.height = 256;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Dark semi transparent large font
                        ctx.font = '900 140px "Impact", sans-serif';
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(room.id, 128, 128);
                        
                        const tex = new THREE.CanvasTexture(canvas);
                        const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false});
                        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.gridSize * 0.8, this.gridSize * 0.8), mat);
                        mesh.rotation.x = -Math.PI / 2;
                        mesh.position.set(room.center.x * this.gridSize, 0.05, room.center.y * this.gridSize);
                        this.worldGroup.add(mesh);
                    });
                }
                
                // --- PROCEDURAL PROPS: Furniture & Cobwebs ---
                const cobwebTex = this.createCobwebTexture();
                const cobwebMat = new THREE.MeshBasicMaterial({ map: cobwebTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });

                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        const cell = this.mapData[x]?.[z];
                        if (!cell) continue;
                        
                        if (cell.type === 'floor' || cell.type === 'entrance' || cell.hallway) {
                            const isRoom = cell.room;
                            const isHallway = cell.hallway;
                            
                            // 1. Broken Furniture
                            let addFurniture = false;
                            
                            // Check if next to a wall
                            let nextToWall = false;
                            for (let dx = -1; dx <= 1; dx++) {
                                for (let dz = -1; dz <= 1; dz++) {
                                    if (dx === 0 && dz === 0) continue;
                                    const neighbor = this.mapData[x + dx]?.[z + dz];
                                    if (neighbor && neighbor.type === 'wall') {
                                        nextToWall = true;
                                    }
                                }
                            }
                            
                            if (nextToWall) {
                                if (isRoom && Math.random() < 0.1) addFurniture = true; // Reduced from 0.5 to prevent 1000+ mesh draw call bottleneck
                                else if (isHallway && Math.random() < 0.05) addFurniture = true;
                            }
                            
                            if (addFurniture) {
                                const furn = this.createBrokenFurnitureMesh();
                                furn.position.set(x * this.gridSize + (Math.random()*0.6 - 0.3), 0, z * this.gridSize + (Math.random()*0.6 - 0.3));
                                furn.rotation.y = Math.random() * Math.PI * 2;
                                this.worldGroup.add(furn);
                            }
                            
                            // 2. 3D Volumetric Ceiling Corner Cobwebs (Top of room/hallway, randomly 20%)
                            if (Math.random() < 0.2) {
                                const webGeo = new THREE.PlaneGeometry(2.0, 2.0);
                                const web = new THREE.Mesh(webGeo, cobwebMat);
                                web.userData = { isDecor: true };
                                
                                // Position near a corner
                                const xOffset = (Math.random() > 0.5 ? 0.6 : -0.6);
                                const zOffset = (Math.random() > 0.5 ? 0.6 : -0.6);
                                web.position.set(x * this.gridSize + xOffset, wallHeight - 0.5, z * this.gridSize + zOffset);
                                
                                // Angle it at 45 degrees to span between wall and ceiling
                                web.rotation.order = 'YXZ';
                                web.rotation.y = Math.atan2(xOffset, zOffset) + Math.PI/4;
                                web.rotation.x = Math.PI / 4; 
                                web.layers.set(1); // FPV only
                                this.worldGroup.add(web);
                                
                                // Add a second overlapping one for a volumetric 3D feel
                                const web2 = new THREE.Mesh(webGeo, cobwebMat);
                                web2.position.copy(web.position);
                                web2.position.y -= 0.2;
                                web2.rotation.copy(web.rotation);
                                web2.rotation.y += Math.PI / 6;
                                web2.rotation.z += Math.PI / 8;
                                web2.layers.set(1);
                                this.worldGroup.add(web2);
                            }
                            
                            // 3. 3D Floor Corner Cobwebs (Bottom corners every 10%)
                            if (Math.random() < 0.1) {
                                const webGeo = new THREE.PlaneGeometry(1.5, 1.5);
                                const web = new THREE.Mesh(webGeo, cobwebMat);
                                web.userData = { isDecor: true };
                                
                                const xOffset = (Math.random() > 0.5 ? 0.6 : -0.6);
                                const zOffset = (Math.random() > 0.5 ? 0.6 : -0.6);
                                web.position.set(x * this.gridSize + xOffset, 0.5, z * this.gridSize + zOffset);
                                
                                web.rotation.order = 'YXZ';
                                web.rotation.y = Math.atan2(xOffset, zOffset) + Math.PI/4;
                                web.rotation.x = -Math.PI / 4; // Angle up from floor to wall
                                web.layers.set(1); // FPV only
                                this.worldGroup.add(web);
                            }
                        }
                    }
                }
                
                // --- 2.6 Build Stairways ---
                const stairGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
                const stairUpMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 });
                const stairDownMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 });

                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        const cell = this.mapData[x]?.[z];
                        if (!cell) continue;

                        if (cell.type === 'stairs_up' || cell.type === 'stairs_down') {
                            const stair = new THREE.Group();
                            const isUp = cell.type === 'stairs_up';
                            
                            if (!isUp) {
                                // Deep black void at the bottom of the stairwell
                                const pitDepth = 1.8;
                                const pit = new THREE.Mesh(new THREE.PlaneGeometry(this.gridSize, this.gridSize), new THREE.MeshBasicMaterial({color: 0x000000, depthWrite: false}));
                                pit.rotation.x = -Math.PI / 2;
                                pit.position.y = -pitDepth + 0.1;
                                stair.add(pit);
                                
                                // Walls of the pit to connect the floor to the void
                                const pitWallGeo = new THREE.BoxGeometry(this.gridSize, pitDepth, this.gridSize);
                                const pitWall = new THREE.Mesh(pitWallGeo, new THREE.MeshStandardMaterial({color: 0x1a1110, roughness: 1.0}));
                                pitWall.position.y = -pitDepth / 2;
                                pitWall.material.side = THREE.BackSide; // Render the inside walls
                                stair.add(pitWall);

                                // Dark brown realistic steps
                                const numSteps = 8;
                                const stepHeight = pitDepth / numSteps;
                                const stepDepth = this.gridSize / numSteps;
                                const stairMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.95, flatShading: true });
                                
                                for(let s=0; s<numSteps; s++) {
                                    // Add slight overlap and variation to make it look realistic
                                    const step = new THREE.Mesh(new THREE.BoxGeometry(this.gridSize * 0.95, stepHeight, stepDepth * 1.2), stairMat);
                                    
                                    step.position.set(
                                        0, 
                                        -(s * stepHeight) - (stepHeight/2), 
                                        (this.gridSize/2) - (s * stepDepth) - (stepDepth/2)
                                    );
                                    stair.add(step);
                                }
                            } else {
                                // Stairs going UP to a black door leading to infinity
                                const stairHeight = 1.8;
                                
                                // Black door (infinity look) at the top back of the stairs
                                const doorGeo = new THREE.PlaneGeometry(this.gridSize * 0.8, stairHeight * 1.5);
                                const doorMat = new THREE.MeshBasicMaterial({color: 0x000000, depthWrite: false});
                                const door = new THREE.Mesh(doorGeo, doorMat);
                                // Position at the very back of the stairwell, raised up
                                door.position.set(0, stairHeight * 0.5, -this.gridSize/2 + 0.1);
                                stair.add(door);
                                
                                const numSteps = 8;
                                const stepHeight = stairHeight / numSteps;
                                const stepDepth = this.gridSize / numSteps;
                                // Dark stone stairs
                                const stairMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, flatShading: true });
                                
                                for(let s=0; s<numSteps; s++) {
                                    const step = new THREE.Mesh(new THREE.BoxGeometry(this.gridSize * 0.95, stepHeight, stepDepth * 1.2), stairMat);
                                    
                                    step.position.set(
                                        0, 
                                        (s * stepHeight) + (stepHeight/2), 
                                        (this.gridSize/2) - (s * stepDepth) - (stepDepth/2)
                                    );
                                    stair.add(step);
                                }
                            }
                            
                            stair.position.set(x * this.gridSize, 0, z * this.gridSize);
                            // Rotate stairs up so they lead OUT of the hallway
                            if (isUp) {
                                stair.rotation.y = Math.PI; 
                            }
                            stair.userData = { type: cell.type, gridX: x, gridZ: z };
                            this.worldGroup.add(stair);
                        }
                    }
                }

                
                // Abyssal Depth Plane (Map View only)
                const abyssGeo = new THREE.PlaneGeometry(this.mapWidth * this.gridSize * 3, this.mapHeight * this.gridSize * 3);
                // Creating a deep space indigo shade beneath the floor void mapping
                const abyssMat = new THREE.MeshBasicMaterial({ color: 0x050014, depthWrite: false }); 
                const abyssPlane = new THREE.Mesh(abyssGeo, abyssMat);
                abyssPlane.rotation.x = -Math.PI / 2;
                abyssPlane.position.y = -50; 
                abyssPlane.layers.set(2); // Exclusive to the PiP camera!
                this.worldGroup.add(abyssPlane);
                // Removed FOW as per request                // Dynamic Mob Rendering
                const mobGeo = new THREE.BoxGeometry(1, 2, 1);
                let monCount = 0; let npcCount = 0;
                
                const buildEntity = (sp, isMon, mesh) => {
                    const id = isMon ? `mon_${++monCount}` : `npc_${++npcCount}`;
                    sp.id = id; // Keep track of ID to send to AI worker
                    
                    // Preserve existing userData (like mixer, actions from GLTFLoader)
                    mesh.userData = {
                        ...(mesh.userData || {}),
                        id, 
                        name: sp.name || (isMon ? 'Yakuza Goblin' : 'Yakuza Gambler'),
                        type: isMon ? 'enemy' : 'gambler', 
                        hp: sp.hp ?? 50, 
                        maxHp: sp.maxHp ?? 50,
                        weapon: isMon ? ["Rusty Cleaver", "Broken Katana", "Iron Pipe", "Serrated Dagger", "Jagged Axe", "Yakuza Tanto", "Heavy Club"][Math.floor(Math.random() * 7)] : "Fists"
                    };
                    
                    if (isMon) {
                        // Force full scale enemy 3D models EXCLUSIVELY into Layer 1 (FPV), so they don't block the Map View
                        mesh.traverse(c => { c.layers.set(1); });
                        
                        // Give Goblin a tactical footprint
                        const monBase = new THREE.Group();
                        monBase.name = "monBase";
                        
                        // Tactical Monster Light Source (Black/Off initially)
                        const monLight = new THREE.PointLight(0x000000, 1.0, 5.0);
                        monLight.position.set(0, 1.5, 0); // Above the monster
                        monLight.layers.enable(0);
                        monLight.layers.enable(1);
                        monLight.layers.enable(3);
                        monBase.add(monLight);
                        
                        // --- Toy-like Photo Realistic Base (Matte Plastic Decal) ---
                        
                        // FPV Realistic Black Core (Idle)
                        const fpvBaseGeo = new THREE.CircleGeometry(0.80, 64);
                        const fpvBaseMat = new THREE.MeshStandardMaterial({ 
                            color: 0x000000, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide
                        });
                        const fpvBaseMesh = new THREE.Mesh(fpvBaseGeo, fpvBaseMat);
                        fpvBaseMesh.rotation.x = -Math.PI / 2;
                        fpvBaseMesh.position.y = 0.01; // Flush with floor
                        fpvBaseMesh.layers.enable(0);
                        fpvBaseMesh.layers.enable(1);
                        fpvBaseMesh.layers.enable(3);
                        fpvBaseMesh.castShadow = false; // Decal shouldn't cast shadow
                        fpvBaseMesh.receiveShadow = true;
                        
                        // Flat Light Grey Border (Outer Ring)
                        const fpvBorderGeo = new THREE.RingGeometry(0.80, 0.95, 64);
                        const fpvBorderMat = new THREE.MeshStandardMaterial({
                            color: 0xdcdcdc, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide
                        });
                        const fpvBorderMesh = new THREE.Mesh(fpvBorderGeo, fpvBorderMat);
                        fpvBorderMesh.position.z = 0.001; // Slightly above core to prevent z-fighting
                        fpvBorderMesh.layers.enable(0);
                        fpvBorderMesh.layers.enable(1);
                        fpvBorderMesh.layers.enable(3);
                        fpvBorderMesh.receiveShadow = true;
                        fpvBaseMesh.add(fpvBorderMesh);
                        
                        // Facing Indicator (Grey Wedge)
                        const arrowGeo = new THREE.ConeGeometry(0.15, 0.35, 3);
                        const arrowMat = new THREE.MeshStandardMaterial({
                            color: 0xdcdcdc, metalness: 0.05, roughness: 0.9
                        });
                        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
                        // Parent is rotated -90 on X. To point +Z world, arrow must point -Y local.
                        // Cone naturally points +Y. We rotate it 180 on X.
                        arrowMesh.rotation.x = Math.PI; 
                        // Local Z is now world UP. Local Y is world -Z.
                        arrowMesh.position.set(0, -0.95, 0.001); 
                        arrowMesh.layers.enable(0);
                        arrowMesh.layers.enable(1);
                        arrowMesh.layers.enable(3);
                        arrowMesh.receiveShadow = true;
                        fpvBaseMesh.add(arrowMesh);
                        
                        // We store references so the combat script can flash/color them
                        mesh.userData.fpvBorderMesh = fpvBorderMesh;
                        mesh.userData.mapBorderMesh = fpvBorderMesh; // Fallback for Core.js coloring
                        monBase.add(fpvBaseMesh);
                        mesh.userData.monBaseFpvCore = fpvBaseMesh;
                        
                        // Keep monBase flat on floor by avoiding parenting to floating mesh
                        this.worldGroup.add(monBase);
                        mesh.userData.monBase = monBase;

                        // Goblins have bottom origins, place flush with floor
                        mesh.position.set(sp.x * this.gridSize, 0, sp.z * this.gridSize);
                        

                        this.testMonster = mesh;
                    } else {
                        // NPC boxes are centered, place at y=1
                        mesh.position.set(sp.x * this.gridSize, 1, sp.z * this.gridSize);
                        this.testNPC = mesh;
                    }

                    this.worldGroup.add(mesh);
                };

                // Load replacement monster model directly from user's remote GitHub repository
                const TARGET_ENEMY_MODEL = './assets/models/monster/goblin/new-goblin-animate.glb';
                
                const gltfLoader = new THREE.GLTFLoader();
                gltfLoader.setCrossOrigin?.('anonymous');

                // Generate Ethereal Cinematic Mist Texture
                const mistCanvas = document.createElement('canvas');
                mistCanvas.width = 128; mistCanvas.height = 128;
                const mCtx = mistCanvas.getContext('2d');
                const mGrad = mCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
                mGrad.addColorStop(0, 'rgba(80, 200, 255, 0.6)');
                mGrad.addColorStop(0.3, 'rgba(60, 150, 255, 0.2)');
                mGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                mCtx.fillStyle = mGrad;
                mCtx.fillRect(0, 0, 128, 128);
                const mistTex = new THREE.CanvasTexture(mistCanvas);

                // Preload Flanking Imps
                this.impCache = [];
                for (let i = 0; i < 2; i++) {
                    gltfLoader.load('./assets/models/monster/imp/yakuza.imp.animated.glb', (gltf) => {
                        this.impCache.push(gltf);
                    });
                }

                this.mobSpawns.forEach((sp, idx) => {
                    // Preserve NPC/gambler type - only default to 'monster' if not explicitly set
                    if (!sp.type || sp.type === 'goblin') sp.type = 'monster';
                    
                    let targetModel = TARGET_ENEMY_MODEL;
                    if (sp.model === 'shopkeeper') {
                        targetModel = './assets/models/monster/ninjas/Ninja.Skeleton.glb';
                    }
                    
                    gltfLoader.load(targetModel, (gltf) => {
                        // We use the raw scene directly since each spawn gets its own 'load' call (cached by browser)
                        const goblin = gltf.scene;
                        const entityWrapper = new THREE.Group();
                        entityWrapper.add(goblin);
                        
                        if (sp.model === 'shopkeeper') {
                            // Add 3D Apron to the Skeleton
                            const apronGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 16, 1, true, -Math.PI / 2, Math.PI);
                            const apronMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
                            const apronMesh = new THREE.Mesh(apronGeo, apronMat);
                            apronMesh.position.set(0, 0.8, 0); // Position around the torso
                            goblin.add(apronMesh);
                        }
                        
                        
                        // Initialize Animation Pipeline — AI-driven state machine
                        if (gltf.animations && gltf.animations.length > 0) {
                            const mixer = new THREE.AnimationMixer(goblin);
                            const actions = gltf.animations.map(a => mixer.clipAction(a));
                            this.mixers.push(mixer);
                            entityWrapper.userData.mixer = mixer;
                            entityWrapper.userData.clips  = gltf.animations;
                            entityWrapper.userData.actions = actions;

                            // Resolve named clips — walk/run, idle, attack/slash
                            const _findClip = (rx) => gltf.animations.find(a => rx.test(a.name.toLowerCase()));
                            console.log("YAKUZA GOBLIN ANIMATIONS:", gltf.animations.map(a => a.name));
                            const idleClip   = _findClip(/idle/) || gltf.animations[1] || gltf.animations[0];
                            const walkClip   = _findClip(/walk|run|move/) || gltf.animations[0];
                            const slashClip  = _findClip(/slash/) || _findClip(/attack|strike|swing/) || gltf.animations[3] || gltf.animations[2] || gltf.animations[0];
                            const bowClip    = _findClip(/bow|death|die/) || gltf.animations[4] || gltf.animations[0];
                            
                            entityWrapper.userData.idleAction   = mixer.clipAction(idleClip);
                            entityWrapper.userData.walkAction   = mixer.clipAction(walkClip);
                            entityWrapper.userData.attackAction = mixer.clipAction(slashClip);
                            entityWrapper.userData.slashAction  = mixer.clipAction(slashClip); // Alias for Combat.js and Core.js
                            entityWrapper.userData.bowAction    = mixer.clipAction(bowClip);
                            entityWrapper.userData._animKey     = null; // tracks current active state

                            // Boot into idle loop
                            const idleAct = entityWrapper.userData.idleAction;
                            if (idleAct) { idleAct.reset(); idleAct.setLoop(THREE.LoopRepeat); idleAct.play(); }
                            entityWrapper.userData._animKey = 'idle';
                        }
                        
                        
                        goblin.traverse((child) => {
                            if (child.isMesh) {
                                const nativeMat = child.material;
                                const matName = nativeMat.name ? nativeMat.name.toLowerCase() : "";
                                const meshName = child.name ? child.name.toLowerCase() : "";
                                
                                const eyeKeywords = ['eye', 'pupil', 'sclera', 'cornea', 'lens', 'iris'];
                                const isEye = eyeKeywords.some(kw => matName.includes(kw) || meshName.includes(kw));
                                
                                // Skip applying hologram transparency and neon color logic to the white eyes
                                if (!isEye) {
                                  // Apply neon cyan/green hologram rules directly to native material to preserve vertex colors and maps
                                  const applyHoloLayer = (mat) => {
                                    mat.transparent = true; // Spectral ghost
                                    mat.opacity = 0.72; // More opaque — solid enough to be scary
                                    mat.blending = THREE.NormalBlending;
                                    mat.side = THREE.FrontSide;
                                    mat.depthWrite = false;
                                    if (mat.roughness !== undefined)
                                      mat.roughness = 1.0; // Fully matte — no plastic sheen
                                    if (mat.metalness !== undefined)
                                      mat.metalness = 0.0;

                                    // Deep jade-shadow ghost tint — spooky, not 90s cartoon
                                    if (mat.emissive !== undefined) {
                                      mat.emissive.set("#0a2218");
                                      mat.emissiveIntensity = 0.2;
                                    }

                                    // Custom Shader Injection: Isolate bright white texture regions (the eyes) from being tinted by the hologram!
                                    mat.onBeforeCompile = (shader) => {
                                      shader.fragmentShader =
                                        shader.fragmentShader.replace(
                                          "#include <emissivemap_fragment>",
                                          [
                                            "#ifdef USE_EMISSIVEMAP",
                                            "    vec4 emissiveMapColor = texture2D( emissiveMap, vUv );",
                                            "    totalEmissiveRadiance *= emissiveMapColor.rgb;",
                                            "#endif",
                                            "// Check the brightness of the base texture map",
                                            "float baseBrightness = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));",
                                            "if (baseBrightness > 0.65) {",
                                            "    totalEmissiveRadiance = vec3(2.0); // Extreme white emissive override",
                                            "    diffuseColor.rgb = vec3(0.0); // Zero out diffuse so red lights cannot reflect off it",
                                            "}",
                                          ].join("\n"),
                                        );
                                    };
                                  };

                                  if (Array.isArray(nativeMat)) {
                                    nativeMat.forEach(applyHoloLayer);
                                  } else {
                                    applyHoloLayer(nativeMat);
                                  }

                                  child.material = nativeMat;
                                } else {
                                    // preserve original white eye texture, removing all reflective properties by using unlit Basic material
                                    child.material = new THREE.MeshBasicMaterial({ color: 0xffffff, skinning: true });
                                }
                                
                                child.castShadow = false; // Disabled to restore 120 FPS
                                child.receiveShadow = true;
                                
                                // Fix Z-Index sorting issue against the red targeting circle
                                child.renderOrder = 10; 
                            }
                        });

                        // Local Ghost PointLight removed to eliminate volumetric scatter haze and whitewashing
                        
                        // Scale model to 1.53 world units (reduced by 15% from 1.8)
                        this.scaleModelToHeight(goblin, 1.53);
                        
                        // Adjust Y position to sit exactly on the floor (circle)
                        goblin.updateMatrixWorld(true);
                        const bbox = new THREE.Box3().setFromObject(goblin);
                        if (bbox.min.y !== 0) {
                            goblin.position.y -= bbox.min.y; 
                        }
                        
                        // Fix Rotation: Force to -Math.PI/2 to swing from 90 degrees Left to 90 degrees Right (facing player)
                        goblin.rotation.y = -Math.PI / 2;
                        
                        // Outline pass assignment moved to checkTriggers dynamically based on proximity
                        

                        buildEntity(sp, true, entityWrapper);
                    }, undefined, (primaryErr) => {
                        console.warn(`Primary local load blocked (CORS/file:// expected). Trying alternate local path...`, primaryErr?.message);
                        gltfLoader.load('./assets/models/monster/goblin/YakuzaGoblinGhost.2.glb', (fallbackGltf) => {
                            const goblin = fallbackGltf.scene;
                            const entityWrapper = new THREE.Group();
                            entityWrapper.add(goblin);
                            
                            // Apply full animation pipeline (same as primary load)
                            if (fallbackGltf.animations && fallbackGltf.animations.length > 0) {
                                const mixer = new THREE.AnimationMixer(goblin);
                                const actions = fallbackGltf.animations.map(a => mixer.clipAction(a));
                                this.mixers.push(mixer);
                                entityWrapper.userData.mixer   = mixer;
                                entityWrapper.userData.clips   = fallbackGltf.animations;
                                entityWrapper.userData.actions = actions;

                                const _fc = (rx) => fallbackGltf.animations.find(a => rx.test(a.name.toLowerCase()));
                                const idleClip  = _fc(/idle/)  || fallbackGltf.animations[0];
                                const walkClip  = _fc(/walk|run|move/) || fallbackGltf.animations[1] || fallbackGltf.animations[0];
                                const slashClip = _fc(/slash/) || _fc(/attack|strike|swing/);

                                entityWrapper.userData.idleAction   = idleClip  ? mixer.clipAction(idleClip)  : actions[0];
                                entityWrapper.userData.walkAction   = walkClip  ? mixer.clipAction(walkClip)  : actions[0];
                                entityWrapper.userData.attackAction = slashClip ? mixer.clipAction(slashClip) : (actions[1] || actions[0]);
                                entityWrapper.userData._animKey     = null;

                                const idleAct = entityWrapper.userData.idleAction;
                                if (idleAct) { idleAct.reset(); idleAct.setLoop(THREE.LoopRepeat); idleAct.play(); }
                                entityWrapper.userData._animKey = 'idle';
                            }
                            
                            // Apply hologram shader (same as primary load)
                            goblin.traverse((child) => {
                                if (child.isMesh) {
                                    const nativeMat = child.material;
                                    const applyHoloLayer = (mat) => {
                                        mat.transparent = true; mat.opacity = 0.55;
                                        mat.blending = THREE.NormalBlending; mat.side = THREE.FrontSide; mat.depthWrite = false;
                                        if (mat.roughness !== undefined) mat.roughness = 0.95; // Force high roughness
                                        if (mat.metalness !== undefined) mat.metalness = 0.05; // Force low metalness
                                        if (mat.emissive !== undefined) { mat.emissive.set('#00ffcc'); mat.emissiveIntensity = 0.5; }
                                    };
                                    if (Array.isArray(nativeMat)) nativeMat.forEach(applyHoloLayer); else applyHoloLayer(nativeMat);
                                    child.renderOrder = 10;
                                }
                            });
                            
                            const frontLight = new THREE.PointLight(0xffffff, 4.0, this.gridSize * 1.5);
                            frontLight.position.set(0, 2.5, 1.5);
                            goblin.add(frontLight);
                            
                            // Scale to 1.53 world units before floor-align (reduced by 15%)
                            this.scaleModelToHeight(goblin, 1.53);
                            goblin.updateMatrixWorld(true);
                            const bbox = new THREE.Box3().setFromObject(goblin);
                            if (bbox.min.y !== 0) goblin.position.y -= bbox.min.y;
                            goblin.rotation.y = -Math.PI / 2;
                            
                            buildEntity(sp, true, entityWrapper);
                        }, undefined, (fallbackErr) => {
                            console.warn('CDN also failed. Using BoxGeometry placeholder.', fallbackErr?.message);
                            const mesh = new THREE.Mesh(mobGeo, mats.monster);
                            buildEntity(sp, true, mesh);
                        });
                    });
                });

                this.scene.add(this.worldGroup);
                
                // Spawn high-fidelity UI-replica 3D cards in hallway
                if (this.entrancePos) {
                  this.spawnLootCard = (
                    x,
                    z,
                    catId,
                    inTitle,
                    desc,
                    kanji,
                    attr,
                    isShopItem = false,
                    price = 50,
                  ) => {
                    let originalTitle = inTitle;
                    let masterCard = null;
                    if (window.OrigamiCards) {
                      masterCard = window.OrigamiCards.find(
                        (c) => c.name === originalTitle,
                      );
                    }

                    let displayKanji = masterCard ? masterCard.kanji : kanji;
                    let displayDesc = masterCard ? masterCard.desc : desc;
                    let displayAttr = masterCard ? masterCard.attr : attr;
                    let displayTypePill = masterCard
                      ? masterCard.type.toUpperCase()
                      : catId.toUpperCase();
                    let elId = masterCard ? masterCard.el : catId;

                    let title = inTitle;
                    let qty = 1;
                    if (title === "SHURIKEN") {
                      qty = Math.floor(Math.random() * 6) + 3; // 3 to 8
                      title = `SHURIKEN x${qty}`;
                    } else if (title === "LONG BOW") {
                      qty = Math.floor(Math.random() * 9) + 7; // 7 to 15 arrows
                      title = `LONG BOW x${qty}`;
                    } else if (title === "SHORT BOW") {
                      qty = Math.floor(Math.random() * 8) + 5; // 5 to 12 arrows
                      title = `SHORT BOW x${qty}`;
                    }

                    const W = 256;
                    const H = 384;
                    const canvas = document.createElement("canvas");
                    canvas.width = W;
                    canvas.height = H;
                    const ctx = canvas.getContext("2d");

                    // Base dark background (exactly matching dark-mode CSS)
                    let baseColor = "#232527";
                    let themeColor = "#66BB6A"; // Default Item

                    // Exact CSS var mapping for accents ONLY
                    if (catId === "WIND" || catId === "SPELL")
                      themeColor = "#b0bec5";
                    else if (elId === "EARTH") themeColor = "#5C4033";
                    else if (
                      catId === "ITEM" ||
                      catId === "SHIELD" ||
                      catId === "DEFEND"
                    )
                      themeColor = "#5c6bc0";
                    else if (catId === "WATER" || catId === "THRUST")
                      themeColor = "#0d6efd";
                    else if (
                      catId === "FIRE" ||
                      catId === "SLASH" ||
                      catId === "KATANA"
                    )
                      themeColor = "#ef5350";
                    else if (catId === "MISSILE") themeColor = "#ab47bc";
                    else if (catId === "GOLD_COIN") themeColor = "#b8860b";
                    else themeColor = "#66bb6a"; // SCROLL

                    ctx.fillStyle = baseColor;
                    ctx.beginPath();
                    ctx.roundRect(0, 0, W, H, 24);
                    ctx.fill();

                    // Thin element color outer border (inset 1px to prevent corner tearing at canvas edge)
                    ctx.strokeStyle = themeColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(1, 1, W - 2, H - 2, 23);
                    ctx.stroke();

                    // Clean inner border for 3D playing card look
                    ctx.strokeStyle = "rgba(255,255,255,0.02)";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(2, 2, W - 4, H - 4, 22);
                    ctx.stroke();

                    // Kanji (Theme Colored)
                    ctx.font = "900 32px sans-serif";
                    ctx.fillStyle = themeColor;
                    ctx.textAlign = "left";
                    ctx.textBaseline = "top";
                    ctx.fillText(displayKanji, 20, 20);

                    // Type Pill (Theme Colored string background / border)
                    ctx.fillStyle = themeColor;
                    ctx.beginPath();
                    ctx.roundRect(W / 2 - 45, 20, 90, 30, 8);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.2)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.font = "800 16px sans-serif";
                    ctx.fillStyle =
                      catId === "GOLD_COIN" ? "#000000" : "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(
                      catId === "GOLD_COIN" ? "GOLD" : displayTypePill,
                      W / 2,
                      35,
                    );

                    // Title (Auto-scaling to prevent overflow)
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    let titleSize = 32;
                    ctx.font = `900 ${titleSize}px sans-serif`;
                    while (
                      ctx.measureText(title).width > W * 0.85 &&
                      titleSize > 12
                    ) {
                      titleSize -= 1;
                      ctx.font = `900 ${titleSize}px sans-serif`;
                    }
                    ctx.fillText(title, W / 2, 90);

                    // Desc
                    ctx.font = "500 18px sans-serif";
                    ctx.fillStyle = "#999999";
                    function wrapText(
                      context,
                      text,
                      x,
                      y,
                      maxWidth,
                      lineHeight,
                    ) {
                      const words = text.split(" ");
                      let line = "";
                      for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + " ";
                        const metrics = context.measureText(testLine);
                        const testWidth = metrics.width;
                        if (testWidth > maxWidth && n > 0) {
                          context.fillText(line, x, y);
                          line = words[n] + " ";
                          y += lineHeight;
                        } else {
                          line = testLine;
                        }
                      }
                      context.fillText(line, x, y);
                    }
                    wrapText(ctx, displayDesc, W / 2, 130, W * 0.8, 22);

                    // [PLAYING CARD CACHE] Save clean canvas state before punching physical hole
                    const cleanCardURL = canvas.toDataURL();

                    // Deep Icon Cavity (Porthole) Hole Cutout
                    ctx.save();
                    ctx.globalCompositeOperation = "destination-out";
                    ctx.beginPath();
                    ctx.arc(W / 2, H * 0.58, 60, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Inner Shadow for the hole
                    const holeGrad = ctx.createRadialGradient(
                      W / 2,
                      H * 0.58,
                      45,
                      W / 2,
                      H * 0.58,
                      60,
                    );
                    holeGrad.addColorStop(0, "rgba(0,0,0,0)");
                    holeGrad.addColorStop(1, "rgba(0,0,0,0.9)");
                    ctx.fillStyle = holeGrad;
                    ctx.beginPath();
                    ctx.arc(W / 2, H * 0.58, 60, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = "rgba(255,255,255,0.05)";
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    // We do not draw the 2D geo symbols anymore, we'll attach real 3D models!

                    // Solid Black Bottom Block for Attributes (no separator line)
                    ctx.fillStyle = "rgba(10, 10, 12, 0.8)";
                    ctx.beginPath();
                    ctx.roundRect(1, H - 50, W - 2, 49, [0, 0, 23, 23]);
                    ctx.fill();

                    // Attr inside black block
                    ctx.font = "800 18px sans-serif";
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    wrapText(ctx, displayAttr, W / 2, H - 25, W * 0.9, 22);

                    if (isShopItem) {
                      ctx.font = "900 24px sans-serif";
                      ctx.fillStyle = "#FFD700"; // Gold
                      ctx.fillText(price + " Gold", W / 2, H - 15);
                    }

                    const tex = new THREE.CanvasTexture(canvas);
                    // Upgrade to Physical Material for a glossy "plastic sleeve" look
                    // Added emissive property to prevent need for PointLight shader recompilation
                    const cardMat = new THREE.MeshPhysicalMaterial({
                      map: tex,
                      transparent: true,
                      alphaTest: 0.5,
                      roughness: 0.5,
                      metalness: 0.1,
                      clearcoat: 1.0,
                      clearcoatRoughness: 0.2,
                      ior: 1.5,
                      emissive: 0x222222,
                      emissiveMap: tex,
                      emissiveIntensity: 0.8,
                    });

                    // We use a Group to hold a Front and Back face, effectively creating a "solid" but ultra-thin card
                    const cardGroup = new THREE.Group();

                    const edgeColor =
                      {
                        EARTH: 0x5c4033,
                        WATER: 0x0d6efd,
                        FIRE: 0xb71c1c,
                        WIND: 0x37474f,
                        SCROLL: 0x1b5e20,
                        GOLD_COIN: 0xffd700,
                      }[elId] || 0x444444;
                    const edgeMat = new THREE.MeshStandardMaterial({
                      color: edgeColor,
                      roughness: catId === "GOLD_COIN" ? 0.2 : 0.5,
                      metalness: catId === "GOLD_COIN" ? 1.0 : 0.0,
                    });

                    const shape = new THREE.Shape();
                    const r = 0.075;
                    const w = 0.8,
                      h = 1.2;
                    const sx = -w / 2,
                      sy = -h / 2;
                    shape.moveTo(sx, sy + r);
                    shape.lineTo(sx, sy + h - r);
                    shape.quadraticCurveTo(sx, sy + h, sx + r, sy + h);
                    shape.lineTo(sx + w - r, sy + h);
                    shape.quadraticCurveTo(sx + w, sy + h, sx + w, sy + h - r);
                    shape.lineTo(sx + w, sy + r);
                    shape.quadraticCurveTo(sx + w, sy, sx + w - r, sy);
                    shape.lineTo(sx + r, sy);
                    shape.quadraticCurveTo(sx, sy, sx, sy + r);

                    const holePath = new THREE.Path();
                    holePath.absarc(0, -0.096, 0.1875, 0, Math.PI * 2, true);
                    shape.holes.push(holePath);

                    const extrudeSettings = {
                      depth: 0.02,
                      bevelEnabled: false,
                    };
                    const edgeGeo = new THREE.ExtrudeGeometry(
                      shape,
                      extrudeSettings,
                    );
                    edgeGeo.translate(0, 0, -0.01);

                    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
                    cardGroup.add(edgeMesh);

                    const frontMesh = new THREE.Mesh(
                      new THREE.PlaneGeometry(0.8, 1.2),
                      cardMat,
                    );
                    frontMesh.position.z = 0.011;

                    const backMesh = new THREE.Mesh(
                      new THREE.PlaneGeometry(0.8, 1.2),
                      cardMat,
                    );
                    backMesh.rotation.y = Math.PI;
                    backMesh.position.z = -0.011;

                    cardGroup.add(frontMesh);
                    cardGroup.add(backMesh);

                    // Add real 3D Model matching the UI panels
                    const createLootIcon = () => {
                      let iconMesh = new THREE.Group();
                      let customUpdate = null;
                      const matColor =
                        {
                          EARTH: 0x5c4033,
                          WATER: 0x0d6efd,
                          FIRE: 0xb71c1c,
                          WIND: 0x37474f,
                          SCROLL: 0x1b5e20,
                        }[catId] || 0x444444;
                      const mat = new THREE.MeshStandardMaterial({
                        color: matColor,
                        roughness: 0.15,
                        metalness: 0.4,
                        flatShading: true,
                        side: THREE.DoubleSide,
                      });

                      if (originalTitle === "MAGIC LANTERN") {
                        const bodyGeo = new THREE.CylinderGeometry(
                          0.1,
                          0.1,
                          0.6,
                          16,
                        );
                        const bodyMat = new THREE.MeshStandardMaterial({
                          color: 0x111111,
                          metalness: 0.8,
                          roughness: 0.2,
                        });
                        const flashlight = new THREE.Mesh(bodyGeo, bodyMat);
                        flashlight.position.y = -0.1;

                        const headGeo = new THREE.CylinderGeometry(
                          0.18,
                          0.1,
                          0.25,
                          16,
                        );
                        const headMat = new THREE.MeshStandardMaterial({
                          color: 0x222222,
                          metalness: 0.9,
                          roughness: 0.1,
                        });
                        const head = new THREE.Mesh(headGeo, headMat);
                        head.position.y = 0.42;
                        flashlight.add(head);

                        const lensGeo = new THREE.CylinderGeometry(
                          0.16,
                          0.16,
                          0.05,
                          16,
                        );
                        const lensMat = new THREE.MeshStandardMaterial({
                          color: 0xffffff,
                          emissive: 0xffffee,
                          emissiveIntensity: 2.0,
                        });
                        const lens = new THREE.Mesh(lensGeo, lensMat);
                        lens.position.y = 0.13;
                        head.add(lens);

                        iconMesh.add(flashlight);

                        const lanternLight = new THREE.PointLight(
                          0xfff5e0,
                          2.0,
                          10,
                        );
                        lanternLight.position.set(0, 1, 1.5);
                        iconMesh.add(lanternLight);
                        customUpdate = (t, meshInstance) => {
                          meshInstance.rotation.x = Math.sin(t * 1.5) * 0.1;
                          meshInstance.rotation.y = t * 1.0;
                          meshInstance.rotation.z = Math.PI / 4; // slanted
                        };
                      } else if (elId === "EARTH") {
                        const rockMat = new THREE.MeshStandardMaterial({
                          color: 0x5c4033,
                          roughness: 0.8,
                          flatShading: true,
                        });
                        const rock = new THREE.Mesh(
                          new THREE.DodecahedronGeometry(1.6, 2),
                          rockMat,
                        );
                        iconMesh.add(rock);
                        customUpdate = (t, meshInstance) => {
                          rock.rotation.x = t * 1.8;
                          rock.position.y = Math.abs(Math.sin(t * 3)) * 1.2;
                        };
                      } else if (elId === "FIRE") {
                        const core = new THREE.Mesh(
                          new THREE.IcosahedronGeometry(0.85, 1),
                          new THREE.MeshStandardMaterial({
                            color: 0xb71c1c,
                            emissive: 0x4a0000,
                            emissiveIntensity: 3,
                            flatShading: true,
                          }),
                        );
                        iconMesh.add(core);
                        const flames = [];
                        for (let i = 0; i < 60; i++) {
                          const s = new THREE.Mesh(
                            new THREE.TetrahedronGeometry(0.28, 0),
                            new THREE.MeshStandardMaterial({
                              color:
                                i % 3 === 0
                                  ? 0xffea00
                                  : i % 2 === 0
                                    ? 0xff4500
                                    : 0xb71c1c,
                              emissive: i % 3 === 0 ? 0xffea00 : 0xff4500,
                              emissiveIntensity: 2.5,
                              transparent: true,
                              opacity: 0.9,
                              depthWrite: false,
                              blending: THREE.AdditiveBlending,
                              flatShading: true,
                            }),
                          );
                          const ang = (i / 60) * Math.PI * 2,
                            rad = 0.2 + Math.random() * 0.45;
                          s.position.set(
                            Math.cos(ang) * rad,
                            0.3,
                            Math.sin(ang) * rad,
                          );
                          iconMesh.add(s);
                          flames.push({
                            m: s,
                            s: 3 + Math.random() * 6,
                            o: Math.random() * Math.PI,
                            rs: (Math.random() - 0.5) * 2,
                          });
                        }
                        customUpdate = (t, meshInstance) => {
                          core.rotation.y = t * 0.25;
                          core.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
                          flames.forEach((f) => {
                            f.m.rotation.x += f.rs * 0.005;
                            f.m.rotation.y += f.rs * 0.005;
                            f.m.position.y =
                              0.3 + (Math.sin(t * (f.s * 0.5) + f.o) + 1) * 0.8;
                            const sc = Math.max(0.1, 1 - f.m.position.y / 1.5);
                            f.m.scale.set(sc * 1.5, sc * 2.5, sc * 1.5);
                          });
                        };
                      } else if (elId === "WIND") {
                        const tornado = new THREE.Group();
                        const numSpirals = 2;
                        const mat = new THREE.MeshBasicMaterial({
                          color: 0xcccccc,
                          transparent: true,
                          opacity: 0.8,
                          side: THREE.DoubleSide,
                        });
                        for (let i = 0; i < numSpirals; i++) {
                          const pts = [];
                          const pointsCount = 40;
                          const phaseOffset = (i / numSpirals) * Math.PI * 2;
                          for (let j = 0; j <= pointsCount; j++) {
                            const h = j / pointsCount;
                            const r = Math.pow(h, 2.0) * 1.5 + 0.2;
                            const y = (h - 0.5) * 2.5;
                            const angle = h * Math.PI * 12 + phaseOffset;
                            pts.push(
                              new THREE.Vector3(
                                Math.cos(angle) * r,
                                y,
                                Math.sin(angle) * r,
                              ),
                            );
                          }
                          const curve = new THREE.CatmullRomCurve3(pts);
                          const geometry = new THREE.TubeGeometry(
                            curve,
                            40,
                            0.075,
                            6,
                            false,
                          );
                          const mesh = new THREE.Mesh(geometry, mat);
                          tornado.add(mesh);
                        }
                        tornado.position.y = -0.2;
                        iconMesh.add(tornado);
                        customUpdate = (t, meshInstance) => {
                          tornado.rotation.y = t * -3.0;
                          tornado.rotation.x = Math.sin(t * 3.5) * 0.15;
                        };
                      } else if (elId === "WATER") {
                        // 1. The Inner Water Fluid (without the glass marble shell, as spawnLootCard adds a generic glassBubble)
                        const geo = new THREE.SphereGeometry(1.75, 64, 64);
                        geo.computeVertexNormals();
                        const mat = new THREE.MeshStandardMaterial({
                          color: 0xffffff,
                          roughness: 0.1,
                          metalness: 0.1,
                          vertexColors: true,
                          emissive: 0x0d6efd,
                          emissiveIntensity: 0.3,
                        });
                        const pos = geo.attributes.position;
                        // We need original Ys to restore the spherical bottom
                        const originalYs = new Float32Array(pos.count);
                        for (let i = 0; i < pos.count; i++)
                          originalYs[i] = pos.getY(i);
                        geo.setAttribute(
                          "originalY",
                          new THREE.BufferAttribute(originalYs, 1),
                        );

                        const colors = new Float32Array(pos.count * 3);
                        geo.setAttribute(
                          "color",
                          new THREE.BufferAttribute(colors, 3),
                        );
                        const fluid = new THREE.Mesh(geo, mat);

                        iconMesh.add(fluid);

                        customUpdate = (t, meshInstance) => {
                          const p = geo.attributes.position;
                          const origY = geo.attributes.originalY;
                          const c = geo.attributes.color;
                          const white = new THREE.Color(0xffffff);
                          const bsBlue = new THREE.Color(0x0d6efd); // Bootstrap Blue
                          const deepBlue = new THREE.Color(0x0a58ca);

                          for (let i = 0; i < p.count; i++) {
                            const x = p.getX(i),
                              z = p.getZ(i),
                              oy = origY.getX(i);

                            // Wavy surface
                            const w =
                              Math.sin(x * 3.0 + t * 4) * 0.15 +
                              Math.cos(z * 2.5 + t * 3.5) * 0.1 +
                              Math.sin((x + z) * 5.0 + t * 5.0) * 0.05;

                            // Water fills up to slightly below middle
                            const waterLevel = -0.2;

                            if (oy > waterLevel) {
                              // Project to the flat surface with waves
                              const dist2D = Math.sqrt(x * x + z * z);
                              const maxR = Math.sqrt(
                                1.75 * 1.75 - waterLevel * waterLevel,
                              );

                              // Optional: push vertices inward to create flat surface
                              if (dist2D < maxR) {
                                p.setY(i, waterLevel + w);
                                // Coloring: Crests are white/bright, troughs are deep blue
                                const mixRatio = (w + 0.25) / 0.5; // Map [-0.25, 0.25] to [0, 1]
                                const vertColor = deepBlue
                                  .clone()
                                  .lerp(white, mixRatio);
                                c.setXYZ(
                                  i,
                                  vertColor.r,
                                  vertColor.g,
                                  vertColor.b,
                                );
                              } else {
                                p.setY(i, oy);
                                c.setXYZ(i, bsBlue.r, bsBlue.g, bsBlue.b);
                              }
                            } else {
                              // Bottom of the sphere
                              p.setY(i, oy);
                              c.setXYZ(i, bsBlue.r, bsBlue.g, bsBlue.b);
                            }
                          }
                          p.needsUpdate = true;
                          c.needsUpdate = true;
                          geo.computeVertexNormals();
                        };
                      } else if (
                        catId === "KATANA" ||
                        originalTitle === "SLASH"
                      ) {
                        const addGlow = (mesh) => {
                          const glowGeo = mesh.geometry.clone();
                          const glowMat = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            transparent: true,
                            opacity: 0.15,
                            depthWrite: false,
                            blending: THREE.AdditiveBlending,
                          });
                          const glow = new THREE.Mesh(glowGeo, glowMat);
                          glow.scale.setScalar(1.2);
                          mesh.add(glow);
                        };

                        const bladeShape = new THREE.Shape();
                        bladeShape.moveTo(0, 0); // Guard level
                        bladeShape.quadraticCurveTo(-0.1, 1.0, -0.05, 2.0); // Back edge
                        bladeShape.lineTo(0.15, 1.85); // Tip
                        bladeShape.quadraticCurveTo(0.2, 1.0, 0.2, 0); // Cutting edge
                        bladeShape.lineTo(0, 0);
                        const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
                          depth: 0.1,
                          bevelEnabled: true,
                          bevelThickness: 0.03,
                          bevelSize: 0.03,
                          bevelSegments: 2,
                        });
                        bladeGeo.center();
                        const blade = new THREE.Mesh(
                          bladeGeo,
                          new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            side: THREE.DoubleSide,
                          }),
                        );
                        blade.position.y = 1.0;
                        addGlow(blade);

                        const hilt = new THREE.Mesh(
                          new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12),
                          new THREE.MeshBasicMaterial({
                            color: 0x8b0000,
                            side: THREE.DoubleSide,
                          }),
                        );
                        hilt.position.y = -0.4;
                        addGlow(hilt);

                        const guard = new THREE.Mesh(
                          new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16),
                          new THREE.MeshBasicMaterial({
                            color: 0xffd700,
                            side: THREE.DoubleSide,
                          }),
                        );
                        guard.position.y = 0;
                        addGlow(guard);

                        const swordContainer = new THREE.Group();
                        swordContainer.add(hilt, blade, guard);
                        swordContainer.position.y = -0.3;
                        swordContainer.position.z = 1.2; // Push Katana forward so it doesn't clip the card

                        swordContainer.scale.set(0.8, 0.8, 0.1); // flatten z depth

                        const sword1 = swordContainer;
                        sword1.position.set(0, -0.3, 0);

                        iconMesh.add(sword1);

                        customUpdate = (t, meshInstance) => {
                          sword1.rotation.y = t * 1.5;
                          sword1.position.y = -0.3 + Math.sin(t * 2) * 0.1;
                        };
                      } else if (
                        catId === "MISSILE" ||
                        originalTitle === "SHURIKEN"
                      ) {
                        const addGlow = (mesh) => {
                          const glowGeo = mesh.geometry.clone();
                          const glowMat = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            transparent: true,
                            opacity: 0.15,
                            depthWrite: false,
                            blending: THREE.AdditiveBlending,
                          });
                          const glow = new THREE.Mesh(glowGeo, glowMat);
                          glow.scale.set(1.15, 1.15, 1.5);
                          mesh.add(glow);
                        };
                        const starShape = new THREE.Shape();
                        const outerRadius = 1.8;
                        const innerRadius = 0.45;
                        for (let i = 0; i < 8; i++) {
                          const angle = (i * Math.PI) / 4;
                          const r = i % 2 === 0 ? outerRadius : innerRadius;
                          if (i === 0)
                            starShape.moveTo(
                              Math.cos(angle) * r,
                              Math.sin(angle) * r,
                            );
                          else
                            starShape.lineTo(
                              Math.cos(angle) * r,
                              Math.sin(angle) * r,
                            );
                        }
                        const geo = new THREE.ExtrudeGeometry(starShape, {
                          depth: 0.1,
                          bevelEnabled: true,
                          bevelThickness: 0.03,
                          bevelSize: 0.03,
                          bevelSegments: 2,
                        });
                        geo.center();
                        const starMat = new THREE.MeshStandardMaterial({
                          color: 0xdddddd,
                          metalness: 0.5,
                          roughness: 0.2,
                          emissive: 0x666666,
                          side: THREE.DoubleSide,
                        });
                        const starMesh = new THREE.Mesh(geo, starMat);
                        addGlow(starMesh);

                        const hole = new THREE.Mesh(
                          new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16),
                          new THREE.MeshBasicMaterial({
                            color: 0x000000,
                            side: THREE.DoubleSide,
                          }),
                        );
                        hole.rotation.x = Math.PI / 2;

                        const starGroup = new THREE.Group();
                        starGroup.add(starMesh, hole);
                        starGroup.scale.set(0.8, 0.8, 0.1); // flatten z depth

                        const star1 = starGroup;
                        star1.position.set(0, 0, 0);

                        const star2 = starGroup.clone();
                        star2.rotation.y = Math.PI;

                        iconMesh.add(star1, star2);
                        customUpdate = (t, meshInstance) => {
                          star1.rotation.z = -t * 0.5;
                          star2.rotation.z = -t * 0.5;
                        };
                      } else if (originalTitle === "SAMURAI HELMET") {
                        const addOutline = (mesh) => {
                          const edges = new THREE.EdgesGeometry(mesh.geometry);
                          const line = new THREE.LineSegments(
                            edges,
                            new THREE.LineBasicMaterial({
                              color: 0xffffff,
                              transparent: true,
                              opacity: 0.8,
                            }),
                          );
                          mesh.add(line);
                        };
                        // Samurai Helmet (Kabuto)
                        const helmetMat = new THREE.MeshStandardMaterial({
                          color: 0xffffff,
                          roughness: 0.2,
                          metalness: 0.3,
                          side: THREE.DoubleSide,
                        });
                        const goldMat = new THREE.MeshStandardMaterial({
                          color: 0xffaa00,
                          metalness: 0.8,
                          roughness: 0.2,
                          side: THREE.DoubleSide,
                        });

                        // Dome
                        const domeGeo = new THREE.SphereGeometry(
                          1.0,
                          16,
                          16,
                          0,
                          Math.PI * 2,
                          0,
                          Math.PI / 2,
                        );
                        const dome = new THREE.Mesh(domeGeo, helmetMat);
                        dome.position.y = -0.2;
                        addOutline(dome);

                        // Face Guard (Mempo) - just a cylinder slice
                        const guardGeo = new THREE.CylinderGeometry(
                          1.1,
                          1.2,
                          0.4,
                          16,
                          1,
                          false,
                          Math.PI * 0.75,
                          Math.PI * 1.5,
                        );
                        const guard = new THREE.Mesh(guardGeo, helmetMat);
                        guard.position.y = -0.4;
                        addOutline(guard);

                        // Kuwagata (Crescent Horns)
                        const hornShape = new THREE.Shape();
                        hornShape.moveTo(0, 0);
                        hornShape.quadraticCurveTo(0.8, 0.8, 1.2, 1.8);
                        hornShape.quadraticCurveTo(0.8, 0.4, 0.2, 0.2);
                        hornShape.lineTo(0, 0);
                        const hornGeo1 = new THREE.ExtrudeGeometry(hornShape, {
                          depth: 0.1,
                          bevelEnabled: true,
                          bevelThickness: 0.03,
                          bevelSize: 0.03,
                          bevelSegments: 2,
                        });
                        const horn1 = new THREE.Mesh(hornGeo1, goldMat);
                        horn1.position.set(0, 0.3, 0.9);
                        horn1.rotation.z = -0.3;
                        horn1.rotation.y = 0.2;
                        addOutline(horn1);

                        const horn2 = new THREE.Mesh(hornGeo1, goldMat);
                        horn2.position.set(0, 0.3, 0.9);
                        horn2.rotation.y = Math.PI - 0.2; // Flip for left side
                        horn2.rotation.z = -0.3;
                        addOutline(horn2);

                        const boss = new THREE.Mesh(
                          new THREE.SphereGeometry(0.2, 8, 8),
                          goldMat,
                        );
                        boss.position.set(0, 0.4, 1.0);
                        addOutline(boss);

                        iconMesh.add(dome, guard, horn1, horn2, boss);
                        iconMesh.scale.set(1.0, 1.0, 0.1); // flatten z depth
                        customUpdate = (t, meshInstance) => {
                          meshInstance.rotation.y = t * 1.5;
                        };
                      } else if (
                        originalTitle === "SHIELD" ||
                        catId === "SHIELD" ||
                        catId === "ARMOR"
                      ) {
                        const addOutline = (mesh) => {
                          const edges = new THREE.EdgesGeometry(mesh.geometry);
                          const line = new THREE.LineSegments(
                            edges,
                            new THREE.LineBasicMaterial({
                              color: 0xffffff,
                              transparent: true,
                              opacity: 0.8,
                            }),
                          );
                          mesh.add(line);
                        };

                        const shieldShape = new THREE.Shape();
                        shieldShape.moveTo(0, -1.2);
                        shieldShape.quadraticCurveTo(1.2, -0.2, 1.0, 1.0);
                        shieldShape.lineTo(-1.0, 1.0);
                        shieldShape.quadraticCurveTo(-1.2, -0.2, 0, -1.2);

                        const shieldGeo = new THREE.ExtrudeGeometry(
                          shieldShape,
                          {
                            depth: 0.1,
                            bevelEnabled: true,
                            bevelThickness: 0.03,
                            bevelSize: 0.03,
                            bevelSegments: 2,
                          },
                        );
                        shieldGeo.center();

                        const shieldMat = new THREE.MeshStandardMaterial({
                          color: 0xffffff,
                          metalness: 0.5,
                          roughness: 0.3,
                          emissive: 0x444444,
                          side: THREE.DoubleSide,
                        });
                        const shield = new THREE.Mesh(shieldGeo, shieldMat);
                        shield.scale.set(1.4, 1.4, 0.14); // flatten z depth
                        addOutline(shield);

                        // Inner shield design
                        const innerGeo = new THREE.ExtrudeGeometry(
                          shieldShape,
                          { depth: 0.1, bevelEnabled: false },
                        );
                        innerGeo.center();
                        const innerMat = new THREE.MeshStandardMaterial({
                          color: 0xffffff,
                          metalness: 0.1,
                          roughness: 0.2,
                          side: THREE.DoubleSide,
                        });
                        const innerShield = new THREE.Mesh(innerGeo, innerMat);
                        innerShield.scale.set(0.5, 0.5, 1.0);
                        innerShield.position.z = 0; // centered so it pokes out both sides
                        addOutline(innerShield);

                        shield.add(innerShield);

                        const frontShield = shield;
                        frontShield.position.z = 0;

                        iconMesh.add(frontShield);
                        customUpdate = (t, meshInstance) => {
                          frontShield.rotation.y = t * 1.5;
                        };
                      } else if (
                        originalTitle === "POTION" ||
                        catId === "SCROLL"
                      ) {
                        const potionGroup = new THREE.Group();

                        const glassMat = new THREE.MeshStandardMaterial({
                          color: 0x888888,
                          roughness: 0.1,
                          metalness: 0.4,
                          transparent: true,
                          opacity: 0.4,
                          depthWrite: false,
                        });
                        const corkMat = new THREE.MeshStandardMaterial({
                          color: 0x8b5a2b,
                          roughness: 0.9,
                          metalness: 0.1,
                        });
                        const liquidMat = new THREE.MeshBasicMaterial({
                          color: 0x00ff44,
                          transparent: true,
                          opacity: 0.9,
                          blending: THREE.AdditiveBlending,
                        });

                        // Flask base
                        const baseGeo = new THREE.SphereGeometry(1.0, 16, 16);
                        const base = new THREE.Mesh(baseGeo, glassMat);

                        // Liquid inside
                        const liquidGeo = new THREE.SphereGeometry(
                          0.85,
                          16,
                          16,
                          0,
                          Math.PI * 2,
                          Math.PI / 2,
                          Math.PI / 2,
                        );
                        const liquid = new THREE.Mesh(liquidGeo, liquidMat);

                        // Neck
                        const neckGeo = new THREE.CylinderGeometry(
                          0.3,
                          0.5,
                          0.8,
                          16,
                        );
                        const neck = new THREE.Mesh(neckGeo, glassMat);
                        neck.position.y = 1.0;

                        // Lip
                        const lipGeo = new THREE.TorusGeometry(
                          0.35,
                          0.1,
                          8,
                          16,
                        );
                        const lip = new THREE.Mesh(lipGeo, glassMat);
                        lip.position.y = 1.4;
                        lip.rotation.x = Math.PI / 2;

                        // Cork
                        const corkGeo = new THREE.CylinderGeometry(
                          0.25,
                          0.2,
                          0.4,
                          12,
                        );
                        const cork = new THREE.Mesh(corkGeo, corkMat);
                        cork.position.y = 1.55;

                        potionGroup.add(base, liquid, neck, lip, cork);
                        potionGroup.position.y = -0.4;

                        iconMesh.add(potionGroup);

                        customUpdate = (t, meshInstance) => {
                          potionGroup.rotation.y = t * 1.5;
                          potionGroup.rotation.z = Math.sin(t * 2) * 0.1;
                          liquid.rotation.x = Math.sin(t * 5) * 0.2; // sloshing
                          liquid.rotation.z = Math.cos(t * 4) * 0.2; // sloshing
                        };
                      } else if (catId === "GOLD_COIN") {
                        const coinShape = new THREE.Shape();
                        coinShape.arc(0, 0, 1.68, 0, Math.PI * 2, false); // CCW outer

                        const holePath = new THREE.Path();
                        // CW inner square cutout for Yen shape
                        holePath.moveTo(-0.48, 0.48);
                        holePath.lineTo(0.48, 0.48);
                        holePath.lineTo(0.48, -0.48);
                        holePath.lineTo(-0.48, -0.48);
                        holePath.lineTo(-0.48, 0.48);
                        coinShape.holes.push(holePath);

                        // Embed depth evenly through card (make it thick enough to pierce the card given the 0.07 scale, but not excessively huge)
                        const coinGeo = new THREE.ExtrudeGeometry(coinShape, {
                          depth: 0.8,
                          bevelEnabled: true,
                          bevelThickness: 0.1,
                          bevelSize: 0.1,
                          bevelSegments: 2,
                        });
                        coinGeo.center();

                        // Generate faux-metal gradient texture to provide 3D shine without requiring actual light sources
                        const tCanvas = document.createElement("canvas");
                        tCanvas.width = 128;
                        tCanvas.height = 128;
                        const tCtx = tCanvas.getContext("2d");
                        const grd = tCtx.createLinearGradient(0, 0, 128, 128);
                        grd.addColorStop(0, "#d4af37"); // Darker highlight
                        grd.addColorStop(0.3, "#b8860b"); // Darker base
                        grd.addColorStop(0.5, "#d4af37"); // Darker highlight
                        grd.addColorStop(0.7, "#6b4f00"); // Deep shadow
                        grd.addColorStop(1, "#b8860b"); // Darker base
                        tCtx.fillStyle = grd;
                        tCtx.fillRect(0, 0, 128, 128);
                        const goldTex = new THREE.CanvasTexture(tCanvas);

                        const coinMat = new THREE.MeshBasicMaterial({
                          map: goldTex,
                          side: THREE.DoubleSide,
                        });
                        const coin = new THREE.Mesh(coinGeo, coinMat);

                        // Flat against the card, NO tilting to prevent it getting chopped by the card plane
                        coin.rotation.x = 0;
                        coin.rotation.y = 0;

                        iconMesh.add(coin);

                        // Removed PointLights to eliminate massive bloom artifacts

                        customUpdate = (t, meshInstance) => {
                          // Coin remains static per user request
                        };
                      } else {
                        // DICE fallback
                        const dieMat = new THREE.MeshStandardMaterial({
                          color: 0xffffff,
                          roughness: 0.2,
                          metalness: 0.1,
                        });
                        const die = new THREE.Mesh(
                          new THREE.BoxGeometry(1.6, 1.6, 1.6),
                          dieMat,
                        );
                        iconMesh.add(die);
                        customUpdate = (t, meshInstance) => {
                          meshInstance.rotation.y = t * 1.5;
                          meshInstance.rotation.x = Math.sin(t * 2) * 0.5;
                        };
                      }

                      return { iconMesh, customUpdate };
                    };

                    const iconModel = createLootIcon();

                    const iconWrapper = new THREE.Group();

                    // Scale: Flashlight gets bigger, everything else stays standard
                    let EXACT_SCALE = 0.07;
                    if (originalTitle === "MAGIC LANTERN") EXACT_SCALE = 0.35;

                    // SINGLE CENTERED ICON (DoubleSide materials make back visible)
                    const frontIcon = iconModel.iconMesh;
                    frontIcon.scale.set(EXACT_SCALE, EXACT_SCALE, EXACT_SCALE);
                    frontIcon.position.set(0, -0.096, 0); // Dead center in hole

                    // Traverse to ensure DoubleSide materials
                    frontIcon.traverse((child) => {
                      if (child.isMesh) {
                        if (child.material && !Array.isArray(child.material)) {
                          child.material.transparent = true;
                          child.material.side = THREE.DoubleSide;
                          child.material.needsUpdate = true;
                        }
                        child.renderOrder = 20;
                      }
                    });
                    iconWrapper.add(frontIcon);

                    // The Glass Bubble Enclosure
                    if (!this._sharedGlassBubbleGeo) {
                      this._sharedGlassBubbleGeo = new THREE.SphereGeometry(
                        0.2,
                        32,
                        32,
                      );
                      this._sharedGlassBubbleMat =
                        new THREE.MeshPhysicalMaterial({
                          color: 0xe0f0ff,
                          transparent: true,
                          opacity: 0.55,
                          roughness: 0.05,
                          metalness: 0.3,
                          clearcoat: 1.0,
                          clearcoatRoughness: 0.05,
                          ior: 1.5,
                          depthWrite: false,
                        });
                    }
                    const glassBubble = new THREE.Mesh(
                      this._sharedGlassBubbleGeo,
                      this._sharedGlassBubbleMat,
                    );
                    glassBubble.position.set(0, -0.096, 0);
                    glassBubble.scale.set(1, 1, 0.75); // Deeper dome to enclose unwarped 3D models
                    glassBubble.renderOrder = 10;
                    iconWrapper.add(glassBubble);

                    cardGroup.add(iconWrapper);

                    const combinedUpdate = (t) => {
                      if (iconModel.customUpdate)
                        iconModel.customUpdate(t, frontIcon);
                    };

                    cardGroup.position.set(
                      x * this.gridSize,
                      1.2,
                      z * this.gridSize,
                    );

                    // Removed PointLights from loot cards as per user request to avoid errors

                    cardGroup.userData = {
                      type: "loot_cards",
                      floatTimer: Math.random() * Math.PI * 2,
                      basePos: 1.2,
                      gridX: x,
                      gridZ: z,
                      cardDataURL: canvas.toDataURL(),
                      cleanCardURL: cleanCardURL,
                      iconMesh: iconWrapper,
                      customUpdate: combinedUpdate,
                      cardData: {
                        el: catId,
                        name: inTitle,
                        desc: desc,
                        kanji: kanji,
                        attr: attr,
                        themeClr: themeColor,
                        qty: qty,
                      },
                      cardName: title, // Use modified title (with x5) for UI
                      isShopItem: isShopItem,
                      price: price,
                    };

                    this.worldGroup.add(cardGroup);
                    this.lootItems.push(cardGroup);
                  };

                  const randomCards = [
                    [
                      "EARTH",
                      "BOULDER",
                      "Heavy impact.",
                      "地",
                      "(STUN * 2DICE)",
                    ],
                    [
                      "FIRE",
                      "FIREBALL",
                      "Inferno star.",
                      "火",
                      "(DMG * 4DICE)",
                    ],
                    ["KATANA", "SLASH", "Basic slash.", "斬", "(DMG * 1DICE)"],
                    ["WIND", "GALE", "Forceful gust.", "風", "(PUSH * 3DICE)"],
                    ["WATER", "SURGE", "Crashing wave.", "水", "(DMG * 3DICE)"],
                    ["ITEM", "SHIELD", "Raises AC.", "盾", "(AC + 5)"],
                    ["SCROLL", "POTION", "Consumable", "具", "(HP + 20)"],
                    [
                      "MISSILE",
                      "SHURIKEN",
                      "Ranged attack.",
                      "投",
                      "(DMG * 2DICE)",
                    ],
                  ];
                  const selected =
                    randomCards[Math.floor(Math.random() * randomCards.length)];
                  this.spawnLootCard(
                    this.entrancePos.x,
                    this.entrancePos.z - 4,
                    selected[0],
                    selected[1],
                    selected[2],
                    selected[3],
                    selected[4],
                  );

                  this.spawnLootCard(
                    this.entrancePos.x,
                    this.entrancePos.z - 2,
                    "ITEM",
                    "MAGIC LANTERN",
                    "Light your way.",
                    "灯",
                    "EQUIP",
                  );

                  // --- 2x LONG BOW x7 along LEFT side of entrance hallway ---
                  // hallX - 1 is the left lane; hallway runs from entrancePos.z-6 upward
                  this.spawnLootCard(
                    this.entrancePos.x - 1,
                    this.entrancePos.z - 5,
                    "MISSILE",
                    "LONG BOW",
                    "Heavy shot.",
                    "長",
                    "(DMG * 4DICE)",
                  );
                  this.spawnLootCard(
                    this.entrancePos.x - 1,
                    this.entrancePos.z - 3,
                    "MISSILE",
                    "LONG BOW",
                    "Heavy shot.",
                    "長",
                    "(DMG * 4DICE)",
                  );

                  // --- 3 SKILL ATTRIBUTE cards along LEFT wall of Room 1 ---
                  // Room 1 left wall = rStartX (hallX - 3). Cards placed inside the room along x = rStartX + 1
                  const skillLoot = [
                    ["KATANA", "SLASH", "Basic slash.", "斬", "+1 STR"],
                    ["WIND", "GALE", "Forceful gust.", "風", "+1 DEX"],
                    ["KATANA", "THRUST", "Quick stab.", "突", "+1 STR"],
                  ];
                  skillLoot.forEach((card, i) => {
                    this.spawnLootCard(
                      rStartX + 1,
                      rStartZ + 1 + i * 2,
                      card[0],
                      card[1],
                      card[2],
                      card[3],
                      card[4],
                    );
                  });

                  // --- 3 ARMOR cards along RIGHT wall of Room 1 (+1 AC each) ---
                  // Room 1 right wall = rStartX + roomSize - 1. Cards placed at x = rStartX + roomSize - 2
                  const armorLoot = [
                    ["ITEM", "HELMET", "Head armor.", "兜", "+1 AC"],
                    ["ITEM", "SHIELD", "Arm guard.", "盾", "+2 AC"],
                    ["ITEM", "CHEST ARMOR", "Body armor.", "鎧", "+3 AC"],
                  ];
                  armorLoot.forEach((card, i) => {
                    this.spawnLootCard(
                      rStartX + roomSize - 2,
                      rStartZ + 1 + i * 2,
                      card[0],
                      card[1],
                      card[2],
                      card[3],
                      card[4],
                    );
                  });

                  if (!this.level || this.level === 1) {
                    const shop = this.rooms.find((r) => r.id === 99);
                    if (shop) {
                      const shopWestX = shop.x;
                      let zPos = shop.y;
                      for (let i = 0; i < 4; i++) {
                        const cardData =
                          randomCards[
                            Math.floor(Math.random() * randomCards.length)
                          ];
                        let price = 50;
                        if (cardData[0] === "SCROLL") price = 25;
                        if (cardData[0] === "FIRE") price = 100;
                        this.spawnLootCard(
                          shopWestX,
                          zPos + i,
                          cardData[0],
                          cardData[1],
                          cardData[2],
                          cardData[3],
                          cardData[4],
                          true,
                          price,
                        );
                      }
                    }
                  }
                }
            }
};

