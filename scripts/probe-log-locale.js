/**
 * probe-log-locale.js — does Oni-Baba's EVENT LOG text actually come out in Japanese?
 * (Mark 2026-07-28: "make sure now to have a plan to localize all onibaba event log text now" →
 *  "yes, not the engine, just the text displayed in the events")
 *
 * WHY A KEY-EXISTENCE CHECK IS NOT ENOUGH
 * --------------------------------------
 * The failure Mark actually saw is a line that is HALF translated: her speech shell
 * `oni.speech` renders as 🐉「…」 in Japanese while the sentence inside it stays English, because the
 * shell was keyed and the ONIBABA_LINES pool was not. scripts/probe-i18n-keys.js passes that with
 * flying colours — the key exists, it resolves, both languages have it. Only looking at the RENDERED
 * SENTENCE catches it.
 *
 * So this drives her real emit paths with the language set to Japanese, captures what she posts, and
 * fails on any line still carrying an English sentence. "English sentence" is deliberately defined as
 * THREE OR MORE consecutive Latin-script words: that ignores proper nouns, numerals, "HP", "+5" and
 * the emoji, while still catching "…fortune bows to you tonight."
 *
 * WHAT IT DELIBERATELY DOES NOT FAIL ON: her four diagnostic lines (the FPS sentinel, the FPS
 * protest, the clipboard confirmation and the HQ-recovery git instructions). Those are meant to be
 * read against the code in a COPY-ALL dump, and Mark scoped the engine's 119 `system` lines out of
 * this pass for the same reason. They are listed as SKIPPED so the exemption stays visible rather
 * than becoming an accidental hole.
 *
 * Usage: node scripts/probe-log-locale.js
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
  await sleep(7000);

  // Oni-Baba lives in the SHELL (OrigamiUnderworld.html loads OniBaba8.js), which is why her _t() works
  // at all while the engine iframe has no window.t(). Drive her there.
  const R = await page.evaluate(async () => {
    const out = { lines: [], notes: [] };
    const O = window.oniBaba8;
    if (!O) { out.notes.push('window.oniBaba8 missing'); return out; }
    if (typeof window.tLog !== 'function') { out.notes.push('window.tLog missing — i18n.js did not load in the shell'); return out; }

    const prevLang = window.currentLang;
    window.currentLang = 'ja';

    // Capture what she POSTS rather than scraping the DOM: the log panel lives in another iframe and
    // may throttle/collapse entries, which would make a missing line look like a passing one.
    const seen = [];
    const realPost = O._post.bind(O);
    O._post = (msg) => { try { if (msg && msg.type === 'LOG_EVENT') seen.push({ logType: msg.logType, text: String(msg.text || '') }); } catch (_) {} return realPost(msg); };

    const fire = async (label, fn) => {
      const before = seen.length;
      try { fn(); } catch (e) { out.notes.push(label + ' threw: ' + (e && e.message)); }
      await new Promise(r => setTimeout(r, 60));
      for (let i = before; i < seen.length; i++) out.lines.push({ label, ...seen[i] });
    };

    // Every mood pool, plus the wager pools and the one-off keyed lines.
    for (const k of ['neutral', 'enraged', 'benevolent', 'transcendent', 'transcendent_dark',
                     'enraged_cancel', 'benevolent_bless', 'dragon_chaos', 'naga_blessed', 'welcome_guide']) {
      // _speak throttles itself to one line per 4s — reset the clock so every pool gets a turn.
      O.lastSpoke = 0; O._lastLine = null;
      await fire('pool:' + k, () => O._speak(k));
    }
    for (const k of ['wager_open', 'wager_win', 'wager_lose']) {
      await fire('pool:' + k, () => O._post({ type: 'LOG_EVENT', logType: 'karma', text: O._t('oni.speech', { text: O._pick(k).shown }) }));
    }
    const ones = [
      ['oni.marked', { name: 'ヤクザゴブリン' }], ['oni.autoaim-on', null], ['oni.autoaim-off', null],
      ['oni.selfdefense', null], ['oni.kill-witness', null], ['oni.purse-bloodless', null],
      ['oni.goblin-kneels', { name: 'ヤクザゴブリン' }], ['oni.moon-frenzy', { name: 'ヤクザ小鬼', d: 1 }],
      ['oni.dark-path', { text: 'スターレットを殴った。', d: -2 }],
    ];
    for (const [k, p] of ones) await fire('key:' + k, () => O._post({ type: 'LOG_EVENT', logType: 'karma', text: O._t(k, p || undefined) }));

    O._post = realPost;
    window.currentLang = prevLang;
    return out;
  });

  const P = s => console.log(s);
  P('\n-- ONI-BABA EVENT-LOG LOCALIZATION (currentLang = ja) --\n');
  (R.notes || []).forEach(n => P('  ! ' + n));

  // Three or more consecutive Latin words = an English sentence. Tolerates proper nouns, HP, +5, emoji.
  const ENGLISH = /[A-Za-z]{2,}(?:['’]?[A-Za-z]+)*(?:\s+[A-Za-z]{2,}(?:['’]?[A-Za-z]+)*){2,}/;
  const strip = t => String(t).replace(/<[^>]*>/g, '');
  let bad = 0, ok = 0;
  for (const l of (R.lines || [])) {
    const txt = strip(l.text);
    const hit = ENGLISH.exec(txt);
    if (hit) { bad++; P('  FAIL ' + l.label.padEnd(26) + ' "' + txt.slice(0, 88) + '"'); P('        english fragment: "' + hit[0].slice(0, 60) + '"'); }
    else { ok++; P('  ok   ' + l.label.padEnd(26) + ' ' + txt.slice(0, 76)); }
  }

  P('\n  SKIPPED BY DESIGN (diagnostics, read against the code in COPY-ALL dumps):');
  P('     OniBaba8.js ~340 FPS sentinel · ~1194 FPS protest · ~1430 clipboard · ~1446 HQ recovery');
  P('     ...and all 251 engine LOG_EVENT emits — Mark: "not the engine, just the text displayed in the events".');

  P('\n  ' + (bad ? 'FAILED: ' + bad + ' of ' + (ok + bad) + ' lines still contain an English sentence'
                  : 'PASS: all ' + ok + ' of her event-log lines are Japanese'));
  P('\npageerrors: ' + (errs.length ? 'FAIL ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 3).join('\n  ') : 'ok 0'));
  await b.close();
  process.exit(bad ? 1 : 0);
})();
