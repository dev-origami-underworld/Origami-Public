#!/usr/bin/env node
/**
 * gate-inline-parse.js — EVERY INLINE <script> IN THE LIVE HTML MUST PARSE.
 *
 * WHY THIS EXISTS (2026-09-18, Mark: "make sure Onibaba sensors can pick this up in future please").
 * A duplicate `const _mc` / `const _el` pair sat in one block scope in NewOrigami.Panels.html
 * (:10677-10678 against :10691-10692). A duplicate lexical declaration is a SyntaxError, and a
 * SyntaxError inside <script type="module"> discards THE ENTIRE MODULE before one statement runs.
 * That module spans ~:9153-:25006 and contains BOTH `window.playerGuide = new PlayerGuide()` and the
 * PIP_FRAME handler — so the guidebook never existed and PiP never drew. Two unrelated features dead,
 * nothing red, no console line anybody was watching. Mark found it by playing. Fixed in 8d7ad3f6.
 *
 * ⚠ THE TRAP THAT HID IT FOR HOURS — the whole reason this file is not a three-liner.
 * A checker that parses a `type="module"` block AS A CLASSIC SCRIPT fails immediately on `import`
 * ("Cannot use import statement outside a module") and on top-level `await`. Those look like
 * false positives, because they ARE false positives — so you dismiss them, and the parser NEVER
 * REACHES the real error further down the block. I did exactly that earlier the same night and
 * reported the file clean. A wrong-mode parse does not merely give a wrong answer; it HIDES the
 * right one. Modules are therefore checked as modules here, and that is not a detail.
 *
 * SCOPE — the live files only, per the DEAD-CODE LAW (Mark 2026-06-03): the live engine is the
 * inline JS inside NewOrigami.Engine9.html. js/engine/*.js is abandoned pre-port source; parsing it
 * would report failures nobody can act on.
 *
 * RUN:  node scripts/gate-inline-parse.js            (wired into `npm run smoke`)
 *       node scripts/gate-inline-parse.js --selftest (proves the gate can FAIL — see below)
 *
 * The self-test is not ceremony. A gate that cannot fail is the "vacuous check" this project has
 * been bitten by repeatedly: it injects a real duplicate-const into a COPY of Panels and asserts
 * this gate rejects it, then asserts the untouched tree passes. Red proven, then green proven.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['OrigamiUnderworld.html', 'Origami.RealityEngine.9.html', 'Origami.RealityEngine.Panels.html'];

// Blocks that are not JavaScript and must never be handed to the parser.
const NON_JS = /type\s*=\s*["']?(application\/json|application\/ld\+json|text\/template|text\/html|importmap)/i;

function blocksOf(src) {
    const out = [];
    const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(src))) {
        i++;
        const attrs = m[1] || '', body = m[2];
        if (/\bsrc\s*=/i.test(attrs)) continue;      // external file, not ours to parse
        if (NON_JS.test(attrs)) continue;
        // Line number of the <script> tag itself, so a failure points at the real file line.
        const startLine = src.slice(0, m.index).split('\n').length;
        out.push({ n: i, isModule: /type\s*=\s*["']?module/i.test(attrs), body, startLine, attrs: attrs.trim() });
    }
    return out;
}

function checkFile(file, srcOverride) {
    const abs = path.join(ROOT, file);
    const src = srcOverride != null ? srcOverride : fs.readFileSync(abs, 'utf8');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-parse-'));
    const fails = [];
    let checked = 0;
    for (const b of blocksOf(src)) {
        // .mjs vs .js is what selects module vs script parsing in `node --check`. This line IS the gate.
        const f = path.join(tmp, `b${b.n}${b.isModule ? '.mjs' : '.js'}`);
        fs.writeFileSync(f, b.body);
        checked++;
        try {
            cp.execSync(`node --check ${JSON.stringify(f)}`, { stdio: 'pipe' });
        } catch (e) {
            const err = String(e.stderr || e.stdout || e.message);
            // node reports a line WITHIN the block; the block body starts on the line after <script>,
            // so add the offset to hand back a line you can actually open in the editor.
            const lm = err.match(new RegExp(String.raw`b${b.n}\.(?:mjs|js):(\d+)`));
            const inBlock = lm ? parseInt(lm[1], 10) : null;
            const fileLine = inBlock != null ? (b.startLine + inBlock) : null;
            const msg = (err.split('\n').find(l => /^\s*(SyntaxError|ReferenceError|TypeError)/.test(l)) || err.split('\n')[0] || '').trim();
            fails.push({ block: b.n, isModule: b.isModule, attrs: b.attrs, startLine: b.startLine, fileLine, msg });
        }
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return { file, checked, fails };
}

function run(quiet) {
    const results = FILES.map(f => checkFile(f));
    let bad = 0;
    for (const r of results) {
        for (const f of r.fails) {
            bad++;
            if (!quiet) {
                console.error(`✗ ${r.file}:${f.fileLine || f.startLine}  (block #${f.block}, ${f.isModule ? 'MODULE' : 'script'}${f.attrs ? ', ' + f.attrs : ''})`);
                console.error(`    ${f.msg}`);
                if (f.isModule) {
                    console.error(`    ⚠ This block is a MODULE. A SyntaxError here discards the ENTIRE block —`);
                    console.error(`      every function, handler and window.* assignment in it silently never exists.`);
                }
            }
        }
        if (!quiet) console.log(`${r.file}: ${r.checked} inline block(s) parsed, ${r.fails.length} failed`);
    }
    return bad;
}

if (process.argv.includes('--selftest')) {
    // RED: inject a genuine duplicate-const into a copy of the real Panels module and require a failure.
    const panels = fs.readFileSync(path.join(ROOT, 'Origami.RealityEngine.Panels.html'), 'utf8');
    const anchor = 'const _MW = (typeof window._cardStripW === \'number\')';
    const at = panels.indexOf(anchor);
    if (at < 0) {
        console.error('SELFTEST INCONCLUSIVE: anchor line not found — the gate was NOT proven able to fail.');
        console.error('Re-point the anchor at any line inside the Panels module block before trusting this gate.');
        process.exit(2);
    }
    const poisoned = panels.slice(0, at) + 'const _MW = 1; const _MW = 2;\n                ' + panels.slice(at);
    const red = checkFile('Origami.RealityEngine.Panels.html', poisoned);
    if (red.fails.length === 0) {
        console.error('SELFTEST FAILED: a duplicate `const _MW` was injected and the gate still passed.');
        console.error('This gate is VACUOUS — it would not have caught the 2026-09-18 guidebook/PiP outage.');
        process.exit(1);
    }
    console.log(`SELFTEST red  ✓ injected duplicate const → rejected (${red.file}:${red.fails[0].fileLine || red.fails[0].startLine} — ${red.fails[0].msg})`);
    // GREEN: the untouched tree must pass.
    const green = run(true);
    if (green > 0) {
        console.error(`SELFTEST green ✗ the real tree has ${green} failing block(s) — fix those first.`);
        process.exit(1);
    }
    console.log('SELFTEST green ✓ untouched tree parses clean');
    console.log('GATE PROVEN: it fails on a real defect and passes on a clean tree.');
    process.exit(0);
}

const bad = run(false);
if (bad > 0) {
    console.error(`\nINLINE PARSE GATE: FAIL — ${bad} inline block(s) do not parse.`);
    console.error('A module that does not parse takes every feature inside it with it, silently.');
    process.exit(1);
}
console.log('INLINE PARSE GATE: PASS — every inline block in the live HTML parses.');
