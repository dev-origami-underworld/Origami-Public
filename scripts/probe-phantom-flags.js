#!/usr/bin/env node
/*
 * probe-phantom-flags.js — A COMMENT TELLS YOU TO SET A FLAG. DOES ANYTHING READ IT?
 *
 * CLAUDE.md opens with the reason this exists: an AI hit a real bug, disabled a feature, left an
 * inline comment about it, and "that trap cost 20+ hours on the monster silhouette ... it steered
 * every later AI into a dead-end."
 *
 * This finds the same shape mechanically. A comment that says `window._foo = false` is making a
 * PROMISE — that a switch exists and does something. If no line of code ever READS `_foo`, the
 * promise is false, and the next seat spends their afternoon setting a flag that is wired to
 * nothing. Worse, comments like these get treated as evidence that a fix landed, when they are
 * often the plan for a fix that never did.
 *
 * A flag is PHANTOM when it appears only inside comments and never in executable code.
 *
 *   node scripts/probe-phantom-flags.js            # verdict
 *   node scripts/probe-phantom-flags.js --json     # raw rows
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');

const FILES = ['OrigamiUnderworld.html', 'Origami.RealityEngine.9.html', 'Origami.RealityEngine.Panels.html'];
(function walk(d) {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = path.join(d, e.name);
    if (e.isDirectory()) walk(rel); else if (/\.js$/.test(e.name)) FILES.push(rel);
  }
})('js/v8');

// Split a line into (code, comment). Deliberately conservative: a `//` inside a string literal
// would be misread as a comment start, so we only trust `//` that is not preceded by a quote on
// the same line. Over-classifying code as comment would INVENT phantoms; this errs the other way.
function splitComment(L) {
  const i = L.indexOf('//');
  if (i < 0) return [L, ''];
  const before = L.slice(0, i);
  const q = (before.match(/["'`]/g) || []).length;
  if (q % 2 !== 0) return [L, ''];           // odd quotes → the // is inside a string
  return [before, L.slice(i)];
}

// A comment PROMISES a flag by naming it `window._foo`. But code may READ it through any
// accessor — `W()._foo` (Composer.js:452 does exactly this), `win._foo`, `globalThis._foo`,
// `self._foo`, `window['_foo']`, or a bare `_foo` closed over in module scope. Matching only
// `window.` in code invented 114 phantoms on the first run, several of them false: `_musicGapMs`
// is read by `num(W()._musicGapMs, 0)` and is perfectly alive. So the PROMISE is matched narrowly
// (a comment saying `window._foo` really is advertising a window flag) and the READ is matched as
// broadly as possible — ANY non-comment occurrence of the identifier at all. That deliberately
// under-reports: a flag mentioned in dead code still counts as read. Better a phantom missed than
// a live knob called dead, because the second kind of error is what gets a working feature deleted.
const FLAG = /window\.(_[A-Za-z0-9_]{2,})/g;
const ANY  = /\b(_[A-Za-z0-9_]{2,})\b/g;
const inComment = new Map();   // flag -> [{file,line,text}]
const inCode = new Set();
let blockDepth = 0;

for (const f of FILES) {
  let src; try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { continue; }
  const lines = src.split('\n');
  blockDepth = 0;
  lines.forEach((L, i) => {
    const T = L.trim();
    let code = L, cmt = '';
    if (blockDepth > 0) { code = ''; cmt = L; }
    else if (/^(\/\*|<!--)/.test(T)) { code = ''; cmt = L; }
    else ([code, cmt] = splitComment(L));
    if (/^(\/\*|<!--)/.test(T) && !/(\*\/|-->)/.test(T.slice(2))) blockDepth++;
    else if (blockDepth > 0 && /(\*\/|-->)/.test(T)) blockDepth--;

    let m;
    ANY.lastIndex = 0;  while ((m = ANY.exec(code)))  inCode.add(m[1]);   // any accessor, or none
    FLAG.lastIndex = 0; while ((m = FLAG.exec(cmt))) {
      if (!inComment.has(m[1])) inComment.set(m[1], []);
      inComment.get(m[1]).push({ file: f, line: i + 1, text: T.slice(0, 150) });
    }
  });
}

const phantom = [...inComment.entries()]
  .filter(([flag]) => !inCode.has(flag))
  .map(([flag, sites]) => ({ flag, sites }))
  .sort((a, b) => b.sites.length - a.sites.length);

if (JSON_OUT) console.log(JSON.stringify({ scanned: FILES.length, codeFlags: inCode.size, phantom }, null, 2));
else {
  console.log('files scanned      : ' + FILES.length);
  console.log('identifiers in code : ' + inCode.size);
  console.log('PHANTOM flags      : ' + phantom.length + '   (named in a comment, read by nothing)\n');
  for (const p of phantom) {
    console.log('  ✗ window.' + p.flag + '   (' + p.sites.length + ' mention' + (p.sites.length > 1 ? 's' : '') + ')');
    p.sites.slice(0, 2).forEach(s => console.log('      ' + s.file + ':' + s.line + '  ' + s.text));
  }
  console.log('\n' + (inCode.size === 0
    ? '❌ FAIL — zero flags found in code at all. The splitter is broken; this asserted nothing.'
    : phantom.length === 0
      ? 'PASS — every flag a comment names is read somewhere in code.'
      : 'FAIL — ' + phantom.length + ' flag(s) promised by a comment and wired to nothing.'));
}
process.exit((inCode.size > 0 && phantom.length === 0) ? 0 : 1);
