#!/usr/bin/env node
/*
 * probe-room-occupancy.js — DOES EVERY WORKER ROOM HAVE A BED AND A SLEEPER IN IT?
 *
 * Mark 2026-08-05: "so put a bed in each worker room, put a sleeping worker in that room."
 *
 * THE TRAP THIS EXISTS TO AVOID: probe-sleepers.js counts BODIES (`window.monsterWrappers`) and reported
 * 25 monsters across 8 rooms on a floor whose generator emitted 139 spawns across ~32 rooms. That reads
 * like "24 rooms are empty" and it is not — far segments hold their spawns in `_segmentPendingSpawns`
 * until the player walks in (Mark's own 08-04 segmentation). A body count alone cannot tell an empty room
 * apart from an unstaged one, so this probe reconciles all three ledgers explicitly:
 *
 *   spawns EMITTED (the map data)  ==  bodies BUILT  +  spawns PENDING  +  spawns CULLED
 *
 * and then asks the only question that matters per room: does every ordinary room in sections 1-4 own at
 * least one worker (built or pending) and at least one bed?
 *
 * Usage: node scripts/probe-room-occupancy.js [--url ...]
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('--url', 'http://127.0.0.1:5501/OrigamiUnderworld.html?sec0=1');

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await p.addInitScript(() => { window._showAllSectionMonsters = true; });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });

  // ⚠ WAIT ON THE PAGE, THEN RE-ACQUIRE THE FRAME EVERY TIME. Grabbing the engine frame before the
  //   iframe has navigated hands you a stale handle whose `window` has none of the engine globals —
  //   every read comes back undefined, every count comes back 0, and the probe PASSES on an empty set.
  //   That is exactly what the first run of this file did. Same pattern as probe-sleepers.js.
  await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  const eng = () => p.frames().find(fr => /Engine9\.html/.test(fr.url()));
  // SETTLE-GATED: bodies arrive on the deferred GLB lane, so an early sample under-counts (the method
  // law from 07-28 — wait for the number to hold, do not trust the first read).
  let last = -1, holds = 0, waited = 0;
  while (waited < 90000 && holds < 3) {
    await sleep(3000); waited += 3000;
    const fr = eng(); if (!fr) continue;
    const n = await fr.evaluate(() => (window.monsterWrappers || []).length).catch(() => -1);
    if (n > 0 && n === last) holds++; else holds = 0;
    last = n;
  }
  console.log(`settle: ${last} wrappers, held ${holds}x after ${waited / 1000}s` + (holds < 3 ? '  ⚠ NEVER SETTLED' : ''));

  const f = eng();
  if (!f) { console.log('✗ FAIL — engine frame never appeared'); await b.close(); process.exit(1); }
  const got = await f.evaluate(() => {
    const out = { built: 0, pending: 0, emitted: 0 };
    out.built = (window.monsterWrappers || []).length;
    for (const [, arr] of (window._segmentPendingSpawns || new Map())) out.pending += (arr || []).length;
    out.emitted = (window._mobSpawnsProbe || []).length;

    // beds per room, from every segment manifest + the guard cot
    const beds = {};
    for (const [, m] of (window._dungeonBreakableManifestBySegment || new Map()))
      for (const bd of (m && m.beds) || []) { if (bd) beds[bd.roomId] = (beds[bd.roomId] || 0) + 1; }
    for (const [rid] of (window._guardCotByRoom || new Map())) beds[rid] = (beds[rid] || 0) + 1;

    // workers per room, counting BUILT and PENDING alike — an unstaged room is not an empty room
    const who = {};
    // ⚠ ASK THE BODY WHICH ROOM IT IS IN — do NOT re-derive it from world position. The first cut of
    //   this probe did `Math.round(pos.x / 4)` and matched nothing, reporting every room empty while 29
    //   bodies stood in them. The engine already carries the answer on userData.
    const note = (rid) => { if (Number.isInteger(rid)) who[rid] = (who[rid] || 0) + 1; };
    for (const w of (window.monsterWrappers || [])) { const u = w && w.userData; if (u) note(u._sleepRoomId ?? u.aiRoomId); }
    // pending spawns have no body yet, so those DO come off the tile map
    for (const [, arr] of (window._segmentPendingSpawns || new Map())) for (const s of (arr || [])) {
      const t = window.map?.[s.x]?.[s.z]; if (t && Number.isInteger(t.roomId)) note(t.roomId);
    }
    // and the spawns the generator emitted, which is the ledger the furniture pass itself reads
    const emitted = {};
    for (const s of (window._mobSpawnsProbe || [])) {
      const t = window.map?.[s.x]?.[s.z]; if (t && Number.isInteger(t.roomId)) emitted[t.roomId] = (emitted[t.roomId] || 0) + 1;
    }
    out.emittedByRoom = emitted;

    const rows = [];
    for (const r of (window._roomsProbe || [])) {
      if (!r) continue;
      if (r.id === 0 || r.isCabaret || r.isStore || r.isOniBaba) continue;
      if (!(r.sectionIndex >= 1 && r.sectionIndex <= 4)) continue;
      rows.push({ id: r.id, sec: r.sectionIndex, w: r.w, h: r.h, workers: who[r.id] || 0, spawns: emitted[r.id] || 0, beds: beds[r.id] || 0,
                  special: !!r.isSpecialRoom });
    }
    out.rows = rows.sort((a, c) => a.id - c.id);
    return out;
  });

  const noWorker = got.rows.filter(r => (r.workers + r.spawns) === 0);
  const noBed = got.rows.filter(r => r.beds === 0);
  console.log(`ledger: emitted ${got.emitted} · built ${got.built} · pending ${got.pending} · unaccounted ${got.emitted - got.built - got.pending}`);
  console.log(`section rooms (1-4): ${got.rows.length}`);
  console.log(`  with NO worker: ${noWorker.length}${noWorker.length ? ' -> ' + noWorker.map(r => `#${r.id}(s${r.sec} ${r.w}x${r.h})`).join(' ') : ''}`);
  console.log(`  with NO bed   : ${noBed.length}${noBed.length ? ' -> ' + noBed.map(r => `#${r.id}(s${r.sec} ${r.w}x${r.h})`).join(' ') : ''}`);
  console.log('  per-room  room:spawns(built)/beds — ' + got.rows.map(r => `${r.id}:${r.spawns}(${r.workers})/${r.beds}`).join('  '));
  if (errs.length) console.log('page errors:', errs.slice(0, 5));

  // ⚠ AN EMPTY SET IS A FAILURE, NOT A PASS. Without this the probe reports "✓" when it read nothing
  //   at all — the loudest possible lie a probe can tell. Floor 1 has ~24-30 section rooms; anything
  //   under 12 means the read is broken, not that the floor is small.
  const vacuous = got.rows.length < 12 || got.emitted === 0;
  if (vacuous) console.log(`  ✗ VACUOUS READ — ${got.rows.length} rooms / ${got.emitted} spawns visible. The probe is broken, not the floor.`);
  const ok = !vacuous && !noWorker.length && !noBed.length && !errs.length;
  console.log(ok ? '\n  ✓ every worker room in sections 1-4 has at least one worker and one bed'
                 : '\n  ✗ FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
