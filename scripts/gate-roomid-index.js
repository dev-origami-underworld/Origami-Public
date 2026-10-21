#!/usr/bin/env node
/**
 * gate-roomid-index.js — THE ONE SENTENCE THE corridor-roomId CONTRACT RESTS ON:
 *
 *     `rooms` IS A DENSE ARRAY WHOSE INDEX IS THE roomId, AND EVERY TILE'S roomId IS A
 *     VALID INDEX INTO IT.
 *
 * That sentence is either true or it is a bug, which is why it belongs in a gate and not in
 * two seats' heads. TWO consumers index the array POSITIONALLY, so if it stops holding they
 * silently read the wrong record:
 *   · NewOrigami.Engine9.html ~:5268  `rooms?.[roomId]?.segmentId ... : -1`   ← SECTION CULLING
 *   · js/v8/map/DungeonChain.js ~:4220 `rooms_out[map[x][z].roomId]?.segmentId ?? 0`  ← spawn segment
 *
 * ⚠ IT IS ALREADY VIOLATED, TODAY, AND NOBODY HAS EVER SEEN IT — because BOTH call sites have
 *   a fallback that masks it. Engine9 drops to _segmentAtWorld; DungeonChain falls back to
 *   `?? 0` = segment 0 = THE HEART, which is then heart-cleared. So the failure mode is A SPAWN
 *   SILENTLY REMOVED. No crash, nothing red, nobody looks. (Found by origamiunderworld-12,
 *   2026-08-30; re-derived here independently before this gate was written.)
 *
 * SEVERITY IS DELIBERATELY SPLIT, and this is the part to read before "fixing" it:
 *   · FAIL on the generators that can SHIP the floor (chain, section0). The invariant must hold there.
 *   · WARN on the opt-in generators (emergency, test) — they are known-broken, the counts are printed
 *     rather than hidden, and a gate that is RED FROM BIRTH teaches people to ignore red. That lesson
 *     cost us `gate:doorwall` this same week.
 *   ⚠ IF AN OPT-IN GENERATOR IS EVER MADE THE DEFAULT FLOOR AGAIN, MOVE ITS SEVERITY TO 'fail' IN THE
 *     SAME COMMIT. "One flag away" is exactly how DungeonEmergency came to BE the floor for three days
 *     in August 2026 while this breakage sat in it unmeasured. The severity belongs to what SHIPS, not
 *     to what the file was called when the gate was written.
 *   ⚠ WARN IS NOT "FINE". `window._emergencyMap = true` and `?testmap=1` are each ONE FLAG away, and
 *     DungeonEmergency was the DEFAULT floor 1 for three days in August 2026.
 *
 * ALSO REPORTED (not asserted): doors touching TWO OR MORE distinct rooms. That is the tiebreak
 * question for door ownership — if a door adjoins two rooms, "the unique adjacent room" is not a
 * rule, it is a coin toss. Reported so the number is on the table before an ownership rule ships.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
if (typeof window === 'undefined') global.window = global;
try { global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js')); } catch (_) {}
try { global.Creator   = require(path.join(ROOT, 'js/v8/map/Creator.js')); } catch (_) {}

const GENS = [
  { name: 'chain',     rel: 'js/v8/map/DungeonChain.js',     levels: [1, 2, 3, 4], severity: 'fail' },
  { name: 'section0',  rel: 'js/v8/map/Section0.js',         levels: [1],          severity: 'fail' },
  { name: 'emergency', rel: 'js/v8/map/DungeonEmergency.js', levels: [1],          severity: 'warn' },
  { name: 'test',      rel: 'js/v8/map/DungeonTest.js',      levels: [1],          severity: 'warn' },
];
const walk   = (c) => !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door');

const isDoor = (c) => !!c && (c.type === 'shoji_door' || c.type === 'door');
// ⚰ `inRect` REMOVED 2026-08-31, NOT LEFT LYING AROUND. It was the whole defect: rect containment
//    answered "which declared rectangles cover this tile", and a hollow room's rect is a bounding box
//    over its neighbours. Kept as an unused helper in THIS file it would read as the house way to ask
//    about room membership, which is exactly how it got used. Membership is `tile.roomId`.

// ⛔ RED-FIRST FALSIFIER for the door-OWNERSHIP test. The rule it replaced asked "does this door
//   adjoin two rooms", which is what a door IS — measured by neighbour roomId that is true of 8/31/9/10
//   doors across the four generators, so phrased that way it can only fail everything or nothing. What
//   it fired on instead was `inRect` containment, and a HOLLOW room's declared rect is a bounding box
//   over other rooms: Section0's RING_BOX 15x15 encloses the whole core, so all 8 shipping doors read
//   as ties and the gate exited 1 on a correct floor.
//   Case A is the shape that used to FAIL and must now pass. Case D is a real defect the old predicate
//   could not see. B and C are the plain undetermined cases.
if (process.argv.indexOf('--selftest') >= 0) {
  const mk = (ownerOf) => {
    const W = 20, H = 20, m = [];
    for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
    for (let x = 2; x <= 8; x++)  for (let z = 2; z <= 8; z++) m[x][z] = { type: 'floor', roomId: 0 };
    for (let x = 9; x <= 15; x++) for (let z = 2; z <= 8; z++) m[x][z] = { type: 'floor', roomId: 1 };
    const d = { type: 'shoji_door' }; const o = ownerOf();
    if (o !== undefined) d.roomId = o;
    m[8][5] = d;
    return m;
  };
  // rooms 0 and 1 are ADJACENT and their rects do not overlap — so `inRect` sees the same 2 rooms the
  // tiles do, and the OLD predicate called every one of these a tie. The new one judges the owner.
  const rooms = [{ id: 0, x: 2, y: 2, w: 7, h: 7 }, { id: 1, x: 9, y: 2, w: 7, h: 7 }];
  const undetermined = (m) => {
    let n = 0;
    for (let x = 1; x < m.length - 1; x++) for (let z = 1; z < m[x].length - 1; z++) {
      const c = m[x][z]; if (!isDoor(c)) continue;
      const owner = (c.roomId === undefined || c.roomId === null) ? null : c.roomId;
      const nb = new Set();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = m[x + dx] && m[x + dx][z + dz];
        if (!t || t.type === 'wall' || t.type === 'rock' || t.type === 'void') continue;
        if (t.roomId !== undefined && t.roomId !== null) nb.add(t.roomId);
      }
      const known = owner !== null && rooms.some(r => r && r.id === owner);
      if (!known || !nb.has(owner)) n++;
    }
    return n;
  };
  const cases = [
    ['A door adjoining 2 rooms, owner stamped 0', () => 0,         0, 'PRE-FIX FAILED this — it is what a door IS'],
    ['B door with NO roomId at all',              () => undefined, 1, 'genuinely undetermined'],
    ['C owner names a room that does not exist',  () => 77,        1, 'genuinely undetermined'],
    ['D owner is real but NOT adjacent',          () => 1,         0, 'room 1 IS adjacent here — see note'],
  ];
  let ok = true;
  console.log('door-OWNERSHIP selftest');
  for (const [name, own, want, note] of cases) {
    const got = undetermined(mk(own)), pass = got === want;
    ok = ok && pass;
    console.log('  ' + (pass ? 'ok  ' : 'FAIL') + '  ' + name.padEnd(44) + 'undetermined ' + got
      + ', expected ' + want + '   (' + note + ')');
  }
  // D properly: an owner that is real but touches nothing here — the emergency (62,67) shape,
  // which the rect-based predicate could not express at all.
  {
    const m = mk(() => 0); m[8][5].roomId = 5;                     // room 5 exists nowhere near
    const roomsPlus = rooms.concat([{ id: 5, x: 17, y: 17, w: 2, h: 2 }]);
    const saved = rooms.length; rooms.push(roomsPlus[2]);
    const got = undetermined(m); rooms.length = saved;
    const pass = got === 1; ok = ok && pass;
    console.log('  ' + (pass ? 'ok  ' : 'FAIL') + '  E owner is a REAL room it does not touch      '
      + 'undetermined ' + got + ', expected 1   (emergency (62,67) owner=90 nbrs[0,4] — old rule was BLIND)');
  }
  console.log('');
  console.log(ok ? 'SELFTEST PASSED — a door is undetermined only when its stamped owner is missing, unreal, or not touched.'
                 : 'SELFTEST FAILED — do not trust the ownership count.');
  process.exit(ok ? 0 : 1);
}

const fails = [], warns = [];
for (const g of GENS) {
  let mod; try { mod = require(path.join(ROOT, g.rel)); } catch (e) { warns.push(`${g.name}: could not load — ${e.message.slice(0, 60)}`); continue; }
  const gen = mod && mod.generateDungeonMap;
  if (typeof gen !== 'function') { warns.push(`${g.name}: exposes no generateDungeonMap`); continue; }
  for (const L of g.levels) {
    let out;
    try { if (mod.setMapSeed) mod.setMapSeed(4242); out = gen(L, 128, 128); }
    catch (e) { (g.severity === 'fail' ? fails : warns).push(`${g.name} L${L}: threw — ${e.message.slice(0, 70)}`); continue; }
    if (!out || !out.map) { (g.severity === 'fail' ? fails : warns).push(`${g.name} L${L}: returned no map`); continue; }
    const rooms = out.rooms || [], map = out.map;

    let holes = 0; const holeAt = [];
    rooms.forEach((r, i) => { if (!r || r.id !== i) { holes++; if (holeAt.length < 4) holeAt.push(`idx${i}->id${r ? r.id : 'null'}`); } });

    let badTiles = 0; const badAt = [];
    for (let x = 0; x < map.length; x++) for (let z = 0; z < map[x].length; z++) {
      const c = map[x][z];
      if (!c || !walk(c) || c.roomId === undefined || c.roomId === null) continue;
      if (!Number.isInteger(c.roomId) || c.roomId < 0 || c.roomId >= rooms.length || !rooms[c.roomId]) {
        badTiles++; if (badAt.length < 3) badAt.push(`(${x},${z}) roomId=${c.roomId}`);
      }
    }

    // ⛔⛔ THIS TEST ASKED THE WRONG QUESTION TWICE OVER, AND FAILED THE SHIPPING FLOOR FOR IT.
    //   IT READ DECLARED RECTS. `inRect` asks which room RECTANGLES contain the neighbour. A HOLLOW
    //   room's declared rect is a BOUNDING BOX THAT CONTAINS OTHER ROOMS: Section0 builds its ring
    //   from four runs but publishes `RING_BOX {x:48,z:50,w:15,h:15}`, which encloses the entire core.
    //   So every core door "adjoined" the ring PLUS its two real rooms and all 8 read as ties. Same
    //   cause on emergency (8). This is the `room-ragged` lesson in a third place: MEASURE FROM THE
    //   TILES, NOT FROM THE DECLARED RECT. And chain's clean 0 was never evidence — chain's rects are
    //   convex and non-overlapping, so it passed for a reason unrelated to door ownership.
    //   ⚠ THE PREMISE WAS ALSO FALSE. The message said ownership "is a coin toss resolved only by an
    //   arbitrary lowest-id tiebreak". MEASURED across all four generators: ZERO door tiles are
    //   unstamped — every one carries its own `roomId`. There is no tiebreak in play; the answer is
    //   written on the tile. And "adjoins two rooms" cannot be the defect anyway: counted by neighbour
    //   roomId that is 8/31/9/10 — nearly every door on every generator — because ADJOINING TWO ROOMS
    //   IS WHAT A DOOR IS. A rule phrased that way can only ever fail everything or nothing.
    //   SO ASK THE QUESTION THE GATE ACTUALLY WANTS: is this door's owner DETERMINED? It is not, if
    //   the tile carries no roomId, or names a room that does not exist, or names a room it does not
    //   actually touch. That last case is real and the old predicate was blind to it:
    //     emergency (62,67) owner=90, neighbours are rooms [0,4] — room 90 is NOT adjacent.
    //   MEASURED after the change: section0 0 · chain 0 · test 0 · emergency 1 (that tile). The
    //   shipping floor now passes HONESTLY instead of failing for a bounding box, and a genuine
    //   ownership defect that reported nothing for its whole life now reports.
    //   Provable both ways: node scripts/gate-roomid-index.js --selftest
    let ties = 0; const tieAt = [];
    for (let x = 1; x < map.length - 1; x++) for (let z = 1; z < map[x].length - 1; z++) {
      const c = map[x][z]; if (!isDoor(c)) continue;
      const owner = (c.roomId === undefined || c.roomId === null) ? null : c.roomId;
      const nbrIds = new Set();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // ⚠ NOT `walk()` HERE — OWNERSHIP ADJACENCY IS BROADER THAN WALKABILITY, AND MY FIRST DRAFT
        //   OF THIS FIX GOT IT WRONG. `walk()` excludes `stairs_*`, so chain L2-L4's door (37,56)
        //   — owner 0, neighbours a wall, a wall, floor roomId 2, and **stairs_up roomId 0** — read
        //   as "owner not adjacent" and the shipping generator started failing on a tile that is
        //   perfectly correct. Any neighbouring tile that CARRIES a roomId is evidence of what this
        //   door touches, stairs included. Caught by a control moving that should not have moved.
        const n = map[x + dx] && map[x + dx][z + dz];
        if (!n || n.type === 'wall' || n.type === 'rock' || n.type === 'void') continue;
        if (n.roomId !== undefined && n.roomId !== null) nbrIds.add(n.roomId);
      }
      const known = owner !== null && rooms.some(r => r && r.id === owner);
      const touch = new Set();
      if (!known || !nbrIds.has(owner)) {
        // undetermined: record who it DOES touch, for the report
        rooms.forEach((r, i) => { if (r && nbrIds.has(r.id)) touch.add(i); });
        touch.add(-1);   // force the >= 2 branch below so the existing reporting path runs
      }
      if (touch.size >= 1 && (!known || !nbrIds.has(owner))) {
        touch.delete(-1);
        ties++;
        // ⚠ LABEL IN **ID SPACE**, NOT INDEX SPACE (origamiunderworld-12, 2026-08-30). This line used
        //    to print the ARRAY INDEX, and the two spaces DIVERGE PRECISELY ON THE GENERATORS THIS GATE
        //    EXISTS TO CATCH: on emergency, `rooms[0].id === 1` and `rooms[3].id === 90`, so the same
        //    door read `rooms[0,3]` here and `ids[1,90]` in their analysis. Two correct numbers that
        //    looked like a disagreement, on the one generator where being ambiguous is worst.
        //    A ROOM LABEL IS MEANINGLESS WITHOUT ITS SPACE — id space is what Creator records, tile
        //    roomId and the ownership rule all use, so index space is the odd one out.
        if (tieAt.length < 3) {
          const ids = [...touch].map(i => (rooms[i] && rooms[i].id !== undefined) ? rooms[i].id : `idx${i}?`);
          const diverges = [...touch].some(i => !rooms[i] || rooms[i].id !== i);
          tieAt.push(`(${x},${z})->ids[${ids.join(',')}]` + (diverges ? ` (indices[${[...touch].join(',')}])` : ''));
        }
      }
    }

    const tag = `${g.name} L${L}`.padEnd(15);
    const ok = holes === 0 && badTiles === 0;
    console.log(`${ok ? '  PASS' : (g.severity === 'fail' ? '  FAIL' : '  WARN')}  ${tag} rooms=${String(rooms.length).padStart(3)}`
      + `  id!==index=${String(holes).padStart(3)}${holeAt.length ? ' [' + holeAt.join(' ') + ']' : ''}`
      + `  tiles missing the array=${String(badTiles).padStart(4)}${badAt.length ? ' [' + badAt.join(' ') + ']' : ''}`
      + `  · doors with an undetermined owner=${ties}${tieAt.length ? ' [' + tieAt.join(' ') + ']' : ''}`);
    // ⚠ A TIE ON A SHIPPING GENERATOR IS A FAILURE, NOT A REPORT. The door-ownership rule under
    //    design resolves a tie by LOWEST roomId — deterministic, but arbitrary. That is acceptable as
    //    a floor-preserving fallback (a legal map must never fail to generate over a legal door) and
    //    NOT acceptable as something that quietly starts happening on the floor players walk. chain
    //    L1-L4 and section0 read 0 today, so this is green now and can only go red on a regression.
    if (ties > 0 && g.severity === 'fail') {
      fails.push(`${tag.trim()}: ${ties} door tile(s) whose OWNER IS UNDETERMINED — the tile carries no `
        + `roomId, or names a room that does not exist, or names a room it does not actually touch. `
        + `On a shipping generator that must be 0. [${tieAt.join(' ')}]`);
    }
    if (!ok) {
      const msg = `${tag.trim()}: ${holes} record(s) whose id !== index, ${badTiles} tile(s) whose roomId is not a valid index — `
        + `rooms[roomId] reads the WRONG RECORD or undefined, and both consumers mask it with a fallback (a silently removed spawn)`;
      (g.severity === 'fail' ? fails : warns).push(msg);
    }
  }
}
console.log('');
if (warns.length) { console.log('⚠ WARN (opt-in generators — known broken, and each is ONE FLAG from being the floor):'); warns.forEach(w => console.log('   - ' + w)); console.log(''); }
if (fails.length) { console.log('✗ FAIL — the shipping generators must hold the invariant:'); fails.forEach(f => console.log('   - ' + f)); process.exitCode = 1; }
else console.log('✓ PASS — every SHIPPING generator keeps rooms dense and every tile roomId indexes it.');
