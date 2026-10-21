#!/usr/bin/env node
/**
 * probe-fps.js — frame-time distribution probe (REBUILT 2026-07-16, researched calculation)
 *
 * The 2026-06-08 original (T0.12) was dead on the current tree: it targeted /Engine8\.html/
 * (renamed Engine9 on 2026-07-03 → silent exit 2 forever) and read #hud-rt/#hud-proj/#hud-pct,
 * elements that no longer exist anywhere. It also averaged fps buckets — a mean of a
 * reciprocal, which hides spikes (59 frames @60fps + one 62ms freeze "averages fine").
 *
 * WHAT THIS MEASURES NOW (2026-07-16 measurement research, plan fix-the-probes-ancient-minsky.md):
 *   • PER-FRAME DELTAS in ms (rAF timestamp diffs) in the ENGINE iframe — never fps buckets.
 *   • Distribution stats: p50/p95/p99/max frame-time, mean (secondary), CV (jitter),
 *     jank count (>2× median AND >16.7ms absolute) plus TOTAL janky ms,
 *     lag-1 autocorrelation (strongly negative = alternating long/short regime — the rigorous
 *     form of the 63↔34 oscillation signature).
 *   • The WebGL rasterizer string (UNMASKED_RENDERER_WEBGL) — labeled every run; absolute
 *     numbers are only trusted on HARDWARE + paced (HEADED) runs.
 *   • Estimated display refresh (p10 of deltas snapped to a standard Hz) — under vsync RAF caps
 *     at the PHYSICAL refresh: 60Hz panel ⇒ 60fps forever, and that is correct, not stress.
 *   • Engine's own eye: PERF_MONITOR_UPDATE payloads captured on the TOP page (smoothedFps
 *     series) + Oni-Baba sensors read from the TOP window (window.oniBaba8 lives on the SHELL,
 *     never the engine iframe — OniBaba8.js:2143 / NewOrigami.9.html:279).
 *
 * MODES (runtime fallback — a config can LAUNCH fine yet starve rAF; verified 2026-07-16:
 * headless+Metal-GPU created a real ANGLE Apple M3 context but delivered ~2 frames in 16s
 * because no display sink requests BeginFrames; the uncap flags free-run it):
 *   default   headless — GPU+uncapped throughput first (relative-only), falls back to the
 *             SwiftShader shell (relative-only) if frames don't flow.
 *   HEADED=1  real visible Chrome, Metal GPU, vsync-paced — the ABSOLUTE-numbers mode.
 *
 * GATING — report-only by default (exit 0). Opt-in: FAIL_BELOW_P50_FPS=<n> exits 1 below n,
 * but ONLY on a hardware PACED run unless ALLOW_SOFTWARE_GATE=1. NEVER prescribes throttling
 * (FPS.md §0/§4).
 *
 *   node scripts/probe-fps.js
 *   HEADED=1 SAMPLE_MS=30000 node scripts/probe-fps.js
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = process.env.SMOKE_ENTRY || 'OrigamiUnderworld.html';
const WARMUP_MS = parseInt(process.env.WARMUP_MS || '8000', 10);
const SAMPLE_MS = parseInt(process.env.SAMPLE_MS || '15000', 10);
const HEADED = process.env.HEADED === '1';
const FAIL_BELOW_P50_FPS = process.env.FAIL_BELOW_P50_FPS ? parseFloat(process.env.FAIL_BELOW_P50_FPS) : null;
const ALLOW_SOFTWARE_GATE = process.env.ALLOW_SOFTWARE_GATE === '1';

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.mjs':'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.webp': 'image/webp',
};
function startServer() {
    return new Promise(res => {
        const srv = http.createServer((req, rs) => {
            const u = decodeURIComponent(req.url.split('?')[0]);
            const f = path.join(ROOT, u === '/' ? '/' + ENTRY : u);
            if (!f.startsWith(ROOT)) { rs.statusCode = 403; return rs.end(); }
            fs.readFile(f, (err, data) => {
                if (err) { rs.statusCode = 404; return rs.end(err.code); }
                rs.setHeader('Content-Type', MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
                rs.setHeader('Access-Control-Allow-Origin', '*');
                rs.end(data);
            });
        });
        srv.listen(0, '127.0.0.1', () => res(srv));
    });
}

// ── Statistics over frame-time ms (research-backed: percentiles + CV + autocorr, never mean-fps) ──
function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; }
function stats(deltas) {
    const xs = deltas.filter(n => typeof n === 'number' && isFinite(n) && n > 0);
    if (xs.length < 30) return { usable: false, n: xs.length };
    const sorted = [...xs].sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    const p50 = pct(sorted, 0.50), p95 = pct(sorted, 0.95), p99 = pct(sorted, 0.99);
    const max = sorted[sorted.length - 1], p10 = pct(sorted, 0.10);
    // Jank: relative (>2× median) AND absolute (>16.7ms = missed 60Hz frame). A count alone
    // treats a 17ms and a 500ms frame identically, so also total the janky milliseconds.
    const jankThresh = Math.max(2 * p50, 16.7);
    const janky = xs.filter(d => d > jankThresh);
    // Lag-1 autocorrelation of the frame-time series. Strongly NEGATIVE = alternating long/short
    // regime (the adaptive-feedback / mismatched-present beat). Near 0 = uncorrelated jitter.
    let ac = 0;
    if (xs.length > 2 && sd > 1e-6) {
        let num = 0;
        for (let i = 1; i < xs.length; i++) num += (xs[i] - mean) * (xs[i - 1] - mean);
        ac = num / ((xs.length - 1) * sd * sd);
    }
    return {
        usable: true, n: xs.length,
        p50: +p50.toFixed(2), p95: +p95.toFixed(2), p99: +p99.toFixed(2), max: +max.toFixed(2),
        mean: +mean.toFixed(2), cv: +(sd / mean).toFixed(3),
        jankCount: janky.length, jankMs: +janky.reduce((a, b) => a + b, 0).toFixed(0),
        jankThresh: +jankThresh.toFixed(1),
        autocorr1: +ac.toFixed(3),
        p10: +p10.toFixed(2),
        fpsP50: +(1000 / p50).toFixed(1), fps1pctLow: +(1000 / p99).toFixed(1),
    };
}
// Snap the fastest-decile interval to a standard refresh rate. Only meaningful on PACED runs
// (vsync on); uncapped/software runs report raw with no snap claim.
function refreshEstimate(p10ms) {
    if (!p10ms || !isFinite(p10ms)) return null;
    const rawHz = 1000 / p10ms;
    const std = [60, 75, 90, 120, 144, 165, 240];
    let best = std[0];
    for (const hz of std) if (Math.abs(hz - rawHz) < Math.abs(best - rawHz)) best = hz;
    return { rawHz: +rawHz.toFixed(1), snapped: (Math.abs(best - rawHz) / best <= 0.12) ? best : null };
}

// Launch configs, tried IN ORDER until one actually delivers frames. Verified 2026-07-16 on this
// machine: headless channel:'chromium' + Metal GPU flags creates a REAL hardware context (ANGLE
// Apple M3) but rAF starves (~2 frames/16s — no display sink → no BeginFrames) unless the frame
// rate is uncapped; the bundled SwiftShader shell runs rAF freely but rasterizes in software.
function launchConfigs() {
    const gpuArgs = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];
    const uncap = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
    const antiThrottle = [
        '--no-sandbox',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    ];
    if (HEADED) {
        // Real Chrome, visible, on-screen (an offscreen --window-position can still be treated as
        // occluded on macOS). Vsync stays ON — pacing is the thing under test. ABSOLUTE mode.
        return [{ opts: { channel: 'chrome', headless: false, args: [...gpuArgs, '--window-position=0,0', ...antiThrottle] }, mode: 'HEADED chrome (Metal GPU, vsync-paced — ABSOLUTE numbers)', paced: true }];
    }
    return [
        { opts: { channel: 'chromium', headless: true, args: [...gpuArgs, ...uncap, ...antiThrottle] }, mode: 'headless chromium + Metal GPU, UNCAPPED (throughput, relative-only)', paced: false },
        { opts: { channel: 'chrome', headless: true, args: [...gpuArgs, ...uncap, ...antiThrottle] }, mode: 'headless chrome + Metal GPU, UNCAPPED (throughput, relative-only)', paced: false },
        { opts: { headless: true, args: antiThrottle }, mode: 'bundled headless-shell (SOFTWARE raster, relative-only)', paced: false },
    ];
}

// One full measurement attempt under one launch config. Returns:
//   { skip }                — channel not installed
//   { starved, renderer }   — launched but rAF didn't flow during warmup (try next config)
//   { deltas, renderer, sensors, perfSeen, visibility, errors }  — success
async function measure(cfg, port) {
    let browser;
    try { browser = await chromium.launch(cfg.opts); }
    catch (e) { return { skip: 'not launchable (' + String(e.message).split('\n')[0].slice(0, 80) + ')' }; }
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(`[top] ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 200)}`); });

        // Engine-eye capture: PERF_MONITOR_UPDATE arrives on the TOP page (engine posts to parent).
        await page.addInitScript(() => {
            window.__probePerf = [];
            window.addEventListener('message', e => {
                if (e.data && e.data.type === 'PERF_MONITOR_UPDATE') {
                    window.__probePerf.push({ fps: e.data.smoothedFps, budget: e.data.frameBudgetPct, hz: e.data.displayRefreshHz });
                    if (window.__probePerf.length > 600) window.__probePerf.shift();
                }
            });
        });

        await page.goto(`http://127.0.0.1:${port}/${ENTRY}`, { waitUntil: 'domcontentloaded' });
        // __engineReady lives on the TOP SHELL window (OrigamiUnderworld.html:562), not the engine iframe.
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 60000 });
        await page.bringToFront();
        const visibility = await page.evaluate(() => document.visibilityState);

        // Engine8.html → Engine9.html rename (2026-07-03) killed the old probe silently. Match both.
        const eng = page.frames().find(f => /Engine[89]\.html/.test(f.url()));
        if (!eng) { await browser.close(); return { skip: 'engine iframe not found' }; }

        const renderer = await eng.evaluate(() => {
            try {
                const c = document.createElement('canvas');
                const gl = c.getContext('webgl2') || c.getContext('webgl');
                if (!gl) return { kind: 'NONE', str: '(WebGL context creation failed)' };
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                const str = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
                const kind = /swiftshader|software|llvmpipe/i.test(str || '') ? 'SOFTWARE' : 'HARDWARE';
                return { kind, str: String(str) };
            } catch (e) { return { kind: 'NONE', str: 'probe error: ' + e.message }; }
        });

        // Per-frame delta recorder in the ENGINE frame.
        await eng.evaluate(() => {
            window.__ftms = [];
            let last = performance.now();
            (function tick(t) {
                window.__ftms.push(t - last); last = t;
                if (window.__ftms.length > 120000) window.__ftms.shift();
                requestAnimationFrame(tick);
            })(last);
        });
        await page.waitForTimeout(WARMUP_MS);
        // Frame-flow check: a config that starves rAF measures nothing — fall back, don't lie.
        const warmCount = await eng.evaluate(() => window.__ftms.length);
        if (warmCount < 30) { await browser.close(); return { starved: warmCount, renderer }; }
        await eng.evaluate(() => { window.__ftms.length = 0; });   // warmup frames never pollute the distribution
        await page.waitForTimeout(SAMPLE_MS);

        const deltas = await eng.evaluate(() => window.__ftms.slice());
        // Oni-Baba sensors live on the TOP window ONLY (the old oscillation probe read them in the
        // engine frame and always got undefined).
        const sensors = await page.evaluate(() => {
            const ob = window.oniBaba8;
            if (!ob || !ob.sensors) return null;
            const s = ob.sensors;
            return { fpsHealth: s.fpsHealth, renderStress: s.renderStress, rogueAi: s.rogueAi, tension: s.tension, silence: s.silence, baseline: ob._fpsBaseline ?? null };
        });
        const perfSeen = await page.evaluate(() => {
            const a = window.__probePerf || [];
            if (!a.length) return null;
            const fps = a.map(x => x.fps).filter(n => typeof n === 'number');
            const hz = a.map(x => x.hz).filter(n => typeof n === 'number' && n > 0);
            return { n: a.length, lastFps: fps[fps.length - 1] ?? null, minFps: fps.length ? Math.min(...fps) : null, maxFps: fps.length ? Math.max(...fps) : null, engineHz: hz.length ? hz[hz.length - 1] : 0 };
        });
        await browser.close();
        return { deltas, renderer, sensors, perfSeen, visibility, errors };
    } catch (e) {
        try { await browser.close(); } catch (_) {}
        return { skip: 'attempt error: ' + String(e.message).split('\n')[0].slice(0, 120) };
    }
}

(async () => {
    const server = await startServer();
    const port = server.address().port;

    let result = null, mode = null, paced = false;
    for (const cfg of launchConfigs()) {
        console.log(`[probe-fps] trying: ${cfg.mode}`);
        const r = await measure(cfg, port);
        if (r.skip) { console.log(`  → skipped: ${r.skip}`); continue; }
        if (r.starved !== undefined) {
            console.log(`  → rAF starved (${r.starved} frames in ${WARMUP_MS}ms warmup; renderer ${r.renderer?.kind}) — falling back`);
            continue;
        }
        result = r; mode = cfg.mode; paced = !!cfg.paced; break;
    }
    await new Promise(r => server.close(r));
    if (!result) { console.error('[probe-fps] ❌ no launch config delivered frames.'); process.exit(2); }

    const { deltas, renderer, sensors, perfSeen, visibility, errors } = result;
    console.log(`\n[probe-fps] mode=${mode}`);
    console.log(`[probe-fps] renderer=${renderer.kind} · ${renderer.str}`);
    console.log(`[probe-fps] visibility=${visibility} · sampled ${SAMPLE_MS}ms after ${WARMUP_MS}ms warmup`);

    const s = stats(deltas);
    if (!s.usable) {
        console.log(`[probe-fps] ❌ only ${s.n} frame samples survived — no verdict.`);
        process.exit(2);
    }
    const ref = paced ? refreshEstimate(s.p10) : null;

    console.log('\n[probe-fps] FRAME-TIME DISTRIBUTION (ms — lower is better)');
    console.log(`  frames sampled : ${s.n}`);
    console.log(`  p50 / p95 / p99: ${s.p50} / ${s.p95} / ${s.p99}   max ${s.max}   mean ${s.mean}`);
    console.log(`  fps @p50       : ${s.fpsP50}   1%-low fps: ${s.fps1pctLow}`);
    console.log(`  jitter CV      : ${s.cv}${s.cv > 0.3 ? '  ⚠ high' : ''}`);
    console.log(`  jank >${s.jankThresh}ms  : ${s.jankCount} frame(s) · ${s.jankMs}ms total janky time`);
    console.log(`  lag-1 autocorr : ${s.autocorr1}${s.autocorr1 < -0.3 ? '  ⚠ ALTERNATING REGIME (oscillation signature)' : ''}`);
    if (ref) {
        console.log(`  est. refresh   : ${ref.snapped ? ref.snapped + 'Hz (p10 raw ' + ref.rawHz + 'fps)' : 'unclear (p10 raw ' + ref.rawHz + 'fps)'}`);
        if (ref.snapped && Math.abs(s.fpsP50 - ref.snapped) / ref.snapped < 0.05) {
            console.log(`  → p50 fps ≈ display refresh: VSYNC-CAPPED, pacing clean. ${ref.snapped}fps on a ${ref.snapped}Hz display is CORRECT, not stress (FPS.md §2).`);
        }
    }
    if (perfSeen) console.log(`\n  engine's own eye (PERF_MONITOR_UPDATE ×${perfSeen.n}): last ${perfSeen.lastFps} fps · range [${perfSeen.minFps}..${perfSeen.maxFps}]${perfSeen.engineHz ? ` · engine refresh estimate ${perfSeen.engineHz}Hz` : ''}`);
    if (sensors) console.log(`  Oni-Baba (TOP window): fpsHealth=${sensors.fpsHealth} renderStress=${sensors.renderStress} rogueAi=${sensors.rogueAi} baseline=${sensors.baseline}`);
    else console.log('  Oni-Baba: not readable on top window (unexpected — check OniBaba8.js load)');
    if (errors.length) { console.log(`\n  ⚠ ${errors.length} console/page error(s):`); errors.slice(0, 5).forEach(e => console.log('    ' + e)); }

    console.log('\n[probe-fps] LIMITS:');
    if (!paced) {
        console.log('  • UNPACED/headless run — numbers are RELATIVE (same-mode baseline comparisons only).');
        console.log('    For absolute paced numbers on this machine: HEADED=1 node scripts/probe-fps.js');
    } else if (renderer.kind === 'HARDWARE') {
        console.log('  • hardware + paced — absolute numbers valid for THIS machine/display.');
        console.log('    Under vsync, fps caps at the physical display refresh; 120fps needs a 120Hz panel.');
    } else {
        console.log(`  • paced but renderer is ${renderer.kind} — treat magnitudes with suspicion.`);
    }
    console.log('  • This probe observes only. Recover fps by cutting lights/overdraw/culling — never throttle (FPS.md §0).');

    if (FAIL_BELOW_P50_FPS != null) {
        const gateValid = (paced && renderer.kind === 'HARDWARE') || ALLOW_SOFTWARE_GATE;
        if (!gateValid) {
            console.log(`\n[probe-fps] gate skipped — FAIL_BELOW_P50_FPS=${FAIL_BELOW_P50_FPS} needs a HEADED hardware run (or ALLOW_SOFTWARE_GATE=1).`);
        } else if (s.fpsP50 < FAIL_BELOW_P50_FPS) {
            console.log(`\n[probe-fps] ❌ GATE: p50 ${s.fpsP50} fps < ${FAIL_BELOW_P50_FPS}`);
            process.exit(1);
        } else {
            console.log(`\n[probe-fps] ✅ GATE: p50 ${s.fpsP50} fps ≥ ${FAIL_BELOW_P50_FPS}`);
        }
    }
    process.exit(0);
})().catch(e => { console.error('[probe-fps] harness error:', e); process.exit(2); });
