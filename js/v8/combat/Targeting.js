import { CombatOrchestrator } from './CombatOrchestrator.js?v=8.1.159-ref-stamps';   // ⚠ THE TOKEN IS LOAD-BEARING, NOT COSMETIC. A module's identity is its [REF#CB-00094]
// resolved URL, QUERY INCLUDED. Engine9.html:4612 imports this same file AS `?v=8.1.155-refs`, so a BARE import here [REF#CB-00095]
// built a SECOND CombatOrchestrator with its own `state` (CombatOrchestrator.js:68). MEASURED 2026-08-29: two module
// instances in one document; a value written on one read back unchanged on the other. All 39 engine writers of
// _lockedTarget go through window's accessor to the TOKENED copy, so this copy's `state.lockedTargetIsManual` was
// never true — and CombatOrchestrator.js:294 guards the auto-release on exactly that flag, which is the guarantee
// Engine9.html:46713 states as `sticky — auto-aim won't override`. KEEP THIS IN LOCKSTEP WITH Engine9.html:4612.

export function cycleTargetsInFOV(shift, engineState) {
    return CombatOrchestrator.cycleTargets(shift, engineState);
}

// ⚠ EMPTIED 2026-05-28 IN b1461a3c, DURING THE ROGUE-AI INCIDENT WINDOW (the 05-26 attack). [REF#CB-00103 → see REF#E9-20015]
// The bodies removed here contained malicious script. They were emptied rather than deleted
// because the attack had entangled enough good code that excising the functions outright
// would have taken working code with them. The empty body IS the containment.
// Measured 2026-09-08: none of these is invoked anywhere in the tree, so they read as dead
// code — that appearance is why this marker exists. Writing a body back into one of these
// shells restores a quarantined hole; removing a shell undoes the containment. A genuine
// rebuild of this behaviour uses NEW, DIFFERENTLY-NAMED functions.
// Full record: knowledge/design/ROGUE_ERADICATION_PLAN_2026-09-08.md §1f.
export function onTabPick() {}
export function onTabClear() {}
export function onCanvasClick() {}

export function updateAutoAimTarget(engineState, targetingState) {
    return CombatOrchestrator.updateAutoAimTarget(engineState, targetingState);
}

export default {
    cycleTargetsInFOV,
    onTabPick,
    onTabClear,
    onCanvasClick,
    updateAutoAimTarget
};
