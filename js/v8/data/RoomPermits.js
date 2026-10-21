/** [REF#DA-00066]
 * RoomPermits.js — the dungeon is SHUT DOWN. Permits switch it back on.
 *
 * Mark 2026-07-30: "the player comes into a disfunctioning dilapidated dungeon. the player must find
 * these SKILL cards to activate rooms in the dungeon - think DUNGEON KEEPER … everything needs a permit
 * -- inspectors came in and shut down the inn."
 *
 * THE LOOP, as he described it across two messages:
 *   1. Every major room starts DORMANT — dark, silent, dead machinery.
 *   2. The player finds that room's PERMIT (a gold SKILL card) somewhere in the dungeon.
 *   3. Carrying it, they bring it back to the room and hand it in. The room wakes: lights come up, a
 *      bloom marker burns on the floor, the machinery thrums.
 *      ⚠ HOW the hand-in happens is PER ROOM, and this step used to claim "touch the room's main
 *        device" for all of them — which was true of exactly ONE room. Corrected 2026-08-06 after the
 *        pickup log inherited the same false sentence and told players to touch a watch station that
 *        has no hit-test on it (Engine9 ~:32304). The three real paths:
 *          · CABARET — a genuine device touch: her dead stage, `_cabGlbStage`. The only one.
 *          · GUARD_POST — `marker:'bespoke'`: walk onto the (!) circle the guard-furniture pass
 *            draws (Engine9 ~:8120). Its `device` ('watch station') is a dormant/active TELL, NOT a
 *            switch — the field is descriptive, not interactive.
 *          · everything else (KITCHEN/STORE/FACTORY/LABORATORY) — walk onto the dashed floor marker
 *            the generic activator builds (Engine9 ~:10088). Their `device` is likewise scenery.
 *        `Engine9._garHandles(r)` / `_permitUsesFloorMark(r)` are the live predicates; ask them
 *        rather than re-deriving this from `device`, which describes furniture, not interaction.
 *   4. Workers still have to be WOKEN. Songs do that — "more songs = wakes more workers and keeps them
 *      awake to fight the sleeping sickness." Activation opens the room; songs staff it.
 *   5. With every room in a section activated, the Manager's Office unlocks and the stairs down with it.
 *
 * WHY A SEPARATE MODULE. Room state has to be read by the engine (lighting, device hit-tests, the
 * bloom marker), by Panels (card art, the permit's inventory entry) and by probes, and it must survive
 * a floor rebuild. Putting it in Engine9 would mean three consumers reaching into a 56k-line file for a
 * Set. This owns the state and nothing else; every consumer asks it.
 *
 * DELIBERATELY NOT IN HERE: any lighting, geometry, or topology work. This module is pure state — what
 * is dormant, what is awake, which card opens which room. The engine owns the draw. That split is why
 * activating a room cannot accidentally become a second visibility writer (the trap that cost weeks on
 * the monster silhouette and again on the cabaret residency).
 */

// ── The register ────────────────────────────────────────────────────────────── [REF#DA-00067]
// `roomIdKey` names the window global the engine already publishes for that room's id, so a floor
// rebuild cannot leave this table pointing at a stale number. CABARET is the only one wired today
// (window._cabaretRoomId); the rest resolve to -1 until their rooms exist, and a room that cannot be
// resolved is simply never activatable — it does not throw and it does not pretend to be awake.
// ── STAFF (Mark 2026-08-05) ───────────────────────────────────────────────────────────────────────
//    "a worker will come soon to start working at the building, where the worker roles icons are setup
//     for each room" · "add workers to room now" · "have a number % capacity when the room is entered".
//
//    `crew` is the room's FULL staff when it is running, and it is also the denominator of the capacity
//    readout: capacity% = workers actually posted / crew. `roles` names them, so the panel and any
//    future role icon read one table instead of each inventing its own list.
//
//    ⚠ THESE ARE MY DRAFT ROLES, NOT MARK'S. He asked for workers now and said to draft sensible ones
//    rather than block on naming, so they are here to be overruled — the kanji and the labels are the
//    only thing a rename touches. Most crew SIZES are deliberately small: floor 1 already lays 2-4 sleepers
//    per room (_workersPerRoomMin/Max in DungeonChain), so a crew of 6 would demand more bodies than
//    the floor generates and the capacity bar could never fill. FACTORY is the exception: its authored
//    machine floor publishes 16 worker circles and Mark's 2026-10-03 order is to let all 16 fill. [REF#DA-00233]
export const ROOM_PERMITS = Object.freeze({
    CABARET: {
        key: 'CABARET',
        label: 'CABARET',
        permit: 'SINGING',                 // Mark: "(SINGING = to activate CABERET)" [REF#DA-00068]
        roomIdKey: '_cabaretRoomId',
        device: 'stage',                   // "touches the stage, then it lights up" [REF#DA-00069]
        deviceHandleKeys: ['_cabGlbStage', '_cabDeck', '_cabPanelGroup'],
        thrum: null,                       // the cabaret wakes with her song, not with machinery [REF#DA-00070]
        kanji: '唄',
        crew: 4, roles: ['HOSTESS', 'DANCER', 'BARKEEP', 'DOORMAN'],
    },
    KITCHEN: {
        key: 'KITCHEN',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00229]
        label: 'KITCHEN',
        permit: 'KITCHEN PERMIT',
        altPermit: 'WORKS PERMIT',        // the one card that opens KITCHEN + FACTORY + STORAGE together (2026-09-10, SEAT_PIPELINE.md §4) [REF#DA-00211]
        roomIdKey: '_kitchenRoomId',
        device: 'stove',
        deviceHandleKeys: ['_kitchenDevice'],
        thrum: 'machine',
        kanji: '厨',
        crew: 3, roles: ['COOK', 'PREP HAND', 'DISHWASHER'],
    },
    STORE: {
        key: 'STORE',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00230 → see REF#DA-00229]
        label: '7-11 STORE',
        permit: 'STORE PERMIT',
        roomIdKey: '_storeRoomId',
        device: 'register',
        deviceHandleKeys: ['_storeDevice'],
        thrum: 'machine',
        kanji: '店',
        crew: 2, roles: ['CLERK', 'STOCKER'],
    },
    FACTORY: {
        key: 'FACTORY',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00231 → see REF#DA-00229]
        label: 'FACTORY',
        permit: 'FACTORY PERMIT',
        altPermit: 'WORKS PERMIT',
        roomIdKey: '_factoryRoomId',
        device: 'machine',
        deviceHandleKeys: ['_factoryDevice'],
        thrum: 'machine',
        kanji: '工',
        crew: 16, roles: ['FOREMAN', 'MACHINIST', 'HAULER', 'PACKER',
            'PRESS HAND', 'BELT TENDER', 'RIVETER', 'BOILER HAND',
            'SORTER', 'POLISHER', 'CRATE MAKER', 'RUNNER',
            'GEAR KEEPER', 'OILER', 'STAMPER', 'NIGHT SHIFT'],
    },
    // ── ADDED 2026-07-31 (Mark's floor-1 roster) ────────────────────────────────────────────── [REF#DA-00071]
    // "OTHER ROOMS : SAKE TAVERN (CABERET ADDON) : LABORATORY : FACTORY : GUARD POST"
    //
    // ⚠ KITCHEN and STORE above are NOT in that list and are NOT deleted — deliberately. They cost
    // nothing while their rooms do not exist (roomIdOf returns -1, so allRoomsActivated skips them
    // and nothing can ever activate them), and the konbini is a real, dedicated room in this game.
    // Removing a permit is a one-line edit; un-removing it means re-deriving the card art, the deck
    // row and the pickup wiring from scratch. Ask before cutting. — Claude, 2026-07-31.
    LABORATORY: {
        key: 'LABORATORY',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00232 → see REF#DA-00229]
        label: 'LABORATORY',
        permit: 'LABORATORY PERMIT',
        roomIdKey: '_labRoomId',
        device: 'still',
        deviceHandleKeys: ['_labDevice'],
        thrum: 'machine',
        kanji: '研',
        crew: 3, roles: ['ALCHEMIST', 'ASSISTANT', 'CLEANER'],
    },
    // ── THE PERMIT IS RETURNED AT THE FLOOR ICON, NOT SPENT ON PICKUP (Mark 2026-08-06) ────── [REF#DA-00072]
    // "it needs its floor return icon (where players return the guard room permit to) - when
    //  player gets the card, it lights up in ethereal floor bloom - a circle with a (!)."
    //
    // This SUPERSEDES Mark's 2026-08-05 `activateOn:'pickup'` ("that room is activated when the
    // permit drops from the defeated inspectors") — both orders recorded here per house rule, the
    // later word wins. The 08-05 reasoning ("a chore between the kill and the payoff") gave way to
    // a real beat: carrying the permit back to the 番所 and stamping it at the return circle IS the
    // payoff now, and the blooming icon walks the player there.
    //
    // `activateOn: 'return'` — deliberately NOT 'pickup', so the Engine9 pickup branch (keyed on
    // the literal string 'pickup') hands the card over via ADD_CARD but does NOT activate the room.
    // `marker: 'bespoke'` — the generic room-activator loop (Engine9 ~:9835) skips this room; the
    // guard room draws its OWN return icon (circle + (!), ethereal bloom) in the furniture pass,
    // where it knows the watch-station tile. Without this flag the generic dashed square AND the
    // bespoke circle would both stand in the room, and the generic one would eat the card first.
    //
    // The watch station still gets built: it is the room's dormant/active TELL (dead lantern and
    // blank tally board while condemned, lit when stamped), not a switch.
    GUARD_POST: {
        key: 'GUARD_POST',
        label: 'GUARD POST',
        permit: 'GUARD POST PERMIT',
        roomIdKey: '_guardPostRoomId',
        device: 'watch station',
        deviceHandleKeys: ['_guardPostDevice'],
        activateOn: 'return',
        marker: 'bespoke',
        thrum: 'machine',
        kanji: '番',
        crew: 2, roles: ['GATE GUARD', 'COAT CHECK'],
    },
    // ── THE SAKE TAVERN IS AN OPTIONAL ADD-ON (Mark 2026-07-31) ─────────────────────────────── [REF#DA-00073]
    // "now make tavern an optional add-on for the caberet - a card is needed for permit. in its
    //  place will be just an empty space until the card is found."
    //
    // `optional: true` keeps it OUT of allRoomsActivated(). That flag is the whole difference
    // between an add-on and a requirement: without it, finding every other permit would still
    // leave the Manager's Office sealed until the player also found this one, which would make
    // the tavern mandatory — the opposite of what was asked.
    //
    // `activateOn: 'pickup'` — the tavern appears the moment the card is FOUND, not when a device
    // is touched. The cabaret can demand a touch because its dead stage is still standing there to
    // walk up to; the tavern's dormant state is an EMPTY FLOOR, so there is nothing to touch. A
    // device gate here would be an unsolvable room.
    // ── THE 倉庫 HAS A PERMIT NOW, AND IT NEVER DID (Mark 2026-09-02) ─────────────────────────
    // "i want you to fix storage room. its just a room with barrels and chests in it. but once
    //  player cracks one oopen the inspector comes out to attack them. win, and the card permit pops
    //  out and the storage room activates for workers to work and store crap"
    //
    // ⚠ `STORE` ABOVE IS THE KONBINI, NOT THIS. They are two different rooms and the names are one
    // letter apart, which is exactly how a later seat wires the 7-Eternal's permit to the warehouse.
    // STORE = コンビニ (roomIdKey `_storeRoomId`); STORAGE = 倉庫 (roomIdKey `_storageRoomId`).
    // `Creator.SPECIAL_BUILDING` has assigned `storage` to section 3 since the three-section ruling
    // and there was no permit for it, so the room could never be activated by anything.
    //
    // ⚠ `ambushKeeper: true` IS LOAD-BEARING, NOT A LABEL. The permit-keeper law (Engine9 ~:18735)
    // designates ONE resident monster per special room and reports LOUDLY when a room has none —
    // "an unobtainable permit must never be silent". The 倉庫's keeper is not a resident: he is the
    // INSPECTOR who comes out of a barrel when the player cracks one. Without this flag the room is
    // correctly reported as unstaffed on every floor, which would be a true warning about a false
    // problem, and the next seat would "fix" it by parking a monster in the room and quietly
    // removing the ambush that IS the room's whole beat.
    STORAGE: {
        key: 'STORAGE',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00233 → see REF#DA-00229]
        label: 'STORAGE ROOM',
        permit: 'STORAGE PERMIT',
        altPermit: 'WORKS PERMIT',
        roomIdKey: '_storageRoomId',
        device: 'freight hoist',
        deviceHandleKeys: ['_storageDevice'],
        ambushKeeper: true,
        thrum: 'machine',
        kanji: '倉',
        crew: 3, roles: ['STOCK CLERK', 'LOADER', 'TALLY KEEPER'],
    },
    TAVERN: {
        key: 'TAVERN',
        label: 'SAKE TAVERN',
        // ⛔ SUPERSEDED 2026-09-10: "tavern already gets activated - remove the tavern card." The bar opens with the [REF#DA-00216]
        //    cabaret (Engine9 ~:37700 licenses TAVERN on the SINGING wake); there is no card for it any more. Its old
        //    card slot became WORKS PERMIT (altPermit on KITCHEN / FACTORY / STORAGE above).
        permit: null,
        roomIdKey: '_cabaretRoomId',        // it stands in the cabaret foyer, not a room of its own [REF#DA-00074]
        device: 'bar',
        deviceHandleKeys: ['_tavernGlbObj', '_barGobObj'],
        thrum: 'machine',
        kanji: '酒',
        optional: true,
        activateOn: 'cabaret',
        crew: 2, roles: ['SAKE MASTER', 'SERVER'],
    },
    // ── FLOOR 2's OWN TRIO (Mark 2026-09-11: "fix floor 2 with its own unique special rooms") ────── [REF#DA-00218]
    //    Dealt across sections 1-3 by Creator.FLOOR_SPECIAL_POOLS[2]; the rooms are carved by
    //    DungeonChain with their catalogue identity (Creator.SPECIAL_ROOM_META) and each gets one
    //    inspector ogre, so the same law as floor 1 applies: the ogre's card is the ONLY source of the
    //    permit, picking it up wakes the room, and each waking turns that wing's 番所 key.
    //    `flag` names the room-record flag the engine's generic stamp resolves `roomIdKey` from —
    //    the floor-1 rooms each carry a hand-written stamp; these three share one.
    ARMORY: {
        key: 'ARMORY',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00234 → see REF#DA-00229]
        label: 'ARMORY',
        permit: 'ARMORY PERMIT',
        roomIdKey: '_armoryRoomId',
        flag: 'isArmory',
        device: 'weapon rack',
        deviceHandleKeys: ['_armoryDevice'],
        thrum: 'machine',
        kanji: '武',
        crew: 3, roles: ['ARMORER', 'WHETSTONE HAND', 'QUARTERMASTER'],
    },
    ARCHERY: {
        key: 'ARCHERY',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00235 → see REF#DA-00229]
        label: 'ARCHERY RANGE',
        permit: 'ARCHERY PERMIT',
        roomIdKey: '_archeryRoomId',
        flag: 'isArchery',
        device: 'target line',
        deviceHandleKeys: ['_archeryDevice'],
        thrum: 'machine',
        kanji: '弓',
        crew: 3, roles: ['RANGE MASTER', 'FLETCHER', 'TARGET BOY'],
    },
    PRISON: {
        key: 'PRISON',
        activateOn: 'return', marker: 'circle',   // ⛔ SUPERSEDED 2026-09-14 by Mark: "there is no QUEST ! circle to walk to activate -- should be a big down arrow with a (!) for the gold ethereal circle for these quests return locations … do for each special room. where the player must go to activate that room once the ogre is killed and the activator card is picked up" — the 09-11 activate-on-pickup is retired; the card is handed over and the room's gold circle (Engine9 _buildPermitReturnCircle) is where it is stamped [REF#DA-00236 → see REF#DA-00229]
        label: 'PRISON',
        permit: 'PRISON PERMIT',
        roomIdKey: '_prisonRoomId',
        flag: 'isPrison',
        device: 'cell block',
        deviceHandleKeys: ['_prisonDevice'],
        thrum: 'machine',
        kanji: '牢',
        crew: 3, roles: ['WARDEN', 'TURNKEY', 'GAOLER'],
    },
});

/** Every permit card name, for loot tables / vending / card art to iterate. [REF#DA-00075] */
export const PERMIT_CARDS = Object.freeze([...new Set(Object.values(ROOM_PERMITS).flatMap(r => [r.permit, r.altPermit]).filter(Boolean))]);

/** Which room does this card open? Returns the room record, or null. Case/space tolerant. [REF#DA-00076] */
export function roomForPermit(cardName) {
    const want = String(cardName || '').trim().toUpperCase();
    if (!want) return null;
    for (const r of Object.values(ROOM_PERMITS)) if (r.permit && r.permit.toUpperCase() === want) return r;
    for (const r of Object.values(ROOM_PERMITS)) if (r.altPermit && r.altPermit.toUpperCase() === want) return r;   // WORKS PERMIT → first of its three rooms [REF#DA-00217]
    return null;
}

/** Is this card one of the permits? Cheap guard for hot paths (pickup, card render). [REF#DA-00077] */
export function isPermitCard(cardName) { return !!roomForPermit(cardName); }

// ── Live state ──────────────────────────────────────────────────────────────── [REF#DA-00078]
// Activation is PER FLOOR. A permit is a permanent skill the player keeps, but the rooms on floor 2 are
// different rooms and start dark again — otherwise finding four cards on floor 1 would switch the whole
// game on forever, and the Dungeon-Keeper loop evaporates after the first level.
// ⛔ SUPERSEDED 2026-09-03: this read was `w.DUNGEON_LEVEL`, which NOTHING in the tree has ever
//    assigned — `DUNGEON_LEVEL` is Engine8 vocabulary and is a module-private `let` in Engine9. So
//    the fallback always won and this guard computed floor 1 on every floor. It now reads
//    `window._currentFloor`, published beside the floor's seed in the engine frame and already the
//    name the panels frame uses.
// ⚠ AND THE GUARD IS REDUNDANT TODAY, WHICH IS EXACTLY WHY IT MUST BE CORRECT. Measured 2026-09-03:
//    `_roomActivation` is never persisted (it exists on these three lines and nowhere else in the
//    tree — no save, snapshot, or storage path names it), and descending RELOADS the engine iframe
//    with `?floor=N` (OrigamiUnderworld.html ~:1434), so a fresh `window` already discards the awake set
//    on every floor change. Nothing observable moved when this was fixed.
//    THE FUTURE THIS IS THE NET FOR: Engine9 ~:66176 says the parent reloads this iframe and "boot
//    then re-applies state". The day that re-applied state carries activated rooms, the reload stops
//    clearing them and THIS LINE is the only thing standing between floor 1's awake set and floor 2.
//    A guard reading a dead name would not have caught it, and every gate would have stayed green.
const _state = () => {
    const w = (typeof window !== 'undefined') ? window : globalThis;
    if (!w._roomActivation) w._roomActivation = { floor: null, awake: new Set() };
    const floor = (typeof w._currentFloor === 'number') ? w._currentFloor : 1;
    if (w._roomActivation.floor !== floor) { w._roomActivation.floor = floor; w._roomActivation.awake = new Set(); }
    return w._roomActivation;
};

export function isRoomActivated(roomKey) { return _state().awake.has(String(roomKey || '').toUpperCase()); }

/** Every awake room on this floor, for the section-complete check. [REF#DA-00079] */
export function activatedRooms() { return [..._state().awake]; }

/** Resolve a room record to its LIVE room id, or -1 when this floor has no such room. [REF#DA-00080] */
export function roomIdOf(room) {
    const w = (typeof window !== 'undefined') ? window : globalThis;
    const v = room && room.roomIdKey ? w[room.roomIdKey] : undefined;
    return (typeof v === 'number' && v >= 0) ? v : -1;
}

/** [REF#DA-00081]
 * Wake a room. Returns true only on the DORMANT→AWAKE edge, so callers can fire one-shot effects
 * (bloom, thrum, the log line) without tracking their own "did I already do this" flag — the same
 * edge-returning contract _setCabaretApproachResident uses, for the same reason.
 */
export function activateRoom(roomKey, opts = {}) {
    const key = String(roomKey || '').toUpperCase();
    const room = ROOM_PERMITS[key];
    if (!room) return false;
    const st = _state();
    if (st.awake.has(key)) return false;                 // already awake — not an edge [REF#DA-00082]
    st.awake.add(key);
    const w = (typeof window !== 'undefined') ? window : globalThis;
    w._roomActivatedAt = w._roomActivatedAt || {};
    w._roomActivatedAt[key] = (typeof performance !== 'undefined') ? performance.now() : 0;
    // Telemetry rides the existing tagged-anomaly channel rather than a new one. OniBaba8 routes any [REF#DA-00083]
    // tagged kind that carries no d.error/d.count to its own honest label (:838), so this shows up as
    // ROOM_ACTIVATED and never as a scary engine_loop_throw.
    // opts.restore (2026-09-27, the save rebuild): a save/load putting back a room the player woke earlier. The notice still [REF#PENDING]
    // goes out, tagged, so Oni-Baba can tell it apart — she pays +1 karma per room only on the real wake, and the restored
    // karma already holds that +1. Measured before this: `silent` only muted the console line below, so every load re-paid
    // one karma per awake room.
    const restore = opts.restore === true;
    try {
        w.parent?.postMessage({ type: 'ENGINE_ANOMALY', kind: 'ROOM_ACTIVATED',
            subsystem: room.key, id: room.permit, restore }, '*');
    } catch (_) {}
    if (!restore) try {
        w.parent?.postMessage({ type: 'LOG_EVENT', logType: 'system',
            text: `🔌 <b>${room.label}</b> hums back to life — the ${room.device} is running again.` }, '*');
    } catch (_) {}
    if (opts.silent !== true) { try { console.log(`[PERMIT] ${room.key} activated by ${room.permit}`); } catch (_) {} }
    return true;
}

/** [REF#DA-00084]
 * TAKE A ROOM BACK. The inverse of activateRoom, and until 2026-08-05 there wasn't one — a room could
 * only ever be switched on, because nothing in the game had a reason to switch one off.
 *
 * Mark 2026-08-05, on striking the Starlette: "the caberet permit will go away too. player should learn
 * to behave." Losing the permit has to mean the room goes back to sleep, or the player keeps a lit
 * cabaret they are no longer entitled to and the punishment is cosmetic.
 *
 * Returns true only on the AWAKE→DORMANT edge, mirroring activateRoom's contract so callers can fire
 * one-shot effects without tracking their own flag.
 *
 * ⚠ THIS DOES NOT TAKE THE CARD. The hand lives in the parent frame; the engine spends a card with
 * SET_CARD_QTY qty 0. Both halves are needed — this one alone leaves the card in hand pointing at a
 * dark room, and that one alone leaves the room lit with no permit behind it.
 */
export function revokeRoom(roomKey, opts = {}) {
    const key = String(roomKey || '').toUpperCase();
    const room = ROOM_PERMITS[key];
    if (!room) return false;
    const st = _state();
    if (!st.awake.has(key)) return false;                // already dark — not an edge [REF#DA-00085]
    st.awake.delete(key);
    const w = (typeof window !== 'undefined') ? window : globalThis;
    if (w._roomActivatedAt) delete w._roomActivatedAt[key];
    try {
        w.parent?.postMessage({ type: 'ENGINE_ANOMALY', kind: 'ROOM_REVOKED',
            subsystem: room.key, id: room.permit }, '*');
    } catch (_) {}
    if (opts.quiet !== true) try {
        w.parent?.postMessage({ type: 'LOG_EVENT', logType: 'system',
            text: `🔒 <b>${room.label}</b> goes dark — the ${room.permit} permit is void.` }, '*');
    } catch (_) {}
    if (opts.silent !== true) { try { console.log(`[PERMIT] ${room.key} REVOKED — ${room.permit} permit void`); } catch (_) {} }
    return true;
}

/** Reset — floor change or a new game. Permits are kept; the rooms go dark again. [REF#DA-00086] */
export function resetActivation() { const st = _state(); st.awake.clear(); }

/** [REF#DA-00087]
 * Section-complete gate: are all rooms that EXIST on this floor awake? Rooms whose id cannot be
 * resolved are skipped rather than counted as blockers — otherwise floor 1, which has no factory yet,
 * could never complete and the Manager's Office could never unlock.
 */
export function allRoomsActivated() {
    // `optional` rooms are add-ons and never gate the section (Mark 2026-07-31, the sake tavern). [REF#DA-00088]
    // Filtered here rather than at the call site so every consumer — the Manager's Office door, the
    // stairs, any probe — gets the same answer from one rule instead of each re-deriving it.
    const present = Object.values(ROOM_PERMITS).filter(r => r.optional !== true && roomIdOf(r) >= 0);
    if (!present.length) return false;
    return present.every(r => isRoomActivated(r.key));
}

// Console + probe surface, same idiom as window._tpRoom / _playerRoom. Probes cannot import ES modules [REF#DA-00089]
// into the engine frame, so without this there is no honest way to ask what is awake.
if (typeof window !== 'undefined') {
    window.ROOM_PERMITS = ROOM_PERMITS;
    window._isRoomActivated = isRoomActivated;
    window._activateRoom = activateRoom;
    window._revokeRoom = revokeRoom;
    window._activatedRooms = activatedRooms;
    window._allRoomsActivated = allRoomsActivated;
    window._roomForPermit = roomForPermit;
    window._isPermitCard = isPermitCard;
    window._resetRoomActivation = resetActivation;
}
