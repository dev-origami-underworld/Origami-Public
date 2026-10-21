/**
 * Player Profile & Tendency Tracker
 * Monitors player actions to determine their playstyle (Violent, Diplomatic, Gambler).
 * Influences procedural generation and AI difficulty.
 */

export const PLAY_STYLES = {
  VIOLENT: "VIOLENT",
  PEACEFUL: "PEACEFUL",
  GAMBLER: "GAMBLER",
  HYBRID: "HYBRID"
};

export const ACTION_TYPES = {
  COMBAT: "COMBAT",
  PACIFY: "PACIFY",
  GAMBLE: "GAMBLE",
  EXPLORE: "EXPLORE"
};

export class PlayerProfile {
  constructor() {
    this.stats = {
      combat: 0,
      pacify: 0,
      gamble: 0,
      explore: 0
    };
    this.history = []; // Log of last N actions for trend analysis
  }

  recordAction(type) {
    if (this.stats[type.toLowerCase()] !== undefined) {
      this.stats[type.toLowerCase()]++;
    }
    this.history.push({ type, timestamp: Date.now() });
    if (this.history.length > 50) this.history.shift();
  }

  getDominantStyle() {
    const { combat, pacify, gamble } = this.stats;
    const total = combat + pacify + gamble;
    
    if (total < 5) return PLAY_STYLES.HYBRID; // Not enough data

    if (combat > total * 0.5) return PLAY_STYLES.VIOLENT;
    if (gamble > total * 0.4) return PLAY_STYLES.GAMBLER; // Lower threshold for gambler
    if (pacify > total * 0.5) return PLAY_STYLES.PEACEFUL;
    
    return PLAY_STYLES.HYBRID;
  }

  /**
   * Returns difficulty modifier for combat (0.0 to 1.0+).
   * Violent players face harder enemies.
   */
  getAggressionModifier() {
    const style = this.getDominantStyle();
    if (style === PLAY_STYLES.VIOLENT) {
      // Scale based on combat count, capped at 2.0 (Double difficulty)
      return 1.0 + Math.min(this.stats.combat / 20, 1.0);
    }
    return 1.0; // Default
  }

  /**
   * Returns probability of spawning gaming-related content (0.0 to 1.0).
   */
  getGamingContentProbability() {
    const style = this.getDominantStyle();
    if (style === PLAY_STYLES.GAMBLER) return 0.8; // High chance
    if (style === PLAY_STYLES.HYBRID) return 0.3;
    return 0.1; // Low chance
  }
}
