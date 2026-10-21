#!/usr/bin/env node
/**
 * probe-loadbar-i18n.js — Mark 2026-08-21: "localize progress bar text", then "still progress bar
 * is english".
 *
 * ⚠ WHY THIS PROBE WAS REWRITTEN, because the first version is the whole lesson.
 *   v1 drove the two receivers with a SYNTHETIC ENGINE_LOAD_PROGRESS post after forcing
 *   `window.currentLang`. It passed every check and the bar was still English for most of a real
 *   boot. It proved "IF a post carries key load.combat AND currentLang is ja, the bar shows
 *   Japanese" — a true statement about the translation path, and not the question. The question is
 *   "what does Mark SEE while the game boots in Japanese", and only a real boot answers it.
 *   The gap it hid: the engine has ~23 progress producers, not the 7 written as a literal `text:`.
 *   Thirteen world-build steps route through the generic `_yieldBuild(pct, text)` helper and four
 *   are parameterized template literals; v1 never touched them and could never have noticed.
 *
 * SO THIS BOOTS THE REAL GAME with ja chosen before any page script runs, samples
 * `#wg-loader-status` throughout, and asserts EVERY string it ever displays is Japanese.
 */
const { chromium } = require('playwright');
const URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';
// Substrings that legitimately stay Latin inside a localized string: filenames, units, counters.
const ALLOWED_LATIN = /\.(glb|mp3|png|jpe?g|json|bin|ktx2|hdr)|^[\d\s\/.:()–·-]+$|MB/i;

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1',
                                          args: ['--use-angle=metal', '--enable-gpu'] });
  let bad = 0;
  const ck = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };
  try {
    const runBoot = async (lang) => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const pageerrors = []; page.on('pageerror', e => pageerrors.push(e.message));
    // The locale is chosen BEFORE any page script runs — this is the state Mark plays in.
    await page.addInitScript(l => { try { localStorage.setItem('origami_lang', l); } catch (_) {} }, lang);
    await page.goto(URL, { timeout: 60000 });

    const seen = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      const s = await page.evaluate(() => {
        for (const f of Array.from(document.querySelectorAll('iframe'))) {
          try {
            if (!/Panels/.test(f.src)) continue;
            const el = f.contentDocument && f.contentDocument.getElementById('wg-loader-status');
            if (el) return { txt: el.textContent, lang: f.contentWindow.currentLang };
          } catch (_) {}
        }
        return null;
      }).catch(() => null);
      if (s && s.txt && (!seen.length || seen[seen.length - 1].txt !== s.txt)) seen.push(s);
      // ⚠ DO NOT gate on window.__engineReady. It flips at ~2s while the loader keeps running to
      //   ~13s, so breaking on it captured the first FIVE strings and declared the run complete —
      //   a sampling window that ends before the thing it is sampling does. Sample until the
      //   loader element itself goes away (the guide hides it at 100%), with a hard time cap.
      if (seen.length && s === null) break;
      await page.waitForTimeout(40);
    }

    await page.close();
    return { seen, pageerrors };
    };

    const JP = /[぀-ヿ㐀-䶿一-鿿]/;
    for (const lang of ['ja', 'en']) {
      const { seen, pageerrors } = await runBoot(lang);
      console.log(`\n── EVERY STRING THE LOADER SHOWED IN A REAL ${lang} BOOT (${seen.length}) ──`);
      const wrong = [];
      for (const s of seen) {
        const jp = JP.test(s.txt);
        const neutral = ALLOWED_LATIN.test(s.txt);
        if (lang === 'ja' && !jp && !neutral) wrong.push(s.txt);
        if (lang === 'en' && jp) wrong.push(s.txt);
        console.log(`  ${jp ? 'あ' : (neutral ? '—' : 'EN')}  ${s.txt}`);
      }
      console.log('');
      ck(seen.length >= 8, `${lang}: the bar actually ran (${seen.length} distinct strings)`);
      ck(seen.every(s => s.lang === lang), `${lang}: the Panels frame held that locale for every sample`);
      ck(wrong.length === 0, lang === 'ja'
          ? `ja: NO ENGLISH STRING SURVIVES${wrong.length ? ' — ' + JSON.stringify(wrong.slice(0,8)) : ''}`
          : `en: NO JAPANESE LEAKS IN — a fix that hardcodes ja is the same bug reversed${wrong.length ? ' — ' + JSON.stringify(wrong.slice(0,8)) : ''}`);
      ck(!seen.some(s => /^load\./.test(s.txt)), `${lang}: no raw load.* key ever reached the screen`);
      if (pageerrors.length) { console.log(`  pageerrors(${lang}):`, pageerrors.slice(0,3)); bad++; }
    }
    console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  } finally { await browser.close(); }
  process.exit(bad ? 1 : 0);
})();
