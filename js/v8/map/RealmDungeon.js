/** [REF#PENDING] [REF#DG-02249]
 * RealmDungeon.js — THE INVADING REALMS: one random, NetHack-style dungeon level per trip through the torii.
 *
 * Plan: plans/INVADING_REALMS_PLAN_2026-10-01.md (Step 1) · the way in:
 * knowledge/design/SECRET_PORTAL_ROOM_2026-10-01.md. The torii in the secret room off hallway 0 puts the player into realm 1, and
 * climbing back out returns them to the torii (the 2026-10-01 order is quoted in that doc and in the engine register).
 *
 * WHY ITS OWN MODULE. Section0 builds floor 1 and DungeonChain builds floors 2-7; both build the CABARET head, and DungeonChain's
 * contract throws on a floor without one ("room 1 must be the cabaret"). That assert protects the story floors and is not
 * weakened. A realm has no cabaret, so it is generated here, with its own contract, and returns the SAME shape the engine already
 * takes from Section0: { map, rooms, spawnX, spawnZ, mobSpawns, vendingAnchor, gates, segments }.
 *
 * THE LAYOUT. A grid of cells, one CHAMBER per cell. Realm 1 is a 4x4 grid (16 chambers); the grid gains a column every three
 * realms and a row every four, up to what fits the map (7x7 on a 128x128 map). Every footprint is from the locked catalogue
 * (js/v8/map/RoomShapes.json: any w x h with both sides 3-8), mostly 4-7 a side with the odd 3-wide closet and 8-wide great room;
 * the arrival chamber is 4-7 x 4-6. Each column of cells is exactly as wide as its widest chamber needs (4 + w + 3) and each row
 * exactly as tall, which keeps the level compact. CORRIDORS run in the gutters between cells: out of a chamber's door, along the
 * gutter, into the neighbour's door. The joins are a random spanning tree over the grid (every chamber reachable) plus loops
 * (1 + realm/2 + chambers/8), as NetHack's are. Doors are 1-tile shoji doors on the chamber's own edge tile, authored as floor 1
 * authors every door.
 *
 * THE ONE SPACING RULE THAT DECIDES EVERY NUMBER BELOW — R-209: rock between two walkable tiles is 0 (a seam) or AT LEAST 3, never
 * 1 or 2. One tile is a band (the engine and the Creator reject it); two is the gutter the engine's pane merge was measured
 * breaking. So a chamber stands at least 4 tiles inside its cell on the gutter sides (3 rock to the gutter corridor), door rows
 * and columns keep off the corners, and gutter runs never reach a cell boundary of the other axis, so no two corridors touch.
 *
 * WHAT IS IN IT. The arrival chamber holds the up-staircase the player lands on (and climbs to go home) and the vending machine,
 * and no monsters. Every other chamber is EMPTY (about one in seven in realm 1, more on the big levels, where the budget runs out
 * first; NetHack has empty rooms too) or GUARDED: one guard stands just inside the doorway the player reaches it by (a knight, an
 * ogre or an orc as a rule, a skeleton guard or a zombie now and then; ogres stay out of 3-wide closets) and the chamber's other
 * monsters roam it. The chamber furthest from the stairs holds the realm's boss. The level carries a budget of hostiles — 44-56 in
 * realm 1, two more per realm up to 72 — because a realm is one segment and every body in it is built at once. Who guards and
 * who roams comes from the realm's THEME (js/v8/data/RealmThemes.js): the DUNGEON fields zombies, knights, orcs, ogres and
 * skeletons, with ants, the odd Oni, kobolds, hungry ghosts and a goblin, imp or mummy now and then (the story floors' workers
 * are the rarest faces here). The BOSS is the caller's pick (the portal's BOSS reel): a KING, QUEEN, LORD or MASTER, each wearing
 * its own body; the engine paints it white or dark by the player's TONE. Each family's spawn record carries the fields the story floors spawn it with (Section0.js, DungeonChain.js);
 * skeletons also carry realmTint 'void', the tag for the realm's black-and-purple bone paint. Everything is hostile and none of it
 * is a worker. Giant spiders join both mixes (twice an ant's health, and their bite poisons); a caller can leave them out with
 * { spiders: false }. No cabaret, no songs, no konbini, no casino: the
 * engine stands those down for a realm.
 *
 * DETERMINISM. One trip, one dungeon: the layout is seeded from the floor seed, the realm index and the trip's nonce (a fresh
 * nonce each time the player goes through the torii), so every trip is a new realm and a refresh mid-trip is not a reroll.
 */
(function (global) {
  'use strict';

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashSeed(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ── THE NETHACK MIX ── one row per monster family, each carrying the spawn fields the story floors give it: DungeonChain's [REF#DG-02250]
  // MONSTER_ARCHETYPES zombie and ant rows, Section0's wing orcs and skeleton patrols, Section0's Gate Ogre without isGuardOgre (the
  // flag the engine reads as the one 番所 gate ogre), the engine's own hungry-ghost recipe, Section0's kobold and its goblin, imp and
  // mummy workers. hpMul is the family's toughness against the realm's base hp: an orc is two goblins, as on the story floors, and
  // a guard ogre three. `_hallGhostFree` lets a realm ghost past the engine's pre-cabaret ghost hold (a realm has no cabaret).
  const FAMILIES = {
    zombie:          { nameKey: 'zombie', name: 'Zombie', hpMul: 0.8, flags: { isZombie: true, noFlee: true, meleeOnly: true, noFloat: true },
                       vuln: { FIRE: 1.3, WATER: 0.9, EARTH: 1.0, WIND: 1.0, VOID: 0.6, DEFAULT: 1.0 } },
    orc:             { nameKey: 'orc', name: 'Orc', hpMul: 2.0, flags: { isOrc: true, meleeOnly: true },
                       vuln: { FIRE: 1.1, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } },
    ogre:            { nameKey: 'ogre', name: 'Ogre', hpMul: 3.0, big: true, flags: { noFloat: true, meleeOnly: true, targetHeight: 2.35 },
                       vuln: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
    skeleton_guard:  { nameKey: 'skeleton_guard', name: 'Skeleton Guard', hpMul: 1.0, flags: { isSkeleton: true, meleeOnly: true, realmTint: 'void' },
                       vuln: { FIRE: 0.8, WATER: 1.0, EARTH: 1.35, WIND: 1.0, VOID: 1.15, DEFAULT: 1.0 } },
    skeleton_archer: { nameKey: 'skeleton_archer', name: 'Skeleton Archer', hpMul: 0.7, flags: { isSkeletonArcher: true, meleeOnly: false, realmTint: 'void' },
                       vuln: { FIRE: 0.8, WATER: 1.0, EARTH: 1.3, WIND: 1.1, VOID: 1.15, DEFAULT: 1.0 } },
    ant:             { nameKey: 'ant', name: 'Ant', hpMul: 0.5, flags: { meleeOnly: true, noFlee: true },
                       vuln: { FIRE: 1.5, WATER: 1.0, EARTH: 0.7, WIND: 1.0, VOID: 1.0, DEFAULT: 1.0 } },
    hungry_ghost:    { nameKey: 'hungry_ghost', name: 'Hungry Ghost', hpMul: 0.35,
                       flags: { isGhost: true, noFlee: true, meleeOnly: true, targetHeight: 1.55, ghostAlpha: 0.7, _hallGhostFree: true },
                       vuln: { FIRE: 1.2, WATER: 0.8, EARTH: 1.0, WIND: 1.25, VOID: 0.5, DEFAULT: 1.0 } },
    kobold:          { nameKey: 'kobold', name: 'Kobold', hpMul: 0.2, hpMin: 8, flags: { isKobold: true, hpExact: true },
                       vuln: { FIRE: 1.2, WATER: 1.0, EARTH: 1.0, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
    yakuza_goblin:   { nameKey: 'yakuza_goblin', name: 'Yakuza Goblin', hpMul: 1.0, flags: { targetHeight: 1.75 },
                       vuln: { FIRE: 1.3, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
    yakuza_imp:      { nameKey: 'yakuza_imp', name: 'Yakuza Imp', hpMul: 1.0, flags: { isImp: true, targetHeight: 1.55 },
                       vuln: { FIRE: 1.0, WATER: 1.2, EARTH: 1.0, WIND: 0.8, VOID: 1.2, DEFAULT: 1.0 } },
    yakuza_mummy:    { nameKey: 'yakuza_mummy', name: 'Yakuza Mummy', hpMul: 1.0, flags: { isMummy: true, targetHeight: 1.70 },
                       vuln: { FIRE: 1.6, WATER: 0.7, EARTH: 1.0, WIND: 0.9, VOID: 1.0, DEFAULT: 1.0 } },
    spider:          { nameKey: 'spider', name: 'Giant Spider', hpMul: 1.0, flags: { meleeOnly: true, noFlee: true, poisonOnHit: true },
                       vuln: { FIRE: 1.5, WATER: 1.0, EARTH: 0.7, WIND: 1.0, VOID: 1.0, DEFAULT: 1.0 } },
    // the KNIGHT (2026-10-01, the knight model rigged on the Tripo skeleton with the Oni's clips: scripts/realm-models/) is an [REF#DG-02251]
    // adventurer raiding the dungeon; the ONI is the Manager's own body, fielded here as a monster. Both wear their own bodies
    // (BODIES in RealmThemes.js), so their records carry the file, height, lift and facing the engine builds them from.
    knight:          { nameKey: 'knight', name: 'Knight', hpMul: 1.6, body: 'knight', flags: { isKnight: true, isAdventurer: true, meleeOnly: true },
                       vuln: { FIRE: 1.0, WATER: 1.0, EARTH: 1.0, WIND: 1.1, VOID: 1.2, DEFAULT: 1.0 } },
    oni:             { nameKey: 'oni', name: 'Oni', hpMul: 2.2, body: 'oni', flags: { isOni: true, meleeOnly: true, noFlee: true },
                       vuln: { FIRE: 0.8, WATER: 1.2, EARTH: 1.0, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } },
  };
  // Weights out of 100: who stands guard inside a doorway, and who roams a chamber, for a caller without RealmThemes (the realm's [REF#DG-02252]
  // THEME supplies both tables when it is loaded). A zombie roamer may bring a second (PACK). ogre.glb draws in 14 pieces, orc.glb
  // and zombie.glb in 1.
  const GUARD_MIX = [['ogre', 40], ['orc', 35], ['zombie', 13], ['skeleton_guard', 12]];
  const ROAM_MIX  = [['zombie', 36], ['orc', 15], ['ant', 10], ['skeleton_guard', 9], ['skeleton_archer', 6], ['ogre', 6],
                     ['kobold', 5], ['hungry_ghost', 4], ['yakuza_goblin', 3], ['yakuza_imp', 3], ['yakuza_mummy', 3]];
  const SPIDER_MIX = { guard: 15, roam: 20 };   // appended to both tables unless the caller passes { spiders: false } [REF#DG-02253]
  const PACK = { zombie: 2 };
  // OGRE_CAP bounds the ogres on one level, the boss aside: 10 since the budget doubled (2026-10-01), it was 6. [REF#DG-02254]
  const OGRE_CAP = 10;
  const SIDES = [[3, 1], [4, 3], [5, 4], [6, 4], [7, 3], [8, 1]];   // a chamber side and its weight — the catalogue's 3-8 [REF#DG-02255]

  // ⛔ SUPERSEDED 2026-10-01 — reels roll the realm's TYPE (DUNGEON / CAVE / CASTLE / OUTDOORS, always DUNGEON for now) and its BOSS [REF#DG-02256]
  // rank (KING / QUEEN / LORD / MASTER); the order is quoted in knowledge/design/REALM_THEMES_TEMPLATE_2026-10-01.md. The
  // stone/wood/cave table that came with an ogre lord
  // (Ogre Warlord, Ogre King, Cave Ogre) is gone; the THEME and the BOSS are the caller's ({ theme, boss }, rolled by the shell's REALM
  // PORTAL from js/v8/data/RealmThemes.js) and a missing or unbuilt theme builds as the DUNGEON.
  const RT = global.RealmThemes || ((typeof require === 'function') ? (function () { try { return require('../data/RealmThemes.js'); } catch (_) { return null; } })() : null);
  function generateDungeonMap(realm, MAP_W, MAP_H, opts) {
    opts = opts || {};
    realm = Math.max(1, realm | 0);
    const rnd = mulberry32(hashSeed('realm|' + (opts.seed != null ? opts.seed : 'x') + '|' + realm + '|' + (opts.nonce != null ? opts.nonce : 0)));
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const wpick = (mix) => { let t = 0; for (const m of mix) t += m[1]; let u = rnd() * t; for (const m of mix) { u -= m[1]; if (u < 0) return m[0]; } return mix[mix.length - 1][0]; };
    const theme = (RT && RT.isTheme(opts.theme)) ? opts.theme : 'dungeon';
    const T = (RT && RT.THEMES[theme] && RT.THEMES[theme].built) ? RT.THEMES[theme] : (RT ? RT.THEMES.dungeon : null);
    const boss = (RT && RT.isBoss(opts.boss)) ? opts.boss : (RT ? RT.BOSS_ORDER[Math.floor(rnd() * RT.BOSS_ORDER.length)] : 'lord');
    const finalFloor = realm >= Math.max(1, Math.min(50, Number(opts.levels) || 1));
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };

    // the grid grows with the realm index — realm 1 is a 4x4 of chambers — up to what fits the map at the widest cell (4 + 8 + 3) [REF#DG-02257]
    const IN = 6, OUT = 5, SIDE_MAX = 8;                      // Three-wide passages retain at least three rock tiles between separate runs. [REF#DG-02322]
    const OX = 12, OZ = 12;
    const fitC = Math.floor((MAP_W - OX - 4) / (IN + SIDE_MAX + OUT)), fitR = Math.floor((MAP_H - OZ - 4) / (IN + SIDE_MAX + OUT));
    const COLS = Math.min(fitC, 4 + Math.floor((realm - 1) / 3)), ROWS = Math.min(fitR, 4 + Math.floor((realm - 1) / 4));
    if (COLS < 2 || ROWS < 2) throw new Error('RealmDungeon: the map (' + MAP_W + 'x' + MAP_H + ') cannot hold a 2x2 grid of chambers');

    // footprints first: each column of cells is as wide as its widest chamber needs, each row as tall as its tallest [REF#DG-02259]
    const foot = [];
    for (let c = 0; c < COLS; c++) { foot[c] = []; for (let r = 0; r < ROWS; r++)
      foot[c][r] = (c === 0 && r === 0) ? { w: ri(5, 7), h: ri(5, 6) } : { w: Math.max(5, wpick(SIDES)), h: Math.max(5, wpick(SIDES)) }; }
    const colX = [OX], rowZ = [OZ];                           // colX[c] / rowZ[r]: the first column / row of a cell = its gutter [REF#DG-02260]
    for (let c = 0; c < COLS; c++) { let m = 0; for (let r = 0; r < ROWS; r++) m = Math.max(m, foot[c][r].w); colX.push(colX[c] + IN + m + OUT); }
    for (let r = 0; r < ROWS; r++) { let m = 0; for (let c = 0; c < COLS; c++) m = Math.max(m, foot[c][r].h); rowZ.push(rowZ[r] + IN + m + OUT); }
    if (colX[COLS] + 4 > MAP_W || rowZ[ROWS] + 4 > MAP_H) throw new Error('RealmDungeon: the grid does not fit the map (' + MAP_W + 'x' + MAP_H + ')');

    const map = [];
    for (let x = 0; x < MAP_W; x++) { map[x] = []; for (let z = 0; z < MAP_H; z++) map[x][z] = { type: 'wall' }; }
    const rooms = [];
    const floorCell = (id) => ({ type: 'floor', roomId: id, segmentId: 0, sectionIndex: 0, room: true });

    // ── JOINS: a random spanning tree over the grid, then a few loops ── [REF#DG-02261]
    const edges = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      if (c + 1 < COLS) edges.push({ a: [c, r], b: [c + 1, r], axis: 'x' });
      if (r + 1 < ROWS) edges.push({ a: [c, r], b: [c, r + 1], axis: 'z' });
    }
    const parent = new Map(); const key = (p) => p[0] + ',' + p[1];
    const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) parent.set(c + ',' + r, c + ',' + r);
    const shuffled = shuffle(edges.slice());                  // Fisher-Yates: the same seed deals the same joins in every browser [REF#DG-02262]
    const chosen = [], spare = [];
    for (const e of shuffled) { const A = find(key(e.a)), B = find(key(e.b)); if (A !== B) { parent.set(A, B); chosen.push(e); } else spare.push(e); }
    const loops = Math.min(spare.length, 1 + Math.floor(realm / 2) + Math.floor(COLS * ROWS / 8));
    for (let i = 0; i < loops; i++) chosen.push(spare[i]);
    // the cells in the order a walk out from the arrival cell (0,0) reaches them over the joins — nearest first [REF#DG-02263]
    const cellAdj = new Map(); for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) cellAdj.set(c + ',' + r, []);
    for (const e of chosen) { cellAdj.get(key(e.a)).push(e.b); cellAdj.get(key(e.b)).push(e.a); }
    const cellOrder = [[0, 0]]; const cellSeen = new Set(['0,0']);
    for (let i = 0; i < cellOrder.length; i++) for (const nb of cellAdj.get(key(cellOrder[i])).slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]))
      if (!cellSeen.has(key(nb))) { cellSeen.add(key(nb)); cellOrder.push(nb); }
    if (cellOrder.length !== COLS * ROWS) throw new Error('RealmDungeon: the joins leave ' + (COLS * ROWS - cellOrder.length) + ' cell(s) unreachable');

    // ── CHAMBERS, NUMBERED IN THE ORDER A PLAYER REACHES THEM ── a chamber's id is its place in a walk out from the arrival cell [REF#DG-02264]
    // over the joins (nearest first), so the room numbers the HUD shows rise with the difficulty: the arrival is #0 and the Lord's
    // chamber is the highest-numbered chamber.
    const cellRoom = [];   // [c][r] → room [REF#DG-02265]
    for (let c = 0; c < COLS; c++) cellRoom[c] = [];
    for (const ck of cellOrder) { const c = ck[0], r = ck[1]; {
      const w = foot[c][r].w, h = foot[c][r].h;
      const x = ri(colX[c] + IN, colX[c + 1] - OUT - w), z = ri(rowZ[r] + IN, rowZ[r + 1] - OUT - h);   // 4 in from the cell's start, 3 rock before its end [REF#DG-02266]
      const id = rooms.length;
      const R = { id, roomId: id, x, y: z, w, h, cx: x + (w >> 1), cz: z + (h >> 1), center: { x: x + w / 2, y: z + h / 2 },
                  roomType: 'room', roomName: 'Chamber', roomNameEn: 'Chamber', shapeKey: 'R' + w + 'x' + h, wallStyle: 'dungeon',
                  depthHops: 2, section: 0, sectionIndex: 0, segmentId: 0, isRealmChamber: true, cell: [c, r] };
      rooms.push(R); cellRoom[c][r] = R;
      for (let xx = x; xx < x + w; xx++) for (let zz = z; zz < z + h; zz++) map[xx][zz] = floorCell(id);
    } }


    // ── CORRIDORS ── each join is its own corridor record (they never touch one another — see the header) [REF#DG-02267]
    const usedDoorSides = new Set();
    const doorsOf = new Map();   // chamber id → [{ x, z, side, to }] — side is the chamber wall the door is in, `to` the chamber beyond [REF#DG-02268]
    // ONE-TILE DOORWAYS (2026-10-19, Mark: "yes, narrow it, lets see if it looks ok"): the door row is ONE tile; the two room-floor [REF#DG-02323]
    // tiles beside it keep the room↔corridor divider pane, so the entrance arch art (realm/dungeon/entrance.png) keeps its drawn shape.
    // The corridor behind stays three wide. Back to three door tiles: window._realmDoorTiles = 3.
    const doorTiles = (typeof window !== 'undefined' && window._realmDoorTiles === 3) ? 1 : 0;
    const door = (R, x, z, side, other) => {
      for (let offset = -doorTiles; offset <= doorTiles; offset++) {
        const dx = (side === 'N' || side === 'S') ? offset : 0;
        const dz = (side === 'E' || side === 'W') ? offset : 0;
        map[x + dx][z + dz] = { type: 'shoji_door', roomId: R.id, realmDoorSide:side, segmentId: 0, sectionIndex: 0 };
      }
      if (!doorsOf.has(R.id)) doorsOf.set(R.id, []); doorsOf.get(R.id).push({ x, z, side, to: other.id }); };
    const carveCorr = (tiles, id) => { for (const [x, z] of tiles) if (map[x][z].type === 'wall') map[x][z] = floorCell(id); };
    for (const e of chosen) {
      const A = cellRoom[e.a[0]][e.a[1]], B = cellRoom[e.b[0]][e.b[1]];
      const id = rooms.length; const tiles = [];
      if (e.axis === 'x') {
        const G = colX[e.b[0]];                                       // the gutter column: the first column of B's cell [REF#DG-02269]
        const zA = ri(A.y + 2, A.y + A.h - 3), zB = ri(B.y + 2, B.y + B.h - 3);
        door(A, A.x + A.w - 1, zA, 'E', B); door(B, B.x, zB, 'W', A);
        for (let x = A.x + A.w; x <= G; x++) tiles.push([x, zA]);
        for (let z = Math.min(zA, zB); z <= Math.max(zA, zB); z++) tiles.push([G, z]);
        for (let x = G + 1; x <= B.x - 1; x++) tiles.push([x, zB]);
        usedDoorSides.add(A.id + 'E'); usedDoorSides.add(B.id + 'W');
      } else {
        const H = rowZ[e.b[1]];                                       // the gutter row: the first row of B's cell [REF#DG-02270]
        // Keep two south-edge tiles clear for the arrival's staircase. [REF#DG-02324]
        const xA = A.id === 0 ? A.x + A.w - 2 : ri(A.x + 2, A.x + A.w - 3), xB = ri(B.x + 2, B.x + B.w - 3);
        door(A, xA, A.y + A.h - 1, 'S', B); door(B, xB, B.y, 'N', A);
        for (let z = A.y + A.h; z <= H; z++) tiles.push([xA, z]);
        for (let x = Math.min(xA, xB); x <= Math.max(xA, xB); x++) tiles.push([x, H]);
        for (let z = H + 1; z <= B.y - 1; z++) tiles.push([xB, z]);
        usedDoorSides.add(A.id + 'S'); usedDoorSides.add(B.id + 'N');
      }
      // Widen the whole route, including bends and doorway approaches. The same [REF#DG-02325]
      // expanded tile set supplies geometry, pathfinding and corridor bounds.
      const wide = new Map();
      for (const [x, z] of tiles) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const xx = x + dx, zz = z + dz;
        if (xx >= 0 && xx < MAP_W && zz >= 0 && zz < MAP_H && map[xx][zz].type === 'wall') wide.set(xx + ',' + zz, [xx, zz]);
      }
      tiles.length = 0; tiles.push(...wide.values());
      carveCorr(tiles, id);
      let a = 1e9, b = 1e9, c2 = -1e9, d = -1e9; for (const [x, z] of tiles) { a = Math.min(a, x); b = Math.min(b, z); c2 = Math.max(c2, x); d = Math.max(d, z); }
      rooms.push({ id, roomId: id, x: a, y: b, w: c2 - a + 1, h: d - b + 1, cx: a + ((c2 - a + 1) >> 1), cz: b + ((d - b + 1) >> 1),
                   center: { x: (a + c2 + 1) / 2, y: (b + d + 1) / 2 }, roomType: 'corridor', kind: 'corridor', isCorridor: true,
                   roomName: 'Passage', roomNameEn: 'Passage', wallStyle: 'dungeon', depthHops: 2, section: 0, sectionIndex: 0, segmentId: 0 });
    }

    // Seeded rock-cut corners retain a three-tile core and every doorway approach. [REF#DG-02326]
    for (const R of rooms.filter(r => r.isRealmChamber && r.id !== 0)) {
      R.wallStyle='cave'; R.roomName=R.roomNameEn='Cavern';
      for (const [cx,cz,dx,dz] of [[R.x,R.y,1,1],[R.x+R.w-1,R.y,-1,1],[R.x,R.y+R.h-1,1,-1],[R.x+R.w-1,R.y+R.h-1,-1,-1]]) {
        const cut=ri(1,2);
        for(let a=0;a<cut;a++)for(let b=0;b<cut-a;b++){
          const x=cx+dx*a,z=cz+dz*b;
          if(map[x][z].type!=='floor' || Math.abs(x-R.cx)<=1 || Math.abs(z-R.cz)<=1)continue;
          if((doorsOf.get(R.id)||[]).some(d=>Math.abs(d.x-x)+Math.abs(d.z-z)<=3))continue;
          if([[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oz])=>{const n=map[x+ox]?.[z+oz];return n&&n.type!=='wall'&&n.roomId!==R.id;}))continue;
          const walkable=(a,b)=>map[a]?.[b] && map[a][b].type!=='wall';
          if((walkable(x-1,z)&&walkable(x+1,z))||(walkable(x,z-1)&&walkable(x,z+1)))continue;
          map[x][z]={type:'wall'};
        }
      }
    }

    // ── THE ARRIVAL: a 2-wide up-staircase on the corner chamber's SOUTH row; the player stands on its left tile ── [REF#DG-02271]
    // The same flight every floor has (Section0, DungeonChain): stairs_up + stairs_up_r side by side, rising to the south, with the
    // chamber's south wall behind it — the engine hangs the exit door on that wall and treats both tiles as one flight. Never on a
    // door tile: the chamber's south join (if it has one) puts its door on this same row.
    const arrival = cellRoom[0][0];
    const sz = arrival.y + arrival.h - 1;
    let sx = -1;
    for (let x = arrival.x; x <= arrival.x + arrival.w - 2; x++) {
      if (map[x][sz].type !== 'floor' || map[x + 1][sz].type !== 'floor') continue;
      if (sx < 0 || Math.abs(x + 0.5 - arrival.center.x) < Math.abs(sx + 0.5 - arrival.center.x)) sx = x;
    }
    if (sx < 0) throw new Error('RealmDungeon: no room for the 2-wide stairs on the arrival chamber\'s south row');
    map[sx][sz] = { type: 'stairs_up', roomId: arrival.id, segmentId: 0, sectionIndex: 0 };
    map[sx + 1][sz] = { type: 'stairs_up_r', roomId: arrival.id, segmentId: 0, sectionIndex: 0 };
    arrival.isRealmArrival = true; arrival.roomName = arrival.roomNameEn = 'Arrival Chamber';

    // ── THE VENDING MACHINE: ONE PER REALM LEVEL, FACING A DOORWAY ── [REF#DG-02272]
    // In the arrival chamber, against the wall OPPOSITE one of its doorways and in line with it, so it faces that doorway across the
    // room. A south doorway is preferred: the player lands on the south-row stairs facing north, so a cabinet on the north wall is the
    // first thing in view. `dir` is the wall the cabinet backs onto (the engine's wallDir); `exact` tells the engine to place it on
    // this tile as given — no floor-1 nudge, no westward shift — and to build no extra cabinets.
    let vendingAnchor = null;
    {
      const A = arrival, doors = [];
      for (let x = A.x; x < A.x + A.w; x++) for (let z = A.y; z < A.y + A.h; z++) if (map[x][z].type === 'shoji_door') doors.push([x, z]);
      doors.sort((a, b) => (b[1] === A.y + A.h - 1 ? 1 : 0) - (a[1] === A.y + A.h - 1 ? 1 : 0));
      for (const [dx, dz] of doors) {
        let ax, az, dir;
        if (dz === A.y + A.h - 1) { ax = dx; az = A.y; dir = 'N'; }              // door in the south wall → cabinet on the north wall [REF#DG-02273]
        else if (dz === A.y)      { ax = dx; az = A.y + A.h - 1; dir = 'S'; }     // north door → south wall [REF#DG-02274]
        else if (dx === A.x + A.w - 1) { ax = A.x; az = dz; dir = 'W'; }          // east door → west wall [REF#DG-02275]
        else if (dx === A.x)      { ax = A.x + A.w - 1; az = dz; dir = 'E'; }     // west door → east wall [REF#DG-02276]
        else continue;
        if (!map[ax] || !map[ax][az] || map[ax][az].type !== 'floor') continue;  // never on a door or the stairs [REF#DG-02277]
        vendingAnchor = { x: ax, z: az, dir, exact: true, facesDoor: [dx, dz] };
        break;
      }
    }

    // ── REACHABILITY (walk the joins, not a flood over every walkable tile) and the furthest chamber ── [REF#DG-02278]
    const chamberIds = rooms.filter(R => R.isRealmChamber).map(R => R.id);
    const adj = new Map(chamberIds.map(id => [id, []]));
    for (const e of chosen) { const A = cellRoom[e.a[0]][e.a[1]], B = cellRoom[e.b[0]][e.b[1]]; adj.get(A.id).push(B.id); adj.get(B.id).push(A.id); }
    const dist = new Map([[arrival.id, 0]]); const via = new Map(); const q = [arrival.id];   // via: the chamber a chamber is first reached from [REF#DG-02279]
    while (q.length) { const u = q.shift(); for (const v of adj.get(u)) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); via.set(v, u); q.push(v); } }
    if (dist.size !== chamberIds.length) throw new Error('RealmDungeon: ' + (chamberIds.length - dist.size) + ' chamber(s) unreachable from the stairs');
    let lordRoom = arrival; for (const id of chamberIds) if (dist.get(id) >= dist.get(lordRoom.id)) lordRoom = rooms[id];   // ties go to the higher number: the Lord's chamber is the last [REF#DG-02280]
    lordRoom.isRealmLordRoom = finalFloor; lordRoom.roomName = lordRoom.roomNameEn = finalFloor ? "Boss Cavern" : "Descent Cavern";

    // ── MONSTERS: a guard inside the doorway of each occupied chamber, the rest roaming it (none by the stairs); the Lord in the furthest ── [REF#DG-02281]
    const mobSpawns = []; const taken = new Set([sx + ',' + sz, (sx + 1) + ',' + sz]);
    if (vendingAnchor) taken.add(vendingAnchor.x + ',' + vendingAnchor.z);
    const freeTile = (R) => { for (let t = 0; t < 40; t++) { const x = ri(R.x + 1, R.x + R.w - 2), z = ri(R.y + 1, R.y + R.h - 2), k = x + ',' + z;
      if (taken.has(k) || map[x][z].type !== 'floor') continue; taken.add(k); return [x, z]; } return null; };
    const baseHp = Math.round(36 + realm * 8);
    let n = 0, ogres = 0;
    const lordAt = [lordRoom.cx, lordRoom.cz];
    // Reserve the boss footprint / stairs and their approach before placing any guards. [REF#DG-02327]
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)taken.add((lordAt[0]+dx)+','+(lordAt[1]+dz));
    if(!finalFloor)map[lordAt[0]][lordAt[1]]={type:'stairs_down',roomId:lordRoom.id,segmentId:0,sectionIndex:0};
    // A MONSTER'S LEVEL IS ITS CHAMBER'S DEPTH: the number of joins from the arrival (1 next door, rising toward the Lord), and its hp [REF#DG-02283]
    // rises 15% a level, so the level climbs room by room as the room numbers do.
    const levelOf = (R) => Math.max(1, dist.get(R.id) || 1);
    // a body the engine does not own (RealmThemes BODIES): the file, its height in world units, its lift and its facing [REF#DG-02284]
    const bodyOf = (id) => { const Bd = (RT && id) ? RT.BODIES[id] : null; if (!Bd) return null;
      const o = { bodyUrl: Bd.url, bodyHeight: Bd.height, bodyLift: Bd.lift }; if (typeof Bd.yaw === 'number') o.bodyYaw = Bd.yaw; return o; };
    const spawn = (k, at, extra, L) => { k = familyFor(rooms[map[at[0]][at[1]].roomId]); const F = FAMILIES[k]; if (F.big) ogres++; L = Math.max(1, L | 0);
      const hp = Math.max(F.hpMin || 1, Math.round(baseHp * F.hpMul * (0.85 + rnd() * 0.3) * (1 + 0.15 * (L - 1))));
      return Object.assign({ id: 'realm' + realm + '-' + (n++), nameKey: F.nameKey, name: F.name, type: 'monster', x: at[0], z: at[1], hp, maxHp: hp, level: L,
                             isHostile: true, forceHostile: true, isRealmMonster: true, realmFamily:k, segmentId: 0, vulnerability: Object.assign({}, F.vuln) }, bodyOf(F.body), F.flags, extra || null); };
    const withSpiders = (mix, k) => (opts.spiders !== false ? mix.concat([['spider', SPIDER_MIX[k]]]) : mix);
    const known = (mix) => mix.filter(m => FAMILIES[m[0]] && (!FAMILIES[m[0]].body || (RT && RT.BODIES[FAMILIES[m[0]].body])));
    const guardMix = withSpiders(known((T && T.guard) || GUARD_MIX), 'guard'), roamMix = withSpiders(known((T && T.roam) || ROAM_MIX), 'roam');
    const fits = (R, mix) => ((R.w < 4 || R.h < 4 || ogres >= OGRE_CAP) ? mix.filter(m => !FAMILIES[m[0]].big) : mix);   // no ogre in a 3-wide closet, none past the cap [REF#DG-02286]
    // TWICE THE MONSTERS (2026-10-01, the order quoted in the engine register's REALM PORTAL entry): 44-56 in realm 1, two more per [REF#DG-02287]
    // realm, up to 72 —
    // was 22-28, one more per realm, up to 36. A chamber holds twice as many as before too (a 4x4 six, an 8x8 eight; it was 2 and 4).
    const budget = Math.min(72, ri(44, 56) + 2 * (realm - 1));
    const cap = (R) => (R === lordRoom ? 3 : Math.max(1, Math.min(8, Math.floor(R.w * R.h / 3))));   // bodies a chamber holds, the boss aside [REF#DG-02288]
    const homes = rooms.filter(R => R.isRealmChamber && R !== arrival);
    // THE OGRES IN FRONT OF THE LORD: every chamber joined to his has an ogre standing guard in its doorway (an orc in a 3-wide [REF#DG-02289]
    // closet), and the chamber on the shortest way in has a second ogre — always occupied, never thinned.
    const front = new Set((adj.get(lordRoom.id) || []).filter(id => id !== arrival.id));
    const frontDoor = via.get(lordRoom.id);
    const roomFamilies=new Map();
    const bossFamily=({king:'knight',queen:'oni',witch:'oni',master:'oni',lord:'ogre'})[boss] || boss;
    if(lordRoom.isRealmLordRoom && FAMILIES[bossFamily])roomFamilies.set(lordRoom.id,bossFamily);
    const familyFor=R=>{
      if(!roomFamilies.has(R.id))roomFamilies.set(R.id,wpick(fits(R,roamMix)));
      R.realmFamily=roomFamilies.get(R.id);return R.realmFamily;
    };
    let occupied = homes.filter(R => R === lordRoom || front.has(R.id) || rnd() >= 0.15);
    while (occupied.length > Math.max(1, Math.round(budget * 0.62))) { const cut = occupied.filter(X => X !== lordRoom && !front.has(X.id)); if (!cut.length) break; const R = pick(cut); occupied = occupied.filter(X => X !== R); }
    const held = new Map();
    const inside = (d) => (d.side === 'E' ? [d.x - 1, d.z] : d.side === 'W' ? [d.x + 1, d.z] : d.side === 'N' ? [d.x, d.z + 1] : [d.x, d.z - 1]);
    const open = (R, x, z) => x >= R.x && x < R.x + R.w && z >= R.y && z < R.y + R.h && map[x][z].type === 'floor' && !taken.has(x + ',' + z);

    if(finalFloor && boss==='king') {
      for(const family of ['skeleton_archer','skeleton_guard','skeleton_archer','skeleton_guard']) {
        const candidates=[lordRoom,...[...front].map(id=>rooms[id])];
        let at=null,R=null;
        for(const candidate of candidates){at=freeTile(candidate);if(at){R=candidate;break;}}
        if(!at)throw new Error('RealmDungeon: no clear tile for King escort');
        mobSpawns.push(spawn(family,at,{guardsTheLord:true,realmKingEscort:true,noFlee:true},levelOf(R)));
      }
    }

    // the GUARD: just inside the doorway the player reaches the chamber by, else inside another of its doorways, else the free tile nearest that doorway [REF#DG-02291]
    let guards = 0;
    for (const R of occupied) {
      const ds = doorsOf.get(R.id) || [];
      const entry = ds.find(d => d.to === via.get(R.id)) || ds[0];
      if (!entry) continue;
      let at = null, by = entry;
      for (const d of [entry].concat(shuffle(ds.filter(d => d !== entry)))) { const t = inside(d); if (open(R, t[0], t[1])) { at = t; by = d; break; } }
      if (!at) { const t0 = inside(entry); let best = 1e9;
        for (let x = R.x; x < R.x + R.w; x++) for (let z = R.y; z < R.y + R.h; z++) { const dd = Math.abs(x - t0[0]) + Math.abs(z - t0[1]); if (open(R, x, z) && dd < best) { best = dd; at = [x, z]; } } }
      if (!at) continue;
      taken.add(at[0] + ',' + at[1]);
      const gk = familyFor(R);
      if(FAMILIES[gk].big && ogres>=OGRE_CAP)continue;
      mobSpawns.push(spawn(gk, at, { isRealmGuard: true, guardRoomId: R.id, guardDoor: [by.x, by.z], guardsTheLord: front.has(R.id) || undefined }, levelOf(R)));
      held.set(R.id, mobSpawns.filter(m=>map[m.x][m.z].roomId===R.id).length); guards++;
    }

    // the second ogre on the shortest way in to the Lord [REF#DG-02292]
    { const R = rooms[frontDoor]; if (R && R !== arrival && R.w >= 4 && R.h >= 4) { const t = (function () { for (let k = 0; k < 40; k++) { const x = ri(R.x + 1, R.x + R.w - 2), z = ri(R.y + 1, R.y + R.h - 2), kk = x + ',' + z;
        if (!taken.has(kk) && map[x][z].type === 'floor') { taken.add(kk); return [x, z]; } } return null; })();
      if (t && (!FAMILIES[familyFor(R)].big || ogres<OGRE_CAP)) { mobSpawns.push(spawn(familyFor(R), t, { guardsTheLord: true }, levelOf(R))); held.set(R.id, (held.get(R.id) || 0) + 1); } } }
    // the ROAMERS: dealt to the occupied chambers by the room each has left, until the budget is met; they keep off the doorways [REF#DG-02293]
    const roamTile = (R) => {
      const doorway = new Set((doorsOf.get(R.id) || []).map(d => inside(d).join(',')));
      const inner = [], edge = [];
      for (let x = R.x; x < R.x + R.w; x++) for (let z = R.y; z < R.y + R.h; z++) {
        const k = x + ',' + z; if (taken.has(k) || map[x][z].type !== 'floor' || doorway.has(k)) continue;
        ((x > R.x && x < R.x + R.w - 1 && z > R.y && z < R.y + R.h - 1) ? inner : edge).push([x, z]);
      }
      const pool = inner.length ? inner : edge; if (!pool.length) return null;
      const t = pick(pool); taken.add(t[0] + ',' + t[1]); return t;
    };
    let left = budget - mobSpawns.length;
    for (let tries = 0; left > 0 && tries < 400; tries++) {
      const room = occupied.filter(R => (held.get(R.id) || 0) < cap(R));
      if (!room.length) break;
      let tot = 0; for (const R of room) tot += cap(R) - (held.get(R.id) || 0);
      let u = rnd() * tot, R = room[room.length - 1];
      for (const X of room) { u -= cap(X) - (held.get(X.id) || 0); if (u < 0) { R = X; break; } }
      const k = familyFor(R);
      if(FAMILIES[k].big && ogres>=OGRE_CAP){held.set(R.id,cap(R));continue;}
      const want = Math.min(left, cap(R) - (held.get(R.id) || 0), PACK[k] ? ri(1, PACK[k]) : 1, FAMILIES[k].big ? OGRE_CAP-ogres : Infinity);
      let placed = 0;
      for (let i = 0; i < want; i++) { const at = roamTile(R); if (!at) break; mobSpawns.push(spawn(k, at, null, levelOf(R))); placed++; }
      held.set(R.id, placed ? (held.get(R.id) || 0) + placed : cap(R));   // a chamber with no tile left is full [REF#DG-02294]
      left -= placed;
    }
    // THE BOSS (isRealmLord, whatever its title): a KING, QUEEN or MASTER wears its own body (RealmThemes BOSSES → BODIES); the LORD is [REF#DG-02295]
    // the ogre. Named for the default tone here — the engine renames it for the tone the player picks at the portal ("Dark Queen").
    const B = RT ? RT.BOSSES[boss] : null; const bossName = RT ? RT.bossName(boss, RT.DEFAULT_TONE) : 'Ogre Warlord';
    if(finalFloor) { const at = lordAt; const hp = Math.round(baseHp * 5 * ((B && B.hpMul) || 1));
      mobSpawns.push(Object.assign({ id: 'realm' + realm + '-lord', nameKey: (B && B.nameKey) || 'ogre', name: bossName, displayName: bossName, type: 'monster', x: at[0], z: at[1], hp, maxHp: hp, level: (dist.get(lordRoom.id) || 1) + 2,
                       isHostile: true, forceHostile: true, isRealmMonster: true, isRealmLord: true, realmBoss: boss, hpExact: true, noFloat: true, meleeOnly: true, noFlee: true,
                       segmentId: 0, bossLevelOffset: rnd()<0.5 ? -1 : 1, realmSizeMul:(B && B.sizeMul)||1,
                       realmMagicChance:B && B.magicChance, isKnight:boss==='king', poisonOnHit:boss==='spider',
                       vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
                       (B && B.body) ? bodyOf(B.body) : (boss==='spider'||boss==='ant') ? {} : { targetHeight: 2.6 })); }

    // ── OWN CONTRACT (never DungeonChain's) ── [REF#DG-02296]
    rooms.forEach((R, i) => { if (R.id !== i) throw new Error('RealmDungeon: rooms[' + i + '] carries id ' + R.id); });
    let ups = 0; for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_H; z++) { const c = map[x][z];
      if (c.type === 'stairs_up') ups++;
      if (c.type === 'wall') { const wk = (a, b) => map[a] && map[a][b] && map[a][b].type !== 'wall';
        if ((wk(x - 1, z) && wk(x + 1, z)) || (wk(x, z - 1) && wk(x, z + 1))) throw new Error('RealmDungeon: BAND — a wall tile between walkables at ' + x + ',' + z); } }
    if (ups !== 1) throw new Error('RealmDungeon: expected exactly one stairs_up, found ' + ups);
    if (map[sx][sz + 1].type !== 'wall' || map[sx + 1][sz + 1].type !== 'wall') throw new Error('RealmDungeon: the stairs have no wall behind them for the exit door');
    if (!vendingAnchor) throw new Error('RealmDungeon: no wall in the arrival chamber faces one of its doorways for the vending machine');
    const reachable=new Set([sx+','+sz]),walk=[[sx,sz]];
    for(let i=0;i<walk.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=walk[i][0]+dx,z=walk[i][1]+dz,k=x+','+z;
      if(map[x]?.[z] && map[x][z].type!=='wall' && !reachable.has(k)){reachable.add(k);walk.push([x,z]);}
    }
    for(const R of rooms.filter(r=>r.isRealmChamber))if(!reachable.has(R.cx+','+R.cz))throw new Error('RealmDungeon: disconnected cavern '+R.id);
    for(const m of mobSpawns)if(!reachable.has(m.x+','+m.z))throw new Error('RealmDungeon: unreachable monster '+m.id);

    const all = rooms.map(R => R.id);
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const R of rooms) { bx0 = Math.min(bx0, R.x); bz0 = Math.min(bz0, R.y); bx1 = Math.max(bx1, R.x + R.w); bz1 = Math.max(bz1, R.y + R.h); }
    const tally = {}; for (const s of mobSpawns) if (!s.isRealmLord) tally[s.nameKey] = (tally[s.nameKey] || 0) + 1;
    try { console.log('[RealmDungeon] realm ' + realm + ' — ' + chamberIds.length + ' chambers in a ' + COLS + 'x' + ROWS + ' grid, ' + chosen.length + ' passages ('
      + loops + ' loop' + (loops === 1 ? '' : 's') + '), ' + (mobSpawns.length - 1) + ' hostiles (' + guards + ' door guards, ' + (homes.length - occupied.length)
      + ' empty chambers; ' + Object.keys(tally).map(k => k + ' ' + tally[k]).join(' · ') + ') + the Lord in chamber ' + lordRoom.id + ' (' + dist.get(lordRoom.id)
      + ' joins from the stairs). nonce ' + (opts.nonce != null ? opts.nonce : 0)); } catch (_) {}
    return { map, rooms, spawnX: sx, spawnZ: sz, mobSpawns, vendingAnchor, gates: [],
             segments: [{ id: 0, roomIds: all, bounds: { minX: bx0 - 1, minZ: bz0 - 1, maxX: bx1 + 1, maxZ: bz1 + 1 } }],
             realm: { index: realm, finalFloor, lordRoomId: lordRoom.id, arrivalRoomId: arrival.id, chambers: chamberIds.length, theme, boss, lord: bossName } };
  }

  const API = { generateDungeonMap, setMapSeed: function () {} };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.RealmDungeon = API;
})(typeof window !== 'undefined' ? window : globalThis);
