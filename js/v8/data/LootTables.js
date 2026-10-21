/** [REF#DA-00031]
 * LootTables.js — the loot database (Mark 2026-07-19).
 *
 * "make sure level boss drop a random magical item loot card that enhances melee ranged or magic armor,
 *  which adds additional element attributes - create a database of this where we keep our loot database."
 *
 * WHY A SEPARATE FILE: loot rules were scattered across _rollMonsterLoot's branches as inline literals —
 * gold amounts, tier pools, drop chances — so "what can drop?" had no single answer. Everything below is
 * DATA. The engine asks it questions; it contains no engine calls, no THREE, no DOM. That means it can be
 * unit-probed on its own and edited without touching the 3.4 MB engine file both seats are fighting over.
 */

/* ── GOLD ──────────────────────────────────────────────────────────────────────────────────────────── [REF#DA-00032]
   Mark: "gold floor yes 50gold is minimum can usually go from 50gold (90%) of time to 75g and 100g.
   a boss will drop 100-1000g floor, more for lower levels."
   The 90/7/3 split keeps 50 the everyday drop while leaving a real, uncommon lift — a 100g coin should
   feel like luck, not like the baseline drifting up. */
export const GOLD_TIERS = [
    { amount: 50,  weight: 0.90 },
    { amount: 75,  weight: 0.07 },
    { amount: 100, weight: 0.03 },
];

/* Boss purse: 100–1000, scaled by depth. "more for lower levels" = the deeper you go, the bigger the [REF#DA-00033]
   haul (deeper floors are the LOWER levels of a dungeon). L1 sits near the floor of the band; the top of
   the band is reached around L7, and it is clamped so a runaway DUNGEON_LEVEL cannot mint infinite gold. */
export const BOSS_GOLD = { min: 100, max: 1000, levelSpan: 7 };

export function rollGold(rand = Math.random) {
    const r = rand();
    let acc = 0;
    for (const t of GOLD_TIERS) { acc += t.weight; if (r < acc) return t.amount; }
    return GOLD_TIERS[0].amount;   // float-drift guard: never return undefined [REF#DA-00034]
}

export function rollBossGold(level = 1, rand = Math.random) {
    const t = Math.max(0, Math.min(1, ((level || 1) - 1) / Math.max(1, BOSS_GOLD.levelSpan - 1)));
    const lo = BOSS_GOLD.min + (BOSS_GOLD.max - BOSS_GOLD.min) * t * 0.5;   // floor rises with depth [REF#DA-00035]
    const hi = BOSS_GOLD.min + (BOSS_GOLD.max - BOSS_GOLD.min) * t;
    const g  = lo + rand() * Math.max(1, hi - lo);
    return Math.max(BOSS_GOLD.min, Math.min(BOSS_GOLD.max, Math.round(g / 25) * 25));   // round to a readable 25 [REF#DA-00036]
}

/* ── ELEMENTS ──────────────────────────────────────────────────────────────────────────────────────── [REF#DA-00037]
   The five the engine already speaks. A magical item grants ONE — "adds additional element attributes". */
export const ELEMENTS = ['FIRE', 'WATER', 'EARTH', 'WIND', 'VOID'];
export const ELEMENT_KANJI = { FIRE: '火', WATER: '水', EARTH: '地', WIND: '風', VOID: '空' };

/* ── MAGICAL AFFIXES — the boss drop table ─────────────────────────────────────────────────────────── [REF#DA-00038]
   Mark: "a random magical item loot card that enhances melee ranged or magic armor".
   Four enhancement CLASSES, each with its own prefix names so the drop reads as an artefact rather than
   "SWORD +1". `bonus` is the mechanical lift; `slot` says what it enhances so the AC/damage systems can
   route it without string-sniffing the title. */
export const AFFIX_CLASSES = {
    MELEE:  { key: 'MELEE',  enhances: 'melee',  kanji: '斬', names: ['ONI-FANGED', 'BLOODLETTING', 'TEMPERED', 'RONIN\'S'] },
    RANGED: { key: 'RANGED', enhances: 'ranged', kanji: '弓', names: ['FARSEEKING', 'WHISPERING', 'HAWK-EYED', 'SILENT'] },
    MAGIC:  { key: 'MAGIC',  enhances: 'magic',  kanji: '術', names: ['ARCANE', 'STARWOVEN', 'FOXFIRE', 'MOONLIT'] },
    ARMOR:  { key: 'ARMOR',  enhances: 'armor',  kanji: '鎧', names: ['WARDED', 'STONESKIN', 'ANCESTRAL', 'LACQUERED'] },
};

/* ── THE ENCHANTED WEAPON — WEAPON (+N) (2026-10-02; the order's words are in knowledge/design/ENCHANTED_WEAPON_2026-10-02.md) ── [REF#DA-00258]
   A melee loot card whose whole name is its enchantment, NetHack's rule: +N to hit (each point a +1 on the d20 — +5%) and +N damage per
   hit while it is the wielded weapon (the engine reads window._playerWeapon). N by floor: floor 1 always +1; deeper, start at +1 and step
   up with a 1-in-3 chance each time, capped at floor + 1 — floor 2 gives +1 (2/3), +2 (2/9), +3 (1/9). Pure: the caller passes the rng. */
export function rollEnchantedWeapon(level = 1, rand = Math.random) {
    const L = Math.max(1, level | 0), cap = (L === 1) ? 1 : Math.min(9, L + 1);
    let n = 1; while (n < cap && rand() < (1 / 3)) n++;
    return { catId: 'KATANA', title: `WEAPON (+${n})`, desc: 'Enchanted weapon.', kanji: '刀', attr: `(+${n} HIT · +${n} DMG)`, magical: true, enhances: 'melee', bonus: n };
}

/* Bonus scales with depth but stays small — this is a flavour artefact, not a power spike. [REF#DA-00039] */
export function rollMagicalItem(level = 1, rand = Math.random) {
    const classes = Object.values(AFFIX_CLASSES);
    const cls = classes[Math.floor(rand() * classes.length)];
    // the MELEE artefact was a card no hand knew ("ONI-FANGED BLADE +N": counted, never dealt, never armed) — it is the enchanted weapon now [REF#DA-00259]
    if (cls.key === 'MELEE') return rollEnchantedWeapon(level, rand);
    const el  = ELEMENTS[Math.floor(rand() * ELEMENTS.length)];
    const name = cls.names[Math.floor(rand() * cls.names.length)];
    const bonus = 1 + Math.floor(Math.min(3, (level || 1) / 3));   // +1 early, +2 mid, capped +3 (never +4: see note) [REF#DA-00040]
    const base = { MELEE: 'BLADE', RANGED: 'BOW', MAGIC: 'CHARM', ARMOR: 'PLATE' }[cls.key];
    return {
        catId: cls.key === 'ARMOR' ? 'ITEM' : (cls.key === 'MAGIC' ? 'SPELLS' : (cls.key === 'RANGED' ? 'MISSILE' : 'KATANA')),
        title: `${name} ${base} +${bonus}`,
        desc:  `${el} ${cls.enhances} artefact.`,
        kanji: ELEMENT_KANJI[el] || cls.kanji,
        attr:  `(${cls.enhances.toUpperCase()} +${bonus} · ${el})`,
        magical: true,
        enhances: cls.enhances,
        element: el,
        bonus,
    };
}

/* ── SPECIAL ATTRIBUTE CARDS — BOSS LOOT ONLY (Mark 2026-09-14) ──────────────────────────────────── [REF#DA-00237]
   "not every person gets a pet in nethack - you need to find them so add a PET SUMMONS as a LOOT CARD = BOSS LOOT
    ONLY. Same with every special attribute? I think it would be great reason to farm. I can see a bunch of kids
    saving and restoring at a chance for a SUMMONS card to drop."
   The four role attribute cards. Each stays with the role it defines — SUMMON is the Wizard's (Mark, same day, last
   word: "the game only has the summons card for a pet. the wizard gets one") — and joins this pool for everyone else,
   FOUND off a level boss (isBoss / isSupervisor: the Manager, the Yakuza Level Supervisor, the throne), so a samurai
   can farm SUMMON or NINJA STEALTH. A card the
   player already holds is skipped, so the farm narrows to what is missing; when nothing is missing the boss pays
   its magical artefact as before. The roll is Math.random at kill time — never the run seed — which is exactly
   what makes save → fight → restore a real farm and not a fixed answer. Knobs (engine side): window._specialDropChance,
   window._bossSpecials = false. */
export const SPECIAL_DROP_CHANCE = 0.30;
export const BOSS_SPECIALS = [
    { title: 'SUMMON',        kanji: '召', desc: 'A summoning circle folded into a card. The pets\' home.', attr: 'PUPPY & KITTEN', weight: 4, minLevel: 1 },
    { title: 'BANZAI',        kanji: '万', desc: 'A war cry, learned the hard way.',                        attr: '×2 MELEE',       weight: 2, minLevel: 1 },
    { title: 'NINJA STEALTH', kanji: '忍', desc: 'The trick of not being there.',                           attr: 'VANISH 30S',     weight: 2, minLevel: 2 },
    { title: 'RELOAD',        kanji: '装', desc: 'Six more, in one motion.',                                 attr: 'RELOAD',         weight: 1, minLevel: 3 },
];
export function rollBossSpecial(level = 1, held = [], rand = Math.random, chance = SPECIAL_DROP_CHANCE) {
    const have = new Set((held || []).map(t => String(t || '').toUpperCase()));
    const pool = BOSS_SPECIALS.filter(s => s.minLevel <= (level || 1) && !have.has(s.title));
    if (!pool.length || rand() >= chance) return null;
    const total = pool.reduce((a, s) => a + s.weight, 0);
    let r = rand() * total;
    for (const s of pool) { r -= s.weight; if (r <= 0) return { catId: 'SKILL', title: s.title, desc: s.desc, kanji: s.kanji, attr: s.attr, special: true }; }
    const s = pool[pool.length - 1];
    return { catId: 'SKILL', title: s.title, desc: s.desc, kanji: s.kanji, attr: s.attr, special: true };
}
export const SPECIAL_TITLES = BOSS_SPECIALS.map(s => s.title);

/* ── MAGIC WEAPON CARDS — BOSS / INSPECTOR LOOT ONLY (Mark 2026-10-03) ────────────────────────── [REF#DA-00238]
   Magic Missile, Magic Auto Missile and the bazooka are not ordinary hallway/worker drops. They are farm prizes from
   bosses or inspectors only, so every legal source asks this table and every ordinary weapon table omits them. */
export const MAGIC_WEAPON_DROP_CHANCE = 0.22;
export const MAGIC_WEAPON_DROPS = [
    { catId: 'PISTOL', title: 'MAGIC MISSILE',      desc: 'Arcane projectile.',          kanji: '銃', attr: '20-60 DMG', bossOrInspectorOnly: true, weight: 4 },
    { catId: 'RANGED', title: 'MAGIC AUTO MISSILE', desc: 'MAC-9, three-round bursts.',  kanji: '連', attr: '×3 BURST',  bossOrInspectorOnly: true, weight: 2 },
    { catId: 'RANGED', title: 'WAND OF FIREBALLS',  desc: 'Bazooka. 2.36-inch rockets.', kanji: '爆', attr: 'AREA BLAST', bossOrInspectorOnly: true, weight: 1 },
];
export const MAGIC_WEAPON_TITLES = MAGIC_WEAPON_DROPS.map(s => s.title);

export function rollMagicWeaponDrop(rand = Math.random, chance = MAGIC_WEAPON_DROP_CHANCE) {
    if (rand() >= chance) return null;
    const total = MAGIC_WEAPON_DROPS.reduce((a, s) => a + (s.weight || 1), 0);
    let r = rand() * total;
    for (const s of MAGIC_WEAPON_DROPS) { r -= (s.weight || 1); if (r <= 0) return Object.assign({}, s); }
    return Object.assign({}, MAGIC_WEAPON_DROPS[MAGIC_WEAPON_DROPS.length - 1]);
}

/* ── WEAPONS ───────────────────────────────────────────────────────────────────────────────────────── [REF#DA-00041]
   Mark 2026-08-15: "scarcity is true + part of the progression … BUT want to add more types of loot
   drops, from equipment to weapons. not just standard gold all time. but yes its level 1, so it must be
   level determined."

   WHAT WAS ACTUALLY WRONG, because it is not what it looks like. A level-determined weapon ladder
   ALREADY EXISTED in Engine9 (`tierPools`, tiers 1–6, gated by `maxAllowedTier = Math.min(6, L)`) — but
   it sits INSIDE the `ud.isImp` branch. Imps are, in that file's own words, "the puny population". So
   every weapon in the game could only ever come from the weakest monster in it, and the entire main
   population returned armour or coins. That is the "standard gold all time" he is describing.
   This pool is therefore NOT a second ladder — it is the same ladder, made reachable, and its level
   bands deliberately MATCH the tierPools ones (shuriken/dagger → short bow → long bow → samurai bow →
   firearm) so the two cannot drift into disagreeing about what level 1 means.

   ⚠ THE NAME IS THE STATS. THIS IS THE WHOLE TRAP. A weapon card's power is resolved by REGEX ON ITS
     TITLE, in js/v8/combat/CardExecutor.js — `getMissileTable()` for ranged, `cardCategory()` for melee.
     A title that matches nothing falls through to DEFAULT (missile 4–10) and you ship a beautiful card
     that hits like wet paper, silently. This is the weapon twin of the documented 'HELMET' vs 'SAMURAI
     HELMET' AC failure. EVERY title below is checked against those two functions by
     scripts/probe-loot-weapons.js, which FAILS if any entry resolves to DEFAULT. Adding a weapon here
     with a new noun means adding it to CardExecutor too — the probe is what tells you.

   ⚠ MELEE NAMES ARE MECHANICALLY IDENTICAL, AND THAT IS DELIBERATE. `cardCategory` sends every blade
     name to COMBAT (baseDmg 14); only SLASH / THRUST / HEAVY are their own rows, and those are the
     MOVE-SET, not weapons. So a KATANA drop is not stronger than a TANTO BLADE — it reads different,
     it is not different. That is the SAME doctrine this file already chose for armour ("variety lives
     in NAME, KANJI and FLAVOUR … every one worth exactly what its region is worth"), applied to blades.
     Do not "fix" it by inventing per-name melee damage: that would contradict the move-set, which is
     where melee power variance actually lives.
     RANGED is the opposite — those names DO carry different bands, so ranged is what `minLevel` gates. */

export const WEAPON_POOL = [
    // ── 刀 MELEE — flavour variety, one shared COMBAT band (see the note above) ── [REF#DA-00042]
    { catId: 'KATANA', title: 'TANTO BLADE',      desc: 'A short blade, worn at the belt.',   kanji: '短刀', attr: '(MELEE)', kind: 'melee',  minLevel: 1 },
    { catId: 'KATANA', title: 'WAKIZASHI BLADE',  desc: 'The companion sword.',               kanji: '脇差', attr: '(MELEE)', kind: 'melee',  minLevel: 1 },
    { catId: 'KATANA', title: 'NINJA SWORD',      desc: 'Straight, blackened, no guard.',     kanji: '忍刀', attr: '(MELEE)', kind: 'melee',  minLevel: 2 },
    { catId: 'KATANA', title: 'KATANA',           desc: 'Folded steel with a long curve.',    kanji: '刀',   attr: '(MELEE)', kind: 'melee',  minLevel: 3 },
    { catId: 'KATANA', title: 'NODACHI BLADE',    desc: 'A field sword, absurdly long.',      kanji: '野太刀', attr: '(MELEE)', kind: 'melee', minLevel: 4 },
    // ── 弓 RANGED — these names DO carry different damage bands, so they are level-gated ── [REF#DA-00043]
    { catId: 'MISSILE', title: 'SHURIKEN',    desc: 'Throwing star.',            kanji: '投',   attr: '(THROWN)', kind: 'ranged', minLevel: 1 },
    { catId: 'MISSILE', title: 'DAGGER',      desc: 'Thrown blade.',             kanji: '刃',   attr: '(THROWN)', kind: 'ranged', minLevel: 1 },
    { catId: 'MISSILE', title: 'SHORT BOW',   desc: 'Light bow, quick to draw.', kanji: '弓',   attr: '(RANGED)', kind: 'ranged', minLevel: 2 },
    { catId: 'MISSILE', title: 'LONG BOW',    desc: 'Heavy bow, long reach.',    kanji: '長弓', attr: '(RANGED)', kind: 'ranged', minLevel: 3 },
    { catId: 'MISSILE', title: 'SAMURAI BOW', desc: 'Japanese recurve.',         kanji: '侍',   attr: '(RANGED)', kind: 'ranged', minLevel: 4 },
];

/* HOW OFTEN A WEAPON DROPS — and why this does NOT loosen scarcity. [REF#DA-00044]
   This roll sits INSIDE the existing coin gate (window._coinDropChance, 0.30), so the share of kills
   that drop ANYTHING is completely unchanged. What changes is only WHAT the 30% pays out: some of the
   coins become steel. Mark asked for more TYPES while explicitly keeping scarcity — so composition
   moves and frequency does not. Anyone raising this number: you are taking from gold, not adding drops.
   Level scales it gently (a deeper floor is a better-armed one) and it is capped so weapons never
   dominate the payout. */
export const WEAPON_DROP_CHANCE = 0.14;
export const WEAPON_DROP_PER_LEVEL = 0.02;
export const WEAPON_DROP_MAX = 0.28;

export function weaponDropChance(level = 1) {
    const l = Math.max(1, Number(level) || 1);
    return Math.min(WEAPON_DROP_MAX, WEAPON_DROP_CHANCE + (l - 1) * WEAPON_DROP_PER_LEVEL);
}

/** Everything this level may drop. Level 1 sees exactly the two thrown weapons and the two short [REF#DA-00045]
 *  blades — lean on purpose, and the same band tierPools calls tier 1. */
export function weaponsForLevel(level = 1) {
    const l = Math.max(1, Number(level) || 1);
    return WEAPON_POOL.filter(w => (w.minLevel || 1) <= l);
}

/** [REF#DA-00046]
 * Roll one weapon appropriate to the floor.
 * @param {number} level   DUNGEON_LEVEL — nothing above it can appear.
 * @param {string} role    player role; a ranged specialist leans ranged, exactly as tierPools does.
 */
export function rollWeapon(level = 1, role = '', rand = Math.random) {
    const pool = weaponsForLevel(level);
    if (!pool.length) return null;
    const r = String(role || '').toUpperCase();
    const rangedRole = r === 'ARCHER' || r === 'SAMURAI' || r === 'GANGSTER' || r === 'NINJA';
    // Weighting mirrors the tierPools rule (MISSILE ×3 for ranged specialists) so a ninja does not [REF#DA-00047]
    // start finding greatswords the moment this path opens up.
    const weights = pool.map(w => (rangedRole && w.kind === 'ranged') ? 3 : 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rand() * total;
    for (let i = 0; i < pool.length; i++) {
        if (roll < weights[i]) return Object.assign({}, pool[i]);
        roll -= weights[i];
    }
    return Object.assign({}, pool[pool.length - 1]);
}

/* ── KARMA AND DUPLICATES ──────────────────────────────────────────────────────────────────────────── [REF#DA-00048]
   Mark: "try to help players by not duplicating same type armor if that is what they have if they are
   under +25 karma blessing. a -25 karma curse -- most loot card items will begin to dupe by that % of
   negative karma. hahahaha."
   Confirmed with him: NO CAP. At −100 karma it is 100% duplicates. "everything else is yeah, damned. :)"

   BLESSING (karma >= +25): the dungeon is kind — a drop that would hand you armour you already own is
   re-rolled toward something you lack. Help, not a guarantee: one re-roll, then it stands.
   CURSE (karma <= −25): duplicateChance = |karma| / 100. At −40 that is 40%; at −100, everything you
   find you already have.
   ⚠ THE ONE EXEMPTION, AND IT IS LOAD-BEARING: boss MAGICAL items are NEVER duped. Mark: "except of
   course for special magical loot items from bosses". Without that exemption a −100 karma run would be
   mathematically unable to receive the one reward that makes killing a boss worth it — the curse would
   stop being a joke and become a dead end. */
export const KARMA = { blessAt: 25, curseAt: -25 };

export function karmaState(karma = 0) {
    if (karma >= KARMA.blessAt) return 'blessed';
    if (karma <= KARMA.curseAt) return 'cursed';
    return 'neutral';
}

/** Chance (0..1) that a drop is forced to duplicate something already held. 0 unless cursed. [REF#DA-00049] */
export function duplicateChance(karma = 0) {
    if (karma > KARMA.curseAt) return 0;
    return Math.max(0, Math.min(1, Math.abs(karma) / 100));   // −100 → 1.0, exactly as he asked [REF#DA-00050]
}

/* ── EQUIPMENT DROPS FROM ORDINARY MONSTERS ────────────────────────────────────────────────────────── [REF#DA-00051]
   Mark: "when monsters die, they have chance to drop equipment loot."
   Deliberately rarer than gold — armour is the thing you hunt for, and the vending machine is the place
   you can rely on. */
export const EQUIPMENT_DROP_CHANCE = 0.12;

/* ── VARIETY WITHOUT BREAKING THE BODY MODEL (Mark 2026-07-27: "original nethack had a ton of loot, [REF#DA-00052]
   remember? we dont have to do that much, but we do have armor to think of") ─────────────────────────
   NetHack's armour feels deep because a slot has MANY items, not because each has a different number.
   That matters here, because AC in this game is REGION-priced, not item-priced — Mark's own model:
   "chest is most vital = 5pts, head 2pts, legs 2, arms 1", later split to head 1 + feet 1. A piece claims
   a region and inherits that region's value.
   So the variety lives in NAME, KANJI and FLAVOUR — five real pieces of Japanese armour per region rather
   than one — and every one of them is worth exactly what its region is worth. Adding tiered AC numbers
   would have quietly contradicted the body model and made the dial and the mitigation disagree.
   REAL power variance already has a home: the "+N" magical suffix the vending roll applies, which
   computeArmorClass adds on top of the base. That is the axis to grow, not the base values.
   ⚠ EVERY title here must have a window._AC_TABLE entry in NewOrigami.Panels.html or it claims no region
   and silently scores ZERO AC — the documented 'HELMET' vs 'SAMURAI HELMET' failure. */
export const EQUIPMENT_POOL = [
    // ── 胴 CHEST ── [REF#DA-00053]
    { catId: 'ITEM', title: 'CHEST ARMOR',    desc: 'Lacquered do.',              kanji: '鎧',   attr: '(AC +5)', slot: 'chest' },
    { catId: 'ITEM', title: 'DOMARU',         desc: 'Wraps the body, laced tight.', kanji: '胴丸', attr: '(AC +5)', slot: 'chest' },
    { catId: 'ITEM', title: 'HARAMAKI',       desc: 'A belly wrap. Light, quiet.',  kanji: '腹巻', attr: '(AC +5)', slot: 'chest' },
    { catId: 'ITEM', title: 'OYOROI',         desc: 'Great armour of an old house.', kanji: '大鎧', attr: '(AC +5)', slot: 'chest' },
    // ── 兜 HEAD ── [REF#DA-00054]
    { catId: 'ITEM', title: 'SAMURAI HELMET', desc: 'Crested kabuto.',            kanji: '兜',   attr: '(AC +1)', slot: 'head'  },
    { catId: 'ITEM', title: 'JINGASA',        desc: 'A foot soldier\'s war hat.',   kanji: '陣笠', attr: '(AC +1)', slot: 'head'  },
    { catId: 'ITEM', title: 'HACHIGANE',      desc: 'An iron brow band.',         kanji: '鉢金', attr: '(AC +1)', slot: 'head'  },
    // ── 脛当 LEGS ── [REF#DA-00055]
    { catId: 'ITEM', title: 'GREAVES',        desc: 'Shin plates.',               kanji: '脛当', attr: '(AC +2)', slot: 'legs'  },
    { catId: 'ITEM', title: 'SUNEATE',        desc: 'Splinted shins, corded.',    kanji: '脛当', attr: '(AC +2)', slot: 'legs'  },
    { catId: 'ITEM', title: 'HAIDATE',        desc: 'Thigh guards on a divided apron.', kanji: '佩楯', attr: '(AC +2)', slot: 'legs' },
    // ── 籠手 ARMS ── [REF#DA-00056]
    { catId: 'ITEM', title: 'GAUNTLETS',      desc: 'Iron sleeves.',              kanji: '籠手', attr: '(AC +1)', slot: 'arms'  },
    { catId: 'ITEM', title: 'KOTE',           desc: 'Mail and plate to the elbow.', kanji: '籠手', attr: '(AC +1)', slot: 'arms'  },
    { catId: 'ITEM', title: 'SODE',           desc: 'Shoulder guards that swing free.', kanji: '袖', attr: '(AC +1)', slot: 'arms' },
    // ── 草鞋 FEET ── [REF#DA-00057]
    { catId: 'ITEM', title: 'BOOTS',          desc: 'Steel-toed straw sandals.',  kanji: '草鞋', attr: '(AC +1)', slot: 'feet'  },
    { catId: 'ITEM', title: 'WARAJI',         desc: 'Woven straw. Silent on stone.', kanji: '草鞋', attr: '(AC +1)', slot: 'feet' },
    { catId: 'ITEM', title: 'TABI',           desc: 'Split-toe boots, iron soled.', kanji: '足袋', attr: '(AC +1)', slot: 'feet' },
];

/* ── THE SKELETON GARRISON'S OWN KIT (Mark 2026-07-27: "make it cool for players to see armor items, [REF#DA-00058]
   especially when we fight the skeleton guards and archers") ─────────────────────────────────────────
   These two are the only ARMOURED population in the dungeon — a guard on patrol and an archer on the
   wall — so they are the natural source of armour, and a fight with them should feel like it might pay
   out a piece. They drop from their OWN loadout: the guard is the one in heavy plate, so it yields the
   body and the head; the archer needs its hands and feet free, so it yields sleeves and sandals.
   Rate is set per-role at the call site (window._skeletonArmorChance). */
export const SKELETON_GUARD_KIT  = ['CHEST ARMOR', 'DOMARU', 'OYOROI', 'SAMURAI HELMET', 'HACHIGANE', 'GREAVES', 'SUNEATE'];
export const SKELETON_ARCHER_KIT = ['GAUNTLETS', 'KOTE', 'SODE', 'BOOTS', 'WARAJI', 'TABI', 'JINGASA'];

/* ── ONE SOURCE FOR ARMOUR (Mark 2026-07-28: "okay link them all together") ────────────────────────── [REF#DA-00059]
   Armour used to be described in THREE places that had to agree and were linked by nothing:
     · EQUIPMENT_POOL, here          — what can DROP
     · window._AC_TABLE, in Panels   — what body region it PROTECTS
     · _ARMOUR_SLOTS, in LootCardBuilder — what MODEL it uses
   A piece in the first but missing from the second is armour you are visibly wearing that stops NOTHING,
   silently. Missing from the third, it is a grey cube. Both failures are invisible — nothing throws.
   The join key already existed: every pool entry carries `slot`. It was just being RESTATED twice instead
   of read. Now the other two DERIVE from this file, and adding a piece is one edit in one place.

   ALIASES are the one thing the pool cannot supply: spellings that are not droppable pieces but must still
   resolve — legacy card names ('ARMOR', 'GLOVES'), plurals the pool does not use ('GAUNTLET'), and the
   English fallbacks ('WAR HAT', 'SHIN GUARDS'). They live here so there is still exactly one list.
   ⚠ SAMURAI HELMET intentionally resolves to 'head' here. It is safe: LootCardBuilder's hand-built kabuto
   branch sits EARLIER in its if-chain, so the helmet never reaches the generic armour branch and keeps its
   own model. The AC side needs it mapped, so mapping it is correct for both readers. */
export const ARMOUR_ALIASES = {
    'CHEST ARMOUR': 'chest', 'ARMOR': 'chest', 'ARMOUR': 'chest', 'CUIRASS': 'chest', 'DO': 'chest', 'YOROI': 'chest',
    'WAR HAT': 'head', 'HEADBAND': 'head', 'HELMET': 'head',
    'SHIN GUARDS': 'legs',
    'GAUNTLET': 'arms', 'BRACERS': 'arms', 'BRACER': 'arms', 'GLOVES': 'arms',
    'SANDALS': 'feet',
};

/** title → body region, for ANY armour name. Pool first (authoritative), then the alias list. [REF#DA-00060]
 *  Strips a qty suffix and a magical "+N" first: the vending roll mints "KOTE +1" and that is still a kote.
 *  Returns null for anything that is not armour — that null is what gates the model branch. */
export function ARMOUR_SLOT_OF(title) {
    const t = String(title || '').replace(/\s*x\d+$/i, '').replace(/\s*\+\d+\s*/, '').trim().toUpperCase();
    if (!t || t.includes('SHIELD')) return null;      // a shield is carried, not worn — it has its own branch [REF#DA-00061]
    const hit = EQUIPMENT_POOL.find(e => e.title === t);
    if (hit) return hit.slot;
    return ARMOUR_ALIASES[t] || null;
}

/** Every armour title this file knows about, pool + aliases. Panels merges these into window._AC_TABLE. [REF#DA-00062] */
export function ARMOUR_AC_ENTRIES() {
    const out = {};
    for (const e of EQUIPMENT_POOL) out[e.title] = { slot: e.slot };
    for (const k of Object.keys(ARMOUR_ALIASES)) out[k] = { slot: ARMOUR_ALIASES[k] };
    return out;
}

/** Pull a specific named piece out of the pool (the skeleton kits name what they wear). [REF#DA-00063] */
export function equipmentByTitle(title) {
    const t = String(title || '').toUpperCase();
    const hit = EQUIPMENT_POOL.find(e => e.title === t);
    return hit ? Object.assign({}, hit) : null;
}

/** [REF#DA-00064]
 * Pick an equipment drop, honouring karma.
 * @param {number} karma
 * @param {string[]} heldSlots  slots the player already has covered (from computeArmorClass().bySlot)
 */
export function rollEquipment(karma = 0, heldSlots = [], rand = Math.random) {
    const held = new Set(heldSlots || []);
    const state = karmaState(karma);
    const pick = () => EQUIPMENT_POOL[Math.floor(rand() * EQUIPMENT_POOL.length)];

    if (state === 'cursed' && rand() < duplicateChance(karma)) {
        // CURSED: hand back something already owned. If they own nothing yet there is nothing to dupe — [REF#DA-00065]
        // the curse cannot punish an empty inventory, so it falls through to a normal roll.
        const dupes = EQUIPMENT_POOL.filter(e => held.has(e.slot));
        if (dupes.length) return Object.assign({}, dupes[Math.floor(rand() * dupes.length)], { cursedDupe: true });
    }
    let item = pick();
    if (state === 'blessed' && held.has(item.slot)) {
        const fresh = EQUIPMENT_POOL.filter(e => !held.has(e.slot));
        if (fresh.length) item = Object.assign({}, fresh[Math.floor(rand() * fresh.length)], { blessed: true });
    }
    return Object.assign({}, item);
}
