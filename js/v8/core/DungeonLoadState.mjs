const PHASES = Object.freeze([
    ['resolve', 5],
    ['layout', 25],
    ['validate', 10],
    ['entities', 15],
    ['build', 35],
    ['checkpoint', 9],
    ['firstFrame', 1],
]);

const MODES = new Set([
    'new-game',
    'new-floor',
    'load-save',
    'floor-return',
    'portal-new',
    'portal-load',
    'portal-return',
]);

const PHASE_NAMES = new Set(PHASES.map(([phase]) => phase));

function requireText(value, field) {
    if (typeof value !== 'string' || value.trim() === '')
        throw new TypeError(`${field} must be a non-empty string`);
    return value;
}

function phaseRecord() {
    return Object.fromEntries(PHASES.map(([phase]) => [phase, {
        completed: 0,
        total: null,
    }]));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function validCount(value) {
    return Number.isFinite(value) && value >= 0;
}

function rejection(code) {
    return { accepted: false, code };
}

export function createDungeonLoadState({ loadId, runId, worldId, mode } = {}) {
    requireText(loadId, 'loadId');
    requireText(runId, 'runId');
    requireText(worldId, 'worldId');
    requireText(mode, 'mode');
    if (!MODES.has(mode)) throw new TypeError(`unsupported mode: ${mode}`);

    let state = 'loading';
    let progress = 0;
    let failure = null;
    const work = phaseRecord();

    function hasCompleted(phase) {
        const record = work[phase];
        return record && record.total !== null && record.completed >= record.total;
    }

    function allExceptFirstFrameComplete() {
        return PHASES.every(([phase]) => phase === 'firstFrame' || hasCompleted(phase));
    }

    function calculateProgress() {
        let weighted = 0;
        for (const [phase, weight] of PHASES) {
            const record = work[phase];
            if (record.total !== null && record.total > 0)
                weighted += weight * Math.min(1, record.completed / record.total);
        }
        return state === 'ready' ? 100 : Math.min(99, Math.floor(weighted));
    }

    function rejectIfTerminal() {
        return state === 'failed' ? rejection('terminal-state') : null;
    }

    function reportPhase({ loadId: reportLoadId, phase, completed, total } = {}) {
        if (reportLoadId !== loadId) return rejection('stale-load');
        const terminal = rejectIfTerminal();
        if (terminal) return terminal;
        if (!PHASE_NAMES.has(phase) || !validCount(completed) || !validCount(total) || total <= 0 || completed > total)
            return rejection('invalid-report');
        if (phase === 'firstFrame' && completed > 0 && !allExceptFirstFrameComplete())
            return rejection('premature-frame');

        const record = work[phase];
        if (record.total !== null && record.total !== total)
            return rejection('inconsistent-total');
        if (completed < record.completed)
            return rejection('non-monotonic-work');

        record.total = total;
        record.completed = completed;
        progress = Math.max(progress, calculateProgress());
        if (allExceptFirstFrameComplete() && hasCompleted('firstFrame')) {
            state = 'ready';
            progress = 100;
        }
        return { accepted: true };
    }

    function fail({ loadId: reportLoadId, phase, code, message } = {}) {
        if (reportLoadId !== loadId) return rejection('stale-load');
        if (state === 'ready') return rejection('terminal-state');
        const terminal = rejectIfTerminal();
        if (terminal) return terminal;
        if (!PHASE_NAMES.has(phase) || typeof code !== 'string' || code.trim() === '')
            return rejection('invalid-failure');
        state = 'failed';
        failure = {
            phase,
            code,
            message: typeof message === 'string' ? message : '',
        };
        return { accepted: true };
    }

    return Object.freeze({
        reportPhase,
        fail,
        isReady: () => state === 'ready',
        snapshot: () => clone({
            loadId,
            runId,
            worldId,
            mode,
            state,
            progress,
            work,
            missingPhases: PHASES.filter(([phase]) => !hasCompleted(phase)).map(([phase]) => phase),
            failure,
        }),
    });
}

export function createDungeonLoadReporter({ post, ...identity }) {
    if (typeof post !== 'function') throw new TypeError('post must be a function');
    const state = createDungeonLoadState(identity);
    let readySignals = 0;
    let detail = { phase: 'resolve', text: '', key: '', params: undefined };

    function publish() {
        post({ ...detail, ...state.snapshot(), type: 'ENGINE_LOAD_PROGRESS' });
    }

    function fail(phase, code, error) {
        const result = state.fail({ loadId: identity.loadId, phase, code, message: String(error || code) });
        if (result.accepted) {
            post({ type: 'ENGINE_ANOMALY', kind: 'DUNGEON_LOAD', ...identity,
                phase, code, error: String(error || code), count: 1 });
            publish();
        }
        return result;
    }

    function report(phase, completed, total, info = {}) {
        const result = state.reportPhase({ loadId: identity.loadId, phase, completed, total });
        if (!result.accepted) {
            if (result.code !== 'terminal-state') fail(PHASE_NAMES.has(phase) ? phase : 'resolve', result.code, 'Rejected load phase report');
            return result;
        }
        detail = { ...detail, ...info, phase };
        if (!state.isReady()) publish();
        return result;
    }

    return Object.freeze({
        report,
        fail,
        isReady: state.isReady,
        snapshot: () => ({ ...state.snapshot(), readySignals }),
        announce(info) {
            if (state.snapshot().state !== 'loading') return;
            detail = { ...detail, ...info };
            publish();
        },
        publishReady(why) {
            if (!state.isReady() || readySignals) return false;
            readySignals++;
            detail = { phase: 'firstFrame', key: 'load.download_complete', text: '100% download complete!' };
            publish();
            post({ ...state.snapshot(), type: 'ENGINE_WORLD_READY', why });
            return true;
        },
    });
}
