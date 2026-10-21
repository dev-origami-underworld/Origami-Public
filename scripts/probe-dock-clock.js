#!/usr/bin/env node
/**
 * probe-dock-clock.js — prove the mini-dock clock reads a NON-page-deck song.
 *
 * THE BUG (Mark 2026-08-20, screenshot): the dock marquee scrolled "…l Beneath Paris
 * Skies" while .mn-time sat at 0:00 / 0:00. MUSIC_PAGE_TIME is posted only from
 * _mpWire (Engine9 ~:18790), i.e. only by the PAGE DECK — every ambient source
 * (Starlette's set, the Composer decks, the cabaret hum) reaches the marquee through
 * the mini-truth watcher and reached the clock through nothing at all.
 *
 * This enrols a real BG file in the transport ledger exactly the way the cabaret hum
 * does, then asserts the dock's marquee AND its clock both come alive.
 */
const { chromium } = require('playwright');
const { bootAndStart } = require('./lib/probe-boot');

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1',
                                          args: ['--use-angle=metal', '--enable-gpu',
                                                 '--autoplay-policy=no-user-gesture-required'] });
  let bad = 0;
  try {
    const { page, timings, pageerrors } = await bootAndStart(browser, { viewport: { width: 1600, height: 900 } });
    console.log(`[boot] ready ${timings.readyMs}ms -> loop ${timings.loopMs}ms`);
    const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
    const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
    if (!eng || !pan) { console.log('FAIL — missing frame'); process.exit(2); }

    // Enrol a BG track in the ledger the same way the cabaret hum does.
    const started = await eng.evaluate(async () => {
      const el = new Audio('./assets/sounds/BG-OLD/BG-PostParisDream.mp3');
      window.__probeBg = el;
      el.volume = 0.4; el.loop = false;
      try { window._installMusicTransport?.(el, 'probe-bg'); } catch (_) {}
      try { await el.play(); } catch (e) { return 'play refused: ' + e.message; }
      await new Promise(r => setTimeout(r, 2500));
      return { paused: el.paused, currentTime: el.currentTime, duration: el.duration };
    });
    console.log('[engine] ledger element:', JSON.stringify(started));

    // The truth watcher runs on a 1s heartbeat — give it several, then read the dock.
    await page.waitForTimeout(5000);
    const a = await pan.evaluate(() => ({
      title: (document.querySelector('#mini-player .mnt') || {}).textContent,
      time:  (document.querySelector('#mini-player .mn-time') || {}).textContent,
      on:    document.querySelector('#mini-player').classList.contains('on'),
    }));
    await page.waitForTimeout(4000);
    const b = await pan.evaluate(() => ({
      time: (document.querySelector('#mini-player .mn-time') || {}).textContent,
    }));

    const ck = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };
    console.log('\n── THE DOCK, WITH AMBIENT MUSIC PLAYING (no page deck) ──');
    console.log(`  .mnt     = "${a.title}"`);
    console.log(`  .mn-time = "${a.time}"   then 4s later → "${b.time}"`);
    ck(a.on, 'dock is .on');
    ck(/paris/i.test(a.title || ''), 'marquee names the track');
    ck(a.time !== '0:00 / 0:00', 'clock is NOT stuck at 0:00 / 0:00  ← the reported bug');
    ck(/\/ 3:32|\/ 3:3\d/.test(a.time || ''), `duration reads the real 3:32 (got "${a.time}")`);
    ck(a.time !== b.time, 'clock ADVANCES between reads');

    console.log('\npageerrors:', pageerrors.length, pageerrors);
    if (pageerrors.length) bad++;
    console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  } finally { await browser.close(); }
  process.exit(bad ? 1 : 0);
})();
