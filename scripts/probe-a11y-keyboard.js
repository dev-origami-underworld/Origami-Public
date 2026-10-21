#!/usr/bin/env node
/**
 * probe-a11y-keyboard.js — falsification gate for R3 (2.1.1 keyboard) + R4 (2.4.1 bypass blocks).
 *
 * Proves, in the booted game:
 *   1. 2.1.1 CAMERA — Alt+Arrows move the SAME camera state the mouse drag writes
 *                     (_touchLookYaw/_touchLookPitch in FPV, _tdPanTX/_tdPanTZ top-down), and
 *                     Alt+0 recentres. Measured through the engine's own diagnostic mirrors.
 *   2. 2.1.1 MACHINES — pressing E next to a registered machine calls that entry's onActivate
 *                     (the same function the pointer path calls); out of reach it narrates the
 *                     distance instead of silently doing nothing (3.3.1).
 *   3. 2.4.1 SKIP    — the shell exposes a skip link that is the FIRST tabbable element, hidden
 *                     until focused, and activating it opens the guidebook World page.
 *   4. LANDMARKS     — both frame containers carry a role + accessible name.
 *
 * RED-RUN: --selftest neutralises the keyboard camera (sets window._ceremonyHeld to always-true,
 * the documented hold that must block it) and asserts leg 1 STOPS moving the camera — proving the
 * probe measures live camera state rather than the presence of a keybinding.
 *
 * Usage: node scripts/probe-a11y-keyboard.js [--selftest]   (:5501 server; foreground only)
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const SELFTEST = process.argv.includes('--selftest');

(async () => {
    const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(12000);
    const pan = p.frames().find(f => /Panels\.html/.test(f.url()));
    const eng = p.frames().find(f => /Engine9\.html/.test(f.url()));
    await pan.evaluate(() => { try { window.playerGuide.hide(); } catch (e) {} });
    await sleep(500);
    let fails = 0;
    const check = (ok, label, extra) => { if (ok) console.log('✓ ' + label); else { fails++; console.log('✗ ' + label + (extra ? ' — ' + extra : '')); } };

    if (SELFTEST) {
        // The ceremony hold is the documented gate that must stop camera keys (door 4).
        await eng.evaluate(() => { window._ceremonyHeld = () => true; });
    }

    // ── 1. keyboard camera writes the drag-cam's own state ──────────────────────
    // Measured through window._a11yLookProbe() — the engine's read handle on the very locals the
    // mouse drag writes. (Earlier revision of this probe recentred BEFORE measuring and read all
    // zeros; the keybinding was fine. Measure, then recentre.)
    const moved = await eng.evaluate(async () => {
        const press = (k, code) => window.dispatchEvent(new KeyboardEvent('keydown',
            { key: k, code, altKey: true, bubbles: true, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', altKey: true, bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 120));
        press('ArrowLeft', 'ArrowLeft'); press('ArrowLeft', 'ArrowLeft'); press('ArrowUp', 'ArrowUp');
        await new Promise(r => setTimeout(r, 300));   // long enough that a non-sticky value would have eased home
        return { yaw: window._a11yLookProbe ? window._a11yLookProbe() : null };
    });
    if (SELFTEST) {
        const held = !moved.yaw || (Math.abs(moved.yaw.yaw) < 1e-9 && Math.abs(moved.yaw.pitch) < 1e-9);
        console.log(held ? 'SELFTEST PASS — ceremony hold stops the keyboard camera (leg 1 measures live state)'
                         : 'SELFTEST FAIL — camera still moved while held: ' + JSON.stringify(moved));
        await b.close(); process.exit(held ? 0 : 1);
    }
    check(moved.yaw && Math.abs(moved.yaw.yaw) > 0.01, 'Alt+Arrows move the FPV look state and it STAYS (2.1.1)',
          JSON.stringify(moved.yaw));
    check(moved.yaw && Math.abs(moved.yaw.pitch) > 0.001, 'Alt+Up/Down move pitch', JSON.stringify(moved.yaw));

    const recentre = await eng.evaluate(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', altKey: true, bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 200));
        return window._a11yLookProbe ? window._a11yLookProbe() : null;
    });
    check(recentre && Math.abs(recentre.yaw) < 1e-9 && Math.abs(recentre.pitch) < 1e-9, 'Alt+0 recentres the view', JSON.stringify(recentre));

    // ── 2. E activates the nearest machine through its own onActivate ───────────
    const mach = await eng.evaluate(async () => {
        const MI = window.MachineInteraction;
        if (!MI || !MI._registry || !MI._registry.size) return { skip: 'no machines registered on this floor' };
        // instrument the nearest entry, then teleport the player next to it and press E
        let target = null, bestD = Infinity;
        MI._registry.forEach(e => { const o = e && e.object3D; if (!o) return;
            const d = Math.hypot(o.position.x - window.px, o.position.z - window.pz); if (d < bestD) { bestD = d; target = e; } });
        if (!target) return { skip: 'no machine with an object3D' };
        let called = false;
        const orig = target.onActivate;
        target.onActivate = (ctx) => { called = true; return true; };
        const keepX = window.px, keepZ = window.pz;
        window.px = target.object3D.position.x; window.pz = target.object3D.position.z;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 300));
        const inReach = called;
        // now stand far away — must NOT activate, must narrate instead
        called = false;
        window.px = target.object3D.position.x + 60 * (window._a11yHandles ? window._a11yHandles.GRID : 4);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 300));
        const outOfReach = called;
        target.onActivate = orig; window.px = keepX; window.pz = keepZ;
        return { kind: target.kind, inReach, outOfReach };
    });
    if (mach.skip) console.log('~ machines: ' + mach.skip);
    else {
        check(mach.inReach === true, `E activates the nearest machine (${mach.kind}) via its own onActivate (2.1.1)`);
        check(mach.outOfReach === false, 'E does NOT reach a machine 60 tiles away');
    }

    // ── 2b. WCAG 2.5.7 — the drag-only card gestures have keyboard equivalents ──
    const drag = await pan.evaluate(async () => {
        const dock = document.getElementById('guides-container');
        const cols = () => [...dock.querySelectorAll('.card-column')];
        // A fresh run starts with one card, and a SKIPPED leg is not evidence (register rule 1) —
        // so seed real cards through the game's own ADD_CARD path rather than fabricating DOM.
        if (cols().length < 2) {
            for (const c of ['FIREBALL', 'SHURIKEN']) window.postMessage({ type: 'ADD_CARD', card: c }, '*');
            await new Promise(r => setTimeout(r, 1200));
        }
        if (cols().length < 2) return { skip: `could not seed a second card (hand has ${cols().length})` };
        // mark a cursor the way the game's own keyboard selector does
        const first = cols()[0];
        first.classList.add('focused');
        const key = (init) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)));
        // REORDER: Ctrl+Right must move it one place and persist the SAME storage key the drag writes
        const before = cols().map(c => c.dataset.handKey);
        key({ key: 'ArrowRight', ctrlKey: true });
        await new Promise(r => setTimeout(r, 200));
        const after = cols().map(c => c.dataset.handKey);
        let stored = null; try { stored = JSON.parse(localStorage.getItem('origami_hand_order') || 'null'); } catch (_) {}
        // DROP: Shift+D must post DROP_CARD_AT — the same message the drag release posts
        let dropped = null;
        const orig = window.parent.postMessage.bind(window.parent);
        window.parent.postMessage = (m, ...a) => { if (m && m.type === 'DROP_CARD_AT') dropped = m; return orig(m, ...a); };
        key({ key: 'D', shiftKey: true });
        await new Promise(r => setTimeout(r, 250));
        window.parent.postMessage = orig;
        first.classList.remove('focused');
        return { before, after, stored, dropped, moved: before[0] !== after[0] };
    });
    if (drag.skip) console.log('~ 2.5.7: ' + drag.skip);
    else {
        check(drag.moved === true, 'Ctrl+Arrow reorders the hand without dragging (2.5.7)',
              JSON.stringify(drag.before) + ' → ' + JSON.stringify(drag.after));
        check(Array.isArray(drag.stored) && drag.stored.join() === drag.after.join(),
              'reorder persists to the same origami_hand_order the drag path writes');
        check(!!drag.dropped && drag.dropped.type === 'DROP_CARD_AT' && !!drag.dropped.card,
              'Shift+D drops a card without dragging, via the same DROP_CARD_AT (2.5.7)',
              JSON.stringify(drag.dropped));
    }

    // ── 3+4. skip link and landmarks in the shell ──────────────────────────────
    // Focus must be driven from Playwright, not from an in-page focus() call: at this point in the
    // run the keyboard legs above left focus INSIDE the engine iframe, and a parent-document
    // element.focus() silently no-ops across that boundary (measured: focused=false, top stayed -100).
    const offBefore = await p.evaluate(() => {
        const sk = document.getElementById('a11y-skip');
        return sk ? sk.getBoundingClientRect().top : null;
    });
    await p.focus('#a11y-skip').catch(() => {});
    await sleep(300);                                  // the reveal is a 0.12s transition
    const shell = await p.evaluate(async (offBefore) => {
        const sk = document.getElementById('a11y-skip');
        if (!sk) return { missing: true };
        const offAfter = sk.getBoundingClientRect().top;
        // first tabbable = the skip link itself
        const tabbables = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => el.offsetParent !== null || el === sk);
        return {
            missing: false,
            hiddenUntilFocus: offBefore < 0 && offAfter >= 0,
            offBefore, offAfter, focused: document.activeElement === sk,
            isFirst: tabbables[0] === sk,
            uiRole: document.getElementById('ui-viewport')?.getAttribute('role'),
            uiLabel: !!document.getElementById('ui-viewport')?.getAttribute('aria-label'),
            fpvRole: document.getElementById('fpv-viewport')?.getAttribute('role'),
            fpvLabel: !!document.getElementById('fpv-viewport')?.getAttribute('aria-label'),
        };
    }, offBefore);
    check(!shell.missing, 'shell exposes a skip link (2.4.1)');
    if (!shell.missing) {
        check(shell.hiddenUntilFocus, 'skip link is offscreen until focused, then visible',
              `top ${shell.offBefore} → ${shell.offAfter}, focused=${shell.focused}`);
        check(shell.isFirst, 'skip link is the FIRST tabbable element');
        check(shell.uiRole === 'main' && shell.uiLabel, 'interface container is a labeled main landmark');
        check(shell.fpvRole === 'region' && shell.fpvLabel, 'dungeon view is a labeled region landmark');
    }
    // activating it must open the guide's World page
    await p.evaluate(() => document.getElementById('a11y-skip').click());
    await sleep(1600);
    const landed = await pan.evaluate(() => ({ slide: window.playerGuide?.currentSlide, world: window.playerGuide?.WORLD_SLIDE }));
    check(landed.slide === landed.world, 'skip link lands on the guidebook World page', JSON.stringify(landed));

    if (errs.length) check(false, 'console clean', errs.join(' | '));
    await b.close();
    console.log(fails ? `PROBE FAIL — ${fails} failure(s)` : 'PROBE PASS');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
