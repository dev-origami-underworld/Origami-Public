#!/usr/bin/env node
/*
 * build-audio-manifest.js — EVERY AUDIO FILE ON DISK, SO MARK CAN TRIAGE THEM.
 *
 * Mark 2026-08-05: "lets make sure we list out what songs we have in the songs folder, some are okay
 * and some aren't so just list them and I'll checkmark what is what if you have a selector for each".
 *
 * ── WHY THIS IS A BUILD STEP AND NOT A RUNTIME SCAN ─────────────────────────────────────────────
 * A browser cannot list a directory. The game can only know a file exists if something told it, and
 * today the only thing that tells it is SongCatalog.js — which is precisely the problem: the catalog
 * lists SIX tracks while the disk holds many more, so anything uncatalogued is invisible to everyone
 * including Mark. This walks the disk and writes that list into a module the page can import.
 *
 * ── IT REPORTS WHAT IS *NOT* WIRED, WHICH IS THE POINT ──────────────────────────────────────────
 * Each entry is marked `inCatalog` by matching against the catalog's ACTUAL `file:`/`continuation:`
 * values — not by filename similarity. That distinction matters: an earlier inventory in this project
 * reported TooCute-2/3 as "in roster" when they were only matching a COMMENT, and the mistake survived
 * into a handoff. Parsed from the real strings here.
 *
 * ── MUSIC vs SFX ────────────────────────────────────────────────────────────────────────────────
 * Split by DURATION, not by folder: assets/sounds/Dungeon holds both `Underworld-ThemeSong-Taps.mp3`
 * and `click.mp3`. Anything under `SFX_UNDER_S` is tagged sfx and kept out of the triage list, so Mark
 * is not asked to grade a door click. The threshold is recorded in the output so a wrong call is
 * visible rather than mysterious.
 *
 * Usage: node scripts/build-audio-manifest.js         (writes js/v8/data/AudioManifest.js)
 *        node scripts/build-audio-manifest.js --print (dry run, prints the table)
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'js/v8/data/AudioManifest.js');
const SFX_UNDER_S = 30;
// BG-OLD joined the scan 2026-08-13 (Mark: "all those are background music. cards, put them in a
// BG-OLD folder"). It must be scanned, not skipped: the retired tracks are still PLAYING — Composer.js
// prefixes eleven of them — so dropping them from the manifest would make the SONGS page report the
// dungeon's live background rotation as files that do not exist.
const SCAN = ['assets/sounds/Songs', 'assets/sounds/Dungeon', 'assets/sounds/BG-OLD'];

const walk = (dir, acc = []) => {
    let ents = [];
    try { ents = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch (_) { return acc; }
    for (const e of ents) {
        const rel = dir + '/' + e.name;
        if (e.isDirectory()) walk(rel, acc);
        else if (/\.(mp3|ogg|wav|m4a)$/i.test(e.name)) acc.push(rel);
    }
    return acc;
};

const durationOf = (rel) => {
    try {
        const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', path.join(ROOT, rel)], { encoding: 'utf8' });
        const d = parseFloat(out.trim());
        return isFinite(d) ? Math.round(d * 10) / 10 : null;
    } catch (_) { return null; }
};

(async () => {
    // The catalog's real wiring — file: and continuation: values only.
    const catSrc = fs.readFileSync(path.join(ROOT, 'js/v8/data/SongCatalog.js'), 'utf8');
    const wired = new Set();
    for (const m of catSrc.matchAll(/(?:file|continuation|captions|continuationCaptions):\s*'([^']+)'/g)) {
        wired.add(m[1].replace(/^\.\//, ''));
    }

    // ── PARTS OF ONE SONG, NOT SEPARATE SONGS (Mark 2026-08-05) ─────────────────────────────────
    //    "the songs with a -1 -2 -3 are chorus to those same songs so always group those together."
    //    This corrects a real misreading on my side: I had TooCute-1/2/3 down as alternate TAKES to
    //    cycle between. They are SECTIONS of one piece, so they group under one family and carry a
    //    part number — the game should treat them as one song in several files, the way 黄泉の宿
    //    already is via `continuation:`.
    //    Handles the three shapes actually on disk: `-2`, `2` glued to the name (Moonlit-PaperCut2),
    //    and ` (1)`. Anything else keeps its own name as its family, which is the safe default.
    const familyOf = (base) => {
        let f = base
            .replace(/\s*\((\d+)\)\s*$/, '')     // "黄泉の宿 (1)"
            .replace(/[-_]\d+$/, '')             // "地獄越え-2"
            .replace(/(?<=[a-z぀-ヿ一-龯])\d+$/i, '');   // "Moonlit-PaperCut2"
        return f.trim() || base;
    };
    const partOf = (base) => {
        const m = base.match(/\((\d+)\)\s*$/) || base.match(/[-_](\d+)$/) || base.match(/(?<=[a-z぀-ヿ一-龯])(\d+)$/i);
        return m ? parseInt(m[1], 10) : null;
    };
    // ── JAPANESE-LANGUAGE TUNES (Mark 2026-08-05) ────────────────────────────────────────────────
    //    "I have some japanese only tunes, which we would only play to those who have japanese
    //    language selected on the browser, but will allow all players to hear them."
    //    Detected by script in the FILENAME — a guess, and marked as one. It is a starting point so
    //    the behaviour can exist today; Mark's selector overrides any track it gets wrong.
    const JP_RE = /[぀-ゟ゠-ヿ一-龯]/;

    const files = SCAN.flatMap(d => walk(d)).sort();
    const rows = files.map(rel => {
        const dur = durationOf(rel);
        const isSfx = dur != null && dur < SFX_UNDER_S;
        const base = path.basename(rel).replace(/\.[a-z0-9]+$/i, '');
        return {
            file: './' + rel,
            name: base,
            dir: path.dirname(rel).replace('assets/sounds/', ''),
            seconds: dur,
            kind: isSfx ? 'sfx' : 'music',
            family: familyOf(base),
            part: partOf(base),
            lang: JP_RE.test(base) ? 'ja' : null,
            inCatalog: wired.has(rel),
            bytes: (() => { try { return fs.statSync(path.join(ROOT, rel)).size; } catch (_) { return 0; } })(),
        };
    });

    const music = rows.filter(r => r.kind === 'music');
    const unwired = music.filter(r => !r.inCatalog);

    if (process.argv.includes('--print')) {
        console.log(`\n${music.length} music file(s), ${rows.length - music.length} sfx (< ${SFX_UNDER_S}s)\n`);
        const fams = new Map();
        for (const r of music) { const a = fams.get(r.family) || []; a.push(r); fams.set(r.family, a); }
        for (const [fam, parts] of fams) {
            const jp = parts.some(p => p.lang === 'ja') ? ' [JA]' : '';
            if (parts.length === 1) console.log(`  ${parts[0].inCatalog ? '✓' : ' '} ${String(parts[0].seconds ?? '?').padStart(6)}s  ${fam}${jp}`);
            else {
                const tot = parts.reduce((s2, p) => s2 + (p.seconds || 0), 0);
                console.log(`  ${'∙'} ${String(Math.round(tot)).padStart(6)}s  ${fam}${jp}   ← ${parts.length} parts: ${parts.map(p => p.part ?? '?').join(',')}`);
            }
        }
        console.log(`\n  ${unwired.length} music file(s) NOT in the catalog — invisible to the game today.\n`);
        return;
    }

    const body = `/**
 * AudioManifest.js — GENERATED. Do not hand-edit; run \`node scripts/build-audio-manifest.js\`.
 *
 * Mark 2026-08-05: "lets make sure we list out what songs we have in the songs folder, some are okay
 * and some aren't so just list them and I'll checkmark what is what if you have a selector for each".
 *
 * A browser cannot list a directory, so this is the disk's contents frozen into a module. It exists so
 * the music page can show Mark EVERY track, including the ${unwired.length} that no code references yet —
 * those are invisible to the game and were invisible to him until this file existed.
 *
 * \`inCatalog\` is matched against SongCatalog's real file:/continuation: strings, never by filename
 * similarity: an earlier inventory in this project reported TooCute-2/3 as wired when they were only
 * matching a comment, and that error travelled into a handoff.
 *
 * \`kind\` splits music from sfx by DURATION (< ${SFX_UNDER_S}s = sfx), not by folder — assets/sounds/Dungeon
 * holds both a theme song and a door click, so folder is not a signal.
 *
 * Counts at generation: ${music.length} music, ${rows.length - music.length} sfx, ${unwired.length} music files uncatalogued.
 */
export const SFX_UNDER_S = ${SFX_UNDER_S};

export const AUDIO_FILES = Object.freeze([
${rows.map(r => `    { file: ${JSON.stringify(r.file)}, name: ${JSON.stringify(r.name)}, dir: ${JSON.stringify(r.dir)}, seconds: ${r.seconds}, kind: '${r.kind}', family: ${JSON.stringify(r.family)}, part: ${r.part}, lang: ${r.lang ? "'" + r.lang + "'" : 'null'}, inCatalog: ${r.inCatalog} },`).join('\n')}
]);

/** Just the tracks worth grading — sfx excluded so nobody is asked to rate a door click. */
export const MUSIC_FILES = Object.freeze(AUDIO_FILES.filter(f => f.kind === 'music'));

/**
 * Songs, not files: parts sharing a family collapse into ONE entry with its parts in order.
 * Mark 2026-08-05 — "the songs with a -1 -2 -3 are chorus to those same songs so always group those
 * together." A player should see 地獄越え once, not four times.
 */
export const SONG_GROUPS = Object.freeze((() => {
    const by = new Map();
    for (const f of MUSIC_FILES) {
        const g = by.get(f.family) || { family: f.family, parts: [], lang: f.lang, seconds: 0 };
        g.parts.push(f);
        g.seconds += (f.seconds || 0);
        if (f.lang) g.lang = f.lang;
        by.set(f.family, g);
    }
    for (const g of by.values()) g.parts.sort((a, b) => (a.part || 0) - (b.part || 0));
    return [...by.values()];
})());

export default AUDIO_FILES;
`;
    fs.writeFileSync(OUT, body);
    console.log(`wrote ${path.relative(ROOT, OUT)} — ${music.length} music, ${rows.length - music.length} sfx, ${unwired.length} uncatalogued`);
})();
