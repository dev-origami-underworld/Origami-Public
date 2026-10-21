/* DungeonChain.js — procedural "main hall + side rooms" dungeon generator for NewOrigami v8. [REF#DG-00042]
 *
 * Drop-in companion for MapGen.generateDungeonMap: emits the SAME engine contract
 *   { map, rooms, spawnX, spawnZ, mobSpawns, vendingAnchor }
 * Internally it builds a compact tile grid (NetHack walled rooms · single shoji door at each wall MIDPOINT ·
 * a branching tree off the cabaret whose cabaret→casino trunk is the MAIN HALL · casino = deepest room = stairs),
 * then ADAPTS it onto the engine's 128×128 { type, roomId } map.
 *
 * WORK-FROM-A-COPY: this is a NEW file. It does not touch MapGen.js or Engine9.html. The live seam is wired
 * later behind a runtime feature flag. Prototype + validation: scratch/dungeon-walk.html. Plan:
 * knowledge/design/MAPGEN_INTEGRATION_PLAN_2026-06-18.md.
 *
 * STATUS: Phase 1 — generator core + seeded RNG complete & headless-validated; the engine-contract adapter
 * (tile types, room names from ROOM_POOLS, stairs, mobSpawns) is filled in Phase 1b/2 from the MapGen spec.
 */
(function (global) {
  'use strict';

  // ── THE UNIQUE-SPAWN PROTECTION LIST — ONE SOURCE, N READERS ──────────────────────────────────── [REF#DG-01405]
  //   These id prefixes name bodies that ARE a room's identity: never counted against a crowd cap,
  //   never trimmed. It has always been enforced HERE (the room-trim pass reads it as `_unique`), and
  //   that enforcement is why floor 1's Gate Ogre survives every boot -- measured 8/8 healthy.
  //   ⚠ HOISTED AND EXPORTED 2026-09-03 because a SECOND trimmer exists that never knew about it:
  //     Engine9's karma spawn-thinner tests FLAGS (isBoss/isSupervisor/dropsLevelKey/cabAudience/
  //     noWallSnap) and the Gate Ogre carries only `isGuardOgre`, so he is exempt here and exposed
  //     there. MEASURED on the live spawn object: EXEMPT=false, every one of those flags undefined.
  //     Two trim-protection mechanisms in two vocabularies, and nothing made them agree. Publishing
  //     this regex lets the other reader consult the SAME list instead of keeping a copy that can rot
  //     out of step -- the one-source/many-readers rule this repo already applies to `_counterFrac()`.
  //   ⚠ ORDER MATTERS: `barracks-guard-` must be tested before `barracks-` or the guard falls in with
  //     his own workers. Do not reorder these alternatives.
  const UNIQUE_SPAWN_ID_RE = /^(inspector-|guard-|barracks-guard-|boss-|konbini-keeper|hall-succubus|skel-patrol-)/;

  // ── seeded RNG (Mulberry32) — mirrors MapGen.js so save/load (which stores only the seed) round-trips ── [REF#DG-00043]
  let _rng = Math.random;
  function _mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // ⚠ THE RAW SEED IS KEPT, NOT JUST THE GENERATOR IT BUILT. `Creator.dealSectionSpecials(seed, [REF#DG-00043]
  //   level)` needs the seed VALUE to derive its own independent stream; reading `_rng` instead
  //   would consume the map's draws and reshuffle every layout ever generated from that seed.
  let _mapSeedVal = 0;
  function setMapSeed(seed) { _mapSeedVal = (seed >>> 0) || 0x12345678; _rng = _mulberry32(_mapSeedVal); }
  function _rand() { return _rng(); }

  // ── compact generator grid + static cabaret head (identical geometry to the validated prototype) ── [REF#DG-00044]
  // GH 46 -> 66 (Mark 2026-08-04 GO). MEASURED CAUSE: the heart box is ~21 rows tall, so a 46-row
  // grid left only 11 rows north / 12 south while east/west had 23 — which is exactly why E/W could
  // take the drawing's stub-exit shape and N/S could not, and why every N/S attempt starved the room
  // packer. At 66 all four sides are symmetric (~22 each) and every section gets the same grammar.
  // The compact grid is CENTRED in the 128x128 engine map (OX/OY, generateDungeonMap), so this needs
  // no re-mapping and no engine change.
  const GW = 66, GH = 66, ROCK = 0, FLOOR = 1, WALL = 2, CORR = 3, DOOR = 4;
  // Filler-room pass: DEFAULT OFF since 2026-09-18 (Mark). `?fillers=1` or window._fillerRooms = true [REF#DG-02087]
  // opts back in; `?fillers=0` is explicit off. Node has no window/URL — the pass stays off there too,
  // so a generator probe grades the shipped default rather than a second, probe-only map. [REF#DG-FILL01]
  const _fillerRoomsOn = () => {
    if (typeof window === 'undefined') return false;
    try { const q = new URLSearchParams((window.parent && window.parent.location && window.parent.location.search) || window.location.search || '');
          const v = q.get('fillers'); if (v === '1') return true; if (v === '0') return false; } catch (_) {}
    return window._fillerRooms === true;
  };
  const MAX_CORR = 10;   // max corridor tiles between two rooms (Mark: "hallways ≤10 tiles") — hard gate; genCompact retries on overflow [REF#DG-00045]

  // ══ SECTION-0 TIERS — ONE TEMPLATE, ONE ROW PER FLOOR (Mark 2026-09-11 floor law, GO 2026-09-12 "lets go on a3b") ══ [REF#DG-02023]
  //    "each floor would have an entrance stair. each should lead through the same sort of hallway to guard
  //     room (which get better each level …)" · "each floor has a nicer caberet … pre-made in advance as well
  //     as section 0 for each level". Floor 1 is the hand plan in Section0.js; floors 2+ carve THIS table in
  //    _buildLHalls' head phase. Sizes are carve rects, walls included (interior = w-2 × h-2). Design note:
  //    knowledge/design/FLOOR_LAW_FLOORS_2PLUS_2026-09-11.md §5 — seven rows in one table, not seven layouts,
  //    so every dresser that keys on isCabaret / isGuardRoom / isMainHall keeps working unchanged.
  //      cab      the cabaret, grows a tile-pair per floor (floor 1 interior is 6×6; floor 7 is the grand one)
  //      hall     the entrance hallway — floor 1's 2-wide hall shape (interior 2 × hallH-2), stairs_up at its foot
  //      guard    the 番所 flush east of the hall, stairs_down inside, locked until wings 1-3 turn their keys
  //      patrols  guard+archer pairs dealt PER SECTION (the 07-27 hallway patrols; was a flat 1 on every floor)
  //      garrison extra skeleton guards asleep inside the 番所 beside the Gate Ogre (his hp already scales ×4/floor); floor 7 is the grand garrison
  //    Floors past 7 (the endless abyss) reuse row 7. Knob: window._s0Tiers = {floor:{…}} overrides a row.
  // ⛔ SUPERSEDED 2026-09-19 by Mark: "reuse this caberet for all floors until otherwise noted ...
  // each floor adds +2 to size of caberet tiles + size of stage to accommodate" — cabW/cabH used to grow
  // in an ALTERNATING +2/+0 pattern (10,10 → 12,10 → 12,12 → ...), so only one dimension widened per
  // floor. Now BOTH grow +2 every floor, floor 2's 10×10 as the anchor (unchanged, so an already-tuned
  // floor 2 doesn't shift). The cabaret STAGE needs no separate number: _buildCabaretStage (Engine9.html
  // ~:39972) already reads the room's own world-unit width (_cabWu) and stretches its torii/byōbu/mat/
  // lanterns to fit — "the same cabaret" growing with the room IS "the stage to accommodate", not a
  // second table. guardW/guardH/patrols/garrison are UNCHANGED — not named by this order, and each row
  // stays a hand-editable literal for Mark to retune per floor as he said he would.
  // dressW/H and mgrW/H join the row 2026-10-01: the BACKSTAGE PAIR (Dressing Room off the cabaret,
  // Manager's Office off the entrance hall) is carved on floors 2-7 by the head phase below. They are
  // carve rects, walls included, so interior = w-2 x h-2 — a 5x5 dressing room is a 3x3 room.
  // Both grow with depth like every other column here. Deep doc:
  // knowledge/design/FLOORS_2PLUS_SECTION0_TEMPLATE_2026-10-01.md
  const S0_TIERS = {
    2: { cabW: 10, cabH: 10, hallW: 4, hallH: 10, guardW: 7,  guardH: 10, patrols: 1, garrison: 1, dressW: 5, dressH: 5, mgrW: 6, mgrH: 6 },
    3: { cabW: 12, cabH: 12, hallW: 4, hallH: 10, guardW: 7,  guardH: 12, patrols: 1, garrison: 1, dressW: 5, dressH: 6, mgrW: 6, mgrH: 6 },
    4: { cabW: 14, cabH: 14, hallW: 4, hallH: 10, guardW: 9,  guardH: 12, patrols: 2, garrison: 2, dressW: 6, dressH: 6, mgrW: 7, mgrH: 7 },
    5: { cabW: 16, cabH: 16, hallW: 4, hallH: 10, guardW: 9,  guardH: 14, patrols: 2, garrison: 2, dressW: 6, dressH: 7, mgrW: 7, mgrH: 7 },
    6: { cabW: 18, cabH: 18, hallW: 4, hallH: 10, guardW: 11, guardH: 14, patrols: 3, garrison: 3, dressW: 7, dressH: 7, mgrW: 8, mgrH: 8 },
    7: { cabW: 20, cabH: 20, hallW: 4, hallH: 10, guardW: 11, guardH: 16, patrols: 3, garrison: 4, dressW: 7, dressH: 8, mgrW: 8, mgrH: 8 },
  };
  function _s0Tier(level) {
    const l = Math.max(2, Math.min(7, level | 0));
    const o = (typeof window !== 'undefined' && window._s0Tiers && window._s0Tiers[level]) || null;
    return Object.assign({}, S0_TIERS[l], o || {});
  }

  // ══ FLOORS 2-7: FLOOR 1'S SECTION 0, EVERY ROOM 10% LARGER, IS THE HUB (2026-10-02) ══════════════════════════════════ [REF#DG-02218]
  //    knowledge/design/FLOORS_2PLUS_FLOOR1_SECTION0_PLAN_2026-10-02.md (step 3). The order: section 0 modelled on floor 1,
  //    hallway 0 modelled on floor 1, every section 1-3 joined to section 0 and section 0 joined to the hallway.
  //    Section0.buildSection0Core writes the core (its +10% table, S0_LAYOUT_PLUS10) straight into the engine map; this file
  //    only reserves the core's footprint in the compact grid, carves the three wing legs (1 west, 2 north, 3 east) with a
  //    spur from each to the core's gate, and packs the wing rooms as before. The 09-12 S0_TIERS head (the horseshoe head
  //    phase) is the fallback when the switch is off or Section0 is not loaded. Off: window._s0FromFloor1 = false.
  //    The 番所 keeps growing with depth (S0_TIERS guardW/guardH, walls excluded, never below the +10% 6x9); the dressing
  //    room and the office are sized per seed inside the ring.
  let _hubCore = null;                                   // { L, ox, oz } compact — written by _buildLHalls, read by generateDungeonMap [REF#DG-02219]
  const HUB_OX = 18, HUB_OZ = 20;                         // compact position of the layout's local (0,0): every spur 7-8 tiles [REF#DG-02220]
  const HUB_K = 1000;                                     // hub path index = section * HUB_K + steps from the section's gate [REF#DG-02221]
  const HUB_IDS = { hall: 0, cab: 1, spine: 2, dress: 3, mgr: 4, ring: 5, guard: 6, easthall: 7, officeE: 8, storeE: 9 };
  const _s0Mods = () => {
    let S = global && global.Section0, C = global && global.Creator;
    try { if ((!S || !S.buildSection0Core || !C) && typeof require === 'function') { C = C || require('./Creator.js'); S = (S && S.buildSection0Core) ? S : require('./Section0.js'); } } catch (_) {}
    return (S && typeof S.buildSection0Core === 'function' && C && typeof C.createRoom === 'function') ? { S, C } : null;
  };
  const _s0HubOn = () => _genLevel >= 2 && !(global && global._s0FromFloor1 === false) && !!_s0Mods();
  // The layout for one floor: the +10% table, the 番所 at its tier size, the dressing room and the office sized by the seed. [REF#DG-02222]
  // Their sizes are held to what the ring allows: a wall between them and the ring must be 0 tiles (a seam) or 3+, never
  // 1-2 (a 1-tile wall between two walkables is a `band`), so the dressing room is 3, 4 or 7 wide (its door column fixed on
  // the backstage passage) and the office is 4 wide; both 3 or 4 deep. The office's stairs (local 13,4) stay inside it.
  function _hubLayout(S, level) {
    const B = S.S0_LAYOUT_PLUS10, L = Object.assign({}, B), t = _s0Tier(level);
    const DW = [3, 4, 7];
    const dw = DW[(_rand() * DW.length) | 0], dh = 3 + ((_rand() * 2) | 0), mh = 3 + ((_rand() * 2) | 0);
    L.dress = { x: B.dress.x + B.dress.w - dw, z: B.dress.z, w: dw, h: dh };
    L.mgr = { x: B.mgr.x, z: B.mgr.z, w: B.mgr.w, h: mh };
    L.guard = Object.assign({}, B.guard, { w: Math.max(B.guard.w, (t.guardW | 0) - 2), h: Math.max(B.guard.h, (t.guardH | 0) - 2) });
    return L;
  }

  // ══ CARVE-SPAN CENSUS ══ THE TRUNK FINALLY REPORTS ITS OWN STRAIGHT RUNS. [REF#DG-01454]
  //    Mark, 2026-09-07: "fix DungeonChain.js, let onibaba have it."
  //
  //    WHY THIS EXISTS: MAX_CORR above is enforced ONLY inside joinPath() (the room-to-room MST
  //    connectors). The main ring/trunk carved by _buildLHalls -- the live generator on floors 2+ --
  //    never calls joinPath and never consults MAX_CORR, which is exactly why the 09-02 ring rewrite
  //    (36389aff) could take the longest straight run from 26 tiles to 45 without tripping anything.
  //    Creator.js's computeMapCensusDraft could not see it either: it derives one span per corridor
  //    ROOM RECORD, and this generator's horseshoe is one unbroken multi-leg blob with no per-leg
  //    records -- its own KNOWN GAP note says so, and names this file as the place to close it.
  //
  //    PURE READ, ZERO GENERATION EFFECT. It runs on the finished hall tile set, after the
  //    connectivity audit, on the accepted attempt only. It carves nothing, rejects nothing and
  //    returns nothing to the carver: Phase 1 of
  //    plans/ONIBABA_MAP_ORCHESTRATION_ARCHITECTURE_2026-09-06.md is report-only by design.
  //
  //    METHOD: maximal contiguous runs along every row (axis x) and every column (axis z) of the hall
  //    tile set. Two filters, stated rather than hidden:
  //      - runs of 2 tiles or fewer are dropped. This game's hallways are 2 tiles WIDE, so every
  //        column of a horizontal leg yields a 2-tile vertical run that is the hall's WIDTH, not its
  //        length. Without this filter a 45-tile leg reports as 45 spurious 2-tile spans.
  //      - a run identical in extent to one on the neighbouring parallel line is reported ONCE with
  //        width 2. The two lanes of one 2-wide hall are one hallway to the player, not two.
  //    KNOWN AND NOT HIDDEN: the rounded corner arcs (the R / R+1 quarter-annuli) are part of the same
  //    tile set, so a leg's reported run includes the arc tiles it flows into -- that is what the
  //    player actually walks, so it is counted, and a reported span can exceed its own carve loop's
  //    bounds by a tile or two. Arc tiles also produce their own short 3-5 tile runs, well under
  //    MAX_CORR, which show up as low-count spans rather than as violations.
  let _carveSpans = [];
  function _straightRuns(tileSet, source) {
    const byRow = new Map(), byCol = new Map();
    for (const k of tileSet) {
      const c = String(k).split(','), x = +c[0], y = +c[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      let r = byRow.get(y); if (!r) { r = []; byRow.set(y, r); } r.push(x);
      let q = byCol.get(x); if (!q) { q = []; byCol.set(x, q); } q.push(y);
    }
    const runs = [];
    const walk = (groups, axis) => {
      for (const [line, vals] of groups) {
        vals.sort((a, b) => a - b);
        let lo = vals[0], prev = vals[0];
        for (let i = 1; i <= vals.length; i++) {
          const v = vals[i];
          if (v === prev + 1) { prev = v; continue; }
          const n = prev - lo + 1;
          if (n > 2) runs.push({ axis, line, lo, hi: prev, tileCount: n });
          lo = v; prev = v;
        }
      }
    };
    walk(byRow, 'x'); walk(byCol, 'z');
    // parallel-lane dedupe: same axis, same extent, adjacent line = one hallway of width 2 [REF#DG-01455]
    runs.sort((a, b) => (a.axis === b.axis ? (a.lo - b.lo || a.hi - b.hi || a.line - b.line)
                                          : (a.axis < b.axis ? -1 : 1)));
    const kept = new Map(), out = [];
    for (const r of runs) {
      const key = (ln) => r.axis + ':' + r.lo + ':' + r.hi + ':' + ln;
      const twin = kept.get(key(r.line - 1));
      if (twin) { twin.width = (twin.width || 1) + 1; kept.set(key(r.line), twin); continue; }
      kept.set(key(r.line), r); out.push(r);
    }
    return out.map(r => ({
      axis: r.axis,
      startTile: (r.axis === 'x') ? [r.lo, r.line] : [r.line, r.lo],
      endTile:   (r.axis === 'x') ? [r.hi, r.line] : [r.line, r.hi],
      tileCount: r.tileCount,
      width: r.width || 1,
      source: source || 'carve',
    }));
  }
  const CABX = 2, CABY = 6, ENTRY_X0 = CABX + 3, ENTRY_X1 = CABX + 4;
  let CABW = 8, CABH = 7, DDX = CABX + CABW - 1, DDY = CABY + 3;   // head dims (L2+ = 8×7 cabaret); buildDungeon() resets them per level — Floor 1 keeps the treasured 6×6 [REF#DG-00046]
  let T, rooms, doorList, mhTiles, _genLevel = 2, _l1Open = [];   // _l1Open: Floor-1 cabaret↔hallway OPEN-gap tiles (adapter marks them .doors → no boundary pane) [REF#DG-00047]
  let _storeDoors = new Set();   // KONBINI prototype: compact-space 'gx,gy' of the store's door tiles → adapter gives them a FIXED panel (no _rand draw) so the rest of the map stays byte-identical to the no-store generator [REF#DG-00048]
  // RING (Phase G1, 2026-06-27): the square-ring topology's gate + section bookkeeping. ONLY populated by _buildRing(); [REF#DG-00049]
  // the spine/spanning-tree paths leave these EMPTY so flag-off stays byte-identical (the adapter only reads them when non-empty).
  // ONE RING AUTHORITY. The heart hallway is carved by _buildHeart in COMPACT space; an earlier same-day
  // attempt carved an equivalent ring in the ADAPTER instead (see the level-1 ring block near the bottom).
  // Both running at once is not "belt and braces" — the adapter version re-derives its own block from the
  // cabaret + wing bounds, lands INSIDE the generator's ring, and its wall-HEAL step opens the generator's
  // wall course, which measurably breached the section-4 seal on 2/12 seeds. Two writers of one piece of
  // shared geometry get consolidated, never stacked.
  let _heartRingCarved = false;
  // Same one-writer rule for the WEST WING. _buildSection0 carves the dressing room / manager's office / [REF#DG-00050]
  // vault in compact space; the adapter's post-hoc stamp paints an older two-room version of the same
  // wing at the same coordinates. Whichever one runs, the other must stand down — two writers of one
  // piece of shared geometry get consolidated, never stacked.
  let _sec0WingCarved = false;
  // LOCKED DOORS: compact-space 'gx,gy' → the sign that hangs on it. Same trick as _storeDoors — the [REF#DG-00051]
  // generator marks the tile, the adapter reads the mark when it emits the door, so no door-emission
  // code has to know what a manager's office is. Cleared per generation in genCompact; a stale entry
  // would otherwise lock a random door on the next floor.
  // DOORS THAT MUST ACTUALLY BE DOORS: compact-space 'gx,gy' whose panel is NOT left to the ~32%
  // `panelless` roll. Mark asked for a door west and east at the crossing (2026-08-04); a door that is
  // an open archway one game in ten is not a door he asked for. Cleared per generation in genCompact.
  // HALF-HEIGHT COUNTER WALL: compact-space 'gx,gy' of WALL tiles the engine must draw at waist height
  // instead of full height. Mark 2026-08-05: "only a half high thin wall between room and entrance for
  // coat check and counter". The tile stays a WALL — you cannot walk through a counter — only its RENDER
  // is cut down, so collision, LOS occlusion and pathing are all untouched. Cleared per generation.
  let _counterWallTiles = new Set();
  // Compact-space 'gx,gy' of the four-way CROSSING door tiles. The engine reads the stamped tile flag [REF#DG-00052]
  // to give these the cabaret's carved Door-1.png leaf instead of the generic plank double door
  // (Mark 2026-08-05: "make same as caberet doors"). Cleared per generation like the rest.
  let _crossDoorTiles = new Set();
  let _fixedPanelDoors = new Set();
  let _lockedDoors = new Map();
  let _sectionGateTiles = new Map();   // compact-space 'gx,gy' of a sealed gate DOOR tile → { gateIndex, sectionFrom, sectionTo } (adapter tags it sectionGate + FIXED panel, like the store trick) [REF#DG-00053]
  let _ringSectionOf = new Map();      // compact-space 'gx,gy' of EVERY ring CORR tile → section index 1..4 (clockwise from entry: N=1,E=2,S=3,W=4) [REF#DG-00054]
  let _segmentGateTiles = new Map();   // compact-space double-door tiles → { gateIndex, segmentFrom, segmentTo } [REF#DG-00055]
  let _spineSegmentOf = new Map();     // compact-space hall/stub tile → owning streamed segment [REF#DG-00056]
  let _segmentCount = 0;

  function fill(x0, y0, x1, y1, v) { for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) if (T[i] && T[i][j] !== undefined) T[i][j] = v; }
  function carve(x, y, w, h, type) {
    const r = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), type };
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) T[i][j] = (i === x || i === x + w - 1 || j === y || j === y + h - 1) ? WALL : FLOOR;
    rooms.push(r); return r;
  }
  // KONBINI STORE (Mark 2026-06-26): carve ONE 'store' room flush SOUTH of the landing and link it with a SINGLE [REF#DG-00057]
  // door at the landing's midpoint column. FIXED geometry → ZERO _rand() draws for placement (deterministic).
  // Landing is [LANDX..LANDX+LANDW-1] × [LANDY..LANDY+LANDH-1]; store sits at (LANDX+1, LANDY+LANDH+1) leaving a
  // 1-tile corridor gutter at y=LANDY+LANDH between them (door rule OK; type 'store' is intentionally NOT exempt
  // in doorRuleViolations()).
  //
  // STOREFRONT (Mark 2026-08-06): "we can have a large storefront room to house this in, so people can see the
  // outside too" — the room now holds the 7_eleven building (assets/models/rooms/7_eleven), so it needs the
  // building's footprint at the back PLUS standoff in front to read the facade from. 5×5 was the prototype size
  // and could only ever be an interior. Default is now 10×12: building against the south wall, ~6 tiles of
  // "street" in front of it, entered from the north.
  //
  // ⚠ TWO TRAPS, both of which bite silently if you change the size:
  //  1. THE DOOR IS NOT THE STORE'S CENTRE. The old line read `_scx = STOREX + (STOREW >> 1)` and its comment
  //     claimed "= LANDX+3 = landing midpoint". That was only true BECAUSE STOREW happened to be 5 — a derived
  //     constant that reads like a free parameter. Any width change walked the store door off the landing door
  //     and broke the pair. `_scx` is now pinned to the landing midpoint directly and is width-independent, so
  //     the room grows EAST around a fixed door. Byte-identical at STOREW=5; correct at every other width.
  //  2. THE ROOM GROWS **WEST**, NEVER EAST — measured, not assumed. A 12-trial × 20-size matrix
  //     (scratch harness, seeds 1000+7919n) says width 5 generates 12/12 and width **6 or more fails 12/12**,
  //     deterministically, at EVERY depth (5/8/10/12 identical). Depth is entirely free — it never failed once.
  //     The store's east wall sits at the landing's east edge (x=8 at LANDX=3,LANDW=6) and column 9 is the
  //     cabaret's east-door column DDX; anything reaching it starves the body placer, whose failed rects are
  //     discarded WHOLE and can drop `dung.length` under its floor of 12, failing the entire generation.
  //     So: pin the EAST edge to the landing's east edge and extend WEST. Byte-identical at STOREW=5
  //     (STOREX still lands on LANDX+1). Growing west buys exactly ONE tile: W=6 generates 12/12, W=7 fails
  //     12/12 because it reaches x=2 = CABX, the cabaret's own west column. So the store's envelope is
  //     x 3..8 — SIX WIDE, HARD — and the room can only get bigger by getting DEEPER, which is free.
  //     A konbini is a narrow deep shop anyway, and depth is what buys the standoff to read the facade from.
  //     ⚠ If a genuinely WIDE storefront is ever wanted, it cannot live in the head — it would have to be
  //     carved in the dungeon BODY (x >= DX0 = 14) and give up being flush south of the landing.
  // Knobs: window._storeRoomW / window._storeRoomH. Prototype size back = window._storeRoomW=5,_storeRoomH=5.
  function _carveKonbini(LANDX, LANDY, LANDW, LANDH) {
    const _W = (typeof window !== 'undefined' && window) || {};
    const STOREY = LANDY + LANDH + 1;
    const _eastEdge = LANDX + LANDW - 1;                       // = 8 — the hard wall; column 9 is DDX (see trap 2) [REF#DG-00058]
    const _maxW = Math.max(5, _eastEdge - LANDX + 1);          // = 6 — grow west only to LANDX; x=2 is CABX and fails [REF#DG-00059]
    const _maxH = Math.max(5, (GH - 2) - STOREY);              // and never off the south grid edge [REF#DG-00060]
    const STOREW = Math.min((typeof _W._storeRoomW === 'number') ? _W._storeRoomW : 6, _maxW);
    const STOREH = Math.min((typeof _W._storeRoomH === 'number') ? _W._storeRoomH : 14, _maxH);
    const STOREX = _eastEdge - STOREW + 1;                     // east edge pinned; = LANDX+1 when STOREW is 5 [REF#DG-00061]
    carve(STOREX, STOREY, STOREW, STOREH, 'store');
    // ⛔ SUPERSEDED 2026-09-12 (A3b tiered head): "landing midpoint" — under the 2-wide entrance hall the store is [REF#DG-02024]
    //    5 wide and hangs one column WEST of the hall (STOREX = LANDX-1), so the hall's midpoint is no longer the
    //    store's; the door rule (_wallDoorsOk) wants a lone door ON the store's own midpoint, and it rerolled
    //    2000/2000 with the old column. The STORE's midpoint is used now: byte-identical for the 6-wide landing
    //    (STOREX = LANDX, STOREW 6 → LANDX+3, the old value) and inside the hall's interior for the 4-wide one.
    const _scx = STOREX + (STOREW >> 1);                       // store midpoint column [REF#DG-00062]
    T[_scx][LANDY + LANDH - 1] = DOOR;                          // landing SOUTH wall → door [REF#DG-00063]
    T[_scx][LANDY + LANDH]     = CORR;                          // 1-tile corridor gutter between landing & store [REF#DG-00064]
    T[_scx][STOREY]            = DOOR;                          // store NORTH wall → door [REF#DG-00065]
    doorList.push([_scx, LANDY + LANDH - 1], [_scx, STOREY]);
    _storeDoors.add(_scx + ',' + (LANDY + LANDH - 1)); _storeDoors.add(_scx + ',' + STOREY);   // mark both store door tiles → adapter gives them a fixed panel (no _rand draw) [REF#DG-00066]
    return { x: STOREX, y: STOREY, w: STOREW, h: STOREH };
  }
  // ── CABARET SOUTH ENTRANCE — ONE DEFINITION, FOUR GENERATORS ──────────────────────────────────────────────── [REF#DG-00067]
  //    Mark 2026-07-19: "caberet doors on levels 2+ should be double tile — fix map generation rules for both
  //    entrances and exits and how that impacts dungeon map generation."
  //
  //    THE ASYMMETRY: the cabaret's EAST EXIT has always been two tiles (`T[DDX][DDY]` + `[DDY+1]`, feeding the
  //    2-wide vestibule and main hall). Only this SOUTH ENTRANCE was a single column, so on L2+ you left through
  //    a double doorway and came back in through a slot. Floor 1 never showed it — its entrance is a 2-wide OPEN
  //    gap (the `_l1Open` loop) — which is why the fault only ever appeared on procedural floors.
  //
  //    WHY THIS IS A FUNCTION: the carve was COPY-PASTED into all four generator variants (buildDungeon,
  //    _buildSpine, _buildWorkerHalls, _buildRing). I widened one and the probe still measured southWidth 1,
  //    because L2+ was running a different variant. Four copies of a rule is four chances to drift; there is
  //    now one. Do not re-inline it.
  //
  //    IMPACT ON MAP GENERATION (checked, not assumed):
  //    · doorRuleViolations() enforces "≤1 door per wall at the midpoint" but explicitly `continue`s on room
  //      types 'cabaret' and 'landing' (~line 100) — the same exemption the east double door already relies on.
  //      No rule is widened here.
  //    · FITS BOTH ROOMS: landing spans CABX+1 … CABX+6 (LANDX, LANDW 6); cabaret spans CABX … CABX+11 (CABW 12).
  //      Columns CABX+3 and CABX+4 are interior to both, so no wall is breached on either side.
  //    · The CORRIDOR between them is widened too — a 2-wide door feeding a 1-wide corridor just moves the pinch
  //      one tile south.
  //    · Deterministic: fixed columns, ZERO _rand() draws → seeds and save-compat unchanged.
  //    · Engine-side registration is by SCAN (Engine9 _cabDoorTiles ~5664 walks for DOOR tiles), so the second
  //      leaf registers itself — collider, missile blocking and the A* cabaret-door rule all follow for free.
  //    Revert to a single leaf: window._cabDoorDouble = false.
  //    ORIGIN-AWARE (2026-08-03): ox/oy default to CABX/CABY, so every existing caller is byte-identical.
  //    _carveHead passes a translated origin when the head is placed somewhere other than the pinned
  //    top-left corner — see the note on _carveHead for why that became necessary.
  function _carveCabEntrance(LANDY, ox = CABX, oy = CABY, lcx = null) {
    const _lcx = (lcx == null) ? ox + 3 : lcx;               // shared column (interior to both rooms); the tiered head passes its hall's west interior column (2026-09-12) [REF#DG-00068]
    const _double = !(typeof window !== 'undefined' && window._cabDoorDouble === false);
    const _cols = _double ? [_lcx, _lcx + 1] : [_lcx];
    for (const _c of _cols) {
      T[_c][oy + CABH - 1] = DOOR; T[_c][oy + CABH] = CORR; T[_c][oy + CABH + 1] = CORR; T[_c][LANDY] = DOOR;
      doorList.push([_c, oy + CABH - 1], [_c, LANDY]);
    }
  }

  // ── THE HEAD — ONE DEFINITION (Mark 2026-08-03: "fix it so there are 4 sections section 0 includes the [REF#DG-00069]
  //    room 1 hallway and room2 caberet - it is the center of all sections").
  //
  //    WHY THIS EXISTS. The head — cabaret (engine room id 1) + landing (id 0) + the L2+ konbini + the east
  //    2-tile door — was COPY-PASTED into five generators, each carrying the warning that all five "MUST stay
  //    identical". They did not: _buildQuadrant authored its OWN head at x27, which is exactly how it
  //    "relocated/resized room 0+1 and dropped the konbini" and earned its 2026-07-25 HOLD. This is the same
  //    lesson _carveCabEntrance already records one function above — four copies of a rule is four chances to
  //    drift — applied to the thing the copies were wrapped around. Do not re-inline it.
  //
  //    TRANSLATED, NOT RE-AUTHORED. Mark's "centre of all sections" cannot hold while the head is pinned to
  //    CABX=2, CABY=6 — a corner cannot be a centre. So the head takes an ORIGIN. Every room size, every door
  //    column, the konbini and their relative offsets are the canonical values verbatim; only where the whole
  //    assembly sits changes. That keeps his standing "never move room 0/room 1/konbini" rule intact in the
  //    sense that matters: nothing is resized, nothing is dropped, and the treasured Floor-1 cabaret is the
  //    same 5×6 thin-walled room it has been since 2026-07-18.
  //
  //    Defaults to the pinned corner, so a caller that passes nothing gets byte-identical output.
  //    Returns the head's geometry so a generator can lay its own topology around it.
  //    THE FLOOR-1 LANDING GAP IS THE CALLER'S, NOT A CONSTANT (2026-08-04). `_L1GAP` is the distance
  //    from the cabaret's south wall to the landing's north wall, and the ONLY correct value is the one
  //    that puts the landing flush under the enclosing ring's outer band — which only the generator
  //    drawing that ring knows. It was hard-coded 8 for the wing-driven enclosure and had already been
  //    re-tuned once (3 -> 8) when the backstage grew southward; the backstage has now moved north, so a
  //    constant here would need a third hand-edit in one day. Default 8 keeps every existing caller
  //    byte-identical.
  function _carveHead(ox = CABX, oy = CABY, l1LandGap = 8) {
    if (_genLevel === 1) {
      // FLOOR-1 CABARET 5×6 (Mark 2026-07-18 "shorten caberet by 1 tile row to the North … remove 1 tile row [REF#DG-00070]
      // on the west"). North + west edges move in; south junction + east wall hold.
      // ── +1 TILE WEST (Mark 2026-08-14: "increase size of caberet 1tile to the west") ──────────────
      //    This REVERSES his own 2026-07-18 "remove 1 tile row on the west" and it TOUCHES THE LEVEL
      //    HEAD, which his standing rule says never to move — so it is written loudly rather than
      //    slipped in. Only the WEST edge moves: the east wall, both its doors and the south junction
      //    are byte-identical, because DDX is derived (L1X-1) + (CABW+1) - 1 = the same column it was.
      //    The landing keeps its OWN column (HX below is pinned to ox+1, not to L1X) so widening the
      //    cabaret cannot drag the entrance corridor west with it.
      //    ⚠ GUARDED, NOT ASSUMED. The head is carved inside the heart's enclosure and the backstage
      //      wing lives in the same neighbourhood; if the two columns this needs (the new floor column
      //      and the new wall column west of it) are not free rock, it stays 5 wide and says so in the
      //      console rather than carving through whatever is already there.
      //    ⚠ THE STAGE FOLLOWS THE ROOM, BY DESIGN. Engine9 anchors the stage origin — and with it the
      //      treasured Caberet.glb, the panel stage and Starlette's spot — to the room CENTRE (~:22492),
      //      so the whole scene shifts half a tile west together. Nothing is stretched or re-fitted.
      //    Off: global._cabWiden = false (back to the 5-wide 07-18 room).
      let _cabW1 = (global._cabWiden === false) ? 0 : 1;
      if (_cabW1) {
        const _newFloorX = ox, _newWallX = ox - 1;
        for (let j = oy; j <= oy + 6 + 1 && _cabW1; j++) {
          for (const _x of [_newFloorX, _newWallX]) {
            const _t = (T[_x] && T[_x][j]);
            if (_t !== ROCK && _t !== WALL) { _cabW1 = 0; break; }
          }
        }
        if (!_cabW1) { try { console.warn('[HEAD] cabaret stayed 5 wide — the two columns west of it are not free. Off: global._cabWiden=false'); } catch (_) {} }
      }
      const L1X = ox + 1 - _cabW1, L1Y = oy + 1;
      CABW = 5 + _cabW1; CABH = 6;
      DDX = L1X + CABW - 1; DDY = L1Y + 2;   // DDX holds by itself (+1 origin cancels -1 width); DDY re-based so the east door does not slide south [REF#DG-00071]
      carve(L1X, L1Y, CABW, CABH, 'cabaret');
      for (let i = L1X; i < L1X + CABW; i++) for (let j = L1Y; j < L1Y + CABH; j++) T[i][j] = FLOOR;   // thin-wall Floor-1 cabaret [REF#DG-00072]
      // ROOM 0 = 7 TILES (Mark 2026-08-04: "the 7-tile room 0 leads into the 2-tile hallway" — supersedes [REF#DG-00073]
      // his 07-31 twelve, then the 10 that shipped). interior = HW-2 × HH-3; the 07-31 measurement holds:
      // HH 10 gives 2×7 (probe-room0-choice prints the real span every run). _buildSection0 opens its
      // dead-end SOUTH wall into the ring — the mouth carve lives there, not here.
      // ⚠ THE LANDING SITS OUTSIDE THE HEART'S RING (Mark 2026-08-04, his labelled drawing, 4th pass:
      //    "room 1 entrance isnt directly connected to caberet as I want"). It used to butt straight
      //    onto the cabaret's south wall, INSIDE the enclosure — so the ring had to wrap around it and
      //    the player walked cabaret -> ten tiles of landing -> doors -> ring. In the drawing the
      //    cabaret's south double doors open onto the RING BAND, and the entrance corridor rises from
      //    the south to meet that same band: one crossing, not a room in between.
      //    So the landing drops by _L1GAP = wall row + 2 band rows, and _buildSection0 closes the
      //    enclosure on the CABARET instead of the head bbox. The two double-doors that bridge it are
      //    punched there (the band does not exist yet at this point in the carve).
      // 8, not 3: the enclosure's south wall is driven by the BACKSTAGE WING (cabY+11), not by the
      // cabaret's own bottom (cabY+6) — at 3 the landing landed on top of the wall course and the
      // band, and the axis check failed 2000/2000. Landing top = wing bottom + wall + 2 band rows.
      const _L1GAP = l1LandGap;
      // HX PINNED TO ox+1, NOT L1X (2026-08-14): L1X now moves west with the widened cabaret, and the [REF#DG-00074]
      // landing must NOT travel with it — it is the entrance corridor the player arrives through, and
      // its column is load-bearing for the section-0 ring the enclosure closes around.
      const HW = 4, HH = 10, HX = ox + 1, HY = L1Y + CABH + _L1GAP;
      carve(HX, HY, HW, HH, 'landing');
      T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]);
      return { ox, oy, cabX: L1X, cabY: L1Y, cabW: CABW, cabH: CABH,
               landX: HX, landY: HY, landW: HW, landH: HH, DDX, DDY, konbini: null };
    }
    CABW = 12; CABH = 10; DDX = ox + CABW - 1; DDY = oy + 3;
    carve(ox, oy, CABW, CABH, 'cabaret');
    const LANDX = ox + 1, LANDY = oy + CABH + 2, LANDW = 6, LANDH = 8;   // Mark 2026-07-02: entry landing stretched to a long hallway [REF#DG-00075]
    carve(LANDX, LANDY, LANDW, LANDH, 'landing');
    _carveCabEntrance(LANDY, ox, oy);                       // 2-wide cabaret south entrance [REF#DG-00076]
    // _carveKonbini already derives everything from the LANDING rect, so it needed no origin change — [REF#DG-00077]
    // it travels with the head for free. It is dedicated to Mark's parents; it ships on every L2+ head.
    const _kon = _carveKonbini(LANDX, LANDY, LANDW, LANDH);
    T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]);
    return { ox, oy, cabX: ox, cabY: oy, cabW: CABW, cabH: CABH,
             landX: LANDX, landY: LANDY, landW: LANDW, landH: LANDH, DDX, DDY, konbini: _kon };
  }
  function clearArea(x, y, w, h) { for (let i = x - 1; i < x + w + 1; i++) for (let j = y - 1; j < y + h + 1; j++) { if (i < 0 || j < 0 || i >= GW || j >= GH) continue; if (T[i][j] !== ROCK) return false; } return true; }
  // ── SHARED-WALL CLEARANCE (Mark 2026-08-17) ──────────────────────────────────────────────────────── [REF#DG-00078]
  //    "i want you to reimagine our thin wall system, where only one wall pane seperates a room from
  //     another like a typical building."
  //    clearArea() above demands a 1-tile ROCK border, and carve() rings every room in its own WALL
  //    tiles, so interior-to-interior has ALWAYS been wall|rock|wall = 3 tiles. The thin-wall renderer —
  //    which was BUILT for rooms that tile directly adjacent — then quite correctly draws a perimeter
  //    pane on EACH face, 2.0 apart, with dead space between. That is the "walls jut out / malformed"
  //    Mark is looking at, and a previous seat measured it and wrote it up at Engine9 ~:8813 before
  //    deciding to patch the RENDER path instead. Mark has now overruled that call.
  //    MEASURED BEFORE THIS CHANGE (seeds 7/42/99/123/777): 34 one-tile separations per floor,
  //    seed-invariant, EVERY ONE of them in the hand-authored heart. The section packer had never
  //    produced a shared wall on any seed, so _mergeSharedWalls (Engine9 ~:8834) — which only fires at
  //    exactly-1-tile separation — had nothing in the sections to merge.
  //    ⚠ THIS PREDICATE IS DIFFERENT IN KIND, NOT MERELY LOOSER. It drops the border ring entirely and
  //      instead asks of the room's OWN footprint that the PERIMETER be ROCK **or an existing WALL** (a
  //      neighbour's wall course, which carve() then rewrites idempotently — see :85), while the
  //      INTERIOR must still be virgin ROCK. That interior test is the whole safety: it remains
  //      impossible to carve through another room's floor.
  //    ⚠ The perimeter accepts ROCK/WALL and NOTHING else — never CORR/DOOR/FLOOR — so a room still
  //      cannot be seated on a hallway, and the "no CORR orthogonally touching room FLOOR" structural
  //      gate below keeps passing untouched.
  //    Off: window._sharedWalls = false → falls straight through to clearArea (pre-08-17 behaviour).
  //    Deliberately a SEPARATE function: clearArea has 11 callers across 6 generators and floor 1 is
  //    being proved first. Porting _buildLHalls (floors 2+) is a later, measured step.
  function clearAreaShared(x, y, w, h) {
    const _Ws = (typeof window !== 'undefined' && window) || {};
    // ⚠ DEFAULT FLIPPED TO OPT-IN 2026-08-29 (Mark: "bring it all back"). Shared walls landed 08-17, [REF#DG-01188]
    //    AFTER the 2026-08-15 public cut, and the packer step they change is what moves every section
    //    room. Restoring the shipped floor means restoring the shipped packer. On: window._sharedWalls = true.
    if (_Ws._sharedWalls !== true) return clearArea(x, y, w, h);
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) {
      if (i < 0 || j < 0 || i >= GW || j >= GH) return false;
      const t = T[i][j];
      if (i === x || i === x + w - 1 || j === y || j === y + h - 1) { if (t !== ROCK && t !== WALL) return false; }
      else if (t !== ROCK) return false;
    }
    return true;
  }
  function doorOf(r, tx, ty) {
    if (Math.abs(tx - r.cx) >= Math.abs(ty - r.cy)) { const e = tx > r.cx; return { x: e ? r.x + r.w - 1 : r.x, y: r.cy, ox: e ? 1 : -1, oy: 0 }; }
    const s = ty > r.cy; return { x: r.cx, y: s ? r.y + r.h - 1 : r.y, ox: 0, oy: s ? 1 : -1 };
  }
  // WHICH WALL of room r faces the point (tx,ty). Hoisted here 2026-08-05 so the SECTION generator's MST [REF#DG-00079]
  // can use it; buildDungeon (~:345) and _buildRing (~:1239) each still declare a byte-identical local
  // that shadows this one, so neither changes behaviour. ⚠ IT TAKES COORDINATES: buildDungeon calls it
  // sideOf(a, c) with the room OBJECT as tx, which makes its side penalty inert. Pass c.cx, c.cy.
  const sideOf = (r, tx, ty) => { const d = doorOf(r, tx, ty); return d.ox > 0 ? 'E' : d.ox < 0 ? 'W' : d.oy > 0 ? 'S' : 'N'; };
  function joinLen(a, b) {
    const pa = doorOf(a, b.cx, b.cy), pb = doorOf(b, a.cx, a.cy);
    return Math.abs((pa.x + pa.ox) - (pb.x + pb.ox)) + Math.abs((pa.y + pa.oy) - (pb.y + pb.oy));
  }
  function joinPath(a, b) {
    const pa = doorOf(a, b.cx, b.cy), pb = doorOf(b, a.cx, a.cy);
    const x0 = pa.x + pa.ox, y0 = pa.y + pa.oy, tx = pb.x + pb.ox, ty = pb.y + pb.oy;
    // Try one orientation without mutating T. X-first gives horizontal corridors (fewer perceived turns). [REF#DG-00080]
    const tryPath = (xFirst) => {
      let x = x0, y = y0; const path = [];
      const step = () => { const t = T[x] ? T[x][y] : undefined; if (t === undefined || t === CORR || t === DOOR || t === FLOOR) return false; path.push([x, y]); return true; };
      if (!step()) return null;
      const sx = () => { while (x !== tx) { x += Math.sign(tx - x); if (!step()) return false; } return true; };
      const sy = () => { while (y !== ty) { y += Math.sign(ty - y); if (!step()) return false; } return true; };
      return (xFirst ? (sx() && sy()) : (sy() && sx())) ? path : null;
    };
    const path = tryPath(true) || tryPath(false);  // X-first (straight); Y-first fallback if blocked [REF#DG-00081]
    if (!path) return false;
    T[pa.x][pa.y] = DOOR; T[pb.x][pb.y] = DOOR; doorList.push([pa.x, pa.y], [pb.x, pb.y]);
    for (const p of path) T[p[0]][p[1]] = CORR; return path;
  }
  // DOOR RULE: ≤1 door per wall side, each a single tile at that wall's MIDPOINT (cx for N/S, cy for E/W) [REF#DG-00082]
  // ── A CENTRED ADJACENT PAIR IS ONE DOORWAY, NOT TWO DOORS (2026-08-05) ──────────────────────────
  //    Mark asked the guard room for "the same double doors" as the crossing. A double door is two DOOR
  //    tiles side by side, which the old counting read as "two doors on one wall" and rejected — so the
  //    room could only ever have a single-tile paper door, which is the thing he did not want.
  //    Rather than exempt the guard room (an escape hatch that would also excuse a genuine mistake on
  //    that room forever, the way `type === 'cabaret'` does), the RULE now understands double doors:
  //    exactly two DOOR tiles that are ADJACENT and straddle the wall's midpoint count as one doorway
  //    at the midpoint. Three doors, two apart, or a pair off-centre are all still violations.
  //    Deliberately general: double doors are now a first-class thing in this dungeon, so every wall
  //    gets the same reading and no future one needs its own exemption.
  const _wallDoorsOk = (coords, mid) => {
    if (coords.length === 0) return true;
    if (coords.length === 1) return coords[0] === mid;
    if (coords.length !== 2) return false;
    const [a, b] = coords.slice().sort((p, q) => p - q);
    if (b - a !== 1) return false;              // two doors with a gap = two doors, not a double door [REF#DG-00083]
    return (a === mid || b === mid);            // and the pair must sit ON the midpoint, not beside it [REF#DG-00084]
  };
  function doorRuleViolations() {
    let v = 0;
    for (const r of rooms) {
      if (r.type === 'cabaret' || r.type === 'landing') continue;
      const N = [], S = [], E = [], W = [];
      for (let x = r.x; x < r.x + r.w; x++) { if (T[x][r.y] === DOOR) N.push(x); if (T[x][r.y + r.h - 1] === DOOR) S.push(x); }
      for (let y = r.y; y < r.y + r.h; y++) { if (T[r.x][y] === DOOR) W.push(y); if (T[r.x + r.w - 1][y] === DOOR) E.push(y); }
      if (!_wallDoorsOk(N, r.cx) || !_wallDoorsOk(S, r.cx) || !_wallDoorsOk(W, r.cy) || !_wallDoorsOk(E, r.cy)) v++;
    }
    return v;
  }

  // build one compact dungeon; returns {start, casino} on success or false (gates failed → caller retries) [REF#DG-00085]
  function buildDungeon() {
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK)); rooms = []; doorList = []; mhTiles = new Set(); _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map(); _spineSegmentOf = new Map(); _segmentCount = 0;
    // HEAD per level (Mark 2026-06-19 "keep Room 1 + Room 2, procedural past them"): Floor 1 keeps the treasured [REF#DG-00086]
    // 6×6 cabaret + a narrow start-HALLWAY landing (the ad posters line it); L2+ use the 8×7 cabaret + 6×5 landing.
    _l1Open = [];
    if (_genLevel === 1) {
      // FLOOR 1 (Mark 2026-06-19): treasured 6×6 cabaret + a 2-wide × 7-long OPEN start HALLWAY directly south of [REF#DG-00087]
      // it — NO door at all (you see Starlette on stage straight down the hall). The shared wall is opened to a
      // pure gap; the adapter marks it .doors so the engine draws no boundary pane / frame / panel.
      // ── FLOOR-1 CABARET SHRUNK (Mark 2026-07-18: "shorten caberet by 1 tile row to the North … remove 1 tile row
      // on the west" — "its got too much empty space for a small caberet"). 6×7 → 5×6.
      // The NORTH edge (the stage side) moves +1 south and the WEST edge moves +1 east; the SOUTH junction row and
      // the EAST wall must NOT move — the hallway mouth, the open gap tiles and the east dungeon door all hang off
      // them. CABX/CABY themselves stay untouched (they are module consts shared with the L2+ and spine generators);
      // these are FLOOR-1-LOCAL effective origins only.
      const L1X = CABX + 1, L1Y = CABY + 1;   // shrink from the west + north [REF#DG-00088]
      CABW = 5; CABH = 6;
      // PINNED so the shrink is invisible outside the room: [REF#DG-00089]
      //   DDX = L1X + CABW - 1 = 7  (unchanged: +1 origin cancels the -1 width) — east dungeon door holds by itself.
      //   DDY was CABY + 3; with the origin +1 that expression would slide the door 1 south, so it is re-based to +2.
      DDX = L1X + CABW - 1; DDY = L1Y + 2;
      carve(L1X, L1Y, CABW, CABH, 'cabaret');                                             // cabaret id 1 → x3-7, y7-12 [REF#DG-00090]
      for (let i = L1X; i < L1X + CABW; i++) for (let j = L1Y; j < L1Y + CABH; j++) T[i][j] = FLOOR;  // THIN-WALL (Mark 2026-06-19): drop the cabaret's NetHack wall RING → the WHOLE room is id-1 FLOOR. Now the emitted bounds = the floor extent (matches the hand-authored cabaret), so the engine draws id1↔void perimeter PANES that the medallion wall-panels cover (no generic wall tiles in front), and the wallpaper/clerestory/stage-anchor/brand-marquee math (all keyed off these bounds) lands right FOR FREE. The hallway below stays wall-tiled — its ad posters need wall tiles to line. [REF#DG-00091]
      // HY = L1Y + CABH - 1 = 12 — UNCHANGED by the shrink (the +1 origin and the -1 height cancel), so the junction [REF#DG-00092]
      // row stays exactly where it was. HX is re-based to L1X (was CABX + 1) for the same reason on the X axis: the
      // 2-wide hall must stay at x4-5, and letting it ride the shifted origin would have slid it 1 east.
      // ROOM 0 IS 7 TILES LONG (Mark 2026-08-04: "the 7-tile room 0 leads into the 2-tile hallway" —
      // supersedes his 07-31 "12 tiles long", then the 10 that shipped). MEASURED, not assumed: carve()
      // lays a wall ring, and probe-room0-choice reported the interior as 2 wide x 7 long at HH 10 — the
      // usable length is HH-3. Kept in lockstep with _carveHead's floor-1 branch (one ruling, two carves).
      // WIDTH IS DELIBERATELY UNCHANGED at 2 interior tiles: this is the entry corridor, and the room-0
      // choice (SINGING left wall / MIMIC right wall) is placed off the measured span, so it keeps working
      // at any width.
      const HW = 4, HH = 10, HX = L1X, HY = L1Y + CABH - 1;   /* interior = HW-2 x HH-3 = 2 x 7 */
      carve(HX, HY, HW, HH, 'landing');                                                     // start hallway id 0 (wall-tiled → ad posters line it) [REF#DG-00093]
      for (let x = HX + 1; x < HX + HW - 1; x++) { T[x][HY] = FLOOR; _l1Open.push([x, HY]); }  // OPEN the shared wall (x4-5) → cabaret-side gap tiles (roomId 1); adapter sets .doors=['S'] → pure open passage, stage visible straight down the hall [REF#DG-00094]
      T[L1X][HY] = WALL; T[L1X + CABW - 1][HY] = WALL;   // CLEAN STEP-OUT (Mark 2026-06-19, "keep the 2-tile hall"): wall off the 2 cabaret-floor CORNERS at the junction row that protrude past the narrow hall — they were injecting staggered intermediate wall-panes between the cabaret wall line and the hall wall line. The cabaret steps down to the 2-wide hall as ONE clean L, not a jagged double. [REF#DG-00095]
    } else {
      CABW = 12; CABH = 10; DDX = CABX + CABW - 1; DDY = CABY + 3;
      carve(CABX, CABY, CABW, CABH, 'cabaret');                                             // CABARET head → engine room id 1 (succubus + clerestory dress it) [REF#DG-00096]
      // LANDING (descend point: stairs_up + spawn) south of the cabaret → engine room id 0; opens north via a door [REF#DG-00097]
      const LANDX = CABX + 1, LANDY = CABY + CABH + 2, LANDW = 6, LANDH = 8;   // Mark 2026-07-02: entry landing stretched to a long hallway (was LANDH 5) [REF#DG-00098]
      carve(LANDX, LANDY, LANDW, LANDH, 'landing');
      _carveCabEntrance(LANDY);   // 2-wide cabaret entrance + widened link corridor — see _carveCabEntrance [REF#DG-00099]
      _carveKonbini(LANDX, LANDY, LANDW, LANDH);                                              // KONBINI STORE prototype — fixed 5×5 south of the landing, 1 door (zero placement RNG) [REF#DG-00100]
    }
    T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]);
    // 2-WIDE MAIN HALLWAY: 4-tile-deep vestibule extends east from the cabaret door before dungeon rooms start [REF#DG-00101]
    const VBLEN = 4; const vestibuleSet = new Set();
    for (let vx = DDX + 1; vx <= DDX + VBLEN; vx++) { T[vx][DDY] = CORR; T[vx][DDY + 1] = CORR; vestibuleSet.add(vx + ',' + DDY); vestibuleSet.add(vx + ',' + (DDY + 1)); }
    // NetHack rectangle subdivision → 12–18 walled rooms, each ≥5×5, capped at 9×9 [REF#DG-00102]
    const DX0 = DDX + VBLEN + 1; let rects = [{ x0: DX0, y0: 1, x1: GW - 2, y1: GH - 2 }];
    const want = 12 + ((_rand() * 7) | 0); const dung = []; let placed = 0, guard = 0;
    while (placed < want && guard++ < 8000) {
      const cand = rects.filter(r => r.x1 - r.x0 >= 6 && r.y1 - r.y0 >= 6); if (!cand.length) break;
      const rc = cand[(_rand() * cand.length) | 0], aW = rc.x1 - rc.x0 - 1, aH = rc.y1 - rc.y0 - 1; let w, h;
      w = 5 + ((_rand() * Math.max(1, aW - 4)) | 0); h = 5 + ((_rand() * Math.max(1, aH - 4)) | 0);
      w = Math.min(w, Math.min(9, aW)); h = Math.min(h, Math.min(9, aH));
      const x = rc.x0 + 1 + ((_rand() * Math.max(1, rc.x1 - rc.x0 - w)) | 0), y = rc.y0 + 1 + ((_rand() * Math.max(1, rc.y1 - rc.y0 - h)) | 0);
      if (w < 5 || h < 5 || x + w >= GW - 1 || y + h >= GH - 1 || !clearArea(x, y, w, h)) { rects = rects.filter(r => r !== rc); continue; }
      dung.push(carve(x, y, w, h, 'room')); placed++; rects = rects.filter(r2 => r2 !== rc);
      if (x - 2 > rc.x0) rects.push({ x0: rc.x0, y0: rc.y0, x1: x - 2, y1: rc.y1 }); if (x + w + 1 < rc.x1) rects.push({ x0: x + w + 1, y0: rc.y0, x1: rc.x1, y1: rc.y1 });
      if (y - 2 > rc.y0) rects.push({ x0: rc.x0, y0: rc.y0, x1: rc.x1, y1: y - 2 }); if (y + h + 1 < rc.y1) rects.push({ x0: rc.x0, y0: y + h + 1, x1: rc.x1, y1: rc.y1 });
    }
    if (dung.length < 12) return false;
    // cabaret door → nearest dungeon room: the entry link is the START of the main hall [REF#DG-00103]
    const start = dung.reduce((b, r) => { const L = Math.abs(r.cx - (DDX + VBLEN + 1)) + Math.abs(r.cy - DDY); return (!b || L < b.L) ? { r, L } : b; }, null);
    const pf = doorOf(start.r, DDX, DDY); if (Math.abs((DDX + VBLEN + 1) - (pf.x + pf.ox)) + Math.abs(DDY - (pf.y + pf.oy)) > 22) return false;
    const entryTiles = [];
    { let x = DDX + VBLEN + 1, y = DDY; const tx = pf.x + pf.ox, ty = pf.y + pf.oy;
      const stp = () => { const t = T[x] ? T[x][y] : undefined; if (t === undefined || t === CORR || t === DOOR || t === FLOOR) return false; entryTiles.push([x, y]); return true; };
      let ok2 = stp(); while (ok2 && x !== tx) { x += Math.sign(tx - x); ok2 = stp(); } while (ok2 && y !== ty) { y += Math.sign(ty - y); ok2 = stp(); }
      if (!ok2 || entryTiles.length > MAX_CORR + 8) return false; T[pf.x][pf.y] = DOOR; doorList.push([pf.x, pf.y]); for (const p of entryTiles) T[p[0]][p[1]] = CORR;
    }
    // BRANCHING tree off the cabaret: nearest free-side neighbour (soft side penalty avoids deadlock; door gates catch collisions) [REF#DG-00104]
    const sideOf = (r, tx, ty) => { const d = doorOf(r, tx, ty); return d.ox > 0 ? 'E' : d.ox < 0 ? 'W' : d.oy > 0 ? 'S' : 'N'; };
    const usedSide = new Map(dung.map(r => [r, new Set()])); usedSide.get(start.r).add(sideOf(start.r, DDX, DDY));
    const adj = new Map(dung.map(r => [r, []])); const inT = new Set([start.r]); const edges = [];
    while (inT.size < dung.length) {
      let best = null;
      for (const a of inT) for (const c of dung) {
        if (inT.has(c)) continue;
        const sa = sideOf(a, c), sc = sideOf(c, a); const pen = (usedSide.get(a).has(sa) || usedSide.get(c).has(sc)) ? 1000 : 0;
        const L = joinLen(a, c) + pen; if (!best || L < best.L) best = { a, c, L, sa, sc };
      }
      if (!best) return false;
      inT.add(best.c); usedSide.get(best.a).add(best.sa); usedSide.get(best.c).add(best.sc); edges.push(best);
    }
    for (const e of edges) { const p = joinPath(e.a, e.c); if (!p || p.length > MAX_CORR) return false; e.tiles = p; adj.get(e.a).push(e.c); adj.get(e.c).push(e.a); }
    // casino = the room deepest (most tree-hops) from the entry; stairs gated at the far end [REF#DG-00105]
    const hop = new Map([[start.r, 0]]); { const bq = [start.r]; while (bq.length) { const u = bq.shift(); for (const v of adj.get(u)) if (!hop.has(v)) { hop.set(v, hop.get(u) + 1); bq.push(v); } } }
    let casino = start.r; for (const e of hop) if (e[1] > hop.get(casino)) casino = e[0]; casino.type = 'casino';
    // STRUCTURAL GATE (branching allowed) [REF#DG-00106]
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; if (vestibuleSet.has(x + ',' + y)) continue; let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; } if (n >= 3) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== DOOR) continue; let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++; if (c !== 1) return false; }
    if (doorRuleViolations() > 0) return false;
    // designate the MAIN HALL = entry link + the cabaret→casino path through the tree [REF#DG-00107]
    for (const s of vestibuleSet) mhTiles.add(s);
    for (const p of entryTiles) mhTiles.add(p[0] + ',' + p[1]);
    { const par = new Map([[start.r, null]]); const q2 = [start.r]; while (q2.length) { const u = q2.shift(); for (const v of adj.get(u)) if (!par.has(v)) { par.set(v, u); q2.push(v); } }
      let cur = casino; while (par.get(cur) != null) { const pr = par.get(cur); const e = edges.find(e => (e.a === cur && e.c === pr) || (e.a === pr && e.c === cur)); if (e && e.tiles) for (const p of e.tiles) mhTiles.add(p[0] + ',' + p[1]); cur = pr; } }
    return { start: start.r, casino: casino, hop: hop };
  }

  // ── SPINE GENERATOR (Mark 2026-06-24: "longer 2-tile-wide MAIN HALLWAY out of the cabaret; rooms BRANCH OFF it [REF#DG-00108]
  //    — grand opening into the real dungeon"). A long straight 2-wide TRUNK runs EAST from the cabaret door; dungeon
  //    rooms sit FLUSH along both sides of it and each opens ONE midpoint door onto the trunk via a 1-tile stub.
  //    Reuses carve/doorOf/doorRuleViolations + the SAME structural gates (the trunk is exempted from the junction
  //    gate exactly like the old vestibule). This is the streamed default on every floor; global._spineMap === false
  //    restores the legacy whole-floor branching generator for diagnostics.
  function _buildSpine() {
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK)); rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map(); _spineSegmentOf = new Map(); _segmentCount = 0;
    // HEAD — identical to buildDungeon: cabaret id1 + landing id0 + the east 2-tile door (the mouth the dungeon hangs off) [REF#DG-00109]
    if (_genLevel === 1) {
      // FLOOR-1 CABARET SHRUNK 6x7 -> 5x6 (Mark 2026-07-18 "shorten caberet by 1 tile row to the North … remove 1 [REF#DG-00110]
      // tile row on the west"). See the canonical note in buildDungeon() — this block is duplicated across all 4
      // generators and MUST stay identical in every one. North + west edges move in; south junction + east wall hold.
      const L1X = CABX + 1, L1Y = CABY + 1;
      CABW = 5; CABH = 6;
      DDX = L1X + CABW - 1; DDY = L1Y + 2;   // DDX holds by itself (+1 origin cancels -1 width); DDY re-based so the east door does not slide south [REF#DG-00111 → see REF#DG-00071]
      carve(L1X, L1Y, CABW, CABH, 'cabaret');
      for (let i = L1X; i < L1X + CABW; i++) for (let j = L1Y; j < L1Y + CABH; j++) T[i][j] = FLOOR;
      const HW = 4, HH = 13, HX = L1X, HY = L1Y + CABH - 1;   /* ENTRY HALLWAY = 10 LONG (Mark 2026-07-31, revised down from 12). interior = HW-2 x HH-3 = 2 x 10. MEASURED, not assumed: HH 10 gave 2x7, HH 15 gave 2x12. This head is duplicated across ALL FIVE generators and MUST stay identical — a probe caught HH changed in one copy doing nothing, because the RING generator (the live default) carries its own copy. */   // HY unchanged (origin/height cancel); HX re-based to keep the 2-wide hall at x4-5
      carve(HX, HY, HW, HH, 'landing');
      for (let x = HX + 1; x < HX + HW - 1; x++) { T[x][HY] = FLOOR; _l1Open.push([x, HY]); }
      T[L1X][HY] = WALL; T[L1X + CABW - 1][HY] = WALL;
    } else {
      CABW = 12; CABH = 10; DDX = CABX + CABW - 1; DDY = CABY + 3;
      carve(CABX, CABY, CABW, CABH, 'cabaret');
      const LANDX = CABX + 1, LANDY = CABY + CABH + 2, LANDW = 6, LANDH = 8;   // Mark 2026-07-02: entry landing stretched to a long hallway (was LANDH 5) [REF#DG-00112 → see REF#DG-00098]
      carve(LANDX, LANDY, LANDW, LANDH, 'landing');
      _carveCabEntrance(LANDY);   // 2-wide cabaret entrance + widened link corridor — see _carveCabEntrance [REF#DG-00113 → see REF#DG-00099]
      _carveKonbini(LANDX, LANDY, LANDW, LANDH);                                              // KONBINI STORE prototype — same fixed 5×5 store off the landing (spine path is the LIVE default) [REF#DG-00114]
    }
    T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]);
    // TRUNK — straight 2-wide corridor east from the cabaret door to near the grid edge. spineSet exempts it from the junction gate. [REF#DG-00115]
    // ── SEED-VARIED SPINE KNOBS (Mark 2026-07-25 "each game random — it should be each game is random") ───────────────────────────
    // The old spine pinned every floor: FIXED trunk length (GW-3), rooms in two mirror-aligned FLUSH rows, FIXED 1-tile gap. Seeds
    // only nudged room W/H, so the gross gestalt (cabaret → straight corridor → two rooms rows → casino) was identical every game —
    // the "exact same dungeon" the player reported. These knobs restore genuine variety WITHOUT breaking the streamed-segment
    // contract (a single straight trunk that gates still partition → architectural culling untouched, per the 2026-07-15 register):
    //   · trunkPull  — east end retreats 0..N tiles → floor SIZE + room budget vary (was fixed GW-3).
    //   · gap/jit/skip — per-side random start offset, 1..N-tile gaps, occasional bare-corridor stretch → the two rows de-correlate,
    //     go gappy and asymmetric; no two seeds pack the trunk alike.
    //   · recess     — each room sits back 0..N tiles behind a longer straight stub → ragged walls + varied N-S depth. The variety
    //     is VERTICAL: narrow rooms keep the trunk's horizontal capacity (room count never drops below the min two-segment floor),
    //     while recess + height spread exploit the ~32 tiles of SOUTH space the old one-flush-row spine wasted.
    // All keep the SAME single-door-at-cx stub geometry the chunking / neck-gate / geometric-segment / doorRule logic depends on.
    // L1 is the CURATED, filmed golden path (greeters + starter cards + treasured cabaret) and was already the most varied floor, so
    // it is left BYTE-IDENTICAL to the old generator (every lever 0 → same RNG stream, same layout). Only the PROCEDURAL floors
    // (L2+) — where the sameness actually lived — are varied. Killswitch: window._spineVary===false → old fixed skeleton, all floors.
    // Tunable live via window._spineKnobs (per-field overrides). Change L1 only on Mark's ask.
    const _vary = !(typeof window !== 'undefined' && window._spineVary === false);
    const _L1 = _genLevel === 1;
    const KV = _L1 ? { wB:4, wS:4, hB:4, hS:4, pull:0, gap:0, jit:0, skip:0,    rec:0 }   // L1 = original (unchanged) [REF#DG-00116]
                   : { wB:4, wS:3, hB:4, hS:4, pull:3, gap:2, jit:3, skip:0.05, rec:3 };  // L2+ = narrow rooms + recess + gappy rows [REF#DG-00117]
    const K0 = _L1 ? { wB:4, wS:4, hB:4, hS:4, pull:0, gap:0, jit:0, skip:0, rec:0 }       // killswitch = byte-identical to old gen [REF#DG-00118]
                   : { wB:5, wS:5, hB:5, hS:5, pull:0, gap:0, jit:0, skip:0, rec:0 };
    const K = Object.assign(_vary ? KV : K0, (typeof window !== 'undefined' && window._spineKnobs) || {});
    const spineSet = new Set();
    const _trunkPull = K.pull ? ((_rand() * (K.pull + 1)) | 0) : 0;   // 0..K.pull tiles shorter (no draw when off → killswitch parity) [REF#DG-00119]
    const TRUNK_END = GW - 3 - _trunkPull;
    for (let vx = DDX + 1; vx <= TRUNK_END; vx++) {
      if (T[vx][DDY]     === ROCK) { T[vx][DDY]     = CORR; spineSet.add(vx + ',' + DDY); }
      if (T[vx][DDY + 1] === ROCK) { T[vx][DDY + 1] = CORR; spineSet.add(vx + ',' + (DDY + 1)); }
    }
    // ROOMS — walk east along the trunk, place rooms on each side, each stubbing a single door onto the trunk. [REF#DG-00120]
    const dung = []; const ROOM_X0 = DDX + 5;
    const _gap = () => 1 + (K.gap ? ((_rand() * (K.gap + 1)) | 0) : 0);   // 1..K.gap+1 tiles between rooms (was fixed 1; no draw when off) [REF#DG-00121]
    const placeSide = (isNorth) => {
      const trunkRow  = isNorth ? DDY : (DDY + 1);         // the trunk row the stub lands beside [REF#DG-00122]
      let x = ROOM_X0 + (K.jit ? ((_rand() * (K.jit + 1)) | 0) : 0);   // per-side random start → N and S rows no longer aligned [REF#DG-00123]
      while (x <= TRUNK_END - 5) {
        const w = K.wB + ((_rand() * K.wS) | 0);
        const h = K.hB + ((_rand() * K.hS) | 0);
        // recess is CLAMPED to the vertical space THIS room actually has, so setting it back never turns a room that would fit flush [REF#DG-00124]
        // into a rejection (that is what starved the capacity-tight L2+ north side). North has ~DDY-2 tiles; south has plenty.
        const _fit = isNorth ? (DDY - 2 - h) : (GH - 2 - (DDY + 3) - (h - 1));
        const _recCap = Math.max(0, Math.min(K.rec, _fit));
        const rec = (_recCap > 0) ? ((_rand() * (_recCap + 1)) | 0) : 0;   // 0.._recCap tiles set back from the trunk [REF#DG-00125]
        const doorWallY = isNorth ? (DDY - 2 - rec) : (DDY + 3 + rec);   // room wall facing the trunk, pushed back by rec [REF#DG-00126]
        const stubYs = [];                                              // the rec+1 straight stub tiles between trunk and door [REF#DG-00127]
        for (let k = 1; k <= rec + 1; k++) stubYs.push(isNorth ? (DDY - k) : (DDY + 1 + k));
        const rx = x, ry = isNorth ? (doorWallY - h + 1) : doorWallY;   // north rooms extend UP, south rooms extend DOWN [REF#DG-00128]
        if (ry < 1 || ry + h > GH - 1 || rx + w > TRUNK_END || !clearArea(rx, ry, w, h)) { x += 1; continue; }
        const cx = rx + (w >> 1);
        if (!(T[cx] && T[cx][trunkRow] === CORR && stubYs.every(sy => T[cx][sy] === ROCK))) { x += 1; continue; }   // trunk reachable + stub column clear [REF#DG-00129]
        if (K.skip && _rand() < K.skip) { x = rx + w + _gap(); continue; }   // occasional bare-corridor stretch (reserve the span, place nothing) [REF#DG-00130]
        const r = carve(rx, ry, w, h, 'room'); dung.push(r);
        r.doorY = doorWallY; r.stubYs = stubYs;                        // remember exact door + stub for _uncarve / segment-stamp [REF#DG-00131]
        T[cx][doorWallY] = DOOR; doorList.push([cx, doorWallY]);
        for (const sy of stubYs) T[cx][sy] = CORR;
        x = rx + w + _gap();   // advance past room + a 1..K.gap+1 tile gap [REF#DG-00132]
      }
    };
    placeSide(true); placeSide(false);
    if (dung.length < (_genLevel === 1 ? 13 : 10)) return false;   // need a real dungeon; genCompact retries on light fills [REF#DG-00133]

    // STREAMED SEGMENTS (2026-07-15): the cabaret/landing head is segment 0. The straight trunk is then [REF#DG-00134]
    // partitioned into deterministic 5-7-room chunks. Each boundary becomes a full two-tile double door,
    // so the architecture itself blocks sight/pathing while the runtime stages only the next chunk.
    const ordered = [...dung].sort((a, b) => a.cx !== b.cx ? a.cx - b.cx : a.cy - b.cy);
    const chunks = [];
    const chunkCount = Math.ceil(ordered.length / 7);
    const chunkBase = Math.floor(ordered.length / chunkCount);
    const chunkExtra = ordered.length % chunkCount;
    for (let at = 0, ci = 0; at < ordered.length; ci++) {
      let take = chunkBase + (ci < chunkExtra ? 1 : 0);
      // Keep rooms whose doors share the same trunk column in one segment where the 7-room cap permits it. [REF#DG-00135]
      while (at + take < ordered.length && take < 7 && ordered[at + take - 1].cx === ordered[at + take].cx) take++;
      chunks.push(ordered.slice(at, at + take));
      at += take;
    }
    if (chunks.some(c => c.length < 5 || c.length > 7)) return false;
    // CABARET MERGE (Mark 2026-07-25 "make room 0 and room 1 part of the same section; each section must enter prev+next [REF#DG-00136]
    // BOTH"): fold the FIRST dungeon chunk into the landing/cabaret HEAD (segment 0) so the cabaret east door is NO LONGER
    // a sealing boundary — you can step into the first dungeon room and walk straight back into the cabaret. The head rooms
    // (landing id0 + cabaret id1) already default to segmentId 0; making chunk i => segment i (was i+1) merges chunk 0 with
    // the head. The first STREAMING seal now lives at the chunk0↔chunk1 gate (east of the first dungeon room), so deep-dungeon
    // perf-culling is preserved while the cabaret itself is never sealed off from the room next to it.
    chunks.forEach((chunk, i) => chunk.forEach(r => { r.segmentId = i; }));
    _segmentCount = chunks.length;

    // The cabaret east double door is NO LONGER a segment gate (the merge above put the first dungeon room in segment 0 with [REF#DG-00137]
    // the cabaret) — it is a free in-segment door owned by _tickCabDoors. Streaming gates are placed between adjacent room-
    // door columns, avoiding a side-room stub column so every boundary remains a clean straight two-tile neck.
    const internalGateXs = [];
    // ROOM-CLEAR NECKS (Mark 2026-07-17 "map generation error: rooms on the border — dont allow for rooms this [REF#DG-00138]
    // close to the section"): the old chooser only dodged room DOOR columns, so a room BODY (up to ~9 tiles wide)
    // straddled the boundary on ~94% of generated gates (headless audit, 420 maps: 430/458 internal gates landed
    // INSIDE a room footprint, the other 28 one tile away — NONE had 2+ tiles of clearance). When the neighbour
    // segment culls, that room's shell is a void-backed wall right at the neck — Mark's screenshot. Packing is
    // too dense for a naturally clear column to exist, so the gate now CLAIMS its neck: every room whose padded
    // footprint (±SEG_NECK_CLEAR tiles) covers the chosen column is UN-CARVED (footprint re-rocked, stub + door
    // erased) — each boundary becomes a clean corridor stretch, which also keeps the far segment's first tiles
    // interactable from the near side (Mark 2026-07-17: succubus flees down it, "hallway segment +4 tiles ...
    // interacted with from caberet"). A removal that starves any segment below 5 rooms fails the build →
    // genCompact retries, same contract as every other structural gate. Finally segments are re-assigned
    // GEOMETRICALLY (which side of the gates a room's body lies on) so chunk rank can never disagree with what
    // the player sees at a boundary.
    const SEG_NECK_CLEAR = 2;   // min room-free trunk tiles on EACH side of a gate column [REF#DG-00139]
    const _uncarve = (r) => {
      for (let ux = r.x; ux < r.x + r.w; ux++) for (let uy = r.y; uy < r.y + r.h; uy++) T[ux][uy] = ROCK;
      for (const sy of (r.stubYs || [])) T[r.cx][sy] = ROCK;    // erase the FULL stub column onto the trunk (any recess depth) [REF#DG-00140]
      for (let k = doorList.length - 1; k >= 0; k--) if (doorList[k][0] === r.cx && doorList[k][1] === r.doorY) doorList.splice(k, 1);   // remove this room's exact door [REF#DG-00141]
      const _di = dung.indexOf(r); if (_di >= 0) dung.splice(_di, 1);
      const _ri = rooms.indexOf(r); if (_ri >= 0) rooms.splice(_ri, 1);
      for (const ch of chunks) { const _ci = ch.indexOf(r); if (_ci >= 0) { ch.splice(_ci, 1); break; } }
    };
    for (let i = 0; i < chunks.length - 1; i++) {
      if (!chunks[i].length || !chunks[i + 1].length) return false;
      const leftX = Math.max(...chunks[i].map(r => r.cx));
      const rightX = Math.min(...chunks[i + 1].map(r => r.cx));
      let gx = Math.max(DDX + 3, Math.min(TRUNK_END - 2, Math.floor((leftX + rightX) * 0.5)));
      let found = false;
      for (let d = 0; d <= 5 && !found; d++) for (const c of (d === 0 ? [gx] : [gx - d, gx + d])) {
        if (c <= DDX + 1 || c >= TRUNK_END || internalGateXs.some(p => Math.abs(p - c) < 3)) continue;   // straddling rooms are REMOVED below, so door columns need no dodge — only bounds + gate spacing [REF#DG-00142]
        gx = c; found = true; break;
      }
      if (!found) return false;
      for (let k = dung.length - 1; k >= 0; k--) { const r = dung[k]; if (gx >= r.x - SEG_NECK_CLEAR && gx <= r.x + r.w - 1 + SEG_NECK_CLEAR) _uncarve(r); }
      if (chunks.some(c => c.length < 5 || c.length > 7)) return false;   // a neck removal starved a segment → reroll the floor [REF#DG-00143]
      internalGateXs.push(gx);
      for (const gy of [DDY, DDY + 1]) {
        T[gx][gy] = DOOR; doorList.push([gx, gy]);
        _segmentGateTiles.set(gx + ',' + gy, { gateIndex: i, segmentFrom: i, segmentTo: i + 1 });
      }
    }
    // GEOMETRIC segment assignment: every gate column now has ≥SEG_NECK_CLEAR room-free tiles on both sides, so [REF#DG-00144]
    // each room lies strictly on one side of every gate — its segment = 1 + (count of gates fully west of it).
    for (const r of dung) { let sid = 0; for (const g of internalGateXs) if (g < r.x) sid++; r.segmentId = sid; }

    // Stamp the trunk and each one-tile room stub with the segment it belongs to. Gate tiles belong to the [REF#DG-00145]
    // segment being left; this keeps the closing doors visible while the old segment seals behind the player.
    for (let x = DDX + 1; x <= TRUNK_END; x++) {
      let sid = 0;   // trunk west of the first internal gate = segment 0 (merged cabaret head + first chunk) [REF#DG-00146]
      for (const gx of internalGateXs) if (x > gx) sid++;
      _spineSegmentOf.set(x + ',' + DDY, sid);
      _spineSegmentOf.set(x + ',' + (DDY + 1), sid);
    }
    for (const chunk of chunks) for (const r of chunk) {
      for (const sy of (r.stubYs || [])) _spineSegmentOf.set(r.cx + ',' + sy, r.segmentId);   // label the whole stub run (any recess depth) [REF#DG-00147]
    }
    // STRUCTURAL GATES — identical to buildDungeon (spineSet exempts the 2-wide trunk from the no-3-way-junction rule) [REF#DG-00148]
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; if (spineSet.has(x + ',' + y)) continue; let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; } if (n >= 3) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== DOOR || _segmentGateTiles.has(x + ',' + y)) continue; let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++; if (c !== 1) return false; }
    if (doorRuleViolations() > 0) return false;
    // CASINO = farthest-east room; START = nearest; hop = along-trunk distance (so the adapter's section banding still works) [REF#DG-00149]
    let casino = dung[0]; for (const r of dung) if (r.cx > casino.cx) casino = r; casino.type = 'casino';
    const start = dung.reduce((b, r) => (!b || r.cx < b.cx) ? r : b, null);
    const hop = new Map(); const hx0 = DDX + 4, hx1 = Math.max(hx0 + 1, casino.cx);
    for (const r of dung) hop.set(r, Math.round((r.cx - hx0) / (hx1 - hx0) * 12));
    for (const s of spineSet) mhTiles.add(s);
    return { start, casino, hop };
  }

  // ── L-HALL HORSESHOE — THE DEFAULT TOPOLOGY (Mark 2026-07-26: "let us see the L shape main hallways that [REF#DG-00150]
  //    connect to other sections that way" + "all I see is a single hallway all the time, one way - that is NOT
  //    SUPPOSED TO HAPPEN" + same-day ALL-CAPS confirmation that the MAIN hall itself must connect sections in
  //    L-shapes). Defaulted the same day after head-parity + spawn-parity validation; the straight-trunk spine is
  //    one flag away: window._lhallDungeon=false or ?lhall=0. The PROTECTED HEAD (room 0 entrance / room 1
  //    cabaret / konbini) is byte-identical to the spine's — the topology is BODY-only, east of the cabaret door,
  //    per the never-touch-the-head mandate.
  //    SHAPE: the main hall is a 2-wide HORSESHOE — east leg → ROUNDED 90° corner (quarter-annulus, radius R=5,
  //    band [R, R+1] so the hall stays 2 wide through the bend; on a tile grid the "rounding radius" carves as a
  //    tight stair-step arc that walls follow) → south leg → rounded corner → east leg → rounded corner → north
  //    leg. No single straight line: the longest straight run is one leg (~15 tiles vs the spine's ~29). Section
  //    gates are 2-tile double doors mid-leg (legs 2/3/4) → 4 streamed segments; segment 0 = head + leg 1 (the
  //    cabaret merge rule, Mark 2026-07-25, holds — the cabaret east door never seals). Rooms stub one midpoint
  //    door onto straight leg runs only (never onto an arc), both sides, same clearArea/doorRule contract as the
  //    spine. Casino = the room nearest the horseshoe's far tip (the north leg), so booth/key/exit still work.
  // WHY DID THE ROLL FAIL — every reject exit of _buildLHalls names itself here (2026-09-12, added while tiering
  // section 0: 2000 silent rerolls told nothing). Read global._lhRejects after a generation; reset per genCompact.
  function _lhReject(why) { try { const r = (global._lhRejects = global._lhRejects || {}); r[why] = (r[why] | 0) + 1; } catch (_) {} return false; }
  function _buildLHalls() {
    // The head's west edge, needed by the ring's west spur. Declared at function scope because the [REF#DG-01334]
    // head origin itself is set inside the per-level branch below and would otherwise be invisible here.
    let _headWestX = CABX;
    let _headGuard = null;   // the 番所 carved beside the entrance hall on floors 2+ (Mark 2026-09-11 floor law) — see the head branch [REF#DG-02011]
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK)); rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map(); _spineSegmentOf = new Map(); _segmentCount = 0;
    const _hub = _s0HubOn();   // floors 2-7: floor 1's section 0 (+10%) is the hub — see the note at HUB_OX [REF#DG-02223]
    // HEAD — identical to _buildSpine/buildDungeon. MUST stay byte-identical in every generator (see canonical note). [REF#DG-00151]
    if (_hub) {
      // The core is not carved here: Section0's builder writes it into the engine map (generateDungeonMap). Run it once on a [REF#DG-02224]
      // scratch grid to learn exactly which compact tiles it walks on, and wall those tiles and their 8 neighbours so the
      // packer can neither build into the core nor seat a room against it without the rock border clearArea demands.
      const { S, C } = _s0Mods();
      const L = _hubLayout(S, _genLevel);
      const scratch = Array.from({ length: GW }, () => Array.from({ length: GH }, () => ({ type: 'wall' })));
      try {
        S.buildSection0Core(C, scratch, L, { ox: HUB_OX, oz: HUB_OZ, ids: HUB_IDS, guardSec: 0, down: (_genLevel === 7) ? null : 'guard',
          konbini: true, createInCreator: false });
      } catch (e) { return _lhReject('hub-core:' + (e && e.message)); }
      for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
        if (scratch[x][y].type === 'wall') continue;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = x + dx, b = y + dy; if (T[a] && T[a][b] === ROCK) T[a][b] = WALL; }
      }
      _hubCore = { L, ox: HUB_OX, oz: HUB_OZ };
      _headGuard = { hub: true };   // the core already owns the Section-0 番所 — the wing-room promotion below stands down [REF#DG-02225]
      CABW = L.cab.w; CABH = L.cab.h; DDX = 0; DDY = 0;   // no head door: the structural scans below start at DDX+2 [REF#DG-02226]
    } else if (_genLevel === 1) {
      const L1X = CABX + 1, L1Y = CABY + 1;
      CABW = 5; CABH = 6;
      DDX = L1X + CABW - 1; DDY = L1Y + 2;
      carve(L1X, L1Y, CABW, CABH, 'cabaret');
      for (let i = L1X; i < L1X + CABW; i++) for (let j = L1Y; j < L1Y + CABH; j++) T[i][j] = FLOOR;
      const HW = 4, HH = 13, HX = L1X, HY = L1Y + CABH - 1;   /* ENTRY HALLWAY = 10 LONG (Mark 2026-07-31, revised down from 12). interior = HW-2 x HH-3 = 2 x 10. MEASURED, not assumed: HH 10 gave 2x7, HH 15 gave 2x12. This head is duplicated across ALL FIVE generators and MUST stay identical — a probe caught HH changed in one copy doing nothing, because the RING generator (the live default) carries its own copy. */
      carve(HX, HY, HW, HH, 'landing');
      for (let x = HX + 1; x < HX + HW - 1; x++) { T[x][HY] = FLOOR; _l1Open.push([x, HY]); }
      T[L1X][HY] = WALL; T[L1X + CABW - 1][HY] = WALL;
    } else {
      // ── THE HEAD MOVES INBOARD, AND ONLY FOR THIS GENERATOR ─────────────────────────── [REF#DG-01312]
      //    Mark's spec is "1 west 2 north 3 east". A hall that starts AT the head and travels away
      //    from it can never show three faces to it, so the head has to sit INSIDE the ring.
      //    ⚠ MEASURED BEFORE REWRITING, 6 seeds, floors 2 and 3: all three sections read EAST, every
      //      seed. And with the head moved to the legs' own centroid — the most favourable inboard
      //      point that exists — the legs read WEST/SOUTH/NORTH and NO permutation of {W,N,E} fits.
      //      So moving the anchor was never enough; the PATH had to change. Both results are in
      //      scripts/probe-floor2-compass.js.
      //    ⚠ `CABX`/`CABY` ARE DELIBERATELY NOT TOUCHED. They are module constants shared by all five
      //      generators, and this file's own head note records a probe catching one copy diverging
      //      silently. The origin below is LOCAL to _buildLHalls, so floor 1 and every other builder
      //      keep the head they had, byte for byte.
      const HOX = 24, HOY = 15;                  // head origin, this generator only [REF#DG-01335]
      _headWestX = HOX;
      // ── THE TIERED SECTION 0 (Mark GO 2026-09-12, A3b) — every size below comes from S0_TIERS, one row per [REF#DG-02025]
      //    floor. ⛔ SUPERSEDED 2026-09-12 by Mark: "each should lead through the same sort of hallway" — the
      //    fixed 12×10 cabaret and the 6×8 LANDING BOX are retired; the hall is now floor 1's 2-wide shape
      //    (hallW 4 → interior 2), centred under the cabaret, and the cabaret's south double door opens onto
      //    the hall's own two interior columns (passed to _carveCabEntrance — its default ox+3 was cut for a
      //    6-wide landing and would land on the new hall's east wall).
      const _tier = _s0Tier(_genLevel);
      CABW = _tier.cabW; CABH = _tier.cabH; DDX = HOX + CABW - 1; DDY = HOY + 3;
      carve(HOX, HOY, CABW, CABH, 'cabaret');
      const LANDW = _tier.hallW, LANDH = _tier.hallH;
      const LANDX = HOX + (CABW >> 1) - (LANDW >> 1), LANDY = HOY + CABH + 2;   // hall centred under the cabaret [REF#DG-02026]
      carve(LANDX, LANDY, LANDW, LANDH, 'landing');
      // ⚠ THE ENTRANCE IS CARVED AT THIS HEAD'S ORIGIN, NOT THE DEFAULT ONE. `_carveCabEntrance` defaults [REF#DG-01991]
      //   its origin to CABX/CABY; the head above sits at HOX/HOY. MEASURED 2026-09-11 (seed 33, and
      //   every other seed tried): called with one argument, the cabaret->landing double door was cut into
      //   rock at the old origin, the landing had no north door, and the player's only exit from the
      //   floor-2 spawn was the konbini — Creator's "unreachable ×4" (landing 22 tiles, konbini 51, the
      //   two stray door carves 7 + 3) since 36389aff, shipped in report mode. Gold r24 still had the door.
      _carveCabEntrance(LANDY, HOX, HOY, LANDX + 1);   // door columns = the hall's two interior columns (tiered head, 2026-09-12) [REF#DG-02027]
      _carveKonbini(LANDX, LANDY, LANDW, LANDH);
      // ── THE 番所 FLANKS THE ENTRANCE HALL ON EVERY FLOOR (Mark 2026-09-11: "each floor would have an [REF#DG-02012]
      //    entrance stair. each should lead through the same sort of hallway to guard room (which get better
      //    each level …)"). Floor 1's 番所 stands on the hall's east flank with the stairs down inside and its
      //    door locked until wings 1-3 turn their keys. MEASURED 2026-09-11 on floor 2: a 4x4 room PROMOTED at
      //    random in a wing, the stairs in the casino, no lock. Now the same shape as floor 1: a 5x8 番所 east of
      //    the landing, joined the way the konbini already is (door · 1-tile gutter · door — the one door shape
      //    this generator's three scans and the door rule accept without a corridor), section 4, locked by the
      //    adapter (lockedRoom / lockedBy 'guard', the fields Engine9's canWalk reads), stairs down at its
      //    centre. Carved in the HEAD phase on purpose: its footprint is claimed before the wings pack, and a
      //    fixed-geometry carve either fits on every seed or on none — no reroll lottery (the promotion note
      //    below records why a fourth stub OFF THE RING could not be placed; this one hangs off the hall).
      //    Off: window._headGuardRoom = false → back to the promoted wing room and the casino descent.
      if (typeof window === 'undefined' || window._headGuardRoom !== false) {
        const GRX = LANDX + LANDW + 1, GRY = LANDY, GRW = _tier.guardW, GRH = _tier.guardH;   // floor 2: walls x32-38 z27-36 · floor x33-37 z28-35; deeper floors grow it (S0_TIERS) [REF#DG-02013]
        _headGuard = carve(GRX, GRY, GRW, GRH, 'guard');
        _headGuard.segmentId = 4; _headGuard.sectionIndex = 4; _headGuard._headGuard = true;
        const _gy = _headGuard.cy;   // the door rule wants a lone door ON its wall's midpoint (_wallDoorsOk) [REF#DG-02014]
        T[LANDX + LANDW - 1][_gy] = DOOR;   // the landing's EAST wall → door [REF#DG-02015]
        T[LANDX + LANDW][_gy] = CORR;       // the 1-tile gutter (no room FLOOR touches it — scan 1 holds) [REF#DG-02016]
        T[GRX][_gy] = DOOR;                 // the 番所's WEST wall → door (the locked one) [REF#DG-02017]
        doorList.push([LANDX + LANDW - 1, _gy], [GRX, _gy]);
      }
      // ── THE BACKSTAGE PAIR — DRESSING ROOM + MANAGER'S OFFICE ON FLOORS 2-7 ───────────────── [REF#DG-02227]
      //    Floors 2+ shipped four of section 0's rooms (landing, cabaret, konbini, guard room) and not these
      //    two. The west wing that builds them is gated `level === 1` (~:5356), so the adapter's
      //    `cr.type === 'dressing'` / `'office'` branches — and every engine system already keyed on
      //    isDressingRoom / isManagerOffice (door signs, backstage furniture, the no-urn rule) — had
      //    nothing to read below floor 1. Carved HERE, in the head phase, for the same reason the guard room
      //    is: a fixed-geometry rect claimed before the wings pack either fits on every seed or on none,
      //    with no reroll lottery. Design doc: knowledge/design/FLOORS_2PLUS_SECTION0_TEMPLATE_2026-10-01.md
      //
      //    JOIN SHAPE is the konbini's and the guard room's: door, 1-tile CORR gutter, door. The three
      //    structural scans accept it and no room FLOOR touches the gutter.
      //    ⚠ THE DOOR RULE ONLY BINDS THE NEW ROOM. doorRuleViolations() skips type 'cabaret' and
      //      'landing', so the cabaret's and hall's extra door is free; the annexe's own door MUST sit on
      //      its own wall midpoint (its `cy`), which is why each rect is centred on its host.
      //    ⚠ THE WEST SPUR OWNS ROWS DDY..DDY+1 out to WLX+2, so the Dressing Room starts at DDY+2.
      //      Centring it on the cabaret instead would put its north rows inside the spur, and `hcarve`
      //      would silently fold those tiles into `hallSet` (it only skips non-ROCK, and a carved wall is
      //      not ROCK) — a corridor welded to a room wall rather than a clean seam.
      //    ⚠ `carve()` OVERWRITES BLIND — no collision test, no return code. The overlap guard below is
      //      therefore the only thing standing between a bad tier row and a silently corrupted head, so
      //      it rejects the attempt (loudly, through _lhReject) instead of shipping a mangled floor.
      //    Off: window._headBackstage = false → floors 2-7 back to the four-room section 0.
      if (typeof window === 'undefined' || window._headBackstage !== false) {
        const _dw = _tier.dressW, _dh = _tier.dressH, _mw = _tier.mgrW, _mh = _tier.mgrH;
        const DRX = HOX - 1 - _dw, DRY = DDY + 2;                                  // west of the cabaret, clear of the spur [REF#DG-02130]
        const MOX = LANDX - 1 - _mw, MOY = LANDY + ((LANDH - _mh) >> 1);           // west of the hall, centred on it (mirrors the guard room) [REF#DG-02131]
        const _rects = [{ n: 'dressing', x: DRX, y: DRY, w: _dw, h: _dh }, { n: 'office', x: MOX, y: MOY, w: _mw, h: _mh }];
        // the gutter column each annexe needs must also be free, or the door pair has nowhere to land [REF#DG-02228]
        const _hits = (a, b) => (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
        let _bad = null;
        for (const q of _rects) {
          if (q.x < 1 || q.y < 1 || q.x + q.w >= GW - 1 || q.y + q.h >= GH - 1) { _bad = q.n + ' off-grid'; break; }
          for (const r of rooms) if (_hits(q, r)) { _bad = q.n + ' overlaps ' + r.type; break; }
          if (_bad) break;
        }
        if (_hits(_rects[0], _rects[1])) _bad = _bad || 'dressing overlaps office';
        if (_bad) return _lhReject('head-backstage:' + _bad);
        const _dress = carve(DRX, DRY, _dw, _dh, 'dressing');
        const _office = carve(MOX, MOY, _mw, _mh, 'office');
        // SECTION 0 IS THE HEAD, and these two belong to it the way the landing, cabaret and konbini do. [REF#DG-02229]
        // Measured before this line existed: both came out `segmentId 1` — inherited from whichever band
        // their tiles fell in — which put the backstage inside a wing and counted against that wing's
        // room band. Stamped the way the guard room stamps its own 4, for the same reason.
        for (const _r of [_dress, _office]) { _r.segmentId = 0; _r.sectionIndex = 0; _r._headBackstage = true; }
        for (const [_r, _hostWallX] of [[_dress, HOX], [_office, LANDX]]) {
          const _y = _r.cy;                       // the annexe's own wall midpoint — what _wallDoorsOk wants [REF#DG-02132]
          T[_r.x + _r.w - 1][_y] = DOOR;          // the annexe's EAST wall → door [REF#DG-02133]
          T[_hostWallX - 1][_y] = CORR;           // the 1-tile gutter (no room FLOOR touches it) [REF#DG-02134]
          T[_hostWallX][_y] = DOOR;               // the cabaret's / hall's WEST wall → door (both exempt from the door rule) [REF#DG-02135]
          doorList.push([_r.x + _r.w - 1, _y], [_hostWallX, _y]);
        }
      }
    }
    if (!_hub) { T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]); }

    // ── MAIN HALL: legs + rounded corners, carved in PATH ORDER (each tile remembers its distance along the [REF#DG-00152]
    //    horseshoe so segment membership falls out of geometry — no chunk sorting needed).
    const R = 5;                                        // rounding radius (inner edge); band [R, R+1] = 2-wide hall [REF#DG-00153]
    const hallSet = new Set();                          // junction-rule exemption, like the spine's spineSet [REF#DG-00154]
    const pathIdx = new Map();                          // 'x,y' → distance along the horseshoe (first write wins) [REF#DG-00155]
    let _idx = 0;
    const hcarve = (x, y) => { if (x < 1 || y < 1 || x >= GW - 1 || y >= GH - 1) return;
      const k = x + ',' + y;
      if (T[x][y] === ROCK) T[x][y] = CORR;
      if (!pathIdx.has(k)) pathIdx.set(k, _idx);
      hallSet.add(k); };
    // Corner geometry (from the head door rows DDY/DDY+1 = 9/10 on every floor): [REF#DG-00156]
    // ── THE RING WRAPS THE HEAD: a WEST leg, a NORTH leg and an EAST leg, joined by two spurs [REF#DG-01313]
    //    off the head's own doors. ⛔ SUPERSEDED 2026-09-02 — this was a STAIRCASE (east → south →
    //    east → north) that walked away from a head parked in the corner, which is why every section
    //    measured EAST on every seed.
    //    ⚠ THE OPEN SIDE IS SOUTH, AND IT STAYS ROCK. Mark: "we removed section 4 = that is
    //      permanent." Three legs, three gates, four segments — a fourth face would be a fourth
    //      section, so the ring is deliberately a U and not a loop.
    //    ⚠ THE TWO SPURS ARE WHAT KEEP `hallSet` 4-CONNECTED. Three legs touching only the head would
    //      be three separate hall components — the head is a ROOM, not hall — and the connectivity
    //      audit below would return false and burn 2000 rerolls. The spurs are structural, not decor.
    const WLX = 8;                                       // west leg cols WLX, WLX+1 [REF#DG-01336]
    const NLY = 10;                                      // north leg rows NLY, NLY+1 [REF#DG-01337]
    const ELX = 51;                                      // east leg cols ELX, ELX+1 [REF#DG-01338]
    // ⚠ THE BAND SCALES WITH DEPTH AND THE LEG LENGTH DID NOT — that mismatch is why balancing [REF#DG-01362]
    //   alone could not satisfy both floors. `section-room-band` wants 4-6 +1 PER FLOOR (floor 2 → 5-7,
    //   floor 3 → 6-8), but a fixed run deals a fixed number of rooms, so any length that suits floor 2
    //   starves floor 3. MEASURED at a fixed run of 23/27/23: floor 2 reached 8/18 sections in band and
    //   floor 3 fell to 2/18 — evener than before on both, and still wrong on the deeper floor.
    //   The run now grows with depth, because a leg's run length IS its share of rooms.
    const _legDepth = Math.max(0, ((_genLevel | 0) - 2));
    const LEGY1 = 40 + _legDepth * 3;                    // how far south the side legs run (open side stays rock) [REF#DG-01339]
    //    ⚠ 26 WAS TOO SHORT AND THE FAILURE WAS NOT STRUCTURAL: seed 1000 placed 9 rooms against [REF#DG-01340]
    //      the builder's `dung.length < 10` light-fill floor and rerolled 2000 times. The three
    //      structural scans were clean throughout — it was simply less wall to hang rooms on than
    //      the staircase offered. 31 restores the run length without reaching the landing (y27-34
    //      sits at x25-30; the side legs are x8/9 and x51/52, so they pass either side of it).
    const DDXW = _headWestX;                             // the head's WEST door column [REF#DG-01341]
    const arc = (cx, cy, qx, qy) => {                    // quarter-annulus, angle-marched so the band stays 4-connected [REF#DG-00162]
      for (let s = 0; s <= 24; s++) { const a = (Math.PI / 2) * (s / 24);
        for (const rr of [R + 0.5, R + 1.49]) {
          const x = Math.round(cx + qx * rr * Math.sin(a)), y = Math.round(cy + qy * rr * Math.cos(a));
          hcarve(x, y); }
        _idx++; } };
    // leg 1: EAST from the cabaret mouth (rows DDY/DDY+1) [REF#DG-00163]
    // PATH ORDER IS WEST SPUR → WEST LEG → NORTH LEG → EAST LEG → EAST SPUR, and it is load-bearing:
    // `segOfIdx` derives a tile's section from its distance along this walk, and the gate array below
    // must be listed in the same order or the two disagree silently.
    if (_hub) {
      // ── THE HUB'S THREE WINGS (2026-10-02): a WEST leg (section 1), a NORTH leg (2) and an EAST leg (3) that do not touch [REF#DG-02230]
      //    one another — 3+ tiles of rock between their ends — each joined to the core by a 2-wide spur from that section's
      //    gate. A section is reached from section 0 and from nowhere else, the way floor 1's wings hang off its ring.
      //    pathIdx = section * HUB_K + steps from the gate, so `segOfIdx` reads the section and `_pdepth` the depth.
      const own = { 1: [], 2: [], 3: [] };
      const put = (sec, x, y, force) => { if (x < 1 || y < 1 || x >= GW - 1 || y >= GH - 1) return false;
        if (T[x][y] === ROCK || (force && T[x][y] === WALL)) T[x][y] = CORR;
        if (T[x][y] !== CORR) return false;
        const k = x + ',' + y; if (!hallSet.has(k)) { hallSet.add(k); own[sec].push(k); } return true; };
      for (let y = NLY; y <= LEGY1; y++) { put(1, WLX, y); put(1, WLX + 1, y); put(3, ELX, y); put(3, ELX + 1, y); }
      for (let x = WLX + 5; x <= ELX - 4; x++) { put(2, x, NLY); put(2, x, NLY + 1); }
      const { L, ox, oz } = _hubCore;
      const OUT = { w: [-1, 0], n: [0, -1], e: [1, 0] };
      for (const k of [1, 2, 3]) {
        const g = L.gates[k], [sx, sy] = OUT[g.side], tiles = g.tiles.map(t => [t[0] + ox, t[1] + oz]);
        for (const [gx, gy] of tiles) {   // each gate tile walks its own lane of the spur out to the leg [REF#DG-02231]
          let x = gx + sx, y = gy + sy, n = 0;
          while (!hallSet.has(x + ',' + y)) {
            if (++n > MAX_CORR || !put(k, x, y, true)) return _lhReject('hub-spur-' + k);
            x += sx; y += sy;
          }
        }
        for (const [gx, gy] of tiles) {
          if (T[gx][gy] !== WALL) return _lhReject('hub-gate-' + k);
          T[gx][gy] = DOOR; doorList.push([gx, gy]);
          _sectionGateTiles.set(gx + ',' + gy, { gateIndex: k, sectionFrom: 0, sectionTo: k });
        }
        // the leg must be one piece, walked from the gate; each tile's depth is its step count from there [REF#DG-02232]
        const mine = new Set(own[k]), first = (tiles[0][0] + sx) + ',' + (tiles[0][1] + sy);
        const dist = new Map([[first, 1]]), q = [first];
        for (let h = 0; h < q.length; h++) { const [cx0, cy0] = q[h].split(',').map(Number);
          for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (cx0 + d[0]) + ',' + (cy0 + d[1]);
            if (mine.has(kk) && !dist.has(kk)) { dist.set(kk, dist.get(q[h]) + 1); q.push(kk); } } }
        if (dist.size !== mine.size) return _lhReject('hub-leg-split-' + k);
        for (const [kk, dd] of dist) pathIdx.set(kk, k * HUB_K + dd);
      }
    } else {
      for (let x = DDXW - 1; x >= WLX + 2; x--) { hcarve(x, DDY); hcarve(x, DDY + 1); _idx++; }   // west spur [REF#DG-01342]
      for (let y = DDY + 1; y >= NLY; y--) { hcarve(WLX, y); hcarve(WLX + 1, y); _idx++; }        // WEST leg, north-bound [REF#DG-01343]
      for (let y = DDY + 2; y <= LEGY1; y++) { hcarve(WLX, y); hcarve(WLX + 1, y); }              // west leg, south tail [REF#DG-01344]
      for (let x = WLX; x <= ELX + 1; x++) { hcarve(x, NLY); hcarve(x, NLY + 1); _idx++; }        // NORTH leg [REF#DG-01345]
      for (let y = NLY; y <= LEGY1; y++) { hcarve(ELX, y); hcarve(ELX + 1, y); _idx++; }          // EAST leg, south-bound [REF#DG-01346]
      for (let x = ELX - 1; x >= DDX + 1; x--) { hcarve(x, DDY); hcarve(x, DDY + 1); _idx++; }    // east spur back to the head [REF#DG-01347]

      // 4-connectivity audit of the whole hall (arcs are stair-steps — prove the band never pinches to diagonal-only). [REF#DG-00170]
      { const first = (DDX + 1) + ',' + DDY, seen = new Set([first]), q = [first];
        while (q.length) { const [cx0, cy0] = q.pop().split(',').map(Number);
          for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) { const k = (cx0 + d[0]) + ',' + (cy0 + d[1]);
            if (hallSet.has(k) && !seen.has(k)) { seen.add(k); q.push(k); } } }
        if (seen.size !== hallSet.size) return false; }    // disconnected band → fail loudly (never ship a broken map) [REF#DG-00171]
    }

    // ── SECTION GATES: 2-tile double doors mid-leg (straight runs only, like the spine's necks). [REF#DG-00172]
    // ── SECTION 4 EXISTED ONLY IN THE TABLE, NEVER ON A MAP — FIXED 2026-09-02 ──────────────────
    //    MEASURED on the shipping build, floors 2 AND 3 (identical both times): rooms landed in
    //    sections 0/1/2/3 and **section 4 had 0 rooms and 0 walkable tiles**. It was not a placer
    //    that skipped it — `_segmentCount = gates.length + 1`, and this array held THREE gates, so
    //    four sections is all the topology could express. Section 4 was arithmetically impossible.
    //    ⚠ Meanwhile `Creator.SPECIAL_BUILDING` assigns a building to section 4, and the boss/guard
    //      progression puts the LAST room there. A table row for a section no map can contain is the
    //      same class of silent gap as naming a building nothing can carve.
    //    THE HORSESHOE HAS FOUR LEGS AND CARRIED ONLY THREE GATES — leg 1 (the entrance leg) had
    //    none, so the entrance stretch and the south leg were one undivided section.
    //    ⚠ THE LEG-1 GATE IS FIRST IN THIS ARRAY ON PURPOSE, AND ORDER IS LOAD-BEARING. `gateIndex`
    //      and `segmentFrom/To` are taken from the array INDEX, while `segOfIdx` derives a tile's
    //      section from its PATH position. Appending the leg-1 gate would have labelled the
    //      geometrically-first gate "3 → 4" while the path assigned its tiles section 0/1 — the two
    //      would disagree and nothing would have thrown. Array order must match path order.
    // ⛔ A FOURTH GATE WAS ADDED HERE 2026-09-02 AND REVERTED THE SAME DAY — the premise was wrong.
    //    The claim was "section 4 is arithmetically impossible because _segmentCount = gates.length + 1
    //    and there are three gates". The arithmetic is true OF THIS FUNCTION and the conclusion was
    //    still false: MEASURED 6/6 samples on floor 2, on this build AND on the pre-change tree in an
    //    isolated worktree, every map had FIVE sections (0-4) with the casino in section 4.
    //    ⛔⛔ THE "REASON" GIVEN HERE WAS FALSE AND IT NEARLY COST THIS WHOLE REPAIR. It read:
    //      "`_buildLHalls` IS NOT THE BUILDER THAT RUNS … editing the gate list here changed nothing
    //      that ships." AI 2 (origamiunderworld-28) INSTRUMENTED IT on 2026-09-02 rather than trusting
    //      it: **`_buildLHalls` invocations = 1 on floor 2 and 1 on floor 3.** It runs. It has always
    //      run — it is what `genCompact` reaches for on every floor past the first — and
    //      `gates.length + 1 = 4` is exactly the section count that ships.
    //      What the original author actually had was a build whose gate edit did not change the
    //      OUTCOME, and they wrote that up as the FILE never executing. A comment that says "this code
    //      is dead" is the most expensive kind to get wrong: it tells every later seat to stop looking
    //      here, and this one would have stopped the west/north/east rewrite before it started.
    //      The log line it cites, "[MapGen] DungeonChain (main hall + side rooms)", is the module's
    //      banner, not a builder's signature — it prints whichever packer wins.
    //      ⚠ WHAT SURVIVES: the "section 4 is arithmetically impossible" claim above IS still wrong,
    //        and the five-section samples were real. That was the pinwheel `_buildRing`, not this
    //        function. Two builders, one file — name which one you measured, every time.
    //    THREE GATES, ONE PER LEG, LISTED IN PATH ORDER — west, north, east. Each sits just inside
    //    its own leg so the section behind it is that leg and nothing else; a gate placed at a corner
    //    would hand half of one compass direction to its neighbour.
    const gates = _hub ? [] : [   // the hub registered its three gates at the core above (section gates, not segment gates — floor 1's shape) [REF#DG-02233]
      [[WLX, DDY - 1], [WLX + 1, DDY - 1]],              // WEST leg, just north of the spur junction [REF#DG-01348]
      [[WLX + 4, NLY], [WLX + 4, NLY + 1]],              // NORTH leg, just east of the north-west corner [REF#DG-01349]
      [[ELX, NLY + 3], [ELX + 1, NLY + 3]],              // EAST leg, just south of the north-east corner [REF#DG-01350]
    ];
    const gateIdxs = [];
    gates.forEach((g, i) => { let gi = Infinity;
      for (const [gx, gy] of g) { T[gx][gy] = DOOR; doorList.push([gx, gy]);
        _segmentGateTiles.set(gx + ',' + gy, { gateIndex: i, segmentFrom: i, segmentTo: i + 1 });
        gi = Math.min(gi, pathIdx.get(gx + ',' + gy) ?? Infinity); }
      gateIdxs.push(gi); });
    _segmentCount = _hub ? 4 : gates.length + 1;   // hub: sections 0-3 plus the 番所's 4, which carries no gate of its own [REF#DG-02234]
    const segOfIdx = (pi) => { if (_hub) return (pi / HUB_K) | 0; let s = 0; for (const gi of gateIdxs) if (pi > gi) s++; return s; };
    const _pdepth = (pi) => _hub ? (pi % HUB_K) : pi;   // steps along the hall: the hub counts from each section's own gate [REF#DG-02235]
    // ── SECTION NUMBERS ARE A COMPASS, NOT A WALKING ORDER ──────────────────────────────────────── [REF#DG-01351]
    //    Mark 2026-09-02: "1 west 2 north 3 east", and section 4 is permanently retired.
    //    `segOfIdx` numbers a segment by HOW FAR ALONG THE HORSESHOE it is — segment 1 is simply the
    //    first one past the first gate. That is a traversal rank, and it has no opinion about where
    //    the section actually sits. MEASURED, floors 2 and 3, `npm run gate:sections`: section 2's
    //    centroid landed at x≈85 against a core at x≈64, i.e. EAST when the rule says NORTH, and six
    //    `section-special` violations followed from the same cause — the buildings went exactly where
    //    their NUMBERS said, and the numbers were on the wrong sides.
    //    So the ranks are relabelled ONCE here, by geometry, and everything downstream reads the
    //    relabelled value: `_spineSegmentOf`, every room's `segmentId`, and the special placer below.
    //    ⚠ THE CORE IS THE CABARET — THE SAME POINT THE RULE GRADES AGAINST, AND MY FIRST VERSION USED
    //      A DIFFERENT ONE. It anchored on segment 0's mean spine tile, which is derived rather than
    //      declared and reads well, but `section-direction` anchors on the CABARET ROOM, found by
    //      type. AI 2 (origamiunderworld-28) measured the two on one seed: **segment-0 mean (43.6,
    //      47.7) versus the cabaret (39.0, 42.0) — 7.3 tiles apart**, and on the gate's own run a leg
    //      that reads EAST from the segment-0 mean was graded NORTH from the cabaret. Two authorities
    //      on one question: a section could be relabelled correctly and still be graded wrong, and
    //      neither number was traceable to the other. It is also what Mark said — "each will be N W E
    //      of the caberet main hall". The cabaret wins; the segment-0 anchor is gone, not demoted.
    //    ⚠ IT IS FOUND BY TYPE, NEVER BY ID — a re-numbered floor must not silently re-anchor this.
    //    ⚠ AND UNIFYING THE ANCHORS DOES NOT FIX THE VIOLATIONS, WHICH AI 2 CHECKED AND FALSIFIED
    //      BEFORE I COULD BELIEVE IT: with both on the same anchor, NEITHER yields a west leg. This
    //      is a real second defect that had to be fixed so the geometry work is graded against the
    //      origin it is built for. It is not the blocker. The blocker is that the arms all run east.
    //    ⚠ RANK ORDER IS THE TIE-BREAK, AND IT MUST BE, BECAUSE A COMPASS CAN COLLIDE. Two legs can
    //      both read EAST on a squashed seed, and a leg can read SOUTH — which is not a section any
    //      more. Claiming is first-come by rank, and anything left unclaimed takes the lowest free
    //      number. The result is ALWAYS a permutation of 1..3: no section vanishes, none doubles up,
    //      and `section-tile-parity` cannot start reporting ghosts.
    //    Restore pure traversal numbering: window._sectionCompass = false.
    const _segRemap = (() => {
      const idm = new Map();                                   // rank -> [sumX, sumZ, n] [REF#DG-01352]
      for (const [k, pi] of pathIdx) { const r = segOfIdx(pi);
        const c = k.split(','), a = idm.get(r) || [0, 0, 0];
        a[0] += +c[0]; a[1] += +c[1]; a[2]++; idm.set(r, a); }
      const out = new Map([[0, 0]]);                           // the heart keeps its number, always [REF#DG-01353]
      // THE ONE ANCHOR: the cabaret room, by TYPE, exactly as `section-direction` finds it. [REF#DG-01354]
      const _cabR = rooms.find(r => r && (r.type === 'cabaret' || r.isCabaret));
      const core = _cabR ? [_cabR.x + (_cabR.w >> 1), _cabR.y + (_cabR.h >> 1), 1] : null;
      const _g = (typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null);
      const ranks = [...idm.keys()].filter(r => r !== 0).sort((a, b) => a - b);
      // NO SILENT FALLBACK TO A DIFFERENT ORIGIN. If the cabaret cannot be found, this hands back [REF#DG-01355]
      // traversal order untouched and `section-direction` fails loudly, which is the honest outcome —
      // relabelling against a second anchor is the defect this block was just rewritten to remove.
      if (_hub || !core || (_g && _g._sectionCompass === false)) { for (const r of ranks) out.set(r, r); return out; }   // the hub's legs ARE the compass: 1 west, 2 north, 3 east [REF#DG-02236]
      const kx = core[0], ky = core[1];
      // ── BEST WHOLE ASSIGNMENT, NOT FIRST-COME ──────────────────────────────────────────────── [REF#DG-01356]
      //    Claiming greedily in rank order lets an early leg take a number a later leg would have
      //    satisfied, and then BOTH are wrong. MEASURED, floors 2 and 3, the moment the anchor was
      //    corrected to the cabaret: greedy scored 2 direction violations per floor where the best
      //    permutation scores 1. Three legs is six permutations, so the exhaustive answer is free.
      //    Scored on the rule's own predicate — the direction each number REQUIRES, compared against
      //    the direction the cluster actually lies in from the cabaret. Ties break on rank order, so
      //    the result is deterministic for a given seed.
      //    ⚠ THIS MINIMISES THE LIE, IT DOES NOT REMOVE IT. With every arm running east off this
      //      horseshoe there is no permutation that satisfies all three, and the residue is the
      //      geometry defect — not something a better numbering can absorb. See the note at the
      //      `legs` table.
      const WANT = { WEST: 1, NORTH: 2, EAST: 3 };
      const REQ = { 1: 'WEST', 2: 'NORTH', 3: 'EAST' };
      const dirOf = (r) => { const a = idm.get(r), dx = a[0] / a[2] - kx, dy = a[1] / a[2] - ky;
        return (Math.abs(dx) > Math.abs(dy)) ? (dx > 0 ? 'EAST' : 'WEST') : (dy < 0 ? 'NORTH' : 'SOUTH'); };
      const nums = [1, 2, 3].slice(0, ranks.length);
      const perms = (xs) => xs.length <= 1 ? [xs]
        : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(rest => [x, ...rest]));
      let best = null, bestScore = -1;
      for (const perm of perms(nums)) {
        let sc = 0;
        for (let i = 0; i < ranks.length; i++) if (REQ[perm[i]] === dirOf(ranks[i])) sc++;
        if (sc > bestScore) { bestScore = sc; best = perm; }
      }
      for (let i = 0; i < ranks.length; i++) out.set(ranks[i], best ? best[i] : ranks[i]);
      void WANT;
      return out;
    })();
    const _secOf = (pi) => { const v = _segRemap.get(segOfIdx(pi)); return (v === undefined) ? segOfIdx(pi) : v; };
    for (const [k, pi] of pathIdx) _spineSegmentOf.set(k, _secOf(pi));

    // ── REGISTER THE THREE LEG GATES AS FORMAL SECTION GATES ──────────────────────────────────── [REF#DG-01385]
    //    The DOOR tiles above were carved and used to compute segOfIdx/rank, but never written into
    //    `_sectionGateTiles` — so this generator's exported `gates` array (built near the return
    //    statement from `_segmentGateTiles`/`_sectionGateTiles`) came back with zero `kind:'section'`
    //    entries on every floor 2+ boot. MEASURED 2026-09-06: `node scripts/probe-sections.js chain 2
    //    10` read 0 "gates of kind 'section'" across 10 seeds and failed all four sections, every seed,
    //    on "has no gate of kind 'section' joining it to section 0" — the single most common failure in
    //    the run. `_segmentGateTiles` (just above, same loop) was always populated correctly, which is
    //    why segment gates never showed this defect — only the section registration was missing.
    //    sectionFrom is always 0: every leg gate opens off the head/spurs, which ARE section 0. sectionTo
    //    is `_segRemap.get(i + 1)` — the exact final (compass-remapped) number a tile just past gate `i`
    //    resolves to through `_secOf` (a tile immediately after gate index i sits at rank i+1 by
    //    `segOfIdx`'s own construction), so a room's `sectionIndex` and its gate's `sectionTo` always
    //    agree — they are computed from the same remap, not two numbers that happen to match today.
    gates.forEach((g, i) => {
      const sectionTo = _segRemap.get(i + 1) ?? (i + 1);
      for (const [gx, gy] of g) _sectionGateTiles.set(gx + ',' + gy, { gateIndex: i, sectionFrom: 0, sectionTo });
    });

    // ── ROOMS: along each straight leg run, both sides, single midpoint door + straight stub (spine contract). [REF#DG-00176]
    const dung = [];
    const nearGate = (leg, pos) => gates.some(g => g.some(([gx, gy]) => (leg.axis === 'h' ? Math.abs(gx - pos) : Math.abs(gy - pos)) < 3 && (leg.axis === 'h' ? g[0][1] === leg.rows[0] || g[0][1] === leg.rows[1] : g[0][0] === leg.cols[0] || g[0][0] === leg.cols[1])));

    // ⛔ SUPERSEDED 2026-09-02 with the staircase this table described — its four runs named the old [REF#DG-01357]
    //    east/south/east/north legs and every one of their constants is gone. Rooms now hang off the
    //    RING: the three compass legs plus the two spurs that join them to the head.
    //    ⚠ THE SPURS CARRY ROOMS TOO. They are section-0 corridor, so rooms on them belong to the
    //      core rather than to a compass section — which is what keeps the section centroids clean:
    //      a room hung near the head would drag its section's centre back toward the anchor.
    const legs = [
      //    ⚠ THE THREE RUNS ARE DELIBERATELY CLOSE IN LENGTH, AND THAT IS THE WHOLE MECHANISM. [REF#DG-01361]
      //      Rooms are dealt ALONG a leg, so a leg's share of the floor IS its run length — there is no
      //      per-leg quota to set. MEASURED on the first ring: north ran 34 tiles against west 16 and
      //      east 14, and the counts came out 2/6/3 against a 5-7 band, with only ONE section in band
      //      on every seed. Evening the RUNS is what evens the counts.
      { axis: 'v', cols: [WLX, WLX + 1], from: NLY + 2, to: LEGY1 - 2 },        // WEST leg  (23) [REF#DG-01358]
      { axis: 'h', rows: [NLY, NLY + 1], from: WLX + 6, to: ELX - 4 },          // NORTH leg [REF#DG-01359]
      { axis: 'v', cols: [ELX, ELX + 1], from: NLY + 2, to: LEGY1 - 2 },        // EAST leg  (23) [REF#DG-01360]
      { axis: 'h', rows: [DDY, DDY + 1], from: WLX + 4, to: DDXW - 3 },         // west spur (section 0) [REF#DG-01361]
      { axis: 'h', rows: [DDY, DDY + 1], from: DDX + 3, to: ELX - 3 },          // east spur (section 0) [REF#DG-01362]
    ].slice(0, _hub ? 3 : 5);   // the hub's spurs are short gate approaches, not room rows — its rooms hang off the three legs [REF#DG-02237]
    const placeAlong = (leg, firstSide) => {
      for (const side of [firstSide, !firstSide]) {
        let p = leg.from + ((_rand() * 3) | 0);
        while (p <= leg.to - 4) {
          const w = 4 + ((_rand() * 3) | 0), h = 4 + ((_rand() * 3) | 0);
          const span = (leg.axis === 'h') ? w : h;       // extent along the leg [REF#DG-00177]
          if (p + span - 1 > leg.to) break;
          // DIRECT ATTACH (Mark 2026-08-01: "MOST WORKERS ROOMS ARE ATTACHED DIRECTLY TO THE MAINHALL, [REF#DG-00178]
          // NO SUBHALLWAYS OF 2+ TILES"). The recess ROLL is kept (stream-identical seeds — every draw
          // downstream stays aligned) but the value is pinned to 0: stub = exactly 1 threshold tile +
          // the door on the room's own wall ring. Restore the 1-2 tile recess: window._roomRecess=true.
          const _recRoll = (_rand() * 2) | 0;
          const rec = (typeof window !== 'undefined' && window._roomRecess === true) ? _recRoll : 0;
          // MINI L-TURN ROOM CORRIDORS — ⛔ DEFAULT OFF SINCE 2026-07-27 (see the DISABLED-FEATURES REGISTER [REF#DG-00179]
          // in Origami.RealityEngine.9.html). Mark 2026-07-27: "can you remove the tiny l-shape hallways going to
          // rooms, just normal rooms, but the main halls MUST BE L-SHAPED 2 tile wide that connects each
          // section." SUPERSEDES his 2026-07-26 "now you can make mini L-turns that connect to other rooms
          // inside each section" — the later word wins, and the sentence draws the line for us: the L-shape
          // is the MAIN HALL's signature, and repeating it on every little room connector was diluting it.
          // Rooms now use the straight stub (the original spine contract): one midpoint door, 1-2 tiles out.
          // The MAIN HALL geometry is deliberately untouched by this change — see the note at _buildLHalls.
          // Restore the mini-Ls with window._miniLStubs = true.
          // WHAT IT DID, so it can be brought back exactly: ~55% of rooms hung off a small L — out 2-3 tiles,
          // 90° turn ±2-3 along the hall, then into the room's midpoint door. Contract preserved either way:
          // the door has exactly 1 CORR neighbour; bend tiles have 2 (the junction gate flags ≥3); the whole
          // path is all-ROCK-checked before carving so it cannot pierce rooms or halls.
          const _L = (typeof window !== 'undefined' && window._miniLStubs === true) && _rand() < 0.55;
          const _Ld  = _L ? 2 + ((_rand() * 2) | 0) : 0;                                        // L depth 2-3 [REF#DG-00180]
          const _Lat = _L ? ((_rand() < 0.5 ? -1 : 1) * (2 + ((_rand() * 2) | 0))) : 0;         // ±2-3 along the leg [REF#DG-00181]
          let rx, ry, doorX, doorY, stub = [];
          if (leg.axis === 'h') {
            const ax = p + (w >> 1);                      // hall attach column [REF#DG-00182]
            const cx = ax + _Lat;                          // room midpoint column (=ax when straight) [REF#DG-00183]
            const hr = side ? leg.rows[0] : leg.rows[1];   // hall edge row [REF#DG-00184]
            const dir = side ? -1 : 1;                     // out of the hall [REF#DG-00185]
            if (_L) {
              for (let k = 1; k <= _Ld; k++) stub.push([ax, hr + dir * k]);                      // out [REF#DG-00186]
              const sg = _Lat > 0 ? 1 : -1;
              for (let k = 1; k <= Math.abs(_Lat); k++) stub.push([ax + sg * k, hr + dir * _Ld]); // the turn [REF#DG-00187]
              stub.push([cx, hr + dir * (_Ld + 1)]);                                             // riser into the door [REF#DG-00188]
              doorY = hr + dir * (_Ld + 2);
            } else {
              for (let k = 1; k <= rec + 1; k++) stub.push([ax, hr + dir * k]);
              doorY = hr + dir * (rec + 2);
            }
            doorX = cx; rx = cx - (w >> 1); ry = side ? doorY - h + 1 : doorY;
          } else {
            const ay = p + (h >> 1);
            const cy = ay + _Lat;
            const hc = side ? leg.cols[0] : leg.cols[1];
            const dir = side ? -1 : 1;
            if (_L) {
              for (let k = 1; k <= _Ld; k++) stub.push([hc + dir * k, ay]);
              const sg = _Lat > 0 ? 1 : -1;
              for (let k = 1; k <= Math.abs(_Lat); k++) stub.push([hc + dir * _Ld, ay + sg * k]);
              stub.push([hc + dir * (_Ld + 1), cy]);
              doorX = hc + dir * (_Ld + 2);
            } else {
              for (let k = 1; k <= rec + 1; k++) stub.push([hc + dir * k, ay]);
              doorX = hc + dir * (rec + 2);
            }
            doorY = cy; ry = cy - (h >> 1); rx = side ? doorX - w + 1 : doorX;
          }
          const attach = (leg.axis === 'h') ? [p + (w >> 1), side ? leg.rows[0] : leg.rows[1]] : [side ? leg.cols[0] : leg.cols[1], p + (h >> 1)];
          // ── SHARED WALLS ON FLOORS 2+ (Mark 2026-08-19: "go for shared walls. only 1 wall pane [REF#DG-00189]
          //    will seperate hallway from room") ──────────────────────────────────────────────────
          //    clearAreaShared's own note said "porting _buildLHalls (floors 2+) is a later, measured
          //    step". This is that step. MEASURED FIRST (probe-shared-walls --level 2): floors 2+ had
          //    **ZERO** sandwiched wall tiles on every seed — not one shared wall anywhere in the
          //    dungeon — because this generator was still on clearArea's 1-tile ROCK border. Both arms
          //    of the A/B came back byte-identical, which is what proved the predicate never reached
          //    here. window._sharedWalls=false still falls straight through to clearArea (:305).
          if (rx < 1 || ry < 1 || rx + w > GW - 1 || ry + h > GH - 1 || !clearAreaShared(rx, ry, w, h)
              || nearGate(leg, leg.axis === 'h' ? doorX : doorY)
              || T[attach[0]][attach[1]] !== CORR
              || !stub.every(([sx, sy]) => T[sx][sy] === ROCK)) { p += 1; continue; }
          const r = carve(rx, ry, w, h, 'room'); dung.push(r);
          r._attachKey = attach[0] + ',' + attach[1];
          T[doorX][doorY] = DOOR; doorList.push([doorX, doorY]);
          for (const [sx, sy] of stub) { T[sx][sy] = CORR; _spineSegmentOf.set(sx + ',' + sy, _secOf(pathIdx.get(r._attachKey) ?? 0)); }
          //    STRIDE, same reasoning as _place (:2604): span + 1 leaves a rock gutter by construction, [REF#DG-00190]
          //    so a looser predicate alone would change nothing. span - 1 lands the next room's wall
          //    course ON the previous room's, which carve() rewrites idempotently (:85).
          p += (((typeof window !== "undefined" && window && window._sharedWalls === true)) ? span - 1 : span + 1) + ((_rand() * 2) | 0);
        }
      }
    };
    // ── SPECIAL EVENT ROOMS (Mark 2026-08-01: "MAKE SURE TO ADD 15X15 20X20 SPECIAL EVENT ROOMS [REF#DG-00191]
    //    (FACTORY) CAFETERIA IS 15X6, MORE LONGER LIKE SERVING IN A BUFFET"). Placed BEFORE the normal
    //    room pass so the small rooms flow around them via clearArea. Deterministic scan order with
    //    ZERO _rand() draws → the RNG stream downstream is untouched (same konbini discipline). Each
    //    size ladder degrades until the compact grid accepts it — the 66×46 grid cannot clear a true
    //    20×20 inside the horseshoe (the belly is ~19 tall and the corner arcs bite the corners), so
    //    the factory lands at the biggest of 20/18/16/15 that fits; the ladder keeps the ORDER honest
    //    on any future grid resize. Same attach contract as placeAlong with rec=0: 1-tile stub, door
    //    on the room's wall ring at the exact midpoint (doorRuleViolations' off===0 rule).
    // ── A SPECIAL BELONGS TO A SECTION, NOT TO WHEREVER IT FIRST FITS ─────────────────────────────
    //    `wantSec` is the section `Creator.SPECIAL_BUILDING` assigns this building to. The scan below
    //    was first-fit across every leg in order, so the factory simply took the first hole big enough
    //    — measured on floors 2 and 3, that put the factory in section 1 while section 1 is the
    //    CAFETERIA's, and section 2 ended up with no special at all. Three of the four
    //    `section-special` violations per floor were that, and nothing was wrong with the buildings.
    //    ⚠ THE SECTION IS A PREFERENCE WITH A FALLBACK, NOT A HARD REQUIREMENT. A pass that could only
    //      ever place in one section would return null on a seed where that section has no room for a
    //      20x20, and `_placeSpecial` returning null costs the whole floor a reroll (up to 2000 of
    //      them). So it scans the wanted section first and only then anywhere — a misplaced special is
    //      a warning; a floor that cannot generate is not.
    const _placeSpecial = (tag, sizes, wantSec) => {
      for (const _pass of (wantSec ? [wantSec, null] : [null]))
      for (const [w, h] of sizes) {
        for (const leg of legs) {
          for (const side of [true, false]) {
            for (let ax = leg.from; ax <= leg.to; ax++) {
              let rx, ry, doorX, doorY, stub;
              if (leg.axis === 'h') {
                const hr = side ? leg.rows[0] : leg.rows[1]; const dir = side ? -1 : 1;
                stub = [[ax, hr + dir]]; doorX = ax; doorY = hr + dir * 2;
                rx = ax - (w >> 1); ry = side ? doorY - h + 1 : doorY;
              } else {
                const hc = side ? leg.cols[0] : leg.cols[1]; const dir = side ? -1 : 1;
                stub = [[hc + dir, ax]]; doorY = ax; doorX = hc + dir * 2;
                ry = ax - (h >> 1); rx = side ? doorX - w + 1 : doorX;
              }
              const attach = (leg.axis === 'h') ? [ax, side ? leg.rows[0] : leg.rows[1]]
                                                : [side ? leg.cols[0] : leg.cols[1], ax];
              if (rx < 1 || ry < 1 || rx + w > GW - 1 || ry + h > GH - 1 || !clearAreaShared(rx, ry, w, h)
                  || nearGate(leg, leg.axis === 'h' ? doorX : doorY)
                  || T[attach[0]][attach[1]] !== CORR
                  || !stub.every(([sx, sy]) => T[sx][sy] === ROCK)) continue;
              // First pass: only the section this building is assigned to. Second pass (_pass null): [REF#DG-01363]
              // anywhere, so a cramped seed still generates rather than burning 2000 rerolls.
              if (_pass !== null && _secOf(pathIdx.get(attach[0] + ',' + attach[1]) ?? 0) !== _pass) continue;
              const r = carve(rx, ry, w, h, tag); dung.push(r);
              r._attachKey = attach[0] + ',' + attach[1]; r._special = tag;
              T[doorX][doorY] = DOOR; doorList.push([doorX, doorY]);
              for (const [sx, sy] of stub) { T[sx][sy] = CORR; _spineSegmentOf.set(sx + ',' + sy, segOfIdx(pathIdx.get(r._attachKey) ?? 0)); }
              return r;
            }
          }
        }
      }
      return null;   // no fit on this grid — reroll-safe (dung count / per-seg gates still decide) [REF#DG-00192]
    };
    if (typeof window === 'undefined' || window._specialEventRooms !== false) {
      // ONE REGISTRY. Which building belongs to which section is `Creator.SPECIAL_BUILDING` and [REF#DG-01364]
      // nothing else — a literal here is how the two drift apart, which is why the table was pulled
      // out of this file in the first place (see the note above `_specialBuildingTable`).
      const _SB = _specialBuildingTable();
      const _secFor = (t) => { for (const k of Object.keys(_SB)) if (_SB[k] === t) return +k; return null; };
      // Sizes stay per-building: Mark 2026-08-01 "SPECIAL EVENT ROOMS (FACTORY) CAFETERIA IS 15X6". [REF#DG-01365]
      // ⭐ STORAGE IS NEW HERE. `SPECIAL_BUILDING` has assigned `storage` to section 3 since the
      //    three-section ruling, and this generator never placed one — so section 3 has been failing
      //    `section-special` on every procedural floor for a reason no amount of moving the other two
      //    could fix: the room did not exist. 12x8 keeps it a warehouse rather than a hall.
      // ── THE DEALT TRIO, BY TAG (Mark 2026-09-11: "fix floor 2 with its own unique special rooms") ──
      //    These three lines used to read `_placeSpecial('factory', …)` / cafeteria / storage as literals,
      //    which made every floor's wings the floor-1 trio no matter what `_SB` said. The deal is now the
      //    only source: whatever `Creator.dealSectionSpecials(seed, level)` assigned to sections 1-3 is what
      //    gets carved, each with its own ladder from `Creator.SPECIAL_SIZES` (the three floor-1 ladders are
      //    byte-identical to the literals that stood here). Largest footprint first, as before, so the
      //    biggest building claims its hole before the small ones fragment the leg.
      const _crS = (typeof Creator !== 'undefined' && Creator) || (global && global.Creator);
      const _dealt = [1, 2, 3].map(sec => ({ sec, tag: _SB[sec] })).filter(d => d.tag && d.tag !== 'room' && d.tag !== 'guard');
      for (const d of _dealt) d.sizes = (_crS && typeof _crS.specialSizesFor === 'function') ? _crS.specialSizesFor(d.tag) : [[8, 6], [6, 6]];
      _dealt.sort((a, b) => (b.sizes[0][0] * b.sizes[0][1]) - (a.sizes[0][0] * a.sizes[0][1]));
      for (const d of _dealt) _placeSpecial(d.tag, d.sizes, d.sec);

      // ── FURNISH THE CORE (Mark 2026-09-08: "add those fillers: archery, bathhouse ... armory, [REF#DG-01386]
      //    7-11 store, casino, factory 2, factory 3, etc - bigger for each level, succubus rooms,
      //    prison, graveyard, all rooms dungeon keeper had").
      //    ⚠ THESE DO NOT GO IN SECTION 0, and an earlier cut of this block put them there. Mark,
      //      2026-09-08: "section 0 is always player start section, hallway, caberet, dressing room.
      //      you know this." Section 0 is a FIXED cast of rooms, not a shelf for spare content —
      //      furnishing it with a bathhouse to satisfy a room-count gate was fixing the symptom of
      //      the `dung`/`rooms` bug documented at that gate, and it would have quietly redefined the
      //      one section whose composition he has stated more often than any other.
      //      So the fillers carry NO section preference: `_placeSpecial(tag, sizes, null)` puts them
      //      wherever they fit, which is the LEGS — sections 1-3, the wings that are meant to vary.
      //    OFF: window._fillerRooms = false.
      // ⛔ SUPERSEDED 2026-09-18 by Mark: the filler pass is now OFF BY DEFAULT and opt-in via
      //    `?fillers=1`. He described the result as "a crowd of wierd shape rooms and halls" and, asked
      //    which piece to cut, chose "the bad cluster inside each section".
      //    WHY THIS PASS IS THAT CLUSTER, from its own comment above rather than by assumption: the
      //    sections already receive their designed population from the LATTICE (~:3155, Mark 2026-08-04
      //    "6-8 rooms in each section"). This pass adds MORE rooms afterwards, with `sec = null`, i.e.
      //    no section preference at all — they land wherever they fit. So a section's composition is
      //    its authored 6-8 plus an unbounded, unplaced remainder. That is an appended cluster by
      //    construction, and it is the only pass that puts rooms in a section beyond the lattice.
      //    ⚠ THE 09-08 ORDER IS NOT DEAD, IT IS UNHOMED. Mark asked for archery, bathhouse, armory,
      //      7-11, prison, graveyard "all rooms dungeon keeper had" — that content is wanted. What is
      //      retired is DEALING IT WITH NO SECTION PREFERENCE into sections that are already full.
      //      When these come back they need a home in the lattice, not a gap-filling scatter.
      //    ⚠ URL SWITCH, because the knob alone was unreachable: `window._fillerRooms` is read inside
      //      the engine IFRAME, so Mark could not set it from the page he loads. `?fillers=1` is read
      //      off the SHELL's search string, the same way ?showall and ?fog already are. A knob nobody
      //      can reach is a dead slider, and this repo has a family of those.
      if (_fillerRoomsOn()) {
        const _cr = (typeof Creator !== 'undefined' && Creator) || (global && global.Creator);
        const _fillers = (_cr && typeof _cr.fillerRoomsFor === 'function') ? _cr.fillerRoomsFor(_genLevel) : [];
        for (const f of _fillers) _placeSpecial(f.tag, f.sizes, null);
      }
    }
    legs.forEach((leg, i) => placeAlong(leg, (i % 2) === 0));
    if (dung.length < 10) return _lhReject('light-fill');                  // light fill → genCompact rerolls [REF#DG-00193]
    for (const r of dung) r.segmentId = _secOf(pathIdx.get(r._attachKey) ?? 0);

    // ── THE FINAL RELABEL IS GRADED ON THE SAME EVIDENCE THE RULE USES: ROOM CENTROIDS ──────────── [REF#DG-01366]
    //    The provisional pass above classified each segment by its SPINE tiles, which is all that
    //    exists before rooms are placed. It moved the violations 8 → 4 and then stalled, because a
    //    leg's corridor and the rooms hanging off it are not in the same place: section 1's spine ran
    //    WEST while its rooms' centroid measured (61.2, 59.5) against a core at (63.4, 64.3) — more
    //    NORTH than west, and the gate said so. Two populations, two answers; the rule grades rooms,
    //    so this grades rooms. `section-direction` is the check, and a check you cannot satisfy by
    //    measuring the same thing it does is a check you are guessing at.
    //    ⚠ THE CORE IS THE CABARET, exactly as the gate's anchor is — found by its own `isCabaret`/
    //      type rather than by an id, so a re-numbered floor cannot silently re-anchor this.
    //    ⚠ IT IS A PERMUTATION OF 1..3, ENFORCED. Claiming is by rank so it is deterministic, a
    //      direction can be claimed only once, and whatever is left takes the lowest free number —
    //      so no section can vanish, double up, or invent a 4.
    if (typeof window === 'undefined' || window._sectionCompass !== false) {
      // ⛔ MY FIRST VERSION LOOKED FOR THE CABARET IN `dung` AND FOUND NOTHING, so this whole block — [REF#DG-01367]
      //    including the retag below — was skipped and the gate did not move. In `_buildLHalls` the
      //    head is carved before the packer runs and is not one of these records. The core therefore
      //    resolves in three steps and always resolves: the cabaret record if it is here, else the
      //    mean of the HEART's own rooms (segment 0), else the heart's spine tiles. Never `null`, so
      //    the relabel cannot silently not happen.
      const _mid = (r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
      const outer = dung.filter(r => r.segmentId > 0);
      const _core = (() => {
        const cab = dung.find(r => r && (r.isCabaret || r.type === 'cabaret'));
        if (cab) return _mid(cab);
        const heart = dung.filter(r => r.segmentId === 0);
        if (heart.length) { let sx = 0, sy = 0; for (const r of heart) { const m = _mid(r); sx += m[0]; sy += m[1]; }
          return [sx / heart.length, sy / heart.length]; }
        let sx = 0, sy = 0, n = 0;
        for (const [k, v] of _spineSegmentOf) if (v === 0) { const c = k.split(','); sx += +c[0]; sy += +c[1]; n++; }
        return n ? [sx / n, sy / n] : null;
      })();
      // ⛔ THE ROOM-CENTROID RELABEL IS OFF BY DEFAULT, AND THE NUMBER IS WHY. Grading on the same [REF#DG-01368]
      //    evidence the rule uses is the right instinct and it measured WORSE: the spine-centroid pass
      //    alone leaves **4** violations, and switching to room centroids took it to **8**, because on
      //    this horseshoe two clusters both classify EAST and the loser is pushed onto a number whose
      //    direction it does not satisfy either. Renaming cannot place a section where there is none.
      //    Kept, not deleted — it is correct code waiting on a topology with a real west arm.
      //    On: window._sectionRoomCentroid = true.
      if (_core && outer.length && (typeof window !== 'undefined' && window._sectionRoomCentroid === true)) {
        const [kx, ky] = _core;
        const acc = new Map();                                  // provisional number -> [sumX, sumY, n] [REF#DG-01369]
        for (const r of outer) { const [mx, my] = _mid(r); const a = acc.get(r.segmentId) || [0, 0, 0];
          a[0] += mx; a[1] += my; a[2]++; acc.set(r.segmentId, a); }
        const WANT = { WEST: 1, NORTH: 2, EAST: 3 }, taken = new Set(), fin = new Map();
        const ranks = [...acc.keys()].sort((a, b) => a - b);
        for (const rk of ranks) { const a = acc.get(rk), dx = a[0] / a[2] - kx, dy = a[1] / a[2] - ky;
          const dir = (Math.abs(dx) > Math.abs(dy)) ? (dx > 0 ? 'EAST' : 'WEST') : (dy < 0 ? 'NORTH' : null);
          const n = dir ? WANT[dir] : null;
          if (n && !taken.has(n)) { taken.add(n); fin.set(rk, n); } }
        const free = [1, 2, 3].filter(n => !taken.has(n));
        for (const rk of ranks) if (!fin.has(rk)) { const n = free.shift(); fin.set(rk, (n === undefined) ? rk : n); }
        for (const r of dung) if (r.segmentId > 0) r.segmentId = fin.get(r.segmentId) ?? r.segmentId;
        for (const [k, v] of _spineSegmentOf) if (v > 0) _spineSegmentOf.set(k, fin.get(v) ?? v);
      }

      // ── AND THE BUILDING FOLLOWS THE NUMBER, BECAUSE THE NUMBER JUST MOVED ──────────────────── [REF#DG-01370]
      //    Relabelling without this would be the worst of both: the compass right and every special
      //    in the wrong section, which is the shape of the bug that was here before. A special room
      //    is a carved rectangle plus a type string, so the correction is the string. A section with
      //    no special at all is given one — its largest plain room is promoted, because a rule that
      //    silently tolerates "this section has no special" is how section 3 shipped without a
      //    storage room on every procedural floor since the three-section ruling.
      // ── SECTION 4 IS THE GUARDROOM, AND IT IS A PROMOTION RATHER THAN A CARVE ─────────────── [REF#DG-01370]
      //    Mark 2026-09-03: "sections 1-3 to activate, once done the final section 4 (guardroom) is
      //    activated". Floor 1 has had a 番所 since Section0.js was drawn; the procedural floors had
      //    NONE — measured, floors 2/3/7, zero rooms of type 'guard' and tiles resolving sections
      //    0,1,2,3 only, so `section-sequence` reported the guardroom unbuilt and was right.
      //    ⛔⛔ I TRIED CARVING IT WITH `_placeSpecial` FIRST AND IT DOES NOT WORK ON THIS TOPOLOGY.
      //      Every measurement, one node process per generation:
      //        · carved alongside factory/cafeteria/storage → LEVEL 3 SEED 11 "generation failed
      //          after retries", ALL 2000, while HEAD and `_guardRoomSection4 = false` both built 24
      //          rooms. `_placeSpecial` consumes no `_rand()` and the horseshoe geometry is FIXED, so
      //          it re-picks the SAME slot on every reroll — an unbuildable slot stays unbuildable.
      //        · carved AFTER `placeAlong` → 0 generation failures but section 4 on 1 of 16: by then
      //          the legs are full.
      //        · carved FIRST, with a stub-isolation predicate added to both placers → section 4 on
      //          4 of 16 (L2 2/6 · L3 1/6 · L7 2/6) and the floor still unbuildable on L7 seed 11.
      //      A FOURTH stub on a fixed-geometry horseshoe is simply not reliably placeable, and every
      //      attempt traded generation failures against a missing section.
      //    SO IT IS PROMOTED, WHICH IS THIS GENERATOR'S OWN ESTABLISHED PATTERN — the loop directly
      //    below already promotes a plain room when a section lacks its building, and that is how
      //    section 2 gets its factory on most seeds. No new geometry, no placement risk, and section
      //    4 is present on every floor that generates at all.
      //    ⚠ IT RUNS *BEFORE* THE RECONCILE LOOP, AND RUNNING IT AFTER SILENTLY DESTROYED THE ROOM.
      //      Measured, L3 seed 44 with the earlier carve: tiles resolved section 4 and `_roomsProbe`
      //      reported NO room of type 'guard' on the floor. The retag ran late, so at reconcile time
      //      the room still carried its donor leg's number — `_SB2[thatLeg]` is never 'guard' — and
      //      the duplicate-demote read it as an orphan special and typed it 'room'. Section 4 then
      //      existed with nothing in it, failing `section-special` on the one room it exists for.
      //    ⚠ THE DONOR SECTION MUST SURVIVE ITS OWN RULE. The room leaves a leg, so the leg loses
      //      one: a section holding exactly 2 would drop to 1 and the per-section census below would
      //      reject the whole floor. Only sections with 3+ rooms are eligible to donate.
      //    ⚠ SMALLEST ELIGIBLE ROOM, DETERMINISTICALLY. A guard post is a small room (floor 1's 番所
      //      is 5x8), and taking the smallest also leaves the biggest rooms where the casino/start
      //      scan and the depth banding expect them. Ties break on attach position, so one seed
      //      always yields one answer.
      //    ⚠ `_special` IS SET, which is what excludes it from becoming the casino or the start.
      //    Off: window._guardRoomSection4 = false → no section 4 on floors 2+, and gate:sections
      //      reports the guardroom unbuilt, which is the honest state rather than a silent pass.
      if ((typeof window === 'undefined' || window._guardRoomSection4 !== false) && !_headGuard) {   // the head's own 番所 (2026-09-11) makes the promotion moot [REF#DG-02018]
        const _perSec = {};
        for (const r of dung) _perSec[r.segmentId] = (_perSec[r.segmentId] | 0) + 1;
        const _cand = dung.filter(r => !r._special && r.segmentId > 0 && (_perSec[r.segmentId] | 0) >= 3)
          .sort((a, b) => (a.w * a.h) - (b.w * b.h)
            || ((pathIdx.get(a._attachKey) ?? 0) - (pathIdx.get(b._attachKey) ?? 0)));
        if (_cand.length) {
          const _gr = _cand[0];
          _gr.segmentId = 4; _gr.type = 'guard'; _gr._special = 'guard';
        } else { try { console.log('[DungeonChain] floor ' + _genLevel + ': no room is eligible to '
          + 'become the section-4 guardroom (every section holds only 2). gate:sections will report '
          + 'the guardroom unbuilt.'); } catch (_) {} }
      }
      const _SB2 = _specialBuildingTable();
      for (const sc of Object.keys(_SB2).map(Number)) {
        const want = _SB2[sc]; if (!want) continue;
        const mine = dung.filter(r => r.segmentId === sc);
        if (!mine.length) continue;
        // ⛔ A SECTION THAT ALREADY HAS ITS BUILDING MUST NOT BE GIVEN A SECOND ONE. Without this [REF#DG-01382]
        //    line the promote below retypes whichever `_special` room it reaches first, and MEASURED
        //    2026-09-03 on floors 2 and 3, seeds 11/22/33, that produced TWO storage rooms in section
        //    3 every time: the 18x18 FACTORY carve was retyped to 'storage' on top of the 10x8 room
        //    `_placeSpecial('storage', …)` had already built there. Two rooms answering to
        //    `isStorage` is exactly the `_storageRoomId` find()-order defect — whichever the array
        //    happens to hold first wins — and it also cost section 2 its real factory, which then had
        //    to be faked by promoting a plain 6x6.
        if (mine.some(r => r.type === want)) continue;
        let pick = mine.find(r => r._special);
        if (!pick) { pick = mine.filter(r => r.type !== 'casino')
          .sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]; }
        if (!pick) continue;
        pick.type = want; pick._special = want;
      }
      // ── ONE BUILDING PER FLOOR, NOT ONE PER SECTION THAT WANTED IT ──────────────── [REF#DG-01370]
      //    The loop above corrects each section INDEPENDENTLY, and independence is what leaves a
      //    duplicate behind. MEASURED 2026-09-03, floors 2 and 3, seeds 11/22/33 — every one:
      //    `_placeSpecial('factory', …)` carves its 18x18 against the PRE-relabel numbering, the
      //    compass relabel then renumbers that leg to section 3, and section 2 — now factory-less —
      //    gets a plain 6x6 promoted to 'factory'. Result: TWO factories on the floor, a real one
      //    in the wrong section and a small stand-in in the right one. Mark's spec is one special
      //    per section, so the orphan is demoted to a plain room rather than left as a second
      //    Factory the player can walk into.
      //    ⚠ IT DEMOTES ONLY A ROOM WHOSE TYPE IS SOME OTHER SECTION'S BUILDING. A `_special` room
      //      that IS its own section's building is untouched, and a type no section claims is left
      //      alone — this is not a blanket "clear every special that looks wrong".
      //    ⚠ `_special` IS KEPT. It is what excludes a room from becoming the casino or the start
      //      (see the {start, casino, hop} scan below); clearing it would make an 18x18 hall eligible
      //      to be the casino, which is a different change nobody asked for.
      const _claimed = new Set(Object.keys(_SB2).map(k => _SB2[k]).filter(Boolean));
      for (const r of dung) {
        if (!r._special || !_claimed.has(r.type)) continue;
        if (r.type === _SB2[r.segmentId]) continue;
        r.type = 'room';
      }
    }
    // ⚠ KEYED, NOT INDEXED, AND ONLY OVER THE LEG SECTIONS. This was `new Array(_segmentCount)` — [REF#DG-00194]
    //   four entries — indexed by `r.segmentId`. The section-4 guardroom indexes past the end:
    //   `perSeg[4]` is undefined, `undefined++` is NaN, and `NaN < 2` is FALSE, so the ">=2 rooms per
    //   section" rule would have quietly stopped rejecting thin sections the moment section 4 existed.
    //   Section 4 is deliberately NOT graded here: it is one room by design, which is also why
    //   `Creator.validateSections` exempts it from `section-min-rooms`.
    // ⛔ SECTION 0 IS NOT GRADED HERE — 2026-09-08. Mark, live in chat: "section 0 is always player
    //    start section, hallway, caberet, dressing room. you know this." It is guaranteed BY
    //    CONSTRUCTION, not by luck, and this loop was asking `dung` to prove it — an array that
    //    CANNOT hold it.
    //    THE BUG, MEASURED: `carve()` pushes to `rooms` (see its body), and the head carves the
    //    cabaret and the landing near the top of this builder. `const dung = []` is declared LATER,
    //    after the head is already built, and only ever receives LEG rooms and specials. So
    //    section 0's own rooms are structurally absent from `dung`, `perSeg[0]` counted only leg
    //    rooms that `_secOf` happened to resolve to 0, and the floor generated ONLY when that luck
    //    struck. Right value, WRONG object — the same shape this repo has been bitten by before.
    //    EVIDENCE: headless sweep 2026-09-08 — 15.0% of floor-2 generations (9/60 seeds) and 9.5%
    //    of floors 2+3 (19/200) failed outright. A census over all 125 reject sites put EVERY one
    //    of the 18,000 rejections (2000 retries x 9 seeds) on THIS line, always reporting
    //    `seg0 = 0 rooms` while sections 1-3 held 4-7 each. Engine9's register logged the same
    //    thing from the browser as ~21.7% and queued it as its own task.
    //    Sections 1..n-1 are still graded exactly as before — a WING that thin is a real defect.
    //    Section 4 was already excluded by the loop bound (see the note above). Restore the old
    //    behaviour with window._gradeSection0Rooms = true.
    { const perSeg = {}; for (const r of dung) perSeg[r.segmentId] = (perSeg[r.segmentId] | 0) + 1;
      const _from = (typeof window !== 'undefined' && window._gradeSection0Rooms === true) ? 0 : 1;
      for (let sc = _from; sc < _segmentCount; sc++) if ((perSeg[sc] | 0) < 2) return _lhReject('wing-under-2-rooms'); }   // every WING must be a real place [REF#DG-01384]

    // ── STRUCTURAL GATES — same three scans as the spine, hallSet exempts the horseshoe (incl. arcs). [REF#DG-00195]
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return _lhReject('corr-touches-floor'); }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; if (hallSet.has(x + ',' + y)) continue; let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; } if (n >= 3) return _lhReject('corr-junction'); }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== DOOR || _segmentGateTiles.has(x + ',' + y)) continue; let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++; if (c !== 1) return _lhReject('door-corr-count'); }
    if (doorRuleViolations() > 0) return _lhReject('door-rule');

    // CASINO = the room farthest along the horseshoe (north-leg tip); START = the nearest. hop = path distance 0..12. [REF#DG-00196]
    let casino = dung.find(r => !r._special) || dung[0], start = casino;
    for (const r of dung) { if (r._special) continue;    // factory/cafeteria never become the casino or the start (Mark 2026-08-01 special rooms) [REF#DG-00197]
      const pi = _pdepth(pathIdx.get(r._attachKey) ?? 0);   // hub: steps from the room's own gate, so the deepest of all three wings [REF#DG-00196]
      if (pi > _pdepth(pathIdx.get(casino._attachKey) ?? 0)) casino = r;
      if (pi < _pdepth(pathIdx.get(start._attachKey) ?? 0)) start = r; }
    // ── THE CASINO ROOM IS OFF ON THE PROCEDURAL FLOORS — A TEST, NOT A RETIREMENT ────── [REF#DG-01363]
    //    Mark 2026-09-02: "yeah remove casino for now. we will see if it works on floor 2. ok?
    //    different floors activate different rooms." — and moments later, the reason it must come
    //    back on one flag: "there will be tower defense. where monsters enter the dungeon to rob the
    //    caberet / casinos. that is why there is a guard room."
    //    ⚠ NOTHING IS DELETED AND THE SELECTION IS UNTOUCHED. `casino` is still CHOSEN (deepest room
    //      along the path), still returned in the {start, casino, hop} contract, and `hop` still bands
    //      depth off it. Only the room's TYPE stops being stamped. Flip the knob and the old
    //      behaviour returns exactly.
    //    ⛔⛔ LEVEL 7 IS EXEMPT AND THAT EXEMPTION IS LOAD-BEARING: the adapter reads
    //      `cr.type === 'casino' && level === 7` to build ONI-BABA'S SANCTUM (`isOniBaba`,
    //      roomType 'throne', 鬼婆の聖域). A blanket removal deletes the orchestrator's throne room
    //      from the game and NOTHING WOULD THROW — the room would simply come back as an ordinary one.
    //    Why it is off at all: this room was occupying section 3's slot, which is assigned `storage`,
    //    and it was the last thing failing `section-special`.
    //    Restore: window._casinoRoom = true.
    const _cg = (typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null);
    // ── FLOOR 7 GETS EVERY SPECIAL, WHICH MEANS THE SANCTUM *AND* A CASINO ─────────────────── [REF#DG-01363]
    //    Mark 2026-09-03: "floor 7 has a special rule for all rooms -- its all, ok? its a huge floor
    //    and unique." MEASURED BEFORE THIS: floor 7 had a Sanctum and NO casino. One room was doing
    //    both jobs — `casino.type = 'casino'` marked the deepest room and the adapter's
    //    `cr.type === 'casino' && level === 7` branch then turned that same room into the Sanctum,
    //    so asking for a casino on floor 7 produced a throne room and nothing else.
    //    ⚠ THE SANCTUM KEEPS THE DEEPEST ROOM. It has always been the far end of the horseshoe and
    //      the boss/descent logic is banded off `maxHop` from it; handing that slot to the casino
    //      would move Oni-Baba to a random spur. The casino takes the NEXT deepest instead.
    //    ⚠ THE CARVE TYPE FOR THE SANCTUM IS NOW `'throne'`, NOT `'casino'`. Two rooms cannot both
    //      answer to one type string, and the adapter branch that keyed the Sanctum off
    //      `casino && level === 7` is exactly what made a second casino impossible. `'throne'` is
    //      the roomType that branch already produced, so nothing downstream learns a new word.
    //      ⛔ THE REGISTER WARNS THAT REMOVING THAT BRANCH DELETES ONI-BABA'S THRONE ROOM AND
    //        NOTHING WOULD THROW — the room would just come back ordinary. It is not removed, it is
    //        re-keyed, and `isOniBaba` is the flag to measure on any floor-7 boot to prove it.
    //    ⚠ `_special` IS SET ON THE CASINO so the start/casino scan above cannot re-pick it and the
    //      building reconcile cannot retype it. Both of those ran ABOVE this line, which is also why
    //      this block is here at the end rather than up with the specials.
    //    Off: window._f7CasinoRoyale = false → floor 7 back to Sanctum-only.
    if (_genLevel === 7 && !(_cg && _cg._f7CasinoRoyale === false)) {
      casino.type = 'throne';
      // THE LARGEST free room, not the deepest (2026-09-16): the Casino Royale is a LOUNGE MODEL (Mark 2026-09-15, "I added a [REF#DG-02073]
      // new casino royale for floor 7") fitted to the room — the deepest free room measured 3×2 and 6×6 tiles on two seeds, a
      // dollhouse. Area first, depth as the tie-break, so the sanctum's deepest slot is untouched. Old pick: window._f7CasinoDeepest=true.
      // FIRST CHOICE: the casino BUILDING the filler pass carved for floor 7 (Creator.fillerRoomsFor lets `casino` through on 7
      // only — 12×10 grown to 19×16 first); the free-room promotion below is the fallback when it found no hole.
      // ⛔ SUPERSEDED 2026-10-02 by Mark: "just make a hallway 0 go straight to the casino" — the engine gives the lounge to the
      //    cabaret (hallway 0's north end) on every floor 7 and un-flags the room typed here; this pick still runs, so the
      //    generator's supervisor keeps its room. Engine register entry "FLOOR 7: THE WING CASINO GIVES THE LOUNGE TO THE CABARET";
      //    knowledge/design/FLOOR7_HALL0_CASINO_2026-10-02.md.
      const _cas = dung.find(r => r !== casino && r._special === 'casino') || dung.filter(r => r !== casino && !r._special && r.segmentId > 0)
        .sort((a, b) => ((_cg && _cg._f7CasinoDeepest === true) ? 0 : ((b.w * b.h) - (a.w * a.h))) || (_pdepth(pathIdx.get(b._attachKey) ?? 0) - _pdepth(pathIdx.get(a._attachKey) ?? 0)))[0];
      if (_cas) { _cas.type = 'casino'; _cas._special = 'casino'; }
      else { try { console.log('[DungeonChain] floor 7: no room free to become the casino — the '
        + 'Sanctum is present but the floor is Sanctum-only this seed.'); } catch (_) {} }
    } else if (_genLevel === 7) {
      // ⛔ THE BACK-OUT HAS TO SAY `throne`, AND MY FIRST VERSION SAID `casino` — WHICH DELETED [REF#DG-01404]
      //    ONI-BABA. Measured with window._f7CasinoRoyale = false: isOniBaba 0, isCasino 1. The old
      //    line worked only because the adapter branch it fed was `casino && level === 7 → Sanctum`,
      //    and that branch is exactly what this change re-keyed. A back-out knob that quietly
      //    replaces the throne room with a gambling hall is worse than no knob: the register's own
      //    warning about this room is that removing it throws nothing and the room just comes back
      //    ordinary. Sanctum-only is what "off" means here.
      casino.type = 'throne';
    } else if (_cg && _cg._casinoRoom === true) casino.type = 'casino';
    const maxIdx = Math.max(1, _pdepth(pathIdx.get(casino._attachKey) ?? 1));
    const hop = new Map(); for (const r of dung) hop.set(r, Math.round((_pdepth(pathIdx.get(r._attachKey) ?? 0) / maxIdx) * 12));
    for (const s of hallSet) mhTiles.add(s);
    // The census records HERE and nowhere earlier: this is the only line every rejected attempt fails [REF#DG-01457]
    // to reach, so _carveSpans always describes the floor that actually shipped, never a reroll.
    _carveSpans = _straightRuns(hallSet, 'lhalls-trunk');
    return { start, casino, hop };
  }

  // ── WORKER HALLS (Mark 2026-06-29): a TEST topology — the 2-wide spine TRUNK with EXACTLY four fixed 4×4 "worker cells" [REF#DG-00198]
  //    flush off each side (8 total), evenly spaced and aligned N/S, each stubbing a single door onto the trunk. A constrained
  //    _buildSpine: it reuses _buildSpine's HEAD (cabaret id1 + landing id0 + konbini L2+ + east mouth), TRUNK, STRUCTURAL GATES,
  //    doorRuleViolations + {start,casino,hop}+mhTiles contract VERBATIM — only the ROOMS pass differs (fixed small cells instead
  //    of the spine's grown rooms). One occupant per cell (see _genMobSpawns worker branch: nm=1; a lone worker, or a ghost pack
  //    via the hungry_ghost archetype). Chain-aggro is served by FIX C (sight) + _aggroMonstersNearImpact (hit/kill). The east-most
  //    cell becomes the casino (supervisor's office) so the floor loop's booth/key/exit still applies. DETERMINISTIC: consumes ZERO
  //    _rand() (fixed geometry), so it validates on the first genCompact try. Flag-gated: global._workerHalls truthy (+ optional
  //    global._workerHallsMinFloor) → here; default OFF → byte-identical to the spine path. Killswitch by clearing the flag.
  function _buildWorkerHalls() {
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK)); rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map(); _spineSegmentOf = new Map(); _segmentCount = 0;
    // HEAD — identical to _buildSpine. [REF#DG-00199]
    if (_genLevel === 1) {
      // FLOOR-1 CABARET SHRUNK 6x7 -> 5x6 (Mark 2026-07-18 "shorten caberet by 1 tile row to the North … remove 1 [REF#DG-00200 → see REF#DG-00110]
      // tile row on the west"). See the canonical note in buildDungeon() — this block is duplicated across all 4
      // generators and MUST stay identical in every one. North + west edges move in; south junction + east wall hold.
      const L1X = CABX + 1, L1Y = CABY + 1;
      CABW = 5; CABH = 6;
      DDX = L1X + CABW - 1; DDY = L1Y + 2;   // DDX holds by itself (+1 origin cancels -1 width); DDY re-based so the east door does not slide south [REF#DG-00201 → see REF#DG-00071]
      carve(L1X, L1Y, CABW, CABH, 'cabaret');
      for (let i = L1X; i < L1X + CABW; i++) for (let j = L1Y; j < L1Y + CABH; j++) T[i][j] = FLOOR;
      const HW = 4, HH = 13, HX = L1X, HY = L1Y + CABH - 1;   /* ENTRY HALLWAY = 10 LONG (Mark 2026-07-31, revised down from 12). interior = HW-2 x HH-3 = 2 x 10. MEASURED, not assumed: HH 10 gave 2x7, HH 15 gave 2x12. This head is duplicated across ALL FIVE generators and MUST stay identical — a probe caught HH changed in one copy doing nothing, because the RING generator (the live default) carries its own copy. */   // HY unchanged (origin/height cancel); HX re-based to keep the 2-wide hall at x4-5
      carve(HX, HY, HW, HH, 'landing');
      for (let x = HX + 1; x < HX + HW - 1; x++) { T[x][HY] = FLOOR; _l1Open.push([x, HY]); }
      T[L1X][HY] = WALL; T[L1X + CABW - 1][HY] = WALL;
    } else {
      CABW = 12; CABH = 10; DDX = CABX + CABW - 1; DDY = CABY + 3;
      carve(CABX, CABY, CABW, CABH, 'cabaret');
      const LANDX = CABX + 1, LANDY = CABY + CABH + 2, LANDW = 6, LANDH = 8;   // Mark 2026-07-02: entry landing stretched to a long hallway (was LANDH 5) [REF#DG-00202 → see REF#DG-00098]
      carve(LANDX, LANDY, LANDW, LANDH, 'landing');
      _carveCabEntrance(LANDY);   // 2-wide cabaret entrance + widened link corridor — see _carveCabEntrance [REF#DG-00203 → see REF#DG-00099]
      _carveKonbini(LANDX, LANDY, LANDW, LANDH);
    }
    T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]);
    // TRUNK — straight 2-wide corridor east (same as the spine). spineSet exempts it from the junction gate. [REF#DG-00204]
    const spineSet = new Set();
    const TRUNK_END = GW - 3;
    for (let vx = DDX + 1; vx <= TRUNK_END; vx++) {
      if (T[vx][DDY]     === ROCK) { T[vx][DDY]     = CORR; spineSet.add(vx + ',' + DDY); }
      if (T[vx][DDY + 1] === ROCK) { T[vx][DDY + 1] = CORR; spineSet.add(vx + ',' + (DDY + 1)); }
    }
    // ROOMS — exactly four fixed 4×4 worker cells per side (8 total), evenly spaced + aligned N/S, each stubbing ONE door. [REF#DG-00205]
    const dung = []; const RW = 4, RH = 4, PER_SIDE = 4;
    const ROOM_X0 = DDX + 6, LAST_RX = TRUNK_END - RW;
    const pitch = Math.max(RW + 1, Math.floor((LAST_RX - ROOM_X0) / (PER_SIDE - 1)));
    const placeSide = (isNorth) => {
      const doorWallY = isNorth ? (DDY - 2) : (DDY + 3);   // room wall one buffer-tile off the trunk [REF#DG-00206]
      const stubY     = isNorth ? (DDY - 1) : (DDY + 2);   // single stub tile between door and trunk [REF#DG-00207]
      const trunkRow  = isNorth ? DDY : (DDY + 1);         // trunk row the stub lands beside [REF#DG-00208]
      for (let i = 0; i < PER_SIDE; i++) {
        const rx = ROOM_X0 + i * pitch;
        const ry = isNorth ? (doorWallY - RH + 1) : doorWallY;   // north cells extend UP, south cells DOWN [REF#DG-00209]
        if (ry < 1 || ry + RH > GH - 1 || rx + RW > TRUNK_END || !clearArea(rx, ry, RW, RH)) continue;
        const cx = rx + (RW >> 1);
        if (!(T[cx] && T[cx][stubY] === ROCK && T[cx][trunkRow] === CORR)) continue;
        const r = carve(rx, ry, RW, RH, 'room'); dung.push(r);
        T[cx][doorWallY] = DOOR; doorList.push([cx, doorWallY]);
        T[cx][stubY] = CORR;
      }
    };
    placeSide(true); placeSide(false);
    if (dung.length < 6) return false;   // want most of the 8 worker cells (8 expected; tolerate a couple skipped at the grid edge) [REF#DG-00210]
    // STRUCTURAL GATES — identical to _buildSpine (spineSet exempts the 2-wide trunk from the no-3-way-junction rule) [REF#DG-00211]
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; if (spineSet.has(x + ',' + y)) continue; let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; } if (n >= 3) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== DOOR) continue; let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++; if (c !== 1) return false; }
    if (doorRuleViolations() > 0) return false;
    // CASINO = farthest-east cell (the supervisor's office); START = nearest; hop = along-trunk band (adapter section math) [REF#DG-00212]
    let casino = dung[0]; for (const r of dung) if (r.cx > casino.cx) casino = r; casino.type = 'casino';
    const start = dung.reduce((b, r) => (!b || r.cx < b.cx) ? r : b, null);
    const hop = new Map(); const hx0 = DDX + 4, hx1 = Math.max(hx0 + 1, casino.cx);
    for (const r of dung) hop.set(r, Math.round((r.cx - hx0) / (hx1 - hx0) * 12));
    for (const s of spineSet) mhTiles.add(s);
    return { start, casino, hop };
  }

  // ── RING GENERATOR (Phase G1, 2026-06-27): a PROGRESSIVE rectangular RING main hall. The 2-wide perimeter runs N→E→S→W [REF#DG-00213]
  //    (clockwise from the cabaret entry mouth at the NW corner). Each of the 4 corners carries a sealed GATE tile-pair, so the
  //    ring divides into 4 SECTIONS (SEC1=North, SEC2=East, SEC3=South, SEC4=West). Rooms branch FLUSH off each side; the casino
  //    lives in SEC4 (the far/west side). With every gate sealed the player can only walk SEC1; opening gate k reaches SEC k+1.
  //    Gate4 (W, just below the NW corner) is the NO-SHORTCUT gate: it stops the entry running straight DOWN the west side to the
  //    casino, forcing the clockwise loop. G1 only MARKS gate tiles + tags sections + emits the contract — the runtime seal/open
  //    is a later phase. Flag-gated: global._ringDungeon truthy (+ optional _ringMinFloor) → here; else _buildSpine()/buildDungeon().
  //    Mirrors _buildSpine's HEAD, structural gates, doorRuleViolations + {start,casino,hop}+mhTiles contract EXACTLY.
  function _buildRing() {
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK)); rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map(); _spineSegmentOf = new Map(); _segmentCount = 0;
    // HEAD — identical to _buildSpine/buildDungeon: cabaret id1 + landing id0 (+konbini L2+) + the east 2-tile door (entry mouth) [REF#DG-00214]
    if (_genLevel === 1) {
      // FLOOR-1 CABARET SHRUNK 6x7 -> 5x6 (Mark 2026-07-18 "shorten caberet by 1 tile row to the North … remove 1 [REF#DG-00215 → see REF#DG-00110]
      // tile row on the west"). See the canonical note in buildDungeon() — this block is duplicated across all 4
      // generators and MUST stay identical in every one. North + west edges move in; south junction + east wall hold.
      const L1X = CABX + 1, L1Y = CABY + 1;
      CABW = 5; CABH = 6;
      DDX = L1X + CABW - 1; DDY = L1Y + 2;   // DDX holds by itself (+1 origin cancels -1 width); DDY re-based so the east door does not slide south [REF#DG-00216 → see REF#DG-00071]
      carve(L1X, L1Y, CABW, CABH, 'cabaret');
      for (let i = L1X; i < L1X + CABW; i++) for (let j = L1Y; j < L1Y + CABH; j++) T[i][j] = FLOOR;
      const HW = 4, HH = 13, HX = L1X, HY = L1Y + CABH - 1;   /* ENTRY HALLWAY = 10 LONG (Mark 2026-07-31, revised down from 12). interior = HW-2 x HH-3 = 2 x 10. MEASURED, not assumed: HH 10 gave 2x7, HH 15 gave 2x12. This head is duplicated across ALL FIVE generators and MUST stay identical — a probe caught HH changed in one copy doing nothing, because the RING generator (the live default) carries its own copy. */   // HY unchanged (origin/height cancel); HX re-based to keep the 2-wide hall at x4-5
      carve(HX, HY, HW, HH, 'landing');
      for (let x = HX + 1; x < HX + HW - 1; x++) { T[x][HY] = FLOOR; _l1Open.push([x, HY]); }
      T[L1X][HY] = WALL; T[L1X + CABW - 1][HY] = WALL;
    } else {
      CABW = 12; CABH = 10; DDX = CABX + CABW - 1; DDY = CABY + 3;
      carve(CABX, CABY, CABW, CABH, 'cabaret');
      const LANDX = CABX + 1, LANDY = CABY + CABH + 2, LANDW = 6, LANDH = 8;   // Mark 2026-07-02: entry landing stretched to a long hallway (was LANDH 5) [REF#DG-00217 → see REF#DG-00098]
      carve(LANDX, LANDY, LANDW, LANDH, 'landing');
      _carveCabEntrance(LANDY);   // 2-wide cabaret entrance + widened link corridor — see _carveCabEntrance [REF#DG-00218 → see REF#DG-00099]
      _carveKonbini(LANDX, LANDY, LANDW, LANDH);
    }
    T[DDX][DDY] = DOOR; T[DDX][DDY + 1] = DOOR; doorList.push([DDX, DDY], [DDX, DDY + 1]);   // the ENTRY mouth (rows DDY, DDY+1) [REF#DG-00219]

    // ── RING RECTANGLE: a 2-wide CORR perimeter. North rows align with the entry mouth; NW corner == the entry's landing point. [REF#DG-00220]
    //    The east/south bands are pulled ~10 tiles off the grid edge so N/E/S rooms have an exterior APRON to sit in (GW=66,GH=46
    //    leaves no exterior room if the ring hugs the edge). The large WEST interior holds the inward-facing west rooms.
    const NY0 = DDY, NY1 = DDY + 1;          // north band rows (the entry mouth rows) [REF#DG-00221]
    const RXW = DDX + 4, RXW1 = RXW + 1;     // west band cols (the inner+outer of the 2-wide west run) [REF#DG-00222]
    const RXE = GW - 10, RXE1 = RXE - 1;     // east band cols (apron x:RXE+2..GW-2 holds the east rooms) [REF#DG-00223]
    const SY1 = GH - 10, SY0 = SY1 - 1;      // south band rows (apron y:SY1+2..GH-2 holds the south rooms; SY0 inner, SY1 outer) [REF#DG-00224]
    const ringSet = new Set();
    const carveRing = (x, y) => { if (T[x] && T[x][y] === ROCK) { T[x][y] = CORR; ringSet.add(x + ',' + y); } };
    // North & south bands (full width between the west and east cols) [REF#DG-00225]
    for (let x = RXW; x <= RXE; x++) { carveRing(x, NY0); carveRing(x, NY1); carveRing(x, SY0); carveRing(x, SY1); }
    // West & east bands (full height between the north and south rows) [REF#DG-00226]
    for (let y = NY0; y <= SY1; y++) { carveRing(RXW, y); carveRing(RXW1, y); carveRing(RXE, y); carveRing(RXE1, y); }

    // ── ENTRY CORRIDOR: connect the head door (rows DDY,DDY+1 at x=DDX) east to the ring's NW corner. [REF#DG-00227]
    for (let x = DDX + 1; x < RXW; x++) { if (T[x][NY0] === ROCK) { T[x][NY0] = CORR; ringSet.add(x + ',' + NY0); } if (T[x][NY1] === ROCK) { T[x][NY1] = CORR; ringSet.add(x + ',' + NY1); } }

    // ── 4 CORNERS → 4 GATES: a 2-tile span on the STRAIGHT NECK just past each corner (perpendicular to travel), CORR→DOOR. [REF#DG-00228]
    //    Gate1 SEC1→2 EAST band just below the NE corner; Gate2 SEC2→3 SOUTH band just inside SE; Gate3 SEC3→4 WEST band just
    //    above SW; Gate4 SEC4→entry WEST band just below NW (the NO-SHORTCUT seal). Each pair spans the 2-wide run, mid-corridor.
    const gateDefs = [
      { gateIndex: 1, sectionFrom: 1, sectionTo: 2, tiles: [[RXE1, NY0 + 2], [RXE, NY0 + 2]] },   // east side, horizontal pair, below NE [REF#DG-00229]
      { gateIndex: 2, sectionFrom: 2, sectionTo: 3, tiles: [[RXE - 2, SY0], [RXE - 2, SY1]] },     // south side, vertical pair, inside SE [REF#DG-00230]
      { gateIndex: 3, sectionFrom: 3, sectionTo: 4, tiles: [[RXW, SY1 - 2], [RXW1, SY1 - 2]] },    // west side, horizontal pair, above SW [REF#DG-00231]
      { gateIndex: 4, sectionFrom: 4, sectionTo: 1, tiles: [[RXW, NY0 + 2], [RXW1, NY0 + 2]] }     // west side, horizontal pair, below NW — NO-SHORTCUT [REF#DG-00232]
    ];
    for (const g of gateDefs) for (const [gx, gy] of g.tiles) {
      if (!(T[gx] && T[gx][gy] === CORR)) return false;   // gate must land on a clean ring CORR run, else retry (geometry guard) [REF#DG-00233]
      T[gx][gy] = DOOR; doorList.push([gx, gy]);
      _sectionGateTiles.set(gx + ',' + gy, { gateIndex: g.gateIndex, sectionFrom: g.sectionFrom, sectionTo: g.sectionTo });
    }

    // ── SECTION TAGGING: every ring CORR tile gets a section 1..4 by which SIDE band it lies on (clockwise from entry). [REF#DG-00234]
    //    The entry corridor + the north band == SEC1; east band == SEC2; south band == SEC3; west band == SEC4 (the casino side).
    for (const key of ringSet) {
      const [sx, sy] = key.split(',').map(Number);
      const onN = (sy === NY0 || sy === NY1), onS = (sy === SY0 || sy === SY1), onW = (sx === RXW || sx === RXW1), onE = (sx === RXE || sx === RXE1);
      let sec;
      if (onN && !onE) sec = 1;              // north band + entry corridor (exclude the NE corner cells → they read as east) [REF#DG-00235]
      else if (onE) sec = 2;                 // east band (incl. NE / SE corner cells) [REF#DG-00236]
      else if (onS && !onW) sec = 3;         // south band (exclude SW corner cells → west) [REF#DG-00237]
      else if (onW) sec = 4;                 // west band (incl. SW corner cells; casino lives here) [REF#DG-00238]
      else sec = 1;
      _ringSectionOf.set(key, sec);
    }

    // ── ROOMS branch off each side, FLUSH outside the ring, each stubbing ONE midpoint door onto its side (single stub tile). [REF#DG-00239]
    //    N rooms extend NORTH, S rooms SOUTH, E rooms EAST; WEST rooms extend EAST INTO the interior (the head owns the west
    //    exterior). Each side gets a clockwise walk; every room tagged r.sectionIndex; every section must reach ≥2 rooms.
    const dung = [];
    const secCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
    // placeAlongSide: side ∈ 'N'|'E'|'S'|'W'; rooms sit flush to the outer ring band and stub one door onto the band. [REF#DG-00240]
    const placeAlongSide = (side, sectionIndex) => {
      if (side === 'N') {
        // North band rows NY0(inner)/NY1? entry mouth is NY0,NY1; the OUTER (north-facing) band row is NY0. Rooms extend NORTH (up). [REF#DG-00241]
        const bandRow = NY0, stubY = bandRow - 1, doorWallY = bandRow - 2;   // room wall one buffer-tile north of the band [REF#DG-00242]
        let x = RXW + 3;
        while (x <= RXE - 3) {
          const w = 5 + ((_rand() * 5) | 0), h = 5 + ((_rand() * 5) | 0);
          const rx = x, ry = doorWallY - h + 1;
          if (ry < 1 || rx + w > RXE - 1 || !clearArea(rx, ry, w, h)) { x += 1; continue; }
          const cx = rx + (w >> 1);
          if (!(T[cx] && T[cx][stubY] === ROCK && T[cx][bandRow] === CORR && _ringSectionOf.get(cx + ',' + bandRow) === sectionIndex)) { x += 1; continue; }
          const r = carve(rx, ry, w, h, 'room'); r.sectionIndex = sectionIndex; dung.push(r); secCount[sectionIndex]++;
          T[cx][doorWallY] = DOOR; doorList.push([cx, doorWallY]); T[cx][stubY] = CORR;
          x = rx + w + 1;
        }
      } else if (side === 'S') {
        const bandRow = SY1, stubY = bandRow + 1, doorWallY = bandRow + 2;   // room wall one buffer-tile south of the band; rooms extend SOUTH (down) [REF#DG-00243]
        let x = RXW + 3;
        while (x <= RXE - 3) {
          const w = 5 + ((_rand() * 5) | 0), h = 5 + ((_rand() * 5) | 0);
          const rx = x, ry = doorWallY;
          if (ry + h > GH - 1 || rx + w > RXE - 1 || !clearArea(rx, ry, w, h)) { x += 1; continue; }
          const cx = rx + (w >> 1);
          if (!(T[cx] && T[cx][stubY] === ROCK && T[cx][bandRow] === CORR && _ringSectionOf.get(cx + ',' + bandRow) === sectionIndex)) { x += 1; continue; }
          const r = carve(rx, ry, w, h, 'room'); r.sectionIndex = sectionIndex; dung.push(r); secCount[sectionIndex]++;
          T[cx][doorWallY] = DOOR; doorList.push([cx, doorWallY]); T[cx][stubY] = CORR;
          x = rx + w + 1;
        }
      } else if (side === 'E') {
        const bandCol = RXE, stubX = bandCol + 1, doorWallX = bandCol + 2;   // room wall one buffer-tile east of the band; rooms extend EAST (right) [REF#DG-00244]
        let y = NY1 + 3;
        while (y <= SY0 - 3) {
          const w = 5 + ((_rand() * 5) | 0), h = 5 + ((_rand() * 5) | 0);
          const rx = doorWallX, ry = y;
          if (rx + w > GW - 1 || ry + h > GH - 1 || !clearArea(rx, ry, w, h)) { y += 1; continue; }
          const cy = ry + (h >> 1);
          if (!(T[stubX] && T[stubX][cy] === ROCK && T[bandCol][cy] === CORR && _ringSectionOf.get(bandCol + ',' + cy) === sectionIndex)) { y += 1; continue; }
          const r = carve(rx, ry, w, h, 'room'); r.sectionIndex = sectionIndex; dung.push(r); secCount[sectionIndex]++;
          T[doorWallX][cy] = DOOR; doorList.push([doorWallX, cy]); T[stubX][cy] = CORR;
          y = ry + h + 1;
        }
      } else { // 'W' — west-side rooms extend EAST, INTO the ring interior (the head owns the west exterior) [REF#DG-00245]
        // West band cols are RXW(outer/west) & RXW1(inner/east). Interior lies EAST of RXW1 → west rooms sit flush EAST of RXW1. [REF#DG-00246]
        const innerCol = RXW1, iStubX = innerCol + 1, iDoorWallX = innerCol + 2;
        let y = NY1 + 3;
        while (y <= SY0 - 3) {
          const w = 5 + ((_rand() * 5) | 0), h = 5 + ((_rand() * 5) | 0);
          const rx = iDoorWallX, ry = y;
          if (rx + w > RXE1 - 1 || ry + h > GH - 1 || !clearArea(rx, ry, w, h)) { y += 1; continue; }   // stay clear of the east band rooms (RXE1-1 cap) [REF#DG-00247]
          const cy = ry + (h >> 1);
          if (!(T[iStubX] && T[iStubX][cy] === ROCK && T[innerCol][cy] === CORR && _ringSectionOf.get(innerCol + ',' + cy) === sectionIndex)) { y += 1; continue; }
          const r = carve(rx, ry, w, h, 'room'); r.sectionIndex = sectionIndex; dung.push(r); secCount[sectionIndex]++;
          T[iDoorWallX][cy] = DOOR; doorList.push([iDoorWallX, cy]); T[iStubX][cy] = CORR;
          y = ry + h + 1;
        }
      }
    };
    placeAlongSide('N', 1); placeAlongSide('E', 2); placeAlongSide('S', 3); placeAlongSide('W', 4);
    // ⛔ SUPERSEDED 2026-09-02 — this demanded ≥2 rooms in SECTION 4, which no longer exists. Left as [REF#DG-01371]
    //    a literal `secCount[4]` it reads 0 forever, returns false on every attempt, and burns all
    //    2000 genCompact retries before the floor fails to build at all. The requirement itself is
    //    unchanged: every section that EXISTS must be a real place. It is now read off the same
    //    Creator table that decides which sections exist, so retiring or adding one moves this too.
    { const _need = Object.keys(_specialBuildingTable()).map(Number);
      const _secs = _need.length ? _need : [1, 2, 3];
      if (_secs.some(n => (secCount[n] | 0) < 2)) return false; }   // each section needs ≥2 rooms; genCompact retries [REF#DG-00248]

    // ── STRUCTURAL GATES — identical to _buildSpine, with ringSet as the junction exemption; gate DOORs exempt from the [REF#DG-00249]
    //    "DOOR touches exactly 1 CORR" scan (a ring gate sits mid-corridor touching 2 CORR by design).
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; if (ringSet.has(x + ',' + y)) continue; let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; } if (n >= 3) return false; }
    for (let x = DDX + 2; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== DOOR) continue; if (_sectionGateTiles.has(x + ',' + y)) continue; let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++; if (c !== 1) return false; }
    if (doorRuleViolations() > 0) return false;

    // ── casino / start / hop — START = room nearest the entry (SEC1 / NW); CASINO = a SEC4 room farthest along the clockwise [REF#DG-00250]
    //    order; hop = monotonic 0..~12 by clockwise ring order so the adapter's section banding still works.
    const sec1Rooms = dung.filter(r => r.sectionIndex === 1);
    const start = (sec1Rooms.length ? sec1Rooms : dung).reduce((b, r) => { const L = Math.abs(r.cx - (RXW + 1)) + Math.abs(r.cy - NY0); return (!b || L < b.L) ? { r, L } : b; }, null).r;
    const sec4Rooms = dung.filter(r => r.sectionIndex === 4);
    // SEC4 (west band) runs vertically; "farthest along clockwise" on the west side = nearest the NW corner (smallest cy, top of the band). [REF#DG-00251]
    const casino = sec4Rooms.reduce((b, r) => (!b || r.cy < b.cy) ? r : b, null);
    if (!casino) return false;
    casino.type = 'casino';
    // clockwise ordinal of each ring CORR tile (0 at the NW corner, increasing N→E→S→W) → room hop by its stub's ring position. [REF#DG-00252]
    const ringOrdinal = (rx, ry) => {
      const onN = (ry === NY0 || ry === NY1), onE = (rx === RXE || rx === RXE1), onS = (ry === SY0 || ry === SY1), onW = (rx === RXW || rx === RXW1);
      const Wn = RXE - RXW, Hn = SY1 - NY0;
      if (onN && !onE) return (rx - RXW);                              // 0..Wn along the top [REF#DG-00253]
      if (onE) return Wn + (ry - NY0);                                 // down the right [REF#DG-00254]
      if (onS && !onW) return Wn + Hn + (RXE - rx);                    // back along the bottom [REF#DG-00255]
      return 2 * Wn + Hn + (SY1 - ry);                                 // up the left [REF#DG-00256]
    };
    const totalOrd = 2 * (RXE - RXW) + 2 * (SY1 - NY0);
    const hop = new Map();
    for (const r of dung) {
      // each room's onto-ring stub sits at its midpoint column/row on its band → derive an ordinal from the room centre projected onto its side [REF#DG-00257]
      let ord;
      if (r.sectionIndex === 1) ord = ringOrdinal(r.cx, NY0);
      else if (r.sectionIndex === 2) ord = ringOrdinal(RXE, r.cy);
      else if (r.sectionIndex === 3) ord = ringOrdinal(r.cx, SY1);
      else ord = ringOrdinal(RXW, r.cy);
      hop.set(r, Math.round(ord / Math.max(1, totalOrd) * 12));
    }
    for (const s of ringSet) mhTiles.add(s);
    return { start, casino, hop };
  }

  // ── HEART GENERATOR (Mark 2026-08-03) — THE MEMORIAL LAYOUT. [REF#DG-00258]
  //    Mark's father played original NetHack for years; this game is a memorial to both his parents. The dungeon
  //    grammar therefore IS NetHack's — big rectangular walled rooms of varied size, scattered across the floor,
  //    joined by plain corridors with doors in the walls. That is not a tuning preference to be traded off against
  //    tile efficiency or section bookkeeping; it is the thing being honoured. Mark, after rejecting the quadrant
  //    sprawl outright ("this map makes 0 sense at all - its ugly and unusuable … use standard nethack dungeon if
  //    you are confused"), gave the shape in one sentence:
  //       "section 0 is the central heart, all it is is a stairway leading to a main 2-tile hallway that
  //        surrounds a caberet room. this hallway connects to all 4 dungeon sections."
  //    THE LESSON _buildQuadrant TAUGHT: sections are an OVERLAY on NetHack rooms, never a rival carving grammar.
  //    That generator authored its own box-packing + ring + spur routing in order to *express* sections, and the
  //    output was corridor spaghetti. Here the rooms and corridors come from the SAME rectangle-subdivision + MST
  //    routine buildDungeon() has always used; a room's section is simply which pinwheel zone it landed in, and
  //    nothing in the room grammar knows sections exist.
  //    LAYOUT: _carveHead (room 0 landing + room 1 cabaret + the L2+ konbini, which is dedicated to Mark's parents)
  //    is placed at the CENTRE of the grid and is NOT modified here. A WALL course hugs it, a 2-wide CORR ring
  //    wraps that, and four sectionGate doors leave the ring N/E/S/W into four pinwheel zones of NetHack rooms.
  //    Four is exactly what the adapter wants ("the contract demands exactly four of those or none" — see the
  //    sectionGate emit) so the linear `segmentTo === segmentFrom + 1` chain is not involved at all. That chain
  //    belongs to the spine/quadrant generators and it fought this shape hard the last two times.
  function _buildHeart() {
    const _reset = () => {
      T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK));
      rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
      _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map();
      _spineSegmentOf = new Map(); _segmentCount = 0;
    };
    // MEASURE the head, never assume it. The Floor-1 head (5×6 cabaret + the 10-tile poster hallway) and the L2+ [REF#DG-00259]
    // head (12×10 cabaret + landing + konbini) differ on BOTH axes, and assuming that footprint is exactly what
    // left the heart 6 tiles south of centre the last time this was attempted. So: trial-carve at (1,1), read the
    // real bounding box off the tile grid, throw it away, and carve again at the origin that centres it.
    const _bbox = () => {
      let a = GW, b = GH, c = -1, d = -1;
      for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if (T[x][y] !== ROCK) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
      return { x0: a, y0: b, x1: c, y1: d, w: c - a + 1, h: d - b + 1 };
    };
    // WEST-WING RESERVATION. The adapter stamps Starlette's 楽屋 dressing room + the 支配人室 manager's office [REF#DG-00260]
    // straight into the map at cab.x-10 … cab.x-2 (see the west-wing block), AFTER this generator has run and
    // with no idea what is already there. They are part of the cabaret's world and they belong INSIDE the heart,
    // so the ring has to be pushed 10 tiles further out on the west side and the head centred against the wider
    // footprint. Without this the ring hallway gets stamped over by two 3×3 rooms.
    const WWW = 10;
    _reset(); _carveHead(1, 1);
    const probe = _bbox(); if (probe.x1 < 0) return false;
    const ox = Math.max(1, ((GW - (probe.w + WWW)) >> 1) + WWW - (probe.x0 - 1));   // origin→bbox offset is constant, so centring is one subtraction per axis [REF#DG-00261]
    const oy = Math.max(1, ((GH - probe.h) >> 1) - (probe.y0 - 1));
    _reset();
    const head = _carveHead(ox, oy);
    const H = _bbox();

    // ── WALL course hugging the head, then the 2-WIDE CORR RING outside it. The wall course is load-bearing: the [REF#DG-00262]
    //    Floor-1 cabaret is THIN-WALLED (the whole room is FLOOR so the medallion panels can cover its perimeter),
    //    and a CORR tile flush against FLOOR fails the structural gate below. The wall is what keeps them apart.
    const WX0 = H.x0 - 1 - WWW, WY0 = H.y0 - 1, WX1 = H.x1 + 1, WY1 = H.y1 + 1;
    const RX0 = H.x0 - 3 - WWW, RY0 = H.y0 - 3, RX1 = H.x1 + 3, RY1 = H.y1 + 3;
    if (RX0 < 2 || RY0 < 2 || RX1 > GW - 3 || RY1 > GH - 3) return false;   // heart would leave no grid for the zones → caller falls back [REF#DG-00263]
    for (let x = WX0; x <= WX1; x++) for (let y = WY0; y <= WY1; y++) {
      if (x > WX0 && x < WX1 && y > WY0 && y < WY1) continue;
      if (T[x] && T[x][y] === ROCK) T[x][y] = WALL;
    }
    const ringSet = new Set();
    for (let x = RX0; x <= RX1; x++) for (let y = RY0; y <= RY1; y++) {
      if (!(x <= RX0 + 1 || x >= RX1 - 1 || y <= RY0 + 1 || y >= RY1 - 1)) continue;
      if (T[x] && T[x][y] === ROCK) { T[x][y] = CORR; ringSet.add(x + ',' + y); }
    }
    // _carveHead already punched the cabaret's east double-door; run it out through the wall course onto the ring. [REF#DG-00264]
    for (const yy of [head.DDY, head.DDY + 1]) {
      for (let x = head.DDX + 1; x <= WX1; x++) { const t = T[x] && T[x][yy]; if (t === ROCK || t === WALL) { T[x][yy] = CORR; ringSet.add(x + ',' + yy); } }
    }
    for (const k of ringSet) _ringSectionOf.set(k, 0);   // the whole ring IS section 0 — the heart [REF#DG-00265]

    // ── STEP 1: PARTITION THE WHOLE GRID INTO FIVE REGIONS, region 0 at the core (Mark 2026-08-03: [REF#DG-00266]
    //    "perhaps first calculate the entire dungeon geometries into 5 sections -- section 0 at the core").
    //    The four outer regions form a PINWHEEL: each is a plain rectangle, each touches exactly one side of
    //    the ring, and together with the heart box they tile the grid with no overlap and no gap. The
    //    pinwheel spins one of two ways, so the arms are not the same four shapes in every game.
    // ── COMPACT MINI-DUNGEONS, NOT QUARTER-GRID TERRITORIES (Mark 2026-08-03, after seeing the first cut
    //    in the engine: "all you need to is run little mini nethack maps with 4-6 rooms each in each section
    //    and have them tie into the main hall"). The first cut partitioned the ENTIRE grid into four arms, so
    //    4-6 rooms scattered across a ~24x34 territory with oceans of rock between them — dense on the ASCII
    //    render, empty in the 3D engine where rock is void. Each section is now a SMALL box hugging its side
    //    of the ring — the rooms have nowhere to sprawl, so every section reads as one tight NetHack cluster
    //    a short walk off the main hallway.
    const _WH = (typeof window !== 'undefined') ? window : {};
    const DEPTH = Number.isInteger(_WH._heartZoneDepth) ? _WH._heartZoneDepth : 14;
    const boxFor = (side) => {
      // N/S sit above/below a WIDE ring (the head + west wing), so they get extra width instead of the [REF#DG-00267]
      // depth they cannot have — 29x10 starved at 2-3 rooms when rooms rolled up to 9 wide (measured).
      if (side === 'N') return { x0: Math.max(1, RX0 - 8), y0: Math.max(1, RY0 - 1 - DEPTH), x1: Math.min(GW - 2, RX1 + 8), y1: RY0 - 1 };
      if (side === 'S') return { x0: Math.max(1, RX0 - 8), y0: RY1 + 1, x1: Math.min(GW - 2, RX1 + 8), y1: Math.min(GH - 2, RY1 + 1 + DEPTH) };
      if (side === 'E') return { x0: RX1 + 1, y0: Math.max(1, RY0 - 2), x1: Math.min(GW - 2, RX1 + 1 + DEPTH), y1: Math.min(GH - 2, RY1 + 2) };
      return { x0: Math.max(1, RX0 - 1 - DEPTH), y0: Math.max(1, RY0 - 2), x1: RX0 - 1, y1: Math.min(GH - 2, RY1 + 2) };
    };
    // ⛔ SUPERSEDED 2026-09-02 by Mark: "1 west 2 north 3 east" and "we removed section 4 = that is [REF#DG-01372]
    //    permanent at this point until I say otherwise" — the side a section lands on is NO LONGER
    //    ROLLED. The line this replaces shuffled [1,2,3,4] across N/E/S/W every game, on his earlier
    //    "each random each time the game play … sections can be in different locations" order. His
    //    later word pins the compass, and a pinned compass is what the rest of the game now assumes:
    //    `Creator.SECTION_DIRECTION` states it, `Creator.SPECIAL_BUILDING` keys the cafeteria/factory/
    //    storage on the NUMBER, and floor 1's authored Section0 is built to it.
    //    MEASURED before this change, floors 2 and 3, `npm run gate:sections`: **8 violations** —
    //    `section-direction` (section 2 sat EAST of the core when it must be NORTH) and six
    //    `section-special` (the cafeteria was assigned to section 1 while section 1 held the factory).
    //    Neither was a placement bug. The buildings went exactly where their numbers said; the NUMBERS
    //    had been shuffled onto the wrong sides, so every downstream table disagreed with the map.
    //    ⚠ THE SHUFFLE IS DELETED, NOT DEFAULTED-OFF, AND THE ROLL GOES WITH IT. Leaving a dead
    //      `_rand()` call in to "keep the stream aligned" would preserve seed compatibility with a
    //      layout nobody can generate any more — the boxes moved, so the seeds already mean something
    //      different. Per-seed variety comes from room count, size, position and the special's slot,
    //      exactly as the note above `SPECIAL_CELLS` says.
    //    ⚠ SOUTH IS NOT A SECTION AND MUST NOT SILENTLY BECOME ONE. It was the fourth arm; with
    //      section 4 permanently retired there is no number for it, and inventing one is the exact
    //      failure a peer already made and had to delete ("MY SECTIONS 5-8 WERE AN INVENTION").
    //      Its box is simply not built, and `gate:sections` fails loudly if a 4 ever reappears.
    const GATE = {
      N: { gx: (RX0 + RX1) >> 1, gy: RY0 - 1,          dx: 0,  dy: -1 },
      E: { gx: RX1 + 1,          gy: (RY0 + RY1) >> 1, dx: 1,  dy: 0  },
      S: { gx: (RX0 + RX1) >> 1, gy: RY1 + 1,          dx: 0,  dy: 1  },
      W: { gx: RX0 - 1,          gy: (RY0 + RY1) >> 1, dx: -1, dy: 0  }
    };
    // THE ONE MAPPING, read from Creator so it cannot drift from the rule the gate grades against. [REF#DG-01373]
    // ⚠ READ OFF THE GLOBAL, LAZILY — the same reason `_specialBuildingTable` does: `DungeonChain.js`
    //   is script-tagged BEFORE `Creator.js` (Engine9 :4209 vs :4212), so a bare `Creator` identifier
    //   here is an undeclared reference, not merely undefined. Generation runs long after both load.
    const _SD = (() => { try {
      const _g = (typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null);
      const C = _g && _g.Creator;
      if (C && C.SECTION_DIRECTION) return C.SECTION_DIRECTION;
    } catch (_) {} return { 1: 'WEST', 2: 'NORTH', 3: 'EAST' }; })();
    const _sideOf = { WEST: 'W', NORTH: 'N', EAST: 'E' };
    const ZN = Object.keys(_SD).map(Number).sort((a, b) => a - b)
      .map(n => { const side = _sideOf[_SD[n]]; return Object.assign({ s: n, side }, boxFor(side), GATE[side]); });
    // ── ROOM PLACEMENT = A CELL LATTICE, THE WAY ORIGINAL NETHACK DOES IT (and this game is a NetHack [REF#DG-00269]
    //    memorial — Mark's father played it for years). NetHack's mklev divides the level into a grid of
    //    cells and drops one jittered room into each; it does NOT randomly subdivide. Random subdivision
    //    was tried here twice and starved the small boxes below Mark's 4-room floor on 25/32 seeds
    //    (measured: a 15x28 east box → 0-3 rooms, a 29x10 north box → 2-3, thousands of tries). The
    //    lattice cannot starve: cells tile the box, one room fits per cell by construction, and a room
    //    placed 1-in from its cell edge always passes clearArea because the neighbouring tiles it checks
    //    are its OWN cell's margin.
    const dung = [];
    for (const Z of ZN) {
      Z.rooms = [];
      const bw = Z.x1 - Z.x0 + 1, bh = Z.y1 - Z.y0 + 1;
      let cols = Math.max(1, (bw / 8) | 0), rows = Math.max(1, (bh / 8) | 0);
      if (cols * rows < 4) { cols = Math.max(1, (bw / 7) | 0); rows = Math.max(1, (bh / 7) | 0); }
      if (cols * rows < 4) return false;                       // box genuinely too small — re-roll the floor [REF#DG-00270]
      const cells = [];
      for (let ci = 0; ci < cols; ci++) for (let cj = 0; cj < rows; cj++) {
        const cx0 = Z.x0 + ((ci * bw / cols) | 0), cx1 = Z.x0 + (((ci + 1) * bw / cols) | 0) - 1;
        const cy0 = Z.y0 + ((cj * bh / rows) | 0), cy1 = Z.y0 + (((cj + 1) * bh / rows) | 0) - 1;
        cells.push({ cx0, cy0, cx1, cy1 });
      }
      for (let i = cells.length - 1; i > 0; i--) { const j = (_rand() * (i + 1)) | 0; const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
      const want = Math.min(cells.length, 4 + ((_rand() * 3) | 0));   // 4-6 rooms per section (Mark 2026-08-03) [REF#DG-00271]
      for (const c of cells) {
        if (Z.rooms.length >= want) break;
        const aW = c.cx1 - c.cx0 - 1, aH = c.cy1 - c.cy0 - 1;   // room must sit 1-in from the cell edge [REF#DG-00272]
        if (aW < 5 || aH < 5) continue;
        const w = 5 + ((_rand() * (Math.min(7, aW) - 4)) | 0), h = 5 + ((_rand() * (Math.min(7, aH) - 4)) | 0);
        const x = c.cx0 + 1 + ((_rand() * (aW - w + 1)) | 0), y = c.cy0 + 1 + ((_rand() * (aH - h + 1)) | 0);
        if (x + w >= GW - 1 || y + h >= GH - 1 || !clearArea(x, y, w, h)) continue;
        const r = carve(x, y, w, h, 'room'); r.sectionIndex = Z.s; r.segmentId = Z.s;
        Z.rooms.push(r); dung.push(r);
      }
      if (Z.rooms.length < 4) return false;   // Mark 2026-08-03: 4-6 rooms per section. Under four, genCompact re-rolls. [REF#DG-00273]
    }

    // ── ONE SECTION GATE PER SIDE. The door sits one tile outside the ring facing its zone, and a plain NetHack [REF#DG-00274]
    //    corridor runs from it to the nearest room in that zone. sectionGate doors are exempt from the
    //    one-CORR-neighbour door rule below (they bridge two corridors by design) exactly as _buildRing's are.
    const dig = (sx, sy, tx, ty, yFirst) => {
      const out = []; let x = sx, y = sy;
      const step = () => { if (!T[x] || T[x][y] !== ROCK) return false; out.push([x, y]); return true; };
      if (!step()) return null;
      const sxRun = () => { while (x !== tx) { x += Math.sign(tx - x); if (!step()) return false; } return true; };
      const syRun = () => { while (y !== ty) { y += Math.sign(ty - y); if (!step()) return false; } return true; };
      return (yFirst ? (syRun() && sxRun()) : (sxRun() && syRun())) ? out : null;
    };
    const sideOf = (r, tx, ty) => { const d = doorOf(r, tx, ty); return d.ox > 0 ? 'E' : d.ox < 0 ? 'W' : d.oy > 0 ? 'S' : 'N'; };
    for (const Z of ZN) {
      if (!(T[Z.gx] && T[Z.gx][Z.gy] === ROCK)) return false;
      const near = Z.rooms.reduce((b, r) => { const L = Math.abs(r.cx - Z.gx) + Math.abs(r.cy - Z.gy); return (!b || L < b.L) ? { r, L } : b; }, null);
      const pf = doorOf(near.r, Z.gx, Z.gy);
      const path = dig(Z.gx + Z.dx, Z.gy + Z.dy, pf.x + pf.ox, pf.y + pf.oy, Z.dy !== 0);
      if (!path) return false;
      for (const p of path) T[p[0]][p[1]] = CORR;
      T[pf.x][pf.y] = DOOR; doorList.push([pf.x, pf.y]);
      T[Z.gx][Z.gy] = DOOR; doorList.push([Z.gx, Z.gy]);
      _sectionGateTiles.set(Z.gx + ',' + Z.gy, { gateIndex: Z.s, sectionFrom: 0, sectionTo: Z.s });
      Z.entry = near.r; Z.entryTiles = path;
    }

    // ── MST corridors INSIDE each zone — buildDungeon()'s routine (nearest free-side neighbour, soft side penalty), [REF#DG-00275]
    //    run per zone so a corridor can never wander across a section boundary. Note the side probes here pass real
    //    coordinates; buildDungeon calls sideOf(a, c) with the room OBJECT as tx, so its penalty term is inert.
    const adj = new Map(dung.map(r => [r, []]));
    for (const Z of ZN) {
      const usedSide = new Map(Z.rooms.map(r => [r, new Set()]));
      usedSide.get(Z.entry).add(sideOf(Z.entry, Z.gx, Z.gy));
      const inT = new Set([Z.entry]); const edges = [];
      while (inT.size < Z.rooms.length) {
        let best = null;
        for (const a of inT) for (const c of Z.rooms) {
          if (inT.has(c)) continue;
          const sa = sideOf(a, c.cx, c.cy), sc = sideOf(c, a.cx, a.cy);
          const pen = (usedSide.get(a).has(sa) || usedSide.get(c).has(sc)) ? 1000 : 0;
          const L = joinLen(a, c) + pen; if (!best || L < best.L) best = { a, c, L, sa, sc };
        }
        if (!best) return false;
        inT.add(best.c); usedSide.get(best.a).add(best.sa); usedSide.get(best.c).add(best.sc); edges.push(best);
      }
      for (const e of edges) {
        const p = joinPath(e.a, e.c); if (!p || p.length > MAX_CORR) return false;
        adj.get(e.a).push(e.c); adj.get(e.c).push(e.a);
      }
    }

    // ── STRUCTURAL GATES — the same three buildDungeon enforces, with the ring exempted from the junction rule [REF#DG-00276]
    //    exactly as the vestibule/trunk is in the other generators (a 2-wide hall is all junctions by definition).
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (T[x][y] !== CORR) continue;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return false;
    }
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (T[x][y] !== CORR || ringSet.has(x + ',' + y)) continue;
      let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; }
      if (n >= 3) return false;
    }
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (T[x][y] !== DOOR || _sectionGateTiles.has(x + ',' + y)) continue;
      if (x >= WX0 && x <= WX1 && y >= WY0 && y <= WY1) continue;   // the head's own doors answer to _carveHead, not to this rule [REF#DG-00277]
      let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++;
      if (c !== 1) return false;
    }
    if (doorRuleViolations() > 0) return false;

    // ── START / CASINO / HOP. All four zone-entry rooms are one hop from the heart — that is literally true here, [REF#DG-00278]
    //    they all hang off the same ring — so hop counts BFS outward from each of them independently. The casino
    //    (stairs down) is the room furthest from the heart by that count, wherever it lands.
    _segmentCount = 4;
    const hop = new Map();
    for (const Z of ZN) {
      hop.set(Z.entry, 1); const q = [Z.entry];
      while (q.length) { const u = q.shift(); for (const v of adj.get(u)) if (!hop.has(v)) { hop.set(v, hop.get(u) + 1); q.push(v); } }
    }
    const start = ZN[0].entry;   // any arm will do — all four are one hop off the ring by construction [REF#DG-00279]
    // The casino (stairs down) must live in SECTION 4 — the adapter's ring contract asserts it, and it also makes [REF#DG-00280]
    // the descent a fixed promise rather than a per-seed surprise: the way down is always the last section.
    // LOOKED UP BY SECTION NUMBER, NOT BY ARRAY INDEX. Now that the section→region assignment is rolled
    // per game, ZN[3] is no longer section 4 — it is whichever arm the shuffle happened to land there.
    const sec4 = ZN.find(Z => Z.s === 4);
    let casino = sec4.entry; for (const r of sec4.rooms) if ((hop.get(r) || 0) > (hop.get(casino) || 0)) casino = r;
    casino.type = 'casino';
    _heartRingCarved = true;   // the adapter's level-1 ring block stands down — see the flag's declaration [REF#DG-00281]
    for (const k of ringSet) { mhTiles.add(k); _spineSegmentOf.set(k, 0); }
    for (const Z of ZN) for (const p of Z.entryTiles) mhTiles.add(p[0] + ',' + p[1]);
    return { start, casino, hop };
  }

  // ── QUADRANT GENERATOR v3 (Mark 2026-07-25: "each section is supposed to be random … 4 mini-dungeons"). His [REF#DG-00282]
  //    hand-drawn spec (30×20 mockup): entrance+cabaret CENTRAL, FOUR independent random sections filling the
  //    quadrants, double-door gates in sequence hub→S1→S2→S3→S4, stairs-down in S4. Supersedes the v2 horseshoe
  //    (one loop split into 4 arcs — rejected: not "4 distinct dungeons"). NOW each quadrant is its OWN NetHack
  //    room-subdivision + internal MST corridors (a real mini-dungeon, distinct topology per seed), and the four are
  //    chained by 2-wide double-door connectors in the clear perimeter lanes (right/top/left) + the cabaret east door.
  //    Reuses carve/clearArea/doorOf/joinPath/joinLen + the SAME structural gates as _buildRing (trunk = junction
  //    exemption). SEGMENT gates (segmentCount 5) → segment streaming stays active (one quadrant lit at a time).
  //    Flag: global._quadrantDungeon (+ _quadrantMinFloor). Emits the section/segment bookkeeping the adapter consumes.
  // ── THE SPECIAL_BUILDING TABLE LIVES IN CREATOR NOW (2026-09-01) ─────────────────────────────
  //    It was defined TWICE in this file — once per packer, identical literals — and Mark is editing
  //    it, so the two would have drifted. One table, in `Creator.js`, read by both call sites.
  //    ⚠ IT IS READ LAZILY, AND THAT IS FORCED BY LOAD ORDER, NOT PREFERENCE. `DungeonChain.js` is
  //      script-tagged BEFORE `Creator.js` (Engine9 :4209 vs :4212), so `global.Creator` does not
  //      exist while this module evaluates. Generation runs long after both scripts load, so reading
  //      it at CALL time is correct and reading it at module scope would be `undefined`.
  //    ⚠ NO FALLBACK COPY, DELIBERATELY. If Creator is somehow absent this returns {} and every
  //      section's special degrades to a generic 'room' — which is exactly what sections 3 and 4 do
  //      today, so the failure is silent-but-safe rather than a second table that can drift.
  //    ⚠ DECLARED AT MODULE SCOPE, AND IT MUST BE. Its two readers live in DIFFERENT functions
  //      (`_buildQuadrant` 1450-1819 and `_buildSection0` 1920-3073). A function declaration hoists
  //      only to its ENCLOSING function, so declaring it inside either packer leaves the other
  //      throwing ReferenceError at generation time — measured 2026-09-01 before this move.
  function _specialBuildingTable() {
    try {
      const _g = (typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null);
      const C = _g && _g.Creator;
      // ── WHICH SECTION HOLDS WHICH BUILDING IS DEALT NOW, NOT LOOKED UP ──────── [REF#DG-01284]
      //    Mark 2026-09-03: "cafeteria + storage + factory. these rooms will be randomly located in
      //    sections 1-3, ok? got it? rng placement in those 3 sections for these floors."
      //    ⛔ SUPERSEDED the fixed `Creator.SPECIAL_BUILDING` mapping for sections 1-3. Section 4 is
      //      still 'guard', fixed — the deal returns it unchanged.
      //    ⚠ EVERY CALLER FOLLOWS AUTOMATICALLY, AND THAT IS WHY THE CHANGE IS HERE. There are five
      //      call sites across three packers; five literal deals would be five chances to drift, and
      //      pulling this table into one function is exactly what an earlier note in this file did to
      //      stop two copies of it disagreeing.
      //    ⚠⚠ THE DEAL DRAWS NOTHING FROM `_rand()`. Draw order is part of the seed contract: a new
      //      consumer inserted before the existing draws re-shuffles every floor layout ever shipped
      //      from that seed. `dealSectionSpecials` derives its own mulberry32 from (seed, level), so
      //      the map RNG is consumed in the same order and the same number of times as before.
      //    ⚠ FLOOR 1 IS NOT DEALT. It is Mark's hand-authored map (Section0.js) and does not run this
      //      generator's packers; the deal would be describing a floor nobody built here.
      //    Off: window._rngSectionSpecials = false → back to the fixed 1:cafeteria 2:factory 3:storage.
      if (C && typeof C.dealSectionSpecials === 'function' && _genLevel !== 1
          && !(_g && _g._rngSectionSpecials === false)) {
        return C.dealSectionSpecials(_mapSeedVal, _genLevel);
      }
      if (C && C.SPECIAL_BUILDING) return C.SPECIAL_BUILDING;
    } catch (_) {}
    return {};
  }

  function _buildQuadrant() {
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK)); rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map(); _spineSegmentOf = new Map(); _segmentCount = 0;
    const trunk = new Set();                     // 2-wide connector/hub tiles → junction-exempt (like ringSet) [REF#DG-00283]

    // ── HEAD: cabaret (engine id1) + landing (id0), CENTRED; east door faces S1 (bottom-right). Cabaret bottom wall is [REF#DG-00284]
    //    pinned to y24 so DDY = 22 on every level → the hub→S1 neck always lands in the mid-lane (rows 22-23). L1 keeps
    //    the treasured small thin-wall cabaret; L2+ = 12×9.
    // ── THE HEAD IS THE SHARED ONE NOW, JUST TRANSLATED (Mark 2026-08-03). This block used to author its
    //    own cabaret/landing at x27 with its own door carve and NO konbini — the exact drift that put this
    //    generator under a HOLD on 2026-07-25. It now calls _carveHead, so room 0, room 1, the L2+ konbini
    //    and every door column are the canonical ones; only the ORIGIN differs, which is what makes the head
    //    the centre of the four quadrants instead of a corner.
    //    ORIGIN, DERIVED NOT GUESSED: the quadrant boxes leave a hub column at x26-39 and a mid-lane at rows
    //    22-25, and the hub→S1 neck must land in that lane. _carveHead puts the east door at DDY = oy+3 (L1:
    //    (oy+1)+2) and DDX at the cabaret's east wall, so oy = 19 lands DDY on row 22 exactly as the old
    //    hand-rolled head intended, and ox is chosen so the cabaret's east wall sits flush at x39, facing S1.
    //    ⚠ L2+ IS NOT THE SAME PROBLEM AS L1. The canonical head puts the east door at oy+3 (near the
    //    cabaret's TOP) while the retired hand-rolled quadrant head used cabY+6 (near its BOTTOM), so the
    //    origin that lands DDY in the mid-lane on L1 drives the L2 head 26 rows deep (cabaret 10 tall +
    //    landing 8 + konbini 5 + gutters) and the map cannot close. Knobs so this is tunable without a
    //    rebuild: window._quadHeadOx / _quadHeadOy (per-level arrays [L1, L2plus] or plain numbers).
    const _pick = (v, dflt) => {
        if (Array.isArray(v)) { const p = (_genLevel === 1) ? v[0] : v[1]; return Number.isFinite(p) ? p : dflt; }
        return Number.isFinite(v) ? v : dflt;
    };
    const _W = (typeof window !== 'undefined') ? window : {};
    //    RE-CENTRED 2026-08-03 for the ring: the 2-tile ring needs 3 clear tiles on every side of the [REF#DG-00285]
    //    head (1 gap + 2 corridor), so the head must sit with x-margin inside the hub column x26-39.
    //    L1 head is 5 wide -> ox 29 puts it at x30-34 and the ring at x27-37, clear of both box
    //    columns (x6-25, x40-59). Derived, not guessed - see the ring block below.
    const _headOx = _pick(_W._quadHeadOx, (_genLevel === 1) ? 29 : 28);
    const _headOy = _pick(_W._quadHeadOy, (_genLevel === 1) ? 19 : 8);
    const _head = _carveHead(_headOx, _headOy);
    // the link corridor tiles between cabaret and landing are hub trunk → junction-exempt, as before [REF#DG-00286]
    for (let _c = _head.landX; _c < _head.landX + _head.landW; _c++){
      trunk.add(_c + ',' + (_head.cabY + _head.cabH));
      trunk.add(_c + ',' + (_head.cabY + _head.cabH + 1));
    }

    // ── FOUR QUADRANT BOXES (mini-dungeon extents) [x0,y0,x1,y1]: S1 BR · S2 TR · S3 TL · S4 BL. Corners, clear of the [REF#DG-00287]
    //    central hub column (x26-39) and the perimeter connector lanes (top rows 3-4, left cols 4-5, right cols 60-61).
    //    WEST BOXES END AT x24, NOT x25 (2026-08-03). The ring's west arm sits at x27-28, so the clear
    //    lane between box and ring was a SINGLE column (x26) and a 2-tile spur cannot fit in it — the
    //    measured cause of spur3-v/spur4-v rejecting 39 and 26 times per generation pass. One column
    //    back gives x25-26, matching the east side's x38-39. The east boxes already start at x40.
    //    ── BOXES GROWN INTO THE SPACE THE OLD CONNECTORS LEFT BEHIND (Mark 2026-08-03: "okay fix it").
    //    The retired sequential chain threaded its L connectors through reserved perimeter lanes — top
    //    rows 3-4, left cols 4-5, right cols 60-61 — and the boxes were kept clear of them. The heart
    //    ring replaced that chain, so those lanes are dead space and the sections can have them.
    //
    //    THE TARGET IS ARITHMETIC, NOT TASTE. clearArea puts a 1-tile border on every room, so a 5x5
    //    really occupies 7x7 and the 10x5 special really occupies 12x7. Four normals stack 14x14, plus
    //    the special's 7 rows = a box must be at least 14 x 21 to hold Mark's 4+1. The old boxes were
    //    17 rows. The fifth room was never merely unlucky — it had nowhere to go, in every build.
    //
    //        S1  20x17 -> 25x22      S2  20x17 -> 25x21
    //        S4  19x17 -> 24x22      S3  19x17 -> 24x21
    //
    //    Bounds respected: the grid is 66x46 so x1..x64 / y1..y44 stay inside the rock margin; the
    //    east boxes start at x40 and the west end at x24, keeping the ring's 2-tile spur lanes (x25-26
    //    and x38-39) clear; and y22 is left empty so the north and south boxes never touch.
    const BOX = { 1: [40, 23, 64, 44], 2: [40, 1, 64, 21], 3: [1, 1, 24, 21], 4: [1, 23, 24, 44] };

    // packBox: DART-THROWING packer — throw walled rooms of VARIED size (5×5..8×8) at random positions in the box and [REF#DG-00288]
    //    keep any that clear a 1-tile gap (clearArea). Organic, varied, dense (~5 rooms/quadrant) — matches the mockup's
    //    hand-drawn look far better than a rigid grid (which forces uniform 5×5) or recursive subdivision (which stalls).
    //    Density dial: window._quadRooms (target rooms per quadrant, default 4-7 random).
    // ── FOUR NORMAL ROOMS + ONE SPECIAL, TWICE THE SIZE (Mark 2026-08-03: "4 rooms for each section
    //    + 1 special room 2x as big as the others, easy got it?"). Replaces the old dart-thrower, which
    //    threw 4-7 rooms of random 5-8 x 5-8 footprints at the box and kept whatever stuck. That is why
    //    sections never matched each other: the ROOM BUDGET and the room SIZES both rolled, so one box
    //    could land four 5x5s (100 tiles) and its neighbour three 8x8s (192).
    //
    //    Now: exactly FIVE rooms per section. Four normals at a fixed 5x5, and one special at EXACTLY
    //    double that footprint - 10x5 or 5x10, orientation rolled so the four sections do not look
    //    stamped from one mould. 2x is the AREA (25 -> 50 tiles), which is what reads as "twice as big"
    //    when you walk into it.
    //
    //    THE SPECIAL IS PLACED FIRST, AND THAT ORDER IS LOAD-BEARING. It is the hardest shape to fit;
    //    filling the box with small rooms first leaves no 10-tile run for it and the section silently
    //    ships with four rooms and no special. Big-first, then fill.
    //
    //    Knobs: window._quadRoomW / _quadRoomH (normal footprint) - window._quadNormalRooms (default 4)
    //           window._quadSpecialMult (default 2) - window._quadSpecial = false to skip the special.
    // ── EACH SECTION'S SPECIAL IS ITS AUTHORED BUILDING (Mark 2026-08-03: "did you build out the
    //    factory? lets put that into section 1").
    //    The factory was never missing — CODEX built it on 08-02, complete with the 工場 dresser that
    //    stamps _factoryRoomId and the _isRoomActivated('FACTORY') gate. But _placeSpecial() lives in
    //    _buildLHalls, so the QUADRANT map had no factory and no cafeteria on any seed (measured 0/6
    //    vs the default's 6/6). The double-size special room is the natural home for a major building,
    //    and giving each section a DIFFERENT one also answers the playtest finding that the whole game
    //    contained only two room footprints — four identical Great Halls become four named places.
    //    The adapter already turns cr.type into er.isFactory / er.isCafeteria and the engine dressers
    //    key off those, so naming the carve is the whole wiring.
    //    ⚠ SECTION 1 IS MARK'S CALL AND IT DISAGREES WITH THE P2 CATALOG, which authors FACTORY_FLOOR
    //    as section 2 (EAST) and GUARDPOST as section 1. Mark is the authority; the catalog is not
    //    updated here because probe-constructor-p2 asserts its current values and that is a separate,
    //    deliberate change. Flagged, not silently reconciled.
    //    Knob: window._quadSpecialBuildings = false → every special stays a plain Great Hall.
    //    UPDATED 2026-08-03 (Mark): "section 1 = cafeteria ... section2 = factory". This also
    //    RECONCILES with the P2 catalog, which authors FACTORY_FLOOR as section 2 — the conflict I
    //    flagged when the factory was briefly put in section 1 has resolved itself, so no catalog
    //    edit and no broken falsifier. Section 1 still differs from the catalog's GUARDPOST; Mark is
    //    the authority and that remains flagged rather than silently reconciled.
    //    Section 4 is deliberately left 'room': the generator already lands the CASINO — the
    //    supervisor's boss room, and where the stairs sit — on that section's special, which is the
    //    fight-to-descend arena. Naming it here would fight the casino placer for the same slot.
    //    Section 3 awaits its building (catalog: SLEEPING_WARD); there is no 'ward' carve type yet,
    //    and inventing one silently is how a random substitute ships. It stays a Great Hall until
    //    the type exists.
    const SPECIAL_BUILDING = _specialBuildingTable();   // one table, in Creator.js [REF#DG-01284]
    const packBox = (x0, y0, x1, y1, s) => {
      const out = []; const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const _W3 = (typeof window !== 'undefined') ? window : {};
      // ── 4x4, AND THAT IS ARITHMETIC, NOT TASTE (2026-08-03). clearArea demands a 1-tile border, so a [REF#DG-00289]
      //    5x5 room really occupies 7x7 and the 5x10 special really occupies 7x12. Four normals stack
      //    to 14x14, and 14 + the special's 7 rows = 21 rows inside a 17-row box: Mark's fifth room
      //    could never fit, which is why EVERY section came back with 3 normals once the ring landed.
      //    At 4x4 the same layout needs 18x12 and fits with room to spare. Raise them again only if the
      //    boxes grow: window._quadRoomW / _quadRoomH.
      //    ⚠ 4x4 WAS TRIED AND REVERTED (2026-08-03). The packing arithmetic says it should fit — 18x12
      //    inside a 17-row box versus 5x5's impossible 21 rows — but dropping to 4x4 made genCompact
      //    fail on ALL 40 sweep seeds, so something downstream (corridor routing or the door rule)
      //    needs rooms of at least 5. Left at 5x5, which generates reliably at four rooms per section.
      //    The fifth room needs BIGGER BOXES, not smaller rooms. Knobs kept for experimenting.
      const NW = Number.isInteger(_W3._quadRoomW) ? _W3._quadRoomW : 5;
      const NH = Number.isInteger(_W3._quadRoomH) ? _W3._quadRoomH : 5;
      const NORMALS = Number.isInteger(_W3._quadNormalRooms) ? _W3._quadNormalRooms : 4;
      const MULT = Number.isInteger(_W3._quadSpecialMult) ? _W3._quadSpecialMult : 2;
      // try to seat one room of exactly w x h somewhere in the box; returns the room or null [REF#DG-00290]
      const seat = (w, h, special) => {
        if (w > bw - 1 || h > bh - 1) return null;
        const place = (rx, ry) => {
          const _bt = (special && _W3._quadSpecialBuildings !== false) ? (SPECIAL_BUILDING[s] || 'room') : 'room';
          const r = carve(rx, ry, w, h, _bt);
          r.sectionIndex = s; r.segmentId = s;
          if (special) { r.isSpecialRoom = true; r.roomType = 'special'; }
          out.push(r); return r;
        };
        // random darts first — they are what makes each section look hand-placed rather than gridded [REF#DG-00291]
        for (let t = 0; t < 260; t++) {
          const rx = x0 + ((_rand() * (bw - w + 1)) | 0), ry = y0 + ((_rand() * (bh - h + 1)) | 0);
          if (rx + w > x1 + 1 || ry + h > y1 + 1 || !clearArea(rx, ry, w, h)) continue;
          return place(rx, ry);
        }
        // ── DETERMINISTIC FALLBACK SCAN (2026-08-03). Darts alone LEFT SECTIONS SHORT: measured over 60 [REF#DG-00292]
        //    seeds x 4 sections, exactly HALF came back with 3 normals instead of 4 — the box still had
        //    space, the thrower just never hit it in 260 tries. Mark asked for four rooms per section,
        //    not four when the RNG cooperates. Scan the box in order and take the first clear seat.
        //    Consumes ZERO _rand() draws, so it cannot perturb the seed stream for anything downstream.
        for (let ry = y0; ry + h <= y1 + 1; ry++)
          for (let rx = x0; rx + w <= x1 + 1; rx++)
            if (clearArea(rx, ry, w, h)) return place(rx, ry);
        return null;
      };
      // 1. the special, biggest-first. Roll orientation, then fall back to the other one, then to a [REF#DG-00293]
      //    squarer 2x footprint, before giving up - a missing special is worse than a stubbier special.
      if (_W3._quadSpecial !== false) {
        const wide = _rand() < 0.5;
        // (special type resolved below via SPECIAL_BUILDING) [REF#DG-00294]
        const shapes = wide ? [[NW * MULT, NH], [NW, NH * MULT]] : [[NW, NH * MULT], [NW * MULT, NH]];
        shapes.push([NW + 2, NH + 2]);   // ~2x area (49 vs 25) when neither long bar fits the box [REF#DG-00295]
        let got = null;
        for (const [w, h] of shapes) { got = seat(w, h, true); if (got) break; }
      }
      // 2. the four normals, identical footprints so sections read as equals [REF#DG-00296]
      for (let i = 0; i < NORMALS; i++) seat(NW, NH, false);
      return out;
    };
    // mstConnect: wire one box's rooms into a BOXED mini-maze (Mark 2026-07-25: "hallways should be L shaped … a boxed [REF#DG-00297]
    //    shaped dungeon rather than one linear boring line"). Every corridor is routed to TURN A CORNER by exiting one
    //    room on an E/W wall and entering the other on an N/S wall (perpendicular → a real L); a facing-wall straight
    //    run is only a last-resort fallback. Then EXTRA loop edges are added so the halls form closed boxed circuits,
    //    not a single straight chain. Doors stay ≤1 per wall (usedSide) so the door-rule holds.
    const mstConnect = (list) => {
      const usedSide = new Map(list.map(r => [r, new Set()]));
      const doorSide = (r, s) => s === 'E' ? { x: r.x + r.w - 1, y: r.cy, ox: 1, oy: 0 } : s === 'W' ? { x: r.x, y: r.cy, ox: -1, oy: 0 } : s === 'S' ? { x: r.cx, y: r.y + r.h - 1, ox: 0, oy: 1 } : { x: r.cx, y: r.y, ox: 0, oy: -1 };
      const route = (pa, pb, xFirst) => {   // collect an L-path (no mutation); null if any tile is blocked [REF#DG-00298]
        let x = pa.x + pa.ox, y = pa.y + pa.oy; const tx = pb.x + pb.ox, ty = pb.y + pb.oy; const path = [];
        const step = () => { const t = T[x] ? T[x][y] : undefined; if (t === undefined || t === CORR || t === DOOR || t === FLOOR) return false; path.push([x, y]); return true; };
        if (!step()) return null;
        const sx = () => { while (x !== tx) { x += Math.sign(tx - x); if (!step()) return false; } return true; };
        const sy = () => { while (y !== ty) { y += Math.sign(ty - y); if (!step()) return false; } return true; };
        return (xFirst ? (sx() && sy()) : (sy() && sx())) ? path : null;
      };
      const connect = (a, b) => {
        const hA = b.cx >= a.cx ? 'E' : 'W', vA = b.cy >= a.cy ? 'S' : 'N', hB = a.cx >= b.cx ? 'E' : 'W', vB = a.cy >= b.cy ? 'S' : 'N';
        const tries = [[hA, vB, true], [vA, hB, false], [hA, hB, true], [vA, vB, false]];   // L-shapes first, facing straight last [REF#DG-00299]
        for (const [sa, sb, xf] of tries) {
          if (usedSide.get(a).has(sa) || usedSide.get(b).has(sb)) continue;
          const pa = doorSide(a, sa), pb = doorSide(b, sb); const path = route(pa, pb, xf);
          if (!path || path.length > MAX_CORR) continue;
          T[pa.x][pa.y] = DOOR; T[pb.x][pb.y] = DOOR; doorList.push([pa.x, pa.y], [pb.x, pb.y]);
          for (const p of path) T[p[0]][p[1]] = CORR;
          usedSide.get(a).add(sa); usedSide.get(b).add(sb); return true;
        }
        return false;
      };
      const inT = new Set([list[0]]);   // MST by nearest pair, each edge routed as an L [REF#DG-00300]
      while (inT.size < list.length) {
        let best = null;
        for (const a of inT) for (const c of list) { if (inT.has(c)) continue; const L = joinLen(a, c); if (!best || L < best.L) best = { a, c, L }; }
        if (!best || !connect(best.a, best.c)) return null;
        inT.add(best.c);
      }
      // LOOP edges → closed boxed circuits (not just a tree): connect near room pairs on still-free walls. [REF#DG-00301]
      const loops = 1 + ((_rand() * 2) | 0); let added = 0;
      const pairs = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.push([list[i], list[j]]);
      pairs.sort((p, q) => joinLen(p[0], p[1]) - joinLen(q[0], q[1]));
      for (const [a, b] of pairs) { if (added >= loops) break; if (connect(a, b)) added++; }
      return usedSide;
    };

    const Q = { 1: [], 2: [], 3: [], 4: [] }; const usedSides = new Map();
    for (const s of [1, 2, 3, 4]) {
      const b = BOX[s];
      const list = packBox(b[0], b[1], b[2], b[3], s);
      if (list.length < 3) return false;                                // each quadrant must be a real cluster [REF#DG-00302]
      const us = mstConnect(list); if (!us) return false;
      Q[s] = list; for (const [r, sd] of us) usedSides.set(r, sd);
    }

    // ── CONNECTORS (Mark 2026-07-25: the 2-wide MAIN halls between sections must be L-shaped — no long straight lines). [REF#DG-00303]
    //    Each inter-section link is a 2-wide hall that TURNS A CORNER: a horizontal arm + a vertical arm sharing a 2×2
    //    corner (the top link is a ⊓ with two corners). The double-door gate sits on one arm; a section room meets an arm
    //    end with a single door at its wall midpoint. Clearance is dry-run first, so a blocked route just fails → retry.
    const inB = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;
    const hClear = (xa, xb, y) => { for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) for (const yy of [y, y + 1]) if (!inB(x, yy) || T[x][yy] !== ROCK) return false; return true; };
    const vClear = (x, ya, yb) => { for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) for (const xx of [x, x + 1]) if (!inB(xx, y) || T[xx][y] !== ROCK) return false; return true; };
    const hRun = (xa, xb, y, seg) => { for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) for (const yy of [y, y + 1]) { T[x][yy] = CORR; trunk.add(x + ',' + yy); _ringSectionOf.set(x + ',' + yy, seg); } };
    const vRun = (x, ya, yb, seg) => { for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) for (const xx of [x, x + 1]) { T[xx][y] = CORR; trunk.add(xx + ',' + y); _ringSectionOf.set(xx + ',' + y, seg); } };
    const doorAt = (x, y) => { if (!inB(x, y) || T[x][y] !== WALL) return false; T[x][y] = DOOR; doorList.push([x, y]); return true; };   // open a room wall-midpoint door onto an adjacent arm [REF#DG-00304]
    const stubUpTo = (r, bbr) => { const cx = r.cx; if (!inB(cx, r.y) || T[cx][r.y] !== WALL) return false; for (let y = r.y - 1; y >= bbr + 1; y--) if (!inB(cx, y) || T[cx][y] !== ROCK) return false; T[cx][r.y] = DOOR; doorList.push([cx, r.y]); for (let y = r.y - 1; y >= bbr + 1; y--) T[cx][y] = CORR; return true; };
    const nearest = (list, tx, ty, excl) => { let best = null; for (const r of list) { if (r === excl) continue; const L = Math.abs(r.cx - tx) + Math.abs(r.cy - ty); if (!best || L < best.L) best = { r, L }; } return best && best.r; };
    const setGate = (tiles, gi, sf, st) => { for (const [gx, gy] of tiles) if (!inB(gx, gy) || T[gx][gy] !== CORR) return false; for (const [gx, gy] of tiles) { T[gx][gy] = DOOR; doorList.push([gx, gy]); _segmentGateTiles.set(gx + ',' + gy, { gateIndex: gi, segmentFrom: sf, segmentTo: st }); } return true; };

    const _qf = (why) => { try { (window.__qfails = window.__qfails || {})[why] = (window.__qfails[why]||0)+1; } catch(_){} return false; };
    // ── TIER 1: THE 2-TILE RING AROUND THE HEART (Mark 2026-08-03: "each section is connected by a [REF#DG-00305]
    //    squared 2-tile hallway surrounding the caberet section 0").
    //    REPLACES the old sequential chain (hub->S1->S2->S3->S4). That chain is why the map read as
    //    sprawl: it threaded L connectors around the OUTSIDE of the grid, through the perimeter lanes,
    //    which also carved into boxes 2 and 3 before packBox ran - the measured reason those two
    //    sections could only ever seat 3 normal rooms instead of 4.
    //
    //    The rectangle is DERIVED FROM THE HEAD'S REAL BOUNDS, not hardcoded, so it follows the head on
    //    any floor or origin: 1 tile of gap, then 2 tiles of corridor, on all four sides. The gap is
    //    load-bearing - structural rule 1 rejects any CORR laid directly beside room FLOOR.
    const _hx0 = Math.min(_head.cabX, _head.landX);
    const _hx1 = Math.max(_head.cabX + _head.cabW - 1, _head.landX + _head.landW - 1);
    const _hy0 = _head.cabY, _hy1 = _head.landY + _head.landH - 1;
    const RW0 = _hx0 - 3, RW1 = _hx0 - 2, RE0 = _hx1 + 2, RE1 = _hx1 + 3;
    const RN0 = _hy0 - 3, RN1 = _hy0 - 2, RS0 = _hy1 + 2, RS1 = _hy1 + 3;
    if (RW0 < 1 || RE1 >= GW - 1 || RN0 < 1 || RS1 >= GH - 1) return _qf('ring-bounds');
    {
      const ringTiles = [];
      for (let x = RW0; x <= RE1; x++) for (const y of [RN0, RN1, RS0, RS1]) ringTiles.push([x, y]);
      for (let y = RN0; y <= RS1; y++) for (const x of [RW0, RW1, RE0, RE1]) ringTiles.push([x, y]);
      for (const [x, y] of ringTiles) if (!inB(x, y) || T[x][y] !== ROCK) return _qf('ring-occupied@'+x+','+y+'='+(T[x]&&T[x][y]));
      for (const [x, y] of ringTiles) { T[x][y] = CORR; trunk.add(x + ',' + y); _ringSectionOf.set(x + ',' + y, 0); }
    }
    // GATE 0 - the cabaret's east door onto the ring's east arm. Its two door tiles already exist [REF#DG-00306]
    // (carved by _carveHead); this is the short 2-tile neck between them and the ring.
    if (!hClear(DDX + 1, RE0 - 1, DDY)) return _qf('gate0-neck');
    hRun(DDX + 1, RE0 - 1, DDY, 0);
    _segmentGateTiles.set(DDX + ',' + DDY, { gateIndex: 0, segmentFrom: 0, segmentTo: 1 });
    _segmentGateTiles.set(DDX + ',' + (DDY + 1), { gateIndex: 0, segmentFrom: 0, segmentTo: 1 });

    // ── EACH SECTION HANGS OFF THE RING BY ITS OWN 2-TILE SPUR, so every section touches the Heart [REF#DG-00307]
    //    directly instead of being reachable only through its neighbours.
    //    `dir` is which ring arm it leaves from; the spur runs outward to the nearest room in that box
    //    and opens a single door at that room's wall.
    //    THE SPUR IS AN L, NOT A STRAIGHT RUN. My first pass ran a horizontal arm at a fixed lane and
    //    opened the door where it met the room's x — which only works if the room happens to straddle
    //    that lane. It usually does not, so every seed failed to generate. The spur now leaves the ring
    //    horizontally, turns at the target room's centre column, and drops/rises to its wall — the same
    //    2-wide L vocabulary the section halls use.
    const spurTo = (seg, dir, lane) => {
      const list = Q[seg]; if (!list || !list.length) return _qf('spur'+seg+'-empty');
      // ── TURN IN THE CLEAR LANE FIRST (measured fix). Running horizontally from the ring straight at [REF#DG-00308]
      //    the target room ploughs through whatever else the packer seated on that row: instrumented
      //    over one genCompact pass, spur2-h rejected 241 times and spur1-h 72. The strip between the
      //    ring and the box is clear BY CONSTRUCTION, so the spur goes vertical there first, then turns
      //    in on the target's own centre row. Target is the room CLOSEST TO THE RING, not the closest
      //    to an arbitrary lane point, so the final approach is as short as possible.
      const east = (dir === 'E');
      const laneX = east ? RE1 + 1 : RW0 - 2;            // 2-wide vertical lane hugging the ring [REF#DG-00309]
      let tgt = null;
      for (const r of list) {
        const d = east ? r.x : -(r.x + r.w);
        if (!tgt || d < tgt._d) { tgt = r; tgt._d = d; }
      }
      if (!tgt) return _qf('spur'+seg+'-notgt');
      const row = tgt.cy;
      if (!vClear(laneX, Math.min(lane, row), Math.max(lane, row))) return _qf('spur'+seg+'-v');
      const inFromX = east ? (laneX + 2) : (tgt.x + tgt.w);
      const inToX = east ? (tgt.x - 1) : (laneX - 1);
      const needIn = east ? (inFromX <= inToX) : (inFromX <= inToX);
      if (needIn && !hClear(inFromX, inToX, row)) return _qf('spur'+seg+'-h');
      vRun(laneX, Math.min(lane, row), Math.max(lane, row), seg);
      if (needIn) hRun(inFromX, inToX, row, seg);
      const doorX = east ? tgt.x : (tgt.x + tgt.w - 1);
      if (!doorAt(doorX, row) && !doorAt(doorX, row + 1)) return _qf('spur'+seg+'-door');
      _spurGate.set(seg, [[laneX, lane], [laneX + 1, lane]]);
      return true;
    };
    // S2 north-east box and S1 south-east box leave the EAST arm; S3/S4 leave the WEST arm. [REF#DG-00310]
    // Lanes are chosen inside each box's own y-range so a spur never crosses another section.
    const _spurGate = new Map();
    if (!spurTo(1, 'E', Math.min(RS0 - 3, 32))) return false;
    if (!spurTo(2, 'E', Math.max(RN1 + 1, 12))) return false;
    if (!spurTo(3, 'W', Math.max(RN1 + 1, 12))) return false;
    if (!spurTo(4, 'W', Math.min(RS0 - 3, 32))) return false;
    // ── THE GATES CHAIN AROUND THE RING (Mark 2026-08-03 concentric model). [REF#DG-00311]
    //    The engine contract is explicit at the adapter (~:2262): `segmentTo === segmentFrom + 1`, i.e.
    //    sections unlock in order and you reach 2 THROUGH 1. My first ring gave every section its own
    //    0->N gate straight to the Heart and generation died on "malformed segment gate 2". That
    //    validator is not a bug — it IS the progression model, and it is the right one for concentric
    //    rings, where the outer band is by definition further from her voice than the inner one.
    //    So the cabaret's own east door is gate 0 (Heart -> S1), and each section's spur mouth carries
    //    the gate to the NEXT section round the ring: 1->2, 2->3, 3->4.
    for (const [from, to] of [[1, 2], [2, 3], [3, 4]]) {
      const tiles = _spurGate.get(to);
      if (!tiles || !setGate(tiles, from, from, to)) return _qf('chain-gate-' + from + '->' + to);
    }
    _segmentCount = 5;

    // ── main-hall set + segment streaming carry (every trunk tile = a 2-wide main-hall tile with a section/segment). [REF#DG-00312]
    for (const k of trunk) { mhTiles.add(k); _spineSegmentOf.set(k, _ringSectionOf.get(k) || 1); }

    // ── STRUCTURAL GATES — identical rules to _buildRing/_buildSpine: (1) no CORR beside FLOOR; (2) no ≥3-way CORR [REF#DG-00313]
    //    junction OUTSIDE the trunk; (3) every non-gate, non-hub DOOR touches exactly 1 CORR; (4) door-rule per room.
    // hub bounds now read off the shared head record (the local cabX/landX were removed with the
    // hand-rolled head above — these are the SAME numbers, sourced from _carveHead's return)
    const hubX0 = _head.cabX - 1,
          hubX1 = Math.max(_head.cabX + _head.cabW - 1, _head.landX + _head.landW - 1) + 1,
          hubY0 = _head.cabY - 1,
          hubY1 = _head.landY + _head.landH;
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === FLOOR) return false; }
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== CORR || trunk.has(x + ',' + y)) continue; let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; } if (n >= 3) return false; }
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) { if (T[x][y] !== DOOR || _segmentGateTiles.has(x + ',' + y)) continue; if (x >= hubX0 && x <= hubX1 && y >= hubY0 && y <= hubY1) continue; let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++; if (c !== 1) return false; }
    if (doorRuleViolations() > 0) return false;

    // ── casino / start / hop. START = S1 room nearest the hub; CASINO = the S4 room deepest from the S3↔S4 gate. [REF#DG-00314]
    const start = Q[1].reduce((b, r) => { const L = Math.abs(r.cx - DDX) + Math.abs(r.cy - DDY); return (!b || L < b.L) ? { r, L } : b; }, null).r;
    const casino = Q[4].reduce((b, r) => { const L = Math.abs(r.cx - 5) + Math.abs(r.cy - 22); return (!b || L > b.L) ? { r, L } : b; }, null).r;
    if (!casino) return false;
    casino.type = 'casino';
    const hop = new Map(); for (const s of [1, 2, 3, 4]) for (const r of Q[s]) hop.set(r, s * 3); hop.set(casino, 12);
    return { start, casino, hop };
  }

  // ── FLOOR 1, AS MARK DREW IT (2026-08-04, his labelled floor plan) ────────────────────────────── [REF#DG-00315]
  //
  //    THE DRAWING, READ LITERALLY:
  //
  //                                 2
  //         +---------------------|-----------+
  //         |   +-- 楽屋 --+-- 支配人室 --+   |     · a 2-tile RING corridor encloses the heart
  //         |   |     o    |      o      |    |     · 楽屋 dressing room + 支配人室 manager's office sit
  //     1 --|   +==== backstage hall ====+    |--- 3    NORTH, SIDE BY SIDE, doors on their SOUTH walls
  //         |   #                             |       · the backstage hall runs under both doors and
  //         |   #===o=+-- CABERET --+===o=====|         turns down to the cabaret's WEST door
  //         |         +----o--o-----+         |       · the cabaret's EAST double door opens on the ring
  //         +--------------o--o---------------+----- arm -----o--- 4
  //                        |  |          +-- 番所 --+           · the SE ARM carries the OLD GUARD ROOM
  //                     room 1 entrance  | OLD GUARD|
  //                        |  |          +----------+
  //                        *  spawn
  //
  //    WHAT MOVED, AND WHY EACH ONE IS THE DRAWING RATHER THAN TASTE:
  //
  //    · THE BACKSTAGE MOVED NORTH. It was ONE COLUMN of rooms hanging WEST of the cabaret off a 1-tile
  //      service corridor (the 2026-08-04 morning "50% smaller" cut). The drawing puts the two rooms
  //      SIDE BY SIDE ABOVE the stage with the hall between them and it — which is also how the room
  //      actually works: dressing room and office off one backstage passage, and the passage arrives at
  //      the stage's own side door. Starlette can be heard from the wings.
  //
  //    · THE GUARD ROOM MOVED EAST AND BECAME A HEART ROOM. It used to be SECTION 1's entry room, packed
  //      WEST of the entrance corridor. The drawing labels it "OLD GUARD ROOM" and hangs it off a
  //      SOUTH-EAST ARM of the ring, EAST of the entrance — inside the heart, not inside a section. So
  //      it is carved here with sectionIndex 0, like the dressing room. `isGuardRoom` is untouched, so
  //      the engine's guard-NPC hook keys on exactly the same flag it did before.
  //      ⚠ THIS SUPERSEDES "section 1's first room is the guard room" (Mark 2026-08-04 morning). The
  //        check-in READ is preserved and in fact improved — the post now watches the entrance corridor
  //        AND the arm from one doorway — but the room no longer belongs to a numbered section. Section
  //        1 is the west exit and keeps the cafeteria.
  //
  //    · THE FOUR EXITS ARE NUMBERED AS DRAWN: 1 = WEST · 2 = NORTH · 3 = EAST · 4 = off the SE ARM.
  //      (It was S/E/N/W.) SPECIAL_BUILDING keys on the NUMBER, so "cafeteria takes section 1, factory
  //      takes section 2" (07f47ff) survives the move unchanged — the cafeteria is simply west now.
  //
  //    THE GEOMETRY IS DECLARED, NOT MEASURED — and that is the real repair here. Every earlier cut
  //    trial-carved the head, read a bounding box, and then spent the rest of the function subtracting
  //    things back out of it, because the bbox includes the LANDING and in this layout the landing lives
  //    OUTSIDE the ring. Three separate constants (`_L1GAP` 3->8, `_wingBot`, `_southOf`) existed only to
  //    undo that measurement, and each one had already been re-tuned at least once. Here the RING is
  //    stated as a rectangle, the cabaret's origin is DERIVED from the ring, and _carveHead is told where
  //    to put the head. Change a room size and one constant moves.
  //
  //    THE FOUR SECTION BOXES ARE DISJOINT BY CONSTRUCTION, which is why the L-turn direction is pinned
  //    per section instead of rolled. With five regions to fit outside a 16x19 ring in a 66x66 grid there
  //    is no slack: a westward north-street and a northward east-street overlap in the north-east corner,
  //    and an overlap does not fail loudly — the packer's clearArea just deletes the colliding slab, the
  //    section comes back under `_minRooms`, and genCompact burns 2000 retries. Per-seed variety comes
  //    from room count, size, position and the special building's slot, all still rolled.
  //
  //    ⚠ FLOOR 1 ONLY. genCompact routes only floor 1 here — the L2+ head is 12x26 against floor 1's
  //    5x16 and does not fit this enclosure. Line 1 asserts that rather than assuming it.
  // ── HALLWAY + CABARET + GUARD ROOM. NOTHING ELSE. (Mark 2026-08-24) ─────────────────────────────
  //    "okay now lets only have room 1 + room 2 - nothing else ... we will now just do this,
  //     hallway + caberet + guard room only."
  //    THREE SPACES, and they are the three this generator already carves BY HAND before any packer
  //    runs: the main hall + cabaret head (`_carveHead`), and the guard room (~:2137). Everything
  //    else on floor 1 arrives from two places and only two, both gated below:
  //      · the WEST WING — dressing room + manager's office (the `wing` loop, ~:1974)
  //      · the SECTION ROOMS — every `room`/special the packer hangs off the spine runs (`_place`,
  //        ~:2627 SPECIAL_CELLS and ~:2652 WORKER_CELLS)
  //    ⚠ GATED, NOT DELETED, AND NOTHING IS MOVED. Rooms 0 and 1 keep their exact coordinates —
  //      Mark's standing rule is that the level head never moves, and a trim that relocated the
  //      cabaret would break every anchored fixture in it. The corridor RING and its doors still
  //      carve, because the cabaret's own door law needs somewhere for its doors to open onto; a
  //      door with no through-space is refused by design and the floor fails its own validation.
  //    DEFAULT FLIPPED 2026-08-28 (Mark: "lets recreate our old caberet"). The whole floor builds
  //    again — dressing room, manager's office (which carries the ONLY stairs_down) and the room
  //    body. MEASURED against the 2026-08-15 public release (gold 8660ec30, the tree in
  //    Origami-Release/PROVENANCE.txt): with this default the head is TILE-IDENTICAL to what
  //    shipped — 0 differing tiles across rooms 0-4, cabaret 6x6@(61,63), guard 6x10@(65,72).
  //    Back to head-only: window._headRoomsOnly = true.
  // ⚠ DEFAULT FLIPPED AGAIN 2026-08-29, AND SCOPED TO FLOOR 1 (Mark: "lets do this, remove all the
  //   other rooms around caberet, just have it be right where it is, but we only have the Entrance
  //   hall + intersection + both guard rooms + caberet only"). That list IS head-only plus the west
  //   mirror, so this is a default flip rather than a new mode — the switch was already here.
  //   ⚠ IT KEYS ON `_genLevel`, NOT A BARE `true`. `_headRoomsOnly()` is read at :4619 to WAIVE the
  //     "no stairs_down" throw; a global true would waive it on every floor and quietly collapse the
  //     whole dungeon to one level. Floor 1 only, so floors 2+ keep their packer, their rooms and
  //     their enforced way down.
  //   ⚠ FLOOR 1 HAS NO `stairs_down` UNDER THIS, AND THAT IS MARK'S EXPLICIT CALL 2026-08-29: "we just
  //     remove stairs down for now, just keep our stairs." The manager's office carried the only one
  //     and the office is one of the rooms being removed. NOT a bug, NOT to be "fixed" by a later seat.
  //   Full floor 1 back: window._headRoomsOnly = false (an explicit boolean wins over the default).
  // ⚠ DEFAULT FLIPPED BACK TO FALSE 2026-08-29 (Mark: "grep how the dungeon map looked on last
  //   sc-hardening and bring it all back, we failed to create a better dungeon"). The trim shipped
  //   4 rooms / 152 floor tiles; the 2026-08-15 public cut (gold 8660ec30) shipped 24 rooms / 934.
  //   MEASURED with this default: 0 differing tiles vs gold across the whole 128x128 grid.
  //   Head-only back: window._headRoomsOnly = true.
  const _headRoomsOnly = () => {
    if (typeof window !== "undefined" && typeof window._headRoomsOnly === "boolean") return window._headRoomsOnly;
    return false;
  };

  function _buildSection0() {
    if (_genLevel !== 1) return false;   // genCompact should never route another floor here — say so out loud [REF#DG-00316]
    T = Array.from({ length: GW }, () => new Array(GH).fill(ROCK));
    rooms = []; doorList = []; mhTiles = new Set(); _l1Open = []; _storeDoors = new Set();
    _sectionGateTiles = new Map(); _ringSectionOf = new Map(); _segmentGateTiles = new Map();
    _spineSegmentOf = new Map(); _segmentCount = 0;

    // ── THE HEART'S RECTANGLES ────────────────────────────────────────────────────────────────────── [REF#DG-00317]
    //    Read outward from the cabaret. The bay is two 5x5 rooms SHARING their middle wall column, so it
    //    is 9 wide, not 10 — carve() lays WALL unconditionally on a room's ring, so stacking the office's
    //    west wall onto the dressing room's east wall is byte-identical to carving them apart.
    //
    //      col   cabX-4  cabX-3  cabX-2 ....... cabX+6  cabX+7      (wall course | hall | bay | wall)
    //      row   cabY-8  : wall course
    //            cabY-7 .. cabY-3 : 楽屋 | 支配人室   (5 rows; their doors sit on row cabY-3)
    //            cabY-2  : the backstage hall's east-west run
    //            cabY-1  : ROCK — this IS the cabaret's north wall, and it is load-bearing (see below)
    //            cabY   .. cabY+5 : the cabaret (thin-walled: every tile FLOOR)
    //            cabY+6  : wall course
    //
    //    ⚠ THE ROCK ROW AT cabY-1 IS NOT SPARE SPACE. The floor-1 cabaret is THIN-WALLED — the whole box
    //      is FLOOR so the medallion panels can cover its perimeter — and the structural gate below fails
    //      any CORR tile flush against FLOOR. Run the backstage hall directly along the cabaret's top row
    //      and the map stops generating, on every seed. The rock row is the wall that keeps them apart.
    const BSW = 5, BSH = 5;                 // each backstage room: NetHack-legal 5x5 = 3x3 interior [REF#DG-00318]
    const BAYW = BSW * 2 - 1;               // 9 — shared middle wall column [REF#DG-00319]
    const RINGW = 16, RINGH = 19;           // (4 + BAYW + 1) interior + 2 wall + 4 corridor, both axes [REF#DG-00320]
    const RX0 = (GW - RINGW) >> 1, RX1 = RX0 + RINGW - 1;      // 25 .. 40 — centred on the grid [REF#DG-00321]
    // RY0 = 22 is the one number with real slack on both sides, and all four bounds are arithmetic: [REF#DG-00322]
    //   >= 20  the north section's far band starts at RY0-19 and must clear the grid margin
    //   <= 28  section 4's street runs 18 rows south of the arm (RY0+17) and must clear GH-3
    //   <= 36  the landing's 10 rows start at RY1+1 and must clear GH-2
    //   >= 12  the north street sits at RY0-10
    const RY0 = 22, RY1 = RY0 + RINGH - 1;                     // 22 .. 40 [REF#DG-00323]
    const cabX = RX0 + 6, cabY = RY0 + 10;                     // 31, 32 [REF#DG-00324]
    const WX0 = RX0 + 2, WX1 = RX1 - 2;                        // the wall course hugging the heart [REF#DG-00325]
    const WY0 = RY0 + 2, WY1 = RY1 - 2;
    if (RX0 < 2 || RY0 < 2 || RX1 > GW - 3 || RY1 > GH - 3) return false;

    // ── THE HEAD, PLACED (not measured). LANDGAP 3 puts the landing's north wall on RY1+1, i.e. flush [REF#DG-00326]
    //    under the ring's south band — one crossing between the entrance corridor and the hallway, which
    //    is what "room 1 entrance isn't directly connected to caberet" was asking for.
    const LANDGAP = 3;
    const head = _carveHead(cabX - 1, cabY - 1, LANDGAP);
    // ASSERT THE HEAD LANDED WHERE THE RECTANGLES ABOVE ASSUME IT DID. Everything downstream is derived [REF#DG-00327]
    // from cabX/cabY; if _carveHead is ever re-cut, this fails here instead of drawing a broken floor.
    // ⚠ RE-STATED AS "EAST EDGE FIXED, WEST EDGE MAY WIDEN" (Mark 2026-08-14, +1 tile west). This was
    //   `cabW !== 5`, a literal, and it is what rejected the wider room — the whole floor then failed
    //   generation and the game would not boot at all, which is the correct behaviour for an assertion
    //   whose assumption broke. What downstream actually depends on is the EAST wall and both its doors
    //   (the ring crossing, the stage axis, the landing column), never the west one, so that is what is
    //   asserted now. The west edge is allowed to move at most one tile and no further.
    if (head.cabY !== cabY || head.cabH !== 6) return false;
    if (head.cabX + head.cabW !== cabX + 5) return false;          // east edge is the contract [REF#DG-00328]
    if (head.cabX > cabX || head.cabX < cabX - 1) return false;     // west edge: 0 or 1 tile out, never more [REF#DG-00329]
    if (head.landY !== RY1 + 1 || head.landX !== cabX) return false;

    // ── WALL COURSE, then the 2-WIDE RING outside it ──────────────────────────────────────────────── [REF#DG-00330]
    for (let x = WX0; x <= WX1; x++) for (let y = WY0; y <= WY1; y++) {
      if (x > WX0 && x < WX1 && y > WY0 && y < WY1) continue;
      if (T[x] && T[x][y] === ROCK) T[x][y] = WALL;
    }
    const ringSet = new Set();
    const _carveRing = (x, y) => { if (T[x] && T[x][y] === ROCK) { T[x][y] = CORR; ringSet.add(x + ',' + y); } };
    // ── UNDER hallway+cabaret+guard THE RING SHRINKS TO THE TILES THE THREE ROOMS ACTUALLY USE ── [REF#DG-00331]
    //    (Mark 2026-08-24: "room 1 + room 2 + guard room EXACTLY", after the first cut of this trim
    //    shipped his three rooms wearing the ENTIRE empty ring — 304 corridor tiles, 8 section gates
    //    to sections that no longer exist, measured live. A racetrack around nothing is not "nothing
    //    else".) What stays is exactly the drawn connective tissue of the three rooms, nothing more:
    //      · the SOUTH band from the crossing east — cols cabX..RX1, both band rows: the lobby the
    //        entrance mouth opens into, carrying the cabaret's south doors and the guard room's door
    //      · the EAST band from the cabaret's east double door down to the lobby — the walk from the
    //        cabaret's main doors around to the entrance, rows head.DDY..RY1
    //    The rest of the ring (west band, north band, everything west of the crossing) never carves,
    //    so every dependent set (ringSet, _ringSectionOf, mhTiles) is consistent by construction —
    //    no post-hoc erase pass to desync from. Full ring again: window._headRoomsOnly = false.
    //      · the WEST STUB — 3 band tiles west of the crossing (Mark 2026-08-24 second pass: "MAKE
    //        DOOR ON OTHER WEST SIDE OF INTERSECTION" — the west crossing door pair needs walkable
    //        space behind it or the door law refuses it; the stub is that space and nothing more)
    const _headOnly = _headRoomsOnly();
    for (let x = RX0; x <= RX1; x++) for (let y = RY0; y <= RY1; y++) {
      if (!(x <= RX0 + 1 || x >= RX1 - 1 || y <= RY0 + 1 || y >= RY1 - 1)) continue;
      if (_headOnly && !((y >= RY1 - 1 && x >= cabX - 3) || (x >= RX1 - 1 && y >= cabY + 2))) continue;
      _carveRing(x, y);
    }
    // ── THE SOUTH-EAST ARM. In the drawing the ring's bottom band does not stop at the corner — it runs [REF#DG-00332]
    //    on east, past the guard post, and out to section 4. It is the same 2 rows as the band, so it
    //    reads as the hallway continuing rather than as a spur someone bolted on.
    const ARMLEN = 6;
    const armY0 = RY1 - 1, armY1 = RY1, armX1 = RX1 + ARMLEN;
    if (armX1 > GW - 3) return false;
    // The arm exists to reach section 4; with no sections it is a corridor to rock. `armX1` is still [REF#DG-00333]
    // computed above — the guard room's placement check measures against it either way.
    if (!_headOnly) for (let x = RX1 + 1; x <= armX1; x++) { _carveRing(x, armY0); _carveRing(x, armY1); }
    for (const k of ringSet) _ringSectionOf.set(k, 0);   // the whole loop, arm included, IS section 0 [REF#DG-00334]

    // ── THE CABARET'S EAST DOUBLE DOOR, run out through the wall course onto the ring. _carveHead [REF#DG-00335]
    //    already punched the leaves; this is what makes the hallway REACHED from inside the heart rather
    //    than merely drawn around it.
    let reached = false;
    for (const yy of [head.DDY, head.DDY + 1]) {
      for (let x = head.DDX + 1; x <= WX1; x++) {
        const t = T[x] && T[x][yy];
        if (t === ROCK || t === WALL) { T[x][yy] = CORR; ringSet.add(x + ',' + yy); _ringSectionOf.set(x + ',' + yy, 0); reached = true; }
      }
    }
    if (!reached) return false;

    // ── THE BACKSTAGE: 楽屋 + 支配人室 SIDE BY SIDE, ONE HALL BELOW THEM ───────────────────────────── [REF#DG-00336]
    //
    //        +-- 楽屋 --+-- 支配人室 --+      楽屋   = Starlette's dressing room (open)
    //        |          |              |      支配人室 = the manager's office (LOCKED, 立入禁止)
    //        +-----o----+------o-------+
    //     #==============================        # = the hall's west column, dropping to the stage door
    //     #
    //     #====o== [ CABERET ]
    //
    //    THE HALL IS ONE TILE WIDE ON PURPOSE and every room hangs off it with its own door at its own
    //    wall midpoint, so doorRuleViolations() polices them like any other room. It is exempt from the
    //    no-3-way-junction rule for the same reason the ring is: a service corridor with a door on each
    //    room IS a junction at every door, and that is the shape drawn. Collected as it is carved rather
    //    than re-derived afterwards — re-deriving is how an exemption silently stops covering a tile.
    //
    //    THE VAULT (金庫室) AND THE QUARTERS (自室) STAY REMOVED — Mark's 08-03 spec and this drawing both
    //    show dressing room + manager office only. The isVault adapter branch remains deliberately inert.
    const hallX = cabX - 3;                 // the hall's west column — flush inside the wall course [REF#DG-00337]
    const bayX0 = cabX - 2;                 // the bay's west wall; rooms span bayX0 .. bayX0+BAYW-1 [REF#DG-00338]
    const bayY0 = cabY - 7, bayY1 = bayY0 + BSH - 1;   // the bay's top and bottom WALL rows [REF#DG-00339]
    const hallY = cabY - 2;                 // the east-west run, one row under both doors [REF#DG-00340]
    const stageDoorY = cabY + 2;            // the cabaret's west door — level with its east double door [REF#DG-00341]
    if (hallX !== WX0 + 1 || bayX0 + BAYW - 1 !== WX1 - 1 || bayY0 !== WY0 + 1) return false;
    const wing = [
      { x: bayX0,           type: 'dressing' },
      { x: bayX0 + BSW - 1, type: 'office'   },   // shares the dressing room's east wall column [REF#DG-00342]
    ];
    const _wingOn = !_headRoomsOnly();   // dressing room + manager's office — off under hallway+cabaret+guard [REF#DG-00343]
    const wingHall = new Set(), wingRooms = [];
    const _wh = (x, y) => { if (T[x] && T[x][y] === ROCK) { T[x][y] = CORR; wingHall.add(x + ',' + y); } };
    // ⚠ THE WHOLE WING IS ONE PIECE — gating only the room carve is what broke the boot the first [REF#DG-00344]
    //   time: `wingRooms` went empty and `_hallX1 = wingRooms[last].cx` threw "Cannot read properties
    //   of undefined (reading 'cx')", `_buildSection0` returned nothing, and the 2000-try re-roll loop
    //   span forever with __engineReady never firing. The wing hall, its two doors AND the cabaret's
    //   own west door all exist only to serve these rooms — with no wing that west door opens onto
    //   solid rock, which the "a corridor may not touch room floor without a door" gate rejects.
    //   So the block is skipped whole, not hollowed out.
    if (_wingOn) {
    for (const w of wing) {
      const r = carve(w.x, bayY0, BSW, BSH, w.type); wingRooms.push(r);
      // ⚠ segmentId 0 EXPLICITLY. The adapter's fallback for a room with neither segmentId nor [REF#DG-00345]
      // sectionIndex is 1, not 0 — leaving it off silently filed the whole backstage under a section 1
      // that does not exist in this layout (measured once already: 28 floor tiles under segment 1).
      r.segmentId = 0; r.sectionIndex = 0;
      T[r.cx][bayY1] = DOOR; doorList.push([r.cx, bayY1]);       // door at the SOUTH wall's midpoint [REF#DG-00346]
      // ── THE MANAGER'S DOOR IS LOCKED AND SAYS SO (Mark 2026-08-03: "create a special locked door to [REF#DG-00347]
      //    the managers office with sign keep out"). One locked door is a landmark; three are a chore,
      //    so the dressing room stays open (still true — only the sign changed).
      //    RE-WORDED 2026-08-06 (Mark: "add a smaller AUTHORIZED PERSONS ONLY to the west doors leading
      //    to manager office and dressing room") — both doors now carry the SAME phrase, matching the
      //    cabaret-side entrance sign's already-established 関係者以外立入禁止 ("no entry for anyone not
      //    concerned") rather than the office's old, harsher 立入禁止 ("no entry, period"). The dressing
      //    room's entry is explicit `locked: false` — omitting `locked` defaults to LOCKED (the adapter
      //    reads `_lk.locked !== false` at ~:3262), which would have silently sealed the one door this
      //    block deliberately leaves open.
      // ⚠ PLAYTEST UNLOCK 2026-08-08 (Mark: "so I can test stuff unlock the double doors so I can test
      //    each room + manager office ok?"). The office door was the ONLY genuinely locked door on the
      //    floor — the ring's double doors already start `cleared:true` (Engine9 ~:3792, "no section is
      //    ever locked"), so this one line was the whole of what he could not walk through. Default is
      //    now OPEN so every room is reachable for testing. ONE flag puts the landmark back:
      //    window._officeDoorLocked = true (set before map generation). See the DISABLED-FEATURES
      //    REGISTER entry at the top of NewOrigami.Engine9.html.
      //    ⚠ Do NOT "fix" this by deleting the key: OMITTING `locked` defaults to LOCKED (the adapter
      //      reads `_lk.locked !== false`), which is the opposite of what this line is for.
      const _officeLocked = (typeof window !== 'undefined' && window._officeDoorLocked === true);
      _lockedDoors.set(r.cx + ',' + bayY1, { sign: '関係者以外立入禁止', signEn: 'AUTHORIZED PERSONS ONLY', by: (w.type === 'office' ? 'manager' : 'dressing'), locked: w.type === 'office' ? _officeLocked : false });   // explicit both ways (CLAUDE/AI-1 review 08-06): `undefined` for office worked via the adapter's `!== false` default, but reads as accidental to the next person — say what you mean [REF#DG-00348]
    }
    // the hall: east-west under both doors, then down the west column, then east to the stage door. [REF#DG-00349]
    // Its east end is the OFFICE'S OWN door column, read off the carved room — a hand-computed span
    // that stops one tile short leaves the manager's door opening onto rock, and nothing downstream
    // notices except a player who cannot get in.
    const _hallX1 = wingRooms[wingRooms.length - 1].cx;
    for (let x = hallX; x <= _hallX1; x++) _wh(x, hallY);
    for (let y = hallY; y <= stageDoorY; y++) _wh(hallX, y);
    // ⚠ THE STUB AND ITS DOOR FOLLOW THE ROOM'S ACTUAL WEST COLUMN (Mark 2026-08-14, +1 tile west). [REF#DG-00350]
    //   Both were hard-coded to cabX — the old west edge. Widening the cabaret moved that edge onto the
    //   stub, so the corridor ran INTO open room floor with the door left stranded one tile inside, and
    //   the "a corridor may not touch room floor without a door" gate (~:2650) correctly failed the
    //   whole floor: the game would not boot. head.cabX IS the west column in both cases, so this is
    //   byte-identical when the widening is off.
    const _cabWestX = head.cabX;
    for (let x = hallX + 1; x <= _cabWestX - 1; x++) _wh(x, stageDoorY);
    for (const r of wingRooms) if (T[r.cx][hallY] !== CORR) return false;   // every door must open onto the hall [REF#DG-00351]
    // out through the cabaret's own west edge (thin wall — the boundary column IS floor, so this [REF#DG-00352]
    // converts a floor tile into the door, exactly as the south entrance does below)
    T[_cabWestX][stageDoorY] = DOOR; doorList.push([_cabWestX, stageDoorY]);
    // THE SIGN ON THE CABARET SIDE (Mark 2026-08-03: "sign above the caberet door … authorized personnel [REF#DG-00353]
    // only"). 関係者以外立入禁止 — staff only. Signed but NOT locked: the player walks through and meets
    // the locked office door beyond it, which is where the refusal belongs.
    _lockedDoors.set(_cabWestX + ',' + stageDoorY, { sign: '関係者以外立入禁止', signEn: 'AUTHORIZED PERSONNEL ONLY', by: 'cabaret', locked: false });
    for (const k of wingHall) _spineSegmentOf.set(k, 0);
    _sec0WingCarved = true;   // the adapter's post-hoc west-wing stamp stands down — see its guard [REF#DG-00354]
    }   // ── end of the west wing (skipped entirely under hallway+cabaret+guard) ── [REF#DG-00355]

    // ── THE ENTRANCE AXIS, AS DRAWN ───────────────────────────────────────────────────────────────── [REF#DG-00356]
    //
    //        [ cabaret ]
    //        ==+#+======   <- its SOUTH DOUBLE DOORS, punched through the wall course
    //        ~~~~~~~~~~~   <- the RING's south band (2 tiles) — the heart's hallway
    //        ==+#+======   <- the landing's NORTH DOUBLE DOORS
    //        [ room 1 entrance corridor, running south to the player's spawn ]
    //
    //    The player walks up the corridor, crosses ONE band, and is in the cabaret.
    //    ⚠ THE CABARET'S OPENINGS MUST BE REGISTERED IN `_l1Open`. The floor-1 cabaret is thin-walled, so
    //      the adapter re-draws shoji panels around its box afterwards and silently walls over any door
    //      it was not told about — the compact grid was already perfect while the engine showed solid
    //      wall, which is how the cabaret ended up unreachable once before. `_l1Open` takes the CABARET'S
    //      OWN boundary FLOOR tile (roomId 1), never the tile beyond it: the adapter reads these as "this
    //      room has an opening here" and it is keyed on the room's tile.
    //    ⚠ THE PLAYER'S OWN WAY IN IS AN OPEN MOUTH, NOT A DOOR (Mark 2026-08-04: "remove the door in
    //      front of the main hall for player entrance, but place a door for the west and the east").
    //      Three of the crossing's four sides are doors — north into the cabaret, west and east along
    //      the hallway. The south side, the one the player walks up out of the entrance corridor, is a
    //      plain opening: you arrive in the crossing, and the doors are the CHOICES in front of you.
    //      It is carved as FLOOR in the landing's north wall and registered in `_l1Open` with edge 'N'
    //      so the adapter's pane pass leaves it open.
    const mA = head.landX + 1, mB = head.landX + 2;   // the landing's two interior columns [REF#DG-00357]
    const openMouth = new Set();
    for (const mx of [mA, mB]) {
      if (mx <= cabX || mx >= cabX + head.cabW - 1) return false;   // must fall inside the cabaret's span [REF#DG-00358]
      T[mx][WY1] = DOOR; doorList.push([mx, WY1]);                  // cabaret -> band, through the wall course [REF#DG-00359]
      _l1Open.push([mx, WY1 - 1]);
      T[mx][head.landY] = FLOOR;                                    // band -> entrance corridor: OPEN, no leaf [REF#DG-00360]
      _l1Open.push([mx, head.landY, 'N']);
      openMouth.add(mx + ',' + head.landY);
      if (T[mx][RY1 - 1] !== CORR || T[mx][RY1] !== CORR) return false;   // both band rows, or the axis is a lie [REF#DG-00361]
    }

    // ── 番所 — THE OLD GUARD ROOM, hung off the hallway's south face ───────────────────────────────── [REF#DG-00362]
    //    (Mark 2026-08-04: "section 1 first room will be guard room, which will have guards that can
    //    protect the dungeon and anyone entering the caberet from the entranceway"). The room moved into
    //    the heart with this drawing but the brief did not: from this doorway a guard watches the top of
    //    the entrance corridor and the way east at once, and every adventurer passes it before reaching
    //    the stage. THE ROOM AND THE FLAG LAND, THE GUARDS DO NOT — posting live NPCs is engine AI work
    //    that keys on `isGuardRoom`, and inventing it here is how a feature ships half-built.
    //    DETERMINISTIC: fixed offsets on virgin rock, so a failure here means the geometry is wrong, not
    //    the seed. clearArea is deliberately NOT used — the room's north wall is meant to touch the band.
    //
    //    ⚠ ONE COLUMN OFF THE ENTRANCE CORRIDOR, NOT FIVE (Mark 2026-08-04, second pass: "make the guard
    //      room of section 1 closer to the entrance halllway"). It sat at landX+landW+5, out under the
    //      SE arm — faithful to where the drawing sketches it, but a guard post you walk past rather
    //      than through is decor. `+1` is the minimum that still leaves a wall between the two rooms
    //      (their walls would otherwise merge and the check below would reject the placement), so the
    //      post now looks straight down the corridor the player climbs.
    //    ── BIG ENOUGH TO BE A COAT CHECK AND A TICKET COUNTER (Mark 2026-08-05: "can you enlarge the
    //       guard room so when its active it becomes a coat check and ticket counter?") ──────────────
    //       5×5 = 25 tiles, and a counter needs a public side AND a staff side or it is just a wall.
    //       6×8 = 48 tiles: the counter runs across the room, patrons queue in the north half where the
    //       doors are, staff work the south half behind it.
    //       ⚠ GROWN SOUTH, NOT EAST, AND THAT IS THE WHOLE POINT. East is section 4's frontage, which
    //         the handoff already measures as the tightest on the floor (~27 tiles where ~56 are needed
    //         for 6 rooms + a 2× special). Taking two more columns from it to seat a counter would buy
    //         this room at the cost of a section that is already failing its room count. South is the
    //         empty pocket between the landing and section 4's west edge — free real estate. Only ONE
    //         extra column is taken (36-41 vs 36-40) and the rest of the growth is downward.
    //    ── IT RUNS THE WHOLE LENGTH OF THE ENTRANCE NOW (Mark 2026-08-05: "adjust the guard room so it
    //       is larger and removes all empty space between guardroom and entrance with only a half high
    //       thin wall between room and entrance for coat check and counter … do you know what a coat
    //       check looks like? its next to any entrance to any club.") ─────────────────────────────────
    //       HE IS RIGHT AND THE OLD SHAPE WAS WRONG. A coat check is not a room you visit; it is a
    //       counter you walk PAST on your way in, open to the entrance, staff behind it. The 6×8 room
    //       was sealed off the arm with its counter shoved against a side wall — his screenshot shows
    //       exactly that, a private office with dead floor. So the room is now as LONG as the entrance
    //       corridor itself (GRH matches the landing's height), which is what "removes all empty space
    //       between guardroom and entrance" means: no stub of leftover rock beside the hallway, the
    //       coat check simply IS the east side of the walk-in.
    //       WIDTH HELD AT 6 ON PURPOSE. Growing east would take frontage from section 4, still the
    //       tightest on the floor. The length is where the room needed to grow anyway — a coat counter
    //       wants to be long and shallow, not square.
    //    ── IT IS THE CORNER ROOM, AND IT SHARES THE ENTRANCE'S WALL (Mark 2026-08-05: "lets build out
    //       the guard room as the corner room, just like a ticket counter next to a hallway would be a
    //       hat check coat check entrance ticketing teller counter") ────────────────────────────────
    //       THE OLD `+1` PUT THREE WALLS BETWEEN THE COUNTER AND THE PLAYER. Measured on seed 7: the
    //       landing floor ended at x=33, then wall x=34 (the landing's own east wall), the "counter"
    //       x=35, then wall x=36, then the guard floor. Only the MIDDLE course was drawn half-height, so
    //       from the entrance you were looking at a full-height wall with a counter hidden behind it.
    //       The in-source comment claimed x=35 was "the single rock course between the landing and this
    //       room" — it never was. That is why the coat check never read as one.
    //       `-1` seats the room's west wall ON the landing's east wall, so ONE course separates them and
    //       that course IS the counter: entrance floor on the public side, guard floor on the staff
    //       side, waist-high timber between. That is a teller window, which is what he asked for.
    //       ⚠ THIS IS THE ONE PLACE THE 番所 TOUCHES THE LEVEL HEAD. It does NOT move room 0, room 1 or
    //         the konbini and carves no new opening — `carve()` writes WALL on its ring, so re-carving
    //         the landing's existing east wall leaves it a wall (idempotent). What changes is that the
    //         shared course is now drawn at counter height. That is exactly the "only a half high thin
    //         wall between room and entrance" Mark asked for on 08-05, and nothing else about the head.
    //       BONUS, not the reason: the east edge moves 41→39, handing two columns back to section 4 —
    //       the frontage the map handoff measures as the tightest on the floor.
    const GRW = 6, GRH = Math.max(8, head.landH);
    const gX0 = head.landX + head.landW - 1, gY0 = RY1 + 1;        // west wall SHARED with the entrance corridor [REF#DG-00363]
    if (gX0 + GRW - 1 > armX1 - 1 || gY0 + GRH - 1 > GH - 2) return false;
    // The shared column may legitimately be the landing's WALL (that is the whole point) or virgin ROCK [REF#DG-00364]
    // where the room runs past the landing's south end. Everything EAST of it must still be untouched
    // rock, or we are carving through somebody else's room.
    for (let y = gY0; y <= gY0 + GRH; y++) {
      if (T[gX0] === undefined) return false;
      const _sc = T[gX0][y];
      if (_sc !== WALL && _sc !== ROCK) return false;              // shared course: landing wall or rock, nothing else [REF#DG-00365]
    }
    for (let x = gX0 + 1; x <= gX0 + GRW; x++) for (let y = gY0; y <= gY0 + GRH; y++) {
      if (T[x] === undefined || T[x][y] !== ROCK) return false;    // nothing may already be here [REF#DG-00366]
    }
    const guardRoom = carve(gX0, gY0, GRW, GRH, 'guard');
    guardRoom.sectionIndex = 0; guardRoom.segmentId = 0; guardRoom.isGuardRoom = true;
    //    ── BACK TO A SINGLE 1-TILE DOOR (Mark 2026-08-11: "fix guard room doors to be the 1-tile door [REF#DG-00367]
    //       I put in assets door folder") ──────────────────────────────────────────────────────────
    //       SUPERSEDES the 2026-08-05 "same double doors as the crossing" entry (kept below for the
    //       record, not the current behaviour — that pass went to 2 tiles because "MARK'S LAW reserves
    //       wooden double doors for doorways of 2+ tiles" and a 1-tile door could only ever render as a
    //       flat paper shoji before. Mark has since supplied a real wooden 1-tile door asset
    //       (assets/textures/doors/door-1-tile.front/back.png) built for exactly this doorway, which
    //       removes the reason the width was ever grown. Single tile at the north wall midpoint
    //       (`guardRoom.cx`), still registered in `_fixedPanelDoors` so it cannot roll `panelless` and
    //       drop to an open archway — same protection the pair used to need, now on one tile.
    //       ⚠ 2026-08-12: this carve, the `_fixedPanelDoors` stamp and the tile-flag adapter read that
    //       makes it renderable were all lost to an accidental `git checkout -- DungeonChain.js` the
    //       same day (see .trust/recovered/HAIKU-DungeonChain-guarddoor-FRAGMENT.md) and are rebuilt
    //       here, folded into the generic `specialDoor` pass (~generateDungeonMap, search "SPECIAL-ROOM
    //       1-TILE DOORS") rather than a bespoke guard-only Set — Mark separately asked for the same
    //       1-tile animated door on every special room, not just this one.
    //    ── OLD TEXT, FOR THE RECORD (2026-08-05, superseded above) ────────────────────────────────
    //       "i didnt ask for broken doors, give them same double doors, its part of the guard room
    //       system": two adjacent tiles straddled the north midpoint, both registered in
    //       `_fixedPanelDoors` so neither leaf could roll `panelless` and drop the pair to an open
    //       archway. `doorRuleViolations()` was taught to read a centred adjacent pair as one doorway —
    //       that reader is now dead code for this room (a single tile needs no such exemption) but is
    //       left in place since other doorways may still rely on it.
    //    ── THE SHARED WALL WITH THE ENTRANCE IS THE COUNTER ────────────────────────────────────────
    //       Column gX0-1 is the single rock course between the landing and this room. Every tile of it
    //       that faces the room is marked half-height, so from the entrance corridor you look straight
    //       over a waist-high counter into the coat check — the club-foyer read Mark asked for. It stays
    //       a WALL tile: you cannot walk through it, monsters cannot path through it, and nothing about
    //       collision or LOS changes. Only the drawn height does, and the engine hangs the counter top
    //       and the coat rail off this same run (see the 番所 COUNTER block in Engine9).
    // ⚠ THE COUNTER IS NOW THE ROOM'S OWN WEST WALL (gX0), NOT A SEPARATE COURSE AT gX0-1. With the room
    //   seated flush against the landing, gX0-1 is the entrance corridor's FLOOR — marking that would
    //   have cut a walkable tile to counter height and marked nothing solid at all.
    //   ⚠ AND IT TESTS FOR `WALL`, NOT `ROCK`. `carve()` has already run by this point and turned this
    //     column into the room's wall ring, so the old `=== ROCK` test now matches NOTHING and the
    //     counter silently vanishes — the counter-skipped path, with a full-height wall left behind.
    //     This is the same class as the `r.z` trap: a test that reads fine and quietly matches zero tiles.
    // ── ONLY HALF THIS WALL IS A COUNTER (Mark 2026-08-29: "Make sure the South Guard room is only
    //    having half of its NORTH wall as counter, the other half walls near entrance stair are
    //    normal walls.") ─────────────────────────────────────────────────────────────────────────
    //    WHICH HALF IS DERIVED FROM THE STAIRS, NOT GUESSED. This wall runs NORTH-SOUTH down the whole
    //    length of the entrance corridor, and `stairs_up` sits at its SOUTH end (measured: 63,80 and
    //    64,80 against a counter column of x=65, z=72..81). So "the half near entrance stair" is the
    //    SOUTH half, and it stays full-height wall; the counter is the NORTH half, the end nearest the
    //    crossing and the cabaret, which is the end a patron actually walks up to.
    //    ⚠ THE WHOLE COLUMN USED TO BE COUNTER — 10 tiles of waist-high timber, so the entrance corridor
    //      was open over its full length into the guard room, right down past the stairs you arrive on.
    //    Full-length counter again: window._guardCounterHalf = 10 (or any tile count).
    const _cwX = gX0;
    // ⚠ DEFAULT FLIPPED BACK TO THE FULL COLUMN 2026-08-29 (Mark: "bring it all back"). The half [REF#DG-01189]
    //    counter is 08-28 work; the 2026-08-15 cut ran counter the whole GRH. Half again: _guardCounterHalf = 5.
    const _cwRun = (typeof window !== "undefined" && typeof window._guardCounterHalf === "number")
      ? Math.max(0, Math.min(GRH, window._guardCounterHalf)) : GRH;
    for (let y = gY0; y < gY0 + _cwRun; y++) {
      if (T[_cwX] && T[_cwX][y] === WALL) _counterWallTiles.add(_cwX + ',' + y);
    }
    guardRoom.counterWallX = _cwX;
    guardRoom.counterWallY0 = gY0; guardRoom.counterWallY1 = gY0 + _cwRun - 1;

    const _gdX = guardRoom.cx;
    if (T[_gdX][gY0 - 1] !== CORR) return false;                    // leaf must open onto the arm [REF#DG-00368]
    T[_gdX][gY0] = DOOR; doorList.push([_gdX, gY0]);
    _fixedPanelDoors.add(_gdX + ',' + gY0);                         // compact space (T coords), as the crossing stores them — the consumer adds OX/OY; forces a solid wooden panel, never a paper gap [REF#DG-00369]

    // ── THE WEST 番所 — AN EMPTY MIRROR OF THE GUARD POST (Mark 2026-08-29: "can you make another [REF#DG-01190]
    //    guard room opposite of the current one, but it will be empty, just duplicate WITHOUT the
    //    halfhigh walls.") ───────────────────────────────────────────────────────────────────────
    //    "OPPOSITE" IS MEASURED, NOT ASSUMED. The guard post sits EAST of the entrance corridor and
    //    shares its west wall with it. North of the corridor is the hallway ring and then the cabaret —
    //    no 6x10 pocket there — while west of the corridor is unbroken rock for ten columns. The mirror
    //    is therefore the WEST side, seated the same way: its EAST wall IS the corridor's west wall,
    //    exactly as the original's WEST wall is the corridor's east wall.
    //    ⚠ IT IS DELIBERATELY **NOT** `isGuardRoom`. That flag is read by a dozen consumers and TWO of
    //      them are singular `find`s — including this file's own counter/low-wall block
    //      (`rooms_out.find(r => r && r.isGuardRoom)`). A second room carrying the flag could silently
    //      capture the counter and the desk run and move them into the empty room. It also gates the
    //      barrel spawner (Engine9 ~:13121), and Mark asked for this room EMPTY. It keeps
    //      `roomType:'guard'` so it still wears the guard wall style (Engine9 ~:8882 accepts either).
    //    ⚠ NO LOW WALLS OF ITS OWN — that is the "WITHOUT the halfhigh walls" half of the order. The
    //      desk run is built off `_guard` (the isGuardRoom room) further down, so not setting the flag
    //      is what keeps this room's walls full height. Nothing here marks `lowWall`.
    //    ⚠ IT DOES NOT FAIL THE FLOOR. The original 番所 `return false`s if it cannot seat, because the
    //      head is meaningless without it; this one is additive, so a seed that cannot hold it simply
    //      does not get it. A generator that aborts a whole floor over a decorative duplicate is worse
    //      than a floor without the duplicate. Off entirely: window._westGuardRoom = false.
    // ⚠ DEFAULT FLIPPED TO OPT-IN 2026-08-29 (Mark: "bring it all back"). This second 番所 is 08-28
    //    work and does not exist in the 2026-08-15 cut. Back on: window._westGuardRoom = true.
    if (typeof window !== "undefined" && window._westGuardRoom === true) {
      const gX0b = head.landX - GRW + 1;            // its EAST wall lands ON the corridor's west wall [REF#DG-01191]
      const _shX = gX0b + GRW - 1;                  // == head.landX, the shared course [REF#DG-01192]
      let _fit = gX0b >= 1;
      if (_fit) for (let y = gY0; y <= gY0 + GRH && _fit; y++) {
        const _sc = T[_shX] && T[_shX][y];
        if (_sc !== WALL && _sc !== ROCK) _fit = false;     // shared course: corridor wall or rock, nothing else [REF#DG-01193]
      }
      if (_fit) for (let x = gX0b; x < _shX && _fit; x++) for (let y = gY0; y <= gY0 + GRH && _fit; y++) {
        if (T[x] === undefined || T[x][y] !== ROCK) _fit = false;   // nothing may already be here [REF#DG-01194 → see REF#DG-00366]
      }
      // The doorway is checked BEFORE carving. Carving first and failing to seat a door would leave a [REF#DG-01195]
      // sealed room behind — a reachability hole the band/connect gates would report as a mystery.
      const _wdX = gX0b + Math.floor(GRW / 2);
      if (_fit && !(T[_wdX] && T[_wdX][gY0 - 1] === CORR)) _fit = false;
      // ⚠ THE DOORWAY WIDTH IS MARK'S LAW, NOT A PREFERENCE, AND IT IS WHY THIS ROOM KILLED [REF#DG-01196]
      //   `_headRoomsOnly` FOR A WHILE. genCompact refuses a floor where a 1-tile door faces a hallway
      //   exactly 2 wide ("shoji in a 2-wide hallway -> redraw") and retries until it gives up. On the
      //   FULL floor the arm outside this door is a wide ring, which the same test waives as a junction,
      //   so one tile was fine and nothing complained. Under head-only that arm is a 2-wide STUB
      //   (x=59..60) — so the identical door was refused on EVERY seed and the whole floor failed with
      //   "generation failed after retries". MEASURED: rejection at the hallway-width test, 2000 hits
      //   with this room and ZERO without it. The guard post escapes the same rule only because its own
      //   arm is wider than 2. So: measure the arm and match it, 1 tile normally, 2 against a 2-wide
      //   stub. Obeying the law beats exempting this room from it.
      //   ⚠ I TRIED MEASURING THE ARM MYSELF AND IT WAS WRONG — recorded so nobody repeats it. Counting
      //     contiguous CORR along the row above the door gave "wider than 2" while the validator, which
      //     counts `_hl` HALLWAY tiles perpendicular to the door axis, read exactly 2 at that same tile
      //     (`[RF2915] n=1 hallW=2`). Two different notions of "how wide is this arm", and mine is not
      //     the one that decides. Rather than reimplement its test — a second definition that can drift
      //     out of step with the first, which is how the counter ended up on a seam that had moved —
      //     the doorway is simply TWO tiles. That satisfies both halves of the law at once: `n>=2` is
      //     only refused against a 1-wide hallway, and this arm is never 1 wide. On the FULL floor the
      //     ring outside is wider than 2 and the test waives the doorway entirely, so one width is
      //     correct in both configurations and no mode flag is needed.
      let _wdN = 1, _wdX2 = -1;
      if (_fit) {
        for (const sg of [-1, 1]) {
          const cand = _wdX + sg;
          if (cand > gX0b && cand < _shX && T[cand] && T[cand][gY0 - 1] === CORR) { _wdX2 = cand; _wdN = 2; break; }
        }
      }
      if (_fit) {
        const westGuard = carve(gX0b, gY0, GRW, GRH, 'guard');
        westGuard.sectionIndex = 0; westGuard.segmentId = 0;
        westGuard.isEmptyGuard = true;              // its own flag; see the isGuardRoom note above [REF#DG-01197]
        westGuard.roomName = '番所'; westGuard.roomNameEn = 'GUARDPOST';
        T[_wdX][gY0] = DOOR; doorList.push([_wdX, gY0]);
        _fixedPanelDoors.add(_wdX + ',' + gY0);
        if (_wdN === 2 && _wdX2 >= 0) { T[_wdX2][gY0] = DOOR; doorList.push([_wdX2, gY0]); _fixedPanelDoors.add(_wdX2 + ',' + gY0); }
      }
    }

    // ⚠ CARVED **AFTER** THE 番所, NOT BEFORE (moved 2026-08-05). Mark asked to push these doors back [REF#DG-00370]
    //   two tiles; the first attempt did it in place and failed generation on EVERY seed. Two tiles
    //   east lands on the guard room's NORTH WALL, which already carries its own double door, so
    //   _wallDoorsOk fails and buildDungeon returns false forever. The push-back test has to be able
    //   to SEE the guard room to avoid it, and the guard room is carved below — so the crossing doors
    //   now come after it. `crossDoors` is only read much later (the door-rule exemption ~2677), so
    //   nothing between here and there depends on the old ordering.
    // ── THE FOUR-WAY DOOR AT THE CROSSING (Mark 2026-08-04: "add double doors to the east and west at
    //    the intersection of the hallway with the caberet and the entrance hallway, that is perfect
    //    place for a 4-way door").
    //
    //        ==+#+==      the cabaret's south leaves (already there)
    //       +| . . |+     <- THESE: the west and east leaves, 2 tiles tall like every other pair here
    //       +| . . |+
    //        ==+#+==      the landing's north leaves (already there)
    //
    //    The stage doors and the entrance doors already faced each other across the band; the two new
    //    pairs close the other axis, so the square where the entrance meets the hallway becomes a
    //    crossing you pass THROUGH a door to leave, in any direction, instead of a place where the
    //    corridor simply widens. Columns are mA-1 and mB+1 — one outside each mouth column — so the
    //    leaves FRAME the crossing rather than standing inside it.
    //
    //    ⚠ EXEMPT FROM THE ONE-CORR-NEIGHBOUR DOOR RULE, and that exemption is the honest cost of the
    //      feature: a door in the MIDDLE of a corridor has corridor on both sides by definition. It is
    //      the same exemption sectionGate doors have always carried, and it is scoped to these four
    //      tiles by an explicit set — never widened to "any door on the band", which would also quietly
    //      excuse a genuine mistake somewhere else on the ring.
    // ── PUSHED BACK OFF THE CROSSING (Mark 2026-08-05: "move them back 2 tiles") ─────────────────
    //    They were at mA-1 / mB+1 — one tile outside each mouth column, so all three doorways (the
    //    cabaret's south leaves, and these two) crowded into the same few tiles and the crossing read
    //    as a knot of doors rather than a room with choices leading off it. Two tiles further out
    //    along the band gives each door its own stretch of wall.
    //    ⚠ FALLS BACK RATHER THAN FAILING. The original code did `return false` — a whole-floor
    //      regeneration — if a column was not CORR. Doing that on the pushed-back columns would throw
    //      away every seed where the band happens to be shorter on one side, and "generation failed
    //      after retries" has been in Mark's face once already over exactly this class of tightening.
    //      Each side independently takes the far column if it is band hallway, else the original one.
    //    ⚠ AND IT MUST NOT LAND ON A ROOM'S WALL — this is what made the first attempt fail EVERY
    //      seed with "generation failed after retries". Two tiles east puts the column on the 番所's
    //      NORTH WALL, which already carries the guard room's own double door; four door tiles on one
    //      wall breaks `_wallDoorsOk`, doorRuleViolations() returns non-zero, buildDungeon returns
    //      false, and the retry loop grinds through every seed getting the same answer. Room records
    //      here INCLUDE their wall ring (doorRuleViolations reads T[x][r.y] as the north wall), so the
    //      test is simply "is this tile on any room's perimeter".
    const _CROSS_BACK = (typeof global._crossDoorBack === 'number') ? global._crossDoorBack : 1;
    const _onRoomWall = (cx, cy) => {
      for (const r of rooms) {
        const inX = cx >= r.x && cx <= r.x + r.w - 1, inY = cy >= r.y && cy <= r.y + r.h - 1;
        if (inX && inY && (cy === r.y || cy === r.y + r.h - 1 || cx === r.x || cx === r.x + r.w - 1)) return true;
      }
      return false;
    };
    //    ⚠ THE ROOM-WALL TEST APPLIES TO THE PUSHED POSITIONS ONLY, NEVER TO THE ORIGINAL COLUMN. [REF#DG-00371]
    //      Second failure, same symptom: the EAST door has ALWAYS stood on the 番所's north-west
    //      CORNER, and that has always been legal. Applying the new test to `back = 0` as well
    //      rejected the one position known to work, so every seed returned null and generation died
    //      again. A guard added for a new case must not retroactively outlaw the old one.
    const _crossCol = (base, dir) => {
      const band = (cx) => T[cx] && T[cx][RY1 - 1] === CORR && T[cx][RY1] === CORR;
      const free = (cx) => !_onRoomWall(cx, RY1 - 1) && !_onRoomWall(cx, RY1);
      // Walk INWARD from the requested push-back to the original column, taking the furthest that [REF#DG-00372]
      // works. Each side decides independently — the west can move even when the east cannot.
      for (let back = _CROSS_BACK; back >= 1; back--) { const cx = base + dir * back; if (band(cx) && free(cx)) return cx; }
      return band(base) ? base : null;   // the original column: band test only, exactly as before [REF#DG-00373]
    };
    const crossDoors = new Set();
    // ── BOTH LEAVES AGAIN — WEST RESTORED ON MARK'S ORDER (2026-08-24, second pass) ────────────── [REF#DG-00374]
    //    The first cut of the trim skipped the west pair (it faced erased rock and `_crossCol`'s own
    //    `band()` test would have rejected every floor). Mark: "MAKE DOOR ON OTHER WEST SIDE OF
    //    INTERSECTION OF THE 2 TILE HALLWAY WITH CABERET." The ring filter above now carves a 3-tile
    //    WEST STUB behind the door, so the pair is legal under the door law and `band()` passes.
    //    The intersection reads four ways again: cabaret north, doors west AND east, open mouth south.
    const _crossCols = [_crossCol(mA - 1, -1), _crossCol(mB + 1, +1)];
    if (_crossCols.some(c => c === null)) return false;   // neither position works → the crossing is not where we think [REF#DG-00375]
    for (const cdx of _crossCols) for (const cdy of [RY1 - 1, RY1]) {
      T[cdx][cdy] = DOOR; doorList.push([cdx, cdy]);
      crossDoors.add(cdx + ',' + cdy);
      _fixedPanelDoors.add(cdx + ',' + cdy);   // "place a door for the west and the east" — not a 1-in-10 archway [REF#DG-00376]
      // Tagged so the ENGINE can give these the cabaret's carved Door-1.png leaf (Mark 2026-08-05: [REF#DG-00377]
      // "make same as caberet doors"). A tile flag, exactly like `counterWall` — the alternative is the
      // engine re-deriving which doorways are "the crossing ones" from geometry, which is how a prop
      // desyncs from the map that moved under it.
      _crossDoorTiles.add(cdx + ',' + cdy);
    }


    // ── SECTIONS 1-4: FOUR LITTLE NETHACK MAPS ON A WANDERING 2-TILE TRUNK ───────────────────────── [REF#DG-00378]
    //    (Mark 2026-08-04, verbatim: "just do little nethack maps for each section -- 6-8 rooms in each
    //    section with a 2-tile hallway connecting each rooms randomly, sometimes the 2-tile hallway will
    //    be L-Shaped to connect to another section. Its dynamic but the patterns should link up with
    //    interlocking pieces to connect jigsaw puzzles ... + little 1-tile hallways".)
    //
    //    WHY THE PREVIOUS GRAMMAR HAD TO GO, in one number. It was a straight central spine with ONE RANK
    //    of rooms on each flank, so a section's capacity was its flank LENGTH, not its area. Measured:
    //    6-7 / 6 / 4-5 / 4-5 rooms. Sections 3 and 4 share the east strip and could not reach 6 however
    //    the boxes were cut — the ceiling was the shape, and no amount of tuning moves a ceiling.
    //
    //    THE NEW SHAPE, which is what NetHack's mklev has always done and what this dungeon is a memorial
    //    to: lattice the section's box into cells, drop ONE jittered room per cell, then join them with
    //    corridors. Rooms sit in TWO dimensions around the trunk instead of in a line beside it, so the
    //    capacity is the box's AREA and 6-8 stops being a fight.
    //
    //      1. THE TRUNK is the 2-tile hallway, and it WANDERS: it leaves the ring crossing, runs a few
    //         tiles, then turns — 2 to 4 legs, lengths and turn directions rolled per seed. That is the
    //         "sometimes L-shaped" and it is what makes each section a different place every game while
    //         the framework (which side, which crossing) stays fixed.
    //      2. THE ROOMS come from the cell lattice, one per cell, jittered inside it. A room can never
    //         collide with the trunk because the trunk is carved FIRST and clearArea refuses it.
    //      3. THE SPURS are the little 1-tile hallways: each room opens at ONE wall midpoint and runs a
    //         straight line to the trunk. A room that cannot reach is DROPPED rather than left stranded —
    //         an orphan room is the one map defect a player reads as "it's broken".
    //
    //    INTERLOCKING: the trunk always starts AT the ring crossing, 2 tiles wide, matching the ring's
    //    own 2-tile band — the jigsaw tab. Nothing else in the section touches the heart, so a section
    //    can be re-rolled freely without the join ever moving.
    const _gyEW = (RY0 + RY1) >> 1;       // the ring's mid row  — where west and east leave [REF#DG-00379]
    const _gxN  = (RX0 + RX1) >> 1;       // the ring's mid col  — where north leaves [REF#DG-00380]
    //    THE FOUR BOXES, disjoint by construction and clear of the heart (ring cols 25..40 rows 22..40, [REF#DG-00381]
    //    the SE arm cols 41..46 rows 39..40, the entrance corridor and the guard post):
    //        1 WEST   cols  1..23  rows 22..64      3 EAST   cols 42..64  rows  5..37
    //        2 NORTH  cols  1..40  rows  1..20      4 SE     cols 42..64  rows 41..64
    const ZN = [
      { s: 1, box: { x0: 1,  y0: 22, x1: 23, y1: 64 }, gx: RX0 - 1, gy: _gyEW, dx: -1, dy: 0 },
      { s: 2, box: { x0: 1,  y0: 1,  x1: 40, y1: 20 }, gx: _gxN,    gy: RY0 - 1, dx: 0, dy: -1 },
      { s: 3, box: { x0: 42, y0: 5,  x1: 64, y1: 37 }, gx: RX1 + 1, gy: _gyEW, dx: 1,  dy: 0 },
      // ⚠ s4's box STARTS ON THE ARM'S ROWS (39), not below them. Its crossing is the arm's east end, so [REF#DG-00382]
      //    the trunk head is laid at rows 39-40 — with y0 at 41 the very first tile was out of bounds and
      //    the section failed 2000/2000 retries before a single room was tried. The arm's own tiles are
      //    still safe: `_put` refuses anything that is not virgin rock.
      { s: 4, box: { x0: 42, y0: 39, x1: 64, y1: 64 }, gx: armX1 + 1, gy: armY0, dx: 1, dy: 0 },
    ];

    const dung = [];
    const sectionHall = new Set();   // every section-hall tile — exempt from the no-3-way-junction rule [REF#DG-00383]
    const _sectionEntry = new Map(); // Z.s -> [{ room, side }] — every room that spurs onto the spine (§4a) [REF#DG-00384]
    const _rnd = (n) => (_rand() * n) | 0;

    for (const Z of ZN) {
      const B = Z.box;
      Z.rooms = []; Z.hallTiles = [];

      // ── UNDER hallway+cabaret+guard NO SECTION EXISTS AT ALL (Mark 2026-08-24) ────────────────── [REF#DG-00385]
      //    The first cut of this trim only gated the ROOM placement (`_place`), so every section still
      //    carved its crossing (a 2-tile SECTION GATE door), its whole wandering trunk and its teeth —
      //    measured live: 8 gate-door tiles and the bulk of 304 corridor tiles serving zero rooms.
      //    This skip must sit HERE, before the crossing carve: with the ring trimmed, the crossing's
      //    own ring-side check (`!== CORR`, ~15 lines down) would reject every floor on every retry.
      //    Z.rooms/Z.hallTiles stay [] so every downstream reader iterates empty instead of throwing.
      if (_headOnly) { Z.entry = null; Z.entryTiles = []; continue; }

      // ── 1. THE CROSSING, 2 TILES WIDE, matching the ring band it leaves from ──────────────────── [REF#DG-00386]
      const _cross = [];
      for (let w = 0; w < 2; w++) {
        const cgx = Z.gx + (Z.dy !== 0 ? w : 0), cgy = Z.gy + (Z.dx !== 0 ? w : 0);
        if (!(T[cgx] && T[cgx][cgy] === ROCK)) return false;
        if (T[cgx - Z.dx] === undefined || T[cgx - Z.dx][cgy - Z.dy] !== CORR) return false;   // ring side [REF#DG-00387]
        _cross.push([cgx, cgy]);
      }

      // ── 2. THE TRUNK — a wandering 2-wide corridor, carved BEFORE any room ────────────────────── [REF#DG-00388]
      //    Carved as a 2x2 head walked along each leg, so corners come out square and the corridor is
      //    2 wide on BOTH axes without a special case for the turn. `_put` refuses anything that is not
      //    virgin rock, which is what keeps the trunk out of the heart, the arm and the neighbouring
      //    section — the boxes make collisions unlikely, this makes them impossible.
      const _trunkTiles = [];
      const _put = (a, b) => {
        if (a < B.x0 || b < B.y0 || a > B.x1 || b > B.y1) return false;
        if (a < 1 || b < 1 || a >= GW - 1 || b >= GH - 1) return false;
        if (T[a][b] === CORR && sectionHall.has(a + ',' + b)) return true;   // our own trunk, re-crossed [REF#DG-00389]
        if (T[a][b] !== ROCK) return false;
        T[a][b] = CORR; sectionHall.add(a + ',' + b); _trunkTiles.push([a, b]);
        _spineSegmentOf.set(a + ',' + b, Z.s);
        return true;
      };
      const _head = (x, y) => _put(x, y) && _put(x + 1, y) && _put(x, y + 1) && _put(x + 1, y + 1);
      // Start the head just inside the box, aligned with the crossing so the two meet flush. [REF#DG-00390]
      let hx = (Z.dx !== 0) ? (Z.dx > 0 ? Z.gx + 1 : Z.gx - 2) : Z.gx;
      let hy = (Z.dy !== 0) ? (Z.dy > 0 ? Z.gy + 1 : Z.gy - 2) : Z.gy;
      // ── ONE STRAIGHT LEG — "A MAJOR 2 TILE HALLWAY", Mark 2026-08-05 ─────────────────────────────── [REF#DG-00391]
      //    "hallways are too long - takes too long to travel to just see a few rooms, i told you to make
      //     there a major 2 tile hallway and the rooms connect off of it in each section rather than
      //     those spaghetti maze hallways that serve no purpose, no one would construct a dungeon for
      //     that reason. use logic when creating rooms."
      //    The trunk used to WANDER: 3-5 legs alternating axis, lengths rolled per seed. That wander was
      //    never decorative — it existed because the only way a room could reach the hallway was an
      //    8-tile BFS spur (`_route`, below), so the trunk had to pass within 8 tiles of every room or
      //    the room was UNCARVED. Density of trunk was buying reachability. The MST join at §4 buys
      //    reachability from the ROOMS instead (a room chains off its nearest neighbour, not off the
      //    hallway), which is what frees the trunk to be the single straight run Mark asked for.
      //    ⚠ THIS CHANGES EVERY SEED'S MAP. The old plan drew `_rnd()` several times per section (leg
      //    count, each length, each turn); this draws NONE. Seeds keep working, but a seed number no
      //    longer names the same floor it did before this commit — do not compare screenshots across it.
      //    Knob: global._spineFrac — how much of its own reach the spine consumes.
      const _legs = [];
      {
        const d = [Z.dx, Z.dy];
        const _reach = () => {   // how far the head can travel on d before it leaves the box [REF#DG-00392]
          const lim = d[0] > 0 ? B.x1 - 1 - hx : d[0] < 0 ? hx - B.x0 : d[1] > 0 ? B.y1 - 1 - hy : hy - B.y0;
          return Math.max(0, lim);
        };
        // Straight in off the ring (the jigsaw tab), so the crossing and the spine meet flush without a [REF#DG-00393]
        // turn. Fraction rather than a constant: the four section boxes are different sizes and a fixed
        // length either falls short in section 1 or eats section 2 whole.
        // ── IT CROSSES THE WHOLE BOX, AND THAT IS MEASURED, NOT STYLISTIC ──────────────────────────
        //    A spine that stops short leaves rooms at the far end with nothing to reach: they are not
        //    walled in, they are simply beyond the hallway, and `joinPath` cannot cross the spine to
        //    bring them in from the other side. Swept over 10 seeds at the shipped retry budget:
        //      frac 0.7 -> 6-9 of 10 floors generate      frac 1.0 -> 10 of 10, every room target
        //    Shortening it is a knob, not a default.
        const _frac = (typeof global._spineFrac === 'number') ? global._spineFrac : 1;
        const reach = _reach();
        const len = Math.min(reach, Math.round(reach * _frac));
        if (len >= 3) _legs.push([d[0], d[1], len]);
      }
      // walk the plan, carving as we go [REF#DG-00394]
      hx = (Z.dx !== 0) ? (Z.dx > 0 ? Z.gx + 1 : Z.gx - 2) : Z.gx;
      hy = (Z.dy !== 0) ? (Z.dy > 0 ? Z.gy + 1 : Z.gy - 2) : Z.gy;
      if (!_head(hx, hy)) return false;
      for (const [dx, dy, len] of _legs) {
        for (let i = 0; i < len; i++) { hx += dx; hy += dy; if (!_head(hx, hy)) break; }
      }
      // A trunk this short is not a hallway. Was 16 when the trunk wandered over 3-5 legs; a single [REF#DG-00395]
      // straight leg of the minimum 3 carves 2x4 = 8, so 16 would reject every small box outright.
      if (_trunkTiles.length < 8) return false;

      // open the crossing itself now that the trunk exists to receive it [REF#DG-00396]
      // ── THE CROSSING IS A SOLID 2-TILE GATE DOOR, NOT OPEN CORRIDOR ────────────────────────────
      //    Mark 2026-08-04: "each section should be closed off by a solid 2-tile door, it closes behind
      //    player … we should not actively render every section at all times - the FPS would crumble,
      //    you understand we are doing this for segmentation rather than UX."
      //    THIS IS THE PREREQUISITE FOR TURNING THE STREAMER BACK ON, not a decoration. The section
      //    seals were removed 08-04 and segment staging is GATE-DRIVEN, so with no gates a dormant
      //    segment has nothing to stage it and waits forever — which is the only reason
      //    `_showAllSections` had to be defaulted ON, and why floor 1 currently builds all 39 far-section
      //    monsters and ticks their AI for enemies the want-model already refuses to draw. Gates first,
      //    then the streamer; the reverse order ships a floor whose sections are permanent void.
      //    The crossing was ALREADY 2 tiles wide (matching the ring band it leaves from), so this only
      //    changes CORR -> DOOR and registers the pair. _segmentGateTiles is what the emit reads to tag
      //    the tile `sectionGate: true` with sectionFrom/sectionTo (~:2905), which is the engine's
      //    staging trigger (it reads them into window._sectionGates, ~:3484). sectionFrom 0 = the
      //    head/ring, sectionTo Z.s = this section.
      //    IT MUST BE _sectionGateTiles, NOT _segmentGateTiles, AND THAT IS NOT A NAMING DETAIL. The
      //    segment map is validated as a LINEAR CHAIN — `segmentTo === segmentFrom + 1` (~:3469) — which
      //    is the progression model for concentric rings. Four sections all hanging off the head is a
      //    PINWHEEL: 0->1, 0->2, 0->3, 0->4. Registering them as segment gates threw "malformed segment
      //    gate 2" on 17/25 seeds. That validator is not a bug, it is the model; the pinwheel simply
      //    belongs in the section map, which is what the ring generator already uses it for (~:1079).
      //    Kept in sectionHall on purpose: that set exempts CORR tiles from the >=3-neighbour junction
      //    rule, and §3b's teeth join it for the same reason. A DOOR tile is skipped by the junction
      //    rule anyway, but dropping it from sectionHall would silently change what counts as hall.
      //    (It also used to back `_isTrunk` for the spur router — that router is gone, 2026-08-05 §3.)
      //    ZERO _rnd() DRAWS — the emit gives gate doors a FIXED panel, so the panelless stream is
      //    unperturbed and the rest of the map stays byte-identical to the no-gate generator.
      for (const [cgx, cgy] of _cross) {
        T[cgx][cgy] = DOOR; doorList.push([cgx, cgy]);
        sectionHall.add(cgx + ',' + cgy); Z.hallTiles.push([cgx, cgy]);
        _spineSegmentOf.set(cgx + ',' + cgy, Z.s);
        _sectionGateTiles.set(cgx + ',' + cgy, { gateIndex: Z.s, sectionFrom: 0, sectionTo: Z.s });
      }
      const _preBranch = _trunkTiles.length;   // branch teeth are appended below; only the new ones re-push [REF#DG-00397]
      for (const t of _trunkTiles) Z.hallTiles.push(t);

      // ── 3. THE COMB — HALLS FIRST, THEN EVERY ROOM HANGS OFF ONE ──────────────────────────────── [REF#DG-00398]
      //    Mark 2026-08-05, looking at a top-down of section 2: "what floor plan in the world has this
      //    structure? none. it just needs to be basic ... a small entrance and every room has its own
      //    connection to the main hallway." Then: "these are small workers rooms — 1 bed each room
      //    unless its the special room."
      //
      //    WHAT WAS HERE, AND WHY IT DREW TRAIN CARS. Rooms came from a cell LATTICE tiling the whole
      //    section box plus a random dart pass into the leftovers — placement that never once looked at
      //    where the hallway was. Only rooms within 3 tiles of the trunk got a door onto it (old §4a);
      //    every other room was joined to its NEAREST NEIGHBOUR by an MST (old §4b, up to 8 tiles a
      //    link). So the map grew chains: room→room→room→room→hall. MEASURED over 12 seeds / 310 rooms
      //    before this commit: only 64.8% of rooms opened onto a hallway, 35.2% sat behind 1-6 other
      //    rooms, the worst 7 deep. Seed 1234 section 2 is the picture — four 5x5s in series off one
      //    spur, which is what Mark's screenshot caught.
      //    The MST was not a mistake in isolation; it was the crutch that let the trunk be STRAIGHT
      //    (see the note in §2). Straightening the hall without re-cutting the packer is what left the
      //    rooms with nothing to hold onto. This replaces the packer instead of restoring the wander.
      //
      //    THE SHAPE IS A COMB, and it is what _buildLHalls has drawn on floors 2+ all along (placeAlong,
      //    ~:685 — measured 92.5% direct, nothing deeper than 2). The trunk is the comb's spine; BRANCH
      //    halls are its teeth, carved BEFORE any room so a room can only ever attach to something that
      //    already exists. Every room then hangs off a hall by construction — there is no router, no
      //    MST, and no way to be born stranded. Depth is 1 for every room, always.
      //
      //    WHY BRANCHES AT ALL. One straight trunk serves exactly one rank of cells on each flank
      //    (7 tiles of depth: stub 1 + room 5 + clearArea's margin 1). Section 3's box runs 26 rows
      //    north of its trunk and section 1's runs 20 — a single rank leaves most of that unreachable,
      //    which is the hole the lattice was invented to fill and the MST was invented to connect. A
      //    2-wide tooth pushed into the deep side carries two more ranks, at depth 1, for free.
      //
      //    WORKER CELLS ARE UNIFORM 5x5 ON PURPOSE. 3x3 interior = one bed, which is what Mark says
      //    these rooms are. Uniform also packs a flank tighter than the old 5..7 jitter, and it is what
      //    makes a barracks read as a barracks instead of as scattered caves. Knob: _workerCell.
      //    ⚠ NO BED PROP EXISTS YET — the engine has no bed/futon entity (grepped 2026-08-05), so
      //      "1 bed each" is currently true of the ARCHITECTURE only. Furnishing is separate work and is
      //      deliberately NOT faked here.
      //
      //    ⚠ THIS CHANGES EVERY FLOOR-1 SEED. The draw sequence is entirely different from the lattice's;
      //      a seed number no longer names the floor it named before this commit.
      const RANK = 7;                        // depth one rank of cells consumes: stub 1 + room 5 + margin 1 [REF#DG-00399]
      const CELL = (typeof global._workerCell === 'number') ? global._workerCell : 5;
      //    4-6 ROOMS PER SECTION, NOT 6-8 (Mark 2026-08-12: "4-6 rooms per section"). Measured before [REF#DG-00400]
      //    the change, live floor 1: sections ran 8/6/6/5 — the top of the old 6+_rnd(3) band. Fewer,
      //    larger, more varied rooms is the trade Mark asked for; the cells list below is the other half.
      const want = ((typeof global._sectionRoomWant === 'number') ? global._sectionRoomWant : 4) + _rnd(3);
      const SPECIAL_BUILDING = _specialBuildingTable();   // one table, in Creator.js [REF#DG-01285 → see REF#DG-01284]
      //    Squarest-first so a section with room gets a room-shaped building and only a cramped one [REF#DG-00401]
      //    falls back to a hall. Declared HERE, above `_place`, because `_place` identifies the special
      //    by reference — a `const` below its only reader is a TDZ trap waiting for the next edit.
      const SPECIAL_CELLS = [[8, 9], [9, 8], [7, 10], [10, 7], [12, 6], [6, 12], [14, 5], [5, 14]];

      // ── 3a. THE TRUNK, EXPRESSED AS A RUN ─────────────────────────────────────────────────────── [REF#DG-00402]
      //    A run is {axis, rows|cols (the hall's two lines), from, to (its extent along the axis)} —
      //    the same shape placeAlong takes, so the attach contract below is the spine contract verbatim.
      const _runs = [];
      {
        let tx0 = Infinity, tx1 = -Infinity, ty0 = Infinity, ty1 = -Infinity;
        for (const [a, b] of _trunkTiles) { if (a < tx0) tx0 = a; if (a > tx1) tx1 = a; if (b < ty0) ty0 = b; if (b > ty1) ty1 = b; }
        _runs.push(Z.dx !== 0 ? { axis: 'h', rows: [ty0, ty1], from: tx0, to: tx1 }
                              : { axis: 'v', cols: [tx0, tx1], from: ty0, to: ty1 });
      }

      // ── 3b. THE TEETH — 2-WIDE BRANCH HALLS INTO THE DEEP SIDE ────────────────────────────────── [REF#DG-00403]
      //    Carved with §2's own `_put`, so a tooth inherits every guarantee the trunk has: it stays
      //    inside this section's box, it refuses anything that is not virgin rock (it can never eat the
      //    heart, the arm or a neighbouring section), and its tiles land in `sectionHall` — which is what
      //    exempts them from the no-3-way-junction gate. A hall with a door per room IS a junction at
      //    every door. A tooth is only cut where the box is deeper than the one rank the trunk already
      //    serves, and its RANKABLE span starts RANK+1 out so its rooms never fight the trunk's flank.
      {
        const tr = _runs[0];
        const alongLen = tr.to - tr.from + 1;
        for (const side of [true, false]) {
          const edge = tr.axis === 'h' ? (side ? tr.rows[0] : tr.rows[1]) : (side ? tr.cols[0] : tr.cols[1]);
          const wall = tr.axis === 'h' ? (side ? B.y0 : B.y1) : (side ? B.x0 : B.x1);
          const dir = side ? -1 : 1;
          const depth = Math.abs(wall - edge);
          if (depth < RANK + 9) continue;                    // one rank already serves this side — no tooth [REF#DG-00404]
          //    A TOOTH MUST OUTRUN THE TRUNK'S OWN FLANK BY TWO CELLS, NOT ONE. Its rankable span only [REF#DG-00405]
          //    begins RANK+1 tiles out — the first 7 belong to the trunk's flank — so the cap is what
          //    decides how many cells the tooth can actually carry, and 18 left it carrying ONE per side.
          //    Measured at 18: sections 3 and 4 finished with 4 and 3 rooms against a target of 6-8, and
          //    the floor re-rolled forever on `_minRooms`. 24 lets a 26-deep box (section 3 north) rank
          //    17 tiles of tooth = two cells a side. Still bounded: `depth - 2` keeps the box margin.
          const Lb = Math.min(depth - 2, 24);
          const nb = Math.min(2, Math.floor(alongLen / 16));
          for (let i = 0; i < nb; i++) {
            const c = tr.from + Math.round((i + 1) * alongLen / (nb + 1)) - 1;   // 2 wide: c .. c+1 [REF#DG-00406]
            let cut = 0;
            for (let k = 1; k <= Lb; k++) {
              const ok = tr.axis === 'h' ? (_put(c, edge + dir * k) && _put(c + 1, edge + dir * k))
                                         : (_put(edge + dir * k, c) && _put(edge + dir * k, c + 1));
              if (!ok) break;
              cut = k;
            }
            if (cut < RANK + 4) continue;                    // too stunted to carry a rank — leave it a spur [REF#DG-00407]
            const near = edge + dir * (RANK + 1), far = edge + dir * cut;
            const tooth = { c, edge, dir, cut };                     // kept so §4d can trim the tail back [REF#DG-00408]
            _runs.push(tr.axis === 'h'
              ? { axis: 'v', cols: [c, c + 1], from: Math.min(near, far), to: Math.max(near, far), tooth }
              : { axis: 'h', rows: [c, c + 1], from: Math.min(near, far), to: Math.max(near, far), tooth });
          }
        }
      }
      for (let i = _preBranch; i < _trunkTiles.length; i++) Z.hallTiles.push(_trunkTiles[i]);

      // ── 4. RANK THE ROOMS ALONG THE HALLS — THE SPINE ATTACH CONTRACT, NOTHING ELSE ───────────── [REF#DG-00409]
      //    March along a run, both sides, and set a room against the hall with ONE threshold tile and a
      //    single shoji at the room's own wall midpoint. That is placeAlong's contract (its recess roll
      //    pinned to 0 per Mark 2026-08-01: "MOST WORKERS ROOMS ARE ATTACHED DIRECTLY TO THE MAINHALL,
      //    NO SUBHALLWAYS OF 2+ TILES"), and it satisfies Mark's door-width law by construction: a lone
      //    shoji opening onto exactly one corridor tile.
      //    ⚠ THE STUB MAY NOT RUN BESIDE ANOTHER STUB. Two 1-tile corridors side by side measure as a
      //      2-wide hallway at the door, and the door-width gate then rejects the WHOLE FLOOR far from
      //      the cause. placeAlong gets away without this test because floor-2 legs are sparse; a section
      //      flank is dense enough that it bites. Tested here against the LIVE grid, so an earlier room's
      //      stub blocks a later one and the order they were placed in cannot matter.
      const _place = (run, side, cells, limit) => {
        let n = 0;
        const horiz = run.axis === 'h';
        const hr = horiz ? (side ? run.rows[0] : run.rows[1]) : (side ? run.cols[0] : run.cols[1]);
        const dir = side ? -1 : 1;
        const px = horiz ? 1 : 0, py = horiz ? 0 : 1;        // perpendicular to the stub's outward step [REF#DG-00410]
        let p = run.from + 1 + _rnd(2);
        while (p <= run.to - 4 && Z.rooms.length < want && n < limit) {
          let put = null;
          //    RNG PICKS THE SHAPE, FIRST-FIT PICKS THE FALLBACK (Mark 2026-08-12 "rng system"). A plain [REF#DG-00411]
          //    in-order walk of the cells list hands every room the FIRST entry that fits, which is why a
          //    varied list alone would still have stamped one shape everywhere. Rotating the start point
          //    by a seeded _rnd gives each room a different first choice while still walking the WHOLE
          //    list, so a cramped rank falls back through the smaller shapes instead of losing the room.
          //    Seeded, so a seed still reproduces its floor exactly.
          //    SPECIAL_CELLS is EXEMPT and must stay in order — it is squarest-first on purpose so a
          //    section with space gets a room-shaped building and only a cramped one falls back to a
          //    hall (see its declaration). Compared by reference, the same way `special` is detected.
          const _nc = cells.length;
          const _off = (cells !== SPECIAL_CELLS && _nc > 1) ? _rnd(_nc) : 0;
          for (let _ci = 0; _ci < _nc; _ci++) {
            const [w, h] = cells[(_ci + _off) % _nc];
            const span = horiz ? w : h;
            if (p + span - 1 > run.to) continue;
            const ax = horiz ? p + (w >> 1) : hr;                                   // hall attach tile [REF#DG-00412]
            const ay = horiz ? hr : p + (h >> 1);
            const sx = horiz ? ax : ax + dir, sy = horiz ? ay + dir : ay;           // the single threshold tile [REF#DG-00413]
            const dX = horiz ? ax : ax + 2 * dir, dY = horiz ? ay + 2 * dir : ay;   // door, on the room's wall ring [REF#DG-00414]
            const rx = horiz ? ax - (w >> 1) : (side ? dX - w + 1 : dX);
            const ry = horiz ? (side ? dY - h + 1 : dY) : ay - (h >> 1);
            if (rx < B.x0 || ry < B.y0 || rx + w - 1 > B.x1 || ry + h - 1 > B.y1) continue;
            if (rx < 1 || ry < 1 || rx + w >= GW - 1 || ry + h >= GH - 1) continue;
            if (!(T[ax] && T[ax][ay] === CORR)) continue;                      // must leave a real hall [REF#DG-00415]
            if (!(T[sx] && T[sx][sy] === ROCK)) continue;
            if ((T[sx + px] && T[sx + px][sy + py]) === CORR) continue;        // never beside another stub [REF#DG-00416]
            if ((T[sx - px] && T[sx - px][sy - py]) === CORR) continue;
            if (!clearAreaShared(rx, ry, w, h)) continue;
            put = { w, h, rx, ry, sx, sy, dX, dY, span, ax, ay };
            break;
          }
          if (!put) { p += 1; continue; }
          const special = (cells === SPECIAL_CELLS);
          const r = carve(put.rx, put.ry, put.w, put.h, special ? (SPECIAL_BUILDING[Z.s] || 'room') : 'room');
          r.sectionIndex = Z.s; r.segmentId = Z.s;
          if (special) r.isSpecialRoom = true;
          r._attachKey = put.ax + ',' + put.ay;
          T[put.dX][put.dY] = DOOR; doorList.push([put.dX, put.dY]);
          T[put.sx][put.sy] = CORR; _spineSegmentOf.set(put.sx + ',' + put.sy, Z.s);
          Z.rooms.push(r); dung.push(r); n++;
          //    NO JITTER BETWEEN CELLS, AND THAT IS THE POINT. A barracks corridor is supposed to read [REF#DG-00417]
          //    as regular — the old 5..7 jitter is what made a flank look like scattered caves. Tight
          //    stepping also packs measurably better: over 40 seeds, section 2 went 6.9 -> 7.2 rooms
          //    and section 3 went 5.8 -> 6.0 purely from dropping the wasted 0-1 tile.
          //    ── SHARED WALLS (Mark 2026-08-17) ──────────────────────────────────────────────────────
          //    span - 1 lands the NEXT room's wall course ON this room's far wall, so neighbours down a
          //    rank share ONE wall tile instead of wall|rock|wall. `rx` is `p` on a horizontal run and
          //    `ry` is `p` on a vertical one (the >>1 terms cancel), so the step maps straight onto the
          //    footprint and no other arithmetic here moves. carve() rewrites the shared course WALL
          //    over WALL, which is idempotent (:85); clearAreaShared is what permits the overlap.
          //    That single tile is also what makes _mergeSharedWalls fire: a wall tile sandwiched
          //    between two walkable tiles becomes ONE pane centred on the tile line, which is Mark's
          //    "one wall pane separates a room from another."
          //    span + 1 (the pre-08-17 step) is restored automatically by window._sharedWalls = false.
          p += (((typeof window !== "undefined" && window && window._sharedWalls === true)) ? put.span - 1 : put.span + 1);
        }
        return n;
      };

      // ── 4a. THE SPECIAL GOES DOWN FIRST, AND IT GOES ON THE TRUNK ─────────────────────────────── [REF#DG-00418]
      //    It is ~70 tiles, twice a worker cell, so packed last it never finds room — that lesson from
      //    the lattice era still holds and is kept. What changes is that it now obeys the same attach
      //    contract as everything else instead of being scanned into open space and merely hoped to be
      //    routable. Section 2's special was CARVED 40/40 under the old area scan and then DROPPED 24/40
      //    because the router could not reach the box's NW corner; born on the trunk, it cannot drop.
      if (!(global._sectionSpecials === false)) {
        if (!_headRoomsOnly()) for (const side of [true, false]) if (_place(_runs[0], side, SPECIAL_CELLS, 1)) break;   // section specials — off under hallway+cabaret+guard [REF#DG-00419]
      }

      // ── 4b. WORKER CELLS ALONG EVERY RUN — the trunk first, because it is the main hall ───────── [REF#DG-00420]
      //    ── ROOMS OF VARIOUS SIZES (Mark 2026-08-12: "look at the map design its not good. redo it
      //       all. a new map generator that makes better rooms of various sizes. 4-6 rooms per section.
      //       rng system") ──────────────────────────────────────────────────────────────────────────
      //       MEASURED CAUSE, not a guess: on the live floor 23 of 30 rooms were the IDENTICAL 5x5, and
      //       the only 7 exceptions were the special rooms. This one line was why — a single-entry cell
      //       list means `_place` has exactly one shape to try, so no amount of RNG upstream could ever
      //       produce variety. The "no RNG" Mark is seeing is not a missing RNG; it is an empty menu.
      //       This DELIBERATELY REVERSES the uniform-5x5 decision documented at the top of this block
      //       ("WORKER CELLS ARE UNIFORM 5x5 ON PURPOSE ... a barracks reads as a barracks"). That
      //       reasoning is sound and is why it is quoted here rather than deleted — but Mark has now
      //       looked at the result and called it bad, and his read of the floor outranks it.
      //       Sizes span CELL..CELL+3 (5..8) in mixed aspect ratios, so a flank alternates squarish and
      //       oblong rooms instead of stamping one tile. 5x5 stays FIRST in the list and is therefore
      //       the guaranteed fallback: `_place` walks the whole list and takes the first that fits, so a
      //       cramped rank still packs the old way rather than dropping the room.
      //       Restore the uniform barracks: global._workerVaryCells = false.
      const WORKER_CELLS = (global._workerVaryCells === false) ? [[CELL, CELL]] : [
        [CELL,     CELL    ], [CELL + 1, CELL    ], [CELL,     CELL + 1], [CELL + 2, CELL    ],
        [CELL,     CELL + 2], [CELL + 1, CELL + 1], [CELL + 2, CELL + 1], [CELL + 1, CELL + 2],
        [CELL + 3, CELL + 1], [CELL + 1, CELL + 3],
      ];
      if (!_headRoomsOnly()) for (const run of _runs) for (const side of [true, false]) _place(run, side, WORKER_CELLS, 99);   // section rooms — off under hallway+cabaret+guard [REF#DG-00421]

      // ── 4c. TRIM EACH TOOTH BACK TO THE LAST CELL IT SERVES ───────────────────────────────────── [REF#DG-00422]
      //    A tooth is cut to the depth the BOX allows, before we know how many cells will actually
      //    take it. Whatever the packer did not use is a corridor to nowhere — seed 1234 shipped a
      //    15-tile dead-end in section 1 — and a dead-end hallway is the same "no building does this"
      //    complaint that started this rewrite, just in corridor form. So walk each tooth back from its
      //    far end and un-carve every rung that no threshold tile leans on, stopping at the first that
      //    one does. A tooth nothing took returns to rock entirely; the trunk is never touched.
      //    Bookkeeping matters as much as the tiles: a trimmed rung has to leave `sectionHall` too, or
      //    it keeps its junction exemption and stays in `mhTiles` as a main-hall tile that is now rock.
      for (const run of _runs) {
        const t = run.tooth; if (!t) continue;
        for (let k = t.cut; k >= 1; k--) {
          const q = t.edge + t.dir * k;
          const vert = run.axis === 'v';
          const serves = vert ? ((T[t.c - 1] && T[t.c - 1][q]) === CORR || (T[t.c + 2] && T[t.c + 2][q]) === CORR)
                              : ((T[q] && T[q][t.c - 1]) === CORR || (T[q] && T[q][t.c + 2]) === CORR);
          if (serves) break;
          for (const [qx, qy] of (vert ? [[t.c, q], [t.c + 1, q]] : [[q, t.c], [q, t.c + 1]])) {
            T[qx][qy] = ROCK; sectionHall.delete(qx + ',' + qy); _spineSegmentOf.delete(qx + ',' + qy);
          }
        }
      }
      Z.hallTiles = Z.hallTiles.filter(([x, y]) => sectionHall.has(x + ',' + y));   // trimmed rungs are not main hall [REF#DG-00423]

      // ── 4d. THE ENTRY ROOM — nearest the section gate, which is now simply a distance ──────────── [REF#DG-00424]
      //    The old §4a handed this out as "the room holding the shortest spur onto the spine". There
      //    are no spurs any more and every room is one hall from the gate, so the honest answer is the
      //    room whose centre is nearest the crossing. `_sectionEntry` is kept in the same shape the
      //    tail below reads (`.get(Z.s)[0].room`) rather than re-cut at both ends.
      // ── AN EMPTY SECTION IS THE POINT, NOT A FAILURE, UNDER hallway+cabaret+guard ────────────────
      //    These two gates exist to stop the packer SHIPPING A VOID it meant to fill. When the packer
      //    is deliberately switched off (Mark 2026-08-24, three rooms only) every section is empty on
      //    purpose, both gates fire on every retry, and `_buildSection0` never returns a floor — the
      //    2000-try loop then throws "generation failed after retries" and the engine never boots.
      //    MEASURED: an instrumented copy pinned the re-roll to the `!_e` line here, not to any of the
      //    structural gates below — which is why they are left completely untouched. The corridor ring,
      //    the junction rule and the open-mouth rule still police the three rooms that DO ship.
      const _headOnly3 = _headRoomsOnly();
      {
        let _e = null, _eD = Infinity;
        for (const r of Z.rooms) { const d = Math.abs(r.cx - Z.gx) + Math.abs(r.cy - Z.gy); if (d < _eD) { _eD = d; _e = r; } }
        if (!_e && !_headOnly3) return false;       // no room in this section — re-roll rather than ship a void [REF#DG-00425]
        if (_e) _sectionEntry.set(Z.s, [{ room: _e, side: null }]);
      }
      // 4 is the floor a section may ship with; 6-8 is the target and the packer aims there. Under 4 the [REF#DG-00426]
      // whole floor re-rolls — enforced by retry, not by hope.
      const _minRooms = (typeof global._sectionMinRooms === 'number') ? global._sectionMinRooms : 4;
      if (Z.rooms.length < _minRooms && !_headOnly3) return false;
      // Z.entry is a room that actually holds a spur onto the spine, not rooms[0] — the shortest spur of [REF#DG-00427]
      // the lot, so it is the room nearest the section gate. It may have been uncarved only if it was
      // never in the tree, and every root is in the tree by construction.
      const _se = _sectionEntry.get(Z.s);          // absent only when this section is deliberately empty [REF#DG-00428]
      Z.entry = (_se && _se[0]) ? _se[0].room : null; Z.entryTiles = Z.hallTiles;
    }


    // ── STRUCTURAL GATES, over the FINISHED grid (see the note where they used to run). The hallway is [REF#DG-00429]
    //    exempt from the junction rule exactly as the vestibule/trunk is in the other generators: a
    //    2-wide loop is all junctions by definition.
    // ⚠ THE OPEN MOUTH IS THE ONE PLACE A CORRIDOR MAY TOUCH ROOM FLOOR. Everywhere else that pattern
    //    means a room was breached without a door, which is why this gate exists at all. Here it is the
    //    feature: the entrance corridor meets the crossing with no leaf between them (Mark's order
    //    above). Scoped to the two carved mouth tiles by name — never relaxed to "floor next to the
    //    band", which would stop this catching a real breach.
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (T[x][y] !== CORR) continue;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + d[0], ny = y + d[1];
        if (T[nx] && T[nx][ny] === FLOOR && !openMouth.has(nx + ',' + ny)) return false;
      }
    }
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (T[x][y] !== CORR || ringSet.has(x + ',' + y) || wingHall.has(x + ',' + y) || sectionHall.has(x + ',' + y)) continue;   // a main hall with a door per room IS a junction at every door [REF#DG-00430]
      let n = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = T[x + d[0]] && T[x + d[0]][y + d[1]]; if (t === CORR || t === DOOR) n++; }
      if (n >= 3) return false;
    }
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (T[x][y] !== DOOR) continue;
      if (x >= WX0 && x <= WX1 && y >= WY0 && y <= WY1) continue;   // the head's own doors answer to _carveHead [REF#DG-00431]
      if (_sectionGateTiles.has(x + ',' + y)) continue;             // a gate bridges ring↔spur: two CORR by design [REF#DG-00432]
      if (crossDoors.has(x + ',' + y)) continue;                    // the 4-way crossing's east/west leaves — see their carve [REF#DG-00433]
      let c = 0; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T[x + d[0]] && T[x + d[0]][y + d[1]] === CORR) c++;
      if (c !== 1) return false;
    }
    if (doorRuleViolations() > 0) return false;

    // ── MARK'S DOOR-WIDTH LAW, MANDATORY (2026-08-04) ──────────────────────────────────────────── [REF#DG-00434]
    //    "shoji doors can only be on 1 tile hallways, double doors all are on double tile hallways.
    //     always. mandatory." · "there should NEVER be a case where a tile spur has 2 openings
    //     suddenly appear. only a standard 2-tile hallway gets a 2-tiled double door. no shoji doors
    //     on 2+ tiles period. just redo the drawing if it occurs of that map region."
    //    "Redo the drawing" = a STRUCTURAL GATE, not a repair. Rejecting the floor and re-rolling is
    //    how every other rule in this generator is enforced, and it is the only option that cannot
    //    leave a half-fixed map behind. Measured before switching it on: 9/25 seeds are already clean
    //    and the rest carry 1-2 violations, so this costs ~2.8 generation attempts per floor — well
    //    inside the retry budget. If that ratio ever worsens, fix the CAUSE; do not soften the gate.
    //
    //    NOT the same rule as Engine9's "a multi-tile DOORWAY is never paper" (~:7362), which is about
    //    the doorway's own span. This is about the HALLWAY the door opens onto — a lone shoji standing
    //    where a 1-tile spur meets the 2-wide trunk is Mark's "2 openings suddenly appear", and the
    //    doorway-span law cannot see it because that doorway IS one tile.
    //
    //    THE THROUGH-AXIS IS FOUND BY ITS JAMBS, and both halves of that matter. Testing only "walkable
    //    on both sides" picks the wrong axis at a junction and then measures width ALONG the corridor
    //    (probe-door-width-rule's first run reported hallway widths of 8-17 that way). Testing for a
    //    wall immediately beside the tile is also wrong: on a 2-tile doorway the neighbour is the TWIN
    //    DOOR, which silently exempts every double door. So: walk the doorway's own tiles first, then
    //    demand walls past BOTH ends.
    {
      const _wk = (a,b) => { const t = T[a] && T[a][b]; return t === FLOOR || t === CORR || t === DOOR; };
      const _dr = (a,b) => (T[a] && T[a][b]) === DOOR;
      const _hl = (a,b) => (T[a] && T[a][b]) === CORR;
      for (let x = 1; x < GW - 1; x++) for (let y = 1; y < GH - 1; y++) {
        if (!_dr(x, y)) continue;
        if (x >= WX0 && x <= WX1 && y >= WY0 && y <= WY1) continue;   // the head's own doors answer to _carveHead [REF#DG-00435 → see REF#DG-00431]
        const axis = (tx, ty) => {
          if (!(_wk(x - tx, y - ty) && _wk(x + tx, y + ty))) return null;
          const px = ty, py = tx;
          let lo = 0, hi = 0;
          while (_dr(x - px * (lo + 1), y - py * (lo + 1))) lo++;
          while (_dr(x + px * (hi + 1), y + py * (hi + 1))) hi++;
          if (_wk(x - px * (lo + 1), y - py * (lo + 1)) || _wk(x + px * (hi + 1), y + py * (hi + 1))) return null;
          return { n: lo + hi + 1, px, py, tx, ty };
        };
        const a = axis(1, 0) || axis(0, 1);
        if (!a) continue;                                   // a doorway tile inside an open junction [REF#DG-00436]
        let hallW = 0;
        for (const side of [-1, 1]) {
          const hx = x + a.tx * side, hy = y + a.ty * side;
          if (!_hl(hx, hy)) continue;
          let w = 1;
          for (const sg of [-1, 1]) { let k = 1; while (_hl(hx + a.px * sg * k, hy + a.py * sg * k)) { w++; k++; } }
          if (w > hallW) hallW = w;
        }
        if (!hallW || hallW > 2) continue;                  // room-to-room door, or a junction/plaza [REF#DG-00437]
        if (a.n === 1 && hallW >= 2) return false;          // shoji in a 2-wide hallway  -> redraw [REF#DG-00438]
        if (a.n >= 2 && hallW === 1) return false;          // double door in a 1-tile one -> redraw [REF#DG-00439]
      }
    }

    // ── MARK'S CONNECTOR-LENGTH LAW, SECTIONS 1-4 (2026-08-05) ────────────────────────────────── [REF#DG-00440]
    //    Verbatim: "no hallway in any section 1-4 will be longer than 8 tiles, 4 is preferred maximum
    //    length of hallway that connects any room to the major 2-tile hallway that runs through each
    //    section."
    //    WHAT IT MEASURES, and this was Mark's own ruling when I asked rather than my reading: the
    //    2-WIDE runs — the trunk and its branch teeth — ARE "the major 2-tile hallway", so they are the
    //    thing being connected TO and are exempt by definition (they run 21-23 tiles by construction; a
    //    hallway that crosses a section cannot also be under 8). What the rule governs is the 1-TILE
    //    connector between a room's shoji and that hallway.
    //    THIS GATE CHANGES NO MAP TODAY, AND THAT IS THE POINT. §4 lays exactly ONE threshold tile per
    //    room, so connectors are 1 tile by construction — measured 997/997 at exactly 1 over 40 seeds,
    //    none over 4, none over 8. It is here so that the day someone re-introduces a router (the MST
    //    and the 8-tile BFS spur both lived here until this morning), the floor is REJECTED instead of
    //    quietly shipping the corridors Mark has now ruled on twice. Enforcement by re-roll is how every
    //    other rule in this generator works; a rule with no gate is a comment.
    //    Knob: global._sectionConnMax (8 = Mark's hard limit; 4 is his preference, and construction
    //    already beats it, so the gate is set at the limit rather than the preference).
    {
      const _CONN = (typeof global._sectionConnMax === 'number') ? global._sectionConnMax : 8;
      const _inSec = (x, y) => ZN.some(Z => x >= Z.box.x0 && x <= Z.box.x1 && y >= Z.box.y0 && y <= Z.box.y1);
      // "major hallway" = any CORR tile belonging to a 2x2 block of CORR. Everything else is a connector. [REF#DG-00441]
      const _wide = new Set();
      for (let x = 0; x < GW - 1; x++) for (let y = 0; y < GH - 1; y++) {
        if (T[x][y] === CORR && T[x + 1][y] === CORR && T[x][y + 1] === CORR && T[x + 1][y + 1] === CORR)
          for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) _wide.add(a + ',' + b);
      }
      const _seen = new Set();
      for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
        const k = x + ',' + y;
        if (T[x][y] !== CORR || _wide.has(k) || _seen.has(k) || !_inSec(x, y)) continue;
        let n = 0; const st = [[x, y]]; _seen.add(k);
        while (st.length) {
          const [a, b] = st.pop();
          if (++n > _CONN) return false;                    // a connector longer than Mark's limit -> redraw [REF#DG-00442]
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = a + dx, ny = b + dy, nk = nx + ',' + ny;
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            if (T[nx][ny] !== CORR || _wide.has(nk) || _seen.has(nk)) continue;
            _seen.add(nk); st.push([nx, ny]);
          }
        }
      }
    }


    // ── START / CASINO. The casino (stairs down) lives in SECTION 4 — the adapter's contract asserts it, [REF#DG-00443]
    //    and it makes the descent a fixed promise rather than a per-seed surprise: the way down is always
    //    the last section.
    //    HOP IS NOW TRIVIAL AND HONEST. With every room hanging directly off its section's hall, the old
    //    MST tree-depth no longer exists to measure — every room really is one hall away from its gate.
    //    So depth is 1 for every room, and the casino is chosen by DISTANCE ALONG THE HALL from section
    //    4's gate instead: the furthest door from the way in, which is what "deepest" now means here.
    const landing = rooms.find(r => r.type === 'landing');
    const cab = rooms.find(r => r.type === 'cabaret');
    if (!landing || !cab) return false;
    // ── FIVE SECTIONS ON THIS FLOOR, AND THE FOURTH GATE IS THE GUARD ROOM'S ────────────────────── [REF#DG-01458]
    //    Mark, 2026-09-07: "change it that it expects 4 gates (4th is guardroom) it is a room that
    //    opens only after the previous all 3 sections are activated."
    //    WAS 4, AND IT WAS SIMPLY MISCOUNTED. This builder mints FOUR section gates and lays out
    //    sections 0,1,2,3,4 -- S0 cabaret/dressing/manager, S1-S3 cafeteria/factory/storage, S4 the
    //    guard room, locked until 1-3 are activated. That is five sections, so _segmentCount is 5.
    //    It said 4, and every contract downstream derives the expected gate count as
    //    _segmentCount - 1, so the contract demanded THREE gates from a builder that correctly makes
    //    four. The same law is already written in this file at the section-4 promotion block
    //    (~:1286, Mark 2026-09-03: "sections 1-3 to activate, once done the final section 4
    //    (guardroom) is activated") -- the count here had never been brought into line with it.
    //    NOT a literal 4 in the assert: the number of gates is a consequence of how many sections a
    //    topology lays down, and a builder that states its own section count keeps the two from
    //    drifting apart the way they just did.
    _segmentCount = 5;
    const hop = new Map();
    for (const Z of ZN) for (const r of Z.rooms) hop.set(r, 1);
    const _Z4 = ZN[3];
    // ── NO SECTION ROOMS MEANS NO CASINO (Mark 2026-08-24, hallway+cabaret+guard) ───────────────── [REF#DG-00444]
    //    The casino is chosen as the section-4 room FARTHEST from its gate, so it only exists when the
    //    packer ran. With the packer off `_Z4.rooms[0]` is undefined and `casino.type = 'casino'` threw
    //    "Cannot set properties of undefined (setting 'type')" — the second boot-stopper this trim hit.
    //    ⚠ CONSEQUENCE, STATED PLAINLY: the casino WAS this floor's deep end and the Stairway Hall that
    //      carried `stairs_down` was a section room too, so a three-room floor has NO WAY DOWN. That is
    //      what "nothing else" asks for; it is not an oversight. Turn the packer back on with
    //      window._headRoomsOnly = false and both return.
    let casino = _Z4.rooms[0];
    let _best = -1;
    for (const r of _Z4.rooms) {
      const d = Math.abs(r.cx - _Z4.gx) + Math.abs(r.cy - _Z4.gy);
      if (d > _best) { _best = d; casino = r; }
    }
    if (casino) { casino.type = 'casino'; hop.set(casino, 2); }   // depth banding reads it as the deep end [REF#DG-00445]
    _heartRingCarved = true;   // the adapter's level-1 ring block stands down — it would carve a SECOND ring [REF#DG-00446]
    for (const k of ringSet) { mhTiles.add(k); _spineSegmentOf.set(k, 0); }
    for (const Z of ZN) for (const p of Z.hallTiles) mhTiles.add(p[0] + ',' + p[1]);   // section halls are MAIN halls [REF#DG-00447]
    // `start` is the floor's anchor room. Section 1's first room when the packer ran; with it off the [REF#DG-00448]
    // anchor is the head itself — the main hall, which is the first room this generator ever carves.
    return { start: ZN[0].rooms[0] || dung[0] || null, casino: casino || null, hop };
  }

  // generate a valid compact dungeon (deterministic under setMapSeed) — retry until the gates pass [REF#DG-00449]
  function genCompact(maxTries) {
    // Carve spans belong to ONE generation of ONE floor. Reset here rather than inside _buildLHalls [REF#DG-01459]
    // so a floor that never runs it (floor 1 = _buildSection0) reports EMPTY instead of inheriting the
    // previous floor's horseshoe -- the stale-handle trap this codebase has been bitten by before.
    _carveSpans = [];
    _hubCore = null;   // set again by _buildLHalls only when this generation builds the hub (floors 2-7) [REF#DG-02239]
    try { global._lhRejects = {}; } catch (_) {}   // fresh reject tally per generation (see _lhReject) [REF#DG-02028]
    let res = null, t = 0;
    _heartRingCarved = false;   // re-armed every generation: whichever generator wins this call decides who owns the ring [REF#DG-00450]
    _sec0WingCarved = false;    // ditto for the west wing (generator-carved vs adapter-stamped) [REF#DG-00451]
    _lockedDoors = new Map();   // never carry a lock across floors — see the declaration [REF#DG-00452]
    _fixedPanelDoors = new Set();   // ditto: a stale entry would pin a panel on an unrelated door next floor [REF#DG-00453]
    _counterWallTiles = new Set();  // ditto: a stale entry would saw a random wall in half on the next floor [REF#DG-00454]
    _crossDoorTiles = new Set();    // ditto: a stale entry would put a cabaret leaf on an unrelated door next floor [REF#DG-00455]
    const _worker = !!(global && global._workerHalls) && _genLevel >= ((global && global._workerHallsMinFloor) || 1);   // WORKER HALLS test topology (Mark 2026-06-29) — highest priority when flagged on [REF#DG-00456]
    // L-HALL HORSESHOE = THE DEFAULT (Mark 2026-07-26, verbatim: "I am talking about an L-Shaped MAIN HALL THAT [REF#DG-00457]
    // CONNECTS TO OTHER SECTIONS OF A MAIN HALL SO THE FUCKING MAP ISNT ONE LONG FUCKING LINE ALL THE FUCKING
    // TIME"). The main hall itself turns — 4 legs joined by rounded 90° corners, section gates mid-leg — and the
    // straight-trunk spine is ONE FLAG away, not deleted: window._lhallDungeon=false (or ?lhall=0) restores it.
    // Head-parity validated before defaulting (the quadrant's fatal flaw): cabaret (33,47) 12x10 + konbini (35,68)
    // byte-identical to the spine on L1/L2/L3, same seeds; monster spawns equal (25 vs 25, spread over 4 segments).
    let _lhallParam = null, _heartParam = null, _sec0Param = null;
    try { const _s = (global.parent && global.parent.location && global.parent.location.search) || (global.location && global.location.search) || '';
          const _q = new URLSearchParams(_s);
          const _v = _q.get('lhall'); if (_v === '1') _lhallParam = true; else if (_v === '0') _lhallParam = false;
          const _h = _q.get('heart'); if (_h === '1') _heartParam = true; else if (_h === '0') _heartParam = false;
          const _z = _q.get('sec0'); if (_z === '1') _sec0Param = true; else if (_z === '0') _sec0Param = false; } catch (_) {}
    // ── THE FLOOR-1 DEFAULT (Mark 2026-08-03: "we are working on floor 1 - get that one right then we [REF#DG-00458]
    //    can templatize it"). See _buildSection0. It outranks every other topology because on floor 1
    //    it IS the map now; ?sec0=0 or window._section0Dungeon=false restores the previous default.
    //
    //    NOT A FLAG, ON PURPOSE. The last cut shipped this behind ?sec0=1 and Mark booted the default
    //    URL, so he judged the OLD topology and reported the map unchanged — twice, because the script
    //    cache token had not moved either. A map you have to know a query parameter to see is a map
    //    nobody is looking at.
    //
    //    FLOOR 1 ONLY, MEASURED. The L2+ head is 12x26 against floor 1's 5x18, so the same heart leaves
    //    the north and south zones too thin for a 5-tall room and generation fails outright — 0 of 4
    //    seeds on every floor from 2 to 7. Floors below 1 keep the existing generator until the head
    //    itself is re-cut, which is Mark's call and his stated next step ("then we can templatize it").
    const _sec0 = (_sec0Param !== null ? _sec0Param : !(global && global._section0Dungeon === false))
                  && _genLevel === 1;
    // HEART outranks everything but the worker test rig — see _buildHeart. Opt-in (?heart=1 / _heartDungeon) [REF#DG-00459]
    // until Mark has judged a rendered floor; the moment he does, flip this default to true and the older
    // topologies become the fallbacks they already are.
    // HEART IS THE FLOOR-1 DEFAULT (Mark 2026-08-03, second ruling the same day: the first cut shipped
    // opt-in behind ?heart=1 with a stale DungeonChain cache token, so what Mark booted and rejected was
    // the OLD topology — never gate the map Mark is judging behind a flag he has to know about). ?heart=0
    // or window._heartDungeon=false restores the L-hall default.
    // FLOOR 1 ONLY, AND THAT IS ARITHMETIC, NOT CAUTION. Measured head footprints: floor 1 is 5x18
    // (5x6 cabaret + the 10-tile poster hallway); floor 2+ is 12x26 (12x10 cabaret + landing + konbini).
    // The ring adds 6 tiles on each axis, so an L2+ heart is 18x32 inside a 66x46 grid — which leaves the
    // north and south zones 7 rows each. A 5-tall NetHack room plus clearArea's 1-tile border does not
    // fit in 7, so _buildHeart bails and genCompact burns its retries. The fix is to stop enclosing the
    // konbini (it would hang south of the ring like the landing does), but that re-cuts the L2+ head and
    // is Mark's call, not a silent one. Raise window._heartMaxFloor once that is settled.
    const _heartMax = Number.isInteger(global && global._heartMaxFloor) ? global._heartMaxFloor : 1;
    const _heart = (_heartParam !== null ? _heartParam : !(global && global._heartDungeon === false))
                   && _genLevel >= ((global && global._heartMinFloor) || 1) && _genLevel <= _heartMax;
    const _lhall = (_lhallParam !== null ? _lhallParam : (!global || global._lhallDungeon !== false)) && _genLevel >= ((global && global._lhallMinFloor) || 1);
    const _quad = !!(global && global._quadrantDungeon) && _genLevel >= ((global && global._quadrantMinFloor) || 1);   // QUADRANT center-hub topology (Mark 2026-07-24) — his mockup; validated eyes-on before defaulting [REF#DG-00460]
    // ⚠ THE PINWHEEL WAS TRIED HERE AS THE FLOORS-2+ DEFAULT ON 2026-09-02 AND REVERTED, MEASURED. [REF#DG-01374]
    //   `_buildLHalls`' horseshoe has no western arm (see the relabel note ~:800), so the obvious move
    //   was to route floors 2+ to `_buildRing`, which does have a box on each side. It made things
    //   WORSE, not better: **4 violations → 14.** It builds FIVE sections (0-4) with its own N/E/S/W
    //   shuffle still live, so it re-introduced the section 4 Mark retired permanently and put a
    //   section SOUTH of the core. Pinning the compass in its `ZN` table did not reach the code path
    //   that actually ran. Reverted rather than left half-done — bringing the pinwheel in is real
    //   structural work, not a flag flip, and it is written up for whoever picks it up.
    const _ring = !!(global && global._ringDungeon) && _genLevel >= ((global && global._ringMinFloor) || 1);
    const _spineForced = !!(global && global._spineMap === true);
    const _spineDisabled = !!(global && global._spineMap === false);
    const _spine = _spineForced || !_spineDisabled;
    // ── _quad NOW OUTRANKS _lhall (Mark 2026-08-03, measured). _lhall defaults TRUE [REF#DG-00461]
    //    (global._lhallDungeon !== false) and sat AHEAD of _quad, so it short-circuited every time and
    //    _buildQuadrant was unreachable in every shipped configuration. ?quad=1 really did set the flag —
    //    window._quadrantDungeon read back true off a live boot — and nothing ever read it, which is why
    //    ?quad=1 and the default produced the same horseshoe (S1 334/331 · S2 402/400 · S3 79/95 · S4 46/39).
    //    _quad is OPT-IN and still defaults to false, so the shipped default topology is unchanged; this
    //    only makes an explicit opt-in mean something. _worker keeps first refusal as the test rig.
    const _cap = (maxTries || 2000);
    while (!res && t++ < _cap) res = _sec0 ? _buildSection0() : (_worker ? _buildWorkerHalls() : (_heart ? _buildHeart() : (_quad ? _buildQuadrant() : (_lhall ? _buildLHalls() : (_ring ? _buildRing() : (_spine ? _buildSpine() : buildDungeon()))))));
    // ── HOW HARD WAS THIS FLOOR TO BUILD (Mark 2026-09-08: "update onibaba with what you did so [REF#DG-01387]
    //    its in her sensors now"). Oni-Baba gets a REAL receptor on generation strain instead of a
    //    silence that looked identical whether the floor built first try or burned 2000 rerolls.
    //    That silence is exactly how ~15% of floors 2/3 failed for weeks without anyone seeing it.
    //    Report-only: nothing in the generator reads these back, so they cannot steer the carve.
    try { global._lastGenAttempts = t; global._lastGenCap = _cap; global._lastGenOk = !!res; } catch (_) {}
    return res ? { T, rooms, doorList, mhTiles, start: res.start, casino: res.casino, hop: res.hop } : null;
  }

  // ── entity-generation data (ported verbatim from MapGen.js so the engine's monster builder is fed correctly) ── [REF#DG-00462]
  // ── MONSTER HP — A CURVE, NOT A 20-ENTRY TABLE (Mark 2026-07-19: "the dungeon can go on infinitum, but only
  // if you match the attributes of the game mechanics the monsters and the damage").
  // WAS: a literal 20-entry lookup indexed `Math.min(level-1, 19)` — so from floor 20 onward EVERY monster was
  // frozen at 308 HP forever while player damage kept climbing. That single clamp is what made an infinite
  // dungeon meaningless. This reproduces the old table almost exactly (50 x 1.10^(n-1) ≈ 50,55,61,67,74,81,89…)
  // and simply keeps going, so floor 40 and floor 400 stay proportionate.
  // Knobs: window._monHpBase (50) · window._monHpStep (0.10) · window._monHpMul (global difficulty dial).
  const _hpBase = () => (typeof window !== 'undefined' && typeof window._monHpBase === 'number') ? window._monHpBase : 50;
  const _hpStep = () => (typeof window !== 'undefined' && typeof window._monHpStep === 'number') ? window._monHpStep : 0.10;
  // HP HALVED (Mark 2026-07-19: "reduce HP of monsters by 50% - its taking too many arrows to kill things"). [REF#DG-00463]
  // Applied at the MULTIPLIER, not the base, so the per-floor curve shape (_monHpBase 50, _monHpStep +10%/level)
  // is untouched — every floor scales exactly as before, just at half the pool. Floor 1 goblin 50 -> 25,
  // floor 7 89 -> 44. Revert live with window._monHpMul = 1.
  const _hpMul  = () => (typeof window !== 'undefined' && typeof window._monHpMul  === 'number') ? window._monHpMul  : 0.5;
  const hpForLevel = (lvl) => Math.max(1, Math.round(_hpBase() * Math.pow(1 + _hpStep(), Math.max(0, (lvl | 0) - 1)) * _hpMul()));
  const MONSTER_ARCHETYPES = [
    { nameKey: 'yakuza_goblin', vuln: { FIRE: 1.3, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_goblin', vuln: { FIRE: 1.0, WATER: 1.4, EARTH: 0.5, WIND: 0.7, VOID: 1.0, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_goblin', vuln: { FIRE: 1.8, WATER: 0.4, EARTH: 1.0, WIND: 1.2, VOID: 1.1, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_goblin', vuln: { FIRE: 1.0, WATER: 1.5, EARTH: 1.4, WIND: 0.5, VOID: 1.0, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_goblin', vuln: { FIRE: 1.4, WATER: 1.0, EARTH: 1.0, WIND: 1.0, VOID: 0.4, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_goblin', vuln: { FIRE: 0.5, WATER: 1.6, EARTH: 1.0, WIND: 1.3, VOID: 1.1, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_imp', name: 'Yakuza Imp', isImp: true, vuln: { FIRE: 1.4, WATER: 1.0, EARTH: 1.0, WIND: 1.1, VOID: 1.0, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_imp', name: 'Yakuza Imp', isImp: true, vuln: { FIRE: 1.4, WATER: 1.0, EARTH: 1.0, WIND: 1.1, VOID: 1.0, DEFAULT: 1.0 } },
    { nameKey: 'yakuza_mummy', name: 'Yakuza Mummy', isMummy: true, vuln: { FIRE: 1.6, WATER: 0.7, EARTH: 1.0, WIND: 0.9, VOID: 1.0, DEFAULT: 1.0 } },   // Mark 2026-06-22: mummy added to the roster [REF#DG-00464]
    { nameKey: 'hungry_ghost', isGhost: true, groupMin: 3, groupMax: 3, vuln: { FIRE: 1.2, WATER: 0.8, EARTH: 1.0, WIND: 1.25, VOID: 0.5, DEFAULT: 1.0 } },   // Mark 2026-06-22: HORDE — spawns ×3, 10 hp each, 30% transparent [REF#DG-00465]
    // ZOMBIE HORDE (Mark 2026-07-26): cannon fodder — spawns 2-3 at a time like the ghost horde, low flat HP (~22), [REF#DG-00466]
    // floors 2+. REPLACES the retired roaming zombie patrol ("those sucked"). Melee-only, never flees. Model + clip
    // rename wired engine-side off `isZombie` (reuses _warmZombie/_zombieSrc). Knob: window._zombieFodderHp.
    { nameKey: 'zombie', name: 'Zombie', isZombie: true, groupMin: 2, groupMax: 3, hpFlat: 22, minLevel: 2, noFlee: true, meleeOnly: true, noFloat: true, vuln: { FIRE: 1.3, WATER: 0.9, EARTH: 1.0, WIND: 1.0, VOID: 0.6, DEFAULT: 1.0 } },
    // SKELETONS (Mark 2026-07-26 "i added skeletons in skeleton folder, skeleton archer is a missile ranged enemy"). [REF#DG-00467]
    // Guard = a standard melee bone-soldier (level-curve HP, floors 2+). Archer = RANGED missile enemy (fires arrows,
    // floors 3+, a bit lower HP as a glass cannon). Both auto-inherit the goblin material recipe (non-imp branch);
    // models/clips wired engine-side off `isSkeleton` / `isSkeletonArcher`. HP is the only toughness lever (no AC stat).
    // ORC (Mark 2026-09-18: "i added an orc. glb model, its more common on floors 2+ they are 2x [REF#PENDING]
    // tougher than goblins"). THREE ROWS, matching the goblin table's own repetition and the ant/bat
    // pass: this pool is picked UNIFORMLY, so a single row against seven goblin rows reads as invisible.
    // Three rows is what "more common" means mechanically here. hpMul:2 keeps him twice a goblin at EVERY
    // depth rather than a flat number that would decay into a pushover by floor 10.
    // Model/clips/height wired engine-side off `isOrc` (_warmOrcSrc, dispatcher arm, ORC_TARGET_H).
    { nameKey: 'orc', name: 'Orc', isOrc: true, minLevel: 2, hpMul: 2, meleeOnly: true, vuln: { FIRE: 1.1, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } },
    { nameKey: 'orc', name: 'Orc', isOrc: true, minLevel: 2, hpMul: 2, meleeOnly: true, vuln: { FIRE: 1.1, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } },
    { nameKey: 'orc', name: 'Orc', isOrc: true, minLevel: 2, hpMul: 2, meleeOnly: true, vuln: { FIRE: 1.1, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } },
    { nameKey: 'skeleton_guard',  name: 'Skeleton Guard',  isSkeleton: true,       minLevel: 2, meleeOnly: true,  vuln: { FIRE: 0.8, WATER: 1.0, EARTH: 1.35, WIND: 1.0, VOID: 1.15, DEFAULT: 1.0 } },
    { nameKey: 'skeleton_archer', name: 'Skeleton Archer', isSkeletonArcher: true, minLevel: 3, hpFlat: 30, meleeOnly: false, vuln: { FIRE: 0.8, WATER: 1.0, EARTH: 1.3,  WIND: 1.1, VOID: 1.15, DEFAULT: 1.0 } },
    // ANT + BAT (2026-09-17, plans/CODER2_TASK_009_ant_bat_hallway.md: "two new monsters to hallway [REF#DG-02078]
    // spawns - ant and bat ... so the dungeon doesnt feel so empty in sections"). Three rows each
    // (matching the goblin table's own repetition) so a uniform random pick (:4200-area) actually
    // surfaces them instead of reading as invisible against 7 goblin rows. isFlying does not exist
    // anywhere in this engine (checked); bat is NOT wired as a hover body — flagged as an open decision
    // in the task's hand-back, not assumed either way. minLevel omitted on purpose: floor 1 has no
    // hall:true tiles at all (Section0 builds its own mobSpawns), so these can never roll before floor 2.
    { nameKey: 'ant', name: 'Ant', hallOnly: true, hpFlat: 15, meleeOnly: true, noFlee: true, vuln: { FIRE: 1.5, WATER: 1.0, EARTH: 0.7, WIND: 1.0, VOID: 1.0, DEFAULT: 1.0 } },
    { nameKey: 'ant', name: 'Ant', hallOnly: true, hpFlat: 15, meleeOnly: true, noFlee: true, vuln: { FIRE: 1.5, WATER: 1.0, EARTH: 0.7, WIND: 1.0, VOID: 1.0, DEFAULT: 1.0 } },
    { nameKey: 'ant', name: 'Ant', hallOnly: true, hpFlat: 15, meleeOnly: true, noFlee: true, vuln: { FIRE: 1.5, WATER: 1.0, EARTH: 0.7, WIND: 1.0, VOID: 1.0, DEFAULT: 1.0 } },
    // ⛔ SUPERSEDED 2026-09-18 by Mark: "remove bats from map generation" — the three BAT rows are [REF#DG-02088]
    //    OUT of the hallway archetype pool. The 09-17 order above ("two new monsters to hallway
    //    spawns - ant and bat") is retired for the bat half ONLY; ANT is untouched and still rolls.
    //    ⚠ THE BAT WAS NEVER FINISHED, and the note above says so in its own words: "bat is NOT wired
    //      as a hover body — flagged as an open decision". It therefore spawned as a walking body with
    //      its wings used as legs, which is exactly what Mark saw. Removing the rows is the order; it
    //      is not a claim that the bat is unfixable.
    //    ⚠ THE ROWS ARE COMMENTED, NOT DELETED, so the tuning survives if the hover body is ever built.
    //      Nothing else reads them — DungeonChain is the only producer of hall archetypes.
    //    Register: DISABLED-FEATURES REGISTER, NewOrigami.Engine9.html.
    // { nameKey: 'bat', name: 'Bat', hallOnly: true, hpFlat: 12, meleeOnly: true, vuln: { FIRE: 1.0, WATER: 1.0, EARTH: 1.0, WIND: 1.4, VOID: 1.0, DEFAULT: 1.0 } },
    // { nameKey: 'bat', name: 'Bat', hallOnly: true, hpFlat: 12, meleeOnly: true, vuln: { FIRE: 1.0, WATER: 1.0, EARTH: 1.0, WIND: 1.4, VOID: 1.0, DEFAULT: 1.0 } },
    // { nameKey: 'bat', name: 'Bat', hallOnly: true, hpFlat: 12, meleeOnly: true, vuln: { FIRE: 1.0, WATER: 1.0, EARTH: 1.0, WIND: 1.4, VOID: 1.0, DEFAULT: 1.0 } },
  ];
  const VULN_SUPER = { FIRE: 1.1, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.0, DEFAULT: 0.95 };
  const VULN_IMP = { FIRE: 1.4, WATER: 1.0, EARTH: 1.0, WIND: 1.1, VOID: 1.0, DEFAULT: 1.0 };
  const VULN_FLINT = { FIRE: 1.3, WATER: 1.1, EARTH: 1.0, WIND: 1.2, VOID: 1.0, DEFAULT: 1.0 };
  const VULN_BOSS = { FIRE: 0.85, WATER: 0.85, EARTH: 0.85, WIND: 0.85, VOID: 1.0, DEFAULT: 0.9 };
  function rollLootCard() {
    const r = _rand();
    if (r < 0.55) return { catId: 'MISSILE', title: 'SHURIKEN', desc: 'Throwing star', kanji: '投', attr: '(DMG*1DICE)' };
    if (r < 0.68) return { catId: 'MISSILE', title: 'DAGGER', desc: 'Quick blade', kanji: '刃', attr: '(DMG*1DICE)' };
    if (r < 0.78) return { catId: 'MISSILE', title: 'SHORT BOW', desc: 'Light bow', kanji: '弓', attr: '(DMG*2DICE)' };
    if (r < 0.84) return { catId: 'MISSILE', title: 'LONG BOW', desc: 'Heavy bow', kanji: '長弓', attr: '(DMG*3DICE)' };
    if (r < 0.90) return { catId: 'EARTH', title: 'BOULDER', desc: 'Heavy impact', kanji: '地', attr: '(STUN*2DICE)' };
    if (r < 0.94) return { catId: 'FIRE', title: 'FIREBALL', desc: 'Inferno star', kanji: '火', attr: '(DMG*4DICE)' };
    if (r < 0.97) return { catId: 'WATER', title: 'TIDE', desc: 'Washes away', kanji: '水', attr: '(SLOW*3DICE)' };
    return { catId: 'WIND', title: 'CYCLONE', desc: 'Seeks & spins', kanji: '旋', attr: '(SPIN*3DICE)' };
  }
  // SPELL-only roll for the per-room reward card (Mark 2026-06-21: "a random spell loot card") — elemental SPELLs only, no weapons. [REF#DG-00468]
  function rollSpellCard() {
    const r = _rand();
    if (r < 0.30) return { catId: 'FIRE',  title: 'FIREBALL', desc: 'Inferno star', kanji: '火', attr: '(DMG*4DICE)' };
    if (r < 0.55) return { catId: 'EARTH', title: 'BOULDER',  desc: 'Heavy impact', kanji: '地', attr: '(STUN*2DICE)' };
    if (r < 0.80) return { catId: 'WATER', title: 'TIDE',     desc: 'Washes away',  kanji: '水', attr: '(SLOW*3DICE)' };
    return            { catId: 'WIND',  title: 'CYCLONE',  desc: 'Seeks & spins', kanji: '旋', attr: '(SPIN*3DICE)' };
  }
  // room-name pools (ported from MapGen.js ROOM_POOLS / ROOM_POOLS_EN; L8-20 themed on demand) [REF#DG-00469]
  // ⚠ THE TWO ARRAYS ARE INDEX-ALIGNED. _roomNames() indexes both with the same k, so entry i of
  // ROOM_POOLS must be the same room as entry i of ROOM_POOLS_EN. Reorder one and you silently ship
  // a Japanese bath house labelled "Stable".
  // ⚠ MapGen.js carries the SAME L1 pool (its ~329 / ~572) and is still reachable as the
  // hand-authored fallback (window._floor1HandAuthored). Both were updated together on 2026-07-28;
  // keep them in step or floor 1 renames itself depending on which generator ran.
  //
  // ── FLOOR 1 IS WHERE THE STAFF LIVE (Mark 2026-07-28: "most of the rooms on level 1 are worker's
  //    rooms … yes player is breaking and entering and it causes monsters to get hostile, can you
  //    blame them? :)") ──────────────────────────────────────────────────────────────────────────
  // This is a fiction fix, not a cosmetic one, and it retro-justifies a mechanic that already ships.
  // Floor 1's monsters turn hostile when you walk in on them, and with the old pool — Entry Hall,
  // Armory, Water Hall — that read as unprovoked aggression from dungeon guards. Named as what they
  // actually are (a longhouse, a mess, a bunk room, a bath house), the same behaviour reads as
  // yakuza labourers objecting to a stranger kicking their door in at night. Same code, better story.
  // Seven of the ten are staff quarters; the guard post, storehouse and stable are the workplace
  // around them. Deeper floors keep their curses and hellfire — that is where the dungeon proper starts.
  const ROOM_POOLS = [
    ['長屋', '飯場', '寝床', '作業場', '道具部屋', '土間', '番所', '倉庫', '湯殿', '厩'],
    ['地下廊下', '石牢', '水責め部屋', '拷問部屋', '隠し部屋', '番兵詰所', '武器庫', '兵糧庫', '火薬庫', '地下道'],
    ['呪いの間', '骸骨の部屋', '腐敗の廊下', '古戦場', '血の祭壇', '暗黒の庭', '亡者の館', '闇の蔵', '冥界の扉', '怨霊の間'],
    ['炎の間', '溶岩の廊下', '鬼の洞窟', '業火の部屋', '赤鬼の間', '閻魔の庭', '地獄谷', '焦熱地獄', '火の柱', '灼熱の間'],
    ['氷の廊下', '雪女の間', '吹雪の洞', '霜の蔵', '冰牢', '雪の祭壇', '凍てつく間', '氷柱の廊', '白銀の間', '霧の間'],
    ['雷の間', '稲妻の廊下', '嵐の洞', '天雷の部屋', '神鳴の間', '龍神の庭', '電光石火', '疾風の間', '暴風の蔵', '雷神の祭壇'],
    ['鬼婆の聖域', '冥府の門', '黒龍の間', '業の間', '六道の辻', '恩讐の庭', '鬼の玉座', '幽冥の奥', '彼岸の間', '魂の祭壇'],
  ];
  const ROOM_POOLS_EN = [
    ["Workers' Longhouse", "Labourers' Mess", 'Bunk Room', 'Workshop', 'Tool Room', 'Earthen Floor', 'Guard Post', 'Storehouse', 'Bath House', 'Stable'],
    ['Underground Corridor', 'Stone Cell', 'Water Torture Room', 'Torture Chamber', 'Hidden Room', 'Sentry Post', 'Weapon Cache', 'Granary', 'Powder Magazine', 'Tunnel'],
    ['Cursed Hall', 'Bone Room', 'Rotten Corridor', 'Old Battlefield', 'Blood Altar', 'Dark Garden', 'House of the Dead', 'Dark Vault', 'Underworld Gate', 'Vengeful Spirits Hall'],
    ['Flame Hall', 'Lava Corridor', 'Oni Cave', 'Karmic Fire Room', 'Red Oni Chamber', "Enma's Garden", 'Hell Valley', 'Burning Hell', 'Pillar of Fire', 'Scorching Hall'],
    ['Ice Corridor', "Yuki-Onna's Hall", 'Blizzard Cave', 'Frost Vault', 'Ice Prison', 'Snow Altar', 'Frozen Hall', 'Icicle Passage', 'Silver Hall', 'Misty Hall'],
    ['Thunder Hall', 'Lightning Corridor', 'Storm Cave', 'Heavenly Lightning Room', 'Roaring Thunder Hall', "Dragon God's Garden", 'Lightning Strike', 'Gale Hall', 'Tempest Vault', "Raijin's Altar"],
    ["Oni-Baba's Sanctum", 'Gate of Hades', 'Black Dragon Hall', 'Karma Chamber', 'Six-Paths Crossroad', 'Garden of Vengeance', 'Oni Throne', 'Depths of Yomi', 'Higan Chamber', 'Soul Altar'],
  ];
  const LATE_THEMES_EN = { 8: 'Wind', 9: 'Earth', 10: 'Time', 11: 'Light', 12: 'Shadow', 13: 'Chaos', 14: 'Order', 15: 'Life', 16: 'Death', 17: 'Creation', 18: 'Destruction', 19: 'Wisdom', 20: 'Divine' };
  const LATE_SUFFIXES_EN = ['Hall', 'Chamber', 'Sanctum', 'Vault', 'Spirits', 'Labyrinth', 'Throne', 'Kingdom', 'Corridor', 'Heart'];
  function _roomNames(level, k) {
    const pj = ROOM_POOLS[level - 1], pe = ROOM_POOLS_EN[level - 1];
    if (pj && pe) return { ja: pj[k % pj.length], en: pe[k % pe.length] };
    const ja = (ROOM_POOLS[6])[k % 10];                                   // L8+: reuse a JP pool for flavour [REF#DG-00470]
    return { ja: ja, en: (LATE_THEMES_EN[level] || 'Deep') + ' ' + LATE_SUFFIXES_EN[k % LATE_SUFFIXES_EN.length] };
  }

  // mobSpawns pass — per-room monster/loot roll + casino supervisor & imps + flintlock imps + L7 boss (deterministic ids) [REF#DG-00471]
  function _genMobSpawns(level, map, rooms_out, casinoId) {
    const mobs = []; let ctr = 0; const hp = hpForLevel(level); const occ = new Set();   // hp: curve, not a capped table — see hpForLevel (~654) [REF#DG-00472]
    const key = (x, z) => x + ',' + z;
    const interior = (r) => { const out = []; for (let x = r.x + 1; x < r.x + r.w - 1; x++) for (let z = r.y + 1; z < r.y + r.h - 1; z++) { const t = map[x] && map[x][z]; if (t && t.type === 'floor' && !occ.has(key(x, z))) out.push([x, z]); } return out; };
    // A loot card must NOT sit next to a door (Mark 2026-06-22). A door is a PASSABLE gap in the room's wall ring, [REF#DG-00473]
    // so an interior tile is "door-adjacent" if an orthogonal neighbour lies ON the ring and is passable (floor/door).
    const isDoorAdj = (r, x, z) => {
      const D = [[1,0],[-1,0],[0,1],[0,-1]];
      for (let i = 0; i < 4; i++) { const nx = x + D[i][0], nz = z + D[i][1];
        const onRing = (nx <= r.x || nx >= r.x + r.w - 1 || nz <= r.y || nz >= r.y + r.h - 1);
        if (onRing) { const t = map[nx] && map[nx][nz]; if (t && (t.type === 'floor' || t.type === 'shoji_door' || (t.doors && t.doors.length))) return true; }
      }
      return false;
    };
    const lootCells = (r) => { const f = interior(r).filter(c => !isDoorAdj(r, c[0], c[1])); return f.length ? f : interior(r); };
    const pick = (arr) => arr.length ? arr[(_rand() * arr.length) | 0] : null;
    // FLOOR-1 INTRO (Mark 2026-06-19): the cabaret greeters (2 goblin + 1 imp, non-hostile) + the starter-card [REF#DG-00474]
    // kit in the start hallway — ported from the old hand-authored Floor 1 so the redrawn Floor 1 still opens it.
    if (level === 1) {
      const _cab = rooms_out[1], _land = rooms_out[0];
      if (_cab) {
        // CABARET GREETERS (Mark 2026-06-22: "remove one goblin, move the imp to the front row"). Now ONE imp (FRONT ROW [REF#DG-00475]
        // = the audience row nearest the stage, z = _cab.y+3) + ONE goblin (any audience seat behind it). The 2nd goblin is
        // dropped. Audience = south rows only (the north interior = stage deck is filtered out). Deterministic (no new _rand
        // beyond the existing pick()). cabAudience = cabaret-sanctuary flag — never aggro from an outside fight.
        const _frontZ = _cab.y + 3;
        const aud = interior(_cab).filter(c => c[1] >= _frontZ);
        const front = aud.filter(c => c[1] === _frontZ);
        // cab-imp-1 (the greeter imp) DROPPED 2026-07-07 (Mark TAB-confirmed "the last imp was the invisible one" = [REF#DG-00476]
        // cab-imp-1). It spawned as an INVISIBLE husk (headless: 3× 514-vert body, all vis:false, no skinned mesh)
        // — a SECOND imp on top of the Engine8 'cab-imp-fan' (the REAL visible imp, mobSpawn ~1996). Two imps under
        // different ids never deduped; cab-imp-1 was the dead one. Drop it here so cab-imp-fan is the sole cabaret
        // imp (matches the "one imp" spec). The goblin greeter stays. Restore the 2nd imp: add ['cab-imp-1', true] back.
        const _gr = [];   // cab-gob-1 greeter DROPPED (ported to recovery-0708 from main 60dbf30, per Mark "hidden yakuza goblin"): [REF#DG-00477]
                          // duplicate id vs the Engine8 hardcoded cab-gob-1 (~2028, the poker-seated gobA). Two spawns share the id [REF#DG-00478]
                          // but never dedup, and this greeter's role 'goblin' is unhandled by _crowdWatch → it sat at a raw audience
                          // tile = the "hidden" goblin. Mirrors the cab-imp-1 drop. Restore: put ['cab-gob-1', false] back.
        for (const g of _gr) {
          const poolc = ((g[1] && front.length) ? front : aud).filter(c => !occ.has(key(c[0], c[1])));
          const c = pick(poolc); if (!c) continue; occ.add(key(c[0], c[1]));
          mobs.push({ id: g[0], nameKey: g[1] ? 'yakuza_imp' : 'yakuza_goblin', name: g[1] ? 'Yakuza Imp' : 'Yakuza Goblin', type: 'monster', x: c[0], z: c[1], hp: g[1] ? 30 : 50, maxHp: g[1] ? 30 : 50, isHostile: false, isImp: g[1], cabAudience: g[1] ? 'imp' : 'goblin', vulnerability: { FIRE: 1.3, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } });
        }
      }
      if (_land) {
        // HALLWAY 0 LOOT IS RANDOM; ONLY THE LANTERN IS FIXED (Mark 2026-09-20, for r29: "have random loot in hallway 0 - [REF#DG-02113]
        // only static is magic lantern" + "reduce by 1 card loot in hallway0"). The MAGIC LANTERN always lies nearest the
        // stairs; the other THREE are drawn without replacement from the starter pool below, on the floor seed (_rand), so
        // a given seed always deals the same hand. 5 → 4 cards. Knob: window._hall0RandomCards (3).
        // ⛔ SUPERSEDED 2026-09-20 by that order: the fixed MISSILE / SHURIKEN / FIREBALL / KATANA kit of 06-29.
        const _H0_POOL = [
          { catId: 'MISSILE', title: 'DAGGER',        desc: 'Thrown blade',  kanji: '刃', attr: '(DMG*1DICE)' },
          { catId: 'MISSILE', title: 'SHURIKEN',      desc: 'Throwing star', kanji: '投', attr: '(DMG*1DICE)' },
          { catId: 'MISSILE', title: 'SHORT BOW',     desc: 'Light bow',     kanji: '弓', attr: '(DMG*2DICE)' },
          { catId: 'FIRE',    title: 'FIREBALL',      desc: 'A test spell',  kanji: '火', attr: '(DMG*4DICE)' },
          { catId: 'EARTH',   title: 'BOULDER',       desc: 'Heavy impact',  kanji: '地', attr: '(STUN*2DICE)' },
          { catId: 'WATER',   title: 'TIDE',          desc: 'Washes away',   kanji: '水', attr: '(SLOW*3DICE)' },
          { catId: 'WIND',    title: 'CYCLONE',       desc: 'Seeks & spins', kanji: '旋', attr: '(SPIN*3DICE)' },
          { catId: 'KATANA',  title: 'KATANA',        desc: 'Melee weapon',  kanji: '刀', attr: '(MELEE)' } ];
        const _h0N = (global && typeof global._hall0RandomCards === 'number') ? Math.max(0, global._hall0RandomCards | 0) : 3;
        const _h0Deck = _H0_POOL.slice();
        const STARTER = [ { catId: 'ITEM', title: 'MAGIC LANTERN', desc: 'Lights the dark', kanji: '灯', attr: '(LIGHT)' } ];
        for (let k = 0; k < _h0N && _h0Deck.length; k++) STARTER.push(_h0Deck.splice((_rand() * _h0Deck.length) | 0, 1)[0]);
        // Place the starter kit NEAREST the player's spawn (the up-stairs), off the doors — Mark 2026-06-22: [REF#DG-00480]
        // "the loot cards are too near the cabaret door … move them close to player startpos."
        let _sux = _land.cx, _suz = _land.cy;
        for (let x = _land.x; x < _land.x + _land.w; x++) for (let z = _land.y; z < _land.y + _land.h; z++) { if (map[x] && map[x][z] && map[x][z].type === 'stairs_up') { _sux = x; _suz = z; } }
        const lp = lootCells(_land).slice().sort((a, b) => (Math.abs(a[0] - _sux) + Math.abs(a[1] - _suz)) - (Math.abs(b[0] - _sux) + Math.abs(b[1] - _suz)));
        STARTER.forEach((s, i) => { const c = lp[i]; if (!c) return; occ.add(key(c[0], c[1])); mobs.push({ id: 'room0-starter-' + i, type: 'loot_card', x: c[0], z: c[1], catId: s.catId, title: s.title, desc: s.desc, kanji: s.kanji, attr: s.attr }); }); }
    }
    for (const r of rooms_out) {
      if (r.id === 0 || r.isCabaret || r.isCasino || r.isOniBaba || r.isStore) continue;             // skip entrance/landing, casino (supervisor), throne (boss), konbini store (monster-free) [REF#DG-00481]
      // ENTRY CHAMBER IS SAFE (Mark 2026-07-26, L2 screenshot of a hungry-ghost horde swarming the arrival stairs: [REF#DG-00482]
      // "remove hungry ghosts always from entry chamber"): the ARRIVAL room (depth-hop 0, where stairs_up lands the
      // player) never spawns monsters on ANY floor — no spawn-camping. Its loot card slot moves with it (acceptable);
      // hop-1+ rooms are untouched. section==='entry' also covers cabaret/landing, already skipped above.
      // ── THE ENTRY ROOMS ARE PRIVATE, AND THE MINIMUM DOES NOT REACH THEM ────────────────────────
      //    Mark 2026-08-12, correcting me mid-change: "those are private rooms, only a manager is in
      //    managers office, do not make a goblin in starlettes private dressing room."
      //    I had briefly made this line yield ONE sleeper per entry room to satisfy his "1 monster per
      //    room minimum" — measured, rooms 2 and 3 were the only two on the floor holding zero. That was
      //    WRONG and is recorded here so nobody re-derives it from the minimum rule: on floor 1 the
      //    entry section is the cabaret's own suite — id 2 is 楽屋, STARLETTE'S PRIVATE DRESSING ROOM,
      //    and id 3 is 支配人室, THE MANAGER'S OFFICE, which by design holds the Manager and nobody else.
      //    They are not under-populated ordinary rooms; they are authored private spaces that read as
      //    empty precisely because a goblin asleep in them would be nonsense. The minimum is a rule for
      //    the WORKER floor, not for the cabaret's back rooms.
      //    (The engine's entry box-cull ~:5234 independently scrubs this area too, so even a spawn
      //    placed here would have been deleted — two rules agreeing, both deliberate.)
      if (r.section === 'entry' && window._entryRoomSpawns !== true) continue;
      // MONSTER-PER-ROOM RULE (Mark 2026-06-21: "minimum 1 monster per room, majority 2 random monsters, [REF#DG-00483]
      // rarely 3-4 with a random spell loot card"). NO more 0-monster rooms (the old 25% "1-loot only" branch
      // was the violation). ≥1 monster ALWAYS; majority 2; rare 3-4 each dropping a random SPELL card.
      // Distribution (Mark 2026-06-22): 30% one monster · 50% two monsters OR one+loot · 20% three OR two+loot.
      let nm = 0, nl = 0;
      if (global && global._workerHalls) {
        // WORKER HALLS (Mark 2026-06-29): exactly ONE occupant per worker cell — a lone worker monster, OR (when the random [REF#DG-00484]
        // archetype rolls hungry_ghost) a ghost pack that always groups up. No loot clutter in the cells. nm=1; nl=0.
        nm = 1; nl = 0;
      } else if (level === 1) {
        // ── FLOOR 1 IS A SHIFT, NOT A GAUNTLET (Mark 2026-08-05: "just want to see more workers in each [REF#DG-00485]
        //    room and those Zzzz we had animated for sleepers") ──────────────────────────────────────
        //    WAS: 75% one mob · 20% one+loot · 5% two+loot (Mark 2026-06-28, "keep Floor 1 approachable —
        //    the filmable golden path"). That rule was written when floor-1 monsters were AWAKE and
        //    hostile, so population WAS difficulty. It is not any more: since 2026-08-02 every worker is
        //    born asleep and stays asleep until the player walks into its room, so a room of four is a
        //    dormitory, not an ambush. The old curve is why a room reads as empty — one body, and if that
        //    one woke early (the corridor-roomId bug, fixed 08-05) the room looked abandoned.
        //    Now 2-4 per room, which is also what makes the Zzz read as a sleeping district rather than
        //    one lonely worker. Beds follow automatically — the furniture pass lays one per sleeper
        //    (Engine9 ~:3960, cap window._bedsPerRoomMax 4), so a room of four is four occupied beds.
        //    ⚠ FPS: each sleeper costs a wrapper + monBase + Zzz sprite + floor disc + kanji ring. Tripling
        //      floor-1 population is a REAL drawable increase and must be census-checked against the 59-
        //      program / 158-drawable baseline before it is called done — programs should NOT move (no new
        //      materials, no new lights), but drawables will. Section streaming and the PiP's 4.8-tile
        //      radius bound what is actually drawn at once.
        //    Knobs: global._workersPerRoomMin (2) · _workersPerRoomMax (4). Set both to 1 for the old
        //    06-28 sparse floor.
        //    ⚠ MAX LOWERED 4 → 2 (Mark 2026-08-13: "why is there a room with more than 2 monsters? …
        //      no rooms should have so many monsters"). This REVERSES the top half of his own 08-05
        //      "more workers in each room" order, which is why it is written here rather than quietly
        //      edited: the 2-4 spread was correct for what he asked then and is wrong for what he asks
        //      now. The MINIMUM stays 2, so no room reads abandoned — the 08-05 intent survives; only
        //      the crowding goes. A 1-2 spread is one knob away: global._workersPerRoomMin = 1.
        const _wMin = (typeof global._workersPerRoomMin === 'number') ? Math.max(0, global._workersPerRoomMin) : 2;
        const _wMax = (typeof global._workersPerRoomMax === 'number') ? Math.max(_wMin, global._workersPerRoomMax) : 2;
        nm = _wMin + ((_rand() * (_wMax - _wMin + 1)) | 0);
        nl = (_rand() < 0.25) ? 1 : 0;   // loot stays occasional — the room is a bunkroom, not a treasury [REF#DG-00486]
      } else {
        const _r = _rand();
      if (_r < 0.30)      { nm = 1; }                                                       // 30% — 1 monster only [REF#DG-00487]
      else if (_r < 0.80) { if (_rand() < 0.5) { nm = 2; } else { nm = 1; nl = 1; } }       // 50% — 2 monsters OR 1 monster + 1 loot card [REF#DG-00488]
      else                { if (_rand() < 0.5) { nm = 3; } else { nm = 2; nl = 1; } }       // 20% — 3 monsters OR 2 monsters + 1 loot card [REF#DG-00489]
      }
      const _mobsBefore = mobs.length;
      // ── HARD PER-ROOM BODY CAP (Mark 2026-08-13) ────────────────────────────────────────────────── [REF#DG-00490]
      //    "why is there a room with more than 2 monsters? … no rooms should have so many monsters —
      //     fix map generation and monster spawn", then: "for levels 2+ you can add an extra monster
      //     quantity to rooms up to our culling active monster hostile max for the lower levels per
      //     room monster spawn rules."
      //
      //    ⚠ THE ROLL WAS NEVER THE WHOLE COUNT, which is why capping `nm` alone would not have fixed
      //      this. GROUP archetypes expand: hungry_ghost carries groupMin/groupMax 3 and zombies 2-3,
      //      so ONE roll of the pool can lay 3 bodies. At the old floor-1 spread (2-4 rolls) a single
      //      room could legitimately reach a dozen. The cap therefore counts BODIES PLACED, not rolls,
      //      and a pack that would overshoot is truncated rather than skipped — a horde of 2 is still
      //      a horde, but an empty room would be a worse lie.
      //
      //    THE CURVE: 2 on floor 1, then +1 per floor, ceilinged at the engine's live-hostile cap.
      //    Levels 2+ get "extra monster quantity" exactly as asked, and the ceiling is his own words —
      //    the number the aggro cull already enforces at runtime, so generation can never author a room
      //    the fight system is not allowed to wake at once.
      //    ⚠ 6 IS A MIRROR OF MAX_AGGRO_MONSTERS (Origami.RealityEngine.9.html ~:43165) AND THE TWO MUST
      //      MOVE TOGETHER. Engine9 publishes the live value to window._aggroHostileMax, which is what
      //      this reads whenever it is available (every regenerated floor, i.e. all of L2+). Floor 1
      //      generates during module init, BEFORE that const is initialised, so it falls back to the
      //      literal — harmless, because floor 1's cap is 2 and never reaches the ceiling.
      //    Off/override: global._roomMonsterCap = N forces a flat cap on every floor.
      const _hostileMax = (typeof window !== 'undefined' && typeof window._aggroHostileMax === 'number')
                        ? window._aggroHostileMax : 6;
      const _roomCap = (typeof global._roomMonsterCap === 'number')
                     ? Math.max(1, global._roomMonsterCap)
                     : Math.max(1, Math.min(_hostileMax, 2 + Math.max(0, level - 1)));
      let _placed = 0;
      // Level-gate the pool — some archetypes carry a minLevel (zombies/skeletons start on floor 2+). [REF#DG-00491]
      const _pool = MONSTER_ARCHETYPES.filter(a => (!a.minLevel || level >= a.minLevel) && !a.hallOnly);
      for (let i = 0; i < nm && _placed < _roomCap; i++) {
        const a = _pool[(_rand() * _pool.length) | 0];
        // Group spawners (ghost horde, zombie fodder) drop a small pack at once; everyone else is a lone mob. [REF#DG-00492]
        const groupN = (a.groupMin || a.groupMax) ? (a.groupMin + ((_rand() * ((a.groupMax || a.groupMin) - a.groupMin + 1)) | 0)) : 1;
        for (let gi = 0; gi < groupN; gi++) {
          if (_placed >= _roomCap) break;                    // the cap counts BODIES — packs truncate here [REF#DG-00493]
          const c = pick(interior(r)); if (!c) break; occ.add(key(c[0], c[1])); _placed++;
          // hpMul rides the LEVEL CURVE (Mark 2026-09-18: orcs "2x tougher than goblins"). A flat number [REF#PENDING] [REF#DG-02089]
      // would freeze an orc at floor-2 toughness forever while the player's HP kept growing +20/level —
      // the exact defect the hpByLevel TABLE had before hpForLevel() replaced it. A multiplier scales.
      const _hp = a.isGhost ? 10 : Math.round((typeof a.hpFlat === 'number' ? a.hpFlat : hp) * (typeof a.hpMul === 'number' ? a.hpMul : 1));   // ghost 10 · zombie/skeleton flat · else level curve [REF#DG-00494]
          mobs.push({
            id: (a.isGhost ? 'ghost-' : a.isZombie ? 'zombie-' : a.isMummy ? 'mummy-' : (a.isSkeleton || a.isSkeletonArcher) ? 'skel-' : 'mob-') + r.id + '-' + (ctr++),
            nameKey: a.nameKey,
            name: a.name || (a.isGhost ? 'Hungry Ghost' : 'Yakuza Goblin'),
            type: 'monster',
            x: c[0], z: c[1],
            hp: _hp,
            maxHp: _hp,
            isHostile: true,
            isImp: !!a.isImp,
            isGhost: !!a.isGhost,
            isMummy: !!a.isMummy,
            isZombie: !!a.isZombie,
            isOrc: !!a.isOrc,   // ⚠ FLAGS ARE ENUMERATED HERE, NOT SPREAD — omit one and the mob silently spawns as a GOBLIN [REF#PENDING] [REF#DG-02090]
            isSkeleton: !!a.isSkeleton,
            isSkeletonArcher: !!a.isSkeletonArcher,
            ghostAlpha: a.isGhost ? 0.7 : undefined,   // 30% transparent (Mark 2026-06-22) — engine applies it [REF#DG-00495]
            noFloat: !!a.noFloat,
            noFlee: !!(a.isGhost || a.noFlee),
            meleeOnly: (typeof a.meleeOnly === 'boolean' ? a.meleeOnly : !!a.isGhost),
            vulnerability: a.vuln
          });
        }
      }
      for (let i = 0; i < nl; i++) { const c = pick(lootCells(r)); if (!c) break; occ.add(key(c[0], c[1])); const L = rollSpellCard(); mobs.push({ id: 'loot-card-' + r.id + '-' + (ctr++), type: 'loot_card', x: c[0], z: c[1], catId: L.catId, title: L.title, desc: L.desc, kanji: L.kanji, attr: L.attr }); }
      // Fallback guarantee: if pick() returned null for every slot (edge case — no available [REF#DG-00496]
      // interior tile), force one goblin on the first unclaimed interior tile.
      if (mobs.length === _mobsBefore) { const _fc = interior(r)[0]; if (_fc) { occ.add(key(_fc[0], _fc[1])); mobs.push({ id: 'forced-mob-' + r.id + '-' + (ctr++), nameKey: 'yakuza_goblin', name: 'Yakuza Goblin', type: 'monster', x: _fc[0], z: _fc[1], hp, maxHp: hp, isHostile: true, vulnerability: { FIRE: 1.3, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 } }); } }
    }
    // ── HALLWAY MONSTER SPAWNER (Mark 2026-06-28: "every 5 tiles there is a 25% chance a monster spawns in the hallway, +5 tiles away") ── [REF#DG-00497]
    // Corridor tiles are stamped hall:true on the engine `map` (adapter ~694) BEFORE this runs, so enumerate them directly.
    // Model: level-aware per-tile rate with a min-gap, so corridor mobs are random but never clustered.
    // robust to 1- vs 2-wide corridors (a literal every-5th-tile step would over-pack the 2-wide spine). ONE monster per spawn
    // (no ghost hordes wedged into a 1-wide hall). The engine intro-cull scrubs any placed near the spawn landing. _rand() = deterministic.
    // Disable: window._hallwaySpawns=false. Tune: window._hallSpawnRate / window._hallMinGap.
    if (typeof window === 'undefined' || window._hallwaySpawns !== false){
      const _hsRate = (typeof window !== 'undefined' && typeof window._hallSpawnRate === 'number') ? window._hallSpawnRate : (level === 1 ? 0.065 : 0.09);
      const _hsGap  = (typeof window !== 'undefined' && typeof window._hallMinGap === 'number') ? window._hallMinGap : (level === 1 ? 5 : 4);
      // ENTRY SAFE ZONE for hall ambushes too (Mark 2026-07-26, the L2 ghost-swarm-at-the-stairs screenshot): no [REF#DG-00498]
      // hall-tile spawn within 8 tiles of the arrival stairs — the ghosts in his shot were hall-mobs at the mouth
      // of the entry chamber. Knob shared with the room rule: window._entryRoomSpawns=true restores.
      let _upT = null;
      if (window._entryRoomSpawns !== true){ for (let _x = 0; _x < map.length && !_upT; _x++){ const _col = map[_x]; if (!_col) continue; for (let _z = 0; _z < _col.length; _z++){ const _t = _col[_z]; if (_t && (_t.type === 'stairs_up' || _t.type === 'stairs_up_r')){ _upT = [_x, _z]; break; } } } }
      // 1-WIDE PINCH GUARD (2026-09-17, plans/CODER2_TASK_009_ant_bat_hallway.md, d1's cross-read of §19.19): [REF#DG-02079]
      // a monster wedged into a genuine 1-tile-wide corridor cell can soft-lock passage (_canPlayerStand
      // refuses a monster's own tile unless the player is fleeing). Skip any hall tile whose two LATERAL
      // neighbours (perpendicular to whichever axis is open) are both non-floor, for every archetype —
      // not new behaviour, just closing a gap the existing goblin/imp spawns already had. Counted for the
      // hand-back's "candidate tiles removed" report via window._hsPinchSkipped (probe handle).
      const _isFloorTile = (x, z) => { const c = map[x] && map[x][z]; return !!c && c.type === 'floor'; };
      const _isHallPinch = (x, z) => (!_isFloorTile(x - 1, z) && !_isFloorTile(x + 1, z)) || (!_isFloorTile(x, z - 1) && !_isFloorTile(x, z + 1));
      let _hsPinchSkipped = 0;
      const _hsTiles = [];
      for (let _x = 0; _x < map.length; _x++){ const _col = map[_x]; if (!_col) continue; for (let _z = 0; _z < _col.length; _z++){ const _t = _col[_z]; if (_t && _t.hall === true && _t.type === 'floor' && !occ.has(key(_x, _z))){ if (_upT && (Math.abs(_x - _upT[0]) + Math.abs(_z - _upT[1])) < 8) continue; if (_isHallPinch(_x, _z)){ _hsPinchSkipped++; continue; } _hsTiles.push([_x, _z]); } } }
      if (typeof window !== 'undefined') window._hsPinchSkipped = (window._hsPinchSkipped || 0) + _hsPinchSkipped;
      _hsTiles.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);   // deterministic order [REF#DG-00499]
      const _hsPlaced = [];
      // LEVEL-GATED HALL POOL (2026-09-17, plans/CODER2_TASK_009_ant_bat_hallway.md step 2 addition): the [REF#DG-02080]
      // hall pick used to draw from the FULL table including minLevel-gated rows (skeleton_archer
      // minLevel:3), so a floor-2 hallway could roll a floor-3-only monster — the room spawner already
      // gates on minLevel (:4150) and now excludes hallOnly rows from ITS OWN pool; this is that same
      // filter's mirror image (hall pool excludes nothing on nameKey, only respects minLevel).
      const _hallPool = MONSTER_ARCHETYPES.filter(a => !a.minLevel || level >= a.minLevel);
      for (const _ht of _hsTiles){
        if (_rand() >= _hsRate) continue;
        const _hx = _ht[0], _hz = _ht[1];
        if (occ.has(key(_hx, _hz))) continue;
        let _tooClose = false;
        for (const _pp of _hsPlaced){ if (Math.abs(_pp[0] - _hx) + Math.abs(_pp[1] - _hz) < _hsGap){ _tooClose = true; break; } }
        if (_tooClose) continue;
        occ.add(key(_hx, _hz)); _hsPlaced.push([_hx, _hz]);
        const _ha = _hallPool[(_rand() * _hallPool.length) | 0];
        // hpFlat was already read by the ROOM spawner (~:4145) but silently ignored here — zombie's [REF#DG-02081]
        // hpFlat:22 (and now ant/bat's) would have drawn full level-curve HP whenever rolled into a
        // hallway spawn. Same fallback shape as the room spawner: ghost 10 · flat archetypes their own
        // number · everyone else the level curve.
        const _hhp = _ha.isGhost ? 10 : Math.round((typeof _ha.hpFlat === 'number' ? _ha.hpFlat : hp) * (typeof _ha.hpMul === 'number' ? _ha.hpMul : 1));   // hpMul: see the room spawner's note [REF#PENDING] [REF#DG-02091]
        // noFlee/meleeOnly used to be hardcoded to `isGhost` only, so any OTHER archetype's own explicit [REF#DG-02082]
        // flags (zombie's noFlee/meleeOnly, and now ant's) were silently dropped on a hallway roll. Now
        // the exact same expressions the room push already uses (:4176-4177) — meleeOnly's `typeof ===
        // 'boolean'` check matters the moment a ghost-flagged row ever sets meleeOnly:false explicitly,
        // which `|| _ha.isGhost` would silently override; today's table has no such row, so this is a
        // shape match, not a behaviour change. isZombie/isSkeleton/isSkeletonArcher are copied too, for
        // the same reason — the room push already carries them and the engine's model dispatch keys
        // those bodies by flag (Engine9 :51796/:51807/:51814), so a hall-rolled zombie/skeleton with no
        // flag would have drawn a goblin body.
        mobs.push({ id: 'hall-mob-' + (ctr++), nameKey: _ha.nameKey, name: _ha.name || (_ha.isGhost ? 'Hungry Ghost' : 'Yakuza Goblin'), type: 'monster', x: _hx, z: _hz, hp: _hhp, maxHp: _hhp, isHostile: true, isImp: !!_ha.isImp, isGhost: !!_ha.isGhost, isMummy: !!_ha.isMummy, isZombie: !!_ha.isZombie, isOrc: !!_ha.isOrc, isSkeleton: !!_ha.isSkeleton, isSkeletonArcher: !!_ha.isSkeletonArcher, ghostAlpha: _ha.isGhost ? 0.7 : undefined, noFlee: !!(_ha.isGhost || _ha.noFlee), meleeOnly: (typeof _ha.meleeOnly === 'boolean' ? _ha.meleeOnly : !!_ha.isGhost), vulnerability: _ha.vuln });
      }
    }
    // ── BATS PER SECTION, FLOORS 2+ (2026-09-18, order relayed via d1, verbatim: "add bats to the [REF#DG-02083]
    //    sections, they are more common, random 1-2 bats always 50/50") — plans/CODER2_TASK_011_bats_per_section.md.
    //    GUARANTEED placement, independent of the hallway roll above (which stays a rotation entry for
    //    ants): every section 1-3 gets 1 or 2 bats, decided by one fair coin per section drawn from its
    //    OWN independent seeded stream — the `dealSectionSpecials(seed, level)` idiom (Creator.js:2612,
    //    called at :2158): `seed ^ 0xBA75 ^ level`, a private mulberry32 that draws NOTHING from `_rand()`
    //    so an existing seed's layout (every id, every rect) cannot shift. Floor 1 is Section0.js's own
    //    placer (same shape, no hall:true tiles there — it uses hallway-kind ROOM records instead).
    //    ⛔ That default INVERTED 2026-09-18 — see the SUPERSEDED note directly below. Bats are OFF;
    //       window._batsPerSection = true is what turns this placer back on.
    // ⛔ SUPERSEDED 2026-09-18 by Mark: "remove bats from map generation" — the guaranteed bat placer
    //    is OFF BY DEFAULT. The 2026-09-17 order it served ("two new monsters to hallway spawns - ant and
    //    bat") is retired for the BAT half only; the ant placer is untouched.
    //    ⚠ THE ARCHETYPE ROWS ALONE WERE NOT ENOUGH, which is the whole reason this block is edited too.
    //      This placer is GUARANTEED and independent of the hallway archetype roll — commenting the three
    //      BAT rows out of MONSTER_ARCHETYPES would have removed bats from the ROTATION while this code
    //      kept placing 1-2 per section every single run. Grep both the pool AND the dedicated placers.
    //    Default flipped rather than the block deleted: the seeded coin draws from its OWN private stream,
    //    so turning it off cannot shift any existing seed's layout, and turning it back on restores the
    //    exact same placement. window._batsPerSection = true restores.
    if (typeof window !== 'undefined' && window._batsPerSection === true) {
      const _batArch = MONSTER_ARCHETYPES.find(a => a.nameKey === 'bat');
      const _batHp = (typeof _batArch?.hpFlat === 'number') ? _batArch.hpFlat : hp;
      let _bh = (((_mapSeedVal >>> 0) || 0x12345678) ^ 0xBA75 ^ (((level | 0) + 1) * 0x9E3779B1)) >>> 0;
      _bh = (_bh ^ 0x5bf03635) >>> 0;
      const _batCoin = () => { _bh = (_bh + 0x6D2B79F5) >>> 0; let t = _bh; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const _bpsGap = (typeof window !== 'undefined' && typeof window._hallMinGap === 'number') ? window._hallMinGap : 4;
      const _isFloorTileBps = (x, z) => { const c = map[x] && map[x][z]; return !!c && c.type === 'floor'; };
      const _isHallPinchBps = (x, z) => (!_isFloorTileBps(x - 1, z) && !_isFloorTileBps(x + 1, z)) || (!_isFloorTileBps(x, z - 1) && !_isFloorTileBps(x, z + 1));
      // ENTRY SAFE ZONE (2026-09-18, TASK 011 tester order 017 Finding A follow-up): the sibling hallway [REF#DG-02084]
      // spawner above excludes any hall tile within 8 tiles of the arrival stairs (same reason as its own
      // comment — a body born at the mouth of the entry chamber). This placer never had that guard, so a
      // bat could land inside Engine9's post-generation box cull (~:9864, spawn-relative rectangle) and
      // be silently stripped after generation — invisible to a node-only probe that never runs that stage.
      // Not confirmed as tonight's exact cause (0 collisions found across a 500+1800-seed sweep, floors
      // 2-4), but a real, cheap-to-close gap regardless of whether it is. Knob shared with the hall
      // spawner: window._entryRoomSpawns=true restores.
      let _upTBps = null;
      if (window._entryRoomSpawns !== true){ for (let _x = 0; _x < map.length && !_upTBps; _x++){ const _col = map[_x]; if (!_col) continue; for (let _z = 0; _z < _col.length; _z++){ const _t = _col[_z]; if (_t && (_t.type === 'stairs_up' || _t.type === 'stairs_up_r')){ _upTBps = [_x, _z]; break; } } } }
      const _bpsPlaced = [];
      for (const _sec of [1, 2, 3]) {
        const _coin = _batCoin();                                       // drawn AFTER all layout draws, one per section, in order [REF#DG-BATS01] [REF#DG-02085]
        const _wantN = (_coin < 0.5) ? 1 : 2;
        const _tiles = [];
        for (let _x = 0; _x < map.length; _x++) { const _col = map[_x]; if (!_col) continue; for (let _z = 0; _z < _col.length; _z++) { const _t = _col[_z]; if (_t && _t.hall === true && _t.type === 'floor' && _t.segmentId === _sec && !occ.has(key(_x, _z)) && !_isHallPinchBps(_x, _z)) { if (_upTBps && (Math.abs(_x - _upTBps[0]) + Math.abs(_z - _upTBps[1])) < 8) continue; _tiles.push([_x, _z]); } } }
        _tiles.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
        let _n = 0;
        for (const _t of _tiles) {
          if (_n >= _wantN) break;
          if (occ.has(key(_t[0], _t[1]))) continue;
          let _tooClose = false;
          for (const _p of _bpsPlaced) { if (Math.abs(_p[0] - _t[0]) + Math.abs(_p[1] - _t[1]) < _bpsGap) { _tooClose = true; break; } }
          if (_tooClose) continue;
          occ.add(key(_t[0], _t[1])); _bpsPlaced.push(_t); _n++;
          mobs.push({ id: 'bat-' + _sec + '-' + _n, nameKey: 'bat', name: 'Bat', type: 'monster', x: _t[0], z: _t[1], hp: _batHp, maxHp: _batHp, isHostile: true, meleeOnly: true, vulnerability: _batArch?.vuln });
        }
      }
    }
    if (casinoId >= 0) {                                                 // casino supervisor (10×HP) + 4 imps (0.6×HP) [REF#DG-00500]
      const cr = rooms_out[casinoId]; const sc = pick(interior(cr)) || [cr.cx, cr.cz]; occ.add(key(sc[0], sc[1]));
      mobs.push({ id: 'boss-supervisor-L' + level + '-' + (ctr++), nameKey: 'yakuza_supervisor', name: 'Yakuza Level Supervisor', type: 'monster', x: sc[0], z: sc[1], hp: hp * 10, maxHp: hp * 10, isHostile: true, isSupervisor: true, dropsLevelKey: true, keyId: 'LEVEL-KEY-L' + level, vulnerability: VULN_SUPER });
      const ih = Math.round(hp * 0.6); for (let i = 0; i < 4; i++) { const c = pick(interior(cr)); if (!c) break; occ.add(key(c[0], c[1])); mobs.push({ id: 'imp-L' + level + '-' + (ctr++), nameKey: 'yakuza_imp', name: 'Yakuza Imp', type: 'monster', x: c[0], z: c[1], hp: ih, maxHp: ih, isHostile: true, isImp: true, vulnerability: VULN_IMP }); }
    }
    const throne = rooms_out.find(r => r.isOniBaba);                     // L7 Oni-Baba boss (6×HP) [REF#DG-00501]
    if (throne) { const bh = hp * 6; mobs.push({ id: 'boss-throne-' + (ctr++), nameKey: 'oni_baba', name: 'Oni-Baba, the Dragon Princess', type: 'monster', x: throne.cx, z: throne.cz, hp: bh, maxHp: bh, isHostile: true, isBoss: true, vulnerability: VULN_BOSS }); }
    const pool = []; for (const r of rooms_out) { if (r.id === 0 || r.isCabaret || r.isCasino || r.isOniBaba || r.isStore) continue; if (r.section === 'entry' && window._entryRoomSpawns !== true) continue; for (const c of interior(r)) pool.push(c); }   // entry chamber stays flintlock-free too (Mark 2026-07-26) [REF#DG-00502]
    for (let i = pool.length - 1; i > 0; i--) { const j = (_rand() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }   // seeded Fisher-Yates [REF#DG-00503]
    const _flintCap = (global && global._workerHalls) ? 0 : ((level === 1) ? ((typeof window !== 'undefined' && typeof window._l1FlintlockCap === 'number') ? window._l1FlintlockCap : 2) : 7);   // WORKER HALLS: no scattered ranged imps in the cells (keep the strict 1-occupant-per-room rule). Mark 2026-06-28: keep Floor 1 sparse (~2 ranged "flintlock gangster" imps) so the 75/20/5 per-room rule holds; L2-7 unchanged. Knob: window._l1FlintlockCap. [REF#DG-00504]
    const ih = Math.round(hp * 0.5); let fi = 0; for (const c of pool) { if (fi >= _flintCap) break; if (occ.has(key(c[0], c[1]))) continue; occ.add(key(c[0], c[1])); mobs.push({ id: 'flintlock-imp-L' + level + '-' + (ctr++), nameKey: 'yakuza_imp', name: 'Yakuza Imp', type: 'monster', x: c[0], z: c[1], hp: ih, maxHp: ih, isHostile: true, isImp: true, hasFlintlock: true, vulnerability: VULN_FLINT }); fi++; }
    // ── SKELETON DEBUT ON FLOOR 1 (Mark 2026-07-26: "lets see 1 [archer] show up in section 2 floor of level 1 [REF#DG-00505]
    //    along with the skeleton guard"). The archetype pool level-gates BOTH skeletons off floor 1 — guard
    //    minLevel 2, archer minLevel 3 (~1116) — so this is a GUARANTEED HAND-PLACEMENT, not a roll: exactly one
    //    Skeleton Guard + one Skeleton Archer in the first ordinary room of the target section. The minLevel gates
    //    are left alone on purpose, so floors 2-7 keep their existing random skeleton rate and this is a single
    //    scripted encounter rather than a floor-1 skeleton infestation.
    //    NO _rand() DRAW ANYWHERE IN HERE — every choice is index-based off already-sorted data. Adding a draw would
    //    shift the seeded RNG stream and silently redraw every floor-1 layout for an existing seed (the same care the
    //    konbini door takes at ~1423, and it matters more now that SAVE regenerates the floor from its seed).
    //    Stats/vulnerabilities are read from MONSTER_ARCHETYPES so they can never drift from the pool entries.
    //    Knobs: window._skelDebut=false (off) · window._skelDebutSegment (default 1) · window._skelDebutLevel (default 1).
    if (typeof window === 'undefined' || window._skelDebut !== false) {
      const _sdLvl = (typeof window !== 'undefined' && typeof window._skelDebutLevel === 'number') ? window._skelDebutLevel : 1;
      const _sdSeg = (typeof window !== 'undefined' && typeof window._skelDebutSegment === 'number') ? window._skelDebutSegment : 1;
      if (level === _sdLvl) {
        const _sdArch = (k) => MONSTER_ARCHETYPES.find(a => a.nameKey === k);
        const _gA = _sdArch('skeleton_guard'), _aA = _sdArch('skeleton_archer');
        const _sdRooms = rooms_out
          .filter(r => r && r.segmentId === _sdSeg && r.id !== 0 && !r.isCabaret && !r.isCasino && !r.isOniBaba && !r.isStore && !(r.section === 'entry' && window._entryRoomSpawns !== true))
          .sort((a, b) => a.id - b.id);
        let _sdRoom = null;
        for (const r of _sdRooms) {
          const cells = interior(r);   // interior() already excludes tiles taken by the passes above [REF#DG-00506]
          if (cells.length < 2) continue;
          cells.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);   // deterministic order — no _rand() [REF#DG-00507]
          // Guard at one end of the room, archer at the far end: the archer needs standoff distance to use its [REF#DG-00508]
          // ranged kite (it rides the imp ranged path, _spawnSkeletonArrow ~38592), and the guard reads as the
          // thing that closes on you while it shoots.
          const gc = cells[0], ac = cells[cells.length - 1];
          const _gHp = (typeof _gA?.hpFlat === 'number') ? _gA.hpFlat : hp;
          const _aHp = (typeof _aA?.hpFlat === 'number') ? _aA.hpFlat : hp;
          occ.add(key(gc[0], gc[1]));
          mobs.push({ id: 'skel-debut-guard-L' + level + '-' + (ctr++), nameKey: 'skeleton_guard', name: 'Skeleton Guard', type: 'monster',
            x: gc[0], z: gc[1], hp: _gHp, maxHp: _gHp, isHostile: true, isSkeleton: true, meleeOnly: true, vulnerability: _gA?.vuln });
          occ.add(key(ac[0], ac[1]));
          mobs.push({ id: 'skel-debut-archer-L' + level + '-' + (ctr++), nameKey: 'skeleton_archer', name: 'Skeleton Archer', type: 'monster',
            x: ac[0], z: ac[1], hp: _aHp, maxHp: _aHp, isHostile: true, isSkeletonArcher: true, meleeOnly: false, vulnerability: _aA?.vuln });
          _sdRoom = r; break;
        }
        try {
          if (_sdRoom) console.log('[SKEL-DEBUT] Skeleton Guard + Skeleton Archer placed in room ' + _sdRoom.id + ' ("' + (_sdRoom.roomNameEn || '?') + '") of segment ' + _sdSeg + ' on floor ' + level + '. Knobs: window._skelDebutSegment / _skelDebutLevel / _skelDebut=false.');
          else console.warn('[SKEL-DEBUT] no eligible room in segment ' + _sdSeg + ' on floor ' + level + ' — nothing placed. Segments present: [' + [...new Set(rooms_out.filter(Boolean).map(r => r.segmentId))].sort((a,b) => a-b).join(',') + ']');
        } catch(_){}
      }
    }
    // ── HALLWAY PATROL PAIRS (Mark 2026-07-27: "add more random hallway monsters - the skeleton guard and [REF#DG-00509]
    //    skeleto archer, add those pair to each section, they patrol from one side, turn around and walk to
    //    entire end, turn around, in each section, they do not respawn once dead") ───────────────────────────
    //    One guard+archer pair PER SEGMENT, spawned NEUTRAL (they patrol; normal sight-aggro flips them —
    //    which now barks FOUND only on genuine spotting, per the same-day SFX fix). The PATROL ROUTE is
    //    derived ENGINE-SIDE from live hall tiles (the 'skel-patrol-' id prefix is the contract — see the
    //    HALL PATROL driver in Engine9 loop()); here we only place them, debut-style: deterministic
    //    index-based cells, NO _rand() draw anywhere (the seeded-stream rule above applies double now that
    //    SAVE regenerates floors from seed). No respawn machinery is ever attached — dead stays dead by
    //    construction. Off: window._skelPatrols = false.
    if (typeof window === 'undefined' || window._skelPatrols !== false) {
      const _spG = MONSTER_ARCHETYPES.find(a => a.nameKey === 'skeleton_guard');
      const _spA = MONSTER_ARCHETYPES.find(a => a.nameKey === 'skeleton_archer');
      const _spSegs = [...new Set(rooms_out.filter(Boolean).map(r => r.segmentId))].sort((a, b) => a - b);
      const _spPlaced = [];
      // PAIRS PER SECTION SCALE WITH DEPTH (Mark 2026-09-11 "guard room … get better each level", A3b GO 09-12): [REF#DG-02029]
      // floor 1 keeps its one pair; floors 2+ deal S0_TIERS[floor].patrols pairs per section, one pair per room.
      const _spPairs = (level >= 2) ? Math.max(1, _s0Tier(level).patrols | 0) : 1;
      for (const _seg of _spSegs) {
        // THE PATROL IS BORN IN THE WING'S SPECIAL ROOM (Mark 2026-09-20: "all guard patrols start in the special room start [REF#DG-02111]
        // locations and then go up to section 0 2-tile doors and turn back around"): the special room sorts first; the
        // engine's route (hall extremes of the wing) already runs from that end to the section-0 door and back.
        const _rs = rooms_out
          .filter(r => r && r.segmentId === _seg && r.id !== 0 && !r.isCabaret && !r.isCasino && !r.isOniBaba && !r.isStore && r._headGuard !== true)   // the head 番所 (segment 4) has no hall to patrol — its roster is the Gate Ogre + the tiered garrison below (2026-09-12) [REF#DG-02030]
          .sort((a, b) => ((b.isSpecialRoom || b.isSectionSpecial) ? 1 : 0) - ((a.isSpecialRoom || a.isSectionSpecial) ? 1 : 0) || a.id - b.id);
        let _segPairs = 0;
        for (const r of _rs) {
          if (_segPairs >= _spPairs) break;
          const cells = interior(r).filter(c => !occ.has(key(c[0], c[1])));
          if (cells.length < 2) continue;
          cells.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
          // KEEP THE SPECIAL-ROOM DOOR LANE OPEN (Mark 2026-10-16): the first [REF#DG-02321]
          // interior cell can put the patrol guard directly in the doorway's line.
          // If so, shift him exactly one tile sideways; the door and its straight
          // entry lane stay clear without changing the patrol route or room roster.
          const _doorTiles = [];
          for (let x = r.x; x < r.x + r.w; x++) for (let z = r.y; z < r.y + r.h; z++) {
            if (x !== r.x && x !== r.x + r.w - 1 && z !== r.y && z !== r.y + r.h - 1) continue;
            const t = map[x] && map[x][z]; if (t && (t.type === 'shoji_door' || t.type === 'door')) _doorTiles.push([x, z]);
          }
          const _gc0 = cells[0]; let gc = _gc0;
          if (_doorTiles.length) {
            const [dxr, dzr] = _doorTiles[0];
            const _northSouth = dzr === r.y || dzr === r.y + r.h - 1;
            const _sideOffset = c => _northSouth ? Math.abs(c[0] - dxr) : Math.abs(c[1] - dzr);
            if (_sideOffset(gc) === 0) {
              const _flank = cells.find(c => Math.abs(c[0] - gc[0]) + Math.abs(c[1] - gc[1]) === 1 && _sideOffset(c) === 1);
              if (_flank) gc = _flank;
            }
          }
          const ac = cells.filter(c => c[0] !== gc[0] || c[1] !== gc[1]).slice(-1)[0];
          const _gHp = (typeof _spG?.hpFlat === 'number') ? _spG.hpFlat : hp;
          const _aHp = (typeof _spA?.hpFlat === 'number') ? _spA.hpFlat : hp;
          occ.add(key(gc[0], gc[1]));
          mobs.push({ id: 'skel-patrol-guard-L' + level + '-s' + _seg + '-' + (ctr++), nameKey: 'skeleton_guard', name: 'Skeleton Guard', type: 'monster',
            x: gc[0], z: gc[1], hp: _gHp, maxHp: _gHp, isHostile: false, isSkeleton: true, meleeOnly: true, vulnerability: _spG?.vuln });
          occ.add(key(ac[0], ac[1]));
          mobs.push({ id: 'skel-patrol-archer-L' + level + '-s' + _seg + '-' + (ctr++), nameKey: 'skeleton_archer', name: 'Skeleton Archer', type: 'monster',
            x: ac[0], z: ac[1], hp: _aHp, maxHp: _aHp, isHostile: false, isSkeletonArcher: true, meleeOnly: false, vulnerability: _spA?.vuln });
          _spPlaced.push(_seg); _segPairs++;
        }
      }
      try { console.log('[SKEL-PATROL] guard+archer pair queued in segment(s) [' + _spPlaced.join(',') + '] — they walk their section hall end-to-end (engine HALL PATROL driver); dead stays dead. Off: window._skelPatrols=false'); } catch(_){}
    }
    // ══ THE HEART IS NOT A SPAWN ZONE — A SWEEP, NOT A POLITE REQUEST (Mark 2026-08-03) ═════════════ [REF#DG-00510]
    //    "lets not put any workers in section 0 ok? that is starlettes dressing room and manager office
    //     only. get rid of the extra bedroom if you dont listen. that was players room but since you put
    //     2 monsters in there, I think youd do the same again. you dont listen"
    //
    //    HE IS RIGHT, AND ASKING EACH SPAWNER NICELY IS WHY. Two of them ignored section 0 while the
    //    per-room loop was correctly skipping it, so the rule LOOKED enforced and was not. Measured over
    //    three seeds before this sweep existed — 10 to 11 monsters in the heart on EVERY seed:
    //      · `hall-mob-*`      — spawns on hall tiles, and the ring + the wing hall ARE section-0 halls
    //      · `skel-patrol-*-s0-*` — a skeleton patrol explicitly tagged s0, two of them standing in
    //                            Starlette's 楽屋 on every single seed
    //    So this is deliberately a FINAL SWEEP over the finished list rather than a fourth per-spawner
    //    guard: a guard has to be remembered by every spawner ever added, and the evidence is that it
    //    won't be. Nothing reaches the engine that this has not seen.
    //
    //    WHAT SURVIVES: the cabaret's own audience (`cabAudience` — the greeter imp and goblin, part of
    //    the treasured scene and already withheld while the room is dormant) and non-monster entries,
    //    so the starter loot cards in room 0 are untouched. Everything else that is a MONSTER standing
    //    on a segment-0 tile is removed. Escape hatch: window._heartSpawnsAllowed = true.
    if (!(global && global._heartSpawnsAllowed === true)) {
      const _before = mobs.length;
      const _culled = [];
      for (let i = mobs.length - 1; i >= 0; i--) {
        const m = mobs[i];
        if (!m || m.type !== 'monster' || m.cabAudience) continue;
        const t = map[m.x] && map[m.x][m.z];
        if (!t || t.segmentId !== 0) continue;
        _culled.push(m.id + '@(' + m.x + ',' + m.z + ')');
        mobs.splice(i, 1);
      }
      if (_culled.length) try { console.log('[MAP] heart kept clear — ' + _culled.length + ' of ' + _before
        + ' spawn(s) removed from section 0: ' + _culled.join(' ')
        + '  (Off: window._heartSpawnsAllowed=true)'); } catch (_) {}
    }
    // ── NOBODY'S ROOM GETS A SLEEPER (Mark 2026-09-16: "try to ensure that most all rooms have a monster / worker on the [REF#DG-02074]
    //    first few floors so theres not endless searching for one"). MEASURED before this pass over 5 seeds each: floor 2 had
    //    6 empty rooms of 105 (the konbini ×5 — the engine seats its shopkeeper — and one entrance hall), floor 3 had 10 of 105
    //    (konbini ×5, entrance ×1, plain rooms ×4), floor 4 had 11 of 116 (entrance ×5, konbini ×5, plain room ×1). So the
    //    gap is the odd plain room the per-room loop rolled empty. Every room that is not the entrance, the cabaret/casino,
    //    the throne, the konbini or a guard room and has no monster on its tiles gets ONE worker asleep on its interior tile
    //    farthest from the doors — goblin, imp, mummy in turn, index-based (no _rand() draw, so existing seeds keep their
    //    layout). Runs AFTER the heart sweep above on purpose: the 08-03 sweep keeps awake patrols and hall mobs out of
    //    section 0, and it also emptied the approach's plain rooms (measured: `mob-20-39` culled on L3 seed 12345) — under
    //    the 09-16 order those rooms get a SLEEPER, which is asleep and not hostile, so the calm start the sweep protects is
    //    kept (⛔ SUPERSEDED 2026-09-16 for section-0 ROOMS only; halls stay clear). Floors 1-4 by default (Mark's "first
    //    few"). Knobs: window._fillEmptyRoomsMaxLevel (4) · off: window._fillEmptyRooms = false.
    if ((typeof window === 'undefined' || window._fillEmptyRooms !== false)
        && level <= ((typeof window !== 'undefined' && typeof window._fillEmptyRoomsMaxLevel === 'number') ? window._fillEmptyRoomsMaxLevel : 4)) {
      const _occRoom = new Set();
      for (const m of mobs) { if (!m || m.type !== 'monster') continue; const t = map[m.x] && map[m.x][m.z]; if (t && t.roomId >= 0) _occRoom.add(t.roomId); }
      const _FILL = ['yakuza_goblin', 'yakuza_imp', 'yakuza_mummy'].map(k => MONSTER_ARCHETYPES.find(a => a.nameKey === k)).filter(Boolean);
      let _fi = 0; const _filled = [];
      for (const r of rooms_out) {
        if (!r || r.id === 0 || r.isEntranceHall || r.isCabaret || r.isCasino || r.isOniBaba || r.isStore || r.isGuardRoom || r._headGuard) continue;
        if (r.roomType === 'hallway' || r.kind === 'hallway') continue;
        // Starlette's dressing room and the Manager's office are private rooms, never a worker's (the 2026-08-12 note at the [REF#DG-02240]
        // per-room loop above); floor 1 leaves both empty. The 10-01 backstage carve and the hub both bring them here.
        if (r.isDressingRoom || r.isManagerOffice) continue;
        if (_occRoom.has(r.id) || (r.w - 2) * (r.h - 2) < 2) continue;
        const doors = [];
        for (let x = r.x; x < r.x + r.w; x++) for (const z of [r.y, r.y + r.h - 1]) { const t = map[x] && map[x][z]; if (t && /door|floor/.test(String(t.type))) doors.push([x, z]); }
        for (let z = r.y; z < r.y + r.h; z++) for (const x of [r.x, r.x + r.w - 1]) { const t = map[x] && map[x][z]; if (t && /door|floor/.test(String(t.type))) doors.push([x, z]); }
        let at = null, best = -1;
        for (const c of interior(r)) { const d = doors.length ? Math.min(...doors.map(D => Math.abs(D[0] - c[0]) + Math.abs(D[1] - c[1]))) : 0; if (d > best) { best = d; at = c; } }
        if (!at) continue;
        const A = _FILL[_fi++ % _FILL.length]; occ.add(key(at[0], at[1]));
        mobs.push({ id: 'fill-sleeper-L' + level + '-' + r.id, nameKey: A.nameKey, name: (r.roomNameEn || 'Room') + ' Worker', type: 'monster',
          x: at[0], z: at[1], hp, maxHp: hp, isHostile: false, isMummy: A.nameKey === 'yakuza_mummy' || undefined, vulnerability: A.vuln });
        _filled.push(r.id + ':' + (r.roomNameEn || r.roomType) + '@' + at[0] + ',' + at[1]);
      }
      if (_filled.length) try { console.log('[FILL] nobody\'s room gets a sleeper — L' + level + ' ' + _filled.length + ' placed: ' + _filled.join(' · ') + '. Off: _fillEmptyRooms=false'); } catch (_) {}
    }
    return mobs;
  }

  // ── ENGINE-CONTRACT ADAPTER: compact grid → 128×128 { type, roomId } + rooms + spawn + stairs + mobSpawns ── [REF#DG-00511]
  // Mirrors MapGen.generateDungeonMap's return contract and adds streamed `gates` + `segments` metadata.
  function generateDungeonMap(level, MAP_W, MAP_H) {
    level = level || 2; MAP_W = MAP_W || 128; MAP_H = MAP_H || 128;
    _genLevel = level;   // drives the per-level HEAD in buildDungeon (Floor 1 = 6×6 cabaret + start-hallway landing) [REF#DG-00512]
    const built = genCompact(); if (!built) throw new Error('DungeonChain: generation failed after retries');
    const Tc = built.T, crooms = built.rooms, mh = built.mhTiles, casinoRoom = built.casino, hop = built.hop;
    const maxHop = (hop && hop.get(casinoRoom)) || 1;   // deepest tree-hop (the casino) → section banding [REF#DG-00513]
    const OX = (MAP_W - GW) >> 1, OY = (MAP_H - GH) >> 1;   // centre the compact grid inside the engine map [REF#DG-00514]

    // FINAL engine room ids: landing = 0, cabaret = 1, then dungeon/casino/throne in order (contiguous 0..N) [REF#DG-00515]
    // THE HUB (floors 2-7): the core's rooms take ids 0..N-1 in HUB_IDS order (hallway 0, cabaret 1, …),
    // so the wing rooms number on from N and rooms[i].id === i still holds.
    const _hubN = _hubCore ? Object.keys(HUB_IDS).length : 0;
    const cidToFinal = new Array(crooms.length); let nextId = _hubCore ? _hubN : 2;
    crooms.forEach((cr, ci) => { cidToFinal[ci] = cr.type === 'landing' ? 0 : cr.type === 'cabaret' ? 1 : nextId++; });

    let dungK = 0;
    const rooms_out = new Array(crooms.length + _hubN);
    const _specialMetaFor = (type) => {
      try { const C = (typeof Creator !== 'undefined' && Creator) || (global && global.Creator); return (C && C.SPECIAL_ROOM_META && C.SPECIAL_ROOM_META[type]) || null; } catch (_) { return null; }
    };
    // The trio this floor DEALT to sections 1-3 (the table the packers placed from). A room whose tag is [REF#DG-02000]
    // one of them is a SECTION SPECIAL — the wing's landmark, the room its permit wakes, the room that
    // gets an inspector ogre. Stamped as `isSectionSpecial` so consumers can ask that without listing tags.
    const _dealtTags = (() => { try { const t = _specialBuildingTable(); return [1, 2, 3].map(k => t[k]).filter(x => x && x !== 'room'); } catch (_) { return []; } })();
    crooms.forEach((cr, ci) => {
      const fid = cidToFinal[ci], ex = cr.x + OX, ey = cr.y + OY, cw = cr.w >> 1, ch = cr.h >> 1;
      const er = { id: fid, x: ex, y: ey, w: cr.w, h: cr.h, cx: ex + cw, cz: ey + ch, center: { x: ex + cw, y: ey + ch }, roomName: '間', roomNameEn: 'Chamber', roomType: 'room' };
      if (cr.type === 'landing') { er.isEntranceHall = true; er.roomType = 'hallway'; er.roomName = (level === 1) ? '回廊' : '着地の間'; er.roomNameEn = (level === 1) ? 'Main Hall' : 'Landing'; if (level === 1) er.isMainHall = true; }   // Floor-1 landing IS the start hallway → ad posters (engine keys on isMainHall) [REF#DG-00516]
      else if (cr.type === 'cabaret') { er.isCabaret = true; er.roomType = 'cabaret'; er.roomName = 'キャバレー'; er.roomNameEn = 'Cabaret'; }   // engine dresses id 1 (succubus + clerestory) [REF#DG-00517]
      else if (cr.type === 'store') { er.isStore = true; er.roomType = 'store'; er.roomName = 'コンビニ'; er.roomNameEn = 'Konbini'; }   // 7-Eternal store (prototype) — monster-free; engine will dress it later [REF#DG-00518]
      // ⛔ THIS BRANCH USED TO READ `cr.type === 'casino' && level === 7`, AND THAT IS WHY FLOOR 7 [REF#DG-00518]
      //    COULD NOT HAVE A CASINO: the one type string produced the Sanctum, so a second casino room
      //    carved on floor 7 came out as a second throne. The Sanctum now has its own carve type and
      //    the room it describes is unchanged — same flag, same roomType, same names.
      else if (cr.type === 'throne') { er.isOniBaba = true; er.roomType = 'throne'; er.roomName = '鬼婆の聖域'; er.roomNameEn = "Oni-Baba's Sanctum"; }
      else if (cr.type === 'casino') { er.isCasino = true; er.casinoLevel = level; er.roomType = 'casino'; er.roomName = '賭場'; er.roomNameEn = 'Casino'; }
      // SPECIAL EVENT ROOMS (Mark 2026-08-01): the factory floor + the buffet-line cafeteria. Flags are [REF#DG-00519]
      // the engine's future _factoryRoomId/_cafeteriaRoomId stamp targets (RoomPermits FACTORY permit).
      else if (cr.type === 'factory') { er.isFactory = true; er.roomType = 'factory'; er.roomName = '工場'; er.roomNameEn = 'Factory'; }
      else if (cr.type === 'cafeteria') { er.isCafeteria = true; er.roomType = 'cafeteria'; er.roomName = '食堂'; er.roomNameEn = 'Cafeteria'; }
      // ⛔ THE ROOM WAS ALWAYS THERE. `_placeSpecial('storage', …)` has carved a 12x8 with tag [REF#DG-00520]
      //    'storage' in `_buildLHalls` since the three-section ruling, and this adapter had no branch
      //    for it — so `er` was built fresh, fell through to the generic `_roomNames` else, and shipped
      //    as roomType 'room' with a random name. MEASURED, floors 2 and 3, two runs each:
      //    `section-special` reported "section 3 is assigned `storage` … contains no room of that type
      //    (has: room, room, room, room, room, corridor)" while the carve grid had a storage rectangle
      //    sitting in it. The carve was right and the adapter could not see it — the flag never crossed,
      //    which is the exact failure the note below this block already documents for isSpecialRoom.
      //    ⚠ 'Warehouse', not 'Storage' (Mark 2026-09-03: "use warehouse"). Mirrors
      //      `Creator.SPECIAL_ROOM_META.storage` so the two registries cannot disagree.
      else if (cr.type === 'storage') { er.isStorage = true; er.roomType = 'storage'; er.roomName = '倉庫'; er.roomNameEn = 'Warehouse'; }
      // ── EVERY OTHER CATALOGUE BUILDING CROSSES THE ADAPTER (Mark 2026-09-11) ───────────────────────── [REF#DG-02001]
      //    The 09-08 filler catalogue (bathhouse, armory, archery, prison, graveyard, …) and floor 2's own
      //    dealt trio are carved with their tag as `cr.type`, and until this branch existed every one of
      //    them fell through to the generic `_roomNames` else below — MEASURED on floor 2: the armory
      //    shipped as "Water Torture Room", the archery range as "Torture Chamber", the prison as "Stone
      //    Cell", all roomType 'room', no flag, so the engine's own `isBathhouse` placeholder (~Engine9
      //    :19217) never found a room and the permit machinery had nothing to stamp. This is the same
      //    "the flag never crossed the adapter" defect the storage branch above records; it is closed for
      //    the whole registry at once instead of one building per incident. Names come from
      //    `Creator.SPECIAL_ROOM_META`, the one place a building's identity is written.
      else if (_specialMetaFor(cr.type)) {
        const _m = _specialMetaFor(cr.type);
        er[_m.flag] = true; er.roomType = _m.roomType; er.roomName = _m.roomName; er.roomNameEn = _m.roomNameEn;
      }
      // WEST-WING ROOMS carved in compact space by _buildSection0. The flags are the SAME ones the older [REF#DG-00520]
      // post-hoc stamp set (isDressingRoom / isManagerOffice), so anything in the engine already keying on
      // them keeps working whichever path built the wing. isVault is new and deliberately inert: it marks
      // the room the house bank / player storage will attach to, and no storage mechanic is implied here.
      else if (cr.type === 'dressing') { er.isDressingRoom = true; er.roomName = '楽屋'; er.roomNameEn = 'Dressing Room'; }
      else if (cr.type === 'office') { er.isManagerOffice = true; er.roomName = '支配人室'; er.roomNameEn = "Manager's Office"; }
      else if (cr.type === 'vault') { er.isVault = true; er.roomType = 'vault'; er.roomName = '金庫室'; er.roomNameEn = 'Vault'; }
      else if (cr.type === 'quarters') { er.isPlayerQuarters = true; er.roomType = 'quarters'; er.roomName = '自室'; er.roomNameEn = "Player's Quarters"; }
      // THE GUARD ROOM — section 1's check-in post (Mark 2026-08-04). 番所 is the Edo checkpoint guard [REF#DG-00521]
      // station, which is exactly "a check-in area … guards that can protect the dungeon and anyone
      // entering the caberet". isGuardRoom is the hook the engine's guard-NPC work will key on; like
      // isVault it is deliberately inert until that lane lands — no spawns are implied here.
      // ⚠ TWO ROOMS CARVE AS 'guard' NOW AND ONLY ONE MAY BE `isGuardRoom` (2026-08-29). `er` is built
      //   FRESH and copies only NAMED fields — the trap the special-room note below this block already
      //   documents — so `isEmptyGuard`, set on the carve record when the west mirror is cut, evaporated
      //   here and the mirror came out wearing `isGuardRoom` like the real post. MEASURED when it did:
      //   the low-wall block's `rooms_out.find(r => r.isGuardRoom)` then picks whichever of the two the
      //   array happens to hold first, so the ticket-desk run could silently move into the empty room.
      //   The flag must be carried ACROSS the adapter, not merely set before it.
      else if (cr.type === 'guard' && cr.isEmptyGuard === true) { er.isEmptyGuard = true; er.roomType = 'guard'; er.roomName = '番所'; er.roomNameEn = 'GUARDPOST'; }
      else if (cr.type === 'guard') { er.isGuardRoom = true; er.roomType = 'guard'; er.roomName = '番所'; er.roomNameEn = 'GUARDPOST'; }
      else { const nm = _roomNames(level, dungK++); er.roomName = nm.ja; er.roomNameEn = nm.en; }
      if (cr._headGuard === true) er._headGuard = true;   // carried ACROSS the adapter — er is built fresh (the isEmptyGuard trap above), and 'guard' resolves through SPECIAL_ROOM_META, not the branch below it [REF#DG-02019]
      // RING (Phase G1): carry the 1..4 section index from the compact room (additive; coexists with section/depthHops below) [REF#DG-00522]
      // ⚠ FALLING BACK TO `segmentId` — MEASURED 2026-09-02, AND THE FLOOR WAS "SECTION-LESS" WITHOUT IT.
      //   On floor 2, `sectionIndex` was **undefined on all 22 room records** while `segmentId` read
      //   0-4 and matched the tile-derived address exactly (8/4/4/3/3). Only the RING packer sets
      //   `sectionIndex`; the chain packer that actually ships sets `segmentId`. So every consumer
      //   reading the RECORD saw no sections at all on a floor whose tiles have five — the engine's
      //   own worker-icon pass logged "0 spot(s) on a section-less floor (no rooms in sections 1-4)".
      //   The two fields are the same quantity written by two packers under two names; this makes the
      //   record agree with the address instead of leaving section-aware features dark.
      //   Off: window._sectionIndexFromSegment = false (restores record-only, the section-less behaviour).
      if (_dealtTags.indexOf(cr.type) >= 0 && cr._special === cr.type) er.isSectionSpecial = true;   // see `_dealtTags` above [REF#DG-02002]
      // ── AN AUTHORED FOOTPRINT SAYS SO (2026-09-11) ──────────────────────────────────────────────────── [REF#DG-02004]
      //    Creator's `room-shape` rule grades RNG rooms against the RoomShapes catalogue (Mark 2026-08-22:
      //    "those are the only legal footprints") and skips a room whose record says `special: true` — "a
      //    HUMAN chose this footprint on purpose" (Creator.js createRoom). Nothing set it, so MEASURED on
      //    floors 2-3, 40 of 40 seeds: every failure was an authored carve — the L2+ cabaret head (12x10,
      //    Mark 2026-07-02), the dealt buildings on their Creator.SPECIAL_SIZES ladders, the fillers on
      //    Mark's 09-08 ladders, and a factory the demote pass retyped to `room` at its authored 18x18. The
      //    packer's own rooms (placeAlong / the cells) carry no `_special` and stay graded.
      if (cr._special || cr.type === 'cabaret' || cr.type === 'landing' || cr.type === 'store' || cr._headGuard === true) er.special = true;   // + the head 番所: its footprint is S0_TIERS' (Mark's floor law), not the catalogue's — MEASURED live floor 3: 5x10 rejected by room-shape (2026-09-12) [REF#DG-02031]
      if (cr.sectionIndex !== undefined) er.sectionIndex = cr.sectionIndex;
      else if (Number.isInteger(cr.segmentId)
               && (typeof global === 'undefined' || global._sectionIndexFromSegment !== false)) {
        er.sectionIndex = cr.segmentId;
      }
      // ── THE SPECIAL ROOM SURVIVES THE ADAPTER (Mark 2026-08-03: "1 special room 2x as big"). [REF#DG-00523]
      //    `er` is built FRESH here and copies only named fields, so a flag set on the compact room in
      //    packBox reached this line and evaporated. Measured before this line existed: 240 rooms of
      //    area 50 were carved and every one of them was reported as a NORMAL room, because the flag
      //    never crossed the adapter. Anything packBox marks must be copied here explicitly.
      if (cr.isSpecialRoom) {
        er.isSpecialRoom = true;
        // ⚠ DO NOT OVERWRITE AN AUTHORED BUILDING. This branch runs AFTER the type branches above, so [REF#DG-00524]
        // a blanket rename turned section 1's factory into a room flagged isFactory but named 大広間
        // with roomType 'special' — the dresser still found it by flag, but every player-facing label
        // and every roomType consumer saw a generic hall. A special room is a SIZE, not an identity:
        // it only supplies a name when the carve did not already have one.
        if (er.roomType === 'room') {
          er.roomType = 'special';
          // ── ONE GREAT HALL PER FLOOR, NOT TWO (Mark 2026-08-13: "why are there 2 great halls? [REF#DG-00525]
          //    should be just 1") ────────────────────────────────────────────────────────────────
          //    SPECIAL_BUILDING (~:1483) authors a building for sections 1 and 2 only — {1:'cafeteria',
          //    2:'factory', 3:'room', 4:'room'} — so sections 3 AND 4 both carve as the generic 'room'
          //    and both fell into this one branch, printing 大広間 twice on every floor. Measured across
          //    two boots: Great Halls at segments 3 and 4, every time. Not a seed fluke.
          //    ⚠ FIXED AT THE DISPLAY LAYER ON PURPOSE. The note above SPECIAL_BUILDING warns that
          //    naming section 4 there "would fight the casino placer for the same slot" — that warning
          //    is about the CARVE TYPE, which decides what gets built. This only sets the label, so the
          //    carve stays 'room' and the placer is untouched. Do not "tidy" this into SPECIAL_BUILDING.
          //    WHICH ONE KEEPS THE NAME: section 3, because it is the one explicitly waiting for its
          //    building (catalog: SLEEPING_WARD, no 'ward' carve type exists yet) and the same note says
          //    it "stays a Great Hall until the type exists". Section 4 is the fight-to-descend arena —
          //    the supervisor's boss room and where the stairs sit — so it is named for what it already
          //    IS. No new lore, no invented building: the room is described, not redesigned.
          //    ⚠ SOURCE OF THE "section 4 = stairs" CLAIM: the SPECIAL_BUILDING comment, NOT a live
          //    measurement — my probe could not resolve the supervisor's room id headlessly. If a floor
          //    ever puts the stairs elsewhere, this label follows the SECTION, not the stairs.
          //    Off: global._stairHallName = false → both revert to Great Hall (the 2-hall behaviour).
          const _seg = Number.isInteger(cr.segmentId) ? cr.segmentId
                     : (Number.isInteger(cr.sectionIndex) ? cr.sectionIndex : 0);
          if (_seg === 4 && global._stairHallName !== false) {
            er.roomName = '階段の間'; er.roomNameEn = 'Stairway Hall';
          } else if (global._barracks !== false) {
            // ── THE BARRACKS (Mark 2026-08-13: "rename it barracks. it should house 6 workers and [REF#DG-00526]
            //    1 guard. all sleeping.") ──────────────────────────────────────────────────────────
            //    This IS the building section 3 was waiting for. The SPECIAL_BUILDING note (~:1483)
            //    said it "awaits its building (catalog: SLEEPING_WARD) … it stays a Great Hall until
            //    the type exists" and refused to invent a substitute — Mark has now named it, so the
            //    placeholder is retired rather than guessed at. A sleeping ward IS a barracks.
            //    `isBarracks` is the hook the roster block downstream keys on; the room stays
            //    roomType 'special' so every existing special-room consumer is unaffected.
            //    Off: global._barracks = false → back to Great Hall, no roster.
            er.roomName = '兵舎'; er.roomNameEn = 'Barracks';
            er.isBarracks = true;
          } else {
            er.roomName = '大広間'; er.roomNameEn = 'Great Hall';
          }
        }
      }
      er.segmentId = (cr.type === 'cabaret' || cr.type === 'landing' || cr.type === 'store') ? 0
        : (Number.isInteger(cr.segmentId) ? cr.segmentId : (Number.isInteger(cr.sectionIndex) ? cr.sectionIndex : 1));
      // ⚠ AND `sectionIndex` FOLLOWS IT, WHICH IS WHAT CLOSES `section-index-parity` FOR THE HEAD. [REF#DG-00522]
      //   The block above sets `sectionIndex` only when the CARVE record carried a section, and the
      //   head rooms are carved before the packer runs so they carry none. MEASURED 2026-09-03,
      //   floor 2 seed 11: exactly three records had no `sectionIndex` — the landing, the cabaret
      //   and the konbini — while the line above had just pinned all three to segment 0. Every
      //   consumer that reads `sectionIndex` therefore saw the entrance, the cabaret and the shop as
      //   belonging to no section at all, on a floor whose tiles place them in section 0.
      //   This runs AFTER `er.segmentId` on purpose: the two must agree, and `segmentId` is the one
      //   with the authoritative answer by this point.
      if (er.sectionIndex === undefined || er.sectionIndex === null) er.sectionIndex = er.segmentId;
      // SECTION ranking by graph-distance (additive — 0 RNG draws; feeds Phase-3 content/loot biasing + room flavor) [REF#DG-00527]
      const _h = (hop && hop.has(cr)) ? hop.get(cr) : undefined;
      er.depthHops = (_h === undefined) ? 0 : _h;
      if (cr.type === 'cabaret' || cr.type === 'landing') er.section = 'entry';
      else if (cr.type === 'casino') er.section = 'casino';
      else if (cr.type === 'throne') er.section = 'deep';   // the Sanctum is the far end, by construction [REF#DG-00527]
      else if (_h === undefined || _h === 0) er.section = 'entry';
      else if (_h <= maxHop / 3) er.section = 'approach';
      else if (_h <= (2 * maxHop) / 3) er.section = 'mid';
      else er.section = 'deep';
      rooms_out[fid] = er;
    });
    // ⛔ THIS READ `level === 7 ? -1 : …`, WHICH SUPPRESSED THE CASINO SUPERVISOR ON FLOOR 7 — [REF#DG-00500]
    //    correct while floor 7 had no casino, wrong the moment it got one. It could NOT be fixed by
    //    dropping the level test either: `casinoRoom` is the builder's DEEPEST room, which on floor 7
    //    is now the Sanctum, so that would put the casino supervisor on Oni-Baba's throne.
    //    ⛔⛔ AND IT COULD NOT BE FIXED BY RESOLVING PURELY BY TYPE, WHICH I TRIED AND MEASURED:
    //      `DungeonChain: no stairs_down on level 2`, thrown by the contract assert. `casinoId` is
    //      NOT only the casino — `_descentId` falls back to it when a floor has no manager's office,
    //      so it is also the floor's DEEP ANCHOR, the room the stairs land in. Since Mark switched
    //      the casino off on 2026-09-02, no room on floors 2-6 is typed 'casino' at all, so a
    //      by-type lookup returned -1 and took the staircase out of the game on every floor below 7.
    //      One name, two jobs — and only one of them is about gambling.
    //    So: floors 2-6 keep the deep-anchor meaning UNCHANGED, byte for byte. Floor 7 alone resolves
    //    the real casino by type, which is the floor that now has one.
    const _casIdx = crooms.findIndex(r => r && r.type === 'casino');
    const casinoId = (level === 7) ? ((_casIdx >= 0) ? cidToFinal[_casIdx] : -1)
                                   : cidToFinal[crooms.indexOf(casinoRoom)];

    // roomId grid (compact) — a tile's owning room (crooms index); corridors resolved to an ADJACENT room's final id (never -1) [REF#DG-00528]
    const rid = Array.from({ length: GW }, () => new Array(GH).fill(-1));
    crooms.forEach((cr, ci) => { for (let i = cr.x; i < cr.x + cr.w; i++) for (let j = cr.y; j < cr.y + cr.h; j++) if (rid[i][j] < 0) rid[i][j] = ci; });
    const corrId = Array.from({ length: GW }, () => new Array(GH).fill(-1));
    const seenC = Array.from({ length: GW }, () => new Array(GH).fill(false));
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (seenC[x][y] || Tc[x][y] !== CORR) continue;
      const comp = []; const st = [[x, y]]; let owner = -1;
      while (st.length) {
        const cur = st.pop(), a = cur[0], b = cur[1]; if (a < 0 || b < 0 || a >= GW || b >= GH || seenC[a][b] || Tc[a][b] !== CORR) continue; seenC[a][b] = true; comp.push(cur);
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = a + d[0], ny = b + d[1]; if (Tc[nx] && Tc[nx][ny] === DOOR && rid[nx][ny] >= 0 && owner < 0) owner = cidToFinal[rid[nx][ny]]; st.push([nx, ny]); }
      }
      if (owner < 0) owner = 0;   // entry/main-hall corridor with no door-bound room → the landing/hall (id 0) [REF#DG-00529]
      for (const p of comp) corrId[p[0]][p[1]] = owner;
    }

    // 128×128 map, all wall, then stamp the compact tiles with FINAL room ids (every non-wall tile carries a valid roomId) [REF#DG-00530]
    const map = Array.from({ length: MAP_W }, () => Array.from({ length: MAP_H }, () => ({ type: 'wall' })));
    for (let gx = 0; gx < GW; gx++) for (let gy = 0; gy < GH; gy++) {
      const t = Tc[gx][gy]; if (t === ROCK || t === WALL) continue;
      const ex = gx + OX, ey = gy + OY, rm = rid[gx][gy] >= 0 ? cidToFinal[rid[gx][gy]] : -1;
      const ownerId = rm >= 0 ? rm : (corrId[gx][gy] >= 0 ? corrId[gx][gy] : 0);
      const ownerSeg = (_spineSegmentOf.get(gx + ',' + gy) ?? rooms_out[ownerId]?.segmentId ?? 0);
      if (t === FLOOR) map[ex][ey] = { type: 'floor', room: true, roomId: rm >= 0 ? rm : 0, segmentId: rooms_out[rm >= 0 ? rm : 0]?.segmentId ?? ownerSeg };
      else if (t === CORR) map[ex][ey] = { type: 'floor', hall: true, roomId: corrId[gx][gy] >= 0 ? corrId[gx][gy] : 0, segmentId: ownerSeg };
      else if (t === DOOR) {
        // KONBINI prototype (Mark 2026-06-26): the store's door must NOT consume the panelless _rand() draw, else the 2 [REF#DG-00531]
        // new store DOOR tiles (scanned early in compact order) shift every later panelless draw → the rest of the map
        // would differ from the no-store generator. Detect store-owned doors by their compact-space owning room type and
        // give them a FIXED panel (konbini = a proper shop door, never missing a panel). Zero _rand() for these = the
        // ENTIRE dungeon downstream stays byte-identical to the unmodified generator; only the store is added.
        if (_segmentGateTiles.has(gx + ',' + gy) || _sectionGateTiles.has(gx + ',' + gy)) {
          // RING gate door (Phase G1, 2026-06-27): tag it as a segment and/or section gate and give it a [REF#DG-00532]
          // FIXED panel (no _rand draw), exactly like the konbini trick — keeps the panelless RNG stream
          // unperturbed so the rest of the map matches the no-gate stream.
          // ⚠ A DOOR TILE CAN BE BOTH, AND THIS WAS AN EXCLUSIVE if/else-if BEFORE. [REF#DG-01386]
          //   _buildLHalls registers its 3 leg-gate tiles in BOTH `_segmentGateTiles` (the streamer's
          //   segment-seal identity, pre-existing) AND, as of today, `_sectionGateTiles` (gameplay
          //   section identity — the thing `probe-sections.js` grades). The old exclusive branching let
          //   the segment tag win and silently dropped `sectionGate` — MEASURED 2026-09-06: every
          //   `_buildLHalls` gate tile came back untagged for section, and `_assertContract`'s own "gate
          //   tile is not a tagged shoji_door" check then threw on every real seed the moment section
          //   gates were populated (this same landing). Both tags now apply independently to one tile;
          //   no other generator currently registers the same tile in both maps, so this changes nothing
          //   for `_buildRing`/`_buildHeart`/`_buildQuadrant`, each of which only ever hits one branch.
          const segGi = _segmentGateTiles.get(gx + ',' + gy), secGi = _sectionGateTiles.get(gx + ',' + gy);
          map[ex][ey] = { type: 'shoji_door', roomId: ownerId, segmentId: segGi ? segGi.segmentFrom : (secGi ? secGi.sectionFrom : ownerSeg), panelless: false };
          if (segGi) Object.assign(map[ex][ey], { segmentGate: true, gateIndex: segGi.gateIndex, segmentFrom: segGi.segmentFrom, segmentTo: segGi.segmentTo });
          if (secGi) Object.assign(map[ex][ey], { sectionGate: true, gateIndex: secGi.gateIndex, sectionFrom: secGi.sectionFrom, sectionTo: secGi.sectionTo, roomId: rm >= 0 ? rm : ownerId });
        }
        else if (_storeDoors.has(gx + ',' + gy)) map[ex][ey] = { type: 'shoji_door', roomId: rm >= 0 ? rm : 0, segmentId: rooms_out[rm >= 0 ? rm : 0]?.segmentId ?? ownerSeg, panelless: false };   // konbini door → fixed panel, NO _rand draw (keeps the rest of the map byte-identical to the no-store generator) [REF#DG-00533]
        // LOCKED + SIGNED door (the manager's office). `panelless: false` deliberately — a locked door [REF#DG-00534]
        // with a paper panel missing is a door you could step through, which is the opposite of the
        // read. The engine is what must honour `locked`; this only states it in the map data.
        else if (_lockedDoors.has(gx + ',' + gy)) {
          const _lk = _lockedDoors.get(gx + ',' + gy);
          map[ex][ey] = { type: 'shoji_door', roomId: rm >= 0 ? rm : 0, segmentId: rooms_out[rm >= 0 ? rm : 0]?.segmentId ?? ownerSeg, panelless: false,
                          locked: _lk.locked !== false, lockedBy: _lk.by, sign: _lk.sign, signEn: _lk.signEn };
        }
        else map[ex][ey] = { type: 'shoji_door', roomId: rm >= 0 ? rm : 0, segmentId: rooms_out[rm >= 0 ? rm : 0]?.segmentId ?? ownerSeg, panelless: _rand() < 0.32 };
      }
    }
    // FLOOR-1 OPEN CABARET↔HALLWAY GAP: mark the cabaret-side gap tiles .doors=['S'] so the engine draws NO [REF#DG-00535]
    // boundary pane there — a true open passage (no door/frame/panel), letting the player see the stage. Mark 2026-06-19.
    // ── A DOORWAY'S PANELS ARE DECIDED PER DOORWAY, NOT PER TILE ────────────────────────────────────
    //    (Mark 2026-08-02 "these should all be double doors if on 2 tiles" · 2026-08-04 "never put them
    //    on a doorway with 1+ tiles".) `panelless` is drawn above at ~32% for EACH door tile, so a
    //    2-tile doorway had a ~44% chance of coming out SPLIT — one leaf open, one solid. Measured on
    //    the floor-1 map: 27 of 40 seeds carried at least one split pair. The engine's door builder then
    //    saw the open leaf as "not a plain shoji", failed to find a twin for the solid one, and stood a
    //    lone paper pane in half a double doorway — the thing Mark photographed.
    //    IF EITHER LEAF IS SOLID, BOTH ARE: that turns the pair into one wooden double door, which is
    //    what he asked for on 08-02. The rule only ever CLEARS panelless, so a door given a fixed panel
    //    on purpose (konbini, locked office, section gate) can never be turned into a gap by it.
    //    ⚠ ZERO _rand() DRAWS. This runs AFTER the emission loop and overwrites a flag; it does not add,
    //      skip or reorder a single draw, so the RNG stream — and therefore every other floor and every
    //      other door on this one — is bit-identical to before. That discipline is why the konbini and
    //      section-gate doors were given fixed panels rather than being skipped.
    // FIRST, the doors that were promised rather than rolled. Runs BEFORE the pair pass, which only ever
    // CLEARS panelless — so the two can never fight, whichever order a future edit puts them in.
    for (const k of _fixedPanelDoors) {
      const c = k.split(','), m = map[(+c[0]) + OX] && map[(+c[0]) + OX][(+c[1]) + OY];
      if (m && m.type === 'shoji_door') m.panelless = false;
    }
    // HALF-HEIGHT COUNTER WALL — same generator-marks-it / adapter-reads-it trick as the store doors. [REF#DG-00536]
    // Guarded on type 'wall' so a later pass that turns one of these into a door or floor silently wins
    // rather than leaving a waist-high slab standing in a doorway.
    for (const k of _counterWallTiles) {
      const c = k.split(','), m = map[(+c[0]) + OX] && map[(+c[0]) + OX][(+c[1]) + OY];
      if (m && m.type === 'wall') m.counterWall = true;
    }
    // HALF-HEIGHT WALL RUNS (Mark 2026-08-28: 番所 "around half", and "half height walls around 4 [REF#DG-01198]
    // tiles along north and west of hallway room 0"). Marked HERE, off the emitted room records, not
    // during the carve: the head's rects are already final at this point, so this cannot drift out of
    // step with where the rooms actually landed — the failure mode that put a counter on a seam that
    // had moved. Guarded on type 'wall' exactly like counterWall above, so the doorway tiles in these
    // rows (room 0's open north face, the 番所's north door at its wall midpoint) are skipped by the
    // guard rather than by arithmetic. The engine reads `lowWall` in _lowRun / _mkGuardRun.
    // ⚠ COLLISION AND LINE-OF-SIGHT ARE UNCHANGED — the tile stays type 'wall', same as counterWall.
    //   A low run is a LOOK. You will see over it and still not walk or shoot through it.
    const _lowWallMark = (x, z) => { const m = map[x] && map[x][z]; if (m && m.type === 'wall' && m.lowWall !== true) { m.lowWall = true; return 1; } return 0; };   // count UNIQUE tiles: the rows and columns overlap at the corners, and a call-count reported 21 where the map carried 18 [REF#DG-01199]
    let _lowN = 0;
    try {
      const _guard = rooms_out.find(r => r && r.isGuardRoom);
      if (_guard) {
        // ── THE 番所 COUNTER — A TICKET / COAT-CHECK / SECURITY DESK, NOT A LONG LOW WALL ────── [REF#DG-01200]
        //    Mark 2026-08-28: "only have 4 tiles for the half height walls, nearest the caberet, and
        //    one tile for the corner of it + 1 tile next to the walls, and then doorway. So it looks
        //    like a real ticket/coat check / security counter for a casino."
        //    WAS: the guard room's ENTIRE north row AND west column went low — a full-length run down
        //    two faces, which reads as a chest-high wall you are walled in by, not a desk you are
        //    served at. A counter is SHORT and it has a way past it.
        //    THE RUN, in his order: 4 along the face nearest the cabaret · 1 at the corner · 1 turning
        //    onto the adjoining face · then nothing, and the doorway falls in that gap.
        //    ⚠ WHICH FACE IS "NEAREST THE CABARET" IS DERIVED, NOT ASSUMED. The guard room does not sit
        //    in a fixed place on every floor, so a hard-coded "north row" is a guess that silently
        //    rots. Compare the cabaret's centre against the guard room's own centre and take the face
        //    it actually lies toward.
        const _cab = rooms_out.find(r => r && (r.isCabaret || r.id === 1));
        const _gcx = _guard.x + _guard.w / 2, _gcz = _guard.y + _guard.h / 2;
        const _ccx = _cab ? (_cab.x + _cab.w / 2) : _gcx;
        const _ccz = _cab ? (_cab.y + _cab.h / 2) : (_gcz - 1);
        const _horiz = Math.abs(_ccx - _gcx) > Math.abs(_ccz - _gcz);   // cabaret lies E/W vs N/S of the desk [REF#DG-01201]
        const _RUN = (typeof window !== 'undefined' && typeof window._guardCounterTiles === 'number') ? window._guardCounterTiles : 4;
        if (_horiz) {
          const _col = (_ccx > _gcx) ? (_guard.x + _guard.w - 1) : _guard.x;      // the column facing the cabaret [REF#DG-01202]
          const _z0  = (_ccz > _gcz) ? (_guard.y + _guard.h - _RUN) : _guard.y;   // start from the cabaret end [REF#DG-01203]
          for (let i = 0; i < _RUN; i++) _lowN += _lowWallMark(_col, _z0 + i);    // 4 tiles [REF#DG-01204]
          const _zc = (_ccz > _gcz) ? (_guard.y + _guard.h - 1) : _guard.y;
          _lowN += _lowWallMark(_col, _zc);                                        // the corner [REF#DG-01205]
          _lowN += _lowWallMark(_col + (_ccx > _gcx ? -1 : 1), _zc);               // +1 turning along the wall [REF#DG-01206]
        } else {
          const _row = (_ccz > _gcz) ? (_guard.y + _guard.h - 1) : _guard.y;      // the row facing the cabaret [REF#DG-01207]
          const _x0  = (_ccx > _gcx) ? (_guard.x + _guard.w - _RUN) : _guard.x;
          for (let i = 0; i < _RUN; i++) _lowN += _lowWallMark(_x0 + i, _row);     // 4 tiles [REF#DG-01208]
          const _xc = (_ccx > _gcx) ? (_guard.x + _guard.w - 1) : _guard.x;
          _lowN += _lowWallMark(_xc, _row);                                        // the corner [REF#DG-01209]
          _lowN += _lowWallMark(_xc, _row + (_ccz > _gcz ? -1 : 1));               // +1 turning along the wall [REF#DG-01210 → see REF#DG-01206]
        }
      }
      const _hall0 = rooms_out.find(r => r && (r.isEntranceHall || r.id === 0));
      if (_hall0) {                                   // "4 tiles along north and west of hallway room 0" [REF#DG-01211]
        const _LOW_RUN = (typeof window !== 'undefined' && typeof window._hall0LowTiles === 'number') ? window._hall0LowTiles : 4;
        const _westBehind = rooms_out.some(r => r && r.isEmptyGuard);   // hoisted: BOTH runs below gate on it [REF#DG-01212]
        // ⚠ THE NORTH RUN SKIPS ITS OWN NW CORNER ONCE THE MIRROR IS THERE (Mark 2026-08-29, "go"). [REF#DG-01213]
        //   `_hall0.x` is room 0's west column, so the first tile of this run IS the corner where the
        //   north row meets that column — and with the west 番所 seated on it, that corner is the
        //   MIRROR'S NE CORNER. It was the last half-height tile left on a room he asked to have none.
        //   MEASURED before this: lowWall held (62,72) and the mirror reported lowWall 1.
        //   Worth knowing about this run either way: room 0's north row has only TWO wall tiles in it
        //   (x=62 and x=65) — everything between is the corridor's open north face — so a `_LOW_RUN` of
        //   4 was never marking four tiles here, and dropping the corner leaves it marking one.
        //   Conditional, like the west column above: with no room behind, the 08-28 order is untouched.
        const _n0 = _westBehind ? 1 : 0;
        for (let i = _n0; i < _LOW_RUN; i++) _lowN += _lowWallMark(_hall0.x + i, _hall0.y);                   // north row [REF#DG-01214]
        // ⚠ THE WEST COLUMN IS SKIPPED ONCE A ROOM STANDS BEHIND IT (Mark 2026-08-29). His 08-28 order [REF#DG-01215]
        //   put 4 low tiles down room 0's west face, and at that time west of room 0 was solid rock —
        //   a waist-high parapet against a cliff. The west 番所 mirror now seats its EAST wall on that
        //   exact column, so those 4 tiles stopped being room 0's decorative edge and became the new
        //   room's wall — and his order for that room is "just duplicate WITHOUT the halfhigh walls".
        //   Keeping them would have you looking over a counter into an empty room that is supposed to
        //   have none. MEASURED before this guard: lowWall carried (62,72)..(62,75), the mirror's east
        //   wall exactly. This is CONDITIONAL, not a deletion — with no room behind it the 08-28 run is
        //   unchanged, and `window._westGuardRoom = false` restores both at once.
        if (!_westBehind) for (let i = 0; i < _LOW_RUN; i++) _lowN += _lowWallMark(_hall0.x, _hall0.y + i);   // west column, 4 tiles [REF#DG-01216]
      }
      if (typeof window !== 'undefined') window._lowWallTileCount = _lowN;
    } catch (e) { try { console.warn('[LOWWALL] marking failed:', e && e.message); } catch (_) {} }
    // CROSSING DOORS — stamped the same generator-marks-it / adapter-reads-it way. Guarded on the tile [REF#DG-00537]
    // still BEING a door: a later pass that turned it back to wall must win, rather than leaving the
    // engine hunting for a doorway that is not there.
    for (const k of _crossDoorTiles) {
      const c = k.split(','), m = map[(+c[0]) + OX] && map[(+c[0]) + OX][(+c[1]) + OY];
      if (m && m.type === 'shoji_door') m.crossDoor = true;
    }
    for (let ex = 0; ex < MAP_W; ex++) for (let ez = 0; ez < MAP_H; ez++) {
      const a = map[ex][ez];
      if (!a || a.type !== 'shoji_door' || a.sectionGate || a.segmentGate) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const b = map[ex + dx] && map[ex + dx][ez + dz];
        if (!b || b.type !== 'shoji_door' || b.sectionGate || b.segmentGate) continue;
        if (!a.panelless || !b.panelless) { a.panelless = false; b.panelless = false; }
      }
    }
    // ── SPECIAL-ROOM 1-TILE DOORS (2026-08-12, Mark: "add 1-tile door for all special rooms that opens [REF#DG-00538]
    //    and closes animated"). Stamped the same generator-marks-it / adapter-reads-it way as counterWall
    //    and crossDoor above — a room-OBJECT property does not survive to the tile objects Engine9 reads
    //    (see the guard-door carve note ~2049: this is that fix, generalized to every qualifying room in
    //    ONE pass instead of a bespoke Set per room, per Mark's ask that it cover all of them, not just
    //    the 番所).
    //    QUALIFYING ROOMS: guard post, the rotating per-section specials (cafeteria/factory/room3/room4,
    //    `isSpecialRoom`), the konbini store, the casino. NOT the cabaret — its double/4-way doors are
    //    Mark's own explicit 2026-07-19/08-02/08-04 asks and this must never shrink them back to one leaf.
    //    LONE TILES ONLY: a doorway with a shoji_door NEIGHBOUR (cabaret pair, crossing 4-way, any
    //    section/segment gate) is a multi-tile doorway on purpose and is left exactly as it already
    //    renders — this pass only ever ADDS a flag to a tile, never changes tile count or type.
    //    OWNERSHIP BY ADJACENCY, NOT BY THE DOOR TILE'S OWN roomId: a shared-wall doorway (the guard
    //    room's coat-check counter is exactly this) can have its roomId claimed by whichever room `rid`
    //    saw first while stamping the floor grid above, which is not reliable enough to gate a render
    //    decision on. Checking which 4-neighbour is that room's own `room:true` FLOOR tile (not a hall
    //    corridor tile, which also carries type:'floor') is unambiguous.
    //    `guardDoor` stays a SEPARATE flag, not folded into `specialDoor` — Engine9's cabaret-open
    //    trigger note and the existing probe (`scripts/probe-guard-door-swing.js`) both key on it by
    //    name; touching that name would be an unrelated, unannounced rename of a working contract. Every
    //    guard-room door tile gets BOTH flags.
    {
      const _specialDoorRoomIds = new Set();
      const _guardRoomIds = new Set();
      rooms_out.forEach(r => {
        if (!r) return;
        if (r.isSpecialRoom || r.isGuardRoom || r.isEmptyGuard || r.isStore || r.isCasino) _specialDoorRoomIds.add(r.id);   // isEmptyGuard = the west mirror (2026-08-29); it is not isGuardRoom on purpose, so it must be named here or it gets a bare hole instead of the 1-tile leaf [REF#DG-01217]
        if (r.isGuardRoom) _guardRoomIds.add(r.id);
      });
      if (_specialDoorRoomIds.size) {
        for (let ex = 0; ex < MAP_W; ex++) for (let ez = 0; ez < MAP_H; ez++) {
          const m = map[ex][ez];
          if (!m || m.type !== 'shoji_door' || m.sectionGate || m.segmentGate || m.locked) continue;
          let lone = true;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = map[ex + dx] && map[ex + dx][ez + dz];
            if (n && n.type === 'shoji_door') { lone = false; break; }
          }
          if (!lone) continue;
          let ownerRoomId = -1;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = map[ex + dx] && map[ex + dx][ez + dz];
            if (n && n.type === 'floor' && n.room === true && _specialDoorRoomIds.has(n.roomId)) { ownerRoomId = n.roomId; break; }
          }
          if (ownerRoomId < 0) continue;
          m.specialDoor = true;
          if (_guardRoomIds.has(ownerRoomId)) m.guardDoor = true;
        }
      }
    }
    // g[2] = the OPEN EDGE, defaulting to 'S' so every pre-2026-08-04 caller is byte-identical. It had to [REF#DG-00539]
    // become explicit when the entrance mouth stopped being a door: that opening is in the landing's NORTH
    // wall, and a hard-coded 'S' would have suppressed the pane on the wrong edge — leaving the real
    // opening panelled shut and punching a hole in the wall behind the player instead.
    for (const g of _l1Open) { const m = map[g[0] + OX] && map[g[0] + OX][g[1] + OY]; if (m && m.type === 'floor') { (m.doors || (m.doors = [])).push(g[2] || 'S'); } }

    // ── THE HUB'S CORE (floors 2-7, 2026-10-02) — Section0.buildSection0Core writes floor 1's section 0 at +10% into the map. ── [REF#DG-02241]
    //    It runs HERE, after every compact-grid tile pass above (panel pairing, the special-door leaves, the low-wall runs,
    //    the head-guard lock), so none of them touches it: the core arrives exactly as the builder writes floor 1's.
    //    Creator first forgets the previous attempt, then holds the core's authored rooms and doors and the three gates'
    //    walls; adopt() carries those across its re-mint, keyed by first tile. Each gate tile belongs to its wing, the way
    //    floor 1's do (roomId of the spur beyond it, segmentId/sectionIndex = that section).
    let _hubOut = null;
    if (_hubCore) {
      const { S, C } = _s0Mods();
      C.reset();
      _hubOut = S.buildSection0Core(C, map, _hubCore.L, { ox: _hubCore.ox + OX, oz: _hubCore.oz + OY, ids: HUB_IDS, guardSec: 0,
        down: (level === 7) ? null : 'guard', konbini: true,
        });
      // section 'entry' keeps every spawner out of the core's rooms (the 08-12 private rooms) · special = an authored [REF#DG-02242]
      // footprint, so Creator's room-shape rule leaves it alone · _headGuard keeps the patrol/filler passes out of the 番所
      for (const r of _hubOut.records) rooms_out[r.id] = Object.assign(r, { section: 'entry', special: true }, r.isGuardRoom ? { _headGuard: true } : {});
      const OUT = { w: [-1, 0], n: [0, -1], e: [1, 0] };
      for (const k of Object.keys(_hubOut.gates)) {
        const g = _hubOut.gates[k], d = OUT[g.side];
        for (const [gx, gz] of g.tiles) {
          const sp = map[gx + d[0]] && map[gx + d[0]][gz + d[1]];
          Object.assign(map[gx][gz], { roomId: (sp && sp.roomId >= 0) ? sp.roomId : map[gx][gz].roomId, segmentId: +k, sectionIndex: +k });
        }
        C.createDoor({ roomId: _hubOut.creator.ring.roomId, connects: [_hubOut.creator.ring.roomId], side: g.side, span: g.tiles.length, theme: null, tiles: g.tiles });
      }
    }
    try { global._s0HubFloor = !!_hubOut; } catch (_) {}   // Engine9 streams a hub by adjacency (every wing touches section 0), not ±1 [REF#DG-02243]
    // the ring's NE and SW corners for the engine's paper lanterns — the same two corners floor 1 publishes from Section0's RING_BOX [REF#DG-02244]
    // (Section0.js, _ringLanternCorners); on a hub the ring record IS the ring's box. Step 4 of FLOORS_2PLUS_FLOOR1_SECTION0_PLAN_2026-10-02.md
    try { const _rg = _hubOut && _hubOut.records.find(r => r && r.id === HUB_IDS.ring);
          if (_rg) global._ringLanternCorners = [[_rg.x + _rg.w - 1, _rg.y], [_rg.x, _rg.y + _rg.h - 1]]; } catch (_) {}
    // SEEN 2026-10-02 (scripts/probe-s0-hub-engine-1002.js, floors 2 and 7, seed 12345, software GL): corners (65,51) and (49,68), both ring [REF#DG-02245]
    // floor (room 5), two lanterns with their lights — knowledge/design/FLOORS_2PLUS_FLOOR1_SECTION0_PLAN_2026-10-02.md

    let spawnX, spawnZ;
    if (_hubOut) {   // the spawn is ON the left stairs_up tile at hallway 0's foot, as on floor 1 [REF#DG-02246]
      spawnX = _hubOut.spawn[0]; spawnZ = _hubOut.spawn[1] - ((typeof window !== 'undefined' && window._spawnOnStairs === false) ? 1 : 0);
    } else {
      // STAIRS_UP + spawn in the LANDING (id 0, the descend point); stairs_down in the casino (L1-6) [REF#DG-00540]
      const ent = rooms_out[0];
      let upx = ent.cx, upz = Math.min(ent.y + ent.h - 2, MAP_H - 3);
      // Keep the 2-tile stairs_up ON FLOOR: the narrow Floor-1 hall (2 tiles wide) has its WALL at ent.cx+1, so (ent.cx, ent.cx+1) would straddle floor+wall — the stairs + spawn end up one tile east of the hall ("cabaret + map not in sync", Mark 2026-06-19). Shift WEST so both stair tiles are floor. [REF#DG-00541]
      const _isFlr = (x, z) => map[x] && map[x][z] && map[x][z].type === 'floor';
      if (!_isFlr(upx + 1, upz) && _isFlr(upx - 1, upz)) upx -= 1;
      map[upx][upz] = { type: 'stairs_up', roomId: 0, segmentId: 0 };
      if (map[upx + 1] && map[upx + 1][upz]) map[upx + 1][upz] = { type: 'stairs_up_r', roomId: 0, segmentId: 0 };
      // Mark 2026-09-13: "have player start on stairway - so one step forward will feel like walking down to start the [REF#DG-02054]
      // floor." The spawn is ON the left stairs_up tile (was the row above it); Engine9 holds the exit/ascend prompt until
      // the player has stepped off the flight once. RESTORE the row-above spawn: window._spawnOnStairs = false.
      spawnX = upx; spawnZ = (typeof window !== 'undefined' && window._spawnOnStairs === false) ? upz - 1 : upz;
      // FLOOR 1: the spawn STAYS on the LEFT hall column (upx = the west stair tile) — Mark 2026-06-19: the player [REF#DG-00542]
      // walks up the LEFT side while the 2-tile-wide floor labels (title + moon-phase) sit centred on the BOUNDARY
      // between the two hall tiles (the cabaret true centre). (The earlier centre-line shift to ent.cx is reverted.)
      if (!_walkable(map, spawnX, spawnZ)) { const f = _nearestWalkable(map, upx, upz); spawnX = f[0]; spawnZ = f[1]; }
    }
    // ── THE WAY DOWN IS THE MANAGER'S OFFICE ELEVATOR (Mark 2026-08-04: "that will be done when player [REF#DG-00543]
    //    goes down elevator in managers office -- that is the stair way"). It supersedes the casino as
    //    the descent point on any floor that HAS an office — floor 1, where _buildSection0 carves one
    //    backstage. The office already holds the keys in canon ("the managers office has the keys to the
    //    stairs down", 2026-07-31); this makes the room the destination rather than a waypoint to it,
    //    which is also what lets the quest marker be a single fixed promise every floor (see the radar's
    //    `!`) instead of pointing wherever the casino happened to land.
    //    THE CASINO REMAINS THE FALLBACK, untouched, for every floor without an office (L2+ today) — so
    //    the descent can never simply vanish if the backstage is not carved. `_descentRoomId` is
    //    published for the engine's quest marker and the floor-progression gate to key on ONE value
    //    rather than each re-deriving "where is down".
    const _officeRoom = rooms_out.find(r => r && r.isManagerOffice);
    // ── NO DESCENT ON THE TRIMMED FLOOR, AND NO SUBSTITUTE (Mark 2026-08-24) ───────────────────── [REF#DG-00544]
    //    Office, else casino — and under hallway+cabaret+guard there is NEITHER. The first cut of this
    //    trim answered that by dropping `stairs_down` into the ENTRANCE HALLWAY (rooms_out[0]) — a
    //    railed stair hole in the spawn corridor that Mark never asked for, visible in his top-down.
    //    "Room 1 + room 2 + guard room EXACTLY" means the descent's rooms are gone and the descent
    //    goes with them; `_assertContract`'s stairs_down clause stands down under the trim (see there).
    //    The way down returns with the packer: window._headRoomsOnly = false.
    // ⛔ SUPERSEDED 2026-10-01 by Mark: "focus on managers stairs down ... there should be the real stairs down" —
    //    the MANAGER'S OFFICE now carries the real descent on every floor, and the guard room is only the fallback
    //    for a floor built without an office. The order this retires is the 2026-09-11 floor law, which read "THE
    //    STAIRS DOWN LIVE IN THE GUARD ROOM ON EVERY FLOOR ... the head guard room outranks the office and the
    //    casino: the guard room is the floor's LAST room, sealed until the wings are activated, so the way down
    //    inside it makes the lock the gate on finishing the floor". What that order was protecting — the key lock
    //    as the gate on finishing a floor — is the thing being traded away, deliberately: the same day Mark gave
    //    the guard room's stairs a different destination ("guard room stairs is into a new dungeon we create -- a
    //    nethack only type universe of endless dungeons"), so the two staircases stop being alternatives for one
    //    descent and become two different journeys. The endless dungeon is NOT built; until it is, the guard room
    //    simply has no stairs on a floor that has an office.
    //    ⚠ THE OFFICE ONLY EXISTS ON FLOORS 2+ SINCE 2026-10-01 (the head backstage carve). Before that the
    //      fallback chain meant the guard room always won here, which is why flipping the order is a real change
    //      rather than a no-op. Floor 1 already put the descent in its office.
    //    ⚠ `_descentIsGuard` IS READ BY THE ENGINE to stand the casino exit toll down, so moving the descent
    //      flips that flag to false and the toll gate applies again. Deliberate and reported, not a side effect.
    //    Deep doc: knowledge/design/FLOORS_2PLUS_SECTION0_TEMPLATE_2026-10-01.md
    //    Off: window._descentInOffice = false → the 2026-09-11 order returns exactly (guard room first).
    const _headGuardRoom = rooms_out.find(r => r && r.isGuardRoom === true && r._headGuard === true);
    const _officeFirst = false;
    const _descentId = (level === 7) ? casinoId
      : (_hubOut && _headGuardRoom) ? _headGuardRoom.id
      : (_officeFirst
          ? (_officeRoom ? _officeRoom.id : (_headGuardRoom ? _headGuardRoom.id : casinoId))
          : (_headGuardRoom ? _headGuardRoom.id : (_officeRoom ? _officeRoom.id : casinoId)));
    if (level !== 7 && _descentId >= 0) {
      const cr = rooms_out[_descentId];
      if (!_hubOut) map[cr.cx][cr.isGuardRoom ? cr.y + cr.h - 2 : cr.cz] = { type: 'stairs_down', roomId: _descentId, segmentId: cr.segmentId };
      cr.hasStairsDown = true;   // the same field floor 1's record carries — set on whichever room won the descent [REF#DG-02021]
      try { global._descentRoomId = _descentId; global._descentIsOffice = !!(_officeRoom && _descentId === _officeRoom.id); global._descentIsGuard = !!(_headGuardRoom && _descentId === _headGuardRoom.id); } catch (_) {}   // _descentIsGuard: the engine's casino-toll gate stands down — the 番所's key lock is the gate [REF#DG-02022]
    }

    const mobSpawns = _genMobSpawns(level, map, rooms_out, casinoId);
    // ── ONE SLEEPING INSPECTOR PER SPECIAL BUILDING (Mark 2026-08-04) ──────────────────────────── [REF#DG-00545]
    //    "there will be an inspector at each special building room" — the ogre that shut the dungeon
    //    down. Added AFTER _genMobSpawns rather than inside it, deliberately: that function packs
    //    ordinary workers by room archetype and its `occ` set is scoped to that pass. Placing the
    //    inspector here keeps the boss out of the worker grammar entirely, so no archetype roll, no
    //    group size and no vulnerability table can ever produce or suppress one. Exactly four exist,
    //    one per section, and that is a contract rather than a probability.
    //    ⚠ IT DOES NOT NEED A SLEEP FLAG. The engine's spawn-sleep sweep puts down any body whose tile
    //    roomId >= 2, and a special room always qualifies — so the ogre sleeps for free, like the
    //    workers. Adding a second sleep mechanism here would be a rival writer of the same state.
    //    ⚠ BEHAVIOUR IS NOT WIRED and is not mine: hostile-on-collision, refuses to gamble, and the
    //    two-flash camera dissolve all live in the engine's combat lane. Until the flash beat exists a
    //    camera-only player cannot beat one — see MAP_SYSTEM_REBUILD_HANDOFF §2.
    //    Off: global._specialRoomInspector = false. Knob: _inspectorHpMult (3).
    if (global._specialRoomInspector !== false) {
      const _insHp = Math.round(hpForLevel(level) * ((typeof global._inspectorHpMult === 'number') ? global._inspectorHpMult : 3));
      const _taken = new Set(mobSpawns.map(m => m && m.x + ',' + m.z));
      for (const r of rooms_out) {
        // `isSpecialRoom` is the RING packer's size flag; `isSectionSpecial` is a wing's dealt building on the [REF#DG-02003]
        // chain packer that actually ships. MEASURED 2026-09-11 on floor 2: `_buildLHalls` sets neither, so
        // the floor had ZERO inspectors and the permit-keeper pass reported every permit UNOBTAINABLE — the
        // 番所 could never open below floor 1. One ogre per special room is the law either way.
        if (!r || !(r.isSpecialRoom || r.isSectionSpecial)) continue;
        // ── THE OGRE SLEEPS AT THE FAR END FROM THE DOOR (Mark 2026-09-11: "in each room, upon entry, the [REF#DG-02005]
        //    OGRE should awake. it will be at the opposite end of every room from the 1-entry door") ────
        //    Was centre-first. The room's door tiles are read off its own wall ring (a `_placeSpecial` room
        //    has exactly one), and the interior tiles are ordered farthest-from-the-door first, so the player
        //    sees him across the whole room when the door opens and he has the length of it to charge.
        const _doors = [];
        for (let x = r.x; x < r.x + r.w; x++) for (let z = r.y; z < r.y + r.h; z++) {
          if (x !== r.x && x !== r.x + r.w - 1 && z !== r.y && z !== r.y + r.h - 1) continue;   // ring only [REF#DG-02006]
          const t = map[x] && map[x][z]; if (t && (t.type === 'shoji_door' || t.type === 'door')) _doors.push([x, z]);
        }
        const _cands = [];
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) for (let z = r.y + 1; z < r.y + r.h - 1; z++) _cands.push([x, z]);
        if (_doors.length) {
          // "opposite END": farthest along the door's own axis, on the door's line — so the charge runs the [REF#DG-02007]
          // length of the room straight at the doorway, not diagonally out of a corner.
          const [dxr, dzr] = _doors[0];
          const _horiz = (dzr === r.y || dzr === r.y + r.h - 1);   // door in a N/S wall → the room's axis is z [REF#DG-02008]
          const _score = ([x, z]) => (_horiz ? Math.abs(z - dzr) : Math.abs(x - dxr)) * 1000 - (_horiz ? Math.abs(x - dxr) : Math.abs(z - dzr));
          _cands.sort((a, b) => _score(b) - _score(a));
        } else _cands.unshift([Math.round(r.cx), Math.round(r.cz)]);   // no door found: the old centre-first order [REF#DG-00546]
        let _at = null;
        for (const [cx, cz] of _cands) {
          const t = map[cx] && map[cx][cz];
          if (t && t.type === 'floor' && !_taken.has(cx + ',' + cz)) { _at = [cx, cz]; break; }
        }
        if (!_at) continue;   // no free floor — skip rather than stack two bodies on a tile [REF#DG-00547]
        _taken.add(_at[0] + ',' + _at[1]);
        mobSpawns.push({
          id: 'inspector-' + r.id, nameKey: 'ogre', name: 'Building Inspector', type: 'monster',
          x: _at[0], z: _at[1], hp: _insHp, maxHp: _insHp,
          isHostile: false,          // asleep at its post; it wakes hostile on collision or a strike [REF#DG-00548]
          isInspector: true,         // the hook combat/AI keys on: no gambling, +5 karma, camera route [REF#DG-00549]
          noFloat: true, meleeOnly: true, scale: 1.6,
          segmentId: r.segmentId,
          vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 },
        });
      }
    }
    // ── THE OGRE ASLEEP ON THE COT IN THE 番所 (Mark 2026-08-05) ───────────────────────────────── [REF#DG-00550]
    //    "its going to sit right on the edge of the entranceway and the hallway in a corner — like a
    //    coatcheck ticketing counter/guardroom with an ogre sleeping on a cot."
    //    The coat check had a counter, a rail and hangers and NOBODY BEHIND IT, which the handoff called
    //    what it was: a shelf. This is the staff.
    //    ⚠ IT IS NOT AN INSPECTOR, and that distinction is load-bearing. The block above is a CONTRACT —
    //      "exactly four exist, one per section" — and quietly minting a fifth `isInspector` body here
    //      would break the floor-progression gate that counts them. This one carries `isGuardOgre` and
    //      nothing else: it gambles like any worker, it does not carry a permit card, and it is not a
    //      section boss. Same reasoning as the inspector block: placed AFTER _genMobSpawns so the worker
    //      archetype grammar can neither produce nor suppress it.
    //    ⚠ NO SLEEP FLAG HERE either — the engine's spawn-sleep sweep puts down any body whose tile
    //      roomId >= 2, and the guard room measures roomId 4, so it sleeps for free like the workers.
    //      What the engine DOES add for this one is the cot: the sweep lies ordinary workers down where
    //      they stand ("the floor is their futon"), and only a body flagged isGuardOgre is pinned onto
    //      the 番所 cot. See the GUARD COT block in Engine9.
    //    Off: global._guardRoomOgre = false. Knob: _guardOgreHpMult (2).
    if (global._guardRoomOgre !== false) {
      // 2× MORE HP (Mark 2026-08-05). The multiplier was already 2× base; "2x more" doubles it again [REF#DG-00551]
      // to 4×, which also keeps him above the 3× Building Inspector — the gate ogre should be the
      // harder body of the two, and he is now the toughest thing on floor 1.
      const _gHp = Math.round(hpForLevel(level) * ((typeof global._guardOgreHpMult === 'number') ? global._guardOgreHpMult : 4));
      const _gTaken = new Set(mobSpawns.map(m => m && m.x + ',' + m.z));
      for (const r of rooms_out) {
        if (!r || r.isGuardRoom !== true) continue;
        // The STAFF side, not the queue. The counter runs down the room's west face and the double doors [REF#DG-00552]
        // are north, so the public walks the north half; the ogre belongs at the far end, behind the
        // counter. Walk candidates from the south end back so it lands deepest-first.
        const _cands = [];
        for (let z = r.y + r.h - 2; z > r.y; z--) for (let x = r.x + 1; x < r.x + r.w - 1; x++) _cands.push([x, z]);
        let _at = null;
        for (const [cx, cz] of _cands) {
          const t = map[cx] && map[cx][cz];
          if (t && t.type === 'floor' && t.roomId === r.id && !_gTaken.has(cx + ',' + cz)) { _at = [cx, cz]; break; }
        }
        if (!_at) continue;   // no free floor — skip rather than stack two bodies on a tile [REF#DG-00553 → see REF#DG-00547]
        _gTaken.add(_at[0] + ',' + _at[1]);
        mobSpawns.push({
          id: 'guard-' + r.id, nameKey: 'ogre', name: 'Gate Ogre', type: 'monster',
          x: _at[0], z: _at[1], hp: _gHp, maxHp: _gHp,
          isHostile: false,          // asleep at its post; it wakes hostile on collision or a strike [REF#DG-00554 → see REF#DG-00548]
          isGuardOgre: true,         // the hook the engine's cot-sleep + future coat-check work keys on [REF#DG-00555]
          // ⚠ SIZE RIDES `targetHeight`, NOT `scale`. MEASURED: nothing in the engine reads `sp.scale` for [REF#DG-00556]
          //   a monster — the inspector block above has carried `scale: 1.6` since 08-04 and it has never
          //   done anything. `targetHeight` IS honoured (Engine9 ~:25820, the same lane the mummy and the
          //   hungry ghost use). 2.35 against a 1.75 goblin reads as an ogre without cartooning it.
          //   Knob: _guardOgreHeight.
          // SIZE IS NOT SET HERE. `targetHeight` drives scaleToHeight, which is Box3-based and therefore
          // BIND-POSE BLIND on this skinned rig — it under-scaled him and Mark saw no change. The ogre is
          // now scaled by a MULTIPLIER in Engine9 (window._ogreScale, default 2). See the note there.
          noFloat: true, meleeOnly: true,
          segmentId: r.segmentId,
          vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 },
        });
        // ── THE PUSH SIGNAL. Section0 has had one of these for floor 1 all along; floors 2+ had [REF#DG-01410]
        //    NONE, and its absence cost a whole bucketing run: the probe read "no log" as "never
        //    pushed" on a floor where no such log had ever existed. This push sits inside `if (_at)`
        //    -- no free tile means no entry and no ogre -- so the ABSENCE of this line is the
        //    diagnosis, which is only true if the line exists when the push DOES fire. [REF#DG-00555]
        try { console.log('[DungeonChain] Gate Ogre pushed for room ' + r.id + ' at (' + _at[0] + ','
              + _at[1] + '), ' + _gHp + ' hp, segmentId ' + r.segmentId + ', floor ' + level
              + ' — no such line means the push never fired (no free tile found).'); } catch (_) {}
        // ── THE GARRISON GROWS WITH DEPTH (Mark 2026-09-11 "guard room (which get better each level)", A3b GO [REF#DG-02032]
        //    2026-09-12): S0_TIERS[floor].garrison skeleton guards asleep in the 番所 beside the Gate Ogre, dealt
        //    from the same deepest-first candidate walk. Their id keeps the 'guard-' prefix so the room cap
        //    (UNIQUE_SPAWN_ID_RE) treats them as the room's identity, like the ogre. Floor 1 and 2: none.
        //    Off: global._guardGarrison = false.
        if (level >= 2 && global._guardGarrison !== false) {
          const _gar = Math.max(0, _s0Tier(level).garrison | 0);
          const _skG = MONSTER_ARCHETYPES.find(a => a.nameKey === 'skeleton_guard');
          const _skHp = (typeof _skG?.hpFlat === 'number') ? _skG.hpFlat : hpForLevel(level);
          let _n = 0;
          for (const [cx, cz] of _cands) {
            if (_n >= _gar) break;
            const t = map[cx] && map[cx][cz];
            if (!(t && t.type === 'floor' && t.roomId === r.id) || _gTaken.has(cx + ',' + cz)) continue;
            _gTaken.add(cx + ',' + cz);
            mobSpawns.push({ id: 'guard-' + r.id + '-skel-' + _n, nameKey: 'skeleton_guard', name: 'Skeleton Guard', type: 'monster',
              x: cx, z: cz, hp: _skHp, maxHp: _skHp, isHostile: false, isSkeleton: true, meleeOnly: true, noFloat: true,
              segmentId: r.segmentId, vulnerability: _skG?.vuln });
            _n++;
          }
          if (_n) { try { console.log('[DungeonChain] 番所 garrison: ' + _n + ' skeleton guard(s) asleep beside the Gate Ogre (floor ' + level + ', S0_TIERS). Off: global._guardGarrison=false'); } catch (_) {} }
        }
      }
    }
    // ── THE BARRACKS ROSTER: 6 WORKERS + 1 GUARD, ALL ASLEEP (Mark 2026-08-13) ────────────────── [REF#DG-00557]
    //    "it should house 6 workers and 1 guard. all sleeping."
    //    AUTHORED, NOT ROLLED. The generic per-room pass (~:3041) seeds 2-4 random archetypes into every
    //    ordinary room — imps, mummies, ghost packs — and it runs BEFORE this block. A barracks with a
    //    mummy in it is not a barracks, and 2-4 is not 6, so this CLEARS whatever landed in the room and
    //    lays the exact roster. That clear is why this must stay after the generic pass and after the
    //    inspector/guard blocks above.
    //    ALL SLEEPING COMES FREE, AND THAT IS DELIBERATE: floor-1 workers are born asleep engine-side
    //    (the born-asleep gate excludes only succubus/cabAudience/mimic), and `isHostile:false` matches
    //    the Gate Ogre's own "asleep at its post" idiom two blocks up. No new sleep flag is invented —
    //    a second way to say "asleep" is how the two drift apart.
    //    WORKERS ARE `yakuza_goblin` — the archetype the roster table already calls a worker (~:2846).
    //    BEDS FOLLOW AUTOMATICALLY: the furniture pass lays one bed per sleeper (cap _bedsPerRoomMax,
    //    default 16), so six sleepers is six occupied beds without touching the furniture seeder.
    //    ⚠ FPS: 7 sleepers in one room is 7 wrappers + Zzz sprites + floor discs + kanji rings, all
    //      drawables, no new materials and no new lights (E15) — but it IS a real drawable bump in a
    //      single room and should be census-checked against the 158-drawable baseline.
    //    Knobs: global._barracksWorkers (6) · _barracksGuard (true). Off: global._barracks = false.
    if (global._barracks !== false) {
      const _barRoom = rooms_out.find(r => r && r.isBarracks);
      if (_barRoom) {
        for (let i = mobSpawns.length - 1; i >= 0; i--) {
          const m = mobSpawns[i]; if (!m) continue;
          const t = map[m.x] && map[m.x][m.z];
          if (t && t.roomId === _barRoom.id) mobSpawns.splice(i, 1);   // the roster owns this room [REF#DG-00558]
        }
        const _tk = new Set(mobSpawns.map(m => m && m.x + ',' + m.z));
        const _free = [];
        for (let x = _barRoom.x + 1; x < _barRoom.x + _barRoom.w - 1; x++)
          for (let z = _barRoom.y + 1; z < _barRoom.y + _barRoom.h - 1; z++) {
            const t = map[x] && map[x][z];
            if (t && t.type === 'floor' && t.roomId === _barRoom.id && !_tk.has(x + ',' + z)) _free.push([x, z]);
          }
        const _wN = (typeof global._barracksWorkers === 'number') ? Math.max(0, global._barracksWorkers) : 6;
        const _wHp = hpForLevel(level);
        let _placed = 0;
        for (const [x, z] of _free) {
          if (_placed >= _wN) break;
          _tk.add(x + ',' + z);
          mobSpawns.push({
            id: 'barracks-worker-' + _barRoom.id + '-' + _placed, nameKey: 'yakuza_goblin', type: 'monster',
            x, z, hp: _wHp, maxHp: _wHp,
            isHostile: false,          // asleep on his bunk; wakes on collision or a strike, same as every worker [REF#DG-00559]
            segmentId: _barRoom.segmentId,
            vulnerability: { FIRE: 1.3, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 },
          });
          _placed++;
        }
        // The guard sleeps too (Mark: "all sleeping") — same isGuardOgre hook as the 番所 gate ogre, so [REF#DG-00560]
        // the engine's cot-sleep and coat-check work find him without a second code path.
        if (global._barracksGuard !== false) {
          const _spot = _free[_placed];
          if (_spot) {
            const _gHp2 = Math.round(hpForLevel(level) * ((typeof global._guardOgreHpMult === 'number') ? global._guardOgreHpMult : 3));
            mobSpawns.push({
              id: 'barracks-guard-' + _barRoom.id, nameKey: 'ogre', name: 'Barracks Guard', type: 'monster',
              x: _spot[0], z: _spot[1], hp: _gHp2, maxHp: _gHp2,
              isHostile: false, isGuardOgre: true, noFloat: true, meleeOnly: true,
              segmentId: _barRoom.segmentId,
              vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 },
            });
          }
        }
        try { console.log('[BARRACKS] room ' + _barRoom.id + ' (seg ' + _barRoom.segmentId + '): ' + _placed + ' worker(s) + ' + ((global._barracksGuard !== false && _free[_placed]) ? 1 : 0) + ' guard, all asleep. Off: global._barracks=false'); } catch(_){}
      }
    }
    // ── ONE ROOM, ONE CROWD — the per-room cap reconciled ACROSS EVERY PLACER (Mark 2026-08-13) ───── [REF#DG-00561]
    //    "why is there a room with more than 2 monsters? … no rooms should have so many monsters — fix
    //     map generation and monster spawn" + "for levels 2+ you can add an extra monster quantity to
    //     rooms up to our culling active monster hostile max."
    //
    //    ⚠ CAPPING THE ROOM GRAMMAR WAS NOT ENOUGH, and this is the whole reason this pass exists.
    //      MEASURED on the booted floor (scratch/probe-room-census2.js): the worker roll had already
    //      been cut to 2, yet 6 of 21 rooms still held 3-8 bodies, because SIX placers write into the
    //      same rooms and none of them can see the others — the room grammar, the flintlock imps, the
    //      skeleton debut pair, the per-section skeleton patrols, the hall spawner (whose corridor
    //      tiles carry a room's id), and the authored crews. Room 5 measured EIGHT: 2 grammar ghosts,
    //      a flintlock imp, 2 debut skeletons, 2 patrol skeletons and the inspector. A cap that lives
    //      inside any one placer can only ever be a cap on that placer's own contribution.
    //
    //    IDENTITY BODIES vs CREWS. A room's UNIQUE body is never counted and never trimmed — the
    //    section inspector (a CONTRACT: "exactly four exist, one per section"), the 番所 gate ogre, the
    //    barracks guard, the casino supervisor, the konbini keeper. Deleting one of those would not
    //    thin a room, it would delete the room's reason to exist, and "only special rooms have an ogre"
    //    is Mark keeping them, not capping them.
    //    Their CREWS are ordinary population and DO count (Mark 2026-08-14, approving the cut I had
    //    flagged and left for him): the barracks workers and the supervisor's imp escort now trim to
    //    the same cap as any other room. So the barracks reads guard + cap, the casino reads boss +
    //    cap — the set-piece survives, the crowd does not. Restore the untrimmed crews with
    //    global._crewExempt = true.
    //    ⚠ THE CABARET AND THE KONBINI ARE EXEMPT OUTRIGHT, crews included — they are hand-authored
    //      scenes (the cabaret is Mark's treasured set; the konbini is dedicated to his parents), not
    //      generated population, and no crowd rule should ever quietly edit them.
    //
    //    TRIM ORDER is lowest-intent-first, so what survives is what the room was actually built for:
    //    hall strays that merely landed on a room tile, then patrols, then the debut pair, then
    //    flintlock imps, then crews, and only then the room's own grammar.
    //    Off: global._roomCrowdCap = false. Override the number: global._roomMonsterCap = N.
    if (global._roomCrowdCap !== false) {
      const _hostileMax2 = (typeof window !== 'undefined' && typeof window._aggroHostileMax === 'number')
                         ? window._aggroHostileMax : 6;
      const _cap2 = (typeof global._roomMonsterCap === 'number')
                  ? Math.max(1, global._roomMonsterCap)
                  : Math.max(1, Math.min(_hostileMax2, 2 + Math.max(0, level - 1)));
      // UNIQUE = the room's identity, never counted, never trimmed. [REF#DG-00562]
      // ⚠ NOW AN ALIAS of the module-scope UNIQUE_SPAWN_ID_RE (top of file), which is exported on the
      //   API so Engine9's karma thinner can consult the SAME list. Kept as `_unique` so the readers
      //   below are untouched. The prefix ORDER note lives with the definition.
      const _unique = UNIQUE_SPAWN_ID_RE;
      // Hand-authored scenes, exempt outright including crews. [REF#DG-00563]
      const _sceneExempt = /^(cab-|konbini-|room0-)/;
      const _crewExempt = (global._crewExempt === true);
      const _crew = /^(barracks-worker-|imp-L)/;
      // TRIM ORDER — lowest survives last. RARITY DECIDES, not placement order, and this ordering was [REF#DG-00564]
      // corrected after MEASURING the first version: ranking the skeletons as "extras" trimmed the
      // debut pair AND every patrol to zero on floor 1, which would have silently deleted the skeleton
      // debut Mark asked for on 07-26 — a crowd rule quietly killing a feature is exactly the kind of
      // no-register disable this repo has been burned by. A goblin is the most replaceable body on the
      // floor and a once-per-floor debut is the least, so generic grammar now yields to both.
      const _rank = id => /^hall-mob-/.test(id) ? 0            // strays that merely landed on a room tile
                        : /^skel-debut-/.test(id) ? 4          // once per floor — protected
                        : /^skel-patrol-/.test(id) ? 3         // one pair per section
                        : /^flintlock-imp-/.test(id) ? 2
                        : _crew.test(id) ? 2
                        : 1;                                   // grammar goblins/ghosts/mummies [REF#DG-00565]
      const _rooms = new Map();
      for (const sp of mobSpawns) {
        if (!sp || sp.type !== 'monster') continue;
        const t = map[sp.x] && map[sp.x][sp.z];
        if (!t || t.hall === true) continue;              // corridor bodies are not room population [REF#DG-00566]
        const rid = t.roomId;
        if (!(rid >= 2)) continue;                        // landing + cabaret are authored end to end [REF#DG-00567]
        const _id = String(sp.id || '');
        if (_unique.test(_id) || _sceneExempt.test(_id)) continue;
        if (_crewExempt && _crew.test(_id)) continue;
        if (!_rooms.has(rid)) _rooms.set(rid, []);
        _rooms.get(rid).push(sp);
      }
      const _cut = new Set();
      for (const [, list] of _rooms) {
        if (list.length <= _cap2) continue;
        list.sort((a, b) => _rank(String(a.id)) - _rank(String(b.id)));
        for (let i = 0; i < list.length - _cap2; i++) _cut.add(list[i]);
      }
      if (_cut.size) {
        for (let i = mobSpawns.length - 1; i >= 0; i--) if (_cut.has(mobSpawns[i])) mobSpawns.splice(i, 1);
        try { console.log('[ROOM CAP] level ' + level + ': cap ' + _cap2 + '/room (ordinary bodies) — trimmed ' + _cut.size
          + '. Off: global._roomCrowdCap=false'); } catch (_) {}
      }
    }
    for (const sp of mobSpawns) sp.segmentId = map[sp.x]?.[sp.z]?.segmentId ?? rooms_out[map[sp.x]?.[sp.z]?.roomId]?.segmentId ?? 0;

    // RING (Phase G1, 2026-06-27): emit the top-level `gates` array (empty/undefined for spine/tree). Each entry collects its [REF#DG-00568]
    // ── STARLETTE'S WEST WING (Mark 2026-07-31) ─────────────────────────────────────────────────────
    //    "the caberet will be center of the entire dungeon, it is abandoned -- starlet is in her dressing
    //     room singing to herself and crying. so create her small dressing room attached to small hallway
    //     attached to the management sign to the caberet on the west wall. it has enough space to handle
    //     the managers office and starlettes dressing room with small hallway connecting both. the
    //     managers office has the keys to the stairs down."
    //
    //    ⚠ WHY THIS IS STAMPED HERE AND NOT CARVED IN COMPACT SPACE. The generator's grid is GW=66 centred
    //    in the 128-wide engine map, so OX = (128-66)>>1 = 31 — and floor 1's cabaret starts at compact
    //    x3, i.e. world x34. There are only THREE compact columns west of it (x0-2). Two rooms and a
    //    hallway do not fit. The alternatives were both worse: shifting CABX east re-bases the head, and
    //    widening GW moves OX, changes the body's rectangle and therefore the room-subdivision RNG — which
    //    would relayout EVERY floor in the game to add a room to one. Stamping into the engine map after
    //    the compact grid is emitted cannot perturb a single existing tile, a single _rand() draw, or any
    //    other floor. The wing lands in world x24-33, which the map shows as solid rock.
    //
    //    Placed off the CABARET'S EMITTED BOX rather than hardcoded, so it follows the room if it moves.
    //    Fixed geometry, zero RNG draws — the same discipline the konbini carve documents.
    // `!_sec0WingCarved`: _buildSection0 carves this wing for real in compact space (three rooms off a
    // 1-tile hall, Mark 2026-08-03). When it has, stamping a second two-room wing over the same tiles
    // would overwrite its vault and its doors — see the flag's declaration.
    // ⚠ `!_headRoomsOnly()` TOO (Mark 2026-08-24). `_sec0WingCarved` only goes true when the generator
    //   actually carved the wing, so under hallway+cabaret+guard it stays FALSE and this post-hoc stamp
    //   happily rebuilt the dressing room and manager's office the trim had just removed — MEASURED,
    //   the console printed "[MAP] west wing: office x43-45 ... dressing x37-39 (ids 3/4)" on a floor
    //   that was supposed to hold three rooms. Two writers of one wing; this is the other one.
    if (level === 1 && !_sec0WingCarved && !_headRoomsOnly() && rooms_out[1] && rooms_out[1].isCabaret) {
      try {
        const cab = rooms_out[1];
        // ── THE WEST WING IS AN ANNEX, NOT PART OF THE HEART'S TWO ROOMS (Mark 2026-08-03: [REF#DG-00569]
        //    "section 0 = 2 rooms = room 1 + room 2 only"). The manager's office + dressing room were
        //    hardcoded segmentId 0 in five places, which is why section 0 measured FOUR rooms and its
        //    box stretched 27 tiles west of the cabaret instead of hugging the hallway and the cabaret.
        //    SCOPED ON PURPOSE: only the quadrant topology — the one Mark is designing this rule for —
        //    moves them. The shipped L-hall default keeps segment 0 exactly as it is, so his current
        //    game does not change tagging underneath him.
        //    ⚠ OPEN QUESTION FOR MARK, deliberately not decided here: these two rooms sit physically
        //    against the cabaret's west wall and are visible through its doorway, so putting them in a
        //    quadrant means section residency can hibernate them while the player stands in the Heart
        //    looking straight at them. Default 3 (the west quadrant) is a placement, not a ruling.
        //    Override: window._westWingSegment (any integer, 0 restores the old Heart tagging).
        const _WW = (typeof window !== 'undefined') ? window : {};
        //    UPDATED 2026-08-03 (Mark: "4 rooms for each section + 1 special room"): the wing must belong [REF#DG-00570]
        //    to NO section, not to section 3. Parking it in a quadrant made that section report SIX rooms
        //    — its 4 + 1 plus these two 3x3 annexes — which breaks the budget Mark just specified. -1 is
        //    "no section": section 0 stays two rooms, sections 1-4 stay 4+1, and the wing is neither.
        const _wwSeg = Number.isInteger(_WW._westWingSegment) ? _WW._westWingSegment
                     : (_WW._quadrantDungeon ? -1 : 0);
        const zMid = cab.y + 2;                    // the row the doors line up on [REF#DG-00571]
        const z0 = zMid - 1, z1 = zMid + 1;        // 3 deep, centred on that row [REF#DG-00572]
        const put = (x, z, t) => {
          if (x < 1 || z < 1 || x >= MAP_W - 1 || z >= MAP_H - 1) return false;
          map[x][z] = t; return true;
        };
        const officeId = rooms_out.length, dressId = rooms_out.length + 1;
        const flo = (id) => ({ type: 'floor', room: true, roomId: id, segmentId: _wwSeg });
        // Laid out east→west from the cabaret's west edge: door · office · door · hall · door · dressing. [REF#DG-00573]
        const oX1 = cab.x - 2, oX0 = cab.x - 4;                    // manager's office interior (3 wide) [REF#DG-00574]
        const hallX = cab.x - 6;                                   // the small hallway between them [REF#DG-00575]
        const dX1 = cab.x - 8, dX0 = cab.x - 10;                   // dressing room interior (3 wide) [REF#DG-00576]
        let ok = dX0 >= 1;
        if (ok) {
          for (let x = oX0; x <= oX1; x++) for (let z = z0; z <= z1; z++) put(x, z, flo(officeId));
          for (let x = dX0; x <= dX1; x++) for (let z = z0; z <= z1; z++) put(x, z, flo(dressId));
          put(hallX, zMid, { type: 'floor', hall: true, roomId: officeId, segmentId: _wwSeg });
          // Shoji doors, matching the cabaret's own doorway vocabulary. [REF#DG-00577]
          const door = (id) => ({ type: 'shoji_door', roomId: id, segmentId: _wwSeg, panelless: false });
          // ⚠ THE CABARET'S WEST EDGE IS NOT cab.x ON EVERY ROW. The room is thin-walled and its emitted [REF#DG-00578]
          // box is the bounding box, but the floor itself steps in — on the door row the westmost cabaret
          // FLOOR tile measured x35 while cab.x is 34. A door at cab.x-1 therefore opened into solid wall
          // and the whole wing was unreachable (caught by reading the live map, not by trusting the box).
          // Find the real edge, put the door against it, and bridge any gap back to the office.
          // ── JOINING TO THE CABARET: FIND A ROW WHERE ITS FLOOR ACTUALLY REACHES WEST ───────────────
          //    Two things bit here and both are recorded because either alone would send the next reader
          //    in circles:
          //    (1) cab.x is the BOUNDING BOX, not the floor. The cabaret is thin-walled and steps in, so
          //        on the middle row its westmost FLOOR tile is x35 while cab.x is 34.
          //    (2) A post-generation pass in the engine REBUILDS ROOM PERIMETERS. Measured: a shoji_door
          //        written here at x33 arrives in the live map as {type:'wall'} while KEEPING the roomId
          //        and panelless fields this code set — i.e. mutated in place, not replaced. The office,
          //        hallway and dressing room all survive intact; only the tiles sitting on a room's box
          //        perimeter get walled. So a door placed there cannot survive, however it is written.
          //    The join therefore goes on the row where the cabaret's own FLOOR extends furthest west, and
          //    the office is widened to touch it — an open passage between two floors, like the cabaret's
          //    south entrance, rather than a door on a perimeter tile that something else owns.
          let joinZ = -1, joinX = -1;
          for (let z = z0; z <= z1 && joinZ < 0; z++) {
            for (let x = cab.x; x < cab.x + cab.w; x++) {
              const t = map[x] && map[x][z];
              if (t && t.type === 'floor' && t.roomId === 1) {
                if (x - 1 > oX1) { joinZ = z; joinX = x; }
                break;
              }
            }
          }
          if (joinZ >= 0) {
            for (let x = oX1 + 1; x < joinX; x++)                  // widen the office east until it touches [REF#DG-00579]
              put(x, joinZ, { type: 'floor', room: true, roomId: officeId, segmentId: _wwSeg });
          }
          put(cab.x - 5, zMid, door(officeId));                    // office → hallway [REF#DG-00580]
          put(cab.x - 7, zMid, door(dressId));                     // hallway → dressing room [REF#DG-00581]
          const mk = (id, x0, name, nameEn, extra) => Object.assign({
            id, x: x0, y: z0, w: 3, h: 3, cx: x0 + 1, cz: zMid,
            center: { x: x0 + 1, y: zMid }, roomName: name, roomNameEn: nameEn,
            roomType: 'room', segmentId: _wwSeg, section: 'entry', depthHops: 0,
          }, extra || {});
          rooms_out[officeId] = mk(officeId, oX0, '支配人室', "Manager's Office", { isManagerOffice: true });
          rooms_out[dressId]  = mk(dressId,  dX0, '楽屋',     'Dressing Room',    { isDressingRoom: true });
          try { console.log('[MAP] west wing: office x' + oX0 + '-' + oX1 + ' · hall x' + hallX
            + ' · dressing x' + dX0 + '-' + dX1 + ' @ z' + z0 + '-' + z1
            + ' (ids ' + officeId + '/' + dressId + ')'
            + ' · join=' + joinX + ',' + joinZ
           ); } catch (_) {}
        } else {
          try { console.warn('[MAP] west wing skipped — no room west of the cabaret at x' + cab.x); } catch (_) {}
        }
      } catch (e) { try { console.warn('[MAP] west wing failed (floor is unaffected):', e); } catch (_) {} }
    }

    // ── THE HEART RING — A SQUARE 2-TILE HALLWAY AROUND THE CABARET (Mark 2026-07-31) ────────────── [REF#DG-00582]
    //    "a square 2 tile hallway around the caberet. the south side will be just the player entering
    //     the dungeon, so the east exit will be to see the MAIN entrance to the entire dungeon which
    //     encircles this center heart (the caberet) so its centric to the entire dungeon floor plan now"
    //
    //    THE FLOOR PLAN THIS SERVES. The cabaret stops being a room you find and becomes the thing the
    //    dungeon is built around: the heart, ringed by its own corridor, with each section hanging off
    //    that ring and running its own central room (FACTORY, CAFETERIA) full of sleeping workers. The
    //    ring is what makes "centric" true in geometry rather than in narration.
    //
    //    IT ENCLOSES THE WEST WING, NOT JUST THE ROOM. A ring hugging the cabaret's own walls would run
    //    its west arm straight through the manager's office (measured: office x30-33, a 2-tile west arm
    //    wants x31-32). So the ring is drawn around the whole HEART — cabaret plus dressing room, back
    //    hallway and office — which is also what it should be architecturally: a backstage corridor.
    //
    //    ⚠ EVERY BOUND BELOW IS MEASURED OFF THE LIVE MAP, NOT ASSUMED. On the emitted floor 1 the
    //    cabaret floor is x34-38 / z48-52 and the wing runs west to x24, so the enclosed block with its
    //    own walls is x23-39 / z47-53 and the ring lands on x21-41 / z45-55. Two of the four arms are
    //    already occupied by exactly the right thing, which is why this geometry was chosen:
    //      · SOUTH (z54-55) crosses the ENTRANCE CORRIDOR at x35-36 — the player walks up from the
    //        stairs and arrives in the ring. Mark: "the south side will be just the player entering".
    //      · EAST (x40-41) crosses the EXISTING MAIN HALL at z50-51 — the way out to the rest of the
    //        dungeon. Mark: "the east exit will be to see the MAIN entrance to the entire dungeon".
    //    North and west are solid rock and are pure carve.
    //
    //    ⚠ ROCK ONLY — THIS CANNOT DAMAGE ANYTHING THAT ALREADY EXISTS. Every write goes through carve(),
    //    which refuses any tile that is not rock/empty. That is what makes the two deliberate overlaps
    //    above safe: the entrance corridor and the main hall keep their own tiles, their own roomIds and
    //    their own segment ids, and the ring simply meets them. It also means this cannot perturb a
    //    single _rand() draw or any other floor — same discipline as the west wing above.
    //
    //    ⚠ RING TILES CARRY roomId 0, NOT THE CABARET'S 1. Two constraints meet here and only one value
    //    satisfies both. (a) _assertContract below refuses ANY non-wall tile without roomId >= 0, so
    //    leaving it undefined fails the map outright — measured, it threw at 23,50 and the engine never
    //    booted. (b) Tagging the ring with the cabaret's id 1 would be worse than a crash because it
    //    would boot: room-scoped state (s.inCabaret, the dormancy hush, the quest step-on) keys off the
    //    player's tile roomId, so walking the corridor OUTSIDE the room would count as being inside it
    //    and fire the treasured scene's cues early. 0 is the generator's own answer for a corridor that
    //    belongs to no room — see the CORR branch at ~:1521, `roomId: corrId[gx][gy] >= 0 ? … : 0` —
    //    and it is also true here: the ring IS the entrance hall, continuous with the landing.
    //
    //    ⚠ THE MAP'S SOLID IS 'wall'. THERE IS NO 'rock' TYPE. The contract's `known` table lists exactly
    //    wall / floor / shoji_door / stairs_up / stairs_up_r / stairs_down. A first cut of this carve
    //    tested for 'rock' and therefore matched nothing at all — it logged "carved 0 tiles, met 116
    //    existing" and looked like a placement conflict rather than a typo. Carve tests for 'wall' with
    //    NO roomId, which is the generator's undifferentiated fill; every wall that belongs to a room's
    //    perimeter carries that room's id and is left alone.
    if (level === 1 && !_heartRingCarved && rooms_out[1] && rooms_out[1].isCabaret) {
      try {
        const cab = rooms_out[1];
        const inB = (x, z) => x >= 1 && z >= 1 && x < MAP_W - 1 && z < MAP_H - 1;
        const tileAt = (x, z) => (inB(x, z) ? (map[x] && map[x][z]) : null);
        // Undifferentiated fill: solid, and owned by nothing. A room's perimeter wall carries its id. [REF#DG-00583]
        const isFill = (x, z) => { const t = tileAt(x, z); return !!t && t.type === 'wall' && !(t.roomId >= 0); };
        let carved = 0, met = 0, healed = 0;
        const lay = (x, z, extra) => {
          map[x][z] = Object.assign({ type: 'floor', hall: true, ring: true, roomId: 0, segmentId: 0 }, extra || {});
        };

        // ── THE BLOCK IS MEASURED, NOT DERIVED FROM cab.w/cab.h ──────────────────────────────── [REF#DG-00584]
        //    The emitted box does not agree with the floor: cab.h is 6 while the cabaret's floor is
        //    five rows (z48-52), so `cab.y + cab.h` lands a row PAST the south wall and the doorway
        //    computed from it opened into the entrance corridor instead of into the room. Scanning for
        //    the real floor extents costs one pass and cannot drift when the head is re-tuned.
        let cfx0 = 1e9, cfx1 = -1e9, cfz0 = 1e9, cfz1 = -1e9;
        for (let x = 1; x < MAP_W - 1; x++) for (let z = 1; z < MAP_H - 1; z++) {
          const t = map[x][z];
          if (!t || t.type !== 'floor' || t.hall || t.roomId !== 1) continue;
          if (x < cfx0) cfx0 = x; if (x > cfx1) cfx1 = x;
          if (z < cfz0) cfz0 = z; if (z > cfz1) cfz1 = z;
        }
        // …and the west wing, so the ring encloses the whole heart rather than cutting the office. [REF#DG-00585]
        let wingX0 = cfx0;
        for (const R of rooms_out) if (R && (R.isManagerOffice || R.isDressingRoom)) wingX0 = Math.min(wingX0, R.x);

        // The enclosed block = heart + wing + the wall ring they already sit inside. [REF#DG-00586]
        const blkX0 = Math.min(cfx0, wingX0) - 1, blkX1 = cfx1 + 1;
        const blkZ0 = cfz0 - 1,                   blkZ1 = cfz1 + 1;
        // …and the 2-tile corridor immediately outside it. [REF#DG-00587]
        const rX0 = blkX0 - 2, rX1 = blkX1 + 2, rZ0 = blkZ0 - 2, rZ1 = blkZ1 + 2;
        const okBounds = cfx1 > 0 && rX0 >= 1 && rZ0 >= 1 && rX1 < MAP_W - 1 && rZ1 < MAP_H - 1;
        if (okBounds) {
          for (let x = rX0; x <= rX1; x++) for (let z = rZ0; z <= rZ1; z++) {
            const onRing = (x <= blkX0 - 1) || (x >= blkX1 + 1) || (z <= blkZ0 - 1) || (z >= blkZ1 + 1);
            if (!onRing) continue;
            if (isFill(x, z)) { lay(x, z); carved++; continue; }
            const t = tileAt(x, z);
            if (t && t.type === 'floor') { met++; continue; }   // corridor / main hall — leave it alone [REF#DG-00588]
            // ── HEAL: a perimeter wall standing IN the corridor's path ────────────────────────── [REF#DG-00589]
            //    The ring's south arm crosses the entrance corridor, so it also crosses that
            //    corridor's own side walls (x34 and x37 at z54-55). Those carry a roomId, so the fill
            //    test skips them — and skipping them severs the ring into two dead ends either side
            //    of the corridor. They are OUTSIDE the enclosed block by construction, so opening
            //    them cannot breach the cabaret or the wing; it turns the top of the corridor into
            //    the junction it has to be for the player to arrive and go left or right.
            if (t && t.type === 'wall') { lay(x, z, { ringHeal: true }); healed++; }
          }
          // ── THE DOORWAYS THE RING NEEDS ──────────────────────────────────────────────────────── [REF#DG-00590]
          //    The only writes that deliberately breach the BLOCK, so each one is named and counted.
          //    South: the cabaret's own south wall on the two columns the entrance corridor arrives on
          //    — the player's way in from the stairs, and the same seam floor 1 already treats as an
          //    open gap (_l1Open marks the cabaret side .doors=['S'] so no pane is drawn there).
          //    West: one tile through the dressing room's outer wall, so the ring is a real backstage
          //    loop rather than a corridor with a dead side.
          //    ⚠ Whether these survive is NOT decided here — the engine's perimeter-rebuild pass has
          //    already re-walled one door written from this file. That is what `ringDoor` is for:
          //    it survives the rebuild even when `type` does not, so probe-heart-ring.js can read back
          //    {ringDoor:'south-entry', type:'wall'} and convict the rebuild by name.
          const open = (x, z, why) => {
            const t = tileAt(x, z); if (!t) return;
            if (t.type === 'floor') return;               // already open — nothing owed [REF#DG-00591]
            lay(x, z, { ringDoor: why });
          };

          // ── THE DUNGEON'S FRONT DOOR (Mark 2026-07-31) ──────────────────────────────────────── [REF#DG-00592]
          //    "the 2-tile wide hallway needs to be totally around the caberet, so the dungeon wall
          //     directly to the east of the caberet should be official start of dungeon, so you can
          //     add an additional 2tile entrance across caberet doors, its just closed from both
          //     sides."
          //
          //    THE RING IS ALREADY A CLOSED LOOP EVERYWHERE BUT HERE. Measured on the live floor: the
          //    east arm (x40-41) is walled off at x42 on every row EXCEPT z50-51, where it opens
          //    straight into the main hall and runs unbroken to x52 and beyond. That one gap is why
          //    the east side reads as a junction rather than a corridor. Closing it with a door does
          //    two things at once — it completes the 2-tile ring, and it makes the threshold into the
          //    rest of the dungeon an actual event instead of a place where the wall stops.
          //
          //    IT LANDS DIRECTLY ACROSS FROM THE CABARET'S OWN DOORS (registered at x38, z50-51), so
          //    standing at the dungeon's front door you are looking down a short corridor straight at
          //    the heart. That alignment is not arranged here — it is why these are the rows that were
          //    open in the first place, and the leak scan below finds them rather than assuming them.
          //
          //    ⚠ A DOOR, NOT A SEAL. "Closed from both sides" is a closed door, and it has to stay
          //    openable: this is the ONLY tile-level connection between the ring and the rest of the
          //    floor, so a permanent seal would strand the player in the loop with the stairs down
          //    unreachable. shoji_door is the engine's ordinary openable door and the contract accepts
          //    it. It is NOT a sectionGate — the contract demands exactly four of those or none, so a
          //    fifth would fail the map outright.
          //    Off: window._dungeonFrontDoor = false (leaves the gap open, pre-2026-07-31 behaviour).
          if (typeof window === 'undefined' || window._dungeonFrontDoor !== false) {
            const _eastX = rX1 + 1;                       // the wall column just outside the ring [REF#DG-00593]
            const _gate = [];
            for (let z = rZ0; z <= rZ1; z++){
              const t = tileAt(_eastX, z);
              if (t && t.type === 'floor') _gate.push(z); // the ring leaks east here [REF#DG-00594]
            }
            //    ⚠ `glass` IS DATA ONLY — THERE IS NO RENDERER FOR IT YET. Mark asked, tentatively, [REF#DG-00595]
            //    for glass windows here so the player can see into the old cabaret from the dungeon's
            //    threshold. The engine has no window-in-a-wall concept at all: the only glass in the
            //    build is the vending machine's pane (a textured plane, ~Engine9:9589) and the loot
            //    card's bubble. Adding one means a door-material variant, which is its own change and
            //    his call. The flag is written so the tiles are already marked when that lands — it is
            //    NOT a working feature, and nothing reads it. Do not mistake this for one.
            for (const z of _gate){
              map[_eastX][z] = { type: 'shoji_door', roomId: 0, segmentId: 0, panelless: false,
                                 dungeonFrontDoor: true, glassWanted: true };
            }
            try { console.log('[MAP] dungeon front door: x' + _eastX + ' rows ' + JSON.stringify(_gate)
              + ' (across from the cabaret doors) — ring is now a closed 2-tile loop'); } catch (_) {}

            // ── A THREE-WAY CHOICE AT THE HEART'S DOOR (Mark 2026-07-31) ────────────────────── [REF#DG-00596]
            //    "place double doors on the other hallways leading east and west, both, the ones
            //     right in front of caberet so it looks like a 3 way choice ... each of the east and
            //     west are part of the other sections of the dungeon, so they branch off already"
            //
            //    Standing at the cabaret's own doors (x38, z50-51) and looking out, the player now
            //    faces three double doors: straight ahead into the dungeon (the front door above),
            //    and one to each side where the ring corridor carries on north and south. The ring
            //    already goes both ways — this is what makes that legible as a CHOICE rather than a
            //    corridor you happen to be standing in.
            //
            //    PLACED ON THE ROWS THAT BRACKET THE CABARET'S OWN DOORWAY, so the three sets sit in
            //    one sightline. Both leaves of each pair are written, because a 2-tile corridor needs
            //    2 tiles of door — a single leaf would leave a walk-around gap beside it and the
            //    choice would not read.
            //    Off: window._heartThreeWay = false.
            if (typeof window === 'undefined' || window._heartThreeWay !== false) {
              const _armX = [rX1 - 1, rX1];             // the ring's east arm, both tiles wide [REF#DG-00597]
              const _north = Math.min(..._gate) - 1, _south = Math.max(..._gate) + 1;
              const _put = (x, z, side) => {
                const t = tileAt(x, z); if (!t) return false;
                if (t.type !== 'floor') return false;   // only ever across an open corridor tile [REF#DG-00598]
                map[x][z] = { type: 'shoji_door', roomId: 0, segmentId: 0, panelless: false,
                              heartGate: side, stayOpen: true };
                return true;
              };
              let _n = 0, _s = 0;
              if (_gate.length) {
                for (const x of _armX) { if (_put(x, _north, 'north')) _n++; if (_put(x, _south, 'south')) _s++; }
              }
              try { console.log('[MAP] heart three-way: ' + _n + ' north leaf/leaves at z' + _north
                + ' · ' + _s + ' south at z' + _south + ' · east front door at x' + _eastX
                + ' — three double doors in one sightline from the cabaret doorway'); } catch (_) {}
            }

            // ── THE RING NEEDS TO OPEN NORTH AND WEST TOO (Mark 2026-08-01) ──────────────────── [REF#DG-00599]
            //    "lets have openings for NORTH and WEST parts of the dungeon as well as the EAST,
            //     otherwise it looks wierd."
            //
            //    He is right about the shape. Everything the generator builds lies EAST and SOUTH of
            //    the heart — measured, the hall box is x28-91 / z48-77 and every tile north of z45 or
            //    west of x21 is solid fill — so the ring came out as a loop with exactly one way out.
            //    A hub with one exit reads as a corridor that happens to bend.
            //
            //    Each opening is a 2-tile mouth in the ring's OUTER wall plus a short stub corridor
            //    into the rock, ending at its own double-door gate. The stub is what stops the mouth
            //    being a hole in a wall with nothing behind it, and it is the attachment point for the
            //    section that goes there later — Mark's FACTORY and CAFETERIA. They are DEAD ENDS
            //    until those are built, and that is stated here rather than discovered: this is
            //    geometry for a floor plan that does not exist yet.
            //    Off: window._heartSideOpenings = false. Stub length: _heartStubTiles (default 4).
            if (typeof window === 'undefined' || window._heartSideOpenings !== false) {
              const _stub = (typeof window !== 'undefined' && typeof window._heartStubTiles === 'number')
                ? window._heartStubTiles : 4;
              const _midZ = Math.round((rZ0 + rZ1) / 2), _midX = Math.round((rX0 + rX1) / 2);
              // [ name, mouth tiles (on the ring's outer wall), step direction ] [REF#DG-00600]
              const _sides = [
                ['north', [[_midX - 1, rZ0 - 1], [_midX, rZ0 - 1]], [0, -1]],
                ['west',  [[rX0 - 1, _midZ - 1], [rX0 - 1, _midZ]], [-1, 0]],
              ];
              for (const [name, mouth, dir] of _sides) {
                let ok = true, cut = 0;
                // Carve the stub first — if it cannot be carved, do not punch the mouth and leave a [REF#DG-00601]
                // hole opening onto nothing.
                for (const [mx, mz] of mouth) {
                  for (let s = 1; s <= _stub; s++) {
                    const x = mx + dir[0] * s, z = mz + dir[1] * s;
                    if (!isFill(x, z)) { ok = false; break; }
                  }
                  if (!ok) break;
                }
                if (!ok) { try { console.warn('[MAP] heart ' + name + ' opening skipped — no rock to carve'); } catch (_) {} continue; }
                for (const [mx, mz] of mouth) {
                  if (isFill(mx, mz)) { lay(mx, mz, { heartMouth: name }); cut++; }
                  for (let s = 1; s <= _stub; s++) {
                    const x = mx + dir[0] * s, z = mz + dir[1] * s;
                    if (isFill(x, z)) { lay(x, z, { heartStub: name }); cut++; }
                  }
                }
                // The gate sits at the FAR end of the stub, so the player walks a corridor to it. [REF#DG-00602]
                for (const [mx, mz] of mouth) {
                  const gx = mx + dir[0] * _stub, gz = mz + dir[1] * _stub;
                  const t = tileAt(gx, gz);
                  if (t && t.type === 'floor')
                    map[gx][gz] = { type: 'shoji_door', roomId: 0, segmentId: 0, panelless: false,
                                    heartGate: name, stayOpen: true };
                }
                try { console.log('[MAP] heart ' + name + ' opening: mouth ' + JSON.stringify(mouth)
                  + ' + ' + _stub + '-tile stub · ' + cut + ' tiles carved · gate at the far end'
                  + ' (DEAD END until the ' + name + ' section is built)'); } catch (_) {}
              }
            }
          }
          // ── WHICH COLUMNS GET THE SOUTH DOOR: THE ENTRANCE CORRIDOR'S, AND ONLY THOSE ────────── [REF#DG-00603]
          //    ⚠ `roomId === 0` ALONE IS NOT THE TEST, and getting that wrong demolished the entire
          //    south wall on the first run (logged "south cols [23…39]" — all seventeen). The ring
          //    tiles laid moments earlier ALSO carry roomId 0, by the deliberate choice documented
          //    above, so every column matched. The corridor is what is left after excluding this
          //    carve's own work: roomId 0 AND not a tile this pass wrote.
          const ent = rooms_out[0];
          const sCols = [];
          for (let x = blkX0; x <= blkX1; x++) {
            const below = tileAt(x, blkZ1 + 1);
            if (below && below.type === 'floor' && below.roomId === 0 && !below.ring) sCols.push(x);
          }
          const cols = sCols.length ? sCols : [ent ? ent.cx : cfx0 + 1];
          for (const x of cols) open(x, blkZ1, 'south-entry');
          open(blkX0, cfz0 + 2, 'west-backstage');        // through the dressing room's west wall [REF#DG-00604]
          try { console.log('[MAP] heart ring: x' + rX0 + '-' + rX1 + ' z' + rZ0 + '-' + rZ1
            + ' · carved ' + carved + ' · healed ' + healed + ' · met ' + met + ' existing (corridor + main hall)'
            + ' · block x' + blkX0 + '-' + blkX1 + ' z' + blkZ0 + '-' + blkZ1
            + ' · cabaret floor x' + cfx0 + '-' + cfx1 + ' z' + cfz0 + '-' + cfz1
            + ' · south cols ' + JSON.stringify(cols)); } catch (_) {}
        } else {
          try { console.warn('[MAP] heart ring skipped — would leave the map bounds'); } catch (_) {}
        }
      } catch (e) { try { console.warn('[MAP] heart ring failed (floor is unaffected):', e); } catch (_) {} }
    }

    // 2 gate DOOR tiles in 128×128 ENGINE coords (same compact→engine offset as the tile loop). ADDITIVE — undefined when no gates. [REF#DG-00605]
    let gates;
    if (_segmentGateTiles.size || _sectionGateTiles.size) {
      const byIdx = new Map();
      for (const [key, gi] of _segmentGateTiles) {
        const [gx, gy] = key.split(',').map(Number);
        let g = byIdx.get('segment:' + gi.gateIndex);
        if (!g) { g = { kind: 'segment', gateIndex: gi.gateIndex, segmentFrom: gi.segmentFrom, segmentTo: gi.segmentTo, tiles: [] }; byIdx.set('segment:' + gi.gateIndex, g); }
        g.tiles.push([gx + OX, gy + OY]);
      }
      for (const [key, gi] of _sectionGateTiles) {
        const [gx, gy] = key.split(',').map(Number);
        let g = byIdx.get('section:' + gi.gateIndex);
        if (!g) { g = { kind: 'section', gateIndex: gi.gateIndex, sectionFrom: gi.sectionFrom, sectionTo: gi.sectionTo, tiles: [] }; byIdx.set('section:' + gi.gateIndex, g); }
        g.tiles.push([gx + OX, gy + OY]);
      }
      gates = [...byIdx.values()].sort((a, b) => a.gateIndex - b.gateIndex);
    }

    const segmentIds = [...new Set(rooms_out.filter(Boolean).map(r => r.segmentId))].sort((a, b) => a - b);
    const segments = segmentIds.map(id => {
      const roomIds = rooms_out.filter(r => r && r.segmentId === id).map(r => r.id);
      let minX = MAP_W, minZ = MAP_H, maxX = 0, maxZ = 0;
      for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_H; z++) if (map[x][z]?.segmentId === id) { minX = Math.min(minX, x); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z); }
      return { id, roomIds, bounds: { minX, minZ, maxX, maxZ }, entranceGate: id > 0 ? id - 1 : null, exitGate: id < segmentIds.length - 1 ? id : null };
    });

    _assertContract(map, rooms_out, spawnX, spawnZ, MAP_W, MAP_H, level, casinoId, gates, casinoRoom, cidToFinal, crooms);
    return { map, rooms: rooms_out, spawnX, spawnZ, mobSpawns, gates: gates || [], segments };
  }

  function _walkable(map, x, z) { const t = map[x] && map[x][z]; return !!t && (t.type === 'floor' || t.type === 'shoji_door' || t.type === 'stairs_up' || t.type === 'stairs_up_r' || t.type === 'stairs_down'); }
  function _nearestWalkable(map, x, z) {
    for (let r = 1; r < 20; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const nx = x + dx, nz = z + dz; if (_walkable(map, nx, nz)) return [nx, nz]; }
    return [x, z];
  }
  // post-gen integrity gate (fail loud rather than ship a map that crashes the engine) [REF#DG-00606]
  function _assertContract(map, rooms_out, spawnX, spawnZ, MAP_W, MAP_H, level, casinoId, gates, casinoRoom, cidToFinal, crooms) {
    if (!_walkable(map, spawnX, spawnZ)) throw new Error('DungeonChain: spawn (' + spawnX + ',' + spawnZ + ') is not walkable');
    const ids = rooms_out.map(r => r.id); if (new Set(ids).size !== ids.length) throw new Error('DungeonChain: duplicate room ids');
    if (ids[0] !== 0 || !rooms_out[0].isEntranceHall) throw new Error('DungeonChain: room 0 must be the landing/entrance');
    if (!rooms_out[1] || !rooms_out[1].isCabaret) throw new Error('DungeonChain: room 1 must be the cabaret (engine dresses id 1)');
    const known = { wall: 1, floor: 1, shoji_door: 1, stairs_up: 1, stairs_up_r: 1, stairs_down: 1 };
    let up = 0, down = 0;
    for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_H; z++) {
      const t = map[x][z]; if (!t || !known[t.type]) throw new Error('DungeonChain: bad tile type at ' + x + ',' + z + ': ' + (t && t.type));
      if (t.type !== 'wall' && !(t.roomId >= 0)) throw new Error('DungeonChain: non-wall tile needs roomId >= 0 at ' + x + ',' + z + ' (got ' + t.roomId + ')');
      if (t.type === 'stairs_up') up++; if (t.type === 'stairs_down') down++;
    }
    if (up < 1) throw new Error('DungeonChain: no stairs_up');
    // Under hallway+cabaret+guard (Mark 2026-08-24) the descent's rooms — office and casino — do not [REF#DG-00607]
    // exist, and the floor deliberately ships with no way down rather than with a substitute stair
    // punched into a room he asked to keep EXACT. Everything else in this contract still binds.
    if (level !== 7 && down < 1 && !_headRoomsOnly()) throw new Error('DungeonChain: no stairs_down on level ' + level);
    // RING (Phase G1): gate-contract integrity — only when the ring topology emitted gates. [REF#DG-00608]
    if (gates && gates.length) {
      const sectionGates = gates.filter(g => g.kind === 'section');
      const segmentGates = gates.filter(g => g.kind === 'segment');
      // ⛔ WAS a hardcoded `!== 4` — the exact count `_buildRing`'s 4-way loop topology needs, but [REF#DG-01460]
      //    `_buildLHalls` (the generator that actually ships on floors 2+; `_buildRing` was tried and
      //    reverted 2026-09-02) has 3 legs and 3 section-0-origin gates, not 4. This check read PASS
      //    vacuously on every floor 2+ boot before today (`sectionGates.length` was always 0, so the
      //    `&&` short-circuited) — the moment `_sectionGateTiles` was actually populated (this same
      //    landing), the literal `4` started throwing on every real seed. Derived from `_segmentCount`
      //    instead, the exact same pattern the segment-gate check one line below already uses.
      //    ⚠ AND THE DERIVATION WAS RIGHT WHILE ITS INPUT WAS WRONG — corrected 2026-09-07 on Mark's
      //    order ("change it that it expects 4 gates (4th is guardroom)"). The reasoning above only
      //    ever checked `_buildLHalls`, whose 3 legs really do carry 3 gates. FLOOR 1 IS THE OTHER
      //    BUILDER: `_buildSection0` mints FOUR section gates, because its section 4 is the guard
      //    room. It declared `_segmentCount = 4` when it lays out five sections (0-4), so this line
      //    demanded 3 gates from a floor that has 4 and threw on floor 1 -- MEASURED in a node
      //    harness, "ring expects 3 section gate(s), got 4", where the previous commit returned a map.
      //    Fixed at the source (`_buildSection0` now declares 5), not by weakening this contract.
      if (sectionGates.length && sectionGates.length !== _segmentCount - 1) throw new Error('DungeonChain: ring expects ' + (_segmentCount - 1) + ' section gate(s), got ' + sectionGates.length);
      for (const g of gates) for (const [ex, ey] of g.tiles) { const t = map[ex] && map[ex][ey]; if (!t || t.type !== 'shoji_door' || (g.kind === 'segment' ? !t.segmentGate : !t.sectionGate)) throw new Error('DungeonChain: gate tile (' + ex + ',' + ey + ') is not a tagged shoji_door'); }
      for (const g of segmentGates) if (g.tiles.length !== 2 || g.segmentTo !== g.segmentFrom + 1) throw new Error('DungeonChain: malformed segment gate ' + g.gateIndex);
      if (segmentGates.length && segmentGates.length !== _segmentCount - 1) throw new Error('DungeonChain: expected ' + (_segmentCount - 1) + ' segment gates, got ' + segmentGates.length);
      // ── THE SECTION CONTRACTS ONLY BIND WHEN THERE ARE SECTIONS (Mark 2026-08-24) ────────────── [REF#DG-00609]
      //    Both checks below describe a PACKED floor: "every room carries sectionIndex 1..4" and "the
      //    casino lives in section 4". Under hallway+cabaret+guard the packer never ran, so there is
      //    no casino at all and the only non-head room is the guard post (sectionIndex 0) — the first
      //    assert would reject the guard room and the second dereferences a casino that was never
      //    chosen ("casino must be in section 4 (got undefined)").
      //    ⚠ SCOPED DELIBERATELY NARROW. Everything above this line still runs on the trimmed floor —
      //      spawn walkable, unique ids, room 0 = landing, room 1 = cabaret, every tile a known type
      //      with a roomId, stairs_up AND stairs_down present, and the gate tiles themselves verified.
      //      Only the two claims that are meaningless without a packer are stood down.
      if (sectionGates.length && !_headRoomsOnly()) {
      // section 'entry' is exempt alongside id 0 / cabaret / store: it is the tag the adapter puts on everything [REF#DG-00610]
      // that belongs to the HEAD rather than to a section — including the west-wing 支配人室 + 楽屋 annexes, which
      // are emitted after generation and so were never handed a sectionIndex by any generator.
      // ⚠ `r.section` (the depth-tag: entry/approach/mid/deep) is a DIFFERENT field from `sectionIndex`/ [REF#DG-01387]
      //   `segmentId` (the compass identity this check actually cares about) — same word, unrelated
      //   axes. Exempting only `section === 'entry'` was an indirect proxy that happened to cover the
      //   cabaret/landing (both hop 0) but not the west/east SPUR rooms in `_buildLHalls`'s ring, which
      //   are legitimately section 0 by design (`legs` table: "west spur (section 0)"/"east spur
      //   (section 0)") yet sit at a small nonzero hop distance and so tag `section: 'approach'` —
      //   MEASURED 2026-09-06: `DungeonChain: room id 19 has no sectionIndex 1..4 (got 0, ... section
      //   approach)`, thrown on 5/10 seeds the moment the section-gate fix above made this contract's
      //   OWN check reachable for the first time (it never ran while `sectionGates.length` was 0).
      //   Exempt directly on `sectionIndex === 0`, the actual claim being tested, instead of inferring
      //   section-0 membership through a narrative tag that was never built to carry it.
      for (const r of rooms_out) { if (r.id === 0 || r.isCabaret || r.isStore || r.section === 'entry' || r.sectionIndex === 0) continue; if (!(r.sectionIndex >= 1 && r.sectionIndex <= 4)) throw new Error('DungeonChain: room id ' + r.id + ' has no sectionIndex 1..4 (got ' + r.sectionIndex + ', roomType ' + r.roomType + ', section ' + r.section + ')'); }
      // ⚠ ONLY WHEN A 4TH NUMBERED SECTION ACTUALLY EXISTS. Written for `_buildRing`'s 4-leg N/E/S/W [REF#DG-01388]
      //   box, where a real section 4 always exists and holds the casino. `_buildLHalls` (the generator
      //   that actually ships floors 2+; `_buildRing` was tried and reverted 2026-09-02) is a 3-leg
      //   horseshoe — west/north/east only, sections 1..3 — because "we removed section 4 = that is
      //   permanent" (Mark 2026-09-02). It never carves a casino and has nowhere to put one; this check
      //   ran unconditionally for both topologies and threw "casino must be in section 4 (got 3)" on
      //   every real floor 2+ seed the moment section gates were populated (this same landing) let this
      //   contract reach it for the first time. `_segmentCount - 1` is the highest numbered section a
      //   topology actually has (see the gate-count derivation above) — gate on that, not a literal.
      const _maxSection = _segmentCount - 1;
      // ⛔ SUPERSEDED 2026-09-07 by Mark: "4 gates (4th is guardroom) it is a room that opens only [REF#DG-01461]
      //    after the previous all 3 sections are activated." The note above justifies its gate on
      //    "we removed section 4 = that is permanent (Mark 2026-09-02)". That order is DEAD -- he has
      //    since restated the four-section-plus-guard-room structure repeatedly (2026-09-03 in this
      //    same file at ~:1286, 2026-09-05, and again today), and section 4 is the guard room.
      //    WHAT CHANGED HERE: _maxSection >= 4 was standing in for "does this floor have a casino."
      //    It stopped being a safe proxy the moment a floor could reach section 4 WITHOUT one --
      //    which is exactly floor 1, whose section 4 is the 番所, not a gambling hall. Ask the real
      //    question instead: assert the casino sits in section 4 only where a casino was carved.
      //    Floors 2+ are untouched (their _maxSection is 3, so this was already skipped).
      if (_maxSection >= 4 && casinoRoom) {
        const casinoOut = rooms_out[cidToFinal[crooms.indexOf(casinoRoom)]];
        if (!casinoOut || casinoOut.sectionIndex !== 4) throw new Error('DungeonChain: casino must be in section 4 (got ' + (casinoOut && casinoOut.sectionIndex) + ')');
      }
      }
    }
  }

  const API = {
    setMapSeed, generateDungeonMap, genCompact,
    // Exported so a SECOND trimmer can honour the same protection instead of duplicating it. [REF#DG-01411]
    UNIQUE_SPAWN_ID_RE,
    S0_TIERS, s0Tier: _s0Tier,   // the tiered section-0 rows (A3b, 2026-09-12) — probes grade monotone growth from here [REF#DG-02033]
    // The hallway rule and this floor's measured straight runs, exported together so no consumer has [REF#DG-01462]
    // to hardcode a second copy of 10. Oni-Baba's mapDiagnosticRing() already reads census.maxCorr in
    // preference to its own default for exactly this reason.
    MAX_CORR,
    carveSpans: () => _carveSpans.slice(),
    _const: { GW, GH, ROCK, FLOOR, WALL, CORR, DOOR, CABX, CABY, CABW, CABH, DDX, DDY },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.DungeonChain = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
