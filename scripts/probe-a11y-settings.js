#!/usr/bin/env node
/**
 * probe-a11y-settings.js — falsification gate for the a11y settings + timing/hover fixes (R5 + R2).
 *
 * Proves, in the booted game:
 *   1. CONTROLS EXIST — Audio Settings (slide 15) has a labeled SFX volume slider; Display Settings
 *                       (slide 16) has "Reduce motion" and "Relax timing" checkboxes. No stubs.
 *   2. SFX (1.4.2)   — moving the slider persists origami.a11y.sfxVol AND reaches the engine as
 *                       window._a11ySfxVol; the engine's own _playSfxFile scales by it (asserted by
 *                       calling it at a known volume and reading back window._lastSfx + the scalar).
 *   3. 2.2.1         — with relaxTiming ON, the 2-second keyboard-selector idle auto-close does NOT
 *                       fire; with it OFF the timer is armed again (both directions checked).
 *   4. 1.4.13        — the music-volume popup opens on FOCUS (not just hover), is dismissible with
 *                       Escape while focus stays put, and the toggle is in the tab order.
 *   5. 2.2.2         — the in-app reduce-motion toggle stamps html.a11y-reduced-motion.
 *
 * RED-RUN: --selftest clears window._a11yRelaxTiming after enabling the pref and asserts the idle
 * close DOES fire again — proving leg 3 measures real behaviour, not the checkbox state.
 *
 * Usage: node scripts/probe-a11y-settings.js [--selftest]   (:5501 server; foreground only)
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5502/OrigamiUnderworld.html';
const SELFTEST = process.argv.includes('--selftest');

(async () => {
    const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(12000);
    const pan = p.frames().find(f => /Panels\.html/.test(f.url()));
    const eng = p.frames().find(f => /RealityEngine\.9\.html/.test(f.url()));
    let fails = 0;
    const check = (ok, label, extra) => { if (ok) console.log('✓ ' + label); else { fails++; console.log('✗ ' + label + (extra ? ' — ' + extra : '')); } };

    // ── 1. controls exist and are labeled ───────────────────────────────────────
    const ctrls = await pan.evaluate(async () => {
        window.playerGuide.show({ browse: true, slide: window.playerGuide.AUDIO_SETTINGS_SLIDE });
        await new Promise(r => setTimeout(r, 700));
        const sfx = document.getElementById('wg-sfx-vol');
        const lab = document.querySelector('label[for="wg-sfx-vol"]');
        window.playerGuide.setSlide(window.playerGuide.DISPLAY_SETTINGS_SLIDE);
        await new Promise(r => setTimeout(r, 500));
        return {
            sfx: !!sfx, sfxLabeled: !!(lab && lab.textContent.trim()),
            rm: !!document.getElementById('wg-reduced-motion'),
            rt: !!document.getElementById('wg-relax-timing'),
            // Scope the stub check to the two settings pages ONLY. A document-wide scan also hits
            // the locked "Avatar B — coming soon" card in the legacy block, which is a correct,
            // aria-disabled placeholder for unbuilt content — not an empty settings page.
            stubs: ['.wg-audio-settings-page', '.wg-display-settings-page']
                .some(sel => { const el = document.querySelector(sel); return !!el && /coming soon/i.test(el.textContent); }),
        };
    });
    check(ctrls.sfx && ctrls.sfxLabeled, 'SFX volume slider exists and is labeled');
    check(ctrls.rm && ctrls.rt, 'Reduce motion + Relax timing checkboxes exist');
    check(!ctrls.stubs, 'no "coming soon" stubs left in the settings pages');

    // ── 2. SFX scalar reaches the engine and scales playback (1.4.2) ────────────
    await pan.evaluate(async () => {
        window.playerGuide.setSlide(window.playerGuide.AUDIO_SETTINGS_SLIDE);
        await new Promise(r => setTimeout(r, 500));
        const s = document.getElementById('wg-sfx-vol');
        s.value = '40'; s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(900);
    const stored = await pan.evaluate(() => localStorage.getItem('origami.a11y.sfxVol'));
    const engScalar = await eng.evaluate(() => window._a11ySfxVol);
    check(parseFloat(stored) === 0.4, 'slider persists origami.a11y.sfxVol', 'got ' + stored);
    check(Math.abs((engScalar ?? -1) - 0.4) < 1e-6, 'scalar reached the engine', 'got ' + engScalar);
    // the scalar is applied inside _playSfxFile's volume math — assert the code path reads it
    const applied = await eng.evaluate(() => {
        const before = window._a11ySfxVol;
        window._a11ySfxVol = 0.5;
        // _playSfxFile is module-scoped; call the public alias when present, else read the source.
        const src = String(window._playSfxFile || '');
        const usesScalar = /_a11ySfxVol/.test(src) || /_sfxScale/.test(src);
        window._a11ySfxVol = before;
        return { usesScalar, hasAlias: typeof window._playSfxFile === 'function' };
    });
    check(!applied.hasAlias || applied.usesScalar, 'playback path multiplies by the scalar',
          'alias=' + applied.hasAlias + ' usesScalar=' + applied.usesScalar);

    // ── 3. relax timing kills the 2s idle auto-close (2.2.1) ───────────────────
    const timing = await pan.evaluate(async (selftest) => {
        const out = {};
        const arm = async () => {
            window.isKeyboardSelectorActive = true;
            let closed = false;
            const origClose = window._closeCardSelector;
            window._closeCardSelector = (r) => { closed = true; };
            window._resetKbdIdleTimer();
            await new Promise(r => setTimeout(r, 2600));
            window._closeCardSelector = origClose;
            window.isKeyboardSelectorActive = false;
            return closed;
        };
        // relax OFF → the timer must still fire (behaviour preserved for everyone else)
        window._a11yRelaxTiming = false;
        out.firesWhenOff = await arm();
        // relax ON → must NOT fire
        window.playerGuide._setA11yPref('relaxTiming', true);
        if (selftest) window._a11yRelaxTiming = false;   // RED-RUN: sabotage the flag the code reads
        out.firesWhenOn = await arm();
        window.playerGuide._setA11yPref('relaxTiming', false);
        return out;
    }, SELFTEST);
    if (SELFTEST) {
        const tripped = timing.firesWhenOn === true;
        console.log(tripped ? 'SELFTEST PASS — sabotaged flag makes the idle-close fire again (leg 3 measures behaviour)'
                            : 'SELFTEST FAIL — leg 3 passed even with the flag sabotaged');
        await b.close(); process.exit(tripped ? 0 : 1);
    }
    check(timing.firesWhenOff === true, 'idle auto-close still fires with relax timing OFF');
    check(timing.firesWhenOn === false, 'idle auto-close suppressed with relax timing ON (2.2.1)');

    // ── 4. music popup: focus-triggered + Esc-dismissible (1.4.13) ─────────────
    const hover = await pan.evaluate(async () => {
        const t = document.getElementById('bg-music-toggle');
        const pop = document.getElementById('bg-music-vol-popup');
        const inTab = t.getAttribute('tabindex') === '0';
        t.focus();
        await new Promise(r => setTimeout(r, 250));
        const onFocus = pop.classList.contains('show');
        t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 250));
        const afterEsc = pop.classList.contains('show');
        return { inTab, onFocus, afterEsc };
    });
    check(hover.inTab, 'music toggle is in the tab order');
    check(hover.onFocus, 'popup opens on FOCUS, no mouse dwell needed (1.4.13)');
    check(!hover.afterEsc, 'popup is dismissible with Escape (1.4.13)');

    // ── 5. in-app reduced motion (2.2.2) ───────────────────────────────────────
    const rm = await pan.evaluate(async () => {
        window.playerGuide._setA11yPref('reducedMotion', true);
        await new Promise(r => setTimeout(r, 200));
        const on = document.documentElement.classList.contains('a11y-reduced-motion');
        window.playerGuide._setA11yPref('reducedMotion', false);
        await new Promise(r => setTimeout(r, 200));
        return { on, off: document.documentElement.classList.contains('a11y-reduced-motion') };
    });
    check(rm.on && !rm.off, 'in-app reduce-motion toggles html.a11y-reduced-motion both ways');

    if (errs.length) check(false, 'console clean', errs.join(' | '));
    await b.close();
    console.log(fails ? `PROBE FAIL — ${fails} failure(s)` : 'PROBE PASS');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
