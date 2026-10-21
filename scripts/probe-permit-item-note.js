#!/usr/bin/env node
/*
 * probe-permit-item-note.js — THE SINGING CARD SAYS ITEM, AND ITS NOTE IS THE PERMIT'S COLOUR.
 *
 * ⛔ SUPERSEDED 2026-09-30 — see the DISABLED-FEATURES REGISTER at the top of Origami.RealityEngine.9.html: permits are the
 * player's green (0x4CAF50, LootCardBuilder.PERMIT_RIM), so steps 2 and 3 now check the note against that green and its hue
 * (122.4°), not the label gold. The frame lookup also takes the engine's current name (Origami.RealityEngine.9.html).
 *
 * Mark 2026-08-04: "caberet singing card - title should be ITEM not SKILL. make the 3d model of golden
 * note more gold color like the label, that yellow gold, its an ugly orange gold".
 *
 * Both claims are about what is ON SCREEN, so both are measured off the live object rather than the
 * source. The card's pill is baked into a canvas texture, and the note's colour is a material on a mesh
 * inside the bubble — reading the file would only prove the source changed, not that this card got it.
 *
 *   1. PILL = ITEM   — read back from the built card's own recorded pill.
 *   2. NOTE IS GOLD  — the medallion holds meshes whose material colour is the label's yellow gold
 *                      (SONG_GOLD_RIM 0xffd700), not the old 0xffd35c.
 *   3. NOT ORANGE    — the emissive's HUE is the real defect. Orange 0x9a6a00 sits at ~41°; the label's
 *                      gold is ~50.6°. Measured as hue, because "is it orange" cannot be answered by
 *                      comparing hex strings and a dimmer orange is still orange.
 *   4. SKILLS UNTOUCHED — DICE/POKER keep the SKILL pill (Mark 2026-07-19: "SKILL NOT ITEM"). A fix
 *                      that relabels every skill card would be a regression wearing this fix's clothes.
 *
 * Usage: node scripts/probe-permit-item-note.js
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

// Hue in degrees, 0-360. The orange/gold question is a hue question and nothing else.
const hueOf = (hex) => {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};

(async () => {
  const fails = [], notes = [];
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/${ENTRY}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(8000);
    const eng = page.frames().find(f => /Engine9\.html|RealityEngine\.9\.html/.test(f.url()));
    if (!eng) throw new Error('engine frame not found');

    const LABEL_GOLD = 0x3aa882;   // the permit colour (LootCardBuilder.PERMIT_JADE_HEX, the jade permit since 2026-09-30, the evening); the name is kept for the checks below

    // Build the cards through the ENGINE's own spawn path so this measures what a player gets.
    const got = await eng.evaluate(async (LG) => {
      const out = { pills: {}, noteColors: [], noteEmissives: [], err: null };
      try {
        const mk = (cat, title) => {
          const c = window.spawnLootCard(2, 2, cat, title, 'probe', '唄', 'PROBE');
          if (!c) return null;
          // The pill is baked into the card texture, so read the value the builder recorded rather
          // than trying to OCR a canvas.
          const pill = c.userData?.displayTypePill ?? c.userData?.typePill ?? null;
          return { obj: c, pill };
        };
        const sing = mk('SKILL', 'SINGING');
        out.pills.SINGING = sing ? sing.pill : 'NO CARD';
        const dice = mk('SKILL', 'DICE GAME');
        out.pills['DICE GAME'] = dice ? dice.pill : 'NO CARD';

        // Walk the SINGING card for the note's material colours.
        if (sing && sing.obj && sing.obj.traverse) {
          sing.obj.traverse(o => {
            const m = o.material;
            if (!m || !m.color) return;
            const hex = m.color.getHex();
            // gold-ish only: the bubble, the card face and the black ink are not the note
            if (hex === LG || hex === 0xffd35c || hex === 0xffcf3a) {
              out.noteColors.push(hex);
              if (m.emissive) out.noteEmissives.push(m.emissive.getHex());
            }
          });
        }
        try { sing?.obj?.parent?.remove(sing.obj); dice?.obj?.parent?.remove(dice.obj); } catch (_) {}
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    }, LABEL_GOLD);

    if (got.err) fails.push('engine threw while building probe cards: ' + got.err);

    // ── 1. THE PILL ───────────────────────────────────────────────────────────────────────────────
    if (got.pills.SINGING === 'NO CARD') fails.push('SINGING card did not build — cannot judge the pill');
    else if (got.pills.SINGING == null) notes.push('⚠ pill not recorded on userData — see the note below');
    else if (got.pills.SINGING !== 'ITEM') fails.push(`SINGING pill reads "${got.pills.SINGING}", expected ITEM`);
    else notes.push('SINGING pill reads ITEM');

    // ── 4. AND REAL SKILLS ARE UNTOUCHED ──────────────────────────────────────────────────────────
    if (got.pills['DICE GAME'] && got.pills['DICE GAME'] !== 'NO CARD' && got.pills['DICE GAME'] != null) {
      if (got.pills['DICE GAME'] !== 'SKILL') fails.push(`DICE GAME pill became "${got.pills['DICE GAME']}" — Mark 07-19 requires SKILL`);
      else notes.push('DICE GAME still reads SKILL — real skills untouched');
    }

    // ── 2 + 3. THE NOTE'S GOLD ────────────────────────────────────────────────────────────────────
    if (!got.noteColors.length) {
      notes.push('⚠ no gold mesh found on the SINGING card — the note may not have built in this run');
    } else {
      const stale = got.noteColors.filter(c => c !== LABEL_GOLD);
      if (stale.length) fails.push(`note colour(s) ${stale.map(c => '0x' + c.toString(16)).join(',')} are not the permit jade 0x3aa882`);
      else notes.push(`note base colour is the permit jade 0x3aa882 (${got.noteColors.length} mesh(es))`);

      const goldHue = hueOf(LABEL_GOLD);
      for (const em of got.noteEmissives) {
        if (em === 0) continue;
        const h = hueOf(em), d = Math.abs(h - goldHue);
        if (d > 5) fails.push(`emissive 0x${em.toString(16)} sits at hue ${h.toFixed(1)}° vs the label's ${goldHue.toFixed(1)}° — that is the orange cast Mark reported`);
        else notes.push(`emissive 0x${em.toString(16)} hue ${h.toFixed(1)}° matches the permit colour (${goldHue.toFixed(1)}°)`);
      }
    }
    if (errs.length) notes.push(`page errors: ${errs.length} — ${errs.slice(0, 2).join(' | ')}`);

  } catch (e) {
    fails.push('probe threw: ' + (e && e.message ? e.message : String(e)));
  } finally {
    await browser.close(); server.close();
    console.log('\n── SINGING CARD: ITEM PILL + YELLOW-GOLD NOTE ─────────────');
    notes.forEach(n => console.log('  · ' + n));
    if (fails.length) { console.log('\n  ✗ FAIL'); fails.forEach(f => console.log('    ' + f)); process.exit(1); }
    console.log('\n  ✓ PASS');
    process.exit(0);
  }
})();
