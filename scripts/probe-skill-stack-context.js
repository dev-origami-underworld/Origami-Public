#!/usr/bin/env node
/**
 * probe-skill-stack-context.js — Mark 2026-08-12: "make sure to group skill cards that are
 * collected behind Reload once outside Caberet."
 *
 * TWO HALVES, AND EITHER ONE ALONE IS A LIE:
 *   · the collected SKILL cards collapse into ONE column outside the cabaret, and
 *   · RELOAD is the card on the FACE of that column.
 * Stacking without the pin satisfies "behind Reload" as a sentence while showing a POKER hand or a
 * permit as the column's face — which is the opposite of what the screenshot would show.
 *
 * Calls the REAL allocator (window._compressForSlots, exposed as a debug handle for exactly this)
 * rather than re-deriving its arithmetic — a probe that re-implements the code it tests proves only
 * that it can copy. The context is driven by writing window._playerContext, the same object the
 * PLAYER_CONTEXT beacon writes, so the branch under test is the shipped one.
 *
 * ⚠ WHAT THIS DOES **NOT** COVER: that the engine ever SETS inCabaret true in a real walk. That
 *   needs a live traverse into the cabaret; headless never gets there. Verified here: the derivation
 *   exists and is wired (window._playerInCabaret is a function in the engine frame) — assertion 5.
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
  let out = null, engWired = false;
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    p.on('pageerror', e => errs.push(String(e && e.message).slice(0, 200)));
    await p.goto(base + '/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 180000 });
    await new Promise(r => setTimeout(r, 9000));

    const eng = p.frames().find(f => /Engine9\.html/.test(f.url()));
    if (eng) engWired = await eng.evaluate(() => typeof window._playerInCabaret === 'function');

    const pan = p.frames().find(f => /Panels\.html/.test(f.url()));
    if (!pan) throw new Error('panels frame not found');

    out = await pan.evaluate(() => {
      const R = { handle: typeof window._compressForSlots === 'function' };
      if (!R.handle) return R;
      // A gangster hand: RELOAD (role skill, granted) + three COLLECTED skills, plus one card from
      // each other family so the allocator sees a realistic multi-family spread. SINGING is deliberately
      // first in the list — it is the card Mark's 08-01 screenshot showed splitting the gold row, and
      // without the pin it would be the face of the stack.
      const cats = [
        { id:'SKILL',  kanji:'歌', desc:'Singing Permit', attr:'PERMIT', qty:1, cards:['SINGING'] },
        { id:'SKILL',  kanji:'牌', desc:'Poker',          attr:'PLAY',   qty:1, cards:['POKER'] },
        { id:'SKILL',  kanji:'装', desc:'Reload Skill',   attr:'Refill', qty:1, cards:['RELOAD'] },
        { id:'SKILL',  kanji:'医', desc:'First Aid',      attr:'HEAL',   qty:1, cards:['FIRST AID'] },
        { id:'RANGED', kanji:'銃', desc:'Firearm',        attr:'DMG',    qty:6, cards:['PISTOL'] },
        { id:'MELEE',  kanji:'刃', desc:'Dagger',         attr:'DMG',    qty:1, cards:['DAGGER'] },
        { id:'ITEM',   kanji:'薬', desc:'Potion',         attr:'HEAL',   qty:2, cards:['HEAL POTION'] },
      ];
      const plan = (ctx) => {
        window._playerContext = ctx;
        const { virtualCats } = window._compressForSlots(cats, 8);
        const skill = virtualCats.filter(v => v._family === 'skill');
        return { cols: skill.length, face: skill.length ? skill[0].cards[0] : null,
                 all: skill.map(s => s.cards.join('+')) };
      };
      R.outside = plan({ atTable:false, inCabaret:false });
      R.inside  = plan({ atTable:false, inCabaret:true  });
      R.table   = plan({ atTable:true,  inCabaret:true  });
      R.ctxKeys = { outside:'travel', inside:'cabaret', table:'table' };
      // The escape hatch must actually work — a documented off-switch nobody tested is a liability.
      window._stackSkillsOutsideCabaret = false;
      R.offSwitch = plan({ atTable:false, inCabaret:false });
      delete window._stackSkillsOutsideCabaret;
      return R;
    });
  } catch (e) { errs.push('HARNESS: ' + e.message); }
  finally { await b.close(); server.close(); }

  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) fail++; };
  console.log('\n' + JSON.stringify(out, null, 2) + '\n');

  check(!!out && out.handle, 'window._compressForSlots debug handle is exposed');
  if (out && out.handle) {
    check(out.outside.cols === 1,        'OUTSIDE the cabaret: 4 skill cards → 1 column (got ' + out.outside.cols + ')');
    check(out.outside.face === 'RELOAD', 'OUTSIDE: RELOAD is the face of the stack (got ' + out.outside.face + ')');
    check(out.inside.cols === 4,         'INSIDE the cabaret: the band fans back out to 4 columns (got ' + out.inside.cols + ')');
    check(out.table.cols === 1,          'AT THE FELT: still stacked (got ' + out.table.cols + ')');
    check(out.offSwitch.cols === 4,      '_stackSkillsOutsideCabaret=false restores per-card columns (got ' + out.offSwitch.cols + ')');
  }
  check(engWired, 'engine exposes window._playerInCabaret (the beacon\'s source)');
  check(errs.length === 0, 'no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));

  console.log('\n' + (fail ? 'FAILED (' + fail + ')' : 'ALL PASS') + '\n');
  process.exit(fail ? 1 : 0);
})();
