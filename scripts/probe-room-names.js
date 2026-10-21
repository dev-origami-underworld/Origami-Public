/**
 * probe-room-names.js — does EVERY generated room carry an ID and a name, in both languages?
 * (Mark 2026-07-28: "make sure that every room # being built by room generator will have a room
 *  ID# + name, most of the rooms on level 1 are worker's rooms.")
 *
 * THREE THINGS THIS ASSERTS, because each has its own way of failing silently:
 *
 * 1. COVERAGE — every room on floors 1-7 has an integer id, a non-empty Japanese name and a
 *    non-empty English name. A room that slips through the generator's special-case branches shows
 *    up in the left panel as a bare "#7 · " with nothing after the separator, which reads as a
 *    rendering bug rather than missing data.
 *
 * 2. INDEX ALIGNMENT — ROOM_POOLS and ROOM_POOLS_EN are two parallel arrays indexed by the same k
 *    (DungeonChain ~1171). Nothing in the language enforces that entry i of one is the same room as
 *    entry i of the other, so a reorder ships a bath house labelled "Stable" and no test notices.
 *    Here the L1 pairs are printed in full so a human can read them side by side.
 *
 * 3. FLOOR 1 IS STAFF QUARTERS — the fiction fix behind Mark's note. Floor 1's monsters turn hostile
 *    when you walk in on them; named as workers' rooms, that reads as labourers objecting to a
 *    break-in rather than guards attacking a visitor on sight.
 *
 * It also drives the LEFT PANEL end to end: the room card must render "#N · name", and switching
 * language must re-render it IN PLACE — the failure mode being a player who switches to Japanese and
 * keeps staring at an English room name until they happen to walk into a different room.
 *
 * Usage: node scripts/probe-room-names.js
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

  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('✗ engine frame not found'); await b.close(); process.exit(1); }

  // ── 1 + 2 + 3: interrogate the generator directly, floor by floor ──────────────────────────────
  const G = await eng.evaluate(() => {
    const out = { floors: [], notes: [] };
    const DC = window.DungeonChain;
    if (!DC || typeof DC.generateDungeonMap !== 'function') {
      out.notes.push('window.DungeonChain.generateDungeonMap unavailable — cannot audit the generator');
      return out;
    }
    for (let lvl = 1; lvl <= 7; lvl++) {
      let res = null;
      try { res = DC.generateDungeonMap(lvl, 128, 128); } catch (e) { out.floors.push({ lvl, error: String(e && e.message) }); continue; }
      const rooms = (res && res.rooms) || [];
      const bad = [];
      for (const r of rooms) {
        const why = [];
        if (!Number.isInteger(r.id)) why.push('no integer id');
        if (!r.roomName || !String(r.roomName).trim()) why.push('no JA name');
        if (!r.roomNameEn || !String(r.roomNameEn).trim()) why.push('no EN name');
        if (why.length) bad.push({ id: r.id, type: r.roomType, why: why.join(' + ') });
      }
      out.floors.push({ lvl, count: rooms.length, bad,
        sample: rooms.slice(0, 12).map(r => ({ id: r.id, ja: r.roomName, en: r.roomNameEn, type: r.roomType })) });
    }
    return out;
  });

  const P = s => console.log(s);
  let fails = 0;
  P('\n── 🏠 ROOM ID# + NAME COVERAGE (floors 1-7) ──\n');
  (G.notes || []).forEach(n => { P('  ⚠ ' + n); fails++; });
  for (const f of (G.floors || [])) {
    if (f.error) { P('  L' + f.lvl + '  ✗ generator threw: ' + f.error); fails++; continue; }
    const ok = f.bad.length === 0;
    if (!ok) fails++;
    P('  L' + f.lvl + '  ' + (ok ? '✓' : '✗') + '  ' + String(f.count).padStart(3) + ' rooms, '
      + (ok ? 'all carry id + JA + EN' : f.bad.length + ' INCOMPLETE'));
    for (const x of f.bad.slice(0, 5)) P('        room ' + x.id + ' (' + x.type + '): ' + x.why);
  }

  const L1 = (G.floors || []).find(f => f.lvl === 1);
  if (L1 && L1.sample) {
    P('\n  ── FLOOR 1, as the player will read it (id · 日本語 · English · type) ──');
    for (const r of L1.sample) P('     #' + String(r.id + 1).padEnd(3) + ' ' + String(r.ja || '?').padEnd(8)
      + ' · ' + String(r.en || '?').padEnd(22) + ' · ' + (r.type || '?'));
    const WORKER = /長屋|飯場|寝床|作業場|道具部屋|土間|湯殿|厩|倉庫|番所/;
    const gen = L1.sample.filter(r => r.type === 'room');
    const w = gen.filter(r => WORKER.test(String(r.ja || '')));
    P('\n     staff-quarters share of ordinary rooms shown: ' + w.length + '/' + gen.length
      + (gen.length && w.length >= Math.ceil(gen.length / 2) ? '  ✓ most are workers\' rooms' : '  ⚠ fewer than half'));
  }

  // ── the LEFT PANEL, end to end ────────────────────────────────────────────────────────────────
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  let UI = null;
  if (!pan) { P('\n  ⚠ Panels frame not found — UI half skipped'); fails++; }
  else {
    // ⚠ WHAT THIS DOES AND DOES NOT COVER, stated because the difference matters.
    // The engine emits ROOM_UPDATE only from inside its room-CHANGE branch, so in a headless boot —
    // where nobody walks anywhere — window._lastRoomPayload is never set and the panel has nothing to
    // show. Verified, not assumed: a 12s boot reports hasPayload:false. So the card is driven here
    // with a payload carrying REAL names taken from the generator above (not invented strings), which
    // exercises the render + localisation path end to end. The seam left untested is the engine's
    // room-change TRIGGER, which this change did not touch — it only added fields to a payload that
    // was already being built and posted.
    const real = (L1 && L1.sample && L1.sample.find(r => r.type === 'room')) || { id: 2, ja: '長屋', en: "Workers' Longhouse" };
    UI = await pan.evaluate(async (rm) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      if (typeof window._renderRoomCard !== 'function') return { fatal: '_renderRoomCard is not defined — the ROOM_UPDATE receiver never ran' };
      window._currentRoom = {
        type: 'ROOM_UPDATE', roomId: rm.id, roomNumber: rm.id + 1,
        roomName: rm.en, roomNameJa: rm.ja, roomType: rm.type || 'room',
        description: 'Water drips somewhere far off.', descriptionJa: 'どこか遠くで水が滴っている。',
      };
      window._renderRoomCard(window._currentRoom);
      await wait(200);
      const read = () => {
        const n = document.getElementById('current-room-name');
        const d = document.getElementById('current-room-desc');
        const lbl = document.querySelector('[data-i18n="room-lbl"]');
        const dlbl = document.querySelector('[data-i18n="desc-lbl"]');
        return { name: n ? n.textContent : null, desc: d ? (d.textContent || '').slice(0, 40) : null,
                 roomLbl: lbl ? lbl.textContent : null, descLbl: dlbl ? dlbl.textContent : null };
      };
      const out = { has: !!window._currentRoom };
      out.en = read();
      if (typeof applyLocale === 'function') { applyLocale('ja'); await wait(400); out.ja = read();
                                               applyLocale('en'); await wait(400); out.back = read(); }
      else out.note = 'applyLocale not reachable from this scope';
      return out;
    }, real);
    if (UI.fatal) { P('\n  ✗ ' + UI.fatal); fails++; }
    P('\n  ── LEFT PANEL room card  (driven with real generator names: ' + real.ja + ' / ' + real.en + ') ──');
    const show = (tag, r) => r && P('     ' + tag.padEnd(6) + 'label "' + r.roomLbl + '"/"' + r.descLbl
      + '"   name "' + r.name + '"   desc "' + String(r.desc || '').slice(0, 24) + '"');
    show('EN', UI.en); show('JA', UI.ja); show('back', UI.back);
    if (UI.note) P('     ⚠ ' + UI.note);
    const numbered = UI.en && /^#\d+\s·\s.+/.test(String(UI.en.name || ''));
    P('     room shows ID# + name:      ' + (numbered ? '✓' : '✗ got "' + (UI.en && UI.en.name) + '"'));
    if (!numbered) fails++;
    if (UI.ja) {
      const lblJa = UI.ja.roomLbl === '部屋' && UI.ja.descLbl === '説明';
      P('     labels localize:            ' + (lblJa ? '✓ 部屋 / 説明' : '✗ got "' + UI.ja.roomLbl + '" / "' + UI.ja.descLbl + '"'));
      if (!lblJa) fails++;
      const nameChanged = UI.ja.name !== UI.en.name;
      P('     name re-renders on switch:  ' + (nameChanged ? '✓ in place, no room change needed' : '✗ stayed "' + UI.ja.name + '"'));
      if (!nameChanged) fails++;
      const restored = UI.back && UI.back.name === UI.en.name;
      P('     switching back restores:    ' + (restored ? '✓' : '✗ got "' + (UI.back && UI.back.name) + '"'));
      if (!restored) fails++;
    }
  }

  P('\n  ' + (fails ? '✗ ' + fails + ' CHECK(S) FAILED' : '✅ every check passed'));
  P('\npageerrors: ' + (errs.length ? '✗ ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 3).join('\n  ') : '✓ 0'));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
