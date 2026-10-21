#!/usr/bin/env node
/* gate-openable-reach.js — REACHABILITY THROUGH DOORS THAT ACTUALLY OPEN.
 *
 * WHY THIS EXISTS (2026-08-28). Every reachability gate in this repo walks the TILE GRID, and a door
 * tile is walkable in the grid whether or not the door can ever be opened. The grid cannot represent
 * "openable". So those gates answer a question nobody asked, and on 2026-08-28 they all said PASS
 * while floor 2 was unreachable:
 *
 *     _cabDoorProx 1.75 -> 0.25 (Mark's order, correct in itself) made the cabaret WEST door
 *     unopenable — a closed leaf is a SOLID TILE, so the player physically stops 1.32 tiles out and
 *     a 0.25 centre-distance trigger is unsatisfiable by construction on that approach.
 *     MEASURED: blocking that one door tile severs 34 tiles — Cabaret-limb 14, Dressing Room 10,
 *     Manager's Office 10 — and the Manager's Office holds stairs_down. No descent. No floor 2.
 *     gate:sec0, "11/11 rooms reachable" and "stairs_down reachable" all passed throughout.
 *
 * SO: a door whose open trigger cannot be satisfied from its approach side is a WALL for pathing,
 * and this gate treats it as one.
 *
 * ⚠ IT DOES NOT MEASURE DOORS ITSELF, BY DESIGN. Door behaviour is measured by
 * scripts/probe-door-open-distance.js (origamiunderworld-77), which drives the real player into each
 * door and reports which gate term blocked it. Two independent implementations of "does this door
 * open" would eventually disagree and then neither could be trusted, so this gate CONSUMES that
 * verdict and re-derives nothing.
 *
 * ⚠ AND IT REFUSES TO GUESS. Three states, never two:
 *      opens     — driven, and it opened. Passable.
 *      never     — driven, and it did not open. Treated as WALL.
 *      undriven  — the harness could not walk the player into it. NOT passable, NOT impassable:
 *                  UNKNOWN, and the gate FAILS rather than certifying a floor it could not test.
 *   Collapsing `undriven` into either bucket rebuilds the exact blindness this gate exists to remove.
 *   A missing verdict file is the same failure — a gate that passes because it found no data is worse
 *   than no gate, and this repo has shipped that mistake more than once.
 *
 *   Usage:  node scripts/gate-openable-reach.js [--verdicts <path>] [--url <url>]
 *   Default verdicts path: .probe-shots/door-verdicts.json   (override: DOOR_VERDICTS env)
 */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VERDICTS = path.resolve(ROOT, argOf('--verdicts', process.env.DOOR_VERDICTS || '.probe-shots/door-verdicts.json'));
const URL = argOf('--url', process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function die(msg) { console.error('\n❌ GATE FAIL — ' + msg + '\n'); process.exit(1); }

// ── THE VERDICT CONTRACT ───────────────────────────────────────────────────────────────────────
// { floor: 1, generatedAt: "<iso>", doors: [
//     { id, tiles: [[x,z], ...], verdict: "opens"|"never"|"undriven",
//       opensAtTiles: <number|null>, blockedBy: "<gate term>"|null } ] }
// `tiles` is EXPLICIT and never derived from a world centre. A 2-tile doorway's centre is a .5
// coordinate and rounding it picks one of two tiles — I got that wrong by hand earlier today and
// only caught it by type-checking the tile before trusting it.
function loadVerdicts() {
  if (!fs.existsSync(VERDICTS))
    die('no door verdicts at ' + path.relative(ROOT, VERDICTS) + '\n   Run the door probe first — this gate will NOT pass on absent data.\n   node scripts/probe-door-open-distance.js --emit ' + path.relative(ROOT, VERDICTS));
  let v; try { v = JSON.parse(fs.readFileSync(VERDICTS, 'utf8')); }
  catch (e) { die('verdicts file is not valid JSON: ' + e.message); }
  if (!v || !Array.isArray(v.doors)) die('verdicts file has no `doors` array');
  const bad = v.doors.filter(d => !['opens', 'never', 'undriven'].includes(d.verdict));
  if (bad.length) die(bad.length + ' door(s) carry an unknown verdict: ' + JSON.stringify(bad.map(d => d.verdict)));
  const noTiles = v.doors.filter(d => !Array.isArray(d.tiles));
  if (noTiles.length) die(noTiles.length + ' door(s) have no `tiles` array — this gate refuses to infer tiles from a world centre');
  // ⚠ AN EMPTY `tiles` MAY NOT CERTIFY ITSELF. `tiles: []` means one of two things and the gate
  //   cannot tell them apart: (a) the door genuinely has no map presence — a phantom, which by
  //   construction cannot sever any path; or (b) THE RESOLVER FAILED, which is the definition of
  //   untested. origamiunderworld-77 hit (b) on 2026-08-28: they resolved tiles AFTER the walk loop,
  //   and walking OPENS doors, so a real signed door at (61,65) resolved to NOTHING and looked
  //   exactly like a phantom. Silently excluding empty-tile doors would have passed that floor.
  //   So absence is never self-certifying: the PROBE must positively assert irrelevance with
  //   `pathRelevant: false` AND a `reason` string it measured. No assertion → the gate fails.
  const unexplained = v.doors.filter(d => !d.tiles.length && !(d.pathRelevant === false && typeof d.reason === 'string' && d.reason.trim()));
  if (unexplained.length) die(unexplained.length + ' door(s) resolve to NO map tile without asserting why.\n' +
    '   An empty `tiles` is indistinguishable from a failed resolution, so it cannot be waved through.\n' +
    '   If the door provably has no map presence, emit `pathRelevant: false` with a measured `reason`.\n' +
    '   Doors: ' + unexplained.map(d => d.id || '?').join(' '));
  return v;
}

(async () => {
  const verdicts = loadVerdicts();
  const impassable = verdicts.doors.filter(d => d.verdict === 'never');
  // a door positively asserted as having no map presence cannot sever a path — excluded from the BFS,
  // but ALWAYS reported, because an unexplained runtime door object is a finding even when it is inert.
  const phantoms = verdicts.doors.filter(d => d.pathRelevant === false);
  const unknown = verdicts.doors.filter(d => d.verdict === 'undriven' && d.pathRelevant !== false);

  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(10000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { await browser.close(); die('engine frame not found'); }

  const blockList = impassable.flatMap(d => d.tiles);
  const result = await eng.evaluate((blocked) => {
    const G = window.GRID || 2, map = window.map;
    if (!map) return { err: 'window.map is undefined' };
    const key = (x, z) => x + ',' + z;
    const blockedSet = new Set(blocked.map(t => key(t[0], t[1])));

    const goals = [];
    for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) {
      const c = map[x] && map[x][z];
      if (c && (c.type === 'stairs_down' || c.type === 'stairs_up')) goals.push({ type: c.type, x, z, roomId: c.roomId });
    }
    const bfs = (useBlock) => {
      const sx = Math.round(window.px / G), sz = Math.round(window.pz / G);
      const seen = new Set([key(sx, sz)]), q = [[sx, sz]];
      while (q.length) {
        const [x, z] = q.shift();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, k = key(nx, nz);
          if (seen.has(k)) continue;
          if (useBlock && blockedSet.has(k)) continue;
          const c = map[nx] && map[nx][nz];
          if (!c || c.type === 'wall') continue;
          seen.add(k); q.push([nx, nz]);
        }
      }
      return seen;
    };
    const raw = bfs(false), real = bfs(true);
    const rooms = (window.rooms || []).map(r => ({ id: r.id, name: r.roomNameEn || r.roomName || ('room ' + r.id) }));
    // which rooms lost every one of their tiles?
    const roomTiles = {};
    for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) {
      const c = map[x] && map[x][z];
      if (!c || c.type === 'wall' || c.roomId == null) continue;
      (roomTiles[c.roomId] = roomTiles[c.roomId] || []).push(key(x, z));
    }
    const severedRooms = [];
    for (const [rid, tiles] of Object.entries(roomTiles)) {
      const before = tiles.filter(t => raw.has(t)).length, after = tiles.filter(t => real.has(t)).length;
      if (before > 0 && after === 0) severedRooms.push({ roomId: +rid, tiles: before });
    }
    return {
      rawWalkable: raw.size, realWalkable: real.size,
      goals: goals.map(g => ({ ...g, reachableRaw: raw.has(key(g.x, g.z)), reachableReal: real.has(key(g.x, g.z)) })),
      severedRooms, rooms,
    };
  }, blockList);
  await browser.close();

  if (result.err) die(result.err);

  const nameOf = id => (result.rooms.find(r => r.id === id) || {}).name || ('room ' + id);
  console.log('OPENABLE-DOOR REACHABILITY');
  console.log('  verdicts      : ' + path.relative(ROOT, VERDICTS) + '  (' + verdicts.doors.length + ' doors)');
  console.log('  treated WALL  : ' + (impassable.length || 'none') +
    (impassable.length ? '  ' + impassable.map(d => (d.id || '') + JSON.stringify(d.tiles) + (d.blockedBy ? ' blocked-by:' + d.blockedBy : '')).join(' ') : ''));
  console.log('  walkable      : ' + result.rawWalkable + ' raw → ' + result.realWalkable + ' through openable doors');
  for (const g of result.goals)
    console.log('  ' + g.type.padEnd(12) + '(' + g.x + ',' + g.z + ') in ' + nameOf(g.roomId) +
      '  grid:' + (g.reachableRaw ? 'OK' : 'UNREACHABLE') + '  real:' + (g.reachableReal ? 'OK' : 'UNREACHABLE'));
  if (result.severedRooms.length)
    for (const s of result.severedRooms) console.log('  ⚠ SEVERED    : ' + nameOf(s.roomId) + ' (' + s.tiles + ' tiles) — no route through an openable door');
  for (const p of phantoms)
    console.log('  ⚠ ANOMALY     : ' + (p.id || '?') + ' has no map presence — excluded from pathing, NOT excluded from your attention. reason: ' + p.reason);
  if (pageErrors.length) console.log('  pageerrors    : ' + pageErrors.length);

  const fails = [];
  // UNKNOWN IS A FAILURE. A floor we could not test is not a floor we may certify.
  if (unknown.length) fails.push(unknown.length + ' door(s) UNDRIVEN — the harness could not walk the player into them, so this floor is untested, not passing: ' +
    unknown.map(d => (d.id || '') + JSON.stringify(d.tiles)).join(' '));
  for (const g of result.goals) {
    if (g.type !== 'stairs_down') continue;
    if (!g.reachableRaw) fails.push('stairs_down at (' + g.x + ',' + g.z + ') is unreachable even on the raw grid — a generator defect, not a door one');
    else if (!g.reachableReal) fails.push('stairs_down at (' + g.x + ',' + g.z + ') in ' + nameOf(g.roomId) +
      ' is UNREACHABLE through openable doors. FLOOR PROGRESSION IS SOFTLOCKED — the grid says reachable and the player cannot get there.');
  }
  if (result.severedRooms.length) fails.push(result.severedRooms.length + ' room(s) severed behind a door that never opens');
  if (pageErrors.length) fails.push(pageErrors.length + ' pageerror(s) during boot');

  if (fails.length) { console.error(''); for (const f of fails) console.error('❌ ' + f); console.error(''); process.exit(1); }
  console.log('\n✅ PASS — every stairs_down is reachable through doors that actually open, no room severed.\n');
})().catch(e => die(e.message));
