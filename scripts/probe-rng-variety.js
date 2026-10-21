#!/usr/bin/env node
/**
 * probe-rng-variety.js — is every game the same level? (Mark 2026-09-21: "why each game its the same fucking
 * boring level, same monsters its assinine")
 *
 * WHAT IT MEASURES: N seeds through the SHIPPING generators offline — Section0 (floor 1) and DungeonChain
 * (floors 2+) — and, per floor, how many DISTINCT outcomes the seeds produce on three axes:
 *   layout  = the multiset of room rects (x,z,w,h) — does the map change?
 *   roster  = the multiset of monster kinds (nameKey + hostile flag) — do the monsters change?
 *   loot    = the multiset of loot-card titles — does the loot change?
 * A "distinct" count near N means the seed reaches that axis; a count near 1 means it does not, whatever the
 * plans say. This is the falsifier the 09-07 and 09-19 plans never had: RNG was always "next" because nothing
 * counted it. Exit 1 when any axis on floor 1 is below THRESH (default 0.9·N) — wire into smoke after Phase 2.
 *
 *   node scripts/probe-rng-variety.js            # 200 seeds, floors 1-3
 *   SEEDS=50 FLOORS=1 node scripts/probe-rng-variety.js
 */
const path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const N = parseInt(process.env.SEEDS || '200', 10), FLOORS = (process.env.FLOORS || '1,2,3').split(',').map(Number);
const THRESH = parseFloat(process.env.THRESH || '0.9');
if (typeof global.window === 'undefined') global.window = global;
try { global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js')); } catch (_) {}
const Creator = require(path.join(ROOT, 'js/v8/map/Creator.js')); global.Creator = Creator;
const S0 = require(path.join(ROOT, 'js/v8/map/Section0.js'));
const Chain = require(path.join(ROOT, 'js/v8/map/DungeonChain.js'));
const H = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 10);
const sorted = (a) => a.slice().sort();
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
function gen(seed, floor) {
    global._origamiGameSeed = String(seed);
    const floorSeed = ((seed >>> 0) ^ ((floor * 0x1A1A1A1A) >>> 0)) >>> 0;   // = Engine _floorSeed [REF#E9-08023]
    if (floor === 1) return S0.generateDungeonMap(1, 160, 160, { layoutSeed: String(floorSeed) });
    Chain.setMapSeed(floorSeed); return Chain.generateDungeonMap(floor, 128, 128);
}
let fail = false;
for (const floor of FLOORS) {
    const lay = new Set(), ros = new Set(), loot = new Set(), kinds = new Map(); let rooms = [], mobs = [], cards = [];
    for (let i = 0; i < N; i++) {
        const seed = ((i + 1) * 2654435761 >>> 0) || 1;
        let out; try { out = quiet(() => gen(seed, floor)); } catch (e) { console.log(`  floor ${floor} seed ${seed}: generator THREW — ${e.message}`); fail = true; continue; }
        const ms = (out.mobSpawns || []).filter(Boolean);
        const L = sorted(out.rooms.filter(Boolean).map(r => [r.x, r.y ?? r.z, r.w, r.h].join(',')));
        const R = sorted(ms.filter(m => m.type !== 'loot_card').map(m => (m.nameKey || m.kind || '?') + (m.isHostile ? '!' : '')));
        const C = sorted(ms.filter(m => m.type === 'loot_card').map(m => m.title || m.catId));
        lay.add(H(L)); ros.add(H(R)); loot.add(H(C)); rooms.push(L.length); mobs.push(R.length); cards.push(C.length);
        for (const k of new Set(R.map(x => x.replace('!', '')))) kinds.set(k, (kinds.get(k) || 0) + 1);
    }
    const pct = (s) => (100 * s.size / N).toFixed(0).padStart(3) + '%';
    const rng = (a) => a.length ? Math.min(...a) + '-' + Math.max(...a) : '-';
    console.log(`FLOOR ${floor}  (${N} seeds)  distinct layouts ${pct(lay)}  rosters ${pct(ros)}  loot ${pct(loot)}   rooms ${rng(rooms)} · monsters ${rng(mobs)} · cards ${rng(cards)}`);
    console.log(`   kinds ever seen (${kinds.size}): ` + [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + (100 * n / N).toFixed(0) + '%').join(' · '));
    if (floor === 1 && (lay.size < THRESH * N || ros.size < THRESH * N || loot.size < THRESH * N)) { fail = true; console.log(`   ✗ floor 1 below ${THRESH * 100}% on an axis — the seed does not reach it`); }
}
console.log(fail ? '\nRNG VARIETY: FAIL' : '\nRNG VARIETY: PASS');
process.exit(fail ? 1 : 0);
