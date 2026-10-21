#!/usr/bin/env node
/**
 * PROBE — UP AND DOWN THE STAIRS, EACH FLOOR IS STILL THERE (2026-09-28).
 *
 * Mark 2026-09-28: "fix it so player can go up and down stairs and the previous dungeon is there - otherwise wtf".
 * Drives the REAL stairs (the loop's own step-on trigger, not a synthetic transition): floor 1 → 2 → 1 → 2, marking each
 * floor before leaving it (a body killed, a card dropped, gold in the House, a room woken, a door splintered) and reading
 * the marks back on each return, plus where the player stands on arrival.
 *
 * Run: node scripts/probe-stairs-floors.js      Exit 0 = every floor came back as it was left · 1 = something did not
 */
'use strict';

const { chromium } = require('playwright');
const { sleep, assert, startServer, waitForEngine, waitForPanels, waitForReload, pollFrame } = require('./lib/save-harness');

(async () => {
  let browser, server;
  const t0 = Date.now();
  const lap = (s) => console.log(`[stairs] ${s}  (+${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const logs = [];
  try {
    server = await startServer();
    browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
    const page = await (await browser.newContext()).newPage();
    page.on('console', m => { const t = m.text(); if (/\[LOAD\]|\[save\]|RunLedger|run-ledger|ledger|\[STAIRS\]|\[stairs\]/i.test(t)) logs.push(t.slice(0, 300)); });
    await page.goto(`http://127.0.0.1:${server.address().port}/OrigamiUnderworld.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => { window.__logs = []; window.addEventListener('message', e => { const d = e.data; if (d && (d.type === 'LOG_EVENT' || d.type === 'MODAL_STATE' || d.type === 'ENGINE_ANOMALY' || /_REQUEST$|RUN_LEDGER/.test(String(d.type)))) window.__logs.push((performance.now()/1000).toFixed(1) + ' ' + d.type + ' ' + String(d.text || d.code || d.open || d.floor || d.requestId || '').replace(/<[^>]+>/g, '').slice(0, 160)); }); });
    let engine = await waitForEngine(page); const panels = await waitForPanels(page); await sleep(3000);
    await panels.evaluate(() => window.selectRole('wizard'));
    await engine.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });
    lap('booted on floor 1');

    // the marks left on a floor, and reading them back
    const mark = (tag) => engine.evaluate(async (tag) => {
      const G = 2, map = window.map || [], out = { tag };
      // home: a floor tile clear of every stair tile (standing back on the flight you arrived on IS taking the stairs)
      const stairs = []; for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; if (c && /^stairs_/.test(c.type || '')) stairs.push([x, z]); }
      const p0 = window._playerPoseProbe(), g0x = Math.round(p0.x / G), g0z = Math.round(p0.z / G); let home = null;
      for (let r = 2; r <= 8 && !home; r++) for (let dx = -r; dx <= r && !home; dx++) for (let dz = -r; dz <= r && !home; dz++) { const c = (map[g0x + dx] || [])[g0z + dz];
        if (c && c.type === 'floor' && !stairs.some(s => Math.hypot(s[0] - (g0x + dx), s[1] - (g0z + dz)) < 2.5)) home = [g0x + dx, g0z + dz]; }
      if (home) { window._tpTile(home[0], home[1]); await new Promise(r => setTimeout(r, 400)); }
      const pose = window._playerPoseProbe(), gx = Math.round(pose.x / G), gz = Math.round(pose.z / G);
      // a card the FLOOR dealt (a lootId), picked up by walking onto it: it must not be dealt again on the way back
      const dealt = (window.lootItems || []).filter(c => c && c.userData && c.userData.lootId && !/^starter:/.test(String(c.userData.lootId)) && !c.userData.isShopItem && c.position && Math.abs(c.position.x) < 5000)
        .sort((a, b) => ((/^(hall|room)-loot-/.test(String(b.userData.lootId)) ? 1 : 0) - (/^(hall|room)-loot-/.test(String(a.userData.lootId)) ? 1 : 0))   // the floor plan's own cards first (the kind measured coming back)
          || Math.hypot(a.position.x - pose.x, a.position.z - pose.z) - Math.hypot(b.position.x - pose.x, b.position.z - pose.z))[0];
      if (dealt) {
        const id = dealt.userData.lootId; window._tp(dealt.position.x, dealt.position.z);
        const t = Date.now(); while ((window.lootItems || []).includes(dealt) && Date.now() - t < 4000) await new Promise(r => setTimeout(r, 200));
        out.picked = { lootId: id, name: dealt.userData.cardName || null, gone: !(window.lootItems || []).includes(dealt) };
        window._tp(pose.x, pose.z); await new Promise(r => setTimeout(r, 300));
      }
      // a body killed through the real damage path (a few candidates, a few blows — a guard can block one)
      const cands = (window.monsterWrappers || []).filter(m => m && m.userData && m.userData.id && !m.userData.isDead && !m.userData.isAlly && !m.userData.isBoss
        && m.userData.nameKey !== 'ogre' && !m.userData.permitKeeper && !/^cab-|konbini|ant-/.test(String(m.userData.id)));
      for (const w of cands.slice(0, 6)) {
        for (let i = 0; i < 4 && !w.userData.isDead; i++) { try { window._applyMonsterDamage(w, 99999, 'physical'); } catch (e) { out.killErr = e.message; } await new Promise(r => setTimeout(r, 150)); }
        if (w.userData.isDead) { out.killed = w.userData.id; break; }
      }
      // a card on the floor 3-6 tiles off; the stair step-off keeps clear of it (window.__probeAvoid)
      let spot = null;
      for (let r = 3; r <= 6 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dz = -r; dz <= r && !spot; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const c = (map[gx + dx] || [])[gz + dz]; if (c && c.type === 'floor') spot = [gx + dx, gz + dz]; }
      if (spot) { const card = window.spawnLootCard(spot[0], spot[1], 'ITEM', 'STAIRS PROBE ' + tag, 'Left on this floor.', '階', ''); if (card) out.card = { x: +card.position.x.toFixed(2), z: +card.position.z.toFixed(2) }; }
      window.__probeAvoid = spot ? [spot] : [];
      // the floor itself: every tile's type + room, the spawn list, the dealt cards still lying there
      let h = 0; for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; const s = c ? (c.type || '') + (c.roomId ?? '') : '.'; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; }
      out.layout = h; out.spawns = (window._mobSpawnsProbe || []).length;
      // gold in the House (a floor part)
      if (typeof window._houseAdd === 'function') { window._houseAdd(tag === 'F1' ? 111 : 222, 'player'); out.house = window._houseBank | 0; }
      // a door splintered
      const doors = (typeof window._allDoors === 'function' ? window._allDoors() : []).filter(d => d && typeof d.cx === 'number' && typeof d.maxHp === 'number' && !d.destroyed);
      if (doors[0]) { doors[0].hp = 0; doors[0].destroyed = true; out.door = doors[0].cx + ',' + doors[0].cz; }
      out.seed = window._origamiGameSeed; out.floor = window._currentFloor;
      return out;
    }, tag);
    const read = (m) => engine.evaluate((m) => {
      const G = 2, map = window.map || [];
      const pose = window._playerPoseProbe(), gx = Math.round(pose.x / G), gz = Math.round(pose.z / G);
      let down = null, up = null;
      for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; if (!c) continue; if (c.type === 'stairs_down') down = [x, z]; if (c.type === 'stairs_up' && !up) up = [x, z]; }
      const body = m.killed ? (window.monsterWrappers || []).find(w => w && w.userData && w.userData.id === m.killed) : null;
      const card = m.card ? (window.lootItems || []).find(c => c && c.userData && /STAIRS PROBE/.test(String(c.userData.cardName || '')) && Math.hypot(c.position.x - m.card.x, c.position.z - m.card.z) < 1.5) : null;
      const door = m.door ? (window._allDoors() || []).find(d => d && (d.cx + ',' + d.cz) === m.door) : null;
      let h = 0; for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; const s = c ? (c.type || '') + (c.roomId ?? '') : '.'; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; }
      const staged = []; try { if (window._segmentStagedLoot) for (const a of window._segmentStagedLoot.values()) staged.push(...(a || [])); } catch (_) {}
      const redealt = (m.picked && m.picked.lootId) ? [...(window.lootItems || []), ...staged].some(c => c && c.userData && c.userData.lootId === m.picked.lootId) : null;
      const ob = window.getOniBabaSafe && window.getOniBabaSafe();
      return {
        layout: h, layoutSame: m.layout === undefined ? null : (m.layout === h), spawns: (window._mobSpawnsProbe || []).length,
        oniStairs: ob && ob._stairsLast ? { ok: ob._stairsLast.ok, dir: ob._stairsLast.dir, from: ob._stairsLast.from, to: ob._stairsLast.to, health: ob.sensors.stairsHealth } : null,
        pickedRedealt: redealt, sweep: window._takenSweepLast || null, sweptEarly: window._takenSweepEarly || 0, asks: window._runLedgerAsks || null,
        storage: (() => { let n = 0, big = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), v = localStorage.getItem(k) || ''; n += k.length + v.length; if (v.length > 20000) big.push(k.replace('origami.v8.', '') + '=' + Math.round(v.length / 1000) + 'k'); } } catch (_) {} return { kchars: Math.round(n / 1000), big }; })(), arrival: window._stairsArrival || null, oniArrived: ob && ob._saveLast ? ob._saveLast.arrived : undefined,
        floor: window._currentFloor, seed: window._origamiGameSeed,
        at: [gx, gz], tile: (map[gx] && map[gx][gz] && map[gx][gz].type) || null,
        fromDown: down ? +Math.hypot(gx - down[0], gz - down[1]).toFixed(1) : null, fromUp: up ? +Math.hypot(gx - up[0], gz - up[1]).toFixed(1) : null, down, up,
        killedBack: m.killed ? (body ? (body.userData.isDead ? 'dead' : 'ALIVE') : 'gone') : null,
        cardBack: m.card ? !!card : null, house: window._houseBank | 0, doorBack: m.door ? (door ? (door.destroyed ? 'splintered' : 'WHOLE') : 'missing') : null,
        census: window._saveCensusLast ? { phase: window._saveCensusLast.phase, parts: window._saveCensusLast.parts } : null,
        rejected: window._loadPosRejected || null, ledger: window._runLedgerDiagnostics ? window._runLedgerDiagnostics().floors : null,
      };
    }, m);
    // step on a stair tile the way a player does: off the flight first (the arrival guard), then onto it
    const reloaded = async (label) => {
      const ok = await pollFrame(page, () => window.__engineReady === false, null, { timeout: 30000, every: 200 });
      if (!ok) { const l = await page.evaluate(() => (window.__logs || []).slice(-25)).catch(e => ['(could not read: ' + e.message + ')']); throw new Error(label + ': the stairs never started a floor change in 30 s. Shell messages:\n  ' + l.join('\n  ')); }
      return waitForEngine(page);
    };
    const take = async (kind) => {
      const r = await engine.evaluate(async (kind) => {
        const G = 2, map = window.map || []; let t = null;
        for (let x = 0; x < map.length && !t; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; if (c && c.type === kind) { t = [x, z]; break; } }
        if (!t) return { err: 'no ' + kind + ' tile on this floor' };
        // a floor tile 3+ tiles away first
        const avoid = window.__probeAvoid || [];
        let off = null; for (let r = 3; r <= 8 && !off; r++) for (let dx = -r; dx <= r && !off; dx++) for (let dz = -r; dz <= r && !off; dz++) { const c = (map[t[0] + dx] || [])[t[1] + dz];
          if (c && c.type === 'floor' && !avoid.some(a => Math.hypot(a[0] - (t[0] + dx), a[1] - (t[1] + dz)) < 2.5)) off = [t[0] + dx, t[1] + dz]; }
        if (off) { window._tpTile(off[0], off[1]); await new Promise(r => setTimeout(r, 700)); }
        const locked = !!window._dungeonChainFloor && (window._casinoLoop !== false) && !window._exitUnlocked && window._descentIsGuard !== true;
        window._tpTile(t[0], t[1]);
        return { tile: t, off, lockedGate: locked };
      }, kind);
      return r;
    };

    // ═══ floor 1: mark it, go down ═══
    const tiles = () => engine.evaluate(() => { const map = window.map || [], out = []; for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; out.push(c ? (c.type || '') + '/' + (c.roomId ?? '') : '.'); } return { w: (map[0] || []).length, out }; });
    const diffTiles = (a, b) => { const d = []; for (let i = 0; i < Math.max(a.out.length, b.out.length); i++) if (a.out[i] !== b.out[i]) d.push(`(${Math.floor(i / a.w)},${i % a.w}) ${a.out[i]} → ${b.out[i]}`); return d; };
    const m1 = await mark('F1');
    await sleep(1200); const firstTiles1 = await tiles();   // after the door tick has swapped the splintered door's tiles
    lap('floor 1 marked ' + JSON.stringify(m1));
    const t1 = await take('stairs_down'); lap('floor 1 → stairs_down ' + JSON.stringify(t1));
    engine = await reloaded('stairs');
    await pollFrame(engine, () => window._loopStarted === true && window._saveCensusLast && window._saveCensusLast.phase === 'stairs', null, { timeout: 120000 });
    await sleep(1500);
    const a2 = await read({}); lap('arrived floor 2 ' + JSON.stringify(a2));
    assert(a2.floor === 2, 'the stairs down did not reach floor 2');

    // ═══ floor 2: mark it, go up ═══
    const m2 = await mark('F2');
    await sleep(1200); const firstTiles2 = await tiles();
    lap('floor 2 marked ' + JSON.stringify(m2));
    const t2 = await take('stairs_up'); lap('floor 2 → stairs_up ' + JSON.stringify(t2));
    engine = await reloaded('stairs');
    await pollFrame(engine, () => window._loopStarted === true && window._saveCensusLast && window._saveCensusLast.phase === 'stairs', null, { timeout: 120000 });
    await sleep(2500);
    const b1 = await read(m1); lap('back on floor 1 ' + JSON.stringify(b1));
    const backTiles1 = await tiles(); const d1 = diffTiles(firstTiles1, backTiles1);
    console.log(`[stairs]    floor 1 tiles changed: ${d1.length}` + (d1.length ? '\n      ' + d1.slice(0, 40).join('\n      ') : ''));

    // ═══ floor 1 again: down again ═══
    const t3 = await take('stairs_down'); lap('floor 1 → stairs_down again ' + JSON.stringify(t3));
    engine = await reloaded('stairs');
    await pollFrame(engine, () => window._loopStarted === true && window._saveCensusLast && window._saveCensusLast.phase === 'stairs', null, { timeout: 120000 });
    await sleep(2500);
    const b2 = await read(m2); lap('back on floor 2 ' + JSON.stringify(b2));
    const d2 = diffTiles(firstTiles2, await tiles());
    console.log(`[stairs]    floor 2 tiles changed: ${d2.length}` + (d2.length ? '\n      ' + d2.slice(0, 40).join('\n      ') : ''));

    const bad = [];
    if (b1.floor !== 1) bad.push('the stairs up did not reach floor 1');
    if (b1.seed !== m1.seed || b2.seed !== m1.seed) bad.push('the dungeon seed changed');
    if (b1.killedBack !== 'dead' && b1.killedBack !== 'gone') bad.push(`floor 1: the body killed there is ${b1.killedBack}`);
    if (b2.killedBack !== 'dead' && b2.killedBack !== 'gone') bad.push(`floor 2: the body killed there is ${b2.killedBack}`);
    if (!b1.cardBack) bad.push('floor 1: the card left there is gone');
    if (!b2.cardBack) bad.push('floor 2: the card left there is gone');
    if (b1.house !== m1.house) bad.push(`floor 1: House ${b1.house}, left at ${m1.house}`);
    if (b2.house !== m2.house) bad.push(`floor 2: House ${b2.house}, left at ${m2.house}`);
    if (m1.door && b1.doorBack !== 'splintered') bad.push(`floor 1: the splintered door is ${b1.doorBack}`);
    if (m2.door && b2.doorBack !== 'splintered') bad.push(`floor 2: the splintered door is ${b2.doorBack}`);
    if (!m1.killed) bad.push('floor 1: the probe could not kill a body (no kill to check)');
    if (!m2.killed) bad.push('floor 2: the probe could not kill a body (no kill to check)');
    if (d1.length) bad.push(`floor 1: ${d1.length} tile(s) of the layout changed on the way back: ${d1.slice(0, 6).join('; ')}`);
    if (d2.length) bad.push(`floor 2: ${d2.length} tile(s) of the layout changed on the way back: ${d2.slice(0, 6).join('; ')}`);
    if (m1.picked && m1.picked.gone && b1.pickedRedealt) bad.push(`floor 1: the card picked up there (${m1.picked.name}) was dealt again`);
    if (m2.picked && m2.picked.gone && b2.pickedRedealt) bad.push(`floor 2: the card picked up there (${m2.picked.name}) was dealt again`);
    if (!(b1.oniArrived && b1.oniArrived.at === 'stairs_down')) bad.push('floor 1: Oni-Baba\'s stairs census did not record the arrival at the stairs down: ' + JSON.stringify(b1.oniArrived));
    if (!(b1.oniStairs && b1.oniStairs.ok && b1.oniStairs.dir === 'ascend' && b1.oniStairs.from === 2 && b1.oniStairs.health === 1)) bad.push('floor 1: Oni-Baba\'s stairsHealth did not score the climb: ' + JSON.stringify(b1.oniStairs));
    if (!(b1.fromDown !== null && b1.fromDown <= 2.5)) bad.push(`floor 1: came UP but stands ${b1.fromDown} tiles from its stairs down (at ${b1.at}, the spawn is by the stairs up: ${b1.fromUp})`);
    if (!(b2.fromUp !== null && b2.fromUp <= 2.5)) bad.push(`floor 2: came DOWN but stands ${b2.fromUp} tiles from its stairs up`);
    console.log('\n[stairs] console lines:\n  ' + logs.slice(-25).join('\n  '));
    await browser.close(); await new Promise(r => server.close(r));
    if (bad.length) { console.log('\n❌ probe:stairs-floors — ' + bad.length + ' thing(s) not as left:\n  - ' + bad.join('\n  - ')); process.exit(1); }
    console.log(`\n✅ probe:stairs-floors PASS — 1 → 2 → 1 → 2, every floor as it was left (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (e) {
    console.log('\n[stairs] console lines:\n  ' + logs.slice(-25).join('\n  '));
    try { console.log('\n[stairs] shell messages:\n  ' + (await page.evaluate(() => (window.__logs || []).slice(-20))).join('\n  ')); } catch (_) {}
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(r => server.close(r));
    console.error('\n❌ probe:stairs-floors FAIL — ' + (e.stack || e.message));
    process.exit(1);
  }
})();
