/**
 * Starlette setlist rotation falsifier (N sets, derived from the song catalog).
 *
 * Loads the real game, asks the production rotation owner to advance 1→2→3→1, and waits for
 * browser-decoded metadata after every source swap. This catches missing files, Unicode URL mistakes,
 * stale two-entry arrays, bad wrap arithmetic, and wrong track-specific reveal timing.
 */
const { chromium } = require('playwright');

const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  const audioAnomalies = [];
  page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 220)));
  await page.exposeFunction('__starletteAudioAnomaly', data => audioAnomalies.push(data));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => window.addEventListener('message', event => {
    const data = event.data;
    if (data?.type === 'ENGINE_ANOMALY' && data.kind === 'CABARET_AUDIO_PRELOAD') {
      window.__starletteAudioAnomaly(JSON.stringify(data));
    }
  }));
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  await sleep(5000);
  const engine = page.frames().find(frame => /Engine9\.html/.test(frame.url()));
  if (!engine) throw new Error('engine frame not found');

  const result = await engine.evaluate(async () => {
    const song = window._succubusSong;
    const list = window._cabSetDefault;
    if (!song || !Array.isArray(list) || typeof window._advanceCabaretSet !== 'function') {
      return { error: 'song/list/rotation owner unavailable' };
    }
    const priorCustom = window._cabSetList;
    try { delete window._cabSetList; } catch (_) { window._cabSetList = null; }
    window._cabSetIdx = 0;
    window._songIntroAuto = true;
    song.src = list[0];
    song.load();

    const rows = [];
    const waitFor = async step => {
      let loaded = false;
      for (let n = 0; n < 100; n++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const active = decodeURIComponent(String(song.currentSrc || song.src).split('/').pop());
        const wanted = decodeURIComponent(String(step?.src || '').split('/').pop());
        if (active === wanted && song.readyState >= 1 && Number.isFinite(song.duration)) {
          loaded = true;
          break;
        }
        if (song.error) break;
      }
      rows.push({
        index: step?.index,
        name: decodeURIComponent(String(song.currentSrc || song.src).split('/').pop()),
        duration: Number.isFinite(song.duration) ? +song.duration.toFixed(1) : null,
        intro: step?.intro,
        endedEvent: step?.endedEvent,
        loaded,
        error: song.error?.code || 0,
      });
    };
    await waitFor(window._advanceCabaretSet()); // set 2
    await waitFor(window._advanceCabaretSet()); // set 3, part 1
    const continuationBefore = {
      index: window._cabSetIdx,
      seq: window._cabSetContinuationSeq | 0,
      active: window._cabSongFileActive,
    };
    // The continuation must be heard, not merely loaded. The old probe checked only src/index/rest,
    // allowing the production handler to omit play() while still reporting a green result.
    window._songStartGate = false;
    window._composerOwnsCabSong = false;
    window._cabGuideAck = true;
    window._cabDoorsOpen = true;
    window._sucGuideOpen = false;
    const cabId = (typeof window._cabaretRoomId === 'number') ? window._cabaretRoomId : 1;
    let cabTile = null;
    if (typeof map !== 'undefined') {
      for (let gx = 0; gx < map.length && !cabTile; gx++) {
        for (let gz = 0; gz < (map[gx]?.length || 0); gz++) {
          const cell = map[gx][gz];
          if (cell && cell.roomId === cabId && cell.hall !== true && cell.type !== 'wall') {
            cabTile = { gx, gz };
            break;
          }
        }
      }
    }
    if (cabTile && typeof px === 'number' && typeof pz === 'number') {
      px = cabTile.gx * 2;
      pz = cabTile.gz * 2;
    }
    const continuationGate = {
      gain: typeof window._cabSongGain === 'function' ? window._cabSongGain() : null,
      px: typeof px === 'number' ? px : null,
      pz: typeof pz === 'number' ? pz : null,
      room: (typeof map !== 'undefined' && map[Math.round(px / 2)])
        ? map[Math.round(px / 2)][Math.round(pz / 2)]?.roomId : null,
      guideOpen: window._sucGuideOpen,
      bgOn: window._bgMusicOn,
    };
    song.dispatchEvent(new Event('ended'));      // set 3 part 1 → part 2, no rest
    for (let n = 0; n < 80 && (song.paused || song.readyState < 2); n++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const continuationT0 = song.currentTime;
    await new Promise(resolve => setTimeout(resolve, 250));
    const continuation = {
      index: window._cabSetIdx,
      seq: window._cabSetContinuationSeq | 0,
      active: window._cabSongFileActive,
      rest: Math.round((window._songRestUntil || 0) - performance.now()),
      paused: song.paused,
      advanced: song.currentTime > continuationT0,
      gate: continuationGate,
      gainAfter: typeof window._cabSongGain === 'function' ? window._cabSongGain() : null,
    };
    await waitFor({ index:window._cabSetIdx, src:window._cabSongFileActive, intro:window._songIntro });
    const beforeFinalSeq = window._cabSetEndSeq | 0;
    // WRAP IS LENGTH-DRIVEN, NOT "AFTER THE THIRD SONG". The setlist is now built from the song catalog
    // (js/v8/data/SongCatalog.js) and grows every time Mark adds a track, so a fixed number of `ended`
    // events stops meaning "one full cycle" the moment a song is added — which is exactly what happened
    // when the merged 地獄越え made it four. Keep ending songs until the index returns to 0, bounded by
    // the list length so a rotation that genuinely never wraps still fails instead of hanging.
    let endsFired = 0;
    song.dispatchEvent(new Event('ended'));
    endsFired++;
    for (let guard = 0; guard < list.length + 2 && window._cabSetIdx !== 0; guard++) {
      await waitFor({ index:window._cabSetIdx, src:window._cabSongFileActive, intro:window._songIntro });
      song.dispatchEvent(new Event('ended'));
      endsFired++;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    const final = {
      index: window._cabSetIdx,
      active: window._cabSongFileActive,
      endsFired,
      endedEvent: (window._cabSetEndSeq | 0) >= beforeFinalSeq + 1,
      rest: Math.round((window._songRestUntil || 0) - performance.now()),
    };
    if (priorCustom === undefined) { try { delete window._cabSetList; } catch (_) {} }
    else window._cabSetList = priorCustom;
    return {
      initial: decodeURIComponent(String(list[0]).split('/').pop()),
      defaultList: list.map(path => decodeURIComponent(String(path).split('/').pop())),
      catalogList: (window._cabSetAll || []).map(path => decodeURIComponent(String(path).split('/').pop())),
      questGate: window._songQuestGate === true,
      rows,
      continuationBefore,
      continuation,
      final,
      finalIndex: window._cabSetIdx,
      finalActive: decodeURIComponent(String(window._cabSongFileActive || '').split('/').pop()),
      restMs: Math.round((window._songRestUntil || 0) - performance.now()),
      endSeq: window._cabSetEndSeq | 0,
    };
  });

  const failures = [];
  // THE SETLIST IS DERIVED NOW, SO THE EXPECTATION MUST BE TOO. This used to be a literal three-entry
  // array, which made "Mark added a song" indistinguishable from "the rotation broke". The invariant
  // that actually matters is: with the quest gate OFF she performs the WHOLE catalog, in catalog order.
  // The three founding tracks are still asserted by name below, so a catalog that silently LOSES one
  // still fails — the literal was doing two jobs and only one of them is worth keeping.
  const expectedList = result.catalogList;
  const CORE_TRACKS = [
    'StarletteSong_紅い扇子.mp3',
    'Song-dance-紅い扇子.mp3',
    'Starlette-EDM黄泉の宿-1.mp3',
  ];
  if (result.questGate === true) {
    failures.push('quest gate was ON during the rotation probe — this probe measures the un-gated setlist');
  }
  for (const core of CORE_TRACKS) {
    if (!result.defaultList?.includes(core)) failures.push(`core track missing from setlist: ${core}`);
  }
  const expectedCycle = [
    { index: 1, name: expectedList[1], duration: 191.2, intro: 10 },
    { index: 2, name: expectedList[2], duration: 71.9, intro: 1 },
    { index: 2, name: 'Starlette-EDM黄泉の宿-2.mp3', duration: 126.2, intro: 1 },
  ];
  if (result.error) failures.push(result.error);
  if (JSON.stringify(result.defaultList) !== JSON.stringify(expectedList)) {
    failures.push(`default list ${JSON.stringify(result.defaultList)} != ${JSON.stringify(expectedList)}`);
  }
  for (let i = 0; i < expectedCycle.length; i++) {
    const got = result.rows?.[i];
    const want = expectedCycle[i];
    if (!got || got.index !== want.index || got.name !== want.name || got.intro !== want.intro
        || !got.loaded || got.error || Math.abs(got.duration - want.duration) >= 2) {
      failures.push(`step ${i + 1}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    }
  }
  const continuationName = decodeURIComponent(String(result.continuation?.active || '').split('/').pop());
  const finalName = decodeURIComponent(String(result.final?.active || '').split('/').pop());
  if (result.continuation?.index !== 2 || continuationName !== 'Starlette-EDM黄泉の宿-2.mp3'
      || result.continuation?.seq !== (result.continuationBefore?.seq || 0) + 1 || result.continuation?.rest > 0
      || result.continuation?.paused !== false || result.continuation?.advanced !== true) {
    failures.push(`set 3 did not continue immediately: ${JSON.stringify(result.continuation)}`);
  }
  if (result.final?.index !== 0 || finalName !== expectedList[0]) {
    failures.push(`cycle did not wrap to set 1 after ${result.final?.endsFired} ended events: ` +
      `index=${result.finalIndex}, active=${result.finalActive}`);
  }
  if (result.final?.endedEvent !== true || result.endSeq < 1 || result.final?.rest < 1000) {
    failures.push(`natural ended event did not arm rotation/rest: seq=${result.endSeq}, restMs=${result.restMs}`);
  }
  if (audioAnomalies.length) failures.push(`${audioAnomalies.length} cabaret audio anomaly message(s)`);
  if (pageErrors.length) failures.push(`${pageErrors.length} page error(s)`);

  console.log('\n══ STARLETTE SETLIST ROTATION ══\n');
  console.log('  default: ' + (result.defaultList || []).join(' → '));
  for (const row of result.rows || []) {
    console.log(`  set ${row.index + 1}: ${row.name} · ${row.duration}s · reveal ${row.intro}s`
      + ` · decoded ${row.loaded ? 'yes' : 'NO'} · error ${row.error}`);
  }
  console.log(`  continuation: index ${result.continuation?.index} · ${result.continuation?.active} · rest ${result.continuation?.rest}ms`);
  console.log(`  wrap: index ${result.final?.index} · ${result.final?.active}`);
  console.log(`  natural ended event: seq ${result.endSeq} · rest armed ${result.final?.rest}ms`);
  console.log('\n  VERDICT: ' + (failures.length ? '✗ FALSIFIED' : '✓ SURVIVES'));
  for (const failure of failures) console.log('    - ' + failure);
  console.log(`  pageerrors: ${pageErrors.length} · audio anomalies: ${audioAnomalies.length}\n`);
  for (const anomaly of audioAnomalies) console.log('  anomaly: ' + anomaly);

  await browser.close();
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
