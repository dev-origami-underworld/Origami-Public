#!/usr/bin/env node
/* Reports how well the repo follows CLAUDE.md's "MARK'S NEWEST ORDER OVERRULES EVERY OLDER ONE".
 * A REPORT, not a failing gate: ~3,000 pre-existing citations are unmarked and failing the build on
 * them would just get the check disabled. It exits non-zero ONLY for rule 3 — an UNDATED Mark quote,
 * which can never be aged and so becomes permanent law by accident. Run: npm run report:orders     */
const fs = require('fs');
const FILES = ['Origami.RealityEngine.9.html', 'Origami.RealityEngine.Panels.html', 'OrigamiUnderworld.html'];
const DATED   = /Mark,?\s+20\d\d-\d\d-\d\d/g;
const SUPER   = /⛔ SUPERSEDED\s+20\d\d-\d\d-\d\d/g;
// A Mark QUOTE on a comment line that carries NO date anywhere on it. The date is written both
// before ("RESTORED 2026-08-31 on Mark's ask") and after ("Mark 2026-08-31:"), so anchoring the
// date to one side of the name produced hundreds of false positives — a report that cries wolf is
// a report that gets ignored, which is the very failure this file exists to prevent.
const ANYDATE = /20\d\d-\d\d-\d\d/;
const MARKQUOTE = /Mark(?:'s)?\b[^\n]{0,60}?["“]/;
let totalDated = 0, totalSuper = 0, undated = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const d = ln.match(DATED); if (d) totalDated += d.length;
    const s = ln.match(SUPER); if (s) totalSuper += s.length;
    if (!/^\s*(\/\/|\*|<!--|\/\*)/.test(ln)) return;          // comments only
    if (ANYDATE.test(ln)) return;                             // dated somewhere on the line — fine
    if (MARKQUOTE.test(ln)) undated.push(`${f}:${i + 1}  ${ln.trim().slice(0, 110)}`);
  });
}
const oldest = {};
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/Mark,?\s+(20\d\d-\d\d-\d\d)/g))
    oldest[m[1]] = (oldest[m[1]] || 0) + 1;
}
const byDate = Object.entries(oldest).sort((a, b) => a[0].localeCompare(b[0]));
console.log('── ORDER SUPERSESSION REPORT ' + '─'.repeat(46));
console.log(`  dated Mark orders cited as law : ${totalDated}`);
console.log(`  explicitly retired (⛔ SUPERSEDED): ${totalSuper}`);
console.log(`  unmarked (age = staleness, not authority): ${totalDated - totalSuper}`);
console.log(`  UNDATED Mark quotes (rule 3 — cannot be aged): ${undated.length}`);
if (byDate.length) console.log(`  oldest orders still cited: ` +
  byDate.slice(0, 5).map(([d, n]) => `${d}(${n})`).join(' · '));
if (undated.length) {
  console.log('\n  ⚠ UNDATED — date these or they become permanent law by accident:');
  undated.slice(0, 25).forEach(l => console.log('    ' + l));
  if (undated.length > 25) console.log(`    … and ${undated.length - 25} more`);
}
console.log('─'.repeat(74));
process.exit(undated.length > 0 ? 1 : 0);
