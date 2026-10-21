// ═══════════════════════════════════════════════════════════════════════════ [REF#IX-00001]
//  MachineInteraction.js — self-contained in-world MACHINE click owner
//  ---------------------------------------------------------------------------
//  WHY THIS EXISTS (Mark 2026-06-15): the slot + vending click logic used to
//  live INSIDE the shared _handleCanvasClick in NewOrigami.Engine9.html. Every
//  time the dungeon / overlay stack was edited, that shared handler shifted and
//  the vending/slot click "stopped working" — intermittent, maddening. Mark:
//  "total refactor so it doesn't keep stop working when anything is changed
//  with the dungeon. It needs to be segmented out on its own."
//
//  This module owns its OWN capture-phase pointer listeners on the renderer
//  canvas. A machine click is hit-tested + consumed HERE, before the shared
//  handler or the hold-to-autofire timer ever see it (stopImmediatePropagation).
//  Machines REGISTER themselves on creation; the registry is reborn on every
//  floor reload (descend = full page reload). Nothing about the dungeon, the
//  overlay forwarder, or _handleCanvasClick can perturb a registered machine.
//
//  Event-driven ONLY — zero per-frame cost. Nothing here runs inside
//  v8Clock.tick() / v8SafeRenderer.renderSafe(). Box3 is recomputed only on a
//  click (same cadence as the old inline path), so a moved/rotated machine is
//  always re-boxed. All hit-test work is wrapped in try/catch: a machine bug can
//  never crash the gesture — it falls through to normal click handling.
//
//  Registry entry shape:
//    {
//      id:        string,                 // stable key, e.g. 'slot' | 'vending'
//      kind:      'vending' | 'slot',
//      object3D:  THREE.Object3D,         // the placed group/scene
//      hitMode:   'box' | 'mesh',         // box = forgiving AABB; mesh = precise
//      fpvOnly:   boolean,                // skip when in top-down (isTopDown())
//      getHitTargets: () => Object3D[],   // mesh mode: children to raycast (live)
//      onActivate: (ctx) => boolean,      // do the thing; return true to consume
//    }
//  ctx → onActivate: { ray, intersections, camera, event }
// ═══════════════════════════════════════════════════════════════════════════

const MachineInteraction = {
    _three: null,
    _registry: new Map(),     // id -> entry (insertion order = hit-test priority) [REF#IX-00002]
    _boxes: new Map(),        // id -> reused THREE.Box3 scratch [REF#IX-00003]
    _canvas: null,
    _getRay: null,            // (e) => THREE.Raycaster, already setFromCamera + layers [REF#IX-00004]
    _getActiveCamera: null,   // () => THREE.Camera [REF#IX-00005]
    _isTopDown: null,         // () => boolean [REF#IX-00006]
    _attached: false,
    _armedId: null,           // machine id claimed on pointerdown (autofire suppressed) [REF#IX-00007]
    _lastUpId: null,          // last machine id that received a pointerup (for double-click detection) [REF#IX-00008]
    _lastUpT: 0,              // timestamp of that pointerup [REF#IX-00009]
    _DBL_MS: 350,             // double-click window (ms) [REF#IX-00010]
    _onDown: null,
    _onUp: null,

    /** Register (or REPLACE, by id) an interactable machine. Idempotent so a [REF#IX-00011]
     *  live re-place (window._vendX dials, etc.) can never duplicate. */
    register(entry) {
        if (!entry || !entry.id || typeof entry.onActivate !== 'function') {
            console.warn('[MachineInteraction] register: bad entry', entry);
            return;
        }
        this._registry.set(entry.id, {
            id: entry.id,
            kind: entry.kind || 'machine',
            object3D: entry.object3D || null,
            hitMode: entry.hitMode === 'box' ? 'box' : 'mesh',
            fpvOnly: !!entry.fpvOnly,
            getHitTargets: typeof entry.getHitTargets === 'function'
                ? entry.getHitTargets
                : () => (entry.object3D ? [entry.object3D] : []),
            onActivate: entry.onActivate,
            getGestureKey: typeof entry.getGestureKey === 'function' ? entry.getGestureKey : null,
            onGesture: typeof entry.onGesture === 'function' ? entry.onGesture : null,
            onDoubleActivate: typeof entry.onDoubleActivate === 'function' ? entry.onDoubleActivate : null,
        });
    },

    unregister(id) { this._registry.delete(id); this._boxes.delete(id); },
    clear() { this._cancelGesture(); this._registry.clear(); this._boxes.clear(); this._armedId = null; },
    has(id) { return this._registry.has(id); },

    /** Install the ONE capture-phase pointerdown + pointerup that own machine [REF#IX-00012]
     *  clicks. Idempotent. Call AFTER the renderer's __rendererPdownCount capture
     *  listener so that counter still ticks (the Panels click auditor needs it). */
    attach(opts) {
        if (this._attached) return;
        opts = opts || {};
        this._three = opts.three || (typeof window !== 'undefined' ? window.THREE : null);
        this._canvas = opts.canvas;
        this._getRay = opts.getRay;
        this._getActiveCamera = opts.getActiveCamera || (() => null);
        this._isTopDown = opts.isTopDown || (() => false);
        this._getExclusiveId = opts.getExclusiveId || (() => null);
        if (!this._canvas || typeof this._getRay !== 'function') {
            console.warn('[MachineInteraction] attach: missing canvas/getRay — not attached');
            return;
        }
        this._onDown = (e) => this._onPointerDownCapture(e);
        this._onUp = (e) => this._onPointerUpCapture(e);
        this._canvas.addEventListener('pointerdown', this._onDown, true);
        this._canvas.addEventListener('pointerup', this._onUp, true);
        this._onCancel = e => {
            if(this._strictPress && e.pointerId===this._strictPress.pointerId){
                e.stopImmediatePropagation();this._cancelGesture();
            }else if(!this._strictPress)this._armedId=null;
        };
        this._onMove = e => {
            const press=this._strictPress;
            if(press&&e.pointerId===press.pointerId){
                if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>8)press.dragged=true;
                if(press.dragged&&press.entry.onGesture)this._gesture('move',this._gestureContext(e,press),press);
            }
            if (this._strictPress || this._getExclusiveId()) e.stopImmediatePropagation();
        };
        this._canvas.addEventListener('pointercancel', this._onCancel, true);
        this._canvas.addEventListener('lostpointercapture', this._onCancel, true);
        this._canvas.addEventListener('pointermove', this._onMove, true);
        this._attached = true;
        console.log('[MachineInteraction] attached — capture-phase machine click owner is live.');
    },

    detach() {
        if (!this._attached) return;
        this._cancelGesture();
        try {
            this._canvas.removeEventListener('pointerdown', this._onDown, true);
            this._canvas.removeEventListener('pointerup', this._onUp, true);
            this._canvas.removeEventListener('pointercancel', this._onCancel, true);
            this._canvas.removeEventListener('lostpointercapture', this._onCancel, true);
            this._canvas.removeEventListener('pointermove', this._onMove, true);
        } catch (_) {}
        this._attached = false;
        this._armedId = null;
        this._strictPress = null;
    },

    // ── internals ────────────────────────────────────────────────────────── [REF#IX-00013]

    _gesture(phase, ctx, press) {
        try { press.entry.onGesture?.(phase,ctx,press); }
        catch(error) {
            window.parent.postMessage({type:'ENGINE_ANOMALY',kind:'SECTION_SEAL',subsystem:'gesture-'+phase,
                error:String(error?.stack||error)},'*');
        }
    },
    _gestureContext(e, press) {
        try{
            const ray=this._getRay(e);
            return {ray,intersections:ray.intersectObjects(press.targets,false),camera:this._getActiveCamera(),event:e};
        }catch(error){
            window.parent.postMessage({type:'ENGINE_ANOMALY',kind:'SECTION_SEAL',subsystem:'gesture-ray',
                error:String(error?.stack||error)},'*');
            return null;
        }
    },
    _cancelGesture() {
        const press=this._strictPress;this._strictPress=null;this._armedId=null;
        if(press?.entry.onGesture)this._gesture('cancel',null,press);
        if(press&&this._canvas.hasPointerCapture?.(press.pointerId))this._canvas.releasePointerCapture(press.pointerId);
    },

    _onPointerDownCapture(e) {
        if (e.button !== 0) return;            // left only [REF#IX-00014]
        if(this._strictPress&&this._strictPress.pointerId!==e.pointerId){e.stopImmediatePropagation();return;}
        if (typeof window !== 'undefined' && window._pokerCamActive) return;   // seated at the poker felt — machines never steal felt clicks (Mark 2026-07-04 poker) [REF#IX-00015]
        const hit = this._hitTest(e);
        if (!hit) {
            this._armedId = null; this._strictPress = null;
            if (this._getExclusiveId()) e.stopImmediatePropagation();
            return;
        }
        // A machine owns this gesture. Claim it + STOP so the bubble-phase [REF#IX-00016]
        // hold-to-autofire timer (renderer.domElement pointerdown) never arms.
        this._armedId = hit.entry.id;
        this._strictPress = hit.entry.getGestureKey ? {
            id:hit.entry.id, pointerId:e.pointerId, x:e.clientX, y:e.clientY,
            key:hit.entry.getGestureKey(hit.ctx), dragged:false,entry:hit.entry,
            targets:hit.entry.onGesture?hit.entry.getHitTargets():[]
        } : null;
        if(this._strictPress&&hit.entry.onGesture){
            this._gesture('start',hit.ctx,this._strictPress);
            if(e.isTrusted)this._canvas.setPointerCapture?.(e.pointerId);
        }
        e.stopImmediatePropagation();
    },

    _onPointerUpCapture(e) {
        if (e.button !== 0) return;
        if(this._strictPress&&this._strictPress.pointerId!==e.pointerId){e.stopImmediatePropagation();return;}
        if (typeof window !== 'undefined' && window._pokerCamActive) return;   // seated at the poker felt (see pointerdown guard) [REF#IX-00017]
        const claimed=this._strictPress;
        if(claimed?.entry.onGesture && (claimed.dragged||Math.hypot(e.clientX-claimed.x,e.clientY-claimed.y)>8)){
            e.stopImmediatePropagation();
            try{this._gesture('drop',this._gestureContext(e,claimed),claimed);}
            finally{this._cancelGesture();}
            return;
        }
        if(claimed?.entry.onGesture)this._cancelGesture();
        const hit = this._hitTest(e);
        const press = claimed;
        this._armedId = null; this._strictPress = null;
        if (!hit) {
            if (press || this._getExclusiveId()) e.stopImmediatePropagation();
            return;
        }
        // Consume BEFORE the shared _handleCanvasClick (bubble-phase pointerup). [REF#IX-00019]
        e.stopImmediatePropagation();
        const entry = hit.entry;
        if(press&&press.id!==entry.id)return;
        if (entry.getGestureKey && (!press || press.id !== entry.id || press.pointerId !== e.pointerId
            || press.dragged || press.key == null || press.key !== entry.getGestureKey(hit.ctx)
            || Math.hypot(e.clientX-press.x,e.clientY-press.y)>8)) return;
        // DOUBLE-CLICK: a 2nd up on the SAME machine within _DBL_MS, when it has an [REF#IX-00020]
        // onDoubleActivate, fires THAT instead of a 2nd onActivate (Mark 2026-06-16:
        // double-click a slot → open the guide; single-click still spins it). The first
        // up already ran onActivate, so a double = one activate + the double action.
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const isDouble = entry.onDoubleActivate && this._lastUpId === entry.id && (now - this._lastUpT) < this._DBL_MS;
        try {
            if (isDouble) { this._lastUpT = 0; this._lastUpId = null; entry.onDoubleActivate(hit.ctx); }
            else { this._lastUpId = entry.id; this._lastUpT = now; entry.onActivate(hit.ctx); }
        } catch (err) {
            console.error('[MachineInteraction] activate error (non-fatal):', err);
        }
    },

    /** Returns { entry, ctx } for the first machine the ray hits, or null. [REF#IX-00021] */
    _hitTest(e) {
        let ray;
        try { ray = this._getRay(e); } catch (err) {
            console.error('[MachineInteraction] getRay error:', err); return null;
        }
        if (!ray) return null;
        const THREE = this._three;
        const topDown = !!(this._isTopDown && this._isTopDown());
        const cam = this._getActiveCamera ? this._getActiveCamera() : null;
        // ── THE MOST SPECIFIC TARGET WINS, NOT THE FIRST REGISTERED ────────────────────────────────────── [REF#IX-00022]
        // Mark 2026-07-27: "i think the click to play for tavern has a bigger hit box than the slot machine
        // due to its cover top". Exactly right, and this loop was the mechanism: it used to RETURN on the
        // first entry whose box the ray touched, so the winner was decided by registration order and nothing
        // else. SakeTavern.glb's forgiving AABB is the whole building — roof included — and the slot machine
        // stands inside that volume, so the tavern (registered first, at GLB load) swallowed every click
        // meant for the slot. The player could see the machine and never reach it.
        //
        // Ranking now, cheapest signal first:
        //   1. A MESH hit beats any box. Mesh mode is precise geometry; if the ray genuinely struck the
        //      object's triangles, that is a better answer than any bounding volume. Nearest triangle wins.
        //   2. Among BOXES, the SMALLEST VOLUME wins. This is the rule that fixes the bug, and it says
        //      something true: when one machine's box contains another's, the inner one is what the player
        //      is pointing at. A slot cabinet inside a tavern shell is unambiguous; so is a vending machine
        //      against a wall. Distance is deliberately NOT the tiebreak — the enclosing box is ENTERED
        //      first by the ray, so "nearest entry point" would keep picking the building.
        // Box mode stays exactly as forgiving as before (the thin-panel CLICK_LOST fix is untouched); only
        // the choice between overlapping candidates changes. A single candidate resolves as it always did.
        let best = null, bestVol = Infinity, bestMeshDist = Infinity;
        for (const entry of this._registry.values()) {
            const exclusive = this._getExclusiveId();
            if (exclusive && exclusive !== entry.id) continue;
            if (entry.fpvOnly && topDown) continue;           // FPV-only machines off in top-down [REF#IX-00023]
            const obj = entry.object3D;
            if (!obj) continue;
            if (entry.kind === 'vending' && obj.visible === false) continue;
            try {
                if (entry.hitMode === 'box') {
                    // ⚠ AN EMPTY getHitTargets() MEANS "NOT CLICKABLE RIGHT NOW" — IN BOX MODE TOO [REF#IX-00024]
                    // (Mark 2026-08-01 "the bar is still allowing clicks when its not even there").
                    // Box mode used to skip getHitTargets entirely and ray the object3D's AABB, so the
                    // tavern/bartender registrations that carefully return [] while the tavern is
                    // permit-dormant were DEAD CODE — the invisible bar kept taking clicks. The default
                    // getHitTargets (register(), ~:66) returns [object3D], so ordinary box machines
                    // are unaffected; only a device that explicitly declares itself empty goes dark.
                    if ((entry.getHitTargets() || []).length === 0) continue;
                    // Forgiving AABB — the slot GLB's thin curved panels let a mesh [REF#IX-00025]
                    // ray slip past (the old "CLICK_LOST"). Box never misses.
                    let box = this._boxes.get(entry.id);
                    if (!box) { box = new THREE.Box3(); this._boxes.set(entry.id, box); }
                    box.setFromObject(obj);                    // re-box every click (machine can move/rotate) [REF#IX-00026]
                    if (ray.ray.intersectsBox(box)) {
                        if (bestMeshDist < Infinity) continue;  // a precise mesh hit already beats every box [REF#IX-00027]
                        const s = box.getSize(this._sizeTmp || (this._sizeTmp = new THREE.Vector3()));
                        const vol = Math.max(1e-6, s.x * s.y * s.z);
                        if (vol < bestVol) {
                            bestVol = vol;
                            best = { entry, ctx: { ray, intersections: null, camera: cam, event: e } };
                        }
                    }
                } else {
                    const targets = entry.getHitTargets() || [];
                    if (!targets.length) continue;
                    const hits = ray.intersectObjects(targets, true);
                    if (hits.length && hits[0].distance < bestMeshDist) {
                        bestMeshDist = hits[0].distance;
                        best = { entry, ctx: { ray, intersections: hits, camera: cam, event: e } };
                    }
                }
            } catch (err) {
                console.error('[MachineInteraction] hit-test error for', entry.id, '(non-fatal):', err);
            }
        }
        return best;
    },
};

export default MachineInteraction;
