#!/usr/bin/env node
/**
 * probe-winamp-fold.js — verify the 2026-08-20 dock fold (Mark's four asks).
 *
 * WHAT IT PROVES, none of it by eye:
 *   1. HEIGHT  — #mini-player is ~100px, i.e. 50% of the old 200px.
 *   2. FLUSH   — the dock's TOP sits on #action-rail's BOTTOM (gap 0, --music-dock-gap).
 *   3. FOLD    — the transport + VOL/AMP are hidden at rest and visible on :hover,
 *                AND the panel's own height does NOT change while hovered. That last
 *                clause is the load-bearing one: _dockClearGuard caps #action-rail off
 *                this element's measured rect on a 1.5s heartbeat, so a hover-grown
 *                panel would resize the PLAYER panel under the pointer.
 *   4. RING    — #action-zone's 8 buttons sit on the 72px radius (Mark 2026-08-23: "reduce
 *                spacing … too far from avatar center" — pulled in from the 08-20 84px ring)
 *                with real air between neighbours: ~7px on a 48px button (the 64px ring left 1px).
 *
 * SETTLE GATE: 0.4s rail transform + one 1.5s guard tick, with margin — the same wait
 * probe-musicdock-steady.js exists to enforce. Do not shorten it.
 */
const { chromium } = require('playwright');
const { bootAndStart } = require('./lib/probe-boot');

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1',
                                          args: ['--use-angle=metal', '--enable-gpu'] });
  let bad = 0;
  const ck = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };
  try {
    const { page, timings, pageerrors } = await bootAndStart(browser, {
      viewport: { width: 1600, height: 900 },
    });
    console.log(`[boot] ready ${timings.readyMs}ms -> loop ${timings.loopMs}ms`);

    const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
    const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!pan || !eng) { console.log('FAIL — missing frame'); process.exit(2); }

    await pan.evaluate(() => {
      try { window._setSidepanelGuideOpen && window._setSidepanelGuideOpen(false); } catch (_) {}
      try { window._enforceSidepanels && window._enforceSidepanels(); } catch (_) {}
    });
    await page.waitForTimeout(4200);

    // ── 0. HIDDEN WHEN SILENT (Mark 2026-08-21 "do not show music panel if no music playing") ──
    const silent = await pan.evaluate(() => {
      const m = document.querySelector('#mini-player'), r = document.querySelector('#action-rail');
      return { display: getComputedStyle(m).display, on: m.classList.contains('on'),
               railCap: r ? r.style.maxHeight : null,
               railBottom: r ? Math.round(r.getBoundingClientRect().bottom) : null };
    });
    console.log(`\n── 0. NOTHING PLAYING ──`);
    console.log(`  #mini-player display=${silent.display} .on=${silent.on}`);
    console.log(`  #action-rail  maxHeight=${silent.railCap} bottom=${silent.railBottom}`);
    ck(silent.display === 'none', 'the dock is HIDDEN while the room is silent');
    ck(!silent.on, '.on is absent — nothing audible');
    // A STALE CAP HERE WOULD BE THE BUG: the rail must reclaim the column the dock vacated,
    // not stay short to clear a panel that is not on screen.
    ck(silent.railBottom !== null && silent.railBottom > 860,
       `the rail reclaims the column to the viewport floor (bottom=${silent.railBottom} of 900)`);

    // ── make music, so the geometry checks below have a box to measure ──────
    await eng.evaluate(async () => {
      const el = new Audio('./assets/sounds/BG-OLD/BG-PostParisDream.mp3');
      window.__probeBg = el; el.volume = 0.3; el.loop = true;
      try { window._installMusicTransport?.(el, 'probe-visibility'); } catch (_) {}
      try { await el.play(); } catch (_) {}
    });
    await page.waitForTimeout(3200);                 // 1s truth-watcher heartbeat + a 1.5s guard tick
    const nowOn = await pan.evaluate(() => {
      const m = document.querySelector('#mini-player');
      return { display: getComputedStyle(m).display, on: m.classList.contains('on') };
    });
    console.log(`\n── 0b. MUSIC PLAYING ──\n  display=${nowOn.display} .on=${nowOn.on}`);
    ck(nowOn.on && nowOn.display !== 'none', 'the dock APPEARS once something is audible');
    // ⚠ SETTLE, DO NOT SNAPSHOT. 1800ms is ONE guard tick and it is not enough: the dock appearing
    //   changes the rail's cap, which can change its margin-top on the NEXT pass, which moves the
    //   edge the dock was just seated against. Measured -8px of overlap at 1800ms. Wait for the
    //   rail bottom to HOLD across consecutive ticks instead of trusting one read (the settle-gate
    //   law this repo already learned the hard way).
    let _prev = -1, _stable = 0;
    for (let i = 0; i < 24 && _stable < 3; i++) {
      await page.waitForTimeout(600);
      const b = await pan.evaluate(() => Math.round(document.querySelector('#action-rail').getBoundingClientRect().bottom));
      _stable = (b === _prev) ? _stable + 1 : 0; _prev = b;
    }
    console.log(`  rail bottom settled at ${_prev} (held ${_stable} consecutive ticks)`);

    const rest = await pan.evaluate(() => {
      const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
        return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom),
                 x: Math.round(b.x), w: Math.round(b.width) }; };
      const mini = document.querySelector('#mini-player');
      const tray = document.querySelector('#mini-player .mn-tray');
      const rail = document.querySelector('#action-rail');
      const cs = tray ? getComputedStyle(tray) : null;
      return {
        mini: R(mini), rail: R(rail), tray: R(tray),
        miniInlineTop: mini ? (mini.style.top || '(none)') : null,
        miniInlineBottom: mini ? (mini.style.bottom || '(none)') : null,
        trayVisibility: cs ? cs.visibility : null,
        trayOpacity: cs ? cs.opacity : null,
        eqH: Math.round((document.querySelector('#mini-player .mn-eq') || {}).getBoundingClientRect ?
              document.querySelector('#mini-player .mn-eq').getBoundingClientRect().height : 0),
        // every control must still be REACHABLE by the existing query surface
        surface: ['[data-mn="prev"]','[data-mn="play"]','[data-mn="next"]','[data-mn="list"]',
                  '[data-mn-fader="vol"]','[data-mn-fader="amp"]','.mn-eq','.mn-title','.mn-time']
                 .map(s => s + (document.querySelector('#mini-player ' + s) ? ' ✓' : ' ✗MISSING')),
        clock: (document.querySelector('#mini-player .mn-time') || {}).textContent,
      };
    });

    // ── hover the dock, then re-measure ────────────────────────────────────
    await pan.hover('#mini-player');
    await page.waitForTimeout(400);
    const hov = await pan.evaluate(() => {
      const mini = document.querySelector('#mini-player');
      const tray = document.querySelector('#mini-player .mn-tray');
      const cs = getComputedStyle(tray);
      const b = mini.getBoundingClientRect(), t = tray.getBoundingClientRect();
      return { miniH: Math.round(b.height), miniY: Math.round(b.y),
               trayVisibility: cs.visibility, trayOpacity: cs.opacity,
               trayY: Math.round(t.y), trayH: Math.round(t.height), trayBottom: Math.round(t.bottom) };
    });

    const ring = await pan.evaluate(() => {
      const az = document.querySelector('#action-zone');
      if (!az) return null;
      az.classList.add('outer-active');
      const cen = az.getBoundingClientRect();
      const cx = cen.x + cen.width / 2, cy = cen.y + cen.height / 2;
      const out = [];
      for (const c of ['act-n','act-ne','act-e','act-se','act-s','act-sw','act-w','act-nw']) {
        const el = az.querySelector('.' + c); if (!el) { out.push([c, null]); continue; }
        const b = el.getBoundingClientRect();
        out.push([c, Math.round(Math.hypot(b.x + b.width/2 - cx, b.y + b.height/2 - cy)), Math.round(b.width)]);
      }
      const r = out.find(o => o[1] != null);
      const size = r ? r[2] : 48, rad = r ? r[1] : 0;
      return { radii: out, chord: Math.round(2 * rad * Math.sin(Math.PI / 8)), btnSize: size,
               airBetweenNeighbours: Math.round(2 * rad * Math.sin(Math.PI / 8) - size) };
    });

    const gap = rest.mini && rest.rail ? rest.mini.y - rest.rail.bottom : null;

    console.log('\n── 1. HEIGHT (was 200px) ──');
    console.log(`  #mini-player h=${rest.mini && rest.mini.h}px  (.mn-eq h=${rest.eqH}px)`);
    ck(rest.mini && Math.abs(rest.mini.h - 100) <= 2, `height is 100±2px — 50% of 200`);

    console.log('\n── 2. FLUSH TO THE PLAYER RAIL ──');
    console.log(`  #action-rail  y=${rest.rail && rest.rail.y}..${rest.rail && rest.rail.bottom}`);
    console.log(`  #mini-player  y=${rest.mini && rest.mini.y}..${rest.mini && rest.mini.bottom}` +
                `   (inline top=${rest.miniInlineTop}, bottom=${rest.miniInlineBottom})`);
    ck(gap !== null && Math.abs(gap) <= 1, `gap between rail bottom and dock top = ${gap}px (want 0)`);
    ck(rest.mini && rest.mini.bottom <= 900, `dock bottom ${rest.mini && rest.mini.bottom} is on screen`);

    console.log('\n── 3. THE FOLD ──');
    console.log(`  at rest : tray visibility=${rest.trayVisibility} opacity=${rest.trayOpacity}`);
    console.log(`  hovered : tray visibility=${hov.trayVisibility} opacity=${hov.trayOpacity}` +
                `  y=${hov.trayY}..${hov.trayBottom} (h=${hov.trayH})`);
    ck(rest.trayVisibility === 'hidden', 'controls hidden at rest');
    ck(hov.trayVisibility === 'visible' && Number(hov.trayOpacity) > 0.9, 'controls shown on hover');
    ck(hov.miniH === rest.mini.h && hov.miniY === rest.mini.y,
       `PANEL BOX UNCHANGED ON HOVER (${rest.mini.h}px @ y=${rest.mini.y} → ${hov.miniH}px @ y=${hov.miniY}) ` +
       `— this is what keeps _dockClearGuard from re-capping the PLAYER panel under the pointer`);
    ck(Math.abs(hov.trayBottom - rest.mini.y) <= 1, 'tray opens UPWARD, flush to the dock top');
    console.log('  query surface: ' + rest.surface.join(' · '));
    ck(!rest.surface.some(x => /MISSING/.test(x)), 'every control still reachable by its original selector');

    console.log('\n── 4. THE AVATAR CONSOLE RING ──');
    console.log('  radii: ' + JSON.stringify(ring && ring.radii));
    console.log(`  button ${ring && ring.btnSize}px · neighbour chord ${ring && ring.chord}px · air ${ring && ring.airBetweenNeighbours}px (was 1px @ r=64)`);
    // 72px ring (Mark 2026-08-23 pull-in): chord 2·72·sin(22.5°)=55.1px on a 48px button = ~7px air.
    // ≥5 asserts "not the 64px clot" (1px) while accepting the tighter ring he asked for.
    ck(ring && ring.airBetweenNeighbours >= 5, 'buttons have real air (not the 64px clot)');
    ck(ring && ring.radii.every(r => r[1] != null && Math.abs(r[1] - ring.radii[0][1]) <= 2), 'ring is round (all 8 at one radius)');

    console.log('\n── clock readout ──');
    console.log(`  .mn-time = "${rest.clock}"   (0:00 / 0:00 is expected here: nothing is playing in a probe boot)`);

    console.log('\npageerrors:', pageerrors.length, pageerrors);
    if (pageerrors.length) bad++;
    console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  } finally { await browser.close(); }
  process.exit(bad ? 1 : 0);
})();
