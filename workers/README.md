# Song votes — the $0 listener

Mark, 2026-08-04: *"if we created a player voting system - its single player - not multiplayer at all.
but … is there any way we can leverage internet relay chat for voting or any sort of reporting to our
server … as cheap as we can with $0 increase in support costs"* → *"yeah lets do the cloudflare. we can
create a listener on our webpage on origamiunderworld.com where the game resides."*

This is that listener. It exists to answer one question — **which songs do kids actually keep playing?** —
so the soundtrack can grow toward what they like, without anyone paying for a server and without a single
player being identified.

---

## The shape of it

```
game (offline, always)          →  localStorage tallies
  └─ IF endpoint set AND opted in  →  ONE POST per session  →  Worker  →  KV
```

- **The game ships inert.** `js/v8/audio/SongVotes.js` counts locally from the Composer's `onCue` seam.
  It cannot make a network call until `window._songVoteEndpoint` is set **and** the player opts in.
  Neither is true by default, so **out of the box nothing is transmitted, ever.**
- **One aggregated POST per session**, never per vote. That is what keeps the free tier free: Cloudflare's
  free Workers plan is 100k requests/day, and one request per player-session is nowhere near it.
- **Nothing personal is collected**, and the Worker deliberately does not read `CF-Connecting-IP`.

## What the payload is — the whole thing

```json
{ "v": 1, "id": "<random install id>", "tracks": [ ["TrackName", plays, skips, secs] ] }
```

No name, no account, no free text, no device info, no IP of our own recording. The install id is random,
is not derived from anything about the machine, and exists only so one enthusiast replaying twenty times
does not read as twenty players. `window._songVotes.forget()` erases it and every tally.

`window._songVotes.payload()` returns these exact bytes, so an opt-in dialog can **show the player what
would be sent before they agree.** Consent to something you cannot read is not consent.

## Deploy

```bash
npm i -g wrangler && wrangler login
wrangler kv namespace create SONG_VOTES          # note the id it prints
cp workers/wrangler.toml.example workers/wrangler.toml
#   → paste the namespace id into workers/wrangler.toml
wrangler deploy --config workers/wrangler.toml
```

`wrangler.toml` is `.example` in the repo on purpose — the real one carries a namespace id and is not
committed.

Then, and **only** when you want collection live, set the endpoint on the page that hosts the game
(origamiunderworld.com), alongside an opt-in the player can decline:

```html
<script>window._songVoteEndpoint = 'https://song-votes.<your-subdomain>.workers.dev/';</script>
```

⚠ **Setting the endpoint alone still transmits nothing.** The player must also opt in
(`window._songVotes.setOptIn(true)`). That ordering is deliberate and is covered by
`scripts/probe-song-votes.js`, which fails if configuring the endpoint starts traffic on its own.

## Reading the results

```bash
wrangler kv key list   --binding SONG_VOTES --config workers/wrangler.toml
wrangler kv key get    --binding SONG_VOTES --config workers/wrangler.toml "v1:<id>"
```

One key per install, overwritten on re-submit, so a player's twentieth session replaces their first
rather than stacking. Totals are a sum across keys.

## What the Worker refuses

- Any origin other than `origamiunderworld.com` / `www.origamiunderworld.com` (edit `ALLOWED_ORIGINS`).
- Any method other than `POST` / `OPTIONS`. **There is no `GET`** — the tallies cannot be read back out
  over HTTP, only via `wrangler` with the account key.
- Bodies over 16 KB, or more than 200 tracks.
- Any field outside `[key, plays, skips, secs]` — the payload is re-built from a whitelist, so an
  unexpected key is dropped rather than stored.

It always answers `204`, even on rejection. A vote is not worth telling the game about, and a silent
endpoint is not worth probing.

## Turning it off

Remove the `window._songVoteEndpoint` line from the site. The game returns to counting locally with no
code change, no redeploy, and no version bump. That is why the endpoint lives on the page and not in the
game.

## Why not IRC (the first idea)

A browser cannot open a raw TCP socket, so IRC would have needed a WebSocket gateway — those exist, so it
*would* have worked. It was ruled out because **IRC hostmasks expose every player's IP** to the channel
and the network, and Mark is building this so kids are safe. Secondarily: IRC stores nothing, so it would
still have needed a bot running 24/7 — the very server the $0 constraint was avoiding — and automated
clients flooding a channel is a ToS violation on every major network, penalised by an IP-level ban.

## Verify

```bash
node scripts/probe-song-votes.js
```

Boots the real game and watches **every request the browser makes**, from any source — a negative claim
cannot be proved by asking the module, only by watching the wire. It checks that a real song is recorded
end-to-end, that skips and listens are told apart, that no endpoint means no traffic, that an endpoint
without consent means no traffic, that consent works, and that `forget()` leaves nothing behind.

**Known, pre-existing, NOT this feature:** the probe reports ~18 Google Fonts requests per boot
(`fonts.googleapis.com`, `fonts.gstatic.com`). Every player's IP reaches Google before they press a key.
That comes from the CLAUDE.md typography guideline, predates this work, and is Mark's call — self-hosting
the four families would close it.
