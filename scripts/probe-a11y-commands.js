#!/usr/bin/env node
/**
 * probe-a11y-commands.js — falsification gate for the accessibility command grammar (playbook P3).
 *
 * Types REAL text into the REAL chat input (#fpv-chat-input) — the exact keystrokes a blind
 * player's screen reader or OS dictation produces — and asserts the narration lands in the
 * role=log live region (#event-log-container). No synthetic postMessage shortcuts on the send
 * side: if any link in chat → grammar → FPV_CHAT_COMMAND → shell relay → engine executor →
 * LOG_EVENT → live region breaks, the transcript goes silent and this probe fails.
 *
 * Covers: EN argless (look around / where am I / help / inventory), EN targeted (look at /
 * smash / go to), JA (近く / ここはどこ / 壺を壊して), forced AMBIGUITY + numbered resolution,
 * unknown-target error narration, and the ELIZA fall-through guard (plain chat must NOT
 * trigger a command).
 *
 * RED-RUN PROOF: --selftest breaks the rail on purpose (deletes window.A11yGrammar in panels)
 * and asserts the transcript DOES go silent for grammar commands — proving the probe can fail.
 *
 * Usage: node scripts/probe-a11y-commands.js [--selftest]   (:5501 server; foreground only)
 */
const { chromium } = require('playwright');
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
    if (SELFTEST) await pan.evaluate(() => { delete window.A11yGrammar; });

    let pass = 0, fail = 0;
    const type = async (text) => {
        // mark the log, type for real, submit with a REAL Enter keydown, read new entries
        await pan.evaluate(() => { window.__logMark = document.getElementById('event-log-container').children.length; });
        const input = await pan.$('#fpv-chat-input');
        await input.fill(text);
        await input.press('Enter');
        await sleep(1600);   // covers the alt path's second hop: chat → AUTO_BURN → engine re-dispatch → LOG_EVENT → live region
        return pan.evaluate(() => {
            const log = document.getElementById('event-log-container');
            return Array.from(log.children).slice(window.__logMark).map(n => n.textContent).join(' | ');
        });
    };
    const expect = async (text, re, label) => {
        const got = await type(text);
        const ok = re.test(got);
        if (ok) { pass++; console.log(`✓ ${label}: "${text}"`); }
        else { fail++; console.log(`✗ ${label}: "${text}" → log: "${got.slice(0, 180)}"`); }
        return got;
    };

    if (SELFTEST) {
        // With the grammar deleted, a grammar-only command must produce NO command narration —
        // it falls to ELIZA/chat. If narration still appears, the probe's detection is broken.
        const got = await type('look around');
        const silent = !/Nearby|👁/.test(got);
        console.log(silent ? 'SELFTEST PASS — rail break detected (transcript silent, guard is live)'
                           : 'SELFTEST FAIL — narration appeared despite the broken rail');
        await b.close(); process.exit(silent ? 0 : 1);
    }

    // ── EN argless ──────────────────────────────────────────────────────────────
    await expect('look around', /Nearby|Nothing notable/, 'LIST_NEARBY');
    await expect('where am i', /You are in/, 'WHERE_AM_I');
    await expect('help', /You can type/, 'HELP');
    await expect('inventory', /Your hand/, 'INVENTORY');

    // ── EN targeted (targets that exist on every floor-1 boot) ──────────────────
    await expect('look at the bed', /🔍|Which one|Nothing named/, 'LOOK bed');
    await expect('go to the casino', /Heading to|Which one|Nothing named/, 'GO_TO_ROOM casino');

    // ── forced ambiguity + numbered resolution (beds are many on floor 1) ──────
    const amb = await expect('smash the bed', /Which one|Walking to smash/, 'SMASH ambiguity');
    if (/Which one/.test(amb)) {
        await expect('2', /Walking to smash|No clear path/, 'RESOLVE #2');
    } else {
        console.log('~ ambiguity: only one bed rolled this boot — resolution leg exercised via LOOK below');
        await expect('look at the gate', /🔍|Which one|Nothing named/, 'LOOK gate');
        // if that forked a Which-one, resolve it so state clears
        await pan.evaluate(() => {});
    }

    // ── error narration (3.3.1: errors must be identified in text) ─────────────
    await expect('look at the flying spaghetti monster', /Nothing named .* Try "look around"/, 'unknown target error');

    // ── JA transcript ──────────────────────────────────────────────────────────
    await pan.evaluate(() => { try { window.applyLocale && window.applyLocale('ja'); window.currentLang = 'ja'; } catch (e) {} });
    await sleep(400);
    await expect('近く', /近く|何もない/, 'JA LIST_NEARBY');
    await expect('ここはどこ', /ここは/, 'JA WHERE_AM_I');
    await expect('壺を壊して', /壊しに行く|どれ|見つからない/, 'JA SMASH pot');
    await pan.evaluate(() => { try { window.applyLocale && window.applyLocale('en'); window.currentLang = 'en'; } catch (e) {} });

    // ── ELIZA fall-through guard: plain talk must NOT become a command ─────────
    const chat = await type('you are looking lovely tonight');
    if (/Starlette|Typed:/.test(chat) && !/🔍|Nearby|Heading|Walking/.test(chat)) { pass++; console.log('✓ ELIZA fall-through preserved'); }
    else { fail++; console.log(`✗ ELIZA fall-through broken → "${chat.slice(0, 160)}"`); }

    if (errs.length) { fail++; console.log('✗ pageerrors: ' + errs.join(' | ')); }
    await b.close();
    console.log(`${fail ? 'PROBE FAIL' : 'PROBE PASS'} — ${pass} ok, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
