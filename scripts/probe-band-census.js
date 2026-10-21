#!/usr/bin/env node
/*
 * probe-band-census.js — THE ONE NUMBER A LAYOUT LIVES OR DIES BY.
 *
 * Counts WALL TILES WITH WALKABLE FLOOR ON BOTH SIDES. That is a wall BAND between two walkable
 * spaces, and it is the single forbidden construction in this engine:
 *
 *   knowledge/design/SEAM_WALL_MODEL_2026-08-24.md §1 — "The band is 2.0wu thick; the pane drawn
 *   for it is 0.42wu. So every shared wall carried 1.58wu of thickness that had to be explained to
 *   the eye … We shipped all four [explanations]. Each one is a Hall-of-Shame date."
 *   The one the player sees: "a second face → 'STUPID DOUBLE WALL… IT DOUBLES IT ALL' (08-18, 08-23)".
 *
 * WHY THIS SCRIPT EXISTS (2026-08-25): a seat — me — ported DungeonEmergency's BAND-model structure
 * ("separated from the inner ring by EXACTLY ONE tile of wall") into the SEAM-model map, shipped it,
 * and reported it green. Every other gate passed: convention 100%, 0 notched corners, all tiles
 * reachable, 0 pageerrors. NONE of them asks this question, so none of them caught 48 double walls.
 * Mark caught it in one screenshot. This is the gate that had been missing.
 *
 * PASS = 0. Any other number is a fail, with every offending tile listed.
 *
 * Usage: node scripts/probe-band-census.js [generator]
 *          generator = test (default) | emergency | chain
 *        Runs headless in node against the generator module directly — no browser, no dev server,
 *        so it can gate a build in a second.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

const RS = require(path.join(ROOT, 'js/v8/map/RoomShapes.js'));
global.RoomShapes = RS;
if (typeof window === 'undefined') global.window = global;

const WHICH = (process.argv[2] || 'test').toLowerCase();
// ⚠ section0 ADDED 2026-08-26 (AI 2). It was MISSING, and the omission was the dangerous kind:
//   Section0.js IS floor 1 — the map Mark actually walks — and the band gate could not target it.
//   "Every other gate was green while 48 bands stood" is the exact lesson this census exists to
//   prevent, so a census that cannot see the shipping floor is the same failure one level up.
const MODULES = {
  test:      'js/v8/map/DungeonTest.js',
  emergency: 'js/v8/map/DungeonEmergency.js',
  chain:     'js/v8/map/DungeonChain.js',
  section0:  'js/v8/map/Section0.js',
};
// Section0 authors through Creator before it stamps, and refuses to build without it.
try { global.Creator = require(path.join(ROOT, 'js/v8/map/Creator.js')); } catch (_) {}
const rel = MODULES[WHICH];
if (!rel) { console.error('unknown generator "' + WHICH + '" — expected one of: ' + Object.keys(MODULES).join(', ')); process.exit(2); }

const mod = require(path.join(ROOT, rel));
const gen = (mod && mod.generateDungeonMap) || (global.DungeonTest && global.DungeonTest.generateDungeonMap);
if (typeof gen !== 'function') { console.error(rel + ' exposes no generateDungeonMap'); process.exit(2); }

const MAP_W = 128, MAP_H = 128;
const out = gen(1, MAP_W, MAP_H);
const map = out && out.map;
if (!map) { console.error(rel + ' returned no map'); process.exit(2); }

const walk = (c) => !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door');
const isWall = (c) => !!c && (c.type === 'wall' || c.type === 'rock' || c.type === 'void');
// ⛔ A DESIGNED TILE IS NOT A BAND. `counterWall` / `lowWall` mark the HALF-HEIGHT reception counter —
//   a wall tile with floor on both sides ON PURPOSE, which is precisely the shape the band law
//   forbids. Creator's shared band rule has skipped them by name since 2026-08-30 (Creator.js:646,
//   DESIGN_FLAGS) and Section0's own band law did too as far back as a56fb767; THIS census was the
//   one place still counting them, which made a counter literally unbuildable and is how the 番所
//   counter came to be missing at all. Mark rejected a floor over exactly this once already — a
//   transform ate the teal counter, band read 0, and the verdict read ACCEPTED.
//   ⚠ FLAG-SPECIFIC ON PURPOSE, and controlled: an ordinary wall tile between two walkables still
//     fires. chain 33 and emergency 42 are unchanged by this edit — measured before and after.
const isDesigned = (c) => !!c && (c.counterWall === true || c.lowWall === true);

const bands = [];
for (let x = 1; x < MAP_W - 1; x++) {
  for (let z = 1; z < MAP_H - 1; z++) {
    if (!isWall(map[x][z])) continue;
    if (isDesigned(map[x][z])) continue;                 // a counter/lowWall course is DESIGN, not a band
    const ew = walk(map[x - 1][z]) && walk(map[x + 1][z]);
    const ns = walk(map[x][z - 1]) && walk(map[x][z + 1]);
    if (ew || ns) bands.push({ x, z, axis: ew ? 'E-W' : 'N-S' });
  }
}

let walkable = 0;
for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_H; z++) if (walk(map[x][z])) walkable++;

const tag = '[BAND CENSUS · ' + WHICH + ']';
if (bands.length === 0) {
  console.log(tag + ' PASS — 0 wall tiles between two walkable spaces (' + walkable + ' walkable tiles). '
    + 'Every wall in this layout is either a zero-thickness seam or unreachable rock.');
  process.exit(0);
}
console.error(tag + ' FAIL — ' + bands.length + ' wall tile(s) stand BETWEEN two walkable spaces. '
  + 'Each one renders as TWO parallel walls with 1.58wu of dead space between them: the '
  + '"STUPID DOUBLE WALL" pathology. A wall between walkable spaces must be the SEAM (zero '
  + 'thickness), never a tile — SEAM_WALL_MODEL_2026-08-24.md §2.');
const show = bands.slice(0, 40);
for (const b of show) console.error('    (' + b.x + ',' + b.z + ')  walkable on ' + b.axis);
if (bands.length > show.length) console.error('    … and ' + (bands.length - show.length) + ' more');
process.exit(1);
