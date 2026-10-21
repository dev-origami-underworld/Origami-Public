#!/usr/bin/env node
/*
 * probe-module-dupes.js — IS ANY MODULE LOADED TWICE IN ONE DOCUMENT?
 *
 * An ES module's identity is its RESOLVED URL, QUERY STRING INCLUDED. So
 * `Foo.js?v=1` and `Foo.js` are two different modules to the browser: it fetches
 * both, evaluates both, and every module-level `let`, cache, registry and class
 * identity exists TWICE. `instanceof` across the two copies is false. Two copies
 * of a "single source of truth" is exactly the [Visibility-Authority] failure the
 * repo already has a standing lesson about, arriving through the loader instead of
 * through a second writer.
 *
 * The cache-token rule in CLAUDE.md is written as "bump every reference to a file
 * you changed". This measures the OTHER half of that rule, the half no gate covers:
 * when two references to one file DISAGREE, nothing goes red — the game just runs
 * two of it.
 *
 * This does not read source. It records what the browser actually FETCHES, per
 * frame, and groups by path. Two distinct query strings for one path in one frame
 * is the defect.
 *
 *   node scripts/probe-module-dupes.js           # verdict
 *   node scripts/probe-module-dupes.js --json    # raw rows
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const JSON_OUT = process.argv.includes('--json');

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });

  // frameUrl -> path -> Set(query)
  const seen = new Map();
  page.on('request', req => {
    if (req.resourceType() !== 'script' && !/\.js(\?|$)/.test(req.url())) return;
    let u; try { u = new global.URL(req.url()); } catch (_) { return; }
    if (!/\.js$/.test(u.pathname)) return;
    let fr = 'unknown';
    try { fr = (req.frame() && req.frame().url()) || 'unknown'; } catch (_) {}
    fr = fr.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
    if (!seen.has(fr)) seen.set(fr, new Map());
    const m = seen.get(fr);
    if (!m.has(u.pathname)) m.set(u.pathname, new Set());
    m.get(u.pathname).add(u.search || '(no token)');
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(9000);   // let lazy dynamic imports land

  const dupes = [], all = [];
  for (const [frame, paths] of seen) {
    for (const [p, qs] of paths) {
      const row = { frame, path: p, tokens: [...qs].sort() };
      all.push(row);
      if (qs.size > 1) dupes.push(row);
    }
  }
  await b.close();

  if (JSON_OUT) { console.log(JSON.stringify({ dupes, all }, null, 2)); }
  else {
    console.log('frames observed : ' + seen.size);
    console.log('js modules      : ' + all.length);
    for (const d of dupes) {
      console.log('\n✗ TWO INSTANCES  ' + d.path);
      console.log('   in frame      ' + d.frame);
      d.tokens.forEach(t => console.log('   fetched as    ' + t));
    }
    console.log('\n' + (all.length === 0
      ? '❌ FAIL — ZERO modules observed. Nothing was measured, so this is not a pass.'
      : dupes.length === 0
        ? 'PASS — every module is fetched under exactly one URL per document.'
        : 'FAIL — ' + dupes.length + ' module(s) loaded twice in one document.'));
  }
  process.exit((all.length > 0 && dupes.length === 0) ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL: ' + e.message); process.exit(2); });
