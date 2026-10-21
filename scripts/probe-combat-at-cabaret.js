/**
 * probe-combat-at-cabaret.js — the fight music MUST play where floor 1's fighting actually happens.
 *
 * WHY THIS EXISTS. Mark, twice: "during hostile encounter no music played" → "still plays only the BG music when
 * in combat". probe-composer.js was green throughout, because it stepped the player 40 units AWAY from the
 * cabaret doors before testing combat — I wrote that line to make a failing test pass instead of asking why it
 * failed. The failure was real: the cabaret pre-fade vetoed the COMBAT cue inside a 4-tile bubble around every
 * cabaret door, and the east door is the mouth of the dungeon.
 *
 * So this probe deliberately fights in the place the other probe avoided. It asserts the WHOLE gate input set,
 * so a future failure names its own cause instead of just saying "wrong cue".
 *
 * Usage: node scripts/probe-combat-at-cabaret.js
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
  await sleep(3000);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('✗ engine frame not found'); await b.close(); process.exit(1); }

  // Warm-up: stage the first segments and WAIT for monsters to actually build before the first scenario runs.
  // (Without this the first scenario silently had no hostile and measured nothing — it reported "no monster".)
  await eng.evaluate(async () => {
    for (const seg of [0, 1]) { try { window._unsealDungeonSegment && window._unsealDungeonSegment(seg); window._stageDungeonSegment && window._stageDungeonSegment(seg); } catch (_) {} }
  });
  for (let i = 0; i < 12; i++) {
    const n = await eng.evaluate(() => (window.monsterWrappers || []).filter(w => w && w.userData && !w.userData.isDead).length);
    if (n > 0) break;
    await sleep(1000);
  }

  const R = [];
  const scenario = async (name, place) => {
    const setup = await eng.evaluate(async (which) => {
      for (const seg of [0, 1]) { try { window._unsealDungeonSegment && window._unsealDungeonSegment(seg); window._stageDungeonSegment && window._stageDungeonSegment(seg); } catch (_) {} }
      await new Promise(r => setTimeout(r, 2000));
      const m = (window.monsterWrappers || []).find(w => w && w.userData && !w.userData.isDead);
      const d = (window._cabDoors || [])[0];
      if (!m) return 'no monster';
      if (!d) return 'no cabaret doors';
      // ⛔ INSTRUMENT FIX 2026-09-03 — this probe was measuring a player who never moved.
      //    It wrote `window.px = …` / `window.pz = …`, but px/pz are module-scope `let`s in the
      //    engine: assigning through `window` mints a BRAND-NEW window property and moves the
      //    player nowhere, silently. The monster was then teleported to those invented coordinates
      //    while the player stayed at spawn, so `hostilesNear` read FALSE in every scenario and two
      //    of the four checks went red for a reason that had nothing to do with the game.
      //    `window._tp(x, z)` is the sanctioned handle — it writes the real px/pz ("_tp only ever
      //    moved the player", Engine9 ~:24660). The scenarios' intent, offsets and the four checks'
      //    semantics are UNCHANGED; only the player actually arrives now.
      let _dest = null;
      if (which === 'door-closed') { window._cabDoorsOpen = false; _dest = [d.cx,      d.cz + 4]; }
      if (which === 'door-open')   { window._cabDoorsOpen = true;  _dest = [d.cx,      d.cz + 1]; }
      if (which === 'far')         { window._cabDoorsOpen = false; _dest = [d.cx + 40, d.cz + 40]; }
      if (_dest && typeof window._tp === 'function') window._tp(_dest[0], _dest[1]);
      const _pose = (typeof window._playerPoseProbe === 'function') ? window._playerPoseProbe() : null;
      if (!_pose) return 'no player pose handle';
      m.userData.isHostile = true;
      // Same intent as before: the monster stands where the player is, so the scenario is ABOUT the
      // cabaret door rather than about distance. Now anchored to the player's REAL pose.
      m.position.set(_pose.x, m.position.y, _pose.z);
      // Print the objects, not a boolean: pose proves the player MOVED, and the monster's own
      // post-write state proves whether `isHostile` actually STUCK. A sleep-locked body reverts it.
      await new Promise(r => setTimeout(r, 900));
      // Diagnostics go to a SIDE CHANNEL, never into the return value: one of the four checks
      // compares `setup` against 'ok', so returning a JSON blob here silently broke that check's
      // semantics on my first attempt at this read-back. A probe's contract is not a scratchpad.
      const _u = m.userData || {};
      (window.__cabProbeDiag = window.__cabProbeDiag || []).push({
        which, dest: _dest, pose: [Math.round(_pose.x), Math.round(_pose.z)],
        monsterAt: [Math.round(m.position.x), Math.round(m.position.z)],
        name: _u.displayName || _u.name, isHostile: _u.isHostile === true, sleeper: _u._sleeper === true,
        aiState: _u.aiState, isGuardOgre: _u.isGuardOgre === true, ogreSleepLock: window._ogreSleepLock,
        combatNearTiles: window._combatNearTiles });
      return 'ok';
    }, place);
    await sleep(2200);
    const s = await eng.evaluate(() => {
      const st = window._composer.state();
      const d = window._composer.diag();
      const grab = (re) => { const m = d.match(re); return m ? m[1] : '?'; };
      return { cue: st.cue, track: String(st.track || '').split('/').pop(),
               combat: grab(/combat (true|false)/), hostilesNear: grab(/hostilesNear (true|false)/),
               nearCabaret: grab(/nearCabaret (true|false)/), roomOwned: grab(/roomOwned (true|false)/) };
    });
    R.push({ name, setup, ...s });
    return s;
  };

  const a = await scenario('fighting AT the cabaret door, doors CLOSED', 'door-closed');
  const c = await scenario('fighting well away from the cabaret',        'far');
  const d = await scenario('standing IN the open cabaret doorway',       'door-open');

  const noMon = R.filter(r => r.setup !== 'ok');
  const checks = [
    { n: 'every scenario had a live hostile', ok: noMon.length === 0, got: noMon.length ? noMon.map(r => r.name + ': ' + r.setup).join('; ') : 'yes' },
    { n: 'combat music plays at the closed cabaret door', ok: a.cue === 'COMBAT', got: a.cue + ' (nearCabaret ' + a.nearCabaret + ')' },
    { n: 'combat music plays away from the cabaret',      ok: c.cue === 'COMBAT', got: c.cue + ' (nearCabaret ' + c.nearCabaret + ')' },
    { n: 'the OPEN doorway still pre-fades it',           ok: d.cue !== 'COMBAT', got: d.cue + ' (nearCabaret ' + d.nearCabaret + ')' },
  ];

  console.log('\n── ⚔️  COMBAT-AT-THE-CABARET PROBE ──');
  for (const r of R) console.log('  · ' + r.name.padEnd(42) + ' → ' + String(r.cue).padEnd(11) + ' ' + r.track
    + '\n      combat ' + r.combat + ' · hostilesNear ' + r.hostilesNear + ' · nearCabaret ' + r.nearCabaret + ' · roomOwned ' + r.roomOwned + '   [' + r.setup + ']');
  console.log('');
  for (const c2 of checks) console.log('  ' + (c2.ok ? '✓' : '✗') + ' ' + c2.n.padEnd(46) + ' ' + c2.got);
  try {
    const _diag = await eng.evaluate(() => window.__cabProbeDiag || []);
    console.log('\n  SETUP DIAGNOSTICS (full objects — rule 16: print the object, verdict later):');
    _diag.forEach(d => console.log('    ' + JSON.stringify(d)));
  } catch (_) {}
  console.log('\npageerrors: ' + (errs.length ? '✗ ' + errs.length : '✓ 0'));
  const pass = checks.every(x => x.ok) && errs.length === 0;
  console.log('\nVERDICT: ' + (pass ? '✅ the fight music plays where the fighting is' : '❌ see above'));
  await b.close();
  process.exit(pass ? 0 : 1);
})();
