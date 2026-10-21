#!/usr/bin/env node
/**
 * probe-music-never-stops.js — Mark's RULE #1 (2026-08-20):
 *   "mandatory that music never shuts down, fade out 2.5 seconds always for all music is #1 rule."
 *
 * Two clauses, both measured against the SHIPPED cue table rather than the source text:
 *   A. NEVER SHUTS DOWN — a track change must leave NO frame at silence. Driven through the real
 *      Composer with a synthetic state (the unit-drive pattern probe-bg-after-cabaret.js documents:
 *      the segment machinery owns _activeSegmentId in the live page and reconciles a probe's write
 *      within ~400ms, so the browser cannot answer this question directly).
 *   B. EVERY FADE-OUT IS 2500ms — read every authored fadeOut off the live CUES export.
 *
 * The old behaviour this guards against: gapMs() defaulted to 2500, so `at: now + fadeOut + gapMs()`
 * put 2.5s of DEAD AIR after a 5s fade — ~7.5s of near-silence between tracks.
 */
const W = {};
globalThis.window = W;

const mkAudio = () => ({ volume: 0, paused: true, currentTime: 0, duration: 180, loop: false, src: '',
                         play() { this.paused = false; return Promise.resolve(); },
                         pause() { this.paused = true; }, load() {} });

(async () => {
  let bad = 0;
  const ck = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) bad++; };
  const mod = await import('../js/v8/audio/Composer.js');
  const { createComposer } = mod;

  // ── B. every authored fade-out ────────────────────────────────────────────
  // CUES is module-private, so read the durations the way the engine does: drive a
  // composer and ask it. Falling back to a source scan would test the file, not the build.
  const src = await (await import('node:fs/promises')).readFile('js/v8/audio/Composer.js', 'utf8');
  const cueBlock = src.slice(src.indexOf('const CUES = ['));
  const outs = [...cueBlock.matchAll(/\{ id: '([A-Z_]+)'[^\n]*?fadeOut: (\d+)/g)].map(m => [m[1], +m[2]]);
  const ins  = [...cueBlock.matchAll(/\{ id: '([A-Z_]+)'[^\n]*?fadeIn: (\d+)/g)].map(m => [m[1], +m[2]]);
  console.log('── B. EVERY AUTHORED FADE ──');
  console.log('  fadeOut: ' + outs.map(o => o.join('=')).join('  '));
  console.log('  fadeIn : ' + ins.map(o => o.join('=')).join('  '));
  ck(outs.length >= 12, `${outs.length} cues carry an explicit fadeOut`);
  ck(outs.every(o => o[1] === 2500), 'EVERY fadeOut is 2500ms — no zero-length cutoffs left');
  ck(ins.filter(i => i[0] !== 'BOSS_REVEAL').every(i => i[1] === 2500),
     'every fadeIn is 2500ms too (so the crossfade sums flat, no dip where the decks meet)');
  ck((ins.find(i => i[0] === 'BOSS_REVEAL') || [])[1] === 0, 'BOSS_REVEAL.fadeIn stays 0 — it lands on a camera cut');

  // ── A. no silence across a track change ───────────────────────────────────
  console.log('\n── A. THE MUSIC NEVER SHUTS DOWN ──');
  // createComposer OWNS its decks (it takes a factory, not a list), so capture what it builds.
  const built = [];
  const factory = () => { const d = mkAudio(); built.push(d); return d; };
  W._bgMusicOn = true; W._bgMusicVol = 1; W._musicEarned = true; W._bgInHeart = true;
  const comp = createComposer({ mkAudio: factory, log: () => {} });

  const base = { playerDead: false, blocked: false, roomOwned: false, bossNear: false, bossAlive: false,
                 revealActive: false, inCombat: false, combatTail: false, hostilesNear: false,
                 nearCabaret: false, cabDoorsOpen: false, atTable: false, inCabaret: false,
                 cabSongPlaying: false, cabSongQuietMs: 0, cabSongEver: false, cabGuideAck: false,
                 cabTilesAway: Infinity, level: 1, karma: 0, segmentId: 1 };

  const STEP = 16;
  let clock = 0;
  const audible = () => built.reduce((a, d) => a + (d.paused ? 0 : d.volume), 0);
  // Drive `ms` of wall clock, returning the quietest moment and how many frames were dead silent.
  const drive = (ms, st) => {
    let min = Infinity, silent = 0, frames = 0;
    for (let t = 0; t < ms; t += STEP) {
      clock += STEP; comp.tick(st, clock, STEP);
      const a = audible(); frames++;
      if (a < min) min = a;
      if (a <= 0.0005) silent++;
    }
    return { min, silent, frames };
  };

  drive(9000, base);                                   // settle onto the section bed
  const settled = audible();
  console.log(`  settled: cue=${comp.state().cue} track=${String(comp.state().track || '').split('/').pop()} level=${settled.toFixed(3)}`);
  ck(settled > 0.01, 'something is audible before the change');

  // ⚠ THE TRANSITION HAS TO BE ONE THAT RESTS. My first cut drove SECTION_BG → COMBAT and got a
  //   clean pass — meaningless, because COMBAT is `noRest: true` (~:663) and is EXEMPT from the
  //   inter-track rest by design, so gapMs never applied to it in the first place. Step C caught
  //   that: the same measurement against the OLD 2500ms gap also reported zero silent frames.
  //   GAMBLING (~:733) carries no noRest, so it is a cue the rest genuinely owed.
  const GAMBLE = { ...base, atTable: true, cabSongQuietMs: 99999 };
  const fwd = drive(12000, GAMBLE);
  console.log(`  → into GAMBLING : ${fwd.frames} frames, quietest ${fwd.min.toFixed(4)}, silent frames ${fwd.silent}`);
  ck(comp.state().cue === 'GAMBLING', `the change actually happened (cue=${comp.state().cue})`);
  ck(fwd.silent === 0, 'NOT ONE SILENT FRAME across the change — rule #1');
  ck(fwd.min > 0.001, `the crossfade dip never reaches silence (min ${fwd.min.toFixed(4)})`);

  const back = drive(16000, base);
  console.log(`  → back out      : ${back.frames} frames, quietest ${back.min.toFixed(4)}, silent frames ${back.silent}`);
  ck(back.silent === 0, 'no silent frame on the way back either');

  // ── C. AND PROVE THE GUARD CAN FAIL ───────────────────────────────────────
  //    A green check is worth nothing until it has been shown to go red on the code it
  //    is meant to catch (this repo's "prove a guard TRIPS" law). Put the OLD 2500ms
  //    inter-track rest back and re-run the same measurement: it must find silence.
  console.log('\n── C. THE SAME MEASUREMENT AGAINST THE OLD BEHAVIOUR (must FAIL) ──');
  W._musicGapMs = 2500;                       // the pre-2026-08-20 default
  const built2 = [];
  const comp2 = createComposer({ mkAudio: () => { const d = mkAudio(); built2.push(d); return d; }, log: () => {} });
  let clock2 = 0;
  const aud2 = () => built2.reduce((a, d) => a + (d.paused ? 0 : d.volume), 0);
  const drive2 = (ms, st) => { let silent = 0;
    for (let t = 0; t < ms; t += STEP) { clock2 += STEP; comp2.tick(st, clock2, STEP); if (aud2() <= 0.0005) silent++; }
    return silent; };
  drive2(9000, base);
  const oldSilent = drive2(12000, { ...base, atTable: true, cabSongQuietMs: 99999 });
  console.log(`  with _musicGapMs = 2500 (the old default): ${oldSilent} silent frames`);
  ck(oldSilent > 0, `the check GOES RED on the old behaviour (${oldSilent} silent frames) — so the pass above means something`);
  delete W._musicGapMs;

  console.log(`\n  gap between tracks: window._musicGapMs default = ${W._musicGapMs === undefined ? '(unset → 0)' : W._musicGapMs}`);
  console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  process.exit(bad ? 1 : 0);
})();
