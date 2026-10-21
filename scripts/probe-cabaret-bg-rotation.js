#!/usr/bin/env node
/**
 * probe-cabaret-bg-rotation.js — the cabaret BG hum is a ROTATION now (Mark 2026-08-20).
 *
 * Mark: "for caberet background music + add Caberet.1 and Caberet.2 to that rotation AFTER
 * playing BG PostParisDream is played."
 *
 * ⚠ THE GAP CLAUSE OF THAT ASK IS SUPERSEDED. It originally read "reduce gap between songs to
 *   max of 5 seconds -- 2 second fade + 1 empty + 2 second fadein", and this probe asserted
 *   "TRUE SILENCE through the empty gap" — 168 frames of it, measured and passing. Hours later
 *   Mark set RULE #1: "mandatory that music never shuts down, fade out 2.5 seconds always for
 *   all music." The empty second is exactly what that forbids, so the assertion is INVERTED
 *   here rather than deleted: the changeover must now contain NO silent frame at all.
 *
 * WHAT IS ASSERTED, on the REAL closure (window._cabBgCue → _postDreamCue), not a copy:
 *   1. ORDER  — PostParisDream, then Cabaret-Startup-1, then -2, then wrap to 0.
 *   2. ADVANCE — `ended` moves the index. This is the one that would have caught leaving
 *                `el.loop = true`: a looping element never fires `ended` at all, so the
 *                rotation would have sat on track 0 forever and looked exactly like the
 *                old behaviour.
 *   3. GAP    — volume is 0 through the empty second, then rises again (the fade-in).
 * ⚠ WHY STAND-IN CLIPS AND NOT A SEEK TO THE LAST SECOND. My first cut of this probe set
 *   `el.currentTime = el.duration - 0.25` on the real 3:32 track. It reads as though it
 *   worked and does not: scripts/lib's static server sends no `Accept-Ranges`, so seeking
 *   past `buffered.end` (133s of 212s) makes the browser re-request the file, get byte 0
 *   back, and RESTART AT ZERO. The measured trace was t=1.43 → seek → 0.26 → 0.97 → 2.47:
 *   playing forward from the top, `ended` never firing, and the probe blaming the engine
 *   for a defect in its own harness. Short real clips end on their own and need no seek.
 *   The DEFAULT list is asserted separately, from the shipped code path, in step 0.
 * The fade/gap knobs are shortened so a changeover fits inside a probe run.
 */
const { chromium } = require('playwright');
const { bootAndStart } = require('./lib/probe-boot');

const FADE = 600, GAP = 0;     // stand-in for the shipped 2500 / 0 — see rule #1 below
// Three DISTINCT ~1s clips so `ended` fires for real and the order is unambiguous.
const CLIPS = ['./assets/sounds/Monsters/Goblin-attack-quick.mp3',
               './assets/sounds/Monsters/Goblin-cackle-with-reverb.mp3',
               './assets/sounds/Monsters/goblin-attack.mp3'];
const SHIPPED = ['BG-PostParisDream.mp3',
                 'Starlette-Cabaret-Startup-1.mp3',
                 'Starlette-Cabaret-Startup-2.mp3'];

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1',
                                          args: ['--use-angle=metal', '--enable-gpu',
                                                 '--autoplay-policy=no-user-gesture-required'] });
  let bad = 0;
  try {
    const { page, timings, pageerrors } = await bootAndStart(browser, { viewport: { width: 1600, height: 900 } });
    console.log(`[boot] ready ${timings.readyMs}ms -> loop ${timings.loopMs}ms`);
    const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!eng) { console.log('FAIL — no engine frame'); process.exit(2); }

    const ck = (ok, msg) => { console.log((ok ? '  \u2713 ' : '  \u2717 ') + msg); if (!ok) bad++; };
    const name = u => String(u || '').split('/').pop().split('?')[0];
    const readEl = () => eng.evaluate(() => {
      const D = window._sucDreamState, el = D && D.postEl;
      if (!el || !D.postDecks) return null;
      return { src: el.currentSrc || el.src, paused: el.paused, idx: D._rotIdx,
               xfading: !!D._rotXfadeAt, dur: el.duration, t: el.currentTime,
               sum: +D.postDecks.reduce((a, d) => a + (d.paused ? 0 : d.volume), 0).toFixed(3) };
    });

    // ── STEP 1 (RUN FIRST): A REAL ROTATION, WITH CLIPS SHORT ENOUGH TO END ───────────────
    //    ⚠ RECORDED IN-PAGE, NOT POLLED. My first cut sampled the element from Node on
    //      a 60ms loop and reported "advanced to clip 1, then stalled, paused=true".
    //      It had not stalled: with ~1s clips the whole changeover is ~2s, so the poll
    //      kept landing mid-load (src swapped, element briefly paused) and the gap
    //      window kept closing between two samples. Wrapping el.play() and logging
    //      every media event showed 0→1→2→0 with `play OK` on all three. The recorder
    //      below lives inside the page and cannot miss a transition.
    //    ⚠ AND IT RUNS BEFORE THE LIST READ, WHICH IS NOT COSMETIC. `_cabBgCue` clears
    //      `_postCueArmed` so a probe can cue twice, and each cue starts its OWN _postTick
    //      rAF. The old tick only retires on `!D.postEl`, so re-cueing before it has seen
    //      that null leaves TWO ticks driving one shared `D._rot*` state on two different
    //      elements — measured: the rotation advanced once and then died. Nothing in the
    //      shipped game can hit this (`_postCueArmed` allows exactly one cue); it is an
    //      artefact of the probe handle. Cue the ROTATION on a virgin state, and let the
    //      destructive list-walk go last.
    await eng.evaluate(({ fade, gap, clips }) => {
      window._postDreamDelayMs = 0; window._cabBgFadeMs = fade; window._cabBgGapMs = gap;
      window._postDreamVol = 0.5;
      // The probe stands outside the cabaret, where the driver's distance gate legitimately
      // mutes the hum. Neutralise it so what we read is the CHANGEOVER envelope, not geometry.
      window._songFadePerTile = 0; window._songDoorDuck = 1;
      window._cabBgSongs = clips;
      window.__rot = { order: [], tailVols: [], peak: 0, silentFrames: 0, totalFrames: 0, playRejects: [], t0: performance.now() };
      window._cabBgCue();
    }, { fade: FADE, gap: GAP, clips: CLIPS });

    // `_postDreamCue` builds the element inside a setTimeout — even at delay 0 that is a
    // macrotask, so postEl does not exist on the cue's own tick. (My first cut read it
    // synchronously and died on `null.src`.) Wait for it, then instrument.
    await page.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].map(i => i.contentWindow).find(w => { try { return w._sucDreamState; } catch (_) { return false; } });
      return !!(f && f._sucDreamState && f._sucDreamState.postEl);
    }, null, { timeout: 8000 }).catch(() => {});
    await eng.evaluate(() => {
      const D0 = window._sucDreamState;
      if (!D0 || !D0.postDecks) throw new Error('postDecks never appeared');
      window.__rot.order.push(D0.postDecks[0].src);
      for (const d of D0.postDecks) {
        const _play = d.play.bind(d);
        d.play = function () { const pr = _play(); pr.catch(e => window.__rot.playRejects.push(e.name + ': ' + e.message)); return pr; };
      }
      let lastIdx = D0._rotIdx | 0;
      (function sample() {
        requestAnimationFrame(sample);
        const D = window._sucDreamState;
        if (!D || !D.postDecks) return;
        // ⚠ THE SUM OF BOTH DECKS, not the lead's volume. During a crossfade the lead is on its way
        //   to zero while the incoming deck carries the music — reading one deck would report a
        //   silence that the listener never hears, which is the whole point of the two-deck build.
        const v = D.postDecks.reduce((a, d) => a + (d.paused ? 0 : d.volume), 0);
        window.__rot.totalFrames++;
        // Rule #1: no frame may be silent. Counted only once the bed has opened, so the run-up from
        // zero at cue time is not scored as a hole in the music.
        if (window.__rot.peak > 0.05 && v <= 0.0005) window.__rot.silentFrames++;
        window.__rot.peak = Math.max(window.__rot.peak, v);
        if ((D._rotIdx | 0) !== lastIdx) {          // a changeover armed — record what came in
          lastIdx = D._rotIdx | 0;
          window.__rot.order.push(D.postDecks[1 - D.postCur].src);
          // Stamped with age, because the first few seams land INSIDE the driver's 4s entry rise
          // (`_in`, the climb out of the dream's dark) — the bed itself is still opening there, so a
          // low reading is the rise, not a gap. Only seams past that window measure the crossfade.
          window.__rot.tailVols.push({ v: +v.toFixed(3), age: Math.round(performance.now() - window.__rot.t0) });
        }
      })();
    });

    await page.waitForTimeout(11000);   // ~1s clips + 0.4s gap + 0.6s fade ⇒ 4+ changeovers
    const rot = await eng.evaluate(() => {
      const r = window.__rot;
      return { order: r.order.map(u => u), silentFrames: r.silentFrames, totalFrames: r.totalFrames,
               peak: +r.peak.toFixed(3), rejects: r.playRejects, tailVols: r.tailVols,
               live: window._sucDreamState.postDecks.some(d => !d.paused && d.volume > 0) };
    });
    const seen = rot.order.map(name);
    console.log(`\n\u2500\u2500 1. A REAL ROTATION (${CLIPS.length} short clips, ${FADE}ms fade / ${GAP}ms gap) \u2500\u2500`);
    console.log('  order seen: ' + seen.join(' \u2192 '));
    ck(seen.length >= 4, `at least 3 changeovers observed (got ${seen.length - 1})`);
    ck(seen[1] === name(CLIPS[1]), 'ended \u2192 advanced to clip 1');
    ck(seen[2] === name(CLIPS[2]), 'ended \u2192 advanced to clip 2');
    ck(seen[3] === name(CLIPS[0]), 'ended \u2192 wrapped to clip 0 \u2014 a continual loop');
    ck(rot.rejects.length === 0, `every play() resolved (rejects: ${JSON.stringify(rot.rejects)})`);
    ck(rot.live, 'still playing at the end of the run');

    console.log('\n\u2500\u2500 2. THE CHANGEOVER \u2014 RULE #1: NO SILENCE \u2500\u2500');
    console.log(`  frames held at volume 0 anywhere in the run: ${rot.silentFrames} of ${rot.totalFrames}`);
    console.log(`  peak volume: ${rot.peak}  (_postDreamVol 0.5)`);
    ck(rot.silentFrames === 0,
       `NOT ONE SILENT FRAME across ${seen.length - 1} changeovers \u2014 rule #1 (was 168 under the old 1s gap)`);
    ck(rot.peak > 0.4, 'full level between changeovers');
    // THE TAIL FADE is the subtle half of the changeover: `ended` arrives with nothing left
    // to fade, so the duck has to be ANTICIPATED off `duration - currentTime`. If that branch
    // were wrong the song would simply stop at full level — a cut, not a fade. The level the
    // outgoing clip was at when it ended is the direct measurement of it.
    // THE SEAM IS THE WHOLE TEST. Under one element the level at a changeover fell to ~0 (the outgoing
    // song was simply gone). Under the crossfade the SUM of both decks must stay UP through the seam —
    // that is the difference between "a very short hole" and "no hole".
    const RISE = 4200;   // the driver's 4s entry rise, plus a frame of margin
    const early = rot.tailVols.filter(x => x.age <= RISE), settled = rot.tailVols.filter(x => x.age > RISE);
    console.log(`  seam levels during the 4s entry rise (not scored): ${JSON.stringify(early.map(x => x.v))}`);
    console.log(`  seam levels once the bed is open:                  ${JSON.stringify(settled.map(x => x.v))}  (bed ${rot.peak})`);
    ck(settled.length >= 3, `${settled.length} seams measured past the entry rise`);
    ck(settled.every(x => x.v >= rot.peak * 0.98),
       'the two decks hold FULL level through every seam \u2014 a crossfade, not a gap');

    // ── STEP 2 (RUN LAST — DESTRUCTIVE): THE SHIPPED DEFAULT LIST ──────────────────────────────────────
    //    Cue with NO override so `_cabBg()` returns its built-in array, then walk the
    //    rotation by index alone (no playback needed) to read every entry back out.
    //    This is the ORDER assertion; playback is proved in step 1 with short clips.
    // Retire the rotation element and let its tick observe the null BEFORE re-cueing —
    // see the two-ticks note in step 1.
    await eng.evaluate(() => { const D = window._sucDreamState;
                               try { for (const d of (D.postDecks || [])) d.pause(); } catch (_) {}
                               D.postEl = null; D.postDecks = null; });
    await page.waitForTimeout(400);
    // ⚠ NO MORE SYNTHETIC `ended` EVENTS. The rotation used to advance on an `ended` listener, so a
    //   probe could walk the list by dispatching one. The crossfade build has no such listener — it is
    //   driven off the clock — so the engine now publishes `window._cabBgActiveList`, a read-only
    //   mirror of the live list, and the order is read straight off it.
    const list = await eng.evaluate(() => {
      window._postDreamDelayMs = 0; delete window._cabBgSongs;
      window._cabBgCue();
      return new Promise(res => setTimeout(() => res((window._cabBgActiveList || []).slice()), 1200));
    });
    console.log('\n\u2500\u2500 3. THE SHIPPED DEFAULT LIST \u2500\u2500');
    list.forEach((u, i) => console.log(`  [${i}] ${name(u)}`));
    SHIPPED.forEach((want, i) => ck(name(list[i]) === want, `slot ${i} = ${want}`));
    ck(list.length === 3, `three slots, so the index wraps 0\u21921\u21922\u21920 (got ${list.length})`);

    console.log('\npageerrors:', pageerrors.length, pageerrors);
    if (pageerrors.length) bad++;
    console.log(bad ? `\n✗ ${bad} check(s) FAILED` : '\n✓ ALL CHECKS PASS');
  } finally { await browser.close(); }
  process.exit(bad ? 1 : 0);
})();
