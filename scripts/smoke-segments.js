#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    // '.mjs' ADDED 2026-08-04. Engine9 imports js/v8/core/RunLedger.mjs, and without a mapping this
    // server answered application/octet-stream — Chrome's strict module MIME check then refused the
    // script and __engineReady never fired, so this probe timed out on EVERY run regardless of what it
    // was measuring. A harness that cannot boot the page reports nothing; scripts/smoke.js already had
    // the entry, which is why the two disagreed.
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
};

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const file = path.join(ROOT, urlPath === '/' ? '/OrigamiUnderworld.html' : urlPath);
            if (!file.startsWith(ROOT)) { res.statusCode = 403; res.end(); return; }
            fs.readFile(file, (error, data) => {
                if (error) { res.statusCode = 404; res.end(error.code); return; }
                res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
                res.end(data);
            });
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function assert(value, message) {
    if (!value) throw new Error(message);
}

// ── THIS SMOKE TESTS SEGMENT *STREAMING*, SO IT MUST RUN ON A FLOOR THAT STREAMS ──────────────
//    ⛔ IT WAS RED ON HEAD AND HAD BEEN FOR A MONTH, AND THE CAUSE WAS THE FLOOR IT BOOTED.
//      It loaded NewOrigami.9.html bare — floor 1 — and died before its first assertion with
//      `segment runtime did not initialize: {"invoked":true,"runtime":false,"gates":0}`.
//      `invoked:true` is the tell: the tick RAN and did not throw. `window._segmentRuntimeReady`
//      flips only inside `if (gates && gates.length)` (Origami.RealityEngine.9.html ~:88632), floor 1's
//      `_buildSection0` registers its crossings as kind 'section' rather than kind 'segment', and
//      `_segmentGates` is filtered to kind 'segment' (~:6420) — so a floor-1 boot has zero of them
//      and the readiness flag can never flip.
//    ⚠ THE ENGINE IS NOT WRONG HERE, and that distinction is why this is a harness fix. Six lines
//      above that flag the code says so itself: "GATES ARE JUST DOORS … an empty list costs one
//      no-op loop. Only the LEGACY one-way FSM below genuinely needs a gate." Free migration is the
//      shipped default and it runs fine on a gateless floor. The only consumer of
//      `_segmentRuntimeReady` in the entire tree is this file (three write sites in Engine9, zero
//      reads) — it is a test seam, and pointing the test at the right floor is the honest repair.
//    ⚠ AND THE RULING SAYS THE SAME THING: floor 1's segments are ADDRESSES, not streaming units
//      (V1, landed 545ad02e — floor 1 parks NOTHING). A streaming smoke on floor 1 is a category
//      error. Floor 1's own contract gets its own leg later; see the note on SEG_FLOOR below.
const SEG_FLOOR = Number(process.env.SEG_FLOOR || 2);

// ⚠ THE SEED IS PINNED, AND NOT FOR TIDINESS. Floors 2+ reroll every boot and carry a MEASURED
//   ~21.7% generation-failure rate (60 generations per side, A/B'd against HEAD on 2026-09-03);
//   L2 seed 7 is known-unbuildable outright. An unpinned streaming smoke would flake about one run
//   in five and every failure would look like a streaming regression. The engine reads its root
//   seed from sessionStorage `origami.v8.seed` (Engine9 ~:5316) and derives the floor seed from it,
//   so writing that key before boot pins the whole map.
//   ⚠ THIS EXACT VALUE IS LOAD-BEARING: it is a seed measured to BUILD on floor 2. Changing it is
//     changing the map under the assertions — re-verify with a boot, do not swap it casually.
const SEG_SEED = process.env.SEG_SEED || '20260903';

// ── staticLeaks SCOPING — a pure function so it can be proved without a browser ───────────────
//    Under the V1 ruling floor 1 parks nothing, so EVERY visible static root there would score as a
//    leak. The rule does not apply; it must say so.
//    ⚠⚠ `null`, NEVER `0`. "Not applicable" reported as zero is a clean streaming audit that never
//      ran — the vacuous-green shape this repo has been bitten by four times in one day. `null`
//      forces a reader to notice, and the assertion below SKIPS on null rather than passing on it.
function scopeStaticLeaks({ floor, rawLeaks, forceStreaming }) {
    const streaming = (forceStreaming === true) || Number(floor) > 1;
    return streaming ? { applies: true, leaks: rawLeaks } : { applies: false, leaks: null };
}

if (process.argv.includes('--selftest')) {
    // RED-FIRST, and case 4 is the control: without it, case 3 passing proves nothing — a rule that
    // silently died would also report "not applicable".
    const cases = [
        { name: 'floors 2+ with a real leak → APPLIES and reports it',
          in: { floor: 2, rawLeaks: 3 }, want: { applies: true, leaks: 3 } },
        { name: 'floors 2+ clean → APPLIES and reports zero',
          in: { floor: 3, rawLeaks: 0 }, want: { applies: true, leaks: 0 } },
        { name: 'floor 1 with many visible roots → NOT APPLICABLE, and NOT "0 leaks"',
          in: { floor: 1, rawLeaks: 49 }, want: { applies: false, leaks: null } },
        { name: 'CONTROL: the same floor-1 sample with streaming FORCED → the rule still bites',
          in: { floor: 1, rawLeaks: 49, forceStreaming: true }, want: { applies: true, leaks: 49 } },
    ];
    let pass = 0, fail = 0;
    for (const c of cases) {
        const got = scopeStaticLeaks(c.in);
        const ok = got.applies === c.want.applies && got.leaks === c.want.leaks;
        if (ok) { pass++; console.log('  PASS  ' + c.name); }
        else { fail++; console.log('  FAIL  ' + c.name + '\n        want ' + JSON.stringify(c.want) + ', got ' + JSON.stringify(got)); }
    }
    console.log('\nSELFTEST — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 2 : 0);
}

(async () => {
    let browser;
    let server;
    const pageErrors = [];
    try {
        server = await startServer();
        const url = `http://127.0.0.1:${server.address().port}/OrigamiUnderworld.html`;
        browser = await chromium.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.on('pageerror', error => pageErrors.push(error.stack || error.message));
        page.on('console', message => { if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`); });
        await page.addInitScript(([seed]) => {
            try { sessionStorage.setItem('origami.v8.seed', seed); } catch (_) {}
            try { localStorage.setItem('origami_tc_accepted', 'true'); } catch (_) {}
            // ⚠ THE FLOOR IS READ BACK FROM THE ENGINE'S OWN ANNOUNCEMENT, NOT FROM THE URL WE ASKED
            //   FOR. `DUNGEON_LEVEL` is a module-level `let` and is NOT reachable from an injected
            //   evaluate (reachability is per SYMBOL, not per file — this tree has the scar). The
            //   engine posts `{type:'FLOOR_UPDATE', floor: DUNGEON_LEVEL}` to the shell
            //   (Origami.RealityEngine.9.html ~:85818); that message IS the engine's measured identity,
            //   and asserting on the URL would only prove we typed it correctly.
            try {
                window.__segFloorSeen = null;
                window.addEventListener('message', (e) => {
                    if (e && e.data && e.data.type === 'FLOOR_UPDATE') window.__segFloorSeen = e.data.floor;
                });
            } catch (_) {}
        }, [SEG_SEED]);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 60000 });

        // ── DESCEND TO THE GATED FLOOR. This is the descent the shell itself uses: repoint the
        //    engine iframe at ?floor=N and let it re-seed. Same mechanism as
        //    scripts/gate-floor-sections.js, which has been descending this way all along.
        if (SEG_FLOOR !== 1) {
            await page.evaluate((fl) => {
                const ifr = document.getElementById('engine-iframe');
                const v = (ifr.src.match(/[?&]v=([^&]+)/) || [])[1] || '';
                ifr.src = 'Origami.RealityEngine.9.html?floor=' + fl + (v ? '&v=' + v : '');
            }, SEG_FLOOR);
            await page.waitForTimeout(2500);
            await page.waitForFunction((fl) => {
                const f = window.frames && Array.from(document.querySelectorAll('iframe'))
                    .find(x => new RegExp('Engine9\\.html\\?floor=' + fl + '(&|$)').test(x.src));
                return !!f && window.__segFloorSeen === fl;
            }, SEG_FLOOR, { timeout: 120000 });
        }
        const floorSeen = await page.evaluate(() => window.__segFloorSeen);
        assert(floorSeen === SEG_FLOOR,
            `harness asked for floor ${SEG_FLOOR} but the engine reports floor ${floorSeen} — `
            + 'binding on the URL instead of the engine\'s own FLOOR_UPDATE is how a smoke grades the wrong map');

        const engine = page.frames().find(frame => /NewOrigami\.Engine9\.html/.test(frame.url()));
        assert(engine, 'engine iframe was not found');
        await page.waitForTimeout(1500);

        // ── THE MAP MUST HAVE BUILT AT ALL, AND THAT IS ASSERTED BEFORE ANYTHING ELSE. Floors 2+
        //    reroll per boot with a measured ~21.7% generation-failure rate; a generator that threw
        //    leaves every downstream assertion measuring an absent map, and the report would blame
        //    streaming for a build that never happened.
        const built = await engine.evaluate(() => ({
            map: !!(window.map && window.map.length),
            rooms: (window.Creator && window.Creator.rooms) ? window.Creator.rooms().length : -1,
            segments: (window._dungeonSegments || []).length,
        }));
        const genFailed = pageErrors.find(e => /generation failed after retries/.test(e));
        assert(!genFailed, `the map did not generate on floor ${SEG_FLOOR} seed ${SEG_SEED} — this is the `
            + `pre-existing ~21.7% floor-2/3 generation defect, NOT a streaming fault. Pin a different `
            + `SEG_SEED (and say why in the constant). Raw: ${genFailed}`);
        assert(built.map && built.rooms > 0 && built.segments > 0,
            `floor ${SEG_FLOOR} produced no usable map: ${JSON.stringify(built)}`);
        if (!(await engine.evaluate(() => typeof window._tickDungeonSegments === 'function'))) {
            const sourceHasRuntime = await engine.evaluate(() => fetch(location.href).then(r => r.text()).then(t => t.includes('window._tickDungeonSegments = function')));
            const state = await engine.evaluate(() => ({ href:location.href, ready:window.__engineReady, dungeonSegments:window._dungeonSegments?.length, keys:Object.keys(window).filter(k => /segment/i.test(k)).sort() }));
            throw new Error(`segment runtime function is missing: source=${sourceHasRuntime} state=${JSON.stringify(state)}`);
        }
        try {
            await engine.waitForFunction(() => window._segmentRuntimeReady === true, null, { timeout: 10000 });
        } catch (_) {
            const diagnostic = await engine.evaluate(() => {
                try { window._tickDungeonSegments(0.016); return { invoked:true, runtime:window._segmentRuntimeReady, gates:window._segmentGates?.length }; }
                catch (error) { return { invoked:false, runtime:window._segmentRuntimeReady, gates:window._segmentGates?.length, error:error.stack || error.message }; }
            });
            if (!diagnostic.runtime) throw new Error(`segment runtime did not initialize: ${JSON.stringify(diagnostic)}\n${pageErrors.join('\n')}`);
        }
        // ENGINE_READY precedes the deferred GLB drain and the first Authority/LightController
        // classification pass. A taxonomy assertion before those gates is a startup-race test, not
        // a section smoke. Wait for the same managed proof surface used by the full falsifier.
        //
        // ⛔⛔ IF THIS WAIT TIMES OUT, THAT IS **SEG-CULL**, NOT THIS FILE'S 2026-09-03 REPAIR.
        //    Read this before re-diagnosing, because the two faults look identical from the outside
        //    (a red `npm run smoke:segments`) and they are unrelated:
        //      · The repair above — floor selection, the FLOOR_UPDATE readback, the pinned seed and
        //        the build assertion — fixed a DIFFERENT fault: this smoke used to die at the old
        //        line 73 with `segment runtime did not initialize {invoked:true, runtime:false,
        //        gates:0}`, because it booted floor 1 and floor 1 has no kind:'segment' gates. That
        //        is fixed and PROVEN: floor 2 reports gates=3 and the runtime flag flips.
        //      · What is left is OLDER and lives in the engine, not here, and is task **TAG-54**.
        //        MEASURED 2026-09-03, floor 2, three separate building seeds (20260903 · 11 · 22):
        //        `window._sectionCullAudit().ok === false` on every one, while the light half of
        //        this same wait was already satisfied (`unresolvedRoomLights === 0`) every time.
        //        Not a seed accident, not a startup race — 120s is not a race.
        //        ⭐ AFTER the section-count fix the remainder is **54**, measured, not predicted:
        //        lights 39 · loot 9 · instance `source-seg` of -1/undefined 6 — and ZERO static
        //        roots. ⚠ I PREDICTED 102 AND WAS WRONG: I split the original 146 by the TEXT of
        //        each entry, so the 51 `static-residency/0/Mesh` lines went in the "not section 4"
        //        pile while they were failing because their `residents` array CONTAINED 4. Classify
        //        by the PREDICATE, never by the label — the label never said 4.
        //    ⚠ CONTEXT, NOT YET A CAUSE: floor 2 also ships Creator structure violations on every
        //      seed (`mode=report → SHIPPED ANYWAY`) — 9 to 11 of them, including FOUR unreachable
        //      walkable islands (51, 22, 7 and 2 tiles) and three room footprints absent from the
        //      RoomShapes catalogue. Whether the cull audit fails BECAUSE of those is exactly the
        //      open question; do not assume it, measure it.
        //    ⚠ AND THE FIRST THING TO DO IS PRINT THE WHOLE AUDIT OBJECT. My sweep fetched
        //      `_sectionCullAudit()` in full and logged only `.ok`, so the reason was in hand and
        //      thrown away. `.ok === false` is the symptom; the object carries the finding.
        //    HEAD never reached this line — it died upstream — so this defect has been invisible for
        //    as long as the smoke has been red, which the git record puts at on or about 2026-08-04.
        await engine.waitForFunction(() => window._sectionCullAudit?.().ok === true
            && window._lightCtl?.state?.().unresolvedRoomLights === 0,
        null, { timeout:120000 });

        const before = await engine.evaluate(() => {
            const active = window._activeSegmentId;
            const canvas = document.querySelector('canvas');
            return {
                active,
                roomCounts: window._dungeonSegments.map(s => ({ id:s.id, rooms:s.roomIds.length, state:s.state })),
                gates: window._segmentGates.map(g => ({ from:g.segmentFrom, to:g.segmentTo, tiles:g.srcTiles.length })),
                liveMonsterSegments: window.monsterWrappers.map(w => w.userData.segmentId),
                stagedMonsterCount: (window._segmentStagedWrappers.get(1) || []).length,
                instanceMismatches: (() => {
                    const live = new Set(window._liveSegments ? window._liveSegments() : [active, window._previewSegmentId]);
                    return window._segmentInstanceRegistry.filter(entry => entry.mesh.count !== entry.segmentIds.filter(id => !Number.isInteger(id) || id < 0 || live.has(id)).length).length;
                })(),
                canvas: { width:canvas?.width || 0, height:canvas?.height || 0 },
            };
        });
        assert(before.active === 0, `expected segment 0 at boot, got ${before.active}`);
        // ⛔ THE "EXACTLY FOUR SECTIONS, >=2 ROOMS EACH" ASSERTION IS GONE, AND DELETING IT IS THE
        //    POINT RATHER THAN A CONCESSION. It was a SHAPE claim living in a STREAMING smoke, and it
        //    is already false: post-S5 the floors carry FIVE sections {0..4} with section 4 the
        //    one-room guardroom, so it would fail on floor 2 today for a reason that has nothing to
        //    do with segment streaming.
        //    ⚠ SHAPE HAS ONE AUTHORITY AND IT IS NOT THIS FILE: `scripts/gate-floor-sections.js`
        //      grades floor→section→room against `Creator.SECTION_RULES` and knows the guardroom
        //      exemption, the per-floor band, and the compass. A second copy of those numbers here
        //      would be a drifting authority — the exact failure that put two SPECIAL_BUILDING tables
        //      in DungeonChain and let them disagree.
        //    WHAT SURVIVES IS THIS SMOKE'S OWN IDENTITY: sections must EXIST and be contiguous from 0,
        //    because streaming addresses them by index. How many there should be, and how big, is the
        //    section gate's question.
        assert(before.roomCounts.length > 1 && before.roomCounts.every((s, i) => s.id === i),
        `sections are not contiguous from 0 — streaming indexes them by id: ${JSON.stringify(before.roomCounts)}`);
        assert(before.gates.length > 1 && before.gates.every(g => g.tiles === 2 && g.to === g.from + 1), 'segment gates are not sequential two-tile gates');
        assert(before.liveMonsterSegments.every(id => id === 0), 'inactive monsters leaked into the live simulation array');
        assert(before.instanceMismatches === 0, 'instance buffers contain off-segment geometry at boot');
        assert(before.canvas.width > 0 && before.canvas.height > 0, 'engine canvas has no render surface');
        await page.evaluate(() => { const ui = document.getElementById('ui-viewport'); if (ui) ui.style.visibility = 'hidden'; });
        const beforeShot = await page.screenshot({ path: '/tmp/origami-segment-before.png' });
        assert(beforeShot.length > 20000, `engine screenshot is probably blank (${beforeShot.length} bytes)`);
        before.canvas.screenshotBytes = beforeShot.length;

        // The default engine is the state-derived free-migration model (active ±1), not the retired
        // one-way buffered-transition FSM tested below. Exercise the shipped contract directly and
        // retain the old branch as an A/B gate for window._freeMigration=false.
        if (await engine.evaluate(() => window._freeMigration !== false)) {
            const sections = await engine.evaluate(() => (window._dungeonSegments || []).map(s => ({
                id:s.id, roomId:(s.roomIds || []).find(Number.isInteger),
            })));
            const samples = [];
            for (const section of sections) {
                assert(Number.isInteger(section.roomId), `section ${section.id} has no room`);
                await engine.evaluate(({ id, roomId }) => {
                    try { window._unsealDungeonSegment(id); window._stageDungeonSegment(id); } catch (_) {}
                    window._tpRoom(roomId);
                }, section);
                let landed = false;
                for (let attempt = 0; attempt < 100; attempt++) {
                    landed = await engine.evaluate(({ id, roomId }) =>
                        window._activeSegmentId === id && window._playerRoom?.() === roomId,
                    section);
                    if (landed) break;
                    await page.waitForTimeout(150);
                }
                if (!landed) {
                    const state = await engine.evaluate(() => ({
                        active:window._activeSegmentId, room:window._playerRoom?.(), live:window._liveSegments?.(),
                    }));
                    throw new Error(`section ${section.id}/room ${section.roomId} landing timeout: ${JSON.stringify(state)}`);
                }
                await page.waitForTimeout(500);
                samples.push(await engine.evaluate(id => {
                    const live = window._liveSegments();
                    const liveSet = new Set(live);
                    const expected = (window._dungeonSegments || []).map(s => s.id)
                        .filter(x => Math.abs(x - id) <= 1);
                    const instanceLeaks = [];
                    for (const entry of window._segmentInstanceRegistry || []) for (const src of entry.visibleSourceIndices || []) {
                        if (!liveSet.has(entry.segmentIds[src])) instanceLeaks.push(entry.segmentIds[src]);
                    }
                    const staticLeaks = [];
                    for (const [primary, roots] of window._segmentStaticRoots || []) for (const root of roots) {
                        const residents = root.userData?.rtag?.segments || [primary];
                        if (root.visible !== false && !residents.some(x => liveSet.has(x))) staticLeaks.push(primary);
                    }
                    const actorLeaks = (window.monsterWrappers || []).filter(w =>
                        w.visible !== false && !window._isEntityInteractable(w)).length;
                    const freezeLeaks = (window.monsterWrappers || []).filter(w =>
                        w.visible === false && (w.matrixWorldAutoUpdate !== false
                            || (w.userData?.mixer && w.userData.mixer._cullHidden !== true))).length;
                    return {
                        id, live, expected, instanceLeaks:instanceLeaks.length,
                        // RAW, unscoped. The applicability decision is made in node by
                        // `scopeStaticLeaks` so it can be proved by `--selftest` without a browser.
                        staticLeaksRaw:staticLeaks.length, actorLeaks, freezeLeaks,
                        taxonomy:window._sectionCullAudit?.() || null,
                        unresolvedRoomLights:window._lightCtl?.state?.().unresolvedRoomLights ?? -1,
                    };
                }, section.id));
            }
            for (const sample of samples) {
                assert(JSON.stringify(sample.live) === JSON.stringify(sample.expected),
                    `section ${sample.id} live window mismatch: ${JSON.stringify(sample)}`);
                // ⚠ SCOPED, AND A NON-APPLICABLE RESULT IS SKIPPED — NOT PASSED. On floor 1 the V1
                //   ruling (landed 545ad02e) is that nothing is parked, so every visible static root
                //   would score as a leak and the rule does not apply. `scopeStaticLeaks` returns
                //   `leaks: null` there, and null must never be read as "0 leaks" — a clean audit
                //   that never ran is the vacuous green this file already produced once today.
                const _sl = scopeStaticLeaks({ floor: SEG_FLOOR, rawLeaks: sample.staticLeaksRaw });
                sample.staticLeaks = _sl.leaks;
                sample.staticLeaksApply = _sl.applies;
                assert(sample.instanceLeaks === 0, `section ${sample.id} leaked instanced geometry: ${JSON.stringify(sample)}`);
                if (_sl.applies) {
                    assert(_sl.leaks === 0, `section ${sample.id} leaked static geometry: ${JSON.stringify(sample)}`);
                } else {
                    console.log(`[smoke:segments] staticLeaks NOT APPLICABLE on floor ${SEG_FLOOR} `
                        + `(V1 ruling: floor 1 parks nothing) — raw count ${sample.staticLeaksRaw} is not a verdict.`);
                }
                assert(sample.actorLeaks === 0 && sample.freezeLeaks === 0,
                    `section ${sample.id} actor ownership mismatch: ${JSON.stringify(sample)}`);
                assert(sample.taxonomy?.ok && sample.unresolvedRoomLights === 0,
                    `section ${sample.id} taxonomy/light audit failed: ${JSON.stringify(sample)}`);
            }
            const afterShot = await page.screenshot({ path: '/tmp/origami-segment-after.png' });
            assert(afterShot.length > 20000, `post-traversal screenshot is probably blank (${afterShot.length} bytes)`);
            if (pageErrors.length) throw new Error(`uncaught page errors:\n${pageErrors.join('\n')}`);
            console.log('[smoke:segments] OK', JSON.stringify({ mode:'free-migration', floor:SEG_FLOOR, seed:SEG_SEED, before, samples, afterScreenshotBytes:afterShot.length }));
            return;
        }

        await engine.evaluate(() => window._stageDungeonSegment(1));
        await engine.waitForFunction(() => window._segmentStageReady(1), null, { timeout: 30000 });
        const cabGateReady = await engine.evaluate(() => {
            const g = window._segmentGates.find(gate => gate.segmentFrom === 0 && gate.segmentTo === 1);
            const door = (window._cabDoors || []).find(d => d.isDungeonExit);
            g._stageRequested = true; g._stageAt = performance.now() - 700;
            if (door) { door.anim = null; door.open = true; }
            window._tickDungeonSegments(0.016);
            return { hasDoor:!!door, types:g.srcTiles.map(([x,z]) => window.Engine8.map[x]?.[z]?.type) };
        });
        assert(cabGateReady.types.every(type => type !== 'wall'), `ready Cabaret gate remained solid: ${JSON.stringify(cabGateReady)}`);
        const destination = await engine.evaluate(() => {
            const gate = window._segmentGates.find(g => g.segmentFrom === 0 && g.segmentTo === 1);
            for (const [x,z] of gate.srcTiles) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const cell = window.Engine8.map[x + dx]?.[z + dz];
                if (cell && cell.segmentId === 1 && cell.type !== 'wall') return { x:(x + dx) * 2, z:(z + dz) * 2 };
            }
            return null;
        });
        assert(destination, 'could not find the segment-1 side of the first gate');
        const origin = await engine.evaluate(() => {
            const gate = window._segmentGates.find(g => g.segmentFrom === 0 && g.segmentTo === 1);
            for (const [x,z] of gate.srcTiles) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const cell = window.Engine8.map[x + dx]?.[z + dz];
                if (cell && cell.segmentId === 0 && cell.type !== 'wall') return { x:(x + dx) * 2, z:(z + dz) * 2 };
            }
            return null;
        });
        assert(origin, 'could not find the segment-0 retreat side of the Cabaret gate');
        const transitionResult = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z; window.rot = Math.PI / 2;
            try {
                for (let i = 0; i < 8; i++) window._tickDungeonSegments(0.016);
                const gate = window._segmentGates.find(g => g.segmentFrom === 0 && g.segmentTo === 1);
                const nextGate = window._segmentGates.find(g => g.segmentFrom === 1 && g.segmentTo === 2);
                return {
                    active:window._activeSegmentId,
                    transitioning:!!window._segmentTransition,
                    sealed0:window._sealedSegmentIds.has(0),
                    preview:window._previewSegmentId,
                    inputLocked:window._segmentInputLocked,
                    normalAxis:window._segmentTransition?.normalAxis,
                    normalSign:window._segmentTransition?.normalSign,
                    state1:window._dungeonSegments.find(s => s.id === 1)?.state,
                    staged1:(window._segmentStagedWrappers.get(1) || []).length,
                    nextGateVisible:!!nextGate && nextGate.tiles.every(t => !t.mesh || t.mesh.visible),
                    oldStaticVisible:[...(window._segmentStaticRoots.get(0) || [])].filter(o => o.visible).length,
                    gateTypes:gate.srcTiles.map(([x,z]) => window.Engine8.map[x]?.[z]?.type),
                    tileSegment:window._segmentIdAtWorld(window.px, window.pz),
                };
            } catch (error) { return { error:error.stack || error.message, active:window._activeSegmentId, tileSegment:window._segmentIdAtWorld(window.px, window.pz) }; }
        }, destination);
        assert(transitionResult.active === 1 && transitionResult.tileSegment === 1 && transitionResult.transitioning, `destination did not activate immediately at the buffered threshold: ${JSON.stringify(transitionResult)}`);
        assert(transitionResult.state1 === 'active' && transitionResult.staged1 === 0, `destination content stayed staged after crossing: ${JSON.stringify(transitionResult)}`);
        assert(transitionResult.nextGateVisible, `destination forward gate became a solid invisible wall during overlap: ${JSON.stringify(transitionResult)}`);
        assert(!transitionResult.sealed0 && transitionResult.preview == null && transitionResult.oldStaticVisible === 0, `strict transition retained old-section render ownership: ${JSON.stringify(transitionResult)}`);
        assert(transitionResult.inputLocked === false, `threshold crossing locked input: ${JSON.stringify(transitionResult)}`);
        assert(transitionResult.gateTypes.every(type => type !== 'wall'), `buffered doorway became solid around the player: ${JSON.stringify(transitionResult)}`);

        const movementStart = await engine.evaluate(({ axis, sign }) => {
            window.__segmentSmokeGuideBlock = window._guideBlocksMove;
            window._guideBlocksMove = false;
            window.rot = axis === 'x' ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : (sign > 0 ? Math.PI : 0);
            const start = { x:window.px, z:window.pz };
            window.dispatchEvent(new KeyboardEvent('keydown', { key:'w', code:'KeyW' }));
            return start;
        }, { axis:transitionResult.normalAxis, sign:transitionResult.normalSign });
        await page.waitForTimeout(250);
        const movementEnd = await engine.evaluate(() => {
            window.dispatchEvent(new KeyboardEvent('keyup', { key:'w', code:'KeyW' }));
            window._guideBlocksMove = window.__segmentSmokeGuideBlock;
            delete window.__segmentSmokeGuideBlock;
            return { x:window.px, z:window.pz, transitioning:!!window._segmentTransition, inputLocked:window._segmentInputLocked };
        });
        assert(Math.hypot(movementEnd.x - movementStart.x, movementEnd.z - movementStart.z) > 0.04, `held-W produced no movement during doorway buffer: ${JSON.stringify({ movementStart, movementEnd })}`);
        assert(movementEnd.transitioning && movementEnd.inputLocked === false, `movement test unexpectedly ended/locked the buffer: ${JSON.stringify(movementEnd)}`);

        const clearance = await engine.evaluate(() => {
            const tr = window._segmentTransition;
            let best = null;
            for (let x = 0; x < window.Engine8.map.length; x++) for (let z = 0; z < (window.Engine8.map[x]?.length || 0); z++) {
                const cell = window.Engine8.map[x][z];
                if (!cell || cell.segmentId !== 1 || cell.type === 'wall') continue;
                const wx = x * 2, wz = z * 2;
                const normalDistance = ((tr.normalAxis === 'x' ? wx - tr.center.x : wz - tr.center.z) * tr.normalSign);
                if (!best || normalDistance > best.normalDistance) best = { x:wx, z:wz, normalDistance, required:2 * tr.clearTiles };
            }
            return best;
        });
        assert(clearance && clearance.normalDistance >= clearance.required, `could not find safe post-gate clearance: ${JSON.stringify(clearance)}`);
        const closePacing = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            const tr = window._segmentTransition;
            tr.t = tr.bufferSec; tr.clearT = tr.clearHoldSec;
            window._tickDungeonSegments(0.016);
            const start = tr.cabOpenAmt;
            for (let i = 0; i < 18; i++) window._tickDungeonSegments(0.016);
            return { start, after300ms:tr.cabOpenAmt, closing:tr.closing, transitioning:!!window._segmentTransition };
        }, clearance);
        assert(closePacing.closing && closePacing.transitioning && closePacing.after300ms > closePacing.start * 0.75, `Cabaret hinge still slams during its first 300ms: ${JSON.stringify(closePacing)}`);
        const cabCancelled = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            window._tickDungeonSegments(0.016);
            const door = (window._cabDoors || []).find(d => d.isDungeonExit);
            return { active:window._activeSegmentId, transitioning:!!window._segmentTransition, preview:window._previewSegmentId, reopenAmt:door?._segmentReopenAmt };
        }, origin);
        assert(cabCancelled.active === 0 && !cabCancelled.transitioning && cabCancelled.preview === 1, `Cabaret retreat did not roll back ownership: ${JSON.stringify(cabCancelled)}`);
        assert(cabCancelled.reopenAmt > 0 && cabCancelled.reopenAmt < 0.99, `Cabaret retreat snapped the hinge instead of preserving its partial angle: ${JSON.stringify({ closePacing, cabCancelled })}`);
        const cabReopen = await engine.evaluate(() => {
            const door = (window._cabDoors || []).find(d => d.isDungeonExit), start = door?._segmentReopenAmt;
            for (let i = 0; i < 18; i++) window._tickCabDoors(0.016);
            return { start, after300ms:door?._segmentReopenAmt };
        });
        assert(cabReopen.after300ms > cabReopen.start && cabReopen.after300ms < 1, `Cabaret retreat did not ease the hinge open: ${JSON.stringify(cabReopen)}`);
        const cabRecrossed = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            for (let i = 0; i < 8; i++) window._tickDungeonSegments(0.016);
            return { active:window._activeSegmentId, transitioning:!!window._segmentTransition, preview:window._previewSegmentId };
        }, destination);
        assert(cabRecrossed.active === 1 && cabRecrossed.transitioning && cabRecrossed.preview == null, `Cabaret gate did not reactivate with strict destination-only rendering after retreat: ${JSON.stringify(cabRecrossed)}`);
        const closeResult = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            const tr = window._segmentTransition; tr.t = tr.bufferSec; tr.clearT = tr.clearHoldSec;
            for (let i = 0; i < 160; i++) window._tickDungeonSegments(0.016);
            return { active:window._activeSegmentId, transitioning:!!window._segmentTransition, sealed0:window._sealedSegmentIds.has(0), inputLocked:window._segmentInputLocked };
        }, clearance);
        assert(closeResult.active === 1 && !closeResult.transitioning && closeResult.sealed0, `buffered doorway did not ease shut after clearance: ${JSON.stringify(closeResult)}`);
        await page.waitForTimeout(400);

        const after = await engine.evaluate(() => {
            const active = window._activeSegmentId;
            return {
                active,
                sealed0: window._sealedSegmentIds.has(0),
                fog0: window._segmentFogMeshes.get(0)?.visible === true,
                liveOldMonsters: window.monsterWrappers.filter(w => w.userData.segmentId === 0).length,
                liveOldLoot: window.lootItems ? window.lootItems.filter(c => c.userData.segmentId === 0).length : 0,
                activeMonsters: window.monsterWrappers.filter(w => w.userData.segmentId === 1).length,
                oldStaticVisible: [...(window._segmentStaticRoots.get(0) || [])].filter(o => o.visible).length,
                instanceMismatches: window._segmentInstanceRegistry.filter(entry => entry.mesh.count !== entry.segmentIds.filter(id => !Number.isInteger(id) || id < 0 || id === active || id === window._previewSegmentId).length).length,
                inputLocked: window._segmentInputLocked,
            };
        });
        assert(after.active === 1 && after.sealed0, 'the first threshold did not activate segment 1 and seal segment 0');
        assert(!after.fog0, 'strict segment cull resurrected the disabled sealed-segment fog footprint');
        assert(after.liveOldMonsters === 0 && after.liveOldLoot === 0, 'sealed entities remain in live simulation arrays');
        assert(after.oldStaticVisible === 0, 'sealed static meshes remain visible');
        assert(after.instanceMismatches === 0, 'instance buffers still contain sealed geometry');
        assert(after.inputLocked === false, 'transition left player input locked');

        await engine.evaluate(() => window._stageDungeonSegment(2));
        await engine.waitForFunction(() => window._segmentStageReady(2), null, { timeout: 30000 });
        const genericGateReady = await engine.evaluate(() => {
            const gate = window._segmentGates.find(g => g.segmentFrom === 1 && g.segmentTo === 2);
            gate._stageRequested = true; gate._stageAt = performance.now() - 700;
            gate.openTarget = true; window._previewSegmentId = 2;
            for (let i = 0; i < 50; i++) window._tickDungeonSegments(0.016);
            return { openAmt:gate.openAmt, types:gate.srcTiles.map(([x,z]) => window.Engine8.map[x]?.[z]?.type) };
        });
        assert(genericGateReady.openAmt > 0.64 && genericGateReady.types.every(type => type !== 'wall'), `ordinary segment gate did not open: ${JSON.stringify(genericGateReady)}`);
        const genericDestination = await engine.evaluate(() => {
            const gate = window._segmentGates.find(g => g.segmentFrom === 1 && g.segmentTo === 2);
            for (const [x,z] of gate.srcTiles) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const cell = window.Engine8.map[x + dx]?.[z + dz];
                if (cell && cell.segmentId === 2 && cell.type !== 'wall') return { x:(x + dx) * 2, z:(z + dz) * 2 };
            }
            return null;
        });
        assert(genericDestination, 'could not find the segment-2 side of the ordinary gate');
        const genericBuffer = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            for (let i = 0; i < 8; i++) window._tickDungeonSegments(0.016);
            const tr = window._segmentTransition;
            const gate = window._segmentGates.find(g => g.segmentFrom === 1 && g.segmentTo === 2);
            return {
                active:window._activeSegmentId, tileSegment:window._segmentIdAtWorld(window.px, window.pz), transitioning:!!tr,
                preview:window._previewSegmentId, inputLocked:window._segmentInputLocked,
                state2:window._dungeonSegments.find(s => s.id === 2)?.state,
                staged2:(window._segmentStagedWrappers.get(2) || []).length,
                oldStaticVisible:[...(window._segmentStaticRoots.get(1) || [])].filter(o => o.visible).length,
                gateTypes:gate.srcTiles.map(([x,z]) => window.Engine8.map[x]?.[z]?.type),
            };
        }, genericDestination);
        assert(genericBuffer.active === 2 && genericBuffer.tileSegment === 2 && genericBuffer.transitioning && genericBuffer.preview == null && genericBuffer.oldStaticVisible === 0, `ordinary gate lost strict destination-only activation: ${JSON.stringify(genericBuffer)}`);
        assert(genericBuffer.state2 === 'active' && genericBuffer.staged2 === 0, `ordinary destination content stayed staged after crossing: ${JSON.stringify(genericBuffer)}`);
        assert(genericBuffer.inputLocked === false && genericBuffer.gateTypes.every(type => type !== 'wall'), `ordinary buffered gate locked movement/collision: ${JSON.stringify(genericBuffer)}`);
        const dyingTransition = await engine.evaluate(() => {
            const w = window.monsterWrappers.find(mon => mon.userData.segmentId === 2 && !mon.userData.isDead);
            if (!w) return { skipped:true };
            window.__segmentSmokeDyingId = w.userData.id;
            window.__segmentSmokeDyingWrapper = w;
            const result = window._debugKillMonster(w.userData.id);
            return { skipped:false, id:w.userData.id, result, registered:window._dyingDebug().some(d => d.id === w.userData.id), aiOwned:!!w.userData._aiOwned, agentRegistered:!!window._monsterAI?.agents?.has(w) };
        });
        assert(dyingTransition.skipped || dyingTransition.registered, `could not register transition death job: ${JSON.stringify(dyingTransition)}`);

        const genericReturn = await engine.evaluate(() => {
            const gate = window._segmentGates.find(g => g.segmentFrom === 1 && g.segmentTo === 2);
            for (const [x,z] of gate.srcTiles) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const cell = window.Engine8.map[x + dx]?.[z + dz];
                if (cell && cell.segmentId === 1 && cell.type !== 'wall') return { x:(x + dx) * 2, z:(z + dz) * 2 };
            }
            return null;
        });
        assert(genericReturn, 'could not find the segment-1 retreat side of the ordinary gate');
        const cancelled = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            for (let i = 0; i < 3; i++) window._tickDungeonSegments(0.016);
            return {
                active:window._activeSegmentId, transitioning:!!window._segmentTransition, preview:window._previewSegmentId,
                state2:window._dungeonSegments.find(s => s.id === 2)?.state,
                liveSegment2:window.monsterWrappers.filter(w => w.userData.segmentId === 2).length,
                stagedSegment2:(window._segmentStagedWrappers.get(2) || []).length,
                dyingStillRegistered:window.__segmentSmokeDyingId == null ? false : window._dyingDebug().some(d => d.id === window.__segmentSmokeDyingId),
                dyingStillStaged:window.__segmentSmokeDyingId == null ? false : (window._segmentStagedWrappers.get(2) || []).some(w => w.userData.id === window.__segmentSmokeDyingId),
                dyingAgentStillRegistered:window.__segmentSmokeDyingWrapper == null ? false : !!window._monsterAI?.agents?.has(window.__segmentSmokeDyingWrapper),
            };
        }, genericReturn);
        assert(cancelled.active === 1 && !cancelled.transitioning && cancelled.preview === 2 && cancelled.state2 === 'staged', `retreat did not roll back segment ownership: ${JSON.stringify(cancelled)}`);
        assert(cancelled.liveSegment2 === 0, `retreat left destination monsters live: ${JSON.stringify(cancelled)}`);
        assert(!cancelled.dyingStillRegistered && !cancelled.dyingStillStaged && !cancelled.dyingAgentStillRegistered, `retreat retained a disposed/stale dying wrapper or AI agent: ${JSON.stringify({ dyingTransition, cancelled })}`);
        await engine.evaluate(() => { delete window.__segmentSmokeDyingId; delete window.__segmentSmokeDyingWrapper; });
        const recrossed = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            for (let i = 0; i < 8; i++) window._tickDungeonSegments(0.016);
            return { active:window._activeSegmentId, transitioning:!!window._segmentTransition, preview:window._previewSegmentId };
        }, genericDestination);
        assert(recrossed.active === 2 && recrossed.transitioning && recrossed.preview == null, `ordinary gate did not reactivate with strict destination-only rendering after a safe retreat: ${JSON.stringify(recrossed)}`);
        const genericClearance = await engine.evaluate(() => {
            const tr = window._segmentTransition;
            let best = null;
            for (let x = 0; x < window.Engine8.map.length; x++) for (let z = 0; z < (window.Engine8.map[x]?.length || 0); z++) {
                const cell = window.Engine8.map[x][z];
                if (!cell || cell.segmentId !== 2 || cell.type === 'wall') continue;
                const wx = x * 2, wz = z * 2;
                const normalDistance = ((tr.normalAxis === 'x' ? wx - tr.center.x : wz - tr.center.z) * tr.normalSign);
                if (!best || normalDistance > best.normalDistance) best = { x:wx, z:wz, normalDistance, required:2 * tr.clearTiles };
            }
            return best;
        });
        assert(genericClearance && genericClearance.normalDistance >= genericClearance.required, `could not clear ordinary segment gate: ${JSON.stringify(genericClearance)}`);
        const genericPacing = await engine.evaluate(pos => {
            window.px = pos.x; window.pz = pos.z;
            const tr = window._segmentTransition, gate = tr.gate;
            tr.t = tr.bufferSec; tr.clearT = tr.clearHoldSec;
            window._tickDungeonSegments(0.016);
            const start = gate.openAmt;
            for (let i = 0; i < 18; i++) window._tickDungeonSegments(0.016);
            return { start, after300ms:gate.openAmt, closing:tr.closing, transitioning:!!window._segmentTransition };
        }, genericClearance);
        assert(genericPacing.closing && genericPacing.transitioning && genericPacing.after300ms > genericPacing.start * 0.75, `ordinary door still slams during its first 300ms: ${JSON.stringify(genericPacing)}`);
        const afterGeneric = await engine.evaluate(() => {
            for (let i = 0; i < 160; i++) window._tickDungeonSegments(0.016);
            const active = window._activeSegmentId;
            return {
                active, transitioning:!!window._segmentTransition, sealed1:window._sealedSegmentIds.has(1),
                fog1:window._segmentFogMeshes.get(1)?.visible === true, inputLocked:window._segmentInputLocked,
                instanceMismatches:window._segmentInstanceRegistry.filter(entry => entry.mesh.count !== entry.segmentIds.filter(id => !Number.isInteger(id) || id < 0 || id === active || id === window._previewSegmentId).length).length,
            };
        });
        assert(afterGeneric.active === 2 && !afterGeneric.transitioning && afterGeneric.sealed1 && !afterGeneric.fog1, `ordinary doorway did not finish its strict eased seal: ${JSON.stringify(afterGeneric)}`);
        assert(afterGeneric.inputLocked === false && afterGeneric.instanceMismatches === 0, `ordinary doorway left input/geometry state inconsistent: ${JSON.stringify(afterGeneric)}`);
        await page.screenshot({ path: '/tmp/origami-segment-after.png' });

        if (pageErrors.length) throw new Error(`uncaught page errors:\n${pageErrors.join('\n')}`);
        console.log('[smoke:segments] OK', JSON.stringify({ before, closePacing, cabCancelled, cabReopen, after, cancelled, genericPacing, afterGeneric }));
    } catch (error) {
        console.error('[smoke:segments] FAIL', error.stack || error.message);
        if (pageErrors.length) console.error(pageErrors.join('\n'));
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (server) await new Promise(resolve => server.close(resolve));
    }
})();
