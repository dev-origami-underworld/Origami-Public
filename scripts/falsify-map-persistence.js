#!/usr/bin/env node
/*
 * falsify-map-persistence.js — TRY TO BREAK "unique each game, identical every time you come back".
 *
 * Mark, 2026-08-30:
 *   "yes go ahead and falsify it all, make sure its the map that works with the creator system so
 *    each section will be unique each game, but the save will work, and each level can be unique and
 *    stored when transversing up and down between these same levels, so it will keep the record for
 *    player progress."
 *
 * Those four sentences are four testable claims, and they pull against each other — a map that is
 * random per game must ALSO be byte-identical every time the player walks back up to it, and must
 * survive a save/load. The engine's intended answer already exists and is the right one:
 *
 *     floorSeed = gameSeed XOR (level * 0x1A1A1A1A)          (Engine9 :5461, MapGen.js :15)
 *
 * Derive, never store. One number in the save file reproduces every floor of the run. This harness
 * asks whether that actually HOLDS, per generator:
 *
 *   T1 DETERMINISM   same floorSeed twice            -> must be IDENTICAL
 *   T2 SEED-HONOURED two different floorSeeds        -> must DIFFER (a generator that ignores the
 *                                                      seed passes T1 trivially and is NOT random)
 *   T3 LEVEL-UNIQUE  level 1 vs level 2, same game   -> must DIFFER
 *   T4 GAME-UNIQUE   game A vs game B, same level    -> must DIFFER
 *   T5 RETURN-STABLE L1 -> L2 -> L1                  -> the two L1s must be IDENTICAL
 *
 * ⚠ T2 IS THE ONE THAT MATTERS AND IT IS THE ONE A NAIVE HARNESS SKIPS. A fixed hand-authored map
 *   passes T1 and T5 perfectly — it is the same map every time because it is the same map, full stop.
 *   Without T2 this script would report the Creator floor as fully healthy.
 *
 * Usage: node scripts/falsify-map-persistence.js [generator|all]
 */
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

if (typeof global.window === 'undefined') global.window = global;
try { global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js')); } catch (_) {}
try { global.Creator = require(path.join(ROOT, 'js/v8/map/Creator.js')); } catch (_) {}

const MODULES = {
  test:      { file: 'js/v8/map/DungeonTest.js',      global: 'DungeonTest' },
  chain:     { file: 'js/v8/map/DungeonChain.js',     global: 'DungeonChain' },
  section0:  { file: 'js/v8/map/Section0.js',         global: 'Section0' },
  emergency: { file: 'js/v8/map/DungeonEmergency.js', global: 'DungeonEmergency' },
};

const WHICH = (process.argv[2] || 'all').toLowerCase();
const targets = WHICH === 'all' ? Object.keys(MODULES) : [WHICH];
for (const t of targets) if (!MODULES[t]) { console.error('unknown generator "' + t + '"'); process.exit(2); }

const MAP_W = 128, MAP_H = 128;
// The engine's own derivation, copied rather than re-invented (Engine9 :5461).
const floorSeed = (gameSeed, level) => ((parseInt(gameSeed, 10) >>> 0) ^ ((level * 0x1A1A1A1A) >>> 0)) >>> 0;

// A map's IDENTITY: tile type + roomId for every cell. Not a screenshot, not a room count — two maps
// that differ by one tile must hash differently or this whole harness is theatre.
function sig(map) {
  const h = crypto.createHash('sha1');
  for (let x = 0; x < map.length; x++) {
    const col = map[x];
    for (let z = 0; z < col.length; z++) {
      const c = col[z];
      h.update(c ? (c.type + '|' + (c.roomId === undefined || c.roomId === null ? '-' : c.roomId) + ';') : '_;');
    }
  }
  return h.digest('hex').slice(0, 12);
}

function gen(name, seed, level) {
  const m = MODULES[name];
  const mod = require(path.join(ROOT, m.file));
  const api = (mod && mod.generateDungeonMap) ? mod : global[m.global];
  if (!api || typeof api.generateDungeonMap !== 'function') throw new Error(name + ' exposes no generateDungeonMap');
  // Exactly what the engine does: seed the module, THEN generate (Engine9 :5595/:5611/:5616).
  if (typeof api.setMapSeed === 'function') api.setMapSeed(seed);
  const out = api.generateDungeonMap(level, MAP_W, MAP_H);
  if (!out || !out.map) throw new Error(name + ' returned no map');
  return out.map;
}

const GAME_A = '424242', GAME_B = '987654321';
const results = [];

for (const name of targets) {
  const r = { name, notes: [] };
  try {
    const s1a = sig(gen(name, floorSeed(GAME_A, 1), 1));
    const s1b = sig(gen(name, floorSeed(GAME_A, 1), 1));
    r.T1 = (s1a === s1b);

    const sOther = sig(gen(name, floorSeed(GAME_A, 1) ^ 0x5eed5eed, 1));
    r.T2 = (sOther !== s1a);

    const s2 = sig(gen(name, floorSeed(GAME_A, 2), 2));
    r.T3 = (s2 !== s1a);

    const sB1 = sig(gen(name, floorSeed(GAME_B, 1), 1));
    r.T4 = (sB1 !== s1a);

    // The actual player journey: stand on 1, walk down to 2, walk back up to 1.
    const down = sig(gen(name, floorSeed(GAME_A, 1), 1));
    void sig(gen(name, floorSeed(GAME_A, 2), 2));
    const back = sig(gen(name, floorSeed(GAME_A, 1), 1));
    r.T5 = (down === back);
    r.sigs = { L1: s1a, L2: s2, otherSeed: sOther, gameB: sB1 };
  } catch (e) {
    r.error = String(e && e.message).slice(0, 140);
  }
  results.push(r);
}

const mark = (v) => v === undefined ? ' -- ' : (v ? ' ok ' : 'FAIL');
console.log('MAP PERSISTENCE — floorSeed = gameSeed XOR (level * 0x1A1A1A1A)');
console.log('');
console.log('  ' + 'generator'.padEnd(12) + 'T1 determ  T2 seed?  T3 level  T4 game   T5 return   L1 signature');
console.log('  ' + '-'.repeat(84));
let anyFail = false;
for (const r of results) {
  if (r.error) { console.log('  ' + r.name.padEnd(12) + 'ERROR: ' + r.error); anyFail = true; continue; }
  const row = [r.T1, r.T2, r.T3, r.T4, r.T5];
  if (row.some(v => v === false)) anyFail = true;
  console.log('  ' + r.name.padEnd(12)
    + mark(r.T1).padEnd(11) + mark(r.T2).padEnd(10) + mark(r.T3).padEnd(10)
    + mark(r.T4).padEnd(10) + mark(r.T5).padEnd(12) + r.sigs.L1);
}
console.log('');
console.log('  T1 same seed twice = identical   · T2 different seed = different map (IS IT RANDOM AT ALL?)');
console.log('  T3 level 1 != level 2            · T4 game A != game B');
console.log('  T5 L1 -> L2 -> L1 reproduces L1  (walk down and back up, the floor must be the one you left)');
console.log('');
for (const r of results) {
  if (r.error) continue;
  if (r.T2 === false) console.log('  ⚠ ' + r.name + ': setMapSeed CHANGES NOTHING — this map is the same every game. '
    + 'T1/T5 pass trivially because it is a fixed layout, not because persistence works.');
  if (r.T3 === false) console.log('  ⚠ ' + r.name + ': level 1 and level 2 are the SAME MAP.');
  if (r.T5 === false) console.log('  ⚠ ' + r.name + ': walking down and back up does NOT reproduce the floor — progress cannot be kept.');
}

// ══ T6-T8 — THE REROLL MUST NOT BREAK RETURN-STABILITY ═══════════════════════════════════════════
// The moment a generator rolls until the shape law passes, a floor stops being a pure function of
// (gameSeed, level): it is "the first roll that passed". If the validator or the generator changes
// between the player going down and coming back up, a DIFFERENT roll passes and the player walks up
// into a different floor. Creator.generateAccepted records the accepted ATTEMPT INDEX for exactly
// this, and replays it without re-validating. These three tests are the proof that it holds.
const Creator = global.Creator;
if (Creator && typeof Creator.generateAccepted === 'function') {
  console.log('');
  console.log('THE REROLL — does an accepted floor still come back identical?');
  console.log('');
  const chain = (() => { const m = require(path.join(ROOT, 'js/v8/map/DungeonChain.js')); return (m && m.generateDungeonMap) ? m : global.DungeonChain; })();
  const genFn = (seed, level) => { chain.setMapSeed(seed); return chain.generateDungeonMap(level, MAP_W, MAP_H); };
  const say = (name, ok, detail) => console.log('  ' + (ok ? ' ok ' : 'FAIL') + '  ' + name + (detail ? '   ' + detail : ''));
  let rerollFail = false;
  try {
    Creator.setRun(GAME_A);
    // ⚠ THE SHAPE LAW IS RED ON EVERY GENERATOR TODAY (MAP_HEALTH_CONTRACT §3: chain band 33), so a
    //   reroll against the full law accepts nothing and T7/T8 never run — a test that cannot fail,
    //   which is the exact pattern this session has spent all day removing. So the three rules chain
    //   cannot currently satisfy are IGNORED HERE, with the reason stated, leaving `unreachable` and
    //   `room-no-door` live. This tests the REROLL MECHANISM, which is what T6-T8 are about; the shape
    //   law itself is graded by gate:geometry and must not be relaxed there.
    const loose = { tries: 8, ignore: ['band', 'doorway-line', 'doorway-joins'] };
    const a1 = Creator.generateAccepted(genFn, 1, loose);
    const s1 = sig(a1.map), att = a1.attempt;
    say('T6 reroll accepts a floor and records the attempt', typeof att === 'number', 'attempt ' + att + ', replayed=' + a1.replayed);
    if (typeof att !== 'number') rerollFail = true;

    // T7 — the player journey: down to 2, back up to 1. The accepted attempt must be REPLAYED, not
    // re-searched, and must give back the identical floor.
    // ⚠ LEVEL 2 IS ALLOWED TO FAIL HERE AND IT DOES — chain's level 2 dies on `unreachable` on all 8
    //   rolls, which is a REAL finding and is reported below rather than being allowed to abort the
    //   return test. Whether the player got a valid floor 2 is a different question from whether
    //   floor 1 comes back the way they left it, and conflating them would hide both.
    let l2 = null, l2err = null;
    try { l2 = Creator.generateAccepted(genFn, 2, loose); } catch (e) { l2err = e.message; }
    say('T7a level 2 generates at all', !!l2, l2err ? 'FINDING: ' + l2err.slice(0, 96) : 'attempt ' + (l2 && l2.attempt));
    const back = Creator.generateAccepted(genFn, 1, loose);   // must still replay, even though level 2 failed
    const ok7 = (sig(back.map) === s1) && back.replayed === true;
    if (!ok7) rerollFail = true;
    say('T7 walking back up replays the SAME floor', ok7, 'replayed=' + back.replayed + ' sig ' + sig(back.map) + ' vs ' + s1);

    // T8 — a fresh run restored from a save payload rebuilds the same floor. This is the one that
    // matters for "keep the record for player progress": {gameSeed, acceptedAttempts} is the whole
    // save requirement for the map — two small values, no stored tiles.
    const payload = Creator.acceptedAttempts();
    Creator.reset(); Creator.setRun(GAME_A, payload);
    const restored = Creator.generateAccepted(genFn, 1, loose);
    const ok8 = sig(restored.map) === s1 && restored.replayed === true;
    if (!ok8) rerollFail = true;
    say('T8 save -> restore rebuilds the same floor', ok8, 'payload ' + JSON.stringify(payload));

    // T9 — PROVE THE REFUSAL. With a rule nothing can satisfy, generateAccepted must THROW rather
    // than quietly hand back a failing map. A reroll that degrades silently is how the rejected floor
    // shipped with every gate green.
    let threw = false;
    try { Creator.setRun(GAME_B); Creator.generateAccepted(genFn, 1, { tries: 3 }); }
    catch (e) { threw = /all 3 rolls failed/.test(e.message); }
    if (!threw) rerollFail = true;
    say('T9 refuses to ship a failing map (throws)', threw);
  } catch (e) { rerollFail = true; console.log('  FAIL  reroll harness errored: ' + e.message); }
  if (rerollFail) anyFail = true;
}

process.exit(anyFail && process.argv.indexOf('--strict') >= 0 ? 1 : 0);
