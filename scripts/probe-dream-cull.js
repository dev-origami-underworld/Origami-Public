#!/usr/bin/env node
/**
 * probe-dream-cull.js — the Paris dream cinema must HOLD STILL when nobody can see it, and it must
 * RUN when someone can. Mark 2026-08-12: "caberet animation = if player is not in caberet, make
 * sure all animations are reduced and only in caberet render. and only if in the visual dashboard,
 * otherwise dont render."
 *
 * WHY THIS PROBE EXISTS AND NOT JUST AN FPS READING: this is the MEMORIAL (Mark's parents). The
 * dangerous failure is not "it still animates" — it is a gate STUCK AT FALSE, which would freeze
 * the scene permanently and look, from outside the room, exactly like success. So the true
 * direction is asserted first-class, standing on real cabaret floor, not inferred.
 *
 * THE TRAP THIS ENCODES: _tpRoom(1) lands on a tile that carries roomId 1 but has hall === true —
 * the corridor outside the cabaret door inherits the room's id. A probe that teleports with
 * _tpRoom and reads "not in cabaret" will conclude the feature is broken when it is working. This
 * sweeps the room's bbox for a tile that is genuinely cabaret FLOOR and stands there instead.
 * (Measured 2026-08-12: 30 floor tiles vs 2 hall tiles for room 1.)
 *
 *   node scripts/probe-dream-cull.js
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.srt':'text/plain','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf' };

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
  const errs = [];
  let out = null;
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    p.on('pageerror', e => errs.push(String(e && e.message).slice(0, 200)));
    await p.goto(base + '/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 180000 });
    await new Promise(r => setTimeout(r, 12000));
    const eng = p.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!eng) throw new Error('engine frame not found');

    out = await eng.evaluate(() => {
      const R = { wired: typeof window._dreamSeenDiag === 'function' && typeof window._playerInCabaret === 'function' };
      if (!R.wired) return R;
      // 1. Spawn position — outside the cabaret. The scene must be held.
      R.outside = { inCab: window._playerInCabaret(), seen: window._dreamSeenDiag() };
      // 2. The off-switch must restore the old always-run behaviour, from the SAME spot.
      window._dreamCullWhenUnseen = false;
      R.offSwitch = window._dreamSeenDiag();
      delete window._dreamCullWhenUnseen;
      // 3. Find REAL cabaret floor (see the header trap) and stand on it.
      const rs = window._roomsProbe || [];
      const r1 = rs.find(r => r && r.id === window._cabaretRoomId);
      if (!r1) { R.noRoom = true; return R; }
      R.tiles = { floor: 0, hall: 0 };
      let stand = null;
      for (let x = Math.floor(r1.cx - r1.w / 2) - 1; x <= Math.ceil(r1.cx + r1.w / 2) + 1; x++)
        for (let z = Math.floor(r1.cz - r1.h / 2) - 1; z <= Math.ceil(r1.cz + r1.h / 2) + 1; z++) {
          try { window._tpTile(x, z); } catch (_) { continue; }
          if (window._playerRoom() !== window._cabaretRoomId) continue;
          if (window._playerInCabaret() === true) { R.tiles.floor++; if (!stand) stand = [x, z]; }
          else R.tiles.hall++;
        }
      if (stand) {
        window._tpTile(stand[0], stand[1]);
        R.stand = stand;
        R.inside = { inCab: window._playerInCabaret(), seen: window._dreamSeenDiag() };
      }
      return R;
    });
  } catch (e) { errs.push('HARNESS: ' + e.message); }
  finally { await b.close(); server.close(); }

  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) fail++; };
  console.log('\n' + JSON.stringify(out, null, 2) + '\n');

  check(!!out && out.wired, 'window._dreamSeenDiag + window._playerInCabaret are wired');
  if (out && out.wired) {
    check(out.outside.inCab === false, 'spawn is outside the cabaret (precondition)');
    check(out.outside.seen === false,  'OUTSIDE + off-screen → the dream is HELD (seen=false)');
    check(out.offSwitch === true,      '_dreamCullWhenUnseen=false restores always-run');
    check(!!out.tiles && out.tiles.floor > 0, 'the cabaret has real floor tiles (got ' + (out.tiles && out.tiles.floor) + ')');
    // ★ THE ONE THAT MATTERS: a gate stuck at false would freeze the memorial forever.
    check(!!out.inside && out.inside.inCab === true, 'standing on cabaret floor reads inCabaret=true');
    check(!!out.inside && out.inside.seen === true,  '★ ON CABARET FLOOR → the dream RUNS (seen=true)');
  }
  check(errs.length === 0, 'no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));

  console.log('\n' + (fail ? 'FAILED (' + fail + ')' : 'ALL PASS') + '\n');
  process.exit(fail ? 1 : 0);
})();
