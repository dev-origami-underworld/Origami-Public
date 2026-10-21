/* ChatResponder.js — the cube-cell stage in front of Starlette's ELIZA. [REF#CR-00002]
 *
 * Mark 2026-09-03: "lets bring him to life so all disabled kids can play a 3d game for the first
 * time!!!" (RASA returns) and "consider it all pre-compiled which is superior to any outside service"
 * and "trust me - we live in zero trust - that damn cube prevents abuse -- crc sha -- you see?"
 *
 * THE ORDER, and it is deliberate:
 *      1. the language cube's authored cell for this input   ← per-speaker, per-topic, no-repeat
 *      2. Starlette's ELIZA (Panels ~:22123, Mark GO 2026-08-09)   ← the living fall-back
 *      3. never silence
 *
 * ⚠ THIS IS AN ENHANCEMENT ON A LIVE PATH, NOT A REPAIR OF A DEAD ONE. Measured 2026-09-03: the
 *   Panels fall-through DOES run and ELIZA DOES answer — the replies were being held by the
 *   guidebook gate (`#welcome-guide-overlay.is-open` → `_eventLogQueue`), which is Mark's and is
 *   correct. Nothing here bypasses that gate; a reply this file produces is queued and flushed by
 *   exactly the same rules as hers.
 *
 * ⚠ A PENDING CELL RETURNS NOTHING AND FALLS THROUGH TO HER. Most cells are declared-but-unwritten
 *   until Mark has read the lines; `ChatRouter` reports those as `pending`, and the correct
 *   behaviour is to let the living voice answer rather than to invent one or to go quiet.
 *
 * ⚠ THE KID'S TEXT NEVER LEAVES THIS FILE. Nothing here echoes, stores, or renders what was typed —
 *   the caller renders the ANSWER, which is authored content. Player text belongs in textContent
 *   only, never in the HTML log lane (Origami.RealityEngine.9.html ~:62702 / ~:62686 build log HTML by
 *   interpolation; that lane is for authored strings and nothing else).
 *
 * ⚠ NO NETWORK BEYOND THE CUBE ITSELF, which is a static same-origin file. No model, no service.
 */
(function (global) {
  'use strict';

  let _router = null;
  let _state = 'idle';        // idle | loading | ready | failed
  let _verified = null;       // true | false | null (could not check)
  let _err = null;

  // ── SHA-256 VERIFY, MIRRORING gate:dist's VERIFY-THE-ARTIFACT PATTERN ───────────────────────
  //    Mark's zero-trust point: the cube is hashable, so one review of the corpus is a review of
  //    every conversation any child will ever have. The sidecar is fetched beside the artifact and
  //    compared.
  //    ⚠ A FAILED CHECK IS REPORTED, NOT SWALLOWED — and it does NOT stop the game: the responder
  //      simply stands down and Starlette answers, which is the same outcome as no cube at all.
  //      Silently trusting an unverified cube would make the hash decorative.
  //    ⚠ `crypto.subtle` is absent outside secure contexts. That is `_verified = null` — UNKNOWN,
  //      which is a third state and must never be reported as verified.
  async function _sha256Hex(text) {
    if (!global.crypto || !global.crypto.subtle) return null;
    const buf = new TextEncoder().encode(text);
    const dig = await global.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(dig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function load(opts) {
    const o = opts || {};
    const base = o.base || 'dist/';
    if (_state === 'loading' || _state === 'ready') return _state;
    _state = 'loading';
    try {
      const res = await fetch(base + 'language-cube.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('cube HTTP ' + res.status);
      const text = await res.text();

      try {
        const sres = await fetch(base + 'language-cube.sha256', { cache: 'no-cache' });
        if (sres.ok) {
          const want = String(await sres.text()).trim().split(/\s+/)[0].toLowerCase();
          const got = await _sha256Hex(text);
          _verified = (got === null) ? null : (got === want);
          if (_verified === false) throw new Error('cube sha mismatch: sidecar ' + want.slice(0, 16)
            + '… but the file hashes to ' + String(got).slice(0, 16) + '…');
        }
      } catch (e) {
        if (/sha mismatch/.test(e.message)) throw e;      // a real mismatch is fatal
        _verified = null;                                  // could not check — say so, do not claim
      }

      const cube = JSON.parse(text);
      _router = global.ChatRouter.createRouter(cube, { seed: o.seed });
      _state = 'ready';
    } catch (e) {
      _err = e && e.message; _state = 'failed'; _router = null;
      try { console.warn('[ChatResponder] cube not loaded (' + _err + ') — Starlette answers alone.'); } catch (_) {}
    }
    return _state;
  }

  /** The authored answer for `text`, or null when the cube has nothing to say and she should. */
  function answer(text) {
    if (_state !== 'ready' || !_router) return null;
    // ⚠ CLASSIFY FIRST, DRAW ONLY IF WE KEEP IT. `respond()` pops a card off the cell's shuffled bag
    //   as part of answering — so calling it and then discarding the result BURNS a line from that
    //   deck for a reply nobody ever reads. Invisible, and it would quietly cycle RASA's general deck
    //   on every unmatched sentence in the game. Deciding before drawing costs one extra call and
    //   keeps the no-repeat guarantee honest.
    let c = null;
    try { c = _router.classify(text); } catch (_) { return null; }
    if (!c || !c.cell) return null;
    // ⛔⛔ THE CUBE'S FALLBACK MUST NOT PREEMPT HER, AND THIS COST A RUN TO LEARN. `ChatRouter`
    //    answers an unmatched input from `fallbackCell` — RASA's 50-line comedy deck — which is
    //    correct FOR THE ROUTER (never an error, comedy is the default). It is wrong HERE: this
    //    stage sits in front of a living ELIZA, so returning the fallback means every sentence no
    //    bucket claims is answered by the lawyer instead of by Starlette.
    //    MEASURED, battery run 5: "sing for me please" → 👺 RASA's terms-and-conditions
    //    hobbledygook. A child asked the singer to sing and got legal advice. "help" went the same
    //    way. Nothing was mis-MATCHED — both matched nothing at all, and "nothing" was being voiced
    //    by the wrong character.
    //    ⚠ THE FALLBACK IS NOT DELETED, it is just not allowed to jump the queue: a bucket that
    //      routes to `rasa.general` on purpose still gets it, and the router's own never-an-error
    //      contract is untouched for every other consumer. Unmatched conversation belongs to the
    //      voice that can actually converse.
    if (c.reason === 'fallback') return null;
    let r = null;
    try { r = _router.respond(text); } catch (_) { return null; }
    if (!r || r.pending || !r.line) return null;          // pending → the living voice takes it
    const line = r.line;
    const ja = (global.currentLang === 'ja');
    const body = (ja && line.ja) ? line.ja : line.en;
    if (!body) return null;
    return { cell: r.cell, term: r.term || null, text: body, speaker: String(r.cell).split('.')[0] };
  }

  function status() { return { state: _state, verified: _verified, error: _err,
                               cells: _router ? Object.keys(_router.cube.cells).length : 0,
                               pending: _router ? (_router.cube.pending || []).length : 0 }; }

  const API = { load, answer, status };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.ChatResponder = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
