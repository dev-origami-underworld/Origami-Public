#!/usr/bin/env node
/* gate-comment-authority.js — THE ENFORCEMENT. Fails when a comment claims authority it does not have.
 * Mark 2026-08-27: "so none of this code can just suddenly get a COMMENT that overrides everything I
 * want to do forever and hide itself this way -- its unethical and stops now with this new COMMENT RULE"
 *
 *   node scripts/gate-comment-authority.js            → gate the whole game
 *   node scripts/gate-comment-authority.js --staged   → gate only what is staged (pre-commit use)
 *   node scripts/gate-comment-authority.js --new-only → ignore the pre-existing backlog, fail on NEW only
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = process.cwd(), args = process.argv.slice(2);
const STAGED = args.includes('--staged'), NEW_ONLY = args.includes('--new-only');
const TAG = /\[REF#[A-Z][A-Z0-9]-\d{5}/;

// STRING-AWARE trailing-comment detector. A line is NOT a comment just because it contains "//":
// `const out = ['// AUDIO TRIAGE …']` and a JSON "note" field are DATA, not rules. Two such false
// positives were flagged before this existed. Known limitation: a template literal opened on an
// EARLIER line cannot be tracked line-by-line (see the exception list below).
function trailingCommentIdx(line) {
  let q = null;
  for (let c = 0; c < line.length - 1; c++) {
    const ch = line[c];
    if (q) { if (ch === '\\') { c++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '/' && line[c+1] === '/') return (c > 0 && line[c-1] === ':') ? -1 : c;
  }
  return -1;
}

// KNOWN GAP, declared not hidden: a trailing comment after a MULTI-LINE template literal closes.
// One instance in the game. Listed so it is auditable rather than silently passing.
// ── WAIVERS ARE KEYED BY CONTENT, NOT BY LINE NUMBER ──────────────────────────────────────────
//    `unstampable-sites.json` records the sites the STAMPER refuses to touch, and its four reasons
//    are all correct refusals — appending `[REF#…]` after a `//` that sits inside a template literal,
//    or after a `/` that could open a regex, would edit CODE, not a comment. Those sites can never
//    carry a tag, so the gate has to tolerate them or it can never go green; and a gate that can
//    never go green gets removed from smoke, which is precisely how this system rotted between
//    2026-08-27 and 2026-09-01 (208 violations accumulated with nothing running).
//    ⚠ KEYED BY THE COMMENT'S OWN TEXT, deliberately. A file:line waiver (what this was: ONE
//      hardcoded line) dies the moment anything above it shifts, AND it is a hiding place — a rogue
//      could rewrite the waived comment into an instruction and keep the waiver. Hashing the text
//      means EDITING a waived comment un-waives it and the gate fails. Waivers are for sites that
//      cannot be tagged, never for content nobody is checking.
const crypto = require('crypto');
const _norm = t => String(t).replace(/^\s*(\/\/|\/\*+|\*+|<!--)\s?/, '').replace(/\s+/g, ' ').trim();
const _key  = (f, t) => f + '|' + crypto.createHash('sha1').update(_norm(t)).digest('hex').slice(0, 16);
const WAIVED = new Map();
try {
  const _u = JSON.parse(require('fs').readFileSync('knowledge/dictionary/unstampable-sites.json', 'utf8'));
  for (const s of (Array.isArray(_u) ? _u : (_u.sites || _u.entries || [])))
    if (s && s.file && s.text) WAIVED.set(_key(s.file, s.text), s.reason || 'unstampable');
} catch (_) { /* no waiver file → every claim must carry a tag */ }
let waivedHits = 0;

// R-000 §3: a comment that ASSERTS A RULE must carry [REF#…]. These are the assertions.
const RULE_CLAIM = [
  [/\bMark\b(?!\w)/,                       'attributes an order to Mark'],
  [/\b(LAW|BANNED|MANDATE|BINDING)\b/,     'asserts a law or ban'],
  [/\b(DEFAULT ON|DEFAULT OFF|by default)\b/i, 'claims a runtime default state'],
  [/\b(NEVER|DO NOT|do NOT)\b/,            'prohibits a future action'],
];

let files;
if (STAGED) {
  files = cp.execSync('git diff --cached --name-only --diff-filter=ACM', { encoding:'utf8' })
    .split('\n').filter(f => /\.(js|mjs|html)$/.test(f) && fs.existsSync(path.join(ROOT,f)));
} else {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT,'knowledge/dictionary/comment-dictionary.json'),'utf8'));
  files = [...new Set(dict.entries.map(e => e.file))];
}

// the backlog: everything that already existed at the time the rule landed
let baseline = new Set();
if (NEW_ONLY) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(ROOT,'knowledge/dictionary/comment-dictionary.json'),'utf8'));
    for (const e of b.entries) baseline.add(e.file + ':' + e.text.slice(0,80));
  } catch (_) {}
}

const viol = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT,f),'utf8').split(/\r?\n/);
  // BLOCK-AWARE: the stamper marks a comment BLOCK on its opening line. Every continuation line of
  // that block inherits its REF#. Checking lines independently double-counts a stamped block as
  // unstamped — that is why the gate read 1763 after a clean stamp of all 9157 comments.
  let inBlock = false, blockHasRef = false, prevWasLine = false;
  for (let i=0;i<lines.length;i++) {
    const L = lines[i], T = L.trim();
    // a bare leading `*` only means "comment" when we are INSIDE a block — otherwise it is maths
    const isCmt = /^(\/\/|\/\*|<!--)/.test(T) || (inBlock && /^\*/.test(T)) || trailingCommentIdx(L) >= 0;
    if (inBlock) {                                               // continuation
      if (/\*\/|-->/.test(L)) inBlock = false;
      if (blockHasRef) { prevWasLine = false; continue; }
    } else if (/^(\/\*|<!--)/.test(T)) {                          // block opens here
      blockHasRef = TAG.test(L);
      if (!/\*\/|-->/.test(L.slice(2))) inBlock = true;
      if (blockHasRef) { prevWasLine = false; continue; }
    } else if (/^\/\//.test(T)) {                                 // // run: first line carries the ref
      if (prevWasLine && blockHasRef) continue;
      if (!prevWasLine) blockHasRef = TAG.test(L);
      prevWasLine = true;
      if (blockHasRef) continue;
    } else { prevWasLine = false; }
    if (!isCmt) continue;
    if (TAG.test(L)) continue;                                   // referenced → lawful
    for (const [re, why] of RULE_CLAIM) {
      if (!re.test(L)) continue;
      const key = f + ':' + L.replace(/^\s*(\/\/|\/\*+|\*+|<!--)\s?/,'').trim().slice(0,80);
      if (NEW_ONLY && baseline.has(key)) break;                  // pre-existing backlog
      if (WAIVED.has(_key(f, L))) { waivedHits++; break; }   // cannot be tagged (regex/template-literal) — see WAIVED above
      viol.push({ f, line: i+1, why, text: L.trim().slice(0,120) });
      break;
    }
  }
}

// --json: emit findings for scripts/comment-dict-waive.js. ONE definition of "rule-claiming"
// lives here; the waiver tool consumes this rather than re-implementing the test and drifting.
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ violations: viol, waived: waivedHits }, null, 1));
  process.exit(0);
}
console.log('COMMENT AUTHORITY GATE — R-000 §3: a rule-claiming comment must carry [REF#…]');
console.log(`  scope      : ${STAGED ? 'STAGED files' : 'whole game'}${NEW_ONLY ? ' (new claims only)' : ''}`);
console.log(`  files       : ${files.length}`);
console.log(`  violations  : ${viol.length}`);
console.log(`  waived      : ${waivedHits} (untaggable sites, keyed by comment text — editing one un-waives it)`);
if (viol.length) {
  const byWhy = {}; for (const v of viol) byWhy[v.why] = (byWhy[v.why]||0)+1;
  console.log('\n  by kind:');
  for (const k of Object.keys(byWhy)) console.log(`    ${String(byWhy[k]).padStart(5)}  ${k}`);
  console.log('\n  first 10:');
  viol.slice(0,10).forEach(v => console.log(`    ${v.f}:${v.line}  [${v.why}]\n      ${v.text}`));
  console.log('\n  FIX: run the scanner+stamper so each gets a REF#, or delete the claim.');
  console.log('  A rule-claiming comment with no REF# is VOID under R-000 §3 and may be deleted by any seat.');
}
console.log('\n  ' + (viol.length ? 'FAIL' : 'PASS'));
process.exit(viol.length ? 1 : 0);
