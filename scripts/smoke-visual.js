#!/usr/bin/env node
/**
 * G-VISUAL — real screenshot-diff smoke. Replaces the unconditional-green 6-line stub (TASK-07, 2026-08-11).
 *
 * WHAT THIS PROVES / CANNOT PROVE — read before trusting a green OR a red:
 *   • Headless rendering is ANGLE (Metal/SwiftShader), NOT Mark's GPU, driver, or monitor. Pixels here can
 *     legitimately differ from what he sees. This harness catches REGRESSIONS AGAINST ITS OWN BASELINES.
 *     It is NOT evidence of visual quality, and NEVER evidence about frame rate. Do not cite its shots
 *     as "how the game looks".
 *   • The scene is deliberately animated (torch flicker, Zzz sprites, crowd, dense animating UI — all
 *     intentional, never "declutter"). Each scene therefore carries a MOTION MASK measured at baseline
 *     time: pixels that varied across NFRAMES shots of an UNCHANGED build are excluded from the diff.
 *     Mask coverage is printed per scene; a mask that eats the screen would make the scene vacuous, so
 *     coverage > MASK_MAX_COVERAGE_PCT fails the baseline run loudly instead of shipping a stub.
 *   • The dungeon seed is PINNED (sessionStorage 'origami.v8.seed', read at Engine9 ~:3460) before any
 *     page script runs, so the map is identical every run. The harness VERIFIES the engine adopted it —
 *     an unpinned seed means every baseline is of a different dungeon and the diff is meaningless.
 *   • Per settled method law: every capture is gated on renderer.info counts (programs/geometries/
 *     textures) holding STILL for >= 5s. An un-settled measurement is noise dressed as data.
 *   • Compare rule: NFRAMES shots are taken and the MINIMUM diff vs baseline wins. Animation phase makes
 *     any single frame differ; a real structural change differs in EVERY frame, so the minimum is the
 *     honest signal.
 *
 * MODES
 *   node scripts/smoke-visual.js                      compare against baselines; exit 1 on drift/error
 *   UPDATE_BASELINE=1 node scripts/smoke-visual.js    (re)capture baselines + masks — explicit, never silent
 *   SMOKE_VISUAL_BREAK=1 node scripts/smoke-visual.js self-test: raises hemisphereLight.intensity (0.067 →
 *                                                     0.8, in-page only, nothing on disk) before capture.
 *                                                     The run MUST go red — proves the harness can fail.
 *
 * THRESHOLDS are per-scene and MEASURED, not felt: 5 compare runs on an unchanged build recorded the
 * natural min-frame variance; each threshold sits above the observed maximum (numbers in THRESHOLDS).
 *
 * Baselines live in .probe-shots/baseline/visual/ (PNG + mask PNG + visual-manifest.json).
 * No engine files are touched. One headless browser, foreground, closed before exit.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_DIR = path.join(ROOT, '.probe-shots', 'baseline', 'visual');
const FAIL_DIR = path.join(ROOT, '.probe-shots');
const UPDATE = process.env.UPDATE_BASELINE === '1';
const BREAK = process.env.SMOKE_VISUAL_BREAK === '1';

const PINNED_SEED = '812114201';        // any fixed digits; engine adopts it verbatim (Engine9 ~:3460)
const VIEW = { width: 1280, height: 800 };
const NFRAMES = 8;                       // shots per scene (mask sampling + min-diff compare)
const FRAME_GAP_MS = 700;
const PIXTOL = 12;                       // per-channel delta below this = "same pixel" (torch flicker ripple)
const MASK_MAX_COVERAGE_PCT = 45;        // baseline aborts above this — the scene would be vacuous
const SETTLE_HOLD_SAMPLES = 6;           // 6 samples at 1s spacing = counts still for >= 5s
const SETTLE_TIMEOUT_MS = 150000;

// MEASURED natural variance (2026-08-11, 5 compare runs on an unchanged build, pinned seed above):
//   spawn   min-diff per run: 0.419 / 0.987 / 0.884 / 0.766 / 0.738  → observed max 0.99%
//   cabaret min-diff per run: 0.274 / 0.440 / 0.373 / 0.365 / 0.441  → observed max 0.44%
//   body    min-diff per run: 0.376 / 0.553 / 0.527 / 0.397 / 0.436  → observed max 0.55%
// Threshold = ~2x observed max — above the noise, far below a real change (the break self-test's 180°
// facing flip measured 29.9% / 12.1% / 46.6% against the final baselines; with the footer git-sha strip
// masked, natural noise dropped further to 0.07-0.22%).
// RE-BASELINED 2026-09-12 (Mark GO "lets proceed to a5 a6"): the 08-11 baselines were of an older look (60-75% drift on every
// scene = the game changed, not a regression). MEASURED on the new set: spawn 0.197 / cabaret 0.104 / body 0.009 min-diff
// run-to-run; the 180° break flip measured 50.1 / 0.785 / 41.4. The cabaret is the DORMANT, unlit room, so even facing
// south (the permit card + stage kanji) a full flip moves only 0.785% of pixels — the old 1.2% threshold would have let a
// wrong-facing cabaret PASS (measured). Its threshold is therefore 0.4%: 4x its noise, half its flip.
const THRESHOLDS = {                     // % of unmasked pixels allowed to differ (min over NFRAMES)
    spawn: 2.0,
    cabaret: 0.4,
    body: 1.5,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── One-headless-Chrome law: refuse to stack a browser on top of someone else's ─────────────────────
function assertNoStrayHeadless() {
    let out = '';
    try { out = execSync('ps aux | grep chrome-headless-shell | grep -v grep || true', { encoding: 'utf8' }).trim(); } catch (_) {}
    if (out) {
        console.error('✗ ABORT: a chrome-headless-shell is ALREADY RUNNING — refusing to stack a second one');
        console.error(out);
        process.exit(2);
    }
}

// ── Static server (full MIME map — a trimmed map served .mjs as octet-stream and the engine never booted) ──
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

// ── Minimal PNG codec (zero new dependencies; 8-bit RGB/RGBA, non-interlaced — what Chromium emits) ──
function pngDecode(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
    let pos = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0; const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.slice(pos + 8, pos + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        pos += 12 + len;
    }
    if (depth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0)
        throw new Error(`unsupported PNG shape (depth ${depth} colorType ${colorType} interlace ${interlace})`);
    const ch = colorType === 6 ? 4 : 3, stride = w * ch;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const out = Buffer.alloc(w * h * ch);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)], rowIn = y * (stride + 1) + 1, o = y * stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= ch ? out[o + x - ch] : 0;
            const b = y > 0 ? out[o - stride + x] : 0;
            const c = (x >= ch && y > 0) ? out[o - stride + x - ch] : 0;
            let v = raw[rowIn + x];
            if (f === 1) v = (v + a) & 255;
            else if (f === 2) v = (v + b) & 255;
            else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
            else if (f === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
            } else if (f !== 0) throw new Error('unknown PNG filter ' + f);
            out[o + x] = v;
        }
    }
    return { w, h, ch, data: out };
}
const CRC_TABLE = (() => { const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngEncode(w, h, ch, data) {
    const chunk = (type, payload) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
    const stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── Mask + diff maths ───────────────────────────────────────────────────────────────────────────────
// The shell footer prints the LIVE git branch + HEAD sha + commit subject. Left unmasked, every new
// commit changes those pixels and the smoke goes red on unrelated work — noise that would get this
// harness deleted. Always-masked, both at baseline build AND at compare-time load (so a stale mask
// file cannot resurrect the problem).
const FIXED_MASK_ROWS_BOTTOM = 30;
function applyFixedMask(mask, w, h) {
    for (let y = Math.max(0, h - FIXED_MASK_ROWS_BOTTOM); y < h; y++)
        for (let x = 0; x < w; x++) mask[y * w + x] = 1;
    return mask;
}
function buildMask(frames) {                   // Uint8Array, 1 = animated pixel, from frame-to-frame variance
    const base = frames[0], n = base.w * base.h;
    const mask = new Uint8Array(n);
    for (let k = 1; k < frames.length; k++) {
        const f = frames[k];
        for (let i = 0; i < n; i++) {
            if (mask[i]) continue;
            const bo = i * base.ch, fo = i * f.ch;
            if (Math.abs(base.data[bo] - f.data[fo]) > PIXTOL
             || Math.abs(base.data[bo + 1] - f.data[fo + 1]) > PIXTOL
             || Math.abs(base.data[bo + 2] - f.data[fo + 2]) > PIXTOL) mask[i] = 1;
        }
    }
    // dilate by 1px — animation edges jitter sub-pixel and leak around a tight mask
    const d = new Uint8Array(mask), W = base.w, H = base.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!mask[y * W + x]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) d[ny * W + nx] = 1;
        }
    }
    return applyFixedMask(d, W, H);
}
function diffStats(base, cur, mask) {
    if (base.w !== cur.w || base.h !== cur.h) throw new Error(`size mismatch baseline ${base.w}x${base.h} vs shot ${cur.w}x${cur.h}`);
    let unmasked = 0, diff = 0;
    const n = base.w * base.h;
    for (let i = 0; i < n; i++) {
        if (mask && mask[i]) continue;
        unmasked++;
        const bo = i * base.ch, co = i * cur.ch;
        if (Math.abs(base.data[bo] - cur.data[co]) > PIXTOL
         || Math.abs(base.data[bo + 1] - cur.data[co + 1]) > PIXTOL
         || Math.abs(base.data[bo + 2] - cur.data[co + 2]) > PIXTOL) diff++;
    }
    return { unmasked, diff, pct: unmasked ? (100 * diff / unmasked) : 0 };
}
function maskToPng(mask, w, h) {
    const rgb = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) { const v = mask[i] ? 255 : 0; rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v; }
    return pngEncode(w, h, 3, rgb);
}
function pngToMask(img) {
    const m = new Uint8Array(img.w * img.h);
    for (let i = 0; i < m.length; i++) m[i] = img.data[i * img.ch] > 127 ? 1 : 0;
    return applyFixedMask(m, img.w, img.h);
}

// ── Engine choreography ─────────────────────────────────────────────────────────────────────────────
async function settle(eng, label) {
    let last = null, held = 0; const t0 = Date.now();
    while (Date.now() - t0 < SETTLE_TIMEOUT_MS) {
        const s = await eng.evaluate(() => ({
            p: renderer.info.programs.length, g: renderer.info.memory.geometries, t: renderer.info.memory.textures }));
        const key = s.p + 'p/' + s.g + 'g/' + s.t + 't';
        if (key === last) held++; else { held = 1; last = key; }
        if (held >= SETTLE_HOLD_SAMPLES) { console.log(`  [settle] ${label}: ${key} held ${held - 1}s`); return key; }
        await sleep(1000);
    }
    throw new Error(`settle gate timed out for ${label} — counts never held 5s (last ${last}, held ${held - 1}s)`);
}
async function gotoRoom(eng, roomId) {
    for (let tries = 0; tries < 5; tries++) {
        await eng.evaluate(id => window._tpRoom(id), roomId);
        for (let i = 0; i < 12; i++) {                    // the teleport seam is not always instantaneous
            await sleep(500);
            const now = await eng.evaluate(() => (typeof window._playerRoom === 'function') ? window._playerRoom() : -999);
            if (now === roomId) return true;
        }
    }
    return false;
}
async function captureFrames(page) {
    const frames = [];
    for (let i = 0; i < NFRAMES; i++) {
        frames.push(pngDecode(await page.screenshot({ type: 'png', animations: 'disabled' })));
        if (i < NFRAMES - 1) await sleep(FRAME_GAP_MS);
    }
    return frames;
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────────
(async () => {
    assertNoStrayHeadless();
    let browser = null, server = null;
    const fails = [], errs = [];
    try {
        server = await startServer();
        const base = 'http://127.0.0.1:' + server.address().port;
        browser = await chromium.launch({ headless: true,
            args: ['--use-angle=metal', '--enable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'] });
        const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
        page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
        // Pin the dungeon seed BEFORE any page script runs, in every frame (Engine9 reads it at ~:3460).
        await page.addInitScript(seed => { try { sessionStorage.setItem('origami.v8.seed', seed); } catch (_) {} }, PINNED_SEED);

        console.log(`[smoke:visual] ${UPDATE ? 'BASELINE-CAPTURE' : 'COMPARE'} mode${BREAK ? ' + SMOKE_VISUAL_BREAK self-test' : ''} · seed ${PINNED_SEED} · ${VIEW.width}x${VIEW.height}`);
        await page.goto(base + '/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
        const eng = page.frames().find(f => /Origami\.RealityEngine\.9\.html|Engine9\.html/.test(f.url()));   // the engine was renamed 2026-09-19
        if (!eng) throw new Error('engine frame not found');

        const liveSeed = await eng.evaluate(() => window._origamiGameSeed);
        if (String(liveSeed) !== PINNED_SEED)
            throw new Error(`engine did not adopt the pinned seed (wanted ${PINNED_SEED}, got ${liveSeed}) — baselines would be of a different dungeon every run`);

        // Close the welcome guide the way the game does (hide() posts WELCOME_GUIDE_CLOSE to the shell;
        // isFromLoad skips the quick-launch overlay). In headless it stays open forever otherwise and the
        // screenshots would be of the guidebook, not the dungeon. It can (re)open AFTER engine-ready, so
        // poll: keep hiding until #welcome-guide-overlay stays closed for 3 consecutive seconds.
        const panels = page.frames().find(f => /Panels\.html/.test(f.url()));
        if (!panels) throw new Error('panels frame not found — cannot close the welcome guide');
        let closedStreak = 0;
        for (let i = 0; i < 60 && closedStreak < 3; i++) {
            const open = await panels.evaluate(() => {
                const el = document.getElementById('welcome-guide-overlay');
                const isOpen = !!(el && el.classList.contains('is-open'));
                if (isOpen) { try { window.playerGuide && window.playerGuide.hide({ isFromLoad: true }); } catch (_) {} }
                return isOpen;
            });
            closedStreak = open ? 0 : closedStreak + 1;
            await sleep(1000);
        }
        if (closedStreak < 3) throw new Error('welcome guide would not stay closed — shots would be of the guidebook, not the dungeon');

        // Resolve scene rooms from the LIVE map — never hardcoded ids (seed-varying body; only the pin
        // makes them repeatable). Cabaret id comes from the engine's own handle.
        const rooms = await eng.evaluate(() => {
            const cab = (typeof window._cabaretRoomId === 'number') ? window._cabaretRoomId : 1;
            const seen = new Set(); const m = window.map;
            for (let x = 0; x < m.length; x++) { const col = m[x]; if (!col) continue;
                for (let z = 0; z < col.length; z++) { const t = col[z];
                    if (t && !t.wall && typeof t.roomId === 'number' && t.roomId >= 0) seen.add(t.roomId); } }
            const body = [...seen].filter(id => id > Math.max(cab, 1)).sort((a, b) => a - b);
            return { cab, body: body.length ? body[0] : null, roomCount: seen.size };
        });
        console.log(`  [map] ${rooms.roomCount} rooms · cabaret=${rooms.cab} · first body room=${rooms.body}`);

        const SCENES = [
            { id: 'spawn', room: null },
            // face SOUTH in the cabaret (2026-09-12 re-baseline, Mark GO "lets proceed to a5 a6"): the dormant cabaret is unlit by
            // design and facing north from its centre is a black wall — a black baseline guards nothing. South shows the
            // permit card and the stage kanji, the two things that can actually regress there.
            { id: 'cabaret', room: rooms.cab, face: Math.PI },
            { id: 'body', room: rooms.body },
        ];

        await settle(eng, 'boot');
        if (BREAK) {
            // Self-test: a REAL rendered change, in-page only, disk untouched — every scene is captured
            // facing 180° from its baseline, so the 3D view is structurally wrong and MUST go red.
            // (First attempts that did not survive: hemisphereLight.intensity — module-scoped, the
            // GRID/rooms trap; renderer.toneMappingExposure — zero rendered effect through the composer
            // path. The facing flip goes through _tpFace, the same authority real gameplay reads.)
            console.log('  [break] all scenes captured facing 180° from baseline — this run MUST fail');
        }

        fs.mkdirSync(BASE_DIR, { recursive: true });
        const manifestPath = path.join(BASE_DIR, 'visual-manifest.json');
        const manifest = UPDATE
            ? { seed: PINNED_SEED, viewport: VIEW, pixTol: PIXTOL, nframes: NFRAMES, capturedAt: new Date().toISOString(), scenes: {} }
            : (fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null);
        if (!UPDATE && !manifest)
            throw new Error('no baselines found — run UPDATE_BASELINE=1 node scripts/smoke-visual.js first');
        if (!UPDATE && manifest.seed !== PINNED_SEED)
            throw new Error(`baseline seed ${manifest.seed} != harness seed ${PINNED_SEED} — re-baseline or fix the pin`);

        for (const scene of SCENES) {
            if (scene.room !== null && scene.room !== undefined) {
                const landed = await gotoRoom(eng, scene.room);
                if (!landed) { fails.push(`${scene.id}: never landed in room ${scene.room} (_playerRoom gate)`); continue; }
            }
            const _face = (typeof scene.face === 'number') ? scene.face : 0;
            await eng.evaluate(rot => { try { window._tpFace(rot); } catch (_) {} }, BREAK ? _face + Math.PI : _face);   // fixed facing per scene (BREAK: 180° wrong)
            await settle(eng, scene.id);                   // teleports stream new rooms in — re-settle
            const frames = await captureFrames(page);

            if (UPDATE) {
                const mask = buildMask(frames);
                let cov = 0; for (let i = 0; i < mask.length; i++) cov += mask[i];
                const covPct = 100 * cov / mask.length;
                if (covPct > MASK_MAX_COVERAGE_PCT) {
                    fails.push(`${scene.id}: motion mask covers ${covPct.toFixed(1)}% > ${MASK_MAX_COVERAGE_PCT}% — scene too animated to baseline honestly (STOP-and-report condition)`);
                    continue;
                }
                const shot = frames[0];
                fs.writeFileSync(path.join(BASE_DIR, scene.id + '.png'), pngEncode(shot.w, shot.h, shot.ch, shot.data));
                fs.writeFileSync(path.join(BASE_DIR, scene.id + '.mask.png'), maskToPng(mask, shot.w, shot.h));
                manifest.scenes[scene.id] = { room: scene.room, maskCoveragePct: +covPct.toFixed(2) };
                console.log(`  [baseline] ${scene.id}: written · mask covers ${covPct.toFixed(1)}% of pixels`);
            } else {
                if (!manifest.scenes[scene.id]) { fails.push(`${scene.id}: no baseline entry — re-run UPDATE_BASELINE=1`); continue; }
                const baseImg = pngDecode(fs.readFileSync(path.join(BASE_DIR, scene.id + '.png')));
                const mask = pngToMask(pngDecode(fs.readFileSync(path.join(BASE_DIR, scene.id + '.mask.png'))));
                const pcts = frames.map(f => diffStats(baseImg, f, mask).pct);
                const minPct = Math.min(...pcts), thr = THRESHOLDS[scene.id];
                const ok = minPct <= thr;
                console.log(`  [${ok ? '✓' : '✗'}] ${scene.id}: min diff ${minPct.toFixed(3)}% (frames: ${pcts.map(p => p.toFixed(2)).join(' ')}) · threshold ${thr}% · mask ${manifest.scenes[scene.id].maskCoveragePct}%`);
                if (!ok) {
                    fails.push(`${scene.id}: min diff ${minPct.toFixed(3)}% exceeds threshold ${thr}%`);
                    const worst = frames[pcts.indexOf(minPct)];
                    fs.writeFileSync(path.join(FAIL_DIR, `visual-fail-${scene.id}.png`), pngEncode(worst.w, worst.h, worst.ch, worst.data));
                    console.log(`      failing shot saved: .probe-shots/visual-fail-${scene.id}.png`);
                }
            }
        }

        if (UPDATE && !fails.length) {
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            let bytes = 0;
            for (const f of fs.readdirSync(BASE_DIR)) bytes += fs.statSync(path.join(BASE_DIR, f)).size;
            console.log(`  [baseline] manifest written · baseline set totals ${(bytes / 1024).toFixed(0)} KB in ${BASE_DIR.replace(ROOT + '/', '')}`);
        }
        if (errs.length) fails.push(`${errs.length} pageerror(s): ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
        console.log('[pageerrors] ' + (errs.length ? errs.length : '0'));
        console.log('\n' + (fails.length
            ? `❌ smoke:visual FAIL — ${fails.join(' · ')}`
            : `✅ smoke:visual PASS — ${UPDATE ? 'baselines captured (explicitly, never silently)' : 'all scenes within measured thresholds'} (regression-vs-baseline only; headless ANGLE, not Mark's GPU)`));
    } catch (e) {
        fails.push(String(e && e.stack || e));
        console.error('\n❌ smoke:visual FAIL — ' + (e && e.message || e));
    } finally {
        // Orphaned-browser guard: close the browser, then the server, then SETTLE before exiting —
        // probes here have leaked headless shells at 100%+ CPU by exiting mid-teardown.
        try { if (browser) await browser.close(); } catch (_) {}
        try { if (server) await new Promise(r => server.close(r)); } catch (_) {}
        await sleep(300);
        process.exit(fails.length ? 1 : 0);
    }
})();
