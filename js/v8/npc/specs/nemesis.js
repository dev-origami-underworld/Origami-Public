/* specs/nemesis.js: Nemesis as data. Template guide: knowledge/design/SPECIAL_NPC_TEMPLATE.md · look values and where each was read:
 * knowledge/design/NEMESIS_MODEL_AND_MATERIALS.md · cue sheet awaiting confirmation: knowledge/design/NEMESIS_CUE_SHEET_PROPOSED.md
 *
 * Numbers marked "read" come from Origami.RealityEngine.9.html and Origami.RealityEngine.Panels.html as of 2026-10-05; "measured" come from
 * ffmpeg silencedetect (-38 dB, 0.12 s) over the mp3 files. The cue wording and timing are PROPOSED: the author could not hear the audio.
 */
export default {
  id: 'nemesis',
  nameKey: 'nemesis',
  displayName: 'Nemesis',

  // Everything the world spawn, the panel portrait and the dev "spawn" script need. One source.
  spawn: {
    recipe: {
      type: 'monster', hpBase: 120, hpKnob: '_knightRaidHp', hpExact: true,
      meleeOnly: true, noFlee: true, canRetreat: false, isHostile: false, forceHostile: false,
      isKnight: true, isAdventurer: true, soloNemesis: true,
      armor: { color: '#f2f4f7', name: 'white' },            // carried in the engine record; the silver-armour shader is off for the solo Nemesis
      body: 'RealmThemes.BODIES.knight',
    },
    test: { at: 'near-player', minTiles: 2, maxTiles: 5 },
  },

  look: {
    model: {
      url: 'assets/models/monster/knight.opt.glb?v=1002-sword',
      worldHeight: 2.2, lift: 0.011,                           // read: RealmThemes.js knight body
      portraitHeight: 1.65, portraitFrame: { feetY: -0.72 },   // read: Panels.html _nemesisPortraitHeight default and frame
    },
    material: {
      bodyRGB: [0.4706, 0.4980, 0.5255],                       // read: #787f86
      emissiveRGB: [0.0353, 0.0431, 0.0510], emissiveIntensity: 0.10,   // read: #090b0d
      nullMaps: ['emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap', 'alphaMap'],
      pbr: { metalness: 0, roughness: 1, reflectivity: 0, specularIntensity: 0, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0 },
      opaque: true, renderOrder: 3, cloneMaterials: true,
    },
    // The model is one mesh with one material, so a name match finds nothing; the panel entry is kept as data until a UV-region eye is rebuilt on vMapUv.
    eyes: { world: 'none', panel: { match: 'eye|iris|pupil', color: [0.97, 0.98, 1.0], emissive: [0.55, 0.62, 0.74], intensity: 0.75 } },
    rim: { world: { uniform: '_soloNemesisRimUniform', value: 0.715 }, panel: null },
    shadows: { cast: false, receive: true },
    worldLayers: [5, 3],
    lights: {
      world: [
        { name: 'nemesis/front-key', type: 'point', color: 0xd9ecff, intensity: 2.2, frontTiles: 0.75, height: 2.6, rangeTiles: 2.6, decay: 2.0 },
        { name: 'nemesis/back-aimed-fill', type: 'spot', color: 0xe8f3ff, frontTiles: 1.15, height: 2.15, targetY: 1.18, rangeTiles: 4.2, angle: 0.6981317007977318, penumbra: 0.55, decay: 1.1 },
      ],
      panel: { ambient: { color: 0xffffff, intensity: 0.22 }, directional: { color: 0xffffff, intensity: 1.0, position: [5, 5, 5] } },
    },
    camera: { panel: { fov: 40, eye: [0, 0.7, 2.8], lookY: 0.10 } },
    // Clip names inside knight.opt.glb. 'taunt' and 'cheer' are the two the engine does not use for him today.
    motion: { idle: 'look_around.001', walk: 'run.001', attack: 'slash.001', attackAlt: 'front_kick_02.001', hit: 'hit_to_head.001', death: 'defeat_03.001', taunt: 'swagger.001', cheer: 'cheer.001' },
  },

  voice: {
    // each line once per fight, one voice at a time, no looping
    policy: { perLine: 'once-per-fight', overlap: false, loop: false, gapMs: 800, onBusy: 'queue1' },
    lines: {
      goAway: {
        mp3: 'assets/sounds/Monsters/Nemesis.Goaway.mp3', srt: 'assets/sounds/Monsters/Nemesis.Goaway.srt', sfxKey: 'NEMESIS_GO_AWAY',
        durationSec: 5.459563, speech: [[0, 1.829], [2.453, 5.086]],
        cues: [
          { start: 0.00, end: 1.83, ja: 'ここで何をしている？', en: 'What are you doing here?' },
          { start: 2.45, end: 5.09, ja: '立ち去れ。', en: 'You need to go away.' },
        ],
      },
      warning: {
        mp3: 'assets/sounds/Monsters/Nemesis.Warning.mp3', srt: 'assets/sounds/Monsters/Nemesis.Warning.srt', sfxKey: 'NEMESIS_WARNING',
        durationSec: 7.41875, speech: [[0, 1.274], [1.456, 3.488], [3.987, 5.444], [5.769, 7.053]],
        cues: [{ start: 0.00, end: 7.05, ja: '警告したはずだ。', en: 'I warned you.' }],   // four sound bursts: wording per burst needs confirming
      },
      ohWell: {
        mp3: 'assets/sounds/Monsters/Nemesis.Noworries.mp3', srt: 'assets/sounds/Monsters/Nemesis.Noworries.srt', sfxKey: 'NEMESIS_SEVER_OH_WELL',
        durationSec: 2.586063, speech: [[0, 0.918], [1.381, 2.247]],
        cues: [
          { start: 0.00, end: 0.92, ja: '心配するな…', en: 'No…' },
          { start: 1.38, end: 2.25, ja: '心配するな。', en: 'No worries.' },
        ],
      },
      noWorries: {
        mp3: 'assets/sounds/Monsters/Nemesis.Noworries.mp3', srt: 'assets/sounds/Monsters/Nemesis.Noworries.srt', sfxKey: 'NEMESIS_SEVER_NO_WORRIES',
        durationSec: 2.586063, speech: [[0, 0.918], [1.381, 2.247]],
        cues: [
          { start: 0.00, end: 0.92, ja: '心配するな…', en: 'No…' },
          { start: 1.38, end: 2.25, ja: '心配するな。', en: 'No worries.' },
        ],
      },
      thinkTough: {
        mp3: 'assets/sounds/Monsters/Nemesis.Thinkyourtough.mp3', srt: 'assets/sounds/Monsters/Nemesis.Thinkyourtough.srt', sfxKey: 'NEMESIS_SEVER_THINK_TOUGH',
        durationSec: 6.112625, speech: [[0, 3.097]],
        cues: [{ start: 0.00, end: 3.10, ja: '強いつもりか？', en: "Think you're tough?" }],
      },
      seeYouSoon: {
        mp3: 'assets/sounds/Monsters/Nemesis.Seeyousoon.mp3', srt: 'assets/sounds/Monsters/Nemesis.Seeyousoon.srt', sfxKey: 'NEMESIS_SEE_YOU',
        durationSec: 3.944438, speech: [[0, 0.771], [1.017, 2.253], [2.524, 3.621]],
        cues: [
          { start: 0.00, end: 0.77, ja: 'また…', en: 'See…' },
          { start: 1.02, end: 2.25, ja: 'また、すぐ…', en: 'See you…' },
          { start: 2.52, end: 3.62, ja: 'また、すぐ会おう。', en: 'See you soon.' },
        ],
      },
    },
    // text-only jokes the engine already prints on leg cuts (no sound file behind them)
    textOnly: {
      legOne: { en: 'Only a leg. Come back and do the other one.', ja: '脚一本か。もう片方もやってみろ。', ttlMs: 4200 },
      legTwo: { en: 'Excellent. I was tired of standing.', ja: '結構。立っているのにも飽きていた。', ttlMs: 4200 },
    },
  },

  // event -> line. 'cut' is counted by the director into cut.n1, cut.n2, ...; a list means "first one still unplayed".
  events: {
    intro: 'goAway',
    'warn.refused': 'warning',
    'cut.n1': 'ohWell',
    'cut.n2': 'noWorries',
    'cut.n3': 'thinkTough',
    'countdown.start': 'seeYouSoon',
    defeat: ['seeYouSoon'],            // fallback when he dies before a countdown; already played means silence
    taunt: ['thinkTough'],
    'leg.first': 'legOne',
    'leg.second': 'legTwo',
  },

  cuts: {
    crit: true, cooldownMs: 9000, permanent: true,                         // read: _nemesisLimbCutCooldownMs default, _knightPermanentCuts
    parts: ['arm', 'leg'],
    countdownAfter: { arms: 2, legs: 2 },                                  // read: both arms and both legs gone starts the countdown
    snipPop: { label: 'SNIP!' },
    oneLeg: { speedMul: 0.25, hopMs: 420, hopHeight: 0.30, lean: 0.10 },   // read: _knightOneLegSpeedMul, _knightLegHop*
    noLegs: { torsoHopSec: 1.0, torsoHopHeight: 0.055, torsoWiggle: 0.18 },
    sword: { drop: 'KATANA', text: 'Nemesis dropped his sword.', kanji: '刀', stat: '+18 ATK' },
  },

  intro: { waitForGuideMove: true },
  warn: { tiles: 2.5, ms: 3500 },                                          // read: _knightWarningTiles, _knightWarningMs
  phases: ['dormant', 'intro', 'warn', 'fight', 'countdown', 'boom', 'defeat'],

  countdown: {
    steps: 5, beatMs: 1000, labels: ['5...', '4...', '3...', '2...', '1...'],
    voice: 'seeYouSoon',                                                   // starts WITH the count (it used to play at the blast)
    boom: { radiusTiles: 2.4, dmg: 40, minDmgFraction: 0.4, cardName: 'NEMESIS KABOOM', fx: 'kaboom', label: 'KABOOM!' },
    // Escape reward (default values, awaiting confirmation): outside the radius or out of sight at the boom, he poofs instead of hurting you.
    escape: { fx: 'cranes', clip: 'cheer', reward: { cards: ['POTION'], gold: 25 } },
  },
};
