import { PLAY_STYLES } from "./profile.js";
import { LOOT_DATA } from "../data/loot.js";

/**
 * DUNGEON GENERATOR - NetHack/Rogue Style
 * Modular system for generating complex dungeon levels.
 */

export const TILE_SIZE = 1.25;

export const TILE_TYPE = {
    WALL: 'wall',
    FLOOR: 'floor',
    ENTRANCE: 'entrance',
    EXIT: 'exit',
    DOOR: 'door',
    SECRET_DOOR: 'secret_door',
    TRAP: 'trap',
    STORE: 'store'
};

const MONSTER_TABLE = [
    { id: 'rat', name: 'Giant Rat', cost: 1, hp: 5, state: 'HOSTILE' },
    { id: 'goblin', name: 'Goblin Grunt', cost: 2, hp: 10, state: 'HOSTILE' },
    { id: 'imp', name: 'Fire Imp', cost: 4, hp: 12, state: 'HOSTILE' },
    { id: 'orc', name: 'Orc Warrior', cost: 5, hp: 25, state: 'HOSTILE' },
    { id: 'skeleton', name: 'Skeleton', cost: 3, hp: 15, state: 'HOSTILE' },
    { id: 'slime', name: 'Green Slime', cost: 2, hp: 20, state: 'HOSTILE' }
];

const TRAP_TABLE = [
    { id: 'spikes', name: 'Spike Trap', damage: 5, message: 'You step on sharp spikes!' },
    { id: 'pit', name: 'Hidden Pit', damage: 10, message: 'You fall into a pit!' },
    { id: 'teleport', name: 'Teleport Trap', damage: 0, message: 'You are suddenly teleported!' }
];

export class DungeonGenerator {
    constructor(profile) {
        this.profile = profile;
        this.cols = 40;
        this.rows = 30;
    }

    generateLevel(depth) {
        console.log(`[DungeonGenerator] Generating Level ${depth}...`);
        
        // 1. Initialize Grid
        const grid = Array.from({ length: this.rows }, () => 
            Array.from({ length: this.cols }, () => ({ type: TILE_TYPE.WALL }))
        );

        // 2. Generate Rooms
        const roomCount = 6 + Math.floor(Math.random() * 4); // 6-9 rooms
        const rooms = this.generateRooms(grid, roomCount);
        
        if (rooms.length === 0) {
            console.error("[DungeonGenerator] Failed to generate rooms!");
            return this.generateLevel(depth); // Retry
        }

        // 3. Connect Rooms (Hallways)
        this.connectRooms(grid, rooms);

        // 4. Place Entrance & Exit
        const entrancePos = this.placeFeature(grid, rooms, TILE_TYPE.ENTRANCE);
        const exitPos = this.placeFeature(grid, rooms, TILE_TYPE.EXIT, [entrancePos]);

        // 5. Convert to Game Data
        const levelData = this.gridToLevelData(grid, rooms, depth);
        
        // 6. Populate Content
        this.populateLevel(levelData, depth);

        return levelData;
    }

    generateRooms(grid, count) {
        const rooms = [];
        const MIN_SIZE = 4;
        const MAX_SIZE = 8;
        const BUFFER = 2;

        for (let i = 0; i < count * 20 && rooms.length < count; i++) {
            const w = Math.floor(Math.random() * (MAX_SIZE - MIN_SIZE + 1)) + MIN_SIZE;
            const h = Math.floor(Math.random() * (MAX_SIZE - MIN_SIZE + 1)) + MIN_SIZE;
            
            const x = Math.floor(Math.random() * (this.cols - w - 2)) + 1;
            const y = Math.floor(Math.random() * (this.rows - h - 2)) + 1;

            const newRoom = { x, y, w, h, center: { x: x + Math.floor(w/2), y: y + Math.floor(h/2) } };

            // Overlap Check
            let overlap = false;
            for (const r of rooms) {
                if (x < r.x + r.w + BUFFER && x + w + BUFFER > r.x &&
                    y < r.y + r.h + BUFFER && y + h + BUFFER > r.y) {
                    overlap = true;
                    break;
                }
            }

            if (!overlap) {
                rooms.push(newRoom);
                // Carve Room
                for (let ry = y; ry < y + h; ry++) {
                    for (let rx = x; rx < x + w; rx++) {
                        grid[ry][rx] = { type: TILE_TYPE.FLOOR, roomId: rooms.length };
                    }
                }
            }
        }
        return rooms;
    }

    connectRooms(grid, rooms) {
        // Simple MST-like connection
        const connected = new Set([rooms[0]]);
        const unconnected = new Set(rooms.slice(1));

        while (unconnected.size > 0) {
            let bestDist = Infinity;
            let bestPair = null;

            for (const a of connected) {
                for (const b of unconnected) {
                    const dist = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPair = { a, b };
                    }
                }
            }

            if (bestPair) {
                this.carveHallway(grid, bestPair.a.center, bestPair.b.center);
                connected.add(bestPair.b);
                unconnected.delete(bestPair.b);
            } else {
                break; // Should not happen
            }
        }
    }

    carveHallway(grid, start, end) {
        let x = start.x;
        let y = start.y;

        while (x !== end.x || y !== end.y) {
            if (Math.random() < 0.5) {
                if (x !== end.x) x += Math.sign(end.x - x);
                else y += Math.sign(end.y - y);
            } else {
                if (y !== end.y) y += Math.sign(end.y - y);
                else x += Math.sign(end.x - x);
            }

            if (grid[y][x].type === TILE_TYPE.WALL) {
                grid[y][x] = { type: TILE_TYPE.FLOOR, hallway: true };
            }
        }
    }

    placeFeature(grid, rooms, type, exclude = []) {
        // Find a random room
        let attempts = 0;
        while (attempts < 50) {
            const room = rooms[Math.floor(Math.random() * rooms.length)];
            const x = Math.floor(Math.random() * room.w) + room.x;
            const y = Math.floor(Math.random() * room.h) + room.y;
            
            const pos = { x, y };
            
            // Check exclusion
            let excluded = false;
            for (const ex of exclude) {
                if (ex.x === x && ex.y === y) excluded = true;
            }

            if (!excluded && grid[y][x].type === TILE_TYPE.FLOOR) {
                grid[y][x].type = type;
                return pos;
            }
            attempts++;
        }
        return { x: 0, y: 0 }; // Fallback
    }

    gridToLevelData(grid, rooms, depth) {
        const roomMap = {};
        
        grid.forEach((row, y) => {
            row.forEach((cell, x) => {
                if (cell.type !== TILE_TYPE.WALL) {
                    const id = `tile_${x}_${y}`;
                    roomMap[id] = {
                        id: id,
                        x: x,
                        z: y,
                        worldX: x * TILE_SIZE,
                        worldZ: y * TILE_SIZE,
                        type: cell.hallway ? 'corridor' : 'chamber',
                        title: cell.type === TILE_TYPE.ENTRANCE ? "Dungeon Entrance" :
                               cell.type === TILE_TYPE.EXIT ? "Exit Portal" :
                               cell.hallway ? "Dark Corridor" : "Chamber",
                        description: this.getDescription(cell, depth),
                        exits: {}, // Populated later if needed
                        items: [],
                        monsters: [],
                        features: []
                    };

                    if (cell.type === TILE_TYPE.ENTRANCE) {
                        roomMap[id].features.push({ id: 'lantern', label: 'Take Lantern', actionLabel: 'take_lantern', consumed: false });
                    }
                }
            });
        });

        return {
            id: `level_${depth}`,
            depth: depth,
            startRoomId: Object.values(roomMap).find(r => r.title === "Dungeon Entrance")?.id || Object.keys(roomMap)[0],
            rooms: roomMap
        };
    }

    getDescription(cell, depth) {
        if (cell.type === TILE_TYPE.ENTRANCE) return "The air is stale. A heavy iron gate blocks the way back.";
        if (cell.type === TILE_TYPE.EXIT) return "A swirling portal of energy pulses before you.";
        if (cell.hallway) {
            // Mysterious Hallway Event (1% chance)
            if (Math.random() < 0.01) {
                return "The shadows lengthen here... you feel a cold draft from nowhere. This is the Mysterious Hallway.";
            }
            return "A narrow, damp corridor stretching into darkness.";
        }
        return "A cold, stone chamber. Shadows dance on the walls.";
    }

    populateLevel(level, depth) {
        const tiles = Object.values(level.rooms).filter(r => r.type === 'chamber' && !r.title.includes('Entrance') && !r.title.includes('Exit'));
        const budget = (5 + Math.random() * 5) * depth;
        let currentCost = 0;

        // Monsters
        while (currentCost < budget && tiles.length > 0) {
            const tile = tiles[Math.floor(Math.random() * tiles.length)];
            const monster = MONSTER_TABLE[Math.floor(Math.random() * MONSTER_TABLE.length)];
            
            if (currentCost + monster.cost <= budget) {
                tile.monsters.push({ ...monster, gameId: `mob_${tile.id}_${Math.random().toString(36).substr(2, 5)}` });
                currentCost += monster.cost;
            } else {
                break;
            }
        }

        // Loot
        const lootCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < lootCount; i++) {
            const tile = tiles[Math.floor(Math.random() * tiles.length)];
            const item = LOOT_DATA[Math.floor(Math.random() * LOOT_DATA.length)];
            tile.items.push({ ...item, id: `item_${tile.id}_${i}` });
        }
        
        // Traps (10% chance per room)
        tiles.forEach(tile => {
            if (Math.random() < 0.1) {
                const trap = TRAP_TABLE[Math.floor(Math.random() * TRAP_TABLE.length)];
                tile.features.push({ ...trap, type: 'trap', hidden: true });
            }
        });
    }
}
