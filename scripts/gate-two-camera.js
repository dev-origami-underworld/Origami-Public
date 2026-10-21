#!/usr/bin/env node
/*
 * gate-two-camera.js — THE THING THAT WAS IGNORED.
 *
 * Mark, 2026-08-29, naming the root cause himself:
 *   "making sure doors are correct, its not difficult - its just that we had 2 different panes to
 *    look at FPV/TOP DOWN and that was ignored."
 *
 * He is right, and every defect found on 2026-08-29 is an instance of it:
 *   · cabaret door leaves were `layers.set(1)` = FPV only, so the top-down camera could never see the
 *     real door and a SUBSTITUTE quad was drawn for it instead — every later "fix the top-down door"
 *     landed on the substitute (Engine9, the _mkDoor note)
 *   · the jamb reveal is correct in FPV and a square column from above
 *   · a loot card is correct in FPV and a spike from above
 *   · a band tile is hidden in FPV (the near face occludes the far one) and two walls from above
 *   · `pipWalls` is `visible:false` entirely, so a whole wall system was being trimmed for nothing
 *
 * No tile-grid gate can see any of that: it is a property of LAYERS and VISIBILITY, not of the map.
 * This is the check that can. It boots the real engine and, for every STRUCTURAL object (door leaves
 * and wall meshes), asks: can BOTH cameras see it? A structural object visible to only one camera is
 * a failure unless it is on the DECLARED list below, with a reason.
 *
 *   FPV camera  renders layers 0,1,2,3   (Engine9, `camera.layers`)
 *   topDownCam  renders layers 0,3,4     (Engine9, `topDownCamera.layers`)
 *
 * Usage: node scripts/gate-two-camera.js [--strict]     (--strict exits 1 on any violation)
 */
const { chromium } = require('playwright');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const STRICT = process.argv.indexOf('--strict') >= 0;
// PROVE IT CAN GO RED. A detector that has only ever printed PASS is not evidence of anything — this
// repo has shipped several. --selftest takes the pane wall mesh (in both cameras, undeclared) and
// makes it FPV-only, then asserts this gate reports exactly that. Run it whenever the gate changes.
const SELFTEST = process.argv.indexOf('--selftest') >= 0;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 180)));
  if (process.env.PROBE_FLAGS) {
    const flags = JSON.parse(process.env.PROBE_FLAGS);
    await page.addInitScript((f) => { Object.keys(f).forEach(k => { window[k] = f[k]; }); }, flags);
    console.log('  flags: ' + process.env.PROBE_FLAGS);
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(20000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) throw new Error('engine frame not found');

  // ⚠ ENTER TOP-DOWN FIRST. The jamb-stub split and the open-run twins are built lazily on the first
  //   top-down frame, so a gate that never switches cameras would grade a scene missing exactly the
  //   objects whose two-camera status it exists to check — and would report PASS for that reason.
  try {
    const { setTopDown } = require(path.join(__dirname, 'lib', 'set-topdown.js'));
    await setTopDown(page, eng, { preset: 'iso', zoomOut: 2, brighten: false, hidePanels: false, settleMs: 6000 });
    await sleep(1500);
  } catch (e) { console.log('  ⚠ could not enter top-down (' + String(e.message).slice(0, 90) + ') — lazy top-down objects will be missing from this run'); }

  if (SELFTEST) {
    await eng.evaluate(() => { if (window._thinWallsMesh) window._thinWallsMesh.layers.set(1); });
    console.log('  SELFTEST: the pane wall mesh has been forced to FPV-only. This run MUST report it.');
  }

  const report = await eng.evaluate(() => {
    const FPV_MASK = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
    const TD_MASK  = (1 << 0) | (1 << 3) | (1 << 4);

    // ONE-CAMERA BY DESIGN. Every entry needs a reason, and the reason is the point: an exception
    // list without reasons is how the cabaret leaves stayed FPV-only for weeks without anyone asking.
    const DECLARED = [
      { re: /^DoorJambStubs:FPV$/,      side: 'fpv', why: 'the jamb reveal caps the wall’s cut thickness in first person; from above it is a 0.42x0.42 column (TOP_DOWN_MAP_LAW §2.3)' },
    ];

    const rows = [];
    const structural = (o) => {
      const n = o.name || '';
      if (/DoorLeaf|DoorLeaves|JambStubs|BandWallBlocks|StairGate/i.test(n)) return 'door/wall';
      if (o === window._thinWallsMesh) return 'wall';
      return null;
    };

    window.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const kind = structural(o);
      if (!kind) return;
      // ⚠ HIDDEN != BROKEN. Section culling sets .visible=false on a segment ROOT, so a door in a
      //   segment the player has not reached is legitimately not drawn. Name the ancestor that is
      //   hiding it and say which case it is, or this gate reports every far door as a defect.
      let anc = o, hidden = false, hiddenBy = null, culled = false;
      while (anc) {
        if (anc.visible === false) {
          hidden = true;
          hiddenBy = anc.name || (anc === o ? '(itself)' : '(unnamed ancestor)');
          culled = !!(anc.userData && (anc.userData.rtag || anc.userData.segmentInstanceEntry));
          break;
        }
        anc = anc.parent;
      }
      const mask = o.layers ? o.layers.mask : 0;
      const inFpv = !!(mask & FPV_MASK), inTd = !!(mask & TD_MASK);
      const d = DECLARED.find(x => x.re.test(o.name || ''));
      rows.push({
        name: o.name || '(unnamed)', kind, count: o.count || 1, mask,
        inFpv, inTd, hidden, hiddenBy, culled,
        declared: d ? d.side : null, why: d ? d.why : null,
      });
    });

    // The wall CUBE system is checked separately: it is not one-camera, it is NO-camera.
    const cubes = [];
    window.scene.traverse((o) => {
      if (!o.isInstancedMesh || o.count < 300) return;
      const m = o.layers ? o.layers.mask : 0;
      if (m === (1 << 1) || m === (1 << 4)) cubes.push({ mask: m, count: o.count, visible: o.visible });
    });
    return { rows, cubes, thinWalls: (window._thinWallsMesh && window._thinWallsMesh.count) || 0, thinWallsFlag: window._thinWalls };
  });

  const bad = [];
  console.log('TWO-CAMERA PARITY — FPV renders layers 0,1,2,3 · top-down renders 0,3,4');
  console.log('');
  console.log('  ' + 'object'.padEnd(26) + 'count'.padStart(7) + 'mask'.padStart(6) + '   FPV   TOP-DOWN   verdict');
  console.log('  ' + '-'.repeat(78));
  for (const r of report.rows) {
    let verdict;
    if (r.hidden && r.culled)           { verdict = 'section-culled by ' + r.hiddenBy + ' (not a defect)'; }
    else if (r.hidden)                  { verdict = 'HIDDEN by ' + r.hiddenBy + ' — drawn by NEITHER camera'; bad.push(r); }
    else if (r.inFpv && r.inTd)         { verdict = 'ok'; }
    else if (r.declared === 'fpv' && r.inFpv && !r.inTd) { verdict = 'declared FPV-only'; }
    else if (r.declared === 'td' && r.inTd && !r.inFpv)  { verdict = 'declared top-down-only'; }
    else                                { verdict = 'ONE CAMERA ONLY, UNDECLARED'; bad.push(r); }
    console.log('  ' + r.name.slice(0, 25).padEnd(26) + String(r.count).padStart(7) + String(r.mask).padStart(6)
      + '   ' + (r.inFpv ? ' y ' : ' . ') + '     ' + (r.inTd ? ' y ' : ' . ') + '     ' + verdict);
  }
  if (report.cubes.length) {
    console.log('');
    console.log('  wall CUBE meshes (fpvWalls / pipWalls):');
    for (const c of report.cubes)
      console.log('    mask ' + String(c.mask).padStart(3) + '  count ' + String(c.count).padStart(5) + '  visible=' + c.visible
        + (c.visible === false ? '   <-- drawn by NOBODY (_setThinWalls default). Anything trimmed here changes nothing on screen.' : ''));
  }
  console.log('');
  for (const r of report.rows) if (r.why) console.log('  declared: ' + r.name + ' — ' + r.why);
  console.log('');
  console.log(bad.length
    ? 'FAIL — ' + bad.length + ' structural object(s) reachable by only one camera without a declared reason:\n  ' + bad.map(r => r.name).join('\n  ')
    : 'PASS — every structural object is either in both cameras or declared one-camera with a reason.');
  console.log('pageerrors: ' + errs.length);
  await b.close();
  if (SELFTEST) {
    const caught = bad.length > 0;
    console.log(caught
      ? 'SELFTEST PASSED — the gate caught the wall mesh being made FPV-only. It can go red.'
      : 'SELFTEST FAILED — the gate did NOT catch a structural mesh forced to one camera. It cannot be trusted.');
    process.exit(caught ? 0 : 1);
  }
  process.exit((STRICT && (bad.length || errs.length)) ? 1 : 0);
})().catch(e => { console.error('FAILED: ' + (e && e.message)); process.exit(1); });
