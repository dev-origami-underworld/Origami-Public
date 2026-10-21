/**
 * Quest System
 * Manages procedural and static quests.
 * Integrates with Karma to determine quest types (Violent vs Diplomatic).
 */

export const QUEST_TYPES = {
  FETCH: "FETCH",
  SLAY: "SLAY",
  DIPLOMACY: "DIPLOMACY",
  EXPLORE: "EXPLORE"
};

export class QuestManager {
  constructor(dm) {
    this.dm = dm;
    this.activeQuests = [];
    this.completedQuests = [];
    this.karma = 0; // -100 (Evil/Violent) to +100 (Good/Pacifist)
  }

  /**
   * Generates a new quest based on current context and karma.
   */
  generateQuest(triggerEntity) {
    const isPacifist = this.karma >= 0;
    
    let quest = {
      id: `quest_${Date.now()}`,
      source: triggerEntity?.name || "The Dungeon",
      status: "ACTIVE",
      rewards: { xp: 100, gold: 50 }
    };

    if (isPacifist && triggerEntity?.state === "ALLY") {
      // Diplomatic Quest
      quest.type = QUEST_TYPES.DIPLOMACY;
      quest.title = `Aid the ${triggerEntity.name}`;
      quest.description = `${triggerEntity.name} asks you to convince the Guardian of the next chamber to let you pass peacefully.`;
      quest.targetId = "guardian_next";
    } else {
      // Default/Combat Quest
      quest.type = QUEST_TYPES.SLAY;
      quest.title = "Clear the Path";
      quest.description = "Defeat the threats lurking in the shadows to secure the area.";
      quest.targetCount = 3;
      quest.currentCount = 0;
    }

    this.activeQuests.push(quest);
    this.dm.ui.logHTML(`<p class="quest-update">📜 New Quest: ${quest.title}</p>`);
    return quest;
  }

  /**
   * Updates quest progress based on events.
   */
  onEvent(eventType, data) {
    this.activeQuests.forEach(quest => {
      if (quest.status !== "ACTIVE") return;

      if (quest.type === QUEST_TYPES.DIPLOMACY && eventType === "monster_befriended") {
        if (data.id === quest.targetId || !quest.targetId) {
          this.completeQuest(quest);
        }
      }
      
      if (quest.type === QUEST_TYPES.SLAY && eventType === "monster_defeated") {
        quest.currentCount++;
        if (quest.currentCount >= quest.targetCount) {
          this.completeQuest(quest);
        }
      }
    });
  }

  completeQuest(quest) {
    quest.status = "COMPLETED";
    this.completedQuests.push(quest);
    
    // Karma Impact
    if (quest.type === QUEST_TYPES.DIPLOMACY) this.karma += 10;
    if (quest.type === QUEST_TYPES.SLAY) this.karma -= 5;

    this.dm.ui.logHTML(`<p class="quest-complete">✨ Quest Completed: ${quest.title}</p>`);
    this.dm.ui.logHTML(`<p class="reward">Received ${quest.rewards.gold} Gold and ${quest.rewards.xp} XP.</p>`);
    
    // Grant Rewards (via DM/Store)
    this.dm.store.setState({
      ...this.dm.store.state,
      player: {
        ...this.dm.store.state.player,
        gold: this.dm.store.state.player.gold + quest.rewards.gold,
        xp: this.dm.store.state.player.xp + quest.rewards.xp
      }
    });
  }
}
