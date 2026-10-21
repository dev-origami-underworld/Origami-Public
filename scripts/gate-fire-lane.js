#!/usr/bin/env node
// gate-fire-lane.js — measures the master plan's §16 rule 6 30-line cap
// (plans/MASTER_SYSTEM_PLAN_2026-09-17.md §16/§20, "30-line cap is theatre" -> TRUE, this is the fix).
// For every commit whose subject starts with `FIRE:`, sums the ADDED lines outside scripts/probe-*,
// plans/, knowledge/ and SEAT_PIPELINE.md and fails the commit if that sum exceeds 30.
//
//   node scripts/gate-fire-lane.js [<rev-range>]              grade every FIRE: commit in range (default FIRE_LANE_BASE..HEAD)
//   node scripts/gate-fire-lane.js --numstat-fixture <file>   grade one numstat text file instead of git
//   node scripts/gate-fire-lane.js --red-test                 prove the grader can fail (fixtures: 31 lines FAIL, 30 PASS)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = process.cwd();
const CAP = 30;
const FIRE_LANE_BASE = 'fd25b07c';   // this gate's own landing — a fixed base, not a sliding HEAD~20 window that loses old fires
const EXCLUDE = [/^scripts\/probe-/, /^plans\//, /^knowledge\//, /^SEAT_PIPELINE\.md$/];

function grade(numstatText) {
  let added = 0, nan = false; const files = [];
  for (const line of numstatText.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const filePath = parts.slice(2).join('\t');
    if (EXCLUDE.some(re => re.test(filePath))) continue;
    const n = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
    if (!Number.isFinite(n)) { nan = true; console.error('NaN numstat line (treated as FAIL): ' + line); continue; }
    added += n;
    files.push(filePath);
  }
  return { added, files, pass: !nan && added <= CAP };
}

function verdictLine(label, g) {
  return label + ' · added ' + g.added + '/' + CAP + ' · files: '
    + (g.files.join(', ') || '(none outside the exempt paths)') + ' — ' + (g.pass ? 'PASS' : 'FAIL');
}

function runFixture(file, expectPass) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const g = grade(text);
  const ok = g.pass === expectPass;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + file + ': added ' + g.added + '/' + CAP + ' → '
    + (g.pass ? 'PASS' : 'FAIL') + ' (expected ' + (expectPass ? 'PASS' : 'FAIL') + ')');
  return ok;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--red-test')) {
    const a = runFixture('scripts/fixtures/fire-lane-31.numstat', false);
    const b = runFixture('scripts/fixtures/fire-lane-30.numstat', true);
    let c = false; try {   // exercises the GIT path too — fixtures alone never touch git log/diff parsing
      const log = cp.execFileSync('git', ['log', '--format=%H%x09%s', '--reverse', '5c878ca2~1..5c878ca2'], { cwd: ROOT, encoding: 'utf8' });
      const found = log.split('\n').filter(Boolean).map(l => l.split('\t')).find(([, s]) => /^FIRE:/.test(s));
      const g = found && grade(cp.execFileSync('git', ['diff', '--numstat', found[0] + '~1', found[0]], { cwd: ROOT, encoding: 'utf8' }));
      c = !!found && g.added === 22;
      console.log('  ' + (c ? '✅' : '❌') + ' git path 5c878ca2~1..5c878ca2: ' + (found ? found[0].slice(0, 8) + ' added=' + g.added : 'NOT FOUND') + ' (expected 5c878ca2 added=22)');
    } catch (e) { console.log('  ❌ git-path red-test threw: ' + e.message); }
    if (a && b && c) { console.log('red-test OK'); process.exit(0); }
    console.log('red-test FAILED — the grader cannot be trusted to go red'); process.exit(1);
  }

  const fxIdx = args.indexOf('--numstat-fixture');
  if (fxIdx !== -1) {
    const file = args[fxIdx + 1];
    if (!file) { console.error('--numstat-fixture needs a file path'); process.exit(1); }
    const g = grade(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    console.log(verdictLine(file, g));
    process.exit(g.pass ? 0 : 1);
  }

  const range = args.find(a => !a.startsWith('--')) || (FIRE_LANE_BASE + '..HEAD');
  let log;
  try {
    log = cp.execFileSync('git', ['log', '--format=%H%x09%s', '--reverse', range], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    console.error('git log failed on range ' + range + ': ' + e.message);
    process.exit(1);
  }
  const fires = log.split('\n').filter(Boolean)
    .map(l => { const [sha, ...rest] = l.split('\t'); return { sha, subject: rest.join('\t') }; })
    .filter(c => /^FIRE:/.test(c.subject));

  if (fires.length === 0) { console.log('no FIRE commits in range'); process.exit(0); }

  let anyFail = false;
  for (const c of fires) {
    let numstat;
    try {
      numstat = cp.execFileSync('git', ['diff', '--numstat', c.sha + '~1', c.sha], { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      console.error(c.sha + ': git diff failed: ' + e.message);
      anyFail = true; continue;
    }
    const g = grade(numstat);
    console.log(verdictLine(c.sha.slice(0, 8), g));
    if (!g.pass) anyFail = true;
  }
  process.exit(anyFail ? 1 : 0);
}

main();
