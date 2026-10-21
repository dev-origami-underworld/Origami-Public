/**
 * probe-music-load.js — does each Composer track actually LOAD and become playable?
 *
 * WHY THIS EXISTS (Mark 2026-07-26: "fail, during hostile encounter no music played. wtf").
 * probe-composer.js proves the DECISION — which cue wins, which track it picks, what gain it targets. It cannot
 * prove the browser ever fetched the bytes, because headless never satisfies the autoplay gesture, so a track
 * that 404s looks identical to a track that plays. That gap is exactly where this bug lived. This probe closes
 * it: for every track the Composer can pick, load it in the real page and report readyState / networkState / the
 * MediaError code, plus the resolved URL the browser actually requested.
 *
 * Usage: node scripts/probe-music-load.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const failed = [];
  page.on('requestfailed', r => { if (/\.mp3/i.test(r.url())) failed.push(r.url() + '  ← ' + (r.failure()?.errorText || '?')); });
  page.on('response', r => { if (/\.mp3/i.test(r.url()) && r.status() >= 400) failed.push(r.status() + '  ' + r.url()); });

  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(2500);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('✗ engine frame not found'); await b.close(); process.exit(1); }

  // Ask the Composer itself which tracks it can pick, so this can never drift from the cue table.
  const tracks = await eng.evaluate(() => {
    const out = new Set();
    const add = a => (Array.isArray(a) ? a : [a]).forEach(t => t && out.add(t));
    add(window._composerTracksProbe ? window._composerTracksProbe() : []);
    // Starlette's song is not in a Composer pool (the cabaret scene owns its transport) but it is still music the
    // game must be able to fetch — a 404 there is a silent treasured scene.
    if (typeof window._cabSongFileActive === 'string') add(window._cabSongFileActive);
    return [...out];
  });

  const R = await eng.evaluate(async (list) => {
    const probe = (url) => new Promise(res => {
      const a = new Audio();
      const done = (verdict) => res({
        url, verdict,
        resolved: a.currentSrc || a.src || '(none)',
        readyState: a.readyState, networkState: a.networkState,
        errCode: a.error ? a.error.code : null,
        duration: (isFinite(a.duration) ? +a.duration.toFixed(1) : null),
      });
      a.preload = 'auto';
      a.addEventListener('loadedmetadata', () => done('LOADED'), { once: true });
      a.addEventListener('error', () => done('ERROR'), { once: true });
      setTimeout(() => done('TIMEOUT'), 8000);
      a.src = url;
      a.load();
    });
    const out = [];
    for (const t of list) out.push(await probe(t));
    return out;
  }, tracks);

  console.log('\n── 🎵 MUSIC LOAD PROBE ──');
  let bad = 0;
  for (const r of R) {
    const okv = r.verdict === 'LOADED';
    if (!okv) bad++;
    console.log('  ' + (okv ? '✓' : '✗') + ' ' + r.verdict.padEnd(8) + String(r.url).split('/').pop().padEnd(32)
      + (okv ? (r.duration + 's') : ('readyState ' + r.readyState + ' · networkState ' + r.networkState + ' · MediaError ' + r.errCode))
      + '\n      requested: ' + r.resolved);
  }
  if (failed.length) { console.log('\nnetwork failures seen by the page:'); for (const f of [...new Set(failed)]) console.log('  ' + f); }
  console.log('\nVERDICT: ' + (bad === 0 ? '✅ every Composer track loads and reports a real duration' : '❌ ' + bad + ' track(s) never became playable — the Composer can pick a song the browser cannot fetch'));
  await b.close();
  process.exit(bad === 0 ? 0 : 1);
})();
