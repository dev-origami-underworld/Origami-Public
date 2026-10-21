#!/usr/bin/env node
/**
 * G-SAVE-PARTS — the save rebuild's proof (2026-09-27). knowledge/design/SAVE_GAME_2026-09-27.md
 *
 * Mark 2026-09-27: "we changed a lot in the game and need it updated. you will work with onibaba to create a good save
 * game -- fix our busted one". Every leg drives the real shell → Panels → Engine path and asks Oni-Baba for her score.
 *
 *   A  ROUND TRIP   — the House safe + bar till, the Manager's round, the singer's contract, the raid, a card on the floor,
 *                     the MAC-9 pool, a splintered and a dented door, a worker's purse, the role and the karma are written
 *                     by SAVE_NOW and put back by LOAD_NOW; karma comes back EXACT (a restored room pays nothing) and
 *                     Oni-Baba's saveHealth is 1.
 *   C  OLD DUNGEON  — a slot stamped with an older generation is listed as not loadable, LOAD_NOW refuses it without
 *                     reloading or touching the run, and Oni-Baba scores the refusal 0.
 *   B  SAVE CURRENT — the guide's button makes a NEW slot on every press ("Floor N — ROLE — HH:MM", " (2)" on a clash),
 *                     waits for SAVE_DONE, and the newest N per dungeon are kept.
 *   D  STAIRS       — a run part (the MAC-9 pool) crosses the stairs; a floor part (the House safe) stays on its floor.
 *
 * Run: node scripts/smoke-save-parts.js      Exit 0 = every leg held · 1 = a leg failed
 */
'use strict';

const { chromium } = require('playwright');
const { sleep, assert, startServer, waitForEngine, waitForPanels, waitForReload, pollFrame } = require('./lib/save-harness');

const PROBE_CARD = 'SAVE PROBE CHARM';

(async () => {
  let browser, server;
  const errors = [];
  const t0 = Date.now();
  const lap = (label) => console.log(`[save:parts] ${label}  (+${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  try {
    server = await startServer();
    const url = `http://127.0.0.1:${server.address().port}/OrigamiUnderworld.html`;
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext();
    await context.addInitScript(() => { window._storeAlwaysOpen = true; });   // the konbini's shelf stocks on every boot, so leg A can save a bought card
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error.stack || error.message)));
    page.on('console', message => { if (message.type() === 'error') errors.push(`[console] ${message.text()}`); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let engine = await waitForEngine(page);
    let panels = await waitForPanels(page);
    await sleep(3500);
    // the shell hears LOAD_REFUSED (the engine posts to its parent); keep a record there for leg C
    await page.evaluate(() => { window.__loadRefused = []; window.addEventListener('message', e => { if (e.data && e.data.type === 'LOAD_REFUSED') window.__loadRefused.push(e.data); }); });

    await panels.evaluate(() => { window.selectRole('wizard'); });
    await engine.waitForFunction(() => window._loopStarted === true, null, { timeout: 90000 });
    lap('booted, role wizard, loop running');

    // ═══ A · ROUND TRIP ═══════════════════════════════════════════════════════════════════════════════════════════
    // a REAL wake pays +1 karma through a posted message, so wake the room first and let the payment land
    await engine.evaluate(() => { if (typeof window._isRoomActivated === 'function' && !window._isRoomActivated('CABARET')) window._activateRoomRaw('CABARET'); });
    await sleep(800);
    const setup = await engine.evaluate((PROBE_CARD) => {
      const out = {};
      const ob = window.getOniBabaSafe();
      ob.karma = 7; if (typeof ob._updateMood === 'function') ob._updateMood();   // the CABARET was woken (and paid its +1) before this evaluate
      window._houseAdd(300, 'player'); window._cabTill = 12;
      window._managerBeaten = true; window._managerDoorOpenLatch = true;
      window._singerContract = { singer: 'starlette', name: 'Starlette', floor: 1, won: 'cards' };
      window._raidState.state = 'won';
      window._smgAmmo = 12;
      const doors = (typeof window._allDoors === 'function' ? window._allDoors() : []).filter(d => d && typeof d.cx === 'number' && typeof d.maxHp === 'number');
      if (doors[0]) { doors[0].hp = 0; doors[0].destroyed = true; out.doorDead = doors[0].cx + ',' + doors[0].cz; }
      if (doors[1]) { doors[1].hp = 123; out.doorDent = doors[1].cx + ',' + doors[1].cz; }
      // a card dropped on an open floor tile 3-6 tiles from the player (out of pickup reach)
      const pose = window._playerPoseProbe(), px = Math.round(pose.x / 2), pz = Math.round(pose.z / 2), map = window.map || [];
      let spot = null;
      for (let r = 3; r <= 6 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dz = -r; dz <= r && !spot; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const c = (map[px + dx] || [])[pz + dz]; if (c && c.type === 'floor') spot = [px + dx, pz + dz];
      }
      if (spot) {
        const card = window.spawnLootCard(spot[0], spot[1], 'ITEM', PROBE_CARD, 'Placed here by your own hand.', '試', '');
        if (card && card.userData) { card.userData._dropQty = 2; out.card = { x: card.position.x, z: card.position.z }; }
      }
      const w = (window.monsterWrappers || []).find(m => m && m.userData && m.userData.id && !m.userData.isDead && !m.userData.isAlly);
      if (w) { w.userData.gold = 77; out.purseId = w.userData.id; }
      out.karma = ob.karma;
      return out;
    }, PROBE_CARD);
    assert(setup.card && setup.doorDead && setup.purseId, `leg A setup incomplete: ${JSON.stringify(setup)}`);

    // restore round 2 (2026-09-27): the view, the konbini shelf, a vending slot, an ant egg's clock and a hatched ant
    await engine.evaluate(() => window.postMessage({ type: 'PIP_PERSPECTIVE', preset: 'high' }, '*'));
    await sleep(600);
    const setup2 = await engine.evaluate(async () => {
      const out = { view: window._viewProbe() };
      const t0 = Date.now(); while ((!window._storeStock || !window._storeStock.length) && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 250));
      const s = (window._storeStock || [])[0];
      if (s) {
        const G = 2, card = (window.lootItems || []).find(c => c && c.userData && c.userData.isShopItem && String(c.userData.cardName || '') === s.title
          && Math.abs(c.position.x - s.gx * G) < G * 0.6 && Math.abs(c.position.z - s.gz * G) < G * 0.6);
        if (card) { if (card.parent) card.parent.remove(card); const i = window.lootItems.indexOf(card); if (i >= 0) window.lootItems.splice(i, 1); }
        s.taken = true; s.paid = true; s.obj = null; s.seen = true;          // bought and paid for, as the till would leave it
        out.konbini = { title: s.title, gx: s.gx, gz: s.gz, hadCard: !!card };
      }
      const vm = (window._vendingMachines || []).find(g => g && g.userData && Array.isArray(g.userData.slots) && g.userData.slots.some(x => x && x.type === 'card' && x.qty > 0));
      if (vm) { const i = vm.userData.slots.findIndex(x => x && x.type === 'card' && x.qty > 0); vm.userData.slots[i].qty = 0;   // sold out, as a purchase leaves it
        out.vend = { x: vm.position.x, z: vm.position.z, i, names: vm.userData.slots.map(x => x && x.name) }; }
      const pose = window._playerPoseProbe(), gx = Math.round(pose.x / 2), gz = Math.round(pose.z / 2), map = window.map || [];
      let spot = null;
      for (let r = 7; r <= 11 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dz = -r; dz <= r && !spot; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const c = (map[gx + dx] || [])[gz + dz]; if (c && c.type === 'floor') spot = [gx + dx, gz + dz]; }
      if (spot) {
        const egg = window.spawnLootCard(spot[0], spot[1], 'ITEM', 'ROYAL EGG', 'A gold-flecked ant egg. A queen sleeps inside.', '王', 'EDIBLE · QUEEN');
        if (egg && egg.userData) { egg.userData._antEgg = { royal: true, hatchAt: performance.now() + 600000 }; (window._antEggs = window._antEggs || []).push(egg); out.egg = true; }
        window._antHatchN = 900;
        // the hatched ant stands near the player (a far tile can sit in a parked section, and a queued ant model can take a while)
        let near = null; for (let r = 2; r <= 6 && !near; r++) for (let dx = -r; dx <= r && !near; dx++) for (let dz = -r; dz <= r && !near; dz++) { const c = (map[gx + dx] || [])[gz + dz]; if (c && c.type === 'floor') near = [gx + dx, gz + dz]; }
        window._buildSegmentSpawn({ id: 'ant-hatch-900', nameKey: 'ant', name: 'Ant', type: 'monster', x: (near || spot)[0], z: (near || spot)[1], hp: 15, maxHp: 15, isHostile: false, meleeOnly: true, noFlee: true });
        const t1 = Date.now(); let ant = null;
        while (!ant && Date.now() - t1 < 45000) { ant = (window.monsterWrappers || []).find(w => w && w.userData && w.userData.id === 'ant-hatch-900'); if (!ant) await new Promise(r => setTimeout(r, 250)); }
        if (ant) { ant.userData.isHostile = false; ant.userData.aiState = 'idle'; out.ant = true; }
      }
      return out;
    });
    console.log('[save:parts]    round-2 setup: ' + JSON.stringify({ view: setup2.view && { mode: setup2.view.mode, preset: setup2.view.preset }, konbini: !!setup2.konbini, vend: !!setup2.vend, egg: !!setup2.egg, ant: !!setup2.ant }));
    const saveName = 'Parts Probe';
    const saveDone = await panels.evaluate(async (name) => {
      const done = new Promise(resolve => {
        const timeout = setTimeout(() => { window.removeEventListener('message', listen); resolve(null); }, 5000);
        const listen = event => { if (event.data?.type !== 'SAVE_DONE' || event.data?.name !== name) return; clearTimeout(timeout); window.removeEventListener('message', listen); resolve(event.data); };
        window.addEventListener('message', listen);
      });
      window.parent.postMessage({ type: 'SAVE_NOW', name, displayName: name, role: window.selectedRole || 'wizard',
        inventory: window.cardInventoryCounts || {}, equipment: {},
        panels: { pistolCyl: (typeof window._pistolCylGet === 'function') ? window._pistolCylGet() : null,
                  rolled: { weapon: window.rolledRangedWeapon || '', qty: window.rolledRangedQty || 0, items: (window.rolledStartingItems || []).slice() } } }, '*');
      return done;
    }, saveName);
    assert(saveDone && saveDone.success === true, `SAVE_NOW did not land: ${JSON.stringify(saveDone)}`);
    const slot = await engine.evaluate((name) => {
      const p = JSON.parse(localStorage.getItem('origami.v8.save.' + encodeURIComponent(name)) || 'null');
      const man = JSON.parse(localStorage.getItem('origami.v8.saves.manifest') || '{"saves":[]}').saves.find(s => s.slotId === name) || null;
      const ob = window.getOniBabaSafe();
      return { p, man, gen: window._SAVE_GEN, bytes: window._saveLastBytes, oni: { last: ob._saveLast, health: ob.sensors.saveHealth } };
    }, saveName);
    const P = slot.p || {}, parts = P.parts || {};
    const checks = [
      ['stamped with this generation', P.generatorVersion === slot.gen && slot.man && slot.man.gen === slot.gen && slot.man.seed === P.gameSeed],
      ['house', parts.house && parts.house.bank === 300 && parts.house.till === 12],
      ['bossRound', parts.bossRound && parts.bossRound.managerBeaten === true && parts.bossRound.officeOpen === true],
      ['singerContract', parts.singerContract && parts.singerContract.contract && parts.singerContract.contract.singer === 'starlette'],
      ['raid', parts.raid && parts.raid.state === 'won'],
      ['floorLoot', parts.floorLoot && (parts.floorLoot.cards || []).some(c => c.a && c.a.inTitle === PROBE_CARD && c.dq === 2)],
      ['guns', parts.guns && parts.guns.smg === 12],
      ['doors', parts.doors && (parts.doors.doors || []).some(d => d.k === setup.doorDead && d.destroyed)],
      ['purse', (P.monsters || []).some(m => m.id === setup.purseId && m.gold === 77)],
      ['role', P.player && /wizard/i.test(P.player.role || '')],
      ['panels', P.panels && P.panels.rolled && typeof P.panels.rolled.weapon === 'string'],
      ['karma', P.karma === 7],
      ['Oni-Baba heard the save', slot.oni.last && slot.oni.last.phase === 'save' && slot.oni.health === 1],
    ];
    const bad = checks.filter(c => !c[1]).map(c => c[0]);
    assert(!bad.length, `the slot is missing: ${bad.join(', ')} — parts=${JSON.stringify(Object.keys(parts))} oni=${JSON.stringify(slot.oni)}`);
    lap(`✅ A1 SAVE_NOW wrote all ${Object.keys(parts).length} parts + purse/role/karma (${Math.round((slot.bytes || 0) / 1024)} KB), Oni-Baba scored the save 1`);

    // change what outlives an engine reload — Oni-Baba's karma, the tab's contract key, the Panels role — so the load
    // has to put the SAVED values back rather than find them still there
    await engine.evaluate(() => {
      const ob = window.getOniBabaSafe(); ob.karma = 20;
      sessionStorage.setItem('origami.singerContract.v1.' + String(window._origamiGameSeed), JSON.stringify({ singer: 'stariko', name: 'Stariko', floor: 1, won: 'bought' }));
    });
    await panels.evaluate(() => { window.selectRole('samurai'); });
    await sleep(400);
    await panels.evaluate((name) => window.parent.postMessage({ type: 'LOAD_NOW', name }, '*'), saveName);
    engine = await waitForReload(page);
    const census = await pollFrame(engine, () => (window._saveCensusLast && window._saveCensusLast.phase === 'load') ? window._saveCensusLast : null, null, { timeout: 120000 });
    assert(census, 'no load census within 120 s — the parts never finished applying');
    panels = await waitForPanels(page);
    await sleep(600);
    const after = await engine.evaluate(({ setup, PROBE_CARD }) => {
      const ob = window.getOniBabaSafe();
      const byTile = new Map(); for (const d of (window._allDoors ? window._allDoors() : [])) if (d && typeof d.cx === 'number') byTile.set(d.cx + ',' + d.cz, d);
      const cards = [...(window.lootItems || [])];
      try { if (window._segmentStagedLoot) for (const a of window._segmentStagedLoot.values()) cards.push(...(a || [])); } catch (_) {}
      const card = cards.find(c => c && c.userData && c.userData._spawnArgs && c.userData._spawnArgs.inTitle === PROBE_CARD);
      const purse = (window.monsterWrappers || []).find(m => m && m.userData && m.userData.id === setup.purseId);
      return {
        house: window._houseBank, till: window._cabTill, beaten: window._managerBeaten, office: window._managerDoorOpenLatch,
        contract: window._singerContract && window._singerContract.singer, raid: window._raidState && window._raidState.state, smg: window._smgAmmo,
        doorDead: byTile.get(setup.doorDead) ? byTile.get(setup.doorDead).destroyed === true : 'no door',
        doorDent: setup.doorDent ? (byTile.get(setup.doorDent) ? byTile.get(setup.doorDent).hp : 'no door') : 'n/a',
        card: card ? { dq: card.userData._dropQty, d: Math.hypot(card.position.x - setup.card.x, card.position.z - setup.card.z) } : null,
        purse: purse ? purse.userData.gold : 'not built', role: window._playerRole,
        karma: ob.karma, health: ob.sensors.saveHealth, last: ob._saveLast, floorLoot: window._floorLootRestored || null,
      };
    }, { setup, PROBE_CARD });
    const panelRole = await panels.evaluate(() => window.selectedRole);
    const want = [
      ['house 300 / till 12', after.house === 300 && after.till === 12],
      ['Manager beaten + office open', after.beaten === true && after.office === true],
      ['the SAVED contract (starlette), not the later one', after.contract === 'starlette'],
      ['raid won', after.raid === 'won'],
      ['MAC-9 pool 12', after.smg === 12],
      ['splintered door', after.doorDead === true],
      ['dented door hp 123', setup.doorDent ? after.doorDent === 123 : true],
      ['the dropped card, count 2, on its spot', after.card && after.card.dq === 2 && after.card.d < 0.5],
      ['worker purse 77', after.purse === 77 || after.purse === 'not built'],
      ['role wizard (engine + Panels)', /wizard/i.test(after.role || '') && /wizard/i.test(panelRole || '')],
      ['karma EXACTLY 7', after.karma === 7],
      ['Oni-Baba scored the load 1', after.health === 1 && after.last && after.last.phase === 'load' && after.last.lost.length === 0],
    ];
    const miss = want.filter(w => !w[1]).map(w => w[0]);
    console.log('[save:parts]    census: ' + JSON.stringify(census.parts));
    assert(!miss.length, `LOAD did not put back: ${miss.join(' · ')}\n${JSON.stringify(after)}`);
    lap(`✅ A2 LOAD_NOW put every part back (purse: ${after.purse === 77 ? 'restored' : 'body not built at check time'}), karma exact, saveHealth 1`);
    const after2 = await engine.evaluate(async (s2) => {
      const t0 = Date.now(); let ant = null;
      while (!ant && Date.now() - t0 < 45000) { ant = (window.monsterWrappers || []).find(w => w && w.userData && w.userData.id === 'ant-hatch-900' && !w.userData.isDead); if (!ant) await new Promise(r => setTimeout(r, 250)); }
      const cards = [...(window.lootItems || [])]; try { if (window._segmentStagedLoot) for (const a of window._segmentStagedLoot.values()) cards.push(...(a || [])); } catch (_) {}
      const egg = cards.find(c => c && c.userData && c.userData._spawnArgs && c.userData._spawnArgs.inTitle === 'ROYAL EGG');
      const k = s2.konbini ? (window._storeStock || []).find(o => o && o.title === s2.konbini.title && o.gx === s2.konbini.gx && o.gz === s2.konbini.gz) : null;
      const kCard = s2.konbini ? cards.find(c => c && c.userData && c.userData.isShopItem && String(c.userData.cardName || '') === s2.konbini.title
        && Math.abs(c.position.x - s2.konbini.gx * 2) < 1.2 && Math.abs(c.position.z - s2.konbini.gz * 2) < 1.2) : null;
      const vm = s2.vend ? (window._vendingMachines || []).find(g => g && g.position && Math.hypot(g.position.x - s2.vend.x, g.position.z - s2.vend.z) < 0.5) : null;
      return {
        view: window._viewProbe(),
        konbini: k ? { taken: k.taken, paid: k.paid, shelfCard: !!kCard } : (s2.konbini ? 'entry missing' : 'n/a'),
        vend: vm ? { same: JSON.stringify(vm.userData.slots.map(x => x && x.name)) === JSON.stringify(s2.vend.names), qty: vm.userData.slots[s2.vend.i].qty, mesh: !!vm.userData.slots[s2.vend.i].mesh } : (s2.vend ? 'machine missing' : 'n/a'),
        egg: egg ? { royal: !!(egg.userData._antEgg && egg.userData._antEgg.royal), left: egg.userData._antEgg ? Math.round(egg.userData._antEgg.hatchAt - performance.now()) : null, listed: (window._antEggs || []).includes(egg) } : null,
        ant: !!ant, hatchN: window._antHatchN | 0,
      };
    }, setup2);
    const v0 = setup2.view || {}, v1 = after2.view || {};
    const want2 = [
      ['the view (mode, preset, yaw, heading hold)', v1.mode === v0.mode && v1.preset === v0.preset && Math.abs((v1.yaw || 0) - (v0.yaw || 0)) < 0.01 && v1.headingUp === v0.headingUp],
      ['the konbini card bought before the save stays bought, off the shelf', !setup2.konbini || (after2.konbini && after2.konbini.taken === true && after2.konbini.paid === true && after2.konbini.shelfCard === false)],
      ['the vending cabinet restocks the SAME slots and the sold one stays SOLD', !setup2.vend || (after2.vend && after2.vend.same === true && after2.vend.qty === 0 && after2.vend.mesh === false)],
      ['the royal egg keeps its clock', !setup2.egg || (after2.egg && after2.egg.royal && after2.egg.listed && after2.egg.left > 500000 && after2.egg.left <= 600000)],
      ['the hatched ant is rebuilt', setup2.ant === true && after2.ant === true && after2.hatchN >= 900],
    ];
    const miss2 = want2.filter(w => !w[1]).map(w => w[0]);
    assert(!miss2.length, `LOAD (round 2) did not put back: ${miss2.join(' · ')}\n${JSON.stringify({ setup2: { view: setup2.view, konbini: setup2.konbini, vend: setup2.vend && { i: setup2.vend.i } }, after2 })}`);
    lap(`✅ A3 the view (${v1.mode}/${v1.preset}), konbini ${setup2.konbini ? 'bought card' : 'n/a'}, vending ${setup2.vend ? 'sold slot' : 'n/a'}, royal egg clock, hatched ant — all back`);

    // ═══ C · AN OLDER DUNGEON'S SAVE ══════════════════════════════════════════════════════════════════════════════
    const oldName = 'Old Dungeon Probe';
    const runBefore = await engine.evaluate((args) => {
      const src = JSON.parse(localStorage.getItem('origami.v8.save.' + encodeURIComponent(args.saveName)));
      src.generatorVersion = 'chain-4-lhall'; src.name = src.displayName = args.oldName;
      try { const st = src.runLedger.state; st.floors[String(st.activeFloor)].snapshot.generatorVersion = 'chain-4-lhall'; } catch (_) {}
      localStorage.setItem('origami.v8.save.' + encodeURIComponent(args.oldName), JSON.stringify(src));
      const m = JSON.parse(localStorage.getItem('origami.v8.saves.manifest') || '{"saves":[]}');
      m.saves.push({ slotId: args.oldName, name: args.oldName, displayName: args.oldName, timestamp: Date.now() - 86400000, floor: 1, role: 'wizard' });   // an old manifest entry: no gen
      localStorage.setItem('origami.v8.saves.manifest', JSON.stringify(m));
      return window._runLedgerDiagnostics().runId;
    }, { saveName, oldName });
    const list = await panels.evaluate(async () => new Promise(resolve => {
      const t = setTimeout(() => resolve(null), 3000);
      const l = e => { if (e.data && e.data.type === 'SAVE_LIST') { clearTimeout(t); window.removeEventListener('message', l); resolve(e.data); } };
      window.addEventListener('message', l); window.parent.postMessage({ type: 'LIST_SAVES' }, '*');
    }));
    const oldRow = list && list.saves.find(s => s.slotId === oldName), newRow = list && list.saves.find(s => s.slotId === saveName);
    assert(oldRow && oldRow.loadable === false && newRow && newRow.loadable === true, `SAVE_LIST did not mark the older save: ${JSON.stringify({ oldRow, newRow })}`);
    const greyed = await panels.evaluate((n) => { const el = document.querySelector('.wg-save-row--old[data-save-id="' + n + '"]'); return el ? el.getAttribute('aria-disabled') : (document.getElementById('wg-saves-list') ? 'missing' : 'guide not mounted'); }, oldName);
    await panels.evaluate((n) => window.parent.postMessage({ type: 'LOAD_NOW', name: n }, '*'), oldName);
    await sleep(3000);
    const refused = await page.evaluate(() => ({ ready: window.__engineReady, refused: window.__loadRefused.slice() }));
    const oniRefused = await engine.evaluate(() => { const ob = window.getOniBabaSafe(); return { last: ob._saveLast, health: ob.sensors.saveHealth, runId: window._runLedgerDiagnostics().runId }; });
    assert(refused.ready === true && oniRefused.runId === runBefore, `LOAD_NOW of an older dungeon's save reloaded or replaced the run: ${JSON.stringify({ refused, oniRefused, runBefore })}`);
    assert(refused.refused.some(r => r.name === oldName && r.reason === 'old-dungeon'), `no LOAD_REFUSED for the older save: ${JSON.stringify(refused.refused)}`);
    assert(oniRefused.last && oniRefused.last.phase === 'refused' && oniRefused.health === 0, `Oni-Baba did not score the refusal: ${JSON.stringify(oniRefused)}`);
    lap(`✅ C  an older dungeon's save is listed not-loadable (guide row: ${greyed}), refused without a reload, saveHealth 0`);

    // ═══ B · THE GUIDE'S SAVE CURRENT ═════════════════════════════════════════════════════════════════════════════
    await engine.evaluate(() => { window._saveSlotsPerSeed = 3; });   // a small cap so the prune is reachable in a test
    const guideSaves = await panels.evaluate(async () => {
      const names = [];
      const l = e => { if (e.data && e.data.type === 'SAVE_DONE') names.push({ name: e.data.name, ok: e.data.success, reqId: e.data.reqId }); };
      window.addEventListener('message', l);
      const wg = window.welcomeGuide;
      const btnText = [];
      for (let i = 0; i < 3; i++) {
        wg._saveFromGuide();
        const t = Date.now(); while (names.length < i + 1 && Date.now() - t < 5000) await new Promise(r => setTimeout(r, 100));
        const b = document.getElementById('wg-save-current-btn'); btnText.push(b ? b.textContent.trim() : null);
      }
      window.removeEventListener('message', l);
      return { names, btnText };
    });
    const g = guideSaves.names;
    assert(g.length === 3 && g.every(x => x.ok && x.reqId), `the guide's SAVE CURRENT did not get three answered saves: ${JSON.stringify(guideSaves)}`);
    assert(/^Floor 1 — WIZARD — \d{1,2}:\d{2}/.test(g[0].name) && new Set(g.map(x => x.name)).size === 3, `slot names are not "Floor N — ROLE — HH:MM" and unique: ${JSON.stringify(g)}`);
    assert(guideSaves.btnText.every(t => t === null || /SAVED!/.test(t)), `the button did not say SAVED! after the engine answered: ${JSON.stringify(guideSaves.btnText)}`);
    const kept = await engine.evaluate(() => {
      const seed = String(window._origamiGameSeed);
      return JSON.parse(localStorage.getItem('origami.v8.saves.manifest') || '{"saves":[]}').saves.filter(s => String(s.seed) === seed).map(s => s.slotId);
    });
    assert(kept.length === 3 && !kept.includes(saveName), `the newest-3 prune did not hold (kept ${JSON.stringify(kept)})`);
    lap(`✅ B  SAVE CURRENT made 3 distinct slots (${g.map(x => x.name).join(' | ')}), SAVED! after SAVE_DONE, the oldest pruned past the cap`);

    // ═══ D · STAIRS ═══════════════════════════════════════════════════════════════════════════════════════════════
    await engine.evaluate(() => {
      window._smgAmmo = 9;
      const source = Object.assign(window._gatherSavePayloadProbe(), { inventory: { 'TEST PERMIT': 1 }, equipment: {} });
      const handoff = window._origamiRunLedger.makeTransition({ fromFloor: 1, toFloor: 2, direction: 'descend', sourceSnapshot: source });
      sessionStorage.setItem('origami.v8.loadSave', JSON.stringify(handoff));
      sessionStorage.setItem('origami.v8.descent', JSON.stringify({ floor: 2, hp: 50, maxHp: 100, karma: 7, direction: 'descend', runId: handoff.runId }));
      window.parent.postMessage({ type: 'DESCEND_REQUEST', floor: 2 }, '*');
    });
    engine = await waitForReload(page);
    const stairs = await pollFrame(engine, () => (window._saveCensusLast && window._saveCensusLast.phase === 'stairs') ? window._saveCensusLast : null, null, { timeout: 120000 });
    assert(stairs, 'no stairs census on floor 2');
    const f2 = await engine.evaluate(() => ({ floor: new URLSearchParams(location.search).get('floor'), smg: window._smgAmmo, house: window._houseBank | 0, health: window.getOniBabaSafe().sensors.saveHealth }));
    assert(f2.floor === '2' && f2.smg === 9 && f2.house === 0 && f2.health === 1, `stairs: the run part did not cross or a floor part leaked: ${JSON.stringify({ f2, census: stairs.parts })}`);
    lap(`✅ D  down the stairs the MAC-9 pool (9) came along, floor 1's House stayed on floor 1, saveHealth 1`);

    if (errors.length) console.log(`[save:parts] browser errors seen (${errors.length}):\n  ` + errors.slice(0, 12).join('\n  '));
    const ours = errors.filter(e => /\[save\]|_savePart|_applySaveParts|_saveCensus|SAVE_|save-harness|saveHealth|RoomPermits/.test(e));
    assert(ours.length === 0, `the save path threw in the browser: ${ours.join(' | ')}`);
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    console.log(`\n✅ smoke:save-parts PASS — round trip, older dungeon refused, SAVE CURRENT slots, stairs (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (error) {
    if (errors.length) console.log(`[save:parts] browser errors seen (${errors.length}):\n  ` + errors.slice(0, 12).join('\n  '));
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
    console.error(`\n❌ smoke:save-parts FAIL — ${error.stack || error.message}`);
    process.exit(1);
  }
})();
