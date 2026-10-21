#!/usr/bin/env node
/*
 * gate-register.js — DOES THE DISABLED-FEATURES REGISTER STILL DESCRIBE THE CODE? AI 2, 2026-09-04.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
 * The register is Mark's single audit surface for everything turned off. On 2026-09-04 one entry
 * was measured FALSE: ":2019 moon HUD — REMOVED FROM VIEW 2026-08-12" describes three divs hidden
 * with `style="display:none"`, and that attribute is gone — removed inside 65b93c2b, a CABARET WALL
 * commit, with no marker and no register update. The entry was correct when written and was
 * falsified from somewhere else three weeks later.
 *
 * ⭐ THE LAW THIS ENFORCES: **a register entry is a claim about code that lives somewhere else, so
 *    any commit can falsify any entry without touching the register.** Two things that must move
 *    together with nothing making them — the same family as a stranded `?v=` cache token.
 *
 * ── AND WHY IT PRINTS ITS OWN DENOMINATOR ──────────────────────────────────────────────────────
 * ⚠⚠ The audit that found the moon entry ALSO produced a false claim: it grepped ONE record format,
 *    found 6, and reported "a census, not a sample". There are 26 records in TWO formats. The author
 *    verified the entries they found and never verified they had found the entries — a true count
 *    over an unstated fraction of the population. So this gate states its coverage on every run:
 *    records seen · declared · inferred · unreachable. A gate that reports a confident number
 *    without its denominator can repeat that failure on someone else's behalf.
 *
 * ── DECLARED vs INFERRED, and why only one of them can fail the build ──────────────────────────
 * DECLARED — the entry carries a `MECHANISM: <symbol or literal>` line. Authoritative: if a declared
 *   mechanism is missing from the source, the gate FAILS. That is the convention going forward.
 * INFERRED — no MECHANISM: line, so the gate guesses from the prose (a `window._flag`, a backticked
 *   symbol). ADVISORY ONLY, never fatal: a guess that fails is the gate's fault, not the code's, and
 *   a gate that cries wolf gets disabled — which would be this file's own disease, self-inflicted.
 *
 * Usage: node scripts/gate-register.js [--verbose]
 * Exit 0 = every DECLARED mechanism present · 1 = a declared mechanism vanished.
 */
const fs = require('fs');
const path = require('path');
// GATE_REGISTER_ROOT lets --selftest point the whole gate at a synthetic tree. It exists ONLY
// so the selftest can prove this gate TRIPS without mutating the live tree other seats are in.
const ROOT = process.env.GATE_REGISTER_ROOT || path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'Origami.RealityEngine.9.html');
const VERBOSE  = process.argv.includes('--verbose');
// --advisory: run every check and PRINT every failure, but exit 0.
// This exists because `npm run smoke` adopts this gate while the MECHANISM: convention
// covers a small fraction of the register — hard-failing the whole build on a 3%-adopted
// convention would get the gate deleted, not the register fixed. It is a FLAG, deliberately,
// and not a `|| true` in package.json: a swallowed exit code in a pipeline is indistinguishable
// from a bug, and this repo has already lost one gate's answer that way. The banner below says
// out loud that the build was not failed, so nobody mistakes silence for a pass.
const ADVISORY = process.argv.includes('--advisory');

const src = fs.readFileSync(ENGINE, 'utf8');
const lines = src.split('\n');

// ── BOTH FORMATS. Missing the second one is the error this gate is built around. ────────────────
const HEAD_A = /⛔\s*(DISABLED|REMOVED)/;                       // "⛔ DISABLED 2026-09-01 (...)"
// ⚠ THIRD FORMAT, found the hard way: the register's own newer entries head with 🚫, not ⛔ — and the
//   first two versions of this gate could not see them. Caught when a MECHANISM: line written INTO a
//   fresh 🚫 entry still reported as 0 declared. That is three formats and three undercounts from one
//   file; the population of a hand-written register is itself a measurement, and mine was wrong twice
//   before this line existed. If a fourth style appears, this gate will undercount again and say
//   nothing — which is exactly why it prints its denominator instead of only its verdict.
const HEAD_C = /^\s*🚫\s+\S.*20\d\d-\d\d-\d\d/;
const HEAD_B = /^\s*•.*(—|-)\s*(DISABLED|REMOVED)\b[^\n]{0,30}?20\d\d-\d\d-\d\d/;
// ⚠ THE QUALIFIER SLOT IS NOT OPTIONAL POLISH — IT IS THE DIFFERENCE BETWEEN A CENSUS AND A SAMPLE.
//   The first version demanded the date IMMEDIATELY after DISABLED, so "— DISABLED BY DEFAULT
//   2026-07-15" and "— REMOVED PERMANENTLY, 2026-07-04" were not records at all: this gate
//   undercounted its own population exactly the way the hand audit it replaces did. A gate whose
//   denominator is wrong reports a confident number over an unknown fraction — the disease, caught
//   in the cure.

const isHead = (l) => HEAD_A.test(l) || HEAD_B.test(l) || HEAD_C.test(l);
const entries = [];
for (let i = 0; i < lines.length; i++) {
  if (!isHead(lines[i])) continue;
  // ⚠ BOUND THE BODY AT THE NEXT ENTRY, never at a fixed line count. A fixed 16-line window bled
  //   into the following record and made two different entries infer the SAME flag — the gate
  //   inventing evidence from its neighbour. An advisory sourced from the wrong entry is exactly
  //   the false alarm that gets a gate switched off.
  let end = i + 1;
  while (end < lines.length && end < i + 16 && !isHead(lines[end])) end++;
  const body = lines.slice(i, end).join('\n');
  // ⚠ STRADDLE. Bodies are capped at 16 lines, so a MECHANISM: written on the LAST line of the window
  //   leaves its EXPECT: on line 17 — outside the body, unreadable, and findExpect() then returns the
  //   'present' DEFAULT. That is a SILENT MISCONFIGURATION: the entry looks declared, reads as the wrong
  //   polarity, and nothing says so. MEASURED 2026-09-04 while converting the advisory list — a REMOVAL
  //   entry silently became EXPECT: present and failed as "stale" for a symbol that was correctly gone.
  //   Fixed by reading two lines PAST the window for the EXPECT only, and then SAYING SO (see straddles
  //   below) rather than repairing it quietly — a gate that silently patches its own input is a gate
  //   whose output nobody can re-derive.
  const tail = lines.slice(end, end + 2).join('\n');
  entries.push({ line: i + 1, head: lines[i].trim().slice(0, 96), body, tail });
}

const findDeclared = (body) => {
  const m = body.match(/MECHANISM:\s*(.+)/);
  return m ? m[1].trim().replace(/\s*[-—]{2,}.*$/, '').trim() : null;
};
// ── POLARITY. A DECLARED mechanism has TWO honest states, and the first version of this gate only
//   knew one of them, so it failed on the first correct entry anybody wrote.
//
//   EXPECT: present  (the default)  — the feature is DISABLED but still reachable, and the named
//     symbol is its off-switch. If the symbol vanishes, the register is lying about a switch you
//     could go flip.
//   EXPECT: absent                  — the feature was REMOVED, so the symbol is SUPPOSED to be gone.
//     Absence is the proof, not the defect. If it comes BACK, that is a resurrection nobody
//     registered, and the register is lying in the other direction.
//
//   ⚠ MEASURED 2026-09-04: this gate reported ⛔ REGISTER IS STALE against `MECHANISM: oni-moon-sym`
//   — an entry recording a REMOVAL, whose symbol was correctly deleted in the same commit. The entry
//   was right and the gate was wrong. Absence-is-failure is only true for the gated class; asserted
//   over the removed class it punishes the exact discipline it is meant to enforce. Both directions
//   now fail, which makes this gate strictly stronger than the version that only checked one.
const findExpect = (body, tail) => {
  let m = body.match(/EXPECT:\s*(present|absent)\b/i);
  if (m) return { want: m[1].toLowerCase(), straddled: false };
  m = (tail || '').match(/EXPECT:\s*(present|absent)\b/i);
  if (m) return { want: m[1].toLowerCase(), straddled: true };
  return { want: 'present', straddled: false };
};
// Inference, deliberately conservative: a window flag first, then a backticked symbol.
const findInferred = (body) => {
  const w = body.match(/window\.(_[A-Za-z0-9_]+)/);
  if (w) return 'window.' + w[1];
  const b = body.match(/`(_[A-Za-z0-9_]+)`/);
  if (b) return b[1];
  return null;
};
// ⚠ SEARCH THE WHOLE TREE, NOT JUST ENGINE9. Register entries routinely name mechanisms that live
//   in modules — QuickLaunchGuide.js's `window._quickLaunchOn`, PlayerGuide.js's `window._quickGuide`
//   — and an Engine9-only search reported both as VANISHED when they were simply somewhere else.
//   That is "absent from my search" being reported as "absent from the code": the same error as
//   claiming a feature is missing after grepping one file of a multi-file system.
const HAYSTACKS = [ENGINE, path.join(ROOT, 'Origami.RealityEngine.Panels.html'), path.join(ROOT, 'OrigamiUnderworld.html')];
(function collectModules(dir){
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const d of ents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') collectModules(full); }
    else if (/\.(js|mjs)$/.test(d.name)) HAYSTACKS.push(full);
  }
})(path.join(ROOT, 'js'));

const present = (needle) => {
  if (!needle) return null;
  let n = 0;
  for (const f of HAYSTACKS) {
    let body; try { body = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    // In Engine9 only, skip the register block itself: an entry naming its own mechanism must not
    // be allowed to vouch for it. The whole claim is that the code ELSEWHERE still carries it.
    const from = (f === ENGINE) ? (body.split('\n').slice(0, 5000).join('\n').length) : 0;
    let idx = from;
    while ((idx = body.indexOf(needle, idx)) !== -1) { n++; idx += needle.length; }
  }
  return n;
};

let declared = 0, inferred = 0, unreachable = 0, fails = [], advisories = [], straddles = [];
for (const e of entries) {
  const d = findDeclared(e.body);
  if (d) {
    declared++;
    const { want, straddled } = findExpect(e.body, e.tail);
    if (straddled) straddles.push({ e, mech: d, want });
    const n = present(d);
    const ok = (want === 'absent') ? (n === 0) : (n > 0);
    if (!ok) fails.push({ e, mech: d, want, found: n });
    else if (VERBOSE) console.log(`  ok   [declared/${want}] :${e.line} ${d} ×${n}`);
    continue;
  }
  const g = findInferred(e.body);
  if (g) {
    inferred++;
    const n = present(g);
    if (!n) advisories.push({ e, mech: g });
    else if (VERBOSE) console.log(`  ok   [inferred] :${e.line} ${g} ×${n}`);
  } else {
    unreachable++;
    if (VERBOSE) console.log(`  ---  [no mechanism nameable] :${e.line} ${e.head}`);
  }
}

console.log('\n🚫 DISABLED-FEATURES REGISTER — MECHANISM AUDIT');
console.log('  records seen        : ' + entries.length + '   (three header styles: ⛔ · • bullet · 🚫)');
console.log('  DECLARED (MECHANISM:): ' + declared + '   ← authoritative, can fail this gate');
console.log('  INFERRED (guessed)   : ' + inferred + '   ← advisory only, never fails the build');
console.log('  no mechanism nameable: ' + unreachable + '   ← invisible to this gate, and that is the honest number');
console.log('  COVERAGE            : ' + declared + '/' + entries.length + ' enforceable'
  + (declared === 0 ? '  — the MECHANISM: convention is not adopted yet, so this gate can currently fail on NOTHING' : ''));

if (advisories.length) {
  console.log('\n⚠ ADVISORY — an INFERRED mechanism is not found in the source. This is a candidate stale');
  console.log('  entry OR a bad guess by this gate. Verify by hand, then add a MECHANISM: line either way:');
  for (const a of advisories) console.log(`  · :${a.e.line}  guessed "${a.mech}"\n      ${a.e.head}`);
}
if (straddles.length) {
  console.log('\n⚠ PLACEMENT — an EXPECT: line sits OUTSIDE its entry\'s 16-line body window:');
  for (const st of straddles) console.log(`  · :${st.e.line}  MECHANISM: ${st.mech}  (EXPECT: ${st.want} read from the line after the window)`);
  console.log('  It was honoured, but move the MECHANISM:/EXPECT: pair UP so both lines sit inside the');
  console.log('  entry. Left where it is, a later edit that shifts one line reverts the entry to the');
  console.log('  \'present\' default with nothing printed — which is how a removal entry reads as stale.');
}

const vanished = fails.filter(f => f.want === 'present');
const revived  = fails.filter(f => f.want === 'absent');

if (vanished.length) {
  console.log('\n⛔ REGISTER IS STALE — a mechanism declared EXPECT: present has vanished from the source:');
  for (const f of vanished) console.log(`  · :${f.e.line}  MECHANISM: ${f.mech}  (found ×0)\n      ${f.e.head}`);
  console.log('\n  WHAT THIS MEANS, both halves:');
  console.log('  1. THE ENTRY is now false. The register is Mark\'s audit surface for what is off —');
  console.log('     a false entry is worse than no entry, because it is the place he looks to be sure.');
  console.log('  2. SOME OTHER COMMIT deleted the mechanism without touching the register. This is a');
  console.log('     two-things-must-move-together violation, the same family as a stranded ?v= token:');
  console.log('     an entry is a claim about code living elsewhere, so any commit can falsify it.');
  console.log('  FIX: re-verify the feature, then either restore the mechanism or supersede the entry');
  console.log('  with a ⛔ SUPERSEDED marker and the date. Do not just edit the MECHANISM: line to match.');
  console.log('  If the feature was REMOVED rather than gated, the entry wants `EXPECT: absent` — say so');
  console.log('  explicitly instead of deleting the MECHANISM: line, which would only blind the gate.');
}
if (revived.length) {
  console.log('\n⛔ UNREGISTERED RESURRECTION — a mechanism declared EXPECT: absent is BACK in the source:');
  for (const f of revived) console.log(`  · :${f.e.line}  MECHANISM: ${f.mech}  (found ×${f.found})\n      ${f.e.head}`);
  console.log('\n  The register says this feature was REMOVED. The code says it is here. One of them is');
  console.log('  wrong, and the register is the one Mark reads. This is the direction the first version');
  console.log('  of this gate could not see at all: a feature can come back by revert, by cherry-pick, or');
  console.log('  by a seat re-adding it from an old slide without ever finding the entry that retired it.');
  console.log('  FIX: if the return was intended, supersede the entry (⛔ SUPERSEDED <date>) — do not just');
  console.log('  flip EXPECT. If it was not, the code is the accident: remove it again.');
}

const failed = fails.length > 0;
console.log(failed ? '\n✗ FAIL' : '\n✓ PASS (every declared mechanism matches its EXPECT)');
if (failed && ADVISORY) {
  console.log('\n⚠ --advisory: the build was NOT failed by the ' + fails.length + ' failure(s) above.');
  console.log('  This gate runs inside `npm run smoke` in advisory mode while MECHANISM: coverage is '
    + declared + '/' + entries.length + '. Everything printed above is real and unreviewed.');
  console.log('  Run `npm run gate:register` to get the real exit code.');
}
process.exit(failed && !ADVISORY ? 1 : 0);
