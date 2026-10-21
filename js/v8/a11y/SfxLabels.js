/* SfxLabels.js — SFX1: every sound that carries information can speak. [REF#AY-00100]
 *
 * Mark, 2026-09-03: "perhaps we can add the 'I found you' to the event log and all such sound fx
 * will have that optional text capability when it sounds off - so this might be our soundfx
 * controller to note this for wcag 22/aaa proper tagging and labeling."
 *
 * This is DEAF-1's remedy and A3's census made durable. The census was a document; this is DATA the
 * conformance table can probe. Spec: knowledge/design/SFX1_SOUND_CONTROLLER_2026-09-03.md ·
 * census: knowledge/design/WCAG_A3_SOUND_CENSUS_2026-09-03.md
 *
 * ── WHY A TABLE AND NOT 66 EDITS ────────────────────────────────────────────────────────────────
 * The controller looks the key up AT PLAY TIME, so not one of the ~66 `playSfx` call sites changes.
 * Same pattern as EL1's emission contract: derive at the seam, never sweep the emitters.
 *
 * ── THE THROTTLE IS INHERITED, NOT INVENTED ─────────────────────────────────────────────────────
 * `_MON_SFX` already anti-repeats the SOUNDS via `_MON_SFX_VOCAL_REPEAT_MS` / `_IMPACT_`. The text
 * twin fires only when its sound actually fires, so one flag gates both channels and per-frame
 * emission is impossible by construction. ⚠ Idempotence keys on the SOUND INSTANCE, not on any
 * input id — a looping sfx would otherwise spam the log, which is the auto-target per-frame class
 * of bug in a new costume.
 *
 * ── TIERS ASSIGN BY CONSEQUENCE, NOT BY SOUND CATEGORY ──────────────────────────────────────────
 * ⛔ This was corrected before row one shipped, and the correction is the whole design. A first
 * draft tiered `FOUND` as `normal` because a bark is combat-cadence — reasoning from what the sound
 * IS. Backwards. **`FOUND` is a `beat`, because a monster announcing it has seen you is information
 * the game never repeats visually, and a deaf kid who misses it has been found and does not know.**
 * A footstep is noise; being noticed is not. Tier by what it COSTS to miss.
 * ⚠ And `noise` never means hidden — de-emphasis only. A screen reader is linear: a hidden line
 * cannot be found by a player who does not already know it exists.
 *
 * ── EXPLICIT COLUMNS, BECAUSE DERIVATION CANNOT SEE A SOUND ─────────────────────────────────────
 * A sound-sourced entry has no emoji prefix and no speaker markup for EL1's contract to derive from,
 * so it would silently default-tier every row. `speaker` / `significance` / `channelType` are stated
 * here and passed through as the contract's optional overrides — the fields exist for this consumer.
 * ⚠ NO `glyph` FIELD. Visual type markers ride the CSS `data-channel` half; a new announced glyph
 * would put a character into a blind player's spoken stream, which EL1 just spent a fix removing.
 */
window.SFX_LABELS = Object.freeze({

    // ── INFORMATION · P0 — the three whose absence decides whether a deaf player is ambushed ───── [REF#AY-00103]
    FOUND: {
        tier: 'INFORMATION', significance: 'beat', speaker: 'MONSTER', channelType: 'combat',
        text: 'I found you!', textJa: '見つけたぞ！',
        why: 'RULE #1 makes aggro ACOUSTIC. This is the single sound whose absence changes the outcome.',
    },
    MUMMY_ALERT: {
        tier: 'INFORMATION', significance: 'beat', speaker: 'MONSTER', channelType: 'combat',
        text: 'The mummy stirs — it has seen you.', textJa: 'ミイラが目覚めた——見つかった。',
        why: "the mummy's FOUND (added 2026-07-03); same consequence, same tier.",
    },
    CACKLE: {
        tier: 'INFORMATION', significance: 'beat', speaker: 'MONSTER', channelType: 'combat',
        text: 'A cackle behind you!', textJa: '背後で高笑い！',
        why: 'fires on the barrel-ambush spawn (Engine9 ~:10878) — a monster appearing behind you.',
    },

    // ── INFORMATION · P1 ──────────────────────────────────────────────────────────────────────── [REF#AY-00104]
    BANZAI: {
        tier: 'INFORMATION', significance: 'beat', speaker: 'MONSTER', channelType: 'combat',
        text: 'Banzai! It charges!', textJa: '万歳！突っ込んでくる！',
        why: "a commitment cry; its own globalMs of 2500 says the table already treats it as a rare, loud beat.",
    },

    // ── THE `LAUGH` SPLIT — ONE SOUND, TWO TRUTHS ─────────────────────────────────────────────── [REF#AY-00105]
    //    `LAUGH` was ONE tag with TWO meanings at two call sites: a goblin's taunt, and the HUNGRY
    //    GHOST DEVOURING YOU (Engine9 ~:46560, gated by `_ghostLaughAt`). A single text would have
    //    been correct at one site and a lie at the other — and the lie lands on the more dangerous
    //    of the two, telling a deaf child a goblin is amused while a ghost eats them. The row was
    //    therefore withheld rather than guessed: a missing label leaves the player where they already
    //    were; a wrong one actively misinforms them.
    //    ⭐ RULED 2026-09-03: **split at the CALL SITE, by KEY, sharing the FILE.** Each site passes
    //    its own semantic key and both keys resolve to the same mp3 — **the key is the identity, the
    //    file is just the asset.** Acceptance: both must resolve to the same audio, so the HEARING
    //    experience stays byte-identical and the split changes meaning-space only.
    //    ⚠ THE ROWS EXIST BEFORE THE CALL SITES DO, and that is safe by construction: nothing emits
    //      these keys until SFX1's first commit renames them, and `sfxLabelFor()` returns null for
    //      anything it does not know. Labels-ahead-of-emitters is the harmless direction; the
    //      dangerous one is an emitter with no label, which is where this whole table started.
    LAUGH_TAUNT: {
        tier: 'INFORMATION', significance: 'normal', speaker: 'MONSTER', channelType: 'social',
        text: 'A goblin sneers at you.', textJa: 'ゴブリンがせせら笑う。',
        why: 'flavour-tier: it tells you something is there and amused, which costs little to miss. '
           + 'THREE call sites, all one meaning — a monster landed a hit and taunts (~:59921, ~:65050, ~:72170).',
    },
    GHOST_DEVOUR: {
        tier: 'INFORMATION', significance: 'beat', speaker: 'MONSTER', channelType: 'combat',
        text: 'The hungry ghost is feeding on you!', textJa: '餓鬼に喰われている！',
        why: 'THE MOST SAFETY-CRITICAL ROW IN THIS TABLE. Engine9 ~:46560 — this fires while the player '
           + 'is being devoured, and until the split it shared a tag with a goblin chuckle. A deaf kid '
           + 'must know they are being EATEN, and must know it urgently, which is why it is a beat and '
           + 'why its wording is blunt rather than atmospheric.',
    },

    // ── THE WARM TWO — and they are the reason the split was worth stopping the build for. ─────── [REF#AY-00106]
    //    `goblin-laugh.mp3` is not one sound with two meanings; it is ONE FILE WITH FOUR, and two of
    //    them are friendly: a seated NON-HOSTILE monster clapping (Engine9 ~:55093, gated
    //    `!ud.isHostile` beside `_clapAct`/`_bowAct`) and the crew bowing after a win (~:55193,
    //    `_pkMonBow` under `_winBowHold`). Labelling by FILE would have told a deaf child "a goblin
    //    sneers at you" WHILE THE ROOM WAS APPLAUDING THEM — turning a moment of welcome into a
    //    threat, in the one channel that player has.
    //    ⭐ DEAF-1 says game-critical information, and BEING WELCOMED IS INFORMATION. The monster-life
    //      brief's "watching is the reward" arrives here early, through a sound bug.
    //    ⚠ Draft wording, flagged for Mark's red pen — especially the Japanese.
    APPLAUSE: {
        tier: 'INFORMATION', significance: 'normal', speaker: 'MONSTER', channelType: 'social',
        text: 'The crew applauds you!', textJa: '一同が拍手を送る！',
        why: 'a deaf player currently gets NOTHING when the room applauds them.',
    },
    CURTAIN_BOW: {
        tier: 'INFORMATION', significance: 'normal', speaker: 'MONSTER', channelType: 'social',
        text: 'The crew bows to you.', textJa: '一同が深々と礼をする。',
        why: 'the win is acknowledged and, without this, only in a channel they cannot hear.',
    },

    // ── INFORMATION · SPEECH — these need a text alternative under WCAG 1.2.1 regardless ───────── [REF#AY-00107]
    HOW_RUDE: {
        tier: 'INFORMATION', significance: 'normal', speaker: 'STARLETTE', channelType: 'social',
        text: 'How rude!', textJa: '失礼ね！',
        why: 'prerecorded SPEECH (succubus.how-rude.mp3). 1.2.1 wants the words, not a description.',
    },
    HIT: {
        tier: 'INFORMATION', significance: 'normal', speaker: 'MONSTER', channelType: 'combat',
        text: 'Baka! Stupid!', textJa: 'ばか！あほ！',
        why: 'prerecorded SPEECH (baka-stupid.mp3), a taunt on being hit. Same 1.2.1 argument.',
    },

    // ── ATMOSPHERE — no text. The event is already visible; a line would be noise. ─────────────── [REF#AY-00108]
    DEATH:       { tier: 'ATMOSPHERE', why: 'the body visibly dies and the log already carries a line' },
    GHOST_DEATH: { tier: 'ATMOSPHERE', why: 'same' },
    MUMMY_HIT:   { tier: 'ATMOSPHERE', why: 'hit confirmation, alongside visible damage feedback' },
    MIMIC_HIT:   { tier: 'ATMOSPHERE', why: 'same' },

    // ── ⚠ UNCLASSIFIED — AND THEY MUST NOT DEFAULT TO ATMOSPHERE ──────────────────────────────── [REF#AY-00109]
    //    ATTACK · ATTACK_QUICK · IMP_ATTACK · SLASH · MUMMY_ATTACK are incoming-attack warnings.
    //    They are twinned ONLY IF a visible wind-up animation actually plays AND is on-screen from
    //    where the player is standing, and NEITHER has been verified. A6's muted playthrough decides.
    //    They are ABSENT from this table rather than listed as ATMOSPHERE, because an absent row is
    //    a question and an ATMOSPHERE row is an answer — and writing the answer we have not measured
    //    is the exact fakery this whole programme exists to prevent.
});

/* Lookup used by the sound controller. Returns null for anything unlabelled — including the tags [REF#AY-00110]
 * deliberately withheld above — so the caller stays silent rather than inventing a line. */
window.sfxLabelFor = function (tag) {
    try {
        const row = window.SFX_LABELS[tag];
        return (row && row.tier === 'INFORMATION' && row.text) ? row : null;
    } catch (_) { return null; }
};
