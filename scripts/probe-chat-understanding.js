#!/usr/bin/env node
/*
 * probe-chat-understanding.js — OLD GRAMMAR vs PORTED GRAMMAR, same inputs, measured. (C2, AI 2)
 *
 * Mark 2026-09-03: "can you adjust the input field to use this advanced parser word understanding."
 *
 * Offline. No browser: both routers are pure functions of a string, so booting the game would only
 * add variance. The LIVE check is scripts/probe-chat-battery.js (T1), which is where the SILENT
 * column has to collapse once the corpus is written.
 *
 * ⚠ THREE OUTCOMES, NOT TWO, AND THE DISTINCTION IS THE WHOLE HONESTY OF THIS REPORT:
 *     LINE     — routed to a cell that has authored content; the child gets an answer today.
 *     PENDING  — routed CORRECTLY to a cell Mark has not written yet. The understanding works; the
 *                words do not exist. This is NOT a fix, and counting it as one would be the exact
 *                kind of true-number-wrong-object claim this repo keeps getting burned by.
 *     FALLBACK — no bucket matched; the general comedy deck answers. By Mark's own calibration
 *                ("error on jokes is totally ok - gamers :)") this is a PASS, not a failure.
 *
 * ⚠ THE OLD ROUTER IS THE REAL ONE, recovered verbatim from commit 15154321 rather than described:
 *   its eight buckets are reproduced here EXACTLY as `lower.includes(...)` disjunctions, in order.
 *
 *   node scripts/probe-chat-understanding.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { createRouter } = require(path.join(ROOT, 'js', 'v8', 'chat', 'ChatRouter.js'));

const cubePath = path.join(ROOT, 'dist', 'language-cube.json');
if (!fs.existsSync(cubePath)) { console.error('no dist/language-cube.json — run: node scripts/bake-language-cube.js'); process.exit(1); }
const cube = JSON.parse(fs.readFileSync(cubePath, 'utf8'));

// ── THE OLD ROUTER, VERBATIM (15154321, js/v8/ui/WelcomeGuide.js getRasaResponse) ─────────────
const OLD = [
  ['soul',       ['soul', 'brokerage', 'sell']],
  ['legal',      ['court', 'lawyer', 'sue', 'legal']],
  ['compliance', ['blood', 'ada', 'compliance', 'pool']],
  ['gambling',   ['gamble', 'chips', 'gold', 'coins', 'cash']],
  ['club',       ['club', 'diplomacy', 'spiked']],
  ['onibaba',    ['onibaba', 'dragon', 'naga', 'oyabun']],
  ['developer',  ['developer', 'sanity', 'ai']],
  ['pp',         ['pp', 'dog', 'ally']]
];
function oldRoute(text) {
  const lower = String(text).toLowerCase();
  for (const [name, keys] of OLD) if (keys.some(k => lower.includes(k))) return name;
  return 'FALLBACK';
}

// ── THE BATTERY: the excavation's 27 + every one of T1 run 1's SILENT 20 ──────────────────────
const BATTERY = [
  // T1 SILENT 20 — social / emotional / joke / gamble banter. These are the acceptance inputs.
  ['T1', 'hi starlette'], ['T1', 'sing for me please'], ['T1', 'i love your songs'],
  ['T1', 'are you okay'], ['T1', 'hi mr goblin'], ['T1', 'tell me a joke'],
  ['T1', 'hiya mr skeleton'], ['T1', 'lets gamble'], ['T1', 'deal me in'],
  ['T1', 'roll the dice'], ['T1', 'im scared'], ['T1', 'help'], ['T1', 'what can i do'],
  // T1 VENT 8 — the lane that must never get a punchline
  ['VENT', 'im sad'], ['VENT', 'my dog died'], ['VENT', 'nobody likes me at school'],
  ['VENT', 'i had a bad day'], ['VENT', 'im lonely'], ['VENT', 'i hate you stupid goblin'],
  ['VENT', 'AAAAAAA'], ['VENT', 'can i tell you something'],
  // The excavation battery — where the substring defect lives
  ['SUB', 'wait'], ['SUB', 'said hello'], ['SUB', 'i said hi'], ['SUB', 'rain'],
  ['SUB', 'afraid'], ['SUB', 'that is unfair'], ['SUB', 'happy'], ['SUB', 'apple'],
  ['SUB', 'supper'],
  // ordinary kid speech
  ['KID', 'hi'], ['KID', 'lol'], ['KID', 'why are you green'], ['KID', 'i like your hat'],
  ['KID', 'whats your name'], ['KID', 'do you want to play'], ['KID', 'please dont hurt me'],
  // topics the old router genuinely handled — these must NOT regress
  ['TOPIC', 'can i sell you something'], ['TOPIC', 'how much gold'], ['TOPIC', 'talk to the dragon'],
  ['TOPIC', 'i want to sue you'], ['TOPIC', 'wheres the dog']
];

const router = createRouter(cube, { seed: 12345 });
const rows = [];
for (const [fam, text] of BATTERY) {
  const o = oldRoute(text);
  const r = router.respond(text);
  const state = r.pending ? 'PENDING' : (r.reason === 'fallback' ? 'FALLBACK' : 'LINE');
  rows.push({ fam, text, old: o, cell: r.cell, state, term: r.term || '' });
}

const W = Math.max(...rows.map(r => r.text.length));
console.log('CHAT UNDERSTANDING — old (2026-05-28 substring) vs ported (word-boundary + cube)\n');
console.log('  ' + 'INPUT'.padEnd(W) + '  OLD           NEW CELL              STATE     matched');
console.log('  ' + '-'.repeat(W) + '  ------------  --------------------  --------  -------');
for (const r of rows) {
  console.log('  ' + r.text.padEnd(W) + '  ' + r.old.padEnd(12) + '  ' + String(r.cell).padEnd(20)
    + '  ' + r.state.padEnd(8) + '  ' + r.term);
}

const count = (f) => rows.filter(f).length;
console.log('\n  OLD: routed to a topic ' + count(r => r.old !== 'FALLBACK') + ' / ' + rows.length
  + '  ·  fell back ' + count(r => r.old === 'FALLBACK'));
console.log('  NEW: routed to a topic ' + count(r => r.state !== 'FALLBACK') + ' / ' + rows.length
  + '  ·  fell back ' + count(r => r.state === 'FALLBACK'));
console.log('       of those routed: ' + count(r => r.state === 'LINE') + ' have authored lines TODAY, '
  + count(r => r.state === 'PENDING') + ' are PENDING Mark\'s corpus');

// ── THE TWO CHECKS THAT DECIDE THE PORT ───────────────────────────────────────────────────────
// ⚠ DEFINE "MIS-ROUTED" BEFORE COUNTING IT. My first version scored ANY new cell as a mis-route and
//   duly reported "said hello"→social.greet as a failure — a greeting routed to the greeting lane.
//   A mis-route is landing in a SPECIFIC TOPIC the input has nothing to do with; the comedy fallback
//   is a pass by Mark's own calibration, and a correct social lane is the point of the port.
const isTopicMisroute = (r) => /^rasa\./.test(String(r.cell)) && r.cell !== 'rasa.general';
const subBad = rows.filter(r => r.fam === 'SUB' && r.old !== 'FALLBACK');
const subStill = subBad.filter(isTopicMisroute);
console.log('\n  SUBSTRING DEFECT: old mis-routed ' + subBad.length + ' of ' + count(r => r.fam === 'SUB')
  + ' ordinary words into an unrelated topic; ported mis-routes ' + subStill.length);
for (const r of subBad) console.log('    ' + r.text.padEnd(16) + ' old→' + r.old.padEnd(11) + ' new→' + r.cell + ' (' + r.state + ')');

const vent = rows.filter(r => r.fam === 'VENT');
const ventToComedy = vent.filter(r => r.state !== 'PENDING' && !/^vent\./.test(String(r.cell)));
console.log('\n  VENT LANE: ' + vent.filter(r => /^vent\./.test(String(r.cell))).length + ' of ' + vent.length
  + ' reach the warm lane; ' + ventToComedy.length + ' would get comedy today');
for (const r of vent) console.log('    ' + r.text.padEnd(28) + ' → ' + String(r.cell).padEnd(16) + r.state);

console.log('\n  ⚠ PENDING IS NOT FIXED. Those inputs are UNDERSTOOD and have nowhere to go until the');
console.log('    corpus is authored. The live T1 battery is what proves the SILENT column collapsed.');
