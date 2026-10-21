/**
 * probe-vending-count.js — one vending cabinet per floor level, and every one of them solid.
 *
 * Mark 2026-07-26: "make sure to add vending machines 2x to caberet on level 2, there will be 3 for level 3."
 *
 * Checks the count, that each cabinet stands on a real FLOOR tile (the July regression put one inside a wall),
 * that they do not overlap each other, and that every one has a collider — not just the first.
 *
 * Usage: node scripts/probe-vending-count.js [level]
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LVL = Number.isFinite(+process.argv[2]) ? +process.argv[2] : 3;
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  // force the count the way a deep floor would, using the shipped knob
  await page.addInitScript((n) => { try { window._vendCount = n; } catch (_) {} }, LVL);
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(4000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('✗ engine frame not found'); await b.close(); process.exit(1); }

  // the knob has to reach the ENGINE frame, not just the shell
  const A = await eng.evaluate((want) => {
    const gs = window._vendCabinets || [];
    const cs = window._vendingMachineColliders || [];
    const map = window.map, G = 2;
    const rows = gs.map((g, i) => {
      const x = g.position.x, z = g.position.z;
      const t = map && map[Math.round(x / G)] ? map[Math.round(x / G)][Math.round(z / G)] : null;
      return { i, x: +x.toFixed(2), z: +z.toFixed(2), tile: t ? t.type : 'none', roomId: t ? t.roomId : null };
    });
    let minGap = Infinity;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++)
      minGap = Math.min(minGap, Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z));
    return { want, groups: gs.length, colliders: cs.length, rows, minGap: isFinite(minGap) ? +minGap.toFixed(2) : null,
             knob: window._vendCount };
  }, LVL);

  const R = [];
  const ok = (n, pass, got, w) => R.push({ n, pass: !!pass, got: String(got), want: w || '' });
  ok('the count knob reached the engine', A.knob === LVL, 'window._vendCount = ' + A.knob, String(LVL));
  ok('cabinet count matches the level', A.groups === LVL, A.groups + ' built', String(LVL));
  ok('every cabinet has a collider', A.colliders === A.groups, A.colliders + ' colliders for ' + A.groups + ' cabinets', 'equal');
  ok('every cabinet stands on floor', A.rows.every(r => r.tile === 'floor'), A.rows.map(r => '#' + r.i + ':' + r.tile).join(' '), 'all floor');
  if (A.groups > 1) ok('cabinets do not overlap', A.minGap !== null && A.minGap > 1.0, 'closest pair ' + A.minGap + ' wu', '> 1.0');

  console.log('\n── 🥤 VENDING COUNT PROBE (level ' + LVL + ') ──');
  for (const r of A.rows) console.log('   #' + r.i + '  (' + r.x + ', ' + r.z + ')  tile ' + r.tile + '  room ' + r.roomId);
  console.log('');
  for (const r of R) console.log('  ' + (r.pass ? '✓' : '✗') + ' ' + r.n.padEnd(34) + ' ' + r.got + (r.pass ? '' : '   (want ' + r.want + ')'));
  console.log('\npageerrors: ' + (errs.length ? '✗ ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 4).join('\n  ') : '✓ 0'));
  const pass = R.every(r => r.pass) && errs.length === 0;
  console.log('\nVERDICT: ' + (pass ? '✅ ' + LVL + ' cabinets, all on floor, all solid' : '❌ see above'));
  await b.close();
  process.exit(pass ? 0 : 1);
})();
