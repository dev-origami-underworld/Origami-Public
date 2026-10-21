import { PLAY_STYLES } from "./profile.js";
import { LOOT_DATA } from "../data/loot.js";

/**
 * DUNGEON GENERATOR - Based on Origami.Dungeon.F.html
 * Simple grid-based approach with rectangular rooms and fuzzy hallways
 */

export const TILE_SIZE = 1.25;

const TILE_TYPE = {
    WALL: 'wall',
    FLOOR: 'floor',
    ENTRANCE: 'entrance',
    EXIT: 'exit'
};

const MONSTER_TABLE = [
    { id: 'rat', name: 'Giant Rat', cost: 1, hp: 5, state: 'HOSTILE' },
    { id: 'goblin', name: 'Goblin Grunt', cost: 2, hp: 10, state: 'HOSTILE' },
    { id: 'imp', name: 'Fire Imp', cost: 4, hp: 12, state: 'HOSTILE' },
    { id: 'orc', name: 'Orc Warrior', cost: 5, hp: 25, state: 'HOSTILE' }
];

export class LevelGenerator {
    constructor(profile) {
        this.profile = profile;
        this.cols = 40; // Grid width
        this.rows = 30; // Grid height
    }

    generateLevel(depth) {
        console.log(`[Generator] Generating Grid-Based Level ${depth}`);

        const roomCount = 5 + Math.floor(Math.random() * 4); // 5-8 rooms
        const dungeonData = this.generateDungeonMap(this.cols, this.rows, roomCount);
        
        // Convert grid to room dictionary for game engine
        const rooms = this.gridToRooms(dungeonData.grid);
        
        // Populate with monsters
        const difficultyBudget = (Math.floor(Math.random() * 6) + 5) * depth;
        this.populateMonsters(rooms, difficultyBudget);
        
        // Populate with items
        this.populateItems(rooms);

        console.log(`[Generator] Created ${Object.keys(rooms).length} tiles`);

        return {
            id: `level_${depth}`,
            depth: depth,
            startRoomId: "entrance",
            rooms: rooms
        };
    }

    /**
     * Generate dungeon grid - EXACT copy of Origami.Dungeon.F.html algorithm
     */
    generateDungeonMap(cols, rows, roomCount) {
        const grid = Array.from({ length: rows }, () => 
            Array.from({ length: cols }, () => ({ type: TILE_TYPE.WALL }))
        );
        
        let rooms = [];
        const ROOM_BUFFER = 2;
        
        // Allowed room sizes (from original)
        const ROOM_SIZES = [
            { w: 6, h: 6 },
            { w: 4, h: 8 }
        ];
        const MAX_ROOM_GAP = 4;

        // 1. Place Rooms
        for (let i = 0; i < roomCount * 60 && rooms.length < roomCount; i++) {
            const size = ROOM_SIZES[Math.floor(Math.random() * ROOM_SIZES.length)];
            const w = size.w;
            const h = size.h;

            const x = 1 + Math.floor(Math.random() * (cols - w - 2));
            const y = 1 + Math.floor(Math.random() * (rows - h - 6));

            const newRoom = {
                id: rooms.length + 1,
                x, y, w, h,
                center: { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) }
            };

            // Check overlap
            let overlaps = false;
            for (let r of rooms) {
                if (x < r.x + r.w + ROOM_BUFFER && x + w + ROOM_BUFFER > r.x &&
                    y < r.y + r.h + ROOM_BUFFER && y + h + ROOM_BUFFER > r.y) {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps) continue;

            // Enforce proximity
            let isCloseEnough = rooms.length === 0;
            if (!isCloseEnough) {
                for (let r of rooms) {
                    const dx = Math.max(0, Math.max(r.x - (x + w), x - (r.x + r.w)));
                    const dy = Math.max(0, Math.max(r.y - (y + h), y - (r.y + r.h)));
                    const gap = Math.max(dx, dy);
                    if (gap <= MAX_ROOM_GAP) { isCloseEnough = true; break; }
                }
            }
            if (!isCloseEnough) continue;

            // Place room on grid
            rooms.push(newRoom);
            for (let ry = y; ry < y + h; ry++) {
                for (let rx = x; rx < x + w; rx++) {
                    grid[ry][rx] = { type: TILE_TYPE.FLOOR, room: true, roomId: newRoom.id };
                }
            }
        }

        if (rooms.length === 0) {
            console.error('[Generator] Failed to create any rooms!');
            return { grid, rooms: [] };
        }

        // 2. Create Entrance at bottom-center
        const entrancePos = { x: Math.floor(cols / 2), y: rows - 2 };
        grid[entrancePos.y][entrancePos.x] = { type: TILE_TYPE.ENTRANCE };
        
        // Entrance hallway
        grid[rows - 1][entrancePos.x] = { type: TILE_TYPE.FLOOR, hallway: true };
        for (let i = 1; i <= 4; i++) {
            grid[rows - 2 - i][entrancePos.x] = { type: TILE_TYPE.FLOOR, hallway: true };
        }
        const hallwayEnd = { x: entrancePos.x, y: rows - 6 };

        // 3. Connect entrance to nearest room
        let closestRoomToEntrance = rooms.sort((a, b) =>
            Math.hypot(a.center.x - hallwayEnd.x, a.center.y - hallwayEnd.y) -
            Math.hypot(b.center.x - hallwayEnd.x, b.center.y - hallwayEnd.y)
        )[0];
        this.carveFuzzyHallway(grid, hallwayEnd, closestRoomToEntrance.center);

        // 4. Connect all rooms using MST approach
        const connectedRooms = new Set();
        connectedRooms.add(closestRoomToEntrance);

        while (connectedRooms.size < rooms.length) {
            let closestDist = Infinity;
            let closestPair = null;

            for (const conRoom of Array.from(connectedRooms)) {
                for (const unconRoom of rooms) {
                    if (connectedRooms.has(unconRoom)) continue;

                    const dist = Math.hypot(
                        conRoom.center.x - unconRoom.center.x,
                        conRoom.center.y - unconRoom.center.y
                    );
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestPair = { from: conRoom, to: unconRoom };
                    }
                }
            }

            if (closestPair) {
                this.carveFuzzyHallway(grid, closestPair.from.center, closestPair.to.center);
                connectedRooms.add(closestPair.to);
            } else {
                break;
            }
        }

        // 5. Place exit in furthest room
        let furthestRoom = null;
        let maxDist = -1;
        for (const room of rooms) {
            const dist = Math.hypot(room.center.x - entrancePos.x, room.center.y - entrancePos.y);
            if (dist > maxDist) {
                maxDist = dist;
                furthestRoom = room;
            }
        }
        const exitPosition = { x: furthestRoom.center.x, y: furthestRoom.center.y };
        grid[exitPosition.y][exitPosition.x] = { type: TILE_TYPE.EXIT };

        return { grid, rooms, entrancePos, exitPosition };
    }

    /**
     * Carve fuzzy hallways - EXACT copy from original
     */
    carveFuzzyHallway(grid, start, end) {
        let cx = start.x;
        let cy = start.y;
        let lastDir = null;

        while (cx !== end.x || cy !== end.y) {
            const dx = end.x - cx;
            const dy = end.y - cy;

            let moveHorizontal;
            if (dx === 0) {
                moveHorizontal = false;
            } else if (dy === 0) {
                moveHorizontal = true;
            } else {
                const continueChance = 0.75;
                if (lastDir === 'h' && Math.random() < continueChance) {
                    moveHorizontal = true;
                } else if (lastDir === 'v' && Math.random() < continueChance) {
                    moveHorizontal = false;
                } else {
                    moveHorizontal = Math.random() > 0.5;
                }
            }

            if (moveHorizontal) {
                cx += dx > 0 ? 1 : -1;
                lastDir = 'h';
            } else {
                cy += dy > 0 ? 1 : -1;
                lastDir = 'v';
            }

            // Carve hallway
            if (grid[cy] && grid[cy][cx]) {
                if (grid[cy][cx].type === TILE_TYPE.WALL) {
                    grid[cy][cx] = { type: TILE_TYPE.FLOOR, hallway: true };
                }
            }
        }
    }

    /**
     * Convert grid to rooms dictionary
     */
    gridToRooms(grid) {
        const rooms = {};
        
        grid.forEach((row, y) => {
            row.forEach((cell, x) => {
                if (cell.type === TILE_TYPE.FLOOR || cell.type === TILE_TYPE.ENTRANCE || cell.type === TILE_TYPE.EXIT) {
                    const roomId = cell.type === TILE_TYPE.ENTRANCE ? 'entrance' :
                                 cell.type === TILE_TYPE.EXIT ? 'exit' :
                                 `tile_${x}_${y}`;
                    
                    rooms[roomId] = {
                        id: roomId,
                        x: x,
                        z: y,  // Using z for vertical in 3D
                        worldX: x * TILE_SIZE,
                        worldZ: y * TILE_SIZE,
                        title: cell.hallway ? 'Corridor' : 
                              cell.type === TILE_TYPE.ENTRANCE ? 'Dungeon Entrance' :
                              cell.type === TILE_TYPE.EXIT ? 'Exit Portal' : 'Chamber',
                        type: cell.hallway ? 'corridor' : 
                             cell.type === TILE_TYPE.ENTRANCE ? 'entrance' :
                             cell.type === TILE_TYPE.EXIT ? 'exit' : 'chamber',
                        description: 'A dungeon tile.',
                        exits: {},
                        items: [],
                        monsters: [],
                        features: []
                    };

                    // Special features
                    if (cell.type === TILE_TYPE.ENTRANCE) {
                        rooms[roomId].description = 'The entrance to the dungeon.';
                        rooms[roomId].features = [{
                            id: 'lantern',
                            label: 'Take Lantern',
                            actionLabel: 'take_lantern',
                            consumed: false
                        }];
                    }
                }
            });
        });

        return rooms;
    }

    /**
     * Populate monsters
     */
    populateMonsters(rooms, budget) {
        const roomList = Object.values(rooms).filter(r => 
            r.type !== 'corridor' && r.id !== 'entrance' && r.id !== 'exit'
        );

        while (budget > 0 && roomList.length > 0) {
            const room = roomList[Math.floor(Math.random() * roomList.length)];
            const affordableMonsters = MONSTER_TABLE.filter(m => m.cost <= budget);
            
            if (affordableMonsters.length === 0) break;
            
            const monster = affordableMonsters[Math.floor(Math.random() * affordableMonsters.length)];
            
            room.monsters.push({
                id: `${monster.id}_${Math.random().toString(36).substr(2, 5)}`,
                name: monster.name,
                hp: monster.hp,
                maxHp: monster.hp,
                state: monster.state,
                x: 0,
                z: 0
            });
            
            budget -= monster.cost;
        }
    }

    /**
     * Populate items
     */
    populateItems(rooms) {
        const roomList = Object.values(rooms).filter(r => 
            r.type !== 'corridor' && r.id !== 'entrance'
        );

        roomList.forEach(room => {
            if (Math.random() < 0.4) {
                const item = LOOT_DATA[Math.floor(Math.random() * LOOT_DATA.length)];
                room.items.push({
                    ...item,
                    id: `${item.id}_${Math.random().toString(36).substr(2, 5)}`,
                    x: 0,
                    z: 0
                });
            }
        });
    }
}
