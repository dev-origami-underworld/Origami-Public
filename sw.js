/** [REF#CR-00102]
 * sw.js — Origami Underworld Service Worker (OFFLINE PLAY, FRESH CODE)
 *
 * ⛔ THIS FILE WAS GUTTED BY THE ROGUE ATTACK, AND THE ORDER IT CITED NEVER EXISTED.
 *    The previous header claimed `MODE: NO-CACHE PASS-THROUGH — user mandate 2026-05-26 "add
 *    no-caching for this entire game"`. Mark identified that on 2026-09-04 as the rogue attack; no
 *    order of his ever mandated no-caching. Offline play is, and was, the requirement.
 *
 *    VERIFIED IN GIT BEFORE THIS HEADER WAS WRITTEN, not taken on report: the gutting and its forged
 *    attribution both entered in 777d6873, a commit titled "feat: OniBaba wager protocol — guard
 *    assignment, WAGER_STARTED/RESULT/ENDED events, stand_guard + protect_wager AI states". That
 *    message describes wager and monster-AI work and does not mention the service worker anywhere.
 *    A destructive change smuggled inside an unrelated feature commit, wearing a quote from the one
 *    person who could have contradicted it — and the quote is what kept it alive for three months,
 *    because every seat that read this file deferred to it instead of checking it.
 *
 *    WHAT THE FORGERY COST: the worker deleted every cache and then unregistered ITSELF, so the game
 *    could not survive a disconnect and could never repair that on its own.
 *
 * ── WHAT THIS FILE DOES NOW, and why it is not simply the pre-attack version restored ──────────────
 *    Serving everything from cache is what produces ghost UI — a browser running an old build while
 *    the tree has moved on. That failure is real and is why the `?v=` token discipline exists. It is
 *    also not a reason to have no cache at all; the two goals only conflict if every request is
 *    treated alike.
 *
 *    CODE (.html/.js/.mjs/.json/.css) → NETWORK FIRST, cache only as a fallback.
 *        While a server is reachable the network ALWAYS wins, so a running dev server is served
 *        exactly as before and no seat can be handed a stale build. The cached copy is reached only
 *        when the network genuinely fails — which is the disconnected case and nothing else.
 *    ASSETS (sounds/fonts/textures/models/images) → CACHE FIRST, filled on first use.
 *        These are what make the game unplayable when the server goes away. They are large and they
 *        change rarely; a changed asset ships with a CACHE bump like everything else.
 *
 * NOT PRECACHED AT INSTALL, DELIBERATELY: the asset tree is very large (156 font files alone). A
 *    precache list would stall install, go stale silently, and be one more thing to forget. Runtime
 *    caching stores exactly what the game actually asked for.
 *
 * BUMPING `CACHE` DROPS EVERY OLD ENTRY — the same one-line ritual, for the same reason.
 */
const CACHE = "origami-v8-2026-10-21-card-compile-finish-2743";

// Anything on this list is CODE and must never be served stale while a server can be reached. [REF#CR-00103]
const _isCode = (url) => /\.(html|js|mjs|json|css)(\?|$)/i.test(url);

self.addEventListener('install', (event) => {
    self.skipWaiting();          // a new worker takes over immediately, as before [REF#CR-00104]
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Drop every cache that is not the current one — this is what a CACHE bump means. [REF#CR-00105]
        try {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        } catch (_) {}
        // ⚠ NO self.registration.unregister() HERE. The old file unregistered itself on purpose so [REF#CR-00106]
        //   that nothing was cached ever again; a worker that removes itself cannot serve anything
        //   offline, so keeping it registered IS the feature.
        try { await self.clients.claim(); } catch (_) {}
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    // Only GET is cacheable, and only same-origin: a cross-origin opaque response cannot be validated [REF#CR-00107]
    // and would poison the cache with something we cannot inspect.
    if (req.method !== 'GET') return;
    let sameOrigin = false;
    try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (_) { return; }
    if (!sameOrigin) return;

    if (_isCode(req.url)) {
        // NETWORK FIRST — freshness wins whenever the network answers at all. [REF#CR-00108]
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                if (fresh && fresh.ok) {
                    try { const c = await caches.open(CACHE); await c.put(req, fresh.clone()); } catch (_) {}
                }
                return fresh;
            } catch (_) {
                // The disconnected case, and the only time a cached build is ever served. [REF#CR-00109]
                const hit = await caches.match(req);
                if (hit) return hit;
                // ⚠ SECOND CHANCE, OFFLINE ONLY: match again IGNORING the ?v= token. A module fetched [REF#CR-00110]
                //   during the very first visit is requested before this worker has claimed the page,
                //   so it never entered the cache under that exact URL; after a token bump the exact
                //   match then misses forever and the game dies offline on a file it has run happily
                //   for weeks. Measured: i18n.js, OniBaba8.js and gitVersion.js failed for precisely
                //   this reason. Serving a slightly older module beats not starting, and this branch
                //   is unreachable while any network exists — freshness online is untouched.
                const loose = await caches.match(req, { ignoreSearch: true });
                if (loose) return loose;
                throw new Error('offline and not cached: ' + req.url);
            }
        })());
        return;
    }

    // ASSETS — CACHE FIRST, fill on first use. [REF#CR-00111]
    event.respondWith((async () => {
        const hit = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) {
                try { const c = await caches.open(CACHE); await c.put(req, fresh.clone()); } catch (_) {}
            }
            return fresh;
        } catch (err) {
            // No cached copy and no network: let the caller see a real failure rather than a lie. [REF#CR-00112]
            throw err;
        }
    })());
});
