/** [REF#CB-00001]
 * CardExecutor.js — T0.1.D extraction from NewOrigami.Engine9.html
 *
 * Combat damage tables and card classification helpers.
 * No Three.js dependency. No shared mutable state.
 *
 * ──────────────────────────────────────────────────────────────────────
 * COMBAT CONSOLIDATION — 2026-05-27 user mandate.
 *
 * This file IS the table-of-truth for raw damage rolls (MISSILE_TABLE,
 * SPELL_DICE, MELEE_BASE, element multipliers). It STAYS here. What
 * moves elsewhere (in phased commits with separate user approval):
 *
 *   - Phase 3: the floor-decay × multiplier (1.5 → 0.9, currently
 *     applied at lines ~192/228/243) moves into OniBaba.requestDamage-
 *     Multiplier(). CardExecutor will then return BASE rolls only;
 *     CombatOrchestrator combines base + OniBaba modifier + element
 *     variant + crit into the final damage.
 *
 *   - Phase 5: where safe, hardcoded inline monster damage in
 *     Engine9.html (Boulder, Cyclone, Gale, Tide, Yakuza shuriken/
 *     star/pistol) gets lifted into a new MONSTER_ATTACK_TABLE here.
 *
 * Entry point for NEW combat work: js/v8/combat/CombatOrchestrator.js
 * (see its header for the phased migration plan + scatter index).
 * ──────────────────────────────────────────────────────────────────────
 *
 * Exports:
 *   MISSILE_TABLE, CARD_TYPES, EL_COLORS       — data constants
 *   cardElement(name)                           — element string from card name
 *   cardCategory(name)                          — category string from card name
 *   getMissileTable(cardName)                   — returns missile stats object
 *   isMissileCard(name)                         — boolean
 *   isShurikenCard(name)                        — boolean
 *   createCombatCalc(getDungeonLevel, getPlayerStats)
 *       → { calcDamage, calcMissileDamage, calcSpellDamage }
 *
 * Wire-up pattern in Engine9.html:
 *   const { calcDamage, calcMissileDamage, calcSpellDamage } =
 *       createCombatCalc(() => DUNGEON_LEVEL, () => playerStats);
 */

// ── Data constants ───────────────────────────────────────────────────────────── [REF#CB-00002]

/** Missile damage tables: { min, max, crit, critMult } [REF#CB-00003]
 *  PISTOL is the only firearm and keeps its full damage band. All other
 *  missile weapons take a flat 50% damage cut per user (shuriken / bows /
 *  daggers / arrows / crossbows / DEFAULT). The crit chance + mult are
 *  unchanged — only base min/max are halved.
 */
// User mandate 2026-05-27 (round 2) — "bows are too overpowered, reduce [REF#CB-00004]
// number of dice by 1 for each type LONG BOW / SHORT BOW / SAMURAI BOW
// / MAGIC MISSILE. SHURIKEN and DAGGERS (thrown) need to be half that
// power of BOWS". All missile formulas now scale by playerLevel ×
// dungeon-bonus × elemental-variant (unified path in calcMissileDamage).
export const MISSILE_TABLE = {
    // Thrown weapons — roughly half the bow base damage band [REF#CB-00005]
    SHURIKEN:  { min: 10, max: 13, crit:0.20, critMult:1.5 },   // = SAMURAI(13-18) × 0.75 (Mark 2026-06-17); was 2-6 [REF#CB-00006]
    DAGGER:    { min: 9, max: 14,  crit:0.18, critMult:1.8 },   // Mark 2026-07-19 "increase dagger damage": was 2-8 (avg 5) while the SHURIKEN beside it is 10-13 (avg 11.5) — a thrown dagger did LESS THAN HALF a thrown star, which is why it felt useless. Now 9-14 (avg 11.5), i.e. shuriken-class, and it keeps its higher 1.8x crit so the dagger stays the swingy pick rather than a straight upgrade. Crit rate nudged 0.15 -> 0.18. [REF#CB-00007]
    // Bows + magic missile — each reduced by one die (~30%) [REF#CB-00008]
    // SHORT/LONG bows mirror SAMURAI profile at 20% less raw damage
    // (user mandate 2026-05-28). Same crit/critMult so the curve feels
    // consistent across the bow line; only the band shifts down.
    SHORT_BOW: {
        min: 10, max: 14, crit: 0.15, critMult: 2.2,            // = SAMURAI × 0.8 [REF#CB-00009]
        draw_depth_percentage: 0.5,
        stats: {
            base_damage: 12,                                    // = SAMURAI base × 0.8 [REF#CB-00010]
            draw_weight_lb: 45,
            projectile_speed_modifier: 1.2,
            critical_multiplier: 2.2,
            durability_max: 100
        },
        metadata: {
            material: "Red Wood/Gold Trim",
            bow_type: "Recurve",
            is_drawn: true
        }
    },
    LONG_BOW:    { min: 10, max: 14, crit:0.15, critMult:2.2 }, // = SAMURAI × 0.8 [REF#CB-00011]
    // COMPOSITE BOW (Mark 2026-09-21: "small bows, long bows too + composite bows wwhich shoot longer [REF#CB-00104]
    // range") — sits between LONG_BOW and SAMURAI_BOW on damage; its real distinction is RANGE, not
    // dice (see the per-card maxRangeTiles table in Engine9's missile spawn, ~:85301, not this table).
    COMPOSITE_BOW: { min: 12, max: 16, crit:0.16, critMult:2.2 },
    SAMURAI_BOW: { min: 13, max: 18, crit:0.15, critMult:2.2 }, // reference (unchanged) [REF#CB-00012]
    // ★ THE STRONGEST RANGED WEAPON IN THE GAME, AND IT MUST STAY THAT WAY (Mark 2026-08-12: [REF#CB-00013]
    //   "pistols need 2x more damage. they should be the most powerful ranged weapon, hence its
    //   6-shot limit"). Doubled EXACTLY, 9-13 → 18-26 (avg 11 → 22). It was the weakest band on
    //   this table apart from the 0-dmg CAMERA and the DEFAULT fallback — a .45 hit for less than
    //   a thrown star, which is why the 6-round cap read as pure punishment.
    //   The band is the PRICE OF THE CAP: 6 rounds + a RELOAD cooldown, versus SAMURAI_BOW's 12
    //   arrows at 13-18. If any future weapon's avg passes 22, this row must move up with it or
    //   the cap stops buying anything. crit 0.30 / ×2.5 is untouched — the ceiling was already
    //   the swing, and doubling both would have quadrupled the top end.
    PISTOL:      { min: 18, max: 26, crit:0.30, critMult:2.5 }, // was 9-13 (2026-05-27 halving); before that 14-18. Also matches MAGIC MISSILE. [REF#CB-00014]
    // ADVENTURER's CAMERA (Mark 2026-08-03: "a copy of the magic missile card … fires a blinding [REF#CB-00015]
    // flash"). Damage is authored ZERO on purpose — the payload is the blind-stun applied in
    // _onMissileHit (Engine9), per the card's "(STUN 5 TURNS)" attr in data/cards.json. Keeping it
    // in this table (rather than special-casing) lets the whole missile pipeline treat it normally.
    CAMERA:      { min:  0, max:  0, crit:0.00, critMult:1.0 },
    DEFAULT:     { min:  4, max: 10, crit:0.10, critMult:1.5 }, // fallback band [REF#CB-00016]
};

/** Non-missile card types (melee / items): { baseDmg, scaling } [REF#CB-00017] */
// KATANA MOVE-SET (Mark GO 2026-08-06, lane 2A): SLASH / THRUST / HEAVY are now REACHABLE categories [REF#CB-00018]
// (see cardCategory below — they previously all collapsed into COMBAT, making every melee name
// mechanically identical; the old SLASH row {16,1.2} sat here unreachable since it was authored).
// Values follow the fpvDmg ladder authored in CardDatabase.js (SLASH 15 · KATANA 18 · THRUST 20):
// light-fast / single-target-hard / slow-AoE. A bare KATANA swing (no move chosen) stays COMBAT.
// Per-move cadence lives engine-side in _playerAttackReady (window._meleeMoveCdMul).
export const CARD_TYPES = {
    SPELL:   { baseDmg:10, scaling:1.0 }, // overridden by calcSpellDamage [REF#CB-00019]
    COMBAT:  { baseDmg:14, scaling:1.1 },
    ITEM:    { baseDmg:6,  scaling:0.8 },
    SLASH:   { baseDmg:15, scaling:1.0 },
    THRUST:  { baseDmg:20, scaling:1.0 },
    HEAVY:   { baseDmg:26, scaling:1.0 }, // matches HARD ATTACK's authored "+25 ATK · slow" attr [REF#CB-00020]
    DEFAULT: { baseDmg:10, scaling:1.0 }
};

/** Elemental colour palette for projectile VFX [REF#CB-00021] */
export const EL_COLORS = {
    FIRE:    { beam:0xff5500, spark:0xffaa00, hit:0xff2200 },
    WATER:   { beam:0x00aaff, spark:0x88ddff, hit:0x0066ff },
    EARTH:   { beam:0x885522, spark:0xccaa55, hit:0x553300 },
    WIND:    { beam:0x88ffcc, spark:0xccffee, hit:0x44ddaa },
    VOID:    { beam:0xaa00ff, spark:0xff88ff, hit:0x6600cc },
    DEFAULT: { beam:0xffffff, spark:0xddffff, hit:0xaaaaff }
};

// ── Pure classification helpers ──────────────────────────────────────────────── [REF#CB-00022]

/** Returns elemental string ('FIRE', 'WATER', 'EARTH', 'WIND', 'VOID', 'DEFAULT') [REF#CB-00023] */
export function cardElement(name) {
    const n = (name || '').toUpperCase();
    if (/FIRE|FLAME|INFERNO|PYRO/.test(n))        return 'FIRE';
    if (/WATER|WAVE|AQUA|TIDE|FLOOD/.test(n))     return 'WATER';
    if (/EARTH|ROCK|STONE|BOULDER|QUAKE/.test(n)) return 'EARTH';
    if (/WHIRLPOOL/.test(n))                             return 'WATER';   // before WIND: a whirlpool is water
    if (/WIND|AIR|STORM|GALE|CYCLONE|VORTEX/.test(n))    return 'WIND';
    if (/VOID|SHADOW|DARK|DEATH/.test(n))         return 'VOID';
    return 'DEFAULT';
}

/** Returns category string ('SPELL', 'SLASH', 'THRUST', 'HEAVY', 'COMBAT', 'ITEM', 'RANGED', 'DEFAULT') [REF#CB-00024] */
export function cardCategory(name) {
    const n = (name || '').toUpperCase();
    if (/FIREBALL|LIGHTNING|SPELL|ARCANE|BOLT|BLAST|NOVA|TIDE|SURGE|GALE|CYCLONE|BOULDER|FISSURE|COMET|PYROBLAST|VORTEX|WHIRLPOOL/.test(n))   return 'SPELL';
    // MOVE-SET SPLIT (Mark GO 2026-08-06): the named moves route to their own CARD_TYPES rows. [REF#CB-00025]
    // Order matters — THRUST/HEAVY before the generic blade catch-all. STRONG covers the
    // "STRONG ATTACK" alias buildDeckLayout uses for HARD ATTACK (documented name mismatch).
    if (/THRUST/.test(n))               return 'THRUST';
    if (/HEAVY|HARD|STRONG/.test(n))    return 'HEAVY';
    if (/SLASH/.test(n))                return 'SLASH';
    if (/STRIKE|SWORD|KATANA|BLADE|BULLY CLUB/.test(n))   // BULLY CLUB = katana damage (Mark 2026-09-26)
      return "COMBAT";
    // WEAPON (+N), the enchanted weapon (2026-10-02, knowledge/design/ENCHANTED_WEAPON_2026-10-02.md): katana damage; the engine adds its +N [REF#CB-00105]
    if (/^WEAPON \(\+\d+\)$/.test(n))   return "COMBAT";
    if (/POTION|SCROLL|LANTERN|ITEM|RING/.test(n))                    return 'ITEM';
    // ── MISSILE IS RANGED (2026-09-01) ──────────────────────────────────────────────────────── [REF#CB-00096]
    //    The two were already siblings everywhere downstream — `_PILL_LABEL` (Engine9 ~:43497) has
    //    relabelled MISSILE to "RANGED" for the player for a long time, DAGGER already returned
    //    RANGED on the line below, and several checks listed both. This finishes that migration so
    //    the internal token matches what the player has been reading, and so the four-type taxonomy
    //    (MELEE / RANGED / SPELL / ITEM) actually holds.
    //    ⚠ MAGIC MISSILE IS A SPELL AND MUST NOT BE SWEPT IN. It only ever landed here because the
    //      pattern below contains the substring MISSILE — a name collision, not a classification.
    //      This branch runs FIRST so the collision cannot re-form.
    //    ⚠ CATEGORY IS NOT THE DAMAGE TABLE. `getMissileTable` (below) is keyed by WEAPON NAME, a
    //      different axis, and is deliberately untouched — renaming it would orphan every lookup.
    //      Acceptance test for this change: every damage table byte-identical, only the label moves.
    //    ⚠ CATEGORY IS NOT THE CARD ART EITHER. `spawnLootCard`'s `catId` doubles as the scene
    //      element id (`let elId = catId`), and Panels renders a DIFFERENT model for 'MISSILE' (an
    //      8-point throwing star, ~:11651) than for 'RANGED' (~:12222). Those literals therefore
    //      stay where they are; moving them is an art change wearing a rename's clothes.
    if (/MAGIC MISSILE/.test(n))                                      return 'SPELL';
    if (/BOW|SHURIKEN|ARROW|CROSSBOW|MISSILE|PISTOL|GUN|FIREARM|CAMERA/.test(n)) return 'RANGED';
    if (/DAGGER/.test(n))                                             return 'RANGED';
    return 'DEFAULT';
}

/** Returns a copy of the appropriate MISSILE_TABLE entry for the named card [REF#CB-00026] */
export function getMissileTable(cardName) {
    const n = (cardName || '').toUpperCase();
    // PISTOL/GUN must match before generic BOW/etc patterns. Falling through [REF#CB-00027]
    // to DEFAULT (10–25 dmg) made the firearm hit softer than a shuriken.
    if (/CAMERA/.test(n))                                    return { ...MISSILE_TABLE.CAMERA,    isCrit: false };   // before PISTOL/BOW patterns — 0-dmg flash, see table note
    if (/PISTOL|FIREARM|GUN|REVOLVER|MAGIC (AUTO )?MISSILE/.test(n)) return { ...MISSILE_TABLE.PISTOL,    isCrit: false };   // +AUTO 2026-09-11: MAGIC AUTO MISSILE (MAC-9) rolls the pistol band per round
    if (/SHURIKEN|THROWING STAR/.test(n))                    return { ...MISSILE_TABLE.SHURIKEN,  isCrit: false };
    if (/SAMURAI BOW|SAMURAI/.test(n))                       return { ...MISSILE_TABLE.SAMURAI_BOW, isCrit: false };
    if (/COMPOSITE BOW|COMPOSITE/.test(n))                   return { ...MISSILE_TABLE.COMPOSITE_BOW, isCrit: false };
    if (/LONG BOW|LONGBOW/.test(n))                          return { ...MISSILE_TABLE.LONG_BOW,  isCrit: false };
    if (/SHORT BOW|SHORTBOW|RECURVE/.test(n))                return { ...MISSILE_TABLE.SHORT_BOW, isCrit: false };
    if (/CROSS ?BOW/.test(n))                                return { ...MISSILE_TABLE.SHORT_BOW, isCrit: false };
    if (/DAGGER/.test(n))                                    return { ...MISSILE_TABLE.DAGGER,    isCrit: false };
    return { ...MISSILE_TABLE.DEFAULT, isCrit: false };
}

/** Returns true if the card fires a projectile [REF#CB-00028] */
export function isMissileCard(name) {
    const n = (name || '').toUpperCase();
    return /LONG BOW|LONGBOW|SHORT BOW|SHORTBOW|BOW|SHURIKEN|CROSSBOW|BOLT|DAGGER|THROWING|PISTOL|GUN|FIREARM|MISSILE|CAMERA/.test(n);  // +MISSILE 2026-06-02: "MAGIC MISSILE" (PISTOL alias) was routing to launchCard (spell) not launchMissile → no pistol auto-aim. +CAMERA 2026-08-03: the ADVENTURER's flash must route to launchMissile for auto-aim/homing, not launchCard.
}

/** Returns true if the card specifically throws a shuriken [REF#CB-00029] */
export function isShurikenCard(name) {
    return /SHURIKEN|THROWING STAR|STAR/.test((name || '').toUpperCase());
}

// ── Damage calculation factory ───────────────────────────────────────────────── [REF#CB-00030]

/** [REF#CB-00031]
 * createCombatCalc(getDungeonLevel, getPlayerStats)
 *
 * Returns damage calculation functions that close over live references to
 * DUNGEON_LEVEL and playerStats. Pass getter lambdas so the module never
 * holds stale copies of mutable game state.
 *
 * @param {() => number}  getDungeonLevel  - () => DUNGEON_LEVEL
 * @param {() => {level:number, skill:number}} getPlayerStats - () => playerStats
 * @param {(cardName: string) => number} [getWeaponCdMs] - () => the card's live attack-rate cooldown
 *        in ms (Engine9's `_weaponCdMs(_weaponKey(name))`). OPTIONAL — omit for a caller with no
 *        notion of weapon speed (e.g. a standalone test) and the multiplier below no-ops to 1.0.
 * @returns {{ calcDamage, calcMissileDamage, calcSpellDamage }}
 */
export function createCombatCalc(getDungeonLevel, getPlayerStats, getWeaponCdMs) {
    // Per-element multipliers for elemental missile variants (FIRE/FROST/etc). [REF#CB-00032]
    // Status effects (slow/stun/push) get wired separately when cards land.
    const MISSILE_VARIANT_MUL = {
        FIRE:    1.5,   // burning + extra dmg [REF#CB-00033]
        WATER:   1.2,   // frost — adds slow effect (not yet wired) [REF#CB-00034]
        EARTH:   1.3,   // adds stun (not yet wired) [REF#CB-00035]
        WIND:    1.1,   // adds push (not yet wired) [REF#CB-00036]
        VOID:    1.6,   // shadow / dark damage [REF#CB-00037]
        DEFAULT: 1.0,
    };

    // ── DEPTH ADJUSTMENT — NEUTRALISED (Mark 2026-07-19: "damage increase per level is 50% too much"). [REF#CB-00038]
    // WAS: `1.5 - ((dLvl - 1) * 0.10)` clamped to floor 7 — a flat +50% damage bonus on floor 1 decaying to
    // -10% by floor 7. THAT 1.5 IS THE "50% too much", and its SIGN IS BACKWARDS for progression: the player
    // got weaker the deeper they went, while monster damage never scaled at all (a hardcoded 5-12 on every
    // floor forever). It also hard-clamped at 7, so in an infinite dungeon it was a permanent 0.9.
    // Now 1.0 — depth scaling belongs to the explicit dungMult terms below, which ARE gradual and unbounded,
    // not to a hidden multiplier that fights them. Knob: window._dmgDepthAdj to restore a curve.
    function _getLevelAdjustment() {
        const k = (typeof window !== 'undefined' && typeof window._dmgDepthAdj === 'number') ? window._dmgDepthAdj : 1.0;
        return k;
    }

    // ── WEAPON SPEED → DAMAGE (Mark 2026-08-07: "skills + level + weapon + weapon speed / monster [REF#CB-00039]
    // armor" need to be accounted for, "same thing we did for melee" — melee already differentiates
    // by MOVE via CARD_TYPES; ranged differentiated by nothing until now despite bow/crossbow having
    // clearly different real draw speeds). SINGLE SOURCE OF TRUTH BY DESIGN: no new per-weapon "speed"
    // table — this reads the SAME cooldown number Engine9's `_weaponCdMs` already uses to gate fire
    // rate (injected via `getWeaponCdMs`), so tuning a weapon's cadence in one place automatically
    // keeps its damage in proportion with zero second edit and no chance of the two drifting apart.
    // REF_MS = today's pre-existing bow/dagger/shuriken baseline, chosen so every weapon already at
    // that speed sees EXACTLY 0% change from this landing — this is a differentiator for weapons that
    // deviate from it, not a global rebalance. `_weaponSpeedBias` (default 0.6) is a straight DPS-
    // parity dial: 0 = pure rate-gate, no damage effect (yesterday's behavior) · 1 = full parity (a
    // slower weapon's extra per-hit damage exactly cancels its slower rate) · the 0.6 default sits
    // between the two on purpose — a slow weapon still nets MORE total dps than a fast one as a small
    // reward for the commitment of a longer swing/draw, matching how weapon-speed reads in most RPGs,
    // without being a full clinical wash. Clamped to a sane band so no weapon's damage becomes absurd.
    const WEAPON_SPEED_REF_MS = 700;
    function _weaponSpeedDmgMul(cardName) {
        // MAGIC MISSILE IS EXEMPT (2026-10-16, CODER 1, Mark: "often takes all 6 shots to take down something"): its cooldown is the [REF#CB-00106]
        //    fastest in the game (500 ms × 0.66 fire-rate × adaptive pace ≈ 180-330 ms), so this penalty sat at its 0.6-0.68 floor and ate
        //    ~35-40% of every shot — punishing an animation-clear floor (06-29 ruling), not a tactical choice. Opt back in:
        //    window._magicMissileSpeedPenalty = true.
        if (/MAGIC (AUTO )?MISSILE/i.test(String(cardName || '')) && !(typeof window !== 'undefined' && window._magicMissileSpeedPenalty === true)) return 1.0;
        if (typeof getWeaponCdMs !== 'function') return 1.0;
        let cdMs;
        try { cdMs = getWeaponCdMs(cardName); } catch (_) { return 1.0; }
        if (!Number.isFinite(cdMs) || cdMs <= 0) return 1.0;
        const bias = (typeof window !== 'undefined' && typeof window._weaponSpeedBias === 'number') ? window._weaponSpeedBias : 0.6;
        const parity = cdMs / WEAPON_SPEED_REF_MS;              // 1.0 at reference speed; >1 for a SLOWER weapon (bigger cd), <1 for a faster one [REF#CB-00040]
        return Math.max(0.6, Math.min(1.8, 1 + (parity - 1) * bias));
    }

    // ── RANGE → DAMAGE, missiles only (Mark 2026-08-07: "even range for sure"). Full damage inside an [REF#CB-00041]
    // inner ring, a gentle linear taper to a floor beyond it — ONE global curve, not a per-weapon
    // table, because weapon identity is already carried by the speed multiplier above; range doesn't
    // need its own bespoke curve per bow to "acknowledge" it, per Mark's "keep it basics" ask. Distance
    // is optional (undefined ⇒ no falloff) so every existing non-distance-aware call site is unaffected.
    function _rangeDmgMul(distanceTiles) {
        if (!Number.isFinite(distanceTiles)) return 1.0;
        const inner = (typeof window !== 'undefined' && typeof window._rangeFalloffInnerTiles === 'number') ? window._rangeFalloffInnerTiles : 8;
        const outer = (typeof window !== 'undefined' && typeof window._rangeFalloffOuterTiles === 'number') ? window._rangeFalloffOuterTiles : 16;
        const floorMul = (typeof window !== 'undefined' && typeof window._rangeFalloffFloorMul === 'number') ? window._rangeFalloffFloorMul : 0.7;
        if (outer <= inner || distanceTiles <= inner) return 1.0;
        const t = Math.min(1, (distanceTiles - inner) / (outer - inner));
        return 1 - t * (1 - floorMul);
    }

    function _getSpecializationMultiplier(cardName) {
        const stats = getPlayerStats();
        if (!stats.specializations) return 1.0;
        let mastery = 0;
        const upper = (cardName || '').toUpperCase().trim();
        if (upper.includes('PISTOL') || upper.includes('MISSILE')) mastery = stats.specializations.pistol_mastery || 0;
        else if (upper.includes('SHURIKEN') || upper.includes('STAR')) mastery = stats.specializations.shuriken_mastery || 0;
        else if (upper.includes('BOW')) mastery = stats.specializations.bow_mastery || 0;
        else if (upper === 'DAGGER' || upper === 'KATANA' || upper === 'NINJA SWORD') mastery = stats.specializations.blade_mastery || 0;
        else if (cardCategory && cardCategory(cardName) === 'SPELL') mastery = stats.specializations.spell_mastery || 0;
        else mastery = stats.specializations.blade_mastery || 0; // fallback melee [REF#CB-00042]
        return 1.0 + (Math.min(50, mastery) * 0.01); // +1% per level up to +50% [REF#CB-00043]
    }

    function calcMissileDamage(cardName, distanceTiles) {
        // User mandate 2026-05-27 (round 2): unified scaling for ALL missiles. [REF#CB-00044]
        //   dmg = roll(min..max) × playerLevel × (1 + (dungLvl-1)*0.10) × variantMul
        //   crit applied after (15-30% chance, ×1.5-2.5 multiplier per weapon).
        // Bows had their bands cut by ~1 die; shuriken halved. Daggers stay 2-8.
        // The earlier dagger-only path is now the universal path — bows scale
        // the same way to keep tuning consistent across all ranged.
        const tbl = getMissileTable(cardName);
        const baseRoll = Math.random();
        const base = tbl.min + Math.floor(baseRoll * (tbl.max - tbl.min + 1));
        const lvl  = Math.max(1, (getPlayerStats().level | 0) || 1);
        const dungMul = 1 + (getDungeonLevel() - 1) * 0.10;
        const elem = cardElement(cardName);
        const varMul = MISSILE_VARIANT_MUL[elem] || 1.0;
        // GRADUAL, NOT MULTIPLICATIVE (Mark 2026-07-19 "gradual progression"). This was `base * lvl` — RAW [REF#CB-00045]
        // multiplication by player level, so a level-10 player did TEN TIMES base damage while spells scaled by
        // nothing and melee by +12%/level. Three incompatible laws in one file; missiles won by an order of
        // magnitude and one-shot everything from floor ~10. Now the same +12%/level curve melee already uses,
        // so the three paths finally agree. Knob: window._missileLvlStep.
        const _mStep = (typeof window !== 'undefined' && typeof window._missileLvlStep === 'number') ? window._missileLvlStep : 0.12;
        const lvlMul = 1 + (lvl - 1) * _mStep;
        let dmg = Math.round(base * lvlMul * dungMul * varMul);
        const isCrit = Math.random() < tbl.crit;
        if (isCrit) dmg = Math.round(dmg * tbl.critMult);
        const percent = isCrit
            ? Math.round(90 + Math.random() * 10)
            : Math.round(baseRoll * 100);
            
        // Apply Level-based Buff and Specialization Math [REF#CB-00046]
        const specMul = _getSpecializationMultiplier(cardName);
        const speedMul = _weaponSpeedDmgMul(cardName);
        const rangeMul = _rangeDmgMul(distanceTiles);
        dmg = Math.round(dmg * _getLevelAdjustment() * specMul * speedMul * rangeMul);
        // MAGIC MISSILE ×1.875 per shot (2026-10-16: ×1.5, then +25% more, Mark: "they are pretty weak"), every +N variant too; other ranged weapons unchanged. Knob: window._magicMissileDmgMul. [REF#CB-00107]
        if (/MAGIC MISSILE/i.test(String(cardName || ''))) {
            const _mmMul = (typeof window !== 'undefined' && typeof window._magicMissileDmgMul === 'number') ? window._magicMissileDmgMul : 1.875;
            dmg = Math.round(dmg * _mmMul);
        }

        return { dmg, isCrit, percent };
    }

    // Per-card dice count + flat base. Mirrors the card's `attr` ("DMG * NDICE") [REF#CB-00047]
    // and now applies a +50% damage bump so spells hit hard enough to be
    // worth casting. Each die is d20. Vulnerability is clamped to ≥0.70 in
    // _applyMonsterDamage, so the WORST resisted hit still beats a shuriken.
    //   • Shuriken (baseline):                 1d20 + 10   (10–30)
    //   • 3-dice spells (Tide / Surge / Gale): 3d20 + 23   (26–113)
    //   • 4-dice spells (Fireball / Pyroblast / Comet / Fissure):
    //                                          4d20 + 38   (42–158)
    // BOULDER and TIDE wave roll per-monster in their own systems and apply
    // a separate ×1.5 multiplier — see tickBoulders + tickTideWaves.
    const SPELL_DICE = {
      // 4-dice [REF#CB-00048]
      FIREBALL: 4, PYROBLAST: 4, COMET: 4, FISSURE: 4, BOULDER: 4,
      // 3-dice [REF#CB-00049]
      TIDE: 3, SURGE: 3, GALE: 3, VORTEX: 3,
      // WHIRLPOOL is dice-identical to VORTEX on purpose. A player feels the SUM of the on-cast [REF#CB-00101]
      // roll and the sustained ticks, so damage parity means cloning BOTH halves: this line and
      // the tick schedule in _spawnWhirlpool.
      WHIRLPOOL: 3,
    };
    function _rollDice(count, sides){
      let total = 0;
      for(let i=0;i<count;i++) total += 1 + Math.floor(Math.random()*sides);
      return total;
    }
    function calcSpellDamage(cardName) {
      const upper = (cardName || '').toUpperCase().trim();
      const dice  = SPELL_DICE[upper] || 3;
      // Base bumped +50% over the prior values (15→23, 25→38) [REF#CB-00050]
      const base  = dice === 4 ? 38 : 23;
      
      let dmg = _rollDice(dice, 20) + base;
      const specMul = _getSpecializationMultiplier(cardName);
      // Spell-power stat (vending TIDE/FIREBALL/etc. cards) — scale spell damage [REF#CB-00051]
      // by the player's accumulated spellBonus. getPlayerStats() returns the live
      // playerStats object, so the persisted field is read with no extra plumbing.
      const spellMul = 1 + ((getPlayerStats() || {}).spellBonus || 0);
      // SPELLS NOW SCALE TOO (Mark 2026-07-19). They previously scaled by NOTHING — not player level, not depth — [REF#CB-00052]
      // so a fireball did the same damage at level 10 on floor 7 as at level 1 on floor 1, and with the old
      // inverted depth multiplier it actually got 40% WEAKER with depth. Same +12%/level and +10%/floor curve as
      // missiles and melee, so all three damage paths progress identically. Knobs: _spellLvlStep, _spellDepthStep.
      const _sLvl = (typeof window !== 'undefined' && typeof window._spellLvlStep === 'number') ? window._spellLvlStep : 0.12;
      const _sDep = (typeof window !== 'undefined' && typeof window._spellDepthStep === 'number') ? window._spellDepthStep : 0.10;
      const _plvl = Math.max(1, ((getPlayerStats() || {}).level | 0) || 1);
      const lvlMul   = 1 + (_plvl - 1) * _sLvl;
      const depthMul = 1 + Math.max(0, (getDungeonLevel() || 1) - 1) * _sDep;
      return Math.round(dmg * lvlMul * depthMul * _getLevelAdjustment() * specMul * spellMul);
    }

    function calcDamage(cardName) {
        // Missiles are handled separately via calcMissileDamage [REF#CB-00053]
        if (isMissileCard(cardName)) return calcMissileDamage(cardName).dmg;
        const cat = cardCategory(cardName);
        if (cat === 'SPELL') return calcSpellDamage(cardName);
        const { baseDmg, scaling } = CARD_TYPES[cat] || CARD_TYPES.DEFAULT;
        const lvlBonus = 1 + (getPlayerStats().level - 1) * 0.12;
        const dungMult = 1 + (getDungeonLevel() - 1) * 0.10;
        const raw = baseDmg * scaling * lvlBonus * dungMult;
        const roll = 0.80 + Math.random() * 0.40;

        const specMul = _getSpecializationMultiplier(cardName);
        // ITEM (potions/scrolls/lanterns/rings) is excluded — these aren't weapons with a draw/swing [REF#CB-00054]
        // cadence, and `_weaponKey` would otherwise silently fold them into the generic 'melee' speed
        // bucket, nudging their damage for no in-fiction reason.
        const speedMul = (cat === 'ITEM') ? 1.0 : _weaponSpeedDmgMul(cardName);
        return Math.round(raw * roll * _getLevelAdjustment() * specMul * speedMul);
    }

    return { calcDamage, calcMissileDamage, calcSpellDamage };
}

export default createCombatCalc;
