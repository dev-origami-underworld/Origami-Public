#!/usr/bin/env node
/*
 * probe-song-votes.js — THE VOTE RECORDER COUNTS LOCALLY AND CANNOT PHONE HOME.
 *
 * Mark 2026-08-04 asked for player voting "as cheap as we can with $0 increase in support costs", for a
 * game whose whole point is that kids are safe in it. So the load-bearing claim here is a NEGATIVE one:
 * with the game as shipped, NOTHING about a player leaves their machine. A negative cannot be proved by
 * asking the module — it would only ever answer for itself. So this watches the BROWSER: every request
 * the page makes, from any source, is recorded and any off-origin one is a failure. That catches a stray
 * fetch, an <img> beacon, a sendBeacon, anything.
 *
 *   1. RECORDS       — the Composer's onCue seam feeds trackStarted/trackEnded; tallies land in
 *                      localStorage. If this fails the feature is dead code (the import may be missing).
 *   2. SKIP vs PLAY  — a track dropped under SKIP_UNDER_S counts a skip; a longer one does not. This is
 *                      the entire signal, so it is measured rather than assumed.
 *   3. INERT         — with no endpoint configured, submit() refuses: 'no-endpoint'. Zero requests.
 *   4. NO CONSENT    — with an endpoint configured but no opt-in, submit() refuses: 'no-consent'. Zero
 *                      requests. This is the one that matters: configuring the endpoint must not, on its
 *                      own, start transmitting.
 *   5. CONSENT WORKS — opted in, the POST is actually made and carries no name, no free text, no IP.
 *                      A privacy switch that also breaks the feature is not a privacy switch.
 *   6. FORGET LEAVES NOTHING — forget() clears tallies AND the install id.
 *
 * Usage: node scripts/probe-song-votes.js
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.cwd(), ENTRY = 'OrigamiUnderworld.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

// Two servers: the game, and a stand-in "endpoint" that records what it is sent. The endpoint is a
// SEPARATE origin so any request to it is unambiguously an off-origin transmission.
const startServer = (handler) => new Promise((res, rej) => {
  const srv = http.createServer(handler);
  srv.on('error', rej); srv.listen(0, '127.0.0.1', () => res(srv));
});
const fileHandler = (rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  const full = path.join(ROOT, p === '/' ? '/' + ENTRY : p);
  if (!full.startsWith(ROOT)) { rs.statusCode = 403; return rs.end(); }
  fs.readFile(full, (e, d) => {
    if (e) { rs.statusCode = 404; return rs.end(e.code); }
    rs.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
    rs.end(d);
  });
};

(async () => {
  const fails = [], notes = [];
  const received = [];                       // everything the stand-in endpoint was actually sent
  const server = await startServer(fileHandler);
  const collector = await startServer((rq, rs) => {
    let body = '';
    rq.on('data', c => { body += c; });
    rq.on('end', () => {
      received.push({ method: rq.method, body });
      rs.setHeader('Access-Control-Allow-Origin', '*');
      rs.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      rs.statusCode = 204; rs.end();
    });
  });
  const gamePort = server.address().port, votePort = collector.address().port;
  const ENDPOINT = `http://127.0.0.1:${votePort}/vote`;

  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  // The engine already logs every cue change from inside the very handler under test. Reading that log
  // is how this probe learns what really played, without adding a diag hook to ship for a test's sake.
  const cueLog = [];
  page.on('console', m => {
    const t = m.text();
    const g = /^\[COMPOSER\]\s+\S+\s+→\s+(\S+)\s+(\S+)/.exec(t);
    if (g) cueLog.push({ cue: g[1], track: g[2] });
  });

  // THE WATCH: every request from every frame. Anything not on the game's own origin is off-origin
  // traffic. Recorded from before navigation so nothing during boot escapes it.
  const offOrigin = [];
  page.on('request', r => {
    const u = r.url();
    if (/^(data|blob|about):/.test(u)) return;
    if (u.startsWith(`http://127.0.0.1:${gamePort}/`)) return;
    offOrigin.push({ url: u.slice(0, 160), method: r.method() });
  });

  try {
    await page.goto(`http://127.0.0.1:${gamePort}/${ENTRY}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(6000);
    const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!eng) throw new Error('engine frame not found');

    // ── 1. THE MODULE IS ACTUALLY LOADED AND THE SEAM REACHES IT ──────────────────────────────────
    //    Checked separately from the counting, because "the import is missing" and "the seam is wrong"
    //    are different faults with the same symptom, and one of them was true when this was first wired.
    const present = await eng.evaluate(() => !!(window._songVotes && typeof window._songVotes.trackStarted === 'function'));
    if (!present) fails.push('window._songVotes absent — the module never loaded (check the import in Engine9)');
    else notes.push('module loaded, window._songVotes published');

    // The seam is a line inside the Composer's onCue closure — `onCue` is captured at construction
    // (Composer.js:536) and is not reachable from outside, so it CANNOT be called directly. The honest
    // proof is therefore end-to-end: play a real song and see whether a tally appears for that exact
    // track. Entering the cabaret is the one place floor 1 reliably starts music (the dungeon is
    // abandoned and silent otherwise), so that is the trigger — the same one probe-permit-song-clock uses.
    //    The dungeon starts SILENT on purpose — `UNEARNED_MUSIC` (Composer.js:285, priority 999) holds
    //    every cue down until `_bgMusicEarned` is true, because the player has not found a song yet. That
    //    is the whole premise of the game, so the probe must EARN music rather than work around it: this
    //    flag is exactly what returning a song to Starlette sets.
    await eng.evaluate(() => { window._songVotes?.forget(); window._bgMusicEarned = true; });
    await page.evaluate(() => { const f = document.getElementById('engine-iframe'); f && f.contentWindow.postMessage({ type: 'WELCOME_GUIDE_CLOSE' }, '*'); });
    let cueTrack = null;
    for (let i = 0; i < 40 && !cueTrack; i++) {
      await sleep(500);
      const m = cueLog.find(l => l.track && l.track !== 'silence');
      if (m) cueTrack = m.track;
    }
    if (!cueTrack) {
      const st = await eng.evaluate(() => { try { return window._composer.state(); } catch (e) { return { err: String(e) }; } });
      fails.push(`SEAM UNPROVEN: no cue with a track fired in 20s. cues seen: ${JSON.stringify(cueLog.slice(-4))} | composer.state: ${JSON.stringify(st).slice(0, 300)}`);
    } else {
      const expect = cueTrack.replace(/\.[a-z0-9]+$/i, '');
      // Let it actually play for a few seconds before ending it. A track judged the instant it starts is
      // under the 1s crossfade floor and is deliberately discarded — measuring that would only measure
      // the probe's own haste.
      await sleep(3500);
      const seen = await eng.evaluate((k) => {
        window._songVotes.trackEnded(performance.now());
        const r = window._songVotes.ranking();
        return { hit: r.map(x => x.key).includes(k), all: r.map(x => `${x.key}(p${x.plays}/s${x.skips}/${x.secs}s)`) };
      }, expect);
      if (seen.hit) notes.push(`SEAM PROVEN end-to-end: a real cue ("${cueTrack}") was recorded as "${expect}"`);
      else fails.push(`a real cue played "${cueTrack}" but no tally for "${expect}". Recorder holds: ${JSON.stringify(seen.all)}`);
    }

    // ── 2. SKIP vs PLAY ───────────────────────────────────────────────────────────────────────────
    const tally = await eng.evaluate(async () => {
      const sv = window._songVotes; if (!sv) return null;
      sv.forget();
      const t0 = performance.now();
      sv.trackStarted('LONG-TRACK', 0, t0);
      sv.trackEnded(t0 + 40000);              // 40s = a listen
      sv.trackStarted('SKIPPED-TRACK', 0, t0);
      sv.trackEnded(t0 + 4000);               // 4s = a skip
      sv.trackStarted('CROSSFADE', 0, t0);
      sv.trackEnded(t0 + 300);                // 0.3s = not a hearing at all
      return sv.ranking();
    });
    if (!tally) fails.push('could not exercise the recorder');
    else {
      const by = Object.fromEntries(tally.map(t => [t.key, t]));
      if (!by['LONG-TRACK'] || by['LONG-TRACK'].skips !== 0) fails.push(`40s track should be a listen, got ${JSON.stringify(by['LONG-TRACK'])}`);
      if (!by['SKIPPED-TRACK'] || by['SKIPPED-TRACK'].skips !== 1) fails.push(`4s track should be a skip, got ${JSON.stringify(by['SKIPPED-TRACK'])}`);
      if (by['CROSSFADE']) fails.push('a 0.3s crossfade was scored as a hearing — it must be discarded');
      if (!fails.length) notes.push(`tallies correct: listen=${by['LONG-TRACK']?.plays} skip=${by['SKIPPED-TRACK']?.skips} crossfade discarded`);
    }

    // ── 3. INERT WITH NO ENDPOINT ─────────────────────────────────────────────────────────────────
    const inert = await eng.evaluate(() => window._songVotes.submit());
    if (inert.why !== 'no-endpoint') fails.push(`with no endpoint configured, submit() said ${JSON.stringify(inert)} — expected no-endpoint`);
    else notes.push("no endpoint configured → submit() refuses ('no-endpoint')");

    // ── 4. ENDPOINT CONFIGURED, NO CONSENT → STILL NOTHING ────────────────────────────────────────
    const noConsent = await eng.evaluate(async (url) => {
      window._songVoteEndpoint = url;
      window._songVotes.setOptIn(false);
      return await window._songVotes.submit();
    }, ENDPOINT);
    await sleep(800);
    if (noConsent.why !== 'no-consent') fails.push(`endpoint set but no opt-in: submit() said ${JSON.stringify(noConsent)} — expected no-consent`);
    if (received.length) fails.push(`⚠ ${received.length} request(s) reached the endpoint WITHOUT consent — ${JSON.stringify(received[0]).slice(0, 200)}`);
    if (!fails.length) notes.push('endpoint configured but no opt-in → refuses, and the endpoint received NOTHING');

    // ── 5. WITH CONSENT, IT WORKS, AND CARRIES NOTHING PERSONAL ───────────────────────────────────
    const sent = await eng.evaluate(async () => {
      window._songVotes.setOptIn(true);
      return await window._songVotes.submit();
    });
    for (let i = 0; i < 20 && !received.length; i++) await sleep(200);
    if (!sent.sent) fails.push(`opted in but submit() did not send: ${JSON.stringify(sent)}`);
    if (!received.length) fails.push('opted in and submit() reported sent, but the endpoint received nothing');
    else {
      // A cross-origin JSON POST is preceded by a CORS preflight; that OPTIONS is the browser's, not
      // ours, and carries no payload. Judge the POST.
      const got = received.find(r => r.method === 'POST');
      if (!got) { fails.push(`no POST reached the endpoint (saw: ${received.map(r => r.method).join(',')})`); }
      else {
      let parsed = null; try { parsed = JSON.parse(got.body); } catch (_) {}
      if (!parsed) fails.push('endpoint received unparseable body');
      else {
        const flat = JSON.stringify(parsed);
        // The payload's whole shape is [key, plays, skips, secs] plus a random id. Anything resembling a
        // name, a path, or free text would mean the shape drifted.
        const keys = Object.keys(parsed).sort().join(',');
        if (keys !== 'id,tracks,v') fails.push(`payload keys drifted: ${keys} (expected id,tracks,v)`);
        if (!Array.isArray(parsed.tracks) || !parsed.tracks.every(t => Array.isArray(t) && t.length === 4))
          fails.push('tracks are not [key,plays,skips,secs] tuples');
        if (/[\/\\]|@|Mozilla|http/i.test(flat.replace(/"tracks"/, ''))) fails.push(`payload contains a path/UA/URL-like value: ${flat.slice(0, 200)}`);
        notes.push(`consented POST delivered, ${parsed.tracks.length} track(s), ${got.body.length} bytes, id=${String(parsed.id).slice(0, 6)}…`);
      }
      }
    }

    // ── 6. FORGET LEAVES NOTHING ──────────────────────────────────────────────────────────────────
    const after = await eng.evaluate(() => {
      const before = window._songVotes.installId();
      window._songVotes.forget();
      return { tallies: window._songVotes.ranking().length,
               idChanged: window._songVotes.installId() !== before,
               optIn: window._songVotes.optedIn(),
               raw: localStorage.getItem('origami.v8.songVotes') };
    });
    if (after.tallies !== 0 || after.raw) fails.push(`forget() left tallies behind: ${JSON.stringify(after)}`);
    if (!after.idChanged) fails.push('forget() did not reset the install id — the player is still identifiable');
    if (after.optIn) fails.push('forget() left the opt-in set');
    if (after.tallies === 0 && after.idChanged && !after.optIn) notes.push('forget() erased tallies, opt-in, and the install id');

  } catch (e) {
    fails.push('probe threw: ' + (e && e.message ? e.message : String(e)));
  } finally {
    // Off-origin traffic is judged over the WHOLE run. The only permitted entries are the ones this probe
    // deliberately caused in step 5, after consent.
    const toEndpoint = offOrigin.filter(r => r.url.startsWith(`http://127.0.0.1:${votePort}/`));
    // PRE-EXISTING AND NOT THIS FEATURE'S DOING: CLAUDE.md mandates Google Fonts typography, so the page
    // fetches fonts.googleapis.com / fonts.gstatic.com on every boot. That is a real privacy exposure —
    // every player's IP reaches Google before they press a key — but it is a standing design decision,
    // not something a vote recorder may quietly change. Counted and REPORTED, never silently tolerated.
    const fonts = offOrigin.filter(r => /fonts\.(googleapis|gstatic)\.com/.test(r.url));
    const uninvited = offOrigin.filter(r => !toEndpoint.includes(r) && !fonts.includes(r));
    if (uninvited.length) fails.push(`⚠ ${uninvited.length} unexplained off-origin request(s): ${JSON.stringify(uninvited.slice(0, 3))}`);
    else notes.push(`no unexplained off-origin traffic across the whole boot`);
    notes.push(`song-vote traffic off-origin: ${toEndpoint.length} (all after consent, step 5)`);
    if (fonts.length) notes.push(`PRE-EXISTING, NOT THIS FEATURE: ${fonts.length} Google Fonts request(s) per boot — every player's IP reaches Google. Mark's call, see report.`);
    if (errs.length) notes.push(`page errors during boot: ${errs.length} — ${errs.slice(0, 2).join(' | ')}`);

    await browser.close(); server.close(); collector.close();
    console.log('\n── SONG VOTES ─────────────────────────────────────────────');
    notes.forEach(n => console.log('  · ' + n));
    if (fails.length) { console.log('\n  ✗ FAIL'); fails.forEach(f => console.log('    ' + f)); process.exit(1); }
    console.log('\n  ✓ PASS — counts locally, transmits only with an endpoint AND consent');
    process.exit(0);
  }
})();
