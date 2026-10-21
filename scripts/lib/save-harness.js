'use strict';
/**
 * Shared by scripts/smoke-save.js and scripts/smoke-save-parts.js (2026-09-27, the save rebuild).
 *
 * A static server over the repo root, and the waits for the shell's two iframes. Split out of smoke-save.js when the
 * iframe regexes were found still matching the pre-rename files: the 09-19 rename (9239d996) turned
 * NewOrigami.Engine9.html / NewOrigami.Panels.html into Origami.RealityEngine.9.html / .Panels.html, rewrote the quoted
 * strings and left the regex literals, so `npm run smoke:save` has failed with "Engine iframe was not found" since
 * 09-19 (last pass 09-18). One pair of regexes here, used by both files. knowledge/design/SAVE_GAME_2026-09-27.md
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE_RE = /Origami\.RealityEngine\.9\.html/;
const PANELS_RE = /Origami\.RealityEngine\.Panels\.html/;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      const full = path.join(ROOT, pathname === '/' ? '/OrigamiUnderworld.html' : pathname);
      if (!full.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
      fs.readFile(full, (error, data) => {
        if (error) { res.statusCode = 404; return res.end(error.code); }
        res.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForEngine(page) {
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000, polling: 250 });   // interval, not rAF — a running engine loop starves the shell's rAF poll (measured 2026-09-12)
  const frame = page.frames().find(item => ENGINE_RE.test(item.url()));
  assert(frame, 'Engine iframe was not found');
  await frame.waitForFunction(() => typeof window._runLedgerDiagnostics === 'function', null, { timeout: 30000 });
  return frame;
}

async function waitForPanels(page) {
  // Manual evaluate() poll: page.waitForFunction's injected poller goes dead on the shell frame after a mid-game
  // reload while evaluate() keeps working (measured 2026-09-12) — so poll the same predicate by hand.
  const psrc = PANELS_RE.source;
  const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 30000) {
    try { ok = await page.evaluate((re) => { const iframe = document.getElementById('panels-iframe'); return !!iframe && new RegExp(re).test(iframe.src || ''); }, psrc); } catch (_) { ok = false; }
    if (ok) break; await sleep(250);
  }
  assert(ok, 'Panels iframe never appeared in the shell');
  const frame = page.frames().find(item => PANELS_RE.test(item.url()));
  assert(frame, 'Panels iframe was not found');
  const t1 = Date.now(); let ready = false;
  while (Date.now() - t1 < 30000) { try { ready = await frame.evaluate(() => document.readyState === 'complete'); } catch (_) { ready = false; } if (ready) break; await sleep(250); }
  assert(ready, 'Panels document never reached readyState complete');
  return frame;
}

async function waitForReload(page) {
  await page.waitForFunction(() => window.__engineReady === false, null, { timeout: 10000, polling: 100 });
  return waitForEngine(page);
}

// Resolves a frame-side predicate by hand-polling evaluate() (the same reason as waitForPanels above).
async function pollFrame(frame, fn, arg, { timeout = 60000, every = 250 } = {}) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) {
    try { last = await frame.evaluate(fn, arg); } catch (_) { last = undefined; }
    if (last) return last;
    await sleep(every);
  }
  return last;
}

module.exports = { ROOT, ENGINE_RE, PANELS_RE, sleep, assert, startServer, waitForEngine, waitForPanels, waitForReload, pollFrame };
