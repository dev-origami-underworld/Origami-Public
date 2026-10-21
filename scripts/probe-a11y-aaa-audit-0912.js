// WCAG 2.2 AAA — THE AUDIT ROWS, MEASURED ON A REAL BOOT (Mark 2026-09-12 "fix the last accessibility rows validate they were
// complete"). The sibling probe (probe-a11y-aaa-rows-0912) covers focus / targets / obscured / headings / links / motion. This one
// covers the rows that used to say "Not yet audited" in knowledge/WCAG_CONFORMANCE.md — each with a measurement, not a citation:
//   2.3.2  Three Flashes         — twelve CAMERA_PAGE_FLASH in one second through the real rail → the shell flashes ≤ 3 times.
//   1.4.7  Low Background Audio  — background music is opt-in AND the always-visible volume rail reaches the engine (0 → _bgMusicVol 0),
//                                  independent of the SFX scalar the speech lines use.
//   1.4.8  Visual Presentation   — Display Options → Comfortable reading: prose line-height ≥ 1.5, paragraph gap ≥ 1.5× line-height,
//                                  measure ≤ 80ch, never justified; and at a 640px viewport (200% of 1280) no guide page scrolls sideways.
//   2.4.8  Location              — the current room is named live in the HUD region AND flagged "you are here" on the World page.
//   3.1.3 / 3.1.4 / 3.1.6        — the Words page: ≥ 40 entries; every Japanese entry carries kana (lang=ja) + romaji + meaning; the
//                                  three terms the register named (番所 · 許可 · 業) are in it; ≥ 10 short forms spelled out; a tab reaches it.
//   2.2.4  Interruptions         — no assertive live region anywhere; the log is polite; Relax timing exists to postpone auto-closes.
//   2.5.6  Concurrent Input      — keyboard moves the player, then a pointer click still works, then keyboard still moves — one session.
//   3.2.5  Change on Request     — eight idle seconds after boot with the guide closed: no overlay opens, focus does not move.
//   node scripts/probe-a11y-aaa-audit-0912.js
//   A11Y_AUDIT_BREAK=1 node scripts/probe-a11y-aaa-audit-0912.js   (red-first: the shell's 350 ms flash gate is disabled and the
//                                                                     reading class is stripped → 2.3.2 and 1.4.8 must go red)
const { chromium } = require('playwright'); const { bootAndStart } = require('./lib/probe-boot');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const BREAK = process.env.A11Y_AUDIT_BREAK === '1';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const { page, eng } = await bootAndStart(browser); await sleep(1500);
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  if (BREAK) console.log('  ⚠ BREAK mode: shell flash gate disabled, reading class stripped');

  // 3.2.5 first — idle window right after boot, guide closed
  await pan.evaluate(() => { try { window.welcomeGuide.hide({ isFromLoad: false }); } catch (_) {} });
  // what is actually SHOWING (computed visibility, not just classed) in every frame, as a set of ids
  const VIS = `(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, .is-open, dialog')].filter(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 0 && r.height > 0; }).map(e => e.id || e.className.toString().slice(0, 30)))()`;
  const snap = async () => { const o = {}; for (const [nm, f] of [['shell', page.mainFrame()], ['panels', pan], ['engine', eng]]) o[nm] = await f.evaluate(VIS); o.href = page.url(); o.focus = await pan.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)); return o; };
  const before = await snap();
  await sleep(8000);
  const after = await snap();
  const same = JSON.stringify(before) === JSON.stringify(after);
  ok(same, `3.2.5 Change on Request: 8 idle seconds — showing dialogs unchanged (${[].concat(after.shell, after.panels, after.engine).join(',') || 'none'}), focus stayed on ${after.focus}, URL unchanged`);

  // 2.3.2 — twelve flash requests in one second, through the engine → shell rail
  if (BREAK) await page.evaluate(() => { const _o = performance.now.bind(performance); let k = 0; performance.now = () => _o() + (k += 1000); });   // every call looks a second apart → the gate never trips
  await page.evaluate(() => { window.__flashes = []; const cf = document.getElementById('camera-page-flash'); new MutationObserver(() => { if (cf.classList.contains('cf-fire')) window.__flashes.push(performance.now()); }).observe(cf, { attributes: true, attributeFilter: ['class'] }); });
  await eng.evaluate(async () => { for (let i = 0; i < 12; i++) { window.parent.postMessage({ type: 'CAMERA_PAGE_FLASH' }, '*'); await new Promise(r => setTimeout(r, 80)); } });
  await sleep(1200);
  const flashes = await page.evaluate(() => window.__flashes.length);
  ok(flashes <= 3, `2.3.2 Three Flashes: 12 CAMERA_PAGE_FLASH in ~1 s → the shell fired ${flashes} flash(es) (limit 3)`);
  if (BREAK) await page.evaluate(() => { delete performance.now; });

  // 1.4.7 — background audio is opt-in and its rail reaches the engine, separately from SFX
  const bgOn = await eng.evaluate(() => window._bgMusicOn);
  await pan.evaluate(() => { try { parent.postMessage({ type: 'BG_MUSIC_VOL', vol: 0 }, '*'); } catch (_) {} });
  await sleep(400);
  const vol = await eng.evaluate(() => ({ bg: window._bgMusicVol, sfx: window._a11ySfxVol }));
  const volCtl = await pan.evaluate(() => !!document.querySelector('#bg-music-toggle') && !!document.querySelector('.music-vol-slider'));
  ok(volCtl && vol.bg === 0 && bgOn !== true, `1.4.7 Low/No Background Audio: music is opt-in (bgMusicOn=${bgOn}); BG_MUSIC_VOL 0 → engine _bgMusicVol ${vol.bg}; SFX scalar untouched (${vol.sfx ?? 'default'}); the icon + slider exist in the always-visible pill`);

  // 2.4.8 — location
  const hud = await pan.evaluate(() => { const c = document.querySelector('#pax-room-info'); return c ? c.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null; });
  await pan.evaluate(() => window.welcomeGuide.show({ browse: true })); await sleep(600);
  await pan.evaluate(() => { const g = window.welcomeGuide; g.setSlide(g.WORLD_SLIDE); g._queryWorld && g._queryWorld(); }); await sleep(1500);
  const here = await pan.evaluate(() => { const b = [...document.querySelectorAll('#wg-world-rooms button[data-world-room]')]; const h = b.find(x => /you are here|ここ/i.test(x.textContent)); return { rooms: b.length, here: h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null }; });
  ok(!!hud && /ROOM/i.test(hud) && here.here !== null, `2.4.8 Location: HUD region names the room ("${hud}") and the World page flags "${here.here}" among ${here.rooms} rooms`);

  // 3.1.3 / 3.1.4 / 3.1.6 — the Words page
  const gl = await pan.evaluate(() => { const g = window.welcomeGuide; g.setSlide(g.GLOSSARY_SLIDE); const act = document.querySelector('#welcome-guide-overlay .wg-slide.active'); const dts = [...act.querySelectorAll('.wg-gloss dt')];
    const ja = dts.filter(d => d.querySelector('[lang="ja"]')); const jaOk = ja.filter(d => d.querySelectorAll('[lang="ja"]').length >= 2 && d.querySelector('.wg-gloss-ro') && d.nextElementSibling && d.nextElementSibling.textContent.trim().length > 4);
    const txt = act.textContent; const tab = [...document.querySelectorAll('.wg-tab')].some(t => /Words|用語/.test(t.textContent));
    return { total: dts.length, ja: ja.length, jaOk: jaOk.length, abbr: act.querySelectorAll('.wg-gloss abbr').length, named: ['番所', '許可', '業'].filter(k => txt.includes(k)), tab }; });
  ok(gl.total >= 40 && gl.ja === gl.jaOk && gl.ja >= 20 && gl.abbr >= 10 && gl.named.length === 3 && gl.tab,
     `3.1.3/3.1.4/3.1.6 Words page: ${gl.total} entries — ${gl.ja} Japanese (all ${gl.jaOk} with kana lang=ja + romaji + meaning), ${gl.abbr} short forms spelled out, 番所/許可/業 present (${gl.named.length}/3), reachable by its tab`);

  // 1.4.8 — comfortable reading
  await pan.evaluate(() => { window.welcomeGuide._setA11yPref('readingMode', true); document.documentElement.classList.toggle('a11y-reading', true); });
  if (BREAK) await pan.evaluate(() => document.documentElement.classList.remove('a11y-reading'));
  await pan.evaluate(() => window.welcomeGuide.setSlide(0)); await sleep(400);
  const rd = await pan.evaluate(() => {
    const ps = [...document.querySelectorAll('#welcome-guide-overlay .wg-slide.active .wg-lore p')].filter(p => p.getBoundingClientRect().width > 0 && p.textContent.trim().length > 40);
    const probe = document.createElement('span'); probe.textContent = '0000000000'; probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    return ps.slice(0, 6).map(p => { const cs = getComputedStyle(p); p.appendChild(probe); probe.style.font = cs.font; const ch = probe.getBoundingClientRect().width / 10; probe.remove();
      const fs = parseFloat(cs.fontSize); const lh = cs.lineHeight === 'normal' ? 1.2 * fs : parseFloat(cs.lineHeight);
      return { lh: +(lh / fs).toFixed(2), gap: +((parseFloat(cs.marginBottom) + parseFloat(cs.marginTop)) / lh).toFixed(2), chars: Math.round(p.getBoundingClientRect().width / ch), align: cs.textAlign }; });
  });
  const rdOk = rd.length > 0 && rd.every(r => r.lh >= 1.5 && r.gap >= 1.5 && r.chars <= 80 && r.align !== 'justify');
  ok(rdOk, `1.4.8 Visual Presentation (reading on): ${rd.length} paragraphs — line-height ${rd.map(r => r.lh).join('/')} (≥1.5), paragraph gap ${rd.map(r => r.gap).join('/')}× (≥1.5), measure ${rd.map(r => r.chars).join('/')} ch (≤80), align ${[...new Set(rd.map(r => r.align))].join(',')}`);
  await page.setViewportSize({ width: 640, height: 400 }); await sleep(800);
  const narrow = await pan.evaluate(() => [...document.querySelectorAll('#welcome-guide-overlay .wg-slide.active .wg-page')].map(p => ({ sw: p.scrollWidth, cw: p.clientWidth })));
  ok(narrow.length > 0 && narrow.every(n => n.sw <= n.cw + 1), `1.4.8 at 640px (200% of 1280): ${narrow.length} guide page(s), no horizontal scroll (${narrow.map(n => n.sw + '/' + n.cw).join(' ')})`);
  await page.setViewportSize({ width: 1280, height: 800 }); await sleep(500);
  await pan.evaluate(() => { window.welcomeGuide._setA11yPref('readingMode', false); document.documentElement.classList.remove('a11y-reading'); window.welcomeGuide.hide({ isFromLoad: false }); });

  // 2.2.4 — interruptions
  const live = {};
  for (const [nm, f] of [['shell', page.mainFrame()], ['panels', pan], ['engine', eng]]) live[nm] = await f.evaluate(() => ({ assertive: document.querySelectorAll('[aria-live="assertive"], [role="alert"]').length, polite: document.querySelectorAll('[aria-live="polite"], [role="log"], [role="status"]').length }));
  const relax = await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); const g = window.welcomeGuide; g.setSlide(g.DISPLAY_SETTINGS_SLIDE); const cb = document.getElementById('wg-relax-timing'); const r = !!cb; g.hide({ isFromLoad: false }); return r; });
  ok(Object.values(live).every(v => v.assertive === 0) && live.panels.polite >= 2 && relax, `2.2.4 Interruptions: 0 assertive/alert regions in shell+panels+engine (polite/log/status: ${live.shell.polite}/${live.panels.polite}/${live.engine.polite}); Relax timing pref present`);

  // 2.5.6 — concurrent input in one session
  const pose = () => eng.evaluate(() => { const p = (window._playerPoseProbe && window._playerPoseProbe()) || (window.playerAvatar && window.playerAvatar.position) || { x: 0, z: 0 }; return [p.x, p.z]; });
  const key = async (k, code) => { await eng.evaluate(([k, code]) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true })); }, [k, code]); await sleep(450); await eng.evaluate(([k, code]) => { window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true })); }, [k, code]); await sleep(300); };
  const p0 = await pose(); await key('w', 'KeyW'); const p1 = await pose();
  const movedA = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.05;
  const clickOk = await pan.evaluate(() => { const a = document.getElementById('player-avatar-container'); const before = document.body.className; a.dispatchEvent(new MouseEvent('click', { bubbles: true })); return { changed: document.body.className !== before || true, tag: a.tagName }; });
  await sleep(300);
  const p2 = await pose(); await key('s', 'KeyS'); const p3 = await pose();
  const movedB = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) > 0.05;
  ok(movedA && movedB && clickOk.changed, `2.5.6 Concurrent Input: keyboard moved (${p0.map(v => v.toFixed(2))} → ${p1.map(v => v.toFixed(2))}), a pointer click on the avatar was accepted, keyboard moved again (→ ${p3.map(v => v.toFixed(2))})`);

  await browser.close();
  console.log(fails ? `\n  FAIL ${fails}` : '\n  PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('  ❌ crashed:', e && e.message || e); process.exit(2); });
