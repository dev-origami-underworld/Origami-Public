import { DungeonGenerator, TILE_SIZE } from "./dungeon_generator.js";
import { NarrativeEngine } from "./narrative.js";
import { MonsterAI, AI_STATES } from "./ai.js";
import { QuestManager } from "./quests.js";
import { PlayerProfile, ACTION_TYPES } from "./profile.js";
import { GameEngine } from "./games.js";
import { DungeonData } from "../data/dungeons.js";
import { Models } from "../renderer/models.js";

export class DungeonMaster {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.profile = new PlayerProfile();
    this.generator = new DungeonGenerator(this.profile);
    this.narrative = new NarrativeEngine();
    this.ai = new MonsterAI(this);
    this.quests = new QuestManager(this);
    this.games = new GameEngine(this);

    this.currentLevel = null;
    this.isCampaignMode = false;
  }

  async init() {
    console.log("[DMC] Initializing Dungeon Master Core...");
    await this.loadStaticModule();

    // Generate Initial Level (Procedural)
    this.generateNewLevel();

    // Optional: Load static dungeon if needed
    // this.loadDungeon("origami_catacombs");
  }

  async loadStaticModule() {
    // Simulate loading external modules or data
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  loadDungeon(dungeonId) {
    const dungeon = DungeonData.dungeons.find((d) => d.id === dungeonId);
    if (!dungeon) {
      console.error(
        `[DMC] Dungeon ${dungeonId} not found! Falling back to generator.`
      );
      this.generateNewLevel();
      return;
    }

    console.log(`[DMC] Loading Dungeon: ${dungeon.name}`);
    // Load Level 1
    const levelData = dungeon.levels[0];

    // Convert Array to Map for easier lookup if needed, or keep as is.
    // Our store expects a 'rooms' object/map usually, but let's adapt.
    // The generator returns { rooms: { id: room } }.
    // The static data has { rooms: [ room, room ] }.
    // We should convert array to map for consistency.
    const roomsMap = {};
    levelData.rooms.forEach((room) => {
      roomsMap[room.id] = room;
    });

    this.currentLevel = {
      id: levelData.id,
      name: levelData.name,
      width: levelData.width,
      height: levelData.height,
      startRoomId: "room_entrance", // Hardcoded for now based on data
      rooms: roomsMap,
    };

    this.store.setLevel(this.currentLevel);
    this.enterRoom(this.currentLevel.startRoomId);
  }

  generateNewLevel() {
    console.log("[DMC] Generating Level...");
    this.currentLevel = this.generator.generateLevel(1);
    this.store.setLevel(this.currentLevel);

    // Start at room 1
    this.enterRoom(this.currentLevel.startRoomId);
  }

  enterRoom(roomId) {
    const room = this.currentLevel.rooms[roomId];
    if (!room) {
      console.error(`[DMC] Room ${roomId} not found!`);
      return;
    }

    // 1. Update State
    this.store.updateRoom(room);

    // 2. Initialize Monsters (if any)
    if (room.monsters) {
      room.monsters.forEach((mob) => this.ai.initMonster(mob));
    }

    // 3. Render UI
    // this.ui.pushRoomCard(room); // Disabled per user request
    if (room.id === "start") {
      this.ui.pushRoomCard(room);
    }
    this.ui.logHTML(`<p>${room.description}</p>`);
    this.ui.updateStats();

    // 4. Generate Actions (Context-Aware)
    const actions = this.getAvailableActions(room);
    console.log("[DMC] Room Actions:", actions); // Debug
    this.ui.renderGuideButtons(actions);

    // 5. Process Immediate Events
    this.processRoomEvents(room);
  }

  getAvailableActions(room) {
    const actions = [];

    // Monster Interactions - ONLY if directly in front of player
    const px = room.worldX || 0;
    const pz = room.worldZ || 0;

    // Get player facing direction from camera (stored in controller)
    const playerRotation = this.store.state.rotation || 0; // radians
    const playerDirX = Math.sin(playerRotation);
    const playerDirZ = -Math.cos(playerRotation);

    let hasHostileNearby = false;

    Object.values(this.currentLevel.rooms).forEach((r) => {
      if (r.monsters && r.monsters.length > 0) {
        const rx = r.worldX || 0;
        const rz = r.worldZ || 0;
        const dist = Math.hypot(rx - px, rz - pz);

        if (dist <= 7.5) {
          // Within 6 tiles (7.5 world units)
          r.monsters.forEach((mob) => {
            if (mob.state === AI_STATES.HOSTILE) {
              hasHostileNearby = true;

              // Check if monster is IN FRONT of player
              const toMonsterX = rx - px;
              const toMonsterZ = rz - pz;
              const monsterDist = Math.hypot(toMonsterX, toMonsterZ);

              if (monsterDist > 0.1) {
                // Avoid division by zero
                // Normalize direction to monster
                const dirX = toMonsterX / monsterDist;
                const dirZ = toMonsterZ / monsterDist;

                // Dot product to check if in front
                const dotProduct = playerDirX * dirX + playerDirZ * dirZ;

                // Monster is in front if dot > 0.7 (within ~45 degree cone)
                // AND within 3 tiles distance
                if (dotProduct > 0.7 && monsterDist <= 3.75) {
                  const gridDist = Math.round(monsterDist / 1.25);
                  actions.push({
                    label: `Attack ${mob.name} (${gridDist})`,
                    command: `attack ${mob.id}`,
                    appearance: "red",
                    featured: true,
                  });
                }
              }
            } else if (mob.state === AI_STATES.ALLY && dist <= 3.75) {
              actions.push({
                label: `Command ${mob.name}`,
                command: `command ${mob.id}`,
              });
            }
          });
        }
      }
    });

    if (hasHostileNearby) {
      actions.push({
        label: `Gamble`,
        command: `gamble`,
      });
    }

    // Custom Actions
    if (room.actions) actions.push(...room.actions);

    // Movement
    if (room.exits) {
      Object.keys(room.exits).forEach((dir) => {
        actions.push({ label: `Go ${dir}`, command: `go ${dir}` });
      });
    }

    // Items
    if (room.items) {
      room.items.forEach((item) => {
        actions.push({
          label: `Take ${item.name}`,
          command: `take ${item.id}`,
        });
      });
    }

    // Features
    if (room.features) {
      room.features.forEach((feature) => {
        if (!feature.consumed) {
          actions.push({ label: feature.label, command: feature.actionLabel });
        }
      });
    }

    return actions;
  }

  processRoomEvents(room) {
    if (room.monsters) {
      room.monsters.forEach((mob) => {
        const action = this.ai.processTurn(mob, this.store.state.player);
        if (action && action.message) {
          this.ui.logHTML(`<p class="warning">${action.message}</p>`);
          this.ui.updateStats();
          if (action.type === "damage") this.ui.flashIndicator("damage");
        }
      });
    }
  }

  handleCommand(cmd) {
    const parts = cmd.toLowerCase().split(" ");
    const verb = parts[0];
    const targetId = parts[1];

    if (verb === "calm" && targetId) {
      this.profile.recordAction(ACTION_TYPES.PACIFY);
      this.handlePacify(targetId);
    } else if (verb === "attack" && targetId) {
      this.profile.recordAction(ACTION_TYPES.COMBAT);
      // Note: Actual combat logic might be handled via handleInteraction if raycast
      // But if command comes from button click (which sends 'attack mob_id'), we handle it here
      this.ui.logHTML(`<p>You attack the ${targetId}!</p>`);
    } else if (verb === "gamble" || verb === "play") {
      this.profile.recordAction(ACTION_TYPES.GAMBLE);
      this.handleGamble();
    } else if (verb === "take" && targetId) {
      this.profile.recordAction(ACTION_TYPES.EXPLORE);
      this.handleTake(targetId);
    } else if (verb === "go" && targetId) {
      this.profile.recordAction(ACTION_TYPES.EXPLORE);
      this.handleMovement(targetId);
    } else if (cmd === "take_lantern") {
      this.handleTakeLantern();
    } else {
      this.ui.logHTML(`<p>You try to ${verb}, but nothing happens.</p>`);
    }
  }

  handleGamble() {
    this.ui.logHTML(`<p>You sit down to play a game of chance...</p>`);
    // Logic for gambling would go here
  }

  handleTake(targetId) {
    const room = this.store.state.currentRoom;
    const itemIndex = room.items?.findIndex((i) => i.id === targetId);

    if (itemIndex !== undefined && itemIndex !== -1) {
      const item = room.items[itemIndex];
      room.items.splice(itemIndex, 1);

      this.store.addInventoryItem(item);
      this.ui.renderInventory();
      this.ui.updateStats();

      // Show Loot Card (New Feature)
      if (this.ui.showLootCard) {
        this.ui.showLootCard(item, Models);
      } else {
        this.ui.logHTML(`<p>You take the ${item.name}.</p>`);
      }

      this.triggerEvent("item_taken", {
        roomId: room.id,
        itemId: item.id,
        itemIndex: itemIndex,
      });
      const actions = this.getAvailableActions(room);
      this.ui.renderGuideButtons(actions);
    } else {
      this.ui.logHTML("<p>You don't see that here.</p>");
    }
  }

  handleTakeLantern() {
    const room = this.store.state.currentRoom;
    const feature = room.features?.find((f) => f.id === "lantern");

    if (feature && !feature.consumed) {
      feature.consumed = true;
      this.ui.showFlashlightButton();

      // Trigger event for Controller to handle Renderer updates
      this.triggerEvent("lantern_taken", {});

      // Show Loot Page
      this.ui.createEventCard(
        "Loot Discovered!",
        "The glowworm inside shines in the mirrors, casting a bright beam that cuts through the dungeon's darkness, revealing the path ahead.",
        "lantern",
        "Magical Glowworm Lantern"
      );

      // Refresh buttons
      const actions = this.getAvailableActions(room);
      this.ui.renderGuideButtons(actions);
    }
  }

  handlePacify(targetId) {
    const room = this.currentLevel.rooms[this.store.state.currentRoom.id];
    const mob = room.monsters?.find(
      (m) => m.id === targetId || m.name.toLowerCase().includes(targetId)
    );

    if (mob) {
      const result = this.ai.attemptPacify(mob, 20);
      this.ui.logHTML(`<p>${result.message}</p>`);
      const actions = this.getAvailableActions(room);
      this.ui.renderGuideButtons(actions);
    } else {
      this.ui.logHTML("<p>There is no one here to calm.</p>");
    }
  }

  handleMovement(direction) {
    const room = this.store.state.currentRoom;
    const nextRoomId = room.exits?.[direction];
    if (nextRoomId) {
      this.enterRoom(nextRoomId);
    } else {
      this.ui.logHTML("<p>You can't go that way.</p>");
    }
  }

  handleLook(hit) {
    const id = hit.id;
    const parts = id.split("_");
    const type = parts[0];

    if (type === "wall") {
      this.ui.logHTML(
        "<p>You see a sturdy wall, reinforced with ancient wood.</p>"
      );
    } else if (type === "mob") {
      const roomId = parts[1];
      const mobIndex = parseInt(parts[2]);
      const room = this.store.state.currentRoom;

      if (
        room &&
        room.id === roomId &&
        room.monsters &&
        room.monsters[mobIndex]
      ) {
        const mob = room.monsters[mobIndex];
        const status = mob.state === "HOSTILE" ? "hostile" : "peaceful";
        this.ui.logHTML(
          `<p>You see a <strong>${mob.name}</strong>. It appears ${status}.</p>`
        );
      } else {
        this.ui.logHTML("<p>You see a creature fading into the shadows.</p>");
      }
    } else if (type === "item") {
      const roomId = parts[1];
      const itemIndex = parseInt(parts[2]);
      const room = this.store.state.currentRoom;

      if (room && room.id === roomId && room.items && room.items[itemIndex]) {
        const item = room.items[itemIndex];
        this.ui.logHTML(
          `<p>You see a <strong>${item.name}</strong> lying on the ground.</p>`
        );
      }
    } else if (type === "label") {
      this.ui.logHTML("<p>A floating sign marking the room.</p>");
    } else {
      this.ui.logHTML("<p>You see something undefined.</p>");
    }
  }

  handleInteraction(verb, hit) {
    const id = hit.id;
    const parts = id.split("_");
    const type = parts[0];

    if (verb === "dig") {
      if (type === "wall") {
        this.ui.logHTML("<p>You dig into the wall, causing it to crumble!</p>");
        this.triggerEvent("wall_destroyed", { id: id });
      } else {
        this.ui.logHTML("<p>You can't dig that.</p>");
      }
    } else if (verb === "attack") {
      if (type === "mob") {
        const roomId = parts[1];
        const mobIndex = parseInt(parts[2]);
        const room = this.store.state.currentRoom;

        if (
          room &&
          room.id === roomId &&
          room.monsters &&
          room.monsters[mobIndex]
        ) {
          const mob = room.monsters[mobIndex];
          this.ui.logHTML(`<p>You hit the ${mob.name}!</p>`);
          this.ui.logHTML(
            `<p class="damage-text">The ${mob.name} is defeated!</p>`
          );
          room.monsters.splice(mobIndex, 1);
          this.triggerEvent("mob_defeated", { id: id });
          const actions = this.getAvailableActions(room);
          this.ui.renderGuideButtons(actions);
        } else {
          this.ui.logHTML("<p>You hit something, but it's already gone.</p>");
        }
      } else {
        this.ui.logHTML("<p>You attack the wall. It doesn't care.</p>");
      }
    }
  }

  handleFloorClick(point) {
    const playerRoom = this.store.state.currentRoom;
    if (!playerRoom || !this.currentLevel) return;

    // 1) Determine target room (nearest to clicked world point)
    const targetRoom = this.findNearestRoomToPoint(point);
    if (!targetRoom) {
      this.ui.logHTML("<p>You can't get there from here.</p>");
      return;
    }

    const start = { x: playerRoom.x, z: playerRoom.z };
    const target = { x: targetRoom.x, z: targetRoom.z };

    console.log(
      `[DMC] Pathfinding from (${start.x},${start.z}) to (${target.x},${target.z})`
    );

    // 2) Find Path (BFS on grid rooms)
    const path = this.findPath(start.x, start.z, target.x, target.z);
    if (!path || path.length === 0) {
      this.ui.logHTML("<p>You can't get there from here.</p>");
      return;
    }

    // 3) Stop early at hallway intersections / branches (>2 exits)
    const trimmedPath = this.trimPathForIntersections(path, start);

    // 4) Convert to world coordinates for renderer
    const worldPath = trimmedPath.map((p) => ({
      x: p.x * TILE_SIZE,
      z: p.z * TILE_SIZE,
    }));

    // 5) Visualize nodes + path
    this.triggerEvent("show_path", { points: worldPath, nodes: trimmedPath });

    // 6) Start Auto-Walk
    this.startAutoWalk(worldPath);
  }

  findPath(startX, startZ, endX, endZ) {
    // Simple BFS on the grid
    const queue = [{ x: startX, z: startZ, path: [] }];
    const visited = new Set();
    visited.add(`${startX},${startZ}`);

    // Limit search depth
    let iterations = 0;

    while (queue.length > 0 && iterations < 2000) {
      iterations++;
      const current = queue.shift();

      if (current.x === endX && current.z === endZ) {
        return current.path;
      }

      const neighbors = this.getWalkableNeighbors(current.x, current.z);

      for (const n of neighbors) {
        const key = `${n.x},${n.z}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({
            x: n.x,
            z: n.z,
            path: [...current.path, { x: n.x, z: n.z }],
          });
        }
      }
    }
    return null;
  }

  startAutoWalk(path) {
    // Stop existing movement
    this.triggerEvent("stop_autowalk", {});

    // Send path to Controller/Engine to handle real-time movement
    this.triggerEvent("start_autowalk", { path: path });

    this.ui.logHTML("<p>Auto-walking...</p>");
  }

  findNearestRoomToPoint(point) {
    if (!this.currentLevel || !point) return null;
    let best = null;
    let bestDist = Infinity;
    Object.values(this.currentLevel.rooms).forEach((room) => {
      const dx = (room.worldX ?? room.x * TILE_SIZE) - point.x;
      const dz = (room.worldZ ?? room.z * TILE_SIZE) - point.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < bestDist) {
        bestDist = dist2;
        best = room;
      }
    });
    return best;
  }

  getWalkableNeighbors(x, z) {
    const deltas = [
      { dx: 0, dz: -1 },
      { dx: 0, dz: 1 },
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
    ];
    const neighbors = [];
    deltas.forEach(({ dx, dz }) => {
      const nx = x + dx;
      const nz = z + dz;
      const room = this.getRoomByGrid(nx, nz);
      if (room) neighbors.push({ x: nx, z: nz, room });
    });
    return neighbors;
  }

  getRoomByGrid(x, z) {
    if (!this.currentLevel) return null;
    return (
      Object.values(this.currentLevel.rooms).find(
        (r) => Math.round(r.x) === x && Math.round(r.z) === z
      ) || null
    );
  }

  trimPathForIntersections(path, start) {
    if (!Array.isArray(path) || path.length === 0) return path;
    const trimmed = [];
    for (let i = 0; i < path.length; i += 1) {
      const step = path[i];
      trimmed.push(step);
      const neighborCount = this.getWalkableNeighbors(step.x, step.z).length;
      const isIntersection = neighborCount > 2;
      if (isIntersection && i < path.length - 1) {
        break; // stop at the first branch/intersection before destination
      }
    }
    return trimmed;
  }

  triggerEvent(eventName, data) {
    console.log(`[DMC] Event Triggered: ${eventName}`, data);
    this.quests.onEvent(eventName, data);

    // Dispatch to window for Controller to pick up (since DM doesn't know Controller directly)
    window.dispatchEvent(
      new CustomEvent("origami:engine", {
        detail: { type: eventName, data: data },
      })
    );
  }
}
