#!/usr/bin/env node
/*
 * gate-creator-geometry.js — GRADE EVERY GENERATOR AGAINST THE SHAPE LAW.
 *
 * Mark 2026-08-29: "what do you recommend so we can have good and health room and hallway connections
 * layouts and designs of shapes? and making sure doors are correct ... so lets put the fix to our
 * creator system so our maps are always RNG for each game but beautiful and render well."
 *
 * `Creator.validate()` has always checked IDENTITY — every door has a room, no shared tiles, links
 * both ways. `Creator.validateGeometry()` is the other half: SHAPE. This runs it over every generator
 * in the tree, over as many seeds as you ask for, and prints a per-rule table.
 *
 * ⚠ IT IS NOT A PASS/FAIL GATE ON THE SHIPPED FLOOR YET, AND THAT IS DELIBERATE. Three of the four
 *   generators fail rules today. Wiring a red gate into `npm run smoke` that nobody can turn green
 *   teaches people to ignore every gate — the same reasoning that keeps `gate:bands:chain` out of
 *   smoke. Exit code is 0 unless you pass --strict.
 *
 * THE POINT OF IT IS THE REROLL. An RNG generator cannot be written so it never produces an ugly map.
 * It can be wrapped: generate -> Creator.accept(map) -> reroll on failure. That is only worth doing
 * once the validator is trusted, which is what this table is for.
 *
 * Usage:
 *   node scripts/gate-creator-geometry.js [generator|all] [seeds] [--strict]
 *     generator  test | chain | section0 | emergency | all   (default: all)
 *     seeds      how many seeds to roll per generator        (default: 1)
 *     --strict   count 'warn' rows too, and exit 1 on any violation
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

if (typeof global.window === 'undefined') global.window = global;
try { global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js')); } catch (_) {}
const Creator = require(path.join(ROOT, 'js/v8/map/Creator.js'));
global.Creator = Creator;

const MODULES = {
  test:      'js/v8/map/DungeonTest.js',
  chain:     'js/v8/map/DungeonChain.js',
  section0:  'js/v8/map/Section0.js',
  emergency: 'js/v8/map/DungeonEmergency.js',
};

const argv = process.argv.slice(2).filter(a => a !== '--strict' && a !== '--selftest' && a !== '--repair');
const STRICT = process.argv.indexOf('--strict') >= 0;
// Grade the map AFTER Creator.repair(), i.e. what the engine actually ships. See the note at the
// adopt site below — the default (raw generator output) and this differ, on purpose.
const REPAIR = process.argv.indexOf('--repair') >= 0;
const repairNote = [];

// ── PROVE THE RULES CAN GO BOTH WAYS ──────────────────────────────────────────────────────────────
//    `doorway-joins` was rewritten 2026-08-30 from an IDENTITY test (count distinct roomIds in
//    `d.connects`) to a STRUCTURAL one (seal the run, count connected components). That rewrite turns
//    six FAILs into PASSes on DungeonChain, which is exactly the shape of a change that can quietly
//    gut a detector — so it does not get to be believed on the strength of the number going down.
//    These two maps are identical except for a walk-around corridor. The rule must fire on exactly
//    one of them. Run: node scripts/gate-creator-geometry.js --selftest
if (process.argv.indexOf('--selftest') >= 0) {
  const mk = (bypass) => {
    const W = 20, H = 20;
    const m = [];
    for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
    const floor = (x, z) => { m[x][z] = { type: 'floor', roomId: 0 }; };
    for (let x = 2; x <= 8; x++)  for (let z = 2; z <= 8; z++) floor(x, z);   // room A
    for (let x = 10; x <= 16; x++) for (let z = 2; z <= 8; z++) floor(x, z);  // room B
    for (let z = 1; z <= 8; z++) m[9][z] = { type: 'wall' };                  // the dividing wall
    m[9][5] = { type: 'shoji_door', roomId: 0 };                              // ⚠ SAME roomId on both sides
    if (bypass) { floor(8, 9); floor(9, 9); floor(10, 9); }                   // ...walk around it
    else m[9][9] = { type: 'wall' };
    return m;
  };
  // ⛔ AND PROVE `band` STILL BITES ON A SEAM-MODEL MAP. It was scoped on 2026-08-30 to apply only
  //   where the map separates rooms by SEAM, because on a tile-wall generator every interior wall
  //   read as a violation — it was measuring an ARCHITECTURE, not a defect. That scoping takes four
  //   generators to 0, which is EXACTLY what a gutted rule looks like, so it does not get to be
  //   believed without this: a seam-model map with ONE stray wall tile between two walkables MUST
  //   still fire. If this stops failing, `band` has stopped working.
  {
    const W = 20, H = 20, m = [];
    for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
    for (let x = 2; x <= 8; x++)  for (let z = 2; z <= 10; z++) m[x][z] = { type: 'floor', roomId: 0, segmentId: 0 };
    for (let x = 9; x <= 15; x++) for (let z = 2; z <= 10; z++) m[x][z] = { type: 'floor', roomId: 1, segmentId: 0 };
    // rooms 0 and 1 meet on a SEAM at x=8|9 — no wall tile anywhere. This is a seam-model map.
    const clean = (() => { Creator.adopt(m, [{ id: 0, x: 2, y: 2, w: 7, h: 9 }, { id: 1, x: 9, y: 2, w: 7, h: 9 }]);
      return (Creator.validateGeometry(m, { shapes: false }).counts || {}).band || 0; })();
    m[5][6] = { type: 'wall' };                    // ONE stray wall tile, floor on both sides
    Creator.adopt(m, [{ id: 0, x: 2, y: 2, w: 7, h: 9 }, { id: 1, x: 9, y: 2, w: 7, h: 9 }]);
    const dirty = (Creator.validateGeometry(m, { shapes: false }).counts || {}).band || 0;
    const pass = clean === 0 && dirty > 0;
    console.log('  ' + (clean === 0 ? 'ok  ' : 'FAIL') + '  seam-model map, no stray wall         band ' + clean + ', expected 0');
    console.log('  ' + (dirty > 0 ? 'ok  ' : 'FAIL') + '  seam-model map + ONE stray wall tile   band ' + dirty + ', expected > 0'
      + (pass ? '' : '   <-- band no longer bites on a seam map'));
    if (!pass) { console.log('\nSELFTEST FAILED — `band` does not fire on a seam-model map. It has been gutted.'); process.exit(1); }
  }
  // ⛔ AND PROVE `doorway-line` STILL BITES AFTER BEING MADE SEAM-AWARE (2026-08-30). It now accepts
  //   a SEAM as a continuing wall line, which took Section0 from 12 violations to 0 — again exactly
  //   what a gutted rule looks like. The case it MUST still catch: a door standing in open floor with
  //   THE SAME ROOM on every side — no wall to continue, and no seam either, so nothing at all is
  //   being broken by the doorway. That is a door that means nothing.
  {
    const W = 20, H = 20, m = [];
    for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
    for (let x = 3; x <= 15; x++) for (let z = 3; z <= 15; z++) m[x][z] = { type: 'floor', roomId: 0, segmentId: 0 };
    m[9][9] = { type: 'shoji_door', roomId: 0 };          // a door in the middle of ONE room
    Creator.adopt(m, [{ id: 0, x: 3, y: 3, w: 13, h: 13 }]);
    const lone = (Creator.validateGeometry(m, { shapes: false }).counts || {})['doorway-line'] || 0;
    // and the seam case it must ACCEPT: same map, two rooms meeting on a seam, door breaking it
    const m2 = [];
    for (let x = 0; x < W; x++) { m2[x] = []; for (let z = 0; z < H; z++) m2[x][z] = { type: 'rock' }; }
    for (let x = 3; x <= 8; x++)  for (let z = 3; z <= 15; z++) m2[x][z] = { type: 'floor', roomId: 0, segmentId: 0 };
    for (let x = 9; x <= 15; x++) for (let z = 3; z <= 15; z++) m2[x][z] = { type: 'floor', roomId: 1, segmentId: 0 };
    m2[8][9] = { type: 'shoji_door', roomId: 0 };          // breaks the seam at x=8|9
    Creator.adopt(m2, [{ id: 0, x: 3, y: 3, w: 6, h: 13 }, { id: 1, x: 9, y: 3, w: 7, h: 13 }]);
    const seam = (Creator.validateGeometry(m2, { shapes: false }).counts || {})['doorway-line'] || 0;
    const pass = lone > 0 && seam === 0;
    console.log('  ' + (lone > 0 ? 'ok  ' : 'FAIL') + '  door in ONE room, no wall and no seam      doorway-line ' + lone + ', expected > 0');
    console.log('  ' + (seam === 0 ? 'ok  ' : 'FAIL') + '  door breaking a SEAM between two rooms     doorway-line ' + seam + ', expected 0');
    if (!pass) { console.log('\nSELFTEST FAILED — doorway-line no longer distinguishes a seam doorway from a meaningless one.'); process.exit(1); }
  }
  let ok = true;
  for (const t of [{ bypass: false, want: 0, name: 'LOAD-BEARING door (no way around)' },
                   { bypass: true,  want: 1, name: 'DECORATIVE door (corridor walks around it)' }]) {
    const m = mk(t.bypass);
    Creator.adopt(m, [{ id: 0, x: 2, y: 2, w: 15, h: 7, kind: 'room' }]);
    const hits = Creator.validateGeometry(m, { shapes: false }).filter(v => v.rule === 'doorway-joins');
    const pass = hits.length === t.want;
    ok = ok && pass;
    console.log('  ' + (pass ? 'ok  ' : 'FAIL') + '  ' + t.name.padEnd(44)
      + ' doorway-joins fired ' + hits.length + 'x, expected ' + t.want
      + (hits.length ? '   [' + hits[0].msg.slice(0, 70) + ']' : ''));
  }
  // ⛔ AND THE CASE THE TWO MAPS ABOVE CANNOT EXPRESS — THE ONE THE RULE WAS ACTUALLY WRONG ABOUT.
  //    Both `mk()` maps put THE SAME roomId on either side of the door, which is what the PASSED line
  //    below has always advertised. On such a map `_edgeOpen` and a plain tile flood are the SAME
  //    FUNCTION, so this selftest stayed green for the entire life of the defect: `doorway-joins` used
  //    a plain flood while every other reachability question in Creator.js had been moved onto
  //    `_edgeOpen` (2026-08-30), and it therefore walked THROUGH divider panes — a differing roomId
  //    between two walkable tiles is a pane WITH A COLLIDER (Engine9:11084). It found ways around
  //    doors that no player can take, and called them decoration.
  //    Reported by origamiunderworld-80 against Mark's 08-31 section-0 map, where ALL FIVE fires were
  //    false — including the 番所 guard room's ONLY door, whose sealing seals the room.
  //    ⚠ A FIXED POINT THAT CANNOT GO RED IS NOT EVIDENCE (MAP_HEALTH_CONTRACT §2.1). So this pair is
  //      a SEAM-MODEL pair, and it is stated red-first: case A FAILS on the pre-fix flood and passes
  //      on the fixed one; case B must keep firing either way, or the fix has gutted the rule.
  {
    const mk2 = (secondDoor) => {
      const W = 20, H = 20, m = [];
      for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
      for (let x = 2; x <= 8; x++)  for (let z = 2; z <= 8; z++) m[x][z] = { type: 'floor', roomId: 0, segmentId: 0 };
      for (let x = 9; x <= 15; x++) for (let z = 2; z <= 8; z++) m[x][z] = { type: 'floor', roomId: 1, segmentId: 0 };
      // rooms 0 and 1 meet on the SEAM at x=8|9. No wall tile anywhere: the divider IS the roomId
      // change, and it carries a collider. The ONLY way across is a doorway.
      m[8][5] = { type: 'shoji_door', roomId: 0 };
      if (secondDoor) m[8][7] = { type: 'shoji_door', roomId: 0 };   // ...a real second way across
      return m;
    };
    const fires = (m) => {
      Creator.adopt(m, [{ id: 0, x: 2, y: 2, w: 7, h: 7 }, { id: 1, x: 9, y: 2, w: 7, h: 7 }]);
      return Creator.validateGeometry(m, { shapes: false }).filter(v => v.rule === 'doorway-joins').length;
    };
    const lone = fires(mk2(false));   // one door in the seam  -> LOAD-BEARING, must not fire
    const pair = fires(mk2(true));    // two doors in the seam -> each bypasses the other, must fire 2x
    const passA = lone === 0, passB = pair === 2;
    console.log('  ' + (passA ? 'ok  ' : 'FAIL') + '  SEAM: sole door across a roomId divider     '
      + 'doorway-joins fired ' + lone + 'x, expected 0' + (passA ? '' : '   <-- walked THROUGH the divider pane'));
    console.log('  ' + (passB ? 'ok  ' : 'FAIL') + '  SEAM: two doors across the same divider     '
      + 'doorway-joins fired ' + pair + 'x, expected 2' + (passB ? '' : '   <-- rule gutted: a real bypass stopped firing'));
    ok = ok && passA && passB;
  }
  // ⛔ AND PROVE `room-ragged` COUNTS A ROOM'S OWN DOORWAY AS PART OF ITS FOOTPRINT (2026-08-31).
  //    The rule asks "is this room's floor a FILLED rectangle?" and answered NO for every room that
  //    has a door, because a doorway tile is not typed 'floor'. That is the FIFTH instance of the
  //    predicate bug and it was CREATED BY THE FIX FOR THE FOURTH — the move from `walk()` to
  //    floor-only cured "rectangle PLUS a doorway" and introduced "rectangle MINUS a doorway".
  //    Case A goes RED on the pre-fix rule. Case B is the anti-gutting control: an identical room
  //    whose missing tile is ROCK, not a doorway, is genuinely ragged and MUST keep firing in both
  //    builds — otherwise the fix has simply switched the rule off.
  {
    const mkRoom = (biteType) => {
      const W = 20, H = 20, m = [];
      for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
      for (let x = 2; x <= 5; x++) for (let z = 2; z <= 5; z++) m[x][z] = { type: 'floor', roomId: 0, segmentId: 0 };
      // one tile of the room's own east wall line becomes the bite. As a DOORWAY it still belongs to
      // the room; as ROCK it is a hole. Same geometry, same bbox, opposite meanings.
      m[5][3] = (biteType === 'rock') ? { type: 'rock' } : { type: biteType, roomId: 0 };
      return m;
    };
    const fires = (m) => {
      Creator.adopt(m, [{ id: 0, x: 2, y: 2, w: 4, h: 4 }]);
      return Creator.validateGeometry(m, { shapes: false }).filter(v => v.rule === 'room-ragged').length;
    };
    const door = fires(mkRoom('shoji_door'));   // 4x4 with its own doorway -> a filled rectangle
    const rock = fires(mkRoom('rock'));         // 4x4 with a hole          -> genuinely ragged
    const passA = door === 0, passB = rock === 1;
    console.log('  ' + (passA ? 'ok  ' : 'FAIL') + '  room + its OWN doorway tile                 '
      + 'room-ragged fired ' + door + 'x, expected 0' + (passA ? '' : '   <-- counts a door as a hole'));
    console.log('  ' + (passB ? 'ok  ' : 'FAIL') + '  room with a ROCK bite (really ragged)       '
      + 'room-ragged fired ' + rock + 'x, expected 1' + (passB ? '' : '   <-- rule gutted: a real hole stopped firing'));
    ok = ok && passA && passB;
  }
  // ⛔ AND PROVE `door-placement` CAN JUDGE A SEAM SIDE AT ALL (2026-08-31). Before the seam fallback
  //    it could only find a wall by counting wall TILES, so on a seam-model map EVERY room<->room side
  //    scored under SOLID_MIN and was filed "UNJUDGED — nothing was looked at". The shipped floor read
  //    5 sides judged and 6 blind. Case A is the law working; case B is it BITING. Case B goes red
  //    only if the fallback exists at all, so together they are the red-first pair.
  //    ⚠ Mark 2026-08-31 ruled HALLWAYS ARE JUDGED, so both rooms of a shared seam report — which is
  //      what makes "a door on a shared seam must sit on BOTH rooms' midpoints" enforceable instead of
  //      hand-maintained. Case B expects 2 rows for that reason, one per room.
  {
    const mkSeam = (doorZ) => {
      const W = 20, H = 20, m = [];
      for (let x = 0; x < W; x++) { m[x] = []; for (let z = 0; z < H; z++) m[x][z] = { type: 'rock' }; }
      for (let x = 2; x <= 8; x++)  for (let z = 2; z <= 8; z++) m[x][z] = { type: 'floor', roomId: 0, segmentId: 0 };
      for (let x = 9; x <= 15; x++) for (let z = 2; z <= 8; z++) m[x][z] = { type: 'floor', roomId: 1, segmentId: 0 };
      m[8][doorZ] = { type: 'shoji_door', roomId: 0 };   // the ONLY way across the seam
      return m;
    };
    const fires = (m) => {
      Creator.adopt(m, [{ id: 0, x: 2, y: 2, w: 7, h: 7 }, { id: 1, x: 9, y: 2, w: 7, h: 7 }]);
      return Creator.validateGeometry(m, { shapes: false })
        .filter(v => v.rule === 'door-placement' && /off its wall midpoint/.test(v.msg)).length;
    };
    const onMid  = fires(mkSeam(5));   // z2..z8 -> midpoint z5
    const offMid = fires(mkSeam(3));   // two tiles north of it
    const passA = onMid === 0, passB = offMid === 2;
    console.log('  ' + (passA ? 'ok  ' : 'FAIL') + '  SEAM: door ON both rooms\' midpoint      '
      + 'door-placement fired ' + onMid + 'x, expected 0' + (passA ? '' : '   <-- false positive on a correct door'));
    console.log('  ' + (passB ? 'ok  ' : 'FAIL') + '  SEAM: door OFF the midpoint               '
      + 'door-placement fired ' + offMid + 'x, expected 2' + (passB ? '' : '   <-- PRE-FIX answered 0: the side was UNJUDGED, not passing'));
    ok = ok && passA && passB;
  }
  console.log('');
  console.log(ok
    ? 'SELFTEST PASSED — doorway-joins reads GEOMETRY on a shared-roomId map and respects the roomId DIVIDER on a seam map.'
    : 'SELFTEST FAILED — the rule does not distinguish a load-bearing door from a walk-around. Do not trust its count.');
  process.exit(ok ? 0 : 1);
}
const WHICH = (argv[0] || 'all').toLowerCase();
const SEEDS = Math.max(1, parseInt(argv[1] || '1', 10) || 1);
const MAP_W = 128, MAP_H = 128;

const targets = (WHICH === 'all') ? Object.keys(MODULES) : [WHICH];
for (const t of targets) if (!MODULES[t]) {
  console.error('unknown generator "' + t + '" — expected one of: ' + Object.keys(MODULES).join(', ') + ', all');
  process.exit(2);
}

let anyFail = false;
const rows = [];

for (const name of targets) {
  for (let s = 0; s < SEEDS; s++) {
    // ⚠ SEED THE WAY THE ENGINE DOES, WHICH IS **NOT** A GLOBAL. The first version of this gate set
    //   `window.gameSeed` — a name NO generator in this tree reads. Every "seed" therefore produced
    //   the identical map and the `seeds` argument was decoration. The engine calls
    //   `<generator>.setMapSeed(floorSeed)` and THEN `generateDungeonMap` (Engine9 :5595/:5611/:5616),
    //   with floorSeed = gameSeed XOR (level * 0x1A1A1A1A) (:5461). Do exactly that.
    //   Falsified by scripts/falsify-map-persistence.js — see its T2.
    const _gameSeed = 1000 + s * 7919;
    const _floorSeed = ((_gameSeed >>> 0) ^ ((1 * 0x1A1A1A1A) >>> 0)) >>> 0;
    let gen, out, map;
    try {
      const mod = require(path.join(ROOT, MODULES[name]));
      gen = (mod && mod.generateDungeonMap)
         || (global.DungeonTest && global.DungeonTest.generateDungeonMap)
         || (global[Object.keys(global).find(k => /Dungeon|Section/.test(k) && global[k] && global[k].generateDungeonMap)] || {}).generateDungeonMap;
      if (typeof gen !== 'function') throw new Error('exposes no generateDungeonMap');
      const api = (mod && mod.generateDungeonMap) ? mod : (global[Object.keys(global).find(k => /Dungeon|Section/.test(k) && global[k] && global[k].setMapSeed)] || null);
      if (api && typeof api.setMapSeed === 'function') api.setMapSeed(_floorSeed);
      out = gen(1, MAP_W, MAP_H);
      map = out && out.map;
      if (!map) throw new Error('returned no map');
    } catch (e) {
      rows.push({ name, seed: _floorSeed, error: String(e && e.message).slice(0, 120) });
      anyFail = true;
      continue;
    }
    Creator.adopt(map, (out && (out.rooms || out.rooms_out)) || []);
    // ⚠ BY DEFAULT THIS GRADES WHAT THE GENERATOR EMITS, WHICH IS NOT WHAT THE GAME SHIPS.
    //   The engine runs `Creator.repair()` at the generateCastleMap choke point before the verdict
    //   (Engine9 [REF#E9-CRFIX]), so a live boot of DungeonChain floor 1 reads 33 while this table
    //   reads 35. Both numbers are true and they answer different questions: the table is "how good
    //   is the generator", `--repair` is "what does the player get". A future seat finding the two
    //   disagreeing should not have to work that out from scratch — hence the flag and this note.
    if (REPAIR && typeof Creator.repair === 'function') {
      const _rp = Creator.repair(map, { rooms: (out && out.rooms) || [] });
      Creator.adopt(map, (out && out.rooms) || []);
      if (_rp.fixed.length) repairNote.push(name + ' seed ' + _floorSeed + ': repaired ' + _rp.fixed.length
        + ' (' + _rp.fixed.map(f => f.rule + '@' + f.at.join(',')).join(' ') + ')');
    }
    const ident = Creator.validate();
    const geo = Creator.validateGeometry(map, {});
    const counts = geo.counts || {};
    const fails = geo.filter(v => v.severity !== 'warn').length;
    const warns = geo.filter(v => v.severity === 'warn').length;
    rows.push({ name, seed: _floorSeed, ident: ident.length, counts, fails, warns,
                rooms: Creator.rooms().length, doors: Creator.doors().length,
                sample: geo.slice(0, 3) });
    if (ident.length || fails || (STRICT && warns)) anyFail = true;
  }
}

const RULES = Creator.GEOMETRY_RULES;
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);

console.log('THE SHAPE LAW — Creator.validateGeometry() over ' + targets.length + ' generator(s) x ' + SEEDS + ' seed(s)');
console.log('');
console.log('  ' + pad('generator', 11) + padL('seed', 5) + padL('rooms', 7) + padL('doors', 6) + padL('ident', 7)
  + RULES.map(r => padL(r.slice(0, 9), 11)).join(''));
console.log('  ' + '-'.repeat(11 + 5 + 7 + 6 + 7 + RULES.length * 11));
for (const r of rows) {
  if (r.error) { console.log('  ' + pad(r.name, 11) + padL(r.seed, 5) + '   ERROR: ' + r.error); continue; }
  console.log('  ' + pad(r.name, 11) + padL(r.seed, 5) + padL(r.rooms, 7) + padL(r.doors, 6) + padL(r.ident, 7)
    + RULES.map(k => padL(r.counts[k] || '·', 11)).join(''));
}
console.log('');
for (const r of rows) {
  if (r.error || !r.sample || !r.sample.length) continue;
  console.log('  ' + r.name + ' seed ' + r.seed + ' — first violations:');
  for (const v of r.sample) console.log('     [' + v.severity + '] ' + v.rule + ': ' + v.msg);
}
console.log('');
if (repairNote.length) { console.log('  Creator.repair() applied (--repair):'); repairNote.forEach(n => console.log('    ' + n)); console.log(''); }
console.log('  ' + (REPAIR ? 'GRADED AFTER Creator.repair() — this is what the engine ships.'
                           : 'graded on RAW generator output. The engine repairs at boot: add --repair to see what ships.'));
console.log('  fail rules reject a map outright · warn rules (room-ragged, doorway-joins, dead-end-nub, pocket) report, never reject');
console.log('  unless --strict. Reroll contract: generate -> Creator.accept(map) -> reroll while !ok.');
process.exit((STRICT && anyFail) ? 1 : 0);
