/** [REF#DG-00714]
 * DungeonTest.js — SECTION 0, TO MARK'S 2026-08-25 SPEC, VERBATIM:
 *
 *   "i dont want to see anything other than a 12-tile long ROOM 1 hallway setup the old way we had
 *    current is ok. I want to see it connect into section 0 - the caberet + manager office +
 *    dressing room surrounded by a 2-tile squared hallway with thin room architecture. a guard room
 *    along side of room 1 that has thin wall single wall pane seperating rooms from hallways with
 *    a door."
 *
 * That is the whole map. ONE ring, not two. No outer ring, no cardinal spurs, no ring gates — the
 * previous build had all of those and he asked for none of them ("nothing other than").
 *
 *            ┌──────────────────────────┐
 *            │  2-TILE SQUARE HALLWAY   │   ← "surrounded by a 2-tile squared hallway"
 *            │  ┌────────────────────┐  │
 *            │  │ dressing │ manager │  │   3x3 + 3x3, each opening NORTH onto the hallway
 *            │  ├──────────┴─────────┤  │
 *            │  │    CABARET  6x6    │  │   N wall = the STAGE, never a door
 *            │  └────────────────────┘  │
 *            └───────────┬──────────────┘
 *                 番所   │  ROOM 1
 *                 4x12   │  2x12          ← guard runs flush alongside for its whole length
 *                        ▲ spawn
 *
 * THIN ROOM ARCHITECTURE (his words). Every wall here is a SEAM: two walkable spaces sit directly
 * against each other and the divider is the boundary itself, zero thickness, one pane, flush from
 * both sides. There is NO wall tile anywhere inside this level — the only 'wall' cells are the rock
 * around it. `npm run gate:bands` asserts that and must read 0. A wall TILE between two walkable
 * spaces is the double-wall defect that got the last map torn down (48 of them).
 *
 * ROOM IDS ARE THE WALLS. Same id = one space, no wall, free movement. Different ids = a divider,
 * and the ONLY way through is a door tile. So:
 *   · ROOM 1 and the square hallway share id 90 — they are one corridor, which is how ROOM 1
 *     "connects into section 0" with no door and no wall between them.
 *   · The 番所 (99) is a different id from ROOM 1, so the pane between them is a real single seam
 *     wall — exactly his "thin wall single wall pane seperating rooms from hallways" — pierced by
 *     ONE 1-tile door at the wall's midpoint.
 *   · Cabaret (1), dressing (2), manager (3) each open onto the hallway through their own doors.
 *
 * ⚠ ADJACENCY IS NOT PASSAGE. Two touching tiles with different ids are SEALED unless one is a door.
 *   A plain flood-fill walks straight through dividers and will call a sealed room reachable — use
 *   `npm run gate:sec0` (scripts/probe-sec0-connect.js), which respects them, per build piece.
 *
 * INVENTORY CONTROL: every room is a RoomShapes key — ENTRANCE_2x12 · GUARD_4x12 · R6x6 · R3x3 ×2 —
 * fetched with byKeyOrThrow. The two 12-long keys were added 08-25 for this spec; his 08-24 rule
 * "Make guard house same length as ROOM 1 hallway" is why the 番所 grew to 12 with the hallway.
 *
 * CONTRACT: { map, rooms, spawnX, spawnZ, mobSpawns, vendingAnchor, gates, segments }.
 * ON: DEFAULT for level 1. OFF (procedural dungeon): ?testmap=0 / window._testMap=false.
 */
(function (global) {
  'use strict';

  const ENTRANCE_KEY = 'ENTRANCE_2x12', GUARD_KEY = 'GUARD_4x12', CAB_KEY = 'R6x6', ANNEX_KEY = 'R3x3';
  const RING_W = 2;                 // "a 2-tile squared hallway" [REF#DG-00715]
  const OFF_X = 20;
  const HALL_ID  = 90;              // ROOM 1 + the square hallway — ONE corridor, so they connect openly [REF#DG-00716]
  const CAB_ID   = 1;               // ⚠ the engine's cabaret hook id [REF#DG-00717]
  const DRESS_ID = 2, MGR_ID = 3;
  const GUARD_ID = 99;

  function shapes(g) {
    if (g && g.RoomShapes) return g.RoomShapes;
    if (typeof require === 'function') { try { return require('./RoomShapes.js'); } catch (_) {} }
    return null;
  }
  function byKeyOrThrow(g, key, what) {
    const RS = shapes(g);
    if (!RS) throw new Error('DungeonTest: RoomShapes is not loaded — the layout has nowhere to come from');
    const r = typeof RS.byKey === 'function' ? RS.byKey(key) : null;
    if (!r) throw new Error('DungeonTest: "' + key + '" is not a ' + what + ' in RoomShapes.json');
    return r;
  }
  // a door sits at the MIDDLE of its wall — room.html's midOf, the rule the generator enforces [REF#DG-00718]
  const midOf = (a, len, span) => a + Math.floor((len - span) / 2);

  function rects(g) {
    const en = byKeyOrThrow(g, ENTRANCE_KEY, 'special');
    const gd = byKeyOrThrow(g, GUARD_KEY, 'special');
    const cb = byKeyOrThrow(g, CAB_KEY, 'room');
    const ax = byKeyOrThrow(g, ANNEX_KEY, 'room');

    // ── THE CORE: the two offices sit directly on top of the cabaret. In the seam model the line [REF#DG-00719]
    //    between dressing and manager, and between them and the cabaret, is a shared divider with
    //    no thickness — so the three rooms read as one block with single walls between them.
    const CX = 11, CZ = 11;
    const DRESS = { x: CX,        z: CZ,               w: ax.w, h: ax.h };
    const MGR   = { x: CX + ax.w, z: CZ,               w: ax.w, h: ax.h };
    const CAB   = { x: CX,        z: CZ + ax.h,        w: cb.w, h: cb.h };
    const CORE  = { x: CX, z: CZ, w: cb.w, h: ax.h + cb.h };

    // ── THE 2-TILE SQUARE HALLWAY, directly against the core (no rock gap — a gap would put a wall [REF#DG-00720]
    //    TILE between two walkable spaces, which is the defect that tore the last map down).
    const RING = { x: CORE.x - RING_W, z: CORE.z - RING_W, w: CORE.w + 2 * RING_W, h: CORE.h + 2 * RING_W };

    // ── ROOM 1 hangs off the hallway's south edge on the cabaret's own middle columns, so the run [REF#DG-00721]
    //    spawn → ROOM 1 → hallway → permit door → cabaret is one straight pair of columns.
    const ROOM1 = { x: midOf(CAB.x, CAB.w, en.w), z: RING.z + RING.h, w: en.w, h: en.h };
    const GUARD = { x: ROOM1.x - gd.w,            z: ROOM1.z,         w: gd.w, h: gd.h };

    const DOORS = [
      // CABARET (Mark 2026-08-22, law): "2 two tile doors, one on south and one on east, one 1-tile [REF#DG-00722]
      // door on west side, none on north - that is stage".
      { x: midOf(CAB.x, CAB.w, 2),     z: CAB.z + CAB.h - 1, id: CAB_ID, piece: 'hallway', tag: 'permitW',
        e: { sign: '許可証必要', signEn: 'PERMIT REQUIRED', permitDoor: true } },
      { x: midOf(CAB.x, CAB.w, 2) + 1, z: CAB.z + CAB.h - 1, id: CAB_ID, piece: 'hallway', tag: 'permitE',
        e: { sign: '許可証必要', signEn: 'PERMIT REQUIRED', permitDoor: true } },
      { x: CAB.x + CAB.w - 1, z: midOf(CAB.z, CAB.h, 2),     id: CAB_ID, piece: 'hallway', tag: 'cabEastN', e: {} },
      { x: CAB.x + CAB.w - 1, z: midOf(CAB.z, CAB.h, 2) + 1, id: CAB_ID, piece: 'hallway', tag: 'cabEastS', e: {} },
      { x: CAB.x,             z: midOf(CAB.z, CAB.h, 1),     id: CAB_ID, piece: 'hallway', tag: 'cabWest',
        e: { specialDoor: true, locked: true, lockedBy: 'cabaret', sign: '関係者以外立入禁止', signEn: 'AUTHORIZED PERSONNEL ONLY' } },
      // THE TWO OFFICES — one door each, centre of its NORTH wall, opening onto the square hallway. [REF#DG-00723]
      // (North, not south: the cabaret is directly below them and its north wall is the STAGE.)
      { x: midOf(DRESS.x, DRESS.w, 1), z: DRESS.z, id: DRESS_ID, piece: 'offices', tag: 'dressN', e: { specialDoor: true } },
      { x: midOf(MGR.x,   MGR.w,   1), z: MGR.z,   id: MGR_ID,   piece: 'offices', tag: 'mgrN',   e: { specialDoor: true } },
      // 番所 — EAST door through the single seam pane onto ROOM 1 (his ask this round), and the [REF#DG-00724]
      // NORTH door onto the square hallway (his ask earlier the same day).
      { x: GUARD.x + GUARD.w - 1,      z: midOf(GUARD.z, GUARD.h, 1), id: GUARD_ID, piece: 'room1-guard', tag: 'guardE', e: { specialDoor: true, guardDoor: true } },
      { x: midOf(GUARD.x, GUARD.w, 1), z: GUARD.z,                    id: GUARD_ID, piece: 'room1-guard', tag: 'guardN', e: { specialDoor: true, guardDoor: true } },
    ];

    return { DRESS, MGR, CAB, CORE, RING, ROOM1, GUARD, DOORS,
             spawn: { x: ROOM1.x, z: ROOM1.z + ROOM1.h - 1 },
             W: 28, H: 40,
             key: 'SEC0-ONERING+' + CAB_KEY + '+' + ENTRANCE_KEY + '+' + GUARD_KEY };
  }

  // Build order. Each step leaves the map band-free AND everything built reachable — `upTo` exists so [REF#DG-00725]
  // a probe can prove that per piece instead of only at the end.
  const PIECES = ['cabaret', 'hallway', 'offices', 'room1-guard'];

  function generateDungeonMap(level, MAP_W, MAP_H, upTo) {
    MAP_W = MAP_W || 128; MAP_H = MAP_H || 128;
    const steps = (typeof upTo === 'number') ? Math.max(0, Math.min(PIECES.length, upTo)) : PIECES.length;
    const R = rects(global);
    const OX = ((MAP_W - R.W) >> 1) + OFF_X, OY = (MAP_H - R.H) >> 1;

    const map = new Array(MAP_W);
    for (let x = 0; x < MAP_W; x++) { map[x] = new Array(MAP_H);
      for (let z = 0; z < MAP_H; z++) map[x][z] = { type: 'wall' }; }

    const put = (x, z, cell) => { const ex = x + OX, ez = z + OY;
      if (ex >= 0 && ez >= 0 && ex < MAP_W && ez < MAP_H) map[ex][ez] = cell; };
    const inRect = (r, x, z) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;
    const fill = (r, mk) => { for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.h; z++) put(x, z, mk()); };
    const ring = (outer, hole, mk) => { for (let x = outer.x; x < outer.x + outer.w; x++) for (let z = outer.z; z < outer.z + outer.h; z++)
      if (!inRect(hole, x, z)) put(x, z, mk()); };
    const corr = (id) => () => ({ type: 'floor', hall: true, roomId: id, segmentId: 0 });
    const room = (id) => () => ({ type: 'floor', room: true, roomId: id, segmentId: 0 });

    const has = (name) => steps > PIECES.indexOf(name);
    if (has('cabaret'))     fill(R.CAB, room(CAB_ID));
    if (has('hallway'))     ring(R.RING, R.CORE, corr(HALL_ID));      // the 2-tile square hallway [REF#DG-00726]
    if (has('offices'))   { fill(R.DRESS, room(DRESS_ID)); fill(R.MGR, room(MGR_ID)); }
    if (has('room1-guard')) { fill(R.ROOM1, corr(HALL_ID)); fill(R.GUARD, room(GUARD_ID)); }
    for (const d of R.DOORS) {
      if (!has(d.piece)) continue;
      const ex = d.x + OX, ez = d.z + OY;
      if (!map[ex] || !map[ex][ez] || map[ex][ez].type === 'wall') continue;   // its space is not built yet [REF#DG-00727]
      put(d.x, d.z, Object.assign({ type: 'shoji_door', roomId: d.id, segmentId: 0 }, d.e || {}));
    }

    const _mk = (r, id, name, en2, type) => {
      const ex = r.x + OX, ez = r.z + OY, cw = r.w >> 1, ch = r.h >> 1;
      return { id, roomId: id, x: ex, y: ez, w: r.w, h: r.h,
               cx: ex + cw, cz: ez + ch, center: { x: ex + cw, y: ez + ch },
               roomName: name, roomNameEn: en2, roomType: type,
               segmentId: 0, sectionIndex: 0, section: 'entry' };
    };
    // ⚠ isCabaret AS WELL AS roomType — both, the way DungeonChain (:3505) and DungeonEmergency [REF#DG-00728]
    //   (:894) emit them. Lanes keying on the FLAG are blind to a cabaret that carries only the type.
    const cab   = _mk(R.CAB,   CAB_ID,   'キャバレー', 'Cabaret', 'cabaret'); cab.isCabaret = true;
    const dress = _mk(R.DRESS, DRESS_ID, '楽屋',       'Starlette Dressing Room', 'dressing');
    const mgr   = _mk(R.MGR,   MGR_ID,   '支配人室',    'Manager Office', 'manager');
    const guard = _mk(R.GUARD, GUARD_ID, '番所',       'GUARDPOST', 'guard'); guard.isGuardRoom = true;
    const hall  = _mk(R.ROOM1, HALL_ID,  '廊下',       'Entrance Hall', 'hallway');
    hall.isCorridorNet = true; hall.isMainHall = true; hall.isEntranceHall = true;
    const nominal = _mk(R.ROOM1, 0, '廊下', 'Halls', 'hallway'); nominal.isMainHall = true;   // rooms[0] [REF#DG-00729]

    const built = [nominal, hall];
    if (has('cabaret')) built.push(cab);
    if (has('offices')) { built.push(dress); built.push(mgr); }
    if (has('room1-guard')) built.push(guard);

    let spawnX = R.spawn.x + OX, spawnZ = R.spawn.z + OY;
    if (!has('room1-guard')) { spawnX = R.CAB.x + OX + 1; spawnZ = R.CAB.z + OY + 1; }

    // ── OUR STAIRS, BACK IN ROOM 1 (Mark 2026-08-25: "add our stairs to room 1 again — grep them [REF#DG-00730]
    //    from 7+ days") ──────────────────────────────────────────────────────────────────────────
    //    MEASURED BEFORE ADDING: scripts/probe-stairs-census.js read this live map as exactly
    //    {wall:16182, floor:193, shoji_door:9} — ZERO stairs tiles of any kind. This generator is
    //    three days old and never emitted any; the stairs logic it replaced lives in DungeonChain,
    //    which floor 1 no longer runs. So they did not break, they were never carried across.
    //    RECOVERED from 654b7ba8 (2026-08-18) js/v8/map/DungeonChain.js ~:3641-3648, read out of an
    //    ISOLATED COPY at .trust/recovered/stairs-2026-08-18/ — never edited in the live tree.
    //    The rule there, verbatim in behaviour:
    //      · a TWO-tile landing — `stairs_up` beside `stairs_up_r`
    //      · at the room's SOUTH end, where the player arrives
    //      · BOTH tiles must be floor. The 2026-06-19 bug ("cabaret + map not in sync") was one
    //        stair tile landing on a wall, which shunted the spawn a tile east of the hall.
    //      · the spawn sits one tile NORTH of the stairs, not on them (08-18: `spawnZ = upz - 1`).
    //    ROOM 1 is 2 tiles wide, which is the exact case that rule was written for — the pair spans
    //    the hall with no shift. The floor guard is kept anyway: ROOM1.w is a constant today and a
    //    constant is one edit from not being 2.
    //    ⚠ THE TYPE IS CHANGED ON THE EXISTING CELL, NOT WRITTEN OVER IT. The 08-18 line assigned a
    //      bare { type, roomId, segmentId }; these hall tiles also carry `hall: true`, which the
    //      corridor lanes read. Replacing the cell would drop that silently — the exact shape of
    //      bug DungeonEmergency:901 already records ("`hasStairs` vanished exactly this way").
    //    ⚠ WALKABLE: canWalk (Engine9 :21139) passes everything except 'wall' and 'shoji', so both
    //      stair tiles stay walkable and the player is never spawned into a solid.
    //    NOTE: this adds the way IN. There is still no `stairs_down` on this map — see the report.
    if (has('room1-guard')) {
      const _upZ = R.ROOM1.z + R.ROOM1.h - 1;
      let _upX = R.ROOM1.x;
      const _cellAt = (lx, lz) => (map[lx + OX] ? map[lx + OX][lz + OY] : null);
      const _isFlr = (lx, lz) => { const c = _cellAt(lx, lz); return !!(c && c.type === 'floor'); };
      if (!_isFlr(_upX + 1, _upZ) && _isFlr(_upX - 1, _upZ)) _upX -= 1;
      const _stair = (lx, lz, type) => { const c = _cellAt(lx, lz); if (c && c.type === 'floor') c.type = type; };
      _stair(_upX,     _upZ, 'stairs_up');
      _stair(_upX + 1, _upZ, 'stairs_up_r');
      if (_isFlr(_upX, _upZ - 1)) { spawnX = _upX + OX; spawnZ = _upZ - 1 + OY; }
      try { global._testStairsUp = [[_upX + OX, _upZ + OY], [_upX + 1 + OX, _upZ + OY]]; } catch (_) {}
    }

    try {
      global._testCabaret = true; global._testVending = true; global._testLoot = true; global._testWebs = true;
      global._cabDoor = false;   // the seam door system owns every doorway on this map [REF#DG-00731]
    } catch (_) {}
    try {
      global._testMapActive = true;
      console.log('[MapGen] SECTION 0 (' + R.key + ') — ROOM 1 ' + R.ROOM1.w + 'x' + R.ROOM1.h
        + ' + 番所 ' + R.GUARD.w + 'x' + R.GUARD.h + ' alongside (single seam pane + door) → 2-tile square '
        + 'hallway ' + R.RING.w + 'x' + R.RING.h + ' around the core [dressing | manager / CABARET '
        + R.CAB.w + 'x' + R.CAB.h + '] · ' + R.DOORS.length + ' doors · NO wall tile anywhere inside '
        + '(gate: npm run gate:bands = 0)' + (steps < PIECES.length ? ' · PARTIAL, pieces 1..' + steps : '')
        + '. Procedural dungeon: ?testmap=0');
    } catch (_) {}

    return { map, rooms: built, spawnX, spawnZ,
             mobSpawns: [], vendingAnchor: null, gates: [],
             segments: [{ id: 0, roomIds: [0, HALL_ID, CAB_ID, DRESS_ID, MGR_ID, GUARD_ID], state: 'active' }],
             _testMap: true };
  }

  function expect(MAP_W, MAP_H) {
    MAP_W = MAP_W || 128; MAP_H = MAP_H || 128;
    const R = rects(global);
    const OX = ((MAP_W - R.W) >> 1) + OFF_X, OY = (MAP_H - R.H) >> 1;
    const T = (x, z) => [x + OX, z + OY];
    const rect = (r) => ({ x: r.x + OX, z: r.z + OY, w: r.w, h: r.h });
    const byTag = {}; for (const d of R.DOORS) byTag[d.tag] = T(d.x, d.z);
    return {
      key: R.key, pieces: PIECES.slice(),
      cabaret: rect(R.CAB), dressing: rect(R.DRESS), manager: rect(R.MGR),
      hallway: rect(R.RING), room1: rect(R.ROOM1), guard: rect(R.GUARD),
      doorTiles: [byTag.permitW, byTag.permitE], doors: byTag,
      allDoors: R.DOORS.map(d => T(d.x, d.z)),
      ids: { hall: HALL_ID, cabaret: CAB_ID, dressing: DRESS_ID, manager: MGR_ID, guard: GUARD_ID },
      spawn: T(R.spawn.x, R.spawn.z), spanAxis: 'x',
      // ROOM 1's two-tile arrival landing (Mark 2026-08-25). Published so a probe asserts the pair [REF#DG-00732]
      // rather than trusting the generator's own log line.
      stairsUp: [T(R.ROOM1.x, R.ROOM1.z + R.ROOM1.h - 1), T(R.ROOM1.x + 1, R.ROOM1.z + R.ROOM1.h - 1)]
    };
  }

  const API = { generateDungeonMap, expect, setMapSeed: function(){}, rects, PIECES,
                ENTRANCE_KEY, GUARD_KEY, CAB_KEY, ANNEX_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.DungeonTest = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
