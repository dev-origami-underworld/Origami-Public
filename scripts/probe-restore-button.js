#!/usr/bin/env node
/**
 * PROBE — the guide's RESTORE button loads the save it names, and the player stands where they saved (2026-09-28).
 * Mark 2026-09-28: "clicking save - saves a record -- restore does nothing". The load tests posted LOAD_NOW themselves and never
 * went through window.loadSavedGame, whose row lookup threw on a name like "Floor 1 — WIZARD — 14:05" before LOAD_NOW was sent.
 * This drives the button's own handler (PlayerGuide._restoreSelectedSave → loadSavedGame → LOAD_NOW) in Mark's Chrome.
 * knowledge/design/SAVE_GAME_2026-09-27.md §5.   Run: node scripts/probe-restore-button.js   Exit 0 = restored to the spot.
 */
'use strict';
const { chromium } = require('playwright');
const { sleep, startServer, waitForEngine, waitForPanels, pollFrame } = require('./lib/save-harness');
(async () => {
  let browser, server; const t0 = Date.now();
  try {
    server = await startServer();
    browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/OrigamiUnderworld.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let engine = await waitForEngine(page); let panels = await waitForPanels(page); await sleep(3000);
    await panels.evaluate(() => window.selectRole('wizard'));
    await engine.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });
    // stand somewhere that is not the spawn, facing an odd way
    const saved = await engine.evaluate(async () => {
      const G = 2, map = window.map || [], p = window._playerPoseProbe(), gx = Math.round(p.x / G), gz = Math.round(p.z / G); let t = null;
      for (let r = 6; r <= 12 && !t; r++) for (let dx = -r; dx <= r && !t; dx++) for (let dz = -r; dz <= r && !t; dz++) { const c = (map[gx + dx] || [])[gz + dz]; if (c && c.type === 'floor') t = [gx + dx, gz + dz]; }
      window._tpTile(t[0], t[1]); window._tpFace(1.234); await new Promise(r => setTimeout(r, 600));
      const q = window._playerPoseProbe(); return { x: q.x, z: q.z, rot: q.rot };
    });
    // SAVE CURRENT through the guide
    await panels.evaluate(() => window.welcomeGuide._saveFromGuide());
    const name = await pollFrame(engine, () => window._saveLastName || null, null, { timeout: 30000 });
    await sleep(1500);
    // walk away, then press RESTORE (the click handler: wg._restoreSelectedSave())
    await engine.evaluate(() => { const map = window.map || []; for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) if (map[x][z] && map[x][z].type === 'floor') { window._tpTile(x, z); return; } });
    await panels.evaluate((n) => { const wg = window.welcomeGuide; wg._selectedSaveName = n; wg._restoreSelectedSave(); }, name);
    const reloaded = await pollFrame(page, () => window.__engineReady === false, null, { timeout: 15000, every: 150 });
    if (!reloaded) throw new Error(`RESTORE did nothing: the engine never reloaded for "${name}"`);
    engine = await waitForEngine(page);
    await pollFrame(engine, () => window._loopStarted === true && window._saveCensusLast && window._saveCensusLast.phase === 'load', null, { timeout: 120000 });
    await sleep(1500);
    const back = await engine.evaluate(() => { const q = window._playerPoseProbe(); return { x: q.x, z: q.z, rot: q.rot }; });
    const d = Math.hypot(back.x - saved.x, back.z - saved.z), dr = Math.abs(back.rot - saved.rot);
    console.log(`[restore] saved "${name}" at (${saved.x.toFixed(3)}, ${saved.z.toFixed(3)}) rot ${saved.rot.toFixed(3)} → back at (${back.x.toFixed(3)}, ${back.z.toFixed(3)}) rot ${back.rot.toFixed(3)} · drift ${d.toFixed(4)} · facing ${dr.toFixed(4)}`);
    await browser.close(); await new Promise(r => server.close(r));
    if (d > 0.05 || dr > 0.01) { console.log('\n❌ probe:restore-button — restored, but not to the saved spot'); process.exit(1); }
    console.log(`\n✅ probe:restore-button PASS — RESTORE loaded "${name}" and the player stands where they saved (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (e) {
    if (browser) await browser.close().catch(() => {}); if (server) await new Promise(r => server.close(r));
    console.error('\n❌ probe:restore-button FAIL — ' + (e.message || e)); process.exit(1);
  }
})();
