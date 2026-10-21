#!/usr/bin/env node
/*
 * gate-floor-sections.js — grades FLOOR → SECTION → ROOM against Creator.SECTION_RULES.
 *
 * Mark 2026-09-02: "make sure the floors and each section follow the rules, redefine them based on
 * our new system now."
 *
 * ⚠ IT BOOTS THE GAME AND RE-HARVESTS. It never reads a census left over from build time — the
 *   collider audit taught us that a build-time record can be a measurement that never ran
 *   (`surfaces: 0` while every collider scored orphaned). Evidence is taken from a settled scene.
 *
 * ⚠ FLOOR 1 IS GRADED AS AUTHORED. It is Mark's own hand plan via Section0.js — 8 rooms, one
 *   section — so the 4-7 band and the multi-section expectation do not apply to it. Grading his
 *   drawing against a generator's band would report his design as a defect.
 *
 *   node scripts/gate-floor-sections.js --selftest    # grades the RULE, no browser
 *   node scripts/gate-floor-sections.js               # boots floors 1,2,3 and grades them
 *   FLOORS=1,2,3,4 node scripts/gate-floor-sections.js
 */
const path = require('path');
const Creator = require(path.join(__dirname, '..', 'js', 'v8', 'map', 'Creator.js'));

// ⚠ NO DEFAULT SECTION COUNT, AND THAT IS A MEASUREMENT, NOT A SHRUG. Sampled floor 2 six times per
//   build: every sample had FIVE sections (0-4) — and a later run of the same build produced FOUR.
//   The count is seed-dependent, so a gate asserting "exactly 5" reports a healthy floor as broken
//   on the seeds that give 4. CONTIGUITY (0..N with no gap) holds either way and is always checked.
//   Set EXPECT_SECTIONS=5 to assert a count once the intended number is decided.
// ⭐ FIVE SECTIONS IS NOW A SPEC, NOT A GUESS. Mark 2026-09-02: "we only use sections 0-4 for each
//   floor". ⛔ REVISED the same day by his hand-drawn map: THREE sections, numbered on the drawing
//   "1 west 2 north 3 east", plus the core. So the set is {0,1,2,3} — FOUR entries — and there is no
//   section 4. Override with EXPECT_SECTIONS=n.
// ⛔ SUPERSEDED 2026-09-03 by Mark: "just say this floor has a section 0 from entrance,caberet, etc
//   + sections 1-3 to activate, once done the final section 4 (guardroom) is activated" — the set is
//   {0,1,2,3,4}, FIVE entries, and section 4 is the GUARDROOM. The 09-02 "no section 4, permanent"
//   order is dead; the newest order wins without the old one needing to be justified first.
//   ⚠ The count is only half of it. `Creator.SECTION_MODEL` says what each entry IS, and the
//     violation text now names the MISSING section by role rather than printing the arithmetic —
//     "4 section(s), expected 5" never told anyone which room set nobody will ever see.
const EXPECT_SECTIONS = process.env.EXPECT_SECTIONS ? Number(process.env.EXPECT_SECTIONS) : 5;

// ── RED-FIRST SELFTEST ────────────────────────────────────────────────────────────────────────
// Every case states what it MUST report. A case that cannot fail proves nothing, so each one is
// paired with the shape it is distinguished from.
function selftest() {
  const cases = [
    { name: 'absent evidence is a FAIL, not a pass',
      ev: null, opts: {}, want: 'section-evidence' },
    { name: 'malformed census (no bySection) is a FAIL',
      ev: { floor: 2, rooms: 9 }, opts: {}, want: 'section-evidence' },
    { name: 'zero sections is "did not measure", not "clean"',
      ev: { bySection: {}, unaddressed: 0 }, opts: {}, want: 'section-evidence' },
    { name: 'THE GUARDROOM IS NOT BUILT: 0,1,2,3 present, the model wants 4 as well',
      ev: { bySection: { 0: 7, 1: 4, 2: 5, 3: 3 }, unaddressed: 0 },
      opts: { expectSections: 5 }, want: 'section-sequence' },
    { name: 'a GAP in the middle (0,1,3) is caught even when the count looks right',
      ev: { bySection: { 0: 5, 1: 4, 3: 4 }, unaddressed: 0 }, opts: {}, want: 'section-sequence' },
    { name: 'a section of 1 room is a corridor, not a place',
      ev: { bySection: { 0: 5, 1: 1 }, unaddressed: 0 }, opts: {}, want: 'section-min-rooms' },
    { name: '3 rooms is under the 4-6 band — WARN, not fail',
      ev: { bySection: { 0: 5, 1: 3 }, unaddressed: 0 }, opts: { floor: 1 }, want: 'section-room-band',
      wantSeverity: 'warn' },
    { name: 'DEPTH SCALING: 5 rooms is OUT of band on floor 3 (wants 6-8)',
      ev: { bySection: { 0: 5, 1: 5 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'] }, recordCount: 10, recordsWithSectionIndex: 10 },
      opts: { floor: 3 }, want: 'section-room-band', wantSeverity: 'warn' },
    { name: 'an unaddressable room fails the address rule',
      ev: { bySection: { 0: 5, 1: 5 }, unaddressed: 2 }, opts: {}, want: 'section-address' },
    // ── S6: THE DEAL IS RANDOM, THE SET IS NOT (Mark 2026-09-03) ──────────────────────────────
    //    These four are the red-first pairing for the one-of-each rule. The first is the case the
    //    OLD rule got wrong: a perfectly good floor whose deal put storage in section 1 would have
    //    been reported as three violations by "section 1 is assigned cafeteria".
    { name: 'S6: a DEALT floor — storage in 1, cafeteria in 2, factory in 3 — is CLEAN',
      ev: { bySection: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            anchor: { x: 57.9, z: 60.0 },
            sectionCentroids: { 1: [36.5, 60.0], 2: [57.9, 40.0], 3: [80.0, 60.0], 4: [61.0, 69.5] },
            roomTypesBySection: { 1: ['storage'], 2: ['cafeteria'], 3: ['factory'], 4: ['guard'] },
            recordCount: 21, recordsWithSectionIndex: 21,
            recordSections: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 1, expectSections: 5 }, want: null },
    { name: 'S6: a section holding TWO of the three specials is caught',
      ev: { bySection: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            roomTypesBySection: { 1: ['storage', 'cafeteria'], 2: ['room'], 3: ['factory'], 4: ['guard'] },
            recordSections: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 2, expectSections: 5 }, want: 'section-special' },
    { name: 'S6: THREE CAFETERIAS pass one-per-section and must still FAIL one-of-each',
      ev: { bySection: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['cafeteria'], 3: ['cafeteria'], 4: ['guard'] },
            recordSections: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 2, expectSections: 5 }, want: 'section-special' },
    { name: 'S6: the GUARDROOM is NOT dealt — section 4 holding a cafeteria is a violation',
      ev: { bySection: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            roomTypesBySection: { 1: ['storage'], 2: ['factory'], 3: ['cafeteria'], 4: ['cafeteria'] },
            recordSections: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 2, expectSections: 5 }, want: 'section-special' },
    { name: 'a section assigned cafeteria that has none',
      ev: { bySection: { 0: 5, 1: 5 }, unaddressed: 0, roomTypesBySection: { 0: ['room'], 1: ['room'] } },
      opts: {}, want: 'section-special' },
    { name: 'room types unobservable → section-special is UNGRADED (warn), never reported absent',
      ev: { bySection: { 0: 5, 1: 5 }, unaddressed: 0 }, opts: {},
      want: 'section-evidence', wantSeverity: 'warn' },
    { name: 'THE SECTION-LESS FLOOR: tiles resolve 5 sections, records carry none',
      ev: { bySection: { 0: 7, 1: 4, 2: 4, 3: 3, 4: 3 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'] },
            recordCount: 22, recordsWithSection: 22, recordsWithSectionIndex: 0 },
      opts: { expectSections: 5 }, want: 'section-index-parity' },
    // ⛔ SUPERSEDED 2026-09-03 by Mark ("the final section 4 (guardroom)"): the two cases that stood
    //    here asserted the OPPOSITE — that core+W/N/E was clean and that a fourth section was out of
    //    spec. They are inverted below, not deleted, because the pair is what distinguishes "the
    //    model has five entries" from "any count is fine".
    { name: "MARK'S MODEL: core + W/N/E + the guardroom as section 4 (ONE room) — CLEAN",
      ev: { bySection: { 0: 8, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            anchor: { x: 57.9, z: 60.0 },
            // ⚠ SECTION 4'S CENTROID IS DELIBERATELY DUE SOUTH — the direction nothing in the
            //   compass table names. It must NOT be graded: `SECTION_DIRECTION` has no row for 4 and
            //   inventing one would fail every floor against a direction Mark never specified.
            sectionCentroids: { 1: [36.5, 60.0], 2: [57.9, 40.0], 3: [80.0, 60.0], 4: [61.0, 69.5] },
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'], 4: ['guard'] },
            recordCount: 24, recordsWithSectionIndex: 24,
            recordSections: { 0: 8, 1: 4, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 1, expectSections: 5 }, want: null },
    { name: 'THE GUARDROOM EXEMPTION IS ONE SECTION WIDE: section 1 with 1 room still FAILS min-rooms',
      ev: { bySection: { 0: 8, 1: 1, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'], 4: ['guard'] },
            recordSections: { 0: 8, 1: 1, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 1, expectSections: 5 }, want: 'section-min-rooms' },
    { name: 'SECTION 4 WITHOUT A GUARD ROOM IN IT is caught by section-special',
      ev: { bySection: { 0: 8, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'], 4: ['room'] },
            recordSections: { 0: 8, 1: 4, 2: 5, 3: 6, 4: 1 } },
      opts: { floor: 1, expectSections: 5 }, want: 'section-special' },
    { name: 'a FIFTH section is not in the model — the model stops at 4',
      ev: { bySection: { 0: 8, 1: 4, 2: 5, 3: 6, 4: 1, 5: 5 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'], 4: ['guard'] },
            recordSections: { 0: 8, 1: 4, 2: 5, 3: 6, 4: 1, 5: 5 } },
      opts: { floor: 1, expectSections: 5 }, want: 'section-sequence' },
    { name: 'no centroids → section-direction is UNGRADED (warn), never silently clean',
      ev: { bySection: { 0: 9, 1: 4, 2: 5, 3: 6 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'] },
            recordSections: { 0: 9, 1: 4, 2: 5, 3: 6 } },
      opts: { floor: 1, expectSections: 4 }, want: 'section-evidence', wantSeverity: 'warn' },
    { name: 'THE LIVE DEFECT: right buildings, right numbers, WRONG DIRECTIONS',
      ev: { bySection: { 0: 9, 1: 4, 2: 5, 3: 6 }, unaddressed: 0,
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'] },
            recordSections: { 0: 9, 1: 4, 2: 5, 3: 6 },
            anchor: { x: 57.9, z: 60.0 },
            sectionCentroids: { 1: [72.6, 48.9], 2: [82.2, 48.9], 3: [36.5, 53.0] } },
      opts: { floor: 1, expectSections: 4 }, want: 'section-direction' },
    // ── THE CONTROLS. If these fire, the gate is too strict and would report healthy floors. ──
    { name: 'THE FICTION: records claim sections 1-4, tiles have only section 0 — caught even when AUTHORED',
      ev: { bySection: { 0: 17 }, unaddressed: 0, roomTypesBySection: { 0: ['cabaret'] },
            recordCount: 17, recordsWithSectionIndex: 17,
            recordSections: { 0: 9, 1: 2, 2: 2, 3: 2, 4: 2 } },
      opts: { authored: true }, want: 'section-tile-parity' },
    { name: 'CONTROL: authored floor 1 (8 rooms, one section) is CLEAN',
      ev: { bySection: { 0: 8 }, unaddressed: 0, roomTypesBySection: { 0: ['cabaret', 'hallway'] },
            anchor: { x: 57.9, z: 60.0 }, sectionCentroids: { 1: [36.5, 60.0], 2: [57.9, 40.0], 3: [80.0, 60.0] },
            recordSections: { 0: 8 } }, opts: { authored: true }, want: null },
    { name: 'CONTROL: a healthy floor — core + W/N/E inside the band + the guardroom — is CLEAN',
      ev: { bySection: { 0: 5, 1: 4, 2: 5, 3: 6, 4: 1 }, unaddressed: 0,
            anchor: { x: 57.9, z: 60.0 },
            sectionCentroids: { 1: [36.5, 60.0], 2: [57.9, 40.0], 3: [80.0, 60.0], 4: [61.0, 69.5] },
            roomTypesBySection: { 1: ['cafeteria'], 2: ['factory'], 3: ['storage'], 4: ['guard'] },
            recordCount: 26, recordsWithSection: 26, recordsWithSectionIndex: 26 },
      opts: { expectSections: 5 }, want: null },
    { name: 'CONTROL: a connector key "0+1+2" is a ROOM, not a section, and must not create a gap',
      ev: { bySection: { 0: 5, 1: 4, '0+1+2': 1 }, unaddressed: 0,
            anchor: { x: 57.9, z: 60.0 }, sectionCentroids: { 1: [36.5, 60.0], 2: [57.9, 40.0], 3: [80.0, 60.0] },
            roomTypesBySection: { 0: ['room'], 1: ['cafeteria'] } }, opts: {}, want: null },
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const res = Creator.validateSections(c.ev, c.opts) || [];
    const rules = res.map(r => r.rule);
    const hit = c.want ? rules.indexOf(c.want) >= 0 : res.length === 0;
    let sevOk = true;
    if (hit && c.wantSeverity) sevOk = res.some(r => r.rule === c.want && r.severity === c.wantSeverity);
    if (hit && sevOk) { pass++; console.log('  PASS  ' + c.name); }
    else { fail++; console.log('  FAIL  ' + c.name + '\n        expected ' + (c.want || 'NO violations')
      + (c.wantSeverity ? (' (severity ' + c.wantSeverity + ')') : '') + ', got ' + (JSON.stringify(rules) || '[]')); }
  }
  console.log('\nSELFTEST — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 2 : 0);
}
if (process.argv.includes('--selftest')) selftest();

// ── LIVE ──────────────────────────────────────────────────────────────────────────────────────
const { chromium } = require('playwright');
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const FLOORS = (process.env.FLOORS || '1,2,3').split(',').map(s => s.trim()).filter(Boolean);
// ── SEED PIN (added 2026-09-03) ──────────────────────────────────────────────────────────────────
//   Floors 2+ are procedurally generated, so this gate's WARNING COUNT MOVES BETWEEN RUNS OF ONE
//   TREE — measured: the same tree gave "PASS with 1 warning", then "PASS with 3". That makes an
//   A/B against it meaningless: a difference between two arms cannot be told from seed noise, and I
//   spent a wave unable to prove whether a rect change had caused a warning or the dice had.
//   `SECTIONS_SEED=<n>` pins the generator through the same sessionStorage key the segment smoke
//   already uses — REUSED, not reinvented.
//   ⚠ THIS CHANGES DETERMINISM, NOT ASSERTIONS. Every rule below is untouched, and an A/B runs BOTH
//     arms through this same gate version, so the instrument is constant across the comparison —
//     which is what keeps "a gate edited by the change it judges" from applying here.
//   ⚠ AND IF WARNINGS STILL MOVE ON A PINNED SEED, THAT IS A GATE DEFECT AND ITS OWN FINDING, not a
//     result about whatever change is being tested.
const SECTIONS_SEED = process.env.SECTIONS_SEED || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ⚠ TWO SOURCES, AND THE SPLIT IS FORCED — NOT A PREFERENCE.
//   `Creator.rooms()` is authoritative for IDENTITY and ADDRESS (it is what `assignAddresses`
//   stamps), but it only knows generic kinds: measured on floor 2, `{hallway 1, room 14,
//   corridor 7}`. It carries NO `roomType`, NO `isCafeteria`/`isFactory`, and no map cell carries
//   `roomType` either (swept every cell: zero).
//   ⚠⚠ MY FIRST VERSION OF THIS GATE GRADED `section-special` OFF `Creator.rooms()` AND REPORTED
//     "section 1 contains no cafeteria" ON EVERY FLOOR. That is a VACUOUS FAIL — the rule could not
//     see the property it was grading, so its verdict was independent of the map. `_roomsProbe`
//     holds the real census (floor 2: cafeteria 1 · factory 1 · casino 1 · store 1), so the
//     specials were there the whole time. Never claim absence from an enumeration that cannot see
//     the thing.
const HARVEST = () => {
  const mp = window.map || [];
  const R = (window.Creator && window.Creator.rooms) ? window.Creator.rooms() : [];
  const bySection = {};
  let unaddressed = 0;
  for (const r of R) {
    const a = r.address;
    if (!a || a.floor === undefined || !Array.isArray(a.sections) || !a.sections.length || a.room === undefined) {
      unaddressed++; continue;
    }
    bySection[a.sections.join('+')] = (bySection[a.sections.join('+')] || 0) + 1;
  }
  // room TYPES come from the generator's own room records, which are the only thing that knows
  // a room is a cafeteria. Absent → the rule reports itself ungraded rather than reporting absence.
  const P = window._roomsProbe;
  let roomTypesBySection = null;
  if (Array.isArray(P) && P.length) {
    roomTypesBySection = {};
    for (const r of P) {
      const sec = (r.sectionIndex !== undefined && r.sectionIndex !== null) ? r.sectionIndex : r.segmentId;
      if (sec === undefined || sec === null) continue;
      (roomTypesBySection[String(sec)] = roomTypesBySection[String(sec)] || []).push(r.roomType || 'room');
    }
  }
  // ⚠ WHICH FIELD, NOT WHETHER A FIELD. Consumers read `sectionIndex`; the generator populates
  //   `segmentId`. Count records that carry EITHER, and report the split so a zero is attributable.
  let recordsWithSection = 0, withSectionIndex = 0, withSegmentId = 0;
  if (Array.isArray(P)) for (const r of P) {
    const hasIdx = r.sectionIndex !== undefined && r.sectionIndex !== null;
    const hasSeg = r.segmentId !== undefined && r.segmentId !== null;
    if (hasIdx) withSectionIndex++;
    if (hasSeg) withSegmentId++;
    if (hasIdx || hasSeg) recordsWithSection++;
  }
  // what the RECORDS claim, kept SEPARATE from what the tiles say — the gap between them is the rule
  const recordSections = {};
  if (Array.isArray(P)) for (const r of P) {
    const sec = (r.sectionIndex !== undefined && r.sectionIndex !== null) ? r.sectionIndex : null;
    if (sec !== null) recordSections[String(sec)] = (recordSections[String(sec)] || 0) + 1;
  }
  // ⚠ CENTROIDS OFF THE TILES, and the anchor is the CABARET found by room TYPE — not a constant and
  //   not a table, because a table is what is in doubt when direction is worth checking.
  const acc = {};
  for (let x = 0; x < mp.length; x++) for (let z = 0; z < mp[x].length; z++) {
    const c = mp[x][z]; if (!c) continue;
    if (c.type !== 'floor' && c.type !== 'shoji_door' && c.type !== 'door') continue;
    const sg = c.segmentId; if (sg === undefined || sg === null) continue;
    (acc[sg] = acc[sg] || { n: 0, x: 0, z: 0 }); acc[sg].n++; acc[sg].x += x; acc[sg].z += z;
  }
  const sectionCentroids = {};
  for (const k in acc) sectionCentroids[k] = [+(acc[k].x / acc[k].n).toFixed(1), +(acc[k].z / acc[k].n).toFixed(1)];
  let anchor = null;
  const cab = Array.isArray(P) ? P.find(r => /cabaret/i.test(r.roomType || '')) : null;
  if (cab) { let ax = 0, az = 0, an = 0;
    for (let x = 0; x < mp.length; x++) for (let z = 0; z < mp[x].length; z++) {
      const c = mp[x][z]; if (c && c.roomId === cab.roomId) { ax += x; az += z; an++; } }
    if (an) anchor = { x: +(ax / an).toFixed(1), z: +(az / an).toFixed(1) };
  }
  return { rooms: R.length, bySection, roomTypesBySection, unaddressed, recordSections,
           sectionCentroids, anchor,
           recordCount: Array.isArray(P) ? P.length : 0, recordsWithSection: recordsWithSection,
           recordsWithSectionIndex: withSectionIndex,
           withSectionIndex: withSectionIndex, withSegmentId: withSegmentId,
           typeSource: Array.isArray(P) && P.length ? ('_roomsProbe[' + P.length + ']') : 'NONE' };
};

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1024, height: 700 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript((seed) => {
    try { localStorage.setItem('origami_tc_accepted', 'true'); } catch (_) {}
    // pinned BEFORE any engine code runs, so the generator reads it on its first draw
    if (seed) { try { sessionStorage.setItem('origami.v8.seed', String(seed)); } catch (_) {} }
  }, SECTIONS_SEED);
  if (SECTIONS_SEED) console.log('  seed pinned: ' + SECTIONS_SEED + '  (SECTIONS_SEED)');
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 150000 });
  await sleep(5000);

  let totalFail = 0, totalWarn = 0;
  console.log('FLOOR / SECTION / ROOM GATE — Creator.SECTION_RULES\n  rules: ' + Creator.SECTION_RULES.join(' · ') + '\n');

  for (const FL of FLOORS) {
    // descend the way the shell descends: repoint the iframe at ?floor=N
    await page.evaluate((fl) => {
      const ifr = document.getElementById('engine-iframe');
      const v = (ifr.src.match(/[?&]v=([^&]+)/) || [])[1] || '';
      ifr.src = 'Origami.RealityEngine.9.html?floor=' + fl + (v ? '&v=' + v : '');
    }, FL);
    await sleep(2500);
    let f = null;
    for (let i = 0; i < 30; i++) {
      const fr = page.frames().find(x => new RegExp('Engine9\\.html\\?floor=' + FL + '(&|$)').test(x.url()));
      if (fr) { try { if (await fr.evaluate(() => !!(window.map && window.Creator && window.Creator.rooms().length))) { f = fr; break; } } catch (_) {} }
      await sleep(2000);
    }
    if (!f) { console.log('  FLOOR ' + FL + ' — ⛔ never became ready; NOT GRADED (an ungraded floor is not a pass)'); totalFail++; continue; }
    await sleep(8000);
    const ev = await f.evaluate(HARVEST);
    ev.floor = FL;
    const authored = String(FL) === '1';
    const res = Creator.validateSections(ev, {
      authored: authored,
      floor: Number(FL) || 1,                                       // band scales +1 per floor of depth
      expectSections: EXPECT_SECTIONS,   // 0-4 on every floor, authored or not
    }) || [];
    const fails = res.filter(r => r.severity !== 'warn'), warns = res.filter(r => r.severity === 'warn');
    totalFail += fails.length; totalWarn += warns.length;
    // ⛔ THE OLD LABEL SAID "band + section-count exempt" AND BOTH HALVES WERE FALSE. Read the code:
    //    the band loop in `validateSections` skips section 0 and the guardroom section and tests
    //    `o.authored` NOWHERE, and `expectSections` is passed for every floor including this one. A
    //    label is a claim; this one told three seats floor 1 was ungraded on two rules it was being
    //    graded on. What IS exempt on an authored floor: nothing in this gate — only section 0's own
    //    room count, which is skipped on every floor because the core is sized by its own layout.
    console.log('  FLOOR ' + FL + (authored ? '  (AUTHORED — Section0.js; graded on the full model, section 0 sized by its own layout)' : '')
      + '\n    rooms ' + ev.rooms + ' · sections ' + JSON.stringify(ev.bySection)
      + ' · unaddressed ' + ev.unaddressed
      + '\n    anchor ' + JSON.stringify(ev.anchor) + ' · centroids ' + JSON.stringify(ev.sectionCentroids)
      + '\n    tiles say ' + JSON.stringify(ev.bySection) + ' · records say ' + JSON.stringify(ev.recordSections)
      + '\n    records ' + ev.recordCount + ' · carry sectionIndex ' + ev.withSectionIndex
      + ' · carry segmentId ' + ev.withSegmentId
      + '\n    room-type source: ' + ev.typeSource
      + (ev.roomTypesBySection ? (' → ' + JSON.stringify(ev.roomTypesBySection)) : ''));
    for (const r of fails) console.log('      ⛔ ' + r.rule + ' — ' + r.msg);
    for (const r of warns) console.log('      ⚠  ' + r.rule + ' — ' + r.msg);
    if (!res.length) console.log('      ✅ clean');
  }
  await b.close();
  console.log('\n  pageerrors: ' + errs.length + (errs.length ? ('\n    ' + errs.join('\n    ')) : ''));
  console.log('  ' + (totalFail ? ('FAIL — ' + totalFail + ' violation(s), ' + totalWarn + ' warning(s)')
                                : ('PASS' + (totalWarn ? (' — with ' + totalWarn + ' warning(s)') : ''))));
  process.exit(totalFail ? 2 : 0);
})().catch(e => { console.error('GATE FAILED TO RUN', e && e.message); process.exit(1); });
