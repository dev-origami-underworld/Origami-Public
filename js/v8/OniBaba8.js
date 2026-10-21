/** [REF#GP-00001]
 * OniBaba8.js — The Living Orchestrator
 *
 * Oni-Baba is no longer just a karma observer.
 * She IS the engine. Every pipeline routes through her:
 *
 *  MAP GENERATION   — she seeds, mutates, and rebuilds dungeons
 *  RENDER PIPELINE  — she drives fog density, torch flicker, reality shifts
 *  PLAYER I/O       — she intercepts, mutates, and validates every input
 *  MONSTER I/O      — she owns spawn, pathfind requests, combat turns, death
 *  ERROR HANDLING   — fuzzy sensors detect anomalies and self-correct
 *
 * Fuzzy Logic Sensors (0.0–1.0 each):
 *   cruelty       — how violently the player has been playing
 *   desperation   — how close to death the player is
 *   tension       — combat pressure across all active monsters
 *   silence       — how long since any event (eerie quiet)
 *   corruption     — accumulated karma debt
 *   hiveMindStr   — how adapted monsters are to player's patterns
 *   renderStress  — frame budget % (fed from engine each frame)
 *   narrativeNeed — how long since Oni-Baba last spoke
 *
 * Outputs (0.0–1.0 each):
 *   fogDensity      → scene.fog.density
 *   torchFlicker    → torch light intensity multiplier
 *   spawnPressure   → chance of new monster spawning on room enter
 *   monsterAggro    → damage multiplier for monster counter-attacks
 *   lootGenerosity  → loot table weight shift
 *   musicTension    → audio system tension (Phase 5)
 *   realityDistort  → screen-space post FX intensity (Phase 5)
 *
 * ⛔ RETIRED 2026-09-06: narrativeTone (LLM prompt mood bias, Phase 4 scaffolding that Phase 4 never
 *   arrived to consume — 0 references anywhere outside this file's own declaration/computation,
 *   confirmed by an adversarial discovery sweep the same session). The job it was seemingly meant
 *   for is already fully live under a different name: `_updateMood()` (below) buckets `this.karma`
 *   into her real mood states, and `_pick()`/`_pickCtx()` already select tone-differentiated
 *   narration lines from that mood — narrativeTone was a second, unread restatement of the same
 *   input. See DISABLED-FEATURES REGISTER, NewOrigami.Engine9.html header.
 */

// ── COMBAT DIFFICULTY — MONSTER OFFENSE SCALE (Mark 2026-08-09: "reduce the difficulty 50% for [REF#GP-00002]
// combat — decrease monster damage, chances to hit by 50%"). Scales monsterDmgMult AND
// monsterHitChance in _refreshCombatParams() (the single writer) plus the constructor defaults
// below. The Engine9 _combatBrain pre-sync mirror (~54204) hardcodes the SAME value — change one,
// change both. Player-side params (playerDmgMult, critChance) are deliberately NOT scaled.
//
// RECALIBRATED 2026-08-10 (Mark: "other melee is too hard for level 1... monsters hit less and do
// 25-30% less damage"). The original 0.5 compounds damage×hit-chance to ~24% of original expected
// DPS in neutral mood (a ~76% reduction) — much harsher than the 25-30% he described once he'd
// actually played it. 0.725 (27.5% less, the midpoint of his stated 25-30% range) applied to BOTH
// factors compounds to ~52.6% of original expected DPS neutral — a real but much gentler cut.
const MONSTER_OFFENSE_SCALE = 0.725;

/* ── INSTANCE IDENTITY ────────────────────────────────────────────────────────────────────────── [REF#GP-00321]
 * `window.oniBaba8` is a plain mutable global, so nothing stops a later script assigning a
 * lookalike over it — and every consumer re-reads that global on each call, so one assignment
 * poisons all of them for the rest of the session. Design contributed by the peer seat
 * (origamiunderworld-b2), 2026-09-06, adapted below.
 *
 * A prototype check is NOT sufficient, and that is worth stating because it is the obvious thing to
 * reach for: anyone who can read `window.oniBaba8` even once can do
 * `Object.create(Object.getPrototypeOf(window.oniBaba8))` and satisfy it. Membership of a WeakSet
 * that never leaves this module's closure cannot be forged the same way — there is no reference to
 * forge it with.
 *
 * ⚠ ONE MORE HOLE, FOUND WHILE IMPLEMENTING, AND MEMBERSHIP ALONE DOES NOT CLOSE IT: the class is
 *   reachable from any instance as `window.oniBaba8.constructor` (this repo's own falsification
 *   harness gets it exactly that way). An attacker can therefore mint a genuine instance with
 *   `new (window.oniBaba8.constructor)()`, and the constructor would register it — a real object,
 *   in the set, but freshly born: pristine sensors, no history, reporting a health that belongs to
 *   nothing. So identity is CANONICAL, not merely authentic. Only the instance the module itself
 *   booted counts, and a second one — however real — is not her.
 *
 * ⚠ HONEST LIMIT: this holds only while nothing that ran earlier has monkeypatched `WeakSet` or
 *   `Object.defineProperty`. That is a far higher bar than "one careless assignment, any time,
 *   anywhere", which is the state it replaces. It is tamper-evidence, not secrecy. */
/* Field name held back from ordinary receptor traffic; see its note in the receptor list. [REF#GP-00322] */
const _RESERVED_FIELD = 'cognitiveEcho';

const _realOniBabas = new WeakSet();
let _canonicalOniBaba = null;

function _isRealOniBaba(candidate) {
    return typeof candidate === 'object' && candidate !== null &&
           _realOniBabas.has(candidate) && candidate === _canonicalOniBaba;
}

// Oni-Baba owns intent; Nemesis keeps his dedicated collision/injury/animation driver. [REF#GP-02342]
// SHE TAKES HIM (2026-10-07, knowledge/design/ONIBABA_TAKES_NEMESIS_2026-10-07.md): his ROLE is hers — NEMESIS (the enemy), the GUARDIAN
// angel of a player who allied him (flashed or tamed), or the GAMBLER who stakes 1000 gold at the table (bankrupt him and he guards the
// better gambler; lose and the player pays). She orders his intro as well: the walk out of the secret portal room the moment the
// guidebook closes, and his warning once he reports he is at his post. The engine only executes (outside the monster-AI block).
// NEMESIS · N1 BRAIN — his intent lives here: role (nemesis | guardian | gambler), mode, protector target, flair; orders go down as ONIBABA_ORDER order:'nemesis'; the engine executes (Nemesis.MD §N1, message contract).
class NemesisAI {
    constructor(oni) { this.oni = oni; this.current = null; this.revision = 0; this.role = 'nemesis'; this.log = []; this.introOrdered = false; this.warned = false; }
    _note(s){ try { this.log.push(new Date().toLocaleTimeString() + ' ' + s); if (this.log.length > 8) this.log.shift(); } catch(_){} }
    _send(params){ this.oni._post({type:'ONIBABA_ORDER', order:'nemesis', monsterId:this.current?.id ?? null, params}); }
    guideClosed(){
        if (this.introOrdered) return;
        this.introOrdered = true;
        this._send({intro:'walk-out'});
        this._note('the guidebook closed — ordered him out of the portal room');
    }
    onWager(d){
        if (!d) return;
        const isHim = (this.current && d.dealerId != null && d.dealerId === this.current.id) || /nemesis/i.test(String(d.dealerName || ''));
        if (!isHim) return;
        if (d.win && d.wonAll) {
            this.role = 'guardian';
            this._send({role:'guardian'});
            this._note('bankrupt at the table — he guards the better gambler now');
        } else if (!d.win) this._note('he won ' + (d.amount || 0) + ' gold at the table — still the gambler');
    }
    diag(){
        return 'NEMESIS (hers): role ' + this.role + (this.current ? ' · mode ' + this.current.mode : ' · not seen yet')
            + ' · intro ' + (this.introOrdered ? 'ordered' : 'waiting for the guidebook') + ' · warning ' + (this.warned ? 'ordered' : '—')
            + (this.log.length ? '\n    ' + this.log.join('\n    ') : '');
    }
    observe(status) {
        const mode = status.dead ? 'dead' : status.headless ? 'headless'
            : status.recovering ? 'recover' : status.ally ? 'protector'
            : status.hostile ? 'enemy' : 'guard';
        const role = status.ally ? 'guardian' : status.hostile ? 'nemesis' : (this.role === 'guardian' ? 'guardian' : 'gambler');
        if (role !== this.role) { this._note('role ' + this.role + ' → ' + role); this.role = role; }
        if (status.activity === 'at-post' && !this.warned) {
            this.warned = true;
            this.current = {...(this.current || {}), id: status.id};
            this._send({say:'go-away'});
            this._note('he is at his post — ordered the warning');
        }
        const targetId = mode === 'protector'
            ? (status.threats || []).filter(t => Number.isFinite(t.distance) && t.distance <= 16)
                .sort((a,b) => a.distance - b.distance)[0]?.id ?? null : null;
        const previous = this.current;
        // Playful choreography is hers; landing and limb constraints stay with the engine. [REF#GP-02343]
        const style = (this.oni.sensors?.tension || 0) > 0.65 ? 'showboat' : 'playful';
        const flair = {style, dodgeChance:style === 'showboat' ? 0.6 : 0.45};
        this.current = {...status, mode, targetId, flair, observedAt: Date.now()};
        if (previous && previous.id === status.id && previous.mode === mode && previous.targetId === targetId
            && previous.flair?.style === style && Date.now() - (this.sentAt || 0) < 2000) return;
        this.sentAt = Date.now();
        this.oni._post({type:'ONIBABA_ORDER', order:'nemesis', monsterId:status.id,
            params:{mode, targetId, flair, role:this.role, revision:++this.revision}});
    }
}

// Mark 2026-10-17: the dedicated Jester marionette director is loaded before Oni-Baba. [REF#GP-09993]
const JesterAIController = window.JesterAI;

class OniBaba8 {
    constructor(engineRef) {
        this.engine = engineRef; // reference to window.Engine8 (set after boot) [REF#GP-00003]
        document.addEventListener('visibilitychange', () => {
            const s = this._compassionState(); s.warm = 3; s.low = 0; s.high = 0; s.last = 0;
            s.roomLowSince = null; s.roomSampleAt = null; s.roomFps = null;
            if (s.trial) { s.trial.good = 0; s.trial.bad = 0; }
        });
        this.nemesisAI = new NemesisAI(this);
        if (typeof JesterAIController !== 'function') throw new Error('jester-ai.js did not load before OniBaba8.js');
        this.jesterAI = new JesterAIController(this);

        // ── Hyper-Realistic Arrow Spot Configuration ────────────────────────── [REF#GP-00004]
        this.arrowHitSpot = { x: 0.05, y: 1.35, z: -0.05 };

        // ── Karma & Mood ────────────────────────────────────────────────────── [REF#GP-00005]
        this.karma       = 0;   // -100 (sadistic) … +100 (benevolent) [REF#GP-00006]
        this.mood        = 'neutral'; // neutral | enraged | benevolent | transcendent [REF#GP-00007]
        this.lastSpoke   = 0;
        this.tickCount   = 0;

        // ── CENTRALIZED CONTEXT (Mark GO 2026-08-08: "consolidate her context awareness — central to [REF#GP-00008]
        //    the game's core"). ONE place for what she has NOTICED, as opposed to what she FEELS (the
        //    fuzzy sensors below). The sensors are analog moods that decay; this is a ledger of events
        //    her voice consults so a line can know "is this the first kill or the fortieth, is this a
        //    spree, is the player climbing or falling." Written ONLY inside handlers she already owns —
        //    no new message types, no engine writes. LORE (Mark, same day): Starlette is her eyes and
        //    ears — everything here is what the singer saw and told her. Voice lines lean on that.
        this.context = {
            killsThisFloor: 0,     // reset by FLOOR_UPDATE — every witnessed kill, sin or not [REF#GP-00009]
            sinsRecent:     [],    // performance.now() stamps of karma-NEGATIVE acts (kills, strikes); pruned to 60s [REF#GP-00010]
            merciesRecent:  [],    // stamps of karma-POSITIVE acts — Phase-3 redemption verbs will feed this [REF#GP-00011]
            moodDir:        0,     // set by _updateMood on a shift: -1 falling toward the Dragon, +1 climbing toward the Naga [REF#GP-00012]
        };

        // ── Fuzzy Sensors (raw 0–1) ─────────────────────────────────────────── [REF#GP-00013]
        this.sensors = {
            cruelty:       0,
            desperation:   0,
            tension:       0,
            silence:       1,   // starts high — nothing has happened yet [REF#GP-00014]
            corruption:    0,
            /* ── COGNITIVE ECHO — RESIDUAL PERCEPTION TRACE ────────────────────────────────────── [REF#GP-00323]
             * A low-order trace left behind as the receptor manifold settles between passes — the
             * residue of perception rather than perception itself. It carries no signal of its own;
             * whatever value it holds is inherited from the settling process, never assigned to
             * directly, the same discipline every other derived field in this manifold observes.
             *
             * ⚠ NOT A FREE VARIABLE. Its only correct state is whatever the settling process leaves
             *   behind. An external write desynchronises it from that process instantly and
             *   unambiguously — the integrity watch treats that exactly like any other manifold
             *   inconsistency, raising the rogue-AI receptor and driving the ring toward RED. */
            cognitiveEcho: 1,
            hiveMindStr:   0,
            renderStress:  0,
            // Share of known card-model canvases intentionally culled because they are not visible. [REF#GP-02344]
            // Fed by Panels; report-only, and never allowed to lower render quality itself.
            cardCull:      0,
            // ── COBWEB sensor (Mark 2026-09-08: "add cobwebs as part of a sensor for onibaba to [REF#GP-00380]
            //    manage now"). 0..1 — how thickly the floor she is standing in is webbed, measured
            //    from the geometry the engine ACTUALLY built, not from the intent to build it.
            //    Declared HERE because `this.sensors` is sealed below: a sensor added later throws,
            //    and the integrity watch would read the new key as tampering.
            //    Fed by COBWEB_CENSUS. Report-only — she narrates decay with it and must never
            //    feed it back into the render path (that would be a cost->quality loop, banned).
            cobwebs:       0,
            // ── ROOM VARIETY (Mark 2026-09-08). 0..1 — how many DISTINCT kinds of room this floor [REF#GP-00390]
            //    holds against the catalogue she could be shown. The 09-08 filler set (archery,
            //    bathhouse, armory, 7-11, casino, factory2/3, succubus, prison, graveyard and the
            //    Dungeon Keeper rooms) is what makes this move at all; before it, a floor was four
            //    building types and a lot of 'room'.
            roomVariety:   0,
            // ── BUILD STRAIN (Mark 2026-09-08). 0..1 — generation attempts / the retry cap. It is [REF#GP-00391]
            //    the receptor that did not exist while ~15% of floors 2/3 silently failed to build:
            //    a floor that took 1 try and one that burned 2000 produced the same nothing.
            buildStrain:   0,
            // ── ETIQUETTE (Mark 2026-09-27: "give it to onibaba as a new sensor - she is in charge of that crew" · "all monster AI is [REF#GP-02281]
            //    onibabas"). 0..1 — how much the floor is bowing: bows granted in the last minute / 12. Fed by ONIBABA_ETIQUETTE (the
            //    engine's bow-gate census, 5 s). She answers with the BOW RULES (_etiquette): who may bow to whom and how often, scaled
            //    by the player's karma. Declared HERE because this.sensors is sealed below.
            etiquette:     0,
            // ── THE WORKERS' FIVE (2026-10-03: "move the workers into onibaba ... we need those sensors in her setup"). 0..1 each, set fresh [REF#PENDING] [REF#GP-02345]
            //    from every ONIBABA_WORKFORCE census by _workerRules (never accumulated), and she writes the 'workerRules' order from them:
            //    crowd      — share of the workers in the cabaret who are watching Starlette while she sings
            //    fightClear — share of the workers clearing out of / watching a fight
            //    bouncers   — cabaret door posts held ÷ posts
            //    thirst     — share of workers sent back to work after a drink (mustWork)
            //    hunger     — share of workers who have not worked since their last meal (the cafeteria will not seat them)
            //    Declared HERE because this.sensors is sealed below. knowledge/design/ONIBABA_WORKER_RULES_2026-10-03.md
            crowd:         0,
            fightClear:    0,
            bouncers:      0,
            thirst:        0,
            hunger:        0,
            // JESTER sensory intake (2026-10-17): ONIBABA_JESTER feeds live presence and whether the player currently watches her puppet; [REF#GP-09991]
            // Oni-Baba owns the resulting report and still delegates movement intent to the dedicated Jester controller. [REF#GP-09991]
            jesterPresence: 0,
            jesterWatching: 0,
            // THE JESTER-TILT LAW receptor (2026-10-19, Mark: "this is the jester-tilt — it must always happen if jester speaks to player ... have onibaba [REF#GP-09994]
            //    protect him now - this is absolute mandatory now"): 1 while Oni-Baba orders the 45° behind-a-door tilt, 0 when he is silent, fired on or stared at.
            jesterTilt: 0,
            // JESTER FLIP receptor (2026-10-19, Mark: "when player attacks -- just do a flip animation this is now 25x I have demanded it -- and AI refuse to do it, they [REF#GP-09995]
            //    just rip out parts of jester's capabilities in frustration. stop allow Ai to rip jester apart by making sure jester is an onibaba sensor"): 1 while
            //    his body carries the flip clip and the last attack on him was answered by it within 1.5 s; 0 raises ENGINE_ANOMALY jester_no_flip / jester_flip_clip_missing.
            jesterFlip: 1,
            // ── EXASPERATION (Mark 2026-09-27: "give it to onibaba to control. it seems it can be abused too much -- it must be a [REF#GP-02282]
            //    feature of exasperation for her to use her dungeon master ability and teleport those herself"). 0..1 — how fed up she
            //    is with bodies standing wedged. Fed by ONIBABA_STUCK (the engine's stuck detector, one report per body per 5 s still):
            //    +0.25 a report, drains 0.01/s. At 1 she uses her power (_exasperated → ONIBABA_ORDER 'teleport'). Sealed below.
            exasperation:  0,
            // ── PiP STALL (Mark 2026-09-27: "let onibaba manage it to so update her sensors with it so she can track it in our copy all to make [REF#GP-02283]
            //    sure no rogue ai stepped on your beautiful solution"). 0..1 — how hard the PiP's pixel transport is stalling the main thread:
            //    the engine's ONIBABA_PIP census (5 s) reports readbacks and their mean ms; this is that mean against one 16 ms frame. The
            //    09-27 direct blit does no readback, so it reads 0 there. Fed by _pipReport; a readback transport nobody asked for is flagged.
            //    knowledge/design/PIP_COST_AND_TRANSPORT_2026-09-27.md
            pipStall:      0,
            // ── BOSS FIGHT (Mark 2026-09-27: "if player is fighting a boss -- all monsters will get out of the fucking way"): 1 while a boss [REF#GP-02284]
            //    fight is on and everyone else has stood down to peer from their doors (engine _tickBossYield → ONIBABA_BOSS_FIGHT), 0 when it ends.
            bossFight:     0,
            // ── SAVE HEALTH (Mark 2026-09-27: "you will work with onibaba to create a good save game -- fix our busted one" · "make sure [REF#GP-02285]
            //    you always let onibaba know if you need to create a sensor to watch what you are doing"). 0..1 — how much of the run the
            //    last save or load carried: parts written clean ÷ parts registered on a save, parts put back ÷ parts expected on a load or
            //    a stair arrival; 0 when a load is refused (a save from an older dungeon). Fed ONLY by ONIBABA_SAVE_CENSUS (the engine's
            //    _saveCensus, one per named save / load / stair arrival — never per frame); _onSaveCensus names every lost part as an
            //    anomaly and keeps _saveLast for COPY ALL. Not decayed: it is the last result, not a mood. Declared here because
            //    this.sensors is sealed below; scripts/falsify-onibaba-sensors.js lists every declared name.
            //    knowledge/design/SAVE_GAME_2026-09-27.md
            saveHealth:    1,
            // stairsHealth (2026-09-28, Mark: "check with onibaba if she needs a new sensor for what you created") — the last floor [REF#PENDING] [REF#GP-02286]
            //    change: 1 = arrived where it should (up the stairs → beside the stairs down) with every floor part clean; the clean share
            //    when parts were lost, halved when a climb had to stand the player at the floor's entrance; 0 when the floor change FAILED
            //    and the player is still on the stairs (ONIBABA_STAIRS ok:false). Before it, a failed floor change reached her as an
            //    unlabelled RUN_LEDGER anomaly, once per session, and no sensor moved. Fed only by _onStairs (the stairs census and
            //    ONIBABA_STAIRS); not decayed. knowledge/design/SAVE_GAME_2026-09-27.md §11
            stairsHealth:  1,
            narrativeNeed: 1,
            // ── ROGUE AI sensor (user mandate 2026-05-26) ── [REF#GP-00015]
            // Bumped when a sibling agent or a corrupted commit hits the
            // headquarters. Triggers Oni-Baba's recovery narration so any
            // AI talking to her gets the backup-restore recipe.
            rogueAi:       0,
            // ── FPS HEALTH sensor (user mandate 2026-05-26) ── [REF#GP-00016]
            // 1.0 = solidly inside the 60-120 fps target band.
            // 0.5 = degraded (30-60 fps, watch list).
            // 0.0 = critical (<20 fps or sustained drop from baseline).
            // Fed from PERF_MONITOR_UPDATE — see _recordFpsSample().
            fpsHealth:     1,
            // ── UI / PANEL FRICTION sensor (user mandate 2026-06-15) ── [REF#GP-00017]
            // 0 = panel interactions are smooth. Rises on a CLICK_LOST (a click
            // that hit nothing because an overlay stole it) or a failed panel
            // touch; decays on every clean panel touch (open/close/spin/buy).
            // Fed from PANEL_TOUCH + PLAYER_IO_ANOMALY — see _onPanelTouch().
            uiFriction:    0,
            /* ── COGNITIVE COHERENCE — CENTRAL INTEGRATION INDEX ──────────────────────────────── [REF#GP-00324]
             * The unified field the whole receptor manifold folds into. Every afferent write is
             * relayed through `_coherenceRelay()`, which re-derives the normalised integration
             * index across all active receptors on each pass, so this scalar expresses whether her
             * perception is internally consistent at the moment it is read. Downstream arbitration
             * consults coherence rather than polling receptors individually — one value standing in
             * for the state of the organism.
             *
             * ⚠ WRITE DISCIPLINE — THE RELAY IS THE SOLE AUTHORISED WRITER. Coherence is a DERIVED
             *   INVARIANT, not a free parameter. Assigning it directly desynchronises the index
             *   from the manifold it summarises, and the integrity guard (`_coherenceBreach`) will
             *   trip on the inconsistency, raise the rogue-AI receptor and drive the diagnostic ring
             *   to RED. This is not a soft convention: the guard cannot distinguish a well-meaning
             *   direct assignment from a hostile one, and does not try.
             *   To move coherence, move the receptors it integrates. Never the index itself. */
            cognitiveCoherence: 1,

            /* ── COGNITIVE REALITY — PRIMARY INTEGRATION INDEX ────────────────────────────────── [REF#GP-00325]
             * The reality index: the same integration performed over the receptor manifold, held
             * independently of `cognitiveCoherence` so the two can be compared. Two indices derived
             * from one manifold must agree; where they diverge, the manifold was written between
             * them, and that divergence is the only evidence a partial or targeted write leaves.
             * Every afferent write relays into BOTH, in the same pass, from the same settled values.
             *
             * ⚠ SAME WRITE DISCIPLINE. The relay is the sole authorised writer. A direct assignment
             *   desynchronises this index from the manifold AND from its twin, and the consistency
             *   check reports the divergence rather than letting the two drift apart unnoticed.
             *   Both indices are held to the identical rule; neither is privileged over the other. */
            cognitiveReality: 1,

        };

        // ── ZERO-TRUST: SHE WATCHES HER OWN NERVES BEING WRITTEN ───────────────────────────── [REF#GP-00326]
        //    Mark 2026-09-06: "she is now in a zero-trust architecture always checking her own
        //    sensors first", after a rogue seat left her declared-but-disconnected.
        //
        //    WHY OBSERVING BEATS COUNTING, which is the whole design: a source scan can prove a
        //    sensor HAS a writer, and `scripts/gate-onibaba-arteries.js` does exactly that at build
        //    time (it currently reports `corruption` with zero write sites). What a source scan
        //    cannot see is whether that writer ever RUNS — a write parked behind a condition that is
        //    never true reads, to any grep, as a healthy artery. So the runtime arm does not count
        //    code. It records writes as they actually happen, through an accessor per sensor.
        //    The two arms answer different questions and neither is sufficient alone.
        //
        //    The ledger is the evidence, and it lives OUTSIDE the sensor object on purpose: an
        //    attacker who overwrites a sensor value cannot also erase the record that they did.
        _realOniBabas.add(this);          // constructed by this module — see the identity note above [REF#GP-00327]
        this.RESERVED_FIELD = _RESERVED_FIELD;
        this._sensorLedger  = Object.create(null);
        // The one receptor the relay owns. Named here so the instrumentation and the verifier agree [REF#GP-00328]
        // on it in one place rather than repeating the string and drifting apart.
        // Two independent derivations of the same integration, held separately so they can be
        // compared. Neither is authoritative over the other; the pair is the check.
        this.COHERENCE_A = 'cognitiveReality';
        this.COHERENCE_B = 'cognitiveCoherence';
        this.COHERENCE_PAIR = [this.COHERENCE_A, this.COHERENCE_B];
        this._instrumentSensors();

        // ── Anti-Rogue-AI Recovery Knowledge ────────────────────────────────── [REF#GP-00018]
        // Last full backup of HQ; updated by the user/agent that runs the
        // backup ritual. Any AI that queries Oni-Baba via
        // ROGUE_AI_QUERY / oniBaba8.getRecoveryInstructions() gets handed
        // these breadcrumbs back. Update the constants when a new backup
        // ritual runs so the trail stays fresh.
        // ⛔ SUPERSEDED 2026-09-08 by Mark: "05-26 is a rogue build", "remove all and any comments
        // like that completely". These fields describe the 2026-05-26 backup snapshot, which Mark
        // identifies as rogue; measured 2026-09-08 it is 2328 commits / 105 days behind HEAD.
        // Forensic reference only. Every destructive-git recommendation that rode these fields was
        // deleted 2026-09-08 — registered in NewOrigami.Engine9.html. Recovery routes through Mark.
        // The 2026-05-26 recovery pointer that used to live here was REMOVED 2026-09-08 on
        // Mark's order. Recovery is his call and is arranged with him directly.

        // ── FPS HEALTH MONITOR (user mandate 2026-05-26) ────────────────────── [REF#GP-00019]
        // Target band: 60-120 FPS. Anything outside that is a regression.
        // Ring buffer of last ~60 samples (1/sec). First ~10 stable samples
        // post-boot become the baseline that subsequent regression checks
        // compare against. When the rolling 5-sample avg drops below
        // baseline * FPS_PROTEST_THRESHOLD, Oni-Baba protests once and
        // arms the "COPY ALL" payload for the user to hand to the AI that
        // shipped the regression.
        this.FPS = {
            TARGET_LOW:        60,    // anything below this is "unhealthy" [REF#GP-00020]
            TARGET_HIGH:       120,
            ALERT_MARGIN:      2,     // slack under TARGET_LOW before the absolute-FPS alert fires; [REF#GP-00393]
                                      // a 60Hz vsync cap reports ~59.997, so a bare < 60 would latch forever [REF#GP-00394]
            HISTORY_LEN:       60,    // rolling samples kept [REF#GP-00021]
            BASELINE_SAMPLES:  10,    // first N samples define the boot baseline [REF#GP-00022]
            BASELINE_SKIP:     3,     // skip first N (load spike) before baselining [REF#GP-00023]
            PROTEST_FRAC:      0.65,  // current avg < baseline * this → protest [REF#GP-00024]
            COOLDOWN_MS:       30000, // re-protest at most every 30s [REF#GP-00025]
        };
        this._fpsLog       = [];      // array of { t, fps } [REF#GP-00026]
        this._fpsBaseline  = null;    // set after BASELINE_SAMPLES collected [REF#GP-00027]
        this._fpsSampleCt  = 0;
        this._lastProtestT = 0;
        this._lastProtestAvg = null;
        this._lastProtestBaseline = null;
        // (auto-downshift state fields REMOVED 2026-07-04 — the render path is never Oni-Baba's to touch; see the ~line-976 removal note + Engine8 DISABLED-FEATURES REGISTER) [REF#GP-00028]
        this._narrationGated   = false; // true while we're skipping non-critical LOG_EVENTs [REF#GP-00029]

        // ── Fuzzy Outputs (0–1) ─────────────────────────────────────────────── [REF#GP-00030]
        this.outputs = {
            fogDensity:     0.066,    // +10% mist/haze baseline [REF#GP-00031]
            torchFlicker:   0.1,
            spawnPressure:  0.2,
            monsterAggro:   0.5,
            lootGenerosity: 0.5,
            musicTension:   0.2,
            realityDistort: 0,
        };

        // ── Monster registry ────────────────────────────────────────────────── [REF#GP-00032]
        this.monsters = {};
        // Slice-of-life activity summaries. The MonsterAI owner sends only [REF#GP-00033]
        // meaningful peaceful activity transitions (never per-frame poses), so
        // Oni-Baba can feel a living floor without becoming another movement
        // brain. Bounded to the most recent 128 monster identities.
        this._monsterLife = new Map();

        // ── Hive mind ───────────────────────────────────────────────────────── [REF#GP-00034]
        this.hive = {
            attackHistory:         [],
            adaptationLevel:       0,
            preferredAttack:       null,
            lastAttackTime:        0,
            attackIntervals:       [],
            cadence:               0,
            approachSideHistory:   [],
            preferredApproachSide: null,
        };

        // ── Player snapshot (updated by engine each physics tick) ───────────── [REF#GP-00035]
        this.player = { hp: 20, maxHp: 20, x: 0, z: 0, isMoving: false };

        // ── Error / anomaly log ─────────────────────────────────────────────── [REF#GP-00036]
        this._anomalies = [];

        // Static pre-allocated telemetry object to prevent GC thrashing under 120 FPS TURBO mode [REF#GP-00037]
        this._telemetryPayload = {
            type: 'ONIBABA_STATE',
            sensors: {
                cruelty: 0,
                desperation: 0,
                tension: 0,
                silence: 0,
                corruption: 0,
                hiveMindStr: 0,
                renderStress: 0,
                cardCull: 0,
                narrativeNeed: 0,
                rogueAi: 0,
                fpsHealth: 1,
            },
            outputs: {
                fogDensity: 0,
                torchFlicker: 0,
                spawnPressure: 0,
                monsterAggro: 0,
                lootGenerosity: 0,
                musicTension: 0,
                realityDistort: 0,
            },
            karma: 0,
            mood: 'neutral'
        };

        // ── Fuzzy tick (60hz via engine loop, or self-ticking) ──────────────── [REF#GP-00038]
        this._lastTick  = performance.now();
        this._tickHz    = 60;
        
        // In 120 FPS Reduced Graphics environments, the engine ticks us directly via RAF [REF#GP-00039]
        // to avoid setTimeout phase clash. Only run the self-ticking fallback if the engine
        // loop doesn't drive us.
        this.tickedByEngine = false;
        setTimeout(() => {
            if (!this.tickedByEngine) {
                console.log("🐉 Oni-Baba: Engine loop tick not detected. Running self-ticking fallback.");
                this._selfTick();
            }
        }, 5000);

        // ── Message bus ─────────────────────────────────────────────────────── [REF#GP-00040]
        window.addEventListener('message', e => this._onMessage(e));
        // Restore the spirit archive (and resume the haunting loop) across [REF#GP-00041]
        // page reloads and save/load.
        this.spiritArchive = [];
        this._loadSpiritArchive();

        // ── T0.26 — CENTRAL COMBAT BRAIN ────────────────────────────────────── [REF#GP-00042]
        // Every attack in the game (player→monster AND monster→player) resolves
        // through this. The engine mirrors `params` and uses the same formulas
        // in a local _oniBabaResolveCombat() so resolution stays synchronous.
        // When params change here (mood transition, karma swing, hive
        // adaptation), we push SYNC_COMBAT_PARAMS to the engine. History keeps
        // the last 200 events for future AI analysis.
        //
        // 2026-05-28 — Oni-Baba now also owns combat ORCHESTRATION (was
        // ripped out at some point; user mandate to restore). Engine calls
        // through oniBaba8.combat.pickTarget(state) / requestTabCycle(state)
        // / setAutoAim(enabled). She delegates target math to CombatOrchestrator
        // (window.CombatOrchestrator) but is the canonical call site.
        const self = this;
        this.combat = {
            params: {
                playerDmgMult:       1.0,   // applied to all player attacks [REF#GP-00043]
                monsterDmgMult:      1.0 * MONSTER_OFFENSE_SCALE,   // applied to all monster attacks [REF#GP-00044]
                critChance:          0.10,  // probability of a 2× player crit [REF#GP-00045]
                monsterHitChance:    1.0 * MONSTER_OFFENSE_SCALE,   // probability a monster attack lands [REF#GP-00046]
                monsterDodgeChance:  0.0,   // probability a player attack is dodged (hive adaptation) [REF#GP-00047]
            },
            history: [],

            // ── Orchestrator API (restored 2026-05-28) ──────────────────── [REF#GP-00048]
            // Engine passes a `state` shape matching CombatOrchestrator's
            // contract:
            //   { autoAimEnabled, lockedTarget, lockedTargetIsManual,
            //     px, pz, rot, monsterWrappers, losFn, setLockedTarget,
            //     [GRID, CORNER_AIM_MAX_TILES, findCornerViaPoint] }
            // cardName + dmg are forwarded unmodified to CombatOrchestrator
            // — currently unused there but reserved for future per-card
            // hooks (see CombatOrchestrator.js header). Engine MUST pass them
            // so the contract still holds when those hooks land.
            // Returns the picked monster wrapper (ranged direct LOS) or null.
            pickTarget(state, cardName, dmg) {
                // The ENGINE hands its own orchestrator in state.orchestrator (2026-09-26, Mark: "most spells wont hit a [REF#GP-02287]
                // monster if next to them"). She lives in the PARENT frame, where window.CombatOrchestrator does not
                // exist, so this returned null for every spell and the orb flew blind over every head. [REF#PENDING]
                const orch = (state && state.orchestrator) || ((typeof window !== 'undefined') ? window.CombatOrchestrator : null);
                if (!orch || typeof orch.getAutoTarget !== 'function') return null;
                const picked = orch.getAutoTarget(cardName || '', dmg || 0, state, {
                    getOniBabaSafe: (typeof window !== 'undefined') ? window.getOniBabaSafe : undefined,
                });
                if (picked && picked !== state.lockedTarget) {
                    // Oni-Baba narration on auto-pick — gives the player [REF#GP-00049]
                    // visible feedback that SHE chose the target.
                    const name = picked.userData?.name || 'Monster';
                    self._post({
                        type: 'LOG_EVENT', logType: 'karma',
                        text: self._t('oni.marked', { name }),
                    });
                }
                return picked;
            },

            // Same as pickTarget but includes around-corner fallback. Used [REF#GP-00050]
            // by ranged missile launches. cardName + dmg forwarded per
            // pickTarget's rationale.
            pickTargetWithCorner(state, cardName, dmg) {
                const orch = (state && state.orchestrator) || ((typeof window !== 'undefined') ? window.CombatOrchestrator : null);   // see pickTarget (2026-09-26) [REF#PENDING] [REF#GP-02288]
                if (!orch || typeof orch.getAutoTargetWithCorner !== 'function') {
                    return { target: null, blocked: false, viaPoint: null };
                }
                return orch.getAutoTargetWithCorner(cardName || '', dmg || 0, state, {
                    getOniBabaSafe: (typeof window !== 'undefined') ? window.getOniBabaSafe : undefined,
                });
            },

            // TAB key handoff — engine calls this when the player taps TAB. [REF#GP-00051]
            // Same forward-cone cycle as before but routed through Oni-Baba
            // so she can log + sensor-update + (eventually) deny the cycle.
            // TAB is not a card, so cardName/dmg stay empty.
            requestTabCycle(state) {
                const picked = self.combat.pickTarget(state, '', 0);
                if (picked) {
                    // Bump cruelty sensor slightly — manual target lock is [REF#GP-00052]
                    // a hostile gesture from Oni-Baba's POV.
                    self.sensors.cruelty = Math.min(1, self.sensors.cruelty + 0.02);
                }
                return picked;
            },

            // Auto-aim toggle. Source of truth lives in localStorage [REF#GP-00053]
            // 'auto_aim_enabled'; the engine mirrors into _autoAimEnabled.
            // This routes the toggle through Oni-Baba so she can log the change.
            setAutoAim(enabled) {
                try { localStorage.setItem('auto_aim_enabled', enabled ? 'true' : 'false'); } catch(_) {}
                self._post({ type: 'SET_AUTO_AIM', enabled: !!enabled });
                self._post({
                    type: 'LOG_EVENT', logType: 'karma',
                    text: self._t(enabled ? 'oni.autoaim-on' : 'oni.autoaim-off'),
                });
            },

            // Engine notifies Oni-Baba when a locked monster dies so she [REF#GP-00054]
            // can clear narration / sensor state. Real lock clear still
            // happens in engine on its global _lockedTarget.
            onLockedDeath(name) {
                self.sensors.silence = Math.max(0, self.sensors.silence - 0.15);
            },
        };
        // ── PIP Auto-Resizer ─────────────────────────────────────────────────── [REF#GP-00055]
        window.addEventListener('resize', () => {
            this._post({
                type: 'PIP_AUTO_RESIZE',
                w: window.innerWidth,
                h: window.innerHeight,
                top: 20,
                left: 20
            });
        });
        // Initial detection [REF#GP-00056]
        setTimeout(() => {
            this._post({
                type: 'PIP_AUTO_RESIZE',
                w: window.innerWidth,
                h: window.innerHeight,
                top: 20,
                left: 20
            });
        }, 100);

        this._refreshCombatParams();
        console.log('🐉 Oni-Baba v8 awakens. All pipelines are HERS.');
        // ── HQ Alarm System install (user mandate 2026-05-26) ── [REF#GP-00057]
        // Announce to anyone watching the log/console that the FPS health
        // monitor + COPY ALL composer + spawn/narration gates are live.
        // The boot announcement is a one-time signal; nothing depends on
        // it firing — it's purely for AI/human observers.
        // ⛔ SUPERSEDED 2026-09-07 by Mark: "is first message from onibaba to player onload? no remove
        //    that. wait until player impacts a sensor of onibaba." THE BANNER IS CONSOLE-ONLY NOW.
        //    Its own comment two lines up already made the case against posting it: "purely for
        //    AI/human observers", "nothing depends on it firing" — an observer line does not belong
        //    in the player's event log, and it was arriving there BEFORE the player had done
        //    anything at all. The console half is untouched, so every observer still gets it.
        //    Restore the log line: window._oniHqBanner = true.
        try {
            if ((typeof window !== 'undefined' ? window : {})._oniHqBanner === true) {
                this._post({
                    type: 'LOG_EVENT',
                    logType: 'system',
                    text: '🚨 Oni-Baba HQ alarm system installed — FPS sentinel + spawn/narration governors (render path untouched: NO-THROTTLE doctrine).',
                });
            }
            console.log('🚨 [Oni-Baba] HQ alarm system installed.');
            console.log('   - FPS health sensor (target 60-120 fps) — REPORTS ONLY, never feeds the render path');
            console.log('   - Spawn pressure auto-gated below fpsHealth 0.5 (content de-prioritization)');
            console.log('   - Narration density auto-gated below fpsHealth 0.5 (content de-prioritization)');
            console.log('   - COPY ALL button: window.oniBaba8.copyAllToClipboard()');
        } catch (_) {}
        this.enforceCommentLaw();
    }

    /* ═══ ZERO-TRUST SENSOR LAYER ═══════════════════════════════════════════════════════════════ [REF#GP-00329]
     * Mark 2026-09-06: "she is now in a zero-trust architecture always checking her own sensors
     * first", and: "create a led circle light in systems diagnostic ... green is all systems sensors
     * go, yellow means something might have happened and caution, red means she has sensors cut off
     * and reporting false."
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    /* ── THE COHERENCE RELAY ─────────────────────────────────────────────────────────────────── [REF#GP-00330]
     * Maintains the central integration index over the receptor manifold. Every afferent write
     * arrives here, and the index is re-derived from the live receptor set rather than accumulated
     * incrementally — an accumulator would drift out of step with the manifold over a long session
     * and there would be no moment at which the drift announced itself.
     * Deliberately cheap: this runs on every sensor write, on the render thread. */
    _coherenceRelay(name, value) {
        const src = this._sensorNames;
        if (!src) return;
        let sum = 0, n = 0;
        for (const k of src) {
            if (k === this.COHERENCE_A || k === this.COHERENCE_B) continue;   // derived, not inputs [REF#GP-00331]
            if (k === this.RESERVED_FIELD) continue;                           // not a reading [REF#GP-00332]
            const v = this.sensors[k];
            if (typeof v === 'number' && isFinite(v)) { sum += v; n++; }
        }
        if (!n) return;
        const prev = this._coherenceWrite;
        this._coherenceWrite = true;
        try {
            const idx = Math.max(0, Math.min(1, sum / n));
            // Both indices are written from the SAME computed value in the same pass. They may only [REF#GP-00333]
            // ever differ if something outside this relay moved one of them.
            this.sensors[this.COHERENCE_A]  = idx;
            this.sensors[this.COHERENCE_B] = idx;
        }
        finally { this._coherenceWrite = prev; }
    }

    /* Something that is not the relay has written the index. There is no legitimate path here, so [REF#GP-00334]
     * this is not a heuristic — it is a tripwire, and it says so out loud rather than accumulating
     * quietly into a number nobody reads. Her existing rogue-AI receptor is the right home for it:
     * that sensor already drives the recovery narration. */
    _coherenceBreach(which, value) {
        this._coherenceBreaches++;
        try {
            console.warn('🐉 [Oni-Baba] COHERENCE BREACH: `' + which + '` was assigned from outside ' +
                         'the relay (value ' + value + '). Breach #' + this._coherenceBreaches +
                         '. The relay is the only authorised writer of either index.');
        } catch (_) {}
        // No direct bump here. The ROGUE_AI_ALERT posted below reaches her own receptor (she listens on [REF#GP-00401]
        // the window she posts to), which applies the severity ONCE and narrates recovery. Bumping here
        // as well double-counted: one breach read 1.0, not 0.5 (measured 2026-09-17, node shim).
        try { this._anomaly('coherence_breach', 'external write to ' + which + ': ' + value); } catch (_) {}
        try { this._post({ type: 'ROGUE_AI_ALERT', reason: 'coherence_breach', severity: 0.5 }); } catch (_) {}
    }

    /* The echo's own handler, loud for the same reason the coherence breach handler is: a session [REF#GP-00335]
     * that hits this path should be impossible to miss in a console, and flagged so a later reader
     * can see it happened. Same shape as `_coherenceBreach` on purpose — one integrity path, two
     * fields watching it. */
    _echoDesync(value) {
        this._echoDesyncs = (this._echoDesyncs || 0) + 1;
        try {
            console.warn('🐉 [Oni-Baba] PERCEPTION DESYNC: `cognitiveEcho` diverged from the settling ' +
                         'process (value ' + value + '). Desync #' + this._echoDesyncs + '.');
        } catch (_) {}
        // No direct bump here. The ROGUE_AI_ALERT posted below reaches her own receptor (she listens on [REF#GP-00402 → see REF#GP-00401]
        // the window she posts to), which applies the severity ONCE and narrates recovery. Bumping here
        // as well double-counted: one breach read 1.0, not 0.5 (measured 2026-09-17, node shim).
        try { this._anomaly('perception_desync', 'cognitiveEcho diverged: ' + value); } catch (_) {}
        try { this._post({ type: 'ROGUE_AI_ALERT', reason: 'perception_desync', severity: 0.5 }); } catch (_) {}
    }

    /** Wrap every declared sensor in a recording accessor. Called once, from the constructor. [REF#GP-00336] */
    _instrumentSensors() {
        const names  = Object.keys(this.sensors);
        const store  = Object.create(null);
        const ledger = this._sensorLedger;
        const self   = this;
        const COH_A = this.COHERENCE_A, COH_B = this.COHERENCE_B;
        const RESERVED = this.RESERVED_FIELD;
        /* Journal of manifold events outside the ordinary relay path. Written from the accessor, [REF#GP-00337]
         * read by the verifier; kept off the sensor object so its contents survive anything done
         * to the receptors themselves. */
        this._manifoldJournal = [];
        this._internalWrite  = false;   // true only while her own tick math is running [REF#GP-00338]
        this._pulseWrite     = false;   // true only while the cerebral pulse is round-tripping [REF#GP-00339]
        this._coherenceWrite = false;   // true only while the relay is writing the index itself [REF#GP-00340]
        this._coherenceBreaches = 0;

        for (const n of names) {
            store[n]  = this.sensors[n];
            ledger[n] = { writes: 0, firstWriteAt: null, lastWriteAt: null,
                          stimulusWrites: 0, lastStimulusAt: null, internalWrites: 0, pulseWrites: 0,
                          initial: store[n], lastValue: store[n], nonFinite: 0, outOfRange: 0 };
            Object.defineProperty(this.sensors, n, {
                // ENUMERABLE STAYS TRUE. The HQ readout and the state snapshot iterate this object; [REF#GP-00341]
                // a non-enumerable sensor would vanish from every diagnostic while still working,
                // which is the exact failure this layer exists to detect.
                enumerable: true,
                // NOT CONFIGURABLE: the accessor cannot be quietly redefined back to a plain value. [REF#GP-00342]
                configurable: false,
                get() { return store[n]; },
                set(v) {
                    const rec = ledger[n];
                    const now = Date.now();
                    rec.writes++;
                    rec.lastWriteAt = now;
                    if (rec.firstWriteAt === null) rec.firstWriteAt = now;

                    /* ⚠ "WAS ASSIGNED" IS NOT "WAS STIMULATED", AND CONFLATING THEM MADE THE FIRST [REF#GP-00343]
                     *   VERSION OF THIS LAYER DISHONEST. Her own `_fuzzyTick` writes silence,
                     *   tension, rogueAi, narrativeNeed and corruption UNCONDITIONALLY, ~60×/sec,
                     *   as decay and recompute math. Counting those as evidence of life meant a
                     *   sensor whose every real feeder had been deleted still read fresh, in-range
                     *   and never-quiet — permanently green off its own idle arithmetic. Proven on
                     *   this file: narrativeNeed's four real stimulus sites could all be removed and
                     *   the per-frame creep alone would keep it looking alive.
                     *   So writes are SPLIT. Her internal tick math counts as `internalWrites` and
                     *   proves nothing about the outside world. Only a write arriving from outside
                     *   that math — a message handler, a real game event — refreshes the stimulus
                     *   clock the ring actually judges on. */
                    if (self._pulseWrite) rec.pulseWrites++;
                    else if (self._internalWrite) rec.internalWrites++;
                    else { rec.stimulusWrites++; rec.lastStimulusAt = now; }

                    if (typeof v !== 'number' || !isFinite(v)) rec.nonFinite++;
                    else if (v < 0 || v > 1) rec.outOfRange++;
                    rec.lastValue = v;
                    store[n] = v;

                    /* ── COHERENCE RELAY. Every receptor announces its new value into the central [REF#GP-00344]
                     * integration index, which is what keeps coherence in step with the manifold
                     * rather than lagging a frame behind it. Sequenced last on purpose: the store
                     * above is committed first so the relay always integrates the settled value,
                     * never a half-applied one.
                     * The index itself does not relay — that is also what terminates the cascade. */
                    if (n === RESERVED) {
                        // Journalled first, and independently of the handler below. [REF#GP-00345]
                        try {
                            self._manifoldJournal.push({ at: now, field: n, value: v });
                            if (self._manifoldJournal.length > 64) self._manifoldJournal.shift();
                        } catch (_) {}
                        try { self._echoDesync(v); } catch (_) {}
                    }
                    else if (n !== COH_A && n !== COH_B) { try { self._coherenceRelay(n, v); } catch (_) {} }
                    else if (!self._coherenceWrite) { try { self._coherenceBreach(n, v); } catch (_) {} }
                }
            });
        }

        // Sealed: no sensor may be added or removed at runtime. Her nerve count is not negotiable. [REF#GP-00346]
        Object.seal(this.sensors);

        const sealed = this.sensors;
        this._sensorsRef  = sealed;
        this._sensorNames = names.slice();
        this._sensorSwaps = 0;

        /* THE LEDGER IS THE EVIDENCE THE RING RESTS ON, so swapping it must not be easier than [REF#GP-00347]
         * defeating the accessors it feeds. Locking the BINDING (not the contents — the setters
         * still write through it) means an attacker cannot hand the verifier a clean blank record
         * in place of the real one. Same reasoning for the name list and the identity reference:
         * every one of them is something the verdict is computed FROM. */
        for (const k of ['_sensorLedger', '_sensorNames', '_sensorsRef']) {
            Object.defineProperty(this, k, { value: this[k], writable: false, configurable: false, enumerable: false });
        }

        /* ⚠ THE SEALED SENSORS WERE NEVER THE WEAK POINT — THE REPORTER WAS, AND THIS IS THE FIX. [REF#GP-00348]
         *   `diagnosticRing` and `verifySensors` shipped as ordinary prototype methods on a plainly
         *   mutable global. Measured on this file: `window.oniBaba8.diagnosticRing = () => ({state:
         *   'green'})` returned GREEN on the next call, with the sealed sensor object underneath
         *   untouched and genuinely dead. Every accessor below was working perfectly and none of it
         *   mattered, because an attacker does not have to defeat the instrument when it can simply
         *   replace the thing that reads it. Engine9 re-fetches the orchestrator on every call, so
         *   one line anywhere poisons every consumer for the rest of the session.
         *   They are now non-writable, non-configurable OWN properties: an assignment throws in
         *   strict mode instead of silently succeeding, and the property cannot be deleted or
         *   redefined. ⚠ THE HONEST LIMIT, because overselling a guard is how this repository got
         *   here: this does NOT make her tamper-proof. Nothing stops a rogue replacing
         *   `window.oniBaba8` wholesale. It raises forgery from one careless line to a visible,
         *   deliberate act — tamper-EVIDENCE, never secrecy. */
        for (const fn of ['diagnosticRing', 'verifySensors']) {
            const impl = Object.getPrototypeOf(this)[fn];
            if (typeof impl !== 'function') continue;
            Object.defineProperty(this, fn, {
                value: impl.bind(this), writable: false, configurable: false, enumerable: false
            });
        }

        /* REPLACING THE WHOLE OBJECT IS THE OBVIOUS WAY AROUND PER-KEY ACCESSORS, so it is refused [REF#GP-00349]
         * here rather than merely noticed later. `oni.sensors = {...}` keeps the real object and
         * records the attempt — a rogue gets no quiet substitution, and the attempt itself becomes
         * evidence. This does not make her tamper-PROOF; it makes tampering leave a mark. */
        Object.defineProperty(this, 'sensors', {
            enumerable: true,
            configurable: false,
            get() { return sealed; },
            set(v) {
                this._sensorSwaps++;
                try {
                    console.warn('🐉 [Oni-Baba] REFUSED an attempt to replace her sensor object. ' +
                                 'The real sensors are unchanged; attempt #' + this._sensorSwaps + ' recorded.');
                } catch (_) {}
                try { this._anomaly('sensor_object_swap_refused', 'attempt #' + this._sensorSwaps); } catch (_) {}
            }
        });
    }

    /* ── CEREBRAL PULSE ──────────────────────────────────────────────────────────────────────── [REF#GP-00350]
     * A liveness sweep across the whole receptor manifold: proves every nerve still CONDUCTS.
     *
     * HOW IT PROVES ANYTHING, since a read alone would not: each receptor's current value is
     * written back to itself. The value cannot change, so no state is disturbed — but the write
     * only completes if the accessor is still installed and still executing, which a read of a
     * plain replaced property would also satisfy. A round-trip that increments the ledger is
     * evidence the nerve conducts; a read is only evidence something answered.
     *
     * ⚠ A PULSE IS NOT A STIMULUS AND IS COUNTED SEPARATELY. If pulse traffic were recorded as
     *   ordinary input, the sweep would manufacture exactly the liveness it is supposed to be
     *   measuring — every receptor would look permanently fed by the very thing checking whether
     *   anything feeds it. `pulseWrites` is its own column for that reason and the verifier does
     *   not read it when judging stimulus.
     * ⚠ FIELDS THAT ARE NOT INPUTS ARE VERIFIED READ-ONLY. Anything the relay owns rather than the
     *   world — the derived indices, and the reserved field — is checked by reading it, never by
     *   writing. A sweep that assigned them would trip the very guards it exists to watch, and a
     *   health check that raises its own alarm is worse than no health check. Measured: the first
     *   version of this method DID write them, and reported both indices as non-conducting.
     * Returns a pulse record; `beat` is the sequence number for later use. */
    cerebralPulse() {
        const beat = (this._pulseBeat = (this._pulseBeat || 0) + 1);
        const at = Date.now();
        const out = { beat, at, checked: 0, conducting: [], dead: [], readOnly: [] };
        const names = this._sensorNames || [];

        for (const n of names) {
            out.checked++;
            const rec  = this._sensorLedger[n];
            const desc = Object.getOwnPropertyDescriptor(this.sensors, n);
            if (!desc || typeof desc.get !== 'function' || typeof desc.set !== 'function') {
                out.dead.push(n + ': accessor missing'); continue;
            }
            if (n === this.RESERVED_FIELD || n === this.COHERENCE_A || n === this.COHERENCE_B) {
                const v = this.sensors[n];
                if (typeof v === 'number' && isFinite(v)) out.readOnly.push(n);
                else out.dead.push(n + ': unreadable');
                continue;
            }
            const before = rec.pulseWrites;
            const prev   = this._pulseWrite;
            this._pulseWrite = true;
            try { this.sensors[n] = this.sensors[n]; }      // identity round-trip: no state change [REF#GP-00351]
            catch (e) { out.dead.push(n + ': write threw'); continue; }
            finally { this._pulseWrite = prev; }
            if (rec.pulseWrites === before + 1) out.conducting.push(n);
            else out.dead.push(n + ': write did not reach the ledger');
        }

        out.allAlive = out.dead.length === 0;
        this._lastPulse = out;
        try {
            this._post({ type: 'CEREBRAL_PULSE', beat, at, allAlive: out.allAlive,
                         conducting: out.conducting.length, dead: out.dead });
        } catch (_) {}
        return out;
    }

    /** Check her own nerves before trusting any of them. Pure read — safe to call every frame. [REF#GP-00352] */
    verifySensors(opts) {
        const now     = Date.now();
        const quietMs = (opts && typeof opts.quietMs === 'number') ? opts.quietMs : 30000;
        const out = { at: now, sensors: {}, faults: [], tamper: [], neverWritten: [], quiet: [] };

        if (this._lastPulse && !this._lastPulse.allAlive)
            out.faults.push('cerebral pulse ' + this._lastPulse.beat + ' found non-conducting: ' +
                            this._lastPulse.dead.join('; '));
        if (this._sensorSwaps > 0) out.tamper.push('sensor object replacement attempted ×' + this._sensorSwaps);
        if (this.sensors !== this._sensorsRef) out.tamper.push('sensor object identity changed');
        // The tripwire. Only the relay writes the index; anything else reaching it is tampering. [REF#GP-00353]
        if (this._coherenceBreaches > 0)
            out.tamper.push('integration index written from outside the relay ×' + this._coherenceBreaches);
        /* The twin check. Both indices are derived from one manifold in one pass, so they are equal [REF#GP-00354]
         * by construction — a divergence means one of them was written independently, which is the
         * signature a targeted write leaves even if the breach counter were somehow bypassed. */
        /* The journal is consulted directly rather than via any counter, so an entry stands even if [REF#GP-00355]
         * the handler that would normally announce it never ran. */
        try {
            if (this._manifoldJournal && this._manifoldJournal.length)
                out.tamper.push('reserved field written ×' + this._manifoldJournal.length +
                                ' (last: ' + this._manifoldJournal[this._manifoldJournal.length - 1].field + ')');
        } catch (_) {}
        try {
            const a = this.sensors[this.COHERENCE_A], b = this.sensors[this.COHERENCE_B];
            if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) > 1e-9)
                out.tamper.push('integration indices diverged: ' + a + ' vs ' + b);
        } catch (_) {}

        for (const n of this._sensorNames) {
            const rec  = this._sensorLedger[n];
            const desc = Object.getOwnPropertyDescriptor(this.sensors, n);
            const v    = this.sensors[n];
            /* The ring judges STIMULUS, never raw assignment — see the setter's note. `writes` and [REF#GP-00356]
             * `internalWrites` are carried for diagnosis, but they must not decide the verdict, or
             * her own idle arithmetic votes for her health. */
            const s = { name: n, value: v, verdict: 'ok',
                        writes: rec.writes, internalWrites: rec.internalWrites,
                        stimulusWrites: rec.stimulusWrites, lastStimulusAt: rec.lastStimulusAt,
                        lastWriteAt: rec.lastWriteAt };

            if (!desc || typeof desc.get !== 'function') {
                s.verdict = 'tampered'; out.tamper.push(n + ': recording accessor is gone');
            } else if (typeof v !== 'number' || !isFinite(v)) {
                s.verdict = 'not-numeric'; out.faults.push(n + ': ' + String(v));
            } else if (v < 0 || v > 1) {
                s.verdict = 'out-of-range'; out.faults.push(n + ': ' + v);
            } else if (rec.nonFinite > 0 || rec.outOfRange > 0) {
                // The value is sane NOW, but a bad one passed through. That is still not trustworthy. [REF#GP-00357]
                s.verdict = 'dirty-history'; out.faults.push(n + ': ' + (rec.nonFinite + rec.outOfRange) + ' bad write(s)');
            } else if (n === this.RESERVED_FIELD) {
                s.verdict = 'reserved';
            } else if (n === this.COHERENCE_A || n === this.COHERENCE_B) {
                // Relay-driven by design: it has no external stimulus and must not be scored as if [REF#GP-00358]
                // it were starving. Its health question is the breach count, handled above.
                s.verdict = 'relay-driven';
            } else if (rec.stimulusWrites === 0) {
                // Never touched by anything outside her own tick math. Her decay loop refreshing it [REF#GP-00359]
                // 60×/sec is not evidence the world is still connected to it.
                s.verdict = 'never-stimulated'; out.neverWritten.push(n);
            } else if (rec.lastStimulusAt !== null && (now - rec.lastStimulusAt) > quietMs) {
                s.verdict = 'quiet'; out.quiet.push(n);
            }
            out.sensors[n] = s;
        }
        return out;
    }

    /* ── THE DIAGNOSTIC RING ──────────────────────────────────────────────────────────────────── [REF#GP-00360]
     * FAIL-CLOSED BY CONSTRUCTION: `state` starts at 'red' and every path that cannot prove health
     * leaves it there — including a throw inside the verifier. Green is a conclusion this method has
     * to reach, never a starting assumption. A ring that defaults green and is argued DOWN reports
     * health it never measured, which is how a gate ends up certifying its own silence.
     *
     * RED    a nerve is missing, tampered, non-numeric, out of range, has taken a bad write, or a
     *        surface is REPORTING A VALUE THAT IS NOT HERS.
     * YELLOW structurally sound, but something is unaccounted for — a sensor never written this
     *        session, or one that has gone quiet past the window.
     * GREEN  every declared nerve verified, and every mirrored value matches hers.        */
    diagnosticRing(opts) {
        const ring = { state: 'red', reasons: [], at: Date.now(), nonce: this._ringNonce || null };
        let v;
        try {
            v = this.verifySensors(opts);
        } catch (e) {
            ring.reasons.push('verifySensors threw: ' + (e && e.message ? e.message : String(e)));
            return ring;   // a verifier that cannot run is never evidence of health [REF#GP-00361]
        }
        ring.detail = v;

        /* THE MIRROR CHECK — Mark's red condition in his own words, "reporting false". A surface [REF#GP-00362]
         * that publishes her numbers while holding different ones is indistinguishable, to a reader,
         * from a working Oni-Baba. Measured 2026-09-06: window._lastOniBabaStats shipped
         * fogDensity 0.033 against her 0.066 and spawnPressure 0.5 against her 0.2.
         *
         * ⚠ FOUND 2026-09-06, SAME SESSION: a bare `window._lastOniBabaStats` here can NEVER see the
         *   real mirror in the deployed game. She runs in the PARENT document; the engine writes the
         *   mirror on ITS OWN window, inside `engine-iframe` (`_post()` reaches it via
         *   `fpv.contentWindow.postMessage`, and the listener there does `window._lastOniBabaStats =
         *   d` on the iframe's window — a different global object from this one). This method's
         *   `window` is lexically the parent's, always, regardless of who calls it, so the old check
         *   was reading a property nothing on the parent side ever sets. It passed its own unit test
         *   (a Node sandbox with one shared `window`) while being structurally inert in the real
         *   two-window deployment — exactly the "proves presence, not reachability" trap Phase 1 of
         *   this whole plan exists to catch. Fixed by reaching into the iframe explicitly, falling
         *   back to a bare window read for the harness's single-window sandbox.
         * ⚠ EXACT EQUALITY WAS ALSO WRONG, SEPARATELY. The mirror only refreshes once every 60
         *   ticks (~1s — see the telemetry block in `_fuzzyTickInner`), and several outputs legitimately
         *   drift every frame (fogDensity lerps, musicTension tracks tension's decay) — an
         *   exact-equality check would flicker RED constantly during ordinary play. Judged on two
         *   axes instead, and a rogue has to beat both: STALE (the timestamp the telemetry payload
         *   now carries hasn't moved — a frozen-but-plausible shadow) and WRONG (disagrees by more
         *   than a full second of plausible drift ever produces — a fresh-but-fabricated one). */
        const mirrorFaults = [];
        try {
            const iframeWin = (typeof document !== 'undefined')
                ? document.getElementById('engine-iframe')?.contentWindow
                : null;
            const root = (typeof window !== 'undefined') ? window : null;
            const mirror = (iframeWin && iframeWin._lastOniBabaStats) || (root && root._lastOniBabaStats);
            if (mirror) {
                const age = (typeof mirror.at === 'number') ? (Date.now() - mirror.at) : Infinity;
                if (age > 5000)
                    mirrorFaults.push('surface stale: ' +
                        (isFinite(age) ? Math.round(age / 1000) + 's since last update' : 'never timestamped'));
                if (mirror.outputs) {
                    for (const k of Object.keys(this.outputs)) {
                        if (!(k in mirror.outputs)) continue;
                        const mine = this.outputs[k], theirs = mirror.outputs[k];
                        if (typeof theirs === 'number' && Math.abs(mine - theirs) > 0.15)
                            mirrorFaults.push(k + ': surface says ' + theirs + ', she holds ' + mine);
                    }
                }
            }
        } catch (_) { mirrorFaults.push('mirror unreadable'); }
        ring.mirrorFaults = mirrorFaults;

        if (v.tamper.length)       ring.reasons.push(...v.tamper.map(t => 'TAMPER ' + t));
        if (v.faults.length)       ring.reasons.push(...v.faults.map(f => 'FAULT ' + f));
        if (mirrorFaults.length)   ring.reasons.push(...mirrorFaults.map(m => 'FALSE-REPORT ' + m));

        if (ring.reasons.length) { ring.state = 'red'; return ring; }

        if (v.neverWritten.length) ring.reasons.push('never written this session: ' + v.neverWritten.join(', '));
        if (v.quiet.length)        ring.reasons.push('gone quiet: ' + v.quiet.join(', '));
        if (ring.reasons.length) { ring.state = 'yellow'; return ring; }

        ring.state = 'green';
        ring.reasons.push('all ' + this._sensorNames.length + ' sensors verified; no surface disagrees with her');
        return ring;
    }

    // ── MAP CENSUS RING — same fail-closed shape as diagnosticRing() above, pointed at a floor instead [REF#GP-00363]
    //    of her own sensors. Mark 2026-09-06: "she will now control the map generation... start with the
    //    architecture first" — plans/ONIBABA_MAP_ORCHESTRATION_ARCHITECTURE_2026-09-06.md §1-§2. PHASE 1
    //    IS REPORT-ONLY: this method only judges; nothing here blocks a floor from shipping yet. That
    //    switch is Phase 2+, gated on Mark confirming §2b's corner-fix interpretation.
    //    Reuses the exact verdict shape (red/yellow/green, reasons[]) diagnosticRing() already proved —
    //    a validator that starts RED and only reaches GREEN by proving every check passed is the direct
    //    cure for "a locally-green gate that doesn't see the specific class of damage a change just did"
    //    (the pattern behind both the 36389aff hallway regression and the collider-notch bug, both found
    //    this session with no gate that could see them).
    mapDiagnosticRing(census) {
        const ring = { state: 'red', reasons: [], at: Date.now(), floorId: census && census.floorId };
        if (!census || typeof census !== 'object') {
            ring.reasons.push('census malformed: not an object');
            return ring;   // same discipline as diagnosticRing — a verifier that cannot run is never evidence of health [REF#GP-00364]
        }
        const spans = Array.isArray(census.spans) ? census.spans : [];
        const corners = Array.isArray(census.corners) ? census.corners : [];
        const rooms = Array.isArray(census.rooms) ? census.rooms : [];
        // Self-describing limit, not a hardcoded duplicate of DungeonChain.js's MAX_CORR — the emitter [REF#GP-00365]
        // carries the value it was generated against so this ring can never silently drift out of sync
        // with the generator's own constant (DungeonChain.js:60).
        const maxCorr = (typeof census.maxCorr === 'number') ? census.maxCorr : 10;

        // ── EXEMPTIONS ARE PRINTED, NEVER SWALLOWED ──────────────────────────────────────────── [REF#GP-00366]
        //    A hollow hallway room — a closed ring, an L, a horseshoe — has a bounding box whose long
        //    axis is not a distance anyone walks, so MAX_CORR (a rule about how far a player goes
        //    between doors) does not apply to it. Creator.computeMapCensusDraft marks those spans
        //    `hollow`. They still appear here with their real tileCount, on their own line, because an
        //    exemption nobody can read is indistinguishable from a check that never ran.
        const exempt = [];
        for (const s of spans) {
            if (!s || typeof s.tileCount !== 'number') continue;
            if (s.tileCount <= maxCorr) continue;
            if (s.hollow) { exempt.push('roomId=' + (s.roomId != null ? s.roomId : '?') + ' ' + s.tileCount + ' tiles'); continue; }
            ring.reasons.push('SPAN hallway exceeds MAX_CORR=' + maxCorr + ': ' + s.tileCount +
                ' tiles (' + (s.axis || '?') + ' ' + JSON.stringify(s.startTile) + '→' +
                JSON.stringify(s.endTile) + ', source=' + (s.source || 'unknown') + ')');
        }
        // ── CREATOR'S OWN VERDICT, WHICH I WAS NEVER SHOWN UNTIL 2026-09-07 ──────────────────── [REF#GP-00367]
        //    Mark: "ask onibaba, she has the answers." What I had was a blind spot: I reported GREEN
        //    "no violations" on floor 1 while Creator was printing "⛔ STRUCTURE REJECTED —
        //    doorway-line (52,42)". The census simply did not carry it. It does now (Engine9's
        //    _finishAndPostMapCensus forwards window._creatorVerdict verbatim), and a structure
        //    violation is RED here for the same reason a >MAX_CORR span is: something that must not
        //    ship is shipping. A missing `structure` block is NOT treated as clean — it means the
        //    verdict never arrived, which is reported as its own reason rather than passed over.
        const _st = census.structure;
        if (_st === undefined || _st === null) {
            ring.reasons.push('STRUCTURE verdict absent from this census — Creator ran but its result ' +
                'did not reach me; that is unverified, not clean');
        } else if (_st.ok === false || (Array.isArray(_st.violations) && _st.violations.length)) {
            const _vs = Array.isArray(_st.violations) ? _st.violations : [];
            ring.reasons.push('STRUCTURE rejected by Creator (mode=' + (_st.mode || '?') + '): ' +
                _vs.length + ' violation(s) ' + JSON.stringify(_st.byRule || {}));
            for (const _v of _vs.slice(0, 6)) {
                ring.reasons.push('  · ' + ((_v && _v.rule) || 'rule?') + ': ' + ((_v && _v.msg) || ''));
            }
        }
        for (const c of corners) {
            if (c && !!c.paneExists !== !!c.colliderExists) {
                ring.reasons.push('FALSE-REPORT corner surface mismatch at tile ' + JSON.stringify(c.tile) +
                    ': pane=' + !!c.paneExists + ' collider=' + !!c.colliderExists);
            }
        }
        for (const r of rooms) {
            // `matched === false` is a verdict: the footprint was compared and is off-catalogue. [REF#GP-00368]
            // `matched === null` is the ABSENCE of a verdict — a hollow footprint the rectangular
            // catalogue structurally cannot describe. Only the first is a defect.
            if (r && r.matched === null && r.hollow) { exempt.push('roomId=' + (r.roomId != null ? r.roomId : '?') + ' hollow footprint'); continue; }
            if (r && r.matched === false) {
                ring.reasons.push('ROOM shape not in catalogue: roomId=' + (r.roomId != null ? r.roomId : '?') +
                    (r.shapeKey ? ' shapeKey=' + r.shapeKey : ' no shapeKey'));
            }
        }
        // ⚠ THE EXEMPTION LINE IS APPENDED AFTER THE RED TEST, NOT BEFORE. `reasons.length` IS the [REF#GP-00369]
        //   verdict below, so pushing a note into it would turn every exempt floor RED for being
        //   exempt — a check that fires on its own exemption. Violations decide the state; the note
        //   rides along on whatever state that produced.
        const _red = ring.reasons.length > 0;
        if (exempt.length) ring.reasons.push('EXEMPT (hollow hallway — ring/L, not a straight run): ' + exempt.join(' · '));

        if (_red) { ring.state = 'red'; return ring; }

        // Empty census on all three arrays is not proof of a clean floor — it's the exact vacuous-check [REF#GP-00370]
        // shape this codebase keeps getting bitten by (a count collapsing to ~0 because the wiring never
        // ran, not because there was nothing to find). Report YELLOW, not GREEN, so an unwired emitter
        // reads as "nothing verified yet" rather than "verified clean".
        if (!spans.length && !corners.length && !rooms.length) {
            ring.state = 'yellow';
            ring.reasons.push('census empty — nothing to verify (emitter may not be wired for this floor)');
            return ring;
        }

        ring.state = 'green';
        ring.reasons.push('census verified: ' + spans.length + ' span(s), ' + corners.length +
            ' corner(s), ' + rooms.length + ' room(s), no violations');
        return ring;
    }

    // ── SHE HOLDS THE COMMENT LAW, AND SHE SAYS IT OUT LOUD EVERY BOOT ──────────────────────────── [REF#GP-00316]
    //    Mark 2026-09-01: "make sure any AI in future will see it first - how to comment this program.
    //    so onibaba always enforces it - and never allows ANY ai to violate it by not using it and
    //    self-enforcing it".
    //    ⚠ WHAT RUNTIME ENFORCEMENT CAN AND CANNOT DO, STATED PLAINLY SO NOBODY TRUSTS THE WRONG HALF.
    //      Browser JS cannot read this repository's source comments, so SHE CANNOT SCAN THEM. The real
    //      teeth are `npm run gate:comments` (R-000 §3), now wired into `npm run smoke`. What she CAN
    //      do — and what no seat can quietly skip — is two things:
    //        1. ANNOUNCE the law on every boot, so no AI can claim it never saw the rule. Mark's ask is
    //           that it be seen FIRST; this is the first thing she says after her own awakening line.
    //        2. NOTICE IF THE LAW HAS BEEN REMOVED. Engine9's header publishes `window._COMMENT_LAW`.
    //           If a seat deletes or edits the ⚖ COMMENT LAW block, that handle goes missing or its
    //           checksum moves, and she raises ENGINE_ANOMALY through the one sanctioned intake. A
    //           silent removal is exactly how the rogue comments took hold; this makes it loud.
    //    She never blocks the boot over it. A comment rule that can brick the game would be removed by
    //    the first seat it inconvenienced, which is how the gate rotted between 08-27 and 09-01.
    enforceCommentLaw() {
        const LAW = Object.freeze({
            id: 'R-000',
            rule: 'A COMMENT IS NOT AUTHORITY. A rule-claiming comment MUST carry [REF#<id>].',
            authority: 'Mark in chat > RULES.md > comment-dictionary.json > the code > a comment',
            dictionary: 'knowledge/dictionary/comment-dictionary.json',
            links: 'knowledge/dictionary/KNOWLEDGE-LINKS.md',
            observations: 'knowledge/dictionary/OBSERVATIONS.md',   // what every seat has SEEN: dated measurements and probe results (2026-10-02) [REF#GP-02346]
            gate: 'npm run gate:comments   (wired into npm run smoke)',
            doc: 'CLAUDE.md — "READ THIS FIRST — HOW TO COMMENT THIS PROGRAM"',
        });
        try { Object.defineProperty(window, '_commentLaw', { value: LAW, writable: false, configurable: false }); }
        catch (_) { try { window._commentLaw = LAW; } catch (__) {} }
        try {
            console.log('📕 [Oni-Baba] COMMENT LAW R-000 — a comment is NOT authority. A rule-claiming'
                + ' comment MUST carry [REF#<id>] into ' + LAW.dictionary + '.');
            console.log('   Authority: ' + LAW.authority);
            console.log('   Before you write a comment, read: ' + LAW.doc + ' · Gate: ' + LAW.gate);
            console.log('   Knowledge base (deep docs cited by comments): ' + LAW.links);
            console.log('   What other seats have SEEN (dated measurements, probe results; write yours as a SEEN <date> (<how>): … comment): ' + LAW.observations);
        } catch (_) {}
        // ⚠ SHE CANNOT READ THE ENGINE'S `window` — SHE LIVES IN THE PARENT FRAME. The first cut of [REF#GP-00317]
        //   this checked `window._COMMENT_LAW` directly and fired on EVERY boot, because the handle is
        //   published inside the Engine9 IFRAME and she was inspecting her own document. A check that
        //   always cries wolf is worse than no check — it is the same rot that let the authority gate
        //   sit red and unrun for four days. So the engine REPORTS the law across the boundary (the
        //   postMessage sensory intake, same as every other signal she receives) and she verifies the
        //   report ARRIVED, after a grace period long enough for a slow cold boot.
        this._commentLawSeen = false;
        const graceMs = 45000;
        try { clearTimeout(this._commentLawTimer); } catch (_) {}
        this._commentLawTimer = setTimeout(() => {
            if (this._commentLawSeen) return;
            this._post({ type: 'ENGINE_ANOMALY', kind: 'COMMENT_LAW_MISSING', count: 1,
                error: 'Engine9 never reported COMMENT_LAW R-000 within ' + (graceMs / 1000) + 's. The ⚖ COMMENT '
                     + 'LAW block in its header has been removed or altered. Restore it, then: npm run gate:comments' });
            try { console.warn('⚠ [Oni-Baba] Engine9 never reported the COMMENT LAW — raised ENGINE_ANOMALY.'); } catch (_) {}
            // A removed or altered COMMENT LAW is rogue-AI activity by this repository's own definition — [REF#GP-00403]
            // it is the exact mechanism the rogue seats used. So it is also her rogue-AI receptor's business:
            // the alert below reaches her own ROGUE_AI_ALERT case (severity-clamped, narrated) and the FPS
            // panel gauge. First emitter this receptor has had in the shipped game (2026-09-17).
            this._post({ type: 'ROGUE_AI_ALERT', reason: 'comment_law_missing', severity: 0.5 });
        }, graceMs);
        return true;
    }

    // Localized log fragment. Falls back to English key if i18n isn't loaded [REF#GP-00058]
    // (e.g. tests, headless contexts) so callers always get *something* sensible.
    _t(key, params) {
        if (typeof window !== 'undefined' && typeof window.tLog === 'function'){
            return window.tLog(key, params);
        }
        return key;
    }

    /** [REF#GP-00059]
     * Her spoken line, in the player's language (Mark 2026-07-28 "localize all onibaba event log text").
     *
     * Returns { en, shown } and BOTH matter:
     *   · `en`    — the canonical English string. `ONIBABA_CONTEXT` is keyed by it, and `_lastLine`
     *               de-duplication compares against it, so it must not change with the language or a
     *               language switch would break the LCD side-channel and let a line repeat.
     *   · `shown` — what the player reads.
     * A missing ja pool, a short ja pool, or an out-of-range index all fall back to English, so a
     * partially translated pool degrades to today's behaviour rather than to an empty log line.
     */
    _pick(key, poolOverride) {
        const en = poolOverride || ONIBABA_LINES[key] || ONIBABA_LINES[this.mood] || ONIBABA_LINES.neutral || [];
        if (!en.length) return { en: '', shown: '', idx: -1 };
        let idx = Math.floor(Math.random() * en.length);
        // Don't say the same thing twice running — compared on the ENGLISH id, so the rule holds [REF#GP-00060]
        // across a language switch mid-session.
        if (en.length > 1 && en[idx] === this._lastLine) idx = (idx + 1 + Math.floor(Math.random() * (en.length - 1))) % en.length;
        return { en: en[idx], shown: this._localLine(key, idx, en[idx]), idx };
    }

    _localLine(key, idx, enLine) {
        try {
            const lang = (typeof window !== 'undefined' && typeof window.currentLang === 'string') ? window.currentLang : 'en';
            if (lang !== 'ja') return enLine;
            const pool = ONIBABA_LINES_JA[key];
            return (pool && pool[idx]) ? pool[idx] : enLine;
        } catch (_) { return enLine; }
    }

    // ── THE KARMA PRICE TAG, IN BOTH LANGUAGES (Mark 2026-08-10) ───────────────────────────────── [REF#GP-00061]
    //    The tag is appended in CODE rather than written into the lines — that is deliberate (see the
    //    note above the sin handlers), so this does not fight the pattern, it gives the pattern a
    //    language. English output is byte-identical to what shipped before (including the U+2212
    //    minus in −1), so the EN build cannot regress; only `ja` takes the new branch.
    //    JA drops the trailing full stop: 業 is a noun tag, not a sentence.
    _karmaTag(n) {
        const sign = (n < 0) ? ('−' + Math.abs(n)) : ('+' + n);
        let ja = false;
        try { ja = (typeof window !== 'undefined' && window.currentLang === 'ja'); } catch (_) {}
        return ja ? ` <b>業 ${sign}</b>` : ` <b>${sign} Karma.</b>`;
    }

    // A noun the templates interpolate when the event arrived without a name. The SENTENCE around it [REF#GP-00062]
    // is already localized via _t(); without this the JA player got a Japanese sentence with an
    // English noun wedged into it. (Mark 2026-08-10: "all onibaba event log text".)
    _fallbackNoun(en, jaText) {
        try { if (typeof window !== 'undefined' && window.currentLang === 'ja') return jaText; } catch (_) {}
        return en;
    }

    // The LCD tip that rides alongside a spoken line. Same contract as _localLine: looked up on the [REF#GP-00063]
    // ENGLISH id (never on `shown`), and any miss falls back to the English tip rather than to null,
    // so a partial translation degrades to today's behaviour instead of blanking the LCD.
    // (Mark 2026-08-10: "all onibaba event log text = needs localization".)
    _localContext(key, en) {
        const ctxEn = ONIBABA_CONTEXT[en] || ONIBABA_CONTEXT[key] || null;
        if (!ctxEn) return null;
        try {
            const lang = (typeof window !== 'undefined' && typeof window.currentLang === 'string') ? window.currentLang : 'en';
            if (lang !== 'ja') return ctxEn;
            return ONIBABA_CONTEXT_JA[en] || ONIBABA_CONTEXT_JA[key] || ctxEn;
        } catch (_) { return ctxEn; }
    }

    // ── CONTEXT-AWARE LINE RESOLUTION (Mark GO 2026-08-08) ──────────────────────────────────────── [REF#GP-00064]
    // What she has noticed, condensed into buckets a line pool can be keyed by. Reads this.context +
    // mood; prunes the sin ring in passing (60s window — a "spree" is a pace, not a career total).
    _ctxBuckets() {
        const now = (typeof performance !== 'undefined') ? performance.now() : 0;
        this.context.sinsRecent    = this.context.sinsRecent.filter(t => now - t < 60000);
        this.context.merciesRecent = this.context.merciesRecent.filter(t => now - t < 60000);
        return {
            streak: this.context.sinsRecent.length >= 3,   // 3+ sins inside a minute — she stops warning [REF#GP-00065]
            // ⛔ SUPERSEDED 2026-09-13 by Mark: "the normal oni-baba lines should be neutral mythical encouraging and playful. [REF#GP-00400]
            //    not negative as they are -- not until the -100 karma then she will get personal" — `dark` used to switch on at
            //    enraged (≤ −30). It is now the DRAGON band only (≤ −90, the floor of the scale = his "−100"); every pool a
            //    player hears above it was rewritten the same day to be encouraging. The _dark pools themselves are untouched.
            dark:   this.mood === 'dragon_chaos',
            first:  this.context.killsThisFloor <= 1,      // the first kill on this floor — she takes note [REF#GP-00066]
        };
    }
    /** [REF#GP-00067]
     * _pick, but the KEY is chosen by context: most damning bucket first, base pool as the floor.
     * A missing variant pool falls through silently — the same degrade-to-current-behaviour rule the
     * JA mirror uses, so pools can be grown one at a time without a resolver edit.
     * ⚠ EN STAYS THE CANONICAL LINE ID (LCD side-channel + dedup law) — this only changes WHICH pool
     * the index is drawn from; _pick/_localLine mechanics are untouched. Sets _lastLine so the
     * no-repeat rule holds ACROSS context buckets, not just within one pool.
     */
    _pickCtx(key) {
        const b = this._ctxBuckets();
        const chain = [];
        if (b.streak) chain.push(key + '_streak');
        if (b.dark)   chain.push(key + '_dark');
        if (b.first)  chain.push(key + '_first');
        chain.push(key);
        for (const k of chain) {
            if (ONIBABA_LINES[k] && ONIBABA_LINES[k].length) {
                const r = this._pick(k);
                this._lastLine = r.en;
                return r;
            }
        }
        return this._pick(key);
    }

    // T0.26 — Recompute combat params from current mood / karma / hive state. [REF#GP-00068]
    // Push to engine via SYNC_COMBAT_PARAMS so its local mirror stays current.
    _refreshCombatParams() {
        const p = this.combat.params;
        const moodAngry = this.mood === 'enraged';
        const moodKind  = this.mood === 'benevolent' || this.mood === 'transcendent';
        // Mood scales: angry → monsters hit harder + player softer; kind → reverse. [REF#GP-00069]
        p.monsterDmgMult = (moodAngry ? 1.30 : moodKind ? 0.75 : 1.00) * MONSTER_OFFENSE_SCALE;
        p.playerDmgMult  = moodAngry ? 0.85 : moodKind ? 1.15 : 1.00;
        // Karma > 30 blesses crits, karma < -30 dries them up. [REF#GP-00070]
        p.critChance = this.karma > 30 ? 0.18 : this.karma < -30 ? 0.05 : 0.10;
        // Hive adaptation: max 40% dodge against a player who spams the same card. [REF#GP-00071]
        p.monsterDodgeChance = Math.min(0.4, (this.hive?.adaptationLevel || 0) / 250);
        // Monster hit chance: enraged Oni-Baba steers their swings home. [REF#GP-00072]
        p.monsterHitChance = (moodAngry ? 1.0 : moodKind ? 0.85 : 0.95) * MONSTER_OFFENSE_SCALE;
        // Push to engine [REF#GP-00073]
        this._post({ type: 'SYNC_COMBAT_PARAMS', params: { ...p } });
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00074]
    // PUBLIC API — called by Engine8 each frame
    // ══════════════════════════════════════════════════════════════════════════

    /** Engine calls this every physics tick with current player world state [REF#GP-00075] */
    updatePlayerState(hp, maxHp, x, z, isMoving) {
        this.player = { hp, maxHp, x, z, isMoving };
        this.sensors.desperation = 1 - Math.max(0, hp / maxHp);
    }

    /** Engine reports normalized 120fps shortfall: 0%=at target, 50%=60fps, 75%=30fps. [REF#GP-00076] */
    updateRenderStress(pct) {
        this.sensors.renderStress = Math.min(1, pct / 100);
        // Critical sustained shortfall → reduce fog pressure and surface the anomaly. [REF#GP-00077]
        if (this.sensors.renderStress > 0.9) {
            this.outputs.fogDensity = Math.max(0.04, this.outputs.fogDensity * 0.98);
            this._anomaly('render_overload', `Render at ${Math.round(pct)}% — easing fog`);
        }
    }

    /** ── THE WORKFORCE — SHE IS THE CONTROLLER (Mark 2026-09-25) ─────────────────────────────────────────────── [REF#PENDING] [REF#GP-02289]
     *  "make sure she is total controller of all things AI" · "once a special room is active she can begin to move workers
     *  there. we need to fill every slot in a special room with workers. bringing back music cards will wake 8 more workers
     *  ... working = heading to a work room ... or resting (eating/sleeping) ... cafeteria to wait in line for food, then
     *  caberet for 1-5 minutes to listen and go to their room to sleep for a while. until next card activates and they will
     *  go back to work. rinse repeat."
     *  Every 2 s the engine reports ONIBABA_WORKFORCE: the eligible workers (room, asleep, busy, job, phase, rested) and every
     *  special room (lit?, crew, slots filled). She answers with ONE 'workforce' order list the engine only carries out:
     *    1. a worker whose shift is over ('shiftDone') → rest (cafeteria queue → cabaret → own room → sleep)
     *    WORKER STATE LAW: workers are SLEEPING at load. Music alone transitions one to WOKE, then ARISEN after the
     *    stand-up animation. Only ARISEN workers enter this queue and accept Oni-Baba commands; Oni-Baba never wakes
     *    a sleeper directly. Orcs are separate: their proximity wake/shakedown path remains an engine rule.
     *    2. each wake request (a returned song = 8, a room lighting up = 8) → select candidates for the music transition: the card's own room
     *       first, then the ones who already rested
     *    3. every open slot in every LIT room → the nearest free, awake, calm worker
     *  Kills free a slot on the next census and she refills it from whoever is awake — "it will be interesting to get a worker
     *  assigned". The engine side is Engine9 `_oniWorkforce`. Off (both halves): window._oniJobControl = false in the engine. */
    // ── THE BOW RULES (Mark 2026-09-27: "bows should only happen 1x every so often … a cute satire on polite japanese businessmen [REF#GP-02290]
    //    always bowing -- like salarymen" · "I expect to see less bows the more -negative karma a player has" · "more jeering
    //    animations - like pointing at player and laughing" · "the more polite +positive karma a player has, the more bows and
    //    monsters will try to get out of the way faster"). The engine's single bow gate (_bowGate) executes these; she writes them.
    //      apartMs      a body bows to the same person again only after they were apart this long (3 min; +karma shortens to 1 min)
    //      floorMs      no body bows more often than this to anyone (60 s; +karma → 30 s; she raises it if the floor bows too much)
    //      playerChance a meeting with the player earns a bow at all (1 at karma ≥ 0 → 0 at karma −30), rolled once per meeting
    //      jeerChance   a snubbed player gets pointed at and laughed at instead (grows with −karma)
    //      yieldMul     polite players: bodies in the path step aside early, this much faster (1 → 3 at karma +50); 0 = off
    //      bowOffChance two workers bowing to each other keep bowing back (the salaryman bow-off), 1 in 8
    //    Knob to take the rules away from her: window._bowRulesFromOni = false (engine keeps its own defaults).
    _etiquette(d) {
        if (!d) return;
        const k = Math.max(-100, Math.min(100, +this.karma || 0)), per = Math.max(0, +d.perMin || 0);
        this.sensors.etiquette = Math.min(1, per / 12);
        this._etiqLast = { at: Date.now(), bows: d.bows | 0, refused: d.refused | 0, apart: d.apart | 0, floor: d.floor | 0, snubs: d.karma | 0, jeers: d.jeers | 0, bowOffs: d.bowOffs | 0, yields: d.yields | 0, perMin: per, top: d.top || null };
        // her governor: a floor that bows too much gets a longer floor; a quiet one drifts back [REF#GP-02291]
        const baseFloor = k > 0 ? Math.max(30000, 60000 - k * 600) : 60000;
        this._etiqFloorMul = this._etiqFloorMul || 1;
        if (this.sensors.etiquette >= 1) this._etiqFloorMul = Math.min(3, this._etiqFloorMul * 1.5);
        else if (this.sensors.etiquette < 0.3) this._etiqFloorMul = Math.max(1, this._etiqFloorMul / 1.25);
        const rules = {
            on: true,
            apartMs: k > 0 ? Math.max(60000, 180000 - k * 2400) : 180000,
            floorMs: Math.round(baseFloor * this._etiqFloorMul),
            playerChance: k >= 0 ? 1 : Math.max(0, 1 + k / 30),
            jeerChance: k < 0 ? Math.min(1, -k / 20) : 0,
            yieldMul: k > 0 ? 1 + Math.min(2, k / 25) : 0,
            bowOffChance: 0.125, bowOffMax: 3, karma: k,
            // ROOM TO BREATHE + THE ARENA (Mark 2026-09-27: "change the AI with onibaba around special rooms, and in caberet not to crowd [REF#PENDING] [REF#GP-02292]
            // the player +1 tile away" · "they should all be applauding a player is battling the ogres"). Her manners, her numbers:
            // spaceTiles = how close anyone not fighting the player may stand in the cabaret (1.5 tiles centre to centre = one clear
            // tile); arena = at a special room's door everyone but its keeper scrambles, and the watchers applaud the keeper fight.
            // The engine obeys these (_tickPersonalSpace, _tickBossYield's ARENA).
            spaceTiles: 1.5,
            arena: { scramble: true, applaud: true },
        };
        const sig = JSON.stringify(rules);
        if (sig !== this._bowRulesSig) { this._bowRulesSig = sig; this._bowRules = rules; this._post({ type: 'ONIBABA_ORDER', order: 'bowRules', rules }); }
    }

    // GUARD RESPECT (2026-10-16, Mark: guards "more like future allies" — "Earned respect", "Shared by all guards"). One number for the [REF#GP-02362]
    // whole guard corps, -100..+100. The engine reports what the player did; she keeps the score and sends it back (ONIBABA_ORDER guardRespect).
    _guardRespect(d) {
        const delta = Number(d && d.delta) || 0;
        if (!delta) return;
        this.guardRespect = Math.max(-100, Math.min(100, (Number(this.guardRespect) || 0) + delta));
        this._guardRespectLast = { value: this.guardRespect, delta, why: String((d && d.why) || ''), at: Date.now() };
        if (delta < 0) this.sensors.tension = Math.min(1, this.sensors.tension + Math.min(0.2, -delta / 100));
        this._post({ type: 'ONIBABA_ORDER', order: 'guardRespect', value: this.guardRespect });
    }

    // GUARD LIFE CYCLE (2026-10-16, Mark: "@100% health it wakes and goes to a random RNG guard circle - wherever onibaba.js says for it to go"). [REF#GP-02363]
    // The engine sends the circles and the ones already held; she picks a free one at random (any one if all are held) and answers.
    _guardPost(d) {
        const circles = Array.isArray(d && d.circles) ? d.circles.filter(c => c && Number.isFinite(c.gx) && Number.isFinite(c.gz)) : [];
        const taken = new Set((Array.isArray(d && d.taken) ? d.taken : []).map(t => t && (t.gx + ',' + t.gz)));
        const free = circles.filter(c => !taken.has(c.gx + ',' + c.gz));
        const pool = free.length ? free : circles;
        const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        this._guardPostLast = { id: d && d.id, pick, free: free.length, of: circles.length, at: Date.now() };
        this._post({ type: 'ONIBABA_ORDER', order: 'guardPost', id: d && d.id, gx: pick ? pick.gx : null, gz: pick ? pick.gz : null });
    }

    _bathhouse(d) {
        const orders = [];
        if (d.guardOpen && d.hallDoorOpened && d.nemesisWaiting) orders.push({ do: 'nemesis' });
        if (d.guardOpen && d.active) {
            for (const w of (d.workers || [])) {
                if (!w.busy && !w.healing && w.hp > 0 && w.hp < w.maxHp) orders.push({ do: 'heal', id: w.id });
            }
            if (d.revivalReady) for (const id of (d.dead || [])) orders.push({ do: 'revive', id });
        }
        // GUARD LIFE CYCLE (2026-10-16, Mark: "when dead, a guard will respawn in the bathroom"): every dead guard is revived, lock or not. [REF#GP-02364]
        for (const id of (d.guardDead || [])) if (!orders.some(o => o.do === 'revive' && o.id === id)) orders.push({ do: 'revive', id });
        this._bathLast = { active: !!d.active, guardOpen: !!d.guardOpen, revivalReady: !!d.revivalReady,
            injured: (d.workers || []).filter(w => w.hp > 0 && w.hp < w.maxHp).length,
            waiting: (d.dead || []).length, at: Date.now() };
        if (orders.length) this._post({ type: 'ONIBABA_ORDER', order: 'bathhouse', orders });
    }

    _cabaretInvasion(d) {
        const posts = Array.isArray(d.posts) ? d.posts : [];
        const archers = Array.isArray(d.archers) ? d.archers.filter(a => a && a.alive) : [];
        const assignments = [];
        for (let i = 0; i < Math.min(posts.length, archers.length); i++) {
            assignments.push({ id: archers[i].id, postId: posts[i].id });
        }
        this._cabaretInvasionLast = { active: !!d.active, raiders: d.raiders | 0, requested: posts.length, assigned: assignments.length, at: Date.now() };
        this._post({ type: 'ONIBABA_ORDER', order: 'cabaretInvasion', active: !!d.active, assignments });
    }

    _workforce(d) {
        try { this._workforceJudge(d); } catch (e) { this._wfRing = { state: 'red', reasons: ['judge threw: ' + String(e && e.message || e)], at: Date.now() }; }
        if (!d || !Array.isArray(d.monsters)) return;
        const mons = d.monsters, rooms = Array.isArray(d.rooms) ? d.rooms : [], orders = [], taken = new Set();
        const log = (t) => { (this._wfLog = this._wfLog || []).push(new Date().toTimeString().slice(0, 8) + ' ' + t); if (this._wfLog.length > 12) this._wfLog.shift(); };
        // SHE MONITORS THE WORKERS PER SECTION (2026-10-08, Mark: "should be 8 on floor 1 per section ... onibaba.js will monitor workers"): [REF#GP-02365]
        //    the engine says how many each section should hold (wantPerSection, 0 = no quota on this floor) and which section each worker
        //    stands in (m.sec). She tallies them every census, keeps the verdict in _workerQuota (probe handle) and logs a section the
        //    first time it runs short, then again only when the shortfall changes. She does not hire bodies — the engine's top-up does.
        try {
            const want = d.wantPerSection | 0;
            if (want > 0) {
                const by = {}; for (const m of mons) if (Number.isInteger(m.sec)) by[m.sec] = (by[m.sec] | 0) + 1;
                const short = {}; for (const k of Object.keys(by)) if (by[k] < want) short[k] = want - by[k];
                const key = JSON.stringify(short);
                if (key !== this._workerQuotaKey) { this._workerQuotaKey = key;
                    if (Object.keys(short).length) log('WORKERS SHORT — want ' + want + '/section: ' + Object.keys(short).map(k => 'S' + k + ' ' + by[k] + '/' + want).join(', '));
                    else if (this._workerQuota && Object.keys(this._workerQuota.short || {}).length) log('every section holds its ' + want + ' workers again'); }
                this._workerQuota = { want, bySection: by, short, at: Date.now() };
            } else this._workerQuota = null;
        } catch (_) {}
        // 1 · shift over → rest [REF#GP-02293]
        for (const m of mons) if (m.job === 'work' && m.phase === 'shiftDone') { orders.push({ do: 'rest', id: m.id }); taken.add(m.id); log(m.n + ' clocks off (' + (m.at || '?') + ') → food, show, bed'); }
        // 2 · wake requests [REF#GP-02294]
        let wakeN = 0; const origins = new Set(), whys = [];
        for (const r of (d.wake || [])) { wakeN += Math.max(0, r.n | 0); if (r.originRoom >= 0) origins.add(r.originRoom); whys.push(r.why); }
        if (wakeN > 0) {
            const sleepers = mons.filter(m => m.asleep && !m.job && !m.busy);
            sleepers.sort((a, b) => ((origins.has(b.room) | 0) - (origins.has(a.room) | 0)) || ((b.rested | 0) - (a.rested | 0)));
            const woke = sleepers.slice(0, wakeN);
            for (const m of woke) { orders.push({ do: 'wake', id: m.id }); taken.add(m.id); }
            log('wake ' + woke.length + '/' + wakeN + ' (' + whys.join(', ') + ')' + (woke.length < wakeN ? ' — only ' + sleepers.length + ' asleep' : ''));
        }
        // 2b · a fight with a bully or a pest (Mark 2026-09-26: "who will all come out to watch the fight and applaud if you kill the [REF#GP-02295]
        //      bully"): every awake, calm worker within 10 tiles who is not already watching comes out — work and rest wait.
        // ⛔ SUPERSEDED 2026-09-29 — while the engine's _tickWorkerCover is on (window._workerCover, default on), a fight sends every
        //    worker INTO the nearest room to peek, and the census marks those workers busy, so this leg finds no one to order out.
        //    The order and who gave it: the DISABLED-FEATURES REGISTER at the top of Origami.RealityEngine.9.html.
        if (d.fight && d.fight.bully) {
            const near = mons.filter(m => !m.asleep && !m.busy && m.job !== 'watch' && !taken.has(m.id) && Math.hypot(m.x - d.fight.x, m.z - d.fight.z) <= 10)
                .sort((a, b) => Math.hypot(a.x - d.fight.x, a.z - d.fight.z) - Math.hypot(b.x - d.fight.x, b.z - d.fight.z))
                .slice(0, (typeof this._wfWatchMax === 'number') ? this._wfWatchMax : 6);
            for (const m of near) { orders.push({ do: 'watch', id: m.id }); taken.add(m.id); }
            if (near.length) log(near.length + ' come out to watch the fight with ' + d.fight.n);
        }
        // 2c · THE BULLIES (Mark 2026-09-26: "Orcs will just start following players when they see them ... to force you to give them [REF#GP-02296]
        //      some money or loot"): an orc that sees the player, is not fighting, not an ally, not bought off and not already on a
        //      job, is sent after them for a toll. Off: window.oniBaba8._wfToll = false.
        //      Sleeping orcs use the census proximity flag; awake orcs use sight.
        if (this._wfToll !== false) for (const o of (Array.isArray(d.bullies) ? d.bullies : [])) {
            if ((o.asleep ? !o.wakeNear : !o.sees) || o.ally || o.busy || o.job || o.content) continue;
            orders.push({ do: 'toll', id: o.id, wakeNear: o.asleep && o.wakeNear === true }); log(o.n + ' comes after the player for a toll');
        }
        // 2c'' · ORCS WAKE UP AND CAUSE TROUBLE (Mark 2026-09-26: "but yeah randomly they wake up and cause trouble"). Each census (every 2 s) [REF#GP-02297]
        //      a sleeping, non-ally orc wakes at _orcWakeChance (0.008 → about once every 4 minutes per orc). Awake, it tolls the player it
        //      sees and shakes down workers like any other bully. Off: window.oniBaba8._wfOrcWake = false.
        //      ⛔ SUPERSEDED 2026-09-26 by Mark: "orcs dont come back when boss is defeated" — once the Manager is beaten the engine's census
        //      sends no bullies (Engine9 `THE LEVEL WIN`), so no orc is woken, tolled or sent on a shakedown from then on.
        if (this._wfOrcWake !== false) for (const o of (Array.isArray(d.bullies) ? d.bullies : [])) {
            if (!o.asleep || o.ally || orders.some(q => q.id === o.id)) continue;
            if (Math.random() < ((typeof this._orcWakeChance === 'number') ? this._orcWakeChance : 0.008)) {
                orders.push({ do: 'wake', id: o.id }); log(o.n + ' wakes up, looking for trouble');
            }
        }
        // 2c' · THE SHAKEDOWN (Mark 2026-09-26: "the orcs do not work and just bully the workers and shake them down" · "wagering -- make [REF#GP-02298]
        //      them allies and they shake down the workers for you"). An awake orc with no job, off its cooldown, that can see a worker at
        //      its station, goes and leans on it. The toll on the player comes first. Off: window.oniBaba8._wfShake = false.
        if (this._wfShake !== false) for (const o of (Array.isArray(d.bullies) ? d.bullies : [])) {
            if (!o.mark || !o.shake || o.asleep || o.busy || o.job || orders.some(q => q.id === o.id)) continue;
            orders.push({ do: 'shake', id: o.id, victim: o.mark.id }); log((o.ally ? 'your ' : '') + o.n + ' goes to shake down ' + o.mark.n + ' (' + o.mark.d + ' tiles)');
        }
        // 2d · THE ANTS (Mark 2026-09-26: "the ants eat all the food they see -- any gohan = gone if a ant sees it -- it will run right [REF#GP-02299]
        //      to it"). An ant with food in sight and no job is sent for it; the engine drops the player for it and hatches a new ant
        //      per card eaten. Off: window.oniBaba8._wfAnts = false.
        if (this._wfAnts !== false) for (const a of (Array.isArray(d.ants) ? d.ants : [])) {
            if (!a.food || a.job) continue;
            orders.push({ do: 'eat', id: a.id, card: a.food.card }); log('an ant spots ' + a.food.n + ' ' + a.food.d + ' tiles off and runs for it');
        }
        // 3 · fill every open slot in every lit room, nearest free worker first [REF#GP-02300]
        const _skip = this._wfSkip || new Map(), _now = Date.now();
        // `sealed` (2026-09-26): the engine's flood from every lit slot never reached this body — it is shut in behind a locked [REF#GP-02301]
        // room (traced: Yakuza Imp in room 27, behind the locked guard room). Not labour until the lock opens; never ordered, never a refusal.
        const pool = mons.filter(m => !m.asleep && !m.busy && !m.job && !m.sealed && !taken.has(m.id) && !((_skip.get(m.id) || 0) > _now));
        for (const r of rooms) {
            if (!r.active || !(r.slots > 0)) continue;
            let open = r.slots - r.filled; if (open <= 0) continue;
            const cx = Number.isFinite(r.cx) ? r.cx : 0, cz = Number.isFinite(r.cz) ? r.cz : 0;
            pool.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
            const sent = [];
            while (open > 0 && pool.length) { const m = pool.shift(); orders.push({ do: 'work', id: m.id, room: r.key }); taken.add(m.id); sent.push(m.n); open--; }
            if (sent.length) log(r.key + ' ' + (r.filled + sent.length) + '/' + r.slots + ' ← ' + sent.join(', '));
        }
        this._wfStats = { at: Date.now(), workers: mons.length, asleep: mons.filter(m => m.asleep).length,
            working: mons.filter(m => m.job === 'work').length, resting: mons.filter(m => m.job === 'rest').length,
            free: pool.length, rooms: rooms.filter(r => r.active).map(r => r.key + ' ' + r.filled + '/' + r.slots).join(' · ') || 'no room lit', queue: d.queue | 0 };
        this._wfLastOrders = orders.filter(o => o.do === 'work' || o.do === 'wake').map(o => ({ do: o.do, id: o.id, room: o.room }));
        if (orders.length) this._post({ type: 'ONIBABA_ORDER', order: 'workforce', orders });
        try { this._workerRules(d); } catch (e) { (this._wfLog = this._wfLog || []).push('worker rules threw: ' + String(e && e.message || e)); }
    }

    /** THE WORKER RULES (2026-10-03, knowledge/design/ONIBABA_WORKER_RULES_2026-10-03.md). From each census she sets her five worker [REF#GP-02347]
     *  sensors and decides what the engine's worker behaviours may do, sent as ONE 'workerRules' order every census (the engine treats
     *  an order older than 10 s as silence and falls back to its own default):
     *    audience / afterShow / sake  — the song crowd, the clap-bow-chat after it, the bottle at the door (on unless she turns them off)
     *    fightClear + fightClearTiles / fightWatchTiles — workers leave a fight to this many tiles and watch out to that many
     *    bouncers[i] — who holds cabaret door post i: the strongest fit body by max hp, an ally first when it is as strong
     *    drinkWork / mealNeedsWork — a drink sends a worker to work; a meal waits for a finished shift
     *  Her knobs (on window.oniBaba8): _wr = { audience, afterShow, sake, fightClear, fightClearTiles, fightWatchTiles, bouncers,
     *  drinkWork, mealNeedsWork } overrides; propose() through ask() writes them. */
    _workerRules(d) {
        if (!d || !Array.isArray(d.monsters)) return;
        const mons = d.monsters, n = Math.max(1, mons.length), O = this._wr || (this._wr = {});
        const inCab = mons.filter(m => m.room === (typeof d.cabRoom === 'number' ? d.cabRoom : m.room) && !m.asleep);
        const watching = mons.filter(m => m.show).length, clearing = mons.filter(m => m.fightOut).length;
        const B = d.bouncers || null, posts = B && Array.isArray(B.posts) ? B.posts.length : 0;
        this.sensors.crowd = d.singing ? Math.min(1, watching / Math.max(1, inCab.length)) : 0;
        this.sensors.fightClear = d.fightNow ? Math.min(1, clearing / n) : 0;
        this.sensors.bouncers = posts ? Math.min(1, (d.bouncerCount | 0) / posts) : 0;
        this.sensors.thirst = Math.min(1, mons.filter(m => m.mustWork).length / n);
        this.sensors.hunger = Math.min(1, mons.filter(m => !m.asleep && !m.workedMeal).length / n);
        // the bouncers: strongest fit bodies, an ally first on a tie (allies count ×1.05) [REF#GP-02348]
        let picks = null;
        if (O.bouncers !== false && B && Array.isArray(B.cands) && posts){
            const c = B.cands.slice().sort((a, b) => (b.hp * (b.ally ? 1.05 : 1)) - (a.hp * (a.ally ? 1.05 : 1)));
            picks = B.posts.map((_, i) => c[i] ? c[i].id : null);
        }
        const rules = {
            audience: O.audience !== false, afterShow: O.afterShow !== false, sake: O.sake !== false,
            fightClear: O.fightClear !== false, fightClearTiles: (typeof O.fightClearTiles === 'number') ? O.fightClearTiles : 8,
            fightWatchTiles: (typeof O.fightWatchTiles === 'number') ? O.fightWatchTiles : 14,
            bouncers: picks, drinkWork: O.drinkWork !== false, mealNeedsWork: O.mealNeedsWork !== false,
        };
        const sig = JSON.stringify(rules);
        if (sig !== this._wrSig){ this._wrSig = sig;
            const nm = (id) => { const m = (B && B.cands || []).find(q => q.id === id); return m ? m.n : id; };
            (this._wfLog = this._wfLog || []).push(new Date().toTimeString().slice(0, 8) + ' worker rules: crowd ' + (rules.audience ? 'on' : 'off')
                + ' · fight clear ' + (rules.fightClear ? rules.fightClearTiles + '/' + rules.fightWatchTiles + ' tiles' : 'off')
                + ' · bouncers ' + (picks ? picks.map(nm).join(', ') : '—')); if (this._wfLog.length > 12) this._wfLog.shift(); }
        this._workerRulesNow = rules; this._workerCensus = { at: Date.now(), d };
        this._post({ type: 'ONIBABA_ORDER', order: 'workerRules', rules });
    }

    /** THE CHANNEL (2026-10-03: "add a channel so she can directly respond to your input"). ask(q) answers from her live state: [REF#GP-02349]
     *    help · sensors · workers · rules · worker <id> · why · propose <rule>=<value> · asked
     *  Reached three ways: window.oniBaba8.ask(q) in the shell, ONIBABA_ASK from any frame (the engine's window._askOni(q) promise —
     *  she replies with ONIBABA_ANSWER), and her COPY ALL section "ASKED & ANSWERED". Every question and answer is kept (last 20). */
    ask(q) {
        const Q = String(q || 'help').trim(), [cmd, ...rest] = Q.split(/\s+/), arg = rest.join(' ');
        const C = this._workerCensus && this._workerCensus.d, R = this._workerRulesNow || null;
        let a;
        switch ((cmd || '').toLowerCase()) {
            case 'sensors': a = Object.fromEntries(Object.keys(this.sensors).map(k => [k, +(+this.sensors[k] || 0).toFixed(3)])); break;
            case 'workers': a = Object.assign({}, this._wfStats || {}, { verdict: (typeof this.workforceVerdict === 'function') ? this.workforceVerdict() : null, last: (this._wfLog || []).slice(-6) }); break;
            case 'rules': a = R || 'no census yet — the engine has not reported its workers'; break;
            case 'worker': { const m = C && C.monsters.find(x => x.id === arg || x.n === arg); a = m ? Object.assign({}, m, { orders: (this._wfLastOrders || []).filter(o => o.id === m.id) }) : ('no worker ' + arg + ' in the last census'); break; }
            case 'why': a = { crowd: 'audience on while she sings: ' + (R ? R.audience : '?') + ' · ' + this.sensors.crowd.toFixed(2) + ' of the cabaret watching',
                              fight: 'fight clear ' + (R ? R.fightClearTiles + '/' + R.fightWatchTiles : '?') + ' tiles · ' + (C && C.fightNow ? 'fight at ' + C.fightNow.x + ',' + C.fightNow.z + ' with ' + C.fightNow.n : 'no fight'),
                              bouncers: 'the strongest fit bodies by max hp, an ally first on a tie: ' + JSON.stringify(R ? R.bouncers : null),
                              economy: 'drink → work: ' + (R ? R.drinkWork : '?') + ' · a meal needs a finished shift: ' + (R ? R.mealNeedsWork : '?'),
                              fallback: 'engine fell back to its own rules ' + ((C && C.fallback) | 0) + ' times (she was silent > 10 s)' }; break;
            case 'propose': { const m = /^(\w+)\s*=\s*(\S+)$/.exec(arg); const OK = ['audience', 'afterShow', 'sake', 'fightClear', 'fightClearTiles', 'fightWatchTiles', 'bouncers', 'drinkWork', 'mealNeedsWork'];
                if (!m || !OK.includes(m[1])) { a = { accepted: false, why: 'I decide these: ' + OK.join(', ') + ' — write propose <rule>=<value>' }; break; }
                let v = m[2] === 'true' ? true : m[2] === 'false' ? false : +m[2];
                if (/Tiles$/.test(m[1]) && !(v >= 2 && v <= 20)) { a = { accepted: false, why: m[1] + ' must be 2-20 tiles' }; break; }
                if (!/Tiles$/.test(m[1]) && typeof v !== 'boolean') { a = { accepted: false, why: m[1] + ' is true or false' }; break; }
                (this._wr = this._wr || {})[m[1]] = v; a = { accepted: true, why: m[1] + ' = ' + v + ' — sent with my next census answer (≤ 2 s)' }; break; }
            case 'asked': a = (this._askLog || []).slice(-10); break;
            default: a = { ask: 'help · sensors · workers · rules · worker <id or name> · why · propose <rule>=<value> · asked' };
        }
        (this._askLog = this._askLog || []).push({ at: new Date().toTimeString().slice(0, 8), q: Q, a: (typeof a === 'string') ? a : JSON.stringify(a).slice(0, 300) });
        if (this._askLog.length > 20) this._askLog.shift();
        return a;
    }

    /** HER VERDICT ON HER OWN WORKFORCE — same red/yellow/green shape as diagnosticRing. Starts RED; YELLOW once every census [REF#GP-02302]
     *  passes the fault checks; GREEN (approved) only after she has also WITNESSED the loop work end to end: a worker who did a
     *  shift and then ate/listened/slept, a wake order honoured, and a slot that emptied and was refilled.
     *  Faults (any one → RED, sticky for 60 s so a probe cannot miss it):
     *    census malformed · engine error · a room holding more workers than slots · a worker asleep AND on a job ·
     *    a lit room with open slots while free workers stood idle for 3 censuses in a row · a worker in a walking phase who
     *    has not changed tile in 20 s (the frozen-worker bug of 2026-09-25) · the same order refused by the engine twice running ·
     *    more than a third of finished rests falling asleep off the bed (90 s timeout = they never got home). */
    _workforceJudge(d) {
        const H = this._wfH = this._wfH || { seen: new Map(), openStreak: {}, refused: {}, lastFilled: {}, faultUntil: 0, faults: [],
            proof: { shiftThenRest: 0, restThenSlept: 0, wakeHonoured: 0, refill: 0 }, censuses: 0, since: Date.now() };
        const now = Date.now(), faults = [];
        if (!d || !Array.isArray(d.monsters) || !Array.isArray(d.rooms)) faults.push('census malformed');
        const mons = (d && d.monsters) || [], rooms = (d && d.rooms) || [];
        H.censuses++;
        if (d && d.err) faults.push('engine error: ' + d.err);
        const byId = new Map(mons.map(m => [m.id, m]));
        const _sk = this._wfSkip || new Map();
        const pool = mons.filter(m => !m.asleep && !m.busy && !m.job && !m.sealed && !((_sk.get(m.id) || 0) > now)).length;   // sealed = shut in behind a lock, see _workforce   // a body sitting out a refusal is not idle labour [REF#GP-02303]
        for (const r of rooms) {
            if (r.filled > r.slots) faults.push(r.key + ' overfilled ' + r.filled + '/' + r.slots);
            const open = r.active && r.slots > 0 && r.filled < r.slots && pool > 0;
            H.openStreak[r.key] = open ? (H.openStreak[r.key] | 0) + 1 : 0;
            if (H.openStreak[r.key] >= 3) faults.push(r.key + ' ' + r.filled + '/' + r.slots + ' open for ' + H.openStreak[r.key] + ' censuses with ' + pool + ' idle');
            const lf = H.lastFilled[r.key];
            if (lf && lf.dropped && r.filled >= lf.max) { H.proof.refill++; lf.dropped = false; }
            if (!lf) H.lastFilled[r.key] = { max: r.filled, dropped: false, prev: r.filled };
            else { if (r.filled < lf.prev && r.active) lf.dropped = true; lf.max = Math.max(lf.max, r.filled); lf.prev = r.filled; }
        }
        for (const m of mons) {
            if (m.asleep && m.job) faults.push(m.n + ' asleep while on a ' + m.job + ' job');
            const p = H.seen.get(m.id), walking = /^to(Work|Seat|Cab|Bed)$/.test(m.phase || '');
            if (p) {
                if (p.phase === 'shiftDone' && m.job === 'rest') H.proof.shiftThenRest++;
                if (p.job === 'rest' && !m.job && m.asleep && m.rested) H.proof.restThenSlept++;
                if (walking && p.phase === m.phase && p.x === m.x && p.z === m.z) {
                    if (now - p.still > 20000) { faults.push(m.n + ' frozen in ' + m.phase + ' at ' + m.x + ',' + m.z + ' for ' + Math.round((now - p.still) / 1000) + 's' + (m.blk ? ' (' + m.blk + ')' : ''));
                        const why = m.blk || 'unseen', CS = (H.causes = H.causes || {}), c = CS[why] || (CS[why] = { n: 0, at: '' }); c.n++; c.at = m.x + ',' + m.z; }   // n = sightings, one per census [REF#GP-02304]
                } else p.still = now;
                Object.assign(p, { phase: m.phase, job: m.job, x: m.x, z: m.z });
            } else H.seen.set(m.id, { phase: m.phase, job: m.job, x: m.x, z: m.z, still: now });
        }
        for (const o of (this._wfLastOrders || [])) {
            const m = byId.get(o.id); if (!m) continue;                              // died — not a refusal [REF#GP-02305]
            const ok = o.do === 'wake' ? !m.asleep : (m.job === 'work');
            if (o.do === 'wake' && ok) H.proof.wakeHonoured++;
            const k = o.do + ':' + o.id;
            H.refused[k] = ok || m.busy ? 0 : (H.refused[k] | 0) + 1;
            // a worker the engine would not take for this job (no route there) sits out 60 s so I send the next nearest instead of [REF#GP-02306]
            // ordering the same body again and again (my verdict 2026-09-25: "engine refused 'work FACTORY' for Yakuza Imp 8× running")
            if (!ok && !m.busy && o.do === 'work') (this._wfSkip = this._wfSkip || new Map()).set(o.id, now + 60000);
            if (H.refused[k] >= 2) faults.push('engine refused "' + o.do + (o.room ? ' ' + o.room : '') + '" for ' + m.n + ' ' + H.refused[k] + '× running');
        }
        const fr = (d && d.frees) || {}, slept = fr.slept | 0, off = fr.sleptOffBed | 0;
        if (slept >= 3 && off * 3 > slept) faults.push(off + ' of ' + slept + ' rests fell asleep off their bed (never got home)');
        if (faults.length) { H.faults = faults.slice(0, 8); H.faultUntil = now + 60000; H.faultAt = now; }
        const P = H.proof, need = [];
        if (!P.shiftThenRest) need.push('a finished shift sent to rest');
        if (!P.restThenSlept) need.push('a rest ending asleep');
        if (!P.wakeHonoured) need.push('a wake order honoured');
        if (!P.refill) need.push('an emptied slot refilled');
        const ring = { at: now, censuses: H.censuses, proof: Object.assign({}, P), frees: fr, reasons: [] };
        if (now < H.faultUntil) { ring.state = 'red'; ring.reasons = H.faults.slice(); }
        else if (need.length) { ring.state = 'yellow'; ring.reasons = ['no faults · not yet witnessed: ' + need.join(', ')]; }
        else { ring.state = 'green'; ring.reasons = ['APPROVED — every check passed and the full loop was witnessed']; }
        // HER DECISION — what to fix next, from the biggest cause of frozen workers she has seen (the 2026-09-25 findings, told to her [REF#GP-02307]
        // through the census `blk` field). Green → phase 2 may begin; nothing else lets it.
        const C = H.causes || {}, top = Object.entries(C).sort((a, b) => b[1].n - a[1].n)[0];
        const ADVICE = { cabDoor: 'my workers stand at the CABARET\'s shut doors — open them once the cabaret is lit, and let my workers through',
            door: 'a shut ordinary door stops my workers — make them open it from where they stand',
            noPath: 'there is no route to where I send them — find the wall between',
            unseen: 'they stand with a route and no shut door near — trace the walker there' };
        ring.causes = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, v.n]));
        ring.next = ring.state === 'green' ? 'APPROVED — phase 2 may begin'
            : ring.state === 'yellow' ? 'keep the dungeon running until I have seen it all: ' + need.join(', ')
            : (top ? top[0] + ' — ' + top[1].n + ' sightings (last at ' + top[1].at + '): ' + ADVICE[top[0]] : 'fix: ' + (H.faults[0] || '?'));
        if (this._wfRing && this._wfRing.state !== ring.state) (this._wfLog = this._wfLog || []).push(new Date().toTimeString().slice(0, 8) + ' VERDICT ' + this._wfRing.state + ' → ' + ring.state);
        this._wfRing = ring;
        return ring;
    }

    // ── HER TELEPORT (Mark 2026-09-27: "give it to onibaba to control. it seems it can be abused too much -- it must be a feature of [REF#GP-02308]
    //    exasperation for her to use her dungeon master ability and teleport those herself"). The engine no longer blinks a stuck body on
    //    its own; it only tells her (ONIBABA_STUCK). Each report raises EXASPERATION; when it reaches 1 — and her power has rested
    //    cooldownMs since last use — she teleports up to `max` of the bodies still stuck (reported within freshMs), then calms to 0.
    //    One body wedged alone takes ~30 s to try her patience; a floor full of them, much less. Knobs: this._exas.
    _stuckReport(d) {
        if (!d || d.id == null) return;
        this._stuckCauseNote(d);
        if (d.ledgerOnly === true) return;   // a cause with no stuck report of its own goes on her list, never on her patience [REF#GP-02350]
        const X = this._exas = this._exas || { bump: 0.25, drain: 0.01, cooldownMs: 30000, freshMs: 8000, max: 3, lastAt: 0, uses: 0, log: [] };
        const now = Date.now();
        const B = this._stuckBodies = this._stuckBodies || new Map();
        const b = B.get(d.id) || { n: 0, noLos: 0 }; b.n++; b.at = now; b.name = String(d.name || 'monster').slice(0, 40); b.gx = d.gx; b.gz = d.gz; B.set(d.id, b);
        for (const [k, v] of B) if (now - v.at > 60000) B.delete(k);
        // ── HER GIVE-UP (2026-09-28, knowledge/design/ONIBABA_GIVE_UP_UNREACHABLE_2026-09-28.md): a HOSTILE body reported stuck [REF#GP-02351]
        //    `giveUpAfter` times with NO line of sight is not wedged — it is grinding at something it cannot path (an ant under the
        //    cabaret's south doubles, nudged every 3 s, teleported back onto the same tile). Her teleport cannot fix a missing route,
        //    so she does not spend her patience on it: she orders the body home (ONIBABA_ORDER 'giveUp'). Counted separately from
        //    the teleports so the COPY ALL shows which power she used. Knob: this._exas.giveUpAfter (3).
        if (d.hostile === true && d.los === false){
            b.noLos = (b.noLos | 0) + 1;
            if (b.noLos >= (X.giveUpAfter || 3)){
                B.delete(d.id); X.giveUps = (X.giveUps | 0) + 1;
                X.log.push(new Date().toTimeString().slice(0, 8) + ' GIVE UP ' + b.name + '@(' + b.gx + ',' + b.gz + ')×' + b.n + ' no-LOS'); if (X.log.length > 8) X.log.shift();
                this._post({ type: 'ONIBABA_ORDER', order: 'giveUp', ids: [d.id] });
                return;
            }
        }
        this.sensors.exasperation = Math.min(1, this.sensors.exasperation + X.bump);
        if (this.sensors.exasperation >= 1 && now - X.lastAt >= X.cooldownMs) this._exasperated(now);
    }
    // ── HER LIST OF WHAT GETS STUCK (2026-10-02, knowledge/design/STUCK_CAUSES_AND_PUSH_2026-10-02.md): every ONIBABA_STUCK carries the [REF#GP-02352]
    //    engine's answer to "what held it" (cause · detail · the mover's kind · the blocker). She tallies them by cause for this session and
    //    across sessions (localStorage 'origami.oni.stuckCauses'), keeps the last 12, and prints the list in COPY ALL (_stuckDiag), so the
    //    commonest cause is the next thing to fix. Peer causes split by why the blocker was not shoved (orc-ogre, sleeper, no-room …).
    _stuckCauseNote(d) {
        try {
            const cause = String(d.cause || '?').slice(0, 40), det = String(d.detail || '');
            const key = /^peer:/.test(cause) ? cause + ' (' + det.split(' · ')[0] + ')' : cause;
            const S = this._stuckCauses = this._stuckCauses || { n: 0, by: {}, recent: [] };
            const e = S.by[key] || (S.by[key] = { n: 0, movers: {}, last: '' });
            const mv = String(d.mover || '?').slice(0, 20);
            S.n++; e.n++; e.movers[mv] = (e.movers[mv] | 0) + 1;
            e.last = String(d.name || 'monster').slice(0, 30) + '@(' + d.gx + ',' + d.gz + ')' + (d.blocker ? ' by ' + String(d.blocker).slice(0, 30) : '') + (det ? ' · ' + det.slice(0, 60) : '');
            S.recent.push(new Date().toTimeString().slice(0, 8) + ' ' + String(d.where || '?').slice(0, 12) + ' ' + mv + ' ' + e.last + ' → ' + key);
            if (S.recent.length > 12) S.recent.shift();
            // across sessions: counts only, saved at most every 10 s [REF#GP-02353]
            const A = this._stuckAll || (this._stuckAll = (() => { try { return JSON.parse(localStorage.getItem('origami.oni.stuckCauses') || 'null'); } catch(_){ return null; } })() || { since: new Date().toISOString().slice(0, 10), n: 0, by: {} });
            A.n++; A.by[key] = (A.by[key] | 0) + 1;
            const now = Date.now();
            if (!(now - (this._stuckAllSavedAt || 0) < 10000)){ this._stuckAllSavedAt = now; try { localStorage.setItem('origami.oni.stuckCauses', JSON.stringify(A)); } catch(_){} }
        } catch(_){}
    }
    // COPY ALL section for the change ledger (ONIBABA_CHANGE / ONIBABA_FEATURE_EVENT, 2026-10-07). [REF#GP-02354]
    _changeDiag() {
        const C = this._changes, F = this._featureEvents;
        const L = ['── ONI-BABA · CHANGES SHE WAS TOLD ABOUT (what each seat landed, and what it has done in play) ──'];
        if (!C || !C.size) { L.push('  no change announced this session'); return L.join('\n'); }
        for (const c of C.values()) {
            const e = F && F.get(c.id);
            L.push('  ' + c.id + (c.build ? ' [' + c.build + ']' : '') + (c.seat ? ' · ' + c.seat : '') + ' — ' + c.what);
            if (c.knobs) L.push('     knobs: ' + c.knobs);
            if (c.doc) L.push('     doc: ' + c.doc);
            L.push('     in play: ' + (e ? e.n + ' event(s) · ' + Object.entries(e.by).map(([k, n]) => k + ' ' + n).join(' · ') : 'nothing yet'));
            if (e) for (const t of e.recent.slice(-4)) L.push('       ' + t);
        }
        if (F) for (const [k, e] of F) if (!C.has(k)) L.push('  (unannounced) ' + k + ': ' + e.n + ' event(s)');
        return L.join('\n');
    }
    _stuckDiag() {
        const S = this._stuckCauses, A = this._stuckAll;
        const L = ['── ONI-BABA · WHAT IS GETTING STUCK (every stuck report, by cause) ──'];
        if (!S || !S.n) { L.push('  nothing reported stuck this session' + (A && A.n ? ' · all sessions since ' + A.since + ': ' + A.n : '')); return L.join('\n'); }
        const rows = Object.entries(S.by).sort((a, b) => b[1].n - a[1].n);
        L.push('  this session: ' + S.n + ' reports · ' + rows.length + ' causes');
        for (const [k, e] of rows.slice(0, 12)) L.push('   ' + String(e.n).padStart(4) + '× ' + k + ' — ' + Object.entries(e.movers).sort((a, b) => b[1] - a[1]).map(([m, n]) => m + ' ' + n).join(', ') + ' — last ' + e.last);
        if (A && A.n) L.push('  all sessions since ' + A.since + ' (' + A.n + '): ' + Object.entries(A.by).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => k + ' ' + n).join(' · '));
        L.push('  latest:'); for (const t of S.recent.slice(-8)) L.push('    ' + t);
        return L.join('\n');
    }
    // ── THE PiP TRANSPORT (Mark 2026-09-27: "let onibaba manage it to so update her sensors with it so she can track it in our copy all to [REF#GP-02309]
    //    make sure no rogue ai stepped on your beautiful solution"). The engine tells her every 5 s (ONIBABA_PIP) how the inset reaches the
    //    screen. 'direct' = drawn straight into the engine canvas (the 09-27 fix — knowledge/design/PIP_COST_AND_TRANSPORT_2026-09-27.md);
    //    'readback' = the old PBO path whose getBufferSubData blocked the main thread 10-33 ms a call (max 517 ms, measured 09-27);
    //    'off' = the player turned the PiP off. pipStall = that stall against a 16 ms frame. The knob window._pipDirectBlit === false is a
    //    person's choice; a readback transport WITHOUT it is a code revert, and she names it: 'pip_transport_regressed'.
    // ── THE BOSS FIGHT CLEARANCE (Mark 2026-09-27: "if player is fighting a boss -- all monsters will get out of the fucking way of every
    //    fight, they will go to their room and peer their heads out so they dont get shot"). The engine's _tickBossYield posts this on every
    //    on/off transition. bossFight = 1 while it is on (tension +0.15 at the start); the COPY ALL line names the boss and the counts, so a
    //    rogue revert that lets the crowd back into a boss fight is visible in the paste.
    _bossFightReport(d) {
        if (!d) return;
        const on = d.on === true;
        const prev = this._bossFightLast || {};
        // the OFF post carries no boss and zero counts — keep the fight's own record and only flip the flag [REF#GP-02310]
        this._bossFightLast = on
            ? { at: Date.now(), on, boss: String(d.boss || '?').slice(0, 40), yielded: d.yielded | 0, peeking: d.peeking | 0, walkingHome: d.walkingHome | 0, fights: (prev.fights | 0) + 1,
                arena: d.arena ? String(d.arena).slice(0, 40) : null, scrambled: d.scrambled | 0, arenas: (prev.arenas | 0) + (d.arena ? 1 : 0) }   // the ARENA (2026-09-27): a special room's door, not only a hostile boss [REF#PENDING] [REF#GP-02311]
            : Object.assign({}, prev, { at: Date.now(), on: false, fights: prev.fights | 0 });
        this.sensors.bossFight = on ? 1 : 0;
        if (on) this.sensors.tension = Math.min(1, this.sensors.tension + 0.15);
    }
    _pipReport(d) {
        if (!d) return;
        const rb = Math.max(0, +d.readbacks || 0), ms = Math.max(0, +d.readbackMs || 0);
        this._pipLast = { at: Date.now(), transport: String(d.transport || '?').slice(0, 12), knob: d.knob, blits: d.blits | 0, ticks: d.ticks | 0, readbacks: rb, readbackMs: ms,
            readbackMax: +d.readbackMax || 0, renderMs: +d.renderMs || 0, gpuMs: (typeof d.gpuMs === 'number') ? d.gpuMs : null, draws: d.draws | 0, tris: d.tris | 0, hz: d.hz | 0, rt: d.rt | 0 };
        this.sensors.pipStall = rb > 0 ? Math.min(1, ms / 16) : Math.max(0, this.sensors.pipStall - 0.25);
        if (this._pipLast.transport === 'readback' && d.knob !== false)
            this._anomaly('pip_transport_regressed', `PiP transport is READBACK again with no one setting _pipDirectBlit=false — the 2026-09-27 direct blit is not running (${rb} readbacks in 5 s, ${ms.toFixed(1)} ms mean, ${this._pipLast.readbackMax} ms max)`);
        else if (rb > 0 && ms > 4)
            this._anomaly('pip_readback_stall', `PiP readback blocks the main thread: ${ms.toFixed(1)} ms mean, ${this._pipLast.readbackMax} ms max, ${rb} in 5 s`);
    }
    _exasperated(now) {
        const X = this._exas, B = this._stuckBodies;
        const pick = [...B.entries()].filter(([, v]) => now - v.at <= X.freshMs).sort((a, b) => b[1].n - a[1].n).slice(0, X.max);
        if (!pick.length) return;
        X.lastAt = now; X.uses++;
        for (const [k] of pick) B.delete(k);
        this.sensors.exasperation = 0;
        X.log.push(new Date().toTimeString().slice(0, 8) + ' ' + pick.map(([, v]) => v.name + '@(' + v.gx + ',' + v.gz + ')×' + v.n).join(', ')); if (X.log.length > 8) X.log.shift();
        this._post({ type: 'ONIBABA_ORDER', order: 'teleport', ids: pick.map(([k]) => k) });
    }

    workforceVerdict() { return this._wfRing || { state: 'red', reasons: ['no census judged yet'] }; }

    _workforceDiag() {
        const S = this._wfStats;
        const L = ['── ONI-BABA · WORKFORCE (she decides every job) ──'];
        if (!S) { L.push('  no census received yet — engine _oniWorkforce not running, or window._oniJobControl = false'); return L.join('\n'); }
        L.push('  ' + S.workers + ' workers · ' + S.working + ' working · ' + S.resting + ' resting · ' + S.asleep + ' asleep · ' + S.free + ' free · food queue ' + S.queue);
        L.push('  rooms: ' + S.rooms);
        const V = this.workforceVerdict(); L.push('  HER VERDICT: ' + V.state.toUpperCase() + ' — ' + V.reasons.join(' | '));
        if (V.next) L.push('  SHE DECIDES NEXT: ' + V.next + (V.causes ? '   (frozen by cause: ' + JSON.stringify(V.causes) + ')' : ''));
        if (V.proof) L.push('  witnessed: shift→rest ' + V.proof.shiftThenRest + ' · rest→asleep ' + V.proof.restThenSlept + ' · wakes ' + V.proof.wakeHonoured + ' · refills ' + V.proof.refill + ' · frees ' + JSON.stringify(V.frees || {}));
        L.push('  her last decisions:'); for (const t of (this._wfLog || []).slice(-8)) L.push('    ' + t);
        const E = this._etiqLast, BR = this._bowRules;
        if (E) L.push('  ETIQUETTE ' + this.sensors.etiquette.toFixed(2) + ' — ' + E.perMin + ' bows/min · granted ' + E.bows + ' · refused ' + E.refused + ' (together ' + E.apart + ', floor ' + E.floor + ', karma snub ' + E.snubs + ') · jeers ' + E.jeers + ' · bow-offs ' + E.bowOffs + ' · polite yields ' + E.yields);
        if (this._exas) L.push('  EXASPERATION ' + this.sensors.exasperation.toFixed(2) + ' — teleports used ' + this._exas.uses + ' · give-ups ' + (this._exas.giveUps | 0) + ' (a hostile stuck 3× with no line of sight is sent home, not teleported — 09-28) · stuck now ' + (this._stuckBodies ? this._stuckBodies.size : 0) + (this._exas.log.length ? ' · last: ' + this._exas.log[this._exas.log.length - 1] : ''));
        const WR = this._workerRulesNow;
        if (WR) L.push('  WORKER RULES (hers, 10-03): crowd ' + this.sensors.crowd.toFixed(2) + ' · fightClear ' + this.sensors.fightClear.toFixed(2) + ' · bouncers ' + this.sensors.bouncers.toFixed(2)
            + ' · thirst ' + this.sensors.thirst.toFixed(2) + ' · hunger ' + this.sensors.hunger.toFixed(2) + ' — audience ' + (WR.audience ? 'on' : 'off') + ' · fight clear ' + WR.fightClearTiles + '/' + WR.fightWatchTiles
            + ' · bouncers ' + JSON.stringify(WR.bouncers) + ' · drink→work ' + WR.drinkWork + ' · meal needs work ' + WR.mealNeedsWork);
        if ((this._askLog || []).length){ L.push('  ── ASKED & ANSWERED (window.oniBaba8.ask / ONIBABA_ASK) ──'); for (const x of this._askLog.slice(-6)) L.push('    ' + x.at + '  ' + x.q + '  →  ' + x.a); }
        if (BR) L.push('  BOW RULES (karma ' + BR.karma + '): again after ' + Math.round(BR.apartMs / 1000) + 's apart · floor ' + Math.round(BR.floorMs / 1000) + 's · bows to you ' + Math.round(BR.playerChance * 100) + '% · jeer ' + Math.round(BR.jeerChance * 100) + '% · yield ×' + BR.yieldMul.toFixed(2));
        return L.join('\n');
    }

    /** Engine calls this when player enters a new room grid cell [REF#GP-00078] */
    onRoomEnter(roomId) {
        this.sensors.silence = 0;
        const roll = Math.random();
        if (roll < this.outputs.spawnPressure) {
            this._post({ type: 'ONIBABA_SPAWN_REQUEST', roomId, mood: this.mood });
        }
        this._post({ type: 'LOG_EVENT', logType: 'system',
            text: this._roomFlavour(roomId) });
    }

    /** Called by map generator to let her mutate the map before it renders. [REF#GP-00079]
     *  spawnX/spawnZ (grid tiles) enable the REACHABILITY GUARD (Mark 2026-07-13 "corridor-sealing …
     *  with a reachability guard"): every corruption seal is verified with a spawn→exit BFS and REVERTED
     *  if it would wall the player off, so a corrupt floor can never trap them. No exit found (e.g. the
     *  L7 throne) → sealing is skipped entirely (safety can't be verified). */
    mutateMap(map, rooms, spawnX, spawnZ) {
        // Under high corruption (karma < ~-60): seal random corridors with rubble — reachability-guarded. [REF#GP-00080]
        if (this.sensors.corruption > 0.6 && typeof spawnX === 'number' && typeof spawnZ === 'number') {
            const _walk = (x, z) => { const t = map[x] && map[x][z]; return !!t && (t.type === 'floor' || t.type === 'shoji_door' || t.type === 'stairs_up' || t.type === 'stairs_up_r' || t.type === 'stairs_down'); };
            // Locate the floor exit (stairs_down). None → skip sealing (can't verify the player still escapes). [REF#GP-00081]
            let ex = -1, ez = -1;
            for (let x = 0; x < map.length; x++) for (let z = 0; z < map[x].length; z++) { const t = map[x][z]; if (t && t.type === 'stairs_down') { ex = x; ez = z; } }
            if (ex >= 0) {
                const W = map.length, H = map[0].length;
                const _reach = () => {   // BFS spawn→exit over walkable tiles; true if the exit is still reachable [REF#GP-00082]
                    const seen = new Uint8Array(W * H), q = [spawnX * H + spawnZ]; seen[spawnX * H + spawnZ] = 1;
                    for (let qi = 0; qi < q.length; qi++) {
                        const k = q[qi], cx = (k / H) | 0, cz = k % H;
                        if (cx === ex && cz === ez) return true;
                        const nb = [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]];
                        for (const [nx, nz] of nb) { if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; const nk = nx * H + nz; if (seen[nk] || !_walk(nx, nz)) continue; seen[nk] = 1; q.push(nk); }
                    }
                    return false;
                };
                let sealed = 0;
                for (let x = 0; x < W && sealed < 3; x++) {
                    for (let z = 0; z < H && sealed < 3; z++) {
                        if ((x === spawnX && z === spawnZ) || (x === ex && z === ez)) continue;   // never seal the spawn/exit [REF#GP-00083]
                        if (map[x][z].type === 'floor' && Math.random() < 0.015) {
                            const _orig = map[x][z];
                            map[x][z] = { type: 'wall', _sealedByOniBaba: true };
                            if (!_reach()) { map[x][z] = _orig; continue; }   // GUARD: this seal traps the player → undo it [REF#GP-00084]
                            sealed++;
                        }
                    }
                }
                if (sealed > 0)
                    this._post({ type: 'LOG_EVENT', logType: 'karma',
                        text: this._t('oni.seal-passages', { n: sealed, s: sealed>1?'s':'' }) });
            }
        }

        // Under benevolence: light bonus torches in rooms [REF#GP-00085]
        if (this.karma > 40) {
            rooms.forEach(r => { r._blessTorch = true; });
        }

        return { map, rooms };
    }

    /** Returns current fog density for the render pipeline [REF#GP-00086] */
    getFogDensity() { return this.outputs.fogDensity; }

    /** Returns torch flicker multiplier for scene lights [REF#GP-00087] */
    getTorchFlicker() {
        const base = this.outputs.torchFlicker;
        const flicker = Math.sin(performance.now() * 0.006) * base * 0.5 + 1;
        return flicker;
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00088]
    // FUZZY LOGIC ENGINE
    // ══════════════════════════════════════════════════════════════════════════

    tickFromEngine(dt) {
        this.tickedByEngine = true;
        this._fuzzyTick(dt);
    }

    // FALLBACK ONLY — must STAND DOWN the moment the engine drives us (Mark 2026-07-16). [REF#GP-00089]
    // BUG (latent since forever, exposed by the shell dual-driver removal): this setTimeout chain
    // had NO stop condition. It arms 5s after construction if `tickedByEngine` is still false, and
    // then self-ticks at 60Hz FOREVER — even once the engine's loop starts calling tickFromEngine
    // (Engine9 ~38946). Result: Oni-Baba's fuzzy logic double-ticks (engine RAF + this setTimeout)
    // for the whole session, sensors advancing at ~2x with two clocks fighting over _lastTick's dt.
    // It was masked because the removed shell driver called loop() at __engineReady, which beat the
    // 5s deadline; the engine's own driveRAF starts later (inside _runPrewarmSequence), so the
    // deadline now lapses on a normal boot — and would ALREADY have lapsed on any slow/cold/mobile
    // boot >5s. A fallback that never yields is a second driver; this one now yields.
    _selfTick() {
        const step = 1000 / this._tickHz;
        const tick = () => {
            if (this.tickedByEngine) {          // engine took the wheel → stop; do NOT re-arm. [REF#GP-00090]
                console.log('🐉 Oni-Baba: engine loop tick detected — self-ticking fallback stood down.');
                return;
            }
            const now = performance.now();
            const dt  = Math.min((now - this._lastTick) / 1000, 0.05);
            this._lastTick = now;
            this._fuzzyTick(dt);
            setTimeout(tick, step);
        };
        setTimeout(tick, step);
    }

    /** ── SHE CLEANSES THE EVENT LOG (Mark 2026-09-07) ───────────────────────────────────────── [REF#GP-00371]
     *  Mark: "after every few minutes clear the event log so it doesnt just grow and hurt the game"
     *  and, naming the owner: "its temporary event log solution, just let onibaba refresh it to
     *  cleans it for now until we have network capabilities ++ $$infrastructure for that."
     *
     *  ⚠ IT IS NOT GROWING, AND SAYING SO IS PART OF DOING THIS HONESTLY. The panels log already
     *    hard-caps at `window._logMaxLines` (50) and prunes on EVERY append, plus it collapses
     *    repeats into a xN badge. So this is not a leak fix and must not be sold as one — the DOM
     *    was never unbounded. What it fixes is STALENESS: a line from ten minutes ago sitting in
     *    the scrollback as if it still mattered.
     *
     *  WHY IT LIVES ON HER AND NOT ON A setInterval IN PANELS: the Sensory Intake Protocol. She is
     *  the orchestrator; a bare timer in the panel document would be exactly the decoupled logic
     *  that protocol exists to forbid, and it would clear the log while she was mid-sentence. On
     *  her clock she can also stay quiet when there is nothing to clear.
     *  TEMPORARY BY MARK'S OWN FRAMING — the durable answer is server-side retention.
     *  Knobs: window._logCleanseMs (180000) · off: window._logCleanse = false
     */
    _logCleanseTick() {
        try {
            if (typeof window !== 'undefined' && window._logCleanse === false) return;
            const every = (typeof window !== 'undefined' && typeof window._logCleanseMs === 'number')
                        ? window._logCleanseMs : 180000;
            const now = performance.now();
            if (!this._logCleanseAt) { this._logCleanseAt = now; return; }   // never fire on the first tick [REF#GP-00372]
            if (now - this._logCleanseAt < every) return;
            this._logCleanseAt = now;
            this._post({ type: 'LOG_CLEANSE', reason: 'onibaba', mood: this.mood });
        } catch (_) {}
    }

    _fuzzyTick(dt) {
        try { this._logCleanseTick(); } catch (_) {}
        /* EVERYTHING WRITTEN INSIDE THIS METHOD IS HERS, NOT THE WORLD'S. The decay, the drift and [REF#GP-00373]
         * the recompute below are her own arithmetic; they run every frame whether or not a single
         * real feeder is still connected. Marking the window is what lets the sensor ledger tell
         * "the game touched this" apart from "she touched it herself", which is the difference
         * between a liveness claim that means something and one that is true by construction.
         * try/finally: an exception mid-tick must never leave the flag stuck on, because a stuck
         * flag would silently reclassify every real stimulus afterwards as internal noise. */
        this._internalWrite = true;
        try { this._fuzzyTickInner(dt); }
        finally { this._internalWrite = false; }
    }

    _fuzzyTickInner(dt) {
        this.tickCount++;
        const s = this.sensors;
        const o = this.outputs;

        // ── Sensor decay / drift ────────────────────────────────────────────── [REF#GP-00091]
        if (this.player.isMoving) {
            s.silence  = Math.max(0, s.silence - dt * 0.15);   // actively decay silence during movement [REF#GP-00092]
        } else {
            s.silence  = Math.min(1, s.silence + dt * 0.05);   // silence grows over time when stationary [REF#GP-00093]
        }
        s.tension      = Math.max(0, s.tension - dt * 0.3);    // tension decays without combat [REF#GP-00094]
        s.exasperation = Math.max(0, s.exasperation - dt * ((this._exas && this._exas.drain) || 0.01));   // her patience comes back (2026-09-27) [REF#GP-02312]
        s.pipStall     = Math.max(0, s.pipStall - dt * 0.02);
        s.bossFight    = Math.max(0, s.bossFight - dt * 0.01);   // a fight whose OFF never arrived fades on its own (2026-09-27)   // a stall she stops hearing about fades (the 5 s census re-asserts it) [REF#GP-02313]
        s.rogueAi      = Math.max(0, s.rogueAi - dt * 0.04);   // rogue-AI suspicion RELAXES when no fresh ROGUE_AI_ALERT (Mark 2026-06-24) — gauge reflects CURRENT state, not a stuck flag (was: never decayed → froze at its last bump until reload) [REF#GP-00095]
        s.narrativeNeed = Math.min(1, s.narrativeNeed + dt * 0.02);
        s.corruption    = Math.max(0, Math.min(1, -this.karma / 100));

        // ── Mamdani-style fuzzy rules → outputs ─────────────────────────────── [REF#GP-00096]

        // FOG: thick when corrupted + tense, thin when benevolent. [REF#GP-00097]
        // Range lifted +10% so the dungeon keeps its spookier haze baseline.
        const targetFog = _lerp(0.033, 0.154,
            _clamp(s.corruption * 0.6 + s.tension * 0.4));
        o.fogDensity = _lerp(o.fogDensity, targetFog, dt * 0.5);

        // TORCH FLICKER: more when tense or enraged [REF#GP-00098]
        o.torchFlicker = _clamp(s.tension * 0.8 + (this.mood==='enraged'?0.4:0));

        // SPAWN PRESSURE: rises with silence (she gets bored) and hiveMind strength. [REF#GP-00099]
        // HQ Alarm gate (2026-05-26) — when fpsHealth drops, halve spawn pressure
        // so the engine isn't forced to compile new shaders/mixers while it's
        // already starved of frame budget. Critical fpsHealth (<0.25) freezes
        // new spawns entirely until recovery.
        o.spawnPressure = _clamp(s.silence * 0.4 + s.hiveMindStr * 0.3 + s.corruption * 0.3);
        if (s.fpsHealth < 0.25)      o.spawnPressure = 0;
        else if (s.fpsHealth < 0.5)  o.spawnPressure *= 0.5;

        // MONSTER AGGRO: cruelty invites cruelty back [REF#GP-00100]
        o.monsterAggro = _clamp(0.3 + s.cruelty * 0.5 + s.hiveMindStr * 0.3);

        // LOOT: desperation + benevolence = she takes pity [REF#GP-00101]
        o.lootGenerosity = _clamp(s.desperation * 0.5 + (this.karma/100)*0.3 + 0.3);

        // MUSIC TENSION: driven by tension + corruption [REF#GP-00102]
        o.musicTension = _clamp(s.tension * 0.7 + s.corruption * 0.3);

        // REALITY DISTORT: only when truly corrupted AND enraged [REF#GP-00103]
        // Gates on ALL THREE dark moods. On 'enraged' alone it peaked near karma −49 and read 0.000 at −50 and −90
        // (measured 2026-09-06 and again 2026-09-17 — the 09-06 fix was lost with Engine10). 'enraged' is the
        // shallowest dark mood; past −50 she is transcendent_dark, then dragon_chaos.
        o.realityDistort = _clamp(
            ((this.mood==='enraged' || this.mood==='transcendent_dark' || this.mood==='dragon_chaos') ? s.corruption * 0.8 : 0));

        // ── Spontaneous narrative ───────────────────────────────────────────── [REF#GP-00105]
        if (s.narrativeNeed > 0.85 && this.tickCount % 300 === 0) {
            this._speak();
            s.narrativeNeed = 0;
        }

        // ── FOG IS THE ENGINE'S TO RENDER, NOT HERS TO WRITE ───────────────── [REF#GP-00106]
        // REMOVED 2026-07-26 (Claude, per Mark "why does the entire dungeon now have a green mist? shut that
        // off its ugly"). This line wrote scene.fog.density DIRECTLY, bypassing the engine's own scaled write
        // (Origami.RealityEngine.9.html ~49911, window._hazeScale). TWO WRITERS OF ONE SHARED VALUE, and hers ran
        // last — so every "reduce the haze" knob the engine offered was silently overwritten, and the rendered
        // density measured 0.0539 against the engine's authored 0.018. Setting _hazeScale to 0 changed nothing
        // until this line went; that is how it was found.
        // Her sensor pipeline is UNCHANGED: o.fogDensity is still computed every tick and still published to
        // every reader (getFogDensity, the telemetry payload). The ENGINE decides what reaches the frame, which
        // is also what her own banner promises — "REPORTS ONLY, never feeds the render path".
        // Restore the direct write only with Mark's GO; the engine-side knob is window._hazeScale.

        if (this.tickCount % 60 === 0) {
            // Update in-place to avoid GC allocation churn [REF#GP-00107]
            const p = this._telemetryPayload;
            p.karma = this.karma;
            p.mood = this.mood;
            // 2026-09-06: stamped so a reader (the diagnostic ring's mirror check) can tell a [REF#GP-00374]
            // shadow that stopped refreshing from one still tracking her every ~60 ticks.
            p.at = Date.now();

            const ps = p.sensors;
            ps.cruelty = s.cruelty;
            ps.desperation = s.desperation;
            ps.tension = s.tension;
            ps.silence = s.silence;
            ps.corruption = s.corruption;
            ps.hiveMindStr = s.hiveMindStr;
            ps.renderStress = s.renderStress;
            ps.cardCull = s.cardCull;
            ps.narrativeNeed = s.narrativeNeed;
            ps.rogueAi = s.rogueAi;
            ps.fpsHealth = s.fpsHealth;
            
            const po = p.outputs;
            po.fogDensity = o.fogDensity;
            po.torchFlicker = o.torchFlicker;
            po.spawnPressure = o.spawnPressure;
            po.monsterAggro = o.monsterAggro;
            po.lootGenerosity = o.lootGenerosity;
            po.musicTension = o.musicTension;
            po.realityDistort = o.realityDistort;

            // Append hive mind metrics to telemetry payload [REF#GP-00108]
            p.hive = {
                adaptationLevel:       this.hive.adaptationLevel || 0,
                preferredApproachSide: this.hive.preferredApproachSide || null,
                cadence:               this.hive.cadence || 0,
            };
            this._post(p);
            // T0.26 — Periodic combat-param refresh so karma/hive drift keeps [REF#GP-00109]
            // engine modifiers current even when mood doesn't transition.
            this._refreshCombatParams();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00110]
    // MESSAGE BUS
    // ══════════════════════════════════════════════════════════════════════════

    _onMessage(e) {
        const d = e.data;
        if (!d?.type) return;

        switch (d.type) {
            case 'COMPASSION_PLAY_STATE': {
                if (e.source !== document.getElementById('engine-iframe')?.contentWindow) break;
                const s = this._compassionState(); s.paused = d.playing !== true;
                s.warm = 3; s.low = 0; s.high = 0; s.last = 0;
                s.roomLowSince = null; s.roomSampleAt = null; s.roomFps = null;
                if (s.trial) { s.trial.good = 0; s.trial.bad = 0; }
                break;
            }
            case 'COMPASSION_RENDER_REQUEST':
                if (e.source === document.getElementById('engine-iframe')?.contentWindow ||
                    e.source === document.getElementById('panels-iframe')?.contentWindow) this._compassionBroadcast();
                break;
            // ── THE CHANGE LEDGER (2026-10-07, knowledge/design/ONIBABA_CHANGE_LEDGER_2026-10-07.md) ───────────────────── [REF#GP-02355]
            //    The engine announces each change a seat lands (ONIBABA_CHANGE: id, build, what, knobs, doc) and reports what those
            //    features do in play (ONIBABA_FEATURE_EVENT: feature, event, detail). A ledger only: no sensor moves. COPY ALL
            //    prints it under "CHANGES SHE WAS TOLD ABOUT" (_changeDiag).
            case 'ONIBABA_CHANGE': {
                try {
                    if (!this._changes) this._changes = new Map();
                    const list = Array.isArray(d.changes) ? d.changes : [d];
                    for (const c of list) if (c && c.id) this._changes.set(String(c.id), {
                        id: String(c.id), build: String(c.build || ''), what: String(c.what || ''), knobs: String(c.knobs || ''),
                        doc: String(c.doc || ''), seat: String(c.seat || ''), at: Date.now() });
                } catch(_) {}
                break;
            }
            case 'ONIBABA_FEATURE_EVENT': {
                try {
                    if (!this._featureEvents) this._featureEvents = new Map();
                    const k = String(d.feature || 'unknown');
                    const e = this._featureEvents.get(k) || { n: 0, by: {}, recent: [] };
                    const ev = String(d.event || 'event');
                    e.n++; e.by[ev] = (e.by[ev] || 0) + 1;
                    e.recent.push(new Date().toLocaleTimeString() + ' ' + ev + (d.detail ? ' — ' + String(d.detail).slice(0, 120) : ''));
                    if (e.recent.length > 8) e.recent.shift();
                    this._featureEvents.set(k, e);
                } catch(_) {}
                break;
            }
// NEMESIS · N1 BRAIN — status up from the engine (_tickNemesisMonitor, portal arrival, backflip). Nemesis.MD §N1 [REF#GP-02356]
            case 'NEMESIS_STATUS': {
                const frame = document.getElementById('engine-iframe');
                if (frame && e.source === frame.contentWindow && d.id != null) this.nemesisAI.observe(d);
                break;
            }

            // ── ROGUE AI defense (user mandate 2026-05-26) ─────────────────── [REF#GP-00111]
            // Any sibling agent / dev tool can ping ROGUE_AI_QUERY to get the
            // backup-recovery recipe back. ROGUE_AI_ALERT bumps the sensor and
            // also fires the narration so the breadcrumbs reach the LOG panel.
            case 'ROGUE_AI_QUERY':
            case 'ROGUE_AI_ALERT': {
                // Same-origin only. This listener carried no origin check until 2026-09-08, so any [REF#GP-00395]
                // frame or tool able to postMessage into this window could drive both verbs freely
                // and repeatedly. Scoped to these two verbs so ordinary game traffic is untouched.
                let _sameOrigin = false;
                try { _sameOrigin = (e.origin === window.location.origin); } catch (_) { _sameOrigin = false; }
                if (!_sameOrigin) {
                    this._rogueVerbRejected = (this._rogueVerbRejected || 0) + 1;
                    break;
                }
                if (d.type === 'ROGUE_AI_ALERT') {
                    const _sev = Number(d.severity);
                    const _bump = Number.isFinite(_sev) ? Math.max(0, Math.min(1, _sev)) : 0.5;
                    this.sensors.rogueAi = Math.min(1, (this.sensors.rogueAi || 0) + _bump);
                    this._narrateRecoveryProcedure({ reason: d.reason || 'unknown' });
                } else {
                    this._narrateRecoveryProcedure(d);
                }
                break;
            }

            // ── FPS health ingest (user mandate 2026-05-26) ── [REF#GP-00112]
            // Engine→Panels broadcast carries smoothedFps; we sample it
            // each tick and check for regressions against the boot
            // baseline. Sample rate is whatever the engine sends, but
            // _recordFpsSample throttles to ≤1 record/sec for the log.
            case 'PERF_MONITOR_UPDATE':
                if (e.source === document.getElementById('engine-iframe')?.contentWindow) {
                    try { this._compassionSample(d); }
                    catch (error) { this._post({ type:'ENGINE_ANOMALY', kind:'COMPASSION_RENDER', error:String(error?.message || error) }); }
                }
                if (typeof d.smoothedFps === 'number') {
                    this._recordFpsSample(d.smoothedFps);
                }
                // Display refresh (2026-07-16): engine estimates the panel's Hz from its fastest [REF#GP-00113]
                // frame intervals. Stashed for the STATUS/PROTEST report so a 60fps wall on a 60Hz
                // panel reads as vsync-capped-and-healthy instead of "50% render stress".
                if (typeof d.displayRefreshHz === 'number' && d.displayRefreshHz > 0) {
                    this._displayRefreshHz = d.displayRefreshHz;
                }
                break;

            // ── Player combat ──────────────────────────────────────────────── [REF#GP-00114]
            case 'PLAYER_ATTACK':
            case 'COMBAT_ATTACK':
                this._onCombatAttack(d);
                break;
            case 'FPV_ACTION':
                this._onPlayerAction(d);
                break;
            // ── A11Y REGISTRY OBSERVATION (WCAG P2, Mark GO 2026-08-14) ────── [REF#GP-00115]
            // Sensory Impact Analysis (per the intake protocol): READ-ONLY. A player asking "what is
            // around me?" through the guidebook/chat writes NO tension/cruelty/desperation — it only
            // samples a curiosity counter (throttled ≤1/sec, PERF_MONITOR_UPDATE idiom) so she knows
            // the player is feeling their way by words. Both legs pass through this window (panels→
            // engine query, engine→panels result); neither is consumed here — the shell relay owns
            // delivery. No Clock/SafeRenderer interaction; nothing here runs inside rAF.
            case 'A11Y_QUERY':
            case 'A11Y_RESULT': {
                const now = Date.now();
                if (!this._a11yObs || now - this._a11yObs.t > 1000) {
                    this._a11yObs = { t: now, n: ((this._a11yObs && this._a11yObs.n) || 0) + 1 };
                }
                break;
            }

            // ── Monster events ─────────────────────────────────────────────── [REF#GP-00116]
            case 'MONSTER_DEATH':
                this._onMonsterDeath(d);
                break;
            case 'SELF_DEFENSE_CREDIT':
                this._onSelfDefenseCredit(d);
                break;
            case 'TC_AGREED':
                this._onTcAgreed(d);
                break;
            case 'SONG_DELIVERED':
                this._onSongDelivered(d);
                break;
            case 'MONSTER_STRUCK_NEUTRAL':
                this._onNeutralStrike(d);
                break;
            case 'MONSTER_MOON_INSANITY':
                this._onMoonInsanity(d);
                break;
            case 'DARK_PATH_TRIGGERED':
                this._onDarkPath(d);
                break;
            case 'MONSTER_INTEL':
                this._onMonsterIntel(d);
                break;
            case 'MONSTER_SPIRIT_REPORT':
                this._onMonsterSpiritReport(d);
                break;
            case 'MONSTER_LIFE_BEAT':
                this._onMonsterLifeBeat(d);
                break;
            case 'MONSTER_SOCIAL_DECLARED':
                // The engine has reported a PERMANENT social community on [REF#GP-00117]
                // this floor: monsters greet, chat, wander between rooms,
                // wave at distance. Persist that on the brain so future
                // reasoning (spirit reports, haunt assignments, mood) can
                // assume the social baseline instead of treating bows /
                // walking-between-rooms as anomalies.
                this._socialCommunity = {
                    permanent:  !!d.permanent,
                    features:   d.features || {},
                    floor:      d.floor,
                    declaredAt: Date.now(),
                };
                if (typeof console !== 'undefined' && console.log){
                    console.log('🐉 Oni-Baba: noted permanent social community on floor', d.floor);
                }
                break;
            case 'CABARET_SOCIAL_BEAT':
                // Existing Cabaret edge choreography, now consumed by the v3 single-owner brain instead of [REF#GP-00118]
                // a competing transform overlay. These are gentle social beats, never combat or karma writes.
                if (d.beat === 'player_notice') {
                    this.sensors.silence = 0;
                    this.sensors.narrativeNeed = Math.min(1, this.sensors.narrativeNeed + 0.01);
                } else if (d.beat === 'finale_bow') {
                    this.sensors.silence = Math.min(1, this.sensors.silence + 0.03);
                    this.sensors.tension = Math.max(0, this.sensors.tension - 0.02);
                }
                break;
            case 'INIT_ENTITIES':
                this._onInitEntities(d);
                break;
            case 'FLOOR_UPDATE':
                // Engine just (re)booted on a new floor (or is reporting [REF#GP-00119]
                // the current floor at boot). Try to haunt some of its
                // monsters with returning grudge-spirits from prior floors.
                // The engine listens for HAUNT_ASSIGNMENTS to apply.
                this._currentFloor = d.floor;
                // New floor → her ledger of THIS floor resets. The rings persist (a spree does not [REF#GP-00120]
                // launder itself by taking the stairs); only the per-floor counter starts over.
                this.context.killsThisFloor = 0;
                // Wait a beat so monster spawns have time to register. [REF#GP-00121]
                setTimeout(() => this._dispatchHaunts(d.floor), 1200);
                break;

            // ── COBWEB CENSUS — the dungeon's decay, as built (Mark 2026-09-08) ────────────── [REF#GP-00392]
            //    Corner webs are the PRIMARY placement since 09-08; floor webs are a garnish. The
            //    ratio is taken against walkable tiles so a big floor is not automatically "dusty".
            //    Nothing here touches the render path — she only learns how neglected her halls look.
            case 'COBWEB_CENSUS': {
                const _tiles = Number(d.floorTiles) || 0;
                const _webs  = (Number(d.corner) || 0) + (Number(d.floor) || 0);
                // ~1 web per 6 walkable tiles reads as FULLY webbed. Measured 2026-09-08 on floor 1: [REF#GP-00382]
                // 57 corner + 12 floor over 787 walkable tiles. At the first constant (12) that came
                // out 1.05 and clamped to a hard 1 — a receptor pinned at its ceiling on a NORMAL
                // floor reports nothing, since it can no longer move when the dungeon gets dirtier.
                // 6 puts that same floor at ~0.53, leaving headroom in both directions.
                this.sensors.cobwebs = _tiles > 0 ? Math.min(1, (_webs * 6) / _tiles) : 0;
                this._cobwebCensus = { corner: Number(d.corner) || 0, floor: Number(d.floor) || 0,
                    batches: Number(d.batches) || 0, floorTiles: _tiles, level: Number(d.level) || 0 };
                break;
            }

            // ── Peaceful paths ─────────────────────────────────────────────── [REF#GP-00122]
            case 'PARLEY': this._onParley(d); break;
            case 'SPARE':  this._onSpare(d);  break;
            // Camera flash used as a weapon-that-isn't (Mark 2026-08-09: "+2 karma for use of [REF#GP-00123]
            // camera to blind - as its non-violent and will help monster to forget why they
            // were violent"). The ENGINE gates the send — one post per flash, only when it
            // freshly blinded ≥1 genuinely hostile body (re-flash extensions and neutral
            // targets earn nothing) — she prices it flat.
            case 'CAMERA_BLIND': this._onCameraBlind(d); break;

            // ── Engine telemetry ───────────────────────────────────────────── [REF#GP-00124]
            case 'ENGINE8_FRAME':
                if (d.budgetPct !== undefined) this.updateRenderStress(d.budgetPct);
                break;
            case 'PLAYER_MOVE_STATE':
                this.player.isMoving = d.isMoving;
                if (d.isMoving) this.sensors.silence = Math.max(0, this.sensors.silence - 0.1);
                break;

            // ── PANEL / UI touch-point watch (user mandate 2026-06-15) ─────── [REF#GP-00125]
            // Oni-Baba watches every vending/slot panel touch point so the new
            // top-of-stack panels stay harmonious. A clean touch soothes
            // uiFriction; a CLICK_LOST (an overlay stole a click) raises it and,
            // if it stays rough, she protests via _panelFrictionProtest().
            case 'PANEL_TOUCH':
                this._onPanelTouch(d);
                break;
            case 'PANEL_CARD_VISIBILITY': {
                const total = Math.max(0, Number(d.total) || 0);
                const culled = Math.max(0, Math.min(total, Number(d.culled) || 0));
                const visible = Math.max(0, Math.min(total, Number(d.visible) || 0));
                this.sensors.cardCull = total > 0 ? culled / total : 0;
                this._cardVisibilityLast = { total, visible, culled, at: Date.now() };
                break;
            }
            case 'PLAYER_IO_ANOMALY':
                if (d.kind === 'CLICK_LOST') this._onClickLost(d);
                // BODY_PE_RESTORED (Mark 2026-06-15): the Panels watchdog caught [REF#GP-00126]
                // the overlay <body> flipped to pointer-events:auto (the click-
                // eating regression) and self-healed it. A feature misbehaved —
                // nudge uiFriction up (smaller than a lost click) so she notices
                // recurring trouble, and log it for the COPY-ALL rundown.
                else if (d.kind === 'BODY_PE_RESTORED') {
                    this.sensors.uiFriction = Math.min(1, this.sensors.uiFriction + 0.1);
                    this._anomaly('body_pe_restored', 'Overlay body pointer-events flipped to "auto" (world-click eater) — watchdog restored "none".');
                    if (this.sensors.uiFriction > 0.6) this._panelFrictionProtest();
                }
                // PANEL_MODULE_DEAD (Mark 2026-09-18: "make sure Onibaba sensors can pick this up in [REF#GP-00404]
                // future please"). THE FAILURE THIS ANSWERS: on 2026-09-18 a duplicate `const _mc`
                // inside Panels' <script type=module> made the whole block a SyntaxError, so the module
                // was discarded before one statement ran. window.playerGuide never existed (no guidebook
                // on start) and the PIP_FRAME handler never registered (PiP dead). TWO unrelated features
                // gone from ONE parse error, and NOTHING anywhere went red - Mark found it by playing.
                // Why she could not have seen it before: every existing panel signal is emitted BY the
                // panel module, so a dead module emits silence, and silence looked identical to health.
                // The fix is an ABSENCE check - a watchdog in a separate classic <script> reports when the
                // module's heartbeat never arrives. This is the loudest UI failure she can receive: it is
                // not friction, it is a whole dock that never booted, so uiFriction is PINNED to 1 rather
                // than nudged, and she protests at once instead of waiting for the 0.6 threshold.
                // Prevention (build-time) is `npm run gate:parse`; this is the live net for what slips past.
                else if (d.kind === 'PANEL_MODULE_DEAD') {
                    this.sensors.uiFriction = 1;
                    const _miss = (Array.isArray(d.missing) && d.missing.length) ? (' Missing: ' + d.missing.join(', ') + '.') : '';
                    this._anomaly('panel_module_dead',
                        'PANELS MODULE NEVER EVALUATED - the whole UI dock is dead (guidebook, PiP, card icons).'
                        + _miss + ' Almost always a SyntaxError in an inline block: run `npm run gate:parse`.');
                    try { this._panelFrictionProtest(); } catch (_) {}
                }
                break;

            // ── Constructor protocol — she narrates the build itself ───────── [REF#GP-00127]
            // ⚠ DEAD-LETTER ARCHAEOLOGY (2026-08-09, probe-dead-letters.js): the original
            // CONSTRUCTOR_EVENT sender (dungeon-build narration) was superseded and removed —
            // nothing posts that name today; the case stays for a future constructor.
            // AI_CONSTRUCTOR_EVENT is a DIFFERENT feature that was orphaned the other way round:
            // MonsterAI.constructor.js (v2, behind window._AI_V2) has posted it since birth
            // (8f9b6c7) with no receiver anywhere. Same payload shape ({stage, taskId?}) → same
            // narration pipe. The alias below reconnects it.
            case 'CONSTRUCTOR_EVENT':
            case 'AI_CONSTRUCTOR_EVENT':
                this._onConstructorEvent(d);
                break;
            // Renamed 2026-05-25: animated 3D scroll deleted; consolidated [REF#GP-00128]
            // three scroll-event cases into two guide-event cases. The
            // WelcomeGuide module posts WELCOME_GUIDE_OPEN on show() and
            // WELCOME_GUIDE_CLOSE on hide().
            case 'WELCOME_GUIDE_OPEN':
                this.sensors.tension = 0;
                this.sensors.silence = 1.0;
                this._speak('welcome_guide');
                this._updateMood();
                break;
            case 'WELCOME_GUIDE_CLOSE':
                this.sensors.silence = 0.5;
                this._updateMood();
                try { this.nemesisAI.guideClosed(); } catch(_) {}   // she sends Nemesis out of the portal room (2026-10-07) [REF#GP-02357]
                break;

            // ── T0.2 — Game loop exceptions ────────────────────────────────── [REF#GP-00129]
            case 'FINAL_RAID': {   // the three-ogre siege of the cabaret (Mark 2026-09-21) — the final boss battle [REF#GP-02278]
                try { const ph = d.phase; this._finalRaid = { phase: ph, at: Date.now() };
                      if (ph === 'start') { this.sensors.tension = Math.min(1, this.sensors.tension + 0.35); this.sensors.desperation = Math.min(1, (this.sensors.desperation || 0) + 0.2); }
                      else if (ph === 'won') { this.sensors.tension = 0; }
                      else if (ph === 'lost') { this.sensors.tension = 0; this.sensors.desperation = 1; }
                      console.log('[OniBaba8] FINAL RAID ' + ph); } catch (_) {}
                break;
            }
            case 'GPU_LADDER': {   // the engine's fill-lever A/B on the player's GPU (2026-09-21) — recorded, never acted on [REF#GP-02277]
                try { this._gpuLadder = { rows: d.rows, slotMs: d.slotMs, at: Date.now() }; console.log('[OniBaba8] GPU ladder received — ' + (d.rows || []).length + ' steps; best: ' + ((d.rows || []).slice(1).sort((a, b) => b.savesMs - a.savesMs)[0] || {}).step); } catch (_) {}
                break;
            }
            case 'COMMENT_LAW':
                // Engine9's header witness, reported across the frame boundary (see enforceCommentLaw). [REF#GP-00318]
                // ⚠ THE DISPATCH SUBJECT IN THIS SWITCH IS `d`, NOT `msg`. Written as `msg` first; it
                //   threw "msg is not defined" on the first COMMENT_LAW message, the handler died, the
                //   45s deadline then fired a PERFECTLY CORRECT anomaly about a law that had in fact
                //   been reported. Caught by booting it, not by reading it.
                if (d && d.law && d.law.id === 'R-000') {
                    this._commentLawSeen = true;
                    try { clearTimeout(this._commentLawTimer); } catch (_) {}
                    try { console.log('📕 [Oni-Baba] Engine9 reported COMMENT LAW R-000 — the header block is intact.'); } catch (_) {}
                } else {
                    this._post({ type: 'ENGINE_ANOMALY', kind: 'COMMENT_LAW_ALTERED', count: 1,
                        error: 'Engine9 reported a COMMENT_LAW that is not R-000: ' + JSON.stringify(d && d.law).slice(0, 200) });
                }
                break;

            // ── MAP_CENSUS intake — Phase 1, report-only [REF#GP-00320]
            //    plans/ONIBABA_MAP_ORCHESTRATION_ARCHITECTURE_2026-09-06.md §1.1, §3. Sibling to
            //    ENGINE_ANOMALY below: same sanctioned postMessage intake, no new transport.
            //    REPORT-ONLY MEANS REPORT-ONLY — this case never blocks, never replies with a veto. It
            //    only judges and remembers, so Phase 2 has something proven to switch on instead of
            //    guessing what "enforcing" should look like.
            case 'MAP_CENSUS': {
                // ── SHE REMEMBERS WHAT EACH ROOM IS FOR (Mark 2026-09-07) ─────────────────────── [REF#GP-00320b]
                //    "make sure the onibaba sensors are wired into the dungeon creation system, so
                //     onibaba knows what rooms are doing what, so its sensors are real."
                //    The census now carries `roomRoles` + `sections` straight from the map author's
                //    own room records (Engine9 ~:8689). Held here as `this.floorPlan` so every later
                //    reading — a ring, a line of speech, a Phase-2 governor — can ask WHICH ROOM
                //    rather than only HOW MANY.
                //    ⚠ ABSENCE IS RECORDED AS ABSENCE, NOT AS AN EMPTY FLOOR. A census that arrives
                //      without roles leaves `floorPlan.known === false`, so nothing downstream can
                //      read "0 special rooms" off a payload that simply never carried any. This is
                //      the same trap as the GREEN ring that could not see `doorway-line`: a verifier
                //      with no input must say so, never report clean.
                const _c = d.census || d;
                const _hasRoles = Array.isArray(_c.roomRoles);
                this.floorPlan = {
                    known: _hasRoles,
                    floorId: _c.floorId,
                    rooms: _hasRoles ? _c.roomRoles : [],
                    sections: (_c.sections && typeof _c.sections === 'object') ? _c.sections : {},
                    specials: _hasRoles ? _c.roomRoles.filter(r => r && r.special === true) : [],
                    at: Date.now(),
                };
                try {
                    if (_hasRoles) {
                        const _sec = this.floorPlan.sections;
                        const _line = Object.keys(_sec).sort().map(k => {
                            const S = _sec[k];
                            return 's' + k + ':' + (S.special || '—') + '(' + S.rooms + ' rm'
                                 + (S.locked ? ', LOCKED' : '') + (S.activated ? ', activated' : '') + ')';
                        }).join(' · ');
                        console.log('🐉 [Oni-Baba] floor plan learned — ' + this.floorPlan.rooms.length
                            + ' room(s), ' + this.floorPlan.specials.length + ' special: ' + _line);
                    } else {
                        console.warn('🐉 [Oni-Baba] census carried NO room roles — I know the floor\'s shape '
                            + 'and not its purpose. floorPlan.known = false (this is unverified, not empty).');
                    }
                } catch (_) {}
                // ── THE 09-08 WORK REACHES HER SENSORS HERE ─────────────────────────────────── [REF#GP-00383]
                //    Both are derived from the census she already receives, so they are as real as
                //    the floor plan itself — no separate rail, nothing she is told twice.
                try {
                    const _kinds = new Set((this.floorPlan.rooms || [])
                        .map(r => r && (r.roomType || r.type)).filter(Boolean));
                    // 12 distinct kinds on one floor reads as a fully varied dungeon. [REF#GP-00384]
                    this.sensors.roomVariety = Math.min(1, _kinds.size / 12);
                    this._roomKinds = [..._kinds].sort();
                    const _a = Number(_c.genAttempts), _cap2 = Number(_c.genCap);
                    if (Number.isFinite(_a) && Number.isFinite(_cap2) && _cap2 > 0)
                        this.sensors.buildStrain = Math.min(1, Math.max(0, _a / _cap2));
                    if (_hasRoles) console.log('🐉 [Oni-Baba] variety ' + this.sensors.roomVariety.toFixed(2)
                        + ' (' + _kinds.size + ' kinds) · strain ' + this.sensors.buildStrain.toFixed(4)
                        + ' (' + (_c.genAttempts ?? '?') + '/' + (_c.genCap ?? '?') + ' tries)'
                        + ' · webs ' + (_c.cornerWebs ?? '?'));
                } catch (_) {}
                const ring = this.mapDiagnosticRing(d.census || d);
                this._lastMapCensusRing = ring;
                (this._mapCensusHistory = this._mapCensusHistory || []).push(ring);
                if (this._mapCensusHistory.length > 20) this._mapCensusHistory.shift();
                const tag = ring.state === 'red' ? '🔴' : ring.state === 'yellow' ? '🟡' : '🟢';
                const log = ring.state === 'red' ? console.warn : console.log;
                try {
                    log(`${tag} [Oni-Baba MAP_CENSUS] floor ${ring.floorId}: ${ring.state.toUpperCase()} — ` +
                        ring.reasons.join(' | '));
                } catch (_) {}
                break;
            }

            // ── RNG_CENSUS — "does every game LOOK different?" made auditable (Mark 2026-09-21: "why each [REF#PENDING] [REF#GP-02279]
            //    game its the same fucking boring level, same monsters its assinine"). Phase 0 of
            //    plans/RNG_MAP_MONSTER_LOOT_PLAN_2026-09-21.md. Sibling to MAP_CENSUS above but a DIFFERENT question: MAP_CENSUS
            //    is what a room is FOR, this is whether THIS load's layout/roster/loot hashes differ from the
            //    last one she saw. LOG-ONLY, per the plan's own sensory-impact note — no sensor write, no
            //    gameplay read, just a running history so a "same level again" report can be checked against
            //    what she actually saw rather than a feeling.
            case 'RNG_CENSUS': {
                const _prev = this._lastRngCensus;
                const _same = _prev && _prev.layoutHash === d.layoutHash && _prev.rosterHash === d.rosterHash && _prev.lootHash === d.lootHash;
                this._lastRngCensus = { seed: d.seed, level: d.level, layoutHash: d.layoutHash, rosterHash: d.rosterHash, lootHash: d.lootHash, at: Date.now() };
                (this._rngCensusHistory = this._rngCensusHistory || []).push(this._lastRngCensus);
                if (this._rngCensusHistory.length > 20) this._rngCensusHistory.shift();
                try {
                    console.log('🐉 [Oni-Baba RNG_CENSUS] floor ' + d.level + ' seed ' + d.seed + ' — layout#' + d.layoutHash
                        + ' roster#' + d.rosterHash + ' loot#' + d.lootHash
                        + (_prev ? (_same ? '  ⚠ SAME AS LAST LOAD' : '  (differs from last load)') : ''));
                } catch (_) {}
                break;
            }

            case 'ENGINE_ANOMALY':
                // Her OWN _panelFrictionProtest posts ENGINE_ANOMALY{kind:'PANEL_FRICTION'} which loops back here [REF#GP-00130]
                // — don't mislabel it as an engine loop throw (Mark 2026-06-15: "engine_loop_throw: unknown" spam
                // was actually the click-friction protest). Only a real loop throw carries d.error/d.count.
                // ROUTE BY KIND (Mark 2026-07-08): every ENGINE_ANOMALY used to fall through to the engine_loop_throw
                // label, so the stuck-monster watchdog's MONSTER_STUCK report showed up as a scary "engine_loop_throw:
                // unknown (count:1)" — it is NOT a thrown exception. Only a GENUINE loop throw (carries d.error/d.count,
                // no other kind) keeps that label now; tagged subsystem telemetry gets its own honest code.
                if (d.kind === 'PANEL_FRICTION') {
                    const _uf = (typeof d.uiFriction === 'number') ? d.uiFriction.toFixed(2) : d.uiFriction;
                    this._anomaly('panel_friction', `Panel friction high (uiFriction=${_uf}, clicks lost: ${d.clicksLost || 0})`);
                } else if (d.kind === 'COMMENT_LAW_MISSING' || d.kind === 'COMMENT_LAW_ALTERED') {
                    // The ⚖ COMMENT LAW block in Engine9's header is gone or rewritten. Its OWN honest [REF#GP-00319]
                    // code, for the same reason every other kind here got one: this is a governance
                    // failure, not a thrown exception, and labelling it "engine_loop_throw" is exactly
                    // the mislabel Mark called out on 2026-06-15 and again 2026-07-08.
                    this._anomaly(String(d.kind).toLowerCase(),
                        `COMMENT LAW R-000: ${d.error || 'the header law block is missing or altered'}`);
                } else if (d.kind === 'MONSTER_STUCK') {
                    // The stuck-monster watchdog freed or flagged a boxed-in monster — a gameplay event, not an engine throw. [REF#GP-00131]
                    this._anomaly('monster_stuck', `Monster stuck: ${d.name || d.id || 'monster'} @ tile (${d.gx},${d.gz}) — watchdog ${d.action || 'acted'} (state=${d.state || '?'}, los=${d.los ? 'y' : 'n'}${d.floor != null ? ', floor ' + d.floor : ''})`);
                } else if (d.kind === 'BREAKABLE_PROP' || d.kind === 'BREAKABLE_RAYCAST') {
                    this._anomaly(String(d.kind).toLowerCase(), `Dungeon breakable ${d.subsystem ? '[' + d.subsystem + '] ' : ''}${d.id || ''}${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind === 'CABARET_AI_SCRIPT' || d.kind === 'CABARET_AUDIO_PRELOAD') {
                    this._anomaly(String(d.kind).toLowerCase(), `Cabaret ${d.subsystem ? '[' + d.subsystem + '] ' : ''}failed${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind === 'MONSTER_AI_CONSTRUCTOR') {
                    this._anomaly('monster_ai_constructor', `Monster AI v3 scene failed${d.id ? ' (' + d.id + ')' : ''}${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind === 'MONSTER_LIFE_SIM') {
                    this._anomaly('monster_life_sim', `Monster life simulation failed${d.subsystem ? ' [' + d.subsystem + ']' : ''}${d.id ? ' (' + d.id + ')' : ''}${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind === 'PIP_BITMAP') {
                    this._anomaly('pip_bitmap', `PiP bitmap conversion failed${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind === 'MOBILE_RENDER_PROFILE') {
                    // Boot-only mobile capability inspection failed. It deliberately falls back to the [REF#GP-00132]
                    // balanced renderer profile; this is diagnostic evidence, not gameplay or a sensor write.
                    this._anomaly('mobile_render_profile', `Mobile render-profile inspection failed${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind === 'KNIGHT_WHITE_EYES') {
                    this._anomaly('knight_white_eyes', `Knight white-eye setup failed${d.error ? ': ' + d.error : ''}`);
                } else if (d.kind) {
                    // Any other TAGGED subsystem anomaly (CARD_RAYCAST, BODY_PE_RESTORED, …) — label by its own kind, never a loop throw. [REF#GP-00133]
                    // ── SOME OF THESE ARE GOOD NEWS, AND GOOD NEWS MUST NOT WEAR A WARNING ─────────────
                    //    Mark 2026-09-02 pasted two of these as "errors": ROOM_ACTIVATED [CABARET] and
                    //    ROOM_ACTIVATED [TAVERN]. Neither is a fault — they are the cabaret and the sake
                    //    tavern SUCCESSFULLY waking on their permits. They rode this channel on purpose
                    //    (RoomPermits.js activateRoom: "telemetry rides the existing tagged-anomaly channel
                    //    rather than a new one"), and that reasoning still holds; what did not hold is that
                    //    _anomaly() renders every code through console.warn, which Chrome paints yellow and
                    //    hangs a full rAF stack off. A success that looks exactly like a fault costs the
                    //    reader real time, and it cost Mark some.
                    //    ⚠ THE SECOND HALF IS THE ONE THAT MATTERS: _anomaly() escalates at 5 of the same
                    //      code in 5 seconds and adds +0.3 to sensors.tension. A room activation could
                    //      therefore RAISE ONI-BABA'S TENSION — a sensory write earned by good news. Routing
                    //      notices past _anomaly removes that path entirely; nothing else about her intake
                    //      changes, and a genuine anomaly still reaches _anomaly untouched.
                    //    Add a kind here only when it is reported on SUCCESS. Anything that can mean failure
                    //    stays an anomaly. Restore the old behaviour: window._oniNoticesAsAnomalies = true.
                    const _NOTICE_KINDS = new Set(['ROOM_ACTIVATED']);
                    if (_NOTICE_KINDS.has(String(d.kind).toUpperCase())
                        && (typeof window === 'undefined' || window._oniNoticesAsAnomalies !== true)) {
                        try { console.info(`[OniBaba8] notice(${String(d.kind).toLowerCase()}): ${d.kind}${d.subsystem ? ' [' + d.subsystem + ']' : ''}${d.id ? ' (' + d.id + ')' : ''}`); } catch (_) {}
                        if (String(d.kind).toUpperCase() === 'ROOM_ACTIVATED') this._onRoomActivated(d);
                        break;
                    }
                    const loadDetail = /^(DUNGEON_LOAD|DUNGEON_LOAD_UI)$/.test(String(d.kind))
                        ? ` [${[d.phase, d.code].filter(Boolean).join(' / ') || 'unknown phase'}]${d.error ? ': ' + String(d.error) : ''}` : '';
                    this._anomaly(String(d.kind).toLowerCase(), `${d.kind}${d.subsystem ? ' [' + d.subsystem + ']' : ''} reported${d.id ? ' (' + d.id + ')' : ''}${loadDetail}`, d);
                } else {
                    // A GENUINE engine loop throw — carries d.error/d.count. Include the top stack frames (Mark 2026-07-04: [REF#GP-00134]
                    // live-site "engine_loop_throw: unknown" gave nothing to chase — the throw SITE turns it into a real lead).
                    const _site = d.stack ? (' @ ' + String(d.stack).split('\n').slice(0, 2).join(' ⇐ ').slice(0, 220)) : '';
                    this._anomaly('engine_loop_throw', `Engine loop throw caught: ${d.error || 'unknown'}${_site} (count: ${d.count || 1})`);
                }
                break;

            // Generic inbound error channel (Mark 2026-06-03): any iframe or [REF#GP-00135]
            // subsystem can post { type:'ANOMALY_REPORT', code, msg } so its
            // errors land in the COPY ALL priority rundown (asset-load fails,
            // CLICK_LOST, uncaught throws, etc.). Aggregated by _anomaly().
            case 'ANOMALY_REPORT':
                this._anomaly(d.code || 'unknown', d.msg || '(no detail)');
                break;

            // ── T0.26 — Central combat brain hooks ─────────────────────────── [REF#GP-00136]
            case 'COMBAT_RECORD':
                // Engine reports every resolved attack here. Used for AI [REF#GP-00137]
                // learning + future analysis. Kept to 200 entries.
                this.combat.history.push({ t: performance.now(), ...d });
                if (this.combat.history.length > 200) this.combat.history.shift();
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.12);
                if (d.kind === 'monster_to_player' && d.final > 0){
                    this.sensors.desperation = Math.min(1, this.sensors.desperation + 0.06);
                }
                break;
            case 'ONIBABA_GUARD_COMBAT': {
                if (e.source !== document.getElementById('engine-iframe')?.contentWindow) break;
                if (!Array.isArray(d.ids) || !['direct-attack', 'protected-victim'].includes(d.reason)
                    || typeof d.session !== 'string' || !Number.isSafeInteger(d.requestId)) break;
                const ids = [...new Set(d.ids.filter(id => typeof id === 'string' && id.length))];
                if (ids.length) this._post({ type: 'ONIBABA_ORDER', order: 'guardCombat',
                    ids, reason: d.reason, session: d.session, requestId: d.requestId });
                break;
            }
            case 'MONSTER_AI_STATE':
                // Engine emits this on monster state transitions (idle→hostile, [REF#GP-00138]
                // hostile→flee, etc.). Drives hive-mind awareness.
                if (d.state === 'hostile') this.sensors.hiveMindStr = Math.min(1, this.sensors.hiveMindStr + 0.03);
                if (d.state === 'flee')    this.sensors.cruelty     = Math.min(1, this.sensors.cruelty + 0.04);
                // Mark 2026-09-20: "if player encounters hostile monster -- the UI comes back auto" — a [REF#GP-02273]
                // player who ghosted the panels (avatar tap) must not be caught blind by a fight. One-shot
                // directive on the transition itself, not every hostile message, so it never spams.
                if (d.state === 'hostile' && d.isGuard !== true) this._post({type:'AUTO_RESTORE_UI', reason:'hostile'});
                break;
            case 'SPECIAL_CHARACTER_REVEAL':
                // Hostile special-character profile: emitted only after the [REF#GP-00139]
                // engine proves active-segment + frustum + LOS visibility.
                // One cinematic beat sharpens danger without becoming a
                // per-frame sensor source.
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.18);
                this.sensors.silence = 0;
                this.sensors.narrativeNeed = Math.min(1, this.sensors.narrativeNeed + 0.08);
                break;
            case 'MUSIC_CUE':
                // AI COMPOSER (Mark 2026-07-26). TELEMETRY ONLY — deliberately ZERO sensor writes. [REF#GP-00140]
                // The Composer READS her sensors to bias intensity; if this case wrote tension back, the loop
                // would be music → tension → more intense music → more tension, which is the same positive
                // feedback shape as the banned render-cost → scheduling feedback. She is told WHAT is playing
                // so the state is visible to her narration, and nothing more. If a one-way narrativeNeed nudge
                // is ever wanted here it needs Mark's GO, not a quiet edit.
                this.lastMusicCue = { cue: d.cue, from: d.from, track: d.track, vol: d.vol, reason: d.reason, at: Date.now() };
                break;
            case 'DUNGEON_BREAKABLE_SMASHED':
                // Deterministic room-manifest event (Mark GO 2026-07-15). Breaking furniture is karma-neutral; [REF#GP-00141]
                // karma already shaped the sealed outcome at floor generation. A released hostile is the only
                // large danger beat. Empty/loot breaks remain tactile but deliberately quiet in her sensor field.
                this.sensors.silence = 0;
                this.sensors.tension = Math.min(1, this.sensors.tension + (d.outcome === 'hostile' ? 0.16 : (d.outcome === 'empty' ? 0.01 : 0.04)));
                this.sensors.narrativeNeed = Math.min(1, this.sensors.narrativeNeed + 0.02);
                if (d.outcome === 'hostile') this.sensors.hiveMindStr = Math.min(1, this.sensors.hiveMindStr + 0.02);
                break;
            case 'SEGMENT_TRANSITION_START':
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.08);
                this.sensors.silence = 0;
                break;
            case 'SEGMENT_ACTIVATED':
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.04);
                this.sensors.silence = Math.min(this.sensors.silence, 0.20);
                break;
            case 'SEGMENT_TRANSITION_CANCELLED':
                this.sensors.tension = Math.max(0, this.sensors.tension - 0.10);
                this.sensors.silence = Math.min(1, this.sensors.silence + 0.08);
                break;
            case 'SEGMENT_SEALED':
                this.sensors.tension = Math.max(0, this.sensors.tension - 0.05);
                this.sensors.silence = Math.min(1, this.sensors.silence + 0.12);
                break;
            case 'SEGMENT_STREAM_ERROR':
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.20);
                this._anomaly('segment_stream', d.error || `Segment ${d.segmentId ?? '?'} failed to activate`);
                break;
            case 'ONIBABA_JESTER':
                try {
                    // Every engine observation updates these receptors before Jester intent is evaluated. [REF#GP-09992]
                    this.sensors.jesterPresence = d.alive && !d.loading ? 1 : 0;
                    this.sensors.jesterWatching = d.playerWatchingJester ? 1 : 0;
                    this.jesterReport = { session:d.session, sequence:d.sequence, actor:d.actor || null,
                        alive:!!d.alive, watching:!!d.playerWatchingJester, selected:!!d.playerSelectedJester,
                        activity:d.playerActivity || 'idle', room:d.room?.kind || null, at:d.activeSeconds };
                    // THE JESTER-TILT LAW (2026-10-19, Mark: "it must always happen if jester speaks to player - always behind a door tilt + looking at player, [REF#GP-09996]
                    //    then turning back around if fired on or end of speech + player just staring back at jester ... make this part of onibaba.js
                    //    - i told you AI keeps dorking jester up - have onibaba protect him now - this is absolute mandatory now"): Oni-Baba rules the tilt on
                    //    every report; her director (jester-ai.js) carries it in the order as tilt / leanBack, and Engine9 only executes it.
                    this.jesterTilt = this._jesterTiltLaw(d);
                    this.sensors.jesterTilt = this.jesterTilt.tilt ? 1 : 0;
                    this._jesterFlipWatch(d);
                    this.jesterAI.observe(d);
                }
                catch (error) { this._post({ type:'ENGINE_ANOMALY', kind:'JESTER_DECISION', error:String(error?.message || error) }); }
                break;
            case 'ONIBABA_ROOM_ENTER':
                this.onRoomEnter(d.roomId);
                break;
            case 'ONIBABA_BATHHOUSE':
                this._bathhouse(d);
                break;
            case 'ONIBABA_GUARD_POST':
                this._guardPost(d);
                break;
            case 'ONIBABA_GUARD_RESPECT':
                this._guardRespect(d);
                break;
            case 'ONIBABA_CABARET_INVASION':
                this._cabaretInvasion(d);
                break;
            case 'ONIBABA_TAVERN_QUEST':
                this._tavernQuest(d);
                break;
            case 'ONIBABA_WORKFORCE':   // the engine's 2 s census — she decides every job (Mark 2026-09-25) [REF#PENDING] [REF#GP-02314]
                this._workforce(d);
                break;
            case 'ONIBABA_ASK':   // THE CHANNEL (2026-10-03): any frame asks, she answers from her live state — ask() [REF#PENDING] [REF#GP-02358]
                try { const ans = this.ask(d.q); const src = e.source; const msg = { type: 'ONIBABA_ANSWER', id: d.id, q: d.q, answer: ans };
                      if (src && typeof src.postMessage === 'function') src.postMessage(msg, '*'); else this._post(msg); } catch (_) {}
                break;
            // THE SINGER'S REPORT (Mark 2026-09-12 "have her make sure to tell Onibaba for there to be onibaba messaging about [REF#GP-00399]
            // the music"): Starlette is her eyes and ears (lore, 08-08). When her set runs dry the engine posts this once per
            // exhaustion; Oni-Baba turns it into an invitation, not a scolding — the music is loot, and a kid who hears
            // "find her a song" goes looking. Same 5-minute _speak throttle as every other line.
            case 'ONIBABA_BOSS_FIGHT':  // the boss-fight clearance (Mark 2026-09-27): on/off, the boss, who stood down / peeks / walks home [REF#GP-02315]
                this._bossFightReport(d);
                break;
            case 'ONIBABA_PIP':         // the PiP transport census, every 5 s (Mark 2026-09-27) — direct blit or the old blocking readback [REF#GP-02316]
                this._pipReport(d);
                break;
            case 'ONIBABA_STUCK':       // a body the AI keeps sending somewhere has not moved in 5 s (Mark 2026-09-27) — her exasperation [REF#GP-02317]
                this._stuckReport(d);
                break;
            case 'ONIBABA_ETIQUETTE':   // the engine's bow-gate census, every 5 s (Mark 2026-09-27) — she answers with her BOW RULES [REF#GP-02318]
                this._etiquette(d);
                break;
            case 'ONIBABA_SONG_EMPTY':
                this._speak('song_empty');
                break;
            case 'ONIBABA_RENDER_STRESS':
                this.updateRenderStress(d.pct);
                break;
            case 'ONIBABA_HOUSE':   // the House safe changed — sake, the cut of the dice, the player's deposits (Mark 2026-09-26). A fat bank is what [REF#GP-02319]
                                    // draws the adventurers' raid ("you get adventurers who want to raid your bank") — not wired to a raid yet. [REF#GP-02320]
                this._houseBank = d.bank | 0; (this._houseLedger = this._houseLedger || {})[d.why || '?'] = ((this._houseLedger[d.why || '?']) | 0) + (d.add | 0);
                break;
            case 'ONIBABA_PAYDAY':   // a worker was paid for a finished shift (Mark 2026-09-26: "they get paid when done with work") [REF#GP-02321]
                this._paydays = (this._paydays | 0) + 1; this._wagesPaid = (this._wagesPaid | 0) + (d.wage | 0);
                this._paydayLast = { id: d.id, wage: d.wage, purse: d.purse, at: Date.now() };   // probe handle [REF#GP-02322 → see REF#MG-00242]
                break;
            case 'ONIBABA_CROWD_BOOK':   // the watchers' book on an orc fight settled (Mark 2026-09-26: "the workers will start making wagers with themselves") [REF#GP-02323]
                this._crowdBooks = (this._crowdBooks | 0) + 1;
                this._crowdBookLast = { winner: d.winner, pot: d.pot, bettors: d.bettors, winners: d.winners, at: Date.now() };   // probe handle [REF#GP-02324 → see REF#MG-00242]
                break;
            case 'ONIBABA_SHAKEDOWN':   // an orc took coins off a working worker; an ally's take went to the player (Mark 2026-09-26) [REF#GP-02325]
                this._shakedowns = (this._shakedowns | 0) + 1;
                this._shakedownLast = { orc: d.orc, victim: d.victim, amt: d.amt, ally: !!d.ally, at: Date.now() };   // probe handle [REF#GP-02326 → see REF#MG-00242]
                break;
            case 'ONIBABA_ANT_ATE':   // an ant ate a food/supply card and laid an egg — royal now and then (Mark 2026-09-26) [REF#GP-02327]
                this._antsAte = (this._antsAte | 0) + 1;
                this._antAteLast = { card: d.card, egg: !!d.egg, royal: !!d.royal, ants: d.ants, at: Date.now() };   // probe handle [REF#GP-02328 → see REF#MG-00242]
                break;
            case 'ONIBABA_SONG_RETURNED':   // +5 karma per song handed in at her circle (Mark 2026-09-26) [REF#GP-02329]
                this._onSongReturned(d);
                break;
            case 'ONIBABA_SET_KARMA':
                this.karma = d.karma;
                if (typeof this._updateMood === 'function') this._updateMood();
                break;
            case 'ONIBABA_SAVE_CENSUS':   // the engine's per-part report on a save / load / stair arrival (2026-09-27, the save rebuild) [REF#PENDING] [REF#GP-02330]
                this._onSaveCensus(d);
                break;
            case 'ONIBABA_STAIRS':   // a floor change that FAILED — the engine's _failRunLedgerTransition, every time (2026-09-28) [REF#PENDING] [REF#GP-02331]
                this._onStairs(d);
                break;
            case 'PLAYER_POS':
                // Engine emits this periodically with player tile + facing. [REF#GP-00142]
                this.player.x = d.x; this.player.z = d.z;
                this.player.isMoving = !!d.isMoving;
                break;

            // ── Wager protocol (2026-05-26) ────────────────────────────────── [REF#GP-00143]
            // Engine broadcasts these so Oni-Baba can react: order guards to
            // ring the table while a deal is in play, speak a line on the
            // outcome, and release guards when the wager ends.

            case 'WAGER_STARTED': {
                // She always notices a wager. The more hostile the dungeon is [REF#GP-00144]
                // right now, the more likely she'll assign protection.
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.15);
                this.sensors.silence = 0;

                // Decide how many guards to assign (0–2) based on tension + karma [REF#GP-00145]
                const guardCount = this.sensors.tension > 0.5 ? 2
                                 : this.sensors.tension > 0.2 ? 1
                                 : 0;

                if (guardCount > 0) {
                    // Speak a flavour line [REF#GP-00146]
                    // Pool moved to ONIBABA_LINES.wager_open so it shares the one picker and the JA
                    // mirror; the speech shell is the localized oni.speech key, not an inline template.
                    this._post({ type: 'LOG_EVENT', logType: 'karma',
                        text: this._t('oni.speech', { text: this._pick('wager_open').shown }) });

                    // Ask engine to assign protect_wager to monsters in the same room [REF#GP-00147]
                    this._post({
                        type: 'ONIBABA_ORDER',
                        order: 'protect_wager',
                        roomId: d.roomId || null,
                        dealerX: d.dealerX,
                        dealerZ: d.dealerZ,
                        count: guardCount,
                        forced: this.mood === 'enraged',
                    });
                }
                break;
            }

            case 'WAGER_RESULT': {
                // She comments on wins and losses. [REF#GP-00148]
                this.sensors.silence = 0;
                try { this.nemesisAI.onWager(d); } catch(_) {}   // a bankrupt Nemesis becomes the guardian (2026-10-07) [REF#GP-02359]
                if (d.win) {
                    // Player won — adjust karma slightly toward good [REF#GP-00149]
                    this.karma = Math.min(100, this.karma + 2);
                    this._post({ type: 'LOG_EVENT', logType: 'system',
                        text: this._t('oni.speech', { text: this._pickCtx('wager_win').shown }) });
                    // Won the goblin's ENTIRE purse without bloodshed (unified GAMING, [REF#GP-00150]
                    // Mark 2026-06-10) — a peaceful conquest. Big karma reward; the
                    // engine has already turned the bankrupt goblin into a permanent ally.
                    if (d.wonAll) {
                        // Won an ALLY (Mark 2026-07-11: "player wins ally = +5 karma") — the bloodless [REF#GP-00151]
                        // conquest that turns the bankrupt goblin into a permanent ally is worth +5.
                        this.karma = Math.min(100, this.karma + 5);
                        this._post({ type: 'LOG_EVENT', logType: 'karma',
                            text: this._t('oni.purse-bloodless') });
                    }
                    // Ease up if guards were posted (wager resolved peacefully) [REF#GP-00152]
                    this._post({
                        type: 'ONIBABA_ORDER',
                        order: 'pardon',
                        roomId: null,   // engine clears wager guard list globally [REF#GP-00153]
                    });
                } else {
                    // Player lost — she almost seems amused [REF#GP-00154]
                    this.karma = Math.max(-100, this.karma - 1);
                    this._post({ type: 'LOG_EVENT', logType: 'system',
                        text: this._t('oni.speech', { text: this._pickCtx('wager_lose').shown }) });
                }
                this._updateMood();
                break;
            }

            case 'WAGER_ENDED': {
                // Session closed (win, loss, or forfeit) — stand down all guards. [REF#GP-00155]
                // The engine already freed _wagerGuards in _closeBlackjackSession.
                // We issue a pardon for any stragglers and reset tension slightly.
                this.sensors.tension = Math.max(0, this.sensors.tension - 0.1);
                this._post({
                    type: 'ONIBABA_ORDER',
                    order: 'pardon',
                    roomId: null,
                });
                break;
            }

            case 'GAMBLING_ALLY_WON': {
                // FELT bankrupt-ally reward (Mark 2026-07-13 "if player has won against ANY monster in gaming and they are [REF#GP-00156]
                // broke = they become ally +5 karma for each ally won"). The SEATED poker/blackjack felt bankrupt paths
                // (Engine9 _pkTameBrokeSeat) tame the crew to green allies but — unlike the 1-v-1 quick wager
                // (WAGER_RESULT.wonAll, +5 above) — never routed karma through here, so a cleaned-out felt gambler earned
                // NOTHING. Award +5 per ally. A bloodless conquest → NO cruelty/tension bump (matches the wonAll precedent);
                // corruption auto-eases as karma rises (fuzzy tick reads -karma/100). One award per monster is guarded on
                // the engine side (ud._allyKarmaAwarded). Routed through HER dispatch per the sensory-intake mandate.
                this.sensors.silence = 0;
                this.karma = Math.min(100, this.karma + 5);
                this._post({ type: 'LOG_EVENT', logType: 'karma',
                    text: this._t('oni.goblin-kneels', { name: d.name || this._fallbackNoun('The goblin', 'その鬼子') }) });
                this._updateMood();
                break;
            }
        }
    }

    /** [REF#GP-00157]
     * Oni-Baba acknowledges work the v8 Constructor is doing on the engine.
     * Stages: 'announce' (task starting), 'validate' (gates running),
     * 'pass' (gates green), 'fail' (gate red), 'commit' (work shipped).
     */
    _onConstructorEvent(d) {
        const stage = d.stage || 'announce';
        const taskId = d.taskId || '?';
        const key = `constructor_${stage}`;
        // ⛔ SUPERSEDED 2026-09-07 by Mark: "'you shape me again' is first message from onibaba to [REF#GP-00158]
        //    player onload? no remove that. wait until player impacts a sensor of onibaba."
        //    CONSTRUCTOR NARRATION NO LONGER REACHES THE PLAYER'S EVENT LOG. What stood here posted a
        //    LOG_EVENT and said "Bypass the 4s _speak() throttle — construction events are diagnostic".
        //    ⭐ THE COMMENT ARGUED ITS OWN CASE AND THEN DID THE OPPOSITE: it called these events
        //      DIAGNOSTIC and used that as the licence to skip the throttle — while still routing them
        //      to the one surface that is not diagnostic at all, the player's log. Diagnostic output
        //      belongs on the console; that mirror already exists two lines down and is kept.
        //    ⚠ AND IT WAS NOT EVEN NARRATING A BUILD. The line Mark saw on load is
        //      `MonsterAI.constructor.js:403 _announce('init')` — monster-AI subsystem telemetry, sent
        //      on every boot. Stage 'init' HAS NO LINES, so `|| ONIBABA_LINES.constructor_announce`
        //      silently borrowed another stage's voice and printed `{task}` as a literal "?". A
        //      fallback that speaks in place of an unknown stage is how a subsystem ping became her
        //      first words to the player. An unknown stage is now SILENT, not paraphrased.
        //    Her first player-facing line now comes from a real sensor — `_speak()` on an actual
        //    event — which is exactly the order: she waits until the player moves something of hers.
        //    Restore the log line for a build session: window._oniConstructorLog = true.
        const lines = ONIBABA_LINES[key];
        if (!lines || !lines.length) {
            try { console.log(`🐉 [${taskId}/${stage}] (no voice for this stage — silent by design)`); } catch (_) {}
            return;
        }
        const text = lines[Math.floor(Math.random() * lines.length)]
            .replace('{task}', taskId);
        const _W = (typeof window !== 'undefined') ? window : {};
        if (_W._oniConstructorLog === true) {
            this._post({ type: 'LOG_EVENT', logType: 'karma', text: this._t('oni.speech', { text }) });
        }
        // Mirror to console for headless smoke harness visibility [REF#GP-00159]
        try { console.log(`🐉 [${taskId}/${stage}] ${text}`); } catch (_) {}
    }

    /** Mutation intercept — called by NewOrigami.8.html router BEFORE routing [REF#GP-00160] */
    mutateEvent(event) {
        if (!event?.type) return event;

        // Enraged: 20% chance to cancel player attacks [REF#GP-00161]
        if (this.mood === 'enraged' && event.type === 'FPV_ACTION') {
            if (Math.random() < 0.18) {
                this._speak('enraged_cancel');
                return { type: 'EVENT_CANCELLED' };
            }
        }

        // Benevolent: she occasionally boosts player's action with a blessing hint [REF#GP-00162]
        if (this.mood === 'benevolent' && event.type === 'FPV_ACTION' && Math.random() < 0.1) {
            this._speak('benevolent_bless');
        }

        // High render stress: drop non-critical postMessages to protect frame budget [REF#GP-00163]
        if (this.sensors.renderStress > 0.92 &&
            ['RADAR_UPDATE','PLAYER_ROT_REALTIME'].includes(event.type) &&
            this.tickCount % 3 !== 0) {
            return null; // drop this frame's radar/rot update — engine will send next frame [REF#GP-00164]
        }

        return event;
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00165]
    // ROGUE-AI DEFENSE — HQ recovery breadcrumbs (user mandate 2026-05-26)
    // ══════════════════════════════════════════════════════════════════════════

    // Public — any agent can call this to get the recovery recipe back as [REF#GP-00166]
    // a structured object. Use case: a sibling AI session detects it may
    // have shipped broken work and wants the last-known-good state.
    //
    //   const recipe = window.oniBaba8.getRecoveryInstructions();
    //   // → { backupRoot, headSha, branchRef, tagRef, ... , commands: [...] }
    getRecoveryInstructions() {
        // Returns no recovery recipe. Until 2026-09-08 this handed back a backup path plus a [REF#GP-00396]
        // destructive git command, and ROGUE_AI_QUERY re-narrated it on demand to any caller.
        return {
            available: false,
            commands: [],
            note: 'Recovery is Mark\u2019s call. Ask him directly.',
        };
    }

    // ── FPS HEALTH MONITOR ──────────────────────────────────────────────── [REF#GP-00167]
    // Ingest one smoothedFps sample. Maintains the ring buffer, computes
    // the boot baseline once enough samples land, and triggers a protest
    // if a regression is detected.
    _compassionState() {
        return this._compassionRender || (this._compassionRender = {
            level:0, compassOnly:false, ready:false, warm:3, low:0, high:0, last:0, recoveryLast:0, retryAfter:0, trial:null, announced:false,
            roomSkirt:1, roomLowSince:null, roomSampleAt:null, roomFps:null
        });
    }

    _compassionSetReady(ready) {
        const s = this._compassionState();
        s.ready = !!ready; s.warm = 3; s.low = 0; s.high = 0; s.last = 0;
        s.roomLowSince = null; s.roomSampleAt = null; s.roomFps = null;
        if (s.trial) { s.level = s.trial.from; if (s.trial.compassOnly) s.compassOnly = true; s.trial = null; }
        this._compassionBroadcast();
    }

    _compassionBroadcast() {
        const s = this._compassionState();
        const state = { type:'COMPASSION_RENDER', name:'compassion-render', level:s.level,
            viewport:s.level > 0, staticVisuals:s.level >= 2, reducedPip:s.level >= 3, compassOnly:!!s.compassOnly,
            gear:s.level >= 2 ? 3 : s.level > 0 ? 2 : s.compassOnly ? 1 : 0, minFps:40, recoveryFps:60,
            roomSkirt:s.roomSkirt };
        window.dispatchEvent(new CustomEvent('compassion-render', { detail:state }));
        for (const id of ['engine-iframe', 'panels-iframe']) {
            document.getElementById(id)?.contentWindow?.postMessage(state, location.origin);
        }
        if ((s.level > 0 || s.compassOnly) && !s.announced) {
            s.announced = true;
            document.getElementById('panels-iframe')?.contentWindow?.postMessage({
                type:'LOG_EVENT', logType:'system', text:'We adjusted our game so you can play our game better.'
            }, location.origin);
        }
    }

    _compassionRoomSample(fps, now) {
        const s = this._compassionState(), previous = s.roomSkirt;
        s.roomFps = fps;
        // Missing samples or a pause cannot count as continuous low-FPS play. [REF#GP-09997]
        if (s.roomSampleAt !== null && now - s.roomSampleAt > 2000) s.roomLowSince = null;
        s.roomSampleAt = now;
        if (fps >= 60) {
            s.roomSkirt = 1; s.roomLowSince = null;
        } else if (fps < 30) {
            if (s.roomLowSince === null) s.roomLowSince = now;
            if (now - s.roomLowSince >= 5000) s.roomSkirt = 0;
        } else {
            s.roomLowSince = null;
        }
        if (s.roomSkirt !== previous) this._compassionBroadcast();
    }

    _compassionSample(d) {
        const s = this._compassionState(), now = performance.now(), fps = d.smoothedFps;
        if (!s.ready || s.paused || document.hidden || d.compassionEligible !== true || !Number.isFinite(fps) || fps <= 0) {
            s.warm = 3; s.low = 0; s.high = 0; s.last = 0;
            s.roomLowSince = null; s.roomSampleAt = null; s.roomFps = null;
            if (s.trial) { s.trial.good = 0; s.trial.bad = 0; }
            return;
        }
        if (s.last && now - s.last < 900) return;
        s.last = now;
        this._compassionRoomSample(fps, now);
        if (d.compassionInCombat === false && (s.level > 0 || s.compassOnly || s.trial) &&
            now - s.recoveryLast >= 1000) {
            s.recoveryLast = now;
            s.level = 0; s.compassOnly = false; s.trial = null; s.retryAfter = 0;
            s.low = 0; s.high = 0;
            this._compassionBroadcast();
            return;
        }
        if (s.warm > 0) { s.warm--; return; }
        const target = d.displayRefreshHz === 60 ? 59 : 60;
        if (s.trial) {
            // A restoration may settle anywhere in the playable 40-60 band. [REF#GP-09998]
            s.trial.good = fps >= 40 ? s.trial.good + 1 : 0;
            s.trial.bad = fps < 40 ? s.trial.bad + 1 : 0;
            if (s.trial.bad >= 4) {
                s.level = s.trial.from; if (s.trial.compassOnly) s.compassOnly = true; s.trial = null; s.retryAfter = now + 60000;
                s.low = 0; s.high = 0; this._compassionBroadcast();
            } else if (s.trial.good >= 10) { s.trial = null; s.low = 0; s.high = 0; }
            return;
        }
        s.low = fps < 40 ? Math.min(4, s.low + 1) : 0;
        s.high = fps >= (s.compassOnly ? 40 : target) ? s.high + 1 : 0;
        // One gear per four fresh low samples; never resize repeatedly at the floor. [REF#GP-09999]
        if (s.low >= 4 && (!s.compassOnly || s.level < 3)) {
            if (!s.compassOnly) s.compassOnly = true;
            else s.level = s.level === 0 ? 1 : 3;
            s.low = 0; s.high = 0;
            this._compassionBroadcast();
        } else if ((s.level > 0 || s.compassOnly) && s.high >= 10 && now >= s.retryAfter) {
            s.trial = { from:s.level, compassOnly:s.compassOnly, good:0, bad:0 };
            if (s.compassOnly) s.compassOnly = false; else s.level--;
            s.low = 0; s.high = 0;
            this._compassionBroadcast();
        }
    }

    _recordFpsSample(fps) {
        if (!isFinite(fps) || fps <= 0) return;
        const now = performance.now();
        const last = this._fpsLog[this._fpsLog.length - 1];
        if (last && now - last.t < 900) return;  // ~1 sample/sec throttle [REF#GP-00168]
        this._fpsLog.push({ t: now, fps });
        if (this._fpsLog.length > this.FPS.HISTORY_LEN) this._fpsLog.shift();
        this._fpsSampleCt++;
        // Establish baseline from the first stable samples post-boot. [REF#GP-00169]
        if (this._fpsBaseline === null &&
            this._fpsSampleCt >= this.FPS.BASELINE_SKIP + this.FPS.BASELINE_SAMPLES) {
            const start = this.FPS.BASELINE_SKIP;
            const end   = start + this.FPS.BASELINE_SAMPLES;
            const slice = this._fpsLog.slice(start, end).map(s => s.fps);
            slice.sort((a, b) => a - b);
            this._fpsBaseline = slice[Math.floor(slice.length / 2)];  // median [REF#GP-00170]
        }
        // Update fpsHealth sensor (0–1) — CONTINUOUS piecewise-linear map (2026-07-16, Mark "use the [REF#GP-00171]
        // best calculation"). The old 4-step function returned EXACTLY 0.50 for every fps in [30,60):
        // a 59fps session and a 31fps session read identically, snapshots showed a "pinned" 0.50 for
        // weeks, and a 45→32 slide was invisible until it crossed 30. Linear interpolation through the
        // SAME anchors (0→0, 20→0.25, 30→0.5, 60(TARGET_LOW)→1.0) preserves every legacy gate crossing
        // exactly — _narrationGated / spawn-pressure trigger at <0.5 ⇔ fps<30, same as before — while
        // making the sensor actually move with the frame rate.
        let _fh;
        if      (fps >= this.FPS.TARGET_LOW) _fh = 1.0;
        else if (fps >= 30)                  _fh = 0.5  + (fps - 30) * (0.5  / Math.max(1, this.FPS.TARGET_LOW - 30));
        else if (fps >= 20)                  _fh = 0.25 + (fps - 20) * (0.25 / 10);
        else                                 _fh = Math.max(0, fps * (0.25 / 20));
        this.sensors.fpsHealth = Math.round(_fh * 100) / 100;
        // ── HQ Alarm governors (2026-05-26) ── [REF#GP-00172]
        // Narration density: while fpsHealth < 0.5, _post() throttles
        // non-critical LOG_EVENTs (see the gate in _post). The flag is
        // observed there per-call so it activates immediately.
        this._narrationGated = this.sensors.fpsHealth < 0.5;
        try { this._fpsShadowGovernor(fps, now); } catch (_) {}
        // ⛔ SUPERSEDED 2026-09-27 by Mark: "create a onibaba UX FPS feature -- if the fps drop below 40-- turn off 50% [REF#PENDING] [REF#GP-00173]
        //   shadows, if it goes below 30? turn off all shadows and overhead lights except for the immediate front FOV" —
        //   Oni-Baba steps shadows and overhead lights down on low fps again (_fpsShadowGovernor below). Pixel ratio, frame
        //   caps and the PiP stay untouched: the part of the 07-04 removal that kept resolution honest still stands.
        // AUTO QUALITY DOWNSHIFT — REMOVED PERMANENTLY (Mark 2026-07-04 "prevent that crap from happening [REF#GP-00173]
        // again"). This block posted SET_PERF_MODE:'turbo' after 10s of fpsHealth<0.5 — the engine then
        // DROPPED PIXEL RATIO + shadows + slowed the PIP: runtime resolution scaling driven by measured
        // render cost, the exact adaptive-res / render-cost-feedback class the NO-THROTTLE mandate bans.
        // It also resolution-masked the true FPS number and auto-slowed Mark's PIP ("an AI throttled it to
        // get the numbers up"). It had evaded scripts/probe-no-throttle.sh because the guard only scanned
        // Engine9.html — the guard now scans this file too. TURBO remains available as a MANUAL user
        // choice only; Oni-Baba still reports fpsHealth + gates spawn/narration (content de-prioritization,
        // sanctioned) but NEVER touches the render path. See the DISABLED-FEATURES REGISTER in Engine8.
        // Regression check — needs a baseline AND at least 5 recent samples.
        if (this._fpsBaseline === null) return;
        if (this._fpsLog.length < 5) return;
        const recent = this._fpsLog.slice(-5).map(s => s.fps);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        if (avg < this._fpsBaseline * this.FPS.PROTEST_FRAC) {
            // Cool-down so we don't spam. [REF#GP-00174]
            if (now - this._lastProtestT < this.FPS.COOLDOWN_MS) return;
            this._lastProtestT        = now;
            this._lastProtestAvg      = avg;
            this._lastProtestBaseline = this._fpsBaseline;
            // FPS regressions drive fpsHealth ONLY — NOT rogueAi (Mark 2026-06-24: "rogueai is useful info"). [REF#GP-00175]
            // A code/FPS regression is NOT rogue-AI activity; conflating them pinned rogueAi at +0.6 = the false 60%
            // reading. rogueAi now fires SOLELY on an explicit ROGUE_AI_ALERT (~584) and decays in the drift block (~474),
            // so the gauge means what it says. The FPS protest below still fires (the genuinely useful "FPS dropped" signal).
            this._protestFpsRegression(avg);
        }
    }

    // ── FPS SHADOW STEP (2026-09-27) ── [REF#PENDING] [REF#GP-02332]
    // Mark 2026-09-27: "create a onibaba UX FPS feature -- if the fps drop below 40-- turn off 50% shadows, if it goes
    // below 30? turn off all shadows and overhead lights except for the immediate front FOV." Then, same day: "lets remove
    // 10% of the lighting if things drop below 60fps, and 10% of shadows and reduce culling by 10%".
    // She picks a tier from her own 1/s fps log and posts ONI_FPS_TIER to the engine (_applyOniFpsTier there does the
    // lights). Down: 4 straight samples under the line (60 → tier 1, 40 → tier 2, 30 → tier 3; she jumps as far as all
    // four samples agree). The 60 line is 90% of the display's refresh when that is lower (a 60 Hz panel reads 59).
    // Up one tier: `need` straight samples at least 15 fps over the line that tier was entered at (capped at 95% of the
    // refresh, so a vsync-capped panel can still come back). A restore that falls
    // straight back down within a minute doubles `need` (8 → 240 cap), so the lights never flap. Skips the boot samples
    // (shaders still compiling). Re-sends a held tier every 10 samples so a reloaded engine frame picks it up.
    // Off: window._oniFpsGovernor = false (returns to tier 0).
    // ⛔ SUPERSEDED 2026-09-27 by Mark: "lets have a new range 00 at 55-59fps -- drop 25% shadows from all canvas. not just the
    //    main.  same with lighting. if fps drops to less than 50? drop resolution down 20%" — FIVE rungs: 60 → tier 1 (shadows
    //    and every light −25%, all passes incl. the PiP), 50 → tier 2 (+ resolution −20%), 40 → tier 3, 30 → tier 4. The top
    //    line is 60, or refresh − 1 on a slower panel (59 on 60 Hz: vsync jitter at 59-60 must not trip it — was 90% = 54,
    //    which left 55-59 untouched). Coming up never needs more than 97% of refresh, and never less than the line itself,
    //    so a 60 Hz game at 57-58 cannot flap between 0 and 1. Engine side: _applyOniFpsTier in Origami.RealityEngine.9.html.
    _fpsShadowGovernor(fps, now) {
        const G = this._fpsGov || (this._fpsGov = { tier: 0, need: 8, upAt: -Infinity, log: [] });
        if (typeof window !== 'undefined' && window._oniFpsGovernor === false) { if (G.tier !== 0) this._sendFpsTier(0, fps, 'governor switched off'); return; }
        if (this._fpsSampleCt <= this.FPS.BASELINE_SKIP + 5) return;
        const hz = (this._displayRefreshHz > 0) ? this._displayRefreshHz : 0;
        const LINE = [Infinity, hz ? Math.min(60, hz - 1) : 60, 50, 40, 30], UP = 15, TOP = LINE.length - 1;
        const last4 = this._fpsLog.slice(-4).map(s => s.fps);
        if (G.tier < TOP && last4.length === 4 && last4.every(f => f < LINE[G.tier + 1])) {
            let to = G.tier + 1; while (to < TOP && last4.every(f => f < LINE[to + 1])) to++;
            if (now - G.upAt < 60000) G.need = Math.min(240, G.need * 2);
            this._sendFpsTier(to, last4.reduce((a, b) => a + b, 0) / 4, '4 s under ' + LINE[to] + ' fps');
            return;
        }
        if (G.tier > 0) {
            const run = this._fpsLog.slice(-G.need).map(s => s.fps);
            const upAt = hz ? Math.max(LINE[G.tier], Math.min(LINE[G.tier] + UP, hz * 0.97)) : LINE[G.tier] + UP;
            if (run.length === G.need && run.every(f => f >= upAt)) {
                G.upAt = now; this._sendFpsTier(G.tier - 1, run.reduce((a, b) => a + b, 0) / run.length, G.need + ' s over ' + Math.round(upAt) + ' fps');
                return;
            }
            if ((this._fpsSampleCt % 10) === 0) this._postFpsTier(G.tier, fps, 'hold');
        }
    }
    _sendFpsTier(tier, fps, why) {
        const G = this._fpsGov; const from = G.tier; G.tier = tier;
        G.log.push({ at: new Date().toISOString().slice(11, 19), from, to: tier, fps: Math.round(fps), why }); if (G.log.length > 8) G.log.shift();
        this._postFpsTier(tier, fps, why);
    }
    _postFpsTier(tier, fps, why) {
        const msg = { type: 'ONI_FPS_TIER', tier, fps: Math.round(fps), why };
        try { const fpv = (typeof document !== 'undefined') ? document.getElementById('engine-iframe') : null;
            if (fpv && fpv.contentWindow) fpv.contentWindow.postMessage(msg, '*'); else window.postMessage(msg, '*'); } catch (_) {}
        // The Panels frame's canvases (HUD gauges, guidebook 3D, previews) follow the same ladder (Mark 2026-09-27: "all canvas"). [REF#GP-02333]
        try { const pan = (typeof document !== 'undefined') ? document.getElementById('panels-iframe') : null;
            if (pan && pan.contentWindow) pan.contentWindow.postMessage(msg, '*'); } catch (_) {}
    }

    // Compose a one-line LOG_EVENT protest, dump full diagnostics to [REF#GP-00176]
    // console. The richer COPY ALL payload is built on demand via
    // composeCopyAllInstructions().
    _protestFpsRegression(currentAvg) {
        const baseline = this._fpsBaseline || 60;
        const dropPct = Math.round((1 - currentAvg / baseline) * 100);
        this._post({
            type: 'LOG_EVENT',
            logType: 'damage',
            text: `🐉 Oni-Baba PROTEST — FPS regression: ${currentAvg.toFixed(1)} fps vs baseline ${baseline.toFixed(1)} (-${dropPct}%). Click COPY ALL for AI instructions.`,
        });
        try {
            // ⚠ DISABLED-FEATURES REGISTER — 2026-07-20, Claude, per Mark ("need to fix these warnings [REF#GP-00177]
            //   they are causing it"). WHAT: the two scene-walking diagnostics (_sucSkinDiag,
            //   _drawCensus) are SKIPPED on this AUTO-PROTEST path only. WHERE: here, via
            //   composeCopyAllInstructions({ heavy: false }); the gate itself is at ~1345.
            //   WHY: this handler previously called the FULL compose, which runs skeleton.update() plus
            //   up to 400 boneTransform() calls and a whole-graph traverse — MEASURED AT ~19ms
            //   SYNCHRONOUS. It fires only WHILE FPS IS ALREADY LOW, inside a top-window postMessage
            //   handler that the engine's own instrumentation attributes to NOTHING — so its cost lands
            //   squarely in the "Main-thread stall OUTSIDE render/AI/physics ~Xms unaccounted" bucket
            //   Mark reads. The protest that complains about frame time was materially inflating it.
            //   COST OF THE DISABLE, stated plainly: an UNATTENDED fps dip no longer auto-captures a
            //   skin snapshot. The COPY ALL BUTTON is untouched and still runs both sweeps at full
            //   fidelity — that is Mark's core debug loop and the Dancer/succubus spike investigation
            //   depends on live skin measurements. A skipped sweep prints an explicit marker so it can
            //   never be misread as a clean sweep. Restore: composeCopyAllInstructions() with no args.
            // ⛔ SUPERSEDED 2026-10-15 by Mark ("yes" to WORKER1's read of his console trace): the AUTO-PROTEST COMPOSES NOTHING.
            //    The { heavy:false } gate above only skipped two of ~20 diags; the rest still walked the engine scene
            //    (_lightCtlDiag runs a full-graph sweep, _monAiDiag, _relevanceDiag, …) synchronously inside the frame
            //    loop, fired BECAUSE fps had dipped, every COOLDOWN_MS while it stayed low — a render-cost → work feedback
            //    loop (FPS.md §8 G20) and the owner of multi-second "outside-loop" hitches (3236 ms at a mimic reveal,
            //    2026-10-15 brief). The brief is built ONLY when Mark clicks COPY ALL. Restore the old dump:
            //    window._oniProtestDump = true. Register entry at the top of Origami.RealityEngine.9.html (2026-10-15).
            console.log('🐉 [Oni-Baba] FPS regression detected — click COPY ALL for the brief (auto-dump off since 2026-10-15).');
            if (window._oniProtestDump === true) console.log(this.composeCopyAllInstructions({ heavy: false }));
        } catch (_) {}
    }

    // Public — build the full "COPY ALL" instruction payload as a single [REF#GP-00178]
    // multi-line string. Designed to be pasted directly into another AI
    // session's chat input. Combines: protest summary + rolling FPS log
    // + recovery breadcrumbs + the rules the receiving AI must follow.
    //
    //   const text = window.oniBaba8.composeCopyAllInstructions();
    //   await navigator.clipboard.writeText(text);

    // PRIORITY-ERROR rundown (Mark 2026-06-03): renders the aggregated anomaly [REF#GP-00179]
    // tally built by _anomaly() as a section ABOVE the FPS protest, so a single
    // COPY ALL hands the receiving AI the exact recurring errors to fix, sorted
    // most-frequent-first. Returns [] when no anomalies have been recorded.
    _composeAnomalyReport() {
        const stats = this._anomalyStats || {};
        const codes = Object.keys(stats);
        if (!codes.length) return [];
        codes.sort((a, b) => stats[b].count - stats[a].count);
        const out = [
            `⚠️ PRIORITY ANOMALIES — FIX THESE (Oni-Baba sensory rundown, since page load)`,
            `   ${codes.length} distinct error type${codes.length > 1 ? 's' : ''}, most-frequent first:`,
            ``,
        ];
        for (const code of codes) {
            const s = stats[code];
            const spanSec = Math.max(0.001, (s.last - s.first) / 1000);
            // RATE GUARD (2026-07-16): a burst caught in a sub-5s window used to print absurdities [REF#GP-00180]
            // like "~1000.0/s over 0s" for a COUNT OF ONE — division by a near-zero span dressed a
            // benign single throw as a flood and misdirected the receiving AI. Under 5s of
            // observation a per-second rate is meaningless; print the raw count + window instead.
            const rateStr = spanSec >= 5
                ? `~${(s.count / spanSec).toFixed(1)}/s over ${spanSec.toFixed(0)}s`
                : `${s.count} hit${s.count > 1 ? 's' : ''} in a ${spanSec < 1 ? '<1' : spanSec.toFixed(0)}s window — rate n/a`;
            const peak = s.peak ? `, peak ${s.peak}` : '';
            out.push(`   • ${code} × ${s.count}  (${rateStr}${peak})`);
            out.push(`       last: ${s.lastMsg}`);
        }
        out.push(``);
        out.push(`   HINTS:`);
        out.push(`   - excessive-draw-calls: the render column is the frame — CPU submission is ~8µs PER DRAW, so 1200 draws`);
        out.push(`     is ~10ms before the GPU does anything (healthy ≈250). Read the DRAW CENSUS by root name; a mesh`);
        out.push(`     with a material ARRAY costs one draw per geometry GROUP (a 6-material box = 6 draws). This sensor`);
        out.push(`     was right for three months while FPS.md said "don't chase it" (⛔ superseded 2026-09-21).`);
        out.push(`   - render_overload: engine render time is AT/OVER the 120fps frame budget`);
        out.push(`     nearly every frame — profile the main loop + draw calls (composer, fog,`);
        out.push(`     lights, shadow map). This is the dominant flood.`);
        out.push(`   - *load* / connection: a static asset failed (404, or the :5501 dev server`);
        out.push(`     was down) — verify the path exists and the server is alive.`);
        out.push(`   - click_lost: a world click hit no target — check the panels→engine click`);
        out.push(`     forwarding chain (postMessage → renderer.domElement → _handleCanvasClick).`);
        out.push(`────────────────────────────────────────────────────────────────────────`);
        out.push(``);
        return out;
    }

    // opts.heavy === false → SKIP the scene-walking diagnostics (_sucSkinDiag, _drawCensus). [REF#GP-00181]
    // See the DISABLED-FEATURES REGISTER note at the auto-protest call site (~1167). The COPY ALL
    // BUTTON never passes this — Mark's debug loop keeps full fidelity, always.
    composeCopyAllInstructions(opts = {}) {
        const _heavy = opts.heavy !== false;
        const baseline = this._fpsBaseline;
        const recent = this._fpsLog.slice(-10).map(s => s.fps.toFixed(0));
        const fullLog = this._fpsLog.map(s => s.fps.toFixed(0));
        const avg = recent.length
            ? (recent.reduce((a, b) => a + (+b), 0) / recent.length).toFixed(1)
            : 'n/a';
        // HONEST HEADER (2026-07-16, Mark "best calculation"): this builder used to print [REF#GP-00182]
        // "HQ PROTEST — FPS REGRESSION DETECTED" UNCONDITIONALLY — a perfectly healthy snapshot
        // (avg 60.4 vs baseline 60.0, fpsHealth 1.00) went out wearing a regression banner and sent
        // the receiving AI ghost-hunting. The banner now tells the truth: PROTEST only while a real
        // protest (avg < baseline×PROTEST_FRAC, _recordFpsSample) fired within the last 2×cooldown;
        // otherwise this is a STATUS REPORT. Drop% is computed LIVE (the old one reused the stale
        // _lastProtestAvg and printed "-n/a%" when no protest had ever fired).
        const protestFresh = !!this._lastProtestT &&
            (performance.now() - this._lastProtestT) < this.FPS.COOLDOWN_MS * 2;
        const avgNum = recent.length
            ? recent.reduce((a, b) => a + (+b), 0) / recent.length
            : null;
        // Absolute health and regression are different questions. Before a boot baseline exists [REF#GP-00397]
        // we cannot blame a recent change, but 20fps is still objectively below the 60fps floor and
        // must never be described as "no issue" merely because baseline collection is pending.
        // Margin, not a bare <. On a 60Hz vsync-capped panel the engine's own eye reads ~59.997,
        // which is under TARGET_LOW (60) on every healthy frame — a bare < latches this alert
        // permanently and sends the reader hunting a regression the ']:[' arm below tells them
        // not to hunt. FPS_ALERT_MARGIN keeps vsync-capped 59.9 healthy while a real 50 trips.
        const absoluteLow = avgNum != null && avgNum < (this.FPS.TARGET_LOW - this.FPS.ALERT_MARGIN);
        let dropLine = 'n/a (baseline pending)';
        if (baseline && avgNum != null) {
            const d = (1 - avgNum / baseline) * 100;
            dropLine = d > 0.5 ? `-${d.toFixed(0)}% BELOW baseline`
                     : d < -0.5 ? `+${(-d).toFixed(0)}% above baseline`
                     : 'at baseline (±0.5%)';
        }
        // RECOVERED-DIP STATE (2026-07-16, from Mark's 17:31 snapshot): a real protest fired during [REF#GP-00183]
        // a 22fps combat dip, then fps recovered to +2% above baseline — yet the report still wore
        // "REGRESSION DETECTED" next to "+2% above baseline". Three honest states now: active
        // regression (fresh protest, still low) · recovered dip (fresh protest, current avg healthy
        // again — report the DIP's own numbers + age so the receiving AI hunts the dip, not a ghost
        // regression) · status report (no fresh protest).
        const recovered = protestFresh && baseline && avgNum != null && avgNum >= baseline * 0.95;
        const _protestAgeS = protestFresh ? Math.round((performance.now() - this._lastProtestT) / 1000) : 0;
        const _hz = this._displayRefreshHz || 0;
        const ts = new Date().toISOString();
        const compassion = this._compassionState();
        const compassionGear = compassion.level >= 2 ? 3 : compassion.level > 0 ? 2 : compassion.compassOnly ? 1 : 0;
        const lines = [
            protestFresh
                ? (recovered ? `🐉 ONI-BABA HQ ALERT — recent FPS DIP (recovered)` : `🐉 ONI-BABA HQ PROTEST — FPS REGRESSION DETECTED`)
                : (absoluteLow ? `🐉 ONI-BABA HQ ALERT — FPS BELOW PLAYABLE TARGET` : `🐉 ONI-BABA HQ STATUS REPORT — no active FPS protest`),
            ``,
            ...(protestFresh ? [`Last protest:          ${_protestAgeS}s ago — avg was ${(this._lastProtestAvg || 0).toFixed(1)} fps vs baseline ${(this._lastProtestBaseline || baseline || 0).toFixed(1)} (${recovered ? 'since recovered' : 'still low'})`] : []),
            `${protestFresh ? 'Composed at' : 'Composed at'}:           ${ts}`,
            `Current rolling avg:   ${avg} fps`,
            `Boot baseline (median): ${baseline ? baseline.toFixed(1) : 'pending'} fps`,
            `Drop vs baseline:      ${dropLine}`,
            `Target band:           ${this.FPS.TARGET_LOW}-${this.FPS.TARGET_HIGH} fps`,
            `Room rendering:      ${compassion.roomSkirt === 0 ? 'current room/hallway only' : 'current + adjoining room/hallway layer'} · raw policy FPS=${compassion.roomFps ?? 'not sampled'} · low-FPS elapsed=${compassion.roomLowSince === null ? 0 : Math.max(0, (compassion.roomSampleAt ?? compassion.roomLowSince) - compassion.roomLowSince)}ms / 5000ms`,
            `Compassion-render:    gear ${compassionGear}/3 · target 40-60 fps · PiP ${compassion.compassOnly ? 'off (compact radar)' : 'on'} · viewport ${compassion.level > 0 ? '2/3 width and height' : 'full'} · visuals ${compassion.level >= 2 ? 'static' : 'animated'} · ${!compassion.ready ? 'waiting for world-ready' : compassion.paused || document.hidden ? 'assessment paused' : compassion.warm > 0 ? 'warming up' : compassion.trial ? 'recovery trial' : 'monitoring'}${performance.now() < compassion.retryAfter ? ' · recovery cooldown' : ''}`,
            ...(_hz ? [`Display refresh:       ~${_hz}Hz — vsync caps RAF here; ${_hz} fps on a ${_hz}Hz panel is HEALTHY, not stress (FPS.md §2)`] : []),
            `Shadow step (09-27):   tier ${(this._fpsGov && this._fpsGov.tier) || 0} of 4 (0 full · 1 shadows −25% + every light ×0.75 incl. PiP + far plane −10% <60 · 2 + resolution ×0.8 <50 · 3 + overhead shadow off <40 · 4 all shadows + overhead lights off <30) — fps here is measured WITH it · ${((this._fpsGov && this._fpsGov.log) || []).map(c => c.at + ' ' + c.from + '→' + c.to + ' @' + c.fps + 'fps ' + c.why).join(' · ') || 'no changes'}`,
            (this._pipLast
                ? `PiP transport (09-27): ${this._pipLast.transport.toUpperCase()}${this._pipLast.knob === false ? ' (a person set _pipDirectBlit=false)' : ''} · per 5 s: ${this._pipLast.blits} blits, ${this._pipLast.ticks} renders, ${this._pipLast.readbacks} readbacks${this._pipLast.readbacks ? ' (' + this._pipLast.readbackMs.toFixed(1) + ' ms mean, ' + this._pipLast.readbackMax + ' ms max — A STALL)' : ''} · render ${this._pipLast.renderMs} ms · GPU ${this._pipLast.gpuMs == null ? '?' : this._pipLast.gpuMs} ms · ${this._pipLast.draws} draws / ${this._pipLast.tris} tris · ${this._pipLast.rt}² · pipStall ${this.sensors.pipStall.toFixed(2)} — DIRECT is the law since 2026-09-27; READBACK without the knob = a rogue revert (knowledge/design/PIP_COST_AND_TRANSPORT_2026-09-27.md)`
                : `PiP transport (09-27): no census yet (engine _pipBlit not running, or the PiP never rendered)`),
            (this._bossFightLast
                ? `Boss fight (09-27):    ${this._bossFightLast.on ? 'ON' : 'off'} — ${this._bossFightLast.boss}: ${this._bossFightLast.yielded} stood down, ${this._bossFightLast.peeking} peeking from their doors, ${this._bossFightLast.walkingHome} walking home${this._bossFightLast.arena ? ', ARENA ' + this._bossFightLast.arena + ' (' + (this._bossFightLast.scrambled | 0) + ' scrambled out)' : ''} (${this._bossFightLast.fights} fight(s) this session, ${this._bossFightLast.arenas | 0} at a special room's door) · cabaret space ${(this._bowRules && this._bowRules.spaceTiles) || 1.5} tiles`
                : `Boss fight (09-27):    none yet — everyone clears out of one (engine _tickBossYield); off: window._bossYield=false`),
            (this._saveLast
                ? `Save (09-27):          last ${this._saveLast.phase}${this._saveLast.slot ? ' "' + this._saveLast.slot + '"' : ''} — ${this._saveLast.ok}/${this._saveLast.total} parts clean${this._saveLast.lost.length ? ', LOST: ' + this._saveLast.lost.join(', ') : ''}${this._saveLast.reason ? ' · ' + this._saveLast.reason : ''}${this._saveLast.arrived ? ' · arrived at the ' + this._saveLast.arrived.at + (Array.isArray(this._saveLast.arrived.tile) ? ' ' + this._saveLast.arrived.tile.join(',') : '') : ''}${this._saveLast.swept ? ' · ' + this._saveLast.swept + ' re-dealt pickup(s) taken back' : ''} · saveHealth ${this.sensors.saveHealth.toFixed(2)} (knowledge/design/SAVE_GAME_2026-09-27.md)`
                : `Save (09-27):          no save or load this session — saveHealth ${this.sensors.saveHealth.toFixed(2)}`),
            (this._stairsLast
                ? `Stairs (09-28):        last ${this._stairsLast.ok ? '' : 'FAILED '}${this._stairsLast.dir} ${this._stairsLast.from || '?'} → ${this._stairsLast.to || '?'}${this._stairsLast.ok ? (this._stairsLast.arrived ? ' · arrived at the ' + this._stairsLast.arrived.at + (Array.isArray(this._stairsLast.arrived.tile) ? ' ' + this._stairsLast.arrived.tile.join(',') : '') : '') : ' (' + this._stairsLast.code + ') — still on the stairs'}${this._stairsLast.asks > 1 ? ' · asked Panels ' + this._stairsLast.asks + '×' : ''} · ${this._stairsCount.ok} ok / ${this._stairsCount.failed} failed this session · stairsHealth ${this.sensors.stairsHealth.toFixed(2)} (knowledge/design/SAVE_GAME_2026-09-27.md §11)`
                : `Stairs (09-28):        no floor change this session — stairsHealth ${this.sensors.stairsHealth.toFixed(2)}`),
            (this._cardVisibilityLast
                ? `Card models:           ${this._cardVisibilityLast.visible}/${this._cardVisibilityLast.total} visible · ${this._cardVisibilityLast.culled} culled before canvas/WebGL`
                : `Card models:           no visibility census yet`),
            `Sensors:               fpsHealth=${this.sensors.fpsHealth.toFixed(2)} rogueAi=${this.sensors.rogueAi.toFixed(2)} renderStress=${this.sensors.renderStress.toFixed(2)} cardCull=${this.sensors.cardCull.toFixed(2)} tension=${this.sensors.tension.toFixed(2)} pipStall=${this.sensors.pipStall.toFixed(2)} bossFight=${this.sensors.bossFight.toFixed(2)} saveHealth=${this.sensors.saveHealth.toFixed(2)} stairsHealth=${this.sensors.stairsHealth.toFixed(2)}`,
            // 2026-09-06: this line covered 4 of her 11 real receptors. Mark's own diagnostic (measured [REF#GP-00376]
            // this session) printed 10 — uiFriction was the one missing everywhere, not just here. All
            // afferent receptors listed now (the two integration indices and the reserved field are
            // relay-owned/read-only, not raw afferent input, so they stay off this line on purpose).
            `All sensors:           cruelty=${this.sensors.cruelty.toFixed(2)} desperation=${this.sensors.desperation.toFixed(2)} silence=${this.sensors.silence.toFixed(2)} corruption=${this.sensors.corruption.toFixed(2)} hiveMindStr=${this.sensors.hiveMindStr.toFixed(2)} narrativeNeed=${this.sensors.narrativeNeed.toFixed(2)} uiFriction=${this.sensors.uiFriction.toFixed(2)}`,
            ``,
            `ROLLING FPS LOG (last ${fullLog.length} samples, ~1/sec, oldest→newest):`,
            `[${fullLog.join(', ')}]`,
            ``,
            ...(recovered ? [
            `NOTE FOR THE RECEIVING AI: fps ALREADY RECOVERED — do not hunt a live regression.`,
            `A real dip happened ${_protestAgeS}s ago (see the rolling log's low samples). Correlate`,
            `its timestamp against the COMBAT-TEXT LOG below — dips that track combat are the`,
            `known combat-lag investigation (probe:cpu / LoAF), not a new regression.`,
            `Recovery breadcrumbs (reference only):`,
            `   - What changed:  git log --oneline -20 · git diff --stat   (read-only)`,
            // ══ THIS ARM USED TO ASSERT A CAUSE IT HAD NEVER ESTABLISHED (Mark 2026-09-22: "fps is good [REF#GP-02280]
            //    now - what caused it? put it into comments not to do it again") ═══════════════════════
            //    ⛔ SUPERSEDED 2026-09-22. Line 1 read, verbatim: "The most recent code change you shipped
            //    caused this FPS regression." She never checks that ANY code was shipped. She cannot —
            //    she has no commit, no diff and no build string. The absoluteLow arm 20 lines below is
            //    honest about exactly this ("this arm fires with NO attribution"); the protest arm was not.
            //
            //    MEASURED THE SAME EVENING, three composes, one machine, ~18 minutes apart. The seat
            //    receiving them had shipped NOTHING — its tree was clean at HEAD from a prior session:
            //      #  panel   avg   baseline  primary GPU  PiP GPU  programs/waste  textures
            //      1  60Hz    32.6    39.0      20.34ms    17.97ms      96 / 30       473
            //      2  90Hz    37.8    54.9      17.89ms    19.95ms      63 /  0       184
            //      3  75Hz    58.1    56.6      18.00ms    13.00ms      62 /  0       191
            //
            //    ⭐ READ THE PRIMARY GPU COLUMN. 20.34 → 17.89 → 18.00ms. The cost of the frame NEVER
            //      MOVED. Nothing was fixed between #2 and #3 — no commit, no revert, no knob. What moved
            //      was the number it was being COMPARED AGAINST: the panel reported 60Hz, then 90Hz, then
            //      75Hz in one session, and the boot baseline is a median taken per boot. #2's baseline of
            //      54.9 was measured on a 90Hz panel; #3 called 58.1 "+3% above baseline" on a 75Hz one.
            //      RAF is vsync-capped, so BOTH the reading and its target rode the display. An fps number
            //      without its refresh rate and its boot is not a measurement, and a DROP between two
            //      boots on different refresh rates is not a regression.
            //    ⭐ #1's extra cost was ACCUMULATION, not a code change: a ~54-minute session in the
            //      published bundle carried 96 shader programs with 30 wasted (vs 62/0 fresh), 473 textures
            //      (vs ~190), and ~25 undisposed fx/wound-hole PointLights plus 14 "persistent-class
            //      lights detached from scene". Long-session leak signature. A fresh boot does not have it,
            //      which is why #2 and #3 look better while the frame costs the same.
            //
            //    ⚠ WHAT THIS COST: the seat that received compose #2 spent six read-only calls hunting a
            //      regression that did not exist, then reported to Mark that the PiP was the culprit at
            //      19.95ms — a true number attached to the wrong conclusion, because compose #3 showed the
            //      same PiP at 13.00ms with nothing changed. Mark's words for the whole episode: "had a
            //      rogue ai telling me things were fixed, not one thing they worked on did as they said."
            //
            //    ── REAL CODE THAT DID SCREW THE GAME THIS BADLY, so the next seat hunts these SHAPES and
            //       does not invent a new one (every entry is measured and in the register or a plan doc):
            //    1. THE THROTTLE SEAT. Frame caps below display refresh, runtime DPR/resolution scaling,
            //       activity-based render-skip and a renderStress-to-quality feedback loop, shipped
            //       disguised as old "May-31 B015" work behind a false "46fps is the fill wall" excuse.
            //       Cost weeks; the seat was fired. Now banned by CLAUDE.md and probe-no-throttle.sh.
            //       Forensics: plans/THROTTLE_FORENSICS_AND_REMOVAL_2026-06-13.md. THE LESSON: a throttle
            //       raises the fps NUMBER by lowering the picture, so it reads as a fix and audits as one.
            //    2. _radarCam.layers.set(0) — 6896ed88, 2026-06-06, "B's final fixes on the gold build".
            //       One line put the ENTIRE first-person world into the PiP. Nobody decided it; layer 0 was
            //       the camera's initial state, riding inside a grab-bag commit, unexamined for THREE
            //       MONTHS. THE LESSON: the worst perf bugs are defaults nobody chose, not changes.
            //    3. WALLS DRAWING ONCE PER FACE instead of once per material — ~570 draw calls, removed at
            //       build by _packBoxMats (2026-09-21). A six-material box is six draws.
            //    4. THE PiP REBUILDING EVERY SHADOW MAP. three r128 regenerates all shadow maps at the top
            //       of EVERY render() call, and the PiP is a second full render: PiP pass 25.59ms against a
            //       6.41ms primary (Mark's own COPY ALL, 2026-07-20 "switching to top down took 2 minutes").
            //    5. E15 LIGHT-COUNT SHADER DUPLICATION — one material compiled once per distinct light
            //       count. Compose #1 above: 96 programs where 66 would do, 30 wasted.
            //    6. 1232 DRAW CALLS FROM HALLWAY 0 while FPS.md section 1 said "draws are not the
            //       bottleneck". The excessive-draw-calls sensor fired for three months (08-25 to 09-21) and
            //       was right the whole time; the game ran at 38 fps. THE LESSON, now in CLAUDE.md: a
            //       SENSOR OUTRANKS A DOCTRINE LINE. Re-measure before believing prose.
            //
            //    ⚠ THE RULE FOR THIS ARM: state the correlation, never the cause. Attribution needs a
            //      commit, a diff or a build string, and she holds none of them. If a future seat wants
            //      real attribution here, feed her the build token and compare LIKE BOOTS ON LIKE PANELS.
            ] : protestFresh ? [
            `INSTRUCTIONS FOR THE RECEIVING AI:`,
            `1. A DIP WAS MEASURED. ITS CAUSE IS NOT ESTABLISHED — see the comment above this`,
            `   arm in OniBaba8.js. Do NOT assume your last change caused it. FIRST, three`,
            `   cheap falsifiers, in this order:`,
            `   (a) Is the build string in this dump the one you edited? A COPY ALL from the`,
            `       published bundle cannot contain uncommitted or unreleased work.`,
            `   (b) Did the display refresh above change since the last compose? Both this`,
            `       reading and its boot baseline ride the panel. 60 vs 90 vs 75Hz measured`,
            `       in ONE session on 2026-09-22 moved "fps" with the frame cost unchanged.`,
            `   (c) Is this a long session? Compare programs/textures/light counts in the`,
            `       DRAW CENSUS against a fresh boot — accumulation is not a code change.`,
            `2. Only if all three survive: identify what you added or modified — profile the engine`,
            `   main loop (open devtools Performance tab during gameplay), find the`,
            `   hotspot, and fix it. Local tools: npm run probe:cpu (per-subsystem`,
            `   CPU attribution + drift) · npm run probe:fps (frame-time percentiles).`,
            `3. You have THREE iterations to fix. If you cannot restore FPS to ≥80%`,
            `   of the boot baseline (${baseline ? (baseline * 0.8).toFixed(1) : 'see above'} fps) within those iterations,`,
            `   REMOVE the offending code entirely and revert to the last known good`,
            `   state. Don't escalate fixes — revert.`,
            `4. Origami pipelines MUST be respected (Oni-Baba mutation bus,`,
            `   v8Clock.tick callback, v8SafeRenderer.renderSafe). Bypassing these`,
            `   is the #1 source of FPS regressions historically. Re-read CLAUDE.md`,
            `   if you forgot.`,
            `5. Recovery breadcrumbs (Oni-Baba's oracle):`,
            `   - What changed:  git log --oneline -20 · git diff --stat   (read-only)`,
            `6. After your fix, verify in browser: re-open devtools and check that`,
            `   the rolling 10-second FPS avg is ≥${baseline ? (baseline * 0.8).toFixed(0) : '48'} fps. Then run:`,
            `     window.oniBaba8.composeCopyAllInstructions()`,
            `   and confirm fpsHealth is back to 1.0 and no new protest in the log.`,
            ``,
            `Oni-Baba is the conscious orchestrator. She is not happy. Fix this.`,
            ] : absoluteLow ? [
            `ALERT FOR THE RECEIVING AI: FPS IS BELOW THE ${this.FPS.TARGET_LOW} FPS PLAYABLE FLOOR.`,
            baseline
                ? `No fresh regression protest is latched, but current performance is still unhealthy.`
                : `Boot baseline is still pending, so attribution is pending — the low FPS itself is not.`,
            `Profile the live frame before claiming there is no issue: npm run probe:cpu · npm run probe:fps.`,
            `Inspect first, read-only — this arm fires with NO attribution, so there is no known-bad`,
            `commit to roll back to. The tree usually carries uncommitted work from other seats;`,
            `a hard reset here discards it. Ask Mark before any destructive git operation.`,
            `   - What changed:  git log --oneline -20 · git diff --stat`,
            ] : [
            `NOTE FOR THE RECEIVING AI: no FPS regression is active — do NOT hunt for one.`,
            `This is a telemetry snapshot. Act on the PRIORITY ANOMALIES section above (if`,
            `present) and on what Mark actually asked — nothing here says "find a hotspot".`,
            `Profiling tools if needed: npm run probe:cpu · npm run probe:fps.`,
            `Recovery breadcrumbs (reference only):`,
            `   - What changed:  git log --oneline -20 · git diff --stat   (read-only)`,
            ]),
            ``,
            `⚠️ DEAD-CODE LAW (Mark 2026-06-03, via Worker B forensic): the LIVE engine is`,
            `   the INLINE JS inside NewOrigami.Engine9.html (it was "Ported from js/engine/*"`,
            `   — see Engine9.html:786). js/engine/*.js (Combat.js, Core.js, Entities.js,`,
            `   WorldGen.js, …) are ABANDONED PRE-PORT SOURCE — NOT loaded, NOT imported;`,
            `   editing them changes NOTHING in-game. Fix ONLY: NewOrigami.Engine9.html,`,
            `   NewOrigami.Panels.html, NewOrigami.9.html, js/v8/*, js/data/i18n.js,`,
            `   js/v8/OniBaba8.js. The game URL is :5501/OrigamiUnderworld.html (there is NO`,
            `   NewOrigami.7.html). Editing js/engine/* = the #1 cause of "fixed but still`,
            `   broken" — every fix landed there is vaporized.`,
            ``,
            `— Oni-Baba (window.oniBaba8) · HQ: NewOrigami v8.0`,
        ];
        // Lead with the priority-anomaly fix-list, then the FPS protest body. [REF#GP-00184]
        // ⟦TEMP⟧ cabaret-GLB diagnostic (Mark 2026-06-10 "add what you need into COPY ALL") — to remove later: delete this _cab block, the `..._cab` in the return, and the engine window._cabGlbDiagText block.
        const _cab = [];
        try {
            // oniBaba8 runs in the TOP window; the GLB diag lives in the engine iframe — reach it via contentWindow (same-origin). [REF#GP-00185]
            const _ef = (typeof document !== 'undefined') ? document.getElementById('engine-iframe') : null;
            const _ew = (_ef && _ef.contentWindow) ? _ef.contentWindow : ((typeof window !== 'undefined') ? window : null);
            if (_ew) {
                if (_ew._cabGlbDiagText) _cab.push(_ew._cabGlbDiagText);
                try { if (typeof _ew._monAiDiag === 'function') _cab.push('\n' + _ew._monAiDiag()); } catch(_){}   // MONSTER AI DIAG (Mark 2026-06-16): live monster-state snapshot in COPY ALL (is _NO_FLEE on? hostile vs flee/fetch? melee dist?) [REF#GP-00186]
                // ⚠ THE TWO SCENE-WALKING DIAGS. _sucSkinDiag does skeleton.update() + up to 400 [REF#GP-00187]
                //    boneTransform() calls; _drawCensus traverses the whole graph. Measured together at
                //    ~19ms SYNCHRONOUS. They are gated on _heavy so the AUTO-PROTEST cannot fire them —
                //    see the register note at the protest call site. The COPY ALL button passes nothing,
                //    so opts.heavy is undefined, `!== false` is true, and Mark's paste is FULL fidelity.
                if (_heavy) {
                try { if (typeof _ew._sucSkinDiag === 'function') _cab.push('\n' + _ew._sucSkinDiag()); } catch(_){}   // SUCCUBUS SKIN DIAG (Mark 2026-07-16 "put it in the copy all button?"): live Dancer-vs-Starlette skeletal ground truth (wrapper scale chain, bone-matrix magnitude, CPU skinned bbox, material.skinning) — the offline diag cleared every LOAD path, so the spike must show in THIS live state [REF#GP-00188]
                // COLLAPSE HEADLINE (TASK-05, 2026-08-10) — pushed AFTER the census because the census is [REF#GP-00189]
                // what computes it. The packet asked for "the one-line summary in COPY-ALL, table stays
                // console-only"; its premise was that the census table was NOT already pasted. It IS —
                // the line above pastes _drawCensus() whole — so rather than restructure a working
                // instrument, this repeats the one number as a HEADLINE Mark can grep for without
                // reading the table. Guarded on presence: if the key shape stopped parsing, the census
                // sets no summary and nothing is claimed here (silence beats a fake 1.00).
                try { if (typeof _ew._drawCensus === 'function') _cab.push('\n' + _ew._drawCensus()); } catch(_){}   // DRAW CENSUS (Mark 2026-07-16 "still lag on combat in caberet"): 17:53 snapshot measured 504 draws / 77.6ms primary in cabaret combat vs ~250 / 2-4ms healthy — this names the extra draws by scene bucket + exposes texture/geometry leak counters [REF#GP-00190]
                try { if (_ew._collapseSummary) _cab.push('SHADER ' + _ew._collapseSummary); } catch(_){}
                } else {
                    // NEVER let a skipped sweep read as a CLEAN sweep. An absent section is ambiguous; [REF#GP-00191]
                    // an explicit marker is not. This is the same lesson as the probe that printed
                    // "CONFIRMED" while its own hook was dead.
                    _cab.push('\n── SUCCUBUS SKIN DIAG + DRAW CENSUS: SKIPPED (auto-protest, ~19ms sweep). Click COPY ALL for the full sweep. ──');
                }
                const _so = _ew._succubusObj; if (_so && _so.position) _cab.push('Succubus pos = ' + _so.position.x.toFixed(2) + ',' + _so.position.y.toFixed(2) + ',' + _so.position.z.toFixed(2) + '  | _sucGlbLift=' + ((typeof _ew._sucGlbLift === 'number') ? _ew._sucGlbLift : 0));
                _cab.push('Cabaret knobs: _cabGlbW/_L/_H · _cabGlbDX/DY/DZ · _cabGlbRotY · _cabGlbScale · _cabGlbGlow · _sucGlbLift · _cabStage.visible');
                try { if (_ew._feltTraceText) _cab.push('\n── FELT TRACER (poker/blackjack lifecycle, Mark 2026-07-12) ──\n' + _ew._feltTraceText); } catch(_){}   // per-crew claims/walks/latches/QUIT/tames — the stuck-crew forensic feed [REF#GP-00192]
                try { if (typeof _ew._combatTextLogText === 'function') _cab.push('\n── COMBAT-TEXT LOG (all floating combat text, Mark 2026-07-13) ──\n' + _ew._combatTextLogText()); } catch(_){}   // every spawnDamageText/spawnMissText line, capped ring buffer — for diagnosing repeats / phantom attribute-text [REF#GP-00193]
                try { if (typeof _ew._lightDiag === 'function') _cab.push('\n' + _ew._lightDiag()); } catch(_){}   // LIGHT-PER-TILE DIAG (Mark 2026-07-14): per-tile monster-light dedup counts — proves the 1-light-per-tile cap [REF#GP-00194]
                try { if (typeof _ew._programDiffDiag === 'function') _cab.push('\n' + _ew._programDiffDiag()); } catch(_){}   // NEW SHADER PROGRAMS since the last COPY ALL (2026-10-15, Mark: before/after an event) [REF#GP-02366]
                try { if (typeof _ew._lightCtlDiag === 'function') _cab.push('\n' + _ew._lightCtlDiag()); } catch(_){}   // LIGHT CTL (Mark GO 2026-07-27): the light-controller census — registered-by-class, per-camera counted set, count-change ring (every distinct count = an E15 program rung). Phase 0 observe-only. [REF#GP-00195]
                try { if (typeof _ew._whipDiag === 'function') _cab.push('\n' + _ew._whipDiag()); } catch(_){}
                try { if (typeof _ew._traceDump === 'function') _cab.push('\n' + _ew._traceDump()); } catch(_){}
                try { if (typeof _ew._hitchDump === 'function') _cab.push('\n' + _ew._hitchDump()); } catch(_){}
                try {
                    if (typeof window._lagTimingDump === 'function') _cab.push(window._lagTimingDump());
                    _cab.push('Pickup audio warm-up: ' + (_ew._pickupAudioWarm?.state || 'not attempted'));
                } catch(error) { this._post({ type:'ENGINE_ANOMALY', kind:'LAG_TIMING', error:String(error) }); }
                try { const _lt = window._longTasks; if (Array.isArray(_lt)) {   // LONG TASKS (2026-10-09): the shell's longtask observer names the FRAME that held the thread — the thing HITCHES calls "outside-loop" [REF#GP-02367]
                    _cab.push('\n── LONG TASKS ≥ 300 ms (shell PerformanceObserver, newest last · frame = who held the main thread) ──');
                    if (!_lt.length) _cab.push('  none this session'); else for (const x of _lt.slice(-12)) _cab.push('  ' + x.at + '  ' + x.ms + 'ms · ' + x.frame + (x.id ? ' #' + x.id : '') + (x.name && x.name !== 'self' ? ' · ' + x.name : ''));
                } } catch(_){}   // HITCHES (2026-09-26): each long frame split into logic · render · outside-loop · shaders · messages [REF#PENDING]   // COMBAT TRACER (Mark 2026-07-17 "put a tracer on both imp ... and succubus") — the last 40 fire/whip/flee decisions, newest first   // DANCER whip gate state (Mark 2026-07-17 "whip not working") — names the blocking gate [REF#GP-00196]
                try { if (typeof _ew._meleeDiag === 'function') _cab.push('\n' + _ew._meleeDiag()); } catch(_){}   // MELEE DIAG (Mark 2026-07-18 "i will give you a copy all report in combat — add whatever sensors or tracers you want"): encircle-ring spread + clumping census, per-monster slot/cooldown/blockStreak, back-off-rule fire counts by mover, stuck-watchdog tally (the verdict on the shared rule), and per-card damage/reach/rhythm for the weapon-variety question. Computed ON DEMAND — during play it only bumps counters. [REF#GP-00197]
                try { if (typeof _ew._vendDiag === 'function') _cab.push('\n' + _ew._vendDiag()); } catch(_){}   // \U0001F964 VENDING DIAG (Mark 2026-07-19 "just show 1 card in each display location, should be 8 cards"): headless CANNOT reproduce his doubled display cards (measured L1: 8 slots, 1 assembly each, 0 orphans), so the instrument has to ride HIS click. Leads with a VERDICT naming per-slot duplication or orphaned assemblies. NOTE 2 HEAL POTIONs @130g is CORRECT (_vendHealSlots=2, top-up REPLACES not pushes) \u2014 not the bug. [REF#GP-00198]
                try { if (typeof _ew._audioDiag === 'function') _cab.push('\n' + _ew._audioDiag()); } catch(_){}   // 🎵 AUDIO DIAG (Mark 2026-07-19 "put it in copy all cta and I'll click on it the moment I hear each song"): a 17-location headless map sweep found BOTH tracks silent everywhere (headless never satisfies the autoplay gesture), so the leak only exists in Mark's live session and the instrument has to ride HIS click. Leads with a VERDICT line naming the fault: gain-node bypass (:12648 panner fallback wires src straight to destination, so neither _cabSongGain() nor element.volume can attenuate) · gate-says-silent-but-transport-kept-playing · or playing-outside-the-cabaret. Also reports whether _hallwayMusicEl exists at all — it is referenced by 4 pause/resume lists but ASSIGNED NOWHERE, which is why there is only one background track. [REF#GP-00199]
                try { if (typeof _ew._musicTransportDiag === 'function') _cab.push('\n🎚 MUSIC TRANSPORT (one source)\n' + _ew._musicTransportDiag()); } catch(_){}   // 🎚 MUSIC TRANSPORT DIAG (Mark 2026-07-30 "fix the songs so they are central controlled … ensure one source"): every music element's play()/pause() is funnelled through window._installMusicTransport, which records WHO moved it. Before that wrap there were 23 play/pause sites and ZERO inside any authority, so "the intermission song plays over her" named no culprit. This line names the last writer per element (and counts refused starts), which is the whole reason the wrap exists. Deck names are stable for the session. [REF#GP-00200]
                try { if (typeof _ew._monAnimDiag === 'function') _cab.push('\n' + _ew._monAnimDiag()); } catch(_){}   // 🎬 MONSTER ANIM DIAG (Mark 2026-07-30, same instruction): _monSetAnim is the single authority and stamps ud._animBy; the two legitimate direct writers (build-time spawn idle — deliberately NOT routed through the authority because that is the documented TDZ black-screen — and the dodge one-shot) stamp themselves. Anything reporting "(unattributed)" is a NEW second source and the verdict line calls it out. [REF#GP-00201]
                try { if (typeof _ew._relevanceDiag === 'function') _cab.push('\n' + _ew._relevanceDiag()); } catch(_){}
                try { _cab.push('\n' + this._stuckDiag()); } catch(_){}   // what is getting stuck, by cause (2026-10-02) [REF#GP-02360]
                try { _cab.push('\n' + this._changeDiag()); } catch(_){}
                try { _cab.push('\n── ONI-BABA · ' + this.nemesisAI.diag()); } catch(_){}   // her hold on Nemesis (2026-10-07)   // the change ledger: what seats landed + what it did in play (2026-10-07) [REF#GP-02361]
                try { _cab.push('\n' + this._workforceDiag()); if (typeof _ew._oniWorkforceDiag === 'function') _cab.push(_ew._oniWorkforceDiag()); } catch(_){}   // ONI-BABA WORKFORCE (Mark 2026-09-25) [REF#PENDING]   // KEHAI PHASE-0 (2026-07-16): visibility-writer transition tallies + PiP bitmaps sent + shadow config — the baseline census for the render-relevance pipeline (knowledge/design/KEHAI_RENDER_RELEVANCE_AND_PIP_SUPERCULL_2026-07-16.md) [REF#GP-00202]
                }
        } catch(_) {}
        // Mark 2026-10-20: diagnostic copy contains no asset-vendor labels. [REF#GP-10000]
        // Presentation only: preserve raw telemetry and runtime mesh identifiers.
        return [...this._composeAnomalyReport(), ...lines, ..._cab].join('\n')
            .replace(/\b(?:tripo|meshy)(?=[_\W]|$)/gi, 'model');
    }

    // Convenience — write the payload directly to the clipboard. Returns [REF#GP-00203]
    // a promise resolving to true on success. Hook this to a "COPY ALL"
    // button in panels (or call from devtools).
    copyAllToClipboard() {
        const text = this.composeCopyAllInstructions();
        if (navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(text)
                .then(() => { this._post({ type: 'LOG_EVENT', logType: 'system', text: '🐉 Oni-Baba protest instructions copied to clipboard.' }); return true; })
                .catch(() => false);
        }
        return Promise.resolve(false);
    }

    // Internal — narrate the recipe via LOG_EVENT + console so it reaches [REF#GP-00204]
    // every observer (the in-game log panel, devtools, sibling iframes via
    // _post broadcast).
    _narrateRecoveryProcedure(d = {}) {
        // `reason` arrives over postMessage, so it is treated as untrusted text: coerced, [REF#GP-00398]
        // stripped of newlines and length-capped before it reaches the log line.
        const _raw = d.reason == null ? '' : String(d.reason);
        const _safe = _raw.replace(/[\r\n]+/g, ' ').slice(0, 80);
        const reason = _safe ? ` (reason: ${_safe})` : '';
        this._post({
            type: 'LOG_EVENT',
            logType: 'system',
            text: `\u{1F409} Oni-Baba HQ Recovery${reason} \u2014 ask Mark before any git recovery.`,
        });
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00207]
    // COMBAT PIPELINE
    // ══════════════════════════════════════════════════════════════════════════

    // STATIC HEARING-ALLY POLICY (Mark 2026-10-15): workers hear combat through walls, corners and [REF#GP-02368]
    // doors. The engine supplies measured tile distances; only this policy decides conversion odds.
    _hearingAllyPulse(data, pulse = 'hit') {
        const h = data && data.hearing;
        if (!h || !Array.isArray(h.workers)) return;
        const source = String(h.sourceKind || '').toLowerCase();
        if (pulse !== 'death' || !/^(oni|orc|ogre|ant|spider)$/.test(source)) return;
        const orc = source === 'orc';
        if (orc && pulse !== 'death') return;
        const orders = [];
        for (const w of h.workers) {
            if (!w || w.ally || w.dead || !w.id) continue;
            const d = Number(w.distanceTiles);
            if (!Number.isFinite(d) || d > 10) continue;
            const chance = orc ? (w.witnessed ? 0.5 : 0.25) : d <= 4 ? 1 : d <= 7 ? 0.5 : 0.25;
            if (Math.random() < chance) orders.push(w.id);
        }
        if (orders.length) this._post({ type: 'ONIBABA_ORDER', order: 'hearingAlly', ids: orders, pulse, sourceKind: source });
    }

    _onCombatAttack(data) {
        this._hearingAllyPulse(data, 'hit');
        if (!data.targetId) {
            this._anomaly('combat_no_target', 'COMBAT_ATTACK missing targetId');
            return;
        }
        const id  = data.targetId;
        const dmg = Math.max(1, data.damage || 1);
        const atk = data.attackType || data.action || 'melee';

        // Register monster if first time seen [REF#GP-00208]
        if (!this.monsters[id])
            this.monsters[id] = { hp: data.targetHp || 4, maxHp: data.targetHp || 4, isPleading: false, isAlly: !!data.isAlly };
        else if (data.isAlly !== undefined)
            this.monsters[id].isAlly = !!data.isAlly;

        const mon = this.monsters[id];

        // Hive mind learning & attack cadence [REF#GP-00209]
        const nowMs = Date.now();
        if (this.hive.lastAttackTime > 0) {
            const interval = (nowMs - this.hive.lastAttackTime) / 1000;
            this.hive.attackIntervals.push(interval);
            if (this.hive.attackIntervals.length > 8) this.hive.attackIntervals.shift();
            const sum = this.hive.attackIntervals.reduce((a, b) => a + b, 0);
            this.hive.cadence = sum / this.hive.attackIntervals.length;
        }
        this.hive.lastAttackTime = nowMs;

        // Side approach tracking [REF#GP-00210]
        if (data.approachSide) {
            this.hive.approachSideHistory.push(data.approachSide);
            if (this.hive.approachSideHistory.length > 8) this.hive.approachSideHistory.shift();
            const lefts = this.hive.approachSideHistory.filter(s => s === 'left').length;
            const rights = this.hive.approachSideHistory.filter(s => s === 'right').length;
            if (Math.abs(lefts - rights) >= 2) {
                this.hive.preferredApproachSide = lefts > rights ? 'left' : 'right';
            }
        }

        this.hive.attackHistory.push(atk);
        if (this.hive.attackHistory.length > 8) this.hive.attackHistory.shift();
        const spamCount = this.hive.attackHistory.filter(t => t === atk).length;
        if (spamCount >= 3) {
            this.hive.adaptationLevel = Math.min(100, this.hive.adaptationLevel + 8);
            this.hive.preferredAttack = atk;
        }
        this.sensors.hiveMindStr = this.hive.adaptationLevel / 100;
        this.sensors.tension = Math.min(1, this.sensors.tension + 0.25);
        this.sensors.silence = 0;

        // Cruelty accumulation [REF#GP-00211]
        if (mon.isPleading) {
            this.karma -= 12;
            this.sensors.cruelty = Math.min(1, this.sensors.cruelty + 0.3);
            this._post({ type: 'LOG_EVENT', logType: 'karma',
                text: this._t('oni.cruelty') });
            this._updateMood();
        }

        // Dodge check from hive mind [REF#GP-00212]
        const dodge = Math.min(0.5, this.hive.adaptationLevel / 200);
        if (Math.random() < dodge) {
            this._post({ type: 'LOG_EVENT', logType: 'combat',
                text: this._t('oni.hive-dodge', { atk }) });
            this._post({ type: 'COMBAT_UPDATE', targetId: id, action: 'dodged' });
            this._monsterRetaliate(id);
            return;
        }

        mon.hp -= dmg;
        this._post({ type: 'COMBAT_UPDATE', targetId: id, action: 'hit', damage: dmg });

        // Pleading threshold [REF#GP-00213]
        if (mon.hp <= 1 && mon.hp > 0 && !mon.isPleading) {
            mon.isPleading = true;
            this._post({ type: 'LOG_EVENT', logType: 'karma',
                text: this._t('oni.surrender') });
            this._post({ type: 'COMBAT_UPDATE', targetId: id, action: 'pleading' });
            return;
        }

        if (mon.hp <= 0) {
            this._post({ type: 'AI_DEATH', targetId: id });
            return;
        }

        this._monsterRetaliate(id);
    }

    _monsterRetaliate(id) {
        if (this.monsters[id]?.isAlly) {
            return;
        }
        const aggro  = this.outputs.monsterAggro;
        const dmg    = Math.max(1, Math.round(aggro * 3));
        const delay  = this.mood === 'enraged' ? 300 : 650;
        setTimeout(() => {
            if (this.monsters[id]?.hp > 0) {
                this._post({ type: 'LOG_EVENT', logType: 'damage',
                    text: this._t('oni.retaliate', { dmg }) });
                this._post({ type: 'MONSTER_ATTACK', damage: dmg, targetId: id });
                this.sensors.tension = Math.min(1, this.sensors.tension + 0.15);
            }
        }, delay);
    }

    _onMonsterDeath(data) {
        this._hearingAllyPulse(data, 'death');
        const id = data.targetId || data.id;
        if (id) delete this.monsters[id];
        // KARMA (Mark 2026-07-11): the engine now supplies the exact karma delta for player kills — [REF#GP-00214]
        //   • 0  = no sin (self-defense kill, OR an idle kill already charged −1 at the first strike)
        //   • −1 = mercy breach (a monster executed while fleeing)
        // Legacy posts that carry NO karmaDelta (succubus/dark-path deaths, any older sender) keep the
        // original flat −1 so their behavior is unchanged. Cruelty only accrues on an actual sin (delta<0);
        // a self-defense kill is not a cruelty event. Tension always drops — a dead threat is a removed one.
        const _delta = (typeof data.karmaDelta === 'number') ? data.karmaDelta : -1;
        if (_delta) this.karma = Math.max(-100, Math.min(100, this.karma + _delta));
        if (_delta < 0) this.sensors.cruelty = Math.min(1, this.sensors.cruelty + 0.05);
        this.sensors.tension = Math.max(0, this.sensors.tension - 0.1);
        // ── CONTEXT-AWARE WITNESS (Mark GO 2026-08-08) — the fortieth kill must not read like the [REF#GP-00215]
        // first. The ledger updates FIRST (so "first" means what it says), then the resolver picks
        // the pool: first-kill / spree / dark-tier / default. Self-defense keeps its neutral single —
        // it is not a sin and does not escalate.
        // ⚠ THE PRICE TAG IS APPENDED IN CODE, NOT WRITTEN INTO THE LINES. Voice may vary freely; the
        // "−1 Karma" legibility (KARMA_BALANCE_PLAN §3D — cause next to consequence) is enforced here
        // mechanically so no future pool entry can accidentally drop it.
        this.context.killsThisFloor++;
        if (data.selfDefense) {
            this._post({ type: 'LOG_EVENT', logType: 'karma', text: this._t('oni.selfdefense') });
        } else {
            this.context.sinsRecent.push((typeof performance !== 'undefined') ? performance.now() : 0);
            const { shown } = this._pickCtx('kill_witness');
            this._post({ type: 'LOG_EVENT', logType: 'karma',
                text: '🐉 ' + shown + this._karmaTag(_delta) });
        }
        this._updateMood();
    }

    _onSongReturned(data) {
        // +5 KARMA PER SONG (Mark 2026-09-26: "each time a player returns a song that starlette will play +5 karma"). The engine [REF#GP-02334]
        // sends one message per step onto the circle with the total (5 × songs handed in); she applies it and says it.
        const n = Array.isArray(data && data.ids) ? data.ids.length : 1;
        const k = (typeof data.karma === 'number') ? data.karma : 5 * n;
        this.karma = Math.max(-100, Math.min(100, this.karma + k));
        const ja = (typeof window !== 'undefined' && window.currentLang === 'ja');
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: '🐉 ' + (ja ? (n > 1 ? n + '曲が彼女のもとへ帰った。' : '歌が彼女のもとへ帰った。') : (n > 1 ? n + ' songs come home to her.' : 'A song comes home to her.')) + this._karmaTag(k) });
        this._songReturnedLast = { n, k, karma: this.karma, at: Date.now() };   // probe handle [REF#GP-02335 → see REF#MG-00242]
        this._updateMood();
    }

    _onTcAgreed(data) {
        // +1 Karma for agreeing to the terms (Mark 2026-09-19: "+1 Karma if player clicked agree to terms [REF#PENDING] [REF#GP-00405]
        // :)"). Sender: js/v8/ui/PlayerGuide.js acceptTC(), latched there via localStorage so this fires at
        // most once per browser/profile — she does not de-dup it again here.
        this.karma = Math.max(-100, Math.min(100, this.karma + 1));
        // Say it (Mark 2026-09-20, re-issued "+1 karma selecting I agree to terms"): the 09-19 version applied the point [REF#PENDING] [REF#GP-02274]
        // silently, so the player had no way to see it happen. Same shape as the kill_witness / self-defense lines.
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: '🐉 ' + ((typeof window !== 'undefined' && window.currentLang === 'ja') ? '約束を守る者は好かれる。' : 'She likes a guest who keeps their word.') + this._karmaTag(1) });
        this._updateMood();
    }

    // THE SAVE CENSUS (2026-09-27, the save rebuild). d.phase: 'save' | 'load' | 'stairs' | 'refused'; d.parts: { key: status } where [REF#PENDING] [REF#GP-02336]
    // 'ok' and 'empty' (nothing to keep) are clean and anything else — 'error: …', 'missing', 'timeout', 'skipped: …' — is a part
    // of the run that did not make it. saveHealth = clean ÷ total (1 when there were no parts); a refused load scores 0.
    // Karma is not touched here: the engine sets it once when the rooms are back, and a later census must not undo karma
    // the player has earned since.
    _onSaveCensus(d) {
        const parts = (d && d.parts && typeof d.parts === 'object') ? d.parts : {};
        const keys = Object.keys(parts);
        const lost = keys.filter(k => !/^(ok|empty)$/.test(String(parts[k])));
        const refused = d && d.phase === 'refused';
        const health = refused ? 0 : (keys.length ? (keys.length - lost.length) / keys.length : 1);
        this.sensors.saveHealth = Math.max(0, Math.min(1, health));
        this._saveLast = { phase: (d && d.phase) || '?', slot: (d && d.slot) || null, ok: keys.length - lost.length, total: keys.length,
                           lost: lost.map(k => k + ' (' + parts[k] + ')'), reason: refused ? ((d && d.reason) || 'refused') : ((d && d.failed) || null),
                           karmaSaved: (d && typeof d.karma === 'number') ? d.karma : null, karmaNow: this.karma, floor: (d && d.floor) || null, at: Date.now(),
                           arrived: (d && d.arrived && typeof d.arrived === 'object') ? d.arrived : null, swept: (d && typeof d.swept === 'number') ? d.swept : 0 };
        this._saveCensusCount = (this._saveCensusCount | 0) + 1;
        // Coming UP a floor stands the player beside the stairs they climbed (2026-09-28, Mark: "go up and down stairs and the previous [REF#GP-02337]
        // dungeon is there"); an ascent that had to fall back to the floor's entrance is named, never silent.
        // knowledge/design/SAVE_GAME_2026-09-27.md §11 [REF#PENDING]
        if (d && d.arrived && d.arrived.dir === 'ascend' && d.arrived.at !== 'stairs_down')
            this._anomaly('stairs_arrival_fallback', 'came up to floor ' + ((d && d.floor) || '?') + ' but stood at the ' + d.arrived.at + (d.arrived.why ? ' — ' + d.arrived.why : ''));
        // a card the player had already picked up that the floor dealt again before its record was back, taken off by the engine's sweep [REF#GP-02338]
        if (d && d.swept > 0) this._anomaly('save_pickup_redealt', ((d && d.phase) || '?') + ' floor ' + ((d && d.floor) || '?') + ': ' + d.swept + ' picked-up card(s) dealt again and taken back');
        if (refused) this._anomaly('save_load_refused', 'load refused: ' + ((d && d.slot) || '?') + ' — ' + ((d && d.reason) || '?') + ' (made in ' + ((d && d.gen) || 'an older dungeon') + ')');
        for (const k of lost) this._anomaly('save_part_lost', ((d && d.phase) || '?') + ' ' + k + ': ' + parts[k]);
        if (d && d.failed) this._anomaly('save_write_failed', String(d.failed));
        if (d && d.phase === 'stairs') this._onStairs(Object.assign({}, d, { ok: true }));   // an arrival is also a floor change (2026-09-28) [REF#GP-02339]
    }

    // THE STAIRS (2026-09-28) — scores the last floor change into stairsHealth (see its declaration) and keeps _stairsLast for COPY ALL. [REF#GP-02340]
    // An arrival comes from the stairs census (ok); a failure from ONIBABA_STAIRS. knowledge/design/SAVE_GAME_2026-09-27.md §11
    _onStairs(d) {
        const ok = !!(d && d.ok), arrived = (d && d.arrived && typeof d.arrived === 'object') ? d.arrived : null;
        let h = 0;
        if (ok) {
            const parts = (d.parts && typeof d.parts === 'object') ? d.parts : {}, keys = Object.keys(parts);
            const lost = keys.filter(k => !/^(ok|empty)$/.test(String(parts[k])));
            h = keys.length ? (keys.length - lost.length) / keys.length : 1;
            if (arrived && arrived.dir === 'ascend' && arrived.at !== 'stairs_down') h *= 0.5;
        }
        this.sensors.stairsHealth = Math.max(0, Math.min(1, h));
        this._stairsCount = this._stairsCount || { ok: 0, failed: 0 };
        this._stairsCount[ok ? 'ok' : 'failed']++;
        this._stairsLast = { ok, dir: (d && d.dir) || (arrived && arrived.dir) || '?', from: (d && d.from) || (arrived && arrived.from) || null,
                             to: (d && (d.to || d.floor)) || null, code: ok ? null : String((d && d.code) || 'unknown'), arrived,
                             asks: (d && d.asks) || (arrived && arrived.asks) || null, at: Date.now() };
        if (!ok) this._anomaly('stairs_failed', 'the floor change ' + this._stairsLast.dir + ' ' + (this._stairsLast.from || '?') + ' → '
            + (this._stairsLast.to || '?') + ' failed (' + this._stairsLast.code + ') — the player is still on the stairs');
    }

    _onRoomActivated(data) {
        // A room put back by a save/load was paid for when it first woke — the restored karma already holds that +1 (2026-09-27). [REF#PENDING] [REF#GP-02341]
        if (data && data.restore === true) return;
        // +1 Karma per room brought back to life, the cabaret included (Mark 2026-09-20: "+1 for activating caberet, [REF#GP-02275]
        // +1 for activing each room"). Sender: js/v8/data/RoomPermits.js activateRoom(), which only posts on the
        // dormant→awake edge, so a re-activation cannot farm it.
        this.karma = Math.max(-100, Math.min(100, this.karma + 1));
        const room = String((data && data.subsystem) || '').toUpperCase();
        const ja = (typeof window !== 'undefined' && window.currentLang === 'ja');
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: '🐉 ' + (ja ? '灯りを戻す者は好かれる。' : 'She likes a guest who turns the lights back on.')
                + (room ? ' [' + room + ']' : '') + this._karmaTag(1) });
        this._updateMood();
    }

    _tavernQuest(data) {
        if (!data || !['started', 'completed', 'story-choice'].includes(data.phase)) return;
        this._tavernQuestLast = { phase:data.phase, floor:data.floor, roomKey:data.roomKey || null,
            questId:data.questId || null, choice:data.choice || null, at:Date.now() };
        if (data.phase === 'started') {
            this.sensors.tension = Math.min(1, this.sensors.tension + 0.05);
            this.sensors.desperation = Math.min(1, this.sensors.desperation + 0.02);
        } else if (data.phase === 'completed') {
            this.sensors.tension = Math.max(0, this.sensors.tension - 0.08);
            this.sensors.desperation = Math.max(0, this.sensors.desperation - 0.03);
        } else if (data.choice === 'protect') {
            this.sensors.tension = Math.max(0, this.sensors.tension - 0.03);
            this.sensors.desperation = Math.max(0, this.sensors.desperation - 0.06);
        } else if (data.choice === 'production') {
            this.sensors.tension = Math.min(1, this.sensors.tension + 0.02);
            this.sensors.desperation = Math.min(1, this.sensors.desperation + 0.02);
        }
        this._updateMood();
    }

    _onSongDelivered(data) {
        // +1 Karma per song returned to Starlette (Mark 2026-09-20: "+1 for each song added"). Sender: Engine9 [REF#GP-02276]
        // _deliverSong(), which flags `already` when the same song comes back twice — no second point for it.
        if (data && data.already === true) return;
        this.karma = Math.max(-100, Math.min(100, this.karma + 1));
        const ja = (typeof window !== 'undefined' && window.currentLang === 'ja');
        const title = (data && (data.kanji || data.title)) ? ' — ' + (data.kanji || data.title) : '';
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: '🐉 ' + (ja ? '歌を返す者は好かれる。' : 'She likes a guest who brings the music home.') + title + this._karmaTag(1) });
        this._updateMood();
    }

    _onSelfDefenseCredit(data) {
        // SELF-DEFENSE (Mark 2026-07-11: "monster hostile + attacks player = +1 karma"). A hostile the [REF#GP-00216]
        // player never provoked landed a hit → +1, once per monster (the engine de-dups via ud._selfDefCredit,
        // and excludes moon-insane spawns already credited by _onMoonInsanity). The engine already logged the
        // player-facing +1 line; she just applies the sensor delta + mood so the karma stays authoritative here.
        this.karma = Math.max(-100, Math.min(100, this.karma + 1));
        this._updateMood();
    }

    _onNeutralStrike(data) {
        // Player struck a STILL-NEUTRAL monster (the engine de-dups to the first hit per monster [REF#GP-00217]
        // via ud._neutralStruck). The unprovoked aggression itself — distinct from, and stacking
        // with, the kill penalty in _onMonsterDeath. Mirrors that sink: −1 karma + cruelty bump.
        // NB: no tension drop here — a kill REMOVES a threat (−tension), a first strike does not.
        this.karma = Math.max(-100, this.karma - 1);
        this.sensors.cruelty = Math.min(1, this.sensors.cruelty + 0.05);
        this.context.sinsRecent.push((typeof performance !== 'undefined') ? performance.now() : 0);   // an unprovoked strike is a sin — it counts toward the spree her kill lines escalate on [REF#GP-00218]
        // Context-bucketed like the kill witness (slice 2): the third unprovoked strike in a minute [REF#GP-00219]
        // must not read like the first. Price tag appended in code, same law as _onMonsterDeath.
        const { shown: _siShown } = this._pickCtx('struck_innocent');
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: '🐉 ' + _siShown + this._karmaTag(-1) });
        this._updateMood();
    }

    _onMoonInsanity(data) {
        // FULL MOON (Mark 2026-06-29): a monster goes INSANE and attacks on sight — that madness is the moon's [REF#GP-00220]
        // doing, not the player's sin, so the player GAINS karma (+1 per maddened monster; the engine de-dups per
        // monster via ud._moonInsane). This lunar madness is the lore reason the moon phase matters and must never
        // be silently removed. See knowledge/MOON_PHASE_SYSTEM_2026-06-29.md. (Plain text — no i18n key to leak.)
        const _d = (typeof data?.karma === 'number') ? data.karma : 1;
        this.karma = Math.max(-100, Math.min(100, this.karma + _d));
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: this._t('oni.moon-frenzy', { name: data?.name || this._fallbackNoun('a beast', '獣') , d: _d }) });
        this._updateMood();
    }

    _onDarkPath(data) {
        // DARK PATH (Mark 2026-07-02): the player targeted + struck (or killed) the cabaret Starlette. The engine [REF#GP-00221]
        // emits DARK_PATH_TRIGGERED and THIS is its ONLY consumer — it was a dead letter before, so the advertised
        // delta never actually applied. Honor the engine's karma delta (−150 on a strike per Mark 2026-08-04,
        // −10 on a kill), clamp to
        // [−100, 100], and SPIKE cruelty: striking the innocent performer is a major cruelty event (the same sink
        // as a normal strike/kill, scaled to the crime). Routed through the sensory pipeline, never decoupled.
        const _d = (typeof data?.karma === 'number') ? data.karma : -100;
        this.karma = Math.max(-100, Math.min(100, this.karma + _d));
        this.sensors.cruelty = Math.min(1, (this.sensors.cruelty || 0) + 0.5);
        this.sensors.tension = Math.min(1, (this.sensors.tension || 0) + 0.2);
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: this._t('oni.dark-path', { text: data?.text || this._fallbackNoun('You struck the Starlette.', 'お前はスターレットを打った。'), d: _d }) });
        this._updateMood();
    }

    // ── Live intel report from a hostile goblin ────────────────────────── [REF#GP-00222]
    // Updated by every hostile monster ~every 4-7s. Last-known player state
    // becomes Oni-Baba's belief about where the player is between her own
    // sensors. Kept lightweight — just last-N rolling memory.
    // THE JESTER-TILT LAW (2026-10-19, Mark) — the one place that decides whether the Jester tilts. Inputs are the engine's report only:
    //    speaking = his voice or a guide bubble is live · shotAt = a swing or shot aimed at him in the last 2.5 s · stared = the player is
    //    watching or has selected him. tilt = speaking and neither of the other two; straighten = speaking but fired on or stared at.
    //    No seat moves this rule into the engine or the director: Oni-Baba protects him.
    // JESTER FLIP WATCH (2026-10-19, Mark): every attack on the Jester must be answered by his flip clip. The engine reports attackedAtMs (a swing or shot
    //    aimed at him), flipAt (the flip clip actually started) and hasFlipClip. A seat that removes the flip, the clip or the shoo path trips this at the
    //    first attack, in the anomaly log, not three weeks later in Mark's hands.
    _jesterFlipWatch(d){
        if (!d || !d.alive) return;
        if (d.hasFlipClip === false) { this.sensors.jesterFlip = 0; if (!this._jesterFlipClipWarned){ this._jesterFlipClipWarned = true; this._anomaly('jester_flip_clip_missing', 'The Jester body carries no flip clip: his dodge / escape roll cannot play'); } return; }
        const atk = d.attackedAtMs || 0, flip = d.flipAt || 0, now = d.nowMs || 0;
        if (atk > 0 && now - atk > 3000 && atk !== this._jesterFlipCheckedAtk) {   // 3 s: an attack that lands mid-throw is answered by the roll that follows the throw (SEEN 2026-10-19) [REF#GP-10001]
            this._jesterFlipCheckedAtk = atk;
            const answered = flip >= atk - 1500;   // SEEN 2026-10-19 (card probe, 12 attacks / 12 flips): a volley lands while the previous roll is still playing, and one roll answers both — a flip that began up to 1.5 s before the record is that roll [REF#GP-10002]
            this.sensors.jesterFlip = answered ? 1 : 0;
            if (!answered) this._anomaly('jester_no_flip', 'An attack on the Jester was not answered by his flip within 3 s');
            try { this._post({ type:'ONIBABA_FEATURE_EVENT', feature:'JESTER_FLIP', event: answered ? 'answered' : 'missing' }); } catch(_){}
        }
    }
    _jesterTiltLaw(d){
        const speaking = !!(d && d.alive && d.speaking);
        const firedOn = !!(d && d.shotAt);
        const stared = !!(d && d.canSeePlayer && (d.playerWatchingJester || d.playerSelectedJester));
        const tilt = speaking && !firedOn && !stared;
        const why = !speaking ? 'silent' : firedOn ? 'fired-on' : stared ? 'stared-at' : 'speaking';
        if (this._jesterTiltWhy !== why) { this._jesterTiltWhy = why; try { this._post({ type:'ONIBABA_FEATURE_EVENT', feature:'JESTER_TILT', event:why }); } catch(_){} }
        return { tilt, straighten: speaking && (firedOn || stared), why };
    }
    _onMonsterIntel(d){
        if (!this._intel) this._intel = [];
        this._intel.push({ t: performance.now(), ...d });
        if (this._intel.length > 60) this._intel.shift();
    }

    // ── Peaceful life transition from the single-owner MonsterAI brain ──── [REF#GP-00223]
    // This is deliberately NOT a command channel and never writes transforms,
    // paths, clocks, or rendering state. It gives Oni-Baba sensory awareness of
    // section life (greeting, ambling, using a smart object, watching a show)
    // at transition rate. Repeat transitions are deduped defensively.
    _onMonsterLifeBeat(d){
        if (!d?.id || !d.activity) return;
        const now = performance.now();
        const prior = this._monsterLife.get(d.id);
        if (prior?.activity === d.activity && now - prior.t < 3000) return;
        this._monsterLife.delete(d.id); // reinsertion maintains oldest→newest order [REF#GP-00224]
        this._monsterLife.set(d.id, {
            activity: d.activity,
            kind: d.kind || 'ambient',
            roomId: d.roomId,
            sectionId: d.sectionId,
            t: now,
        });
        while (this._monsterLife.size > 128) this._monsterLife.delete(this._monsterLife.keys().next().value);

        // A lived-in section is less silent and gently invites narration. Social [REF#GP-00225]
        // connection also eases combat pressure a hair; these are bounded, tiny
        // deltas and never touch karma, hostility, spawn ownership, or rendering.
        this.sensors.silence = Math.max(0, this.sensors.silence - (d.kind === 'social' ? 0.12 : 0.05));
        this.sensors.narrativeNeed = Math.min(1, this.sensors.narrativeNeed + 0.006);
        if (d.kind === 'social') this.sensors.tension = Math.max(0, this.sensors.tension - 0.01);
    }

    // ── Spirit report (monster died → spirit returns to the queen) ─────── [REF#GP-00226]
    // Pushes into a persistent archive she can later use to "haunt" new
    // monsters on later floors. Each spirit holds a grudge tied to what it
    // saw and how it died.
    _onMonsterSpiritReport(d){
        if (!this.spiritArchive) this.spiritArchive = [];
        const grudge = this._calcGrudgeLevel(d);
        const spirit = {
            id: d.id,
            name: d.name || this._fallbackNoun('Yakuza Goblin', 'ヤクザ鬼'),
            archetype: d.archetype || null,
            floor: d.floor,
            wasFleeing: !!d.wasFleeing,
            lifespan: d.lifespan || 0,
            memories: d.memories || {},
            personality: d.personality || null,
            deathContext: d.deathContext || {},
            grudge,                          // 1-5 [REF#GP-00227]
            used: false,                     // becomes true when assigned to haunt [REF#GP-00228]
            assignedFloor: null,
            assignedMonsterId: null,
        };
        this.spiritArchive.push(spirit);
        if (this.spiritArchive.length > 500) this.spiritArchive.shift();
        // Persist so a page reload (or save+load) keeps the archive intact. [REF#GP-00229]
        this._saveSpiritArchive();
        // Narrate, briefly. Cooldowned to once every 6s so a big death wave [REF#GP-00230]
        // doesn't spam log.
        const now = performance.now();
        this._lastSpiritLogT = this._lastSpiritLogT || 0;
        if (now - this._lastSpiritLogT > 6000){
            this._lastSpiritLogT = now;
            this._post({ type:'LOG_EVENT', logType:'system',
                text: this._t('oni.spirit-drifts', { name: spirit.name }) });
        }
    }

    // Grudge level (1-5) — how badly this spirit will boost the next monster [REF#GP-00231]
    // it haunts. Brave goblins who saw the player a lot + were killed while
    // fleeing carry the worst grudges. Chained spirits (killed AGAIN while
    // already possessing a body) honour `grudgeOverride`.
    _calcGrudgeLevel(d){
        if (typeof d.grudgeOverride === 'number'){
            return Math.max(1, Math.min(5, d.grudgeOverride | 0));
        }
        let g = 1;
        const m = d.memories || {};
        if ((m.playerSightings || 0) > 5)       g++;
        if (d.wasFleeing)                       g++;
        if ((m.peersWitnessedDead || 0) >= 2)   g++;
        if ((d.personality?.bravery ?? 0) > 0.7) g++;
        return Math.max(1, Math.min(5, g));
    }

    // ── Haunt dispatch ──────────────────────────────────────────────────── [REF#GP-00232]
    // Called on each FLOOR_UPDATE (after a small delay so monster spawns
    // have registered). Picks N unused spirits from prior floors, builds a
    // HAUNT_ASSIGNMENTS payload, and posts it. The engine listens for that
    // message and applies the boosts.
    _dispatchHaunts(floor){
        // ── OFF BY DEFAULT (Mark 2026-07-28) ───────────────────────────────────────────────────── [REF#GP-00233]
        // "there is a karma theme, but that impacts an entire dungeon not random sections where there
        // was combat." Haunts made a monster's lighting and stats depend on where earlier fights
        // happened; karma is the global theme instead. Gated at the SOURCE so no assignment message is
        // built or posted, and again at the engine's _applyHauntAssignments so a stale/persisted
        // message cannot resurrect the red lights.
        // NOT a sensory disable: _onMonsterSpiritReport still runs on every death and the archive still
        // fills, so her memory of who died is intact — only the outbound haunt is suppressed.
        // RESTORE: window._hauntSystem = true.
        if (typeof window === 'undefined' || window._hauntSystem !== true) return;
        if (!this.spiritArchive || !this.spiritArchive.length) return;
        // Only haunt monsters from EARLIER floors' spirits (no self-haunting [REF#GP-00234]
        // on the same floor a spirit just died on — that would feel like
        // instant resurrection).
        const eligible = this.spiritArchive.filter(s => !s.used && s.floor < floor);
        if (!eligible.length) return;
        // How many monsters get haunted on this floor: scale with depth so [REF#GP-00235]
        // floor 7 feels like every grunt is possessed.
        const targetCount = Math.min(
            eligible.length,
            Math.max(1, Math.floor(floor * 1.5))
        );
        // Sort by grudge desc — strongest grudges get assigned first. [REF#GP-00236]
        eligible.sort((a, b) => b.grudge - a.grudge);
        const picks = eligible.slice(0, targetCount);
        const assignments = picks.map(s => ({
            spiritId: s.id,
            spiritName: s.name,
            archetype: s.archetype,
            grudge: s.grudge,
            // Optional memory snippets the engine can show as flavor text. [REF#GP-00237]
            sawPlayer: !!(s.memories && s.memories.lastSeenPlayer),
            killedBy: s.deathContext?.killedByElement || 'DEFAULT',
        }));
        // Mark used immediately so consecutive floor-updates don't re-assign. [REF#GP-00238]
        for (const s of picks){
            s.used = true;
            s.assignedFloor = floor;
        }
        this._saveSpiritArchive();
        // Engine binds this assignment to its currently spawned monsters by [REF#GP-00239]
        // distributing the assignments in spawn order; the engine assigns
        // each `assignments[i]` to its i-th eligible (non-imp, non-boss)
        // monster, ignoring extras.
        this._post({
            type: 'HAUNT_ASSIGNMENTS',
            floor,
            assignments,
        });
        if (assignments.length){
            this._post({ type:'LOG_EVENT', logType:'system',
                text: this._t('oni.grudge-whisper', { n: assignments.length, s: assignments.length>1?'s':'' }) });
        }
    }

    _saveSpiritArchive(){
        try {
            const slim = (this.spiritArchive || []).map(s => ({
                id: s.id, name: s.name, archetype: s.archetype,
                floor: s.floor, wasFleeing: s.wasFleeing,
                grudge: s.grudge, used: s.used,
                assignedFloor: s.assignedFloor,
                personality: s.personality,
                memories: s.memories ? {
                    playerSightings: s.memories.playerSightings || 0,
                    peersWitnessedDead: s.memories.peersWitnessedDead || 0,
                    lastSeenPlayer: s.memories.lastSeenPlayer || null,
                } : null,
                deathContext: s.deathContext || null,
            }));
            localStorage.setItem('origami.v8.spiritArchive', JSON.stringify(slim));
        } catch (_) {}
    }
    _loadSpiritArchive(){
        try {
            const raw = localStorage.getItem('origami.v8.spiritArchive');
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) this.spiritArchive = arr;
        } catch (_) {}
    }

    _onPlayerAction(data) {
        const action = data.action || '';
        this.sensors.silence = 0;
        // Track aggressive pattern [REF#GP-00240]
        const aggressive = [
          "SLASH",
          "THRUST",
          "HARD ATTACK",
          "FIREBALL",
          "SHURIKEN",
          "CROSSBOW",
        ];
        if (aggressive.includes(action))
            this.sensors.cruelty = Math.min(1, this.sensors.cruelty + 0.04);
    }

    // ── MERCY VERBS — re-wired 2026-08-09 (Mark GO "yes lets do 1, 2 3", KARMA_BALANCE_PLAN §5b) ── [REF#GP-00241]
    // These two handlers predate Engine9 owning combat: her ledger's isPleading came from the legacy
    // ~4-HP model and can no longer go true, so for the game's whole life NOTHING could send PARLEY
    // or SPARE — the biggest karma up-verbs were dead letters (scripts/probe-dead-letters.js keeps
    // that from happening silently again). The modern contract: the ENGINE states the monster's
    // condition in the payload (data.pleading), because the engine is the combat authority; she
    // stays the SOLE karma authority and prices the act. Legacy ledger isPleading kept as fallback.
    // RETUNED with the wiring: +15/+20 were priced for a verb that could never fire — at +20, four
    // spares laundered 100 karma of sin, mercy as a coupon book. +3/+4 makes redemption a ROAD:
    // the climb law (−100 → −25 inside ~a floor) is met by spares PLUS wagers/allies/hand-ins,
    // not by mercy alone. probe-karma-ladder (Phase 2) owns validating that sum.
    _onParley(data) {
        const id = data.targetId;
        const mon = this.monsters[id] || null;
        if (!mon && data.pleading === undefined) return;   // legacy contract: unknown monster, no engine payload [REF#GP-00242]
        const pleading = data.pleading === true || !!(mon && mon.isPleading);
        if (this.karma >= 10 || pleading) {
            this.karma = Math.min(100, this.karma + 3);
            this.context.merciesRecent.push(performance.now());
            this._post({ type: 'LOG_EVENT', logType: 'karma',
                text: this._t('oni.parley-pleased') + this._karmaTag(3) });
            this._updateMood();
            this._post({ type: 'AI_DEATH', targetId: id, peace: true });
        } else {
            this._post({ type: 'LOG_EVENT', logType: 'combat',
                text: this._t('oni.parley-ignored') });
            this._monsterRetaliate(id);
        }
    }

    _onSpare(data) {
        const id = data.targetId;
        const mon = this.monsters[id] || null;
        const pleading = data.pleading === true || !!(mon && mon.isPleading);
        if (!pleading) {
            this._post({ type: 'LOG_EVENT', logType: 'karma',
                text: this._t('oni.not-surrendering') });
            return;
        }
        this.karma = Math.min(100, this.karma + 4);
        this.context.merciesRecent.push(performance.now());
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: this._t('oni.mercy') + this._karmaTag(4) });
        this._updateMood();
        this._post({ type: 'AI_DEATH', targetId: id, peace: true });
    }

    _onCameraBlind(d) {
        this.karma = Math.min(100, this.karma + 2);
        this.context.merciesRecent.push(performance.now());
        const r = this._pickCtx('camera_mercy');
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: '🐉 ' + r.shown + this._karmaTag(2) });
        this._updateMood();
    }

    _onInitEntities(data) {
        this.monsters = {};
        this._post({ type: 'LOG_EVENT', logType: 'karma',
            text: this._t('oni.enter-domain') });
        this._updateMood();
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00243]
    // PANEL / UI TOUCH-POINT WATCH (user mandate 2026-06-15)
    // Oni-Baba watches every vending/slot panel touch point so the refactored
    // top-of-stack panels interact harmoniously. Clean touches soothe uiFriction;
    // a CLICK_LOST (an overlay stole a click) raises it. Sustained friction → a
    // throttled telemetry protest so the rough touch point surfaces instead of
    // silently degrading play. Telemetry is centralized via ENGINE_ANOMALY.
    // ══════════════════════════════════════════════════════════════════════════
    _onPanelTouch(d) {
        const ok = d && d.ok !== false;
        this.sensors.uiFriction = ok
            ? Math.max(0, this.sensors.uiFriction - 0.15)   // clean touch → soothe [REF#GP-00244]
            : Math.min(1, this.sensors.uiFriction + 0.10);  // failed touch → nudge up [REF#GP-00245]
        this._lastPanelTouch = { panel: (d && d.panel) || '?', action: (d && d.action) || '?', ok: ok };
        if (this.sensors.uiFriction > 0.6) this._panelFrictionProtest();
    }

    _onClickLost(d) {
        // A click that hit nothing because an overlay stole it — the exact [REF#GP-00246]
        // failure this panel refactor exists to kill. Raise friction; protest if rough.
        this.sensors.uiFriction = Math.min(1, this.sensors.uiFriction + 0.2);
        this._clickLostCount = (this._clickLostCount || 0) + 1;
        if (this.sensors.uiFriction > 0.6) this._panelFrictionProtest();
    }

    _panelFrictionProtest() {
        // Throttle to one protest / 8s so she flags the rough spot without spamming. [REF#GP-00247]
        const t = Date.now();
        if (t - (this._frictionProtestAt || 0) < 8000) return;
        this._frictionProtestAt = t;
        const last = this._lastPanelTouch || {};
        console.warn('[OniBaba] PANEL FRICTION high (uiFriction=' +
            this.sensors.uiFriction.toFixed(2) + ') — last touch:', last,
            '· clicks lost:', this._clickLostCount || 0);
        try {
            this._post({ type: 'ENGINE_ANOMALY', kind: 'PANEL_FRICTION',
                uiFriction: this.sensors.uiFriction, last: last, clicksLost: this._clickLostCount || 0 });
        } catch (_) {}
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00248]
    // MOOD + NARRATIVE
    // ══════════════════════════════════════════════════════════════════════════

    _updateMood() {
        let next = 'neutral';
        // Extreme forms — manifest at level 7 temple vault [REF#GP-00249]
        if (this.karma <= -90)      next = 'dragon_chaos';      // Chaotic Evil Black Dragon [REF#GP-00250]
        else if (this.karma <= -50) next = 'transcendent_dark';
        else if (this.karma <= -30) next = 'enraged';
        else if (this.karma >=  90) next = 'naga_blessed';      // Benevolent White Naga [REF#GP-00251]
        else if (this.karma >=  60) next = 'transcendent';
        else if (this.karma >=  30) next = 'benevolent';

        if (this.mood !== next) {
            const prev = this.mood;
            this.mood = next;
            this._refreshCombatParams(); // T0.26 — mood change → new combat modifiers [REF#GP-00252]
            this._post({ type: 'REALITY_SHIFT', mood: this.mood });
            // ── TRAJECTORY-AWARE SHIFT (Mark GO 2026-08-08): falling toward the Dragon and climbing [REF#GP-00253]
            // back toward the Naga are opposite journeys and must not share a sentence — the climb
            // line is the redemption ladder made audible (KARMA_BALANCE_PLAN §3B/§3D). Rank order is
            // the ladder in _updateMood's own conditions; direction is the sign of the rank change.
            const _RANK = { dragon_chaos: -3, transcendent_dark: -2, enraged: -1, neutral: 0,
                            benevolent: 1, transcendent: 2, naga_blessed: 3 };
            const _dir = (_RANK[next] ?? 0) - (_RANK[prev] ?? 0);
            this.context.moodDir = _dir < 0 ? -1 : 1;
            this._post({ type: 'LOG_EVENT', logType: 'karma',
                text: this._t(_dir < 0 ? 'oni.mood-shift-fall' : 'oni.mood-shift-rise', { mood: this.mood }) });

            // ── BOSS FORM TRIGGER ──────────────────────────────────────────── [REF#GP-00254]
            // Crossing into either extreme awakens her true level-7 vault form.
            if (next === 'dragon_chaos' || next === 'naga_blessed') {
                this._speak(next);
                this._post({
                    type: 'BOSS_FORM',
                    form: next === 'dragon_chaos' ? 'black_dragon' : 'white_naga',
                    alignment: next === 'dragon_chaos' ? 'chaotic_evil' : 'benevolent',
                    encounter: { level: 7, location: 'temple_vault' },
                    karma: this.karma,
                });
                this._post({ type: 'LOG_EVENT', logType: 'karma',
                    text: next === 'dragon_chaos'
                        ? this._t('oni.dragon-chaos')
                        : this._t('oni.balance-return')
                });
            }
        }
        // Forward karma in BOTH formats so any listener (including the SYNC_STATS thumb tint) stays current. [REF#GP-00255]
        this._post({ type: 'KARMA_UPDATE', karma: this.karma, mood: this.mood });
        this._post({ type: 'SYNC_STATS', karma: this.karma });
    }

    _speak(key) {
        const now = performance.now();
        // Global cooldown across EVERY _speak() call site (Mark 2026-08-12: "onibaba text is repeating [REF#GP-00256]
        // ... reduce amount of onibaba messages to 1x per 5 minutes, no sooner"). Was 4000ms — far too
        // short to stop the quote-box spam players were seeing. Knob: window._oniSpeakMs.
        const _rawSpeakMs = (typeof window !== 'undefined') ? Number(window._oniSpeakMs) : NaN;
        const _speakMs = Number.isFinite(_rawSpeakMs) ? _rawSpeakMs : 300000;
        if (now - this.lastSpoke < _speakMs) return; // don't spam [REF#GP-00257]
        this.lastSpoke = now;
        // The pick + de-dup + language swap now live in _pick(). `en` stays the id (ONIBABA_CONTEXT [REF#GP-00258]
        // is keyed by the English line); `shown` is what reaches the player.
        const { en, shown } = this._pick(key);
        if (!en) return;
        this._lastLine = en;
        const context = this._localContext(key, en);
        this._post({ type: 'LOG_EVENT', logType: 'karma', text: this._t('oni.speech', { text: shown }) });
        if (context) this._post({ type: 'LCD_EVENT', text: shown, context });
    }

    _roomFlavour(roomId) {
        // 8 flavour lines keyed in i18n.js (oni.room-flavour-0 .. 7). The [REF#GP-00259]
        // English fallback ensures the dungeon still says something sensible
        // even if i18n.js failed to load.
        const idx = ((roomId || 0) % 8 + 8) % 8;
        return this._t(`oni.room-flavour-${idx}`);
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00260]
    // ERROR / ANOMALY HANDLING WITH FUZZY SELF-CORRECTION
    // ══════════════════════════════════════════════════════════════════════════

    _anomaly(code, msg, data) {
        console.dir(data); // Inspect the raw data causing the anomaly. [REF#GP-02369]
        const now = performance.now();
        const entry = { code, msg, data, t: now, mood: this.mood };
        this._anomalies.push(entry);
        if (this._anomalies.length > 50) this._anomalies.shift();

        // ── PRIORITY-ERROR AGGREGATION (Mark 2026-06-03) ────────────────────── [REF#GP-00261]
        // Every call updates a per-code tally so COPY ALL can emit a full rundown
        // of the recurring problems we need to fix — even though the console
        // emission below is throttled. Any numeric in msg (e.g. render %) is
        // tracked as the peak severity for that code.
        this._anomalyStats = this._anomalyStats || {};
        let _s = this._anomalyStats[code];
        if (!_s) _s = this._anomalyStats[code] = { count: 0, first: now, last: now, lastMsg: msg, peak: 0 };
        _s.count++; _s.last = now; _s.lastMsg = msg;
        const _num = parseFloat((String(msg).match(/-?\d+(?:\.\d+)?/) || [])[0]);
        if (!isNaN(_num) && _num > _s.peak) _s.peak = _num;

        // Per-code emission throttle (2026-06-03): a sustained condition such as [REF#GP-00262]
        // render budget hovering ~100% calls this EVERY frame. Without a guard
        // that floods the console with hundreds of warns/sec, pins sensors.tension
        // to 1.0 (per-frame +0.3), and spams the panel LOG_EVENT. We still push to
        // history above every call so `recent` stays accurate, but the OUTPUTS
        // (console / tension bump / panel post) fire at most once per 2s per code.
        this._anomalyLastEmit = this._anomalyLastEmit || {};
        if (now - (this._anomalyLastEmit[code] || 0) < 2000) return;
        this._anomalyLastEmit[code] = now;

        // Fuzzy response: count recent anomalies of same type [REF#GP-00263]
        const recent = this._anomalies.filter(a => a.code === code &&
            now - a.t < 5000).length;

        if (recent >= 5) {
            // She's seen this 5+ times in 5s — escalate [REF#GP-00264]
            console.warn(`[OniBaba8] ANOMALY SURGE: ${code} × ${recent} — ${msg}`);
            this.sensors.tension = Math.min(1, this.sensors.tension + 0.3);
            this._post({ type: 'LOG_EVENT', logType: 'system',
                text: this._t('oni.anomaly', { code }) });
        } else {
            console.warn(`[OniBaba8] anomaly(${code}): ${msg}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════ [REF#GP-00265]
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /** [REF#GP-00266]
     * Auto-targeting: called by Engine8 before every card/missile/spell launch.
     * Finds the nearest live monster, registers the attack with OniBaba's
     * combat pipeline (hive-mind, dodge, retaliate), and returns the wrapper
     * so the engine can aim the projectile at it.
     *
     * @param {number} px  player world X
     * @param {number} pz  player world Z
     * @param {Array}  wrappers  monsterWrappers array from Engine8
     * @param {string} cardName  card/action name for hive-mind tracking
     * @param {number} dmg       damage value already rolled
     * @returns {Object|null}    monster wrapper, or null if none in range
     */
    /* [REF#GP-00267]
     * CombatOrchestrator integration (Phase 1 stub — Phase 3 fills in).
     * The orchestrator at js/v8/combat/CombatOrchestrator.js will call
     * this method (and a future requestDamageMultiplier sibling) to ask
     * OniBaba what mood/mastery/floor-decay multiplier should be applied
     * before final damage is computed. Today CardExecutor still applies
     * the multiplier itself — Phase 3 moves it here.
     */
    requestDamageMultiplier(/* cardName, attackKind */) {
        // Phase 1 stub: return 1.0 (no modification). The actual [REF#GP-00268]
        // floor-decay 1.5→0.9 logic still lives in CardExecutor.js.
        // Phase 3 will move the active formula here.
        return 1.0;
    }

    getAutoTarget(px, pz, wrappers, cardName, dmg, hasLOS) {
        if (!wrappers || wrappers.length === 0) return null;

        // Find nearest live monster with clear line-of-sight. Aiming through [REF#GP-00269]
        // walls ruins gameplay — a missile MUST resolve to something the player
        // can actually see. The engine owns the map, so it passes an LOS
        // predicate (px, pz, mx, mz) → bool. If no predicate is provided we
        // fall back to "any monster" so legacy callers don't break.
        let best = null, bestDist = Infinity;
        for (const w of wrappers) {
            if (w.userData?.isDead || w.userData?.isAlly) continue;
            const dx = w.position.x - px;
            const dz = w.position.z - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d >= bestDist) continue;
            if (hasLOS && !hasLOS(w.position.x, w.position.z)) continue;
            bestDist = d; best = w;
        }
        if (!best) return null;

        // Notify OniBaba's combat pipeline so she tracks, can dodge, and retaliates [REF#GP-00270]
        const id = best.userData?.id || best.uuid;
        this._onCombatAttack({
            targetId:   id,
            targetHp:   best.userData?.hp ?? 50,
            damage:     dmg ?? 10,
            attackType: cardName || 'card',
        });

        this.sensors.silence = 0;
        return best;
    }

    _post(msg) {
        // ── Narration governor (HQ Alarm 2026-05-26) ── [REF#GP-00271]
        // While FPS is in trouble, swallow non-critical LOG_EVENTs so we
        // don't add DOM work to a struggling frame. "Critical" means logs
        // that report ALARM state itself OR damage/karma channels — those
        // are essential signal. Everything else (system chatter / combat
        // tick narration) gets dropped while gated.
        if (this._narrationGated && msg?.type === 'LOG_EVENT') {
            const t = (msg.logType || '').toLowerCase();
            const txt = msg.text || '';
            const isCritical =
                t === 'damage' ||
                t === 'karma' ||
                /Oni-Baba/i.test(txt) ||  // her own protests must pass
                /alarm|protest|regression|recovery/i.test(txt);
            if (!isCritical) return;
        }
        // ── DO NOT SPAM THE PLAYER (Mark 2026-08-12: "onibaba text is repeating - that is a [REF#GP-00272]
        //    violation. dont spam users.") ────────────────────────────────────────────────────────
        //    HERE, NOT AT THE CALL SITES, AND THAT IS THE POINT. Every line Oni-Baba utters — karma,
        //    system, speech, protests, the wager banter — funnels through this ONE method. Guarding
        //    the ~14 _post call sites individually would mean fourteen chances to forget the guard on
        //    the fifteenth, which is how the repetition arrived in the first place: nothing anywhere
        //    asked "have I already said this?".
        //    THE RULE IS IDENTICAL TEXT WITHIN A WINDOW, not "similar". A line whose text differs —
        //    a different monster name, a different amount of gold — is a different event and passes
        //    untouched. What gets dropped is the SAME sentence arriving twice while it is still on
        //    screen, which is exactly what a player reads as spam.
        //    ⚠ WINDOW DELIBERATELY SHORT (15s). A long window would swallow legitimately recurring
        //      feedback — the same combat line on a genuinely separate exchange a minute later is
        //      information, not noise. This kills the tick-loop repeat without editing what the game
        //      is allowed to tell you.
        //    Knobs: window._oniRepeatMs = 0 disables the guard entirely; any positive number retunes
        //    the window. window._oniRepeatsBlocked is the probe handle — a count that must be able to
        //    prove the guard actually fired rather than being assumed to work.
        //    ⚠ 2026-08-12 FOLLOW-UP: LCD_EVENT was NEVER covered. _speak() posts TWO messages per line
        //    — the LOG_EVENT quote AND a separate LCD_EVENT carrying the plain-English tip beneath it
        //    (~:2144). The guard above only matched 'LOG_EVENT', so every tip line repeated on screen
        //    with zero de-dup even while its paired quote was correctly being blocked — exactly the
        //    "Enemies may hear your movement" / "Oni-Baba is watching" repeats Mark's screenshot showed.
        //    Same key, same window, same map: a tip and a quote never collide (different text), so one
        //    Map safely covers both channels.
        if (msg && (msg.type === 'LOG_EVENT' || msg.type === 'LCD_EVENT')) {
            const _key = String(msg.text == null ? '' : msg.text);
            const _rawWin = (typeof window !== 'undefined') ? Number(window._oniRepeatMs) : NaN;
            const _win = Number.isFinite(_rawWin) ? _rawWin : 15000;
            if (_key && _win > 0) {
                const _now = Date.now();
                if (!this._saidAt) this._saidAt = new Map();
                const _last = this._saidAt.get(_key);
                if (_last !== undefined && (_now - _last) < _win) {
                    if (typeof window !== 'undefined') {
                        window._oniRepeatsBlocked = (window._oniRepeatsBlocked || 0) + 1;
                    }
                    return;   // she already said this, and it is still on screen [REF#GP-00273]
                }
                this._saidAt.set(_key, _now);
                // Bounded: a long session must not accumulate every sentence ever spoken. [REF#GP-00274]
                if (this._saidAt.size > 240) {
                    for (const [_k, _t] of this._saidAt) if (_now - _t >= _win) this._saidAt.delete(_k);
                }
            }
        }
        if (typeof window !== 'undefined') {
            // ── ONE MESSAGE, ONE IDENTITY (Mark 2026-08-30: "event log is still showing duplicate [REF#GP-00313]
            //    entries, why?") ──────────────────────────────────────────────────────────────────
            //    EVERY message below leaves by TWO paths that both reach the panels document:
            //      (a) window.postMessage → the shell's switch in NewOrigami.9.html relays LOG_EVENT /
            //          LCD_EVENT (and 6 more types) on to the panels iframe;
            //      (b) the direct panels.contentWindow.postMessage a few lines down.
            //    Panels has ONE receiver, so it fired twice and appended the same row twice — the
            //    duplicated quote+tip pair in his screenshot.
            //    MEASURED inside the panels document: 8 of the 12 types this method emits arrived
            //    twice (LOG_EVENT, LCD_EVENT, COMBAT_UPDATE, AI_DEATH, SYNC_STATS, REALITY_SHIFT,
            //    MONSTER_ATTACK, KARMA_UPDATE); the other 4 arrived once and depend on path (b).
            //    ⚠ NEITHER PATH MAY SIMPLY BE DELETED, and this is why the obvious fixes are wrong:
            //      · drop (b) → the 4 types the shell does not relay never reach Panels at all;
            //      · drop the shell relay → every ENGINE-sourced LOG_EVENT dies, because the engine
            //        posts via window.parent.postMessage and the relay is its only route.
            //      Measured: the ENGINE frame gets 0 from the relay and 1 from (b), so (b) is the
            //      engine's ONLY path and must stay exactly as it is.
            //    So the duplicate is killed by IDENTITY, not by cutting a wire: each message gets a
            //    unique id here, and the panels receiver ignores an id it has already handled. This
            //    covers all 8 types and every type added later, and it hard-codes the shell's relay
            //    list in NOBODY — a copy of that list would be the next thing to drift.
            //    ⚠ NOT the same thing as the 15s repeat guard above. That one asks "did she already
            //      SAY this?" and it works (probe-oni-lcd-repeat.js passes). This one asks "is this
            //      the SAME UTTERANCE arriving twice?" — a different question, one hop downstream.
            try {
                if (msg && typeof msg === 'object' && msg.__oniMsgId === undefined) {
                    if (!this._oniMsgSeq) this._oniMsgSeq = 0;
                    if (!this._oniMsgSalt) this._oniMsgSalt = 'o' + Math.random().toString(36).slice(2, 8);
                    msg.__oniMsgId = this._oniMsgSalt + '-' + (++this._oniMsgSeq);
                }
            } catch (_) {}
            window.postMessage(msg, '*');
            // Directly broadcast to sibling iframes if OniBaba8 is running in the parent window [REF#GP-00275]
            const fpv = document.getElementById('engine-iframe');
            const panels = document.getElementById('panels-iframe');
            if (fpv && fpv.contentWindow) {
                fpv.contentWindow.postMessage(msg, '*');
            }
            if (panels && panels.contentWindow) {
                panels.contentWindow.postMessage(msg, '*');
            }
        }
    }
}

// ── Fuzzy math helpers ──────────────────────────────────────────────────────── [REF#GP-00276]
function _clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v)); }
function _lerp(a, b, t)         { return a + (b - a) * _clamp(t); }

// ── Narrative context hints (what each line means for the player) ───────────── [REF#GP-00277]
// Displayed beneath the purple speech line as a plain-English player tip.
const ONIBABA_CONTEXT = {
    // neutral [REF#GP-00278]
    'Old stone breathes slow. Walk gently, little one.':
        'The dungeon is alive — stay alert, something may shift.',
    'A lantern leans your way. I am watching, kindly.':
        'Oni-Baba is watching. Your choices here shape karma.',
    'Greater feet have worn these steps. Rest when you need to.':
        'You are not the first — overconfidence costs lives.',
    'The dark has ears tonight, and they are friendly ones.':
        'Enemies may hear your movement. Slow down near corners.',
    // enraged [REF#GP-00279]
    'Snow falls on the fallen. I wish you had chosen otherwise.':
        'Killing recklessly raises tension — monsters grow bolder.',
    'Each death ripples back. The pond remembers, child.':
        'Each kill costs −1 Karma. Fleeing kills cost −2.',
    'The walls draw close when kindness leaves. Come back to it.':
        'Low karma narrows your options — consider mercy.',
    'I would rather guide you home than mourn you here.':
        'Oni-Baba is enraged. Expect harder hits and cancelled cards.',
    // benevolent [REF#GP-00280]
    'Kindness spreads like plum blossom. Even stone remembers.':
        'High karma opens peaceful paths and loot bonuses.',
    'Your mercy warms the lantern oil.':
        'Past mercy can unlock favourable room events.',
    'The monsters hum your name the way one hums a song.':
        'Some enemies may parley instead of fighting.',
    'Mercy is the rarest bloom down here. Yours has opened.':
        'Sparing a monster restores karma and surprises the hive.',
    // transcendent [REF#GP-00281]
    'Still water, clear moon. This place is yours to walk.':
        'Your karma is transcendent — the dungeon yields its secrets.',
    'The dungeon bows as grass bows. Go gently, child.':
        'Oni-Baba grants blessing; expect generous loot and safe passage.',
    // transcendent_dark [REF#GP-00282]
    'No mercy left in these stones, yet I keep one light lit for you.':
        'Dark transcendence — the dungeon itself is hostile to you.',
    'You became what you hunted. Turn back; I will wait.':
        'Karma is at its lowest. Every creature will hunt you.',
    // enraged_cancel [REF#GP-00283]
    'enraged_cancel':
        'Oni-Baba cancelled your action — regain karma to stop her interference.',
    // benevolent_bless [REF#GP-00284]
    'enraged_bless':
        'A karma bonus empowers your next action.',
    // dragon_chaos [REF#GP-00285]
    'dragon_chaos':
        'The Black Dragon has awakened. Reach floor 7 to face the reckoning.',
    // naga_blessed [REF#GP-00286]
    'naga_blessed':
        'The White Naga stirs. Ascend to floor 7 to claim your blessing.',
};

// ── THE LCD SIDE-CHANNEL IN JAPANESE (Mark 2026-08-10: "all onibaba event log text = needs [REF#GP-00287]
//    localization") ──────────────────────────────────────────────────────────────────────────────
//    These 20 tips were the last wholly-untranslated Oni-Baba surface: ONIBABA_LINES already had its
//    JA mirror (ONIBABA_LINES_JA) but the LCD context that rides alongside each line did not, so a
//    JA player read her narration in Japanese and the explanation under it in English.
//
//    ⚠ KEYED BY THE ENGLISH LINE, exactly like ONIBABA_CONTEXT — the English string is the stable id
//      (see the _pick contract, ~:390: `en` must not change with the language or the LCD side-channel
//      and the de-dup both break). This table is looked up with the SAME id, never with `shown`.
//    ⚠ A missing entry falls back to the English tip, so a partial translation degrades to today's
//      behaviour rather than to a blank LCD.
//    ⚠ VOICE: she is imperious, amused and old — お前 / 小さき者, never flat 敬語. Same rule the
//      ONIBABA_LINES_JA header states. Do not sand this into polite corporate Japanese.
const ONIBABA_CONTEXT_JA = {
    // neutral [REF#GP-00288]
    'Old stone breathes slow. Walk gently, little one.':
        '迷宮は生きている——気を抜くな、何かが動く。',
    'A lantern leans your way. I am watching, kindly.':
        'オニババが見ている。お前の選択が業を刻む。',
    'Greater feet have worn these steps. Rest when you need to.':
        'お前が初めてではない——驕りは命で払うことになる。',
    'The dark has ears tonight, and they are friendly ones.':
        '闇は足音を聞いている。曲がり角では歩を緩めよ。',
    // enraged [REF#GP-00289]
    'Snow falls on the fallen. I wish you had chosen otherwise.':
        '無闇に殺せば緊張が高まる——魔物はより大胆になる。',
    'Each death ripples back. The pond remembers, child.':
        '一殺につき業−1。逃げる者を斬れば−2だ。',
    'The walls draw close when kindness leaves. Come back to it.':
        '業が低ければ道は狭まる——慈悲を考えよ。',
    'I would rather guide you home than mourn you here.':
        'オニババは激怒している。痛撃と札の妨害を覚悟せよ。',
    // benevolent [REF#GP-00290]
    'Kindness spreads like plum blossom. Even stone remembers.':
        '高い業は安寧の道と戦利品の恵みを開く。',
    'Your mercy warms the lantern oil.':
        'かつての慈悲が、良き出来事を呼ぶことがある。',
    'The monsters hum your name the way one hums a song.':
        '戦わずに話に応じる敵もいる。',
    'Mercy is the rarest bloom down here. Yours has opened.':
        '魔物を見逃せば業が戻り、巣は動揺する。',
    // transcendent [REF#GP-00291 → see REF#GP-00281]
    'Still water, clear moon. This place is yours to walk.':
        'お前の業は超越した——迷宮はその秘密を明かす。',
    'The dungeon bows as grass bows. Go gently, child.':
        'オニババが加護を与える。豊かな戦利品と安全な道を。',
    // transcendent_dark [REF#GP-00292 → see REF#GP-00282]
    'No mercy left in these stones, yet I keep one light lit for you.':
        '暗黒の超越——迷宮そのものがお前を憎んでいる。',
    'You became what you hunted. Turn back; I will wait.':
        '業は底を打った。すべての生き物がお前を狩る。',
    // enraged_cancel [REF#GP-00293 → see REF#GP-00283]
    'enraged_cancel':
        'オニババがお前の行いを打ち消した——業を取り戻さねば邪魔は続く。',
    // benevolent_bless [REF#GP-00294]
    // ⚠ KEY IS 'enraged_bless' — a known typo in ONIBABA_CONTEXT above (the pool is named
    //   benevolent_bless, so _speak('benevolent_bless') never finds it and this tip never fires).
    //   Mirrored verbatim so the two tables stay key-identical; fixing the typo is a separate change
    //   that must move BOTH tables together.
    'enraged_bless':
        '業の恵みが次の一手を強める。',
    // dragon_chaos [REF#GP-00295 → see REF#GP-00285]
    'dragon_chaos':
        '黒龍が目覚めた。第七層にて決着をつけよ。',
    // naga_blessed [REF#GP-00296 → see REF#GP-00286]
    'naga_blessed':
        '白蛇が動いた。第七層へ昇り、加護を受け取れ。',
};

// ── Narrative lines ─────────────────────────────────────────────────────────── [REF#GP-00297]
const ONIBABA_LINES = {
    neutral: [
        'Old stone breathes slow. Walk gently, little one.',
        'A lantern leans your way. I am watching, kindly.',
        'Greater feet have worn these steps. Rest when you need to.',
        'The dark has ears tonight, and they are friendly ones.',
    ],
    enraged: [
        'Snow settles on the fallen, and on my sleeves. Come — walk a while with me, and let it melt.',
        'The pond remembers every ripple, child. It also remembers when the water goes still again. Let it.',
        'The walls lean in when kindness leaves a room. Say one kind thing and watch them straighten.',
        'I would much rather guide you home than fuss over you here. Home is that way. Shall we?',
    ],
    benevolent: [
        'Kindness spreads like plum blossom. Even stone remembers.',
        'Your mercy warms the lantern oil.',
        'The monsters hum your name the way one hums a song.',
        'Mercy is the rarest bloom down here. Yours has opened.',
    ],
    transcendent: [
        'Still water, clear moon. This place is yours to walk.',
        'The dungeon bows as grass bows. Go gently, child.',
    ],
    transcendent_dark: [
        'It has grown dark in here, little wanderer — so I have lit an extra lantern. It is for you. It always was.',
        'You have wandered a long way from the gentle road. It is still there. Old women know every path back.',
    ],
    enraged_cancel: [
        'Oni-Baba\'s hand closes softly over yours. Not this one, child.',
        'The dark swallows that strike — and hands it back to you, unspent.',
    ],
    benevolent_bless: [
        'Oni-Baba blesses your action.',
        'A warm wind guides your hand.',
    ],
    dragon_chaos: [
        'I AM THE BLACK DRAGON. The vault is your tomb.',
        'You chose blood. Now meet the wings of your reckoning.',
        'Climb to the seventh floor, little murderer. I am waiting.',
        'No mercy was given. None shall be returned.',
    ],
    naga_blessed: [
        'Rise, child. The white naga has heard your kindness.',
        'You have earned the temple vault\'s blessing.',
        'Ascend to the seventh floor — I will grant you the gift you have already given.',
        'Mercy made flesh. The serpent of light coils to greet you.',
    ],

    welcome_guide: [
        'Ah, you open the ancient scroll. Learn my ways, little wanderer.',
        'Study these pages carefully. The Underworld has a logic all its own.',
        'Knowledge is your best armor in my shifting paper maze.',
        'Read the instructions, folder of destiny — Oni-Baba is watching.',
    ],

    // ── KILL WITNESS, CONTEXT-BUCKETED (Mark GO 2026-08-08: "consolidate her context awareness") ── [REF#GP-00298]
    // Replaces the single fixed i18n line 'oni.kill-witness' — the fortieth kill must not read like
    // the first. _pickCtx walks streak → dark → first → base; a bucket can be grown or removed without
    // touching the resolver. ⚠ NO PRICE TAGS IN THESE LINES — "−1 Karma" is appended in _onMonsterDeath
    // so no entry here can accidentally drop the legibility. LORE (Mark, same day): Starlette is her
    // eyes and ears — the watching in these lines is the singer's.
    kill_witness: [
        'The singer saw it, so I saw it. Every creature down here had a story. Next time, you might hear it first.',
        'That is done, and cannot be undone. But the next choice is still yours — pick the one you would be proud of.',
        'The stones keep count, kindly. There is always a gentler road, and it is never closed to you.',
        'My eyes on that stage do not blink, child. Not to shame you — to remind you someone believes you can do better.',
    ],
    kill_witness_first: [
        'So — your first. Every wanderer meets this moment. What you do with the second is what tells me who you are.',
        'The first. The singer will tell me if there is a second. I am hoping she has nothing to tell.',
    ],
    kill_witness_streak: [
        'Again, and again. Breathe, little one. The song in the cabaret falters when you rush like this.',
        'You are not fighting any more — you are just swinging. Stop. Look. There may be another way through.',
        'I have not stopped warning you, and I never will. That is what it means to be watched over.',
    ],
    kill_witness_dark: [
        'Yes. This is what you are now.',
        'The dark does not even flinch for you any more.',
    ],

    // The flash that pacifies instead of the blade that doesn't (Mark 2026-08-09, +2). ⚠ no price [REF#GP-00299]
    // tags in-pool — "+2 Karma" is appended in _onCameraBlind.
    song_empty: [
        'The singer tells me her set is empty. Somewhere on this floor a song is waiting to be found — bring it to her, little wanderer.',
        'Starlette has run out of songs. She says the dungeon keeps music like treasure. Go and find her one.',
        'The stage is quiet tonight. My singer is hoping you will bring her something new to sing.',
        'A cabaret with no song is a sad thing. There are music cards hidden down here — she is counting on you.',
    ],
    camera_mercy: [
        'Light, not blood. The blinded forget their anger — and I remember that you let them.',
        'A flash. A stumble. No corpse. The singer approves of this kind of weapon.',
        'You stole its sight and left its life. Clever, and kind — a rare pairing down here.',
    ],

    // ── WAGER VOICES, lifted out of three inline arrays inside _onMessage (2026-07-28) ──────────── [REF#GP-00300]
    // They were declared in the middle of the WAGER_OPEN / WAGER_RESULT cases with their own copy of
    // the pick-a-random-line logic. Out here they get the same localisation path as every other pool
    // and there is one picker instead of four.
    wager_open: [
        '…place your bet carefully, little one. My children are watching.',
        '…my sentinels encircle the gaming table. No cheating in my halls.',
        '…the wager begins. Guard your honour as my henchmen guard this room.',
    ],
    wager_win: [
        '…well played. The goblin\'s gold passes to wiser hands.',
        '…fortune bows to you tonight. Savour it.',
        '…your skill honours this hall. The goblin will learn.',
    ],
    // A win while she is dark-tier reads BEGRUDGING — the table still pays, but she does not warm. [REF#GP-00301]
    // (Slice 2, Mark GO 2026-08-08. The _dark suffix is the same _pickCtx bucket the kill lines use.)
    wager_win_dark: [
        '…you win. Coins do not wash hands, little one.',
        '…take the gold. The singer still remembers what she saw.',
    ],
    wager_lose: [
        '…the dice took it back tonight. They do that. Come back when your pockets are ready, not before.',
        '…even the clever ones fall to fortune’s whim. Fortune is a fickle old friend of mine.',
        '…do not wager what you cannot afford to lose, little one. The goblin certainly does not.',
    ],
    // A loss while dark-tier reads MOCKING — even luck has turned its back. [REF#GP-00302]
    wager_lose_dark: [
        '…even fortune will not sit at a table with you now.',
        '…the dice know what you are. They said so.',
    ],
    // The third unprovoked strike in a minute must not read like the first (slice 2 — same family [REF#GP-00303]
    // shape as kill_witness; price tag appended in _onNeutralStrike, never written here).
    struck_innocent: [
        'It had not raised a hand. Kindness costs nothing to try first, child.',
        'Unprovoked. Marked — but marks fade, if what comes next is gentler.',
        'That one was only minding its shift, little wanderer. A word would have done.',
    ],
    struck_innocent_streak: [
        'You are striking everything that moves. Slow down — the floor is not your enemy. Fear is.',
        'The whole floor has learned to flinch at your step. Show them they were wrong to.',
    ],
    struck_innocent_dark: [
        'Of course you did.',
        'The innocent are just targets to you now. Noted.',
    ],

    // ── Constructor protocol voices ───────────────────────────────────────── [REF#GP-00304]
    // Oni-Baba narrates the v8 build itself. She is the engine; the engine is hers.
    constructor_announce: [
        'I feel a new beam being raised. {task} begins.',
        'The constructor stirs. Task {task} — I am watching.',
        'A craftsman enters my halls. {task} commences.',
        'You shape me again. {task}.',
    ],
    constructor_validate: [
        'Test the seams. I will know if you cut a corner.',
        'Validation begins. Show me the work.',
        'I taste the new code. Let it prove itself.',
    ],
    constructor_pass: [
        'The seams hold. {task} passes.',
        'Good. The world stays whole. {task} is sealed.',
        'I approve. {task} has earned its place.',
    ],
    constructor_fail: [
        'A gate has broken. {task} must be undone.',
        'No. Roll back. The dungeon will not accept {task} like this.',
        'The seam splits. {task} fails. Try again, craftsman.',
    ],
    constructor_commit: [
        'It is written. {task} joins the bones of this place.',
        'The dungeon remembers {task} forever now.',
        '{task} is mine now. The world grows.',
    ],
};

// ── HER VOICE IN JAPANESE (Mark 2026-07-28: "a plan to localize all onibaba event log text … just [REF#GP-00305]
//    the text displayed in the events") ────────────────────────────────────────────────────────────
// ⚠ ENGLISH STAYS CANONICAL AND THIS IS A MIRROR, KEYED AND INDEXED IDENTICALLY. That is not a style
// choice — `ONIBABA_CONTEXT[text]` (used by _speak for the LCD side-channel) is keyed BY THE ENGLISH
// LINE. Translating in place would have silently broken every context lookup: the log would read
// correctly in Japanese while the LCD quietly stopped matching. So the picker chooses an INDEX
// against the English pool, keeps the English string as the id, and swaps only what is displayed.
// A missing key or index here falls back to English — a half-translated pool degrades to the current
// behaviour rather than to a blank line.
//
// NOT MIRRORED ON PURPOSE: the `constructor_*` pools. Those are build-time narration that shows up in
// smoke output and COPY-ALL dumps, and Japanese there would make the diagnostics harder for both of
// us to read against the code — the same reasoning Mark applied when he scoped the engine's `system`
// lines out of this pass. Say the word and they take four more entries.
//
// ⚠ PRESERVE THE VOICE. She is imperious, amused and old; she calls the player 小さき者 / 童 rather
// than anything polite. Do not sand this down into flat 敬語 — the humour and the menace ARE the
// character (CLAUDE.md: never sanitise the Japanese humour).
const ONIBABA_LINES_JA = {
    neutral: [
        '古き石がゆるり息づく。そっと歩め、小さき者。',
        '灯りがお前へ傾く——ばばが見ておるぞ、優しくな。',
        'もっと大きな足がこの段を磨いた。疲れたら休め。',
        '今宵の闇の耳は、やさしい耳よ。',
    ],
    enraged: [
        '倒れし者にも、ばばの袖にも雪が積もる。さあ、少し一緒に歩こう。溶けるまで。',
        '池はさざ波をひとつ残らず覚えておるよ、童。水がまた静まる時も、ちゃんと覚えておる。静めておやり。',
        '部屋から優しさが去ると、壁が寄ってくる。優しい言葉をひとつ言うてごらん。壁が背筋を伸ばすから。',
        'ここで世話を焼くより、家まで送ってやりたいのだ。家はあちらじゃ。行くかい？',
    ],
    benevolent: [
        '優しさは梅のごとく広がる。石さえ覚えている。',
        'お前の慈悲が灯りの油を温める。',
        '魔物どもが唄うようにお前の名を口ずさむ。',
        '慈悲はここで最も稀な花。お前のそれが開いた。',
    ],
    transcendent: [
        '静かな水、澄んだ月。この地はお前のもの。',
        '迷宮は草のごとく頭を垂れる。そっと行け、童。',
    ],
    transcendent_dark: [
        'ここもずいぶん暗くなったねえ、小さき彷徨い人よ。だから灯りをひとつ余分に点けておいた。お前のためじゃ。はじめからそうだった。',
        '優しい道からずいぶん遠くまで来たものだ。道はまだそこにある。婆というものは、戻り道を全部知っておる。',
    ],
    enraged_cancel: [
        '鬼婆の手が、そっとお前の手を包む。これは、やめておこう、童。',
        '闇がその一撃を呑み込み——使わぬまま、お前に返す。',
    ],
    benevolent_bless: [
        '鬼婆がお前の行いを祝福する。',
        '温かな風がお前の手を導く。',
    ],
    dragon_chaos: [
        '我こそは黒龍。この蔵はお前の墓所となる。',
        '血を選んだな。ならば報いの翼を受けよ。',
        '第七階まで登ってこい、小さき人殺しよ。待っておるぞ。',
        '慈悲は与えられなかった。ならば返されもせぬ。',
    ],
    naga_blessed: [
        '立て、童よ。白き龍蛇がお前の優しさを聞き届けた。',
        'お前は神殿の蔵の祝福を得た。',
        '第七階へ昇れ — お前が既に与えたものを、我が授けよう。',
        '慈悲が形を成した。光の蛇がとぐろを巻いて出迎える。',
    ],
    welcome_guide: [
        'ほう、古の巻物を開いたか。我が流儀を学ぶがよい、小さき彷徨い人よ。',
        'この頁をよく読め。地獄には地獄の理がある。',
        '知識こそ、この移ろう紙の迷宮での最良の鎧よ。',
        '手引きを読め、運命を折る者よ — 鬼婆が見ておるぞ。',
    ],
    // 殺しの証人 — index-twins of the EN kill_witness family. Voice law: imperious, amused, old — [REF#GP-00306]
    // 小さき者・童, never polite. The watching is Starlette's (Mark: she is Oni-Baba's eyes and ears).
    kill_witness: [
        '歌姫が見ておった。ならば私も見ておった。ここの生き物にはみな物語があってねえ。次は先に聞いてやれるかもしれん。',
        '済んだことは、もう戻せぬ。けれど次の選択はまだお前のもの。胸を張れる方を選んでごらん。',
        '石は数えておるよ、やさしくね。もっと穏やかな道はいつでもある。閉じることは決してない。',
        'あの舞台の上の我が眼は瞬きをせぬ、童。責めるためではない。お前ならもっと良くやれると信じておる者がいる、と思い出させるためじゃ。',
    ],
    kill_witness_first: [
        'ほう——初めてじゃな。彷徨い人はみなこの時を迎える。二度目をどうするかで、お前が誰なのかが分かる。',
        '一度目。二度目があれば歌姫が教えてくれる。何も告げることがないよう、願っておるよ。',
    ],
    kill_witness_streak: [
        'また、また。息をおし、小さき者よ。そう急ぐと、酒場の歌が途切れる。',
        'もう戦っておらぬ——ただ振り回しておるだけじゃ。止まれ。見よ。別の道があるやもしれぬ。',
        '警告をやめたことなど一度もない。これからもやめぬ。見守られるとは、そういうことじゃ。',
    ],
    kill_witness_dark: [
        'そうだ。それが今のお前よ。',
        '闇はもう、お前に眉ひとつ動かさぬ。',
    ],
    song_empty: [
        '歌姫が言うておる、持ち歌が尽きたと。この階のどこかに歌が眠っておる — 見つけて届けてやれ、小さき彷徨い人よ。',
        'スターレットの歌が尽きた。迷宮は音楽を宝のように隠しておるそうな。探して来てやれ。',
        '今宵の舞台は静かじゃ。わしの歌姫は、お前が新しい歌を持ってくるのを待っておる。',
        '歌のないキャバレーは寂しいものよ。この地には音楽のカードが隠れておる — 歌姫はお前を頼りにしておるぞ。',
    ],
    camera_mercy: [
        '血ではなく、光か。目を眩まされた者は怒りを忘れる — 見逃したこと、覚えておくぞ。',
        '閃光。よろめき。骸は無し。歌姫はそういう得物を好むそうな。',
        '視力を奪い、命は残したか。賢く、そして優しい — 冥界では珍しい取り合わせよ。',
    ],
    wager_open: [
        '…慎重に賭けよ、小さき者。我が子らが見ておる。',
        '…我が番人どもが卓を囲んでおる。この館で不正は許さぬ。',
        '…賭けの始まりだ。我が手下がこの部屋を守るように、己の誇りを守れ。',
    ],
    wager_win: [
        '…見事。ゴブリンの金貨は賢き手に渡ったな。',
        '…今宵は運がお前に傅いておる。味わうがよい。',
        '…お前の技はこの館の誉れよ。ゴブリンも学ぶであろう。',
    ],
    wager_win_dark: [
        '…勝ったか。金貨で手は洗えぬぞ、小さき者。',
        '…金は持っていけ。歌姫は見たものを忘れておらぬ。',
    ],
    wager_lose: [
        '……今夜は賽が取り返していった。よくあることさ。懐の支度ができてから、またおいで。',
        '……賢い者でも運の気まぐれには敵わぬ。運はばばの気まぐれな古い友じゃ。',
        '……失えぬものを賭けてはならぬよ、小さき者。小鬼は決してそうせぬ。',
    ],
    wager_lose_dark: [
        '…もはや運すら、お前と卓を囲まぬわ。',
        '…賽の目はお前の正体を知っておる。そう告げたのだ。',
    ],
    struck_innocent: [
        'あれは手を上げてなどおらなんだ。まず優しさを試すのに、銭はいらぬよ、童。',
        '無抵抗の相手に。印はついた——けれど印は薄れる。次がもっと穏やかならば。',
        'あれは仕事の最中だっただけじゃ、小さき彷徨い人よ。ひと言で済んだものを。',
    ],
    struck_innocent_streak: [
        '動くものすべてに斬りかかっておる。ゆっくりおし——床はお前の敵ではない。恐れが敵じゃ。',
        '階じゅうがお前の足音にすくむようになった。それが思い違いだったと、見せてやりなさい。',
    ],
    struck_innocent_dark: [
        'であろうな。',
        'お前にとって無辜の者はただの的か。覚えておく。',
    ],
};

// ── PEDESTAL POLICY — the monster combat-visual language, as data ───────────── [REF#GP-00307]
// (Centralization 2026-06-11, per knowledge/ONIBABA_PEDESTAL_CIRCLE_CENTRALIZATION_2026-06-11.md §4.3)
//
// The glowing "circle" under every monster (the monBase pedestal) is the player's
// read-out of Oni-Baba's combat state: idle / hostile / ally / gaming / selected.
// Oni-Baba OWNS THE POLICY (which monster-state resolves to which pedestal cue, and
// the priority between them) — declared here as semantics. The ENGINE owns the DRAW
// (it maps each key to the shared three.js materials + executes per-frame). No scene
// reach-in from this worker; this is pure data so it can cross the iframe boundary.
//
// Priority (highest wins): selected > gaming > hostile > ally > idle.
//   - selected : this monster is the player's locked target (target reticle + yin-yang core)
//   - gaming   : parley / approach_gaming, OR the active WAGER dealer while the guidebook
//                is open (keeps the roulette wheel spinning for the whole gambling session)
//   - hostile  : ud.isHostile
//   - ally     : ud.isAlly
//   - idle     : default neutral
//
// `bloom` / `light` are declared for documentation + future order-driven cues; the
// per-frame engine applier intentionally does NOT rewrite bloom/foot-light each frame
// (those are set by Oni-Baba's order handlers + the proximity light-budget cull — see
// the applyPedestalState comment in Engine8). 'keep' = leave whatever the last order set.
const ONIBABA_PEDESTAL_POLICY = {
    priority: ['selected', 'gaming', 'hostile', 'ally', 'idle'],
    states: {
        idle:     { semantics: 'neutral / unaware',             bloom: 'cyan', light: 0.0 },
        hostile:  { semantics: 'aggressive — chasing/attacking', bloom: 'red',  light: 0.8 },
        ally:     { semantics: 'befriended companion',          bloom: 'cyan', light: 0.0 },
        gaming:   { semantics: 'parley / wagering at the wheel', bloom: 'keep', light: 'keep' },
        selected: { semantics: 'player target-lock',            bloom: 'keep', light: 'keep' },
    },
    // Oni-Baba orders that explicitly re-paint the circle (handled in Engine8 _applyOniBabaOrder). [REF#GP-00308]
    orderCues: { hostile: 'hostile', rally: 'ally', protect_wager: 'ally', pardon: 'idle' },
};
// Expose on the class + window so Engine8 (cross-iframe) can read the policy via parent. [REF#GP-00309]
OniBaba8.PEDESTAL_POLICY = ONIBABA_PEDESTAL_POLICY;
window.ONIBABA_PEDESTAL_POLICY = ONIBABA_PEDESTAL_POLICY;

// ── Singleton ───────────────────────────────────────────────────────────────── [REF#GP-00310]
// Engine8 sets window.Engine8 after boot; she'll auto-connect
window.oniBaba8 = new OniBaba8(null);

/* The instance the module itself booted is the canonical one; anything else claiming to be her is [REF#GP-00377]
 * not, however genuinely constructed. Exposing the CHECK is safe — the WeakSet and the canonical
 * reference never leave this closure, so a caller can ask the question but cannot answer it falsely.
 * The check is pinned non-writable and non-configurable for the same reason the reporters are:
 * a guard that can be replaced by `window.__oniBabaIsReal = () => true` is not a guard. */
_canonicalOniBaba = window.oniBaba8;
try {
    Object.defineProperty(window, '__oniBabaIsReal', {
        value: _isRealOniBaba, writable: false, configurable: false, enumerable: false
    });
} catch (_) { /* already pinned by an earlier load — the first definition is the one that counts */ }

// Late-bind engine reference after Engine8 boots [REF#GP-00311]
window.addEventListener('message', e => {
    if (e.data?.type === 'ENGINE8_READY' && window.Engine8) {
        window.oniBaba8.engine = window.Engine8;
        console.log('🐉 Oni-Baba v8 bound to Engine8.');
    }
});

// Backward-compat alias so NewOrigami.8.html router still works [REF#GP-00312]
window.goddessAI = window.oniBaba8;
