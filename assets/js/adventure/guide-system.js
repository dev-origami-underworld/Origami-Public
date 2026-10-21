/**
 * Room-Based Guide Button System
 * Provides contextual navigation and interaction for the unified room-based map system
 */

class RoomGuideSystem {
  constructor(game, uiContainer) {
    this.game = game;
    this.container = uiContainer;
    this.currentRoom = null;
    this.roomMap = null; // Map<roomId, room> from AdventureDirector
  }

  /**
   * Initialize with the room map from AdventureDirector
   * @param {Map} roomMap - Map<roomId, room>
   */
  setRoomMap(roomMap) {
    this.roomMap = roomMap;
  }

  /**
   * Update guide buttons based on player's current room
   * @param {number} tileX - Player's X tile position
   * @param {number} tileY - Player's Y tile position
   */
  updateForPosition(tileX, tileY) {
    if (!this.roomMap || !this.game.mapData.grid) {
      this.clear();
      return;
    }

    // Find which room the player is in
    const cell = this.game.mapData.grid[tileY]?.[tileX];
    if (!cell || cell.type !== "room") {
      this.clear();
      return;
    }

    const room = this.roomMap.get(cell.roomId);
    if (!room) {
      this.clear();
      return;
    }

    // Only update if room changed
    if (this.currentRoom?.id === room.id) {
      return;
    }

    this.currentRoom = room;
    this.render();
  }

  /**
   * Generate action buttons for the current room
   */
  getActions() {
    if (!this.currentRoom) return [];

    const actions = [];
    const room = this.currentRoom;

    // 1. Monster Actions (highest priority)
    if (room.monsters && room.monsters.length > 0) {
      room.monsters.forEach((monster) => {
        if (monster.hp > 0) {
          if (monster.mustTalk && !monster.hasSpoken) {
            actions.push({
              label: `Talk to ${monster.name}`,
              type: "talk",
              command: `talk ${monster.id}`,
              icon: "💬",
              priority: 10,
            });
          }
          if (monster.canGamble) {
            actions.push({
              label: `Gamble with ${monster.name}`,
              type: "gamble",
              command: `gamble ${monster.id}`,
              icon: "🎲",
              priority: 9,
            });
          }
          actions.push({
            label: `Attack ${monster.name}`,
            type: "attack",
            command: `attack ${monster.id}`,
            icon: "⚔️",
            priority: 8,
            disabled: monster.mustTalk && !monster.hasSpoken,
          });
        }
      });
    }

    // 2. Quest Actions
    if (room.quest && room.quest.status === "available") {
      actions.push({
        label: room.quest.actionLabel || room.quest.title,
        type: "quest",
        command: `quest ${room.quest.id}`,
        icon: "📜",
        priority: 7,
      });
    }

    // 3. Feature Interactions (lantern, fountain, etc)
    if (room.features && room.features.length > 0) {
      room.features.forEach((feature) => {
        if (!feature.consumed) {
          actions.push({
            label: feature.actionLabel || `Inspect ${feature.label}`,
            type: "interact",
            command: `inspect ${feature.id || feature.keyword}`,
            icon: feature.actionLabel === "Take Lantern" ? "🏮" : "🔍",
            priority: 6,
            isLantern: feature.actionLabel === "Take Lantern",
          });
        }
      });
    }

    // 4. Search Action
    if (room.allowSearch !== false) {
      actions.push({
        label: room.isHallway ? "Search Hallway" : "Search Room",
        type: "search",
        command: "search",
        icon: "👀",
        priority: 4,
      });
    }

    // 5. Navigation (show primary exit only to avoid clutter)
    if (room.exits) {
      const exitDirs = Object.keys(room.exits);
      if (exitDirs.length > 0) {
        const primaryDir = exitDirs[0]; // north/south/east/west
        actions.push({
          label: `Go ${primaryDir}`,
          type: "move",
          command: `go ${primaryDir}`,
          icon: this.getDirectionIcon(primaryDir),
          priority: 3,
        });
      }
    }

    // Sort by priority (higher first)
    actions.sort((a, b) => b.priority - a.priority);

    return actions;
  }

  /**
   * Render guide buttons to the UI
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = "";
    const actions = this.getActions();

    // Show top 3-4 actions to avoid clutter
    const displayActions = actions.slice(0, 4);

    displayActions.forEach((action) => {
      const btn = document.createElement("button");
      btn.className = "guide-btn";

      // Apply styling based on action type
      if (action.type === "attack") {
        btn.classList.add("guide-btn-attack");
      } else if (action.type === "gamble") {
        btn.classList.add("guide-btn-gamble");
      } else if (action.isLantern) {
        btn.classList.add("guide-btn-lantern");
      } else if (action.type === "move") {
        btn.classList.add("guide-btn-move");
      } else {
        btn.classList.add("guide-btn-interact");
      }

      if (action.disabled) {
        btn.disabled = true;
        btn.classList.add("guide-btn-disabled");
      }

      btn.innerHTML = `<span class="guide-icon">${action.icon}</span> ${action.label}`;

      btn.onclick = (e) => {
        e.preventDefault();
        this.handleAction(action);
      };

      this.container.appendChild(btn);
    });

    // Show room title as context
    if (this.currentRoom && !this.currentRoom.isHallway) {
      const titleEl = document.createElement("div");
      titleEl.className = "guide-room-title";
      titleEl.textContent = this.currentRoom.title;
      this.container.insertBefore(titleEl, this.container.firstChild);
    }
  }

  /**
   * Handle action button click
   */
  handleAction(action) {
    console.log("Guide action:", action.command);

    // Dispatch custom event for the host application to handle
    const event = new CustomEvent("roomGuideAction", {
      detail: {
        command: action.command,
        type: action.type,
        action: action,
      },
    });
    document.dispatchEvent(event);

    // Also call global handler if it exists
    if (typeof window.handleAdventureCommand === "function") {
      window.handleAdventureCommand(action.command);
    }
  }

  /**
   * Clear all guide buttons
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.currentRoom = null;
  }

  /**
   * Get icon for direction
   */
  getDirectionIcon(dir) {
    const icons = {
      north: "⬆️",
      south: "⬇️",
      east: "➡️",
      west: "⬅️",
      up: "🔺",
      down: "🔻",
    };
    return icons[dir] || "➡️";
  }
}

// Export for module systems or window global
if (typeof module !== "undefined" && module.exports) {
  module.exports = { RoomGuideSystem };
} else if (typeof window !== "undefined") {
  window.RoomGuideSystem = RoomGuideSystem;
}
