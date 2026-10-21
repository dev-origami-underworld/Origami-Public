/** [REF#EN-00341]
 * PathFinder.js — T0.1 extraction from NewOrigami.Engine9.html
 *
 * Pure pathfinding utilities. No Three.js dependency.
 * Factory pattern: createPathFinder(map, MAP_W, MAP_H) → { monAStar }
 *
 * Preserves T0.6 behaviour exactly:
 *   _monAStar(sx, sz, gx, gz) — grid-based A*, 4-directional, Manhattan
 *   heuristic, capped at _MON_A_STAR_MAX expansions. Returns [[gx,gz],...]
 *   from start to goal (inclusive), or null on failure.
 */

const _MON_A_STAR_MAX = 800;   // bumped from 200 — cross-floor chases need a bigger expansion budget so monsters that lose LOS can still path to the player through doors. [REF#EN-00342]

/** [REF#EN-00343]
 * _cabDoorBlocks(gx, gz, selfUd) — cabaret-door rule for the PLANNER.
 *
 * MUST stay in lockstep with the COLLIDER, `_canMonsterStandRaw` (Engine9 ~7418). These are the only
 * two walkability oracles in the game and they answer the same question. When they drift, A* declares
 * "no path" through a door the monster is actually allowed to WALK through — and a failed A* is the
 * most expensive A* there is (it cannot early-exit; it floods the whole reachable region to conclude
 * null). That is the divergence fixed on 2026-07-16: this rule was an unconditional
 * `_cabDoorTiles.has(...)` block that ignored open/closed, ignored `_ofCabaret`, and ignored
 * `_pathForPlayer` — so every cabaret dweller chasing anything outside room 1 failed A* on EVERY call,
 * forever (the permanently-stuck hostile mummy at tile 35,52).
 *
 * Only the actual door state blocks a route; actor origin does not.
 */
/** [REF#PENDING] [REF#EN-00684]
 * _stageDeckBlocks(gx, gz, selfUd) — "no monster but the dancer sets foot on the stage" (Mark 2026-09-19:
 * "make sure monsters ... right now no other monsters are allowed to collide with stage until noted.
 * Starlette is a Daemon, not a monster. succubus is a monster but she has special defenses.")
 *
 * MUST stay in lockstep with the COLLIDER's own stage-deck ejector in `_canMonsterStandRaw` (Engine9
 * ~31798, `_dancerBelongsHere`), the same two-oracle relationship `_cabDoorBlocks` documents above — that
 * one is REACTIVE (shoves a monster back off the deck the tick after it arrives); this one is PREVENTIVE
 * (the planner never routes a monster there in the first place), so a chasing hostile never even flickers
 * onto the stage before being pushed out. `window._stageDeckCollider` is world-space (minX/maxX/minZ/maxZ,
 * built once the deck GLB settles — Engine9 ~40200/~40315); converted to tile space here via `window.GRID`
 * (exposed globally, Engine9 ~35766) since this module carries no Three.js/world-unit dependency of its own.
 * No deck built yet on this floor → nothing to block. `isDancer` is the ONLY exemption — Starlette is not a
 * monster at all (no userData reaches this planner for her) and the succubus-flagged dead alias earns no
 * pass here on purpose, matching the collider's own comment that `isSuccubus` is retired. Off:
 * window._stageDeckPathBlock = false.
 */
function _stageDeckBlocks(gx, gz, selfUd) {
    if (typeof window === 'undefined' || window._stageDeckPathBlock === false) return false;
    if (selfUd && selfUd.isDancer === true) return false;
    const sdc = window._stageDeckCollider;
    const GRID = window.GRID;
    if (!sdc || typeof GRID !== 'number' || !GRID) return false;
    // TILE CENTRE = gx * GRID (2026-09-30), the convention _canMonsterStandRaw and the deck ejector use. This read (gx + 0.5) * GRID, [REF#EN-00795]
    // half a tile east and south, so it blocked x56 (the cabaret's N backstage door and the tile in front of it) and left x60 of the
    // real deck routable. Measured on floor 1: the player's A* had no path through the N door at all.
    const wx = gx * GRID, wz = gz * GRID;
    return wx > sdc.minX && wx < sdc.maxX && wz > sdc.minZ && wz < sdc.maxZ;
}

// HER QUEST CIRCLE IS SACRED GROUND — the collider (_canMonsterStandRaw, "nothing that walks may stand on that tile") refuses it, [REF#EN-00724]
// and this planner did not: traced 2026-09-25, a worker's path ran over tile 58,62 and it stood at the circle's edge for minutes.
// The two oracles must agree. Off (both): window._questCircleReserved = false.
function _questCircleBlocks(gx, gz) {
    if (typeof window === 'undefined' || window._pathForPlayer || window._questCircleReserved === false) return false;
    const q = window._questFloorTile;
    return Array.isArray(q) && q[0] === gx && q[1] === gz;
}

function _tavernQuestCircleBlocks(gx, gz) {
    if (typeof window === 'undefined' || window._pathForPlayer || window._tavernQuestCircleReserved !== true) return false;
    const q = window._tavernQuestCircleTile;
    return Array.isArray(q) && q[0] === gx && q[1] === gz;
}

function _cabDoorBlocks(gx, gz) {
    if (typeof window === 'undefined') return false;
    // The PLAYER's click-to-move path may cross the cabaret threshold exactly like WASD does. The [REF#EN-00344]
    // collider already honours this flag; the planner previously did NOT, which is why click-to-move
    // into the cabaret still answered "⚠ No clear path" despite the 2026-06-29 fix. (Engine9 ~7993.)
    if (window._pathForPlayer) return false;
    const tiles = window._cabDoorTiles;
    if (!tiles || !tiles.size || !tiles.has(gx + ',' + gz)) return false;
    if (typeof window._isRoomActivated !== 'function' || window._isRoomActivated('CABARET') !== true) return true;
    // A genuinely shut, INTACT door blocks everyone. Open OR destroyed blocks nobody by itself. [REF#EN-00345]
    // ⛔ SUPERSEDED 2026-09-26 by Mark: "monsters can open up ANY unlocked door - its cool" — a shut cabaret door no longer stops a
    //    monster's route by itself (it opens on the push); the open-door rule below still decides who may cross. Locked doors stay
    //    solid through the door-record test in the search. Off: window._monOpensCabDoor = false.
    const closedFn = window._cabDoorClosedAtTile;
    if ((typeof closedFn !== 'function' || closedFn(gx, gz)) && window._monOpensCabDoor === false) return true;
    // An open door is passable to every mover, matching _canMonsterStandRaw. [REF#EN-00803]
    return false;
}

/** [REF#EN-00347]
 * createPathFinder(map, MAP_W, MAP_H)
 *
 * @param {Array}  map   - 2-D tile array from MapGen. map[x][z].type === 'wall'|'floor'|...
 * @param {number} MAP_W - grid width
 * @param {number} MAP_H - grid height
 * @returns {{ monAStar: Function }}
 */
export function createPathFinder(map, MAP_W, MAP_H) {
    const guardExitStair = (cell, ud) => cell?.roomId === 0
        && (cell.type === 'stairs_up' || cell.type === 'stairs_up_r')
        && (ud?.nameKey === 'skeleton_guard' || ud?.nameKey === 'skeleton_archer')
        && !(typeof window !== 'undefined' && window._pathForPlayer);
    /** [REF#EN-00348]
     * monAStar(sx, sz, gx, gz)
     *
     * Grid-cell A* from (sx,sz) → (gx,gz). Coordinates are GRID-cell indices,
     * not world-units. Uses Manhattan heuristic. Caps at _MON_A_STAR_MAX node
     * expansions so it degrades gracefully on large maps.
     *
     * Returns array of [gx,gz] tuples from start to goal, or null when no path
     * is found within the expansion budget.
     */
    function monAStar(sx, sz, gx, gz, selfUd) {
        if (sx === gx && sz === gz) return [[sx, sz]];
        // Bail fast if goal is in a wall [REF#EN-00349]
        const goalCell = map[gx]?.[gz];
        if (guardExitStair(goalCell, selfUd)) return null;
        if (!goalCell || goalCell.type === 'wall' || goalCell.type === 'shoji') return null;
        // CABARET DOORS (room 1 isolation, Mark 2026-06-23) — fast-fail if the target IS a door tile this [REF#EN-00350]
        // mover may not cross. See _cabDoorBlocks: the rule mirrors the collider, it is NOT unconditional.
        if (_cabDoorBlocks(gx, gz)) return null;
        if (_stageDeckBlocks(gx, gz, selfUd)) return null;
        if (_questCircleBlocks(gx, gz)) return null;
        if (_tavernQuestCircleBlocks(gx, gz)) return null;
        // THIN-WALL EDGE awareness (Mark 2026-06-16: "monsters treat entrances like a barrier"). [REF#EN-00352]
        // Room-divider panes are EDGES (window._thinWallEdgeSet, keys 'x,z,E'/'x,z,S'), NOT wall tiles —
        // door gaps are never in the set. Read live (populated at floor load, after this factory runs).
        const _eset = (typeof window !== 'undefined') ? window._thinWallEdgeSet : null;
        // BODY-BLOCKED STEPS (2026-09-25, found by Oni-Baba's workforce verdict): furniture solids (backstage dressing table, [REF#EN-00727]
        // desk, chair) ride in _thinWallColliders, and some panes have a collider but no edge key — a body cannot cross them
        // and A* routed straight through. Engine9 derives every such tile→tile step from the colliders into this set.
        const _wset = (typeof window !== 'undefined' && window._pathKnowsColliders !== false) ? window._walkBlockEdgeSet : null;
        // RE-ROUTE AROUND THE BODY THAT WOULD NOT MOVE (2026-10-02, knowledge/design/PEER_TURNBACK_2026-10-02.md): a mover that turned back [REF#EN-00796]
        // from a peer it could not shove carries that peer's tile for a few seconds. It costs extra (window._rerouteAvoidCost, 8) — a COST,
        // never a wall, so a detour is taken when there is one and the same way is kept when there is not (the body may have moved by then).
        const _rav = (selfUd && selfUd._rerouteAvoid && selfUd._rerouteAvoid.until > ((typeof performance !== 'undefined') ? performance.now() : 0)) ? selfUd._rerouteAvoid.keys : null;
        const _ravCost = (typeof window !== 'undefined' && typeof window._rerouteAvoidCost === 'number') ? window._rerouteAvoidCost : 8;

        const open = [{ gx: sx, gz: sz, f: Math.abs(sx - gx) + Math.abs(sz - gz) }];
        const gScore = new Map();
        const cameFrom = new Map();
        const sk = sx + ',' + sz;
        gScore.set(sk, 0);
        const closed = new Set();
        let expanded = 0;
        const playerRoute = typeof window !== 'undefined' && window._pathForPlayer === true;
        const expansionLimit = playerRoute ? MAP_W * MAP_H : _MON_A_STAR_MAX;

        while (open.length && expanded < expansionLimit) {
            // O(n) min — n stays small for short chase paths [REF#EN-00353]
            let bestIdx = 0;
            for (let i = 1; i < open.length; i++) {
                if (open[i].f < open[bestIdx].f || (playerRoute && open[i].f === open[bestIdx].f
                    && Math.abs(open[i].gx-gx)+Math.abs(open[i].gz-gz) < Math.abs(open[bestIdx].gx-gx)+Math.abs(open[bestIdx].gz-gz))) bestIdx = i;
            }
            const cur = open.splice(bestIdx, 1)[0];
            const ck = cur.gx + ',' + cur.gz;
            if (cur.gx === gx && cur.gz === gz) {
                // reconstruct [REF#EN-00354]
                const path = [[cur.gx, cur.gz]];
                let k = ck;
                while (cameFrom.has(k)) {
                    k = cameFrom.get(k);
                    const [px2, pz2] = k.split(',').map(Number);
                    path.unshift([px2, pz2]);
                }
                return path;
            }
            closed.add(ck);
            expanded++;
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (let d = 0; d < 4; d++) {
                const nx = cur.gx + dirs[d][0];
                const nz = cur.gz + dirs[d][1];
                if (nx < 0 || nx >= MAP_W || nz < 0 || nz >= MAP_H) continue;
                const cell = map[nx]?.[nz];
                if (!cell) continue;
                if (guardExitStair(cell, selfUd)) continue;
                let _doorCost = 0;
                if (cell.type === 'wall' || cell.type === 'shoji') {
                    // A SHUT, OPENABLE DOOR IS NOT ROCK (Mark 2026-09-21 "need better a*path", after a Skeleton [REF#PENDING] [REF#EN-00700]
                    // Archer sat stuck with LOS to the player, action=none(boxed)). SOLID-WHEN-CLOSED (Engine9
                    // ~106142) swaps a shut door's map tile to literal 'wall' so every existing wall-check blocks
                    // it for free — but it never clears the tile's doorId, and any hostile can bash/push open an
                    // UNLOCKED door (2026-09-21, earlier same session: "monsters can open all unlocked doors").
                    // Before this, A* could not tell a shut door from real stone, so a mover whose ONLY route ran
                    // through one got no path at all and sat boxed forever — exactly the stuck-with-LOS
                    // signature. A door tile stays passable to A* unless its own record says locked/destroyed;
                    // real rock carries no doorId and is unaffected. Extra cost so the search still PREFERS an
                    // already-open route when one exists. Off: window._aStarThroughClosedDoors = false.
                    let _passable = false;
                    const _doorId = cell.doorId;
                    if (_doorId && typeof window !== 'undefined' && window._aStarThroughClosedDoors !== false
                        && typeof window._allDoors === 'function') {
                        try {
                            const _rec = window._allDoors().find(dd => dd && dd.doorId === _doorId);
                            // ⛔ SUPERSEDED 2026-09-26 by Mark: "monsters can open up ANY unlocked door - its cool" — cabaret doors included; [REF#EN-00728]
                            //    the engine's door tick opens one on a monster's push too. Off: window._monOpensCabDoor = false.
                            _passable = !!_rec && _rec.locked !== true && _rec.destroyed !== true
                                && !(window._monOpensCabDoor === false && !window._pathForPlayer && typeof window._isCabDoorRec === 'function' && window._isCabDoorRec(_rec));
                            // a section door is shut to monsters until the player opens it (2026-10-03, the engine's _sectionDoorShutToMon) [REF#EN-00797]
                            if (_passable && !window._pathForPlayer && typeof window._sectionDoorShutToMon === 'function' && window._sectionDoorShutToMon(_rec)) _passable = false;
                            // Mark 2026-09-26: "ants cannot open doors!" — a shut door is solid to an ant. Off: window._antsOpenDoors = true. [REF#EN-00729]
                            if (selfUd && selfUd.nameKey === 'ant' && window._antsOpenDoors !== true) _passable = false;
                            // ⛔ SUPERSEDED 2026-10-02 (Engine9 register entry "VIOLENT CREATURES OPEN NO DOORS"; the order's words are there) — [REF#EN-00798]
                            //    every violent creature (the engine's _violentNoDoors: ants, hungry ghosts, codex-violent; never orcs) is refused a shut door.
                            if (selfUd && typeof window._violentNoDoors === 'function' && window._violentNoDoors(selfUd)) _passable = false;
                        } catch (_) {}
                    }
                    if (!_passable) continue;
                    _doorCost = 2;   // shut leaf is a real obstacle to walk through, not free floor [REF#PENDING] [REF#EN-00701]
                }
                // CABARET DOORS (room 1 isolation, Mark 2026-06-23) — never route A* through one this mover [REF#EN-00355]
                // may not cross. Mirrors the collider; see _cabDoorBlocks.
                if (_cabDoorBlocks(nx, nz)) continue;
                // an intact 1-tile leaf is a shut door to a violent creature (2026-10-02) — the engine's own tile test [REF#EN-00799]
                if (selfUd && typeof window._violentLeafAtTile === 'function' && window._violentLeafAtTile(nx, nz, selfUd)) continue;
                if (_stageDeckBlocks(nx, nz, selfUd)) continue;
                if (_questCircleBlocks(nx, nz)) continue;
                if (_tavernQuestCircleBlocks(nx, nz)) continue;
                // A LOCKED ROOM OR DOORWAY IS SOLID TO A* TOO — canWalk (Engine9) refuses `locked`/`lockedRoom` tiles until _lockOpen says [REF#EN-00730]
                // otherwise, this planner did not. Traced 2026-09-25: workers' routes ran through the locked guard room (tile 63,69) and they
                // stood at its threshold. Same predicate, read live. Off: window._aStarHonoursLocks = false.
                if (window._aStarHonoursLocks !== false && (cell.locked === true || cell.lockedRoom !== undefined)
                    && !(typeof window._lockOpen === 'function' && window._lockOpen(cell))) continue;
                // Block the thin-wall PANE between cur→neighbor (door gaps aren't in the set, so A* is [REF#EN-00356]
                // forced to route through them). Edge keys mirror the build + _hasLineOfSight's DDA.
                if (_eset || _wset) {
                    const _dx = dirs[d][0], _dz = dirs[d][1];
                    const _ek = (_dx === 1)  ? (cur.gx + ',' + cur.gz + ',E')
                              : (_dx === -1) ? ((cur.gx - 1) + ',' + cur.gz + ',E')
                              : (_dz === 1)  ? (cur.gx + ',' + cur.gz + ',S')
                              :                (cur.gx + ',' + (cur.gz - 1) + ',S');
                    if (_eset && _eset.has(_ek)) continue;   // thin-wall pane — impassable; go via a door gap [REF#EN-00357]
                    // A DOOR LEAF IS NOT A WALL TO THE PLANNER (2026-10-16 late, CODER 1, Mark: "if a player is in one section they can easily click [REF#EN-00804]
                    //    in any other section and travel there"). SEEN 2026-10-16 (live runner, :5500, start 58,73): player A* reached 0/31 rooms in
                    //    sections 1-3; with _walkBlockEdgeSet off, 31/31. The blocking edges were the collider edges on both sides of the three
                    //    closed SECTION door leaves (DOOR_010 / _012 / _034). A collider edge touching a door tile now yields to the door rule the
                    //    tile branch above already applied (unlocked, not destroyed, this mover may use it); real prop colliders still block.
                    //    Off: window._aStarDoorLeafEdges = false.
                    if (_wset && _wset.has(_ek)) {
                        let _leaf = false;
                        if (window._aStarDoorLeafEdges !== false && typeof window._allDoors === 'function') {
                            const _c0 = map[cur.gx]?.[cur.gz];
                            for (const _dc of [cell, _c0]) {
                                if (!_dc || !_dc.doorId) continue;
                                try {
                                    const _rec = window._allDoors().find(dd => dd && dd.doorId === _dc.doorId);
                                    let _ok = !!_rec && _rec.locked !== true && _rec.destroyed !== true;
                                    if (_ok && !window._pathForPlayer && typeof window._sectionDoorShutToMon === 'function' && window._sectionDoorShutToMon(_rec)) _ok = false;
                                    if (_ok && selfUd && selfUd.nameKey === 'ant' && window._antsOpenDoors !== true) _ok = false;
                                    if (_ok && selfUd && typeof window._violentNoDoors === 'function' && window._violentNoDoors(selfUd)) _ok = false;
                                    if (_ok) { _leaf = true; break; }
                                } catch (_) {}
                            }
                        }
                        if (!_leaf) continue;
                    }
                }
                const nk = nx + ',' + nz;
                if (closed.has(nk)) continue;
                const tg = (gScore.get(ck) ?? Infinity) + 1 + _doorCost + ((_rav && _rav.has(nk) && !(nx === gx && nz === gz)) ? _ravCost : 0);
                if (tg < (gScore.get(nk) ?? Infinity)) {
                    cameFrom.set(nk, ck);
                    gScore.set(nk, tg);
                    const f = tg + Math.abs(nx - gx) + Math.abs(nz - gz);
                    // Replace or push [REF#EN-00358]
                    let foundOpen = false;
                    for (let i = 0; i < open.length; i++) {
                        if (open[i].gx === nx && open[i].gz === nz) { open[i].f = f; foundOpen = true; break; }
                    }
                    if (!foundOpen) open.push({ gx: nx, gz: nz, f });
                }
            }
        }
        return null;
    }

    return { monAStar };
}

export default createPathFinder;
