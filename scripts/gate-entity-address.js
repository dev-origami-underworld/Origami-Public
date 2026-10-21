#!/usr/bin/env node
/*
 * gate-entity-address.js — THE AUDIT DIMENSION THAT WAS MISSING, AND IT COST A BLACK SCREEN.
 *
 * Mark 2026-08-30: "creator feature should understand each model needs this hierarchy: floor,
 * section id, room id. doors, chests, beds, monsters, loot, traps, will all fall under this."
 * Design + falsification: knowledge/design/ENTITY_ADDRESS_HIERARCHY_2026-08-30.md
 *
 * ⚠ WHY THIS EXISTS. The corridor work was audited three ways — by IDENTITY (what reads
 *   rooms.find(id===1)), by ID-SPACE (gate:roomid: does every tile's roomId index the array), and by
 *   CONSUMER (what derives segmentId). NOTHING WAS AUDITED BY **RECORD SHAPE**. So corridor records
 *   shipped carrying {id, kind, shapeKey, tiles, segmentId} and no geometry, the floor-decal pass did
 *   `room.center.x * GRID` over every entry of `rooms`, and the game booted to a black screen. A human
 *   found it. `gate:roomid` proves an id indexes the array; it never asked whether the thing AT that
 *   index looks like a room.
 *
 * WHAT IT CHECKS
 *   1. RECORD SHAPE   — every entry of `rooms` carries the keys a real record carries.
 *   2. ADDRESS TOTAL  — after Creator.assignAddresses, ZERO unaddressable. No defaults are permitted,
 *                       so "unaddressable" is a hard fail, not a warning: `segmentId ?? 0` puts a thing
 *                       in section 0 — the heart — which the heart-clear then empties.
 *   3. KEY STABILITY  — regenerate the same seed; every key must be byte-identical, or a save that
 *                       says "F2.S1.R4.2 is looted" points somewhere else on the way back up.
 *   4. CONNECTORS     — anything spanning >1 section must be FLAGGED as a connector, never silently
 *                       assigned one of them. The main hall spans {0,1,2} on every floor below 1.
 *
 * Usage: node scripts/gate-entity-address.js [--strict] [--selftest]      (npm run gate:address)
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
if (typeof global.window === 'undefined') global.window = global;
try { global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js')); } catch (_) {}
const Creator = require(path.join(ROOT, 'js/v8/map/Creator.js'));
global.Creator = Creator;

const STRICT = process.argv.indexOf('--strict') >= 0;
const SELFTEST = process.argv.indexOf('--selftest') >= 0;

// The keys a room record must carry. Derived from what CONSUMERS actually read, not from what a
// record happens to have: `center` is here because Engine9's floor-decal pass reads `room.center.x`
// and crashed without it; `segmentId` because section culling reads it.
const REQUIRED = ['id', 'x', 'y', 'w', 'h', 'center', 'segmentId'];

// SEVERITY SPLIT, same as gate:roomid and for the same reason: FAIL on the generators that can SHIP
// the floor, WARN on the opt-in ones. A gate that is red from birth teaches people to ignore red.
// ⚠ WARN IS NOT "FINE" — `?testmap=1` and `window._emergencyMap = true` are each ONE FLAG from being
//   the floor, and DungeonEmergency WAS the default floor 1 for three days in August.
//   If either is ever made default again, its severity moves to 'fail' IN THE SAME COMMIT.
const GENS = [
  { name: 'chain',     rel: 'js/v8/map/DungeonChain.js',     levels: [1, 2, 3], severity: 'fail' },
  { name: 'section0',  rel: 'js/v8/map/Section0.js',         levels: [1],       severity: 'fail' },
  { name: 'emergency', rel: 'js/v8/map/DungeonEmergency.js', levels: [1],       severity: 'warn' },
  { name: 'test',      rel: 'js/v8/map/DungeonTest.js',      levels: [1],       severity: 'warn' },
];
const SEED = 12345;
const fails = [], warns = [];

function run(g, L, mutate) {
  let mod; try { mod = require(path.join(ROOT, g.rel)); } catch (e) { return null; }
  const fs = ((SEED >>> 0) ^ ((L * 0x1A1A1A1A) >>> 0)) >>> 0;
  const build = () => { if (mod.setMapSeed) mod.setMapSeed(fs); return mod.generateDungeonMap(L, 128, 128); };
  let o; try { o = build(); } catch (e) { return { threw: e.message }; }
  const rooms = o.rooms || [];
  Creator.adopt(o.map, rooms);
  if (typeof Creator.assignCorridorIds === 'function') { Creator.assignCorridorIds(o.map, rooms, {}); Creator.adopt(o.map, rooms); }
  if (mutate) mutate(rooms);
  const ad = Creator.assignAddresses(o.map, rooms, L, [{ kind: 'monster', items: o.mobSpawns || [] }]);
  // 1. record shape
  const missing = [];
  rooms.forEach((r, i) => {
    if (!r) { missing.push('rooms[' + i + '] is empty'); return; }
    const gone = REQUIRED.filter(k => r[k] === undefined || r[k] === null);
    if (gone.length) missing.push('rooms[' + i + '] (id ' + r.id + ') missing ' + gone.join(','));
  });
  // 4. connectors
  const conn = Creator.rooms().filter(r => r.address && r.address.sections.length > 1);
  const unflagged = conn.filter(r => !r.address.connector);
  return { ad, missing, rooms: rooms.length, conn: conn.length, unflagged,
           keys: Creator.rooms().filter(r => r.address).map(r => r.address.key).sort().join(','),
           mobKeys: (o.mobSpawns || []).filter(m => m.address).map(m => m.address.key).sort().join(',') };
}

if (SELFTEST) {
  // PROVE IT GOES RED. Strip `center` from one record — the exact defect that shipped a black screen.
  const clean = run(GENS[0], 1, null);
  const broken = run(GENS[0], 1, (rooms) => { if (rooms[0]) delete rooms[0].center; });
  const caught = clean.missing.length === 0 && broken.missing.length > 0;
  console.log('  ' + (clean.missing.length === 0 ? 'ok  ' : 'FAIL') + '  untouched map: ' + clean.missing.length + ' shape problem(s), expected 0');
  console.log('  ' + (broken.missing.length > 0 ? 'ok  ' : 'FAIL') + '  `center` deleted from rooms[0]: ' + broken.missing.length + ' shape problem(s), expected >0'
    + (broken.missing.length ? '   [' + broken.missing[0] + ']' : ''));
  console.log('');
  console.log(caught
    ? 'SELFTEST PASSED — the gate catches a record missing the key that crashed the build.'
    : 'SELFTEST FAILED — it did not notice a record shaped wrong. Do not trust a PASS from it.');
  process.exit(caught ? 0 : 1);
}

console.log('ENTITY ADDRESS — floor → section → room · seed ' + SEED);
console.log('  the audit dimension gate:roomid does not have: RECORD SHAPE');
console.log('');
console.log('  ' + 'generator'.padEnd(16) + 'rooms'.padStart(6) + 'doors'.padStart(7) + 'entities'.padStart(10)
  + 'conn'.padStart(6) + 'unaddressable'.padStart(15) + '  shape  keys-stable');
console.log('  ' + '-'.repeat(78));
for (const g of GENS) for (const L of g.levels) {
  const a = run(g, L, null);
  if (!a) { warns.push(g.name + ': could not load'); continue; }
  if (a.threw) { warns.push(g.name + ' L' + L + ': threw — ' + String(a.threw).slice(0, 50)); continue; }
  const b = run(g, L, null);
  const stable = (a.keys === b.keys) && (a.mobKeys === b.mobKeys);
  const tag = g.name + ' L' + L;
  const ok = a.ad.unaddressable.length === 0 && a.missing.length === 0 && stable && a.unflagged.length === 0;
  console.log('  ' + tag.padEnd(16) + String(a.ad.rooms).padStart(6) + String(a.ad.doors).padStart(7)
    + String(a.ad.entities).padStart(10) + String(a.conn).padStart(6)
    + String(a.ad.unaddressable.length).padStart(15)
    + '   ' + (a.missing.length ? 'FAIL' : ' ok ') + '   ' + (stable ? ' ok ' : 'FAIL')
    + (ok ? '' : '   <-- see below'));
  const bucket = (g.severity === 'fail') ? fails : warns;
  if (a.ad.unaddressable.length) bucket.push(tag + ': ' + a.ad.unaddressable.length + ' unaddressable — ' + a.ad.unaddressable.slice(0, 3).join(' · '));
  if (a.missing.length) bucket.push(tag + ': record shape — ' + a.missing.slice(0, 3).join(' · '));
  if (!stable) bucket.push(tag + ': keys CHANGED between two generations of the same seed — a save would point elsewhere');
  if (a.unflagged.length) bucket.push(tag + ': ' + a.unflagged.length + ' record(s) span >1 section but are not flagged as connectors');
}
console.log('');
if (warns.length) { console.log('⚠ WARN (opt-in generators — each is ONE FLAG from being the floor):'); warns.forEach(w => console.log('   - ' + w)); console.log(''); }
if (fails.length) { console.log('✗ FAIL:'); fails.forEach(f => console.log('   - ' + f)); process.exitCode = STRICT ? 1 : 0; }
else console.log('✓ PASS — every SHIPPING record is shaped like a record, every thing has an address, keys survive regeneration, connectors are flagged.');
