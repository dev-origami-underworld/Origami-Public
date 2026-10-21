/**
 * song-votes.js — Cloudflare Worker: the $0 listener for Origami Underworld's song votes.
 *
 * Mark 2026-08-04: "yeah lets do the cloudflare. we can create a listener on our webpage on
 * origamiunderworld.com where the game resides (as well as git distribution)."
 *
 * WHY THIS SHAPE. The game is freeware with a $0 support-cost rule, and it is played by kids. Both
 * constraints point the same way: take as little as possible, take it once, and make it impossible for
 * this endpoint to become an operational burden.
 *
 *   · FREE TIER, WITH ROOM TO SPARE. Workers give 100k requests/day and KV a free allowance. The client
 *     sends ONE aggregated payload per session, not one per vote, so a thousand players a day is a
 *     thousand requests. There is no plausible growth curve for a freeware game that leaves the free
 *     tier — and if one arrives, the endpoint can be switched off without touching the game.
 *   · NO PII, ENFORCED HERE AND NOT JUST PROMISED CLIENT-SIDE. The only accepted fields are a schema
 *     version, a random install id and an array of [trackKey, plays, skips, secs]. Anything else is
 *     dropped. A client cannot smuggle a name or free text through a field this endpoint does not read.
 *   · WE DO NOT STORE IP ADDRESSES. Cloudflare terminates the connection and sees the IP; we never read
 *     CF-Connecting-IP and never write it. The stored record cannot be traced back to a person by us.
 *   · WRITE-ONLY IN PUBLIC. There is no GET. Nobody can read the tallies back out over the internet;
 *     Mark reads them from the KV dashboard or with wrangler. A public read endpoint on a kids' game is
 *     a liability with no upside.
 *
 * DEPLOY (once, ~5 minutes):
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler kv namespace create SONG_VOTES
 *   3. put the returned id into wrangler.toml (see workers/wrangler.toml.example)
 *   4. wrangler deploy
 *   5. in the game: window._songVoteEndpoint = 'https://<worker>.workers.dev/vote'
 *      (or route it at votes.origamiunderworld.com so it shares the game's origin)
 *
 * UNTIL STEP 5 THE GAME TRANSMITS NOTHING. SongVotes.submit() returns early with 'no-endpoint'.
 */

const ALLOWED_ORIGINS = [
  'https://origamiunderworld.com',
  'https://www.origamiunderworld.com',
];
const MAX_BODY = 16 * 1024;   // an aggregated payload is ~1KB; this is a generous ceiling, not a target
const MAX_TRACKS = 200;

const cors = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST')    return new Response('POST only', { status: 405, headers: cors(origin) });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response('bad origin', { status: 403, headers: cors(origin) });

    const raw = await request.text();
    if (raw.length > MAX_BODY) return new Response('too large', { status: 413, headers: cors(origin) });

    let body; try { body = JSON.parse(raw); } catch (_) { return new Response('bad json', { status: 400, headers: cors(origin) }); }

    // ── WHITELIST THE SHAPE. Read only what we expect; everything else is discarded unread, so a
    //    malformed or malicious client cannot get an unexpected field into storage.
    const id = String(body.id || '').slice(0, 32).replace(/[^a-z0-9]/gi, '');
    const rows = Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
    if (!id || !rows.length) return new Response('empty', { status: 400, headers: cors(origin) });

    const clean = [];
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 4) continue;
      const key = String(r[0]).slice(0, 64).replace(/[^a-z0-9#\-_]/gi, '');
      const plays = Math.max(0, Math.min(100000, r[1] | 0));
      const skips = Math.max(0, Math.min(100000, r[2] | 0));
      const secs  = Math.max(0, Math.min(10000000, r[3] | 0));
      if (key) clean.push([key, plays, skips, secs]);
    }
    if (!clean.length) return new Response('empty', { status: 400, headers: cors(origin) });

    // ── ONE KEY PER INSTALL, OVERWRITTEN. A player who submits twice replaces their own row rather
    //    than adding a second — the counts are already cumulative client-side, so overwriting is what
    //    keeps the totals honest AND caps storage at one record per install.
    try {
      await env.SONG_VOTES.put(`v1:${id}`, JSON.stringify({ t: clean, at: Date.now() }));
    } catch (_) {
      return new Response(null, { status: 204, headers: cors(origin) });   // never make the game care
    }
    return new Response(null, { status: 204, headers: cors(origin) });
  },
};
