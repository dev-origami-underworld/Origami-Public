/** [REF#AI-00001]
 * ════════════════════════════════════════════════════════════════════════════
 *  MASTER AI CONSTRUCTOR  —  Origami Dungeon monster brain (Director ▸ Brain ▸ Body)
 *  Worker 1 · 2026-06-12 · companion to knowledge/MONSTER_AI_MASTER_COMPENDIUM_2026-06-12.md
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  WHAT THIS IS
 *  ------------
 *  A self-contained SCAFFOLD that builds the recommended monster-AI architecture:
 *    Layer 0  MonsterController — the SINGLE owner of a monster's transform+anim+facing
 *    Layer 1  MonsterFSM        — one explicit state transition TABLE
 *    Layer 2  AffordanceBank    — per-room, DATA-DRIVEN "scripts" the world advertises
 *    Layer 3  UtilityBrain      — per-monster individuality: score affordances, pick one
 *    Director Oni-Baba biases   — global mood added as an input, NOT a per-frame puppeteer
 *
 *  MODEL TYPE (the answer to "what model do we assign?")
 *  -----------------------------------------------------
 *  UTILITY / FUZZY scoring per monster. Cheap, deterministic, debuggable, runs dozens at
 *  once on kid hardware. NOT an LLM and NOT a neural net at runtime. An LLM may AUTHOR the
 *  per-room JSON offline; the runtime only ever executes cheap arithmetic.
 *
 *  ISOLATION (read this)
 *  ---------------------
 *  This module is imported by NOTHING. It cannot affect the running game. It reaches the
 *  engine ONLY through an injected `adapter` (the anti-thrash boundary): the AI owns
 *  decisions, the adapter owns engine I/O (pathfinding, LOS, clip names, transforms).
 *  Wiring it into NewOrigami.Engine9.html is a SEPARATE, gated step — see §WIRING at bottom.
 *
 *  FPS DISCIPLINE
 *  --------------
 *  The BODY (controller) updates every frame (smooth motion). The BRAIN (utility decision)
 *  runs at ~4 Hz, STAGGERED across monsters, so 6 active hostiles cost ~6 cheap scorings/sec
 *  total, never a per-frame stampede. FPS is sacred — never gate the render loop, gate this.
 * ════════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ── States: the FULL legal set (Mark's "status states") ────────────────────── [REF#AI-00002]
export const STATE = Object.freeze({
  IDLE:     'IDLE',      // breathe in place [REF#AI-00003]
  WANDER:   'WANDER',    // drift around the room [REF#AI-00004]
  GREET:    'GREET',     // bow/wave to peer or player (time-boxed, never strands facing) [REF#AI-00005]
  SPECTATE: 'SPECTATE',  // watch a point (cabaret audience) — replaces _crowdWatch overlay [REF#AI-00006]
  SCRIPTED: 'SCRIPTED',  // run an authored scene step list (move→wave→bow→engage) [REF#AI-00007]
  INVESTIGATE: 'INVESTIGATE', // P4 insect "vibration sense": alert-face a noise → walk to it → look around [REF#AI-00008]
  HOSTILE:  'HOSTILE',   // sees the player: attack in reach, else chase [REF#AI-00009]
  SEARCHING: 'SEARCHING', // lost sight of the player: walk to their last-known spot, look around, leash give-up (Mark 2026-08-06) [REF#AI-00010]
  RETURNING: 'RETURNING', // gave up the search: walk back to the spawn tile, then IDLE (Mark 2026-08-06 "return back to original positions") [REF#AI-00011]
  FLEE:     'FLEE',      // gated off today by window._NO_FLEE; kept as a legal target [REF#AI-00012]
  // ── MONSTER SIMS v2 · §4.7 VISIT (knowledge/design/MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §4 task 1.7; [REF#AI-00162]
  //    knowledge/design/MONSTER_SIMS_V2_ARCHITECTURE_2026-09-13.md §2 hub-and-spoke, §7 friendship) ──
  // Mark, 2026-09-13: "each will interact with a favorite monster, either in same room or another whom they go to
  //   visit and interact with for some time, laughing and then return back after a few random minutes".
  // A real state, not a scene, so the outside world (Panels, a probe, Oni-Baba) can key on `ud.aiState === 'visit'`
  // the way it keys on 'searching'. Three phases live on the agent (`_visit.phase`): go → stay → home.
  // Off: window._simsVisits=false (the engine's world.friendReady returns false) · Probe: _mindOf(id).goal
  VISIT:    'VISIT',     // walk to a friend's spot, face them, laugh-bounce, walk home after a few minutes [REF#AI-00163]
  DEAD:     'DEAD',
});

// ── Explicit transition table (the ONE authority for state changes) ────────── [REF#AI-00013]
// Each entry: from → allowed[] target states. The FSM rejects illegal jumps,
// so emergent behavior can never break the game (the policy menu is the rail).
const TRANSITIONS = Object.freeze({
  [STATE.IDLE]:     [STATE.WANDER, STATE.GREET, STATE.SPECTATE, STATE.SCRIPTED, STATE.INVESTIGATE, STATE.HOSTILE, STATE.VISIT, STATE.DEAD],
  [STATE.WANDER]:   [STATE.IDLE, STATE.GREET, STATE.SPECTATE, STATE.SCRIPTED, STATE.INVESTIGATE, STATE.HOSTILE, STATE.VISIT, STATE.DEAD],
  // VISIT leaves only for its own end (IDLE), a noise, a fight or death — a 4 Hz re-pick can't pull a visitor [REF#AI-00164]
  // off the walk half-way (see the VISIT stickiness in _decide). Sims v2 §4.7.
  [STATE.VISIT]:    [STATE.IDLE, STATE.INVESTIGATE, STATE.HOSTILE, STATE.DEAD],
  [STATE.GREET]:    [STATE.IDLE, STATE.WANDER, STATE.INVESTIGATE, STATE.HOSTILE, STATE.DEAD],   // a gunshot aborts a bow (P4) [REF#AI-00014]
  [STATE.SPECTATE]: [STATE.IDLE, STATE.WANDER, STATE.SCRIPTED, STATE.HOSTILE, STATE.DEAD],   // +SCRIPTED (Mark 2026-07-13): watch_show is now the attend_show SCRIPTED scene, so a crew member still in SPECTATE from a prior tick can hand off to it (no deadlock) [REF#AI-00015]
  [STATE.SCRIPTED]: [STATE.IDLE, STATE.HOSTILE, STATE.DEAD],
  [STATE.INVESTIGATE]: [STATE.IDLE, STATE.WANDER, STATE.HOSTILE, STATE.DEAD],
  [STATE.HOSTILE]:  [STATE.IDLE, STATE.FLEE, STATE.SEARCHING, STATE.RETURNING, STATE.DEAD],
  [STATE.SEARCHING]: [STATE.HOSTILE, STATE.RETURNING, STATE.DEAD],
  [STATE.RETURNING]: [STATE.HOSTILE, STATE.IDLE, STATE.DEAD],
  [STATE.FLEE]:     [STATE.HOSTILE, STATE.IDLE, STATE.DEAD],
  [STATE.DEAD]:     [],
});

const EPS = 1e-3;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00016]
 *  LAYER 0 — MonsterController : THE SINGLE TRANSFORM OWNER
 *  Fixes the root disease from MONSTER_AI_RESEARCH_DISCOVERY_2026-06-12 §0:
 *  facing, movement, animation are ONE channel here, written ONCE per frame.
 * ════════════════════════════════════════════════════════════════════════════ */
export class MonsterController {
  /** @param {object} adapter engine I/O (see §ADAPTER). @param {object} ref monster handle. [REF#AI-00017] */
  constructor(adapter, ref, opts = {}) {
    this.a = adapter;
    this.ref = ref;
    this.moveSpeed   = opts.moveSpeed   ?? 1.4;   // WANDER baseline (world-units/s) [REF#AI-00018]
    this.chaseSpeed  = opts.chaseSpeed  ?? 2.8;   // > player MOVE_SPD(2.65) so they CLOSE distance [REF#AI-00019]
    this.turnRate    = opts.turnRate    ?? 8.0;   // rad/s — face target smoothly, no snap-shake [REF#AI-00020]
    this._lastPos    = this.a.getPosition(ref);
    this._curYaw     = this.a.getYaw(ref);
    this._clip       = 'idle';
    this._poseSettling = false;   // v3.1 gesture pose (lean/sit/warm/lookup) easing state [REF#AI-00021]
  }

  /** [REF#AI-00022]
   * Apply ONE desired intent for this frame. This is the ONLY place a monster's
   * transform/anim/facing is written. No overlay, no other system, ever touches it.
   * @param {{moveTarget?:{x,z}, faceTarget?:{x,z}, clip?:string, speed?:number}} desired
   */
  apply(desired, dt) {
    const a = this.a, ref = this.ref;
    const pos = a.getPosition(ref);

    // — movement (steering: seek + static-collider avoidance via the adapter) — [REF#AI-00023]
    let moved = false;
    if (desired.moveTarget) {
      const spd = desired.speed ?? this.moveSpeed;
      const step = a.steerToward(ref, desired.moveTarget, spd, dt); // adapter does A*/avoidance
      moved = step && (step.dx * step.dx + step.dz * step.dz) > EPS * EPS;
    }

    // — facing: ONE writer. Prefer explicit faceTarget, else face travel direction — [REF#AI-00025]
    const faceAt = desired.faceTarget || (moved ? desired.moveTarget : null);
    if (faceAt) {
      const tx = faceAt.x - pos.x, tz = faceAt.z - pos.z;
      if (tx * tx + tz * tz > EPS * EPS) {
        const want = Math.atan2(tx, tz);
        this._curYaw = approachAngle(this._curYaw, want, this.turnRate * dt);
        a.setYaw(ref, this._curYaw); // single rotation write — kills the multi-writer shake [REF#AI-00026]
      }
    }

    // — animation DERIVED from real motion (never set independently of movement) — [REF#AI-00027]
    // RE-ISSUED EVERY FRAME, NOT EDGE-TRIGGERED (Mark 2026-07-18: "if monsters are not attacking they move
    // okay, just need walk animation, but if in combat they freeze").
    //
    // THE BUG THIS FIXES. This used to be `if (wantClip !== this._clip) { setClip(...); this._clip = wantClip; }`.
    // Two facts make that edge-trigger fatal, and ONLY in combat:
    //   (a) the engine's _monSetAnim has a "no walk-in-place" coercion (Engine9 ~25745): a 'walk' request whose
    //       measured translation since the LAST walk request is under window._walkAnimMinStep (0.004wu) is
    //       silently rewritten to 'idle'. It is an absolute distance, not scaled by dt.
    //   (b) HOSTILE asks for clip:'walk' every single frame, so wantClip never CHANGES — meaning after the first
    //       request `wantClip !== this._clip` is false forever.
    // So if the coercion fires on that one transition frame — and that frame is exactly the one most likely to
    // report zero motion (no path yet after adopt, the waypoint-arrival frame that returns {0,0}, a replan-budget
    // spill, or a fully-blocked frame) — the engine latches 'idle', this controller latches 'walk', and the two
    // disagree for the REST OF THE CHASE. The monster slides the whole way with no walk clip. Wander/investigate
    // escaped it because their clip alternates, which re-triggers the edge and self-heals.
    //
    // The cabaret crew never had this bug because _walkStep (~10940) re-requests the clip EVERY frame, so one
    // coerced frame self-heals on the next. That is exactly the shape adopted here — it is the proven path.
    // _monSetAnim early-exits on an unchanged key, so re-issuing per frame is cheap, and re-requesting 'walk' is
    // what refreshes the coercion's _lastWalkPos stamp (only the 'walk' branch writes it).
    const wantClip = desired.clip || (moved ? 'walk' : 'idle');
    a.setClip(ref, wantClip);
    this._clip = wantClip;   // kept for callers that read it; no longer gates the write [REF#AI-00028]

    // — v3.1 GESTURE POSE (Mark 2026-07-12 "more realism"): a smart-object interaction leans/sits/warms/looks-up. [REF#AI-00029]
    // Routed through the ONE writer to the adapter, which eases the INNER MODEL node only (NEVER monBase — that is
    // the deleted disc-wobble). Called every frame while a pose is set OR still easing back to base, else skipped
    // (moving monsters never pose). setPose returns true while off-base so we keep easing after the pose clears.
    if (desired.pose || this._poseSettling) {
      this._poseSettling = !!a.setPose?.(ref, desired.pose || null);
    }

    this._lastPos = pos;
  }
}

/** Rotate `cur` toward `target` by at most `maxStep` radians (shortest arc). [REF#AI-00030] */
function approachAngle(cur, target, maxStep) {
  let d = ((target - cur + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00031]
 *  LAYER 1 — MonsterFSM : one transition authority, time-boxed decorative states
 * ════════════════════════════════════════════════════════════════════════════ */
export class MonsterFSM {
  constructor(initial = STATE.IDLE) {
    this.state = initial;
    this._enteredAt = now();
  }
  get timeInState() { return (now() - this._enteredAt) / 1000; }

  /** Returns true if the transition was legal and applied. Illegal jumps are rejected. [REF#AI-00032] */
  to(next) {
    if (this.state === next) return true;
    const allowed = TRANSITIONS[this.state] || [];
    if (!allowed.includes(next)) {
      console.warn(`[MonsterAI] illegal transition ${this.state} → ${next} (rejected)`);
      return false;
    }
    this.state = next;
    this._enteredAt = now();
    return true;
  }
}

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00033]
 *  LAYER 2 — AffordanceBank : DATA-DRIVEN per-room scripts (the Sims smart-object model)
 *  The ROOM (and peers/player/props) advertise what a monster CAN do. Designers — or an
 *  offline LLM — author this JSON; the engine is never edited to change room behavior.
 * ════════════════════════════════════════════════════════════════════════════ */
export class AffordanceBank {
  constructor() { this.rooms = new Map(); }

  /** Load a per-room script: { roomId, ambientScripts:[...], scenes:{...}, roles:{...} } [REF#AI-00034] */
  loadRoom(json) {
    if (json && typeof json.roomId !== 'undefined') this.rooms.set(json.roomId, json);
    return this;
  }

  /** Affordances available to `monster` right now: room ambient + dynamic peer/player ones. [REF#AI-00035] */
  advertise(monster, world) {
    // COMBAT IS EXCLUSIVE (2026-07-15): once the engine says this monster is hostile, [REF#AI-00036]
    // do not even advertise show choreography, smart objects, greetings, or noise-life.
    // Cabaret patrons used to receive engage_player AND watch_show while Starlette sang;
    // the show utility could win, asking the FSM for HOSTILE -> SCRIPTED four times/sec.
    // The FSM correctly rejected that unsafe jump, but the retry/warn flood hurt combat.
    if (world.playerHostileTo?.(monster)) {
      return [{ kind: 'engage', spec: { id: 'engage_player', state: STATE.HOSTILE, target: 'player' } }];
    }
    const out = [];
    const room = this.rooms.get(monster.roomId);
    if (room?.ambientScripts) {
      for (const s of room.ambientScripts) {
        if (s.smart) continue;   // v3 smart-objects are advertised below (proximity + occupancy gated), not here [REF#AI-00037]
        // AUTHORED ROLE-SCENES ARE ROLE-GATED (Mark 2026-07-12 v3 fix): these reference specific actors [REF#AI-00038]
        // ('blackjack_goblin', '$peer') and are authored FOR the roled audience (cab-gob-1/2/imp-fan). The old
        // gate `roles && !includes` LEAKED them to any monster WITHOUT a role entry — so an ordinary idle-life
        // cabaret monster locked onto the un-gated JSON watch_show(0.6) and never touched a smart-object. Now a
        // monster needs a MATCHING role to get an authored row; ordinary monsters use smart-objects + the
        // engine-side affordances (amble/greet/watch_show-when-singing/noise). The audience is unaffected.
        const roles = room.roles?.[monster.id];
        if (!roles || !roles.includes(s.id)) continue;
        // v3 CREW SIM-LIFE (Mark 2026-07-13 "add that extra SIM life"): when the cabaret crew is on the sims-dungeon [REF#AI-00039]
        // smart-object loop, SUPPRESS the always-on role watch_show (base 0.6, effectively ~0.75 after the +0.3·socia
        // bonus in score()) so BETWEEN songs the smart-objects win → the crew wanders the room (bar→table→lantern→pole).
        // During a song the show-gated engine showWatch (base 0.70) re-adopts the watch, so the performance is never
        // abandoned. INERT (byte-identical v2) when world.crewSimLife is absent / returns false (v3 flag off). Only
        // watch_show is suppressed — the crew's gamble/greet roles are untouched.
        if (s.id === 'watch_show' && world.crewSimLife?.(monster)) continue;
        out.push({ kind: 'ambient', spec: s, scene: s.scene ? room.scenes?.[s.scene] : null });
      }
      // ── v3 SMART OBJECTS (Mark 2026-07-12 "sims dungeon"): a room-authored object advertises a "go do X [REF#AI-00040]
      // here" micro-scene, gated by the engine's proximity/occupancy hook (near + free + capacity). Skipped
      // ENTIRELY when world.smartObjectReady is absent (v3 flag off) → byte-identical v2. Each is a SCRIPTED
      // inline scene (moveTo→face→play→release); the recency ring in score() rotates them so a monster uses
      // the WHOLE room (bar → table → lantern → pole) instead of freezing on one object.
      if (world.smartObjectReady) {
        for (const s of room.ambientScripts) {
          if (!s.smart) continue;
          if (world.smartObjectReady(monster, s.anchor, s.capacity)) {
            out.push({ kind: 'smart', spec: s, scene: s.scene });   // inline scene array (not a room.scenes key) [REF#AI-00041]
          }
        }
      }
    }
    // Dynamic affordances: peaceful peers/player interactions. Hostility returned [REF#AI-00042]
    // through the exclusive combat rail above, so none of these can override it.
    for (const peer of world.peersNear?.(monster) ?? []) {
      out.push({ kind: 'social', spec: { id: 'greet_peer', state: STATE.GREET, target: peer.id } });
    }
    // ── MONSTER SIMS v2 · §4.7 visit_friend (MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §4 task 1.7) ── [REF#AI-00165]
    // The world says whether this body has a friend it could go and see right now (a bond in its record, company
    // need low enough, cooldown passed, the friend awake and not mid-fight). base 0.55: above amble (0.45), below
    // the player bow (0.62), the show (0.70), a noise (0.75) and any fight — the natural pecking order. Absent hook
    // (window._simsVisits=false, or the sims glue not loaded) = no row = byte-identical v2.
    if (world.friendReady?.(monster)) {
      out.push({ kind: 'social', spec: { id: 'visit_friend', state: STATE.VISIT, target: 'friend', utility: { base: 0.55 } } });
    }
    // ── MONSTER SIMS v2 · §4.8 greet_crossing (MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §4 task 1.8) ── [REF#AI-00197]
    // The interaction tree decided a real crossing deserves a bow (warmth, sociability) and parked the request on
    // the body; the world hands the peer id here once. base 0.69: above the visit cap (0.68) and the player bow
    // (0.62), below the show (0.70) and a noise (0.75) — a passing bow never interrupts a scene or a fight.
    const _crossId = world.crossingGreet?.(monster);
    if (_crossId) {
      out.push({ kind: 'social', spec: { id: 'greet_crossing', state: STATE.GREET, target: _crossId, utility: { base: 0.69 } } });
    }
    // P4: the karma-bow lives INSIDE v2 for owned monsters (legacy can't stamp aiState 'bow' on an [REF#AI-00043]
    // owned monster — its tick is skipped). world.playerNear pins itself through the bow + carries
    // the refractory, so this never bow-loops. base 0.62: above amble, below noise/engage.
    if (world.playerNear?.(monster)) {
      out.push({ kind: 'social', spec: { id: 'greet_player', state: STATE.GREET, target: 'player', utility: { base: 0.62 } } });
    }
    // CABARET EDGE BEATS: the owned crew cannot use the legacy `_crowdWatch` transform writer. The existing [REF#AI-00044]
    // player-entry and Starlette-finale edge latches instead advertise short single-owner scenes here.
    if (world.crewNoticePlayer?.(monster)) {
      out.push({ kind: 'event', spec: { id: 'notice_player', state: STATE.SCRIPTED, utility: { base: 0.98 } }, scene: [
        { do: 'face', target: '$player' }, { do: 'play', clip: 'idle', hold: 1.8 }
      ] });
    }
    if (world.crewShowEnded?.(monster)) {
      out.push({ kind: 'event', spec: { id: 'show_end_bow', state: STATE.SCRIPTED, utility: { base: 0.99 } }, scene: [
        { do: 'face', target: 'succubus' }, { do: 'play', clip: 'bow', hold: 1.25 },
        { do: 'face', target: '$player' }, { do: 'play', clip: 'idle', hold: 1.2 }
      ] });
    }
    // WATCH THE SHOW (Mark 2026-07-12 "when show starts, monsters go watch her — except when gaming"): while [REF#AI-00045]
    // Starlette is singing, a peaceful non-gaming monster in the cabaret turns to watch her (SPECTATE faces the
    // succubus). base 0.70 — beats amble(0.45)/greet(0.62), loses to noise(0.75)/engage(hostile), so a gunshot or
    // a fight still pulls them away, and gaming monsters never advertise this (world.showWatch gates on the same
    // idle-life predicate that excludes _pokerSeat/parley). The FIRST real v3-style environmental affordance.
    if (world.showWatch?.(monster)) {
      // ATTEND THE SHOW (Mark 2026-07-13 "when show starts + monsters !gaming: walk to front-of-stage tiles to clap, [REF#AI-00046]
      // watch Starlette continuously, with applause beats but no peer/Dancer glance"): while she
      // sings the crew now run the attend_show SCENE instead of a bare stare — SCRIPTED + scene → _runScene
      // (moveTo stage_front → face Starlette → clap/watch while holding that sightline). Scene ends →
      // IDLE → showWatch re-picks it next tick while singing, so the applause/talk beats LOOP through the song. All
      // motion is wobble-safe (setYaw/setClip/setPose, never monBase rotation) and the crew stay v2-owned (poker
      // release path untouched). base 0.70 still beats smart-objects/greet, loses to noise/engage so a fight pulls them.
      // SAFETY VALVE (cabaret has regressed 3x): window._attendShow=false reverts the crew to the PROVEN bare SPECTATE
      // stare (no scene) — instant live rollback if the walk/clap choreography misbehaves. Default: the attend_show scene.
      const _attend = !(typeof window !== 'undefined' && window._attendShow === false);
      out.push({ kind: 'ambient', spec: { id: 'watch_show', state: _attend ? STATE.SCRIPTED : STATE.SPECTATE, target: 'succubus', utility: { base: 0.70 } }, scene: _attend ? (room?.scenes?.attend_show) : null });
    }
    // ── P4 IDLE LIFE (world-hook-gated; absent hooks = Phase-3 behavior, byte-identical) ── [REF#AI-00047]
    // A fresh/unresolved noise outranks everything peaceful (base 0.75) and persists until the
    // INVESTIGATE intent calls world.noiseDone — so a 4Hz brain re-pick can't abort it mid-walk.
    if (world.heardNoise?.(monster)) {
      out.push({ kind: 'event', spec: { id: 'investigate_noise', state: STATE.INVESTIGATE, utility: { base: 0.75 } } });
    }
    // Ambient amble: the room itself invites a stroll when the world says this monster lives idle [REF#AI-00048]
    // life (engine gates by flag + observed-room set). Base 0.45 loses to greet for sociable
    // monsters and to any noise/engage — the natural pecking order.
    if (world.idleLife?.(monster)) {
      out.push({ kind: 'ambient', spec: { id: 'amble', state: STATE.WANDER, utility: { base: 0.45 } } });
    }
    return out;
  }
}

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00049]
 *  LAYER 3 — UtilityBrain : per-monster individuality. Scores each affordance by the
 *  monster's OWN personality + needs + Oni-Baba bias, picks the highest. THIS is the
 *  assigned model type. Swappable: replace score() with a fuzzy net or (offline) LLM seed.
 * ════════════════════════════════════════════════════════════════════════════ */
export class UtilityBrain {
  /** @param {{bravery,aggression,sociability,loudness}} personality 0..1 each (frozen roll today; learnable later) [REF#AI-00050] */
  constructor(personality = {}) {
    this.p = {
      bravery: personality.bravery ?? 0.5,
      aggression: personality.aggression ?? 0.5,
      sociability: personality.sociability ?? 0.5,
      loudness: personality.loudness ?? 0.5,
      // ── MONSTER SIMS v2 · §3 the four new dials (MONSTER_SIMS_V2_ARCHITECTURE_2026-09-13.md §3) ── [REF#AI-00166]
      // Read from `personality` when the engine's mint carried them across from ud.mind.dials; neutral 0.5
      // otherwise, so every existing score row is unchanged for a body without a record.
      temper: personality.temper ?? 0.5,
      warmth: personality.warmth ?? 0.5,
      kindness: personality.kindness ?? 0.5,
      drive: personality.drive ?? 0.5,
    };
  }

  /** Utility of one affordance for this monster. Tunable, inspectable — no black box. [REF#AI-00051] */
  score(aff, monster, world) {
    const p = this.p;
    const hp = monster.hpFrac ?? 1;
    const baseFromSpec = aff.spec.utility?.base ?? 0.4;
    let u = baseFromSpec;

    switch (aff.spec.id) {
      case 'engage_player':
        // aggressive, brave, healthy monsters want to fight; bias up with Oni-Baba aggro. [REF#AI-00052]
        u = 0.5 + 0.3 * p.aggression + 0.2 * p.bravery + 0.2 * (world.oniBabaAggro ?? 0) - 0.3 * (1 - hp);
        break;
      case 'greet_peer':
        u = 0.2 + 0.5 * p.sociability;       // social butterflies greet; loners ignore [REF#AI-00053]
        break;
      case 'watch_show':
        u = baseFromSpec + 0.3 * p.sociability;
        break;
      case 'notice_player': u = 0.98; break;
      case 'show_end_bow': u = 0.99; break;
      case 'greet_crossing': u = 0.69; break;   // Sims v2 §4.8: the tree already weighed the personality; the brain only ranks it [REF#AI-00198]
      case 'visit_friend': {
        // Sims v2 §3 heuristics row "two friends meet": sociability + warmth (the two-dial rule), lifted by how [REF#AI-00167]
        // lonely the body is (monster.needs.company, 1 = content; absent = 0.5). Neutral body: 0.475 — a hair over
        // amble (0.45); a warm social lonely one: 0.68 cap — still under the show (0.70) and a noise (0.75).
        const lonely = 1 - (monster.needs?.company ?? 0.5);
        u = Math.min(0.68, 0.20 + 0.20 * p.sociability + 0.15 * p.warmth + 0.20 * lonely);
        break;
      }
      default:
        // personality nudges declared in the JSON (e.g. utility:{aggression:-0.2}) [REF#AI-00054]
        for (const [k, w] of Object.entries(aff.spec.utility ?? {})) {
          if (k !== 'base' && k in p) u += w * p[k];
        }
    }
    // SATIATION dock (v3): an AMBIENT affordance (smart-object / amble, base < 0.72) used recently loses [REF#AI-00055]
    // utility, most for the most-recent — so the monster cycles bar→table→lantern→pole→amble for variety
    // rather than repeating one. Never touches combat/greet/watch/noise (they're never in monster.recent).
    if (baseFromSpec < 0.72 && monster.recent && monster.recent.length) {
      const idx = monster.recent.lastIndexOf(aff.spec.id);
      if (idx >= 0) u -= 0.22 * ((idx + 1) / monster.recent.length);
    }
    return clamp01(u);
  }

  /** Pick the highest-utility affordance (ties → first). Returns {aff,score} or null. [REF#AI-00056] */
  choose(affordances, monster, world) {
    let best = null, bestU = -Infinity;
    for (const aff of affordances) {
      const u = this.score(aff, monster, world);
      if (u > bestU) { bestU = u; best = aff; }
    }
    return best ? { aff: best, score: bestU } : null;
  }
}

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00057]
 *  MonsterAgent : one assembled stack (controller + fsm + brain + current intent)
 * ════════════════════════════════════════════════════════════════════════════ */
class MonsterAgent {
  constructor({ ref, controller, fsm, brain, model }) {
    this.ref = ref; this.controller = controller; this.fsm = fsm; this.brain = brain;
    this.model = model;              // the monster's data blob (id, roomId, hpFrac, personality) [REF#AI-00058]
    this._scene = null; this._sceneIdx = 0; this._sceneStepAt = 0; this._sceneFaceTarget = null;   // active SCRIPTED scene + per-step clock [REF#AI-00059]
    this._missingTargets = new Set();
    this._lifeActivity = null;        // last peaceful affordance reported to Oni-Baba (transition-rate only) [REF#AI-00060]
    this._brainPhase = Math.random(); // stagger seed so brains don't all tick the same frame [REF#AI-00061]
  }
}

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00062]
 *  MASTER CONSTRUCTOR — builds, owns, and ticks the whole monster-AI population
 * ════════════════════════════════════════════════════════════════════════════ */
export class MonsterAIConstructor {
  /** [REF#AI-00063]
   * @param {object} adapter  engine I/O — see §ADAPTER for the required methods.
   * @param {object} world    live world queries — see §WORLD.
   * @param {object} opts      { brainHz=4, chaseSpeed, moveSpeed, telemetry=true }
   */
  constructor(adapter, world, opts = {}) {
    this.a = adapter;
    this.world = world;
    this.bank = new AffordanceBank();
    this.agents = new Map();          // ref -> MonsterAgent [REF#AI-00064]
    this.brainHz = opts.brainHz ?? 4; // decisions/sec per monster (FPS-safe) [REF#AI-00065]
    this.opts = opts;
    this._t = 0;
    this._announce('init');
  }

  loadRoomScript(json) { this.bank.loadRoom(json); return this; }

  /** Build the full AI stack for one monster and register it. [REF#AI-00066] */
  build(ref) {
    const model = this.a.getModel(ref); // {id, roomId, hpFrac, personality} [REF#AI-00067]
    const controller = new MonsterController(this.a, ref, {
      moveSpeed: this.opts.moveSpeed,
      chaseSpeed: this.opts.chaseSpeed,
    });
    const agent = new MonsterAgent({
      ref, controller,
      fsm: new MonsterFSM(STATE.IDLE),
      brain: new UtilityBrain(model.personality),
      model,
    });
    this.agents.set(ref, agent);
    this._announce('built', { id: model.id });
    return agent;
  }

  remove(ref) { this.agents.delete(ref); }

  /** Tick the whole population. BODY every frame; BRAIN staggered at brainHz. [REF#AI-00068] */
  tick(dt) {
    this._t += dt;
    for (const agent of this.agents.values()) {
      try {
        if (agent.fsm.state === STATE.DEAD) continue;
        agent.model = this.a.getModel(agent.ref); // refresh cheap scalars (hp, room, pos) [REF#AI-00069]

        // ── BRAIN: decide, staggered so the whole crowd never scores on one frame ── [REF#AI-00070]
        if (this._brainDue(agent, dt)) this._decide(agent);

        // ── BODY: execute the current state every frame (smooth) ── [REF#AI-00071]
        const desired = this._intentFor(agent, dt);
        agent.controller.apply(desired, dt);
      } catch (err) {
        // Telemetry, never a silent decouple (Oni-Baba sensory protocol). [REF#AI-00072]
        this._announce('anomaly', { id: agent.model?.id, msg: String(err && err.message || err) });
      }
    }
  }

  _brainDue(agent, dt) {
    agent._brainPhase += dt * this.brainHz;
    if (agent._brainPhase >= 1) { agent._brainPhase -= 1; return true; }
    return false;
  }

  /** Run perception → utility → state transition (the per-monster decision). [REF#AI-00073] */
  _decide(agent) {
    const m = agent.model;
    // COMBAT LANE STICKINESS (Mark 2026-08-06, needed by the new SEARCHING/RETURNING states): once a monster [REF#AI-00074]
    // is in the fight — HOSTILE, SEARCHING or RETURNING — the whole lane is owned by _intentFor's OWN per-frame
    // perception (attack/chase/search/leash/walk-home), not by this 4 Hz utility re-pick. Without this guard,
    // AffordanceBank's exclusive combat rail (world.playerHostileTo → only ever offers engage_player) would win
    // EVERY brain tick and call fsm.to(HOSTILE) again — legal per the transition table, so it would silently
    // stomp SEARCHING/RETURNING back to HOSTILE ~4×/sec and no monster could ever finish a search or walk home.
    // The brain re-engages the instant world.playerHostileTo goes false (the engine's deAggro already fired,
    // e.g. RETURNING reached home) and falls through to a normal re-pick below.
    if (agent.fsm.state === STATE.HOSTILE || agent.fsm.state === STATE.SEARCHING || agent.fsm.state === STATE.RETURNING) {
      if (this.world.playerHostileTo?.(m)) return;
    }
    // SCRIPTED SCENE STICKINESS (Mark report 2026-07-15): the 4 Hz utility brain used to reset `_sceneIdx=0` [REF#AI-00075]
    // on every decision, so a Sims scene could claim/begin a move but never reach its dwell/release steps. Keep a
    // peaceful scene until completion. Only combat, the one-shot player-entry glance, show start, or show-finale bow
    // may pre-empt it; all are explicit higher-priority rails rather than another transform writer.
    if (agent.fsm.state === STATE.SCRIPTED && agent._scene) {
      const hostile = this.world.playerHostileTo?.(m) === true;
      const finale = this.world.crewShowEnded?.(m) === true;
      const notice = this.world.crewNoticePlayer?.(m) === true;
      const show = this.world.showWatch?.(m) === true;
      const wanted = finale ? 'show_end_bow' : (notice ? 'notice_player' : (show ? 'watch_show' : null));
      if (!hostile && (!wanted || agent._pick?.spec?.id === wanted)) return;
    }
    // VISIT STICKINESS (Sims v2 §4.7): a visit is a walk there, a stay and a walk home. Like a scene, it is [REF#AI-00168]
    // kept until its own end; only a fight or a noise pre-empts it, both explicit rails above amble/greet.
    if (agent.fsm.state === STATE.VISIT && agent._visit) {
      const hostile = this.world.playerHostileTo?.(m) === true;
      const noise = this.world.heardNoise?.(m) === true;
      if (!hostile && !noise) return;
    }
    const affordances = this.bank.advertise(m, this.world);
    const pick = agent.brain.choose(affordances, m, this.world);
    if (!pick) { agent.fsm.to(STATE.IDLE); return; }

    const targetState = pick.aff.spec.state || STATE.IDLE;
    // NOT REACHABLE FROM HERE YET → keep the current state, quietly (2026-09-27, Oni-Baba's report: "illegal transition GREET → [REF#PENDING] [REF#AI-00202]
    // VISIT (rejected)" repeating at 4 Hz). The FSM already refused these; the refusal just logged every tick. Same behaviour, no spam.
    if (targetState !== agent.fsm.state && !(TRANSITIONS[agent.fsm.state] || []).includes(targetState)) return;
    const wasScripted = agent.fsm.state === STATE.SCRIPTED;
    const changingScene = agent._pick?.spec?.id !== pick.aff.spec.id || agent._scene !== (pick.aff.scene || null);
    const wasVisiting = agent.fsm.state === STATE.VISIT;
    if (agent.fsm.to(targetState)) {
      if (wasScripted && (targetState !== STATE.SCRIPTED || changingScene)) this.world.releaseObject?.(m);
      if (wasVisiting && targetState !== STATE.VISIT) { this.world.visitBeat?.(m, 'abort'); agent._visit = null; }   // a fight/noise cut the visit short: drop the phase bag so the next visit starts at 'go' [Sims v2 §4.7] [REF#AI-00169]
      agent._pick = pick.aff;
      if (targetState === STATE.SCRIPTED && (!wasScripted || changingScene)) {
        agent._scene = pick.aff.scene || null;
        agent._sceneIdx = 0;
        agent._sceneStepAt = now();
        agent._sceneFaceTarget = null;
      } else if (targetState !== STATE.SCRIPTED) {
        agent._scene = null; agent._sceneIdx = 0; agent._sceneStepAt = 0; agent._sceneFaceTarget = null;
      }
      // SATIATION (v3): remember the last few AMBIENT picks (smart-objects + amble) so score() docks a [REF#AI-00076]
      // recently-used one → the monster rotates through the room instead of freezing on one object. Combat/
      // greet/watch/noise are never remembered (they must persist), so only smart + amble enter the ring.
      if (pick.aff.kind === 'smart' || pick.aff.spec.id === 'amble') {
        const _r = m.recent;
        if (_r) { _r.push(pick.aff.spec.id); if (_r.length > 4) _r.shift(); }
      }
      // ONI-BABA SLICE-OF-LIFE SENSE: publish only meaningful PEACEFUL [REF#AI-00077]
      // activity changes. The engine world hook sends one MONSTER_LIFE_BEAT;
      // body motion remains exclusively owned by MonsterController and the
      // 120fps loop receives no new work. Combat/event rails never report here.
      const _lifeKinds = pick.aff.kind === 'ambient' || pick.aff.kind === 'social' || pick.aff.kind === 'smart';
      if (_lifeKinds && agent._lifeActivity !== pick.aff.spec.id) {
        agent._lifeActivity = pick.aff.spec.id;
        this.world.lifeBeat?.(m, {
          activity: pick.aff.spec.id,
          kind: pick.aff.kind,
          roomId: m.roomId,
          state: targetState,
        });
      }
    }
  }

  /** Translate the current FSM state into ONE desired intent for the controller. [REF#AI-00078] */
  _intentFor(agent, dt) {
    const m = agent.model, w = this.world, s = agent.fsm.state;
    const player = w.getPlayerPos?.();
    switch (s) {
      case STATE.HOSTILE: {
        // ── P3 hostile MELEE: LOS-gated attack → encircle chase → hand off to SEARCHING on lost sight ── [REF#AI-00079]
        // All perception is cached engine-side at brain rate (canSeePlayer/lastKnownPlayer/
        // timeSinceSeen/encircleSlot all funnel through ONE throttled LOS heartbeat in the
        // world). _intentFor runs every frame, but it only READS those cached scalars here.
        //
        // SEARCHING/RETURNING split out as their OWN FSM states (Mark 2026-08-06 "add searching status
        // to monsters"): this used to all live inside one HOSTILE case with a `_searchScanT` sub-phase,
        // which meant the outside world — Panels, the pedestal, Oni-Baba, a probe — had no way to tell
        // "actively chasing, sees you" apart from "lost you, hunting the last spot you stood". Now losing
        // sight is a real state transition another system can key on (Engine9 mirrors agent.fsm.state onto
        // ud.aiState = 'searching'/'returning' right after tick(), same convention as 'hostile'/'idle').
        const seen = w.canSeePlayer?.(m) ?? true;     // unwired world → behave as before (always "seen") [REF#AI-00080]

        // (1) ATTACK — only when we SEE the player AND are in reach. Never swing through a wall. [REF#AI-00081]
        if (seen && player && this.a.canAttack
              ? (seen && player && this.a.canAttack(agent.ref, player))
              : (seen && player && this.a.distanceTo(agent.ref, player) <= (this.a.attackRange ?? 2))) {
          this.a.tryAttack(agent.ref);   // adapter owns the cooldown gate [REF#AI-00082]
          return { faceTarget: player, clip: 'attack', speed: 0 };
        }

        // (2) CHASE — visible: close toward a real flank SLOT around the player (encircleSlot), [REF#AI-00083]
        //     so multiple attackers spread instead of stacking on one tile. The slot is centered
        //     on the player only while seen, so this does not x-ray.
        if (seen && player) {
          const slot = w.encircleSlot?.(m) ?? player;
          return { moveTarget: slot, faceTarget: player,
                   clip: 'walk', speed: agent.controller.chaseSpeed };
        }

        // (3) SIGHT LOST — hand off to SEARCHING if there's somewhere to look, else straight to [REF#AI-00084]
        //     RETURNING (nothing was ever seen — e.g. an Oni-Baba-forced alert with no real sighting —
        //     so there is nothing to search FOR; walking home is the only sane exit).
        const lastSeen = w.lastKnownPlayer?.(m) ?? null;
        agent.fsm.to(lastSeen ? STATE.SEARCHING : STATE.RETURNING);
        return { clip: 'idle' };
      }
      case STATE.SEARCHING: {
        // ── Lost sight of the player: walk to their last-known spot, look around, leash give-up ── [REF#AI-00085]
        // Re-checked every frame (canSeePlayer/lastKnownPlayer/timeSinceSeen are the SAME cached
        // heartbeat HOSTILE reads) so a reacquired sighting snaps straight back to the fight.
        const seen = w.canSeePlayer?.(m) ?? false;
        if (seen) { agent._searchScanT = 0; agent._leashSec = undefined; agent.fsm.to(STATE.HOSTILE); return { clip: 'idle' }; }

        const goal = w.lastKnownPlayer?.(m) ?? null;   // NEVER fall back to live player (that is the legacy x-ray leak) [REF#AI-00086]
        if (!goal) { agent._searchScanT = 0; agent._leashSec = undefined; agent.fsm.to(STATE.RETURNING); return { clip: 'idle' }; }

        // LEASH — randomized 5..30s PER SEARCH EPISODE (Mark 2026-08-06 "return back to original positions [REF#AI-00087]
        // if cannot see player within 5-30 seconds"), rolled once on entry and cached on the agent so it
        // doesn't re-roll every frame. Braver/more aggressive monsters search longer, same "personality
        // nudges the number" idiom this file already uses for chase speed/turn-rate (_moveVar in Engine9).
        if (agent._leashSec === undefined) {
          const p = m.personality || {};
          const bias = clamp01(0.5 * (p.bravery ?? 0.5) + 0.5 * (p.aggression ?? 0.5));
          agent._leashSec = 5 + 25 * bias;
        }
        const lost = w.timeSinceSeen?.(m) ?? 0;
        if (lost > agent._leashSec) {
          agent._searchScanT = 0; agent._leashSec = undefined;
          agent.fsm.to(STATE.RETURNING);
          return { clip: 'idle' };
        }

        // On arrival at the last-known spot (still unseen) STOP and LOOK AROUND briefly (sweep facing [REF#AI-00088]
        // via a synthetic orbit point — reuses the single setYaw writer in apply(); no new rotation
        // writer, no raycast here). Finishing the look without spotting anything ends the search early
        // rather than standing there burning the rest of the leash.
        const reach = this.opts.searchReach ?? 1.2;
        const atGoal = this.a.distanceTo(agent.ref, goal) <= reach;
        if (atGoal) {
          agent._searchScanT = (agent._searchScanT ?? 0) + dt;
          const lookSec = this.opts.lookAroundSeconds ?? 2.0;
          if (agent._searchScanT >= lookSec) {
            agent._searchScanT = 0; agent._leashSec = undefined;
            agent.fsm.to(STATE.RETURNING);
            return { clip: 'idle' };
          }
          const here   = this.a.getPosition(agent.ref);     // {x,z} cheap read, no raycast/A* [REF#AI-00089]
          const sweep  = agent._searchScanT * Math.PI;       // ~0.5 Hz head sweep [REF#AI-00090]
          const scanAt = { x: here.x + Math.sin(sweep), z: here.z + Math.cos(sweep) };
          return { faceTarget: scanAt, clip: 'idle', speed: 0 };
        }
        return { moveTarget: goal, faceTarget: goal,
                 clip: 'walk', speed: agent.controller.chaseSpeed };
      }
      case STATE.RETURNING: {
        // ── Gave up the search: walk back to the spawn tile, then settle to IDLE ── [REF#AI-00091]
        // A reacquired sighting anywhere along the walk home snaps straight back to HOSTILE — giving up
        // is not a commitment to ignore a player who steps back into view mid-walk.
        const seen = w.canSeePlayer?.(m) ?? false;
        if (seen) { agent.fsm.to(STATE.HOSTILE); return { clip: 'idle' }; }

        const home = w.homePos?.(m) ?? null;
        if (!home) {   // no recorded spawn tile (pre-existing save, or a monster spawned before this shipped) — settle in place [REF#AI-00092]
          w.deAggro?.(m);
          agent.fsm.to(STATE.IDLE);
          return { clip: 'idle' };
        }
        const reach = this.opts.searchReach ?? 1.2;
        if (this.a.distanceTo(agent.ref, home) <= reach) {
          w.deAggro?.(m);
          agent.fsm.to(STATE.IDLE);
          return { clip: 'idle' };
        }
        // Normal WANDER-pace walk, not the urgent chase speed — the fight is over, this is just going home. [REF#AI-00093]
        return { moveTarget: home, faceTarget: home, clip: 'walk', speed: agent.controller.moveSpeed };
      }
      case STATE.VISIT: {
        // ── MONSTER SIMS v2 · §4.7 VISIT — go · stay · home (MONSTER_SIMS_V2_IMPLEMENTATION_PLAN_2026-09-13.md §4 task 1.7) ── [REF#AI-00170]
        // go:   walk to the friend's current spot (world.friendPos, re-read every frame so a friend who ambles is
        //       followed, never chased to a stale tile); a walk that cannot arrive in visitWalkSeconds turns home.
        // stay: face the friend for world.visitStay(m) seconds (the engine rolls 60–240 s by sociability), with a
        //       laugh beat every 6–10 s — the 'laugh' pose pulsed on/off for two seconds is the laugh-bounce, no
        //       new clip needed; the engine draws the ♥ over both on world.visitBeat.
        // home: walk to the spawn tile (homePos), then IDLE. Every phase is time-boxed: a visitor is never stranded.
        const v = agent._visit || (agent._visit = { phase: 'go', stayUntil: 0, nextLaugh: 0, laughUntil: 0, phaseAt: this._t });
        const t = this._t, fp = w.friendPos?.(m);
        const walkMax = this.opts.visitWalkSeconds ?? 25, reach = this.opts.visitReach ?? 1.6;
        // "close enough to talk": the spot beside the friend, OR the friend's own body within 1.6 tiles (3.2 wu) — the [REF#AI-00199]
        // engine keeps every body one tile off every other, so in a one-tile hallway the spot itself can be
        // unreachable while the two are already face to face (4.2 wu ≈ 2 tiles). Measured 2026-09-13: a visitor stalled 25 s one tile
        // short of its friend and walked home without a hello.
        const nearFriend = (w.friendDist?.(m) ?? Infinity) <= (this.opts.visitTalkReach ?? 4.2);   // ~2 tiles: across one empty tile is talking distance [REF#AI-00200]
        if (!fp && v.phase !== 'home') { v.phase = 'home'; v.phaseAt = t; }
        const face = w.friendBody?.(m) ?? fp;   // look at the friend, not at the spot under your own feet [REF#AI-00201]
        if (v.phase === 'go') {
          if (this.a.distanceTo(agent.ref, fp) <= reach || nearFriend) {
            v.phase = 'stay'; v.phaseAt = t;
            v.stayUntil = t + (w.visitStay?.(m) ?? 90);
            v.nextLaugh = t + 1.5;
            w.visitBeat?.(m, 'arrive');
            return { faceTarget: face, clip: 'bow', speed: 0 };
          }
          if (t - v.phaseAt > walkMax) { v.phase = 'home'; v.phaseAt = t; return { clip: 'idle' }; }
          return { moveTarget: fp, faceTarget: fp, clip: 'walk', speed: agent.controller.moveSpeed };
        }
        if (v.phase === 'stay') {
          if (t >= v.stayUntil) { v.phase = 'home'; v.phaseAt = t; w.visitBeat?.(m, 'leave'); return { faceTarget: face, clip: 'wave', speed: 0 }; }
          if (t >= v.nextLaugh) { v.laughUntil = t + 2.0; v.nextLaugh = t + 6 + 4 * Math.random(); w.visitBeat?.(m, 'laugh'); }
          const laughing = t < v.laughUntil && (Math.floor((v.laughUntil - t) / 0.35) % 2 === 0);
          return { faceTarget: face, clip: 'idle', speed: 0, pose: laughing ? 'laugh' : null };
        }
        // home [REF#AI-00171]
        const home = w.homePos?.(m) ?? null;
        if (!home || this.a.distanceTo(agent.ref, home) <= reach || t - v.phaseAt > walkMax) {
          w.visitBeat?.(m, 'home'); agent._visit = null; agent.fsm.to(STATE.IDLE); return { clip: 'idle' };
        }
        return { moveTarget: home, faceTarget: home, clip: 'walk', speed: agent.controller.moveSpeed };
      }
      case STATE.SPECTATE:
        return { faceTarget: w.posOf?.(agent._pick?.spec.target) ?? player, clip: 'idle' };
      case STATE.GREET: {
        const tgt = w.posOf?.(agent._pick?.spec.target);
        // time-boxed so it NEVER strands facing (the wedged-bow bug) [REF#AI-00094]
        if (agent.fsm.timeInState > 1.2) agent.fsm.to(STATE.IDLE);
        return { faceTarget: tgt, clip: 'bow' };
      }
      case STATE.SCRIPTED: return this._runScene(agent);
      case STATE.INVESTIGATE: {
        // ── P4 noise investigation: alert beat → walk to the sound → look around → resume life ── [REF#AI-00095]
        // The world caches the noise point per-monster (noisePoint) and keeps advertising it until
        // the intent declares it resolved (noiseDone) — brain re-picks can't abort a walk half-way.
        const pt = w.noisePoint?.(m);
        if (!pt || agent.fsm.timeInState > (this.opts.investigateSeconds ?? 10)) {
          w.noiseDone?.(m); agent._invScanT = 0; agent.fsm.to(STATE.IDLE); return { clip: 'idle' };
        }
        // Alert beat: freeze + face the sound for a readable "?!" moment before committing feet. [REF#AI-00096]
        if (agent.fsm.timeInState < 0.7) return { faceTarget: pt, clip: 'idle', speed: 0 };
        const reach = this.opts.searchReach ?? 1.2;
        if (this.a.distanceTo(agent.ref, pt) <= reach) {
          agent._invScanT = (agent._invScanT ?? 0) + dt;
          const lookSec = this.opts.lookAroundSeconds ?? 2.0;
          if (agent._invScanT >= lookSec) {
            w.noiseDone?.(m); agent._invScanT = 0; agent.fsm.to(STATE.IDLE); return { clip: 'idle' };
          }
          const here  = this.a.getPosition(agent.ref);          // same cheap sweep as HOSTILE search [REF#AI-00097]
          const sweep = agent._invScanT * Math.PI;
          return { faceTarget: { x: here.x + Math.sin(sweep), z: here.z + Math.cos(sweep) }, clip: 'idle', speed: 0 };
        }
        return { moveTarget: pt, faceTarget: pt, clip: 'walk' };
      }
      // WANDER: no forced clip — apply() derives walk/idle from REAL motion, so the dwell pauses [REF#AI-00098]
      // between amble legs (wanderTarget returns null while dwelling) read as standing, never
      // walking-in-place (P4).
      case STATE.WANDER:   return { moveTarget: w.wanderTarget?.(m) };
      case STATE.FLEE:     // gated off in-engine by window._NO_FLEE; here for completeness [REF#AI-00099]
        return { moveTarget: w.fleeTarget?.(m), clip: 'walk', speed: agent.controller.chaseSpeed };
      case STATE.IDLE:
      default:             return { clip: 'idle' };
    }
  }

  /** Execute an authored scene: a list of steps (moveTo/play/wave/face/transition). [REF#AI-00100] */
  _runScene(agent) {
    const scene = agent._scene;
    if (!scene || agent._sceneIdx >= scene.length) { this.world.releaseObject?.(agent.model); agent._sceneFaceTarget = null; agent.fsm.to(STATE.IDLE); return { clip: 'idle' }; }
    const step = scene[agent._sceneIdx];
    const w = this.world;
    const advance = () => { agent._sceneIdx++; agent._sceneStepAt = now(); };
    const resolve = (t) => t === '$player' ? w.getPlayerPos?.()
                         : t === '$peer'  ? w.posOf?.(agent._pick?.spec.target, agent.model)
                         : w.posOf?.(t, agent.model);   // actor-aware anchors: a crowd must never path every body to one shared point [REF#AI-00101]
    switch (step.do) {
      case 'moveTo': {
        const tgt = resolve(step.target);
        if (!tgt) {
          const key = String(agent._pick?.spec?.id || 'scene') + ':' + String(step.target);
          if (!agent._missingTargets.has(key)) { agent._missingTargets.add(key); this._announce('anomaly', { id:agent.model?.id, msg:'missing scene target ' + key }); }
          advance(); return { clip:'idle' };   // absent/broken optional prop can never strand an agent [REF#AI-00102]
        }
        const faceTarget = step.face ? resolve(step.face) : tgt;
        const elapsed = (now() - (agent._sceneStepAt || now())) / 1000;
        const timedOut = Number.isFinite(step.timeout) && elapsed >= step.timeout;
        if (tgt && (this.a.distanceTo(agent.ref, tgt) <= (step.reach ?? 1.2) || timedOut)) advance();
        // A furniture/crowd-blocked walk cannot imprison the scene before its face/watch beat. While moving, keep [REF#AI-00103]
        // the authored subject in view; on timeout, stop the feet and hand the next frame to the following step.
        return { moveTarget: timedOut ? null : tgt, faceTarget, clip: timedOut ? 'idle' : 'walk' };
      }
      case 'face':  agent._sceneFaceTarget = resolve(step.target); advance(); return { faceTarget: agent._sceneFaceTarget, clip: 'idle' };
      case 'play':  if ((now() - (agent._sceneStepAt || now())) / 1000 > (step.hold ?? 0.5)) advance();
                    return { faceTarget: agent._sceneFaceTarget, clip: step.clip || 'idle', pose: step.pose || null };   // keep the last authored facing through the full dwell [REF#AI-00104]
      case 'wave':  advance(); return { faceTarget: agent._sceneFaceTarget, clip: 'wave' };
      case 'transition':
        if (!step.when || w.cond?.(step.when, agent.model)) agent.fsm.to(step.state);
        else advance();
        return { clip: 'idle' };
      // v3 smart-object occupancy (Mark 2026-07-12): CLAIM a seat so peers don't stack it, RELEASE on scene end. [REF#AI-00105]
      // A failsafe expiry in the engine frees a claim if the scene is interrupted (noise/combat) before release.
      case 'claim':   w.claimObject?.(agent.model, step.anchor); advance(); return { clip: 'idle' };
      case 'release': w.releaseObject?.(agent.model); advance(); return { clip: 'idle' };
      default:      advance(); return { clip: 'idle' };
    }
  }

  /** Centralized telemetry → parent (Oni-Baba). Never a silent decouple. [REF#AI-00106] */
  _announce(stage, extra = {}) {
    if (this.opts.telemetry === false) return;
    try {
      if (typeof window !== 'undefined' && window.parent) {
        const type = stage === 'anomaly' ? 'ENGINE_ANOMALY' : 'AI_CONSTRUCTOR_EVENT';
        const payload = { type, source: 'MonsterAIConstructor', stage, ...extra };
        if (stage === 'anomaly') { payload.kind = 'MONSTER_AI_CONSTRUCTOR'; payload.subsystem = 'v3-scene'; payload.error = extra.msg || 'unknown'; payload.count = 1; }
        window.parent.postMessage(payload, '*');
      }
    } catch (_) { /* headless / no parent */ }
  }
}

/* ════════════════════════════════════════════════════════════════════════════ [REF#AI-00107]
 *  §ADAPTER — the engine I/O contract (the anti-thrash boundary).
 *  Engine8 implements these against its real systems; the AI never reaches inside it.
 *  Implement when wiring (Phase 1). Stubs throw so missing wiring is loud, not silent.
 *
 *    getModel(ref)      -> { id, roomId, hpFrac, personality:{bravery,aggression,sociability,loudness} }
 *    getPosition(ref)   -> { x, z }
 *    getYaw(ref)        -> number (radians)
 *    setYaw(ref, yaw)   -> void   (the ONLY rotation writer in the new world)
 *    setClip(ref, name) -> void   (semantic clip name: 'idle'|'walk'|'attack'|'bow'|'wave'|'flee')
 *    steerToward(ref, target, speed, dt) -> { dx, dz }   (A* + static-collider avoidance)
 *    distanceTo(ref, pos) -> number
 *    tryAttack(ref)     -> void   (respects the engine's existing cooldown/telemetry)
 *    attackRange        -> number (world units)
 *
 *  §WORLD — live world queries (read-only):
 *    getPlayerPos(), posOf(id), peersNear(m), playerHostileTo(m), lastKnownPlayer(m),
 *    wanderTarget(m), fleeTarget(m), cond(name, m), oniBabaAggro (0..1)
 *    Sims v2 (all optional — absent = byte-identical v2): friendReady(m), friendPos(m) → {x,z}|null, friendDist(m) → wu, friendBody(m) → {x,z}|null,
 *    visitStay(m) → seconds, visitBeat(m, 'arrive'|'laugh'|'leave'|'home'|'abort'), crossingGreet(m) → peer id|null;
 *    model.needs = ud.mind.needs
 *
 *  §WIRING (Phase 1, gated — do NOT do this until Mark GOs):
 *    1. Implement the adapter against Engine8's transform/anim/pathfinding.
 *    2. In tickMonsterAI's slumber-survivors loop, replace the scattered facing/anim/flee
 *       writes with: constructor.build(ref) once, constructor.tick(dt) per frame.
 *    3. Migrate ONE behavior first (cabaret SPECTATE) to prove the single-owner model,
 *       validate FPS + no-shake on a rendered boot, THEN expand. (See compendium Phase 1–2.)
 * ════════════════════════════════════════════════════════════════════════════ */

export default MonsterAIConstructor;
