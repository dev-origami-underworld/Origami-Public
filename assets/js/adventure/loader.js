
/**
 * DungeonLoader
 * Responsible for fetching, parsing, and validating dungeon modules (JSON).
 */

export class DungeonLoader {
  constructor() {
    this.module = null;
  }

  /**
   * Loads a dungeon module from a URL or object.
   * @param {string|object} source - URL to JSON or the JSON object itself.
   */
  async load(source) {
    try {
      let data;
      if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`Failed to fetch dungeon: ${response.statusText}`);
        data = await response.json();
      } else {
        data = source;
      }

      this.validate(data);
      this.module = data;
      console.log(`[DungeonLoader] Loaded module: ${data.manifest?.title}`);
      return data;
    } catch (error) {
      console.error('[DungeonLoader] Error loading dungeon:', error);
      throw error;
    }
  }

  /**
   * Validates the dungeon data structure.
   * @param {object} data 
   */
  validate(data) {
    if (!data.manifest || !data.rooms) {
      throw new Error('Invalid dungeon format: Missing manifest or rooms.');
    }
    // Add more schema validation here as needed
  }

  /**
   * Returns a specific room by ID.
   * @param {string|number} roomId 
   */
  getRoom(roomId) {
    if (!this.module) return null;
    return this.module.rooms[roomId];
  }

  /**
   * Returns the starting room ID.
   */
  getStartingRoomId() {
    return this.module?.settings?.startingRoomId || Object.keys(this.module?.rooms || {})[0];
  }
}

export const dungeonLoader = new DungeonLoader();
