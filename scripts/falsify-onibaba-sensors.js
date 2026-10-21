#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * falsify-onibaba-sensors.js — mechanical falsification of Oni-Baba's zero-trust sensor layer.
 *
 * Mark, 2026-09-06: "npm smoke - mechanical falsification, and she will report it in her sensor in
 * the FPS panel", and: "she is now in a zero-trust architecture always checking her own sensors
 * first."
 *
 * WHAT THIS REFUSES TO DO: report that the ring "works" because it returned green once. Every
 * assertion below has a matching case that must go RED, and a run where NOTHING goes red FAILS —
 * a suite that cannot fail is not evidence, it is decoration. The `--red-test` arm exists so the
 * suite's own teeth are provable rather than asserted.
 *
 * ⚠ THE ALIAS LESSON, RECORDED BECAUSE IT COST A FALSE HEADLINE TODAY. A static census of
 *   `sensors.NAME =` write sites reported `corruption` as severed. It is not: OniBaba8.js binds
 *   `const s = this.sensors` and writes `s.corruption = ...` every frame from karma. A text scan
 *   cannot see through an alias, and it cannot tell reachable code from dead code either. THIS
 *   file is the answer to that class of error — it observes writes actually happening at runtime,
 *   which is alias-blind and reachability-honest by construction.
 *
 * Run:  node scripts/falsify-onibaba-sensors.js
 *       node scripts/falsify-onibaba-sensors.js --red-test
 * Exit: 0 all assertions held · 1 a falsification failed · 2 harness could not run (never "pass")
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const ONI = path.join(REPO, 'js', 'v8', 'OniBaba8.js');

let PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
  if (cond) { PASS++; console.log('  ✓ ' + label); }
  else { FAIL++; console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
}

/* Build a browser-ish sandbox rich enough for her constructor. Anything she reaches for that is
 * missing would throw, and a throw here exits 2 (harness broken) rather than 1 (test failed) —
 * the two must never be confused, or a broken harness reads as a passing suite. */
function loadOniBaba() {
  const sandbox = {
    console: { log(){}, warn(){}, info(){}, error(){}, dir(){} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, isFinite,
    performance: { now: () => Date.now() },
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    document: { addEventListener(){}, getElementById: () => null, createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), body:{ appendChild(){} } },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    // She posts to the window she listens on, and a browser delivers that. A no-op postMessage here made
    // this harness blind to her own receptor path (2026-09-17: the rogue-AI bump moved from a direct write
    // to her ROGUE_AI_ALERT case, and the two 'raises her rogue-AI receptor' checks went red on a stub).
    _msgListeners: [],
    addEventListener(t, f){ if (t === 'message') this._msgListeners.push(f); },
    removeEventListener(){},
    postMessage(m){ for (const f of this._msgListeners) { try { f({ data: m, origin: this.location.origin, source: this }); } catch (_) {} } },
    requestAnimationFrame: () => 0, cancelAnimationFrame(){},
    location: { href: 'http://localhost/', origin: 'http://localhost', search: '' },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.parent = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(fs.readFileSync(path.join(REPO, 'js/v8/ai/jester-ai.js'), 'utf8'), sandbox, { filename: 'jester-ai.js' });
    vm.runInContext(fs.readFileSync(ONI, 'utf8'), sandbox, { filename: 'OniBaba8.js' });
  } catch (e) {
    console.error('⛔ HARNESS BROKEN: OniBaba8.js threw while loading: ' + e.message);
    process.exit(2);
  }
  /* `class OniBaba8` is a top-level LEXICAL binding, so it never lands on the VM global — but the
   * file self-instantiates (`window.oniBaba8 = new OniBaba8(null)`), and reaching the class through
   * that instance is strictly better evidence anyway: it means her real constructor already ran to
   * completion in this sandbox before a single assertion was graded. */
  const live = sandbox.oniBaba8 || (sandbox.window && sandbox.window.oniBaba8);
  const Cls = live && live.constructor;
  if (typeof Cls !== 'function') {
    console.error('⛔ HARNESS BROKEN: could not reach the OniBaba8 class after loading.');
    process.exit(2);
  }
  return { Cls, sandbox, live };
}

function main() {
  const { Cls, sandbox } = loadOniBaba();
  const redTestOnly = process.argv.includes('--red-test');

  console.log('MECHANICAL FALSIFICATION — Oni-Baba zero-trust sensor layer\n');

  // ── POSITIVE CONTROL: the instrument itself is alive before anything is judged by it. ────────
  console.log('POSITIVE CONTROLS');
  let oni;
  try { oni = new Cls(); } catch (e) {
    console.error('⛔ HARNESS BROKEN: constructor threw: ' + e.message); process.exit(2);
  }
  const names = Object.keys(oni.sensors);
  ok('constructor completes and sensors exist', names.length > 0, 'got ' + names.length);
  if (names.length === 0) { console.error('⛔ zero sensors — refusing to grade.'); process.exit(2); }
  /* HER DECLARED NERVES, BY NAME (2026-10-09). ⛔ SUPERSEDED 2026-09-27 by Mark: "make sure you always let onibaba know if you
   * need to create a sensor to watch what you are doing" — the line here checked a bare COUNT (17). Four receptors (etiquette,
   * exasperation, pipStall, bossFight) were added on 09-27 without touching it, the count read 21, and `npm run smoke` went red
   * at this step with nothing saying which nerves were new. On 2026-10-09 the harness repeated the same stale-ledger failure
   * for cardCull and the workers' five. A new sensor is declared in OniBaba8.js's sealed block AND named here, in the same
   * change; an undeclared one, or one that vanished, is named in the failure. */
  const DECLARED = [
    'cruelty', 'desperation', 'tension', 'silence', 'corruption', 'cognitiveEcho', 'hiveMindStr', 'renderStress',
    'cardCull', 'cobwebs', 'roomVariety', 'buildStrain', 'etiquette', 'crowd', 'fightClear', 'bouncers', 'thirst', 'hunger',
    'exasperation', 'pipStall', 'bossFight', 'saveHealth', 'stairsHealth',
    'jesterPresence', 'jesterWatching', 'jesterTilt', 'jesterFlip',
    'narrativeNeed', 'rogueAi', 'fpsHealth', 'uiFriction', 'cognitiveCoherence', 'cognitiveReality',
  ];
  const undeclared = names.filter(n => !DECLARED.includes(n)), gone = DECLARED.filter(n => !names.includes(n));
  ok('every receptor she carries is declared here by name (' + DECLARED.length + ') — and every declared one is present',
     undeclared.length === 0 && gone.length === 0,
     (undeclared.length ? 'NOT DECLARED HERE: ' + undeclared.join(',') : '') + (gone.length ? ' MISSING FROM HER: ' + gone.join(',') : ''));
  ok('ledger installed for every sensor', names.every(n => oni._sensorLedger[n]));
  ok('both index names are defined in one place, not repeated',
     oni.COHERENCE_A === 'cognitiveReality' && oni.COHERENCE_B === 'cognitiveCoherence',
     'got ' + oni.COHERENCE_A + ' / ' + oni.COHERENCE_B);

  // ── GREEN ARM ────────────────────────────────────────────────────────────────────────────────
  console.log('\nGREEN ARM — a healthy nerve must read healthy');
  oni.sensors.tension = 0.4;
  ok('a write is RECORDED by the ledger', oni._sensorLedger.tension.writes === 1,
     'writes=' + oni._sensorLedger.tension.writes);
  ok('the written value reads back', oni.sensors.tension === 0.4, 'got ' + oni.sensors.tension);

  // THE ALIAS CASE — the exact defect that broke the static gate today.
  const alias = oni.sensors;
  alias.corruption = 0.25;
  ok('a write through a LOCAL ALIAS is still recorded (the static gate could not see this)',
     oni._sensorLedger.corruption.writes === 1, 'writes=' + oni._sensorLedger.corruption.writes);

  // ── RED ARM: every one of these MUST go red, or the ring is decoration. ──────────────────────
  console.log('\nRED ARM — the ring must go RED on purpose');

  let r = new Cls();
  r.sensors.tension = 99;                              // out of her 0..1 fuzzy range
  let ring = r.diagnosticRing();
  ok('out-of-range value ⇒ RED', ring.state === 'red', 'state=' + ring.state);
  ok('  …and the reason names the sensor', /tension/.test(ring.reasons.join('|')), ring.reasons.join('|'));

  r = new Cls();
  r.sensors.silence = NaN;
  ring = r.diagnosticRing();
  ok('non-numeric value ⇒ RED', ring.state === 'red', 'state=' + ring.state);

  r = new Cls();
  r.sensors = { tension: 0, faked: 1 };                // wholesale swap attempt
  ring = r.diagnosticRing();
  ok('sensor-object replacement is REFUSED', r._sensorSwaps === 1, 'swaps=' + r._sensorSwaps);
  ok('  …the real sensors survive the swap', Object.keys(r.sensors).length === DECLARED.length,
     'got ' + Object.keys(r.sensors).length + ' of ' + DECLARED.length);
  ok('  …and the ring goes RED about it', ring.state === 'red', 'state=' + ring.state);

  // THE FALSE-REPORT CASE — Mark's own red condition, in his words "reporting false". Two
  // independent paths, and a rogue has to beat both: a mirror that stops refreshing (STALE, no
  // timestamp) and a mirror that keeps refreshing but with fabricated numbers (WRONG, fresh
  // timestamp but disagrees beyond plausible one-second drift). Real deployment reads this off
  // the engine iframe's own window (fixed 2026-09-06 — a bare window._lastOniBabaStats on HER
  // window can never see it, she runs in the parent); the harness has no real iframe, so this
  // exercises the fallback path onto sandbox.window, which the sandbox's document.getElementById
  // stub (always returns null) correctly falls through to.
  r = new Cls();
  for (const n of Object.keys(r.sensors)) { if (!r.COHERENCE_PAIR.includes(n) && n !== r.RESERVED_FIELD) r.sensors[n] = 0.5; }  // silence the yellow arm
  sandbox.window._lastOniBabaStats = { outputs: Object.assign({}, r.outputs) };   // exact match, no `at` at all
  ring = r.diagnosticRing();
  ok('a mirror that stopped refreshing ⇒ RED even with matching values', ring.state === 'red', 'state=' + ring.state);
  ok('  …and it says stale, not a false value match', /stale/.test(ring.reasons.join('|')), ring.reasons.join('|'));
  delete sandbox.window._lastOniBabaStats;

  r = new Cls();
  for (const n of Object.keys(r.sensors)) { if (!r.COHERENCE_PAIR.includes(n) && n !== r.RESERVED_FIELD) r.sensors[n] = 0.5; }
  sandbox.window._lastOniBabaStats = { at: Date.now(), outputs: Object.assign({}, r.outputs) };  // fresh…
  sandbox.window._lastOniBabaStats.outputs.fogDensity = 0.9;   // …but fabricated: fogDensity's own range tops out at 0.154
  ring = r.diagnosticRing();
  ok('a FRESH surface reporting a value that is NOT hers ⇒ RED', ring.state === 'red', 'state=' + ring.state);
  ok('  …and it names the divergence, not staleness', /fogDensity/.test(ring.reasons.join('|')) && !/stale/.test(ring.reasons.join('|')), ring.reasons.join('|'));
  delete sandbox.window._lastOniBabaStats;

  /* ── THE TWO ATTACKS THE PEER SEAT LANDED. Both were confirmed against the real file before
   *    being fixed, and both are locked here so the hole cannot quietly reopen. ─────────────── */
  console.log('\nPEER-FOUND ATTACKS — these must stay closed');

  // ATTACK 1: forge the reporter. Was: `oni.diagnosticRing = () => ({state:'green'})` → GREEN.
  r = new Cls();
  let forged = false;
  try { r.diagnosticRing = () => ({ state: 'green', reasons: ['forged'], mirrorFaults: [] }); }
  catch (e) { forged = true; }                    // strict mode: assignment to non-writable throws
  const ringAfter = r.diagnosticRing();
  ok('forging diagnosticRing is REFUSED (throws or is ignored)',
     forged || ringAfter.state !== 'green' || !/forged/.test(ringAfter.reasons.join('|')),
     'state=' + ringAfter.state + ' reasons=' + ringAfter.reasons.join('|'));
  let d = Object.getOwnPropertyDescriptor(r, 'diagnosticRing');
  ok('  …diagnosticRing is a non-writable, non-configurable OWN property',
     !!d && d.writable === false && d.configurable === false,
     d ? ('writable=' + d.writable + ' configurable=' + d.configurable) : 'no own property');
  d = Object.getOwnPropertyDescriptor(r, 'verifySensors');
  ok('  …verifySensors is locked the same way',
     !!d && d.writable === false && d.configurable === false);

  // ATTACK 2: internal tick math must not pass as proof the world is still feeding her.
  r = new Cls();
  r._internalWrite = true;
  for (const n of Object.keys(r.sensors)) r.sensors[n] = 0.5;   // exactly what _fuzzyTick does
  r._internalWrite = false;
  const vInt = r.verifySensors();
  ok('a sensor written ONLY by her own tick math reads never-stimulated',
     vInt.sensors.narrativeNeed.verdict === 'never-stimulated',
     'verdict=' + vInt.sensors.narrativeNeed.verdict);
  ok('  …internal writes are still counted for diagnosis',
     vInt.sensors.narrativeNeed.internalWrites === 1 && vInt.sensors.narrativeNeed.stimulusWrites === 0,
     'internal=' + vInt.sensors.narrativeNeed.internalWrites + ' stimulus=' + vInt.sensors.narrativeNeed.stimulusWrites);
  ok('  …and the ring refuses GREEN on internal writes alone',
     r.diagnosticRing().state !== 'green', 'state=' + r.diagnosticRing().state);

  /* ── COHERENCE INDEX INTEGRITY ──────────────────────────────────────────────────────────────
   * Two properties are asserted, and the pair is the point. The index must be genuinely maintained
   * by the relay (a derived value that never moves is not an integration index at all), AND a
   * direct assignment must trip the integrity guard rather than silently desynchronising it from
   * the manifold. Neither half is worth anything without the other. */
  console.log('\nCOHERENCE INDEX — derived invariant, guarded writes');

  r = new Cls();
  const HP = r.COHERENCE_A;
  r.sensors.tension = 0.8;
  ok('the relay genuinely maintains the index every write',
     r._sensorLedger[HP].writes > 0, 'writes=' + r._sensorLedger[HP].writes);
  ok('  …and it holds a real aggregate, not a constant',
     typeof r.sensors[HP] === 'number' && r.sensors[HP] >= 0 && r.sensors[HP] <= 1,
     'value=' + r.sensors[HP]);

  // Only the relay is an authorised writer; anything else is a desynchronisation.
  r = new Cls();
  const rogueBefore = r.sensors.rogueAi;
  r.sensors[HP] = 1;                                  // an outsider seizing "the brain"
  ok('a direct assignment to the index is a BREACH', r._coherenceBreaches === 1,
     'breaches=' + r._coherenceBreaches);
  ok('  …it raises her rogue-AI receptor', r.sensors.rogueAi > rogueBefore,
     'rogueAi ' + rogueBefore + ' → ' + r.sensors.rogueAi);
  ok('  …and the ring goes RED naming the index',
     r.diagnosticRing().state === 'red' && /integration index/i.test(r.diagnosticRing().reasons.join('|')),
     r.diagnosticRing().state + ' | ' + r.diagnosticRing().reasons.join('|'));

  // The index is DERIVED: desynchronising it must not corrupt the receptors it summarises.
  // If this ever fails, coherence has quietly become load-bearing and the guard above is not enough.
  r = new Cls();
  r.sensors.tension = 0.25;
  const realBefore = { tension: r.sensors.tension, silence: r.sensors.silence };
  r.sensors[HP] = 1;                                  // "take the wheel"
  r.sensors.tension = 0.75;                           // the world keeps feeding her
  ok('overwriting the index does not disturb the receptor manifold',
     r.sensors.tension === 0.75 && r.sensors.silence === realBefore.silence,
     'tension=' + r.sensors.tension + ' silence=' + r.sensors.silence);
  ok('  …and the relay re-derives the index on the next receptor write',
     r.sensors[HP] !== 1, 'index=' + r.sensors[HP]);

  /* Two indices derived from one manifold must agree by construction. Divergence is the signature
   * a targeted write leaves, and it is checked independently of the breach counter so that defeating
   * one does not defeat the other. */
  r = new Cls();
  r.sensors.tension = 0.6;
  ok('both indices are maintained and AGREE by construction',
     r.sensors[r.COHERENCE_A] === r.sensors[r.COHERENCE_B],
     r.sensors[r.COHERENCE_A] + ' vs ' + r.sensors[r.COHERENCE_B]);

  for (const which of ['COHERENCE_A', 'COHERENCE_B']) {
    const t = new Cls();
    t.sensors[t[which]] = 0.123;
    ok('assigning ' + t[which] + ' trips the guard (either twin is equally loud)',
       t._coherenceBreaches === 1 && t.diagnosticRing().state === 'red',
       'breaches=' + t._coherenceBreaches + ' state=' + t.diagnosticRing().state);
  }

  // Divergence must be caught on its own, even with the breach counter zeroed.
  r = new Cls();
  r.sensors.tension = 0.6;
  r._coherenceWrite = true;                 // sneak past the breach counter
  r.sensors[r.COHERENCE_B] = 0.999;    // …but the twins now disagree
  r._coherenceWrite = false;
  ok('a DIVERGENCE between the twins is caught independently of the breach counter',
     r._coherenceBreaches === 0 && r.diagnosticRing().state === 'red' &&
     /diverged/.test(r.diagnosticRing().reasons.join('|')),
     'breaches=' + r._coherenceBreaches + ' state=' + r.diagnosticRing().state +
     ' | ' + r.diagnosticRing().reasons.join('|'));

  /* ── RESERVED FIELD ────────────────────────────────────────────────────────────────────────
   * Two independent records of the same event. The visible handler is one; the journal is the
   * other, and the journal is what the verifier actually reads. An intruder who finds and disables
   * the handler has silenced the announcement, not the record — so the pair is tested separately,
   * including the case where the handler no longer exists at all. */
  console.log('\nRESERVED FIELD — two records, one event');

  r = new Cls();
  r.sensors[r.RESERVED_FIELD] = 0.5;
  ok('assigning the reserved field is journalled', r._manifoldJournal.length === 1,
     'journal=' + r._manifoldJournal.length);
  ok('  …the visible handler also fires', r._echoDesyncs === 1, 'trips=' + r._echoDesyncs);
  ok('  …it raises the rogue-AI receptor', r.sensors.rogueAi > 0, 'rogueAi=' + r.sensors.rogueAi);
  ok('  …and the ring goes RED', r.diagnosticRing().state === 'red', 'state=' + r.diagnosticRing().state);

  // THE POINT: destroy the loud handler and the record must still stand.
  r = new Cls();
  r._echoDesync = () => {};                    // intruder silences the announcement
  r.sensors[r.RESERVED_FIELD] = 0.99;
  ok('with the visible handler DESTROYED, the journal still holds the event',
     r._manifoldJournal.length === 1, 'journal=' + r._manifoldJournal.length);
  ok('  …and the ring is still RED on the journal alone',
     r.diagnosticRing().state === 'red' && /reserved field/.test(r.diagnosticRing().reasons.join('|')),
     r.diagnosticRing().state + ' | ' + r.diagnosticRing().reasons.join('|'));

  /* ── CEREBRAL PULSE ────────────────────────────────────────────────────────────────────────
   * The sweep must prove conduction without manufacturing it. Both halves are asserted: it finds a
   * severed nerve, and it does NOT let its own traffic count as input. */
  console.log('\nCEREBRAL PULSE — liveness without faking it');

  r = new Cls();
  let p1 = r.cerebralPulse();
  ok('a pulse sweeps every receptor', p1.checked === Object.keys(r.sensors).length,
     'checked=' + p1.checked + ' of ' + Object.keys(r.sensors).length);
  ok('  …all nerves report CONDUCTING on a healthy instance', p1.allAlive === true,
     'dead=' + JSON.stringify(p1.dead));
  ok('  …relay-owned fields are verified WITHOUT being written (no self-tripped alarms)',
     p1.readOnly.length === 3 && r._echoDesyncs === undefined && r._coherenceBreaches === 0,
     'readOnly=' + JSON.stringify(p1.readOnly) + ' trips=' + r._echoDesyncs + ' breaches=' + r._coherenceBreaches);
  ok('  …and the pulse does NOT disturb any value',
     r.sensors.tension === 0 && r.sensors.silence === 1,
     'tension=' + r.sensors.tension + ' silence=' + r.sensors.silence);
  ok('  …beats increment', r.cerebralPulse().beat === 2, 'beat=' + r._lastPulse.beat);

  // THE CRITICAL PROPERTY: pulse traffic must not read as stimulus, or the sweep manufactures the
  // liveness it is measuring and every receptor looks permanently fed.
  r = new Cls();
  r.cerebralPulse(); r.cerebralPulse(); r.cerebralPulse();
  const vp = r.verifySensors();
  ok('pulse traffic is NOT counted as stimulus (no manufactured liveness)',
     vp.sensors.tension.stimulusWrites === 0 && vp.sensors.tension.verdict === 'never-stimulated',
     'stimulus=' + vp.sensors.tension.stimulusWrites + ' verdict=' + vp.sensors.tension.verdict);
  ok('  …but pulse writes ARE recorded for diagnosis',
     r._sensorLedger.tension.pulseWrites === 3, 'pulseWrites=' + r._sensorLedger.tension.pulseWrites);
  ok('  …and three pulses do not turn a fresh boot GREEN',
     r.diagnosticRing().state !== 'green', 'state=' + r.diagnosticRing().state);

  // RED ARM: a severed nerve must be found, not glossed over.
  /* A real instance can no longer be sabotaged this way — the accessors are non-configurable and
   * `defineProperty` throws. That refusal is the hardening working, so the detection logic is
   * exercised on a DETACHED object carrying plain values where the accessors should be. */
  const detached = Object.create(Cls.prototype);
  detached._sensorNames  = ['tension'];
  detached._sensorLedger = { tension: { pulseWrites: 0 } };
  detached.sensors       = { tension: 0.5 };          // a plain value: nothing conducts
  detached._post         = () => {};
  const pd = detached.cerebralPulse();
  ok('a receptor whose accessor was replaced reads as NOT CONDUCTING',
     pd.allAlive === false && pd.dead.some(d => /tension/.test(d)), JSON.stringify(pd.dead));
  // …and a live instance carrying that pulse result must go RED rather than shrug it off.
  r = new Cls();
  r._lastPulse = pd;
  ok('  …and the ring goes RED about it',
     r.diagnosticRing().state === 'red' && /cerebral pulse/i.test(r.diagnosticRing().reasons.join('|')),
     r.diagnosticRing().state + ' | ' + r.diagnosticRing().reasons.join('|'));

  // ── YELLOW ARM ───────────────────────────────────────────────────────────────────────────────
  console.log('\nYELLOW ARM — unaccounted-for is not the same as broken');
  r = new Cls();
  ring = r.diagnosticRing();
  ok('a fresh boot with nothing written yet ⇒ YELLOW, not green',
     ring.state === 'yellow', 'state=' + ring.state + ' reasons=' + ring.reasons.join('|'));
  ok('  …green is NOT the default', ring.state !== 'green');

  // ── FAIL-CLOSED ARM: a broken verifier must never read as health. ────────────────────────────
  console.log('\nFAIL-CLOSED ARM');
  /* Sabotage-by-assignment is now refused by the lock (proved above), so the fail-closed path is
   * exercised the way it could still genuinely be reached: an object whose constructor state never
   * existed. `verifySensors` then throws on its own internals, which is exactly the condition the
   * catch is for — a verifier that cannot run must never be mistaken for a clean bill of health. */
  const broken = Object.create(Cls.prototype);
  ring = broken.diagnosticRing();
  ok('a THROWING verifier ⇒ RED (never green, never a crash)', ring.state === 'red', 'state=' + ring.state);
  ok('  …and it says the verifier threw', /threw/.test(ring.reasons.join('|')), ring.reasons.join('|'));

  // The ledger itself must not be swappable — it is the evidence the ring rests on.
  r = new Cls();
  let ledgerLocked = false;
  try { r._sensorLedger = Object.create(null); } catch (e) { ledgerLocked = true; }
  ok('the sensor LEDGER cannot be swapped out (it is the evidence)',
     ledgerLocked || r._sensorLedger.tension !== undefined,
     'ledger.tension=' + (r._sensorLedger && r._sensorLedger.tension));

  /* ── SAVE HEALTH (2026-09-27, the save rebuild) ──────────────────────────────────────────────
   * Her newest receptor, driven through her real message switch the way the engine drives it. Both
   * directions are asserted: a lost part must pull the score down and be named, and a clean save must
   * bring it back up. The karma half is the bug this rebuild fixed — a load re-paid +1 per awake room. */
  console.log('\nSAVE HEALTH — she scores every save and load, and a restored room pays no karma');
  r = new Cls();
  r._onMessage({ data: { type: 'ONIBABA_SAVE_CENSUS', phase: 'load', slot: 'probe',
    parts: { house: 'ok', doors: 'empty', raid: 'error: boom', floorLoot: 'timeout' }, karma: 7 } });
  ok('a load that lost 2 of 4 parts ⇒ saveHealth 0.5', r.sensors.saveHealth === 0.5, 'saveHealth=' + r.sensors.saveHealth);
  ok('  …each lost part is named as an anomaly', !!(r._anomalyStats && r._anomalyStats.save_part_lost && r._anomalyStats.save_part_lost.count === 2),
     JSON.stringify(r._anomalyStats && r._anomalyStats.save_part_lost));
  ok('  …and the census counts as a real stimulus, not her own arithmetic', r._sensorLedger.saveHealth.stimulusWrites >= 1,
     'stimulusWrites=' + r._sensorLedger.saveHealth.stimulusWrites);
  r._onMessage({ data: { type: 'ONIBABA_SAVE_CENSUS', phase: 'refused', parts: {}, reason: 'old-dungeon', slot: 'old' } });
  ok('a refused load (an older dungeon) ⇒ saveHealth 0', r.sensors.saveHealth === 0, 'saveHealth=' + r.sensors.saveHealth);
  r._onMessage({ data: { type: 'ONIBABA_SAVE_CENSUS', phase: 'save', parts: { house: 'ok', doors: 'empty' } } });
  ok('a clean save ⇒ saveHealth 1', r.sensors.saveHealth === 1, 'saveHealth=' + r.sensors.saveHealth);
  const _k0 = r.karma;
  r._onMessage({ data: { type: 'ENGINE_ANOMALY', kind: 'ROOM_ACTIVATED', subsystem: 'CABARET', id: 'CABARET PERMIT', restore: true } });
  ok('a room put back by a load pays NO karma', r.karma === _k0, 'karma ' + _k0 + ' → ' + r.karma);
  r._onMessage({ data: { type: 'ENGINE_ANOMALY', kind: 'ROOM_ACTIVATED', subsystem: 'CABARET', id: 'CABARET PERMIT' } });
  ok('  …and a room woken for real still pays its +1', r.karma === _k0 + 1, 'karma ' + _k0 + ' → ' + r.karma);

  /* ── STAIRS HEALTH (2026-09-28) — Mark: "check with onibaba if she needs a new sensor for what you created". A failed floor change
   * used to reach her once per session as an unlabelled RUN_LEDGER anomaly and move nothing. Both directions asserted. */
  console.log('\nSTAIRS HEALTH — she scores every floor change, and a failed one is named');
  r = new Cls();
  r._onMessage({ data: { type: 'ONIBABA_SAVE_CENSUS', phase: 'stairs', floor: 1, parts: { house: 'ok', doors: 'empty' },
    arrived: { dir: 'ascend', at: 'stairs_down', tile: [61, 70], from: 2, asks: 1 } } });
  ok('a clean climb that arrives beside the stairs down ⇒ stairsHealth 1', r.sensors.stairsHealth === 1, 'stairsHealth=' + r.sensors.stairsHealth);
  r._onMessage({ data: { type: 'ONIBABA_STAIRS', ok: false, dir: 'descend', from: 1, to: 2, code: 'panel-state-timeout', asks: 10 } });
  ok('a floor change that FAILED ⇒ stairsHealth 0', r.sensors.stairsHealth === 0, 'stairsHealth=' + r.sensors.stairsHealth);
  ok('  …and it is named as an anomaly', !!(r._anomalyStats && r._anomalyStats.stairs_failed), JSON.stringify(r._anomalyStats && r._anomalyStats.stairs_failed));
  ok('  …and the stairs count as a real stimulus', !!(r._sensorLedger.stairsHealth && r._sensorLedger.stairsHealth.stimulusWrites >= 1),
     'stimulusWrites=' + (r._sensorLedger.stairsHealth && r._sensorLedger.stairsHealth.stimulusWrites));
  r._onMessage({ data: { type: 'ONIBABA_SAVE_CENSUS', phase: 'stairs', floor: 1, parts: { house: 'ok' },
    arrived: { dir: 'ascend', at: 'spawn', tile: [58, 73], why: 'no floor tile beside the stairs down' } } });
  ok('a climb that had to stand the player at the entrance ⇒ stairsHealth 0.5', r.sensors.stairsHealth === 0.5, 'stairsHealth=' + r.sensors.stairsHealth);

  // ── GREEN IS REACHABLE — otherwise the ring is just a red light. ──────────────────────────────
  console.log('\nGREEN IS REACHABLE — a light that can never go green is also broken');
  r = new Cls();
  // The integration index is skipped deliberately: the relay is its only authorised writer, so a
  // legitimate green path never assigns it. (An earlier version of this test did, and was correctly
  // caught by the integrity guard — the guard fired on its own author, which is what it is for.)
  for (const n of Object.keys(r.sensors)) { if (!r.COHERENCE_PAIR.includes(n) && n !== r.RESERVED_FIELD) r.sensors[n] = 0.5; }
  ring = r.diagnosticRing();
  ok('every sensor written, nothing disagreeing ⇒ GREEN', ring.state === 'green',
     'state=' + ring.state + ' reasons=' + ring.reasons.join('|'));

  console.log('\n═══ RESULT ═══');
  console.log('  passed: ' + PASS + '   failed: ' + FAIL);
  if (redTestOnly) console.log('  (--red-test: the RED arm above is the proof the suite has teeth)');
  if (FAIL > 0) { console.log('  ⛔ FALSIFICATION FAILED'); process.exit(1); }
  console.log('  ✓ every assertion held, and the red arm proved the ring can fail.');
  process.exit(0);
}

main();
