#!/usr/bin/env node
/*
 * bake-language-cube.js — THE BAKER. Turns authored corpus + grammar into ONE static artifact.
 *
 * Mark 2026-09-03: "yes consider it all pre-compiled which is superior to any outside service imho"
 * and "you can have it work and spit you out a golden cube of all that and its done, you just go
 * ping that cube for ever until next time you need an update" and "trust me - we live in zero trust
 * - that damn cube prevents abuse -- crc sha -- you see?"
 *
 *   inputs   knowledge/corpus/grammar.json        the router: buckets, keywords, priorities
 *            knowledge/corpus/lines.*.json        the authored lines, addressed BY CELL NAME
 *   output   dist/language-cube.json              the cube: lookup tables only, no logic
 *            dist/language-cube.sha256            its hash, beside it
 *
 * ⚠ THE BAKER IS THE ONLY WRITER OF THE CUBE, exactly as the comment stamper is the only writer of
 *   [REF#] tags and `dict:rebuild` the only writer of the dictionary. Hand-editing a baked artifact
 *   is how the shipped data and its source drift apart.
 *
 * ⚠⚠ IT VALIDATES AT BUILD TIME THE TWO THINGS THE 2026-05-28 ORIGINAL GOT WRONG AT RUNTIME, and
 *    that is the whole reason it exists rather than a `cat` of the inputs:
 *      · a keyword that matches INSIDE a common word (includes('ai') caught 'wait'/'afraid'/'rain')
 *      · a cell reference that does not resolve (the original pointed at phrases[23] by OFFSET, so
 *        inserting one line silently re-aimed five buckets and nothing threw)
 *    Both are detectable here and invisible in play. A baker that cannot fail is the vacuous gate
 *    this repository keeps re-learning about, so every check below can reject the bake.
 *
 * ⚠ THE VENT LANE IS DECLARED BUT UNWRITTEN, ON PURPOSE. Mark reads every line of it before it
 *   exists; the baker therefore REFUSES placeholder text in a vent cell and marks the cell pending.
 *   A pending cell must never be wired to a player — see the note on `pending` in the output.
 *
 *   node scripts/bake-language-cube.js            bake (fails loudly)
 *   node scripts/bake-language-cube.js --check    validate only, write nothing
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// ⚠⚠ THE MATCHER IS IMPORTED FROM THE RUNTIME, NOT RE-IMPLEMENTED HERE. My first version of the
//    collision check used String.includes() — SUBSTRING semantics, the very thing this port removes —
//    and it duly rejected "pp" for living inside "happy" on a router that matches on word boundaries
//    and would never have matched it there. A gate that re-implements the predicate it grades can
//    fail a correct build and pass a broken one; this repo has that scar already (a rule that read
//    roomIds while claiming to test structure, green on six false tiles). So the check runs the
//    ACTUAL matcher — and if anyone swaps it back to substring, these checks start failing.
const { matches, isPattern } = require(path.join(__dirname, '..', 'js', 'v8', 'chat', 'ChatRouter.js'));

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'knowledge', 'corpus');
const OUTDIR = path.join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// ── LOAD ─────────────────────────────────────────────────────────────────────────────────────
const grammar = JSON.parse(fs.readFileSync(path.join(SRC, 'grammar.json'), 'utf8'));
const lineFiles = fs.readdirSync(SRC).filter(f => /^lines\..+\.json$/.test(f)).sort();
const cells = {};
const cellSource = {};
for (const f of lineFiles) {
  const doc = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  for (const [key, arr] of Object.entries(doc.cells || {})) {
    if (cells[key]) fail(`cell "${key}" is defined twice — ${cellSource[key]} and ${f}. One cell, one home.`);
    cells[key] = arr;
    cellSource[key] = f;
  }
}

// ── VALIDATE 1: every keyword is a whole word, never a fragment of a common one ──────────────
//    This is the ported defect. `includes('ai')` is not a bug you can see by reading the keyword —
//    only by asking what ordinary words contain it.
const COMMON = (grammar.commonWords || []).map(w => String(w).toLowerCase());
let keywordCount = 0;
for (const b of grammar.buckets) {
  const terms = [].concat(b.keywords || [], b.phrases || []);
  if (!terms.length) fail(`bucket "${b.cell}" has neither keywords nor phrases — it can never match.`);
  for (const raw of terms) {
    keywordCount++;
    const k = String(raw).toLowerCase();
    if (!k.trim()) { fail(`bucket "${b.cell}" has an empty keyword.`); continue; }
    if (isPattern(k)) {
      // A pattern that does not compile takes the whole router down at load; catch it here instead.
      try { new RegExp(k.slice(3), 'i'); }
      catch (e) { fail(`bucket "${b.cell}" pattern ${JSON.stringify(k)} does not compile: ${e.message}`); continue; }
    }
    for (const w of COMMON) {
      if (w === k) {                               // the keyword IS an everyday word — legal, but loud
        warn(`bucket "${b.cell}" keyword "${k}" is itself an everyday word; it fires on any sentence using it.`);
        continue;
      }
      // THE REAL QUESTION: would the ROUTER match this term inside that word? Under word-boundary
      // matching the answer for "pp" in "happy" is NO; the old substring router's answer was YES.
      if (matches(k, w)) {
        fail(`bucket "${b.cell}" keyword "${k}" MATCHES inside the common word "${w}" under the live `
           + `matcher — the defect the 2026-05-28 router shipped, where includes('ai') answered `
           + `"im afraid" with a joke about the developer. Drop it or lengthen it.`);
      }
    }
  }
}

// ── VALIDATE 2: every referenced cell resolves, BY NAME ──────────────────────────────────────
// A bucket may declare `"pending": true` — AUTHORED-BUT-UNWRITTEN, an explicit state rather than an
// accident. A mistyped cell name carries no such flag and still fails the bake.
// ⚠ A DRAFT IS NOT A PLACEHOLDER AND MUST NOT BE TREATED AS ONE. A `draft: true` line is finished
//   prose in the character's voice that Mark has not yet edited; it ships and it reads correctly. The
//   bake is NOT refused for it — refusing would leave the cells at the depth that made `rasa.pp` a bag
//   of ONE, and a bag of one is a constant, which defeats the whole no-repeat guarantee. It IS
//   counted and printed, loudly, so nobody loses track of how much of the shipped voice is unreviewed.
let draftCount = 0;
const pendingDeclared = new Set(grammar.buckets.filter(b => b.pending === true).map(b => b.cell));
const referenced = new Set(grammar.buckets.map(b => b.cell));
if (grammar.fallback && grammar.fallback.cell) referenced.add(grammar.fallback.cell);
const pending = [];
for (const key of referenced) {
  const arr = cells[key];
  if (!arr) {
    if (/^vent\./.test(key) || pendingDeclared.has(key)) {
      // DECLARED, UNWRITTEN, AND THAT IS THE SPEC. Not an error — but it is recorded, and the
      // runtime must treat it as inert rather than fall through to a punchline.
      pending.push(key);
      warn(`cell "${key}" is DECLARED BUT UNWRITTEN. It bakes as pending:true and MUST NOT be wired to `
         + `a player until it has content — a pending cell returns nothing rather than falling through `
         + `to a punchline. Corpus authorship is Mark's.`);
      continue;
    }
    fail(`bucket references cell "${key}" and no lines.*.json defines it.`);
    continue;
  }
  if (!arr.length) { fail(`cell "${key}" resolves but is empty.`); continue; }
  for (let i = 0; i < arr.length; i++) {
    const L = arr[i];
    if (!L || typeof L.en !== 'string' || !L.en.trim()) fail(`cell "${key}"[${i}] has no English line.`);
    if (L && L.draft === true) draftCount++;
    if (/^\s*(TODO|TBD|PLACEHOLDER|LOREM|XXX|FIXME)/i.test(String(L && L.en))) {
      fail(`cell "${key}"[${i}] is PLACEHOLDER TEXT. Every shipped line is a line a human wrote and read — `
         + `that promise is the whole safety model, and one TODO breaks it.`);
    }
  }
}
// a cell nobody routes to is dead weight in the artifact — report it, do not fail
for (const key of Object.keys(cells)) if (!referenced.has(key)) warn(`cell "${key}" is never routed to.`);

// ── VALIDATE 3: no term claimed by two buckets at the same priority ──────────────────────────
const claimed = new Map();
for (const b of grammar.buckets) {
  for (const raw of [].concat(b.keywords || [], b.phrases || [])) {
    const k = String(raw).toLowerCase(), sig = (b.priority | 0) + '::' + k;
    if (claimed.has(sig)) {
      fail(`term "${k}" is claimed by both "${claimed.get(sig)}" and "${b.cell}" at priority ${b.priority}. `
         + `Which one wins would be decided by file order — name one owner.`);
    }
    claimed.set(sig, b.cell);
  }
}

// ── EMIT ─────────────────────────────────────────────────────────────────────────────────────
// Sorted keys and no timestamp: the same inputs must bake to the same bytes, or the SHA is theatre.
const buckets = grammar.buckets
  .map(b => ({ cell: b.cell, priority: b.priority | 0,
               terms: [].concat(b.keywords || [], b.phrases || []).map(t => String(t).toLowerCase()).sort() }))
  .sort((a, b) => (a.priority - b.priority) || a.cell.localeCompare(b.cell));

const cube = {
  format: 'origami-language-cube',
  version: grammar.version | 0,
  pending: pending.sort(),
  fallbackCell: (grammar.fallback && grammar.fallback.cell) || null,
  buckets,
  cells: Object.keys(cells).sort().reduce((o, k) => (o[k] = cells[k], o), {})
};
const json = JSON.stringify(cube, null, 1) + '\n';
const sha = crypto.createHash('sha256').update(json, 'utf8').digest('hex');

// ── REPORT ───────────────────────────────────────────────────────────────────────────────────
console.log('LANGUAGE CUBE BAKER');
console.log('  sources     : grammar.json + ' + lineFiles.length + ' line file(s) — ' + lineFiles.join(', '));
console.log('  buckets     : ' + buckets.length + ' · terms ' + keywordCount);
console.log('  cells       : ' + Object.keys(cells).length + ' · lines '
  + Object.values(cells).reduce((a, c) => a + c.length, 0));
console.log('  pending     : ' + (pending.length ? pending.join(', ') : 'none'));
console.log('  DRAFT lines : ' + draftCount + " awaiting Mark's red pen"
  + (draftCount ? '  (finished prose, not placeholders — they ship and they read)' : ''));
for (const w of warns) console.log('  ⚠  ' + w);
for (const e of errors) console.log('  ⛔ ' + e);

if (errors.length) {
  console.log('\n  BAKE REFUSED — ' + errors.length + ' error(s). Nothing was written.');
  process.exit(2);
}
if (CHECK_ONLY) { console.log('\n  CHECK ONLY — valid, nothing written. sha would be ' + sha.slice(0, 16) + '…'); process.exit(0); }

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'language-cube.json'), json);
fs.writeFileSync(path.join(OUTDIR, 'language-cube.sha256'), sha + '  language-cube.json\n');
// ⚠ CHARACTERS, NOT BYTES — `json.length` counts UTF-16 units and this corpus is full of “…” and
//   “’”, so the two differ. Saying "bytes" when you mean characters is a small lie that makes a
//   size check disagree with `wc -c` for no reason anybody can find later.
console.log('\n  wrote dist/language-cube.json  (' + json.length + ' chars, '
  + Buffer.byteLength(json, 'utf8') + ' bytes)');
console.log('  wrote dist/language-cube.sha256  ' + sha);
console.log('  BAKED.');
