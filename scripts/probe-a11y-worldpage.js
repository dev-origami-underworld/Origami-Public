#!/usr/bin/env node
/**
 * probe-a11y-worldpage.js — falsification gate for the guidebook WORLD page (playbook P4).
 *
 * Proves, in the booted game:
 *   1. F1        — pressing F1 (real keydown in the panels frame) opens the guide ON the World slide.
 *   2. DATA      — the rooms list renders from live A11Y_RESULT data (rooms > 0, current room first,
 *                  marked "you are here"); selecting a room renders its objects with action buttons.
 *   3. ONE RAIL  — clicking an action button posts an FPV_CHAT_COMMAND whose {type,cmd,targetName,lang}
 *                  DEEP-EQUALS the payload the chat box produces for the equivalent typed command.
 *                  This is the conforming-alternate "equally complete" guarantee, mechanized.
 *   4. A11Y      — the slide passes the same axe A/AA sweep as every other guide state.
 *
 * RED-RUN: --selftest severs the data feed (stubs _queryWorld to a no-op, so no A11Y_RESULT ever
 * arrives) and asserts the rooms list stays empty — proving the page renders from LIVE data only.
 *
 * Usage: node scripts/probe-a11y-worldpage.js [--selftest]   (:5501 server; foreground only)
 */
const { chromium } = require('playwright');
const axeSource = require('axe-core').source;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const SELFTEST = process.argv.includes('--selftest');

(async () => {
    const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(12000);
    const pan = p.frames().find(f => /Panels\.html/.test(f.url()));
    await pan.evaluate(() => { try { window.playerGuide.hide(); } catch (e) {} });
    await sleep(600);
    let fails = 0;
    const check = (ok, label, extra) => { if (ok) console.log('✓ ' + label); else { fails++; console.log('✗ ' + label + (extra ? ' — ' + extra : '')); } };

    if (SELFTEST) {
        // Sever the feed BEFORE F1 — stub the query out. (A capture-phase message interceptor
        // CANNOT work here: postMessage targets window itself, where listeners fire in
        // registration order and the guide's predates ours.) No query → no A11Y_RESULT → the
        // page must render empty, proving it draws from live data only.
        await pan.evaluate(() => { window.playerGuide._queryWorld = () => {}; });
    }

    // ── 1. F1 opens the guide on the World slide ────────────────────────────────
    await pan.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
    });
    await sleep(1800);
    const state = await pan.evaluate(() => ({
        open: !!document.getElementById('welcome-guide-overlay') &&
              getComputedStyle(document.getElementById('welcome-guide-overlay')).display !== 'none',
        slide: window.playerGuide && window.playerGuide.currentSlide,
        worldSlide: window.playerGuide && window.playerGuide.WORLD_SLIDE,
        rooms: document.querySelectorAll('#wg-world-rooms button[data-world-room]').length,
        hereMarked: !!document.querySelector('#wg-world-rooms .wg-world-sel'),
    }));
    check(state.open, 'F1 opens the guide');
    check(state.slide === state.worldSlide, `guide lands on World slide (${state.slide}/${state.worldSlide})`);

    if (SELFTEST) {
        const silent = state.rooms === 0;
        console.log(silent ? 'SELFTEST PASS — severed feed leaves the page empty (renders from LIVE data only)'
                           : `SELFTEST FAIL — ${state.rooms} rooms rendered with the feed severed`);
        await b.close(); process.exit(silent ? 0 : 1);
    }
    check(state.rooms > 0, `rooms list rendered from live data (${state.rooms} rooms)`);
    check(state.hereMarked, 'current room selected/marked');

    // ── 2+3. click a room, then deep-equal an action button's payload vs typed ──
    const rail = await pan.evaluate(() => new Promise(resolve => {
        const posted = [];
        const orig = window.parent.postMessage.bind(window.parent);
        window.parent.postMessage = (m, ...a) => { if (m && m.type === 'FPV_CHAT_COMMAND') posted.push({ type: m.type, cmd: m.cmd, targetName: m.targetName, lang: m.lang }); return orig(m, ...a); };
        // pick the first LOOK button in the objects pane
        const rooms = document.querySelectorAll('#wg-world-rooms button[data-world-room]');
        if (rooms[0]) rooms[0].click();
        setTimeout(() => {
            const btn = document.querySelector('#wg-world-objects button[data-world-cmd="LOOK"]');
            if (!btn) { window.parent.postMessage = orig; resolve({ error: 'no LOOK button in objects pane', objects: document.querySelectorAll('#wg-world-objects .wg-world-obj').length }); return; }
            const target = btn.dataset.worldTarget;
            btn.click();                                            // button leg
            const fromButton = posted[posted.length - 1] || null;
            // typed leg — same verb through the real grammar path
            const g = window.A11yGrammar.detect('look at the ' + target);
            const isJa = (window.currentLang || localStorage.getItem('origami_lang') || 'en') === 'ja';
            const fromTyped = g ? { type: 'FPV_CHAT_COMMAND', cmd: g.cmd, targetName: g.targetName, lang: isJa ? 'ja' : 'en' } : null;
            window.parent.postMessage = orig;
            resolve({ target, fromButton, fromTyped });
        }, 700);
    }));
    if (rail.error) check(false, 'objects pane', rail.error + ' (objects=' + rail.objects + ')');
    else {
        check(!!rail.fromButton, 'action button posted FPV_CHAT_COMMAND');
        const eq = JSON.stringify(rail.fromButton) === JSON.stringify(rail.fromTyped);
        check(eq, 'ONE RAIL: button payload deep-equals typed payload',
              JSON.stringify(rail.fromButton) + ' vs ' + JSON.stringify(rail.fromTyped));
    }

    // ── 4. axe on the World state ───────────────────────────────────────────────
    await pan.addScriptTag({ content: axeSource });
    const axe = await pan.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, iframes: false }));
    const serious = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
        // target-size on the mini-winamp/guide dots is the KNOWN R2 deferral (register 2.5.8) — the
        // World page must not ADD to it; anything else serious fails here.
        .filter(v => v.id !== 'target-size' || v.nodes.some(n => /wg-world/.test(n.target.join(' '))));
    check(serious.length === 0, 'axe A/AA on World state (known R2 target-size deferral excluded)',
          serious.map(v => v.id + '×' + v.nodes.length).join(', '));

    if (errs.length) check(false, 'console clean', errs.join(' | '));
    await b.close();
    console.log(fails ? `PROBE FAIL — ${fails} failure(s)` : 'PROBE PASS');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
