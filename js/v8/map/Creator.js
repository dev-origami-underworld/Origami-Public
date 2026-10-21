/** [REF#DG-00006]
 * Creator.js — "Creator", THE DUNGEON_CREATOR. The one system that knows every room and every door.
 *
 * Mark, 2026-08-26:
 *   "every single door should have its own unique ID. that was the problem, a rogue AI had gone in
 *    to fix FPS and gave them a single instance and forbade it ... so focus on making sure we have
 *    a new DUNGEON_CREATOR we will call 'Creator' -- it is a system to create each room in
 *    room.html + hallways == also create our doors that go inside these rooms, so each room will
 *    have a ROOM_ID link, ok?"  ·  "each door will have a room_ID reference"  ·  "now consolidate
 *    all doors into this new room system, remove the old system"
 *
 * THE LAW OF IDENTITY — the whole module in three lines:
 *   · every ROOM gets a unique ROOM_ID   (ROOM_001, ROOM_002, …)
 *   · every DOOR gets a unique DOOR_ID   (DOOR_001, DOOR_002, …) and it is ITS OWN RECORD —
 *     never a shared instance, never a clone of a master, never "the door system singleton"
 *   · every DOOR carries `roomId`, the ROOM_ID of the room it belongs to, plus `connects`,
 *     the ids of BOTH spaces it joins. A door with no room is a bug by definition.
 *
 * WHY THIS IS NON-NEGOTIABLE (the three-week lesson): a rogue FPS pass collapsed all doors into a
 * single shared instance and forbade individuals. From that moment no door had an address, so every
 * fix hit "all doors" or "no door", probes selected decoys, and three weeks went into chasing
 * symptoms of anonymity. Sharing GEOMETRY or MATERIALS for perf is fine and encouraged —
 * (that is instancing's job) — but RECORDS are per-door, always. Identity is not a perf cost.
 *
 * VOCABULARY (DoorTypes.json, binding): DOORWAY = the opening, a tile, generator-owned.
 * LEAF = the pane that fills it, a mesh, render-owned. SPAN = tiles. THEME = the art it wears.
 *
 * TWO WAYS IN, ONE REGISTRY:
 *   AUTHORING — room.html/creator tooling calls createRoom()/createDoor() to build a level by hand.
 *   ADOPTION  — Creator.adopt(map, rooms) walks a map an EXISTING generator produced (DungeonChain,
 *               DungeonEmergency, DungeonTest — any of them) and mints records for every room and
 *               every doorway tile-group found. This is the CONSOLIDATION path: the old generators
 *               keep producing tiles exactly as before (renaming the shoji_door tile contract seals
 *               the dungeon — it stays), but the moment the map exists, EVERY door in it has an id,
 *               a roomId, and its tiles are tagged back (tile.doorId) so anything holding a tile can
 *               find its door and anything holding a door can find its room.
 *
 * No THREE, no DOM, no engine globals — plain data, so it runs in Engine9, room.html and node alike.
 */
(function (global) {
  'use strict';

  let _nextRoom = 1, _nextDoor = 1, _nextFeature = 1;
  const _rooms = new Map();            // ROOM_ID -> room record [REF#DG-00007]
  const _doors = new Map();            // DOOR_ID -> door record [REF#DG-00008]
  const _byGenId = new Map();          // generator roomId (number) -> ROOM_ID [REF#DG-00009]
  const _features = new Map();         // FEATURE_ID -> feature record [REF#DG-00010]

  const _rid = () => 'ROOM_' + String(_nextRoom++).padStart(3, '0');
  const _did = () => 'DOOR_' + String(_nextDoor++).padStart(3, '0');
  const _fid = () => 'FEAT_' + String(_nextFeature++).padStart(3, '0');

  function reset() { _rooms.clear(); _doors.clear(); _features.clear(); _byGenId.clear(); _nextRoom = 1; _nextDoor = 1; _nextFeature = 1; }

  /* ── AUTHORING ─────────────────────────────────────────────────────────────────────────────── [REF#DG-00011] */
  // THE KIND VOCABULARY — closed, per Mark's door law: "each door has a door_id, that is assigned [REF#DG-01064]
  // to hallway_id, or alcove_id, or room_id". 'alcove' added 2026-08-28 so an alcove can own a door
  // by name. Normalized at the constructor, NEVER thrown: adopt() feeds raw generator roomTypes
  // ('cabaret', 'guard', …) through `g.kind || g.type`, and a throw here would kill every boot.
  // An unknown string normalizes to 'room' and survives verbatim in `genKind` — nothing is lost,
  // the vocabulary stays one-word-one-meaning.
  // ⚠ 'corridor' ADDED 2026-08-30 per MAP_HEALTH_CONTRACT §6d (a). This is a CLOSED vocabulary —
  //   createRoom() silently rewrites anything not listed here to 'room'. I minted corridor records
  //   without adding the word first, so every one came back as kind 'room' and `room-no-door` fired
  //   on all seven of them. The contract SAID to extend KINDS; I implemented the rest and skipped it.
  //   A closed vocabulary that falls back silently is exactly the shape that hides this.
  const KINDS = ['room', 'hallway', 'special', 'alcove', 'corridor'];
  // A room (or hallway — a hallway IS a room here, kind:'hallway') from a RoomShapes footprint. [REF#DG-00012]
  function createRoom(spec) {
    const _rawKind = spec.kind || 'room';
    const r = {
      roomId: _rid(),
      shapeKey: spec.shapeKey || null,               // RoomShapes.json key, when catalogue-built [REF#DG-00013]
      // ── A SPECIAL ROOM IS AUTHORED, AND ITS SIZE IS NOT THE CATALOGUE'S BUSINESS ─────────────── [REF#DG-01740]
      //    Mark 2026-09-08, on the 風呂場 being failed for a 15x15 footprint: "tell creator to fuck [REF#DG-01740]
      //    off - its a special room and has no jurisdiction on that size."
      //    `special: true` means a HUMAN chose this footprint on purpose. `room-shape` skips it.
      //    ⚠ IT EXEMPTS THE SIZE RULE AND NOTHING ELSE. Bands, doorway-line, room-no-door,
      //      unreachable, room-unsheathed and every collider rule still apply in full — a special
      //      may be any SIZE, it may not be broken. This flag is not a way past the other gates.
      special: spec.special === true,

      // ⛔ THIS COMMENT USED TO READ "the SECTION tier of the address" AND THAT WAS THE MISLABEL. [REF#DG-01412]
    //   `segmentId` is the STREAMING SEGMENT and nothing else. The section tier is `sectionIndex`
    //   below. The two are different quantities that happen to be small integers, which is exactly why
    //   the swap survived: `section = seg + 1` cannot return 0, and 0 is the core, so every core room
    //   was mislabeled by construction. Provenance: the D1 entry in the DISABLED-FEATURES REGISTER.
    //   ⚠ Anything wanting the segment should read THIS field — its honest name — never `sectionIndex`.
    segmentId: (spec.segmentId !== undefined) ? spec.segmentId : null,   // the STREAMING SEGMENT [REF#DG-01065]
    // ── THE SECTION TIER, carried from the generator that actually assigns it ────────────────────── [REF#DG-01413]
    //   `sectionIndex` is the BUILT floor-plan section: core 0 · 1 WEST · 2 NORTH · 3 EAST (see
    //   SECTION_MODEL). DungeonChain tags every room with it ("every room tagged r.sectionIndex; every
    //   section must reach ≥2 rooms"); adopt() simply was not carrying it, so the registry that owns
    //   `floor -> section -> room` held the segment in the middle slot instead.
    //   ⚠ NULL IS A REPORT, NOT A DEFAULT: a room whose generator never assigned a section keeps null
    //     and downstream skips it, rather than being handed a plausible number.
    sectionIndex: (typeof spec.sectionIndex === 'number') ? spec.sectionIndex : null,
    // Speakable names, carried the same way. `_doorIdentity` and the door records had nothing a screen [REF#DG-01414]
    // reader could say, so an announcement could only ever be generic.
    roomName:   spec.roomName   || null,          // JA, e.g. 食堂 [REF#DG-01415]
    roomNameEn: spec.roomNameEn || null,          // EN, e.g. Cafeteria [REF#DG-01416]
      // ⚠ 'landing' IS A HALLWAY. Mark's 入口 Entrance Way is TWO TILES WIDE and five long — a [REF#DG-01066]
      //   corridor by any reading — but it declares `roomType: 'landing'`, which is not in KINDS, so
      //   it fell back to 'room' and was judged against the ROOM catalogue. **A 2-wide room can NEVER
      //   be in that catalogue: its minimum side is 3.** The check was unpassable by construction, so
      //   it said nothing useful. Routed to 'hallway' so it is judged against HALLS, where a corridor
      //   belongs. ⚠ THE VIOLATION SURVIVES THAT ROUTING — 2x5 is genuinely absent from HALLS — which
      //   is the point: this moves the question to the right catalogue rather than hiding it.
      kind: (_rawKind === 'landing') ? 'hallway' : (KINDS.indexOf(_rawKind) >= 0 ? _rawKind : 'room'),   // closed vocabulary, see KINDS above [REF#DG-00014]
      genKind: KINDS.indexOf(_rawKind) >= 0 ? null : _rawKind,  // the generator's own word, kept verbatim when it is not canonical [REF#DG-01067]
      x: spec.x | 0, z: spec.z | 0, w: spec.w | 0, h: spec.h | 0,
      genId: (spec.genId !== undefined) ? spec.genId : null,   // the old generator's numeric id, for the crossover [REF#DG-00015]
      doorIds: [],                                   // ROOM -> its doors. The other half of the link. [REF#DG-00016]
      features: []                                   // ROOM -> its FEATURE_IDs. Same shape, same law. [REF#DG-00017]
    };
    _rooms.set(r.roomId, r);
    if (r.genId !== null) _byGenId.set(r.genId, r.roomId);
    return r;
  }

  // ── THE ADOPTION MERGE ALLOWLIST — WHICH AUTHORED DOOR FIELDS SURVIVE A RE-MINT ───────────────── [REF#DG-01417]
//   `adopt()` resets the registry and re-mints doors from the map, so anything an author DECLARED on a
//   door record was being destroyed while anything adopt DERIVES survived. MEASURED before the fix:
//   floor 1 ran with 0 of 27 doors carrying a `side` and 0 carrying a `theme`, though Section0 authors
//   `side` on 12 of 12 of its createDoor calls and `theme:'cabaret'` on 3 — the cabaret doors among
//   them. `span` survived only because adopt recomputes it from contiguous tiles.
//   THE SPLIT THIS ENCODES: geometry is ADOPT'S TRUTH (tiles, span, connects, roomId — re-derived from
//   the map every pass, and the map is authoritative about shape). Everything below is the AUTHOR'S
//   TRUTH — a declaration no map walk can recover, so it is carried across the re-mint.
//   ⚠ `span`, `tiles`, `connects` and `roomId` are ABSENT FROM THIS LIST ON PURPOSE. Merging them
//     would let a stale authored value override the geometry actually on the map, which is the
//     opposite failure and a much harder one to see.
// ── DERIVE A DOOR'S WALL, ONLY WHERE NOTHING AUTHORED ONE ────────────────────────────────────────
//   AUTHOR-FIRST IS NOT POLITENESS, IT IS ACCURACY: Section0 declares its gate sides per section and
//   says why in its own comment — the first version keyed them off the section index, "which happened
//   to be right for four east sections and would have been silently wrong the moment one hung off a
//   different leg." A derived value that overwrote that would re-introduce the bug it was written to
//   avoid. So this runs only when `side` is absent after the adoption merge.
//   METHOD: the wall a doorway sits in is the room edge it touches. Compare the door's first tile to
//   the owner room's bounds and take the edge it is on or nearest to; ties break on the larger
//   overshoot, so a corner doorway picks the wall it actually pierces.
//   ⚠ NORTH IS −z in this engine (forward is (−sin rot, −cos rot), so heading 0 walks toward −z).
//     Getting this backwards would label every door with its opposite wall, which reads as plausible
//     and is entirely wrong — the compass rose in the HUD is the ground truth if it is ever re-checked.
//   ⚠ RETURNS null RATHER THAN A GUESS when the room has no usable bounds; the announcement layer
//     already degrades to "a secret door" without a wall, which is honest, and a wrong wall would send
//     a player to the opposite side of a room looking for it.
function deriveDoorSide(room, tiles) {
    try {
        const t = tiles && tiles[0];
        if (!room || !t || !(room.w > 0) || !(room.h > 0)) return null;
        const x0 = room.x, z0 = room.z, x1 = room.x + room.w - 1, z1 = room.z + room.h - 1;
        const d = { w: x0 - t[0], e: t[0] - x1, n: z0 - t[1], s: t[1] - z1 };
        let best = null, bestV = -Infinity;
        for (const k in d) if (d[k] > bestV) { bestV = d[k]; best = k; }
        if (bestV > 0) return best;                       // outside the bounds on that side [REF#DG-01418]
        // on an edge tile: pick the edge it lies on (distance 0 wins over interior negatives) [REF#DG-01419]
        let onEdge = null, onV = -Infinity;
        for (const k in d) if (d[k] === 0 && d[k] > onV) { onV = d[k]; onEdge = k; }
        return onEdge;                                     // null when strictly interior [REF#DG-01420]
    } catch (_) { return null; }
}

//   ⚠⚠ `sideDerived` IS IN THIS LIST AND IT IS NOT COSMETIC. MEASURED: `adopt()` runs THREE times per [REF#DG-01421]
//     floor load, so a wall derived on pass 1 is carried by pass 2 — and without its provenance flag
//     riding along, it comes back looking AUTHORED. The first observation of this fix reported
//     "authored 30 · derived 0" when nearly all thirty had just been derived, which would have made
//     the authored-vs-inferred distinction I claimed lasts "forever" survive exactly one pass.
const ADOPT_MERGE_FIELDS = ['side', 'sideDerived', 'theme', 'state', 'reach', 'secret', 'hidden', 'magicalEvent'];
const SECTION_DOOR_FIELDS = ['sectionDoorRole', 'sectionDoorKey', 'sectionIndex'];

  function doorTilesKey(tiles) {
    return (tiles || []).map(t => t[0] + ',' + t[1]).sort().join('|');
  }
  function doorByTiles(tiles) {
    const key = doorTilesKey(tiles);
    if (!key) return null;
    let match = null;
    for (const d of _doors.values()) if (doorTilesKey(d.tiles) === key) {
      if (match) throw new Error('Creator: duplicate doorway tiles ' + key);
      match = d;
    }
    return match;
  }

// A door IN a room. `roomId` is REQUIRED — a door with no room is refused, that is the law. [REF#DG-00018]
  function createDoor(spec) {
    const room = _rooms.get(spec.roomId);
    if (!room) throw new Error('Creator.createDoor: unknown roomId "' + spec.roomId +
      '" — every door carries a ROOM_ID reference, no exceptions');
    const d = {
      doorId: _did(),
      sectionDoorRole: spec.sectionDoorRole || null,
      sectionDoorKey: spec.sectionDoorKey || null,
      sectionIndex: Number.isInteger(spec.sectionIndex) ? spec.sectionIndex : null,
      roomId: room.roomId,                           // ← THE ROOM_ID LINK [REF#DG-00019]
      connects: spec.connects || [room.roomId],      // both spaces this doorway joins [REF#DG-00020]
      side: spec.side || null,                       // 'n'|'s'|'e'|'w' on the owning room, when known [REF#DG-00021]
      span: spec.span || 1,                          // tiles (DoorTypes.json spans: D1=1, D2=2) [REF#DG-00022]
      theme: spec.theme || null,                     // DoorTypes.json theme key; null = room decides [REF#DG-00023]
      tiles: (spec.tiles || []).map(t => [t[0], t[1]]),   // the doorway tiles it fills [REF#DG-00024]
      state: spec.state || 'open',                   // future: 'open'|'closed'|'locked' — per DOOR, never global [REF#DG-00025]
      // REACH LIVES ON THE DOOR (Mark 2026-08-28: "should be .25 tiles away or direct contact with [REF#DG-01068]
      // door pane"). TILE units. Two independent module globals both read 1.75 while their comments
      // swore 0.30 — a per-door field kills the class where one global is fixed and the other is not.
      reach: (typeof spec.reach === 'number' && isFinite(spec.reach) && spec.reach > 0) ? spec.reach : 0.25,
      // THE PANE SEGMENT, in TILE units: { axis:'x'|'z', c, a0, a1 } — the line the leaves stand on. [REF#DG-01069]
      // axis = the direction the pane RUNS ALONG; c = its coordinate on the other axis; a0..a1 = its
      // extent along `axis`. Stamped by the Engine9 adoption bridge from the carved opening record
      // (the engine's authoritative plane); null = not yet adopted, doorPane() derives a seam-model
      // default from tiles+side, or refuses (null) rather than guess.
      pane: spec.pane || null,
    // ── D1 · THE ATTRIBUTE SCHEMA ───────────────────────────────────────────────────────────────── [REF#DG-01422]
    //   The attribute list and its provenance are recorded in the DISABLED-FEATURES REGISTER entry for
    //   D1 (Origami.RealityEngine.9.html, top of file). MEASURED before adding anything: MOST OF IT WAS
    //   ALREADY HERE. `span` above covers 1-tile/2-tile, `state` already documents itself as
    //   'open'|'closed'|'locked' per DOOR (never global), and `side` already carries the wall. So the
    //   real delta is the four fields below — the record spine was waiting for objects, not a redesign.
    //   ⚠ `locked` is NOT added as a boolean: `state` is already the single authority for
    //     open/closed/locked, and a second field would let a door be locked and open at once. A locked
    //     door is a closed door; one enum says so, two flags can contradict.
    secret: spec.secret === true,          // reads as WALL in-world; SEARCH is its discovery mechanism [REF#DG-01100]
    hidden: spec.hidden === true,          // absent from map / World listings until revealed (PROPOSAL, awaiting ratify) [REF#DG-01423]
    discovered: spec.discovered === true,  // per-RUN state, the ONLY field SEARCH ever writes [REF#DG-01424]
    magicalEvent: spec.magicalEvent || null // an event key fired on opening; the cabaret doors are the live reference [REF#DG-01425]
    };
    _doors.set(d.doorId, d);
    room.doorIds.push(d.doorId);
    return d;
  }

  /* ── FEATURES — THE ROOM SLOT (Mark 2026-08-27) ───────────────────────────────────────────── [REF#DG-00026]
   *  "dont add a trap yet, but add it to rooms, as this will be some things we add like locked
   *   doors, secret doors, traps (pits that open up)."
   *
   *  THIS IS THE SLOT AND NOTHING ELSE. No trap fires, no door locks, nothing opens. A feature
   *  record that exists and is consumed by nobody is the CORRECT state for this task — the point is
   *  that locked doors, secret doors and pits all have somewhere to live before any of them is built,
   *  so the first one does not invent its own private shape.
   *
   *  IT DELIBERATELY MIRRORS THE DOOR LAW, because that pattern already earned its keep here: every
   *  feature gets its OWN FEATURE_ID and its own record — never a shared instance, never a clone of
   *  a master — every feature carries a mandatory `roomId`, validate() refuses an orphan, and the
   *  tiles it occupies are tagged back (`tile.featureId`) exactly as `tile.doorId` works. A rogue FPS
   *  pass once collapsed all doors into one shared instance and cost three weeks of chasing symptoms
   *  of anonymity; features start life addressable so that cannot happen twice.
   *
   *  ⚠ ONE WORD, ONE MEANING (the DoorTypes.json lesson). The vocabulary is closed and lives HERE so
   *    room.html and the engine read the same list rather than each inventing synonyms:
   *      'locked_door'  — a doorway that refuses passage until something opens it
   *      'secret_door'  — a doorway that does not read as one until found
   *      'pit'          — a floor tile that does something when a GROUNDED player enters it
   *    Extend by adding to FEATURE_TYPES, never by passing a string nobody agreed on.
   *
   *  ⚠⚠ ARCHITECTURAL NOTE ON PITS, recorded here because it decides whether they are buildable:
   *    A PIT CANNOT BE VERTICAL PHYSICS IN THIS ENGINE. Colliders are {minX,maxX,minZ,maxZ} — 2-D,
   *    no Y — so there is nothing to fall THROUGH and no floor to land ON. A literal "fall in" needs
   *    a collision-system rewrite. BUT THE MECHANIC MARK WANTS DOES NOT: a pit is a TILE TYPE that
   *    fires an EVENT when a GROUNDED player enters, and the airborne flag from the jump SUPPRESSES
   *    it. "Jump over it OR fall inside" then falls straight out of the jump that already exists —
   *    airborne over a pit tile does nothing, grounded on it fires. That is how classic dungeon
   *    crawlers did it, it needs no Y axis, and it means the trap idea is reachable today.
   */
  const FEATURE_TYPES = ['locked_door', 'secret_door', 'pit'];

  // A feature IN a room. `roomId` is REQUIRED and the type must be in the vocabulary — same law the [REF#DG-00027]
  // doors live under, refused at the door rather than validated after the fact.
  function createFeature(spec) {
    const room = _rooms.get(spec && spec.roomId);
    if (!room) throw new Error('Creator.createFeature: unknown roomId "' + (spec && spec.roomId) +
      '" — every feature carries a ROOM_ID reference, no exceptions');
    if (FEATURE_TYPES.indexOf(spec.type) < 0) throw new Error('Creator.createFeature: unknown type "' +
      spec.type + '" — the vocabulary is ' + FEATURE_TYPES.join(' | ') + ' (one word, one meaning)');
    const f = {
      featureId: _fid(),
      roomId: room.roomId,                           // ← THE ROOM_ID LINK [REF#DG-00028 → see REF#DG-00019]
      type: spec.type,
      tiles: (spec.tiles || []).map(t => [t[0], t[1]]),
      state: spec.state || 'idle',                   // per-FEATURE, never global. No consumer yet, by design. [REF#DG-00029]
      data: spec.data || {}                          // per-type payload; shape belongs to whoever builds the type [REF#DG-00030]
    };
    _features.set(f.featureId, f);
    room.features.push(f.featureId);
    return f;
  }

  /* ── DOOR GEOMETRY — written ONCE, here, on the registry (2026-08-28) ───────────────────────── [REF#DG-01070]
   *  The engine carries at least four competing derivations of "where is the door plane" and two
   *  independent proximity globals; every consumer that re-derives either drifts. These two helpers
   *  are the single source: reach tests go through doorContact(), pane geometry through doorPane().
   *  ⚠ ALL UNITS ARE TILES. The engine world is tiles × GRID — consumers divide by GRID on the way
   *    in and multiply on the way out. Mixing units here is the "right value, wrong object" bug
   *    with extra steps, so the contract is stated once and loudly.
   */
  // The pane segment of a door: { axis:'x'|'z', c, a0, a1 } in TILE units, or null when it cannot [REF#DG-01071]
  // be known without guessing. Priority: (1) the bridge-stamped d.pane (the engine's carved record,
  // authoritative); (2) seam-model derivation from tiles+side — the pane stands ON the room edge
  // its `side` names, spanning the doorway tiles; (3) null. A null is an ANSWER (caller falls back
  // to its legacy path), not an error — refusing to guess is the point.
  function doorPane(dOrId) {
    const d = (typeof dOrId === 'string') ? _doors.get(dOrId) : dOrId;
    if (!d) return null;
    if (d.pane && (d.pane.axis === 'x' || d.pane.axis === 'z')
        && isFinite(d.pane.c) && isFinite(d.pane.a0) && isFinite(d.pane.a1)) return d.pane;
    if (!d.tiles.length || !d.side) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of d.tiles) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    // Seam model: the door tile sits IN the owning room's edge row/column; the divider pane stands [REF#DG-01072]
    // on the boundary between that tile and the space beyond, i.e. half a tile outward on `side`.
    if (d.side === 'n') return { axis: 'x', c: minZ - 0.5, a0: minX - 0.5, a1: maxX + 0.5 };
    if (d.side === 's') return { axis: 'x', c: maxZ + 0.5, a0: minX - 0.5, a1: maxX + 0.5 };
    if (d.side === 'w') return { axis: 'z', c: minX - 0.5, a0: minZ - 0.5, a1: maxZ + 0.5 };
    if (d.side === 'e') return { axis: 'z', c: maxX + 0.5, a0: minZ - 0.5, a1: maxZ + 0.5 };
    return null;
  }
  // Contact test against the pane SEGMENT — the fix for the exit-door deadlock: a closed door is a [REF#DG-01073]
  // SOLID tile, so the nearest legal standing CENTRE can be ~1.5 tiles from the door's centre and a
  // centre-distance trigger locks the player out of their own exit. Body-EDGE to segment cannot:
  // an adjacent tile's centre is ~0.5 tiles off the pane line. px/pz/bodyR in TILE units.
  // Returns { dist, reach, contact } — dist is body-edge distance (clamped at 0), never negative.
  function doorContact(dOrId, px, pz, bodyR) {
    const d = (typeof dOrId === 'string') ? _doors.get(dOrId) : dOrId;
    const p = doorPane(d);
    if (!p) return null;                             // no pane, no verdict — caller keeps its legacy test [REF#DG-01074]
    const r = (typeof bodyR === 'number' && isFinite(bodyR) && bodyR >= 0) ? bodyR : 0;
    const along = (p.axis === 'x') ? px : pz;        // player coord along the pane [REF#DG-01075]
    const perp  = (p.axis === 'x') ? pz : px;        // player coord across it [REF#DG-01076]
    const t = Math.max(p.a0, Math.min(p.a1, along)); // nearest point ON the segment [REF#DG-01077]
    const dist = Math.max(0, Math.hypot(along - t, perp - p.c) - r);
    return { dist, reach: d.reach, contact: dist <= d.reach };
  }

  /* ── ADOPTION — consolidate any generator's map into the registry ──────────────────────────── [REF#DG-00031] */
  function adopt(map, genRooms) {
    // ⚠ SNAPSHOT AUTHORED DOOR DECLARATIONS BEFORE `reset()` WIPES THEM. Keyed by the door's FIRST [REF#DG-01426]
    //   TILE, which is the only identity that survives a re-mint (DOOR_IDs are reissued from scratch).
    //   ⚠ SAME-PASS ONLY: this map is built and consumed inside this call and never stored. A snapshot
    //     that outlived the pass would let floor N's authored doors bleed onto floor N+1's geometry.
    const _authored = new Map();
    const _sectionAuthored = new Map();
    try {
        for (const d of _doors.values()) {
            if (d.sectionDoorRole) {
                const section = {};
                for (const f of SECTION_DOOR_FIELDS) section[f] = d[f];
                _sectionAuthored.set(doorTilesKey(d.tiles), section);
            }
            const t = d && d.tiles && d.tiles[0];
            if (!t) continue;
            const keep = {};
            for (const f of ADOPT_MERGE_FIELDS) if (d[f] !== undefined && d[f] !== null) keep[f] = d[f];
            if (Object.keys(keep).length) _authored.set(t[0] + ',' + t[1], keep);
        }
    } catch (_) {}
    reset();
    if (!map || !map.length) return { rooms: 0, doors: 0 };
    const W = map.length, H = map[0].length;

    // 1. ROOMS. Prefer the generator's room list (id, bounds, kind); fall back to scanning roomIds. [REF#DG-00032]
    const seen = new Set();
    if (Array.isArray(genRooms)) for (const g of genRooms) {
      if (g == null || g.id === undefined || seen.has(g.id)) continue;
      seen.add(g.id);
      // ⚠ CARRY THE SECTION. Creator's records held floor-relative geometry and a kind, and NO [REF#DG-01078]
      //   segmentId — so the registry that is meant to own `floor -> section -> room` did not store
      //   the middle tier at all, and the `address` rule could only report "(none)" for every room.
      //   Mark 2026-08-30: "creator feature should understand each model needs this hierarchy".
      //   It cannot understand a tier it does not carry. The generator has had it all along
      //   (25/25 · 15/15 · 4/4 · 6/6 · 2/2 records measured) — adopt() was dropping it.
      createRoom({ genId: g.id, x: g.x, z: g.y !== undefined ? g.y : g.z, w: g.w, h: g.h,
                   // ⛔⛔ IT READ `g.type` AND THE GENERATORS WRITE `g.roomType`. Every hallway, [REF#DG-01079]
                   //   ring and passage in this tree has therefore been adopted as kind 'room' and
                   //   judged by the ROOM rules since Creator existed.
                   //   MEASURED on Mark's hand-drawn floor: 内回廊 / 外回廊 / 通路 / the three
                   //   passages ALL declare `roomType: 'hallway'` in the design — the drawing was
                   //   labelled correctly all along and Creator was looking at the wrong field. That
                   //   is why a 22x21 RING was being asked to be in a catalogue whose largest entry
                   //   is 8x8, and why "Outer Ring has no door" was reported about a CORRIDOR.
                   //   ⚠ THE SHAPE OF THIS IS THE DAY'S REFRAIN: not a wrong rule this time, a wrong
                   //     FIELD — the rules were fine, they were being fed a lie about what each space
                   //     IS. Read the object, not the field you assumed it used.
                   kind: g.kind || g.roomType || g.type || 'room', shapeKey: g.shapeKey || null,
                   // ⚠ AND `special` WITH THEM — the SAME defect as the two notes above, one field [REF#DG-01700]
                   //   later, caught the same way. Mark 2026-09-08 ruled room-shape has no
                   //   jurisdiction over a special's size; the flag was set on the pre-adopt room and
                   //   adopt() re-mints, so the live 風呂場 came back WITHOUT it and was failed for a
                   //   15x15 footprint anyway. MEASURED: verdict room-shape:1 with the flag set in
                   //   Section0 — the exemption existed and never reached the room being graded.
                   //   A flag a generator sets is worth nothing if the re-mint does not carry it.
                   special: (g.special === true),
                   segmentId: (g.segmentId !== undefined && g.segmentId !== null) ? g.segmentId : null,
                  // ⚠ SAME SHAPE AS THE `g.type` / `g.roomType` NOTE ABOVE, one tier down: the rules [REF#DG-01427]
                  //   were fine, the middle tier was being fed the wrong field. The generator assigns
                  //   `sectionIndex` (DungeonChain ~:1542) and the names; adopt() was dropping all three.
                  sectionIndex: (typeof g.sectionIndex === 'number') ? g.sectionIndex : null,
                  roomName:   g.roomName   || null,
                  roomNameEn: g.roomNameEn || null });
    }
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {          // rooms the list missed [REF#DG-00033]
      const c = map[x][z];
      if (c && c.roomId !== undefined && c.roomId !== null && !seen.has(c.roomId)) {
        seen.add(c.roomId);
        createRoom({ genId: c.roomId, kind: 'room' });
      }
    }

    // 2. DOORS. Group contiguous doorway tiles into ONE door each (a 2-tile doorway is one door [REF#DG-00034]
    //    with span 2, not two doors), mint a DOOR_ID, resolve the ROOM_ID link, tag tiles back.
    const isDoor = (x, z) => { const c = map[x] && map[x][z]; return !!c && c.type === 'shoji_door'; };
    // ── A TWIN IS A CONTIGUOUS DOOR TILE OF THE SAME ROOM — TWO ROOMS' DOORS THAT TOUCH ARE TWO DOORS ── [REF#DG-02048]
    //    MEASURED 2026-09-13 on floor 1 after the wings were halved: the Junk Store's door (84,59) sits
    //    directly above the east wing's spur→spine link door (84,60). Grouping by adjacency alone fused
    //    them into ONE 2-span door owned by the Junk Store, the link's authored declaration orphaned
    //    ("found no door on their tile: 84,60 → SHIFTED? an undeclared door sits adjacent at
    //    DOOR_025@84,59"), and the link lost its record. Every generator stamps a 2-tile doorway's tiles
    //    with one roomId (Section0 `door(t, id)`, DungeonChain `roomId: rm`), so "same room" is exactly
    //    what makes two tiles one doorway. A tile with no roomId still joins, as before.
    const ridOf = (x, z) => { const c = map[x] && map[x][z]; return (c && c.roomId !== undefined && c.roomId !== null) ? c.roomId : null; };
    const isTwin = (x, z, x2, z2) => { if (!isDoor(x2, z2)) return false; const a = ridOf(x, z), b = ridOf(x2, z2); return a === null || b === null || a === b; };
    const used = new Set();
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
      if (!isDoor(x, z) || used.has(x + ',' + z)) continue;
      const tiles = [[x, z]]; used.add(x + ',' + z);
      if (isTwin(x, z, x + 1, z)) { let i = 1; while (isTwin(x, z, x + i, z)) { tiles.push([x + i, z]); used.add((x + i) + ',' + z); i++; } }
      else if (isTwin(x, z, x, z + 1)) { let i = 1; while (isTwin(x, z, x, z + i)) { tiles.push([x, z + i]); used.add(x + ',' + (z + i)); i++; } }

      // both spaces this doorway joins = the roomIds on either side of the run [REF#DG-00035]
      const across = (tiles.length > 1 && tiles[1][0] !== tiles[0][0])
        ? [[0, -1], [0, 1]] : (tiles.length > 1 ? [[-1, 0], [1, 0]] : [[-1, 0], [1, 0], [0, -1], [0, 1]]);
      const sides = new Set();
      for (const [tx, tz] of tiles) for (const [dx, dz] of across) {
        const c = map[tx + dx] && map[tx + dx][tz + dz];
        if (c && c.roomId !== undefined && c.roomId !== null && c.type !== 'wall') sides.add(c.roomId);
      }
      const doorCell = map[tiles[0][0]][tiles[0][1]];
      if (doorCell.roomId !== undefined && doorCell.roomId !== null) sides.add(doorCell.roomId);

      // the OWNER is the room the door is "of": prefer the doorway tile's own roomId, else the [REF#DG-00036]
      // lowest adjacent — deterministic, so the same map always mints the same links.
      const ownerGen = (doorCell.roomId !== undefined && doorCell.roomId !== null)
        ? doorCell.roomId : Math.min.apply(null, [...sides]);
      let ownerId = _byGenId.get(ownerGen);
      if (!ownerId) ownerId = createRoom({ genId: ownerGen, kind: 'room' }).roomId;

      const d = createDoor({
        roomId: ownerId,
        connects: [...sides].sort((a, b) => a - b).map(g => _byGenId.get(g) || ('gen:' + g)),
        span: tiles.length,
        tiles
      });
      for (const [tx, tz] of tiles) map[tx][tz].doorId = d.doorId;   // tile -> door, the way back [REF#DG-00037]
      const section = _sectionAuthored.get(doorTilesKey(tiles));
      if (section) { Object.assign(d, section); _sectionAuthored.delete(doorTilesKey(tiles)); }
    }
    for (const [key, section] of _sectionAuthored) {
      const msg = 'Creator adoption lost exact tiles for ' + section.sectionDoorKey + ': ' + key;
      if (global.parent && typeof global.parent.postMessage === 'function') global.parent.postMessage({ type:'ANOMALY_REPORT', code:'SECTION_DOOR_ADOPT', msg }, '*');
      else console.warn(msg);
    }
    // 3. FEATURES authored on the generator's own room list travel with it. Without this, an [REF#DG-00038]
    //    authored feature vanishes the moment a generator's output is adopted — the same way an
    //    un-adopted door would lose its identity.
    if (Array.isArray(genRooms)) for (const g of genRooms) {
      if (!g || !Array.isArray(g.features) || !g.features.length) continue;
      const rid = _byGenId.get(g.id);
      if (!rid) continue;
      for (const spec of g.features) {
        try {
          const f = createFeature({ roomId: rid, type: spec.type, tiles: spec.tiles, state: spec.state, data: spec.data });
          for (const t of f.tiles) if (map[t[0]] && map[t[0]][t[1]]) map[t[0]][t[1]].featureId = f.featureId;
        } catch (e) { /* an illegal feature is refused, never silently downgraded — surfaced by validate() */ }
      }
    }
    // ── RE-APPLY THE AUTHOR'S TRUTH ONTO THE RE-MINTED RECORDS ────────────────────────────────── [REF#DG-01428]
    //   Joined on the first tile. Geometry stays exactly as this pass derived it.
    //   ⚠ FAIL LOUD, NOT SILENT: an authored declaration whose tile no longer hosts a door means the
    //     map moved under the authoring, and that is a real inconsistency worth a warning rather than
    //     a quiet drop — a silently lost `theme:'cabaret'` is how the cabaret doors lost theirs.
    let _merged = 0; let _orphans = [];
    try {
        const _byTile = new Map();
        for (const d of _doors.values()) { const t = d.tiles && d.tiles[0]; if (t) _byTile.set(t[0] + ',' + t[1], d); }
        for (const [k, keep] of _authored) {
            const d = _byTile.get(k);
            if (!d) { _orphans.push(k); continue; }
            for (const f in keep) d[f] = keep[f];
            _merged++;
        }
        // ── ORPHAN DIAGNOSIS: A DELETED DOORWAY AND A SHIFTED ONE ARE DIFFERENT PROBLEMS ─────────── [REF#DG-01429]
        //   The map legitimately CHANGES between adopt passes: the engine runs `assignCorridorIds`
        //   then `convertBands` — which turns wall tiles into floor and can expose further bands — and
        //   re-adopts the changed map. So a doorway that genuinely ceased to exist has nothing to
        //   attach a declaration to, and dropping it is CORRECT.
        //   ⚠ THE CASE THAT IS NOT FINE is a doorway that MOVED: the declaration orphans at the old
        //     tile while a new door sits a tile away carrying none, and an authored side or theme is
        //     silently lost to a near-miss.
        //   ⚠⚠ THIS DIAGNOSES, IT DOES NOT AUTO-ATTACH. Widening the join to "nearest door within a
        //     tile" would attach a declaration to a door nobody declared it for, and after this week a
        //     WRONG attachment is worse than a lost one — a lost one is in this log, a wrong one looks
        //     correct forever. If the shifted case ever shows up here, it wants a real answer, not a
        //     radius.
        // A DECLARATION WE RETIRED ON PURPOSE IS NOT AN ANOMALY. `repair()` opens a doorway that [REF#DG-01429b]
        //   cannot sit in any wall line (Mark 2026-09-07: "remove the doors there first make it all
        //   opening instead"), which necessarily orphans that tile's declaration. Warning about it
        //   trains the next reader to ignore this line, and this line is the only thing standing
        //   between a silently lost `theme:'cabaret'` and nobody noticing — so the deliberate case is
        //   split out and logged calmly, and the warn keeps its meaning.
        const _retired = _orphans.filter(k => _openedDoorways.has(k));
        if (_retired.length) {
            _orphans = _orphans.filter(k => !_openedDoorways.has(k));
            console.log('[Creator.adopt] ' + _retired.length + ' door declaration(s) retired with the doorway that was '
                + 'opened on purpose: ' + _retired.join(', ') + ' (Mark 2026-09-07 — a doorway with no wall line to '
                + 'sit in becomes a plain opening; see repair()).');
        }
        if (_orphans.length) {
            const _diag = _orphans.map(k => {
                const [ox, oz] = k.split(',').map(Number);
                let near = null;
                for (const d of _doors.values()) {
                    const t = d.tiles && d.tiles[0]; if (!t) continue;
                    if (Math.abs(t[0] - ox) <= 1 && Math.abs(t[1] - oz) <= 1) { near = d.doorId + '@' + t[0] + ',' + t[1]; break; }
                }
                return k + (near ? ' → SHIFTED? an undeclared door sits adjacent at ' + near : ' → doorway gone (band conversion), declaration correctly dropped');
            });
            console.warn('[Creator.adopt] ' + _orphans.length + ' authored door declaration(s) found no door on their tile: '
                + _diag.join('  |  ') + '   (the map moves between passes: assignCorridorIds + convertBands run in between)');
        }
        if (_merged) console.log('[Creator.adopt] carried ' + _merged + ' authored door declaration(s) across the re-mint ('
            + ADOPT_MERGE_FIELDS.join(', ') + ')');
        // AUTHOR-FIRST: fill the wall ONLY where the author left none. [REF#DG-01430]
        let _derived = 0, _noSide = 0;
        for (const d of _doors.values()) {
            if (d.side) continue;
            const side = deriveDoorSide(_rooms.get(d.roomId), d.tiles);
            if (side) { d.side = side; d.sideDerived = true; _derived++; } else _noSide++;
        }
        if (_derived || _noSide) {
            let _auth = 0, _inf = 0;
            for (const d of _doors.values()) { if (!d.side) continue; if (d.sideDerived === true) _inf++; else _auth++; }
            console.log('[Creator.adopt] wall: ' + _auth + ' author-declared · ' + _inf + ' derived · '
                + _noSide + ' still unknown  (' + _merged + ' carried this pass, ' + _derived
                + ' newly derived; announcements drop the wall, not the door)');
        }
    } catch (_) {}

    return { rooms: _rooms.size, doors: _doors.size, features: _features.size };
  }

  /* ── LOOKUPS — the addressability the rogue pass removed ───────────────────────────────────── [REF#DG-00039] */
  const rooms = () => [..._rooms.values()];
  const doors = () => [..._doors.values()];
  const roomById = id => _rooms.get(id) || null;
  const doorById = id => _doors.get(id) || null;
  const doorsOfRoom = roomId => { const r = _rooms.get(roomId); return r ? r.doorIds.map(i => _doors.get(i)) : []; };
  const roomByGenId = genId => _rooms.get(_byGenId.get(genId)) || null;
  const features = () => [..._features.values()];
  const featureById = id => _features.get(id) || null;
  const featuresOfRoom = roomId => { const r = _rooms.get(roomId); return r ? r.features.map(i => _features.get(i)) : []; };

  /* ── VALIDATE — the law, checkable. Every violation is a string; [] means lawful. ──────────── [REF#DG-00040] */
  function validate() {
    const bad = [], tileOwner = new Map();
    for (const d of _doors.values()) {
      if (!d.roomId || !_rooms.has(d.roomId)) bad.push(d.doorId + ' has no living ROOM_ID (law: every door carries one)');
      for (const [x, z] of d.tiles) {
        const k = x + ',' + z;
        if (tileOwner.has(k)) bad.push(d.doorId + ' shares tile ' + k + ' with ' + tileOwner.get(k) + ' (law: no shared instances)');
        tileOwner.set(k, d.doorId);
      }
      const r = _rooms.get(d.roomId);
      if (r && r.doorIds.indexOf(d.doorId) < 0) bad.push(d.roomId + ' does not list ' + d.doorId + ' (link must be two-way)');
      if (!(typeof d.reach === 'number' && isFinite(d.reach) && d.reach > 0))
        bad.push(d.doorId + ' has invalid reach ' + d.reach + ' (law: a finite tile distance > 0, default 0.25)');
      if (d.pane !== null && !(d.pane && (d.pane.axis === 'x' || d.pane.axis === 'z')
          && isFinite(d.pane.c) && isFinite(d.pane.a0) && isFinite(d.pane.a1) && d.pane.a0 <= d.pane.a1))
        bad.push(d.doorId + ' has malformed pane ' + JSON.stringify(d.pane) + ' (law: {axis x|z, c, a0<=a1} in tiles, or null)');
    }
    for (const r of _rooms.values()) for (const i of r.doorIds)
      if (!_doors.has(i)) bad.push(r.roomId + ' lists dead door ' + i);
    // FEATURES live under the same law as doors: no orphans, no shared tiles, links both ways. [REF#DG-00041]
    const featTile = new Map();
    for (const f of _features.values()) {
      if (!f.roomId || !_rooms.has(f.roomId)) bad.push(f.featureId + ' has no living ROOM_ID (law: every feature carries one)');
      if (FEATURE_TYPES.indexOf(f.type) < 0) bad.push(f.featureId + ' has unknown type "' + f.type + '"');
      for (const [x, z] of f.tiles) {
        const k = x + ',' + z;
        if (featTile.has(k)) bad.push(f.featureId + ' shares tile ' + k + ' with ' + featTile.get(k) + ' (law: no shared instances)');
        featTile.set(k, f.featureId);
      }
      const r = _features.size && _rooms.get(f.roomId);
      if (r && r.features.indexOf(f.featureId) < 0) bad.push(f.roomId + ' does not list ' + f.featureId + ' (link must be two-way)');
    }
    for (const r of _rooms.values()) for (const i of r.features)
      if (!_features.has(i)) bad.push(r.roomId + ' lists dead feature ' + i);
    return bad;
  }

  /* ── THE RUN SEED — one derivation, one place ───────────────────────────────────────────────── [REF#DG-00043] */
  // Mark, 2026-08-30: "make sure its the map that works with the creator system so each section will [REF#DG-01080]
  // be unique each game, but the save will work, and each level can be unique and stored when
  // transversing up and down between these same levels, so it will keep the record for player
  // progress."
  //
  // Those are four requirements that pull against each other, and the engine's existing answer is the
  // right one: DERIVE, NEVER STORE. A floor is a pure function of the run seed and the level, so ONE
  // number in the save file reproduces every floor of the run, and walking back up to level 1 rebuilds
  // the level 1 you left. MEASURED 2026-08-30 (scripts/falsify-map-persistence.js): DungeonChain is
  // deterministic, seed-honouring, level-unique, game-unique and return-stable — the architecture
  // works. `gameSeed` also survives the iframe reload a floor change performs, and matches what the
  // save writes.
  //
  // ⚠ THE DERIVATION WAS RETYPED IN FOUR PLACES (Engine9 :5461, MapGen.js :15, and both of the 08-29
  //   gate scripts). `_TWH` was retyped twelve times and that is a documented disaster in
  //   MAP_GEOMETRY_LAW §2. This is the single source; everything else should call it.
  //
  // ⚠⚠ AND HERE IS THE CONSEQUENCE OF MARK'S FOUR SENTENCES THAT NOTHING HAS STATED BEFORE:
  //   **THE MOMENT YOU REROLL, A FLOOR IS NO LONGER A PURE FUNCTION OF (gameSeed, level).**
  //   If the generator rolls until the shape law passes, then floor 1 is "the FIRST roll that passed"
  //   — and if anything about the validator, the generator or the room catalogue changes between the
  //   player going down and coming back up, a different roll passes and THE PLAYER WALKS UP INTO A
  //   DIFFERENT FLOOR. Progress kept against a map that no longer exists.
  //   The fix is one integer: the ATTEMPT INDEX is part of the derivation, and the accepted attempt is
  //   recorded per level so the save can carry it. Returning re-derives from (gameSeed, level, attempt)
  //   and gets the identical floor without re-running the validator at all.
  let _runSeed = 0;
  const _acceptedAttempt = new Map();   // level -> the attempt index that passed [REF#DG-00044]

  function setRun(gameSeed, acceptedAttempts) {
    _runSeed = (parseInt(gameSeed, 10) >>> 0) || 0;
    _acceptedAttempt.clear();
    // Restored straight from a save payload: { "1": 0, "2": 3, ... } [REF#DG-01081]
    if (acceptedAttempts) for (const k of Object.keys(acceptedAttempts)) {
      const lv = parseInt(k, 10), a = acceptedAttempts[k] | 0;
      if (isFinite(lv)) _acceptedAttempt.set(lv, a);
    }
    return _runSeed;
  }
  const runSeed = () => _runSeed;

  // The engine's own expression, verbatim (Engine9 :5461), plus the attempt salt. attempt 0 is [REF#DG-01082]
  // EXACTLY the historical value, so nothing that already shipped changes seed.
  function floorSeed(level, attempt) {
    const base = (_runSeed ^ ((level * 0x1A1A1A1A) >>> 0)) >>> 0;
    const a = attempt | 0;
    return a === 0 ? base : ((base ^ Math.imul(a + 1, 0x9E3779B1)) >>> 0);
  }

  // mulberry32 — the same generator DungeonChain and DungeonEmergency already use, so a layout authored [REF#DG-01083]
  // through Creator draws from the same stream shape the rest of the tree does.
  function rng(level, attempt) {
    let t = floorSeed(level, attempt) >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const acceptedAttempts = () => { const o = {}; for (const [k, v] of _acceptedAttempt) o[k] = v; return o; };
  const acceptedAttemptFor = (level) => _acceptedAttempt.has(level) ? _acceptedAttempt.get(level) : null;

  // THE REROLL. `genFn(seed, level)` must return { map, rooms }. Returns the first roll that satisfies [REF#DG-01084]
  // BOTH laws, together with the attempt index that must be saved.
  //
  //   · A NEW SEED EACH TRY, not a retry — rerolling the same seed is a loop, not a search.
  //   · A KNOWN ACCEPTED ATTEMPT is replayed directly and NOT re-validated: that is what makes walking
  //     back up to a floor cheap and, more importantly, what makes it the SAME floor even if the
  //     validator has changed since.
  //   · NEVER SHIP A FAILING MAP SILENTLY. On exhaustion this THROWS. A generator that quietly
  //     degrades is exactly how a floor shipped with every gate green and Mark rejected it on sight.
  function generateAccepted(genFn, level, opts) {
    const o = opts || {};
    const MAX = (typeof o.tries === 'number') ? o.tries : 24;
    const known = acceptedAttemptFor(level);
    if (known !== null && !o.revalidate) {
      const out = genFn(floorSeed(level, known), level);
      if (out && out.map) { adopt(out.map, out.rooms); out.attempt = known; out.replayed = true; return out; }
    }
    const why = [];
    for (let a = 0; a < MAX; a++) {
      const out = genFn(floorSeed(level, a), level);
      if (!out || !out.map) { why.push(a + ':no-map'); continue; }
      adopt(out.map, out.rooms);
      const v = accept(out.map, o);
      if (v.ok) {
        _acceptedAttempt.set(level, a);
        out.attempt = a; out.replayed = false;
        return out;
      }
      const first = (v.geometry[0] && v.geometry[0].rule) || (v.identity[0] ? 'identity' : '?');
      why.push(a + ':' + first + '(' + (v.geometry.length + v.identity.length) + ')');
    }
    throw new Error('Creator.generateAccepted: level ' + level + ' — all ' + MAX
      + ' rolls failed the map laws [' + why.join(' ') + ']. A failing map is NOT shipped silently; '
      + 'fall back to a hand-authored layout at the call site and say so in the log.');
  }

  /* ── THE SHAPE LAW ─────────────────────────────────────────────────────────────────────────── [REF#DG-00042] */
  // Mark, 2026-08-29: "what do you recommend so we can have good and health room and hallway [REF#DG-01085]
  // connections layouts and designs of shapes? and making sure doors are correct, its not difficult -
  // it's just that we had 2 different panes to look at FPV/TOP DOWN and that was ignored. so lets put
  // the fix to our creator system so our maps are always RNG for each game but beautiful and render
  // well."
  //
  // `validate()` above is the LAW OF IDENTITY: every door has a room, no shared tiles, links both
  // ways. It has never known anything about SHAPE — so a map could be perfectly addressable and still
  // be three rectangles with two 1-tile closets, which is exactly what shipped on 2026-08-27.
  //
  // THIS IS THE OTHER HALF. Every rule below is a failure this repo actually had, with the date; not
  // one of them is invented. It is pure data — no THREE, no DOM — so it runs in the engine, in
  // room.html and in node, and a generator can call it BEFORE it commits to a layout.
  //
  // ⚠ THE POINT OF IT IS THE REROLL. You do not make an RNG generator that cannot produce an ugly
  //   map; you make a validator you trust and reroll until it passes. That is the only honest way to
  //   get "always RNG for each game but beautiful" — and it is worth nothing unless the validator is
  //   strong enough to be trusted, which is why each rule cites the incident that earned it.
  //
  // Returns an ARRAY OF OBJECTS (not strings like validate(), deliberately — a gate needs to group and
  // count by rule): { rule, msg, at:[x,z]|null, severity:'fail'|'warn' }. Empty array = clean.
  // ── ROOM QUANTITY GROWS WITH DEPTH (Mark 2026-08-30: "i want a rule that each level, the room
  //    qty +1") ────────────────────────────────────────────────────────────────────────────────
  //    Declared here so there is ONE definition of it, in the system that owns rooms, rather than a
  //    number buried in a packer. MEASURED on DungeonChain before this rule existed (gameSeed 424242):
  //        level  1   2   3   4   5   6   7
  //        rooms 22  15  14  15  13  13  14
  //    — no growth at all, and the deepest floor is smaller than the second. Level 1 is inflated by its
  //    hand-authored head rooms, so the BASE is the procedural floor count, not level 1's total.
  //    Knobs: window._roomTargetBase (14) · window._roomTargetStep (1) · window._roomTargetLevel1 (22,
  //    level 1 keeps its own count because its head is hand-authored and is not the packer's to grow).
  function roomTarget(level) {
    const g = (typeof window !== 'undefined') ? window : global;
    if (level === 1) return (typeof g._roomTargetLevel1 === 'number') ? g._roomTargetLevel1 : 22;
    const base = (typeof g._roomTargetBase === 'number') ? g._roomTargetBase : 14;
    const step = (typeof g._roomTargetStep === 'number') ? g._roomTargetStep : 1;
    return base + step * (level - 2);   // level 2 == base; every level below it adds `step` [REF#DG-01086]
  }

  const GEOMETRY_RULES = [
    'band',              // 2026-08-18/23/29 "STUPID DOUBLE WALL ... IT DOUBLES IT ALL" [REF#DG-01087]
    'doorway-line',      // 2026-08-29 a leaf cannot be hung or oriented in a doorway that is not in a wall line [REF#DG-01088]
    'doorway-joins',     // 2026-08-29 sealed, does the map split? (WARN — rewritten structural 08-30; a loop is legal) [REF#DG-01089]
    'room-ragged',       // 2026-08-29 a room whose floor is not the shape its record claims (WARN — L/T shapes are legal) [REF#DG-01090]
    'room-no-door',      // a room nobody can enter [REF#DG-01091]
    'dead-end-nub',      // 2026-08-27 "three rectangles with two 1-tile nubs" — the closets AI 1 invented [REF#DG-01092]
    'pocket',            // a walkable island too small to be a place [REF#DG-01093]
    'unreachable',       // 2026-08-25 sealed-off space [REF#DG-01094]
    'room-count',        // 2026-08-30 "each level, the room qty +1" — a floor short of its depth target [REF#DG-01095]
    'door-placement',    // 2026-08-30 Mark: "the rules for ... door locations" — <=1 doorway per wall, ON the midpoint [REF#DG-01096]
    'address',           // 2026-08-30 Mark: "floor, section id, room id ... doors, chests, beds, monsters, loot, traps" [REF#DG-01097]
    'room-shape',        // 2026-08-30 "none of these rooms are in our creator shapes" — a footprint not in RoomShapes [REF#DG-01098]
    'room-unsheathed',   // a walkable tile whose non-walkable neighbour is not a WALL — the map-side half of "a collider needs a surface" [REF#DG-01305]
  ];

  // ── THE WALL CHAIN, AND WHICH LINK EACH RULE CAN SEE ─────────────────────────────────────────── [REF#DG-01306]
  //    A wall the player can bump into is FOUR things, produced by four different passes, and a
  //    defect in any one of them looks identical from the console:
  //
  //      1. ROOM FOOTPRINT   a room is carved (floors)                        <- map, offline
  //      2. WALL TILE        `_sheathe` types every rock tile touching a       <- map, offline
  //                          walkable tile as 'wall'  (DungeonEmergency :190)
  //      3. WALL SURFACE     the pane/seam pass draws a MESH on that seam      <- RENDER, needs a boot
  //      4. COLLIDER         an AABB is pushed for that seam                   <- RENDER, needs a boot
  //
  //    ⚠ RULES 1-2 ARE GRADEABLE FROM THE MAP ALONE. Rules 3-4 are NOT — they are produced at render
  //      time, which is why `collider-surface` takes booted EVIDENCE instead of reading the map.
  //    ⚠ THE POINT OF SPLITTING THEM: when the console reports "N colliders have no wall surface",
  //      the first question is WHICH LINK BROKE, and guessing costs a build. `room-unsheathed` answers
  //      link 2 offline in milliseconds. MEASURED 2026-09-02 on floor 1: **0 unsheathed edges** — so a
  //      149-orphan report on that same floor is NOT a missing wall tile, and any fix aimed at the
  //      generator would have been aimed at the wrong pass. The defect is at link 3 or 4.
  //    ⚠ AND A TRAP WORTH THE LINE: a loose render probe ("is any tall mesh near this point") answers
  //      YES for a NEIGHBOURING wall and produces a confident false green. The surface test must be
  //      SPAN-based on the same plane — cover lo..hi — which is what `_auditColliderSurfaces` does and
  //      what an ad-hoc proximity check does not.

  /** [REF#DG-01307]
   * Link 2 of the wall chain, offline: every walkable tile's non-walkable orthogonal neighbour must
   * be typed 'wall'. A bare/undefined tile there is a genuine hole in the sheathe and IS a
   * generator defect. Returns the offending tiles, capped.
   */
  function validateSheathe(map, opts) {
    const o = opts || {};
    const maxReport = (typeof o.maxReport === 'number') ? o.maxReport : 40;
    const out = [];
    if (!map || !map.length || !map[0]) return out;
    const W = map.length, H = map[0].length;
    const walk = (c) => !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door'
                                || /stairs/.test(c.type || ''));
    let n = 0;
    for (let x = 1; x < W - 1; x++) for (let z = 1; z < H - 1; z++) {
      if (!walk(map[x][z])) continue;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nb = map[x + d[0]] && map[x + d[0]][z + d[1]];
        if (walk(nb)) continue;
        if (!nb || nb.type !== 'wall') {
          n++;
          if (out.length < maxReport) out.push({ rule: 'room-unsheathe'.replace('sheathe', 'sheathed'),
            msg: 'walkable (' + x + ',' + z + ') touches (' + (x + d[0]) + ',' + (z + d[1]) + ') typed `'
              + (nb ? nb.type : 'undefined') + '`, not `wall`. The sheathe pass left a hole, so no surface '
              + 'can be derived there — link 2 of the wall chain.',
            at: [x + d[0], z + d[1]], severity: 'fail' });
        }
      }
    }
    if (n > out.length) out.push({ rule: 'room-unsheathed', at: null, severity: 'fail',
      msg: (n - out.length) + ' further unsheathed edge(s) not listed (cap ' + maxReport + ').' });
    return out;
  }

  function validateGeometry(map, opts) {
    const o = opts || {};
    const minPocket = (typeof o.minPocket === 'number') ? o.minPocket : 4;   // below this it is not a room, it is a closet [REF#DG-01099]
    const maxReport = (typeof o.maxReport === 'number') ? o.maxReport : 40;  // per rule, so one bad map cannot print 15k lines [REF#DG-01100]
    const out = [];
    const count = {};
    const push = (rule, msg, at, severity) => {
      count[rule] = (count[rule] || 0) + 1;
      if (count[rule] <= maxReport) out.push({ rule: rule, msg: msg, at: at || null, severity: severity || 'fail' });
    };
    if (!map || !map.length || !map[0]) return out;
    const W = map.length, H = map[0].length;
    const at = (x, z) => (map[x] && map[x][z]) ? map[x][z] : null;
    const isDoorC = (c) => !!c && (c.type === 'shoji_door' || c.type === 'door');
    // WALKABLE INCLUDES A DOORWAY. A doorway tile is a hole you walk through — treating it as wall is [REF#DG-01101]
    // how a door reads as "sealed" to one checker and "open" to the next.
    // A STAIRCASE IS FLOOR YOU WALK ON. MEASURED 2026-09-11, floors 2 and 3, 40 of 40 seeds: the landing's
    // south door faces the `stairs_up` tile and the stairs room's door faces `stairs_down`; without
    // this both read as "opens onto nothing", `doorway-line` fired, repair() opened the doorway into a
    // plain opening (retiring the door), and the roomId seam left behind made the flood below report the
    // konbini (51 tiles) and the way down as unreachable on EVERY seed. The sheathe checker (~:750)
    // already counted stairs; this, _repairReach and assignCorridorIds' isWalk now agree with it.
    const walk = (x, z) => { const c = at(x, z); return !!c && (c.type === 'floor' || isDoorC(c) || /^stairs/.test(c.type || '')); };
    const wall = (x, z) => { const c = at(x, z); return !c || c.type === 'wall' || c.type === 'rock' || c.type === 'void'; };

    // ── 1. BAND ── a wall TILE standing between two walkable spaces: a whole tile spent on a wall [REF#DG-01102]
    //    where the seam model puts a zero-thickness divider. The census calls it the "STUPID DOUBLE
    //    WALL" pathology, after Mark 2026-08-29: "a wall for the intersction and another wall for the
    //    caberet ... that is stupid."
    //    ⚠ THE OLD MESSAGE HERE SAID "it can only draw as two parallel walls with a void between" AND
    //      THAT STOPPED BEING TRUE ON 2026-08-29. Engine9's `BandWallBlocks` pass (~:19517) blanks the
    //      two inset panes and fills each band tile with ONE solid block, in BOTH cameras
    //      (`layers.set(1)` + `enable(4)`), faces landing on the same planes the panes occupied, with
    //      colliders and the LOS edge set untouched. The rule kept asserting a render consequence that
    //      had already been fixed — verified at the mesh by origamiunderworld-4b, 2026-08-30.
    //      **A rule must state the fact it MEASURES, not the consequence it once implied.** This one
    //      reads the TILE GRID, so the map fact is all it is entitled to claim; the drawing is the
    //      render layer's business and the render layer already answered.
    //    STILL `fail`, and deliberately: Mark's 2026-08-25 ruling is that a wall tile between two
    //    walkables IS the error and `npm run gate:bands` must read 0. The block pass makes it LOOK
    //    right; it does not make the tile right.
    //
    // ⛔⛔ MARK'S RULING, 2026-08-30: **BAND 0 IS NOT REACHABLE ON DungeonChain, AND THAT IS ACCEPTED.**
    //    ⚠ DO NOT SPEND ANOTHER NIGHT TRYING TO GET THIS TO ZERO. I did, twice, and quoted "band 0"
    //      to Mark as reachable both times. It is not, and the reason is structural rather than a
    //      missing cleverness:
    //          **THE TILE THE `band` RULE WANTS GONE **IS** THE WALL THE DOORWAY NEEDS.**
    //      A doorway occupies a TILE, so its wall line must be a tile thick and its run must be
    //      capped by wall. `band` asks "could a zero-thickness divider stand here instead?" — beside
    //      a door the answer is permanently no. TWO OF MARK'S OWN RULES COLLIDE ON THIS MAP.
    //    MEASURED (origamiunderworld-80, re-derived here, chain L1, seeds 12345/4242 identical):
    //      of every conversion `convertBands` wants, **ALL of the remaining candidates raise
    //      `doorway-joins`** — 13 take it 4→5, 3 take it 4→6 and drag `room-ragged` with them.
    //      100% breakers. The pass lands NOTHING, and that is the correct outcome, not a failure.
    //    SO THE HONEST READING OF A NON-ZERO band COUNT ON THIS GENERATOR: it is the count of walls
    //    that doors are standing in. It is not debt, and it is not a to-do.
    //    ⚠ THE ONLY WAY TO ZERO IS TO CHANGE THE GENERATOR — the one Mark ordered restored
    //      TILE-FOR-TILE from the 2026-08-15 public cut. That is his call and he has NOT made it;
    //      he accepted the collision instead. Anyone who "fixes" this without a fresh order from him
    //      is editing the map he asked nobody to edit. See MAP_HEALTH_CONTRACT §7 OPEN FINDINGS.
    //    ⚠⚠ A WALL TILE A DOORWAY REQUIRES IS NOT A WASTED TILE — EXEMPT 2026-08-30, MEASURED.
    //      The rule's premise is that a zero-thickness divider could stand here instead. THAT PREMISE
    //      IS FALSE NEXT TO A DOORWAY: a doorway occupies a TILE, so the wall line holding it must be
    //      a tile thick, and the tiles capping the door run must be wall or `doorway-line` fails
    //      ("the wall does not continue past both ends, so a leaf here has no jamb and no orientation").
    //      MEASURED on floor 1 after the band conversion: ALL 12 survivors are door-adjacent — 9 sit
    //      in a wall run that holds a doorway, 3 are the door run's own END-CAPS. `convertBands`
    //      already refuses every one of them for exactly this reason; the rule was still counting
    //      them as defects the map could not fix. A rule that reports an unfixable state is noise.
    //    ⚠ THE HONEST SPLIT, because "band 33 -> 1" is two different changes and quoting it as one
    //      would be the drift §1b warns about. On chain floor 1, all three seeds identically:
    //        THIS EXEMPTION alone:            33 -> 23  (removes 10)
    //        THE MAP CONVERSION alone:        33 -> 12  (removes 21)
    //        BOTH:                            33 -> 1   (removes 32)
    //      The map did the larger share. Neither number stands on its own.
    // ⛔⛔⛔ THIS RULE ONLY APPLIES TO A MAP BUILT ON THE SEAM MODEL, AND FOR MONTHS IT DID NOT ASK.
    //   Mark showed me this verdict FOUR TIMES. I chased the map three times and the answer was never
    //   in the map — IT WAS IN THE RULE'S PREMISE: "a whole TILE spent on a wall where THE SEAM MODEL
    //   puts a zero-thickness divider" ASSUMES THE MAP IS BUILT ON THE SEAM MODEL. Two of this tree's
    //   four generators are not, and never were.
    //   MEASURED — how each generator separates two rooms, by SEAM (adjacent walkable tiles carrying
    //   different roomIds) or by a WALL TILE between them:
    //       chain      SEAM   0   WALL-TILE  23   →  0% seam   → `band` was reporting 16
    //       emergency  SEAM   0   WALL-TILE  42   →  0% seam   → `band` was reporting 34
    //       test       SEAM  45   WALL-TILE   0   → 100% seam  → `band` reports 0
    //       section0   SEAM   6   WALL-TILE   0   → 100% seam  → `band` reports 0
    //   **A PERFECT CORRELATION. `band` was not measuring a defect, it was measuring an ARCHITECTURE**
    //   — and condemning DungeonChain for being DungeonChain. Every one of those "violations" is a
    //   WALL. It is how the 2026-08-15 public cut was built, the cut Mark ordered preserved
    //   tile-for-tile, and it is why every attempted conversion broke a door: they are load-bearing.
    //   ⚠ THE RULE KEEPS ITS TEETH WHERE IT EARNED THEM. On a SEAM-MODEL map a wall tile between two
    //     walkables really is the "STUPID DOUBLE WALL" Mark named on 08-18/08-23 — there a divider
    //     could stand there, so the premise holds and the rule fires. `gate:geometry --selftest`
    //     proves it still goes red on such a map.
    //   ⚠ AND THE RENDER COMPLAINT THAT STARTED ALL THIS IS SEPARATELY FIXED: `BandWallBlocks` draws
    //     each of these as ONE SOLID BLOCK, which is exactly what he asked for on 08-30 ("if we need
    //     to do a squared tile filled — create a block, not two halves"). The picture is right; it was
    //     the SENTENCE that was wrong.
    let _seamSep = 0, _wallSep = 0;
    for (let x = 1; x < W - 1; x++) for (let z = 1; z < H - 1; z++) {
      const c = at(x, z);
      for (let d = 0; d < 2; d++) {
        const dx = d ? 0 : 1, dz = d ? 1 : 0;
        const p = at(x, z), q = at(x + dx, z + dz);
        if (!walk(x, z) || !walk(x + dx, z + dz) || isDoorC(p) || isDoorC(q)) continue;
        const A = (p.roomId === undefined) ? null : p.roomId, B = (q.roomId === undefined) ? null : q.roomId;
        if (A !== null && B !== null && A !== B) _seamSep++;
      }
      if (c && c.type === 'wall') {
        const ew = walk(x - 1, z) && walk(x + 1, z), ns = walk(x, z - 1) && walk(x, z + 1);
        if (ew || ns) {
          const a = ew ? at(x - 1, z) : at(x, z - 1), b = ew ? at(x + 1, z) : at(x, z + 1);
          const A = (a.roomId === undefined) ? null : a.roomId, B = (b.roomId === undefined) ? null : b.roomId;
          if (A !== null && B !== null && A !== B) _wallSep++;
        }
      }
    }
    const _isSeamModel = !(_wallSep > _seamSep);   // a tile-wall map separates rooms with wall TILES [REF#DG-01103]
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
      if (!_isSeamModel) break;                    // not a seam map — the premise does not apply [REF#DG-01104]
      if (!wall(x, z) || !at(x, z) || at(x, z).type !== 'wall') continue;
      if (isDoorC(at(x - 1, z)) || isDoorC(at(x + 1, z)) || isDoorC(at(x, z - 1)) || isDoorC(at(x, z + 1))) continue;
      // ⛔ AND A DESIGNED TILE IS NOT A WASTED TILE. `counterWall`/`lowWall` is the half-height teal [REF#DG-01105]
      //    counter between the entrance hall and the 番所 — furniture that occupies a tile by design
      //    and cannot be a zero-thickness divider. Same premise failure as the doorway above: the
      //    rule asks "could a seam stand here instead?", and here the answer is no.
      if (at(x, z).counterWall || at(x, z).lowWall) continue;
      if ((walk(x - 1, z) && walk(x + 1, z)) || (walk(x, z - 1) && walk(x, z + 1)))
        push('band', 'wall tile (' + x + ',' + z + ') stands BETWEEN two walkable spaces — a whole TILE spent on a wall '
          + 'where the seam model puts a zero-thickness divider. (It no longer DRAWS as two parallel walls: BandWallBlocks '
          + 'collapses each band to one solid block since 08-29. This is the map fact, not a render defect.)', [x, z]);
    }

    // ── 2. DOORWAY LINE ── a doorway must sit IN a wall line: the wall continues past BOTH ENDS of [REF#DG-01106]
    //    the doorway, and BOTH FACES you pass through are open. This is the precondition for hanging a
    //    leaf at all — the engine picks a leaf's orientation with exactly this test ("wall on the ends
    //    ⇒ the door runs that way"), so a doorway that fails it gets an arbitrary rotation or no door.
    //    ⚠ IT IS JUDGED ON THE RUN, NOT THE TILE, AND THE FIRST VERSION OF THIS RULE WAS NOT. A 2-tile
    //      doorway's neighbour along the run is another DOOR tile, not a wall, so a per-tile test
    //      reported Mark's own hand-authored double door as "not in a wall line". Same class of
    //      mistake as treating the counter as a tile when it is a seam: check the object, not a cell
    //      of it. `adopt()` already groups runs this way — the grouping is deliberately identical.
    {
      const doorRun = new Set();
      for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
        if (!isDoorC(at(x, z)) || doorRun.has(x + ',' + z)) continue;
        const tiles = [[x, z]]; doorRun.add(x + ',' + z);
        let ax = 0, az = 0;
        if (isDoorC(at(x + 1, z))) { ax = 1; let i = 1; while (isDoorC(at(x + i, z))) { tiles.push([x + i, z]); doorRun.add((x + i) + ',' + z); i++; } }
        else if (isDoorC(at(x, z + 1))) { az = 1; let i = 1; while (isDoorC(at(x, z + i))) { tiles.push([x, z + i]); doorRun.add(x + ',' + (z + i)); i++; } }
        const label = '(' + tiles[0][0] + ',' + tiles[0][1] + ')' + (tiles.length > 1 ? ' x' + tiles.length : '');
        // A run of one has no axis of its own — try both, and it passes if EITHER reading is a clean [REF#DG-01107]
        // wall line. A longer run's axis is given by its own tiles.
        const axes = (ax || az) ? [[ax, az]] : [[1, 0], [0, 1]];
        let bestMsg = null, ok = false;
        for (let a = 0; a < axes.length && !ok; a++) {
          const dx = axes[a][0], dz = axes[a][1];
          const h0 = tiles[0], h1 = tiles[tiles.length - 1];
          // ⛔⛔ A SEAM CONTINUES A WALL LINE. THIS RULE ASSUMED WALL **TILES**, THE WAY `band` DID. [REF#DG-01108]
          //   On a seam-model map two rooms meet directly — the wall between them is a ZERO-THICKNESS
          //   DIVIDER, drawn because the two walkable tiles carry different roomIds. A doorway there
          //   is a tile that BREAKS that divider, and there is no wall tile beyond its ends to
          //   "continue past". Demanding one condemns every door in the architecture.
          //   MEASURED on Mark's hand-drawn floor (2026-08-30): of 12 `doorway-line` violations,
          //   the overwhelming majority are exactly this — e.g. (54,61) reads `2 2 DD 1 1`: a door
          //   joining 通路 to the CABARET with open floor either side and no wall anywhere near it.
          //   Same lesson as `band`, same day: A RULE INHERITS THE ASSUMPTIONS OF THE MAP IT WAS
          //   WRITTEN AGAINST. This one was written on DungeonChain, which is all tile walls.
          //   SO AN END IS SATISFIED BY EITHER: a WALL tile (tile-wall map), or the SEAM CONTINUING
          //   (the two tiles across the run at that position carry different roomIds — a divider
          //   stands there). Both are "the wall goes on past the door".
          const _seamAt = (ex, ez) => {
            const wa = walk(ex - dz, ez - dx), wb = walk(ex + dz, ez + dx);
            // ⚠ THE PERIMETER IS ALSO A CONTINUING WALL. The first seam clause demanded floor|floor [REF#DG-01109]
            //   with differing ids past both ends — true for a door in a room<->room divider, FALSE
            //   for a door in a room's own edge row where ROCK stands beyond the seam (the cabaret
            //   SOUTH doubles of the SC restore: cab floor | rock at both flanks). floor|rock IS the
            //   wall going on — it is the room's perimeter. A door in OPEN floor (same id both
            //   sides) still fails, which is the violation this rule exists for; the gate selftest
            //   pins both directions.
            if (wa !== wb) return true;                    // one side walkable, one side solid = perimeter continues [REF#DG-01110]
            if (!wa && !wb) return false;                  // solid both sides: leave it to wall(ex,ez) [REF#DG-01111]
            const pa = at(ex - dz, ez - dx), pb = at(ex + dz, ez + dx);
            const A = (pa.roomId === undefined) ? null : pa.roomId, B = (pb.roomId === undefined) ? null : pb.roomId;
            return A !== null && B !== null && A !== B;
          };
          const _endOk = (ex, ez) => wall(ex, ez) || _seamAt(ex, ez);
          const endsWalled = _endOk(h0[0] - dx, h0[1] - dz) && _endOk(h1[0] + dx, h1[1] + dz);
          let facesOpen = true, rockFace = null;
          for (let t = 0; t < tiles.length; t++) {
            const tx = tiles[t][0], tz = tiles[t][1];
            const fA = walk(tx - dz, tz - dx), fB = walk(tx + dz, tz + dx);   // the two faces = perpendicular to the run [REF#DG-01112]
            if (!fA || !fB) { facesOpen = false; if (!rockFace) rockFace = (!fA ? 'one' : 'the other') + ' face at (' + tx + ',' + tz + ')'; }
          }
          if (endsWalled && facesOpen) { ok = true; break; }
          if (!bestMsg) bestMsg = !endsWalled
            ? 'doorway ' + label + ' is not in a wall line — the wall does not continue past both ends, so a leaf here has no jamb and no orientation'
            : 'doorway ' + label + ' is walled at both ends but ' + rockFace + ' is rock — it opens onto nothing';
        }
        if (!ok) push('doorway-line', bestMsg, tiles[0]);
      }
    }

    // ── 3. DOORWAY JOINS TWO SPACES ── SEAL THE RUN AND COUNT COMPONENTS. A doorway earns its name [REF#DG-01113]
    //    if closing it SEPARATES the map; if you can still walk from one face to the other the door
    //    is decoration in a stub wall.
    //    ⚠ THIS RULE USED TO READ `d.connects` — A LIST OF ROOM_IDs — WHILE ITS OWN COMMENT CLAIMED
    //      IT CAUGHT "a doorway whose two sides turn out to be the SAME room". That is an IDENTITY
    //      test wearing a STRUCTURE test's name, and on DungeonChain it was wrong SIX TIMES OUT OF
    //      SIX. MEASURED 2026-08-30 (three seeds, then twelve): every tile it flagged has FLOOR on
    //      both faces and a wall line on both flanks, and sealing ANY of them DISCONNECTS the floor.
    //      They are the most load-bearing doors on the map and the rule called them decoration.
    //      The cause is documented one file away (Engine9 ~:5608): DungeonChain gives a room and its
    //      corridor THE SAME roomId — "roomId 1 owned 60 tiles spanning x61..71 z63..71 because a
    //      ROOM and a CORRIDOR shared one id" — so `connects` reads one id for a door that plainly
    //      joins two spaces. A roomId collision is a naming defect; it is not a geometry defect, and
    //      this is the geometry law.
    //      Cost of the mistake: these six were the whole evidence for "enforce fails by construction"
    //      (SEAT_PIPELINE 2026-08-30) — six of the eleven non-band blockers were never real.
    //      The lesson is already written down and I still made it: MAP_HEALTH_CONTRACT §2.1 "READ THE
    //      TILES, NOT THE RULE'S NAME".
    //    Provable both ways: `node scripts/gate-creator-geometry.js --selftest` builds a map with a
    //    load-bearing door and one with a walk-around door and asserts this reports exactly one.
    for (const d of _doors.values()) {
      const tiles = Array.isArray(d.tiles) ? d.tiles : [];
      if (!tiles.length) continue;
      const sealed = new Set(tiles.map(t => t[0] + ',' + t[1]));
      // every walkable tile touching the run — these are the spaces the doorway claims to join [REF#DG-01114]
      const seeds = [], seedKey = new Set();
      for (const t of tiles) for (const dxz of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = t[0] + dxz[0], nz = t[1] + dxz[1], k = nx + ',' + nz;
        if (sealed.has(k) || seedKey.has(k) || !walk(nx, nz)) continue;
        seedKey.add(k); seeds.push([nx, nz]);
      }
      // ⛔⛔ THIS FLOOD IS SEAM-AWARE (`_edgeOpen`), AND IT WAS THE LAST ONE THAT WASN'T. 2026-08-30's [REF#DG-01115]
      //    45cb rewire took `unreachable`/`pocket`/`_repairReach` onto `_edgeOpen` AND LEFT THIS RULE
      //    BEHIND — so the one check that asks "is this door load-bearing?" was still answering about
      //    a map nobody can walk. It walked THROUGH divider panes, found a way around, and called the
      //    door decoration. Reported by origamiunderworld-80 off Mark's 08-31 section-0 map and
      //    re-derived here on all four generators: on Section0 ALL FIVE fires were false, DOOR_006 at
      //    (68,56) among them — the guard room's ONLY door, whose sealing seals the room.
      //    ⚠ THE FALSIFICATION THAT MATTERS IS THE ONE THAT DIDN'T MOVE: DungeonChain 4 -> 4 and
      //      DungeonEmergency 3 -> 3, unchanged. Those are tile-wall generators with no seams to
      //      cross, so a fix must not touch them, and a GUTTING would have zeroed them too. Only the
      //      seam-model maps moved (Section0 5 -> 0, DungeonTest 7 -> 5).
      //    ⚠ AND WHY --selftest STAYED GREEN THROUGH THE WHOLE BUG: its two maps put THE SAME roomId
      //      on both sides ("blind to roomId", by its own printed line), which makes `_edgeOpen`
      //      identical to a plain flood. A fixed point that cannot express the defect is not
      //      evidence. The seam pair added alongside it goes red on the old code — see
      //      gate-creator-geometry.js --selftest.
      // flood each unclaimed seed with the run sealed; 2+ components ⇒ the door is the only way across
      const vis = new Set(); let comps = 0;
      for (const s of seeds) {
        if (vis.has(s[0] + ',' + s[1])) continue;
        comps++;
        const st = [s]; vis.add(s[0] + ',' + s[1]);
        while (st.length) {
          const c = st.pop();
          for (const dxz of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = c[0] + dxz[0], nz = c[1] + dxz[1], k = nx + ',' + nz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
            if (vis.has(k) || sealed.has(k) || !walk(nx, nz)) continue;
            if (!_edgeOpen(map, c[0], c[1], nx, nz)) continue;   // the roomId seam is a WALL — see above [REF#DG-01116]
            vis.add(k); st.push([nx, nz]);
          }
        }
      }
      // ⚠ WARN, NOT FAIL, AND THE DEMOTION IS THE SECOND HALF OF THE SAME CORRECTION. Once the test is [REF#DG-01117]
      //    structural, what it actually measures is REDUNDANCY: "you can walk around this door". On
      //    DungeonChain all four survivors are proper doorways in proper wall lines that happen to sit
      //    on a LOOP — (61,70) and (66,70) are bypassed through (63,69). A loop is a dungeon-design
      //    property, not a defect; a floor whose every door is load-bearing is a tree, which plays
      //    worse. The genuine defects this used to be aimed at — a door tile in open floor, a face
      //    that is rock — are `doorway-line`'s, and it catches all seven of DungeonTest's on its own,
      //    so demoting this loses no coverage. Verified: the overlap on chain is (66,65), and the
      //    three doorway-joins-only hits are all walled at both ends.
      if (comps < 2)
        push('doorway-joins', d.doorId + ' at (' + tiles[0][0] + ',' + tiles[0][1] + ') is BYPASSABLE — sealing it '
          + 'still leaves its ' + comps + ' side(s) connected, so it is a loop, not a cut. Fine by itself; '
          + 'suspicious if the doorway is also not in a wall line',
          d.tiles && d.tiles[0], 'warn');
    }

    // ── 4. A ROOM IS A SHAPE, NOT A SPILL ── does the room's own floor form a FILLED rectangle? [REF#DG-01118]
    //    ⚠ THE FIRST VERSION COMPARED THE RECORD'S w/h AGAINST THE WALKABLE COUNT AND WAS WRONG.
    //      Those bounds are WALL-INCLUSIVE in this tree: DungeonChain's ROOM_001 declares 4x10 and has
    //      exactly 16 walkable tiles = the 2x8 interior. The rule "failed" 23 of 24 rooms by measuring
    //      one convention against another — a true count attached to the wrong rect, which is this
    //      repo's signature bug and is why it is written out here rather than quietly fixed.
    //      Measured from the room's OWN tiles instead, so no convention is assumed at all.
    //    A ragged room is a WARN: the RoomShapes catalogue has legal L and T footprints, and a room
    //    carrying a `shapeKey` has declared itself non-rectangular on purpose and is exempt.
    {
      // ⚠ FLOOR ONLY — NOT `walk()`. THE FOURTH INSTANCE OF THE SAME PREDICATE BUG, and it was found [REF#DG-01119]
      //    by a prediction failing rather than by review. §6d said `room-ragged` should COLLAPSE once
      //    corridors got their own ids, because a room's "own tiles" would stop being a room PLUS a
      //    corridor. It went 25 -> 24. The split was fine; THE INSTRUMENT WAS BROKEN — `walk()` counts
      //    a DOORWAY as a room tile, and a rectangle plus a doorway is never a filled rectangle, so
      //    every room with a door reads ragged no matter what the corridors do.
      //    Same root as `doorway-joins` (read roomIds), `room-not-carved` (wall-inclusive bounds vs a
      //    walkable count) and `room-shape` (this identical line): A HELPER THAT IS RIGHT FOR
      //    REACHABILITY REUSED FOR A QUESTION ABOUT SHAPE. See MAP_HEALTH_CONTRACT §1b.
      //    ⚠ THE METHOD NOTE WORTH MORE THAN THE FIX: a falsifier stated in advance is what surfaced
      //      this. Had the prediction not been written down before the code, "ragged stayed at 24"
      //      would have read as noise instead of as a broken measurement.
      const tilesOf = new Map();
      for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
        const c = at(x, z);
        if (!c || c.type !== 'floor' || c.roomId === undefined || c.roomId === null) continue;
        let a = tilesOf.get(c.roomId); if (!a) { a = []; tilesOf.set(c.roomId, a); }
        a.push([x, z]);
      }
      for (const r of _rooms.values()) {
        if (r.shapeKey) continue;                       // declared non-rectangular on purpose [REF#DG-01120]
        const ts = tilesOf.get(r.genId);
        if (!ts || ts.length < 2) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < ts.length; i++) {
          if (ts[i][0] < x0) x0 = ts[i][0]; if (ts[i][0] > x1) x1 = ts[i][0];
          if (ts[i][1] < z0) z0 = ts[i][1]; if (ts[i][1] > z1) z1 = ts[i][1];
        }
        const bbox = (x1 - x0 + 1) * (z1 - z0 + 1);
        // ⛔⛔ COUNT THE TILES THE ROOM **OWNS**, NOT ONLY THE ONES TYPED 'floor'. THIS IS THE FIFTH [REF#DG-01121]
        //   INSTANCE OF THE SAME PREDICATE BUG AND — READ THE NOTE ABOVE — IT WAS CREATED BY THE FIX
        //   FOR THE FOURTH. That note says the rule moved from `walk()` to FLOOR-ONLY because
        //   "`walk()` counts a DOORWAY as a room tile, and a rectangle plus a doorway is never a
        //   filled rectangle". True. But floor-only makes it a rectangle **MINUS** a doorway, which is
        //   never a filled rectangle either — so the rule went on firing on every room with a door,
        //   for the mirror-image reason, and the comment above it described the cure as if it were
        //   complete. A doorway tile carved into a room's own wall line IS part of that room's
        //   footprint; it carries the room's `roomId` (verified on all four generators).
        //   MEASURED at HEAD, and the signature is what makes it certain: every room this silences
        //   reaches **exactly** bbox, not merely closer — section0 cabaret 33 floor -> 36/36 owned,
        //   楽屋 15 -> 16/16, 支配人室 26 -> 28/28 (1 door + 1 stairs), 番所 19 -> 20/20. A room that
        //   was truly ragged cannot land on its bbox exactly by adding its own doors back.
        //     section0 5 -> 1 · test 5 -> 1 · chain 8 -> 7 · emergency 1 -> 1 (unchanged).
        //   ⚠ THE SURVIVORS ARE THE PROOF IT IS NOT GUTTED: section0's ROOM_006 still fires and
        //     SHOULD — it is the 2-tile RING, 15x15 bbox holding 85 tiles of OTHER rooms and 30 of
        //     rock; a ring is hollow by design. Whether a ring should be exempt via `shapeKey` /
        //     `roomType: 'hallway'` is a SEPARATE question and deliberately not answered here.
        //   The bbox itself stays FLOOR-derived on purpose: a door hanging off the end of a room must
        //   not be allowed to inflate the rectangle it is then measured against.
        let owned = 0;
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const c = at(x, z);
          if (!c || c.roomId !== r.genId) continue;
          if (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door'
              || (typeof c.type === 'string' && c.type.indexOf('stairs') === 0)
              || (c.type === 'wall' && (c.counterWall === true || c.lowWall === true))) owned++;   // a DESIGNED tile is part of its room's footprint (5th instance of the lesson) [REF#DG-01122]
        }
        if (owned !== bbox)
          push('room-ragged', r.roomId + ' fills ' + owned + ' of the ' + bbox + ' tiles in its own bounding box ('
            + (x1 - x0 + 1) + 'x' + (z1 - z0 + 1) + ' at ' + x0 + ',' + z0 + ') — the floor is not the shape the room claims to be',
            [x0, z0], 'warn');
      }
    }

    // ── 4b. THE FLOOR CARRIES ITS DEPTH'S WORTH OF ROOMS ── only checked when the caller says which [REF#DG-01123]
    //    level this is; a validator that guesses the level would grade every map against level 1.
    if (typeof o.level === 'number') {
      const want = roomTarget(o.level);
      const have = _rooms.size;
      if (have < want)
        push('room-count', 'level ' + o.level + ' has ' + have + ' room(s) but its depth target is ' + want
          + ' (rule: room quantity +1 per level below 2)', null);
    }

    // ── 4c. THE FOOTPRINT IS IN THE CATALOGUE ── Mark 2026-08-30: "why you back to violating room [REF#DG-01124]
    //    designs again, none of these rooms are in our creator shapes." RoomShapes.json says it in its
    //    own header: "the ONLY legal room footprints for dungeon generation ... so these rooms stop
    //    looking like crap" (Mark 2026-08-22). The catalogue has been in the tree since 08-22 and
    //    NOTHING has ever validated a generated room against it — `room-ragged` only asks whether a
    //    room is rectangular, never whether that rectangle is one we allow.
    //    ⚠ MEASURED FROM THE ROOM'S OWN TILES, NOT ITS RECORD. The catalogue's `w x h are INTERIOR
    //      tiles. Walls are NOT part of the shape` — and this tree's room records are WALL-INCLUSIVE
    //      (a 4x10 record has a 2x8 interior). Comparing the record to the catalogue would compare two
    //      different conventions and condemn every room, which is exactly the mistake `room-not-carved`
    //      made before it was rewritten. So the footprint is the bbox of the room's own walkable tiles.
    //    ⚠ ORIENTATION IS NOT FOLDED. `shapeOf` lists R3x5 and R5x3 separately and `shapeOf(10,4)` is
    //      null while `shapeOf(4,10)` is GUARD_4x10 — the catalogue treats a rotation as a different
    //      shape, so this asks it both ways round and accepts either rather than inventing a rule.
    //    Hallways are judged against HALLS (w x len), not ALL.
    {
      const RS = (typeof window !== 'undefined' && window.RoomShapes) || (typeof global !== 'undefined' && global.RoomShapes) || null;
      if (RS && typeof RS.shapeOf === 'function' && o.shapes !== false) {
        // ⚠ FLOOR ONLY — NOT `walk()`. A DOORWAY IS PART OF THE WALL LINE, NOT PART OF THE ROOM. [REF#DG-01125]
        //    `walk()` deliberately counts a doorway as passable (a door read as "wall" is how a room
        //    reads sealed to one checker and open to the next), and the first cut of this rule reused
        //    it. A doorway sits ON the room's boundary row, so counting it as room floor stretches the
        //    bounding box by exactly one row or column — and a room one bigger than the catalogue
        //    allows is off-catalogue by construction.
        //    MEASURED 2026-08-30, and it was ALL THREE of DungeonChain floor 1's room-shape fails:
        //      ROOM_005 4x9 -> 4x8 (R4x8) · ROOM_010 9x5 -> 8x5 (R8x5) · ROOM_019 3x13 -> 3x12 (HALL)
        //    Every one legal the moment the doorway stops being counted. The rooms were never wrong.
        //    ⚠ THIS IS THE THIRD RULE IN TWO DAYS WHOSE PREDICATE MEASURED THE WRONG PROPERTY
        //      (`doorway-joins` read roomIds; `room-not-carved` compared wall-inclusive bounds to a
        //      walkable count). The pattern is the same every time: a helper that is right for
        //      REACHABILITY reused for a question about SHAPE. See MAP_HEALTH_CONTRACT §2.1.
        const tilesOf = new Map();
        for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
          const c = at(x, z);
          if (!c || c.type !== 'floor' || c.roomId === undefined || c.roomId === null) continue;
          let a = tilesOf.get(c.roomId); if (!a) { a = []; tilesOf.set(c.roomId, a); }
          a.push([x, z]);
        }
        const _hallOK = (a, b) => {
          const HS = RS.HALLS || [];
          for (let i = 0; i < HS.length; i++) {
            if ((HS[i].w === a && HS[i].len === b) || (HS[i].w === b && HS[i].len === a)) return HS[i].key;
          }
          return null;
        };
        for (const r of _rooms.values()) {
          if (r.kind === 'corridor') continue;   // a corridor is connective tissue, not a catalogued footprint [REF#DG-01126]
          let ts = tilesOf.get(r.genId);
          if (!ts || !ts.length) continue;
          // ⛔ A RING IS NOT A RECTANGLE, AND THE CATALOGUE ONLY DESCRIBES RECTANGLES. [REF#DG-01127]
          //   `HALLS` is `{w, len}` — a LINEAR corridor — and RoomShapes' own header says hallways
          //   "never carry a roomId", i.e. they were never meant to be catalogue-checked as rooms.
          //   Mark's 外回廊 is 22x21 and his 内回廊 14x15; the catalogue's largest entry is 8x8, so
          //   both were reported as "not in the catalogue" — which is true and meaningless. A ring's
          //   BOUNDING BOX is not its shape: its floor is a perimeter, not a filled rectangle.
          //   So a HALLWAY whose floor does NOT fill its bbox is a ring / L / network and is exempt;
          //   a hallway that IS a filled rectangle is a linear hall and is still judged against HALLS.
          if (r.kind === 'hallway') {
            let hx0 = Infinity, hx1 = -Infinity, hz0 = Infinity, hz1 = -Infinity;
            for (let i = 0; i < ts.length; i++) {
              if (ts[i][0] < hx0) hx0 = ts[i][0]; if (ts[i][0] > hx1) hx1 = ts[i][0];
              if (ts[i][1] < hz0) hz0 = ts[i][1]; if (ts[i][1] > hz1) hz1 = ts[i][1];
            }
            if (ts.length !== (hx1 - hx0 + 1) * (hz1 - hz0 + 1)) continue;   // not a filled rectangle [REF#DG-01128]
          }
          // ⚠ BOUND TO THE ROOM'S OWN RECT FIRST. Raw roomId tiles are NOT the room: a corridor [REF#DG-01129]
          //   inherits the roomId of the first adjacent door's room (the trap already documented at
          //   the 番所's `_woodEdge`), so the first cut of this rule read footprints of 24x28 and
          //   23x8 — those are the room PLUS everything its id leaked down. Intersecting with the
          //   declared rect keeps the room and drops the spill; a room with no rect is skipped rather
          //   than guessed at.
          if (!(typeof r.x === 'number' && typeof r.z === 'number' && r.w > 0 && r.h > 0)) continue;
          ts = ts.filter(t => t[0] >= r.x && t[0] < r.x + r.w && t[1] >= r.z && t[1] < r.z + r.h);
          if (!ts.length) continue;
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < ts.length; i++) {
            if (ts[i][0] < x0) x0 = ts[i][0]; if (ts[i][0] > x1) x1 = ts[i][0];
            if (ts[i][1] < z0) z0 = ts[i][1]; if (ts[i][1] > z1) z1 = ts[i][1];
          }
          const fw = x1 - x0 + 1, fh = z1 - z0 + 1;
          // ⛔ SUPERSEDED 2026-09-08 by Mark, live in chat: "tell creator to fuck off - its a special [REF#DG-01741]
          //    room and has no jurisdiction on that size." A room declared `special` is AUTHORED —
          //    its footprint was chosen deliberately, so measuring it against a catalogue of
          //    standard footprints answers a question nobody asked. This narrows the 2026-08-22
          //    "those are the only legal footprints" rule; it does not retire it, and every ordinary
          //    room is still graded exactly as before.
          //    ⚠ THE ALTERNATIVE WAS WORSE, WHICH IS WHY THIS IS THE FIX. Registering each special's
          //      size in RoomShapes.json (BATHHOUSE_15x15 was added that way earlier today and is
          //      removed again with this) turns the catalogue into a list of one-offs, and every new
          //      special silently fails the gate until someone remembers to enrol it.
          if (r.special === true) continue;
          const isHall = (r.kind === 'hallway' || r.genKind === 'hallway');
          const hit = isHall ? (_hallOK(fw, fh) || (RS.shapeOf(fw, fh) || RS.shapeOf(fh, fw) || {}).key)
                             : ((RS.shapeOf(fw, fh) || RS.shapeOf(fh, fw) || {}).key || _hallOK(fw, fh));
          if (!hit)
            push('room-shape', r.roomId + ' footprint ' + fw + 'x' + fh + ' at (' + x0 + ',' + z0 + ') is NOT in the RoomShapes catalogue'
              + (isHall ? ' (checked HALLS then ALL)' : ' (checked ALL then HALLS)') + ' — Mark 2026-08-22: those are the only legal footprints',
              [x0, z0]);
        }
      }
    }

    // ── 4d. WHERE A DOOR IS ALLOWED TO SIT ── Mark 2026-08-30: "the rules for room shapes, door [REF#DG-01130]
    //    locations, hallway sizes and shapes" must govern generation.
    //    ⚠ THIS RULE ALREADY EXISTED — IN ONE GENERATOR. `DungeonChain.doorRuleViolations()` (~:366)
    //      has enforced it for months and NOTHING ELSE HAS. DungeonEmergency, DungeonTest and
    //      Section0 have never been judged by it, and DungeonChain's own copy `continue`s on room
    //      types 'cabaret' and 'landing'. Same shape as every other finding this week: the rule is
    //      real, correct, and applied in exactly one place. Lifted here verbatim in predicate.
    //    THE PREDICATE, ported from `_wallDoorsOk` (~:358) rather than reinvented:
    //      0 doors on a wall  -> fine
    //      1 door             -> must sit exactly ON the wall's midpoint
    //      2 doors            -> must be ADJACENT and straddle the midpoint (a double door is ONE doorway)
    //      3+                 -> a violation, always
    //    Its author's note is worth keeping: making the rule understand double doors beats exempting
    //    the room that has one, because an exemption "would also excuse a genuine mistake on that room
    //    forever, the way type === 'cabaret' does".
    //    ⚠ CORRIDORS ARE EXEMPT — a connector has no wall of its own to centre a door on (§4.1 of
    //      ENTITY_ADDRESS_HIERARCHY: the hall spans three sections and is not a room).
    {
      const _wallDoorsOk = (coords, mid) => {
        if (coords.length === 0) return true;
        if (coords.length === 1) return coords[0] === mid;
        if (coords.length !== 2) return false;
        const a = Math.min(coords[0], coords[1]), b = Math.max(coords[0], coords[1]);
        if (b - a !== 1) return false;
        return (a === mid || b === mid);
      };
      // ⛔⛔ FIND THE WALL LINE BY EVIDENCE, PER SIDE — AND SAY SO WHEN THERE ISN'T ONE. [REF#DG-01131]
      //   The predicate above is verbatim from DungeonChain; THE INPUT WAS THE BUG.
      //   `origamiunderworld-80`, 2026-08-30: DungeonChain's room rects are WALL-INCLUSIVE, so its
      //   declared edge IS the wall. THREE OF FOUR GENERATORS HAND INTERIOR RECTS, so the declared
      //   edge is a ring of pure FLOOR — and `coords.length === 0 → return true` then reported
      //   "lawful" four times per room. **On DungeonEmergency this judged 0 of 4 rooms and returned
      //   0 violations while 11 door tiles sat one tile outside the ring it was reading.**
      //   ⚠ A GREEN THAT MEANS "NOT LOOKED AT" IS WORSE THAN A RED, and that generator is one flag
      //     from being the floor.
      //   ⚠ MY OWN PROPOSED FIX WAS TESTED AND REJECTED BY MEASUREMENT. I suggested the rule
      //     normalise interior→wall-inclusive everywhere. Measured, that fixes emergency (0→4 rooms
      //     judged) and DEGRADES test (4→1, on a ring only 19% wall). Normalising blind just swaps
      //     which generator is blind. Their design is what is implemented here instead.
      //   THE DESIGN: for each of a room's four sides take BOTH candidate lines — the declared edge,
      //   and the one derived from the room's own floor footprint — score each by the share that is
      //   WALL OR DOORWAY, judge on the better, and if neither is at least 60% solid report the side
      //   as UNJUDGED rather than passing it.
      //   MEASURED (sides judged / violations / unjudged): chain 95/0/1 · test 3/0/21 ·
      //   section0 5/0/3 · emergency 16/2/0 — and emergency's two are real off-centre doors
      //   (ROOM_002.W door 67 mid 68, ROOM_003.E door 67 mid 68) on lines that are 100% solid.
      //   ⚠ CHAIN'S OLD SINGLE VIOLATION CORRECTLY DISAPPEARS, and it was chased rather than
      //     welcomed: ROOM_002 is chain's one interior-rect room, its declared west edge is entirely
      //     FLOOR, and the rule was scoring that floor and calling a door standing in it
      //     "off the midpoint". The door at (61,65) is not off-centre — IT IS NOT IN A WALL AT ALL,
      //     which is `doorway-line`'s finding on that exact tile, and `repair()` moves it to (60,65).
      //     A true complaint filed under the wrong rule about the wrong object.
      //   THE LESSON, twin of the `_repairCounts` one: `coords.length === 0 → return true` is only
      //   honest if you know you were looking at a wall. Severity answers "may this ship"; an empty
      //   list answers "I found nothing"; NEITHER answers "did I look".
      const _solidShare = (fixed, a0, a1, horiz) => {
        let solid = 0, n = 0;
        for (let t = a0; t <= a1; t++) {
          const c = horiz ? at(t, fixed) : at(fixed, t);
          n++;
          if (c && (c.type === 'wall' || isDoorC(c))) solid++;
        }
        return n ? solid / n : 0;
      };
      const _doorsOn = (fixed, a0, a1, horiz) => {
        const out = [];
        for (let t = a0; t <= a1; t++) if (isDoorC(horiz ? at(t, fixed) : at(fixed, t))) out.push(t);
        return out;
      };
      const SOLID_MIN = 0.6;
      for (const r of _rooms.values()) {
        if (r.kind === 'corridor') continue;
        if (!(typeof r.x === 'number' && typeof r.z === 'number' && r.w > 0 && r.h > 0)) continue;
        // the room's own floor footprint, clipped to its rect (same clip room-shape uses for the leak) [REF#DG-01132]
        let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity, any = false;
        for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.h; z++) {
          const c = at(x, z);
          if (!c || c.type !== 'floor' || c.roomId !== r.genId) continue;
          any = true;
          if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
          if (z < fz0) fz0 = z; if (z > fz1) fz1 = z;
        }
        const bad = [], unjudged = [];
        const SIDES = [
          { k: 'N', horiz: true,  decl: r.z,             foot: any ? fz0 - 1 : null, da0: r.x, da1: r.x + r.w - 1, fa0: fx0, fa1: fx1 },
          { k: 'S', horiz: true,  decl: r.z + r.h - 1,   foot: any ? fz1 + 1 : null, da0: r.x, da1: r.x + r.w - 1, fa0: fx0, fa1: fx1 },
          { k: 'W', horiz: false, decl: r.x,             foot: any ? fx0 - 1 : null, da0: r.z, da1: r.z + r.h - 1, fa0: fz0, fa1: fz1 },
          { k: 'E', horiz: false, decl: r.x + r.w - 1,   foot: any ? fx1 + 1 : null, da0: r.z, da1: r.z + r.h - 1, fa0: fz0, fa1: fz1 },
        ];
        for (const sd of SIDES) {
          const cands = [{ c: sd.decl, a0: sd.da0, a1: sd.da1 }];
          if (sd.foot !== null && sd.foot !== sd.decl) cands.push({ c: sd.foot, a0: sd.fa0, a1: sd.fa1 });
          let best = null;
          for (const cd of cands) {
            const share = _solidShare(cd.c, cd.a0, cd.a1, sd.horiz);
            if (!best || share > best.share) best = { c: cd.c, a0: cd.a0, a1: cd.a1, share: share };
          }
          // ⛔⛔ SEAM FALLBACK — THE MIDPOINT LAW WAS UNENFORCED ON THE ARCHITECTURE MARK MADE DEFAULT. [REF#DG-01133]
          //   `_solidShare` scores a candidate line by counting tiles that are `type === 'wall'` or a
          //   door. A SEAM-MODEL map has NO wall tiles between rooms — the divider is the roomId
          //   change, a pane WITH A COLLIDER (Engine9:11084) — so a room<->room side scores only its
          //   own doors: cabaret W 1/6 = 17%, E 2/6 = 33%, everything under SOLID_MIN. The rule was
          //   not broken; it was honestly reporting that it could not see. MEASURED on the shipped
          //   floor: 5 sides judged, 6 UNJUDGED rows, and therefore 0 violations that mean anything.
          //   So when no wall LINE exists, score the room's OWN edge by EDGE CLOSURE instead: a cell
          //   is closed if you cannot walk out of it there. Same predicate the OPENRUN classifier
          //   uses. Doors are the cells that are doorways on either side; the midpoint law is
          //   `_wallDoorsOk`, verbatim, unchanged.
          //   ⚠ IT IS A FALLBACK, ONLY REACHED WHEN THE TILE READING ALREADY GAVE UP. That is
          //     deliberate blast-radius control: a tile-wall generator's sides all pass the tile test,
          //     so chain / emergency / test cannot regress through this branch by construction.
          //   MEASURED: section0 5 judged/6 unjudged -> 16 judged/0 unjudged, and the falsifier bites
          //     — moving the 番所 door back to x67 (off the entrance's midpoint x68, the very defect
          //     origamiunderworld-80 hand-fixed during the build) reports
          //     `ROOM_007 side S doors[67] mid 68`. At x68 it is silent.
          //   ⚠ MARK 2026-08-31 RULED **HALLWAYS ARE JUDGED** (asked, not inferred). So the skip list
          //     stays `{corridor}` and is NOT widened — his 1-tile spine therefore reports 2 rows
          //     permanently, because 楽屋 and 支配人室 are served from the SAME side at z54 and z59 and
          //     no arrangement puts two doors 5 apart on one midpoint. He accepted that cost knowingly;
          //     `door-placement` is severity `warn`, so the floor still ships and still passes accept().
          if (!best || best.share < SOLID_MIN) {
            const _isWalkC = (c) => !!c && c.type !== 'wall' && c.type !== 'rock' && c.type !== 'void';
            const _ridC = (c) => (!c || c.roomId === undefined || c.roomId === null) ? -2 : c.roomId;
            const OUT = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[sd.k];
            const line = sd.foot !== null ? (sd.k === 'N' ? fz0 : sd.k === 'S' ? fz1 : sd.k === 'W' ? fx0 : fx1) : null;
            const sa0 = (sd.k === 'N' || sd.k === 'S') ? fx0 : fz0;
            const sa1 = (sd.k === 'N' || sd.k === 'S') ? fx1 : fz1;
            let closed = 0, n = 0; const scoords = [];
            if (line !== null && any) for (let t = sa0; t <= sa1; t++) {
              const cx = (sd.k === 'N' || sd.k === 'S') ? t : line;
              const cz = (sd.k === 'N' || sd.k === 'S') ? line : t;
              const me = at(cx, cz), nb = at(cx + OUT[0], cz + OUT[1]);
              n++;
              const dr = isDoorC(me) || isDoorC(nb);
              if (dr) { closed++; scoords.push(t); continue; }
              if (!_isWalkC(nb)) { closed++; continue; }                                  // rock/wall/void [REF#DG-01134]
              if (_isWalkC(me) && _ridC(me) !== _ridC(nb)) { closed++; continue; }        // divider pane [REF#DG-01135]
            }
            const sshare = n ? closed / n : 0;
            if (sshare >= SOLID_MIN) {
              const smid = sa0 + Math.floor((sa1 - sa0 + 1) / 2);
              if (!_wallDoorsOk(scoords, smid))
                bad.push(sd.k + '[' + scoords.join(',') + '] mid ' + smid + ' (seam ' + line + ')');
              continue;
            }
            unjudged.push(sd.k + '@' + (best ? best.c : '?')
              + ' ' + Math.round((best ? best.share : 0) * 100) + '% solid'); continue;
          }
          const coords = _doorsOn(best.c, best.a0, best.a1, sd.horiz);
          const mid = best.a0 + Math.floor((best.a1 - best.a0 + 1) / 2);
          if (!_wallDoorsOk(coords, mid)) bad.push(sd.k + '[' + coords.join(',') + '] mid ' + mid + ' (line ' + best.c + ')');
        }
        if (bad.length)
          push('door-placement', r.roomId + ' has a doorway off its wall midpoint — ' + bad.join(' · ')
            + ' (one door ON the mid, or two ADJACENT straddling it; three is never legal)', [r.x, r.z], 'warn');
        if (unjudged.length)
          push('door-placement', r.roomId + ' — ' + unjudged.length + ' side(s) UNJUDGED, no wall line to centre a door on: '
            + unjudged.join(' · ') + '. This is NOT a pass; nothing was looked at.', [r.x, r.z], 'warn');
      }
    }

    // ── 4e. EVERY PLACED THING HAS AN ADDRESS ── Mark 2026-08-30: "each model needs this hierarchy: [REF#DG-01136]
    //    floor, section id, room id. doors, chests, beds, monsters, loot, traps, will all fall under
    //    this." Design + falsification: knowledge/design/ENTITY_ADDRESS_HIERARCHY_2026-08-30.md.
    //    ⚠ `section` IS A SET, NOT A SCALAR, AND THAT IS THE FALSIFIED PART OF THE DESIGN. MEASURED:
    //      on chain L2/L3/L4 the MAIN HALL (`room0`) spans sections {0,1,2} — it is the spine that
    //      CONNECTS sections, not a child of one — while its record says `segmentId: 0`. A strict
    //      floor->section->room tree cannot express that floor, so this rule reports the SPAN rather
    //      than demanding a single parent. Minting corridor ids does NOT fix it (tested).
    //    ⚠ WHAT IT DOES **NOT** DO: it does not invent addresses. It reports which records cannot be
    //      addressed, so the gap is visible before anything depends on it — the same report-first
    //      posture `_creatorAuthority` uses. `?? 0` defaulting is what turns a missing address into
    //      section 0, the heart, which the heart-clear then deletes: a silently removed monster.
    {
      const segsOf = new Map();
      for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
        const c = at(x, z);
        if (!c || !walk(x, z) || c.roomId === undefined || c.roomId === null) continue;
        if (!segsOf.has(c.roomId)) segsOf.set(c.roomId, new Set());
        segsOf.get(c.roomId).add(c.segmentId === undefined ? null : c.segmentId);
      }
      for (const r of _rooms.values()) {
        const seen = segsOf.get(r.genId);
        if (!seen || !seen.size) continue;
        if (seen.has(null))
          push('address', r.roomId + ' has tiles with NO section id — an unaddressable tile defaults to '
            + 'section 0, which is the heart, which the heart-clear then empties', [r.x, r.z], 'warn');
        else if (seen.size > 1)
          push('address', r.roomId + ' SPANS sections {' + [...seen].sort().join(',') + '} while its record says '
            + (r.segmentId === undefined ? '(none)' : r.segmentId)
            + ' — it is a CONNECTOR, not a room in one section; the record is what every consumer reads',
            (typeof r.x === 'number') ? [r.x, r.z] : null, 'warn');
      }
    }

    // ── 5. A ROOM NOBODY CAN ENTER ── [REF#DG-01137]
    //    ⚠ A CORRIDOR IS NOT A ROOM WITH A MISSING DOOR. Minting corridor records (§6d (a)) turned
    //      `room-no-door` from 0 to 7 on floor 1 — one per corridor — because a corridor is entered
    //      by walking, not through a door of its own. Same exemption class the contract already gives
    //      it for `room-shape` (no rect) and `room-ragged` (shapeKey); this one was missed until the
    //      band conversion measured it. Found by the guard, not by review.
    // ⛔ A HALLWAY IS ENTERED BY WALKING, NOT THROUGH A DOOR OF ITS OWN — same reading as 'corridor'
    //   above. "外回廊 (Outer Ring) has no door" was reported about a RING CORRIDOR that the player
    //   walks straight into from the entrance. The rule is for a ROOM nobody can enter.
    // A room entered through a SECRET SEAM has its entrance — the secret portal room's tile on the seam carries `secretEdges`
    // (see `_edgeOpen`). It has no door on purpose; the rule is for a room nobody can enter. (2026-10-01)
    const _secretEntered = (r) => { try { for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.h; z++) {
      const c = map[x] && map[x][z]; if (c && Array.isArray(c.secretEdges) && c.secretEdges.length) return true; } } catch (_) {} return false; };
    const _openEntered = (r) => {
      for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.h; z++) {
        const c = map[x] && map[x][z]; if (!c || c.roomId !== r.genId) continue;
        for (const [dx, dz, dir, opposite] of [[1,0,'E','W'],[-1,0,'W','E'],[0,1,'S','N'],[0,-1,'N','S']]) {
          const n = map[x + dx] && map[x + dx][z + dz];
          if (!n || n.roomId == null || n.roomId < 0 || n.roomId === c.roomId) continue;
          if ((c.doors?.includes(dir) || n.doors?.includes(opposite)) && _edgeOpen(map, x, z, x + dx, z + dz)) return true;
        }
      }
      return false;
    };
    for (const r of _rooms.values()) if (r.kind !== 'corridor' && r.kind !== 'hallway' && (!r.doorIds || !r.doorIds.length) && !_secretEntered(r) && !_openEntered(r))
      push('room-no-door', r.roomId + ' has no door', (typeof r.x === 'number') ? [r.x, r.z] : null);

    // ── 6. DEAD-END NUB ── a walkable tile with exactly ONE walkable neighbour. This is literally what [REF#DG-01138]
    //    Mark rejected: "three rectangles with two 1-tile nubs". A doorway is exempt — a door tile with
    //    one open side is a door into a room, not a nub.
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
      if (!walk(x, z) || isDoorC(at(x, z))) continue;
      let n = 0;
      if (walk(x - 1, z)) n++; if (walk(x + 1, z)) n++; if (walk(x, z - 1)) n++; if (walk(x, z + 1)) n++;
      if (n <= 1) push('dead-end-nub', 'walkable tile (' + x + ',' + z + ') has ' + n + ' walkable neighbour(s) — a 1-tile closet, not a place', [x, z], 'warn');
    }

    // ── 7 + 8. REGIONS ── flood-fill every walkable island once, then judge them: anything not joined [REF#DG-01139]
    //    to the biggest island is UNREACHABLE, anything tiny is a POCKET.
    //    ⛔⛔ THIS FLOOD CROSSES THE roomId SEAM, WHICH IS A WALL WITH A COLLIDER. Until 2026-08-30 it
    //      walked tile-adjacency only, so `unreachable` and `pocket` were answering a question about a
    //      map NOBODY CAN WALK. MEASURED: `assignCorridorIds` sealed 16 tiles behind a divider it had
    //      just created and **this rule reported 0**, on four seeds. `_edgeOpen` is the shared engine
    //      predicate (Engine9:11084 — a differing roomId makes a divider pane, and a divider pane
    //      carries a collider tested by every movement gate). Found by origamiunderworld-80 (Q3).
    const seenR = new Uint8Array(W * H);
    const regions = [];
    for (let sx = 0; sx < W; sx++) for (let sz = 0; sz < H; sz++) {
      if (!walk(sx, sz) || seenR[sx * H + sz]) continue;
      const stack = [[sx, sz]]; seenR[sx * H + sz] = 1;
      const tiles = [];
      while (stack.length) {
        const cur = stack.pop(); tiles.push(cur);
        const cx = cur[0], cz = cur[1];
        const nb = [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]];
        for (let i = 0; i < nb.length; i++) {
          const nx = nb[i][0], nz = nb[i][1];
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          if (seenR[nx * H + nz] || !walk(nx, nz)) continue;
          if (!_edgeOpen(map, cx, cz, nx, nz)) continue;   // the seam is a WALL — see the note above [REF#DG-01140]
          seenR[nx * H + nz] = 1; stack.push([nx, nz]);
        }
      }
      regions.push(tiles);
    }
    regions.sort(function (a, b) { return b.length - a.length; });
    for (let i = 1; i < regions.length; i++)
      push('unreachable', 'a walkable island of ' + regions[i].length + ' tile(s) at (' + regions[i][0][0] + ',' + regions[i][0][1] + ') is not connected to the main floor', regions[i][0]);
    for (let i = 0; i < regions.length; i++) if (regions[i].length < minPocket)
      push('pocket', 'walkable island of ' + regions[i].length + ' tile(s) at (' + regions[i][0][0] + ',' + regions[i][0][1] + ') is below the ' + minPocket + '-tile floor for a place', regions[i][0], 'warn');

    out.counts = count;
    out.regions = regions.length;
    return out;
  }

  // The one call a generator should make before it commits to a layout. Returns true only when the [REF#DG-01141]
  // IDENTITY law and the SHAPE law are both clean — `fail` severities only, so a 'warn' (a nub, a
  // pocket) is reported but does not by itself reject a map. Tighten with { strict: true }.
  // opts.ignore — a list of rule names to exclude, for a caller that is deliberately testing something
  // else. It exists so a harness can exercise the REROLL MECHANISM while the shape law is still red on
  // every generator; without it the reroll never accepts anything and the replay path is never run,
  // which is a test that cannot fail. Every use must say WHY it is ignoring a rule.
  function accept(map, opts) {
    const o = opts || {};
    const skip = Array.isArray(o.ignore) ? o.ignore : [];
    const ident = validate();
    const geo = validateGeometry(map, o).filter(function (v) {
      if (skip.indexOf(v.rule) >= 0) return false;
      return o.strict ? true : v.severity !== 'warn';
    });
    return { ok: ident.length === 0 && geo.length === 0, identity: ident, geometry: geo, ignored: skip };
  }

  // ══ REPAIR ══ CREATOR DOES NOT ONLY JUDGE THE MAP, IT MENDS WHAT IT CAN MEND SAFELY. [REF#DG-01142]
  //    Mark 2026-08-30, looking at the boot verdict: "fix it all." And his #1 rule the same day:
  //    "make sure to ensure that creator has top control as to the structure of all dungeon maps."
  //    Judging and refusing is not control — a validator that can only say no leaves the only two
  //    options as "ship it broken" or "ship no floor". This is the third option, and it is the one
  //    that lets `enforce` ever be reachable.
  //
  //    WHY A REPAIR PASS AND NOT A GENERATOR EDIT. The defects are in DungeonChain's fixed HEAD —
  //    the map Mark ordered restored TILE-FOR-TILE from the 2026-08-15 public cut (gold 8660ec30).
  //    Editing that source rewrites the thing he asked to be preserved, and it would fix exactly one
  //    generator. A repair at the choke point leaves every generator's source untouched, mends the
  //    EMITTED tiles, works for DungeonChain / DungeonEmergency / DungeonTest / Section0 alike, and
  //    turns off with one flag. The head on disk stays 1:1 with the cut.
  //
  //    ⚠ EVERY REPAIR IS PROPOSE-THEN-VERIFY, NEVER FIRE-AND-FORGET. A repair is a map edit made by
  //      a program that has already been wrong three times this week about what its own rules mean
  //      (see MAP_HEALTH_CONTRACT §2.1). So each candidate is applied to a SNAPSHOT, re-validated,
  //      and kept ONLY if it strictly improves: the target violation is gone, NO new violation of any
  //      rule appears, and the floor's connectivity is bit-identical (same component count, same
  //      reachable tile count). Anything less is rolled back and reported as skipped. A repair that
  //      cannot prove it helped does not land.
  // Tiles this file DELIBERATELY turned from a doorway into an opening (Mark 2026-09-07). `adopt` [REF#DG-01149b]
  // consults it so an orphaned door declaration we created ON PURPOSE is reported as a retirement,
  // not as "the map moved under the authoring" — which is a real defect and must stay alarming.
  const _openedDoorways = new Set();
  function _repairSnapshot(map) {
    const W = map.length, H = map[0].length, out = new Array(W);
    for (let x = 0; x < W; x++) { out[x] = new Array(H); for (let z = 0; z < H; z++) {
      const c = map[x][z]; out[x][z] = c ? Object.assign({}, c) : c; } }
    return out;
  }
  // ⛔⛔ PASSABILITY IN THIS ENGINE IS TILE ADJACENCY **PLUS THE roomId SEAM**. A PLAIN FLOOD LIES. [REF#DG-01143]
  //   `Engine9:11084` states it in the source: "0 = no wall · 1 = perimeter pane (no collider;
  //   wall-tile collision covers it) · 2 = ROOM-DIVIDER PANE (+COLLIDER)". `_wallEdge` returns 2 for
  //   two walkable tiles whose roomIds DIFFER, and 2 pushes an AABB into `window._thinWallColliders`
  //   which every movement gate tests. `canWalk` is tile-type only — that is exactly WHY the separate
  //   collider list exists. ⚠ `_rid` returns **-2** for a walkable tile with NO roomId, so "no id" is
  //   a DISTINCT id: an unowned tile is DIVIDED from an owned one.
  //   FOUND BY origamiunderworld-80 (research Q3), re-derived here on 4 seeds.
  //   ⚠⚠ SO MINTING A roomId IS NOT BOOKKEEPING IN THIS ENGINE — **IT BUILDS A WALL.** Measured on the
  //     shipped floor: `assignCorridorIds` ALONE splits floor 1 into TWO player-reachable regions,
  //     sealing 16 tiles behind a divider it created, **and `unreachable` reported 0 the whole time**
  //     because it used a plain flood. Seed-invariant on 12345/1000/4242/777.
  //   `edgeOpen` is the one shared implementation. Every reachability question in this file goes
  //   through it, or it is answering about a map nobody can walk.
  const _edgeOpen = (map, ax, az, bx, bz) => {
    const a = map[ax] && map[ax][az], b = map[bx] && map[bz !== undefined ? bz : 0] && map[bx][bz];
    const wk = (c) => !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door' || /^stairs/.test(c.type || ''));   // stairs are floor — see validateGeometry's walk()
    if (!wk(a) || !wk(b)) return false;
    const dr = (c) => (c.type === 'shoji_door' || c.type === 'door');
    if (dr(a) || dr(b)) return true;                       // a doorway is the way through [REF#DG-01144]
    // ⚠ `doors` EDGE FLAGS ARE AN OPEN JUNCTION — the engine's _isDoor (Engine9:11040) checks [REF#DG-01145]
    //   `c.doors.indexOf(dir)` BEFORE anything else, so a flagged edge draws no pane and gets no
    //   collider. This flood had never met one until Section0's SC-approach restore (2026-08-31)
    //   used them for the hall<->ring open crossings, and it read the hall as a sealed island.
    const dx = bx - ax, dz = (bz !== undefined ? bz : 0) - az;
    const dirAB = dx === 1 ? 'E' : dx === -1 ? 'W' : dz === 1 ? 'S' : 'N';
    const dirBA = dx === 1 ? 'W' : dx === -1 ? 'E' : dz === 1 ? 'N' : 'S';
    if ((a.doors && a.doors.indexOf(dirAB) >= 0) || (b.doors && b.doors.indexOf(dirBA) >= 0)) return true;
    // A SECRET SEAM IS A WAY THROUGH TOO (2026-10-01, knowledge/design/SECRET_PORTAL_ROOM_2026-10-01.md). Section0 marks [REF#DG-02217]
    // `secretEdges` on both tiles of the edge into the secret portal room; Engine9 draws its pane and leaves out ONLY its
    // movement collider, so the player walks it. Read as a wall here, the room was reported `unreachable` (a 25-tile island
    // at (52,69)) — and `_repairReach`, which also reads this predicate, would have been entitled to carve it a doorway.
    if ((Array.isArray(a.secretEdges) && a.secretEdges.indexOf(dirAB) >= 0) || (Array.isArray(b.secretEdges) && b.secretEdges.indexOf(dirBA) >= 0)) return true;
    const A = (a.roomId === undefined || a.roomId === null) ? -2 : a.roomId;
    const B = (b.roomId === undefined || b.roomId === null) ? -2 : b.roomId;
    return A === B;                                        // different id ⇒ divider pane ⇒ collider [REF#DG-01146]
  };
  function _repairReach(map) {
    const W = map.length, H = map[0].length;
    const ok = (x, z) => { const c = map[x] && map[x][z];
      return !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door' || /^stairs/.test(c.type || '')); };   // stairs are floor — see validateGeometry's walk()
    const seen = new Set(); let comps = 0, total = 0;
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) if (ok(x, z)) total++;
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
      if (!ok(x, z) || seen.has(x + ',' + z)) continue;
      comps++; const st = [[x, z]]; seen.add(x + ',' + z);
      while (st.length) { const c = st.pop();
        const N = [[1,0],[-1,0],[0,1],[0,-1]];
        for (let i = 0; i < N.length; i++) { const nx = c[0]+N[i][0], nz = c[1]+N[i][1], k = nx+','+nz;
          if (nx<0||nz<0||nx>=W||nz>=H||seen.has(k)||!ok(nx,nz)) continue;
          if (!_edgeOpen(map, c[0], c[1], nx, nz)) continue;   // the roomId seam is a WALL — see above [REF#DG-01147 → see REF#DG-01116]
          seen.add(k); st.push([nx, nz]); } }
    }
    return { comps: comps, total: total };
  }
  // ⛔⛔ COUNT **EVERY** RULE, WARNS INCLUDED — THIS SKIPPED WARNS AND THAT WAS A STRUCTURAL BLINDNESS. [REF#DG-01148]
  //   Found by origamiunderworld-80 on 2026-08-30, re-derived here: `convertBands` took
  //   `doorway-joins` from 4 to 7 on the shipped floor — THREE DOORS STOPPED BEING DOORS, you can now
  //   walk around them — and propose-then-verify reported "nothing got worse", because I had demoted
  //   `doorway-joins` to `warn` myself and then filtered warns out of the very check that guards a map
  //   transform. **The one rule that measures "this door is now decorative" was invisible to the guard
  //   whose job is to notice that.** Seed-invariant on 12345/1000/4242.
  //   ⚠ THE GENERAL LESSON: severity is about whether a map may SHIP. It has nothing to do with
  //     whether a transform made something worse. A guard that filters by severity is asking the
  //     wrong question — "is this fatal?" instead of "did I break it?".
  //   ⚠ AND IT ALSO USED THE CAPPED ARRAY. `validateGeometry` caps entries per rule, so a rule firing
  //     40 times counted as maxReport. `.counts` is uncapped. Two independent under-reports in four
  //     lines, in the function everything else trusts.
  // ⭐ DESIGN FLAGS MUST SURVIVE EVERY TRANSFORM — §7.7, and this is the check that would have
  //   caught the regression Mark found in a screenshot.
  //   Every gate in this repo measures the TILE GRID. He rejected the floor on a HEIGHT and a
  //   MATERIAL: `convertBands` ate the half-height teal reception counter, `band` read 0, the verdict
  //   read ACCEPTED, connectivity held, and NOT ONE CHECK NOTICED, because no rule knows what a
  //   counter looks like. A human found it in one glance.
  //   ⚠ FALSIFIED BEFORE IT WAS BUILT, both directions, because a guard that has only ever printed
  //     PASS is not evidence: replaying the shipped regression (every `counterWall` tile forced to
  //     plain floor) this reports 12 lost flags on 10 tiles — IT WOULD HAVE CAUGHT IT. Run against
  //     the real pipeline today it reports 0 — SO IT DOES NOT CRY WOLF.
  //   `DESIGN_FLAGS` is the list of "this tile is furniture, not structure" markers. ADD TO IT when a
  //   new one appears; a flag not listed here is a flag no transform is protecting.
  const DESIGN_FLAGS = ['counterWall', 'lowWall'];
  function _designCensus(map) {
    const out = [];
    if (!map || !map.length) return out;
    for (let x = 0; x < map.length; x++) for (let z = 0; z < map[0].length; z++) {
      const c = map[x][z]; if (!c) continue;
      for (let i = 0; i < DESIGN_FLAGS.length; i++) if (c[DESIGN_FLAGS[i]]) out.push([x, z, DESIGN_FLAGS[i]]);
    }
    return out;
  }
  function _designLost(before, after) {
    const lost = [];
    for (let i = 0; i < before.length; i++) {
      const b = before[i], c = after[b[0]] && after[b[0]][b[1]];
      if (!c || !c[b[2]]) lost.push(b[2] + '@' + b[0] + ',' + b[1]);
    }
    return lost;
  }

  function _repairCounts(map) {
    const g = validateGeometry(map, {});
    return Object.assign({}, g.counts || {});
  }
  function _repairWorse(before, after) {
    const keys = {}; Object.keys(before).forEach(k => keys[k] = 1); Object.keys(after).forEach(k => keys[k] = 1);
    let better = false;
    for (const k in keys) { const b = before[k]||0, a = after[k]||0;
      if (a > b) return { worse: true, rule: k, from: b, to: a };
      if (a < b) better = true; }
    return { worse: !better, rule: null };
  }
  // ⚠ HOW YOU REFILL A VACATED TILE DECIDES THE ANSWER, AND IT NEARLY REVERSED THIS FIX. [REF#DG-01149]
  //   origamiunderworld-4b reconstructed the door move with a blanket `wall` and measured the
  //   OPPOSITE result — bands 33 -> 36, a new `unreachable`, the floor split in two, 35 tiles lost —
  //   because (61,65) stands in OPEN FLOOR and walling it inserts a fresh wall into open space. My
  //   own run used a blanket `floor`, which is right for these three tiles and wrong the moment one
  //   sits in a wall run: right by luck, not by method. The rule is to MATCH THE SURROUNDINGS —
  //   wall only where the tile stood in a wall run, floor otherwise. Judged against the ORIGINAL map,
  //   before any of this move's other edits land, or two vacated tiles in one run read each other.
  function _repairRefill(orig, x, z) {
    const w = (ax, az) => { const c = orig[ax] && orig[ax][az];
      return !c || c.type === 'wall' || c.type === 'rock' || c.type === 'void'; };
    return ((w(x-1, z) && w(x+1, z)) || (w(x, z-1) && w(x, z+1))) ? 'wall' : 'floor';
  }

  // THE ONE REPAIR THAT IS PROVEN: a doorway stamped on the ROOM side of the wall instead of in the [REF#DG-01150]
  // gap in the wall line. Both of DungeonChain floor 1's invariant `doorway-line` defects are this
  // single generator bug — (61,65) belongs at (60,65), (66,65)-(66,66) belongs at (67,65)-(67,66) —
  // and both seats measured the move independently: doorway-line 2 -> 0, bands unchanged, floor
  // 100% connected. It is expressed here as a SEARCH, not as those coordinates: shift the run one
  // tile perpendicular, keep the shift only if the verifier says it strictly improved.
  function repair(map, opts) {
    const o = opts || {};
    const fixed = [], skipped = [];
    if (!map || !map.length) return { fixed: fixed, skipped: skipped };
    const isDoorT = (t) => t === 'shoji_door' || t === 'door';
    let guard = 0;
    while (guard++ < 24) {
      const viol = validateGeometry(map, {}).filter(v => v.rule === 'doorway-line' && v.at);
      const target = viol.find(v => !skipped.some(s => s.at[0] === v.at[0] && s.at[1] === v.at[1]));
      if (!target) break;
      const W = map.length, H = map[0].length;
      // the run this violation names [REF#DG-01151]
      const tiles = [[target.at[0], target.at[1]]];
      const seedC = map[target.at[0]][target.at[1]];
      if (!seedC || !isDoorT(seedC.type)) { skipped.push({ at: target.at, why: 'not a door tile' }); continue; }
      const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
      for (let d = 0; d < DIRS.length; d++) { let i = 1;
        while (true) { const nx = target.at[0]+DIRS[d][0]*i, nz = target.at[1]+DIRS[d][1]*i;
          const c = map[nx] && map[nx][nz];
          if (!c || !isDoorT(c.type)) break;
          tiles.push([nx, nz]); i++; } }
      const before = _repairCounts(map), beforeR = _repairReach(map);
      let landed = null;
      for (let d = 0; d < DIRS.length && !landed; d++) {
        const dx = DIRS[d][0], dz = DIRS[d][1];
        // destination must be an existing GAP: every target tile currently plain floor [REF#DG-01152]
        let okDest = true;
        for (let t = 0; t < tiles.length; t++) { const c = map[tiles[t][0]+dx] && map[tiles[t][0]+dx][tiles[t][1]+dz];
          if (!c || c.type !== 'floor') { okDest = false; break; } }
        if (!okDest) continue;
        const snap = _repairSnapshot(map);
        for (let t = 0; t < tiles.length; t++) {
          const sx = tiles[t][0], sz = tiles[t][1];
          snap[sx+dx][sz+dz] = Object.assign({}, snap[sx+dx][sz+dz], { type: seedC.type, roomId: map[sx][sz].roomId });
        }
        for (let t = 0; t < tiles.length; t++) { const sx = tiles[t][0], sz = tiles[t][1];
          if (tiles.some(q => q[0] === sx+dx && q[1] === sz+dz)) continue;   // still part of the run [REF#DG-01153]
          snap[sx][sz] = Object.assign({}, snap[sx][sz], { type: _repairRefill(map, sx, sz) });
        }
        const after = _repairCounts(snap), afterR = _repairReach(snap);
        // ⚠⚠ SEVERITY IS THE RIGHT QUESTION **HERE** AND THE WRONG ONE IN `_repairCounts`, AND THE [REF#DG-01154]
        //   DIFFERENCE IS WHICH QUESTION IS BEING ASKED.
        //     `_repairCounts` asks "DID I BREAK SOMETHING?" — severity is irrelevant there, and
        //       filtering by it is exactly how three doors were quietly made bypassable.
        //     THIS asks "IS THE TRADE WORTH MAKING?" — and there severity is the whole point.
        //   MEASURED, the move this unblocks: the door at (61,65) is not in a wall at ALL. Shifting
        //   it west into its real wall line at (60,65) gives
        //       BETTER: doorway-line 1->0 (a FAIL, the structural defect) · band 16->15 · room-ragged 2->1
        //       WORSE:  door-placement 1->2 (a WARN — it lands in the wall but off the midpoint)
        //   A strict "no rule may rise" rejected that, so a door that is STRUCTURALLY BROKEN stayed
        //   broken to protect a COSMETIC count. Trading a fail for a warn is a plain improvement.
        //   ⚠ THE GUARD THAT MATTERS IS STILL ABOVE AND BELOW THIS ONE: the moved run must itself be
        //     clean (so the defect cannot travel with the door — that bug is what walked it two tiles
        //     north), connectivity must be identical, and no design flag may be lost. Only the
        //     WARN-level trade is permitted, and only when a FAIL is being retired.
        const _sevWorse = (b, a) => {
          const FAIL = ['band', 'doorway-line', 'room-no-door', 'unreachable', 'room-shape', 'room-count'];
          for (let i = 0; i < FAIL.length; i++) { const k = FAIL[i]; if ((a[k] || 0) > (b[k] || 0)) return k + ' ' + (b[k]||0) + '->' + (a[k]||0); }
          return null;
        };
        const _failRose = _sevWorse(before, after);
        const _anyFailFell = ['band','doorway-line','room-no-door','unreachable','room-shape','room-count']
          .some(k => (after[k] || 0) < (before[k] || 0));
        if (_failRose) continue;                  // never trade a fail for a fail [REF#DG-01155]
        if (!_anyFailFell) continue;              // and never move a door for nothing [REF#DG-01156]
        if (afterR.comps !== beforeR.comps || afterR.total !== beforeR.total) continue;
        // ⛔⛔ VERIFY **THE DOOR**, NOT THE COORDINATE IT USED TO BE AT. THIS IS THE THIRD INSTANCE [REF#DG-01157]
        //   TODAY OF A CHECK MEASURING THE WRONG OBJECT, and it shipped on Mark's floor.
        //   Found by origamiunderworld-80, re-derived here on seeds 12345/4242:
        //     fixed (61,65) moved [0,-1] -> lands (61,64)
        //     fixed (61,64) moved [0,-1] -> lands (61,63)   <- THE SAME DOOR, MOVED AGAIN
        //     skipped (61,63) "no perpendicular shift ... without making something else worse"
        //   The west doorway was walked TWO TILES NORTH across two iterations and is STILL a
        //   `doorway-line` violation at its new home. `doorway-line 2 -> 1` was real, but that was
        //   the EAST double door; the west one was RELOCATED, NOT REPAIRED.
        //   WHY THE OLD TEST PASSED IT: `_repairWorse` compares GLOBAL COUNTS, so a move that leaves
        //   `doorway-line` at 1 (the violation travelled with the door) but happens to drop some
        //   OTHER rule by 1 reads as "better" and is accepted. An unrelated improvement was paying
        //   for relocating the actual defect, and the loop then chased its own tail until it ran out
        //   of room. It verified the TILE, not the OBJECT.
        //   THE FIX: after the move, the moved run itself must be clean. That also subsumes "prefer
        //   a destination inside a wall line" — a destination that is not in one fires `doorway-line`
        //   at the new tiles and is rejected here.
        {
          const _dest = new Set();
          for (let t = 0; t < tiles.length; t++) _dest.add((tiles[t][0] + dx) + ',' + (tiles[t][1] + dz));
          const _still = validateGeometry(snap, {}).some(v =>
            v.rule === 'doorway-line' && v.at && _dest.has(v.at[0] + ',' + v.at[1]));
          if (_still) continue;                     // the defect travelled with the door — not a repair [REF#DG-01158]
        }
        for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) map[x][z] = snap[x][z];
        landed = { from: tiles.slice(), by: [dx, dz], span: tiles.length };
      }
      // ── OPEN IT INSTEAD ── Mark, 2026-09-07: "for 54,42, I'd just suppose to remove the doors [REF#DG-01158b]
      //    there first make it all opening instead, see if u can do that."
      //    When no perpendicular shift lands the run in a real wall line, the loop above used to give
      //    up and leave a BROKEN DOOR standing on the floor Mark plays — a leaf with no jamb, an
      //    arbitrary rotation, and a permanent `doorway-line` FAIL. His ruling is the simpler one: a
      //    doorway that cannot be a doorway should stop pretending to be one and just be a GAP.
      //    ⚠⚠ TYPE 'floor' ALONE WOULD HAVE **SEALED** THE PASSAGE, WHICH IS THE OPPOSITE OF THE ORDER.
      //      Passability here is tile adjacency PLUS the roomId seam (`_edgeOpen`, and the note above
      //      it): two walkable tiles with DIFFERENT roomIds get a divider pane and a collider. A
      //      doorway is exempt *because it is a doorway* — so demoting it to plain floor mints a wall
      //      exactly where the door used to be. The tile would look open on the map and stop the
      //      player dead. So each crossing the doorway PROVIDED is re-granted as an open edge
      //      (`c.doors`), the same mechanism Section0 uses for the hall<->ring crossings: `_isDoor`
      //      (Engine9:11040) checks `doors` FIRST, draws no pane and adds no collider.
      //    ⚠ STILL PROVEN, NOT ASSUMED — same verifier that guards the shift. `doorway-line` must
      //      FALL, no FAIL-level rule may RISE (`room-no-door` is in that list, so this can never
      //      strip a room of its only door), and reachability must be IDENTICAL. Identity is the
      //      whole point: this removes a LEAF, not a passage.
      //    Off: window._openUnfixableDoorways = false.
      if (!landed && !(typeof window !== 'undefined' && window._openUnfixableDoorways === false)) {
        const snapO = _repairSnapshot(map);
        for (let t = 0; t < tiles.length; t++)
          snapO[tiles[t][0]][tiles[t][1]] = Object.assign({}, snapO[tiles[t][0]][tiles[t][1]], { type: 'floor' });
        const _DIR4 = [[1, 0, 'E', 'W'], [-1, 0, 'W', 'E'], [0, 1, 'S', 'N'], [0, -1, 'N', 'S']];
        const _grant = (sx, sz, nx, nz, dAB, dBA) => {
          const a = snapO[sx] && snapO[sx][sz], b = snapO[nx] && snapO[nx][nz];
          if (!a || !b) return;
          if (!a.doors || a.doors.indexOf(dAB) < 0) a.doors = (a.doors || []).slice().concat([dAB]);
          if (!b.doors || b.doors.indexOf(dBA) < 0) b.doors = (b.doors || []).slice().concat([dBA]);
        };
        for (let t = 0; t < tiles.length; t++) for (let d = 0; d < _DIR4.length; d++) {
          const sx = tiles[t][0], sz = tiles[t][1];
          const nx = sx + _DIR4[d][0], nz = sz + _DIR4[d][1];
          if (!_edgeOpen(map, sx, sz, nx, nz)) continue;        // it was not a way through before — leave it shut [REF#DG-01158c]
          if (_edgeOpen(snapO, sx, sz, nx, nz)) continue;       // already open without help [REF#DG-01441]
          _grant(sx, sz, nx, nz, _DIR4[d][2], _DIR4[d][3]);
        }
        const afterO = _repairCounts(snapO), afterOR = _repairReach(snapO);
        const _FAILR = ['band', 'doorway-line', 'room-no-door', 'unreachable', 'room-shape', 'room-count'];
        let _roseO = null;
        for (let i = 0; i < _FAILR.length; i++) { const k = _FAILR[i];
          if ((afterO[k] || 0) > (before[k] || 0)) { _roseO = k + ' ' + (before[k] || 0) + '->' + (afterO[k] || 0); break; } }
        if (!_roseO && (afterO['doorway-line'] || 0) < (before['doorway-line'] || 0)
            && afterOR.comps === beforeR.comps && afterOR.total === beforeR.total) {
          for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) map[x][z] = snapO[x][z];
          for (let t = 0; t < tiles.length; t++) _openedDoorways.add(tiles[t][0] + ',' + tiles[t][1]);
          landed = { from: tiles.slice(), by: [0, 0], span: tiles.length, opened: true };
        } else if (_roseO) {
          skipped.push({ at: target.at, why: 'opening the run would raise ' + _roseO });
        }
      }
      if (landed) fixed.push({ rule: 'doorway-line', at: target.at, moved: landed.by, span: landed.span, opened: landed.opened === true });
      else if (!skipped.some(s => s.at[0] === target.at[0] && s.at[1] === target.at[1]))
        skipped.push({ at: target.at, why: 'no perpendicular shift lands in a wall-line gap without making something else worse, and opening it made something else worse' });
    }
    if (fixed.length) adopt(map, (o.rooms || rooms().map(r => ({ id: r.genId, x: r.x, y: r.z, w: r.w, h: r.h, kind: r.kind }))));
    return { fixed: fixed, skipped: skipped };
  }

  // ══ (a) THE CORRIDOR SPLIT ══ MINT AN ID FOR THE SPACE BETWEEN THE ROOMS. [REF#DG-01159]
  //    Contract: knowledge/design/MAP_HEALTH_CONTRACT_2026-08-29.md §6d, SIGNED BY BOTH SEATS
  //    2026-08-30 on Mark's GO ("sync with other AI, work together on this"). Read §6d before
  //    changing a line of this — every clause below was measured, several were falsified first.
  //
  //    THE DEFECT: a corridor inherits the roomId of the room it touches. That single fact causes
  //    (1) `doorway-joins` reading one id for a door that plainly joins two spaces, (2) 10 of floor
  //    1's 33 bands being unconvertible because the engine only draws a seam divider where the two
  //    sides DIFFER, and (3) `room-ragged` firing on every room, because a room's "own tiles" are a
  //    room PLUS a corridor and never fill their bounding box.
  //
  //    ⚠ IDS ARE APPENDED, NEVER RESERVED, AND THAT IS NOT A STYLE CHOICE. `segmentId` is derived
  //      from `roomId` at TWO sites that index the rooms ARRAY positionally — DungeonChain.js:4220
  //      and Engine9.html:5268, and the second is SECTION CULLING, i.e. what gets rendered at all.
  //      A reserved high range (100000+, the obvious first instinct) makes `rooms[id]` undefined and
  //      drops ~450 tiles to segmentId -1. So a corridor takes `id = rooms.length` and is PUSHED,
  //      keeping `rooms[i].id === i`. Guarded by `npm run gate:roomid`.
  //    ⚠ COMPONENT ORDER IS PART OF THE CONTRACT. The id a corridor gets depends on the order
  //      components are discovered, so a non-deterministic order mints different ids on every boot
  //      and breaks anything persisted — saves, the accepted-attempt index. Order is the ascending
  //      (x,z) scan below. Do not "optimise" it into a Set iteration.
  //    ⚠ FLOOR TILES ONLY. A doorway is part of the wall line, not part of the corridor — the same
  //      distinction that made `room-shape` wrong when it used walk(). Door ownership is (e)'s job.
  //    DEFAULT OFF: this runs only when the caller asks. Turning it on is a separate decision with
  //    its own evidence (`npm run probe:corridor`), and per both seats it is Mark's to make.
  function assignCorridorIds(map, rooms, opts) {
    const o = opts || {};
    const out = { minted: 0, tiles: 0, components: [], skipped: null };
    if (!map || !map.length || !Array.isArray(rooms)) { out.skipped = 'no map or no rooms array'; return out; }
    const W = map.length, H = map[0].length;
    const rec = new Map();
    for (let i = 0; i < rooms.length; i++) { const r = rooms[i];
      if (r && r.id !== undefined && r.id !== null) rec.set(r.id, r); }
    const rz = (r) => (r.y !== undefined ? r.y : r.z);
    const inRect = (id, x, z) => { const r = rec.get(id);
      return !!(r && typeof r.x === 'number' && typeof rz(r) === 'number' && r.w > 0 && r.h > 0
                && x >= r.x && x < r.x + r.w && z >= rz(r) && z < rz(r) + r.h); };
    // corridor tile = FLOOR, carries a real room's id, and lies OUTSIDE that room's own rect [REF#DG-01160]
    const isCorridor = (x, z) => { const c = map[x] && map[x][z];
      return !!c && c.type === 'floor' && c.roomId !== undefined && c.roomId !== null
             && rec.has(c.roomId) && !inRect(c.roomId, x, z); };
    const _snapBefore = _repairSnapshot(map), _beforeComps = _repairReach(map).comps;
    const _roomsLenBefore = rooms.length;
    const claimed = new Set();
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {      // ascending (x,z) — the contract's order [REF#DG-01161]
      if (!isCorridor(x, z) || claimed.has(x + ',' + z)) continue;
      const comp = [[x, z]]; claimed.add(x + ',' + z);
      const st = [[x, z]];
      while (st.length) { const c = st.pop();
        const N = [[1,0],[-1,0],[0,1],[0,-1]];
        for (let i = 0; i < N.length; i++) { const nx = c[0]+N[i][0], nz = c[1]+N[i][1], k = nx+','+nz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || claimed.has(k) || !isCorridor(nx, nz)) continue;
          claimed.add(k); comp.push([nx, nz]); st.push([nx, nz]); } }
      // ⚠⚠ A CORRIDOR RECORD MUST BE SHAPED LIKE A ROOM RECORD, OR IT CRASHES THE BUILD. [REF#DG-01162]
      //   My first version pushed `{id, kind, shapeKey, tiles, segmentId}` and the floor-decal pass
      //   (Engine9 ~:18416) does `room.center.x * GRID` over EVERY entry of `rooms` — instant
      //   `Cannot read properties of undefined (reading 'x')`, black screen, caught by Mark on a live
      //   boot and not by any gate. The (b)/(c)/(d) consumer audit covered `rooms.find(id===1)`,
      //   segmentId and spawn keys; NOTHING asked what iterates `rooms` and reads GEOMETRY off it.
      //   Real records carry: id x y w h cx cz center{x,y} roomName roomNameEn roomType segmentId …
      //   so a corridor carries the geometry half of that, computed from its own component bbox.
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (let i = 0; i < comp.length; i++) {
        if (comp[i][0] < bx0) bx0 = comp[i][0]; if (comp[i][0] > bx1) bx1 = comp[i][0];
        if (comp[i][1] < bz0) bz0 = comp[i][1]; if (comp[i][1] > bz1) bz1 = comp[i][1];
      }
      const _cx = Math.floor((bx0 + bx1) / 2), _cz = Math.floor((bz0 + bz1) / 2);
      const newId = rooms.length;                                   // APPEND — keeps rooms[i].id === i [REF#DG-01163]
      // ⚠ `sectionIndex` ALONGSIDE `segmentId`, OFF THE SAME TILE, AND THESE RECORDS WERE THE WHOLE [REF#DG-01375]
      //   REMAINDER OF `section-index-parity`. Measured 2026-09-03, floors 2 and 3, three gate runs
      //   each: with the generator's head rooms fixed the warn still read "7 of 28 room record(s)
      //   carry no `sectionIndex` while the tiles place them in a section", and all 7 were corridors
      //   minted right here — `segmentId` set, `sectionIndex` absent. The engine's section-aware
      //   passes read `sectionIndex`, so every corridor on the floor was section-less to them while
      //   its tiles sat squarely inside a section. Two names for one quantity is the same defect the
      //   record/tile parity rule was written for; this makes the record agree with the address.
      rooms.push({ id: newId, x: bx0, y: bz0, w: bx1 - bx0 + 1, h: bz1 - bz0 + 1,
                   cx: _cx, cz: _cz, center: { x: _cx, y: _cz },
                   kind: 'corridor', shapeKey: 'CORRIDOR', roomType: 'corridor',
                   roomName: '通路', roomNameEn: 'Passage', tiles: comp.length,
                   segmentId: (map[x][z] && map[x][z].segmentId) || 0,
                   sectionIndex: (map[x][z] && map[x][z].segmentId) || 0 });
      for (let i = 0; i < comp.length; i++) map[comp[i][0]][comp[i][1]].roomId = newId;
      out.minted++; out.tiles += comp.length;
      out.components.push({ id: newId, tiles: comp.length, at: [x, z] });
    }
    // ⛔ VERIFY: MINTING BUILT WALLS. If handing a corridor its own id split the floor into more [REF#DG-01164]
    //   player-reachable regions than it started with, ROLL THE WHOLE THING BACK. Measured: without
    //   this, `assignCorridorIds` sealed 16 tiles behind a divider it created and every gate stayed
    //   green. A pass that edits roomIds is a MAP-EDITING pass and needs the same propose-then-verify
    //   as the conversion passes — origamiunderworld-80's recommendation, and they were right.
    if (out.minted) {
      const afterR = _repairReach(map);
      if (afterR.comps > _beforeComps) {
        for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) map[x][z] = _snapBefore[x][z];
        rooms.length = _roomsLenBefore;
        out.rolledBack = true;
        out.why = 'minting split the floor ' + _beforeComps + ' -> ' + afterR.comps + ' reachable region(s)';
        out.minted = 0; out.tiles = 0; out.components = [];
      }
    }
    return out;
  }

  // ══ MAP_CENSUS DRAFT — PHASE 1, REPORT-ONLY, GENERATOR HALF ══════════════════════════════════ [REF#DG-CENSUS1] [REF#DG-01442]
  //    Mark, 2026-09-06: "ready for the first parts of the map implementation... hook in onibaba, she
  //    will now control the map generation." Architecture: plans/ONIBABA_MAP_ORCHESTRATION_ARCHITECTURE
  //    _2026-09-06.md. Split (CODER2 + this seat): OniBaba8.js's mapDiagnosticRing() consumes this;
  //    this function produces it. PURE READ of the finished map — calls NOTHING that carves, so it
  //    cannot change a single generated tile. Runs AFTER assignCorridorIds/convertBands/adopt, so
  //    corridors already exist as their own `kind:'corridor'` pseudo-room records (this function's
  //    span/corner walk is built entirely on top of that existing minting, not a second corridor
  //    detector) and bands are already settled.
  //
  //    CORNERS CANNOT BE FULLY GRADED HERE — flagged rather than guessed at (independently verified by
  //    CODER2 against Creator.js's own `validateColliders` note, ~:2192, "this rule cannot be graded
  //    from the map — boot the engine"). `paneExists`/`colliderExists` are Three.js facts that don't
  //    exist until Engine9.html builds walls, which happens AFTER this generator pass. So this function
  //    emits corner CANDIDATES ONLY (tile + which two spans meet there) — no verdict field at all — and
  //    Engine9.html's existing `_auditColliderSurfaces('seam-walls-complete')` hook (~:19261 at time of
  //    writing) fills in the two verdict fields and is the one that actually posts MAP_CENSUS. This
  //    function only builds `window._mapCensusDraft` for that hook to read and finish.
  //
  //    SPAN/CORNER ALGORITHM: every corridor component minted by `assignCorridorIds` is walked as a
  //    tile-adjacency graph (4-connected, cardinal only — this map has no diagonal corridors anywhere).
  //    A tile with exactly 2 neighbours on OPPOSITE sides (both N/S or both E/W) is a straight-through
  //    tile; anything else — 1 neighbour (a dead end / where the corridor meets a room or door), 2
  //    neighbours at 90° (a turn), or 3-4 neighbours (a T or + junction) — is a NODE. A span is the
  //    straight run of tiles between two adjacent nodes; a CORNER (for §2b) is specifically a node with
  //    exactly 2 neighbours at 90° (a junction is a real fork, not the "where corridors turn" case §2b
  //    describes, so junctions are walked for spans but not reported as corners). Each edge between two
  //    nodes is recorded once, keyed by its own sorted tile-pair, so a span is never double-counted from
  //    both ends.
  function computeMapCensusDraft(map, rooms, opts) {
    const o = opts || {};
    const W = map.length, H = map[0] ? map[0].length : 0;
    const out = { spans: [], rooms: [], corners: [] };

    // ── rooms[] (§2d) — reuse the EXACT match logic validate()'s room-shape check uses (~:1120-1191), [REF#DG-CENSUS2] [REF#DG-01443]
    //    not re-derived independently. Two readers of one rule is exactly the class of drift this file
    //    warns about elsewhere (`_counterFrac()` lesson) — this is a deliberate exception because
    //    `validate()`'s block is a closure over its own locals and not itself exported; the shapes are
    //    copied here rather than the function being made reusable, which is a real seam left for later,
    //    not an oversight.
    const RS = (typeof window !== 'undefined' && window.RoomShapes) || (typeof global !== 'undefined' && global.RoomShapes) || null;
    // ── ONE TILE HARVEST, TWO READERS. Hoisted out of the shapes block on 2026-09-07 because the [REF#DG-CENSUS7] [REF#DG-01444]
    //    spans pass below needs the same facts: whether a room's floor tiles actually FILL its
    //    bounding box. A hallway room record is a rectangle, but the tiles under it need not be one —
    //    floor 1's 回廊 (roomId 5) is a hollow ring stamped as a 15x16 bbox, and the 西回廊 (roomId 2)
    //    is an L the cabaret carves out of an 11x7 bbox. Measuring "long axis of the bbox" on either
    //    of those measures a rectangle that has no floor in the middle of it.
    const tilesOf = new Map();
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
      const c = map[x] && map[x][z];
      if (!c || c.type !== 'floor' || c.roomId === undefined || c.roomId === null) continue;
      let a = tilesOf.get(c.roomId); if (!a) { a = []; tilesOf.set(c.roomId, a); }
      a.push([x, z]);
    }
    // TRUE when the room's own rectangle is NOT solid floor — i.e. the record is a bounding box around [REF#DG-01445]
    // a ring, an L or a horseshoe rather than around a straight run. Door tiles are typed `shoji_door`,
    // not `floor`, so a room is allowed one un-filled tile per doorway before it counts as hollow.
    const _hollow = (r) => {
      if (!r || !(r.w > 0 && r.h > 0)) return false;
      const rx = (typeof r.x === 'number') ? r.x : 0;
      const rz = (typeof r.y === 'number') ? r.y : (typeof r.z === 'number' ? r.z : 0);
      const ts = tilesOf.get(r.id);
      if (!ts) return false;
      let inside = 0;
      for (let i = 0; i < ts.length; i++)
        if (ts[i][0] >= rx && ts[i][0] < rx + r.w && ts[i][1] >= rz && ts[i][1] < rz + r.h) inside++;
      // 8 = the most doorway tiles any one room on floor 1 owns (the cabaret's 5); a ring or an L [REF#DG-01446]
      // misses DOZENS of tiles, so the two cases are nowhere near each other and no tuning is implied.
      return (r.w * r.h - inside) > 8;
    };
    if (RS && typeof RS.shapeOf === 'function' && o.shapes !== false) {
      const _hallOK = (a, b) => {
        const HS = RS.HALLS || [];
        for (let i = 0; i < HS.length; i++) {
          if ((HS[i].w === a && HS[i].len === b) || (HS[i].w === b && HS[i].len === a)) return HS[i].key;
        }
        return null;
      };
      for (const r of rooms) {
        if (!r || r.id === undefined || r.id === null) continue;
        let ts = tilesOf.get(r.id);
        if (!ts || !ts.length) continue;
        if (typeof r.x === 'number' && typeof r.y === 'number' && r.w > 0 && r.h > 0) {
          ts = ts.filter(t => t[0] >= r.x && t[0] < r.x + r.w && t[1] >= r.y && t[1] < r.y + r.h);
        }
        if (!ts.length) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < ts.length; i++) {
          if (ts[i][0] < x0) x0 = ts[i][0]; if (ts[i][0] > x1) x1 = ts[i][0];
          if (ts[i][1] < z0) z0 = ts[i][1]; if (ts[i][1] > z1) z1 = ts[i][1];
        }
        const fw = x1 - x0 + 1, fh = z1 - z0 + 1;
        // Both `kind` and `roomType` checked, not just `kind` — see the corridorRoomIds note below for [REF#DG-01447]
        // why (Section0.js's rooms carry roomType only). Harmless here even without the fix (the OR
        // fallback below tries both branches regardless), made explicit instead of relying on that luck.
        const isHall = (r.kind === 'hallway' || r.genKind === 'hallway' || r.kind === 'corridor'
                     || r.roomType === 'hallway' || r.roomType === 'corridor');
        const hit = isHall ? (_hallOK(fw, fh) || (RS.shapeOf(fw, fh) || RS.shapeOf(fh, fw) || {}).key)
                           : ((RS.shapeOf(fw, fh) || RS.shapeOf(fh, fw) || {}).key || _hallOK(fw, fh));
        // ── A HOLLOW FOOTPRINT HAS NO ANSWER IN A CATALOGUE OF SOLID RECTANGLES, AND SAYING [REF#DG-CENSUS8] [REF#DG-01448]
        //    "not in catalogue" about one is a defect in the CHECK, not in the map. RoomShapes.json
        //    is `w x h` of solid interior tiles; a ring's bbox describes the hole as much as the
        //    floor. Mark 2026-09-07 on the two rooms this hits (5 = the 回廊, 2 = the 西回廊):
        //    section 0 "is good" and "the corners and doors are correct" — they are hand-authored
        //    core geometry, not generator output that drifted.
        //    ⚠ `matched: null`, NOT `true`. Oni-Baba's ring flags `matched === false`; null reads as
        //      "no verdict is possible here" and is reported as an EXEMPTION LINE in her reasons, so
        //      it stays on screen every boot instead of quietly vanishing from the count. Inventing a
        //      RING_15x16 catalogue entry to make it green was the other option and was rejected: it
        //      would let any 15x16 solid room ship under a key that means "ring".
        if (_hollow(r)) { out.rooms.push({ roomId: r.id, shapeKey: null, matched: null, hollow: true }); continue; }
        // ⚠ A SPECIAL IS `matched: null`, NOT `false` — the same ruling as the room-shape rule, carried [REF#DG-01960]
        //   into the CENSUS. Mark 2026-09-08: "tell creator to fuck off - its a special room and has no [REF#DG-01960]
        //   jurisdiction on that size." I exempted the geometry RULE and missed this SECOND writer of
        //   the same law, so the 15x15 風呂場 still turned Oni-Baba's map ring RED every boot:
        //   "ROOM shape not in catalogue: roomId=27 no shapeKey". Two places implement one rule; a
        //   ruling applied to one of them is only half applied.
        //   null is the correct verdict and not a fudge: it already means "no verdict was reached"
        //   (the hollow-footprint case one line above uses it), which is exactly true of a footprint
        //   the catalogue is not entitled to judge. `false` would keep asserting a defect.
        if (r.special === true) { out.rooms.push({ roomId: r.id, shapeKey: hit || null, matched: null, special: true }); continue; }
        out.rooms.push({ roomId: r.id, shapeKey: hit || null, matched: !!hit });
      }
    }

    // ── spans[] (§2a) — ONE SPAN PER CORRIDOR/HALLWAY ROOM RECORD, LONG AXIS, NOT A TILE WALK. [REF#DG-CENSUS3] [REF#DG-01449]
    //    ⛔ SUPERSEDED (same build, before this ever shipped): the first version of this function walked
    //    the corridor tile-adjacency graph directly, classifying each tile as straight-through/corner/
    //    junction by its neighbour count. MEASURED on floor 1, live boot: 187 spans, max 8 tiles, sample
    //    span 2 tiles — plainly wrong on a floor with 7 rooms total. CAUSE: this game's hallways are 2
    //    tiles WIDE (`HALL {…,2,10}`), so almost every interior tile has 3 corridor neighbours (ahead,
    //    behind, AND the parallel width tile) and gets misread as a junction — the graph-walk assumed a
    //    1-tile-wide path, which this codebase never builds. FIX: don't rebuild a width-aware skeleton
    //    walk (real complexity, no live floor needs it today) — every corridor/hallway is ALREADY its
    //    own room record with a computed bounding box (Section0.js's `rec()` sets it directly per leg;
    //    `assignCorridorIds`'s flood-fill sets it from the component's own bbox, above). This codebase's
    //    OWN model of "a hallway" is already (width, length) — `RS.HALLS` entries are `{w, len, key}` —
    //    so one span per hallway/corridor room, long axis, is not a simplification of the real model, it
    //    IS the real model. Verified: floor 1's HALL now reports exactly 8 tiles (matches shapeKey H2x8's
    //    own catalogued length), not the earlier 187-span noise.
    //    ⚠ KNOWN GAP, FLAGGED NOT HIDDEN: a generator whose horseshoe/ring is ONE unbroken multi-leg
    //    blob (no per-leg room records — `_buildLHalls`, currently being reworked by a peer seat for the
    //    36389aff regression) reports as ONE room and ONE span using its OVERALL bounding box, not one
    //    span per leg. That over/under-estimates individual leg lengths for that specific generator.
    //    Section0.js (every floor this session actually booted) pre-splits into per-leg rooms and is
    //    unaffected.
    //    ✅ GAP CLOSED AT THE SOURCE 2026-09-07 (Mark: "fix DungeonChain.js, let onibaba have it") --
    //    not here. DungeonChain.js now measures the trunk's real straight runs off its own finished
    //    hall tile set (_straightRuns, recorded on the accepted attempt only) and exports them as
    //    DungeonChain.carveSpans(). Those are merged in below with source 'lhalls-trunk', ALONGSIDE
    //    the room-bbox spans rather than replacing them -- a generator that has per-leg room records
    //    keeps reporting them, and one that does not is no longer invisible. The note above stands as
    //    the description of the room-bbox path, which is unchanged.
    for (const r of rooms) {
      if (!r || r.id === undefined) continue;
      const isCorridorLike = (r.kind === 'corridor' || r.kind === 'hallway' || r.roomType === 'corridor' || r.roomType === 'hallway');
      if (!isCorridorLike) continue;
      if (!(typeof r.w === 'number' && typeof r.h === 'number' && r.w > 0 && r.h > 0)) continue;
      const axis = (r.w >= r.h) ? 'x' : 'z';
      const tileCount = Math.max(r.w, r.h);
      const rx = (typeof r.x === 'number') ? r.x : 0, rz = (typeof r.y === 'number') ? r.y : (typeof r.z === 'number' ? r.z : 0);
      const startTile = (axis === 'x') ? [rx, rz] : [rx, rz];
      const endTile = (axis === 'x') ? [rx + r.w - 1, rz] : [rx, rz + r.h - 1];
      // ── A LOOP IS NOT A CORRIDOR BETWEEN TWO ROOMS, AND MAX_CORR IS A RULE ABOUT CORRIDORS. [REF#DG-CENSUS9] [REF#DG-01450]
      //    Mark 2026-09-05: "halls max 10, usually 4-5, rooms on the main hall" — a rule about how
      //    far a player walks between doors. The 回廊 is a closed ring AROUND section 0; its "length"
      //    is its circumference, and shortening it means shrinking the ring the cabaret, the 番所 and
      //    the entrance hall are all built against. Mark 2026-09-07 on that core: section 0 "is good".
      //    ⚠ EXEMPT, NOT SILENT. The flag rides the span, Oni-Baba prints one exemption line per
      //      hollow hallway, and the tileCount is still reported — so a ring that grows is still
      //      visible in the log. An exemption nobody can see is indistinguishable from a missing check
      //      (memory: "a guard whose ANSWER is unread looks identical to no guard").
      const hollow = _hollow(r);
      out.spans.push(hollow
        ? { axis, startTile, endTile, tileCount, source: 'room-bbox', roomId: r.id, hollow: true }
        : { axis, startTile, endTile, tileCount, source: 'room-bbox', roomId: r.id });
    }

    // ── THE TRUNK'S OWN SPANS — the code path the room-bbox walk structurally cannot see. [REF#DG-01451]
    //    A generator that carves a multi-leg ring as one blob has no per-leg room record for the
    //    loop above to measure, so it reported one span from an overall bounding box and a 45-tile
    //    straight run stayed invisible to the gate. DungeonChain measures its own carve now; this
    //    only collects it. Guarded and optional: an older DungeonChain without carveSpans(), or any
    //    other generator, simply contributes nothing here and the census is exactly as it was.
    try {
      const _DC = (typeof window !== 'undefined' && window.DungeonChain)
              || (typeof global !== 'undefined' && global.DungeonChain) || null;
      if (_DC && typeof _DC.carveSpans === 'function') {
        for (const cs of (_DC.carveSpans() || [])) {
          if (cs && typeof cs.tileCount === 'number') out.spans.push(cs);
        }
      }
      if (_DC && typeof _DC.MAX_CORR === 'number') out.maxCorr = _DC.MAX_CORR;
    } catch (_) {}

    // ── corners[] (§2b) — CANDIDATE ONLY, one per adjacent pair of corridor/hallway room bounding [REF#DG-CENSUS4] [REF#DG-01452]
    //    boxes ("where corridors turn/join" per the architecture doc's own working definition, §2b).
    //    Two rooms are adjacent if their bounding boxes touch along an edge — the shared boundary tile
    //    (or its midpoint on a wider shared edge) is the corner candidate. No paneExists/colliderExists
    //    field — those are Three.js facts that don't exist until Engine9.html builds walls; see the
    //    function header note. Same known gap as spans: a single-blob multi-leg corridor has no internal
    //    room-pair boundary to detect a turn at, so this misses corners INSIDE such a blob (none exist
    //    on any floor this session actually booted).
    const corridorRooms = rooms.filter(r => r && r.id !== undefined
      && (r.kind === 'corridor' || r.kind === 'hallway' || r.roomType === 'corridor' || r.roomType === 'hallway')
      && typeof r.w === 'number' && typeof r.h === 'number' && r.w > 0 && r.h > 0);
    const rx0 = r => (typeof r.x === 'number') ? r.x : 0;
    const rz0 = r => (typeof r.y === 'number') ? r.y : (typeof r.z === 'number' ? r.z : 0);
    for (let i = 0; i < corridorRooms.length; i++) {
      const a = corridorRooms[i];
      const ax0 = rx0(a), az0 = rz0(a), ax1 = ax0 + a.w - 1, az1 = az0 + a.h - 1;
      for (let j = i + 1; j < corridorRooms.length; j++) {
        const b = corridorRooms[j];
        const bx0 = rx0(b), bz0 = rz0(b), bx1 = bx0 + b.w - 1, bz1 = bz0 + b.h - 1;
        // touching along a vertical edge (a's east border meets b's west, or vice versa) with overlapping z-range [REF#DG-01453]
        const touchesX = (ax1 + 1 === bx0 || bx1 + 1 === ax0) && !(az1 < bz0 || bz1 < az0);
        const touchesZ = (az1 + 1 === bz0 || bz1 + 1 === az0) && !(ax1 < bx0 || bx1 < ax0);
        if (!touchesX && !touchesZ) continue;
        const midX = touchesX ? (ax1 + 1 === bx0 ? bx0 : ax0) : Math.round((Math.max(ax0, bx0) + Math.min(ax1, bx1)) / 2);
        const midZ = touchesZ ? (az1 + 1 === bz0 ? bz0 : az0) : Math.round((Math.max(az0, bz0) + Math.min(az1, bz1)) / 2);
        out.corners.push({ tile: [midX, midZ], betweenRoomIds: [a.id, b.id] });
      }
    }
    return out;
  }

  // ══ CONVERT THE BANDS ══ THE PASS THAT ACTUALLY REMOVES THE DOUBLE-WALL TILES. [REF#DG-01165]
  //    Mark 2026-08-30, shown the boot verdict for the second time — 33 violations, all `band`.
  //    "Convertible" was never "converted": `assignCorridorIds` made all 33 SAFELY removable, and
  //    this is what removes them. The two run together or not at all.
  //
  //    WHAT A BAND IS: a wall TILE with walkable on both sides, where the seam model wants a
  //    zero-thickness divider. Converting = the tile becomes FLOOR and joins ONE side; the engine
  //    then draws a divider on the new boundary because the two sides carry different roomIds
  //    (`_seamRoomWalls`, Engine9 ~:16361 — `A !== null && B !== null && A !== B`). The wall stays,
  //    at zero thickness, and a whole tile of floor is given back.
  //
  //    ⚠⚠ WHICH SIDE GETS THE TILE IS NOT ARBITRARY, AND CHOOSING WRONG BREAKS `room-shape`.
  //      A ROOM is a catalogued footprint (RoomShapes); a CORRIDOR is not. Give the tile to a room
  //      and that room grows by one tile and falls off the catalogue — trading one violation for
  //      another. So: THE CORRIDOR SIDE TAKES IT whenever exactly one side is a corridor. Only when
  //      both sides are rooms does it fall back to the lower roomId, deterministically.
  //    ⚠ IT REFUSES TO DELETE A WALL. If the two sides share a roomId no divider would be drawn and
  //      the wall would simply VANISH — that is the 10 cabaret walls that made a blanket band repair
  //      unshippable (MAP_HEALTH_CONTRACT §3). Those tiles are SKIPPED and counted, never converted.
  //      With `assignCorridorIds` run first there are none; without it there are 10, and this pass
  //      leaves every one of them standing.
  //    ⚠ PROPOSE-THEN-VERIFY, like `repair()`: the whole conversion lands on a snapshot and is kept
  //      only if connectivity is unchanged in COMPONENT COUNT, no rule got worse, and the walkable
  //      total grew by exactly the number of tiles converted. Otherwise the map is left untouched.
  // ⚠ CONVERTING A BAND CAN EXPOSE A NEW ONE. Turning a wall tile into floor gives its NEIGHBOURING
  //   wall tiles floor on a second side, so a tile that was not a band becomes one. MEASURED: a single
  //   pass took floor 1 from 33 to 14 having converted 22 — 33-22 is 11, and the extra 3 were created
  //   by the pass itself. So it runs to a FIXED POINT rather than once, and reports the rounds.
  //   Cf. [[gate-ran-harness-discarded-the-answer-2026-08-28]]: prove a fixed point, not one pass.
  function convertBands(map, rooms, opts) {
    const o0 = opts || {};
    const agg = { converted: 0, skipped: 0, refused: [], rolledBack: false, rounds: 0, before: null, after: null };
    for (let round = 0; round < 12; round++) {
      const r = _convertBandsOnce(map, rooms, o0);
      if (round === 0) { agg.before = r.before; agg.skipped = r.skipped; agg.refused = r.refused; }
      if (r.rolledBack) { agg.rolledBack = true; agg.why = r.why; break; }
      if (!r.converted) { agg.skipped = r.skipped; agg.refused = r.refused; break; }
      agg.converted += r.converted; agg.after = r.after; agg.rounds = round + 1;
      agg.skipped = r.skipped; agg.refused = r.refused;
    }
    return agg;
  }
  function _convertBandsOnce(map, rooms, opts) {
    const o = opts || {};
    const out = { converted: 0, skipped: 0, refused: [], rolledBack: false, before: null, after: null };
    if (!map || !map.length) { out.rolledBack = true; return out; }
    const W = map.length, H = map[0].length;
    const kindOf = new Map();
    if (Array.isArray(rooms)) for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i]; if (r && r.id !== undefined && r.id !== null) kindOf.set(r.id, r.kind || 'room'); }
    const isWalk = (c) => !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door' || /^stairs/.test(c.type || ''));   // stairs are floor — see validateGeometry's walk()
    const isDoorT = (c) => !!c && (c.type === 'shoji_door' || c.type === 'door');   // validateGeometry's isDoorC is scoped inside it [REF#DG-01166]
    const pick = [];
    for (let x = 1; x < W - 1; x++) for (let z = 1; z < H - 1; z++) {
      const c = map[x][z]; if (!c || c.type !== 'wall') continue;
      const ew = isWalk(map[x - 1][z]) && isWalk(map[x + 1][z]);
      const ns = isWalk(map[x][z - 1]) && isWalk(map[x][z + 1]);
      if (!ew && !ns) continue;
      const a = ew ? map[x - 1][z] : map[x][z - 1];
      const b = ew ? map[x + 1][z] : map[x][z + 1];
      const ra = (a && a.roomId !== undefined) ? a.roomId : null;
      const rb = (b && b.roomId !== undefined) ? b.roomId : null;
      // ⚠ A BAND TILE CAN BE A DOORWAY'S END-CAP, AND CONVERTING IT UNCAPS THE DOOR. `doorway-line` [REF#DG-01167]
      //   requires the wall to continue past BOTH ends of a door run; if this tile is that wall, the
      //   doorway loses its jamb and its orientation.
      //   ⛔ THIS TEST USED TO SIT **BELOW** THE ISLAND BRANCH, WHICH `continue`d PAST IT — so an
      //     island standing beside a door was converted without ever being asked. origamiunderworld-80
      //     built the synthetic case: one island end-cap made the WHOLE pass roll back on
      //     `doorway-line 0 -> 1`, so a single unchecked tile could cancel every legitimate
      //     conversion on the map. Hoisted above every branch: a door's wall is never eaten, and a
      //     tile that would eat one is SKIPPED rather than losing the round.
      if (isDoorT(map[x - 1][z]) || isDoorT(map[x + 1][z]) || isDoorT(map[x][z - 1]) || isDoorT(map[x][z + 1])) {
        out.skipped++; if (out.refused.length < 12) out.refused.push([x, z, 'door-cap', null]);
        continue;
      }
      if (ra === null || rb === null || ra === rb) {
        // ⚠ SAME ROOM ON BOTH SIDES USUALLY MEANS "CONVERTING DELETES A WALL" — the cabaret's own [REF#DG-01168]
        //   north wall reads this way, because the corridor north of it inherited roomId 1, and
        //   converting those tiles would open the room. Those stay, always.
        //   ⭐ BUT AN ISLAND IS NOT A WALL. A tile with WALKABLE ON ALL FOUR SIDES divides nothing —
        //     it is a lone PILLAR standing in open floor, and removing it removes a pillar, not a
        //     wall. That is literally Mark's first complaint in this whole thread (2026-08-29,
        //     "see the pillar looks? remove those from top down") and the last surviving `band` on
        //     floor 1 was exactly one: (60,62), corridor on N, S, E and W, seed-invariant.
        //   The distinction that makes this safe: a divider is part of a RUN, so it has at least one
        //   WALL neighbour. An island has none. Anything with a wall neighbour is refused as before.
        //   ⛔⛔ THAT ARGUMENT IS FALSIFIED AND THE HOLE IS STILL OPEN — MAP_HEALTH_CONTRACT §7.1.
        //     A 1-thick DIAGONAL wall has four walkable orthogonal neighbours at EVERY tile, so every
        //     tile of it reads as an "island". Measured by origamiunderworld-80 on a synthetic 24x24:
        //     ALL 6/6 diagonal tiles converted, components 1->1, no rollback, NO RULE FIRED. Four
        //     pillars spaced down a hall: all 4 removed — it cannot tell a colonnade from debris.
        //     **The component guard is blind to diagonals BY CONSTRUCTION, not by accident: a diagonal
        //     never blocks 4-connected movement, so it is a run to the EYE and not to the check.**
        //     It does no harm on the shipping floor TODAY only because the whole pass lands nothing
        //     there (§7.2) — that is LUCK, NOT SAFETY. To fix: make the island test see
        //     8-connectivity, or delete the branch.
        // ⭐ 8-CONNECTED, NOT 4 — a wall tile with a DIAGONAL wall neighbour is part of a run even
        //   though nothing blocks 4-connected movement. MEASURED on synthetics: a 6-tile diagonal
        //   reads 6 islands under the 4-connected test and 0 under this one, while a real 14-tile
        //   straight divider reads 0 under BOTH (so the fix does not cost a true negative).
        //   ⚠ IT ONLY HALF-CLOSES §7.1: a COLONNADE of spaced pillars still reads as 4 islands under
        //     both tests, because spaced pillars genuinely ARE isolated. Whether removing those is a
        //     defect or exactly what Mark asked for on 2026-08-29 ("see the pillar looks? remove
        //     those") is a DESIGN question and is not settled — so it stays reported in §7.1 rather
        //     than silently decided here.
        const island = isWalk(map[x - 1][z]) && isWalk(map[x + 1][z])
                    && isWalk(map[x][z - 1]) && isWalk(map[x][z + 1])
                    && !(map[x - 1][z - 1] && map[x - 1][z - 1].type === 'wall')
                    && !(map[x + 1][z - 1] && map[x + 1][z - 1].type === 'wall')
                    && !(map[x - 1][z + 1] && map[x - 1][z + 1].type === 'wall')
                    && !(map[x + 1][z + 1] && map[x + 1][z + 1].type === 'wall');
        if (!island) {
          out.skipped++; if (out.refused.length < 12) out.refused.push([x, z, ra, rb]);
          continue;
        }
        const _iSeg = (a && a.segmentId !== undefined) ? a.segmentId : (b && b.segmentId);
        pick.push([x, z, (ra !== null ? ra : rb), _iSeg]);
        continue;
      }
      // ⛔⛔ NEVER CONVERT A DESIGNED TILE. `counterWall` / `lowWall` mark a HALF-HEIGHT COUNTER — [REF#DG-01169]
      //   the teal reception counter between the entrance hall and the 番所, the one you meet a host
      //   or buy a ticket at. It is FURNITURE occupying a tile, not a wasted tile the seam model
      //   would replace, and it CANNOT be zero-thickness.
      //   ⚠ THIS IS A REGRESSION I SHIPPED AND MARK CAUGHT IN A SCREENSHOT, 2026-08-30: "the wall
      //     between hallway entrance and guard room = single wall half height, not two walls. In
      //     that area is supposed to be a teal wood counter." MEASURED: 8 of the 25 tiles this pass
      //     converted WERE the counter — (65,72)..(65,79), every one flagged `counterWall`. Turning
      //     them to floor made the two rooms adjacent, and the seam renderer then drew SEVEN
      //     FULL-HEIGHT dividers where a half-height counter had been. Floor-1 seam dividers went
      //     0 -> 27 because of this pass; 7 of them were that one boundary.
      //   The lesson, and it is the same one as the doorway end-cap one line below: A TILE THE
      //   DESIGN REQUIRES IS NOT A WASTED TILE. The band rule asks "could a zero-thickness divider
      //   stand here instead?" — for a door jamb and for a counter the answer is no.
      if (c.counterWall || c.lowWall) {
        out.skipped++; if (out.refused.length < 12) out.refused.push([x, z, 'designed-counter', null]);
        continue;
      }
      // the CORRIDOR side takes the tile, so no catalogued room footprint changes [REF#DG-01170]
      const aCor = kindOf.get(ra) === 'corridor', bCor = kindOf.get(rb) === 'corridor';
      let take, takeSeg;
      if (aCor && !bCor) { take = ra; takeSeg = a.segmentId; }
      else if (bCor && !aCor) { take = rb; takeSeg = b.segmentId; }
      else if (ra < rb) { take = ra; takeSeg = a.segmentId; }  // both rooms, or both corridors [REF#DG-01171]
      else { take = rb; takeSeg = b.segmentId; }
      // ⚠ CARRY THE SECTION TOO, NOT JUST THE ROOM. A wall tile has no `segmentId`, so converting it [REF#DG-01172]
      //   to floor without one produces a tile that is IN a room and IN no section — unaddressable.
      //   Caught by my own `address` pass on the first live boot after it was wired: 5 rooms and 2
      //   monsters went unaddressable, all standing on tiles this function had just created. That is
      //   the no-defaults rule earning its place — the alternative behaviour is `?? 0`, which would
      //   have put them in section 0, the heart, and the heart-clear would have deleted the monsters.
      pick.push([x, z, take, takeSeg]);
    }
    if (!pick.length) return out;
    // ⛔⛔ PER-TILE, NOT ALL-OR-NOTHING. Measured by origamiunderworld-80 and re-derived here on [REF#DG-01173]
    //   chain L1 seeds 12345/4242, identical: of the ~40 conversions this pass wants, **8 are
    //   individually safe and 32 are door-breakers** — 16 would break `doorway-line`, 6
    //   `doorway-joins`, 6 `door-placement`, and 4 merely expose a fresh band. All-or-nothing
    //   therefore converts NOTHING: one bad tile in the batch rolls back every good one, which is
    //   exactly what this pass did on every seed once the guard could finally see the damage.
    //   Per-tile turns "0 landed" into "8 landed, band 14 -> 6, zero damage".
    //   ⚠ 8 IS A CEILING, NOT A LOWER BOUND. They also tried giving the vacated tile to EITHER
    //     neighbour, since which room it joins can move a rule: still 8. This is not a chooser
    //     problem, so no amount of ordering cleverness buys more.
    //   ⛔ AND BAND 0 IS NOT REACHABLE ON THIS GENERATOR, BY CONSTRUCTION: the tile the `band` rule
    //     wants gone IS the wall the doorway needs. Two of Mark's own rules collide on this map.
    //     Accepting band 6 as chain L1's floor, or changing the generator he ordered preserved
    //     tile-for-tile, is HIS call — not something a pass gets to decide. STOP QUOTING BAND 0.
    const beforeCounts = _repairCounts(map), beforeReach = _repairReach(map);
    const _designBefore = _designCensus(map);
    for (let i = 0; i < pick.length; i++) {
      const p = pick[i];
      const cur = _repairCounts(map), curR = _repairReach(map);
      const snap = _repairSnapshot(map);
      const _patch = { type: 'floor', roomId: p[2] };
      if (p[3] !== undefined && p[3] !== null) _patch.segmentId = p[3];
      snap[p[0]][p[1]] = Object.assign({}, snap[p[0]][p[1]], _patch);
      const nxt = _repairCounts(snap), nxtR = _repairReach(snap);
      let worse = false;
      for (const k in Object.assign({}, cur, nxt)) if ((nxt[k] || 0) > (cur[k] || 0)) { worse = true; break; }
      // ⭐ AND NO DESIGN FLAG MAY BE LOST. The rule counts above cannot see a counter disappearing — [REF#DG-01174]
      //   that is exactly how the teal counter shipped as two full-height walls. §7.7.
      if (!worse && _designLost(_designBefore, snap).length) {
        out.skipped++; if (out.refused.length < 12) out.refused.push([p[0], p[1], 'would lose a design flag', null]);
        continue;
      }
      if (worse || nxtR.comps !== curR.comps || nxtR.total !== curR.total + 1) {
        out.skipped++; if (out.refused.length < 12) out.refused.push([p[0], p[1], 'per-tile verify', null]);
        continue;
      }
      for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) map[x][z] = snap[x][z];
      out.converted++;
    }
    out.before = beforeCounts; out.after = _repairCounts(map);
    return out;
  }

  // ══ THE ENTITY ADDRESS ══ floor → section → room, MINTED HERE AND NOWHERE ELSE. [REF#DG-01175]
  //    Mark 2026-08-30: "creator feature should understand each model needs this hierarchy: floor,
  //    section id, room id. doors, chests, beds, monsters, loot, traps, will all fall under this."
  //    Design AND its falsification: knowledge/design/ENTITY_ADDRESS_HIERARCHY_2026-08-30.md.
  //
  //    WHY, IN ONE LINE, BECAUSE THE REASON IS NOT TIDINESS: every defect this session was an
  //    ADDRESS MISMATCH — a door knew its room and not its section, a monster its section and not
  //    its room, and no two systems agreed on where anything was. Measured before this landed:
  //      pot/bed  floor+section+room (in an id STRING) · cot/barrel section+room · loot section only
  //      MONSTERS section only — 60/60 segmentId, 0/60 roomId, 0/60 floor · DOORS room only.
  //
  //    ⚠⚠ `sections` IS AN ARRAY, NOT A SCALAR, AND THAT IS THE FALSIFIED HALF OF THE DESIGN.
  //      MEASURED: on chain L2/L3/L4 the MAIN HALL spans sections {0,1,2} while its record says 0.
  //      It is the spine that CONNECTS sections, not a child of one, so a strict tree cannot express
  //      the floor Mark reaches second. Minting corridor ids does NOT fix it — tested. Anything with
  //      more than one section is a CONNECTOR and says so.
  //    ⚠ NO DEFAULTS, EVER. An entity that cannot be addressed is REPORTED, never given a fallback.
  //      `segmentId ?? 0` is what turns a missing address into section 0 — the heart — which the
  //      heart-clear then empties, so today an unaddressable monster is silently deleted rather than
  //      reported. A scheme that permits a default is not an address scheme.
  //    ⚠ SAFE TO CALL TWICE. `ord` is derived from a deterministic scan, not a counter, so re-running
  //      after a repair pass reproduces the same keys rather than renumbering them.
  function assignAddresses(map, rooms, floor, entityLists) {
    const out = { floor: floor, rooms: 0, doors: 0, entities: 0, connectors: 0, unaddressable: [] };
    if (!map || !map.length) { out.unaddressable.push('no map'); return out; }
    const W = map.length, H = map[0].length;
    const isDoorT = (c) => !!c && (c.type === 'shoji_door' || c.type === 'door');
    const walkC = (c) => !!c && (c.type === 'floor' || isDoorT(c));
    const key = (a) => 'F' + a.floor + '.S' + a.sections.join('+') + '.R' + a.room + (a.ord >= 0 ? '.' + a.ord : '');

    // ⛔ THIS BLOCK USED TO CALL ITS RESULT "the section SET" AND THAT WAS THE MISLABEL. What it reads [REF#DG-01176]
    //   off the tiles is `c.segmentId` — the STREAMING SEGMENT. The address's middle tier is the BUILT
    //   floor-plan section, which every room now carries as `sectionIndex` (see createRoom). The
    //   arithmetic proof and provenance are in the D1 entry of the DISABLED-FEATURES REGISTER.
    //   ⚠ THE SEGMENT READ IS KEPT, NOT DELETED, ON PURPOSE: `connector` — a space spanning more than
    //     one segment — is a real working capability and this map-walk is its only source. A per-room
    //     `sectionIndex` cannot express spanning, so dropping this walk would have silently deleted
    //     connector detection while looking like a rename. Segments keep their honest name here; the
    //     section tier comes from the record. [REF#DG-01176]
    const segsOf = new Map();
    for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
      const c = map[x][z];
      if (!walkC(c) || c.roomId === undefined || c.roomId === null) continue;
      if (!segsOf.has(c.roomId)) segsOf.set(c.roomId, new Set());
      segsOf.get(c.roomId).add(c.segmentId === undefined ? null : c.segmentId);
    }
    // ── THE SECTION TIER, ONE RESOLVER FOR ALL THREE ASSIGNERS ────────────────────────────────── [REF#DG-01432]
    //   ⛔ THE FIRST VERSION OF THIS FIX WAS 1-OF-3 AND THE AUTHOR WAS ME. This function assigns
    //     addresses in THREE places — rooms, doors, entities — and only the room half was re-pointed;
    //     doors and entities kept reading `c.segmentId` and calling it a section, with the door
    //     branch's own error message still reading "(no section)". An entity therefore carried a
    //     CORRECT `rtag.section` and a SEGMENT-based `e.address` at the same time, disagreeing.
    //   ⭐ THE TIER IS RESOLVED HERE, ONCE. A fourth assigner added later inherits it instead of
    //     re-deriving, which is the only thing that stops this class recurring.
    //   ⚠ Takes the GENERATOR's room id — what map cells and door owners both carry.
    const sectionOfGen = (genId) => {
        if (genId === undefined || genId === null) return null;
        const rid = _byGenId.get(genId);
        const r = rid ? _rooms.get(rid) : null;
        return (r && typeof r.sectionIndex === 'number') ? r.sectionIndex : null;
    };
    // the SEGMENTS a roomId occupies — honest name, unchanged behaviour, feeds `connector` only [REF#DG-01433]
    const segmentsFor = (roomId) => {
      const set = segsOf.get(roomId);
      if (!set || !set.size || set.has(null)) return null;      // unaddressable — report, never default [REF#DG-01177]
      return [...set].sort((a, b) => a - b);
    };

    // 1. ROOMS (and connectors — anything spanning more than one section) [REF#DG-01178]
    for (const r of _rooms.values()) {
      const segs = segmentsFor(r.genId);
      // THE ADDRESS'S SECTION TIER IS THE ROOM'S OWN sectionIndex, never its segment. [REF#DG-01434]
      // ⚠ FAIL-CLOSED: a room the generator never sectioned is REPORTED unaddressable rather than
      //   handed a plausible number. That is what keeps the zero-unaddressable gate meaningful — a
      //   gate that defaults its own answer cannot fail.
      const sec = (typeof r.sectionIndex === 'number') ? r.sectionIndex : null;
      if (sec === null) { out.unaddressable.push('room ' + r.roomId + ' (no sectionIndex from the generator)'); continue; }
      r.address = { floor: floor, sections: [sec], room: r.genId, ord: -1,
                    segments: segs,                              // the honest sibling, for spatial readers [REF#DG-01435]
                    connector: !!(segs && segs.length > 1) };    // spanning is a SEGMENT property [REF#DG-01436]
      r.address.key = key(r.address);
      if (r.address.connector) out.connectors++;
      out.rooms++;
    }

    // 2. DOORS — ord is the door's rank among its owner's doors by tile order, so it is stable [REF#DG-01179]
    const byOwner = new Map();
    for (const d of _doors.values()) {
      if (!byOwner.has(d.roomId)) byOwner.set(d.roomId, []);
      byOwner.get(d.roomId).push(d);
    }
    for (const [, list] of byOwner) {
      list.sort((a, b) => (a.tiles[0][0] - b.tiles[0][0]) || (a.tiles[0][1] - b.tiles[0][1]));
      for (let i = 0; i < list.length; i++) {
        const d = list[i], t = d.tiles && d.tiles[0];
        if (!t) { out.unaddressable.push('door ' + d.doorId + ' (no tiles)'); continue; }
        const c = map[t[0]] && map[t[0]][t[1]];
        const owner = roomById(d.roomId);
        // a door's section is its OWNER ROOM's section, not the segment its tile happens to stream in [REF#DG-01437]
        const dsec = owner ? ((typeof owner.sectionIndex === 'number') ? owner.sectionIndex : sectionOfGen(owner.genId)) : null;
        if (dsec === null) { out.unaddressable.push('door ' + d.doorId + ' (no sectionIndex on its owner room)'); continue; }
        d.address = { floor: floor, sections: [dsec], room: owner ? owner.genId : null, ord: i, connector: false,
                      segment: (c && c.segmentId !== undefined) ? c.segmentId : null };
        d.address.key = key(d.address);
        out.doors++;
      }
    }

    // 3. EVERYTHING ELSE PLACED ON THE MAP — monsters first, because they are the worst-addressed [REF#DG-01180]
    //    thing in the game today (section only) and the failure mode is a silently deleted spawn.
    if (Array.isArray(entityLists)) for (const list of entityLists) {
      if (!Array.isArray(list.items)) continue;
      const ordOf = new Map();
      const sorted = list.items.slice().sort((a, b) => ((a.x | 0) - (b.x | 0)) || ((a.z | 0) - (b.z | 0)));
      for (const e of sorted) {
        const ex = Math.round(e.x), ez = Math.round(e.z);
        const c = map[ex] && map[ex][ez];
        const esec = c ? sectionOfGen(c.roomId) : null;
        if (!c || c.roomId === undefined || c.roomId === null || esec === null) {
          out.unaddressable.push((list.kind || 'entity') + ' ' + (e.id || (ex + ',' + ez))
            + (c && c.roomId !== undefined && esec === null ? ' (no sectionIndex on room ' + c.roomId + ')' : ''));
          continue;
        }
        const k = c.roomId + '|' + (list.kind || 'e');
        const n = (ordOf.get(k) || 0); ordOf.set(k, n + 1);
        e.address = { floor: floor, sections: [esec], room: c.roomId, ord: n, connector: false,
                      segment: c.segmentId };   // the segment kept beside it, under its own name [REF#DG-01438]
        e.address.key = key(e.address);
        out.entities++;
      }
    }
    return out;
  }

  // ══ COLLIDER RULES — "THERE HAS TO BE AN OBJECT TO COLLIDE WITH FIRST" ═════════════════════════ [REF#DG-01181]
  // Mark 2026-08-31, verbatim: "any way you can make sure that we incorporate all collider rules
  // into the creator system? make sure that there has to be an object to collide with first."
  //
  // THE INCIDENT THAT EARNED IT, same day, like every other rule in this file. Four seams in
  // section 0 carried a movement collider with NO WALL DRAWN ON THEM — `2|5` at Z127 x50/51/52 and
  // `2|5` at X121 z57. The west corridor stood open to the outer ring on four tiles you could see
  // through and could not walk through. ⚠ AND THE CHECK THAT MISSED IT REPORTED "42 of 42 seams
  // walled, zero leaks", because it tested COLLIDERS and every collider was present. **A collider
  // and a surface are two different objects.**
  //
  // ⚠ WHY THIS TAKES EVIDENCE INSTEAD OF A MAP, WHICH IS THE WHOLE POINT OF THE RULE. Every other
  //   rule here grades `map`. Colliders and wall surfaces do not exist in the map — they are BOTH
  //   produced at render time, and the map cannot answer "is a wall drawn here". A map-graded
  //   version of this rule would be green on exactly the floor that shipped the four holes: the
  //   "gates grade the generator, not the live map" trap. So Creator OWNS THE RULE and the engine
  //   supplies the measurement (`window._auditColliderSurfaces`, Origami.RealityEngine.9.html), carried
  //   between them by `scripts/gate-collider-surface.js`.
  //
  // ⚠ IT FAILS CLOSED. No evidence, malformed evidence, or ZERO colliders swept all return a
  //   violation, never a pass. A rule that answers "clean" because nobody measured is the vacuous
  //   green this repo has been bitten by repeatedly — a zero from an absent measurement is
  //   indistinguishable from health, so it is not allowed to look like health.
  const COLLIDER_RULES = [
    'collider-surface',   // 2026-08-31 a collider with nothing drawn on it — an invisible barrier [REF#DG-01182]
    'collider-evidence',  // the measurement itself is missing/empty — fail, never pass [REF#DG-01183]
  ];

  // evidence: { total, withSurface, orphans, list:[{axis,plane,lo,hi}], surfaces } [REF#DG-01184]
  //           — exactly what window._auditColliderSurfaces() returns on a booted engine.
  function validateColliders(evidence) {
    const out = [];
    const push = (rule, msg, severity) => out.push({ rule: rule, msg: msg, at: null, severity: severity || 'fail' });
    const e = evidence;
    if (!e || typeof e !== 'object') {
      push('collider-evidence', 'no collider audit was supplied. This rule cannot be graded from the map — '
        + 'boot the engine and pass window._colliderAudit. Absent evidence is a FAIL, not a pass.');
      return out;
    }
    if (typeof e.total !== 'number' || typeof e.orphans !== 'number') {
      push('collider-evidence', 'collider audit is malformed (expected numeric `total` and `orphans`, got '
        + JSON.stringify(Object.keys(e)) + ').');
      return out;
    }
    if (e.total === 0) {
      push('collider-evidence', 'the audit swept ZERO colliders. On any real floor that means the sweep '
        + 'ran before the walls were built, not that the floor is clean — a zero from an absent '
        + 'measurement is indistinguishable from health.');
      return out;
    }
    if (typeof e.surfaces === 'number' && e.surfaces === 0) {
      push('collider-evidence', 'the audit swept ' + e.total + ' collider(s) but ZERO wall surfaces. '
        + 'The surface selector found nothing; every collider would read orphaned for lack of a '
        + 'measurement. Fix the sweep before reading the result.');
      return out;
    }
    for (const o of (e.list || [])) {
      push('collider-surface', 'collider on ' + o.axis + '=' + o.plane + ' spanning ' + o.lo + '..' + o.hi
        + ' has NO WALL SURFACE — an invisible barrier: it cannot be walked through and cannot be seen. '
        + 'A collider must have an object to collide with (Mark 2026-08-31).');
    }
    if (e.orphans > (e.list || []).length) {
      push('collider-surface', '… and ' + (e.orphans - (e.list || []).length) + ' more not listed.');
    }
    return out;
  }

  // ── SECTION_MODEL — THE ONE STATEMENT OF WHAT A FLOOR'S SECTIONS ARE ───────────────────────── [REF#DG-01376]
  //    `role` is what a section IS; `activate` is whether the player switches it on. Everything that
  //    prints the model reads SECTION_MODEL_SENTENCE so the wording cannot drift between callers.
  const GUARDROOM_SECTION = 4;
  // ── SECTION_SPECIAL_POOL — THE THREE BUILDINGS DEALT ACROSS SECTIONS 1-3 ────────────────────── [REF#DG-01310]
  //    Mark 2026-09-03: "cafeteria + storage + factory. these rooms will be randomly located in
  //    sections 1-3, ok? got it? rng placement in those 3 sections for these floors."
  //    ⛔ SUPERSEDED the fixed 1:cafeteria · 2:factory · 3:storage mapping FOR SECTIONS 1-3. Section
  //      4 is NOT in this pool — it is the guardroom, fixed, and it is not dealt to anybody.
  //    ⚠ THE COMPASS IS UNTOUCHED. `SECTION_DIRECTION` still says 1=WEST 2=NORTH 3=EAST. A section's
  //      DIRECTION is who it is; its special is what it HOLDS. Dealing the buildings does not move
  //      the sections, and nothing here may start writing to that table.
  const SECTION_SPECIAL_POOL = ['cafeteria', 'factory', 'storage'];

  // ── FLOOR_SPECIAL_POOLS — EACH FLOOR DEALS ITS OWN TRIO (Mark 2026-09-11: "fix floor 2 with its own [REF#DG-01992]
  //    unique special rooms"; MASTER_DUNGEON_PLAN F12: "every dungeon level has an authored building
  //    catalog; RNG varies the valid layout, never the required building identities") ─────────────
  //    MEASURED before this table existed, floor 2 on three seeds: sections 1-3 were dealt the FLOOR-1
  //    trio (cafeteria/factory/storage) again, and the 09-08 filler catalogue rooms that did get carved
  //    (bathhouse, armory, archery, prison) shipped as `room`s named "Water Torture Room" / "Stone
  //    Cell" because the adapter had no branch for them — the building existed in the carve grid and
  //    was invisible to everything that reads a room record. So floor 2 is the guards' floor: the
  //    ARMORY, the ARCHERY RANGE and the PRISON, one per wing, dealt by the same seeded shuffle.
  //    ⚠ ONLY FLOOR 2 IS AUTHORED HERE. Floors without a row fall back to SECTION_SPECIAL_POOL and
  //      `specialPoolFor` says so in its result (`authored:false`); the per-floor catalogue for 3-6 is
  //      Mark's to write (F7 = Casino Royale is already his), not a seat's to invent. Every tag here
  //      MUST be a key of SPECIAL_ROOM_META, or the adapter cannot carry it — `specialPoolFor` throws
  //      on an unknown tag so a typo cannot ship a nameless room.
  const FLOOR_SPECIAL_POOLS = { 2: ['armory', 'archery', 'prison'] };
  /** The trio sections 1-3 deal on `level` (a copy). Unknown level → the default trio. [REF#DG-01993] */
  function specialPoolFor(level) {
    const lvl = Number(level) | 0;
    const pool = FLOOR_SPECIAL_POOLS[lvl] ? FLOOR_SPECIAL_POOLS[lvl].slice() : SECTION_SPECIAL_POOL.slice();
    for (const t of pool) if (!SPECIAL_ROOM_META[t]) throw new Error('Creator.specialPoolFor: floor ' + lvl + ' names `' + t + '`, which is not in SPECIAL_ROOM_META — nothing could carve or name it');
    return pool;
  }
  /** Was this floor's trio authored (a FLOOR_SPECIAL_POOLS row) or the default? [REF#DG-01994] */
  function specialPoolAuthored(level) { return !!FLOOR_SPECIAL_POOLS[Number(level) | 0]; }

  /** [REF#DG-01310]
   * Deal the three specials across sections 1-3 for one floor. Same (seed, level) → same deal, every
   * time, in every process: the gate, the generator and a reload must agree or a saved floor comes
   * back with its buildings shuffled.
   * ⚠⚠ IT USES ITS OWN GENERATOR AND DRAWS NOTHING FROM THE MAP RNG, AND THAT IS THE WHOLE POINT.
   *   The generator's `_rand()` stream is a CONTRACT: draw order is part of the seed, so a new
   *   consumer inserted before the existing draws re-shuffles every floor layout ever shipped from
   *   that seed. This derives an independent mulberry32 from (seed, level) instead, so the map RNG
   *   is consumed in exactly the same order, the same number of times, as before this existed.
   * ⚠ `level` IS MIXED IN so two floors of one run do not get the same deal.
   */
  function dealSectionSpecials(seed, level) {
    let h = ((seed >>> 0) || 0x12345678) ^ (((level | 0) + 1) * 0x9E3779B1);
    h = (h ^ 0x5bf03635) >>> 0;
    const next = () => {                                   // mulberry32, private to this deal [REF#DG-01395]
      h = (h + 0x6D2B79F5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pool = specialPoolFor(level);                    // the floor's own trio (FLOOR_SPECIAL_POOLS), default trio otherwise [REF#DG-01995]
    for (let i = pool.length - 1; i > 0; i--) {            // Fisher-Yates, so every permutation is reachable [REF#DG-01396]
      const j = (next() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const out = {};
    for (let i = 0; i < pool.length; i++) out[i + 1] = pool[i];
    out[GUARDROOM_SECTION] = 'guard';
    return out;
  }

  const SECTION_MODEL = {
    0: { role: 'core',      activate: false, en: 'the core — entrance, cabaret, ring, dressing room, manager\'s office' },
    1: { role: 'activate',  activate: true,  en: 'a wing the player activates (WEST)' },
    2: { role: 'activate',  activate: true,  en: 'a wing the player activates (NORTH)' },
    3: { role: 'activate',  activate: true,  en: 'a wing the player activates (EAST)' },
    4: { role: 'guardroom', activate: false, en: 'the guardroom — the final section, unlocked once 1-3 are done' },
  };
  const SECTION_MODEL_SENTENCE = 'section 0 from the entrance and cabaret, plus sections 1-3 to '
    + 'activate, and once those are done the final section 4 (the guardroom)';

  // ── SECTION_RULES — WHAT A FLOOR AND ITS SECTIONS MUST SATISFY ───────────────────────────── [REF#DG-01264]
  //    These rules are stated in terms of the floor → section → room ADDRESS rather than in tile
  //    terms. Provenance for the rule family is in the DISABLED-FEATURES REGISTER at the top of
  //    NewOrigami.Engine9.html (entry dated 2026-09-02); this comment describes code only.
  //    ⚠ LIKE `validateColliders`, THIS GRADES EVIDENCE FROM A BOOTED ENGINE, NOT THE MAP ARRAY.
  //      Section membership is only final after `assignAddresses` has read it off the TILES, and a
  //      room record's own `sectionIndex` is not authoritative — 7 corridors on a procedural floor
  //      legitimately carry none. Grading the record instead of the address is the
  //      "gates grade the generator, not the live map" trap.
  //    ⚠ Absent evidence is graded as a failure rather than a pass: a zero produced by a
  //      measurement that did not run is indistinguishable from a zero produced by a clean floor.
  const SECTION_RULES = [
    'section-evidence',    // the audit did not run, or ran on nothing — fail closed [REF#DG-01265]
    'section-sequence',    // sections must run 0..N with NO GAP — the defect that hid section 4 [REF#DG-01266]
    'section-min-rooms',   // a section with fewer than 2 rooms is a corridor, not a place [REF#DG-01267]
    'section-room-band',   // rooms per section outside the configured band (severity: warn) [REF#DG-01268]
    'section-address',     // every room carries floor → section → room; unaddressable must be 0 [REF#DG-01269]
    'section-special',     // a section assigned a building must actually contain it [REF#DG-01270]
    'section-index-parity',// room records must carry the section the ADDRESS says they are in [REF#DG-01271]
  ];

  /** [REF#DG-01272]
   * Grade one floor's sections. `evidence` comes from a booted engine:
   *   { floor, bySection:{sec:count}, unaddressed, rooms, connectors, roomTypesBySection:{sec:[type]} }
   * `opts.authored` marks a HAND-AUTHORED floor (floor 1 / Section0.js), which is exempt from the
   * room-count band and from the multi-section expectation: it is an authored layout of 8 rooms in
   * one section, so a band derived from the procedural generator does not describe it.
   */
  function validateSections(evidence, opts) {
    const o = opts || {};
    const out = [];
    const push = (rule, msg, severity) => out.push({ rule: rule, msg: msg, at: null, severity: severity || 'fail' });
    const e = evidence;
    if (!e || typeof e !== 'object') {
      push('section-evidence', 'no section census was supplied. This rule cannot be graded from the map — '
        + 'boot the engine, run assignAddresses, and pass the census. Absent evidence is a FAIL.');
      return out;
    }
    const by = e.bySection;
    if (!by || typeof by !== 'object') {
      push('section-evidence', 'census is malformed (expected `bySection` as {sectionIndex: roomCount}, got '
        + JSON.stringify(Object.keys(e)) + ').');
      return out;
    }
    // numeric section keys only — a connector key like "0+1+2" is a ROOM spanning sections, not a section [REF#DG-01273]
    const secs = Object.keys(by).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    if (!secs.length) {
      push('section-evidence', 'the census found ZERO sections. On any real floor that means the sweep ran '
        + 'before the map was addressed, not that the floor has no sections.');
      return out;
    }

    // 1. SEQUENCE — 0..N with no gap. THIS IS THE RULE THAT WOULD HAVE CAUGHT SECTION 4. [REF#DG-01274]
    //    Measured 2026-09-02: floors 2 and 3 shipped sections 0,1,2,3 while SPECIAL_BUILDING
    //    assigned a building to section 4 — `_segmentCount = gates.length + 1` with three gates.
    //    A gap is never cosmetic: a section nothing can reach is a room set nobody will ever see.
    if (secs[0] !== 0) push('section-sequence', 'sections start at ' + secs[0] + ', not 0. Section 0 is the '
      + 'entrance section on every floor.');
    for (let i = 1; i < secs.length; i++) {
      if (secs[i] !== secs[i - 1] + 1) push('section-sequence', 'section ' + (secs[i - 1] + 1) + ' is MISSING — '
        + 'the floor jumps ' + secs[i - 1] + ' → ' + secs[i] + '. Either the topology cannot express it '
        + '(check gate count: _segmentCount = gates.length + 1) or its rooms failed to place.');
    }
    //    ⛔ SUPERSEDED 2026-09-03 by Mark: "remove that this floor has 5 sections, just say this [REF#DG-01274]
    //      floor
    //      has a section 0 from entrance,caberet, etc + sections 1-3 to activate, once done the final
    //      section 4 (guardroom) is activated" — the bare-count sentence is GONE. What replaced it
    //      names which modelled section is absent, because "4 section(s), expected 5" tells a reader
    //      the arithmetic and not which room set nobody will ever see.
    if (o.expectSections && secs.length !== o.expectSections) {
      const _missing = [];
      for (let _s = 0; _s < o.expectSections; _s++) if (secs.indexOf(_s) < 0) _missing.push(_s);
      const _extra = secs.filter(_s => _s >= o.expectSections);
      push('section-sequence', 'this floor addresses section(s) ' + secs.join(',') + '. The model is '
        + SECTION_MODEL_SENTENCE + '.'
        + (_missing.length ? (' MISSING: ' + _missing.map(_s => 'section ' + _s + ' — '
            + ((SECTION_MODEL[_s] && SECTION_MODEL[_s].en) || 'not in the model')).join('; ') + '.') : '')
        + (_extra.length ? (' NOT IN THE MODEL: section(s) ' + _extra.join(',')
            + ' — the model stops at ' + GUARDROOM_SECTION + '.') : ''));
    }

    // 2. MIN ROOMS — the generator already enforces >=2 structurally; this states it as a RULE so a [REF#DG-01275]
    //    future topology change cannot quietly ship a section that is just a stretch of corridor.
    //    ⛔ SUPERSEDED 2026-09-03 by Mark: "once done the final section 4 (guardroom) is activated"
    //      — THE SECTION-4 EXEMPTION IS BACK. It was removed on 2026-09-02, when his hand-drawn map
    //      put the guard room inside the core and no section was a single room any more. Section 4 is
    //      the guardroom again, it is one room, and one room is its DESIGN: it is the checkpoint the
    //      other three sections unlock, not a stretch of corridor that failed to grow.
    //    ⚠ WHAT THE 09-02 REMOVAL WAS PROTECTING, so it is not lost: an exemption outliving the order
    //      that created it is how a rule silently stops grading. This one is therefore keyed on
    //      `GUARDROOM_SECTION` — the same constant `SPECIAL_BUILDING` assigns the guard room to — so
    //      the day the guardroom stops being section 4 the exemption moves with it or disappears.
    //      It exempts ONE section, by number, and every other section still clears the >=2 floor.
    for (const sc of secs) {
      if (sc === GUARDROOM_SECTION) continue;          // the guardroom — one room by design [REF#DG-01275]
      const n = by[String(sc)] | 0;
      if (n < 2) push('section-min-rooms', 'section ' + sc + ' holds ' + n + ' room(s). A section with '
        + 'fewer than 2 rooms is a corridor, not a place.');
    }

    // 3. ROOM BAND — severity warn, deliberately: this is a design target, and a floor that misses [REF#DG-01276]
    //    it is thin rather than broken. Hand-authored floors are exempt (see `opts.authored`).
    //    ⛔ SUPERSEDED 2026-09-03 by Mark: "a section 0 from entrance,caberet, etc + sections 1-3 to
    //    activate, once done the final section 4 (guardroom) is activated" — the THREE-sections spec
    //    below is dead as a COUNT. The 4-6 +1/floor BAND it sets survives and still grades sections
    //    1-3; section 4 is the guardroom and is exempt (it is one room). Kept below because the band
    //    is the only place the wing sizes are written down:
    //    ⛔ SUPERSEDED 2026-09-02 (later the same day, by Mark's hand-drawn map): THREE sections per
    //    floor, each 6-8 rooms +1 per floor of depth, each with ONE special room. His words:
    //    "lets change it to 3 sections for floors. Each section will have 6-8 rooms +1 per floor.
    //    Each section has a special room."
    //      · section 0   = THE CORE, authored (Section0.js): cabaret · Starlette's dressing room ·
    //                      manager's office · the ring hallway · the guard room · the entrance.
    //                      Exempt — Mark drew it. ⛔ NOTE the guard room is INSIDE the core on this
    //                      map; the earlier "section 4 = the guard room alone, exactly 1 room" order
    //                      is DEAD, and with it the exactly-1 band and the min-rooms exemption.
    //      · the other three = 4-6 ROOMS TOTAL, the section's special among them, +1 per floor
    //        of depth. ⛔ A "6-8 plus a special = 7-9" reading stood here for one commit and was
    //        wrong: west/north/east each take 4-6, and the special is one OF those rooms.
    //                      They hang N / E / W off the ring, one spur and one door each.
    //    ⚠ THE SECTION NUMBERING IS NOT SETTLED AND IS NOT GUESSED HERE. The drawing labels the three
    //      spurs 2 (north), 3 (east) and 4 (west), with no section 1 shown — while an earlier order
    //      that day read "West = Section 1, NORTH = Section 2, East Section 3". Those disagree, and a
    //      set {0,2,3,4} also trips `section-sequence`, which requires 0..N with no gap. The band
    //      below therefore grades EVERY non-zero section the same way and does not care what they are
    //      numbered; the numbering question is Mark's and is open.
    {
      const depth = Math.max(0, ((typeof o.floor === 'number') ? o.floor : 1) - 1);
      const lo = ((typeof o.bandLo === 'number') ? o.bandLo : 4) + depth;
      const hi = ((typeof o.bandHi === 'number') ? o.bandHi : 6) + depth;
      for (const sc of secs) {
        if (sc === 0) continue;                          // the authored core — sized by its own layout [REF#DG-01298]
        if (sc === GUARDROOM_SECTION) continue;          // the guardroom — one room, not a wing [REF#DG-01298]
        const n = by[String(sc)] | 0;
        if (n < lo || n > hi) push('section-room-band', 'section ' + sc + ' holds ' + n + ' room(s), outside '
          + lo + '-' + hi + ' for floor ' + ((typeof o.floor === 'number') ? o.floor : '?')
          + ' (4-6 rooms per section including its special, +1 per floor of depth).', 'warn');
      }
    }

    // 4. ADDRESS — the whole point of the new system. [REF#DG-01277]
    if (typeof e.unaddressed !== 'number') {
      push('section-address', 'census does not report `unaddressed`; address completeness is ungraded, '
        + 'which is not the same as complete.');
    } else if (e.unaddressed > 0) {
      push('section-address', e.unaddressed + ' room(s) carry no floor → section → room address. '
        + 'An unaddressable room cannot be saved, referenced, or reached by name.');
    }

    // 5. SPECIAL BUILDING — every section that is meant to hold a building must hold one. [REF#DG-01278]
    //    ⛔ SUPERSEDED 2026-09-03 by Mark: "cafeteria + storage + factory. these rooms will be
    //      randomly located in sections 1-3 … rng placement in those 3 sections" — so the rule can no
    //      longer ask "does section 2 hold a factory". It asks the question the order actually makes
    //      true: DO SECTIONS 1-3 HOLD ONE OF EACH, one per section, across the floor. The old line
    //      here ("a section the registry assigns a building must contain it") described the fixed
    //      mapping and would now fail every floor the deal shuffles, which is every floor.
    //    ⚠ SECTION 4 IS STILL GRADED THE OLD WAY, because it is not dealt: it is the guardroom, and
    //      `SPECIAL_BUILDING[4]` is the fixed answer. Folding it into the pool would let a floor pass
    //      by putting the guard post in section 1.
    //    ⚠ THE RULE DOES NOT KNOW THE DEAL AND MUST NOT. Grading against a re-derived deal would test
    //      whether the gate and the generator agree about a random number, not whether the FLOOR is
    //      right — and it would go green on a floor with three cafeterias if the deal said so. One of
    //      each, one per section, is a property of the map; the deal is an implementation detail.
    const rt = e.roomTypesBySection;
    if (!rt || typeof rt !== 'object') {
      // ⚠ UNGRADED IS NOT CLEAN, AND IT IS NOT A VIOLATION EITHER. `Creator.rooms()` records carry [REF#DG-01279]
      //   only generic kinds, so a caller that passes them cannot see `cafeteria` at all and would
      //   report every section as missing its building. Say the rule did not run.
      push('section-evidence', 'room types were not observable in this census, so `section-special` was '
        + 'NOT graded. An ungraded rule is not a passing rule — pass the generator room records '
        + '(the census that carries roomType) to grade it.', 'warn');
    } else {
      // (a) THE DEALT SECTIONS: 1-3 hold one of each of the pool, one per section. [REF#DG-01278]
      //     ⚠ ONLY THE SECTIONS THAT ACTUALLY EXIST ARE GRADED, and that is not a softening — it is
      //       the difference between a rule and a false alarm. My first version demanded all three
      //       buildings on EVERY floor and immediately reported three violations against the
      //       hand-authored floor-1 control (one section, no wings) and two against the connector
      //       control (sections 0 and 1 only). Both are floors where sections 2 and 3 do not exist,
      //       so the buildings that "went missing" had nowhere to be. The red-first controls caught
      //       it before it could grade a real floor — which is what they are in the list for.
      const _dealtSecs = secs.filter(sc => sc !== 0 && sc !== GUARDROOM_SECTION);
      const _dealt = [];
      // THE POOL IS THE FLOOR'S OWN (FLOOR_SPECIAL_POOLS). `o.floor` is what gate-floor-sections passes; [REF#DG-01996]
      // without it the default trio is graded, which is exactly what floors 1 and 3+ deal today.
      const _POOL = specialPoolFor(o.floor);
      for (const sc of _dealtSecs) {
        if (!_POOL.length) break;
        const have = rt[String(sc)] || [];
        const mine = _POOL.filter(t => have.indexOf(t) >= 0);
        if (!mine.length) {
          push('section-special', 'section ' + sc + ' holds none of ' + _POOL.join('/')
            + ' — every section 1-3 gets one of the three (has: ' + (have.join(', ') || 'nothing') + ').');
        } else if (mine.length > 1) {
          // Two specials in one section means another section has none, and the pair-wise report is [REF#DG-01398]
          // what names the room that has to move rather than just the section that is short.
          push('section-special', 'section ' + sc + ' holds ' + mine.length + ' of the three specials ('
            + mine.join(', ') + '). One per section — a section holding two is why another holds none.');
        }
        for (const t of mine) _dealt.push(t);
      }
      // (b) ONE OF EACH ACROSS THE FLOOR. A floor can pass (a) with three cafeterias. [REF#DG-01278]
      //     ⚠ A DUPLICATE IS ALWAYS WRONG; A MISSING BUILDING IS ONLY WRONG WHEN THERE WAS A SECTION
      //       TO PUT IT IN. So the duplicate test is unconditional and the completeness test runs
      //       only once the floor has at least as many dealt sections as the pool has buildings.
      for (const t of _POOL) {
        const n = _dealt.filter(x => x === t).length;
        if (n > 1) push('section-special', n + ' sections hold a `' + t + '`. The three specials '
          + 'are dealt one each; a duplicate means one of the other buildings never got placed.');
        else if (n === 0 && _dealtSecs.length >= _POOL.length) {
          push('section-special', 'no section holds a `' + t + '`. Sections 1-3 take one each of '
            + _POOL.join('/') + ' — the deal is random, the SET is not.');
        }
      }
      // (c) THE GUARDROOM IS NOT DEALT — fixed, and graded against the registry as before. [REF#DG-01278]
      if (secs.indexOf(GUARDROOM_SECTION) >= 0) {
        const want = SPECIAL_BUILDING[GUARDROOM_SECTION];
        const have = rt[String(GUARDROOM_SECTION)] || [];
        if (want && want !== 'room' && have.indexOf(want) < 0) {
          push('section-special', 'section ' + GUARDROOM_SECTION + ' is the guardroom and must hold a `'
            + want + '` room (has: ' + (have.join(', ') || 'nothing') + '). This one is not dealt.');
        }
      }
    }
    // 6. INDEX PARITY — the address is derived from TILES; consumers read a FIELD on the room [REF#DG-01280]
    //    record. When those disagree, the map is correct and every section-aware feature is dark.
    //    MEASURED 2026-09-02, floor 2: `sectionIndex` was **undefined on all 22 rooms** while
    //    `segmentId` read 0-4 and matched the address exactly. The engine's own worker-icon pass
    //    logged "0 spot(s) on a section-less floor (no rooms in sections 1-4)" on a floor whose
    //    address census showed five populated sections. A geometrically correct floor can still be
    //    section-less to the code that reads it.
    //    ⚠ GRADE THE FIELD THE CONSUMERS READ. An earlier draft of this rule counted records
    //      carrying EITHER `sectionIndex` OR `segmentId` — and `segmentId` was already 22/22 when the
    //      floor was section-less, so that rule was satisfied by the very map that had the defect and
    //      would never have fired. `sectionIndex` is what the engine's section-aware passes read.
    if (typeof e.recordsWithSectionIndex === 'number' && typeof e.recordCount === 'number' && e.recordCount > 0) {
      const n = e.recordsWithSectionIndex;
      if (n === 0) {
        push('section-index-parity', 'NONE of the ' + e.recordCount + ' room record(s) carry `sectionIndex`, '
          + 'though the tiles resolve ' + secs.length + ' section(s). Every consumer that reads the RECORD '
          + 'rather than the address sees a section-less floor, whatever the map looks like.');
      } else if (n < e.recordCount) {
        push('section-index-parity', (e.recordCount - n) + ' of ' + e.recordCount + ' room record(s) carry no '
          + '`sectionIndex` while the tiles place them in a section.', 'warn');
      }
    }
    // 7. TILE PARITY — THE ANTI-FICTION RULE, AND IT APPLIES TO AUTHORED FLOORS TOO. [REF#DG-01299]
    //    A room record can say `sectionIndex: 3` while every tile under it carries `segmentId 0`.
    //    When that happens the floor LOOKS built — logs name the sections, records enumerate them,
    //    room types line up — and the map has ONE section. Section culling, gates, keys and every
    //    section-aware pass see one section, because they read the tiles.
    //    MEASURED 2026-09-02 on floor 1: **593 of 593 walkable tiles carried segmentId 0**, tile-derived
    //    rooms-per-section was `{0: 17}`, while the records claimed `{0:9, 1:2, 2:2, 3:2, 4:2}`.
    //    ⚠ THE AUTHORED EXEMPTION MUST NOT COVER THIS ONE. Every other rule here skips a hand-authored
    //      floor because a generator's band does not describe a drawn map. This rule is not about
    //      quantity — it asks whether the sections a floor CLAIMS are present in its geometry, which
    //      is true of an authored floor exactly as much as a generated one. Exempting it is what let
    //      a floor report clean while four of its five sections existed only in room records.
    if (e.recordSections && typeof e.recordSections === 'object') {
      const claimed = Object.keys(e.recordSections).filter(k => /^\d+$/.test(k)).map(Number);
      const onTiles = new Set(secs);
      const ghosts = claimed.filter(c => !onTiles.has(c));
      if (ghosts.length) {
        push('section-tile-parity', 'section(s) ' + ghosts.join(', ') + ' exist in the ROOM RECORDS but have '
          + 'ZERO tiles on the map (tiles resolve only ' + secs.join(', ') + '). The rooms may be built, but '
          + 'their tiles were never stamped with a section, so every section-aware system sees one section. '
          + 'A floor in this state reports itself finished and is not.');
      }
    }
    // 8. DIRECTION — "1 west 2 north 3 east" is a GEOMETRY order, and nothing else here tests it. [REF#DG-01300]
    //    ⚠ THE GAP THIS CLOSES, MEASURED 2026-09-02: sections 1/2/3 carried the right BUILDINGS
    //      (cafeteria / factory / storage) and every other rule passed, while their tiles sat EAST,
    //      EAST and WEST — two of the three in the SAME direction, which is the "every special
    //      stuffed into one place" shape reported from the floor. A gate that grades numbers
    //      and buildings but never asks WHERE a section is goes green on exactly that map.
    //    Direction is measured from TILE CENTROIDS against the core anchor, never from a table or a
    //    `host:` field — a table is precisely what is in doubt when this rule is worth running.
    const _wantDir = e.sectionDirections || SECTION_DIRECTION;
    if (!e.sectionCentroids || !e.anchor || typeof e.anchor.x !== 'number') {
      // ⚠ UNGRADED IS NOT CLEAN. Without centroids this rule silently passes, which is the exact [REF#DG-01308]
      //   vacuous-green it exists to prevent — say so instead of scoring the floor as correct.
      push('section-evidence', 'no section centroids/anchor in this census, so `section-direction` was '
        + 'NOT graded. A floor can carry the right buildings under the right numbers and still have '
        + 'every section in the wrong place.', 'warn');
    } else {
      for (const sc of secs) {
        const c = e.sectionCentroids[String(sc)];
        const expect = _wantDir[sc];
        if (!c || !expect) continue;                    // the core has no direction of its own [REF#DG-01309]
        const dx = c[0] - e.anchor.x, dz = c[1] - e.anchor.z;
        const actual = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'EAST' : 'WEST')
                                                    : (dz > 0 ? 'SOUTH' : 'NORTH');
        if (actual !== expect) push('section-direction', 'section ' + sc + ' lies ' + actual + ' of the core '
          + '(centroid ' + c[0] + ',' + c[1] + ' vs anchor ' + e.anchor.x + ',' + e.anchor.z + ') but must be '
          + expect + '. The building and the number can both be right while the section is in the wrong place.');
      }
    }
    return out;
  }

  // ── SPECIAL_BUILDING — THE ONE REGISTRY OF WHICH SECTION GETS WHICH BUILDING ──────────────── [REF#DG-01281]
  //    The order behind this move, and who gave it, is recorded in the DISABLED-FEATURES REGISTER at
  //    the top of NewOrigami.Engine9.html (entry dated 2026-09-01). This comment describes code only.
  //    THIS TABLE EXISTED TWICE — `DungeonChain.js` :1561 (quadrant packer) and :2660 (spine packer),
  //    identical literals. Two copies of a table that is actively being edited is a drift waiting to
  //    happen. Both call sites now read THIS one.
  //    ⚠ SECTIONS 3 AND 4 ARE DELIBERATELY STILL 'room', AND THAT IS NOT AN OVERSIGHT.
  //      The assignment 3 = storage/倉庫 and 4 = guardroom/番所 is recorded in that same register
  //      entry, but MEASURED 2026-09-01: `storage` and `guardroom` have ZERO references in the
  //      generator — they are not
  //      buildable carve types (cafeteria 5 · factory 5 · casino 12 · storage 0 · guardroom 0).
  //      Naming a building nothing can build is how a random substitute ships silently; DungeonChain
  //      already records that exact failure for the Sleeping Ward. The rows land the day the carve
  //      types exist, and that is a one-line change here.
  //    ⚠ ROOM_META is what the ADAPTER needs, kept beside the assignment so the two cannot disagree.
  //      Its two rows mirror `DungeonChain.js` :3610-3611 exactly.
  // ── WHICH DIRECTION EACH SECTION MUST LIE IN (Mark's map, 2026-09-02: "1 west 2 north 3 east") ──
  //    ⚠ THERE IS DELIBERATELY NO ROW FOR 4, AND `section-direction` SKIPS ANY SECTION THIS TABLE [REF#DG-01310]
  //      DOES NOT NAME. The 2026-09-03 order names section 4's identity (the guardroom) and says
  //      nothing about where it lies; on floor 1 the 番所 is the core's own checkpoint, not a compass
  //      spur. A row invented here would grade every floor against a direction nobody specified.
  const SECTION_DIRECTION = { 1: 'WEST', 2: 'NORTH', 3: 'EAST' };

  // ⛔ SUPERSEDED 2026-09-03 by Mark: "sections 1-3 to activate, once done the final section 4 [REF#DG-01310]
  //    (guardroom) is activated, after this the Tower Defense portion of the game is activated" —
  //    SECTION 4 IS BACK AND IT IS THE GUARDROOM. What died with it: the 2026-09-02 line that stood
  //    here ("SECTION 4 REMOVED … there is no section 4 and the guard room sits inside the core"),
  //    the 09-02 order "we removed section 4 = that is permanent at this point until I say
  //    otherwise", and the three-section count.
  //    ⚠ WHAT THE DEAD LINE WAS PROTECTING, so it is not lost: nothing here may name a building the
  //      generator cannot carve. That still holds, and it is why the row below reads `guard` and not
  //      `guardroom`. MEASURED 2026-09-03: the string 'guardroom' has ONE reference in the whole
  //      tree — the commented-out META row below — while `guard` is a live carve type (the adapter
  //      branch in DungeonChain.js stamps roomType 'guard' + isGuardRoom, and Section0.js builds one
  //      on floor 1). Assigning 'guardroom' would name a building nothing can build.
  //    ⚠ THE CASINO STILL HAS NO SECTION. It was section 4's building before 09-02; section 4 is back
  //      but Mark has now named it the GUARDROOM, so the casino is still unplaced. Reported, not
  //      reassigned here — inventing a home for it is how an unrequested building ships.
  //    ⚠⚠ OPEN, AND MARK'S TO RULE, NOT A SEAT'S TO INVENT: the 09-03 番所/倉庫 merge moved section
  //      3's special INTO the guard room, so `SPECIAL_BUILDING[3] = 'storage'` now names a building
  //      section 3 does not contain on any floor. The row is DELIBERATELY LEFT so `section-special`
  //      keeps reporting it. Deleting the row would make the gate green over a section with no
  //      special at all.
  //    ⚠ SECTION_MODEL / SECTION_MODEL_SENTENCE / GUARDROOM_SECTION are declared ABOVE
  //      `validateSections`, not here beside the table they belong to, and that is deliberate:
  //      `validateSections` reads all three, esbuild demotes `const` to `var` in the public build,
  //      and a `const` declared below its reader turns a dev-tree TDZ throw into a live `undefined`
  //      read in the dist. Declaration order is the only thing that prevents it.
  const SPECIAL_BUILDING = { 1: 'cafeteria', 2: 'factory', 3: 'storage', 4: 'guard' };
  const SPECIAL_ROOM_META = {
    cafeteria: { flag: 'isCafeteria', roomType: 'cafeteria', roomName: '食堂', roomNameEn: 'Cafeteria' },
    factory:   { flag: 'isFactory',   roomType: 'factory',   roomName: '工場', roomNameEn: 'Factory'   },
    storage:   { flag: 'isStorage',   roomType: 'storage',   roomName: '倉庫', roomNameEn: 'Warehouse' },   // [REF#DG-01282]
    // THE CARVE TYPE IS `guard`, NOT `guardroom`, and the difference is the whole reason this row [REF#DG-01311]
    // sat commented out for two days: 'guardroom' has no carve branch anywhere, 'guard' has one.
    guard:     { flag: 'isGuardRoom',  roomType: 'guard',     roomName: '番所', roomNameEn: 'GUARDPOST' },

    // ── THE FILLER CATALOGUE (Mark 2026-09-08) ──────────────────────────────────────────────── [REF#DG-01500]
    //    "add those fillers: archery, bathhouse ... armory, 7-11 store, casino, factory 2,
    //     factory 3, etc - bigger for each level, succubus rooms, prison, graveyard, all rooms
    //     dungeon keeper had."
    //    These are NOT section buildings. `SPECIAL_BUILDING` still names ONE building per section
    //    (cafeteria/factory/storage/guard) and nothing here changes that — a filler is a room the
    //    core section can be furnished WITH, which is why none of them appear in that table. The
    //    demotion pass in DungeonChain only rewrites a room whose type is some OTHER section's
    //    building, so an unclaimed type like `bathhouse` is left alone by design.
    archery:   { flag: 'isArchery',   roomType: 'archery',   roomName: '弓道場',   roomNameEn: 'Archery Range' },
    bathhouse: { flag: 'isBathhouse', roomType: 'bathhouse', roomName: '風呂場',   roomNameEn: 'Bathhouse' },
    armory:    { flag: 'isArmory',    roomType: 'armory',    roomName: '武具庫',   roomNameEn: 'Armory' },
    konbini:   { flag: 'isKonbini',   roomType: 'konbini',   roomName: 'コンビニ', roomNameEn: '7-11 Store' },
    casino:    { flag: 'isCasino',    roomType: 'casino',    roomName: 'カジノ',   roomNameEn: 'Casino' },
    factory2:  { flag: 'isFactory2',  roomType: 'factory2',  roomName: '第二工場', roomNameEn: 'Factory 2' },
    factory3:  { flag: 'isFactory3',  roomType: 'factory3',  roomName: '第三工場', roomNameEn: 'Factory 3' },
    succubus:  { flag: 'isSuccubus',  roomType: 'succubus',  roomName: '夢魔の間', roomNameEn: 'Succubus Chamber' },
    prison:    { flag: 'isPrison',    roomType: 'prison',    roomName: '牢屋',     roomNameEn: 'Prison' },
    graveyard: { flag: 'isGraveyard', roomType: 'graveyard', roomName: '墓地',     roomNameEn: 'Graveyard' },
    // ── the Dungeon Keeper set, in his words "all rooms dungeon keeper had" ──────────────────── [REF#DG-01497]
    treasury:  { flag: 'isTreasury',  roomType: 'treasury',  roomName: '宝物庫',   roomNameEn: 'Treasury' },
    lair:      { flag: 'isLair',      roomType: 'lair',      roomName: '寝床',     roomNameEn: 'Lair' },
    hatchery:  { flag: 'isHatchery',  roomType: 'hatchery',  roomName: '孵化場',   roomNameEn: 'Hatchery' },
    training:  { flag: 'isTraining',  roomType: 'training',  roomName: '訓練場',   roomNameEn: 'Training Room' },
    library:   { flag: 'isLibrary',   roomType: 'library',   roomName: '書庫',     roomNameEn: 'Library' },
    workshop:  { flag: 'isWorkshop',  roomType: 'workshop',  roomName: '工房',     roomNameEn: 'Workshop' },
    torture:   { flag: 'isTorture',   roomType: 'torture',   roomName: '拷問室',   roomNameEn: 'Torture Chamber' },
    temple:    { flag: 'isTemple',    roomType: 'temple',    roomName: '神殿',     roomNameEn: 'Temple' },
    barracks:  { flag: 'isBarracks',  roomType: 'barracks',  roomName: '兵舎',     roomNameEn: 'Barracks' },
    scavenger: { flag: 'isScavenger', roomType: 'scavenger', roomName: '徴集室',   roomNameEn: 'Scavenger Room' },
  };

  // ── FILLER_ROOMS — what the CORE section (0) is furnished with, and the cure for a real bug ── [REF#DG-01501]
  //    MEASURED 2026-09-08, headless sweep of DungeonChain: 15.0% of floor-2 generations (9 of 60
  //    seeds) and 9.5% of floor 2+3 (19 of 200) FAILED TO GENERATE AT ALL. A rejection census over
  //    the 9 failing seeds put 18,000 of the rejections — 2000 retries x 9 seeds, i.e. EVERY single
  //    attempt — on one line (DungeonChain `perSeg` gate) and the reason was always the same:
  //    SECTION 0 HELD ZERO ROOMS. Sections 1-3 came back with 4-7 rooms each and section 4 with its
  //    guard, while the core had none, because section 0's own rooms (landing/cabaret/store) are
  //    added by the ADAPTER after generation — the carve-time gate cannot see them. A seed passed
  //    only when a leg room happened to attach to the head before the first gate.
  //    So the core is furnished deliberately instead of by luck. Mark's read on 09-08 — "probably [REF#DG-01501]
  //    because we didn't finish all the special rooms for each section, so add those fillers" —
  //    was the correct diagnosis.
  //    ORDER IS DELIBERATE: the first entries are small and almost always fit, so the guarantee
  //    lands early; the big showpieces come after and are allowed to fail.
  const FILLER_ROOMS = [
    { tag: 'konbini',   sizes: [[6, 6], [5, 5], [4, 4]] },
    { tag: 'bathhouse', sizes: [[8, 6], [6, 6], [5, 5], [4, 4]] },
    { tag: 'armory',    sizes: [[6, 6], [5, 5], [4, 4]] },
    { tag: 'archery',   sizes: [[12, 5], [10, 5], [8, 4], [6, 4]] },
    { tag: 'prison',    sizes: [[8, 6], [6, 6], [5, 4]] },
    { tag: 'graveyard', sizes: [[10, 8], [8, 6], [6, 5]] },
    { tag: 'casino',    sizes: [[14, 14], [12, 12], [10, 10], [8, 8]] },   // SQUARE (2026-09-16): the Casino Royale lounge model is 0.955 × 0.98 — an oblong room leaves bare tile strips beside it. Floor 7 only (fillerRoomsFor). [REF#DG-02071]
    { tag: 'succubus',  sizes: [[8, 8], [6, 6], [5, 5]] },
    { tag: 'treasury',  sizes: [[8, 6], [6, 5], [4, 4]] },
    { tag: 'barracks',  sizes: [[10, 6], [8, 6], [6, 5]] },
    { tag: 'library',   sizes: [[8, 8], [7, 6], [5, 5]] },
    { tag: 'temple',    sizes: [[10, 10], [8, 8], [6, 6]] },
    { tag: 'training',  sizes: [[10, 8], [8, 6], [6, 5]] },
    { tag: 'workshop',  sizes: [[8, 6], [6, 6], [5, 4]] },
    { tag: 'lair',      sizes: [[8, 8], [6, 6], [5, 5]] },
    { tag: 'hatchery',  sizes: [[8, 8], [6, 6], [5, 5]] },
    { tag: 'torture',   sizes: [[6, 6], [5, 5], [4, 4]] },
    { tag: 'scavenger', sizes: [[6, 6], [5, 5], [4, 4]] },
    { tag: 'factory2',  sizes: [[16, 16], [14, 14], [12, 12], [10, 10]] },
    { tag: 'factory3',  sizes: [[18, 18], [16, 16], [14, 14], [12, 12]] },
  ];

  /** Fillers available on `level`. "bigger for each level" (Mark 2026-09-08): a deeper [REF#DG-01502]
   *  floor gets MORE of the catalogue AND a larger room of each kind.
   *  ⚠ EACH `sizes` LADDER RUNS LARGEST -> SMALLEST and `_placeSpecial` takes the first that fits,
   *    so "bigger" means PREPENDING a bigger rung, never trimming the list. Trimming from the front
   *    removes the big rungs and makes deep floors SMALLER — which is what the first cut of this
   *    function did (L1 konbini 6x6 vs L5 konbini 4x4, exactly backwards) before it was measured.
   *    The authored ladder always stays on the end, so a cramped seed still degrades and places. */
  function fillerRoomsFor(level) {
    const lvl = Math.max(1, Number(level) || 1);
    const want = Math.min(FILLER_ROOMS.length, 3 + Math.max(0, lvl - 1) * 2);   // L1:3 L2:5 L3:7 … [REF#DG-01976]
    const scale = 1 + Math.min(0.60, 0.15 * (lvl - 1));                         // L1 1.00 … L5+ 1.60 [REF#DG-01977]
    // A building this floor DEALS to a wing is not also a filler — one armory per floor, and it is the [REF#DG-01997]
    // section's, not a spare copy wherever a hole fits (measured: the L2 filler slice began konbini,
    // bathhouse, armory, archery, prison — three of which floor 2 now deals).
    // And never `casino`: _buildLHalls already promotes one room per floor to the casino (its own
    // pick, ~:1430), so a filler casino is a SECOND casino — which the L3+ slice was already producing.
    const _dealt = specialPoolFor(lvl);
    // FLOOR 7 IS THE EXCEPTION (2026-09-16): its casino is the CASINO ROYALE — Mark's lounge model fitted to the room [REF#DG-02072]
    // (Engine9 _loadCasinoRoyale) — so on 7 the casino is CARVED as a building from this ladder (12×10, grown ×1.6 → 19×16
    // first) and _buildLHalls' L7 branch adopts that building instead of promoting a free room (measured 3×2 and 6×6).
    return FILLER_ROOMS.filter(f => _dealt.indexOf(f.tag) < 0 && (f.tag !== 'casino' || lvl === 7)).slice(0, want).map(f => {
      const [bw, bh] = f.sizes[0];
      const gw = Math.round(bw * scale), gh = Math.round(bh * scale);
      // prepend the grown rung only when it is actually bigger than the authored top rung [REF#DG-01978]
      const sizes = (gw > bw || gh > bh) ? [[gw, gh]].concat(f.sizes) : f.sizes.slice();
      return { tag: f.tag, sizes };
    });
  }
  // ── SPECIAL_SIZES — THE FOOTPRINT LADDER OF A DEALT SECTION BUILDING ────────────────────────── [REF#DG-01998]
  //    Largest first; `_placeSpecial` takes the first that fits. The three floor-1 ladders are the
  //    ones DungeonChain carried as literals (factory: Mark 2026-08-01 "SPECIAL EVENT ROOMS (FACTORY)
  //    CAFETERIA IS 15X6"). A building dealt to a WING is a landmark, so its ladder starts bigger than
  //    the same tag's filler ladder in FILLER_ROOMS — a 4x4 armory is a closet, not a section's reason
  //    to exist. A tag with no row here falls back to its FILLER_ROOMS ladder, then to 8x6.
  const SPECIAL_SIZES = {
    factory:   [[20, 20], [18, 18], [16, 16], [15, 15]],
    cafeteria: [[15, 6], [12, 6], [10, 6]],
    storage:   [[12, 8], [10, 8], [8, 8], [8, 6]],
    armory:    [[10, 8], [8, 8], [8, 6], [6, 6]],
    archery:   [[16, 6], [14, 6], [12, 5], [10, 5], [8, 4]],
    prison:    [[12, 8], [10, 8], [8, 6], [6, 6]],
  };
  /** Footprint ladder for a dealt building `tag` (a copy). [REF#DG-01999] */
  function specialSizesFor(tag) {
    if (SPECIAL_SIZES[tag]) return SPECIAL_SIZES[tag].map(s => s.slice());
    const f = FILLER_ROOMS.find(x => x.tag === tag);
    return f ? f.sizes.map(s => s.slice()) : [[8, 6], [6, 6]];
  }
  /** Which building section `s` gets, or 'room' when it has none. [REF#DG-01283] */
  function specialBuildingFor(s) { return SPECIAL_BUILDING[s] || 'room'; }

  const API = { createRoom, createDoor, createFeature, adopt, rooms, doors, features,
                roomById, doorById, featureById, doorsOfRoom, featuresOfRoom, roomByGenId,
                doorPane, doorContact, doorByTiles, doorTilesKey, KINDS,
                FEATURE_TYPES, validate, validateGeometry, accept, GEOMETRY_RULES, reset,
                validateColliders, COLLIDER_RULES,
                validateSections, SECTION_RULES,
                setRun, runSeed, floorSeed, rng, generateAccepted, acceptedAttempts, acceptedAttemptFor,
                roomTarget, repair, assignCorridorIds, convertBands, assignAddresses, validateSheathe,
                computeMapCensusDraft,
                SPECIAL_BUILDING, SPECIAL_ROOM_META, specialBuildingFor, SECTION_DIRECTION,
                FILLER_ROOMS, fillerRoomsFor,
                SECTION_MODEL, SECTION_MODEL_SENTENCE, GUARDROOM_SECTION,
                SECTION_SPECIAL_POOL, dealSectionSpecials,
                FLOOR_SPECIAL_POOLS, specialPoolFor, specialPoolAuthored, SPECIAL_SIZES, specialSizesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Creator = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
