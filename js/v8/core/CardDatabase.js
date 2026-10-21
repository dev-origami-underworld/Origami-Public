/** [REF#CR-00001]
 * 🃏 CardDatabase.js — Unified Source of Truth for Origami Dungeon Cards
 * Consolidates NewOrigami.Cards.js, js/data/cards.js, and js/fpv/CardRegistry.js
 * into a single ES Module to prevent data drift.
 * 
 * Includes element mappings, FX parameters, UI schemas, and deck layout generators.
 */

// 1. Mastery Database containing core gameplay parameters (from MasterCardDatabase) [REF#CR-00002]
export const MasterCardDatabase = {
  // --- SPELLS --- [REF#CR-00003]
  BOULDER: {
    id: "SPELLS",
    kanji: "地",
    icon: "fa-mountain",
    desc: "Spell Scroll",
    attr: "42-158 · STUN",
    fpvColor: 0x8b4513,
    fpvDmg: 100,
    fpvTrauma: 0.6,
    fpvRange: 5.0,
    label: "🪨 EARTH",
    type: "SPELLS",
  },
  FISSURE: {
    id: "SPELLS",
    kanji: "地",
    icon: "fa-mountain",
    desc: "Spell Scroll",
    attr: "42-158 · STUN",
    fpvColor: 0x5c4033,
    fpvDmg: 100,
    fpvTrauma: 0.9,
    fpvRange: 4.0,
    label: "🌋 EARTH",
    type: "SPELLS",
  },
  GALE: {
    id: "SPELLS",
    kanji: "風",
    icon: "fa-wind",
    desc: "Spell Scroll",
    attr: "26-113 · PUSH",
    fpvColor: 0xaaaaaa,
    fpvDmg: 70,
    fpvTrauma: 0.4,
    fpvRange: 10.0,
    label: "🌪️ WIND",
    type: "SPELLS",
  },
  FIREBALL: {
    id: "SPELLS",
    kanji: "火",
    icon: "fa-fire",
    desc: "Magic Wand",
    attr: "42-158 · BURN",
    fpvColor: 0xff4400,
    fpvDmg: 100,
    fpvTrauma: 0.7,
    fpvRange: 8.0,
    label: "🔥 FIRE",
    type: "SPELLS",
  },
  PYROBLAST: {
    id: "SPELLS",
    kanji: "火",
    icon: "fa-fire",
    desc: "Magic Wand",
    attr: "42-158 · BURN",
    fpvColor: 0xff2200,
    fpvDmg: 100,
    fpvTrauma: 0.9,
    fpvRange: 8.0,
    label: "💥 FIRE",
    type: "SPELLS",
  },
  COMET: {
    id: "SPELLS",
    kanji: "火",
    icon: "fa-fire",
    desc: "Magic Wand",
    attr: "42-158 · BURN",
    fpvColor: 0xffaa00,
    fpvDmg: 100,
    fpvTrauma: 1.0,
    fpvRange: 12.0,
    label: "☄️ FIRE",
    type: "SPELLS",
  },
  TIDE: {
    id: "SPELLS",
    kanji: "水",
    icon: "fa-water",
    desc: "Spell Scroll",
    attr: "26-113 · SLOW",
    fpvColor: 0x0088ff,
    fpvDmg: 70,
    fpvTrauma: 0.3,
    fpvRange: 6.0,
    label: "🌊 WATER",
    type: "SPELLS",
  },
  SURGE: {
    id: "SPELLS",
    kanji: "水",
    icon: "fa-water",
    desc: "Spell Scroll",
    attr: "26-113 · SLOW",
    fpvColor: 0x0044ff,
    fpvDmg: 70,
    fpvTrauma: 0.5,
    fpvRange: 7.0,
    label: "💧 WATER",
    type: "SPELLS",
  },

  // --- MELEE --- [REF#CR-00004]
  SLASH: {
    id: "MELEE",
    kanji: "斬",
    icon: "fa-fire",
    desc: "Melee Weapon",
    attr: "×1 DICE",
    fpvColor: 0xaaaaaa,
    fpvDmg: 15,
    fpvTrauma: 0.2,
    fpvRange: 2.0,
    label: "⚔️ SLASH",
    type: "MELEE",
  },
  THRUST: {
    id: "MELEE",
    kanji: "突",
    icon: "fa-wind",
    desc: "Melee Weapon",
    attr: "×1 DICE",
    fpvColor: 0xdddddd,
    fpvDmg: 20,
    fpvTrauma: 0.3,
    fpvRange: 3.0,
    label: "🗡️ THRUST",
    type: "MELEE",
  },
  "HARD ATTACK": {
    id: "MELEE",
    kanji: "強",
    icon: "fa-mountain",
    desc: "Melee Weapon",
    attr: "×4 DICE",
    fpvColor: 0x888888,
    fpvDmg: 45,
    fpvTrauma: 0.8,
    fpvRange: 2.0,
    label: "💥 HARD ATTACK",
    type: "MELEE",
  },
  // KATANA — the player's own starting blade had NO entry here (Mark's console, 2026-07-20: [REF#CR-00005]
  // [VENDING] "KATANA" is in a vending pool but has NO MasterCardDatabase entry). It is stocked in
  // VENDING_WEAPON_CARDS (VendingMachine.js:119) and is the weapon string _debugKillMonster passes to
  // _applyMonsterDamage — a real, live weapon that simply could never be SOLD, because
  // _buildMiniVendingCard returns null on a missing entry and the guard then skips the name.
  // Stats sit between SLASH (15) and THRUST (20): a samurai's primary blade, reach 2.4 — longer than
  // a slash, shorter than a spear-like thrust. NOT invented from nothing: same shape and dice model as
  // every other MELEE entry above, so it cannot behave surprisingly.
  KATANA: {
    id: "MELEE",
    kanji: "刀",
    icon: "fa-khanda",
    desc: "Melee Weapon",
    attr: "×1 DICE",
    fpvColor: 0xc9d4dd,
    fpvDmg: 18,
    fpvTrauma: 0.25,
    fpvRange: 2.4,
    label: "🗡️ KATANA",
    type: "MELEE",
  },
  // TANTO BLADE — the weapon pool drops it (LootTables WEAPON_POOL); KATANA's numbers, because the pool's melee names share ONE band [REF#CR-00005]
  "TANTO BLADE": {
    id: "MELEE",
    kanji: "短刀",
    icon: "fa-khanda",
    desc: "Melee Weapon",
    attr: "×1 DICE",
    fpvColor: 0xc9d4dd,
    fpvDmg: 18,
    fpvTrauma: 0.25,
    fpvRange: 2.4,
    label: "🗡️ TANTO",
    type: "MELEE",
  },
  // WAKIZASHI BLADE — the weapon pool drops it (LootTables WEAPON_POOL); KATANA's numbers, because the pool's melee names share ONE band [REF#CR-00005]
  "WAKIZASHI BLADE": {
    id: "MELEE",
    kanji: "脇差",
    icon: "fa-khanda",
    desc: "Melee Weapon",
    attr: "×1 DICE",
    fpvColor: 0xc9d4dd,
    fpvDmg: 18,
    fpvTrauma: 0.25,
    fpvRange: 2.4,
    label: "🗡️ WAKIZASHI",
    type: "MELEE",
  },
  // NODACHI BLADE — the weapon pool drops it (LootTables WEAPON_POOL); KATANA's numbers, because the pool's melee names share ONE band [REF#CR-00005]
  "NODACHI BLADE": {
    id: "MELEE",
    kanji: "野太刀",
    icon: "fa-khanda",
    desc: "Melee Weapon",
    attr: "×1 DICE",
    fpvColor: 0xc9d4dd,
    fpvDmg: 18,
    fpvTrauma: 0.25,
    fpvRange: 2.4,
    label: "🗡️ NODACHI",
    type: "MELEE",
  },
  // BULLY CLUB (Mark 2026-09-26): the Manager's police baton — katana damage, stuns the monster it hits for one turn [REF#CR-00165]
  "BULLY CLUB": {
    id: "MELEE",
    kanji: "棍",
    icon: "fa-gavel",
    desc: "Melee Weapon · Stun",
    attr: "+18 ATK · STUN",
    fpvColor: 0x8a4dff,
    fpvDmg: 18,
    fpvTrauma: 0.28,
    fpvRange: 2.4,
    label: "🏏 BULLY CLUB",
    type: "MELEE",
  },

  // --- RANGED --- [REF#CR-00006]
  SHURIKEN: {
    id: "RANGED",
    kanji: "投",
    icon: "fa-star",
    desc: "Thrown Weapon",
    attr: "×1 DICE",
    fpvColor: 0x666666,
    fpvDmg: 10,
    fpvTrauma: 0.1,
    fpvRange: 15.0,
    label: "⭐ SHURIKEN",
    type: "RANGED",
  },
  "SHORT BOW": {
    id: "RANGED",
    kanji: "弓",
    icon: "fa-bow-arrow",
    desc: "Ranged Weapon",
    attr: "×2 DICE",
    fpvColor: 0x8b4513,
    fpvDmg: 20,
    fpvTrauma: 0.2,
    fpvRange: 20.0,
    label: "🏹 SHORT BOW",
    type: "RANGED",
  },
  "LONG BOW": {
    id: "RANGED",
    kanji: "長",
    icon: "fa-bow-arrow",
    desc: "Ranged Weapon",
    attr: "×4 DICE",
    fpvColor: 0x5c4033,
    fpvDmg: 18,
    fpvTrauma: 0.4,
    fpvRange: 30.0,
    label: "🏹 LONG BOW",
    type: "RANGED",
  },
  "SAMURAI BOW": {
    id: "RANGED",
    kanji: "侍",
    icon: "fa-bow-arrow",
    desc: "Ranged Weapon",
    attr: "×4 DICE",
    fpvColor: 0x5c4033,
    fpvDmg: 23,
    fpvTrauma: 0.4,
    fpvRange: 30.0,
    label: "🏹 SAMURAI BOW",
    type: "RANGED",
  },
  DAGGER: {
    id: "RANGED",
    kanji: "刃",
    icon: "fa-khanda",
    desc: "Thrown Blade",
    attr: "×1 DICE",
    fpvColor: 0xaaaaaa,
    fpvDmg: 10,
    fpvTrauma: 0.15,
    fpvRange: 12.0,
    label: "🗡️ DAGGER",
    type: "RANGED",
  },

  // --- ITEM --- [REF#CR-00007]
  // ── WEARABLE ARMOUR + THE TWO CARDS THAT WERE SILENTLY BLANK (Mark 2026-07-19) ─────────────────────
  //   MasterCardDatabase is keyed BY CARD NAME and had only THIRTEEN entries. _buildMiniVendingCard
  //   (VendingMachine.js ~178) does `const data = MasterCardDatabase[cardName]; if (!data) return null;`
  //   — so ANY vending slot stocked with a name that is not one of those thirteen rendered NOTHING. That
  //   is the standing "MAGIC LANTERN builds no mesh" bug: the card was in the vending pool and in the
  //   OTHER card list further down this file, but never here, so the slot came up empty with no error.
  //   SAMURAI HELMET had the same hole. Both are added below alongside Mark's armour set.
  //   ⚠ THIS FILE HAS TWO CARD STRUCTURES. This object (keyed by NAME) is what vending + the loot-card
  //   builder read. The array of {id, name, ...} lower down is a separate list. A card must be in BOTH
  //   to be fully wired — adding it to only one is invisible until someone stocks it.
  //   Mark's body model: chest 5 · legs 2 · head 1 · arms 1 · feet 1 = AC 10 for a full set.
  // ── KONBINI DELIVERY FOOD (Mark 2026-07-27: "create two food loot cards (steaming bowl of rice 3d model)
  //    … within 1 minute it will get cold and no longer steaming bowl of rice but a icecube bowl of rice").
  //    TWO cards, not one card with a flag, because they are two different things in the player's hand: one
  //    is worth delivering and one is an apology. The 3D model for both is procedural — see the RICE branch
  //    in LootCardBuilder.buildLegacyLootIcon (same silhouette, steam vs ice, so the swap reads instantly).
  //    Category is ITEM by the standing card-taxonomy rule: only MELEE / RANGED / SPELL / ITEM exist, and a
  //    new FOOD category would be a fifth. Registered in BOTH structures of this file — see the ⚠ above.
  "STEAMING RICE BOWL": {
    id: "ITEM",
    kanji: "湯気飯",
    icon: "fa-bowl-rice",
    desc: "Hot from the konbini — deliver it before it goes cold",
    attr: "DELIVER · 5G",
    fpvColor: 0xfdfbf4,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🍚 STEAMING RICE BOWL",
    type: "ITEM",
  },
  // GOHAN ご飯 — the player's own food (Mark 2026-07-27: "We also need to have a ITEM / FOOD / GOHAN for [REF#CR-00008]
  // players. We could drop them from monsters more like 20% of time."). A plain warm meal: the thing the
  // delivery run is CARRYING for somebody else, except this bowl is yours. Same steaming-bowl model as the
  // delivery, so the two read as the same food — that is the point, not a shortcut.
  // FIRST AID — the ADVENTURER's skill (Mark 2026-08-09: RELOAD out, bandage-tape card in).
  // type SKILL → the gold pill + the skill arc; effect = Panels window._useFirstAid (HOT, 1-min recovery).
  "FIRST AID": {
    id: "SKILL",
    kanji: "救",
    icon: "fa-kit-medical",
    desc: "Bandage tape. Wrap it and keep moving.",
    attr: "HEAL · 1 MIN",
    fpvColor: 0xf2efe6,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🩹 FIRST AID",
    type: "SKILL",
  },
  "GOHAN": {
    id: "ITEM",
    kanji: "ご飯",
    icon: "fa-bowl-rice",
    desc: "A warm bowl of rice. Eat it.",
    attr: "HEAL OVER TIME",
    fpvColor: 0xfdfbf4,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🍚 GOHAN",
    type: "ITEM",
  },
  // THE QUEST CARD (Mark 2026-07-27: "change title to FOOD DELIVERY · attribute SERVED HOT! · QUEST = label"). [REF#CR-00009]
  // One card that TRACKS the run, badge = jobs carried, rather than one card per bowl. `type` stays ITEM — the
  // taxonomy is MELEE/RANGED/SPELL/ITEM and QUEST is the printed pill, not a fifth category.
  "FOOD DELIVERY": {
    id: "ITEM",
    kanji: "任務",
    icon: "fa-bowl-rice",
    desc: "Hot food for the sleeping shift — click to light the way",
    attr: "DELIVER HOT",
    fpvColor: 0xb98cff,      // purple — the quest colour [REF#CR-00010]
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🍚 FOOD DELIVERY",
    type: "ITEM",
    pill: "QUEST",
    quest: true,
  },
  "COLD RICE BOWL": {
    id: "ITEM",
    kanji: "冷や飯",
    icon: "fa-bowl-rice",
    desc: "You took too long. Nobody wants this.",
    attr: "SPOILED",
    fpvColor: 0xcfe9ff,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🧊 COLD RICE BOWL",
    type: "ITEM",
  },
  "CHEST ARMOR": {
    id: "ITEM",
    kanji: "鎧",
    icon: "fa-shield-halved",
    desc: "Armor — the vital core",
    attr: "+5 AC",
    fpvColor: 0x9a7b4f,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🥋 CHEST ARMOR",
    type: "ITEM",
  },
  "SAMURAI HELMET": {
    id: "ITEM",
    kanji: "兜",
    icon: "fa-hat-wizard",
    desc: "Armor — head",
    attr: "+1 AC",
    fpvColor: 0x8a6410,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "⛩️ SAMURAI HELMET",
    type: "ITEM",
  },
  "GREAVES": {
    id: "ITEM",
    kanji: "脛当",
    icon: "fa-socks",
    desc: "Armor — shins",
    attr: "+2 AC",
    fpvColor: 0x7a7f8a,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🦵 GREAVES",
    type: "ITEM",
  },
  "GAUNTLETS": {
    id: "ITEM",
    kanji: "籠手",
    icon: "fa-hand-fist",
    desc: "Armor — forearms",
    attr: "+1 AC",
    fpvColor: 0x6f7683,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🧤 GAUNTLETS",
    type: "ITEM",
  },
  "BOOTS": {
    id: "ITEM",
    kanji: "草鞋",
    icon: "fa-shoe-prints",
    desc: "Armor — feet",
    attr: "+1 AC",
    fpvColor: 0x5d4a36,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "👢 BOOTS",
    type: "ITEM",
  },
  // ── PET FOOD — NetHack's tripe ration, canned (Mark 2026-09-14: "let it be picked up, its just loot inventory [REF#CR-00143]
  //    (ITEM). that way its like NETHACK - dont you remember it had tripe?"). A plain ITEM in the hand: tap it and
  //    it is tossed ahead for your pet; a pet that sees it on the floor eats it; with no pet about you eat it
  //    yourself ("Yak — dog food!"). In BOTH structures, per the rule above. Model: the tin (LootCardBuilder).
  "DOG FOOD": { id: "ITEM", kanji: "餌", icon: "fa-bone", desc: "Toss it to your pet.", attr: "FEED YOUR PET", fpvColor: 0xd9a066, fpvDmg: 0, fpvTrauma: 0, fpvRange: 0, label: "🥫 DOG FOOD", type: "ITEM" },
  "PET FOOD": {
    id: "ITEM",
    kanji: "餌",
    icon: "fa-bone",
    desc: "Tripe in a tin. Toss it to your pet.",
    attr: "FEED YOUR PET",
    fpvColor: 0xd9a066,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🥫 PET FOOD",
    type: "ITEM",
  },
  "MAGIC LANTERN": {
    id: "ITEM",
    kanji: "灯",
    icon: "fa-lightbulb",
    desc: "Light your way",
    attr: "EQUIP",
    fpvColor: 0xc79bff,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🏮 MAGIC LANTERN",
    type: "ITEM",
  },
  SHIELD: {
    id: "ITEM",
    kanji: "盾",
    icon: "fa-water",
    desc: "Armor",
    attr: "DEFEND ×2",
    fpvColor: 0x4444ff,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🛡️ SHIELD",
    type: "ITEM",
  },
  "HEAL POTION": {
    id: "ITEM",
    kanji: "具",
    icon: "fa-flask",
    desc: "Consumable",
    attr: "RESTORE",
    fpvColor: 0x00ff00,
    fpvDmg: -30,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🧪 HEAL POTION",
    type: "ITEM",
  },
  "SPELL POTION": {
    id: "ITEM",
    kanji: "魔",
    icon: "fa-flask",
    desc: "Consumable",
    attr: "RESTORE MP",
    fpvColor: 0x0088ff,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "🔵 SPELL POTION",
    type: "ITEM",
  },
  "HEALING": {
    id: "ITEM",
    kanji: "癒",
    icon: "fa-heart-pulse",
    desc: "Holy Spell",
    attr: "+40 HP",
    fpvColor: 0xeab308,
    fpvDmg: -40,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "💖 HEALING",
    type: "ITEM",
  },
  "IDENTITY SCROLL": {
    id: "ITEM",
    kanji: "巻",
    icon: "fa-scroll",
    desc: "Consumable",
    attr: "REVEAL",
    fpvColor: 0xaa00aa,
    fpvDmg: 0,
    fpvTrauma: 0.0,
    fpvRange: 0.0,
    label: "📜 IDENTITY SCROLL",
    type: "ITEM",
  },
  "DICE GAME": {
    id: "GAMING",
    kanji: "骰",
    icon: "fa-dice",
    desc: "Gaming Selector",
    attr: "ROLL DICE",
    type: "GAMING",
  },
  "CARD GAME": {
    id: "GAMING",
    kanji: "牌",
    icon: "fa-id-card",
    desc: "Gaming Selector",
    attr: "PLAY CARDS",
    type: "GAMING",
  },
  // ── THE TWO GAMBLING PERMITS (Mark's console, 2026-07-20) ─────────────────────────────────────── [REF#CR-00011]
  //   [VENDING] "POKER" / "BLACKJACK" is in a vending pool but has NO MasterCardDatabase entry.
  //   Both are stocked in VENDING_SKILL_CARDS (VendingMachine.js:125) — Mark asked for the poker one
  //   by name ("Can add POKER CARD in vending machine for sale") — so both were meant to be sellable
  //   and neither could be built.
  //
  //   ⚠ KEYED DELIBERATELY, NOT GUESSED. These names must line up with THREE existing consumers:
  //     · the vending pool strings 'POKER' / 'BLACKJACK'            (VendingMachine.js:125)
  //     · the hardcoded ADD_CARD payloads 'POKER' / 'BLACKJACK'     (Engine9 ~13917 / ~13961 comments)
  //     · the pickup regexes /POKER/ and /BLACKJACK|21/
  //   NOTE the floor-loot versions carry the TITLE 'POKER GAME' and 'BLACKJACK' (Engine9:13917, 13961)
  //   while the internal key for poker is 'POKER'. That title/key split already exists in the engine;
  //   I am matching the KEY here because that is what both the pool and ADD_CARD use. The `label`
  //   below carries the player-facing wording so the shop card still reads like the looted one.
  //   This is the same silent string-mismatch class as 'DICE' vs 'DICE GAME' and 'HELMET' vs
  //   'SAMURAI HELMET' — both of which cost real time. Do not "tidy" these keys without grepping
  //   all three consumers first.
  POKER: {
    id: "SKILL",
    kanji: "賭",
    icon: "fa-id-card",
    desc: "You will now know how to play poker!",
    attr: "POKER PERMIT",
    label: "🃏 POKER GAME",
    type: "SKILL",
  },
  BLACKJACK: {
    id: "SKILL",
    kanji: "廿",
    icon: "fa-id-card",
    desc: "You will now know how to play 21!",
    attr: "BLACKJACK PERMIT",
    label: "🂡 BLACKJACK",
    type: "SKILL",
  },

  // ── THE ROOM PERMITS — GOLD SKILL CARDS (Mark 2026-07-30) ────────────────────────────────────── [REF#CR-00012]
  //   "the player comes into a disfunctioning dilapidated dungeon. the player must find these SKILL
  //   cards to activate rooms in the dungeon - think DUNGEON KEEPER … everything needs a permit --
  //   inspectors came in and shut down the inn."
  //
  //   These deliberately reuse the SKILL shape rather than inventing a category. Mark's card taxonomy
  //   is MELEE/RANGED/SPELL/ITEM only, and SKILL already exists as the gold-rimmed "distinct 5th type"
  //   (LootCardBuilder getCardEdgeColor :62). The PERMIT idiom is not new either — POKER and BLACKJACK
  //   above already carry `attr: "… PERMIT"`. So a permit card is an existing thing with a new subject,
  //   which is why nothing downstream needs to learn a new type to render or bank one.
  //
  //   What IS new is the solid metal FACE. `rarity` is the only added field; LootCardBuilder reads it
  //   to swap the green SKILL face for a solid minted one. Keeping `id`/`type` at
  //   "SKILL" means every existing consumer — deck grouping, vending pools, the pickup path — keeps
  //   working unchanged. Changing `id` instead would have been the tidier-looking edit and would have
  //   silently dropped these from whichever Panels row groups on it.
  //
  //   ⚠ The KEY must equal the string in ROOM_PERMITS[].permit (js/v8/data/RoomPermits.js) — that table
  //   is what turns a card in the player's hand into "this opens the cabaret". Same three-consumer
  //   string-matching hazard the POKER note above warns about; grep RoomPermits.js before renaming.
  SINGING: {
    id: "SKILL",
    kanji: "唄",
    icon: "fa-microphone",
    desc: "Starlette's voice can wake this place. Touch the stage and let her sing.",
    attr: "CABARET PERMIT",
    label: "🎤 SINGING",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00013]
  },
  "KITCHEN PERMIT": {
    id: "SKILL",
    kanji: "厨",
    icon: "fa-id-card",
    desc: "The inspectors shut the kitchen. This puts the stoves back on.",
    attr: "KITCHEN PERMIT",
    label: "🍲 KITCHEN PERMIT",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00014 → see REF#CR-00013]
  },
  "STORE PERMIT": {
    id: "SKILL",
    kanji: "店",
    icon: "fa-id-card",
    desc: "Re-licenses the konbini. The lights buzz, the cooler hums, the doors chime.",
    attr: "STORE PERMIT",
    label: "🏪 STORE PERMIT",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00015 → see REF#CR-00013]
  },
  "FACTORY PERMIT": {
    id: "SKILL",
    kanji: "工",
    icon: "fa-id-card",
    desc: "The line can run again — once there are workers awake to run it.",
    attr: "FACTORY PERMIT",
    label: "⚙️ FACTORY PERMIT",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00016 → see REF#CR-00013]
  },
  // Floor-1 roster additions (Mark 2026-07-31: "LABORATORY : FACTORY : GUARD POST"). [REF#CR-00017]
  "LABORATORY PERMIT": {
    id: "SKILL",
    kanji: "研",
    icon: "fa-id-card",
    desc: "Signed off by an inspector who never came back. The still can run again.",
    attr: "LAB PERMIT",
    label: "⚗️ LABORATORY PERMIT",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00018 → see REF#CR-00013]
  },
  "GUARD POST PERMIT": {
    id: "SKILL",
    kanji: "番",
    icon: "fa-id-card",
    desc: "Someone has to watch the door. Reopen the post and they will.",
    attr: "POST PERMIT",
    label: "🛡️ GUARD POST PERMIT",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00019 → see REF#CR-00013]
  },
  // The tavern is the one OPTIONAL permit (Mark 2026-07-31) — the inn runs without it, it just runs [REF#CR-00020]
  // dry. Its dormant state is bare floor with a chalk outline, so the card is the only way in.
  "WORKS PERMIT": {   // was TAVERN PERMIT — the bar now opens with the cabaret; this card opens the three work sections (2026-09-10) [REF#CR-00142]
    id: "SKILL",
    kanji: "労",
    icon: "fa-id-card",
    desc: "A works licence, three stamps on one sheet. The cafeteria, the factory and the storage room all clock back on.",
    attr: "OPENS KITCHEN · FACTORY · STORAGE",
    label: "🏭 WORKS PERMIT",
    type: "SKILL",
    rarity: "SILVER",   // Mark 2026-07-31: permits are SILVER unless legendary — gold means GOLD_COIN [REF#CR-00021 → see REF#CR-00013]
  },
  // The 倉庫 and floor 2's trio (js/v8/data/RoomPermits.js STORAGE / ARMORY / ARCHERY / PRISON). Each key equals [REF#CR-00171]
  // its ROOM_PERMITS[].permit; kanji and desc are the ones the keeper's drop prints (Engine _keeperPermitDrop).
  "STORAGE PERMIT": {
    id: "SKILL",
    kanji: "倉",
    icon: "fa-id-card",
    desc: "A manifest with every crate accounted for. The stores may open.",
    attr: "STORAGE PERMIT",
    label: "📦 STORAGE PERMIT",
    type: "SKILL",
    rarity: "SILVER",
  },
  "ARMORY PERMIT": {
    id: "SKILL",
    kanji: "武",
    icon: "fa-id-card",
    desc: "A requisition slip, signed in something brown. The racks may be stocked.",
    attr: "ARMORY PERMIT",
    label: "⚔️ ARMORY PERMIT",
    type: "SKILL",
    rarity: "SILVER",
  },
  "ARCHERY PERMIT": {
    id: "SKILL",
    kanji: "弓",
    icon: "fa-id-card",
    desc: "A range certificate with two holes in it. The targets may go up.",
    attr: "ARCHERY PERMIT",
    label: "🏹 ARCHERY PERMIT",
    type: "SKILL",
    rarity: "SILVER",
  },
  "PRISON PERMIT": {
    id: "SKILL",
    kanji: "牢",
    icon: "fa-id-card",
    desc: "A warden's writ, keys drawn in the margin. The cells may be manned.",
    attr: "PRISON PERMIT",
    label: "⛓️ PRISON PERMIT",
    type: "SKILL",
    rarity: "SILVER",
  },
  "SLOT MACHINE": {
    id: "GAMING",
    kanji: "槽",
    icon: "fa-trophy",
    desc: "Gaming Device",
    attr: "SPIN REELS",
    type: "GAMING",
  },
  "CONTRACTS": {
    id: "GAMING",
    kanji: "契",
    icon: "fa-scroll",
    desc: "Guild Quests",
    attr: "ACCEPT QUESTS",
    type: "GAMING",
  },
};

// 2. Standard 2D Panel UI database entries (from OrigamiCards) [REF#CR-00022]
export const OrigamiCards = [
  // ── KONBINI DELIVERY FOOD — the SECOND of the two structures this file carries. A card present in only [REF#CR-00023]
  //    one of them is invisible until someone stocks it (the MAGIC LANTERN / SAMURAI HELMET bug documented
  //    above). Both rice bowls are in the MasterCardDatabase object too.
  {
    id: "steaming-rice-bowl",
    name: "STEAMING RICE BOWL",
    type: "ITEM",
    el: "ITEM",
    kanji: "湯気飯",
    desc: "Hot from the konbini — deliver it before it goes cold.",
    attr: "DELIVER · 5G",
    dice: 0,
    dot: 0,
    icon: "fa-bowl-rice",
  },
  {
    id: "first_aid",
    name: "FIRST AID",
    type: "SKILL",
    el: "SKILL",
    kanji: "救",
    desc: "Bandage tape. Wrap it and keep moving.",
    attr: "HEAL · 1 MIN",
    dice: 0,
    dot: 0,
    icon: "fa-kit-medical",
  },
  {
    id: "gohan",
    name: "GOHAN",
    type: "ITEM",
    el: "ITEM",
    kanji: "ご飯",
    desc: "A warm bowl of rice. Eat it.",
    attr: "HEAL OVER TIME",
    dice: 0,
    dot: 0,
    icon: "fa-bowl-rice",
  },
  {
    // ⚠ A card must live in BOTH structures — this array AND MasterCardDatabase above. One without the other [REF#CR-00024]
    // renders blank with no error (the MAGIC LANTERN bug). See the FOOD DELIVERY entry up there.
    id: "food-delivery",
    name: "FOOD DELIVERY",
    type: "ITEM",
    el: "ITEM",
    kanji: "任務",
    desc: "Hot food for the sleeping shift — click to light the way",
    attr: "DELIVER HOT",
    dice: 0,
    dot: 0,
    icon: "fa-bowl-rice",
    pill: "QUEST",
    quest: true,
  },
  {
    id: "cold-rice-bowl",
    name: "COLD RICE BOWL",
    type: "ITEM",
    el: "ITEM",
    kanji: "冷や飯",
    desc: "You took too long. Nobody wants this.",
    attr: "SPOILED",
    dice: 0,
    dot: 0,
    icon: "fa-bowl-rice",
  },
  // SPELLS [REF#CR-00025]
  {
    id: "boulder",
    name: "BOULDER",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "地",
    desc: "Heavy impact.",
    attr: "STUN ×2",
    dice: 2,
    dot: 0,
    animation: "projectile_boulder",
    icon: "fa-mountain",
  },
  {
    id: "fissure",
    name: "FISSURE",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "地",
    desc: "Ground breaking.",
    attr: "STUN ×2",
    dice: 2,
    dot: 0,
    animation: "aoe_fissure",
    icon: "fa-mountain",
  },
  {
    id: "gale",
    name: "GALE",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "風",
    desc: "Forceful gust.",
    attr: "PUSH ×3",
    dice: 3,
    dot: 0,
    animation: "projectile_wind",
    icon: "fa-wind",
  },
  {
    id: "fireball",
    name: "FIREBALL",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "火",
    desc: "Inferno star.",
    attr: "×4 DICE",
    dice: 4,
    dot: 0,
    animation: "projectile_fireball",
    icon: "fa-fire",
  },
  {
    id: "pyroblast",
    name: "PYROBLAST",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "火",
    desc: "Massive fire damage.",
    attr: "×6 DICE",
    dice: 6,
    dot: 2,
    animation: "projectile_fireball",
    icon: "fa-fire",
  },
  {
    id: "comet",
    name: "COMET",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "火",
    desc: "Rains from above.",
    attr: "×8 DICE",
    dice: 8,
    dot: 0,
    animation: "aoe_comet",
    icon: "fa-fire",
  },
  {
    id: "tide",
    name: "TIDE",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "水",
    desc: "Washes away foes.",
    attr: "SLOW ×3",
    dice: 3,
    dot: 0,
    animation: "aoe_tide",
    icon: "fa-water",
  },
  {
    id: "surge",
    name: "SURGE",
    type: "SPELLS",
    el: "SPELLS",
    kanji: "水",
    desc: "Crashing wave.",
    attr: "×3 DICE",
    dice: 3,
    dot: 0,
    animation: "projectile_surge",
    icon: "fa-water",
  },

  // RANGED [REF#CR-00026]
  {
    id: "shuriken",
    name: "SHURIKEN",
    type: "RANGED",
    el: "RANGED",
    kanji: "投",
    desc: "Ranged attack.",
    attr: "×2 DICE",
    dice: 2,
    dot: 0,
    animation: "projectile_shuriken",
    icon: "fa-star",
  },
  {
    id: "short_bow",
    name: "SHORT BOW",
    type: "RANGED",
    el: "RANGED",
    kanji: "弓",
    desc: "Quick arrow.",
    attr: "×2 DICE",
    dice: 2,
    dot: 0,
    animation: "projectile_arrow",
    icon: "fa-bow-arrow",
  },
  {
    id: "long_bow",
    name: "LONG BOW",
    type: "RANGED",
    el: "RANGED",
    kanji: "長",
    desc: "Piercing shot.",
    attr: "×4 DICE",
    dice: 4,
    dot: 0,
    animation: "projectile_arrow",
    icon: "fa-bow-arrow",
  },
  {
    id: "samurai_bow",
    name: "SAMURAI BOW",
    type: "RANGED",
    el: "RANGED",
    kanji: "侍",
    desc: "Japanese Recurve.",
    attr: "×4 DICE",
    dice: 4,
    dot: 0,
    animation: "projectile_arrow",
    icon: "fa-bow-arrow",
  },
  {
    id: "dagger",
    name: "DAGGER",
    type: "RANGED",
    el: "RANGED",
    kanji: "刃",
    desc: "Thrown Blade",
    attr: "×1 DICE",
    dice: 1,
    dot: 0,
    animation: "projectile_arrow",
    icon: "fa-khanda",
  },
  {
    id: "wand_of_fireballs",
    name: "WAND OF FIREBALLS",
    type: "RANGED",
    el: "RANGED",
    kanji: "爆",
    desc: "Bazooka. 2.36-inch rockets.",
    attr: "AREA BLAST",
    dice: 6,
    dot: 0,
    animation: "projectile_fireball",
    icon: "fa-rocket",
  },
  {
    // ROCKETS (2026-09-29): ammunition for the WAND OF FIREBALLS. Never a card in the hand — the Panels bazooka ledger turns [REF#CR-00172]
    // each one into loaded rockets (window._rocketsPerPack, 2) and a reserve. Sold in every vending machine.
    id: "rockets",
    name: "ROCKETS",
    type: "ITEM",
    el: "ITEM",
    kanji: "弾",
    desc: "M6A1 rockets for the bazooka.",
    attr: "+2 ROCKETS",
    dice: 0,
    dot: 0,
    animation: "none",
    icon: "fa-rocket",
  },
  {
    id: "wand_of_magic_missiles",
    name: "WAND OF MAGIC MISSILES",
    type: "RANGED",
    el: "RANGED",
    kanji: "銃",
    desc: "9mm Glock.",
    attr: "×3 DICE",
    dice: 3,
    dot: 0,
    animation: "projectile_arrow",
    icon: "fa-gun",
  },
  {
    id: "magic_auto_missile",
    name: "MAGIC AUTO MISSILE",
    type: "RANGED",
    el: "RANGED",
    kanji: "連",
    desc: "MAC-9. 30 rounds, 3-round auto burst.",
    attr: "×3 BURST",
    dice: 3,
    dot: 0,
    burst: 3,
    ammo: 30,
    animation: "projectile_arrow",
    icon: "fa-gun",
  },
  {
    id: "tommy_gun",
    name: "TOMMY GUN",
    type: "RANGED",
    el: "RANGED",
    kanji: "機",
    desc: "Mobster firepower.",
    attr: "×8 DICE",
    dice: 8,
    dot: 0,
    animation: "projectile_arrow",
    icon: "fa-gun",
  },

  // MELEE [REF#CR-00027]
  {
    id: "slash",
    name: "SLASH",
    type: "MELEE",
    el: "MELEE",
    kanji: "斬",
    desc: "Basic slash.",
    attr: "×1 DICE",
    dice: 1,
    dot: 0,
    animation: "melee_slash",
    icon: "fa-fire",
  },
  {
    id: "thrust",
    name: "THRUST",
    type: "MELEE",
    el: "MELEE",
    kanji: "突",
    desc: "Quick poke.",
    attr: "×1 DICE",
    dice: 1,
    dot: 0,
    animation: "melee_thrust",
    icon: "fa-wind",
  },
  {
    id: "strong_attack",
    name: "HARD ATTACK",
    type: "MELEE",
    el: "MELEE",
    kanji: "強",
    desc: "Hard blow with reduced accuracy.",
    attr: "×4 DICE",
    dice: 4,
    dot: 0,
    animation: "melee_strong",
    icon: "fa-mountain",
  },
  {
    id: "mace",
    name: "MACE",
    type: "MELEE",
    el: "MELEE",
    kanji: "鎚",
    desc: "Priest's mace.",
    attr: "×2 DICE",
    dice: 2,
    dot: 0,
    animation: "melee_strong",
    icon: "fa-hammer",
  },
  {
    id: "tanto_blade", name: "TANTO BLADE", type: "MELEE", el: "MELEE", kanji: "短刀", desc: "A short blade, worn at the belt.",
    attr: "×1 DICE", dice: 1, dot: 0, animation: "melee_thrust", icon: "fa-khanda",
  },
  {
    id: "wakizashi_blade", name: "WAKIZASHI BLADE", type: "MELEE", el: "MELEE", kanji: "脇差", desc: "The companion sword.",
    attr: "×1 DICE", dice: 1, dot: 0, animation: "melee_slash", icon: "fa-khanda",
  },
  {
    id: "nodachi_blade", name: "NODACHI BLADE", type: "MELEE", el: "MELEE", kanji: "野太刀", desc: "A field sword, absurdly long.",
    attr: "×1 DICE", dice: 1, dot: 0, animation: "melee_strong", icon: "fa-khanda",
  },
  {
    id: "ninja_sword",
    name: "NINJA SWORD",
    type: "MELEE",
    el: "MELEE",
    kanji: "忍",
    desc: "Ninja sword.",
    attr: "×2 DICE",
    dice: 2,
    dot: 0,
    animation: "melee_thrust",
    icon: "fa-khanda",
  },

  // ITEM [REF#CR-00028]
  {
    id: "heal_potion",
    name: "HEAL POTION",
    type: "ITEM",
    el: "ITEM",
    kanji: "具",
    desc: "Consumable",
    attr: "+20 HP",
    dice: 0,
    dot: 0,
    animation: "effect_heal",
    icon: "fa-flask",
  },
  {
    id: "potion",
    name: "POTION",
    type: "ITEM",
    el: "ITEM",
    kanji: "具",
    desc: "Consumable",
    attr: "+20 HP",
    dice: 0,
    dot: 0,
    animation: "effect_heal",
    icon: "fa-flask",
  },
  {
    id: "scroll_identity",
    name: "IDENTITY SCROLL",
    type: "ITEM",
    el: "ITEM",
    kanji: "巻",
    desc: "Reveals truth.",
    attr: "REVEAL",
    dice: 0,
    dot: 0,
    animation: "effect_buff",
    icon: "fa-scroll",
  },
  {
    id: "shield",
    name: "SHIELD",
    type: "ITEM",
    el: "ITEM",
    kanji: "盾",
    desc: "Raises AC.",
    attr: "+5 AC",
    dice: 0,
    dot: 0,
    animation: "effect_defend",
    icon: "fa-water",
  },
  {
    id: "samurai_helmet",
    name: "SAMURAI HELMET",
    type: "ITEM",
    el: "ITEM",
    kanji: "兜",
    desc: "+15 DEF.",
    attr: "EQUIP",
    dice: 0,
    dot: 0,
    animation: "effect_equip",
    icon: "fa-hat-wizard",
  },
  // ── ARMOUR SET (Mark 2026-07-19). His body model: chest 5 · legs 2 · head 1 · arms 1 · feet 1 = AC 10. [REF#CR-00029]
  //    Before this the ONLY wearable cards in the entire database were SHIELD and SAMURAI HELMET, so the
  //    Armor Class dial could never leave 0 — the stat existed with nothing to feed it. These four complete
  //    the set. SAMURAI HELMET stays the head piece (renaming it would orphan every existing save/deck);
  //    the AC table aliases it rather than replacing it.
  //    attr shows the AC each piece grants, so the card face teaches the system without a tutorial.
  {
    id: "chest_armor",
    name: "CHEST ARMOR",
    type: "ITEM",
    el: "ITEM",
    kanji: "鎧",
    desc: "Lacquered do. The vital core.",
    attr: "+5 AC",
    dice: 0,
    dot: 0,
    animation: "effect_equip",
    icon: "fa-shield-halved",
  },
  {
    id: "greaves",
    name: "GREAVES",
    type: "ITEM",
    el: "ITEM",
    kanji: "脛当",
    desc: "Shin plates. Keeps you running.",
    attr: "+2 AC",
    dice: 0,
    dot: 0,
    animation: "effect_equip",
    icon: "fa-socks",
  },
  {
    id: "gauntlets",
    name: "GAUNTLETS",
    type: "ITEM",
    el: "ITEM",
    kanji: "籠手",
    desc: "Iron sleeves for the forearms.",
    attr: "+1 AC",
    dice: 0,
    dot: 0,
    animation: "effect_equip",
    icon: "fa-hand-fist",
  },
  {
    id: "boots",
    name: "BOOTS",
    type: "ITEM",
    el: "ITEM",
    kanji: "草鞋",
    desc: "Steel-toed straw sandals.",
    attr: "+1 AC",
    dice: 0,
    dot: 0,
    animation: "effect_equip",
    icon: "fa-shoe-prints",
  },
  { id: "dog_food", name: "DOG FOOD", type: "ITEM", el: "ITEM", kanji: "餌", desc: "Toss it to your pet.", attr: "FEED YOUR PET", dice: 0, dot: 0, icon: "fa-bone" },
  {
    id: "pet_food",
    name: "PET FOOD",
    type: "ITEM",
    el: "ITEM",
    kanji: "餌",
    desc: "Tripe in a tin. Toss it to your pet.",
    attr: "FEED YOUR PET",
    dice: 0,
    dot: 0,
    icon: "fa-bone",
  },
  {
    id: "magic_lantern",
    name: "MAGIC LANTERN",
    type: "ITEM",
    el: "ITEM",
    kanji: "灯",
    desc: "Light your way.",
    attr: "EQUIP",
    dice: 0,
    dot: 0,
    animation: "effect_equip",
    icon: "fa-lightbulb",
  },
  {
    id: "gold_coin",
    name: "GOLD COIN",
    type: "ITEM",
    el: "ITEM",
    kanji: "金",
    desc: "Wealth.",
    attr: "+50 GOLD",
    dice: 0,
    dot: 0,
    animation: "effect_gold",
    icon: "fa-coins",
  },
  {
    id: "card_game",
    name: "CARD GAME",
    type: "GAMING",
    el: "GAMING",
    kanji: "牌",
    desc: "Play blackjack.",
    attr: "WAGER",
    dice: 0,
    dot: 0,
    animation: "effect_wager",
    icon: "fa-cards",
    action: "WAGER",
  },
  {
    id: "dice_game",
    name: "DICE GAME",
    type: "GAMING",
    el: "GAMING",
    kanji: "骰",
    desc: "Roll for gold.",
    attr: "ROLL DICE",
    dice: 2,
    dot: 0,
    animation: "effect_dice",
    icon: "fa-dice",
    action: "DICE",
  },
  {
    id: "slot_machine",
    name: "SLOT MACHINE",
    type: "GAMING",
    el: "GAMING",
    kanji: "槽",
    desc: "Spin the elements.",
    attr: "SPIN REELS",
    dice: 0,
    dot: 0,
    animation: "effect_slot",
    icon: "fa-slot-machine",
    action: "SLOT",
  },
  {
    id: "contracts",
    name: "CONTRACTS",
    type: "GAMING",
    el: "GAMING",
    kanji: "約",
    desc: "Dungeon quests.",
    attr: "QUESTS",
    dice: 0,
    dot: 0,
    animation: "effect_quest",
    icon: "fa-file-contract",
    action: "CONTRACTS",
  },
];

// ── THE TWO STRUCTURES ARE ONE SET (2026-09-14, the card gate — scripts/probe-card-registry.js A2) ────────────── [REF#CR-00163]
// This file's own header warned that a card in only one of them "is invisible until someone stocks it", and by
// 2026-09-14 twenty cards were: KATANA, POKER and every permit lived only in MasterCardDatabase; MACE, NINJA SWORD,
// MAGIC AUTO MISSILE, the wands, TOMMY GUN, POTION and GOLD COIN only in OrigamiCards. Rather than hand-copy twenty
// rows and let the next one drift, each structure is completed FROM the other at load: a Master entry with no
// OrigamiCards row gets one (id = slug, el = the family — the same el every hand-written row of that family uses, so
// the deck resolver treats it identically), and an OrigamiCards-only card gets a Master entry (vending's stock check
// and mini card read it; fpv numbers 0 — none of these are fired through the fpv tables). Rows made here carry
// `_derived: true` so a reader can tell. The registry (js/v8/cards/CardRegistry.js) is the list of what exists;
// this keeps the two shapes of it equal.
for (const [name, m] of Object.entries(MasterCardDatabase)) {
  if (OrigamiCards.some(c => c.name === name)) continue;
  OrigamiCards.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, type: m.type, el: m.type || m.id, kanji: m.kanji, desc: m.desc, attr: m.attr, dice: 0, dot: 0, icon: m.icon, _derived: true });
}
for (const c of OrigamiCards) {
  if (MasterCardDatabase[c.name]) continue;
  MasterCardDatabase[c.name] = { id: c.type || c.el, kanji: c.kanji, icon: c.icon, desc: c.desc, attr: c.attr, fpvColor: 0xcccccc, fpvDmg: 0, fpvTrauma: 0.0, fpvRange: 0.0, label: c.name, type: c.type || c.el, _derived: true };
}

// Helper to get categories grouped by Element [REF#CR-00030]
export function getOrigamiCategories() {
  const cats = {};
  OrigamiCards.forEach(c => {
    if (!cats[c.el]) {
      cats[c.el] = {
        id: c.el,
        kanji: c.kanji,
        icon: c.icon,
        desc: c.desc,
        attr: c.attr,
        cards: []
      };
    }
    cats[c.el].cards.push(c.name);
  });
  return Object.values(cats);
}

// 3. FPV rendering / FX database (from CardRegistry.js) [REF#CR-00031]
export const CardDatabase = {
  // === SPELLS === [REF#CR-00032]
  BOULDER: {
    title: "BOULDER",
    desc: "Heavy impact.",
    attr: "STUN ×2",
    category: "SPELLS",
    fx: {
      type: "projectile",
      geometry: "dodecahedron",
      size: 0.8,
      color: 0x5c4033, // Brown dirt [REF#CR-00033]
      roughness: 0.9,
      metalness: 0.1,
      speed: 16.0,
      damage: 100, // Insta-kill standard [REF#CR-00034]
      pierce: true, // Continues through enemies [REF#CR-00035]
      yOffset: 0.5,
      roll: true, // Tumbling animation [REF#CR-00036]
    },
  },
  FISSURE: {
    title: "FISSURE",
    desc: "Sunders the earth.",
    attr: "STUN ×3",
    category: "SPELLS",
    fx: {
      type: "projectile",
      geometry: "box",
      size: { x: 1.5, y: 0.1, z: 2.0 },
      color: 0x3d2314, // Dark brown [REF#CR-00037]
      speed: 20.0,
      damage: 100,
      yOffset: 0.05,
      roll: false,
    },
  },
  GALE: {
    title: "GALE",
    desc: "Forceful gust.",
    attr: "PUSH ×3",
    category: "SPELLS",
    fx: {
      type: "projectile",
      geometry: "sphere",
      size: 1.2,
      color: 0xc8e6c9, // Pale wind green [REF#CR-00038]
      transparent: true,
      opacity: 0.4,
      speed: 25.0,
      damage: 50,
      yOffset: 1.0,
      roll: false,
    },
  },
  FIREBALL: {
    title: "FIREBALL",
    desc: "Inferno star.",
    attr: "×4 DICE",
    category: "SPELLS",
    fx: {
      type: "projectile",
      geometry: "sphere",
      size: 0.6,
      color: 0xff3d00, // Bright orange [REF#CR-00039]
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      speed: 20.0,
      damage: 100,
      yOffset: 1.0,
      roll: false,
    },
  },
  PYROBLAST: {
    title: "PYROBLAST",
    desc: "Searing heat.",
    attr: "×6 DICE",
    category: "SPELLS",
  },
  COMET: {
    title: "COMET",
    desc: "Meteor strike.",
    attr: "×8 DICE",
    category: "SPELLS",
  },
  TIDE: {
    title: "TIDE",
    desc: "Viscous tide.",
    attr: "SLOW ×3",
    category: "SPELLS",
  },
  SURGE: {
    title: "SURGE",
    desc: "Crashing wave.",
    attr: "SLOW ×4",
    category: "SPELLS",
  },

  // === ITEM === [REF#CR-00040]
  POTION: {
    title: "POTION",
    desc: "Green nectar.",
    attr: "HEAL ×1",
    category: "ITEM",
  },
  "SPELL POTION": {
    title: "SPELL POTION",
    desc: "Mana potion.",
    attr: "RESTORE MP",
    category: "ITEM",
  },
  HEALING: {
    title: "HEALING",
    desc: "Divine healing.",
    attr: "+40 HP",
    category: "ITEM",
  },
  "IDENTITY SCROLL": {
    title: "IDENTITY SCROLL",
    desc: "Reveal truths.",
    attr: "REVEAL",
    category: "ITEM",
  },

  // === MELEE === [REF#CR-00041]
  SLASH: {
    title: "SLASH",
    desc: "Basic slash.",
    attr: "×1 DICE",
    category: "MELEE",
    fx: { type: "melee", animation: "SLASH", weaponColor: "#ff0000" },
  },
  THRUST: {
    title: "THRUST",
    desc: "Fast thrust.",
    attr: "×1 DICE",
    category: "MELEE",
    fx: { type: "melee", animation: "THRUST", weaponColor: "#ff0000" },
  },
  "HARD ATTACK": {
    title: "HARD ATTACK",
    desc: "Hard attack with reduced accuracy.",
    attr: "×4 DICE",
    category: "MELEE",
    fx: {
      type: "melee",
      animation: "HARD ATTACK",
      weaponColor: "#ff8c00",
      weaponModel: "cross-swords",
    },
  },
  DEFEND: {
    title: "DEFEND",
    desc: "Raises AC.",
    attr: "DEFEND ×2",
    category: "MELEE", // Enforces tactical defense skills into Melee deck [REF#CR-00042]
  },

  // === WAGER (BETTING) === [REF#CR-00043]
  "BET EVEN": {
    title: "EVEN ROLL",
    desc: "Bet on 2, 4, 6, 8, 10, 12.",
    attr: "PAYS 2×",
    category: "BETTING",
  },
  "BET ODD": {
    title: "ODD ROLL",
    desc: "Bet on 3, 5, 7, 9, 11.",
    attr: "PAYS 2×",
    category: "BETTING",
  },
  "BET HIGH": {
    title: "HIGH STAKES (8+)",
    desc: "Bet on 8, 9, 10, 11, 12.",
    attr: "PAYS 3×",
    category: "BETTING",
  },
  "DICE GAME": {
    title: "DICE GAME",
    desc: "Bettable dice games: Cho-Han, Dice Duel, Liars Dice.",
    attr: "ROLL DICE",
    category: "GAMING",
  },
  "CARD GAME": {
    title: "CARD GAME",
    desc: "Bettable card games: Blackjack, Hi-Lo, Baccarat, Poker Duel.",
    attr: "PLAY CARDS",
    category: "GAMING",
  },
  "SLOT MACHINE": {
    title: "SLOT MACHINE",
    desc: "Spin the slot machine to match symbols and win jackpot payouts!",
    attr: "PULL LEVER",
    category: "GAMING",
  },
  "CONTRACTS": {
    title: "CONTRACTS",
    desc: "Guild contracts: slay underbosses, deliver key items, or find treasures.",
    attr: "CONTRACTS",
    category: "GAMING",
  },
};

export const CategoryMappings = {
  SPELLS: { id: "SPELLS", kanji: "地", icon: "fa-mountain" },
  MELEE: { id: "MELEE", kanji: "斬", icon: "fa-fire" },
  RANGED: { id: "RANGED", kanji: "刃", icon: "fa-khanda" },
  ITEM: { id: "ITEM", kanji: "薬", icon: "fa-flask" },
  BETTING: { id: "BETTING", kanji: "賭", icon: "fa-dice" },
  GAMING: { id: "GAMING", kanji: "遊", icon: "fa-gamepad" },

  // Fallbacks [REF#CR-00044]
  EARTH: { id: "SPELLS", kanji: "地", icon: "fa-mountain" },
  WIND: { id: "SPELLS", kanji: "風", icon: "fa-wind" },
  FIRE: { id: "SPELLS", kanji: "火", icon: "fa-fire" },
  WATER: { id: "SPELLS", kanji: "水", icon: "fa-water" },
  KATANA: { id: "MELEE", kanji: "斬", icon: "fa-fire" },
  "BULLY CLUB": { id: "MELEE", kanji: "棍", icon: "fa-gavel" },
  SHIELD: { id: "ITEM", kanji: "盾", icon: "fa-water" },
  SCROLL: { id: "ITEM", kanji: "巻", icon: "fa-scroll" },
};

// Returns standard UI grouping mapping [REF#CR-00045]
export function buildDeckLayout(deckType = "default") {
  let rawDeck = [];
  if (deckType === "default") {
    rawDeck = [
      ["BOULDER", "FISSURE"],
      ["GALE"],
      ["FIREBALL", "PYROBLAST", "COMET"],
      ["TIDE", "SURGE"],
      ["POTION", "IDENTITY SCROLL"],
    ];
  } else if (deckType === "combat") {
    rawDeck = [
      ["SLASH"],
      ["THRUST"],
      ["STRONG ATTACK"],
      ["DEFEND"],
      ["POTION"],
    ];
  } else if (deckType === "wager") {
    rawDeck = [
      ["BET EVEN"],
      ["BET ODD"],
      ["BET HIGH"],
      ["DEFEND"],
      ["POTION"],
    ];
  } else if (deckType === "gaming") {
    rawDeck = [
      ["DICE GAME"],
      ["CARD GAME"],
      ["SLOT MACHINE"],
      ["CONTRACTS"],
    ];
  }

  return rawDeck
    .map(columnKeys => {
      if (columnKeys.length === 0) return null;

      // Infer category from the first card [REF#CR-00046]
      const firstCard = CardDatabase[columnKeys[0]];
      const catMap =
        CategoryMappings[firstCard.category] || CategoryMappings.ITEM;

      return {
        id: catMap.id,
        kanji: catMap.kanji,
        icon: catMap.icon,
        // Construct the UI-expected full card objects [REF#CR-00047]
        cards: columnKeys.map(key => {
          const c = CardDatabase[key];
          return {
            id: key, // Internal key (e.g. 'BOULDER') [REF#CR-00048]
            title: c.title,
            desc: c.desc,
            attr: c.attr,
            category: c.category,
          };
        }),
      };
    })
    .filter(c => c !== null);
}
