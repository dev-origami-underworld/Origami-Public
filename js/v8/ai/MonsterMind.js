/* MonsterMind.js — THE RECORD OF ONE MONSTER'S MIND (Monster Sims v2, the hub's data) [REF#AI-00173]
 *
 * ── MONSTER SIMS v2 · §3 MODULE LAYOUT (knowledge/design/MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §2, §3, §7;
 *    knowledge/design/MONSTER_SIMS_V2_ARCHITECTURE_2026-09-13.md §3 dials, §4 needs, §5 awareness) ──
 *
 * Mark, 2026-09-13: "random personalities are embedded in monsters on spawn - because no two people are alike -
 *   some would be grump, some will be offish, some will be cruel, some will be aggressive, some will be passive ...
 *   so we create a spectrum for personality models" and "that situational awareness for that monster - what they
 *   see in front of them - what they think naturally about them. etc. what their purpose is, what they are doing
 *   to solve that purpose."
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
 *   Every monster body carries ONE plain-JSON record, `ud.mind`, and this file is the only code that knows its
 *   shape. It mints the record at spawn (eight dials, a name, a purpose), names the temperament in one word a kid
 *   can repeat ("grumpy loner"), drains and satisfies the five needs, writes what the monster has SEEN into its
 *   small memory (room, doors, up to eight peers, up to eight items, the player), keeps its opinion of the player,
 *   picks its friend, derives the thought bubble, rings the bell, and upgrades old records when the shape grows.
 *
 *   It is NOT a brain and never decides what a body does next — that stays with `MonsterAI.constructor.js`
 *   (`UtilityBrain.score` reads these dials; the FSM owns the states). It is NOT a renderer — a health-bar word,
 *   a thought bubble, a haiku line are spokes that READ `mind.word` / `mind.thought` and never write them. It never
 *   holds a THREE object, a closure or a timer: `JSON.stringify(mind)` must always round-trip, because the record
 *   is what survives when a section is parked and what a save carries.
 *
 * ONE WRITER PER FIELD (the rule that keeps the hub simple):
 *   mint      → dials · word · name · purpose · memory.room · memory.doors
 *   tickNeeds → needs                       perceive → memory.peers · memory.items · memory.player.seen/dist
 *   opinionEvent → memory.player.trust/fear/like/lastEvent          pickFriend → memory.peers[].friend (read) · returns a peer
 *   the brain (outside this file) → goal    thoughtOf → thought      bell → clock.lastBell
 *
 * NO ALLOCATION IN THE TICK PATH. Peer and item slots are created the first time a slot is needed (bounded at 8 per
 *   body) and RECYCLED afterwards — an old sighting is overwritten in place, never spliced. `tickNeeds`, `perceive`,
 *   `thoughtOf` and `bell` allocate nothing in steady state.
 *
 * NO ENGINE IMPORTS. The engine hands in numbers (a snapshot of what is in front of the body) and takes numbers
 *   back. That is why `node scripts/test-monster-mind.js` proves the whole file without a browser: 1000 mints keep
 *   every dial in [0,1] and every word inside the lookup, a name is the same for the same id on every run, and a
 *   record survives JSON both ways byte-identical.
 *
 * Off: nothing here is switchable — the engine's master knob is window._simsV2 (the glue, not this file).
 * Probe: window._mindOf(id) (engine) · node scripts/test-monster-mind.js (this file alone).
 */
(function (root) {
    'use strict';

    var VERSION = 1;

    // ── THE EIGHT DIALS ─────────────────────────────────────────────────────────────────────── [REF#AI-00174]
    // The first four are the engine's existing combat personality (rolled at Engine9's `_personality` mint and
    // handed in so the fight archetype stays byte-identical). The last four are new and drive the social life.
    var DIALS = ['bravery', 'aggression', 'sociability', 'loudness', 'temper', 'warmth', 'kindness', 'drive'];
    var NEEDS = ['hunger', 'rest', 'fun', 'company', 'bathroom'];
    var ROLES = ['worker', 'patrol', 'guard', 'performer', 'ally', 'boss', 'other'];
    var PEER_SLOTS = 8, ITEM_SLOTS = 8;

    // ── THE TEMPERAMENT WORD ────────────────────────────────────────────────────────────────── [REF#AI-00175]
    // Each dial end has an adjective and a noun in both languages. The word is `adjective(strongest dial)
    // noun(second-strongest dial)`, "strongest" meaning furthest from 0.5. Two dials, one word, no numbers —
    // "grumpy loner" is temper low + sociability low; "cheerful busybody" is temper high + sociability high.
    var ENDS = {
        bravery:     { lo: { adj: 'shy',      noun: 'scaredy-cat', adjJa: '弱気な',     nounJa: '怖がり'     },
                       hi: { adj: 'bold',     noun: 'daredevil',   adjJa: '大胆な',     nounJa: '無鉄砲'     } },
        aggression:  { lo: { adj: 'gentle',   noun: 'softie',      adjJa: 'おとなしい', nounJa: '平和主義者' },
                       hi: { adj: 'fierce',   noun: 'scrapper',    adjJa: '好戦的な',   nounJa: '暴れん坊'   } },
        sociability: { lo: { adj: 'quiet',    noun: 'loner',       adjJa: '無口な',     nounJa: '一匹狼'     },
                       hi: { adj: 'chatty',   noun: 'busybody',    adjJa: 'おしゃべりな', nounJa: 'お節介'   } },
        loudness:    { lo: { adj: 'hushed',   noun: 'whisperer',   adjJa: 'ひそひそ',   nounJa: '小声屋'     },
                       hi: { adj: 'loud',     noun: 'show-off',    adjJa: 'うるさい',   nounJa: '目立ちたがり' } },
        temper:      { lo: { adj: 'grumpy',   noun: 'grump',       adjJa: '不機嫌な',   nounJa: 'ぶつぶつ屋' },
                       hi: { adj: 'cheerful', noun: 'giggler',     adjJa: '陽気な',     nounJa: 'にこにこ屋' } },
        warmth:      { lo: { adj: 'offish',   noun: 'cold fish',   adjJa: 'よそよそしい', nounJa: 'つれない奴' },
                       hi: { adj: 'friendly', noun: 'sweetheart',  adjJa: '人懐っこい', nounJa: 'お人好し'   } },
        kindness:    { lo: { adj: 'cruel',    noun: 'meanie',      adjJa: '意地悪な',   nounJa: 'いじめっ子' },
                       hi: { adj: 'kind',     noun: 'helper',      adjJa: '優しい',     nounJa: '世話焼き'   } },
        drive:       { lo: { adj: 'lazy',     noun: 'dawdler',     adjJa: 'のんびり',   nounJa: 'なまけ者'   },
                       hi: { adj: 'eager',    noun: 'go-getter',   adjJa: 'せっかちな', nounJa: 'やる気屋'   } }
    };

    // ── FIRST NAMES (EN / JA), picked by a hash of the body id so a save keeps the same Kenji ─── [REF#AI-00176]
    var NAMES = [
        ['Kenji', 'ケンジ'], ['Momo', 'モモ'], ['Goro', 'ゴロー'], ['Hana', 'ハナ'], ['Taro', 'タロー'],
        ['Yuki', 'ユキ'], ['Sora', 'ソラ'], ['Ren', 'レン'], ['Riku', 'リク'], ['Mei', 'メイ'],
        ['Kaito', 'カイト'], ['Aoi', 'アオイ'], ['Hiro', 'ヒロ'], ['Nana', 'ナナ'], ['Jiro', 'ジロー'],
        ['Saki', 'サキ'], ['Koji', 'コージ'], ['Rin', 'リン'], ['Daichi', 'ダイチ'], ['Yui', 'ユイ'],
        ['Shin', 'シン'], ['Emi', 'エミ'], ['Tetsu', 'テツ'], ['Miki', 'ミキ'], ['Gen', 'ゲン'],
        ['Kiku', 'キク'], ['Bunta', 'ブンタ'], ['Chiyo', 'チヨ'], ['Ryo', 'リョー'], ['Ume', 'ウメ'],
        ['Kuma', 'クマ'], ['Tama', 'タマ'], ['Pon', 'ポン'], ['Mochi', 'モチ'], ['Kabu', 'カブ'],
        ['Oto', 'オト'], ['Nori', 'ノリ'], ['Fuku', 'フク'], ['Tofu', 'トーフ'], ['Dango', 'ダンゴ']
    ];

    // ── SMALL DETERMINISTIC HELPERS ─────────────────────────────────────────────────────────── [REF#AI-00177]
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function clampS(v)  { return v < -1 ? -1 : v > 1 ? 1 : v; }
    function hashStr(s) {                       // FNV-1a 32-bit — stable across runs and engines [REF#AI-00178]
        s = String(s == null ? '' : s);
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        return h >>> 0;
    }
    function mulberry32(seed) {                 // tiny seeded rng for probes; production mints use Math.random [REF#AI-00179]
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function num(v, d) { return (typeof v === 'number' && v === v) ? v : d; }

    // ── NAME ────────────────────────────────────────────────────────────────────────────────── [REF#AI-00180]
    function nameFor(id) {
        var row = NAMES[hashStr(id) % NAMES.length];
        return { name: row[0], nameJa: row[1] };
    }

    // ── WORD ────────────────────────────────────────────────────────────────────────────────── [REF#AI-00181]
    // Returns the two strongest dial ends as a key plus the EN/JA text. Ties resolve by dial order, so the
    // same dials always give the same word.
    function wordFor(dials) {
        var first = null, second = null, fs = -1, ss = -1;
        for (var i = 0; i < DIALS.length; i++) {
            var d = DIALS[i], v = num(dials && dials[d], 0.5), s = Math.abs(v - 0.5);
            if (s > fs)      { second = first; ss = fs; first = d; fs = s; }
            else if (s > ss) { second = d; ss = s; }
        }
        var a = ENDS[first][dials[first] >= 0.5 ? 'hi' : 'lo'];
        var b = ENDS[second][dials[second] >= 0.5 ? 'hi' : 'lo'];
        return {
            key: first + (dials[first] >= 0.5 ? '+' : '-') + ':' + second + (dials[second] >= 0.5 ? '+' : '-'),
            en: a.adj + ' ' + b.noun,
            ja: a.adjJa + b.nounJa
        };
    }
    function wordText(mind, lang) {
        if (!mind || !mind.dials) return '';
        var w = wordFor(mind.dials);
        return (lang === 'ja') ? w.ja : w.en;
    }

    // ── MINT ────────────────────────────────────────────────────────────────────────────────── [REF#AI-00182]
    // `opts.dials` may carry the engine's already-rolled first four (bravery, aggression, sociability, loudness);
    // anything missing is rolled here with `opts.rng` (default Math.random). The record is complete on return.
    function mint(opts) {
        opts = opts || {};
        var rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
        var id = String(opts.id == null ? ('mind-' + Math.floor(rng() * 1e9)) : opts.id);
        var dials = {};
        for (var i = 0; i < DIALS.length; i++) {
            var d = DIALS[i], given = opts.dials && opts.dials[d];
            dials[d] = (typeof given === 'number') ? clamp01(given) : rng();
        }
        var nm = nameFor(id);
        var role = (ROLES.indexOf(opts.role) >= 0) ? opts.role : 'other';
        var now = num(opts.now, 0);
        return {
            v: VERSION,
            id: id,
            name: nm.name, nameJa: nm.nameJa,
            dials: dials,
            word: wordFor(dials).en,
            purpose: { role: role, room: num(opts.room, -1), section: num(opts.section, -1) },
            needs: { hunger: 1, rest: 1, fun: 1, company: 1, bathroom: 1 },
            goal: null,
            memory: {
                room: num(opts.room, -1),
                doors: Array.isArray(opts.doors) ? opts.doors.slice(0, 6) : [],
                peers: [],
                items: [],
                player: { seen: -1, dist: -1, trust: 0.5, fear: 0.1, like: 0.5, lastEvent: null }
            },
            thought: null,
            clock: { born: now, lastBell: 0, lastVisit: 0, lastGreet: 0, lastAte: 0 }
        };
    }

    // ── NEEDS ───────────────────────────────────────────────────────────────────────────────── [REF#AI-00183]
    // Five needs, 1 = satisfied, drain toward 0 at personality-scaled rates. Only the engine decides whether to
    // call this (never for a sleeper). `ctx`: { moved: world units walked this tick, idle: true when standing,
    // now: seconds }. Rates are per second; the numbers are minutes-to-empty in the comments.
    function tickNeeds(mind, dt, ctx) {
        if (!mind || !(dt > 0)) return mind;
        var n = mind.needs, D = mind.dials, c = ctx || {};
        var drive = num(D.drive, 0.5), soc = num(D.sociability, 0.5), temper = num(D.temper, 0.5);
        var now = num(c.now, 0);
        n.hunger   = clamp01(n.hunger   - dt * (1 / 900)  * (0.7 + 0.6 * drive));              // ~15 min, eager burns faster [REF#AI-00184]
        n.rest     = clamp01(n.rest     - num(c.moved, 0) * 0.012 - dt * (1 / 3600));           // walking tires; standing barely [REF#AI-00185]
        n.fun      = clamp01(n.fun      - dt * (c.idle ? 1 / 480 : 1 / 1400) * (1.3 - 0.6 * temper)); // idling bores; grumps sooner [REF#AI-00186]
        n.company  = clamp01(n.company  - dt * (1 / 720)  * (0.5 + soc));                      // loners last longer alone [REF#AI-00187]
        var ate = (mind.clock.lastAte > 0 && now - mind.clock.lastAte < 300) ? 2.5 : 1;         // 5 min after a meal [REF#AI-00188]
        n.bathroom = clamp01(n.bathroom - dt * (1 / 1200) * ate);
        return mind;
    }
    function satisfy(mind, need, amount, now) {
        if (!mind || NEEDS.indexOf(need) < 0) return mind;
        mind.needs[need] = clamp01(mind.needs[need] + num(amount, 1));
        if (need === 'hunger') mind.clock.lastAte = num(now, mind.clock.lastAte);
        if (need === 'company') mind.clock.lastVisit = num(now, mind.clock.lastVisit);
        return mind;
    }
    function topNeed(mind) {
        var best = null, bv = 2;
        for (var i = 0; i < NEEDS.length; i++) { var v = mind.needs[NEEDS[i]]; if (v < bv) { bv = v; best = NEEDS[i]; } }
        return { need: best, value: bv };
    }

    // ── PERCEPTION ──────────────────────────────────────────────────────────────────────────── [REF#AI-00189]
    // `snap` is what the engine saw in the body's cone this tick:
    //   { now, room, peers: [{ id, dist }], items: [{ kind, title, x, z }], player: { dist } | null }
    // Slots recycle: a known peer/item updates in place; a new one takes an empty slot, else the slot with the
    // lowest score. A peer's score is its last sighting plus its bond worth ten minutes of recency, so a stranger
    // passing by evicts a stranger, never a friend; an item's score is its last sighting alone.
    function slotFor(list, cap, keyName, key, bondWeight) {
        var evict = null, low = Infinity;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e[keyName] === key) return e;
            var sc = num(e.seen, 0) + (bondWeight ? num(e.friend, 0) * bondWeight : 0);
            if (sc < low) { low = sc; evict = e; }
        }
        if (list.length < cap) { var fresh = {}; fresh[keyName] = key; list.push(fresh); return fresh; }
        return evict;
    }
    function perceive(mind, snap) {
        if (!mind || !snap) return mind;
        var m = mind.memory, now = num(snap.now, 0);
        if (typeof snap.room === 'number') m.room = snap.room;
        var warmth = num(mind.dials.warmth, 0.5), soc = num(mind.dials.sociability, 0.5);
        if (snap.peers) for (var i = 0; i < snap.peers.length; i++) {
            var p = snap.peers[i]; if (!p || p.id == null || p.id === mind.id) continue;
            var e = slotFor(m.peers, PEER_SLOTS, 'id', p.id, 600);
            if (e.id !== p.id) { e.id = p.id; e.friend = 0; }
            e.seen = now;
            if (typeof e.friend !== 'number') e.friend = 0;
            // a meeting warms the bond a little; warm, social bodies bond faster (two-dial rule) [REF#AI-00190]
            if (num(p.dist, 99) <= 3) e.friend = clampS(e.friend + 0.02 * (0.5 + warmth) * (0.5 + soc));
        }
        if (snap.items) for (var j = 0; j < snap.items.length; j++) {
            var it = snap.items[j]; if (!it) continue;
            var k = (it.kind || 'thing') + '@' + Math.round(num(it.x, 0)) + ',' + Math.round(num(it.z, 0));
            var s = slotFor(m.items, ITEM_SLOTS, 'key', k, 0);
            s.key = k; s.kind = it.kind || 'thing'; s.title = it.title || ''; s.x = num(it.x, 0); s.z = num(it.z, 0); s.seen = now;
        }
        if (snap.player) { m.player.seen = now; m.player.dist = num(snap.player.dist, -1); }
        return mind;
    }

    // ── OPINION OF THE PLAYER ───────────────────────────────────────────────────────────────── [REF#AI-00191]
    // A short table of things the player can do to a monster and how the three opinion numbers move. The dials
    // bend the move: a kind monster forgives a loss at cards, a hot temper sulks over it.
    var EVENTS = {
        'waved':            function (o, D) { o.like += 0.08 + 0.10 * D.warmth; },
        'beat-me-at-cards': function (o, D) { o.trust += 0.10; o.like += (D.kindness - 0.5) * 0.30 - (0.5 - D.temper) * 0.25; },
        'lost-to-me-at-cards': function (o, D) { o.like += 0.10 + (0.5 - D.kindness) * 0.20; },
        'gave-me-gold':     function (o)    { o.like += 0.30; o.trust += 0.20; },
        'hit-me':           function (o, D) { o.fear += 0.30 * (1 - D.bravery) + 0.05; o.like -= 0.30; o.trust -= 0.20; },
        'healed-me':        function (o)    { o.like += 0.40; o.trust += 0.30; o.fear -= 0.20; },
        'freed-me':         function (o)    { o.like += 0.50; o.trust += 0.50; o.fear -= 0.30; },
        'woke-me':          function (o, D) { o.like -= (0.5 - D.temper) * 0.20; o.fear += 0.05 * (1 - D.bravery); },
        'sang-for-me':      function (o, D) { o.like += 0.15 + 0.10 * D.warmth; }
    };
    function opinionEvent(mind, event, now) {
        if (!mind || !EVENTS[event]) return mind;
        var o = mind.memory.player;
        EVENTS[event](o, mind.dials);
        o.like = clampS(o.like); o.trust = clamp01(o.trust); o.fear = clamp01(o.fear);
        o.lastEvent = event; if (typeof now === 'number') o.seen = now;
        return mind;
    }

    // ── FRIEND ──────────────────────────────────────────────────────────────────────────────── [REF#AI-00192]
    // The peer with the strongest bond who was seen recently enough to still be "around". Loners (low
    // sociability) need a stronger bond before anyone counts as a friend at all.
    function pickFriend(mind, now) {
        if (!mind) return null;
        var best = null, bv = 0.05 + (1 - num(mind.dials.sociability, 0.5)) * 0.25;
        var peers = mind.memory.peers;
        for (var i = 0; i < peers.length; i++) {
            var e = peers[i]; if (e.id == null) continue;
            if (typeof now === 'number' && now - e.seen > 1800) continue;   // not seen for 30 min: drifted apart [REF#AI-00193]
            if (e.friend > bv) { bv = e.friend; best = e; }
        }
        return best;
    }

    // ── THOUGHT ─────────────────────────────────────────────────────────────────────────────── [REF#AI-00194]
    // The bubble shows the top unmet need, or what the monster makes of the player it just saw. Derived, never
    // stored by anyone else: the same number that drives the walk drives the picture.
    var NEED_THOUGHT = { hunger: 'rice', rest: 'bed', fun: 'dice', company: 'friend', bathroom: 'bath' };
    function thoughtOf(mind, now) {
        if (!mind) return null;
        var t = topNeed(mind);
        if (t.need && t.value < 0.4) return (mind.thought = NEED_THOUGHT[t.need]);
        var o = mind.memory.player;
        if (o.seen >= 0 && typeof now === 'number' && now - o.seen <= 10) {
            if (o.fear > 0.5)  return (mind.thought = 'player!');
            if (o.like < -0.3) return (mind.thought = 'grudge');
            if (o.like > 0.5)  return (mind.thought = 'player♥');
            return (mind.thought = 'player?');
        }
        return (mind.thought = null);
    }

    // ── THE BELL ────────────────────────────────────────────────────────────────────────────── [REF#AI-00195]
    // Floor clock in seconds; the bell rings once per period and names the section whose turn it is (one section
    // at a time, like school). Returns the section index or -1 when it is not time.
    function bell(clock, periodSec, now, sectionCount) {
        if (!clock || !(periodSec > 0)) return -1;
        var k = Math.floor(now / periodSec);
        if (k <= 0 || k * periodSec <= clock.lastBell) return -1;
        clock.lastBell = k * periodSec;
        var n = Math.max(1, sectionCount | 0);
        return (k - 1) % n;
    }

    // ── SAVE SHAPE: migrate · serialize · restore ───────────────────────────────────────────── [REF#AI-00196]
    // `migrate` upgrades any older or partial record to VERSION field by field and never drops a name, a dial
    // or a friendship. Adding a field in a future version = one line here + a bump of VERSION.
    function migrate(rec) {
        if (!rec || typeof rec !== 'object') return null;
        var fresh = mint({ id: rec.id, role: rec.purpose && rec.purpose.role, room: rec.purpose && rec.purpose.room,
                           section: rec.purpose && rec.purpose.section, dials: rec.dials, rng: mulberry32(hashStr(rec.id)) });
        if (typeof rec.name === 'string')   fresh.name = rec.name;
        if (typeof rec.nameJa === 'string') fresh.nameJa = rec.nameJa;
        if (rec.needs)  for (var i = 0; i < NEEDS.length; i++) fresh.needs[NEEDS[i]] = clamp01(num(rec.needs[NEEDS[i]], 1));
        if (rec.goal && typeof rec.goal === 'object') fresh.goal = { id: rec.goal.id || null, target: rec.goal.target == null ? null : rec.goal.target,
                                                                     since: num(rec.goal.since, 0), byPlayer: !!rec.goal.byPlayer };
        var m = rec.memory || {};
        if (typeof m.room === 'number') fresh.memory.room = m.room;
        if (Array.isArray(m.doors)) fresh.memory.doors = m.doors.slice(0, 6);
        if (Array.isArray(m.peers)) for (var p = 0; p < m.peers.length && p < PEER_SLOTS; p++) {
            var e = m.peers[p]; if (!e || e.id == null) continue;
            fresh.memory.peers.push({ id: e.id, seen: num(e.seen, 0), friend: clampS(num(e.friend, 0)) });
        }
        if (Array.isArray(m.items)) for (var q = 0; q < m.items.length && q < ITEM_SLOTS; q++) {
            var it = m.items[q]; if (!it) continue;
            fresh.memory.items.push({ key: it.key || ((it.kind || 'thing') + '@' + Math.round(num(it.x, 0)) + ',' + Math.round(num(it.z, 0))),
                                      kind: it.kind || 'thing', title: it.title || '', x: num(it.x, 0), z: num(it.z, 0), seen: num(it.seen, 0) });
        }
        if (m.player) { var o = fresh.memory.player, src = m.player;
            o.seen = num(src.seen, -1); o.dist = num(src.dist, -1); o.trust = clamp01(num(src.trust, 0.5));
            o.fear = clamp01(num(src.fear, 0.1)); o.like = clampS(num(src.like, 0.5)); o.lastEvent = src.lastEvent || null; }
        if (typeof rec.thought === 'string') fresh.thought = rec.thought;
        if (rec.clock) { var c = fresh.clock, sc = rec.clock;
            c.born = num(sc.born, 0); c.lastBell = num(sc.lastBell, 0); c.lastVisit = num(sc.lastVisit, 0);
            c.lastGreet = num(sc.lastGreet, 0); c.lastAte = num(sc.lastAte, 0); }
        fresh.word = wordFor(fresh.dials).en;
        fresh.v = VERSION;
        return fresh;
    }
    function serialize(mind) { return mind ? JSON.parse(JSON.stringify(mind)) : null; }
    function restore(obj) {
        if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch (_) { return null; } }
        return migrate(obj);
    }

    root.OrigamiMonsterMind = {
        version: '1.0.0', VERSION: VERSION,
        DIALS: DIALS, NEEDS: NEEDS, ROLES: ROLES, ENDS: ENDS, NAMES: NAMES, EVENTS: Object.keys(EVENTS),
        mint: mint, nameFor: nameFor, wordFor: wordFor, wordText: wordText,
        tickNeeds: tickNeeds, satisfy: satisfy, topNeed: topNeed,
        perceive: perceive, opinionEvent: opinionEvent, pickFriend: pickFriend, thoughtOf: thoughtOf,
        bell: bell, migrate: migrate, serialize: serialize, restore: restore,
        hashStr: hashStr, rng: mulberry32
    };
})(typeof window !== 'undefined' ? window : globalThis);
