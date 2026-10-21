/* specs/_template.js: COPY THIS FILE to add a special NPC. Guide: knowledge/design/SPECIAL_NPC_TEMPLATE.md
 *
 * 1. Copy to specs/<your-npc>.js and replace every value below. Delete a block you do not need (look, cuts, countdown, phases are optional).
 * 2. Put the voice files under assets/sounds/ and give every line its measured durationSec and speech windows
 *    (node scripts/gate-npc-specs.mjs --measure prints them). Cues must sit inside the speech windows.
 * 3. Run: node scripts/gate-npc-specs.mjs        (schema, files, cue timing)
 *         node --test scripts/npc/npc.test.mjs    (the director, scheduler and look tests)
 * 4. Gameplay reports what happened with one call: director.emit('<your-npc>', '<event>', { body }). The `events` table decides the line.
 * This file sets template: true, so the checker skips file and timing checks for it. Remove that line in your copy.
 */
export default {
  template: true,
  id: 'my-npc',                                   // lowercase letters, digits, dashes
  nameKey: 'my_npc',                              // the engine's species key
  displayName: 'My NPC',

  spawn: { recipe: { type: 'monster', hpBase: 100, hpExact: true }, test: { at: 'near-player', minTiles: 2, maxTiles: 5 } },

  look: {                                         // read by applyLook(root, look, 'world' | 'panel'); no shader code here, ever
    model: { url: 'assets/models/monster/example.opt.glb', worldHeight: 2.0, lift: 0, portraitHeight: 1.6, portraitFrame: { feetY: -0.72 } },
    material: { bodyRGB: [0.7, 0.7, 0.7], emissiveRGB: [0.03, 0.03, 0.04], emissiveIntensity: 0.1, opaque: true, renderOrder: 3, cloneMaterials: true },
    eyes: { world: 'none', panel: null },
    shadows: { cast: false, receive: true },
    motion: { idle: 'idle', walk: 'walk', attack: 'attack', hit: 'hit', death: 'death' },     // clip names inside the glb
  },

  voice: {
    policy: { perLine: 'once-per-fight', overlap: false, loop: false, gapMs: 800, onBusy: 'queue1' },
    lines: {
      hello: {
        mp3: 'assets/sounds/Monsters/Example.Hello.mp3', srt: 'assets/sounds/Monsters/Example.Hello.srt', sfxKey: 'EXAMPLE_HELLO',
        durationSec: 1.5, speech: [[0, 1.2]],
        cues: [{ start: 0.0, end: 1.2, ja: 'こんにちは。', en: 'Hello.' }],
      },
    },
    textOnly: { quip: { en: 'A line with no sound file.', ja: '音声のないせりふ。', ttlMs: 4200 } },
  },

  events: { intro: 'hello', 'leg.first': 'quip' },   // event name -> line id (or a list: first one still unplayed)

  phases: ['dormant', 'intro', 'fight', 'defeat'],
};
