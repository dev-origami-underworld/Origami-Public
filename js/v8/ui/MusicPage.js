/** [REF#UI-00071]
 * MusicPage.js — THE PLAYER'S OWN MUSIC PAGE.
 *
 * Mark 2026-08-05 also, and it is NOT a voting page: "make sure not to do the multiplayer voting stuff,
 * just the checkbox". The song-vote/Cloudflare work stays banked and inert; nothing here reads it,
 * writes it, or can reach the network.
 *
 * Mark 2026-08-04: "this only shows up when players click on the music symbol, then they can see a music
 * player there on the page, left side is the list of songs tabs up at top for STARLETTE / CABERET and
 * the other SOUNDTRACKS for combat / gambling and general."
 * And the reason it exists at all: "kids will be hearing tracks they never heard before, and it will be
 * like a musically for what sounds they like to hear, they can quickly select next variant."
 *
 * ── THE ONE IDEA THIS PAGE HAS TO GET RIGHT ─────────────────────────────────────────────────────
 * The dungeon is ABANDONED and starts silent. Music is not a setting here, it is LOOT — the player
 * finds songs and gives them back to Starlette, and the place wakes up. So this page is a collection
 * screen before it is a player, and an empty tab is not a bug: it is the game telling you there is
 * something out there you have not found. That is why the empty states read "you have not found any
 * yet" and never "nothing here". Mark's own ruling: "the combat BG songs have to be found."
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────────
 *   · No delete. Mark asked for a play/remove checkbox on Starlette's rotation and was asked twice
 *     whether "remove" means permanently out of her set or just skip-for-now; he has not answered. A
 *     checkbox that silently destroys found progression is not something to invent, so this ships the
 *     REVERSIBLE reading — untick = she skips it tonight, tick = it is back — and says so in the UI.
 *   · No upload. Generated songs are coming ("kids can generate their own songs"), but audio never
 *     crosses the vote Worker and this page will not grow an upload field by accident.
 *
 * Talks to the engine the way every other panel does: postMessage through the shell relay. It never
 * reaches into the engine frame, and it never constructs an Audio element of its own — the engine owns
 * one music transport (window._installMusicTransport) and a second player would fight it.
 */

import { ROLES, roleOf as _roleOf, EXTRA_TRACKS, KNOWN_FILES, LS_ROLES } from '../data/MusicRoles.js?v=8.4.2741-comment-refs';   // one role per track; Crimson Fan card roles are rejected (2026-10-10) [REF#UI-01438]

const TABS = [
    // ── THE TABS ARE THE ROLES (2026-09-29) — one role per track (js/v8/data/MusicRoles.js), the same answer the game plays by. [REF#UI-01439]
    //    Replaces STARLETTE / CABARET / COMBAT / GAMBLING / GENERAL, which were filled by the catalog bus and a filename guess.
    // PLAYING (2026-10-02): the song cards dropped off at her circle, in the order she plays them — the jukebox's whole set while any are in.
    // JUKEBOX (2026-10-08 evening, Mark: "have a new music setting of jukebox songs, that way we can see what is in there. and the menu should restructure the
    //    order to be played"): the records dropped off at her circle, in the order the jukebox plays them — ▲ ▼ on a row re-orders, and the order is the
    //    engine's (NAGESEN_PLAYLIST_ORDER, the same message the tip-jar list sends). Was PLAYING.
    { key: 'PLAYING',   label: 'JUKEBOX',    jp: 'ジュークボックス', empty: 'No jukebox records yet. Drop a song card at her circle and it lands here, in the order the jukebox plays them.' },
    { key: 'R_base',    label: 'HER SONGS',  jp: '持ち歌', role: 'base',    empty: 'No songs of her own are set. Give her one on the SONGS tab.' },
    { key: 'R_find',    label: 'TO FIND',    jp: '探す歌', role: 'find',    empty: 'No song cards to find. Mark a song TO FIND on the SONGS tab.' },
    { key: 'R_legendary', label: 'LEGENDARY', jp: '伝説', role: 'legendary', empty: 'No legendary songs. Give a song the LEGENDARY role on the SONGS tab.' },
    { key: 'R_cabbg',   label: 'CABARET BG', jp: '店の音', role: 'cabbg',   empty: 'Nothing plays in the cabaret between her songs.' },
    { key: 'R_fight',   label: 'COMBAT BG',  jp: '戦',     role: 'fight',   empty: 'No combat background tracks assigned. Choose the FIGHT role on SONGS.' },
    { key: 'R_section', label: 'SECTION BG', jp: '探索',   role: 'section', empty: 'No section music set.' },
    { key: 'R_gamble',  label: 'GAMBLING',   jp: '賭',     role: 'gamble',  empty: 'No gambling songs set.' },
    { key: 'R_other',   label: 'OTHER',      jp: '他',     role: 'other',   empty: 'Nothing here.' },
    // ── MY MUSIC (2026-08-06, AI5; scope corrected 2026-08-07) ────────────────────────────────── [REF#UI-00072]
    //    Mark first: "allowing user to upload their own song ... this will feed into the starlettes
    //    song list." Then: "no, user can only upload a song and only place they see it is in the music
    //    settings. for now." So this tab is the WHOLE feature right now — a real player tab, not
    //    dev-gated. The engine-side rotation/caption wiring still exists (window._userSongsToSetlist,
    //    see Engine9's DISABLED-FEATURES REGISTER) but is parked, so the copy here must not promise
    //    anything beyond "saved for your own listening" — see the traps this file hit shipping the
    //    stage-integration copy the first time, now removed.
    { key: 'MY_MUSIC',  label: 'MY MUSIC',  jp: '自作',
      empty: 'No songs of your own yet. Drop an audio file below to add it to your list — an .srt with it saves synced lyrics for later.' },
    // ── MARK'S TRIAGE TAB (2026-08-05) ────────────────────────────────────────────────────────── [REF#UI-00073]
    //    "lets make sure we list out what songs we have in the songs folder, some are okay and some
    //    aren't so just list them and I'll checkmark what is what if you have a selector for each".
    //    NOT a player tab — it lists every file on DISK, including the ones no code references, which
    //    is most of them. Hidden behind ?audio=1 or window._audioTriage so a kid never lands in it.
    { key: 'LIBRARY',   label: 'LIBRARY',   jp: '音源', dev: true,
      empty: 'No audio files found — run: node scripts/build-audio-manifest.js' },
    // ── THE SONGS PAGE (Mark 2026-08-08) ──────────────────────────────────────────────────────── [REF#UI-00074]
    //    "set up now a songs list page, that has checkbox for which rotation it belongs, caberet, bg
    //    or combat." Every track on disk, three independent checkboxes each. Sits LAST so the
    //    player-facing collection tabs stay first, but is NOT dev-gated — Mark asked for it as a page
    //    he can reach, and it is how the cabaret/background split actually gets decided.
    { key: 'SONGS',     label: 'SONGS',     jp: '曲目',
      empty: 'No audio files found — run: node scripts/build-audio-manifest.js' },
];

// The default player is for listening and seeing found songs. Raw role/rotation maintenance is [REF#UI-01509]
// still available in audio-triage mode, where its many controls do not crowd out the actual player.
const COMPACT_TABS = new Set(['PLAYING', 'R_base', 'R_find', 'R_legendary', 'MY_MUSIC']);

/** What Mark can mark each raw file as. '' = he has not judged it yet. [REF#UI-00075] */
const VERDICTS = [
    { v: '',          label: '— not yet —' },
    { v: 'STARLETTE', label: '★ Starlette sings it' },
    { v: 'CABARET',   label: 'Cabaret room' },
    { v: 'COMBAT',    label: 'Combat' },
    { v: 'GAMBLING',  label: 'Gambling' },
    { v: 'GENERAL',   label: 'General / exploring' },
    { v: 'REJECT',    label: '✕ not good enough' },
];
const LS_VERDICT = 'origami.v8.audioVerdicts';

// ── ROTATIONS — THE SONGS PAGE (Mark 2026-08-08) ──────────────────────────────────────────────── [REF#UI-00076]
// "set up now a songs list page, that has checkbox for which rotation it belongs, caberet, bg or
//  combat."
//
// ⚠ THIS IS MULTI-SELECT, AND THAT IS THE WHOLE POINT — it is NOT another VERDICTS dropdown. A
//   dropdown forces one home per track, which is exactly the model that produced the bug this page
//   exists to fix: SongCatalog marks CRIMSON FAN `bus:'background'` yet buildSetList() still hands it
//   to Starlette, because a song had one `bus` field and two consumers disagreed about it. A track can
//   legitimately be BOTH a cabaret number and dungeon background, and SilentBlade is already in both
//   TRACKS.COMBAT and TRACKS.BOSS on Mark's own 07-26 instruction. So: three independent booleans.
//
// Kept in its OWN localStorage key rather than widening LS_VERDICT. The verdict store holds Mark's
// existing triage calls (including REJECT, which this page must keep honouring), and rewriting those
// rows into a new shape would silently discard grading he has already done.
const LS_ROTATION = 'origami.v8.songRotations';
const ROTATIONS = [
    { k: 'cabaret', label: 'CABARET', jp: 'キャバレー', title: 'Starlette performs it on stage — room-local, permit gated.' },
    { k: 'bg',      label: 'BG',      jp: '探索',       title: "The dungeon's own music while you explore — global, no performer." },
    { k: 'combat',  label: 'COMBAT',  jp: '戦',         title: 'Plays when a hostile is closing on you.' },
    // NOT A ROTATION — A LOCK (2026-09-29). Ticked, the track stays silent everywhere the engine starts music by itself [REF#UI-01440]
    // (fights, gambling, the cabaret bed, the boss rift, the death scene) until its card has been inserted at the cabaret's
    // card circle. It rides this list only so it gets the same checkbox and the same SAVE button; SongCatalog.inRotation is
    // never asked about 'card'. Seeded ON for every catalog song that has a card (questGift). Read by the engine's
    // window._songLocked, which the Composer consults for every pool.
    { k: 'card',    label: 'NEEDS CARD', jp: '札',       title: 'Silent until its card has been inserted at the cabaret card circle.' },
];

const LS_SKIP = 'origami.v8.songSkipped';   // reversible per-song "skip tonight", see the header [REF#UI-00077]
const LS_SKIP_PLAYED = 'origami.v8.skipPlayedRecords';   // Music setting: already-played jukebox records stay out unless replay is enabled. [REF#UI-01469]

// ── WINAMP FACE (2026-08-06, AI5) ─────────────────────────────────────────────────────────────── [REF#UI-00078]
// Mark: "update the player to look like winamp with the equalizer and graphs and volume booster."
// See knowledge/design/MUSIC_PLAYER_WINAMP_AND_USER_SONGS_PLAN.md. Layout/controls only in THIS
// file; the actual audio graph (EQ filters, preamp gain, limiter, analyser) lives in Engine9 — this
// page never constructs an Audio element or an AudioContext of its own, same rule as always.
// MUST stay in sync with Engine9's MP_EQ_FREQS (`_mpEnsureGraph`) — it is the band ORDER, and the
// `band` index sent in MUSIC_PAGE_EQ has to mean the same filter on both sides of the postMessage.
const MP_EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const _fmtHz = f => f >= 1000 ? (f / 1000) + 'k' : String(f);
const _fmtTime = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const _read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
const _write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** [REF#UI-00079]
 * Which tab a song belongs to. Derived from the catalog's OWN fields rather than a second list here —
 * a hand-kept mapping is the thing that goes stale the first time a song is added.
 */
/** [REF#UI-00080]
 * ── EVERY FILE IN THE FOLDER IS IN THE GAME (Mark 2026-08-05) ───────────────────────────────────
 * "you stop fighting me? those songs are in the fucking folder okay?"
 *
 * He is right, and the first cut had this backwards. It listed only the SEVEN tracks the catalog
 * wires, showed empty COMBAT/GAMBLING tabs, and asked him to grade 36 files before any of them would
 * appear. That is a chore standing in front of his own music. The disk is the source of truth for
 * WHAT EXISTS; the catalog is only richer metadata for the few tracks that have captions and vocal
 * windows measured. So the page now lists the union: catalogued songs, plus every other music file on
 * disk, all playable right now.
 *
 * Guessed placement, in priority order — HIS CALL ALWAYS WINS:
 *   1. a verdict he set in the LIBRARY selector   ← always beats everything below
 *   2. the catalog's own bus/setList wiring       ← real metadata, not a guess
 *   3. these filename/folder heuristics           ← a starting point, nothing more
 * If a track lands in the wrong tab it is one dropdown to move it, and that choice then sticks.
 */
const GUESS = [
    [/duel|blade|papercut|kabuki|withered/i,            'COMBAT'],
    [/dice|marked-cards|twin-dice|poker|casino/i,       'GAMBLING'],
    [/starlette|黄泉|地獄|紅い扇子|歌に息|toocute|paris|秘密/i, 'STARLETTE'],
    [/^bg-|spooky|pilgrim|phantasm|sorahibana|taps|theme/i, 'GENERAL'],
];
function guessTab(name, dir) {
    const hay = (dir + '/' + name);
    for (const [re, tab] of GUESS) if (re.test(hay)) return tab;
    return 'GENERAL';
}

function tabOf(song) {
    if (!song) return 'GENERAL';
    // ⚠ ROUTE ON `bus`, AND REMEMBER WHICH WAY ROUND IT GOES. My first cut put `bus:'background'` [REF#UI-00081]
    //   tracks under CABARET and left Starlette's legendary quest songs in GENERAL — exactly backwards,
    //   and the probe's "1 song on the opening tab" is what exposed it. The catalog spells the rule out:
    //     bus 'cabaret'    = Starlette PERFORMS it, room-local, permit/quest gated.
    //     bus 'background' = the DUNGEON's own music while you explore, "sections 1-4 and never
    //                        section 0" — i.e. NOT cabaret music at all.
    //   The quest songs (黄泉の宿, 地獄越え, 召喚) carry no `bus` because they are hers by default —
    //   `setList`/`questGift` is what marks them, so those decide, not the absence of a field.
    if (song.bus === 'cabaret' || song.role === 'activation'
        || song.setList === true || (song.bus == null && song.questGift === true)) return 'STARLETTE';
    if (song.bus === 'background') return 'GENERAL';
    return 'GENERAL';
    // CABARET, COMBAT and GAMBLING have no rule yet ON PURPOSE. Nothing in the catalog carries a [REF#UI-00082]
    // room-ambience, combat or gambling marker, and inventing a bucket rule for content that does not
    // exist is how you get a tab that lies about what the player owns. Per Mark, combat music is LOOT
    // ("the combat BG songs have to be found"), so those tabs SHOULD read empty until tracks exist.
    // When they do, give each its own branch here rather than widening one of the rules above.
}

export function createMusicPage(opts = {}) {
    const send = opts.send || (() => {});
    let root = null, catalog = null, store = null, manifest = null, active = 'R_base', nowPlaying = null;
    // ── Winamp transport/EQ state — all of it mirrors what the engine just told us, never a guess ── [REF#UI-00083]
    let paused = true, curTime = 0, duration = 0, kbps = null, khz = null;
    let seeking = false;   // true while the user is dragging the seek bar, so incoming TIME pushes don't fight the drag [REF#UI-00084]
    let visMode = 'spectrum';   // 'spectrum' | 'scope' | 'off' — click the display to cycle, exactly like 1997 [REF#UI-00085]
    let volPref = 0.55, balPref = 0, preampPref = 1, eqPrefBands = new Array(10).fill(0);
    let visCanvas = null, visCtx = null, visPeaks = new Array(20).fill(0);   // falling peak caps on the spectrum [REF#UI-00086]
    let freqData = [], waveData = [];   // latest MUSIC_PAGE_VIS payload, drawn by drawVis() [REF#UI-00087]
    // MY MUSIC (2026-08-06, AI5) — userSongs is the OPFS index; blobUrls caches one mint per slug for [REF#UI-00088]
    // THIS page session (the engine mints its own, separately — see UserSongs.js header on why that's
    // deliberate, not a missed dedupe).
    let userSongsMod = null, userSongs = [], userQuotaText = '', uploadStatus = '';
    const userBlobUrls = new Map();   // slug → blob: URL, minted once per page session on first play [REF#UI-00089]
    // The triage tab is dev-facing. A player opening the music page should see their collection, not a [REF#UI-00090]
    // spreadsheet of every wav on the disk.
    const devMode = () => { try { return window._audioTriage === true || /[?&]audio=1/.test(location.search); } catch (_) { return false; } };
    const verdicts = () => _read(LS_VERDICT, {});
    function setVerdict(file, v) {
        const all = verdicts();
        if (v) all[file] = v; else delete all[file];
        _write(LS_VERDICT, all);
    }

    // ── ROTATION ASSIGNMENTS (Mark 2026-08-08) ────────────────────────────────────────────────── [REF#UI-00091]
    // A SAVE BUTTON, NOT A LIVE WRITE (2026-09-29): a rotation tick is STAGED in _rotPending and shows at once on the page,
    // but nothing reaches the game (localStorage LS_ROTATION, read by SongCatalog.inRotation) until SAVE is pressed. DISCARD
    // drops the staged ticks. Old live-write behaviour: window._musicRotLiveSave = true.
    let _rotPending = null;
    const _rotSaved = () => _read(LS_ROTATION, {});
    const rotations = () => {
        const all = _rotSaved();
        if (_rotPending) for (const f of Object.keys(_rotPending)) all[f] = Object.assign({}, all[f] || {}, _rotPending[f]);
        return all;
    };
    /** One checkbox toggle. Absent key = never touched, which is why seeding is a separate read. [REF#UI-00092] */
    function setRotation(file, key, on) {
        const all = _rotSaved(); const row = all[file] || (all[file] = {}); row[key] = !!on;
        _write(LS_ROTATION, all);
    }
    function saveRotations() { if (!_rotPending) return; _write(LS_ROTATION, rotations()); _rotPending = null; }
    function discardRotations() { _rotPending = null; }
    // ── ONE ROLE PER TRACK (2026-09-29) — staged like the ticks, written on SAVE to LS_ROLES, which the engine re-reads on save. [REF#UI-01441]
    let _rolePending = null;
    function roleOfTrack(s) { if (!s) return 'other'; if (_rolePending && _rolePending[s.file]) return _rolePending[s.file]; try { return _roleOf(s.file, s._fromDisk ? null : s); } catch (_) { return 'other'; } }
    function setRole(file, role) { const all = _read(LS_ROLES, {}); all[file] = role; _write(LS_ROLES, all); }
    function saveRoles() { if (!_rolePending) return; const all = _read(LS_ROLES, {}); for (const f of Object.keys(_rolePending)) all[f] = _rolePending[f]; _write(LS_ROLES, all); _rolePending = null; }
    function roleSelectHtml(s) {
        const r = roleOfTrack(s);
        return `<select class="mp-verdict mp-role" data-role="${esc(r)}" data-file="${esc(s.file)}" title="What this track is in the game — change it, then SAVE">${ROLES.map(o => `<option value="${o.k}"${o.k === r ? ' selected' : ''}>${esc(o.icon + ' ' + o.label)}</option>`).join('')}</select>`;
    }
    // ONE COLOUR PER ROLE (2026-09-30): the role's tab, its tiles, its selector and its heading wear the role's colour (MusicRoles.ROLES [REF#UI-01442]
    // color / ink). LEGENDARY is the gold of its card and TO FIND the silver of its card, so the page and the dungeon read alike.
    function ensureRoleStyle() {
        if (document.getElementById('mp-role-style')) return;
        const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
        const css = ROLES.map(r => {
            const q = `[data-role="${r.k}"]`;
            return `.mp-tab${q}{border-color:${rgba(r.color, 0.6)};color:${r.ink}}`
                 + `.mp-tab${q}.on{background:${rgba(r.color, 0.16)};border:2px solid ${r.color};color:${r.ink}}`   // 0.16: every ink stays at 7:1 or better on it
                 + `.mp-tab${q} .mp-count{background:${r.ink};color:#0b0f17}`
                 + `.mp-body .mp-row${q}{border-color:${rgba(r.color, 0.55)};border-left:4px solid ${r.color}}`
                 + `.mp-row${q} .mp-title{color:${r.ink}}`
                 + `.mp-cardline${q}{color:${r.ink}}`
                 + `select.mp-role${q}{border-color:${r.color};color:${r.ink}}`
                 + `.mp-rolehead${q}{border-left-color:${r.color};background:${rgba(r.color, 0.1)};color:${r.ink}}`;
        }).join('\n')
            + `\n.mp-body .mp-row[data-role="legendary"]{background:linear-gradient(145deg,${rgba('#d4a017', 0.22)},rgba(26,32,44,0.9));box-shadow:0 0 0 1px ${rgba('#ffd700', 0.35)},0 0 14px ${rgba('#ffd700', 0.2)}}`
            + `\n.mp-row.mp-playing[data-role]:not([data-role="legendary"]) .mp-title{color:var(--mp-blue-l)}`
            + `\n.mp-cardline{font-size:9px;font-weight:700;letter-spacing:.03em;line-height:1.25;margin-top:2px}`
            // A tile with a role selector has four controls beside its title (play, download, the selector, the set tick), which left the [REF#UI-01443]
            // title a few pixels wide; the title keeps the first line and the controls wrap onto a second line under it.
            + `\n.mp-body .mp-row[data-role]{flex-wrap:wrap;row-gap:4px}`
            + `\n.mp-body .mp-row[data-role] > .mp-meta{flex:1 1 calc(100% - 48px);min-width:0}`
            + `\n.mp-body .mp-row[data-role] > .mp-meta + *{margin-left:42px}`;
        const st = document.createElement('style'); st.id = 'mp-role-style'; st.textContent = css; document.head.appendChild(st);
    }
    // A role's heading: its name, count, what it is, and what it looks like in the dungeon. Spans the whole tile grid. [REF#UI-01444]
    function roleHeadHtml(k, n, top) {
        const r = ROLES.find(x => x.k === k); if (!r) return '';
        const card = r.card === 'gold' ? 'In the dungeon: a solid-gold card.' : r.card === 'silver' ? 'In the dungeon: a solid-silver card.' : 'Not a card: the game plays it by itself.';
        return `<div class="mp-rolehead" data-role="${r.k}" style="grid-column:1/-1;margin:${top | 0}px 2px 6px;padding:7px 10px;border-left:3px solid;border-radius:6px;font:700 12px/1.35 system-ui,sans-serif;letter-spacing:.06em">${esc(r.icon + ' ' + r.label)} <span class="mp-tab-jp">${esc(r.jp)}</span> · ${n}<div style="font-weight:500;letter-spacing:0;opacity:.85;margin-top:2px">${esc(r.desc)} ${esc(card)}</div></div>`;
    }
    // What the song is in the dungeon, on the tile itself (.mp-sub and .mp-tags are hidden in the tile layout): its card's metal, for a [REF#UI-01445]
    // legendary the floor whose room guard carries it, and whether its card has been handed in.
    function cardLineHtml(s) {
        if (!s || s._fromDisk) return '';
        const r = roleOfTrack(s); if (r !== 'find' && r !== 'legendary') return '';
        const D = engineDelivered(), got = !!(D && D.has(s.id));
        const what = r === 'legendary'
            ? ('gold card · ' + (s.questGift === true ? 'carried by a floor ' + ((typeof s.level === 'number') ? s.level : 1) + ' room guard' : 'no floor deals it'))
            : 'silver card';
        return `<div class="mp-cardline" data-role="${r}">${esc(what)} · ${got ? '✓ found' : 'not found yet'}</div>`;
    }
    // PLAYING tab heading: which dropped-off card she is on now, read off her song element in the engine frame (same-origin). [REF#UI-01446]
    function playingHeadHtml(list) {
        let now = null;
        try { const seen = [window, window.parent, window.top]; try { const t = window.top; for (let i = 0; i < t.frames.length; i++) seen.push(t.frames[i]); } catch (_) {}
            for (const w of seen) { let a = null; try { a = w._succubusSong; } catch (_) { continue; } if (a && a.src) { const b = decodeURIComponent(String(a.currentSrc || a.src)).split('?')[0].split('/').pop(); now = list.find(s => s && s.file && decodeURIComponent(s.file).split('/').pop() === b) || null; break; } } } catch (_) {}
        let P = null; try { const seen = [window, window.parent, window.top]; try { const t = window.top; for (let i = 0; i < t.frames.length; i++) seen.push(t.frames[i]); } catch (_) {}
            for (const w of seen) { let p = null; try { p = w._jukeboxPlayed; } catch (_) { continue; } if (p && typeof p.has === 'function') { P = p; break; } } } catch (_) {}
        const played = list.filter(s => P && P.has(s.id)), left = list.filter(s => !(P && P.has(s.id)));
        return `<div class="mp-rolehead" style="grid-column:1/-1;margin:2px 2px 6px;padding:7px 10px;border-left:3px solid #22c55e;border-radius:6px">▶ ${now ? 'NOW PLAYING · ' + esc(now.title) : (left[0] ? 'NEXT UP · ' + esc(left[0].title) : 'ALL PLAYED')} — ${left.length} to play${played.length ? ' · ✓ played: ' + played.map(s => esc(s.title)).join(', ') : ''}</div>`;
    }
    // Is this song's card in? Read off the engine frame (same-origin), the same way cabaretRotation() reads her set. [REF#UI-01447]
    function engineDelivered() {
        try { const seen = [window, window.parent, window.top]; try { const t = window.top; for (let i = 0; i < t.frames.length; i++) seen.push(t.frames[i]); } catch (_) {}
            for (const w of seen) { let d = null; try { d = w._songsDelivered; } catch (_) { continue; } if (d instanceof Set || (d && typeof d.has === 'function')) return d; } } catch (_) {}
        return null;
    }
    /** [REF#UI-00093]
     * What the three boxes should show for a track RIGHT NOW.
     *
     * ⚠ SEEDED, NOT BLANK — and Mark's saved tick always wins over the seed. A blank grid would ask
     *   him to re-enter what SongCatalog already knows (CRIMSON FAN is `bus:'background'`, BREATH INTO
     *   SONG is `role:'activation'`), and re-typing known data is how the two drift apart again.
     *
     * ⚠ THE SEED IS PER-BOX, NOT PER-ROW. My first cut fell back to the seed only when the whole row
     *   was missing, so the first tick froze the other two boxes at whatever they happened to show.
     *   Each box falls back independently, so unticking BG on a catalog background track persists as a
     *   real `false` while CABARET keeps reading from the catalog until Mark touches it.
     */
    function rotationOf(s) {
        const saved = rotations()[s.file] || {};
        const seed = seedRotation(s);
        const out = {};
        for (const r of ROTATIONS) out[r.k] = (typeof saved[r.k] === 'boolean') ? saved[r.k] : seed[r.k];
        return out;
    }
    /** Priority: catalog wiring (real metadata) > filename/folder guess. Never invents a cabaret tick. [REF#UI-00094] */
    function seedRotation(s) {
        const out = { cabaret: false, bg: false, combat: false };
        if (!s._fromDisk) {
            // A catalogued song: `bus` is the authored answer where it exists. [REF#UI-00095]
            if (s.bus === 'background') out.bg = true;
            else if (s.bus === 'cabaret' || s.role === 'activation' || s.setList === true
                     || (s.bus == null && s.questGift === true)) out.cabaret = true;
        }
        // Fall through to the same heuristics the tabs already use, so a disk-only file is not blank. [REF#UI-00096]
        if (!out.cabaret && !out.bg && !out.combat) {
            const g = guessTab(s.title || '', s.desc || '');
            if (g === 'COMBAT') out.combat = true;
            else if (g === 'STARLETTE') out.cabaret = true;
            else out.bg = true;   // GENERAL / GAMBLING both read as background music while exploring [REF#UI-00097]
        }
        out.card = !s._fromDisk && !['paris-skies', 'cabaret-startup-1', 'cabaret-startup-2'].includes(s.id);   // every catalog song is a card except her starting three (songs v2, 2026-09-29 — the engine's _SONG_STARTER_IDS) [REF#UI-01448]
        return out;
    }

    async function ensureData() {
        if (catalog && store) return;
        catalog = await import('../data/SongCatalog.js?v=8.4.2741-comment-refs');
        try { manifest = await import('../data/AudioManifest.js?v=8.4.278-audio-ref'); } catch (_) { manifest = null; }
        try { store = await import('../audio/GenreStore.js?v=8.4.1215-toocute'); } catch (_) { store = null; }
        // Seed the EQ/preamp/balance sliders from whatever was last saved (GenreStore, same pattern as [REF#UI-00098]
        // the hardness/karma sliders below) so reopening the page doesn't flatten a tuned sound back to
        // neutral. The engine reads the SAME store when it lazily builds the graph, so these agree.
        if (store) {
            try { if (typeof store.eqBands === 'function') eqPrefBands = store.eqBands(); } catch (_) {}
            try { if (typeof store.preampPref === 'function') preampPref = store.preampPref(); } catch (_) {}
            try { if (typeof store.balancePref === 'function') balPref = store.balancePref(); } catch (_) {}
        }
        try { userSongsMod = await import('../audio/UserSongs.js?v=8.3.565-suno-autosrt-refs'); } catch (_) { userSongsMod = null; }
    }

    /** Re-reads the OPFS index + quota. Async by nature (OPFS has no sync read), so callers re-render [REF#UI-00099]
     *  once this resolves rather than trying to make the MY MUSIC tab paint synchronously. */
    async function refreshUserSongs() {
        if (!userSongsMod) return;
        try { userSongs = await userSongsMod.listSongs(); } catch (_) { userSongs = []; }
        try {
            const q = await userSongsMod.quotaInfo();
            userQuotaText = q && q.quota ? (q.usage / 1048576).toFixed(1) + 'MB of ' + (q.quota / 1048576).toFixed(0) + 'MB used' : '';
        } catch (_) { userQuotaText = ''; }
        if (active === 'MY_MUSIC') render();
    }

    /** Pairs dropped/selected files into (audio, srt|null) and stores each through UserSongs.js. [REF#UI-00100]
     *  Pairing rule, in order (see the plan's B1): same basename beats "the other leftover file in this
     *  same drop" — an unambiguous match should never lose to a guess. */
    async function handleUploadFiles(fileList) {
        if (!userSongsMod || !userSongsMod.isSupported()) { uploadStatus = 'This browser can\'t save files here.'; render(); return; }
        const files = Array.from(fileList || []);
        const srtFiles = files.filter(f => /\.srt$/i.test(f.name));
        const audioFiles = files.filter(f => !/\.srt$/i.test(f.name));
        const baseOf = n => String(n).replace(/\.[^.]+$/, '').toLowerCase();
        const usedSrt = new Set();
        for (const audio of audioFiles) {
            let srt = srtFiles.find((s, i) => !usedSrt.has(i) && baseOf(s.name) === baseOf(audio.name));
            let srtIdx = srt ? srtFiles.indexOf(srt) : -1;
            if (!srt && audioFiles.length === 1 && srtFiles.length === 1 && !usedSrt.has(0)) { srt = srtFiles[0]; srtIdx = 0; }
            if (srtIdx >= 0) usedSrt.add(srtIdx);
            try {
                const entry = await userSongsMod.addSong(audio, srt || null);
                uploadStatus = '"' + entry.title + '" added' + (entry.srtFile ? ' with ' + entry.cues + ' lyric cue(s) saved' : ' (no lyrics)') + '.';
                // Harmless to send even while window._userSongsToSetlist is off (Engine9 no-ops on it) — [REF#UI-00101]
                // this is what makes a fresh upload take effect with no reload the day that gate flips on.
                send({ type: 'MUSIC_PAGE_USER_SONG_ADDED', slug: entry.slug });
            } catch (e) { uploadStatus = 'Could not add "' + audio.name + '": ' + (e && e.message ? e.message : e); }
        }
        await refreshUserSongs();
    }

    function userRowHtml(entry) {
        const key = 'user-' + entry.slug;
        const playing = nowPlaying === key;
        const mins = _fmtTime(entry.seconds || 0);
        const lyricNote = entry.srtFile ? entry.cues + ' lyric cue(s) saved' : 'no lyrics';
        // A LINKED song that failed its CORS probe plays with no EQ/booster/visualiser (see startTrack's [REF#UI-00102]
        // `noEq` note). Saying so up front is the difference between "this feature is broken" and "this
        // one track can't use it" — the sliders visibly doing nothing is otherwise unexplainable.
        const _noEq = entry.remote === true && entry.corsOk === false;
        return `
      <div class="mp-row${playing ? ' mp-playing' : ''}">
        <button class="mp-play" data-act="playuser" data-slug="${esc(entry.slug)}" title="Play">${playing ? '❚❚' : '▶'}</button>
        <div class="mp-meta">
          <div class="mp-title">${esc(entry.title)}${entry.remote ? ' <span class="mp-tag">LINK</span>' : ''}</div>
          <div class="mp-sub">${mins} · ${lyricNote}${_noEq ? ' · <span class="mp-unwired">plays without the equalizer</span>' : ''}${entry.warning ? ' · ⚠ ' + esc(entry.warning) : ''}</div>
        </div>
      </div>`;
    }

    const skipped = () => _read(LS_SKIP, {});
    const isSkipped = id => !!skipped()[id];
    function toggleSkip(id) {
        const s = skipped();
        if (s[id]) delete s[id]; else s[id] = 1;
        _write(LS_SKIP, s);
        // Tell the engine so her rotation honours it immediately rather than at the next floor. [REF#UI-00103]
        send({ type: 'SONG_SKIP_SET', id, skipped: !!s[id] });
    }
    function skipPlayedRecords() { return true; }
    function enginePlayed() {
        try { const seen = [window, window.parent, window.top]; try { const t = window.top; for (let i = 0; i < t.frames.length; i++) seen.push(t.frames[i]); } catch (_) {}
            for (const w of seen) { let p = null; try { p = w._jukeboxPlayed; } catch (_) { continue; } if (p && typeof p.has === 'function') return p; } } catch (_) {}
        return null;
    }
    function engineDeliveredIds() {
        try { const d = engineDelivered(); return (d && typeof d.has === 'function') ? d : null; } catch (_) { return null; }
    }
    function alreadyPlayedRecord(s) {
        if (!s || !s.id || s._fromDisk || !skipPlayedRecords()) return false;
        const P = enginePlayed(), D = engineDeliveredIds();
        return !!(P && P.has(s.id) && (!D || D.has(s.id)));
    }
    /** JUKEBOX ORDER (2026-10-08 evening): move one record a step and hand the whole order to the engine as the tip-jar list does — [REF#UI-01510]
     *  NAGESEN_PLAYLIST_ORDER {queue, played}; _jukeboxApplyOrder rewrites window._songsDelivered (playing first, then the queue, then played),
     *  which is the list this tab reads, so a re-render a beat later shows the new order. */
    function jukeboxMove(id, dir) {
        try {
            const D = engineDeliveredIds(); if (!D || !id) return;
            const ids = [...D], i = ids.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= ids.length) return;
            ids.splice(i, 1); ids.splice(j, 0, id);
            const P = enginePlayed();
            send({ type: 'NAGESEN_PLAYLIST_ORDER', queue: ids.filter(k => !(P && P.has(k))), played: ids.filter(k => !!(P && P.has(k))) });
            setTimeout(render, 80);
        } catch (_) {}
    }
    /** THE HEART (2026-10-08 evening, Mark: "make sure the heart is shown to be granted when sections are activated"): hallway 0's music opens once [REF#UI-01511]
     *  the cabaret is live OR any room is activated (Composer heartOpen); this reads the engine's count the same-origin way engineDelivered does. */
    function engineRoomsActivated() {
        try { const seen = [window, window.parent, window.top]; try { const t = window.top; for (let i = 0; i < t.frames.length; i++) seen.push(t.frames[i]); } catch (_) {}
            for (const w of seen) { let f = null; try { f = w._activatedRooms; } catch (_) { continue; } if (typeof f === 'function') { const a = f(); return Array.isArray(a) ? a : []; } } } catch (_) {}
        return null;
    }
    function setSkipPlayedRecords(on) {
        const next = true;
        _write(LS_SKIP_PLAYED, next);
        send({ type: 'JUKEBOX_SKIP_PLAYED_SET', skipPlayed: next });
    }
    function renderPlayedSetting() {
        if (!root) return;
        const on = skipPlayedRecords();
        const b = root.querySelector('[data-act="playedtoggle"]');
        if (!b) return;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.textContent = '☑ ALREADY PLAYED: SKIP';
        b.title = 'Already-played jukebox records will not start again';
    }

    /** [REF#UI-00104]
     * The union of what the catalog knows and what is actually on disk. A manifest file that the
     * catalog already wires is skipped — the catalog entry is the richer record of the same track.
     */
    function allTracks() {
        const out = [];
        const wired = new Set();
        // A song's continuation parts are the song too, and a Japanese file name can reach here in either Unicode form (the disk [REF#UI-01449]
        // manifest is decomposed on macOS) — both used to list a catalog song's parts a second time under OTHER (2026-09-29).
        const _nf = (f) => { try { return String(f || '').normalize('NFC'); } catch (_) { return String(f || ''); } };
        const _wiredHas = (f) => wired.has(_nf(f));
        if (catalog) for (const s of catalog.SONGS) { out.push(s); for (const f of [s.file, s.continuation, s.continuation2]) if (f) wired.add(_nf(f)); }
        // Tracks the game plays that the audio manifest does not list (the cabaret beds, the Manager's song…) — every role gets its members. [REF#UI-01450]
        for (const x of EXTRA_TRACKS) if (!_wiredHas(x.file)) { wired.add(_nf(x.file)); out.push({ id: x.file, title: x.title, kanji: x.kanji || '', desc: x.file.replace('./assets/', ''), file: x.file, genre: [], _fromDisk: true, _parts: [{ file: x.file }], _lang: null }); }
        // ── PARTS ARE ONE SONG (Mark 2026-08-05) ──────────────────────────────────────────────── [REF#UI-00105]
        //    "the songs with a -1 -2 -3 are chorus to those same songs so always group those together."
        //    So the list shows a GROUP once, not four rows of 地獄越え. Play starts at part 1 and the
        //    row says how many parts there are. Corrects my earlier reading of them as alternate takes.
        if (manifest) for (const g of (manifest.SONG_GROUPS || [])) {
            const parts = g.parts.filter(p => !_wiredHas(p.file));
            if (!parts.length) continue;                     // the catalog already owns this song [REF#UI-00106]
            const lead = parts[0];
            const secs = g.seconds || lead.seconds || 0;
            out.push({
                id: lead.file,
                title: g.family.replace(/[-_]+/g, ' ').trim().toUpperCase(),
                kanji: '',
                desc: lead.dir + ' · ' + Math.floor(secs / 60) + ':' + String(Math.round(secs % 60)).padStart(2, '0')
                      + (parts.length > 1 ? ' · ' + parts.length + ' parts' : '')
                      + (g.lang === 'ja' ? ' · 日本語' : ''),
                file: lead.file, genre: [], _fromDisk: true, _parts: parts, _lang: g.lang || null,
            });
        }
        return out;
    }

    function songsFor(tab) {
        const T = TABS.find(t => t.key === tab);
        if (T?.role === 'fight') {
            // Match _applyMusicRoles: catalog first, then known files; one copy per filename. [REF#UI-01512]
            const all = allTracks(), seen = new Set(), list = [];
            for (const file of [...(catalog?.SONGS || []).map(s => s.file), ...KNOWN_FILES]) {
                if (!file) continue;
                const key = decodeURIComponent(file).normalize('NFC').split('/').pop().toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                const song = all.find(s => s.file === file) || {id:file,file,title:key.replace(/\.mp3$/i,'').replace(/[-_]/g,' '),_fromDisk:true};
                if (roleOfTrack(song) === 'fight') list.push(song);
            }
            return list;
        }
        if (T && T.key === 'PLAYING') { const d = engineDelivered(), all = allTracks(); return d ? [...d].map(id => all.find(s => s && s.id === id)).filter(Boolean) : []; }
        if (T && T.role) return allTracks().filter(s => roleOfTrack(s) === T.role);   // the tabs are the roles (2026-09-29) [REF#UI-01451]
        const v = verdicts();
        return allTracks().filter(s => {
            const set = v[s.file];
            if (set) return set === tab;                     // 1. Mark's own call always wins [REF#UI-00107]
            if (set === 'REJECT') return false;
            if (!s._fromDisk) return tabOf(s) === tab;       // 2. the catalog's real wiring [REF#UI-00108]
            return guessTab(s.title, s.desc) === tab;        // 3. a guess, one dropdown from being fixed [REF#UI-00109]
        }).filter(s => v[s.file] !== 'REJECT');
    }

    /** The identity `nowPlaying` is compared against — `file` for a disk/library row, `id` for a [REF#UI-00110]
     *  catalog entry, exactly what the row buttons already send. One function so prev/next/playpause
     *  agree with the row click handler about what "this song" means. */
    function keyOf(s) { return s._userKey || (s._fromDisk ? s.file : s.id); }
    function titleOf(s) { return s ? (s.title || (s.name || '').replace(/[-_]+/g, ' ')) : ''; }

    /** The track list the transport bar's prev/next steps through — whatever the open tab shows, [REF#UI-00111]
     *  in the same order the player sees it. LIBRARY is the raw disk list, not a catalog list. */
    // ── THE ROTATION IS STARLETTE'S, NOT THE TAB'S (Mark 2026-08-11: "make sure the winamp uses the [REF#UI-00112]
    //    existing rotation of the caberet") ──────────────────────────────────────────────────────
    // READ the cabaret setlist; do NOT recompute it. buildSetList() already decides what is in her
    // rotation — quest gate, questGift, bus:'cabaret', the silent-cabaret fallback — and this file
    // calling buildSetList() again with its own idea of `delivered`/`gateOn` would be a SECOND
    // definition of "her setlist". This codebase has already paid for exactly that twice: `bus` was
    // authored metadata nothing read for five days, and _succubusSong.volume had two writers until the
    // song followed the player out of the cabaret. One list, one owner, read across the frame.
    // The engine owns it (`window._cabSetList`, rebuilt on every delivery; `_cabSetDefault` before the
    // first). Same-origin, so this is a plain property read — no relay to add, and notably no new case
    // in the shell's switch, which is where the "silent drop" trap in NewOrigami.9.html has now bitten
    // eight separate times.
    function cabaretRotation() {
        try {
            const seen = [];
            const push = w => { if (w && seen.indexOf(w) < 0) seen.push(w); };
            push(window); push(window.parent); push(window.top);
            try { const t = window.top; for (let i = 0; i < t.frames.length; i++) push(t.frames[i]); } catch (_) {}
            for (const w of seen) {
                let l = null;
                try { l = w._cabSetList || w._cabSetDefault || null; } catch (_) { continue; }   // cross-origin frame [REF#UI-00113]
                if (Array.isArray(l) && l.length) return l;
            }
        } catch (_) {}
        return null;
    }

    function orderedList() {
        // LIBRARY is the raw file browser — it is not a setlist and must keep listing what is on disk. [REF#UI-00114]
        if (active === 'LIBRARY') return manifest ? manifest.MUSIC_FILES : [];
        const rot = (window._mpUseCabRotation === false) ? null : cabaretRotation();
        if (rot && rot.length) {
            // Map her file paths back onto this page's track entries so titles/metadata survive; a file [REF#UI-00115]
            // with no entry still plays as a bare {file} rather than being dropped, because a song in
            // her rotation that this page cannot name is a listing bug, not a reason to refuse to play.
            const all = allTracks();
            const byBase = new Map();
            for (const t of all) { const f = String(t.file || ''); byBase.set(f.split('/').pop(), t); }
            const out = [];
            for (const f of rot) {
                const b = String(f).split('/').pop();
                out.push(byBase.get(b) || { file: f, title: decodeURIComponent(b.replace(/\.mp3$/i, '')) });
            }
            if (out.length) return out;
        }
        // Fallback: the tab's own list, i.e. exactly the pre-2026-08-11 behaviour. Reached when the [REF#UI-00116]
        // engine frame is not up yet (page opened before the cabaret built) — never leaves the
        // transport with nothing to step through.
        return songsFor(active);
    }
    function currentTrack() {
        // A user song's title has to resolve even while a different tab is open (the marquee/seek bar [REF#UI-00117]
        // keep working if the player switches tabs mid-playback) — orderedList() below only covers the
        // ACTIVE tab, which MY_MUSIC deliberately isn't part of (see its header note).
        if (typeof nowPlaying === 'string' && nowPlaying.startsWith('user-')) {
            const entry = userSongs.find(s => 'user-' + s.slug === nowPlaying);
            return entry ? { title: entry.title } : null;
        }
        const list = orderedList();
        return list.find(s => keyOf(s) === nowPlaying) || null;
    }
    /** Fires the same message a row's ▶ button would, so the engine, the row highlight, and the [REF#UI-00118]
     *  transport bar can never disagree about which path a track started on. */
    function startTrack(s, manualReplay = false) {
        if (!s) return;
        if (!manualReplay && alreadyPlayedRecord(s)) { renderPlayedSetting(); return; }
        const id = keyOf(s);
        nowPlaying = id; paused = false; curTime = 0; duration = 0; kbps = null; khz = null;
        // `noEq` — a CROSS-ORIGIN song WITHOUT CORS taints the media element, and a tainted element [REF#UI-00119]
        // fed through `createMediaElementSource` outputs SILENCE (spec, not a quirk). So the engine has
        // to play these on a plain element that never enters the Winamp graph: no EQ, no booster, no
        // visualiser — but audible, which is the only thing that actually matters here. UserSongs.js
        // probes CORS at add time and records `corsOk` precisely so this decision is possible.
        send({ type: 'MUSIC_PAGE_PLAY', id, file: s.file, title: titleOf(s), noEq: s._noEq === true, manualReplay });
        render();
    }
    function stepTrack(delta) {
        const raw = orderedList();
        const list = skipPlayedRecords() ? raw.filter(s => !alreadyPlayedRecord(s)) : raw;
        if (!list.length) return;
        const i = list.findIndex(s => keyOf(s) === nowPlaying);
        const next = list[((i < 0 ? 0 : i) + delta + list.length) % list.length];
        startTrack(next);
    }

    /** A player upload, resolved to a playable URL and started — the MY MUSIC row and PLAY ALL share it (2026-10-02). [REF#UI-01452] */
    function playUserEntry(entry) {
        if (!entry || !userSongsMod) return;
        const slug = entry.slug, key = 'user-' + slug;
        // Async resolve-then-play — this page's OWN url, independent of whatever the engine [REF#UI-00132]
        // resolves for the same song (see UserSongs.js header on why sharing one would be wrong).
        // ⚠ `resolveAudioUrl`, NOT `readAudioBlob` (AI1 measured this, 38db996). A song added by
        //   LINK has no OPFS file at all — `remote:true`, `audioFile` undefined — so reading its
        //   blob threw "a requested file or directory could not be found" and every URL song was
        //   unplayable. resolveAudioUrl() is the ONE place that decision belongs: it hands back
        //   `entry.url` for a remote song and mints a blob for a stored one.
        (async () => {
            try {
                let url = userBlobUrls.get(slug);
                if (!url) {
                    url = await userSongsMod.resolveAudioUrl(entry);
                    if (!url) throw new Error('no audio source for this song');
                    // Cache only what we MINTED. A remote entry's url is a plain https string that [REF#UI-00133]
                    // is valid every session — caching it is harmless but pointless, and keeping it
                    // out of this map means the map stays exactly "blob urls I created", which is
                    // what any future revoke-on-eviction has to be able to assume (AI1's second note).
                    if (!entry.remote) userBlobUrls.set(slug, url);
                }
                startTrack({ file: url, title: entry.title, _fromDisk: true, _userKey: key,
                             _noEq: entry.remote === true && entry.corsOk === false });
            } catch (e) { uploadStatus = 'Could not play "' + entry.title + '": ' + (e && e.message ? e.message : e); render(); }
        })();
    }

    // ── PLAY ALL (2026-10-02) ──────────────────────────────────────────────────────────────────────────────────────────── [REF#UI-01453]
    //    Every song the player OWNS, one after another: her own songs, every find / legendary song whose card is in, and the
    //    player's own uploads. It moves on when the playing song ends (the engine clears now-playing, or another sound takes the
    //    room), skips a song that never starts (window._playAllSkipMs, 12 s), and ends on STOP or when a song is picked by hand.
    //    Inside the cabaret every song goes to Starlette, who reports it by FILE name — so a song is matched by its key, its file
    //    or a continuation part's file, or a two-part song would be skipped after its first part. Probe: window._musicPlayAll.
    let pa = null;   // { list, i, seen, timer } [REF#UI-01454]
    function ownedList() {
        const D = engineDelivered();
        const out = allTracks().filter(s => {
            if (s._fromDisk) return false;
            const r = roleOfTrack(s);
            return r === 'base' || ((r === 'find' || r === 'legendary') && !!(D && D.has(s.id)));
        });
        for (const u of userSongs) out.push({ _user: u, title: u.title, _userKey: 'user-' + u.slug });
        return out;
    }
    const _paBase = (f) => { try { return decodeURIComponent(String(f || '').split('?')[0].split('/').pop()).replace(/\.(mp3|ogg|m4a|wav)$/i, '').normalize('NFC'); } catch (_) { return String(f || ''); } };
    function paKey(s) { return s ? (s._userKey || keyOf(s)) : null; }
    function paIsCur(id, file) {
        const cur = pa && pa.list[pa.i];
        if (!cur || !id) return false;
        if (id === paKey(cur)) return true;
        const parts = [cur.file, cur.continuation, cur.continuation2].filter(Boolean).map(_paBase);
        const b = _paBase(file), i2 = String(id).normalize('NFC');
        return parts.some(x => x && (x === b || x === i2));
    }
    function paStart() {
        if (!pa) return;
        const s = pa.list[pa.i], at = pa.i;
        pa.seen = false;
        try { clearTimeout(pa.timer); } catch (_) {}
        const ms = (typeof window._playAllSkipMs === 'number') ? window._playAllSkipMs : 12000;
        pa.timer = setTimeout(() => { if (pa && pa.i === at && !pa.seen) paStep(1); }, ms);   // never started — the next one [REF#UI-01455]
        if (s && s._user) playUserEntry(s._user); else startTrack(s);
        renderPlayAll();
    }
    async function playAll() {
        try { await refreshUserSongs(); } catch (_) {}
        const list = ownedList();
        if (!list.length) { pa = null; renderPlayAll('No songs found yet — find a song card first.'); return; }
        pa = { list, i: 0, seen: false, timer: null };
        paStart();
    }
    function stopPlayAll() {
        if (!pa) return;
        try { clearTimeout(pa.timer); } catch (_) {}
        pa = null; renderPlayAll();
    }
    function paStep(d) {
        if (!pa) return;
        const n = pa.i + d;
        if (n >= pa.list.length) { stopPlayAll(); renderPlayAll('Every song played.'); return; }
        pa.i = Math.max(0, n);
        paStart();
    }
    function paHear(id, isPaused, file) {
        if (!pa) return;
        if (paIsCur(id, file)) { pa.seen = true; return; }
        if (pa.seen && (!id || !isPaused)) paStep(1);   // the song ended, or another sound took the room — the next song [REF#UI-01456]
    }
    function renderPlayAll(note) {
        if (!root) return;
        const b = root.querySelector('.mp-playall'), st = root.querySelector('.mp-playall-state');
        const n = pa ? pa.list.length : ownedList().length;
        if (b) {
            b.classList.toggle('on', !!pa);
            b.setAttribute('aria-pressed', pa ? 'true' : 'false');
            b.textContent = pa ? '■ STOP PLAY ALL' : '▶ PLAY ALL · ' + n;
        }
        if (st) st.textContent = pa ? ((pa.i + 1) + ' of ' + pa.list.length + ' · ' + titleOf(pa.list[pa.i]))
                                    : (note || (n ? n + ' song' + (n === 1 ? '' : 's') + ' you own' : 'No songs found yet'));
    }
    try {
        window._musicPlayAll = {
            state: () => pa ? { i: pa.i, n: pa.list.length, cur: paKey(pa.list[pa.i]), seen: pa.seen } : null,
            owned: () => ownedList().map(paKey),
        };
    } catch (_) {}

    /** Takes of the same song — Mark's "they can quickly select next variant". [REF#UI-00120] */
    function variantsOf(song) {
        if (!catalog || !song) return [];
        const fam = song.family || song.id;
        return catalog.SONGS.filter(s => (s.family || s.id) === fam);
    }

    function rowHtml(s) {
        const vars = variantsOf(s);
        const skip = isSkipped(s.id);
        const hard = (typeof s.hardness === 'number') ? s.hardness : 0.5;
        if (s._fromDisk) {
            const playing0 = nowPlaying === s.file;
            return `
      <div class="mp-row${playing0 ? ' mp-playing' : ''}" data-role="${esc(roleOfTrack(s))}">
        <button class="mp-play" data-act="playfile" data-file="${esc(s.file)}" title="Play">${playing0 ? '❚❚' : '▶'}</button>
        <div class="mp-meta">
          <div class="mp-title">${esc(s.title)}</div>
          <div class="mp-sub">${esc(s.desc)}${s._lang === 'ja' ? ' <span class="mp-ja">JA</span>' : ''}</div>
        </div>
        ${roleSelectHtml(s)}
      </div>`;
        }
        const playing = nowPlaying === s.id;
        const played = alreadyPlayedRecord(s);
        const _jb = (active === 'PLAYING') ? [...(engineDeliveredIds() || [])] : null, _pos = _jb ? _jb.indexOf(s.id) : -1;   // the jukebox order (2026-10-08 evening) [REF#UI-01513]
        const _jbHtml = _jb ? `<span class="mp-jb-order"><span class="mp-tag mp-jb-pos" title="Play order">${_pos + 1}</span><button class="mp-tag mp-var mp-jb-btn" data-act="jbup" data-id="${esc(s.id)}" title="Play earlier"${_pos <= 0 ? ' disabled' : ''}>▲</button><button class="mp-tag mp-var mp-jb-btn" data-act="jbdown" data-id="${esc(s.id)}" title="Play later"${_pos >= _jb.length - 1 ? ' disabled' : ''}>▼</button></span>` : '';
        return `
      <div class="mp-row${playing ? ' mp-playing' : ''}${(skip || played) ? ' mp-skipped' : ''}" data-id="${esc(s.id)}" data-role="${esc(roleOfTrack(s))}">
        ${_jbHtml}<button class="mp-play" data-act="play" data-id="${esc(s.id)}" aria-label="Play ${esc(s.title)} now" title="Play this song now">${playing ? '❚❚' : '▶ PLAY'}</button>
        <div class="mp-meta">
          <div class="mp-title">${esc(s.title)} <span class="mp-kanji">${esc(s.kanji || '')}</span></div>${cardLineHtml(s)}
          <div class="mp-sub">${esc(s.desc || '')}</div>
          <div class="mp-tags">
            <span class="mp-hard" title="How hard this track hits — the slider below prefers songs near your setting">${'▮'.repeat(Math.max(1, Math.round(hard * 5)))}<span class="mp-hard-dim">${'▮'.repeat(5 - Math.max(1, Math.round(hard * 5)))}</span></span>
            <span class="mp-lean" title="Dark for negative karma, light for positive — the second slider below">${(typeof s.karmaLean === 'number' && s.karmaLean <= -0.3) ? '🌑 dark' : (typeof s.karmaLean === 'number' && s.karmaLean >= 0.3) ? '☀ light' : '◐ neutral'}</span>
            ${(s.genre || []).map(g => `<span class="mp-tag">${esc(g)}</span>`).join('')}
            ${roleOfTrack(s) === 'legendary' ? '<span class="mp-tag mp-legend">LEGENDARY</span>' : ''}
            ${/^(find|legendary)$/.test(roleOfTrack(s)) ? ((engineDelivered() && engineDelivered().has(s.id)) ? '<span class="mp-tag mp-wired">✓ found</span>' : '<span class="mp-tag">not found yet</span>') : ''}
            ${vars.length > 1 ? `<button class="mp-tag mp-var" data-act="variant" data-id="${esc(s.id)}" title="Another take of this same song">↻ ${vars.length} takes</button>` : ''}
          </div>
        </div>
        ${_dlOn() ? `<button class="mp-dl" data-act="download" data-id="${esc(s.id)}" title="Take this song with you" aria-label="Download ${esc(s.title)}">${DL_ICON}</button>` : ''}
        ${roleSelectHtml(s)}
        <label class="mp-keep" title="Untick and Starlette skips this one tonight. Nothing is lost — tick it back any time.">
          <input type="checkbox" data-act="skip" data-id="${esc(s.id)}" ${skip ? '' : 'checked'}>
          <span>set</span>
        </label>
      </div>`;
    }

    // ── TAKE THE SONG WITH YOU (Mark 2026-09-07: "music player - add a download icon, so players can [REF#UI-00104a]
    //    get their favorite song downloaded to them if they like the music and its found - and
    //    starlette is playing") ──────────────────────────────────────────────────────────────────
    //    THE ICON LIVES ON THE COLLECTION ROW, AND THAT IS WHAT "found" MEANS HERE. This page has no
    //    separate discovered/owned flag to test: the collection tab IS the found list — the header of
    //    this file says it outright ("Music is not a setting here, it is LOOT ... an empty tab is not
    //    a bug"). A row exists because the player found the song, so the row is the test.
    //    NOT GATED ON HER SINGING RIGHT NOW. "and starlette is playing" is when a player decides they
    //    want the track, not a condition on the button — the music page is opened from the menu, and
    //    an icon that is absent unless a performance happens to be running reads as broken. Gate it
    //    anyway with window._songDownloadRequiresLive = true if that turns out to be the wrong call.
    //    Off entirely: window._songDownload = false.
    const _dlOn = () => (window._songDownload !== false)
        && (window._songDownloadRequiresLive !== true || window._starletteSinging === true);
    const DL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>'
        + '<line x1="12" y1="15" x2="12" y2="3"/></svg>';

    function libraryRowHtml(f) {
        const v = verdicts()[f.file] || '';
        const mins = f.seconds != null ? (Math.floor(f.seconds / 60) + ':' + String(Math.round(f.seconds % 60)).padStart(2, '0')) : '?';
        const playing = nowPlaying === f.file;
        return `
      <div class="mp-row mp-lib${playing ? ' mp-playing' : ''}${v === 'REJECT' ? ' mp-skipped' : ''}">
        <button class="mp-play" data-act="playfile" data-file="${esc(f.file)}" title="Listen">${playing ? '❚❚' : '▶'}</button>
        <div class="mp-meta">
          <div class="mp-title">${esc(f.name)}</div>
          <div class="mp-sub">${esc(f.dir)} · ${mins}${f.inCatalog ? ' · <span class="mp-wired">in game</span>' : ' · <span class="mp-unwired">not in game</span>'}</div>
        </div>
        <select class="mp-verdict" data-act="verdict" data-file="${esc(f.file)}">
          ${VERDICTS.map(o => `<option value="${o.v}"${o.v === v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </div>`;
    }

    /** [REF#UI-00121]
     * THE SONGS PAGE ROW — three independent rotation checkboxes (Mark 2026-08-08).
     *
     * The row shows what the CATALOG says beside what Mark has SET, because the whole reason this page
     * exists is that those two disagreed silently for five days. `in game` / `not in game` is carried
     * over from the library row for the same reason: a track can be ticked into a rotation here and
     * still have no catalog entry to hang captions off, and that gap should be visible, not inferred.
     */
    function songsRowHtml(s) {
        // ONE ROLE PER TRACK (2026-09-29) — the role selector replaced the CABARET / BG / COMBAT / NEEDS CARD checkboxes. [REF#UI-01457]
        const v = verdicts()[s.file] || '';
        const playing = nowPlaying === s.file || nowPlaying === s.id;
        const mins = s.seconds != null ? (Math.floor(s.seconds / 60) + ':' + String(Math.round(s.seconds % 60)).padStart(2, '0')) : null;
        const found = (/^(find|legendary)$/.test(roleOfTrack(s)) && !s._fromDisk) ? ((engineDelivered() && engineDelivered().has(s.id)) ? ' · <span class="mp-wired">✓ found</span>' : ' · not found yet') : '';
        return `
      <div class="mp-row mp-songs${playing ? ' mp-playing' : ''}${v === 'REJECT' ? ' mp-skipped' : ''}" data-role="${esc(roleOfTrack(s))}">
        <button class="mp-play" data-act="playfile" data-file="${esc(s.file)}" aria-label="Play ${esc(s.title || s.name || '')} now" title="Play this song now">${playing ? '❚❚' : '▶ PLAY'}</button>
        <div class="mp-meta">
          <div class="mp-title">${esc(s.title || s.name || '')} <span class="mp-kanji">${esc(s.kanji || '')}</span>${roleOfTrack(s) === 'legendary' ? ' <span class="mp-tag mp-legend">LEGENDARY</span>' : ''}</div>${cardLineHtml(s)}
          <div class="mp-sub">${esc(s.desc || '')}${mins ? ' · ' + mins : ''}${s._fromDisk ? ' · <span class="mp-unwired">not in catalog</span>' : ' · <span class="mp-wired">in catalog</span>'}${found}</div>
          ${(/^(find|legendary)$/.test(roleOfTrack(s)) && s._fromDisk) ? '<div class="mp-sub mp-nohome">⚠ not in the catalog yet — it cannot be dealt as a card until it has an entry</div>' : ''}
        </div>
        ${roleSelectHtml(s)}
      </div>`;
    }
    /** The saved roles, pasteable back as MusicRoles defaults. [REF#UI-01458] */
    function exportRoles() {
        const by = {}; for (const r of ROLES) by[r.k] = [];
        for (const s of allTracks()) by[roleOfTrack(s)].push(s.file);
        const txt = JSON.stringify(by, null, 1);
        try { navigator.clipboard.writeText(txt); } catch (_) {}
        try { console.log('[MUSIC ROLES]\n' + txt); } catch (_) {}
    }

    /** Mark's rotation ticks, pasteable into SongCatalog. Same reason as exportVerdicts below. [REF#UI-00122] */
    function exportRotations() {
        const rows = allTracks().map(s => ({ file: s.file, rot: rotationOf(s) }));
        const by = { cabaret: [], bg: [], combat: [], none: [] };
        for (const r of rows) {
            let any = false;
            for (const k of ['cabaret', 'bg', 'combat']) if (r.rot[k]) { by[k].push(r.file); any = true; }
            if (!any) by.none.push(r.file);
        }
        let out = '// Rotation assignments from the SONGS page — ' + rows.length + ' track(s)\n';
        for (const k of ['cabaret', 'bg', 'combat', 'none']) {
            out += '\n// ' + k.toUpperCase() + ' (' + by[k].length + ')\n';
            for (const f of by[k]) out += "//   '" + f + "'\n";
        }
        return out;
    }

    /** Mark's calls, as something that can be pasted into source. Same reason as GenreStore's export. [REF#UI-00123] */
    function exportVerdicts() {
        const all = verdicts();
        const keys = Object.keys(all);
        if (!keys.length) return '// nothing graded yet\n';
        const by = {};
        for (const k of keys) (by[all[k]] || (by[all[k]] = [])).push(k);
        const out = ['// ── AUDIO TRIAGE — Mark\'s calls, ' + keys.length + ' file(s) graded ──────────────────',
                     '//    Paste-able record. Until this is committed it lives in one browser\'s localStorage.', ''];
        for (const v of Object.keys(by).sort()) {
            out.push('// ' + v + '  (' + by[v].length + ')');
            for (const f of by[v].sort()) out.push("//   '" + f + "',");
            out.push('');
        }
        return out.join('\n');
    }

    /** The spectrum/oscilloscope canvas. Drawn directly from MUSIC_PAGE_VIS pushes (up to 30/s) — [REF#UI-00124]
     *  deliberately NOT routed through render(), which rebuilds the whole track list and would be
     *  wasteful and flickery at that rate. Falling peak caps on the spectrum are the one bit of state
     *  that lives here rather than the engine, same as any other Winamp clone. */
    function drawVis() {
        if (!visCanvas || !visCtx) return;
        const w = visCanvas.width, h = visCanvas.height;
        visCtx.clearRect(0, 0, w, h);
        if (visMode === 'off') return;
        if (visMode === 'scope') {
            const wave = waveData;
            visCtx.strokeStyle = '#22d3ee'; visCtx.lineWidth = 1.5; visCtx.beginPath();
            for (let i = 0; i < wave.length; i++) {
                const x = (i / (wave.length - 1)) * w;
                const y = h - (wave[i] / 255) * h;
                i === 0 ? visCtx.moveTo(x, y) : visCtx.lineTo(x, y);
            }
            visCtx.stroke();
            return;
        }
        // spectrum [REF#UI-00125]
        const freq = freqData;
        const n = freq.length || 20, bw = w / n;
        for (let i = 0; i < n; i++) {
            const v = (freq[i] || 0) / 255;
            visPeaks[i] = Math.max(v, visPeaks[i] - 0.02);   // slow fall, instant rise — the classic look [REF#UI-00126]
            const bh = Math.max(1, v * h), ph = visPeaks[i] * h;
            const x = i * bw + 1, bwv = Math.max(1, bw - 2);
            visCtx.fillStyle = 'rgba(34,211,238,0.75)';
            visCtx.fillRect(x, h - bh, bwv, bh);
            visCtx.fillStyle = '#e6ebf2';
            visCtx.fillRect(x, h - ph - 1.5, bwv, 1.5);
        }
    }

    /** Marquee scroll — a CSS animation switched on only when the title actually overflows its box, [REF#UI-00127]
     *  so a short title just sits still centered rather than jittering back and forth for no reason. */
    function updateMarquee(text) {
        const wrap = root.querySelector('.mp-marquee-wrap');
        const el = root.querySelector('#mp-marquee');
        if (!el || !wrap) return;
        el.textContent = text;
        el.classList.remove('scroll');
        requestAnimationFrame(() => {
            if (el.scrollWidth > wrap.clientWidth) {
                el.style.setProperty('--mp-marquee-dist', '-' + el.scrollWidth + 'px');
                el.style.setProperty('--mp-marquee-dur', Math.max(6, el.scrollWidth / 40) + 's');
                el.classList.add('scroll');
            }
        });
    }

    /** The lightweight half of rendering — seek position, clock, meta readout, play/pause icon, [REF#UI-00128]
     *  marquee. Called on every TIME push (up to a few times a second) so it must never touch the
     *  track list's innerHTML, or the list would flicker and lose scroll position while a song plays. */
    function renderTransport() {
        if (!root) return;
        const s = currentTrack();
        updateMarquee(s ? ('♪ ' + titleOf(s)) : '♪ No track selected');
        const metaEl = root.querySelector('#mp-meta-fmt');
        if (metaEl) metaEl.textContent = (kbps ? kbps + ' kbps' : '— kbps') + ' · ' + (khz ? khz + ' kHz' : '— kHz') + ' · stereo';
        const timeEl = root.querySelector('#mp-time');
        if (timeEl) timeEl.textContent = _fmtTime(curTime) + ' / ' + _fmtTime(duration);
        const seek = root.querySelector('#mp-seek');
        if (seek && !seeking) seek.value = duration > 0 ? String(Math.round((curTime / duration) * 1000)) : '0';
        const pp = root.querySelector('[data-act="playpause"]');
        if (pp) pp.textContent = (!paused && nowPlaying) ? '❚❚' : '▶';
        renderPlayedSetting();
    }

    function render() {
        if (!root) return;
        const list = songsFor(active);
        const tab = TABS.find(t => t.key === active) || TABS[0];
        const pref = store ? store.hardnessPref() : 0.5;
        const kpref = store ? store.karmaPref() : 0;
        root.querySelector('.mp-tabs').innerHTML = TABS.filter(t => COMPACT_TABS.has(t.key) || (devMode() && t.dev) || (devMode() && t.key === 'SONGS')).map(t => {
            const n = t.key === 'LIBRARY' ? (manifest ? manifest.MUSIC_FILES.length : 0)
                    : t.key === 'MY_MUSIC' ? userSongs.length
                    // SONGS lists the whole union, so songsFor() — which buckets by tab — would read 0. [REF#UI-00129]
                    : t.key === 'SONGS' ? allTracks().length
                    : songsFor(t.key).length;
            return `<button class="mp-tab${t.key === active ? ' on' : ''}" data-tab="${t.key}"${t.role ? ` data-role="${t.role}"` : ''}>
                      ${esc(t.label)}<span class="mp-tab-jp">${esc(t.jp)}</span>${n ? `<span class="mp-count">${n}</span>` : ''}
                    </button>`;
        }).join('');
        try {
            let bar = root.querySelector('.mp-savebar');
            if (!bar){ bar = document.createElement('div'); bar.className = 'mp-savebar'; bar.style.cssText = 'display:none;gap:10px;align-items:center;justify-content:flex-end;padding:8px 12px;margin:6px 0;border-radius:10px;background:rgba(255,196,80,0.12);border:1px solid rgba(255,196,80,0.45);font-weight:700';
                const tabs = root.querySelector('.mp-tabs'); tabs.parentNode.insertBefore(bar, tabs.nextSibling); }
            try { let hb = root.querySelector('.mp-heartbar');
                if (!hb){ hb = document.createElement('div'); hb.className = 'mp-heartbar'; hb.style.cssText = 'padding:6px 12px;font-size:12px;letter-spacing:.04em;opacity:.85;'; bar.parentNode.insertBefore(hb, bar.nextSibling); }
                const rooms = engineRoomsActivated(); const n = rooms ? rooms.length : 0;
                hb.innerHTML = n > 0 ? `<span style="color:#ff7aa2">♥ HEART GRANTED</span> — ${n} room${n === 1 ? '' : 's'} activated (${rooms.map(esc).join(', ')}) · hallway 0 plays its bag`
                                     : `<span style="opacity:.6">♡ HEART SILENT</span> — activate a room and hallway 0's music is granted`;
            } catch (_) {}
            const n = (_rotPending ? Object.keys(_rotPending).length : 0) + (_rolePending ? Object.keys(_rolePending).length : 0);
            bar.style.display = n ? 'flex' : 'none';
            if (n) bar.innerHTML = `<span style="margin-right:auto">Music changed — ${n} song${n === 1 ? '' : 's'} not saved yet</span>`
                + `<button class="mp-tab" data-act="rotdiscard">DISCARD</button>`
                + `<button class="mp-tab on" data-act="rotsave">💾 SAVE</button>`;
        } catch (_) {}
        if (active === 'SONGS') {
            // EVERY track, catalogued or not — grouped by its ONE role (2026-09-29). Change a role with its selector, then SAVE. [REF#UI-01459]
            const all = allTracks();
            const by = {}; for (const r of ROLES) by[r.k] = [];
            for (const s of all) by[roleOfTrack(s)].push(s);
            root.querySelector('.mp-list').innerHTML = all.length
                ? `<div class="mp-libhead">${all.length} track(s) — each has one role. Change it with its selector, then 💾 SAVE.
                     <button class="mp-tag mp-var" data-act="exportroles">copy my calls</button></div>`
                  + ROLES.map(r => roleHeadHtml(r.k, by[r.k].length, 14) + by[r.k].map(songsRowHtml).join('')).join('')
                : `<div class="mp-empty"><div class="mp-empty-glyph">♪</div><p>${esc(tab.empty)}</p></div>`;
        } else if (active === 'LIBRARY') {
            const files = manifest ? manifest.MUSIC_FILES : [];
            const graded = Object.keys(verdicts()).length;
            root.querySelector('.mp-list').innerHTML = files.length
                ? `<div class="mp-libhead">${files.length} music file(s) on disk · ${files.filter(f => !f.inCatalog).length} not wired into the game yet · ${graded} graded
                     <button class="mp-tag mp-var" data-act="exportverdicts">copy my calls</button></div>`
                  + files.map(libraryRowHtml).join('')
                : `<div class="mp-empty"><div class="mp-empty-glyph">♪</div><p>${esc(tab.empty)}</p></div>`;
        } else if (active === 'MY_MUSIC') {
            const supported = userSongsMod && userSongsMod.isSupported();
            root.querySelector('.mp-list').innerHTML = `
              <div class="mp-drop" id="mp-drop">
                <div class="mp-drop-glyph">♪+</div>
                <p>Drop an audio file here${supported ? '' : ' <b>— your browser does not support this</b>'}<br>
                   an <b>.srt</b> dropped alongside it saves synced lyrics for later.</p>
                <button class="mp-drop-browse" type="button" data-act="browse">choose files</button>
                <input type="file" id="mp-drop-input" multiple accept="audio/*,.srt" hidden>
              </div>
              ${uploadStatus ? `<div class="mp-upload-status">${esc(uploadStatus)}</div>` : ''}
              ${userQuotaText ? `<div class="mp-quota">${esc(userQuotaText)}</div>` : ''}
              ${userSongs.length ? userSongs.map(userRowHtml).join('')
                                  : `<div class="mp-empty"><div class="mp-empty-glyph">♪</div><p>${esc(tab.empty)}</p></div>`}`;
        } else {
            root.querySelector('.mp-list').innerHTML = list.length
                ? (tab.role ? roleHeadHtml(tab.role, list.length, 2) : '') + (tab.key === 'PLAYING' ? playingHeadHtml(list) : '')
                  + (tab.role === 'fight' ? '<p class="mp-sub">Combat background rotation — the next track plays if combat continues.</p>' : '') + list.map(rowHtml).join('')
                : `<div class="mp-empty"><div class="mp-empty-glyph">♪</div><p>${esc(tab.empty)}</p></div>`;
        }
        const sl = root.querySelector('#mp-hardness');
        if (sl) { sl.value = String(Math.round(pref * 100)); }
        const ks = root.querySelector('#mp-karma');
        if (ks) ks.value = String(Math.round(kpref * 100));
        const lab = root.querySelector('#mp-hardness-label');
        if (lab) lab.textContent = pref < 0.2 ? 'very soft · gentle'
                                 : pref < 0.4 ? 'soft'
                                 : pref < 0.6 ? 'balanced'
                                 : pref < 0.8 ? 'driving'
                                 : 'hard rocking · daemonic';
        const klab = root.querySelector('#mp-karma-label');
        if (klab) klab.textContent = kpref < -0.6 ? 'dark'
                                   : kpref < -0.2 ? 'shaded'
                                   : kpref <= 0.2 ? 'neutral'
                                   : kpref <= 0.6 ? 'warm'
                                   : 'light';
        // Winamp transport — synced here (list rebuilds/tab switches) and NOT on every time tick, [REF#UI-00131]
        // since these only change from a direct user drag, never from playback itself.
        const volEl = root.querySelector('#mp-vol'); if (volEl) volEl.value = String(Math.round(volPref * 100));
        const balEl = root.querySelector('#mp-bal'); if (balEl) balEl.value = String(Math.round(balPref * 100));
        const preEl = root.querySelector('#mp-preamp'); if (preEl) preEl.value = String(Math.round(preampPref * 100));
        root.querySelectorAll('.mp-eq-slider[data-band]').forEach(sl => {
            sl.value = String(eqPrefBands[+sl.dataset.band] || 0);
        });
        renderTransport();
        renderPlayAll();
        renderPlayedSetting();
    }

    function onClick(e) {
        const tabBtn = e.target.closest('.mp-tab[data-tab]');   // a real tab only — the save bar's SAVE / DISCARD share the .mp-tab look and were swallowed here as tab clicks (2026-09-29) [REF#UI-01460]
        if (tabBtn) {
            active = tabBtn.dataset.tab; render();
            if (active === 'MY_MUSIC') refreshUserSongs();
            return;
        }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'rotsave') { saveRotations(); saveRoles(); render(); return; }
        if (act.dataset.act === 'rotdiscard') { discardRotations(); _rolePending = null; render(); return; }
        if (act.dataset.act === 'playedtoggle') { setSkipPlayedRecords(true); render(); return; }
        if (act.dataset.act === 'jbup' || act.dataset.act === 'jbdown') { jukeboxMove(act.dataset.id, act.dataset.act === 'jbup' ? -1 : 1); return; }
        const id = act.dataset.id;
        if (act.dataset.act === 'playall') { if (pa) stopPlayAll(); else playAll(); return; }
        if (pa && /^(play|playfile|playuser|variant|stop)$/.test(act.dataset.act)) stopPlayAll();
        if (pa && (act.dataset.act === 'prev' || act.dataset.act === 'next')) { paStep(act.dataset.act === 'next' ? 1 : -1); return; }
        if (act.dataset.act === 'play') {
            const s = catalog && catalog.songById(id);
            if (!s) return;
            if (nowPlaying === id) { nowPlaying = null; paused = true; send({ type: 'MUSIC_PAGE_STOP' }); render(); }
            else startTrack(s, true);
        } else if (act.dataset.act === 'download') {
            // The shell owns the modal AND the file. This frame only names the song: the tip modal it [REF#UI-00104b]
            // reuses lives in NewOrigami.9.html, and a cross-frame download started from here would be
            // a second place that knows where song files sit on disk.
            const s = catalog && catalog.songById(id);
            if (!s) return;
            send({ type: 'SONG_DOWNLOAD', id: s.id, title: s.title, kanji: s.kanji || '', file: s.file || '' });
        } else if (act.dataset.act === 'variant') {
            const s = catalog && catalog.songById(id);
            const vars = variantsOf(s);
            if (vars.length < 2) return;
            startTrack(vars[(vars.findIndex(v => v.id === id) + 1) % vars.length], true);
        } else if (act.dataset.act === 'skip') {
            toggleSkip(id); render();
        } else if (act.dataset.act === 'playfile') {
            const f = act.dataset.file;
            if (nowPlaying === f) { nowPlaying = null; paused = true; send({ type: 'MUSIC_PAGE_STOP' }); render(); }
            else startTrack({ file: f, title: f.split('/').pop(), _fromDisk: true }, true);
        } else if (act.dataset.act === 'playuser') {
            const slug = act.dataset.slug;
            const key = 'user-' + slug;
            if (nowPlaying === key) { nowPlaying = null; paused = true; send({ type: 'MUSIC_PAGE_STOP' }); render(); return; }
            const entry = userSongs.find(s => s.slug === slug);
            if (!entry || !userSongsMod) return;
            playUserEntry(entry);   // the resolve-and-play lives in playUserEntry() since 2026-10-02 — PLAY ALL starts uploads the same way [REF#UI-01461]
        } else if (act.dataset.act === 'exportverdicts') {
            const txt = exportVerdicts();
            try { navigator.clipboard.writeText(txt); act.textContent = 'copied ✓'; setTimeout(() => render(), 1400); }
            catch (_) { try { console.log(txt); act.textContent = 'in console'; } catch (__) {} }
        } else if (act.dataset.act === 'exportroles') {
            exportRoles();
        } else if (act.dataset.act === 'exportrotations') {
            const txt = exportRotations();
            try { navigator.clipboard.writeText(txt); act.textContent = 'copied ✓'; setTimeout(() => render(), 1400); }
            catch (_) { try { console.log(txt); act.textContent = 'in console'; } catch (__) {} }
        } else if (act.dataset.act === 'prev') {
            stepTrack(-1);
        } else if (act.dataset.act === 'next') {
            stepTrack(1);
        } else if (act.dataset.act === 'stop') {
            nowPlaying = null; paused = true; send({ type: 'MUSIC_PAGE_STOP' }); render();
        } else if (act.dataset.act === 'playpause') {
            if (!nowPlaying) { stepTrack(0); return; }   // nothing loaded — start whatever is first in this tab [REF#UI-00134]
            if (paused) { send({ type: 'MUSIC_PAGE_RESUME' }); } else { send({ type: 'MUSIC_PAGE_PAUSE' }); }
            // Optimistic flip — the engine's next MUSIC_PAGE_NOW confirms it either way, same idiom as [REF#UI-00135]
            // every other control here: the icon must never drift from what is actually playing.
            paused = !paused; renderTransport();
        } else if (act.dataset.act === 'browse') {
            root.querySelector('#mp-drop-input')?.click();
        } else if (act.dataset.act === 'eqtoggle') {
            root.querySelector('.mp-eq')?.classList.toggle('collapsed');
        } else if (act.dataset.act === 'vis') {
            visMode = visMode === 'spectrum' ? 'scope' : visMode === 'scope' ? 'off' : 'spectrum';
            act.title = 'Display: ' + visMode + ' (click to change)';
            drawVis();
        }
    }

    function shell() {
        const el = document.createElement('div');
        el.id = 'music-page';
        el.className = 'mp-wrap mp-compact';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Music');
        if (!document.getElementById('mp-compact-style')) {
            const style = document.createElement('style');
            style.id = 'mp-compact-style';
            style.textContent = '#music-page.mp-compact .mp-vis,#music-page.mp-compact .mp-meta-row,#music-page.mp-compact .mp-eq-toggle,#music-page.mp-compact .mp-playall-row,#music-page.mp-compact .mp-eq,#music-page.mp-compact .mp-foot{display:none}';
            document.head.appendChild(style);
        }
        el.innerHTML = `
      <div class="mp-card">
       <div class="mp-col mp-col-l">
        <div class="mp-head">
          <div class="mp-brand">♪ <span>MUSIC</span> <em>音楽</em></div>
          <div class="mp-head-btns">
            <!-- THE MUTE THE ICON USED TO CARRY. Click on the music symbol now opens this page (Mark [REF#UI-00136]
                 2026-08-05), so the toggle lives here rather than being quietly lost. -->
            <button class="mp-mute" title="Mute / unmute the dungeon's music">♫ mute</button>
            <button class="mp-close" title="Close" aria-label="Close">✕ CLOSE</button>
          </div>
        </div>
        <!-- ── THE WINAMP FACE (2026-08-06) ───────────────────────────────────────────────────── [REF#UI-00137]
             Title-bar marquee, spectrum/scope window, kbps/kHz/clock readout, seek bar, transport,
             volume + balance, then the 10-band EQ with its preamp fader. All of it in this page's own
             dark-glass palette per Mark's ruling — Winamp's ARRANGEMENT, not its beige bitmaps. The
             audio graph these controls drive lives in Engine9 (_mpEnsureGraph); this is markup only. -->
        <div class="mp-player">
          <div class="mp-marquee-wrap"><div class="mp-marquee" id="mp-marquee">♪ No track selected</div></div>
          <canvas class="mp-vis" id="mp-vis" data-act="vis" width="300" height="46"
                  title="Display: spectrum (click to change)"></canvas>
          <div class="mp-meta-row">
            <span id="mp-meta-fmt">— kbps · — kHz · stereo</span>
            <span id="mp-time">0:00 / 0:00</span>
          </div>
          <div class="mp-seek-row"><input type="range" id="mp-seek" min="0" max="1000" value="0" aria-label="Seek"></div>
          <div class="mp-transport-row">
            <button class="mp-tbtn" data-act="prev" title="Previous">⏮</button>
            <button class="mp-tbtn mp-tbtn-play" data-act="playpause" title="Play / pause">▶</button>
            <button class="mp-tbtn" data-act="stop" title="Stop">■</button>
            <button class="mp-tbtn" data-act="next" title="Next">⏭</button>
            <div class="mp-vb-block"><span class="mp-vb-cap">VOL</span><input type="range" id="mp-vol" min="0" max="100" value="55" aria-label="Volume"></div>
            <div class="mp-vb-block"><span class="mp-vb-cap">BAL</span><input type="range" id="mp-bal" min="-100" max="100" value="0" aria-label="Balance"></div>
            <button class="mp-eq-toggle" data-act="eqtoggle" title="Show / hide the equalizer">EQ</button>
          </div>
          <div class="mp-setting-row">
            <button class="mp-played-toggle on" data-act="playedtoggle" aria-pressed="true" title="Already-played jukebox records will not start again">☑ ALREADY PLAYED: SKIP</button>
          </div>
          <!-- PLAY ALL (2026-10-02): every song the player owns, one after another. [REF#UI-01462] -->
          <div class="mp-playall-row">
            <button class="mp-playall" data-act="playall" aria-pressed="false" title="Play every song you own, one after another">▶ PLAY ALL</button>
            <span class="mp-playall-state" aria-live="polite"></span>
          </div>
          <div class="mp-eq collapsed"><!-- starts folded (Mark 2026-09-20: the card shrank 25% and the ten faders were pushing the song list off the bottom); the EQ button unfolds it -->
            <div class="mp-eq-band mp-eq-preamp" title="The booster — pushes everything below it louder, with a limiter riding behind it so it cannot clip">
              <div class="mp-eq-slider-wrap"><input type="range" class="mp-eq-slider" id="mp-preamp" min="0" max="400" value="100" aria-label="Preamp / booster"></div>
              <span class="mp-eq-freq">PRE</span>
            </div>
            <div class="mp-eq-sep"></div>
            ${MP_EQ_FREQS.map((f, i) => `
            <div class="mp-eq-band">
              <div class="mp-eq-slider-wrap"><input type="range" class="mp-eq-slider" data-band="${i}" min="-12" max="12" value="0" aria-label="${f} Hz band"></div>
              <span class="mp-eq-freq">${_fmtHz(f)}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="mp-foot">
          <div class="mp-slider-row">
            <span class="mp-slider-cap">SOFT</span>
            <input type="range" id="mp-hardness" min="0" max="100" value="50"
                   aria-label="Preferred sound: soft and gentle through hard rocking">
            <span class="mp-slider-cap">HARD</span>
          </div>
          <!-- THE SECOND AXIS (Mark 2026-08-05): dark ↔ light, which is karma. Independent of the one [REF#UI-00138]
               above on purpose — a lament is soft AND dark, an anthem is hard AND light, and one slider
               cannot say that. -1 = music for a player running negative karma, +1 = positive. -->
          <div class="mp-slider-row">
            <span class="mp-slider-cap">DARK</span>
            <input type="range" id="mp-karma" min="-100" max="100" value="0"
                   aria-label="Preferred mood: dark for negative karma through light for positive karma">
            <span class="mp-slider-cap">LIGHT</span>
          </div>
          <div class="mp-slider-note">Starlette leans <b id="mp-hardness-label">balanced</b> and <b id="mp-karma-label">neutral</b> — nothing is ever ruled out.</div>
        </div>
       </div>
       <!-- THE RIGHT PAGE (2026-10-02): the tabs and the song list. In the old full-screen window both columns are display:contents, so the [REF#UI-01463]
            card reads top to bottom exactly as before (the foot is ordered last there). -->
       <div class="mp-col mp-col-r">
        <div class="mp-tabs"></div>
        <div class="mp-body"><div class="mp-list"></div></div>
       </div>
      </div>`;
        visCanvas = el.querySelector('#mp-vis');
        visCtx = visCanvas ? visCanvas.getContext('2d') : null;
        el.addEventListener('click', ev => {
            if ((ev.target === el && !el.classList.contains('mp-in-guide')) || ev.target.closest('.mp-close')) { hide(); return; }
            if (ev.target.closest('.mp-mute')) { try { window.toggleBgMusic && window.toggleBgMusic(); } catch (_) {} return; }
            onClick(ev);
        });
        el.addEventListener('change', ev => {
            const rs = ev.target.closest('select.mp-role');   // a role change is staged until SAVE (2026-09-29) [REF#UI-01464]
            if (rs) { setRole(rs.dataset.file, rs.value); render(); return; }
            const sel = ev.target.closest('.mp-verdict');
            if (sel) { setVerdict(sel.dataset.file, sel.value); render(); return; }
            // SONGS page rotation checkboxes (Mark 2026-08-08). Persist, then re-render so the header [REF#UI-00139]
            // counts and the "no rotation" warning move with the tick instead of going stale.
            const rot = ev.target.closest('input[data-act="rot"]');
            if (rot) { setRotation(rot.dataset.file, rot.dataset.rot, rot.checked); render(); return; }
            if (ev.target.id === 'mp-drop-input') { handleUploadFiles(ev.target.files); ev.target.value = ''; }
        });
        // MY MUSIC drop zone — delegated on the whole page (not #mp-drop itself, which render() [REF#UI-00140]
        // destroys and recreates every tab switch/upload). dragover must preventDefault or the
        // browser's own "open this file" navigation wins instead of firing 'drop'.
        el.addEventListener('dragover', ev => { if (ev.target.closest('#mp-drop')) { ev.preventDefault(); ev.target.closest('#mp-drop').classList.add('mp-drop-over'); } });
        el.addEventListener('dragleave', ev => { const d = ev.target.closest('#mp-drop'); if (d) d.classList.remove('mp-drop-over'); });
        el.addEventListener('drop', ev => {
            const d = ev.target.closest('#mp-drop');
            if (!d) return;
            ev.preventDefault(); d.classList.remove('mp-drop-over');
            if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) handleUploadFiles(ev.dataTransfer.files);
        });
        // Seek is the one control that needs to know it's mid-drag, so the periodic MUSIC_PAGE_TIME [REF#UI-00141]
        // push from the engine doesn't yank the slider back to the actual playhead while dragging.
        el.addEventListener('pointerdown', ev => { if (ev.target.id === 'mp-seek') seeking = true; });
        el.addEventListener('pointerup',   ev => { if (ev.target.id === 'mp-seek') { seeking = false; } });
        el.addEventListener('input', ev => {
            const t = ev.target;
            if (t.id === 'mp-hardness') {
                const v = Number(t.value) / 100;
                if (store) store.setHardnessPref(v);
                send({ type: 'SONG_HARDNESS_PREF', value: v });
                render();
            } else if (t.id === 'mp-karma') {
                const v = Number(t.value) / 100;
                if (store) store.setKarmaPref(v);
                send({ type: 'SONG_KARMA_PREF', value: v });
                render();
            } else if (t.id === 'mp-seek') {
                if (duration > 0) {
                    curTime = (Number(t.value) / 1000) * duration;
                    renderTransport();
                    send({ type: 'MUSIC_PAGE_SEEK', seconds: curTime });
                }
            } else if (t.id === 'mp-vol') {
                volPref = Number(t.value) / 100;
                send({ type: 'MUSIC_PAGE_VOL', value: volPref });
            } else if (t.id === 'mp-bal') {
                balPref = Number(t.value) / 100;
                send({ type: 'MUSIC_PAGE_BAL', value: balPref });
            } else if (t.id === 'mp-preamp') {
                preampPref = Number(t.value) / 100;
                send({ type: 'MUSIC_PAGE_PREAMP', value: preampPref });
            } else if (t.classList.contains('mp-eq-slider') && t.dataset.band != null) {
                const i = +t.dataset.band;
                eqPrefBands[i] = Number(t.value);
                send({ type: 'MUSIC_PAGE_EQ', band: i, value: eqPrefBands[i] });
            }
        });
        return el;
    }

    async function show(opts) {
        await ensureData();
        if (!root) root = shell();
        // THE PAGE LIVES IN THE GUIDEBOOK (2026-10-02): a host (the guidebook's Music spread) takes the page in; without one it is the [REF#UI-01465]
        // old full-screen window on <body>. Same element either way, so every listener and every query in this file is unchanged.
        const host = opts && opts.host;
        if (host) { if (root.parentNode !== host) host.appendChild(root); root.classList.add('mp-in-guide'); }
        else { if (root.parentNode !== document.body) document.body.appendChild(root); root.classList.remove('mp-in-guide'); }
        try { ensureRoleStyle(); } catch (_) {}
        render();
        root.classList.add('on');
        send({ type: 'MUSIC_PAGE_OPEN' });   // the engine only bothers sampling/posting the visualiser while this is true [REF#UI-00142]
        setSkipPlayedRecords(skipPlayedRecords());
        if (!host) { try { root.querySelector('.mp-close').focus(); } catch (_) {} }   // inside the book the guidebook owns focus [REF#UI-01466]
        refreshUserSongs().then(() => renderPlayAll()).catch(() => {});   // the player's own uploads count toward PLAY ALL [REF#UI-01467]
    }
    function hide() { if (root) root.classList.remove('on'); send({ type: 'MUSIC_PAGE_CLOSE' }); }
    function toggle() { (root && root.classList.contains('on')) ? hide() : show(); }

    /** The engine tells us what it is actually playing (and now, paused or not), so the ▶/❚❚ state [REF#UI-00143]
     *  can never drift from the audio — same rule as always, just carrying one more field. */
    function setNowPlaying(id, isPaused, file) {
        const prevId = nowPlaying;
        const prevPaused = paused;
        paHear(id || null, isPaused === true, file || null);
        nowPlaying = id || null;
        if (typeof isPaused === 'boolean') paused = isPaused;
        if (!id) paused = true;
        if (root && root.classList.contains('on')) {
            // The engine's truth watcher repeats the same NOW message every second. Rebuilding the [REF#UI-01468]
            // song list for an unchanged playback state destroys an open native role selector.
            if (prevId !== nowPlaying || prevPaused !== paused) render();
            else renderTransport();
        }
    }
    /** Seek bar + clock, pushed a few times a second while something plays. [REF#UI-00144] */
    function setTime(t, dur) { curTime = +t || 0; duration = +dur || 0; renderTransport(); }
    /** Bitrate/sample-rate readout — display only, best-effort (see Engine9's HEAD-request note). [REF#UI-00145] */
    function setMeta(k, hz) { kbps = k || null; khz = hz || null; renderTransport(); }
    /** Spectrum + oscilloscope data, up to 30/s while the page is open and something is playing. [REF#UI-00146] */
    function setVis(freq, wave) { freqData = freq || []; waveData = wave || []; drawVis(); }
    function refreshCollection() { if (root && root.classList.contains('on')) render(); }

    return { show, hide, toggle, setNowPlaying, setTime, setMeta, setVis, refreshCollection, playAll, stopPlayAll,
             isOpen: () => !!(root && root.classList.contains('on')),
             inGuide: () => !!(root && root.classList.contains('mp-in-guide')) };
}

export default createMusicPage;
