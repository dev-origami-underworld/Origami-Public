#!/usr/bin/env node
/* comment-dict-dedupe.js — READ-ONLY. Second pass over the scan.
 * Mark's order 2026-08-27: "all redundant comments will go to the same original comment removing
 * all this clutter." Groups duplicate/near-duplicate comments, elects ONE canonical (the original),
 * and marks every other copy as a pointer to that REF#. Writes nothing into source.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
const DICT = path.join(ROOT, 'knowledge/dictionary/comment-dictionary.json');
const data = JSON.parse(fs.readFileSync(DICT, 'utf8'));

// Normalise so cosmetic differences collapse but MEANING does not:
//  - dates, line refs, counts and flag values vary between copies of the same rule
//  - case and whitespace are noise
const norm = s => s
  .replace(/\d{4}-\d{2}-\d{2}/g, '<DATE>')
  .replace(/[~:]?\d{3,6}\b/g, '<LINE>')
  .replace(/\b\d+(\.\d+)?\b/g, '<N>')
  .replace(/[^\p{L}\p{N}<>]+/gu, ' ')
  .trim().toLowerCase();

// Zone scan order is Mark's priority order; within a file, earliest line = the original.
// ⚠ 2026-08-28 (AI 2): this list held only the SEVEN zones the first scan knew about. When the scan
// widened to all twelve js/v8 directories, `indexOf` returned -1 for every new zone — and -1 sorts
// FIRST, which would have elected a freshly-scanned ENTITIES/AUDIO/CORE comment as the "original"
// over the Engine9 one that has been canonical all along. The stamper is idempotent, so the already
// stamped pointers would NOT have been rewritten: the dictionary and the source would have disagreed
// about which comment is the original, silently, forever. New zones are APPENDED so every existing
// election is preserved byte-for-byte, and an unknown zone now sorts LAST instead of first.
const ZONE_ORDER = ['MAIN-GAME','ENGINE','PANELS','DUNGEON','UI','VISUALS','GAMEPLAY',
                    'ENTITIES','COMBAT','AI','AUDIO','CORE','DATA','A11Y','INTERACT'];
const zrank = z => { const i = ZONE_ORDER.indexOf(z); return i < 0 ? ZONE_ORDER.length : i; };
const rank = e => [zrank(e.zone), e.file, e.line];

const groups = new Map();
for (const e of data.entries) {
  const k = norm(e.text);
  if (k.length < 12) continue;                       // too short to dedupe meaningfully
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

let dupTotal = 0, dupLines = 0, groupsWithDups = 0;
const dupReport = [];
for (const [k, list] of groups) {
  if (list.length < 2) continue;
  groupsWithDups++;
  list.sort((a,b) => { const ra=rank(a), rb=rank(b);
    return ra[0]-rb[0] || String(ra[1]).localeCompare(String(rb[1])) || ra[2]-rb[2]; });
  const canon = list[0];
  canon.canonical = true;
  canon.duplicateOf = null;
  canon.copies = list.length - 1;
  for (const d of list.slice(1)) {
    d.canonical = false;
    d.duplicateOf = canon.ref;                        // ← the pointer Mark asked for
    dupTotal++; dupLines += d.lines;
  }
  dupReport.push({ canon: canon.ref, canonFile: canon.file, canonLine: canon.line,
                   copies: list.length - 1, cls: canon.cls,
                   linesReclaimable: list.slice(1).reduce((s,d)=>s+d.lines,0),
                   sample: canon.text.slice(0, 150).replace(/\s+/g,' '),
                   at: list.slice(1).map(d => `${d.file}:${d.line}`) });
}
for (const e of data.entries) if (e.canonical === undefined) { e.canonical = true; e.duplicateOf = null; e.copies = 0; }

dupReport.sort((a,b) => b.linesReclaimable - a.linesReclaimable);
data.dedupe = { groupsWithDups, duplicateComments: dupTotal, duplicateLines: dupLines };
fs.writeFileSync(DICT, JSON.stringify(data, null, 1));
fs.writeFileSync(path.join(ROOT,'knowledge/dictionary/duplicates.json'), JSON.stringify(dupReport, null, 1));

console.log('DEDUPE — redundant comments collapse to their original');
console.log('  duplicate groups        : ' + groupsWithDups);
console.log('  redundant comments      : ' + dupTotal);
console.log('  redundant comment LINES : ' + dupLines + '   (clutter removable by pointer)');
console.log('\n  WORST OFFENDERS (most lines reclaimable):');
for (const g of dupReport.slice(0, 12))
  console.log(`    ${g.canon}  x${String(g.copies).padStart(3)} copies  ${String(g.linesReclaimable).padStart(4)} lines  [${g.cls}]  ${g.sample.slice(0,72)}`);
console.log('\n  wrote knowledge/dictionary/duplicates.json');
