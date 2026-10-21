/** [REF#PENDING] [REF#DA-00275]
 * RealmThemes.js — THE INVADING REALMS' TEMPLATE: what a realm is built as (its THEME), who rules it (its BOSS), and which face
 * the boss wears (its TONE). One table with three readers: the shell's REALM PORTAL screen spins its reels from it, the realm
 * generator (js/v8/map/RealmDungeon.js) deals its monsters and its boss from it, and the engine dresses the walls, floor,
 * ceiling, doors and urns from it and paints the boss's tone.
 *
 * Plan and the road to the other themes: knowledge/design/REALM_THEMES_TEMPLATE_2026-10-01.md.
 *
 * THEMES. A theme is a row; `built: true` means its textures and roster exist. The portal's THEME reel shows every row and lands
 * only on a built one, so DUNGEON is the only landing today and CAVE, CASTLE and OUTDOORS spin past as what is coming. Each
 * built row names five photo textures (assets/textures/realm/<theme>/, Poly Haven CC0 — CREDITS.md beside them) and its two
 * monster tables (who guards a doorway, who roams a chamber; weights out of 100, keys of RealmDungeon's FAMILIES).
 *
 * BOSSES. KING, QUEEN, LORD and MASTER. Each names the body it wears: the King is the dark prince, the Queen the white-haired
 * lady, the Master the Oni, the Lord the ogre (the realm's first boss). `height` is in world units (a goblin stands 1.98),
 * `lift` raises the body by that fraction of its height (the Oni's clips carry a rig lower than its bind pose; measured per body
 * in scripts/realm-models/README.md), `yaw` turns a body whose forward is +Z (the Oni) — the rest face +X, the Tripo default.
 *
 * TONES. LIGHT (the default) and DARK: a white boss or a dark one. The engine maps the boss's own texture through the tone's
 * ramp, darks to `lo` and lights to `hi` (so the dark prince comes out white for LIGHT and the white lady comes out black for
 * DARK), and adds a little of the result as glow so it reads in an unlit chamber.
 *
 * BODIES. Every body a realm can field that is not one of the engine's own rigs: a spawn record carries its `url`, `height`,
 * `lift` and `yaw` (RealmDungeon copies them in) and the engine builds the body from that file.
 */
(function (global) {
  'use strict';
  const MODELS = './assets/models/monster/';
  const TEX = './assets/textures/realm/';

  const BODIES = {
    knight: { url: './assets/models/monster/nemesis/new-nemesis-no-helmet.glb?v=8.4.1883-original-materials-eyes', height: 2.2, lift: 0.011, yaw: 0 },
    oni:    { url: MODELS + 'Oni.glb', height: 2.3, lift: 0.036, yaw: 0 },
    king:   { url: MODELS + 'knight.glb', height: 2.2, lift: 0.011, yaw: 0 },
    queen:  { url: MODELS + 'citizen-female.opt.glb', height: 2.6, lift: 0.079 },
    master: { url: MODELS + 'Oni.glb', height: 2.8, lift: 0.036, yaw: 0 },
  };

  const THEMES = {
    dungeon: {
      id: 'dungeon', label: 'DUNGEON', labelJa: 'ダンジョン', built: true,
      // MARK'S REALM PANELS (2026-10-19): crops of assets/textures/realm/dungeon/{Walls,Floors}/*.png (catalogue: PORTAL-DUNGEON.MD §5). [REF#DA-00291]
      // wall.png is the straight rock-to-masonry wall, TWO panes wide (a pillar every second pane) — hence wallRepeat [0.5, 1].
      // No normal maps: the renders carry baked shading. The Poly Haven photos moved to realm/"Ugly-do not use"/ and 404'd here.
      textures: { wall: TEX + 'dungeon/wall.png', floor: TEX + 'dungeon/floor.png', ceiling: TEX + 'dungeon/ceiling.png',
                  door: TEX + 'dungeon/door.png', urn: TEX + 'dungeon/urn.png' },
      wallRepeat: [0.5, 1], urnRepeat: [1, 1],
      guard: [['knight', 30], ['ogre', 24], ['orc', 22], ['skeleton_guard', 12], ['zombie', 12]],
      roam:  [['zombie', 26], ['knight', 14], ['orc', 12], ['skeleton_guard', 8], ['ant', 6], ['skeleton_archer', 5], ['ogre', 5],
              ['oni', 5], ['kobold', 4], ['hungry_ghost', 3], ['yakuza_goblin', 2], ['yakuza_imp', 2], ['yakuza_mummy', 2]],
    },
    cave:     { id: 'cave', label: 'CAVE', labelJa: '洞窟', built: true },
    castle:   { id: 'castle', label: 'CASTLE', labelJa: '城', built: false },
    outdoors: { id: 'outdoors', label: 'OUTDOORS', labelJa: '野外', built: false },
  };
  // Both playable realm types use the shipped rock photograph and its matching normal map. [REF#DA-00292]
  Object.assign(THEMES.cave, { textures: THEMES.dungeon.textures, wallRepeat: [0.5, 1],
    urnRepeat: [1, 1], guard: THEMES.dungeon.guard, roam: THEMES.dungeon.roam });
  const THEME_ORDER = ['dungeon', 'cave', 'castle', 'outdoors'];

  const BOSSES = {
    king:  { id: 'king', label: 'EVIL KING', labelJa: '邪悪な王', body: 'king', nameKey: 'knight', hpMul: 1.2 },
    spider:{ id: 'spider', label: 'SPIDER QUEEN', labelJa: '蜘蛛の女王', body: null, nameKey: 'spider', hpMul: 3, sizeMul: 3, magicChance: 0.25 },
    ant:   { id: 'ant', label: 'ANT QUEEN', labelJa: '蟻の女王', body: null, nameKey: 'ant', hpMul: 3, sizeMul: 3, magicChance: 0.25 },
    ogre:  { id: 'ogre', label: 'OGRE', labelJa: '鬼人', body: null, nameKey: 'ogre' },
    orc:   { id: 'orc', label: 'ORC', labelJa: 'オーク', body: null, nameKey: 'orc' },
    oni:   { id: 'oni', label: 'ONI', labelJa: '鬼', body: 'oni', nameKey: 'oni' },
    queen: { id: 'queen', label: 'QUEEN', labelJa: '女王', body: 'queen', nameKey: 'realm_queen' },
    witch: { id: 'witch', label: 'WITCH', labelJa: '魔女', body: 'oni', nameKey: 'oni' },
  };
  const BOSS_ORDER = ['king', 'spider', 'ant', 'ogre', 'orc', 'oni', 'queen', 'witch'];

  // lo/hi are linear RGB 0..1; mix is how much of the boss's own colour gives way to the ramp; glow is the self-light added back. [REF#DA-00278]
  const TONES = {
    light: { id: 'light', label: 'LIGHT', labelJa: 'ライト', word: 'White', wordJa: '白の', lo: [0.42, 0.52, 0.68], hi: [1.0, 1.0, 1.0], mix: 0.86, glow: 0.22 },
    dark:  { id: 'dark', label: 'DARK', labelJa: 'ダーク', word: 'Dark', wordJa: '闇の', lo: [0.012, 0.006, 0.022], hi: [0.30, 0.11, 0.52], mix: 0.88, glow: 0.16 },
  };
  const TONE_ORDER = ['light', 'dark'];
  const DEFAULT_TONE = 'light';

  const isTheme = (id) => Object.prototype.hasOwnProperty.call(THEMES, id);
  const isBoss = (id) => Object.prototype.hasOwnProperty.call(BOSSES, id);
  const isTone = (id) => Object.prototype.hasOwnProperty.call(TONES, id);
  // THE THEME REEL LANDS ON A BUILT THEME — `rnd` is any 0..1 source; with one built theme it is always that one. [REF#DA-00279]
  function pickTheme(rnd) { const built = THEME_ORDER.filter(id => THEMES[id].built); return built[Math.floor((rnd || Math.random)() * built.length) % built.length]; }
  function pickBoss(rnd) { return BOSS_ORDER[Math.floor((rnd || Math.random)() * BOSS_ORDER.length) % BOSS_ORDER.length]; }
  // "White King", "Dark Queen" · 白の王, 闇の女王 [REF#DA-00280]
  function bossName(bossId, toneId, lang) {
    const B = BOSSES[isBoss(bossId) ? bossId : 'ogre'], T = TONES[isTone(toneId) ? toneId : DEFAULT_TONE];
    if (bossId === 'king') return lang === 'ja' ? B.labelJa : 'Evil King';
    if (lang === 'ja') return T.wordJa + B.labelJa;
    const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
    return T.word + ' ' + cap(B.label);
  }
  // the textures a theme dresses with; a theme not built yet borrows the dungeon's [REF#DA-00281]
  function texturesFor(themeId) { const T = THEMES[isTheme(themeId) ? themeId : 'dungeon']; return (T.built && T.textures) ? T.textures : THEMES.dungeon.textures; }

  const API = { BODIES, THEMES, THEME_ORDER, BOSSES, BOSS_ORDER, TONES, TONE_ORDER, DEFAULT_TONE, isTheme, isBoss, isTone, pickTheme, pickBoss, bossName, texturesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.RealmThemes = API;
})(typeof window !== 'undefined' ? window : globalThis);
