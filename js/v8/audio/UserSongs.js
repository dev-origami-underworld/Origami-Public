/** [REF#AU-00236]
 * UserSongs.js — THE PLAYER'S OWN SONGS, STORED IN "THE GAME'S FOLDER SYSTEM".
 *
 * Mark 2026-08-06: "allowing user to upload their own song to the games folder system. and allowing
 * them to insert an accompanying .SRT. this will feed into the starlettes song list."
 *
 * ── WHY OPFS AND NOT A REAL FOLDER ──────────────────────────────────────────────────────────────
 * This project is $0-infra freeware (see freeware_revival_mission) and `server.py` implements only
 * `do_OPTIONS` — there is no upload endpoint, and there never will be one; a browser cannot write into
 * `assets/sounds/` from here. The Origin Private File System (`navigator.storage.getDirectory()`) is
 * the real thing that phrase can mean without a server: a genuine, persistent, per-origin filesystem
 * that survives reloads and works identically in the shipped DISTRIBUTION build. See
 * knowledge/design/MUSIC_PLAYER_WINAMP_AND_USER_SONGS_PLAN.md §3 (B0) for the alternatives ruled out.
 *
 * ── ONE STORE, BOTH FRAMES ───────────────────────────────────────────────────────────────────────
 * OPFS is scoped to the ORIGIN, not the frame — this module is imported by both the music page
 * (Panels iframe, for the MY MUSIC tab's drop zone/list) and the engine (Engine9 iframe, to hydrate
 * her setlist on boot and whenever a new upload lands). Neither frame has to hand the other a Blob
 * across postMessage; each reads the bytes itself and mints its own `URL.createObjectURL`, exactly
 * the same "two separate audio surfaces" shape the rest of this codebase already uses (`_mpAudio` vs
 * `_song` in Engine9 — see the plan's T1/T5).
 *
 * ── WHAT LIVES WHERE ─────────────────────────────────────────────────────────────────────────────
 *   OPFS root
 *     └ user-songs/
 *         ├ index.json          — [{slug, title, audioFile, srtFile, seconds, size, addedAt, warning}]
 *         ├ <slug>.<ext>        — the audio, byte-for-byte as dropped
 *         └ <slug>.srt          — the paired captions, if one was dropped
 * `index.json` is the source of truth for the UI; the audio/srt files are addressed by slug, which is
 * also the SAME string used as `user://<slug>` — the stable identity SongCatalog and the caption
 * lookup need (a `blob:` URL has no stable basename — see the plan's T4).
 */

const DIR_NAME = 'user-songs';
const INDEX_FILE = 'index.json';
const MAX_BYTES = 20 * 1024 * 1024;   // 20MB cap — see plan §3 B1, keeps one dropped .wav from filling the quota [REF#AU-00237]

export function isSupported() {
    try { return !!(navigator.storage && typeof navigator.storage.getDirectory === 'function'); } catch (_) { return false; }
}

let _dirHandle = null;
async function _dir() {
    if (_dirHandle) return _dirHandle;
    const root = await navigator.storage.getDirectory();
    _dirHandle = await root.getDirectoryHandle(DIR_NAME, { create: true });
    return _dirHandle;
}

async function _readIndex() {
    try {
        const dir = await _dir();
        const fh = await dir.getFileHandle(INDEX_FILE);
        const text = await (await fh.getFile()).text();
        const list = JSON.parse(text);
        return Array.isArray(list) ? list : [];
    } catch (_) { return []; }   // no index yet, or a corrupt one — either way, empty is the safe read [REF#AU-00238]
}
async function _writeIndex(list) {
    const dir = await _dir();
    const fh = await dir.getFileHandle(INDEX_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(list));
    await w.close();
}

function _slugify(name) {
    const base = String(name || 'song').replace(/\.[^.]+$/, '')
        .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'song';
}
function _extOf(name) { const m = /\.[^.]+$/.exec(String(name || '')); return m ? m[0].toLowerCase() : ''; }
function _dedupeSlug(base, existing) {
    if (!existing.has(base)) return base;
    for (let i = 2; ; i++) { const c = base + '-' + i; if (!existing.has(c)) return c; }
}

/** A quick, DISPLAY-ONLY cue count + last-cue estimate for the upload validation UI. This is [REF#AU-00239]
 *  deliberately independent from Engine9's authoritative `_parseSrt` (an inline script cannot be
 *  imported from a module) — it only has to be good enough to warn "this looks like the wrong cut". */
export function estimateSrt(text) {
    const stamp = v => { const p = String(v || '0:0:0').replace(',', '.').split(':').map(Number); return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0); };
    const blocks = String(text || '').replace(/^﻿/, '').split(/\r?\n\r?\n+/);
    let cues = 0, lastEnd = 0;
    for (const block of blocks) {
        const line = block.split(/\r?\n/).find(l => l.includes('-->'));
        if (!line) continue;
        const [, endRaw] = line.split('-->');
        const end = stamp(String(endRaw || '').trim().split(/\s+/)[0]);
        if (end > 0) { cues++; lastEnd = Math.max(lastEnd, end); }
    }
    return { cues, lastEnd };
}

/** Duration off the audio itself (never trust a filename) — a throwaway `<audio>` element, same [REF#AU-00240]
 *  technique the engine uses for the bitrate readout. Times out rather than hanging on a bad file. */
function _probeDuration(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const el = new Audio();
        const done = (fn, arg) => { try { URL.revokeObjectURL(url); } catch (_) {} clearTimeout(t); fn(arg); };
        const t = setTimeout(() => done(reject, new Error('could not read audio duration (timed out)')), 8000);
        el.addEventListener('loadedmetadata', () => done(resolve, el.duration), { once: true });
        el.addEventListener('error', () => done(reject, new Error('not a playable audio file')), { once: true });
        el.src = url;
    });
}

/** Every uploaded song, newest first — what the MY MUSIC tab renders. [REF#AU-00241] */
export async function listSongs() {
    if (!isSupported()) return [];
    return (await _readIndex()).slice().reverse();
}

export async function quotaInfo() {
    try {
        const est = await navigator.storage.estimate();
        return { usage: est.usage || 0, quota: est.quota || 0 };
    } catch (_) { return null; }
}

/** [REF#AU-00242]
 * Validate, store, and index one upload. `audioFile`/`srtFile` are `File` objects straight off a
 * drop event or `<input type=file>` — never touched over the network. Throws with a message meant to
 * be shown to the player directly (no stack traces, no internals).
 */
export async function addSong(audioFile, srtFile) {
    if (!isSupported()) throw new Error('This browser does not support saving files here.');
    if (!audioFile) throw new Error('No audio file.');
    if (audioFile.size > MAX_BYTES) throw new Error('That file is too big (' + (audioFile.size / 1048576).toFixed(1) + 'MB) — 20MB max.');

    const seconds = await _probeDuration(audioFile);

    const list = await _readIndex();
    const existing = new Set(list.map(s => s.slug));
    const slug = _dedupeSlug(_slugify(audioFile.name), existing);
    const ext = _extOf(audioFile.name) || '.mp3';

    const dir = await _dir();
    const audioHandle = await dir.getFileHandle(slug + ext, { create: true });
    const aw = await audioHandle.createWritable();
    await aw.write(audioFile);
    await aw.close();

    let srtFileName = null, warning = null, cueCount = 0;
    if (srtFile) {
        const srtText = await srtFile.text();
        const { cues, lastEnd } = estimateSrt(srtText);
        if (!cues) {
            warning = 'The .srt had no readable cues — added without lyrics.';
        } else {
            if (lastEnd > seconds + 2) warning = 'This .srt runs past the song\'s length — it may be written for a different cut.';
            const srtHandle = await dir.getFileHandle(slug + '.srt', { create: true });
            const sw = await srtHandle.createWritable();
            await sw.write(srtText);
            await sw.close();
            srtFileName = slug + '.srt';
            cueCount = cues;
        }
    }

    const entry = {
        slug, title: audioFile.name.replace(/\.[^.]+$/, ''),
        audioFile: slug + ext, srtFile: srtFileName, cues: cueCount,
        seconds, size: audioFile.size, addedAt: Date.now(), warning,
    };
    list.push(entry);
    await _writeIndex(list);
    return entry;
}

/** The actual bytes, read fresh from OPFS — the caller mints its own `URL.createObjectURL` in [REF#AU-00243]
 *  whichever frame needs to play it (see the file header on why this is never shared as a blob: URL). */
/** [REF#AU-00244]
 * ── ADD A SONG BY URL (Mark 2026-08-07: "just add the ability for players to add their own urls (or
 *    files) to the lineup ... we can use for our own song pruning") ───────────────────────────────────
 *
 * Companion to addSong(). Stores no bytes — the entry holds the URL and playback streams it.
 *
 * ⚠ THE SCHEME CHECK IS THE WHOLE SECURITY STORY, and it matters more here than it looks: there is NO
 *   Content-Security-Policy on any of this game's three HTML files (checked 2026-08-07), so nothing
 *   downstream will catch a bad string for us. A player-supplied URL ends up in an <audio src>, and
 *   `javascript:` / `data:` / `blob:` there are an injection surface. https ONLY, no exceptions, and
 *   credentials in the URL are refused too (they would be written to disk in the index in clear).
 *
 * ⚠ THE DURATION PROBE IS NOT A FORMALITY — IT IS WHAT REJECTS A SHARE PAGE. A `suno.com/s/XXXX` link
 *   is HTML, not audio; <audio> cannot decode it and reports no duration. So the exact mistake this
 *   feature invites (pasting the page you were looking at instead of the media) fails loudly here with
 *   a message that says what to do, instead of silently adding a song that issilent.
 *
 * ⚠ A URL SONG IS NOT OFFLINE. Files survive forever in OPFS; a link dies when the host does. The entry
 *   is marked `remote:true` so any UI can say so rather than pretending the two are equivalent.
 */
export function validateSongUrl(raw) {
    const str = String(raw || '').trim();
    if (!str) throw new Error('Paste a link first.');
    let u;
    try { u = new URL(str); } catch (_) { throw new Error('That is not a valid link.'); }
    // https ONLY — except LOCALHOST, which the web platform already defines as a secure context and [REF#AU-00245]
    // which browsers trust for exactly this reason. Found by falsifying the UX rather than the logic:
    // the first thing anyone does with this feature is paste a link to their own dev server, and
    // http://127.0.0.1:5501/... was being refused. Mark's stated use ("song pruning") IS that case, so
    // the rule as written would have failed its first real user. Remote http stays refused — plain http
    // over a network is the thing the rule is actually for.
    const _local = (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.hostname === '::1');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && _local))
        throw new Error('Only https links are allowed (got "' + u.protocol + '"). Local files on this machine are fine.');
    if (u.username || u.password) throw new Error('Links with a username or password in them are not allowed.');
    // ── SUNO IS THE APPROVED SITE, AND THE ONLY ONE (Mark 2026-08-13: "suno is an approved site and you [REF#AU-00246]
    //    will enforce the fucking URL by hardcoding and only accepting the personal share link") ──────
    //    HARDCODED ON PURPOSE. The `window._userSongHostAllow` list below still exists for dev/local
    //    work, but it can no longer WIDEN this rule — it is applied on top of the Suno gate, never
    //    instead of it. A runtime-editable allowlist is not an enforcement mechanism; anything that can
    //    be set from the console is a suggestion. Mark asked for the rule to be in the source, so it is.
    //
    //    ONLY THE PERSONAL SHARE LINK SHAPE: https://suno.com/s/<id>  — the exact form every sunoUrl in
    //    SongCatalog.js takes (…/s/v4CzJ5BcyPF8Tqqi, …/s/855jNEMpfq8gO3a2). A song page, a profile, a
    //    playlist or a bare CDN file are all refused, so what lands in the index is always a link that
    //    identifies ONE clip and can be traced back to its source.
    //    Escape hatch for local dev only: localhost keeps working (see the secure-context note above),
    //    because refusing 127.0.0.1 broke the first real use of this feature once already.
    const SUNO_HOST = 'suno.com';
    const SUNO_SHARE = /^\/s\/[A-Za-z0-9_-]{6,}$/;
    if (!_local) {
        const _isSuno = (u.hostname === SUNO_HOST || u.hostname.endsWith('.' + SUNO_HOST));
        if (!_isSuno) throw new Error('Only Suno links are accepted. Paste your personal share link — https://suno.com/s/…');
        if (!SUNO_SHARE.test(u.pathname))
            throw new Error('That is a Suno link but not a personal SHARE link. Open the song, tap Share, and paste the https://suno.com/s/… link.');
        // Strip query + hash: share links pick up tracking params, and they are not part of the identity. [REF#AU-00247]
        u.search = ''; u.hash = '';
    }
    const hosts = (typeof window !== 'undefined' && Array.isArray(window._userSongHostAllow)) ? window._userSongHostAllow : null;
    if (hosts && hosts.length && !hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)))
        throw new Error(u.hostname + ' is not on the allowed list.');
    return u.href;
}

/** The clip id out of a personal share link, or null. The stable handle for a Suno song — the same id [REF#AU-00248]
 *  the catalog's `sunoUrl` entries carry, so a user-added song and an authored one identify alike. */
export function sunoShareId(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        if (u.hostname !== 'suno.com' && !u.hostname.endsWith('.suno.com')) return null;
        const m = /^\/s\/([A-Za-z0-9_-]{6,})$/.exec(u.pathname);
        return m ? m[1] : null;
    } catch (_) { return null; }
}

/** [REF#AU-00249]
 * ⚠ DO NOT SET crossOrigin HERE. Found by falsifying the UX (2026-08-07): with
 * `crossOrigin='anonymous'` the probe REQUIRES the host to send Access-Control-Allow-Origin, and most
 * audio CDNs do not. A perfectly good link then failed with "That link did not play as audio" — telling
 * the player to go find a different link when the link was fine. Confidently wrong is worse than a
 * blank refusal, because it sends someone off to fix something that was never broken.
 * The duration only needs the metadata, which plain <audio> reads cross-origin without permission.
 * CORS still MATTERS, just not here: the Winamp EQ routes through createMediaElementSource, and a
 * cross-origin element without CORS is tainted, which makes that graph output SILENCE. So we test for
 * it separately and record the answer on the entry — playback can bypass the graph rather than play
 * nothing. Never gate ADDING the song on it.
 */
function _probeCors(url) {
    return new Promise((resolve) => {
        const a = new Audio();
        a.preload = 'metadata'; a.crossOrigin = 'anonymous';
        let done = false;
        const fin = (v) => { if (done) return; done = true; clearTimeout(t); a.src = ''; resolve(v); };
        const t = setTimeout(() => fin(false), 6000);
        a.addEventListener('loadedmetadata', () => fin(true));
        a.addEventListener('error', () => fin(false));
        a.src = url;
    });
}

function _probeUrlDuration(url) {
    return new Promise((resolve, reject) => {
        const a = new Audio();
        a.preload = 'metadata';
        let done = false;
        const finish = (fn, arg) => { if (done) return; done = true; clearTimeout(t); a.src = ''; fn(arg); };
        const t = setTimeout(() => finish(reject, new Error('That link took too long to answer.')), 15000);
        a.addEventListener('loadedmetadata', () => {
            const d = a.duration;
            if (!isFinite(d) || d <= 0) return finish(reject, new Error('That link did not play as audio. If it is a share PAGE, open it and copy the direct audio link instead.'));
            finish(resolve, d);
        });
        a.addEventListener('error', () => finish(reject, new Error('That link did not play as audio. If it is a share PAGE, open it and copy the direct audio link instead.')));
        a.src = url;
    });
}

/** [REF#AU-00250]
 * ── AUTO-SRT: CUE TIMINGS STRAIGHT OFF THE AUDIO (Mark 2026-08-13: "when a new URL is provided, a
 *    feature will automatically run to autoconvert the necessary SRTs and display them automatically") ──
 *
 * THE SAME MEASUREMENT THE OFFLINE PIPELINE USES, PORTED TO WEBAUDIO. scripts/srt-from-song.py finds
 * sung stretches by RMS-sweeping a vocal band and gating 26 dB under the vocal peak; this does exactly
 * that with an OfflineAudioContext and a 300–3400 Hz bandpass. No whisper, no demucs, no server — those
 * are what make the offline script un-shippable to a browser, and neither is needed for TIMINGS.
 *
 * ⚠ WHAT IT CANNOT DO IS INVENT WORDS, and it does not pretend to. Cues carry ♪ — the same placeholder
 *   the WINNING entry already ships for its un-transcribed verses. Timings are measured; lyrics are the
 *   player's to paste. That split is this project's standing pipeline law: machine timing, human words.
 *
 * ⚠ NEEDS CORS. Reading samples requires fetch + decodeAudioData, which a host without
 *   Access-Control-Allow-Origin will refuse — the entry already records `corsOk` for exactly this class
 *   of limit. No CORS ⇒ no SRT, and the caller says so plainly rather than writing an empty file.
 *
 * Knobs: _autoSrtGateDb (26) · _autoSrtMinCueS (0.9) · _autoSrtGapS (0.45).
 */
export async function autoSrtFromUrl(url) {
    const AC = (typeof OfflineAudioContext !== 'undefined') ? OfflineAudioContext
             : (typeof webkitOfflineAudioContext !== 'undefined') ? webkitOfflineAudioContext : null;
    if (!AC) throw new Error('This browser cannot analyse audio here.');
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Could not read the audio to time the lyrics (HTTP ' + res.status + ').');
    const buf = await res.arrayBuffer();
    const tmp = new (window.AudioContext || window.webkitAudioContext)();
    let decoded;
    try { decoded = await tmp.decodeAudioData(buf.slice(0)); }
    finally { try { tmp.close(); } catch (_) {} }

    // ⚠ A LOUDNESS GATE DOES NOT WORK ON A FULL MIX, AND THE FIRST VERSION PROVED IT. Gating 26 dB under [REF#AU-00251]
    //   the vocal-band peak is what scripts/srt-from-song.py does — but it does it to a demucs-ISOLATED
    //   vocal stem, where anything loud IS the voice. Run against a real mix here it returned ONE cue
    //   covering the whole song (00:00.4 → 01:08.6 on Card 4), because guitars and snares live in
    //   300–3400 Hz too. Measured, not predicted.
    //   WHAT ACTUALLY SEPARATES SINGING is the SHARE of energy in the vocal band, not its level: a voice
    //   entering pushes the band's proportion of the whole mix up even when the track gets no louder.
    //   So render BOTH the band and the full mix, and gate on the ratio against its own distribution —
    //   a percentile, so it adapts per song instead of needing a magic absolute number per track.
    const _render = async (build) => {
        const o = new AC(1, decoded.length, decoded.sampleRate);
        const s = o.createBufferSource(); s.buffer = decoded;
        build(o, s); s.start(0);
        return (await o.startRendering()).getChannelData(0);
    };
    const band = await _render((o, s) => {
        const hp = o.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
        const lp = o.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 3400;
        s.connect(hp); hp.connect(lp); lp.connect(o.destination);
    });
    const full = await _render((o, s) => { s.connect(o.destination); });

    const sr = decoded.sampleRate, win = Math.max(1, Math.round(sr * 0.046));
    const rms = (buf, i) => { let s = 0; const n = Math.min(win, buf.length - i);
        for (let k = 0; k < n; k++) { const v = buf[i + k]; s += v * v; } return Math.sqrt(s / n); };
    const env = [], ratio = [];
    for (let i = 0; i < band.length; i += win) {
        const bE = rms(band, i), fE = rms(full, i);
        env.push(bE);
        ratio.push(fE > 1e-6 ? (bE / fE) : 0);
    }
    const peak = env.reduce((a, b) => Math.max(a, b), 0);
    if (!(peak > 0)) return { srt: '', cues: 0 };
    // Percentile threshold on the vocal SHARE — the song classifies itself. [REF#AU-00252]
    const _pct = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
    const shareQ = (typeof window !== 'undefined' && typeof window._autoSrtSharePct === 'number') ? window._autoSrtSharePct : 0.62;
    const shareGate = _pct(ratio.filter(v => v > 0), shareQ);
    // Plus a floor so near-silence between verses can never qualify on ratio alone. [REF#AU-00253]
    const gateDb = (typeof window !== 'undefined' && typeof window._autoSrtGateDb === 'number') ? window._autoSrtGateDb : 26;
    const gate = peak * Math.pow(10, -Math.abs(gateDb) / 20);
    const secPer = win / sr;
    const minCue = (typeof window !== 'undefined' && typeof window._autoSrtMinCueS === 'number') ? window._autoSrtMinCueS : 0.9;
    const maxGap = (typeof window !== 'undefined' && typeof window._autoSrtGapS === 'number') ? window._autoSrtGapS : 0.45;

    const spans = [];
    let start = -1, lastHot = -1;
    for (let i = 0; i < env.length; i++) {
        const hot = (env[i] >= gate) && (ratio[i] >= shareGate);   // loud enough AND vocal-dominant [REF#AU-00254]
        if (hot) { if (start < 0) start = i; lastHot = i; }
        else if (start >= 0 && (i - lastHot) * secPer > maxGap) {
            spans.push([start * secPer, (lastHot + 1) * secPer]); start = -1;
        }
    }
    if (start >= 0) spans.push([start * secPer, (lastHot + 1) * secPer]);

    const keep = spans.filter(([a, b]) => (b - a) >= minCue);
    const ts = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60),
                            ms = Math.round((t - Math.floor(t)) * 1000);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(ms).padStart(3, '0'); };
    const srt = keep.map(([a, b], i) => (i + 1) + '\n' + ts(a) + ' --> ' + ts(b) + '\n♪\n').join('\n');
    return { srt, cues: keep.length };
}

export async function addSongByUrl(rawUrl, title) {
    if (!isSupported()) throw new Error('This browser does not support saving songs here.');
    const url = validateSongUrl(rawUrl);
    const seconds = await _probeUrlDuration(url);        // throws with a player-readable message [REF#AU-00255]
    const corsOk = await _probeCors(url);                // never gates the add — see _probeCors header [REF#AU-00256]
    const list = await _readIndex();
    // ⚠ TITLE FROM THE PATH ONLY — NEVER THE QUERY. Measured: the previous derivation kept the query [REF#AU-00257]
    // string, so a signed CDN link like .../8f2a.mp3?token=eyJhbGciOiJIUzI1NiJ9.SECRET produced the
    // TITLE "8f2a.mp3?token=eyJhbGciOiJIUzI1NiJ9" — a credential shown in the UI and written into the
    // on-disk index. Tokens in URLs are the norm for generated audio, so this was not a corner case.
    let _fromPath = '';
    try { _fromPath = decodeURIComponent((new URL(url).pathname.split('/').pop()) || ''); } catch (_) {}
    const base = String(title || '').trim() || (_fromPath.replace(/\.[^.]+$/, '') || 'Linked song');
    let slug = 'url-' + base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!slug || slug === 'url-') slug = 'url-song';
    let n = 1, unique = slug;
    while (list.some(e => e.slug === unique)) unique = slug + '-' + (++n);
    // The share id is recorded alongside the url so a user song identifies the same way an authored one [REF#AU-00258]
    // does (SongCatalog entries carry `sunoUrl`), and so the cabaret can show a Suno-sourced title
    // knowing where it came from rather than guessing from a filename.
    const _sunoId = sunoShareId(url);
    const entry = { slug: unique, title: base, url, remote: true, corsOk, srtFile: null, cues: 0,
                    sunoId: _sunoId, sunoUrl: _sunoId ? url : null,
                    seconds: Math.round(seconds), addedAt: Date.now() };

    // ── AUTO-SRT RUNS ON EVERY ADD (Mark 2026-08-13) ──────────────────────────────────────────── [REF#AU-00259]
    //    Timed off the audio and written to OPFS beside an uploaded .srt, so the caption loader cannot
    //    tell an auto-timed song from a hand-authored one — same file, same index fields, same display.
    //    ⚠ IT NEVER FAILS THE ADD. A song that plays is worth having even if the timing pass could not
    //      run (no CORS, a codec the decoder refuses, an offline render that throws); the entry records
    //      WHY in `srtNote` instead of throwing away a working song. Silence-with-audio beats no song.
    if (corsOk) {
        try {
            const { srt, cues } = await autoSrtFromUrl(url);
            if (cues > 0) {
                const dir = await _dir();
                const h = await dir.getFileHandle(unique + '.srt', { create: true });
                const sw = await h.createWritable();
                await sw.write(srt);
                await sw.close();
                entry.srtFile = unique + '.srt';
                entry.cues = cues;
                entry.srtAuto = true;   // timings measured here, words still ♪ — see autoSrtFromUrl [REF#AU-00260]
            } else {
                entry.srtNote = 'No sung passages detected — added without lyrics.';
            }
        } catch (e) {
            entry.srtNote = 'Lyrics could not be timed automatically (' + (e && e.message || e) + ').';
        }
    } else {
        entry.srtNote = 'That host does not allow reading the audio, so lyrics could not be timed.';
    }

    list.push(entry);
    await _writeIndex(list);
    return entry;
}

/** The one place playback should ask "where do I get the audio?" — remote entries stream, files blob. [REF#AU-00261] */
export async function resolveAudioUrl(entry) {
    if (entry && entry.remote && entry.url) return entry.url;
    const blob = await readAudioBlob(entry);
    return blob ? URL.createObjectURL(blob) : null;
}

export async function readAudioBlob(entry) {
    const dir = await _dir();
    const fh = await dir.getFileHandle(entry.audioFile);
    return fh.getFile();
}
export async function readSrtText(entry) {
    if (!entry.srtFile) return null;
    try {
        const dir = await _dir();
        const fh = await dir.getFileHandle(entry.srtFile);
        return (await fh.getFile()).text();
    } catch (_) { return null; }
}

/** The `user://` identity — see the plan's T4. Stable across sessions, unlike a blob: URL. [REF#AU-00262] */
export function keyFor(entry) { return 'user://' + entry.slug; }
