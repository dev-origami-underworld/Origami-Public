#!/usr/bin/env node
/**
 * probe-a11y-axe.js — WCAG 2.2 A+AA automated sweep, per frame × per state.
 *
 * Part of the falsification harness in plans/WCAG_22_AA_PLAYBOOK.md §4: no conformance
 * claim without a probe that can go red. This probe runs @axe-core/playwright against
 * the SHELL, the PANELS iframe, and the ENGINE iframe document, in each reachable UI
 * state, and fails on any serious/critical violation of WCAG 2.2 A/AA rules.
 *
 * States swept (each added as the guidebook interface grows):
 *   boot        — game booted, HUD idle
 *   guide-open  — PlayerGuide overlay shown (dialog semantics, focus trap territory)
 *
 * RED-RUN PROOF (per throttle-gate law — prove the guard trips before trusting green):
 *   node scripts/probe-a11y-axe.js --selftest
 *   injects a deliberately broken control (<div onclick> with no role, unlabeled input)
 *   into the panels document and asserts the sweep DOES fail. A selftest that passes
 *   green is itself a probe failure.
 *
 * Usage: node scripts/probe-a11y-axe.js [--selftest] [--json]
 *   Needs the :5501 dev server (same as every probe). Foreground only — never
 *   background a Playwright probe while Mark is playing (memory law).
 */
const { chromium } = require('playwright');
// Raw axe-core injected per frame, NOT @axe-core/playwright's AxeBuilder — the builder's
// cross-frame orchestration throws "Please use browser.newContext()" against this game's
// live-mutating iframes (PiP/solitaire frames attach and detach mid-analysis). Injecting
// the source with addScriptTag and running {iframes:false} inside each frame is sturdier
// AND attributes every violation to its exact frame.
const axeSource = require('axe-core').source;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const SELFTEST = process.argv.includes('--selftest');
const AS_JSON = process.argv.includes('--json');

// WCAG 2.2 A + AA only — AAA and best-practice rules are tracked separately in the
// conformance doc, and mixing them in here would make "red" unactionable.
// ⭐ AAA TAGS ADDED 2026-09-03 (Mark: "try for AAA"). axe ships its AAA rules OFF BY DEFAULT, so
// until this line changed the sweep was structurally incapable of reporting a AAA violation — and it
// was green, under a welcome cover that claims "WCAG 2.2/AAA". A scanner that cannot see the level
// you claim is not evidence for that level; it is evidence about the scanner.
// ⚠ EXPECT THIS TO GO RED ON ARRIVAL, and expect that to be the FINDING rather than a problem with
//   the change. 1.4.6's 7:1 alone will light up wherever the current palette sits at AA's 4.5:1.
// ⛔⛔ AND THE TAG LIST IS EXACTLY THIS, BECAUSE I CHECKED WHAT axe ACTUALLY SHIPS RATHER THAN WHAT
//   THE PATTERN SUGGESTS. My first draft of this line also added `wcag21aaa`, which reads as
//   coverage and matches NOTHING. Enumerated from the installed axe-core 4.13.0, the complete set of
//   WCAG tags is: wcag2a · wcag2a-obsolete · wcag2aa · wcag2aaa · wcag21a · wcag21aa · wcag22aa ·
//   wcag1412. **There is no `wcag21aaa` and no `wcag22aaa`.**
//   ⭐ SO THE MACHINE LAYER'S AAA REACH IS WCAG **2.0** AAA AND NOTHING MORE. Every AAA criterion
//   added in 2.1 and 2.2 — 2.4.13 Focus Appearance, 3.3.9, 2.5.6 — is invisible to this sweep and is
//   MANUAL-ONLY, permanently. That is the concrete version of the programme's standing warning: a
//   green axe run is not evidence of AAA, and now we can say precisely how much of AAA it never saw.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Impact levels that fail the gate. minor/moderate are reported but not fatal (yet —
// tightening to all-impacts is the P6 exit criterion).
const FATAL = new Set(['serious', 'critical']);

async function sweep(frame, label, results) {
    const injected = await frame.evaluate(() => !!window.axe).catch(() => false);
    if (!injected) await frame.addScriptTag({ content: axeSource });
    const r = await frame.evaluate(
        (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, iframes: false }),
        TAGS
    );
    // ⚠ RULE 16 — THE PRINT BOUNDARY, retrofitted. This sweep summarised its violations and kept
    //   NOTHING, so a run that found a contrast failure could tell you the rule id and not the two
    //   colours or the ratio — the expensive part of the measurement was computed by axe, printed
    //   as a headline, and discarded. Every violation node now lands in .probe-shots as raw JSON
    //   before any summary line is written; the summary stays exactly as it was.
    try {
      const _fs = require('fs'), _p = require('path');
      const _dir = _p.join(__dirname, '..', '.probe-shots');
      _fs.mkdirSync(_dir, { recursive: true });
      const _f = _p.join(_dir, 'a11y-axe-raw.json');
      const _prev = _fs.existsSync(_f) ? JSON.parse(_fs.readFileSync(_f, 'utf8')) : {};
      _prev[label] = r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary, any: n.any })) }));
      _fs.writeFileSync(_f, JSON.stringify(_prev, null, 1) + '\n');
    } catch (_) {}
    for (const v of r.violations) {
        results.push({
            state: label,
            rule: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map(n => n.target.join(' ')),   // ALL nodes: truncating here could hide a real violation behind an excepted one
            count: v.nodes.length,
        });
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(12000); // engine settle — same discipline as every probe

    const panels = page.frames().find(f => /Panels\.html/.test(f.url()));
    const engine = page.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!panels || !engine) {
        console.error('FAIL: could not resolve panels/engine frames');
        process.exit(1);
    }

    if (SELFTEST) {
        // Deliberate break: this MUST make the sweep go red, or the guard is blind.
        await panels.evaluate(() => {
            const d = document.createElement('div');
            d.id = '__axe_selftest__';
            d.setAttribute('onclick', 'void 0');
            d.innerHTML = '<input type="text" placeholder="unlabeled">'
                        + '<img src="favicon.ico">';
            document.body.appendChild(d);
        });
    }

    const results = [];

    // ── state: boot — each core frame swept in place, attributed by name ────────
    await sweep(page.mainFrame(), 'boot/shell', results);
    await sweep(panels, 'boot/panels', results);
    await sweep(engine, 'boot/engine', results);

    // ── state: guide-open ───────────────────────────────────────────────────────
    const guideOpened = await panels.evaluate(() => {
        try {
            if (window.playerGuide && typeof window.playerGuide.show === 'function') {
                window.playerGuide.show({ browse: true });
                return true;
            }
        } catch (e) { /* fall through */ }
        return false;
    });
    if (guideOpened) {
        await sleep(1500); // guide inject + slide render
        await sweep(panels, 'guide-open', results);
        await panels.evaluate(() => { try { window.playerGuide.hide(); } catch (e) {} });
    } else {
        results.push({ state: 'guide-open', rule: '__probe__', impact: 'serious',
                       help: 'playerGuide.show() unavailable — guide state NOT swept', nodes: [], count: 0 });
    }

    await browser.close();

    // NO EXCEPTIONS. The 2.5.8 carve-out the page dots once needed died with the looping dot
    // window (Mark 2026-08-14) — seven 24px targets instead of eighteen 11px ones. Every
    // serious/critical violation counts; if a future change reintroduces an undersized target,
    // this gate goes red rather than excusing it.
    const fatal = results.filter(v => FATAL.has(v.impact));
    const minor = results.filter(v => !FATAL.has(v.impact));

    if (AS_JSON) {
        console.log(JSON.stringify({ fatal, minor, pageErrors: errs }, null, 2));
    } else {
        for (const v of fatal) console.log(`✗ [${v.impact}] ${v.state} ${v.rule} ×${v.count} — ${v.help}\n    ${v.nodes.slice(0, 5).join('\n    ')}`);
        for (const v of minor) console.log(`~ [${v.impact}] ${v.state} ${v.rule} ×${v.count} — ${v.help}`);
        if (errs.length) console.log(`⚠ pageerrors: ${errs.join(' | ')}`);
    }

    if (SELFTEST) {
        const tripped = fatal.some(v => v.nodes.some(n => /__axe_selftest__|#__axe_selftest__/.test(n)) ||
                                        ['label', 'image-alt', 'input-missing-label'].includes(v.rule));
        if (tripped) { console.log('SELFTEST PASS — deliberate break tripped the sweep (guard is live)'); process.exit(0); }
        console.error('SELFTEST FAIL — deliberate break did NOT trip the sweep; the guard is blind');
        process.exit(1);
    }

    if (errs.length) { console.error(`FAIL: ${errs.length} pageerror(s)`); process.exit(1); }
    if (fatal.length) { console.error(`FAIL: ${fatal.length} serious/critical axe violation(s)`); process.exit(1); }
    console.log(`PASS — 0 serious/critical (${minor.length} minor/moderate tracked, states: boot shell/panels/engine + guide-open)`);
    process.exit(0);
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
