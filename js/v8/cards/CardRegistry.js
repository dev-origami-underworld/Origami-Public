/** [REF#CR-00145]
 * 🃏 CardRegistry.js — ONE RECORD PER CARD: what it is, and which wires it needs
 *
 * Mark 2026-09-14: "for cards, I know we have different cards for each. Can we create a easy to understand system
 * for all our cards so its easier to manage and maintain for AI, just want to make it easier for you in the future"
 *
 * WHY THIS FILE EXISTS — measured the same day, adding one consumable (PET FOOD) needed SIX registrations across five
 * files before it worked: CardDatabase.js (two structures), js/data/i18n.js, the Panels deck row, Panels CONSUMABLES,
 * Engine9 UI_ONLY — plus the two 3D models and their allowlists. Miss one and the card either never shows in the hand
 * or reaches the engine's launch pipeline and FIRES AS A SPELL BALL (GOHAN, 2026-08-01; SINGING, 2026-07-31). Nobody
 * could see the whole set of wires, so every new card re-learned them by failing.
 *
 * WHAT IT IS — a registry of the FACTS that were scattered: for every card, its family (deck band), its BEHAVIOUR (what
 * a tap does — the field that decides which lists it must be in), its scene/model keys, its i18n key and its source.
 * Text (desc/attr) stays where it lives today: js/data/i18n.js is the localized authority and CardDatabase.js the
 * gameplay numbers. This file does not replace them yet; it is the map of them, and `scripts/probe-card-registry.js`
 * (wired into `npm run smoke`) is the gate that reads this map and the live source and refuses the build when a wire
 * is missing. Consumers migrate onto it one at a time (see knowledge/design/CARDS.md), each switch probed.
 *
 * ⚠ js/fpv/CardRegistry.js is a FOSSIL — nothing imports it (checked 2026-09-14). This file is the live one.
 *
 * BEHAVIOUR → REQUIRED WIRES (what the gate enforces, R = required, A = advisory):
 *   melee | ranged | spell   attacks: reach the launch pipeline. ranged must match CardExecutor.isMissileCard (R).
 *   consume | throw-to-pet   Panels CONSUMABLES (R) + Engine9 UI_ONLY (R): never lastCombatAttack, never launched.
 *   permit                   Panels permit early-return list (R) + Engine9 UI_ONLY (R).
 *   skill | game | quest     Engine9 UI_ONLY (R) — a tap opens a table / arms a skill; the engine must never launch it.
 *   equip | currency | key   never tappable in the hand; no deck row (A) — they act on pickup.
 *   deckScene, when set      must be in Panels' 3D `elements` allowlist (R) — absent = the dark unpainted circle.
 *   i18n                     key present in EN and JA (A — a miss falls back to raw English, silently).
 *   database                 present in BOTH CardDatabase structures (A — one without the other renders blank).
 */

/** @typedef {Object} CardRecord [REF#CR-00146]
 *  @property {string}  id         snake_case, unique
 *  @property {string}  name       the EN action name — the string every list, message and userData._canonicalId carries
 *  @property {string}  family     deck band: MELEE | RANGED | SPELLS | ITEM | SKILL | GAMING
 *  @property {string}  kanji      the corner glyph
 *  @property {string}  icon       Font Awesome class (2D surfaces)
 *  @property {string}  behaviour  melee | ranged | spell | consume | throw-to-pet | permit | skill | game | quest | equip | currency | key
 *  @property {boolean} [ammo]     the badge counts ammunition (Panels AMMO_CARDS)
 *  @property {string}  [stat]     SKILL_STAT_MAP link: a duplicate pickup grants +1 to this score
 *  @property {string}  [deckScene] Panels 3D scene key (the `elements` allowlist); null = the family default
 *  @property {boolean} [floorModel] LootCardBuilder has a dedicated branch for this name
 *  @property {string}  [i18n]     key under OrigamiI18n.<lang>.cards
 *  @property {string}  source     loot | vending | role | cabaret | konbini | table | drop | legacy
 *  @property {string[]} [aliases]  other spellings the code accepts for the same card (display names, ammo names)
 *  @property {string}  [note]
 */

/** @type {CardRecord[]} [REF#CR-00147] */
export const CARDS = [
  // ── SPELLS ────────────────────────────────────────────────────────────────────────────────────────────────── [REF#CR-00148]
  { id: 'boulder',   name: 'BOULDER',   family: 'SPELLS', kanji: '地', icon: 'fa-mountain', behaviour: 'spell', stat: 'str', i18n: 'boulder',   source: 'loot' },
  { id: 'fissure',   name: 'FISSURE',   family: 'SPELLS', kanji: '裂', icon: 'fa-mountain', behaviour: 'spell', stat: 'str', i18n: 'fissure',   source: 'loot' },
  { id: 'gale',      name: 'GALE',      family: 'SPELLS', kanji: '風', icon: 'fa-wind',     behaviour: 'spell', stat: 'dex', i18n: 'gale',      source: 'loot' },
  { id: 'cyclone',   name: 'CYCLONE',   family: 'SPELLS', kanji: '旋', icon: 'fa-wind',     behaviour: 'spell', stat: 'dex', i18n: 'cyclone',   source: 'loot' },
  { id: 'fireball',  name: 'FIREBALL',  family: 'SPELLS', kanji: '火', icon: 'fa-fire',     behaviour: 'spell', stat: 'int', i18n: 'fireball',  source: 'loot' },
  { id: 'pyroblast', name: 'PYROBLAST', family: 'SPELLS', kanji: '炎', icon: 'fa-fire',     behaviour: 'spell', stat: 'int', i18n: 'pyroblast', source: 'loot' },
  { id: 'comet',     name: 'COMET',     family: 'SPELLS', kanji: '彗', icon: 'fa-fire',     behaviour: 'spell', stat: 'int', i18n: 'comet',     source: 'loot' },
  { id: 'tide',      name: 'TIDE',      family: 'SPELLS', kanji: '潮', icon: 'fa-water',    behaviour: 'spell', stat: 'wis', i18n: 'tide',      source: 'loot' },
  { id: 'surge',     name: 'SURGE',     family: 'SPELLS', kanji: '波', icon: 'fa-water',    behaviour: 'spell', stat: 'wis', i18n: 'surge',     source: 'loot' },
  { id: 'ring_of_fire', name: 'RING OF FIRE', family: 'SPELLS', kanji: '環', icon: 'fa-ring', behaviour: 'spell', deckScene: 'RING_FIRE', i18n: 'ring_of_fire', source: 'role', note: 'cast by _castRingOfFire, not the launch pipeline' },

  // ── MELEE ─────────────────────────────────────────────────────────────────────────────────────────────────── [REF#CR-00149]
  { id: 'slash',       name: 'SLASH',       family: 'MELEE', kanji: '斬', icon: 'fa-khanda',  behaviour: 'melee', stat: 'str', i18n: 'slash',       source: 'role' },
  { id: 'thrust',      name: 'THRUST',      family: 'MELEE', kanji: '突', icon: 'fa-khanda',  behaviour: 'melee', stat: 'str', i18n: 'thrust',      source: 'role' },
  { id: 'hard_attack', name: 'HARD ATTACK', family: 'MELEE', kanji: '強', icon: 'fa-khanda',  behaviour: 'melee', stat: 'str', i18n: 'hard_attack', source: 'role' },
  { id: 'defend',      name: 'DEFEND',      family: 'MELEE', kanji: '守', icon: 'fa-shield',  behaviour: 'melee', stat: 'con', i18n: 'defend',      source: 'role', note: 'a stance on the melee deck; routed by the combat pipeline' },
  { id: 'katana',      name: 'KATANA',      family: 'MELEE', kanji: '刀', icon: 'fa-khanda',  behaviour: 'melee', floorModel: true, i18n: 'katana',      source: 'loot' },
  // The weapon pool's other three blades (js/v8/data/LootTables.js WEAPON_POOL, 2026-10-02): flavour names on the one shared melee band. [REF#CR-00177]
  { id: 'tanto_blade',     name: 'TANTO BLADE',     family: 'MELEE', kanji: '短刀',   icon: 'fa-khanda', behaviour: 'melee', i18n: 'tanto_blade',     source: 'loot' },
  { id: 'wakizashi_blade', name: 'WAKIZASHI BLADE', family: 'MELEE', kanji: '脇差',   icon: 'fa-khanda', behaviour: 'melee', i18n: 'wakizashi_blade', source: 'loot' },
  { id: 'nodachi_blade',   name: 'NODACHI BLADE',   family: 'MELEE', kanji: '野太刀', icon: 'fa-khanda', behaviour: 'melee', i18n: 'nodachi_blade',   source: 'loot' },
  { id: 'mace',        name: 'MACE',        family: 'MELEE', kanji: '鎚', icon: 'fa-hammer',  behaviour: 'melee', i18n: 'mace',        source: 'legacy' },
  { id: 'ninja_sword', name: 'NINJA SWORD', family: 'MELEE', kanji: '忍', icon: 'fa-khanda',  behaviour: 'melee', i18n: 'ninja_sword', source: 'role' },
  { id: 'staff',       name: 'STAFF',       family: 'MELEE', kanji: '杖', icon: 'fa-staff-snake', behaviour: 'melee', i18n: 'staff', source: 'legacy', note: 'in the engine\'s wielded-weapon set (KATANA/MACE/STAFF); no database row' },

  // ── RANGED (ammo cards: the badge is the magazine) ────────────────────────────────────────────────────────── [REF#CR-00150]
  { id: 'shuriken',    name: 'SHURIKEN',    family: 'RANGED', kanji: '投', icon: 'fa-star',      behaviour: 'ranged', ammo: true, deckScene: 'SHURIKEN', floorModel: true, i18n: 'shuriken',    source: 'loot' },
  { id: 'short_bow',   name: 'SHORT BOW',   family: 'RANGED', kanji: '弓', icon: 'fa-bow-arrow', behaviour: 'ranged', ammo: true, floorModel: true, i18n: 'short_bow',   source: 'loot', aliases: ['ARROW', 'ARROWS', 'BOLT', 'SHORTBOW'] },
  { id: 'long_bow',    name: 'LONG BOW',    family: 'RANGED', kanji: '長', icon: 'fa-bow-arrow', behaviour: 'ranged', ammo: true, floorModel: true, i18n: 'long_bow',    source: 'loot' },
  // COMPOSITE BOW — the longest-range bow in the game (Mark 2026-09-21: "there are small bows, long [REF#CR-00164]
  // bows too + composite bows wwhich shoot longer range"). Damage sits between LONG BOW and SAMURAI
  // BOW (CardExecutor.js MISSILE_TABLE.COMPOSITE_BOW); its distinguishing stat is maxRangeTiles, not
  // its damage band — see the range table in Engine9's missile spawn (~:85301).
  { id: 'composite_bow', name: 'COMPOSITE BOW', family: 'RANGED', kanji: '複', icon: 'fa-bow-arrow', behaviour: 'ranged', ammo: true, floorModel: true, i18n: 'composite_bow', source: 'loot' },
  { id: 'samurai_bow', name: 'SAMURAI BOW', family: 'RANGED', kanji: '侍', icon: 'fa-bow-arrow', behaviour: 'ranged', ammo: true, floorModel: true, i18n: 'samurai_bow', source: 'role' },
  { id: 'crossbow',    name: 'CROSSBOW',    family: 'RANGED', kanji: '弩', icon: 'fa-bow-arrow', behaviour: 'ranged', ammo: true, i18n: 'crossbow',    source: 'legacy' },
  { id: 'dagger',      name: 'DAGGER',      family: 'RANGED', kanji: '刃', icon: 'fa-khanda',    behaviour: 'ranged', ammo: true, floorModel: true, i18n: 'dagger',      source: 'role', note: 'the LAST dagger (qty 1) is a melee knife and never throws' },
  { id: 'pistol',      name: 'PISTOL',      family: 'RANGED', kanji: '銃', icon: 'fa-gun',       behaviour: 'ranged', ammo: true, floorModel: true, i18n: 'pistol',      source: 'role', aliases: ['MAGIC MISSILE'], note: 'displayed as MAGIC MISSILE; PISTOL is the action name and the engine bucket' },
  { id: 'magic_auto_missile', name: 'MAGIC AUTO MISSILE', family: 'RANGED', kanji: '連', icon: 'fa-gun', behaviour: 'ranged', ammo: true, deckScene: 'SMG', floorModel: true, i18n: 'magic_auto_missile', source: 'loot', note: 'the MAC-9: engine pays 3 per burst, posts SMG_AMMO absolute' },
  { id: 'camera',      name: 'CAMERA',      family: 'RANGED', kanji: '写', icon: 'fa-camera',    behaviour: 'ranged', ammo: false, deckScene: 'CAMERA', i18n: 'camera', source: 'role', note: 'the adventurer\'s flash: its count rides the pistol ledger, never picked up as ammo — not an AMMO_CARDS card' },
  { id: 'wand_of_fireballs',      name: 'WAND OF FIREBALLS',      family: 'RANGED', kanji: '爆', icon: 'fa-rocket', behaviour: 'spell',  i18n: 'wand_of_fireballs',      source: 'legacy', note: 'THE BAZOOKA (2026-09-29): launchCard hands it to launchRocket in the engine. Its count is LOADED rockets (1-3 found), spent on ROCKET_FIRED by the Panels bazooka ledger' },
  { id: 'rockets',                name: 'ROCKETS',                family: 'ITEM',   kanji: '弾', icon: 'fa-rocket', behaviour: 'currency', i18n: 'rockets',             source: 'vending', note: 'bazooka ammunition (2026-09-29): acts on pickup, never tappable in the hand — the Panels bazooka ledger turns it into loaded rockets and a reserve' },
  { id: 'wand_of_magic_missiles', name: 'WAND OF MAGIC MISSILES', family: 'RANGED', kanji: '銃', icon: 'fa-gun',    behaviour: 'ranged', i18n: 'wand_of_magic_missiles', source: 'legacy' },
  { id: 'tommy_gun',   name: 'TOMMY GUN',   family: 'RANGED', kanji: '機', icon: 'fa-gun',       behaviour: 'ranged', i18n: 'tommy_gun', source: 'legacy' },

  // ── ITEM: things you eat, drink or throw ──────────────────────────────────────────────────────────────────── [REF#CR-00151]
  { id: 'heal_potion',  name: 'HEAL POTION',  family: 'ITEM', kanji: '具', icon: 'fa-flask',       behaviour: 'consume', deckScene: 'HEAL', floorModel: true, i18n: 'heal_potion',  source: 'vending' },
  { id: 'spell_potion', name: 'SPELL POTION', family: 'ITEM', kanji: '魔', icon: 'fa-flask',       behaviour: 'consume', floorModel: true, i18n: 'spell_potion', source: 'vending' },
  { id: 'healing',      name: 'HEALING',      family: 'SKILL', kanji: '癒', icon: 'fa-heart-pulse', behaviour: 'consume', i18n: 'healing',      source: 'role', note: 'the priest\'s ABILITY (2026-10-07): heal 25-50% of max hp, 2-minute recovery, never spent — knowledge/design/PRIEST_HEALING_SKILL_2026-10-07.md' },
  { id: 'potion',       name: 'POTION',       family: 'ITEM', kanji: '具', icon: 'fa-flask',       behaviour: 'consume', floorModel: true, i18n: 'potion',       source: 'legacy' },
  { id: 'gohan',        name: 'GOHAN',        family: 'ITEM', kanji: '飯', icon: 'fa-bowl-rice',   behaviour: 'consume', deckScene: 'RICEBOWL', floorModel: true, i18n: 'gohan', source: 'drop', note: '10-20% hp over 30 s; ~20% of kills drop one' },
  // ANT EGG / ROYAL EGG (Mark 2026-09-26: "lay a freaking egg (it can be eaten) its a playing card too (Ant Egg). some eggs have a [REF#CR-00167]
  // chance to be Royal Egg and lay a queen"). Laid by an ant for every card it eats; hatches after 45 s unless someone eats it first.
  // BULLY CLUB (Mark 2026-09-26: "it also drops, call it Bully Club - a Police Baton model ... does same damage as katana but stuns for 1 turn on hit")
  { id: 'bully_club',   name: 'BULLY CLUB',   family: 'MELEE', kanji: '棍', icon: 'fa-gavel',       behaviour: 'melee', deckScene: 'BULLYCLUB', floorModel: true, i18n: 'bully_club', source: 'drop', note: "the Manager's club; katana damage, 1-turn stun on hit" },
  { id: 'ant_egg',      name: 'ANT EGG',      family: 'ITEM', kanji: '卵', icon: 'fa-egg',         behaviour: 'consume', deckScene: 'ANTEGG', floorModel: true, i18n: 'ant_egg', source: 'drop', note: 'laid by an ant that ate; a small heal; hatches an ant if left' },
  { id: 'royal_egg',    name: 'ROYAL EGG',    family: 'ITEM', kanji: '王', icon: 'fa-egg',         behaviour: 'consume', deckScene: 'ROYALEGG', floorModel: true, i18n: 'royal_egg', source: 'drop', note: 'the royal variant; hatches a Queen Ant who drops magical items' },
  { id: 'dog_food', name: 'DOG FOOD', family: 'ITEM', kanji: '餌', icon: 'fa-bone', behaviour: 'throw-to-pet', deckScene: 'PETFOOD', floorModel: true, i18n: 'dog_food', source: 'loot' },
  { id: 'pet_food',     name: 'PET FOOD',     family: 'ITEM', kanji: '餌', icon: 'fa-bone',        behaviour: 'throw-to-pet', deckScene: 'PETFOOD', floorModel: true, i18n: 'pet_food', source: 'loot', note: 'NetHack tripe: tap = toss to the pet, no pet = "Yak — dog food!"' },
  { id: 'identity_scroll', name: 'IDENTITY SCROLL', family: 'ITEM', kanji: '巻', icon: 'fa-scroll', behaviour: 'consume', deckScene: 'SCROLL', floorModel: true, i18n: 'scroll_identity', source: 'vending', aliases: ['SCROLL OF IDENTITY'], note: 'the identify effect itself is not built; the wire only keeps it out of the launch pipeline' },

  // ── ITEM: worn or carried — act on pickup, never tapped ───────────────────────────────────────────────────── [REF#CR-00152]
  { id: 'magic_lantern',  name: 'MAGIC LANTERN',  family: 'ITEM', kanji: '灯', icon: 'fa-lightbulb',     behaviour: 'equip', deckScene: 'MAGIC_LANTERN', floorModel: true, i18n: 'magic_lantern',  source: 'loot' },
  { id: 'shield',         name: 'SHIELD',         family: 'ITEM', kanji: '盾', icon: 'fa-shield-halved', behaviour: 'equip', stat: 'con', floorModel: true, i18n: 'shield', source: 'vending' },
  { id: 'samurai_helmet', name: 'SAMURAI HELMET', family: 'ITEM', kanji: '兜', icon: 'fa-hat-wizard',    behaviour: 'equip', stat: 'con', floorModel: true, i18n: 'samurai_helmet', source: 'vending' },
  { id: 'chest_armor',    name: 'CHEST ARMOR',    family: 'ITEM', kanji: '鎧', icon: 'fa-shield-halved', behaviour: 'equip', stat: 'con', i18n: 'chest_armor', source: 'vending' },
  { id: 'greaves',        name: 'GREAVES',        family: 'ITEM', kanji: '脛', icon: 'fa-socks',         behaviour: 'equip', i18n: 'greaves', source: 'vending' },
  { id: 'gauntlets',      name: 'GAUNTLETS',      family: 'ITEM', kanji: '籠', icon: 'fa-hand-fist',     behaviour: 'equip', i18n: 'gauntlets', source: 'vending' },
  { id: 'boots',          name: 'BOOTS',          family: 'ITEM', kanji: '鞋', icon: 'fa-shoe-prints',   behaviour: 'equip', i18n: 'boots', source: 'vending' },
  { id: 'gold_coin',      name: 'GOLD COIN',      family: 'ITEM', kanji: '金', icon: 'fa-coins',         behaviour: 'currency', floorModel: true, i18n: 'gold_coin',  source: 'loot' },
  { id: 'gold_coins',     name: 'GOLD COINS',     family: 'ITEM', kanji: '金', icon: 'fa-coins',         behaviour: 'currency', floorModel: true, i18n: 'gold_coins', source: 'loot' },
  { id: 'treasure',       name: 'TREASURE',       family: 'ITEM', kanji: '宝', icon: 'fa-gem',           behaviour: 'currency', i18n: 'treasure', source: 'loot', note: 'the mimic\'s bait — "(NO REFUNDS)" is the only tell' },
  { id: 'level_key',      name: 'LEVEL KEY',      family: 'ITEM', kanji: '鍵', icon: 'fa-key',           behaviour: 'key', floorModel: true, i18n: 'level_key', source: 'loot' },

  // ── ITEM: quest markers (a badge in the hand, never spent by a tap) ───────────────────────────────────────── [REF#CR-00153]
  { id: 'food_delivery',      name: 'FOOD DELIVERY',      family: 'ITEM', kanji: '任', icon: 'fa-bowl-rice', behaviour: 'quest', deckScene: 'RICEBOWL', i18n: 'food_delivery', source: 'konbini', note: 'tap re-lights the delivery waypoint' },
  { id: 'steaming_rice_bowl', name: 'STEAMING RICE BOWL', family: 'ITEM', kanji: '湯', icon: 'fa-bowl-rice', behaviour: 'quest', deckScene: 'RICEBOWL', floorModel: true, i18n: 'steaming_rice_bowl', source: 'konbini' },
  { id: 'cold_rice_bowl',     name: 'COLD RICE BOWL',     family: 'ITEM', kanji: '冷', icon: 'fa-bowl-rice', behaviour: 'quest', deckScene: 'RICEBOWL', floorModel: true, i18n: 'cold_rice_bowl', source: 'konbini' },

  // ── SKILL: role skills (tap arms an effect) ───────────────────────────────────────────────────────────────── [REF#CR-00154]
  { id: 'first_aid',     name: 'FIRST AID',     family: 'SKILL', kanji: '救', icon: 'fa-kit-medical',  behaviour: 'consume', deckScene: 'FIRSTAID', i18n: 'first_aid', source: 'role', note: 'the adventurer\'s bandage: heal over 1 min, 1 min cooldown — a consumable in every list' },
  { id: 'reload',        name: 'RELOAD',        family: 'SKILL', kanji: '装', icon: 'fa-rotate-right', behaviour: 'skill', deckScene: 'RELOAD', floorModel: true, i18n: 'reload', source: 'role' },
  { id: 'banzai',        name: 'BANZAI',        family: 'SKILL', kanji: '萬', icon: 'fa-khanda',       behaviour: 'skill', deckScene: 'BANZAI', i18n: 'banzai', source: 'role' },
  { id: 'ninja_stealth', name: 'NINJA STEALTH', family: 'SKILL', kanji: '隠', icon: 'fa-user-ninja',   behaviour: 'skill', deckScene: 'OWLEYES', i18n: 'ninja_stealth', source: 'role' },
  { id: 'summon',        name: 'SUMMON',        family: 'SKILL', kanji: '召', icon: 'fa-paw',          behaviour: 'skill', deckScene: 'SUMMON', i18n: 'summon', source: 'role', note: 'the Wizard starts with it; every other role farms it off a level boss (LootTables BOSS_SPECIALS, 2026-09-14); SUMMON_PET steps the pet cycle: puppy out → puppy home + kitten out → kitten home (the card is the pets\' home)' },

  // ── SKILL: game permits (tap opens the table) ─────────────────────────────────────────────────────────────── [REF#CR-00155]
  { id: 'poker',     name: 'POKER',     family: 'SKILL', kanji: '賭', icon: 'fa-diamond', behaviour: 'game', deckScene: 'POKER',       floorModel: true, i18n: 'poker',     source: 'cabaret', aliases: ['POKER GAME'] },
  { id: 'blackjack', name: 'BLACKJACK', family: 'SKILL', kanji: '廿', icon: 'fa-diamond', behaviour: 'game', deckScene: 'CARD',        floorModel: true, i18n: 'blackjack', source: 'cabaret' },
  { id: 'dice',      name: 'DICE',      family: 'SKILL', kanji: '骰', icon: 'fa-dice',    behaviour: 'game', deckScene: 'DICE_CENTER', floorModel: true, i18n: 'dice',      source: 'cabaret' },

  // ── SKILL: room permits (carried, never spent) ────────────────────────────────────────────────────────────── [REF#CR-00156]
  { id: 'singing',           name: 'SINGING',           family: 'SKILL', kanji: '唄', icon: 'fa-microphone', behaviour: 'permit', deckScene: 'SINGING', floorModel: true, i18n: 'singing', source: 'cabaret', note: 'the cabaret\'s own permit — a gold musical note, not the medal' },
  { id: 'kitchen_permit',    name: 'KITCHEN PERMIT',    family: 'SKILL', kanji: '厨', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'kitchen_permit', source: 'loot' },
  { id: 'store_permit',      name: 'STORE PERMIT',      family: 'SKILL', kanji: '店', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'store_permit', source: 'loot' },
  { id: 'factory_permit',    name: 'FACTORY PERMIT',    family: 'SKILL', kanji: '工', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'factory_permit', source: 'loot' },
  { id: 'works_permit',      name: 'WORKS PERMIT',      family: 'SKILL', kanji: '労', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'works_permit', source: 'loot' },
  { id: 'storage_permit',    name: 'STORAGE PERMIT',    family: 'SKILL', kanji: '蔵', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'storage_permit', source: 'loot' },
  { id: 'laboratory_permit', name: 'LABORATORY PERMIT', family: 'SKILL', kanji: '研', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'laboratory_permit', source: 'loot' },
  { id: 'guard_post_permit', name: 'GUARD POST PERMIT', family: 'SKILL', kanji: '番', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'guard_post_permit', source: 'loot' },
  { id: 'armory_permit',     name: 'ARMORY PERMIT',     family: 'SKILL', kanji: '武', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'armory_permit', source: 'loot' },
  { id: 'archery_permit',    name: 'ARCHERY PERMIT',    family: 'SKILL', kanji: '弓', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'archery_permit', source: 'loot' },
  { id: 'prison_permit',     name: 'PRISON PERMIT',     family: 'SKILL', kanji: '牢', icon: 'fa-id-card', behaviour: 'permit', deckScene: 'MEDAL', floorModel: true, i18n: 'prison_permit', source: 'loot' },

  // ── GAMING: the wager tiles (a table, not a hand card) ────────────────────────────────────────────────────── [REF#CR-00157]
  { id: 'dice_game',    name: 'DICE GAME',    family: 'GAMING', kanji: '骰', icon: 'fa-dice',    behaviour: 'game', deckScene: 'DICE_CENTER', floorModel: true, i18n: 'dice_game',    source: 'table' },
  { id: 'card_game',    name: 'CARD GAME',    family: 'GAMING', kanji: '牌', icon: 'fa-id-card', behaviour: 'game', deckScene: 'CARD',        floorModel: true, i18n: 'card_game',    source: 'table' },
  { id: 'slot_machine', name: 'SLOT MACHINE', family: 'GAMING', kanji: '槽', icon: 'fa-trophy',  behaviour: 'game', floorModel: true, i18n: 'slot_machine', source: 'table' },
  { id: 'contracts',    name: 'CONTRACTS',    family: 'GAMING', kanji: '契', icon: 'fa-scroll',  behaviour: 'game', floorModel: true, i18n: 'contracts',    source: 'table' },
];

/** [REF#CR-00158]
 * Deck-row names that are TABLE ACTIONS, not cards: buttons on a gambling table (bets, deals, exits). They live in
 * the same category arrays as the cards, so the gate needs to know them to tell "a table button" from "a card nobody
 * registered". Never picked up, never on the floor.
 */
export const TABLE_ACTIONS = [
  'EXIT', 'OTHER GAMES', 'STAKE', 'BET EVEN', 'BET ODD', 'HI-LO', 'HIGHER', 'LOWER', 'BACCARAT', 'BET PLAYER', 'BET BANKER',
  'BET TIE', 'POKER DUEL', 'DEAL POKER', 'CHO-HAN', 'DICE DUEL', 'ROLL DICE', 'LIARS DICE', 'CALL BLUFF', 'TRUST DEALER',
  'HIT', 'STAND', 'SPIN', 'SLOT', 'SLOT MACHINES', 'CONTRACT JOB', 'CONTRACT: ROGUE YAKUZA', 'CONTRACT: SMUGGLE RUN',
  'CONTRACT: TREASURE HUNT',
];

/** Songs are cards too, but they are minted from the SongCatalog at run time (title, rarity, songId) — the registry [REF#CR-00159]
 *  does not list them; the gate skips any name the catalog owns. */
export const DYNAMIC_FAMILIES = ['SONG'];

export const BEHAVIOURS = {
  attack:   ['melee', 'ranged', 'spell'],
  uiOnly:   ['consume', 'throw-to-pet', 'permit', 'skill', 'game', 'quest'],   // must be in Engine9 UI_ONLY [REF#CR-00160]
  passive:  ['equip', 'currency', 'key'],                                        // act on pickup; no tap [REF#CR-00161]
};

const _byName = new Map(CARDS.flatMap(c => [[c.name, c], ...((c.aliases || []).map(a => [a, c]))]));
const _byId   = new Map(CARDS.map(c => [c.id, c]));
export const cardByName = (name) => _byName.get(String(name || '').toUpperCase().trim()) || null;
export const cardById   = (id)   => _byId.get(id) || null;
export const cardsWhere = (pred) => CARDS.filter(pred);

/** The derived lists — what CONSUMABLES / UI_ONLY / AMMO_CARDS / SKILL_STAT_MAP should contain. Consumers switch to [REF#CR-00162]
 *  these one at a time; until then the gate compares them against the literal lists in the source. */
export const derived = {
  consumables: () => CARDS.filter(c => c.behaviour === 'consume' || c.behaviour === 'throw-to-pet').map(c => c.name),
  uiOnly:      () => CARDS.filter(c => BEHAVIOURS.uiOnly.includes(c.behaviour)).map(c => c.name),
  ammo:        () => CARDS.filter(c => c.ammo).map(c => c.name),
  permits:     () => CARDS.filter(c => c.behaviour === 'permit').map(c => c.name),
  statLinks:   () => Object.fromEntries(CARDS.filter(c => c.stat).map(c => [c.name, c.stat])),
};

if (typeof window !== 'undefined') window.OrigamiCardRegistry = { CARDS, TABLE_ACTIONS, BEHAVIOURS, cardByName, cardById, cardsWhere, derived };
