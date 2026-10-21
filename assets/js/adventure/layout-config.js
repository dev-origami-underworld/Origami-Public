/**
 * ORIGAMI ADVENTURE - LAYOUT CONFIGURATION
 *
 * This file contains JavaScript configuration for layout and UI behavior.
 * Modify these values to change dimensions, timing, and feature flags.
 */

export const LAYOUT_CONFIG = {
  // ========================================
  // CONTAINER DIMENSIONS
  // ========================================
  container: {
    maxWidth: "800px",
    padding: "16px",
    gap: "12px",
  },

  // ========================================
  // ADVENTURE LOG
  // ========================================
  adventureLog: {
    heightCalc: "calc(30vh - 150px)",
    minHeight: "120px",
    maxEntries: 100, // Maximum log entries before trimming
    scrollBehavior: "smooth",
    autoScroll: true,
  },

  // ========================================
  // INPUT & COMMANDS
  // ========================================
  input: {
    placeholder: "Type 'help' for commands...",
    autocomplete: "off",
    maxLength: 200,
    submitOnEnter: true,
  },

  // ========================================
  // LEVEL DISPLAY
  // ========================================
  levelDisplay: {
    size: 52, // pixels
    borderWidth: 2,
    animationDuration: "0.2s",
    healthThreshold: {
      danger: 0.3, // Show danger color below 30% health
      warning: 0.5, // Could add warning color
    },
  },

  // ========================================
  // BUTTONS
  // ========================================
  buttons: {
    header: {
      size: 48, // pixels
      iconSize: 22,
    },
    guide: {
      height: 40,
      minWidth: 110,
      maxVisible: 20, // Max guide buttons to show at once
    },
  },

  // ========================================
  // MODALS
  // ========================================
  modals: {
    inventory: {
      maxWidth: "400px",
      gridColumns: "repeat(auto-fill, minmax(60px, 1fr))",
      maxHeight: "250px",
      defaultSize: 12, // Default inventory slots
    },
    character: {
      maxWidth: "400px",
    },
    combat: {
      maxWidth: "450px",
      animateHealth: true,
    },
    closeOnOutsideClick: true,
    closeOnEscape: true,
  },

  // ========================================
  // ANIMATIONS
  // ========================================
  animations: {
    enabled: true,
    damageFlash: {
      duration: "0.5s",
      timing: "ease-out",
    },
    borderFlash: {
      duration: "0.7s",
      timing: "ease-out",
    },
    buttonHover: {
      translateY: -2,
      duration: "0.2s",
    },
  },

  // ========================================
  // RESPONSIVE BREAKPOINTS
  // ========================================
  breakpoints: {
    mobile: 480,
    tablet: 768,
    desktop: 1024,
    wide: 1440,
  },

  // ========================================
  // FEATURE FLAGS
  // ========================================
  features: {
    darkModeToggle: true,
    inventorySystem: true,
    characterPanel: true,
    combatModal: true,
    soundEffects: true,
    guideButtons: true,
    autoSave: false, // Could implement auto-save feature
    achievements: false, // Could implement achievements
  },

  // ========================================
  // ACCESSIBILITY
  // ========================================
  accessibility: {
    keyboardNavigation: true,
    screenReaderAnnouncements: true,
    reduceMotion: false, // Auto-detect from system preferences
    highContrastMode: false,
    focusIndicators: true,
  },

  // ========================================
  // PERFORMANCE
  // ========================================
  performance: {
    maxLogEntries: 100,
    debounceInput: 0, // milliseconds, 0 = disabled
    throttleAnimations: false,
    lazyLoadImages: false, // For future image support
  },
};

/**
 * THEME CONFIGURATION
 * Programmatic theme switching and customization
 */
export const THEME_CONFIG = {
  default: "light",
  available: ["light", "dark"],

  // Custom theme colors (optional overrides)
  customThemes: {
    // Example: 'sepia' theme
    sepia: {
      "--bg-main": "#f4f1ea",
      "--text-primary": "#5c4a3a",
      "--color-gold": "#c07a00",
    },
    // Example: 'midnight' theme
    midnight: {
      "--bg-main": "#0f1419",
      "--text-primary": "#e6edf3",
      "--color-gold": "#ffd700",
    },
  },

  persistence: {
    enabled: true,
    storageKey: "origami-adventure-theme",
  },
};

/**
 * SOUND CONFIGURATION
 */
export const SOUND_CONFIG = {
  enabled: true,
  volume: {
    master: 0.7,
    effects: 0.8,
    ambient: 0.5,
  },
  types: {
    item: {
      wave: "triangle",
      note: "C5",
      duration: "8n",
    },
    hit: {
      wave: "sawtooth",
      note: "C3",
      duration: "16n",
    },
    damage: {
      wave: "sawtooth",
      note: "E2",
      duration: "8n",
    },
    solve: {
      wave: "sine",
      note: "C5",
      duration: "4n",
    },
  },
};

/**
 * GAME CONFIGURATION
 */
export const GAME_CONFIG = {
  player: {
    startingHP: 100,
    startingAttackPower: 10,
    startingGold: 0,
    startingLevel: 0,
  },

  dungeon: {
    minRoomsPerLevel: 5,
    maxRoomsPerLevel: 12,
    entranceRoomChance: 1.0, // Always have entrance
    itemSpawnChance: 0.6,
    monsterSpawnChance: 0.3,
  },

  combat: {
    turnBased: true,
    autoTarget: true,
    showDamageNumbers: true,
    animateHealthBars: true,
  },

  text: {
    welcomeMessage: "🏮 Welcome to the Origami Dungeon 🏮",
    typingSpeed: 0, // milliseconds per character, 0 = instant
    wordWrap: true,
  },
};

/**
 * UTILITY: Apply custom configuration
 */
export function applyLayoutConfig(config = LAYOUT_CONFIG) {
  // Apply CSS custom properties from JS config
  const root = document.documentElement;

  if (config.container) {
    root.style.setProperty("--container-max-width", config.container.maxWidth);
  }

  if (config.levelDisplay) {
    root.style.setProperty(
      "--level-display-size",
      `${config.levelDisplay.size}px`
    );
  }

  if (config.buttons) {
    root.style.setProperty(
      "--button-size-md",
      `${config.buttons.header.size}px`
    );
    root.style.setProperty(
      "--icon-size-md",
      `${config.buttons.header.iconSize}px`
    );
  }

  // Return config for chaining
  return config;
}

/**
 * UTILITY: Get responsive layout
 */
export function getResponsiveLayout() {
  const width = window.innerWidth;
  const { breakpoints } = LAYOUT_CONFIG;

  if (width < breakpoints.mobile) return "mobile";
  if (width < breakpoints.tablet) return "tablet";
  if (width < breakpoints.desktop) return "desktop";
  return "wide";
}

/**
 * UTILITY: Check if feature is enabled
 */
export function isFeatureEnabled(featureName) {
  return LAYOUT_CONFIG.features[featureName] ?? false;
}

/**
 * UTILITY: Get configuration value
 */
export function getConfig(path) {
  const keys = path.split(".");
  let value = LAYOUT_CONFIG;

  for (const key of keys) {
    value = value?.[key];
    if (value === undefined) return null;
  }

  return value;
}

// Export default combined configuration
export default {
  layout: LAYOUT_CONFIG,
  theme: THEME_CONFIG,
  sound: SOUND_CONFIG,
  game: GAME_CONFIG,
  utils: {
    applyLayoutConfig,
    getResponsiveLayout,
    isFeatureEnabled,
    getConfig,
  },
};
