#!/usr/bin/env node
/**
 * PROBE — MonsterAI v2 Cabaret lifecycle + combat priority rail.
 *
 * Boots the game headless and proves the window._AI_V2 flag mechanics end-to-end:
 *   A. boot the real game/module graph, then instantiate a deterministic
 *      Cabaret agent with every peaceful/show hook available.
 *   B. combat must remain the sole advertised behavior, the FSM must stay
 *      HOSTILE, and no HOSTILE -> SCRIPTED warning may fire.
 *   C. exercise the served engine-adapter module and prove a successful
 *      two-axis move reports a non-zero pre-write delta.
 * Fails on any uncaught page error, like smoke.js.
 *
 * Run: node scripts/probe-ai-v2.js
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const READY_TIMEOUT_MS = 60000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ogg':  'audio/ogg',
    '.mp3':  'audio/mpeg',
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
};

function startServer() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const full = path.join(ROOT, urlPath === '/' ? '/OrigamiUnderworld.html' : urlPath);
            if (!full.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
            fs.readFile(full, (err, data) => {
                if (err) { res.statusCode = 404; return res.end(err.code); }
                const ext = path.extname(full).toLowerCase();
                res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(data);
            });
        });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

// Snapshot of the audience + constructor state, evaluated INSIDE the engine iframe.
const SNAPSHOT = () => {
    const out = { agents: -1, audience: [], succubus: null, fps: window._smoothedFps ?? null };   // _smoothedFps = engine telemetry mirror (2026-07-16); the old __smoothedFps never existed on any window — this read was null for the probe's whole life
    const ai = window._monsterAI;
    if (ai && ai.agents) {
        out.agents = ai.agents.size;
        for (const [ref, agent] of ai.agents) {
            out.audience.push({ id: ref.userData?.id, state: agent.fsm?.state, owned: !!ref.userData?._aiOwned });
        }
    }
    const mws = window.monsterWrappers || [];
    for (const w of mws) {
        const ud = w.userData || {};
        if (!ud.cabAudience) continue;
        const mb = ud.monBase || w;
        const rec = { id: ud.id, owned: !!ud._aiOwned, aiState: ud.aiState, yaw: mb.rotation.y, x: mb.position.x, z: mb.position.z, roomId: ud.aiRoomId };
        if (!out.audience.find(a => a.id === ud.id)) out.audience.push(rec);
        else Object.assign(out.audience.find(a => a.id === ud.id), rec);
    }
    const so = window._succubusObj;
    if (so) out.succubus = { x: so.position.x, z: so.position.z };
    return out;
};

const normAngle = a => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

(async () => {
    const startedAt = Date.now();
    let browser, server;
    const uncaught = [];
    const illegalTransitions = [];
    const failures = [];
    const assert = (cond, label) => {
        console.log(`  ${cond ? '✅' : '❌'} ${label}`);
        if (!cond) failures.push(label);
    };

    try {
        server = await startServer();
        const port = server.address().port;
        const ENTRY = `http://127.0.0.1:${port}/OrigamiUnderworld.html`;
        browser = await chromium.launch({ args: ['--no-sandbox'] });
        const page = await (await browser.newContext()).newPage();
        page.on('pageerror', e => uncaught.push({ frame: 'top', msg: e.stack || e.message }));
        page.on('console', m => {
            const txt = m.text();
            if (txt.includes('[MonsterAI] illegal transition')) illegalTransitions.push(txt);
        });
        page.on('frameattached', frame => {
            frame.page()?.on('pageerror', e => uncaught.push({ frame: frame.url(), msg: e.stack || e.message }));
        });

        console.log(`[probe-ai-v2] loading ${ENTRY}`);
        await page.goto(ENTRY, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: READY_TIMEOUT_MS });
        console.log(`[probe-ai-v2] engine ready in ${Date.now() - startedAt}ms`);

        const engineFrame = page.frames().find(f => f.url().includes('Engine9'));
        if (!engineFrame) throw new Error('engine iframe not found');

        // Validate the requested live stage layout as soon as the two performers are available. This stays ahead of
        // the independent strict-segment roof drain so a roof timeout cannot hide a transform-layout regression.
        const cabaretLayout = await engineFrame.evaluate(async () => {
            const readyBy = Date.now() + 45000;   // Dancer is on the deferred monster-GLB lane; do not mistake a slow lazy load for a missing stage actor
            let dancerW = null;
            while (Date.now() < readyBy) {
                dancerW = window.monsterWrappers?.find?.(w => w?.userData?.isNewSuccubus && !w.userData.isDead) || null;
                if (window._succubusObj && dancerW) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (window._succubusObj && dancerW) await new Promise(resolve => setTimeout(resolve, 700));   // allow the existing dynamic lift lerp to settle on the measured deck height
            const lanes = ['cab-imp-fan','cab-gob-1','cab-mummy'].map(id => window._monsterAI.world.posOf('stage_front',{id}));
            const ud = dancerW?.userData;
            const base = ud?.monBase || dancerW;
            const measuredLift = (typeof window._sucGlbLift === 'number') ? window._sucGlbLift : 1.178;
            return {
                grid: window.GRID || 2,
                lanes,
                starlette: window._succubusObj ? { x:window._succubusObj.position.x, z:window._succubusObj.position.z } : null,
                dancerW: base && ud?.model ? { x:base.position.x, z:base.position.z, baseY:base.position.y, modelY:ud.model.position.y } : null,
                expectedDancerLift: Math.max(0, measuredLift - 0.3048),
            };
        });
        const coreLanes = cabaretLayout.lanes;
        if (!coreLanes.every(Boolean) || new Set(coreLanes.map(p => p.x.toFixed(2) + ',' + p.z.toFixed(2))).size !== 3) {
            throw new Error(`Cabaret core stage lanes are not distinct: ${JSON.stringify(coreLanes)}`);
        }
        const laneGapA = coreLanes[1].x - coreLanes[0].x, laneGapB = coreLanes[2].x - coreLanes[1].x;
        if (Math.abs(laneGapA - cabaretLayout.grid) > 0.01 || Math.abs(laneGapB - cabaretLayout.grid) > 0.01 ||
            Math.max(...coreLanes.map(p => p.z)) - Math.min(...coreLanes.map(p => p.z)) > 0.01) {
            throw new Error(`Cabaret core trio is not an exact one-tile line: ${JSON.stringify(cabaretLayout)}`);
        }
        if (!cabaretLayout.starlette || !cabaretLayout.dancerW || cabaretLayout.dancerW.x <= cabaretLayout.starlette.x ||
            Math.abs(cabaretLayout.dancerW.modelY - cabaretLayout.expectedDancerLift) > 0.03 ||
            Math.abs((cabaretLayout.dancerW.baseY - 0.002) - cabaretLayout.expectedDancerLift) > 0.03) {
            throw new Error(`Dancer is not stage-east at the shared one-foot-lowered model/circle lift: ${JSON.stringify(cabaretLayout)}`);
        }
        console.log(`[probe-ai-v2] Cabaret line PASS: ${coreLanes.map(p => `(${p.x.toFixed(2)},${p.z.toFixed(2)})`).join(' · ')} · Dancer east @ lift ${cabaretLayout.dancerW.modelY.toFixed(3)}`);

        // Cabaret strict-segment regression guard (Mark 2026-07-15): the raised ceiling and its rafters must be
        // separately owned, present, and visible after the boot drain. A dungeon-wide merged rafter mesh previously
        // inherited another segment from its bounding-box centre and vanished while the Cabaret was active.
        await engineFrame.waitForFunction(() => window._segmentStaticIndexReady === true, null, { timeout: READY_TIMEOUT_MS });
        const cabaretRoof = await engineFrame.evaluate(() => ({
            ceiling: !!window._cabHighCeiling,
            ceilingVisible: window._cabHighCeiling?.visible !== false,
            ceilingSegment: window._cabHighCeiling?.userData?.segmentId,
            rafters: !!window._cabaretCeilingRaftersMesh,
            raftersVisible: window._cabaretCeilingRaftersMesh?.visible !== false,
            raftersSegment: window._cabaretCeilingRaftersMesh?.userData?.segmentId,
            rafterVertices: window._cabaretCeilingRaftersMesh?.geometry?.attributes?.position?.count || 0,
        }));
        if (!cabaretRoof.ceiling || !cabaretRoof.rafters || !cabaretRoof.ceilingVisible || !cabaretRoof.raftersVisible ||
            cabaretRoof.ceilingSegment !== cabaretRoof.raftersSegment || cabaretRoof.rafterVertices < 1) {
            throw new Error(`Cabaret ceiling/rafter segment regression: ${JSON.stringify(cabaretRoof)}`);
        }
        console.log(`[probe-ai-v2] Cabaret roof visible in segment ${cabaretRoof.ceilingSegment} (${cabaretRoof.rafterVertices} rafter vertices)`);

        // ── Phases A/B/C: served module graph, hostile priority, movement delta ──
        const warningStart = illegalTransitions.length;
        const combat = await engineFrame.evaluate(async () => {
            const nonce = Date.now();
            const mod = await import('./js/v8/ai/MonsterAI.constructor.js?v=8.1.891-cabaret-facing-rail&probe=' + nonce);
            let peacefulHooks = 0;
            const room = {
                roomId: 1,
                ambientScripts: [{ id:'watch_show', state:mod.STATE.SCRIPTED, utility:{ base:1 }, scene:'attend_show' }],
                scenes: { attend_show: [{ do:'play', clip:'clap', hold:1 }] },
                roles: { 'cab-probe':['watch_show'] },
            };
            const world = {
                playerHostileTo: () => true,
                showWatch: () => { peacefulHooks++; return true; },
                smartObjectReady: () => { peacefulHooks++; return true; },
                crewSimLife: () => { peacefulHooks++; return true; },
                heardNoise: () => { peacefulHooks++; return true; },
                idleLife: () => { peacefulHooks++; return true; },
                peersNear: () => { peacefulHooks++; return [{ id:'peer' }]; },
                getPlayerPos: () => ({ x:2, z:0 }),
            };
            const bank = new mod.AffordanceBank().loadRoom(room);
            const offered = bank.advertise({ id:'cab-probe', roomId:1, personality:{} }, world);
            const edgeModel = { id:'cab-probe', roomId:1, personality:{} };
            const edgeBase = { playerHostileTo:()=>false, peersNear:()=>[], playerNear:()=>false, showWatch:()=>false, heardNoise:()=>false, idleLife:()=>false };
            const noticeOffered = bank.advertise(edgeModel,{...edgeBase,crewNoticePlayer:()=>true,crewShowEnded:()=>false}).map(x=>x.spec.id);
            const finaleOffered = bank.advertise(edgeModel,{...edgeBase,crewNoticePlayer:()=>false,crewShowEnded:()=>true}).map(x=>x.spec.id);

            const ref = { position:{ x:0, y:0, z:0 }, rotation:{ y:0 }, userData:{} };
            const fakeAdapter = {
                getModel: () => ({ id:'cab-probe', roomId:1, hpFrac:1, personality:{}, recent:[] }),
                getPosition: () => ({ x:0, z:0 }), getYaw: () => 0,
                setYaw: () => {}, setClip: () => {}, steerToward: () => ({ dx:0, dz:0 }),
                canAttack: () => false, distanceTo: () => 10,
            };
            const ctor = new mod.MonsterAIConstructor(fakeAdapter, world, { telemetry:false });
            ctor.loadRoomScript(room);
            const agent = ctor.build(ref); agent.fsm.to(mod.STATE.HOSTILE); ctor._decide(agent);

            // V3 scene lifecycle: brain re-decisions must not rewind an active scene, and each hold owns its
            // own step clock (not the whole SCRIPTED state's age). Drive a complete claim→move→face→hold→release.
            let releases = 0, claims = 0;
            const sceneWorld = {
                playerHostileTo: () => false, crewShowEnded: () => false, crewNoticePlayer: () => false, showWatch: () => false,
                releaseObject: () => { releases++; }, claimObject: () => { claims++; }, posOf: () => ({x:0,z:0}), getPlayerPos: () => ({x:0,z:0}),
            };
            const sceneCtor = new mod.MonsterAIConstructor({ ...fakeAdapter, distanceTo:()=>0 }, sceneWorld, { telemetry:false });
            const sceneAgent = sceneCtor.build({ position:{x:0,y:0,z:0}, rotation:{y:0}, userData:{} });
            const steps = [{do:'claim',anchor:'table'},{do:'moveTo',target:'table',reach:1},{do:'face',target:'table'},{do:'play',clip:'idle',hold:0.5},{do:'release'}];
            sceneAgent.fsm.to(mod.STATE.SCRIPTED); sceneAgent._pick={spec:{id:'sit_table'}}; sceneAgent._scene=steps; sceneAgent._sceneIdx=0; sceneAgent._sceneStepAt=performance.now();
            const seq=[]; sceneCtor._runScene(sceneAgent); seq.push(sceneAgent._sceneIdx); sceneCtor._runScene(sceneAgent); seq.push(sceneAgent._sceneIdx); sceneCtor._runScene(sceneAgent); seq.push(sceneAgent._sceneIdx);
            sceneAgent._sceneStepAt=performance.now()-700; sceneCtor._runScene(sceneAgent); seq.push(sceneAgent._sceneIdx); sceneCtor._runScene(sceneAgent); seq.push(sceneAgent._sceneIdx); sceneCtor._runScene(sceneAgent); const completedState=sceneAgent.fsm.state;
            sceneAgent.fsm.to(mod.STATE.SCRIPTED); sceneAgent._pick={spec:{id:'sit_table'}}; sceneAgent._scene=steps; sceneAgent._sceneIdx=3; sceneAgent._sceneStepAt=performance.now();
            sceneCtor._decide(sceneAgent); const stickyIdx=sceneAgent._sceneIdx;

            // ONI-BABA LIFE SENSE: a stable peaceful activity reports exactly
            // once on transition, never every 4 Hz decision/body frame.
            const lifeBeats = [];
            const lifeWorld = {
                playerHostileTo:()=>false, peersNear:()=>[], playerNear:()=>false,
                showWatch:()=>false, heardNoise:()=>false, idleLife:()=>true,
                getPlayerPos:()=>({x:0,z:0}), wanderTarget:()=>({x:1,z:0}),
                lifeBeat:(m, beat)=>lifeBeats.push({id:m.id, ...beat}),
            };
            const lifeCtor = new mod.MonsterAIConstructor(fakeAdapter, lifeWorld, {telemetry:false});
            const lifeAgent = lifeCtor.build({position:{x:0,y:0,z:0},rotation:{y:0},userData:{}});
            lifeCtor._decide(lifeAgent); lifeCtor._decide(lifeAgent);

            // SHOW FACING RAIL (Mark 2026-07-15): even a completely blocked walk must face Starlette immediately,
            // retain that face target while attempting the move, and advance after its bounded fallback.
            const showJson = await (await fetch('./js/v8/ai/rooms/cabaret.ai.json?v=probe-' + nonce)).json();
            showJson.roomId = 1;
            const showWorld = {
                playerHostileTo:()=>false, peersNear:()=>[], playerNear:()=>false, crewNoticePlayer:()=>false,
                crewShowEnded:()=>false, showWatch:()=>true, crewSimLife:()=>true, heardNoise:()=>false, idleLife:()=>false,
                posOf:(id, actor)=>id === 'succubus' ? {x:10,z:2} : (id === 'stage_front' ? {x:actor.id === 'cab-imp-fan' ? 8.65 : 10,z:3.9} : null),
                getPlayerPos:()=>({x:0,z:0}), releaseObject:()=>{},
            };
            const showAdapter = {
                ...fakeAdapter,
                getModel:()=>({id:'cab-imp-fan',roomId:1,hpFrac:1,personality:{sociability:0.5},recent:[]}),
                distanceTo:()=>99,
            };
            const showCtor = new mod.MonsterAIConstructor(showAdapter, showWorld, {telemetry:false});
            showCtor.loadRoomScript(showJson);
            const showAgent = showCtor.build({position:{x:0,y:0,z:0},rotation:{y:0},userData:{}});
            showCtor._decide(showAgent);
            const firstWatch = showCtor._intentFor(showAgent, 1/120);
            const blockedWatch = showCtor._intentFor(showAgent, 1/120);
            showAgent._sceneStepAt = performance.now() - 5000;
            const timeoutWatch = showCtor._intentFor(showAgent, 1/120);

            const adapterMod = await import('./js/v8/ai/MonsterAI.engineAdapter.js?v=8.1.835-move-delta&probe=' + nonce);
            const priorBudget = window._aiReplanBudget;
            window._aiReplanBudget = { n:0 };
            const adapter = adapterMod.makeEngine8Adapter({
                GRID:2, AStar:() => [[0,0],[1,0]], _canMonsterStand:() => true,
                _monSetAnim:() => {}, _hasLineOfSight:() => true,
            });
            const moving = { position:{ x:0, y:0, z:0 }, rotation:{ y:0 }, userData:{ _aiPathStamp:-1 } };
            const step = adapter.steerToward(moving, { x:2, z:0 }, 1, 0.1);
            window._aiReplanBudget = priorBudget;
            window.postMessage({ type:'MONSTER_SOUND_MAP_SET', map:{ yakuza_goblin:{ attack:'CACKLE', social:'HOW_RUDE' } } }, '*');
            await new Promise(resolve => setTimeout(resolve, 0));
            const soundDebug = window._monsterSoundMapDebug?.('yakuza_goblin');
            return {
                offered: offered.map(x => x.spec.state), peacefulHooks,
                state: agent.fsm.state, step, movedX:moving.position.x,
                v3:{ seq, completedState, claims, releases, stickyIdx, noticeOffered, finaleOffered, scriptReady:window._cabAiScriptReady===true,
                    showState:showAgent.fsm.state, showIdx:showAgent._sceneIdx, firstWatch, blockedWatch, timeoutWatch,
                    showSteps:showJson.scenes.attend_show.slice(0,3), lifeBeats, soundDebug },
            };
        });
        console.log('[probe-ai-v2] A/B — hostile Cabaret combat rail:');
        assert(combat.offered.length === 1 && combat.offered[0] === 'HOSTILE',
            `only HOSTILE is advertised (${combat.offered.join(', ')})`);
        assert(combat.state === 'HOSTILE', `FSM remains HOSTILE (got ${combat.state})`);
        assert(combat.peacefulHooks === 0, `peaceful/show hooks never evaluated in combat (calls=${combat.peacefulHooks})`);
        assert(illegalTransitions.length === warningStart,
            `no illegal FSM transition warning during combat (new=${illegalTransitions.length - warningStart})`);
        console.log('[probe-ai-v2] C — adapter movement truth:');
        assert(combat.step.dx > 0.09 && combat.step.dz === 0 && combat.movedX > 0.09,
            `successful step reports its real delta (${JSON.stringify(combat.step)})`);
        console.log('[probe-ai-v2] D — v3 Sims scene clock + stickiness:');
        assert(JSON.stringify(combat.v3.seq) === JSON.stringify([1,2,3,4,5]), `scene advances exactly once per authored step (${combat.v3.seq.join('→')})`);
        assert(combat.v3.claims === 1 && combat.v3.releases >= 1, `smart-object claim/release completes (${combat.v3.claims}/${combat.v3.releases})`);
        assert(combat.v3.completedState === 'IDLE', `completed scene returns to IDLE (${combat.v3.completedState})`);
        assert(combat.v3.stickyIdx === 3, `4 Hz brain preserves active scene index (${combat.v3.stickyIdx})`);
        assert(combat.v3.noticeOffered.includes('notice_player') && combat.v3.finaleOffered.includes('show_end_bow'), `player-entry + finale edges advertise their scenes`);
        assert(combat.v3.scriptReady, `generated Cabaret room script was awaited before engine ready`);
        const _sameStar = p => p && p.x === 10 && p.z === 2;
        assert(combat.v3.showSteps[0]?.do === 'face' && combat.v3.showSteps[0]?.target === 'succubus', `show scene faces Starlette before moving`);
        assert(_sameStar(combat.v3.firstWatch?.faceTarget) && _sameStar(combat.v3.blockedWatch?.faceTarget), `blocked walk retains Starlette face target`);
        assert(combat.v3.showSteps[1]?.timeout === 4 && combat.v3.timeoutWatch?.moveTarget == null && combat.v3.showIdx === 2, `blocked stage walk times out into the watch scene`);
        assert(combat.v3.lifeBeats.length === 1 && combat.v3.lifeBeats[0].activity === 'amble' && combat.v3.lifeBeats[0].kind === 'ambient', `peaceful activity emits one transition-rate Oni-Baba life beat`);
        assert(combat.v3.soundDebug?.stored?.attack === 'CACKLE' && combat.v3.soundDebug?.stored?.social === 'HOW_RUDE' && combat.v3.soundDebug?.tags?.includes('HOW_RUDE'), `monster sound map persists live semantic assignments`);

        await browser.close();
        if (server) await new Promise(r => server.close(r));
    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        if (server) await new Promise(r => server.close(r));
        console.error(`[probe-ai-v2] HARNESS ERROR: ${e.message}`);
        process.exit(2);
    }

    if (uncaught.length) {
        console.error(`\n[probe-ai-v2] FAIL — ${uncaught.length} uncaught error(s):`);
        for (const u of uncaught) console.error(`  • ${u.frame}: ${u.msg}`);
        process.exit(1);
    }
    if (failures.length) {
        console.error(`\n[probe-ai-v2] FAIL — ${failures.length} assertion(s) failed.`);
        process.exit(1);
    }
    console.log(`\n[probe-ai-v2] OK — Cabaret combat rail + lifecycle clean (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    process.exit(0);
})();
