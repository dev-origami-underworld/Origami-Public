(function (global) {
  const root = global || (typeof window !== "undefined" ? window : {});

  function deepMerge(target = {}, source = {}) {
    const out = Array.isArray(target) ? target.slice() : { ...target };
    Object.keys(source || {}).forEach((key) => {
      const value = source[key];
      if (Array.isArray(value)) {
        out[key] = value.slice();
      } else if (value && typeof value === "object") {
        out[key] = deepMerge(out[key] || {}, value);
      } else if (value !== undefined) {
        out[key] = value;
      }
    });
    return out;
  }

  function safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  const defaults = {
    metadata: {
      version: "2025.11.26",
      authoringNote:
        "Centralized content surface for layout, materials, and archetypes",
    },
    layout: {
      map: {
        tileSize: 28,
        cols: 40,
        rows: 40,
        roomCount: 10,
        eventCount: 5,
        monsterCount: 10,
        trapCount: 5,
        cardPackCount: 3,
        entrancePadding: 4,
      },
      threeD: {
        tileSize: 3,
        floorThicknessRatio: 0.12,
        wallHeightMultiplier: 1.2,
        pillarHeightMultiplier: 1.2,
        pillarRadiusRatio: 0.21,
        torchHeightRatio: 0.75,
        torchRadiusBottomRatio: 0.055,
        torchRadiusTopRatio: 0.12,
        wallBevel: { thickness: 0.03, size: 0.03, segments: 3 },
      },
      camera: {
        fov: 77.25,
        fpvBaseHeight: 1.36,
        fpvBehindDistance: 1,
        fpvPitch: -0.4886921905584123,
        fpvLookAhead: 3,
      },
    },
    environment: {
      palette: {
        wall: "#f7f7f7",
        floor: "#f5f5dc",
        paper: "#f5f5f0",
        wood: "#6b4f2a",
        accent: "#1f4b99",
        plate: "#f5f5dc",
      },
      textures: {
        wallTexture: {
          size: 512,
          paperColor: "#f5f5f0",
          noiseCount: 250,
          noiseAlphaMin: 0,
          noiseAlphaMax: 0.06,
          gridSpacing: 128,
          gridThickness: 8,
          woodColor: "#6b4f2a",
          gradientHighlight: 0.04,
          gradientShadow: 0.04,
          clamp: false,
        },
        paperFloor: {
          size: 256,
          fiberCount: 400,
          fiberAlphaMin: 0.02,
          fiberAlphaMax: 0.07,
          lineSpacing: 32,
          repeat: 8,
        },
      },
    },
    rooms: {
      themes: [
        "Ancient Library",
        "Meditation Chamber",
        "Treasure Vault",
        "Garden Courtyard",
        "Temple Altar",
        "Tea House",
        "Cherry Blossom Grove",
        "Mountain Path",
      ],
      descriptions: [
        "Soft light filters through paper screens, casting dancing shadows on the tatami mats.",
        "Incense burns in small bronze holders, filling the air with sandalwood and mystery.",
        "Ancient calligraphy scrolls hang from the walls, their meanings lost to time.",
        "Cherry blossom petals drift through the air, carried by an unfelt breeze.",
        "Stone lanterns provide a warm, flickering glow that reflects off polished wooden surfaces.",
        "The sound of a distant temple bell echoes through the chamber.",
        "Zen gardens with perfectly raked sand create patterns of inner peace.",
        "Bamboo fountains create a gentle trickling sound that soothes the spirit.",
      ],
      featureItems: [
        {
          keyword: "book",
          name: "Ancient Tome",
          details: "A leather-bound book with mysterious symbols.",
        },
        {
          keyword: "chest",
          name: "Lacquered Box",
          details: "An ornate box sealed with golden clasps.",
        },
        {
          keyword: "altar",
          name: "Prayer Shrine",
          details: "A small shrine dedicated to forgotten spirits.",
        },
        {
          keyword: "statue",
          name: "Buddha Statue",
          details: "A serene statue carved from white jade.",
        },
      ],
    },
    monsters: {
      spawnChance: 0.2,
      archetypes: [
        {
          id: "origami_oni",
          name: "Origami Oni",
          loyalty: "hostile",
          hp: 25,
          attackPower: 6,
          ai: {
            awareness: 0.55,
            aggression: 0.75,
            patrolRadius: 4,
            searchTurns: 6,
          },
          attributes: { str: 14, dex: 10, will: 8 },
          personality: { mood: "Wrathful", motto: "No intruder leaves whole." },
          loot: ["Torn Charm", "Folded Fang"],
        },
        {
          id: "paper_ronin",
          name: "Paper Ronin",
          loyalty: "neutral",
          hp: 18,
          attackPower: 5,
          ai: {
            awareness: 0.5,
            aggression: 0.45,
            patrolRadius: 3,
            searchTurns: 4,
          },
          attributes: { str: 12, dex: 13, will: 12 },
          personality: { mood: "Stoic", motto: "Honor is a quiet blade." },
          loot: ["Folded Katana", "Tea Emblem"],
        },
        {
          id: "lantern_wisp",
          name: "Lantern Wisp",
          loyalty: "ally",
          hp: 12,
          attackPower: 4,
          ai: {
            awareness: 0.8,
            aggression: 0.3,
            patrolRadius: 2,
            searchTurns: 3,
          },
          attributes: { str: 6, dex: 16, will: 14 },
          personality: { mood: "Playful", motto: "Light the lonely path." },
          loot: ["Amber Spark"],
        },
      ],
    },
  };

  const merged = deepMerge(defaults, root.ORIGAMI_CONTENT || {});

  function get(path, fallback) {
    if (!path) return fallback;
    const parts = path.split(".");
    let cursor = merged;
    for (const part of parts) {
      if (!cursor || typeof cursor !== "object") return fallback;
      cursor = cursor[part];
    }
    return cursor === undefined ? fallback : cursor;
  }

  function pickMonster(filterFn) {
    const pool = merged.monsters?.archetypes || [];
    if (!pool.length) return null;
    const filtered =
      typeof filterFn === "function" ? pool.filter(filterFn) : pool;
    const source = filtered.length ? filtered : pool;
    const archetype = source[Math.floor(Math.random() * source.length)];
    return safeClone(archetype);
  }

  root.ORIGAMI_CONTENT = merged;
  root.ORIGAMI_CONTENT_API = {
    get,
    pickMonster,
    archetypeById(id) {
      return safeClone(
        (merged.monsters?.archetypes || []).find((a) => a.id === id)
      );
    },
    allMonsters() {
      return safeClone(merged.monsters?.archetypes || []);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
