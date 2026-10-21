#!/usr/bin/env node
/**
 * Records the rule-claiming comments that CANNOT carry a [REF#…] tag into
 * knowledge/dictionary/unstampable-sites.json, so the authority gate can reach green.
 *
 * WHY THIS EXISTS. The stamper refuses four kinds of site because appending after the `//` would
 * edit CODE, not a comment: a `/` that could open a regex, a backtick/template literal, a `*​/`
 * closing mid-line. Those refusals are correct. But the stamper only records sites it TRIED to
 * stamp, so claims it never had a dictionary entry for stayed invisible — the gate saw them,
 * nothing waived them, and the gate could never go green. A gate that can never go green gets
 * dropped from smoke, which is exactly how this system rotted between 2026-08-27 and 2026-09-01.
 *
 * ⚠ A WAIVER IS NOT A HIDING PLACE. Sites are keyed by a hash of the COMMENT TEXT, so editing a
 *   waived comment un-waives it and the gate fails. A waiver says "this site cannot be tagged",
 *   never "stop reading this content".
 * ⚠ IT ONLY EVER WAIVES WHAT IS PROVABLY UNTAGGABLE. A claim that COULD take a tag is reported as
 *   real work and left failing — run the scanner + stamper for those.
 *
 *   node scripts/comment-dict-waive.js            → dry run, reports what it would waive
 *   node scripts/comment-dict-waive.js --apply    → writes unstampable-sites.json
 */
const fs = require('fs'), crypto = require('crypto'), { execFileSync } = require('child_process');
const OUT = 'knowledge/dictionary/unstampable-sites.json';
const APPLY = process.argv.includes('--apply');

const found = JSON.parse(execFileSync('node', ['scripts/gate-comment-authority.js', '--json'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const hazardOf = (line) => {
  const i = line.indexOf('//');
  const before = i >= 0 ? line.slice(0, i) : line;
  if (i < 0)                    return 'no // on the line';
  if (/`/.test(before))         return 'backtick before the // (template literal)';
  if (/\/(?![/*])/.test(before)) return 'a / before the // could open a regex';
  if (/\*\//.test(before))      return 'comment closes mid-line, code follows';
  return null;
};

const cache = new Map();
const lineAt = (f, n) => {
  if (!cache.has(f)) cache.set(f, fs.readFileSync(f, 'utf8').split('\n'));
  return cache.get(f)[n - 1] || '';
};

const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const sites = Array.isArray(existing) ? existing : (existing.sites || existing.entries || []);
const norm = t => String(t).replace(/^\s*(\/\/|\/\*+|\*+|<!--)\s?/, '').replace(/\s+/g, ' ').trim();
const key = (f, t) => f + '|' + crypto.createHash('sha1').update(norm(t)).digest('hex').slice(0, 16);
const have = new Set(sites.map(s => key(s.file, s.text)));

const added = [], taggable = [];
for (const v of found.violations) {
  const line = lineAt(v.f, v.line);
  const why = hazardOf(line);
  if (!why) { taggable.push(v); continue; }
  const k = key(v.f, line);
  if (have.has(k)) continue;
  have.add(k);
  added.push({ file: v.f, line: v.line, reason: why, text: line.trim() });
}

console.log(`── UNTAGGABLE-SITE WAIVER ${'─'.repeat(44)}`);
console.log(`  gate violations      : ${found.violations.length}`);
console.log(`  provably untaggable  : ${added.length}  (would be waived, keyed by text)`);
console.log(`  TAGGABLE — real work : ${taggable.length}  (run the scanner + stamper; NOT waived)`);
taggable.slice(0, 10).forEach(v => console.log(`      ${v.f}:${v.line}  ${v.text.slice(0, 90)}`));
if (APPLY && added.length) {
  const next = Array.isArray(existing) ? sites.concat(added)
             : Object.assign({}, existing, { sites: sites.concat(added) });
  fs.writeFileSync(OUT, JSON.stringify(next, null, 1) + '\n');
  console.log(`  wrote ${OUT} (+${added.length})`);
} else if (!APPLY) console.log('  dry run — pass --apply to write');
console.log('─'.repeat(70));
process.exit(taggable.length ? 1 : 0);
