/** CastleSectionPlanner — binds the SPECIAL ROOMS to the Shogun castle templates, so a section is [REF#DG-01961]
 *  laid out like a castle ward instead of rooms hung off a corridor.
 *
 *  Mark 2026-09-08: "just have creators now use our special rooms and build sections around them
 *  that look like a castle design architecture now."
 *
 *  WHAT THIS IS, AND WHAT IT IS NOT.
 *  It is the BINDING layer, and it was the missing one. Two halves already existed and had never
 *  been introduced:
 *    · ShogunCastleTemplates.mjs knows castle ARCHITECTURE — masugata dogleg gate, rōka galleries,
 *      a MAJOR building at the heart, mission routes — but speaks only in abstract roles.
 *    · Creator knows the ROOMS — SPECIAL_BUILDING per section plus the 20 filler specials added
 *      2026-09-08 — but had no notion of how a ward is shaped.
 *  This joins them: every role a template declares comes back bound to a REAL room with a real
 *  name and a real footprint. Nothing here carves tiles. Turning a bound plan into geometry is a
 *  COMPILER's job (ShogunSection1.mjs is the one worked example, section 1 only), and pretending
 *  otherwise is how a plan starts claiming to be a floor.
 *
 *  ⚠ CREATOR IS A GLOBAL SCRIPT, NOT A MODULE. It cannot `import` this file and this file cannot
 *    `import` it — Creator.js ends with `global.Creator = API`. So the catalogue is read off the
 *    global at call time and its absence is REPORTED, never defaulted: a planner that quietly
 *    invents room names when the catalogue is missing is worse than one that refuses.
 */
import { deriveShogunCastlePlan, assertShogunCastlePlan, stableCastleHash32,
    FLOOR_1_V25_SECTION_IDENTITIES, MISSION_GRAPH_FAMILIES } from './ShogunCastleTemplates.mjs?v=8.4.147-castle-sections';

export const CASTLE_SECTION_PLANNER_VERSION = 'castle-section-planner-v1';

/** The mission family a section is built to. Deterministic from the floor seed, never the global RNG. [REF#DG-01962] */
export function missionFamilyFor(layoutSeed, floor, sectionId) {
    const i = stableCastleHash32(layoutSeed, floor, sectionId, 'mission-family') % MISSION_GRAPH_FAMILIES.length;
    return MISSION_GRAPH_FAMILIES[i];
}

function creatorOrThrow(creator) {
    const C = creator || (typeof globalThis !== 'undefined' && globalThis.Creator) || null;
    if (!C) throw new Error('CastleSectionPlanner: Creator is not loaded — the room catalogue lives there');
    if (!Array.isArray(C.FILLER_ROOMS)) throw new Error('CastleSectionPlanner: Creator.FILLER_ROOMS is missing');
    if (!C.SPECIAL_ROOM_META) throw new Error('CastleSectionPlanner: Creator.SPECIAL_ROOM_META is missing');
    return C;
}

/** One bound room: the castle ROLE plus the actual special that fills it. [REF#DG-01963] */
function bindRoom(C, role, tag, rokaId, level) {
    const meta = C.SPECIAL_ROOM_META[tag] || null;
    const entry = (C.FILLER_ROOMS || []).find(f => f.tag === tag) || null;
    // Sizes come from the same ladder `_placeSpecial` degrades through, largest first, so a bound [REF#DG-01964]
    // plan promises nothing the placer cannot actually fit.
    // SIZE comes from the depth-scaled ladder when this floor has one — "bigger for each level"
    // (Mark 2026-09-08) — and falls back to the catalogue's authored ladder otherwise.
    const grown = (typeof C.fillerRoomsFor === 'function')
        ? (C.fillerRoomsFor(level).find(f => f.tag === tag) || null) : null;
    const sizes = (grown && grown.sizes) || (entry && entry.sizes) || null;
    return {
        role, rokaId, tag,
        roomType:   meta ? meta.roomType   : tag,
        roomName:   meta ? meta.roomName   : null,
        roomNameEn: meta ? meta.roomNameEn : null,
        flag:       meta ? meta.flag       : null,
        sizes,
        // A special's footprint is authored, so room-shape has no jurisdiction over it [REF#DG-01965]
        // (Mark 2026-09-08). The carver must pass this through to createRoom.
        special: true,
    };
}

/** [REF#DG-01966]
 * Bind ONE section to a castle template.
 * Returns { plan, major, normals, roka, masugata, routes } — every role carrying a real room.
 * `exclude` is a Set of tags already used elsewhere on this floor, so a floor never shows the
 * same special twice; that is the whole point of a 20-room catalogue.
 */
export function planCastleSection({ layoutSeed, floor = 1, sectionId, missionFamily, creator, exclude } = {}) {
    if (layoutSeed == null || layoutSeed === '') throw new TypeError('planCastleSection needs a layoutSeed');
    const C = creatorOrThrow(creator);
    const identity = FLOOR_1_V25_SECTION_IDENTITIES.find(s => s.sectionId === sectionId);
    if (!identity) throw new RangeError('Unknown sectionId: ' + sectionId);
    const family = missionFamily || missionFamilyFor(layoutSeed, floor, sectionId);

    const plan = deriveShogunCastlePlan({ layoutSeed: String(layoutSeed), floor, section: identity,
        missionFamily: family, normalRoomRoles: ['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF'] });
    assertShogunCastlePlan(plan);

    // THE MAJOR IS THE SECTION'S OWN BUILDING, NEVER A FILLER. SPECIAL_BUILDING is the single [REF#DG-01967]
    // registry of which section gets which building and this does not get a vote — a section whose
    // heart is a bathhouse instead of its cafeteria is a different floor, not a varied one.
    const majorTag = (C.SPECIAL_BUILDING && C.SPECIAL_BUILDING[sectionId]) || 'room';
    const major = bindRoom(C, 'MAJOR', majorTag, plan.roka[0] ? plan.roka[0].id : null, floor);

    // The normals are drawn from the filler catalogue, deterministically and WITHOUT REPEATS. [REF#DG-01968]
    const used = new Set(exclude || []);
    used.add(majorTag);
    // ⚠ THE POOL IS THE WHOLE CATALOGUE, NOT `fillerRoomsFor(floor)`. Measured 2026-09-08: the first [REF#DG-01969]
    //   cut drew from the depth-scaled list, which sizes a pool for ONE section — floor 1 offers 3 —
    //   so section 1 took all of them and sections 2, 3 and 4 came back with NO ROOMS AT ALL while
    //   still reporting a perfectly good castle template. A ward with a gate, galleries and nothing
    //   inside it is the exact failure this planner exists to prevent.
    //   The two axes are separate and were being conflated: `fillerRoomsFor(floor)` governs SIZE
    //   ("bigger for each level"), the full catalogue governs VARIETY. A floor needs sections x roles
    //   rooms — 4 x 4 = 16 against a catalogue of 20 — so availability must be the catalogue.
    const pool = (C.FILLER_ROOMS || []).map(f => f.tag).filter(t => !used.has(t));
    const normals = plan.normalRooms.map((room, i) => {
        // Rotate the pool by a seeded index so two sections on one floor do not open with the same [REF#DG-01970]
        // room, and the same seed always lays out the same castle.
        let tag = null;
        for (let k = 0; k < pool.length; k++) {
            const cand = pool[(stableCastleHash32(layoutSeed, floor, sectionId, room.role, 'pick') + k) % pool.length];
            if (!used.has(cand)) { tag = cand; break; }
        }
        if (!tag) return null;           // catalogue exhausted — REPORT by omission, never repeat [REF#DG-01971]
        used.add(tag);
        return bindRoom(C, room.role, tag, room.rokaId, floor);
    }).filter(Boolean);

    return {
        plannerVersion: CASTLE_SECTION_PLANNER_VERSION,
        sectionId, floor, layoutSeed: String(layoutSeed),
        missionFamily: family,
        templateId: plan.templateId,
        quadrant: identity.quadrant,
        terminal: identity.terminal,
        masugata: plan.masugata,     // the dogleg gate — no straight sightline into the ward [REF#DG-01972]
        roka: plan.roka,             // the galleries rooms hang off [REF#DG-01973]
        landmarks: plan.landmarks,   // YAGURA watch corner + MAJOR court building [REF#DG-01974]
        routes: plan.routes,
        major, normals,
        usedTags: [...used],
        plan,
    };
}

/** Bind every section on a floor, sharing one no-repeat pool. [REF#DG-01975] */
export function planCastleFloor({ layoutSeed, floor = 1, creator } = {}) {
    const used = new Set();
    const sections = FLOOR_1_V25_SECTION_IDENTITIES.map(id => {
        const s = planCastleSection({ layoutSeed, floor, sectionId: id.sectionId, creator, exclude: used });
        for (const t of s.usedTags) used.add(t);
        return s;
    });
    return { plannerVersion: CASTLE_SECTION_PLANNER_VERSION, floor, layoutSeed: String(layoutSeed), sections };
}
