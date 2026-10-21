/** [REF#DG-01486]
 * ShogunCastleTemplates.mjs — pure CastlePlan templates compiled after a mission graph, never before it.
 *
 * This module deliberately has no Three.js, DOM, map tile, save, or Oni-Baba dependency.  A later adapter
 * may turn its semantic spaces/portals/boundaries into the legacy tile map, but it must preserve the proof
 * returned here.  That keeps "castle" a topology contract rather than a texture choice.
 */

export const SHOGUN_CASTLE_TEMPLATE_SCHEMA = 1;
export const SHOGUN_CASTLE_TEMPLATE_VERSION = 'shogun-castle-template-v1';
export const MAX_CASTLE_TEMPLATE_ATTEMPTS = 3;

export const MISSION_GRAPH_FAMILIES = Object.freeze([
    'CRESCENT_LOOP',
    'PINCER_LOOP',
    'SIEGE_LOOP',
]);

export const NORMAL_ROOM_ROLES = Object.freeze([
    'TEACH',
    'CHOICE',
    'PRESSURE',
    'RELIEF',
    'REWARD',
    'SECRET',
]);

const REQUIRED_NORMAL_ROLES = Object.freeze(['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF']);
const TERMINAL_POLICIES = new Set(['any', 'only', 'never']);
const PLAN_ANCHORS = new Set([
    'INNER_GATE', 'WARD_GATE', 'GATE_COURT', 'THRESHOLD', 'MAJOR', 'SANCTUM',
    'SONG', 'RETURN_SHORTCUT', 'OUTER_BREACH', 'YAGURA',
]);

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

/** FNV-1a used only to choose among already-valid templates from the caller-owned layout seed. [REF#DG-01487] */
export function stableCastleHash32(...parts) {
    const text = parts.map(part => String(part)).join('\u001f');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function keyedIndex(length, ...parts) {
    if (!Number.isInteger(length) || length < 1) throw new RangeError('keyedIndex requires a positive length');
    return stableCastleHash32(...parts) % length;
}

function rotate(list, offset) {
    return list.map((_, index) => list[(offset + index) % list.length]);
}

function routeFor(family) {
    if (family === 'CRESCENT_LOOP') return {
        entryToSong: ['INNER_GATE', 'GATE_COURT', 'WARD_GATE', 'THRESHOLD', 'TEACH', 'CHOICE', 'PRESSURE', 'MAJOR', 'SANCTUM', 'SONG'],
        returnToHeart: ['SONG', 'RETURN_SHORTCUT', 'INNER_GATE'],
        raidToHeart: ['OUTER_BREACH', 'SANCTUM', 'MAJOR', 'PRESSURE', 'CHOICE', 'TEACH', 'THRESHOLD', 'WARD_GATE', 'GATE_COURT', 'INNER_GATE'],
        loopWitness: ['CHOICE', 'PRESSURE', 'MAJOR', 'RELIEF', 'CHOICE'],
        entryCost: 18,
        returnCost: 5,
    };
    if (family === 'PINCER_LOOP') return {
        entryToSong: ['INNER_GATE', 'GATE_COURT', 'WARD_GATE', 'THRESHOLD', 'RELIEF', 'CHOICE', 'TEACH', 'MAJOR', 'SANCTUM', 'SONG'],
        returnToHeart: ['SONG', 'RETURN_SHORTCUT', 'INNER_GATE'],
        raidToHeart: ['OUTER_BREACH', 'PRESSURE', 'CHOICE', 'RELIEF', 'THRESHOLD', 'WARD_GATE', 'GATE_COURT', 'INNER_GATE'],
        loopWitness: ['CHOICE', 'TEACH', 'MAJOR', 'PRESSURE', 'CHOICE'],
        entryCost: 17,
        returnCost: 5,
    };
    if (family === 'SIEGE_LOOP') return {
        entryToSong: ['INNER_GATE', 'GATE_COURT', 'WARD_GATE', 'THRESHOLD', 'PRESSURE', 'TEACH', 'CHOICE', 'RELIEF', 'MAJOR', 'SANCTUM', 'SONG'],
        returnToHeart: ['SONG', 'RETURN_SHORTCUT', 'INNER_GATE'],
        raidToHeart: ['OUTER_BREACH', 'MAJOR', 'RELIEF', 'CHOICE', 'TEACH', 'PRESSURE', 'THRESHOLD', 'WARD_GATE', 'GATE_COURT', 'INNER_GATE'],
        loopWitness: ['PRESSURE', 'TEACH', 'CHOICE', 'RELIEF', 'MAJOR', 'PRESSURE'],
        entryCost: 20,
        returnCost: 6,
    };
    throw new RangeError(`Unknown mission graph family: ${family}`);
}

function makeTemplate(spec) {
    return deepFreeze({
        schemaVersion: SHOGUN_CASTLE_TEMPLATE_SCHEMA,
        ...spec,
        boundaryPolicy: {
            outer: { kind: 'CURTAIN_WALL', material: 'STONE_PLASTER_TIMBER', thickness: 'HEAVY', blocks: ['movement', 'sight', 'sound'] },
            inner: { kind: 'THIN_PARTITION', material: 'WOOD_FUSUMA_OR_SHOJI', thickness: 'THIN', blocks: ['movement', 'sight'] },
        },
        gates: {
            heartGate: { role: 'INNER_GATE', kind: 'ARCHITECTURAL_DOUBLE', widthTiles: 2, shojiOverlay: false, material: 'HEAVY_TIMBER' },
            wardGate: { role: 'WARD_GATE', kind: 'YAGURA_GATE', widthTiles: 2, shojiOverlay: false, material: 'HEAVY_TIMBER' },
        },
        culling: {
            lowSpeedPreviewRole: 'GATE_COURT',
            residentRoles: ['GATE_COURT', 'THRESHOLD', 'ROKA_MAIN', 'MAJOR', 'SANCTUM'],
        },
    });
}

function normalSlots(rokaByRole) {
    return NORMAL_ROOM_ROLES.map(role => ({ role, rokaId: rokaByRole[role], side: 'single-spine' }));
}

const STANDARD_TEMPLATES = [
    makeTemplate({
        id: 'MASUGATA_CRESCENT_COURT',
        label: 'Masugata Crescent Court',
        missionFamilies: ['CRESCENT_LOOP'],
        terminalPolicy: 'never',
        mood: 'warm service court behind a hard gate',
        masugata: { outerAxis: 'x', innerAxis: 'z', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'CRESCENT_GALLERY' }, { id: 'ROKA_SERVICE', form: 'SERVICE_RETURN' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_MAIN', PRESSURE: 'ROKA_MAIN', RELIEF: 'ROKA_SERVICE', REWARD: 'ROKA_SERVICE', SECRET: 'ROKA_MAIN' }),
        landmarks: [{ role: 'YAGURA', form: 'CORNER_WATCH' }, { role: 'MAJOR', form: 'COURT_BUILDING' }],
    }),
    makeTemplate({
        id: 'NAGAYA_CRESCENT_GALLERY',
        label: 'Nagaya Crescent Gallery',
        missionFamilies: ['CRESCENT_LOOP'],
        terminalPolicy: 'never',
        mood: 'longhouse gallery with a hidden service return',
        masugata: { outerAxis: 'z', innerAxis: 'x', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'NAGAYA_GALLERY' }, { id: 'ROKA_SERVICE', form: 'KITCHEN_RETURN' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_SERVICE', PRESSURE: 'ROKA_MAIN', RELIEF: 'ROKA_SERVICE', REWARD: 'ROKA_MAIN', SECRET: 'ROKA_SERVICE' }),
        landmarks: [{ role: 'YAGURA', form: 'EAVE_TOWER' }, { role: 'MAJOR', form: 'LONGHOUSE_BUILDING' }],
    }),
    makeTemplate({
        id: 'YAGURA_PINCER_WARD',
        label: 'Yagura Pincer Ward',
        missionFamilies: ['PINCER_LOOP'],
        terminalPolicy: 'never',
        mood: 'watchtower pressure around a protected working court',
        masugata: { outerAxis: 'x', innerAxis: 'z', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'WATCH_GALLERY' }, { id: 'ROKA_DEFENSE', form: 'TOWER_HOOK' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_MAIN', PRESSURE: 'ROKA_DEFENSE', RELIEF: 'ROKA_MAIN', REWARD: 'ROKA_DEFENSE', SECRET: 'ROKA_MAIN' }),
        landmarks: [{ role: 'YAGURA', form: 'DOUBLE_WATCH' }, { role: 'MAJOR', form: 'DEFENDED_WORKSHOP' }],
    }),
    makeTemplate({
        id: 'KURA_PINCER_COURT',
        label: 'Kura Pincer Court',
        missionFamilies: ['PINCER_LOOP'],
        terminalPolicy: 'never',
        mood: 'storehouse court with guarded loading turns',
        masugata: { outerAxis: 'z', innerAxis: 'x', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'STOREHOUSE_GALLERY' }, { id: 'ROKA_DEFENSE', form: 'LOADING_HOOK' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_DEFENSE', PRESSURE: 'ROKA_DEFENSE', RELIEF: 'ROKA_MAIN', REWARD: 'ROKA_MAIN', SECRET: 'ROKA_DEFENSE' }),
        landmarks: [{ role: 'YAGURA', form: 'KURA_CORNER_TOWER' }, { role: 'MAJOR', form: 'STOREHOUSE_BUILDING' }],
    }),
    makeTemplate({
        id: 'KURA_SIEGE_ENCLOSURE',
        label: 'Kura Siege Enclosure',
        missionFamilies: ['SIEGE_LOOP'],
        terminalPolicy: 'never',
        mood: 'breach-facing warehouse enclosure with a protected inner loop',
        masugata: { outerAxis: 'x', innerAxis: 'z', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'INNER_ENCLOSURE' }, { id: 'ROKA_BREACH', form: 'BREACH_GALLERY' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_MAIN', PRESSURE: 'ROKA_BREACH', RELIEF: 'ROKA_MAIN', REWARD: 'ROKA_BREACH', SECRET: 'ROKA_MAIN' }),
        landmarks: [{ role: 'YAGURA', form: 'BREACH_TOWER' }, { role: 'MAJOR', form: 'KURA_BUILDING' }],
    }),
    makeTemplate({
        id: 'TOWER_HOOK_SIEGE',
        label: 'Tower-Hook Siege Ward',
        missionFamilies: ['SIEGE_LOOP'],
        terminalPolicy: 'never',
        mood: 'hard outer hook, soft interior repair loop',
        masugata: { outerAxis: 'z', innerAxis: 'x', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'REPAIR_GALLERY' }, { id: 'ROKA_BREACH', form: 'TOWER_HOOK' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_BREACH', PRESSURE: 'ROKA_MAIN', RELIEF: 'ROKA_BREACH', REWARD: 'ROKA_MAIN', SECRET: 'ROKA_BREACH' }),
        landmarks: [{ role: 'YAGURA', form: 'HOOK_TOWER' }, { role: 'MAJOR', form: 'REPAIR_BUILDING' }],
    }),
    makeTemplate({
        id: 'BANSHO_TOWER_HOOK',
        label: 'Bansho Tower Hook',
        missionFamilies: MISSION_GRAPH_FAMILIES,
        terminalPolicy: 'only',
        mood: 'sealed guardhouse with an inspector turn',
        masugata: { outerAxis: 'x', innerAxis: 'z', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'GUARD_GALLERY' }, { id: 'ROKA_GUARD', form: 'INSPECTOR_HOOK' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_GUARD', PRESSURE: 'ROKA_GUARD', RELIEF: 'ROKA_MAIN', REWARD: 'ROKA_MAIN', SECRET: 'ROKA_GUARD' }),
        landmarks: [{ role: 'YAGURA', form: 'BANSHO_TOWER' }, { role: 'MAJOR', form: 'INSPECTOR_GUARDROOM' }],
        terminalRule: 'SECTIONS_1_2_3_COMPLETE',
    }),
    makeTemplate({
        id: 'BANSHO_INSPECTION_COURT',
        label: 'Bansho Inspection Court',
        missionFamilies: MISSION_GRAPH_FAMILIES,
        terminalPolicy: 'only',
        mood: 'inspection court with a watched secondary gate',
        masugata: { outerAxis: 'z', innerAxis: 'x', turnDegrees: 90, courtRole: 'GATE_COURT' },
        roka: [{ id: 'ROKA_MAIN', form: 'INSPECTION_GALLERY' }, { id: 'ROKA_GUARD', form: 'WATCH_COURT' }],
        normalSlots: normalSlots({ TEACH: 'ROKA_GUARD', CHOICE: 'ROKA_MAIN', PRESSURE: 'ROKA_GUARD', RELIEF: 'ROKA_MAIN', REWARD: 'ROKA_GUARD', SECRET: 'ROKA_MAIN' }),
        landmarks: [{ role: 'YAGURA', form: 'INSPECTION_YAGURA' }, { role: 'MAJOR', form: 'BANSHO_HALL' }],
        terminalRule: 'SECTIONS_1_2_3_COMPLETE',
    }),
];

const AUTHORED_FALLBACK = makeTemplate({
    id: 'AUTHORED_HONMARU_SAFE_FALLBACK',
    label: 'Authored Honmaru Safe Fallback',
    missionFamilies: MISSION_GRAPH_FAMILIES,
    terminalPolicy: 'any',
    authoredFallback: true,
    mood: 'simple court with one legible turn and one return',
    masugata: { outerAxis: 'x', innerAxis: 'z', turnDegrees: 90, courtRole: 'GATE_COURT' },
    roka: [{ id: 'ROKA_MAIN', form: 'SIMPLE_GALLERY' }, { id: 'ROKA_SERVICE', form: 'SAFE_RETURN' }],
    normalSlots: normalSlots({ TEACH: 'ROKA_MAIN', CHOICE: 'ROKA_MAIN', PRESSURE: 'ROKA_MAIN', RELIEF: 'ROKA_SERVICE', REWARD: 'ROKA_SERVICE', SECRET: 'ROKA_MAIN' }),
    landmarks: [{ role: 'YAGURA', form: 'SMALL_WATCH' }, { role: 'MAJOR', form: 'LEGIBLE_MAJOR_ROOM' }],
});

export const SHOGUN_CASTLE_TEMPLATES = deepFreeze([...STANDARD_TEMPLATES, AUTHORED_FALLBACK]);
export const SHOGUN_CASTLE_TEMPLATE_IDS = Object.freeze(SHOGUN_CASTLE_TEMPLATES.map(template => template.id));

/** Measured current Floor 1 mapping. This is a template fixture, never a live catalog import. [REF#DG-01488] */
export const FLOOR_1_V25_SECTION_IDENTITIES = deepFreeze([
    { sectionId: 1, quadrant: 'WEST', buildingId: 'CAFETERIA', terminal: false },
    { sectionId: 2, quadrant: 'NORTH', buildingId: 'FACTORY', terminal: false },
    { sectionId: 3, quadrant: 'EAST', buildingId: 'STORAGE', terminal: false },
    { sectionId: 4, quadrant: 'SOUTH', buildingId: 'GUARDROOM', terminal: true },
]);

export class CastleTemplateValidationError extends Error {
    constructor(errors) {
        super(`Invalid Shogun Castle template: ${errors.join(' | ')}`);
        this.name = 'CastleTemplateValidationError';
        this.errors = errors;
    }
}

function allowedRole(role) {
    return PLAN_ANCHORS.has(role) || NORMAL_ROOM_ROLES.includes(role);
}

function validateRoute(route, path, errors) {
    if (!Array.isArray(route) || route.length < 2) {
        errors.push(`${path}: must contain at least two semantic nodes`);
        return;
    }
    for (const role of route) if (!allowedRole(role)) errors.push(`${path}: unknown semantic node ${role}`);
}

export function validateShogunCastleTemplate(template) {
    const errors = [];
    if (!template || typeof template !== 'object') return { valid: false, errors: ['template: must be an object'] };
    if (template.schemaVersion !== SHOGUN_CASTLE_TEMPLATE_SCHEMA) errors.push('schemaVersion: unsupported');
    if (!nonEmpty(template.id)) errors.push('id: must be a non-empty string');
    const families = Array.isArray(template.missionFamilies) ? template.missionFamilies : [];
    if (!families.length || families.some(family => !MISSION_GRAPH_FAMILIES.includes(family))) {
        errors.push('missionFamilies: must contain known graph families');
    }
    if (!TERMINAL_POLICIES.has(template.terminalPolicy)) errors.push('terminalPolicy: must be any, only, or never');

    const masugata = template.masugata || {};
    if (masugata.turnDegrees !== 90 || masugata.outerAxis === masugata.innerAxis || masugata.courtRole !== 'GATE_COURT') {
        errors.push('masugata: requires a 90-degree gate court with different outer/inner axes');
    }
    const gates = template.gates || {};
    if (gates.heartGate?.kind !== 'ARCHITECTURAL_DOUBLE' || gates.heartGate?.widthTiles !== 2 || gates.heartGate?.shojiOverlay !== false) {
        errors.push('heartGate: must be a two-tile architectural double gate without shoji');
    }
    if (gates.wardGate?.kind !== 'YAGURA_GATE' || gates.wardGate?.widthTiles !== 2 || gates.wardGate?.shojiOverlay !== false) {
        errors.push('wardGate: must be a two-tile yagura gate without shoji');
    }

    const roka = Array.isArray(template.roka) ? template.roka : [];
    const rokaIds = new Set(roka.map(item => item?.id));
    if (roka.length < 2 || rokaIds.size !== roka.length || [...rokaIds].some(id => !nonEmpty(id))) {
        errors.push('roka: needs at least two uniquely named circulation legs');
    }
    const slots = Array.isArray(template.normalSlots) ? template.normalSlots : [];
    const seenRoles = new Set();
    for (const slot of slots) {
        if (!NORMAL_ROOM_ROLES.includes(slot?.role)) errors.push('normalSlots: contains an unknown room role');
        if (seenRoles.has(slot?.role)) errors.push(`normalSlots: duplicate role ${slot?.role}`);
        seenRoles.add(slot?.role);
        if (!rokaIds.has(slot?.rokaId) || slot?.side !== 'single-spine') {
            errors.push(`normalSlots.${slot?.role || '?'}: must attach to exactly one named roka`);
        }
    }
    for (const role of NORMAL_ROOM_ROLES) if (!seenRoles.has(role)) errors.push(`normalSlots: missing ${role}`);

    const landmarkRoles = new Set((template.landmarks || []).map(item => item?.role));
    if (!landmarkRoles.has('YAGURA') || !landmarkRoles.has('MAJOR')) errors.push('landmarks: needs YAGURA and MAJOR anchors');
    const boundary = template.boundaryPolicy || {};
    if (boundary.outer?.kind !== 'CURTAIN_WALL' || boundary.inner?.kind !== 'THIN_PARTITION') {
        errors.push('boundaryPolicy: must distinguish curtain wall from thin internal partition');
    }
    if (template.terminalPolicy === 'only' && template.terminalRule !== 'SECTIONS_1_2_3_COMPLETE') {
        errors.push('terminal template: must carry the Sections 1–3 completion gate');
    }
    for (const family of families.filter(item => MISSION_GRAPH_FAMILIES.includes(item))) {
        const routes = routeFor(family);
        validateRoute(routes.entryToSong, `${family}.entryToSong`, errors);
        validateRoute(routes.returnToHeart, `${family}.returnToHeart`, errors);
        validateRoute(routes.raidToHeart, `${family}.raidToHeart`, errors);
        validateRoute(routes.loopWitness, `${family}.loopWitness`, errors);
        if (routes.loopWitness[0] !== routes.loopWitness.at(-1) || new Set(routes.loopWitness).size < 4) {
            errors.push(`${family}.loopWitness: must prove a real cycle`);
        }
        if (!(routes.returnCost < routes.entryCost)) errors.push(`${family}: return shortcut must be materially shorter`);
    }
    return { valid: errors.length === 0, errors };
}

export function assertShogunCastleTemplate(template) {
    const report = validateShogunCastleTemplate(template);
    if (!report.valid) throw new CastleTemplateValidationError(report.errors);
    return template;
}

function normalizeSection(section) {
    if (!section || typeof section !== 'object') throw new TypeError('section must be an object');
    const sectionId = Number(section.sectionId);
    if (!Number.isInteger(sectionId) || sectionId < 1) throw new RangeError('section.sectionId must be a positive integer');
    if (!nonEmpty(section.quadrant)) throw new TypeError('section.quadrant must be a non-empty string');
    if (!nonEmpty(section.buildingId)) throw new TypeError('section.buildingId must be a non-empty string');
    return { sectionId, quadrant: section.quadrant, buildingId: section.buildingId, terminal: section.terminal === true };
}

function normalizeNormalRoomRoles(value) {
    const roles = value == null ? [...NORMAL_ROOM_ROLES] : value;
    if (!Array.isArray(roles) || !roles.length || roles.length > NORMAL_ROOM_ROLES.length) {
        throw new TypeError('normalRoomRoles must contain one to six known roles');
    }
    if (new Set(roles).size !== roles.length || roles.some(role => !NORMAL_ROOM_ROLES.includes(role))) {
        throw new TypeError('normalRoomRoles must not repeat or invent a room role');
    }
    for (const role of REQUIRED_NORMAL_ROLES) if (!roles.includes(role)) {
        throw new TypeError(`normalRoomRoles must include required role ${role}`);
    }
    return [...roles];
}

function normalizeRejected(value) {
    if (value == null) return new Set();
    if (!Array.isArray(value) || value.some(id => !nonEmpty(id))) throw new TypeError('testOnlyRejectTemplateIds must be an array of template ids');
    return new Set(value);
}

function supports(template, missionFamily, terminal) {
    if (!template.missionFamilies.includes(missionFamily)) return false;
    return template.terminalPolicy === 'any'
        || (template.terminalPolicy === 'only' && terminal)
        || (template.terminalPolicy === 'never' && !terminal);
}

export function selectShogunCastleTemplate({
    layoutSeed,
    section,
    missionFamily,
    templateId,
    testOnlyRejectTemplateIds = [],
} = {}) {
    if (!nonEmpty(layoutSeed)) throw new TypeError('layoutSeed must be a non-empty stable seed');
    const normalizedSection = normalizeSection(section);
    if (!MISSION_GRAPH_FAMILIES.includes(missionFamily)) throw new RangeError(`Unknown missionFamily: ${missionFamily}`);
    const rejected = normalizeRejected(testOnlyRejectTemplateIds);
    const standard = STANDARD_TEMPLATES.filter(template => supports(template, missionFamily, normalizedSection.terminal));
    if (templateId !== undefined) {
        const template = standard.find(item => item.id === templateId);
        if (!template) throw new RangeError(`Template ${templateId} does not support this section/mission`);
        assertShogunCastleTemplate(template);
        if (rejected.has(templateId)) throw new Error(`Pinned template ${templateId} was rejected`);
        return deepFreeze({ template, attempts: [{ templateId, accepted: true, reason: 'explicit-demo-pin' }], fallbackUsed: false });
    }
    if (!standard.length) throw new Error(`No standard CastlePlan template supports ${missionFamily} / terminal=${normalizedSection.terminal}`);
    const candidates = rotate(standard, keyedIndex(standard.length, layoutSeed, normalizedSection.sectionId, missionFamily, 'castle-template'));
    const attempts = [];
    for (const template of candidates.slice(0, MAX_CASTLE_TEMPLATE_ATTEMPTS)) {
        if (rejected.has(template.id)) {
            attempts.push({ templateId: template.id, accepted: false, reason: 'test-rejected' });
            continue;
        }
        const report = validateShogunCastleTemplate(template);
        if (report.valid) {
            attempts.push({ templateId: template.id, accepted: true });
            return deepFreeze({ template, attempts, fallbackUsed: false });
        }
        attempts.push({ templateId: template.id, accepted: false, reason: report.errors.join(' | ') });
    }
    const fallback = AUTHORED_FALLBACK;
    const fallbackReport = validateShogunCastleTemplate(fallback);
    if (!fallbackReport.valid) throw new CastleTemplateValidationError(fallbackReport.errors);
    attempts.push({ templateId: fallback.id, accepted: true, reason: 'authored-fallback' });
    return deepFreeze({ template: fallback, attempts, fallbackUsed: true });
}

function semanticId(floor, sectionId, role) {
    return `F${floor}:S${sectionId}:${role}`;
}

function bindRoute(route, floor, sectionId) {
    return route.map(role => semanticId(floor, sectionId, role));
}

export function validateShogunCastlePlan(plan) {
    const errors = [];
    if (!plan || typeof plan !== 'object') return { valid: false, errors: ['plan: must be an object'], proof: null };
    if (plan.schemaVersion !== SHOGUN_CASTLE_TEMPLATE_SCHEMA) errors.push('plan.schemaVersion: unsupported');
    if (!nonEmpty(plan.templateId) || !nonEmpty(plan.layoutSeed)) errors.push('plan: templateId and layoutSeed are required');
    if (!Array.isArray(plan.normalRooms) || !plan.normalRooms.length) errors.push('plan.normalRooms: missing');
    const rokaIds = new Set((plan.roka || []).map(item => item?.id));
    for (const room of plan.normalRooms || []) if (!rokaIds.has(room?.rokaId)) errors.push(`normal room ${room?.role || '?'} has no single roka owner`);
    if (new Set((plan.normalRooms || []).map(room => room.role)).size !== (plan.normalRooms || []).length) errors.push('plan.normalRooms: duplicate semantic role');
    const planRoles = new Set((plan.normalRooms || []).map(room => room.role));
    for (const role of REQUIRED_NORMAL_ROLES) if (!planRoles.has(role)) errors.push(`plan.normalRooms: missing required role ${role}`);

    const masugata = plan.masugata || {};
    if (masugata.turnDegrees !== 90 || masugata.outerAxis === masugata.innerAxis || masugata.directSightline !== false) {
        errors.push('plan.masugata: must make a real 90-degree occluding gate sequence');
    }
    for (const portal of plan.portals || []) {
        if (portal?.shojiOverlay === true) errors.push(`portal ${portal?.role || '?'} may not have shoji overlay`);
        if (!['ARCHITECTURAL_DOUBLE', 'YAGURA_GATE'].includes(portal?.kind)) errors.push(`portal ${portal?.role || '?'} has an invalid castle gate kind`);
    }
    const routes = plan.routes || {};
    for (const key of ['entryToSong', 'returnToHeart', 'raidToHeart', 'loopWitness']) {
        if (!Array.isArray(routes[key]) || routes[key].length < 2) errors.push(`plan.routes.${key}: missing`);
    }
    if (Array.isArray(routes.loopWitness) && routes.loopWitness[0] !== routes.loopWitness.at(-1)) errors.push('plan.routes.loopWitness: not a cycle');
    if (!(Number(plan.routeCosts?.return) < Number(plan.routeCosts?.entry))) errors.push('plan.routeCosts: return is not shorter than entry');

    const proof = {
        oneRoka: errors.every(error => !/roka|normal room|normalRooms/.test(error)),
        masugata: errors.every(error => !error.includes('masugata') && !error.includes('shoji') && !error.includes('gate kind')),
        cycle: errors.every(error => !error.includes('loopWitness')),
        returnShortcut: errors.every(error => !error.includes('routeCosts')),
    };
    return { valid: errors.length === 0, errors, proof };
}

export function assertShogunCastlePlan(plan) {
    const report = validateShogunCastlePlan(plan);
    if (!report.valid) throw new CastleTemplateValidationError(report.errors);
    return plan;
}

/** [REF#DG-01489]
 * Produces semantic CastlePlan data. The caller owns layoutSeed and missionFamily; this layer never draws
 * from a global RNG and never selects a building identity.
 */
export function deriveShogunCastlePlan({
    layoutSeed,
    floor = 1,
    section,
    missionFamily,
    normalRoomRoles,
    templateId,
    testOnlyRejectTemplateIds = [],
} = {}) {
    if (!Number.isInteger(floor) || floor < 1) throw new RangeError('floor must be a positive integer');
    const normalizedSection = normalizeSection(section);
    const enabledRoles = normalizeNormalRoomRoles(normalRoomRoles);
    const selection = selectShogunCastleTemplate({ layoutSeed, section: normalizedSection, missionFamily, templateId, testOnlyRejectTemplateIds });
    const template = selection.template;
    const slotByRole = new Map(template.normalSlots.map(slot => [slot.role, slot]));
    const normalRooms = enabledRoles.map(role => ({
        id: semanticId(floor, normalizedSection.sectionId, role),
        role,
        rokaId: slotByRole.get(role).rokaId,
        side: slotByRole.get(role).side,
    }));
    const routes = routeFor(missionFamily);
    const turn = keyedIndex(2, layoutSeed, floor, normalizedSection.sectionId, template.id, 'masugata-turn') === 0 ? 'LEFT' : 'RIGHT';
    const plan = {
        schemaVersion: SHOGUN_CASTLE_TEMPLATE_SCHEMA,
        templateVersion: SHOGUN_CASTLE_TEMPLATE_VERSION,
        templateId: template.id,
        layoutSeed,
        floor,
        section: normalizedSection,
        missionFamily,
        construction: { attempts: selection.attempts, fallbackUsed: selection.fallbackUsed },
        masugata: {
            courtId: semanticId(floor, normalizedSection.sectionId, 'GATE_COURT'),
            outerAxis: template.masugata.outerAxis,
            innerAxis: template.masugata.innerAxis,
            turnDegrees: template.masugata.turnDegrees,
            turn,
            directSightline: false,
        },
        roka: template.roka.map(item => ({ ...item, id: semanticId(floor, normalizedSection.sectionId, item.id) })),
        normalRooms: normalRooms.map(room => ({ ...room, rokaId: semanticId(floor, normalizedSection.sectionId, room.rokaId) })),
        landmarks: template.landmarks.map(item => ({ ...item, id: semanticId(floor, normalizedSection.sectionId, item.role) })),
        portals: [
            { id: semanticId(floor, normalizedSection.sectionId, 'INNER_GATE'), ...template.gates.heartGate },
            { id: semanticId(floor, normalizedSection.sectionId, 'WARD_GATE'), ...template.gates.wardGate },
        ],
        boundaries: {
            outer: { ...template.boundaryPolicy.outer },
            inner: { ...template.boundaryPolicy.inner },
        },
        culling: {
            lowSpeedPreviewCell: semanticId(floor, normalizedSection.sectionId, template.culling.lowSpeedPreviewRole),
            residentCells: template.culling.residentRoles.map(role => semanticId(floor, normalizedSection.sectionId, role)),
        },
        routes: Object.fromEntries(Object.entries(routes).filter(([key]) => key.endsWith('Song') || key.endsWith('Heart') || key === 'loopWitness')
            .map(([key, route]) => [key, bindRoute(route, floor, normalizedSection.sectionId)])),
        routeCosts: { entry: routes.entryCost, return: routes.returnCost },
        terminalRule: template.terminalRule || null,
    };
    const report = validateShogunCastlePlan(plan);
    if (!report.valid) throw new CastleTemplateValidationError(report.errors);
    plan.proof = report.proof;
    return deepFreeze(plan);
}

for (const template of SHOGUN_CASTLE_TEMPLATES) assertShogunCastleTemplate(template);
