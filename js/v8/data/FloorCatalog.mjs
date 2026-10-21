/** [REF#DA-00025]
 * FloorCatalog.mjs — authored building identity before procedural geometry.
 *
 * P2 owns the semantic contract only. It intentionally does not import Three,
 * mount rooms, write saves, choose RNG, or mutate live permit/song registries.
 * P3 consumes this catalog to make graph recipes; P5 is the first phase allowed
 * to authorize a live-map adapter.
 */

export const FLOOR_CATALOG_SCHEMA_VERSION = 1;
export const FLOOR_1_CATALOG_VERSION = 'floor-1-cabaret-heart-p2-1';

const OUTER_SECTION_EXPECTATIONS = Object.freeze({
    1: Object.freeze({
        quadrant: 'SOUTH', buildingId: 'GUARDPOST_POLICE', majorAnchor: 'SOUTHEAST_JUNCTION',
    }),
    2: Object.freeze({
        quadrant: 'EAST', buildingId: 'FACTORY_FLOOR', majorAnchor: 'EAST',
    }),
    3: Object.freeze({
        quadrant: 'NORTH', buildingId: 'SLEEPING_WARD', majorAnchor: 'NORTH',
    }),
    4: Object.freeze({
        quadrant: 'WEST', buildingId: 'LONG_CAFETERIA', majorAnchor: 'WEST_CABARET_EXIT',
    }),
});

const ROOM_ROLES = new Set(['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF', 'REWARD', 'SECRET']);

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function issue(errors, path, message) {
    errors.push(`${path}: ${message}`);
}

function requireText(errors, value, path) {
    if (!nonEmpty(value)) issue(errors, path, 'must be a non-empty string');
}

function containsForbiddenPlaceholder(value, path, errors, seen = new Set()) {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
        if (value.toUpperCase().includes('UNASSIGNED_REQUIRED')) {
            issue(errors, path, 'must not contain UNASSIGNED_REQUIRED');
        }
        return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        containsForbiddenPlaceholder(child, `${path}.${key}`, errors, seen);
    }
}

function validateDeck(deck, path, errors, expectedCount) {
    if (!Array.isArray(deck) || deck.length !== expectedCount) {
        issue(errors, path, `must contain exactly ${expectedCount} authored rooms`);
        return;
    }
    const keys = new Set();
    const roles = new Set();
    for (let index = 0; index < deck.length; index++) {
        const room = deck[index] || {};
        const roomPath = `${path}[${index}]`;
        requireText(errors, room.key, `${roomPath}.key`);
        requireText(errors, room.label, `${roomPath}.label`);
        if (!ROOM_ROLES.has(room.role)) issue(errors, `${roomPath}.role`, 'must be a known progressive-room role');
        if (keys.has(room.key)) issue(errors, `${roomPath}.key`, 'must be unique inside its room deck');
        if (roles.has(room.role)) issue(errors, `${roomPath}.role`, 'must be unique inside its room deck');
        keys.add(room.key);
        roles.add(room.role);
    }
}

function validateJobSlots(slots, path, errors) {
    if (!Array.isArray(slots) || slots.length < 1) {
        issue(errors, path, 'must contain at least one bounded job slot');
        return;
    }
    const ids = new Set();
    for (let index = 0; index < slots.length; index++) {
        const slot = slots[index] || {};
        const slotPath = `${path}[${index}]`;
        requireText(errors, slot.id, `${slotPath}.id`);
        requireText(errors, slot.label, `${slotPath}.label`);
        if (!Number.isInteger(slot.capacity) || slot.capacity < 1) {
            issue(errors, `${slotPath}.capacity`, 'must be a positive integer');
        }
        if (ids.has(slot.id)) issue(errors, `${slotPath}.id`, 'must be unique inside its job profile');
        ids.add(slot.id);
    }
}

function validateBuilding(building, path, errors, expectation, isHeart = false) {
    if (!building || typeof building !== 'object') {
        issue(errors, path, 'must be an object');
        return;
    }
    requireText(errors, building.buildingId, `${path}.buildingId`);
    requireText(errors, building.displayName, `${path}.displayName`);
    requireText(errors, building.majorRoomKey, `${path}.majorRoomKey`);
    requireText(errors, building.specialRoomKey, `${path}.specialRoomKey`);
    requireText(errors, building.playerPromise, `${path}.playerPromise`);
    requireText(errors, building.readabilityNote, `${path}.readabilityNote`);
    requireText(errors, building.saveMigrationImpact, `${path}.saveMigrationImpact`);

    if (!Number.isInteger(building.sectionId)) issue(errors, `${path}.sectionId`, 'must be an integer');
    if (!nonEmpty(building.quadrant)) issue(errors, `${path}.quadrant`, 'must name its quadrant');
    if (expectation) {
        if (building.quadrant !== expectation.quadrant) issue(errors, `${path}.quadrant`, `must be ${expectation.quadrant}`);
        if (building.buildingId !== expectation.buildingId) issue(errors, `${path}.buildingId`, `must be ${expectation.buildingId}`);
    }

    const permit = building.permit || {};
    requireText(errors, permit.permitId, `${path}.permit.permitId`);
    requireText(errors, permit.cardId, `${path}.permit.cardId`);
    requireText(errors, permit.displayName, `${path}.permit.displayName`);
    requireText(errors, building.workerBenefit?.id, `${path}.workerBenefit.id`);
    requireText(errors, building.workerBenefit?.summary, `${path}.workerBenefit.summary`);
    validateJobSlots(building.jobSlots, `${path}.jobSlots`, errors);

    const soundtrack = building.soundtrack || {};
    requireText(errors, soundtrack.identity, `${path}.soundtrack.identity`);
    requireText(errors, soundtrack.cardId, `${path}.soundtrack.cardId`);
    requireText(errors, soundtrack.cardAnchor, `${path}.soundtrack.cardAnchor`);
    requireText(errors, soundtrack.composerIntent, `${path}.soundtrack.composerIntent`);
    if (soundtrack.ownerSectionId !== building.sectionId) {
        issue(errors, `${path}.soundtrack.ownerSectionId`, 'must equal the building sectionId');
    }
    if (soundtrack.behindOwningDoubleDoor !== !isHeart) {
        issue(errors, `${path}.soundtrack.behindOwningDoubleDoor`, isHeart
            ? 'must be false for the fixed Heart'
            : 'must be true for an outer section');
    }

    const song = building.heartSong || {};
    requireText(errors, song.identity, `${path}.heartSong.identity`);
    requireText(errors, song.cardId, `${path}.heartSong.cardId`);
    requireText(errors, song.anchor, `${path}.heartSong.anchor`);
    if (!isHeart) {
        for (const field of ['heartValue', 'returnHeal', 'workerWakeValue']) {
            if (!Number.isInteger(song[field]) || song[field] < 1) {
                issue(errors, `${path}.heartSong.${field}`, 'must be a positive integer for a returnable section song');
            }
        }
    }

    const anchors = building.anchors || {};
    for (const field of ['majorRoom', 'innerGate', 'soundtrackCard', 'heartSong', 'returnShortcut', 'outerBreach']) {
        requireText(errors, anchors[field], `${path}.anchors.${field}`);
    }
    if (expectation && anchors.majorRoom !== expectation.majorAnchor) {
        issue(errors, `${path}.anchors.majorRoom`, `must be ${expectation.majorAnchor}`);
    }
    if (anchors.soundtrackCard !== soundtrack.cardAnchor) {
        issue(errors, `${path}.anchors.soundtrackCard`, 'must match soundtrack.cardAnchor');
    }
    if (anchors.heartSong !== song.anchor) issue(errors, `${path}.anchors.heartSong`, 'must match heartSong.anchor');

    const raid = building.raid || {};
    requireText(errors, raid.breachRole, `${path}.raid.breachRole`);
    requireText(errors, raid.outerBreachAnchor, `${path}.raid.outerBreachAnchor`);
    requireText(errors, raid.responsePromise, `${path}.raid.responsePromise`);
    if (raid.outerBreachAnchor !== anchors.outerBreach) {
        issue(errors, `${path}.raid.outerBreachAnchor`, 'must match anchors.outerBreach');
    }

    validateDeck(building.roomDeck, `${path}.roomDeck`, errors, isHeart ? 2 : 6);
    if (!isHeart) {
        const budget = building.roomBudget || {};
        // Mark 2026-08-03: "make sure each section 1-4 has 5-8 rooms each in them." Raised from the [REF#DA-00026]
        // authored 4–6. The floor still cannot fall below requiredRoles.length (4 cadence roles), so a
        // minimum of 5 keeps the TEACH/CHOICE/PRESSURE/RELIEF rhythm intact with a room to spare.
        if (budget.normalRoomMin !== 5 || budget.normalRoomMax !== 6) {
            issue(errors, `${path}.roomBudget`, 'must preserve the dynamic 5–6 normal-room budget');
        }
        if (!Array.isArray(budget.requiredRoles) || budget.requiredRoles.length !== 4) {
            issue(errors, `${path}.roomBudget.requiredRoles`, 'must name the four minimum-budget cadence roles');
        } else {
            const deckRoles = new Set((building.roomDeck || []).map(room => room?.role));
            for (const role of budget.requiredRoles) {
                if (!ROOM_ROLES.has(role) || !deckRoles.has(role)) {
                    issue(errors, `${path}.roomBudget.requiredRoles`, `must resolve ${role} from the authored room deck`);
                }
            }
        }
    }
    const grammar = building.encounterGrammar || {};
    requireText(errors, grammar.summary, `${path}.encounterGrammar.summary`);
    if (!Array.isArray(grammar.pressures) || grammar.pressures.length < 1) {
        issue(errors, `${path}.encounterGrammar.pressures`, 'must name at least one pressure');
    }
    if (!Array.isArray(grammar.reliefs) || grammar.reliefs.length < 1) {
        issue(errors, `${path}.encounterGrammar.reliefs`, 'must name at least one relief');
    }
    if (!Array.isArray(grammar.prohibited) || grammar.prohibited.length < 1) {
        issue(errors, `${path}.encounterGrammar.prohibited`, 'must name at least one prohibited encounter');
    }
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
        return out;
    }
    return value;
}

/** Stable, non-cryptographic content identity for recipe/save compatibility checks. [REF#DA-00027] */
export function catalogHash(catalog) {
    const text = JSON.stringify(canonicalize(catalog));
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

/** [REF#DA-00028]
 * Return all structural failures instead of silently accepting a fallback.
 * A caller that wants a production recipe must call assertFloorCatalog first.
 */
export function validateFloorCatalog(catalog) {
    const errors = [];
    if (!catalog || typeof catalog !== 'object') {
        return { valid: false, errors: ['catalog: must be an object'], catalogHash: null };
    }
    if (catalog.schemaVersion !== FLOOR_CATALOG_SCHEMA_VERSION) {
        issue(errors, 'catalog.schemaVersion', `must be ${FLOOR_CATALOG_SCHEMA_VERSION}`);
    }
    if (catalog.floor !== 1) issue(errors, 'catalog.floor', 'P2 currently authorizes Floor 1 only');
    requireText(errors, catalog.catalogVersion, 'catalog.catalogVersion');
    if (catalog.mountPolicy?.p2CatalogOnly !== true) issue(errors, 'catalog.mountPolicy.p2CatalogOnly', 'must remain true in P2');
    if (catalog.mountPolicy?.productionMountAllowed !== false) {
        issue(errors, 'catalog.mountPolicy.productionMountAllowed', 'must remain false until P5 runtime authorization');
    }
    if (catalog.mountPolicy?.earliestLivePhase !== 'P5') {
        issue(errors, 'catalog.mountPolicy.earliestLivePhase', 'must be P5');
    }
    if (catalog.globalRules?.goldAuthority !== 'CABARET_TREASURY_ONLY') {
        issue(errors, 'catalog.globalRules.goldAuthority', 'must keep all gold in the Cabaret treasury');
    }
    if (catalog.globalRules?.cabaretAmbientHungryGhostCap !== 0) {
        issue(errors, 'catalog.globalRules.cabaretAmbientHungryGhostCap', 'must be zero');
    }

    validateBuilding(catalog.heart, 'catalog.heart', errors, null, true);
    if (catalog.heart?.sectionId !== 0) issue(errors, 'catalog.heart.sectionId', 'must be Section 0');
    if (catalog.heart?.buildingId !== 'CABARET_HEART') issue(errors, 'catalog.heart.buildingId', 'must be CABARET_HEART');
    if (catalog.heart?.majorRoomKey !== 'HEART_CABARET') issue(errors, 'catalog.heart.majorRoomKey', 'must preserve HEART_CABARET');

    if (!Array.isArray(catalog.sections) || catalog.sections.length !== 4) {
        issue(errors, 'catalog.sections', 'must contain exactly Sections 1–4');
    } else {
        const seenSections = new Set();
        const buildingIds = new Set([catalog.heart?.buildingId]);
        const specialRoomKeys = new Set([catalog.heart?.specialRoomKey]);
        const permitIds = new Set([catalog.heart?.permit?.permitId]);
        const soundtrackCards = new Set([catalog.heart?.soundtrack?.cardId]);
        const heartSongCards = new Set([catalog.heart?.heartSong?.cardId]);
        for (let index = 0; index < catalog.sections.length; index++) {
            const building = catalog.sections[index];
            const sectionId = building?.sectionId;
            const path = `catalog.sections[${index}]`;
            if (!OUTER_SECTION_EXPECTATIONS[sectionId]) {
                issue(errors, `${path}.sectionId`, 'must be an authored Section 1–4');
            } else {
                validateBuilding(building, path, errors, OUTER_SECTION_EXPECTATIONS[sectionId]);
            }
            if (seenSections.has(sectionId)) issue(errors, `${path}.sectionId`, 'must be unique');
            seenSections.add(sectionId);
            for (const [field, seen, value] of [
                ['buildingId', buildingIds, building?.buildingId],
                ['specialRoomKey', specialRoomKeys, building?.specialRoomKey],
                ['permit.permitId', permitIds, building?.permit?.permitId],
                ['soundtrack.cardId', soundtrackCards, building?.soundtrack?.cardId],
                ['heartSong.cardId', heartSongCards, building?.heartSong?.cardId],
            ]) {
                if (seen.has(value)) issue(errors, `${path}.${field}`, 'must be globally unique on its floor');
                seen.add(value);
            }
        }
        for (const sectionId of [1, 2, 3, 4]) {
            if (!seenSections.has(sectionId)) issue(errors, 'catalog.sections', `is missing required Section ${sectionId}`);
        }
    }
    containsForbiddenPlaceholder(catalog, 'catalog', errors);
    return { valid: errors.length === 0, errors, catalogHash: catalogHash(catalog) };
}

export class FloorCatalogValidationError extends Error {
    constructor(errors) {
        super(`Floor catalog rejected:\n${errors.map(error => `- ${error}`).join('\n')}`);
        this.name = 'FloorCatalogValidationError';
        this.errors = [...errors];
    }
}

export function assertFloorCatalog(catalog) {
    const report = validateFloorCatalog(catalog);
    if (!report.valid) throw new FloorCatalogValidationError(report.errors);
    return report;
}

/** [REF#DA-00029]
 * P2 must never accidentally become a live-map permission grant. P5 must
 * replace this catalog policy under its own explicit Mark runtime GO.
 */
export function requireLiveMountAuthorization(catalog, authorization = {}) {
    assertFloorCatalog(catalog);
    if (catalog.mountPolicy.productionMountAllowed !== true
        || authorization.phase !== 'P5'
        || authorization.explicitMarkRuntimeGo !== true) {
        throw new FloorCatalogValidationError([
            'catalog.mountPolicy: P2 catalog is not authorized to mount a live production floor',
        ]);
    }
    return true;
}

const FLOOR_1_CATALOG_RAW = {
    schemaVersion: FLOOR_CATALOG_SCHEMA_VERSION,
    catalogVersion: FLOOR_1_CATALOG_VERSION,
    floor: 1,
    mountPolicy: {
        p2CatalogOnly: true,
        productionMountAllowed: false,
        earliestLivePhase: 'P5',
    },
    globalRules: {
        goldAuthority: 'CABARET_TREASURY_ONLY',
        cabaretAmbientHungryGhostCap: 0,
        sectionSoundtrackCardsMustBeBehindOwnerGate: true,
    },
    heart: {
        sectionId: 0,
        quadrant: 'CENTER',
        buildingId: 'CABARET_HEART',
        displayName: 'Cabaret Heart',
        majorRoomKey: 'HEART_CABARET',
        specialRoomKey: 'HEART_CABARET',
        permit: {
            permitId: 'PERMIT_HEART_SINGING',
            cardId: 'CARD_PERMIT_HEART_SINGING',
            displayName: 'Heart Singing Permit',
            legacyAdapter: 'ROOM_PERMITS.CABARET / SINGING',
        },
        workerBenefit: {
            id: 'STARLETTE_HEART_INTERFACE',
            summary: 'Returns songs, records dungeon health, and allocates only the capacity that permitted rooms can use.',
        },
        jobSlots: [
            { id: 'stage_steward', label: 'Stage Steward', capacity: 1 },
            { id: 'treasury_keeper', label: 'Treasury Keeper', capacity: 1 },
            { id: 'floor_host', label: 'Floor Host', capacity: 1 },
        ],
        soundtrack: {
            identity: 'CABARET_HEART_HOUSE_SET',
            cardId: 'CARD_HEART_HOUSE_SET',
            cardAnchor: 'HEART_CABARET_STAGE',
            ownerSectionId: 0,
            behindOwningDoubleDoor: false,
            composerIntent: 'The house set begins at activation and remains Composer-owned.',
        },
        heartSong: {
            identity: 'HEART_ACTIVATION_BREATH_INTO_SONG',
            cardId: 'CARD_HEART_ACTIVATION_SONG',
            anchor: 'HEART_CABARET_STAGE',
        },
        anchors: {
            majorRoom: 'HEART_CABARET_CENTER',
            innerGate: 'HEART_HALL_FOUR_GATE_RING',
            soundtrackCard: 'HEART_CABARET_STAGE',
            heartSong: 'HEART_CABARET_STAGE',
            returnShortcut: 'HEART_IS_THE_RETURN_DESTINATION',
            outerBreach: 'HEART_HALL_RESPONSE_FRONT',
        },
        raid: {
            breachRole: 'TREASURY_TARGET',
            outerBreachAnchor: 'HEART_HALL_RESPONSE_FRONT',
            responsePromise: 'Raiders can threaten the treasury only after traversing a named outer-section route.',
        },
        roomDeck: [
            { key: 'HEART_ENTRY', label: 'Room 1 Entry', role: 'TEACH' },
            { key: 'HEART_HALL', label: 'Two-Tile Heart Hall', role: 'RELIEF' },
        ],
        encounterGrammar: {
            summary: 'A safe, legible hub with no ambient hungry-ghost population.',
            pressures: ['named raid arrival only'],
            reliefs: ['save/recovery alcove', 'Starlette stage'],
            prohibited: ['ambient hungry ghosts', 'loose section gold'],
        },
        playerPromise: 'Every recovered song has a visible home, a health consequence, and a living audience of workers.',
        readabilityNote: 'Room 1 and Room 2 labels remain display adapters over live roomId 0/1 compatibility.',
        saveMigrationImpact: 'Maps legacy CABARET/SINGING state into semantic HEART_CABARET without changing roomId ownership.',
    },
    sections: [
        {
            sectionId: 1,
            quadrant: 'SOUTH',
            buildingId: 'GUARDPOST_POLICE',
            displayName: 'Guardpost Police Station',
            majorRoomKey: 'SECTION_1_GUARDPOST',
            specialRoomKey: 'SECTION_1_GUARDPOST',
            permit: {
                permitId: 'PERMIT_GUARDPOST_DUTY',
                cardId: 'CARD_PERMIT_GUARDPOST_DUTY',
                displayName: 'Guardpost Duty Permit',
                legacyAdapter: 'ROOM_PERMITS.GUARD_POST / GUARD POST PERMIT',
            },
            workerBenefit: {
                id: 'INTERCEPTION_AND_PATROL',
                summary: 'Opens dispatch, patrol posts, and interceptor assignments for the south and east approaches.',
            },
            jobSlots: [
                { id: 'dispatch_guard', label: 'Dispatch Guard', capacity: 1 },
                { id: 'interceptor', label: 'Interceptor', capacity: 2 },
                { id: 'evidence_custodian', label: 'Evidence Custodian', capacity: 1 },
            ],
            soundtrack: {
                identity: 'SOUTH_NIGHT_WATCH_MARCH',
                cardId: 'CARD_S1_NIGHT_WATCH_MARCH',
                cardAnchor: 'S1_THRESHOLD_AFTER_SOUTH_GATE',
                ownerSectionId: 1,
                behindOwningDoubleDoor: true,
                composerIntent: 'A measured watch motif joins the Composer only after its south-gate card is claimed.',
            },
            heartSong: {
                identity: 'S1_WATCH_CALL',
                cardId: 'CARD_S1_HEART_SONG_WATCH_CALL',
                anchor: 'S1_WATCH_OFFICE_SANCTUM',
                heartValue: 20,
                returnHeal: 20,
                workerWakeValue: 1,
            },
            anchors: {
                majorRoom: 'SOUTHEAST_JUNCTION',
                innerGate: 'SOUTH_HEART_HALL_DOUBLE_DOOR',
                soundtrackCard: 'S1_THRESHOLD_AFTER_SOUTH_GATE',
                heartSong: 'S1_WATCH_OFFICE_SANCTUM',
                returnShortcut: 'S1_DISPATCH_RETURN',
                outerBreach: 'S1_SOUTHEAST_WALL_BREACH',
            },
            raid: {
                breachRole: 'SOUTHEAST_INTERCEPT_FRONT',
                outerBreachAnchor: 'S1_SOUTHEAST_WALL_BREACH',
                responsePromise: 'The Guardpost supplies the clearest early warning and interception line without bypassing Section 2.',
            },
            roomDeck: [
                { key: 'S1_ARMORY', label: 'Armory and Equipment Issue', role: 'TEACH' },
                { key: 'S1_READY_ROOM', label: 'Barracks Ready Room', role: 'CHOICE' },
                { key: 'S1_HOLDING_CELLS', label: 'Holding Cells', role: 'PRESSURE' },
                { key: 'S1_EVIDENCE_ROOM', label: 'Evidence and Recovered-Gold Room', role: 'RELIEF' },
                { key: 'S1_BOOKING', label: 'Interview and Booking', role: 'REWARD' },
                { key: 'S1_WATCH_OFFICE', label: 'Watch Office', role: 'SECRET' },
            ],
            roomBudget: {
                normalRoomMin: 5,
                normalRoomMax: 6,
                requiredRoles: ['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF'],
            },
            encounterGrammar: {
                summary: 'Sightlines, patrol routes, and custody pressure teach defense before the player owns defenders.',
                pressures: ['patrol crossfire', 'cell-block ambush'],
                reliefs: ['secured evidence room', 'dispatch clue'],
                prohibited: ['cross-section bypass', 'Cabaret ghost residency'],
            },
            playerPromise: 'Claim the dungeon’s eyes and learn which wall a raid will break before it reaches the Cabaret.',
            readabilityNote: 'A public desk and south-to-east watch line make the police-station purpose readable from the threshold.',
            saveMigrationImpact: 'Adapts legacy GUARD_POST permit state to SECTION_1_GUARDPOST; no current room is reclassified in P2.',
        },
        {
            sectionId: 2,
            quadrant: 'EAST',
            buildingId: 'FACTORY_FLOOR',
            displayName: 'Factory Floor',
            majorRoomKey: 'SECTION_2_FACTORY',
            specialRoomKey: 'SECTION_2_FACTORY',
            permit: {
                permitId: 'PERMIT_FACTORY_OPERATIONS',
                cardId: 'CARD_PERMIT_FACTORY_OPERATIONS',
                displayName: 'Factory Operations Permit',
                legacyAdapter: 'ROOM_PERMITS.FACTORY / FACTORY PERMIT',
            },
            workerBenefit: {
                id: 'DEFENSE_FABRICATION_AND_REPAIR',
                summary: 'Energizes the line to fabricate defenses and repair Heart damage between named raids.',
            },
            jobSlots: [
                { id: 'line_operator', label: 'Line Operator', capacity: 2 },
                { id: 'repair_tech', label: 'Repair Technician', capacity: 1 },
                { id: 'armorer', label: 'Armorer', capacity: 1 },
            ],
            soundtrack: {
                identity: 'EAST_IRON_CHORUS',
                cardId: 'CARD_S2_IRON_CHORUS',
                cardAnchor: 'S2_THRESHOLD_AFTER_EAST_GATE',
                ownerSectionId: 2,
                behindOwningDoubleDoor: true,
                composerIntent: 'A rhythmic industrial motif remains dormant until its east-gate card is claimed.',
            },
            heartSong: {
                identity: 'S2_FORGE_HEARTBEAT',
                cardId: 'CARD_S2_HEART_SONG_FORGE_HEARTBEAT',
                anchor: 'S2_QUALITY_CONTROL_SANCTUM',
                heartValue: 20,
                returnHeal: 20,
                workerWakeValue: 1,
            },
            anchors: {
                majorRoom: 'EAST',
                innerGate: 'EAST_HEART_HALL_DOUBLE_DOOR',
                soundtrackCard: 'S2_THRESHOLD_AFTER_EAST_GATE',
                heartSong: 'S2_QUALITY_CONTROL_SANCTUM',
                returnShortcut: 'S2_MAINTENANCE_RETURN',
                outerBreach: 'S2_EAST_LOADING_BREACH',
            },
            raid: {
                breachRole: 'EAST_LOADING_FRONT',
                outerBreachAnchor: 'S2_EAST_LOADING_BREACH',
                responsePromise: 'The loading breach makes fabricated defenses useful on a real, readable approach.',
            },
            roomDeck: [
                { key: 'S2_TOOL_CRIB', label: 'Tool Crib', role: 'TEACH' },
                { key: 'S2_PRESS_ROOM', label: 'Press Room', role: 'CHOICE' },
                { key: 'S2_FURNACE_ROOM', label: 'Furnace Room', role: 'PRESSURE' },
                { key: 'S2_MATERIAL_STORE', label: 'Material Store', role: 'RELIEF' },
                { key: 'S2_MAINTENANCE_BAY', label: 'Maintenance Bay', role: 'REWARD' },
                { key: 'S2_QUALITY_CONTROL', label: 'Blueprint and Quality Control', role: 'SECRET' },
            ],
            roomBudget: {
                normalRoomMin: 5,
                normalRoomMax: 6,
                requiredRoles: ['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF'],
            },
            encounterGrammar: {
                summary: 'Moving machinery, heat, and repair routes create a high-pressure industrial reclaim loop.',
                pressures: ['furnace timing', 'press-line crossfire'],
                reliefs: ['material-store cover', 'maintenance shortcut'],
                prohibited: ['unbounded prop timers', 'Cabaret ghost residency'],
            },
            playerPromise: 'Turn a dead production line into the place that keeps the Heart standing after the next raid.',
            readabilityNote: 'The east threshold exposes a machine silhouette and warm/cool material contrast before the full floor is revealed.',
            saveMigrationImpact: 'Adapts legacy FACTORY permit state to SECTION_2_FACTORY; P2 does not energize or redraw a live machine.',
        },
        {
            sectionId: 3,
            quadrant: 'NORTH',
            buildingId: 'SLEEPING_WARD',
            displayName: 'The Sleeping Ward',
            majorRoomKey: 'SECTION_3_SLEEPING_WARD',
            specialRoomKey: 'SECTION_3_SLEEPING_WARD',
            permit: {
                permitId: 'PERMIT_SLEEPING_WARD',
                cardId: 'CARD_PERMIT_SLEEPING_WARD',
                displayName: 'Sleeping Ward Permit',
                legacyAdapter: 'NEW_SEMANTIC_ROOM — no legacy room or permit is substituted',
            },
            workerBenefit: {
                id: 'ELIGIBLE_SLEEPER_ROSTER',
                summary: 'Opens the ward roster and bounded wake-attendant jobs so returned-song capacity can wake actual condemned workers.',
            },
            jobSlots: [
                { id: 'wake_attendant', label: 'Wake Attendant', capacity: 1 },
                { id: 'roster_keeper', label: 'Roster Keeper', capacity: 1 },
                { id: 'dream_watch', label: 'Dream Watch', capacity: 1 },
            ],
            soundtrack: {
                identity: 'NORTH_LULLABY_OF_THE_UNWAKING',
                cardId: 'CARD_S3_LULLABY_OF_THE_UNWAKING',
                cardAnchor: 'S3_THRESHOLD_AFTER_NORTH_GATE',
                ownerSectionId: 3,
                behindOwningDoubleDoor: true,
                composerIntent: 'A fragile lullaby becomes part of the Composer only after the player crosses the north gate and claims its card.',
            },
            heartSong: {
                identity: 'S3_DREAMS_AWAKE',
                cardId: 'CARD_S3_HEART_SONG_DREAMS_AWAKE',
                anchor: 'S3_DREAM_ARCHIVE_SANCTUM',
                heartValue: 20,
                returnHeal: 20,
                workerWakeValue: 1,
            },
            anchors: {
                majorRoom: 'NORTH',
                innerGate: 'NORTH_HEART_HALL_DOUBLE_DOOR',
                soundtrackCard: 'S3_THRESHOLD_AFTER_NORTH_GATE',
                heartSong: 'S3_DREAM_ARCHIVE_SANCTUM',
                returnShortcut: 'S3_WARDEN_RETURN',
                outerBreach: 'S3_NORTH_LINEN_SERVICE_BREACH',
            },
            raid: {
                breachRole: 'NORTH_SERVICE_EVACUATION_FRONT',
                outerBreachAnchor: 'S3_NORTH_LINEN_SERVICE_BREACH',
                responsePromise: 'The north service breach threatens the workers the player has chosen to wake, but never deletes wake capacity off-screen.',
            },
            roomDeck: [
                { key: 'S3_WAKE_FOYER', label: 'Wake Foyer', role: 'TEACH' },
                { key: 'S3_LOCKER_GALLERY', label: 'Locker Gallery', role: 'CHOICE' },
                { key: 'S3_LINEN_SERVICE', label: 'Linen Service Passage', role: 'PRESSURE' },
                { key: 'S3_NURSE_STATION', label: 'Night Nurse Station', role: 'RELIEF' },
                { key: 'S3_WATCH_BUNKS', label: 'Watch Bunks', role: 'REWARD' },
                { key: 'S3_DREAM_ARCHIVE', label: 'Dream Archive', role: 'SECRET' },
            ],
            roomBudget: {
                normalRoomMin: 5,
                normalRoomMax: 6,
                requiredRoles: ['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF'],
            },
            encounterGrammar: {
                summary: 'A quiet, human-scale route through sleeping workers turns songs from collectible music into a responsibility the player can see.',
                pressures: ['dreamer hallucination route', 'linen-service breach pressure'],
                reliefs: ['night-nurse refuge', 'roster clue'],
                prohibited: ['ambient hungry ghosts in bunks', 'unearned worker wake without song capacity'],
            },
            playerPromise: 'Walk among the people Starlette can save, then bring back a song that lets one more of them stand up.',
            readabilityNote: 'Warm bedside lamps, roster boards, and a north-facing quiet threshold distinguish the Ward from a barracks or cafeteria.',
            saveMigrationImpact: 'Creates Section 3 semantic records only; no legacy Laboratory, Citadel, or random substitute is imported.',
        },
        {
            sectionId: 4,
            quadrant: 'WEST',
            buildingId: 'LONG_CAFETERIA',
            displayName: 'Long Cafeteria & Great Kitchen',
            majorRoomKey: 'SECTION_4_CAFETERIA',
            specialRoomKey: 'SECTION_4_CAFETERIA',
            permit: {
                permitId: 'PERMIT_CAFETERIA_SERVICE',
                cardId: 'CARD_PERMIT_CAFETERIA_SERVICE',
                displayName: 'Cafeteria Service Permit',
                legacyAdapter: 'NEW_SEMANTIC_ROOM — KITCHEN remains a separate legacy room until P5 adapter review',
            },
            workerBenefit: {
                id: 'WORKER_RECOVERY_AND_SHIFT_SUSTAIN',
                summary: 'Opens the service line, kitchen, and recovery shifts that keep permitted defenders working longer.',
            },
            jobSlots: [
                { id: 'service_lead', label: 'Service Lead', capacity: 1 },
                { id: 'kitchen_worker', label: 'Kitchen Worker', capacity: 2 },
                { id: 'recovery_attendant', label: 'Recovery Attendant', capacity: 1 },
            ],
            soundtrack: {
                identity: 'WEST_LAST_SERVICE_WALTZ',
                cardId: 'CARD_S4_LAST_SERVICE_WALTZ',
                cardAnchor: 'S4_THRESHOLD_AFTER_WEST_GATE',
                ownerSectionId: 4,
                behindOwningDoubleDoor: true,
                composerIntent: 'A service-hall waltz remains on the west side of the double doors until its card is earned.',
            },
            heartSong: {
                identity: 'S4_TABLES_SET_FOR_THE_LIVING',
                cardId: 'CARD_S4_HEART_SONG_TABLES_SET',
                anchor: 'S4_SONG_PANTRY_SANCTUM',
                heartValue: 20,
                returnHeal: 20,
                workerWakeValue: 1,
            },
            anchors: {
                majorRoom: 'WEST_CABARET_EXIT',
                innerGate: 'WEST_HEART_HALL_DOUBLE_DOOR',
                soundtrackCard: 'S4_THRESHOLD_AFTER_WEST_GATE',
                heartSong: 'S4_SONG_PANTRY_SANCTUM',
                returnShortcut: 'S4_SERVICE_RETURN',
                outerBreach: 'S4_WEST_RECEIVING_BREACH',
            },
            raid: {
                breachRole: 'WEST_RECEIVING_FRONT',
                outerBreachAnchor: 'S4_WEST_RECEIVING_BREACH',
                responsePromise: 'The receiving breach turns the long service line into a defendable, readable western approach.',
            },
            roomDeck: [
                { key: 'S4_GREAT_KITCHEN', label: 'Great Kitchen and Hot Line', role: 'TEACH' },
                { key: 'S4_PANTRY', label: 'Pantry and Cold Store', role: 'CHOICE' },
                { key: 'S4_SCULLERY', label: 'Scullery and Wash Room', role: 'PRESSURE' },
                { key: 'S4_RECEIVING', label: 'Receiving and Dry-Goods Room', role: 'RELIEF' },
                { key: 'S4_STAFF_REST', label: 'Staff Rest Room', role: 'REWARD' },
                { key: 'S4_SONG_PANTRY', label: 'Song Pantry and Dining Shrine', role: 'SECRET' },
            ],
            roomBudget: {
                normalRoomMin: 5,
                normalRoomMax: 6,
                requiredRoles: ['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF'],
            },
            encounterGrammar: {
                summary: 'The visible customer-line geometry becomes a navigation lesson, then a western defense lane after activation.',
                pressures: ['hot-line timing', 'receiving breach'],
                reliefs: ['staff rest room', 'pantry cover'],
                prohibited: ['queue-blocking worker loops', 'shortcut that bypasses the west double doors'],
            },
            playerPromise: 'Follow the obvious west dining route into a grand service hall that makes the dungeon feel worth saving.',
            readabilityNote: 'A long counter, two-tile customer lane, and aligned Cabaret dining exit make the westward purpose readable before entry.',
            saveMigrationImpact: 'Creates SECTION_4_CAFETERIA semantics; legacy KITCHEN is not silently renamed or activated in P2.',
        },
    ],
};

export const FLOOR_1_CATALOG = deepFreeze(FLOOR_1_CATALOG_RAW);
export const FLOOR_CATALOGS = deepFreeze({ 1: FLOOR_1_CATALOG });

export function floorCatalogFor(floor) {
    return FLOOR_CATALOGS[Number(floor)] || null;
}

// Fail at import time in development/harnesses instead of letting P3 discover a bad authored packet. [REF#DA-00030]
assertFloorCatalog(FLOOR_1_CATALOG);
