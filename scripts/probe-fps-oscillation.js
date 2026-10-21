#!/usr/bin/env node
/**
 * probe-fps-oscillation.js — objective oscillation detector (REBUILT 2026-07-16).
 *
 * HISTORY: born 2026-06-08 (Worker 4) for the 63↔34 bounce. Silently DEAD 2026-07-03 →
 * 2026-07-16: its frame regex matched Engine8.html after the engine was renamed Engine9.html,
 * so it exited 2 ("iframe not found") on every run for two weeks. It also read
 * `window.oniBaba8.sensors.*` inside the ENGINE iframe — but the real Oni-Baba instance lives
 * on the TOP SHELL window (OniBaba8.js:2143, script-loaded by NewOrigami.9.html:279), so the
 * sensor series never populated. And it read #hud-pct, an element that no longer exists.
 *
 * WHY THIS EXISTS: absolute FPS is NOT headless-measurable (default headless = SwiftShader
 * software raster; RAF throttling). But the *signature* of an adaptive-quality feedback loop
 * fighting itself IS observable in the SHAPE of the frame-time series, which is
 * renderer-independent.
 *
 * THE CALCULATION (2026-07-16 research, plan fix-the-probes-ancient-minsky.md):
 *   • Collect PER-FRAME deltas (ms) in the engine iframe — not 250ms fps buckets.
 *   • PRIMARY signal: lag-1 autocorrelation of frame times. A feedback loop hunting between
 *     two regimes produces long/short alternation ⇒ strongly NEGATIVE lag-1 (< -0.30). This is
 *     the rigorous form of "sign reversals"; the raw reversal count saturates on micro-jitter
 *     and is demoted to a diagnostic.
 *   • SECONDARY: coefficient of variation (CV) — a loop hunting also inflates jitter. Require
 *     real amplitude (CV > 0.10) so a flat-but-alternating ±0.1ms series can't false-positive.
 *   • fpsHealth-pinned check: read window.oniBaba8.sensors.fpsHealth on the TOP window; the
 *     legacy 4-step sensor pins at exactly 0.50 for any fps in [30,60) — flat mid-band health
 *     alongside an oscillating frame series corroborates a regression.
 *
 * Exit 0 = STABLE (or headless-informational). Exit 1 = OSCILLATION SIGNATURE. Exit 2 = harness.
 * Reports only; NEVER prescribes throttling (FPS.md §0/§4).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = process.env.SMOKE_ENTRY || 'OrigamiUnderworld.html';
const WARMUP_MS = parseInt(process.env.WARMUP_MS || '8000', 10);
const SAMPLE_MS = parseInt(process.env.SAMPLE_MS || '12000', 10);
// Oscillation gate: lag-1 autocorrelation below this = alternating regime.
const AUTOCORR_FAIL = parseFloat(process.env.AUTOCORR_FAIL || '-0.30');
const CV_FLOOR = parseFloat(process.env.CV_FLOOR || '0.10');

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

// Series analysis: lag-1 autocorrelation (primary), CV, amplitude, sign reversals (diagnostic).
function analyze(series) {
    const xs = series.filter(n => typeof n === 'number' && isFinite(n) && n > 0);
    if (xs.length < 30) return { n: xs.length, usable: false };
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    let ac = 0;
    if (sd > 1e-6) {
        let num = 0;
        for (let i = 1; i < xs.length; i++) num += (xs[i] - mean) * (xs[i - 1] - mean);
        ac = num / ((xs.length - 1) * sd * sd);
    }
    let reversals = 0, prevSign = 0;
    for (let i = 1; i < xs.length; i++) {
        const d = xs[i] - xs[i - 1];
        const s = d > 1e-6 ? 1 : d < -1e-6 ? -1 : 0;
        if (s !== 0 && prevSign !== 0 && s !== prevSign) reversals++;
        if (s !== 0) prevSign = s;
    }
    const min = Math.min(...xs), max = Math.max(...xs);
    return {
        n: xs.length, usable: true,
        mean: +mean.toFixed(2), cv: +(sd / mean).toFixed(3),
        autocorr1: +ac.toFixed(3),
        reversals, reversalRate: +(reversals / (xs.length - 1)).toFixed(2),
        amplitude: +(max - min).toFixed(2), min: +min.toFixed(2), max: +max.toFixed(2),
    };
}

// One measurement attempt under one launch config. rAF starvation is REAL and nondeterministic
// in headless (verified 2026-07-16: GPU configs starve without a display sink unless uncapped;
// the SwiftShader shell sometimes starves too) — so try configs in order until frames flow.
async function attemptRun(opts, port) {
    let browser;
    try { browser = await chromium.launch(opts); }
    catch (e) { return { skip: String(e.message).split('\n')[0].slice(0, 80) }; }
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(`[top] ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 200)}`); });

        await page.goto(`http://127.0.0.1:${port}/${ENTRY}`, { waitUntil: 'domcontentloaded' });
        // __engineReady is a TOP-SHELL flag (OrigamiUnderworld.html:562) — correct frame for this wait.
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 60000 });
        await page.bringToFront();

        // Engine8.html → Engine9.html rename (2026-07-03) silently killed this probe for two
        // weeks. Match both arms so a future rename degrades to a miss, not a dead tool.
        const engineFrame = page.frames().find(f => /Engine[89]\.html/.test(f.url()));
        if (!engineFrame) { await browser.close(); return { skip: 'engine iframe not found' }; }

        // Per-frame delta recorder (ms) in the engine frame — the series whose SHAPE we analyze.
        await engineFrame.evaluate(() => {
            window.__ftms = [];
            let last = performance.now();
            (function tick(t) {
                window.__ftms.push(t - last); last = t;
                if (window.__ftms.length > 60000) window.__ftms.shift();
                requestAnimationFrame(tick);
            })(last);
        });
        await page.waitForTimeout(WARMUP_MS);
        const warmCount = await engineFrame.evaluate(() => window.__ftms.length);
        if (warmCount < 30) { await browser.close(); return { starved: warmCount }; }
        await engineFrame.evaluate(() => { window.__ftms.length = 0; });

        // Sensor sampler on the TOP window (where window.oniBaba8 actually lives — the pre-2026-07-16
        // version read it in the ENGINE frame and got undefined for its whole life).
        const health = [], rogue = [];
        const tEnd = Date.now() + SAMPLE_MS;
        while (Date.now() < tEnd) {
            const r = await page.evaluate(() => {
                const ob = window.oniBaba8;
                return ob && ob.sensors ? { health: ob.sensors.fpsHealth, rogue: ob.sensors.rogueAi } : {};
            }).catch(() => ({}));
            if (typeof r.health === 'number') health.push(r.health);
            if (typeof r.rogue === 'number') rogue.push(r.rogue);
            await page.waitForTimeout(500);
        }
        const deltas = await engineFrame.evaluate(() => window.__ftms.slice());
        await browser.close();
        return { deltas, health, rogue, errors };
    } catch (e) {
        try { await browser.close(); } catch (_) {}
        return { skip: 'attempt error: ' + String(e.message).split('\n')[0].slice(0, 120) };
    }
}

(async () => {
    const server = await startServer();
    const port = server.address().port;
    const gpuArgs = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];
    const uncap = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
    const antiThrottle = ['--no-sandbox', '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling'];
    const configs = [
        { opts: { channel: 'chromium', headless: true, args: [...gpuArgs, ...uncap, ...antiThrottle] }, mode: 'headless chromium + GPU, uncapped' },
        { opts: { headless: true, args: antiThrottle }, mode: 'bundled headless-shell (software)' },
    ];
    let run = null;
    for (const cfg of configs) {
        console.log(`[probe-fps-osc] trying: ${cfg.mode}`);
        const r = await attemptRun(cfg.opts, port);
        if (r.skip) { console.log(`  → skipped: ${r.skip}`); continue; }
        if (r.starved !== undefined) { console.log(`  → rAF starved (${r.starved} frames in warmup) — falling back`); continue; }
        run = r; break;
    }
    await new Promise(r => server.close(r));
    if (!run) {
        console.log('\n[probe-fps-osc] HEADLESS-INFORMATIONAL — no config delivered frames. Run HEADED=1 probe-fps.js.');
        process.exit(0);
    }
    const { deltas, health, rogue, errors } = run;

    const aFt = analyze(deltas);
    // fpsHealth "pinned mid-band": flat (amp < 0.02) inside [0.45,0.55] — the legacy 4-step
    // sensor's [30,60)→0.50 plateau. (If the sensor is upgraded to a continuous map this stays
    // valid: a genuinely flat mid-band health alongside real frame-time variance is the tell.)
    let healthPinned = false, hStat = null;
    if (health.length >= 4) {
        const hMin = Math.min(...health), hMax = Math.max(...health);
        hStat = { n: health.length, min: hMin, max: hMax };
        healthPinned = (hMax - hMin) < 0.02 && hMin >= 0.45 && hMax <= 0.55;
    }

    console.log('\n[probe-fps-osc] oscillation / stability lens (frame-time series shape)');
    if (errors.length) { console.log(`  ⚠ ${errors.length} console/page error(s):`); errors.slice(0, 6).forEach(e => console.log('    ' + e)); }
    if (aFt.usable) {
        console.log(`  frame-times: n=${aFt.n} mean=${aFt.mean}ms cv=${aFt.cv} range [${aFt.min}..${aFt.max}]ms`);
        console.log(`  lag-1 autocorr = ${aFt.autocorr1}  (< ${AUTOCORR_FAIL} = alternating regime)`);
        console.log(`  sign reversals = ${aFt.reversals} (${aFt.reversalRate}/frame — diagnostic only; saturates on micro-jitter)`);
    } else {
        console.log(`  frame-times: only ${aFt.n} samples — RAF throttled; series unusable.`);
    }
    console.log(`  fpsHealth (TOP window): ${hStat ? `n=${hStat.n} [${hStat.min}..${hStat.max}]${healthPinned ? '  ⚠ PINNED mid-band ~0.5' : ''}` : 'not readable'}`);
    console.log(`  rogueAi   (TOP window): ${rogue.length ? rogue[rogue.length - 1] : 'not readable'}`);

    if (!aFt.usable && !hStat) {
        console.log('\n[probe-fps-osc] HEADLESS-INFORMATIONAL — no usable series. Run HEADED=1 probe-fps.js on real hardware.');
        process.exit(0);
    }
    const oscillating = aFt.usable && aFt.autocorr1 < AUTOCORR_FAIL && aFt.cv > CV_FLOOR;
    if (oscillating || healthPinned) {
        console.log(`\n[probe-fps-osc] ❌ OSCILLATION SIGNATURE${oscillating ? ` (autocorr ${aFt.autocorr1} < ${AUTOCORR_FAIL} with CV ${aFt.cv})` : ''}${healthPinned ? ' + fpsHealth pinned mid-band' : ''} — the adaptive-feedback fingerprint. Remedy: RETIRE the feedback loop. NEVER throttle.`);
        process.exit(1);
    }
    console.log('\n[probe-fps-osc] ✅ STABLE — no alternating-regime signature (absolute FPS remains Mark\'s hardware gate).');
    process.exit(0);
})().catch(e => { console.error('[probe-fps-osc] harness error:', e); process.exit(2); });
