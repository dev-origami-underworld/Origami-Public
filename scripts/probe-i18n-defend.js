#!/usr/bin/env node
/**
 * probe-i18n-defend.js — the three strings Mark screenshotted on 2026-08-20 ("fix localization
 * error here"), all of them English inside a fully Japanese HUD.
 *
 *   1. THE DEFEND CARD — 守 / 近接 in Japanese over "DEFEND / Raise your guard / NEEDS A SHIELD".
 *      Only DEFEND of the four melee moves was broken: the renderer resolves a card's i18n id as
 *      masterCard.id, falling back to the lowercased NAME (Panels ~:18125). SLASH / THRUST /
 *      HARD ATTACK have master cards (attack / quick_attack / strong_attack) and already worked;
 *      DEFEND has none, fell back to `defend`, and nothing answered to that id.
 *   2. #player-hp-state — "STABLE", written straight from the gauge's state KEY.
 *   3. The guidebook's gold bar — a hardcoded "GOLD" next to the number.
 *
 * Asserted in BOTH languages: a "fix" that hardcodes Japanese is the same bug pointing the other way.
 */
const { chromium } = require('playwright');
const { bootAndStart } = require('./lib/probe-boot');

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1',
                                          args: ['--use-angle=metal', '--enable-gpu'] });
  let bad = 0;
  const ck = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };
  try {
    const { page, timings, pageerrors } = await bootAndStart(browser, { viewport: { width: 1600, height: 900 } });
    console.log(`[boot] ready ${timings.readyMs}ms -> loop ${timings.loopMs}ms`);
    const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
    if (!pan) { console.log('FAIL — no panels frame'); process.exit(2); }
    await page.waitForTimeout(2500);

    // ── 1. the DEFEND card, through the SHIPPED lookup the renderer uses ─────
    const cards = await pan.evaluate(() => {
      const r = {};
      for (const lang of ['en', 'ja']) {
        r[lang] = ['SLASH', 'THRUST', 'HARD ATTACK', 'DEFEND'].map(n => {
          const mc = (window.OrigamiCards || []).find(c => c.name === n);
          const id = (mc && mc.id) || String(n).toLowerCase().replace(/\s+/g, '_');   // Panels ~:18125
          const loc = window.tCard(id, lang);
          return { n, id, name: loc && loc.name, desc: loc && loc.desc, attr: loc && loc.attr };
        });
      }
      return r;
    });
    console.log('\n── 1. THE FOUR MELEE MOVES ──');
    for (const lang of ['en', 'ja']) {
      for (const m of cards[lang]) console.log(`  ${lang}  ${m.n.padEnd(12)} id=${String(m.id).padEnd(14)} → ${m.name} / ${m.desc} / ${m.attr}`);
    }
    const dEn = cards.en.find(m => m.n === 'DEFEND'), dJa = cards.ja.find(m => m.n === 'DEFEND');
    ck(!!dEn.name && !!dJa.name, 'DEFEND now resolves in BOTH languages (it resolved in neither)');
    ck(dJa.name === '防御', `ja title is 防御 (got ${dJa.name})`);
    ck(/[぀-ヿ一-龯]/.test(dJa.desc || ''), `ja description is Japanese (got "${dJa.desc}")`);
    ck(/[぀-ヿ一-龯]/.test(dJa.attr || ''), `ja footer is Japanese (got "${dJa.attr}")`);
    ck(dEn.name === 'DEFEND' && /Raise your guard/.test(dEn.desc || ''),
       'EN is unchanged and matches the melee-moves table verbatim');
    ck(cards.ja.every(m => m.name && /[぀-ヿ一-龯]/.test(m.name)),
       'all four moves are Japanese in ja — no odd one out');

    // ── 2. the health state ──────────────────────────────────────────────────
    const st = await pan.evaluate(() => ({
      en: ['STABLE', 'WARNING', 'CRITICAL'].map(k => window._tHpState(k, 'en')),
      ja: ['STABLE', 'WARNING', 'CRITICAL'].map(k => window._tHpState(k, 'ja')),
      unknown: window._tHpState('FOURTH_STATE', 'ja'),
      live: (document.getElementById('player-hp-state') || {}).textContent,
      key: (document.getElementById('player-hp-state') || {}).dataset?.stateKey,
    }));
    console.log(`\n── 2. HEALTH STATE ──\n  en ${JSON.stringify(st.en)}\n  ja ${JSON.stringify(st.ja)}`);
    console.log(`  live element: "${st.live}"  (stateKey="${st.key}")`);
    ck(st.en.join() === 'STABLE,WARNING,CRITICAL', 'EN unchanged');
    ck(st.ja.join() === '安定,警戒,危険', `ja is 安定/警戒/危険 (got ${st.ja.join()})`);
    ck(st.unknown === 'FOURTH_STATE', 'an UNKNOWN state passes through as its key, never blank — it is the WCAG 1.4.1 text alternative');

    // ── 3. the guidebook gold unit ───────────────────────────────────────────
    const gold = await pan.evaluate(async () => {
      const out = {};
      for (const lang of ['en', 'ja']) {
        window.currentLang = lang;
        try { window.applyLocale && window.applyLocale(lang); } catch (_) {}
        try { window.welcomeGuide && window.welcomeGuide.show(); } catch (_) {}
        await new Promise(r => setTimeout(r, 900));
        const u = document.querySelector('.wg-gold-unit');
        out[lang] = u ? u.textContent.trim() : '(not mounted)';
        try { window.welcomeGuide && window.welcomeGuide.hide(true); } catch (_) {}
        await new Promise(r => setTimeout(r, 400));
      }
      return out;
    });
    console.log(`\n── 3. GUIDEBOOK GOLD BAR ──\n  en="${gold.en}"  ja="${gold.ja}"`);
    ck(gold.en === 'GOLD', 'EN still reads GOLD');
    ck(gold.ja === '金', `ja reads 金 (got "${gold.ja}") — matches the sidepanel's 金 readout`);

    console.log('\npageerrors:', pageerrors.length, pageerrors);
    if (pageerrors.length) bad++;
    console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  } finally { await browser.close(); }
  process.exit(bad ? 1 : 0);
})();
