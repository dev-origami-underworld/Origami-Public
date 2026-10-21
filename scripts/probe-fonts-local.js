#!/usr/bin/env node
/**
 * probe-fonts-local.js — does the shipping game reach Google for type, and do the local faces load?
 *
 * TWO ASSERTIONS, because either one alone passes while the feature is broken:
 *
 *   1. NO REQUEST to fonts.googleapis.com / fonts.gstatic.com during a real boot. A grep over the HTML
 *      cannot prove this — a URL can arrive from a runtime-built string, an injected <link>, a CSS
 *      @import inside a vendored stylesheet, or a third-party file we did not write. Only the network
 *      log knows.
 *   2. THE LOCAL FACES ACTUALLY LOAD. Deleting the Google <link> makes assertion 1 pass instantly and
 *      perfectly, with every glyph rendering in a fallback system font. That is the failure mode this
 *      change could most plausibly ship as, and under `display:swap` it is INVISIBLE — no error, no
 *      missing box, just slightly wrong type. So check document.fonts for real loaded faces, and read a
 *      computed font-family off a live element.
 *
 * MAKE-IT-FAIL: FONTS_REMOTE=1 injects a Google stylesheet at boot. If the run still passes under that,
 *   assertion 1 is watching nothing.
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const REMOTE = process.env.FONTS_REMOTE === '1';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.srt':'text/plain','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf' };

/* Families the shipped files (Engine9 + Panels) name in their own CSS. Checked as "at least one real
 * face loaded", not "every weight" — the browser lazily loads only the cuts a page actually paints. */
const EXPECT = ['Nunito', 'Cinzel', 'Inter'];

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'OrigamiUnderworld.html';
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const googleHits = [], errs = [];
  let out = null;
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    p.on('pageerror', e => errs.push(String(e && e.message).slice(0, 160)));
    // EVERY frame's requests, not just the top document — the engine and the panels are iframes, and a
    // leak in either is a leak.
    p.on('request', r => {
      const u = r.url();
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) googleHits.push(u.slice(0, 120));
    });
    if (REMOTE) {
      // make-it-fail: put a third-party font request back. Uses fetch() rather than an injected <link>
      // because a <link> appended from an init script does not reliably reach the network in every frame
      // (verified: it fires on a plain page and did NOT on this one), and a self-test that silently does
      // nothing is worse than no self-test — it certifies the watcher while proving nothing.
      await p.addInitScript(() => {
        try { fetch('https://fonts.googleapis.com/css2?family=Roboto&display=swap').catch(() => {}); } catch (_) {}
      });
    }
    await p.goto(base + '/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 150000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 6000));

    const readFrame = async (f, label) => {
      try {
        return await f.evaluate(async (lbl) => {
          try { await document.fonts.ready; } catch (_) {}
          const loaded = [];
          try { document.fonts.forEach(ff => { if (ff.status === 'loaded') loaded.push(ff.family.replace(/["']/g, '')); }); } catch (_) {}
          const body = document.body ? getComputedStyle(document.body).fontFamily : null;
          return { label: lbl, loaded: [...new Set(loaded)], bodyFamily: body, faceCount: (document.fonts && document.fonts.size) || 0 };
        }, label);
      } catch (e) { return { label, err: e.message.slice(0, 90) }; }
    };
    const ef = p.frames().find(f => /Engine9\.html/.test(f.url()));
    const pf = p.frames().find(f => /Panels\.html/.test(f.url()));
    out = {
      engine: ef ? await readFrame(ef, 'Engine9') : { label: 'Engine9', err: 'frame not found' },
      panels: pf ? await readFrame(pf, 'Panels') : { label: 'Panels', err: 'frame not found' },
    };
  } catch (e) { out = { fatal: String(e.message).slice(0, 300) }; }
  try { await b.close(); } catch (_) {}
  try { await new Promise(r => server.close(r)); } catch (_) {}
  await new Promise(r => setTimeout(r, 300));

  if (REMOTE) console.log('⚠ FONTS_REMOTE=1 — a Google stylesheet was injected; this run MUST fail.\n');
  console.log('pageerrors:', errs.length);
  errs.slice(0, 4).forEach(e => console.log('  ✗ ' + e));
  if (!out || out.fatal) { console.log('FATAL:', out && out.fatal); process.exitCode = 1; return; }

  console.log('\n=== 1. third-party font requests during a real boot ===');
  if (googleHits.length) {
    console.log('  ✗ ' + googleHits.length + ' request(s) to Google font hosts:');
    [...new Set(googleHits)].slice(0, 6).forEach(u => console.log('      ' + u));
  } else console.log('  ✓ none — the game asked nobody for type');

  console.log('\n=== 2. did the LOCAL faces actually load? ===');
  const frames = [out.engine, out.panels];
  let facesOk = true;
  for (const f of frames) {
    if (f.err) { console.log('  ✗ ' + f.label + ': ' + f.err); facesOk = false; continue; }
    const hit = EXPECT.filter(e => f.loaded.some(l => l.toLowerCase().includes(e.toLowerCase())));
    const ok = hit.length > 0;
    if (!ok) facesOk = false;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + f.label.padEnd(8)
      + ' loaded=[' + f.loaded.slice(0, 6).join(', ') + ']'
      + '  declared=' + f.faceCount
      + '  body=' + String(f.bodyFamily || '').split(',')[0]);
  }
  if (!facesOk) console.log('  (zero loaded faces = the <link> is gone and everything is rendering in a system fallback —\n   which is exactly what deleting the Google link, and nothing else, would look like)');

  const pass = !googleHits.length && facesOk && !errs.length;
  console.log('\n' + (pass
    ? '✅ no third-party font requests, and the vendored faces are really loading'
    : '❌ ' + (googleHits.length ? 'leaks: ' + googleHits.length + '  ' : '')
            + (!facesOk ? 'local faces did NOT load  ' : '')
            + (errs.length ? 'pageerrors: ' + errs.length : '')));
  process.exitCode = pass ? 0 : 1;
})();
