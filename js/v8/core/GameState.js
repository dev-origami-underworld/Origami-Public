/** [REF#CR-00053]
 * 🌀 GameState.js — Centralized Shared State Container
 * Represents Step B (T0.1F) of the V8 Master Plan.
 * Provides a unified object to store, coordinate, and share mutable real-time 
 * simulation parameters across decoupled engine sub-systems.
 */

class GameStateContainer {
  constructor() {
    // ── WebGL Contexts ── [REF#CR-00054]
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;

    // ── Simulation Environment ── [REF#CR-00055]
    this.map = null;
    this.DUNGEON_LEVEL = 1;
    this.GRID = 2; // Grid scale (wu/tile) [REF#CR-00056]
    this.MAP_W = 20;
    this.MAP_H = 40;

    // ── Player State ── [REF#CR-00057]
    this.px = 5.0;  // X coordinate [REF#CR-00058]
    this.pz = 5.0;  // Z coordinate [REF#CR-00059]
    this.rot = 0.0; // Heading / Y-rotation angle [REF#CR-00060]
    this.isMoving = false;
    this.playerHealth = 100;
    this.playerMaxHealth = 100;
    this.playerArmor = 0;

    // ── Entities & Animation ── [REF#CR-00061]
    this.monsterWrappers = [];
    this.mixers = [];
    this.activeProjectiles = [];

    // ── Engine Loops & Time ── [REF#CR-00062]
    this.clock = null;
    this.gamePaused = false;
    this.hitStopUntil = 0;
    
    // ── Minimap / PiP ── [REF#CR-00063]
    this.pipActive = false;
    this.pipZoom = 1.0;
  }

  /** [REF#CR-00064]
   * Reset state for a new floor transition.
   */
  resetForFloor(floorNum) {
    this.DUNGEON_LEVEL = floorNum;
    this.monsterWrappers = [];
    this.mixers = [];
    this.activeProjectiles = [];
    this.isMoving = false;
  }
}

// Export a single global instance for reference coordination [REF#CR-00065]
export const GameState = new GameStateContainer();
