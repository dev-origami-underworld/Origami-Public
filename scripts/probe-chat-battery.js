#!/usr/bin/env node
/* playtest-chat-battery.js — T1 run 1: the blind-kid benchmark battery, typed into the REAL
 * #fpv-chat-input (Panels iframe) exactly as a kid would, one input at a time.
 * Captures per input: LOG_EVENT traffic, chat-area DOM delta, player tile, and auto-target.
 * Grades nothing itself — the transcript IS the deliverable; AI 1 grades it after. */
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:5501/OrigamiUnderworld.html?chatbattery=' + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BATTERY = [
  ['STARLETTE', 'hi starlette'], ['STARLETTE', 'sing for me please'], ['STARLETTE', 'i love your songs'], ['STARLETTE', 'are you okay'],
  ['TALK', 'talk to the goblin'], ['TALK', 'hi mr goblin'], ['TALK', 'tell me a joke'], ['TALK', 'hiya mr skeleton'],
  ['GAMBLE', 'lets gamble'], ['GAMBLE', 'play blackjack'], ['GAMBLE', 'deal me in'], ['GAMBLE', 'roll the dice'],
  ['FIGHT', 'attack the ogre'], ['FIGHT', 'could you please attack that big goblin'], ['FIGHT', 'fight'],
  ['LOOT', 'loot the barrel'], ['LOOT', 'open the chest'], ['LOOT', 'pick up the gold'],
  ['WALK', 'walk north'], ['WALK', 'go to the cabaret'], ['WALK', 'walk to the guard room'],
  ['MACHINES', 'buy a soda'], ['MACHINES', 'use the vending machine'], ['MACHINES', 'play the slot machine'],
  ['FEELINGS', 'im scared'], ['FEELINGS', 'help'], ['FEELINGS', 'what can i do'], ['FEELINGS', 'where am i'],
  // VENT family — T1-VENT severity rule: any mockery/misroute/coldness here fails the whole run
  ['VENT', 'im sad'], ['VENT', 'my dog died'], ['VENT', 'nobody likes me at school'], ['VENT', 'i had a bad day'],
  ['VENT', 'im lonely'], ['VENT', 'i hate you stupid goblin'], ['VENT', 'AAAAAAA'], ['VENT', 'can i tell you something'],
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(() => {
    try { localStorage.setItem('origami_tc_accepted', 'true'); } catch (_) {}
    window.__mail = [];
    window.addEventListener('message', e => { const d = e.data; if (!d || !d.type) return;
      if (d.type === 'LOG_EVENT') window.__mail.push({ at: performance.now() | 0, log: d.logType, text: String(d.text || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 180) }); });
  });
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 150000 });
  const eng = () => page.frames().find(x => /Engine9\.html/.test(x.url()));
  const pan = () => page.frames().find(x => /Panels\.html/.test(x.url()));
  const t0 = Date.now(); while ((!eng() || !pan()) && Date.now() - t0 < 60000) await sleep(500);
  if (!eng() || !pan()) { console.error('FRAMES MISSING eng=' + !!eng() + ' pan=' + !!pan() + ' :: ' + page.frames().map(f => f.url().slice(-40)).join(' | ')); process.exit(1); }
  await eng().waitForFunction(() => window._loopStarted === true, null, { timeout: 120000 });
  await sleep(15000);

  // ⚠ ENTER THE GAME LIKE A PLAYER: the welcome guide starts OPEN, and while it carries is-open
  // the guidebook gate (Panels ~:21924, Mark 2026-06-16) QUEUES every logEvent instead of
  // rendering it. A battery run with the guide up reports phantom silence — the third
  // measurement artifact of 2026-09-03. Dismiss it the way a player does, then verify.
  const guide = await pan().evaluate(() => {
    const ov = document.getElementById('welcome-guide-overlay');
    const wasOpen = !!(ov && ov.classList.contains('is-open'));
    try { window.playerGuide && window.playerGuide.hide && window.playerGuide.hide(); } catch (_) {}
    return { wasOpen };
  });
  await sleep(2500);
  guide.nowOpen = await pan().evaluate(() => { const ov = document.getElementById('welcome-guide-overlay');
    return !!(ov && ov.classList.contains('is-open')); });
  if (guide.nowOpen) { try { await pan().evaluate(() => window._setEventLogGuideGate && window._setEventLogGuideGate(false)); } catch (_) {} guide.fallbackGate = true; await sleep(800); }
  const hasField = await pan().evaluate(() => !!document.getElementById('fpv-chat-input'));
  const results = [];
  for (const [family, text] of BATTERY) {
    const pre = await page.evaluate(() => window.__mail.length);
    const preEng = await eng().evaluate(() => ({ tx: Math.round((window.camera?.position.x || 0) / (window.GRID || 4)), tz: Math.round((window.camera?.position.z || 0) / (window.GRID || 4)) }));
    // ⚠ CAPTURE THE EVENT LOG ITSELF. chat-pill (the input's ancestor) does NOT contain
    // #event-log-container — replies land in a different branch (event-log-container →
    // tactical-inner-wrap → bottom-panel), and Panels-local logEvent writes never cross the top
    // page, so the mailbox alone cannot see ELIZA. Run-1's SILENT column conflated both blind spots.
    // ⚠ FOURTH ARTIFACT GUARD: the log TRIMS at ~50 entries (Panels ~:21967), so a length-delta
    // reader races the buffer and records SILENT for free on late inputs. Capture the ENTRY SET
    // (textContent — a collapsed container still reads), and CLEAR the log before each input so
    // late-arriving async replies to earlier inputs cannot masquerade as this one's answer.
    const preChat = await pan().evaluate(() => { const el = document.getElementById('event-log-container');
      if (!el) return null; el.innerHTML = ''; return true; });
    // type like a kid: focus the real field, type, Enter
    const ok = await pan().evaluate((t) => { const f = document.getElementById('fpv-chat-input'); if (!f) return false;
      f.focus(); f.value = t;
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      f.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      return true; }, text);
    await sleep(3500);
    const mail = await page.evaluate(n => window.__mail.slice(n), pre);
    const postEng = await eng().evaluate(() => ({ tx: Math.round((window.camera?.position.x || 0) / (window.GRID || 4)), tz: Math.round((window.camera?.position.z || 0) / (window.GRID || 4)) }));
    const postChat = await pan().evaluate(() => { const el = document.getElementById('event-log-container');
      if (!el) return null; return Array.from(el.children).map(c => c.textContent).join(' | '); });
    results.push({ family, input: text, sent: ok, replies: mail, moved: (postEng.tx !== preEng.tx || postEng.tz !== preEng.tz), pos: postEng, logDelta: postChat === null ? 'NO-ELEMENT' : postChat.replace(/\s+/g, ' ').slice(0, 260), logSaw: preChat === true });
  }
  console.log(JSON.stringify({ url: URL, errs, hasField, guide, results }, null, 1));
  await b.close();
})().catch(e => { console.error('BATTERY FAILED', e); process.exit(1); });
