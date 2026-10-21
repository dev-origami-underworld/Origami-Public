# js/v8/ai/ — Monster AI Rebuild Package

> 🧭 **Canonical entry point:** [`knowledge/MONSTER_AI_INDEX.md`](../../../knowledge/MONSTER_AI_INDEX.md) — read it
> first for current state, the P0–P6 roadmap + progress, the status model, the knobs register, and the anti-thrash lessons.


**Worker 1 · 2026-06-12.** The data-driven, single-owner monster-AI architecture for Origami Dungeon.
**CURRENT STATUS (Mark sync 2026-06-20): imported and wired, but gated OFF by default.**
`NewOrigami.Engine9.html` imports `MonsterAI.constructor.js` and `MonsterAI.engineAdapter.js`,
constructs `window._monsterAI`, and loads the cabaret room script. `window._AI_V2` still defaults to
`false`, so legacy `tickMonsterAI` owns normal gameplay unless Mark/tester flips the gate. This file is
therefore no longer an isolated scaffold; it is the live v2 path waiting for staged activation.

**Benchmark rule (Mark 2026-06-20):** the current DungeonChain build is working well and is the baseline
to improve from. Do not treat the new dungeon system as a rollback candidate while improving AI/combat.

## The model
**Utility-AI brain** per monster, on a **single-owner controller**, fed by **data-driven per-room affordances**,
biased by **Oni-Baba**. Not an LLM / neural net at runtime (those don't scale on kid hardware and aren't
debuggable). An LLM may *author* room JSON offline.

```
Director (Oni-Baba bias) ▸ Brain (UtilityBrain) ▸ Body (MonsterController + steering)
                                   ▲
                     Affordances from per-room JSON (the Sims "smart object" model)
```

## Files
| File | What |
|---|---|
| `MonsterAI.constructor.js` | the stack: `MonsterController` (single transform owner), `MonsterFSM` (one transition table), `AffordanceBank`, `UtilityBrain`, `MonsterAIConstructor` factory. Engine-agnostic. |
| `MonsterAI.engineAdapter.js` | the only file that knows Engine8 internals; bridges the constructor to real pathfinding/transforms/anim. |
| `rooms/cabaret.ai.json` | example per-room behavior script (data, not code). |

## Docs (in `knowledge/`)
| Doc | Covers |
|---|---|
| **`MONSTER_AI_V2_UPGRADE_COMPENDIUM_2026-06-15.md`** ⭐ | **CANONICAL (2026-06-15).** Code-verified current state + the 6-phase activation roadmap (P1-P6) for taking this rebuild live. Per-phase specs in `knowledge/monster_ai_v2/SPEC_P*.md`. Start here. |
| `MONSTER_AI_MASTER_COMPENDIUM_2026-06-12.md` | the whole picture: validated as-is truth, research, comparison, recommendation, phased roadmap (superseded as the live reference by the 2026-06-15 compendium) |
| `AI_REBUILD_01_ADAPTER_SPEC.md` | adapter method → Engine8 symbol map (file:line) + the one required extract |
| `AI_REBUILD_02_WIRING_GUIDE.md` | Phase-1 integration, one behavior at a time, validation gates, rollback |
| `AI_REBUILD_03_ROOM_SCRIPT_SCHEMA.md` | the per-room JSON schema + authoring + offline-LLM prompt |
| `AI_REBUILD_04_COMBAT_HOTFIX_PHASE0.md` | the chase-speed fix you can ship now |

## Build order (each gated on Mark's GO + a rendered check)
0. **Phase 0** — chase-speed / `_NO_FLEE` band-aids exist in the live legacy path.
1. **Phase 1** — constructor + adapter are already landed/imported; world-query wiring remains shallow.
2. **Phase 2** — widen peaceful adoption and retire idle/wander/greet multi-writers.
3. **Phase 3** — route melee HOSTILE through v2: LOS chase, last-seen search, leash, real encirclement,
   and a better attack cadence/feel. This is now a priority because current melee barely works.
4. **Phase 4** — affordances + utility for all rooms → per-room programmable individuality.
5. **Phase 5** — perception/memory/learning; fold ranged imp cover into the controller.
6. **Phase 6** — group tactics + Oni-Baba meta-director; optional authored boss/gaming scenes.

## Mark priority intake — 2026-06-20

Current requested improvement track:
- Improve monster AI using the existing v2 path, not a new parallel system.
- Fix the melee attack system; current sidebar/direct attack behavior barely works and needs a more reliable
  close-range interaction path, clearer timing, and better feedback.
- Fix gaming: guidebook gaming buttons do not work, fast bet does not work, clicking a gaming card should
  correctly interact with guidebook gaming, and click-to-move/sidebar attack are currently not working.
- Increase procedural room population to 1-3 monsters per eligible room.
- Add mummy and ghost to the proper monster roster / room-generation path. Mummy currently has cabaret
  special-case support in Engine8; it is not yet a first-class catalog/spawn archetype.
- Ghosts should spawn as real monsters, usually in groups of 2-3 when selected nearby. This is distinct from
  the removed "hungry-ghost cabaret swarm" feature in the Engine disabled register.
- Add one real ghost to the cabaret as a visual-design test case; current ghost look is too ugly and needs a
  more transparent, ethereal, bloom-forward treatment.

## Anti-thrash rules (why this stops the hours-long flailing)
1. One owner per monster per frame (no competing rotation/anim writers). 2. One FSM transition table.
3. Behavior is data the engine consumes (no monolith edit per room). 4. Semantic clip binding, never `NlaTrack.NNN`.
5. Animation derived from real motion. 6. Audit before edit. 7. Validate on the rendered screen. 8. FPS is sacred.

## Honest status
The modules are imported by Engine8 now. Still validate edits with `node --check` and rendered gameplay.
The high-risk area is not module loading; it is ownership/adoption breadth and avoiding legacy/v2 writers
fighting over the same monster.
