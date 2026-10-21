#!/usr/bin/env node
/**
 * G-SMOKE — v8 Constructor smoke test.
 *
 * Launches headless Chromium, opens NewOrigami.9.html, waits for the engine
 * to set window.__engineReady = true, then notifies Oni-Baba via a
 * CONSTRUCTOR_EVENT postMessage so she can narrate the build in her own
 * voice. Listens for uncaught throws for 30s. Exits 0 if clean.
 *
 * Console output prefixed with 🐉 surfaces Oni-Baba's responses.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

// SMOKE_ROOT / SMOKE_ENTRY (2026-07-03): point the same harness at a BUILT DISTRIBUTION
// (e.g. SMOKE_ROOT=DISTRIBUTION/dist SMOKE_ENTRY=OrigamiUnderworld.html). Defaults unchanged = dev tree.
const ROOT = path.resolve(process.env.SMOKE_ROOT || path.resolve(__dirname, '..'));
const ENTRY_FILE = process.env.SMOKE_ENTRY || 'OrigamiUnderworld.html';
const TASK_ID = process.env.SMOKE_TASK_ID || 'T0.0';
const READY_TIMEOUT_MS = 60000;
const OBSERVE_MS = parseInt(process.env.SMOKE_OBSERVE_MS || '30000', 10);

// Static file server — chromium file:// gives each iframe an opaque origin,
// which breaks the parent's window.oniBaba8 access. Serve over HTTP instead.
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ogg':  'audio/ogg',
    '.mp3':  'audio/mpeg',
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
};

function startServer() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const full = path.join(ROOT, urlPath === '/' ? '/' + ENTRY_FILE : urlPath);
            if (!full.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
            fs.readFile(full, (err, data) => {
                if (err) { res.statusCode = 404; return res.end(err.code); }
                const ext = path.extname(full).toLowerCase();
                res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(data);
            });
        });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

(async () => {
    const startedAt = Date.now();
    let browser, server;
    const uncaught = [];
    const oniBabaLines = [];

    try {
        server = await startServer();
        const port = server.address().port;
        const ENTRY = `http://127.0.0.1:${port}/${ENTRY_FILE}`;
        browser = await chromium.launch({ args: ['--no-sandbox'] });
        const ctx = await browser.newContext();
        const page = await ctx.newPage();

        // Track uncaught throws (NOT console.error — that's noisy in v0)
        page.on('pageerror', e => {
            uncaught.push({ frame: 'top', msg: e.stack || e.message });
        });

        // Track Oni-Baba's narration so a human reading smoke output sees her
        page.on('console', m => {
            const txt = m.text();
            if (txt.startsWith('🐉')) oniBabaLines.push(txt);
            if (m.type() === 'error' || txt.includes('SyntaxError') || txt.includes('Unexpected')) {
                console.error(`[console-error] ${txt} at ${JSON.stringify(m.location())}`);
            }
        });

        // Track uncaught errors from any iframe
        page.on('frameattached', frame => {
            frame.page()?.on('pageerror', e => {
                uncaught.push({ frame: frame.url(), msg: e.stack || e.message });
            });
        });

        console.log(`[smoke] serving on http://127.0.0.1:${port}/`);
        console.log(`[smoke] loading ${ENTRY}`);
        await page.goto(ENTRY, { waitUntil: 'domcontentloaded' });

        console.log(`[smoke] waiting for window.__engineReady (timeout ${READY_TIMEOUT_MS}ms)`);
        await page.waitForFunction(
            () => window.__engineReady === true,
            null,
            { timeout: READY_TIMEOUT_MS }
        );
        console.log(`[smoke] engine ready in ${Date.now() - startedAt}ms`);

        // Brief Oni-Baba on the construction event so she can react
        await page.evaluate(taskId => {
            window.postMessage({ type: 'CONSTRUCTOR_EVENT', taskId, stage: 'announce' }, '*');
        }, TASK_ID);

        console.log(`[smoke] observing for ${OBSERVE_MS}ms`);
        await page.waitForTimeout(OBSERVE_MS);

        // Tell Oni-Baba whether validation will pass
        await page.evaluate(({ taskId, ok }) => {
            window.postMessage({ type: 'CONSTRUCTOR_EVENT', taskId, stage: ok ? 'pass' : 'fail' }, '*');
        }, { taskId: TASK_ID, ok: uncaught.length === 0 });

        // Drain any final Oni-Baba lines
        await page.waitForTimeout(300);
        await browser.close();
        if (server) await new Promise(r => server.close(r));
    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        if (server) await new Promise(r => server.close(r));
        console.error(`[smoke] HARNESS ERROR: ${e.message}`);
        if (uncaught.length) {
            console.error(`\n[smoke] FAIL — ${uncaught.length} uncaught error(s):`);
            for (const u of uncaught) console.error(`  • ${u.frame}: ${u.msg}`);
        }
        process.exit(2);
    }

    if (oniBabaLines.length) {
        console.log('\n[smoke] Oni-Baba spoke:');
        for (const l of oniBabaLines) console.log('  ' + l);
    }

    if (uncaught.length) {
        console.error(`\n[smoke] FAIL — ${uncaught.length} uncaught error(s):`);
        for (const u of uncaught) console.error(`  • ${u.frame}: ${u.msg}`);
        process.exit(1);
    }

    console.log(`\n[smoke] OK — ${TASK_ID} smoke clean (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    process.exit(0);
})();
