#!/usr/bin/env node
/**
 * probe-a11y-registry.js — falsification gate for js/v8/a11y/A11yRegistry.js (playbook P2).
 *
 * Proves, in the booted game:
 *   1. WIRING   — panels-side A11Y_QUERY postMessage round-trips to an A11Y_RESULT (shell relay
 *                 whitelist + engine handler both live; a missing case dies silently by design).
 *   2. TRUTH    — registry floor-scope counts equal the LIVE collections counted independently
 *                 in the engine frame (monsters alive, unbroken props, loot on floor, rooms).
 *   3. FRESHNESS (the staleness red-run) — smash a pot via the engine's own breaker, re-query,
 *                 and the record MUST be gone. A cached/mirrored registry fails here — this is
 *                 the probe's deliberate-break equivalent: it falsifies the lazy-scan claim.
 *   4. CONTRACT — every record carries the stable shape {id,type,nameEn,nameJa,roomId,x,z,dist,actions}.
 *
 * Usage: node scripts/probe-a11y-registry.js   (needs the :5501 server; foreground only)
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
    const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(12000);

    const pan = p.frames().find(f => /Panels\.html/.test(f.url()));
    const eng = p.frames().find(f => /Engine9\.html/.test(f.url()));
    const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

    // ── 1. WIRING: real postMessage round-trip from the panels frame ────────────
    const rt = await pan.evaluate(() => new Promise(resolve => {
        const reqId = 'probe-' + Math.random().toString(36).slice(2);
        const to = setTimeout(() => resolve({ ok: false, error: 'timeout — A11Y_RESULT never arrived' }), 8000);
        window.addEventListener('message', function h(e) {
            const d = e.data || {};
            if (d.type === 'A11Y_RESULT' && d.reqId === reqId) {
                clearTimeout(to); window.removeEventListener('message', h);
                resolve({ ok: d.ok, counts: d.result && d.result.counts, n: d.result && d.result.records.length,
                          playerRoom: d.result && d.result.playerRoom, sample: d.result && d.result.records.slice(0, 3) });
            }
        });
        window.parent.postMessage({ type: 'A11Y_QUERY', source: 'panels', reqId, q: { scope: 'floor' } }, '*');
    }));
    if (!rt.ok) fail('round-trip: ' + (rt.error || JSON.stringify(rt)));
    else console.log(`✓ round-trip: ${rt.n} records, counts=${JSON.stringify(rt.counts)}, room="${rt.playerRoom && rt.playerRoom.roomNameEn}"`);

    // ── 2. TRUTH: independent live counts from inside the engine frame ──────────
    const truth = await eng.evaluate(() => ({
        monsters: (window.monsterWrappers || []).filter(w => w.userData && !w.userData.isDead).length,
        props: (window._dungeonBreakableDescriptors || []).filter(d => d && !d.broken).length,
        loot: (window.lootItems || []).filter(m => m && m.userData).length,
        rooms: (window._a11yHandles && window._a11yHandles.rooms || []).length,
        regMonsters: window.A11yRegistry ? window.A11yRegistry.query({ scope: 'floor', type: 'monster' }).records.length : -1,
        regProps: window.A11yRegistry ? window.A11yRegistry.query({ scope: 'floor', type: 'prop' }).records.length : -1,
        regLoot: window.A11yRegistry ? window.A11yRegistry.query({ scope: 'floor', type: 'loot' }).records.length : -1,
        regRooms: window.A11yRegistry ? window.A11yRegistry.query({ scope: 'floor', type: 'room' }).records.length : -1,
    }));
    for (const k of ['monsters', 'props', 'loot', 'rooms']) {
        const reg = truth['reg' + k[0].toUpperCase() + k.slice(1)];
        if (reg !== truth[k]) fail(`${k}: registry=${reg} live=${truth[k]}`);
        else console.log(`✓ ${k}: registry==live (${reg})`);
    }

    // ── 3. FRESHNESS: smash a pot with the engine's own breaker, re-query ──────
    const fresh = await eng.evaluate(() => {
        // Any breakable kind will do — floor 1 can roll zero pots (beds/barrels only), and the
        // staleness red-run MUST execute for the probe to count as proof.
        const d = (window._dungeonBreakableDescriptors || []).find(x => x && !x.broken);
        if (!d) return { skip: 'no unbroken breakable on this floor' };
        const before = window.A11yRegistry.query({ scope: 'floor', type: 'prop' }).records.length;
        const hadId = window.A11yRegistry.query({ scope: 'floor', type: 'prop' }).records.some(r => r.id === d.id);
        if (typeof window._breakDungeonProp === 'function') window._breakDungeonProp(d);
        else d.broken = true;   // fallback: the descriptor flag IS the ground truth the registry reads
        const after = window.A11yRegistry.query({ scope: 'floor', type: 'prop' }).records.length;
        const stillThere = window.A11yRegistry.query({ scope: 'floor', type: 'prop' }).records.some(r => r.id === d.id);
        return { id: d.id, before, after, hadId, stillThere };
    });
    if (fresh.skip) console.log('~ freshness: ' + fresh.skip);
    else if (!fresh.hadId) fail('freshness: target pot never appeared in the registry');
    else if (fresh.stillThere || fresh.after !== fresh.before - 1)
        fail(`freshness (STALENESS): smashed ${fresh.id} but registry still lists it (${fresh.before}→${fresh.after})`);
    else console.log(`✓ freshness: ${fresh.id} smashed → gone next query (${fresh.before}→${fresh.after})`);

    // ── 4. CONTRACT: record shape ───────────────────────────────────────────────
    const shape = await eng.evaluate(() => {
        const recs = window.A11yRegistry.query({ scope: 'floor' }).records;
        const REQ = ['id', 'type', 'nameEn', 'nameJa', 'roomId', 'x', 'z', 'dist', 'actions'];
        const bad = recs.filter(r => REQ.some(k => !(k in r)) || !Array.isArray(r.actions));
        return { total: recs.length, bad: bad.length, sample: bad.slice(0, 2) };
    });
    if (shape.bad) fail(`contract: ${shape.bad}/${shape.total} records missing required fields ${JSON.stringify(shape.sample)}`);
    else console.log(`✓ contract: all ${shape.total} records carry the stable shape`);

    if (errs.length) fail('pageerrors: ' + errs.join(' | '));
    await b.close();
    console.log(process.exitCode ? 'PROBE FAIL' : 'PROBE PASS');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
