/* [REF#CR-00100]
 * RunLedger.mjs — P1 durable run authority.
 *
 * The ledger deliberately stores semantic JSON snapshots, never Three.js roots,
 * audio nodes, timers, RAF handles, or renderer state. It is pure storage logic
 * so the engine can use it only at boot, explicit save/load, and floor transit.
 */

export const RUN_LEDGER_SCHEMA = 1;
export const RUN_LEDGER_BANK_A = 'origami.v8.run.ledger.a';
export const RUN_LEDGER_BANK_B = 'origami.v8.run.ledger.b';
export const RUN_LEDGER_SESSION_ID = 'origami.v8.run.id';
export const RUN_LEDGER_SESSION_SEED = 'origami.v8.seed';
export const RUN_LEDGER_SESSION_NEW_RUN = 'origami.v8.run.new';

const BANK_KEYS = [RUN_LEDGER_BANK_A, RUN_LEDGER_BANK_B];
const MAX_FLOOR_ID = 9999;
const MAX_SECTION_ID = 4;

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedInt(value, fallback = null, min = 1, max = MAX_FLOOR_ID) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function canonicalize(value, seen = new WeakSet()) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'object') return null;
    if (seen.has(value)) throw new TypeError('Run ledger values must not be cyclic');
    seen.add(value);
    if (Array.isArray(value)) {
        const out = value.map(item => canonicalize(item, seen));
        seen.delete(value);
        return out;
    }
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key], seen);
    seen.delete(value);
    return out;
}

export function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
}

export function cloneJson(value) {
    return JSON.parse(stableStringify(value));
}

export function checksum(value) {
    const text = typeof value === 'string' ? value : stableStringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function mintRootSeed() {
    try {
        if (globalThis.crypto?.getRandomValues) {
            const values = new Uint32Array(1);
            globalThis.crypto.getRandomValues(values);
            return String(values[0] || 1);
        }
    } catch (_) {}
    return String(((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1);
}

function mintRunId(rootSeed, now) {
    let entropy = '';
    try {
        if (globalThis.crypto?.getRandomValues) {
            const values = new Uint32Array(2);
            globalThis.crypto.getRandomValues(values);
            entropy = Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
        }
    } catch (_) {}
    if (!entropy) entropy = `${Math.floor(Math.random() * 0xffffffff).toString(16)}${Date.now().toString(16)}`;
    return `run-${String(rootSeed)}-${Number(now).toString(36)}-${entropy}`;
}

function normalizeSeed(value) {
    if (value == null || value === '') return null;
    const raw = String(value).trim();
    return /^\d{1,20}$/.test(raw) ? raw : null;
}

function makeState({ rootSeed, now, runId }) {
    const seed = normalizeSeed(rootSeed) || mintRootSeed();
    return {
        schema: RUN_LEDGER_SCHEMA,
        runId: runId || mintRunId(seed, now),
        rootSeed: seed,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        activeFloor: 1,
        player: {},
        progress: {
            permits: {},
            songs: {},
            starlette: { dungeonHealth: null, maxDungeonHealth: null, wakeCapacity: 0 },
            workers: {},
            raids: {},
        },
        floors: {},
    };
}

function makeEnvelope(state) {
    const normalized = canonicalize(state);
    return {
        schema: RUN_LEDGER_SCHEMA,
        revision: Number(normalized.revision) || 0,
        checksum: checksum(normalized),
        state: normalized,
    };
}

export function validateRunSnapshot(snapshot) {
    if (!isObject(snapshot)) return { ok: false, code: 'snapshot-not-object' };
    if (snapshot.schema !== RUN_LEDGER_SCHEMA) return { ok: false, code: 'snapshot-schema' };
    if (!isObject(snapshot.state)) return { ok: false, code: 'snapshot-state' };
    let state;
    try { state = canonicalize(snapshot.state); }
    catch (error) { return { ok: false, code: 'snapshot-cyclic', error }; }
    if (state.schema !== RUN_LEDGER_SCHEMA) return { ok: false, code: 'state-schema' };
    if (typeof state.runId !== 'string' || !state.runId) return { ok: false, code: 'state-run-id' };
    if (!normalizeSeed(state.rootSeed)) return { ok: false, code: 'state-root-seed' };
    if (!isObject(state.floors) || !isObject(state.progress)) return { ok: false, code: 'state-shape' };
    const revision = Number(state.revision);
    if (!Number.isInteger(revision) || revision < 0) return { ok: false, code: 'state-revision' };
    if (snapshot.revision !== revision) return { ok: false, code: 'snapshot-revision' };
    if (snapshot.checksum !== checksum(state)) return { ok: false, code: 'snapshot-checksum' };
    return { ok: true, state };
}

function stripRunSnapshot(payload) {
    const copy = cloneJson(payload || {});
    if (isObject(copy)) delete copy.runLedger;
    return copy;
}

function durablePlayer(snapshot) {
    const player = isObject(snapshot?.player) ? cloneJson(snapshot.player) : {};
    delete player.px;
    delete player.pz;
    delete player.rot;
    return player;
}

// SAVE PARTS across the stairs (2026-09-27, the save rebuild — knowledge/design/SAVE_GAME_2026-09-27.md; full system audit — knowledge/design/SAVE_RESTORE_SYSTEM_2026-10-09.md). A part the engine [REF#CR-00166]
// registered with scope 'run' (source.partScopes) follows the player from the floor being left; every other part stays with
// its own floor's record, so a revisit gets that floor back as it was left (Mark 2026-09-27: songs and the pet "stay with
// each floor").
function carryRunParts(prior, source) {
    const out = isObject(prior?.parts) ? cloneJson(prior.parts) : {};
    const scopes = isObject(source?.partScopes) ? source.partScopes : {};
    const src = isObject(source?.parts) ? source.parts : {};
    for (const key of Object.keys(src)) if (scopes[key] === 'run') out[key] = cloneJson(src[key]);
    return out;
}

function emptySegments() {
    return { active: 0, sealed: [], states: [], stores: {}, broken: [], sectionCleared: [], exitUnlocked: false };
}

export class RunLedger {
    constructor({ localStorage, sessionStorage, now = () => Date.now(), report = () => {} } = {}) {
        this.localStorage = localStorage || null;
        this.sessionStorage = sessionStorage || null;
        this.now = now;
        this.report = report;
        this.state = null;
        this.storageHealthy = !!this.localStorage;
    }

    _report(code, error, detail = {}) {
        try { this.report({ code, error: error ? String(error?.message || error) : '', ...detail }); } catch (_) {}
    }

    _readKey(key) {
        try { return this.localStorage ? this.localStorage.getItem(key) : null; }
        catch (error) { this.storageHealthy = false; this._report('storage-read', error, { key }); return null; }
    }

    _writeKey(key, value) {
        try {
            if (!this.localStorage) throw new Error('localStorage unavailable');
            this.localStorage.setItem(key, value);
            return true;
        } catch (error) {
            this.storageHealthy = false;
            this._report('storage-write', error, { key });
            return false;
        }
    }

    _readBanks() {
        const valid = [];
        for (const key of BANK_KEYS) {
            const raw = this._readKey(key);
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                const checked = validateRunSnapshot(parsed);
                if (checked.ok) valid.push({ key, envelope: parsed, state: checked.state });
                else this._report('bank-corrupt', null, { key, reason: checked.code });
            } catch (error) {
                this._report('bank-malformed', error, { key });
            }
        }
        return valid.sort((a, b) => b.state.revision - a.state.revision);
    }

    _bindSession() {
        if (!this.state || !this.sessionStorage) return;
        try {
            this.sessionStorage.setItem(RUN_LEDGER_SESSION_ID, this.state.runId);
            this.sessionStorage.setItem(RUN_LEDGER_SESSION_SEED, this.state.rootSeed);
        } catch (error) {
            this._report('session-write', error, { key: RUN_LEDGER_SESSION_ID });
        }
    }

    bootstrap({ rootSeed, pendingSnapshot = null, forceNew = false } = {}) {
        const wantedSeed = normalizeSeed(rootSeed) || mintRootSeed();
        const banks = this._readBanks();
        const pending = pendingSnapshot ? validateRunSnapshot(pendingSnapshot) : null;
        let status = 'new';

        if (pendingSnapshot && !pending.ok) this._report('pending-corrupt', null, { reason: pending.code });
        if (forceNew) {
            // A deliberate New Game is a new run even if a 32-bit map-root [REF#CR-00101]
            // collision happens to match an older bank. Never revive it.
            this.state = makeState({ rootSeed: wantedSeed, now: this.now() });
            const maxRevision = banks.reduce((max, bank) => Math.max(max, Number(bank.state.revision) || 0), 0);
            this.state.revision = maxRevision;
            this._persist('bootstrap-new');
        } else if (pending?.ok) {
            this.state = cloneJson(pending.state);
            status = 'pending-restore';
            this._persist('bootstrap-pending', { allowReplace: true });
        } else {
            const matching = banks.find(bank => bank.state.rootSeed === wantedSeed);
            if (matching) {
                this.state = cloneJson(matching.state);
                status = 'resume';
            } else {
                this.state = makeState({ rootSeed: wantedSeed, now: this.now() });
                const maxRevision = banks.reduce((max, bank) => Math.max(max, Number(bank.state.revision) || 0), 0);
                this.state.revision = maxRevision;
                this._persist('bootstrap-new');
            }
        }

        this._bindSession();
        return { status, runId: this.state.runId, rootSeed: this.state.rootSeed, revision: this.state.revision };
    }

    _ensureFloorRecord(floor) {
        const id = boundedInt(floor);
        if (!id) throw new RangeError(`Invalid floor id: ${floor}`);
        const key = String(id);
        if (!isObject(this.state.floors[key])) {
            this.state.floors[key] = {
                id,
                revision: 0,
                recipe: { rootSeed: this.state.rootSeed, generatorVersion: null, manifestHash: null },
                sections: {},
                semantic: {},
                snapshot: null,
                updatedAt: this.now(),
            };
        }
        return this.state.floors[key];
    }

    ensureFloor(floor, { persist = false } = {}) {
        const record = this._ensureFloorRecord(floor);
        this.state.activeFloor = record.id;
        if (persist) this._persist('ensure-floor');
        return cloneJson(record);
    }

    checkpointFloor({ floor, snapshot, reason = 'checkpoint', semantic = null, allowReplace = false } = {}) {
        if (!this.state) return { ok: false, code: 'not-bootstrapped' };
        const id = boundedInt(floor);
        if (!id || !isObject(snapshot)) return { ok: false, code: 'invalid-floor-snapshot' };
        let clean;
        try { clean = stripRunSnapshot(snapshot); }
        catch (error) { this._report('snapshot-serialize', error, { reason }); return { ok: false, code: 'snapshot-serialize' }; }
        const record = this._ensureFloorRecord(id);
        record.revision = (Number(record.revision) || 0) + 1;
        record.recipe = {
            rootSeed: this.state.rootSeed,
            generatorVersion: typeof clean.generatorVersion === 'string' ? clean.generatorVersion : record.recipe.generatorVersion,
            manifestHash: typeof clean.manifestHash === 'string' ? clean.manifestHash : (record.recipe.manifestHash || null),
        };
        record.snapshot = clean;
        if (isObject(semantic)) record.semantic = Object.assign({}, record.semantic || {}, cloneJson(semantic));
        record.updatedAt = this.now();
        this.state.activeFloor = id;
        this.state.player = durablePlayer(clean);
        this.state.updatedAt = this.now();
        const written = this._persist(reason, { allowReplace });
        return written.ok ? { ok: true, snapshot: this.exportSnapshot(), revision: this.state.revision } : written;
    }

    checkpointSection({ floor, section, recipe = null, delta = null, reason = 'section-checkpoint' } = {}) {
        if (!this.state) return { ok: false, code: 'not-bootstrapped' };
        const id = boundedInt(floor);
        const sectionId = boundedInt(section, null, 0, MAX_SECTION_ID);
        if (!id || sectionId == null) return { ok: false, code: 'invalid-section' };
        const record = this._ensureFloorRecord(id);
        const key = String(sectionId);
        const previous = isObject(record.sections[key]) ? record.sections[key] : { revision: 0 };
        record.sections[key] = {
            revision: (Number(previous.revision) || 0) + 1,
            recipe: recipe == null ? (previous.recipe || null) : cloneJson(recipe),
            delta: delta == null ? (previous.delta || {}) : cloneJson(delta),
            updatedAt: this.now(),
        };
        return this._persist(reason);
    }

    restoreNamedSlot(slot) {
        if (!isObject(slot)) return { ok: false, code: 'slot-invalid' };
        if (slot.runLedger) {
            const restored = this.restoreSnapshot(slot.runLedger, { reason: 'named-load' });
            if (restored.ok) return { ...restored, migrated: false };
            this._report('named-ledger-invalid', null, { reason: restored.code || 'unknown' });
        }
        const seed = normalizeSeed(slot.gameSeed) || mintRootSeed();
        this.state = makeState({ rootSeed: seed, now: this.now() });
        const migrated = this.checkpointFloor({ floor: slot.floor || 1, snapshot: slot, reason: 'legacy-slot-migration', allowReplace: true });
        if (!migrated.ok) return migrated;
        this._bindSession();
        return { ok: true, migrated: true, snapshot: this.exportSnapshot() };
    }

    restoreSnapshot(snapshot, { reason = 'restore' } = {}) {
        const checked = validateRunSnapshot(snapshot);
        if (!checked.ok) return { ok: false, code: checked.code };
        this.state = cloneJson(checked.state);
        this._bindSession();
        const persisted = this._persist(reason, { allowReplace: true });
        return persisted.ok ? { ok: true, snapshot: this.exportSnapshot() } : persisted;
    }

    // A floor record that must start EMPTY — a realm of the Invading Realms is a new dungeon every trip, so an earlier trip's [REF#CR-00173]
    // snapshot (its dead monsters, its opened doors) must never be laid over the next one (2026-10-01). Returns whether one existed.
    resetFloor(floor) {
        if (!this.state) return false;
        const id = boundedInt(floor);
        if (!id || !isObject(this.state.floors[String(id)])) return false;
        delete this.state.floors[String(id)];
        this._persist('reset-floor');
        return true;
    }

    makeTransition({ fromFloor, toFloor, direction, sourceSnapshot } = {}) {
        if (!this.state) return null;
        const from = boundedInt(fromFloor);
        const to = boundedInt(toFloor);
        if (!from || !to || !isObject(sourceSnapshot)) return null;
        let source;
        try { source = stripRunSnapshot(sourceSnapshot); }
        catch (error) { this._report('transition-serialize', error); return null; }
        const destination = this._ensureFloorRecord(to);
        const prior = isObject(destination.snapshot) ? cloneJson(destination.snapshot) : {};
        const player = Object.assign({}, durablePlayer(prior), durablePlayer(source));
        const transit = Object.assign({}, prior, {
            version: Math.max(Number(prior.version) || 0, Number(source.version) || 2),
            generatorVersion: prior.generatorVersion || source.generatorVersion || null,
            floor: to,
            gameSeed: this.state.rootSeed,
            karma: typeof source.karma === 'number' ? source.karma : (typeof prior.karma === 'number' ? prior.karma : 0),
            player,
            inventory: cloneJson(source.inventory || prior.inventory || {}),
            equipment: cloneJson(source.equipment || prior.equipment || {}),
            ownedKatana: typeof source.ownedKatana === 'boolean' ? source.ownedKatana : !!prior.ownedKatana,
            ownedShield: typeof source.ownedShield === 'boolean' ? source.ownedShield : !!prior.ownedShield,
            magicLanternOn: typeof source.magicLanternOn === 'boolean' ? source.magicLanternOn : !!prior.magicLanternOn,
            monsters: Array.isArray(prior.monsters) ? prior.monsters : [],
            segments: isObject(prior.segments) ? prior.segments : emptySegments(),
            parts: carryRunParts(prior, source),
            partScopes: Object.assign({}, isObject(prior.partScopes) ? prior.partScopes : {}, isObject(source.partScopes) ? source.partScopes : {}),
            transition: { fromFloor: from, toFloor: to, direction: direction || 'descend', runId: this.state.runId },
            runLedger: this.exportSnapshot(),
        });
        delete transit.player.px;
        delete transit.player.pz;
        delete transit.player.rot;
        return cloneJson(transit);
    }

    makeResumePayload(floor) {
        if (!this.state) return null;
        const id = boundedInt(floor);
        const record = id ? this.state.floors[String(id)] : null;
        if (!record || !isObject(record.snapshot)) return null;
        const payload = cloneJson(record.snapshot);
        payload.floor = id;
        payload.gameSeed = this.state.rootSeed;
        payload.runLedger = this.exportSnapshot();
        payload.runId = this.state.runId;
        return payload;
    }

    _persist(reason = 'checkpoint', { allowReplace = false } = {}) {
        if (!this.state) return { ok: false, code: 'not-bootstrapped' };
        const banks = this._readBanks();
        const sameRun = banks.filter(bank => bank.state.runId === this.state.runId);
        const latestSameRun = sameRun[0];
        if (!allowReplace && latestSameRun && latestSameRun.state.revision > this.state.revision) {
            this._report('stale-tab', null, {
                reason,
                currentRevision: this.state.revision,
                storageRevision: latestSameRun.state.revision,
            });
            return { ok: false, code: 'stale-tab' };
        }
        const maxRevision = banks.reduce((max, bank) => Math.max(max, Number(bank.state.revision) || 0), 0);
        this.state.revision = Math.max(Number(this.state.revision) || 0, maxRevision) + 1;
        this.state.updatedAt = this.now();
        let envelope;
        try { envelope = makeEnvelope(this.state); }
        catch (error) { this._report('ledger-serialize', error, { reason }); return { ok: false, code: 'ledger-serialize' }; }
        const key = envelope.revision % 2 === 0 ? RUN_LEDGER_BANK_A : RUN_LEDGER_BANK_B;
        if (!this._writeKey(key, JSON.stringify(envelope))) return { ok: false, code: 'storage-write' };
        const raw = this._readKey(key);
        try {
            const checked = validateRunSnapshot(JSON.parse(raw || 'null'));
            if (!checked.ok || checked.state.revision !== this.state.revision) {
                this._report('ledger-verify', null, { key, reason: checked.code || 'revision' });
                return { ok: false, code: 'ledger-verify' };
            }
        } catch (error) {
            this._report('ledger-verify', error, { key });
            return { ok: false, code: 'ledger-verify' };
        }
        this.storageHealthy = true;
        this._bindSession();
        return { ok: true, snapshot: cloneJson(envelope), key, revision: this.state.revision };
    }

    exportSnapshot() {
        return this.state ? cloneJson(makeEnvelope(this.state)) : null;
    }

    diagnostics() {
        return {
            schema: RUN_LEDGER_SCHEMA,
            runId: this.state?.runId || null,
            rootSeed: this.state?.rootSeed || null,
            revision: this.state?.revision ?? null,
            activeFloor: this.state?.activeFloor ?? null,
            floors: this.state ? Object.keys(this.state.floors || {}).map(Number).sort((a, b) => a - b) : [],
            storageHealthy: this.storageHealthy,
        };
    }
}
