/**
 * probe-gauge-locale.js — do the capsule gauges print their title in the player's language?
 * (Mark 2026-07-28: "localize health bars" → "i mean for the language of HEALTH GAUGE GOLD GAUGE to
 *  be localized when viewing the health bars")
 *
 * WHAT WAS WRONG: the capsule's printed title was a hard-coded 'HEALTH GAUGE' / 'GOLD GAUGE' baked
 * into a canvas texture by js/v8/ui/OrigamiCapsuleGauge.js. It is not markup, so [data-i18n] could
 * never reach it and applyLocale could never repaint it — it stayed English in Japanese play, on the
 * bar floating over the player's own head and over every monster.
 *
 * THE TWO THINGS THIS PROVES, and the second is the one that could quietly cost fps:
 *
 * 1. IT ACTUALLY CHANGES LANGUAGE, and the glyphs RENDER. A canvas draw with a font stack that has no
 *    Japanese face does not throw — it rasterises tofu boxes. So this does not merely assert that
 *    labelFor() returns 体力計; it repaints and samples the canvas PIXELS, and compares the ink laid
 *    down in each language. Identical pixel signatures would mean the repaint silently did nothing;
 *    a blank band would mean the font has no kanji.
 *
 * 2. IT COMPILES NOTHING. The markings texture is SHARED by every gauge in the scene (one per mode per
 *    THREE namespace). relabel() redraws the existing canvas and sets needsUpdate rather than minting
 *    a CanvasTexture, because swapping the texture OBJECT would re-point every gauge material at a new
 *    map. Changing a texture's IMAGE does not touch the r128 program cacheKey — map PRESENCE is what
 *    is baked in — so a correct implementation costs zero programs. This asserts that, because "the
 *    label localizes but the language switch now stutters" is a bad trade and an easy one to make.
 *
 * Usage: node scripts/probe-gauge-locale.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(8000);

  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('✗ engine frame not found'); await b.close(); process.exit(1); }

  const R = await eng.evaluate(async () => {
    const out = { notes: [] };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const G = window.OrigamiCapsuleGauge;
    if (!G) { out.notes.push('window.OrigamiCapsuleGauge missing'); return out; }
    out.hasRelabel = typeof G.relabel === 'function';
    out.hasLabelFor = typeof G.labelFor === 'function';
    if (!out.hasRelabel) { out.notes.push('relabel() not exported — nothing to test'); return out; }

    out.labels = {
      health_en: G.labelFor('health', 'en'), health_ja: G.labelFor('health', 'ja'),
      gold_en:   G.labelFor('gold', 'en'),   gold_ja:   G.labelFor('gold', 'ja'),
    };

    // Ink signature of the TITLE BAND only (y 340..512) — the ticks above it are language-neutral.
    // Counts non-transparent pixels and their rough horizontal spread, so "changed" cannot be faked
    // by a no-op and "rendered" cannot be faked by a blank clear.
    const sig = () => {
      const cvs = [...document.querySelectorAll('canvas')].filter(c => c.width === 2048 && c.height === 512);
      // The markings canvases are created detached, so find them via the live textures instead.
      const marks = [];
      if (window.scene) window.scene.traverse(o => {
        const m = o && o.material;
        const t = m && m.map;
        if (t && t.image && t.image.width === 2048 && t.image.height === 512 && marks.indexOf(t) < 0) marks.push(t);
      });
      const res = [];
      for (const t of marks) {
        try {
          const c = t.image, ctx = c.getContext('2d');
          const d = ctx.getImageData(0, 340, c.width, c.height - 340).data;
          let ink = 0, minX = 1e9, maxX = -1;
          for (let i = 3, p = 0; i < d.length; i += 4, p++) {
            if (d[i] > 24) { ink++; const x = p % c.width; if (x < minX) minX = x; if (x > maxX) maxX = x; }
          }
          res.push({ ink, minX: minX === 1e9 ? -1 : minX, maxX });
        } catch (e) { res.push({ error: String(e && e.message) }); }
      }
      return { count: marks.length, bands: res, detached: cvs.length };
    };

    const progs = () => window.renderer.info.programs.length;

    out.before = sig();
    out.progBefore = progs();
    out.repaintedJa = G.relabel('ja');
    await wait(1200);
    out.ja = sig();
    out.progAfterJa = progs();
    out.repaintedEn = G.relabel('en');
    await wait(1200);
    out.back = sig();
    out.progAfterEn = progs();
    return out;
  });

  const P = s => console.log(s);
  P('\n── 🩸 CAPSULE GAUGE LABEL LOCALIZATION ──\n');
  (R.notes || []).forEach(n => P('  ⚠ ' + n));
  let fails = 0;
  if (R.labels) {
    P('  labels resolved by the component:');
    P('     HEALTH   en "' + R.labels.health_en + '"   ja "' + R.labels.health_ja + '"');
    P('     GOLD     en "' + R.labels.gold_en + '"   ja "' + R.labels.gold_ja + '"');
    const differ = R.labels.health_en !== R.labels.health_ja && R.labels.gold_en !== R.labels.gold_ja;
    P('     both differ between languages: ' + (differ ? '✓' : '✗ a language returns the same string'));
    if (!differ) fails++;
    const hasKana = /[぀-ヿ一-鿿]/.test(String(R.labels.health_ja));
    P('     ja label is actually Japanese: ' + (hasKana ? '✓' : '✗ "' + R.labels.health_ja + '"'));
    if (!hasKana) fails++;
  }
  if (R.before) {
    P('\n  live markings textures found in the scene: ' + R.before.count
      + '   ·   relabel() repainted: ja ' + R.repaintedJa + ', en ' + R.repaintedEn);
    const band = (tag, s) => s && s.bands.forEach((x, i) => P('     ' + tag.padEnd(5) + ' texture ' + i
      + '  ink px ' + String(x.ink).padStart(6) + '   x-span ' + x.minX + '..' + x.maxX));
    band('EN', R.before); band('JA', R.ja); band('back', R.back);

    if (R.before.count === 0) {
      P('\n     ⚠ NO markings texture is on screen in this headless run, so the PIXEL half could not be\n'
        + '       exercised. The label resolution above is still proven; the repaint is not.');
    } else {
      const inkOf = s => s.bands.reduce((a, x) => a + (x.ink || 0), 0);
      const e0 = inkOf(R.before), j = inkOf(R.ja), e1 = inkOf(R.back);
      const changed = j !== e0;
      P('\n     title band CHANGED on switch to ja: ' + (changed ? '✓ (' + e0 + ' → ' + j + ' ink px)' : '✗ identical — the repaint did nothing'));
      if (!changed) fails++;
      const rendered = j > 200;
      P('     ja glyphs actually rendered:        ' + (rendered ? '✓ ' + j + ' ink px' : '✗ only ' + j + ' px — the font stack has no Japanese face (tofu/blank)'));
      if (!rendered) fails++;
      const restored = Math.abs(e1 - e0) < Math.max(50, e0 * 0.02);
      P('     switching back restores the EN band: ' + (restored ? '✓' : '✗ ' + e0 + ' → ' + e1));
      if (!restored) fails++;
    }
  }
  if (R.progBefore != null) {
    const d1 = R.progAfterJa - R.progBefore, d2 = R.progAfterEn - R.progAfterJa;
    P('\n  ── E15 SAFETY: does relabeling compile anything? ──');
    P('     programs ' + R.progBefore + ' → ' + R.progAfterJa + ' → ' + R.progAfterEn
      + '   (Δ ' + (d1 >= 0 ? '+' : '') + d1 + ', ' + (d2 >= 0 ? '+' : '') + d2 + ')');
    const clean = d1 === 0 && d2 === 0;
    P('     ' + (clean
      ? '✓ ZERO programs — the shared texture is redrawn in place, not replaced. No recompile.'
      : '✗ programs moved — something is minting a texture or material per language switch.'));
    if (!clean) fails++;
  }
  P('\n  ' + (fails ? '✗ ' + fails + ' CHECK(S) FAILED' : '✅ every check passed'));
  P('\npageerrors: ' + (errs.length ? '✗ ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 3).join('\n  ') : '✓ 0'));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
