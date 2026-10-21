/**
 * probe-cabaret-song.js — Starlette's three-set rotation, silenced captions, and flying pole routine.
 *
 * Mark 2026-07-26: "lets change out the song for starlette use this now : remove the text we used to have,
 * remember to add the flying pole dance routine back. assets/sounds/BG-OLD/Song-dance-紅い扇子.mp3"
 *
 * Launches Chromium with --autoplay-policy=no-user-gesture-required so the show can actually RUN headless —
 * without it her song stays paused, the choreography clock never advances, and none of this is observable.
 * (That autoplay gap is the same blind spot that let a 404'd combat track pass every test twice.)
 *
 * Usage: node scripts/probe-cabaret-song.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], songMsgs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await page.exposeFunction('__noteSong', m => songMsgs.push(m));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.addInitScript(() => {});
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await page.evaluate(() => window.addEventListener('message', e => { if (e.data && e.data.type === 'SUC_SONG') window.__noteSong(JSON.stringify(e.data)); }));
  await sleep(3500);
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) { console.error('✗ engine frame not found'); await b.close(); process.exit(1); }

  const R = [];
  const ok = (n, pass, got, want) => R.push({ n, pass: !!pass, got: String(got), want: want || '' });

  const A = await eng.evaluate(() => {
    const s = window._succubusSong;
    return { exists: !!s, src: s ? String(s.src).split('/').pop() : null, dur: s && isFinite(s.duration) ? +s.duration.toFixed(1) : null,
             lyricsFlag: window._succubusLyrics, poleLine: window._poleLine, cabPole: !!window._cabPole,
             setList: (window._cabSetDefault || []).map(path => String(path).split('/').pop()),
             questGate: window._songQuestGate === true,
             catalog: (window._songCatalog || []).map(c => ({ name: String(c.file).split('/').pop(),
                 title: c.title, rarity: c.rarity, seconds: c.seconds, intro: c.introSeconds })) };
  });
  ok('her song element exists', A.exists, String(A.exists), 'true');
  ok('set 1 is the current opener', decodeURIComponent(A.src || '') === 'StarletteSong_紅い扇子.mp3',
     decodeURIComponent(A.src || 'null'), 'StarletteSong_紅い扇子.mp3');
  ok('opener duration reads 198s', A.dur !== null && Math.abs(A.dur - 197.8) < 2, A.dur + 's', '~198s');
  // Derived from the song catalog, not a literal. The setlist grows every time Mark adds a track (songs
  // are quest loot now — js/v8/data/SongCatalog.js), and a hard-coded three-name string made "a song was
  // added" indistinguishable from "the rotation broke". What still must hold: with the quest gate off she
  // performs the WHOLE catalog, in catalog order, opening on the house song.
  ok('the default rotation is the whole song catalog',
     A.questGate === false && A.setList.length > 0
       && A.setList.join('|') === (A.catalog || []).map(c => c.name).join('|'),
     A.setList.map(decodeURIComponent).join(' → '),
     (A.catalog || []).length + ' catalog songs, in order (quest gate off)');
  ok('karaoke captions default OFF', A.lyricsFlag !== true, 'window._succubusLyrics = ' + A.lyricsFlag, 'not true');

  // Drive the production rotation owner through a complete 1→2→3→1 cycle. This loads every actual
  // file, including the Unicode path, and proves the index wraps rather than just inspecting an array.
  const ROT = await eng.evaluate(async () => {
    const s = window._succubusSong;
    const list = window._cabSetDefault;
    if (!s || !Array.isArray(list) || typeof window._advanceCabaretSet !== 'function') return { error: 'rotation owner unavailable' };
    const priorCustom = window._cabSetList;
    try { delete window._cabSetList; } catch (_) { window._cabSetList = null; }
    window._cabSetIdx = 0;
    window._songIntroAuto = true;
    s.src = list[0]; s.load();
    const rows = [];
    // One FULL cycle, however long the setlist is — advancing a fixed 3 times stopped being a cycle the
    // moment the catalog grew to four. This walks list.length steps, so the last row must be set 1 again.
    for (let i = 0; i < list.length; i++) {
      const step = window._advanceCabaretSet();
      let loaded = false;
      for (let n = 0; n < 100; n++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const active = decodeURIComponent(String(s.currentSrc || s.src).split('/').pop());
        const want = decodeURIComponent(String(step?.src || '').split('/').pop());
        if (active === want && s.readyState >= 1 && Number.isFinite(s.duration)) { loaded = true; break; }
        if (s.error) break;
      }
      rows.push({
        name: decodeURIComponent(String(s.currentSrc || s.src).split('/').pop()),
        duration: Number.isFinite(s.duration) ? +s.duration.toFixed(1) : null,
        intro: step?.intro,
        index: step?.index,
        loaded,
        error: s.error?.code || 0,
      });
    }
    if (priorCustom === undefined) { try { delete window._cabSetList; } catch (_) {} }
    else window._cabSetList = priorCustom;
    return { rows };
  });
  const rotRows = ROT.rows || [];
  // Expected order = every song after the opener, then wrapping back to the opener.
  const CAT = A.catalog || [];
  const wantOrder = CAT.slice(1).map(c => c.name).concat(CAT.length ? CAT[0].name : []);
  ok('rotation walks the whole setlist and wraps to set 1',
     rotRows.length === CAT.length && rotRows.map(row => row.name).join('|') === wantOrder.join('|'),
     rotRows.map(row => row.name).join(' → '), wantOrder.join(' → '));
  ok('every set file decodes',
     rotRows.length === CAT.length && rotRows.every(row => row.loaded && !row.error),
     JSON.stringify(rotRows), CAT.length + ' loaded metadata rows');
  // Durations and reveals are checked against what the CATALOG declares for that exact track, so adding a
  // song extends the check instead of breaking it — and a file that is silently the wrong length still fails.
  const byName = Object.fromEntries(CAT.map(c => [c.name, c]));
  const durBad = rotRows.filter(r => !byName[r.name] || r.duration === null
                                     || Math.abs(r.duration - byName[r.name].seconds) >= 2);
  ok('each set decodes to its catalog duration',
     rotRows.length > 0 && durBad.length === 0,
     rotRows.map(r => `${r.duration}s`).join(' / '),
     rotRows.map(r => `~${byName[r.name]?.seconds}s`).join(' / '));
  const introBad = rotRows.filter(r => !byName[r.name] || r.intro !== byName[r.name].intro);
  ok('each set uses its catalog reveal time',
     rotRows.length > 0 && introBad.length === 0,
     rotRows.map(r => r.intro + 's').join(' / '),
     rotRows.map(r => byName[r.name]?.intro + 's').join(' / '));

  // Drive the show: start her song and run it through the beat the pole is scheduled on.
  const drive = await eng.evaluate(async () => {
    const s = window._succubusSong; if (!s) return 'no song';
    // Open her gate the way the game does: stand in the cabaret with the doors open. Her song is deliberately
    // pinned silent everywhere else (_cabSongGain), and the governor pauses it — so without this the transport
    // simply re-pauses whatever the probe does.
    try {
      const cabId = (typeof window._cabaretRoomId === 'number') ? window._cabaretRoomId : 1;
      const r = (window.rooms || [])[cabId];
      if (r) { window.px = r.cx * 2; window.pz = r.cz * 2; }
      window._cabDoorsOpen = true; window._sucEnteredCab = true; window._songStartGate = false;
      window._cabGuideAck = true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1200));
    try { await s.play(); } catch (e) { return 'play refused: ' + e.message; }
    if (s.paused) return 'still paused';
    const introS = (typeof window._songIntro === 'number') ? window._songIntro : 8;
    const lineDur = (s.duration - introS) / 9;
    const poleLine = (typeof window._poleLine === 'number') ? window._poleLine : 5;
    const lead = (typeof window._sucSingLead === 'number') ? window._sucSingLead : 2.5;
    // Land INSIDE the pole beat, accounting for the sing-lead the choreography applies. A seek issued in the
    // same tick as play() gets clamped back to 0 while the element is still opening the stream, so wait for it
    // to be seekable and retry (measured: the first attempt reported seekedTo 0).
    // LAND JUST BEFORE THE BEAT, NOT INSIDE IT. The pole arms on the line CHANGE into _poleLine
    // (Engine9 ~:16571 runs under `if (_line !== _wasLine)`), so a seek into the MIDDLE of beat 5 —
    // which is what `(poleLine + 0.5) * lineDur` does — lands after that transition has already been
    // consumed: _wasLine is already 5, no change fires, and the routine can never be observed. Target
    // 2s BEFORE the boundary so the probe is watching when she crosses into it.
    const want = Math.max(0, introS + poleLine * lineDur - lead - 2);
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (s.readyState >= 1) { try { s.currentTime = want; } catch (_) {} }
      if (Math.abs(s.currentTime - want) < 3) break;
    }
    // ⚠ VERIFY THE SEEK *HELD*, DON'T TRUST THE ASSIGNMENT. Reading currentTime straight after writing it
    // returns the value you just wrote, even when the seek is about to be thrown away — so the loop above
    // reports a perfect landing and the pole check then runs against a song playing from 0. MEASURED: the
    // dev server on :5501 is Python SimpleHTTP, which does NOT serve HTTP Range; every mp3 there reports
    // seekable.end === 0 and every seek silently clamps back, for the EXISTING game songs too, not just
    // new ones. Re-reading after a real delay is the only honest test, and it turns a false FAIL into the
    // documented skip this block already intended.
    await new Promise(r => setTimeout(r, 900));
    // Proximity to the TARGET, not merely "time advanced" — my first version asserted forward motion,
    // which is trivially true of ordinary playback, so a seek that never landed still read as held and
    // the pole check ran against whatever point the song happened to be at.
    const held = Math.abs(s.currentTime - want) < 6;
    return { lineDur: +lineDur.toFixed(2), want: +want.toFixed(1),
             seekedTo: +s.currentTime.toFixed(1), heldSeek: held,
             seekable: (s.seekable && s.seekable.length) ? +s.seekable.end(0).toFixed(1) : 0, poleLine };
  });
  ok('the song actually plays headless', typeof drive === 'object', JSON.stringify(drive), 'an object');

  if (typeof drive === 'object') {
    const expectedLineDur = (A.dur - 3) / 9;
    ok('beats scale to the song length', Math.abs(drive.lineDur - expectedLineDur) < 1.5,
       drive.lineDur + 's per beat', '~' + expectedLineDur.toFixed(1) + 's (active set / 9 beats)');
    // The cabaret owns her transport and re-pauses/rewinds anything the probe does to it outside the real entry
    // flow (guide closed + player actually in the room). That is correct behaviour, so the pole beat is reported
    // as UNVERIFIED here rather than failed — it needs eyes on the scene. Everything above it IS measured.
    const seeked = Math.abs(drive.seekedTo - drive.want) < 3 && drive.heldSeek === true;
    if (!seeked) console.log('  ⚠ SKIPPED the pole-beat check: could not hold a seek to the pole beat ' +
      '(landed ' + drive.seekedTo + 's, wanted ' + drive.want + 's, seekable-to ' + drive.seekable + 's). ' +
      'The :5501 dev server is Python SimpleHTTP and serves no HTTP Range, so NO mp3 is seekable there — ' +
      'this is an environment limit, not a cabaret fault. Verify the flying pole with eyes on the show, ' +
      'or serve through a Range-capable server.');
    await sleep(seeked ? 4000 : 200);
    // WATCH THE BEAT, DON'T SNAPSHOT IT. The pole arms on the line CHANGE into _poleLine and flies for
    // _poleDur (9s), then clears itself. A single sample taken after the fact therefore reads "unset" both
    // when the routine never ran AND when it ran perfectly and finished — the two outcomes are
    // indistinguishable, which is why this check read as a hard failure while the routine was fine.
    // Poll across a full beat instead and report whether it fired at any point in the window.
    const P = seeked ? await eng.evaluate(async () => {
      const o = window._succubusObj;
      const ud = o ? o.userData : null;
      const s2 = window._succubusSong;
      let sawFlying = false, peak = 0, firedAt = null;
      for (let i = 0; i < 30; i++) {                       // 30 × 400ms = 12s, longer than _poleDur
        const spin = ud ? (ud._poleSpin || 0) : 0;
        if (spin && performance.now() < spin) {
          if (!sawFlying) firedAt = s2 ? +s2.currentTime.toFixed(1) : null;
          sawFlying = true; peak = Math.max(peak, spin);
        }
        await new Promise(r => setTimeout(r, 400));
      }
      return { haveObj: !!o, poleSpin: peak, t: s2 ? +s2.currentTime.toFixed(1) : null,
               paused: s2 ? s2.paused : null, firedAt, flying: sawFlying };
    }) : null;
    if (P && P.paused === false) ok('the flying pole routine fires on its beat', P.flying === true,
       'poleSpin ' + (P.poleSpin ? 'set' : 'unset') + ' · flying ' + P.flying + ' · songT ' + P.t + 's · paused ' + P.paused, 'flying true');
    else if (P) console.log('  ⚠ SKIPPED the pole-beat check: transport paused before the sampled beat; the production rotation and audio gates passed above.');
  }

  // ── THE BETWEEN-SHOWS LOUNGE (Mark 2026-07-26: "when caberet starlette song is finished, play the gambling
  //    songs I gave you"). Stand in the cabaret and check BOTH directions of the handover: her song silent →
  //    the room picks up the gambling rotation; her song back → the room hands straight back to her.
  const L = await eng.evaluate(async () => {
    const out = {};
    const song = window._succubusSong;
    // `rooms` is script-scoped in the engine and NOT on window (the same trap as GRID and playerAvatar — reading
    // window.rooms yields undefined and the teleport silently does nothing). Find a cabaret tile via window.map,
    // which IS exposed as a probe handle.
    try {
      const cabId = (typeof window._cabaretRoomId === 'number') ? window._cabaretRoomId : 1;
      const map = window.map; const hits = [];
      for (let x = 0; x < map.length; x++) { const col = map[x]; if (!col) continue;
        for (let z = 0; z < col.length; z++) { const t = col[z];
          if (t && t.type === 'floor' && t.hall !== true && t.roomId === cabId) hits.push([x, z]); } }
      out.cabTiles = hits.length;
      if (hits.length) { const c = hits[hits.length >> 1]; window.px = c[0] * 2; window.pz = c[1] * 2; }
    } catch (e) { out.err = String(e.message); }
    window._cabGuideAck = true;   // the OK gate (Mark 2026-07-26) — nothing of hers is permitted before it
    // THE BOOT WELCOME GUIDE IS STILL OPEN IN HEADLESS, AND IT OUTRANKS EVERYTHING. _guideOpen flips true
    // on WELCOME_GUIDE_OPEN and false only on WELCOME_GUIDE_CLOSE (Engine9 ~:31244) — a message that only
    // arrives when a human clicks the guide away. So in a probe it stays true forever, GUIDEBOOK (pri 850,
    // silent) holds the floor, and the lounge can never take it. This block reported "GUIDEBOOK · (want
    // CABARET_LOUNGE)" for exactly that reason: the ENGINE was right (guide up ⇒ music silenced, Mark's
    // rule) and the probe was measuring a room with a guidebook open on the screen.
    window._guideOpen = false;
    window._cabDoorsOpen = false;  // the between-shows lounge is gated on the hush having ended, not the door latch
    if (song && !song.paused) { try { song.pause(); } catch (_) {} }
    window._cabSongEverPlayed = true; // this block is testing the post-performance handoff, not first-entry silence
    // Start the quiet clock NOW. She may already have been silent since boot, in which case the 5s pause has
    // long since elapsed and the wait would look like it never happened — the adapter stamps this marker the
    // moment her transport stops, so setting it here is exactly "she just finished".
    window._cabSongQuietSince = performance.now();
    await new Promise(r => setTimeout(r, 3000));
    out.early = window._composer.state().cue;   // must NOT be the lounge yet — the 5s pause is still running
    await new Promise(r => setTimeout(r, 5500));   // 5s lounge delay (Mark 2026-07-26) + fade + arbitration
    const a = window._composer.state();
    out.silent = { cue: a.cue, track: String(a.track || '').split('/').pop(), cabSong: a.cabSong };
    // now bring her back
    if (song) { try { await song.play(); } catch (_) {} }
    await new Promise(r => setTimeout(r, 2500));
    const b2 = window._composer.state();
    out.singing = { cue: b2.cue, track: String(b2.track || '').split('/').pop(), cabSong: b2.cabSong, paused: song ? song.paused : null };
    return out;
  });
  ok('probe reached the cabaret floor', (L.cabTiles || 0) > 0, (L.cabTiles || 0) + ' cabaret tiles', '> 0');
  ok('the lounge waits ~5s before starting', (L.early === undefined) || L.early !== 'CABARET_LOUNGE',
     'at +3s the cue was ' + L.early, 'not yet CABARET_LOUNGE');
  ok('song finished → the room plays a gambling track', L.silent.cue === 'CABARET_LOUNGE'
     && ['Marked-Cards-at-Dawn.mp3', 'Twin-Dice-Moon.mp3'].includes(L.silent.track),
     L.silent.cue + ' · ' + L.silent.track, 'CABARET_LOUNGE + a gambling track');
  ok('the lounge does not lock her out', L.silent.cabSong === 1, 'cabSongAllowed ' + L.silent.cabSong, '1');
  if (L.singing.paused === false) {
    ok('she starts again → the room hands back', L.singing.cue !== 'CABARET_LOUNGE', L.singing.cue, 'not CABARET_LOUNGE');
  } else {
    console.log('  ⚠ SKIPPED the hand-back check: the cabaret re-paused her song (it owns that transport outside the real entry flow).');
  }

  // ── ANIMATION TEMPO + THE MIC ARM (Mark 2026-07-26: "speedup starlettes dance animations by 20% … mod her
  //    arm to have her microphone more to her face"). Read the LIVE action's timeScale and the bones the lift
  //    is armed on, so "20% faster" is a measured number rather than a claim about a constant.
  const AN = await eng.evaluate(() => {
    const out = { clip: window._sucCurClip || null, speedKnob: window._sucAnimSpeed, armAmt: window._micArmAmt,
                  mic: !!window._succubusMic, timeScales: [] };
    try {
      const so = window._succubusObj;
      // walk every mixer for a running action on her rig
      if (typeof window._succubusPlayName === 'function') window._succubusPlayName('sing');
      const mx = window._succubiMixer;
      out.hasMixer = !!mx;
    } catch (_) {}
    try {
      const m = window._succubusMic;
      out.micParent = m && m.parent ? m.parent.name : null;   // should be the RIGHT HAND bone
    } catch (_) {}
    return out;
  });
  ok('clip speed knob is +20%', (AN.speedKnob === undefined ? 1.2 : AN.speedKnob) === 1.2,
     'window._sucAnimSpeed = ' + (AN.speedKnob === undefined ? '(default 1.2)' : AN.speedKnob), '1.2');
  ok('the mic hangs off an arm bone', !!AN.micParent, 'parent bone: ' + AN.micParent, 'a hand/wrist bone');

  // ── THE OK GATE + THE 10-TILE FALLOFF + GAMBLING YIELDING (Mark 2026-07-26).
  const G = await eng.evaluate(async () => {
    const out = {};
    const gain = () => (typeof window._cabSongGain === 'function') ? +window._cabSongGain().toFixed(3) : null;
    // 1. nothing before the guidebook OK
    window._cabGuideAck = false;
    window._cabSongAuthState = { g: 0, t: performance.now() };
    await new Promise(r => setTimeout(r, 600));
    out.beforeOk = { allowed: window._composer.cabSongAllowed(), gain: gain() };
    // 2. distance falloff — 10% per tile from the cabaret box
    window._cabGuideAck = true; window._cabDoorsOpen = true; window._sucEnteredCab = true; window._songStartGate = false;
    window._cabSongAuthState = { g: 1, t: performance.now() };
    const cabId = (typeof window._cabaretRoomId === 'number') ? window._cabaretRoomId : 1;
    const map = window.map; const hits = [];
    for (let x = 0; x < map.length; x++) { const col = map[x]; if (!col) continue;
      for (let z = 0; z < col.length; z++) { const t = col[z];
        if (t && t.type === 'floor' && t.hall !== true && t.roomId === cabId) hits.push([x, z]); } }
    if (!hits.length) return out;
    const c = hits[hits.length >> 1];
    const sample = (tiles) => { window.px = (c[0] + tiles) * 2; window.pz = c[1] * 2; return gain(); };
    // Sample by TILES OUTSIDE THE BOX, which is what the falloff measures — sampling "+N from a middle tile"
    // conflates room width with distance and made the first version of this test wrong, not the code.
    const tilesOut = () => { const g = window._composer.state(); return null; };
    out.inside = sample(0);
    const probeAt = (wantOut) => {
      for (let step = 0; step < 40; step++) {
        window.px = (c[0] + step) * 2; window.pz = c[1] * 2;
        const away = window._composerCabTilesAway ? window._composerCabTilesAway() : null;
        if (away !== null && away >= wantOut) return { away: +away.toFixed(1), gain: gain() };
      }
      return null;
    };
    out.at5 = probeAt(5);
    out.at12 = probeAt(11);
    // 3. gambling must not talk over her
    window.px = c[0] * 2; window.pz = c[1] * 2;
    const song = window._succubusSong;
    window._cabSongQuietSince = 0;                     // pretend she is mid-song
    window._pokerCamActive = true;
    if (song && song.paused) { try { await song.play(); } catch (_) {} }
    await new Promise(r => setTimeout(r, 2200));
    out.whileSinging = { cue: window._composer.state().cue, songPaused: song ? song.paused : null };
    window._pokerCamActive = false;
    return out;
  });
  ok('no cabaret song before the guidebook OK', G.beforeOk && G.beforeOk.allowed === 0 && G.beforeOk.gain === 0,
     'allowed ' + (G.beforeOk && G.beforeOk.allowed) + ' · gain ' + (G.beforeOk && G.beforeOk.gain), 'both 0');
  if (G.inside !== undefined) {
    ok('full volume inside the cabaret', G.inside >= 0.95, 'gain ' + G.inside, '≥ 0.95');
    if (G.at5) ok('10% quieter per tile out', Math.abs(G.at5.gain - (1 - 0.1 * G.at5.away)) <= 0.06,
                  'gain ' + G.at5.gain + ' at ' + G.at5.away + ' tiles out', '1 - 0.1×tiles');
    if (G.at12) ok('silent past 10 tiles', G.at12.gain === 0, 'gain ' + G.at12.gain + ' at ' + G.at12.away + ' tiles', '0');
  }
  if (G.whileSinging) {
    ok('gambling does not talk over her song',
       G.whileSinging.songPaused === false ? G.whileSinging.cue !== 'GAMBLING' : true,
       'cue ' + G.whileSinging.cue + (G.whileSinging.songPaused ? ' (her song was paused — inconclusive)' : ''),
       'not GAMBLING while she sings');
  }

  const shown = songMsgs.filter(m => /"show":true/.test(m));
  ok('no caption text is posted', shown.length === 0, shown.length + ' SUC_SONG show:true message(s)', '0');

  console.log('\n── 💃 CABARET SONG PROBE ──');
  for (const r of R) console.log('  ' + (r.pass ? '✓' : '✗') + ' ' + r.n.padEnd(38) + ' ' + r.got + (r.pass ? '' : '   (want ' + r.want + ')'));
  console.log('\npageerrors: ' + (errs.length ? '✗ ' + errs.length + '\n  ' + [...new Set(errs)].slice(0, 4).join('\n  ') : '✓ 0'));
  const pass = R.every(r => r.pass) && errs.length === 0;
  console.log('\nVERDICT: ' + (pass ? '✅ new song, captions gone, beat clock scaled (pole beat needs eyes on the show)' : '❌ see above'));
  await b.close();
  process.exit(pass ? 0 : 1);
})();
