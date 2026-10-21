export const CardDatabase = {
  // === EARTH ===
  BOULDER: {
    title: "BOULDER",
    desc: "Heavy impact.",
    attr: "(STUN * 2DICE)",
    category: "EARTH",
    fx: {
      type: "projectile",
      geometry: "dodecahedron",
      size: 0.8,
      color: 0x5c4033, // Brown dirt
      roughness: 0.9,
      metalness: 0.1,
      speed: 16.0,
      damage: 100, // Insta-kill standard
      pierce: true, // Continues through enemies
      yOffset: 0.5,
      roll: true, // Tumbling animation
    },
  },
  FISSURE: {
    title: "FISSURE",
    desc: "Sunders the earth.",
    attr: "(STUN * 3DICE)",
    category: "EARTH",
    fx: {
      type: "projectile",
      geometry: "box",
      size: { x: 1.5, y: 0.1, z: 2.0 },
      color: 0x3d2314, // Dark brown
      speed: 20.0,
      damage: 100,
      yOffset: 0.05,
      roll: false,
    },
  },

  // === WIND ===
  GALE: {
    title: "GALE",
    desc: "Forceful gust.",
    attr: "(PUSH * 3DICE)",
    category: "WIND",
    fx: {
      type: "projectile",
      geometry: "sphere",
      size: 1.2,
      color: 0xc8e6c9, // Pale wind green
      transparent: true,
      opacity: 0.4,
      speed: 25.0,
      damage: 50,
      yOffset: 1.0,
      roll: false,
    },
  },

  // === FIRE ===
  FIREBALL: {
    title: "FIREBALL",
    desc: "Inferno star.",
    attr: "(DMG * 4DICE)",
    category: "FIRE",
    fx: {
      type: "projectile",
      geometry: "sphere",
      size: 0.6,
      color: 0xff3d00, // Bright orange
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      speed: 20.0,
      damage: 100,
      yOffset: 1.0,
      roll: false,
    },
  },
  PYROBLAST: {
    title: "PYROBLAST",
    desc: "Searing heat.",
    attr: "(DMG * 6DICE)",
    category: "FIRE",
  },
  COMET: {
    title: "COMET",
    desc: "Meteor strike.",
    attr: "(DMG * 8DICE)",
    category: "FIRE",
  },

  // === WATER ===
  TIDE: {
    title: "TIDE",
    desc: "Viscous tide.",
    attr: "(SLOW * 3DICE)",
    category: "WATER",
  },
  SURGE: {
    title: "SURGE",
    desc: "Crashing wave.",
    attr: "(SLOW * 4DICE)",
    category: "WATER",
  },

  // === ITEMS ===
  POTION: {
    title: "POTION",
    desc: "Green nectar.",
    attr: "(HEAL HP * 1DICE)",
    category: "ITEM",
  },
  "IDENTITY SCROLL": {
    title: "IDENTITY SCROLL",
    desc: "Reveal truths.",
    attr: "(REVEAL)",
    category: "SCROLL",
  },

  // === WEAPON ARTS (COMBAT) ===
  SLASH: {
    title: "SLASH",
    desc: "Basic slash.",
    attr: "(DMG * 1DICE)",
    category: "KATANA",
    fx: { type: "melee", animation: "SLASH", weaponColor: "#ff0000" },
  },
  THRUST: {
    title: "THRUST",
    desc: "Fast thrust.",
    attr: "(DMG * 1DICE)",
    category: "KATANA",
    fx: { type: "melee", animation: "THRUST", weaponColor: "#ff0000" },
  },
  "HARD ATTACK": {
    title: "HARD ATTACK",
    desc: "Hard attack with reduced accuracy.",
    attr: "(DMG * 4DICE, -25% HIT)",
    category: "KATANA",
    fx: {
      type: "melee",
      animation: "HARD ATTACK",
      weaponColor: "#ff8c00",
      weaponModel: "cross-swords",
    },
  },
  DEFEND: {
    title: "DEFEND",
    desc: "Raises AC.",
    attr: "(DEFEND * 2DICE)",
    category: "SHIELD",
  },
  // === WAGER (BETTING) ===
  "BET EVEN": {
    title: "EVEN ROLL",
    desc: "Bet on 2, 4, 6, 8, 10, 12.",
    attr: "(PAYOUT 2x)",
    category: "BETTING",
  },
  "BET ODD": {
    title: "ODD ROLL",
    desc: "Bet on 3, 5, 7, 9, 11.",
    attr: "(PAYOUT 2x)",
    category: "BETTING",
  },
  "BET HIGH": {
    title: "HIGH STAKES (8+)",
    desc: "Bet on 8, 9, 10, 11, 12.",
    attr: "(PAYOUT 3x)",
    category: "BETTING",
  },
};

export const CategoryMappings = {
    'EARTH': { id: 'EARTH', kanji: '地', icon: 'fa-mountain' },
    'WIND': { id: 'WIND', kanji: '風', icon: 'fa-wind' },
    'FIRE': { id: 'FIRE', kanji: '火', icon: 'fa-fire' },
    'WATER': { id: 'WATER', kanji: '水', icon: 'fa-water' },
    'ITEM': { id: 'ITEM', kanji: '薬', icon: 'fa-flask' },
    'SCROLL': { id: 'SCROLL', kanji: '巻', icon: 'fa-scroll' },
    'KATANA': { id: 'KATANA', kanji: '斬', icon: 'fa-fire' },
    'SHIELD': { id: 'SHIELD', kanji: '盾', icon: 'fa-water' },
    'BETTING': { id: 'BETTING', kanji: '賭', icon: 'fa-dice' }
};

// Returns standard UI grouping mapping
export function buildDeckLayout(deckType = 'default') {
    let rawDeck = [];
    if (deckType === 'default') {
        rawDeck = [
            ['BOULDER', 'FISSURE'],
            ['GALE'],
            ['FIREBALL', 'PYROBLAST', 'COMET'],
            ['TIDE', 'SURGE'],
            ['POTION', 'IDENTITY SCROLL']
        ];
    } else if (deckType === 'combat') {
        rawDeck = [
            ['SLASH'],
            ['THRUST'],
            ['STRONG ATTACK'],
            ['DEFEND'],
            ['POTION']
        ];
    } else if (deckType === 'wager') {
        rawDeck = [
            ['BET EVEN'],
            ['BET ODD'],
            ['BET HIGH'],
            ['DEFEND'],
            ['POTION']
        ];
    }

    return rawDeck.map(columnKeys => {
        if (columnKeys.length === 0) return null;
        
        // Infer category from the first card
        const firstCard = CardDatabase[columnKeys[0]];
        const catMap = CategoryMappings[firstCard.category] || CategoryMappings['ITEM'];

        return {
            id: catMap.id,
            kanji: catMap.kanji,
            icon: catMap.icon,
            // Construct the UI-expected full card objects
            cards: columnKeys.map(key => {
                const c = CardDatabase[key];
                return {
                    id: key, // Internal key (e.g. 'BOULDER')
                    title: c.title,
                    desc: c.desc,
                    attr: c.attr,
                    category: c.category
                };
            })
        };
    }).filter(c => c !== null);
}
