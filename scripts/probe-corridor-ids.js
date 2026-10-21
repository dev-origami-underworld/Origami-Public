#!/usr/bin/env node
/*
 * probe-corridor-ids.js — THE BEFORE/AFTER FOR THE CORRIDOR-roomId SPLIT.
 *
 * Mark 2026-08-30: "sync with other AI, work together on this." The contract both seats signed is
 * knowledge/design/MAP_HEALTH_CONTRACT_2026-08-29.md §6d — read it before changing anything here.
 *
 * GROUND RULE 2 SAYS THE CHANGE LANDS BEHIND A FLAG WITH A BEFORE/AFTER GATE, AND THIS IS THAT GATE.
 * It exists BEFORE the implementation, deliberately, so no improvement can be claimed that was not
 * measured — including the ones that get WORSE.
 *
 * ⚠ THE FALSIFIER, STATED IN THE CONTRACT BEFORE ANY CODE WAS WRITTEN:
 *     `room-ragged` should COLLAPSE from 22-of-22 to near zero.
 *   It fires today precisely because a room's id leaks into its corridor, so the room's "own tiles"
 *   are a room PLUS a corridor and never fill their bounding box. IF IT DOES NOT DROP, THE SPLIT DID
 *   NOT DO WHAT WE THINK IT DID — and this probe says so rather than explaining it away.
 *
 * Usage: node scripts/probe-corridor-ids.js [seed]        (npm run probe:corridor)
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
if (typeof global.window === 'undefined') global.window = global;
try { global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js')); } catch (_) {}
const Creator = require(path.join(ROOT, 'js/v8/map/Creator.js'));
global.Creator = Creator;

const SEED = parseInt(process.argv[2] || '12345', 10) || 12345;
const GENS = [
  { name: 'chain',     rel: 'js/v8/map/DungeonChain.js',     levels: [1, 2, 3] },
  { name: 'section0',  rel: 'js/v8/map/Section0.js',         levels: [1] },
  { name: 'emergency', rel: 'js/v8/map/DungeonEmergency.js', levels: [1] },
  { name: 'test',      rel: 'js/v8/map/DungeonTest.js',      levels: [1] },
];

const isDoorT = (t) => t === 'shoji_door' || t === 'door';
const walkable = (c) => !!c && (c.type === 'floor' || isDoorT(c.type));

function measure(map, rooms) {
  Creator.adopt(map, rooms);
  const geo = Creator.validateGeometry(map, {});
  // ⚠ READ `geo.counts`, NOT THE ARRAY. validateGeometry caps how many entries of each rule it puts
  //   in the returned array (`count[rule] <= maxReport`), so tallying the array under-reports any rule
  //   that fires a lot — which is every rule this probe cares about. Caught here when band read 40
  //   against a hand count of 42 on the same map. `.counts` is uncapped and is what gate:geometry uses.
  const by = geo.counts || {};
  const recs = Creator.rooms();
  const rec = new Map(recs.map(r => [r.genId, r]));
  const inRect = (id, x, z) => { const r = rec.get(id);
    return !!(r && typeof r.x === 'number' && x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h); };
  // inherited-id corridor tiles: walkable, carry a room's id, lie outside that room's rect
  let inherited = 0, W = map.length, H = map[0].length;
  for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
    const c = map[x][z]; if (!walkable(c) || c.roomId == null) continue;
    if (rec.has(c.roomId) && !inRect(c.roomId, x, z)) inherited++;
  }
  // BANDS THAT COULD BECOME SEAMS: the engine draws a divider only where the two sides differ.
  let convertible = 0, deleting = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
    const c = map[x][z]; if (!c || c.type !== 'wall') continue;
    const ew = walkable(map[x-1] && map[x-1][z]) && walkable(map[x+1] && map[x+1][z]);
    const ns = walkable(map[x] && map[x][z-1]) && walkable(map[x] && map[x][z+1]);
    if (!ew && !ns) continue;
    const a = ew ? (map[x-1][z].roomId) : (map[x][z-1].roomId);
    const b = ew ? (map[x+1][z].roomId) : (map[x][z+1].roomId);
    if (a != null && b != null && a !== b) convertible++; else deleting++;
  }
  // positional invariant + door ties, the two things gate:roomid guards
  let idNeIndex = 0, oob = 0;
  rooms.forEach((r, i) => { if (r && r.id !== i) idNeIndex++; });
  for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
    const c = map[x][z]; if (!c || c.roomId == null) continue;
    if (!(c.roomId >= 0 && c.roomId < rooms.length && rooms[c.roomId])) oob++;
  }
  let ties = 0;
  for (const d of Creator.doors()) {
    const adj = new Set();
    for (const t of (d.tiles || [])) for (const dd of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const q = map[t[0]+dd[0]] && map[t[0]+dd[0]][t[1]+dd[1]];
      if (!walkable(q) || q.roomId == null) continue;
      if (inRect(q.roomId, t[0]+dd[0], t[1]+dd[1])) adj.add(q.roomId);
    }
    if (adj.size >= 2) ties++;
  }
  return { rooms: recs.length, arr: rooms.length, band: by.band || 0, ragged: by['room-ragged'] || 0,
           shape: by['room-shape'] || 0, joins: by['doorway-joins'] || 0, line: by['doorway-line'] || 0,
           inherited, convertible, deleting, idNeIndex, oob, ties };
}

const row = (tag, m) => '  ' + tag.padEnd(16)
  + 'rooms ' + String(m.rooms).padStart(3) + '/' + String(m.arr).padEnd(3)
  + ' inherited ' + String(m.inherited).padStart(4)
  + ' | band ' + String(m.band).padStart(3) + ' (seam-able ' + String(m.convertible).padStart(3)
  + ', wall-deleting ' + String(m.deleting).padStart(2) + ')'
  + ' | ragged ' + String(m.ragged).padStart(3)
  + ' shape ' + String(m.shape).padStart(2)
  + ' | id!==idx ' + String(m.idNeIndex).padStart(2) + ' oob ' + String(m.oob).padStart(4)
  + ' ties ' + String(m.ties).padStart(2);

console.log('CORRIDOR-roomId SPLIT — before/after · seed ' + SEED);
console.log('  contract: knowledge/design/MAP_HEALTH_CONTRACT_2026-08-29.md §6d (signed by both seats)');
console.log('');
const has = typeof Creator.assignCorridorIds === 'function';
if (!has) console.log('  ⚠ Creator.assignCorridorIds() DOES NOT EXIST YET — printing the BEFORE column only.\n');

for (const g of GENS) {
  let mod; try { mod = require(path.join(ROOT, g.rel)); } catch (e) { console.log('  ' + g.name + ': load failed'); continue; }
  for (const L of g.levels) {
    const fs = ((SEED >>> 0) ^ ((L * 0x1A1A1A1A) >>> 0)) >>> 0;
    const build = () => { if (mod.setMapSeed) mod.setMapSeed(fs); return mod.generateDungeonMap(L, 128, 128); };
    let a, b;
    try { a = build(); b = build(); } catch (e) { console.log('  ' + g.name + ' L' + L + ': threw — ' + e.message.slice(0, 60)); continue; }
    const before = measure(a.map, a.rooms || []);
    console.log(row(g.name + ' L' + L + ' before', before));
    if (has) {
      const rooms = b.rooms || [];
      const rep = Creator.assignCorridorIds(b.map, rooms, {});
      const after = measure(b.map, rooms);
      console.log(row('  after', after)
        + '   [minted ' + rep.minted + ' corridor record(s), ' + rep.tiles + ' tile(s)]');
      const worse = [];
      if (after.band > before.band) worse.push('band ' + before.band + '->' + after.band);
      if (after.shape > before.shape) worse.push('room-shape ' + before.shape + '->' + after.shape);
      if (after.line > before.line) worse.push('doorway-line ' + before.line + '->' + after.line);
      if (after.idNeIndex > before.idNeIndex) worse.push('id!==index ' + before.idNeIndex + '->' + after.idNeIndex);
      if (after.oob > before.oob) worse.push('out-of-array ' + before.oob + '->' + after.oob);
      if (worse.length) console.log('    ⚠ GOT WORSE: ' + worse.join(' · '));
      if (g.name === 'chain' && L === 1) {
        console.log('    FALSIFIER (room-ragged should collapse): ' + before.ragged + ' -> ' + after.ragged
          + (after.ragged <= Math.max(1, Math.round(before.ragged * 0.2))
             ? '   ✓ collapsed — the split did what the contract predicted'
             : '   ✗ DID NOT COLLAPSE — the split did not do what we think it did'));
      }
    }
  }
}
console.log('');
console.log('  seam-able = band tiles whose two sides differ in roomId, so the wall survives as a divider.');
console.log('  wall-deleting = band tiles whose sides SHARE an id — converting those DELETES the wall.');
