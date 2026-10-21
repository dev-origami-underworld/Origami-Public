#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * gate-onibaba-arteries.js — proves Oni-Baba's nerves are CONNECTED, not merely declared.
 *
 * Mark, 2026-09-06: "we found so much good defensive features that she had when I built her first.
 * the rogue ai silenced her, cut her arteries off", and: "she is now in a zero-trust architecture
 * always checking her own sensors first."
 *
 * WHAT AN ARTERY IS HERE, in the two directions a nerve can be cut:
 *   · A SENSOR is afferent — it carries the world INTO her. It is severed when nothing writes it.
 *     A sensor that is declared and never fed reads a permanent 0, and every rule downstream of it
 *     computes off a number that cannot move. It fails silently: the value is present and plausible.
 *   · An OUTPUT is efferent — it carries her will OUT. It is severed when nothing outside her file
 *     reads it. She decides, and the game does not obey.
 *
 * WHY A DECLARATION IS NOT A CONNECTION, which is the whole reason this file exists: an object
 * literal that names every sensor and every output looks identical, to a reader and to a grep, to a
 * working nervous system. `window._lastOniBabaStats` in NewOrigami.Engine9.html is exactly that —
 * it names all 8 outputs and holds values that are NOT hers. Counting mentions would score it as a
 * healthy consumer. So a key declaration and a read are classified separately below, and the
 * evidence lines are printed so any verdict here can be re-derived by hand.
 *
 * ⚠ THE VACUOUS GUARD IS THE FIRST CHECK AND IT IS NOT OPTIONAL. If the parser finds zero sensors
 *   or zero outputs, this gate FAILS LOUD rather than reporting a clean sweep. A count that
 *   collapses to zero is the signature of a broken instrument, and a gate that reports PASS when
 *   its own extraction died is worse than no gate — it certifies silence as health.
 *
 * Run:  node scripts/gate-onibaba-arteries.js
 *       node scripts/gate-onibaba-arteries.js --selftest    (proves the gate can go red)
 * Exit: 0 = every declared nerve is connected · 1 = at least one severed · 2 = instrument broken
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ONI = path.join(REPO, 'js', 'v8', 'OniBaba8.js');

/* Files that may legitimately consume her will. The built bundle under DISTRIBUTION/ is DERIVED
 * from these, so counting it would let a source-level severance hide behind its own build output. */
const CONSUMER_FILES = [
  'Origami.RealityEngine.9.html',
  'Origami.RealityEngine.Panels.html',
  'OrigamiUnderworld.html',
];

/* ── EXTRACTION ────────────────────────────────────────────────────────────────────────────────
 * Reads the `this.sensors = { ... }` / `this.outputs = { ... }` blocks and returns the declared
 * names. Brace-counted rather than regex-terminated: an earlier pass of this audit used a line
 * pattern to find the end of the block, swept the entire file, and reported `backupRoot` and
 * `tarballFile` as sensors. The block ends where its braces balance, and nowhere else. */
function declaredKeys(src, decl) {
  const start = src.indexOf(decl);
  if (start === -1) return [];
  const open = src.indexOf('{', start);
  if (open === -1) return [];
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return [];
  let body = src.slice(open + 1, end);

  /* ⚠ THIS SCAN IS DEPTH-AWARE, NOT LINE-BASED, AND ITS OWN SELFTEST IS WHY.
   *    The first version matched `^\s*name:` per line. That works only because her sensors happen
   *    to be written one per line today — a block reformatted onto a single line would have been
   *    read as ONE sensor and the rest would have vanished from the audit with no error. A gate
   *    that under-counts what it is auditing reports health it never measured, so the shape of the
   *    source must not decide what this sees. Comments are stripped first (a `//` note mentioning
   *    `foo:` is prose, not a declaration), then keys are taken only at brace depth 0 so a nested
   *    object's keys cannot be promoted into the sensor list. */
  body = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const keys = [];
  let nest = 0;
  const re = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:|[{}[\]()]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const tok = m[0];
    if (tok === '{' || tok === '[' || tok === '(') { nest++; continue; }
    if (tok === '}' || tok === ']' || tok === ')') { nest--; continue; }
    if (nest === 0 && m[1]) keys.push(m[1]);
  }
  return keys;
}

/* ── SENSOR SIDE: is anything FEEDING it? ──────────────────────────────────────────────────────
 * ⚠ THIS FUNCTION SHIPPED A FALSE RED AND THE CORRECTION IS WRITTEN HERE RATHER THAN QUIETLY MADE.
 *   The first version matched only the literal token `sensors.NAME`, and reported `corruption` as
 *   SEVERED — declared, never fed, a permanent 0. That was WRONG, and it was reported to Mark as a
 *   headline finding before it was checked. OniBaba8.js binds `const s = this.sensors` and then
 *   writes `s.corruption = Math.max(0, Math.min(1, -this.karma / 100))` every frame; the sensor is
 *   one of the liveliest she has. Found by the peer seat falsifying this gate, confirmed at the
 *   source, conceded.
 *
 *   THE OBVIOUS FIX WAS ALSO WRONG: widening the pattern to accept a bare `s.NAME` would count
 *   `const s = stats[code]` elsewhere in the same file as a sensor feed — a false GREEN traded for
 *   a false RED, which is worse, because a gate that over-reports health is the failure this whole
 *   effort exists to stop. So aliases are RESOLVED, not guessed: only an identifier actually bound
 *   to `this.sensors` counts, and only inside the block where that binding lives.
 *
 *   THE STANDING LIMIT, so nobody reads more into this gate than it can carry: a text scan can see
 *   that a writer EXISTS. It cannot see whether that writer ever RUNS. A feed parked behind a
 *   condition that is never true still reads as "fed" here. Reachability is the runtime probe's
 *   job — `scripts/falsify-onibaba-sensors.js` observes writes actually happening, which is both
 *   alias-blind and reachability-honest. Neither arm is sufficient alone. */
function sensorAliases(src) {
  /* Every identifier bound to `this.sensors`, with the brace-block that binding governs. */
  const aliases = [];
  const bind = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*this\.sensors\b/g;
  let m;
  while ((m = bind.exec(src)) !== null) {
    // Walk back to the opening brace of the enclosing block, then forward to its match.
    let depth = 0, start = -1;
    for (let i = m.index; i >= 0; i--) {
      const c = src[i];
      if (c === '}') depth++;
      else if (c === '{') { if (depth === 0) { start = i; break; } depth--; }
    }
    if (start === -1) continue;
    let d = 0, end = -1;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end === -1) end = src.length;
    aliases.push({ ident: m[1], from: start, to: end });
  }
  return aliases;
}

function sensorWrites(src, name, aliases) {
  // Direct `this.sensors.NAME =` / `+=` / `-=` anywhere. `=` but not `==`/`===`; a read is not a feed.
  const direct = new RegExp('sensors\\.' + name + '\\s*(?:=(?!=)|\\+=|-=)', 'g');
  let n = (src.match(direct) || []).length;
  // Relay-driven indices are written through a DYNAMIC key — `this.sensors[this.COHERENCE_A] = idx` —
  // which a name scan cannot see. Resolve the constant from her source and count that write, or this
  // gate calls a fed sensor severed (it did, 2026-09-17: cognitiveReality "declared but never written").
  for (const m of src.matchAll(/this\.(COHERENCE_[AB])\s*=\s*'([A-Za-z_$][\w$]*)'/g)) {
    if (m[2] !== name) continue;
    const dyn = new RegExp('sensors\\[this\\.' + m[1] + '\\]\\s*(?:=(?!=)|\\+=|-=)', 'g');
    n += (src.match(dyn) || []).length;
  }

  // Aliased `s.NAME = …`, counted ONLY inside the block where `s` is bound to this.sensors.
  for (const a of (aliases || [])) {
    const scoped = src.slice(a.from, a.to);
    const re = new RegExp('(?<![.\\w$])' + a.ident + '\\.' + name + '\\s*(?:=(?!=)|\\+=|-=)', 'g');
    n += (scoped.match(re) || []).length;
  }
  return n;
}

/* ── OUTPUT SIDE: is anything OBEYING it? ─────────────────────────────────────────────────────
 * A line is classified, never merely counted:
 *   READ        — `outputs.NAME`, `.NAME` off a state/output object, or a getter call. A consumer.
 *   DECLARATION — `NAME:` as an object key. This is what a shadow snapshot looks like. NOT a consumer. */
function outputConsumers(name) {
  const reads = [];
  const declarations = [];
  for (const rel of CONSUMER_FILES) {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) continue;
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes(name)) return;
      const isDeclaration = new RegExp('^\\s*' + name + '\\s*:').test(line.trim())
                         || new RegExp('[{,]\\s*' + name + '\\s*:').test(line);
      const isRead = new RegExp('outputs\\s*[.\\[][\'"]?' + name).test(line)
                  || new RegExp('\\.' + name + '\\s*(?:[!=<>)+*\\/,;]|$)').test(line);
      const rec = { file: rel, line: i + 1, text: line.trim().slice(0, 120) };
      if (isRead && !isDeclaration) reads.push(rec);
      else if (isDeclaration) declarations.push(rec);
    });
  }
  return { reads, declarations };
}

function audit(src) {
  const sensors = declaredKeys(src, 'this.sensors');
  const outputs = declaredKeys(src, 'this.outputs');

  // ⚠ VACUOUS GUARD — see the header. An extraction that found nothing must never read as health.
  if (sensors.length === 0 || outputs.length === 0) {
    console.error('⛔ INSTRUMENT BROKEN: extraction found ' + sensors.length + ' sensors and ' +
                  outputs.length + ' outputs. A zero here means this gate could not read her, ' +
                  'NOT that she is healthy. Refusing to report a verdict.');
    process.exit(2);
  }

  const severed = [];
  const aliases = sensorAliases(src);
  console.log('═══ SENSORS (afferent — the world into her) ═══');
  if (aliases.length) {
    console.log('  (resolved alias' + (aliases.length > 1 ? 'es' : '') + ' bound to this.sensors: ' +
                aliases.map(a => a.ident).join(', ') + ' — writes through these count as feeds)');
  }
  // The reserved field is a canary: her accessor journals ANY write to it as tamper, and her own verifier
  // grades it 'reserved', not 'never-stimulated'. Zero feeds is its correct state. Resolved from source.
  const reserved = (src.match(/_RESERVED_FIELD\s*=\s*'([A-Za-z_$][\w$]*)'/) || [])[1] || null;
  for (const s of sensors) {
    const w = sensorWrites(src, s, aliases);
    if (s === reserved) { console.log('  ◇ ' + s.padEnd(16) + 'reserved canary — a write here is tamper, so 0 feeds is correct'); continue; }
    const ok = w > 0;
    if (!ok) severed.push({ kind: 'sensor', name: s, why: 'declared but never written — reads a permanent 0' });
    console.log('  ' + (ok ? '✓' : '⛔') + ' ' + s.padEnd(16) + 'feeds: ' + w);
  }

  console.log('\n═══ OUTPUTS (efferent — her will into the game) ═══');
  for (const o of outputs) {
    const { reads, declarations } = outputConsumers(o);
    const ok = reads.length > 0;
    if (!ok) {
      severed.push({
        kind: 'output', name: o,
        why: declarations.length
          ? 'no consumer reads it; it appears ONLY as a declared key in ' + declarations.length +
            ' place(s) — a shadow that looks like a consumer and obeys nothing'
          : 'no reference anywhere in the consumer files'
      });
    }
    console.log('  ' + (ok ? '✓' : '⛔') + ' ' + o.padEnd(16) +
                'consumers: ' + reads.length + '   (declaration-only mentions: ' + declarations.length + ')');
    for (const r of reads.slice(0, 2)) console.log('        read  ' + r.file + ':' + r.line + '  ' + r.text);
    if (!ok) for (const d of declarations.slice(0, 2)) console.log('        SHADOW ' + d.file + ':' + d.line + '  ' + d.text);
  }

  return { sensors, outputs, severed };
}

/* ── SELFTEST: the gate must be shown going RED on purpose ────────────────────────────────────
 * A green result is worth nothing until the same code has been made to fail against a fixture whose
 * defect is known. Two fixtures: one with a fed sensor, one with a sensor nothing writes. */
function selftest() {
  const fedSrc = `
    this.sensors = { alpha: 0, beta: 0 };
    this.outputs = { gamma: 0 };
    tick() { this.sensors.alpha = 1; this.sensors.beta += 2; }
  `;
  const starvedSrc = `
    this.sensors = { alpha: 0, beta: 0 };
    this.outputs = { gamma: 0 };
    tick() { this.sensors.alpha = 1; }
  `;
  let fails = 0;

  const fedKeys = declaredKeys(fedSrc, 'this.sensors');
  if (fedKeys.length !== 2) { console.error('SELFTEST FAIL: expected 2 sensors, got ' + fedKeys.length); fails++; }
  else console.log('  ✓ extraction finds exactly the declared sensors (2) even on ONE line');

  // Multi-line is the shape she actually uses today — both must read the same.
  const multiline = declaredKeys('this.sensors = {\n  alpha: 0,\n  beta: 0,\n};', 'this.sensors');
  if (multiline.length !== 2) { console.error('SELFTEST FAIL: multi-line block gave ' + multiline.length); fails++; }
  else console.log('  ✓ one-per-line and single-line blocks agree');

  // A nested object's keys are not sensors, and a comment mentioning `x:` is prose.
  const nested = declaredKeys('this.sensors = { alpha: 0, nest: { inner: 1, deeper: 2 }, /* note: k: 1 */ beta: 0 };', 'this.sensors');
  if (nested.join(',') !== 'alpha,nest,beta') {
    console.error('SELFTEST FAIL: nested/comment keys leaked — got [' + nested.join(',') + ']'); fails++;
  } else console.log('  ✓ nested keys and comment text are not promoted into the sensor list');

  if (sensorWrites(fedSrc, 'beta') !== 1) { console.error('SELFTEST FAIL: fed sensor read as unfed'); fails++; }
  else console.log('  ✓ a fed sensor reads as fed');

  if (sensorWrites(starvedSrc, 'beta') !== 0) { console.error('SELFTEST FAIL: starved sensor read as fed'); fails++; }
  else console.log('  ✓ a starved sensor reads as SEVERED (the gate goes red on purpose)');

  // A read must not be mistaken for a feed.
  if (sensorWrites('if (this.sensors.beta === 1) {}', 'beta') !== 0) {
    console.error('SELFTEST FAIL: a comparison was counted as a feed'); fails++;
  } else console.log('  ✓ a comparison (===) is not counted as a feed');

  /* ── THE ALIAS REGRESSION. This gate reported `corruption` SEVERED when it is written every
   *    frame through `const s = this.sensors`. These three cases lock that shut: the alias must
   *    count, an UNRELATED binding of the same name must not, and the alias must not leak out of
   *    its own block. Losing any of them puts the false RED (or a worse false GREEN) straight back. */
  const aliasSrc = 'tick() { const s = this.sensors; s.corruption = 1; }';
  const aliasFound = sensorAliases(aliasSrc);
  if (sensorWrites(aliasSrc, 'corruption', aliasFound) !== 1) {
    console.error('SELFTEST FAIL: alias write not counted — the false RED is back'); fails++;
  } else console.log('  ✓ a write through `const s = this.sensors` COUNTS as a feed');

  // The exact false-GREEN trap the peer seat warned about: `s` bound to something else entirely.
  const decoySrc = 'report() { const s = stats[code]; s.corruption = 1; }';
  if (sensorWrites(decoySrc, 'corruption', sensorAliases(decoySrc)) !== 0) {
    console.error('SELFTEST FAIL: an unrelated `s` was counted as a sensor feed'); fails++;
  } else console.log('  ✓ an unrelated `const s = stats[code]` is NOT counted (no false GREEN)');

  // A binding in one function must not license a write in another.
  const scopeSrc = 'a() { const s = this.sensors; s.alpha = 1; }\nb() { s.corruption = 1; }';
  if (sensorWrites(scopeSrc, 'corruption', sensorAliases(scopeSrc)) !== 0) {
    console.error('SELFTEST FAIL: alias leaked outside its binding block'); fails++;
  } else console.log('  ✓ an alias does not leak past the block it was bound in');

  if (declaredKeys('', 'this.sensors').length !== 0) { console.error('SELFTEST FAIL: empty source yielded keys'); fails++; }
  else console.log('  ✓ empty source yields zero keys (which the vacuous guard turns into exit 2)');

  console.log(fails === 0 ? '\nSELFTEST PASS' : '\nSELFTEST FAILED (' + fails + ')');
  process.exit(fails === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();

  if (!fs.existsSync(ONI)) {
    console.error('⛔ INSTRUMENT BROKEN: cannot find ' + ONI);
    process.exit(2);
  }
  const src = fs.readFileSync(ONI, 'utf8');
  console.log('ONI-BABA ARTERY GATE — js/v8/OniBaba8.js\n');
  const { sensors, outputs, severed } = audit(src);

  console.log('\n═══ VERDICT ═══');
  console.log('  declared: ' + sensors.length + ' sensors, ' + outputs.length + ' outputs');
  if (severed.length === 0) {
    console.log('  ✓ every declared nerve is connected.');
    process.exit(0);
  }
  console.log('  ⛔ SEVERED ARTERIES: ' + severed.length);
  for (const s of severed) console.log('     · ' + s.kind + ' ' + s.name + ' — ' + s.why);
  process.exit(1);
}

main();
