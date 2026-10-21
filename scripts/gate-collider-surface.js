#!/usr/bin/env node
/**
 * gate-collider-surface.js — THERE HAS TO BE AN OBJECT TO COLLIDE WITH FIRST.
 *
 * Mark 2026-08-31: "any way you can make sure that we incorporate all collider rules into the
 * creator system? make sure that there has to be an object to collide with first."
 *
 * THE INCIDENT: four seams in section 0 carried a movement collider with NO WALL DRAWN ON THEM.
 * The west corridor stood open to the outer ring on four tiles you could see through and could not
 * walk through. The check that missed it reported "42 of 42 seams walled" — because it tested
 * COLLIDERS, and every collider was present. A collider and a surface are two different objects.
 *
 * ⚠ THIS GATE BOOTS THE ENGINE ON PURPOSE. The rule lives in Creator (`validateColliders`,
 *   `COLLIDER_RULES`) but it CANNOT be graded from the map: colliders and wall surfaces are both
 *   produced at render time. A map-graded version would have been green on the floor that shipped
 *   the four holes. Creator owns the rule; the engine supplies the evidence; this file carries it.
 *
 * ⚠ IT FAILS CLOSED. No audit, an empty audit, or zero surfaces swept are all FAILURES, never a
 *   pass — a zero from an absent measurement is indistinguishable from health.
 *
 * Usage:  node scripts/gate-collider-surface.js
 *         node scripts/gate-collider-surface.js --selftest   (proves RED on an injected orphan)
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SELFTEST = process.argv.includes('--selftest');
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

try { global.Creator = require(path.join(ROOT, 'js/v8/map/Creator.js')); } catch (e) {
  console.error('gate-collider-surface: Creator.js would not load —', e.message); process.exit(2);
}
const C = global.Creator;
if (typeof C.validateColliders !== 'function') {
  console.error('gate-collider-surface: Creator has no validateColliders — the rule is not installed.');
  process.exit(2);
}

// ── SELFTEST FIRST, and it runs WITHOUT a browser: it grades the RULE, not the floor. Three cases,
//    each stating what a PASSING gate must say about it.
function selftest() {
  const cases = [
    ['no evidence at all',        undefined,                                              'collider-evidence'],
    ['malformed evidence',        { nope: 1 },                                            'collider-evidence'],
    ['zero colliders swept',      { total: 0, orphans: 0, surfaces: 10, list: [] },       'collider-evidence'],
    ['zero surfaces swept',       { total: 50, orphans: 50, surfaces: 0, list: [] },      'collider-evidence'],
    ['one real orphan',           { total: 50, orphans: 1, surfaces: 90,
                                    list: [{ axis: 'Z', plane: 127, lo: 99, hi: 101 }] }, 'collider-surface'],
    ['clean floor',               { total: 50, orphans: 0, surfaces: 90, list: [] },      null],
  ];
  let bad = 0;
  for (const [name, ev, want] of cases) {
    const v = C.validateColliders(ev);
    const got = v.length ? v[0].rule : null;
    const ok = got === want;
    if (!ok) bad++;
    console.log((ok ? '  ✓' : '  ✗') + ' ' + name.padEnd(24) + ' → ' + (got || 'clean') + (ok ? '' : '   EXPECTED ' + (want || 'clean')));
  }
  if (bad) { console.error('\n❌ SELFTEST FAILED — ' + bad + ' case(s). The rule does not behave as documented.'); process.exit(2); }
  console.log('\n✅ SELFTEST PASS — the rule fails closed on absent, malformed, empty and surface-less evidence, and passes only on a measured clean floor.');
  process.exit(0);
}
if (SELFTEST) selftest();

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    console.error('gate-collider-surface: playwright not available —', e.message); process.exit(2);
  }
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  const page = await b.newPage({ viewport: { width: 1024, height: 768 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 180)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 150000 });
  await sleep(11000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url())) || page.mainFrame();
  // ⚠ RE-RUN THE AUDIT HERE; DO NOT READ THE ONE FROM BUILD TIME. Measured 2026-08-31: the
  //   build-time call fires inside the wall builder, before `worldGroup` is attached to the scene,
  //   so its surface sweep reads ZERO and every collider looks orphaned. That is the same
  //   wrong-stage error this whole rule exists to catch, committed by the rule's own instrument —
  //   and the fail-closed `surfaces === 0` clause is what caught it on the very first run.
  const audit = await eng.evaluate(() => {
    try { return window._auditColliderSurfaces('gate'); } catch (_) { return window._colliderAudit || null; }
  });
  await b.close();

  if (errs.length) console.error('  pageerrors during boot: ' + JSON.stringify(errs.slice(0, 3)));
  const v = C.validateColliders(audit);
  if (audit) console.log('[COLLIDER GATE] ' + audit.total + ' collider(s), ' + audit.withSurface
    + ' backed by a wall surface, ' + audit.orphans + ' orphaned (' + audit.surfaces + ' surfaces swept).');
  if (!v.length) { console.log('✅ GATE GREEN — every collider has an object to collide with.'); process.exit(0); }
  console.error('\n❌ GATE RED — ' + v.length + ' violation(s):');
  for (const x of v.slice(0, 20)) console.error('   [' + x.rule + '] ' + x.msg);
  process.exit(2);
})().catch(e => { console.error('gate-collider-surface FAILED', e.stack || e.message); process.exit(2); });
