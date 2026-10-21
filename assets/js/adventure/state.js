import { MAX_LOG_ENTRIES } from "./config.js";

export function createAdventureStore() {
  const state = {
    player: {
      hp: 100,
      maxHp: 100,
      currentLevel: 0,
      currentRoomId: 1,
      inventory: [],
      attackPower: 8,
      evasion: 0.15,
      gold: 0,
      lastDirection: null,
    },
    map: {},
    puzzle: { required: 6, found: 0 },
    quest: null,
    questRoomsVisited: new Set(),
    ui: {},
    host: {
      dungeon: null,
      player: null,
      lastMoveVector: null,
    },
    log: [],
  };

  function ensureLevel(levelIndex) {
    if (!state.map[levelIndex]) {
      state.map[levelIndex] = new Map();
    }
    return state.map[levelIndex];
  }

  function setRoom(levelIndex, roomId, room) {
    ensureLevel(levelIndex).set(roomId, room);
    return room;
  }

  function getRoom(levelIndex, roomId) {
    return ensureLevel(levelIndex).get(roomId) || null;
  }

  function updatePlayer(patch) {
    Object.assign(state.player, patch);
  }

  function addInventoryItem(item) {
    state.player.inventory.push(item);
  }

  function addGold(amount) {
    state.player.gold = Math.max(0, state.player.gold + amount);
  }

  function recordQuestRoom(roomId) {
    if (!roomId) return;
    state.questRoomsVisited.add(roomId);
  }

  function setQuest(payload) {
    state.quest = payload;
  }

  function reset() {
    state.player = {
      hp: 100,
      maxHp: 100,
      currentLevel: 0,
      currentRoomId: 1,
      inventory: [],
      attackPower: 8,
      evasion: 0.15,
      gold: 0,
      lastDirection: null,
    };
    state.map = {};
    state.puzzle = { required: 6, found: 0 };
    state.quest = null;
    state.questRoomsVisited = new Set();
    state.log = [];
  }

  function pushLog(entry) {
    state.log.push(entry);
    if (state.log.length > MAX_LOG_ENTRIES) {
      state.log.shift();
    }
  }

  function setLevel(levelData) {
    // Store full level data
    if (!state.levels) state.levels = {};
    state.levels[levelData.id] = levelData;
    
    // Also populate the room map for existing logic
    const levelIndex = levelData.depth || 0;
    const roomMap = ensureLevel(levelIndex);
    if (levelData.rooms) {
        Object.values(levelData.rooms).forEach(room => {
            roomMap.set(room.id, room);
        });
    }
    
    // Update player's current level index
    state.player.currentLevel = levelIndex;
  }

  function updateRoom(room) {
    const levelIndex = state.player.currentLevel;
    setRoom(levelIndex, room.id, room);
    state.player.currentRoomId = room.id;
    state.currentRoom = room; // Expose for easy access
  }

  return {
    state,
    ensureLevel,
    setLevel,
    setRoom,
    updateRoom, // Added
    getRoom,
    updatePlayer,
    addInventoryItem,
    addGold,
    recordQuestRoom,
    setQuest,
    reset,
    pushLog,
  };
}
