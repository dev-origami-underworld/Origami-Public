/**
 * probe-hpbar-fpv.js — is the health gauge fully on screen, and does it stay level? (Mark 2026-07-28)
 *
 * His two complaints, and they are separate faults:
 *   "lower the height elevation of health bars — see its off the screen and not working when it NEEDS
 *    to be seen IN COMBAT … so its properly in full view of player at all times in FPV combat."
 *   "dont let these things flip on axis when moving … when player moves and turns it has a habit of
 *    flipping on its axis."
 *
 * 1. CLIPPING. The gauge anchor is projected to the active camera and its normalized-device Y read.
 *    Anything at or above 1.0 is off the top of the frame. A fixed height CANNOT be checked by eye
 *    because how high 2.05m projects depends on distance, FOV and aspect — so this samples several
 *    distances, which is precisely the case a single screenshot cannot cover.
 *
 * 2. ROLL. The billboard used to copy the camera's FULL quaternion, inheriting pitch and roll. This
 *    pitches the camera hard up and down and asserts the gauge's world X and Z rotation stay ~0.
 *    A test that only checks the level camera passes the broken build, so the camera is deliberately
 *    tilted before each sample.
 *
 * Usage: node scripts/probe-hpbar-fpv.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(8000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('engine frame not found'); await b.close(); process.exit(1); }

  const R = await eng.evaluate(async () => {
    const out = { notes: [], clip: [], roll: [] };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const seg of [0, 1]) { try { window._unsealDungeonSegment(seg); window._stageDungeonSegment(seg); } catch (_) {} }
    for (let i = 0; i < 16; i++) { await wait(700); if ((window.monsterWrappers || []).some(w => w.userData && w.userData.hpGauge)) break; }

    const cam = window.camera;
    const withGauge = (window.monsterWrappers || []).filter(w => w && w.userData && w.userData.hpGauge && w.userData.hpBar && !w.userData.isDead);
    if (!cam) { out.notes.push('window.camera unavailable'); return out; }
    if (!withGauge.length) { out.notes.push('no monster carries a capsule gauge in this headless run — clipping half not exercised'); }

    out.defaultY = (typeof window._monHpBarY === 'number') ? window._monHpBarY : '(engine default)';
    out.fpvFitOn = window._hpGaugeFpvFit !== false;

    // ── 1. CLIPPING at several distances ──────────────────────────────────────────────────────
    const V = new THREE.Vector3();
    const w0 = withGauge[0];
    if (w0) {
      const keep = w0.position.clone();
      for (const d of [2, 4, 8, 14]) {
        // Place the monster d world-units in front of the camera, on its forward axis.
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); fwd.y = 0; fwd.normalize();
        w0.position.set(cam.position.x + fwd.x * d, keep.y, cam.position.z + fwd.z * d);
        if (w0.userData.monBase) w0.userData.monBase.position.set(w0.position.x, w0.userData.monBase.position.y, w0.position.z);
        await wait(260);   // let the per-frame gauge tick run the fit
        // ⚠ FORCE THE MATRICES CURRENT BEFORE PROJECTING. The first cut read hpBar.matrixWorld straight
        // after moving the wrapper and got NaN out of project() — a stale/unbuilt world matrix on a
        // node whose parent had not been updated this frame. Projecting garbage reports "CLIPPED" at
        // every distance, which looks exactly like a real failure and is not one.
        w0.updateMatrixWorld(true);
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();
        V.setFromMatrixPosition(w0.userData.hpBar.matrixWorld);
        const world = { x: +V.x.toFixed(2), y: +V.y.toFixed(2), z: +V.z.toFixed(2) };
        V.project(cam);
        const ok = isFinite(V.y);
        out.clip.push({ dist: d, world, ndcY: ok ? +V.y.toFixed(3) : null,
                        barY: +w0.userData.hpBar.position.y.toFixed(2),
                        onScreen: ok ? (V.y < 1 && V.y > -1) : null });
      }
      w0.position.copy(keep);
    }

    // ── 2. ROLL under camera pitch ────────────────────────────────────────────────────────────
    const g = w0 && w0.userData.hpGauge;
    if (g && g.group) {
      const keepRot = cam.rotation.clone();
      for (const pitch of [0, 0.6, -0.6]) {
        cam.rotation.set(pitch, cam.rotation.y, 0);
        cam.updateMatrixWorld(true);
        await wait(260);
        const e = new THREE.Euler().setFromQuaternion(g.group.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
        out.roll.push({ camPitch: pitch, gaugeX: +e.x.toFixed(3), gaugeZ: +e.z.toFixed(3) });
      }
      cam.rotation.copy(keepRot); cam.updateMatrixWorld(true);
    } else out.notes.push('no gauge group to sample for roll');
    return out;
  });

  const P = s => console.log(s);
  P('\n-- HEALTH GAUGE: ON-SCREEN + LEVEL --\n');
  (R.notes || []).forEach(n => P('  ! ' + n));
  P('  default bar height: ' + R.defaultY + '   ·   FPV fit enabled: ' + R.fpvFitOn);
  let fails = 0;

  if (R.clip && R.clip.length) {
    P('\n  clipping (ndcY >= 1.0 means off the TOP of the frame):');
    for (const c of R.clip) P('     ' + String(c.dist).padStart(3) + 'wu away   ndcY ' + String(c.ndcY).padStart(7)
      + '   barY ' + c.barY + '   world ' + JSON.stringify(c.world) + '   '
      + (c.onScreen === null ? 'UNMEASURABLE' : c.onScreen ? 'on screen' : 'CLIPPED'));
    const unmeasured = R.clip.filter(c => c.onScreen === null);
    const bad = R.clip.filter(c => c.onScreen === false);
    if (unmeasured.length) { P('     INCONCLUSIVE — projection returned non-finite at ' + unmeasured.length + ' sample(s); this probe cannot speak.'); fails++; }
    else { P('     ' + (bad.length ? 'FAIL — clipped at ' + bad.map(c => c.dist + 'wu').join(', ') : 'PASS — on screen at every distance sampled'));
           if (bad.length) fails++; }
  }

  if (R.roll && R.roll.length) {
    P('\n  roll under camera pitch (gauge world X/Z must stay ~0):');
    for (const r of R.roll) P('     camera pitch ' + String(r.camPitch).padStart(5) + '   gauge X ' + String(r.gaugeX).padStart(7) + '   Z ' + String(r.gaugeZ).padStart(7));
    const tilted = R.roll.filter(r => Math.abs(r.gaugeX) > 0.02 || Math.abs(r.gaugeZ) > 0.02);
    P('     ' + (tilted.length ? 'FAIL — the gauge tips with the camera at pitch ' + tilted.map(r => r.camPitch).join(', ')
                               : 'PASS — stays level through every camera pitch'));
    if (tilted.length) fails++;
  }

  P('\n  ' + (fails ? 'FAILED: ' + fails + ' check(s)' : 'PASS: all checks'));
  P('\npageerrors: ' + (errs.length ? 'FAIL ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 3).join('\n  ') : 'ok 0'));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
