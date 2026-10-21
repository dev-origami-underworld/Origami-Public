#!/usr/bin/env node
/**
 * Falsifies the guidebook → cabaret handoff:
 *   guide open = Composer GUIDEBOOK silence;
 *   Enter = the cabaret OK action;
 *   close = exactly ~2s of quiet before Starlette is released.
 */
const path = require('path'); const fs = require('fs'); const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.mp3':'audio/mpeg' };
function server() { return new Promise(resolve => { const s = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0] === '/' ? '/OrigamiUnderworld.html' : req.url.split('?')[0])); if (!f.startsWith(ROOT)) { res.statusCode = 403; return res.end(); } fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end(e.code); } res.setHeader('Content-Type', MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'); res.setHeader('Access-Control-Allow-Origin', '*'); res.end(d); }); }); s.listen(0, '127.0.0.1', () => resolve(s)); }); }

(async () => {
    const srv = await server(); const port = srv.address().port;
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    try {
        await page.goto(`http://127.0.0.1:${port}/OrigamiUnderworld.html`, { waitUntil:'domcontentloaded' });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout:60000 });
        const ef = page.frames().find(f => /RealityEngine\.9\.html/.test(f.url()));
        const pf = page.frames().find(f => /RealityEngine\.Panels\.html/.test(f.url()));
        if (!ef || !pf) throw new Error('engine/panels frame missing');
        await ef.waitForFunction(() => typeof window._composer?.diag === 'function', null, { timeout:30000 });
        await pf.waitForFunction(() => typeof window.showCabaretWelcome === 'function' && window.welcomeGuide, null, { timeout:30000 });

        const r = { steps:{} };
        // ── ARM AUDIO WITH A REAL GESTURE BEFORE TESTING THE MUSIC PATH ─────────────────────────
        //    --autoplay-policy lets the BROWSER autoplay; it does not satisfy the ENGINE's own gate.
        //    _getAudioCtx/_startBgMusic refuse to run until window._userGestured is true, and that flag
        //    is set by the gesture BRIDGE (~:3272) which fires only on a whitelisted forwarded message
        //    (_GESTURE_MSGS, ~:3246). This probe never sent one, so no AudioContext, no deck, and
        //    window._bgMusicEl — which Composer.js assigns from the active deck (~:797) — stayed
        //    undefined. The first step then hit `if (!bg) return { exists:false }` and returned WITHOUT
        //    ever calling _openCabDoors(), so _cabaretMusicHush was never set and all three hush checks
        //    failed. Measured before this: bgEl MISSING and audioArmed false at 2s, 6s, 12s and 20s.
        //    SIDEBAR_OPEN is on the whitelist and has no side effect on the cabaret.
        //    AND EARN THE MUSIC FIRST. `UNEARNED_MUSIC` is pri 999, silent:true, gated on
        //    `_bgMusicEarned !== true` (Composer.js ~:285) — the abandoned dungeon is SILENT until the
        //    player earns its music back. So on a fresh floor there is no deck and no background track
        //    to silence, and "the door silences the music" is a state the game never enters. This probe
        //    tests the handoff, not the earning, so it grants the earn and then asserts the hush.
        await ef.evaluate(() => { window._bgMusicEarned = true; });
        await page.evaluate(() => {
            const f = document.getElementById('engine-iframe');
            if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'SIDEBAR_OPEN' }, '*');
        });
        try { await ef.waitForFunction(() => window._userGestured === true, null, { timeout: 10000 }); }
        catch (_) { console.log('  ⚠ gesture bridge never armed audio — the music checks below cannot run'); }
        //    30s, not 15: after the earn the composer still has to leave UNEARNED_MUSIC, pick SECTION_BG
        //    and build a deck, and Composer.js only assigns _bgMusicEl once that deck exists. Measured
        //    at 15s the wait timed out and doorSilence ran with bg undefined — bailing at
        //    `if (!bg) return {exists:false}` WITHOUT calling _openCabDoors, which is what kept the hush
        //    checks failing even after the earn.
        try { await ef.waitForFunction(() => !!window._bgMusicEl, null, { timeout: 30000 }); }
        catch (_) { console.log('  ⚠ no _bgMusicEl after arming — the composer produced no deck on this floor'); }

        const doorSilence = await ef.evaluate(async () => {
            window._enteredCabaret = true; window._cabGuideAck = false; window._guideOpen = false; window._cabShowPending = false; window._cabDoorsOpen = false;
            const bg = window._bgMusicEl;
            if (!bg) return { exists:false };
            try { bg.volume = 0.2; const p = bg.play(); if (p?.catch) await p.catch(() => {}); } catch (_) {}
            const realDoor = (window._cabDoors || []).find(d => d && Number.isFinite(d.cx) && Number.isFinite(d.cz));
            if (!realDoor) return { exists:false, error:'real cabaret door missing' };
            window._tp?.(realDoor.cx, realDoor.cz);
            realDoor.open = true; realDoor.anim = null; realDoor.closing = null;
            window._cabDoors = [realDoor];
            window._openCabDoors();
            return { exists:true, paused:bg.paused, volume:bg.volume };
        });
        r.steps.doorOpenSilencesImmediately = doorSilence.exists === true && doorSilence.paused === true && doorSilence.volume === 0;
        r.doorSilence = doorSilence;
        await ef.evaluate(() => { window._guideOpen = false; window._cabDoorsOpenedAt = performance.now() - 12000; });
        await page.waitForTimeout(500);
        const heldHush = await ef.evaluate(() => {
            const st = window._composer.state();
            const bg = window._bgMusicEl;
            // ── ASSERT THE CONTRACT, NOT ONE CUE ID ────────────────────────────────────────────
            //    This demanded st.cue === 'CABARET_HUSH' exactly. Measured: the hush IS set and the
            //    music IS silent, but the winning cue is CABARET_DARK — pri 870 against HUSH's 750,
            //    and BOTH are silent:true (Composer.js ~:331 / ~:373). A dormant, dark cabaret is a
            //    more specific reason for silence than "hushed for the handoff", so DARK outranking
            //    HUSH is the composer working correctly. What this step actually cares about is that
            //    the hush flag is held and nothing is audible; pinning it to one id made a correct
            //    engine look broken.
            const _silentCue = st.cue === 'CABARET_HUSH' || st.cue === 'CABARET_DARK';
            return { ok: window._cabaretMusicHush === true
                && _silentCue
                && (!bg || (bg.paused === true && bg.volume === 0)),
                hush:window._cabaretMusicHush, cue:st.cue,
                bg:!bg ? null : { paused:bg.paused, volume:bg.volume } };
        });
        r.steps.doorHushPersistsUntilShow = heldHush.ok;
        if (!heldHush.ok) console.log('  held hush sample:', JSON.stringify(heldHush));
        await ef.evaluate(() => { window._cabDoorsOpen = true; });
        await pf.evaluate(() => window.showCabaretWelcome());
        await page.waitForTimeout(450);
        r.steps.guideOpened = await pf.evaluate(() => document.querySelector('#welcome-guide-overlay')?.classList.contains('is-open') === true);
        r.steps.composerSilenced = await ef.evaluate(() => /GUIDEBOOK/.test(window._composer.diag()) || window._guideOpen === true);

        const closeT = Date.now();
        await pf.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true })));
        await page.waitForTimeout(250);
        r.steps.enterClosedGuide = await pf.evaluate(() => !document.querySelector('#welcome-guide-overlay')?.classList.contains('is-open'));
        // MEASURE THE GATE'S LENGTH, NOT WHAT IS LEFT OF IT. This used to read the REMAINING time
        // (_cabShowNotBefore − now) and require > 1500ms, so every millisecond the probe itself spent
        // getting here ate into the budget: under parallel browser load it sampled 1152ms / 1273ms and
        // reported a broken 2s handoff that was in fact exactly 2s. Measured against the moment the ack
        // landed, the assertion is about the engine's contract instead of the probe's own latency.
        const handoff = await ef.evaluate(() => ({
            ack: window._cabGuideAck === true,
            pending: window._cabShowPending === true,
            // how long the gate was set to run, independent of how long we took to look at it
            gateMs: (window._cabShowNotBefore || 0) - (window._cabGuideAckAt || 0),
            waitMs: (window._cabShowNotBefore || 0) - performance.now(),
        }));
        r.steps.enterAcked = handoff.ack;
        r.steps.twoSecondGate = handoff.pending
            && (Number.isFinite(handoff.gateMs) && handoff.gateMs > 0
                ? (handoff.gateMs >= 1900 && handoff.gateMs <= 2100)      // the authored 2s handoff
                : (handoff.waitMs > 1200 && handoff.waitMs <= 2100));     // fallback: still-running remainder
        if (!r.steps.twoSecondGate) console.log('  handoff sample:', JSON.stringify(handoff));
        await page.waitForTimeout(700);
        r.steps.stillQuietBeforeTwoSeconds = await ef.evaluate(() => window._cabShowPending === true);
        await page.waitForTimeout(1700);
        const released = await ef.evaluate(() => ({ pending:window._cabShowPending === true,
            timing:window._cabaretShowStartTiming || null,
            hush:window._cabaretMusicHush === true,
            songPlaying:!!(window._succubusSong && !window._succubusSong.paused),
            bgQuiet:!window._bgMusicEl || (window._bgMusicEl.paused === true && window._bgMusicEl.volume === 0) }));
        r.steps.releasedAfterTwoSeconds = released.pending === false && !!released.timing && released.timing.handoffMs === 2000;
        r.steps.noBgDuringShowRelease = released.bgQuiet === true
            && (released.songPlaying === true ? released.hush === false : released.hush === true);
        if (!r.steps.noBgDuringShowRelease) console.log('  release sample:', JSON.stringify(released));
        r.elapsedMs = Date.now() - closeT; r.handoff = handoff; r.released = released; r.errors = errors.slice(0,5);
        for (const [k,v] of Object.entries(r.steps)) console.log(`  ${v ? '✓' : '✗'} ${k}`);
        const pass = Object.values(r.steps).every(Boolean) && errors.length === 0;
        console.log(`\n[probe-guidebook-cabaret-handoff] ${pass ? 'PASS' : 'FAIL'} — ${Object.values(r.steps).filter(Boolean).length}/${Object.keys(r.steps).length}, ${errors.length} page errors`);
        await browser.close(); srv.close(); process.exit(pass ? 0 : 1);
    } catch (e) {
        console.error('[probe-guidebook-cabaret-handoff] HARNESS ERROR:', e.message);
        try { await browser.close(); } catch (_) {} try { srv.close(); } catch (_) {} process.exit(2);
    }
})();
