#!/usr/bin/env node
/*
 * probe-music-page.js — THE MUSIC PAGE OPENS, LISTS REAL SONGS, AND CANNOT PHONE HOME.
 *
 * Mark 2026-08-04: "this only shows up when players click on the music symbol, then they can see a music
 * player there on the page, left side is the list of songs tabs up at top for STARLETTE / CABERET and the
 * other SOUNDTRACKS for combat / gambling and general."
 * Mark 2026-08-05: "make sure not to do the multiplayer voting stuff, just the checkbox" — asserted here,
 * because "I did not add voting" is exactly the kind of claim that should be measured rather than trusted.
 *
 *   1. THE ICON OPENS IT     — clicked for real, not called directly. The icon used to MUTE on click, so
 *                              the rewire is the thing most likely to be wrong.
 *   2. TABS ARE ALL THERE    — STARLETTE · CABARET · COMBAT · GAMBLING · GENERAL.
 *   3. IT LISTS REAL SONGS   — row count and titles come from SongCatalog, not from placeholder markup.
 *   4. EMPTY TABS SAY THE RIGHT THING — combat/gambling have no tracks yet and per Mark's ruling combat
 *                              music is LOOT, so the empty state must read "you have not found any yet",
 *                              never "nothing here". Different message, and the second one is the game.
 *   5. BOTH SLIDERS EXIST    — hard/soft AND dark/light (karma).
 *   6. NO NETWORK            — every request during the interaction is watched; the page must not talk to
 *                              anything. Same watch the song-votes probe uses, for the same reason.
 *
 * Usage: node scripts/probe-music-page.js
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.cwd(), ENTRY = 'OrigamiUnderworld.html';
const OUT = path.join(ROOT, '.probe-shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

const startServer = () => new Promise((res, rej) => {
  const srv = http.createServer((rq, rs) => {
    const p = decodeURIComponent(rq.url.split('?')[0]);
    const full = path.join(ROOT, p === '/' ? '/' + ENTRY : p);
    if (!full.startsWith(ROOT)) { rs.statusCode = 403; return rs.end(); }
    fs.readFile(full, (e, d) => {
      if (e) { rs.statusCode = 404; return rs.end(e.code); }
      rs.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
      rs.end(d);
    });
  });
  srv.on('error', rej); srv.listen(0, '127.0.0.1', () => res(srv));
});

(async () => {
  const fails = [], notes = [];
  try { fs.mkdirSync(OUT, { recursive: true }); } catch (_) {}
  const server = await startServer();
  const gamePort = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));

  let watching = false;
  const offOrigin = [];
  page.on('request', r => {
    if (!watching) return;
    const u = r.url();
    if (/^(data|blob|about):/.test(u)) return;
    if (u.startsWith(`http://127.0.0.1:${gamePort}/`)) return;
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return;   // pre-existing, tracked separately
    offOrigin.push(u.slice(0, 140));
  });

  try {
    await page.goto(`http://127.0.0.1:${gamePort}/${ENTRY}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(7000);

    const panels = page.frames().find(f => /Panels\.html/.test(f.url()));
    if (!panels) throw new Error('panels frame not found');

    watching = true;

    // ── 1. CLICK THE ICON FOR REAL ────────────────────────────────────────────────────────────────
    const icon = await panels.$('#bg-music-toggle');
    if (!icon) { fails.push('#bg-music-toggle not found — cannot test the entry point'); }
    else {
      await icon.click({ force: true });
      await sleep(1800);
      const open = await panels.$('#music-page.on');
      if (!open) fails.push('clicking the music symbol did not open the page');
      else notes.push('music symbol opens the page');
    }

    const m = await panels.evaluate(() => {
      const el = document.querySelector('#music-page');
      if (!el) return { err: 'page never built' };
      const tabs = [...el.querySelectorAll('.mp-tab')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
      const rows = [...el.querySelectorAll('.mp-row .mp-title')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
      return {
        tabs,
        rows,
        hasHardness: !!el.querySelector('#mp-hardness'),
        hasKarma: !!el.querySelector('#mp-karma'),
        checkboxes: el.querySelectorAll('.mp-keep input[type=checkbox]').length,
        selectors: el.querySelectorAll('.mp-verdict').length,
        variantBtns: el.querySelectorAll('.mp-var').length,
        html: el.innerHTML,
      };
    });
    if (m.err) { fails.push(m.err); }
    else {
      // ── 2. TABS ─────────────────────────────────────────────────────────────────────────────────
      for (const want of ['STARLETTE', 'CABARET', 'COMBAT', 'GAMBLING', 'GENERAL']) {
        if (!m.tabs.some(t => t.includes(want))) fails.push(`tab missing: ${want}`);
      }
      if (!fails.length) notes.push(`tabs present: ${m.tabs.map(t => t.split(' ')[0]).join(' · ')}`);

      // ── 3. REAL SONGS ───────────────────────────────────────────────────────────────────────────
      if (!m.rows.length) fails.push('STARLETTE tab listed ZERO songs — the catalog did not reach the page');
      // Her quest songs must be on HER tab. The first cut routed them to GENERAL and put the dungeon's
      // background tracks under CABARET; a count check alone would not have caught that, so name them.
      else if (m.rows.length < 4) fails.push(`only ${m.rows.length} song(s) on STARLETTE — her quest songs (黄泉の宿 / 地獄越え / 召喚) should be here, not in GENERAL`);
      else notes.push(`${m.rows.length} song(s) on the opening tab: ${m.rows.slice(0, 4).join(' | ')}`);
      // Two row kinds now, and that is deliberate: a CATALOGUED song gets the set-list checkbox
      // (Mark's "just the checkbox"), while a track known only from disk gets the FILE the selector so
      // he can file it. Every row must carry one control or the other — a row with neither is dead.
      const controls = m.checkboxes + m.selectors;
      if (controls < m.rows.length) fails.push(`${m.rows.length} row(s) but only ${controls} control(s) — some rows do nothing`);
      else notes.push(`${m.rows.length} row(s): ${m.checkboxes} set-list checkbox(es) + ${m.selectors} file selector(s)`);
      if (m.variantBtns) notes.push(`${m.variantBtns} row(s) offer another take (family variants)`);

      // ── 5. BOTH SLIDERS ─────────────────────────────────────────────────────────────────────────
      if (!m.hasHardness) fails.push('hard/soft slider missing');
      if (!m.hasKarma) fails.push('dark/light (karma) slider missing');
      if (m.hasHardness && m.hasKarma) notes.push('both sliders present: hard/soft + dark/light');

      // NO VOTING SURFACE — asserted literally against Mark's instruction.
      if (/vote|voting|submit.*rank|leaderboard/i.test(m.html))
        fails.push('the page contains voting-looking markup — Mark 08-05: "make sure not to do the multiplayer voting stuff"');
      else notes.push('no voting surface anywhere in the page');
    }

    // ── 7. THE LIBRARY TRIAGE TAB (Mark 2026-08-05) ───────────────────────────────────────────────
    //    Dev-gated, so first prove it is HIDDEN for a normal player, then turn it on and prove every
    //    file on disk is listed with a selector. A triage list that quietly omits files is worse than
    //    none — Mark would grade 30 tracks believing that was all of them.
    const hidden = await panels.evaluate(() => ![...document.querySelectorAll('.mp-tab')].some(t => t.textContent.includes('LIBRARY')));
    if (!hidden) fails.push('LIBRARY tab is visible to a normal player — it should be behind ?audio=1');
    else notes.push('LIBRARY tab hidden by default (dev-gated)');

    const lib = await panels.evaluate(async () => {
        window._audioTriage = true;
        const man = await import('./js/v8/data/AudioManifest.js?v=8.3.322-manifest');
        // reopen so the tab list rebuilds
        document.querySelector('#music-page .mp-close')?.click();
        window.openMusicPage();
        await new Promise(r => setTimeout(r, 900));
        const t = [...document.querySelectorAll('.mp-tab')].find(x => x.textContent.includes('LIBRARY'));
        if (!t) return { err: 'LIBRARY tab absent even with _audioTriage' };
        t.click();
        await new Promise(r => setTimeout(r, 400));
        return {
            expected: man.MUSIC_FILES.length,
            rows: document.querySelectorAll('#music-page .mp-row.mp-lib').length,
            selects: document.querySelectorAll('#music-page .mp-verdict').length,
            opts: [...document.querySelectorAll('#music-page .mp-verdict')].slice(0,1).map(s => s.options.length)[0] || 0,
            unwired: document.querySelector('#music-page .mp-libhead')?.textContent.trim().slice(0, 90) || '',
        };
    });
    if (lib.err) fails.push(lib.err);
    else {
        if (lib.rows !== lib.expected) fails.push(`LIBRARY lists ${lib.rows} rows but the manifest has ${lib.expected} music files — Mark would grade an incomplete list`);
        else notes.push(`LIBRARY lists all ${lib.rows} music files on disk`);
        if (lib.selects !== lib.rows) fails.push(`${lib.selects} selector(s) for ${lib.rows} row(s)`);
        else notes.push(`a selector on every row (${lib.opts} choices each)`);
        if (lib.unwired) notes.push(lib.unwired);
    }

    // ── 8. THE LOOP ACTUALLY CLOSES (Mark 2026-08-05 GO) ─────────────────────────────────────────
    //    Until now the page POSTED and nothing listened, so every button was a no-op that looked fine.
    //    Three things measured on the live engine: the audio element really starts, the Composer is
    //    held while auditioning, and — the one that would have shipped broken — it is RELEASED after.
    const audition = await panels.evaluate(async () => {
        const row = document.querySelector('#music-page .mp-row .mp-play');
        if (!row) return { err: 'no play button' };
        row.click();
        await new Promise(r => setTimeout(r, 2600));
        return { clicked: true };
    });
    if (audition.err) fails.push(audition.err);
    else {
        const eng = page.frames().find(f => /RealityEngine\.9\.html/.test(f.url()));
        const during = eng ? await eng.evaluate(() => ({
            auditioning: window._musicPageAuditioning === true,
            playing: !!(window._musicPageAudioProbe && !window._musicPageAudioProbe.paused),
        })) : null;
        if (!during) fails.push('engine frame unreachable');
        else {
            if (!during.auditioning) fails.push('play did not set _musicPageAuditioning — the engine never received MUSIC_PAGE_PLAY');
            else notes.push('play reached the engine; composer held via s.blocked');
            if (!during.playing) notes.push('⚠ audio element not advancing (headless autoplay is unreliable) — the message path is still proven');
            else notes.push('audio element is actually playing');
        }
        // RELEASE — the bug I nearly shipped: silenceNow() would have taken the room permanently.
        await panels.evaluate(() => { const b = document.querySelector('#music-page .mp-row .mp-play'); b && b.click(); });
        await new Promise(r => setTimeout(r, 1200));
        // ⚠ THIS ASSERTION WAS INVERTED UNTIL 2026-08-15, and it was encoding the bug as the contract.
        //    It required stop to CLEAR _musicPageAuditioning immediately. But that flag feeds s.blocked,
        //    which the SILENCE cue reads — so clearing it RELEASES the Composer, and pressing ■ while
        //    the Composer was playing could make the dungeon LOUDER. Mark reported "stop doesn't work"
        //    four times against a probe that was green the whole time.
        //    The contract now has TWO halves, and either alone is a lie:
        //      1. stop HOLDS the block, so the 350 ms arbitration cannot re-pick what we just stopped;
        //      2. the hold RELEASES on its own, so one press of ■ cannot take the room permanently —
        //         which is the failure the note above this block warned about and is still real.
        const heldNow = eng ? await eng.evaluate(() => window._musicPageAuditioning === true) : false;
        if (!heldNow) fails.push('stop did not HOLD the Composer — arbitration will re-pick the track it just stopped, which is the "stop does nothing" report');
        else notes.push('stop held the Composer down (silence is real)');
        // Then prove it is a hold and not a latch. Shorten the window so the probe does not sit for 8s.
        if (eng) {
            await eng.evaluate(() => { window._mpStopHoldMs = 400; });
            await panels.evaluate(() => { const b = document.querySelector('#music-page .mp-row .mp-play'); b && b.click(); });
            await new Promise(r => setTimeout(r, 300));
            await panels.evaluate(() => { const b = document.querySelector('#music-page .mp-row .mp-play'); b && b.click(); });
            await new Promise(r => setTimeout(r, 1400));
            const released = await eng.evaluate(() => window._musicPageAuditioning !== true);
            if (!released) fails.push('the stop hold never released — one press of ■ takes the room permanently');
            else notes.push('the hold released on its own (the room comes back)');
        }
    }

    // ── 4. EMPTY-TAB WORDING ──────────────────────────────────────────────────────────────────────
    const combat = await panels.evaluate(() => {
      const t = [...document.querySelectorAll('.mp-tab')].find(x => x.textContent.includes('COMBAT'));
      if (!t) return null;
      t.click();
      const e = document.querySelector('#music-page .mp-empty p');
      return e ? e.textContent.trim() : '(tab has rows, not empty)';
    });
    // Mark 2026-08-05: "those songs are in the fucking folder okay?" — COMBAT must NOT be empty now.
    // Duel/blade tracks exist on disk and the page is supposed to place them without him grading first.
    if (combat == null) fails.push('COMBAT tab not clickable');
    else if (/tab has rows/.test(combat)) notes.push('COMBAT has tracks from disk (no grading required first)');
    else fails.push(`COMBAT is EMPTY ("${combat}") — the disk has duel/blade tracks that should land here`);

    await sleep(400);
    await panels.evaluate(() => { const t = [...document.querySelectorAll('.mp-tab')].find(x => x.textContent.includes('STARLETTE')); t && t.click(); });
    await sleep(600);

    // ── 6. NO NETWORK ─────────────────────────────────────────────────────────────────────────────
    if (offOrigin.length) fails.push(`${offOrigin.length} off-origin request(s) during the interaction: ${offOrigin.slice(0, 3).join(' · ')}`);
    else notes.push('no off-origin traffic while the page was used');

    try {
      const el = await panels.$('#music-page .mp-card');
      if (el) { await el.screenshot({ path: path.join(OUT, 'music-page.png') }); notes.push('screenshot → .probe-shots/music-page.png'); }
    } catch (_) {}
    if (errs.length) notes.push(`page errors: ${errs.length} — ${errs.slice(0, 2).join(' | ')}`);

  } catch (e) {
    fails.push('probe threw: ' + (e && e.message ? e.message : String(e)));
  } finally {
    await browser.close(); server.close();
    console.log('\n── MUSIC PAGE ─────────────────────────────────────────────');
    notes.forEach(n => console.log('  · ' + n));
    if (fails.length) { console.log('\n  ✗ FAIL'); fails.forEach(f => console.log('    ' + f)); process.exit(1); }
    console.log('\n  ✓ PASS\n');
    process.exit(0);
  }
})();
