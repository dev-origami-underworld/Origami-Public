#!/usr/bin/env node
/*
 * probe-click-path-opens-door.js — DOES AN ACTIVE CLICK PATH COUNT AS FORWARD INTENT?
 *
 * Mark, 2026-08-15: "colliding with doors = wont open anymore". The fix for that was DESCRIBED in a
 * long, correct, confident comment at Engine9 ~:81824 — and never written. `_fwdIntent` read only
 * the movement keys and `autoWalk`; `_clickPath.active` was not in it. Implemented 2026-08-29.
 *
 * ⚠ WHY THIS PROBE TELEPORTS INSTEAD OF WALKING, AND WHY THAT IS NOT A CHEAT.
 *   The harness cannot walk the player: driving a real click path headless computed a 10-tile route,
 *   set `_clickPath.active`, and moved the player 0.69 world units in 25 SECONDS (1446 frames). So a
 *   walk-based test proves nothing about the gate — it never reaches the door. This places the player
 *   AT the door front and faces them at it, so every OTHER term of `_pushOpen` is already satisfied,
 *   and then supplies the one term under test. Position and facing are asserted, not assumed:
 *   the run prints frontT / okFront / okFace / pushTarget per door.
 *
 * ⚠ `window._cabDoorNearestOnly = false` IS SET IN BOTH ARMS AND MUST BE.
 *   Without it `pushTarget` is false for every door — measured: three doors at frontT 0.15 with
 *   okFront AND okFace true and `_cabPushDoor` still pointing elsewhere, because that arbitration is
 *   driven by the per-frame approach loop a teleport never runs. It is a documented flag, it is held
 *   CONSTANT across A and B, and holding it constant is what leaves forward intent as the single
 *   variable. It is a control, not a thumb on the scale.
 *
 * MEASURED 2026-08-29 on door (61,65) — the west door the original comment named, and the one that
 * is the sole route to `stairs_down`:
 *     A  default            : terms all true @ 0.15t, click path active -> door OPENED
 *     B  flag = false       : terms all true @ 0.15t, click path active -> door did NOT open
 *
 * This is also the first time anything in this repo has opened a door from a probe. A previous seat
 * concluded "no teleport-driven probe can ever satisfy _fwdIntent" and declared the 1.75->0.25 door
 * reach change ungradeable on that basis. A click path is drivable from a probe, so it is gradeable.
 *
 *   node scripts/probe-click-path-opens-door.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Decisive A/B on the INTENT GATE itself. The player is teleported to the door front and faced at
// it, so every OTHER term of _pushOpen is already satisfied; the only variable is whether an active
// click path counts as forward intent. No walking involved — the walk is what the harness cannot do.
async function run(flagOff) {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal','--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0,160)));
  await page.addInitScript(() => { window._cabDoorNearestOnly = false; });   // constant in BOTH arms
  if (flagOff) await page.addInitScript(() => { window._clickPathOpensDoors = false; });
  await page.goto('http://127.0.0.1:5501/OrigamiUnderworld.html', { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout:120000 });
  await sleep(9000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));

  const out = await eng.evaluate(async (flagOff) => {
    const G = window.GRID || 2, res = { flagOff, flagValue: window._clickPathOpensDoors };
    if (typeof window._tp !== 'function') return Object.assign(res, { error: 'no window._tp' });
    const recs = (window._cabDoors || []).map((d,i)=>({d,i})).filter(o => o.d.open !== true && !o.d.isDungeonExit);
    if (!recs.length) return Object.assign(res, { error: 'no closed non-exit door' });

    for (const { d, i } of recs) {
      const ax = d.approach === 'x';
      const eff = window._cabDoorProxEff || {};
      const front = (eff.front != null ? eff.front : 0.25);        // tiles
      const stand = Math.max(0.12, front * 0.6);                   // comfortably INSIDE the threshold
      const sx = ax ? d.cx - stand * G : d.cx, sz = ax ? d.cz : d.cz - stand * G;
      const r = window._tp(sx, sz); if (!r) { (res.rows=res.rows||[]).push({i, tpFailed:true}); continue; }
      if (typeof window._tpFace === 'function') window._tpFace(Math.atan2(d.cx - r.x, -(d.cz - r.z)));
      await new Promise(q => setTimeout(q, 300));

      const terms = (() => {
        const p = window._playerPoseProbe(); const rot = p.rot ?? p.rotation ?? 0;
        const dFront = ax ? Math.abs(p.x-d.cx) : Math.abs(p.z-d.cz);
        const toDoor = ax ? (d.cx-p.x) : (d.cz-p.z);
        const fwdAxis = ax ? Math.sin(rot) : -Math.cos(rot);
        const faceMin = (typeof window._cabDoorFaceMin==='number') ? window._cabDoorFaceMin : 0.5;
        return { frontT:+(dFront/G).toFixed(3),
                 okFront: dFront < front*G,
                 okFace: (fwdAxis*toDoor)>0 && Math.abs(fwdAxis)>=faceMin,
                 pushTarget: (window._cabDoorNearestOnly===false) || (window._cabPushDoor===d) };
      })();
      (res.rows=res.rows||[]).push(Object.assign({i, gx:Math.round(d.cx/G), gz:Math.round(d.cz/G)}, terms));
      if (!terms.okFront || !terms.okFace || !terms.pushTarget) continue;

      // Every other term is satisfied. Now supply the ONLY missing one: an active click path.
      const tx = ax ? Math.round(d.cx/G)+2 : Math.round(d.cx/G);
      const tz = ax ? Math.round(d.cz/G)   : Math.round(d.cz/G)+2;
      window._startClickToMoveProbe(tx, tz, false);
      let active=false, opened=false;
      for (let t=0;t<180;t++){
        await new Promise(q=>requestAnimationFrame(q));
        const cp = window._clickPathProbe && window._clickPathProbe();
        if (cp && cp.active) active = true;
        const rec=(window._cabDoors||[])[i];
        if (rec && (rec.open===true || rec.anim)) { opened=true; break; }
      }
      return Object.assign(res, { door:{ i, gx:Math.round(d.cx/G), gz:Math.round(d.cz/G), approach:d.approach },
        terms, clickPathActive: active, doorOpened: opened });
    }
    return Object.assign(res, { error: 'no door could be set up with all other terms satisfied' });
  }, flagOff);
  out.pageerrors = errs.length;
  await b.close(); return out;
}
(async () => {
  const A = await run(false), B = await run(true);
  console.log('A  fix ON (default) :', JSON.stringify(A));
  console.log('B  flag=false       :', JSON.stringify(B));
  const ok = A.doorOpened === true && B.doorOpened === false && A.clickPathActive && B.clickPathActive;
  console.log('\n' + (ok ? 'PROVEN — an active click path opens the door, and the documented flag reverts it.'
                         : 'NOT PROVEN — see rows above.'));
})();
