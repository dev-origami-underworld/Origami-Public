#!/usr/bin/env node
/*
 * probe-door-open-distance.js — AT WHAT DISTANCE DOES A DOOR ACTUALLY OPEN?
 *
 * Mark, 2026-08-28: "fix door opening on distance too much. should be .25 tiles away or direct
 * contact with door pane to open."
 *
 * ⚠ WHY EVERY EARLIER VERSION OF THIS FILE — AND ORIGAMIUNDERWORLD-96's SWEEP — READ "NEVER OPENED".
 *   The open condition (Engine9:81688) is
 *       _dFront < _front && _dSide < _sideMax && _isPushTarget && (_pushOpen || _eastNearOpens || _proxOpens)
 *   and both proximity openers are opt-in and unset, so the only live opener is `_pushOpen`, which
 *   needs `_fwdIntent` — a forward key PHYSICALLY HELD (Engine9:81610). A door in this game does not
 *   open because you are standing at it correctly; it opens because you are WALKING INTO it. Any
 *   probe that teleports and then reads `open` is structurally incapable of ever seeing one open.
 *
 * ⚠ AND "NEVER OPENED" IS A USELESS READING, which is the real lesson. Four of the gate's terms can
 *   each block on their own, so a single boolean cannot tell a working 0.25 from a broken one — they
 *   produce IDENTICAL output. This version therefore RE-COMPUTES EVERY TERM each frame from the pose
 *   and the door record, and when a door does not open it reports WHICH TERM was false at closest
 *   approach. A probe that says "NEVER OPENED" has told you nothing you can act on.
 *
 * ⚠ ALSO MEASURED HERE, because a comment claims otherwise: Engine9:81600-81609 says a click-to-move
 *   path counts as forward intent and offers `window._clickPathOpensDoors = false` to disable it.
 *   `_clickPathOpensDoors` occurs EXACTLY ONCE IN THE WHOLE FILE — inside that comment. It is never
 *   read, `_fwdIntent` has no `_clickPath` term, and `scripts/probe-door-walk-into.js`, cited there as
 *   the live reproduction, DOES NOT EXIST. The fix the comment describes was never made.
 *
 * Usage:  node scripts/probe-door-open-distance.js
 *         PROBE_FLAGS='{"_cabDoorProx":1.75}' node scripts/probe-door-open-distance.js   (A/B the old value)
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const START_TILES = 3.0, STEPS = 90, STEP_MS = 55;
// --emit <path> / --no-emit. Emits BY DEFAULT so scripts/gate-openable-reach.js (origamiunderworld-96)
// can be wired into the smoke chain — that gate hard-fails on a missing file, by design, because a
// gate that passes for lack of data is worse than no gate.
const _ai = process.argv.indexOf('--emit');
const EMIT = process.argv.includes('--no-emit') ? null
           : (_ai >= 0 && process.argv[_ai + 1] ? process.argv[_ai + 1]
              : path.join(__dirname, '..', '.probe-shots', 'door-verdicts.json'));

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1000, height: 750 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  if (process.env.PROBE_FLAGS) {
    const f = JSON.parse(process.env.PROBE_FLAGS);
    await page.addInitScript(o => { Object.assign(window, o); }, f);
    console.log('  flags     : ' + process.env.PROBE_FLAGS);
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(9000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) throw new Error('engine frame not found');

  const setup = await eng.evaluate(() => {
    const recs = window._cabDoors || [];
    if (!recs.length) return { error: 'window._cabDoors is empty — no runtime door records exist' };
    if (typeof window._tp !== 'function') return { error: 'window._tp missing — cannot place the player' };
    if (typeof window._playerPoseProbe !== 'function') return { error: 'window._playerPoseProbe missing — cannot read the pose' };
    // ⚠ RESOLVE EACH DOOR'S MAP TILES HERE — BEFORE THE HARNESS HAS WALKED INTO ANYTHING.
    //   Doing it after the walk lost the west door: the run opens doors, opening mutates tile state,
    //   and a scan of the disturbed map reported "no door tile" for a tile the live map plainly holds
    //   as `(61,65) shoji_door/id1/signed`. Measure the map before you disturb it.
    //   And do NOT infer from the centre where the record can tell you: `d.mapDoor` exists on every
    //   record — MEASURED, it is not tile coordinates (it yielded nothing for all four), so the
    //   neighbour scan below is the resolution, and it TYPE-FILTERS. Taking all four neighbours of a
    //   .5 centre sweeps in plain FLOOR tiles, which is how an over-block produces a louder softlock
    //   than the real one.
    const G0 = window.GRID || 2, m0 = window.map;
    const isDoor0 = (x, z) => { const c = m0[x] && m0[x][z]; return !!(c && /door/.test(c.type)); };
    const tilesOf = (d) => {
      const out = [];
      for (const x of [...new Set([Math.floor(d.cx / G0), Math.ceil(d.cx / G0)])])
        for (const z of [...new Set([Math.floor(d.cz / G0), Math.ceil(d.cz / G0)])])
          if (isDoor0(x, z) && !out.some(t => t[0] === x && t[1] === z)) out.push([x, z]);
      return out;
    };
    // ── ABSENCE IS NEVER SELF-CERTIFYING (origamiunderworld-96's ruling, and they are right). ──
    //   `tiles: []` has TWO opposite causes wearing the same value: a genuine phantom with no map
    //   presence, and a RESOLVER THAT FAILED. I produced the second one an hour ago — an empty list
    //   for the real signed door at (61,65) — so a gate that read "empty = harmless, skip it" would
    //   have PASSED a floor whose only route to the stairs was the door it skipped.
    //   Therefore the PROBE must assert irrelevance POSITIVELY, and the assertion must carry the
    //   evidence it was made from. `reason` below is built from MEASURED values, never from prose:
    //   if the evidence does not support the claim, `pathRelevant` is left unset and the gate fails.
    const evidenceOf = (d) => {
      const around = [];
      for (const x of [...new Set([Math.floor(d.cx / G0), Math.ceil(d.cx / G0)])])
        for (const z of [...new Set([Math.floor(d.cz / G0), Math.ceil(d.cz / G0)])]) {
          const c = m0[x] && m0[x][z]; around.push(x + ',' + z + '=' + (c ? c.type : 'void'));
        }
      const leaves = Array.isArray(d.leaves) ? d.leaves : (d.leaves ? [d.leaves] : []);
      const obj3d = leaves.filter(L => L && typeof L.updateWorldMatrix === 'function');
      const inScene = obj3d.filter(L => !!L.parent).length;
      let colliders = 0;
      try { colliders = (window._thinWallColliders || []).filter(c => c &&
              Math.abs(((c.x != null ? c.x : c.cx) || 0) - d.cx) < 3 &&
              Math.abs(((c.z != null ? c.z : c.cz) || 0) - d.cz) < 3).length; } catch (_) { colliders = -1; }
      return { around, leafCount: leaves.length, leafObject3D: obj3d.length, leafInScene: inScene,
               colliders, mapDoor: d.mapDoor === null ? 'null' : typeof d.mapDoor };
    };
    return { eff: window._cabDoorProxEff || null, poseKeys: Object.keys(window._playerPoseProbe() || {}),
             doors: recs.map((d, i) => {
               const tiles = tilesOf(d);
               const ev = tiles.length ? null : evidenceOf(d);
               // Only claim irrelevance when EVERY strand of evidence says so. Anything short of that
               // (a wall/door neighbour, a leaf really in the scene, a collider, an unreadable
               // collider list) leaves pathRelevant unset -> the gate hard-fails as untested.
               const provable = !!ev && ev.leafInScene === 0 && ev.colliders === 0
                             && !ev.around.some(a => /=(wall|.*door)$/.test(a));
               return { i, cx: d.cx, cz: d.cz, approach: d.approach || '?',
                        isDungeonExit: !!d.isDungeonExit, name: d.name || null, tiles,
                        pathRelevant: ev ? (provable ? false : undefined) : undefined,
                        reason: (ev && provable)
                          ? ((d.name ? ('"' + d.name + '" ') : '') + 'record has no map door tile'
                             + ' (mapDoor ' + ev.mapDoor + '); surrounding tiles ' + ev.around.join(' ')
                             + '; ' + ev.leafCount + ' leaves of which ' + ev.leafObject3D + ' are Object3D and '
                             + ev.leafInScene + ' are in the scene; ' + ev.colliders + ' colliders within 3wu'
                             + ' — measured, so it cannot sever a path')
                          : (ev ? ('no map door tile, and irrelevance is NOT provable: ' + JSON.stringify(ev)) : undefined) };
             }) };
  });
  if (setup.error) { console.error('  FAIL: ' + setup.error); await b.close(); process.exit(1); }

  // ── HOW FORWARD INTENT GETS IN (origamiunderworld-59's find, verified here at Engine9:46422). ──
  // `keys` has TWO independent writers: the engine's own window keydown listener, and the postMessage
  // relay — `if(d.type==='KEY_DOWN'){ keys[d.key]=true; keys[key.toLowerCase()]=true; if(d.code)keys[d.code]=true; … }`
  // whose own comment reads "postMessage keys don't fire the engine's own keydown listener". That is
  // why every dispatchEvent and every Playwright keyboard.down attempt died: they target the LISTENER,
  // which never sees cross-frame or synthetic events, while the relay writes `keys` directly.
  // This is the same path the shell and Panels feed real input through (it is how Space=jump works),
  // so the probe exercises the production input plumbing rather than a synthetic side door — and it
  // needs no focus, which is what made every focus-based attempt a coin toss.
  // ⚠ DRIVE BOTH WRITERS. Measured: the relay alone moved the player for 2 of 4 doors and the trusted
  //   keyboard alone moved a different 2 — while BOTH produced byte-identical open distances (0.24 and
  //   1.48) for the doors they did drive. Rather than theorise about which writer wins where, hold the
  //   key down both ways; the door gate reads one `keys` map either way, so this cannot double-count.
  //   The movement assertion below is what keeps an un-driven door from being scored as a shut one.
  await eng.evaluate(() => { try { document.body.tabIndex = -1; document.body.focus(); } catch (_) {} });
  await page.mouse.click(500, 380).catch(() => {});
  const holdFwd = async (down) => {
    await eng.evaluate(d => { window.postMessage({ type: d ? 'KEY_DOWN' : 'KEY_UP', key: 'w', code: 'KeyW' }, '*'); }, down);
    try { if (down) await page.keyboard.down('w'); else await page.keyboard.up('w'); } catch (_) {}
  };
  await sleep(400);

  const results = [];
  for (const d of setup.doors) {
    const ax = d.approach === 'x';
    const placed = await eng.evaluate(a => {
      const G = window.GRID || 2;
      const sx = a.ax ? a.cx + a.start * G : a.cx, sz = a.ax ? a.cz : a.cz + a.start * G;
      const r = window._tp(sx, sz);
      if (typeof window._tpFace === 'function') window._tpFace(Math.atan2(a.cx - r.x, -(a.cz - r.z)));
      return r ? { ok: true, x: r.x, z: r.z } : { ok: false };
    }, { ax, cx: d.cx, cz: d.cz, start: START_TILES });
    if (!placed.ok) { results.push({ ...d, drove: false }); continue; }
    await sleep(350);

    await holdFwd(true); await sleep(60);
    let fired = null, best = null, moved = 0, first = null;
    for (let s = 0; s < STEPS; s++) {
      await sleep(STEP_MS);
      const t = await eng.evaluate(a => {
        const G = window.GRID || 2, p = window._playerPoseProbe();
        if (!p) return null;
        const rec = (window._cabDoors || [])[a.i];
        if (!rec) return null;
        const px = p.x, pz = p.z, rot = (typeof p.rot === 'number') ? p.rot : (p.rotation || 0);
        // EVERY TERM, recomputed exactly as Engine9:81582-81688 does it.
        const dFront = a.ax ? Math.abs(px - rec.cx) : Math.abs(pz - rec.cz);
        const dSide  = a.ax ? Math.abs(pz - rec.cz) : Math.abs(px - rec.cx);
        const toDoor = a.ax ? (rec.cx - px) : (rec.cz - pz);
        const fwdAxis = a.ax ? Math.sin(rot) : -Math.cos(rot);
        const faceMin = (typeof window._cabDoorFaceMin === 'number') ? window._cabDoorFaceMin : 0.5;
        const eff = window._cabDoorProxEff || {};
        const front = (rec.isDungeonExit ? (eff.dungeonFront != null ? eff.dungeonFront : 1.55)
                                         : (eff.front != null ? eff.front : 0.25)) * G;
        return {
          x: px, z: pz, rot,
          frontT: dFront / G, sideT: dSide / G,
          okFront: dFront < front,
          okFace:  (fwdAxis * toDoor) > 0 && Math.abs(fwdAxis) >= faceMin,
          pushTarget: (window._cabDoorNearestOnly === false) || (window._cabPushDoor === rec),
          anim: !!rec.anim, open: rec.open === true
        };
      }, { i: d.i, ax });
      if (!t) break;
      if (first === null) first = t;
      moved = Math.hypot(t.x - placed.x, t.z - placed.z) / 2;
      if (!best || t.frontT < best.frontT) best = t;
      if (t.anim || t.open) { fired = t; break; }
    }
    await holdFwd(false);
    await sleep(250);
    results.push({ ...d, drove: true, movedTiles: +moved.toFixed(2),
                   openedAtTiles: fired ? +fired.frontT.toFixed(2) : null,
                   closest: best ? +best.frontT.toFixed(2) : null,
                   closestSide: best ? +best.sideT.toFixed(2) : null,
                   blockers: best ? Object.entries({ front: best.okFront, facing: best.okFace,
                                                     pushTarget: best.pushTarget })
                                     .filter(([, v]) => !v).map(([k]) => k) : [] });
  }

  // ── RESOLVE EACH DOOR'S REAL TILES FROM THE MAP. NEVER BY ROUNDING THE CENTRE. ──────────────
  // A 2-tile doorway's centre is a .5 coordinate, so rounding picks one of the two arbitrarily, and
  // taking all four neighbours sweeps in plain FLOOR tiles — origamiunderworld-96 hit exactly that and
  // caught it only by type-checking. So: look at the four candidate tiles around the centre and keep
  // ONLY the ones the map says are actually doors. A record that resolves to NO door tile is reported
  // loudly rather than emitted with an empty list for a gate to trip over later.
  console.log('DOOR OPEN-DISTANCE  (walked into with a HELD key — the only opener that exists)');
  console.log('  thresholds in force : ' + JSON.stringify(setup.eff));
  console.log('  pose fields         : ' + JSON.stringify(setup.poseKeys));
  console.log('  door records        : ' + setup.doors.length);
  let opened = 0, stuck = 0, noMove = 0;
  for (const r of results) {
    const at = '(' + (r.cx / 2).toFixed(1) + ',' + (r.cz / 2).toFixed(1) + ')';
    if (!r.drove) { console.log('    ' + r.approach + '-door ' + at + '  ⛔ could not place the player'); continue; }
    if (r.movedTiles < 0.2) { noMove++;
      console.log('    ' + r.approach + '-door ' + at + '  ⛔ PLAYER NEVER MOVED (' + r.movedTiles
                  + ' tiles) — forward intent is not reaching the engine; this reading says NOTHING about the door');
      continue; }
    if (r.openedAtTiles !== null) { opened++;
      const good = r.openedAtTiles <= 0.30;
      console.log('    ' + r.approach + '-door ' + at + (r.isDungeonExit ? ' [dungeon exit]' : '')
                  + '  ' + (good ? '✓' : '⚠') + ' opened at ' + r.openedAtTiles + ' tiles'
                  + '   (walked ' + r.movedTiles + ')');
    } else { stuck++;
      console.log('    ' + r.approach + '-door ' + at + (r.isDungeonExit ? ' [dungeon exit]' : '')
                  + '  ✗ did not open — closest ' + r.closest + ' tiles front / ' + r.closestSide + ' side'
                  + ', walked ' + r.movedTiles
                  + '   BLOCKED ON: ' + (r.blockers.length ? r.blockers.join(' + ') : 'nothing — all recomputed terms passed, so the blocker is _dSide/_sideMax or nearest-door arbitration'));
    }
  }
  console.log('  opened: ' + opened + '   did not open: ' + stuck + '   never moved: ' + noMove);

  if (EMIT) {
    const doors = results.map(r => {
      const tiles = r.tiles || [];
      const verdict = (!r.drove || r.movedTiles < 0.2) ? 'undriven'
                    : (r.openedAtTiles !== null ? 'opens' : 'never');
      const front = (setup.eff && setup.eff.front != null) ? setup.eff.front : 0.25;
      const rec = {
        id: (r.approach || '?') + '-' + (tiles.length ? tiles[0].join('-') : Math.round(r.cx) + 'w-' + Math.round(r.cz) + 'w'),
        tiles: tiles,
        isDungeonExit: !!r.isDungeonExit,
        verdict: verdict,
        opensAtTiles: verdict === 'opens' ? r.openedAtTiles : null,
        blockedBy: verdict === 'never'
          ? (r.blockers.length
              ? r.blockers.map(b => b === 'front' ? ('front(' + r.closest + '>' + front + ')') : b).join('+')
              : 'unknown(all recomputed terms passed — _dSide/_sideMax or nearest-door arbitration)')
          : (verdict === 'undriven' ? 'probe could not walk the player into this door' : null)
      };
      // pathRelevant:false ONLY with its measured evidence attached — -96's gate rejects a bare
      // claim, correctly: an assertion without evidence is just a quieter way of guessing.
      if (r.pathRelevant === false && r.reason) { rec.pathRelevant = false; rec.reason = r.reason; }
      else if (r.reason) rec.reason = r.reason;
      return rec;
    });
    const payload = { floor: 1, generatedAt: new Date().toISOString(),
                      thresholds: setup.eff, doors: doors };
    fs.mkdirSync(path.dirname(EMIT), { recursive: true });
    fs.writeFileSync(EMIT, JSON.stringify(payload, null, 1));
    const empty = doors.filter(d => !d.tiles.length);
    console.log('  verdicts   : ' + EMIT);
    console.log('               ' + doors.map(d => d.id + '=' + d.verdict).join('  '));
    if (empty.length) console.log('  ⚠ ' + empty.length + ' door record(s) resolve to NO door tile on the map: '
                                  + empty.map(d => d.id).join(', ')
                                  + '  — a runtime door with no map tile behind it. Reported, not papered over.');
  }
  console.log('  pageerrors: ' + errs.length + (errs.length ? '  ' + errs[0] : ''));
  await b.close();
  process.exit(errs.length || noMove === results.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
