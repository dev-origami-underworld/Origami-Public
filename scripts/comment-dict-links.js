#!/usr/bin/env node
/**
 * Turns the comment dictionary into a KNOWLEDGE BASE — harvests every deep-doc citation out of the
 * comments and indexes it both ways: doc -> the REF#s that cite it, and entry -> its links.
 *
 * Mark 2026-09-01: "comments become their own KnowledgeBase of wisdoms with links to our MD files
 * for deep source helpful research linking."
 *
 * ⚠ IT ALSO REPORTS DEAD LINKS. A comment citing a doc that no longer exists is the same class of rot
 *   as a stale order: it reads as authoritative and cannot be checked. Those are listed first.
 *
 *   node scripts/comment-dict-links.js            → report only
 *   node scripts/comment-dict-links.js --apply    → write links into the dictionary + emit the index
 */
const fs = require('fs'), path = require('path');
const DICT = 'knowledge/dictionary/comment-dictionary.json';
const OUT  = 'knowledge/dictionary/KNOWLEDGE-LINKS.md';
const APPLY = process.argv.includes('--apply');
// Capture an optional out-of-repo prefix (~/.claude/…, /Users/…, ../…) so a citation that points
// OUTSIDE this repository is classified as such instead of masquerading as a repo-relative path.
// That distinction is the point of the exercise: a comment claiming "Mark GO" whose evidence lives
// in one AI's private plans folder is unverifiable by construction — the exact thing the COMMENT
// RULE exists to stop. Found live 2026-09-01: LightController.js cites
// ~/.claude/plans/you-will-now-do-smooth-cocke.md as the authority for its whole design.
const DOC = /((?:~\/|\.\.\/|\/)?[A-Za-z0-9_.~\/-]*?(?:knowledge|plans|docs)\/[A-Za-z0-9_.\/-]+\.md)\b/g;
const OUTSIDE = (p) => /^(~|\/|\.\.)/.test(p) || p.includes('.claude/');

// ── RETIRED: A PATH RECORDED AS DEAD IS NOT A PATH BEING CITED ────────────────────────────────────
//   THE PROBLEM THIS SOLVES, measured 2026-09-05: after LightController's dead ~/.claude/plans
//   citation was replaced by its own obituary — which deliberately KEEPS the literal path so a seat
//   grepping for it lands on the explanation — this detector went on reporting it as an UNVERIFIABLE
//   authority. It classifies by regex presence, so "my authority is X" and "X is dead, do not look
//   for it" were the same string to it. That is a standing false positive a future seat re-opens.
//   ⚠ IT RECLASSIFIES, IT DOES NOT SKIP, AND THAT IS DELIBERATE. Teaching a detector to DROP a
//     match on a marker would hand every future comment an off-switch for the very tool that exists
//     to catch planted authorities: write the marker, vanish from the report. So a retired citation
//     moves to its own printed bucket and is still counted. Nothing disappears; the worst a bad
//     actor achieves is relabelling into a line that is still on screen and still auditable.
//   THE WINDOW IS ONE LINE, AND IT IS SMALL ON PURPOSE. The marker may sit on the path's own line or
//   the line directly above it (the natural shape: a ⛔ heading, then the detail line carrying the
//   path). A wider window would let an unrelated ⛔ elsewhere in a long header retire a live citation
//   further down — the proximity IS the evidence, and the red test asserts a distant marker does NOT
//   retire a path.
const RETIRE_MARK = /⛔|\bSUPERSEDED\b/;
const RETIRE_WORD = /\bGONE\b|\bUNRECOVERABLE\b|\bDEAD\b|\bRETIRED\b|\bNO LONGER EXISTS\b|\bNEVER TRACKED\b/i;
function isRetiredCitation(text, doc) {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(doc)) continue;
    // ⚠ THE PRECEDING LINE MAY ONLY SUPPLY THE MARKER IF IT DOES NOT ITSELF CONTAIN THE PATH.
    //   Caught by this tool's own red test (MIXED arm) before it shipped: without this clause an
    //   obituary on one line laundered a LIVE citation on the line directly beneath it —
    //     ⛔ <path> is GONE.
    //     But the real authority is still <path> for the design.
    //   — because the second line borrowed the first line's marker. When the line above already
    //   carries the path, its marker belongs to THAT occurrence, not to this one, so this
    //   occurrence must carry its own or it stays live. The retiring text must head the citation
    //   it retires; it cannot reach past its own subject.
    const prev = (i > 0 && !lines[i - 1].includes(doc)) ? lines[i - 1] + '\n' : '';
    const window = prev + lines[i];
    // BOTH a marker glyph AND an explicit word — either alone is too easy to hit by accident.
    if (RETIRE_MARK.test(window) && RETIRE_WORD.test(window)) continue;
    return false;   // this occurrence is a LIVE citation, so the path is not retired
  }
  return true;      // every occurrence of the path is marked dead
}

const d = JSON.parse(fs.readFileSync(DICT, 'utf8'));
const byDoc = new Map();
const byRef = new Map();   // ref -> raw comment text, so retirement is judged on the ORIGINAL layout
let linked = 0;
for (const e of d.entries) {
  const hits = [...new Set(String(e.text || '').match(DOC) || [])];
  if (!hits.length) { if (e.links) delete e.links; continue; }
  e.links = hits; linked++;
  byRef.set(e.ref, String(e.text || ''));
  for (const h of hits) {
    if (!byDoc.has(h)) byDoc.set(h, []);
    byDoc.get(h).push({ ref: e.ref, file: e.file, line: e.line, zone: e.zone, cls: e.cls });
  }
}
const rows = [...byDoc.entries()].sort((a, b) => b[1].length - a[1].length);
const outsideAll = rows.filter(([doc]) => OUTSIDE(doc));
// A path counts as retired only if EVERY entry citing it records it as dead — one live citation
// anywhere keeps the whole path in the alarm bucket.
const retired = outsideAll.filter(([doc, refs]) =>
  refs.every(r => isRetiredCitation(byRef.get(r.ref), doc)));
const outside = outsideAll.filter(([doc]) => !retired.some(([rd]) => rd === doc));
const dead = rows.filter(([doc]) => !OUTSIDE(doc) && !fs.existsSync(doc));
const live = rows.filter(([doc]) => !OUTSIDE(doc) && fs.existsSync(doc));

console.log(`── COMMENT KNOWLEDGE LINKS ${'─'.repeat(44)}`);
console.log(`  entries citing a deep doc : ${linked}`);
console.log(`  distinct docs cited       : ${rows.length}  (${live.length} live, ${dead.length} DEAD, ${outside.length} OUTSIDE THE REPO, ${retired.length} retired)`);
if (retired.length) {
  console.log('\n  \u{1FAA6} RETIRED — recorded as dead, not cited as authority (still listed, never hidden):');
  retired.forEach(([doc, refs]) => console.log(`    ${doc}  \u2190 ${refs.map(r => `${r.ref} [${r.cls}]`).join(', ')}`));
}
if (outside.length) {
  console.log('\n  ⛔ UNVERIFIABLE — the cited authority lives outside this repository:');
  outside.forEach(([doc, refs]) => console.log(`    ${doc}  ← ${refs.map(r => `${r.ref} [${r.cls}]`).join(', ')}`));
}
if (dead.length) {
  console.log('\n  ⚠ DEAD LINKS — a comment cites a doc that does not exist:');
  dead.forEach(([doc, refs]) => console.log(`    ${doc}  ← ${refs.length} comment(s): ${refs.slice(0,3).map(r=>r.ref).join(', ')}`));
}
if (APPLY) {
  fs.writeFileSync(DICT, JSON.stringify(d, null, 1) + '\n');
  const md = [
    '# 🔗 COMMENT KNOWLEDGE LINKS',
    '',
    '**Generated by `scripts/comment-dict-links.js`. Do not hand-edit — regenerate.**',
    '',
    '> **Mark, 2026-09-01:** *"comments become their own KnowledgeBase of wisdoms with links to our MD',
    '> files for deep source helpful research linking."*',
    '',
    'Every deep doc cited from a code comment, and the `[REF#…]` entries that cite it. Follow a REF# into',
    '`comment-dictionary.json` for the full comment text and its file/line.',
    '',
    `| doc | cited by | zones |`, `|---|---|---|`,
    ...live.map(([doc, refs]) => {
      const zones = [...new Set(refs.map(r => r.zone))].join(', ');
      return `| [\`${doc}\`](../../${doc}) | ${refs.length} — ${refs.slice(0, 6).map(r => r.ref).join(', ')}${refs.length > 6 ? ' …' : ''} | ${zones} |`;
    }),
    '',
  ];
  if (outside.length) {
    md.push('## ⛔ UNVERIFIABLE CITATIONS — OUTSIDE THE REPOSITORY', '',
            'These comments rest their authority on a document that is **not in this repo** — a private',
            'AI plans folder or an absolute path on one machine. Nobody else can open them, so the claim',
            'cannot be checked by anyone. Under the COMMENT RULE §1 they govern nothing. Move the doc into',
            '`knowledge/` or drop the claim.', '',
            '| cited path | by |', '|---|---|',
            ...outside.map(([doc, refs]) => `| \`${doc}\` | ${refs.map(r => `${r.ref} (${r.file}:${r.line}) [${r.cls}]`).join(', ')} |`), '');
  }
  if (retired.length) {
    md.push('## \u{1FAA6} RETIRED CITATIONS — RECORDED AS DEAD', '',
            'These paths point outside the repository AND every comment citing them says so — the path',
            'is kept only so a seat grepping for it lands on the explanation instead of on nothing.',
            'They are listed rather than dropped: a detector that DELETES a match on a marker would',
            'hand every future comment an off-switch for the tool meant to catch it.', '',
            '| retired path | recorded by |', '|---|---|',
            ...retired.map(([doc, refs]) => `| \`${doc}\` | ${refs.map(r => `${r.ref} (${r.file}:${r.line}) [${r.cls}]`).join(', ')} |`), '');
  }
  if (dead.length) {
    md.push('## ⚠ DEAD LINKS', '', 'These comments cite a doc that no longer exists. A citation that cannot be',
            'followed reads as authority and cannot be checked — fix the path or drop the claim.', '',
            '| missing doc | cited by |', '|---|---|',
            ...dead.map(([doc, refs]) => `| \`${doc}\` | ${refs.map(r => `${r.ref} (${r.file}:${r.line})`).join(', ')} |`), '');
  }
  fs.writeFileSync(OUT, md.join('\n'));
  console.log(`\n  wrote ${DICT} (links on ${linked} entries)`);
  console.log(`  wrote ${OUT}`);
}
console.log('─'.repeat(70));

// Exported so scripts/probe-linkdetector-redtest.js exercises THE SHIPPED CLASSIFIER rather than a
// reimplementation of it. A test that re-states the rule it is checking proves only that it can copy.
module.exports = { DOC, OUTSIDE, isRetiredCitation, RETIRE_MARK, RETIRE_WORD };
