/* InteractionTree.js — BEHAVIOUR TREES FOR MONSTER INTERACTION EVENTS [REF#AI-00145]
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
 *   The engine's monster AI is a flat finite state machine: `tickMonsterAI` dispatches on the string
 *   `ud.aiState` across ~16 states. That machine owns COMBAT — hostile, chase, flee, attack — and it
 *   works. This file does NOT replace it and must never try to: rewriting a working combat FSM to
 *   prove a point about tree shape would be the largest blast radius available for the smallest gain.
 *
 *   What the engine had NO structure for was DECIDING BETWEEN INTERACTIONS. The greet beat, for
 *   example, fires on a flat 20-second cooldown that is byte-identical for every monster in the
 *   dungeon, so a shy Coward and a gregarious Rallier greet at exactly the same rate. The monsters
 *   already carry real individual minds — 8 continuous personality traits plus an archetype, minted
 *   per monster and read at ~28 sites — and none of that reaches the decision of WHICH social beat to
 *   play. This tree is that missing decision layer, and it is the layer trees are actually good at.
 *
 * THE TREE IS SHARED AND IMMUTABLE; THE STATE IS PER-AGENT. That is the standard split, and here it
 *   also happens to be the cheap one: one tree object exists for the whole dungeon, and each monster
 *   carries only its own small cooldown bag. Nothing is allocated per tick.
 *
 * NO ENGINE IMPORTS. Every world interaction arrives through the `api` object the caller passes in,
 *   so this file can be reasoned about, and tested, without booting a browser.
 */
(function (root) {
    'use strict';

    var SUCCESS = 'success', FAILURE = 'failure', RUNNING = 'running';

    // ── NODES ────────────────────────────────────────────────────────────────────────────────── [REF#AI-00146]
    function Sequence(name, kids) {          // all must succeed, in order [REF#AI-00147]
        return { name: name, type: 'sequence', kids: kids, tick: function (c) {
            for (var i = 0; i < kids.length; i++) {
                var r = kids[i].tick(c);
                if (r !== SUCCESS) return r;
            }
            return SUCCESS;
        } };
    }
    function Selector(name, kids) {          // first success wins; the fallback chain [REF#AI-00148]
        return { name: name, type: 'selector', kids: kids, tick: function (c) {
            for (var i = 0; i < kids.length; i++) {
                var r = kids[i].tick(c);
                if (r !== FAILURE) return r;
            }
            return FAILURE;
        } };
    }
    function Condition(name, fn) {
        return { name: name, type: 'condition', tick: function (c) {
            return fn(c) ? SUCCESS : FAILURE;
        } };
    }
    function Action(name, fn) {
        return { name: name, type: 'action', tick: function (c) {
            var r = fn(c);
            if (r === true || r === undefined) { c.fired = name; return SUCCESS; }
            if (r === RUNNING) return RUNNING;
            return FAILURE;
        } };
    }
    // Decorator: gate a branch behind a per-agent cooldown whose LENGTH is personality-derived. [REF#AI-00149]
    // The cooldown key is per-agent, so two monsters never share a timer.
    function Cooldown(key, secondsFn, child) {
        return { name: 'cooldown:' + key, type: 'decorator', kids: [child], tick: function (c) {
            var bag = c.cd, until = bag[key] || 0;
            if (c.now < until) return FAILURE;
            var r = child.tick(c);
            if (r === SUCCESS) bag[key] = c.now + secondsFn(c.p, c);
            return r;
        } };
    }
    // Decorator: probabilistic gate. Uses the api's rng so a probe can make runs deterministic. [REF#AI-00150]
    function Chance(name, pFn, child) {
        return { name: 'chance:' + name, type: 'decorator', kids: [child], tick: function (c) {
            var p = pFn(c.p, c);
            if (p <= 0) return FAILURE;
            if (p < 1 && c.api.rng() > p) return FAILURE;
            return child.tick(c);
        } };
    }

    // ── PERSONALITY READS ────────────────────────────────────────────────────────────────────── [REF#AI-00151]
    // A monster with no personality gets a NEUTRAL one rather than a crash or a silent skip. Silent
    // skips are how a feature ends up "on" and doing nothing for the half of the population that
    // lacks a field.
    var NEUTRAL = { bravery: 0.5, aggression: 0.5, sociability: 0.5, loudness: 0.5,
                    temper: 0.5, warmth: 0.5, kindness: 0.5, drive: 0.5,
                    fleeHpFrac: 0.5, alertRadius: 6, archetype: 'Unknown' };
    function pers(ud) {
        var p = ud && ud.personality;
        if (!p || typeof p !== 'object') return NEUTRAL;
        // Sims v2 (MONSTER_SIMS_V2_ARCHITECTURE_2026-09-13.md §3): the four new dials ride on the same [REF#AI-00159]
        // personality object the engine's mint fills from ud.mind.dials; a body without them reads neutral.
        return {
            bravery:     typeof p.bravery     === 'number' ? p.bravery     : 0.5,
            aggression:  typeof p.aggression  === 'number' ? p.aggression  : 0.5,
            sociability: typeof p.sociability === 'number' ? p.sociability : 0.5,
            loudness:    typeof p.loudness    === 'number' ? p.loudness    : 0.5,
            temper:      typeof p.temper      === 'number' ? p.temper      : 0.5,
            warmth:      typeof p.warmth      === 'number' ? p.warmth      : 0.5,
            kindness:    typeof p.kindness    === 'number' ? p.kindness    : 0.5,
            drive:       typeof p.drive       === 'number' ? p.drive       : 0.5,
            fleeHpFrac:  typeof p.fleeHpFrac  === 'number' ? p.fleeHpFrac  : 0.5,
            alertRadius: typeof p.alertRadius === 'number' ? p.alertRadius : 6,
            archetype:   p.archetype || 'Unknown'
        };
    }
    // Archetype nudges the WEIGHTS; it never overrides the continuous traits, so two Ralliers with [REF#AI-00152]
    // different sociability still behave differently. Archetype is flavour on top of the dice.
    // ⚠ ALL SIX, ENUMERATED FROM THE GENERATOR (Engine9 ~:43926), NOT GUESSED. My first table had
    //   four, because I had "found" them with a grep whose own pattern listed the names I expected —
    //   a search that can only confirm. The live run then returned a 'Hunter', which was silently
    //   taking neutral weights, and 'Crier' would have done the same. The generator's ladder is:
    //   bravery>0.75 Brute · bravery<0.25 Coward · sociability>0.70 Rallier · aggression>0.70 Hunter
    //   · loudness>0.70 Crier · else Scout.
    //   Note the engine calls archetype "a flavor label for log messages" — decorative there. Giving
    //   it weight here is the point of this file, but it is an ADDITION to its meaning, not a reading
    //   of an existing one.
    var ARCH = {
        Brute:   { greet: 0.70, peer: 0.70, watch: 0.70, callout: 1.40 },
        Coward:  { greet: 0.60, peer: 0.90, watch: 1.60, callout: 0.50 },
        Rallier: { greet: 1.25, peer: 1.50, watch: 0.80, callout: 1.30 },
        Hunter:  { greet: 0.65, peer: 0.60, watch: 1.50, callout: 0.70 },
        Crier:   { greet: 1.00, peer: 1.10, watch: 0.80, callout: 1.80 },
        Scout:   { greet: 0.90, peer: 0.80, watch: 1.60, callout: 0.90 },
        Unknown: { greet: 1.00, peer: 1.00, watch: 1.00, callout: 1.00 }
    };
    function arch(p) { return ARCH[p.archetype] || ARCH.Unknown; }

    // ── THE INTERACTION TREE ─────────────────────────────────────────────────────────────────── [REF#AI-00153]
    // Ordered by social priority: the player outranks peers, and everything outranks idling.
    var TREE = Selector('interaction', [

        // 1. GREET THE PLAYER. Sociability drives BOTH whether it happens and how often it may [REF#AI-00154]
        //    repeat — a 0.9-sociability monster re-greets in ~12s, a 0.1 one waits ~28s.
        Sequence('greet-player', [
            Condition('player-near',   function (c) { return c.api.playerDist(c.ud) <= c.p.alertRadius; }),
            Condition('greet-allowed', function (c) { return c.api.canGreet(c.ud, c.now); }),
            Chance('sociability', function (p) { return Math.min(1, p.sociability * arch(p).greet); },
                Cooldown('greet', function (p) { return 30 - 20 * p.sociability; },
                    Action('GREET_PLAYER', function (c) { return c.api.greet(c.ud, c.now, 'player'); })))
        ]),

        // 1b. GREET A CROSSING. ── MONSTER SIMS v2 · §4 task 1.8 (MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §4; [REF#AI-00160]
        //     ARCHITECTURE §3 row "player walks past / two friends meet") ──
        //     Mark, 2026-09-13: "can even have monsters bow and wave to one another while passing. friendly cute stuff."
        //     A REAL crossing — the api says a peer is within two tiles AND inside this body's facing cone — not a
        //     peer merely somewhere within six tiles (that is branch 2, the room-mate nod). Warmth decides whether
        //     it greets first; sociability sets how soon it may again (2–6 s). The api owns the geometry, so a probe
        //     can stage a crossing and expect the bow within one second. Absent api.crossingPeer = branch skipped.
        Sequence('greet-crossing', [
            Condition('crossing', function (c) { return typeof c.api.crossingPeer === 'function' && !!c.api.crossingPeer(c.ud); }),
            Chance('warmth', function (p) { return 0.45 + 0.55 * p.warmth; },
                Cooldown('crossing', function (p) { return 6 - 4 * p.sociability; },
                    Action('GREET_CROSSING', function (c) { return c.api.greet(c.ud, c.now, 'crossing'); })))
        ]),

        // 2. ACKNOWLEDGE A PEER. This is the beat that makes a dungeon feel inhabited when the [REF#AI-00155]
        //    player is NOT the centre of it — monsters bowing to each other.
        Sequence('greet-peer', [
            Condition('peer-near', function (c) { return !!c.api.nearestPeer(c.ud, 6); }),
            Chance('peer-social', function (p) { return Math.min(1, p.sociability * 0.7 * arch(p).peer); },
                Cooldown('peer', function (p) { return 25 - 12 * p.sociability; },
                    Action('GREET_PEER', function (c) { return c.api.greet(c.ud, c.now, 'peer'); })))
        ]),

        // 3. WATCH THE PLAYER instead of approaching. This is what LOW bravery should look like: [REF#AI-00156]
        //    not fleeing (that is combat's job) but keeping eyes on the threat from where it stands.
        Sequence('watch-player', [
            Condition('player-near', function (c) { return c.api.playerDist(c.ud) <= c.p.alertRadius * 1.5; }),
            Chance('wariness', function (p) { return Math.min(1, (1 - p.bravery) * arch(p).watch); },
                Cooldown('watch', function () { return 8; },
                    Action('WATCH_PLAYER', function (c) { return c.api.watch(c.ud, c.now); })))
        ]),

        // 4. CALL OUT. Loud monsters announce themselves; this is the audible half of personality. [REF#AI-00157]
        Sequence('call-out', [
            Chance('loudness', function (p) { return Math.min(1, p.loudness * arch(p).callout); },
                Cooldown('callout', function (p) { return 40 - 20 * p.loudness; },
                    Action('CALL_OUT', function (c) { return c.api.callOut(c.ud, c.now); })))
        ])
    ]);

    // ── TICK ONE AGENT ───────────────────────────────────────────────────────────────────────── [REF#AI-00158]
    function tickAgent(ud, api, now) {
        if (!ud) return null;
        if (!ud._btCd) ud._btCd = {};
        var ctx = { ud: ud, p: pers(ud), api: api, now: now, cd: ud._btCd, fired: null };
        var r = TREE.tick(ctx);
        return ctx.fired ? { event: ctx.fired, result: r } : null;
    }

    root.OrigamiInteractionTree = {
        version: '1.1.0',   // 1.1: greet-crossing branch + the four Sims v2 dials (2026-09-13) [REF#AI-00161]
        TREE: TREE, tickAgent: tickAgent,
        Sequence: Sequence, Selector: Selector, Condition: Condition,
        Action: Action, Cooldown: Cooldown, Chance: Chance,
        personalityOf: pers, ARCHETYPES: ARCH,
        SUCCESS: SUCCESS, FAILURE: FAILURE, RUNNING: RUNNING
    };
})(typeof window !== 'undefined' ? window : globalThis);
