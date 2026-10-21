/** [REF#AI-00108]
 * ════════════════════════════════════════════════════════════════════════════
 *  ENGINE ADAPTER  —  bridges MonsterAIConstructor ↔ NewOrigami.Engine9.html
 *  Worker 1 · 2026-06-12 · companion to knowledge/AI_REBUILD_01_ADAPTER_SPEC.md
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This is the ONLY file that knows Engine8 internals. The AI constructor stays
 *  engine-agnostic; swap this adapter to retarget the AI at another engine/test rig.
 *
 *  ISOLATION: imported by nothing yet. A monster "ref" here is the live wrapper `w`
 *  (an element of `monsterWrappers`, Engine8:5146); `ud = w.userData`.
 *
 *  SEAMS marked TODO(wire) need a tiny Engine8 change (extract an inline block into a
 *  named function). Each seam cites the exact site. Do these as part of Phase-1 wiring.
 * ════════════════════════════════════════════════════════════════════════════
 */
'use strict';

/** [REF#AI-00109]
 * @param {object} engine  references injected from Engine8 module scope:
 *   { GRID, AStar, _canMonsterStand, _hasLineOfSight, _monSetAnim, monsterAttack }
 *   Passed in (not imported) because Engine8 is a monolithic <script type="module">.
 */
export function makeEngine8Adapter(engine) {
  const { GRID, AStar, _canMonsterStand, _monSetAnim, _hasLineOfSight, _monBackOffOnBlock } = engine;

  return {
    attackRange: 2 * GRID,

    // — identity / state (read the ud blob; Engine8 buildMonsterEntity:7467) — [REF#AI-00110]
    getModel(w) {
      const ud = w.userData;
      // POOLED (Mark 2026-07-12 sputter hunt): mint-once, mutate-in-place. getModel ran EVERY frame per agent [REF#AI-00111]
      // (constructor _intentFor) → a fresh object + personality-fallback {} each call = a steady GC sawtooth that
      // reads as micro-stutter, and it grew with the P4 idle-life population. The model is consumed within the
      // SAME tick (advertise/score/intent) and never compared across frames, so reusing the object is behavior-
      // identical. Zero per-frame allocation now.
      const m = ud._aiModel || (ud._aiModel = { id: ud.id, roomId: 0, hpFrac: 1, personality: null, isImp: false });
      m.id = ud.id;
      m.roomId = ud.aiRoomId;
      m.hpFrac = (ud.hp ?? ud.maxHp ?? 1) / (ud.maxHp || 1);
      m.personality = ud.personality || m._emptyPersonality || (m._emptyPersonality = {});   // stable empty fallback, no per-frame {} [REF#AI-00112]
      m.isImp = !!ud.isImp;
      m.recent = ud._aiRecent || (ud._aiRecent = []);   // v3 SATIATION ring surfaced BY REFERENCE (zero-alloc; the brain reads/pushes it) [REF#AI-00113]
      return m;
    },

    // — transform reads — [REF#AI-00114]
    getPosition(w) { return { x: w.position.x, z: w.position.z }; },
    getYaw(w)      { return (w.userData.monBase ? w.userData.monBase.rotation.y : w.rotation.y); },

    // — transform writes: THE single rotation writer in the new world — [REF#AI-00115]
    // (replaces the 5 scattered writers documented in MONSTER_AI_RESEARCH_DISCOVERY §2)
    setYaw(w, yaw) {
      if (w.userData.monBase) w.userData.monBase.rotation.y = yaw;
      w.rotation.y = yaw;
    },

    // — v3.1 GESTURE POSE (Mark 2026-07-12 "more realism"): a bounded lean/sit/warm/lookup applied to the [REF#AI-00116]
    // INNER MODEL node (w.children[0]) — NEVER monBase (that's the deleted disc-wobble). Eased in/out; reverts to
    // the captured base pose when `pose` is null. Returns true while still off-base so the controller keeps easing.
    // Only ever called for _AI_V3 smart-object monsters mid-scene (default OFF), so zero cost in default play.
    setPose(w, pose){
      const ud = w.userData;
      const node = ud._poseNode || (ud._poseNode = (w.children && w.children[0]) || null);
      if (!node) return false;
      if (!ud._poseBase) ud._poseBase = { rx: node.rotation.x, y: node.position.y };
      // 'laugh' (Sims v2 §4.7 VISIT, MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §3 adapter row): a small [REF#AI-00172]
      // head-back lift the VISIT intent pulses on/off every 0.35 s for two seconds — the laugh-bounce. Same eased
      // inner-node write as the four v3.1 poses; never monBase; no clip, no light, no allocation.
      const P = ({ lean:{rx:0.28,dy:0}, sit:{rx:0.14,dy:-0.26}, warm:{rx:0.20,dy:0}, lookup:{rx:-0.28,dy:0}, laugh:{rx:-0.12,dy:0.10} })[pose] || { rx:0, dy:0 };
      const tRx = ud._poseBase.rx + P.rx, tY = ud._poseBase.y + P.dy;
      node.rotation.x += (tRx - node.rotation.x) * 0.12;   // ease toward the pose (or back to base when pose=null) [REF#AI-00117]
      node.position.y += (tY - node.position.y) * 0.12;
      return Math.abs(node.rotation.x - ud._poseBase.rx) > 0.005 || Math.abs(node.position.y - ud._poseBase.y) > 0.003;
    },

    // — animation: semantic clip name → engine's clip system (Engine8 _monSetAnim) — [REF#AI-00118]
    // USER ANIM MAP NOTE (Mark 2026-07-12): _monSetAnim consults the guidebook's per-monster animation map
    // (walk/attack/hit/random — localStorage 'wg_monster_anim_map'). When a type lists MULTIPLE clips the engine
    // RANDOMIZES per play and NEVER repeats the same clip twice in a row. v2 needs no changes: every v2 anim
    // flows through this seam, so mapped clips apply to v2-owned monsters automatically. Do NOT bypass
    // _monSetAnim with direct mixer.clipAction calls from v2 — that would skip the map.
    // v2 re-issues its clip EVERY frame (constructor ~:137). _monSetAnim lets attack→attack re-trigger on purpose (each performed swing
    // replays the clip), so a per-frame 'attack' restarted the swing at frame 0 every frame: MEASURED 2026-09-26, 245 resets in 6 s on the
    // Manager, attack@0.00 held — a frozen first frame, never a swing (Mark: "not attacking … not walking animation or swing animation").
    // A swing is started ONLY by monsterAttack when a blow is performed; v2's 'attack' request leaves an in-flight swing alone and otherwise
    // shows the ready stance ('idle') — e.g. while the response gate holds his next blow. Back: window._v2AttackClipRetrigger = true.
    setClip(w, name) {
      const ud = w.userData;
      if (name === 'attack' && window._v2AttackClipRetrigger !== true) { if (ud._animKey !== 'attack') _monSetAnim(ud, 'idle'); return; }
      _monSetAnim(ud, name);
    },

    // — movement: reuse the EXISTING A* + per-axis wall-slide pattern (Engine8:~13700) — [REF#AI-00119]
    // Returns the actual delta moved so the controller can derive walk/idle.
    steerToward(w, target, speed, dt) {
      const ud = w.userData, mb = ud.monBase || w;

      // ── SHARED DETOUR CHANNEL (_evadeDx/_evadeDz/_evadeTimer) — Mark 2026-07-18 ──────────────────── [REF#AI-00120]
      // This is the engine's ONE steering-override contract: several systems write it (the collision
      // back-off rule _monBackOffOnBlock, the melee sidestep ~27151, peer separation ~27161) and the
      // legacy movers read it (~28074, ~28510) to steer at a detour heading for ~1.8s instead of at
      // the real target. v2 previously IGNORED it, so a v2-owned monster took the physical back-off but
      // then re-pathed straight back into the same wall — the "conflict with the v2 retreat". Now both
      // movers honor the same channel, so the rule has ONE definition and ONE consumer contract.
      //
      // v2 must run the countdown ITSELF: legacy decrements _evadeTimer at ~27352, which sits AFTER
      // `if (ud._aiOwned) continue;` (~27338) — v2-owned monsters never reach it. Without this a v2
      // monster that ever picked up an evade would detour forever.
      if (ud._evadeTimer > 0) {
        ud._evadeTimer -= dt;
        const edx = ud._evadeDx, edz = ud._evadeDz;
        if (ud._evadeTimer > 0 && (edx || edz)) {
          // Steer at a point out along the detour heading (same 5-unit lead legacy uses at ~28511) so [REF#AI-00121]
          // A* plans AROUND the obstruction rather than back through it.
          target = { x: mb.position.x + edx * 5, z: mb.position.z + edz * 5 };
        } else {
          ud._evadeTimer = 0;   // expired → fall through to the real target this same frame (no dead beat) [REF#AI-00122]
        }
      }

      const sgx = Math.round(mb.position.x / GRID), sgz = Math.round(mb.position.z / GRID);
      const tgx = Math.round(target.x / GRID),       tgz = Math.round(target.z / GRID);

      // (Re)plan a path on a TIME-ONLY beat (~0.6s). Mark 2026-07-12 "combat lagging again": the old gate had a [REF#AI-00123]
      // `!ud._aiPath ||` shortcut — when a monster boxed in (line ~86 nulls _aiPath) the null re-ran full A* EVERY
      // FRAME per boxed-in monster, and combat crowds/encircles box monsters in constantly → per-frame A* burst = the
      // lag. This is the documented A*-null-path-replan-burst trap (legacy fixed in 9fceb85). Gate on TIME ONLY: a
      // boxed-in monster waits the 0.6s beat before its next (single) replan. First call: _aiPathStamp undefined → 0 →
      // (now - 0) > 0.6 is true in combat (perf.now is seconds since load) → plans immediately. Stamp is reset on box-in
      // below so the backoff starts from the box-in, never a burst.
      if ((performance.now() * 0.001 - (ud._aiPathStamp || 0)) > (ud._aiReplanBeat || 0.6)) {
        // GLOBAL PER-FRAME REPLAN BUDGET (Mark 2026-07-12 "sputter and stall again" — workflow-ranked #1 cause). [REF#AI-00124]
        // Per-monster this gate is already TIME-ONLY safe, BUT nothing capped how many monsters replan the SAME
        // frame — K monsters whose 0.6s beats align = K simultaneous A* calls = the intermittent hitch (worse in
        // combat, when P4 noise sends peaceful monsters pathing cross-room to a far shot/death). This is WORK-
        // SPREADING, NOT a throttle: CPU-side AI only, no frame cap / DPR / render-skip. A monster over budget
        // this frame keeps its current path and its stamp is NOT advanced, so it replans next frame (≤16ms late,
        // imperceptible) — every monster keeps its full 0.6s rate; only same-frame collisions spill. Budget resets
        // once per frame in the engine loop (window._aiReplanBudget). Knob: window._aiReplanPerFrame (default 3).
        const _rb = window._aiReplanBudget;
        if (!_rb || _rb.n < (window._aiReplanPerFrame ?? 3)) {
          if (_rb) _rb.n++;
          // ── V2 PATH TIMING (Mark 2026-08-01 "fix fps") ──────────────────────────────────────── [REF#AI-00125]
          // v2's tick runs in the main loop OUTSIDE tickMonsterAI, so this AStar was invisible to
          // _avgPathfindTime — its cost surfaced only as "unaccounted" main-thread stall in COPY-ALL.
          // Accumulate into window._v2PathStats so the bucket can never hide again.
          const _pt0 = performance.now();
          ud._aiPath = AStar(sgx, sgz, tgx, tgz, ud);   // ud still carries the mover identity the planner reads [REF#AI-00126]
          const _ptMs = performance.now() - _pt0;
          const _ps = window._v2PathStats || (window._v2PathStats = { ms: 0, calls: 0, fails: 0, worstMs: 0 });
          _ps.ms += _ptMs; _ps.calls++; if (!ud._aiPath) _ps.fails++; if (_ptMs > _ps.worstMs) _ps.worstMs = _ptMs;
          ud._aiPathIdx = 1;
          ud._aiPathStamp = performance.now() * 0.001;
          // ── FAILURE BACKOFF (Mark 2026-08-01 "fix fps") ─────────────────────────────────────── [REF#AI-00127]
          // A failed plan against the SAME goal room will fail again next beat — and failed floods
          // are the most expensive A* calls. Escalate this monster's replan beat 0.6→1.2→2.4→3.0s
          // on consecutive failures; reset on success or when the goal moves to another room. This
          // is CPU-side AI work-spreading (fewer wasted searches), NOT a render throttle: no frame
          // cap, no DPR, no render-skip, and chase resumes at full 0.6s cadence the moment a plan
          // succeeds or the target becomes reachable. Knob: window._aiFailBeatMax (default 3.0).
          const _gt = (window.map && window.map[tgx]) ? window.map[tgx][tgz] : null;   // Engine9 exposes window.map (:60258); bare `map` is not in this module's scope [REF#AI-00128]
          const _goalKey = (_gt && Number.isInteger(_gt.roomId)) ? ('r' + _gt.roomId) : (tgx + ',' + tgz);
          if (!ud._aiPath) {
            ud._aiFailStreak = (ud._aiGoalKey === _goalKey) ? (ud._aiFailStreak || 0) + 1 : 1;
            ud._aiReplanBeat = Math.min((window._aiFailBeatMax ?? 3.0), 0.6 * Math.pow(2, ud._aiFailStreak - 1));
          } else {
            ud._aiFailStreak = 0;
            ud._aiReplanBeat = 0.6;
          }
          ud._aiGoalKey = _goalKey;
        }
      }
      // WHY-ZERO TRACER (Mark 2026-07-18 "1 tile every 10 seconds", hostile + outside cabaret). Every early [REF#AI-00129]
      // return below yields NO motion for that frame. At ~0.2wu/s observed vs 3.5wu/s commanded, ~94% of
      // frames must be returning zero — this names WHICH branch is eating them. Counters only; read in
      // COPY-ALL via _meleeDiag. Cost is one integer increment.
      const _why = (r) => { try { const S = window._meleeStat; if (S){ S.v2zero = (S.v2zero||0)+1; S.v2zeroBy = S.v2zeroBy||{}; S.v2zeroBy[r] = (S.v2zeroBy[r]||0)+1; } } catch(_){} return { dx: 0, dz: 0 }; };

      // DIRECT-STEP FALLBACK — THE GOBLIN CRAWL FIX (Mark 2026-07-18 "goblins move 1-tile every 10-15 seconds"). [REF#AI-00130]
      // Without this, ANY frame with no usable path returned {0,0}: the monster simply stood still. A* commonly
      // yields nothing for a chaser — the goal is the PLAYER'S OWN TILE (or an encircle slot) which is occupied
      // or unwalkable for monsters — and the replan only retries on a 0.6s beat, so the failure persists. The
      // net effect was a hostile that never moved under its own power; the ONLY thing relocating it was the 3s
      // stuck-watchdog force-move, i.e. exactly one tile every several seconds. Mark's own diag showed it:
      // "stuck-watchdog fires: 4  move:3".
      // Legacy never had this problem because its chase falls back to a straight bee-line at the player. v2 now
      // does the same: no path → step DIRECTLY toward the target with the identical 3-try collision pattern
      // (direct, then each axis). Pathfinding remains preferred; this is only the floor. Off: window._v2DirectFallback=false.
      const path = ud._aiPath;
      const _noLeg = !path || ud._aiPathIdx >= path.length;
      // ⛔ SUPERSEDED 2026-09-25 by Mark: "monsters running into stuff" + his Oni-Baba log — six hostiles, every one [REF#PENDING] [REF#AI-00203]
      //    los=n, three of them on ADJACENT tiles (38,54 / 38,55 / 38,56), each one reported stuck and ejected, over and
      //    over. THE BEE-LINE IS THE PILE-UP. A* returns null for a whole class of goals that are unreachable BY RULE, not
      //    by geometry — goal in a wall, a barred cabaret door, and every room-1 goal for a non-cabaret mover
      //    (PathFinder.js _room1FastFail). The floor below then walked the body STRAIGHT AT THE TARGET regardless of what
      //    stood between them, and its two axis-slides ground it sideways along the wall face into the nearest corner.
      //    Peers stacked up behind it, the separation resolver shoved them into the pane, and the 09-25 eject pass spent
      //    its time scraping bodies off a wall they were being driven back into on the next frame.
      //    A bee-line is a shortcut for "I can see where I am going". It is now gated on exactly that: the straight
      //    segment must be CLEAR. When it is not, this returns nopath and the FSM does its own sane thing — SEARCHING
      //    toward the last-known spot, or RETURNING — instead of bulldozing. The final step is exempt (< 0.75 tile) so a
      //    body can still close the last inch onto a target standing in a doorway.
      //    Off: window._v2BeelineNeedsSight = false (bulldoze again). Whole fallback off: window._v2DirectFallback = false.
      if (_noLeg && window._v2DirectFallback !== false) {
        const ddx = target.x - mb.position.x, ddz = target.z - mb.position.z;
        const dlen = Math.hypot(ddx, ddz);
        const _visionClear = (dlen <= GRID * 0.75)
          || window._v2BeelineNeedsSight === false
          || (typeof _hasLineOfSight !== 'function')
          || _hasLineOfSight(mb.position.x, mb.position.z, target.x, target.z);
        // BODY EYES (Mark 2026-10-10): visual LOS is necessary but not sufficient for a chase fallback. [REF#AI-00204]
        // A monster can see over/through low set pieces that its body cannot cross, so the old LOS-only fallback
        // drove it into that collider every frame whenever A* had no leg. Sample the SAME live body oracle used by
        // movement along the corridor, stopping 0.75 tile short so the occupied combat target is not mistaken for
        // scenery. Cache for 200ms per goal: this is a recovery path, not per-frame pathfinding.
        let _bodyClear = true;
        if (_visionClear && dlen > GRID * 0.75 && window._v2BodyEyes !== false) {
          const _bk = tgx + ',' + tgz, _bt = performance.now();
          if (ud._bodyEyeKey === _bk && (_bt - (ud._bodyEyeAt || 0)) < 200) {
            _bodyClear = ud._bodyEyeClear === true;
          } else {
            const _usable = Math.max(0, dlen - GRID * 0.75);
            const _sample = Math.max(0.2, GRID * 0.25);
            const _count = Math.max(1, Math.ceil(_usable / _sample));
            for (let i = 1; i <= _count; i++) {
              const _along = Math.min(_usable, i * _sample) / dlen;
              if (!_canMonsterStand(mb.position.x + ddx * _along, mb.position.z + ddz * _along, w)) { _bodyClear = false; break; }
            }
            ud._bodyEyeKey = _bk; ud._bodyEyeAt = _bt; ud._bodyEyeClear = _bodyClear;
          }
        }
        const _clearLine = _visionClear && _bodyClear;
        if (dlen > 0.05 && _clearLine) {
          const st = speed * dt;
          const fx = mb.position.x + (ddx / dlen) * st, fz = mb.position.z + (ddz / dlen) * st;
          if (_canMonsterStand(fx, fz, w)) { const ox = mb.position.x, oz = mb.position.z; _move(mb, w, fx, fz); ud._blockStreak = 0; return { dx: fx - ox, dz: fz - oz }; }
          if (_canMonsterStand(fx, mb.position.z, w)) { const ox = mb.position.x; _move(mb, w, fx, mb.position.z); ud._blockStreak = 0; return { dx: fx - ox, dz: 0 }; }
          if (_canMonsterStand(mb.position.x, fz, w)) { const oz = mb.position.z; _move(mb, w, mb.position.x, fz); ud._blockStreak = 0; return { dx: 0, dz: fz - oz }; }
        }
      }
      if (!path) return _why('nopath');                        // A* returned nothing AND the direct fallback was also blocked [REF#AI-00131]
      if (ud._aiPathIdx >= path.length) return _why('pathend');// walked the whole path, waiting on the 0.6s replan beat [REF#AI-00132]

      const nextCell = path[ud._aiPathIdx];
      const nx0 = nextCell[0] * GRID, nz0 = nextCell[1] * GRID;   // _monAStar returns [gx,gz] TUPLES, not {x,z} [REF#AI-00133]
      // A* knows walls/doors/thin-wall edges, while the live body oracle also knows current props and peers. [REF#AI-00205]
      // Reject an intermediate tile centre that the body cannot actually occupy and feed it to the planner's existing
      // temporary reroute-cost channel. Skip the last 1.5 tiles around the goal because combat standoff intentionally
      // makes the player's occupied neighbourhood unstandable; normal collision gating owns that final approach.
      if (ud._aiPathIdx < path.length - 1
          && Math.hypot(target.x - nx0, target.z - nz0) > GRID * 1.5
          && !_canMonsterStand(nx0, nz0, w)) {
        ud._rerouteAvoid = { keys: new Set([nextCell[0] + ',' + nextCell[1]]), until: performance.now() + 2500 };
        ud._aiPath = null;
        ud._aiPathStamp = performance.now() * 0.001;
        ud._aiReplanBeat = 0.6;
        return _why('blocked-waypoint');
      }
      let dx = nx0 - mb.position.x, dz = nz0 - mb.position.z;
      const len = Math.hypot(dx, dz) || 1;
      if (len < GRID * 0.25) { ud._aiPathIdx++; return _why('arrive'); }   // waypoint-arrival frame burns a whole frame with no step [REF#AI-00134]

      const step = speed * dt;
      const nx = mb.position.x + (dx / len) * step;
      const nz = mb.position.z + (dz / len) * step;

      // wall-slide via the existing collider check (Engine8 _canMonsterStand:4334) [REF#AI-00135]
      if (_canMonsterStand(nx, nz, w)) {
        // Capture BEFORE _move mutates mb. The old after-write subtraction always [REF#AI-00136]
        // returned {0,0} for a successful two-axis step, making real motion look
        // stationary to the controller/animation diagnostics.
        const ox = mb.position.x, oz = mb.position.z;
        _move(mb, w, nx, nz);
        ud._blockStreak = 0;   // real progress → the "2 collisions IN A ROW" counter re-arms (never tally unrelated bumps) [REF#AI-00137]
        return { dx: nx - ox, dz: nz - oz };
      }
      if (_canMonsterStand(nx, mb.position.z, w)) { const ox = mb.position.x; _move(mb, w, nx, mb.position.z); ud._blockStreak = 0; return { dx: nx - ox, dz: 0 }; }
      if (_canMonsterStand(mb.position.x, nz, w)) { const oz = mb.position.z; _move(mb, w, mb.position.x, nz); ud._blockStreak = 0; return { dx: 0, dz: nz - oz }; }

      // FULLY BLOCKED — direct step AND both axis-slides failed = genuinely wedged. [REF#AI-00138]
      ud._aiPath = null; ud._aiPathStamp = performance.now() * 0.001;   // boxed in → drop the path but RESET the beat so the next A* waits the full 0.6s (TIME-ONLY backoff — never re-run A* next frame; Mark 2026-07-12 combat-lag fix) [REF#AI-00139]

      // THE COLLISION BACK-OFF RULE (Mark 2026-07-18: "all monsters need to backup when they collide try a [REF#AI-00140]
      // different path as a rule"). Until now v2 stopped at "null the path and return {0,0}" — but nulling the
      // path re-plans from the SAME tile, which returns the same blocked route, so a wedged v2 monster sat
      // there until the 3s stuck-watchdog force-moved it (Mark's log: zombie @ tile 46,50 — watchdog move).
      // v2 owns hostile chase by default (_AI_V2 true) and legacy skips v2-owned monsters, so this was the
      // mover that actually needed it. Shared implementation lives in Engine9 (_monBackOffOnBlock) so legacy
      // and v2 can never drift apart. ONE blocked frame still does nothing; TWO IN A ROW backs off + rerouts.
      // The successful-step branches above clear _blockStreak, so only consecutive blocks count.
      if (typeof _monBackOffOnBlock === 'function') {
        const ox = mb.position.x, oz = mb.position.z;
        if (_monBackOffOnBlock(w, dx, dz, len, step, 'v2')) {
          return { dx: mb.position.x - ox, dz: mb.position.z - oz };   // report the REVERSE delta so the controller sees real motion (drives walk anim, feeds the watchdog's progress test) [REF#AI-00141]
        }
      }
      return { dx: 0, dz: 0 };
    },

    distanceTo(w, pos) {
      const mb = w.userData.monBase || w;
      return Math.hypot(pos.x - mb.position.x, pos.z - mb.position.z);
    },

    // — attack: fire the engine's verbatim-extracted melee on cooldown, LOS- + range-gated — [REF#AI-00142]
    // monsterAttack (Engine8:17271) sets ud._atkCooldown itself; we add the LOS + reach gate the
    // constructor expects so v2 NEVER swings through a wall (cures the legacy x-ray melee).
    tryAttack(w) {
      const ud = w.userData;
      if ((ud._atkCooldown ?? 0) > 0) return;
      if (typeof engine.monsterAttack === 'function') engine.monsterAttack(w);
    },

    // True only when the monster is within attackRange AND has clear line of sight to `pos` [REF#AI-00143]
    // (the live player). Cheap: _hasLineOfSight is _losCache-memoized engine-side and the
    // constructor only consults this at the in-range gate (not per-frame raycast spam).
    canAttack(w, pos) {
      if (!pos) return false;
      const mb = w.userData.monBase || w;
      if (Math.hypot(pos.x - mb.position.x, pos.z - mb.position.z) > (2 * GRID)) return false;
      return typeof _hasLineOfSight === 'function'
        ? _hasLineOfSight(mb.position.x, mb.position.z, pos.x, pos.z)
        : true;
    },
  };
}

/** Move both monBase and wrapper together (one canonical position; §6 transform-layer trap). [REF#AI-00144] */
function _move(mb, w, x, z) {
  mb.position.x = x; mb.position.z = z;
  if (w !== mb) { w.position.x = x; w.position.z = z; }
}

export default makeEngine8Adapter;
