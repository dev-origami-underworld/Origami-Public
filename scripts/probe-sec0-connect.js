#!/usr/bin/env node
/*
 * probe-sec0-connect.js — PIECE-BY-PIECE GATE for the seam-model map.
 *
 * Runs the generator once per build piece (`generateDungeonMap(1, W, H, upTo)`) and, at every step,
 * asserts the two things that actually decide whether a layout is right:
 *
 *   1. BAND CENSUS = 0 — no wall tile with walkable floor on both sides. A wall between two walkable
 *      spaces must be the seam, never a tile. (SEAM_WALL_MODEL_2026-08-24.md §1; the 08-25 teardown.)
 *
 *   2. CONNECTIVITY THAT RESPECTS DIVIDERS — ⚠ this is the part a normal flood-fill gets WRONG.
 *      In the seam model two touching tiles with DIFFERENT roomIds are separated by a divider and
 *      are NOT passable; the only way through is a door tile. A plain tile flood walks straight
 *      through every wall in the level and will happily report a sealed room as "reachable" — which
 *      is exactly how a layout can pass reachability while being unplayable.
 *      Rule used here: adjacent walkable tiles are connected iff same roomId, or either is a door.
 *
 * Usage: node scripts/probe-sec0-connect.js
 * PASS = every piece has 0 bands and everything built at that step reachable from the spawn.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.RoomShapes = require(path.join(ROOT, 'js/v8/map/RoomShapes.js'));
if (typeof window === 'undefined') global.window = global;
const DT = require(path.join(ROOT, 'js/v8/map/DungeonTest.js'));

const W = 128, H = 128;
const walk = (c) => !!c && (c.type === 'floor' || c.type === 'shoji_door' || c.type === 'door');
const isDoor = (c) => !!c && (c.type === 'shoji_door' || c.type === 'door');
const isWall = (c) => !!c && (c.type === 'wall' || c.type === 'rock' || c.type === 'void');

function bands(map) {
  const out = [];
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < H - 1; z++) {
    if (!isWall(map[x][z])) continue;
    if ((walk(map[x - 1][z]) && walk(map[x + 1][z])) || (walk(map[x][z - 1]) && walk(map[x][z + 1]))) out.push([x, z]);
  }
  return out;
}

// connected across a seam ONLY through a door, or when both sides are the same space
function passable(a, b) {
  if (!walk(a) || !walk(b)) return false;
  if (isDoor(a) || isDoor(b)) return true;
  return a.roomId === b.roomId;
}

function reach(map, sx, sz) {
  const seen = new Set([sx + ',' + sz]), q = [[sx, sz]];
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H || seen.has(k)) continue;
      if (!passable(map[x][z], map[nx][nz])) continue;
      seen.add(k); q.push([nx, nz]);
    }
  }
  return seen;
}

const PIECES = DT.PIECES;
let failed = 0;
console.log('piece-by-piece gate — band census must be 0, everything built must be reachable\n');
for (let i = 1; i <= PIECES.length; i++) {
  const out = DT.generateDungeonMap(1, W, H, i);
  const map = out.map;
  const b = bands(map);
  const seen = reach(map, out.spawnX, out.spawnZ);
  const perId = {};
  for (let x = 0; x < W; x++) for (let z = 0; z < H; z++) {
    const c = map[x][z]; if (!walk(c)) continue;
    const id = c.roomId; perId[id] = perId[id] || { t: 0, r: 0 };
    perId[id].t++; if (seen.has(x + ',' + z)) perId[id].r++;
  }
  let total = 0, got = 0;
  const orphans = [];
  for (const id of Object.keys(perId)) {
    total += perId[id].t; got += perId[id].r;
    if (perId[id].r !== perId[id].t) orphans.push('id' + id + ' ' + perId[id].r + '/' + perId[id].t);
  }
  const ok = b.length === 0 && got === total;
  if (!ok) failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + String(i).padStart(2) + '. ' + PIECES[i - 1].padEnd(15)
    + 'bands=' + String(b.length).padStart(3)
    + '   reachable=' + got + '/' + total
    + (orphans.length ? '   SEALED: ' + orphans.join(', ') : '')
    + (b.length ? '   first band at (' + b[0] + ')' : ''));
}
console.log('');
if (failed) { console.error('FAIL — ' + failed + ' piece(s) bad. A sealed id means a door is missing on that seam.'); process.exit(1); }
console.log('PASS — every piece: 0 wall tiles between walkable spaces, nothing sealed off.');
