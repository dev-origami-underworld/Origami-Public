#!/usr/bin/env node
/*
 * probe-door-on-wall.js — IS THE DOOR ON THE WALL, OR BESIDE IT?
 *
 * Mark, 2026-08-25, on a top-down shot: "the caberet doors are off the wall panel."
 *
 * Not one gate in this repo could have caught that. band-census, sec0-connect, pane-convention and
 * corner-census all read the TILE GRID, where a door and its wall are the same tile and therefore
 * always agree. The defect lives in world space, between two objects that the grid says are fine.
 *
 * So this measures the only thing that matters: the PERPENDICULAR DISTANCE from each door leaf's
 * centre to the plane of the wall run it is set into. On a correct wall that number is ~0. Anything
 * past half a wall thickness (0.21wu) means the door is standing off its own wall.
 *
 * ⚠ RETIRED FROM `gate:` TO `probe:` ON 2026-08-29, AND THE REASON IS STRUCTURAL, NOT A TUNING MISS.
 *   Its premise is "compare each door to the wall run it sits in". There is no such run: `_side`
 *   deliberately BREAKS a run at every door, so the wall the door is set into is precisely the wall
 *   geometry that does not exist at that coordinate. The probe's own header warned about this; today
 *   proved the warning fatal rather than incidental. MEASURED, after fixing two real bugs in it:
 *   2 of 7 door objects evaluate (and read gap 0 — correct), 4 say "cannot evaluate", 1 reads 1.58
 *   against a run on the neighbouring line. A check that cannot reach a verdict on most of its
 *   subjects must not sit in the gate list going permanently red — that teaches people to ignore red.
 *   THE TWO BUGS FIXED, kept because they were real:
 *     · the run's own `off` was PRINTED but never SUBTRACTED, so a door sitting exactly on the wall
 *       face read `gap=0.21` against a 0.06 tolerance. Three doors failed for being right.
 *     · a run on a DIFFERENT wall line could win the match, and its distance was then reported as the
 *       gap — 10.21wu and 5.79wu on a door proven to fill its opening exactly. Now bounded to one
 *       tile, and when nothing qualifies the row says "cannot evaluate", which is not a claim about
 *       the door.
 *   IF THIS IS EVER WANTED AS A GATE AGAIN: do not match runs. Compare the leaf's plane to the two
 *   wall FACES either side of the doorway tile, taken from the tile grid, which always exist.
 *
 * PASS = every door within TOL of a run plane on its own axis.
 *
 * ⚠ NOT WIRED INTO `npm run smoke` AND THAT IS DELIBERATE (AI 2, 2026-08-29). Restored from
 *   `eb99640b^` after the 2026-08-25 door deletion took it; its COLLECTOR was stale (it asked for
 *   `d.unit || d.group || d.mesh` on records that now carry `leaves`) so its first run after restore
 *   found ZERO doors and printed PASS. Collector fixed, and an empty set is now a FAILURE.
 *   BUT its run-MATCHING is not re-verified against today's geometry: feeding it individual LEAVES
 *   instead of one object per door offsets each sample ~1 tile ALONG the wall, and it currently
 *   reports gaps of 1.79-5.79wu that look like an along-axis mismatch, not doors off their wall.
 *   I have NOT confirmed those 9 are real, so I am not putting a red gate nobody trusts into the
 *   shared smoke run and I am not reporting its verdict as a finding. Run it with `npm run
 *   gate:doorwall`; fix the matching before wiring it. The parts that ARE verified and worth keeping
 *   today: it finds the doors again, and it can no longer pass on an empty set.
 *
 *   node scripts/probe-door-on-wall.js            # measure + verdict
 *   node scripts/probe-door-on-wall.js --json     # raw rows
 */
const { chromium } = require('playwright');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL  = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const TOL  = parseFloat(process.env.PROBE_TOL || '0.06');   // wu — a tenth of a pane thickness
const JSON_OUT = process.argv.includes('--json');

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

  const out = await eng.evaluate((tol) => {
    const GRID = window.GRID || 2;
    const runs = window._seamRunProbe || [];
    const rows = [];

    // Every door unit in the world, by IDENTITY (a registered door record), not by guessing at
    // geometry — "Probe Selects A Decoy" is a standing lesson here.
    const seen = new Set();
    // ⚠ I TRIED Box3 HERE AND IT WAS WORSE — recorded so nobody spends the iteration again. A door
    //   unit's world box wraps frame, lintel and threshold, so its "thin axis" comes out as the wall's
    //   PERPENDICULAR for most of these doors; that reading disagreed with the positions and dropped
    //   4 clean zeros to 1. The unit origin is the honest number; where it is ambiguous (below) the
    //   probe says so instead of picking an axis.
    const push = (label, obj, gx, gz) => {
      if (!obj || seen.has(obj.uuid)) return;
      seen.add(obj.uuid);
      const p = new THREE.Vector3(); obj.getWorldPosition(p);
      rows.push({ label, gx, gz, x: +p.x.toFixed(4), z: +p.z.toFixed(4) });
    };
    // ⚠ RESTORED 2026-08-29 AND ITS COLLECTOR WAS STALE. This probe died with the 2026-08-25 door
    //   deletion (eb99640b) and came back to a door system with a DIFFERENT RECORD SHAPE: it asked for
    //   `d.unit || d.group || d.mesh` and `d.hinges`, and today's `_cabDoors` records carry `leaves`.
    //   `window._shojiDoorPanelsProbe` is gone entirely with the shojiDoorPanels system.
    //   MEASURED on the first run after restore: door objects 0 — and it printed PASS.
    //   A gate that finds nothing and calls it success is worse than no gate; see the empty-set
    //   FAILURE at the bottom, which is the other half of this fix.
    const G = window.GRID || 2;
    try {
      (window._cabDoors || []).forEach((d, i) => {
        const gx = Math.round((d.cx || 0) / G), gz = Math.round((d.cz || 0) / G);
        const leaves = Array.isArray(d.leaves) ? d.leaves : (d.leaves ? [d.leaves] : []);
        leaves.forEach((L, j) => {
          // A leaf record may be the Object3D, or a hinge descriptor holding one.
          const o = (L && typeof L.getWorldPosition === 'function') ? L
                  : (L && L.hinge && typeof L.hinge.getWorldPosition === 'function') ? L.hinge : null;
          if (o) push('cabDoor#' + i + '.leaf' + j, o, gx, gz, null);
        });
      });
    } catch (_) {}
    // The 番所 leaf is its own object, built outside _cabDoors (restored 2026-08-29) — named so it
    // can be found without a registry, which is what made it findable here at all.
    try {
      window.scene && window.scene.traverse(o => {
        if (o && o.isMesh && /^GuardDoorLeaf:/.test(o.name || '')) {
          const m = o.name.split(':')[1].split(',');
          push(o.name, o, +m[0], +m[1], null);
        }
      });
    } catch (_) {}

    // ⚠ THE RUN NEVER COVERS THE DOOR TILE. `_side` deliberately BREAKS a run at every door, so a
    //   "which run contains this door?" test finds nothing on the right axis and silently matches a
    //   wall on the perpendicular one — which is what the first version of this probe did, and it
    //   reported 3-10wu gaps that were pure artefact. Match on the door's OWN axis, and allow the
    //   door to sit up to one tile PAST the run's end, because that gap is exactly the doorway.
    // ⚠ ORIENTATION COMES FROM THE GEOMETRY, NOT FROM A RECORD FIELD. `runsNS` disagreed with where
    //   the leaf actually is for 4 of 7 doors, and trusting it mismatched the axis. A door slab's
    //   THIN axis is the wall it stands in — that needs no interpretation and cannot drift out of
    //   sync with the thing on screen the way a bookkeeping flag can.
    //   A door standing in a plane of constant z sits on a HALF-tile z (a seam) and a whole-tile x.
    //   A 2-TILE door's origin is the corner of its span, so BOTH read as seams — for those the
    //   probe tests both candidate planes rather than inventing an orientation.
    const onSeam = v => Math.abs(Math.abs((v / GRID) % 1) - 0.5) < 0.01;
    const measured = rows.map(r => {
      const cands = [];
      if (onSeam(r.z)) cands.push({ horiz: true,  plane: r.z });
      if (onSeam(r.x)) cands.push({ horiz: false, plane: r.x });
      if (!cands.length) return Object.assign({}, r, { gap: null, run: 'DOOR ON NO SEAM' });
      // ⚠ TWO BUGS LIVED HERE AND BOTH INVENTED FAILURES. Measured 2026-08-29 against doors whose
      //   coverage had just been proven exact (opening 3.96 / leaf 3.96 / gap 0):
      //   1. THE RUN'S OWN OFFSET WAS PRINTED BUT NEVER SUBTRACTED. A leaf reported `gap=0.21wu` beside
      //      `off 0.21` — the run's plane is stored on the seam and the wall face sits half a pane
      //      thickness off it, so a door sitting perfectly ON that face reads 0.21 against a 0.06
      //      tolerance. Three doors failed for being exactly right.
      //   2. A RUN ON A DIFFERENT WALL LINE COULD WIN. The along-axis filter alone let a run 5 tiles
      //      away qualify, and `best` then reported its distance as the gap: 10.21wu and 5.79wu on a
      //      door that is on its wall. Nothing bounded the PERPENDICULAR distance, so when no correct
      //      run was in the set the probe fabricated a number instead of saying it could not tell.
      //   FIX: subtract the run's own offset, and refuse any run whose raw perpendicular distance is
      //   more than one tile — that is a different wall, not this door's wall seated badly. When
      //   nothing qualifies the row says so, which is an honest "cannot evaluate" and still fails the
      //   gate; a probe that cannot find the wall must never be read as "the door is off it".
      let best = null;
      for (const c of cands) for (const run of runs) {
        if (!!run.horiz !== c.horiz) continue;
        const along = run.horiz ? r.x : r.z;
        const lo = run.a * GRID - GRID / 2 - GRID - 0.01, hi = run.b * GRID + GRID / 2 + GRID + 0.01;
        if (along < lo || along > hi) continue;
        const raw = Math.abs(c.plane - run.plane);
        if (raw > GRID) continue;                              // a different wall line entirely
        const d = Math.abs(raw - Math.abs(run.off || 0));      // the face sits `off` from the stored seam plane
        if (!best || d < best.d) best = { d: d, raw: raw, run: run.dir + ':' + run.a + '-' + run.b, divider: run.divider, off: run.off };
      }
      return Object.assign({}, r, best
        ? { gap: +best.d.toFixed(4), raw: +best.raw.toFixed(4), run: best.run, divider: best.divider, runOff: +best.off.toFixed(4) }
        : { gap: null, run: 'NO WALL RUN ON THIS SEAM' });
    });

    return {
      runs: runs.length,
      doors: measured.length,
      rows: measured,
      bad: measured.filter(m => m.gap === null || m.gap > tol),
      thin: (typeof window._thinWallTH === 'number') ? window._thinWallTH : 0.42,
    };
  }, TOL);

  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    console.log('wall runs      : ' + out.runs);
    console.log('door objects   : ' + out.doors + '   (tolerance ' + TOL + 'wu, pane thickness ' + out.thin + ')');
    out.rows.forEach(r => console.log('  ' + (r.gap !== null && r.gap <= TOL ? '  ' : '✗ ')
      + r.label.padEnd(22) + ' tile(' + r.gx + ',' + r.gz + ')  x=' + r.x + ' z=' + r.z
      + '  gap=' + (r.gap === null ? 'NO RUN ON THIS AXIS (cannot evaluate — not a claim about the door)' : r.gap + 'wu (raw ' + r.raw + ' − off) run=' + r.run + (r.divider ? ' [divider]' : ' [vs rock, off ' + r.runOff + ']'))));
    console.log('pageerrors     : ' + errs.length);
    console.log(out.bad.length === 0
      ? (out.doors === 0
          ? '❌ FAIL — ZERO door objects found. This gate measures doors against their wall; with no\n       doors collected it is asserting nothing, and "no findings" is not a pass. Either the\n       doors are genuinely absent (a bug) or this collector has gone stale against the record\n       shape again (it did once already — see the note at the collector).'
          : 'PASS — every door sits in the plane of its wall.')
      : 'FAIL — ' + out.bad.length + ' door object(s) stand off their wall.');
  }
  await b.close();
  process.exit((out.bad.length === 0 && out.doors > 0) ? 0 : 1);   // empty set is a FAILURE, not a pass
})().catch(e => { console.error('PROBE FAIL: ' + e.message); process.exit(2); });
