#!/usr/bin/env node
/*
 * probe-seam-run-dupes.js — TWO WALLS IN ONE PLACE = A BLINK.
 *
 * Mark, 2026-08-25, on a top-down shot: "fucked up wall textures that just seem to blink."
 *
 * A "blink" is not a texture problem at all when it comes from geometry: two coplanar, cospatial
 * surfaces make the depth test flicker between them, and the wall strobes as the camera moves. In
 * the seam model this happens by CONSTRUCTION — a wall between room A and room B is walked twice,
 * once as A's east side and once as B's west side, and both land on the same plane. It found exactly
 * that on the dressing-room/manager wall (X plane=167.000, E:55-57 vs W:55-57).
 *
 * No other gate in this repo can see it. band-census and pane-convention read the TILE GRID, where
 * one seam is one seam no matter how many boxes get built on it.
 *
 * PASS = no two wall runs share a plane and overlap along it.
 *
 *   node scripts/probe-seam-run-dupes.js          # verdict
 *   node scripts/probe-seam-run-dupes.js --list   # every run, for eyeballing the floor plan
 */
const { chromium } = require('playwright');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const LIST = process.argv.includes('--list');

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(9000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) throw new Error('engine frame not found');

  const out = await eng.evaluate(() => {
    const runs = window._seamRunProbe || [];
    const byPlane = {};
    runs.forEach(r => {
      const k = (r.horiz ? 'Z' : 'X') + ':' + r.plane.toFixed(3);
      (byPlane[k] || (byPlane[k] = [])).push(r);
    });
    const clashes = [];
    Object.entries(byPlane).forEach(([k, list]) => {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.a <= B.b && B.a <= A.b)          // overlap along the run = same wall, twice
          clashes.push(k + '  ' + A.dir + ':' + A.a + '-' + A.b + '  vs  ' + B.dir + ':' + B.a + '-' + B.b);
      }
    });
    return {
      total: runs.length, clashes,
      all: runs.map(r => (r.horiz ? 'Z' : 'X') + ' plane=' + r.plane.toFixed(2)
        + '  ' + r.dir + ':' + r.a + '-' + r.b + (r.divider ? '  [divider]' : '  [vs rock]')),
    };
  });

  console.log('wall runs        : ' + out.total);
  if (LIST) out.all.sort().forEach(a => console.log('  ' + a));
  console.log('coincident pairs : ' + out.clashes.length);
  out.clashes.forEach(c => console.log('  ✗ ' + c));
  console.log('pageerrors       : ' + errs.length);
  console.log(out.clashes.length === 0
    ? 'PASS — no wall is built twice in the same place.'
    : 'FAIL — ' + out.clashes.length + ' pair(s) of walls occupy the same plane and will z-fight.');
  await b.close();
  process.exit(out.clashes.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL: ' + e.message); process.exit(2); });
