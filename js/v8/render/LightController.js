// ═══════════════════════════════════════════════════════════════════════════════════════════════ [REF#VZ-00001]
// LIGHT CONTROLLER — the single authority over every light in the dungeon scene (Mark GO 2026-07-27)
//
// THE MODEL (the ONIBABA_PEDESTAL_POLICY doctrine): Oni-Baba OWNS THE POLICY — pure data that can
// cross the iframe boundary. THIS MODULE owns the DRAW: it is the one place that may touch a
// registered light's .visible, and (from Phase 2) the one driver of intensity choreography.
// ⛔ THE EXTERNAL PLAN THIS HEADER CITED IS GONE AND UNRECOVERABLE (checked 2026-09-05).
//   It was `~/.claude/plans/you-will-now-do-smooth-cocke.md` — a home-directory file, NEVER tracked
//   in this repo (`git log --all` on the path returns nothing), so no seat could ever open it and
//   no seat ever will. A module's stated authority must be readable by the people it governs.
//   NOT a planted authority — checked rather than assumed, because that is the shape we hunt:
//   the citation arrived in `525790f3`, whose stated purpose IS creating this module, so the
//   commit and the claim agree. (Its ancestor `5c253134`, a cabaret-titled commit, carried the
//   same citation on the Engine9 import line — which looks wrong until that commit's sibling
//   message discloses the hunk-sliced worktree by count, 53 lightctl / 5 cabaret / 4 song. The
//   Engine9 twin has since been rewritten and no longer carries the dead path.)
//   THE AUTHORITY THAT SURVIVES IS IN-REPO: SEAT_PIPELINE.md §4, the 2026-07-27 "LIGHT CTL
//   Phase 0" entry — new module + pre-TDZ Engine9 adapter + the register() sites + tokens +
//   probe-lightctl.js 10/10. Read that, not this line's ghost.
//
// FIXED-COLLECTION AUTHORITY. Every gameplay Point/Spot is a LOGICAL emitter. At registration its
// authored object is moved to camera-inert layer 31, while a fixed scene-root bank of four PointLight
// slots is what the renderer actually collects. The controller copies the best currently-relevant
// emitters into those slots by intensity/position/color/range. Therefore spawn, death, pickup,
// section/room culling, ancestor visibility, and choreography can change uniforms but CANNOT change
// NUM_POINT_LIGHTS / NUM_SPOT_LIGHTS. This replaces the failed "prewarm whichever count comes next"
// ladder with one runtime tuple.
//
// The bank is taxonomy-aware: up to two ROOM emitters and two ENTITY/POOL/FX emitters get first
// claim, then unused capacity is filled by the nearest remaining relevant emitters. Section residency
// and room tier are still the outer/inner gates; they now remove logical candidates rather than
// changing renderer collection state.
//
// SAFETY BOUNDARY (CLAUDE.md mandates):
//   · Owns NO requestAnimationFrame — ticked from inside v8Clock.tick by the engine adapter.
//   · Reads NO fps / frame time / renderStress — cull inputs are the ladder + portal set only
//     (player position, room graph, segment state: the FPS.md §G20 harmonic invariant).
//   · Creates exactly one fixed four-light bank during scene boot, before shader prewarm. It never
//     adds/removes/toggles a slot afterward (E15 law: the light COUNT is sacred).
//   · Writes NOTHING back to Oni-Baba's sensors (the MUSIC_CUE zero-feedback precedent).
//   · Section policy touches only registered ROOM logical sources. The fixed bank remains collected.
//
// E15 REFRESHER for future editors: animation/choreography fades INTENSITY (a uniform, free). A fixed
// bank means intensity 0 still occupies one of FOUR budgeted loops, but dormant dungeon-wide source
// lights occupy NONE. Never put a gameplay Point/Spot back on a camera-visible layer.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const LIGHT_CLASSES = Object.freeze({
  RIG:    'rig',      // global/camera-childed rig (hemi/dir/rim/ambient, headlamp trio, monster fill, avatar) — never culled [REF#VZ-00002]
  POOL:   'pool',     // scene-parked constant-count pools (aggro, muzzle, hit-burst, ped pool) — intensity-only forever [REF#VZ-00003]
  ROOM:   'room',     // room-anchored fixtures (cabaret, bar, succubus rig, poker, slot, stage, exits, ceiling lanterns, vending) [REF#VZ-00004]
  ENTITY: 'entity',   // monster-childed (pedestal, haunt) — budgeted by the pedestal loop [REF#VZ-00005]
  FX:     'fx',       // transient effects (Phase 3 folds these into a pre-added pool) [REF#VZ-00006]
});

const RING_SIZE = 64;   // count-event ring: enough for a whole play session's room transitions [REF#VZ-00007]
const INERT_SOURCE_LAYER = 31;
const DEFAULT_POINT_SLOTS = 4;   // + the one permanent avatar point = the measured healthy pt5 tuple [REF#VZ-00008]
// ── A SPOT NEEDS A SPOT SLOT (Mark GO 2026-09-01) ────────────────────────────────────────────── [REF#VZ-00008a]
//    Registration accepts SpotLights (see _maybeVirtualize) but the bank was POINT-ONLY, and the
//    slot copy moved position/color/intensity/distance/decay and nothing else — `.angle`,
//    `.penumbra` and `.target` appear NOWHERE in this file. So an eligible spot that won a slot came
//    out as an omnidirectional bulb: a theatrical key light rendered as a bare globe. `rec.sourceType`
//    already recorded 'SpotLight' and was never read once.
//    SIZED FROM A CENSUS, NOT A GUESS: of six SpotLights in the live registry, three are RIG (never
//    virtualized) and two are Starlette's layer-6 face spots (no longer virtualized at all, see
//    _maybeVirtualize). That leaves exactly ONE bank-eligible spot, so ONE slot clears the backlog.
//    Each slot is a permanent +1 to NUM_SPOT_LIGHTS in every lit shader, and this renderer is
//    fill-bound — so the default is the measured need, not a round number.
//    Knob: window._lightSpotSlots (0 disables the spot bank entirely; a spot is then never carried
//    AND never flattened into a point — it simply is not collected).
const DEFAULT_SPOT_SLOTS = 1;

export function createLightController(opts = {}) {
  const onAnomaly = opts.onAnomaly || function () {};   // (kind, detail) → ENGINE_ANOMALY {kind:'LIGHT_CTL'} [REF#VZ-00009]
  const now = opts.now || (() => performance.now());

  // Registry — Map<THREE.Light, rec>. rec is a plain object, allocated once per light at [REF#VZ-00010]
  // registration (boot / floor build / GLB load), never per frame.
  const registry = new Map();
  const byName = new Map();

  // Count-event ring — pre-allocated (the ONIBABA_STATE no-GC precedent); slots mutated in place. [REF#VZ-00011]
  const ring = [];
  for (let i = 0; i < RING_SIZE; i++) ring.push({ t: 0, count: -1, prev: -1, room: '', note: '', lights: '' });
  let ringHead = 0, ringLen = 0;

  // Last observed per-camera counted totals (Point+Spot only — the program-key movers). [REF#VZ-00012]
  const counted = { fpv: -1, topdown: -1, frames: 0, distinctFpv: new Set() };

  // Fixed renderer-collected bank. Source lights remain ordinary THREE.Light objects so all existing [REF#VZ-00013]
  // choreography can keep writing their visible/intensity/position/color properties; only their layer
  // changes. The bank reads that authored state once per Clock tick.
  let bank = null;
  const candidates = [];
  const selected = [];
  const ineligibleKept = [];   // sources the bank can never carry — left on their authored layer [REF#VZ-00014b]
  const _pointQ = [], _spotQ = [];   // per-frame routing queues, allocated once (no-GC precedent) [REF#VZ-00014d]
  let virtualizedCount = 0;
  let slotPressure = 0;
  let maxSlotPressure = 0;

  function _maybeVirtualize(light, rec) {
    if (!bank || !bank.enabled || rec.fixedSlot || rec.cls === LIGHT_CLASSES.RIG
        || !(light.isPointLight || light.isSpotLight) || rec.virtualized) return;
    const sourceMask = light.layers.mask | 0;
    rec.sourceMask = sourceMask;
    rec.bankEligible = !!(sourceMask & bank.managedCameraMask);
    rec.sourceType = light.isSpotLight ? 'SpotLight' : 'PointLight';
    // ── AN INELIGIBLE LIGHT IS LEFT EXACTLY AS AUTHORED (Mark GO 2026-09-01) ───────────────────── [REF#VZ-00014]
    //    THIS BLOCK USED TO FORCE *EVERY* SOURCE ONTO LAYER 31, INCLUDING ONES THE BANK CAN NEVER
    //    CARRY, and said so: "We still force them onto layer 31: otherwise a later layer writer could
    //    move one onto layer 0 and reopen the light-count state space." That defends a HYPOTHETICAL
    //    future writer by DEFINITELY deleting a shipped feature today.
    //    MEASURED, in the woken cabaret, standing at Starlette: `cab/face-spot-1` and `-2` — her two
    //    key lights, intensity 0.88, 0.8wu away — read `virtualized:true · bankEligible:false ·
    //    slot:-1`. They are authored on LAYER 6, her private lighting layer ("2 layer-6 spots", so
    //    only she is lit by them — layers stop spill, they do not stop cost). Layer 6 is not in any
    //    managed camera's mask, so they can never win a slot; being forced to layer 31 they could not
    //    light her either. They rendered NOTHING, while the show rig went on ramping their intensity
    //    every frame in the belief that it worked.
    //    ⚠ THIS CANNOT MOVE THE LIGHT COUNT, and that is the whole reason it is safe: "ineligible"
    //      means, by definition, that the source mask does not intersect any managed camera's mask —
    //      so the renderer was never collecting it for those cameras. Leaving it alone changes what
    //      Starlette looks like; it does not change NUM_POINT_LIGHTS / NUM_SPOT_LIGHTS by one.
    //      E15 holds. Verified live: distinct FPV counts stayed [8] across the change.
    //    ⚠ THE OLD COMMENT'S FEAR IS KEPT, AS AN OBSERVER RATHER THAN A PRE-EMPTIVE KILL. If a later
    //      writer ever moves one of these onto a managed layer, `_watchIneligible` reports it through
    //      ENGINE_ANOMALY instead of the count silently changing. Loud beats lobotomised.
    //    Restore the old behaviour: window._lightParkIneligible = true.
    if (!rec.bankEligible && window._lightParkIneligible !== true) {
      rec.virtualized = false;
      rec._slotIndex = -1;
      if (ineligibleKept.indexOf(rec) === -1) ineligibleKept.push(rec);
      return;
    }
    rec.virtualized = true;
    rec._slotIndex = -1;
    rec._world = new bank.THREE.Vector3();
    light.layers.set(INERT_SOURCE_LAYER);
    virtualizedCount++;
  }

  // The fear the old code acted on, turned into a sensor. An ineligible source that shows up on a [REF#VZ-00014a]
  // managed camera layer WOULD reopen the light-count state space — so say so, once, loudly.
  function _watchIneligible() {
    if (!bank || !bank.enabled || !ineligibleKept.length) return;
    for (const rec of ineligibleKept) {
      const light = rec.light; if (!light) continue;
      const now = (light.layers.mask | 0) & bank.managedCameraMask;
      if (now && !rec._ineligWarned) {
        rec._ineligWarned = true;
        onAnomaly('LIGHT_CTL', 'ineligible source "' + (rec.name || '(anon)') + '" moved onto a managed '
          + 'camera layer — the fixed light count can now change. Investigate the writer that moved it.');
      }
    }
  }

  function configureFixedSlots(cfg = {}) {
    if (bank) return bank;
    const THREE = cfg.THREE;
    const scene = cfg.scene;
    if (!THREE || !scene) {
      onAnomaly('LIGHT_CTL', { bad: 'fixed-slot configuration missing THREE/scene' });
      return null;
    }
    const cameras = Array.isArray(cfg.cameras) ? cfg.cameras.filter(Boolean) : [];
    let managedCameraMask = 0;
    for (const camera of cameras) managedCameraMask |= camera.layers.mask;
    const pointCount = Math.max(1, Number.isFinite(cfg.pointSlots)
      ? Math.floor(cfg.pointSlots) : DEFAULT_POINT_SLOTS);
    const spotCount = Math.max(0, Number.isFinite(cfg.spotSlots)
      ? Math.floor(cfg.spotSlots)
      : (typeof window !== 'undefined' && Number.isFinite(window._lightSpotSlots)
          ? Math.floor(window._lightSpotSlots) : DEFAULT_SPOT_SLOTS));
    bank = {
      enabled: cfg.enabled !== false,
      THREE,
      scene,
      managedCameraMask,
      pointCount,
      spotCount,
      pointSlots: [],
      spotSlots: [],
      configuredAt: now(),
    };
    if (!bank.enabled) return bank;

    for (let i = 0; i < pointCount; i++) {
      const slot = new THREE.PointLight(0xffffff, 0, 1, 2);
      slot.name = '__fixed_gameplay_light_slot_' + i;
      slot.position.set(0, -9999, 0);
      slot.visible = true;                    // invariant: never changed after construction [REF#VZ-00015]
      slot.castShadow = false;
      slot.layers.set(0);                     // all three shipped cameras include world layer 0 [REF#VZ-00016]
      slot.userData.fixedGameplayLightSlot = true;
      slot.userData.logicalEmitter = null;
      slot.userData.noCull = true;
      slot.userData.protected = true;
      scene.add(slot);
      bank.pointSlots.push(slot);
      register(slot, {
        name: 'rig/fixed-gameplay-slot-' + i,
        owner: 'light-slot-bank',
        cls: LIGHT_CLASSES.RIG,
        protected: true,
        fixedSlot: true,
      });
    }
    // ── THE SPOT BANK — same invariants as the point bank, plus the cone [REF#VZ-00016a]
    for (let i = 0; i < spotCount; i++) {
      const slot = new THREE.SpotLight(0xffffff, 0, 1, Math.PI / 6, 0.5, 2);
      slot.name = '__fixed_gameplay_spot_slot_' + i;
      slot.position.set(0, -9999, 0);
      slot.visible = true;                    // invariant: never changed after construction [REF#VZ-00049 → see REF#VZ-00015]
      slot.castShadow = false;
      slot.layers.set(0);
      slot.userData.fixedGameplayLightSlot = true;
      slot.userData.logicalEmitter = null;
      slot.userData.noCull = true;
      slot.userData.protected = true;
      // A SpotLight aims at its `target`, which must itself be in the scene graph or the cone points [REF#VZ-00016b]
      // at the origin forever. This is the half the old point-only copy could never have carried.
      slot.target = new THREE.Object3D();
      slot.target.position.set(0, -9999, 0);
      scene.add(slot.target);
      scene.add(slot);
      bank.spotSlots.push(slot);
      register(slot, {
        name: 'rig/fixed-gameplay-spot-' + i,
        owner: 'light-slot-bank',
        cls: LIGHT_CLASSES.RIG,
        protected: true,
        fixedSlot: true,
      });
    }
    for (const [light, rec] of registry.entries()) _maybeVirtualize(light, rec);
    return bank;
  }

  // Audit mode (probe-lightctl.js / winner-semantics measurement): per-instance accessor wrap on [REF#VZ-00017]
  // .visible/.intensity recording every writer with a stack. NEVER active in normal play —
  // installed only when window._lightCtlAudit === true at register time (opt-in, === true).
  const auditLog = [];
  function _auditWrap(light, rec) {
    for (const prop of ['visible', 'intensity']) {
      if (!(prop in light)) continue;
      let val = light[prop];
      try {
        Object.defineProperty(light, prop, {
          configurable: true,
          enumerable: true,
          get() { return val; },
          set(v) {
            if (v !== val && auditLog.length < 4000) {
              auditLog.push({ t: now(), name: rec.name, prop, from: val, to: v,
                stack: (new Error().stack || '').split('\n').slice(2, 5).join(' | ') });
            }
            val = v;
          },
        });
      } catch (_) { /* non-configurable → skip, never break the game for an audit */ }
    }
  }

  let neutralizedCount = 0;
  function _neutralize(light, r) {
    // Mark GO 2026-07-27 "fix the secret light": the light leaves the camera-collected set [REF#VZ-00018]
    // entirely (visible=false at BUILD/SWEEP time — before or between compiles, never per-frame,
    // so no E15 churn) and intensity 0 as belt-and-braces. The mesh look survives on emissive.
    if (r.neutralized) return;
    light.visible = false;
    light.intensity = 0;
    r.neutralized = true;
    neutralizedCount++;
  }

  function register(light, rec) {
    if (!light || !light.isLight) { onAnomaly('LIGHT_CTL', { bad: 'register non-light', rec }); return light; }
    if (registry.has(light)) return light;             // idempotent — re-registration is a no-op [REF#VZ-00019]
    const r = {
      name: rec.name || ('light#' + registry.size),
      owner: rec.owner || 'unknown',
      cls: rec.cls || LIGHT_CLASSES.FX,
      roomId: (typeof rec.roomId === 'number') ? rec.roomId : -1,
      segmentId: Number.isInteger(rec.segmentId) ? rec.segmentId : -1,
      protected: rec.protected === true,               // Mark's treasured fixtures (cabaret/show) — later phases never dim these without a choreography [REF#VZ-00020]
      slotPriority: Number.isFinite(rec.slotPriority) ? rec.slotPriority : 0,
      fixedSlot: rec.fixedSlot === true,
      glbOrigin: rec.glbOrigin === true,
      baseIntensity: (typeof light.intensity === 'number') ? light.intensity : 1,
      type: light.type || '?',
      light,
    };
    const ud = light.userData || (light.userData = {});
    if (!ud.rtag) ud.rtag = { role: 3, roleName: 'LIGHT', room: r.roomId, seg: r.segmentId,
      section: r.segmentId >= 0 ? r.segmentId + 1 : -1 };
    registry.set(light, r);
    byName.set(r.name, light);
    _maybeVirtualize(light, r);
    if (typeof window !== 'undefined' && window._lightCtlAudit === true) _auditWrap(light, r);
    return light;
  }

  // GLB auto-capture (the vending precedent, now standard): every embedded light in a loaded [REF#VZ-00021]
  // model gets registered. Registration does not touch parenting; pass { killShadows: true }
  // in a later phase to also enforce
  // L15 (frozen shadow-caster set) on capture.
  function registerGLB(root, meta = {}) {
    const found = [];
    root.traverse((o) => {
      if (o.isLight) {
        if (meta.killShadows === true) o.castShadow = false;
        register(o, { name: (meta.name || 'glb') + '/' + (o.name || o.type), owner: meta.owner || meta.name || 'glb',
          cls: meta.cls || LIGHT_CLASSES.ROOM, roomId: meta.roomId, segmentId: meta.segmentId, glbOrigin: true });
        if (meta.neutralize === true) _neutralize(o, registry.get(o));
        found.push(o);
      }
    });
    return found;
  }

  function unregister(light) {
    const r = registry.get(light);
    if (!r) return;
    byName.delete(r.name);
    registry.delete(light);
  }

  // Orphan sweep — ONE traverse, called at boot end + floor build (never per frame: the [REF#VZ-00022]
  // COPY-ALL-time-only census idiom). Any isLight not in the registry is a future churn source.
  // adoptUnder: { '<ancestorName>': {owner, cls} } — lights that attach ASYNC under an already-
  // known root (the vending machine's display-card icons are the shipped case: its MAGIC LANTERN
  // card carries a real PointLight built inside CODEX's module after our build-time capture) get
  // ADOPTED with that owner — logged in adopted[], never silent. Everything else stays an orphan.
  const adopted = [];
  function sweep(scene, opts = {}) {
    const orphans = [];
    const adoptUnder = opts.adoptUnder || null;
    const adoptMatch = opts.adoptMatch || null;   // [{when(o), owner, cls, name}] — for CLONED lights: THREE's .clone() mints a NEW light object ancestry can't identify (the MAGIC LANTERN card icon is the shipped case), but its signature can [REF#VZ-00023]
    scene.traverse((o) => {
      if (!o.isLight) return;
      const _rec = registry.get(o);
      if (_rec) {
        // Already registered — but a neutralize-by-signature policy still applies (idempotent): [REF#VZ-00024]
        // covers icon lights that attached early and got captured under another owner's registerGLB.
        if (adoptMatch && !_rec.neutralized) {
          for (const a of adoptMatch) {
            let hit = false;
            try { hit = a.neutralize === true && a.when(o, _rec) === true; } catch (_) {}
            if (hit) { _neutralize(o, _rec); break; }
          }
        }
        return;
      }
      if (adoptUnder) {
        let n = o.parent;
        while (n) {
          if (n.name && adoptUnder[n.name]) {
            const a = adoptUnder[n.name];
            register(o, { name: n.name + '/adopted-' + (o.type || 'light') + '-' + adopted.length, owner: a.owner, cls: a.cls, glbOrigin: true });
            adopted.push(n.name + ':' + (o.type || '?') + ' i=' + (o.intensity != null ? o.intensity : '?'));
            return;
          }
          n = n.parent;
        }
      }
      if (adoptMatch) {
        for (const a of adoptMatch) {
          let hit = false;
          try { hit = a.when(o, null) === true; } catch (_) {}
          if (hit) {
            register(o, { name: (a.name || 'adopted') + '-' + adopted.length, owner: a.owner, cls: a.cls });
            adopted.push((a.name || 'match') + ':' + (o.type || '?') + ' i=' + (o.intensity != null ? o.intensity : '?'));
            if (a.neutralize === true) _neutralize(o, registry.get(o));
            return;
          }
        }
      }
      let chain = ''; let a = o.parent;
      while (a) { chain += (chain ? '>' : '') + (a.name || a.type); a = a.parent; }
      orphans.push((o.name || o.type) + '@' + chain);   // full ancestor chain — adoption failures must explain themselves [REF#VZ-00025]
    });
    if (orphans.length) onAnomaly('LIGHT_CTL', { orphans: orphans.slice(0, 12), total: orphans.length });
    return orphans;
  }

  // Per-frame observe pass — registry iteration ONLY (~40 entries), no traverse, no allocation [REF#VZ-00026]
  // on the steady path. Counts Point/Spot lights each camera would actually collect
  // (L4: visible !== false AND layers.test(camera.layers)). Transient FX lights are pruned
  // lazily here when their ancestor chain no longer reaches the scene root — so their ~20
  // scene.remove sites need no unregister() calls and the registry stays bounded.
  const _prune = [];
  let detachedNonFx = 0;   // persistent-class lights whose chain no longer reaches the scene — a bug tell, surfaced in diag, never auto-dropped [REF#VZ-00027]
  let sectionSuppressed = 0;
  let roomSuppressed = 0;
  let unresolvedRoomLights = 0;

  function _restorePolicyState(light, rec) {
    if (rec._policySuppressed) {
      light.visible = rec._visibleBeforePolicy === true;
      rec._policySuppressed = false;
      delete rec._visibleBeforePolicy;
    }
  }

  function _applyRoomPolicy(light, rec, ctx) {
    if (rec.cls !== LIGHT_CLASSES.ROOM || rec.neutralized) return;
    if (ctx.sectionCull === false) { _restorePolicyState(light, rec); return; }

    if ((rec.roomId < 0 || rec.segmentId < 0) && typeof ctx.resolveLight === 'function') {
      try {
        const resolved = ctx.resolveLight(light, rec) || {};
        if (rec.roomId < 0 && typeof resolved.roomId === 'number') rec.roomId = resolved.roomId;
        if (rec.segmentId < 0 && Number.isInteger(resolved.segmentId)) rec.segmentId = resolved.segmentId;
      } catch (_) {}
    }
    if (rec.segmentId < 0 && rec.roomId >= 0 && typeof ctx.segmentOfRoom === 'function') {
      try {
        const id = ctx.segmentOfRoom(rec.roomId);
        if (Number.isInteger(id)) rec.segmentId = id;
      } catch (_) {}
    }
    const tag = light.userData && light.userData.rtag;
    if (tag) {
      tag.room = rec.roomId;
      tag.seg = rec.segmentId;
      tag.section = rec.segmentId >= 0 ? rec.segmentId + 1 : -1;
    }

    const live = rec.segmentId < 0 || (typeof ctx.isSegmentLive !== 'function') || ctx.isSegmentLive(rec.segmentId);
    let tier = live ? 2 : 0;
    if (rec.roomId >= 0 && typeof ctx.tierOfRoom === 'function') {
      try { tier = ctx.tierOfRoom(rec.roomId); } catch (_) {}
    }
    // ROOMS ARE DARK UNTIL ENTERED, THEN 20% (Mark 2026-09-24: "all rooms are dark until player walks into them, then they [REF#VZ-00053]
    // have 20% illumination and no shadows"). The engine's ctx.roomIllum(roomId) answers 0 (never entered) / 0.2 (entered)
    // / 1 (rule off): 0 suppresses the source like an irrelevant tier, the fraction scales its slot in _fill. [REF#PENDING]
    const illum = (typeof ctx.roomIllum === 'function' && rec.roomId >= 0) ? ctx.roomIllum(rec.roomId) : 1;
    rec._roomIllum = Number.isFinite(illum) ? illum : 1;
    const relevant = live && tier >= 2 && rec._roomIllum > 0;
    if (!relevant) {
      if (!rec._policySuppressed) {
        rec._visibleBeforePolicy = light.visible !== false;
        rec._policySuppressed = true;
      } else if (light.visible !== false) {
        // A choreography writer ran before this authority tick. Preserve its newest intent, then [REF#VZ-00028]
        // suppress again; re-entry restores current authored state instead of stale boot state.
        rec._visibleBeforePolicy = true;
      }
      light.visible = false;
      if (!live) sectionSuppressed++;
      else roomSuppressed++;
    } else if (rec._policySuppressed) {
      light.visible = rec._visibleBeforePolicy === true;
      rec._policySuppressed = false;
      delete rec._visibleBeforePolicy;
    }
    if (rec.roomId < 0 && rec.segmentId < 0) unresolvedRoomLights++;
  }

  // Match WebGLRenderer's ancestor-visible rule. Reading light.visible alone misses a light whose [REF#VZ-00029]
  // DECOR parent was culled, which was the exact attribution blind spot in the old instrument.
  function _hierarchyVisible(light, root) {
    let n = light;
    while (n) {
      if (n.visible === false) return false;
      if (n === root || n.isCamera) return true;
      n = n.parent;
    }
    return root == null;
  }

  function _candidateOrder(a, b) {
    // Protected authored fixtures win ties, then stronger/nearer emitters. This is deliberately [REF#VZ-00030]
    // world-state only — never FPS/renderStress — and is stable for identical scene state.
    return (a._slotScore - b._slotScore) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
  }

  function _takeCandidates(wantRoom, limit, frameMark) {
    let taken = 0;
    for (let i = 0; i < candidates.length && taken < limit; i++) {
      const rec = candidates[i];
      if (rec._selectedFrame === frameMark) continue;
      if ((rec.cls === LIGHT_CLASSES.ROOM) !== wantRoom) continue;
      rec._selectedFrame = frameMark;
      selected.push(rec);
      taken++;
    }
  }

  function _driveFixedBank(ctx) {
    if (!bank || !bank.enabled) return;
    const pSlots = bank.pointSlots, sSlots = bank.spotSlots || [];
    const capacity = pSlots.length + sSlots.length;
    const frameMark = counted.frames + 1;
    selected.length = 0;
    candidates.sort(_candidateOrder);

    // Taxonomy budget: retain room readability and combat readability independently. Empty capacity [REF#VZ-00031]
    // is then shared, so an idle room can use all four slots and a light-heavy fight can do the same.
    // Selection runs over the COMBINED capacity (points + spots); routing by type happens below.
    const roomReserve = Math.min(2, capacity);
    _takeCandidates(true, roomReserve, frameMark);
    _takeCandidates(false, Math.min(2, capacity - selected.length), frameMark);
    for (let i = 0; i < candidates.length && selected.length < capacity; i++) {
      const rec = candidates[i];
      if (rec._selectedFrame === frameMark) continue;
      rec._selectedFrame = frameMark;
      selected.push(rec);
    }

    slotPressure = Math.max(0, candidates.length - capacity);
    if (slotPressure > maxSlotPressure) maxSlotPressure = slotPressure;

    // ── ROUTE BY SOURCE TYPE. A spot goes in a spot slot or nowhere — never into a point slot, [REF#VZ-00031a]
    //    which is what turned a stage key light into a bare bulb (Mark GO 2026-09-01).
    _pointQ.length = 0; _spotQ.length = 0;
    for (const rec of selected) {
      if (rec.sourceType === 'SpotLight') { if (_spotQ.length < sSlots.length) _spotQ.push(rec); }
      else if (_pointQ.length < pSlots.length) _pointQ.push(rec);
    }
    // A spot that found no spot slot leaves point capacity free for a point that can use it. [REF#VZ-00052]
    for (const rec of selected) {
      if (rec.sourceType === 'SpotLight') continue;
      if (_pointQ.indexOf(rec) === -1 && _pointQ.length < pSlots.length) _pointQ.push(rec);
    }

    const _fill = (slot, rec, isSpot) => {
      slot.visible = true;
      slot.layers.set(0);
      slot.castShadow = false;
      if (!rec) {
        slot.intensity = 0;
        slot.position.set(0, -9999, 0);
        if (isSpot && slot.target) slot.target.position.set(0, -9999, 0);
        slot.userData.logicalEmitter = null;
        return;
      }
      const source = rec.light;
      slot.position.copy(rec._world);
      if (source.color) slot.color.copy(source.color);
      slot.intensity = (Number.isFinite(source.intensity) ? Math.max(0, source.intensity) : 0)
        * ((rec.cls === LIGHT_CLASSES.ROOM && Number.isFinite(rec._roomIllum)) ? rec._roomIllum : 1);   // entered-room fraction (Mark 2026-09-24) [REF#PENDING] [REF#VZ-00054]
      slot.distance = Number.isFinite(source.distance) ? Math.max(0, source.distance) : 0;
      slot.decay = Number.isFinite(source.decay) ? Math.max(0, source.decay) : 2;
      if (isSpot) {
        // THE CONE — the half that never existed. Without angle/penumbra/target a SpotLight is just [REF#VZ-00031b]
        // an expensive PointLight.
        if (Number.isFinite(source.angle)) slot.angle = source.angle;
        if (Number.isFinite(source.penumbra)) slot.penumbra = source.penumbra;
        if (slot.target) {
          if (source.target) source.target.getWorldPosition(slot.target.position);
          else slot.target.position.set(rec._world.x, rec._world.y - 1, rec._world.z);
          slot.target.updateMatrixWorld();
        }
      }
      slot.userData.logicalEmitter = rec.name;
    };

    for (let i = 0; i < pSlots.length; i++) { _fill(pSlots[i], _pointQ[i] || null, false);
      if (_pointQ[i]) _pointQ[i]._slotIndex = i; }
    for (let i = 0; i < sSlots.length; i++) { _fill(sSlots[i], _spotQ[i] || null, true);
      if (_spotQ[i]) _spotQ[i]._slotIndex = i; }
  }

  function tick(ctx) {
    let fpv = 0, td = 0;
    let changed = null;
    detachedNonFx = 0;
    sectionSuppressed = 0;
    roomSuppressed = 0;
    unresolvedRoomLights = 0;
    candidates.length = 0;
    const fpvMask = ctx.fpvMask | 0, tdMask = ctx.tdMask | 0, root = ctx.sceneRoot || null;
    for (const [light, rec] of registry.entries()) {
      // Restore our own suppression before reading this frame's emitter values. [REF#VZ-00056]
      if (rec._portalMuted) {
        if (light.intensity === 0) light.intensity = rec._portalIntensity;
        rec._portalMuted = false;
      }
      let attached = true;
      if (root) {
        let n = light;
        while (n.parent) n = n.parent;
        if (n !== root && !n.isCamera) {   // camera-childed rig lights top out at the camera — keep those [REF#VZ-00032]
          attached = false;
          if (rec.cls === LIGHT_CLASSES.FX) _prune.push(light);   // one-shot FX removed from scene → lazy unregister (their ~20 removal sites need no edits) [REF#VZ-00033]
          else detachedNonFx++;   // async GLB builds may look detached for a frame — observe, don't drop [REF#VZ-00034]
        }
      }
      if (attached) _applyRoomPolicy(light, rec, ctx);
      const hasPortalRoom = Number.isInteger(ctx.portalRoom) && ctx.portalRoom >= 0;
      const portalOnly = hasPortalRoom && ctx.playerRoom === ctx.portalRoom;
      const otherPortalFixture = hasPortalRoom && rec.cls === LIGHT_CLASSES.ROOM && rec.roomId === ctx.portalRoom && rec.owner !== 'secret-portal';
      if (!rec.fixedSlot && rec.owner !== 'secret-portal' && (portalOnly || otherPortalFixture)) {
        rec._portalIntensity = light.intensity;
        rec._portalMuted = true;
        light.intensity = 0;
      }
      if (rec.virtualized) {
        rec._slotIndex = -1;
        // No gameplay writer may put a source back into the collected set. Its authored visibility [REF#VZ-00035]
        // remains intact and is read below; only its renderer layer is owned here.
        light.layers.set(INERT_SOURCE_LAYER);
        if (rec.bankEligible && attached && _hierarchyVisible(light, root)
            && Number.isFinite(light.intensity) && light.intensity > 0.0001) {
          try {
            light.getWorldPosition(rec._world);
            const dx = rec._world.x - (Number.isFinite(ctx.playerX) ? ctx.playerX : 0);
            const dz = rec._world.z - (Number.isFinite(ctx.playerZ) ? ctx.playerZ : 0);
            // ── BRIGHTNESS HAS TO BE ABLE TO BEAT PROXIMITY (Mark GO 2026-09-01) ───────────────── [REF#VZ-00036a]
            //    OLD: `dx*dx + dz*dz - strength*0.25`, ascending. Distance-SQUARED reaches 144 at 12wu
            //    while brightness contributes AT MOST 12.5 (intensity clamped to 50, times 0.25) — so
            //    it was nearest-wins with a rounding error of brightness on top. A stage key light
            //    10wu away lost to a guttering candle 3wu away, every time.
            //    NOW: pick by INFLUENCE — what the light actually contributes where the player stands.
            //      influence = intensity · reach² / (1 + d²)
            //    `reach` folds in the light's OWN falloff radius: a lantern with distance 6 seen from
            //    8wu contributes nothing and should not hold a slot that a light in range wants. That
            //    is not a heuristic, it is the light's authored range being respected.
            //    Score stays ASCENDING (lower = better) so `protected`'s −1000 still dominates and
            //    _candidateOrder is untouched.
            //    Old behaviour: window._lightScoreMode = 'distance'.
            const _d2 = dx * dx + dz * dz;
            if (window._lightScoreMode === 'distance') {
              const strength = Math.min(50, Math.max(0, light.intensity));
              rec._slotScore = _d2 - strength * 0.25 - (rec.protected ? 1000 : 0) - rec.slotPriority;
            } else {
              const _str = Math.max(0, light.intensity);
              const _range = (Number.isFinite(light.distance) && light.distance > 0) ? light.distance : 0;
              const _reach = _range > 0 ? Math.max(0, 1 - Math.sqrt(_d2) / _range) : 1;
              const _influence = _str * _reach * _reach / (1 + _d2);
              rec._slotScore = -_influence - (rec.protected ? 1000 : 0) - rec.slotPriority;
            }
            candidates.push(rec);
          } catch (_) {}
        }
      }
    }
    _driveFixedBank(ctx);
    _watchIneligible();   // the old pre-emptive kill, replaced by an observer [REF#VZ-00014c]

    // Count only after the bank has been driven. This is the exact set WebGLRenderer will collect. [REF#VZ-00036]
    for (const [light, rec] of registry.entries()) {
      let attached = true;
      if (root) {
        let n = light;
        while (n.parent) n = n.parent;
        attached = n === root || n.isCamera;
      }
      const countedLight = attached && (light.isPointLight || light.isSpotLight) && _hierarchyVisible(light, root);
      const m = countedLight ? light.layers.mask : 0;
      const inFpv = !!(m & fpvMask);
      if (inFpv) fpv++;
      if (m & tdMask) td++;
      if (inFpv !== (rec._countedFpv === true)) {
        if (!changed) changed = [];
        changed.push((inFpv ? '+' : '-') + rec.name);
        rec._countedFpv = inFpv;
      }
    }
    while (_prune.length) unregister(_prune.pop());
    counted.frames++;
    if (fpv !== counted.fpv) {
      const slot = ring[ringHead];
      slot.t = now(); slot.count = fpv; slot.prev = counted.fpv;
      slot.room = String(ctx.playerRoom !== undefined ? ctx.playerRoom : '?');
      slot.note = counted.fpv === -1 ? 'boot' : '';
      slot.lights = changed ? changed.slice(0, 12).join(' · ') : '(count changed without a registry membership delta)';
      ringHead = (ringHead + 1) % RING_SIZE; if (ringLen < RING_SIZE) ringLen++;
      counted.fpv = fpv;
      counted.distinctFpv.add(fpv);
    }
    counted.topdown = td;
  }

  function state() {
    const perClass = {}; const perRoom = {};
    for (const r of registry.values()) {
      perClass[r.cls] = (perClass[r.cls] || 0) + 1;
      if (r.cls === LIGHT_CLASSES.ROOM) perRoom[r.roomId] = (perRoom[r.roomId] || 0) + 1;
    }
    const events = [];
    for (let i = 0; i < ringLen; i++) events.push(ring[(ringHead - ringLen + i + RING_SIZE) % RING_SIZE]);
    const slotEmitters = bank && bank.enabled
      ? bank.pointSlots.map(slot => slot.userData.logicalEmitter || '(parked)') : [];
    return { phase: bank && bank.enabled ? 'fixed-bank' : 1, registered: registry.size, perClass, perRoom,
      countedFpv: counted.fpv, countedTopdown: counted.topdown, frames: counted.frames,
      distinctFpvCounts: Array.from(counted.distinctFpv).sort((a, b) => a - b), sectionSuppressed,
      roomSuppressed, unresolvedRoomLights, events, auditEntries: auditLog.length, detachedNonFx,
      adopted: adopted.slice(), neutralized: neutralizedCount, virtualized: virtualizedCount,
      fixedPointSlots: bank && bank.enabled ? bank.pointSlots.length : 0,
      fixedSpotSlots: bank && bank.enabled ? (bank.spotSlots || []).length : 0,
      spotEmitters: bank && bank.enabled
        ? (bank.spotSlots || []).map(slot => slot.userData.logicalEmitter || '(parked)') : [],
      activeCandidates: candidates.length, slotPressure, maxSlotPressure, slotEmitters,
      ineligibleKept: ineligibleKept.map(r => ({ name: r.name, type: r.sourceType, cls: r.cls })) };
  }

  function diag() {
    const s = state();
    const L = [];
    L.push('── LIGHT CTL (fixed collection · section + room taxonomy) ──');
    L.push(`registered: ${s.registered}  by class: ` + Object.entries(s.perClass).map(([k, v]) => `${k}:${v}`).join(' '));
    L.push(`counted now  FPV(point/spot): ${s.countedFpv}   topdown: ${s.countedTopdown}   frames: ${s.frames}`);
    L.push(`fixed bank  slots:${s.fixedPointSlots}  virtualized sources:${s.virtualized}  active candidates:${s.activeCandidates}  overflow now/max:${s.slotPressure}/${s.maxSlotPressure}`);
    if (s.slotEmitters.length) L.push(`point slot emitters: ${s.slotEmitters.join(' · ')}`);
    if (s.fixedSpotSlots) L.push(`spot  slot emitters: ${s.spotEmitters.join(' · ')}  (${s.fixedSpotSlots} slot(s); window._lightSpotSlots)`);
    L.push(`policy now  section-suppressed:${s.sectionSuppressed}  room-suppressed:${s.roomSuppressed}  unresolved-room:${s.unresolvedRoomLights}`);
    L.push(`distinct FPV counts this session: [${s.distinctFpvCounts.join(', ')}]  ← every distinct value = a program rung (E15)`);
    const ev = s.events.slice(-10);
    L.push(`count changes (last ${ev.length}/${s.events.length}):`);
    for (const e of ev) L.push(`  t+${(e.t / 1000).toFixed(1)}s  ${e.prev}→${e.count}  room:${e.room}${e.note ? '  ' + e.note : ''}${e.lights ? '  [' + e.lights + ']' : ''}`);
    const rooms = Object.entries(s.perRoom).sort((a, b) => a[0] - b[0]).map(([k, v]) => `r${k}:${v}`).join(' ');
    if (rooms) L.push(`room-class lights by room: ${rooms}`);
    if (s.adopted.length) L.push(`adopted at sweep (async-attached under known roots): ${s.adopted.join(' · ')}`);
    if (s.ineligibleKept && s.ineligibleKept.length) {
      // FIX 4 (Mark GO 2026-09-01): a light the bank can never carry used to be parked SILENTLY. Now [REF#VZ-00043]
      // it keeps its authored layer AND says so, so "why is that light dead?" is a one-line answer.
      L.push(`private-layer sources (kept as authored, never bank-carried): ${s.ineligibleKept.length} — `
        + s.ineligibleKept.map(x => `${x.name}[${x.type}]`).join(' · '));
    }
    if (s.neutralized) L.push(`neutralized: ${s.neutralized} lantern-icon light(s) (Mark 07-27 "fix the secret light" — restore: window._lanternIconLight=true + reload)`);
    if (s.detachedNonFx) L.push(`⚠ ${s.detachedNonFx} persistent-class light(s) detached from scene — investigate (never auto-dropped)`);
    if (s.auditEntries) L.push(`⚠ audit mode captured ${s.auditEntries} writer events (window._lightCtl.auditLog)`);
    return L.join('\n');
  }

  return { configureFixedSlots, register, registerGLB, unregister, sweep, tick, state, diag, auditLog,
    _registry: registry, _byName: byName };
}
