(function (global) {
  class OrigamiCore {
    constructor() {
      this.TILE = {
        WALL: "wall",
        FLOOR: "floor",
        ENTRANCE: "entrance",
        EXIT: "exit",
      };

      this.settings = {
        MAP_COLS: 80, // Nethack/Rogue standard width
        MAP_ROWS: 24, // Nethack/Rogue standard height
        ROOM_COUNT: 12,
        TILE_SIZE: 2,
      };

      this.state = this.createInitialState();
      this.clients = new Map();
      this.nextClientId = 1;

      this.handleMessage = this.handleMessage.bind(this);
      window.addEventListener("message", this.handleMessage);
    }

    createInitialState() {
      // Initialize with an empty dungeon to avoid "bad map" flash
      // The actual map will be synced from Adventure Core
      const dungeon = {
        grid: [],
        rooms: [],
        monsters: [],
        entrancePosition: { x: 0, y: 0 },
      };

      return {
        tick: 0,
        mapVersion: Date.now(),
        dungeon,
        player: {
          tileX: 0,
          tileY: 0,
          rot: -Math.PI / 2,
          isMoving: false,
        },
        lastEvent: null,
        lastReason: "init",
      };
    }

    handleMessage(event) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      switch (data.type) {
        case "origamiClientReady":
          this.registerClient(event.source, event.origin, data);
          break;
        case "origamiCommand":
          this.handleCommand(event.source, data);
          break;
        case "origamiRequestState":
          this.sendStateToClient(event.source, "request");
          break;
        default:
          break;
      }
    }

    registerClient(win, origin, payload = {}) {
      if (!win) return;
      if (this.clients.has(win)) {
        this.sendStateToClient(win, "resync");
        return;
      }
      const id = `client-${this.nextClientId++}`;
      this.clients.set(win, {
        id,
        origin,
        role: payload.role || "unknown",
        name: payload.name || id,
      });
      this.sendStateToClient(win, "welcome");
    }

    handleCommand(win, payload) {
      if (!this.clients.has(win)) {
        this.registerClient(win, "*");
      }
      const { command, data } = payload;
      if (!command) return;
      const changed = this.processCommand(command, data);
      this.finalizeCommand(command, data, changed);
    }

    issueCommand(command, data = {}) {
      if (!command) return;
      const changed = this.processCommand(command, data);
      this.finalizeCommand(command, data, changed);
    }

    processCommand(command, data = {}) {
      let changed = false;
      if (command === "move") {
        const { dx = 0, dy = 0 } = data;
        changed = this.attemptMove(dx, dy);
      } else if (command === "rotate") {
        const { delta = 0 } = data;
        changed = this.rotatePlayer(delta);
      } else if (command === "set-rotation") {
        const { value } = data;
        if (typeof value === "number" && isFinite(value)) {
          this.state.player.rot = this.normalizeRotation(value);
          changed = true;
        }
      } else if (command === "regenerate") {
        this.state = this.createInitialState();
        changed = true;
      } else if (command === "monsterDefeated") {
        this.state.lastEvent = {
          kind: "monsterDefeated",
          tileX: data?.tileX ?? this.state.player.tileX,
          tileY: data?.tileY ?? this.state.player.tileY,
          monsterName: data?.monsterName || "Monster",
          timestamp: Date.now(),
        };
        const monsterMarked = this.markMonsterDefeated(
          data?.monsterId,
          data?.tileX,
          data?.tileY
        );
        if (!monsterMarked) {
          console.warn("origamiCore monsterDefeated target missing", data);
        }
        changed = true;
      }
      return changed;
    }

    finalizeCommand(command, data, changed) {
      if (!changed) return;
      this.state.tick += 1;
      this.state.lastReason = command;
      this.broadcastState(command);
      this.emitPlayerEvent(command, data);
    }

    attemptMove(dx, dy) {
      if (!dx && !dy) return false;
      const player = this.state.player;
      const targetX = player.tileX + dx;
      const targetY = player.tileY + dy;

      const row = this.state.dungeon.grid[targetY];
      const tile = row && row[targetX];
      if (!tile || tile.type === this.TILE.WALL) {
        return false;
      }

      player.tileX = targetX;
      player.tileY = targetY;
      player.isMoving = true;
      return true;
    }

    rotatePlayer(delta) {
      if (!delta) return false;
      this.state.player.rot = this.normalizeRotation(
        this.state.player.rot + delta
      );
      return true;
    }

    sendStateToClient(win, reason = "sync") {
      if (!win) return;
      const snapshot = this.createSnapshot(reason);
      try {
        win.postMessage(
          {
            type: "origamiStateSync",
            state: snapshot,
          },
          "*"
        );
      } catch (err) {
        console.error("origamiCore sendState failed", err);
      }
    }

    broadcastState(reason = "update") {
      const snapshot = this.createSnapshot(reason);
      for (const win of this.clients.keys()) {
        try {
          win.postMessage({ type: "origamiStateSync", state: snapshot }, "*");
        } catch (err) {
          console.warn("origamiCore broadcast failed", err);
        }
      }
    }

    broadcastEvent(event) {
      if (!event) return;
      for (const win of this.clients.keys()) {
        try {
          win.postMessage({ type: "origamiEvent", event }, "*");
        } catch (err) {
          console.warn("origamiCore event broadcast failed", err);
        }
      }
    }

    emitPlayerEvent(command, data = {}) {
      if (command === "move") {
        this.broadcastEvent({
          kind: "playerMove",
          dx: data?.dx ?? 0,
          dy: data?.dy ?? 0,
          tileX: this.state.player.tileX,
          tileY: this.state.player.tileY,
          rot: this.state.player.rot,
          room: this.describeCurrentRoom(),
          tick: this.state.tick,
          timestamp: Date.now(),
        });
      } else if (command === "rotate") {
        this.broadcastEvent({
          kind: "playerRotate",
          delta: data?.delta ?? 0,
          tileX: this.state.player.tileX,
          tileY: this.state.player.tileY,
          rot: this.state.player.rot,
          room: this.describeCurrentRoom(),
          tick: this.state.tick,
          timestamp: Date.now(),
        });
      } else if (command === "regenerate") {
        this.broadcastEvent({
          kind: "dungeonRegenerated",
          mapVersion: this.state.mapVersion,
          tick: this.state.tick,
          timestamp: Date.now(),
        });
      } else if (command === "monsterDefeated") {
        this.broadcastEvent({
          kind: "monsterDefeated",
          tileX: data?.tileX ?? this.state.player.tileX,
          tileY: data?.tileY ?? this.state.player.tileY,
          monsterName: data?.monsterName || "Monster",
          tick: this.state.tick,
          timestamp: Date.now(),
        });
      }
    }

    describeCurrentRoom() {
      if (
        !this.state ||
        !this.state.dungeon ||
        !Array.isArray(this.state.dungeon.grid)
      ) {
        return null;
      }
      const { tileX, tileY } = this.state.player;
      const row = this.state.dungeon.grid[tileY];
      if (!row) return null;
      const cell = row[tileX];
      if (!cell) return null;
      const roomId = cell.roomId ?? cell.room ?? null;
      let roomMeta = null;
      if (roomId && Array.isArray(this.state.dungeon.rooms)) {
        roomMeta = this.state.dungeon.rooms.find((room) => room.id === roomId);
      }
      return {
        id: roomId,
        detail: cell.detail || null,
        hallway: !!cell.hallway,
        type: cell.type,
        entrance: cell.type === this.TILE.ENTRANCE,
        exit: cell.type === this.TILE.EXIT,
        meta: roomMeta
          ? {
              id: roomMeta.id,
              x: roomMeta.x,
              y: roomMeta.y,
              w: roomMeta.w,
              h: roomMeta.h,
              center: { ...roomMeta.center },
              name: roomMeta.style?.name,
              description: roomMeta.style?.description,
            }
          : null,
      };
    }

    createSnapshot(reason) {
      return {
        tick: this.state.tick,
        mapVersion: this.state.mapVersion,
        reason,
        settings: { ...this.settings },
        dungeon: this.state.dungeon
          ? {
              grid: this.state.dungeon.grid,
              rooms: this.state.dungeon.rooms,
              entrancePosition: this.state.dungeon.entrancePosition,
              exitPosition: this.state.dungeon.exitPosition,
              monsters: Array.isArray(this.state.dungeon.monsters)
                ? this.state.dungeon.monsters.map((monster) => ({
                    ...monster,
                  }))
                : [],
            }
          : null,
        player: { ...this.state.player },
        lastEvent: this.state.lastEvent ? { ...this.state.lastEvent } : null,
        timestamp: Date.now(),
      };
    }

    normalizeRotation(angle) {
      const tau = Math.PI * 2;
      angle = angle % tau;
      if (angle <= -Math.PI) angle += tau;
      if (angle > Math.PI) angle -= tau;
      return angle;
    }

    generateDungeonMap(cols, rows, roomCount) {
      // DEPRECATED: Map generation is now handled by Origami.Adventure.html (Book View)
      // This function returns an empty shell to satisfy legacy calls if any remain.
      console.warn(
        "origamiCore.generateDungeonMap is deprecated. Using Adventure View map."
      );

      const grid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({ type: this.TILE.WALL }))
      );

      return {
        grid,
        rooms: [],
        entrancePosition: { x: 0, y: 0 },
        exitPosition: { x: 0, y: 0 },
        monsters: [],
      };
    }

    seedMonsters(dungeon) {
      return [];
    }

    markMonsterDefeated(monsterId, tileX, tileY) {
      if (!this.state?.dungeon || !Array.isArray(this.state.dungeon.monsters)) {
        return false;
      }
      const { monsters } = this.state.dungeon;
      const target = monsters.find((monster) => {
        if (monsterId && monster.id === monsterId) return true;
        if (typeof tileX === "number" && typeof tileY === "number") {
          return monster.tileX === tileX && monster.tileY === tileY;
        }
        return false;
      });
      if (!target) return false;
      target.status = "dead";
      target.defeatedAt = Date.now();
      if (typeof tileX === "number") target.tileX = tileX;
      if (typeof tileY === "number") target.tileY = tileY;
      return true;
    }

    roomOverlaps(a, b, buffer) {
      return (
        a.x - buffer <= b.x + b.w &&
        a.x + a.w + buffer >= b.x &&
        a.y - buffer <= b.y + b.h &&
        a.y + a.h + buffer >= b.y
      );
    }

    roomDistance(a, b) {
      const dx = a.center.x - b.center.x;
      const dy = a.center.y - b.center.y;
      return Math.hypot(dx, dy);
    }

    fillRoom(grid, room) {
      for (let y = room.y; y < room.y + room.h; y += 1) {
        for (let x = room.x; x < room.x + room.w; x += 1) {
          grid[y][x] = {
            type: this.TILE.FLOOR,
            roomId: room.id,
            room: true,
            hallway: false,
          };
        }
      }
    }

    createVerticalHall(grid, col, yStart, yEnd) {
      for (let y = yStart; y <= yEnd; y += 1) {
        if (!grid[y] || !grid[y][col]) continue;
        const existing = grid[y][col];
        grid[y][col] = {
          ...existing,
          type: this.TILE.FLOOR,
          hallway: true,
          room: existing?.room ?? false,
        };
      }
    }

    carveHallway(grid, start, end) {
      let { x, y } = { x: start.x, y: start.y };
      while (x !== end.x) {
        const existing = grid[y][x] || {};
        grid[y][x] = {
          ...existing,
          type: this.TILE.FLOOR,
          hallway: true,
          room: existing.room ?? false,
        };
        x += x < end.x ? 1 : -1;
      }
      while (y !== end.y) {
        const existing = grid[y][x] || {};
        grid[y][x] = {
          ...existing,
          type: this.TILE.FLOOR,
          hallway: true,
          room: existing.room ?? false,
        };
        y += y < end.y ? 1 : -1;
      }
      const existing = grid[end.y][end.x] || {};
      grid[end.y][end.x] = {
        ...existing,
        type: this.TILE.FLOOR,
        hallway: true,
        room: existing.room ?? false,
      };
    }

    markSpecialTile(grid, position, type) {
      const { x, y } = position;
      const existing = grid[y]?.[x] || {};
      grid[y][x] = {
        ...existing,
        type,
        hallway: existing.hallway ?? type === this.TILE.ENTRANCE,
        room: existing.room ?? false,
      };
    }

    addRoomDetailing(grid, rooms) {
      rooms.forEach((room) => {
        const { x, y, w, h } = room;
        const style = room?.style || this.pickRoomStyle(room.id);
        const torchTarget = style?.torches ?? 2;
        for (let i = 0; i < torchTarget; i += 1) {
          const torchX = x + 1 + Math.floor(Math.random() * Math.max(1, w - 2));
          const torchY = y + 1 + Math.floor(Math.random() * Math.max(1, h - 2));
          const tile = grid[torchY]?.[torchX];
          if (
            !tile ||
            tile.type === this.TILE.EXIT ||
            tile.type === this.TILE.ENTRANCE
          ) {
            continue;
          }
          grid[torchY][torchX] = {
            ...tile,
            type: this.TILE.FLOOR,
            detail: "torch",
            roomId: room.id,
          };
        }

        if (style?.centerpiece !== "none") {
          const centerX = x + Math.floor(w / 2);
          const centerY = y + Math.floor(h / 2);
          const centerTile = grid[centerY]?.[centerX];
          if (
            centerTile &&
            centerTile.type !== this.TILE.EXIT &&
            centerTile.type !== this.TILE.ENTRANCE
          ) {
            grid[centerY][centerX] = {
              ...centerTile,
              type: this.TILE.FLOOR,
              detail: style?.centerpiece || "pillar",
              roomId: room.id,
            };
          }
        }

        if (style?.lanternBands) {
          style.lanternBands.forEach((band) => {
            const axis = band.axis || "x";
            const offset = band.offset ?? 0;
            const density = band.density ?? 0.35;
            const rangeStart = axis === "x" ? x + 1 : y + 1;
            const rangeEnd = axis === "x" ? x + w - 2 : y + h - 2;
            for (let pos = rangeStart; pos <= rangeEnd; pos += 1) {
              if (Math.random() > density) continue;
              const tileX =
                axis === "x"
                  ? pos
                  : this.clamp(x + 1 + offset, x + 1, x + w - 2);
              const tileY =
                axis === "x"
                  ? this.clamp(y + 1 + offset, y + 1, y + h - 2)
                  : pos;
              const tile = grid[tileY]?.[tileX];
              if (!tile || tile.detail || tile.hallway) continue;
              if (
                tile.type === this.TILE.EXIT ||
                tile.type === this.TILE.ENTRANCE
              ) {
                continue;
              }
              grid[tileY][tileX] = {
                ...tile,
                type: this.TILE.FLOOR,
                detail: "torch",
                roomId: room.id,
              };
            }
          });
        }
      });
    }

    createRogueBlueprint(cols, rows, desiredRooms) {
      const macroCols = 4;
      const macroRows = 3;
      const sectorW = Math.max(6, Math.floor(cols / macroCols));
      const sectorH = Math.max(6, Math.floor(rows / macroRows));
      const capacity = macroCols * macroRows;
      const targetRooms = Math.min(Math.max(desiredRooms || 12, 6), capacity);
      const rooms = [];
      const roomGrid = Array.from({ length: macroRows }, () =>
        Array.from({ length: macroCols }, () => null)
      );
      let roomId = 1;

      for (let macroY = 0; macroY < macroRows; macroY += 1) {
        for (let macroX = 0; macroX < macroCols; macroX += 1) {
          const mustPlace = rooms.length < targetRooms;
          const shouldPlace = mustPlace || Math.random() < 0.65;
          if (!shouldPlace) continue;
          const usableW = Math.max(4, sectorW - 2);
          const usableH = Math.max(4, sectorH - 2);
          const w = this.randomInt(Math.min(usableW, 6), usableW);
          const h = this.randomInt(Math.min(usableH, 6), usableH);
          const minX = Math.max(1, macroX * sectorW + 1);
          const minY = Math.max(1, macroY * sectorH + 1);
          const maxX = Math.min(cols - w - 2, minX + sectorW - w - 1);
          const maxY = Math.min(rows - h - 2, minY + sectorH - h - 1);
          if (maxX < minX || maxY < minY) continue;
          const x = this.randomInt(minX, maxX);
          const y = this.randomInt(minY, maxY);
          const id = roomId++;
          const room = {
            id,
            x,
            y,
            w,
            h,
            center: {
              x: x + Math.floor(w / 2),
              y: y + Math.floor(h / 2),
            },
            style: this.pickRoomStyle(id),
          };
          rooms.push(room);
          roomGrid[macroY][macroX] = room;
        }
      }

      const edges = [];
      for (let macroY = 0; macroY < macroRows; macroY += 1) {
        for (let macroX = 0; macroX < macroCols; macroX += 1) {
          const room = roomGrid[macroY][macroX];
          if (!room) continue;
          const east = roomGrid[macroY]?.[macroX + 1];
          const south = roomGrid[macroY + 1]?.[macroX];
          if (east) {
            edges.push({
              a: room,
              b: east,
              weight: this.roomDistance(room, east),
            });
          }
          if (south) {
            edges.push({
              a: room,
              b: south,
              weight: this.roomDistance(room, south),
            });
          }
        }
      }

      const corridors = [];
      if (rooms.length) {
        const connected = new Set();
        const seed = rooms[Math.floor(Math.random() * rooms.length)];
        connected.add(seed.id);
        while (connected.size < rooms.length) {
          let bestEdge = null;
          let bestWeight = Infinity;
          edges.forEach((edge) => {
            const aIn = connected.has(edge.a.id);
            const bIn = connected.has(edge.b.id);
            if (aIn === bIn) return;
            if (edge.weight < bestWeight) {
              bestWeight = edge.weight;
              bestEdge = edge;
            }
          });
          if (!bestEdge) break;
          corridors.push(
            this.createCorridorPath(
              Math.round(bestEdge.a.center.x),
              Math.round(bestEdge.a.center.y),
              Math.round(bestEdge.b.center.x),
              Math.round(bestEdge.b.center.y)
            )
          );
          connected.add(bestEdge.a.id);
          connected.add(bestEdge.b.id);
        }

        const extraEdges = edges.filter((edge) => {
          return !corridors.some((corridor) =>
            this.corridorMatchesRooms(corridor, edge.a, edge.b)
          );
        });
        extraEdges
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.max(1, Math.floor(extraEdges.length * 0.4)))
          .forEach((edge) => {
            corridors.push(
              this.createCorridorPath(
                Math.round(edge.a.center.x),
                Math.round(edge.a.center.y),
                Math.round(edge.b.center.x),
                Math.round(edge.b.center.y)
              )
            );
          });
      }

      return { rooms, corridors };
    }

    corridorMatchesRooms(corridor, roomA, roomB) {
      if (!Array.isArray(corridor) || corridor.length < 2) return false;
      const start = corridor[0];
      const end = corridor[corridor.length - 1];
      const matchesA = this.pointInsideRoom(start, roomA);
      const matchesB = this.pointInsideRoom(end, roomB);
      const matchesReverse = this.pointInsideRoom(start, roomB);
      const matchesReverseB = this.pointInsideRoom(end, roomA);
      return (matchesA && matchesB) || (matchesReverse && matchesReverseB);
    }

    pointInsideRoom(point, room) {
      if (!point || !room) return false;
      return (
        point.x >= room.x &&
        point.x < room.x + room.w &&
        point.y >= room.y &&
        point.y < room.y + room.h
      );
    }

    createCorridorPath(x0, y0, x1, y1) {
      const path = [];
      // Nethack/Rogue style: 99% single tile wide.
      // 50% Straight (L-shape with one turn), 40% L-Shape (which is also one turn?),
      // actually "Straight" usually means try to go straight if possible, but here we connect two points.
      // "Straight 50% L-Shape 40%" -> Maybe they mean:
      // 50% chance to go Horizontal then Vertical (or V then H) - simple L shape.
      // 40% chance to do something else? Or maybe "Straight" means if x aligned, go straight?
      // Let's interpret:
      // 50% chance: Move X then Y (L-shape)
      // 40% chance: Move Y then X (L-shape)
      // 10% chance: Complex/Zigzag? Or just random?
      // User said: "hallways 99% single tile wide... straight 50% l-Shape 40%"
      // If points are not aligned, you MUST turn at least once (L-shape).
      // If points ARE aligned, it is straight.
      // Maybe they mean "Dogleg" vs "Zigzag"?
      // Let's implement a standard L-shape corridor which is the hallmark of Rogue.
      // We pick a "turning point".

      const coin = Math.random();
      let midX, midY;

      if (coin < 0.5) {
        // Horizontal first, then Vertical
        midX = x1;
        midY = y0;
      } else {
        // Vertical first, then Horizontal
        midX = x0;
        midY = y1;
      }

      // Draw segment 1: (x0, y0) -> (midX, midY)
      this.drawLine(path, x0, y0, midX, midY);
      // Draw segment 2: (midX, midY) -> (x1, y1)
      this.drawLine(path, midX, midY, x1, y1);

      return path;
    }

    drawLine(path, x0, y0, x1, y1) {
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      let x = x0;
      let y = y0;

      path.push({ x, y });
      while (x !== x1 || y !== y1) {
        if (x !== x1) x += dx;
        if (y !== y1) y += dy;
        path.push({ x, y });
      }
    }

    compactCorridor(points) {
      const compacted = [];
      points.forEach((point) => {
        if (!point) return;
        const safePoint = {
          x: Math.round(point.x),
          y: Math.round(point.y),
        };
        const last = compacted[compacted.length - 1];
        if (!last || last.x !== safePoint.x || last.y !== safePoint.y) {
          compacted.push(safePoint);
        }
      });
      return compacted;
    }

    applyOrigamiInsets(grid, room) {
      const foldProfile = room?.style?.foldProfile;
      if (!foldProfile) return;
      const inset = Math.max(0, foldProfile.inset ?? 0);
      if (inset > 0) {
        this.trimRoomCorners(grid, room, inset);
      }
      if (Array.isArray(foldProfile.alcoves)) {
        foldProfile.alcoves.forEach((alcove) => {
          this.carveRoomAlcove(grid, room, alcove);
        });
      }
    }

    trimRoomCorners(grid, room, inset) {
      const corners = [
        { x: room.x, y: room.y, dx: 1, dy: 1 },
        { x: room.x + room.w - 1, y: room.y, dx: -1, dy: 1 },
        { x: room.x, y: room.y + room.h - 1, dx: 1, dy: -1 },
        {
          x: room.x + room.w - 1,
          y: room.y + room.h - 1,
          dx: -1,
          dy: -1,
        },
      ];
      corners.forEach((corner) => {
        for (let stepX = 0; stepX < inset; stepX += 1) {
          for (let stepY = 0; stepY < inset - stepX; stepY += 1) {
            const tx = corner.x + corner.dx * stepX;
            const ty = corner.y + corner.dy * stepY;
            this.setWall(grid, tx, ty);
          }
        }
      });
    }

    carveRoomAlcove(grid, room, alcove) {
      if (!alcove || !room) return;
      const depth = Math.max(1, Math.floor(alcove.depth ?? 1));
      const width = Math.max(1, Math.floor(alcove.width ?? 2));
      if (alcove.side === "north" || alcove.side === "south") {
        const maxWidth = Math.max(1, room.w - 2);
        const actualWidth = Math.min(width, maxWidth);
        const offset = Math.max(
          1,
          Math.min(
            room.w - actualWidth - 1,
            alcove.offset ?? this.randomInt(1, maxWidth - actualWidth + 1)
          )
        );
        for (let wStep = 0; wStep < actualWidth; wStep += 1) {
          for (let dStep = 0; dStep < depth; dStep += 1) {
            const tileX = room.x + offset + wStep;
            const tileY =
              alcove.side === "north"
                ? room.y + dStep
                : room.y + room.h - 1 - dStep;
            this.setWall(grid, tileX, tileY);
          }
        }
      } else {
        const maxHeight = Math.max(1, room.h - 2);
        const actualHeight = Math.min(width, maxHeight);
        const offset = Math.max(
          1,
          Math.min(
            room.h - actualHeight - 1,
            alcove.offset ?? this.randomInt(1, maxHeight - actualHeight + 1)
          )
        );
        for (let hStep = 0; hStep < actualHeight; hStep += 1) {
          for (let dStep = 0; dStep < depth; dStep += 1) {
            const tileY = room.y + offset + hStep;
            const tileX =
              alcove.side === "west"
                ? room.x + dStep
                : room.x + room.w - 1 - dStep;
            this.setWall(grid, tileX, tileY);
          }
        }
      }
    }

    setWall(grid, x, y) {
      const row = grid[y];
      if (!row || !row[x]) return;
      row[x] = { type: this.TILE.WALL };
    }

    carveCorridor(grid, path) {
      if (!Array.isArray(path) || path.length < 2) return;
      for (let i = 0; i < path.length - 1; i += 1) {
        this.carveLine(grid, path[i], path[i + 1]);
      }
    }

    carveLine(grid, start, end) {
      if (!start || !end) return;
      let x = Math.round(start.x);
      let y = Math.round(start.y);
      const targetX = Math.round(end.x);
      const targetY = Math.round(end.y);
      while (x !== targetX || y !== targetY) {
        this.markHallwayTile(grid, x, y);
        if (x !== targetX) {
          x += x < targetX ? 1 : -1;
        } else if (y !== targetY) {
          y += y < targetY ? 1 : -1;
        }
      }
      this.markHallwayTile(grid, targetX, targetY);
    }

    markHallwayTile(grid, x, y) {
      const row = grid[y];
      if (!row || !row[x]) return;
      const existing = row[x];
      row[x] = {
        ...existing,
        type: this.TILE.FLOOR,
        hallway: true,
        room: existing.room ?? false,
      };
    }

    chooseEntranceRoom(rooms, rows) {
      if (!rooms.length) return null;
      return rooms.reduce((best, room) => {
        const score = room.center.y * 1.4 - room.center.x * 0.2;
        if (!best) return room;
        const bestScore = best.center.y * 1.4 - best.center.x * 0.2;
        return score > bestScore ? room : best;
      }, null);
    }

    chooseExitRoom(rooms, entranceRoom) {
      if (!rooms.length) return null;
      if (!entranceRoom) return rooms[rooms.length - 1];
      return rooms.reduce(
        (best, room) => {
          const dist = Math.hypot(
            room.center.x - entranceRoom.center.x,
            room.center.y - entranceRoom.center.y
          );
          return dist > best.distance ? { distance: dist, room } : best;
        },
        { distance: -Infinity, room: entranceRoom }
      ).room;
    }

    randomPointInRoom(room, padding = 0, interiorOnly = false) {
      if (!room) return { x: 0, y: 0 };
      const minX = interiorOnly
        ? room.x + Math.max(1, padding)
        : room.x + Math.max(0, padding);
      const maxX = interiorOnly
        ? room.x + room.w - 1 - Math.max(1, padding)
        : room.x + room.w - 1 - Math.max(0, padding);
      const minY = interiorOnly
        ? room.y + Math.max(1, padding)
        : room.y + Math.max(0, padding);
      const maxY = interiorOnly
        ? room.y + room.h - 1 - Math.max(1, padding)
        : room.y + room.h - 1 - Math.max(0, padding);
      return {
        x: this.randomInt(minX, Math.max(minX, maxX)),
        y: this.randomInt(minY, Math.max(minY, maxY)),
      };
    }

    sprinkleHallwayDetails(grid) {
      grid.forEach((row) => {
        row.forEach((tile) => {
          if (!tile || tile.type !== this.TILE.FLOOR || !tile.hallway) return;
          if (tile.type === this.TILE.ENTRANCE || tile.type === this.TILE.EXIT)
            return;
          if (!tile.detail && Math.random() < 0.015) {
            tile.detail = "torch";
          } else if (!tile.detail && Math.random() < 0.007) {
            tile.detail = "pillar";
          }
        });
      });
    }

    pickRoomStyle(seed = 0) {
      const library = [
        {
          name: "Crane Studio",
          description:
            "Folded paper cranes hang from the ceiling, swaying gently in an unseen draft. The walls are lined with shelves of colorful origami paper.",
          torches: 2,
          centerpiece: "pillar",
          foldProfile: {
            inset: 1,
            alcoves: [{ side: "north", width: 3, depth: 2 }],
          },
          lanternBands: [{ axis: "x", offset: 1, density: 0.2 }],
        },
        {
          name: "Lotus Atrium",
          description:
            "A serene space dominated by a large paper lotus in the center. The floor is painted to resemble a calm pond.",
          torches: 3,
          centerpiece: "pillar",
          foldProfile: {
            inset: 2,
            alcoves: [{ side: "east", width: 2, depth: 2 }],
          },
          lanternBands: [{ axis: "y", offset: 1, density: 0.3 }],
        },
        {
          name: "Paper Garden",
          description:
            "Intricate paper flowers bloom from the walls. The air smells faintly of old books and dried ink.",
          torches: 1,
          centerpiece: "none",
          foldProfile: { inset: 1 },
          lanternBands: [],
        },
        {
          name: "Obsidian Gallery",
          description:
            "Dark, glossy paper covers the walls, reflecting the torchlight like obsidian. It feels colder here.",
          torches: 4,
          centerpiece: "pillar",
          foldProfile: { inset: 2 },
          lanternBands: [{ axis: "x", offset: 2, density: 0.4 }],
        },
      ];
      const index = Math.abs(seed) % library.length;
      return { ...library[index] };
    }

    randomInt(min, max) {
      const lower = Math.ceil(Math.min(min, max));
      const upper = Math.floor(Math.max(min, max));
      if (upper < lower) return lower;
      return lower + Math.floor(Math.random() * (upper - lower + 1));
    }

    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
  }

  if (!global.origamiCore) {
    global.origamiCore = new OrigamiCore();
  }
})(window);
