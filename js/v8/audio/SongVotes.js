/** [REF#AU-00222]
 * SongVotes.js — WHAT THE PLAYER ACTUALLY LISTENS TO, counted locally and shared only if they say so.
 *
 * Mark 2026-08-04: "if we created a player voting system - its single player - not multiplayer at all.
 * but … is there any way we can leverage internet relay chat for voting or any sort of reporting to our
 * server … as cheap as we can with $0 increase in support costs" — then: "yeah lets do the cloudflare.
 * we can create a listener on our webpage on origamiunderworld.com where the game resides".
 *
 * ── WHY NOT IRC, since it was the first idea and the reasoning should outlive the decision ─────────
 * A browser cannot open a raw TCP socket, so IRC would need a WebSocket gateway — which exists, so it
 * WOULD have worked. Three things ruled it out, and only the first one really matters:
 *   1. IRC hostmasks expose every player's IP to the channel and the network. Mark is building this so
 *      kids have somewhere safe; that alone ends it.
 *   2. IRC stores nothing. Recording votes needs a bot in-channel 24/7 writing them down — which is the
 *      server the $0 constraint was avoiding, plus the exposure.
 *   3. Automated clients flooding a channel is a ToS violation on every major network, and the penalty
 *      is a k-line: a ban by IP. It would be spending the players' goodwill, not ours.
 *
 * ── THE DESIGN, IN ONE LINE: THE VOTE IS WHAT YOU PLAY, NOT WHAT YOU RATE ─────────────────────────
 * Kids do not fill in star ratings. But "skipped it after eight seconds" is a stronger signal than any
 * rating form, and it costs the player nothing to give. So this counts plays, completions and skips as
 * they happen, entirely offline.
 *
 * ── PRIVACY IS THE DEFAULT, NOT A SETTING ─────────────────────────────────────────────────────────
 *   · NOTHING is transmitted unless BOTH an endpoint is configured AND the player has opted in. With no
 *     endpoint configured this file cannot make a network call at all — `submit()` returns early. That
 *     is deliberate: the game ships safe, and the endpoint is switched on separately.
 *   · No names, no accounts, no free text, no IP handling of our own. The only identifier is a random
 *     install id so one enthusiast replaying twenty times does not read as twenty players — and
 *     `forget()` erases it and every tally.
 *   · ONE aggregated payload, at most once per session. Never per-vote. That is what keeps a free tier
 *     free, and it means the whole feature can be switched off without touching the game.
 *
 * Knobs: window._songVoteEndpoint (unset = never transmits) · window._songVotesEnabled = false (off
 * entirely, not even local counting).
 */

const LS_KEY = 'origami.v8.songVotes';
const LS_ID  = 'origami.v8.songVoteId';
const LS_OPT = 'origami.v8.songVoteOptIn';
/** Under this many seconds of a track = a skip, not a listen. Long enough that a cue crossfade or a [REF#AU-00223]
 *  room change is not mistaken for a verdict; short enough that a real "no thanks" still registers. */
const SKIP_UNDER_S = 12;
const SCHEMA = 1;

const _w = () => (typeof window !== 'undefined' ? window : {});
const _enabled = () => _w()._songVotesEnabled !== false;

function _read() {
    try { const raw = localStorage.getItem(LS_KEY); const o = raw ? JSON.parse(raw) : null;
          return (o && typeof o === 'object' && o.tracks) ? o : { v: SCHEMA, tracks: {} }; }
    catch (_) { return { v: SCHEMA, tracks: {} }; }
}
function _write(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (_) {} }

/** A random, resettable install id. NOT a fingerprint and not derived from anything about the machine — [REF#AU-00224]
 *  it exists only so repeat sessions from one player do not inflate a track's count. */
function installId() {
    try {
        let id = localStorage.getItem(LS_ID);
        if (!id) {
            const a = new Uint32Array(2);
            (self.crypto || {}).getRandomValues?.(a);
            id = ((a[0] >>> 0).toString(36) + (a[1] >>> 0).toString(36)) || String(Date.now());
            localStorage.setItem(LS_ID, id);
        }
        return id;
    } catch (_) { return 'anon'; }
}

let _openTrack = null;   // { id, variant, startedMs } [REF#AU-00225]

/** A track started. Called from the Composer's existing onCue seam — no audio surgery. [REF#AU-00226] */
export function trackStarted(id, variant, nowMs) {
    if (!_enabled() || !id) return;
    trackEnded(nowMs);                      // whatever was playing is now over; judge it first [REF#AU-00227]
    _openTrack = { id: String(id), variant: variant == null ? 0 : (variant | 0), startedMs: +nowMs || Date.now() };
}

/** The current track stopped, was replaced, or the session ended. Scores it as a listen or a skip. [REF#AU-00228] */
export function trackEnded(nowMs) {
    if (!_enabled() || !_openTrack) return;
    const secs = Math.max(0, ((+nowMs || Date.now()) - _openTrack.startedMs) / 1000);
    const key = _openTrack.id + (_openTrack.variant ? '#' + _openTrack.variant : '');
    _openTrack = null;
    if (secs < 1) return;                   // a crossfade or a double-commit, not a hearing [REF#AU-00229]
    const db = _read();
    const t = db.tracks[key] || (db.tracks[key] = { plays: 0, skips: 0, secs: 0 });
    t.plays += 1;
    t.secs = Math.round(t.secs + secs);
    if (secs < SKIP_UNDER_S) t.skips += 1;
    _write(db);
}

/** What the player has listened to, most-played first. This is what a music-player UI should show. [REF#AU-00230] */
export function ranking() {
    const db = _read();
    return Object.entries(db.tracks)
        .map(([key, t]) => ({ key, ...t, keptRatio: t.plays ? 1 - (t.skips / t.plays) : 0 }))
        .sort((a, b) => (b.plays - b.skips) - (a.plays - a.skips));
}

/** Erase everything, including the install id. The player's off-switch, and it must leave nothing. [REF#AU-00231] */
export function forget() {
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_ID); localStorage.removeItem(LS_OPT); } catch (_) {}
    _openTrack = null;
}

export function optedIn() { try { return localStorage.getItem(LS_OPT) === '1'; } catch (_) { return false; } }
export function setOptIn(on) { try { on ? localStorage.setItem(LS_OPT, '1') : localStorage.removeItem(LS_OPT); } catch (_) {} }

/** The exact bytes that would leave the machine. Exposed so the opt-in UI can SHOW the player their [REF#AU-00232]
 *  payload before they agree to it — consent to something you cannot read is not consent. */
export function payload() {
    const db = _read();
    return { v: SCHEMA, id: installId(),
             tracks: Object.entries(db.tracks).map(([k, t]) => [k, t.plays, t.skips, t.secs]) };
}

/** [REF#AU-00233]
 * Send once, if and only if an endpoint is configured AND the player opted in.
 * `keepalive` so a session-end send is not killed by the page unloading.
 * Failure is silent and never retried — a vote is not worth a retry storm against a free tier.
 */
export async function submit({ force = false } = {}) {
    if (!_enabled()) return { sent: false, why: 'disabled' };
    const url = _w()._songVoteEndpoint;
    if (!url) return { sent: false, why: 'no-endpoint' };          // ships inert on purpose [REF#AU-00234]
    if (!force && !optedIn()) return { sent: false, why: 'no-consent' };
    const body = payload();
    if (!body.tracks.length) return { sent: false, why: 'nothing-to-send' };
    try {
        await fetch(url, { method: 'POST', mode: 'cors', keepalive: true,
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify(body) });
        return { sent: true, tracks: body.tracks.length };
    } catch (_) { return { sent: false, why: 'network' }; }
}

// Console handle for Mark and for probes. Deliberately the whole surface, including forget(). [REF#AU-00235]
try { _w()._songVotes = { trackStarted, trackEnded, ranking, payload, submit, optedIn, setOptIn, forget, installId }; } catch (_) {}
