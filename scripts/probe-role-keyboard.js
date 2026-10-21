/**
 * probe-role-keyboard.js — WCAG keyboard role picker + a scroll-free role page on phone/tablet.
 *
 * Mark 2026-07-26: "arrow key or enter key starts selector by keyboard, up down left right amongst the roles by
 * keyboard. make sure mobile view/tablet view has all roles and not a scrollwindow … keep title wcag 2.2/aa
 * conformed on each role. including entire page - without using scrollbars."
 *
 * Measures, at three viewports: all six roles present and visible · nothing scrolls (scrollHeight <= clientHeight
 * on the overlay and every role container) · the role NAME stays >= 14px · arrows move the selection across the
 * 2x3 roster · exactly one card is tabbable (roving tabindex).
 *
 * Usage: node scripts/probe-role-keyboard.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const VIEWPORTS = [
  { name: 'phone',  width: 390, height: 844 },
  { name: 'phone-short', width: 667, height: 375 },
  { name: 'tablet', width: 820, height: 1180 },
];

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const R = [], errs = [];
  const ok = (n, pass, got, want) => R.push({ n, pass: !!pass, got: String(got), want: want || '' });

  for (const vp of VIEWPORTS) {
    const page = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', e => errs.push(vp.name + ': ' + String(e.message).slice(0, 140)));
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(2500);
    const panels = page.frames().find(f => /Panels\.html/.test(f.url()));
    if (!panels) { ok(vp.name + ': panels frame', false, 'not found', 'present'); await page.close(); continue; }

    // open the guide on the ROLE slide (spread 1)
    await panels.evaluate(() => { const g = window.playerGuide || window.welcomeGuide; if (g) { g.show ? g.show({ browse: true, slide: 1 }) : g.open && g.open(); try { g.setSlide(1); } catch (_) {} } });
    await sleep(1800);

    const A = await panels.evaluate(() => {
      const g = document.getElementById('welcome-guide-overlay');
      if (!g) return { none: true };
      const slide = g.querySelector('.wg-slide.active');
      const cards = Array.from(g.querySelectorAll('.wg-role-card'));
      const vis = cards.filter(c => c.offsetParent !== null);
      const scrollers = [];
      const check = (el, label) => { if (el && el.scrollHeight > el.clientHeight + 2) scrollers.push(label + ' (' + el.scrollHeight + '>' + el.clientHeight + ')'); };
      check(g, 'overlay'); check(slide, 'slide');
      g.querySelectorAll('.wg-roster, .wg-role-grid, .wg-page').forEach((el, i) => check(el, 'roster/page#' + i));
      const nameSizes = vis.map(c => { const n = c.querySelector('.wg-role-name'); return n ? parseFloat(getComputedStyle(n).fontSize) : 0; });
      const tabbable = cards.filter(c => c.getAttribute('tabindex') === '0').length;
      return { total: cards.length, visible: vis.length, scrollers, minName: nameSizes.length ? Math.min(...nameSizes) : 0, tabbable };
    });

    if (A.none) { ok(vp.name + ': guide overlay', false, 'missing', 'present'); await page.close(); continue; }
    ok(vp.name + ': all 6 roles visible', A.visible === 6, A.visible + ' of ' + A.total + ' visible', '6');
    ok(vp.name + ': nothing scrolls', A.scrollers.length === 0, A.scrollers.length ? A.scrollers.join(', ') : 'no scrollers', 'none');
    ok(vp.name + ': role name >= 14px', A.minName >= 14, 'smallest name ' + A.minName + 'px', '>= 14px');
    ok(vp.name + ': one tabbable card', A.tabbable === 1, A.tabbable + ' with tabindex=0', '1');

    // keyboard walk — only on the first viewport (the behaviour is viewport-independent)
    if (vp === VIEWPORTS[0]) {
      const seq = [];
      const cur = async () => panels.evaluate(() => {
        const a = document.activeElement;
        return { id: a && a.dataset ? a.dataset.roleId : null, checked: a ? a.getAttribute('aria-checked') : null };
      });
      await panels.evaluate(() => { const g = document.getElementById('welcome-guide-overlay'); g && g.focus && g.focus(); });
      for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
        await page.keyboard.press(k); await sleep(220); seq.push((await cur()).id);
      }
      const distinct = new Set(seq.filter(Boolean));
      ok('arrows start + move the selector', seq.filter(Boolean).length === 4 && distinct.size >= 3,
         seq.join(' → '), '4 focused roles, >= 3 distinct');
      const st = await cur();
      ok('the focused role is selected', st.checked === 'true', 'aria-checked ' + st.checked, 'true');
    }
    await page.close();
  }

  console.log('\n── ⌨️  ROLE KEYBOARD + NO-SCROLL PROBE ──');
  for (const r of R) console.log('  ' + (r.pass ? '✓' : '✗') + ' ' + r.n.padEnd(38) + ' ' + r.got + (r.pass ? '' : '   (want ' + r.want + ')'));
  console.log('\npageerrors: ' + (errs.length ? '✗ ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 4).join('\n  ') : '✓ 0'));
  const pass = R.every(r => r.pass) && errs.length === 0;
  console.log('\nVERDICT: ' + (pass ? '✅ six roles, no scrollbars, keyboard-drivable' : '❌ see above'));
  await b.close();
  process.exit(pass ? 0 : 1);
})();
