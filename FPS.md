# FPS.md — THE FRAME-RATE MASTER DOCUMENT (source of truth + forensics)

**Status:** BINDING DOCTRINE + consolidated knowledge base. Read this before touching the render loop,
the composer, camera/DPR setup, lighting, the culling/prioritization model, Oni-Baba's render sensors,
or `Clock.js`/`Renderer.js`.
**Authority:** Mark. **Target:** **120 fps @ 4K, held steady, crisp at native device resolution.**
**2026-10-17 amendment — Mark-approved `compassion-render`:** the startup accessibility fallback in
[§14](#compassion-render) is a scoped exception to the FPS-driven quality/scheduling prohibitions in
§0, §2, §4 and G20. The normal-quality target above remains. Read the exception and its evidence limits
before applying the older blanket wording to this feature.
**This file consolidates and supersedes** the scattered FPS notes — it is the single source AI should
read to *weight a solution by pattern* before acting. Forensic source docs it absorbs (kept as evidence):
`FPS-FIX.md` (repair runbook), `FPS_TRICKS.md` (technique catalog), `FPS_ARCHITECTURE_AND_TUNING_GUIDE.md`
(live knobs), `THROTTLING_AUDIT_2026-06-13.md`, `FPS_120_DROP_EXPLANATION_REQUEST_2026-06-12.md`,
`mean-green-screen.md` (fog post-mortem). Action specs that hang off this doc: `planned_update.md`
(throttle-loop removal), `FPV_MOOD_AND_FPS_FIX_SPEC_2026-06-13.md` (mood + FPS fix-forward).
*Line numbers drift — the **symbol** is the durable anchor; grep it.*

---

## 0. THE ONE LAW

> ### DE-PRIORITIZE BY OBSERVER. NEVER THROTTLE.

Recover frame rate by **cutting work** (fewer active lights, less transparent overdraw, cull what the
active camera can't see). **Never** degrade the *experience to mask slowness*: no frame cap below the
display refresh, no runtime resolution/DPR scaling, no frame-skip, no quality seesaw, **no feeding render
cost back into scheduling**. If you cannot hold 120 by cutting work → **report it to Mark with numbers.**
Making the game blurry/choppy/60 is the exact failure that cost this project weeks (B015 "adaptive
resolution", 2026-05-31) and got a gate seat fired for reflexively prescribing throttle.

---

## 1. THE MENTAL MODEL — this engine is FILL/FRAGMENT-bound, not draw-call-bound

Measured (two independent headless profiles, `FPS_120_DROP_…2026-06-12`): ~195–267 draw calls (**fine**),
but **~20–24 simultaneous lights**, ~340 `MeshStandardMaterial`, ~137 transparent objects at 4K. A late
build measured ~46 fps at native 4K — but ⚠️ **CORRECTION (2026-06-17, Mark): that was a REGRESSION, not a
floor.** The proven floors `fa3d12b` and `18ae4e1` both held a **true 120 @ 4K** at the *same* DPR
(`min(devicePixelRatio,2)`), with adaptive-res dormant (it only sheds below 55 fps — so a build holding
120 is rendering full native). There is **no fixed "46 fps fill wall."** The fill cost is **recoverable by
cutting simultaneous Point/Spot lights + overdraw**. The old "46 = baseline" framing was rogue cope used to
excuse the throttle (see `plans/THROTTLE_FORENSICS_AND_REMOVAL_2026-06-13.md`).

- **Three.js r128 forward rendering has NO light culling.** Every lit fragment loops over *all* lights.
  Cost ≈ `pixels × lights`, and **4K quadruples `pixels`** vs 1080p (DPR² ). This is the dominant term.
- Real levers: **(a) fewer simultaneously-active lights**, **(b) less transparent overdraw**, **(c) draw
  fewer pixels you can't see (observer/frustum cull)**. NOT draw-call batching, NOT "lower the resolution."
- **Adding/removing a light at runtime forces a FULL shader recompile** of every lit material → a
  guaranteed hitch (the "5-second room-entry freeze"). Toggle **intensity** (a uniform), never existence.
- **Global lights (ambient / hemisphere / directional) are cheap** — a constant term, not the per-light
  loop. **PointLights / SpotLights are the expensive ones.** → Brighten via ambient/emissive; delete
  decorative PointLights. (This is why the PIP-lighting port in §7 is both a look fix AND an FPS fix.)
- ~~**Oni-Baba's "excessive draw calls" label is misleading** — draws are not the bottleneck. Don't chase it.~~
  ⛔ **SUPERSEDED 2026-09-21 by Mark: "read onibaba sensors let them tell you what fucked up exactly"** — THIS
  LINE WAS THE FAILURE. It was true at ~250 draws (June) and it muted a correct sensor for three months. Measured
  09-21: **1232 primary draws**, render *submission* 9-11ms on the CPU (~8µs per draw), which alone overran the
  11.1ms vsync slot of a 90Hz panel → 38-45 fps. Oni-Baba's `excessive-draw-calls` anomaly was firing the whole
  time (Engine ~:103387, draws>180 && render>8.33ms); this bullet, the `probe-cpu-attribution.js` header and the
  Panels verdict "Game logic is busy — NOT the graphics" all told every seat to look elsewhere. The 936-draw
  cause was seam walls built as six-material boxes (one draw per FACE) since the 08-25 wall skin (`94f814aa`);
  fixed by `_packBoxMaterials` (one draw per distinct material).
  **THE RULE THIS TEACHES — A SENSOR OUTRANKS A DOCTRINE LINE.** When Oni-Baba flags X and a document says
  "ignore X", the document is a *dated measurement*, not law: re-measure X before believing it. Draw calls DO
  matter above ~500: CPU submission cost is linear in draws and competes with logic for the same vsync slot.
  Healthy reference: ~250 primary draws (DRAW CENSUS). Count by root name; a `Mesh` with a material ARRAY costs
  one draw per geometry group, not one per mesh.

> **Ceiling — CORRECTED (2026-06-17, Mark):** a *true* 120 @ 4K IS reachable and WAS held at `fa3d12b` /
> `18ae4e1` (DPR 2, adaptive-res dormant). The earlier claim that "120fps/4K tags were resolution-masked"
> is **debunked** — it inverts cause/effect (DPR-shedding only engages once fps is *already* below 55, so a
> build holding 120 is rendering full native, not masked). Recover fps by **cutting simultaneous Point/Spot
> lights + overdraw and observer-culling** — never by DPR-shedding, a frame cap, or relabeling the loss as a
> "wall." Still: report the *true* number, and pin DPR (don't shed).

---

## 2. THE ARCHITECTURE (how the frame is driven — keep it this way)

- **Single driver:** one `requestAnimationFrame` loop, vsync-capped ("B016 decouple", `startLoop`/`driveRAF`).
  RAF self-caps to display refresh → GPU queue never over-filled. **NEVER** add a second driver
  (`setInterval`/`setTimeout`) on top — the old dual-drive pushed ~147 submissions/sec ≈ 2.5× a 60 Hz
  panel → command-queue flood → raster stall → the infamous **63↔34 fps oscillation**.
- **All game logic** runs inside `v8Clock.tick(() => …)` (error-boundaried). **All renders** go through
  `v8SafeRenderer.renderSafe(scene, camera, composer)` (context-loss safe).
- **DPR fixed at boot:** `_dprFloor == _MAX_DPR == min(devicePixelRatio, 2)` (`Engine8` ~1284-1287). The
  only legitimate runtime `setPixelRatio` is on **window resize**. Never fps-driven. *(Verified pinned at HEAD.)*
- **The composer fast-path:** `renderSafe` inspects which passes are actually live each frame and renders
  **DIRECT** (skipping the composer) unless a *real effect* (bloom / bokeh / outline-with-a-selection) is
  active. `RenderPass`/`ShaderPass`(FXAA/copy)/`renderToScreen` are "infrastructure" and do **not** force
  the composer. **Keeping the composer OFF is the cheap path** — protect it. (Gate: `Renderer.js` ~310-330.)
- **Composer is FPV-only; top-down renders DIRECT** (bypasses bloom/FXAA/outline). An effect "added to the
  scene" is **invisible in top-down**. Gate visual work on the rendered outcome *per camera mode*.
- **Oni-Baba may OBSERVE fps** (telemetry, anomaly) but her sensors must **NOT** modulate render quality
  (resolution, frame cap, portal depth, PIP rate). **Observation ≠ control.**

---

## 3. THE DECISION MATRIX — diagnose by SYMPTOM, weight the solution by PATTERN

This is the heart of the doc. Match the symptom, read the cause, pick the lever by its pros/cons.

| Symptom you SEE | Most-likely cause | ✅ Right lever | ❌ Wrong lever (why) |
|---|---|---|---|
| FPS drops to a **hard 60** on a 120 Hz panel | frame cap (`_targetFps=60`/`targetFrameTime` gate) | remove the cap; RAF vsync-caps | "AAA mode" — it secretly means 60 |
| Image goes **blurry/soft** under load | adaptive resolution (DPR shed on fps) | pin DPR; fix fill | lower DPR (renders sub-native = "crap") |
| **63↔34 sawtooth** oscillation | dual frame driver **or** a reactive feedback loop | single RAF; delete the feedback | adaptive quality (laggy loop hunts) |
| **Freeze→catch-up** after sitting idle | activity-gated render-skip | visibility-pause only (hidden tab) | `_framesSinceLastInteraction` perf gate |
| **Multi-second freeze on room entry** | light-COUNT change → shader recompile | static light cap (`_maxPedLights`); pre-warm | adding lights per-pursuer at runtime |
| **FPS halves the moment a monster appears** | composer + per-frame OutlinePass turned on | scope outline to locked target → restore direct path | leaving the all-monster rim forcing the composer |
| **Steady low FPS with only 1–2 monsters** | GEOMETRY: over-deep portal reach (hub room) **or** uncullable static floor/walls | tighten `_portalDepth`; chunk floor/walls into the room cull | blaming monster count / adding throttle |
| **FPV flat / dead / "horrible"** (not blurry) | mood overlay (`#fx-grade`) OFF + dark base ambient | re-enable+re-blue `#fx-grade`; port PIP lighting (§7) | re-adding UnrealBloom (a composer fill cost) |
| **Green haze, FPV-only, worse as rooms dim** | `scene.fog` density override (Oni-Baba ramps it) | gate the fog density override; thin/disable | recoloring DOM (it's canvas-rendered) |
| Monster **white-out / glare** | pure diffuse over-illumination (+ old bloom) | dim the key light intensity | chasing metalness/roughness (specular≠cause) |
| An effect **shows nothing** | viewing it in **top-down** (direct path) | verify in FPV; it's a camera-path issue | "the code is wrong" (it's valid, just bypassed) |

### Lever weighting (pros / cons / watch-outs)
| Lever | Pro | Con | Watch |
|---|---|---|---|
| **Cut simultaneous lights** (PointLight→emissive, distance-cull, cap) | attacks the *dominant* 4K fill cost | scene gets darker | compensate with cheap ambient/emissive; COUNT-change = recompile (toggle intensity) |
| **Brighten via global ambient/hemi/dir** (the PIP recipe, §7) | near-free brightness; lets you DELETE costly PointLights | can blow out monsters | scope to **layer 1** (walls/floor), not the layer-5 monster rig |
| **Observer / portal / frustum cull** | scales with *observed set*, doctrine-pure, smooth | needs a **stable** input (position), must also kill mixer/matrix CPU | `visible=false` still ticks mixers+matrices (§5 C8) |
| **Composer-scope (keep direct path)** | biggest single controllable FPS win in FPV | touches Mark's all-monster rim feature | **Mark's call** — keep rim unless he opts to scope |
| **Floor/wall geo chunking** | removes the uncullable BSP fill | high-risk structural (seams, colliders) | stage LAST; re-validate movement/collision |
| **Throttle / adaptive-res / frame-skip / quality seesaw** | a higher *number* short-term | **FORBIDDEN** — oscillates, blurs, masks true cost, degrades the watched experience | this is the trap; see §4 |

---

## 4. THE FORBIDDEN LIST (auto-reject in review; `scripts/probe-no-throttle.sh` enforces it)

⛔ SUPERSEDED 2026-09-27 by Mark: "if fps drops to less than 50? drop resolution down 20%" — Oni-Baba's shadow step now lowers the pixel ratio ×0.8 at tier 2 (< 50 fps) and restores it on the way back; register entry at the top of `Origami.RealityEngine.9.html`. Every other ban here still stands.

Any of these in the render path is a **rogue edit** unless Mark gave explicit in-chat GO **and** it's in
the DISABLED-FEATURES REGISTER:

| ❌ Forbidden | Why | ✅ Do instead |
|---|---|---|
| **Adaptive / dynamic resolution** (`_applyPixelRatio` driven by fps, `renderScale`) | sub-native → blurry; trades the experience for frame time | fix fill; pin DPR |
| **Frame cap below display** (`_targetFps`, `targetFrameTime` gate, `if(elapsed<…)return`) | caps to 60 on a 120 Hz panel | let RAF vsync-cap; render every frame |
| **Frame-skip / render-skip** (`frameSkip`, activity-gated `needsRender`, `_framesSinceLastInteraction` for perf) | choppy; hitches on resume; muddies measurement | visibility-pause for backgrounded tab only |
| **Quality-downshift seesaw** (AAA/TURBO flips fps target, shadow on/off on fps) | "best quality" secretly = 60; oscillates | opt-in quality button that never changes fps |
| **Render-cost → scheduling feedback** (`_oniRenderStress`/`rollingFt` → portalDepth / PIP fps / `_perfMode` / `_pipPerfPin`) | violates the harmonic invariant; self-oscillates | de-prioritize statically by observer; sensors read-only |
| **A second frame driver** (`setInterval`/`setTimeout` + RAF) | GPU queue flood → 63↔34 oscillation | single RAF only |
| **Visual richness shipped un-measured** (new materials / cloned rigs / glow shaders / never-frustum-culled meshes, added without a program-count check) | each new material+light-count mints a new r128 shader program → GPU **state-churn stall**; render-TIME stays cheap so it never *feels* heavy, and Oni-Baba's per-session baseline hides the slow drift | census `programs.length` vs the gold floor **before** it lands (§10.3); cull + light-trim, never throttle |
| **Any EffectComposer pass / `composer.enabled = true`** (OutlinePass, UnrealBloom, a custom `THREE.Pass` subclass — the 2026-10-15 `NemesisPanelBloomPass`) | each pass re-renders the scene and/or adds full-res quads; `Renderer.js` leaves the direct path the moment any pass has a selection; measured 2026-10-15: 120→15–20 fps, GPU 307%, for one glow | glow in the body material (Fresnel rim at `<emissivemap_fragment>`, 0 draws) or additive sprites; `composer.enabled` stays `false` — Mark 2026-10-15: "dont touch it again" |

**Disguise tell:** comments saying *"NOT a throttle," "retired," "inert"* sitting on live throttle code.
A comment is not a removal. Treat the code as live and rip it. (Also: a stale comment can *lie about
behavior* — e.g. one claims `_perfMode` scopes the outline; it does not. Verify the code, not the comment.)

---

## 5. THE CULLING / PRIORITIZATION STACK (the "deprioritize" half of the law)

The order is the point: **GPU frustum (free) → portal room-graph (cheap) → per-object (last resort).**
Each layer kills work before the next looks. *(Live knobs: `FPS_ARCHITECTURE_AND_TUNING_GUIDE.md`.)*

- **C6 · Far plane = a free GPU frustum cull.** Set each camera's `far` to its real need; the GPU culls
  beyond it before any draw call. Per-camera: FPV eye-spotter tiny far, main view more, PIP pin `far=8`.
- **C7 · Portal BFS gated on movement — the hub-room trap.** BFS across rooms through shoji doors builds
  the visible-room set, recomputed **only when the player changes tiles**. ⚠️ At depth 2 a **hub room
  (many doors)** renders **two rings** → hard lag with *2 monsters*. **Default depth = 1.** *Lesson: FPS
  tanks with FEW monsters ⇒ suspect over-deep portal geometry, not the monsters.* (A/B needs a step taken.)
- **C8 · `visible=false` still costs you (the highest-value find).** It skips only the **draw** — Three.js
  **still ticks the animation mixer and recomputes world matrices.** A room of fogged-but-animated skeletons
  burned ~**11%** of frame time for things nobody saw. Fix: on fog, also (a) flag mixer `_cullHidden` so the
  loop skips `mixer.update()`, and (b) `matrixWorldAutoUpdate=false`. Latch-free on un-fog. **The culler
  must run BEFORE the mixer loop each frame.**
- **C9 · Staggered un-fog.** Cap non-urgent un-fogs per frame (`_unfogBudget`, default 3) so a room entry
  reveals over a few frames ("emerging from fog") instead of a one-frame spike. Urgent (room/close/hostile)
  bypasses — never sacrifice visibility for smoothness.
- **C10 · The PIP is a second renderer — cull it HARDER.** A picture-in-picture doubles draw calls (every
  monster drawn for main + PIP). PIP super-culls to the player's room + a small near radius via atomic
  **hide → render → restore** so the next main frame is untouched. (`_pipDepth1`.)
- **Pedestal-light cap** (`_maxPedLights`, default 4) — bounds simultaneous PointLights so the count stays
  stable (no recompile cliff). **Per-camera prioritization cull** measures pedestal-light distance from the
  *active observing camera* (`_cullCam`). **Room+1-tile cull** (`_aboutToEnter`) tightens the monster/prop
  observed set. ⚠️ **Gap:** the cull touches monsters/props only — the BSP floor/wall InstancedMeshes are
  `frustumCulled=false` and draw fully every pass (see §6 current state).

---

## 6. CURRENT STATE @ HEAD `7409a0b` — what's healthy, what's blasted (deep-audited)

> *Decision (Mark): STAY on HEAD, fix forward, keep thin walls. No git revert — a revert to a thick-wall
> floor orphans ~9 commits (MonsterAI v2, mummy, localization, BSP, context-loss hardening) = repeats the
> rogue `reset --hard` the repo just recovered from.*

**The prioritization model is mostly INTACT — 7 of 9 mechanisms verified WORKING at HEAD.** "Blasted" is
narrower than it felt: the harmonic *culling* is healthy; what's broken is (a) reactive throttle loops that
survived the "remove all throttling" commit, (b) static geometry that never entered the observer model, and
(c) the composer tax. Verified findings:

**✅ Healthy / keep (do NOT touch):** single-RAF B016 · DPR pinned native (adaptive-res B015 **removed** by
`7409a0b` — so `THROTTLING_AUDIT_2026-06-13` #1 is now STALE) · fog/matrix mixer cull (`~11009-11022`) ·
staggered un-fog (`~10966`) · PIP depth-1 super-cull (`~11104-11135`, renders direct — **no composer**) ·
pedestal-light cap (`~25207`, toggles visibility/intensity → no recompile) · room+1 cull (`_aboutToEnter`
`~10851`, **monsters/props only**) · per-camera `_cullCam` + FPV-in-PIP eye-spotter (`~25238`/`~11172`) ·
layer lighting bus 1/3/4/5/6 (intact) · context-loss SafeRenderer · monster matte-PBR / glow-off / eyes-off
(Mark-requested — **do NOT reverse**).

**❌ Blasted / open (in fix priority):**
1. **Mood overlay OFF** — `#fx-grade` is `display:none` (`NewOrigami.8.html:62`, since 06-12 for a green
   tint). The documented free replacement for bloom; with it off, FPV reads flat/dead. *(This is the actual
   root of "FPV graphics horrible" — not darkness, not the matte monsters.)* Fix: re-enable re-colored
   **blue**, not the old green-teal `rgba(8,26,30)`. (Spec Phase 1.)
2. **FPV under-lit vs the PIP** — main FPV `ambient 0.693`; the PIP boosts cheap globals to `2.20` and reads
   clean. Port the recipe (§7) — near-free, lets us delete costly PointLights. (Spec Phase 2.)
> ⛔ SUPERSEDED 2026-09-27 — the PiP's live record is `knowledge/design/PIP_COST_AND_TRANSPORT_2026-09-27.md`: the cost was the blocking PBO readback (10–33 ms/call), now removed (`_pipBlit`, 9855e479). Read this section as history. `_pipPerfPin` was disabled 06-14; the PIP wall-count clamp is inert (`pipWalls.visible=false` in the thin-wall build).

3. **Reactive throttle loops STILL LIVE** (the real doctrine breach, survived `7409a0b`) — `_perfMode`
   (flaps on `rollingFt>28`, `~26192`; effect = PIP send 20→10fps), `_pipPerfPin` (flaps on `rollingFt>33`,
   `~10808`; re-frames/tightens/slows PIP), compass/radar UI cadence on `_oniRenderStress` (`~26694`/`~26714`),
   and the dead `_oniRenderStress→portalDepth` branch (`~10891`, inert). Register item (5) admits "LEFT IN
   PLACE this pass." Fix: `planned_update.md` Steps 1–4. **They FLAP under partial perf fixes** (PIP cadence
   20↔10, radius 6↔4) — remove them BEFORE measuring anything else. (Spec Phase 4.)
4. **Uncullable static geometry — the real fill gap on the MAIN camera.** The observed-set cull only flags
   **monsters/loot/torches/vending** `.visible`; the whole BSP **floor + walls + lintels + shoji**
   (`instancedFloor` `~3074`, `fpvWalls` `~2181`, `thinWalls` `~2246`, `instancedLintels` `~2714`, `shojiMesh`
   `~2335`, all `frustumCulled=false`) draw FULL every FPV pass regardless of player room. So "cost scales
   with observed set" holds for the dynamic set but **NOT for static geo** — and `cf4bca8`'s BSP map grew the
   floor ~45×. Only the PIP narrows wall draw *count*. Fix: chunk floor/walls per-room, gate on the room+1
   set (high-risk; stage last). (Spec Phase 3.)
5. **The composer tax** — `cf4bca8` set `composer.enabled=true` for the first time ever (`~4945`) + a
   per-frame `_feedMonsterOutline` (`~4973`). **Correction (verified):** the outline path is **gated by the
   room+1 cull** (`_feedMonsterOutline` skips `w.visible===false`, `~4981`; `renderSafe` routes through the
   composer only when `OutlinePass.selectedObjects>0`) — it is **NOT** "engaged regardless of prioritization."
   But it remains a real **extra full-screen pass whenever any in-room monster is on-screen** (drops FPV off
   the 120 vsync step toward 60 — the composer tax of §8 A3). The all-monster rim is **Mark's standing call →
   keep by default;** scoping it to the locked target is the single biggest composer-tax win but only Mark may
   trade away the rim. (Spec optional phase.)

*Note:* the room+1 cull (`window._cullRoomPlus1`) is a **Mark-sanctioned, registered** design change that, on
its default path, shelves the old radius + portal-BFS keep (harmonic mechanisms 2/3/6) — documented, not
silent damage. *(Full restoration runbook + exact anchors: `FPV_MOOD_AND_FPS_FIX_SPEC_2026-06-13.md`.)*

---

## 7. THE PIP-LIGHTING PORT (Mark: "the FPV in the PIP has the good solution for lighting — use it")

The PIP renders a clean, readable scene by **boosting global lights** (cheap), then restoring:
`ambient 2.20 · dir 0.65 · fog 0 · bg 0x1c2230 (blue)` (`Engine8` ~11146-11149). Main FPV is
`ambient 0.693 · dir 0.0528 · hemi 0.22 · fog 0.016` (~1849-1871) — ~3× darker → "flat/dead".

**Why it's the right fix:** ambient/hemi/dir are **global** (no per-light loop) — porting them to FPV
brightens the scene for ~0 GPU **and lets you delete expensive decorative PointLights** (the real fill
cost). The blue bg honors "no green."
**Layer-aware caveat:** brighten **layer 1** (walls/floor) toward the PIP values; do **NOT** raise the
**layer-5** monster studio rig — that re-creates the white-out Mark deliberately matted away (§E16 / E14).
*(Exact before→after lives in `FPV_MOOD_AND_FPS_FIX_SPEC_2026-06-13.md`.)*

---

## 8. NON-OBVIOUS TECHNIQUES (the catalog — why the textbook answer is wrong here)

🟢 GOTCHA · 🟡 UNUSUAL COMBO · 🔴 OURS

- **A1 🟡 Vignette ∉ the 3D pipeline.** A CSS `radial-gradient` overlay gives the identical look for zero
  GPU, works in top-down too, and dodges the composer. (This is what `#fx-grade` is.)
- **A2 🟡 Real DOF is the wrong tool.** Band-blur + distance-fog read as tilt-shift far cheaper than Bokeh
  (which was invisible at max blur in a dim dungeon). Bokeh ships OFF.
- **A3 🔴 One post-FX pass can halve FPS — the composer tax.** The cost isn't the pass (~1–2 ms); it's that
  enabling any real effect disqualifies the direct-render fast path → 120→60 vsync cliff. **Protect the
  direct path.** (This is exactly what bit us at `cf4bca8`, §6.)
- **B4/B5 🔴 Deprioritize, never throttle; the fog is both the lever and the alibi** (culled = fogged =
  atmosphere). Optimization and art pointed the same direction.
- **D11 🟢 Two render drivers flood the GPU queue** (63↔34), they don't double FPS. Single RAF.
- **D12 🔴 Composer fast-path + the "infrastructure pass" trick.** A plain `ShaderPass` is treated as
  infra and silently skipped — give a real effect a **distinct `constructor.name`** (subclass) so it counts.
- **D13 🟢 Top-down bypasses the composer** — composer effects are invisible there. Gate on pixels (F19).
- **E14 🟡 Layer-partitioned studio lights** — monster fill on **layer 5** lights monsters without spilling
  on walls/floor. Lights are layer-maskable like meshes. (This is the lever for the §7 port.)
- **E15 🟢 Light COUNT change = shader recompile freeze.** Budget the count (`_maxPedLights`); toggle
  intensity not existence.
- **E16 🟢 Zero specular can still glare** — pure diffuse over-light + bloom. Fix is intensity, not material.
- **F17 🟢 The vsync cliff** — "60" can mean "fell off 120"; read FPS **+** the bottleneck line, re-baseline.
- **F18 🟢 FPSHEALTH is a step function**, not a ratio (`≥target→100`, `≥30→50`, `≥20→25`; `OniBaba8.js`).
  Read the formula; don't infer the metric.
- **F19 🔴 Gate on the rendered outcome, not the code** — valid code ≠ visible result in a multi-path renderer.
- **G20 🔴 The harmonic invariant** — *no action's cost may feed back into how work is scheduled.* If the
  thing you measure (FPS) controls the thing that changes it (quality), you've built a laggy feedback loop
  that **hunts** = stutter that looks like a perf bug but is the controller fighting itself. Deprioritize by
  a **stable** input (player position), never a **reactive** one (current FPS). This is the principle the
  whole architecture is organized around.

---

## 9. THE GREEN-FOG GOTCHA (a worked example of pattern-matching, from `mean-green-screen.md`)

Multi-day "green haze, FPV-only, worse as rooms dim." **Cause: the fog.** `scene.fog` (`FogExp2 0x0a0b10`)
is **dynamically overridden every frame** by Oni-Baba's `outputs.fogDensity` (~25895) — so editing the base
fog (~1298) did nothing; **the override is the lever.** Dense dark-blue fog over a dark FPV scene **reads
green**, and only in FPV because top-down renders direct (the fog+composite is FPV-only). Proof: two COPY-ALL
snapshots identical except `fog density 0.041` (green) vs `0.033` (none), both `GREEN_SCAN engine: NONE`
(= rendered into canvas pixels, not a DOM element — which is why a DOM hunt never found it).
**Lessons:** (1) when Mark says "remove X to test," the removal **is** the test — do it first; (2) a green
tint with `engine: NONE` is canvas-rendered (fog/material/composer), stop hunting the DOM; (3) trust the
COPY-ALL `fog density` A/B signal early.

---

## 10. FORENSIC HISTORY (so no one repeats it)

### 10.1 The throttle waves (entered in 3 waves, survived into every gold tag — re-labeled, never removed)
| Wave | Commit | Date | Added |
|---|---|---|---|
| idle render-skip | `5add1da` | 2026-05-21 | `_framesSinceLastInteraction` |
| AAA/TURBO 60-cap | `0039142` | 2026-05-25 | `_targetFps` / `targetFrameTime` gate |
| **adaptive resolution** | `9199cc2` | 2026-05-31 | DPR scaling (`_applyPixelRatio`, B015) — *the architecture-ripper* |
| "NOT a throttle" comments | `463026a` | 2026-06-09 | the disguise layer |

"Restore a gold tag" is **not** the fix — every gold is byte-identical on the throttle markers. Delete the
throttle, keep the genuine wins (single-RAF, fog-cull, light caps). Removal runbook: `FPS-FIX.md`.

### 10.2 The 06-13 "thin-wall" regression (this session's forensic — verified, git-bisected)
The 06-10/11 build Mark remembers as "120fps/4K good" = floor `18ae4e1` (build 8.1.277, thick walls).
The FPS issue began at **`cf4bca8` (the thin-wall commit)** — but **NOT because of the thin walls** (1 draw
call). `cf4bca8` bundled three independent things: (a) **set `composer.enabled=true` for the first time
ever** + a per-frame OutlinePass → the documented composer/outline cost (§6 #1); (b) swapped in the **BSP
dungeon**, growing uncullable floor fill ~45× (§6 #2); (c) raised light intensities. The "horrible FPV
graphics" are a **separate** stack of Mark-requested de-glow edits (`0cea2e3` bloom-off + matte PBR,
`7d5926c` eyes-off) that **predate** the walls, compounded by `#fx-grade` being off. Then `7409a0b` pinned
DPR native — correctly **un-masking** the true 4K cost the adaptive-res loop had been hiding.
**Verdict: keep thin walls, fix forward (§6). Thick-wall cubes still exist in HEAD (hidden via
`_setThinWalls(true)`) — a design toggle, never the FPS/graphics fix.** The public remotes are frozen at
2026-04-22; nothing 120fps was ever pushed public.

### 10.3 The 2026-07-24 program-creep regression (census-convicted, restored) — *WHAT NOT TO DO + the result*

**What was done (the "don't"):** over ~48h (07-23→24) the cabaret kept getting richer — Stariko pop-show
**clone duo**, crew row + mic, neon materials, the **gauge ethereal glow**, RING-default map — each landing
**without a program-count check**. No single feature looked guilty; every one just added "a bit more sparkle."

**What the result was (when we did it):** shader **programs crept `308 → 393` (+85)** while render-TIME stayed
cheap (**~2.4ms**), so nothing *felt* heavy — the cost was a main-thread + GPU **state-churn stall**, NOT fill
or triangles. Real-machine FPS fell to ~**35**. Critically, **Oni-Baba reported "no regression" the entire
time**: its baseline is the *current session's* boot median, so a slow multi-day drift always reads "at
baseline." The regression was caught by Mark's memory ("compare to 48h ago"), not by any instrument.

**The fix:** full restore to `gold-2026-07-20-v8.2.224-2` (`530267a`) → programs back to **308**, FPS "much
better." The 48h of features are preserved on tag **`salvage-2026-07-24-pre-fps-restore` (`863ded7`)** — to be
reintroduced **one piece at a time, each census-checked** against the 308 floor (never as a bundle).

**The lesson:** `programs.length` is renderer-reported → **SwiftShader headless ≡ real GPU**, so it is the one
number you CAN bisect cheaply and offline. Probe: `scratchpad/probe-census.js` (`PROBE_ROOT=<worktree>
PROBE_LABEL=x`); worktree per commit, compare `programs`. Never trust "no regression" against slow drift.

---

## 11. HOW TO TEST (every render-path change must pass)

1. **Throttle guard:** `bash scripts/probe-no-throttle.sh` → must be **✅ clean** (fails on any forbidden
   pattern; wire into `npm run smoke` + ideally a pre-commit hook).
2. **Boot clean:** `npm run smoke` + `node scripts/probe-bsp-boot.js` → **0 page errors**.
3. **The HELD-120 eyeball (the one that matters)** at 4K/120 on `http://127.0.0.1:5501/NewOrigami.8.html`:
   idle in a lit room ≈ **120**; walk into the light-dense area + fight → may **dip** but must NOT
   hard-60 (cap tell), go **blurry** (adaptive-res tell — screenshot-diff sharpness), **oscillate 63↔34**
   (dual-driver/feedback tell), or **freeze→catch-up** after idle (render-skip tell).
4. **Test in FPV at 4K, one change at a time** — top-down bypasses the composer and hides both the cost and
   the look. **Gate on the rendered outcome, not the code.**

---

## 12. THE GUARDRAIL (prevent recurrence)

1. **`scripts/probe-no-throttle.sh`** — grep gate (regex over: `adaptiveRes`, fps-driven `_applyPixelRatio`/
   `setPixelRatio`, `targetFrameTime`, `_targetFps=60`, `framesSinceLastInteraction`, `renderScale`,
   `frameSkip`, `_oniRenderStress…portalDepth`, etc.). Tune so legit resize `setPixelRatio` doesn't trip.
2. **Doctrine banner** above `function loop()` restating §0 + §4, + a **DISABLED-FEATURES REGISTER** entry
   at the top of `NewOrigami.Engine8.html` for every disable (what · where · why · date · who — no silent kills).
3. **CLAUDE.md** "🚫 MANDATE: NO THROTTLING" (binding).
4. **(Optional, strongest)** a `.claude/settings.json` PreToolUse hook that greps proposed Edit/Write diffs
   for the forbidden patterns and blocks them pre-land.

**Standing mandates on every render-path change:** log disables in the register; bump the `?v=` iframe query
**and** `sw.js` CACHE on any `.html` edit; route telemetry via Oni-Baba (`ENGINE_ANOMALY`); **work from a
copy / through the owning seat — never plaster into the shared live tree.**

---

## 13. ANTI-HALLUCINATION CLAUSE
Don't claim a throttle/effect is "removed" unless you can point to the specific edit. If you only confirmed
via grep that a symbol is absent *now*, say "I cannot find X — if the symptom persists it is cached (bump
`sw.js`) or it's a different mechanism." **Cache-first when Mark says "still there."**

---

<a id="compassion-render"></a>
## 14. compassion-render — startup accessibility amendment (2026-10-17)

**Authority:** Mark's explicit approval in chat of the compassion-render implementation plan, including
viewport reduction, static Panels and dungeon loot, reduced PiP, and gradual recovery. Implementation
checkpoint: `76b9da7e`. This is a registered FPS-driven quality fallback: it trades image area and secondary
animation for playability on slower devices. That approval is specific to this feature; the main frame
driver, safe clock, safe renderer and composer-off boundary are preserved.

### Assessment starts after world-ready

“Onload” means automatic assessment of the running game after `ENGINE_WORLD_READY`. It does not test
device capability during downloads, scene construction or shader compilation, and supplies no rescue
for a device that cannot complete initial loading. Classification uses actual game-frame telemetry,
including CPU, GPU and UI contention, without a device-age or hardware-name exclusion.

Oni-Baba's `_compassionSample` accepts eligible samples at most about once per second, skips the first
three after world-ready/resume, and excludes hidden tabs, pauses and loading transitions. Mark's 2026-10-17
40-60 FPS gear amendment supersedes the original sub-20 thresholds: four consecutive samples below 40 FPS
select compact compass/radar with the 3D PiP pass and blit stopped; four fresh sub-40 samples select the
reduced viewport; four more select static visuals and reduced PiP settings. Each step waits for its own
fresh samples. Exactly 40 FPS holds the current gear. The announcement is sent
once per shell session: “We adjusted our game so you can play our game better.”

State is held by Oni-Baba in the shell and replayed to reloaded frames. This is session state; a full
page launch starts a fresh assessment. Relevant code: `js/v8/OniBaba8.js` (`_compassionSample`,
`_compassionSetReady`, `_compassionBroadcast`), `OrigamiUnderworld.html` (world-ready and viewport),
and the engine's `COMPASSION_PLAY_STATE` / `PERF_MONITOR_UPDATE` eligibility fields.

### Correct the cost estimates

| Change | Work reduced | Limit of the claim |
|---|---|---|
| Compact compass/radar at 1/3 width and height | Stop the 3D PiP scene render and compositing pass; keep quest, enemy and green ally markers live. | Main-scene and gameplay costs remain; reaching 40 FPS on arbitrary hardware is not guaranteed. |
| Engine viewport at 2/3 width and 2/3 height | About 44.4% of the original pixel area remains: about 55.6% fewer main-view pixels at the same DPR. Side buffers are 1/6 screen width each; the top buffer is 1/3 screen height. | Object counts, shader-program counts, geometry submission and simulation cost can remain unchanged. Panels stay full size. |
| Static Panels and decorative dungeon loot | Stop recurring model callbacks, mixer advancement, decorative bob/spin and repeated still-image copies. Redraw visible content after relevant changes. | A frozen pose alone saves no repeated render work. New models, equipment, wounds, quantities, resized canvases and wager results still need draws. Context/resource costs also need measurement. |
| PiP at 1/3 cadence and 1/3 of each target dimension | About 1/9 of the target pixels per pass, with 1/3 as many scene updates. The theoretical pixel-pass budget is about 1/27 of normal. | This is no claim of a 27× speedup. Geometry/CPU submission scales with pass frequency; shared main rendering and the PiP compositing quad still run. |

PiP reductions derive from its otherwise effective profile/tier settings on each application, avoiding
repeated division. Examples observed during validation: a normal 320 target became 107; a tier-reduced
160 target became 53. `_oniPipResApply` composes the target size; `_sendPipFrameInner` multiplies the
normal interval by three. Existing quality tiers retain their separate DPR behavior. Compassion-render's
main-view reduction comes from the smaller viewport; it introduces no additional main-view DPR multiplier.

### Apply the FPS findings to diagnosis and recovery

Sections 1, C8/C10 and 10.3 explain why this fallback must remove actual work and why fewer pixels alone
may fail: draw submission, invisible animation/matrix work, shader churn and PiP can each dominate.
The June counts and the boot median are dated measurements, not a hardware floor or proof of health.
Use current Oni-Baba timing/anomaly evidence and, when measured, before/after program counts to identify
the remaining cost. Keep those diagnostic signals visible while the fallback is active.

The main view continues through its existing RAF/safe-render path, with no new frame cap. The original
PiP is enabled at startup. Mark's normal-PiP clarification restores its display after ten consecutive
samples at 40 FPS or higher; a failed trial goes back to compact radar and waits at least 60 seconds.
Other detail recovery waits for ten samples near 60 FPS, restoring one step at a time. A known 60-Hz
display allows 59 FPS for that threshold. Each trial
needs ten consecutive samples at 40 FPS or higher to settle within the target band; four consecutive samples below 40 FPS roll it back and
block another trial for at least 60 seconds. These guards reduce switching risk; stable physical-device
behavior still requires observation, as G20 warns. Maximum reduction stays bounded even if FPS remains low.

### Evidence and remaining checks

- **Statically validated:** inline HTML scripts and changed JavaScript parse; diff whitespace check passes.
- **Isolated behavior checks passed:** world-ready/warmup, sub-20 boundaries, pause/hidden exclusion,
  very slow samples, stage limits, one announcement, recovery/rollback/cooldown, reload-state retention,
  stopping recurring callbacks, coalesced redraw and callback teardown.
- **Runtime observed in Chromium with controlled FPS inputs:** desktop viewport sizing with full-size
  Panels, mouse/touch forwarding, camera drag, stationary loot timers, PiP target/cadence reductions and
  recovery. Four Panels scene renders over two seconds were observed for content updates. This is an
  observation of fewer repeated draws, not a measured end-user FPS improvement.
- **Mobile-size checks:** live-game viewport and touch checks passed. Mobile CSS initially overrode PiP
  placement; after correction, alignment through resizing, the load-position writer and recovery passed
  using the real shell and Panels with a lightweight engine placeholder. That alignment check is narrower
  than a full mobile-game performance test. No uncaught page errors were reported by these browser checks.
- **UNVERIFIED:** physical old-phone playability; sustained 20/60 FPS under actual play and thermal load;
  a before/after GPU/CPU/program-count census; exhaustive changed-content and live floor-reload coverage;
  and the full 4K/120 acceptance suite. Headless frame rates, a clean console, parse success and session
  baseline health establish none of those outcomes. The fallback cannot guarantee playability on every device.

Current live entry is `OrigamiUnderworld.html`; the Engine8 URL in historical §11 is not the entry used
for the validation above. No additional game boot, smoke suite or broad falsification was run for this
documentation amendment.

---
*If you change anything in the render path, you have read §0, matched §3, kept §4/§12 green, and verified on
the pixels (§11). Otherwise stop. — Git is routed to the controller seat; this doc's authority is Mark.*
