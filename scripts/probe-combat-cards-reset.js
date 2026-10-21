#!/usr/bin/env node
/**
 * probe-combat-cards-reset.js — Mark 2026-08-20:
 *   "when out of combat, do not show melee combat cards, go back to general playing cards
 *    - EACH TIME NOT IN COMBAT"
 *
 * THE BUG WAS NOT THE RESET — IT WAS THAT THE RESET DID NOT STICK. HIDE_COMBAT has always
 * called loadDeck(fullDeckSpread()) (Panels ~:20072), so the hand DID go back to general on
 * combat end. But `window._activeCardFilter` ('MELEE', set by the ring's MELEE button) and
 * `window._meleeMenuState` survived it, and _scheduleDeckRebuild (~:17688) re-applies them on
 * every loot pickup. So the melee deck came BACK a frame after any pickup — which is what
 * "EACH TIME NOT IN COMBAT" is reporting.
 *
 * So the probe must do the thing that used to undo it: end combat, THEN trigger a deck rebuild.
 * A test that only checks the frame after HIDE_COMBAT would have passed on the OLD code too.
 */
const { chromium } = require('playwright');
const { bootAndStart } = require('./lib/probe-boot');

// ── COUNT ONLY WHAT IS ACTUALLY ON SCREEN (hardened 2026-08-20) ──────────────────────────────
//    Every column count below used to be a bare `querySelectorAll('.card-column').length`, which is
//    a TRAVERSE + SHAPE selector: it counts whatever carries the class, visible or not. That is the
//    same construction that let scripts/probe-walltop.js green-light a broken wall fix for months —
//    it read a healthy material on a mesh `_setThinWalls(true)` had hidden at boot. A correct
//    measurement of the wrong object.
//    THIS PROBE WAS NEVER BLIND — its load-bearing assertion is on `window._activeCardFilter`, which
//    is identity-selected and cannot bind to a decoy, and step 5 proves the count DOES discriminate
//    (melee 1 column vs general 5) by making it go red on the pre-fix behaviour. So the count is real
//    corroboration, not decoration. But it could in principle have agreed for the wrong reason —
//    hidden or mid-transition columns — so it now asserts on rendered geometry instead of class
//    membership. `offsetParent` is null for anything display:none or detached; the width test also
//    rejects a column collapsed to nothing mid-animation. The filter is written inline at each call
//    site rather than hoisted into a shared constant — these run inside page.evaluate, so a
//    Node-side helper would have to be stringified and injected, which is more moving parts than
//    the one-liner it replaces.

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1',
                                          args: ['--use-angle=metal', '--enable-gpu'] });
  let bad = 0;
  const ck = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };
  try {
    const { page, timings, pageerrors } = await bootAndStart(browser, { viewport: { width: 1600, height: 900 } });
    console.log(`[boot] ready ${timings.readyMs}ms -> loop ${timings.loopMs}ms`);
    const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
    if (!pan) { console.log('FAIL — no panels frame'); process.exit(2); }
    await page.waitForTimeout(2500);

    // ── SEED A HAND FIRST ────────────────────────────────────────────────────
    //    A fresh boot has an EMPTY hand, so every column count reads 0 and cannot tell the melee
    //    view from the general one. (My first run of this probe did exactly that and "failed" on a
    //    0 → 0 comparison that could never have been anything else.) ADD_CARD (~:20510) is the
    //    message the loot path uses; give the player one card from each family so the general
    //    spread is genuinely wider than the melee filter.
    await pan.evaluate(async () => {
      for (const c of ['KATANA', 'BOW', 'FIREBALL', 'HEALTH POTION'])
        window.postMessage({ type: 'ADD_CARD', card: c, qty: 1 }, '*');
      await new Promise(r => setTimeout(r, 900));
    });
    const seeded = await pan.evaluate(() => [...document.querySelectorAll('#guides-container .card-column')].filter(c => c.offsetParent !== null && c.getBoundingClientRect().width > 1).length);
    console.log(`[seed] general hand now shows ${seeded} column(s)`);
    if (seeded === 0) { console.log('  ✗ could not seed a hand — the column assertions below are meaningless'); bad++; }

    const state = () => pan.evaluate(() => ({
      filter: window._activeCardFilter || null,
      meleeMenu: window._meleeMenuState || null,
      bands: [...document.querySelectorAll('#guides-container .card-column')].filter(c => c.offsetParent !== null)
               .map(c => (c.querySelector('.card-column-title, .guide-card-title, .cc-title') || {}).textContent || '?'),
      cards: document.querySelectorAll('#guides-container .guide-card').length,
      columns: [...document.querySelectorAll('#guides-container .card-column')].filter(c => c.offsetParent !== null && c.getBoundingClientRect().width > 1).length,
    }));

    // ── 1. enter the MELEE filter, the way the ring's MELEE button does ──────
    await pan.evaluate(() => window.showCardType('MELEE'));
    await page.waitForTimeout(500);
    const melee = await state();
    console.log(`\n── 1. MELEE FILTER ON ──\n  filter=${melee.filter}  columns=${melee.columns}  cards=${melee.cards}`);
    ck(melee.filter === 'MELEE', 'the MELEE filter is active');

    // ── 2. combat ends ───────────────────────────────────────────────────────
    await pan.evaluate(() => window.postMessage({ type: 'HIDE_COMBAT' }, '*'));
    await page.waitForTimeout(500);
    const after = await state();
    console.log(`\n── 2. AFTER HIDE_COMBAT ──\n  filter=${after.filter}  meleeMenu=${after.meleeMenu}  columns=${after.columns}  cards=${after.cards}`);
    ck(after.filter === null, 'the combat filter is CLEARED (this is the new bit)');
    ck(after.columns > melee.columns, `the general hand is back (${melee.columns} melee columns → ${after.columns})`);

    // ── 3. THE ONE THAT MATTERS: a rebuild must not resurrect it ─────────────
    //     This is the step that would have failed before the fix.
    const rebuilt = await pan.evaluate(async () => {
      // _scheduleDeckRebuild is module-private; drive it the way the game does — a loot pickup.
      window.postMessage({ type: 'ADD_CARD', card: 'DAGGER', qty: 1 }, '*');
      await new Promise(r => setTimeout(r, 600));
      return { filter: window._activeCardFilter || null,
               columns: [...document.querySelectorAll('#guides-container .card-column')].filter(c => c.offsetParent !== null && c.getBoundingClientRect().width > 1).length };
    });
    console.log(`\n── 3. AFTER A DECK REBUILD (loot pickup) ──\n  filter=${rebuilt.filter}  columns=${rebuilt.columns}`);
    ck(rebuilt.filter === null, 'still no combat filter — the reset STUCK');
    ck(rebuilt.columns > melee.columns, `still the general hand (${rebuilt.columns} columns, melee view was ${melee.columns})`);

    // ── 4. and again, every time ─────────────────────────────────────────────
    console.log('\n── 4. "EACH TIME NOT IN COMBAT" — three more cycles ──');
    for (let i = 1; i <= 3; i++) {
      const r = await pan.evaluate(async () => {
        window.showCardType('MELEE');
        await new Promise(r => setTimeout(r, 200));
        const on = window._activeCardFilter;
        window.postMessage({ type: 'HIDE_COMBAT' }, '*');
        await new Promise(r => setTimeout(r, 300));
        window.postMessage({ type: 'ADD_CARD', card: 'DAGGER', qty: 1 }, '*');
        await new Promise(r => setTimeout(r, 400));
        return { on, off: window._activeCardFilter || null,
                 columns: [...document.querySelectorAll('#guides-container .card-column')].filter(c => c.offsetParent !== null && c.getBoundingClientRect().width > 1).length };
      });
      ck(r.on === 'MELEE' && r.off === null, `cycle ${i}: MELEE on → cleared on combat end (${r.columns} columns)`);
    }

    // ── 5. AND PROVE THE CHECK CAN GO RED ────────────────────────────────────
    //    Step 3 is only worth anything if it would have caught the old code. Re-create the old
    //    behaviour exactly — leave the filter set after combat ends — and rebuild. The melee view
    //    must come back, which is the bug Mark reported.
    console.log('\n── 5. THE OLD BEHAVIOUR (filter left set) — must RESURRECT the melee deck ──');
    const old = await pan.evaluate(async () => {
      window.postMessage({ type: 'HIDE_COMBAT' }, '*');
      await new Promise(r => setTimeout(r, 300));
      window._activeCardFilter = 'MELEE';          // ← what the code used to leave behind
      window.postMessage({ type: 'ADD_CARD', card: 'DAGGER', qty: 1 }, '*');
      await new Promise(r => setTimeout(r, 600));
      return { filter: window._activeCardFilter || null,
               columns: [...document.querySelectorAll('#guides-container .card-column')].filter(c => c.offsetParent !== null && c.getBoundingClientRect().width > 1).length };
    });
    console.log(`  filter=${old.filter}  visible columns=${old.columns}`);
    ck(old.filter === 'MELEE' && old.columns <= 2,
       `the melee deck DOES come back when the filter survives (${old.columns} visible column(s)) — this is what ` +
       `earns the column count its place as evidence rather than decoration: it goes RED on the pre-fix behaviour`);
    await pan.evaluate(() => { window._activeCardFilter = null; });

    console.log('\npageerrors:', pageerrors.length, pageerrors);
    if (pageerrors.length) bad++;
    console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  } finally { await browser.close(); }
  process.exit(bad ? 1 : 0);
})();
