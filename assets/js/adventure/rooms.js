import {
  CARDINAL_OFFSETS,
  ROOM_NARRATIVES,
  STORY_EVENTS,
  ENTRANCE_HALLWAY,
  getRoomTemplate,
} from "./config.js";

export function createRoomService(store) {
  const roomFactory = new RoomFactory();

  function ensureRoom(roomId, levelIndex = store.state.player.currentLevel) {
    const existing = store.getRoom(levelIndex, roomId);
    if (existing) {
      if (roomId === 1) applyEntranceTemplate(existing);
      return existing;
    }
    const created =
      roomId === 1
        ? roomFactory.createEntranceHallway(roomId)
        : roomFactory.createRandomRoom(roomId);
    return store.setRoom(levelIndex, roomId, created);
  }
  
  function createEntranceHallway() {
      const room = roomFactory.createEntranceHallway(1);
      return store.setRoom(0, 1, room);
  }

  function syncWithEnvironment(roomId, environment, levelIndex) {
    const room = ensureRoom(roomId, levelIndex);
    if (roomId === 1) applyEntranceTemplate(room);
    if (!environment) {
      room.environmentContext = null;
      return room;
    }

    room.environmentContext = environment;
    room.hallway = !!environment.hallway;
    room.monsters = Array.isArray(environment.monsters)
      ? environment.monsters
      : [];
    room.title =
      environment.roomMeta?.name || environment.features?.detail || room.title;
    if (environment.roomMeta?.description) {
      room.description = environment.roomMeta.description;
    }
    if (environment.roomMeta?.shopInventory?.length) {
      if (!Array.isArray(room.shop) || room.shop.length === 0) {
        room.shop = environment.roomMeta.shopInventory.map((item) => ({
          ...item,
        }));
      }
      room.isShop = true;
      room.shopkeeper = environment.roomMeta.shopkeeper || room.shopkeeper;
    } else {
      room.isShop = false;
    }
    room.exits = {};

    Object.entries(environment.exits || {}).forEach(([direction, info]) => {
      if (!info || info.passable === false) return;
      room.exits[direction] = info;
      if (info.roomId) {
        ensureRoom(info.roomId, levelIndex);
      }
    });

    return room;
  }

  function describeNeighbor(direction, exitInfo) {
    if (!exitInfo) return null;
    if (exitInfo.roomName) return `${exitInfo.roomName} (${direction})`;
    if (exitInfo.hallway) return `${direction} hallway`;
    if (exitInfo.roomId) {
      const linked = store.getRoom(
        store.state.player.currentLevel,
        exitInfo.roomId
      );
      if (linked?.title) return `${linked.title} (${direction})`;
    }
    return direction;
  }

  return {
    ensureRoom,
    createEntranceHallway,
    syncWithEnvironment,
    describeNeighbor,
    roomFactory,
  };
}

class RoomFactory {
  constructor() {}

  createEntranceHallway(id) {
    const room = this.baseRoom(id, true);
    return this.decorateWithStoryBeat(room, ENTRANCE_HALLWAY);
  }

  createRandomRoom(id) {
    const room = this.baseRoom(id, false);
    return this.decorateWithStoryBeat(room, getRoomTemplate(id));
  }

  baseRoom(id, hallway = false) {
    const baseNarrative = ROOM_NARRATIVES[(id * 3) % ROOM_NARRATIVES.length];
    return {
      id,
      title: "Mysterious Chamber",
      description: baseNarrative,
      exits: {},
      items: [],
      monsters: [],
      allowSearch: true,
      hallway,
    };
  }

  decorateWithStoryBeat(room, beat) {
    if (!beat) return room;
    room.title = beat.title;
    room.storyBeat = {
      title: beat.title,
      act: beat.act,
      stage: beat.stage,
      hint: beat.hint,
      searchLabel: beat.searchLabel,
      allowSearch: beat.allowSearch !== false,
      callout: beat.callout,
      roomId: room.id,
      id: beat.id,
    };
    room.allowSearch = beat.allowSearch !== false;
    room.description = [beat.description, room.description]
      .filter(Boolean)
      .join(" ")
      .trim();

    const seen = new Set();
    beat.interactives?.forEach((interactive) => {
      if (!interactive || seen.has(interactive.keyword)) return;
      const event =
        interactive.event ||
        (interactive.eventType && STORY_EVENTS[interactive.eventType]?.[0]) ||
        null;
      room.items.push({
        keyword: interactive.keyword,
        name: interactive.name,
        details: interactive.details,
        interactionEvent: event ? { ...event } : null,
        featured: !!interactive.featured,
        guideLabel: interactive.guideLabel,
      });
      seen.add(interactive.keyword);
    });
    return room;
  }
}

function applyEntranceTemplate(room) {
  // Lock Room 1 to the glowworm lantern template
  room.title = ENTRANCE_HALLWAY.title;
  room.hallway = true;
  room.allowSearch = ENTRANCE_HALLWAY.allowSearch;
  room.storyBeat = {
    title: ENTRANCE_HALLWAY.title,
    act: ENTRANCE_HALLWAY.act,
    stage: ENTRANCE_HALLWAY.stage,
    hint: ENTRANCE_HALLWAY.hint,
    searchLabel: ENTRANCE_HALLWAY.searchLabel,
    allowSearch: ENTRANCE_HALLWAY.allowSearch,
    callout: ENTRANCE_HALLWAY.callout,
    roomId: room.id,
  };
  room.description = ENTRANCE_HALLWAY.description;
  room.items = ENTRANCE_HALLWAY.interactives.map((interactive) => ({
    keyword: interactive.keyword,
    name: interactive.name,
    details: interactive.details,
    interactionEvent: interactive.event ? { ...interactive.event } : null,
    featured: !!interactive.featured,
    guideLabel: interactive.guideLabel,
  }));
}

export function deriveDirectionFromVector(dx, dy) {
  if (dx === 1 && dy === 0) return "east";
  if (dx === -1 && dy === 0) return "west";
  if (dx === 0 && dy === 1) return "south";
  if (dx === 0 && dy === -1) return "north";
  return null;
}

export function getNeighborTile(tileX, tileY, direction) {
  const delta = CARDINAL_OFFSETS[direction];
  if (!delta) return null;
  return { x: tileX + delta.dx, y: tileY + delta.dy };
}
