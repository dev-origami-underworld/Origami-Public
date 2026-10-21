/** [REF#DG-00001]
 * CabaretGraphRecipes.mjs — P3 deterministic mission graphs before geometry.
 *
 * This is deliberately a pure recipe layer. It consumes the authored P2 floor
 * catalog and produces semantic nodes, routes, hashes, and repair evidence.
 * It does not import Three, mount a scene, mutate the live map, persist state,
 * or run a timer/RAF. P4/P5 own those later concerns.
 */

import {
    FLOOR_1_CATALOG,
    assertFloorCatalog,
} from '../data/FloorCatalog.mjs';
import { checksum, stableStringify } from '../core/RunLedger.mjs';

export const GRAPH_RECIPE_SCHEMA = 1;
export const GRAPH_GENERATOR_VERSION = 'cabaret-heart-graph-p3-1';
export const MAX_TEMPLATE_ATTEMPTS = 3;

const SECTION_IDS = Object.freeze([1, 2, 3, 4]);
const REQUIRED_ROLES = Object.freeze(['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF']);
const OPTIONAL_ROLES = Object.freeze(['REWARD', 'SECRET']);

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

function cloneJson(value) {
    return JSON.parse(stableStringify(value));
}

function issue(errors, path, message) {
    errors.push(`${path}: ${message}`);
}

function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function rootSeedOf(value) {
    const rootSeed = String(value ?? '').trim();
    if (!/^\d{1,20}$/.test(rootSeed)) {
        throw new TypeError('Cabaret graph recipes require the P1 decimal root seed');
    }
    return rootSeed;
}

function floorOf(value) {
    const floor = Number(value);
    if (!Number.isInteger(floor) || floor < 1 || floor > 9999) {
        throw new RangeError('Cabaret graph recipes require a positive integer floor');
    }
    return floor;
}

/** Namespaced FNV-1a, so no persistent result consumes a shared random stream. [REF#DG-00002] */
export function keyedHash32(...parts) {
    const text = parts.map(part => String(part)).join('\u001f');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

export function keyedSeed(...parts) {
    return `0x${keyedHash32(...parts).toString(16).padStart(8, '0')}`;
}

/** [REF#DG-00003]
 * Derives only the namespace ownership for a floor.  It deliberately accepts
 * floors that do not yet have an authored catalog: P3 may prove namespace
 * isolation across a future ten-floor run without pretending that an
 * un-authored floor can produce a mountable recipe.
 */
export function deriveFloorIdentity({
    rootSeed,
    floor = 1,
    generatorVersion = GRAPH_GENERATOR_VERSION,
} = {}) {
    const normalizedRootSeed = rootSeedOf(rootSeed);
    const normalizedFloor = floorOf(floor);
    if (!nonEmpty(generatorVersion)) throw new TypeError('generatorVersion must be a non-empty string');

    return deepFreeze({
        rootSeed: normalizedRootSeed,
        floor: normalizedFloor,
        generatorVersion,
        floorSeed: keyedSeed(normalizedRootSeed, generatorVersion, 'floor', normalizedFloor),
        heartSeed: keyedSeed(normalizedRootSeed, generatorVersion, 'floor', normalizedFloor, 'heart'),
        sections: SECTION_IDS.map(sectionId => deepFreeze({
            sectionId,
            layoutSeed: keyedSeed(normalizedRootSeed, generatorVersion, 'floor', normalizedFloor, 'section', sectionId, 'layout'),
            contentSeed: keyedSeed(normalizedRootSeed, generatorVersion, 'floor', normalizedFloor, 'section', sectionId, 'content'),
        })),
    });
}

function keyedIndex(length, ...parts) {
    if (!Number.isInteger(length) || length < 1) throw new RangeError('keyedIndex needs a non-empty choice set');
    return keyedHash32(...parts) % length;
}

function nodeId(floor, sectionId, key) {
    return `F${floor}:S${sectionId}:${key}`;
}

function heartNodeId(floor) {
    return `F${floor}:HEART_CABARET`;
}

function gateNodeId(floor, sectionId) {
    return nodeId(floor, sectionId, 'INNER_GATE');
}

function edgeId(from, to, kind) {
    return `${kind}:${[from, to].sort().join('↔')}`;
}

function addEdge(edges, from, to, kind) {
    const id = edgeId(from, to, kind);
    if (!edges.some(edge => edge.id === id)) edges.push({ id, from, to, kind, bidirectional: true });
}

function edgeBetween(edges, from, to) {
    return edges.find(edge => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)) || null;
}

function routeIsValid(edges, route) {
    if (!Array.isArray(route) || route.length < 2) return false;
    for (let index = 1; index < route.length; index++) {
        if (!edgeBetween(edges, route[index - 1], route[index])) return false;
    }
    return true;
}

function sameList(left, right) {
    return Array.isArray(left)
        && Array.isArray(right)
        && left.length === right.length
        && left.every((value, index) => value === right[index]);
}

function normaliseOrder(order, allowed) {
    if (order == null) return [...allowed];
    if (!Array.isArray(order) || order.length !== allowed.length) throw new TypeError('sectionOrder must include Sections 1–4 exactly once');
    const numbers = order.map(Number);
    if (new Set(numbers).size !== allowed.length || numbers.some(id => !allowed.includes(id))) {
        throw new TypeError('sectionOrder must include Sections 1–4 exactly once');
    }
    return numbers;
}

function normaliseRejectedTemplateIds(value) {
    if (value == null) return new Set();
    if (!Array.isArray(value) || value.some(id => !nonEmpty(id))) {
        throw new TypeError('testOnlyRejectTemplateIds must be an array of non-empty template IDs');
    }
    return new Set(value);
}

function roleMap(sectionCatalog, normalRoomCount, rootSeed, floor, generatorVersion) {
    const deckByRole = new Map(sectionCatalog.roomDeck.map(room => [room.role, room]));
    const selected = REQUIRED_ROLES.map(role => deckByRole.get(role));
    if (selected.some(room => !room)) throw new Error(`Catalog section ${sectionCatalog.sectionId} lacks a required room role`);

    if (normalRoomCount === 5) {
        const optionalRole = OPTIONAL_ROLES[keyedIndex(
            OPTIONAL_ROLES.length,
            rootSeed, generatorVersion, 'floor', floor, 'section', sectionCatalog.sectionId, 'optional-role',
        )];
        selected.push(deckByRole.get(optionalRole));
    } else if (normalRoomCount === 6) {
        selected.push(...OPTIONAL_ROLES.map(role => deckByRole.get(role)));
    }
    if (selected.some(room => !room)) throw new Error(`Catalog section ${sectionCatalog.sectionId} lacks an optional room role`);
    return new Map(selected.map(room => [room.role, room]));
}

const TEMPLATE_ORDER = Object.freeze([
    Object.freeze({ id: 'CRESCENT_LOOP', permitRole: 'RELIEF', breachFrom: 'SANCTUM' }),
    Object.freeze({ id: 'PINCER_LOOP', permitRole: 'TEACH', breachFrom: 'PRESSURE' }),
    Object.freeze({ id: 'SIEGE_LOOP', permitRole: 'CHOICE', breachFrom: 'MAJOR' }),
]);

const AUTHORED_FALLBACK = Object.freeze({
    id: 'AUTHORED_FALLBACK_CRESCENT',
    family: 'CRESCENT_LOOP',
    permitRole: 'RELIEF',
    breachFrom: 'SANCTUM',
});

function templateFamily(template) {
    return template.family || template.id;
}

function templateCandidates(rootSeed, floor, sectionId, generatorVersion) {
    const offset = keyedIndex(TEMPLATE_ORDER.length, rootSeed, generatorVersion, 'floor', floor, 'section', sectionId, 'template');
    return TEMPLATE_ORDER.map((_, index) => TEMPLATE_ORDER[(offset + index) % TEMPLATE_ORDER.length]);
}

function buildTemplateGraph(template, ids, selectedRoles) {
    const edges = [];
    const add = (from, to, kind = 'PRIMARY') => addEdge(edges, from, to, kind);
    const r = role => ids.roles[role];
    const family = templateFamily(template);

    add(ids.gate, ids.threshold, 'INNER_APPROACH');
    add(ids.threshold, ids.soundtrack, 'BEHIND_GATE_CARD');
    add(ids.major, ids.sanctum, 'PRIMARY');
    add(ids.sanctum, ids.song, 'OBJECTIVE_LINK');
    add(ids.song, ids.shortcut, 'RETURN_SHORTCUT');
    add(ids.shortcut, ids.gate, 'RETURN_SHORTCUT');

    let entryToSong;
    let permitRoute;
    let raidToGate;
    let loopWitness;

    if (family === 'CRESCENT_LOOP') {
        add(ids.threshold, r('TEACH'));
        add(r('TEACH'), r('CHOICE'));
        add(r('CHOICE'), r('PRESSURE'));
        add(r('PRESSURE'), ids.major);
        add(r('CHOICE'), r('RELIEF'));
        add(r('RELIEF'), ids.major);
        add(ids.breach, ids.sanctum, 'OUTER_BREACH');
        entryToSong = [ids.gate, ids.threshold, r('TEACH'), r('CHOICE'), r('PRESSURE'), ids.major, ids.sanctum, ids.song];
        permitRoute = [ids.gate, ids.threshold, r('TEACH'), r('CHOICE'), r('RELIEF'), ids.permit];
        raidToGate = [ids.breach, ids.sanctum, ids.major, r('PRESSURE'), r('CHOICE'), r('TEACH'), ids.threshold, ids.gate];
        loopWitness = [r('CHOICE'), r('PRESSURE'), ids.major, r('RELIEF'), r('CHOICE')];
        if (selectedRoles.has('REWARD')) { add(ids.major, r('REWARD'), 'OPTIONAL'); add(r('REWARD'), ids.sanctum, 'OPTIONAL'); }
        if (selectedRoles.has('SECRET')) { add(r('CHOICE'), r('SECRET'), 'OPTIONAL'); add(r('SECRET'), ids.sanctum, 'OPTIONAL'); }
    } else if (family === 'PINCER_LOOP') {
        add(ids.threshold, r('RELIEF'));
        add(r('RELIEF'), r('CHOICE'));
        add(r('CHOICE'), r('TEACH'));
        add(r('TEACH'), ids.major);
        add(r('CHOICE'), r('PRESSURE'));
        add(r('PRESSURE'), ids.major);
        add(ids.breach, r('PRESSURE'), 'OUTER_BREACH');
        entryToSong = [ids.gate, ids.threshold, r('RELIEF'), r('CHOICE'), r('TEACH'), ids.major, ids.sanctum, ids.song];
        permitRoute = [ids.gate, ids.threshold, r('RELIEF'), r('CHOICE'), r('TEACH'), ids.permit];
        raidToGate = [ids.breach, r('PRESSURE'), r('CHOICE'), r('RELIEF'), ids.threshold, ids.gate];
        loopWitness = [r('CHOICE'), r('TEACH'), ids.major, r('PRESSURE'), r('CHOICE')];
        if (selectedRoles.has('REWARD')) { add(r('CHOICE'), r('REWARD'), 'OPTIONAL'); add(r('REWARD'), ids.major, 'OPTIONAL'); }
        if (selectedRoles.has('SECRET')) { add(r('RELIEF'), r('SECRET'), 'OPTIONAL'); add(r('SECRET'), ids.sanctum, 'OPTIONAL'); }
    } else if (family === 'SIEGE_LOOP') {
        add(ids.threshold, r('PRESSURE'));
        add(r('PRESSURE'), r('TEACH'));
        add(r('TEACH'), r('CHOICE'));
        add(r('CHOICE'), r('RELIEF'));
        add(r('RELIEF'), ids.major);
        add(r('PRESSURE'), ids.major);
        add(ids.breach, ids.major, 'OUTER_BREACH');
        entryToSong = [ids.gate, ids.threshold, r('PRESSURE'), r('TEACH'), r('CHOICE'), r('RELIEF'), ids.major, ids.sanctum, ids.song];
        permitRoute = [ids.gate, ids.threshold, r('PRESSURE'), r('TEACH'), r('CHOICE'), ids.permit];
        raidToGate = [ids.breach, ids.major, r('RELIEF'), r('CHOICE'), r('TEACH'), r('PRESSURE'), ids.threshold, ids.gate];
        loopWitness = [r('PRESSURE'), r('TEACH'), r('CHOICE'), r('RELIEF'), ids.major, r('PRESSURE')];
        if (selectedRoles.has('REWARD')) { add(r('TEACH'), r('REWARD'), 'OPTIONAL'); add(r('REWARD'), ids.major, 'OPTIONAL'); }
        if (selectedRoles.has('SECRET')) { add(r('CHOICE'), r('SECRET'), 'OPTIONAL'); add(r('SECRET'), ids.sanctum, 'OPTIONAL'); }
    } else {
        throw new Error(`Unknown graph template ${family}`);
    }

    add(r(template.permitRole), ids.permit, 'PERMIT_LINK');
    return { edges, entryToSong, permitRoute, raidToGate, loopWitness };
}

function buildSectionCandidate({
    rootSeed,
    floor,
    generatorVersion,
    catalogReport,
    sectionCatalog,
    template,
    normalRoomCount,
}) {
    const sectionId = sectionCatalog.sectionId;
    const selectedRooms = roleMap(sectionCatalog, normalRoomCount, rootSeed, floor, generatorVersion);
    const ids = {
        gate: gateNodeId(floor, sectionId),
        threshold: nodeId(floor, sectionId, 'THRESHOLD'),
        soundtrack: nodeId(floor, sectionId, 'SOUNDTRACK_CARD'),
        permit: nodeId(floor, sectionId, 'PERMIT_CARD'),
        major: nodeId(floor, sectionId, 'MAJOR_BUILDING'),
        sanctum: nodeId(floor, sectionId, 'SONG_SANCTUM'),
        song: nodeId(floor, sectionId, 'HEART_SONG_CARD'),
        shortcut: nodeId(floor, sectionId, 'RETURN_SHORTCUT'),
        breach: nodeId(floor, sectionId, 'OUTER_BREACH'),
        roles: Object.fromEntries([...selectedRooms.entries()].map(([role, room]) => [role, nodeId(floor, sectionId, room.key)])),
    };
    const graph = buildTemplateGraph(template, ids, selectedRooms);

    const nodes = [
        { id: ids.gate, kind: 'INNER_GATE', anchor: sectionCatalog.anchors.innerGate, widthTiles: 2, shojiOverlay: false },
        { id: ids.threshold, kind: 'THRESHOLD', anchor: `${sectionCatalog.quadrant}_SECTION_THRESHOLD` },
        {
            id: ids.soundtrack,
            kind: 'SOUNDTRACK_CARD',
            cardId: sectionCatalog.soundtrack.cardId,
            ownerSectionId: sectionId,
            anchor: sectionCatalog.soundtrack.cardAnchor,
            behindOwningDoubleDoor: true,
        },
        {
            id: ids.permit,
            kind: 'PERMIT_CARD',
            cardId: sectionCatalog.permit.cardId,
            permitId: sectionCatalog.permit.permitId,
            targetSpecialRoomKey: sectionCatalog.specialRoomKey,
        },
        {
            id: ids.major,
            kind: 'MAJOR_BUILDING',
            buildingId: sectionCatalog.buildingId,
            specialRoomKey: sectionCatalog.specialRoomKey,
            anchor: sectionCatalog.anchors.majorRoom,
        },
        { id: ids.sanctum, kind: 'SONG_SANCTUM', anchor: sectionCatalog.heartSong.anchor },
        {
            id: ids.song,
            kind: 'HEART_SONG_CARD',
            cardId: sectionCatalog.heartSong.cardId,
            identity: sectionCatalog.heartSong.identity,
            anchor: sectionCatalog.heartSong.anchor,
        },
        { id: ids.shortcut, kind: 'RETURN_SHORTCUT', anchor: sectionCatalog.anchors.returnShortcut, oneWayToHeart: true },
        {
            id: ids.breach,
            kind: 'OUTER_BREACH',
            anchor: sectionCatalog.anchors.outerBreach,
            breachRole: sectionCatalog.raid.breachRole,
        },
        ...[...selectedRooms.entries()].map(([role, room]) => ({
            id: ids.roles[role],
            kind: 'NORMAL_ROOM',
            role,
            roomKey: room.key,
            label: room.label,
        })),
    ];

    const section = {
        id: sectionId,
        quadrant: sectionCatalog.quadrant,
        layoutSeed: keyedSeed(rootSeed, generatorVersion, 'floor', floor, 'section', sectionId, 'layout'),
        contentSeed: keyedSeed(rootSeed, generatorVersion, 'floor', floor, 'section', sectionId, 'content'),
        graphTemplate: template.id,
        graphTemplateFamily: templateFamily(template),
        normalRoomCount,
        normalRooms: [...selectedRooms.entries()].map(([role, room]) => ({ role, roomKey: room.key, label: room.label })),
        majorBuildingId: sectionCatalog.buildingId,
        majorRoomKey: sectionCatalog.majorRoomKey,
        specialRoomKey: sectionCatalog.specialRoomKey,
        activationState: 'sleeping',
        innerGate: {
            nodeId: ids.gate,
            anchor: sectionCatalog.anchors.innerGate,
            widthTiles: 2,
            doorKind: 'ARCHITECTURAL_DOUBLE',
            shojiOverlay: false,
        },
        soundtrackCard: {
            nodeId: ids.soundtrack,
            cardId: sectionCatalog.soundtrack.cardId,
            identity: sectionCatalog.soundtrack.identity,
            ownerSectionId: sectionId,
            anchor: sectionCatalog.soundtrack.cardAnchor,
            behindOwningDoubleDoor: true,
        },
        permit: {
            nodeId: ids.permit,
            cardId: sectionCatalog.permit.cardId,
            permitId: sectionCatalog.permit.permitId,
            targetSpecialRoomKey: sectionCatalog.specialRoomKey,
            targetNormalRoomRole: template.permitRole,
            targetNormalRoomNodeId: ids.roles[template.permitRole],
        },
        heartSong: {
            nodeId: ids.song,
            cardId: sectionCatalog.heartSong.cardId,
            identity: sectionCatalog.heartSong.identity,
            anchor: sectionCatalog.heartSong.anchor,
            heartValue: sectionCatalog.heartSong.heartValue,
            returnHeal: sectionCatalog.heartSong.returnHeal,
            workerWakeValue: sectionCatalog.heartSong.workerWakeValue,
        },
        returnShortcut: {
            nodeId: ids.shortcut,
            anchor: sectionCatalog.anchors.returnShortcut,
            opensAfterHeartSong: true,
        },
        outerBreach: {
            nodeId: ids.breach,
            anchor: sectionCatalog.anchors.outerBreach,
            breachRole: sectionCatalog.raid.breachRole,
        },
        graph: {
            nodes,
            edges: graph.edges,
            loopWitness: graph.loopWitness,
        },
        routes: {
            entryToSoundtrack: [ids.gate, ids.threshold, ids.soundtrack],
            entryToPermit: graph.permitRoute,
            entryToSong: graph.entryToSong,
            returnToGate: [ids.song, ids.shortcut, ids.gate],
            raidToGate: graph.raidToGate,
            // These two routes cross the declared floor-level HEART_GATE edge. [REF#DG-00004]
            // P3 records the semantic crossing; P4/P5 own residency and geometry.
            returnToHeart: [ids.song, ids.shortcut, ids.gate, heartNodeId(floor)],
            raidToHeart: [...graph.raidToGate, heartNodeId(floor)],
        },
        construction: {
            maxTemplateAttempts: MAX_TEMPLATE_ATTEMPTS,
            attemptedTemplates: [],
            fallbackUsed: false,
            catalogHash: catalogReport.catalogHash,
        },
    };
    return section;
}

function recipeHash(section) {
    const payload = cloneJson(section);
    delete payload.recipeHash;
    return `fnv1a32:${checksum(payload)}`;
}

function routeHasKind(section, route, kind) {
    for (let index = 1; index < route.length; index++) {
        if (edgeBetween(section.graph.edges, route[index - 1], route[index])?.kind === kind) return true;
    }
    return false;
}

export function validateSectionRecipe(section, sectionCatalog) {
    const errors = [];
    if (!section || typeof section !== 'object') return { valid: false, errors: ['section: must be an object'] };
    const path = `section[${section.id ?? '?'}]`;
    if (section.id !== sectionCatalog?.sectionId) issue(errors, `${path}.id`, 'must match its catalog section');
    if (section.quadrant !== sectionCatalog?.quadrant) issue(errors, `${path}.quadrant`, 'must match its catalog quadrant');
    if (section.majorBuildingId !== sectionCatalog?.buildingId) issue(errors, `${path}.majorBuildingId`, 'must match the authored catalog');
    if (section.majorRoomKey !== sectionCatalog?.majorRoomKey) issue(errors, `${path}.majorRoomKey`, 'must match the authored catalog');
    if (section.specialRoomKey !== sectionCatalog?.specialRoomKey) issue(errors, `${path}.specialRoomKey`, 'must match the authored catalog');
    if (!nonEmpty(section.layoutSeed) || !nonEmpty(section.contentSeed)) issue(errors, path, 'must have isolated layout and content seeds');
    if (!nonEmpty(section.graphTemplate)) issue(errors, `${path}.graphTemplate`, 'must name a graph template');

    const roomBudget = sectionCatalog?.roomBudget || {};
    if (!Number.isInteger(section.normalRoomCount)
        || section.normalRoomCount < roomBudget.normalRoomMin
        || section.normalRoomCount > roomBudget.normalRoomMax) {
        issue(errors, `${path}.normalRoomCount`, 'must remain inside the authored 4–6 budget');
    }
    if (!Array.isArray(section.normalRooms) || section.normalRooms.length !== section.normalRoomCount) {
        issue(errors, `${path}.normalRooms`, 'must exactly match normalRoomCount');
    } else {
        const roleSet = new Set(section.normalRooms.map(room => room.role));
        const keySet = new Set(section.normalRooms.map(room => room.roomKey));
        const deckByRole = new Map((sectionCatalog?.roomDeck || []).map(room => [room.role, room]));
        if (roleSet.size !== section.normalRooms.length) issue(errors, `${path}.normalRooms`, 'must use each semantic room role at most once');
        if (keySet.size !== section.normalRooms.length) issue(errors, `${path}.normalRooms`, 'must use unique semantic room keys');
        for (const role of REQUIRED_ROLES) if (!roleSet.has(role)) issue(errors, `${path}.normalRooms`, `must retain required role ${role}`);
        for (const room of section.normalRooms) {
            const authored = deckByRole.get(room?.role);
            if (!authored) {
                issue(errors, `${path}.normalRooms`, `cannot introduce an un-authored role ${room?.role}`);
            } else if (room.roomKey !== authored.key || room.label !== authored.label) {
                issue(errors, `${path}.normalRooms`, `must retain the authored ${room.role} room identity`);
            }
        }
    }

    if (section.innerGate?.widthTiles !== 2) issue(errors, `${path}.innerGate.widthTiles`, 'must be a two-tile gate');
    if (section.innerGate?.doorKind !== 'ARCHITECTURAL_DOUBLE') issue(errors, `${path}.innerGate.doorKind`, 'must remain an architectural double door');
    if (section.innerGate?.shojiOverlay !== false) issue(errors, `${path}.innerGate.shojiOverlay`, 'must be false');
    if (section.innerGate?.anchor !== sectionCatalog?.anchors?.innerGate) issue(errors, `${path}.innerGate.anchor`, 'must match catalog gate anchor');
    if (section.soundtrackCard?.cardId !== sectionCatalog?.soundtrack?.cardId) issue(errors, `${path}.soundtrackCard.cardId`, 'must match catalog soundtrack card');
    if (section.soundtrackCard?.identity !== sectionCatalog?.soundtrack?.identity) issue(errors, `${path}.soundtrackCard.identity`, 'must match catalog soundtrack identity');
    if (section.soundtrackCard?.ownerSectionId !== section.id) issue(errors, `${path}.soundtrackCard.ownerSectionId`, 'must remain section-owned');
    if (section.soundtrackCard?.behindOwningDoubleDoor !== true) issue(errors, `${path}.soundtrackCard.behindOwningDoubleDoor`, 'must remain behind its owner gate');
    if (section.soundtrackCard?.anchor !== sectionCatalog?.soundtrack?.cardAnchor) issue(errors, `${path}.soundtrackCard.anchor`, 'must match catalog anchor');
    if (section.permit?.cardId !== sectionCatalog?.permit?.cardId) issue(errors, `${path}.permit.cardId`, 'must match catalog permit card');
    if (section.permit?.permitId !== sectionCatalog?.permit?.permitId) issue(errors, `${path}.permit.permitId`, 'must match catalog permit');
    if (section.permit?.targetSpecialRoomKey !== section.specialRoomKey) issue(errors, `${path}.permit.targetSpecialRoomKey`, 'must target its own major room');
    const permitRoom = section.normalRooms?.find(room => room.role === section.permit?.targetNormalRoomRole) || null;
    if (!permitRoom) issue(errors, `${path}.permit.targetNormalRoomRole`, 'must target one selected normal-room role');
    if (section.heartSong?.cardId !== sectionCatalog?.heartSong?.cardId) issue(errors, `${path}.heartSong.cardId`, 'must match catalog Heart Song');
    if (section.heartSong?.identity !== sectionCatalog?.heartSong?.identity) issue(errors, `${path}.heartSong.identity`, 'must match catalog Heart Song identity');
    if (section.heartSong?.anchor !== sectionCatalog?.heartSong?.anchor) issue(errors, `${path}.heartSong.anchor`, 'must match catalog Heart Song anchor');
    if (section.heartSong?.heartValue !== sectionCatalog?.heartSong?.heartValue
        || section.heartSong?.returnHeal !== sectionCatalog?.heartSong?.returnHeal
        || section.heartSong?.workerWakeValue !== sectionCatalog?.heartSong?.workerWakeValue) {
        issue(errors, `${path}.heartSong`, 'must retain the authored Heart and worker-wake values');
    }
    if (section.returnShortcut?.anchor !== sectionCatalog?.anchors?.returnShortcut) issue(errors, `${path}.returnShortcut.anchor`, 'must match catalog shortcut anchor');
    if (section.outerBreach?.anchor !== sectionCatalog?.anchors?.outerBreach) issue(errors, `${path}.outerBreach.anchor`, 'must match catalog breach anchor');
    if (section.outerBreach?.breachRole !== sectionCatalog?.raid?.breachRole) issue(errors, `${path}.outerBreach.breachRole`, 'must match catalog breach role');

    const nodes = section.graph?.nodes;
    const edges = section.graph?.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        issue(errors, `${path}.graph`, 'must contain nodes and edges');
        return { valid: false, errors };
    }
    const nodeIds = new Set(nodes.map(node => node?.id));
    const nodeById = new Map(nodes.filter(node => nonEmpty(node?.id)).map(node => [node.id, node]));
    if (nodeIds.size !== nodes.length || nodeIds.has(undefined)) issue(errors, `${path}.graph.nodes`, 'must use unique stable node IDs');
    const edgeIds = new Set();
    for (const edge of edges) {
        if (!nodeIds.has(edge?.from) || !nodeIds.has(edge?.to)) issue(errors, `${path}.graph.edges`, 'cannot point to a missing node');
        if (!nonEmpty(edge?.id) || edgeIds.has(edge.id)) issue(errors, `${path}.graph.edges`, 'must use unique stable edge IDs');
        if (edge?.bidirectional !== true) issue(errors, `${path}.graph.edges`, 'must declare its semantic connection direction');
        edgeIds.add(edge?.id);
    }
    const requireNode = (id, kind, label) => {
        const node = nodeById.get(id);
        if (!node) {
            issue(errors, `${path}.graph.nodes`, `is missing required semantic node ${id}`);
            return null;
        }
        if (node.kind !== kind) issue(errors, `${path}.graph.nodes.${label}`, `must be a ${kind}`);
        return node;
    };
    const expectedNodes = [
        section.innerGate?.nodeId,
        section.soundtrackCard?.nodeId,
        section.permit?.nodeId,
        section.permit?.targetNormalRoomNodeId,
        section.heartSong?.nodeId,
        section.returnShortcut?.nodeId,
        section.outerBreach?.nodeId,
    ];
    for (const id of expectedNodes) if (!nodeIds.has(id)) issue(errors, `${path}.graph.nodes`, `is missing required semantic node ${id}`);

    const gateNode = requireNode(section.innerGate?.nodeId, 'INNER_GATE', 'innerGate');
    if (gateNode && (gateNode.widthTiles !== 2 || gateNode.shojiOverlay !== false || gateNode.anchor !== section.innerGate?.anchor)) {
        issue(errors, `${path}.graph.nodes.innerGate`, 'must mirror the bare two-tile gate metadata');
    }
    const soundtrackNode = requireNode(section.soundtrackCard?.nodeId, 'SOUNDTRACK_CARD', 'soundtrack');
    if (soundtrackNode && (soundtrackNode.cardId !== section.soundtrackCard?.cardId
        || soundtrackNode.ownerSectionId !== section.id
        || soundtrackNode.behindOwningDoubleDoor !== true)) {
        issue(errors, `${path}.graph.nodes.soundtrack`, 'must retain the owner-gate soundtrack card identity');
    }
    const permitNode = requireNode(section.permit?.nodeId, 'PERMIT_CARD', 'permit');
    if (permitNode && (permitNode.cardId !== section.permit?.cardId
        || permitNode.permitId !== section.permit?.permitId
        || permitNode.targetSpecialRoomKey !== section.specialRoomKey)) {
        issue(errors, `${path}.graph.nodes.permit`, 'must retain the owning permit identity');
    }
    const majorNode = nodes.find(node => node?.kind === 'MAJOR_BUILDING');
    if (!majorNode || majorNode.buildingId !== section.majorBuildingId || majorNode.specialRoomKey !== section.specialRoomKey) {
        issue(errors, `${path}.graph.nodes.major`, 'must retain the authored major building identity');
    }
    const songNode = requireNode(section.heartSong?.nodeId, 'HEART_SONG_CARD', 'heartSong');
    if (songNode && (songNode.cardId !== section.heartSong?.cardId || songNode.identity !== section.heartSong?.identity)) {
        issue(errors, `${path}.graph.nodes.heartSong`, 'must retain the authored Heart Song identity');
    }
    const shortcutNode = requireNode(section.returnShortcut?.nodeId, 'RETURN_SHORTCUT', 'returnShortcut');
    if (shortcutNode && shortcutNode.oneWayToHeart !== true) issue(errors, `${path}.graph.nodes.returnShortcut`, 'must remain a one-way return shortcut');
    const breachNode = requireNode(section.outerBreach?.nodeId, 'OUTER_BREACH', 'outerBreach');
    if (breachNode && breachNode.breachRole !== section.outerBreach?.breachRole) issue(errors, `${path}.graph.nodes.outerBreach`, 'must retain the declared breach role');

    const normalNodes = nodes.filter(node => node?.kind === 'NORMAL_ROOM');
    if (normalNodes.length !== section.normalRooms?.length) issue(errors, `${path}.graph.nodes`, 'must contain one semantic node for every selected normal room');
    for (const room of section.normalRooms || []) {
        const roomNode = normalNodes.find(node => node.roomKey === room.roomKey);
        if (!roomNode || roomNode.role !== room.role || roomNode.label !== room.label) {
            issue(errors, `${path}.graph.nodes`, `must retain the semantic node for ${room.roomKey}`);
        }
    }
    const permitTargetNode = nodeById.get(section.permit?.targetNormalRoomNodeId);
    if (!permitTargetNode || permitTargetNode.kind !== 'NORMAL_ROOM' || permitTargetNode.roomKey !== permitRoom?.roomKey) {
        issue(errors, `${path}.permit.targetNormalRoomNodeId`, 'must target its selected normal-room node');
    }

    const construction = section.construction || {};
    const standardTemplateIds = new Set(TEMPLATE_ORDER.map(template => template.id));
    const attempts = construction.attemptedTemplates;
    if (construction.maxTemplateAttempts !== MAX_TEMPLATE_ATTEMPTS) {
        issue(errors, `${path}.construction.maxTemplateAttempts`, `must remain bounded at ${MAX_TEMPLATE_ATTEMPTS}`);
    }
    if (!Array.isArray(attempts) || attempts.length < 1) {
        issue(errors, `${path}.construction.attemptedTemplates`, 'must expose the bounded template decision');
    } else {
        const standardAttempts = attempts.filter(attempt => standardTemplateIds.has(attempt?.templateId));
        if (standardAttempts.length > MAX_TEMPLATE_ATTEMPTS) {
            issue(errors, `${path}.construction.attemptedTemplates`, 'cannot retry more standard templates than the contract allows');
        }
        const finalAttempt = attempts.at(-1);
        if (construction.fallbackUsed === true) {
            if (section.graphTemplate !== AUTHORED_FALLBACK.id || finalAttempt?.templateId !== AUTHORED_FALLBACK.id || finalAttempt?.accepted !== true) {
                issue(errors, `${path}.construction`, 'must name the authored fallback rather than hide a repair result');
            }
        } else if (construction.fallbackUsed !== false
            || !standardTemplateIds.has(section.graphTemplate)
            || finalAttempt?.templateId !== section.graphTemplate
            || finalAttempt?.accepted !== true) {
            issue(errors, `${path}.construction`, 'must expose its accepted authored graph template');
        }
    }

    const routes = section.routes || {};
    const routeChecks = [
        ['entryToSoundtrack', section.innerGate?.nodeId, section.soundtrackCard?.nodeId],
        ['entryToPermit', section.innerGate?.nodeId, section.permit?.nodeId],
        ['entryToSong', section.innerGate?.nodeId, section.heartSong?.nodeId],
        ['returnToGate', section.heartSong?.nodeId, section.innerGate?.nodeId],
        ['raidToGate', section.outerBreach?.nodeId, section.innerGate?.nodeId],
    ];
    for (const [name, start, end] of routeChecks) {
        const route = routes[name];
        if (!Array.isArray(route) || route[0] !== start || route.at(-1) !== end || !routeIsValid(edges, route)) {
            issue(errors, `${path}.routes.${name}`, 'must be a connected semantic route with the declared endpoints');
        }
    }
    if (routeHasKind(section, routes.entryToSong || [], 'RETURN_SHORTCUT')) {
        issue(errors, `${path}.routes.entryToSong`, 'must not use the locked return shortcut outbound');
    }
    if (!routeHasKind(section, routes.returnToGate || [], 'RETURN_SHORTCUT')) {
        issue(errors, `${path}.routes.returnToGate`, 'must use the unlocked return shortcut');
    }
    if (routeHasKind(section, routes.raidToGate || [], 'RETURN_SHORTCUT')) {
        issue(errors, `${path}.routes.raidToGate`, 'must not route raiders through the player return shortcut');
    }
    if (Array.isArray(routes.entryToSong) && Array.isArray(routes.returnToGate)
        && routes.returnToGate.length >= routes.entryToSong.length) {
        issue(errors, `${path}.routes.returnToGate`, 'must be materially shorter than the outbound song route');
    }
    const loop = section.graph?.loopWitness;
    if (!Array.isArray(loop) || loop.length < 4 || loop[0] !== loop.at(-1) || !routeIsValid(edges, loop)) {
        issue(errors, `${path}.graph.loopWitness`, 'must prove a closed section loop');
    }
    return { valid: errors.length === 0, errors };
}

function buildHeartRecipe(floor, catalog) {
    return {
        nodeId: heartNodeId(floor),
        sectionId: 0,
        buildingId: catalog.heart.buildingId,
        majorRoomKey: catalog.heart.majorRoomKey,
        specialRoomKey: catalog.heart.specialRoomKey,
        fixedCenter: true,
        entryDisplayRoom: 1,
        cabaretDisplayRoom: 2,
        entryKey: 'HEART_ENTRY',
        cabaretKey: catalog.heart.majorRoomKey,
        treasuryNodeId: heartNodeId(floor),
        treasuryAuthority: catalog.globalRules.goldAuthority,
        hall: {
            roomKey: 'HEART_HALL',
            tilesWide: 2,
            cardsForbidden: true,
            ambientHungryGhostCap: catalog.globalRules.cabaretAmbientHungryGhostCap,
        },
        gates: catalog.sections
            .slice()
            .sort((a, b) => a.sectionId - b.sectionId)
            .map(section => ({
                id: gateNodeId(floor, section.sectionId),
                sectionId: section.sectionId,
                anchor: section.anchors.innerGate,
                widthTiles: 2,
                doorKind: 'ARCHITECTURAL_DOUBLE',
                shojiOverlay: false,
            })),
    };
}

export function deriveSectionRecipe({
    rootSeed,
    floor = 1,
    sectionId,
    catalog = FLOOR_1_CATALOG,
    generatorVersion = GRAPH_GENERATOR_VERSION,
    testOnlyRejectTemplateIds = [],
} = {}) {
    const normalizedRootSeed = rootSeedOf(rootSeed);
    const normalizedFloor = floorOf(floor);
    const catalogReport = assertFloorCatalog(catalog);
    if (catalog.floor !== normalizedFloor) throw new RangeError(`No P3 catalog for floor ${normalizedFloor}`);
    if (!nonEmpty(generatorVersion)) throw new TypeError('generatorVersion must be a non-empty string');
    const normalizedSectionId = Number(sectionId);
    const sectionCatalog = catalog.sections.find(section => section.sectionId === normalizedSectionId);
    if (!sectionCatalog) throw new RangeError(`No authored catalog section ${sectionId}`);
    const rejected = normaliseRejectedTemplateIds(testOnlyRejectTemplateIds);
    const normalRoomCount = sectionCatalog.roomBudget.normalRoomMin + keyedIndex(
        sectionCatalog.roomBudget.normalRoomMax - sectionCatalog.roomBudget.normalRoomMin + 1,
        normalizedRootSeed, generatorVersion, 'floor', normalizedFloor, 'section', normalizedSectionId, 'room-count',
    );

    const attemptedTemplates = [];
    for (const template of templateCandidates(normalizedRootSeed, normalizedFloor, normalizedSectionId, generatorVersion)) {
        if (attemptedTemplates.length >= MAX_TEMPLATE_ATTEMPTS) break;
        if (rejected.has(template.id)) {
            attemptedTemplates.push({ templateId: template.id, accepted: false, reason: 'test-rejected' });
            continue;
        }
        const candidate = buildSectionCandidate({
            rootSeed: normalizedRootSeed,
            floor: normalizedFloor,
            generatorVersion,
            catalogReport,
            sectionCatalog,
            template,
            normalRoomCount,
        });
        candidate.construction.attemptedTemplates = [...attemptedTemplates, { templateId: template.id, accepted: true }];
        candidate.construction.fallbackUsed = false;
        const report = validateSectionRecipe(candidate, sectionCatalog);
        if (report.valid) {
            candidate.recipeHash = recipeHash(candidate);
            return deepFreeze(candidate);
        }
        attemptedTemplates.push({ templateId: template.id, accepted: false, reason: report.errors.join(' | ') });
    }

    const fallback = buildSectionCandidate({
        rootSeed: normalizedRootSeed,
        floor: normalizedFloor,
        generatorVersion,
        catalogReport,
        sectionCatalog,
        template: AUTHORED_FALLBACK,
        normalRoomCount,
    });
    fallback.construction.attemptedTemplates = [...attemptedTemplates, { templateId: AUTHORED_FALLBACK.id, accepted: true }];
    fallback.construction.fallbackUsed = true;
    const fallbackReport = validateSectionRecipe(fallback, sectionCatalog);
    if (!fallbackReport.valid) throw new Error(`Authored P3 fallback failed: ${fallbackReport.errors.join(' | ')}`);
    fallback.recipeHash = recipeHash(fallback);
    return deepFreeze(fallback);
}

function floorManifestPayload(recipe) {
    const payload = cloneJson(recipe);
    delete payload.manifestHash;
    return payload;
}

function floorManifestHash(recipe) {
    return `fnv1a32:${checksum(floorManifestPayload(recipe))}`;
}

export function validateFloorRecipe(recipe, catalog = FLOOR_1_CATALOG) {
    const errors = [];
    let catalogReport;
    try { catalogReport = assertFloorCatalog(catalog); }
    catch (error) { return { valid: false, errors: [`catalog: ${error.message}`] }; }
    if (!recipe || typeof recipe !== 'object') return { valid: false, errors: ['recipe: must be an object'] };
    if (recipe.schemaVersion !== GRAPH_RECIPE_SCHEMA) issue(errors, 'recipe.schemaVersion', `must be ${GRAPH_RECIPE_SCHEMA}`);
    if (!nonEmpty(recipe.generatorVersion)) issue(errors, 'recipe.generatorVersion', 'must be a non-empty string');
    if (recipe.floor !== catalog.floor) issue(errors, 'recipe.floor', 'must match the catalog floor');
    if (recipe.buildingCatalogVersion !== catalog.catalogVersion) issue(errors, 'recipe.buildingCatalogVersion', 'must match the catalog');
    if (recipe.catalogHash !== catalogReport.catalogHash) issue(errors, 'recipe.catalogHash', 'must match the catalog hash');
    try { rootSeedOf(recipe.rootSeed); } catch (error) { issue(errors, 'recipe.rootSeed', error.message); }
    if (!nonEmpty(recipe.floorSeed) || !nonEmpty(recipe.heartSeed)) issue(errors, 'recipe', 'must have isolated floor and heart seeds');

    let seedIdentity = null;
    try {
        seedIdentity = deriveFloorIdentity({
            rootSeed: recipe.rootSeed,
            floor: recipe.floor,
            generatorVersion: recipe.generatorVersion,
        });
        if (recipe.floorSeed !== seedIdentity.floorSeed) issue(errors, 'recipe.floorSeed', 'must match its keyed floor namespace');
        if (recipe.heartSeed !== seedIdentity.heartSeed) issue(errors, 'recipe.heartSeed', 'must match its keyed Heart namespace');
    } catch (error) {
        issue(errors, 'recipe.seedIdentity', error.message);
    }

    const heart = recipe.heart || {};
    if (heart.sectionId !== 0 || heart.fixedCenter !== true) issue(errors, 'recipe.heart', 'must remain the fixed centered Section 0 authority');
    if (heart.nodeId !== heartNodeId(recipe.floor)) issue(errors, 'recipe.heart.nodeId', 'must be the fixed Heart node');
    if (heart.buildingId !== catalog.heart.buildingId
        || heart.majorRoomKey !== catalog.heart.majorRoomKey
        || heart.specialRoomKey !== catalog.heart.specialRoomKey) {
        issue(errors, 'recipe.heart', 'must retain the authored Cabaret Heart identity');
    }
    if (heart.entryDisplayRoom !== 1 || heart.cabaretDisplayRoom !== 2
        || heart.entryKey !== 'HEART_ENTRY'
        || heart.cabaretKey !== catalog.heart.majorRoomKey) {
        issue(errors, 'recipe.heart', 'must retain Room 1 entry plus Room 2 Cabaret semantics');
    }
    if (heart.treasuryNodeId !== heart.nodeId || heart.treasuryAuthority !== catalog.globalRules.goldAuthority) {
        issue(errors, 'recipe.heart.treasury', 'must keep gold authority in the Cabaret Heart');
    }
    if (heart.hall?.tilesWide !== 2) issue(errors, 'recipe.heart.hall.tilesWide', 'must be exactly two tiles wide');
    if (heart.hall?.cardsForbidden !== true) issue(errors, 'recipe.heart.hall.cardsForbidden', 'must keep section cards out of Heart Hall');
    if (heart.hall?.ambientHungryGhostCap !== 0) issue(errors, 'recipe.heart.hall.ambientHungryGhostCap', 'must keep ambient Cabaret ghosts at zero');
    const heartGatesBySection = new Map();
    if (!Array.isArray(heart.gates) || heart.gates.length !== 4) {
        issue(errors, 'recipe.heart.gates', 'must have exactly four section gates');
    } else {
        const gateSections = new Set();
        for (const gate of heart.gates) {
            const source = catalog.sections.find(section => section.sectionId === gate?.sectionId);
            if (!SECTION_IDS.includes(gate.sectionId)) issue(errors, 'recipe.heart.gates', 'must point to Section 1–4');
            if (gate.widthTiles !== 2 || gate.shojiOverlay !== false || gate.doorKind !== 'ARCHITECTURAL_DOUBLE') {
                issue(errors, `recipe.heart.gates.${gate.sectionId}`, 'must be a bare two-tile architectural double door');
            }
            if (gate.id !== gateNodeId(recipe.floor, gate.sectionId)) issue(errors, `recipe.heart.gates.${gate.sectionId}.id`, 'must use a stable gate ID');
            if (gate.anchor !== source?.anchors?.innerGate) issue(errors, `recipe.heart.gates.${gate.sectionId}.anchor`, 'must match its authored section gate anchor');
            if (gateSections.has(gate.sectionId)) issue(errors, 'recipe.heart.gates', `duplicates Section ${gate.sectionId}`);
            gateSections.add(gate.sectionId);
            heartGatesBySection.set(gate.sectionId, gate);
        }
        for (const sectionId of SECTION_IDS) if (!gateSections.has(sectionId)) issue(errors, 'recipe.heart.gates', `is missing Section ${sectionId}`);
    }

    const heartConnectionsBySection = new Map();
    if (!Array.isArray(recipe.heartConnections) || recipe.heartConnections.length !== 4) {
        issue(errors, 'recipe.heartConnections', 'must declare exactly four section-to-Heart graph connections');
    } else {
        for (const connection of recipe.heartConnections) {
            const sectionId = connection?.sectionId;
            const expectedGateId = gateNodeId(recipe.floor, sectionId);
            const expectedId = `HEART_GATE:${[heart.nodeId, expectedGateId].sort().join('↔')}`;
            if (!SECTION_IDS.includes(sectionId)) issue(errors, 'recipe.heartConnections', 'must only bind Section 1–4');
            if (heartConnectionsBySection.has(sectionId)) issue(errors, 'recipe.heartConnections', `duplicates Section ${sectionId}`);
            if (connection?.id !== expectedId
                || connection?.from !== expectedGateId
                || connection?.to !== heart.nodeId
                || connection?.kind !== 'HEART_GATE'
                || connection?.bidirectional !== true) {
                issue(errors, `recipe.heartConnections.${sectionId}`, 'must be the named two-way gate-to-Heart graph edge');
            }
            heartConnectionsBySection.set(sectionId, connection);
        }
        for (const sectionId of SECTION_IDS) if (!heartConnectionsBySection.has(sectionId)) issue(errors, 'recipe.heartConnections', `is missing Section ${sectionId}`);
    }

    if (!Array.isArray(recipe.sections) || recipe.sections.length !== 4) {
        issue(errors, 'recipe.sections', 'must contain exactly four outer sections');
    } else {
        const seen = new Set();
        for (const section of recipe.sections) {
            const source = catalog.sections.find(entry => entry.sectionId === section?.id);
            if (!source) {
                issue(errors, 'recipe.sections', `has unknown Section ${section?.id}`);
                continue;
            }
            if (seen.has(section.id)) issue(errors, 'recipe.sections', `duplicates Section ${section.id}`);
            seen.add(section.id);
            const sectionReport = validateSectionRecipe(section, source);
            for (const error of sectionReport.errors) issue(errors, `recipe.sections.${section.id}`, error);
            const expectedSeed = seedIdentity?.sections.find(candidate => candidate.sectionId === section.id);
            if (expectedSeed && (section.layoutSeed !== expectedSeed.layoutSeed || section.contentSeed !== expectedSeed.contentSeed)) {
                issue(errors, `recipe.sections.${section.id}.seeds`, 'must match isolated keyed section namespaces');
            }
            if (section.innerGate?.nodeId !== gateNodeId(recipe.floor, section.id)) {
                issue(errors, `recipe.sections.${section.id}.innerGate`, 'must bind the matching Heart gate');
            }
            const heartGate = heartGatesBySection.get(section.id);
            if (!heartGate || heartGate.id !== section.innerGate?.nodeId || heartGate.anchor !== section.innerGate?.anchor) {
                issue(errors, `recipe.sections.${section.id}.innerGate`, 'must agree with its fixed Heart gate');
            }
            const connection = heartConnectionsBySection.get(section.id);
            const routes = section.routes || {};
            const returnRoute = routes.returnToHeart;
            const raidRoute = routes.raidToHeart;
            if (!Array.isArray(returnRoute)
                || returnRoute.at(-1) !== heart.nodeId
                || !sameList(returnRoute.slice(0, -1), routes.returnToGate)) {
                issue(errors, `recipe.sections.${section.id}.routes.returnToHeart`, 'must extend the return shortcut through its named Heart gate');
            }
            if (!Array.isArray(raidRoute)
                || raidRoute.at(-1) !== heart.nodeId
                || !sameList(raidRoute.slice(0, -1), routes.raidToGate)) {
                issue(errors, `recipe.sections.${section.id}.routes.raidToHeart`, 'must extend the breach raid route through its named Heart gate');
            }
            if (!connection
                || returnRoute?.at(-2) !== connection.from
                || raidRoute?.at(-2) !== connection.from
                || connection.to !== heart.nodeId) {
                issue(errors, `recipe.sections.${section.id}.routes`, 'must cross only its declared gate-to-Heart connection');
            }
            const expectedRecipeHash = recipeHash(section);
            if (section.recipeHash !== expectedRecipeHash) issue(errors, `recipe.sections.${section.id}.recipeHash`, 'must match semantic recipe content');
        }
        for (const sectionId of SECTION_IDS) if (!seen.has(sectionId)) issue(errors, 'recipe.sections', `is missing Section ${sectionId}`);
    }
    const expectedManifestHash = floorManifestHash(recipe);
    if (recipe.manifestHash !== expectedManifestHash) issue(errors, 'recipe.manifestHash', 'must match semantic recipe content');
    return { valid: errors.length === 0, errors, manifestHash: expectedManifestHash };
}

export class GraphRecipeValidationError extends Error {
    constructor(errors) {
        super(`Cabaret graph recipe rejected:\n${errors.map(error => `- ${error}`).join('\n')}`);
        this.name = 'GraphRecipeValidationError';
        this.errors = [...errors];
    }
}

export function assertFloorRecipe(recipe, catalog = FLOOR_1_CATALOG) {
    const report = validateFloorRecipe(recipe, catalog);
    if (!report.valid) throw new GraphRecipeValidationError(report.errors);
    return report;
}

export function deriveFloorRecipe({
    rootSeed,
    floor = 1,
    catalog = FLOOR_1_CATALOG,
    generatorVersion = GRAPH_GENERATOR_VERSION,
    sectionOrder = null,
    testOnlyRejectTemplateIds = [],
} = {}) {
    const normalizedRootSeed = rootSeedOf(rootSeed);
    const normalizedFloor = floorOf(floor);
    const catalogReport = assertFloorCatalog(catalog);
    if (catalog.floor !== normalizedFloor) throw new RangeError(`No P3 catalog for floor ${normalizedFloor}`);
    if (!nonEmpty(generatorVersion)) throw new TypeError('generatorVersion must be a non-empty string');
    const seedIdentity = deriveFloorIdentity({
        rootSeed: normalizedRootSeed,
        floor: normalizedFloor,
        generatorVersion,
    });
    const orderedIds = normaliseOrder(sectionOrder, SECTION_IDS);
    const bySection = new Map();
    for (const sectionId of orderedIds) {
        bySection.set(sectionId, deriveSectionRecipe({
            rootSeed: normalizedRootSeed,
            floor: normalizedFloor,
            sectionId,
            catalog,
            generatorVersion,
            testOnlyRejectTemplateIds,
        }));
    }
    const sections = SECTION_IDS.map(sectionId => cloneJson(bySection.get(sectionId)));
    const heart = buildHeartRecipe(normalizedFloor, catalog);
    const recipe = {
        schemaVersion: GRAPH_RECIPE_SCHEMA,
        generatorVersion,
        buildingCatalogVersion: catalog.catalogVersion,
        catalogHash: catalogReport.catalogHash,
        rootSeed: normalizedRootSeed,
        floor: normalizedFloor,
        floorSeed: seedIdentity.floorSeed,
        heartSeed: seedIdentity.heartSeed,
        generationRecipe: 'CABARET_HEART_GRAPH_ONLY',
        heart,
        heartConnections: heart.gates.map(gate => ({
            id: `HEART_GATE:${[heart.nodeId, gate.id].sort().join('↔')}`,
            sectionId: gate.sectionId,
            from: gate.id,
            to: heart.nodeId,
            kind: 'HEART_GATE',
            bidirectional: true,
        })),
        sections,
        manifestHash: null,
    };
    recipe.manifestHash = floorManifestHash(recipe);
    const report = validateFloorRecipe(recipe, catalog);
    if (!report.valid) throw new GraphRecipeValidationError(report.errors);
    return deepFreeze(recipe);
}

/** Convenience surface for P4/P5 adapters: derives but never mounts a section. [REF#DG-00005] */
export function sectionRecipeFor(recipe, sectionId) {
    const section = recipe?.sections?.find(candidate => candidate.id === Number(sectionId)) || null;
    return section || null;
}
