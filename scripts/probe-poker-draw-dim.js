#!/usr/bin/env node
/**
 * probe-poker-draw-dim.js — DRAW must be dark whenever the player cannot draw (Mark 2026-08-16:
 * "when gaming gambling, darken DRAW when game is over. since player cannot draw when poker game is done").
 *
 * The engine's HIT branch (_pokerAction, Engine9 ~:47292) runs _pkHit ONLY while _pkG.phase === 'draw' and
 * otherwise just plays a pop — so before this change the DRAW card advertised itself as live through 'done',
 * 'idle', 'deal', 'swap' and 'showdown'. Panels' _pkApplyPhase now mirrors the engine's own refusal.
 *
 * THE REGRESSION THIS ALSO GUARDS: three games share ONE action row. DICE reuses the poker row and its DRAW
 * card is the LOW bet (_dcAction ~Engine9:47244) — a live control. Dice never posts a phase update, so a
 * naive "dim unless phase==='draw'" rule would have set pointer-events:none on it and killed the dice game.
 *
 * Drives the REAL POKER_UI handler in the panels frame (row build + _pkApplyPhase), so a pass means the
 * shipped path behaves, not a re-implementation of it. Exit 0=PASS, 1=FAIL, 2=harness.
 */
const path = require('path'); const fs = require('fs'); const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
function startServer(){ return new Promise(res=>{ const srv=http.createServer((req,rs)=>{ const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/OrigamiUnderworld.html':u); if(!f.startsWith(ROOT)){rs.statusCode=403;return rs.end();} fs.readFile(f,(e,d)=>{ if(e){rs.statusCode=404;return rs.end(e.code);} rs.setHeader('Content-Type',MIME[path.extname(f).toLowerCase()]||'application/octet-stream'); rs.setHeader('Access-Control-Allow-Origin','*'); rs.end(d); }); }); srv.listen(0,'127.0.0.1',()=>res(srv)); }); }

// [game, phase, extra, expectDrawDim, note]
const CASES = [
    ['poker', 'idle',     {},                  true,  'sat down, no cards dealt'],
    ['poker', 'deal',     {},                  true,  'cards still being dealt'],
    ['poker', 'draw',     {},                  false, 'YOUR DRAW — the one live moment'],
    ['poker', 'swap',     {},                  true,  'discards already committed'],
    ['poker', 'showdown', {},                  true,  'hands turning over'],
    ['poker', 'done',     {},                  true,  "hand over — Mark's ask"],
    ['poker', 'done',     { gameOver: true },  true,  'table cleaned out (STOP-ON-BUST)'],
    ['21',    'play',     {},                  false, '21: HIT is live in play'],
    ['21',    'done',     {},                  true,  '21: HIT dead between hands'],
    ['dice',  'idle',     {},                  false, 'DICE: DRAW is the LOW bet — must stay live'],
];

(async () => {
    const srv = await startServer(); const port = srv.address().port;
    const browser = await chromium.launch(); const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    let code = 2;
    try {
        await page.goto(`http://127.0.0.1:${port}/OrigamiUnderworld.html`, { waitUntil: 'domcontentloaded' });
        const deadline = Date.now() + 45000; let pf = null;
        while (Date.now() < deadline && !pf) {
            for (const fr of page.frames()) {
                try { if (await fr.evaluate(() => typeof window._pkApplyPhase === 'function' && !!document.getElementById('guides-container'))) { pf = fr; break; } } catch(_){}
            }
            if (!pf) await page.waitForTimeout(400);
        }
        if (!pf) throw new Error('panels frame with _pkApplyPhase + #guides-container never appeared');

        // Count POKER_ACTION posts so each case can be judged on BEHAVIOUR, not just on a class name.
        // (pointer-events is deliberately NOT asserted: it is an inherited property, and while the probe
        //  drives the handler the card row's ancestor is hidden, so every column computes 'none' either way.
        //  A programmatic .click() bypasses hit-testing and runs the real _fire guard — which is the truth.)
        await pf.evaluate(() => {
            if (window.__pkActOrig) return;
            window.__pkActOrig = window.parent.postMessage.bind(window.parent);
            window.__pkActs = 0;
            window.parent.postMessage = (m, t) => { try { if (m && m.type === 'POKER_ACTION') window.__pkActs++; } catch(_){} return window.__pkActOrig(m, t); };
        });

        const drive = (game, phase, extra) => pf.evaluate(({ g, p, x }) => {
            const data = Object.assign({ type: 'POKER_UI', active: true, game: g, phase: p, primary: null, broke: false }, x);
            window.dispatchEvent(new MessageEvent('message', { data }));
            const col  = document.querySelector('.poker-action-col[data-poker-act="HIT"]');
            const card = col && col.querySelector('.poker-action-card');
            let fired = null;
            if (col){ const before = window.__pkActs; col.click(); fired = (window.__pkActs > before); }
            return {
                built: !!col,
                title: col ? (col.querySelector('.card-title') || {}).textContent : null,
                dim:   !!(col && col.classList.contains('poker-disabled')),
                aria:  card ? card.getAttribute('aria-disabled') : null,
                tabi:  card ? card.getAttribute('tabindex') : null,
                fired: fired,
            };
        }, { g: game, p: phase, x: extra });

        const fails = [];
        let sawDim = false, sawLive = false;
        console.log('  game   phase      expect   got      aria    tab   click-fired  note');
        for (const [game, phase, extra, wantDim, note] of CASES) {
            const r = await drive(game, phase, extra);
            if (!r.built) { fails.push(`${game}/${phase}: DRAW column never built — probe is vacuous`); continue; }
            const ok      = (r.dim === wantDim);
            const ariaOk  = (r.aria === (wantDim ? 'true' : 'false'));
            const tabOk   = (r.tabi === (wantDim ? '-1' : '0'));
            const fireOk  = (r.fired === !wantDim);   // dim ⇒ a tap must reach nobody; live ⇒ it must reach the engine
            if (r.dim) sawDim = true; else sawLive = true;
            if (!ok)     fails.push(`${game}/${phase}: expected dim=${wantDim}, got ${r.dim} (${note})`);
            if (!ariaOk) fails.push(`${game}/${phase}: aria-disabled=${r.aria}, expected ${wantDim} (WCAG 4.1.2)`);
            if (!tabOk)  fails.push(`${game}/${phase}: tabindex=${r.tabi}, expected ${wantDim ? '-1' : '0'} (keyboard must skip an inert card)`);
            if (!fireOk) fails.push(`${game}/${phase}: a tap ${r.fired ? 'REACHED' : 'did NOT reach'} the engine, but the card reads dim=${r.dim}`);
            console.log(`  ${game.padEnd(6)} ${phase.padEnd(10)} ${String(wantDim).padEnd(8)} ${String(r.dim).padEnd(8)} ${String(r.aria).padEnd(7)} ${String(r.tabi).padEnd(5)} ${String(r.fired).padEnd(12)} ${(ok&&ariaOk&&tabOk&&fireOk)?'✓':'✗'} ${note}`);
        }

        // NON-VACUITY: a rule that answered the same way every time would pass a one-sided table by accident.
        if (!sawDim)  fails.push('probe never observed a DIMMED DRAW — the rule never fires');
        if (!sawLive) fails.push('probe never observed a LIVE DRAW — the rule fires unconditionally');

        await pf.evaluate(() => { try { window.dispatchEvent(new MessageEvent('message', { data: { type: 'POKER_UI', active: false } })); } catch(_){} });

        if (errors.length) fails.push('pageerror: ' + errors.slice(0, 3).join(' | '));
        if (fails.length) { console.error('\n❌ FAIL\n  - ' + fails.join('\n  - ')); code = 1; }
        else { console.log(`\n✅ PASS — DRAW darkens in every phase the engine refuses it (${CASES.length}/${CASES.length}); dice LOW bet stays live; ARIA + tab ring mirror the visual state`); code = 0; }
    } catch (e) { console.error('⚠ harness: ' + e.message); code = 2; }
    finally { await browser.close(); srv.close(); process.exit(code); }
})();
