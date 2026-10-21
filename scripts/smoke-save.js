#!/usr/bin/env node
/**
 * G-SAVE — P1 real persistence smoke.
 *
 * Runs the pure adversarial ledger suite, then proves the live shell/Engine path: named SAVE_NOW → LOAD_NOW, a plain
 * browser refresh (a NEW dungeon, nothing restored — Mark 2026-09-21: "its a new dungeon every new game - that was the
 * promise" · "there is no resume other than save/restore"), a generated inter-floor ledger handoff, and a save made ON
 * floor 2 (the locked-番所 floor) restored back onto the same floor 2. The save PARTS (house, boss round, raid, floor
 * loot, guns, doors, purses) and Oni-Baba's saveHealth are proved by scripts/smoke-save-parts.js (2026-09-27).
 */

const { chromium } = require('playwright');
const { sleep, assert, startServer, waitForEngine, waitForPanels, waitForReload } = require('./lib/save-harness');   // the iframe regexes live there since 2026-09-27 (the 09-19 rename had left these stale)

(async () => {
  let browser;
  let server;
  const errors = [];
  try {
    const { runP1LedgerProbe } = await import('./probe-constructor-p1.mjs');
    const { validateRunSnapshot } = await import('../js/v8/core/RunLedger.mjs');
    const pure = await runP1LedgerProbe();
    pure.results.forEach(line => console.log(`[save:p1] ${line}`));

    server = await startServer();
    const url = `http://127.0.0.1:${server.address().port}/OrigamiUnderworld.html`;
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext();
    // ⛔ SUPERSEDED 2026-09-21 by Mark: "there is no resume other than save/restore" — an init script here switched on
    // window._resumeOnRefresh so the legs below could prove a refresh RESUMED the run. Refresh-resume is off by order
    // (2026-09-17) and the shell mints a fresh dungeon on every load (2026-09-21), so the probe now runs the game as it ships.
    let page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error.stack || error.message)));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`[console] ${message.text()}`);
    });

    console.log(`[save:p1] loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let engine = await waitForEngine(page);
    let panels = await waitForPanels(page);
    // Let the full iframe graph and the game's routed message listeners settle.
    await sleep(3500);

    // ── FRESH VISIT, REFRESH ON THE TERMS PAGE → A NEW DUNGEON. Nobody chose a role, so there is no live-run marker and
    // nothing to resume (Mark 2026-09-01: "no cards should show on gameload unless its a restore … if game is not saved?
    // dont do the autorestore"). ⛔ SUPERSEDED 2026-09-21 by Mark: "stop that seed - its a new dungeon every new game -
    // that was the promise" — this leg asserted the root seed SURVIVED the refresh ("a refresh is not a reroll"); the
    // shell now mints a fresh seed on every load, so the refresh must come back as a different dungeon and run.
    const freshVisit = await engine.evaluate(() => ({ seed: window._origamiGameSeed, runId: window._runLedgerDiagnostics().runId, role: window._playerRole || null, marker: localStorage.getItem('origami.v8.run.live') }));
    assert(!freshVisit.role && freshVisit.marker == null, `a fresh visit must carry no live-run marker: ${JSON.stringify(freshVisit)}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    engine = await waitForEngine(page);
    panels = await waitForPanels(page);
    await sleep(3500);
    const continued = await engine.evaluate(() => ({ seed: window._origamiGameSeed, runId: window._runLedgerDiagnostics().runId, ranks: JSON.parse(JSON.stringify(window._skillRanks || {})), resumed: !!window._resumedInterruptedRun }));
    assert(continued.seed !== freshVisit.seed && continued.runId !== freshVisit.runId, `a refresh on the terms page kept the old dungeon: ${JSON.stringify({ freshVisit, continued })}`);
    assert(!continued.resumed && Object.keys(continued.ranks).length === 0, `a refresh with no game in play restored something: ${JSON.stringify(continued)}`);
    const guideAfterClean = await panels.evaluate(() => { const el = document.getElementById(window.welcomeGuide && window.welcomeGuide.containerId); return el ? el.classList.contains('is-open') : null; });
    assert(guideAfterClean === true, `a clean start must show the guide/terms page (is-open = ${guideAfterClean})`);
    console.log('[save:p1] ✅ a refresh with NO game in play is a NEW dungeon: terms page up, nothing restored (Mark 2026-09-21)');


    await panels.evaluate(() => {
      window.cardInventoryCounts = { 'TEST PERMIT': 1, PISTOL: 6 };
      window.selectedRole = 'SAMURAI';
      window.welcomeGuideEquipment = { hand: 'KATANA' };
      if (window.welcomeGuide) window.welcomeGuide.equipment = { hand: 'KATANA' };
    });
    const relayedPanelState = await engine.evaluate(async () => {
      const requestId = 'p1-live-panel-state';
      return new Promise(resolve => {
        const timeout = setTimeout(() => { window.removeEventListener('message', listen); resolve(null); }, 3000);
        const listen = event => {
          if (event.data?.type !== 'RUN_LEDGER_STATE' || event.data?.requestId !== requestId) return;
          clearTimeout(timeout);
          window.removeEventListener('message', listen);
          resolve(event.data.state);
        };
        window.addEventListener('message', listen);
        window.parent.postMessage({ type: 'RUN_LEDGER_STATE_REQUEST', requestId }, '*');
      });
    });
    assert(relayedPanelState?.inventory?.['TEST PERMIT'] === 1 && relayedPanelState?.equipment?.hand === 'KATANA', 'Panels -> shell -> Engine transition snapshot did not preserve card/equipment state');
    console.log('[save:p1] ✅ transition-time Panels snapshot crosses the real sibling-frame bridge');

    await engine.evaluate(() => {
      window._skillRanks = {};
      window._skillRankUp('POKER');
      window._skillRankUp('POKER');
      window._skillRankUp('THRUST');
    });
    const saveDone = await panels.evaluate(async () => {
      const name = 'P1 Persistence Probe';
      const done = new Promise(resolve => {
        const timeout = setTimeout(() => { window.removeEventListener('message', listen); resolve(null); }, 3000);
        const listen = event => {
          if (event.data?.type !== 'SAVE_DONE' || event.data?.name !== name) return;
          clearTimeout(timeout);
          window.removeEventListener('message', listen);
          resolve(event.data);
        };
        window.addEventListener('message', listen);
      });
      window.parent.postMessage({
        type: 'SAVE_NOW', name, displayName: name, role: 'SAMURAI',
        inventory: { 'TEST PERMIT': 1, PISTOL: 6 }, equipment: { hand: 'KATANA' },
      }, '*');
      return done;
    });
    const saved = await engine.evaluate(() => {
      const name = 'P1 Persistence Probe';
      const raw = localStorage.getItem('origami.v8.save.' + encodeURIComponent(name));
      return {
        payload: raw ? JSON.parse(raw) : null,
        diagnostics: window._runLedgerDiagnostics(),
        seed: window._origamiGameSeed,
        ranks: JSON.parse(JSON.stringify(window._skillRanks || {})),
      };
    });
    assert(saveDone?.success === true, `SAVE_NOW did not receive a successful live acknowledgement: ${JSON.stringify({ saveDone, saved })}`);
    assert(saved.payload, `SAVE_NOW did not create a named slot: ${JSON.stringify(saved)}`);
    assert(validateRunSnapshot(saved.payload.runLedger).ok, 'named slot lacks a valid run ledger snapshot');
    assert(saved.payload.runLedger.state.rootSeed === saved.seed, 'named slot ledger root differs from live engine root');
    assert(saved.payload.runLedger.state.floors['1'].snapshot.inventory['TEST PERMIT'] === 1, 'named slot lost Panels inventory');
    assert(saved.ranks.POKER === 2 && saved.ranks.THRUST === 1, 'test skill ranks were not captured');
    console.log('[save:p1] ✅ SAVE_NOW wrote a valid named ledger with Panel inventory and skills');

    await engine.evaluate(() => {
      const name = 'P1 Persistence Probe';
      const key = 'origami.v8.save.' + encodeURIComponent(name);
      const outer = JSON.parse(localStorage.getItem(key));
      // Preserve the valid embedded ledger but poison the mutable outer fields.
      // LOAD_NOW must choose the ledger's canonical active-floor payload.
      outer.floor = 7;
      outer.gameSeed = '999999999';
      outer.player = Object.assign({}, outer.player, { skillRanks: { TAMPERED: 99 } });
      outer.inventory = { TAMPERED: 1 };
      localStorage.setItem(key, JSON.stringify(outer));
    });
    await panels.evaluate(() => window.parent.postMessage({ type: 'LOAD_NOW', name: 'P1 Persistence Probe' }, '*'));
    engine = await waitForReload(page);
    await sleep(700);
    const loaded = await engine.evaluate(() => ({
      diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed,
      ranks: JSON.parse(JSON.stringify(window._skillRanks || {})),
      floor: new URLSearchParams(location.search).get('floor'),
    }));
    assert(loaded.seed === saved.seed, 'LOAD_NOW rerolled the root seed');
    assert(loaded.diagnostics.runId === saved.payload.runLedger.state.runId, 'LOAD_NOW changed run identity');
    assert(loaded.ranks.POKER === 2 && loaded.ranks.THRUST === 1, 'LOAD_NOW lost skill ranks');
    assert(loaded.floor === '1' && !Object.hasOwn(loaded.ranks, 'TAMPERED'), 'LOAD_NOW trusted tampered outer-save fields over the ledger');
    console.log('[save:p1] ✅ LOAD_NOW restored canonical ledger state over a tampered outer save blob');

    // ── A REFRESH MID-GAME IS A NEW DUNGEON; SO IS A NEW TAB. ⛔ SUPERSEDED 2026-09-21 by Mark: "there is no resume other
    // than save/restore" · "its a new dungeon every new game - that was the promise". The legs that stood here (09-12:
    // "there is an auto resume ONLY if there was a refresh or browser tab close") asserted that a mid-game refresh and a
    // tab close RESUMED the run, and that a stale marker did not. Refresh-resume is off since 2026-09-17 and the shell
    // mints a fresh seed on every load since 2026-09-21, so both now assert the opposite: the player is in play, the
    // page goes away, and what comes back is a different dungeon with nothing of the old run in it.
    panels = await waitForPanels(page);
    await panels.evaluate(() => { window.selectRole('samurai'); });   // the real role path: sessionStorage role + SET_PLAYER_ROLE to the engine
    await sleep(400);
    await engine.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });   // "in play" means the loop runs — ~12 s after boot
    const inPlay = await engine.evaluate(() => ({ role: window._playerRole, loop: window._loopStarted === true }));
    assert(/samurai/i.test(inPlay.role || '') && inPlay.loop, `the run is not in play before the refresh: ${JSON.stringify(inPlay)}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    engine = await waitForEngine(page);
    await sleep(900);
    const refreshed = await engine.evaluate(() => ({ diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed,
      ranks: JSON.parse(JSON.stringify(window._skillRanks || {})), resumed: !!window._resumedInterruptedRun }));
    assert(!refreshed.resumed && refreshed.seed !== saved.seed && refreshed.diagnostics.runId !== loaded.diagnostics.runId && !Object.hasOwn(refreshed.ranks, 'POKER'),
      `a refresh mid-game brought the old run back: ${JSON.stringify(refreshed)}`);
    console.log('[save:p1] ✅ a refresh MID-GAME is a new dungeon — nothing of the old run comes back (Mark 2026-09-21)');

    const page2 = await context.newPage();
    page2.on('pageerror', error => errors.push(String(error.stack || error.message)));
    page2.on('console', message => { if (message.type() === 'error') errors.push(`[console] ${message.text()}`); });
    await page.close();
    await page2.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let engine2 = await waitForEngine(page2);
    await sleep(900);
    const tabFresh = await engine2.evaluate(() => ({ diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed,
      ranks: JSON.parse(JSON.stringify(window._skillRanks || {})), resumed: !!window._resumedInterruptedRun }));
    assert(!tabFresh.resumed && tabFresh.seed !== saved.seed && tabFresh.diagnostics.runId !== loaded.diagnostics.runId && !Object.hasOwn(tabFresh.ranks, 'POKER'),
      `a new tab after a tab close brought the old run back: ${JSON.stringify(tabFresh)}`);
    console.log('[save:p1] ✅ a tab close + new tab is a new dungeon — only LOAD brings a run back');

    // LOAD is the way back: put the saved run in play for the Quit leg below.
    await engine2.evaluate(() => { window.parent.postMessage({ type: 'LOAD_NOW', name: 'P1 Persistence Probe' }, '*'); });
    engine2 = await waitForReload(page2);
    await sleep(700);

    // ── EXPLICIT QUIT NEVER RESUMES — through the REAL button. Panels' confirmExit drops the seed + marker and reloads the
    // shell; the shell's own pagehide must not write the marker back (measured 2026-09-12: it did, and Mark's "Exit"
    // came back into the old game). The game must then be in play when the button is pressed, like his was.
    await engine2.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });
    const panels2 = await waitForPanels(page2);
    await panels2.evaluate(() => { window.confirmExit(); });
    await page2.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000, polling: 250 });
    const engine3 = await waitForEngine(page2);
    await sleep(700);
    const newGame = await engine3.evaluate(() => ({ diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed, resumed: !!window._resumedInterruptedRun, ranks: JSON.parse(JSON.stringify(window._skillRanks || {})) }));
    const markerAfterQuit = await engine3.evaluate(() => localStorage.getItem('origami.v8.run.live'));
    assert(!newGame.resumed && newGame.seed !== saved.seed && newGame.diagnostics.runId !== loaded.diagnostics.runId && !Object.hasOwn(newGame.ranks, 'POKER'), `the real Quit button resumed the old run: ${JSON.stringify(newGame)}`);
    assert(markerAfterQuit == null, `the shell's pagehide wrote the live-run marker back after Quit: ${markerAfterQuit}`);
    console.log('[save:p1] ✅ the real Quit button mints a fresh run, resumes nothing, and leaves no marker behind');

    // Back onto the saved run for the transit + floor-2 legs below: LOAD the named slot in this tab.
    await engine3.evaluate(() => { window.parent.postMessage({ type: 'LOAD_NOW', name: 'P1 Persistence Probe' }, '*'); });
    engine = await waitForReload(page2);
    await sleep(700);
    const back = await engine.evaluate(() => ({ diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed, ranks: JSON.parse(JSON.stringify(window._skillRanks || {})) }));
    assert(back.seed === saved.seed && back.diagnostics.runId === loaded.diagnostics.runId && back.ranks.POKER === 2, `could not LOAD back onto the saved run: ${JSON.stringify(back)}`);
    page = page2;

    const transit = await engine.evaluate(() => {
      const source = {
        version: 2, generatorVersion: window._SAVE_GEN || 'chain-4-lhall', floor: 1, gameSeed: window._origamiGameSeed,   // the engine's own stamp (2026-09-27): the load applier discards floor state stamped with any other
        karma: 7, player: { hp: 88, maxHp: 100, gold: 55, level: 2, xp: 9, maxXp: 100,
          skillRanks: { POKER: 2, THRUST: 1 }, px: 99, pz: 77, rot: 0.8 },
        inventory: { 'TEST PERMIT': 1, PISTOL: 6 }, equipment: { hand: 'KATANA' },
        segments: { active: 0, sealed: [], states: [], stores: {}, broken: [], sectionCleared: [], exitUnlocked: false },
      };
      const handoff = window._origamiRunLedger.makeTransition({ fromFloor: 1, toFloor: 2, direction: 'descend', sourceSnapshot: source });
      sessionStorage.setItem('origami.v8.loadSave', JSON.stringify(handoff));
      sessionStorage.setItem('origami.v8.descent', JSON.stringify({ floor: 2, hp: 88, maxHp: 100, karma: 7, direction: 'descend', runId: handoff.runId }));
      window.parent.postMessage({ type: 'DESCEND_REQUEST', floor: 2 }, '*');
      return handoff;
    });
    assert(validateRunSnapshot(transit.runLedger).ok && !Object.hasOwn(transit.player, 'px'), 'generated floor handoff retained stale player coordinates');
    engine = await waitForReload(page);
    await sleep(700);
    const descended = await engine.evaluate(() => ({
      diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed,
      ranks: JSON.parse(JSON.stringify(window._skillRanks || {})), floor: new URLSearchParams(location.search).get('floor'),
    }));
    assert(descended.floor === '2', `descent did not load floor 2 (got ${descended.floor})`);
    assert(descended.seed === saved.seed, 'descent rerolled root seed');
    assert(descended.diagnostics.floors.includes(1) && descended.diagnostics.floors.includes(2), 'descent did not retain multi-floor ledger state');
    assert(descended.ranks.POKER === 2 && descended.ranks.THRUST === 1, 'descent lost durable skills');
    console.log('[save:p1] ✅ generated floor handoff retains root/run state and restores the target floor');

    // ── FLOOR 2 SAVE + RESTORE (Mark 2026-09-12: "make sure save works with the new floor we created + restore").
    // Floor 2 is the 09-12 build: a locked 番所 beside the landing with the stairs down inside. A save made THERE must
    // come back THERE — same seed, same rooms, same 番所, same stairs tile, same lock state — with the skills intact.
    const fingerprint = () => engine.evaluate(() => {
      const rooms = window._roomsProbe || []; const map = window.map || []; let stairs = null, guardTiles = 0, walk = 0;
      for (let x = 0; x < map.length; x++) for (let z = 0; z < (map[x] || []).length; z++) { const c = map[x][z]; if (!c) continue;
        if (c.type === 'stairs_down') stairs = [x, z]; if (c.lockedRoom === 'guard') guardTiles++; if (c.type === 'floor' || /^stairs_/.test(c.type)) walk++; }
      const guard = rooms.find(r => r && r.id === window._descentRoomId) || null;
      return { floor: window._currentFloor, rooms: rooms.length, walk, stairs, guardTiles, guard: guard ? [guard.x, guard.y ?? guard.z, guard.w, guard.h] : null,
        descentIsGuard: !!window._descentIsGuard, lock: typeof window._guardLockOpen === 'function' ? !!window._guardLockOpen() : null, keys: Object.assign({}, window._sectionKeys) };
    });
    const f2Before = await fingerprint();
    assert(f2Before.floor === 2 && f2Before.stairs && f2Before.guardTiles > 0 && f2Before.descentIsGuard, `floor 2 is not the 09-12 floor (locked 番所 + stairs inside): ${JSON.stringify(f2Before)}`);
    await engine.evaluate(() => { window._skillRankUp('THRUST'); });   // THRUST 1 → 2 ON floor 2: the restore must carry a rank earned after the descent
    panels = await waitForPanels(page);
    const save2 = await panels.evaluate(async () => {
      const name = 'P1 Floor2 Probe';
      const done = new Promise(resolve => {
        const timeout = setTimeout(() => { window.removeEventListener('message', listen); resolve(null); }, 3000);
        const listen = event => { if (event.data?.type !== 'SAVE_DONE' || event.data?.name !== name) return; clearTimeout(timeout); window.removeEventListener('message', listen); resolve(event.data); };
        window.addEventListener('message', listen);
      });
      window.parent.postMessage({ type: 'SAVE_NOW', name, displayName: name, role: 'SAMURAI', inventory: { 'TEST PERMIT': 1, PISTOL: 6, 'ARMORY PERMIT': 1 }, equipment: { hand: 'KATANA' } }, '*');
      return done;
    });
    const saved2 = await engine.evaluate(() => {
      const raw = localStorage.getItem('origami.v8.save.' + encodeURIComponent('P1 Floor2 Probe'));
      return { payload: raw ? JSON.parse(raw) : null, seed: window._origamiGameSeed, ranks: JSON.parse(JSON.stringify(window._skillRanks || {})), pos: window._playerPoseProbe() };
    });
    assert(save2?.success === true && saved2.payload, `floor-2 SAVE_NOW failed: ${JSON.stringify({ save2, has: !!saved2.payload })}`);
    assert(saved2.payload.floor === 2, `floor-2 save recorded floor ${saved2.payload.floor}`);
    assert(validateRunSnapshot(saved2.payload.runLedger).ok && saved2.payload.runLedger.state.activeFloor === 2, 'floor-2 save ledger is invalid or its active floor is not 2');
    assert(saved2.payload.runLedger.state.floors['2']?.snapshot?.inventory?.['ARMORY PERMIT'] === 1, 'floor-2 save lost the Panels inventory for floor 2');
    assert(saved2.ranks.POKER === 2 && saved2.ranks.THRUST === 2, `floor-2 save did not carry the rank earned on floor 2: ${JSON.stringify(saved2.ranks)}`);
    console.log('[save:p1] ✅ SAVE_NOW on floor 2 wrote a ledger whose active floor is 2 with the rank earned there');

    await engine.evaluate(() => {   // poison the outer blob again — LOAD_NOW must trust the ledger, and the ledger says floor 2
      const key = 'origami.v8.save.' + encodeURIComponent('P1 Floor2 Probe'); const outer = JSON.parse(localStorage.getItem(key));
      outer.floor = 1; outer.gameSeed = '123456789'; outer.player = Object.assign({}, outer.player, { skillRanks: { TAMPERED: 99 } }); localStorage.setItem(key, JSON.stringify(outer));
    });
    await panels.evaluate(() => window.parent.postMessage({ type: 'LOAD_NOW', name: 'P1 Floor2 Probe' }, '*'));
    engine = await waitForReload(page);
    await sleep(700);
    const f2After = await fingerprint();
    const loaded2 = await engine.evaluate(() => ({ diagnostics: window._runLedgerDiagnostics(), seed: window._origamiGameSeed, ranks: JSON.parse(JSON.stringify(window._skillRanks || {})),
      floor: new URLSearchParams(location.search).get('floor'), pos: window._playerPoseProbe(), onWalk: (() => { const p = window._playerPoseProbe(); const c = (window.map[Math.round(p.x / 2)] || [])[Math.round(p.z / 2)]; return c ? c.type : null; })() }));
    assert(loaded2.floor === '2' && f2After.floor === 2, `LOAD_NOW of a floor-2 save landed on floor ${loaded2.floor}`);
    assert(loaded2.seed === saved2.seed && loaded2.diagnostics.runId === saved2.payload.runLedger.state.runId, 'floor-2 LOAD_NOW changed the run identity');
    assert(loaded2.ranks.POKER === 2 && loaded2.ranks.THRUST === 2 && !Object.hasOwn(loaded2.ranks, 'TAMPERED'), `floor-2 LOAD_NOW lost or corrupted ranks: ${JSON.stringify(loaded2.ranks)}`);
    for (const k of ['rooms', 'walk', 'guardTiles', 'descentIsGuard', 'lock']) assert(f2After[k] === f2Before[k], `floor-2 restore rebuilt a different floor: ${k} ${f2Before[k]} → ${f2After[k]}`);
    assert(JSON.stringify(f2After.stairs) === JSON.stringify(f2Before.stairs) && JSON.stringify(f2After.guard) === JSON.stringify(f2Before.guard), `floor-2 restore moved the 番所/stairs: ${JSON.stringify(f2Before)} → ${JSON.stringify(f2After)}`);
    assert(loaded2.onWalk && /^(floor|stairs_)/.test(loaded2.onWalk), `floor-2 restore put the player on a "${loaded2.onWalk}" tile`);
    assert(Math.hypot(loaded2.pos.x - saved2.pos.x, loaded2.pos.z - saved2.pos.z) < 2.5, `floor-2 restore moved the player ${Math.hypot(loaded2.pos.x - saved2.pos.x, loaded2.pos.z - saved2.pos.z).toFixed(1)} units from where they saved`);
    console.log('[save:p1] ✅ LOAD_NOW of the floor-2 save lands on the SAME floor 2 (rooms, 番所, stairs, lock) with the player where they saved and every rank');

    // A stale load handoff sits in the session AND the player presses the real Quit: the new run must not inherit either.
    // (Until 2026-09-12 this leg faked the New Game by deleting the session seed; that now reads as a closed tab and
    // correctly resumes — a New Game is the button, which drops the marker and declares the intent.)
    await engine.evaluate(() => {
      const stale = localStorage.getItem('origami.v8.save.' + encodeURIComponent('P1 Persistence Probe'));
      sessionStorage.setItem('origami.v8.loadSave', stale);
    });
    await engine.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });
    await (await waitForPanels(page)).evaluate(() => { window.confirmExit(); });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000, polling: 250 });
    engine = await waitForEngine(page);
    await sleep(700);
    const fresh = await engine.evaluate(() => ({
      diagnostics: window._runLedgerDiagnostics(),
      seed: window._origamiGameSeed,
      staleHandoff: sessionStorage.getItem('origami.v8.loadSave'),
    }));
    assert(fresh.seed !== saved.seed && fresh.diagnostics.runId !== saved.payload.runLedger.state.runId, 'explicit New Game resurrected the stale prior run');
    assert(fresh.staleHandoff == null, 'explicit New Game left a stale load handoff staged');
    console.log('[save:p1] ✅ explicit New Game rejects a stale pending restore and mints a fresh run');

    assert(errors.length === 0, `browser reported ${errors.length} error(s): ${errors.join(' | ')}`);
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    console.log('\n✅ smoke:save PASS — real named save/load, Continue, transition, and P1 falsifiers held');
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
    console.error(`\n❌ smoke:save FAIL — ${error.stack || error.message}`);
    process.exit(1);
  }
})();
