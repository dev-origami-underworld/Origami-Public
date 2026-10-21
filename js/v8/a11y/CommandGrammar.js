/* CommandGrammar.js — EN+JA verb banks for the accessibility command console (playbook P3, [REF#AY-00009]
 * Mark GO 2026-08-14). DATA + one pure matcher; no DOM, no engine calls, no network — the same
 * zero-surface promise as the _vc* lists in NewOrigami.Panels.html, which this file EXTENDS
 * (the original seven intents and their priority order are untouched; these run after them).
 *
 * Loaded by the PANELS iframe (classic script). Exposes window.A11yGrammar.
 *
 * Intent contract: detect(text) → { cmd, targetName } | null
 *   cmd ∈ LOOK | LIST_NEARBY | WHERE_AM_I | PICK_UP | USE | SMASH | OPEN | READ | SIT |
 *         GO_TO_ROOM | INVENTORY | HELP        (SLEEP/ATTACK/mercy verbs stay in Panels)
 *   targetName: full remaining phrase (multi-word + Japanese preserved — the registry's
 *   substring matcher on nameEn/nameJa/nameKey does the resolving, not this file).
 */
(function () {
    'use strict';

    // Argless intents — whole-message match, tried FIRST (they must not require a target). [REF#AY-00010]
    const ARGLESS = [
        // BARE "look" IS THE CLASSIC PARSER'S MOST-TYPED COMMAND and it was falling through to the [REF#AY-00111]
        // conversation net — a player typing a verb was answered by Starlette. Verbs outrank the net:
        // the net exists to catch what the grammar cannot parse, never to compete with it. `l` is
        // Zork's own abbreviation. "look at <thing>" still reaches LOOK below: this row is anchored
        // ^...$ so anything with a target cannot match it.
        { cmd: 'LIST_NEARBY', re: /^(?:list nearby|list|nearby|look|l|look about|look round|look around|what(?:'| i)?s (?:around|near(?:by)?|here)|surroundings|scan|近く|近くに何がある|周り|周囲|何がある)[?？!.]*$/i },
        // SEARCH is bare-verb only: it sweeps the room you are standing in, and a target would [REF#AY-00112]
        // imply searching an OBJECT, which is what LOOK already does.
        { cmd: 'SEARCH',      re: /^(?:search|search (?:the )?room|search here|look for secrets|hunt for secrets|探す|捜索|調べ回る)[?？!.]*$/i },
        { cmd: 'WHERE_AM_I',  re: /^(?:where am i|where is this|what room is this|location|what room am i in|ここはどこ|現在地|どこ|ここは何の部屋)[?？!.]*$/i },
        // QUESTIONS A KID ASKS (Mark 2026-09-12 "advanced parser? full sentences?"): a question about the room is a LIST_NEARBY; [REF#AY-00116]
        // "who is that / anyone here" too — the registry's nearby list names monsters with their state.
        { cmd: 'LIST_NEARBY', re: /^(?:who(?:'s| is) (?:that|this|there|here)|(?:is )?(?:anyone|anybody|someone) (?:here|there|around)|what (?:can i|do i) see|what(?:'s| is) (?:in )?(?:here|in this room|in the room)|何がある|誰かいる|誰がいる|だれかいる)[?？!.]*$/i },
        { cmd: 'INVENTORY',   re: /^(?:inventory|my cards|hand|what do i have|bag|items|持ち物|インベントリ|カード|手札)[?？!.]*$/i },
        { cmd: 'HELP',        re: /^(?:help|commands|what can i (?:say|type|do)|ヘルプ|助けて|コマンド)[?？!.]*$/i },
        { cmd: 'SIT',         re: /^(?:sit|sit down|take a seat|座る|座りたい|着席)[?？!.]*$/i },
    ];

    // Targeted intents — verb phrase + required rest-of-line target. [REF#AY-00011]
    // Order matters: LOOK before GO_TO_ROOM ('look at the casino' ≠ travel); PICK_UP before
    // USE ('pick up' contains 'up'); READ folds into LOOK engine-side but parses separately
    // so signs narrate as text, not as objects.
    const TARGETED = [
        { cmd: 'PICK_UP',    verbs: ['pick up', 'take', 'grab', 'get', 'collect', '拾う', '取る', 'を拾って', 'を取って'] },
        { cmd: 'SMASH',      verbs: ['smash', 'break', 'destroy', 'shatter', '壊す', '割る', 'を壊して'] },
        { cmd: 'OPEN',       verbs: ['open', 'unseal', '開ける', 'を開けて', '開けて'] },
        { cmd: 'READ',       verbs: ['read', '読む', 'を読んで', '読んで'] },
        { cmd: 'USE',        verbs: ['use', 'activate', 'operate', 'play the', 'play', '使う', 'を使って', '起動'] },
        { cmd: 'BUY',        verbs: ['buy', 'purchase', 'buy from', '買う', 'を買って', '購入'] },
        { cmd: 'LOOK',       verbs: ['look at', 'look', 'describe', 'examine', 'inspect', 'check', 'what is', "what's", 'tell me about', 'is there a', 'is there an', 'is there any', 'is there', 'where is the', 'where is', "where's the", "where's", 'do you see', 'can you see', 'can i see', 'show me', 'see', '調べる', '見る', 'を調べて', 'を見て', 'とは', 'はどこ', 'はある', 'について教えて', 'を教えて'] },
        { cmd: 'GO_TO_ROOM', verbs: ['go to the', 'go to', 'travel to', 'head for', 'take me to', 'find the', 'find', 'へ行く', 'に行く', 'へ行って', 'に行って', 'へ', 'に'] },
        // ── MOVEMENT VERBS, LAST ON PURPOSE ──────────────────────────────────────────────────── [REF#AY-00113]
        //   "go north" and "go forward" had no row at all: `go` belonged to the attack detector, so
        //   a movement word threw a punch (measured in the 2026-09-04 typed playtest — it woke a
        //   sleeping ogre). With that arbitration inverted, the words now need somewhere to land.
        //   The engine already knows how to do this: window._a11yCompassWalk resolves north/south/
        //   east/west AND the relative words forward/back/left/right, turning from the real `rot`
        //   facing rather than the camera. It just was never reached from a bare movement verb.
        //   ⚠ ORDER: this sits BELOW GO_TO_ROOM so "go to the cabaret" still claims travel; only
        //   what GO_TO_ROOM declines ("go north", "go forward") reaches here.
        { cmd: 'WALK',       verbs: ['walk to the', 'walk to', 'run to the', 'run to', 'move to the', 'move to', 'go', 'walk', 'run', 'move', 'head', '歩く', '行く', '進む'] },
    ];

    // Build one regex per intent, longest verb first so 'pick up' beats 'up', '調べて' beats '調'. [REF#AY-00012]
    function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    const COMPILED = TARGETED.map(t => ({
        cmd: t.cmd,
        re: new RegExp('^(?:please\\s+)?(?:' + t.verbs.slice().sort((a, b) => b.length - a.length).map(esc).join('|') + ')\\s*(.+)$', 'i'),
        reJaSuffix: null,
    }));
    // Japanese verb-final word order: 「壺を壊して」= target THEN verb. One suffix regex per [REF#AY-00013]
    // intent, built from its JA verbs of the を-suffix form.
    const JA_SUFFIX = TARGETED.map(t => {
        const ja = t.verbs.filter(v => /^(を|は|について)/.test(v) || /(する|って|んで|べる|見る|行く|使う|壊す|拾う|取る|読む|開ける|買う|どこ|ある|教えて)$/.test(v));
        if (!ja.length) return null;
        return { cmd: t.cmd, re: new RegExp('^(.+?)(?:' + ja.slice().sort((a, b) => b.length - a.length).map(esc).join('|') + ')[!！.。]*$', 'i') };
    }).filter(Boolean);

    // FULL SENTENCES (Mark 2026-09-12 "advanced parser? full sentences?"): what a kid actually types is wrapped in politeness and [REF#AY-00117]
    // filler — "can you please look at the bed for me?" — and refers back — "now pick it up". Everything here is still regex:
    // leading/trailing filler is stripped BEFORE the verb banks run, and a pronoun target is replaced by the last thing named
    // (A11yGrammar.lastTarget, set by every parse that names a target and by the World page's own buttons). No model, no network.
    const LEAD_FILLER = /^(?:(?:hey|hi|ok|okay|um|uh|so|now|then|also|and|first|next|please|just|quickly|go ahead and|try to|try and|maybe|mind|kindly)\s+)+/i;
    const LEAD_ASK = /^(?:(?:can|could|would|will|may|do|did) (?:you|u|we|i)(?: please)?(?: just)?(?: go)?(?: and)?\s+|i(?:'d| would) like (?:you )?to\s+|i(?: really)? (?:want|need|wanna|gotta|have) to\s+|i want (?:you )?to\s+|let(?:'s| us| me)\s+|please\s+|would you mind\s+)+/i;
    const TAIL_FILLER = /(?:\s+(?:please|now|for me|for us|thanks|thank you|ok|okay|right now|quickly|if you can|if you could|if you don't mind|would you|will you|can you|could you))+\s*[?？!！.。]*$/i;
    const JA_TAIL = /(?:ください|下さい|くれる|くれない|くれますか|もらえる|もらえますか|ほしい|欲しい|ちょうだい|お願い|おねがい|ね|よ|かな|か)+[?？!！.。]*$/;
    // "what is your name" / "what is the time" are conversation, not a LOOK at an object — hand them to the net [REF#AY-00118]
    const NOT_A_THING = /^(?:your|you|yourself|me|myself|my name|the time|love|life|it like|up|going on|wrong|new|happening)\b/i;
    const PRONOUN = /^(?:it|that|this|that one|this one|the thing|him|her|them|the same|same|それ|あれ|これ|そいつ|あいつ|同じ)$/i;
    function normalize(text) {
        let t = String(text || '').trim().replace(/\s+/g, ' ');
        for (let i = 0; i < 3; i++) { const b = t; t = t.replace(LEAD_FILLER, '').replace(LEAD_ASK, '').replace(TAIL_FILLER, '').replace(JA_TAIL, '').trim(); if (t === b) break; }
        t = t.replace(/\b(pick|take) (it|that|this|them|him|her|those) up\b/i, '$1 up $2');
        // "would you mind opening the gate" → after the ask is stripped, the verb is a gerund: fold the ones the banks know [REF#AY-00119]
        t = t.replace(/^(opening|looking at|looking|picking up|taking|grabbing|smashing|breaking|using|reading|going to|going|walking to|walking|buying|examining|checking|describing)\b/i, (m) => ({ opening: 'open', 'looking at': 'look at', looking: 'look', 'picking up': 'pick up', taking: 'take', grabbing: 'grab', smashing: 'smash', breaking: 'break', using: 'use', reading: 'read', 'going to': 'go to', going: 'go', 'walking to': 'walk to', walking: 'walk', buying: 'buy', examining: 'examine', checking: 'check', describing: 'describe' })[m.toLowerCase()]);   // "pick it up" → "pick up it" so the verb bank and the pronoun both see it
        return t;
    }
    function cleanTarget(rest) {
        let t = String(rest || '')
            .replace(/^(?:the|a|an|that|those|these|my|at|some|any)\s+/i, '')
            .replace(TAIL_FILLER, '')
            .replace(/[?？!！.。]+$/, '')
            .trim();
        if (PRONOUN.test(t)) t = A11yGrammar.lastTarget || '';
        return t || null;
    }

    const A11yGrammar = {
        /** @returns {{cmd:string, targetName:string|null}|null} [REF#AY-00014] */
        lastTarget: null,
        remember(name) { const n = String(name || '').trim(); if (n) A11yGrammar.lastTarget = n; },
        normalize,
        /** Chained commands — "look at the bed then pick up the lantern" / 「ベッドを調べて、それからランタンを拾って」 → one [REF#AY-00014b]
         *  intent per clause, in order; a clause that does not parse stops the chain there (so a typo never fires the wrong verb). */
        detectAll(text) {
            const parts = String(text || '').split(/\s*(?:,?\s*\b(?:and then|then|after that|and after that|next)\b|;|、それから|。それから|それから|そして|、そのあと|そのあと|、次に|次に)\s*/i).map(s => s.trim()).filter(Boolean);
            const out = [];
            for (const p of parts) { const g = A11yGrammar.detect(p); if (!g) break; out.push(g); }
            return out;
        },
        detect(text) {
            const raw0 = String(text || '').trim();
            if (!raw0) return null;
            const raw = normalize(raw0) || raw0;
            const got = A11yGrammar._detectOne(raw);
            if (got && got.targetName) A11yGrammar.remember(got.targetName);
            return got;
        },
        _detectOne(raw) {
            for (const a of ARGLESS) if (a.re.test(raw)) return { cmd: a.cmd, targetName: null };
            // Bare-number disambiguation reply ("2" / "２") — resolved engine-side against the [REF#AY-00015]
            // pending candidate list from the last ambiguous command.
            const num = raw.normalize('NFKC').match(/^([1-9])$/);
            if (num) return { cmd: 'RESOLVE_CANDIDATE', targetName: num[1] };
            for (const c of COMPILED) {
                const m = c.re.exec(raw);
                if (m && cleanTarget(m[1])) { if (NOT_A_THING.test(cleanTarget(m[1]))) return null; return { cmd: c.cmd, targetName: cleanTarget(m[1]) }; }
            }
            for (const j of JA_SUFFIX) {
                const m = j.re.exec(raw);
                if (m && cleanTarget(m[1])) return { cmd: j.cmd, targetName: cleanTarget(m[1]) };
            }
            return null;
        },
        // The HELP narration (both languages; panels prints per current locale). [REF#AY-00016]
        helpText: {
            en: 'You can type — MOVE: look · go north/south/east/west · go forward/back/left/right · go to <room> · walk to <thing>. SEE: look around · look at <thing> · where am I · inventory. TAKE: get <card> · get cards (gathers them one at a time) · smash <pot> · open <gate> · use <machine>. TALK: talk to <monster> · gamble with <monster> · spare <monster> · parley with <monster>. FIGHT: attack <monster>. Also: sleep · help.',
            ja: '入力できます — 移動: 近く · 北/南/東/西へ · 前/後ろ/左/右へ · <部屋>へ行って · <物>へ行く。見る: 周り · <物>を調べて · ここはどこ · 持ち物。取る: <カード>を拾って · カード全部（順番に拾う） · <壺>を壊して · <関門>を開けて · <機械>を使って。話す: <モンスター>と話す/賭ける/見逃す/交渉。戦う: <モンスター>を攻撃。ほかに: 寝る · ヘルプ。',
        },
        // RETYPEABLE EXAMPLES. helpText above teaches SHAPES — "go to <room>", "walk to <thing>" — [REF#AY-00114]
        // and a placeholder is not something a child can retype. Typing "go to <room>" verbatim fails,
        // and a player who cannot tell a placeholder from a command reads that failure as their own.
        // These lines carry no placeholder: every one is a complete command that can be copied straight
        // back into the field. They are generated from the tables above, never hand-written prose, and
        // scripts/probe-guide-help.js re-parses each one through detect() on every run — so a line that
        // stops parsing fails the build instead of teaching a dead verb.
        helpExamples: {
            en: ['look around', 'where am i', 'inventory', 'search', 'sit', 'go north', 'help'],
            // ⚠ NO JAPANESE COMPASS LINE, deliberately. 「北へ行く」 parses — to GO_TO_ROOM, because [REF#AY-00115]
            // GO_TO_ROOM owns 'へ'/'に' and sits above WALK — so it hunts for a room named 北 instead of
            // walking north, while its English twin "go north" reaches WALK. It PARSED, which is why a
            // check that only asks "does it parse" passed it. Teaching a line that reaches the wrong verb
            // is worse than teaching one line fewer, so it is out until the grammar has a compass phrasing
            // Japanese can reach.
            ja: ['近く', 'ここはどこ', '持ち物', '探す', '座る', 'ヘルプ'],
        },
    };

    window.A11yGrammar = A11yGrammar;
})();
