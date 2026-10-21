/** [REF#DG-00733]
 * MapGen.js — T0.1.B extraction from NewOrigami.Engine9.html
 *
 * Procedural dungeon generator. No Three.js dependency.
 * Export: generateDungeonMap(level, MAP_W, MAP_H) → { map, rooms, spawnX, spawnZ, mobSpawns }
 *
 * ULTRA-COMPACT LAYOUT: 1 room per level placed adjacent with doorway openings.
 * No long corridors. Levels 1-6 have regular rooms, Level 7 has OniBaba throne room.
 *
 * ── Seedable RNG (2026-05-25) ──
 * `_rand()` replaces every Math.random() call below. By default it falls
 * through to Math.random — so callers that never call setMapSeed() see no
 * behaviour change. Engine boot generates a per-game seed (stored in
 * sessionStorage), then derives a per-floor sub-seed via
 *   floorSeed = gameSeed XOR (level * 0x1A1A1A1A)
 * before calling generateDungeonMap. RESTORE re-seeds with the saved
 * gameSeed → byte-identical dungeon layout on load.
 */
let _mapRng = Math.random;
function _rand(){ return _mapRng(); }
function _mulberry32(a){
  return function(){
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function setMapSeed(seed){
  _mapRng = _mulberry32((seed >>> 0) || 1);
}
export function clearMapSeed(){ _mapRng = Math.random; }

// ── Floor 1 Hand-Authored Layout ─────────────────────────────────────────── [REF#DG-00734]
export function generateFloor1HandAuthoredMap(MAP_W = 128, MAP_H = 128) {
  const map = Array.from({ length: MAP_W }, () =>
    Array.from({ length: MAP_H }, () => ({ type: "wall" })),
  );
  const rooms = [];
  const mobSpawns = [];

  const carveRoom = (id, x0, z0, w, h, opts = {}) => {
    for (let x = x0; x < x0 + w; x++) {
      for (let z = z0; z < z0 + h; z++) {
        map[x][z] = { type: "floor", room: true, roomId: id, ...opts };
      }
    }
    const cx = Math.floor(x0 + w / 2),
      cz = Math.floor(z0 + h / 2);
    rooms.push({
      id,
      x: x0,
      y: z0,
      w,
      h,
      cx,
      cz,
      center: { x: cx, y: cz },
      ...opts,
    });
  };

  // ════════════════════════════════════════════════════════════════════════ [REF#DG-00735]
  // TRUE THIN EDGE-WALLS (Mark: "no empty-space squares; rooms TOUCH, ONE thin panel on the shared line").
  // The interior is all FLOOR, partitioned by roomId; the engine draws one pane per roomId boundary (+ the
  // outer perimeter) and leaves a GAP where a tile edge is marked via _door. NO wall TILES between rooms.
  // Recovered from the .trust bank (2026-06-11), forward-ported 2026-06-14 + Mark's deltas
  // (greeters 2 gob + 1 imp · casino supervisor 10× HP · Room-0 starter cards · casino tag).
  // ════════════════════════════════════════════════════════════════════════
  const _fill = (id, x0, x1, z0, z1, opts = {}) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (map[x]?.[z]) map[x][z] = { type: "floor", room: true, roomId: id, ...opts }; };
  const _door = (x, z, dir) => { if (map[x]?.[z]) (map[x][z].doors || (map[x][z].doors = [])).push(dir); };   // mark a tile EDGE as a door gap (no pane, passable) [REF#DG-00736]

  // CENTRE — the CABARET (room 1), x60-67 z92-99 (8×8). Small stage + sake bar + slot machine. [REF#DG-00737]
  carveRoom(1, 60, 92, 6, 6, { roomName: "キャバレー花月", roomNameEn: "Cabaret", roomType: "foyer", isLockedStartRoom: true, isCabaret: true });   // 6x6 (Mark 2026-06-16, was 8x8): x60-65, z92-97. Ring widens inward to fill the freed tiles; doors moved to the new edges below. [REF#DG-00738]

  // MAIN HALL — 2-tile ring (room 0) wrapping the cabaret, tiling DIRECTLY against it (single pane, no gap). [REF#DG-00739]
  _fill(0, 58, 59, 90, 101);   // west run  (touches cabaret x60) [REF#DG-00740]
  _fill(0, 66, 69, 90, 101);   // east run  (widened to x66 — touches new cabaret east edge x65; fills freed x66-67) [REF#DG-00741]
  _fill(0, 58, 69, 90, 91);    // north run (touches cabaret z92) [REF#DG-00742]
  _fill(0, 58, 69, 98, 101);   // south run (widened to z98 — touches new cabaret south edge z97; fills freed z98-99) [REF#DG-00743]
  // ROOM 0 south entry — the entrance approach onto the south ring; starter cards + vending + stairs_up. [REF#DG-00744]
  _fill(0, 62, 65, 102, 104);
  map[63][105] = { type: "stairs_up", roomId: 0 };
  map[64][105] = { type: "stairs_up_r", roomId: 0 };
  rooms.push({ id: 0, x: 58, y: 90, w: 12, h: 15, cx: 63, cz: 101, center: { x: 63, y: 101 }, roomName: "回廊", roomNameEn: "Main Hall", roomType: "hallway", isEntranceHall: true, isMainHall: true });
  const spawnX = 63, spawnZ = 104;

  // OUTER QUARTERS — each tiles DIRECTLY against the ring (shared thin wall, no gap tile). [REF#DG-00745]
  carveRoom(2, 51, 90, 7, 12, { roomName: "仮眠室", roomNameEn: "Workers' Bunkroom", roomType: "dorm" });        // WEST  (touches ring x58) [REF#DG-00746]
  carveRoom(3, 70, 90, 7, 12, { roomName: "賭場", roomNameEn: "Casino — Level 1", roomType: "casino", isCasino: true, casinoLevel: 1 });   // EAST — small casino protecting the descent [REF#DG-00747]
  map[74][95] = { type: "stairs_down", roomId: 3 };
  map[74][96] = { type: "stairs_down_r", roomId: 3 };
  carveRoom(4, 58, 84, 12, 6, { roomName: "洗い場", roomNameEn: "Laundry", roomType: "utility" });               // NORTH (touches ring z90) [REF#DG-00748]

  // DOOR GAPS (2-wide edge markers) — open the inner tile edge toward the corridor: [REF#DG-00749]
  _door(63, 97, 'S'); _door(64, 97, 'S');   // cabaret ↔ south ring (grand entrance) — moved z99→z97 for the 6x6 cabaret [REF#DG-00750]
  _door(57, 95, 'E'); _door(57, 96, 'E');   // bunkroom ↔ west ring [REF#DG-00751]
  _door(70, 95, 'W'); _door(70, 96, 'W');   // casino ↔ east ring [REF#DG-00752]
  _door(63, 89, 'S'); _door(64, 89, 'S');   // laundry ↔ north ring [REF#DG-00753]
  _door(65, 94, 'E'); _door(65, 95, 'E');   // cabaret ↔ east ring side exit (Mark 2026-06-16: moved x67→x65 for the 6x6 cabaret; imp alert-runner bolts out here) [REF#DG-00754]

  // CABARET greeters — 2 goblins + 1 imp (neutral, greet the player). Mark 2026-06-14. [REF#DG-00755]
  const _greet = (id, isImp, x, z) => mobSpawns.push({
    id, nameKey: isImp ? "yakuza_imp_herald" : "yakuza_goblin_herald",
    name: isImp ? "Yakuza Imp" : "Yakuza Goblin", type: "monster", x, z,
    hp: isImp ? 30 : 50, maxHp: isImp ? 30 : 50, isHostile: false, isImp,
    vulnerability: { FIRE: 1.3, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 },
  });
  // cab-gob-1 DROPPED (ported to recovery-0708 from main 60dbf30, per Mark "hidden yakuza goblin") — same husk/duplicate-id [REF#DG-00756]
  // class as cab-imp-1: it collides with the Engine8 hardcoded cab-gob-1 (~2028). Restore: uncomment.
  // _greet('cab-gob-1', false, 62, 96);
  _greet('cab-gob-2', false, 65, 96);
  // cab-imp-1 DROPPED 2026-07-08 (Claude, per Mark "missing monster model") — it is a no-skinned-body HUSK (3× ~514-vert [REF#DG-00757]
  // invisible meshes) that dedup-mismatched against cab-imp-fan (the REAL visible imp, Engine8 ~2017). Mirrors
  // DungeonChain.js:633 (already dropped from the default path); this closes the last (hand-authored/fallback) spawn
  // vector so the husk can never resurface. Restore the 2nd imp: uncomment the _greet line below.
  // _greet('cab-imp-1', true,  63, 97);

  // CASINO level supervisor — guards the descent at 10× normal-monster HP (floor-1 normal = 50). Mark 2026-06-14. [REF#DG-00758]
  mobSpawns.push({
    id: 'boss-supervisor-L1', nameKey: "yakuza_supervisor", name: "Yakuza Level Supervisor",
    type: "monster", x: 73, z: 95, hp: 500, maxHp: 500, isHostile: true, isSupervisor: true,
    vulnerability: { FIRE: 1.1, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.0, DEFAULT: 0.95 },
  });

  // ROOM 0 STARTER CARDS — the testing kit on the south-entry floor. catIds render-safe (ITEM/MISSILE/element/KATANA). [REF#DG-00759]
  const STARTER = [
    { catId:'ITEM',    title:'MAGIC LANTERN', desc:'Lights the dark',  kanji:'灯', attr:'(LIGHT)' },     // flashlight [REF#DG-00760]
    { catId:'MISSILE', title:'DAGGER',        desc:'Thrown blade',     kanji:'刃', attr:'(DMG*1DICE)' },
    { catId:'MISSILE', title:'SHURIKEN',      desc:'Throwing star',    kanji:'投', attr:'(DMG*1DICE)' },
    { catId:'MISSILE', title:'SHORT BOW',     desc:'Light bow',        kanji:'弓', attr:'(DMG*2DICE)' },
    { catId:'FIRE',    title:'FIREBALL',      desc:'A test spell',     kanji:'火', attr:'(DMG*4DICE)' },  // one spell (testing) [REF#DG-00761]
    { catId:'KATANA',  title:'KATANA',        desc:'Melee weapon — melee system WIP', kanji:'刀', attr:'(MELEE)' },
  ];
  const _cardCells = [[62,102],[63,102],[64,102],[65,102],[62,103],[63,103]];
  STARTER.forEach((c, i) => { const cell = _cardCells[i]; if (cell) mobSpawns.push({ id:`room0-starter-${i}`, type:'loot_card', x:cell[0], z:cell[1], catId:c.catId, title:c.title, desc:c.desc, kanji:c.kanji, attr:c.attr }); });

  // vendingAnchor: the FAR END of Room 0 (by the stairs_up) — Mark "vending at the end of it". [REF#DG-00762]
  // vendingAnchor: in the MAIN HALL right beside the cabaret entrance door (Mark 2026-06-15).
  // Cabaret↔hall door is at (63-64, 99); the south hall run is z100-101 → park the vending at (66,100),
  // a couple tiles east of the door, against the cabaret's south pane, facing the approaching player.
  // ── TEST SPAWNS (Mark 2026-06-16): each room gets 3 random monsters (goblin/imp mix) to exercise
  //    combat, the imp fire-and-flee-to-cover (hasFlintlock), and the imp alert-runner. ADDITIVE +
  //    flag-gated so it NEVER corrupts the shipping floor. ENABLE: localStorage.setItem('ou_testSpawns','1')
  //    then reload (the map regenerates at boot). DISABLE: localStorage.removeItem('ou_testSpawns').
  const _testSpawnsOn = (typeof window !== 'undefined') &&
    (window._testSpawns === true ||
     (typeof localStorage !== 'undefined' && localStorage.getItem('ou_testSpawns') === '1'));
  if (_testSpawnsOn) {
    const _testRooms = [
      { id: 0, x0: 58, x1: 69, z0: 90, z1: 101 },  // main hall ring [REF#DG-00763]
      { id: 1, x0: 60, x1: 65, z0: 92, z1: 97  },  // cabaret (6x6) [REF#DG-00764]
      { id: 2, x0: 51, x1: 57, z0: 90, z1: 101 },  // bunkroom (west) [REF#DG-00765]
      { id: 3, x0: 70, x1: 76, z0: 90, z1: 101 },  // casino (east) [REF#DG-00766]
      { id: 4, x0: 58, x1: 69, z0: 84, z1: 89  },  // laundry (north) [REF#DG-00767]
    ];
    let _placed = 0;
    for (const r of _testRooms) {
      let n = 0, tries = 0;
      while (n < 3 && tries < 80) {
        tries++;
        const tx = r.x0 + Math.floor(Math.random() * (r.x1 - r.x0 + 1));
        const tz = r.z0 + Math.floor(Math.random() * (r.z1 - r.z0 + 1));
        const cell = map[tx]?.[tz];
        if (!cell || cell.type !== 'floor' || cell.roomId !== r.id) continue;  // open floor in THIS room only [REF#DG-00768]
        const isImp = Math.random() < 0.5;
        mobSpawns.push({
          id: `test-r${r.id}-${n}`,
          nameKey: isImp ? 'yakuza_imp_herald' : 'yakuza_goblin_herald',
          name: isImp ? 'Yakuza Imp' : 'Yakuza Goblin',
          type: 'monster', x: tx, z: tz,
          hp: isImp ? 30 : 50, maxHp: isImp ? 30 : 50,
          isHostile: false, isImp, hasFlintlock: isImp,   // imps fire-and-flee from cover (hasFlintlock corner-peek) [REF#DG-00769]
          vulnerability: { FIRE: 1.3, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 },
        });
        n++; _placed++;
      }
    }
    try { console.log(`[TEST SPAWNS] +${_placed} random goblins/imps across ${_testRooms.length} rooms (ou_testSpawns)`); } catch (_) {}
  }

  return { map, rooms, spawnX, spawnZ, mobSpawns, vendingAnchor: { x: 65, z: 100, dir: 'N' } };   // Mark 2026-06-15: 1 tile closer to the cabaret door (66→65) [REF#DG-00770]
}

export function generateDungeonMap(level = 1, MAP_W = 128, MAP_H = 128) {
  level = Math.max(1, Math.min(20, level)); // Support levels 1-20 [REF#DG-00771]
  // FLOOR 1 = the hand-authored single-pane CABARET ring complex (recovered + Mark's deltas, 2026-06-14). [REF#DG-00772]
  // Floors 2-20 stay procedural below.
  if (level === 1) return generateFloor1HandAuthoredMap(MAP_W, MAP_H);
  // ── SECTIONED BRANCHING MAZE (Mark 2026-07-13 "section out the dungeon … like a maze … each section completed before [REF#DG-00773]
  //    finding stairs down") — levels 2-6 build wings of 4-6 squared rooms linked by hallways over a branching maze graph,
  //    entered from a corner with the stairs_down LOCKED in the far wing; seeded (different each floor) + depth-scaled.
  //    Isolated from the legacy dense generator below — A/B revert with NO reload: window._sectionedMaze = false. Phase 1
  //    (structure). Phase 2 (explore-gate that unlocks the stairs door) is engine-side. Level 1 (cabaret) stays hand-authored.
  if (level >= 2 && level <= 6 && !(typeof window !== 'undefined' && window._sectionedMaze === false)) {
    return generateSectionedMaze(level, MAP_W, MAP_H);
  }
  const map = Array.from({ length: MAP_W }, () =>
    Array.from({ length: MAP_H }, () => ({ type: "wall" })),
  );
  const rooms = [];
  const BORDER = 3; // keep rooms away from map edge [REF#DG-00774]
  const MIN_R = 5,
    MAX_R = 9; // slightly larger so 14-20 rooms still fit on 128x128 [REF#DG-00775]
  const ROOM_BUFFER = 1; // 1-tile wall between rooms (the wall we punch openings through) [REF#DG-00776]
  const ONIBABA_ROOM_SIZE = 18; // boss sanctum (level 7) [REF#DG-00777]
  // Japanese castle layout — 14-20 densely packed rooms, all connected via [REF#DG-00778]
  // shoji openings on at least 2 different cardinal walls per room. Level 7
  // anchors a central throne room. No long hallway corridors anywhere.
  // Level 7 hosts the throne so caps slightly lower (room budget eaten by sanctum).
  const targetRooms = level === 1
    ? 5 + Math.floor(_rand() * 4)     // 5-8 rooms for Floor 1 [REF#DG-00779]
    : (level === 7
        ? 14 + Math.floor(_rand() * 3)   // 14-16 around the throne [REF#DG-00780]
        : 14 + Math.floor(_rand() * 7));  // 14-20 elsewhere [REF#DG-00781]

  // ── Carve a rectangular room and register it ────────────────────────────── [REF#DG-00782]
  const carveRoom = (id, x0, z0, w, h, opts = {}) => {
    // Rooms should have a size limit unless they are special rooms [REF#DG-00783]
    if (!opts.isOniBaba && !opts.isSpecialRoom) {
      w = Math.min(w, 12);
      h = Math.min(h, 12);
    }

    for (let x = x0; x < x0 + w; x++)
      for (let z = z0; z < z0 + h; z++)
        map[x][z] = { type: "floor", room: true, roomId: id, ...opts };
    const cx = Math.floor(x0 + w / 2),
      cz = Math.floor(z0 + h / 2);
    rooms.push({
      id,
      x: x0,
      y: z0,
      w,
      h,
      cx,
      cz,
      center: { x: cx, y: cz },
      ...opts,
    });
  };

  // ── Create a simple doorway opening between rooms (T0.18, rewritten) ────── [REF#DG-00784]
  // Two cases:
  //  1. Rooms are ADJACENT (share a wall via the 1-tile ROOM_BUFFER): find a
  //     wall tile touching both rooms' floor on opposite sides and punch it
  //     (1 or 2 tiles wide). This is the user-requested "simple opening".
  //  2. Rooms are NOT adjacent (random scatter landed them apart): carve a
  //     1-tile L-shaped corridor from A's center toward B's center. Tiles
  //     get marked corridor:true (no door geometry, just floor).
  const createDoorway = (roomA, roomB) => {
    // Collect all wall tiles that touch BOTH rooms (case 1 candidates) [REF#DG-00785]
    const candidates = [];
    const xMin = Math.max(0, Math.min(roomA.x, roomB.x) - 1);
    const xMax = Math.min(
      MAP_W - 1,
      Math.max(roomA.x + roomA.w, roomB.x + roomB.w),
    );
    const zMin = Math.max(0, Math.min(roomA.y, roomB.y) - 1);
    const zMax = Math.min(
      MAP_H - 1,
      Math.max(roomA.y + roomA.h, roomB.y + roomB.h),
    );
    for (let x = xMin; x <= xMax; x++) {
      for (let z = zMin; z <= zMax; z++) {
        if (map[x]?.[z]?.type !== "wall") continue;
        let touchA = false,
          touchB = false;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const c = map[x + dx]?.[z + dz];
          if (c?.roomId === roomA.id) touchA = true;
          if (c?.roomId === roomB.id) touchB = true;
        }
        if (touchA && touchB) candidates.push({ x, z });
      }
    }

    if (candidates.length === 0) return false; // not adjacent — nothing to punch [REF#DG-00786]
    // Adjacent rooms — punch a shoji sliding-door opening. If `skipTiles` is [REF#DG-00787]
    // provided (e.g. for a second opening on the same room-pair), avoid
    // reusing those tiles so we don't just widen the existing door.
    const pick = candidates[Math.floor(_rand() * candidates.length)];
    // ~32% of doorways are PANELLESS — open archways with no paper panel. [REF#DG-00788]
    // Mixing panelled and panelless openings gives the dungeon visual rhythm
    // and makes broken-vs-intact panels actually meaningful information.
    const panelless = _rand() < 0.32;
    map[pick.x][pick.z] = { type: "shoji_door", roomId: roomA.id, panelless };
    // 50% chance to widen the opening to 2 tiles (big main entry feel) [REF#DG-00789]
    if (_rand() < 0.5) {
      const adj = candidates.find(
        (c) =>
          (c.x === pick.x + 1 && c.z === pick.z) ||
          (c.x === pick.x - 1 && c.z === pick.z) ||
          (c.x === pick.x && c.z === pick.z + 1) ||
          (c.x === pick.x && c.z === pick.z - 1),
      );
      if (adj)
        map[adj.x][adj.z] = { type: "shoji_door", roomId: roomA.id, panelless };
    }
    return true;
  };

  // ── Overlap check with buffer ───────────────────────────────────────────── [REF#DG-00790]
  const overlaps = (x0, z0, w, h, buf = ROOM_BUFFER) => {
    if (x0 - buf < BORDER || z0 - buf < BORDER) return true;
    if (x0 + w + buf >= MAP_W - BORDER || z0 + h + buf >= MAP_H - BORDER)
      return true;
    for (const r of rooms) {
      if (
        x0 - buf < r.x + r.w &&
        x0 + w + buf > r.x &&
        z0 - buf < r.y + r.h &&
        z0 + h + buf > r.y
      )
        return true;
    }
    return false;
  };

  // ── Japanese room name pool per level ──────────────────────────────────── [REF#DG-00791]
  const ROOM_POOLS = [
    // FLOOR 1 IS STAFF QUARTERS (Mark 2026-07-28) — kept IDENTICAL to DungeonChain.js ~1152, which is [REF#DG-00792]
    // the live generator; this file is the hand-authored fallback (window._floor1HandAuthored) and the
    // two must not disagree, or floor 1 renames itself depending on which generator ran. Rationale and
    // the index-alignment warning live at the DungeonChain copy.
    /* L1 */ [
      "長屋",
      "飯場",
      "寝床",
      "作業場",
      "道具部屋",
      "土間",
      "番所",
      "倉庫",
      "湯殿",
      "厩",
    ],
    /* L2 */ [
      "地下廊下",
      "石牢",
      "水責め部屋",
      "拷問部屋",
      "隠し部屋",
      "番兵詰所",
      "武器庫",
      "兵糧庫",
      "火薬庫",
      "地下道",
    ],
    /* L3 */ [
      "呪いの間",
      "骸骨の部屋",
      "腐敗の廊下",
      "古戦場",
      "血の祭壇",
      "暗黒の庭",
      "亡者の館",
      "闇の蔵",
      "冥界の扉",
      "怨霊の間",
    ],
    /* L4 */ [
      "炎の間",
      "溶岩の廊下",
      "鬼の洞窟",
      "業火の部屋",
      "赤鬼の間",
      "閻魔の庭",
      "地獄谷",
      "焦熱地獄",
      "火の柱",
      "灼熱の間",
    ],
    /* L5 */ [
      "氷の廊下",
      "雪女の間",
      "吹雪の洞",
      "霜の蔵",
      "冰牢",
      "雪の祭壇",
      "凍てつく間",
      "氷柱の廊",
      "白銀の間",
      "霧の間",
    ],
    /* L6 */ [
      "雷の間",
      "稲妻の廊下",
      "嵐の洞",
      "天雷の部屋",
      "神鳴の間",
      "龍神の庭",
      "電光石火",
      "疾風の間",
      "暴風の蔵",
      "雷神の祭壇",
    ],
    /* L7 */ [
      "鬼婆の聖域",
      "冥府の門",
      "黒龍の間",
      "業の間",
      "六道の辻",
      "恩讐の庭",
      "鬼の玉座",
      "幽冥の奥",
      "彼岸の間",
      "魂の祭壇",
    ],
    /* L8 */ [
      "風の回廊",
      "竜巻の間",
      "疾風の庭",
      "嵐の神殿",
      "天空の間",
      "雲の上の部屋",
      "雷雲の間",
      "風神の祭壇",
      "空の境界",
      "嵐の中心",
    ],
    /* L9 */ [
      "大地の間",
      "岩石の殿堂",
      "鉱山の奥",
      "土の神殿",
      "山脈の間",
      "大地の怒り",
      "岩の迷宮",
      "鉱物の宝庫",
      "地底の王国",
      "土の精霊",
    ],
    /* L10 */ [
      "時の回廊",
      "過去の間",
      "未来の部屋",
      "時の狭間",
      "永遠の間",
      "時の番人",
      "歴史の書庫",
      "運命の輪",
      "時の迷宮",
      "永劫の間",
    ],
    /* L11 */ [
      "光の間",
      "輝きの殿堂",
      "太陽の部屋",
      "月の祭壇",
      "星の間",
      "光の精霊",
      "輝く迷宮",
      "光の宝庫",
      "星々の庭",
      "月の満ち欠け",
    ],
    /* L12 */ [
      "闇の深淵",
      "影の間",
      "黒き神殿",
      "夜の迷宮",
      "暗黒の宝庫",
      "影の精霊",
      "黒き回廊",
      "夜の番人",
      "闇の王座",
      "影の王国",
    ],
    /* L13 */ [
      "混沌の間",
      "無秩序の部屋",
      "混沌の神殿",
      "混沌の宝庫",
      "混沌の精霊",
      "混沌の迷宮",
      "混沌の王座",
      "混沌の王国",
      "混沌の回廊",
      "混沌の中心",
    ],
    /* L14 */ [
      "秩序の間",
      "調和の部屋",
      "秩序の神殿",
      "秩序の宝庫",
      "秩序の精霊",
      "秩序の迷宮",
      "秩序の王座",
      "秩序の王国",
      "秩序の回廊",
      "秩序の中心",
    ],
    /* L15 */ [
      "生命の間",
      "成長の部屋",
      "生命の神殿",
      "生命の宝庫",
      "生命の精霊",
      "生命の迷宮",
      "生命の王座",
      "生命の王国",
      "生命の回廊",
      "生命の中心",
    ],
    /* L16 */ [
      "死の間",
      "終焉の部屋",
      "死の神殿",
      "死の宝庫",
      "死の精霊",
      "死の迷宮",
      "死の王座",
      "死の王国",
      "死の回廊",
      "死の中心",
    ],
    /* L17 */ [
      "創造の間",
      "芸術の部屋",
      "創造の神殿",
      "創造の宝庫",
      "創造の精霊",
      "創造の迷宮",
      "創造の王座",
      "創造の王国",
      "創造の回廊",
      "創造の中心",
    ],
    /* L18 */ [
      "破壊の間",
      "崩壊の部屋",
      "破壊の神殿",
      "破壊の宝庫",
      "破壊の精霊",
      "破壊の迷宮",
      "破壊の王座",
      "破壊の王国",
      "破壊の回廊",
      "破壊の中心",
    ],
    /* L19 */ [
      "賢者の間",
      "知識の部屋",
      "賢者の神殿",
      "賢者の宝庫",
      "賢者の精霊",
      "賢者の迷宮",
      "賢者の王座",
      "賢者の王国",
      "賢者の回廊",
      "賢者の中心",
    ],
    /* L20 */ [
      "神々の間",
      "天界の部屋",
      "神々の神殿",
      "神々の宝庫",
      "神々の精霊",
      "神々の迷宮",
      "神々の王座",
      "神々の王国",
      "神々の回廊",
      "神々の中心",
    ],
  ];
  // English-name pools paired with the Japanese pools above (same order). [REF#DG-00813]
  // Levels 1-7 (game's main loop) are hand-translated; 8-20 are themed
  // by level concept + room-type suffix, generated on demand.
  const ROOM_POOLS_EN = [
    /* L1 */ ["Workers' Longhouse","Labourers' Mess","Bunk Room","Workshop","Tool Room","Earthen Floor","Guard Post","Storehouse","Bath House","Stable"],   // index-aligned with ROOM_POOLS L1 above (Mark 2026-07-28)
    /* L2 */ ["Underground Corridor","Stone Cell","Water Torture Room","Torture Chamber","Hidden Room","Sentry Post","Weapon Cache","Granary","Powder Magazine","Tunnel"],
    /* L3 */ ["Cursed Hall","Bone Room","Rotten Corridor","Old Battlefield","Blood Altar","Dark Garden","House of the Dead","Dark Vault","Underworld Gate","Vengeful Spirits Hall"],
    /* L4 */ ["Flame Hall","Lava Corridor","Oni Cave","Karmic Fire Room","Red Oni Chamber","Enma's Garden","Hell Valley","Burning Hell","Pillar of Fire","Scorching Hall"],
    /* L5 */ ["Ice Corridor","Yuki-Onna's Hall","Blizzard Cave","Frost Vault","Ice Prison","Snow Altar","Frozen Hall","Icicle Passage","Silver Hall","Misty Hall"],
    /* L6 */ ["Thunder Hall","Lightning Corridor","Storm Cave","Heavenly Lightning Room","Roaring Thunder Hall","Dragon God's Garden","Lightning Strike","Gale Hall","Tempest Vault","Raijin's Altar"],
    /* L7 */ ["Oni-Baba's Sanctum","Gate of Hades","Black Dragon Hall","Karma Chamber","Six-Paths Crossroad","Garden of Vengeance","Oni Throne","Depths of Yomi","Higan Chamber","Soul Altar"],
  ];
  const LATE_THEMES_EN = {
    8:"Wind", 9:"Earth", 10:"Time", 11:"Light", 12:"Shadow",
    13:"Chaos", 14:"Order", 15:"Life", 16:"Death",
    17:"Creation", 18:"Destruction", 19:"Wisdom", 20:"Divine",
  };
  const LATE_SUFFIXES_EN = ["Hall","Chamber","Sanctum","Vault","Spirits","Labyrinth","Throne","Kingdom","Corridor","Heart"];

  const namePool   = [...(ROOM_POOLS[level - 1]    || ROOM_POOLS[0])];
  const namePoolEn = level <= 7
    ? [...(ROOM_POOLS_EN[level - 1] || ROOM_POOLS_EN[0])]
    : null; // L8-20 generate on demand [REF#DG-00821]

  const getNextName = () => {
    let ja = "謎の間", en = "Mystery Chamber";
    if (namePool.length) {
      const i = Math.floor(_rand() * namePool.length);
      ja = namePool.splice(i, 1)[0];
    }
    if (namePoolEn && namePoolEn.length) {
      // Paired pop: pick the corresponding English by name-pool position rather [REF#DG-00822]
      // than random index — namePool was already spliced so we just pop one.
      en = namePoolEn.splice(Math.floor(_rand() * namePoolEn.length), 1)[0];
    } else if (!namePoolEn) {
      const theme = LATE_THEMES_EN[level] || "Mystery";
      const suffix = LATE_SUFFIXES_EN[Math.floor(_rand() * LATE_SUFFIXES_EN.length)];
      en = `${theme} ${suffix}`;
    }
    return { ja, en };
  };

  // ── Scatter rooms ──────────────────────────────────────────────────────── [REF#DG-00823]
  // id 0 is reserved for the entrance hallway (carved below). Content rooms
  // start at id=1 so the player sees "Room 1 — Entrance Hallway" first.
  let id = 1;
  let attempts = 0;

  // ── Locked Room 1 (level 1 only) ───────────────────────────────────────── [REF#DG-00824]
  // Permanent fixture: fixed-size, fixed-position room at the south-center
  // of the map so the hallway (id 0) always docks the same way. Carved
  // BEFORE the random scatter so other rooms must work around it.
  if (level === 1) {
    const LOCK_W = 6, LOCK_H = 6;   // Mark 2026-06-14: the CABARET — a 6×6 small-stage + sake-bar + slot room. [REF#DG-00825]
    const lockX = Math.floor(MAP_W / 2 - LOCK_W / 2);   // center-X [REF#DG-00826]
    const lockZ = MAP_H - BORDER - 1 - LOCK_H - 8;       // leaves room for the south entrance hallway [REF#DG-00827]
    carveRoom(id++, lockX, lockZ, LOCK_W, LOCK_H, {
      roomName: "1階の間",
      roomNameEn: "Room 1 — Entrance Foyer",
      roomType: "foyer",
      isLockedStartRoom: true,
      isCabaret: true,   // tag the cabaret / casino-intro room (additive; succubus + stage build into roomId 1) [REF#DG-00828]
    });
  }

  // Level 7: place large OniBaba sanctum in central throne room [REF#DG-00829]
  if (level === 7) {
    const ox = Math.floor(MAP_W / 2) - Math.floor(ONIBABA_ROOM_SIZE / 2);
    const oz = Math.floor(MAP_H / 2) - Math.floor(ONIBABA_ROOM_SIZE / 2);
    if (!overlaps(ox, oz, ONIBABA_ROOM_SIZE, ONIBABA_ROOM_SIZE, 1)) {
      carveRoom(id++, ox, oz, ONIBABA_ROOM_SIZE, ONIBABA_ROOM_SIZE, {
        roomName: "鬼の玉座",
        roomNameEn: "Oni Throne",
        roomType: "throne",
        isOniBaba: true,
      });
    }
  }

  // T0.18 — Compact growth: 75% of placements try to land adjacent to an [REF#DG-00830]
  // existing room (1-tile gap = shared wall to punch). Falls back to random
  // scatter when no adjacent slot fits. Result: tight clusters of rooms,
  // most connections become simple openings rather than corridors.
  const tryAdjacentPlacement = () => {
    if (rooms.length === 0) return null;
    const anchor = rooms[Math.floor(_rand() * rooms.length)];
    const w = MIN_R + Math.floor(_rand() * (MAX_R - MIN_R + 1));
    const h = MIN_R + Math.floor(_rand() * (MAX_R - MIN_R + 1));
    const side = Math.floor(_rand() * 4); // 0=N, 1=S, 2=E, 3=W [REF#DG-00831]
    let x0, z0;
    if (side === 0) {
      // North of anchor [REF#DG-00832]
      x0 = anchor.x + Math.floor((anchor.w - w) * _rand());
      z0 = anchor.y - h - ROOM_BUFFER;
    } else if (side === 1) {
      // South of anchor [REF#DG-00833]
      x0 = anchor.x + Math.floor((anchor.w - w) * _rand());
      z0 = anchor.y + anchor.h + ROOM_BUFFER;
    } else if (side === 2) {
      // East of anchor [REF#DG-00834]
      x0 = anchor.x + anchor.w + ROOM_BUFFER;
      z0 = anchor.y + Math.floor((anchor.h - h) * _rand());
    } else {
      // West of anchor [REF#DG-00835]
      x0 = anchor.x - w - ROOM_BUFFER;
      z0 = anchor.y + Math.floor((anchor.h - h) * _rand());
    }
    if (overlaps(x0, z0, w, h)) return null;
    return { x0, z0, w, h };
  };

  // ── Dense BFS-cluster placement ───────────────────────────────────────── [REF#DG-00836]
  // Place a seed room near the centre, then keep attaching new rooms flush
  // against any side of any existing room. Tries all four sides per anchor
  // before giving up. Result: a polygonal cluster with rooms packed close
  // together on every side — the opposite of a single linear chain.
  //
  // Level 1 seeds slightly south of centre so the entrance hallway has room
  // to attach at the south edge. Levels 2-7 seed at dead centre.
  const tryAttachFlush = (anchor, side) => {
    const w = MIN_R + Math.floor(_rand() * (MAX_R - MIN_R + 1));
    const h = MIN_R + Math.floor(_rand() * (MAX_R - MIN_R + 1));
    let x0, z0;
    if (side === 'N') {
      // North of anchor — slide along anchor's east-west extent [REF#DG-00837]
      const slide = Math.floor(_rand() * Math.max(1, anchor.w + w - 2)) - (w - 1);
      x0 = anchor.x + slide;
      z0 = anchor.y - h - ROOM_BUFFER;
    } else if (side === 'S') {
      const slide = Math.floor(_rand() * Math.max(1, anchor.w + w - 2)) - (w - 1);
      x0 = anchor.x + slide;
      z0 = anchor.y + anchor.h + ROOM_BUFFER;
    } else if (side === 'E') {
      const slide = Math.floor(_rand() * Math.max(1, anchor.h + h - 2)) - (h - 1);
      x0 = anchor.x + anchor.w + ROOM_BUFFER;
      z0 = anchor.y + slide;
    } else { // 'W' [REF#DG-00838]
      const slide = Math.floor(_rand() * Math.max(1, anchor.h + h - 2)) - (h - 1);
      x0 = anchor.x - w - ROOM_BUFFER;
      z0 = anchor.y + slide;
    }
    if (overlaps(x0, z0, w, h)) return null;
    return { x0, z0, w, h };
  };

  const SHUFFLED_SIDES = () => {
    const s = ['N','S','E','W'];
    for (let i = s.length - 1; i > 0; i--) {
      const k = Math.floor(_rand() * (i + 1));
      [s[i], s[k]] = [s[k], s[i]];
    }
    return s;
  };

  while (rooms.length < targetRooms && attempts < 4000) {
    attempts++;
    let placement = null;

    if (rooms.length === 0) {
      // Cluster seed for non-throne levels. (L7 already has the throne in [REF#DG-00839]
      // rooms[0]; the BFS branch below attaches new rooms onto its sides.)
      const w = MIN_R + Math.floor(_rand() * (MAX_R - MIN_R + 1));
      const h = MIN_R + Math.floor(_rand() * (MAX_R - MIN_R + 1));
      // Seed slightly south of centre on L1 so the entrance hall can attach [REF#DG-00840]
      // at the south edge later. Other levels seed at dead centre.
      const seedZBias = level === 1 ? 8 : 0;
      const x0 = Math.floor((MAP_W - w) / 2);
      const z0 = Math.floor((MAP_H - h) / 2) + seedZBias;
      if (!overlaps(x0, z0, w, h)) placement = { x0, z0, w, h };
    } else {
      // Pick a random existing room as the anchor and try to attach on any [REF#DG-00841]
      // free side. Try up to 12 anchor-side combinations before giving up
      // this tick.
      for (let t = 0; t < 12 && !placement; t++) {
        const anchor = rooms[Math.floor(_rand() * rooms.length)];
        for (const side of SHUFFLED_SIDES()) {
          placement = tryAttachFlush(anchor, side);
          if (placement) break;
        }
      }
    }

    if (placement) {
      const rName = getNextName();
      const _id = id++;
      carveRoom(_id, placement.x0, placement.z0, placement.w, placement.h, {
        roomName: rName.ja,
        roomNameEn: rName.en,
        roomType: "room",
      });
    }
  }

  // ── Connect rooms: Japanese castle style ──────────────────────────────── [REF#DG-00842]
  // True adjacency check — a wall tile touches both rooms (shoji panel position).
  const areAdjacent = (ra, rb) => {
    const xMin = Math.max(0, Math.min(ra.x, rb.x) - 1);
    const xMax = Math.min(MAP_W - 1, Math.max(ra.x + ra.w, rb.x + rb.w));
    const zMin = Math.max(0, Math.min(ra.y, rb.y) - 1);
    const zMax = Math.min(MAP_H - 1, Math.max(ra.y + ra.h, rb.y + rb.h));
    for (let x = xMin; x <= xMax; x++) {
      for (let z = zMin; z <= zMax; z++) {
        if (map[x]?.[z]?.type !== "wall") continue;
        let touchA = false, touchB = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const c = map[x+dx]?.[z+dz];
          if (c?.roomId === ra.id) touchA = true;
          if (c?.roomId === rb.id) touchB = true;
        }
        if (touchA && touchB) return true;
      }
    }
    return false;
  };

  // Pass 1: open every adjacent room-pair with a shoji panel. Because all [REF#DG-00843]
  // rooms were placed adjacent above, this connects the entire cluster.
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (areAdjacent(rooms[i], rooms[j])) createDoorway(rooms[i], rooms[j]);
    }
  }

  // Pass 2: guarantee every room has shoji exits on ≥2 distinct cardinal [REF#DG-00844]
  // walls (N/S/E/W) — never funnel the player into a single-corridor room.
  // Two doors on the same wall don't count; we want REAL alternative routes.
  const getRoomDoorSides = (r) => {
    const sides = new Set(); // 'N' (z<r.y), 'S' (z>=r.y+r.h), 'E' (x>=r.x+r.w), 'W' (x<r.x) [REF#DG-00845]
    const xMin = Math.max(0, r.x - 1), xMax = Math.min(MAP_W - 1, r.x + r.w);
    const zMin = Math.max(0, r.y - 1), zMax = Math.min(MAP_H - 1, r.y + r.h);
    for (let x = xMin; x <= xMax; x++) {
      for (let z = zMin; z <= zMax; z++) {
        if (map[x]?.[z]?.type !== "shoji_door") continue;
        // Confirm the door tile actually borders this room [REF#DG-00846]
        let touches = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          if (map[x+dx]?.[z+dz]?.roomId === r.id) { touches = true; break; }
        }
        if (!touches) continue;
        if (z < r.y) sides.add('N');
        else if (z >= r.y + r.h) sides.add('S');
        else if (x < r.x) sides.add('W');
        else if (x >= r.x + r.w) sides.add('E');
      }
    }
    return sides;
  };

  // Find an adjacent peer that shares a wall on a side the room doesn't [REF#DG-00847]
  // already have a door on. Returns the peer or null.
  const peerOnNewSide = (r, neededSides) => {
    const peers = rooms.filter((o) => o !== r && areAdjacent(r, o));
    for (let i = peers.length - 1; i > 0; i--) {
      const k = Math.floor(_rand() * (i + 1));
      [peers[i], peers[k]] = [peers[k], peers[i]];
    }
    for (const peer of peers) {
      // Quick side guess: which compass direction is the peer's centre relative to r? [REF#DG-00848]
      const dx = peer.cx - r.cx, dz = peer.cz - r.cz;
      const side = Math.abs(dx) > Math.abs(dz)
        ? (dx > 0 ? 'E' : 'W')
        : (dz > 0 ? 'S' : 'N');
      if (neededSides.has(side)) return peer;
    }
    return null;
  };

  for (const r of rooms) {
    let guard = 0;
    while (guard++ < 8) {
      const sides = getRoomDoorSides(r);
      if (sides.size >= 2) break;
      // Build a "missing" side set in priority order (N,S,E,W minus what we have) [REF#DG-00849]
      const needed = new Set(['N','S','E','W'].filter((s) => !sides.has(s)));
      const peer = peerOnNewSide(r, needed);
      if (!peer) break; // no adjacent room on the needed sides [REF#DG-00850]
      if (!createDoorway(r, peer)) break;
    }
  }

  // Pass 3: weak perimeter rooms (still <2 door sides) get a small alcove [REF#DG-00851]
  // grown against a missing side, then doorway-connected. Caps total rooms
  // at 24 so we don't blow past the spec ceiling.
  const ROOM_HARD_CAP = 26;
  const ALCOVE_MIN = 3, ALCOVE_MAX = 6;
  const tryAttachAlcove = (anchor, side) => {
    const w = ALCOVE_MIN + Math.floor(_rand() * (ALCOVE_MAX - ALCOVE_MIN + 1));
    const h = ALCOVE_MIN + Math.floor(_rand() * (ALCOVE_MAX - ALCOVE_MIN + 1));
    let x0, z0;
    if (side === 'N')      { x0 = anchor.x + Math.floor((anchor.w - w) / 2); z0 = anchor.y - h - ROOM_BUFFER; }
    else if (side === 'S') { x0 = anchor.x + Math.floor((anchor.w - w) / 2); z0 = anchor.y + anchor.h + ROOM_BUFFER; }
    else if (side === 'E') { x0 = anchor.x + anchor.w + ROOM_BUFFER; z0 = anchor.y + Math.floor((anchor.h - h) / 2); }
    else                   { x0 = anchor.x - w - ROOM_BUFFER;        z0 = anchor.y + Math.floor((anchor.h - h) / 2); }
    if (overlaps(x0, z0, w, h)) return null;
    return { x0, z0, w, h };
  };
  for (const r of [...rooms]) { // snapshot — we may push into rooms [REF#DG-00852]
    if (rooms.length >= ROOM_HARD_CAP) break;
    if (r.isOniBaba || r.isEntranceHall) continue;
    let sides = getRoomDoorSides(r);
    if (sides.size >= 2) continue;
    for (const side of ['N','S','E','W']) {
      if (sides.has(side)) continue;
      const place = tryAttachAlcove(r, side);
      if (!place) continue;
      const rName = getNextName();
      const _id = id++;
      carveRoom(_id, place.x0, place.z0, place.w, place.h, {
        roomName: rName.ja,
        roomNameEn: rName.en,
        // ⚠ "hallway", NOT "alcove" — Mark 2026-08-27: "alcoves = they are not rooms, they are open [REF#DG-00853]
        //   hallways fix that." Said in direct reply to being told these are 3x3-6x6 and habitable;
        //   he corrected that framing rather than accepting it. CONSEQUENCE, stated so it is not a
        //   surprise: Engine9's `_ordinary` (~:5788) skips `roomType==='hallway'`, so these no longer
        //   take beds or pots on floors 2+.
        roomType: "hallway",
      });
      const newRoom = rooms[rooms.length - 1];
      if (createDoorway(r, newRoom)) {
        sides = getRoomDoorSides(r);
        if (sides.size >= 2) break;
      }
    }
  }

  // ── Room #1 = Foyer (canonical name) ───────────────────────────────────── [REF#DG-00854]
  // Room id=1 is the first BFS-seeded room — the player's first "real" room
  // after the entrance hall. Name it Foyer so it's a stable landmark.
  {
    const foyer = rooms.find((r) => r.id === 1);
    if (foyer) {
      foyer.roomName   = "玄関の間";
      foyer.roomNameEn = "Foyer";
    }
  }

  // ── STORE room (NetHack-style) — connected to Foyer by a real corridor ─── [REF#DG-00855]
  // Carved off room id=1. The corridor is 1-tile wide so the shopkeeper has a
  // clear chokepoint to guard. Loot card spawn positions are recorded in
  // `storeLootSpecs` for the engine to instantiate. Only one store per
  // dungeon, and only on levels with a foyer (skip L7 — throne floor).
  const storeLootSpecs = [];
  let storeShopkeeperSpec = null;
  let storeRoom = null;
  if (level !== 7) {
    const foyer = rooms.find((r) => r.id === 1);
    if (foyer) {
      const STORE_W = 7, STORE_H = 6;
      const CORRIDOR_LEN = 3;
      // Try each cardinal side of the foyer — pick the first that has clearance [REF#DG-00856]
      const sides = ['N','S','E','W'];
      for (let i = sides.length - 1; i > 0; i--) {
        const k = Math.floor(_rand() * (i + 1));
        [sides[i], sides[k]] = [sides[k], sides[i]];
      }
      for (const side of sides) {
        let sx, sz;          // store top-left [REF#DG-00857]
        let cx0, cz0, cx1, cz1; // corridor span [REF#DG-00858]
        let storeDoorX, storeDoorZ, foyerDoorX, foyerDoorZ;
        if (side === 'N') {
          sx = foyer.x + Math.floor((foyer.w - STORE_W)/2);
          sz = foyer.y - CORRIDOR_LEN - STORE_H - 1;
          foyerDoorX = foyer.x + Math.floor(foyer.w/2);
          foyerDoorZ = foyer.y - 1;
          storeDoorX = foyerDoorX;
          storeDoorZ = sz + STORE_H;
          cx0 = foyerDoorX; cx1 = foyerDoorX;
          cz0 = sz + STORE_H; cz1 = foyer.y - 1;
        } else if (side === 'S') {
          sx = foyer.x + Math.floor((foyer.w - STORE_W)/2);
          sz = foyer.y + foyer.h + CORRIDOR_LEN + 1;
          foyerDoorX = foyer.x + Math.floor(foyer.w/2);
          foyerDoorZ = foyer.y + foyer.h;
          storeDoorX = foyerDoorX;
          storeDoorZ = sz - 1;
          cx0 = foyerDoorX; cx1 = foyerDoorX;
          cz0 = foyer.y + foyer.h; cz1 = sz - 1;
        } else if (side === 'E') {
          sx = foyer.x + foyer.w + CORRIDOR_LEN + 1;
          sz = foyer.y + Math.floor((foyer.h - STORE_H)/2);
          foyerDoorX = foyer.x + foyer.w;
          foyerDoorZ = foyer.y + Math.floor(foyer.h/2);
          storeDoorX = sx - 1;
          storeDoorZ = foyerDoorZ;
          cz0 = foyerDoorZ; cz1 = foyerDoorZ;
          cx0 = foyer.x + foyer.w; cx1 = sx - 1;
        } else { // W [REF#DG-00859]
          sx = foyer.x - CORRIDOR_LEN - STORE_W - 1;
          sz = foyer.y + Math.floor((foyer.h - STORE_H)/2);
          foyerDoorX = foyer.x - 1;
          foyerDoorZ = foyer.y + Math.floor(foyer.h/2);
          storeDoorX = sx + STORE_W;
          storeDoorZ = foyerDoorZ;
          cz0 = foyerDoorZ; cz1 = foyerDoorZ;
          cx0 = sx + STORE_W; cx1 = foyer.x - 1;
        }
        if (overlaps(sx, sz, STORE_W, STORE_H)) continue;
        // Carve store room [REF#DG-00860]
        const storeId = id++;
        carveRoom(storeId, sx, sz, STORE_W, STORE_H, {
          roomName: "店",
          roomNameEn: "Store",
          roomType: "store",
          isStore: true,
        });
        storeRoom = rooms[rooms.length - 1];
        // Carve corridor [REF#DG-00861]
        for (let cx = Math.min(cx0, cx1); cx <= Math.max(cx0, cx1); cx++) {
          for (let cz = Math.min(cz0, cz1); cz <= Math.max(cz0, cz1); cz++) {
            if (map[cx]?.[cz]?.type === 'wall') {
              map[cx][cz] = { type: 'floor', hall: true, roomId: storeId, storeCorridor: true };
            }
          }
        }
        // Punch shoji door into the foyer at the corridor's foyer-side end [REF#DG-00862]
        if (map[foyerDoorX]?.[foyerDoorZ]) {
          map[foyerDoorX][foyerDoorZ] = {
            type: 'shoji_door', roomId: 1, panelless: true, storeBoundary: 'foyer'
          };
        }
        // Punch a marked store-entrance shoji at the store side [REF#DG-00863]
        if (map[storeDoorX]?.[storeDoorZ]) {
          map[storeDoorX][storeDoorZ] = {
            type: 'shoji_door', roomId: storeId, panelless: false, storeBoundary: 'store',
            storeId,
          };
        }
        // Loot spec — 6 items in 2 rows along the inside of the store [REF#DG-00864]
        const SHOP_ITEMS = [
          { catId:'COMBAT', title:'KATANA',       desc:'Sharper edge.',     kanji:'刀', attr:'(DMG*1DICE)', price:120 },
          { catId:'SPELL',  title:'FIREBALL',     desc:'Burns deep.',       kanji:'火', attr:'(DMG*4DICE)', price:200 },
          { catId:'SPELL',  title:'BOULDER',      desc:'Heavy impact.',     kanji:'地', attr:'(STUN*4DICE)', price:200 },
          { catId:'MISSILE',title:'LONG BOW',     desc:'Pierces armour.',   kanji:'弓', attr:'(DMG*1DICE)', price:150 },
          { catId:'ITEM',   title:'POTION',       desc:'Restores 30 HP.',   kanji:'薬', attr:'+30 HP',     price:80  },
          { catId:'ITEM',   title:'MAGIC LANTERN',desc:'Lights the dark.',  kanji:'灯', attr:'EQUIP',      price:90  },
        ];
        // Place in 2 rows of 3, inset 1 tile from store walls [REF#DG-00865]
        for (let i = 0; i < SHOP_ITEMS.length; i++) {
          const col = i % 3, row = Math.floor(i / 3);
          const lx = sx + 1 + Math.floor(col * (STORE_W - 2) / 2);
          const lz = sz + 1 + row * 2;
          storeLootSpecs.push({ x: lx, z: lz, ...SHOP_ITEMS[i] });
        }
        // Shopkeeper sits dead-centre, blocking the store's interior side of the door [REF#DG-00866]
        const skX = sx + Math.floor(STORE_W/2);
        const skZ = sz + Math.floor(STORE_H/2);
        storeShopkeeperSpec = {
          x: skX, z: skZ,
          storeRoomId: storeId,
          storeDoorX, storeDoorZ,
          foyerDoorX, foyerDoorZ,
        };
        break;
      }
    }
  }

  // ── Entrance + stairs ──────────────────────────────────────────────────── [REF#DG-00867]
  // Level 1: outdoor entrance hallway south of the southernmost room. Player
  //   spawns at its south tip (stairs_up = doorway back outside). Stairs down
  //   in the farthest (northernmost) non-throne room.
  // Levels 2-6: no entrance hall — stairs_up sits in the southernmost room
  //   (the player arrived from the previous level), stairs_down in the room
  //   farthest from spawn.
  // Level 7: stairs_up in the southernmost room (arrived from L6); throne
  //   room is the destination, NO stairs_down.
  let spawnX, spawnZ;

  // The "spawn room" is the locked Room 1 if it exists (level 1), otherwise [REF#DG-00868]
  // the southernmost non-throne room. Locking guarantees the entrance always
  // looks the same on level 1 — same Foyer layout, same decor placement.
  const lockedStart = rooms.find((r) => r.isLockedStartRoom);
  const spawnRoom = lockedStart
    || rooms
        .filter((r) => !r.isOniBaba)
        .reduce((best, r) => (r.cz > best.cz ? r : best), rooms[0]);

  if (level === 1) {
    // Room 1 is the locked start room (carved up top with id=1) so no swap [REF#DG-00869]
    // needed here. Just dock the 7-tile entrance hallway against its south
    // edge as ROOM 0 ENTRANCE.
    const HALL_LEN = 7; // Mark 2026-06-14: 7-tile entrance hallway (vending at the far end, stairs_up = the ROOM 0 exit door) [REF#DG-00870]
    const hallX = spawnRoom.cx;
    const roomSouthEdge = spawnRoom.y + spawnRoom.h;
    const hallStart = roomSouthEdge + 1;
    const stairsUpZ = Math.min(MAP_H - 3, hallStart + HALL_LEN - 1);
    const actualHallLen = stairsUpZ - hallStart + 1;
    for (let cz = hallStart; cz <= stairsUpZ; cz++) {
      if (map[hallX]?.[cz])
        map[hallX][cz] = { type: "floor", hall: true, roomId: 0 };
      if (map[hallX + 1]?.[cz])
        map[hallX + 1][cz] = { type: "floor", hall: true, roomId: 0 };
    }
    rooms.unshift({
      id: 0,
      x: hallX, y: roomSouthEdge, w: 2, h: actualHallLen + 1,
      cx: hallX, cz: roomSouthEdge + Math.floor((actualHallLen + 1) / 2),
      center: { x: hallX, y: roomSouthEdge + Math.floor((actualHallLen + 1) / 2) },
      roomName: "0号廊下",
      roomNameEn: "Room 0 Entrance",
      roomType: "hallway",
      isEntranceHall: true,
    });
    // Explicit shoji door pair [REF#DG-00871]
    map[hallX][roomSouthEdge] = { type: "shoji_door", roomId: 0, panelless: true };
    map[hallX + 1][roomSouthEdge] = { type: "shoji_door", roomId: 0, panelless: true };

    if (map[hallX]?.[stairsUpZ])
      map[hallX][stairsUpZ] = { type: "stairs_up", roomId: 0 };
    if (map[hallX + 1]?.[stairsUpZ])
      map[hallX + 1][stairsUpZ] = { type: "stairs_up_r", roomId: 0 };
    spawnX = hallX;
    spawnZ = stairsUpZ - 1;
  } else {
    // Levels 2-7: stairs_up sits inside the spawnRoom (no corridor). Place [REF#DG-00872]
    // it one tile inside the south wall, with the +x tile marked stairs_up_r
    // so the renderer draws a single double-door spanning both tiles.
    const ux = spawnRoom.cx;
    const uz = Math.min(spawnRoom.y + spawnRoom.h - 2, MAP_H - 3);
    if (map[ux]?.[uz])     map[ux][uz]     = { type: "stairs_up",   roomId: spawnRoom.id };
    if (map[ux + 1]?.[uz]) map[ux + 1][uz] = { type: "stairs_up_r", roomId: spawnRoom.id };
    spawnX = ux;
    spawnZ = uz - 1; // one tile north of the up-stairs, facing into the room [REF#DG-00873]
  }

  // Stairs down — every level except 7 has them. Place in the room farthest [REF#DG-00874]
  // (Manhattan) from the spawn room so descent feels like a real journey,
  // never adjacent to the up-stairs. Skips throne room.
  let stairsDownRoom = null;
  if (level !== 7) {
    let farthest = null, bestDist = -1;
    for (const r of rooms) {
      if (r.isOniBaba || r.isEntranceHall || r === spawnRoom) continue;
      const d = Math.abs(r.cx - spawnRoom.cx) + Math.abs(r.cz - spawnRoom.cz);
      if (d > bestDist) { bestDist = d; farthest = r; }
    }
    if (!farthest) farthest = spawnRoom; // single-room degenerate fallback [REF#DG-00875]
    map[farthest.cx][farthest.cz] = {
      type: "stairs_down",
      roomId: farthest.id,
    };
    stairsDownRoom = farthest;
    // Mark 2026-06-14: the down-stairs room is a SMALL CASINO that protects the descent [REF#DG-00876]
    // (player must pass it + the level supervisor to go down). Engine reads these tags
    // to dress the room with casino props (slots). No beeline-to-stairs.
    farthest.roomType = "casino";
    farthest.isCasino = true;
    farthest.casinoLevel = level;
  }

  // ── Monster spawns: 1–3 per room ───────────────────────────────────────── [REF#DG-00877]
  const mobSpawns = [];
  let mobIdCtr = 0;
  // Extended HP scaling for 20 levels [REF#DG-00878]
  const hpByLevel = [
    50, 55, 61, 67, 74, 81, 89, 98, 108, 119, 131, 144, 158, 174, 191, 210,
    231, 254, 280, 308,
  ];
  const monsterHp = hpByLevel[Math.min(level - 1, 19)];

  // ── Monster archetypes with element vulnerabilities ────────────────────── [REF#DG-00879]
  // Spells deal baseDmg × vulnerability[element]. >1 = weak to, <1 = resists.
  // Every regular mob is the goblin GLB. `nameKey` is the i18n id that
  // resolves to a localized display name (Yakuza Goblin / ヤクザゴブリン).
  // Vulnerability profiles still vary per archetype so gameplay diversity
  // is intact.
  const MONSTER_ARCHETYPES = [
    { nameKey: "yakuza_goblin", vuln: { FIRE:1.3, WATER:1.0, EARTH:0.8, WIND:1.0, VOID:1.2, DEFAULT:1.0 } },
    { nameKey: "yakuza_goblin", vuln: { FIRE:1.0, WATER:1.4, EARTH:0.5, WIND:0.7, VOID:1.0, DEFAULT:1.0 } },
    { nameKey: "yakuza_goblin", vuln: { FIRE:1.8, WATER:0.4, EARTH:1.0, WIND:1.2, VOID:1.1, DEFAULT:1.0 } },
    { nameKey: "yakuza_goblin", vuln: { FIRE:1.0, WATER:1.5, EARTH:1.4, WIND:0.5, VOID:1.0, DEFAULT:1.0 } },
    { nameKey: "yakuza_goblin", vuln: { FIRE:1.4, WATER:1.0, EARTH:1.0, WIND:1.0, VOID:0.4, DEFAULT:1.0 } },
    { nameKey: "yakuza_goblin", vuln: { FIRE:0.5, WATER:1.6, EARTH:1.0, WIND:1.3, VOID:1.1, DEFAULT:1.0 } },
  ];
  const pickArchetype = () =>
    MONSTER_ARCHETYPES[Math.floor(_rand() * MONSTER_ARCHETYPES.length)];

  const rollLootCard = () => {
    const r = _rand();
    if(r < 0.55) return { catId:'MISSILE', title:'SHURIKEN',  desc:'Throwing star', kanji:'投', attr:'(DMG*1DICE)' };
    if(r < 0.68) return { catId:'MISSILE', title:'DAGGER',    desc:'Quick blade',   kanji:'刃', attr:'(DMG*1DICE)' };
    if(r < 0.78) return { catId:'MISSILE', title:'SHORT BOW', desc:'Light bow',     kanji:'弓', attr:'(DMG*2DICE)' };
    if(r < 0.84) return { catId:'MISSILE', title:'LONG BOW',  desc:'Heavy bow',     kanji:'長弓', attr:'(DMG*3DICE)' };
    // COMPOSITE BOW — the longest-range lootable bow (Mark 2026-09-21: "there are small bows, long [REF#DG-02202]
    // bows too + composite bows wwhich shoot longer range"). Rare slice, same rarity band as BOULDER.
    if(r < 0.87) return { catId:'MISSILE', title:'COMPOSITE BOW', desc:'Longest range', kanji:'複', attr:'(DMG*3DICE)' };
    if(r < 0.90) return { catId:'EARTH',   title:'BOULDER',   desc:'Heavy impact',  kanji:'地', attr:'(STUN*2DICE)' };
    if(r < 0.94) return { catId:'FIRE',    title:'FIREBALL',  desc:'Inferno star',  kanji:'火', attr:'(DMG*4DICE)' };
    if(r < 0.97) return { catId:'WATER',   title:'TIDE',      desc:'Washes away',   kanji:'水', attr:'(SLOW*3DICE)' };
    return                { catId:'WIND',   title:'CYCLONE',   desc:'Seeks & spins', kanji:'旋', attr:'(SPIN*3DICE)' };
  };

  rooms.forEach((r) => {
    if (r.roomType === "hallway") return;
    // OniBaba throne room on L20: no random mobs — boss is spawned separately [REF#DG-00880]
    if (r.isOniBaba) return;
    // Stairs-down room: skip the random spawn pass. The Yakuza Level [REF#DG-00881]
    // Supervisor + his 4 imp henchmen are placed there below.
    if (r === stairsDownRoom) return;
    // Start room: safe zone (exactly 0 monsters / pure safety as per user request) [REF#DG-00882]
    if (r === spawnRoom) return;

    // Spawn distribution per user request: [REF#DG-00883]
    // - 90%: ONLY one monster OR one loot card (50/50 split)
    // - 8%: Exactly two monsters
    // - 1%: Loot only (0 monsters, 1 loot card)
    // - 1%: Exactly three monsters
    const _r = _rand();
    let numMonsters = 0;
    let numLootCards = 0;

    if (_r < 0.90) {
      if (_rand() < 0.5) {
        numMonsters = 1;
      } else {
        numLootCards = 1;
      }
    } else if (_r < 0.98) {
      numMonsters = 2;
    } else if (_r < 0.99) {
      numLootCards = 1;
    } else {
      numMonsters = 3;
    }

    // ── Monster density multiplier (Worker 1, 2026-06-08) ── [REF#DG-00884]
    // Per-room monster-count multiplier, applied at LEVEL GEN (change then
    // regenerate). SHIP DEFAULT = 1 (no change to spawn distribution). Kept as a
    // balance/stress knob: window._monsterDensity = 2 | 3 | 4 … to crowd rooms.
    {
      const _density = (typeof window !== 'undefined' && typeof window._monsterDensity === 'number') ? window._monsterDensity : 1;
      if (_density !== 1 && numMonsters > 0) {
        numMonsters = Math.max(1, Math.round(numMonsters * _density));
      }
    }

    // Build candidate floor cells (not adjacent to walls) [REF#DG-00885]
    const candidates = [];
    for (let cx = r.x + 1; cx < r.x + r.w - 1; cx++) {
      for (let cz = r.y + 1; cz < r.y + r.h - 1; cz++) {
        if (map[cx]?.[cz]?.type !== "floor") continue;
        candidates.push([cx, cz]);
      }
    }
    if (!candidates.length) return;
    const used = new Set();

    // Place Monsters [REF#DG-00886]
    for (let i = 0; i < numMonsters; i++) {
      let pick = null;
      for (let tries = 0; tries < 20 && !pick; tries++) {
        const [tx, tz] =
          candidates[Math.floor(_rand() * candidates.length)];
        const key = `${tx},${tz}`;
        if (!used.has(key)) {
          used.add(key);
          pick = [tx, tz];
        }
      }
      if (!pick) break;
      const arch = pickArchetype();
      mobSpawns.push({
        id: `mob-${r.id}-${mobIdCtr++}`,
        nameKey: arch.nameKey,      // i18n key for localized display [REF#DG-00887]
        name: "Yakuza Goblin",      // fallback for non-i18n consumers [REF#DG-00888]
        type: "monster",
        x: pick[0],
        z: pick[1],
        hp: monsterHp,
        maxHp: monsterHp,
        isHostile: true,
        vulnerability: arch.vuln,
      });
    }

    // Place pure loot cards [REF#DG-00889]
    for (let i = 0; i < numLootCards; i++) {
      let pick = null;
      for (let tries = 0; tries < 20 && !pick; tries++) {
        const [tx, tz] =
          candidates[Math.floor(_rand() * candidates.length)];
        const key = `${tx},${tz}`;
        if (!used.has(key)) {
          used.add(key);
          pick = [tx, tz];
        }
      }
      if (!pick) break;
      const lootInfo = rollLootCard();
      mobSpawns.push({
        id: `loot-card-${r.id}-${mobIdCtr++}`,
        type: "loot_card",
        x: pick[0],
        z: pick[1],
        catId: lootInfo.catId,
        title: lootInfo.title,
        desc: lootInfo.desc,
        kanji: lootInfo.kanji,
        attr: lootInfo.attr
      });
    }
  });

  // ── Foyer (room id=1) hard-coded encounter: 4 Goblins + 2 Imps ────────── [REF#DG-00890]
  // Per user mandate 2026-05-22: "start for game = room 0 hallway 7 tiles
  // long + connected to room 0 with 4 goblins 2 imps". Foyer was previously
  // a safe-zone (excluded from the random spawn pass via `r === spawnRoom`).
  // Now the player walks straight from the entrance hallway into a fight.
  // Only on Level 1 — deeper floors keep their procedural spawn pattern.
  if (level === 1) {
    const foyer = rooms.find((r) => r.id === 1);
    if (foyer) {
      // CABARET greeters (Mark 2026-06-14): exactly 2 Goblins + 1 Imp, neutral, to greet the player. [REF#DG-00891]
      mobSpawns.push({
        id: `foyer-goblin-intro`,
        nameKey: "yakuza_goblin_herald",
        name: "Yakuza Goblin Herald",
        type: "monster",
        x: foyer.cx,
        z: foyer.cz - 1,
        hp: 50,
        maxHp: 50,
        isHostile: false,
        isIntroGoblin: true,
        vulnerability: { FIRE:1.3, WATER:1.0, EARTH:0.8, WIND:1.0, VOID:1.2, DEFAULT:1.0 },
      });

      mobSpawns.push({
        id: `foyer-imp-assistant-1`,
        nameKey: "yakuza_imp_herald",
        name: "Yakuza Imp Assistant",
        type: "monster",
        x: foyer.cx - 1,
        z: foyer.cz,
        hp: 30,
        maxHp: 30,
        isHostile: false,
        isImp: true,
        isAssistantImp: true,
        vulnerability: { FIRE:1.4, WATER:1.0, EARTH:1.0, WIND:1.1, VOID:1.0, DEFAULT:1.0 },
      });

      mobSpawns.push({
        id: `foyer-goblin-greeter-2`,
        nameKey: "yakuza_goblin_herald",
        name: "Yakuza Goblin Greeter",
        type: "monster",
        x: foyer.cx + 1,
        z: foyer.cz,
        hp: 50,
        maxHp: 50,
        isHostile: false,
        vulnerability: { FIRE:1.3, WATER:1.0, EARTH:0.8, WIND:1.0, VOID:1.2, DEFAULT:1.0 },
      });
    }
  }

  // ── Room 0 STARTER CARDS (Mark 2026-06-14): the testing kit on the entrance-hall floor ── [REF#DG-00892]
  // flashlight (MAGIC LANTERN) · magic missile · shuriken · short bow · one random spell ·
  // one melee skill card (reminder to build the melee system). catIds chosen to render
  // (not the blank-cube gotcha): ITEM / MISSILE / element / KATANA. — Floor 1 only.
  if (level === 1) {
    const r0 = rooms.find((r) => r.isEntranceHall);
    if (r0) {
      const _spell = [
        { catId:'FIRE',  title:'FIREBALL', desc:'Inferno star',  kanji:'火', attr:'(DMG*4DICE)' },
        { catId:'WATER', title:'TIDE',     desc:'Washes away',   kanji:'水', attr:'(SLOW*3DICE)' },
        { catId:'EARTH', title:'BOULDER',  desc:'Heavy impact',  kanji:'地', attr:'(STUN*2DICE)' },
        { catId:'WIND',  title:'CYCLONE',  desc:'Seeks & spins', kanji:'旋', attr:'(SPIN*3DICE)' },
      ][Math.floor(_rand() * 4)];
      const STARTER = [
        { catId:'ITEM',    title:'MAGIC LANTERN', desc:'Lights the dark',  kanji:'灯', attr:'(LIGHT)' },     // flashlight [REF#DG-00893]
        { catId:'MISSILE', title:'DAGGER',        desc:'Thrown blade',     kanji:'刃', attr:'(DMG*1DICE)' },
        { catId:'MISSILE', title:'SHURIKEN',      desc:'Throwing star',    kanji:'投', attr:'(DMG*1DICE)' },
        { catId:'MISSILE', title:'SHORT BOW',     desc:'Light bow',        kanji:'弓', attr:'(DMG*2DICE)' },
        _spell,                                                                                                // one random spell (testing) [REF#DG-00894]
        { catId:'KATANA',  title:'KATANA',        desc:'Melee weapon — melee system WIP', kanji:'刀', attr:'(MELEE)' }, // melee reminder [REF#DG-00895]
      ];
      const cells = [];
      for (let x = r0.x; x < r0.x + r0.w; x++)
        for (let z = r0.y; z < r0.y + r0.h; z++)
          if (map[x]?.[z]?.type === 'floor' && map[x][z].roomId === 0) cells.push([x, z]);
      STARTER.forEach((c, i) => {
        const cell = cells[i % cells.length];
        if (!cell) return;
        mobSpawns.push({ id:`room0-starter-${i}`, type:'loot_card', x:cell[0], z:cell[1], catId:c.catId, title:c.title, desc:c.desc, kanji:c.kanji, attr:c.attr });
      });
    }
  }

  // ── Yakuza Level Supervisor + his 4 Imp henchmen ──────────────────────── [REF#DG-00896]
  // The supervisor (1.3× scale, 10× normal-monster HP — Mark 2026-06-14) guards the
  // stairs-down tile so the player must fight through him to descend. The stairs-down
  // room is a SMALL CASINO (tagged isCasino above) — the casino protects the descent.
  // He's surrounded by four imp henchmen on the cardinal tiles around the stairs.
  if (stairsDownRoom) {
    const sx = stairsDownRoom.cx, sz = stairsDownRoom.cz;
    // Try to place the supervisor next to the stairs (not on top of them). [REF#DG-00897]
    const supSpots = [
      [sx,     sz - 1], [sx,     sz + 1],
      [sx - 1, sz    ], [sx + 1, sz    ],
      [sx - 1, sz - 1], [sx + 1, sz - 1],
      [sx - 1, sz + 1], [sx + 1, sz + 1],
    ];
    let supX = sx, supZ = sz;
    for (const [tx, tz] of supSpots) {
      if (map[tx]?.[tz]?.type === "floor") { supX = tx; supZ = tz; break; }
    }
    mobSpawns.push({
      id: `boss-supervisor-L${level}-${mobIdCtr++}`,
      nameKey: "yakuza_supervisor",
      name: "Yakuza Level Supervisor",
      type: "monster",
      x: supX, z: supZ,
      hp: monsterHp * 10, maxHp: monsterHp * 10,   // 10× normal-monster HP (Mark 2026-06-14); scales per level via monsterHp [REF#DG-00898]
      isHostile: true,
      isSupervisor: true,                // engine → 1.3× scale + label [REF#DG-00899]
      vulnerability: { FIRE:1.1, WATER:1.0, EARTH:0.9, WIND:1.0, VOID:1.0, DEFAULT:0.95 },
    });

    // Four imp henchmen on nearby floor tiles. Try cardinal neighbours of [REF#DG-00900]
    // the supervisor first; fall back to any free floor tile in the room.
    const impSpots = [
      [supX - 1, supZ],     [supX + 1, supZ],
      [supX,     supZ - 1], [supX,     supZ + 1],
      [supX - 2, supZ],     [supX + 2, supZ],
      [supX,     supZ - 2], [supX,     supZ + 2],
      [supX - 1, supZ - 1], [supX + 1, supZ - 1],
      [supX - 1, supZ + 1], [supX + 1, supZ + 1],
    ];
    const usedImp = new Set([`${supX},${supZ}`, `${sx},${sz}`]);
    let placedImps = 0;
    for (const [tx, tz] of impSpots) {
      if (placedImps >= 4) break;
      if (tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_H) continue;
      if (map[tx]?.[tz]?.type !== "floor") continue;
      const k = `${tx},${tz}`;
      if (usedImp.has(k)) continue;
      usedImp.add(k);
      mobSpawns.push({
        id: `imp-L${level}-${mobIdCtr++}`,
        nameKey: "yakuza_imp",
        name: "Yakuza Imp",
        type: "monster",
        x: tx, z: tz,
        hp: Math.round(monsterHp * 0.6),
        maxHp: Math.round(monsterHp * 0.6),
        isHostile: true,
        isImp: true,                       // engine → use imp GLB [REF#DG-00901]
        vulnerability: { FIRE:1.4, WATER:1.0, EARTH:1.0, WIND:1.1, VOID:1.0, DEFAULT:1.0 },
      });
      placedImps++;
    }
  }

  // ── 7 flintlock imps scattered across the level ────────────────────────── [REF#DG-00902]
  // Slow-firing ranged ambushers — fire one pistol shot then reload for
  // ~10s. Engine reads hasFlintlock to swap the shuriken AI for the pistol
  // routine. Placed in random floor tiles in non-boss, non-stairs rooms
  // (and not on top of an existing spawn).
  {
    const usedFL = new Set(mobSpawns.map(s => `${s.x},${s.z}`));
    const flCandidates = [];
    rooms.forEach((r) => {
      if (r.roomType === "hallway") return;
      if (r.isOniBaba) return;
      if (r === stairsDownRoom) return;
      for (let cx = r.x + 1; cx < r.x + r.w - 1; cx++) {
        for (let cz = r.y + 1; cz < r.y + r.h - 1; cz++) {
          if (map[cx]?.[cz]?.type !== "floor") continue;
          flCandidates.push([cx, cz]);
        }
      }
    });
    // Shuffle Fisher-Yates for fair distribution [REF#DG-00903]
    for (let i = flCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(_rand() * (i + 1));
      [flCandidates[i], flCandidates[j]] = [flCandidates[j], flCandidates[i]];
    }
    let placedFL = 0;
    for (const [tx, tz] of flCandidates) {
      if (placedFL >= 7) break;
      const k = `${tx},${tz}`;
      if (usedFL.has(k)) continue;
      usedFL.add(k);
      mobSpawns.push({
        id: `flintlock-imp-L${level}-${mobIdCtr++}`,
        nameKey: "yakuza_imp",
        name: "Yakuza Imp",                // model-type name per user spec [REF#DG-00904]
        type: "monster",
        x: tx, z: tz,
        hp: Math.round(monsterHp * 0.5),
        maxHp: Math.round(monsterHp * 0.5),
        isHostile: true,
        isImp: true,                       // reuse imp GLB [REF#DG-00905]
        hasFlintlock: true,                // engine → pistol routine [REF#DG-00906]
        vulnerability: { FIRE:1.3, WATER:1.1, EARTH:1.0, WIND:1.2, VOID:1.0, DEFAULT:1.0 },
      });
      placedFL++;
    }
  }

  // ── Throne boss (level 7 only) ─────────────────────────────────────────── [REF#DG-00907]
  // One large, high-HP monster placed at the centre of the throne room.
  // Engine reads `isBoss` to scale the mesh up + label it. Resists everything
  // a bit (vuln ≤ 1.0 across the board) so the player has to commit.
  if (level === 7) {
    const throne = rooms.find((r) => r.isOniBaba);
    if (throne) {
      mobSpawns.push({
        id: `boss-throne-${mobIdCtr++}`,
        nameKey: "oni_baba",
        name: "Oni-Baba, the Dragon Princess",
        type: "monster",
        x: throne.cx,
        z: throne.cz,
        hp: monsterHp * 6,        // L7 base × 6 = ~1050 HP — committed boss fight [REF#DG-00908]
        maxHp: monsterHp * 6,
        isHostile: true,
        isBoss: true,
        vulnerability: { FIRE:0.85, WATER:0.85, EARTH:0.85, WIND:0.85, VOID:1.0, DEFAULT:0.9 },
      });
    }
  }

  return { map, rooms, spawnX, spawnZ, mobSpawns };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════ [REF#DG-00909]
// SECTIONED BRANCHING-MAZE GENERATOR (Mark 2026-07-13) — Phase 1. Wings of 4-6 squared rooms linked by 2-wide
// hallways over a branching maze graph (spanning tree + loop edges = dead-ends + loops). Corner entry; stairs_down
// LOCKED in the far wing (max graph distance). Seeded via _rand() (per-floor sub-seed) + depth-scaled. Emits the
// SAME contract as generateDungeonMap: { map, rooms, spawnX, spawnZ, mobSpawns }. Rooms keep roomId (aggro/cull
// isolation); corridors carve WALL tiles only so room floor is never clobbered. Validated structurally (reachability).
export function generateSectionedMaze(level = 2, MAP_W = 128, MAP_H = 128) {
  const ri = (n) => Math.floor(_rand() * n);
  const map = Array.from({ length: MAP_W }, () => Array.from({ length: MAP_H }, () => ({ type: 'wall' })));
  const rooms = [];
  const mobSpawns = [];
  let _rid = 0;

  // section grid — ramps with depth (Mark "scale up by depth"): L2 2×2≈20 rms … L6 4×3≈50 rms. [REF#DG-00910]
  const _sf = Math.min(1, Math.max(0, (level - 2) / 4));
  const SGX = 2 + Math.round(_sf * 2);
  const SGZ = 2 + Math.round(_sf);
  const secW = Math.floor((MAP_W - 6) / SGX), secH = Math.floor((MAP_H - 6) / SGZ);
  const secId = (sx, sz) => sz * SGX + sx;
  const sections = [];
  for (let sz = 0; sz < SGZ; sz++) for (let sx = 0; sx < SGX; sx++) sections.push({ sx, sz, x0: 3 + sx * secW, z0: 3 + sz * secH, w: secW, h: secH, rooms: [] });

  // maze graph over the section grid (randomized-DFS spanning tree + a few loop edges) [REF#DG-00911]
  const inGrid = (sx, sz) => sx >= 0 && sx < SGX && sz >= 0 && sz < SGZ;
  const visited = new Set(); const edges = new Set();
  const ekey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const corners = [[0, 0], [SGX - 1, 0], [0, SGZ - 1], [SGX - 1, SGZ - 1]];
  const [startSX, startSZ] = corners[ri(4)];
  const frontier = [[startSX, startSZ]]; visited.add(secId(startSX, startSZ));
  while (frontier.length) {
    const [sx, sz] = frontier.splice(ri(frontier.length), 1)[0];
    const unv = [[sx + 1, sz], [sx - 1, sz], [sx, sz + 1], [sx, sz - 1]].filter(([x, z]) => inGrid(x, z) && !visited.has(secId(x, z)));
    if (unv.length) { const [nx, nz] = unv[ri(unv.length)]; edges.add(ekey(secId(sx, sz), secId(nx, nz))); visited.add(secId(nx, nz)); frontier.push([nx, nz]); frontier.push([sx, sz]); }
  }
  for (let sz = 0; sz < SGZ; sz++) for (let sx = 0; sx < SGX; sx++) { const id = secId(sx, sz);
    if (!visited.has(id)) { const nb = [[sx + 1, sz], [sx - 1, sz], [sx, sz + 1], [sx, sz - 1]].filter(([x, z]) => inGrid(x, z) && visited.has(secId(x, z))); if (nb.length) { const [nx, nz] = nb[ri(nb.length)]; edges.add(ekey(id, secId(nx, nz))); visited.add(id); } } }
  const loopAdds = 1 + ri(1 + Math.round(_sf * 2)); let _added = 0, _guard = 0;
  while (_added < loopAdds && _guard++ < 60) { const sx = ri(SGX), sz = ri(SGZ); const d = [[1, 0], [0, 1]][ri(2)]; const nx = sx + d[0], nz = sz + d[1]; if (inGrid(nx, nz)) { const k = ekey(secId(sx, sz), secId(nx, nz)); if (!edges.has(k)) { edges.add(k); _added++; } } }

  const carve = (x0, z0, w, h) => { const id = _rid++;
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + h; z++) map[x][z] = { type: 'floor', room: true, roomId: id };
    const cx = Math.floor(x0 + w / 2), cz = Math.floor(z0 + h / 2);
    const r = { id, x: x0, y: z0, w, h, cx, cz, center: { x: cx, y: cz } }; rooms.push(r); return r; };
  const overlaps = (x0, z0, w, h) => { for (let x = x0 - 1; x < x0 + w + 1; x++) for (let z = z0 - 1; z < z0 + h + 1; z++) { if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) return true; if (map[x]?.[z]?.type === 'floor') return true; } return false; };
  // corridor carves WALL tiles only (never clobbers room floor / roomId) — 2-wide for section links, 1-wide internal [REF#DG-00912]
  const corridor = (a, b, internal) => { const wdt = internal ? 1 : 2; let x = a.cx, z = a.cz; const tx = b.cx, tz = b.cz;
    const paint = (px, pz) => { for (let w = 0; w < wdt; w++) { const qx = px + (z === tz ? 0 : w), qz = pz + (z === tz ? w : 0); if (qx > 0 && qz > 0 && qx < MAP_W && qz < MAP_H) { const c = map[qx][qz]; if (c.type === 'wall') map[qx][qz] = { type: 'floor', corridor: true }; } } };
    while (x !== tx) { paint(x, z); x += x < tx ? 1 : -1; } while (z !== tz) { paint(x, z); z += z < tz ? 1 : -1; } paint(tx, tz); };

  for (const S of sections) {
    const want = 4 + ri(3); let placed = 0, tries = 0;
    while (placed < want && tries++ < 120) { const rw = 4 + ri(4), rh = 4 + ri(4);
      const x0 = S.x0 + 1 + ri(Math.max(1, S.w - rw - 2)), z0 = S.z0 + 1 + ri(Math.max(1, S.h - rh - 2));
      if (overlaps(x0, z0, rw, rh)) continue; S.rooms.push(carve(x0, z0, rw, rh)); placed++; }
    for (let i = 1; i < S.rooms.length; i++) { let best = null, bd = 1e9; for (let j = 0; j < i; j++) { const a = S.rooms[i], b = S.rooms[j]; const dd = Math.abs(a.cx - b.cx) + Math.abs(a.cz - b.cz); if (dd < bd) { bd = dd; best = b; } } if (best) corridor(S.rooms[i], best, true); }
  }
  const secBy = (id) => sections[id];
  for (const e of edges) { const [a, b] = e.split('-').map(Number); const A = secBy(a), B = secBy(b); if (!A.rooms.length || !B.rooms.length) continue;
    let ra = A.rooms[0], rb = B.rooms[0], bd = 1e9; for (const p of A.rooms) for (const q of B.rooms) { const dd = Math.abs(p.cx - q.cx) + Math.abs(p.cz - q.cz); if (dd < bd) { bd = dd; ra = p; rb = q; } } corridor(ra, rb, false); }

  // DOORWAYS — where a hallway punched through a room's wall ring + touches that room's interior, tag it shoji_door. [REF#DG-00913]
  for (const r of rooms) { for (let x = r.x - 1; x <= r.x + r.w; x++) for (let z = r.y - 1; z <= r.y + r.h; z++) {
    if (!(x === r.x - 1 || x === r.x + r.w || z === r.y - 1 || z === r.y + r.h)) continue;
    const c = map[x]?.[z]; if (!c || c.type !== 'floor' || !c.corridor) continue;
    let touches = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = map[x + dx]?.[z + dz]; if (q && q.roomId === r.id) { touches = true; break; } }
    if (touches) map[x][z] = { type: 'shoji_door', roomId: r.id, panelless: false }; } }

  // entry (corner section) + stairs_up; player spawns just off the stairs [REF#DG-00914]
  const entry = secBy(secId(startSX, startSZ)); const eRoom = entry.rooms[0] || rooms[0];
  const spawnX = eRoom.cx, spawnZ = Math.min(MAP_H - 2, eRoom.cz + 1);
  map[eRoom.cx][eRoom.cz] = { type: 'stairs_up', roomId: eRoom.id };

  // farthest section (max BFS over the maze graph) → stairs_down LOCKED (Phase-2 explore-gate unlocks it) [REF#DG-00915]
  const adj = new Map(); for (let i = 0; i < sections.length; i++) adj.set(i, []);
  for (const e of edges) { const [a, b] = e.split('-').map(Number); adj.get(a).push(b); adj.get(b).push(a); }
  const dist = new Map([[secId(startSX, startSZ), 0]]); const bq = [secId(startSX, startSZ)];
  while (bq.length) { const u = bq.shift(); for (const v of adj.get(u) || []) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); bq.push(v); } }
  let farId = secId(startSX, startSZ), farD = -1; for (const [id, d] of dist) if (d > farD && secBy(id).rooms.length) { farD = d; farId = id; }
  const farSec = secBy(farId); const dRoom = farSec.rooms[farSec.rooms.length - 1] || rooms[rooms.length - 1];
  map[dRoom.cx][dRoom.cz] = { type: 'stairs_down', roomId: dRoom.id, locked: true };

  // monsters — 1-2 per room (deep floors stay FPS-sane), skip the entry room [REF#DG-00916]
  for (const r of rooms) { if (r.id === eRoom.id) continue; const n = 1 + ri(2);
    for (let k = 0; k < n; k++) { const tx = r.x + 1 + ri(Math.max(1, r.w - 2)), tz = r.y + 1 + ri(Math.max(1, r.h - 2));
      if (map[tx]?.[tz]?.type !== 'floor') continue; const isImp = _rand() < 0.4;
      mobSpawns.push({ id: `r${r.id}-${k}`, nameKey: isImp ? 'yakuza_imp_herald' : 'yakuza_goblin_herald', name: isImp ? 'Yakuza Imp' : 'Yakuza Goblin',
        type: 'monster', x: tx, z: tz, hp: isImp ? 30 : 50, maxHp: isImp ? 30 : 50, isHostile: false, isImp, hasFlintlock: isImp,
        vulnerability: { FIRE: 1.3, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } }); } }

  try { console.log(`[MapGen] SECTIONED MAZE L${level}: ${sections.length} sections · ${rooms.length} rooms · route depth ${farD} · ${mobSpawns.length} monsters`); } catch (_) {}
  return { map, rooms, spawnX, spawnZ, mobSpawns };
}

export default generateDungeonMap;
