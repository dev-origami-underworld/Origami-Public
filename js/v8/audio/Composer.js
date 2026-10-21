/** [REF#AU-00050]
 * NewOrigami v8 — AI COMPOSER
 * Idea Software Studio © 2026. See LICENSE for permitted use.
 *
 * ONE AUTHORITY for "what music plays right now, and how loud".
 *
 * WHY THIS EXISTS (Mark 2026-07-26: "see how music is being played and begin now a plan to organize it into a
 * new AI Composer. It will control when and what type of music is played."). Before this module, track choice,
 * gating and volume lived in a single 145-line IIFE in NewOrigami.Engine9.html (~8884) that had absorbed six
 * separate special cases — boss rift, karma select, floor rotation, hall-tile exemption, death silence, boss
 * arena — all re-evaluated fresh every 350 ms with NO dwell time. That last part is not a style complaint: it
 * is the exact shape of two shipped bugs, the hall-tile roomId stutter (Engine9 ~9002) and the cabaret-gain
 * flap (~9066). A cue that cannot be replaced for `dwell` ms cannot stutter, no matter how the gates flap.
 *
 * THE MODEL
 *   · Every subsystem only PUBLISHES state (rooms, combat, bosses, tables, pauses). None of them touch audio.
 *   · The Composer picks the highest-priority CUE whose gate passes, then realises it on two decks.
 *   · Three things the old code had none of:
 *       DWELL     — a freshly-started cue is immune to replacement for `dwell` ms.
 *       LATCH     — the random pick from a pool is held for the life of the episode, so re-entering combat or
 *                   a table resumes the same song instead of reshuffling. (Same idea as _bossTrackLatched.)
 *       CROSSFADE — two decks, per-cue fade in/out. The old code only ever hard-cut.
 *
 * SAFETY (CLAUDE.md mandates)
 *   · Owns NO requestAnimationFrame of its own — the engine adapter drives it from the tick that already
 *     existed. Creates no THREE objects, no lights, no materials → cannot move the shader-program count
 *     (E15 law) or the light count, so it cannot regress fps. Does no frame-capping, DPR writing or
 *     render-skipping (NO-THROTTLE mandate). All work is HTMLAudioElement volume/src writes.
 *   · Writes NOTHING back to Oni-Baba's sensors. It READS sensors.tension to bias intensity and reports via
 *     MUSIC_CUE telemetry only. Music → tension → intensity → tension is a positive feedback loop, the same
 *     banned shape as render-cost → scheduling feedback.
 *   · Every volume write is clamped finite. A NaN reaching HTMLMediaElement.volume throws, and it throws on
 *     EVERY frame — measured 359 pageerrors in one probe run from a single NaN player coordinate.
 *
 * Spec + audit: knowledge/design/AI_COMPOSER_SPEC_2026-07-26.md
 */

// ⚠ RETIRED-BG FOLDER, 2026-08-13 (Mark: "all those are background music. cards, put them in a BG-OLD [REF#AU-00051]
// folder"). Every track this constant prefixes moved from assets/sounds/Dungeon/ to assets/sounds/BG-OLD/
// in the same commit — Dungeon/ now holds SFX only (click/coins/pop/…) plus 秘密のダンス. This is a
// STRING CONCAT, so the path sweep that repointed every literal `sounds/Dungeon/<file>` reference could
// not see these eleven; they were rewritten by hand. If you add a track here, put it in BG-OLD or give
// it its own prefix the way BG_FRENCH does.
const D = './assets/sounds/BG-OLD/';

// ── TRACKS ──────────────────────────────────────────────────────────────────── [REF#AU-00052]
// ⚠ NO SPACES IN MUSIC FILENAMES. Mark 2026-07-26: "fail, during hostile encounter no music played" — the three
// new tracks shipped as "Kabuki Duel.mp3" / "Marked Cards at Dawn.mp3" / "Twin Dice Moon.mp3", and a raw space
// in the URL meant the browser never fetched them. The Composer picked the right cue and the right track and
// then played silence, which is the worst possible failure mode: every headless assertion passed, because they
// all measured the DECISION and none of them measured whether the bytes arrived. Renamed with hyphens on his
// instruction ("just rename the files - remove the spacing manually add -"). Keep it that way, and note that
// scripts/probe-music-load.js now fails the build if any track the Composer can pick does not become playable.
export const TRACKS = {
    // HER FRENCH SONG JOINS THE BACKGROUND ROTATION (Mark 2026-08-07: "we will add this after the first [REF#AU-00053]
    // bg music is played ... just add it into the BG music rotation"). It lives in Songs/, not Dungeon/,
    // so it needs its own prefix — the three space-in-filename tracks that fell through on 07-26 were
    // right cue, right track, silence, purely because of a path assumption.
    BG_FRENCH:  './assets/sounds/Songs/Starlette-FrenchSong-\u6b4c\u306b\u606f.mp3',
    BG_PRIMARY: D + 'Underworld-ThemeSong-Taps.mp3',   // floor-1 primary (Mark 2026-07-25) [REF#AU-00054]
    BG_DEF:     D + 'The_Withered_Gate.mp3',
    BG_NEG:     D + 'BG-Music-Pilgrim.mp3',
    // PAST THE CABARET, THE DUNGEON GETS ITS OWN THEME (Mark 2026-07-28: "add this as background music [REF#AU-00055]
    // default after caberet"). See bgTrack() for where it takes over and why segment 1 is the line.
    BG_AFTER_CAB: D + 'BG-Phantasm.mp3',
    // DevilzDuel is the BOSS INTRO ONLY (Mark 2026-07-26: "devilduel = only play in boss intro"). SilentBlade [REF#AU-00056]
    // carries the boss FIGHT and also rides the ordinary combat rotation. Keeping the intro track exclusive is
    // what gives the reveal its own identity now that the rifts are shared with regular fights.
    // ── BOSS + SUPERVISOR = DEVILZDUEL, BOTH CUES (Mark 2026-08-13: "boss / supervisor music ==
    //    https://suno.com/s/cwBuHRW3j5HdcJHW"). That link is clip 4077e748-cc89-42fd-828b-7c27d124fea3
    //    at 212.240167 s — a millisecond match for DevilzDuel.mp3, already in the repo. His 07-26 split
    //    (DevilzDuel = intro only, SilentBlade = the fight) is superseded: one named track now carries
    //    the whole encounter, and SilentBlade moves to where he put it, ordinary combat.
    BOSS_INTRO: [D + 'DevilzDuel.mp3'],
    BOSS:       [D + 'DevilzDuel.mp3'],
    // GAMBLING — ORDER MATTERS (Mark 2026-07-26: "this will be the default gambling bg music, Marked Cards at [REF#AU-00057]
    // Dawn … while gambling, this and the other file Twin Dice Moon plays after in the rotation"). Marked Cards
    // is the DEFAULT and is index 0; the pool is walked in order per sit-down, not shuffled.
    GAMBLING:  [D + 'Marked-Cards-at-Dawn.mp3', D + 'Twin-Dice-Moon.mp3'],
    // CABARET BACKGROUND BED (Mark 2026-09-19: "make sure these are bg music for caberet ... pause [REF#PENDING] [REF#AU-00268]
    // interval 5 seconds between rotations", tagged "BG Cabaret"). Two NEW Suno tracks, separate from the
    // GAMBLING pool above (different share links, not the same audio as Marked-Cards-at-Dawn despite the
    // similar title) — files live in ./assets/audio/music/, not Songs/ or Dungeon/, so no D prefix.
    BG_CABARET: ['./assets/audio/music/BG_Cabaret_1.mp3', './assets/audio/music/BG_Cabaret_2.mp3'],
    // COMBAT — Mark 2026-07-26: "you know to play the 2 songs I gave you - during combat right? [REF#AU-00058]
    // assets/sounds/BG-OLD/SilentBlade.mp3". So the two rifts are FIGHT music, not boss-only; they rotate with
    // Kabuki Duel, one step per fight. ⚠ They are also the BOSS pool, which is deliberate on his instruction but
    // does mean a boss can arrive on a track the last skirmish already used — the volume (0.42 vs 0.50) and the
    // reveal's hard cut are what mark the boss out now, not an exclusive song. Say the word and the rifts go
    // boss-only again by dropping them from this line.
    // + MOONLIT PAPERCUT ×2 (Mark 2026-07-27: "in combat add these two in rotation … this way its more
    //   entertaining. Play them when a monster is hostile and on its way to player. Fade them to background
    //   when all is okay. They are cute enough to keep a player entertained."). The COMBAT gate already fires
    //   on hostilesNear (a hostile closing on the player, before the first swing), and the cue's 2.5s fadeOut
    //   + 5s tail already hand the floor back to the background smoothly — so the pool is the whole change.
    //   INTERLEAVED cute/rift/cute so back-to-back fights never draw two heavy rifts in a row (the rotation
    //   walks in order, one step per fight). Durations measured: 142.1s / 143.3s. NOT added to BOSS — the
    //   boss keeps its menace; these are skirmish charm.
    // ── COMBAT (Mark 2026-08-15: "this is the url of the combat song - fix it. use the other one in
    //    rotation with combat after this one is added" — https://suno.com/s/9AW1lpnISbWYxtZA) ─────────
    //    That short link resolves to the track titled **"Beneath the Crimson Moon"**.
    //
    //    ⚠ THE OLD NOTE HERE WAS WRONG AND IT COST MARK REAL PLAY TIME. It read:
    //        "Clip 26eb5955-…, 194.200167 s = SilentBlade.mp3 to the millisecond."
    //      That is a DURATION match presented as an identity proof, and DURATION EQUALITY IS NOT
    //      IDENTITY — this very file records two different filenames sharing that exact length
    //      (SilentBlade / BG-Phantasm), which disproves the method on its own evidence. Acting on it,
    //      the 08-13 pass pointed COMBAT at SilentBlade and dropped Kabuki-Duel and both Moonlit cuts.
    //      Mark then heard the wrong song in every fight until he said so on 08-15. Never fingerprint a
    //      Suno link by length; resolve the LINK TITLE and match the file by name.
    //
    //    ⚠ BeneathTheCrimsonMoon.mp3 IS NOT ON DISK YET. Mark owns the render; it has to be dropped at
    //      the path below. Until it lands, `npm run smoke:audio` reports it PENDING/404 (the same shape
    //      as Starlette-WINS.mp3 today) and `_dropDeadTrack` below removes it from the rotation at the
    //      first load error, so combat keeps playing SilentBlade instead of going silent. This repo has
    //      already shipped code pointing at never-added song files once — see `npm run gate:assets`.
    //
    //    ROTATION, per Mark's own sentence: "use the other one in rotation with combat AFTER this one is
    //    added". Both live in the pool; the COMBAT cue latches one pick per fight, so successive
    //    encounters alternate rather than the same track restarting every time.
    //    SILENTBLADE AND BG-PHANTASM ARE THE SAME AUDIO under two filenames — byte-different exports of
    //    one master. Do not "add variety" by putting BG-Phantasm back in this pool.
    //    Kabuki-Duel and the two Moonlit-PaperCut cuts remain out, on disk in BG-OLD/, one line from
    //    returning; see the DISABLED-FEATURES REGISTER entry in NewOrigami.Engine9.html.
    //    ── SILENTBLADE IS OUT OF COMBAT (Mark 2026-08-15, final: "you still have silent blade playing
    //       in combat ... put the correct song") ────────────────────────────────────────────────────
    //       BeneathTheCrimsonMoon.mp3 is STILL NOT ON DISK (checked: nothing new under assets/), so it
    //       cannot be pool[0] — a missing first entry throws a load error every fight and, via the dead
    //       -track guard, falls straight back to SilentBlade. Which is exactly what Mark keeps hearing.
    //       So combat returns to THE TRACKS MARK HIMSELF NAMED FOR COMBAT on 2026-07-27 ("in combat add
    //       these two in rotation"), which the bogus 194.2 s "fingerprint" deleted on 08-13. Both files
    //       exist. SilentBlade is removed from this pool outright — it is a BG/rift track and Mark has
    //       now said three times that it is the wrong song for a fight.
    //       ⚠ WHEN THE CRIMSON MOON RENDER LANDS at assets/sounds/Songs/BeneathTheCrimsonMoon.mp3, put
    //         it FIRST in this array and it becomes fight 1 with no other change (the rotation walks the
    //         authored order from index 0 — see startAnywhere:false on the COMBAT cue).
    // ══ COMBAT IS BG-PHANTASM. ONE SONG. (Mark 2026-08-17, his EIGHTH request — do not re-litigate) ══
    //    "bg phantasm should be the combat music song … this is 1 song, it will not be followed by
    //     another UNLESS COMBAT is still active."
    //    ⚠ ONE ENTRY, AND THE ARRAY STAYING LENGTH 1 *IS* THE FEATURE. The rotation walks this array;
    //      a second entry is what makes a fight hand over to a different song, which is precisely the
    //      behaviour he has now rejected eight times. Do not "restore" Moonlit-PaperCut / SilentBlade /
    //      Kabuki-Duel here — every one of those was authored by an earlier ruling that this supersedes.
    //    HOW "NOT FOLLOWED BY ANOTHER" IS ACTUALLY ENFORCED, so nobody has to trust the comment:
    //      · decks are created with `a.loop = true` (~:851, ~:908), so while the COMBAT gate holds, the
    //        one track simply repeats — that is "unless combat is still active".
    //      · when the gate drops, the cue loses the deck and fades over its 5 s fadeOut. Nothing is
    //        queued behind it: POST_COMBAT, the cue that used to bridge into a SECOND song, is off —
    //        see the DISABLED-FEATURES REGISTER entry dated 2026-08-17 at the top of Engine9.
    //    Live override still available for testing: window._combatMusicPool = [...].
    // Supersedes the one-song rule above: Mark requests the full combat BG rotation (2026-10-14).
    COMBAT:    ['BG-Phantasm.mp3', 'Kabuki-Duel.mp3', 'SilentBlade.mp3', 'DevilzDuel.mp3'].map(f => D + f),
};
// SECOND, NOT FIRST — Mark: "we will add this after the first bg music is played". The pool is walked in [REF#AU-00059]
// order, so position IS the schedule: the floor still opens on the Underworld theme and her French song
// comes up next.
// ── THE DUNGEON'S POOL IS DUNGEON MUSIC ONLY (Mark 2026-08-15: "The caberet sogns = only play in
//    caberet + legendary card") ────────────────────────────────────────────────────────────────────
//    BG_FRENCH IS REMOVED, and it should never have been here: it resolves to
//    ./assets/sounds/Songs/Starlette-FrenchSong-歌に息.mp3 — one of HER numbers, off the Songs/ folder,
//    with its own SRT and a place in her set list. Leaving it in the ambient rotation meant a cabaret
//    song could start playing to an empty corridor two sections away from the stage, which is exactly
//    the rule Mark is drawing. Her songs belong to the cabaret and to the legendary-card moment.
//    BG_AFTER_CAB (BG-Phantasm) JOINS instead — it is genuine dungeon ambience from BG-OLD/, it was
//    already the post-cabaret default, and folding it in keeps the bag at four so the shuffle still has
//    something to shuffle after the French song leaves.
const BG_POOL = [TRACKS.BG_PRIMARY, TRACKS.BG_DEF, TRACKS.BG_NEG, TRACKS.BG_AFTER_CAB];
// ── THE DUNGEON'S OWN FOUR, EXPOSED (Mark 2026-08-11: "only play the bg songs that are already in [REF#AU-00060]
//    caberet for idle song plays in rotation") ────────────────────────────────────────────────────
//    The engine needs this list to BUILD `window._bgMusicPool` = these four PLUS whichever quest songs
//    the player has returned to Starlette. It cannot hardcode a copy: two lists of the same four
//    filenames drift the first time one is edited, and a background track that exists in one and not
//    the other is silence with no error. Exported read-only for that one caller.
//    ⚠ This is the DEFAULT, not the live pool. Anything asking "what is actually in rotation right
//    now" must read `poolOf('_bgMusicPool', BG_POOL)`, which honours the override this feeds.
export const DEFAULT_BG_POOL = Object.freeze(BG_POOL.slice());

// ── knob readers (every one of these existed before; names are unchanged on purpose) ── [REF#AU-00061]
const num = (v, dflt) => (typeof v === 'number' && isFinite(v)) ? v : dflt;
const clamp01 = (v) => { const n = +v; return (isFinite(n) ? Math.max(0, Math.min(1, n)) : 0); };
const W = () => (typeof window !== 'undefined' ? window : {});
// segment 0 with the cabaret activated, player outside her room — the order and its date sit on UNEARNED_MUSIC below [REF#AU-00265]
// ⛔ SUPERSEDED 2026-10-08 evening by Mark: "make sure the heart is shown to be granted when sections are activated" — the heart opens when the
//    cabaret is live OR any room is activated (engine state roomsActivated), not the cabaret alone. Old rule: window._bgHeartCabaretOnly = true.
const heartOpen = (s) => W()._bgHeartAfterCabaret !== false && ((s.segmentId | 0) < 1)
                       && (s.cabaretLive === true || (W()._bgHeartCabaretOnly !== true && (s.roomsActivated | 0) > 0)) && s.inCabaret !== true;
// Master audio switch. TWO independent sources, both legacy and both still honoured: the chat-pill music icon [REF#AU-00062]
// (_bgMusicOn, Mark 2026-07-17) and the older programmatic mute (_setBgMusicMuted → _bgMusicMuted).
const masterOn = () => (W()._bgMusicOn !== false) && (W()._bgMusicMuted !== true);

// MUSIC TENSION (Mark 2026-09-06: "when the dungeon gets tense, the music gets heavier"). Oni-Baba's [REF#AU-00266]
// musicTension ∈ [0,1] arrives as window._musicTension, bridged from her outputs in Engine9's render tick.
// It MODULATES the BG bed by up to +25% and never gates it: Rule #1 (Mark 2026-08-20) — the music never
// stops. Pure function, exposed so a headless boot can falsify the mapping without reaching module scope.
const tensionMul = () => 1 + 0.25 * clamp01(num(W()._musicTension, 0));
try { W()._composerTensionMul = tensionMul; } catch (_) {}
// ── BG BED HALVED (Mark 2026-09-18: "the bg music -- please lower the volume by 50%, its too too [REF#PENDING] [REF#AU-00267]
//    loud for a bg music - its good") ────────────────────────────────────────────────────────────
// 0.125 → 0.0625. This fallback IS the shipped volume, not a safety net: window._bgMusicVol is
// undefined on a normal boot (COPY ALL reads "bgMusicVol undefined"), so every player heard
// 0.125 × tensionMul() — the diag's 0.126. Halving the default therefore halves what Mark hears,
// and the _bgMusicVol knob still overrides it for anyone who sets one.
// ⚠ Deliberately NOT capped by tension: tensionMul() still adds its up-to-+25% on top, so the
//   "music gets heavier when the dungeon gets tense" behaviour (Mark 2026-08-06) survives intact —
//   it is now heavier relative to a quieter bed, which is the point of a background bed.
// OUTSIDE-CABARET CUT (Mark 2026-09-19: "reduce bg music by 50% if outside caberet for all bg music [REF#PENDING]
// everywhere all the time"). ONE choke point: every ambient/bg-category cue reads ambVol() (SECTION_BG,
// POST_COMBAT) and bossVol() floors on it — so this reaches every bg track without a sweep, and does NOT
// touch combatVol()/gambleVol()/loungeVol(), which is correct: gambling/lounge/combat tracks play INSIDE
// the cabaret or during a fight, neither of which this order is naming. window._playerInCabaret() is the
// engine's own canonical presence check (Engine9.html ~:58286) — reused here rather than re-derived.
// Off: window._bgOutsideCabaretCut = false.
const _inCabaretNow = () => { try { return typeof W()._playerInCabaret === 'function' && W()._playerInCabaret() === true; } catch (_) { return false; } };
const ambVol    = () => clamp01(num(W()._bgMusicVol, 0.0625) * tensionMul() * ((W()._bgOutsideCabaretCut !== false && !_inCabaretNow()) ? 0.5 : 1));
const bossVol   = () => Math.max(ambVol(), clamp01(num(W()._bossMusicVol, 0.42)));
const levelWinVol = () => Math.max(ambVol(), clamp01(num(W()._levelWinMusicVol, 0.5)));
const roomSongVol = () => Math.max(ambVol(), clamp01(num(W()._roomSongVol, 0.55))) * clamp01(num(W()._roomSongFade, 1));   // the level the old sound-effect layer played at, × the walk-away fade (Engine9 room-song watcher, 2026-10-02) [REF#AU-00292]
const gambleVol = () => clamp01(num(W()._gambleMusicVol, 0.12));   // Mark: 12% [REF#AU-00063]
// The between-shows cabaret lounge plays the gambling tracks; its own knob so the room can be dialled [REF#AU-00064]
// separately from the felt without touching Mark's 12% for the table itself.
// ── THE INTERLUDE IS SPENT THE MOMENT ITS PASS ENDS (Mark 2026-07-30) ────────────────────────────────
// Mark: "there is a conflict of sounds happening upon entering caberet. there is intermission song that
// sometimes plays over the songs." MEASURED with scripts/probe-lounge-handoff.js: Marked Cards is audible
// over Starlette on every single handoff.
//
// THE ROOT CAUSE WAS THIS CUE'S ONLY EXIT. CABARET_LOUNGE's gate holds while `s.cabSongPlaying !== true`,
// so the interlude kept the floor at FULL volume until she was already singing — the exit condition was
// literally "she has started", which by construction means both are audible. Decks loop (mkAudio sets
// loop=true), so on wrap Marked Cards rolled straight into pass 2 while the engine's rest-release started
// her next set 1200 ms after the pass stamp; the authored 1800 ms fadeOut could not even finish inside
// that window.
//
// So the fix is at the source: once the single authored pass is stamped, this cue wants ZERO volume. The
// per-frame retarget in tick() then takes the `else ramp(act, want, 120)` branch — its documented
// "silence is never protected … off it goes, at the snappy rate, always" path — and the deck is inaudible
// roughly a second before she opens her mouth. Nothing here changes WHEN her set starts; it changes when
// the house band stops, which is what "Marked Cards once, then her next set" always meant.
//
// THE EPOCH HAS TO BE THE INTERLUDE, NOT THE SESSION. My first version compared the stamp against
// _cabSetEndedAt, and the lounge then never played at all: on a fresh boot _cabSetEndedAt is 0 until her
// FIRST set ends, so any stamp read as "already spent" forever. _cabSongQuietSince is the correct epoch —
// Engine9 zeroes it the moment her song plays and re-stamps it the moment she stops (~:10199), so every
// interlude gets a fresh, later timestamp. A pass belongs to the quiet period it happened in: stamp newer
// than the epoch ⇒ this interlude has had its one pass; she stops again ⇒ newer epoch ⇒ eligible again.
const _loungePassSpent = () => {
    const q = num(W()._cabSongQuietSince, 0);
    if (q <= 0) return true;          // she is singing right now — the interlude is over by definition [REF#AU-00065]
    return num(W()._cabLoungePassDone, 0) > q;
};
const loungeVol = () => (_loungePassSpent() ? 0 : clamp01(num(W()._cabLoungeVol, gambleVol())));
// OWN volume, NOT loungeVol — loungeVol is coupled to _loungePassSpent(), the Starlette-interlude's own [REF#AU-00269]
// one-pass-then-silence gate; reusing it here would zero CABARET_BG's volume off unrelated lounge state.
const cabaretBgVol = () => clamp01(num(W()._cabaretBgVol, 0.12));   // same order of magnitude as gambleVol's 0.12 [REF#AU-00270]
// PROXIMITY LOUDNESS (Mark 2026-07-27: "decrease volume for combat if its distance, but increase the volume [REF#AU-00066]
// the closer the monster is — louder than normal when monsters are next to player"). The engine's composer
// state scan publishes window._nearestHostileTiles every frame (Engine9 ~9502); this curve maps it:
//   at/beyond _combatVolFarTiles (12, the combat-music radius) → base × _combatVolFarScale (0.55, distant drums)
//   at/inside _combatVolNearTiles (1.5, breathing distance)    → base × _combatVolNearScale (1.35 → 0.675 —
//   genuinely LOUDER than the normal 0.50, clamped at 1.0)
// Linear between the two; both switchTo and the per-frame ramp call vol() live, so the swell tracks the
// monster's approach continuously through the existing 120ms ramp. No distance published → plain base.
// Off: window._combatProximityVol = false.
const combatVol = () => {
    const base = clamp01(num(W()._combatMusicVol, 0.50));   // Mark: 50% [REF#AU-00067]
    if (W()._combatProximityVol === false) return base;
    const d = num(W()._nearestHostileTiles, NaN);
    if (!isFinite(d)) return base;
    const far  = num(W()._combatVolFarTiles, 12), nearT = num(W()._combatVolNearTiles, 1.5);
    const t = clamp01((far - d) / Math.max(0.001, far - nearT));   // 0 = far edge, 1 = beside the player [REF#AU-00068]
    const quiet = num(W()._combatVolFarScale, 0.55), boost = num(W()._combatVolNearScale, 1.35);
    return clamp01(base * (quiet + (boost - quiet) * t));
};

// ── A TRACK THAT WILL NOT LOAD LEAVES THE ROTATION (2026-08-15) ───────────────────────────────────── [REF#AU-00069]
//    A pool entry pointing at a missing file used to be fatal to its cue: the deck gets a src that 404s,
//    nothing ever plays, and the cue holds the floor in silence. That is worse than the wrong song,
//    which is the bug this session was already about. It is not hypothetical either — this repo has
//    shipped code referencing never-added song files before (`npm run gate:assets`), smoke:audio
//    currently reports one such PENDING 404, and TRACKS.COMBAT now names a file Mark has yet to drop in.
//    `_dropDeadTrack(url)` is called from the deck's error handler; the URL is filtered out of every
//    pool from then on, so the cue falls through to the next track instead of going quiet. In-memory
//    only: a reload re-tries, so dropping a file in fixes it with no code change.
//    Inspect / clear: window._deadMusicTracks (a Set of URLs).
const _deadTracks = () => (W()._deadMusicTracks instanceof Set) ? W()._deadMusicTracks : (W()._deadMusicTracks = new Set());
const _dropDeadTrack = (url) => {
    if (!url) return;
    const s = _deadTracks();
    if (s.has(url)) return;
    s.add(url);
    try { console.warn('[COMPOSER] track will not load, dropped from rotation: ' + url + ' (reload retries it)'); } catch (_) {}
};
const poolOf = (override, dflt) => {
    const p = W()[override];
    const base = (override === '_bgMusicPool' && Array.isArray(p)) ? p : ((Array.isArray(p) && p.length) ? p : dflt);
    const dead = _deadTracks();
    if (!dead.size) return base;
    const live = base.filter(t => !dead.has(t));
    // NEVER hand back an empty pool: an empty pool makes the cue unwinnable and the score silently [REF#AU-00070]
    // falls through to section BG. If every entry is dead, keep the original list and let the deck
    // keep failing loudly rather than turn a broken asset into a mystery missing cue.
    return live.length ? live : base;
};
const bossPool      = () => poolOf('_bossMusicPool',      TRACKS.BOSS);
const bossIntroPool = () => poolOf('_bossIntroMusicPool', TRACKS.BOSS_INTRO);
// THE LEVEL WIN + ITS ENCORE (Mark 2026-09-26) — Engine9 `THE LEVEL WIN` drives window._levelWinPhase; files dropped by Mark. [REF#AU-00285]
const levelWinPool    = () => poolOf('_levelWinMusicPool',    ['./assets/music/win/LEVEL_WIN.mp3']);
// THE MANAGER'S OWN SONG (Mark 2026-09-26: "he gets his own song remember? play that") — BOSS by The Anomaly, dropped by Mark. [REF#AU-00286]
const managerPool     = () => poolOf('_managerMusicPool',     ['./assets/music/boss/BOSS.mp3']);
const roomSongPool    = () => { const R = W()._roomSong; return (R && typeof R.src === 'string') ? [R.src] : []; };   // the activated room's own file (Engine9 _playPermitActivationCue) [REF#AU-00293]
const levelEncorePool = () => poolOf('_levelEncoreMusicPool', ['./assets/music/win/ENCORE.mp3']);
const gamblePool = () => poolOf('_gambleMusicPool', TRACKS.GAMBLING);
// Cabaret has no worker house-band bed; only Starlette's own song may play there. [REF#AU-00318]
// ⛔ SUPERSEDED 2026-10-19 by Mark: "play once than the BG caberet MARKED CARDS AT DAWN/DUSK" — the cabaret bed is back: Marked Cards at Dawn
//    (only a Dawn file exists in assets/sounds/BG-OLD). Override: window._cabaretBgMusicPool; off: window._cabaretBg = false.
const cabaretBgPool = () => poolOf('_cabaretBgMusicPool', [D + 'Marked-Cards-at-Dawn.mp3', D + 'Marked-Cards-at-Dusk.mp3']);   // Dawn, then Dusk (2026-10-20, Mark: "marked cards at dusk after ... marked cards at dawn") — the Dusk file is not in the repo yet; poolOf drops a dead file until it lands [REF#AU-00319]
// ── THE CABARET LOUNGE GETS HER SONG BACK (Mark 2026-08-16, with the Suno link for 歌に息: [REF#AU-00071]
//    "add this to caberet bg music song rotations") ──────────────────────────────────────────────
//    BG_FRENCH resolves to Starlette-FrenchSong-歌に息.mp3 — the track pulled out of BG_POOL on
//    08-15 because a cabaret song has no business in the DUNGEON rotation. That removal left it an
//    ORPHAN: still declared at ~:59, referenced only by comments, in no pool at all. This is where it
//    always belonged — the between-shows house band, inside the room it was written for.
//    DELIBERATELY THE LOUNGE ONLY, NOT gamblePool ITSELF. The felt (GAMBLING, pri 500) shares that
//    pool, and Mark's 07-26 ruling for the table is Marked Cards at Dawn first, then Twin Dice Moon;
//    dropping a vocal number into it would also fight the "do not supersede Starlette's song" rule
//    that cue already carries. The lounge cannot talk over her either — its gate holds only while
//    `s.cabSongPlaying !== true`, so this plays BETWEEN her live sets, never across one.
//    Override the whole lounge rotation with window._cabLoungePool.
const loungePool = () => [];
// COMBAT POOL (Mark 2026-07-26 ruling: "new tracks coming — I'll add them"). Kabuki Duel is the first; more [REF#AU-00072]
// go in window._combatMusicPool. An EMPTY pool makes the cue unwinnable, so the score falls through to the
// section BG exactly as before — the feature is inert rather than guessing at a placeholder track.
const combatPool = () => poolOf('_combatMusicPool', TRACKS.COMBAT);

// The post-combat bridge is a single full pass, never a section/room ambience choice. Combat may return [REF#AU-00073]
// while it plays, but it waits for this pass to finish before taking the deck back.
const postCombatTrack = () => {
    const t = W()._bgAfterCombat;
    return (typeof t === 'string' && t) ? t : TRACKS.BG_AFTER_CAB;
};

// BG pick: per-SECTION table first (Mark 2026-07-26 "per ring-section — I'll give the mapping"), then the [REF#AU-00074]
// per-floor rotation as the fallback, so a PARTIAL mapping is safe — an unmapped section id still gets a
// track. The karma selector stays available behind its original opt-in knob.
function bgTrack(s) {
    const bySec = W()._bgBySection;
    if (bySec && typeof bySec === 'object') {
        const t = bySec[s.segmentId];
        if (typeof t === 'string' && t) return t;
    }
    if (W()._bgMusicKarmaSelect === true) {
        const cfg = W()._bgMusicByKarma || {};
        return (num(s.karma, 0) < 0) ? (cfg.neg || TRACKS.BG_NEG) : (cfg.def || TRACKS.BG_DEF);
    }
    // ── AFTER THE CABARET, THE DUNGEON HAS ITS OWN VOICE (Mark 2026-07-28: "add this as background music [REF#AU-00075]
    //    default after caberet : assets/sounds/BG-OLD/BG-Phantasm.mp3") ────────────────────────────────
    // WHY segmentId >= 1 IS "after the cabaret", and not a proximity test or a door latch: every floor is
    // built as a HEAD and a BODY. The head is segment 0 — room 0, room 1, the konbini and the cabaret
    // (CLAUDE.md: "topology = BODY past the cabaret east door ONLY"), and the east door tagged
    // isDungeonExit is the ONLY way out of it. So crossing into segment 1 IS having gone through the
    // cabaret; there is no other path, and the flag is already published by the engine adapter
    // (Engine9 ~9724, off window._activeSegmentId). A door-latch flag would have needed a new writer for
    // the same information, and a proximity radius around the cabaret is the exact shape that already
    // misfired twice — see the loaded-gun warning on nearCabaret at Engine9 ~9638.
    // PRECEDENCE, deliberately third: an explicit _bgBySection entry still wins (that table is a mapping
    // Mark authored per section), and the karma selector still wins when he opts into it. This only
    // replaces the per-FLOOR rotation, which now describes the head — the entrance hall keeps
    // Underworld-ThemeSong-Taps, and the dungeon proper picks up Phantasm the moment you walk out.
    // Off: window._bgAfterCabaret = false → the old rotation everywhere. Swap it: window._bgAfterCabaret
    // = './assets/sounds/Dungeon/whatever.mp3'.
    if (num(s.segmentId, 0) >= 1 && W()._bgAfterCabaret === true) {
        const t = W()._bgAfterCabaret;
        return (typeof t === 'string' && t) ? t : TRACKS.BG_AFTER_CAB;
    }
    // ── RANDOM, NO REPEATS, THEN LOOP (Mark 2026-08-15: "bg music activates within the sections 1-4 [REF#AU-00076]
    //    random, dont repeat - just loop") ─────────────────────────────────────────────────────────
    //    A SHUFFLE BAG, not a modulo and not Math.random() per pick. The old line was
    //    `pool[(lvl - 1) % pool.length]` — one fixed track per FLOOR, so a whole floor had a single
    //    ambient piece and floors 1 and 5 were identical. Plain random would satisfy "random" and
    //    break "dont repeat": it can hand you the same track three sections running.
    //    The bag draws every track once in random order, then reshuffles — so across four sections you
    //    hear four different pieces, the order changes each run, and it loops forever. On reshuffle the
    //    first track of the new bag is not allowed to equal the last of the old one, which is the only
    //    place a back-to-back repeat could still sneak in.
    //    Off: window._bgShuffle = false → deterministic walk of the authored order.
    const pool = _bgPoolEarned();
    if (!pool.length) return (W()._bgEarnedOnly !== true && _earnedTrack(TRACKS.BG_PRIMARY)) ? TRACKS.BG_PRIMARY : null;
    if (W()._bgShuffle === false) { _bgBagSeq = (_bgBagSeq + 1) % pool.length; return pool[_bgBagSeq]; }
    if (!_bgBag.length || _bgBagKey !== pool.join('|')) {
        _bgBagKey = pool.join('|');
        _bgBag = pool.slice();
        for (let i = _bgBag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = _bgBag[i]; _bgBag[i] = _bgBag[j]; _bgBag[j] = t; }
        if (pool.length > 1 && _bgBag[_bgBag.length - 1] === _bgLastDrawn) { const t = _bgBag[_bgBag.length - 1]; _bgBag[_bgBag.length - 1] = _bgBag[0]; _bgBag[0] = t; }
    }
    _bgLastDrawn = _bgBag.pop();
    return _bgLastDrawn;
}
// THE DUNGEON'S OWN MUSIC IS EARNED (2026-09-29, songs v2 — the register entry at the top of Origami.RealityEngine.9.html): the [REF#AU-00294]
// section score draws only from tracks whose card the player has handed in (the engine's window._songEarnedTrack). The four house
// tracks are not cards and stay silent; a background song joins the bag the moment its card comes home. Nothing earned = the
// section stays quiet (SECTION_BG does not win). SINCE THE MUSIC ROLES (same day) the section pool is the SECTION BG role and plays free:
// earned-only is opt-in again, window._bgEarnedOnly = true.
function _bgPoolEarned() {
    const p = poolOf('_bgMusicPool', BG_POOL).filter(_earnedTrack);
    if (W()._bgEarnedOnly !== true) return p;
    const f = W()._songEarnedTrack;
    return (typeof f === 'function') ? p.filter(t => { try { return f(t) === true; } catch (_) { return false; } }) : p;
}
// Shuffle-bag state for bgTrack. Module scope so it survives across section changes; re-seeded whenever [REF#AU-00077]
// the pool itself changes (a returned song, a knob) via the joined-key check above.
let _bgBag = [], _bgBagKey = '', _bgLastDrawn = null, _bgBagSeq = -1;

// Hold the chosen ambient track for the whole section. Room/hallway changes are not musical scene changes; [REF#AU-00078]
// only a genuine section transition is allowed to select a new ambient track, and POST_COMBAT must finish
// before SECTION_BG is considered again.
let _bgSectionId = null;
let _bgSectionTrack = null;
function stableBgTrack(s) {
    const id = Number.isFinite(Number(s.segmentId)) ? (Number(s.segmentId) | 0) : 0;
    if (_bgSectionTrack == null || _bgSectionId !== id || W()._jukeboxRecordAlreadyPlayed?.(_bgSectionTrack)) {
        _bgSectionId = id;
        _bgSectionTrack = bgTrack(s);
    }
    return _bgSectionTrack;
}

// ── CUE TABLE ──────────────────────────────────────────────────────────────── [REF#AU-00079]
// pri: higher wins. dwell: ms this cue is immune to replacement once started.
// silent: the cue's job is to SHUT THE DECK UP (the room's own audio owns the space).
// latchKey: cues sharing a key share one latched track — BOSS_REVEAL → BOSS demotes without changing song.
//
// ── FADE LENGTHS (Mark 2026-07-26: "music changes too abruptly fade it") ──────────────────────────────────
// The first cut of this table used 400-900 ms fades, which is a *cut* by musical standards — long enough to
// avoid a speaker click, far too short to read as a transition. These are now measured in SECONDS. Dial the
// whole table at once with window._musicFadeScale (1 = as authored, 2 = twice as slow, 0.5 = snappier); any
// single cue can still be overridden by editing its own fadeIn/fadeOut here.
// The ONE deliberate exception is BOSS_REVEAL's fadeIn: it is a hard cut because it lands on a CAMERA cut.
// Soften it with window._bossRevealHardCut = false.
//
// ── SUPERSEDED 2026-08-20 — SEE "THE MUSIC NEVER STOPS" BELOW ─────────────────────────────────────────
// (2026-08-08) "fade out 5sec - no abrupt cutoffs - ease 5 second fade in fade out transitions please."
// Every authored fade became 5000 ms. That order stood for twelve days and is now halved; the reasoning
// about rampOver() below is unchanged and still load-bearing.
//
// ══ THE #1 RULE: THE MUSIC NEVER STOPS (Mark 2026-08-20) ══════════════════════════════════════════════
// "mandatory that music never shuts down, fade out 2.5 seconds always for all music is #1 rule."
// He named it rule ONE, so it outranks every duration decision recorded in this file. Two clauses, and
// the first is the one that changes behaviour rather than numbers:
//
//   A. MUSIC NEVER SHUTS DOWN. The gap between tracks is now ZERO (see gapMs below) — the outgoing and
//      incoming decks OVERLAP again, which is what this engine did before the 07-27 "5 second pause"
//      order. There is no longer any moment in a track change when nothing is audible. silenceNow()
//      likewise no longer slams the decks to zero; it starts a 2.5 s ramp on the same tick.
//   B. EVERY FADE-OUT IS 2500 ms. No exceptions left in this table — GUIDEBOOK and CABARET_HUSH both
//      carried `fadeOut: 0`, and a zero-length fade-out is precisely the "abrupt cutoff" the rule bans.
//      Their old rationales are answered rather than ignored, in the note on each cue.
//      ⛔ SUPERSEDED 2026-09-04 — clause B NO LONGER HOLDS AS WRITTEN. Two cues now carry a shorter
//         fade-out by a later order: CABARET_HUSH (800, the cabaret-door change) and the COMBAT-EXIT
//         path (800, applied at the transition site ~:1415 rather than in this table). Retired here
//         because clause B names CABARET_HUSH BY NAME as having no exception, and a table-level
//         invariant that its own table violates is the kind of claim a later seat "restores" as a fix.
//      ⭐ WHAT CLAUSE B WAS ACTUALLY PROTECTING SURVIVES INTACT, and it is the reason 800 is not a
//         regression to what it banned: the banned value was ZERO — a cut. This cue's history is
//         0 → 2500 → 800, and only the first of those is a cut. 800 ms is audibly a fade; the new
//         order asks for the change to be FAST and explicitly not abrupt, which is the same distinction
//         clause B drew, resolved at a different point on the same axis.
//      ⚠ DEF_FADE STAYS 2500 and every other cue in this table stays 2500, so "a transition elsewhere
//         still crossfades at 2500" remains true and is the control for both shortened paths.
//
// fadeIn moves to 2500 with it. Mark named the fade-OUT, but a 2500 out against a 5000 in leaves the
// crossfade summing to a dip in the middle — the level sags where the two decks meet, which is heard as
// the music briefly dropping away. That is clause A's failure mode, reached by honouring clause B alone.
//
// ONE VALUE IS STILL ZERO AND MUST STAY ZERO:
//     BOSS_REVEAL.fadeIn  — lands on a CAMERA cut; a fade here reads as a mistake, not a transition.
//                           It is a fade-IN, so clause B does not reach it; its fadeOut is 2500.
//
// ⚠ THIS ONLY MEANS ANYTHING BECAUSE rampOver() EXISTS. Before it, `ms` was the time for a full 0→1
//   sweep, so a fade lasted only as long as the DISTANCE it travelled — the ambient deck sits at 0.125,
//   so an authored 2400 ms fade really took ~300 ms, and the quieter the deck the bigger the lie. That
//   was the actual source of "music changes too abruptly". Writing 5000 here without rampOver would have
//   bought roughly 600 ms of real fade and Mark would have reported the same complaint a third time.
//
// ⚠ WHAT "EASE" DOES AND DOES NOT MEAN HERE. These fades are LINEAR IN GAIN over five seconds. A true
//   eased curve (smoothstep on fade progress) was scoped and deliberately NOT shipped: the integrator is
//   rate-based, and the per-frame retarget below (~:990) deliberately MOVES `goal` mid-fade while
//   protecting the rate. Under a time-parameterised eased interpolation, moving the goal mid-fade makes
//   gain jump discontinuously — a click, in the exact code path that serves the cabaret and the Paris
//   memorial. Doing it properly means re-seeding from/duration on every retarget, which is a real change
//   to a system with documented subtle interactions, not a one-liner. Flagged to Mark rather than
//   half-built. At five seconds the linear ramp is already well under the threshold where the corner is
//   audible; the abruptness he heard was duration, not curve.
// ⛔ SUPERSEDED 2026-09-19 — Mark, re-asked "everywhere" when offered the narrower "FX-duck only" scope
// for a new request ("fix music ... fade out any previous before new one is done in bg for .5 sec"):
// rule #1's 2500ms is retired for EVERY ordinary transition, not just the new FX-duck feature below.
// Rule #1's OTHER clause (music never hard-cuts, the gap between tracks is zero) is untouched — this
// only shortens the ramp, it does not reintroduce a silent gap. BOSS_REVEAL.fadeIn stays 0 — that is a
// deliberate hard cut on a camera cut, not a duration, and this order does not reach it.
const DEF_FADE = 500;   // Mark 2026-09-19 — was 2500 (08-20 rule #1), was 5000 (08-08), was ~400-900ms before 07-26 [REF#AU-00080]
const fadeScale = () => Math.max(0.05, num(W()._musicFadeScale, 1));

// ── THE REST BETWEEN SONGS (Mark 2026-07-27: "make sure between any music switch there is a 5 second pause [REF#AU-00081]
//    and a soft fade out and fade in between tracks") ──────────────────────────────────────────────────────
// Until now every track change was a CROSSFADE — the outgoing deck ramped down WHILE the incoming one ramped
// up, so two songs overlapped and the ear never got a seam. He wants a seam: the old track fades out, the
// room goes QUIET for five seconds, then the new one fades in. The transition is therefore SEQUENCED, not
// simultaneous, and the `pend` record in createComposer is its second half waiting on the clock.
//   window._musicGapMs = 5000  · the rest itself. 0 restores the old overlapping crossfade exactly.
//   window._musicGapAll = true · force the rest onto the exempt cues too (see the third rule).
// Three rules keep it from turning into dead air (all enforced in switchTo — see the comments there):
//   · THE REST IS ONLY OWED WHEN SOMETHING WAS AUDIBLE. Measured off the live deck gain, not the cue table.
//   · AT MOST ONE REST PER TRANSITION. A gate that changes its mind mid-rest retargets, never re-queues.
//   · A CUE MARKED noRest DOES NOT WAIT. The rest marks a change of PLACE; cues that answer an EVENT —
//     COMBAT ("starts too slow, should start immediately but fade in") and BOSS_REVEAL (a camera cut) —
//     come up at once and lean on their fadeIn instead. Leaving those cues still rests, which is the seam
//     Mark actually asked to hear.
// HALVED (Mark 2026-08-07: "when mortal skies is finished playing, what is the length pause between that
// and her background song? shorten that by 50%"). 5000 -> 2500. NOTE the pause he hears is NOT this alone:
// the queue is `at: now + fadeOut + gapMs()` (~:870), so after one of her songs it is the outgoing cue's
// fadeOut PLUS this. With SECTION_BG's 2400 ms fade that was ~7.4 s of near-silence; it is now ~4.9 s.
// Halving the fade too would clip her last note, so only the dead air was cut. Knob: window._musicGapMs.
// ── AND THEN IT WENT TO ZERO (Mark 2026-08-20): "mandatory that music never shuts down" ──────────────
// This constant IS the silence. Every clause above describes tuning the LENGTH of a hole in the music;
// rule #1 says there is not to be a hole. 2500 → 0, which this file's own note above already documents
// as the exact restoration of the overlapping crossfade: "0 restores the old overlapping crossfade
// exactly." So this is not a new mode, it is the mode that predates the 07-27 seam order.
// WHAT MARK WILL HEAR: the outgoing track ramps down over its 2500 ms fadeOut WHILE the incoming one
// ramps up over its 2500 ms fadeIn. The two overlap for the whole 2.5 s and the room is never quiet.
// Put the seam back with window._musicGapMs = 2500 (or any ms) — the rest machinery below is untouched
// and still works; it simply has nothing to wait for at 0.
const gapMs = () => Math.max(0, num(W()._musicGapMs, 0));
// "Is the deck actually making sound?" — the audibility floor. applyGain() pauses a deck below 0.0001, so [REF#AU-00082]
// anything above this is a song a listener can hear being cut off, and a song being cut off is what earns
// the five seconds. Kept well above the pause threshold so a deck mid-fade-out still counts as playing.
const REST_EPS = 0.004;

const CUES = [
    // ── MUSIC IS EARNED, NOT ISSUED (Mark 2026-07-31) ─────────────────────────────────────────── [REF#AU-00083]
    //    "now be careful about all bg music - for now I want all BG music shut off, this is a music
    //     game, the user will have to do things to get the music, like finding it on the ground - so
    //     prepare to add those cards in TODOS for all bg music to be found."
    //
    //    This is a GENRE DECISION, not a mix note, and it is why the switch lives here rather than in
    //    any one cue. Everything below this line — the section theme, the fight song, the gambling
    //    rotation, the boss rift, the between-shows house band — is music the engine STARTS BY ITSELF
    //    because of where the player is standing. In a game whose whole subject is finding music, a
    //    dungeon that hands you a soundtrack for free is arguing against its own premise. So the deck
    //    is silent until a track has been earned, and silence becomes the default state of the world.
    //
    //    ⚠ WHAT THIS DOES **NOT** TOUCH, and the reason it is safe: the quest songs do not play through
    //    this deck. Starlette's transport is its own <audio> element (window._succubusSong, governed by
    //    _cabSongGain at Engine9 ~:10644); the Composer owns only window._bgMusicEl. Silencing every cue
    //    in this array therefore cannot mute a song the player went and found — which is the ONLY music
    //    that should be audible right now. Verified by construction: no cue below has a `track` that
    //    resolves to a SongCatalog quest file.
    //
    //    ⚠ NOT window._bgMusicOn = false. That flag is the input-field master mute and _cabSongGain
    //    reads it too (Engine9 :10644 returns 0 on it), so using it would silence the found songs as
    //    well — the exact opposite of the instruction. A separate switch is not tidiness here, it is the
    //    difference between "no free music" and "no music".
    //
    //    THE SHAPE THIS GROWS INTO. Each BG track becomes a findable card, so this blanket gate is a
    //    placeholder for a PER-TRACK one: when the loot side lands, the gate becomes "is the track this
    //    cue wants unlocked?" and cues whose track has been found start passing again, one at a time,
    //    as the player earns them. Written as a single top-of-array gate precisely so that change is one
    //    function and not an edit to eight cues.
    //
    //    Fades rather than cuts (2400 ms, matching SECTION_BG's own fadeOut) so flipping the switch on a
    //    running deck is a curtain, not a dropout. Re-enable everything: window._bgMusicEarned = true.
    //    ⚠ THE CUE ITSELF NO LONGER LIVES HERE — it was moved BELOW COMBAT on 2026-08-13 so the fight is
    //      never silenced. See the entry just after COMBAT (~:540) for why. This doc comment stays put
    //      because it explains the _bgMusicEarned policy, which is unchanged for everything ambient.

    // ── THE DEATH SCENE HAS ITS OWN MUSIC (2026-09-28: "We need to play the BG Caberet song - its solemn and sad when death scene [REF#AU-00295]
    //    appears") ── the cabaret bed (BG_Cabaret_1/2) over the slow overhead rise, louder than the room bed so it carries the scene.
    //    Sits ABOVE SILENCE because array order is the priority (see the note under CABARET_DARK). Off: window._deathSong = false
    //    (SILENCE takes the death again, as it did from 2026-07-26). Volume: window._deathSongVol (0.35).
    { id: 'DEATH', pri: 950, dwell: 0, fadeIn: 1500, fadeOut: DEF_FADE, restart: true, noRest: true,
      latchKey: 'death', vol: () => clamp01(num(W()._deathSongVol, 0.35)), pool: cabaretBgPool,
      gate: s => s.playerDead === true && W()._deathSong !== false },
    // Death is a long, graceful dissolve — not a switch being thrown. [REF#AU-00084]
    // ⛔ SUPERSEDED 2026-09-28 for the death half: the DEATH cue above plays the cabaret bed; this silence keeps only the blocked case
    //    and the opt-out. (Mark 2026-07-26 "when dead - stop playing music" → 2026-09-28 "play the BG Caberet song … when death scene appears".)
    { id: 'SILENCE', pri: 900, silent: true, dwell: 0, fadeOut: DEF_FADE,
      gate: s => (s.playerDead === true && W()._deathSong === false) || s.blocked === true },

    // ── A CABARET THAT HAS NOT BEEN SWITCHED ON MAKES NO SOUND AT ALL ─────────────────────────── [REF#AU-00085]
    //    Mark 2026-07-31: "no songs will play in caberet until it lights up. not even BG music.
    //    the caberet is the heart of music itself."
    //
    //    WHY THIS EXISTS WHEN THE ROOM ALREADY MEASURES SILENT. It does — scripts/probe-cabaret-silence.js
    //    walks a player into the dark room and reads a peak volume of 0 across every Audio element on the
    //    page, against a control that hears the dungeon theme at 0.125. But that silence is an ACCIDENT of
    //    three unrelated facts, and each of them can be true one day and false the next:
    //      · ROOM_OWNED (400) stands the deck down inside the cabaret — but GAMBLING (500) sits at a felt
    //        that is IN this room and outranks it, so a player who sat down would hear the casino rotation
    //        in a room Mark has described as "total silence".
    //      · BOSS (700) and BOSS_REVEAL (800) outrank it too, and neither knows what a permit is.
    //      · CABARET_LOUNGE (450) is held out only by s.cabSongEver — a flag about whether she has ever
    //        sung, which happens to be false here. Nothing states the room must be quiet; it just is.
    //    A rule that holds by coincidence is a rule that regresses without anything going red. This cue
    //    states it once, at the top of the stack, so no future cue can be written that outranks the dark.
    //
    //    ⚠ ARRAY ORDER IS THE REAL PRIORITY. arbitrate() breaks on the FIRST cue whose gate passes; `pri`
    //    is consulted only for the dwell comparison below it. (Proof it is not merely sorted: BOSS_REVEAL
    //    at 800 is authored ABOVE GUIDEBOOK at 850 and genuinely outranks it.) So this sitting second in
    //    the array — under SILENCE, over everything else — is what makes it binding, not the 870.
    //
    //    IT OUTRANKS THE BOSS CINEMATIC, DELIBERATELY. "Not even BG music" admits no exception, and the
    //    case is unreachable in practice: the dark cabaret only exists before the CABARET permit is found,
    //    which is floor 1's opening, and a boss reveal needs a boss within 15 tiles. Stated rather than
    //    left to be discovered. The one cue above this is SILENCE (death), which is silent anyway — so
    //    there is no ordering here that changes what a player hears.
    //
    //    FADES, NEVER CUTS (Mark 2026-07-27: "make sure to fade music volume, no abrupt changes"). 2600 ms
    //    matches ROOM_OWNED's curtain, so crossing the threshold into a dead room is the dungeon receding
    //    rather than the sound dropping out. dwell 600 stops the doorway flapping the deck.
    //    The gate reuses s.nearCabaret — "inside the room, OR at a door you could actually walk through"
    //    — rather than inventing a second radius; that field already carries the cabaret approach
    //    semantics the pre-fade was tuned on.
    //    Off: window._cabaretDarkMusic = false — THIS CUE ALONE, which is not the same as
    //    window._cabaretDormancy = false. That one makes the room count as switched ON, and then
    //    ROOM_OWNED silences the deck anyway, so it cannot A/B this cue: both arms come back silent and
    //    the comparison convicts nobody. The separate knob is what lets probe-cabaret-silence.js show
    //    the leak (gambling audible in a dead room) and then show it closed.
    // ── JUKEBOX (2026-10-02): a dropped-off song card playing in the cabaret overrides every other music — fights, room songs,
    //    the boss, the Manager, the beds. Only DEATH and SILENCE sit above it. Her gain is 1 under it (cabSongAllowed).
    //    The engine keeps window._jukeboxNowPlaying. Off: window._jukeboxOverride = false.
    { id: 'JUKEBOX', pri: 880, silent: true, dwell: 0, fadeOut: DEF_FADE,
      gate: () => W()._jukeboxOverride !== false && W()._jukeboxNowPlaying === true && W()._cabInsideNow === true },

    { id: 'CABARET_DARK', pri: 870, silent: true, dwell: 600, fadeOut: DEF_FADE,
      gate: s => s.cabaretDark === true && W()._cabaretDarkMusic !== false
              && (s.inCabaret === true || s.nearCabaret === true) },

    // ── SHOWTIME — THE MANAGER'S LEGENDARY SHOW (2026-10-01, knowledge/design/SHOWTIME_2026-10-01.md) ────────────────── [REF#AU-00296]
    //    His own song, BOSS.mp3 (the MANAGER cue's pool), from the top, for as long as the engine holds
    //    window._showtimeSongOn: the legendary has finished, the confetti is out, and his show runs until the player
    //    answers it (close, purchase) or it is decided (the wager's hand, the duel's last blow, either death).
    //    AUTHORED ABOVE BOSS_REVEAL ON PURPOSE. Array order is the priority here (the walk takes the first open gate),
    //    and the show opens the boss-reveal overlay as its stage; below BOSS_REVEAL the overlay's own cue would take the
    //    deck and restart a different pool on the cut. Above it, one song plays from the confetti to the choice.
    //    Below DEATH, SILENCE and CABARET_DARK: a player death still takes the floor, and a dark cabaret cannot host one.
    //    Her song is held out while this plays (cabSongAllowed answers 0 for it) — one song at a time.
    //    Off: window._showtime = false (the 2026-09-29 stage number and its proximity music come back).
    { id: 'SHOWTIME', pri: 860, dwell: 0, fadeIn: 300, fadeOut: DEF_FADE, restart: true, noRest: true,
      latchKey: 'showtime', vol: bossVol, pool: managerPool,
      gate: () => W()._showtimeSongOn === true && W()._showtime !== false },

    // The cinematic. Hard cut, restart at 0:00 (Mark's ruling). NO DWELL — and that is deliberate: priority 800 [REF#AU-00086]
    // plus the gate already mean nothing can demote this while _bossRevealActive holds on PRESS ANY KEY, and the
    // deck's own loop=true is what replays the whole song for as long as the player leaves the shot parked. An
    // earlier version used dwell:Infinity here and it WEDGED (measured): dwell outlives the gate by design, so
    // once the player dismissed the reveal the cue could never be replaced and the rift played forever.
    // ⚠ ITS OWN POOL AND ITS OWN LATCH. Mark 2026-07-26: "devilduel = only play in boss intro". Sharing the
    //    'boss' latch with the BOSS cue is what used to make the reveal hand its track straight to the fight —
    //    correct when they were one pool, wrong now that the intro track is exclusive. On dismiss the deck
    //    crossfades from DevilzDuel to the boss's own SilentBlade, which SUPERSEDES the earlier "dismiss keeps
    //    the same song, playhead continuing" ruling for the boss specifically.
    // noRest — it lands on a CAMERA cut, and the whole point is that there is no seam. (See THE REST.)
    { id: 'BOSS_REVEAL', pri: 800, dwell: 0, fadeIn: 0, fadeOut: DEF_FADE, restart: true, noRest: true,
      latchKey: 'bossIntro', vol: bossVol, pool: bossIntroPool,
      gate: s => s.revealActive === true },

    // A guidebook is a cognitive handoff, not another room cue. The deck must be silent while the [REF#AU-00087]
    // player reads; the engine's WELCOME_GUIDE_OPEN listener also hard-stops both decks immediately.
    // fadeOut 0 → 2500 (Mark 2026-08-20 rule #1). The old note said "silenceNow() owns it", and that was
    // true — but silenceNow() itself was an instant hard zero, so what actually reached the ear was a cut.
    // It now ramps over 2500 ms too, so both halves of this handoff obey the rule and this value is no
    // longer a special case pointing at another special case.
    { id: 'GUIDEBOOK', pri: 850, silent: true, dwell: 0, fadeOut: DEF_FADE,
      gate: s => s.guideOpen === true },

    // ── THE LEVEL WIN (Mark 2026-09-26: "this is the game level win -- played when player enters the card return circle in caberet [REF#AU-00287]
    //    -- after boss is defeated" + "part two if players love the encore and stick around"). Engine9 sets window._levelWinPhase
    //    'win' for the length of LEVEL_WIN.mp3, then 'encore' for ENCORE.mp3 only if the player is still in the cabaret, then 'done'.
    //    Below GUIDEBOOK (a guide still silences), above everything else — the win outranks the boss rift and the fight. The engine
    //    only sets a phase once the file's metadata has loaded, so a missing file never holds the floor in silence.
    //    Off: window._levelWin = false in the engine (no phase is ever set).
    { id: 'LEVEL_WIN', pri: 845, dwell: 0, fadeIn: 600, fadeOut: DEF_FADE, restart: true, noRest: true,
      latchKey: 'levelWin', vol: levelWinVol, pool: levelWinPool,
      gate: () => W()._levelWinPhase === 'win' },
    { id: 'LEVEL_ENCORE', pri: 844, dwell: 0, fadeIn: DEF_FADE, fadeOut: DEF_FADE, restart: true, noRest: true,
      latchKey: 'levelEncore', vol: levelWinVol, pool: levelEncorePool,
      gate: () => W()._levelWinPhase === 'encore' },

    // ── A SPECIAL ROOM'S SONG OVERRIDES (2026-10-01; plan: knowledge/design/MUSIC_OVERRIDES_AND_STAGE_SHOW_2026-10-01.md) ── [REF#AU-00297]
    //    The room just activated plays its own song, once, from the top. It sits above everything it silences — combat, the boss,
    //    every background track — and her song is held while it plays (cabSongAllowed). The engine keeps the gate open only while
    //    the player stays in that room (window._roomSongLive), so leaving ends it and the deck fades it out. Below the death scene,
    //    the guidebook, the Manager's show and the level win.
    { id: 'ROOM_SONG', pri: 760, dwell: 0, fadeIn: 400, fadeOut: DEF_FADE, restart: true, noRest: true,
      latchKey: 'roomSong', vol: roomSongVol, pool: roomSongPool,
      gate: () => W()._roomSongLive === true },

    // ── ⛔ DEFAULT-OFF SINCE 2026-07-26 — see the DISABLED-FEATURES REGISTER in NewOrigami.Engine9.html. [REF#AU-00088]
    //    Mark asked for "when caberet doors open silence music" and this cue is my reading of it, but it has now
    //    broken his game twice: it starved the between-shows lounge (its gate never released, because the door
    //    latch is per-FLOOR), and then it cut the music dead as he walked up to the door — which he experienced
    //    as the game pausing ("now game pauses opening the door, stop fucking up my game"). A cue that silences
    //    everything on approach is not what "silence music when the doors open" should feel like, and I do not
    //    have a reading I can defend, so it is OFF until he tells me what the beat should actually be.
    //    Turn it back on with window._cabHush = true.
    //
    // ── THE DOORS OPEN, EVERYTHING SHUTS UP (Mark 2026-07-26: "when caberet doors open silence music").
    //    The grand entrance is the treasured scene's opening beat and it gets a silent room to land in — this
    //    outranks the fight music and the boss rift, so nothing can talk over it. It does NOT outrank the boss
    //    REVEAL (800), which is its own cinematic with its own camera cut.
    //    Three conditions: the doors are open, the player is at the cabaret, and it is still the MOMENT they
    //    opened. That last one matters — _cabaretOpenedUp is a per-floor LATCH, so without a time bound the hush
    //    never releases and the cabaret sits in permanent silence (it also starved the between-shows lounge,
    //    which is how this was caught). Window: window._cabHushMs (6000). The entrance hush is ON by default;
    //    opt out only with window._cabHush = false.
    // fadeOut 0 → 2500 (Mark 2026-08-20 rule #1). The old rationale — "the room's own audio takes the
    // space immediately" — argued for a cut because something else was arriving. Under rule #1 that is
    // the argument FOR a fade: the composer bed and the room audio now overlap for 2.5 s instead of the
    // bed vanishing on a frame, and an overlap is the one thing that guarantees nothing goes quiet.
    // ── THE CABARET DOOR OPENS AND THE MUSIC CHANGES — FAST, BUT STILL A FADE ────────────────────
    //   ⛔ SUPERSEDED 2026-09-04 — this cue's fadeOut 2500 → 800, for THIS transition only. The order
    //      it serves asks for a fast fade on the cabaret-door change and explicitly not an abrupt cut.
    //   ⭐ WHY THIS CUE IS THE RIGHT ONE, from its own gate rather than by assumption: it is the only
    //     cue keyed on `s.cabaretOpen === true` — THE DOOR BEING OPEN — and it fires for the first
    //     `_cabHushMs` (6000) after that. CABARET_LOUNGE was the tempting guess and is wrong: it
    //     requires `cabSongEver` plus a 5 s quiet delay, so it is the LATER lounge music, not the door
    //     moment. CABARET_DARK is keyed on `cabaretDark`, a different condition, and is left at 2500.
    //   ⭐ AND A CUE'S `fadeOut` GOVERNS THE TRANSITION *INTO* IT (Composer ~:1356 reads `cue.fadeOut`
    //     where `cue` is the INCOMING cue), which is why editing the constant HERE is correct where the
    //     same move was wrong for the combat exit. Same file, same field, opposite direction — the
    //     combat-exit fix had to branch on the cue being LEFT because nothing arrives to specify it.
    //     This transition DOES have an arriving cue, and it is this one, so its own number applies.
    //   ⚠ ZERO GAP IS PRESERVED BY CONSTRUCTION, not by a new guard: `silent: true` means no track is
    //     wanted, so the `!want` branch ramps the deck down and the rest/gap logic is never consulted.
    //     There is no hole to fall into — the cabaret's own scene audio is what follows.
    //   ⚠ DEF_FADE (2500) AND EVERY OTHER CUE ARE UNTOUCHED, so a transition anywhere else still
    //     crossfades at 2500 — that is the blessed control for this change, and it must stay 2500.
    //   ⚠ THE NUMBER IS A LITERAL HERE AND THE KNOB LIVES AT THE TRANSITION SITE (~:1356) — NOT A
    //     STYLE CHOICE. `CUES` is a module-level `const` built ONCE at load (~:458), so a
    //     `num(W()._cabHushFadeMs, 800)` written in this table would be evaluated at load time and the
    //     knob would be DEAD to anything set afterwards: it would read live, tune nothing, and join the
    //     dead-slider family this repo has already been bitten by. I wrote it that way first and caught
    //     it before it shipped. The override at the transition site is evaluated per transition, so the
    //     knob is genuinely live and can be re-tuned by ear without a reload.
    { id: 'CABARET_HUSH', pri: 750, silent: true, dwell: 600, fadeOut: DEF_FADE,   // ⛔ SUPERSEDED 2026-09-19 by Mark's blanket 0.5s order — was 800 (the 2026-09-04 exception), now faster than that exception ever was [REF#PENDING] [REF#AU-00271]
      gate: s => W()._cabaretMusicHush === true
              || (s.cabaretOpen === true && s.nearCabaret === true
                  && num(s.cabaretOpenMs, Infinity) < num(W()._cabHushMs, 6000)
                  && W()._cabHush !== false) },

    // THE MANAGER — his own song, never the generic rift (Mark 2026-09-26). Engine9 raises s.managerNear only for a Manager who is still a [REF#AU-00288]
    // boss within the boss radius, and never counts him toward bossNear; _managerSongOk is the engine's one HEAD check of the file.
    { id: 'MANAGER', pri: 705, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE,
      latchKey: 'manager', vol: bossVol, pool: managerPool,
      // ⛔ SUPERSEDED 2026-10-01: proximity alone no longer plays his song. It plays in his legendary show and at no other [REF#AU-00298]
      //    time (the SHOWTIME cue above, latched by window._showtimeSongOn), so walking near him outside that show is
      //    silent. This cue now answers only while that latch is up — which the cue above already wins — or with the
      //    restore knob. The order and its reasoning: knowledge/design/SHOWTIME_2026-10-01.md, ruling 4.
      //    Proximity music again: window._bossSongOnlyOnLegendary = false (and window._showtime = false brings it back with
      //    the stage number it belonged to).
      gate: s => s.managerNear === true && W()._managerSongOk === true && W()._bossMusic !== false
              && (W()._bossSongOnlyOnLegendary === false || W()._showtime === false || W()._showtimeSongOn === true) },

    { id: 'BOSS', pri: 700, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE,
      latchKey: 'boss', vol: bossVol, pool: bossPool,
      gate: s => s.bossNear === true && s.oniPresent !== true && W()._bossMusic !== false },

    // ONI SINGS LIKE A ROOM SONG (Mark 2026-10-15): flat room-song volume (roomSongVol, 0.55 — the level activation room songs play at), [REF#AU-00320]
    // no proximity scaling; the engine's s.oniPresent now stays up floor-wide while an ONI guard is hostile (see _oniSongFloorWide).
    { id: 'ONI', pri: 695, dwell: 0, fadeIn: DEF_FADE, fadeOut: DEF_FADE,
      latchKey: 'oni', vol: roomSongVol, pool: () => ['./assets/music/oni/ONI.mp3'], noRest: true,
      gate: s => s.oniPresent === true },

    // THE ORC'S SONG (Mark 2026-10-15): the engine owns the episode and the pick (s.orcMeet / s.orcTrack — MAIN once per game, then the [REF#AU-00321]
    // (1)/(2) loops alternate; flags ride the save), this cue only plays it: flat room-song volume, wherever the player is, once through
    // (decks never loop). Under ONI, above the fight song so his toll talk is not drowned by COMBAT.
    { id: 'ORC', pri: 690, dwell: 0, fadeIn: DEF_FADE, fadeOut: DEF_FADE, restart: true, noRest: true,
      vol: roomSongVol, track: s => (s && s.orcMeet === true && s.orcTrack) ? s.orcTrack : null,
      gate: s => s.orcMeet === true && !!s.orcTrack && W()._orcSong !== false },

    // ── THE FIGHT SONG SURVIVES MOVEMENT, NOT THE END OF THE FIGHT ────────────────────────────────────────── [REF#AU-00089]
    //    Mark 2026-07-26, in two messages that together define the whole rule:
    //      (1) "if player was just killing? keep playing the entire fight song - dont change it because a new
    //           section was entered"
    //      (2) "when entering caberet, fade the hostile music before entering and upon the monster death if no
    //           other nearby hostiles"
    //
    //    THE BUG BEHIND (1): window._inCombat is ROOM-scoped — a live hostile in the player's CURRENT room. Walk
    //    through a section gate mid-fight and the room changes, _inCombat drops, the tail expires, and the fight
    //    music is yanked mid-bar for a background theme. MOVING IS NOT THE SAME AS THE FIGHT BEING OVER. So the
    //    gate now also sustains on `hostilesNear` — a RADIUS test (_combatNearTiles, 10) that does not care what
    //    room or section you walked into. Crossing a gate mid-fight can no longer change the music.
    //    ⚠ 12 → 10 TILES (Mark 2026-08-17, mandatory: "combat fades 5 seconds after combat ends. and no other
    //      hostile within 10 tiles."). THIS FLAG IS THE ONLY THING THAT CAN STALL THE FADE, because it feeds
    //      BOTH halves of the gate below (`s.inCombat` is itself `_inCombat || hostilesNear || tail`). At 12
    //      tiles the bubble reached through walls into neighbouring rooms and the gate never went false. The
    //      radius lives at ONE definition site, the engine adapter (Engine9 ~:18718) — do not re-derive it here.
    //
    //    AND (2) NAMES THE TWO WAYS IT SHOULD END, both of which must beat the sustain:
    //      · nearCabaret — the fight music fades BEFORE you walk in, not as you cross the threshold. Approach
    //        radius _cabFadeTiles (4) around the cabaret, so the fade is already under way when the doors open
    //        and the cabaret's own song takes a quiet room.
    //      · the last kill — no hostile in the room AND none within the radius ⇒ the tail (_combatTailMs)
    //        runs out and it fades over 5 s (the cue's own fadeOut below — the "2.5 s" this line used to claim
    //        has not been true since the 07-26 fade pass). "Upon the monster death if no other nearby hostiles."
    //
    //    ⚠ This SUPERSEDES the play-to-the-end-of-the-track reading of (1) that this file shipped an hour
    //    earlier. Message (2) states plainly when the music should stop, and playing a 3-minute song out over a
    //    silent cleared room contradicts it. The mechanism is kept but is now OPT-IN: window._combatPlayOut=true.
    //    restart:true so a fresh fight starts the song from the top rather than mid-bar.
    //
    //    ⏱ THE TAIL IS 10 s (Mark 2026-07-27: "lets change that combat song, to fade out after 10 seconds",
    //    superseding his 60 s of an hour earlier, which superseded 5 s on 07-26). The number lives at ONE
    //    definition site, the engine adapter (Engine9 ~9567); the cue reads the result through s.inCombat and
    //    needs no change here. Note what still cuts the fight music short of the tail, all of them earlier
    //    rulings and all of them deliberate: the cabaret pre-fade (nearCabaret), a special room (roomOwned),
    //    death, and any higher-priority cue. The tail is a floor on the QUIET side of a fight, not a lock —
    //    and see the min-hold note in arbitrate(), which is measured from a different instant.
    //
    //    startAnywhere:true — the rotation opens at a RANDOM point in the pool each session (Mark 2026-07-27:
    //    "cycle the different combat songs so its not always constant one song always to start"). See trackFor.
    //
    //    noRest:true — THE FIGHT DOES NOT WAIT ITS TURN (Mark 2026-07-27: "combat music starts too slow,
    //    should start immediately but fade in"). The five-second rest that now separates every other switch
    //    was landing in front of the fight music too, so a hostile could be three swings into you before the
    //    score noticed. A rest is a scene change; a fight is an EVENT, and the music is how the player is
    //    told about it. So COMBAT cuts the queue and comes up straight away — but it still FADES (fadeIn
    //    1200, and with rampOver that is now a real 1.2 s rather than the ~0.6 s the old rate delivered), so
    //    "immediately" means no dead air, not a bang. Leaving the fight still rests, which is where the seam
    //    belongs. Put combat back behind the rest with window._musicGapAll = true.
    // ── HER SONG OWNS THE ROOM (2026-09-30) ───────────────────────────────────────────────────────
    //    While a cabaret song is playing, the score goes quiet and lets her have it. The deck FADES rather
    //    than cutting (silent cue + fadeOut), which is what the order asked for.
    //    WHY 650 AND NOT HIGHER: this sits ABOVE COMBAT (600) — the measured offender, which was holding the
    //    floor with a fight track while she sang — and BELOW MANAGER (705), BOSS (700), BOSS_REVEAL (800),
    //    GUIDEBOOK (850), CABARET_DARK (870), SILENCE (900) and DEATH (950). Those are scripted beats that
    //    happen IN this room on purpose, and silencing the Manager's own entrance to protect her song would
    //    trade one wrong song for one missing one.
    //    CABARET_BG and CABARET_LOUNGE already stand themselves down on `cabSongPlaying`, so this adds the
    //    one thing they could not: it outranks the cues ABOVE them.
    //    Off: window._cabSongOwnsFloor = false.
    { id: 'CAB_SONG_FLOOR', pri: 650, silent: true, dwell: 0, fadeOut: DEF_FADE,
      gate: s => s.cabSongPlaying === true
              && (s.inCabaret === true || (s.nearCabaret === true && W()._jukeboxOneSong === false))   // inside only: outside she is silent (cabSongAllowed), so the deck must play [REF#AU-00299]
              && W()._cabSongOwnsFloor !== false },

    { id: 'COMBAT', pri: 600, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE, restart: true, playOut: true,
      // ── FIRST FIGHT OPENS ON THE FIRST TRACK (Mark 2026-08-15: "crimson blade plays in combat for [REF#AU-00090]
      //    first combat, silent blade plays the second time, get it right") ────────────────────────
      //    `startAnywhere: true` → false. That flag seeded the rotation counter at a RANDOM index, so
      //    with today's TWO-track pool the opening fight of a session was a coin flip — half the time it
      //    opened on SilentBlade, which is exactly what Mark is reporting. The WALK was never the
      //    problem; the ENTRY POINT was. With the counter starting at 0 the pool is played in the order
      //    it is authored: fight 1 = pool[0] (Beneath the Crimson Moon), fight 2 = pool[1] (SilentBlade),
      //    then alternating.
      //    ⚠ THIS REVERSES Mark 2026-07-27 ("remember to cycle the different combat songs so its not
      //      always constant one song always to start"). That order was given when this pool held FOUR
      //      tracks and a fixed index-0 start meant Kabuki-Duel opened every fight of every session and
      //      every death-retry. His 08-15 instruction names the order explicitly for a two-track pool
      //      and is the newer word, so it wins — recorded rather than silently overwritten.
      //    Random entry point back: window._combatRandomStart is now moot here; set startAnywhere true.
      rotate: true, startAnywhere: false, noRest: true,
      latchKey: 'combat', vol: combatVol, pool: combatPool,
      gate: s => (s.inCombat === true || s.hostilesNear === true)
              && s.roomOwned !== true && s.nearCabaret !== true
              && W()._combatMusic !== false },

    // ── THE CABARET'S OWN BED NEEDS NO CARD (Mark 2026-08-17) ───────────────────────────────────────── [REF#AU-00091]
    //    "the caberet has its own music and doesn't need any cards to play them."
    //    MOVED ABOVE UNEARNED_MUSIC — the identical defect already fixed for GAMBLING, one cue further
    //    down. arbitrate() walks CUES in authored order and BREAKS on the first passing gate;
    //    UNEARNED_MUSIC passes for the whole of segment 0 while unearned; the cabaret IS segment 0.
    //    So the room's own bed could never win, and the proof is not theoretical — the felt, which sits
    //    inside this same room, MEASURED `winner: UNEARNED_MUSIC · track: (none) · gain 0`.
    //    ⚠ THIS CANNOT LEAK BG INTO THE ENTRANCE HALL, which is the thing Mark's "no bg music on load"
    //      ruling protects. The gate below already requires `s.inCabaret === true`, plus `cabSongEver`
    //      (her first show must have happened) and the one-pass limit — so it fires only inside the
    //      room, and only after she has sung. Segment 0 outside the cabaret stays silent.
    //    ⚠ AND IT DOES NOT TALK OVER HER: `s.cabSongPlaying !== true` is still in the gate, and
    //      CABARET_HUSH (750) / CABARET_DARK (870) remain authored ABOVE this, so both still win.
    //    Off: window._cabLounge = false.
    //    pri 450 → 575: keeps "CUES is authored in priority order" true now that this sits above the
    //    earn gate and above GAMBLING (570). Ordering against GAMBLING is moot in practice — this
    //    gate carries `s.atTable !== true`, so the felt and the lounge can never both pass.
    { id: 'CABARET_LOUNGE', pri: 575, dwell: 0, fadeIn: DEF_FADE, fadeOut: DEF_FADE, rotate: true,
      latchKey: 'gambling', vol: loungeVol, pool: loungePool,
      gate: () => false, /* removed worker/lounge bed
              && s.cabSongEver === true
              && W()._jukeboxPending !== true   // no house music between dropped-off cards (2026-10-02) [REF#AU-00300]
              && !_loungePassSpent()          // ONE pass, then the stage is hers — see _loungePassSpent [REF#AU-00092]
              && num(s.cabSongQuietMs, 0) >= num(W()._cabLoungeDelayMs, 5000)
              // ⛔ SUPERSEDED / OFF 2026-09-25 by Mark: "the caberet BG songs keep fucking switching after she plays [REF#PENDING] [REF#AU-00289]
              //    AFTER PARIS DREAMS -- its all fucked up there, fix that music selector playing and stopping
              //    different soundtracks all the time there."
              //    THIS CUE IS ONE OF THE TWO THINGS DOING THE SWITCHING, and it is the one that changes the GENRE.
              //    The cabaret had TWO beds competing for the same silence: this one (loungePool = Marked-Cards-at-Dawn,
              //    Twin-Dice-Moon, her French number) and CABARET_BG (BG_Cabaret_1/2), authored ten lines apart. This
              //    sits ABOVE, so after every one of her songs the room got a GAMBLING track for one pass, and then
              //    CABARET_BG took the floor with a completely different piece. That is "playing and stopping
              //    different soundtracks all the time", exactly, and it is per song — which is why it reads as worst
              //    right after a long number like Mortal Beneath Paris Skies.
              //    His 2026-09-23 ruling already said the room's bed is CABARET_BG ("its supposed to be BG caberet
              //    music"); that pass fixed GAMBLING and left this sibling live. One room, one bed, now.
              //    ⚠ FLIPPED TO OPT-IN, NOT DELETED: the cue, its pool and the one-pass latch are intact, so the
              //      2026-07-26 between-shows house band is one knob away if he ever wants it back.
              //    Register entry: DISABLED-FEATURES REGISTER, top of Origami.RealityEngine.9.html, 2026-09-25.
              //    Back on: window._cabLounge = true.
              && W()._cabLounge === true */ },

    // ── THE FELT IS NOT BACKGROUND MUSIC EITHER (Mark 2026-08-17) ───────────────────────────────────── [REF#AU-00093]
    //    "use this music when gambling fade in, fade out 5 sec: https://suno.com/s/ZVvQQlufR1vFnhIb"
    //    — that link is "Marked Cards at Dawn", i.e. `Marked-Cards-at-Dawn.mp3`, ALREADY index 0 of this
    //    pool, and this cue has carried fadeIn/fadeOut 5000 since the 07-26 fade pass. So nothing about
    //    the TRACK or the FADES was wrong. What was wrong is that you never heard either.
    //
    //    MEASURED (scripts/probe-gambling-track.js), sat at the felt on a stock boot:
    //        winner: UNEARNED_MUSIC · track: (none) · gain 0
    //    …and with `window._bgMusicEarned = true` from the same seat, same frame:
    //        winner: GAMBLING · track: Marked-Cards-at-Dawn.mp3
    //    UNEARNED_MUSIC is `silent: true` and was authored ABOVE this cue, and its gate passes for the
    //    whole of segment 0 until a music card is earned. The felt tables sit INSIDE the cabaret, which
    //    IS segment 0 — so the gambling music was unreachable at every table in the game.
    //
    //    ⚠ THE OLD ORDER CONTRADICTED ITS OWN COMMENT. UNEARNED_MUSIC's note already says the cabaret
    //      "is NOT silenced by this any more, deliberately… the cabaret is segment 0 and its own cues
    //      must be free to play there." That intent was only ever half-implemented: the gate was narrowed
    //      from everywhere to `segmentId < 1`, which still covers the cabaret. Moving this OBJECT is what
    //      actually delivers it — per this file's own law, "POSITION IS THE POLICY, AND `pri` IS NOT".
    //
    //    ⚠ THIS DOES NOT REOPEN BACKGROUND MUSIC ON LOAD (Mark 2026-08-17: "no bg music on load = for
    //      now" · "No default"). Only GAMBLING moves. SECTION_BG, CABARET_LOUNGE and POST_COMBAT all
    //      stay BELOW the earn gate, so a stock boot is still silent — the deck only comes up when the
    //      player is actually at a table. `pri` raised 500 → 570 purely to keep the invariant that CUES
    //      is authored in priority order true; arbitrate() reads it only for the dwell tiebreak.
    //    Off: window._gambleMusic = false.
    //
    // rotate:true — ordered, never random. REFINED 2026-07-27 ("marked cards at dawn as primary gambling
    // tune"): every episode OPENS on index 0 (Marked Cards at Dawn) and the pool advances on the song's
    // OWN FULL PASS — never per sit-down (Mark 2026-08-17: "There is no sit downs."). See trackFor's
    // primary-opens rule + the wrap-advance in tick().
    // ── IT WAITS FOR HER (Mark 2026-07-26: "when gambling = do not supercede gambling song over starlettes song
    //    please. wait until its over - pause 3 seconds and then begin gambling songs AFTER starlettes complete
    //    song"). The felt sits INSIDE the cabaret, so sitting down used to cut her off mid-verse — GAMBLING
    //    simply outranks ROOM_OWNED (400) and her song is silenced by any non-silent cue.
    //    Two conditions now: her song must not be playing WITHIN EARSHOT (_songFadeTiles, the same 10 tiles she
    //    is audible over — outside that range she is not being talked over, so a casino table plays normally),
    //    and once she finishes there is a _gambleAfterSongMs pause (3000) before the table music comes up.
    //    The player can still sit and play in silence meanwhile; this gates the MUSIC, never the game.
    { id: 'GAMBLING', pri: 570, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE, rotate: true,
    // ── ⛔ SUPERSEDED 2026-09-23 IN THE CABARET ONLY, by Mark: "its supposed to be BG caberet music". [REF#AU-00281]
    //    The 07-26 order this cue was built on — "when caberet starlette song is finished, play the gambling songs
    //    I gave you", with the 3 s pause below — still governs EVERY OTHER TABLE in the game (the casino floor is
    //    untouched). Inside the cabaret the room's own background rotation now keeps the floor while the player
    //    gambles, and CABARET_BG (~:897) is what plays instead. Her song still outranks both, unchanged.
    //    ⚠ THIS IS A GATE CHANGE, NOT A REORDER, and that is deliberate: this file's own law is "POSITION IS THE
    //      POLICY, AND `pri` IS NOT" (~:826). GAMBLING stays exactly where it is in CUES; it simply stops passing
    //      inside the cabaret, so arbitrate() walks on and reaches CABARET_BG, the next cue but one. Moving either entry
    //      would change what happens at every other table too.
    //    Restore the felt deck in the cabaret: window._gambleMusicInCabaret = true.
      latchKey: 'gambling', vol: gambleVol, pool: gamblePool,
      gate: s => s.atTable === true && W()._gambleMusic !== false
              && !(s.inCabaret === true && W()._gambleMusicInCabaret !== true)   // the cabaret keeps its own bed — Mark 2026-09-23 [REF#PENDING] [REF#AU-00282]
              && !(s.cabSongPlaying === true && num(s.cabTilesAway, Infinity) <= num(W()._songFadeTiles, 10))
              && num(s.cabSongQuietMs, Infinity) >= num(W()._gambleAfterSongMs, 3000) },

    // ── FIGHT MUSIC IS NOT FREE BACKGROUND MUSIC (Mark 2026-08-13: "combat music doesnt need any card. [REF#AU-00094]
    //    so that is good, it will play automatically. sure, except in caberet, but everywhere else.") ──
    //    THIS ENTRY USED TO SIT AT THE TOP OF `CUES`, above SILENCE, and that is why a hostile could
    //    close on the player in dead silence: the cue is `silent:true`, arbitrate() BREAKS on the first
    //    passing gate, and its gate passes by default — so it won every tick and held the deck dark no
    //    matter which fight cue had been correctly selected below it. Measured, not reasoned:
    //    window._audioDiag() read `WINNER: UNEARNED_MUSIC · silent · deck: not built` during a fight.
    //
    //    ⚠ POSITION IS THE POLICY, AND `pri` IS NOT. `CUES` is authored in priority order and arbitrate()
    //      walks it and breaks (~:745); the `pri` FIELD is only read for the dwell tiebreak below that.
    //      Lowering the number from 999 to 560 and leaving the entry where it was changed NOTHING — the
    //      probe still read UNEARNED_MUSIC winning with a boss reveal active. Moving the OBJECT is the
    //      fix. Anyone re-tuning this must move the entry, not edit the number.
    //
    //      Where it now sits, and what that buys, with no per-cue exemption list to drift out of date:
    //         …BOSS_REVEAL · BOSS · COMBAT   ABOVE it →  the fight is always audible, card or no card
    //         UNEARNED_MUSIC  ← here
    //         POST_COMBAT · GAMBLING · CABARET_LOUNGE · SECTION_BG   BELOW it →  still has to be earned
    //      The alternative was an exemption list inside the gate (`&& cue.id !== 'COMBAT' …`), which is
    //      worse: it must name every present and future fight cue, and the cost of forgetting one is
    //      silence — indistinguishable from a broken deck, which is the failure this block just fixed.
    //
    //    "EXCEPT IN CABERET" IS STILL TRUE, TWICE OVER: CABARET_HUSH and CABARET_DARK are silent cues
    //    authored ABOVE COMBAT, so they still win there; and COMBAT's own gate carries
    //    `s.nearCabaret !== true`, which fades the fight music on APPROACH rather than at the threshold.
    //    SILENCE (death) and GUIDEBOOK are likewise still above everything here and are unaffected.
    //
    //    STILL EARNED, SAME FLAG: every ambient cue below remains gated on _bgMusicEarned (the settings
    //    toggle, PlayerGuide.js ~:4623). This does not ungate the score — it takes the FIGHT out of the
    //    "free music" question, which is exactly what Mark ruled.
    // ── ENTERING SECTIONS 1-4 IS WHAT ACTIVATES THE SCORE (Mark 2026-08-15: "yes default off, until
    //    sections 1-4 are entered, then the BG music I told you is active") ─────────────────────────
    //    THE ACTIVATION IS POSITIONAL, NOT A CHECKBOX. This gate used to be a blanket
    //    `_bgMusicEarned !== true`, which silences EVERYTHING authored below it — SECTION_BG, yes, but
    //    also CABARET_LOUNGE, GAMBLING, ROOM_OWNED and POST_COMBAT — because arbitrate() breaks on the
    //    first passing gate. So a flag nobody could set was muting her stage as well as the dungeon,
    //    and that is why the four house tracks and the lounge have both been inaudible.
    //    Now it silences ONLY IN THE HEART (segment 0), and only while the score has not been switched
    //    on by hand. Walk out through the cabaret's east door into any numbered section and the gate
    //    stops firing, SECTION_BG takes over, and the shuffle bag plays. Walk back and it goes quiet
    //    again — which is the behaviour Mark described in two separate instructions: no BG before the
    //    sections, and her songs owning the cabaret.
    //    ⚠ THE CABARET IS NOT SILENCED BY THIS ANY MORE, deliberately. CABARET_LOUNGE sits below this
    //      cue and was collateral damage of the blanket form; the cabaret is segment 0 and its own cues
    //      must be free to play there. "The caberet sogns = only play in caberet + legendary card"
    //      needs them reachable, and SECTION_BG's own segmentId >= 1 gate is what keeps the DUNGEON
    //      score out of that room — not this one.
    //    Restore the blanket gate: window._bgEarnGateEverywhere = true.
    // ── THE HEART PLAYS ONCE THE CABARET IS ACTIVATED (Mark 2026-09-13: "After caberet is activated we
    //    can do it for section 0 too, but caberet will always have its own BG -- the paris songs") ─────
    //    `heartOpen(s)` is the one predicate all three Heart gates share: segment 0, the cabaret positively
    //    activated (`s.cabaretLive`, never the absence of the dormancy check), and the player NOT inside
    //    the cabaret — her room keeps its own cues (CABARET_LOUNGE above, her set list via cabSongPlaying,
    //    and HEART_SILENCE when neither is on so she is never talked over). The 08-15/08-16 Heart silence
    //    and the 08-17 earn gate stand exactly as written until that moment. Off: _bgHeartAfterCabaret=false.
    // ── CABARET BACKGROUND BED (Mark 2026-09-19: "make sure these are bg music for caberet -- pause
    //    interval 5 seconds between rotations"). Sits BELOW GAMBLING and CABARET_LOUNGE (both must still
    //    win when they apply — her interlude and the felt are curated, this is just the ambient fallback)
    //    and ABOVE UNEARNED_MUSIC/SECTION_BG, so the cabaret gets its own flavoured bed instead of falling
    //    through to dungeon ambience or silence the rest of the time. rotate:true walks the 2-track pool
    //    in order (never random — matches this file's rule for every other rotate cue). The "5 second
    //    pause between rotations" is a NEW, explicit, narrow gap — NOT a revival of the global rule #1
    //    zero-gap law, the same way CABARET_HUSH/COMBAT-exit are already narrow, named exceptions to it.
    //    Implemented as a gate condition (below) plus a stamp in the wrap-advance (~tick(), search
    //    'cabaretBg wrap'), the same "stamp a timestamp on window, gate reads it back" idiom this file
    //    already uses for _cabLoungePassDone. During the 5s hush the floor falls through to whatever cue
    //    is next (SECTION_BG/UNEARNED_MUSIC) rather than true silence — consistent with rule #1's OTHER
    //    surviving clause that music never hard-stops; say the word if literal silence is wanted instead.
    //    Off: window._cabaretBg = false. Pause length: window._cabaretBgPauseMs (default 5000).
    { id: 'CABARET_BG', pri: 565, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE, rotate: true,
      latchKey: 'cabaretBg', pool: cabaretBgPool,
      // OUTSIDE THE DOORS (2026-10-02): the bed follows the player out, scaled by the engine's distance fade (window._cabBgFade, [REF#AU-00301]
      // 10% per tile from the nearer door). Off: window._cabBgOutsideFade = false.
      vol: () => cabaretBgVol() * ((W()._cabBgOutsideFade !== false && W()._cabInsideNow === false) ? clamp01(num(W()._cabBgFade, 0)) : 1),
      // ⛔ `s.atTable !== true` REMOVED 2026-09-23 by Mark: "why are you playing the fucking wrong music in [REF#AU-00283]
      //    caberet? its supposed to be BG caberet music ... it was working before you fucked up the music during
      //    gambling." THAT CLAUSE WAS THE BUG, and it is worth seeing why it reads as innocent: both cabaret beds
      //    (this one and CABARET_LOUNGE, ~:764) stood themselves down the moment the player sat at a table, and
      //    GAMBLING (~:811) requires `atTable === true` — so sitting down in the cabaret handed the deck to the
      //    felt pool every time, and the room's own music could never be heard at its own table. Introduced
      //    2026-09-19 17:17 in 867e5b41 (the music-priority overhaul that added this cue). Measured in the build
      //    Mark was running when he reported it, gold-v8.4-2026-09-22-c50d0329.
      gate: () => false, /* removed cabaret background bed
                  || (W()._cabBgOutsideFade !== false && W()._cabInsideNow === false && num(W()._cabBgFade, 0) > 0
                      && typeof W()._isRoomActivated === 'function' && W()._isRoomActivated('CABARET') === true))   // never outside a closed cabaret (2026-10-03) [REF#AU-00302]
              && W()._cabaretBg !== false
              && (W().performance ? W().performance.now() : Date.now()) >= num(W()._cabaretBgHushUntil, 0) */ },

    { id: 'UNEARNED_MUSIC', pri: 560, silent: true, dwell: 0, fadeOut: DEF_FADE,
      gate: s => W()._bgMusicEarned !== true
              && (W()._bgEarnGateEverywhere === true || num(s.segmentId, 0) < 1)
              && !heartOpen(s) },

    // ── ⛔ POST_COMBAT IS OFF (Mark 2026-08-17) — REGISTER ENTRY AT THE TOP OF Engine9 ────────────── [REF#AU-00095]
    //    "this is 1 song, it will not be followed by another UNLESS COMBAT is still active."
    //    THIS CUE IS THE "ANOTHER". It existed to hand the deck a SECOND full song once the fight's
    //    tail expired, and the song it handed over was BG-Phantasm — which is now the FIGHT song
    //    itself. Left on, it would replay the combat track as a post-combat bridge the moment combat
    //    ended, i.e. exactly the "followed by another" he has now refused eight times, wearing the
    //    same song's name. Its 08-16 rationale ("Phantasm is the TAIL OF A FIGHT") is superseded by
    //    today's ruling, which promotes Phantasm from the tail to the fight.
    //    HOW IT IS OFF: the gate carries `W()._postCombatBridge === true`, which nothing sets. The cue
    //    object, its pool and `postCombatTrack()` are all intact, so restoring is one knob and no
    //    rebuild: window._postCombatBridge = true.
    //    ⚠ DO NOT "FIX" A SILENT ROOM AFTER A FIGHT BY RE-ENABLING THIS. Silence after combat is the
    //      instruction, not a regression — with BG-on-load also off (Mark 08-17 "no bg music on load
    //      = for now"), the room going quiet when the last hostile dies is the specified behaviour.
    { id: 'POST_COMBAT', pri: 550, dwell: 0, fadeIn: DEF_FADE, fadeOut: DEF_FADE, playOut: true, noRest: true,
      track: () => postCombatTrack(), vol: ambVol,
      gate: s => W()._postCombatBridge === true
              && s.postCombatReady === true && s.inCombat !== true && s.combatTail !== true },

    // ── THE HOUSE BAND BETWEEN SHOWS (Mark 2026-07-26: "when caberet starlette song is finished, play the [REF#AU-00096]
    //    gambling songs I gave you"). Starlette's song PAUSES between takes — that rest gap used to leave the
    //    cabaret in silence. Now the room picks up the gambling rotation until she starts again.
    //    IT NEVER INTERRUPTS HER (Mark 2026-07-26: "if starlettes song is playing - allow it to continue, dont
    //    interrupt it, play the other songs when its over after a short pause of 5 seconds"). Two guarantees:
    //    the gate is simply "her song is not playing", so this cue cannot start over the top of her; and dwell is
    //    ZERO, so the frame her track resumes it yields the floor rather than holding it for another beat. Dwell
    //    exists to stop flapping gates, and this gate does not flap — a transport is either running or it is not.
    //    Shares the 'gambling' latch, so walking from the lounge to the felt continues the same song rather than
    //    cutting to a different one mid-room.
    //    FIVE SECONDS OF SILENCE FIRST, then a gradual rise (Mark 2026-07-26, raised from his earlier 2s: "play
    //    the other songs when its over after a short pause of 5 seconds") — the end of her song gets room to land
    //    before the house band picks up. The wait is the gate (_cabLoungeDelayMs, 5000); the gradual part is this
    //    cue's 2.2s fadeIn. Off: window._cabLounge = false.
    //    FIRST SHOW OWNS THE OPENING (Mark 2026-07-27: "when closing guidebook, do not start up bg music,
    //    wait for caberet show to start instead. quiet on entering caberet and clicking oK = no bg sound --
    //    wait for starlette show to start"). The quiet-timer counts from BOOT, so on a fresh entry the 5s
    //    gate was already satisfied and the house band played over the pre-show hush. "Between shows"
    //    requires a show to have HAPPENED: s.cabSongEver (engine flag, set the first time her transport
    //    actually plays this session) now gates the lounge. Before her first number the cabaret is silent
    //    (ROOM_OWNED); after it, the between-shows house band behaves exactly as on 07-26.

    // Cabaret / konbini / oni-baba throne own their own audio — the deck goes quiet inside them. [REF#AU-00097]
    //    + THE DOORSTEP HUSH (Mark 2026-07-27: "when clicked OK for caberet -- shut off bg music please").
    //    The OK click happens standing at the DOORWAY — a hall tile, which s.roomOwned deliberately excludes
    //    (the corridor-stutter fix) — so SECTION_BG played straight through the moment. Once the cabaret
    //    guide is acknowledged and the player is within _cabHushTiles (2) of the room, the deck stands down
    //    until her FIRST show has happened; after that the normal rules (lounge/gambling) own the room.
    //    ── THE OK CLICK IS A DOOR CLOSING, NOT A SWITCH (Mark 2026-07-27: "make sure to fade music volume,
    //    no abrupt changes, especially when clicking OK in guidebook to begin caberet"). Two things were
    //    wrong and BOTH are fixed, which is worth stating because either alone would have left him hearing
    //    the same complaint. (1) The rate bug: this cue's authored 1600 ms fadeOut was travelling from the
    //    ambient deck's 0.125 at a full-scale rate, so it really took ~200 ms — the OK click killed the
    //    dungeon theme in a fifth of a second. rampOver fixes that everywhere. (2) 1600 ms is a short
    //    curtain for the moment the treasured scene opens, so the hush is now 2600 ms: by the time the
    //    guidebook is off the screen the dungeon has receded rather than stopped.
    { id: 'ROOM_OWNED', pri: 400, silent: true, dwell: 600, fadeOut: DEF_FADE,
      gate: s => s.roomOwned === true
              || W()._cabaretMusicHush === true
              || (s.cabaretOpen === true && s.nearCabaret === true
                  && (s.cabGuideAck !== true || W()._cabShowPending === true || s.cabSongEver !== true))
              || s.cabEntranceNear === true
              // s.cabDoorOpening / _cabDoors[].anim dropped 2026-08-25 with the doors themselves [REF#AU-00098]

              || (W()._cabEntered === true && W()._cabShowPending === true) },

    // ── NO BACKGROUND SCORE IN THE HEART (Mark 2026-08-15: "there should be no bg music played until [REF#AU-00099]
    //    the player enters the sections 1-4 ok?") ──────────────────────────────────────────────────
    //    segmentId 0 is the Heart — the entrance landing, the ring and the cabaret. It stays SILENT, so
    //    the first music a player hears is Starlette's on her own stage, and the dungeon score starts
    //    only when they leave the lit part for the dark. The cabaret's own cues (CABARET_LOUNGE,
    //    CABARET_DARK, CABARET_HUSH) are untouched — they sit above this one and own that room.
    //    ⚠ `_bgBySection` IS EMPTY AT RUNTIME, ON PURPOSE. DO NOT GO LOOKING FOR A BROKEN WRITER.
    //      What used to be written here claimed "the engine now writes one track per section into
    //      _bgBySection, which bgTrack consults FIRST." That was FALSE and it cost a round of chasing:
    //      MEASURED, `window._bgBySection` is `undefined` on a stock boot. The engine's writer does
    //      exist (Engine9 ~:31735) but sits behind `window._bgSectionThemes === true`, which nothing
    //      sets — and its own comment says why: a fixed per-section map hands the same section the same
    //      song every run forever, which is the opposite of Mark's "random, dont repeat - just loop".
    //      The shuffle bag in `bgTrack` decides instead, and `_bgBySection` remains a live BY-HAND
    //      override that `bgTrack` still consults first if anyone ever fills it.
    //      THE OTHER HALF OF THE OLD CLAIM WAS ALSO WRONG. It argued the four house tracks would be
    //      "permanently unreachable" without a per-section table, because `segmentId >= 1`
    //      short-circuits to BG_AFTER_CAB. That branch is gated on `W()._bgAfterCabaret === true`,
    //      which is also unset, so it never fires and `bgTrack` falls through to the bag. MEASURED:
    //      three consecutive skips in segment 2 drew Phantasm → Taps → Pilgrim, and The_Withered_Gate
    //      on another run — all four reachable, no table involved.
    //    Off: window._bgInHeart = true → the old always-on gate.
    // A SLEEPING SECTION IS SPOOKY (Mark 2026-10-15): the engine raises s.sectionAsleep when every body of the section the player is in is
    // asleep (sections 1+); spooky-bg-music plays at _spookyBgVol (0.5) above the house BG, once through, and drops the moment one wakes.
    { id: 'SECTION_ASLEEP', pri: 105, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE,
      latchKey: null, vol: () => clamp01(num(W()._spookyBgVol, 0.5)), track: () => './assets/sounds/BG-OLD/spooky-bg-music.mp3',
      gate: s => s.sectionAsleep === true && W()._spookyBg !== false },

    { id: 'SECTION_BG', pri: 100, dwell: 1200, fadeIn: DEF_FADE, fadeOut: DEF_FADE,
      latchKey: null, vol: ambVol, track: stableBgTrack,
      gate: s => s.cabaretLive === true
              && ((W()._bgInHeart === true) || ((s.segmentId | 0) >= 1) || heartOpen(s))
              && (W()._bgEarnedOnly !== true || _bgPoolEarned().length > 0) },

    // ── THE HEART HAS TO OWN ITS OWN SILENCE (Mark 2026-08-16: "i told you dont play BG music until [REF#AU-00100]
    //    enter sections 1-4 = you failed") ────────────────────────────────────────────────────────
    //    THE 08-15 GATE ABOVE WAS REAL BUT UNREACHABLE, AND THIS IS WHY. arbitrate() ends with
    //        if (!win) win = CUES[CUES.length - 1];
    //    — when no gate passes, the LAST cue in the array wins by default. SECTION_BG was that last
    //    cue, so it was the universal fallback: refusing its gate in the Heart handed the floor
    //    straight back to it. MEASURED, and the diag says it outright — every cue printed `gate ·`
    //    (all failing) while SECTION_BG was still WINNER with the deck ▶ PLAYING and `why: gate
    //    passed` left over from an earlier tick. That is not a stuck flag; it is the fallback.
    //    So the Heart needs a cue that WINS, rather than a gate that merely loses. This one is
    //    `silent`, its gate is the exact complement of SECTION_BG's (one of the two always passes),
    //    and being authored LAST it is now the `!win` fallback as well — so an unforeseen all-gates-
    //    fail state resolves to silence instead of to the dungeon score. Failing quiet is the right
    //    default for a music bed.
    //    IT DOES NOT TOUCH THE CABARET. GAMBLING (500), CABARET_LOUNGE (450) and the hush/dark cues
    //    are all authored ABOVE and win on their own gates; and because this cue is SILENT rather
    //    than a track, Starlette's own song is no longer talked over — the diag used to read
    //    "cabaret song: SILENCED by SECTION_BG" in the very room Mark reserved for her.
    //    Off: window._bgInHeart = true — the one knob still flips BOTH halves together.
    { id: 'HEART_SILENCE', pri: 90, silent: true, dwell: 0, fadeOut: DEF_FADE,
      gate: s => W()._bgInHeart !== true && ((s.segmentId | 0) < 1) && !heartOpen(s) },
];

// ── THE PER-TRACK EARNED GATE (2026-09-29) — the one-function change the 2026-07-31 block at the top of CUES promised. ── [REF#AU-00303]
//    A track whose card has not been inserted at the cabaret never plays from this deck. The test is the engine's
//    window._songLocked(url) (Engine9, beside the SongCatalog import): the Songs page NEEDS CARD tick, seeded ON for every
//    catalog song with a card, AND no inserted card for it. Pools are filtered, so an all-locked pool is an empty pool and
//    the cue goes inert exactly as it already does (the empty-pool rule in tick). The one single-track cue loses arbitration
//    instead of being handed a null track. If the engine has not published the test yet, nothing is locked.
//    Off: window._songCardGate = false.
function _earnedTrack(url) {
    if (W()._jukeboxRecordAlreadyPlayed?.(url)) return false;
    try { const f = W()._songLocked; return !(W()._songCardGate !== false && typeof f === 'function' && f(url) === true); }
    catch (_) { return true; }
}
for (const c of CUES) {
    if (typeof c.pool === 'function') {
        const _rawPool = c.pool;
        c.pool = function () { const p = _rawPool.apply(this, arguments); return Array.isArray(p) ? p.filter(_earnedTrack) : p; };
    } else if (typeof c.track === 'function' && !c.silent) {
        const _rawGate = c.gate, _rawTrack = c.track;
        c.gate = function (s) {
            if (typeof _rawGate === 'function' && !_rawGate.apply(this, arguments)) return false;
            let t = null; try { t = _rawTrack(s); } catch (_) { t = null; }
            return !t || _earnedTrack(t);
        };
    }
}

/** Every track any cue can pick — for the load probe. Read from the live pools so it cannot drift. [REF#AU-00101] */
export function allTracks() {
    const out = new Set();
    for (const t of poolOf('_bgMusicPool', BG_POOL)) out.add(t);
    // The post-cabaret default is NOT in BG_POOL (it is picked by segment, not by rotation), so it has to [REF#AU-00102]
    // be listed here explicitly or probe-music-load.js would never prove its bytes arrive — which is the
    // exact hole the three space-in-filename tracks fell through on 07-26: right cue, right track, silence.
    { const t = W()._bgAfterCabaret; out.add((typeof t === 'string' && t) ? t : TRACKS.BG_AFTER_CAB); }
    for (const t of bossPool()) out.add(t);
    for (const t of bossIntroPool()) out.add(t);
    for (const t of gamblePool()) out.add(t);
    for (const t of loungePool()) out.add(t);   // 歌に息 rides ONLY the lounge pool — without this line its bytes are never proven to arrive (Mark 2026-08-16) [REF#AU-00103]
    for (const t of combatPool()) out.add(t);
    const bySec = W()._bgBySection;
    if (bySec && typeof bySec === 'object') for (const k of Object.keys(bySec)) if (typeof bySec[k] === 'string') out.add(bySec[k]);
    return [...out];
}

export function createComposer(opts) {
    opts = opts || {};
    const mkAudio = opts.mkAudio || ((src) => { const a = new Audio(src); a.loop = false; return a; });
    const onCue = typeof opts.onCue === 'function' ? opts.onCue : () => {};
    const onError = typeof opts.onError === 'function' ? opts.onError : () => {};

    // Two decks, created once and reused forever. Never construct per cue. [REF#AU-00104]
    // ── THREE DECKS, NOT TWO (Mark 2026-08-11: "music when it is playing sometimes is chopping off
    //    and not finishing … make sure there is ample fades between songs") ───────────────────────────
    //    MEASURED, not reasoned — scripts/probe-deck-steal.mjs drives this module with a stub whose
    //    `src` is a setter, so it records the deck's gain at the exact instant src is written:
    //
    //        15840ms  deck0  gain=0.0810  Underworld-ThemeSong-Taps.mp3 → DevilzDuel.mp3   ⚠ CHOP
    //
    //    Writing `src` on an <audio> element STOPS IT DEAD — no fade, no ramp, that is the DOM's
    //    behaviour and no amount of authored fadeOut in the cue table can soften it. With only two
    //    decks, `act ^ 1` is not a choice: the incoming track MUST take the other deck, even when that
    //    deck is still mid-fade at 65% of full ambient. Two `noRest` cues inside one 5s fade window is
    //    all it takes, and COMBAT → BOSS_REVEAL is exactly that shape — a real sequence in a boss fight.
    //    The song did not "fail to finish"; it was cut off mid-note by the deck being taken from under it.
    //    A third deck makes the choice possible: pickIncoming() takes the QUIETEST idle deck, so an
    //    outgoing song keeps its authored five seconds and plays its fade out to silence.
    //    ⚠ COST IS ONE MORE <audio> ELEMENT, created lazily by deck() and reused forever — no per-cue
    //      construction, same as the original two. It is not a render-path cost and touches no lights,
    //      no draw calls, nothing the NO-THROTTLE mandate governs.
    //    Rollback: window._musicDecks = 2 restores the old two-deck steal exactly.
    const DECK_COUNT = Math.max(2, Math.min(4, (typeof window !== 'undefined' && +window._musicDecks) || 3));
    const decks = new Array(DECK_COUNT).fill(null);
    let act = 0;                       // index of the ACTIVE deck [REF#AU-00105]
    const gain = new Array(DECK_COUNT).fill(0);     // current 0..1 gain per deck [REF#AU-00106]
    const goal = new Array(DECK_COUNT).fill(0);     // target gain [REF#AU-00107]
    const rate = new Array(DECK_COUNT).fill(1);     // gain units per ms [REF#AU-00108]
    const srcOf = new Array(DECK_COUNT).fill(null);

    let curId = null, curTrack = null, startedAt = 0, lastArb = 0;
    const latch = Object.create(null);
    let lastState = null, lastWhy = '';
    // PLAY-OUT tracking. The decks loop (loop=true), so a track never fires 'ended' — a full pass shows up as [REF#AU-00109]
    // currentTime jumping BACKWARDS. Watch for that wrap instead of trusting an event that will never come.
    let poWrapped = false, poLastT = 0;
    // THE PENDING HALF OF A SEQUENCED TRANSITION: { cue, track, fadeIn, at }, or null when nothing is resting. [REF#AU-00110]
    // Set by switchTo when a switch owes the listener the five-second quiet; consumed by tick() at `at`.
    let pend = null;
    // FX-DUCK STATE (Mark 2026-09-19: "room fx sound permits etc get override on all music including bg [REF#PENDING] [REF#AU-00272]
    // + combat + other"). Deliberately SEPARATE from fadeUntil/rampOver's own "protect an in-flight fade"
    // guard below (~search 'DO NOT STOMP AN AUTHORED FADE') — that guard exists to protect a fade traveling
    // TOWARD the cue's own volume, and explicitly snaps `goal[act]` back to `want` on every non-arbitration
    // frame regardless of fadeUntil once want>0, which would undo a duck-to-zero within one frame if reused
    // for this. duckUntil is its own short-lived override the per-frame branch checks FIRST.
    let duckUntil = 0;
    let combatEpisodeSeen = false;
    let postCombatReady = false;

    const deck = (i) => {
        if (!decks[i]) { try { decks[i] = mkAudio(''); } catch (e) { onError(e); return null; } }
        return decks[i];
    };
    const setSrc = (i, url) => {
        const a = deck(i); if (!a || srcOf[i] === url) return a;
        // One 'error' listener per deck, attached once, reading the deck's CURRENT url — see [REF#AU-00111]
        // _dropDeadTrack (~:181). A 404 (or a decode failure) retires that track from every pool so the
        // next scored cue picks a sibling instead of holding the floor in silence.
        if (!a._deadWired) {
            a._deadWired = true;
            a.addEventListener('ended', () => {
                try { W()._jukeboxMarkPlayed?.(srcOf[i], 'composer-ended'); }
                catch (error) { onError(error); }
            });
            try { a.addEventListener('error', () => _dropDeadTrack(srcOf[i]), { passive: true }); } catch (_) {}
        }
        try { a.src = url; a.loop = false; a.load(); } catch (e) { onError(e); }
        srcOf[i] = url; return a;
    };
    const applyGain = (i) => {
        const a = decks[i]; if (!a) return;
        const v = clamp01(gain[i] * (W()._chatSpeechMusicGain?.() ?? 1));
        try { if (a.volume !== v) a.volume = v; } catch (e) { onError(e); }
        if (v <= 0.0001) { if (!a.paused) { try { a.pause(); } catch (_) {} } }
        else if (a.paused && !a.ended && !W()._jukeboxRecordAlreadyPlayed?.(srcOf[i])) { try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
    };
    // When an AUTHORED cue fade is due to finish. Until then the per-frame retarget in tick() may move the [REF#AU-00113]
    // target but must not touch the rate — see the warning there. A plain ramp() clears it: a retarget is not
    // a scored transition and has no shape to protect.
    const fadeUntil = new Array(DECK_COUNT).fill(0);
    let nowMs = 0;                     // last clock the engine handed us, so rampOver can stamp a deadline [REF#AU-00114]

    const ramp = (i, to, ms) => { goal[i] = clamp01(to); rate[i] = ms > 0 ? (1 / ms) : 1; fadeUntil[i] = 0; };
    // ── A FADE MUST TAKE THE TIME IT SAYS IT TAKES (Mark 2026-07-27: "a soft fade out and fade in") ───────── [REF#AU-00115]
    // ramp()'s `ms` is the time for a FULL 0→1 sweep, so a fade only lasts as long as the DISTANCE it travels.
    // The ambient deck sits at _bgMusicVol 0.125 — so SECTION_BG's authored 2400 ms fadeOut really took 300 ms.
    // MEASURED, not reasoned: the unit drive clocked that fade-out at 312 ms, an eighth of what the cue table
    // claims, which by musical standards is a cut. Every "seconds-long" fade authored on 07-26 to answer
    // "music changes too abruptly" has been silently delivering a fraction of itself ever since, and the
    // quieter the deck the worse the lie — the ambient theme, the 12% gambling tracks and the lounge got the
    // shortest fades of all. That is the abruptness.
    // rampOver() scales the rate by the distance actually being travelled, so `ms` means what the table says
    // it means: how long THIS move takes, from whatever gain it starts at. Used for every authored cue
    // fadeIn/fadeOut. ramp() stays for the per-frame volume retargets (mute, slider, proximity swell), where
    // a fixed rate is the right shape — those chase a moving target rather than running a scored transition.
    const rampOver = (i, to, ms) => {
        const t = clamp01(to);
        const d = Math.abs(t - gain[i]);
        goal[i] = t;
        rate[i] = (ms > 0 && d > 1e-6) ? (d / ms) : 1;   // d≈0 ⇒ nothing to travel; rate is moot, keep it finite [REF#AU-00116]
        fadeUntil[i] = nowMs + Math.max(0, ms);          // this fade is protected until it is due to land [REF#AU-00117]
    };

    // Transport stop for modal handoffs. This is intentionally separate from cue arbitration: the [REF#AU-00118]
    // guide-open message crosses an iframe boundary and must not wait for the 350 ms arbitration cadence.
    // ── IMMEDIATE DECISION, 2.5s FADE (Mark 2026-08-20, rule #1: "fade out 2.5 seconds always for all
    //    music") ──────────────────────────────────────────────────────────────────────────────────────
    //    THIS FUNCTION WAS THE MOST ABRUPT THING IN THE WHOLE AUDIO PATH: `gain[i] = 0` plus an
    //    `a.pause()` on the same tick is a hard cut to zero with no ramp at all, and it fires on
    //    guidebook-open, music-page-stop and bg-skip — three of the most common transitions in the game.
    //    Every fade length authored in the cue table was irrelevant on those paths.
    //    WHAT WAS ACTUALLY URGENT HERE IS THE DECISION, NOT THE SILENCE. The comment above explains the
    //    real constraint: the message crosses an iframe boundary and must not wait 350 ms for the next
    //    arbitration tick. `pend = null` and the rampOver() calls below both happen on THIS tick, so the
    //    decision is still immediate — only the gain now takes 2.5 s to arrive, as the rule requires.
    //    ⚠ NO `a.pause()` ANY MORE. Pausing the element is what made this a cut regardless of gain: the
    //      integrator would have had nothing left to fade. applyGain() already pauses a deck by itself
    //      once it falls under 0.0001, so the deck still stops — it stops at the END of the fade rather
    //      than at the start of it, which is the entire difference.
    //    Restore the old hard stop with window._silenceNowHard = true (kept for a fast A/B, not as a
    //    supported mode — it violates rule #1 by construction).
    function silenceNow(reason) {
        pend = null;
        lastWhy = String(reason || 'immediate silence');
        const hard = W()._silenceNowHard === true;
        const ms = DEF_FADE * fadeScale();
        for (let i = 0; i < decks.length; i++) {
            if (hard) {
                goal[i] = 0; gain[i] = 0; rate[i] = 1; fadeUntil[i] = 0;
                const a = decks[i];
                if (a) { try { a.volume = 0; } catch (_) {} try { a.pause(); } catch (_) {} }
            } else {
                rampOver(i, 0, ms);
            }
        }
    }

    function observeCombatState(s) {
        if (s.inCombat === true || s.hostilesNear === true) {
            combatEpisodeSeen = true;
            postCombatReady = false;
        } else if (combatEpisodeSeen && s.combatTail !== true) {
            // The engine's five-second tail has expired: arm exactly one Phantasm pass. [REF#AU-00119]
            combatEpisodeSeen = false;
            postCombatReady = true;
            // ── THE EPISODE IS OVER, SO RELEASE ITS TRACK (Mark 2026-08-15: "silent blade plays the [REF#AU-00120]
            //    second time") ────────────────────────────────────────────────────────────────────
            //    `latch['combat']` short-circuits trackFor (~:912) and returns the SAME song while the
            //    latch stands. Nothing ever cleared it, so the walk advanced exactly once per page load:
            //    MEASURED before this line existed — fight 1 Kabuki-Duel, fight 2 Kabuki-Duel again,
            //    with a two-entry pool. The rotation was not broken; it was never consulted a second
            //    time. Fixing the entry point alone (startAnywhere above) would have made every fight of
            //    a session play pool[0] forever, which is worse than the random start it replaced.
            //    Cleared HERE, not on combat start, because the latch's real job is holding one song
            //    across a single fight — re-aggro inside the 5s tail must not restart the music. This
            //    branch is already gated on `combatTail !== true`, i.e. the tail has fully expired, so
            //    the song is released at exactly the moment the fight is genuinely over.
            //    Keep one song for the whole session: window._combatLatchSticky = true.
            if (W()._combatLatchSticky !== true) delete latch['combat'];
        }
        s.postCombatReady = postCombatReady;
    }

    // ── pick the winning cue ─────────────────────────────────────────────── [REF#AU-00121]
    function arbitrate(s, now) {
        let win = null;
        for (const c of CUES) {
            if (!c.silent && !c.track) { const p = c.pool ? c.pool() : null; if (!p || !p.length) continue; }   // empty pool ⇒ unwinnable ⇒ inert [REF#AU-00122]
            let ok = false; try { ok = c.gate(s) === true; } catch (e) { onError(e); }
            if (ok) { win = c; break; }   // CUES is authored in priority order [REF#AU-00123]
        }
        if (!win) win = CUES[CUES.length - 1];

        const cur = CUES.find(c => c.id === curId) || null;
        // A returning fight does not interrupt the post-combat bridge. Once the full Phantasm pass wraps, [REF#AU-00124]
        // poWrapped releases this hold and COMBAT wins on the next arbitration.
        if (cur && cur.id === 'POST_COMBAT' && win.id === 'COMBAT' && !poWrapped && playing()) {
            lastWhy = 'held by POST_COMBAT until Phantasm finishes';
            return cur;
        }
        // DWELL — the anti-stutter rule. A cue that just started holds the floor, unless something strictly [REF#AU-00125]
        // higher-priority wants in (a death or a boss cut must never wait on a dwell timer).
        if (cur && win.id !== cur.id && win.pri <= cur.pri) {
            const dw = (cur.dwell === Infinity) ? Infinity : num(cur.dwell, 0);
            if (now - startedAt < dw) { lastWhy = 'held by ' + cur.id + ' dwell'; return cur; }
            // COMBAT MIN-HOLD (Mark 2026-07-27: "if just went to combat music = keep it going for at least [REF#AU-00126]
            // 30 seconds. dont immediately go back to bg dungeon music"). A two-second skirmish used to
            // bounce the score fight→bg within ~7s — jarring. Once COMBAT takes the floor, the drop back to
            // SECTION_BG specifically waits out _combatMinHoldMs. SCOPED to that one transition on purpose:
            // every cue that replaces combat FOR A REASON — boss, reveal, death-silence, the cabaret cues
            // (hush outranks at 750), gambling at the felt — interrupts exactly as before.
            // Off: window._combatMinHoldMs = 0.
            //
            // ⏱ NOW 10 s, MATCHING THE TAIL (Mark 2026-07-27: "yes lets do 10 seconds or 5 seconds next,
            //    feeling it out"). His 30 s and his 10 s tail were measured from DIFFERENT instants — the
            //    min-hold from when the cue started, the tail from the last hostile — so a five-second
            //    skirmish still sat on ~30 s of fight music while the tail said 10. Both are his numbers;
            //    aligning them is what he said yes to. HE IS STILL TUNING BY EAR, so the two move together
            //    now: window._musicHold(sec) sets tail and min-hold in one call, live, no reload (defined in
            //    the engine adapter, Engine9 ~9480). 5 s is the next value he wants to try.
            // ⚠ THE MIN-HOLD MUST NOT OUTRANK A DELIBERATE VETO. Its note above says the cabaret cues still
            // interrupt "exactly as before" — that was true of the HUSH (pri 750, it outranks) and false of
            // the one that matters. The cabaret PRE-FADE (Mark 2026-07-26: "when entering caberet, fade the
            // hostile music BEFORE entering") does not outrank anything; it works by making the COMBAT gate
            // FAIL, so the winner becomes SECTION_BG — the exact transition this min-hold blocks. Net effect:
            // walking into the treasured scene mid-fight kept the fight music playing over her entrance for
            // up to 30 s. Not caught until 07-27 because probe-composer's combat tests were all failing on a
            // separate bug (window.px), so "cabaret approach releases COMBAT" had only ever passed vacuously.
            // The min-hold is for a fight that simply ENDED (the de-flap it was written for); a veto that
            // says "not here" is answered immediately. Same for the _combatMusic kill switch.
            const _vetoed = (s.nearCabaret === true) || (W()._combatMusic === false);
            // ── THE FADE STARTS WHEN THE FIGHT ENDS (Mark 2026-08-15: "fade the sound when combat is [REF#AU-00127]
            //    over. no more than 5 second fade. to transition.") ────────────────────────────────────
            //    WAS 10000 ms. The fade itself was never the problem — COMBAT.fadeOut has been 5000 ms
            //    since the 07-26 fade pass — but this min-hold sat IN FRONT of it: the last hostile dies,
            //    the fight music keeps the floor for ten more seconds, and only then does the five-second
            //    fade begin. Measured end-to-end that is a 15-SECOND transition against an order that
            //    says five, and from the player's seat the music simply does not react to the fight
            //    ending.
            //    WHY IT WAS THERE, and why 0 is safe: it is a DE-FLAP, written so a two-second lull
            //    between waves could not stop and restart the track. The 5000 ms fadeOut already does
            //    that job — combat resuming mid-fade re-wins COMBAT and ramps back up from wherever the
            //    gain had fallen to, which is a dip rather than a stop/restart. Holding silence for ten
            //    seconds to prevent a flap the fade already absorbs costs the transition Mark asked for.
            //    Restore the old de-flap: window._combatMinHoldMs = 10000.
            if (cur.id === 'COMBAT' && win.id === 'SECTION_BG' && !_vetoed
                && now - startedAt < num(W()._combatMinHoldMs, 0)) {
                lastWhy = 'held by COMBAT min-hold (' + Math.ceil((num(W()._combatMinHoldMs, 0) - (now - startedAt)) / 1000) + 's left)';
                return cur;
            }
            // PLAY-OUT — "keep playing the entire fight song" (Mark 2026-07-26). A play-out cue holds the floor [REF#AU-00128]
            // against anything of equal or lower priority until its track has run one full pass. Higher priority
            // (a boss cut, death) still takes it immediately — the rule is about not being interrupted by the
            // player merely WALKING somewhere, not about outranking the drama.
            // OPT-IN ONLY (see the COMBAT cue note): Mark's follow-up defined when the fight music must stop,
            // so holding the floor until the track ends is no longer the default. window._combatPlayOut = true.
            if (cur.playOut && W()._combatPlayOut === true && !poWrapped && playing()) {
                lastWhy = 'held by ' + cur.id + ' play-out (song not finished)';
                return cur;
            }
        }
        lastWhy = win.id + ' gate passed';
        return win;
    }

    // Is the active deck actually running a real track right now? [REF#AU-00129]
    function playing() {
        const a = decks[act];
        return !!(a && !a.paused && isFinite(a.duration) && a.duration > 0);
    }
    // Detect the loop wrap that stands in for 'ended' on a looping element. [REF#AU-00130]
    function trackPassTick() {
        const a = decks[act];
        if (!a || !isFinite(a.duration) || a.duration <= 0) return;
        const t = a.currentTime;
        if (t + 0.75 < poLastT) poWrapped = true;              // jumped backwards ⇒ one full pass done [REF#AU-00131]
        else if (a.duration - t < 0.35) poWrapped = true;      // or we are sitting on the last beat of it [REF#AU-00132]
        poLastT = t;
    }

    const rotIdx = Object.create(null);
    function trackFor(cue, s) {
        if (cue.silent) return null;
        if (cue.track) return cue.track(s);
        const pool = cue.pool();
        if (!Array.isArray(pool) || !pool.length) return null;
        const key = cue.latchKey;
        if (key && latch[key] && pool.indexOf(latch[key]) >= 0) return latch[key];
        // ORDERED ROTATION vs RANDOM. A rotate cue walks its pool in order, one step per episode, so the FIRST [REF#AU-00133]
        // entry is genuinely the default and the rest follow in the order they are authored. Everything else
        // rolls. (Gambling is ordered per Mark 2026-07-26; the boss rifts stay random.)
        let pick;
        if (cue.rotate) {
            // THE PRIMARY OPENS EVERY EPISODE (Mark 2026-07-27: "when gambling play marked cards at dawn as [REF#AU-00134]
            // primary gambling tune", refining 07-26's "Twin Dice Moon plays after in the rotation"). The
            // per-sit-down walk made every SECOND sit-down open on Twin Dice Moon — that is an alternation,
            // not a primary. A fresh gambling episode now always opens on pool[0] = Marked Cards at Dawn;
            // "after" is honored by the wrap-advance in tick(): when the song completes a full pass
            // mid-session the deck steps to the next track, and the NEXT session opens on the primary again.
            // Other rotate cues (combat) keep the per-episode walk — variety across fights is wanted there.
            // Off: window._gamblePrimaryFirst = false → the old per-sit-down alternation.
            // ⛔ SUPERSEDED 2026-09-25 by Mark: "the music rotation getting the caberet to play bg is quirky
            //    and skips playing other songs." KEYED ON THE CUE, NOT THE LATCH KEY — that one word is the bug.
            //    CABARET_LOUNGE (~:764) borrowed `latchKey: 'gambling'` deliberately, so walking from the lounge to
            //    the felt continues the same song instead of cutting to a different one. It thereby ALSO inherited
            //    this rule, which forces pool[0] on every pick. Its pool is loungePool() — Marked-Cards-at-Dawn,
            //    Twin-Dice-Moon, and her French number — so the lounge has only ever been able to play the FIRST of
            //    the three. Twin Dice Moon and 歌に息 were unreachable in that room by construction.
            //    The 07-27 order this implements ("when gambling play marked cards at dawn as primary gambling
            //    tune") is about GAMBLING, the felt. It is untouched: the felt still opens on the primary every
            //    episode. Only the lounge stops being governed by a rule that was never written for it.
            //    Off (back to keying on the latch): window._gamblePrimaryByLatch = true.
            if ((W()._gamblePrimaryByLatch === true ? (key === 'gambling') : (cue.id === 'GAMBLING'))
                && W()._gamblePrimaryFirst !== false) {
                pick = pool[0];
            } else {
                const k = key || cue.id;
                // ── DON'T ALWAYS OPEN ON THE SAME SONG (Mark 2026-07-27: "remember to cycle the different [REF#AU-00135]
                //    combat songs so its not always constant one song always to start"). The WALK was already
                //    varied — fight 2 differed from fight 1 — but the counter started at index 0 every time
                //    the module loaded, so the FIRST fight of every session, every reload and every
                //    death-retry opened on Kabuki-Duel, and a player who dies twice in the entrance hall hears
                //    the same opening bars three times. The counter, not the walk, was the constant.
                //    The fix is the STARTING OFFSET: a cue marked startAnywhere seeds its counter once, at a
                //    random point in the pool, then walks the authored order from there. So the rotation stays
                //    ORDERED (Mark's 07-26 ruling — never a reshuffle, never the same song twice running, and
                //    the interleaved cute/rift/cute pool order still holds) and only its entry point moves.
                //    Gambling is deliberately NOT marked: Marked Cards at Dawn is the primary and must open
                //    every episode. Off: window._combatRandomStart = false → the old fixed index-0 start.
                if (rotIdx[k] === undefined) {
                    rotIdx[k] = (cue.startAnywhere === true && W()._combatRandomStart !== false)
                        ? ((Math.random() * pool.length) | 0) : 0;
                }
                const i = rotIdx[k] % pool.length;
                rotIdx[k] = i + 1;
                pick = pool[i];
            }
        } else {
            pick = pool[(Math.random() * pool.length) | 0];
        }
        if (key) latch[key] = pick;
        return pick;
    }

    function clearStaleLatches(s) {
        // A latch survives its episode (retreat + re-approach resumes the SAME song) and is dropped only when [REF#AU-00136]
        // the episode itself is over, so the next one rolls fresh.
        //
        // ⚠ NEVER CLEAR THE LATCH OF THE CUE THAT IS CURRENTLY PLAYING. Measured 2026-07-26: with the boss
        // episode reading as over while BOSS_REVEAL still held the floor, the latch was nulled every 350 ms,
        // trackFor() re-rolled the pool on each arbitration, and the Composer crossfaded to a DIFFERENT rift
        // mid-cinematic — a song-shuffle in the middle of the shot. The playing cue owns its latch, full stop.
        const cur = CUES.find(c => c.id === curId);
        const held = cur ? cur.latchKey : null;
        // The reveal is part of the boss episode even before/after the proximity scan agrees. [REF#AU-00137]
        if (latch.boss && held !== 'boss' && s.bossAlive !== true && s.revealActive !== true) latch.boss = null;
        if (latch.bossIntro && held !== 'bossIntro' && s.revealActive !== true) latch.bossIntro = null;
        if (latch.combat && held !== 'combat' && s.inCombat !== true && s.combatTail !== true) latch.combat = null;
        if (latch.gambling && held !== 'gambling' && s.atTable !== true) latch.gambling = null;
        // ── THE CABARET BED COULD NEVER REACH ITS SECOND TRACK (Mark 2026-09-25: "the music rotation getting the [REF#AU-00290]
        //    caberet to play bg is quirky and skips playing other songs") ──────────────────────────────────────
        //    `latch.cabaretBg` had no line here — it was the only rotate cue whose latch nothing ever dropped.
        //    trackFor() returns a live latch before it ever consults the rotation (~:1313), so once
        //    BG_Cabaret_1.mp3 latched, that was the cabaret's music forever. The ONLY thing that cleared it was
        //    the wrap-advance in tick(), which needs `poWrapped` — and commit() resets `poWrapped = false` the
        //    moment the winning cue changes. So a full pass was credited only if the player stood in the cabaret
        //    for one whole uninterrupted track; walk out and back, as players do, and the counter restarted and
        //    BG_Cabaret_2.mp3 never played at all.
        //    Dropping it on LEAVING the room makes each entry step the rotation (rotIdx.cabaretBg survives the
        //    null, so the walk stays ordered — never a reshuffle, per this file's rule for every rotate cue).
        //    The "never clear the latch of the cue that is currently playing" law above is respected by `held`.
        //    Off: window._cabaretBgLatchClear = false → the old never-advances behaviour.
        if (latch.cabaretBg && held !== 'cabaretBg' && s.inCabaret !== true
            && W()._cabaretBgLatchClear !== false) latch.cabaretBg = null;
    }

    /** [REF#AU-00138]
     * WHICH DECK DOES THE INCOMING TRACK GO ON? (Mark 2026-08-11, the "chopping off" fix.)
     *
     * This function is the entire reason a third deck was added. Writing `src` on an <audio> element
     * stops it instantly, so whichever deck we hand back here has its current song CUT — not faded,
     * cut. With two decks there was no decision to make (`act ^ 1`) and the cut landed on whatever was
     * still mid-fade. Measured at gain 0.081 of a 0.125 ambient, i.e. plainly audible.
     *
     * The order of preference, and why each rung exists:
     *   1. A deck ALREADY holding this exact track and silent — reuse costs no load and no cut at all.
     *   2. The QUIETEST deck that is not `act`. Silent decks sort first, so in normal play the incoming
     *      track lands on one that is not playing anything and nothing is interrupted.
     *   3. If every other deck is somehow still audible (three switches inside one fade), we are out of
     *      room and must cut SOMETHING — so cut the quietest, which is the least audible harm, and say
     *      so in the console rather than let it pass silently. That line is the signal to raise
     *      DECK_COUNT, not something to ignore.
     *
     * ⚠ NEVER RETURNS `act`. The caller ramps `act` down as the outgoing deck immediately afterwards;
     *   handing back the same index would ramp the incoming track to zero the moment it started.
     */
    function pickIncoming(want) {
        const others = [];
        for (let i = 0; i < decks.length; i++) if (i !== act) others.push(i);
        // 1. same bytes already parked on a silent deck [REF#AU-00139]
        for (const i of others) if (srcOf[i] === want && gain[i] <= REST_EPS) return i;
        // 2/3. quietest wins; ties keep the lowest index so behaviour stays deterministic across runs [REF#AU-00140]
        others.sort((a, b) => (gain[a] - gain[b]) || (a - b));
        const best = others[0];
        if (gain[best] > REST_EPS) {
            try { console.warn('[MUSIC] every deck is still audible — cutting the quietest (gain '
                + gain[best].toFixed(3) + '). Raise window._musicDecks if this recurs.'); } catch (_) {}
        }
        return best;
    }

    /** [REF#AU-00141]
     * Put a track ON a deck and bring it up. The second half of every transition — called immediately when no
     * rest is owed, and from the tick() timer when one is. Never called for a silent cue.
     */
    function startTrack(cue, want, vol, fadeIn, fadeOut) {
        if (want === srcOf[act] && srcOf[act]) {
            // Already loaded on this deck — it just went quiet (a silent cue, or the rest we have been sitting [REF#AU-00142]
            // in). Reuse it rather than paying a second load onto the other deck for the same bytes.
            if (cue.restart) { try { decks[act].currentTime = 0; } catch (_) {} }
            gain[act] = (fadeIn <= 0) ? vol : gain[act];
            rampOver(act, vol, fadeIn);
        } else {
            const nxt = pickIncoming(want);
            setSrc(nxt, want);
            if (cue.restart) { try { decks[nxt].currentTime = 0; } catch (_) {} }
            gain[nxt] = (fadeIn <= 0) ? vol : gain[nxt];   // hard cut = start at full [REF#AU-00143]
            rampOver(nxt, vol, fadeIn);
            rampOver(act, 0, fadeOut);
            act = nxt;
        }
        try { W()._bgMusicEl = decks[act] || W()._bgMusicEl; } catch (_) {}   // keep the legacy handle live for _audioDiag + the pause lists [REF#AU-00144]
    }

    /** Record the decision. Runs the moment a cue WINS, even if its audio is still waiting out the rest — the [REF#AU-00145]
     *  cue table, the dwell timer, the telemetry and window._audioDiag all reason about the DECISION, and
     *  holding them back for five seconds of silence would make the diag lie about what the score is doing. */
    function commit(cue, want, vol, now) {
        const prev = curId, prevTrack = curTrack;
        if (prev !== cue.id) { poWrapped = false; poLastT = 0; }   // a new cue starts a fresh play-out pass [REF#AU-00146]
        curId = cue.id; curTrack = want; startedAt = now;
        if (cue.id === 'POST_COMBAT') postCombatReady = true;
        try { W()._bgMusicEl = decks[act] || W()._bgMusicEl; } catch (_) {}
        try { W()._bossTrackLatched = latch.boss || null; } catch (_) {}      // legacy mirror [REF#AU-00147]
        try { W()._bossRiftOn = (cue.id === 'BOSS' || cue.id === 'BOSS_REVEAL'); } catch (_) {}
        if (prev !== curId || prevTrack !== curTrack) onCue({ cue: curId, from: prev, track: curTrack, vol, reason: lastWhy });
    }

    function switchTo(cue, s, now) {
        const want = trackFor(cue, s);
        const master = masterOn();
        const vol = (cue.silent || !master) ? 0 : clamp01(cue.vol ? cue.vol() : ambVol());

        if (cue.id === curId && want === curTrack) {
            // FX-DUCK: while ducked, arbitration must not haul the gain back up before duckUntil — same [REF#PENDING] [REF#AU-00273]
            // reasoning as the per-frame guard in tick() (search 'FX-DUCK STATE').
            if (now < duckUntil) return;
            // Same cue + same track → just retarget the gain (a slider move, a mute). ⚠ NOT while a rest is [REF#AU-00148]
            // running: during the rest this branch is reached every 350 ms with the target already committed,
            // and ramping `act` here would haul the outgoing song back up out of the silence it is supposed
            // to be leaving. The pending side owns the deck until it fires.
            // ⚠ And NOT over a live authored fade — the second of the two stomp sites (the other is the
            // per-frame retarget in tick(); the same reasoning and the same measurement apply). Arbitration
            // lands here 350 ms into a 1200 ms fade-in and used to re-rate it to 250 ms full-scale, which
            // took COMBAT to full gain 400 ms after the cue instead of 1200. Move the target, keep the shape.
            if (!pend) {
                // ── A SILENT CUE'S FADE IS NOT A MUTE (Mark 2026-08-14: "when combat ends, music should [REF#AU-00149]
                //    softly fade out, not abrupt end") ────────────────────────────────────────────────
                //    MEASURED: gain went 0.418 → 0 in 250 ms when an audible cue lost its gate — the exact
                //    value of `_musicRetargetMs`, which is how this line was identified. `switchTo` had
                //    already started the authored 5 s ramp; arbitration then re-entered here 350 ms later
                //    with cue.id === curId and want === curTrack (both null for a silent cue), took the
                //    same-cue retarget branch, and re-rated the 5 s fade down to 250 ms. The fade was
                //    always being started — and always being stomped one tick later.
                //    ⚠ THE `vol > 0` EXCLUSION IS STILL RIGHT FOR WHAT IT WAS WRITTEN FOR, and it stays:
                //      a target of 0 because the MASTER IS MUTED is Mark's "shut off ALL music" control
                //      and must snap (the tick() note spells out why — a mute pressed 1.1 s into a fade-in
                //      taking another 1.1 s to go quiet). But a target of 0 because a SILENT CUE won
                //      arbitration is a different animal: that zero has an authored fadeOut attached to it,
                //      and honouring it is the whole of "fade out, not abrupt end".
                //      So: protect the in-flight shape when the master is ON and the cue is silent; snap in
                //      every other zero case, exactly as before.
                //    Restore the old always-snap behaviour: window._silentCueFade = false.
                const _authoredSilence = (vol === 0 && master && cue.silent && W()._silentCueFade !== false);
                if ((vol > 0 || _authoredSilence) && now < fadeUntil[act]) goal[act] = vol;   // keep the shape, move the target [REF#AU-00150]
                else ramp(act, vol, num(W()._musicRetargetMs, 250));
            }
            return;
        }

        const sc = fadeScale();
        let fadeOut = num(cue.fadeOut, DEF_FADE) * sc;
        // ── LEAVING A FIGHT FADES ON THE FIGHT'S OWN CLOCK ─────────────────────────────────────────── [REF#AU-00263]
        //   ⛔ SUPERSEDED 2026-09-18 by Mark, live in chat: "when combat is over - fade music softly 25%
        //      every second soft fade music tracks." He gave a RATE, not a duration: losing 25% of the
        //      level per second reaches silence in 4 s, so the ramp is 5000 -> 4000 ms. Third number on
        //      this one knob and every one of them was judged by ear, which is the right way to settle it.
        //      The 09-06 entry below (5000) is HISTORICAL now.
        //   ⚠ THE RATE HOLDS ONLY BECAUSE THIS RAMP IS LINEAR. A 25%/s rate and a 4 s duration are the
        //     same instruction for a linear ramp and DIFFERENT instructions for an exponential one
        //     (x0.75 per second never reaches zero — it is still at 32% after 4 s). If this transition is
        //     ever moved onto exponentialRampToValueAtTime, 4000 stops meaning what Mark asked for.
        //   ⛔ SUPERSEDED 2026-09-06 (minutes later) by Mark, live in chat, relayed via CODER2: "yeah 2.5
        //      seconds seemed to quick, lets do a 5 second fade." Same knob, second number in one
        //      session — he heard the 2500 ms ramp and asked for longer, not shorter. Ramp now 5000 ms.
        //   ⛔ SUPERSEDED 2026-09-06 (first pass, same day) by Mark, live in chat: "fix the music fade 2.5
        //      soft after combat ends, not abrupt. its to add to that sensory politeness." The 09-04
        //      800 ms ramp below (measured, blessed, and itself a supersession of an earlier 2500) read
        //      as abrupt to him — HISTORICAL now, itself overruled by the entry immediately above. DEF_FADE
        //      (2500, a coincidence of that earlier tuning) is UNCHANGED — see the note two lines down for
        //      why that one governs a different transition and was never touched either way.
        //   ⛔ SUPERSEDED 2026-09-04 — the combat exit now targets a 2000 ms total, for the COMBAT-EXIT
        //      transition ONLY. Provenance and the order it retires: DISABLED-FEATURES REGISTER, M2.
        //      HISTORICAL below (the 800 ms figure), overruled by the entry immediately above.
        //   ⚠⚠ A CUE'S `fadeOut` GOVERNS THE TRANSITION *INTO* THAT CUE, NOT OUT OF IT. The line above
        //     reads `cue.fadeOut` where `cue` is the INCOMING cue, so the outgoing deck's ramp is
        //     specified by the destination. MEASURED THE HARD WAY 2026-09-04: I first "fixed" this by
        //     setting COMBAT's own fadeOut to 1300 and the exit ramp did not move one millisecond —
        //     2365 ms before and after — because leaving combat for silence falls to the DESTINATION's
        //     value, and an absent destination falls to DEF_FADE. That edit was reverted; it would have
        //     shortened fades INTO combat, which nobody asked for. Right value, wrong object.
        //   ⚠ DEF_FADE (2500) keeps its value here — it governs TRACK-TO-TRACK crossfades, a separate
        //     concern from this one. This branch evaluates true only when the cue being LEFT is COMBAT
        //     and the one arriving is not, so no other transition's timing changes. See register M2.
        //   ⭐ WHY 800, DERIVED FROM THE DECOMPOSITION (scripts/probe-m3-exit-stack.js, floor 1). The
        //     exit is three serial costs, not one: the tail grace (~250 ms, Engine9) + THIS CUE'S OWN
        //     `dwell: 1200` REMAINDER + this ramp. The envelope is 2000 ms from radius-genuinely-empty
        //     to silence, and 800 leaves room for the first two in the ordinary case.
        //     ⛔ I FIRST CALLED THE MIDDLE TERM "ARBITRATION LATENCY (~853 ms)" AND THAT LABEL WAS
        //       WRONG — corrected here rather than left standing. `_composerArbMs` is 350 ms (~:1510)
        //       and cannot produce the 654/1160/813 ms spread I measured. The real term is `dwell`:
        //       COMBAT carries `restart: true`, so each combat pulse RESTARTS the cue and resets its
        //       dwell clock, and the cue cannot be replaced until 1200 ms have passed since then. The
        //       spread was the phase between the last pulse and the fight ending, not a varying
        //       latency. A number measured correctly can still be attributed to the wrong mechanism.
        //     MEASURED ×3 at SHIPPED defaults, fight running past its dwell (the ordinary case):
        //       SILENT at 885 / 936 / 1185 ms, ramp starting within 32-369 ms of the radius emptying.
        //     ⚠ BOUNDED WORST CASE, recorded not hidden: a fight that ENDS INSIDE the first 1200 ms of
        //       its own music pays the dwell remainder — measured 2055 ms on one such run, i.e. just
        //       over the envelope. That is `dwell` doing its job (it is COMBAT's de-flap), so it is
        //       reported for a decision rather than tuned away from under it. Shortening `dwell` would
        //       trade a rare 250 ms overshoot for music that can flap on a two-second skirmish.
        //   Knob: window._combatExitFadeMs (default 4000 = 25%/s). 5000 restores the 2026-09-06 fade,
        //   2500 that session's first pass, 800 the 2026-09-04 snappy ramp.
        // NOT touched by the 2026-09-19 blanket 0.5s order (see DEF_FADE) — this number is not a plain [REF#PENDING]
        // duration, it is Mark's own explicit RATE rule ("fade music softly 25% every second", 09-18), and a
        // flat 500ms would silently overrule a rate he dictated in different terms. Flag to Mark if he wants
        // this one touched too; not assumed here.
        if (curId === 'COMBAT' && cue.id !== 'COMBAT') {
            fadeOut = num(W()._combatExitFadeMs, 4000) * sc;   // 4 s = Mark's 25%-per-second, 2026-09-18 [REF#AU-00263b]
        }
        // ── THE CABARET-DOOR HUSH IS LIVE-TUNABLE FROM HERE, for the reason the cue table states: [REF#AU-00264]
        //   `CUES` is a module-level const built once at load, so a knob read inside the table would be
        //   frozen at load time. Read per transition instead, so the number can be judged by ear and
        //   changed without a reload. The 800 default matches the literal in the cue table; this line
        //   changes nothing until the knob is actually set.
        if (cue.id === 'CABARET_HUSH') {
            fadeOut = num(W()._cabHushFadeMs, 800) * sc;
        }
        let fadeIn = num(cue.fadeIn, DEF_FADE) * sc;
        // The reveal's hard cut is the one intentional exception — it lands on a camera cut. Soften on request. [REF#AU-00151]
        if (cue.id === 'BOSS_REVEAL' && W()._bossRevealHardCut === false) fadeIn = DEF_FADE * sc;

        // Does this switch owe the listener five seconds of quiet? (See the REST block above the cue table.) [REF#AU-00152]
        //   · Nothing audible is being interrupted ⇒ no. Silence has already been running for however long it
        //     has been running; charging another 5 s on top of the death cue, or of ROOM_OWNED inside the
        //     cabaret, would just delay the next song behind the player's ear instead of easing it in.
        //   · A cue marked noRest ⇒ no. The rest is a SCENE CHANGE — it belongs where the music is answering
        //     a place. It does not belong where the music is answering an EVENT, because there the sound IS
        //     the information and five seconds late is five seconds of a fight the player was not told about.
        //     Force the rest onto every cue, exempt ones included, with window._musicGapAll = true.
        const exempt = (cue.noRest === true && W()._musicGapAll !== true);
        const owed = gapMs() > 0 && gain[act] > REST_EPS && !exempt;

        if (!want) {                                   // silent cue → fade the deck out, keep the track loaded [REF#AU-00153]
            pend = null;                               // whatever was queued is moot: the answer is now silence [REF#AU-00154]
            rampOver(act, 0, fadeOut);
        } else if (pend && !exempt) {
            // AT MOST ONE REST PER TRANSITION. The score changed its mind mid-rest — a fight ended, SECTION_BG [REF#AU-00155]
            // was queued, and a hostile walked in two seconds later. Swap the DESTINATION and keep the
            // original deadline. Re-queueing here instead would let a flapping gate stack rest on rest and
            // stretch a couple of seconds of quiet into a silent minute.
            pend.cue = cue; pend.track = want; pend.fadeIn = fadeIn;
        } else if (want === srcOf[act] && srcOf[act] && gain[act] > REST_EPS) {
            // SAME TRACK ALREADY AUDIBLE ON THE DECK — this is the BOSS_REVEAL → BOSS demotion. Do NOT reload: [REF#AU-00156]
            // the playhead continues, so the fight inherits the song already in the air (Mark's ruling). And
            // no rest is owed: there is no switch to hear. Resting here would mean stopping a song, waiting
            // five seconds, and then starting the SAME song again — a seam where the music never changed.
            if (cue.restart) { try { decks[act].currentTime = 0; } catch (_) {} }
            rampOver(act, vol, fadeIn);
        } else if (owed) {
            rampOver(act, 0, fadeOut);                                          // the room empties first… [REF#AU-00157]
            pend = { cue, track: want, fadeIn, at: now + fadeOut + gapMs() };   // …then the new song comes in [REF#AU-00158]
        } else {
            // ⚠ AN EXEMPT CUE CANCELS A REST IN FLIGHT — it does not inherit its deadline. Without this, [REF#AU-00159]
            // `noRest` only meant "do not START a rest", and a cue that arrived while one was already
            // running fell into the retarget branch above and quietly took over the rest's clock, waiting
            // out someone else's silence. MEASURED, and it was the whole feature failing exactly where it
            // was asked for: the boss reveal landed on a deck that had been playing the dungeon theme for
            // 46 s (probe: "reveal restarted at 0:00" → 46.54 s), and COMBAT — the cue Mark marked exempt
            // because "combat music starts too slow" — would have sat behind up to 7 s of rest whenever a
            // fight began during a transition, which is precisely when fights begin.
            pend = null;
            startTrack(cue, want, vol, fadeIn, fadeOut);
        }
        commit(cue, want, vol, now);
    }

    return {
        silenceNow,
        /** FX OVERRIDE (Mark 2026-09-19: "override new card - room fx sound permits etc get override on [REF#PENDING] [REF#AU-00275]
         * all music including bg + combat + other"). A brief, self-restoring duck of every currently-audible
         * music layer — the Composer's own decks AND window._succubusSong, which the Composer deliberately
         * does not own the transport of (search "does NOT own the transport of"). Ducks fast (dip, short and
         * fixed) and holds for `ms` (default 500, Mark's number) via duckUntil, which the tick()/switchTo
         * guards above respect so arbitration cannot haul the volume back up mid-hold. Restore is automatic:
         * once duckUntil passes, the very next frame's want-recompute ramps back to the cue's normal volume
         * over 120ms — no separate restore bookkeeping needed. Call from wherever a one-shot SFX plays
         * (Engine9.html _playSfxFile), not from music code.
         */
        duck(ms) {
            const dip = 80;   // fixed fast dip — independent of the hold length [REF#AU-00276]
            const hold = Math.max(0, num(ms, 500));
            const t = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            duckUntil = t + hold;
            for (let i = 0; i < decks.length; i++) if (decks[i] && gain[i] > 0.001) rampOver(i, 0, dip);
            try {
                const el = W()._succubusSong;
                if (el && !el.paused && el.volume > 0.001) {
                    const restoreTo = el.volume;
                    el.volume = 0;
                    setTimeout(() => { try { if (el && !el.paused) el.volume = restoreTo; } catch (_) {} }, hold);
                }
            } catch (_) {}
        },
        /** [REF#AU-00160]
         * SKIP THE AMBIENT TRACK (Mark 2026-08-15 — the Winamp ⏮/⏭ that never worked).
         *
         * `stableBgTrack` caches one track per section on purpose: room and hallway changes are not
         * musical scene changes, so it only re-picks when the segment id actually changes. That cache is
         * exactly what makes ⏭ a no-op for ambient music — the arbitration re-runs every 350 ms and keeps
         * being handed the same answer. Invalidating it is therefore the whole skip: the next pick draws
         * from the shuffle bag, and the bag already guarantees the new track is not the one just playing.
         *
         * Returns false when the ambient cue is not what is audible (a fight, her stage, the boss), so the
         * caller can fall through to the music page's own list instead of silently doing nothing — the
         * failure mode this button has had all along.
         */
        skipBg() {
            if (curId !== 'SECTION_BG') return false;
            _bgSectionTrack = null; _bgSectionId = null;   // force stableBgTrack to re-draw [REF#AU-00161]
            silenceNow('bg-skip');                          // drop the current one now; the next tick brings the new [REF#AU-00162]
            return true;
        },
        /** [REF#AU-00163]
         * Drive the Composer. Call every frame from the engine's existing tick; arbitration self-throttles to
         * `_composerArbMs` (350 ms, matching the watcher it replaced) while the gain ramps run every call.
         */
        tick(state, now, dtMs) {
            try {
                const s = state || {};
                lastState = s;
                observeCombatState(s);
                nowMs = num(now, nowMs);   // rampOver stamps its fade deadline off this [REF#AU-00164]
                // ── THE REST EXPIRES → BRING THE NEW SONG IN ──────────────────────────────────────────────── [REF#AU-00165]
                // The deck has been silent since switchTo faded it out. Volume is read HERE rather than when
                // the rest was scheduled, on purpose: the combat proximity curve keeps moving while the room
                // is quiet, so a monster that closed the distance during those five seconds gets the loud
                // entrance it earned instead of the volume it would have had a beat ago.
                if (pend && now >= pend.at) {
                    const p = pend; pend = null;
                    const master = masterOn();
                    const vol = (p.cue.silent || !master) ? 0 : clamp01(p.cue.vol ? p.cue.vol() : ambVol());
                    startTrack(p.cue, p.track, vol, p.fadeIn, 1);   // fadeOut 1ms: the old deck is already at 0 [REF#AU-00166]
                    poWrapped = false; poLastT = 0;                 // the incoming song owns the next play-out pass [REF#AU-00167]
                }
                // Every frame: watch for the loop wrap that means "the song finished". NOT during a rest — [REF#AU-00168]
                // the frozen playhead of the deck we just faded out is not a song finishing, and letting it
                // register would hand the wrap-advance below a pass that nobody heard.
                if (!pend) trackPassTick();
                // A long fight advances at the actual end of each track, not just between fights. [REF#AU-00322]
                // Use the same arbitration/transport and keep the next encounter's cursor in sync.
                if (!pend && curId === 'COMBAT' && decks[act]?.ended
                    && (s.inCombat === true || s.hostilesNear === true)) {
                    const cp = combatPool();
                    if (cp.length > 1) {
                        const next = (cp.indexOf(curTrack) + 1) % cp.length;
                        latch.combat = cp[next];
                        rotIdx.combat = next + 1;
                        poWrapped = false; poLastT = 0; lastArb = -Infinity;
                    }
                }
                if (curId === 'POST_COMBAT' && poWrapped) {
                    postCombatReady = false;
                    s.postCombatReady = false;
                }
                // GAMBLING WRAP-ADVANCE (Mark 2026-07-27, with trackFor's primary-opens rule): "plays after [REF#AU-00169]
                // in the rotation" now means after the SONG — when the table/lounge deck finishes a full
                // pass, step the shared gambling latch to the next pool entry and let the next arbitration
                // crossfade to it. Consuming the wrap here does not fight COMBAT play-out: that hold only
                // reads poWrapped while a COMBAT cue owns the floor, and this branch only runs on 'gambling'.
                if (poWrapped && W()._gamblePrimaryFirst !== false) {
                    const curC = CUES.find(c => c.id === curId);
                    if (curC && curC.latchKey === 'gambling' && latch.gambling) {
                        if (curC.id === 'CABARET_LOUNGE') {
                            // ONE PASS, THEN THE STAGE IS HERS AGAIN (Mark 2026-07-27: "the caberet background [REF#AU-00170]
                            // track plays the marked-cards-at-dawn … then play starlettes second set … after the
                            // marked cards"). The lounge interlude plays its track through ONCE and stamps this
                            // timestamp; the engine's rest-release watches it and starts her next set. NO pool
                            // advance here — each lounge interlude is a fresh episode and re-opens on the primary,
                            // so the program is always: her set → 5s hush → Marked Cards once → her next set.
                            try { W()._cabLoungePassDone = (W().performance ? W().performance.now() : 0); } catch (_) {}
                            poWrapped = false; poLastT = 0;
                        } else {
                            const gp = gamblePool();
                            if (gp.length > 1) {
                                const at = gp.indexOf(latch.gambling);
                                latch.gambling = gp[(at + 1) % gp.length];   // at=-1 → gp[0], the primary — safe [REF#AU-00171]
                                poWrapped = false; poLastT = 0;              // this pass is spent; the next belongs to the next song [REF#AU-00172]
                            }
                        }
                    }
                }
                // CABARET_BG WRAP-ADVANCE, 5-SECOND PAUSE (Mark 2026-09-19, cabaretBg wrap — see the cue's [REF#PENDING] [REF#AU-00277]
                // own comment above UNEARNED_MUSIC). Independent of the gambling branch above: its own latchKey,
                // its own pool, and — unlike gambling's zero-gap advance — this one is a DELIBERATE, named,
                // narrow exception to rule #1's zero-gap law (same shape as CABARET_HUSH's own exception).
                // Drop the latch (force a fresh pick, not a stale reuse) and stamp a hush-until timestamp the
                // cue's own gate reads back; the floor falls through to whatever cue is next for the pause —
                // no separate silence machinery needed, no interaction with the gambling/lounge latch above.
                if (poWrapped) {
                    const curC2 = CUES.find(c => c.id === curId);
                    if (curC2 && curC2.latchKey === 'cabaretBg' && latch.cabaretBg) {
                        const cbp = cabaretBgPool();
                        if (cbp.length > 1) {
                            const at2 = cbp.indexOf(latch.cabaretBg);
                            rotIdx.cabaretBg = ((at2 + 1) % cbp.length);   // next arbitration's trackFor() walks from here [REF#PENDING] [REF#AU-00278]
                        }
                        latch.cabaretBg = null;
                        // ⛔ SUPERSEDED 2026-09-25 by Mark (same order as the lounge disable above): the 5-second pause between [REF#PENDING] [REF#AU-00291]
                        // rotations is the SECOND switcher. Its own 2026-09-19 note admits what it does — "during the 5s hush the
                        // floor falls through to whatever cue is next (SECTION_BG/UNEARNED_MUSIC) rather than true silence" — so
                        // every wrap handed the room to a DIFFERENT cue for five seconds and then took it back. A gap that another
                        // track fills is not a gap, it is a switch, and it fires once per track for as long as you stand there.
                        // Default is now 0 = the rotation crossfades straight into the next cabaret track and nothing else can get
                        // in. His 09-19 "pause interval 5 seconds between rotations" is overruled by today's complaint; it is also
                        // the reading most consistent with rule #1 (music never hard-stops), which that pause was a named exception to.
                        // Restore the pause: window._cabaretBgPauseMs = 5000.
                        try { W()._cabaretBgHushUntil = (W().performance ? W().performance.now() : Date.now()) + num(W()._cabaretBgPauseMs, 0); } catch (_) {}
                        poWrapped = false; poLastT = 0;
                    }
                }
                const arbMs = num(W()._composerArbMs, 350);
                if (now - lastArb >= arbMs) {
                    lastArb = now;
                    clearStaleLatches(s);
                    switchTo(arbitrate(s, now), s, now);
                } else if (curId && !pend) {
                    // master mute / live volume-slider moves land immediately, not on the next arbitration. [REF#AU-00173]
                    // Skipped while a rest is running — see the same guard in switchTo: this deck is on its
                    // way DOWN and must stay there. The value is picked up when the rest fires.
                    const cue = CUES.find(c => c.id === curId);
                    if (cue && now < duckUntil) {
                        // Ducked: leave goal[act] exactly where duck() put it (0, via its own short rampOver). [REF#AU-00279]
                        // Falls through to applyGain() below untouched — no want-recompute fights it here.
                    } else if (cue) {
                        const master = masterOn();
                        const want = (cue.silent || !master) ? 0 : clamp01(cue.vol ? cue.vol() : ambVol());
                        // ⚠⚠ DO NOT STOMP AN AUTHORED FADE. This branch runs on EVERY non-arbitration frame — [REF#AU-00174]
                        // roughly twenty of them between arbitrations — and it used to call
                        // ramp(act, want, 120) unconditionally. That overwrote the rate of whatever cue fade
                        // had just started, one frame after it started, with a flat 120 ms full-scale ramp.
                        // So every fadeIn in the cue table has been a 120 ms CUT since the day the fades were
                        // lengthened to seconds to answer "music changes too abruptly" (2026-07-26) — the
                        // numbers were right, the ramp was being replaced before it could travel. MEASURED,
                        // not inferred: COMBAT's 1200 ms fadeIn reached full gain in 64 ms, which is why the
                        // fight music arrives like a switch being thrown. (Fade-OUTs escaped this: they ride
                        // the deck this branch does not touch, which is why only the ins ever sounded wrong.)
                        // While an authored fade is still due, move the TARGET and leave the RATE alone — a
                        // mute or a slider move still lands within the frame, and the proximity swell still
                        // tracks the monster, but the transition keeps the shape the cue table gave it. Once
                        // the fade is due to have landed, the old snappy retarget is exactly right again.
                        // ⚠ SILENCE IS NEVER PROTECTED. The guard covers targets that are still MUSIC — a
                        // slider nudge, the combat proximity swell. A target of 0 is the master mute or a
                        // silent cue, and those are Mark's "shut off ALL music" control: honouring the
                        // in-flight rate there would have let a mute pressed 1.1 s into COMBAT's fade-in take
                        // another 1.1 s to actually go quiet. Off it goes, at the snappy rate, always.
                        // ── …AND A SILENT CUE'S FADE-OUT IS NOT A MUTE EITHER (Mark 2026-08-14: "when
                        //    combat ends, music should softly fade out, not abrupt end") ────────────────
                        //    ⚠ THE PARENTHETICAL ABOVE — "Fade-OUTs escaped this: they ride the deck this
                        //      branch does not touch" — STOPPED BEING TRUE the moment a SILENT cue can own
                        //      `curId`. When combat ends, the winner IS a silent cue, so `act` is the deck
                        //      that is fading out and this branch lands on it every frame with want=0 and
                        //      ramps it flat over 120 ms. MEASURED: 0.42 → 0 inside one 250 ms sample, with
                        //      the authored 5 s fade correctly started and then overwritten ~16 ms later.
                        //      Fixing the twin in switchTo() alone changed NOTHING, because this runs ~20×
                        //      more often — which is how the real site was identified.
                        //    The master-mute exclusion is untouched and still snaps: only a silent CUE with
                        //    the master ON keeps its shape. Restore: window._silentCueFade = false.
                        const _authoredSil = (want === 0 && master && cue.silent && W()._silentCueFade !== false);
                        if ((want > 0 || _authoredSil) && now < fadeUntil[act]) goal[act] = clamp01(want);
                        else ramp(act, want, 120);
                    }
                }
                const dt = Math.max(0, Math.min(250, num(dtMs, 16)));
                // ⛔ SUPERSEDED 2026-09-19 — was hardcoded `i < 2`, left over from before the 2026-08-11 3rd/4th [REF#AU-00280]
                // deck was added (DECK_COUNT, ~:1012). pickIncoming() legitimately returns index 2+ on
                // back-to-back noRest transitions (its own doc comment names COMBAT→BOSS_REVEAL) — exactly
                // the scenario the extra deck exists for — but this loop never applied THAT deck's gain or
                // called .play()/.pause() on it, so it sat there fully "active" by every other bookkeeping
                // field (act, window._bgMusicEl) while remaining silently paused: a scripted moment goes mute
                // with every other diagnostic reporting it as correct. Mark: "plays the wrong music at wrong
                // times" — this is the mechanism, not just the symptom.
                for (let i = 0; i < decks.length; i++) {
                    if (!decks[i]) continue;
                    if (gain[i] !== goal[i]) {
                        const step = rate[i] * dt;
                        gain[i] = (gain[i] < goal[i]) ? Math.min(goal[i], gain[i] + step) : Math.max(goal[i], gain[i] - step);
                    }
                    applyGain(i);
                }
            } catch (e) { onError(e); }
        },

        /** Force the boss cue to re-cut from 0:00 — called when the CAM ZOOM reveal opens. [REF#AU-00175] */
        cueBossReveal(now) {
            try {
                const cue = CUES.find(c => c.id === 'BOSS_REVEAL');
                if (cue && lastState) switchTo(cue, Object.assign({}, lastState, { revealActive: true }), num(now, 0));
            } catch (e) { onError(e); }
        },

        /** [REF#AU-00176]
         * MAY THE CABARET SONG BE HEARD RIGHT NOW? → 0 or 1. (Mark 2026-07-26: "this will prevent the caberet song
         * from playing while the gambling is going on. make sure the composer controls ALL music.")
         *
         * 秘密のダンス is the one track the Composer does NOT own the transport of — the treasured cabaret scene owns
         * its own play/pause, and that stays true. What the Composer owns now is the AUTHORITY: whether the song is
         * permitted to be audible at all. window._cabSongGain() multiplies its room/door geometry by this.
         *
         * THE RULE IS ONE LINE OF REASONING: if the Composer has a real track playing, nothing else may play over
         * it. Gambling, combat, a boss rift, the dungeon theme — all non-silent cues, all silence her song. The
         * only cues that leave room for it are the SILENT ones, and of those, death and the door-hush say no
         * outright. What is left is ROOM_OWNED — "you are in the cabaret and the Composer has stood down" — which
         * is exactly when her song should be the only thing you hear.
         *
         * This is what makes the gambling music work the way Mark asked: the felt is IN the cabaret, GAMBLING (500)
         * outranks ROOM_OWNED (400), so sitting down silences her song for the length of the game with no special
         * case anywhere. Off: window._composerOwnsCabSong = false (restores geometry-only).
         */
        cabSongAllowed() {
            if (W()._composerOwnsCabSong === false) return 1;
            if (!masterOn()) return 0;
            // NOT UNTIL THE PLAYER HAS CLICKED OK (Mark 2026-07-26: "do not play caberet song until player has [REF#AU-00177]
            // clicked OK"). The cabaret already gated her CLIPS on _cabGuideAck; the Composer is the authority on
            // whether the song may be heard, so the same gate belongs here or the two disagree — she would stand
            // still on stage while her song played over the guidebook.
            // ⛔ SUPERSEDED 2026-10-02 in part, by Mark: "i gave a new song - and you got the bg caberet as only song playing. i told you" — a song she
            // OWES (started, not yet heard) clears an unanswered OK once no guidebook is open: Engine9's owed-song watchdog. The gate below stays for every other start.
            if (W()._cabGuideAck !== true) return 0;
            // JUKEBOX — ONE SONG AT A TIME (2026-10-02). Outside the cabaret only the dungeon's music plays (section BG, a fight, a room's [REF#AU-00304]
            // song), so her song is silent there under every cue. It used to stay at full gain outside under any cue, which is how her song
            // played on top of the fight music. Old behaviour: window._jukeboxOneSong = false.
            if (W()._jukeboxOneSong !== false && W()._cabInsideNow === false) return 0;
            // A cabaret song never follows the player into another section. Section audio is [REF#AU-00323]
            // owned by the section/room/combat cues once the player leaves the cabaret.
            if (W()._cabInsideNow !== true) return 0;
            if (curId === 'JUKEBOX') return 1;   // a dropped-off card is playing: nothing turns her down [REF#AU-00305]
            // CABARET_HUSH is NOT a veto on her song — it is a veto on everything ELSE. "When caberet doors open [REF#AU-00178]
            // silence music" means the dungeon/fight music gets out of the way so the cabaret's own song owns the
            // room; reading it as "silence all audio" made the hush permanent (its gate is true for as long as you
            // stand inside with the doors open) and would have left the treasured scene mute. Caught by
            // scripts/probe-cabaret-song.js before it shipped.
            if (curId === 'SILENCE') return 0;
            // HIS SHOW IS ONE SONG (2026-10-01, knowledge/design/SHOWTIME_2026-10-01.md). While SHOWTIME holds the deck her [REF#AU-00306]
            // song may neither be heard nor start — cabaretSongMayPlay() reads this through _cabSongGain, so a refused start
            // is deferred by the transport's retry rather than dropped. Off: window._showtimeHoldsHer = false.
            if (curId === 'SHOWTIME' && W()._showtimeHoldsHer !== false) return 0;
            // A SPECIAL ROOM'S SONG STOPS HER TOO (2026-10-01) — her song pauses while it plays and picks up after. Off: _roomSongHoldsHer = false. [REF#AU-00307]
            if (curId === 'ROOM_SONG' && W()._roomSongHoldsHer !== false) return 0;
            if (curId === 'CABARET_HUSH') return 1;
            // CABARET_LOUNGE is the stand-in for her song, not a rival: it only plays BECAUSE she is not, and it [REF#AU-00179]
            // must not be able to hold her out when she starts again. Permitting her here means the handover is
            // decided in ONE place (the lounge cue's gate) instead of two authorities each waiting on the other.
            if (curId === 'CABARET_LOUNGE') return 1;
            // CABARET_BG IS A BED, NOT A RIVAL — SAME RULE AS THE LOUNGE ONE LINE UP (2026-10-01). [REF#PENDING] [REF#AU-00308]
            // Measured: the bed's own gate is `s.cabSongPlaying !== true`, so it plays only BECAUSE she is
            // silent — and this function answered 0 for it, so `cabaretSongMayPlay()` refused her start.
            // Bed plays because she is quiet; she stays quiet because the bed plays. A returned song card
            // landed in `_cabSongQueue` and was never heard, which also stopped `_legendaryFinishedSeq`
            // from ever ticking (Engine9 ~:54297) and so stopped the bonus round from opening.
            // Permitting her here hands the changeover to the bed's OWN gate, exactly as the lounge does.
            // Off: window._cabSongYieldToBg = true (restores the 0 and the deadlock with it).
            if (curId === 'CABARET_BG' && W()._cabSongYieldToBg !== true) return 1;
            const cue = CUES.find(c => c.id === curId);
            // ⛔ SUPERSEDED 2026-09-24 by Mark: "if outside caberet, just lower volume 10% by tile -- soft fader, not sudden" — outside the [REF#AU-00284]
            // cabaret this returned 0 the moment the deck won a real cue, which is the sudden cut he hears at the door. Outside, her song
            // stays PERMITTED and the engine's _cabSongGain fader (10%/tile, ~:34381) carries it down; inside, a real cue still owns the floor. [REF#PENDING]
            if (cue && !cue.silent) return (W()._cabSongFadeOutside !== false && W()._cabInsideNow === false) ? 1 : 0;   // [REF#AU-00180]
            return 1;
        },

        /** THE START AUTHORITY FOR HER SONG (Mark 2026-08-01: "there should be a music controller, [REF#AU-00181]
         *  so lets have it control ALL caberet music for now on"). cabSongAllowed() above answers
         *  "may she be HEARD" (consumed by _cabSongGain every frame); this answers "may a START
         *  land" — the transport wrapper on the 'cabaret-song' element (Engine9
         *  _installMusicTransport) consults it before any of the eleven callers' play() connects.
         *  Moved VERBATIM from Engine9's _cabSongMayPlay (~:19186), which is now a shim, so one
         *  module holds every cabaret music decision: deck (cues) · gain (cabSongAllowed) ·
         *  starts (here).
         *
         *  ── SHE DOES NOT SING OVER THE HOUSE BAND (Mark 2026-07-30) ─────────────────────────
         *  "there is a conflict of sounds happening upon entering caberet. there is intermission
         *  song that sometimes plays over the songs." CONVICTED, NOT GUESSED: the transport
         *  ledger named `_step` — her walk-home arrival — restarting the song while
         *  CABARET_LOUNGE still held the floor. Commit 82679fa tried to fix that by deleting the
         *  .play() and moving the decision here the hard way; it was reverted the same day. The
         *  rule lives in the single start authority instead, where it covers that caller, the
         *  other ten, and the twelfth somebody adds next month.
         *
         *  IT CANNOT WEDGE THE CABARET SILENT: the refusal requires the lounge to be AUDIBLE
         *  right now, and the lounge's own pass-spent rule drives it under REST_EPS within
         *  ~200 ms of finishing its single pass — the veto lifts itself well before the engine's
         *  1200 ms rest-release starts her next set. And a refused start is a DEFERRAL, never a
         *  drop: the transport's bounded retry (retryWhenAllowed) re-lands it when this lifts.
         *
         *  Knobs preserved: _songStartGate=false → pre-07-19 launch-anywhere ·
         *  _cabSongYieldToLounge=false → old stacking · priming is always exempt. */
        cabaretSongMayPlay() {
            const w = W();
            if (w._songStartGate === false) return true;
            if (w._cabaretAudioPriming === true) return true;   // muted boot prime — always allowed [REF#AU-00182]
            // THE INTRO OWNS THE FIRST START (Mark 2026-08-01 "you have 2 songs launching when caberet [REF#AU-00183]
            // starts"): between the activation frame and the staged intro beat (~2.6s later), her
            // walk-home arrival / guide-ack / post-rest starters all race to launch whatever the element
            // holds — a second song under 歌に息. While the set-piece is pending, every start is refused;
            // _activateCabaret clears the flag the instant before it fires the intro itself. A refused
            // start's bounded retry self-cancels once the element is already playing.
            if (w._cabIntroPending === true) return false;
            if (w._cabSongYieldToLounge !== false
                && curId === 'CABARET_LOUNGE'
                && Math.max.apply(null, gain) > REST_EPS) return false;
            try { return (((typeof w._cabSongGain === 'function') ? w._cabSongGain() : 1) > 0); }
            catch (_) { return true; }                          // gate unavailable → never silence the show [REF#AU-00184 → see REF#E9-03837]
        },

        oniLyricTime() {
            const a = decks[act];
            return curId === 'ONI' && !pend && masterOn() && a && !a.paused && gain[act] > 0.001
                ? a.currentTime : null;
        },

        state() {
            return { cue: curId, track: curTrack, gain: gain.slice(), act, why: lastWhy,
                     latch: Object.assign({}, latch), cabSong: this.cabSongAllowed(),
                     // THE REST, MEASURABLE. A probe cannot infer "the room is quiet on purpose right now" [REF#AU-00185]
                     // from cue + gain alone — a resting deck and a muted one look identical from outside.
                     resting: !!pend, restTrack: pend ? pend.track : null, restAt: pend ? pend.at : 0 };
        },

        /** Human-readable block for window._audioDiag() — Mark's COPY-ALL instrument. [REF#AU-00186] */
        diag() {
            const f = n => (typeof n === 'number' ? n.toFixed(3) : String(n));
            const s = lastState || {};
            const rows = CUES.map(c => {
                let ok = false; try { ok = c.gate(s) === true; } catch (_) {}
                let poolN = c.track ? 1 : (c.pool ? c.pool().length : 0);
                const inert = !c.silent && !c.track && poolN === 0;
                return '   ' + (c.id === curId ? '▶' : ' ') + ' ' + String(c.pri).padStart(3) + ' ' + c.id.padEnd(12)
                     + (ok ? 'gate ✓' : 'gate ·') + (inert ? '  ⚠ EMPTY POOL — cue is inert' : '');
            }).join('\n');
            const a = decks[act];
            return '\n── 🎼 COMPOSER ──'
                 + '\nWINNER: ' + (curId || 'none') + ' · ' + (curTrack ? String(curTrack).split('/').pop() : 'silent')
                 + ' · gain ' + f(gain[act]) + ' → ' + f(goal[act]) + ' · why: ' + lastWhy
                 + '\ndeck ' + act + ': ' + (a ? ((a.paused ? 'PAUSED' : '▶ PLAYING') + ' · t ' + f(a.currentTime) + '/' + f(a.duration) + ' · loop ' + !!a.loop) : 'not built')
                 + '\nstate: dead ' + (s.playerDead === true) + ' · combat ' + (s.inCombat === true) + ' · table ' + (s.atTable === true)
                 + ' · bossNear ' + (s.bossNear === true) + ' · reveal ' + (s.revealActive === true)
                 + ' · roomOwned ' + (s.roomOwned === true)
                 // the two inputs that can VETO the fight music — printed because their absence here is what [REF#AU-00187]
                 // made a suppressed COMBAT cue unreadable from a COPY-ALL paste
                 + ' · inCabaret ' + (s.inCabaret === true) + ' · cabSongPlaying ' + (s.cabSongPlaying === true)
                 + ' · guideAck ' + (s.cabGuideAck === true) + ' · cabTiles ' + (isFinite(s.cabTilesAway) ? (+s.cabTilesAway).toFixed(1) : '∞')
                 + '\n       hostilesNear ' + (s.hostilesNear === true) + ' · nearCabaret ' + (s.nearCabaret === true)
                 + ' · cabaretOpen ' + (s.cabaretOpen === true) + ' · combatTail ' + (s.combatTail === true)
                 + ' · L' + num(s.level, 1) + ' seg ' + num(s.segmentId, 0)
                 + '\nlatched: boss=' + (latch.boss ? String(latch.boss).split('/').pop() : '—')
                 + ' combat=' + (latch.combat ? String(latch.combat).split('/').pop() : '—')
                 + ' gambling=' + (latch.gambling ? String(latch.gambling).split('/').pop() : '—')
                 + '\ncabaret song (秘密のダンス): ' + (this.cabSongAllowed() ? 'PERMITTED (Composer has stood down)' : 'SILENCED by ' + (curId || '?'))
                 + '\nplay-out: ' + (poWrapped ? 'song finished — free to change' : 'song still running — holds the floor')
                 + ' · fade scale ×' + f(fadeScale())
                 // THE REST between songs — printed because a deliberate silence and a broken deck sound [REF#AU-00188]
                 // exactly the same, and Mark diagnoses by ear off a COPY-ALL paste.
                 + '\nrest: ' + (pend
                     ? ('▮ RESTING ' + Math.max(0, Math.round(pend.at - ((W().performance ? W().performance.now() : 0)))) + 'ms left → '
                        + String(pend.track).split('/').pop())
                     : ('idle · gap ' + gapMs() + 'ms'))
                 + '\ncue stack (priority order):\n' + rows
                 + '\nknobs: _bgMusicVol · _bossMusicVol · _gambleMusicVol · _combatMusicVol · _combatMusicPool'
                 + ' · _bgBySection · _combatTailMs · _combatPlayOut · _musicFadeScale · _musicGapMs'
                 + ' · _combatRandomStart · _bossRevealHardCut · _bgMusicOn\n';
        },
    };
}
