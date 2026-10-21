// WCAG 1.4.2 AUDIO CONTROL, MEASURED (Mark 2026-09-13 "can u falsify the game is wcag 2.2/aaa"). The register row (08-15)
// says the always-visible music pill opens the Winamp window instead of muting. The SC passes if EITHER a pause/stop
// OR an independent volume control covers every audio that starts by itself for > 3 s. The cabaret starts Starlette's
// song by itself, so the question is: does the pill's slider / toggle reach HER element, not just _bgMusicEl?
//   node scripts/probe-a11y-audio-control-0913.js        A11Y_AUDIO_BREAK=1 … (the slider is unhooked from her element → red)
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const BREAK = process.env.A11Y_AUDIO_BREAK === '1';
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(3500);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  await pan.evaluate(() => { try { window.welcomeGuide.hide({ isFromLoad: false }); } catch (_) {} });
  // 0. nothing plays by itself at boot
  const boot = await eng.evaluate(() => Array.from(document.querySelectorAll('audio')).concat([window._bgMusicEl, window._succubusSong].filter(Boolean)).filter(a => a && !a.paused && !a.muted && a.volume > 0).length);
  ok(boot === 0, `0: at boot, ${boot} audio element(s) playing on their own (must be 0 — music is opt-in / earned)`);
  // 1. the cabaret starts her song by itself — the sad-lighting probe's recipe
  await eng.evaluate(() => { try { window._grantPermit && window._grantPermit('SINGING'); } catch (_) {} try { window._hasPermit = () => true; } catch (_) {} try { window._activateCabaret('probe'); } catch (_) {}
    window._cabGuideAck = true; window._cabDoorsOpen = true; window._sucEnteredCab = true; window._songStartGate = false; window._sucGuideOpen = false; window._songPausedByGate = false;
    const cabId = (typeof window._cabaretRoomId === 'number') ? window._cabaretRoomId : 1; const map = window.map; const hits = [];
    for (let x = 0; x < map.length; x++) { const col = map[x]; if (!col) continue; for (let z = 0; z < col.length; z++) { const t = col[z]; if (t && t.type === 'floor' && t.hall !== true && t.roomId === cabId) hits.push([x, z]); } }
    if (hits.length) { const c = hits[hits.length >> 1]; window._moveHoldUntil = 0; window._tp(c[0] * 2, c[1] * 2); } });
  await sleep(2500);
  const started = await eng.evaluate(async () => { const s = window._succubusSong, list = (window._cabSetDefault && window._cabSetDefault.length) ? window._cabSetDefault : (window._songCatalog || []).map(c => c.file); if (!s || !list.length) return null; window._cabSetExhausted = false; window._songRestUntil = 0; window._cabaretAudioPriming = false; s.src = list[0]; s.load(); try { await s.play(); } catch (e) { return null; } return true; });
  await sleep(4000);
  const before = await eng.evaluate(() => { const s = window._succubusSong; return { playing: !!(s && !s.paused), vol: s ? +s.volume.toFixed(3) : null, muted: !!(s && s.muted) }; });
  ok(started && before.playing && before.vol > 0 && !before.muted, `1: her song plays by itself in the cabaret for > 3 s (playing ${before.playing}, volume ${before.vol})`);
  if (BREAK) { console.log('  ⚠ BREAK: the pill slider/toggle are unhooked from her element'); await eng.evaluate(() => { const s = window._succubusSong; const v = s.volume; Object.defineProperty(s, 'volume', { get: () => v, set: () => {} }); Object.defineProperty(s, 'muted', { get: () => false, set: () => {} }); s.pause = () => {}; }); }
  // 2. the ALWAYS-VISIBLE pill slider at 0 → her element must fall silent too (independent volume control, second clause)
  await pan.evaluate(() => { const sl = document.getElementById('bg-music-vol-slider'); sl.value = 0; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(1500);
  const afterVol = await eng.evaluate(() => { const s = window._succubusSong; return { vol: s ? +s.volume.toFixed(3) : null, muted: !!(s && s.muted), bg: window._bgMusicVol }; });
  ok(afterVol.bg === 0 && (afterVol.vol === 0 || afterVol.muted), `2: pill slider → 0: engine _bgMusicVol ${afterVol.bg}; HER element volume ${afterVol.vol} muted ${afterVol.muted} (must be silent)`);
  // 3. KEYBOARD ONLY: focus the pill (its focus opens the popup — a11y-R2), Tab into the slider, Home → 0. The pill's click
  //    opens the music player by a later order, so the SC is met by the second clause (independent volume control); what must
  //    hold is that a keyboard user reaches that control from the always-visible pill and silences her with keys alone.
  await pan.evaluate(() => { const sl = document.getElementById('bg-music-vol-slider'); sl.value = 40; sl.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(800);
  const restored = await eng.evaluate(() => { const s = window._succubusSong; return { playing: !!(s && !s.paused), vol: +s.volume.toFixed(3) }; });
  console.log(`  (slider back to 40 → her volume ${restored.vol}, playing ${restored.playing})`);
  await pan.evaluate(() => { document.getElementById('bg-music-toggle').focus(); });
  await sleep(300);
  await page.keyboard.press('Tab'); await sleep(200);
  const focused = await pan.evaluate(() => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Home'); await sleep(1200);
  const afterKey = await eng.evaluate(() => { const s = window._succubusSong; return { playing: !!(s && !s.paused), vol: +s.volume.toFixed(3), bg: window._bgMusicVol }; });
  const pillInfo = await pan.evaluate(() => { const t = document.getElementById('bg-music-toggle'); const r = t.getBoundingClientRect(); return { visible: r.width > 0 && getComputedStyle(t).visibility !== 'hidden', label: t.getAttribute('aria-label') }; });
  ok(pillInfo.visible && focused === 'bg-music-vol-slider' && afterKey.bg === 0 && afterKey.vol === 0,
     `3: keyboard only — pill visible (${pillInfo.visible}), Tab from it lands on #${focused}, Home → _bgMusicVol ${afterKey.bg}, her element ${afterKey.vol} (silent while still ${afterKey.playing ? 'playing' : 'paused'}); pill label "${pillInfo.label}"`);
  await b.close();
  console.log(fails ? `\n  FAIL ${fails}` : '\n  PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('  ❌ crashed:', e && e.message || e); process.exit(2); });
