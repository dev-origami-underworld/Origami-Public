#!/usr/bin/env node
/**
 * G-AUDIO — real audio-wiring smoke. Replaces the unconditional-green 8-line stub (TASK-08, 2026-08-11;
 * the stub's "no audio assets yet" comment was false twice over — the AudioSystem shipped long ago).
 *
 * ── HEADLESS-AUDIO HONESTY — read before trusting a green ────────────────────────────────────────────
 * Headless Chromium has no audio device. This harness proves the audio GRAPH is wired and fed:
 * assets fetchable, the user-gesture unlock bridge fires, an AudioContext reaches 'running' with an
 * advancing clock, the music gate's runtime value matches its documented design, _audioDiag()'s VERDICT
 * is clean, and a real song pushes NON-SILENT RMS through an AnalyserNode. It can NEVER prove that
 * sound is audible on Mark's speakers. Launched with --autoplay-policy=no-user-gesture-required.
 *
 * WHAT IT ASSERTS
 *   1. ASSETS RESOLVE — every audio file referenced by the AudioManifest, by live source literals
 *      (Engine9/shell/Panels/js/v8), and by the Composer's own track list returns HTTP 200 from a
 *      fresh static serve of the repo. References are WALKED, never hardcoded, so a new song extends
 *      the check instead of rotting it. Manifest entries missing on disk FAIL; disk files missing
 *      from the manifest WARN (regenerate with `npm run audio:manifest` — they are invisible to the
 *      music page until then).
 *   2. GESTURE UNLOCK + AUDIOCONTEXT RUNNING — a REAL keyboard press on the shell rides the shell's
 *      KEY_DOWN relay into the engine's gesture bridge (Engine9 ~:3963) and must flip
 *      window._userGestured. An AudioContext created in the engine frame must reach 'running' with
 *      currentTime advancing. (The engine's own SFX ctx `_audioCtx` is module-scoped with no window
 *      handle — its state is NOT directly observable; reported as a gap, not papered over.)
 *   3. _audioDiag() VERDICT CLEAN — the diag leads with a VERDICT line naming the audio fault; any 🚨
 *      verdict fails, and the whole diag is printed for triage.
 *   4. THE MUSIC GATE IS WHAT THE REGISTER SAYS — window._bgMusicEarned's ACTUAL runtime value must be
 *      consistent with the Composer's winning cue: not-earned ⇒ UNEARNED_MUSIC holds the deck (the
 *      DOCUMENTED deliberate silence, register entry 2026-07-31 "music must be found"); earned ⇒ the
 *      deck is NOT silenced by UNEARNED_MUSIC. This catches both the flag rotting and the cue being
 *      deleted while the flag still says silent.
 *   5. A SONG ACTUALLY PLAYS — a Composer-listed track is played through MediaElementSource →
 *      AnalyserNode in the engine frame; playback clock must advance AND peak RMS must be non-silent.
 *
 * MODES
 *   node scripts/smoke-audio.js                        run all assertions; exit 1 on any failure
 *   SMOKE_AUDIO_BREAK=bypass node scripts/smoke-audio.js
 *        self-test: sets window._suc3DAudio='failed' (in-page only) before reading _audioDiag, which
 *        must produce the 🚨 GAIN-NODE BYPASS verdict and turn this run red. Never set in CI.
 *   (Asset-side make-it-fail needs no harness hook: hide one referenced mp3 on disk and assertion 1
 *    goes red with the file and its referencing sites named.)
 *
 * Existing deep probes are NOT re-implemented here: smoke:music (per-track load), smoke:cabsong
 * (Starlette's show), smoke:combatmusic, probe:srtsync, probe:songvotes cover their lanes; this is the
 * wiring smoke that was missing. No engine files touched. One headless browser, foreground.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BREAK = process.env.SMOKE_AUDIO_BREAK || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function assertNoStrayHeadless() {
    let out = '';
    try { out = execSync('ps aux | grep chrome-headless-shell | grep -v grep || true', { encoding: 'utf8' }).trim(); } catch (_) {}
    if (out) {
        console.error('✗ ABORT: a chrome-headless-shell is ALREADY RUNNING — refusing to stack a second one');
        console.error(out);
        process.exit(2);
    }
}

// Full MIME map — a trimmed map served .mjs as octet-stream once and the engine never booted.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf', '.srt': 'text/plain', '.txt': 'text/plain' };
function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'OrigamiUnderworld.html';
            const f = path.join(ROOT, rel);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(f).pipe(res);
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}
function httpStatus(base, rel) {
    return new Promise(resolve => {
        const req = http.get(base + '/' + rel.split('/').map(encodeURIComponent).join('/'), res => {
            res.resume(); resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
    });
}

// ── Reference walking (never a hardcoded list) ──────────────────────────────────────────────────────
// PENDING: referenced ahead of the file landing, BY DESIGN, with the design note quoted at the source.
// A 404 on these is expected and WARNs instead of failing; once the file lands the entry is inert.
const PENDING = new Set([
    // SongCatalog.js 'starlette-wins': "⚠ FILE NOT ON DISK YET — Mark is producing it. Wired ahead per
    // the shoukan precedent" (Mark 2026-08-09, victory-party song 勝利の歌).
    'assets/sounds/Songs/Starlette-WINS.mp3',
]);
const AUDIO_EXT = /\.(?:mp3|ogg|wav)$/i;
function walkJs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkJs(p, out);
        else if (/\.(?:js|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
}
function stripComments(src) {
    return src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function collectReferences() {
    const refs = new Map();   // normalized path → Set(referencing site)
    const add = (raw, site) => {
        const rel = String(raw).replace(/^\.\//, '').replace(/^\/+/, '');
        if (!AUDIO_EXT.test(rel)) return;
        if (!refs.has(rel)) refs.set(rel, new Set());
        refs.get(rel).add(site);
    };
    // 1. The generated AudioManifest (regex-parsed: it is CJS-unimportable ESM, and its generated shape is fixed)
    const manifestPath = path.join(ROOT, 'js/v8/data/AudioManifest.js');
    const manifestText = fs.readFileSync(manifestPath, 'utf8');
    const manifestFiles = [...manifestText.matchAll(/file:\s*"([^"]+)"/g)].map(m => m[1]);
    for (const f of manifestFiles) add(f, 'AudioManifest.js');
    // 2. Live source literals (comment-stripped so a reminiscing comment cannot fail the build)
    const sources = [path.join(ROOT, 'Origami.RealityEngine.9.html'), path.join(ROOT, 'OrigamiUnderworld.html'),
        path.join(ROOT, 'Origami.RealityEngine.Panels.html'), ...walkJs(path.join(ROOT, 'js/v8'))];
    for (const file of sources) {
        if (path.resolve(file) === path.resolve(manifestPath)) continue;
        const text = stripComments(fs.readFileSync(file, 'utf8'));
        for (const m of text.matchAll(/(?:\.\/)?assets\/sounds\/[^"'`\s\\)<>]+\.(?:mp3|ogg|wav)/g))
            add(m[0], path.relative(ROOT, file));
    }
    return { refs, manifestFiles: manifestFiles.map(f => f.replace(/^\.\//, '')) };
}
function diskAudioFiles() {
    const out = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (AUDIO_EXT.test(e.name)) out.push(path.relative(ROOT, p));
        }
    })(path.join(ROOT, 'assets/sounds'));
    return out;
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────────
(async () => {
    assertNoStrayHeadless();
    let browser = null, server = null;
    const fails = [], warns = [], errs = [];
    const ok = (n, pass, detail) => {
        console.log(`  ${pass ? '✓' : '✗'} [${n}] ${detail}`);
        if (!pass) fails.push(`[${n}] ${detail}`);
    };
    try {
        server = await startServer();
        const base = 'http://127.0.0.1:' + server.address().port;

        // ── 1. ASSETS RESOLVE ───────────────────────────────────────────────────────────────────────
        const { refs } = collectReferences();
        const disk = new Set(diskAudioFiles());
        const missing = [];
        for (const [rel, sites] of refs) {
            const status = await httpStatus(base, rel);
            if (status !== 200) {
                if (PENDING.has(rel)) warns.push(`PENDING (by design, see harness header): ${rel} → HTTP ${status} — wired ahead of the file landing (referenced by: ${[...sites].join(', ')})`);
                else missing.push(`${rel} → HTTP ${status}  (referenced by: ${[...sites].join(', ')})`);
            } else if (PENDING.has(rel)) {
                warns.push(`${rel} has LANDED — remove it from PENDING in scripts/smoke-audio.js so it is guarded like everything else`);
            }
        }
        ok('1 assets', missing.length === 0,
            `${refs.size} referenced audio files checked over HTTP — ${missing.length === 0 ? 'all 200' : missing.length + ' unreachable'}`);
        for (const m of missing) console.log('      ✗ ' + m);
        const uncatalogued = [...disk].filter(f => !refs.has(f));
        if (uncatalogued.length) {
            warns.push(`${uncatalogued.length} audio file(s) on disk are referenced by NOTHING (not even AudioManifest) — invisible to the game/music page until \`npm run audio:manifest\` is re-run: ${uncatalogued.slice(0, 5).join(', ')}${uncatalogued.length > 5 ? ' …' : ''}`);
        }

        // ── Boot the real game ─────────────────────────────────────────────────────────────────────
        browser = await chromium.launch({ headless: true,
            args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
        await page.goto(base + '/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
        const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
        if (!eng) throw new Error('engine frame not found');
        await sleep(4000);

        // ── 2. GESTURE UNLOCK + AUDIOCONTEXT ────────────────────────────────────────────────────────
        // A real key press on the shell → shell keydown relay (OrigamiUnderworld.html ~:676) → engine
        // gesture bridge (_GESTURE_MSGS, Engine9 ~:3963). This is the path real play takes.
        await page.keyboard.press('Alt');
        let gestured = false;
        for (let i = 0; i < 10 && !gestured; i++) {
            await sleep(500);
            gestured = await eng.evaluate(() => window._userGestured === true);
        }
        ok('2 gesture', gestured, 'window._userGestured after a real shell keypress = ' + gestured
            + (gestured ? ' (bridge fired: ctx + bg-music start + sfx warmup kicked)' : ' — the gesture bridge is dead; EVERY Web Audio sound would be silent in real play'));
        const ctxProof = await eng.evaluate(async () => {
            const out = { engineSucCtx: window._sucAudioCtx ? window._sucAudioCtx.state : '(no _sucAudioCtx handle)' };
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            try { if (ctx.state !== 'running' && ctx.resume) await ctx.resume(); } catch (_) {}
            const t0 = ctx.currentTime;
            await new Promise(r => setTimeout(r, 700));
            out.state = ctx.state; out.t0 = t0; out.t1 = ctx.currentTime;
            try { await ctx.close(); } catch (_) {}
            return out;
        });
        ok('2 context', ctxProof.state === 'running' && ctxProof.t1 > ctxProof.t0,
            `AudioContext in the engine frame: state=${ctxProof.state} · currentTime ${ctxProof.t0.toFixed(3)} → ${ctxProof.t1.toFixed(3)}`
            + ` · engine _sucAudioCtx: ${ctxProof.engineSucCtx}`);

        // ── 4. THE MUSIC GATE (checked before the diag so a gate fault prints with the diag below) ──
        const gate = await eng.evaluate(() => ({
            earned: window._bgMusicEarned,
            cue: (window._composer && typeof window._composer.state === 'function') ? window._composer.state().cue : null,
        }));
        if (!gate.cue) {
            ok('4 gate', false, 'window._composer.state() unavailable — the Composer deck is unreachable');
        } else if (gate.earned !== true) {
            ok('4 gate', gate.cue === 'UNEARNED_MUSIC',
                `_bgMusicEarned=${JSON.stringify(gate.earned)} ⇒ BG deck silent BY DESIGN (register 2026-07-31: music must be FOUND) · winning cue=${gate.cue}`
                + (gate.cue === 'UNEARNED_MUSIC' ? '' : ' — flag says silent but UNEARNED_MUSIC is NOT holding the deck: the gate has rotted'));
        } else {
            ok('4 gate', gate.cue !== 'UNEARNED_MUSIC',
                `_bgMusicEarned=true ⇒ deck must be free · winning cue=${gate.cue}`
                + (gate.cue === 'UNEARNED_MUSIC' ? ' — earned but still silenced: the gate has rotted' : ''));
        }

        // ── 3. _audioDiag VERDICT ───────────────────────────────────────────────────────────────────
        if (BREAK === 'bypass') {
            await eng.evaluate(() => { window._suc3DAudio = 'failed'; });
            console.log('  [break] window._suc3DAudio=\'failed\' injected (in-page only) — the VERDICT check MUST go red');
        }
        const diag = await eng.evaluate(() => (typeof window._audioDiag === 'function') ? window._audioDiag() : null);
        const verdictLine = diag ? (String(diag).split('\n').find(l => /^VERDICT:/.test(l)) || '(no VERDICT line)') : '(no _audioDiag)';
        const verdictClean = !!diag && /^VERDICT:/.test(verdictLine) && !verdictLine.includes('🚨');
        ok('3 diag', verdictClean, verdictLine);
        if (!verdictClean && diag) { console.log('  ── full _audioDiag() ──'); console.log(String(diag)); }

        // ── 5. A SONG ACTUALLY PLAYS (graph-level: clock advances + non-silent RMS) ─────────────────
        const tracks = await eng.evaluate(() => {
            const out = [];
            try { (window._composerTracksProbe ? window._composerTracksProbe() : []).forEach(t => t && out.push(t)); } catch (_) {}
            if (typeof window._cabSongFileActive === 'string') out.push(window._cabSongFileActive);
            return [...new Set(out)];
        });
        ok('5 tracklist', tracks.length > 0, `Composer exposes ${tracks.length} playable track reference(s)`);
        const play = tracks.length ? await eng.evaluate(async (list) => {
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            try { if (ctx.state !== 'running' && ctx.resume) await ctx.resume(); } catch (_) {}
            const rows = [];
            for (const url of list.slice(0, 3)) {
                const row = { file: String(url).split('/').pop(), t: 0, rms: 0, err: null };
                try {
                    const a = new Audio(url); a.preload = 'auto'; a.volume = 1;
                    const src = ctx.createMediaElementSource(a);
                    const an = ctx.createAnalyser(); an.fftSize = 2048;
                    src.connect(an); an.connect(ctx.destination);
                    const buf = new Float32Array(an.fftSize);
                    await a.play();
                    for (let i = 0; i < 40; i++) {                       // up to 6s per track
                        await new Promise(r => setTimeout(r, 150));
                        an.getFloatTimeDomainData(buf);
                        let s = 0; for (let k = 0; k < buf.length; k++) s += buf[k] * buf[k];
                        row.rms = Math.max(row.rms, Math.sqrt(s / buf.length));
                        row.t = a.currentTime;
                        if (row.rms > 0.01 && row.t > 0.5) break;
                    }
                    a.pause(); try { src.disconnect(); an.disconnect(); } catch (_) {}
                } catch (e) { row.err = String(e && e.message || e).slice(0, 120); }
                rows.push(row);
                if (rows.some(r => r.rms > 0.005 && r.t > 0.5)) break;   // one honest success is the assertion
            }
            try { await ctx.close(); } catch (_) {}
            return rows;
        }, tracks) : [];
        const played = play.find(r => r.t > 0.5 && r.rms > 0.005);
        ok('5 playback', !!played,
            play.map(r => `${r.file}: t=${r.t.toFixed(2)}s maxRMS=${r.rms.toFixed(4)}${r.err ? ' ERR ' + r.err : ''}`).join(' · ')
            + (played ? '  → the graph is FED (non-silent samples reached the analyser)' : '  → no track produced non-silent samples'));

        if (errs.length) fails.push(`${errs.length} pageerror(s): ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
        console.log('[pageerrors] ' + (errs.length ? errs.length : '0'));
        for (const w of warns) console.log('  ⚠ WARN: ' + w);
        console.log('\n' + (fails.length
            ? '❌ smoke:audio FAIL — ' + fails.join(' · ')
            : '✅ smoke:audio PASS — audio graph wired and fed (assets 200, gesture bridge live, ctx running, gate as documented, diag clean, non-silent RMS). Headless proves WIRING, never audibility.'));
    } catch (e) {
        fails.push(String(e && e.stack || e));
        console.error('\n❌ smoke:audio FAIL — ' + (e && e.message || e));
    } finally {
        // Orphaned-browser guard: close browser → close server → settle 300ms → exit.
        try { if (browser) await browser.close(); } catch (_) {}
        try { if (server) await new Promise(r => server.close(r)); } catch (_) {}
        await sleep(300);
        process.exit(fails.length ? 1 : 0);
    }
})();
