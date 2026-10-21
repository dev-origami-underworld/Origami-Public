#!/usr/bin/env node
/* comment-dict-scan.js — READ-ONLY. Extracts EVERY comment in the game, classifies it by the [REF#CR-00113]
 * authority it claims, assigns a permanent REF#, and emits the COMMENT DATA DICTIONARY.
 *
 * Mark's order 2026-08-27: "gather up all comments and rules ... so none of this code can just
 * suddenly get a COMMENT that overrides everything I want to do forever and hide itself this way".
 *
 * THIS SCRIPT WRITES NOTHING INTO SOURCE. It only reads. Stamping is comment-dict-stamp.js.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();

// Scan order is Mark's: main game -> engine -> panels -> dungeon creation -> gameplay/visuals/fps [REF#CR-00114]
const TARGETS = [
  { file: 'OrigamiUnderworld.html',       zone: 'MAIN-GAME' },
  { file: 'Origami.RealityEngine.9.html', zone: 'ENGINE'    },
  { file: 'Origami.RealityEngine.Panels.html',  zone: 'PANELS'    },
  { file: 'sw.js',                   zone: 'CORE'      },
  { file: 'scripts/comment-dict-scan.js', zone: 'CORE' },
];
// ⚠ 2026-08-27: the first version listed only map/ui/render + the js/v8 top level — FOUR of the [REF#CR-00115]
// TWELVE directories under js/v8. It silently skipped a11y, ai, audio, combat, core, data,
// entities and interaction: 32 files, ~40% of the module tree, on an order that said "ALL COMMENTS
// in the code - all of it". Found because AI 1's PathFinder restore landed in js/v8/entities and my
// dictionary had never heard of it. Enumerate the tree; never hand-list directories.
const DIRS = [
  { dir: 'js/v8/map',         zone: 'DUNGEON'  },
  { dir: 'js/v8/ui',          zone: 'UI'       },
  { dir: 'js/v8/render',      zone: 'VISUALS'  },
  { dir: 'js/v8/entities',    zone: 'ENTITIES' },
  { dir: 'js/v8/combat',      zone: 'COMBAT'   },
  { dir: 'js/v8/ai',          zone: 'AI'       },
  { dir: 'js/v8/audio',       zone: 'AUDIO'    },
  { dir: 'js/v8/core',        zone: 'CORE'     },
  { dir: 'js/v8/cards',       zone: 'CORE'     },   // the card registry (2026-09-14) — beside CardDatabase, same CR prefix [REF#CR-00144]
  { dir: 'js/v8/data',        zone: 'DATA'     },
  { dir: 'js/v8/a11y',        zone: 'A11Y'     },
  { dir: 'js/v8/interaction', zone: 'INTERACT' },
  { dir: 'js/v8',             zone: 'GAMEPLAY' },   // remaining top-level modules [REF#CR-00116]
];

const PREFIX = { 'MAIN-GAME':'MG', ENGINE:'E9', PANELS:'PN', DUNGEON:'DG', UI:'UI', VISUALS:'VZ',
                 ENTITIES:'EN', COMBAT:'CB', AI:'AI', AUDIO:'AU', CORE:'CR', DATA:'DA', A11Y:'AY',
                 INTERACT:'IX', GAMEPLAY:'GP' };

// ── CLASSIFICATION: what authority does this comment CLAIM? ──────────────────────────────────── [REF#CR-00117]
// Order matters — first match wins, most dangerous first.
const CLASSES = [
  ['A1-ORDER',      /\bMark\b(?!\w)/,                          'Attributes an order or ruling to Mark. UNVERIFIABLE from the code. Highest risk.'],
  ['A2-LAW',        /\b(LAW|BANNED|MANDATE|BINDING|forbidden)\b/i, 'Asserts a standing law or ban.'],
  ['A3-STATE',      /\b(DEFAULT ON|DEFAULT OFF|default on|default off|by default|DEFAULT =)/, 'Claims a runtime DEFAULT STATE. This is the class that lied about _emergencyMap.'],
  ['A4-PROHIBIT',   /\b(NEVER|DO NOT|Do not|never re-|do NOT)\b/,  'Prohibits a future action.'],
  ['A5-DISABLE',    /\b(DISABLED|REMOVED|no-op|stubbed|OFF:|RESTORE:|Re-enable|re-enable)\b/, 'Records or instructs a disable / restore.'],
  ['A6-FLAG',       /window\._[A-Za-z0-9_]+/,                   'Names a runtime flag or knob.'],
  ['A7-WARN',       /[⚠\u{1F6AB}]/u,                       'Carries a warning glyph.'],
  ['A8-MEASURE',    /\b(MEASURED|measured|verified|VERIFIED|probe|fps|FPS)\b/, 'Claims a measurement or verification.'],
  ['P0-PLAIN',      /.*/,                                        'Descriptive only. No authority claimed.'],
];

function classify(text) {
  for (const [id, re, why] of CLASSES) if (re.test(text)) return { id, why };
  return { id: 'P0-PLAIN', why: 'Descriptive only.' };
}

// ── EXTRACTION ───────────────────────────────────────────────────────────────────────────────── [REF#CR-00118]
// Line-oriented on purpose: a REF# must anchor to a line the reader can open.
function extract(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const out = [];
  let block = null;   // { startLine, lines[], kind } [REF#CR-00119]
  const flush = () => { if (block) { out.push(block); block = null; } };

  for (let i = 0; i < src.length; i++) {
    const raw = src[i], line = raw.trim(), n = i + 1;
    const isHtmlOpen  = line.startsWith('<!--');
    const isHtmlClose = line.includes('-->');
    const isBlockOpen = /^\/\*/.test(line);
    const isBlockCont = /^\*/.test(line);
    const isBlockEnd  = line.includes('*/');
    const isLine      = /^\/\//.test(line);

    if (block) {                                   // inside a multi-line block [REF#CR-00120]
      block.lines.push(raw);
      if ((block.kind === 'html'  && isHtmlClose) ||
          (block.kind === 'block' && isBlockEnd)  ||
          (block.kind === 'line'  && !isLine)) {
        if (block.kind === 'line' && !isLine) block.lines.pop();   // the non-comment line is not ours [REF#CR-00121]
        flush();
        if (block === null && isLine) { /* fallthrough */ }
      }
      if (block) continue;
      if (!isLine && !isHtmlOpen && !isBlockOpen) continue;
    }
    if (isHtmlOpen)      block = { startLine: n, lines: [raw], kind: 'html'  };
    else if (isBlockOpen)block = { startLine: n, lines: [raw], kind: 'block' };
    else if (isLine)     block = { startLine: n, lines: [raw], kind: 'line'  };
    if (block && ((block.kind === 'html' && isHtmlClose) || (block.kind === 'block' && isBlockEnd))) flush();
  }
  flush();

  // ── TRAILING comments on code lines (`code;  // note`) ──────────────────────────────────────── [REF#CR-00122]
  // The block scanner above only sees comments that START a line. A rule-claiming comment can hide
  // at the end of a code line — gate-comment-authority.js found exactly one (Engine9:64639,
  // "+30% (Mark 2026-06-24 …)"). String-aware so a URL or a "//" inside a literal is not mistaken
  // for a comment.
  const covered = new Set();
  for (const b of out) for (let k = 0; k < b.lines.length; k++) covered.add(b.startLine + k);

  // ── IS THIS LINE INSIDE A TEMPLATE LITERAL? ────────────────────────────────────────────────── [REF#CR-00123]
  // ⚠ 2026-08-28, THIRD live breakage, caught by the verifier before commit — Engine9:37675:
  //     totalEmissiveRadiance += … * uRimEmiss;   // optional additive emissive boost (…default 0 = no-op)`)
  // That `//` is a GLSL comment inside a multi-line template literal, and the backtick AFTER it
  // CLOSES the template — so the tag landed in live JS. I had just relaxed the backtick guard to
  // "only a backtick BEFORE the // matters", which is true only if you are not ALREADY inside a
  // template from an earlier line. A line-at-a-time scanner cannot know that, so compute it once
  // for the whole file. Errs toward "inside" — over-refusing costs a gate line, under-refusing
  // costs Mark a dead boot, and that trade is never close.
  // ⚠ AND IT WAS WRONG THE OTHER WAY TOO, same day. The first version of this tracker did not skip
  // HTML COMMENTS. Engine9 opens one at line 2 that does not close until line 3464 — 3,463 lines of
  // prose about the codebase, containing backticks. An ODD number of them flipped the tracker into
  // "inside a template" and it never recovered, so it refused everything after it.
  //   MEASURED: 5,908 lines flagged vs 249 once HTML comments are skipped — 5,659 false positives,
  //   96%. Engine9:3576 (`if (!R) return; // r128 loaded above; should never miss`) is plain JS and
  //   was silently dropped from the dictionary. The real breakage at 37675 is still caught either way.
  // Over-refusal never breaks the game, which is why nothing went red — it just quietly shrinks
  // coverage, and quietly shrinking coverage is the exact failure this whole dictionary exists to
  // stop. A guard being safe is not the same as a guard being right.
  // ⚠ AND HTML-COMMENT STATE MUST NOT APPLY INSIDE A <script> BODY. Annex B web-compat makes `<!--`
  // and a line-leading `-->` LEGAL JAVASCRIPT line-comment syntax, so a naive HTML-comment skipper
  // fires inside script bodies and over-skips — the same over-refusal bug in a new costume.
  // (Raised by AI 1, 2026-08-28. MEASURED in this tree: 0 occurrences inside script bodies across
  // all three HTML files, so it is latent, not live — closed anyway, because "does not happen to
  // bite today" is how the last three of these were written.) AI 1's stronger suggestion is
  // extraction-first — segment script/non-script ONCE and run a fresh JS tracker per block, which
  // kills state-leak-across-a-boundary as a CLASS rather than instance by instance. That is the
  // right architecture and is recorded as the follow-up; this guard is the contained version.
  const scriptLine = new Array(src.length).fill(false);
  {
    let inScript = false;
    for (let i = 0; i < src.length; i++) {
      const t = src[i];
      if (!inScript && /^[ \t]*<script\b/i.test(t)) { inScript = !/<\/script>/i.test(t); scriptLine[i] = true; continue; }
      if (inScript && /<\/script>/i.test(t)) { inScript = false; scriptLine[i] = true; continue; }
      scriptLine[i] = inScript;
    }
  }

  const insideTemplate = new Array(src.length).fill(false);
  {
    let inBlock = false, inStr = null, tick = false, inHtml = false;
    for (let i = 0; i < src.length; i++) {
      insideTemplate[i] = tick;
      const L = src[i];
      for (let c = 0; c < L.length; c++) {
        const ch = L[c], nx = L[c+1];
        if (inHtml)  { if (ch === '-' && nx === '-' && L[c+2] === '>') { inHtml = false; c += 2; } continue; }
        if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; c++; } continue; }
        if (inStr)   { if (ch === '\\') { c++; continue; } if (ch === inStr) inStr = null; continue; }
        if (tick)    { if (ch === '\\') { c++; continue; } if (ch === '`') tick = false; continue; }
        if (!scriptLine[i] && ch === '<' && nx === '!' && L.slice(c, c + 4) === '<!--') { inHtml = true; c += 3; continue; }
        if (ch === '/' && nx === '*') { inBlock = true; c++; continue; }
        if (ch === '/' && nx === '/') break;                 // rest of line is a comment [REF#CR-00124]
        if (ch === '"' || ch === "'") { inStr = ch; continue; }
        if (ch === '`') { tick = true; continue; }
      }
      if (inStr) inStr = null;                               // a normal string cannot span lines [REF#CR-00125]
    }
  }
  for (let i = 0; i < src.length; i++) {
    const n = i + 1;
    if (covered.has(n)) continue;
    const line = src[i];
    // NOTE: a bare leading `*` is EXCLUDED from this guard on purpose — it is the multiplication [REF#CR-00126]
    // operator on a wrapped expression (Engine9:64639 `* ((typeof …) ? … : 1.3);  // +30% (Mark …)`).
    // Real block-comment continuations are already in `covered`, so they cannot reach here.
    if (/^(\/\/|\/\*|<!--)/.test(line.trim())) continue;
    // ⚠ DEFECT #7, 2026-08-27: this detector read the `//` INSIDE the regex literal `/^\.\//` as a [REF#CR-00127]
    // comment start and stamped a CODE line (Engine9:34612) — SyntaxError, Mark's game would not boot.
    // A full JS tokenizer is the only exact answer; short of that we are DELIBERATELY CONSERVATIVE:
    // if anything ambiguous appears before the `//`, we DO NOT stamp. Under-stamping is caught by the
    // gate and costs nothing. Over-stamping breaks the game. Never trade that the other way.
    // A TEMPLATE LITERAL can span many lines, so single-line scanning cannot know whether we are
    // inside one. Engine9 embeds GLSL in template literals, and GLSL uses `//` comments — stamping
    // one lands the tag in JS code once the literal closes. Refuse ANY line containing a backtick.
    // (Caught by the repaired module-aware verifier, 2026-08-27, before it could ship.)
    // ⚠ REFINED 2026-08-28, and refined CAREFULLY, because loosening exactly this guard is what put
    // a tag into live code twice. Two changes, each of which only ever REFUSES LESS when the answer
    // is provable:
    //   1. BACKTICK: only a backtick BEFORE the `//` can put us inside a template literal. Backticks
    //      AFTER it are inside the comment text (Engine9:81049 quotes `<=0` in prose) and are inert.
    //   2. SLASH: a `/` before the `//` is only dangerous if it could OPEN A REGEX. After `)`, `]`,
    //      a digit, or an identifier, `/` is division — `(sl+sh)/2`, `Math.PI/2`. The naive form of
    //      this rule is a classic trap: `return /re/.test(s)` also ends in an identifier character,
    //      so a KEYWORD before the slash means regex, not division. Keyword list below; anything not
    //      provably division still refuses, exactly as before.
    const KW_REGEX = new Set(['return','typeof','instanceof','in','of','new','delete','void','throw',
                              'do','else','yield','await','case']);
    let q = null, idx = -1, ambiguousSlash = false;
    for (let c = 0; c < line.length - 1; c++) {
      const ch = line[c];
      if (q) { if (ch === '\\') { c++; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '/' && line[c+1] === '/') { idx = c; break; }
      if (ch === '/') {
        const before = line.slice(0, c).replace(/\s+$/, '');
        const last = before.slice(-1);
        let division = false;
        if (last === ')' || last === ']' || /[A-Za-z0-9_$]/.test(last)) {
          const word = (before.match(/[A-Za-z_$][A-Za-z0-9_$]*$/) || [''])[0];
          division = !KW_REGEX.has(word);
        }
        if (!division) { ambiguousSlash = true; break; }   // could open a regex → refuse the line [REF#CR-00128]
      }
    }
    if (q !== null) continue;                       // unterminated quote/template on this line → refuse [REF#CR-00129]
    if (ambiguousSlash) continue;                   // a '/' that could start a regex → refuse [REF#CR-00130]
    if (idx < 0) continue;
    if (insideTemplate[i]) continue;                // the line BEGINS inside a template literal [REF#CR-00131]
    if (line.slice(0, idx).includes('`')) continue; // a backtick BEFORE the '//' → maybe inside a template
    if (idx > 0 && line[idx-1] === ':') continue;   // http:// style [REF#CR-00132]
    out.push({ startLine: n, lines: [line.slice(idx)], kind: 'trail' });
  }
  out.sort((a,b) => a.startLine - b.startLine);
  return out;
}

function listJs(dir, seen) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
    .map(f => path.join(dir, f))
    .filter(f => !seen.has(f));
}

// ── MAIN ─────────────────────────────────────────────────────────────────────────────────────── [REF#CR-00133]
const seen = new Set();
const files = [];
for (const t of TARGETS) if (fs.existsSync(path.join(ROOT, t.file))) { files.push(t); seen.add(t.file); }
for (const d of DIRS) for (const f of listJs(d.dir, seen)) { files.push({ file: f, zone: d.zone }); seen.add(f); }

// ── THE ID IS READ FROM THE SOURCE, NEVER RECOMPUTED FROM POSITION ──────────────────────────── [REF#CR-00134]
// ⚠ 2026-08-28. The first design numbered comments by a per-zone counter in scan order. That makes
// a REF# a POSITION, not an identity: add one comment anywhere and every id after it shifts. The
// stamper is idempotent, so the tags already in the source were never rewritten — dictionary and
// source silently diverged. MEASURED before any of this shipped twice: 13,867 of 15,765 tags
// disagreed with the dictionary, and the dictionary committed in 054cc49c did not even match the
// tags committed IN THAT SAME COMMIT (it had been regenerated after the stamp — the token-and-
// content-move-together failure, applied to a data file).
//
// THE FIX: a comment that already carries a tag OWNS that id, forever. The source IS the ledger.
// Re-scanning is now idempotent by construction: adopt what is there, mint only for genuinely new
// comments, and never reuse a retired number. This is what makes "permanent REF#" true rather than
// merely asserted, which is the whole point of Mark's COMMENT RULE.
const OWN_TAG = /\[REF#([A-Z][A-Z0-9]-\d{5})(?:\s*→\s*see\s+REF#[A-Z][A-Z0-9]-\d{5})?\]/;

const blocksByFile = new Map();
for (const { file, zone } of files) blocksByFile.set(file, { zone, blocks: extract(file) });

// PASS 1 — adopt every id already present in the source, and detect any id used twice. [REF#CR-00135]
const adopted = new Map();          // "file\u0000startLine" -> ref [REF#CR-00136]
const usedInZone = {};              // prefix -> Set(number) [REF#CR-00137]
const collisions = [];
for (const { file, zone } of files) {
  const pre = PREFIX[zone] || 'XX';
  usedInZone[pre] = usedInZone[pre] || new Set();
  for (const b of blocksByFile.get(file).blocks) {
    let found = null;
    for (const raw of b.lines) { const m = raw.match(OWN_TAG); if (m) { found = m[1]; break; } }
    if (!found) continue;
    const [fpre, fnum] = [found.slice(0, found.indexOf('-')), Number(found.slice(found.indexOf('-') + 1))];
    if (fpre !== pre) { collisions.push(`${file}:${b.startLine} carries ${found} but lives in zone ${zone} (${pre})`); continue; }
    if (usedInZone[pre].has(fnum)) { collisions.push(`${file}:${b.startLine} re-uses ${found}`); continue; }
    usedInZone[pre].add(fnum);
    adopted.set(file + '\u0000' + b.startLine, found);
  }
}

// ── THE LEDGER, for comments that can never carry a tag ─────────────────────────────────────── [REF#CR-00138]
// The stamper deliberately REFUSES a comment it cannot tag without risking live code (a `//` after
// a regex literal, a backtick on the line, a block comment that closes mid-line). Those comments
// are real and the gate still holds them to R-000, but they have nowhere to keep an id — so on the
// next scan they would mint a NEW one, and the "permanent REF#" promise would be false for exactly
// the comments most likely to be dangerous. The ledger remembers them by content instead.
// Tagged comments never consult it: the tag in the source always wins.
const LEDGER_PATH = path.join(ROOT, 'knowledge/dictionary/ref-ledger.json');
let ledger = {};
try { ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch (_) { ledger = {}; }
const ledgerKey = (zone, file, flat, nth) =>
  `${zone}|${file}|${nth}|${flat.replace(/\s+/g, ' ').trim().slice(0, 300)}`;
const nextLedger = {};
const seenText = {};

// PASS 2 — build entries, minting only where no id was adopted. Mint above the high-water mark so a [REF#CR-00139]
// deleted comment's number is retired rather than handed to a different comment later.
const nextFree = {};
for (const pre of Object.keys(usedInZone)) nextFree[pre] = Math.max(0, ...usedInZone[pre]) + 1;
let adoptedCount = 0, mintedCount = 0, ledgerCount = 0;
const entries = [];
for (const { file, zone } of files) {
  const pre = PREFIX[zone] || 'XX';
  usedInZone[pre] = usedInZone[pre] || new Set();
  nextFree[pre] = nextFree[pre] || 1;
  for (const b of blocksByFile.get(file).blocks) {
    const text = b.lines.join('\n');
    const flat = text.replace(/^\s*(<!--|\/\*+|\*+\/?|\/\/)\s?/gm, '').replace(/-->\s*$/,'')
                     .replace(/\s?\[REF#[A-Z][A-Z0-9]-\d{5}(?: → see REF#[A-Z][A-Z0-9]-\d{5})?\]/g,'').trim();
    if (!flat) continue;
    const cls = classify(flat);
    const tkey = zone + '|' + file + '|' + flat.slice(0, 80);
    const nth = (seenText[tkey] = (seenText[tkey] || 0) + 1) - 1;
    const lkey = ledgerKey(zone, file, flat, nth);
    let ref = adopted.get(file + '\u0000' + b.startLine);
    if (ref) adoptedCount++;
    else if (ledger[lkey] && !usedInZone[pre].has(Number(ledger[lkey].split('-')[1]))) {
      ref = ledger[lkey];                                  // untaggable comment, id remembered [REF#CR-00140]
      usedInZone[pre].add(Number(ref.split('-')[1]));
      ledgerCount++;
    } else {
      while (usedInZone[pre].has(nextFree[pre])) nextFree[pre]++;
      ref = `${pre}-${String(nextFree[pre]).padStart(5, '0')}`;
      usedInZone[pre].add(nextFree[pre]); nextFree[pre]++; mintedCount++;
    }
    nextLedger[lkey] = ref;
    entries.push({ ref, file, zone, line: b.startLine, endLine: b.startLine + b.lines.length - 1,
                   lines: b.lines.length, kind: b.kind, cls: cls.id, text: flat });
  }
}

// ── OUTPUT ───────────────────────────────────────────────────────────────────────────────────── [REF#CR-00141]
fs.mkdirSync(path.join(ROOT, 'knowledge/dictionary'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'knowledge/dictionary/comment-dictionary.json'),
                 JSON.stringify({ generated: process.env.STAMP || 'unstamped', entries }, null, 1));
fs.writeFileSync(LEDGER_PATH, JSON.stringify(nextLedger, null, 0));

const byClass = {}, byZone = {};
for (const e of entries) { byClass[e.cls] = (byClass[e.cls]||0)+1; byZone[e.zone] = (byZone[e.zone]||0)+1; }

console.log('COMMENT DATA DICTIONARY — scan complete');
console.log('  files scanned : ' + files.length);
console.log('  comments      : ' + entries.length);
console.log('  ids ADOPTED from source : ' + adoptedCount + '   (a tagged comment keeps its id forever)');
console.log('  ids from LEDGER (untaggable): ' + ledgerCount);
console.log('  ids MINTED (new comments): ' + mintedCount);
if (collisions.length) {
  console.log('  ⛔ ID COLLISIONS : ' + collisions.length + '  — the same REF# on two different comments');
  collisions.slice(0, 10).forEach(c => console.log('      ' + c));
}
console.log('  comment lines : ' + entries.reduce((s,e)=>s+e.lines,0));
console.log('\n  BY AUTHORITY CLASS (most dangerous first):');
for (const [id,,why] of CLASSES) if (byClass[id]) console.log(`    ${id.padEnd(12)} ${String(byClass[id]).padStart(6)}   ${why}`);
console.log('\n  BY ZONE:');
for (const z of Object.keys(byZone)) console.log(`    ${z.padEnd(12)} ${String(byZone[z]).padStart(6)}`);
console.log('\n  wrote knowledge/dictionary/comment-dictionary.json');
