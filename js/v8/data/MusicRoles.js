/** [REF#DA-00261]
 * MusicRoles.js — ONE ROLE PER TRACK, AND ONE PLACE THAT SAYS WHICH (2026-09-29).
 *
 * Every music track in the game has exactly one role. The Music page's SONGS tab shows the roles and
 * lets them be changed (staged, then SAVE); the engine reads the same answer to decide what plays:
 *
 *   base     Starlette's own songs — in her set from the first night, no card needed.
 *   find     A song card the player finds in the dungeon; handed in at her circle, she sings it.
 *   legendary  A legendary song card: a room guard carries it; handed in, she sings it with the house louder and the lights up.
 *   cabbg    The cabaret's background bed — plays there while she is not singing (and under the death scene).
 *   fight    A fight song — the Composer's fight pool.
 *   section  The dungeon's own music in sections 1-4 — the Composer's section pool.
 *   gamble   At the tables — the Composer's gambling pool.
 *   other    Scene cues, alternate cuts, encores and files the game does not play.
 *
 * WHERE THE ANSWER COMES FROM, in order: the Music page's saved choice (localStorage LS_ROLES) → for a track
 * outside the catalog, an old LIBRARY verdict (origami.v8.audioVerdicts, mapped by VERDICT_ROLE) → the
 * defaults below. The engine builds its pools from this (Origami.RealityEngine.9.html, window._applyMusicRoles)
 * and re-reads it when the Music page saves. The record of the orders behind the defaults is the
 * DISABLED-FEATURES REGISTER entry for songs v2 at the top of Origami.RealityEngine.9.html and SEAT_PIPELINE.md §4.
 *
 * COLOURS (2026-09-30): each role has one colour (`color` for borders and chips, `ink` for text on the page's dark panels), shown on
 * the Music page's tab, tiles, selector and headings. The two card roles wear their card's metal: LEGENDARY the solid-gold card and
 * TO FIND the solid-silver card (js/v8/entities/LootCardBuilder.js, SONG_GOLD_FACE / SONG_SILVER_FACE). The engine sets each catalog
 * song's rarity and card metal from its role (window._applyMusicRoles, window._songMetalOf).
 */

export const ROLES = [
    { k: 'base',      label: "HER SONGS",  jp: '持ち歌', icon: '★',  color: '#f472b6', ink: '#f9a8d4', card: null,
      desc: "Starlette's own songs — she sings these from the first night, no card." },
    { k: 'find',      label: 'TO FIND',    jp: '探す歌', icon: '🎴', color: '#c8ccd0', ink: '#e2e8f0', card: 'silver',
      desc: 'A song card hidden in the dungeon. Bring it to her circle and she sings it.' },
    { k: 'legendary', label: 'LEGENDARY',  jp: '伝説',   icon: '👑', color: '#d4a017', ink: '#ffd700', card: 'gold',
      desc: 'The songs we wish every song could be. A room guard carries each card; when she sings one, the house gets louder and the lights come up.' },
    { k: 'cabbg',     label: 'CABARET BG', jp: '店の音', icon: '🍸', color: '#fb923c', ink: '#fdba74', card: null,
      desc: 'Plays in the cabaret while she is not singing.' },
    { k: 'fight',     label: 'FIGHT',      jp: '戦',     icon: '⚔',  color: '#ef5350', ink: '#fca5a5', card: null,
      desc: 'Plays when a fight starts.' },
    { k: 'section',   label: 'SECTION BG', jp: '探索',   icon: '🗺',  color: '#22c55e', ink: '#86efac', card: null,
      desc: "The dungeon's own music while you explore sections 1-4." },
    { k: 'gamble',    label: 'GAMBLING',   jp: '賭',     icon: '🎲', color: '#a78bfa', ink: '#c4b5fd', card: null,
      desc: 'Plays at the tables.' },
    { k: 'other',     label: 'OTHER',      jp: '他',     icon: '·',  color: '#64748b', ink: '#cbd5e1', card: null,
      desc: 'Scene cues, alternate cuts, encores and files the game does not play.' },
];
export const ROLE_KEYS = ROLES.map(r => r.k);
export const LS_ROLES = 'origami.v8.songRoles';
const LS_VERDICT = 'origami.v8.audioVerdicts';

// Catalog songs, by id. Every catalog song not named here defaults to 'legendary' when the catalog's rarity is LEGENDARY, else 'find'. [REF#DA-00262]
const CATALOG_DEFAULT = {
    'paris-skies': 'base', 'cabaret-startup-1': 'base', 'cabaret-startup-2': 'base',
    // ⛔ SUPERSEDED 2026-10-19 by Mark: "she was playing Crimson Fan when i left cabaret - make sure its not" — akai-sensu was 'section' (dungeon BG); now 'other'. [REF#DA-00288]
    'akai-sensu': 'other', 'akai-sensu-dance': 'other',   // Stariko's Japanese Crimson Fan tracks are not music cards and not background music. [REF#DA-00289]
    'card-3': 'legendary',   // A Fine Day is legendary (2026-10-07) — an ogre room guard carries it (knowledge/design/MUSIC_CARDS_ON_ORCS_2026-10-07.md) [REF#DA-00263]
    'uta-ni-iki-french': 'other',   // her encore — the cabaret's own music, not a card [REF#DA-00264]
    'toocute-extended': 'other', 'starlette-wins': 'other',   // cues, never numbers in her set [REF#DA-00265]
};

// Tracks outside the catalog, by full path. KNOWN_FILES is also what the engine sorts into the Composer's pools. [REF#DA-00266]
const FILE_DEFAULT = [
    ['./assets/audio/music/BG_Cabaret_1.mp3',                 'cabbg'],
    ['./assets/audio/music/BG_Cabaret_2.mp3',                 'cabbg'],
    ['./assets/sounds/BG-OLD/BG-Phantasm.mp3',                'fight'],
    ['./assets/sounds/BG-OLD/Kabuki-Duel.mp3',                'fight'],
    ['./assets/sounds/BG-OLD/SilentBlade.mp3',                'fight'],
    ['./assets/sounds/BG-OLD/DevilzDuel.mp3',                 'fight'],
    ['./assets/sounds/BG-OLD/Underworld-ThemeSong-Taps.mp3',  'section'],
    ['./assets/sounds/BG-OLD/The_Withered_Gate.mp3',          'section'],
    ['./assets/sounds/BG-OLD/BG-Music-Pilgrim.mp3',           'section'],
    ['./assets/sounds/BG-OLD/Moonlit-PaperCut.mp3',           'section'],
    ['./assets/sounds/BG-OLD/Moonlit-PaperCut2.mp3',          'section'],
    ['./assets/sounds/BG-OLD/spooky-bg-music.mp3',            'section'],
    ['./assets/sounds/BG-OLD/sorahibana.mp3',                 'section'],
    ['./assets/sounds/Dungeon/BG-SpookySnackRun.mp3',         'section'],
    ['./assets/sounds/BG-OLD/Marked-Cards-at-Dawn.mp3',       'gamble'],
    ['./assets/sounds/BG-OLD/Twin-Dice-Moon.mp3',             'gamble'],
    ['./assets/sounds/BG-OLD/BG-PostParisDream.mp3',          'other'],   // the dark cabaret's afterglow after the Paris dream — its own player, not a pool [REF#DA-00267]
    ['./assets/music/boss/BOSS.mp3',                          'other'],   // the Manager's own song — his cue, not a pool [REF#DA-00268]
];
export const KNOWN_FILES = FILE_DEFAULT.map(r => r[0]);

// Tracks the game plays that the audio manifest does not list (they live outside assets/sounds, or are not in its music list), [REF#DA-00269]
// so the Music page can show them.
export const EXTRA_TRACKS = [
    { file: './assets/audio/music/BG_Cabaret_1.mp3',         title: 'CABARET BG 1',       kanji: '店' },
    { file: './assets/audio/music/BG_Cabaret_2.mp3',         title: 'CABARET BG 2',       kanji: '店' },
    { file: './assets/sounds/Dungeon/BG-SpookySnackRun.mp3', title: 'SPOOKY SNACK RUN',   kanji: '' },
    { file: './assets/music/boss/BOSS.mp3',                  title: 'BOSS — THE MANAGER', kanji: '支配人' },
];

// An old LIBRARY verdict, for a track outside the catalog. [REF#DA-00270]
const VERDICT_ROLE = { STARLETTE: 'find', CABARET: 'cabbg', COMBAT: 'fight', GAMBLING: 'gamble', GENERAL: 'section', REJECT: 'other' };

function norm(f) { let k = String(f || ''); try { k = decodeURIComponent(k); } catch (_) {} try { k = k.normalize('NFC'); } catch (_) {} return k.split('?')[0].replace(/^\.?\//, '').toLowerCase(); }   // NFC: a macOS file list spells Japanese names decomposed
function baseName(f) { return norm(f).split('/').pop(); }
function readLS(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) { return {}; } }
// Full path first, then the file name alone (the pools and the catalog spell paths differently). [REF#DA-00271]
function lookup(map, f) {
    const k = norm(f), b = baseName(f); let byName;
    for (const key of Object.keys(map || {})) { const nk = norm(key); if (nk === k) return map[key]; if (byName === undefined && nk.split('/').pop() === b) byName = map[key]; }
    return byName;
}

export function savedRoles() { return readLS(LS_ROLES); }

/** The role a track has before anyone changes it. `song` is its catalog entry, or null for a file outside the catalog. [REF#DA-00272] */
export function defaultRole(file, song) {
    if (song && song.id) {
        if (CATALOG_DEFAULT[song.id]) return CATALOG_DEFAULT[song.id];
        // `_rarityCatalog` is the catalog's own rarity, kept by the engine once a role has rewritten `rarity` (window._applyMusicRoles). [REF#DA-00273]
        const rar = ('_rarityCatalog' in song) ? song._rarityCatalog : song.rarity;
        return rar === 'LEGENDARY' ? 'legendary' : 'find';
    }
    const b = baseName(file);
    for (const [f, r] of FILE_DEFAULT) if (baseName(f) === b) return r;
    return 'other';
}

/** The role a track has now: the saved choice, else (outside the catalog) an old LIBRARY verdict, else the default. [REF#DA-00274] */
export function roleOf(file, song, saved) {
    const r = lookup(saved || savedRoles(), file);
    // A stale Music-page choice must not recreate a card the catalog has explicitly retired. [REF#DA-00290]
    if (r && ROLE_KEYS.includes(r) && !(song && song.musicCard === false && (r === 'find' || r === 'legendary'))) return r;
    if (!song) { const v = lookup(readLS(LS_VERDICT), file); if (v && VERDICT_ROLE[v]) return VERDICT_ROLE[v]; }
    return defaultRole(file, song);
}
