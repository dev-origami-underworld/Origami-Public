/**
 * Monster AI System
 * Manages monster behavior, state transitions, and relationships.
 * Supports non-violent gameplay mechanics (befriending, alliances).
 */

export const AI_STATES = {
  HOSTILE: "HOSTILE",
  NEUTRAL: "NEUTRAL",
  FRIENDLY: "FRIENDLY",
  ALLY: "ALLY",
  FLEEING: "FLEEING"
};

export class MonsterAI {
  constructor(dm) {
    this.dm = dm; // Reference to Dungeon Master Core
  }

  /**
   * Initializes AI for a monster instance.
   */
  initMonster(monster) {
    if (!monster.state) monster.state = AI_STATES.HOSTILE; // Default
    if (!monster.disposition) monster.disposition = 50; // 0-100 (0=Hate, 100=Love)
    monster.id = monster.id || `mob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Processes the turn for a specific monster.
   */
  processTurn(monster, player) {
    switch (monster.state) {
      case AI_STATES.HOSTILE:
        return this.handleHostileBehavior(monster, player);
      case AI_STATES.ALLY:
        return this.handleAllyBehavior(monster, player);
      case AI_STATES.NEUTRAL:
      case AI_STATES.FRIENDLY:
      default:
        return null; // Do nothing
    }
  }

  handleHostileBehavior(monster, player) {
    // Simple logic: Attack if close, or shout threats
    // In a real implementation, this would check distance, health, etc.
    return {
      type: "attack",
      source: monster,
      target: player,
      message: `${monster.name} growls menacingly at you!`
    };
  }

  handleAllyBehavior(monster, player) {
    // Allies might heal, buff, or calm others
    return {
      type: "assist",
      source: monster,
      target: player,
      message: `${monster.name} watches your back.`
    };
  }

  /**
   * Attempts to calm or befriend a monster (Non-Violent Action).
   * @param {object} monster 
   * @param {number} effectiveness - 0-100 score of the player's action.
   */
  attemptPacify(monster, effectiveness) {
    // Adjust disposition based on effectiveness
    monster.disposition += effectiveness;

    let result = { success: false, message: "" };

    if (monster.disposition >= 80) {
      monster.state = AI_STATES.ALLY;
      result.success = true;
      result.message = `${monster.name} seems to trust you completely! They are now your ally.`;
      this.dm.triggerEvent("monster_befriended", monster);
    } else if (monster.disposition >= 50) {
      monster.state = AI_STATES.NEUTRAL;
      result.success = true;
      result.message = `${monster.name} stops attacking and regards you with curiosity.`;
    } else {
      result.message = `${monster.name} hesitates but is still wary.`;
    }

    return result;
  }
}
