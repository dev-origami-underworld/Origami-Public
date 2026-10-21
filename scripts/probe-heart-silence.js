#!/usr/bin/env node
/**
 * probe-heart-silence.js — Mark 2026-08-16: "i told you dont play BG music until enter sections 1-4 = you failed".
 *
 * Reproduces his setup rather than guessing at it: BG music ENABLED (the checkbox ticked — that is the whole
 * point of the feature), player standing in the Heart (segment 0), no combat. Nothing may be audible.
 *
 * Segment 0 is the entrance landing, the ring, the konbini and the cabaret. Allowed to sound there:
 *   • the cabaret's own cues (CABARET_LOUNGE / GAMBLING) — Mark: "caberet songs = only play in caberet"
 *   • COMBAT / BOSS / BOSS_REVEAL / POST_COMBAT — fight music and its tail. Mark 2026-08-16: "BG phantasm
 *     should play after combat". The probe stays out of combat so these should not arise at all.
 * Anything else audible in segment 0 is the failure, and SECTION_BG in particular is the one under test.
 *
 * Reads window._composer.diag() — the engine's own arbitration view — plus the live deck, so a PASS means
 * the shipped Composer chose silence, not that this script re-implemented the rule and agreed with itself.
 * Exit 0=PASS, 1=FAIL, 2=harness.
 */
const path = require('path'); const fs = require('fs'); const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
function startServer(){ return new Promise(res=>{ const srv=http.createServer((req,rs)=>{ const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/OrigamiUnderworld.html':u); if(!f.startsWith(ROOT)){rs.statusCode=403;return rs.end();} fs.readFile(f,(e,d)=>{ if(e){rs.statusCode=404;return rs.end(e.code);} rs.setHeader('Content-Type',MIME[path.extname(f).toLowerCase()]||'application/octet-stream'); rs.setHeader('Access-Control-Allow-Origin','*'); rs.end(d); }); }); srv.listen(0,'127.0.0.1',()=>res(srv)); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ALLOWED_IN_HEART = new Set(['CABARET_LOUNGE','GAMBLING','COMBAT','BOSS','BOSS_REVEAL','POST_COMBAT']);

(async () => {
    const srv = await startServer(); const port = srv.address().port;
    const browser = await chromium.launch(); const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    let code = 2;
    try {
        await page.goto(`http://127.0.0.1:${port}/OrigamiUnderworld.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
        const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
        if (!eng) throw new Error('engine frame not found');
        if (!await eng.evaluate(() => !!(window._composer && window._composer.diag)))
            throw new Error('window._composer.diag is not exposed');

        // THE PLAYER HAS TURNED MUSIC ON. That is the state the complaint is about — with it off, the
        // UNEARNED_MUSIC cue masks everything and the probe would pass while proving nothing.
        await eng.evaluate(() => { window._bgMusicEarned = true; });

        const samples = [];
        for (let i = 0; i < 14; i++){
            await sleep(2000);
            samples.push(await eng.evaluate(() => {
                const d = String(window._composer.diag() || '');
                const m = d.match(/WINNER:\s*(\S+)\s*·\s*([^\n·]+)·/);
                const deck = /▶ PLAYING/.test(d);
                return {
                    winner: m ? m[1] : '?',
                    track: m ? m[2].trim() : '?',
                    playing: deck,
                    seg: (window._activeSegmentId | 0),
                    earned: window._bgMusicEarned === true,
                    inCab: window._cabEntered === true,
                };
            }));
        }

        const inHeart = samples.filter(s => s.seg === 0);
        console.log(`  ${samples.length} samples · ${inHeart.length} while segmentId=0 · music earned=${samples[0]?.earned}`);
        const seen = new Map();
        for (const s of inHeart){
            const k = `${s.winner}|${s.playing ? 'AUDIBLE' : 'silent'}`;
            seen.set(k, (seen.get(k) || 0) + (1));
        }
        for (const [k, n] of seen) console.log(`    ${k.replace('|', '  ')}  ×${n}`);

        const fails = [];
        if (!inHeart.length) fails.push('never sampled segmentId=0 — probe is vacuous, the player left the Heart');
        for (const s of inHeart){
            if (s.playing && !ALLOWED_IN_HEART.has(s.winner))
                fails.push(`${s.winner} was AUDIBLE in the Heart (segment 0) playing "${s.track}"`);
        }
        if (errors.length) fails.push('pageerror: ' + errors.slice(0, 3).join(' | '));

        // ── THE OTHER HALF: silencing the Heart must not silence the game ────────────────────────────
        //    Without this a bug that muted everything everywhere would sail through the checks above.
        //    Walk the segment to 2 (a real section) and require the dungeon score to come up.
        await eng.evaluate(() => { window._activeSegmentId = 2; });
        let section = null;
        for (let i = 0; i < 10 && !(section && section.playing && section.winner === 'SECTION_BG'); i++){
            await sleep(1500);
            section = await eng.evaluate(() => {
                const d = String(window._composer.diag() || '');
                const m = d.match(/WINNER:\s*(\S+)\s*·\s*([^\n·]+)·/);
                return { winner: m ? m[1] : '?', track: m ? m[2].trim() : '?', playing: /▶ PLAYING/.test(d), seg: (window._activeSegmentId | 0) };
            });
        }
        console.log(`  segment 2 → ${section.winner} ${section.playing ? 'AUDIBLE' : 'silent'} "${section.track}"`);
        if (!(section.winner === 'SECTION_BG' && section.playing))
            fails.push(`the sections lost their score too: segment 2 gave ${section.winner}/${section.playing ? 'audible' : 'SILENT'} — the Heart fix must not mute the dungeon`);

        const uniq = [...new Set(fails)];
        if (uniq.length){ console.error('\n❌ FAIL\n  - ' + uniq.join('\n  - ')); code = 1; }
        else { console.log('\n✅ PASS — silent in the Heart with music ENABLED, and the score still comes up in section 2'); code = 0; }
    } catch (e) { console.error('⚠ harness: ' + e.message); code = 2; }
    finally { await browser.close(); srv.close(); process.exit(code); }
})();
