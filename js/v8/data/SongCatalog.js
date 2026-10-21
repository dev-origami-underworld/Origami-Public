/** [REF#DA-00090]
 * SongCatalog.js — the quest-song registry. ONE place that knows every song, its rarity, and its file.
 *
 * Mark 2026-07-30: "prepare the music system to be quest based, meaning player will find songs to return
 * to cabaret to have them played to proceed in the game. these will be special solid gold LOOT CARDS …
 * Some music is LEGENDARY … the rest are just SONGS and are solid silver with black text."
 *
 * WHY A REGISTRY AND NOT A LIST IN Engine9. Before this file, the set order lived in one frozen array
 * (`window._cabSetDefault`, Engine9 ~:17421) and the per-track intro length lived in a REGEX over the
 * filename a few lines below it (`_cabSetIntroSeconds`). That was fine while the setlist was authored
 * by hand and every track shipped unlocked. A quest setlist is different: the same song has to be
 * addressable as a LOOT CARD (title, kanji, rarity, card art), as an AUDIO FILE (path, intro seconds,
 * continuation part), and as SAVE STATE (unlocked or not) — three surfaces that must never disagree
 * about which song they mean. A filename regex cannot carry rarity, and an array index cannot survive
 * a save/load. So: one entry per song, `id` is the save key, and every surface reads from here.
 *
 * THE FOUR-CATEGORY RULE IS NOT BROKEN HERE. Mark's card taxonomy is MELEE / RANGED / SPELL / ITEM and
 * nothing else. A song is therefore an **ITEM** card; "LEGENDARY" is a RARITY that drives the card's
 * look (solid gold vs solid silver) and its 3D medallion metal, NOT a fifth category. `catId` below is
 * literally 'ITEM' for every entry, on purpose — see LootCardBuilder.SONG_RARITY_OF.
 *
 * ADDING A SONG: add an entry here, drop the mp3 in assets/sounds/, done. The card art, the medallion
 * metal, the rotation gating and the unlock check all derive from this entry. If a song is split into
 * numbered parts, join it first — `node scripts/merge-song-parts.js out.mp3 part1.mp3 part2.mp3 …`.
 *
 * RIGHTS (recorded for the Steam release — plans/STEAM_RELEASE_PLAN_2026-09-14.md §2). Every Starlette
 * track in this file was generated on Suno under Mark's PRO plan, which grants commercial use of songs
 * made while subscribed. Mark 2026-09-14: "the suno was under the pro plan so I can use those. plus its
 * just for the game to use this music with fun links back to Suno so players can try to generate their
 * own is gold for Suno." So: (1) the songs may ship on a commercial storefront; (2) the suno.com clip
 * links carried on the entries below STAY in every build, web and Steam — they are an invitation, not
 * commerce, and Steam's external-link rule is about selling, not linking. Keep the Suno account page /
 * receipts with the release paperwork; the clip ids here are the cross-reference.
 */

export const RARITY = Object.freeze({ LEGENDARY: 'LEGENDARY', SONG: 'SONG' });

/** [REF#DA-00091]
 * ── TWO BUSES, AND THEY ARE NOT THE SAME THING (Mark 2026-08-03) ────────────────────────────────
 * "caberet songs are not same as the background songs for the game, ok? you understand?" — and:
 * "the songs you have as silver are background music to game, not to caberet ... put them into
 * sections 1-4 not in section 0."
 *
 *   bus:'cabaret'    — Starlette PERFORMS it. Room-local, distance-attenuated, permit/quest gated,
 *                      drives her choreography, captions and the song-wave. Section 0 is her house.
 *   bus:'background' — the DUNGEON's own music while the player explores. Global, no performer, no
 *                      choreography. Lives in sections 1-4 and never in section 0.
 *
 * `section` is the RING SEGMENT this track belongs to: sections 1-4 are segments 0-3 (the engine
 * converts with `section = segmentId + 1`, see Engine9 ~:3637 / ~:63490). Section 0 is the head —
 * room 0, the cabaret, the konbini — and is deliberately never a background-music section.
 *
 * ⚠ NOTHING PLAYS THE BACKGROUND BUS YET, AND SAYING SO IS THE POINT. `_startBgMusic()` in Engine9
 * (~:30256) is an EMPTY STUB and `window._bgMusicEl` is never assigned anywhere in the file — the
 * volume slider, the pause/resume lists and the cabaret duck all read `undefined`. These fields are
 * the DATA half, recorded now so the catalog is the single truth when the bus is built; they do not
 * make music play. Same failure shape as the documented `_hallwayMusicEl` trap.
 */
export const BUS = Object.freeze({ CABARET: 'cabaret', BACKGROUND: 'background' });

/** [REF#DA-00092]
 * ── FAMILY + GENRE: MARK'S TAXONOMY, AND WHY IT IS TWO FIELDS AND NOT A NESTED LIST ──────────────
 * Mark 2026-08-04: "we can group our music on taxonomies — so if a player doesnt like the hard hitting
 * EDM rock sounds and only likes the very light jpop kid friendly stuff — we can then have fuzzy logic
 * preselect such song variants based on user preferences, like a smart tuner … one song can have
 * several variants." Then 2026-08-05, the player-facing half: "an editable genre selector hard/soft
 * like a slider … very soft gentle or hard rocking daemonic".
 *
 * ⚠ A VARIANT CANNOT SHARE AN ENTRY, AND THIS IS THE WHOLE REASON FOR `family`. `file` is not just a
 *   path in this codebase — it is the IDENTITY KEY. `_cabSetAll` indexes by it, `songByFile()` resolves
 *   by it, `_cabSongFileActive` is set to it, and BOTH the caption map and the vocal-window map are
 *   keyed on its basename. Two takes of one song have different captions, different vocal windows and a
 *   different intro runway, so nesting them under one entry would collide in those maps and silently
 *   caption take B with take A's timings. So: ONE ENTRY PER AUDIO FILE, always, and `family` is what
 *   says "these are takes of the same song". Variants = entries sharing a family. Nothing existing has
 *   to change; it is purely additive.
 *
 *   `hardness` 0..1 is what the slider reads: 0 = very soft and gentle, 1 = hard rocking daemonic.
 *   `genre` is free-form tags for the fuzzy match on top of it.
 *
 * ⚠ THESE VALUES ARE MEASURED FROM THE AUDIO, not guessed — `node scripts/analyze-audio-tone.js`.
 *   They replaced my filename-derived guesses on 2026-08-05 after Mark asked whether tone could be
 *   detected at all. hardness = onset density + compression + high-band share; karmaLean = spectral
 *   centroid + major/minor from Krumhansl chroma correlation, both percentile-ranked ACROSS THIS
 *   LIBRARY (absolute thresholds called 地獄越え "light" because every track here is brightly
 *   mastered — see the calibrate() note in that script). Mark's in-game edits still override.
 *   ⚠ AND THE EXPORT IS WHY THIS IS SAFE: anything he types is written back HERE as source, not left in
 *     localStorage where a cache clear would erase a whole afternoon of authoring.
 */
export const HARDNESS = Object.freeze({ SOFT: 0.0, GENTLE: 0.25, MID: 0.5, DRIVING: 0.75, DAEMONIC: 1.0 });

/** [REF#DA-00093]
 * ── THE SECOND AXIS: DARK ↔ LIGHT, AND IT IS KARMA (Mark 2026-08-05) ────────────────────────────
 * "and ability to have a dark / light slider for if its going to be for -negative karma or positive
 * karma more".
 *
 * `karmaLean` is -1..+1: **-1 = dark**, music for a player running NEGATIVE karma; **+1 = light**, for
 * positive; **0 = neutral**, fits either. It is a SEPARATE axis from `hardness` on purpose — the two
 * are genuinely independent and collapsing them would lose songs the player wants. 地獄越え is hard AND
 * dark; TooCute is soft AND light; but a gentle funeral lament is soft and dark, and a stadium anthem is
 * hard and light. One slider cannot express that, and Mark asked for two.
 *
 * WHY IT IS SIGNED WHEN `hardness` IS 0..1: karma in this game is already signed (the stain, the
 * inspector's ±, `_karmaMirror`), so a -1..+1 lean maps onto it without anyone having to remember a
 * conversion. 0 meaning "neutral, always eligible" also falls out for free, which is the right default
 * for a track nobody has classified yet.
 *
 * ⚠ SEEDS ARE MINE, MARK IS THE AUTHORITY — same as `hardness`, and editable in game with the same
 *   export back to source. See GenreStore.js.
 */
export const KARMA_LEAN = Object.freeze({ DARK: -1.0, SHADED: -0.5, NEUTRAL: 0.0, WARM: 0.5, LIGHT: 1.0 });

// ── ROTATION RESOLUTION (Mark 2026-08-08) ─────────────────────────────────────────────────────── [REF#DA-00094]
// The SONGS page (MusicPage.js) writes Mark's per-track cabaret/bg/combat ticks here. Resolution
// order is the same one GenreStore established and states as law in its header:
//
//     MARK'S TICK  >  the catalog's committed `bus`  >  nothing
//
// ⚠ localStorage IS THE SCRATCHPAD, NEVER THE RECORD — GenreStore.js:15. A tick is Mark mid-decision;
//   the committed `bus` field below is the record. The SONGS page's "copy my calls" button is how one
//   becomes the other. Nothing here may ever be the only home for an authored decision.
//
// ⚠ READ INLINE, NOT IMPORTED. GenreStore already imports THIS file, so importing it back would close
//   a cycle. Twelve lines of localStorage duplicated beats a fragile circular import.
const LS_ROTATION = 'origami.v8.songRotations';
function _rotationOverrides() {
    try {
        const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(LS_ROTATION) : null;
        const o = raw ? JSON.parse(raw) : null;
        return (o && typeof o === 'object') ? o : {};
    } catch (_) { return {}; }   // private-mode / disabled storage — fall through to the catalog [REF#DA-00095]
}

/** [REF#DA-00096]
 * Is `song` in `rot` ('cabaret' | 'bg' | 'combat')? Mark's tick wins; otherwise the catalog decides.
 *
 * ⚠ THE FALLBACK IS PER-BOX, NOT PER-ROW — the same trap the SONGS page hit. If a whole row had to be
 *   absent before the catalog was consulted, Mark's first tick on a track would silently freeze the
 *   other two rotations at whatever they happened to be.
 */
export function inRotation(song, rot) {
    if (!song) return false;
    const saved = _rotationOverrides()[song.file];
    if (saved && typeof saved[rot] === 'boolean') return saved[rot];
    // No tick for this box — fall back to the committed catalog wiring. [REF#DA-00097]
    if (rot === 'bg')      return song.bus === BUS.BACKGROUND;
    if (rot === 'cabaret') return song.bus === BUS.CABARET || song.role === 'activation'
                               || (song.bus !== BUS.BACKGROUND && song.setList === true)
                               || (song.bus == null && song.questGift === true);
    return false;   // combat has no catalog field yet — it is tick-only until one exists [REF#DA-00098]
}

/** [REF#DA-00099]
 * Background tracks for a ring section (1-4).
 *
 * ⚠ EVERY BACKGROUND TRACK PLAYS IN EVERY SECTION — `section` NO LONGER GATES ANYTHING. Mark
 *   2026-08-08: "all normal bg music plays in ALL sections whenever found - loop into rotation." This
 *   supersedes the section-per-track reading of his 08-03 note ("put them into sections 1-4 not in
 *   section 0"); what that rule was actually protecting is SECTION 0, the head, which still gets no
 *   background music at all — the cabaret owns that space.
 *
 *   The `section` field is LEFT ON THE TWO CRIMSON FAN ENTRIES on purpose rather than deleted. It is
 *   authored intent about where a track fits best, and a later "favour this song in its home section"
 *   weighting is a plausible ask; deleting the data to express "ungated" would throw that away. Nothing
 *   reads it today, and this docstring is the only place that would tell you so.
 *
 *   The parameter is kept because callers pass it and because section 0 must still be answerable.
 */
export function backgroundSongsForSection(section) {
    const n = Number(section);
    if (!Number.isFinite(n) || n < 1) return [];   // section 0 = the head; never background music [REF#DA-00100]
    return SONGS.filter(s => inRotation(s, 'bg'));
}

/** [REF#DA-00101]
 * ── FOUR FINDABLE CARDS PER LEVEL, AND THE CAP IS DATA (Mark 2026-08-13: "remember only 4 of these
 *    cards per level, so keep for other levels, ok?") ────────────────────────────────────────────────
 *
 * `level` on a questGift entry says WHICH FLOOR that card belongs to. Absent means 1, so every song
 * that shipped before this field keeps its floor-1 meaning without being touched.
 *
 * ⚠ THIS IS NOT COSMETIC BOOKKEEPING — ADDING A 5th questGift SONG WITHOUT IT BREAKS THE WAKE RING.
 *   `_songRings()` counts returned songs against `_songRingCount` (4) to drive the 25/50/75/100%
 *   workforce wake, and THREE separate pools in Engine9 select on `questGift === true`: the chest/urn
 *   placer (~:14395), the wake-ring test row (~:38405) and the ogre drop (~:67441). A fifth findable
 *   with no level would quietly enter all three — the ring would need five songs to reach 100% while
 *   the floor only hides four, and the dungeon could never be fully woken. That is a silent,
 *   un-completable floor, which is why the cap lives here rather than in a comment on each pool.
 *
 * Every pool must call THIS, never filter `questGift` directly.
 */
export function questSongsForLevel(level) {
    const n = Number(level);
    const lv = Number.isFinite(n) && n > 0 ? n : 1;
    return SONGS.filter(s => s.questGift === true && (Number(s.level) || 1) === lv);
}

/** Everything Starlette can actually perform — the cabaret bus only. [REF#DA-00102] */
export function cabaretSongs() {
    return SONGS.filter(s => inRotation(s, 'cabaret'));
}

/** [REF#DA-00103]
 * `file` is engine-relative, exactly as the <audio> element wants it.
 * `continuation` mirrors the existing window._cabSetContinuation trick for a track that shipped in two
 *   halves — a merged single file should leave this null (see 地獄越え, joined 2026-07-30).
 * `introSeconds` is the DARK-INTRO reveal before she is lit. It does NOT self-scale (the 9-beat
 *   choreography clock does; this does not — see the analysis comment at Engine9 ~:17412), so a track
 *   with no intro needs a small number or she belts the opening bars unseen.
 * `questGift` = true means the song is FOUND in the dungeon and must be turned in at the cabaret.
 *   Songs with questGift:false are hers from the start, so the cabaret is never silent on a fresh save.
 * `dreamScene` (optional) names a DOM dream overlay to raise while this song plays in the cabaret —
 *   currently 'paris' (la tour eiffel under a moon, NewOrigami.9.html _buildParisDream). Mark 2026-07-31,
 *   for a solo about "dreaming to be a mortal in paris, and the sadness of that being a banished demon".
 *   It is a NAME, not a flag, so a second song can have a different dream. The overlay lives in the shell
 *   and costs the WebGL scene nothing — no program, no light, no draw call.
 */
export const SONGS = Object.freeze([
    // ── THE ACTIVATION SONG (Mark 2026-07-31) ──────────────────────────────────────────────────── [REF#DA-00104]
    // "this song plays as the caberet lights up and the workers return."
    //
    // `role: 'activation'` rather than a magic filename or an array index. The engine asks the catalog
    // for the activation track (songByRole), so renaming the mp3 or reordering this list cannot quietly
    // break the one cue that carries the whole moment. That is the same lesson the header above
    // records: a filename regex cannot carry meaning, and an index cannot survive a reorder.
    //
    // NOT a quest gift and NOT in her rotation: `questGift:false` keeps it off the found-in-the-dungeon
    // path, and `setList:false` keeps buildSetList from ever handing it to her as a number to perform.
    // It is a ONE-SHOT that fires the instant the room wakes — if it joined the set she would sing the
    // activation fanfare again three songs later, and the moment would stop meaning anything.
    {
        id: 'uta-ni-iki',
        family: 'uta-ni-iki',
        karmaLean: 0.35,   // the room drawing breath again — the most hopeful thing on the disk [REF#DA-00105]
        genre: ['ballad', 'jpop'],
        hardness: 0.19,   // the room's first breath — gentle, no drums to speak of [REF#DA-00106]
        title: 'Breath Into Song',
        kanji: '歌に息',
        desc: 'The first breath the room has drawn in years.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/Songs/Starlette-IntroSong-歌に息.mp3',
        continuation: null,
        introSeconds: 0,         // one-shot cue: no dark-intro runway, it starts as the lights come up [REF#DA-00107]
        seconds: null,           // not measured — nothing schedules against it, it just plays out [REF#DA-00108]
        questGift: false,
        // SHE SINGS IT (Mark 2026-07-31: "caberet song that Starlette will sing with the haiku chat [REF#DA-00109]
        // boxes"). It was setList:false on my earlier reading that it was a fanfare and nothing more.
        // His instruction makes it a NUMBER — so it enters her rotation like any other song, and the
        // activation moment is simply the first time it is heard rather than its only outing.
        setList: true,
        role: 'activation',
        // ⚠ THIS SRT DOES NOT EXIST YET. The haiku boxes are SRT-driven and nobody has written lyrics [REF#DA-00110]
        // for this track, so the song plays and the caption box stays empty. Named here anyway so the
        // wiring is finished and dropping the file in is the whole job — and so the gap is visible in
        // the catalog instead of being discovered as "the captions don't work".
        captions: './assets/sounds/Songs/Starlette-IntroSong-歌に息.srt',
        // MEASURED, NOT AUTHORED — see vocalWindows' note under captionSources(). [REF#DA-00111]
        vocalWindows: [[0.0, 22.5], [44.5, 66.5], [84.0, 86.75]],
    },
    {
        id: 'akai-sensu',
        family: 'akai-sensu',
        genre: ['jpop', 'uptempo'],
        karmaLean: -0.12,   // her house number; a fan dance judges nobody [REF#DA-00112]
        hardness: 0.33,   // "Hot from the third bar" — her house number, mid-tempo [REF#DA-00113]
        title: 'The Crimson Fan',
        kanji: '紅い扇子',
        desc: 'Her opening number. Hot from the third bar.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/BG-OLD/StarletteSong_紅い扇子.mp3',
        continuation: null,
        introSeconds: 3,
        seconds: 197.8,
        questGift: false,        // the house song — she already knows it [REF#DA-00114]
        musicCard: false,        // Mark 2026-10-10: Crimson Fan belongs to Stariko; never mint it as a Starlette music card. [REF#DA-00293]
        bus: 'background',       // Mark 2026-08-03: "the songs you have as silver are background music [REF#DA-00115]
        section: 1,              // to game, not to caberet ... put them into sections 1-4 not in section 0" [REF#DA-00116]
        singer: 'stariko', lang: 'ja', level: 2,
        vocalWindows: [[1.0, 68.75], [71.0, 131.75], [137.25, 194.25]],
    },
    {
        id: 'akai-sensu-dance',
        family: 'akai-sensu',
        genre: ['dance', 'jpop'],
        karmaLean: 0.89,   // same song, a shade brighter in the dance take [REF#DA-00117]
        hardness: 0.57,   // SAME FAMILY as akai-sensu — this is the dance take, the clearest example of what Mark means by a variant [REF#DA-00118]
        title: '紅い扇子 (Remastered)',
        kanji: '紅い扇子 舞',
        desc: 'The slow-ramp cut. Twelve bars before she lifts.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        // ── WAS CARD 4 FOR ONE HOUR, THEN REPLACED (Mark 2026-08-13) ──────────────────────────────── [REF#DA-00119]
        //    He first gave https://suno.com/s/h2DjVaTm4xMDkcMn as Card 4 — clip ee2f1d4d…, which
        //    fingerprinted to THIS file at 191.119979 s — then replaced it outright with 'Merci Mercy'
        //    (https://suno.com/s/v4CzJ5BcyPF8Tqqi). So this track goes back to being ordinary background
        //    music beside its sibling `akai-sensu` in BG-OLD/, and the Card 4 slot is its own entry below.
        //    The sunoUrl is KEPT even though the card moved on: it is how this file is identified at all,
        //    and losing it would put the entry back to being a filename nobody can trace to a source.
        sunoUrl: 'https://suno.com/s/h2DjVaTm4xMDkcMn',
        file: './assets/sounds/BG-OLD/Song-dance-紅い扇子.mp3',
        continuation: null,
        introSeconds: 10,        // slow ramp — only loud by 0:12, so the dark intro runs long [REF#DA-00120]
        seconds: 191.1,
        questGift: false,        // not a findable card — see above [REF#DA-00121]
        musicCard: false,        // Stariko's Japanese-only headline stays in the catalog, never in the card pool. [REF#DA-00294]
        // ⛔ SUPERSEDED 2026-09-26 by Mark: "Stariko is the star of floor 2 okay? Her song is https://suno.com/s/h2DjVaTm4xMDkcMn" — this [REF#DA-00244]
        //    track was section-2 background music; it is now STARIKO'S HEADLINE NUMBER: on the cabaret bus, sung only where she is the
        //    cast (buildSetList's `singer` filter keeps it off Starlette's floor 1), leading her set, and not gated behind a returned
        //    card (`headline`). `lang: 'ja'` — floor 2 is Japanese-only (Mark: "only Japanese for floor 2").
        bus: 'cabaret',
        singer: 'stariko', headline: true, lang: 'ja', level: 2,
        setList: true,
        section: 2,
        captions: './assets/sounds/BG-OLD/Song-dance-紅い扇子.srt',
        vocalWindows: [[0.75, 68.25], [70.25, 129.25], [131.75, 158.5], [161.75, 190.75]],
    },
    // ── ★ 秘密のダンス — THE CABARET'S ORIGINAL SONG, BACK FOR FLOOR 2 (Mark 2026-09-26: "there are some other unclaimed songs mp3 -- [REF#DA-00245]
    //    grep the one from 6 months ago that we used for the caberet. use that - it had srt files too ... it was japanese"). ─────────
    //    Found on disk, never catalogued: assets/sounds/Dungeon/秘密のダンス.mp3 + .srt, added 2026-06-08 (be16d631 "succubus singing +
    //    karaoke lyrics") — the first number the cabaret ever had (the engine still names it as `_cabSongFile`'s original). Japanese
    //    lyrics with English lines in the captions. 57.9 s measured (ffprobe 57.913417). On floor 2 it follows Stariko's 紅い扇子 in her
    //    Japanese-only set; `headline` so it plays without a returned card, `singer: 'stariko'` so it stays off Starlette's floor 1.
    //    No vocalWindows yet (captions only) — her mic falls back cleanly, the same call as Cards 1/3/4.
    {
        id: 'himitsu-no-dance',
        family: 'himitsu-no-dance',
        genre: ['jpop', 'dance'],
        karmaLean: 0.2, hardness: 0.45,
        title: '秘密のダンス',
        kanji: '秘密',
        desc: 'Secret footsteps on a floor nobody is supposed to watch.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/Dungeon/秘密のダンス.mp3',
        continuation: null,
        introSeconds: 5,         // first caption at 5.79 s [REF#DA-00246]
        seconds: 57.9,
        questGift: false,
        bus: 'cabaret',
        singer: 'stariko', headline: true, lang: 'ja', level: 2,
        setList: true,
        captions: './assets/sounds/Dungeon/秘密のダンス.srt',
    },
    // ── ★ CARD 4 — 'Merci Mercy' (Mark 2026-08-13: "use this for card 4 … [REF#DA-00122]
    //    https://suno.com/s/v4CzJ5BcyPF8Tqqi"). Clip ead42a5e-49f6-48fd-b12a-44b39867dcfa, 69.400167 s,
    //    new to the repo. The shortest of the four cards by a wide margin — worth knowing before anyone
    //    schedules choreography against it the way the 3-minute numbers allow.
    //    TITLE IS SUNO'S, scraped from the share page's og:title, per his "why are you not using the
    //    sunu titles for the songs?" — as are every other title in this file now.
    //    ⛔ SUPERSEDED 2026-09-13 by Mark: "measure them out so the animation will align with the song" — vocalWindows measured below.
    {
        id: 'card-4',
        family: 'card-4',
        karmaLean: 0.7,    // seeded by role, not analyzer-measured — re-measure on the next manifest pass [REF#DA-00123]
        hardness: 0.35,
        genre: ['jpop', 'haiku'],
        title: 'Merci Mercy',
        kanji: '感謝',
        desc: 'Thank you, and thank you again.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/v4CzJ5BcyPF8Tqqi',
        file: './assets/sounds/Songs/Starlette-Card-4.mp3',
        continuation: null,
        introSeconds: 1,
        seconds: 69.4,
        questGift: true,         // ★ FINDABLE — Card 4 [REF#DA-00124]
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/Songs/Starlette-Card-4.srt',
        vocalWindows: [[1.5, 11.6], [12.35, 24.6], [25.95, 39.8], [40.9, 56.35], [58.55, 62.9]],   // MEASURED 2026-09-30 — demucs stem, 1/20 s grid (join_gap=0.45, min_len=0.5). Supersedes the 2026-09-13 1/4 s pass, whose join_gap=1.5 merged her breaths into one block; the mic then parked at her face for a whole verse (the arm gate reads these, Origami.RealityEngine.9.html _vocalNow). [REF#DA-00219]
    },
    // ── ★ CARD 1 (Mark 2026-08-13: "Returning Card 1 = https://suno.com/s/855jNEMpfq8gO3a2") ──────── [REF#DA-00125]
    //    New to the repo — clip 10fea2fc-20ae-4b77-b466-f6a019c809e2, 118.640167 s, matched nothing on
    //    disk. Haiku + SRT authored by CLAUDE the same day (scripts/haiku-srt.py); Mark's ear pass
    //    outranks those words, same standing as the TooCute verses.
    //    ⛔ SUPERSEDED 2026-09-13 by Mark: "measure them out so the animation will align with the song" — the
    //    old note here said "NO vocalWindows ON PURPOSE, demucs is not installed"; demucs 4.0.1 IS installed
    //    (python -m demucs) and every song below now carries stem-measured windows. The SRT edges (full-mix
    //    energy, ±0.5 s) were never good enough for the mic — only 3 of Card 1's 6 cues fall inside a measured
    //    window, so its CAPTION timing is a separate open job (scripts/retime-srt-to-vocals.py).
    {
        id: 'card-1',
        family: 'card-1',
        karmaLean: 0.5,    // seeded by role, not analyzer-measured — re-measure on the next manifest pass [REF#DA-00126 → see REF#DA-00123]
        hardness: 0.45,
        genre: ['jpop', 'haiku'],
        title: 'OrigamiUnderworld.1',
        kanji: '拾った歌',   // Suno title is 'OrigamiUnderworld.1' — the kanji is the in-game flavour line, not a second title [REF#DA-00127]
        desc: 'Found in the dark, still warm.',
        rarity: RARITY.LEGENDARY,   // ★ LEGENDARY since 2026-09-29 — one of the two powerhouse songs; a room guard carries it (engine: the legendary carriers pass) [REF#DA-00282]
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/855jNEMpfq8gO3a2',
        file: './assets/sounds/Songs/Starlette-Card-1.mp3',
        continuation: null,
        introSeconds: 1,
        seconds: 118.6,
        questGift: false,        // Table reward after the full opening song, excluded from random placement. [REF#DA-00283]
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/Songs/Starlette-Card-1.srt',
        vocalWindows: [[1.55, 8.1], [10.1, 16.6], [18.4, 44.2], [56.25, 62.95], [65.2, 90.65]],   // MEASURED 2026-09-30 — demucs stem, 1/20 s grid (join_gap=0.45, min_len=0.5). Supersedes the 2026-09-13 1/4 s pass, whose join_gap=1.5 merged her breaths into one block; the mic then parked at her face for a whole verse (the arm gate reads these, Origami.RealityEngine.9.html _vocalNow). [REF#DA-00220 → see REF#DA-00219]
    },
    // ── ★ CARD 3 (Mark 2026-08-13: "Card 3 = https://suno.com/s/IwtF7tba8NoqLcOQ") ────────────────── [REF#DA-00129]
    //    New to the repo — clip a0ec7af9-0349-430b-981a-a6ccd61c3bb3, 145.880167 s. Windows measured 2026-09-13.
    {
        id: 'card-3',
        family: 'card-3',
        karmaLean: 0.3,
        hardness: 0.5,
        genre: ['jpop', 'haiku'],
        title: 'A Fine Day',
        kanji: '誰かの声',
        desc: 'It was asleep at the bottom of a jar.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/IwtF7tba8NoqLcOQ',
        file: './assets/sounds/Songs/Starlette-Card-3.mp3',
        continuation: null,
        introSeconds: 1,
        seconds: 145.9,
        questGift: true,         // ★ FINDABLE — Card 3 [REF#DA-00130 → see REF#DA-00124]
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/Songs/Starlette-Card-3.srt',
        vocalWindows: [[0, 2.75], [3.2, 5.05], [5.6, 6.95], [7.4, 15.7], [16.5, 41.95],
                        [48.9, 49.9], [53.55, 54.2], [60.65, 61.8], [62.4, 63.5], [67.7, 68.9],
                        [69.45, 70.55], [74.55, 77.65], [79.9, 81.1], [82.3, 82.95], [88.75, 93.6],
                        [94.15, 95.4], [97.3, 100.65], [101.2, 102.8], [103.9, 124.2], [124.8, 141]],   // MEASURED 2026-09-30 — demucs stem, 1/20 s grid (join_gap=0.45, min_len=0.5). Supersedes the 2026-09-13 1/4 s pass, whose join_gap=1.5 merged her breaths into one block; the mic then parked at her face for a whole verse (the arm gate reads these, Origami.RealityEngine.9.html _vocalNow). [REF#DA-00221 → see REF#DA-00219]
    },
    // ── THE CABARET STARTUP LOOP (Mark 2026-08-13: "Cabert startup songs = mortal under paris skies + [REF#DA-00131]
    //    postparis + caberet songs = [two links] … these rotate continual loops + any of the 1-4 cards
    //    found will add to the rotation of music that autoplays in the caberet and background.")
    //    questGift:false — they are HERS from the start, so the room is never silent on a fresh save;
    //    setList:true + bus:'cabaret' is what puts them in the rotation the cards then join.
    //    ⚠ Startup-1 is clip b9da9714…, the SAME clip the Engine9 Paris-dream comment (~:26993) credits
    //      for BG-PostParisDream.mp3 — a 12 ms-different export of one master. Kept as a separate file
    //      rather than repointed at the old one: `file` is the identity key for the caption and
    //      vocal-window maps, and the two exports are not sample-identical.
    {
        id: 'cabaret-startup-1',
        family: 'cabaret-startup-1',
        karmaLean: 0.6,
        hardness: 0.3,
        genre: ['ballad', 'jpop', 'paris'],
        title: 'Caberet Sounds',
        kanji: '夢の名残り',
        desc: 'The lamps come up. The chairs wait.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/1ZBB4GzHsIksc1G3',
        file: './assets/sounds/Songs/Starlette-Cabaret-Startup-1.mp3',
        continuation: null,
        introSeconds: 2,
        seconds: 212.3,
        questGift: false,
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/Songs/Starlette-Cabaret-Startup-1.srt',
        vocalWindows: [[0.5, 8.25], [10.5, 23.75], [30.5, 55.25], [61.25, 83.0], [96.5, 99.5],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00222 → see REF#DA-00219]
            [107.5, 108.5], [110.5, 141.5], [148.25, 162.0], [164.0, 168.75], [170.75, 175.25],
            [177.5, 182.5], [192.0, 198.0]],
    },
    {
        id: 'cabaret-startup-2',
        family: 'cabaret-startup-2',
        karmaLean: 0.55,
        hardness: 0.4,
        genre: ['jpop', 'cabaret'],
        title: 'Caberet 5',
        kanji: '夜の口',
        desc: 'Cups full, shamisen laughing.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/5cLnUSNShHavFHbw',
        file: './assets/sounds/Songs/Starlette-Cabaret-Startup-2.mp3',
        continuation: null,
        introSeconds: 2,
        seconds: 231.2,
        questGift: false,
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/Songs/Starlette-Cabaret-Startup-2.srt',
        vocalWindows: [[1.5, 15.25], [24.5, 26.75], [30.25, 32.25], [39.5, 54.25], [56.25, 83.5],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00223 → see REF#DA-00219]
            [85.75, 100.25], [102.0, 107.5], [109.75, 122.25], [124.0, 153.75], [160.5, 166.75],
            [168.5, 170.5], [177.0, 188.0], [189.75, 213.0], [215.5, 217.75], [222.25, 229.5]],
    },
    // ── HER OPENING THREE (2026-09-29) — A Mortal Beneath Paris Skies, the dream's song, is one of the three songs she owns from the [REF#DA-00284]
    //    start (with Caberet Sounds and Caberet 5): no card, in her set from the first night. Two parts, chained like Too Cute.
    //    The engine's starter list is _SONG_STARTER_IDS (Origami.RealityEngine.9.html, beside the SongCatalog import).
    {
        id: 'paris-skies',
        family: 'paris-skies',
        karmaLean: 0.5,
        hardness: 0.3,
        genre: ['ballad', 'paris'],
        title: 'A Mortal Beneath Paris Skies',
        kanji: '巴里の空の下',
        desc: 'The song from the dream, sung awake.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/Songs/Starlette-Song-MortalBeneathParisSkies/A_Mortal_Beneath_Paris_Skies-1.mp3',
        continuation: './assets/sounds/Songs/Starlette-Song-MortalBeneathParisSkies/A_Mortal_Beneath_Paris_Skies-2.mp3',
        introSeconds: 2,
        seconds: 95.7,               // ffprobe, per part [REF#DA-00285]
        continuationSeconds: 124.1,
        questGift: false,
        bus: 'cabaret',
        setList: true,
        // THE DREAM RISES WITH THIS SONG (2026-09-30). The overlay machinery has been data-driven since [REF#DA-00286]
        // 2026-07-31 and waiting on exactly this field — the engine reads `dreamScene` off whichever song
        // is playing and posts DREAM_SCENE to the shell, which raises it. This is the song from the dream,
        // so it is the one that opts in. Off: window._dreamScene = false.
        dreamScene: 'paris',
        captions: './assets/sounds/Songs/Starlette-Song-MortalBeneathParisSkies/A_Mortal_Beneath_Paris_Skies-1.srt',
        continuationCaptions: './assets/sounds/Songs/Starlette-Song-MortalBeneathParisSkies/A_Mortal_Beneath_Paris_Skies-2.srt',
    },
    {
        id: 'yomi-no-yado',
        family: 'yomi-no-yado',
        karmaLean: 0.4,   // an inn in the land of the dead; shaded, not evil [REF#DA-00132]
        genre: ['edm', 'dance'],
        hardness: 0.6,   // "An EDM descent" — four to the floor, but not yet daemonic [REF#DA-00133]
        title: 'The Inn at Yomi',
        kanji: '黄泉の宿',
        desc: 'An EDM descent. The dead keep the tempo.',
        // ── NOT LEGENDARY (Mark 2026-08-13: "there is only 1 legendary - too cute for this game plays [REF#DA-00134]
        //    only with this legendary card"). It carried LEGENDARY from the 07-30 authoring pass, before
        //    the legendary card had a single defined meaning. There is exactly ONE gold card in the game
        //    and it summons the supervisor; a second gold card on a background dungeon track devalues the
        //    only one that does anything. Twin updated in LootCardBuilder._SONG_TITLES — both or neither.
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/BG-OLD/Starlette-EDM黄泉の宿-1.mp3',
        continuation: './assets/sounds/BG-OLD/Starlette-EDM黄泉の宿-2.mp3',
        introSeconds: 1,         // loud by 0:01 — almost no runway [REF#DA-00135]
        // `seconds` describes THIS FILE, not the song across its parts — it is compared against what the [REF#DA-00136]
        // browser decodes for `file`. This one ships in two halves: 71.9s here + 126.2s in the continuation
        // for the ~198s total the old comment at Engine9 ~:17411 quotes. Getting that wrong made the
        // rotation probe report a 126s discrepancy that looked like a truncated download.
        seconds: 71.9,
        continuationSeconds: 126.2,
        // FINDABLE AGAIN (Mark 2026-10-04): this must be its own loot card, never the default/only [REF#DA-00137]
        // background loop. Keep it off the background bus so returning the card is the only way it
        // joins the jukebox stack.
        questGift: true,
        level: 2,
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/BG-OLD/Starlette-EDM_Yomi-no-Yado_Bilingual_JA-EN_CC.srt',
        continuationCaptions: './assets/sounds/BG-OLD/Starlette-EDM_Yomi-no-Yado-Part-2_Bilingual_JA-EN_CC.srt',
        // ⭐ THE ONE TRACK WITH HUMAN-WRITTEN LYRICS, which makes it the yardstick everything else was [REF#DA-00139]
        // scored against. Its windows agree with those hand-authored cues on 19 of 21 (the shortfall is
        // captions deliberately held past the note, which is correct practice, not drift).
        vocalWindows: [[0.25, 12.0], [18.75, 31.0], [33.0, 34.5], [38.75, 39.5], [42.0, 62.25], [64.75, 65.5]],
        continuationVocalWindows: [[0.0, 10.75], [18.0, 23.5], [26.5, 30.25], [32.5, 34.5], [40.5, 46.25],
            [49.0, 54.0], [55.75, 66.75], [69.25, 88.5], [91.5, 110.0], [113.0, 117.0], [120.5, 122.25]],
    },
    {
        id: 'jigoku-goe',
        family: 'jigoku-goe',
        karmaLean: -0.19,   // CROSSING HELL — the darkest thing she performs [REF#DA-00140]
        genre: ['edm', 'hard', 'rock'],
        hardness: 0.6,   // from the StrongEDM folder; 5.5 minutes and "she does not stop to breathe" [REF#DA-00141]
        title: 'Crossing Hell',
        kanji: '地獄越え',
        desc: 'Five and a half minutes. She does not stop to breathe.',
        // NOT LEGENDARY — same 2026-08-13 ruling as 黄泉の宿 above. Length and intensity are not rarity: [REF#DA-00142]
        // this is a 5.5-minute number she performs, and it stays on her setlist as a SONG.
        rarity: RARITY.SONG,
        catId: 'ITEM',
        // Joined from four parts on 2026-07-30 with scripts/merge-song-parts.js (13786 frames in → 13786 [REF#DA-00143]
        // out, bit-identical audio, no re-encode). Verified in-browser: audio.duration reads 330.888s, and
        // on a Range-capable server seeks land with 0.00s error at all three original part boundaries
        // (44.2 / 191.4 / 237.9) and at 300s — so the beat clock and the pole routine's seek both hold.
        file: './assets/sounds/Songs/Starlette-CrossingtheVoid.mp3',
        continuation: null,      // merged — deliberately NOT a two-part chain like 黄泉の宿 [REF#DA-00144]
        introSeconds: 1,         // loud from the top like the other EDM cut; a long dark intro would leave [REF#DA-00145]
        seconds: 330.9,          // her belting unseen. Knob if she lights too early/late. [REF#DA-00146]
        // ── NOT ONE OF CARDS 1-4 (Mark 2026-08-13) ────────────────────────────────────────────────── [REF#DA-00147]
        // He named the four findables by URL — Cards 1/2/3/4 fingerprint to Starlette-Card-1,
        // Starlette-Winning, Starlette-Card-3 and Song-dance-紅い扇子 — and CROSSING HELL is not among
        // them, superseding his earlier pick of it as a findable. It stays a PERFORMABLE number on her
        // setlist (bus:'cabaret', setList:true just below); it is simply no longer dungeon loot.
        questGift: false,
        // ── BACK ON HER STAGE (Mark 2026-08-13: "These 4 cards should be starlette mp3 songs") ────── [REF#DA-00148]
        // SUPERSEDES his 2026-08-08 line ("crossing == those are all background dungeon soundtracks").
        // That ruling swept four tracks onto the background bus at once, and this one went with them
        // even though it is a 5.5-minute Starlette vocal performance sitting in assets/sounds/Songs/
        // with its own whisper-timed SRT and 14 measured vocal windows — everything the cabaret stage
        // reads and the background bus ignores. The three tracks it was swept up with really were
        // dungeon soundtracks and have moved to BG-OLD/; this one is hers.
        // ⚠ AND `bus` IS WHAT GATES HER SETLIST, not `questGift` — buildSetList() filters on
        //   inRotation(s,'cabaret'), so while this read 'background' the card could be found and handed
        //   in and STILL never be performed. That is the exact five-day silent disagreement documented
        //   in buildSetList's own header, repeated on a different entry.
        bus: 'cabaret',
        setList: true,

        // Whisper-timed 2026-08-02 (sound project: an SRT for every song). The track is mostly EDM [REF#DA-00149]
        // vocalise; cues exist ONLY where the haiku (地獄越え/傷を力に/共に立つ) is actually sung —
        // Mark's same-day rule: no caption when no words. All 14 cues sit inside vocalWindows below.
        captions: './assets/sounds/Songs/Starlette-CrossingtheVoid.srt',
        vocalWindows: [[2.25, 26.75], [32.5, 39.5], [44.25, 67.5], [70.25, 77.25], [79.25, 83.75],
            [85.75, 103.75], [111.0, 118.75], [122.75, 188.5], [191.25, 227.5], [237.75, 248.0],
            [251.5, 256.25], [259.75, 274.5], [276.25, 304.5], [309.25, 326.25]],
    },
    // ── THE SUPERVISOR'S SUMMONS (Mark 2026-08-03) ─────────────────────────────────────────────── [REF#DA-00150]
    // "have a legendary song card in the caberet when tip jar is clicked ... this is a legendary -
    //  its needed to summon the supervisor."
    //
    // ⚠ PLACEHOLDER TITLE / KANJI / FILENAME — Mark's track is a Suno share link
    // (https://suno.com/s/TGElL1OFPt4G5EIx) and audio cannot be pulled from that; he exports the mp3
    // himself, the way every other track here arrived. The entry is wired NOW so the card, the metal,
    // the pickup and the turn-in are all testable the moment the file lands at `file` below. Rename
    // title/kanji/desc/file together when the real ones exist — and remember the title ALSO lives in
    // LootCardBuilder._SONG_TITLES (deliberately duplicated, see the note there); a title changed in
    // only one of the two renders a song card with the wrong metal and nothing goes red.
    //
    // No `captions`/`vocalWindows` yet: those are whisper-timed off the real audio, and inventing
    // numbers for a file nobody has would put captions on silence. Add them with the same SRT pass
    // used for 地獄越え once the mp3 is in.
    {
        id: 'shoukan',
        family: 'shoukan',
        karmaLean: 0.47,   // the TooCute takes; light despite summoning something [REF#DA-00151]
        genre: ['cute', 'jpop'],
        hardness: 0.5,   // the TooCute takes — soft despite the LEGENDARY rarity; rarity is not loudness [REF#DA-00152]
        // RENAMED 2026-08-09 (Mark: "i never named it The Summons - Its more like what it is [REF#DA-00153]
        // 'Legendary Song' so rename it back to my name. its generic and everyone will understand
        // it."). Twin updated in LootCardBuilder._SONG_TITLES in the same commit — both or neither.
        // Suno title (Mark 2026-08-13). His 08-09 name 'LEGENDARY SONG' survives as an ALIAS in
        // LootCardBuilder._SONG_TITLES so cards already in a hand keep their gold.
        title: 'Too Cute for This Game',
        kanji: '伝説歌',
        desc: 'The number that calls something down. She only sings it once.',
        rarity: RARITY.LEGENDARY,
        catId: 'ITEM',
        // ── THE PAYOFF TRACK NOW EXISTS (Mark 2026-08-04, MAP_SYSTEM_REBUILD_HANDOFF §2) ─────────── [REF#DA-00154]
        //    "When Starlette is handed the legendary card, the song she plays is one of these three,
        //     all present on disk and verified … Point that entry at the TooCute tracks above (pick
        //     one, or rotate the three) rather than shipping a dead reference."
        //    Starlette-Legendary-Summons.mp3 was never on disk — measured loaded:false, error:4 — which
        //    is what kept smoke:cabsong red and took the roster's opener and gain checks down with it.
        //    PICKED ONE, DELIBERATELY, rather than rotating: `file` is not just a path here, it is the
        //    IDENTITY KEY for the whole song system — _cabSetAll indexes by it (Engine9 ~:23288),
        //    songByFile() resolves by it, _cabSongFileActive is set to it, and both the caption and
        //    vocal-window maps are keyed by its basename. A rotating file would need every one of those
        //    to stop assuming one song = one path. That is a real feature, not a one-liner; ask before
        //    building it. The other two takes are on disk and ready:
        //      ./assets/sounds/Songs/Starlette-TooCute-2.mp3
        //      ./assets/sounds/Songs/Starlette-TooCute-3.mp3
        //    ⚠ The TITLE still reads THE SUMMONS / 召喚 while the track is TooCute. Left alone on
        //    purpose — the title is duplicated in LootCardBuilder._SONG_TITLES and changing it in only
        //    one place renders the song card with the wrong metal and nothing goes red. Rename BOTH or
        //    neither, and that is Mark's call, not a side effect of pointing the file at real audio.
        // ── ALL THREE PARTS, IN ORDER, WITH AIR BETWEEN THEM (Mark 2026-08-09: "start with -1 it has
        //    3 parts, we may just play one at a time, and then pause for 3 seconds and play the next
        //    one. player doesnt have to stay. but they play."). Mark moved the takes into the
        //    Starlette-Song-TooCuteForThsiGame/ folder — the flat paths this entry used to hold are
        //    GONE FROM DISK, which is this catalog's own documented dead-reference trap. The 3s gap
        //    lives in the engine's continuation handler (window._songPartGapMs), not here — the
        //    catalog says WHAT chains, the engine says HOW.
        //    `continuation2` is the third hop: buildContinuationMap() emits part1→part2 AND
        //    part2→part3, and songByFile() resolves all three (captions/windows key per part).
        // ★ CONFIRMED BY MARK 2026-08-13: "Legendary Card = https://suno.com/s/xHOdk3vM8e2LMqDx" — clip
        // 3e911c7e-1f01-4fc9-916e-faa4d47985d3, 141.800167 s, identical to the millisecond to part 1
        // below. His link is a 64 kbps export; the local file is the higher-bitrate copy, so the wiring
        // was already correct and is deliberately left pointing at the better audio.
        sunoUrl: 'https://suno.com/s/xHOdk3vM8e2LMqDx',
        file: './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-1.mp3',
        continuation: './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-2.mp3',
        continuation2: './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-3.mp3',
        introSeconds: 0,         // MEASURED 2026-08-09 (demucs stem RMS): the voice is in by 0.0s on [REF#DA-00155]
                                 // part 1 — there is no runway; she sings from the first frame. [REF#DA-00156]
        seconds: 141.8,               // ffprobe, per part — same law as yomi-no-yado's comment above [REF#DA-00157]
        continuationSeconds: 156.1,
        continuation2Seconds: 176.2,
        // ── SRT + MIC TIMING (2026-08-09). Lyrics are MARK'S (4 tri-lingual haiku verses, in-chat); [REF#DA-00158]
        //    cue EDGES + windows are measured off the demucs vocal stem (machine timing, human words —
        //    the pipeline law). Cue↔word placement across the 8 minutes is a DRAFT: verses 1-2 on
        //    part 1, 3-4 on part 2, full reprise on part 3, distributed over sung time only — Mark's
        //    ear pass corrects which line sits where; the edges themselves never sit over silence.
        captions:              './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-1.srt',
        continuationCaptions:  './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-2.srt',
        continuation2Captions: './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-3.srt',
        // ⛔ SUPERSEDED 2026-10-02 — the 08-09 DRAFT above (haiku lines spread evenly over sung time) and its coarse windows. The three SRTs [REF#DA-00287]
        //    now carry the song's REAL lyrics — the four tri-lingual verses of its Suno prompt (sunoUrl), sung on every part as EN → JA → FR —
        //    each cue starting where that line is sung, timed off the demucs vocal stem with Whisper passes prompted by the lyrics as
        //    anchors (part 1: 23 of 36 lines heard, part 2: 25, part 3: 30; the rest spaced between them inside the sung windows). The
        //    windows are re-measured the way the 2026-09-30 card pass did (1/20 s grid, join_gap 0.45, min_len 0.5), so the mic drops
        //    between phrases; sung seconds only fell (135 → 124.45 · 149 → 145.75 · 167 → 161.8). The drafts are kept as *.srt.bak.
        vocalWindows:              [[0.0,1.2],[1.7,22.0],[23.65,29.7],[31.6,38.5],[39.4,110.45],[113.35,117.65],[118.3,120.1],[122.0,123.0],[123.7,124.65],[126.75,137.65]],
        continuationVocalWindows:  [[0.0,1.5],[2.35,9.65],[10.65,18.8],[19.3,95.35],[101.8,144.25],[144.8,155.1]],
        continuation2VocalWindows: [[0.0,9.4],[10.5,18.7],[19.15,90.65],[91.2,92.65],[93.7,152.35],[153.8,165.0],[165.6,167.0]],
        questGift: true,
        setList: true,
    },
    // ── THE AFTER-HOURS CUT (Mark 2026-08-09: "here is an extended version of the too cute for this [REF#DA-00159]
    //    game - to play during idle after the original 3 sets have played … this will be stuff we
    //    play in caberet bg and ingame bg."). Source: https://suno.com/s/osXL8g8fZMSKt8qQ — the share
    //    page exposed its CDN mp3 directly this time, so unlike the shoukan placeholder era the file
    //    is REAL and ON DISK (422.4s, ffprobe-verified).
    //    Same `family` as shoukan — this is the variant system doing its job: same song, ambient take.
    //    setList:false — it is NEVER one of her performed numbers (same rule as the activation cue);
    //    questGift:false — ambience is not dungeon loot. `cabaretIdle` is the DATA half of "play
    //    during idle after the 3 sets": the consumer (rest-window playback at low gain) is planned in
    //    SONG_SRT_PIPELINE_PLAN.md, not built — same recorded-now-wired-later pattern as `bus`, whose
    //    background player is itself still the documented empty stub.
    {
        id: 'toocute-extended',
        family: 'shoukan',
        karmaLean: 0.47,   // ⚠ SEEDED from the family's measured takes, not yet analyzer-measured — [REF#DA-00160]
        hardness: 0.5,     //   analyze-audio-tone.js reads the manifest, which hasn't picked this file [REF#DA-00161]
                           //   up; re-measure on the next manifest pass. Mark's in-game edits override. [REF#DA-00162]
        genre: ['cute', 'jpop', 'ambient'],
        title: 'Too Cute (After Hours)',
        kanji: '可愛すぎ・宵',
        desc: 'The extended cut. She hums it to the empty chairs.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-Extended.mp3',
        continuation: null,
        introSeconds: 0,
        seconds: 422.4,
        vocalWindows: [[0.0, 119.5], [127.5, 133.0], [136.0, 138.75], [140.75, 143.25], [149.75, 262.75],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00224 → see REF#DA-00219]
            [271.5, 283.25], [285.0, 335.75], [337.75, 422.0]],
        questGift: false,
        setList: false,
        bus: null,   // ⛔ SUPERSEDED 2026-09-29 by Mark: "why is TOO CUTE being played -- that is a LEGENDARY SONG ONLY PLAYED WHEN SONG IS RETURNED TO BRING THE MANAGER" — was bus:'background' (it joined every section's shuffle bag). Off every rotation now. [REF#DA-00163]
        cabaretIdle: false,   // was true — the legendary family plays only on its card's return (2026-09-29) [REF#DA-00164]
    },
    // ── THE FOURTH FINDABLE (Mark 2026-08-09: "here is that 4th : [suno] - its a cute song about [REF#DA-00165]
    //    winning. I think its a positive message for kids."). Closes the 3-songs-for-4-rings gap:
    //    the ring/urn placer and ogre drops now have one findable per section. Downloaded from his
    //    share's CDN mp3 (132.2s, ffprobe-verified). Whisper-transcribed EN verses check out as
    //    exactly the message he described ("No matter how many times I fall, I keep moving forward /
    //    Fall, rise, try again / This path is your own, no one else can choose your dream") — the
    //    JA verses and 4 garbled cues are ♪-placeholders in the SRT awaiting his Suno lyric sheet
    //    (whisper JA words are BANNED by measurement; see srt-from-song.py's header).
    //    ⚠ TITLE TWIN: 'WINNING' is also in LootCardBuilder._SONG_TITLES ('SONG' silver) — both or
    //    neither, always.
    {
        id: 'winning',
        family: 'winning',
        karmaLean: 0.8,    // seeded from the song's own transcript (a kids' victory anthem) — [REF#DA-00166]
        hardness: 0.45,    //   re-measure with analyze-audio-tone.js on the next manifest pass. [REF#DA-00167]
        genre: ['cute', 'rock', 'haiku', 'victory'],
        title: 'Winning',
        kanji: '勝ち',
        desc: 'Fall, rise, try again. A winner\'s haiku.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        // ★ CARD 2 (Mark 2026-08-13: "Card 2 = https://suno.com/s/Q0pQT3AD8yjUMysS"). That link resolves [REF#DA-00168]
        // to clip 800389f4-298f-4393-af16-99880ccdae15 at 132.200167 s — this exact file, already wired.
        sunoUrl: 'https://suno.com/s/Q0pQT3AD8yjUMysS',
        file: './assets/sounds/Songs/Starlette-Winning.mp3',
        continuation: null,
        introSeconds: 1,        // measured: first vocal energy at 1.0s [REF#DA-00169]
        seconds: 132.2,
        questGift: true,        // ★ FINDABLE — Card 2. Returned to her stage — ring +25% [REF#DA-00170]
        setList: true,
        captions: './assets/sounds/Songs/Starlette-Winning.srt',
        vocalWindows: [[1.0, 7.25], [14.0, 89.0], [91.0, 126.75]],
    },
    // ── ★ LEVEL 2 FINDABLES (Mark 2026-08-13: "add this to another potential card, but remember only 4 [REF#DA-00171]
    //    of these cards per level, so keep for other levels, ok?") ────────────────────────────────────
    //    Both carry `level: 2`, so questSongsForLevel(1) cannot see them and floor 1's ring stays at
    //    exactly four. They are FULLY WIRED cards, not placeholders — audio on disk, durations measured,
    //    SRTs generated — simply reserved for the next floor.
    {
        id: 'merci-mercy-b',
        family: 'card-4',          // SAME FAMILY as Merci Mercy: Suno gave both takes the same title, and [REF#DA-00172]
                                   // `family` is exactly the field for "these are takes of one song". [REF#DA-00173]
        level: 2,
        karmaLean: 0.7, hardness: 0.35,
        genre: ['jpop', 'haiku'],
        title: 'Merci Mercy (Take B)',   // ⚠ DISAMBIGUATED ON PURPOSE — the Suno og:title is 'Merci Mercy', [REF#DA-00174]
                                         // identical to Card 4's. songByTitle() matches on title and [REF#DA-00175]
                                         // LootCardBuilder keys the card metal off it, so two entries
                                         // sharing a title would collide in both. Different clip
                                         // (a8194918-8237-41cf-87e8-0a4bd3f162de, 82.640167s), different card.
        kanji: '感謝・二',
        desc: 'The same thanks, said again in a different room.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/SRqOPJ9tRA8cKhGv',
        file: './assets/sounds/Songs/Starlette-MerciMercy-B.mp3',
        continuation: null,
        introSeconds: 1,
        seconds: 82.6,
        questGift: true,
        bus: 'cabaret',
        setList: true,
        // Auto-timed 2026-08-13 by UserSongs.autoSrtFromUrl (vocal-share percentile gate): 10 cues, [REF#DA-00176]
        // 69.3% coverage. Cues carry ♪ — machine timing, human words, the standing pipeline law.
        // ⚠ NO `vocalWindows`, deliberately: these edges came from a FULL MIX, not a demucs stem, which
        //   is good enough for captions and NOT good enough to drive her mic-to-face animation. Absent
        //   beats wrong — vocalAt() returns null and the mic falls back cleanly. Same call as Cards 1/3/4.
        captions: './assets/sounds/Songs/Starlette-MerciMercy-B.srt',
        vocalWindows: [[0.0, 1.75], [7.0, 9.0], [12.25, 60.25], [64.5, 65.5], [68.75, 72.25], [75.5, 79.25]],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00225 → see REF#DA-00219]
    },
    {
        id: 'heart-to-heart',
        family: 'heart-to-heart',
        level: 2,
        karmaLean: 0.65, hardness: 0.4,
        genre: ['jpop', 'ballad'],
        title: 'Heart to heart',        // Suno's own title, per Mark's "why are you not using the sunu titles" [REF#DA-00177]
        kanji: '心と心',
        desc: 'Two people, and nothing else in the room.',
        // ── ★ THE SECOND LEGENDARY (Mark 2026-08-17: "heart to heart = Second Legendary Card") ────── [REF#DA-00178]
        //    ⚠ THIS DELIBERATELY SUPERSEDES THE ONE-LEGENDARY RULE, which is written in this repo in
        //      several places as though it were permanent — Mark 2026-08-13: "there is only 1 legendary
        //      - too cute for this game plays only with this legendary card". His 08-17 line is newer
        //      and names this track explicitly, so it wins. Recorded rather than silently overwritten,
        //      because a later seat reading only the 08-13 note would call this a regression and demote
        //      it back. It is NOT a mistake and it is NOT rarity creep: there are now exactly TWO.
        //    ⚠ RARITY IS TWINNED — this line and `_SONG_TITLES` in js/v8/entities/LootCardBuilder.js
        //      MUST move together. That map is a deliberate duplicate (it keeps LootCardBuilder
        //      zero-import so engine and panels can both load it); a song marked legendary in only one
        //      file renders in the wrong metal and NOTHING GOES RED.
        rarity: RARITY.LEGENDARY,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/xZJImsyFrz3eQ7BZ',
        file: './assets/sounds/Songs/Starlette-HeartToHeart.mp3',
        // ── ★ THE SECOND CHORUS (Mark 2026-08-17: "it must have this added as second chorus (same [REF#DA-00179]
        //    song) = https://suno.com/s/gbPIMai1Tp0xXAa3") ────────────────────────────────────────────
        //    That share link is a SEPARATE Suno clip titled "Heart to heart (Chorus)" —
        //    9ff72b6a-7fac-447c-bf5b-c2d4efa4267d — not a re-render of the full song. So it is chained
        //    rather than spliced: NO audio was edited, and part 1 below is byte-identical to what shipped.
        //    The engine plays `file`, waits window._songPartGapMs (3000 default, Engine9 ~:32176), then
        //    plays this. Exactly the mechanism TOO CUTE FOR THIS GAME already uses for its 3-part chain,
        //    which is fitting — the two legendaries now share a shape.
        //    ⚠ 88.8 s is MEASURED off the downloaded file (ffprobe: 88.840167), not taken from the page
        //      and not inferred from bitrate. A wrong `continuationSeconds` desyncs the setlist clock.
        //    ── THE CHORUS CAPTIONS (Mark 2026-08-17: "captions are same lyrics, get the srt for chorus")
        //    ⚠ HIS PREMISE DOES NOT HOLD FOR THIS SONG, AND THAT IS WORTH KNOWING RATHER THAN QUIETLY
        //      WORKING AROUND: Starlette-HeartToHeart.srt (part 1) contains NO LYRICS. It is 29 cues of
        //      a bare ♪ — a music-note marker track, auto-timed to vocal windows. So there were no words
        //      to copy across. Part 2 is therefore generated in the SAME convention, and the two files
        //      now match: ♪ markers on measured windows, no text in either.
        //    ⚠ AND NO, WHISPER IS NOT THE ANSWER HERE. scripts/srt-from-song.py records the score: on
        //      黄泉の宿, the one track with human-written lyrics, it got 0 of 6 lines right, missed the
        //      song's own title, and hallucinated over silence. It fails CONFIDENTLY. If real lyric
        //      captions are wanted for this song, they have to come from Mark — that is a separate job
        //      and it is open for BOTH parts, not just this one (WCAG 1.2.2, knowledge/WCAG_CONFORMANCE.md).
        //    HOW THESE TIMINGS WERE MADE (the half of that tool that IS trustworthy — 19 of 21
        //    hand-authored cues overlap a measured window): demucs isolates the vocal stem, then
        //    `sung_stretches(join_gap=0.2, min_len=0.35)` — the same phrase-level parameters
        //    retime-srt-to-vocals.py uses for its snap onsets — reads windows off SIGNAL LEVEL, not off
        //    a model. 7 cues, 71.5 s of 88.8 s = 80.5% coverage, against part 1's 70.2%.
        continuationCaptions: './assets/sounds/Songs/Starlette-Song-HeartToHeart/Starlette-HeartToHeart-2.srt',
        continuationVocalWindows: [[0.0, 8.25], [10.25, 11.75], [17.25, 76.25], [79.75, 84.5]],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00226 → see REF#DA-00219]
        //    ⚠ If the 3 s gap reads as two songs rather than one song's second chorus, tune [REF#DA-00180]
        //      window._songPartGapMs — do NOT splice the mp3s, or this note stops describing the files.
        continuation: './assets/sounds/Songs/Starlette-Song-HeartToHeart/Starlette-HeartToHeart-2.mp3',
        continuationSeconds: 88.8,
        introSeconds: 1,
        seconds: 128.1,
        questGift: true,
        bus: 'cabaret',
        setList: true,
        captions: './assets/sounds/Songs/Starlette-HeartToHeart.srt',   // auto-timed: 15 cues, 70.2% coverage [REF#DA-00181]
        vocalWindows: [[0.0, 1.25], [6.0, 11.75], [14.5, 45.0], [53.25, 88.25], [93.0, 102.0],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00227 → see REF#DA-00219]
            [108.5, 113.25], [117.0, 125.0]],
    },
    // ── ★ THE ENCORE — LAST, AND ONLY ONCE EVERYTHING ELSE HAS BEEN HEARD (Mark 2026-08-13: "only play [REF#DA-00182]
    //    this song after ALL songs have played in caberet rotation atleast 1x fully") ──────────────────
    //    ⚠ THE AUDIO WAS ALREADY IN THE REPO. His link (clip ec888f76-…, 267.240979s) is a MICROSECOND
    //      match for assets/sounds/Songs/Starlette-FrenchSong-歌に息.mp3, which Composer already uses as
    //      TRACKS.BG_FRENCH — the same "two exports of one master" case as Startup-1/BG-PostParisDream.
    //      `file` points at the LOCAL copy because it is the higher-bitrate export (6294727 vs 6280344
    //      bytes), the same call the legendary card's entry documents making.
    //    ⚠ AND IT HAD NO CATALOG ENTRY AT ALL until now — it existed only as a Composer constant, which
    //      is why it could never be part of her rotation. This entry is what makes it addressable.
    //    `encoreAfterRotation` is the gate: buildSetList withholds it until every OTHER cabaret song has
    //    been heard through to its end at least once. questGift:false — it is not dungeon loot, it is
    //    the reward for having listened.
    {
        id: 'uta-ni-iki-french',
        family: 'uta-ni-iki',      // her French take on 歌に息 — same song, different room [REF#DA-00183]
        karmaLean: 0.45, hardness: 0.22,
        genre: ['ballad', 'jpop', 'french'],
        title: '歌に息 (French)',
        kanji: '歌に息・仏',
        desc: 'The encore. She only sings it once you have heard everything else.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        sunoUrl: 'https://suno.com/s/H6Ib8cxwRAvNp5Be',
        file: './assets/sounds/Songs/Starlette-FrenchSong-歌に息.mp3',
        continuation: null,
        introSeconds: 2,
        seconds: 267.2,
        questGift: false,
        bus: 'cabaret',
        setList: true,
        encoreAfterRotation: true,
        captions: './assets/sounds/Songs/Starlette-FrenchSong-歌に息.srt',   // hand-written, already on disk [REF#DA-00184]
        vocalWindows: [[1.5, 9.5], [11.75, 79.75], [82.5, 89.5], [93.5, 106.25], [108.75, 113.75],   // MEASURED 2026-09-13 — demucs stem, sung_stretches(join_gap=1.5, min_len=0.6), ¼ s grid; same method as 地獄越え (re-measured as the control: identical edges) [REF#DA-00228 → see REF#DA-00219]
            [115.75, 120.5], [122.5, 155.5], [157.5, 178.25], [184.25, 185.25], [195.5, 200.25],
            [203.25, 207.0], [209.25, 214.25], [216.25, 221.0], [223.5, 249.0], [251.5, 263.0]],
    },
    // ── THE VICTORY PARTY (Mark 2026-08-09: "when the entire level is won, we can do a special [REF#DA-00185]
    //    little dance - where the entire dungeon starts singing? like a fun party for kids, just
    //    for one song. I will go create that song, just keep it as Starlette-WINS. have it cute
    //    where we have the caberet super crowded and fun confetti.")
    //    ⚠ FILE NOT ON DISK YET — Mark is producing it. Wired ahead per the shoukan precedent
    //    (entry ready, testable the moment the export lands at `file`). setList:false — this is
    //    an EVENT CUE like the activation fanfare, never in her rotation, never loot. The party
    //    event itself (crowd surge + confetti + all-dungeon singalong, once, on level-won) is
    //    SPEC — needs the file + Mark's build GO; `victoryParty` is its data hook.
    {
        id: 'starlette-wins',
        family: 'starlette-wins',
        karmaLean: 1.0,    // seeded by DESIGN, not measured: "a fun party for kids" is the brief — [REF#DA-00186]
        hardness: 0.2,     //   re-measure with analyze-audio-tone.js when the file lands. [REF#DA-00187]
        genre: ['cute', 'party', 'victory'],
        title: 'Starlette Wins',
        kanji: '勝利の歌',
        desc: 'The whole dungeon sings. Just this once.',
        rarity: RARITY.SONG,
        catId: 'ITEM',
        file: './assets/sounds/Songs/Starlette-WINS.mp3',
        continuation: null,
        introSeconds: 0,
        seconds: null,
        questGift: false,
        setList: false,
        bus: 'cabaret',
        victoryParty: true,
    },
]);

const _byId = new Map(SONGS.map(s => [s.id, s]));

// ── PLAYER-UPLOADED SONGS (2026-08-06, AI5) ───────────────────────────────────────────────────── [REF#DA-00188]
// Mark: "allowing user to upload their own song ... this will feed into the starlettes song list."
// A separate MUTABLE array rather than pushing into the frozen SONGS above — SONGS is committed
// source, uploads are runtime state from js/v8/audio/UserSongs.js (OPFS-backed). Kept OUT of
// SONG_TITLES/vocalWindows/captionSources on purpose: a user upload is never a loot card (no card-art
// title matching needed) and never has a fetchable caption URL (Engine9 registers its captions
// directly via window._registerSongCaptions instead — see the plan's B4). It IS unioned into
// songById/songByFile/buildSetList below, which is everywhere her live rotation actually reads from.
const USER_SONGS = [];

/** [REF#DA-00189]
 * Wires one player upload into her rotation. `entry` is a js/v8/audio/UserSongs.js index row
 * ({slug, title, seconds, ...}); `fileUrl` is a blob: URL the CALLER minted in ITS OWN frame — see
 * that file's header for why this is never shared as a single URL across frames. Idempotent by slug,
 * so re-hydrating the same upload on every boot replaces its old entry instead of duplicating it.
 */
export function registerUserSong(entry, fileUrl) {
    if (!entry || !entry.slug || !fileUrl) return null;
    const id = 'user-' + entry.slug;
    const song = {
        id, title: entry.title || entry.slug, kanji: '', desc: 'Your own track.',
        catId: 'ITEM', rarity: RARITY.SONG, bus: BUS.CABARET,
        family: id, genre: [], hardness: 0.5, karmaLean: 0,
        file: fileUrl, continuation: null, seconds: entry.seconds || null, introSeconds: 0,
        // Theirs already — never gated behind a dungeon drop, per Mark's ruling in the plan (B3). [REF#DA-00190]
        questGift: false, setList: true, userUploaded: true,
    };
    const i = USER_SONGS.findIndex(s => s.id === id);
    if (i >= 0) USER_SONGS[i] = song; else USER_SONGS.push(song);
    return song;
}
/** Every registered upload, for the music page's own listing. [REF#DA-00191] */
export function userSongs() { return USER_SONGS.slice(); }

export function songById(id) { return _byId.get(String(id)) || USER_SONGS.find(s => s.id === String(id)) || null; }
export function songByFile(file) {
    // continuation2 resolves here too (2026-08-09) — part 3 must identify as its song or the [REF#DA-00192]
    // caption/vocal-window maps (keyed per part basename) go silent on the final take.
    const f = String(file || '');
    return SONGS.find(s => s.file === f || s.continuation === f || s.continuation2 === f) || USER_SONGS.find(s => s.file === f) || null;
}
/** Card title → song. The card is the only handle the loot/turn-in path has. [REF#DA-00193] */
export function songByTitle(title) {
    const t = String(title || '').replace(/\s*x\d+$/i, '').trim().toUpperCase();
    return SONGS.find(s => s.title.toUpperCase() === t) || null;
}
export function isLegendary(song) { return !!song && song.rarity === RARITY.LEGENDARY; }

/** [REF#DA-00194]
 * mp3 filename -> SRT path, for the haiku caption boxes. Keyed by FILENAME rather than by path or id
 * because that is the only handle the caption loop has: it reads what the <audio> element is actually
 * playing. Built from the catalog so adding a song with lyrics is one entry, not an entry plus a second
 * hardcoded map in Engine9 that can silently disagree with it — which is what shipped before, complete
 * with a caption title frozen at '♪ 黄泉の宿' for every track.
 * Songs with no `captions` are simply absent; the loader treats a missing or 404'd SRT as "no captions
 * for this song" and never lets it take the other songs' captions down with it.
 */
/** [REF#DA-00195]
 * mp3 filename -> [[start, end], …] seconds where a VOICE is actually sounding.
 *
 * Mark 2026-07-31: "pay attention to when vocals sound - so to make sure to use animation with her
 * microphone to her face at those times. mark when those are in the scripts."
 *
 * ⚠ THESE ARE MEASURED, NOT AUTHORED. Each pair comes from an RMS sweep of the demucs-isolated vocal
 * stem (scripts/srt-from-song.py, sung_stretches), gated 26 dB under the vocal peak. They are signal,
 * not opinion — which matters, because the obvious alternative is to drive the mic off the CAPTION
 * timings, and captions come from a speech model that has already been caught inventing lines over
 * silence and missing 19.5 seconds of real singing. Driving an animation from that would lift her arm
 * for words she is not singing and drop it while she is.
 *
 * The other rejected option was the CLIP NAME, which is what the mic lift used before: "is the 'sing'
 * animation playing". That is true across an entire three-minute track including its instrumental
 * breaks, so the mic sat at her face through the whole thing and the gesture meant nothing.
 */
export function vocalWindows() {
    const out = Object.create(null);
    const name = p => decodeURIComponent(String(p || '').split('/').pop() || '');
    for (const s of SONGS) {
        if (Array.isArray(s.vocalWindows)) out[name(s.file)] = s.vocalWindows;
        // A two-part song's second half has its own timeline — media time resets to 0 across the [REF#DA-00196]
        // handoff, so its windows must be keyed to the continuation FILE or the mic would read part 2's
        // playhead against part 1's windows and lift her arm in all the wrong places.
        if (s.continuation && Array.isArray(s.continuationVocalWindows))
            out[name(s.continuation)] = s.continuationVocalWindows;
        // third part (2026-08-09, the TooCute trio) — same per-part-timeline law as above [REF#DA-00197]
        if (s.continuation2 && Array.isArray(s.continuation2VocalWindows))
            out[name(s.continuation2)] = s.continuation2VocalWindows;
    }
    return out;
}

/** Is a voice sounding at `t` seconds into `file`? Null when the song has no measurement yet. [REF#DA-00198] */
export function vocalAt(file, t) {
    const name = decodeURIComponent(String(file || '').split('/').pop() || '');
    const win = vocalWindows()[name];
    if (!win) return null;
    for (const [a, b] of win) if (t >= a && t <= b) return true;
    return false;
}

export function captionSources() {
    const out = Object.create(null);
    const name = p => decodeURIComponent(String(p || '').split('/').pop() || '');
    for (const s of SONGS) {
        if (s.captions) out[name(s.file)] = s.captions;
        if (s.continuation && s.continuationCaptions) out[name(s.continuation)] = s.continuationCaptions;
        if (s.continuation2 && s.continuation2Captions) out[name(s.continuation2)] = s.continuation2Captions;
    }
    return out;
}

/** Every song title, for the explicit-list matchers in LootCardBuilder (never a regex — see that file). [REF#DA-00199] */
export const SONG_TITLES = Object.freeze(SONGS.map(s => s.title.toUpperCase()));

/** [REF#DA-00200]
 * The setlist she can actually perform, given what the player has turned in.
 *
 * `unlockedIds` is the save-state set. Songs with questGift:false are ALWAYS present — a cabaret with an
 * empty setlist is a silent treasured scene, which is the documented failure mode that already cost two
 * rounds on the combat music. So this never returns an empty array while a non-quest song exists.
 *
 * ⚠ `gateOn` DEFAULTS TO FALSE, AND THAT IS DELIBERATE. With the gate off this returns every song, i.e.
 * exactly the hand-authored setlist that shipped before the quest existed. The machinery is built and
 * testable, but the game Mark plays today is unchanged. Turning the gate on before songs are actually
 * PLACED as dungeon loot would strand him: her set drops to the one house song and there is no way in
 * normal play to earn the rest back, so the cabaret quietly loses two thirds of its music. Flip it with
 * window._songQuestGate = true once the drops exist.
 */
export function buildSetList(unlockedIds, gateOn = false, opts = null) {
    // `setList:false` songs are CUES, not numbers — the activation fanfare must never end up in her [REF#DA-00201]
    // rotation. Filtered at the top so BOTH the gate-off and the empty-fallback paths below inherit
    // it; excluding it in only one branch would have let it slip back in on a fresh save, which is
    // exactly when the player is most likely to hear the moment ruined.
    // USER_SONGS unioned in here too — a player's own upload has questGift:false so it survives the
    // gate-on branch below exactly like the activation song does, never waiting on a dungeon drop.
    //
    // ⚠ AND IT MUST BE ON THE CABARET BUS. Mark 2026-08-08: "the crimson fan, the inn, the summons,
    //   crossing == those are all background dungeon soundtracks - very basic." This filter is the
    //   whole reason the SONGS page exists. Before it, `bus` was authored metadata that NOTHING read:
    //   CRIMSON FAN carried `bus:'background'` from Mark's 08-03 ruling and this function handed it to
    //   Starlette anyway, because it only ever tested `setList`. Five days of a silent disagreement
    //   between a field and its only consumer.
    //
    //   A PLAYER UPLOAD IS ALWAYS HERS. USER_SONGS entries are minted with bus:CABARET by
    //   registerUserSong(), so they pass inRotation() without a special case — but they are unioned in
    //   BEFORE the filter deliberately, so a future upload path that forgets that field fails loudly
    //   here rather than quietly vanishing from her set.
    // ── THE ENCORE IS HELD BACK UNTIL EVERYTHING ELSE HAS BEEN HEARD (Mark 2026-08-13: "only play this
    //    song after ALL songs have played in caberet rotation atleast 1x fully") ──────────────────────
    //    `window._songsHeardFully` is a Set of file paths the engine adds to when a cabaret song reaches
    //    its END (not when it starts, and not when the player walks out mid-number — "1x fully" is the
    //    instruction and the word doing the work is FULLY).
    //    ⚠ THE TEST EXCLUDES THE ENCORES THEMSELVES, or the gate could never open: an encore waiting on
    //      a set that contains the encore is a rotation that can never complete. So it asks whether every
    //      NON-encore performable song has been heard.
    const _heard = (typeof window !== 'undefined' && window._songsHeardFully instanceof Set)
        ? window._songsHeardFully : null;
    const _encoreReady = (list) => {
        const need = list.filter(s => s.encoreAfterRotation !== true);
        if (!need.length) return true;                  // nothing else to hear ⇒ nothing to wait for [REF#DA-00202]
        if (!_heard || !_heard.size) return false;
        return need.every(s => _heard.has(s.file));
    };
    const _allPerformable = SONGS.concat(USER_SONGS)
        .filter(s => s.setList !== false)
        .filter(s => inRotation(s, 'cabaret'));
    const _encoreOn = _encoreReady(_allPerformable);
    const PERFORMABLE = _allPerformable.filter(s => s.encoreAfterRotation !== true || _encoreOn);
    // ── THE SILENT-CABARET GUARD ──────────────────────────────────────────────────────────────── [REF#DA-00203]
    // "a cabaret with an empty setlist is a silent treasured scene, the documented failure mode that
    // already cost two rounds on the combat music" (Engine9 ~:28260). Moving four songs to the
    // background bus can legitimately empty this list — if Mark also unticks CABARET on the last one
    // left, the room must not go dark. Falling back to the activation song keeps the Succubus Cabaret
    // scene alive no matter what the ticks say; it is the one number that is hers by definition.
    // ⛔ SUPERSEDED 2026-09-11 by Mark: "caberet is playing songs that have NOT been given to the caberet - stop that"
    //    + "dont play the other songs as songs". The old rule here ("questGift:false songs are ALWAYS present so the
    //    cabaret is never silent") is exactly what put Caberet Sounds / Caberet 5 / Crossing Hell on her stage
    //    unearned. Her SET is the songs the player TURNED IN — nothing else. The activation song is cued by role
    //    at the permit hand-over (Engine9 ~:37913), not through this list. An EMPTY set is the design, not a
    //    failure: she sits idle, the house goes dark, the dungeon's background rotation carries the room until a
    //    song card comes home (Engine9 ended-handler, `_cabSetExhausted`).
    // ── WHO SINGS, AND IN WHAT LANGUAGE (Mark 2026-09-26: "Stariko is the star of floor 2 ... its new music, so its more JPOP theme and
    //    only Japanese for floor 2"). opts = { cast: 'starlette'|'stariko'|'both', lang: 'ja'|null } from the engine for THIS floor.
    //      · a song with a `singer` is only in the set where that singer performs ('both' takes everyone);
    //      · with a `lang`, only songs tagged that language are in (untagged songs stay out — tagging is the curation);
    //      · a `headline` song leads the set and is not gated behind a returned card: it is the star's OWN number, the one exception
    //        to the 09-11 "only the songs the player turned in" rule above (Mark 2026-09-26 names it as hers).
    //    No opts → the old behaviour, minus any singer-tagged song.
    const cast = opts && opts.cast, lang = opts && opts.lang;
    const _fits = (s) => (!s.singer || !cast || cast === 'both' || s.singer === cast) && (!lang || s.lang === lang);
    const FIT = opts ? PERFORMABLE.filter(_fits) : PERFORMABLE.filter(s => !s.singer);
    const HEAD = FIT.filter(s => s.headline === true);
    const _lead = (list) => HEAD.concat(list.filter(s => s.headline !== true)).map(s => s.file);
    if (gateOn !== true) return _lead(FIT);
    const have = unlockedIds instanceof Set ? unlockedIds
        : new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
    return _lead(FIT.filter(s => s.questGift === true && have.has(s.id)));
}

/** The one-shot cue for a moment (currently 'activation'). Null when no song claims that role. [REF#DA-00204] */
export function songByRole(role) {
    const r = String(role || '').toLowerCase();
    return SONGS.find(s => String(s.role || '').toLowerCase() === r) || null;
}

/** Continuation map in the shape Engine9's transport already expects. [REF#DA-00205] */
export function buildContinuationMap() {
    const out = {};
    for (const s of SONGS) {
        if (s.continuation) out[s.file] = s.continuation;
        // third part (2026-08-09, shoukan's TooCute trio): the map is file→next, so a 3-part song [REF#DA-00206]
        // is simply two hops. The engine's ended-handler walks it one hop at a time.
        if (s.continuation && s.continuation2) out[s.continuation] = s.continuation2;
        // FOURTH PART (2026-08-16, Mark: "add this to the end of the song we have Too Cute for this [REF#DA-00207]
        // Game == this is its second chorus"). Same shape, one more hop — the engine needs no change
        // because it never assumes a depth, it just looks up "what follows the file that ended".
        // ⚠ Each hop is guarded on the PREVIOUS one existing, so a song may not skip a rung: setting
        // continuation3 without continuation2 is silently ignored rather than producing a broken map
        // that jumps from part 1 to part 4.
        if (s.continuation2 && s.continuation3) out[s.continuation2] = s.continuation3;
    }
    return out;
}

/** Intro seconds for a path, replacing the filename regex. Falls back to the old default. [REF#DA-00208] */
export function introSecondsFor(file) {
    const s = songByFile(file);
    return (s && typeof s.introSeconds === 'number') ? s.introSeconds : 3;
}

export default SONGS;
