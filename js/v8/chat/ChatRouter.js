/* ChatRouter.js — the runtime half of the language cube: LOOKUP ONLY, no generation. [REF#CR-00001]
 *
 * Mark 2026-09-03: "can you adjust the input field to use this advanced parser word understanding"
 * and "consider it all pre-compiled which is superior to any outside service imho".
 *
 * Port of the 2026-05-28 RASA router (commit 15154321) — see
 * knowledge/design/RASA_EXCAVATION_2026-09-03.md for what the original did and what it got wrong.
 * What survives: topic → a curated SUBSET of authored lines. Understanding never writes words; it
 * chooses a smaller, better bag to draw from. What does not survive: substring matching, positional
 * indices, first-bucket-wins, and Math.random.
 *
 * ⚠ THE MATCHER LIVES HERE AND THE BAKER IMPORTS IT. One definition of "does this term match this
 *   text", used by the build-time collision check and by the runtime, because a gate that
 *   re-implements the predicate it is grading is a gate that can pass a broken build — this repo has
 *   the scar (a rule that read roomIds while claiming to test structure, green on 6 false tiles).
 *
 * ⚠ NO NETWORK, NO MODEL, NO eval. The cube is data; this file is the only logic, and all of it is
 *   regex + array indexing.
 */
(function (global) {
  'use strict';

  // ── THE MATCHER ────────────────────────────────────────────────────────────────────────────
  //    Word-boundary anchored, so "pp" matches the word pp and NOT the pp inside "happy" — the
  //    single defect that made the 2026-05-28 router answer "im afraid" with a developer joke.
  //    ⚠ `\b` IS NOT ENOUGH ON ITS OWN FOR THE PHRASES. A multi-word term ("i had a bad day") needs
  //      its internal spaces to tolerate the runs of whitespace kids actually type, so spaces in a
  //      term compile to \s+ rather than a literal single space.
  const _escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const _cache = new Map();
  function termRegex(term) {
    const key = String(term).toLowerCase();
    let re = _cache.get(key);
    if (!re) {
      const body = _escape(key).replace(/\s+/g, '\\s+');
      // (^|\W) … (\W|$) rather than \b, because \b behaves badly beside apostrophes ("i'm") and is
      // meaningless next to CJK. This says: not butted up against another word character.
      re = new RegExp('(^|[^0-9a-z])' + body + '([^0-9a-z]|$)', 'i');
      _cache.set(key, re);
    }
    return re;
  }
  function termMatches(term, text) { return termRegex(term).test(String(text || '')); }

  // ── PATTERN TERMS ──────────────────────────────────────────────────────────────────────────
  //    A few things kids type are SHAPES, not words. "AAAAAAA" is not in any keyword list and never
  //    will be: measured, my literal terms "aaa"/"aaaa"/"aaaaa" all FAILED on it, because a
  //    word-boundary match of "aaaaa" inside "aaaaaaa" is correctly refused — the very strictness
  //    that fixed "happy"→pp is what loses keysmash. A pattern says the shape instead of guessing
  //    the length. Patterns are authored in the corpus as `re:<source>` and validated by the baker.
  const _pcache = new Map();
  function patternRegex(src) {
    let re = _pcache.get(src);
    if (!re) { re = new RegExp(src, 'i'); _pcache.set(src, re); }
    return re;
  }
  function isPattern(term) { return typeof term === 'string' && term.slice(0, 3) === 're:'; }
  function matches(term, text) {
    return isPattern(term) ? patternRegex(term.slice(3)).test(String(text || ''))
                           : termMatches(term, text);
  }

  // ── NORMALISE ──────────────────────────────────────────────────────────────────────────────
  //    The ORIGINAL text is never mutated — §3.1 of the research doc: readback must echo what the
  //    child actually typed, and only ever as text.
  function normalise(raw) {
    return String(raw == null ? '' : raw).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  // ── THE DRAW: a shuffled bag per cell, exactly as C1 does for the haikus ───────────────────
  //    Deal without replacement; reshuffle only on exhaustion; never let the new bag's first card
  //    repeat the old bag's last. Seeded so a probe can pin it.
  function makeBags(seed) {
    let state = ((seed >>> 0) || 0x5EED1234);
    const rand = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const bags = new Map(), last = new Map();
    let adjacentRejects = 0, refills = 0;
    return {
      draw(cellKey, lines) {
        if (!lines || !lines.length) return null;
        let bag = bags.get(cellKey);
        if (!bag || !bag.length) {
          bag = lines.slice();
          for (let i = bag.length - 1; i > 0; i--) {
            const j = (rand() * (i + 1)) | 0; const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
          }
          if (bag.length > 1 && bag[bag.length - 1] === last.get(cellKey)) {
            const t = bag[bag.length - 1]; bag[bag.length - 1] = bag[0]; bag[0] = t;
            adjacentRejects++;
          }
          refills++;
          bags.set(cellKey, bag);
        }
        const line = bag.pop();
        last.set(cellKey, line);
        return line;
      },
      stats() { return { refills, adjacentRejects }; }
    };
  }

  // ── THE ROUTER ─────────────────────────────────────────────────────────────────────────────
  function createRouter(cube, opts) {
    const o = opts || {};
    if (!cube || cube.format !== 'origami-language-cube') throw new Error('ChatRouter: not a language cube');
    const pending = new Set(cube.pending || []);
    const bags = makeBags(o.seed);

    // buckets are pre-sorted by priority in the cube; scan in order and keep the LONGEST match
    // within the winning priority band. Longest wins because "say hello to" must beat "say".
    function classify(raw) {
      const text = normalise(raw);
      if (!text) return { cell: null, term: null, priority: null, reason: 'empty' };
      let bestPri = null, best = null;
      for (const b of cube.buckets) {
        if (bestPri !== null && b.priority > bestPri) break;   // a later band cannot beat a hit
        for (const term of b.terms) {
          if (!matches(term, text)) continue;
          if (bestPri === null || b.priority < bestPri
              || (b.priority === bestPri && term.length > best.term.length)) {
            bestPri = b.priority; best = { cell: b.cell, term: term, priority: b.priority };
          }
        }
      }
      if (best) return Object.assign({ reason: 'matched' }, best);
      // ⚠ NEVER AN ERROR. Comedy is the default (Mark 2026-09-03: "error on jokes is totally ok").
      return { cell: cube.fallbackCell, term: null, priority: 999, reason: 'fallback' };
    }

    function respond(raw) {
      const c = classify(raw);
      if (!c.cell) return { cell: null, line: null, pending: false, reason: c.reason };
      // ⚠ A PENDING CELL RETURNS NOTHING AND MUST NOT FALL THROUGH TO COMEDY. `vent.sad` is declared
      //   and unwritten until Mark has read every line; answering a sad child with a punchline
      //   because the warm lane is not authored yet is the one failure this whole lane exists to
      //   prevent. The caller decides what to do with a pending cell — and until it has content,
      //   the honest answer is that the feature is not live.
      if (pending.has(c.cell)) return { cell: c.cell, line: null, pending: true, reason: c.reason, term: c.term };
      const lines = cube.cells[c.cell];
      const line = bags.draw(c.cell, lines);
      return { cell: c.cell, line: line, pending: false, reason: c.reason, term: c.term };
    }

    return { classify, respond, stats: bags.stats, cube };
  }

  const API = { createRouter, termMatches, matches, isPattern, termRegex, normalise, makeBags };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.ChatRouter = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
