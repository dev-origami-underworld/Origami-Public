/** [REF#AU-00189]
 * GenreStore.js — MARK'S TAXONOMY, EDITABLE IN GAME, AND ABLE TO GET BACK OUT AGAIN.
 *
 * Mark 2026-08-04: "we can group our music on taxonomies … we can then have fuzzy logic preselect such
 * song variants based on user preferences, like a smart tuner. But we have to have such a list filled
 * out by ME, so that will be an open edit field in every song list so I can add that GENRE setting to
 * each sound track we put in. one song can have several variants."
 * Mark 2026-08-05: "an editable genre selector hard/soft like a slider because its going to impact the
 * types of caberet songs that players will get -- very soft gentle or hard rocking daemonic".
 *
 * ── THE EXPORT IS THE POINT, AND IT IS WHY THIS FILE EXISTS BEFORE ANY UI ────────────────────────
 * An "open edit field" that saves to localStorage is a trap. Mark would sit down, tag thirty tracks,
 * and lose the lot to a cache clear, a new browser, or the service worker — and nobody would notice
 * until the taxonomy was needed. Authored data must have a committed home. So the ONLY promise this
 * file makes is: whatever he types can be `exportSource()`d into a block that gets pasted straight
 * into `SongCatalog.js` and committed. localStorage is the SCRATCHPAD, never the record.
 *
 * That is the same failure class as the legendary entry that pointed at an mp3 which never existed on
 * disk, and the FrenchSong/TooCute takes sitting untracked: authored work with nowhere permanent to go.
 *
 * ── HOW THE SLIDER PICKS ─────────────────────────────────────────────────────────────────────────
 * Not a filter. A filter at 0.2 would leave a player who likes soft songs with a two-track dungeon and
 * a silent cabaret — the exact opposite of a game about bringing music back. It is a WEIGHTING: every
 * song stays eligible, songs near the player's setting come up far more often, and a distant one still
 * surfaces occasionally so the set never goes stale. `tolerance` is how forgiving that curve is.
 *
 * Reads: window._songHardnessPref (0..1) · window._songGenreOverrides (from here) · the catalog seeds.
 */
import { SONGS, songById } from '../data/SongCatalog.js?v=8.4.2741-comment-refs';
// MEASURED TONE for every file on disk, catalogued or not (scripts/analyze-audio-tone.js). Without [REF#AU-00190]
// this the two sliders could only reason about the six tracks the catalog wires, and would treat the
// other thirty as a flat 0.5/0 — i.e. the sliders would appear to do nothing for most of the library.
import { TONE } from '../data/ToneAnalysis.js?v=8.4.278-audio-ref';
import { AUDIO_FILES } from '../data/AudioManifest.js?v=8.4.278-audio-ref';
// file path → 'ja' | null, so the language lean can be applied to catalogued and raw tracks alike. [REF#AU-00191]
const TONE_LANG = Object.create(null);
for (const f of AUDIO_FILES) TONE_LANG[f.file] = f.lang || null;

const LS_TAX  = 'origami.v8.songTaxonomy';   // Mark's edits — the SCRATCHPAD [REF#AU-00192]
const LS_PREF = 'origami.v8.songHardness';   // the player's slider — a real preference, belongs here [REF#AU-00193]
const LS_KARMA = 'origami.v8.songKarmaLean'; // the dark/light slider (Mark 2026-08-05) [REF#AU-00194]
// ── WINAMP EQ/BOOSTER PREFS (2026-08-06, AI5) ─────────────────────────────────────────────────── [REF#AU-00195]
// Same shape as hardness/karma above: window mirror for the hot path (Engine9 reads these on the
// audio-graph rebuild, not just on slider drag), localStorage for the cold path (page reload).
// See knowledge/design/MUSIC_PLAYER_WINAMP_AND_USER_SONGS_PLAN.md Phase A3.
const LS_EQ      = 'origami.v8.songEqBands';   // 10 numbers, dB, -12..12, one per MP_EQ_FREQS band [REF#AU-00196]
const LS_PREAMP  = 'origami.v8.songPreamp';    // linear gain multiplier, 0..4 — THE booster [REF#AU-00197]
const LS_BALANCE = 'origami.v8.songBalance';   // stereo pan, -1..1 [REF#AU-00198]

const _w = () => (typeof window !== 'undefined' ? window : {});
const _clamp01 = v => Math.max(0, Math.min(1, Number(v)));
const _clamp11 = v => Math.max(-1, Math.min(1, Number(v)));

function _readTax() {
    try { const raw = localStorage.getItem(LS_TAX); const o = raw ? JSON.parse(raw) : null;
          return (o && typeof o === 'object') ? o : {}; }
    catch (_) { return {}; }
}
function _writeTax(o) { try { localStorage.setItem(LS_TAX, JSON.stringify(o)); } catch (_) {} }

/** [REF#AU-00199]
 * The effective taxonomy for one track. Resolution order, most authoritative first:
 *   1. Mark's in-game edit          — he is the authority, always
 *   2. the catalog entry            — committed source (itself now seeded from the measurement)
 *   3. the measured tone analysis   — covers every file on disk, including the uncatalogued ones
 *   4. neutral defaults
 * `id` may be a catalog id OR a raw file path, because the music page lists both.
 */
export function taxonomyOf(id) {
    const s = songById(id);
    const tone = TONE[id] || (s && TONE[s.file]) || null;
    // language is keyed by FILE, so a catalog id has to resolve through its file first [REF#AU-00200]
    const _langKey = (s && s.file) || id;
    if (!s) {
        // A track that exists on disk but not in the catalog still deserves real numbers. [REF#AU-00201]
        if (!tone) return null;
        const ov0 = _readTax()[id] || {};
        return {
            id, title: String(id).split('/').pop(),
            family: ov0.family != null ? ov0.family : id,
            genre: ov0.genre != null ? ov0.genre : [],
            hardness: ov0.hardness != null ? _clamp01(ov0.hardness) : _clamp01(tone.hardness),
            karmaLean: ov0.karmaLean != null ? _clamp11(ov0.karmaLean) : _clamp11(tone.karmaLean),
            measured: true,
            edited: !!(ov0.family != null || ov0.genre != null || ov0.hardness != null || ov0.karmaLean != null),
        };
    }
    const ov = _readTax()[id] || {};
    return {
        id,
        title: s.title,
        _langFile: _langKey,
        family:   ov.family   != null ? ov.family   : (s.family || id),
        genre:    ov.genre    != null ? ov.genre    : (Array.isArray(s.genre) ? s.genre.slice() : []),
        hardness: ov.hardness != null ? _clamp01(ov.hardness)
                : (typeof s.hardness === 'number' ? _clamp01(s.hardness)
                : (tone ? _clamp01(tone.hardness) : 0.5)),
        karmaLean: ov.karmaLean != null ? _clamp11(ov.karmaLean)
                 : (typeof s.karmaLean === 'number' ? _clamp11(s.karmaLean)
                 : (tone ? _clamp11(tone.karmaLean) : 0)),
        edited: !!(ov.family != null || ov.genre != null || ov.hardness != null || ov.karmaLean != null),
    };
}

/** Every song with its effective taxonomy — what a song-list editor renders. [REF#AU-00202] */
export function allTaxonomy() { return SONGS.map(s => taxonomyOf(s.id)).filter(Boolean); }

/** Mark's edits. Passing null for a field clears that override back to the catalog seed. [REF#AU-00203] */
export function setTaxonomy(id, { family, genre, hardness, karmaLean } = {}) {
    if (!songById(id)) return false;
    const tax = _readTax();
    const cur = tax[id] || (tax[id] = {});
    if (family   !== undefined) { if (family === null) delete cur.family; else cur.family = String(family); }
    if (genre    !== undefined) { if (genre === null) delete cur.genre; else cur.genre = (Array.isArray(genre) ? genre : String(genre).split(/[,\s]+/)).filter(Boolean).map(g => String(g).toLowerCase()); }
    if (hardness !== undefined) { if (hardness === null) delete cur.hardness; else cur.hardness = _clamp01(hardness); }
    if (karmaLean !== undefined) { if (karmaLean === null) delete cur.karmaLean; else cur.karmaLean = _clamp11(karmaLean); }
    if (!Object.keys(cur).length) delete tax[id];
    _writeTax(tax);
    return true;
}

/** Throw away every unsaved edit and fall back to what is committed in the catalog. [REF#AU-00204] */
export function revertEdits() { try { localStorage.removeItem(LS_TAX); } catch (_) {} }

/** How many edits are sitting in the scratchpad, unsaved. The UI should show this loudly. [REF#AU-00205] */
export function pendingEditCount() { return Object.keys(_readTax()).length; }

/** [REF#AU-00206]
 * ── THE ROUND TRIP ───────────────────────────────────────────────────────────────────────────────
 * Emits a paste-able block, one line per edited song, in exactly the field order SongCatalog.js uses.
 * Deliberately NOT a JSON blob: the target is hand-maintained source with comments, and a diff of
 * three changed lines is reviewable where a regenerated file is not.
 */
export function exportSource() {
    const rows = allTaxonomy().filter(t => t.edited);
    if (!rows.length) return '// no taxonomy edits pending — SongCatalog.js already matches what is in game\n';
    const lines = [
        '// ── PASTE INTO js/v8/data/SongCatalog.js ──────────────────────────────────────────────',
        '//    Authored by Mark in-game, exported ' + (rows.length) + ' edited entr' + (rows.length === 1 ? 'y' : 'ies') + '.',
        '//    Replace the family/genre/hardness lines on each listed entry, then COMMIT — until this is',
        '//    committed the values live only in one browser\'s localStorage and a cache clear erases them.',
        '',
    ];
    for (const t of rows) {
        lines.push('// ' + t.id + '  (' + t.title + ')');
        lines.push("        family: '" + t.family + "',");
        lines.push('        genre: [' + t.genre.map(g => "'" + g + "'").join(', ') + '],');
        lines.push('        hardness: ' + t.hardness.toFixed(2) + ',');
        lines.push('        karmaLean: ' + t.karmaLean.toFixed(2) + ',');
        lines.push('');
    }
    return lines.join('\n');
}

/** The player's hard/soft setting. 0 = very soft gentle, 1 = hard rocking daemonic. [REF#AU-00207] */
export function hardnessPref() {
    const w = _w();
    if (typeof w._songHardnessPref === 'number') return _clamp01(w._songHardnessPref);
    try { const v = localStorage.getItem(LS_PREF); if (v != null) return _clamp01(parseFloat(v)); } catch (_) {}
    return 0.5;
}
export function setHardnessPref(v) {
    const c = _clamp01(v);
    try { localStorage.setItem(LS_PREF, String(c)); } catch (_) {}
    try { _w()._songHardnessPref = c; } catch (_) {}
    return c;
}

/** [REF#AU-00208]
 * The dark/light setting, -1..+1 (Mark 2026-08-05: "a dark / light slider for if its going to be for
 * -negative karma or positive karma more"). Independent of hardness — see the catalog header.
 */
/** [REF#AU-00209]
 * ── JAPANESE-LANGUAGE TUNES (Mark 2026-08-05) ───────────────────────────────────────────────────
 * "I have some japanese only tunes, which we would only play to those who have japanese language
 * selected on the browser, but will allow all players to hear them. I just thought it would add
 * flavour to the game."
 *
 * Both halves of that matter and they pull in opposite directions, so this is a WEIGHT, never a gate:
 *   · a browser set to Japanese hears them far more often — that is the flavour he is after;
 *   · everyone else can still play them, still sees them in the list, and still meets them in her set
 *     now and then, because "will allow all players to hear them" is the other half of the sentence.
 * Hiding them from non-JA players would be the easy reading and the wrong one — this is a game about
 * discovering music, and a locked-off shelf is the opposite of that.
 *
 * Off / forced for testing: window._jaAudioBoost = 1 (no preference) or 3 (as if the browser were JA).
 */
export function jaPreferred() {
    const w = _w();
    if (typeof w._jaAudioBoost === 'number') return w._jaAudioBoost;
    try { if (/^ja\b/i.test(navigator.language || '')) return 2.6; } catch (_) {}
    try { if ((navigator.languages || []).some(l => /^ja\b/i.test(l))) return 2.0; } catch (_) {}
    return 0.75;   // still reachable everywhere — a mild lean away, not a wall [REF#AU-00210]
}

export function karmaPref() {
    const w = _w();
    if (typeof w._songKarmaPref === 'number') return _clamp11(w._songKarmaPref);
    try { const v = localStorage.getItem(LS_KARMA); if (v != null) return _clamp11(parseFloat(v)); } catch (_) {}
    return 0;
}
export function setKarmaPref(v) {
    const c = _clamp11(v);
    try { localStorage.setItem(LS_KARMA, String(c)); } catch (_) {}
    try { _w()._songKarmaPref = c; } catch (_) {}
    return c;
}

/** [REF#AU-00211]
 * Weight one song against the current preference. Never returns 0 — see the header: a filter would
 * silence the dungeon for anyone with a strong taste, and this is a game about music coming back.
 * `tolerance` widens the curve; window._songHardnessTolerance overrides it.
 */
export function weightFor(songOrId, pref = hardnessPref(), kpref = karmaPref()) {
    const id = (typeof songOrId === 'string') ? songOrId : (songOrId && songOrId.id);
    const t = taxonomyOf(id);
    if (!t) return 0.15;
    const tol = (typeof _w()._songHardnessTolerance === 'number') ? Math.max(0.05, _w()._songHardnessTolerance) : 0.34;
    const ktol = (typeof _w()._songKarmaTolerance === 'number') ? Math.max(0.1, _w()._songKarmaTolerance) : 0.8;
    // TWO INDEPENDENT AXES, MULTIPLIED. A song has to fit BOTH to be strongly preferred, which is the [REF#AU-00212]
    // point of having two sliders — 地獄越え is hard AND dark, and a player who wants hard-and-LIGHT
    // should not be handed it just because the hardness matched.
    //   · hardness is 0..1 over a 1.0 range · karmaLean is -1..+1 over a 2.0 range, hence the wider
    //     default tolerance: the same 0.34 would make the karma axis roughly twice as brutal.
    const d = Math.abs(t.hardness - _clamp01(pref));
    const k = Math.abs(t.karmaLean - _clamp11(kpref));
    const wH = Math.exp(-(d * d) / (2 * tol * tol));
    const wK = Math.exp(-(k * k) / (2 * ktol * ktol));
    // LANGUAGE LEAN — see jaPreferred(). Multiplied in, never used to exclude. [REF#AU-00213]
    let wL = 1;
    try {
        const rec = TONE_LANG[t._langFile || t.id] || null;
        if (rec === 'ja') wL = jaPreferred();
    } catch (_) {}
    // Floored so nothing is ever unreachable — see the header: a filter would silence the dungeon. [REF#AU-00214]
    return Math.max(0.06, wH * wK * wL);
}

/** Rank a list by fit, best first. For a playlist's "suggested" order — it hides nothing. [REF#AU-00215] */
export function rankByPreference(songs = SONGS, pref = hardnessPref(), kpref = karmaPref()) {
    return songs.slice()
        .map(s => ({ song: s, weight: weightFor(s, pref, kpref) }))
        .sort((a, b) => b.weight - a.weight);
}

/** [REF#AU-00216]
 * Weighted pick — the "smart tuner". `rng` is injectable so a probe can assert the distribution
 * instead of sampling and hoping.
 */
export function pickByPreference(songs = SONGS, pref = hardnessPref(), rng = Math.random, kpref = karmaPref()) {
    const pool = (songs || []).filter(Boolean);
    if (!pool.length) return null;
    const ws = pool.map(s => weightFor(s, pref, kpref));
    const total = ws.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return pool[0];
    let r = rng() * total;
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
}

/** Takes of the same song — entries sharing a family. This is what "next variant" cycles through. [REF#AU-00217] */
export function familyOf(id) {
    const t = taxonomyOf(id);
    if (!t) return [];
    return SONGS.filter(s => (taxonomyOf(s.id) || {}).family === t.family);
}

/** [REF#AU-00218]
 * ── THE 10 WINAMP-STYLE EQ BANDS, THE PREAMP FADER, AND THE BALANCE KNOB ────────────────────────
 * Mark 2026-08-06: "update the player to look like winamp with the equalizer and graphs and volume
 * booster." The graph itself lives in Engine9 (only frame that owns the audio element — see the
 * plan's T1/T2); this file is just the persisted VALUES, same pattern as hardness/karma above so a
 * cache clear does not erase a tuning session. `bands[i]` corresponds 1:1 with MP_EQ_FREQS in
 * Engine9's `_mpEnsureGraph` — 60/170/310/600/1k/3k/6k/12k/14k/16k Hz, Winamp's own layout.
 */
export function eqBands() {
    const w = _w();
    if (Array.isArray(w._songEqBands) && w._songEqBands.length === 10) return w._songEqBands.slice();
    try { const v = localStorage.getItem(LS_EQ); if (v) { const a = JSON.parse(v); if (Array.isArray(a) && a.length === 10) return a; } } catch (_) {}
    return new Array(10).fill(0);
}
export function setEqBands(bands) {
    const arr = (Array.isArray(bands) ? bands.slice(0, 10) : new Array(10).fill(0))
        .map(v => Math.max(-12, Math.min(12, Number(v) || 0)));
    while (arr.length < 10) arr.push(0);
    try { localStorage.setItem(LS_EQ, JSON.stringify(arr)); } catch (_) {}
    try { _w()._songEqBands = arr; } catch (_) {}
    return arr;
}
/** One band at a time — what dragging a single Winamp slider actually does. [REF#AU-00219] */
export function setEqBand(i, db) {
    const arr = eqBands();
    if (i >= 0 && i < 10) arr[i] = Math.max(-12, Math.min(12, Number(db) || 0));
    return setEqBands(arr);
}

/** The volume BOOSTER. 1 = unity (today's loudness). Capped at 4x — see plan §5 Q4 for why a limiter [REF#AU-00220]
 *  rides behind this rather than shipping it uncapped: an unmastered 4x gain clips, and on headphones
 *  that is a hearing-safety question for the kids this page is built for, not just a taste one. */
export function preampPref() {
    const w = _w();
    if (typeof w._songPreampPref === 'number') return Math.max(0, Math.min(4, w._songPreampPref));
    try { const v = localStorage.getItem(LS_PREAMP); if (v != null) return Math.max(0, Math.min(4, parseFloat(v))); } catch (_) {}
    return 1;
}
export function setPreampPref(v) {
    const c = Math.max(0, Math.min(4, Number(v) || 0));
    try { localStorage.setItem(LS_PREAMP, String(c)); } catch (_) {}
    try { _w()._songPreampPref = c; } catch (_) {}
    return c;
}

/** Stereo balance, -1 (full left) .. +1 (full right). Requires a StereoPannerNode (Engine9 checks [REF#AU-00221]
 *  for support and leaves the control inert rather than throwing on a browser without one). */
export function balancePref() {
    const w = _w();
    if (typeof w._songBalancePref === 'number') return _clamp11(w._songBalancePref);
    try { const v = localStorage.getItem(LS_BALANCE); if (v != null) return _clamp11(parseFloat(v)); } catch (_) {}
    return 0;
}
export function setBalancePref(v) {
    const c = _clamp11(v);
    try { localStorage.setItem(LS_BALANCE, String(c)); } catch (_) {}
    try { _w()._songBalancePref = c; } catch (_) {}
    return c;
}

try {
    _w()._genreStore = { taxonomyOf, allTaxonomy, setTaxonomy, revertEdits, pendingEditCount,
                         exportSource, hardnessPref, setHardnessPref, karmaPref, setKarmaPref,
                         weightFor, rankByPreference, pickByPreference, familyOf, jaPreferred,
                         eqBands, setEqBands, setEqBand, preampPref, setPreampPref, balancePref, setBalancePref };
} catch (_) {}
