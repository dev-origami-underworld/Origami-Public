#!/usr/bin/env node
/**
 * probe-winamp-transport.js — Mark 2026-08-16: "did you get winamp buttons to work".
 *
 * THE GAP THIS CLOSES. probe-music-page covers PLAY and STOP; probe-mini-winamp only asserts that ⏭ is
 * hit-testable. NOTHING in scripts/ referenced MUSIC_PAGE_SKIP or skipBg — so rewind/forward shipped on
 * a code trace and no measurement, which is exactly how "fixed" becomes "fixed again next week".
 *
 * Asserts the two uncovered buttons on the REAL dock elements ([data-mn=...]), not on a re-implementation:
 *   • ⏭ / ⏮ actually CHANGE the playing track (the winner's file name must differ afterwards)
 *   • ⏸ actually makes the room QUIET — nothing left running in the transport ledger
 *
 * ⚠ THIS PROBE WAS WRONG TWICE BEFORE IT WAS RIGHT, both times about pause, and both times it accused
 *   working code. First it asserted the diag deck's currentTime stops advancing — but the diag prints the
 *   ACTIVE deck slot, which can spin at gain 0 while the audible deck is genuinely paused. Then it
 *   sampled a single instant 2.5s after the press — but SILENCE carries fadeOut 5000 (Mark 2026-08-08,
 *   "fade out 5sec - no abrupt cutoffs") and the Composer's applyGain pauses a deck only once gain
 *   reaches <= 0.0001, which lands around t+8s. Assert the OUTCOME and poll for it; never pick a moment.
 *
 * Runs in SEGMENT 2, deliberately. skipBg() opens with `if (curId !== 'SECTION_BG') return false`, and
 * since the HEART_SILENCE fix the Heart's winner is HEART_SILENCE — so skip is a NO-OP there by design
 * (there is no background track to skip). Testing it in the Heart would report a false failure. The
 * Heart's no-op is asserted separately at the end so the design is pinned rather than assumed.
 *
 * Exit 0=PASS, 1=FAIL, 2=harness.
 */
const path = require('path'); const fs = require('fs'); const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
function startServer(){ return new Promise(res=>{ const srv=http.createServer((req,rs)=>{ const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/OrigamiUnderworld.html':u); if(!f.startsWith(ROOT)){rs.statusCode=403;return rs.end();} fs.readFile(f,(e,d)=>{ if(e){rs.statusCode=404;return rs.end(e.code);} rs.setHeader('Content-Type',MIME[path.extname(f).toLowerCase()]||'application/octet-stream'); rs.setHeader('Access-Control-Allow-Origin','*'); rs.end(d); }); }); srv.listen(0,'127.0.0.1',()=>res(srv)); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const srv = await startServer(); const port = srv.address().port;
    const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    let code = 2;
    try {
        await page.goto(`http://127.0.0.1:${port}/OrigamiUnderworld.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
        const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
        const pf  = page.frames().find(f => /Panels\.html/.test(f.url()));
        if (!eng || !pf) throw new Error('engine or panels frame not found');

        const winner = () => eng.evaluate(() => {
            const d = String(window._composer.diag() || '');
            const m = d.match(/WINNER:\s*(\S+)\s*·\s*([^\n·]+)·/);
            const t = d.match(/· t ([\d.]+)\//);
            return { cue: m ? m[1] : '?', track: m ? m[2].trim() : '?', playing: /▶ PLAYING/.test(d), t: t ? parseFloat(t[1]) : -1 };
        });
        const press = (act) => pf.evaluate((a) => {
            const b = document.querySelector('#mini-player [data-mn="' + a + '"]');
            if (!b) return false;
            b.click(); return true;
        }, act);

        // Put a real background track on the deck: skip only has meaning while SECTION_BG owns the floor.
        await eng.evaluate(() => { window._bgMusicEarned = true; window._activeSegmentId = 2; });
        let w0 = null;
        for (let i = 0; i < 12; i++){ await sleep(1500); w0 = await winner(); if (w0.cue === 'SECTION_BG' && w0.playing) break; }
        if (!(w0 && w0.cue === 'SECTION_BG' && w0.playing)) throw new Error('could not get SECTION_BG playing in segment 2 — nothing to skip');
        console.log(`  baseline: ${w0.cue} "${w0.track}"`);

        const fails = [];

        // ── ⏭ FORWARD must change the track ────────────────────────────────────────────────────────
        if (!await press('next')) fails.push('no [data-mn="next"] button in #mini-player');
        else {
            let after = null;
            for (let i = 0; i < 8; i++){ await sleep(1200); after = await winner(); if (after.track !== w0.track) break; }
            const ok = after && after.track !== w0.track;
            console.log(`  ⏭ next  → "${after && after.track}" ${ok ? '✓ changed' : '✗ unchanged'}`);
            if (!ok) fails.push(`⏭ did not change the track (still "${w0.track}")`);
            if (ok) w0 = after;
        }

        // ── ⏮ BACK must also move it ───────────────────────────────────────────────────────────────
        if (!await press('prev')) fails.push('no [data-mn="prev"] button in #mini-player');
        else {
            let after = null;
            for (let i = 0; i < 8; i++){ await sleep(1200); after = await winner(); if (after.track !== w0.track) break; }
            const ok = after && after.track !== w0.track;
            console.log(`  ⏮ prev  → "${after && after.track}" ${ok ? '✓ changed' : '✗ unchanged'}`);
            if (!ok) fails.push(`⏮ did not change the track (still "${w0.track}")`);
        }

        // ── ⏸ PAUSE MUST MAKE THE ROOM QUIET ───────────────────────────────────────────────────────
        //    ⚠ NOT "the deck's currentTime stops advancing", which is what this asserted first and it
        //    was the wrong question. The diag prints the ACTIVE deck slot, and a slot can keep spinning
        //    at gain 0 while the audible one is genuinely paused — so that check failed against working
        //    code (MEASURED: WINNER went SECTION_BG → SILENCE, gain 0.018 → 0.000, hold raised, and the
        //    old assertion still called it broken). What a listener cares about is: nothing enrolled in
        //    the transport ledger is still running, and the Composer is not about to restart one.
        const beforeAudible = await eng.evaluate(() => Object.entries(window._musicTransport || {})
            .filter(([, v]) => v && v.el && !v.el.paused).map(([k]) => k));
        if (!beforeAudible.length) fails.push('nothing was audible before ⏸ — the pause half of this probe is vacuous');
        await press('play');                 // the dock's play/pause is ONE button, resolved engine-side
        // ⚠ WAIT OUT THE AUTHORED FADE. SILENCE carries fadeOut 5000 (Mark 2026-08-08: "fade out 5sec -
        //   no abrupt cutoffs"), and the Composer's applyGain pauses a deck only once its gain reaches
        //   <= 0.0001. Sampling at 2.5s therefore catches a deck that is mid-ramp and STILL RUNNING, and
        //   this probe twice reported "pause is broken" against working code on exactly that mistake.
        //   MEASURED ramp: t+1s gain .047 · t+4s .017 · t+6s .001 · t+8s .000 and the audible set empty.
        //   Poll to the real outcome rather than guessing a single instant.
        let after = null;
        for (let i = 0; i < 12; i++) {
            await sleep(1000);
            after = await eng.evaluate(() => {
                const d = String(window._composer.diag() || '');
                const g = d.match(/gain ([\d.]+) → ([\d.]+)/);
                return {
                    audible: Object.entries(window._musicTransport || {}).filter(([, v]) => v && v.el && !v.el.paused).map(([k]) => k),
                    goal: g ? parseFloat(g[2]) : -1,
                    held: window._musicPageAuditioning === true,
                };
            });
            if (after.audible.length === 0 && after.goal <= 0.0001 && after.held) break;
        }
        const quiet = (after.audible.length === 0) && (after.goal <= 0.0001) && after.held;
        console.log(`  ⏸ pause → audible [${beforeAudible.join(',')}] → [${after.audible.join(',')}] · gain goal ${after.goal} · hold ${after.held} ${quiet ? '✓ the room is quiet' : '✗ still making noise'}`);
        if (!quiet) fails.push(`⏸ did not silence the room — still audible [${after.audible.join(',')}], gain goal ${after.goal}, hold ${after.held}`);

        // ── THE HEART'S NO-OP IS A DESIGN CLAIM, SO PIN IT ─────────────────────────────────────────
        //    skipBg() early-returns unless SECTION_BG owns the floor. Back in the Heart the winner is
        //    HEART_SILENCE, so skip MUST report false — there is no background track to skip.
        await eng.evaluate(() => { window._activeSegmentId = 0; });
        await sleep(3000);
        const heart = await eng.evaluate(() => {
            const r = (window._composer && window._composer.skipBg) ? window._composer.skipBg() : null;
            const d = String(window._composer.diag() || '');
            const m = d.match(/WINNER:\s*(\S+)/);
            return { skipReturned: r, cue: m ? m[1] : '?' };
        });
        console.log(`  Heart: winner=${heart.cue} · skipBg() returned ${heart.skipReturned} ${heart.skipReturned === false ? '✓ correctly a no-op' : '✗'}`);
        if (heart.skipReturned !== false) fails.push(`skipBg() returned ${heart.skipReturned} in the Heart — it should refuse when SECTION_BG is not the winner`);

        if (errors.length) fails.push('pageerror: ' + errors.slice(0, 3).join(' | '));
        if (fails.length){ console.error('\n❌ FAIL\n  - ' + fails.join('\n  - ')); code = 1; }
        else { console.log('\n✅ PASS — ⏭/⏮ change the track, ⏸ holds the deck, and skip correctly refuses in the Heart'); code = 0; }
    } catch (e) { console.error('⚠ harness: ' + e.message); code = 2; }
    finally { await browser.close(); srv.close(); process.exit(code); }
})();
