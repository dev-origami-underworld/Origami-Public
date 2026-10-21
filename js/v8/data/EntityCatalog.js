/** [REF#DA-00004]
 * Shared read-only entity catalog for guide/setup surfaces.
 *
 * Runtime spawning still lives in MapGen.js and Engine9.html. This module
 * centralizes the guide-facing monster/avatar metadata so pages 7-10 do not
 * carry stale local copies of model URLs and spawn notes.
 */

export const MODEL_URLS = {
    monster: {
        goblin: './assets/models/monster/goblin/newer.yakuzagoblin.opt.glb',   // the newer Yakuza goblin is the only goblin rig (2026-09-29) [REF#DA-00247]
        orc: './assets/models/monster/orc.glb',
        goblinNewer: './assets/models/monster/goblin/newer.yakuzagoblin.opt.glb',   // Mark's newer.yakuzagoblin.glb, optimized (2026-09-27) — see Engine9 _GOBLIN_GLB   // the orc AND the Manager (the BOSS wears the orc rig — Engine9 _spawnManager, nameKey 'orc') (2026-09-27) [REF#DA-00239]
        imp: './assets/models/monster/imp/imp-animated-new.glb',
        mummy: './assets/models/monster/mummy/new-yakuza-mummy.glb',
        hungryGhost: './assets/models/monster/ghosts/hungry-ghost.glb',
        // ── THE BUILDING INSPECTOR (Mark 2026-08-04) ───────────────────────────────────────────── [REF#DA-00005]
        //    One per special-building room. The spec used to prescribe "an oversized goblin at 2x
        //    scale, no model yet"; the model now exists and that stand-in is retired (bd2aa73).
        //    ⚠ PATH CASE IS LOAD-BEARING: the directory is capital-O `Ogre/`, the file lowercase
        //    `ogre.glb`. macOS is case-insensitive and will forgive a typo here that a Linux host
        //    serving the built game will 404 on.
        ogre: './assets/models/monster/oni/ONI.1.glb',   // 2026-10-08: the guards wear ONI.1.glb (Mark: "install ONI.1.glb as their replacements"); ogre.glb behind window._oniGuard = false [REF#DA-00248]
        // SINGULAR + THE LIVE ASSET (Mark 2026-07-19: "succubi no longer exists, succubus" / "use the models"). [REF#DA-00006]
        // This pointed at Sucubus-Dancer.glb while the engine spawns Succubus-3.fixed.glb (~10114) — so the
        // guidebook previewed a DIFFERENT model than the game, and any clip named in the preview might not exist
        // on the rig that actually runs. Same file as the engine now, so previewed clips are the real clips.
        // NOTE the .fixed variant is deliberate: the raw Succubus-3.glb ships Armature scale 0.01 and would hit
        // the skinned-Box3 trap. It also carries a stray "Cube" mesh the engine strips on load.
        // ⛔ DANCER DELETED 2026-08-11 (Mark: "just delete the entire model since its all fucked up.
        //    delete it."). stariko.fixed.glb is GONE FROM DISK, so these must not point at it — a
        //    guidebook preview of a missing GLB is a 404 plus an empty canvas, which is exactly the
        //    "ghost UI" failure we keep paying for. null, not a substitute model: previewing some other
        //    rig under her name is how the tree ended up with Stariko wearing Dancer's body.
        //    ⚠ NOT Starlette (Starlette.glb) and NOT Stariko (stariko.glb) — both untouched, both live.
        // ♻️ REPOINTED 2026-08-11 — REVIVED AS **DANCER** (Mark: "it will appear in the entrance now.
        //    so we can test succubus"). New-Succubus.fixed.glb is restored from f0659d9^ with its md5
        //    verified against the deleted blob, and the ENGINE now loads THE SAME FILE (Engine9 ~:21481
        //    was fetching stariko.fixed.glb while everything else named this one — that split is the
        //    documented cause of the fifteen failed tilt passes). One character, one asset, both paths.
        succubus: './assets/models/monster/succubus/New-Succubus.fixed.glb',
        succubi: './assets/models/monster/succubus/New-Succubus.fixed.glb',   // legacy alias — old code/settings referencing MODEL_URLS.monster.succubi still resolve   // Mark 2026-07-12 "replace old succubus model in SETTINGS PAGE guidebook with this model" — the LIVE Dancer (14MB, 12 clips), the same GLB the engine spawns as the cabaret monster. (Previous: TOOLS/glb-compress/out/Succubi.test.glb, the clip-less codex bake of the RETIRED Succubi model. The panels preview's degenerate-rig guard — pg60, sub-5cm bind box → rest-pose bake — covers Dancer's 0.01 armature.) [REF#DA-00007]
    },
    player: {
        playerA: './assets/models/player/Player.A.glb',
        playerAWalking: './assets/models/player/Player.A.Walking.glb',
        playerB: './assets/models/player/Player.B.glb',
        playerATexture: './assets/models/player/Player.A.png',
        playerBTexture: './assets/models/player/Player.B.png',
    },
};

// ── B5 FIX (Mark 2026-07-19 "why is monster pages still fucked up? this isnt usable") ────────────── [REF#DA-00008]
// `key` is the SPAWN nameKey (what MapGen/Engine9 stamp on a monster). `animKey` is the ENGINE'S
// CANONICAL ANIMATION-MAP KEY, produced by `_ANIM_KEY_BY_NAME` in NewOrigami.Engine9.html (~26288).
// For the goblin (and the supervisor, which reuses the goblin rig) THOSE TWO DIFFER: spawns say
// 'yakuza_goblin', the engine's anim map says 'gobl_normal'. The codex keyed its editor off `key`, so
// the goblin clip editor could NEVER populate and any map saved from the guidebook was NEVER read
// back — the single most-wanted monster had the emptiest panel. Always route anim/manifest lookups
// through `animKeyFor()`; never assume key === animKey.
export const MONSTER_CATALOG = [
    {
        key: 'yakuza_goblin', animKey: 'gobl_normal', display: 'Yakuza Goblin', kanji: '鬼',
        archetype: 'Live monster - melee brawler', accent: '#22c55e',
        model: MODEL_URLS.monster.goblin,
        modelSlot: 'assets/models/monster/goblin/',
        hp: '50 x 1.10^(floor-1) - 50 (L1) / 89 (L7) / 306 (L20) / unbounded', hpRef: 'DungeonChain.js: hpForLevel()',   // Mark 2026-07-19: was 'hpByLevel - 50..308 (L20)' pointing at MapGen.js:1052 — that 20-entry table was replaced by a curve (it froze at 308 forever, which is what made an infinite dungeon meaningless), and the MapGen line reference was already dead [REF#DA-00009]
        scale: 1.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Katana', weaponCard: 'MELEE - DMGx1DICE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [
            { FIRE:1.3, WATER:1.0, EARTH:0.8, WIND:1.0, VOID:1.2, DEFAULT:1.0 },
            { FIRE:1.0, WATER:1.4, EARTH:0.5, WIND:0.7, VOID:1.0, DEFAULT:1.0 },
            { FIRE:1.8, WATER:0.4, EARTH:1.0, WIND:1.2, VOID:1.1, DEFAULT:1.0 },
            { FIRE:1.0, WATER:1.5, EARTH:1.4, WIND:0.5, VOID:1.0, DEFAULT:1.0 },
            { FIRE:1.4, WATER:1.0, EARTH:1.0, WIND:1.0, VOID:0.4, DEFAULT:1.0 },
            { FIRE:0.5, WATER:1.6, EARTH:1.0, WIND:1.3, VOID:1.1, DEFAULT:1.0 },
        ],
        levels: [1,2,3,4,5,6,7],
        note: 'Live base mob. SETUP can preview and override the model path; hitbox and missile landing boxes are recalculated from GLB bounds.',
    },
    {
        // ── BUILDING INSPECTOR — the authority that shut the dungeon down (Mark 2026-08-04) ─────── [REF#DA-00010]
        //    One sleeps in each section's special-building room. Rules Mark gave with it: goes hostile
        //    on COLLISION or on being attacked · WILL NOT GAMBLE, so wager/parley is closed and the
        //    only routes are violence or the camera · defeating one is ALWAYS +5 karma, both routes.
        //    ⚠ Its BEHAVIOUR is not here and is not built — this entry only makes the entity spawnable
        //    and give it a model. Without the two-flash camera dissolve, a camera-only player cannot
        //    beat one. See MAP_SYSTEM_REBUILD_HANDOFF §2.
        //    Scale 1.6, not the 2.0 the old stand-in used: 2.0 was chosen to make a GOBLIN read as an
        //    ogre. This is an actual ogre mesh and does not need the exaggeration to look like one.
        key: 'ogre', display: 'Ogre — Building Inspector', kanji: '鬼',   // "Ogre" first so it is findable in the A-Z list (Mark 2026-09-27: "i need in the monster list (orc, BOSS, OGRE)") [REF#DA-00240]
        archetype: 'Boss - building inspector (authority)', accent: '#c0392b',
        model: MODEL_URLS.monster.ogre,
        modelSlot: 'assets/models/monster/Ogre/',
        hp: '3.0x base', hpRef: 'DungeonChain _genMobSpawns (special-room branch)',
        scale: 1.6, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Fists', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
    },
    {
        // ── THE MANAGER — 支配人 (Mark 2026-08-08) ──────────────────────────────────────────────── [REF#DA-00011]
        //    "supervisor guards the stairway, the MANAGER is a seperate monster - who is in the
        //     managers office ... he has 2x the hitpoints of supervisor."
        //
        //    ⚠ THE SUPERVISOR IS NOT THE MANAGER, AND THE CODE SAID OTHERWISE FOR FIVE DAYS. The
        //      summons card's delivery log claimed "The Supervisor has taken the table"
        //      (Engine9 ~:12254) — an AI seat's misreading of Mark's 08-03 note. The supervisor guards
        //      the STAIRWAY; this one comes out of the 支配人室. Fixed at that call site in the same
        //      commit as this entry.
        //
        //    ⚠ SCALE 2.0 IS DELIBERATE AND IS **NOT** THE OLD GOBLIN-AS-OGRE MISTAKE. Read the ogre
        //      note directly above: 2.0 was rejected THERE because it was inflating a GOBLIN mesh to
        //      read as an ogre. This entry uses the REAL ogre mesh at 1.6 x 1.25 = 2.0, because Mark
        //      asked for "25% larger than ogre". Do not "correct" this to 1.6 citing that comment —
        //      the two 2.0s mean opposite things.
        //
        //    ⚠ HP IS A MULTIPLE, NOT A NUMBER, AND THE OLD DOC HERE WAS WRONG. The supervisor entry
        //      below claims "200 (fixed)" citing MapGen.js:1263; that line is loot code and the claim
        //      is stale. The supervisor is really `monsterHp * 10`, scaling per level
        //      (MapGen.js:1378, and DungeonChain ~:3061 "casino supervisor (10xHP)"). So "2x the
        //      supervisor" is 20x base — expressed as a multiple so it stays true on every floor
        //      instead of freezing a floor-1 number.
        //
        //    Placeholder model on Mark's own instruction: "we can use same OGRE for now, I will build
        //    one out later". Swap `model` when the dedicated mesh lands; nothing else here changes.
        // ⛔ SUPERSEDED 2026-09-27 by Mark: "i need in the monster list (orc, BOSS, OGRE)" — listed as the BOSS, on the ORC model he
        // actually spawns with (Engine9 _spawnManager: nameKey 'orc' + top hat + robe); his animations save under 'manager' and the
        // engine falls back to the orc's until anything is mapped for him (Engine9 _animMapKeyOf).
        key: 'manager', display: 'BOSS — The Manager', kanji: '支配人',
        archetype: 'Boss - cabaret manager (summoned by the legendary song)', accent: '#a855f7',
        model: MODEL_URLS.monster.orc,
        modelSlot: 'assets/models/monster/',
        hp: '20x base (2x supervisor)', hpRef: 'supervisor = monsterHp*10 @ MapGen.js:1378',
        scale: 2.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Fists + charge', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: [1],
        note: 'Comes out of the 支配人室 when the legendary song is played. Charges and flings the '
            + 'player when the song ends or the player attacks. Uses the Ogre GLB until a dedicated '
            + 'manager model exists (Mark 2026-08-08).',
    },
    {
        // ── YAKUZA GOBLIN (NEW) (Mark 2026-09-27: "add a new Yakuza Goblin(New) section in the monster settings page so I can edit it"). [REF#DA-00241]
        //    The goblin the engine spawns now (Engine9 _GOBLIN_GLB). Same body as the old one; 22 clips: the old 9 under their old NlaTrack
        //    names + extra_01…13 (length in the name). Its mappings save under 'gobl_newer'; until anything is mapped, goblins keep the
        //    old 'Yakuza Goblin' page's mappings.
        key: 'yakuza_goblin_new', animKey: 'gobl_newer', display: 'Yakuza Goblin (New)', kanji: '鬼',
        archetype: 'Live monster - melee brawler (newer model, 22 clips)', accent: '#16a34a',
        model: MODEL_URLS.monster.goblinNewer,
        modelSlot: 'assets/models/monster/goblin/',
        hp: '50 x 1.10^(floor-1) - 50 (L1) / 89 (L7)', hpRef: 'DungeonChain.js: hpForLevel()',
        scale: 1.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Katana', weaponCard: 'MELEE - DMGx1DICE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: [1,2,3,4,5,6,7],
        note: 'newer.yakuzagoblin.glb optimized: 6.0 → 1.2 MB (texture 4096→2048, meshopt). Old clips keep their NlaTrack names; the 13 new ones are extra_01…13.',
    },
    {
        // ── THE KNIGHT — AN ADVENTURER (2026-10-01, register entry "THE REALM PORTAL" in Origami.RealityEngine.9.html) ──────── [REF#PENDING] [REF#DA-00249]
        //    knight.glb arrived static and in T-pose; it is rigged on the Tripo skeleton (the goblin's and the Oni's 41 bones),
        //    its sword bound to the right hand, the Oni's clips retargeted onto it, 94k → 14k triangles (scripts/realm-models/). It is the
        //    first of the ADVENTURERS (ADVENTURER_CATALOG below) and a random monster of the Invading Realms (RealmThemes DUNGEON roster).
        key: 'knight', display: 'Knight — Adventurer', kanji: '騎',
        archetype: 'Adventurer - raider (the Invading Realms; the dungeon raids to come)', accent: '#94a3b8',
        model: './assets/models/monster/knight.opt.glb?v=1002-sword',
        modelSlot: 'assets/models/monster/',
        hp: '1.6x realm base', hpRef: 'js/v8/map/RealmDungeon.js FAMILIES.knight',
        scale: 1.0, speed: 'AI walkAction (rigged 2026-10-01, the Oni clips: run, slash, look_around, defeat)',
        weapon: 'Longsword', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: ['realm'],
        note: 'knight.glb (static, T-pose) rigged and packed: 5.4 MB → 1.5 MB. Source kept as assets/models/monster/knight.glb.',
    },
    {
        // ── THE ONI (2026-10-01): the Manager's own body, fielded as a monster in the Invading Realms and as the realm's MASTER. [REF#PENDING] [REF#DA-00250]
        key: 'oni', display: 'Oni', kanji: '鬼',
        archetype: 'Live monster - brute (the Invading Realms; the realm MASTER boss wears it too)', accent: '#3b82f6',
        model: './assets/models/monster/Oni.glb',
        modelSlot: 'assets/models/monster/',
        hp: '2.2x realm base', hpRef: 'js/v8/map/RealmDungeon.js FAMILIES.oni',
        scale: 1.0, speed: 'AI walkAction (GLB-rigged, 20 named clips)',
        weapon: 'Club + kick', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: ['realm'],
        note: 'Oni.glb — the same file the Manager wears (it moved out of monster/Oni/ on 2026-10-01).',
    },
    {
        // ── THE REALM'S BOSSES (2026-10-01): the KING (the dark prince) and the QUEEN (the white-haired lady) — models rigged by [REF#PENDING] [REF#DA-00251]
        //    Tripo; packed and given the Oni's clips (scripts/realm-models/). Painted white or dark by the REALM PORTAL's tone.
        key: 'realm_king', display: 'BOSS — Realm King', kanji: '王',
        archetype: 'Boss - the Invading Realms (KING; white or dark by the portal tone)', accent: '#6d28d9',
        model: './assets/models/monster/dark-prince.opt.glb',
        modelSlot: 'assets/models/monster/',
        hp: '1.5x the player max hp', hpRef: 'Engine9 window._realmShapeLord',
        scale: 1.0, speed: 'AI walkAction (the Oni clips)',
        weapon: 'Fists + slash', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: ['realm'],
        note: 'dark-prince.glb 18 MB, 421k triangles → 1.3 MB, 42k.',
    },
    {
        key: 'realm_queen', display: 'BOSS — Realm Queen', kanji: '女王',   // [REF#PENDING] [REF#DA-00252]
        archetype: 'Boss - the Invading Realms (QUEEN; white or dark by the portal tone)', accent: '#a5f3fc',
        model: './assets/models/monster/citizen-female.opt.glb',
        modelSlot: 'assets/models/monster/',
        hp: '1.5x the player max hp', hpRef: 'Engine9 window._realmShapeLord',
        scale: 1.0, speed: 'AI walkAction (the Oni clips)',
        weapon: 'Fists + slash', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: ['realm'],
        note: 'citizen-female.glb 58.6 MB, 1.47M triangles → 1.5 MB, 44k.',
    },
    {
        // ── THE ORC (Mark 2026-09-27: "i need in the monster list (orc, BOSS, OGRE)"). The bullies: they do not work, they shake the [REF#DA-00242]
        //    workers down and toll the player (Engine9 _tickOrcBullies / the toll job). 22 Tripo clips (orc.glb). Animations save
        //    under 'orc' = the engine's nameKey, so a mapping here drives every orc (and the BOSS until he has his own).
        key: 'orc', display: 'Orc', kanji: '豚',
        archetype: 'Live monster - bully (tolls the player, shakes down workers)', accent: '#65a30d',
        model: MODEL_URLS.monster.orc,
        modelSlot: 'assets/models/monster/',
        hp: '~100 (orc)', hpRef: 'Engine9 _spawnOrcAt',
        scale: 1.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Fists + kick', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        levels: [1,2,3,4,5,6,7],
        note: 'Tripo orc rig, 22 clips (angry_01/02, agree, greet_01, front_kick_02, dance_05 …). Map a JEER clip here for the laugh-at-a-rude-player beat.',
    },
    {
        // ── THE ANT (Mark 2026-09-27: "remember ants are ALWAYS violent and cannot wager" · "we need a monster setting for ALWAYS-VIOLENT"). [REF#DA-00243]
        //    Vermin: forced hostile at spawn, no greeting, no wager, no ally, no bow. Its page carries the ALWAYS-VIOLENT switch (default ON).
        key: 'ant', display: 'Ant', kanji: '蟻',
        archetype: 'Live monster - vermin (always violent, cannot wager)', accent: '#b91c1c',
        model: './assets/models/monster/ant.glb',
        modelSlot: 'assets/models/monster/',
        hp: 'low (swarm)', hpRef: 'Engine9 ant spawns',
        scale: 1.0, speed: 'AI walkAction',
        weapon: 'Bite', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds',
        levels: [1,2,3,4,5,6,7],
        alwaysViolent: true,
        note: 'ALWAYS VIOLENT by default: never greets, bows, wagers or joins you. Ants eat, and bite.',
    },
    {
        // ── THE KOBOLD (2026-09-28): the little runt. A worker, never a fighter: at most one per section, the easiest body [REF#DA-00253]
        //    in the dungeon to destroy (8 HP), carries exactly 50 gold, flees and hides at the first sign of trouble (engine
        //    _tickKobolds / _startKoboldHide). Imp-blue, 75% of an imp's height.
        key: 'kobold', display: 'Kobold', kanji: '小',
        archetype: 'Live monster - runt worker (flees and hides, never fights)', accent: '#7dd3fc',
        model: './assets/models/monster/kobold.glb',
        modelSlot: 'assets/models/monster/',
        hp: '8 (weakest)', hpRef: 'Section0 kobold spawns',
        scale: 0.75, speed: 'AI walkAction; runs to hide',
        weapon: 'None (runs)', weaponCard: 'MELEE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds',
        levels: [1,2,3,4,5,6,7],
        note: '23 clips (look_around, walk, flee_01, frightened, bow, dance_05, dance_03, slash, defeat_03 …). Pick its DANCE here.',
    },
    {
        key: 'yakuza_imp', display: 'Yakuza Imp', kanji: '翼',
        archetype: 'Live monster - ranged skirmisher', accent: '#06b6d4',
        model: MODEL_URLS.monster.imp,
        modelSlot: 'assets/models/monster/imp/',
        hp: '0.6x base (std) - 0.5x base (flintlock)', hpRef: 'MapGen.js:1294,1340',
        scale: 1.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Shuriken / .45 Flintlock', weaponCard: 'RANGED - DMGx2DICE',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [
            { FIRE:1.4, WATER:1.0, EARTH:1.0, WIND:1.1, VOID:1.0, DEFAULT:1.0 },
            { FIRE:1.3, WATER:1.1, EARTH:1.0, WIND:1.2, VOID:1.0, DEFAULT:1.0 },
        ],
        levels: [1,2,3,4,5,6,7],
        note: 'Live imp rig. SETUP can preview and override the model path; hitbox and missile landing boxes are recalculated from GLB bounds.',
    },
    {
        key: 'hungry_ghost', display: 'Hungry Ghost', kanji: '霊',
        archetype: 'Live monster - melee-only spirit', accent: '#7dd3fc',
        model: MODEL_URLS.monster.hungryGhost,
        modelSlot: 'assets/models/monster/ghosts/',
        // ⚠ MEASURED 2026-07-19 (Mark "fix each monster on the guidebook monsters page 1 at a time"): the two HP [REF#DA-00012]
        // numbers here are BOTH real but belong to different ghosts — the CABARET pair is 15 x floor
        // (Engine9 cab-hungry-ghost push) while the PROCEDURAL pack is a flat 10 at every depth
        // (DungeonChain _genMobSpawns: `a.isGhost ? 10 : hp`). The old single figure hid that split.
        hp: '10 flat (procedural pack) / 15 x floor (cabaret pair)', hpRef: 'DungeonChain.js:_genMobSpawns + Engine9 cab-hungry-ghost',
        // ⚠ THIS RIG HAS **ZERO** ANIMATION CLIPS. Verified by reading hungry-ghost.glb directly: 21 meshes, [REF#DA-00013]
        // 0 animations. So every slot in the guidebook animation editor is a NO-OP for this monster — mapping a
        // walk/hit/death clip here cannot do anything, because there is no clip to map TO. It moves by transform
        // only. Do not "fix" a broken-looking ghost animation in code; the asset needs clips first.
        noAnimClips: true,
        scale: 1.55, speed: 'NO GLB CLIPS (0 animations) - transform-driven only',
        weapon: 'Spectral claws', weaponCard: 'MELEE - contact attacker',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [ { FIRE:1.2, WATER:0.8, EARTH:1.0, WIND:1.25, VOID:0.5, DEFAULT:1.0 } ],
        levels: [1,2,3,4,5,6,7],
        note: 'Real hungry-ghost GLB monster. Melee only, no flee/fetch. Cabaret test spawn enters from the curtains, fades in at 50% opacity, then jumps down and chases.',
    },
    {
        key: 'yakuza_mummy', display: 'Yakuza Mummy', kanji: '包',
        archetype: 'Live monster - cabaret special-case melee', accent: '#d6c7a1',
        model: MODEL_URLS.monster.mummy,
        modelSlot: 'assets/models/monster/mummy/',
        hp: '25 (cabaret hand-authored) / hpForLevel curve when procedurally spawned', hpRef: 'Engine9.html:cab-mummy + DungeonChain hpForLevel()',
        scale: 1.07, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Wrapped fists', weaponCard: 'MELEE - contact attacker',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [ { FIRE:1.3, WATER:1.0, EARTH:1.0, WIND:1.0, VOID:1.0, DEFAULT:1.0 } ],
        levels: [1],
        note: 'Currently spawned as cabaret special-case through Engine8. Next step is promoting it into DungeonChain room-generation alongside ghosts.',
    },
    {
        key: 'skeleton_guard', display: 'Skeleton Guard', kanji: '骨',
        archetype: 'Live monster - melee bone-soldier', accent: '#e5e7eb',
        model: 'assets/models/monster/Skeleton/Skeleton-guard.glb',
        modelSlot: 'assets/models/monster/Skeleton/',
        hp: 'hpForLevel curve (level-scaled, like the goblin)', hpRef: 'DungeonChain.js: _genMobSpawns (skeleton_guard archetype)',
        scale: 1.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Bone blade', weaponCard: 'MELEE - contact attacker',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [ { FIRE:0.8, WATER:1.0, EARTH:1.35, WIND:1.0, VOID:1.15, DEFAULT:1.0 } ],
        levels: [1,2,3,4,5,6,7],
        note: 'Room-encounter melee skeleton. RANDOM on floors 2+ (minLevel 2), PLUS one GUARANTEED hand-placed pair with the archer in section 2 of FLOOR 1 (Mark 2026-07-26 "lets see 1 show up in section 2 floor of level 1 along with the skeleton guard") — DungeonChain.js SKELETON DEBUT block, knobs window._skelDebutSegment / _skelDebutLevel / _skelDebut=false. Clips are NlaTrack.* resolved by the engine DURATION HEURISTIC (Mark "use heuristic") — if a clip maps wrong, override in-game with window._skGuardClipOrder=[names by index].',
    },
    {
        key: 'skeleton_archer', display: 'Skeleton Archer', kanji: '弓',
        archetype: 'Live monster - ranged missile skeleton', accent: '#cbd5e1',
        model: 'assets/models/monster/Skeleton/Skeleton-archer.glb',
        modelSlot: 'assets/models/monster/Skeleton/',
        hp: '30 flat', hpRef: 'DungeonChain.js: _genMobSpawns (skeleton_archer hpFlat)',
        scale: 1.0, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Bow + arrows', weaponCard: 'RANGED - arrow, DMG ~2-11',
        hitbox: 'auto: model bounds x scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [ { FIRE:0.8, WATER:1.0, EARTH:1.3, WIND:1.1, VOID:1.15, DEFAULT:1.0 } ],
        levels: [1,3,4,5,6,7],
        note: 'Room-encounter RANGED skeleton. RANDOM on floors 3+ (minLevel 3), PLUS one GUARANTEED hand-placed debut with the guard in section 2 of FLOOR 1 (Mark 2026-07-26). Fires arrows via _spawnSkeletonArrow on the imp ranged-kiter path; quiver window._archerArrowsAmmo (default 8). ⚠ 2026-07-26 FIX: the ranged path was DEAD until now — ud.isSkeletonArcher was read by the AI (Engine9 ~32882/~33041) but never written into monster userData, so every archer carried 8 arrows it could not draw and fell through to melee. Clips via duration heuristic; override with window._skArcherClipOrder.',
    },
    {
        key: 'yakuza_supervisor', animKey: 'gobl_normal', display: 'Level 1 Boss Supervisor', kanji: '監',   // shares the goblin RIG, so it shares the goblin clip map — editing either edits both (that is correct, not a bug) [REF#DA-00014]
        archetype: 'Live L1 boss - supervisor guard', accent: '#f97316',
        model: MODEL_URLS.monster.goblin,
        modelSlot: 'assets/models/monster/goblin/',
        // ⚠ CORRECTED 2026-08-08. This read "200 (fixed), hpRef MapGen.js:1263" — both wrong. Line 1263 [REF#DA-00015]
        //   is loot code, and the supervisor is not a fixed number: MapGen.js:1378 spawns it at
        //   `monsterHp * 10`, scaling per level (DungeonChain ~:3061 says the same, "10xHP"). The stale
        //   claim actively misled a derivation of "2x the supervisor" for the Manager entry above.
        hp: '10x base (per level)', hpRef: 'MapGen.js:1378 (monsterHp * 10)',
        scale: 1.3, speed: 'AI walkAction (GLB-rigged)',
        weapon: 'Enhanced Katana', weaponCard: 'MELEE - DMGx1DICE',
        hitbox: 'auto: model bounds x 1.3 scale',
        missileBox: 'auto: model bounds, upper-body biased',
        vulnVariants: [ { FIRE:1.1, WATER:1.0, EARTH:0.9, WIND:1.0, VOID:1.0, DEFAULT:0.95 } ],
        levels: [1],
        note: 'Live Level 1 supervisor. Uses the Yakuza Goblin GLB until a dedicated supervisor model is selected in SETUP.',
    },
    // ⛔ SUCCUBUS / DANCER — ENTRY DELETED 2026-08-11 (Mark verbatim: "you have now failed 15x to fix [REF#DA-00016]
    //    succubus bad girl animation and tilt. just delete the entire model since its all fucked up.
    //    delete it."). The guidebook page went with the monster on purpose: a bestiary page for a
    //    creature that cannot spawn, backed by a GLB that is no longer on disk, is the exact "ghost UI"
    //    trap this codebase keeps rediscovering. PlayerGuide's succubus branch (`mon.key === 'succubus'`,
    //    ~:2538 → _renderSuccubiTune / _renderSucStageDances) is now unreachable and left in place —
    //    it is the tuning UI a rebuild would want back, and dead code here is cheaper than re-deriving it.
    //    ⚠ STARLETTE (Starlette.glb, isPerformer) and STARIKO (stariko.glb) ARE DIFFERENT CHARACTERS and
    //      are untouched — the cabaret show, song and choreography all still run. The shared "_succubus*"
    //      prefix is a naming collision, not shared ownership.
];

// ── THE ADVENTURERS (2026-10-01) — raiders who come to plunder the dungeon (knowledge/design/MASTER_DUNGEON_PLAN.md §9, the raids [REF#PENDING] [REF#DA-00254]
//    still to be built). One row per adventurer the game can field, pointing at its MONSTER_CATALOG entry; the knight is the first.
export const ADVENTURER_CATALOG = [
    { key: 'knight', display: 'Knight', kanji: '騎', role: 'raider', monsterKey: 'knight', model: './assets/models/monster/knight.opt.glb?v=1002-sword', fieldedIn: ['realm'] },
];

export const MONSTER_ACTIONS = [
    { key: 'fight', label: 'Fight Animation', ud: 'attackAction', regex: '/fight|slash|attack|strike|swing|punch|stab/', aliases: ['attack'] },
    { key: 'walk',  label: 'Walk Animation',  ud: 'walkAction',   regex: '/walk|run|move|trot|jog/' },
    { key: 'flee',  label: 'Flee Animation',  ud: 'fleeAction',   regex: '/flee|run|escape|retreat/' },
    { key: 'idle',  label: 'Idle Animation',  ud: 'idleAction',   regex: '/idle|stand|wait|breath/' },
    // HIT + DEATH (Mark 2026-07-19: "add a setting for animation for when a monster gets hit, walk, attack [REF#DA-00017]
    // animation"). walk/attack already existed as 'walk'/'fight'; the reaction clips did not, so a monster's
    // flinch and death could not be retargeted from the guidebook at all. `ud` matches the engine's own
    // userData keys (hitAction / deathAction) so the runtime applier can map slot -> action with no lookup table.
    { key: 'hit',   label: 'Hit / Flinch Animation', ud: 'hitAction',   regex: '/hit|flinch|impact|hurt|damage|react/' },
    // HIT TO HEAD (Mark 2026-09-15: "hit to head is if RANGED spell. it ensures there is a cool arrow in their head - and we have [REF#DA-00238]
    // some monsters with that HIT TO HEAD animation, so can add that into combat FX"): the clip a RANGED CRIT plays — the arrow
    // is already in the forehead; this is the head snapping with it. Map it per monster here; a rig with nothing mapped still
    // gets the engine's procedural head snap (Engine9 _omgHeadHitFx). Falls back to the 'hit' slot when only that is mapped.
    { key: 'headhit', label: 'Hit To Head (ranged crit)', ud: 'headHitAction', regex: '/head.?hit|hit.?head|headshot|head.?react/' },
    { key: 'death', label: 'Death Animation',        ud: 'deathAction', regex: '/death|die|dead|knock|fall|collapse/' },
    { key: 'other', label: 'Other Random Cycle', ud: 'otherCycle', regex: '/agree|bow|laugh|argue|taunt|emote/', multi: true },
];

// The engine's canonical SOUND-map key. A SEPARATE NAMESPACE from animKeyFor() — they genuinely [REF#DA-00018]
// disagree, so do not collapse them: the goblin is 'gobl_normal' for animation but 'yakuza_goblin'
// for sound; the succubus is 'succubus' for animation but 'succubi' for sound. Mirrors
// `_monsterSoundMapKeyOf` (Engine9 ~19357). Used for 'wg_monster_sound_map' + PLAY_MONSTER_SOUND.
export function soundKeyFor(monOrKey) {
    if (!monOrKey) return '';
    if (typeof monOrKey === 'string') {
        const hit = MONSTER_CATALOG.find(m => m.key === monOrKey);
        return (hit && hit.soundKey) || monOrKey;
    }
    return monOrKey.soundKey || monOrKey.key || '';
}

// Shared Settings inventory for the per-monster sound editor. `tag` is the [REF#DA-00019]
// engine's semantic SFX key; `file` is displayed to the designer so this is a
// real inventory of assets/sounds/Monsters rather than a mystery preset list.
// Keep this list in lockstep with `_MON_SFX` in NewOrigami.Engine9.html.
// ⚠ SYNC-AUDITED 2026-07-19 against _MON_SFX (Engine9 ~19324): this list held 13 of the engine's 15
// tags — MUMMY_HIT and MIMIC_HIT were missing, so two real hurt-sounds could not be picked in the
// codex at all. Added below. `path` is now carried too, so the UI can audition a file directly
// through window._panelsPlaySfx (PlayerGuide runs in the panels frame) with no engine round-trip.
const _MSND = 'assets/sounds/Monsters/';
export const MONSTER_SOUND_CATALOG = [
    { tag: 'FOUND',        label: 'Goblin · Found You',       file: 'goblin-found.mp3',              slot: 'alert' },
    { tag: 'ATTACK',       label: 'Goblin · Attack',          file: 'goblin-attack.mp3',             slot: 'attack' },
    { tag: 'ATTACK_QUICK', label: 'Goblin · Quick Attack',    file: 'Goblin-attack-quick.mp3',       slot: 'attack' },
    { tag: 'IMP_ATTACK',   label: 'Imp · Attack',             file: 'imp-attack.mp3',                slot: 'attack' },
    { tag: 'LAUGH',        label: 'Goblin · Laugh',           file: 'goblin-laugh.mp3',              slot: 'social' },
    { tag: 'CACKLE',       label: 'Goblin · Cackle/Reverb',   file: 'Goblin-cackle-with-reverb.mp3', slot: 'social' },
    { tag: 'DEATH',        label: 'Goblin · Death',           file: 'goblin-death.mp3',              slot: 'death' },
    { tag: 'MUMMY_ATTACK', label: 'Mummy · Growl (combat)',   file: 'mummy-growl.mp3',               slot: 'attack' },
    { tag: 'MUMMY_HIT',    label: 'Mummy · Growl (when hurt)',file: 'mummy-growl.mp3',               slot: 'hit' },
    { tag: 'MIMIC_HIT',    label: 'Mimic · Growl (when hurt)',file: 'mummy-growl.mp3',               slot: 'hit' },
    { tag: 'MUMMY_ALERT',  label: 'Mummy · Growl (rare)',     file: 'mummy-growl.mp3',               slot: 'alert' },
    { tag: 'SLASH',        label: 'Monster · Slash',          file: 'attack-slash.mp3',              slot: 'attack' },
    { tag: 'HIT',          label: 'Imp · Baka/Stupid',        file: 'baka-stupid.mp3',               slot: 'hit' },
    { tag: 'BANZAI',       label: 'Monster · Banzai',         file: 'banzai.mp3',                    slot: 'social' },
    { tag: 'HOW_RUDE',     label: 'Succubus · How Rude',      file: 'succubus.how-rude.mp3',         slot: 'social' },
].map(s => ({ ...s, path: _MSND + s.file }));

// Monster sounds that exist on disk but are NOT in _MON_SFX — playable in the codex so they are [REF#DA-00020]
// auditionable, and visible so they stop being invisible. Zombie-growl is WIRED but bypasses the tag
// bus (direct _playSfxFile at Engine9 ~40318); hungry-ghost-boo is on disk and referenced NOWHERE.
export const MONSTER_SOUND_ORPHANS = [
    { file: 'Zombie-growl.mp3',    path: _MSND + 'Zombie-growl.mp3',    note: 'WIRED, but direct — zombie pack spawn (Engine9 ~40318). Not a _MON_SFX tag, so it cannot be re-mapped here.' },
    { file: 'hungry-ghost-boo.mp3', path: _MSND + 'hungry-ghost-boo.mp3', note: 'ON DISK, NEVER PLAYED. No call site anywhere. Likely the missing slot-machine ghost-wave cue.' },
];

// GAMBLING RESULT SOUNDS — read-only reference (Mark 2026-07-19: "a tab for sound fx - which ones [REF#DA-00021]
// they use for gambling results too"). These are NOT re-mappable yet: unlike monster sounds there is
// no tag bus for them — every one is an inline string literal at its call site, so there is nothing
// to key an override off. Listed with file:line so the wiring is findable, and auditionable via ▶.
// Making them editable means introducing an SFX tag table the way _MON_SFX did for monsters.
const _DSND = 'assets/sounds/Dungeon/';
export const GAMBLING_SFX_CATALOG = [
    { game: 'Poker',     event: 'Card dealt (every 4th in the fan)', file: 'pop.mp3',          vol: 0.22, path: _DSND + 'pop.mp3',   ref: 'Engine9:23189' },
    { game: 'Poker',     event: 'Mark / swap a card',                file: 'click.mp3',        vol: 0.50, path: _DSND + 'click.mp3', ref: 'Engine9:23218' },
    { game: 'Poker',     event: 'Swap rejected (max 3)',             file: 'pop.mp3',          vol: 0.40, path: _DSND + 'pop.mp3',   ref: 'Engine9:23205' },
    { game: 'Poker',     event: '★ YOU WIN / SPLIT POT',             file: 'coins.mp3',        vol: 0.85, path: _DSND + 'coins.mp3', ref: 'Engine9:23319' },
    { game: 'Poker',     event: 'Monster wins the pot (cheer)',      file: 'goblin-laugh / mummy-growl / cackle', vol: 0.70, path: _MSND + 'goblin-laugh.mp3', ref: 'Engine9:22666 _pkMonCheer' },
    { game: 'Poker',     event: 'Not enough gold for the ante',      file: 'pop.mp3',          vol: 0.50, path: _DSND + 'pop.mp3',   ref: 'Engine9:23422' },
    { game: 'Blackjack', event: 'Player HIT / card drawn',           file: 'pop.mp3',          vol: 0.30, path: _DSND + 'pop.mp3',   ref: 'Engine9:23490' },
    { game: 'Blackjack', event: 'Dealer draws',                      file: 'pop.mp3',          vol: 0.24, path: _DSND + 'pop.mp3',   ref: 'Engine9:23510' },
    { game: 'Blackjack', event: '★ YOU WIN / BLACKJACK!',            file: 'coins.mp3',        vol: 0.85, path: _DSND + 'coins.mp3', ref: 'Engine9:23573' },
    { game: 'Blackjack', event: 'Won an ally (gambler busted)',      file: 'coins.mp3',        vol: 0.70, path: _DSND + 'coins.mp3', ref: 'Engine9:23577' },
    { game: 'Blackjack', event: 'PUSH',                              file: '— SILENT —',       vol: 0,    path: null,                ref: 'Engine9:23575' },
    { game: 'Blackjack', event: 'HOUSE WINS',                        file: '— SILENT —',       vol: 0,    path: null,                ref: 'Engine9:23579' },
    { game: 'Table',     event: '★ Cleaned out the whole table',     file: 'coins.mp3',        vol: 0.90, path: _DSND + 'coins.mp3', ref: 'Engine9:22752' },
    { game: 'Table',     event: 'Crew bows (700ms after)',           file: 'goblin-laugh.mp3', vol: 0.60, path: _MSND + 'goblin-laugh.mp3', ref: 'Engine9:22762' },
    { game: 'Slots',     event: 'Spin / reel / jackpot',             file: '— NONE EXISTS —',  vol: 0,    path: null,                ref: 'window._slotMachine is a silent prop (Engine9:12514)' },
    { game: 'Slots',     event: 'Ghost wave pours out',              file: '— SILENT (text log only) —', vol: 0, path: null,        ref: 'Engine9:40360 _startGhostWaves / log at 40376' },
    { game: 'Vending',   event: 'Purchase / dispense',               file: 'coins.mp3',        vol: 0.80, path: _DSND + 'coins.mp3', ref: 'VendingMachine.js:1265' },
    { game: 'Vending',   event: 'Denied / not enough gold',          file: 'pop.mp3',          vol: 0.65, path: _DSND + 'pop.mp3',   ref: 'VendingMachine.js:1260' },
];

export const MONSTER_SOUND_SLOTS = [
    { key: 'alert',  label: 'SPOTS PLAYER' },
    { key: 'attack', label: 'ATTACK' },
    { key: 'hit',    label: 'WHEN HURT' },
    { key: 'death',  label: 'DEATH' },
    { key: 'social', label: 'SOCIAL / TAUNT' },
];

export const MONSTER_AI_POLICIES = [
    {
        key: 'fight_then_flee_50',
        label: 'Fight then flee below 50% HP',
        note: 'Usual behavior: engage first, then break contact and get help when hurt.',
    },
    {
        key: 'flee_on_attack',
        label: 'Flee when player attacks',
        note: 'Coward behavior: never trade blows after player aggression.',
    },
    {
        key: 'fight',
        label: 'Fight',
        note: 'Hold ground and keep attacking until defeated or externally redirected.',
    },
];

export const AVATAR_CATALOG = [
    {
        id: 'player_a', display: 'Player A - Outlaw / Samurai', kanji: '侍',
        accent: '#ef4444',
        model: MODEL_URLS.player.playerA,
        animModel: MODEL_URLS.player.playerAWalking,
        texture: MODEL_URLS.player.playerATexture,
        scale: 0.55, isLiveRig: true,
        rolesSupported: ['pistoleer','gangster','samurai','archer'],
        codedDesigns: ['Gangster outlaw (.45 ACP)', 'Bushido samurai (katana + bow)', 'Hunter archer (long bow)'],
        note: 'THE live player rig - playerModelUrls[0] (Engine9.html:6374). ' +
              'Meshopt-compressed; loaded at scale 0.55, rotated 180 degrees.',
    },
    {
        id: 'player_b', display: 'Player B - Shinobi / Mage', kanji: '忍',
        accent: '#06b6d4',
        model: MODEL_URLS.player.playerB,
        animModel: MODEL_URLS.player.playerAWalking,
        texture: MODEL_URLS.player.playerBTexture,
        scale: 0.55, isLiveRig: false,
        rolesSupported: ['wizard','priest','ninja'],
        codedDesigns: ['Arcane wizard (staff + spells)', 'Divine priest (mace + heals)', 'Shadow ninja (sword + shuriken)'],
        note: 'Alternate rig on disk (Player.B.glb). Not yet wired into ' +
              'playerModelUrls - shares the Player.A walk animation.',
    },
];

export const AVATAR_ACTIONS = [
    { key: 'idle',   label: 'Idle',   regex: '/idle|stand|rest/' },
    { key: 'walk',   label: 'Walk',   regex: '/walk|run|move|locomotion/' },
    { key: 'attack', label: 'Attack', regex: '/attack|slash|strike|swing|punch|stab/' },
];

// The engine's canonical animation-map key for a catalog entry (or a raw key string). [REF#DA-00022]
// USE THIS for: MonsterAnimManifest.json lookups, 'wg_monster_anim_map' reads/writes, and any
// MONSTER_ANIM_* / PLAY_MONSTER_ANIM postMessage. See the B5 note above MONSTER_CATALOG.
export function animKeyFor(monOrKey) {
    if (!monOrKey) return '';
    if (typeof monOrKey === 'string') {
        const hit = MONSTER_CATALOG.find(m => m.key === monOrKey);
        return (hit && hit.animKey) || monOrKey;
    }
    return monOrKey.animKey || monOrKey.key || '';
}

// The GLB THE ENGINE ACTUALLY SPAWNS for this monster — which is NOT always MODEL_URLS.monster.*. [REF#DA-00023]
// The codex previews `new-goblin-animate.glb` / `imp-animated-new.glb` while the engine loads
// `new.goblin.glb` / `new.imp.glb` (gltfLoader.load calls in Engine9 ~10334/10343/10374/10449).
// A preview canvas that shows the wrong rig lists clips that DO NOT EXIST on the live monster, so
// the codex's animation editor must frame this one. Kept beside the catalog so the drift is visible.
export const ENGINE_MODEL_BY_ANIM_KEY = {
    gobl_normal:  './assets/models/monster/goblin/newer.yakuzagoblin.opt.glb',   // the preview follows the live rig: the newer Yakuza goblin (2026-09-29) [REF#DA-00255]
    yakuza_imp:   './assets/models/monster/imp/new.imp.glb',
    yakuza_mummy: './assets/models/monster/mummy/new-yakuza-mummy.glb',
    // succubus: Dancer DELETED 2026-08-11 (Mark) — her rig is off disk; engineModelFor() now returns [REF#DA-00024]
    // null for her, which the caller already handles as "no preview available".
    hungry_ghost: './assets/models/monster/ghosts/hungry-ghost.glb',
    ogre:         './assets/models/monster/Ogre/ogre.glb',
    gobl_newer:   './assets/models/monster/goblin/newer.yakuzagoblin.opt.glb',
    ant:          './assets/models/monster/ant.glb',
    kobold:       './assets/models/monster/kobold.glb',
    // EVERY MONSTER FOLLOWS THE GUIDEBOOK ANIMATION SETTINGS (2026-09-28, SEAT_PIPELINE §4): the orc, the Manager (the orc rig), both [REF#DA-00256]
    // skeletons had no engine model here and no manifest entry, so their ANIMATIONS tab had nothing to list and nothing they set could reach
    // the engine. Same rigs the engine spawns (Section0 / Engine9 gltfLoader calls). [REF#DA-00023]
    orc:             './assets/models/monster/orc.glb',
    manager:         './assets/models/monster/orc.glb',
    skeleton_guard:  './assets/models/monster/Skeleton/Skeleton-guard.glb',
    skeleton_archer: './assets/models/monster/Skeleton/Skeleton-archer.glb',
    knight:          './assets/models/monster/knight.opt.glb?v=1002-sword',   // the Invading Realms' bodies (2026-10-01) [REF#DA-00257]
    oni:             './assets/models/monster/Oni.glb',
    realm_king:      './assets/models/monster/dark-prince.opt.glb',
    realm_queen:     './assets/models/monster/citizen-female.opt.glb',
};
export function engineModelFor(monOrKey) {
    return ENGINE_MODEL_BY_ANIM_KEY[animKeyFor(monOrKey)] || null;
}

export function getMonsterCatalogEntry(nameKey, flags = {}) {
    if (flags.isSupervisor) return MONSTER_CATALOG.find(m => m.key === 'yakuza_supervisor') || null;
    return MONSTER_CATALOG.find(m => m.key === nameKey) || null;
}

export function getMonsterModelUrl(spawn) {
    if (spawn?.isGhost || spawn?.nameKey === 'hungry_ghost') return MODEL_URLS.monster.hungryGhost;
    if (spawn?.isMummy || spawn?.nameKey === 'yakuza_mummy') return MODEL_URLS.monster.mummy;
    return spawn?.isImp ? MODEL_URLS.monster.imp : MODEL_URLS.monster.goblin;
}

export function getAvatarForRole(roleId) {
    return AVATAR_CATALOG.find(a => a.rolesSupported.includes(roleId)) || AVATAR_CATALOG[0];
}

export function getLivePlayerModelUrls() {
    return [
        MODEL_URLS.player.playerAWalking,
        '../assets/models/player/Player.A.Walking.glb',
        './assets/models/Player.A.Walking.glb',
        '../assets/models/Player.A.Walking.glb',
        'https://www.markpeterson.info/Origami/assets/Player.A.Walking.glb',
    ];
}
