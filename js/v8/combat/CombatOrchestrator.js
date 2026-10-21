/** [REF#CB-00055]
 * CombatOrchestrator.js — target selection authority.
 *
 * Rebuilt 2026-05-28 after the prior version was gutted to no-op stubs,
 * which silently broke auto-aim missile fire: every call returned
 * { target: null } so missiles flew straight forward regardless of
 * locked target.
 *
 * Behaviour (per user spec 2026-05-28):
 *   - ±90° forward cone (180° front hemisphere), LOS-clear, closest first
 *   - Manual lock ALWAYS wins — if state.lockedTarget exists and is alive,
 *     return it without auto-pick
 *   - Auto-aim toggle gated by state.autoAimEnabled (sourced from the
 *     Welcome Guide checkbox via localStorage)
 *   - Allies and dead monsters never picked
 *   - Around-corner fallback runs ONLY when auto-aim is on and no clean
 *     LOS shot exists
 *
 * The engine passes state in this shape (see NewOrigami.Engine9.html
 * _obAutoTarget / _obAutoTargetWithCorner / _executeMeleeCard):
 *   { autoAimEnabled, lockedTarget, lockedTargetIsManual,
 *     px, pz, rot,                       // player position + yaw
 *     monsterWrappers,                   // all live monster groups
 *     losFn(mx, mz) → boolean,           // LOS from player to (mx, mz)
 *     setLockedTarget(picked) → void,    // engine-side callback to lock
 *     GRID,                              // tile size (corner only)
 *     CORNER_AIM_MAX_TILES,              // corner search radius
 *     findCornerViaPoint(tx, tz) → {x,z}? // engine-side corner helper
 *   }
 *
 * Rotation convention (Engine8 line 3654-3655):
 *   rot=0 → NORTH (-Z), π/2 → EAST (+X), π → SOUTH (+Z), -π/2 → WEST (-X).
 *   Forward vector: (sin(rot), -cos(rot)).
 */

// Auto-aim ASSIST cone. A candidate is skipped when dot <= cone threshold (dot = cosine [REF#CB-00056]
// of its angle from the player's forward vector). HISTORY: originally 0 (±90° front half);
// opened to -1 (full 360°) on Mark's 2026-05-30 "imps must auto-target like goblins"
// (imps circle to the flanks/rear). REVERSED per Mark 2026-07-03: "autoaim is strange.
// it should try to ONLY target monsters in front FOV not behind" — the 360° assist locked
// foes BEHIND the player and _autoFaceOnAttack then spun the player around ("strange").
// Now a FRONT cone, default 140° full-angle (±70°, ≈ the wide-screen visible FOV + slack).
// Dial live: window._autoAimConeDeg (e.g. 180 = front half, 360 = restore the old rear assist).
function _coneDotMin() {
    const deg = (typeof window !== 'undefined' && typeof window._autoAimConeDeg === 'number') ? window._autoAimConeDeg : 140;
    return Math.cos(Math.min(360, Math.max(10, deg)) * Math.PI / 360);   // full-angle deg → cos(half-angle) [REF#CB-00057]
}
// dot of wrapper w vs the player's forward — shared by the pick loop + the held-lock gate. [REF#CB-00058]
function _fwdDot(stateParam, w) {
    const dx = w.position.x - stateParam.px;
    const dz = w.position.z - stateParam.pz;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return 1;   // on top of the player — treat as front (melee range gate handles it) [REF#CB-00059]
    return (dx / dist) * Math.sin(stateParam.rot) + (dz / dist) * -Math.cos(stateParam.rot);
}

function _inActiveSegment(w) {
    if (!w || !w.userData || typeof window === 'undefined' || !Number.isInteger(window._activeSegmentId)) return true;
    const sid = w.userData.segmentId;
    return !Number.isInteger(sid) || sid === window._activeSegmentId;
}

/** [REF#CB-00060]
 * Pure target picker shared by getAutoTarget + getAutoTargetWithCorner.
 * Honors manual lock first; auto-picks closest in-cone LOS-clear hostile.
 * Returns null when no candidate qualifies.
 */
const state = {
    lockedTarget: null,
    lockedTargetIsManual: false,
    didInitialAutoSelect: false,
    autoAimEnabled: false,
    userInterrupt: false,
    lastActionT: 0
};

// Initialize autoAimEnabled from localStorage [REF#CB-00061]
try {
    if (typeof localStorage !== 'undefined') {
        state.autoAimEnabled = localStorage.getItem('auto_aim_enabled') !== 'false';
    }
} catch (e) {
    state.autoAimEnabled = true;
}

// ── EV1 · EXPLICIT VIOLENCE, READ FROM THE ONE CANONICAL PREDICATE ─────────────────────────────── [REF#CB-00097]
// Implements the explicit-violence directive recorded in the DISABLED-FEATURES REGISTER at the top of
// NewOrigami.Engine9.html ("EV1 — EXPLICIT VIOLENCE", 2026-09-04), which is where the order itself lives.
// This module reimplemented the engine's REACH test (isDead / isAlly / segment) in three auto-pickers
// and, like the engine's own misnamed helper, never tested hostility — so an auto-pick could land on a
// sleeping bystander. There is exactly ONE definition of what an automatic path may acquire, and it
// lives in Engine9 as `_isAutoAcquirable`; this delegates and never reimplements it.
// FAIL-CLOSED: if that predicate is not published yet (load order, a bare module test) this returns
// false and the auto-pickers acquire NOTHING. Refusing to aim is the safe failure; guessing is not.
// UNTOUCHED ON PURPOSE: the manual-lock check (~:94) and the reticle resolver (~:455) keep the plain
// reach test. Both READ a selection the player already made rather than making one, so gating them
// would drop a deliberately chosen peaceful target and blank its reticle. Both READ a selection rather
// than making one, so the directive does not reach them; see the register entry for the distinction.
const _autoOk = (w) => {
    try { return (typeof window !== 'undefined' && typeof window._isAutoAcquirable === 'function')
        ? !!window._isAutoAcquirable(w) : false; } catch (_) { return false; }
};

/** [REF#CB-00062]
 * Pure target picker shared by getAutoTarget + getAutoTargetWithCorner.
 * Honors manual lock first; auto-picks closest in-cone LOS-clear hostile.
 * Returns null when no candidate qualifies AND no manual lock is set.
 */
function _pickTarget(stateParam) {
    // 1. Honor existing manual lock if it's still alive + not an ally + in line-of-sight and visible room. [REF#CB-00063]
    const mLock = stateParam.lockedTarget ?? state.lockedTarget;
    if (mLock && !mLock.userData?.isDead && !mLock.userData?.isAlly && _inActiveSegment(mLock)) {
        let isRoomVisible = true;
        if (stateParam.visibleRoomIds && typeof stateParam.playerRoomId === 'number') {
            const mRoom = mLock.userData?.aiRoomId ?? -1;
            const _cabT = (mRoom === 1) || !!mLock.userData?.cabAudience;   // Mark 2026-06-29: a CABARET target defers to LOS — once the door is OPEN you can attack it from room 0; closed door → losFn blocks it anyway. [REF#CB-00064]
            if ((typeof window !== 'undefined' && window._roomGateTargets === true) && mRoom !== -1 && stateParam.playerRoomId !== -1 && mRoom !== stateParam.playerRoomId && !stateParam.visibleRoomIds.has(mRoom) && !_cabT) {
                isRoomVisible = false;   // Mark 2026-06-30: cross-room targeting is now LOS-gated (line 88), NOT room-gated — keep a held foe in another room/hall if you still have clear LOS. Restore the room restriction: window._roomGateTargets=true. [REF#CB-00065]
            }
        }
        // FRONT-CONE gate on HELD AUTO locks (Mark 2026-07-03 "ONLY target monsters in front FOV not behind"): [REF#CB-00066]
        // a lock the PLAYER set (TAB/click = manual) is honored in any direction — but an AUTO-picked lock that
        // has drifted behind the player is dropped here so step 3 re-picks in front (or clears).
        const _heldManual = stateParam.lockedTargetIsManual ?? state.lockedTargetIsManual;
        const _heldInFront = _heldManual || _fwdDot(stateParam, mLock) > _coneDotMin();
        if (isRoomVisible && _heldInFront && (typeof stateParam.losFn !== 'function' || stateParam.losFn(mLock.position.x, mLock.position.z))) {
            return mLock;
        }
    }

    // 2. Auto-aim disabled → no auto pick. Engine fires forward. [REF#CB-00067]
    if (!stateParam.autoAimEnabled) return null;

    // 3. Auto-pick: closest hostile in dot cone with LOS. [REF#CB-00068]
    const fwdX = Math.sin(stateParam.rot);
    const fwdZ = -Math.cos(stateParam.rot);
    let best = null;
    let bestDist = Infinity;
    for (const mw of stateParam.monsterWrappers) {
        if (!mw || !mw.userData) continue;
        const ud = mw.userData;
        if (ud.isDead || ud.isAlly || !_inActiveSegment(mw)) continue;
        if (!_autoOk(mw)) continue;   // EV1 2026-09-04: an AUTO pick acquires hostiles only — the reach test above never asked. [REF#CB-00098]
        
        // Room visibility gate: target must be in the player's room or a room currently visible. [REF#CB-00069]
        if (stateParam.visibleRoomIds && typeof stateParam.playerRoomId === 'number') {
            const mRoom = ud.aiRoomId ?? -1;
            const _cabT = (mRoom === 1) || !!ud.cabAudience;   // Mark 2026-06-29: a CABARET target defers to LOS — open door → attackable from room 0; closed door → losFn blocks it anyway. [REF#CB-00070]
            if ((typeof window !== 'undefined' && window._roomGateTargets === true) && mRoom !== -1 && stateParam.playerRoomId !== -1 && mRoom !== stateParam.playerRoomId && !stateParam.visibleRoomIds.has(mRoom) && !_cabT) {
                continue;   // Mark 2026-06-30: cross-room auto-pick is now LOS-gated (line 123), NOT room-gated. Restore the room restriction: window._roomGateTargets=true. [REF#CB-00071]
            }
        }

        const dx = mw.position.x - stateParam.px;
        const dz = mw.position.z - stateParam.pz;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.01) continue;
        // Cone filter — FRONT only (Mark 2026-07-03); dial window._autoAimConeDeg [REF#CB-00072]
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        if (dot <= _coneDotMin()) continue;
        // LOS gate. [REF#CB-00073]
        if (typeof stateParam.losFn === 'function' && !stateParam.losFn(mw.position.x, mw.position.z)) continue;
        if (dist < bestDist) {
            bestDist = dist;
            best = mw;
        }
    }
    return best;
}

export const CombatOrchestrator = {
    // ── Targeting State Getters & Setters ── [REF#CB-00074]
    getLockedTarget() { return state.lockedTarget; },
    setLockedTarget(target, isManual = false) {
        state.lockedTarget = target;
        state.lockedTargetIsManual = isManual;
    },
    getLockedTargetIsManual() { return state.lockedTargetIsManual; },
    setLockedTargetIsManual(v) { state.lockedTargetIsManual = v; },
    isAutoAimEnabled() { return state.autoAimEnabled; },
    setAutoAimEnabled(enabled) {
        state.autoAimEnabled = enabled;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('auto_aim_enabled', enabled ? 'true' : 'false');
            }
        } catch (e) {}
    },
    didInitialAutoSelect() { return state.didInitialAutoSelect; },
    setDidInitialAutoSelect(v) { state.didInitialAutoSelect = v; },
    clearLockedTarget() {
        state.lockedTarget = null;
        state.lockedTargetIsManual = false;
        state.userInterrupt = false;
    },
    canAutoWriteThisFrame() {
        const now = performance.now();
        if (now - state.lastActionT < 1000) return false;
        if (state.userInterrupt) return false;
        return true;
    },
    onPlayerFire() {
        state.lastActionT = performance.now();
    },
    get userInterrupt() { return state.userInterrupt; },
    set userInterrupt(v) { state.userInterrupt = v; },

    // ── Tab Target Cycling ── [REF#CB-00075]
    cycleTargets(shift, engineState) {
        const px = engineState.px ?? (typeof window !== 'undefined' ? window.px : 0);
        const pz = engineState.pz ?? (typeof window !== 'undefined' ? window.pz : 0);
        const rot = engineState.rot ?? (typeof window !== 'undefined' ? window.rot : 0);
        const GRID = engineState.GRID ?? (typeof window !== 'undefined' ? window.GRID : 2);
        const map = engineState.map ?? (typeof window !== 'undefined' ? window.map : null);
        const monsterWrappers = engineState.monsterWrappers ?? (typeof window !== 'undefined' ? window.monsterWrappers : []);
        const visibleRooms = engineState.visibleRoomIds ?? (typeof window !== 'undefined' ? window._visibleRoomIds : null);
        const playerRoomId = (map && map[Math.round(px / GRID)]?.[Math.round(pz / GRID)]) ? (map[Math.round(px / GRID)][Math.round(pz / GRID)].roomId ?? -1) : -1;
        const dotMin = Math.cos(60 * Math.PI / 180); // ±60° cone [REF#CB-00076]
        const fwdX = Math.sin(rot);
        const fwdZ = -Math.cos(rot);
        
        const eligible = [];
        for (const mw of monsterWrappers) {
            if (!mw || !mw.userData) continue;
            const ud = mw.userData;
            if (ud.isDead || ud.isAlly || !_inActiveSegment(mw)) continue;
            if (!_autoOk(mw)) continue;   // EV1 2026-09-04: an AUTO pick acquires hostiles only — the reach test above never asked. [REF#CB-00099 → see REF#CB-00098]
            
            // TARGET-IN-FOV FIX (Mark 2026-06-16): no room-visibility gate — the ±60° cone + LOS [REF#CB-00077]
            // checks below are the authority. A monster the player can SEE in front (even across a
            // doorway into another room) must be TAB-targetable; LOS already blocks through-wall picks.

            const dx = mw.position.x - px, dz = mw.position.z - pz;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.01) continue;
            const dot = (dx/dist)*fwdX + (dz/dist)*fwdZ;
            if (dot < dotMin) continue;
            
            let hasLOS = true;
            if (typeof engineState.losFn === 'function') {
                hasLOS = engineState.losFn(mw.position.x, mw.position.z);
            } else if (typeof window !== 'undefined' && typeof window._hasLineOfSight === 'function') {
                hasLOS = window._hasLineOfSight(px, pz, mw.position.x, mw.position.z);   // Mark 2026-06-23: was 2-arg → bx/bz undefined → NaN DDA → through-wall/through-cabaret-door TAB picks. _hasLineOfSight(ax,az,bx,bz) needs the player origin. [REF#CB-00078]
            }
            if (!hasLOS) continue;
            
            eligible.push({ mw, dist });
        }
        
        if (eligible.length) {
            eligible.sort((a, b) => a.dist - b.dist);
            const list = eligible.map(e => e.mw);
            let idx = state.lockedTarget ? list.indexOf(state.lockedTarget) : -1;
            const dir = shift ? -1 : 1;
            idx = (idx + dir + list.length) % list.length;
            
            const picked = list[idx];
            CombatOrchestrator.setLockedTarget(picked, true); // manual lock [REF#CB-00079]
            
            if (typeof window !== 'undefined') {
                if (typeof window._autoFaceOnAttack === 'function' && picked?.position) {
                    window._autoFaceOnAttack(picked, true);
                }
                
                const name = picked.userData?.name || 'Monster';
                window.parent.postMessage({
                    type: 'LOG_EVENT',
                    logType: 'system',
                    text: `🎯 Target: <b>${name}</b>`
                }, '*');
                
                if (state.autoAimEnabled) {
                    CombatOrchestrator.setAutoAimEnabled(false);
                    window.parent.postMessage({ type: 'SET_AUTO_AIM', enabled: false }, '*');
                }
            }
            return picked;
        } else if (state.lockedTarget) {
            CombatOrchestrator.clearLockedTarget();
            if (typeof window !== 'undefined') {
                window.parent.postMessage({
                    type: 'LOG_EVENT',
                    logType: 'system',
                    text: '🎯 No target in view.'
                }, '*');
            }
        }
        return null;
    },

    // ── Soft Auto Aim Updates ── [REF#CB-00080]
    updateAutoAimTarget(engineState, targetingState) {
        const pickState = {
            autoAimEnabled: targetingState.autoAimEnabled ?? state.autoAimEnabled,
            lockedTarget: state.lockedTarget,
            lockedTargetIsManual: state.lockedTargetIsManual,
            px: engineState.px,
            pz: engineState.pz,
            rot: engineState.rot,
            monsterWrappers: engineState.monsterWrappers,
            losFn: engineState.hasLineOfSight,
            playerRoomId: engineState.playerRoomId ?? (typeof window !== 'undefined' && typeof window.map !== 'undefined' ? window.map[Math.round(engineState.px / (engineState.GRID || 2))]?.[Math.round(engineState.pz / (engineState.GRID || 2))]?.roomId : -1),
            visibleRoomIds: engineState.visibleRoomIds ?? (typeof window !== 'undefined' ? window._visibleRoomIds : null),
        };
        const picked = _pickTarget(pickState);
        if (picked && picked !== state.lockedTarget) {
            targetingState.lockedTarget = picked;
            state.lockedTarget = picked;
            state.lockedTargetIsManual = false;

            if (typeof targetingState.logEvent === 'function') {
                targetingState.logEvent('auto-target', { name: picked.userData?.name || 'Monster' });
            }
        } else if (!picked && state.lockedTarget && !state.lockedTargetIsManual
                   && _fwdDot(pickState, state.lockedTarget) <= _coneDotMin()) {
            // Nothing in front and the held AUTO lock is BEHIND the player → release it (Mark 2026-07-03: [REF#CB-00081]
            // front-FOV only). Without this, the stale rear lock kept the reticle on a foe behind you and the
            // next swing force-turned you around. Manual TAB/click locks are never auto-released here.
            targetingState.lockedTarget = null;
            state.lockedTarget = null;
        }
    },

    /** [REF#CB-00082]
     * Melee swing target picker.
     *   meleeState: { autoAimEnabled, lockedTarget, lockedTargetIsManual,
     *                 playerPos, playerRot, monsterWrappers }
     *   opts:       { target?, isDefend? }
     *
     * Returns { best, chase }:
     *   - best   = monster within immediate melee strike range (≤ 1.6 wu)
     *   - chase  = farther in-cone monster the player can auto-walk toward
     *              (≤ 6 wu); engine moves player forward until best is set
     *
     * Defend swings have no target; return both null.
     */
    checkMeleeTarget(cardName, meleeState, opts) {
        if (opts && opts.isDefend) return { best: null, chase: null };
        if (opts && opts.target) return { best: opts.target, chase: null };

        const px = meleeState.playerPos?.x ?? 0;
        const pz = meleeState.playerPos?.z ?? 0;
        const rot = meleeState.playerRot ?? 0;

        // Reuse the same picker by adapting state shape. [REF#CB-00083]
        const pickState = {
            autoAimEnabled: meleeState.autoAimEnabled ?? state.autoAimEnabled,
            lockedTarget: meleeState.lockedTarget ?? state.lockedTarget,
            lockedTargetIsManual: meleeState.lockedTargetIsManual ?? state.lockedTargetIsManual,
            px, pz, rot,
            monsterWrappers: meleeState.monsterWrappers,
            losFn: meleeState.losFn,
            playerRoomId: meleeState.playerRoomId,
            visibleRoomIds: meleeState.visibleRoomIds,
        };
        const candidate = _pickTarget(pickState);
        if (!candidate) return { best: null, chase: null };

        // Distance gate: ≤1.6 wu = immediate strike, ≤6 wu = chase-walk. [REF#CB-00084]
        const dx = candidate.position.x - px;
        const dz = candidate.position.z - pz;
        const dist = Math.hypot(dx, dz);
        if (dist <= 1.6) return { best: candidate, chase: null };
        if (dist <= 6.0) return { best: null,      chase: candidate };
        return { best: null, chase: null };
    },

    /** [REF#CB-00085]
     * Ranged auto-target — direct line-of-sight only.
     *   stateParam: see file header.
     *   opts:  { getOniBabaSafe? } (unused here; reserved for future hooks)
     * Returns the picked monster wrapper or null. Also writes the lock
     * via stateParam.setLockedTarget() if a new pick was made (so the reticle
     * follows the auto-pick the same way a manual TAB lock would).
     */
    getAutoTarget(cardName, dmg, stateParam, opts) {
        const pickState = {
            autoAimEnabled: stateParam.autoAimEnabled ?? state.autoAimEnabled,
            lockedTarget: stateParam.lockedTarget ?? state.lockedTarget,
            lockedTargetIsManual: stateParam.lockedTargetIsManual ?? state.lockedTargetIsManual,
            px: stateParam.px,
            pz: stateParam.pz,
            rot: stateParam.rot,
            monsterWrappers: stateParam.monsterWrappers,
            losFn: stateParam.losFn,
            playerRoomId: stateParam.playerRoomId,
            visibleRoomIds: stateParam.visibleRoomIds,
        };
        const picked = _pickTarget(pickState);
        if (picked && picked !== stateParam.lockedTarget) {
            state.lockedTarget = picked;
            state.lockedTargetIsManual = stateParam.lockedTargetIsManual ?? false;
            if (typeof stateParam.setLockedTarget === 'function') {
                stateParam.setLockedTarget(picked);
            }
        }
        return picked;
    },

    /** [REF#CB-00086]
     * Ranged auto-target with around-corner fallback.
     *   Same state as getAutoTarget plus { GRID, CORNER_AIM_MAX_TILES,
     *   findCornerViaPoint }.
     * Returns { target, blocked, viaPoint }:
     *   - target  = picked monster or null
     *   - blocked = true if direct LOS failed AND we found a corner shot
     *   - viaPoint = {x, z} intermediate aim point if blocked, else null
     */
    getAutoTargetWithCorner(cardName, dmg, stateParam, opts) {
        // First: clean LOS pick. [REF#CB-00087]
        const direct = _pickTarget(stateParam);
        if (direct) {
            if (direct !== stateParam.lockedTarget) {
                state.lockedTarget = direct;
                state.lockedTargetIsManual = stateParam.lockedTargetIsManual ?? false;
                if (typeof stateParam.setLockedTarget === 'function') {
                    stateParam.setLockedTarget(direct);
                }
            }
            return { target: direct, blocked: false, viaPoint: null };
        }

        // No clean shot. Around-corner only makes sense when auto-aim is on [REF#CB-00088]
        const aimEnabled = stateParam.autoAimEnabled ?? state.autoAimEnabled;
        if (!aimEnabled) {
            return { target: null, blocked: false, viaPoint: null };
        }

        // Search for the nearest blocked hostile inside the cone (LOS-failed [REF#CB-00089]
        // candidates) and try to route around a corner to it.
        if (typeof stateParam.findCornerViaPoint !== 'function') {
            return { target: null, blocked: false, viaPoint: null };
        }
        const fwdX = Math.sin(stateParam.rot);
        const fwdZ = -Math.cos(stateParam.rot);
        let bestBlocked = null;
        let bestBlockedDist = Infinity;
        for (const mw of stateParam.monsterWrappers) {
            if (!mw || !mw.userData) continue;
            const ud = mw.userData;
            if (ud.isDead || ud.isAlly || !_inActiveSegment(mw)) continue;
            if (!_autoOk(mw)) continue;   // EV1 2026-09-04: an AUTO pick acquires hostiles only — the reach test above never asked. [REF#CB-00100 → see REF#CB-00098]
            const dx = mw.position.x - stateParam.px;
            const dz = mw.position.z - stateParam.pz;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.01) continue;
            const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
            if (dot <= _coneDotMin()) continue;   // FRONT cone (Mark 2026-07-03); dial window._autoAimConeDeg [REF#CB-00090]

            if (typeof stateParam.losFn === 'function' && stateParam.losFn(mw.position.x, mw.position.z)) continue;
            if (dist < bestBlockedDist) {
                bestBlockedDist = dist;
                bestBlocked = mw;
            }
        }
        if (!bestBlocked) return { target: null, blocked: false, viaPoint: null };

        const via = stateParam.findCornerViaPoint(bestBlocked.position.x, bestBlocked.position.z);
        if (!via) return { target: null, blocked: false, viaPoint: null };

        if (bestBlocked !== stateParam.lockedTarget) {
            state.lockedTarget = bestBlocked;
            state.lockedTargetIsManual = stateParam.lockedTargetIsManual ?? false;
            if (typeof stateParam.setLockedTarget === 'function') {
                stateParam.setLockedTarget(bestBlocked);
            }
        }
        return { target: bestBlocked, blocked: true, viaPoint: via };
    },

    // ── Reticle target resolver ────────────────────────────────────────── [REF#CB-00091]
    getReticleTarget(stateParam) {
        if (!stateParam) return { target: null, manual: false };
        const t = stateParam.lockedTarget ?? state.lockedTarget;
        if (!t || !t.userData) return { target: null, manual: false };
        if (t.userData.isDead || t.userData.isAlly || !_inActiveSegment(t)) return { target: null, manual: false };

        // Room visibility gate [REF#CB-00092]
        if (stateParam.visibleRoomIds && typeof stateParam.playerRoomId === 'number') {
            const mRoom = t.userData.aiRoomId ?? -1;
            if (mRoom !== -1 && stateParam.playerRoomId !== -1 && mRoom !== stateParam.playerRoomId && !stateParam.visibleRoomIds.has(mRoom)) {
                return { target: null, manual: false };
            }
        }

        // Hide reticle if LOS is lost [REF#CB-00093]
        if (typeof stateParam.losFn === 'function' && !stateParam.losFn(t.position.x, t.position.z)) {
            return { target: null, manual: false };
        }
        return { target: t, manual: !!(stateParam.lockedTargetIsManual ?? state.lockedTargetIsManual) };
    },
    isManualLock() { return state.lockedTargetIsManual; },
    requestDamageMultiplier() { return 1.0; },
    pickTarget(stateParam) { return _pickTarget(stateParam); },
    // ⚠ EMPTIED 2026-05-28 IN b1461a3c, DURING THE ROGUE-AI INCIDENT WINDOW (the 05-26 attack). [REF#CB-00102 → see REF#E9-20015]
    // The bodies removed here contained malicious script. They were emptied rather than deleted
    // because the attack had entangled enough good code that excising the functions outright
    // would have taken working code with them. The empty body IS the containment.
    // Measured 2026-09-08: none of these is invoked anywhere in the tree, so they read as dead
    // code — that appearance is why this marker exists. Writing a body back into one of these
    // shells restores a quarantined hole; removing a shell undoes the containment. A genuine
    // rebuild of this behaviour uses NEW, DIFFERENTLY-NAMED functions.
    // Full record: knowledge/design/ROGUE_ERADICATION_PLAN_2026-09-08.md §1f.
    onAutoAttackStart() {},
    onAutoAttackTick() {},
    onAutoAttackStop() {},
    resolveDamage() { return null; }
};

if (typeof window !== 'undefined') {
    window.CombatOrchestrator = CombatOrchestrator;
}

export default CombatOrchestrator;
