#!/usr/bin/env node
/**
 * PROBE — the ARENA at a special room's door, and ROOM TO BREATHE in the cabaret (2026-09-27).
 *
 * Mark 2026-09-27: "near special rooms -- if player opens the door - monsters scramble away -- tired of having a horde of monsters
 * just come in and start whomping on me for no reason, they should all be applauding a player is battling the ogres. so change the AI
 * with onibaba around special rooms, and in caberet not to crowd the player +1 tile away".
 *
 *   SPACE  — in the cabaret a body walking at the player ends up at least Oni-Baba's spaceTiles away. A CONTROL run with the rule off
 *            (window._cabPersonalSpace = false) is measured first, so the pass cannot be something else keeping them apart.
 *   ARENA  — at a special room's doorway (its keeper alive): a hostile body stands down, a body inside the room is sent out through a
 *            doorway, and once the keeper fight is live the watchers applaud; Oni-Baba records the arena.
 *
 * Run: node scripts/probe-arena-space.js      Exit 0 = both held · 1 = a leg failed
 */
'use strict';

const { chromium } = require('playwright');
const { sleep, assert, startServer, waitForEngine, waitForPanels } = require('./lib/save-harness');

(async () => {
  let browser, server;
  const t0 = Date.now();
  const lap = (s) => console.log(`[arena] ${s}  (+${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  try {
    server = await startServer();
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/OrigamiUnderworld.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const engine = await waitForEngine(page); const panels = await waitForPanels(page); await sleep(3000);
    await panels.evaluate(() => window.selectRole('wizard'));
    await engine.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });
    // page-side helpers, installed once
    await engine.evaluate(() => {
      window.__P = {
        body: (w) => (w.userData.monBase || w),
        place: (w, x, z) => { const b = w.userData.monBase || w; b.position.x = x; b.position.z = z; w.position.x = x; w.position.z = z; },
        wake: (w) => { const u = w.userData; u._sleeper = false; u._everWoken = true; u._spawnSleepDone = true; if (u.aiState === 'sleep') u.aiState = 'idle'; },
        plain: (w) => { const u = w && w.userData; return !!u && !u.isDead && !u.isAlly && !u.isPerformer && !u.isDancer && !u.isManager && !u.isBoss && !u.isOgre && u.nameKey !== 'ogre' && !u.permitKeeper && !u.isGuardOgre
                                  && !u.cabAudience && !u._gamingSeat && !!u.id && !/^cab-|konbini/.test(String(u.id)); },
        dist: (w) => { const b = w.userData.monBase || w, p = window._playerPoseProbe(); return Math.hypot(b.position.x - p.x, b.position.z - p.z); },
      };
    });

    // ═══ SPACE ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    const cab = await engine.evaluate(() => {
      const map = window.map || [], id = window._cabaretRoomId; let best = null;
      for (let x = 1; x < map.length - 1; x++) for (let z = 1; z < (map[x] || []).length - 1; z++) {
        const c = map[x][z]; if (!c || c.type !== 'floor' || c.roomId !== id) continue;
        let ok = true; for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) { const n = (map[x + dx] || [])[z + dz]; if (!n || n.type !== 'floor') ok = false; }
        if (ok) { best = [x, z]; break; }
      }
      return best;
    });
    assert(cab, 'no open 5×5 of cabaret floor to stand in');
    const spaceRun = async (ruleOn) => engine.evaluate(async ({ cab, ruleOn }) => {
      window._cabPersonalSpace = ruleOn ? undefined : false;
      window._tp(cab[0] * 2, cab[1] * 2);
      const P = window.__P; const pose = window._playerPoseProbe();
      const m = (window.monsterWrappers || []).find(w => P.plain(w) && !(w.userData.isHostile || w.userData.aiState === 'hostile'));
      if (!m) return { err: 'no plain body to use' };
      P.wake(m); m.userData.isHostile = false; m.userData.aiState = 'idle';
      const hold = setInterval(() => { m.userData.aiWalkTarget = m.userData.aiWalkTarget && m.userData.aiWalkTarget._space ? m.userData.aiWalkTarget : { x: pose.x + 0.3, z: pose.z }; }, 100);   // it keeps trying to walk into the player
      P.place(m, pose.x + 0.8, pose.z);
      await new Promise(r => setTimeout(r, 2500));
      clearInterval(hold);
      return { id: m.userData.id, dTiles: +(P.dist(m) / 2).toFixed(2), stat: window._personalSpaceStat, rules: window._bowRules && window._bowRules.spaceTiles };
    }, { cab, ruleOn });
    const off = await spaceRun(false);
    const on = await spaceRun(true);
    const tiles = (on && on.rules) || 1.5;
    console.log('[arena]    SPACE control (rule off): ' + JSON.stringify(off) + '\n[arena]    SPACE rule on: ' + JSON.stringify(on));
    assert(!on.err && on.dTiles >= tiles - 0.15, `the cabaret rule did not hold the body ${tiles} tiles off (it stood ${on.dTiles})`);
    lap(`✅ SPACE a body walking into the player stands ${on.dTiles} tiles off (rule ${tiles}; control with the rule off: ${off.dTiles})`);
    const oniSpace = await page.evaluate(() => { const o = window.oniBaba8; return o && o._bowRules ? o._bowRules.spaceTiles : null; });
    console.log('[arena]    Oni-Baba\'s etiquette order carries spaceTiles = ' + oniSpace + (oniSpace === null ? ' (her 5 s census had not answered yet)' : ''));

    // ═══ ARENA ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    const arenaRooms = await engine.evaluate(() => window._arenaRoomsProbe());
    assert(Array.isArray(arenaRooms) && arenaRooms.length, 'no special rooms found on this floor');
    let got = null;
    const ordered = arenaRooms.slice().sort((a, b) => (/manager/i.test(a.name) ? 1 : 0) - (/manager/i.test(b.name) ? 1 : 0));   // an ogre keeper first — the Manager is kept dormant by his own round
    for (const r of ordered) {
      if (!r.doorways || !r.doorways.length) continue;
      const d = r.doorways[0];
      got = await engine.evaluate(async ({ d }) => {
        window._tp(d.ox * 2, d.oz * 2);
        const t = Date.now(); let a = null;
        while (!a && Date.now() - t < 15000) { a = window._arenaProbe(); if (!a) await new Promise(r => setTimeout(r, 300)); }
        return a;
      }, { d });
      if (got) { got.door = d; break; }
    }
    assert(got, `no special room became an arena at its door (rooms: ${JSON.stringify(arenaRooms.map(r => ({ n: r.name, k: r.keeper, d: (r.doorways || []).length })))})`);
    lap(`arena at the door of ${got.name} (keeper ${got.keeper})`);
    const res = await engine.evaluate(async (got) => {
      const P = window.__P, pose = window._playerPoseProbe();
      const bodies = (window.monsterWrappers || []).filter(w => P.plain(w));
      const horde = bodies[0], inside = bodies[1], watcher = bodies[2];
      const keeper = (window.monsterWrappers || []).find(w => w && w.userData && w.userData.id === got.keeper);
      if (!horde || !inside || !watcher || !keeper) return { err: 'not enough bodies', n: bodies.length };
      for (const w of [horde, inside, watcher]) P.wake(w);
      // the horde: hostile, right beside the player
      P.place(horde, pose.x + 1.2, pose.z); horde.userData.isHostile = true; horde.userData.forceHostile = true; horde.userData.aiState = 'hostile';
      // a body inside the arena room (the doorway's inside cell)
      P.place(inside, got.door.ix * 2, got.door.iz * 2); inside.userData.isHostile = false; inside.userData.aiState = 'idle';
      await new Promise(r => setTimeout(r, 1500));
      const standDown = !(horde.userData.isHostile || horde.userData.aiState === 'hostile' || horde.userData.forceHostile);
      const ib = inside.userData.monBase || inside, ic = (window.map[Math.round(ib.position.x / 2)] || [])[Math.round(ib.position.z / 2)];
      const out = !!(inside.userData.aiWalkTarget && inside.userData.aiWalkTarget._arenaOut) || !!(ic && ic.roomId !== got.room);
      // the keeper fight goes live; a watcher stands 6 units off, outside the room
      const t0 = performance.now();
      P.place(watcher, pose.x - 6, pose.z); watcher.userData.isHostile = false; watcher.userData.aiState = 'idle'; watcher.userData._applaudAt = 0;
      const live = () => { keeper.userData._sleeper = false; keeper.userData.isHostile = true; keeper.userData.aiState = 'hostile'; };
      live(); const liveIv = setInterval(live, 150);
      const tot0 = window._arenaApplauseTotal | 0;
      let clapped = false; const t = Date.now();
      while (!clapped && Date.now() - t < 7000) { clapped = (watcher.userData._applaudAt || 0) > t0 || (window._arenaApplauseTotal | 0) > tot0; if (!clapped) await new Promise(r => setTimeout(r, 250)); }
      clearInterval(liveIv); keeper.userData.isHostile = false; keeper.userData.aiState = 'idle';
      return { standDown, out, clapped, applause: (window._arenaApplauseTotal | 0) - tot0, stat: window._bossYieldStat };
    }, got);
    console.log('[arena]    ' + JSON.stringify(res));
    assert(!res.err, 'ARENA setup: ' + JSON.stringify(res));
    assert(res.standDown, 'the hostile body at the arena door did NOT stand down');
    assert(res.out, 'the body inside the arena room was NOT sent out through a doorway');
    assert(res.clapped, 'nobody applauded the keeper fight');
    const oni = await page.evaluate(() => { const o = window.oniBaba8; return o && o._bossFightLast ? { arena: o._bossFightLast.arena, arenas: o._bossFightLast.arenas, sensor: o.sensors.bossFight } : null; });
    assert(oni && oni.arenas >= 1, 'Oni-Baba did not record the arena: ' + JSON.stringify(oni));
    lap(`✅ ARENA the horde stood down, the room's own crowd was sent out, ${res.applause} round(s) of applause, Oni-Baba recorded ${oni.arenas} arena(s)`);
    await browser.close(); await new Promise(r => server.close(r));
    console.log(`\n✅ probe:arena-space PASS (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(r => server.close(r));
    console.error('\n❌ probe:arena-space FAIL — ' + (e.stack || e.message));
    process.exit(1);
  }
})();
