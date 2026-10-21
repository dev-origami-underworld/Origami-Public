/* DungeonEmergency.js — EMERGENCY FLOOR-1 GENERATOR (Mark 2026-08-21) [REF#DG-00611]
 *
 * "prepare an emergency new level generator. This time it will be replacing this map, but we will
 *  keep this as backup. We will create an entire RNG map system now."
 *
 * ⚠ WORK-FROM-A-COPY: this is a NEW FILE. `DungeonChain.js` is NOT touched and remains the backup —
 *   switching back is one flag, and nothing about the old generator has been edited or deleted.
 *
 * THE SPEC, VERBATIM, AND WHERE EACH PIECE IS BUILT:
 *   · entrance way, 10 tiles long x 2 tiles wide          -> _entrance()
 *   · a NEW guard room COMBINED with it, on its WESTERN side   -> _entrance(), same roomId, no divider
 *   · the only rooms in the head are entrance(+guard) + cabaret
 *   · the cabaret AS IT STANDS (floor 1 = the treasured 6x6)   -> _cabaret()
 *   · a small 6-tile, 2-tile-wide hallway out the EAST entrance -> _eastHall()
 *   · a 1-TILE DOOR on the cabaret's WESTERN wall -> a hallway -> two 4x4 rooms + one 8x6 room -> _westWing()
 *
 * WHAT IS RNG AND WHAT IS NOT. The dimensions Mark named are LAW and never vary: 10x2 entrance, 6x2
 * east hall, 4x4 / 4x4 / 8x6 west rooms, 6x6 cabaret. What the seed moves is everything he did NOT
 * name — which side of the west corridor each room hangs off, their order along it, the corridor's
 * length, and the guard room's position along the entrance's west flank. So every seed is a different
 * dungeon and every seed still satisfies the brief exactly.
 *
 * ROOMS ARE RECTANGLES, ALWAYS. Measured on the old generator 2026-08-21: 21 of 23 "rooms" were
 * already rectangular and the other two were corridor networks carrying a roomId, which is what made
 * the perimeters snake and produced 114 junctions on one floor. Here a room is a rect by construction
 * and a corridor is never given a roomId, so that class cannot recur.
 *
 * Same engine contract as DungeonChain: { map, rooms, spawnX, spawnZ, mobSpawns, vendingAnchor }.
 * Runs in plain node (module.exports) so the layout is validated without booting the game.
 */
(function (global) {
  'use strict';

  const GW = 66, GH = 66;
  const ROCK = 0, FLOOR = 1, WALL = 2, CORR = 3, DOOR = 4, STAIRS = 5, STAIRS_UP = 6;   // STAIRS_UP (Mark 2026-08-24) = the way you came IN from the surface; NOT a descent — see the entrance landing [REF#DG-00612]

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
  function setMapSeed(seed) { _rng = _mulberry32((seed >>> 0) || 0x12345678); }
  const _ri = (lo, hi) => lo + Math.floor(_rng() * (hi - lo + 1));
  const _pick = arr => arr[Math.floor(_rng() * arr.length)];

  // ── ROOM SHAPE CATALOGUE — THE ONLY LEGAL ROOMS (Mark 2026-08-22) ────────────────────────────── [REF#DG-00613]
  //    "these are the only type rooms to build from so these rooms stop looking like crap"
  //    The list lives in js/v8/map/RoomShapes.json and is loaded through RoomShapes.js (generated
  //    from it — see scripts/gen-room-shapes.js, which has a drift guard). A generator may place a
  //    room ONLY with a footprint in that list; validate() rejects anything else, so an ad-hoc
  //    rectangle cannot ship. ⚠ ORIENTATION IS SIGNIFICANT — 3x4 and 4x3 are different shapes.
  const _RS = (typeof RoomShapes !== 'undefined') ? RoomShapes
            : (typeof require === 'function' ? require('./RoomShapes.js') : null);
  const _shapeOf = (w, h) => _RS ? _RS.shapeOf(w, h) : { key: 'UNCHECKED' };
  const shapeList = () => _RS ? _RS.list() : ['<RoomShapes.js not loaded>'];

  // ── THE SPEC — from Mark's hand plan, 2026-08-21 ("no. try this one.") ────────────────────────── [REF#DG-00614]
  //    A CONCENTRIC DOUBLE RING, not the linear corridor of the first attempt. Read off his drawing:
  //      · an OUTER ring corridor with four cardinal exits: N -> section 2, E -> 3, W -> 4,
  //        S -> the entrance (his red star = spawn)
  //      · an INNER ring corridor inside it, separated by rock
  //      · a core holding the CABARET (his green star) with STARLETTE DRESSING ROOM and MANAGER
  //        OFFICE side by side above it
  //      · the ENTRANCE 2 wide x 10 long running south, with the GUARD ROOM on its WESTERN flank,
  //        combined into one space — the one piece carried over from his previous instruction
  //    Dimensions he did not name are chosen here and asserted in validate(); the ones he did are law.
  const SPEC = {
    cabaret:   { w: 10, h: 7 },    // the core room, centre of the plan [REF#DG-00615]
    annex:     { w: 4,  h: 4 },    // starlette dressing room + manager office, side by side above it [REF#DG-00616]
    entrance:  { w: 2,  h: 10 },   // 2 wide, 10 long  (Mark, verbatim) [REF#DG-00617]
    guard:     { w: 4,  h: 10 },   // Mark 2026-08-24: "Make guard house same length as ROOM 1 hallway" [REF#DG-00618]
                                   //   (was 4x8 from his 2026-08-21 "4x8, longer ... brush up against the [REF#DG-00619]
                                   //   hallway entranceway"). h now TRACKS entrance.h — see the assert below.
                                   //   ⚠ `gy`'s `_ri(0, entrance.h - guard.h)` becomes _ri(0,0): it still
                                   //   draws once, so the seeded stream downstream is unchanged, and the
                                   //   guard room lands flush with the entrance instead of sliding.
    ringW:     2,                  // both ring corridors are 2 wide [REF#DG-00620]
    exitLen:   { min: 5, max: 9 }, // N/E/W spur length out to sections 2 / 3 / 4 — seeded [REF#DG-00621]
  };

  const _blank = () => { const T = []; for (let x = 0; x < GW; x++) { T[x] = new Array(GH).fill(ROCK); } return T; };
  const _in = (x, y) => x >= 1 && x < GW - 1 && y >= 1 && y < GH - 1;

  // Carve a rectangular ROOM: floor interior, wall ring. Rooms are rects, no exceptions. [REF#DG-00622]
  function _room(T, x0, y0, w, h, id, rooms, meta, RID) {
    // ⚠ NO PRIVATE WALL RING. See _sheathe() — walls are derived ONCE, globally, at the end. [REF#DG-00623]
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) if (_in(x, y)) { T[x][y] = FLOOR; if (RID) RID[x][y] = id; }
    const r = Object.assign({ id, x: x0, y: y0, w, h }, meta || {});
    rooms.push(r); return r;
  }
  // Carve a CORRIDOR run. Never given a roomId — corridors carrying room ids is what made the old [REF#DG-00624]
  // generator's "rooms" read as 5%-fill snakes.
  function _corr(T, x0, y0, w, h) {
    // ⚠ NO PRIVATE WALL RING — see _sheathe(). [REF#DG-00625]
    // ⚠ NEVER CARVE THROUGH A DOOR OR A ROOM. The test used to be `!== FLOOR`, which let a later
    //   room's stub corridor run straight over a door another room had already placed — turning it
    //   back into plain corridor and leaving that room doorless. It surfaced as "room SEb R3x3 has no
    //   door of its own" on every floor from 12 down, once enough rooms packed closely enough for
    //   their stubs to cross. A door is a placed thing, not empty space.
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++)
      if (_in(x, y) && T[x][y] !== FLOOR && T[x][y] !== DOOR && T[x][y] !== STAIRS && T[x][y] !== STAIRS_UP) T[x][y] = CORR;
  }
  // A RING corridor: the band of thickness `t` just inside the rect (x0,y0,w,h). [REF#DG-00626]
  function _ring(T, x0, y0, w, h, t) {
    _corr(T, x0, y0, w, t);                      // north run [REF#DG-00627]
    _corr(T, x0, y0 + h - t, w, t);              // south run [REF#DG-00628]
    _corr(T, x0, y0 + t, t, h - 2 * t);          // west run [REF#DG-00629]
    _corr(T, x0 + w - t, y0 + t, t, h - 2 * t);  // east run [REF#DG-00630]
  }
  // ── A DOOR MUST SIT ON A REAL WALL TILE, NOT ON OPEN FLOOR (Mark 2026-08-21) ──────────────────── [REF#DG-00631]
  //    "each time you place a doorway? you fuck up the entire wall geometry" — and he is exactly
  //    right. MEASURED at a live doorway (scripts/_doordump): the door LEAF is built at the tile
  //    CENTRE, but a perimeter wall pane runs along the tile EDGE:
  //        door tile (51,58): wall Z-run at x = 101.00 · door leaf at x = 102.00   -> 1.0 off, a
  //        FULL TILE. The doorway blows a 2-unit hole in the run and hangs its leaf beside it.
  //    The third doorway on the same floor is CORRECT and proves the rule: tile (58,57) sits on a
  //    genuine 1-tile-thick wall with walkable space on both sides, so the merge draws a CENTRED
  //    pane at x = 116.00 and the leaf lands at x = 116.00 — they agree.
  //    THE RULE, THEREFORE: a tile may only become a DOOR if it is currently solid AND has walkable
  //    tiles on exactly one OPPOSITE PAIR of sides. That is the definition of "a wall you can cut a
  //    doorway through", and it is the only case where the engine's leaf and its pane coincide.
  //    A refused door is COUNTED, not silently dropped — a passage that failed to open is a
  //    connectivity bug and validate() must be able to see it.
  const _doorFails = [];
  //    `probe` = "I am trying candidates, a miss is not a failure". Without it the every-room-gets-a- [REF#DG-00632]
  //    door sweep below records 40 refusals per level while walking a wall looking for a legal tile,
  //    and validate() then fails on noise instead of on a real sealed passage.
  const _door = (T, x, y, probe) => {
    if (!_in(x, y)) return false;
    const t = T[x][y];
    if (t === DOOR) return true;
    const walk = (a, b) => _in(a, b) && (T[a][b] === FLOOR || T[a][b] === CORR || T[a][b] === DOOR || T[a][b] === STAIRS || T[a][b] === STAIRS_UP);   // a stair tile is walkable: the entrance's 2-tile door opens onto the surface landing (Mark 2026-08-24) [REF#DG-00633]
    const ew = walk(x - 1, y) && walk(x + 1, y), ns = walk(x, y - 1) && walk(x, y + 1);
    if (t === FLOOR || t === CORR) { if (!probe) _doorFails.push({ x, y, why: 'tile is already open floor' }); return false; }
    if (ew === ns) { if (!probe) _doorFails.push({ x, y, why: ew ? 'open on all four sides' : 'not a through-wall' }); return false; }
    T[x][y] = DOOR; return true;
  };
  // ── A DOOR SITS AT THE MIDDLE OF A WALL, NEVER ANYWHERE ELSE (Mark 2026-08-22) ───────────────── [REF#DG-00634]
  //    "place a door only in middle of a room pane"
  //    A wall run is one PANE to the eye. A door punched a third of the way along it reads as damage;
  //    a door at the centre reads as a doorway. This is also the convention the original chain
  //    generator's own note names — "single shoji door at each wall MIDPOINT" — which nothing since
  //    has actually enforced.
  //    ⚠ IT DOES NOT SLIDE. If the exact midpoint is not a legal through-wall the door is REFUSED and
  //      recorded, rather than walked along the wall until something takes — sliding is precisely how
  //      doors ended up in corners and a tile off the wall line. A refusal is a generator bug to fix,
  //      not a thing to paper over at placement time.
  //    EVEN-LENGTH WALLS have two centre tiles. `span` picks how many to open: 1 keeps the door on the
  //    lower-middle tile, 2 opens BOTH — which is how a 2-wide hallway gets its 2-tile doorway.
  const _midOf = (a, len, span) => a + Math.floor((len - span) / 2);
  const _doorMid = (T, r, side, span, doors, probe) => {
    span = span || 1;
    let placed = 0;
    if (side === 'n' || side === 's') {
      const y = (side === 'n') ? r.y - 1 : r.y + r.h;
      const x0 = _midOf(r.x, r.w, span);
      for (let i = 0; i < span; i++) if (_door(T, x0 + i, y, probe)) { doors.push([x0 + i, y]); placed++; }
    } else {
      const x = (side === 'w') ? r.x - 1 : r.x + r.w;
      const y0 = _midOf(r.y, r.h, span);
      for (let i = 0; i < span; i++) if (_door(T, x, y0 + i, probe)) { doors.push([x, y0 + i]); placed++; }
    }
    return placed === span;
  };
  const _open = (T, x0, y0, x1, y1) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (_in(x, y)) T[x][y] = FLOOR;
  };

  // ── WALLS ARE DERIVED ONCE, GLOBALLY, AFTER ALL SPACE IS CARVED (Mark 2026-08-21) ────────────── [REF#DG-00635]
  //    "your dungeon doesnt look like a dungeon, you have misconnections. the corners are still
  //     screwed up" — and he was right while my junction probe read 0 open corners, because that
  //    probe asks whether you can SEE THROUGH a corner, not whether the walls CONNECT.
  //    MEASURED with a new test (scripts/probe-wall-freeends.js): 119 of 912 wall ends — 13% of every
  //    wall end on the floor — stopped in open space with walkable floor on both sides and no corner,
  //    no continuation and no door. A wall ending in mid-air IS the "misconnection".
  //    THE CAUSE WAS MINE, NOT THE RENDERER'S. `_room`/`_corr` each painted their OWN wall ring as
  //    they carved. Where two corridors meet — every ring turn, every ring-to-ring link, every tee —
  //    the two private rings terminate independently and never merge, leaving a stub at every
  //    junction. The renderer drew exactly what the generator asked for.
  //    THE FIX IS ONE PASS AND ONE RULE: carve SPACE first, then sheathe it. A tile is a WALL iff it
  //    is not walkable and touches a walkable tile — 8-way, so diagonals are covered and no corner
  //    can be left open. Derived from the finished floor plan, a wall boundary is closed by
  //    construction and a stub is unrepresentable. Same principle as the renderer rebuild's "one
  //    canonical table": stop letting nine writers each decide where a surface goes.
  const _sheathe = (T) => {
    const walkT = (x, y) => _in(x, y) && (T[x][y] === FLOOR || T[x][y] === CORR || T[x][y] === DOOR || T[x][y] === STAIRS || T[x][y] === STAIRS_UP);
    const add = [];
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if (walkT(x, y)) continue;
      let touches = false;
      for (let dx = -1; dx <= 1 && !touches; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        if (walkT(x + dx, y + dy)) { touches = true; break; }
      }
      if (touches) add.push([x, y]);
    }
    for (const [x, y] of add) T[x][y] = WALL;
  };

  // ── SECTIONS — ROOMS BUILT FROM THE CATALOGUE (Mark 2026-08-22) ──────────────────────────────── [REF#DG-00636]
  //    "I liked our section setup we had before. now if we can create a room generation system that
  //     uses this room catalogue system, we will have a better dungeon."
  //    The four section boxes are the ORIGINAL ones, copied from DungeonChain.js:2304-2311 rather than
  //    re-invented, so the shape of the floor he liked is preserved:
  //        1 WEST  cols 1..23 rows 22..64      3 EAST cols 42..64 rows 5..37
  //        2 NORTH cols 1..40 rows 1..20       4 SE   cols 42..64 rows 39..64
  //    WHAT IS DIFFERENT IS HOW ROOMS GET THERE. Every room is a KEY FROM RoomShapes.json — never a
  //    size invented at the call site — placed by the same rules that made floor 1 sound:
  //      · a footprint not in the catalogue cannot be placed at all (validate() rejects it)
  //      · nothing overlaps: every placement is tested against a running claim list, inflated by 1 so
  //        two rooms can never fuse into a non-rectangle
  //      · walls are NOT painted here; `_sheathe` derives them globally afterwards, so a section
  //        boundary cannot leave a stub
  //      · doors go at a wall MIDPOINT onto the spine, and are REFUSED rather than slid
  //    A section that cannot place a room simply has fewer — it never forces one, and the count it
  //    actually achieved is reported so a thin section is visible instead of silent.
  const SECTION_BOXES = [
    { s: 1, name: 'WEST',  box: { x0: 1,  y0: 22, x1: 23, y1: 64 } },
    { s: 2, name: 'NORTH', box: { x0: 1,  y0: 1,  x1: 40, y1: 20 } },
    { s: 3, name: 'EAST',  box: { x0: 42, y0: 5,  x1: 64, y1: 37 } },
    { s: 4, name: 'SE',    box: { x0: 42, y0: 39, x1: 64, y1: 64 } },
  ];

  // ── HOW BIG A FLOOR IS ALLOWED TO GET (Mark 2026-08-22) ─────────────────────────────────────── [REF#DG-00637]
  //    "yes 1 2 and 3 yes 40 rooms should be total cap on any lower levels. that way we dont create
  //     wierd cities of rooms"
  //    THE 40 IS A HARD CEILING, not a target. Depth raises the per-section target and adds sections,
  //    but the floor stops accepting rooms the moment it reaches FLOOR_ROOM_CAP — so a deep floor is
  //    dense, not a city. Checked in BOTH placement passes, so the fill pass cannot sneak past it.
  const FLOOR_ROOM_CAP = 40;

  // ── SECTION 0 ONLY (Mark 2026-08-22) ────────────────────────────────────────────────────────── [REF#DG-00638]
  //    "i want us to now work on section 0 - just the guard room + entrance + caberet. that is it.
  //     the dungeon geometry you have for this == horrible"
  //    So the level stops at the HEAD: the cabaret, one ring corridor around it, and the entrance
  //    with the guard room fused onto its west flank. No outer ring, no four sections, no annexes,
  //    no section spurs. Get this one piece right before generating anything on top of it.
  //    The ring stays because the cabaret's own door law needs somewhere for its E/W/S doors to open
  //    onto — strip that too and those doors have no through-wall and are refused by design.
  //    Off (build the whole floor again): window._section0Only = false.
  const _headOnly = () => (typeof window === 'undefined') ? _S0 : (window._section0Only !== false);
  let _S0 = true;

  //    MORE SECTIONS AS YOU DESCEND. The four original boxes cap out at 31 rooms however hard you [REF#DG-00639]
  //    push them — measured by driving the target to floor 40 and watching it sit at 8/7/6/5. So the
  //    boxes SUBDIVIDE with depth instead: each split halves a box along its long axis and yields two
  //    sections that each get their own spine. 4 -> 6 -> 8 sections, which is Mark's (2), and each
  //    resulting box is smaller, which is his (1) in the form that matters — capacity per section
  //    falls but total capacity rises, and rooms stay reachable off a nearby spine.
  //    ⚠ SUBDIVIDING IS WHY THIS DOES NOT NEED A BIGGER GRID. GW/GH are baked into the tile arrays,
  //      `_in`, the ASCII dump and the adapter's centring offset; growing them is a refactor with a
  //      lot of blast radius for the same capacity a split gives for free.
  //    ⚠ A SPLIT THAT LEAVES A HALF TOO SHALLOW IS REFUSED. A section needs room for a spine plus a
  //      3-tile room (the catalogue's smallest side) plus walls on BOTH sides of the spine — about 13
  //      tiles across. Splitting SE produced a half only 11 deep, whose spine left maxDeep = 2, so no
  //      catalogue shape fitted and that section reported 0 rooms on every deep floor. A box that
  //      cannot usefully halve simply stays whole.
  const _splitBox = (Z) => {
    const B = Z.box, wide = (B.x1 - B.x0) >= (B.y1 - B.y0);
    const longLen = wide ? (B.x1 - B.x0) : (B.y1 - B.y0);
    const shortLen = wide ? (B.y1 - B.y0) : (B.x1 - B.x0);
    if (Math.min(shortLen, Math.floor(longLen / 2)) < 13) return [Z];   // too shallow to halve [REF#DG-00640]
    const mid = wide ? Math.floor((B.x0 + B.x1) / 2) : Math.floor((B.y0 + B.y1) / 2);
    const a = wide ? { x0: B.x0, y0: B.y0, x1: mid - 1, y1: B.y1 } : { x0: B.x0, y0: B.y0, x1: B.x1, y1: mid - 1 };
    const b = wide ? { x0: mid + 1, y0: B.y0, x1: B.x1, y1: B.y1 } : { x0: B.x0, y0: mid + 1, x1: B.x1, y1: B.y1 };
    return [{ s: Z.s, name: Z.name + 'a', box: a }, { s: Z.s, name: Z.name + 'b', box: b }];
  };
  const _sectionsFor = (level) => {
    const splits = level >= 9 ? 4 : level >= 5 ? 2 : 0;      // 4 -> 6 -> 8 sections [REF#DG-00641]
    const out = [];
    // split the LARGEST boxes first — they are the ones with room to halve [REF#DG-00642]
    const order = SECTION_BOXES.slice().sort((p, q) =>
      ((q.box.x1 - q.box.x0) * (q.box.y1 - q.box.y0)) - ((p.box.x1 - p.box.x0) * (p.box.y1 - p.box.y0)));
    order.forEach((Z, i) => { if (i < splits) out.push(..._splitBox(Z)); else out.push(Z); });
    return out.sort((p, q) => p.s - q.s);
  };

  // pick a catalogue shape that fits, weighted so a section is not all closets or all great-rooms [REF#DG-00643]
  //    `level` biases the pick SMALLER as you descend. Depth is supposed to add rooms, and a section
  //    box is a fixed size — so without this the target rises while capacity does not, and deep
  //    floors came out with FEWER rooms than shallow ones. Smaller rooms deeper down also reads as a
  //    warren rather than a repeat of floor 1.
  function _pickShape(maxW, maxH, level) {
    if (!_RS) return null;
    const fit = _RS.CATALOGUE.rooms.filter(r => r.w <= maxW && r.h <= maxH);
    if (!fit.length) return null;
    const cap = Math.max(9, 42 - (level || 1) * 3);          // max area, shrinking with depth [REF#DG-00644]
    const small = fit.filter(r => r.area <= cap);
    const pool = small.length ? small : fit;
    return pool[Math.floor(_rng() * pool.length)];
  }

  // ── ROOMS PER SECTION GROW WITH DEPTH (Mark 2026-08-22) ─────────────────────────────────────── [REF#DG-00645]
  //    "Each level will have more rooms than the previous level. So at some levels the number of
  //     rooms can be up to 1+ room per section per level. so its always a geometric solution.
  //     RNG always by sections that are pre-built room shapes."
  //    So depth adds rooms PER SECTION, not to the floor as a lump — the four sections stay the unit
  //    of composition and every room in them is still a catalogue key. The RNG picks WHICH shapes and
  //    WHERE; it never picks how many, and it never invents a size.
  //    THE LAW IS MONOTONIC: floor N must hold strictly more rooms than floor N-1. That is asserted
  //    across the run of floors in validate()'s companion check (scripts/probe-floor-growth.js), so
  //    "more rooms as you descend" is a property that fails loudly rather than a hope.
  //    ⚠ CAPPED BY WHAT FITS, NOT BY THE FORMULA. A section that cannot place its quota reports the
  //      count it ACHIEVED. Forcing the number would mean overlapping rooms, which is the one thing
  //      the whole catalogue exists to prevent — so depth raises the TARGET and geometry has the
  //      final say. `roomCap` keeps the target inside what a section box can physically hold.
  //    ⚠ NO RNG ON THE COUNT. An earlier cut added _ri(0,1) jitter to the target, and that jitter is
  //      the ONLY reason floors came out non-monotonic — floor 7 landed smaller than floor 6 purely
  //      because it rolled low. Depth decides HOW MANY; the RNG decides WHICH SHAPES and WHERE. The
  //      target is therefore a clean function of level and rises by exactly 1 per section per floor,
  //      which is what Mark asked for ("1+ room per section per level").
  const _wantPerSection = (level) => Math.min(2 + (level - 1), 9);   // cap: a box cannot be flooded [REF#DG-00646]

  function _buildSections(T, RID, rooms, doors, claimed, startId, level) {
    let id = startId;
    const report = [];
    for (const Z of _sectionsFor(level || 1)) {
      const B = Z.box;
      // a spine corridor down the middle of the section's long axis [REF#DG-00647]
      const wide = (B.x1 - B.x0) >= (B.y1 - B.y0);
      const spine = wide
        ? { x: B.x0 + 2, y: Math.floor((B.y0 + B.y1) / 2), w: (B.x1 - B.x0) - 3, h: 1 }
        : { x: Math.floor((B.x0 + B.x1) / 2), y: B.y0 + 2, w: 1, h: (B.y1 - B.y0) - 3 };
      // ⚠ TEST THE SPINE'S LENGTH, NOT ITS WIDTH. A vertical spine is 1 wide by definition, so [REF#DG-00648]
      //   `spine.w < 3` skipped WEST, EAST and SE outright — three of the four sections built nothing
      //   and the level came out with only NORTH populated.
      if (Math.max(spine.w, spine.h) < 6) continue;
      _corr(T, spine.x, spine.y, spine.w, spine.h);
      claimed.push({ x0: spine.x - 1, y0: spine.y - 1, x1: spine.x + spine.w, y1: spine.y + spine.h });

      const free = (x, y, w, h) => {
        if (x < B.x0 + 1 || y < B.y0 + 1 || x + w > B.x1 || y + h > B.y1) return false;
        if (x < 2 || y < 2 || x + w >= GW - 2 || y + h >= GH - 2) return false;
        for (const c of claimed) if (!(x + w < c.x0 || x - 1 > c.x1 || y + h < c.y0 || y - 1 > c.y1)) return false;
        return true;
      };

      let placed = 0;
      const want = _wantPerSection(level || 1);         // grows with depth — see _wantPerSection [REF#DG-00649]
      // ── PACK ALONG THE SPINE, DO NOT SCATTER (Mark 2026-08-22: "always a geometric solution") ── [REF#DG-00650]
      //    The first cut threw rooms at random positions inside the box and kept the ones that fit.
      //    It does not scale: past ~4 rooms a section spends its attempts colliding, so raising the
      //    depth target produced FEWER rooms on deep floors — floors 5, 7 and 8 came out smaller than
      //    floor 4, breaking the "more rooms as you descend" law outright. It also stranded rooms
      //    away from the spine, and a room the spine never reaches gets no door (floor 6 failed
      //    validate() exactly that way).
      //    PACKING IS DETERMINISTIC AND DENSE: walk the spine, alternate sides, drop the next shape
      //    that fits at the cursor, advance past it. Every room is adjacent to the spine by
      //    construction, so it always has somewhere to put a door, and the section holds as many as
      //    its box can physically take. The RNG still chooses WHICH shape and which side — it just no
      //    longer chooses the position and hope.
      const along0 = wide ? B.x0 + 1 : B.y0 + 1;
      const along1 = wide ? B.x1 - 1 : B.y1 - 1;
      let cursor = along0, sideFlip = _rng() < 0.5;
      while (placed < want && cursor < along1 && rooms.length < FLOOR_ROOM_CAP) {
        const maxAlong = along1 - cursor;
        const maxDeep  = wide ? Math.min(8, Math.max(0, Math.min(spine.y - B.y0, B.y1 - spine.y) - 3))
                              : Math.min(8, Math.max(0, Math.min(spine.x - B.x0, B.x1 - spine.x) - 3));
        const shape = wide ? _pickShape(Math.min(8, maxAlong), maxDeep, level)
                           : _pickShape(maxDeep, Math.min(8, maxAlong), level);
        if (!shape) break;
        const near = sideFlip; sideFlip = !sideFlip;
        let rx, ry, side;
        if (wide) {
          rx = cursor;
          ry = near ? spine.y - 2 - shape.h : spine.y + 2;
          side = near ? 's' : 'n';
        } else {
          ry = cursor;
          rx = near ? spine.x - 2 - shape.w : spine.x + 2;
          side = near ? 'e' : 'w';
        }
        if (!free(rx, ry, shape.w, shape.h)) { cursor += 1; continue; }
        const r = _room(T, rx, ry, shape.w, shape.h, id, rooms,
          { roomType: shape.role, name: Z.name + ' ' + shape.key, shapeKey: shape.key, sectionIndex: Z.s }, RID);
        claimed.push({ x0: rx - 1, y0: ry - 1, x1: rx + shape.w, y1: ry + shape.h });
        if (wide) {
          const dx = _midOf(rx, shape.w, 1);
          if (side === 's') _corr(T, dx, ry + shape.h + 1, 1, spine.y - (ry + shape.h) - 1);
          else              _corr(T, dx, spine.y + 1, 1, ry - spine.y - 2);
        } else {
          const dy = _midOf(ry, shape.h, 1);
          if (side === 'e') _corr(T, rx + shape.w + 1, dy, spine.x - (rx + shape.w) - 1, 1);
          else              _corr(T, spine.x + 1, dy, rx - spine.x - 2, 1);
        }
        // ── A ROOM IS NOT PLACED UNTIL ITS DOOR IS. If the spine-facing wall's MIDPOINT will not [REF#DG-00651]
        //    take a door, the whole placement is ROLLED BACK — tiles, room record and claim — rather
        //    than left standing with no way in. Floors 5 and 9 shipped a doorless room before this;
        //    the sweep that is supposed to catch that runs later and could not help, because the only
        //    wall the room has facing anything walkable is the one that just refused.
        //    Undo beats diagnosis here: whatever the local reason, a room without a door is never
        //    correct, so placement simply does not complete without one.
        if (!_doorMid(T, r, side, 1, doors, true)) {
          for (let ux = rx; ux < rx + shape.w; ux++) for (let uy = ry; uy < ry + shape.h; uy++) {
            if (_in(ux, uy)) { T[ux][uy] = ROCK; RID[ux][uy] = -1; }
          }
          rooms.pop(); claimed.pop();
          cursor += 1; continue;
        }
        // advance PAST this room only when the next one goes on the SAME side; alternating sides lets [REF#DG-00652]
        // two rooms share the same stretch of spine, which is what makes a deep floor dense.
        if (near === sideFlip) cursor += (wide ? shape.w : shape.h) + 1;
        id++; placed++;
      }
      // ── SECOND PASS: FILL THE GAPS WITH THE SMALLEST SHAPES ──────────────────────────────────── [REF#DG-00653]
      //    One sweep leaves holes — a big shape early can block the run, so achieved wandered under
      //    the target and a deeper floor could end up SMALLER than a shallower one (floor 6 came out
      //    at 22 against floor 5's 25). This walks the spine again taking the SMALLEST catalogue
      //    shapes that still fit, so a section reaches its target whenever the geometry allows and
      //    depth reliably means more rooms. Same rules apply: catalogue only, no overlaps, door or
      //    rollback.
      if (placed < want && _RS && rooms.length < FLOOR_ROOM_CAP) {
        const small = _RS.CATALOGUE.rooms.slice().sort((a, b) => a.area - b.area);
        let c2 = along0;
        let flip2 = sideFlip;
        while (placed < want && c2 < along1 && rooms.length < FLOOR_ROOM_CAP) {
          const maxAlong = along1 - c2;
          const maxDeep = wide ? Math.min(8, Math.max(0, Math.min(spine.y - B.y0, B.y1 - spine.y) - 3))
                               : Math.min(8, Math.max(0, Math.min(spine.x - B.x0, B.x1 - spine.x) - 3));
          const near = flip2; flip2 = !flip2;
          const shape = small.find(sh => {
            const w = wide ? sh.w : sh.h, d = wide ? sh.h : sh.w;
            if (w > maxAlong || d > maxDeep) return false;
            const tx = wide ? c2 : (near ? spine.x - 2 - sh.w : spine.x + 2);
            const ty = wide ? (near ? spine.y - 2 - sh.h : spine.y + 2) : c2;
            return free(tx, ty, sh.w, sh.h);
          });
          if (!shape) { c2 += 1; continue; }
          const rx = wide ? c2 : (near ? spine.x - 2 - shape.w : spine.x + 2);
          const ry = wide ? (near ? spine.y - 2 - shape.h : spine.y + 2) : c2;
          const side = wide ? (near ? 's' : 'n') : (near ? 'e' : 'w');
          const r = _room(T, rx, ry, shape.w, shape.h, id, rooms,
            { roomType: shape.role, name: Z.name + ' ' + shape.key, shapeKey: shape.key, sectionIndex: Z.s }, RID);
          claimed.push({ x0: rx - 1, y0: ry - 1, x1: rx + shape.w, y1: ry + shape.h });
          if (wide) { const dx = _midOf(rx, shape.w, 1);
            if (side === 's') _corr(T, dx, ry + shape.h + 1, 1, spine.y - (ry + shape.h) - 1);
            else              _corr(T, dx, spine.y + 1, 1, ry - spine.y - 2);
          } else { const dy = _midOf(ry, shape.h, 1);
            if (side === 'e') _corr(T, rx + shape.w + 1, dy, spine.x - (rx + shape.w) - 1, 1);
            else              _corr(T, spine.x + 1, dy, rx - spine.x - 2, 1);
          }
          if (!_doorMid(T, r, side, 1, doors, true)) {
            for (let ux = rx; ux < rx + shape.w; ux++) for (let uy = ry; uy < ry + shape.h; uy++)
              if (_in(ux, uy)) { T[ux][uy] = ROCK; RID[ux][uy] = -1; }
            rooms.pop(); claimed.pop(); c2 += 1; continue;
          }
          if (near === flip2) c2 += (wide ? shape.w : shape.h) + 1;
          id++; placed++;
        }
      }
      report.push({ section: Z.s, name: Z.name, rooms: placed, wanted: want, spine });
    }
    return { nextId: id, report, cap: FLOOR_ROOM_CAP };
  }

  function build(level) {
    level = Math.max(1, level | 0 || 1);
    _doorFails.length = 0;
    const T = _blank(), RID = _blank().map(c => c.fill(-1)), rooms = [], doors = [];
    const RW = SPEC.ringW;

    // ── CORE: cabaret with the two annexes above it. Laid out first; everything wraps around it. [REF#DG-00654]
    // ── THE ANNEXES ARE FLOOR 1 ONLY (Mark 2026-08-22) ────────────────────────────────────────────
    //    STARLETTE'S DRESSING ROOM and the MANAGER'S OFFICE belong to the head of the dungeon, not to
    //    every floor. The head plan was being applied at every depth, so floor 12 had its own copy of
    //    Starlette's dressing room — geometrically sound and narratively nonsense.
    //    The CABARET itself stays on every floor: Mark 2026-08-22, "each floor will have a central
    //    room (Caberet), each caberet is the main heart of each floor." Only the annexes are lifted.
    //    ⚠ THE CORE GEOMETRY IS DERIVED FROM THEM, so this is not a skipped `_room` call — coreW, the
    //      link corridor and the cabaret's own row all collapse when they are absent, and the two
    //      rings wrap whatever the core turns out to be.
    const HEAD = _headOnly();
    const hasAnnexes = (level === 1) && !HEAD;
    const coreW = hasAnnexes ? Math.max(SPEC.cabaret.w, SPEC.annex.w * 2 + 2) : SPEC.cabaret.w;
    const coreX = ((GW - coreW) >> 1);
    // ⚠ CENTRED DELIBERATELY. At annexY=16 the outer ring sat at row 7 and a 9-tile north spur ran to [REF#DG-00655]
    //   row -2, where `_in()` silently clamped it — a clipped exit that still LOOKS like a corridor in
    //   the preview. validate() now asserts the bounds so a clip fails instead of rendering.
    const annexY = 21;
    const dressX = coreX, mgrX = coreX + coreW - SPEC.annex.w;
    const linkY  = annexY + SPEC.annex.h + 1;                 // 2-wide corridor joining the annexes [REF#DG-00656]
    const cabY   = hasAnnexes ? (linkY + RW + 1) : annexY;   // no annexes -> the cabaret IS the core [REF#DG-00657]

    let dress = null, mgr = null;
    if (hasAnnexes) {
      dress = _room(T, dressX, annexY, SPEC.annex.w, SPEC.annex.h, 2, rooms,
        { roomType: 'dressing', name: 'STARLETTE DRESSING ROOM' }, RID);
      mgr = _room(T, mgrX, annexY, SPEC.annex.w, SPEC.annex.h, 3, rooms,
        { roomType: 'manager', name: 'MANAGER OFFICE' }, RID);
      _corr(T, coreX, linkY, coreW, RW);                      // the link corridor between the annexes [REF#DG-00658]
      _doorMid(T, dress, 's', 1, doors);        // each annex opens at the CENTRE of its south wall [REF#DG-00659]
      _doorMid(T, mgr,   's', 1, doors);
    }

    const cab = _room(T, coreX, cabY, SPEC.cabaret.w, SPEC.cabaret.h, 1, rooms,
      { isCabaret: true, roomType: 'cabaret', name: 'CABARET' }, RID);
    // ── THE CABARET'S DOORS ARE FIXED LAW (Mark 2026-08-22) ─────────────────────────────────────── [REF#DG-00660]
    //    "caberet has 2 * 2 tile doors and 1 tile door on east west. always."
    //    ...corrected twice, final: "there are 2 two tile doors, one on a south and one on east, one
    //    1-tile door on west side, none on north - that is stage".
    //    SO: TWO double doors — SOUTH and EAST, 2 tiles wide each. ONE single door on the WEST.
    //    NOTHING on the north wall, because THE NORTH WALL IS THE STAGE. That is not a placement
    //    preference, it is what the room is: you do not cut a doorway through the stage.
    //    "always" — this does not vary by seed. validate() asserts all four walls, so a cabaret that
    //    comes out any other way is a hard failure, and a door appearing in the stage wall is caught
    //    rather than shipped.
    const CAB_DOORS = { s: 2, e: 2, w: 1 };                      // no 'n' — the north wall is the STAGE [REF#DG-00661]
    for (const side of Object.keys(CAB_DOORS)) _doorMid(T, cab, side, CAB_DOORS[side], doors);

    // ── INNER RING — wraps the core, 2 wide, DIRECTLY against the core's wall. [REF#DG-00662]
    //    ⚠ The first cut set this one tile further out (`- 2 - RW`), leaving a rock gap between the
    //      core wall and the corridor — so every core door opened into solid rock and the whole
    //      centre was unreachable. 281 orphaned tiles on every seed; the reachability assertion
    //      caught it before it was ever rendered, which is the entire reason it exists.
    const inX = coreX - 1 - RW, inY = (hasAnnexes ? annexY : cabY) - 1 - RW;
    const inW = coreW + 2 * (1 + RW), inH = (cabY + SPEC.cabaret.h) - (hasAnnexes ? annexY : cabY) + 2 * (1 + RW);
    _ring(T, inX, inY, inW, inH, RW);
    // the annex link corridor has to reach the ring too, or the two annexes are a sealed pocket [REF#DG-00663]
    if (hasAnnexes) {
      _door(T, coreX - 1, linkY);          doors.push([coreX - 1, linkY]);
      _door(T, coreX + coreW, linkY);      doors.push([coreX + coreW, linkY]);
    }

    // ── OUTER RING — separated from the inner ring by EXACTLY ONE tile of wall.  (skipped in HEAD) [REF#DG-00664]
    //    ⚠ THIS IS WHAT MAKES DOORS LINE UP, and it is the whole of Mark's "each time you place a
    //      doorway you fuck up the entire wall geometry". A door LEAF is built at the tile CENTRE.
    //      A wall's visible pane is only at the tile centre when the merge collapses it — and the
    //      merge only fires on a wall that is EXACTLY ONE TILE THICK with open space on both sides.
    //      Any thicker and the wall draws a perimeter pane on its tile EDGE instead, half a tile
    //      away from every door cut through it. MEASURED with gap=2: door leaf at x=100.00, the wall
    //      run beside it at x=101.00 — a full tile of step, at every doorway on the floor.
    //      So the separation between the rings is now one tile, not three, and every wall between
    //      two open spaces is a single tile the merge can centre.
    const gap = 0;
    const _ringOuter = !HEAD;
    const oX = inX - gap - RW - 1, oY = inY - gap - RW - 1;
    const oW = inW + 2 * (gap + RW + 1), oH = inH + 2 * (gap + RW + 1);
    if (_ringOuter) _ring(T, oX, oY, oW, oH, RW);

    // ── LINK THE TWO RINGS. ⚠ The first cut punched a door only at the INNER end, so every link [REF#DG-00665]
    //    corridor dead-ended against the outer ring's wall and the whole centre stayed sealed —
    //    269 orphaned tiles, caught by the reachability assertion, invisible in the ASCII unless you
    //    counted wall runs. A passage needs a door at BOTH ends; that is now explicit below.
    const _link = (side) => {
      // ── A 2-TILE HALLWAY GETS A 2-TILE DOORWAY (Mark 2026-08-22) ──────────────────────────── [REF#DG-00666]
      //    The link was a 1-wide corridor with a 1-tile door, punched between two 2-wide ring
      //    corridors — so a two-abreast hall necked down to single file at every crossing. The link
      //    now carries the ring's own width and gets that many door tiles side by side.
      if (side === 'n' || side === 's') {
        const lx = inX + RW + _ri(1, Math.max(1, inW - 2 * RW - 2 - RW));
        const yOuter = side === 'n' ? oY + RW : oY + oH - RW - 1;   // outer ring's inner wall [REF#DG-00667]
        const yInner = side === 'n' ? inY - 1 : inY + inH;          // inner ring's outer wall [REF#DG-00668]
        // ⚠ CARVE BETWEEN THE TWO WALL ROWS, NEVER THROUGH THEM. Running the corridor over the row [REF#DG-00669]
        //   you then stamp a door on leaves the door on OPEN FLOOR — no wall to cut, so the engine
        //   draws no pane and hangs the leaf a tile off the wall line. See the _door note.
        const lo = Math.min(yOuter, yInner) + 1, hi = Math.max(yOuter, yInner) - 1;
        if (hi >= lo) _corr(T, lx, lo, RW, hi - lo + 1);
        for (let i = 0; i < RW; i++) { _door(T, lx + i, yOuter); _door(T, lx + i, yInner);
                                       doors.push([lx + i, yOuter], [lx + i, yInner]); }
      } else {
        const ly = inY + RW + _ri(1, Math.max(1, inH - 2 * RW - 2 - RW));
        const xOuter = side === 'w' ? oX + RW : oX + oW - RW - 1;
        const xInner = side === 'w' ? inX - 1 : inX + inW;
        const lo = Math.min(xOuter, xInner) + 1, hi = Math.max(xOuter, xInner) - 1;
        if (hi >= lo) _corr(T, lo, ly, hi - lo + 1, RW);
        for (let i = 0; i < RW; i++) { _door(T, xOuter, ly + i); _door(T, xInner, ly + i);
                                       doors.push([xOuter, ly + i], [xInner, ly + i]); }
      }
    };
    // at least two links on opposite sides, sometimes a third — seeded [REF#DG-00670]
    const linkSides = _rng() < 0.5 ? ['n', 's'] : ['w', 'e'];
    if (_rng() < 0.5) linkSides.push(_pick(['n', 's', 'w', 'e']));
    if (_ringOuter) for (const side of new Set(linkSides)) _link(side);

    // ── FOUR CARDINAL EXITS off the outer ring. N/E/W are the section links (his circles 2, 3, 4). [REF#DG-00671]
    const exits = {};
    if (!HEAD) {
    const eL = () => _ri(SPEC.exitLen.min, SPEC.exitLen.max);
    // ⚠ EVERY SPUR STOPS ONE TILE SHORT OF THE RING and that gap tile becomes the door. The first [REF#DG-00672]
    //   cut carved the corridor straight through the door row, so all six of these doors landed on
    //   open floor — 16 refusals, each one a hole in the wall with a leaf hanging beside it.
    // north -> section 2
    let nx = oX + ((oW - RW) >> 1), nlen = eL();
    _corr(T, nx, oY - 1 - nlen, RW, nlen); _door(T, nx, oY - 1); _door(T, nx + 1, oY - 1);
    exits[2] = { x: nx, y: oY - 1 - nlen, w: RW, h: nlen, dir: 'n' };
    // east -> section 3 [REF#DG-00673]
    let ey = oY + ((oH - RW) >> 1), elen = eL();
    _corr(T, oX + oW + 1, ey, elen, RW); _door(T, oX + oW, ey); _door(T, oX + oW, ey + 1);
    exits[3] = { x: oX + oW + 1, y: ey, w: elen, h: RW, dir: 'e' };
    // west -> section 4 [REF#DG-00674]
    let wy = oY + ((oH - RW) >> 1), wlen = eL();
    _corr(T, oX - 1 - wlen, wy, wlen, RW); _door(T, oX - 1, wy); _door(T, oX - 1, wy + 1);
    exits[4] = { x: oX - 1 - wlen, y: wy, w: wlen, h: RW, dir: 'w' };
    }

    // ── SOUTH: THE ENTRANCE (2 wide x 10 long) + the GUARD ROOM on its WESTERN flank, COMBINED. [REF#DG-00675]
    const _hostX = HEAD ? inX : oX, _hostY = HEAD ? inY : oY, _hostW = HEAD ? inW : oW, _hostH = HEAD ? inH : oH;
    const ent = { x: _hostX + ((_hostW - SPEC.entrance.w) >> 1), y: _hostY + _hostH + 1, w: SPEC.entrance.w, h: SPEC.entrance.h };
    _room(T, ent.x, ent.y, ent.w, ent.h, 0, rooms,
      { isEntrance: true, isGuardRoom: true, roomType: 'entrance_guard', name: 'ROOM 1 ENTRANCE' }, RID);
    _door(T, ent.x, _hostY + _hostH); _door(T, ent.x + 1, _hostY + _hostH);
    doors.push([ent.x, _hostY + _hostH]);

    // BRUSHED UP AGAINST THE ENTRANCE (Mark): the guard room's east wall IS the entrance's west wall, [REF#DG-00676]
    // and that shared wall is dissolved along its whole length so the two read as one L-shaped space.
    // At 4x8 against a 10-long entrance it runs almost the full flank, which is what he drew.
    const gy = ent.y + _ri(0, SPEC.entrance.h - SPEC.guard.h);
    const g = { x: ent.x - SPEC.guard.w - 1, y: gy, w: SPEC.guard.w, h: SPEC.guard.h };
    _room(T, g.x, g.y, g.w, g.h, 4, rooms,
      { isGuardRoom: true, roomType: 'guard', name: 'GUARD ROOM' }, RID);
    // ── THE GUARD ROOM'S EAST WALL IS A WALL, WITH A DOOR (Mark 2026-08-24: "add door to East wall") ── [REF#DG-00677]
    //    It used to be DISSOLVED along its whole length (the 08-21 "combined, one L-shaped space"
    //    build): every tile of the divider column was forced to FLOOR and re-tagged to the guard
    //    room, so the 番所 and the entrance were one open space with no threshold between them.
    //    Mark's newer word replaces that — the divider column stands as the seam wall (`_sheathe`
    //    derives it globally, like every other wall) and ONE door is cut at its midpoint.
    //    ⚠ Deliberately NOT a 2-tile door: the guard room is a special room and its door is the
    //      1-tile single-pane leaf (the 08-23 "same principle, just 1 tile only" unification).
    //    ⚠ `_doorMid` is used, not a hand-placed tile, so the door obeys the same middle-of-the-wall
    //      law as every other door and is REFUSED rather than slid if it cannot sit there.
    if (!_doorMid(T, g, 'e', 1, doors)) _doorFails.push({ x: g.x + g.w, y: g.y + (g.h >> 1), why: 'guard east door' });

    // ── THE WAY IN FROM THE SURFACE: 2-TILE DOOR + STAIR LANDING (Mark 2026-08-24) ──────────────── [REF#DG-00678]
    //    "add 2-tile door to end of room 1, add stairways."
    //    WHICH END: the entrance's NORTH end already carries a 2-tile door (the pair cut into the
    //    ring above), so "the end of room 1" is the SOUTH end — the end the player spawns at, which
    //    is the end you arrive through. The stair is therefore the way IN from the surface, not a
    //    descent: floor 1 must not offer a way DOWN one tile from the spawn.
    //    A DOOR NEEDS WALKABLE SPACE ON BOTH SIDES (the `_door` law, ~:128), so the landing is
    //    carved FIRST and the door cut into the seam between it and the entrance — never the
    //    reverse, or the door is refused and silently dropped into _doorFails.
    //    The landing is the entrance's own width (2), so the door spanning it is a true 2-tile door
    //    and the engine's pairing block builds ONE double door across both tiles.
    const LANDING_H = 3;
    const land = { x: ent.x, y: ent.y + ent.h + 1, w: ent.w, h: LANDING_H };
    _corr(T, land.x, land.y, land.w, land.h);
    for (let i = 0; i < ent.w; i++) { const _dx = ent.x + i, _dy = ent.y + ent.h;
      if (_door(T, _dx, _dy)) doors.push([_dx, _dy]); }
    // the stair itself sits at the FAR end of the landing, centred on the entrance's run [REF#DG-00679]
    T[land.x][land.y + LANDING_H - 1] = STAIRS_UP;
    T[land.x + 1][land.y + LANDING_H - 1] = STAIRS_UP;

    // ── SECTIONS: catalogue rooms hung off a spine in each of the four original section boxes. [REF#DG-00680]
    //    Runs before _sheathe so their walls are derived by the same single global pass as everything
    //    else — a section boundary cannot leave a stub because no one paints their own wall ring.
    const spawnGuess = { x: ent.x, y: ent.y + ent.h - 1 };      // the stairs are measured away from here [REF#DG-00681]
    const _claims = [];
    const _cl = (o) => { if (o) _claims.push({ x0: o.x - 1, y0: o.y - 1, x1: o.x + o.w, y1: o.y + o.h }); };   // dress/mgr are null past floor 1 [REF#DG-00682]
    _cl(cab); _cl(ent); _cl(g); _cl(dress); _cl(mgr); _cl(land);   // the surface landing is off limits too, or a section room lands on the stair [REF#DG-00683]
    _cl({ x: oX, y: oY, w: oW, h: oH });                       // the whole ring block is off limits [REF#DG-00684]
    const _sec = HEAD ? { report: [], nextId: 10 } : _buildSections(T, RID, rooms, doors, _claims, 10, level);
    // join each section spine to its cardinal spur so the sections are actually reachable [REF#DG-00685]
    for (const rep of _sec.report) {
      const e = exits[rep.section === 1 ? 4 : rep.section === 2 ? 2 : rep.section === 3 ? 3 : 4];
      if (!e) continue;
      const sx = Math.round(e.x + e.w / 2), sy = Math.round(e.y + e.h / 2);
      const tx = Math.round(rep.spine.x + rep.spine.w / 2), ty = Math.round(rep.spine.y + rep.spine.h / 2);
      _corr(T, Math.min(sx, tx), sy, Math.abs(tx - sx) + 1, 1);   // horizontal leg [REF#DG-00686]
      _corr(T, tx, Math.min(sy, ty), 1, Math.abs(ty - sy) + 1);   // vertical leg [REF#DG-00687]
    }

    // ── STAIRS DOWN (Mark 2026-08-22: "lets have our dungeon with good rooms now") ──────────────── [REF#DG-00688]
    //    ⚠ THE GENERATOR HAD NO STAIRS AT ALL — grep-verified, zero references — so floor 1 was a
    //      dead end you could not descend from. That is why this could not simply be switched on for
    //      floors 2+: there was nothing to descend THROUGH.
    //    The engine locates them by scanning for a tile of type 'stairs_down' (Engine9 ~:75119), so
    //    one tile is all that is required. It goes in the SECTION room farthest from the spawn by
    //    walking distance-ish (Manhattan on the room centre), so the descent is the end of the floor
    //    rather than something you trip over on the way in — and never in the cabaret or the head.
    let _stairRoom = null, _best = -1;
    for (const r of rooms) {
      if (r.isCabaret || r.isEntrance || r.roomType === 'guard' || r.sectionIndex === undefined) continue;
      const d = Math.abs((r.x + r.w / 2) - spawnGuess.x) + Math.abs((r.y + r.h / 2) - spawnGuess.y);
      if (d > _best) { _best = d; _stairRoom = r; }
    }
    if (!HEAD && _stairRoom) {
      const sx = _stairRoom.x + Math.floor(_stairRoom.w / 2), sy = _stairRoom.y + Math.floor(_stairRoom.h / 2);
      T[sx][sy] = STAIRS; _stairRoom.hasStairs = true; _stairRoom.isCasino = true;   // engine dresses isCasino [REF#DG-00689]
    }

    _sheathe(T);                                               // ONE global wall derivation — see above [REF#DG-00690]
    // ── EVERY ROOM GETS A DOOR (Mark 2026-08-22: "now attach a door to each room") ──────────────── [REF#DG-00691]
    //    Placement above is per-feature and can leave a room without one — the 2026-08-21 audit found
    //    the guard room sealed, reachable only because it is fused to the entrance. A room you can
    //    only enter through another room's wall is an accident, not a plan. This walks every room's
    //    perimeter and, if it carries no door, cuts one on a wall tile that genuinely separates the
    //    room from walkable space. If no such tile exists the room is UNREACHABLE and validate() says
    //    so rather than letting it ship sealed.
    for (const r of rooms) {
      let has = false;
      const ring = [];
      for (let x = r.x - 1; x <= r.x + r.w && !has; x++) for (let z = r.y - 1; z <= r.y + r.h; z++) {
        const edge = (x === r.x - 1 || x === r.x + r.w || z === r.y - 1 || z === r.y + r.h);
        if (!edge || !_in(x, z)) continue;
        if (T[x][z] === DOOR) { has = true; break; }
        if (T[x][z] === WALL) ring.push([x, z]);
      }
      if (has) continue;
      // MIDDLE OF A WALL ONLY — try each side's exact centre; never walk along the wall (see _doorMid) [REF#DG-00692]
      // probe=true: trying each side's centre is a SEARCH; only a room left with no door at all
      // is a failure, and validate() catches that separately.
      for (const side of ['s', 'n', 'e', 'w']) if (_doorMid(T, r, side, 1, doors, true)) break;
    }
    // re-try any door that was refused before the sheathe turned its tile solid [REF#DG-00693]
    for (const f of _doorFails.slice()) { const i = _doorFails.indexOf(f); if (_door(T, f.x, f.y)) _doorFails.splice(i, 1); }
    const spawn = { x: ent.x, y: ent.y + ent.h - 1 };          // his red star, at the far end [REF#DG-00694]
    return { T, RID, rooms, doors, doorFails: _doorFails.slice(), cab, ent, g, dress, mgr, exits, spawn, headOnly: HEAD,
             sections: _sec.report,
             inner: { x: inX, y: inY, w: inW, h: inH }, outer: { x: oX, y: oY, w: oW, h: oH } };
  }

  // ── ASCII preview — the layout must be READABLE before it is wired to anything. [REF#DG-00695]
  function ascii(built) {
    const { T } = built;
    let x0 = GW, x1 = 0, y0 = GH, y1 = 0;
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if (T[x][y] !== ROCK) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const ch = { [ROCK]: ' ', [FLOOR]: '.', [WALL]: '#', [CORR]: ',', [DOOR]: '+' };
    const out = [];
    for (let y = y0; y <= y1; y++) { let s = String(y).padStart(3) + ' ';
      for (let x = x0; x <= x1; x++) s += ch[T[x][y]]; out.push(s); }
    return out.join('\n');
  }

  // ── VALIDATE — the brief is a test, not a comment. Every dimension Mark named is asserted, plus [REF#DG-00696]
  //    the structural claims his drawing makes: two rings, four exits, guard combined onto the
  //    entrance's west flank, and everything reachable from the spawn (his red star).
  function validate(b) {
    const { T, rooms } = b;
    const errs = [];
    // every placed room must name a catalogue shape — see ROOM_SHAPES [REF#DG-00697]
    for (const r of rooms) {
      if (r.isCorridorNet) continue;
      if (!_shapeOf(r.w, r.h)) errs.push('room "' + (r.name || r.id) + '" is ' + r.w + 'x' + r.h
        + ' which is NOT in the ROOM SHAPE CATALOGUE (legal: ' + shapeList().join(' · ') + ')');
    }
    const dim = (r, w, h, what) => { if (!r || r.w !== w || r.h !== h)
      errs.push(what + ' must be ' + w + 'x' + h + ', got ' + (r ? r.w + 'x' + r.h : 'missing')); };
    dim(b.cab,   SPEC.cabaret.w,  SPEC.cabaret.h,  'cabaret');
    dim(b.ent,   SPEC.entrance.w, SPEC.entrance.h, 'entrance way');
    dim(b.g,     SPEC.guard.w,    SPEC.guard.h,    'guard room');
    if (b.g.x + b.g.w !== b.ent.x - 1) errs.push('guard room is not flush against the entrance');
    if (b.dress) dim(b.dress, SPEC.annex.w, SPEC.annex.h, 'starlette dressing room');
    if (b.mgr)   dim(b.mgr,   SPEC.annex.w, SPEC.annex.h, 'manager office');

    // nothing may be clipped by the grid edge [REF#DG-00698]
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++)
      if (T[x][y] !== ROCK && (x < 1 || y < 1 || x > GW - 2 || y > GH - 2)) { errs.push('layout clipped at ' + x + ',' + y); x = 1e9; y = 1e9; }

    // rooms are rectangles and never share a tile [REF#DG-00699]
    const own = new Map();
    for (const r of rooms) for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) {
      // STAIRS is a floor tile that happens to be the way down — still solid, still rectangular [REF#DG-00700]
      if (T[x][y] !== FLOOR && T[x][y] !== STAIRS && T[x][y] !== STAIRS_UP) { errs.push('room ' + r.name + ' not solid floor at ' + x + ',' + y); }
      const k = x + ',' + y;
      if (own.has(k) && own.get(k) !== r.id) errs.push('rooms ' + own.get(k) + '/' + r.id + ' overlap at ' + k);
      own.set(k, r.id);
    }

    // ── THE GUARD ROOM IS WEST OF THE ENTRANCE AND CONNECTED THROUGH A DOOR ─────────────────── [REF#DG-00701]
    //    SUPERSEDED 2026-08-24 (Mark: "add door to East wall"): this used to assert the two were
    //    COMBINED — a fully-open span with NO door, from his 08-21 "brush up against the hallway
    //    entranceway". It now asserts the opposite topology: a standing divider with exactly one
    //    DOOR through it. The assertion is kept (not deleted) because what it guards is unchanged —
    //    the guard room must still be REACHABLE from the entrance, and a 番所 sealed behind solid
    //    rock is the failure this catches. Only the legal way through changed.
    //    It also asserts the two run FLUSH, which is what "same length as ROOM 1 hallway" means
    //    geometrically — otherwise a future SPEC edit could silently slide them apart again.
    if (b.g.x + b.g.w > b.ent.x) errs.push('guard room is not west of the entrance');
    if (b.g.h !== b.ent.h) errs.push('guard room length ' + b.g.h + ' != entrance length ' + b.ent.h + ' (Mark 2026-08-24: same length)');
    if (b.g.y !== b.ent.y) errs.push('guard room is not flush with the entrance (y ' + b.g.y + ' vs ' + b.ent.y + ')');
    let doorsThrough = 0;
    for (let y = b.g.y; y < b.g.y + b.g.h; y++)
      for (let x = b.g.x + b.g.w; x < b.ent.x; x++) if (T[x][y] === DOOR) doorsThrough++;
    if (doorsThrough !== 1) errs.push('guard room east wall has ' + doorsThrough + ' door(s) into the entrance, expected exactly 1');

    // four cardinal exits, one per section circle in his drawing [REF#DG-00702]
    // section spurs only exist when the sections do — see the SECTION 0 ONLY note
    if (!b.headOnly) for (const k of [2, 3, 4]) if (!b.exits[k]) errs.push('missing exit to section ' + k);

    // reachability from the spawn (his red star) through FLOOR/CORR/DOOR [REF#DG-00703]
    const walk = (x, y) => { const t = T[x] && T[x][y]; return t === FLOOR || t === CORR || t === DOOR || t === STAIRS || t === STAIRS_UP; };
    const seen = new Set([b.spawn.x + ',' + b.spawn.y]); const q = [[b.spawn.x, b.spawn.y]];
    while (q.length) { const [x, y] = q.pop();
      for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
        const k = nx + ',' + ny; if (seen.has(k) || !walk(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } }
    let total = 0; for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if (walk(x, y)) total++;
    const unreached = rooms.filter(r => !seen.has(r.x + ',' + r.y));
    if (unreached.length) errs.push('unreachable: ' + unreached.map(r => r.name).join(', '));
    if (seen.size !== total) errs.push('orphaned walkable tiles: ' + (total - seen.size));
    // ── THE CABARET DOOR LAW (Mark 2026-08-22: "always") ────────────────────────────────────────── [REF#DG-00704]
    //    2-tile doors north and south, 1-tile east and west. Measured off the finished grid, not off
    //    the intent, so a door the generator thought it placed but did not is caught here.
    if (b.cab) {
      const runOn = (side) => {
        const r = b.cab; let n = 0;
        if (side === 'n' || side === 's') { const y = side === 'n' ? r.y - 1 : r.y + r.h;
          for (let x = r.x; x < r.x + r.w; x++) if (T[x] && T[x][y] === DOOR) n++; }
        else { const x = side === 'w' ? r.x - 1 : r.x + r.w;
          for (let y = r.y; y < r.y + r.h; y++) if (T[x] && T[x][y] === DOOR) n++; }
        return n;
      };
      const want = { n: 0, s: 2, e: 2, w: 1 };   // n = 0: the stage wall [REF#DG-00705]
      for (const side of ['n', 's', 'e', 'w']) {
        const got = runOn(side);
        if (got !== want[side]) errs.push('cabaret ' + side.toUpperCase() + ' wall must have '
          + (want[side] ? 'a ' + want[side] + '-tile door' : 'NO door (it is the STAGE)')
          + ', got ' + got + ' door tile(s)');
      }
    }
    // every room must be enterable through a door of its own [REF#DG-00706]
    for (const r of rooms) {
      if (r.isCorridorNet) continue;
      let has = false;
      for (let x = r.x - 1; x <= r.x + r.w && !has; x++) for (let z = r.y - 1; z <= r.y + r.h; z++) {
        const edge = (x === r.x - 1 || x === r.x + r.w || z === r.y - 1 || z === r.y + r.h);
        if (edge && T[x] && T[x][z] === DOOR) { has = true; break; }
      }
      // the guard room is DELIBERATELY fused to the entrance (Mark 08-21) and shares its doors [REF#DG-00707]
      if (!has && r.roomType !== 'guard') errs.push('room "' + (r.name || r.id) + '" has no door of its own');
    }
    // exactly one way down, and you must be able to reach it [REF#DG-00708]
    let _st = 0, _stAt = null;
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if (T[x][y] === STAIRS) { _st++; _stAt = [x, y]; }
    if (!b.headOnly && _st !== 1) errs.push('expected exactly 1 stairs-down tile, found ' + _st);
    else if (_stAt && !seen.has(_stAt[0] + ',' + _stAt[1])) errs.push('the stairs down are unreachable');
    if (rooms.length > 40) errs.push('floor has ' + rooms.length + ' rooms, over the 40 cap');
    if (b.doorFails.length) errs.push('doors refused (not on a through-wall): ' + b.doorFails.length
      + ' — ' + b.doorFails.slice(0,4).map(f=>f.x+','+f.y+' '+f.why).join(' · '));

    return { ok: errs.length === 0, errs, walkable: total, reached: seen.size, rooms: rooms.length,
             dims: { cabaret: b.cab.w+'x'+b.cab.h, entrance: b.ent.w+'x'+b.ent.h, guard: b.g.w+'x'+b.g.h,
                     dressing: b.dress ? b.dress.w+'x'+b.dress.h : '(floor 1 only)',
                     manager:  b.mgr   ? b.mgr.w+'x'+b.mgr.h     : '(floor 1 only)' } };
  }

  function generate(seed, level) {
    if (seed !== undefined) setMapSeed(seed);
    return build(level || 1);
  }

  // ── ENGINE ADAPTER — the SAME contract DungeonChain emits, so the swap is one branch at the call [REF#DG-00709]
  //    site and nothing downstream changes shape:
  //        { map, rooms, spawnX, spawnZ, mobSpawns, vendingAnchor, gates, segments }
  //    CELL SHAPES are copied from DungeonChain's adapter (:3521-3545) rather than invented, because
  //    every consumer in Engine9 keys off these exact fields — `room:true` vs `hall:true` decides
  //    whether a tile reads as a room or a corridor, and `_rid()` in the thin-wall builder returns
  //    null ONLY for type==='wall', which is what makes a wall a wall.
  //    ⚠ CORRIDORS GET THEIR OWN roomId (CORR_ID), NOT 0. `_wallEdge` opens any edge whose two sides
  //      share a roomId, so giving corridors id 0 — the entrance's id — would silently dissolve the
  //      wall between the entrance and every corridor it touches. That is exactly the "corridor tiles
  //      carrying a roomId" defect that made the old generator's rooms read as 5%-fill snakes.
  const CORR_ID = 90;
  function generateDungeonMap(level, MAP_W, MAP_H) {
    MAP_W = MAP_W || 128; MAP_H = MAP_H || 128;
    const b = build(level);
    const v = validate(b);
    if (!v.ok) throw new Error('DungeonEmergency: layout invalid — ' + v.errs.join(' | '));
    const OX = (MAP_W - GW) >> 1, OY = (MAP_H - GH) >> 1;

    const map = new Array(MAP_W);
    for (let x = 0; x < MAP_W; x++) { map[x] = new Array(MAP_H);
      for (let y = 0; y < MAP_H; y++) map[x][y] = { type: 'wall' }; }

    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      const ex = x + OX, ey = y + OY;
      if (ex < 0 || ey < 0 || ex >= MAP_W || ey >= MAP_H) continue;
      const t = b.T[x][y], rid = b.RID[x][y];
      if (t === FLOOR)      map[ex][ey] = { type: 'floor', room: true, roomId: rid >= 0 ? rid : 0, segmentId: 0 };
      else if (t === CORR)  map[ex][ey] = { type: 'floor', hall: true, roomId: CORR_ID, segmentId: 0 };
      else if (t === DOOR)  map[ex][ey] = { type: 'shoji_door', roomId: rid >= 0 ? rid : CORR_ID, segmentId: 0, panelless: false };
      else if (t === STAIRS) map[ex][ey] = { type: 'stairs_down', room: true, roomId: rid >= 0 ? rid : 0, segmentId: 0 };
      else if (t === STAIRS_UP) map[ex][ey] = { type: 'stairs_up', room: true, roomId: rid >= 0 ? rid : 0, segmentId: 0 };   // the surface stair at the entrance landing — the engine already speaks 'stairs_up' [REF#DG-00710]
      else                  map[ex][ey] = { type: 'wall' };
    }

    // ── ROOM RECORDS: DungeonChain's EXACT shape (:3403), not an approximation. `center` is the one [REF#DG-00711]
    //    that bites first — the room-number decal reads `room.center.x` unguarded and a missing
    //    `center` takes the whole boot down with "Cannot read properties of undefined (reading 'x')",
    //    which is how this was found. cx/cz/roomName/roomNameEn/roomType are read just as widely.
    const _mk = (r) => {
      const ex = r.x + OX, ey = r.y + OY, cw = r.w >> 1, ch = r.h >> 1;
      const er = { id: r.id, roomId: r.id, x: ex, y: ey, w: r.w, h: r.h,
                   cx: ex + cw, cz: ey + ch, center: { x: ex + cw, y: ey + ch },
                   roomName: '間', roomNameEn: 'Chamber', roomType: 'room',
                   segmentId: 0, sectionIndex: 1, section: 'entry' };
      if (r.isEntrance)   { er.isEntranceHall = true; er.isMainHall = true; er.roomType = 'hallway';
                            er.roomName = '回廊'; er.roomNameEn = 'Main Hall'; }
      if (r.isCabaret)    { er.isCabaret = true; er.roomType = 'cabaret';
                            er.roomName = 'キャバレー'; er.roomNameEn = 'Cabaret'; }
      if (r.roomType === 'guard')    { er.isGuardRoom = true; er.roomType = 'guard';
                            er.roomName = '番所'; er.roomNameEn = 'GUARDPOST'; }
      if (r.roomType === 'dressing') { er.roomName = '楽屋'; er.roomNameEn = 'Dressing Room'; }
      if (r.roomType === 'manager')  { er.roomName = '支配人室'; er.roomNameEn = "Manager's Office"; }
      // ⚠ CARRY THE FLAGS. `_mk` builds a FRESH record, so anything set on the build-side room is lost [REF#DG-00712]
      //   unless it is copied — `hasStairs` vanished exactly this way and the stairs room came back
      //   unidentifiable. The engine dresses `isCasino` and several systems key off `sectionIndex`.
      if (r.hasStairs)  { er.hasStairs = true; er.isCasino = true; er.roomType = 'casino';
                          er.roomName = '賭場'; er.roomNameEn = 'Casino'; }
      if (r.shapeKey)   er.shapeKey = r.shapeKey;
      if (r.sectionIndex !== undefined) er.sectionIndex = r.sectionIndex;
      return er;
    };
    const rooms = b.rooms.map(_mk);
    // the corridor network needs a record too, or a lookup by CORR_ID returns undefined downstream [REF#DG-00713]
    const _cn = _mk({ id: CORR_ID, x: b.outer.x, y: b.outer.y, w: b.outer.w, h: b.outer.h, roomType: 'hall' });
    _cn.roomType = 'hallway'; _cn.roomName = '廊下'; _cn.roomNameEn = 'Halls'; _cn.isCorridorNet = true;
    rooms.push(_cn);

    const spawnX = b.spawn.x + OX, spawnZ = b.spawn.y + OY;
    return { map, rooms, spawnX, spawnZ, mobSpawns: [], vendingAnchor: null, gates: [], segments: [],
             _emergency: true, _exits: b.exits };
  }

  const API = { setMapSeed, generate, generateDungeonMap, ascii, validate, SPEC, shapeList, roomShapes: _RS, _const: { GW, GH, ROCK, FLOOR, WALL, CORR, DOOR, STAIRS, STAIRS_UP } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.DungeonEmergency = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
