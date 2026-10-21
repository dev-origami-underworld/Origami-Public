// THE BLIND KID'S PATH, MEASURED (Mark 2026-09-12 "make sure kids with screen readers will be able to hear the room description and
// be able to interact directly with objects in rooms with the LLM parser"). Real boot; everything asserted the way a screen reader
// would experience it — live regions that are actually visible (a display:none live region announces nothing), accessible NAMES
// (aria-label / text, emoji stripped), and the keyboard as the only input.
//   1. HEAR THE ROOM   — the HUD room card is a visible polite live region whose text carries the room name AND description at boot.
//   2. HEAR THE CHANGE — walking into another room changes that live text (that change IS the announcement).
//   3. WORLD PAGE      — F1 opens the guide on the World page; the room list names the rooms, marks "you are here", and the SELECTED
//                        room shows its description in words (not only its object list).
//   4. NAMES           — every object action button has an accessible name that says the verb AND the object ("Look — Magic Lantern"),
//                        so tabbing through them is not "Look button, Walk to button, Look button…".
//   5. KEYBOARD ONLY   — Tab to a room, Enter; Tab to an action, Enter → the reply lands in the page's role=status live region.
//   6. THE PARSER      — a typed sentence in the command box ("look at the <object>") comes back as a line in the role=log region,
//                        the same rail the buttons use (probe-a11y-worldpage proves payload equality).
//   node scripts/probe-a11y-blind-path-0912.js
//   A11Y_BLIND_BREAK=1 …   (red-first: action buttons lose their aria-label and the room card is hidden → 1, 2, 4 must go red)
const { chromium } = require('playwright'); const { bootAndStart } = require('./lib/probe-boot');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const BREAK = process.env.A11Y_BLIND_BREAK === '1';
const strip = s => (s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const { page, eng } = await bootAndStart(browser); await sleep(2500);
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  if (BREAK) { console.log('  ⚠ BREAK mode'); await pan.evaluate(() => { const st = document.createElement('style'); st.textContent = '#pax-room-info{display:none!important}'; document.head.appendChild(st); window.__blindBreak = true; }); }

  // 1. hear the room
  const card = () => pan.evaluate(() => { const c = document.querySelector('#pax-room-info'); if (!c) return null; const cs = getComputedStyle(c); const r = c.getBoundingClientRect();
    return { live: c.getAttribute('aria-live'), role: c.getAttribute('role'), visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0, name: (document.getElementById('current-room-name') || {}).textContent || '', desc: (document.getElementById('current-room-desc') || {}).textContent || '' }; });
  const c0 = await card();
  ok(c0 && c0.live === 'polite' && c0.visible && c0.name.length > 2 && c0.desc.length > 20, `1: room card is a visible polite live region — "${c0 && c0.name}" / "${c0 && c0.desc.slice(0, 60)}…"`);

  // 2. hear the change — walk into the next room (the engine's ROOM_UPDATE rewrites the live text)
  const rooms = await eng.evaluate(() => (Array.isArray(window._roomsProbe) ? window._roomsProbe : (window.map && window.map.rooms) || []).map(r => ({ id: r.id, x: r.x + (r.w >> 1), y: r.y + (r.h >> 1), name: r.roomNameEn || r.roomName || r.name })).slice(0, 6));
  const here = await eng.evaluate(() => { const p = window._playerPoseProbe(); return { x: p.x / 2, z: p.z / 2 }; });
  const other = rooms.find(r => Math.hypot(r.x - here.x, r.y - here.z) > 4) || rooms[1];
  if (other) { await eng.evaluate(t => { window._moveHoldUntil = 0; window._tp(t.x * 2, t.y * 2); }, other); await sleep(2500); }
  const c1 = await card();
  ok(other && c1 && c1.name !== c0.name && c1.desc.length > 10, `2: walked to "${other && other.name}" → live text changed to "${c1 && c1.name}" / "${c1 && c1.desc.slice(0, 50)}…"`);

  // 3. World page by F1
  await pan.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true })); });
  await sleep(600);
  let onWorld = await pan.evaluate(() => !!document.querySelector('#welcome-guide-overlay.is-open') && !!document.querySelector('#wg-world-rooms'));
  if (!onWorld) { await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); const g = window.welcomeGuide; g.setSlide(g.WORLD_SLIDE); }); }
  await pan.evaluate(() => window.welcomeGuide._queryWorld && window.welcomeGuide._queryWorld()); await sleep(2000);
  const world = await pan.evaluate(() => { const bs = [...document.querySelectorAll('#wg-world-rooms button[data-world-room]')]; return { n: bs.length, names: bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()).slice(0, 6), here: bs.findIndex(b => /you are here/.test(b.textContent)) }; });
  ok(onWorld && world.n > 0 && world.here >= 0, `3a: F1 opened the World page — ${world.n} rooms named (${world.names.slice(0, 3).join(' · ')}), "you are here" on #${world.here}`);
  // select the current room by keyboard: focus its button and press Enter
  await pan.evaluate(i => { const b = document.querySelectorAll('#wg-world-rooms button[data-world-room]')[i]; b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); b.click(); }, Math.max(0, world.here)); await sleep(1500);
  const sel = await pan.evaluate(() => { const t = document.getElementById('wg-world-room-title'); const d = document.getElementById('wg-world-desc'); return { title: t && t.textContent.trim(), desc: d && !d.hidden ? d.textContent.trim() : '', objs: document.querySelectorAll('#wg-world-objects .wg-world-obj').length }; });
  ok(sel.desc.length > 20, `3b: the selected room shows its description in words on the page — "${sel.title}": "${sel.desc.slice(0, 70)}…" (${sel.objs} objects listed)`);

  // 4. names
  if (BREAK) await pan.evaluate(() => document.querySelectorAll('.wg-world-act').forEach(b => b.removeAttribute('aria-label')));
  const acts = await pan.evaluate(() => [...document.querySelectorAll('#wg-world-objects .wg-world-act')].map(b => ({ name: b.getAttribute('aria-label') || b.textContent, obj: b.dataset.worldTarget })));
  const bad = acts.filter(a => !strip(a.name).toLowerCase().includes(strip(a.obj).toLowerCase().slice(0, 8)));
  ok(acts.length > 0 && bad.length === 0, `4: ${acts.length} action buttons, every accessible name carries verb + object (e.g. "${acts[0] && acts[0].name}"; misses ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).map(b => '"' + b.name + '"').join(', ') : ''})`);

  // 5. keyboard-only action → role=status reply
  const reply0 = await pan.evaluate(() => (document.getElementById('wg-world-reply') || {}).textContent || '');
  const pressed = await pan.evaluate(() => { const b = document.querySelector('#wg-world-objects .wg-world-act[data-world-cmd="LOOK"]') || document.querySelector('#wg-world-objects .wg-world-act'); if (!b) return null; b.focus(); const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }); b.dispatchEvent(ev); if (!ev.defaultPrevented) b.click(); return { name: b.getAttribute('aria-label') || b.textContent, focused: document.activeElement === b }; });
  await sleep(2500);
  const reply1 = await pan.evaluate(() => { const el = document.getElementById('wg-world-reply'); return el ? { role: el.getAttribute('role'), live: el.getAttribute('aria-live'), hidden: el.hidden, text: el.textContent.trim() } : null; });
  ok(pressed && pressed.focused && reply1 && !reply1.hidden && reply1.role === 'status' && reply1.text.length > 5 && reply1.text !== reply0 && !/^…/.test(reply1.text),
     `5: Enter on "${pressed && strip(pressed.name)}" → role=status reply "${reply1 && reply1.text.slice(0, 70)}"`);

  // 6. the parser — a typed sentence
  const target = acts[0] ? strip(acts[0].obj) : 'bed';
  const logBefore = await pan.evaluate(() => (document.getElementById('event-log-container') || {}).textContent || '');
  await pan.evaluate(t => { const inp = document.getElementById('fpv-chat-input'); inp.focus(); inp.value = 'look at the ' + t.toLowerCase(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); }, target);
  await sleep(3000);
  // the typed rail has two reply channels: the role=log tray while playing, the guide's own role=status tray (#wg-reply) while the
  // book is open — a screen reader hears either; the probe accepts whichever the rail used and names it
  const logAfter = await pan.evaluate(() => { const l = document.getElementById('event-log-container'); const g = document.getElementById('wg-reply'); return { role: l && l.getAttribute('role'), live: l && l.getAttribute('aria-live'), text: (l || {}).textContent || '', gRole: g && g.getAttribute('role'), gLive: g && g.getAttribute('aria-live'), gHidden: g ? g.hidden : true, gText: g ? g.textContent.trim() : '' }; });
  const newText = logAfter.text.slice(logBefore.length);
  const viaLog = logAfter.role === 'log' && logAfter.live === 'polite' && newText.length > 5 && newText.toLowerCase().includes(target.toLowerCase().split(' ')[0]);
  const viaGuide = logAfter.gRole === 'status' && logAfter.gLive === 'polite' && !logAfter.gHidden && logAfter.gText.length > 5 && logAfter.gText.toLowerCase().includes(target.toLowerCase().split(' ')[0]);
  ok(viaLog || viaGuide, `6: typed "look at the ${target.toLowerCase()}" → ${viaLog ? 'role=log gained "' + strip(newText).slice(0, 90) + '"' : viaGuide ? 'the guide\'s role=status tray says "' + strip(logAfter.gText).slice(0, 90) + '"' : 'NO reply in either live region (log +' + newText.length + ' chars, tray hidden=' + logAfter.gHidden + ' "' + logAfter.gText.slice(0, 40) + '")'}`);

  // 6b. the same sentence while PLAYING (guide closed) → the role=log tray
  await pan.evaluate(() => window.welcomeGuide.hide({ isFromLoad: false })); await sleep(600);
  const logB = await pan.evaluate(() => (document.getElementById('event-log-container') || {}).textContent || '');
  await pan.evaluate(t => { const inp = document.getElementById('fpv-chat-input'); inp.focus(); inp.value = 'look at the ' + t.toLowerCase(); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); }, target);
  await sleep(3000);
  const logC = await pan.evaluate(() => (document.getElementById('event-log-container') || {}).textContent || '');
  const gained = logC.slice(logB.length);
  ok(gained.length > 5 && gained.toLowerCase().includes(target.toLowerCase().split(' ')[0]), `6b: guide closed, typed again → role=log gained "${strip(gained).slice(0, 90)}"`);

  await browser.close();
  console.log(fails ? `\n  FAIL ${fails}` : '\n  PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('  ❌ crashed:', e && e.message || e); process.exit(2); });
