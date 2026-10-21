/* A11yRegistry.js — the unified accessibility object registry (WCAG playbook P2, Mark GO 2026-08-14). [REF#AY-00001]
 *
 * WHY: the chat command rail (Panels _vcDetectIntent → FPV_CHAT_COMMAND → Engine9 executor) can only
 * resolve MONSTERS by name — gates, loot, props, machines, rooms and permits are invisible to a
 * text-only player. This registry is the one query surface that joins all seven collections so any
 * verb can address any object. Spec: plans/WCAG_22_AA_PLAYBOOK.md §2a.
 *
 * DESIGN — LAZY SCAN (approved): query() is a PURE READ over the live engine collections at call
 * time. No mirror state, no spawn/death hooks, no per-frame work (never-throttle law), no desync
 * bug class. Called only from user-initiated message handlers (A11Y_QUERY, FPV_CHAT_COMMAND), i.e.
 * at human command frequency. Never call this from the rAF loop.
 *
 * LOADING: classic script tag in NewOrigami.Engine9.html (same idiom as DungeonChain.js). It only
 * READS window handles at query time, so load order is safe — every handle is optional-chained and
 * a missing collection simply contributes zero records (early boot, mid-descent).
 *
 * BILINGUAL: rooms carry real JA names from the generator; props/gates carry inline JA type labels.
 * Monsters/loot expose nameKey/_canonicalId so the panels side (which owns EntityCatalog + i18n)
 * can enrich JA display names — the engine iframe deliberately does not load i18n.js.
 *
 * Record shape (stable contract — probes assert it):
 *   { id, type, nameEn, nameJa, nameKey, roomId, roomNameEn, roomNameJa, x, z, dist, state, actions }
 *   type ∈ 'monster'|'loot'|'prop'|'gate'|'machine'|'room'|'permit'   ('trap' reserved, none exist)
 *
 * STREAMING HONESTY (body count ≠ occupancy — memory law 2026-08-05): monsterWrappers holds only
 * BUILT monsters; far, unstreamed sections read empty. The registry truthfully reports what exists
 * right now — a floor query near boot can honestly say "1 monster" while mobSpawns holds dozens
 * pending. Narration built on this must say "that I can see" for monsters, never "on this floor".
 */
(function () {
    'use strict';

    const JA_TYPE = { pot: '壺', bed: '寝床', barrel: '樽', gate: '関門' };

    // ── helpers ──────────────────────────────────────────────────────────────── [REF#AY-00002]
    // UNITS: every record's x/z/dist is in TILE units. Monsters/loot/player positions are WORLD
    // units (world = tile * GRID — see _buildBreakableInstanceMesh d.x*GRID); props/gates/rooms are
    // already tiles. GRID comes through window._a11yHandles (Engine9 export block).
    function H() { return window._a11yHandles || {}; }
    function grid() { const g = H().GRID; return (typeof g === 'number' && g > 0) ? g : 1; }
    function playerPos() {
        // px/pz are module-locals mirrored onto window via defineProperty (Engine9 export block). WORLD units. [REF#AY-00003]
        const g = grid();
        const x = (typeof window.px === 'number') ? window.px / g : 0;
        const z = (typeof window.pz === 'number') ? window.pz / g : 0;
        return { x, z };
    }
    function roomsArr() {
        const r = H().rooms;
        return Array.isArray(r) ? r : [];
    }
    function roomAt(gx, gz) {
        for (const r of roomsArr()) {
            if (gx >= r.x && gx < r.x + r.w && gz >= r.y && gz < r.y + r.h) return r;
        }
        return null;
    }
    function roomNames(r) {
        return r ? { roomId: r.id, roomNameEn: r.roomNameEn || r.roomName || ('Room ' + r.id), roomNameJa: r.roomName || '' }
                 : { roomId: -1, roomNameEn: '', roomNameJa: '' };
    }
    function norm(s) { return String(s || '').toLowerCase().normalize('NFKC').trim(); }
    function nameMatches(rec, needle) {
        if (!needle) return true;
        const n = norm(needle);
        if (norm(rec.nameEn).includes(n) || norm(rec.nameJa).includes(n)
            || norm(rec.nameKey).includes(n) || norm(rec.id).includes(n)) return true;
        // ALIASES — the words a player actually types. The tests above ask whether the record's own [REF#AY-00004]
        // name CONTAINS the query, which fails the common case in the other direction: a machine
        // named "vending" never matched the query "vending machine", and nothing matched "soda".
        // Each alias is tested both ways so a longer query still resolves. [REF#AY-00004]
        if (Array.isArray(rec.aliases)) {
            for (const a of rec.aliases) {
                const A = norm(a);
                if (A && (A.includes(n) || n.includes(A))) return true;
            }
        }
        return false;
    }
    function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

    // ── per-collection readers (each optional-chained; missing == zero records) ─ [REF#AY-00004]
    function readMonsters(out) {
        const arr = window.monsterWrappers || [];
        for (const w of arr) {
            const ud = w && w.userData; if (!ud || ud.isDead) continue;
            const g = grid();
            const gx = ((w.position && w.position.x) || 0) / g, gz = ((w.position && w.position.z) || 0) / g;
            const room = (typeof ud.aiRoomId === 'number' && ud.aiRoomId >= 0)
                ? roomsArr().find(r => r.id === ud.aiRoomId) : roomAt(gx, gz);
            out.push(Object.assign({
                id: ud.id || ('monster-' + out.length), type: 'monster',
                nameEn: ud.name || ud.nameKey || 'monster', nameJa: '', nameKey: ud.nameKey || '',
                x: gx, z: gz,
                state: ud.isAlly ? 'ally' : (ud.aiState === 'sleep' || ud.isAsleep) ? 'asleep'
                     : (ud.hp <= (ud.maxHp || 1) * 0.35) ? 'wounded' : (ud.isHostile ? 'hostile' : 'neutral'),
                actions: ['LOOK', 'WALK_TO', 'TALK', 'GAMBLE', 'SPARE', 'PARLEY', 'ATTACK'],
            }, roomNames(room)));
        }
    }
    function readLoot(out) {
        const arr = window.lootItems || [];
        for (let i = 0; i < arr.length; i++) {
            const m = arr[i]; const ud = m && m.userData; if (!ud) continue;
            const g = grid();
            const gx = ((m.position && m.position.x) || 0) / g, gz = ((m.position && m.position.z) || 0) / g;
            out.push(Object.assign({
                id: (ud._canonicalId || 'card') + '@' + i, type: 'loot',
                nameEn: ud._canonicalId || ud.cardName || 'card',
                nameJa: (ud.cardName && ud.cardName !== ud._canonicalId) ? ud.cardName : '',
                nameKey: ud._canonicalId || '',
                x: gx, z: gz,
                state: ud.isShopItem ? ('for sale' + (ud.price ? ' ' + ud.price + 'g' : '')) : 'on the floor',
                actions: ['LOOK', 'WALK_TO', 'PICK_UP'],
            }, roomNames(roomAt(gx, gz))));
        }
    }
    function readProps(out) {
        const arr = window._dungeonBreakableDescriptors || [];
        for (const d of arr) {
            if (!d || d.broken) continue;
            const room = roomsArr().find(r => r.id === d.roomId) || roomAt(d.x, d.z);
            out.push(Object.assign({
                id: d.id, type: 'prop',
                nameEn: d.kind || 'prop', nameJa: JA_TYPE[d.kind] || '', nameKey: d.kind || '',
                x: d.x, z: d.z,
                state: 'intact',
                actions: (d.kind === 'bed') ? ['LOOK', 'WALK_TO', 'SLEEP'] : ['LOOK', 'WALK_TO', 'SMASH'],
            }, roomNames(room)));
        }
    }
    function readGates(out) {
        // DOORS WERE DELETED 2026-08-25 ("remove all doors from game"), so there is no door to [REF#AY-00005]
        // announce — what still gates progress is the ring SECTION GATE, which seals a section until
        // it is cleared. Gates are TILES, not objects: ids are synthesized from grid coords
        // (playbook §2a). Ordinary doorways are plain openings and need no entry; a screen reader
        // does not have to be told about a hole in a wall it can already walk through.
        const gates = window._sectionGateTiles;
        const map = window.map;
        const lvl = H().level || 1;
        if (gates && typeof gates.forEach === 'function') {
            gates.forEach(key => {
                const [gx, gz] = String(key).split(',').map(Number);
                if (!isFinite(gx) || !isFinite(gz)) return;
                const cell = (map && map[gx]) ? map[gx][gz] : null;
                const signEn = cell && (cell.signEn || ''); const signJa = cell && (cell.sign || '');
                out.push(Object.assign({
                    id: 'gate-L' + lvl + '-' + gx + '-' + gz, type: 'gate',
                    nameEn: signEn || 'section gate', nameJa: signJa || JA_TYPE.gate, nameKey: 'gate',
                    x: gx, z: gz,
                    state: 'sealed',
                    actions: ['LOOK', 'WALK_TO'],   // a gate opens when its section clears — walking there is all you can do [REF#AY-00006]
                }, roomNames(roomAt(gx, gz))));
            });
        }
    }
    // MachineInteraction registers machines by internal kind ('vending' | 'slot', ~:27), and the [REF#AY-00102]
    // registry published that key as the player-facing name — so "vending machine", "slot machine"
    // and "soda" all answered '⚠️ Nothing named X found' (T1 battery run 1, defect 4). These are the
    // words a kid types; BUY/USE already walk the player to whatever resolves (Engine9 ~:81042).
    const MACHINE_NAMES = {
        vending: { en: 'vending machine', ja: '自動販売機',
            aliases: ['vending machine', 'vending', 'soda machine', 'soda', 'soda can', 'drink machine',
                      'drinks', 'drink', 'pop machine', 'snack machine', 'snacks', 'konbini machine',
                      'ジュース', '自販機', '飲み物'] },
        slot: { en: 'slot machine', ja: 'スロットマシン',
            aliases: ['slot machine', 'slot machines', 'slots', 'slot', 'fruit machine', 'pachinko',
                      'one armed bandit', 'gambling machine', 'スロット', 'パチンコ'] },
        machine: { en: 'machine', ja: '機械', aliases: ['machine'] },
    };
    function readMachines(out) {
        const MI = window.MachineInteraction;
        const reg = MI && MI._registry;
        if (!reg || typeof reg.forEach !== 'function') return;
        reg.forEach((entry, id) => {
            if (!entry) return;
            const o = entry.object3D;
            const g = grid();
            const gx = ((o && o.position && o.position.x) || 0) / g, gz = ((o && o.position && o.position.z) || 0) / g;
            const M = MACHINE_NAMES[entry.kind] || null;
            out.push(Object.assign({
                id: String(id), type: 'machine',
                nameEn: (M && M.en) || entry.kind || String(id),
                nameJa: (M && M.ja) || '',
                nameKey: entry.kind || '',
                aliases: (M && M.aliases) || [],
                x: gx, z: gz,
                state: 'ready',
                actions: ['LOOK', 'WALK_TO', 'USE'],
            }, roomNames(roomAt(gx, gz))));
        });
    }
    function readRooms(out) {
        for (const r of roomsArr()) {
            const cx = (typeof r.cx === 'number') ? r.cx : r.x + r.w / 2;
            const cz = (typeof r.cz === 'number') ? r.cz : r.y + r.h / 2;
            out.push({
                id: 'room-' + r.id, type: 'room',
                nameEn: r.roomNameEn || r.roomName || ('Room ' + r.id),
                nameJa: r.roomName || '', nameKey: r.roomType || '',
                roomId: r.id, roomNameEn: r.roomNameEn || '', roomNameJa: r.roomName || '',
                x: cx, z: cz,
                state: (window._isRoomActivated && r.roomType && window._isRoomActivated(r.id)) ? 'activated' : '',
                actions: ['LOOK', 'GO_TO_ROOM'],
            });
        }
    }

    // ── the query surface ────────────────────────────────────────────────────── [REF#AY-00007]
    const READERS = {
        monster: readMonsters, loot: readLoot, prop: readProps,
        gate: readGates, machine: readMachines, room: readRooms,
    };

    const A11yRegistry = {
        /** Pure read. opts: {scope:'nearby'|'room'|'floor', type?, name?, radius?} [REF#AY-00008] */
        query(opts) {
            const o = opts || {};
            const scope = o.scope || 'nearby';
            const radius = (typeof o.radius === 'number') ? o.radius : 8;
            const p = playerPos();
            const here = roomAt(Math.round(p.x), Math.round(p.z));

            const out = [];
            const types = o.type ? [o.type] : Object.keys(READERS);
            for (const t of types) { const r = READERS[t]; if (r) { try { r(out); } catch (_) {} } }

            let recs = out;
            if (o.name) recs = recs.filter(rec => nameMatches(rec, o.name));
            if (scope === 'room' && here) recs = recs.filter(rec => rec.type === 'room' ? rec.roomId === here.id : rec.roomId === here.id);
            else if (scope === 'nearby') recs = recs.filter(rec => rec.type === 'room' || dist2(rec.x, rec.z, p.x, p.z) <= radius * radius);

            for (const rec of recs) rec.dist = Math.round(Math.sqrt(dist2(rec.x, rec.z, p.x, p.z)) * 10) / 10;
            recs.sort((a, b) => a.dist - b.dist);
            return {
                records: recs,
                player: { x: p.x, z: p.z },
                playerRoom: roomNames(here),
                counts: recs.reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {}),
            };
        },
    };

    window.A11yRegistry = A11yRegistry;
})();
