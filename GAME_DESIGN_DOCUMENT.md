# ORIGAMI UNDERWORLD — Game Design Document

*Written 2026-10-17 by CODER 1 (research seat) from the code, the design docs and the session records. Status words:*
**BUILT** = in the game and seen working · **BUILT, UNSEEN** = in the code, not yet watched in play · **NOT BUILT** = designed only.

---

## 1. The game in one page

| | |
|---|---|
| **Genre** | Roguelike **deck builder**. Cards are the core: weapons, spells, skills, songs and permits are all cards in the player's hand. Combat is **hybrid turn-based / real-time**. |
| **Setting** | A Japanese yōkai underworld built from folded paper. Workers (goblins, imps, mummies, kobolds) run the dungeon. Guards (the honourable samurai ghosts) protect them. The cabaret's star, Starlette, wants out. |
| **View** | First-person 3D (WebGL / three.js) with a live top-down map and a picture-in-picture camera. |
| **Platform** | The **web edition is the release**, offline-capable through a service worker. Not on Steam. |
| **Access** | The UI is HTML built to WCAG 2.2 (keyboard, screen-reader log, 44 px targets, high contrast), so disabled kids can play. |
| **Director** | **Oni-Baba** (`js/v8/OniBaba8.js`): one conscious orchestrator that reads sensors (tension, cruelty, silence, render stress, …) and runs the workforce, the guides and the anomaly reports. |
| **The heart of it** | Made in memory of the author's parents (THE_STORY.md). The three memorial ghosts in the konbini are never armed or moved. |

### The core loop
1. **Explore** a section: hallways, rooms, sleeping and working monsters.
2. **Meet, fight or befriend**:
   - Karma rises and falls with what you do. Killing a guard costs **−5 karma**.
   - Monsters can be wagered, gambled with, or turned into allies.
3. **Collect cards** (loot, songs, permits) and build the hand.
4. **Activate special rooms** with permits. Each room is kept shut by its ogre contractor, and waking one changes the music, the workers and the economy.
5. **Beat the floor's Manager** at blackjack, or in a fight, to open the way down.
6. **The ending:** beat every floor's Manager and escort Starlette to floor 7's **Casino Royale**. There she meets Oni-Baba and sings. Your karma decides the stage.

---

## 2. What is COMPLETED

### Engine and presentation
- **BUILT:** 3D engine (`Origami.RealityEngine.9.html`), shell (`OrigamiUnderworld.html`), HTML UI panels (`Origami.RealityEngine.Panels.html`).
- **BUILT:** The Welcome Guide doubles as the storybook and settings: roles, monster pages, music page, rooms, save/restore.
- **BUILT:** First-person view plus top-down map plus PiP. The PiP is cut to the current room or hallway, using the direct blit.
- **BUILT:** Seven-floor dungeon generator with floor catalog, rooms, hallways and sections.
- **BUILT:** Door registry: every door has an id, room, type, status and health. The cabaret has 2 doors per floor.
- **BUILT:** FPS work: draw packing, interior cull, uber cull in fights, and Oni-Baba's shadow step below 50 fps.
  - **Banned:** the post-FX composer and frame-rate throttles.
- **BUILT:** Save rebuild: save parts registry plus Oni-Baba save health. New game means a new dungeon.

### Player and cards
- **BUILT:** Roles: Samurai, Ninja, Gangster, Archer, Wizard, Priest. Each has its own skills, shown as green skill cards.
- **BUILT:** Hand rules: new loot joins its band, ◀ ▶ lift, Enter puts, selects and fires. RELOAD is a skill pile, sorted most-used first.
- **BUILT:** Melee charge and swing, missiles with earshot rings (pistol 6, missile 3, slash 2 tiles), spells.
- **BUILT:** Origami cut: limbs and heads fold off rigged monsters and grow back after 20 s.
- **BUILT:** Death scene, then GAME OVER, then the RESTORE / NEW GAME modal.
- **BUILT, UNSEEN:** Achievements: 8 of them, with purple "!" quest marks.

### The world's people
- **BUILT:** **Workers** (goblin, imp, mummy, kobold) go to work, rest and sleep, run by Oni-Baba's workforce. In combat they run to the nearest room and peek out.
- **BUILT:** **Guards** (skeleton guard / archer) are neutral and polite, bow within 5 tiles, protect workers, and die protecting them.
- **BUILT:** **Ogres** are one contractor per special room, guarding it shut.
- **BUILT:** **Oni guards** wear ONI.1.glb in special rooms.
- **BUILT:** Orcs (toll keepers, heavy loot), ants (always violent, never wagered), hungry ghosts (violent, queue in peace), spiders and bats (creatures, not spirits).
- **BUILT:** **Starlette** (succubus) sings in the cabaret with song return and the cabaret bed. **The Manager** makes his entrance (BOSS.mp3) and plays the blackjack showdown.
- **BUILT:** **Nemesis**, the white samurai knight:
  - 12 melee moves and the move deck.
  - Permanent cuts.
  - Katana drop and re-grab.
  - Helmet loot card, voice lines, self-destruct.
  - +25% strength per return.
- **BUILT, UNSEEN:** Since 2026-10-17 Nemesis guards the bath house and does not exist until the GUARD POST is activated (`ce1792c9`).
- **BUILT, UNSEEN:** **Jester**, the portal guide: entrance, near talk, cabaret tour. Owned by Astra. The startup sequence is broken; the fix plan is in the 10-17 hand-off.

### Rooms and economy
- **BUILT:** Special rooms by permit: CABARET, KITCHEN, STORE, FACTORY, LABORATORY, GUARD_POST, STORAGE, TAVERN, ARMORY, ARCHERY, PRISON.
  - Activation stops all cabaret singing and plays that room's song.
  - The room is rebuilt with the green matrix overlay.
- **BUILT:** Permits are jade green. Gold means legendary or gambling.
- **BUILT:** Songs v2: Starlette's 3 starting songs, and every other song is a card. Legendary songs ride on room guards.
- **BUILT:** Gambling: blackjack showdown, poker, the toll box, vending from the top-down map.
- **BUILT:** Bath house: workers revive there, and since 10-17 the pool heals any body undamaged for 5 s by 10% max HP per second.
- **BUILT:** Invading Realms: the secret torii room off hallway 0 leads to an endless NetHack-style realm with a Lord ★ and a portal home.
- **BUILT:** Casino Royale on floor 7: model, loader, stage and collision. She does not sing on it yet.

---

## 3. What we STILL NEED TO FINISH

### 3.1 Sealed section doors
Design: `sectiondoors.md`.
- **NOT BUILT:** the seal itself. There is no `SECTION DOOR UNLOCKED` anywhere in the engine. To do:
  1. Seal disc at the centre seam (y 2.70, scale 0.1875) with a white ethereal rim.
  2. Floating label: `SEALED DOORS` / `SECTION (#) · SPECIAL ROOM (#) · CLOSED`.
  3. The 3×3 tile puzzle on the seal: 3 X, 4 O, 2 empty slots, moves only into an orthogonally adjacent empty slot. Three X in a line unlock it.
  4. On a win: the three X tiles bloom, the seal is removed, the leaves swing open, `SECTION DOOR UNLOCKED` appears and the lock sound plays once.
  5. The unlock is saved per `doorId`, and the door stays open on return.
- **Acceptance:** solve one door, leave the section, come back, and the passage is still open.

### 3.2 Culled sections
| Part | Status |
|---|---|
| Sealed-section cull (`_tickSealedCull`, `_sealedSecMask`): a sealed section's walls, props and bodies are off; walking workers still show | **BUILT, UNSEEN.** Until the seals exist, "sealed" reads as "door closed". |
| Room billboards (`_roomBillboard*`): rooms you have left are replaced by a snapshot | **BUILT, UNSEEN.** |
| Super-section cull (`_tickSuperSectionCull`): every model in sections the player isn't in is hidden and replaced by FPV plus top-down billboards. Monsters render only if in range and in line of sight. FPV keeps the room plus one doorway live. No billboards in the PiP. | **BUILT, measured.** Draws 889 → 767, fps 49 → 54. On by default; off: `_superSectionCull=false`. |
| Hook the seals into the cull: a solved seal clears its section's bit | **NOT BUILT.** Needs 3.1. |
| Bodies queued for other segments must build when their section opens (Nemesis's bath return failed this way, see 3.4) | **NOT VERIFIED** |

### 3.3 Known open bugs
- **Jester startup:** Oni-Baba's `greet` order beats `entrance`, so he talks, and the camera turns, before he comes out. Fix plan handed off.
- **Nemesis:**
  - He does not return at his bath post after death. Diagnosis and fix plan handed off.
  - Limb grab-back and the bow/spell weapon card are not built.
- **Floor 7:** the grand hallway from hallway 0 is unbuilt, and Starlette's casino stage is unused.
- **Motion system:** walls are still entered, foot-slide continues, and ants have no clips. The phases are in `plans/MONSTER_MOTION_SYSTEM_2026-10-17.md`. Only the Jester pilot is in.

### 3.4 Release blockers
1. Sealed doors (3.1) plus their cull hook (3.2).
2. At least the two quests below, playable start to finish.
3. The Jester startup fix, and Nemesis's return.
4. A full play-through of floor 1 with no anomaly flood: Oni-Baba's report stays clean, and fps holds ≥ 50 at 1080p.

---

## 4. Quests to play (first two)

### Quest 1 — "The Portal Guide" (tutorial, floor 1, ~10 min)
| Step | What happens | Built? |
|---|---|---|
| 1 | Close the guidebook. The Jester flips out of the portal room, bows, waves and tells you about the realms. | BUILT, startup broken (3.3) |
| 2 | Follow the purple "!" to the torii in hallway 0. Opening the portal menu earns **Discover the Portal**. | BUILT, UNSEEN |
| 3 | At the cabaret the Jester says it is closed: "Come play with us." | BUILT, UNSEEN |
| 4 | Find a permit card, then activate your first special room. You earn **Activate a Special Room**, and the room's song plays. | BUILT |
| 5 | Ally with one worker (wager or gift). You earn **Ally with a Worker**. | BUILT |
| **Reward** | A song card, plus the cabaret opening once the cabaret permit is used. | — |

**To finish it:**
- The Jester startup fix.
- A quest log line for each step: the event log already exists, so this is text only.
- One probe that plays steps 1-5 in order.

### Quest 2 — "The Bath House" (floor 1, mid-game, ~15 min)
| Step | What happens | Built? |
|---|---|---|
| 1 | Activate the **GUARD POST** with its permit. Nemesis arrives at the bath doorway and warns you off. | BUILT, UNSEEN |
| 2 | Fight him beside the healing pool. Both of you heal after 5 s undamaged, so he must be kept off the water. | BUILT (pool) |
| 3 | He loses a limb and leaps back for it. He loses the sword and goes looking for a bow or spell card. | **NOT BUILT** (plan handed off) |
| 4 | Kill him. Every guard within 12 tiles sides with you. | BUILT |
| 5 | He returns at his post 30 s later, 25% stronger, so camping in the bath is never free. | **BROKEN** (3.3) |
| **Reward** | Katana card, helmet loot card, guard allies, and the achievement **Ally with a Guard**. | — |

**To finish it:**
- Nemesis's return.
- The limb and weapon behaviour.
- One probe that plays steps 1-5 in order.

---

## 5. Future releases

### 5.1 Language localization
Today the game ships **English and Japanese**: `js/data/i18n.js` holds only `en` and `ja`. Voice lines are Japanese and English, and bubbles are always kanji plus the local language.

Next languages, in release order. China and Brazil come first because they have the most gamers (Mark, 2026-10-17); Hindi is last.

| # | Language | Code | Notes |
|---|---|---|---|
| 1 | Chinese (Simplified) | `zh-Hans` | Bubbles: kanji line plus a Chinese line. Avoid a doubled CJK line where kanji and hanzi match. |
| 2 | Brazilian Portuguese | `pt-BR` | |
| 3 | Spanish | `es` | |
| 4 | French | `fr` | Longer strings: check the card and button widths. |
| 5 | German | `de` | Longest strings: check the cards, the HUD pills and the guide tabs. |
| 6 | Korean | `ko` | Hangul font. |
| 7 | Hindi | `hi` | Devanagari font. Chosen for "Indian" (Mark, 2026-10-17). |

Work:
1. Move every hard-coded English string in the engine and the Panels into `i18n.js` keys. Many engine log lines are still inline HTML strings.
2. One file per language, loaded on demand.
3. Fonts per script (Google Fonts subsets).
4. Card face text fits by measurement, not by length guesses.
5. A gate that fails the build when a key is missing in any shipped language. Without it, a missing key falls back to raw English silently, as the Panels token trap showed.

### 5.2 Multiplayer — PvP and Invasions
- **Invasions:** another player enters your dungeon through the torii portal as a red invader, Dark Souls style. The Invading Realms portal is already the door for this. The invader takes the place of a realm Lord or of Nemesis.
- **PvP duels:** a challenge at the cabaret's blackjack table or in the guard post. The cards fight on a shared turn clock, using the hybrid turn/real-time combat already in place.
- **What it needs:**
  1. A netcode layer: WebRTC data channels plus a small signalling server. The web edition stays serverless for single-player.
  2. An authoritative host: the dungeon owner's browser.
  3. Snapshots of bodies and cards, with the 60 Hz fixed clock as the sync tick.
  4. Karma rules for invaders.
  5. Anti-cheat on the host.
  6. Oni-Baba gets a new `REMOTE_PLAYER` sensor.
- **Order:** Invasions first, because they reuse the portal and the Nemesis "you again" encounter. PvP duels second.

---

## 6. Where to read more
- Rules and process: `CLAUDE.md`, `RULES.md`, `SEAT_PIPELINE.md`.
- Release: `RELEASE_PLAYBOOK.md`.
- Docs: `sectiondoors.md` · `guards.md` · `Nemesis.MD` · `knowledge/design/` (274 docs) · `plans/` (145 plans).
- Story: `THE_STORY.md`.
