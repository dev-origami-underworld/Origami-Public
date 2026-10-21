#!/usr/bin/env node
/* probe-card-taxonomy.js — does every card the player can actually SEE wear one of the four words?
 *
 * The law (CLAUDE.md): a card's category reads MELEE / RANGED / SPELL / ITEM. Nothing else.
 *
 * WHY THIS PROBE EXISTS, and why it does not simply grep:
 *   The pill on a card face is NOT the category id. It is `_PILL_LABEL[catId] || catId.toUpperCase()`,
 *   computed in TWO places that nothing links mechanically — spawnLootCard (Engine9) for the floor and
 *   _buildMiniVendingCard (VendingMachine.js) for the shop. A grep for 'SPELLS' finds 169 hits of which
 *   ~150 are prose, and a grep for 'SPELL' cannot tell a load-bearing DECK KEY from a display string.
 *   So: boot the real game, read the real tables, and run the real pill expression over every catId that
 *   can actually reach a card. That distinction is the whole point — 'SPELLS' survives as a routing key
 *   on purpose, and a probe that flagged it would be demanding a rename that breaks the deck wheel.
 *
 * ALSO CHECKED: the `desc` line. A KATANA reads "Melee Weapon"; every spell used to read the literal
 *   word "SPELLS" — a placeholder that shipped as copy. A desc equal to its own category is the tell.
 *
 * MAKE-IT-FAIL: TAXONOMY_BREAK=1 injects a bogus 'SPELLS' pill back into the live table before the
 *   assertions run. If the probe still passes under that, the probe is measuring nothing — which is
 *   exactly how the last one fooled me (it asked the function under test whether the function was right).
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BREAK = process.env.TAXONOMY_BREAK === '1';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.srt':'text/plain','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf' };

/* The four, plus the documented deliberate exceptions. GOLD is a coin, not a card category; SKILL is
 * Mark's explicit 2026-07-19 ruling ("DICE GAME NOT DICE : SKILL NOT ITEM"); WAGER/GAMING are the
 * betting deck. Anything OUTSIDE this set on a card face is a taxonomy break. */
const TAXONOMY = ['MELEE', 'RANGED', 'SPELL', 'ITEM'];
const ALLOWED_EXTRA = ['GOLD', 'SKILL', 'WAGER', 'GAMING', 'QUEST'];

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
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    p.on('pageerror', e => errs.push(String(e && e.message).slice(0, 160)));
    await p.goto(base + '/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 150000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));

    if (BREAK) {
      await p.evaluate(() => { try { window.__taxBreak = true; } catch (_) {} });
    }

    out = await p.evaluate(async ({ doBreak }) => {
      const res = { pills: {}, badDesc: [], deckKeyAlive: {}, labels: {}, notes: [] };

      let DB = null;
      try { DB = await import('./js/v8/core/CardDatabase.js'); } catch (e) { res.notes.push('CardDatabase import failed: ' + e.message); }
      const MCD = (DB && DB.MasterCardDatabase) || window.MasterCardDatabase || {};

      let JSONCARDS = [];
      try { JSONCARDS = await (await fetch('./data/cards.json')).json(); } catch (e) { res.notes.push('cards.json fetch failed: ' + e.message); }

      const catIds = new Set();
      for (const name of Object.keys(MCD)) { const c = MCD[name]; if (c && c.id) catIds.add(String(c.id).toUpperCase()); }
      for (const c of JSONCARDS) { if (c && c.type) catIds.add(String(c.type).toUpperCase()); }

      res.catIds = Array.from(catIds);

      // ── 2. desc must be a noun phrase, never an echo of the category ─────────────────────────
      const isEcho = (d, id, type) => {
        const D = String(d || '').toUpperCase().replace(/S$/, '');
        return D && (D === String(id || '').toUpperCase().replace(/S$/, '') ||
                     D === String(type || '').toUpperCase().replace(/S$/, ''));
      };
      for (const name of Object.keys(MCD)) {
        const c = MCD[name];
        if (c && isEcho(c.desc, c.id, c.type)) res.badDesc.push('MCD:' + name + ' desc=' + c.desc);
      }
      for (const c of JSONCARDS) {
        if (c && isEcho(c.desc, c.type, c.type)) res.badDesc.push('json:' + (c.name || c.id) + ' desc=' + c.desc);
      }

      // ── 3. the deck keys must STILL be the old strings — the rename we deliberately did NOT do ──
      const pf = Array.from(document.querySelectorAll('iframe'))
        .map(f => { try { return f.contentWindow; } catch (_) { return null; } })
        .filter(w => w && typeof w.showCardType === 'function')[0] || null;
      if (!pf) { res.notes.push('panels frame not reachable — deck checks skipped'); }
      else {
        for (const k of ['SPELLS', 'MELEE', 'RANGED', 'ITEM']) {
          let ok = false;
          try { pf.showCardType(k); ok = true; } catch (e) { res.notes.push('showCardType(' + k + ') threw: ' + e.message); }
          res.deckKeyAlive[k] = ok;
        }
        try {
          const el = pf.document.querySelector('.deck-empty-msg');
          res.labels.emptyMsg = el ? el.textContent.trim() : null;
        } catch (_) {}
      }
      return res;
    }, { doBreak: BREAK });

    // ── 1. SPAWN A REAL CARD PER CATEGORY AND READ THE PILL THAT WAS ACTUALLY PRINTED ──────────
    // Runs in the ENGINE FRAME, not the top page — NewOrigami.9.html hosts Engine9 in an iframe, so
    // window.spawnLootCard does not exist at the top level. (First cut of this probe evaluated at the
    // top, found nothing, and the "did we measure anything" guard is the only reason that showed up as
    // a failure instead of a clean green sheet.)
    // spawnLootCard bakes the pill into a canvas texture, so it cannot be read back off the card —
    // which is why the engine records it in userData.displayTypePill after every re-skin. Read THAT.
    // Re-deriving the expression here would be a probe carrying its own copy of the value it audits,
    // and it would pass just as happily if the engine edit had never landed.
    const ef = p.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!ef) { out.notes.push('FATAL: engine frame not found'); out.pillSourceUnavailable = true; }
    else {
      const pillRes = await ef.evaluate(({ cats, doBreak }) => {
        const r = { pills: {}, notes: [], unavailable: false };
        if (typeof window.spawnLootCard !== 'function' || !Array.isArray(window.lootItems)) {
          r.notes.push('FATAL: spawnLootCard/lootItems not reachable in engine frame');
          r.unavailable = true; return r;
        }
        for (const cat of cats) {
          const before = window.lootItems.length;
          try {
            // Spawned at the origin tile and binned immediately — no probe litter reaches the world.
            window.spawnLootCard(0, 0, cat, 'TAXONOMY PROBE ' + cat, 'probe', '試', 'probe');
          } catch (e) { r.notes.push('spawn(' + cat + ') threw: ' + e.message); }
          const c = window.lootItems[window.lootItems.length - 1];
          if (window.lootItems.length > before && c && c.userData) {
            let pill = c.userData.displayTypePill;
            if (doBreak && cat === 'SPELLS') pill = 'SPELLS';   // make-it-fail: re-inject the violation
            r.pills[cat] = pill || '(no displayTypePill recorded)';
            try { window.lootItems.pop(); if (c.parent) c.parent.remove(c); } catch (_) {}
          } else {
            r.pills[cat] = '(spawn produced no card)';
          }
        }
        return r;
      }, { cats: (out.catIds || []).concat(['MISSILE', 'KATANA', 'GOLD_COIN']), doBreak: BREAK });
      out.pills = pillRes.pills;
      out.pillSourceUnavailable = pillRes.unavailable;
      out.notes.push(...pillRes.notes);
    }
  } catch (e) { out = { fatal: String(e.message).slice(0, 300) }; }
  try { await b.close(); } catch (_) {}
  try { await new Promise(r => server.close(r)); } catch (_) {}
  await new Promise(r => setTimeout(r, 300));

  if (BREAK) console.log('⚠ TAXONOMY_BREAK=1 — the violation was re-injected; this run MUST fail.\n');
  console.log('pageerrors:', errs.length);
  errs.slice(0, 4).forEach(e => console.log('  ✗ ' + e));
  if (!out || out.fatal) { console.log('FATAL:', out && out.fatal); process.exitCode = 1; return; }
  (out.notes || []).forEach(n => console.log('  note:', n));

  console.log('\n=== category → pill the player reads ===');
  const bad = [];
  for (const [cat, pill] of Object.entries(out.pills).sort()) {
    const ok = TAXONOMY.includes(pill) || ALLOWED_EXTRA.includes(pill);
    console.log(' ' + (ok ? '✓' : '✗') + ' ' + cat.padEnd(12) + ' → ' + pill);
    if (!ok) bad.push(cat + '→' + pill);
  }
  // POSITIVE CONTROL: three re-skins this probe was never told about. If MISSILE comes back RANGED,
  // the pills above were read out of the engine's table and not re-derived here. If they come back as
  // themselves, the probe is auditing its own imagination and every ✓ above is worthless.
  const CONTROL = { MISSILE: 'RANGED', KATANA: 'MELEE', GOLD_COIN: 'GOLD' };
  const controlBad = Object.entries(CONTROL).filter(([k, v]) => out.pills[k] !== v);
  console.log('\n=== positive control (is the probe reading the ENGINE?) ===');
  for (const [k, v] of Object.entries(CONTROL)) {
    console.log(' ' + (out.pills[k] === v ? '✓' : '✗') + ' ' + k.padEnd(12) + ' → ' + out.pills[k] + '  (expect ' + v + ')');
  }

  console.log('\n=== desc echoing its own category ===');
  console.log(out.badDesc.length ? out.badDesc.map(s => '  ✗ ' + s).join('\n') : '  ✓ none');
  console.log('\n=== deck keys still route (the rename we did NOT do) ===');
  console.log(' ', JSON.stringify(out.deckKeyAlive), 'emptyMsg=', JSON.stringify(out.labels.emptyMsg));

  const deckOk = ['SPELLS', 'MELEE', 'RANGED', 'ITEM'].every(k => out.deckKeyAlive[k] === true);
  // An EMPTY pill table is a silent pass, not a pass. If the spawn path was unreachable the probe
  // audited nothing at all, and "no violations found" would be a lie of omission.
  const measured = Object.keys(out.pills).length > 0 && !out.pillSourceUnavailable;
  if (!measured) console.log('\n⚠ no pills were measured — the audit did not run');
  if (controlBad.length) console.log('\n⚠ POSITIVE CONTROL FAILED — the probe is not reading the engine; ignore the ✓ marks above');
  const pass = measured && !controlBad.length && !bad.length && !out.badDesc.length && deckOk && !errs.length;
  console.log('\n' + (pass
    ? '✅ every card face reads the taxonomy; no desc echoes; all four deck keys still route'
    : '❌ ' + (bad.length ? 'pill breaks: ' + bad.join(', ') + '  ' : '')
            + (out.badDesc.length ? 'desc echoes: ' + out.badDesc.length + '  ' : '')
            + (!deckOk ? 'deck routing broken  ' : '')
            + (errs.length ? 'pageerrors: ' + errs.length : '')));
  process.exitCode = pass ? 0 : 1;
})();
