/** [REF#EN-00405]
 * VendingMachine.js — The Interactive 3D Vending Machine Module
 * 
 * Modular ES6 Class for the Vending Machine shop entity, spawned on Floor 1 Foyer.
 * Handles 3D mesh building, dynamic LCD canvas textures, custom button states,
 * synthesized AudioContext sound effects (hum, click, buzzer, dispense),
 * and hooks for postMessage Oni-Baba transactions.
 */

const THREE = window.THREE;

import { MasterCardDatabase } from '../core/CardDatabase.js?v=8.4.2071-head-dog-food';   // ⚠ CACHE-BUST REQUIRED: this import had NO ?v= token, so the browser pinned CardDatabase.js by FILENAME forever — every card added or corrected shipped to git and never reached the running game. Same trap EntityCatalog.js hit (see the note beside its import in PlayerGuide.js). BUMP THIS whenever CardDatabase.js changes. [REF#EN-00406]
import {
    GLASS_BUBBLE_GEO as _sharedGlassBubbleGeo,
    GLASS_BUBBLE_MAT as _sharedGlassBubbleMat,
    getCardThemeColor,
    getCardEdgeColor,
    buildLegacyCardCanvas,
    buildLegacyLootIcon
} from './LootCardBuilder.js?v=8.4.2071-head-dog-food';   // ⚠ SAME TRAP THE CardDatabase.js NOTE ABOVE DESCRIBES, [REF#EN-00576]
// eight lines further down and missed at the time. Engine9.html:4625 imports this file WITH that token; importing it [REF#EN-00577]
// bare here made a second copy, so GLASS_BUBBLE_GEO/GLASS_BUBBLE_MAT — aliased `_sharedGlassBubbleGeo`/`_sharedGlassBubbleMat`
// precisely because they are meant to be ONE — measured as two distinct THREE uuids on 2026-08-29, i.e. a second
// geometry and a second material (a second shader program) on the GPU. `_canvasCache` and the bow textures doubled too.
// KEEP THIS IN LOCKSTEP WITH Engine9.html:4625.

// Module-level caches for card geometries to avoid GC churn & redundant allocations [REF#EN-00407]
let _sharedCardEdgeGeo = null;
let _sharedCardPlaneGeo = null;
let _cardMaterialCache = {};

// Listen to parent LOCALE_CHANGE event to reset cached mini card materials [REF#EN-00408]
if (typeof window !== 'undefined') {
    window.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.type === 'LOCALE_CHANGE') {
            _cardMaterialCache = {};
        }
    });
}

// ── Self-contained LCD localization (Worker B 2026-06-05) ────────────────── [REF#EN-00409]
// The vending machine draws its OWN 3D LCD; localize its messages here rather
// than in the concurrently-edited central js/data/i18n.js. EN = inline
// fallback (never blank); JA from this dict. The LCD font already renders
// Japanese (the existing 金欠 message proves it). Product names route through
// the central tCard() so the dispensed item shows its translated card name.
const VM_I18N = {
    ja: {
        'lcd.each': '1個 130G',   // fallback only — _vmLcdEach() computes the live per-floor price [REF#EN-00410]
        'lcd.sold_out': '売り切れ',
        'lcd.dispensing': '排出中...',
        'msg.no_gold': 'ゴールドがたりない！',   // floating combat text on a rejected buy (Mark 2026-07-18) [REF#EN-00411]
    },
};
function _vmL(key, en) {
    const lang = (typeof window !== 'undefined' && window.currentLang) || 'en';
    if (lang !== 'en' && VM_I18N[lang] && VM_I18N[lang][key] != null) return VM_I18N[lang][key];
    return en;
}
// LCD idle line — the real price for THIS floor. The three call sites hardcoded "25G EACH" (and the JA dict [REF#EN-00412]
// '1個 25G'), which was already false at the flat 130 and becomes absurd at 260/520/1040. Mark 2026-07-19.
function _vmLcdEach(dungeonLevel) {
    try {
        const p = VEND_PRICE(dungeonLevel || 1, false);
        const lang = (typeof window !== 'undefined' && window.currentLang) || 'en';
        return (lang === 'ja') ? ('1個 ' + p + 'G') : (p + 'G EACH');
    } catch (_) { return _vmL('lcd.each', '130G EACH'); }
}
function _vmCardName(name) {
    try {
        if (typeof window !== 'undefined' && typeof window.tCard === 'function') {
            const loc = window.tCard(String(name).toLowerCase().replace(/\s+/g, '_'));
            if (loc && loc.name) return loc.name;
        }
    } catch (_) {}
    return name;
}

// Procedural Card pool for Floors 2+ [REF#EN-00413]
// FLAT PRICE (Mark 2026-07-16: "make sure that vending machine needs 130 gold even for heal potions.
// for each card."). Every slot — card, rare card, heal potion, floor 1 or floor 9 — costs the SAME.
// Was five scattered literals (25 on floor 1, isRare?20:10 on floor 2+, 10 for potions, 10 for the
// mandatory-heal slots), which made the machine cheaper than a single gold drop. Paired with the
// 2026-07-16 scarcity economy (25g × level per drop, 20% drop chance): ~5+ successful drops on floor 1
// to afford one item, so the machine is a real decision instead of pocket change.
// Live-tune: window._vendPrice.
// ── PRICE BY DEPTH (Mark 2026-07-19: "the loot is better and chance of magical items that are 10x the price
// which is 2x costly per level. so level 2 normal items are 260, and magical items would be 2600 gold").
// WAS: a flat 130 with NO level term at all — a falsification pass confirmed level 1 and level 20 both cost 130,
// and it took no arguments so dungeonLevel could not even reach it. Now base x 2^(level-1), and magical x10 on top.
//   L1 130 / magical 1300   ·   L2 260 / magical 2600   ·   L3 520 / 5200   ·   L4 1040 / 10400
// window._vendPrice pins a flat override (the old behaviour); _vendPriceStep changes the doubling;
// _vendMagicMult changes the 10x.
const VEND_PRICE = (dungeonLevel = 1, magical = false) => {
    if (typeof window !== 'undefined' && typeof window._vendPrice === 'number' && window._vendPrice > 0) return window._vendPrice;
    const base = 130;
    const step = (typeof window !== 'undefined' && typeof window._vendPriceStep === 'number') ? window._vendPriceStep : 2;
    const magM = (typeof window !== 'undefined' && typeof window._vendMagicMult === 'number') ? window._vendMagicMult : 10;
    const lvl  = Math.max(1, (dungeonLevel | 0) || 1);
    return Math.round(base * Math.pow(step, lvl - 1) * (magical ? magM : 1));
};
// ── MAGICAL TIER (Mark 2026-07-19: "chance of magical items"). There was NO rarity concept anywhere in the [REF#EN-00414]
// codebase — the old `isRare` was inferred by SNIFFING the price (`slot.price === 20`), which has been permanently
// false since prices went flat, so the rare styling was unreachable. This is a REAL field on the slot instead, and
// the chance grows with depth so deeper machines genuinely stock better. Knobs: _vendMagicChance, _vendMagicPerLvl.
const VEND_MAGIC_CHANCE = (dungeonLevel = 1) => {
    if (typeof window !== 'undefined' && window._vendMagic === false) return 0;
    const b = (typeof window !== 'undefined' && typeof window._vendMagicChance === 'number') ? window._vendMagicChance : 0.10;
    const k = (typeof window !== 'undefined' && typeof window._vendMagicPerLvl === 'number') ? window._vendMagicPerLvl : 0.05;
    return Math.max(0, Math.min(0.60, b + (Math.max(1, (dungeonLevel | 0) || 1) - 1) * k));
};

// ── STOCK MIX (Mark 2026-07-16: "make more weapons and less skills in vending machine") ────────── [REF#EN-00415]
// Classified per Mark's own ruling that same day ("yes these are skills, same with thrust, slash,
// etc.") — SKILL = the move/technique cards (SLASH/THRUST/HARD ATTACK) and the gambling cards; a
// WEAPON is a physical armament. He asked to trim SKILLS specifically, NOT spells, so the spell pool
// is untouched. POKER is here because he asked for it by name ("Can add POKER CARD in vending machine
// for sale") — it is a SKILL, so it competes inside the (now smaller) skill share rather than being
// bolted on outside the mix.
// The weights below are a STARTING POINT for Mark to veto, not a derived truth — live-tunable via
// window._vendMix = { weapon:0.55, spell:0.30, skill:0.15 }.
const VENDING_WEAPON_CARDS = [
    'KATANA', 'SHORT BOW', 'LONG BOW', 'SHURIKEN', 'SHIELD', 'SAMURAI HELMET'
];
const VENDING_SPELL_CARDS = [
    'FIREBALL', 'GALE', 'BOULDER', 'FISSURE', 'TIDE', 'SURGE', 'COMET', 'PYROBLAST'
];
const VENDING_SKILL_CARDS = [
    'SLASH', 'THRUST', 'HARD ATTACK', 'POKER', 'BLACKJACK'
];
const VENDING_ITEM_CARDS = [
    'MAGIC LANTERN', 'IDENTITY SCROLL', 'ROCKETS',   // ROCKETS: the bazooka's ammunition (2026-09-29) [REF#EN-00800]
    // ARMOUR (Mark 2026-07-19). The machine is where a player deliberately shops for protection, so the [REF#EN-00416]
    // full body set is stocked here: chest 5 · legs 2 · head 1 · arms 1 · feet 1 = AC 10 when complete.
    // Item weight is only 0.15 of the draw and the pool enforces uniqueness, so a machine shows a couple
    // of pieces at most — armour is a hunt across floors, not a one-stop outfit.
    'CHEST ARMOR', 'SAMURAI HELMET', 'GREAVES', 'GAUNTLETS', 'BOOTS', 'SHIELD'
];
const VENDING_MIX = () => {
    const m = (typeof window !== 'undefined' && window._vendMix) || null;
    return {
        weapon: (m && typeof m.weapon === 'number') ? m.weapon : 0.50,   // MORE weapons  ← Mark [REF#EN-00417]
        spell:  (m && typeof m.spell  === 'number') ? m.spell  : 0.28,   // spells not what he asked to trim [REF#EN-00418]
        skill:  (m && typeof m.skill  === 'number') ? m.skill  : 0.14,   // LESS skills   ← Mark [REF#EN-00419]
        item:   (m && typeof m.item   === 'number') ? m.item   : 0.08,   // lantern/scroll stay reachable [REF#EN-00420]
    };
};

// Kept for back-compat: other call sites (and the floor-1 pool below) still reference these names. [REF#EN-00421]
// REGULAR/RARE no longer drive PRICE (flat VEND_PRICE now) — they only survive as name groupings.
const VENDING_REGULAR_CARDS = [
    'FIREBALL', 'GALE', 'SLASH', 'THRUST', 'SHURIKEN', 'SHORT BOW', 'SHIELD', 'IDENTITY SCROLL'
];
const VENDING_RARE_CARDS = [
    'BOULDER', 'FISSURE', 'TIDE', 'SURGE', 'COMET', 'PYROBLAST', 'HARD ATTACK', 'LONG BOW'
];

// ⛔ NEVER OFFER A CARD THE MACHINE CANNOT BUILD (Mark 2026-07-19: "when we added more to the vending [REF#EN-00422]
// machine it crapped out"). `_buildMiniVendingCard` returns null when `MasterCardDatabase[name]` is missing
// (~:180), and the caller's `if (miniCard)` then skips silently — leaving a slot with a NAME, a PRICE and a
// working BUY BUTTON but NO CARD. Measured live: `1:BLACKJACK·NOMESH`, `slots: 8 · with mesh: 7`.
// POKER and BLACKJACK are both in VENDING_SKILL_CARDS (~:124) with no database entry.
// Fixing it HERE rather than by editing the pools is deliberate: it repairs the whole CLASS of bug, so any
// card anyone adds to a pool in future without a DB entry simply isn't offered instead of eating a slot.
// The two names stay in the pool and become drawable automatically the moment they get real entries —
// no invented kanji/desc/attr, no lost shop stock. Logs once per missing name so they stay visible.
const _vmBuildable = (name) => {
    try {
        if (!name) return false;
        if (MasterCardDatabase && MasterCardDatabase[name]) return true;
        if (!_vmBuildable._warned) _vmBuildable._warned = new Set();
        if (!_vmBuildable._warned.has(name)) {
            _vmBuildable._warned.add(name);
            console.warn('[VENDING] "' + name + '" is in a vending pool but has NO MasterCardDatabase entry — skipped so it cannot eat a display slot. Add the entry to make it sellable.');
        }
        return false;
    } catch(_){ return true; }   // database unavailable → don't strand the machine, let the old path decide [REF#EN-00423]
};
// ── THE STOCK FOLLOWS THE GAME'S SEED (2026-09-27, the save rebuild — knowledge/design/SAVE_GAME_2026-09-27.md) ──────────── [REF#PENDING] [REF#EN-00731]
//    Mark's rule stands — ALWAYS RANDOM each game: a new game mints a new root seed, so every playthrough still stocks differently.
//    What changed is a LOAD: it is the same game, and with Math.random every machine re-rolled on the reload, so a card seen
//    before the save was gone and a slot bought empty was full again. The draw now runs on a generator seeded from the game
//    seed + floor + WHERE the cabinet stands (the engine sets window._vendBuildKey to its tile just before building it; the
//    build order is only a fallback — cabinets build as their section streams in, so order is not stable across a load). The
//    same game stocks the same shelves; the save's 'vending' part then marks what was already bought. Off: _vendSeeded = false.
let _vmRng = null;
function _vmRand() { return _vmRng ? _vmRng() : Math.random(); }
function _vmStockRng(dungeonLevel) {
    const w = (typeof window !== 'undefined') ? window : null;
    const key = w ? w._vendBuildKey : null;
    if (w) w._vendBuildKey = null;   // one key per build [REF#EN-00732]
    if (!w || w._vendSeeded === false || w._origamiGameSeed === undefined || w._origamiGameSeed === null) return null;
    const where = key ? String(key) : ('n' + (w._vendBuildN = (w._vendBuildN | 0) + 1));
    let h = 2166136261 >>> 0;
    for (const ch of String(w._origamiGameSeed) + ':vend:L' + dungeonLevel + ':' + where) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    let s = h || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function _drawRandomVendingCard(existingNames) {
    // WEIGHTED BY CLASS (Mark 2026-07-16) — was a flat 25% rare / 75% regular draw across two pools [REF#EN-00424]
    // that mixed weapons, spells and skills together, so the machine skewed skill-heavy by accident.
    const mix = VENDING_MIX();
    const W = VENDING_WEAPON_CARDS, S = VENDING_SPELL_CARDS, K = VENDING_SKILL_CARDS, I = VENDING_ITEM_CARDS;
    const r = _vmRand() * (mix.weapon + mix.spell + mix.skill + mix.item);
    const order = r < mix.weapon ? [W, S, I, K]
                : r < mix.weapon + mix.spell ? [S, W, I, K]
                : r < mix.weapon + mix.spell + mix.skill ? [K, W, S, I]
                : [I, W, S, K];
    // Take the first class that still has an un-stocked card; falls through so a machine never [REF#EN-00425]
    // under-fills just because one class is exhausted.
    for (const pool of order) {
        const available = pool.filter(name => !existingNames.includes(name) && _vmBuildable(name));
        if (available.length) return available[Math.floor(_vmRand() * available.length)];
    }
    // Legacy fallback — every class exhausted; keep the old behaviour rather than return undefined. [REF#EN-00426]
    let pool = _vmRand() < 0.25 ? VENDING_RARE_CARDS : VENDING_REGULAR_CARDS;
    let available = pool.filter(name => !existingNames.includes(name) && _vmBuildable(name));
    if (available.length === 0) {
        let otherPool = pool === VENDING_RARE_CARDS ? VENDING_REGULAR_CARDS : VENDING_RARE_CARDS;
        available = otherPool.filter(name => !existingNames.includes(name) && _vmBuildable(name));
    }
    if (available.length === 0) {
        // LAST RESORT — was a bare `available = VENDING_REGULAR_CARDS`, dropping BOTH the uniqueness filter [REF#EN-00427]
        // AND buildability, so it could return a duplicate or an unbuildable name. Unreachable at 8 slots
        // (21 pool names) but it is the first path a LARGER machine would take — see the multi-machine plan.
        available = VENDING_REGULAR_CARDS.filter(_vmBuildable);
        if (!available.length) return null;   // honest null; the L1 caller already breaks on it [REF#EN-00428]
    }
    return available[Math.floor(_vmRand() * available.length)];
}

function _buildMiniVendingCard(cardName, isShopItem = true, price = 10, dungeonLevel = 1) {
    const data = MasterCardDatabase[cardName];
    if (!data) return null;

    const catId = data.id;
    const inTitle = cardName;
    const desc = data.desc;
    const kanji = data.kanji;
    const attr = data.attr;

    let elId = catId;
    if (inTitle === 'PISTOL' || inTitle === 'MAGIC MISSILE') elId = 'PISTOL';
    if (inTitle === 'MAGIC LANTERN') elId = 'MAGIC_LANTERN';

    // ⚠ KEEP IN SYNC WITH spawnLootCard's _PILL_LABEL (Engine9 ~35089). Two tables, one vocabulary: [REF#EN-00429]
    // the vending machine is the ONLY surface that sells spells, so a pill fixed there and not here
    // leaves the shop reading 'SPELLS' while the floor reads 'SPELL' — and nothing links them.
    const _PILL_LABEL = { MISSILE: 'RANGED', GOLD_COIN: 'GOLD', KATANA: 'MELEE', SPELLS: 'SPELL' };
    let displayTypePill = _PILL_LABEL[catId] || catId.toUpperCase();
    let displayKanji = kanji, displayDesc = desc, displayAttr = attr;
    let title = inTitle;

    // i18n support matching LootCardBuilder.js [REF#EN-00430]
    if (typeof window.tCard === 'function') {
        const _normTitle = String(inTitle || '').toUpperCase()
            .replace(/\s+X\d+$/, '')
            .replace(/\bMAGIC\s+MISSILE\b/, 'PISTOL')
            .replace(/\s+/g, '_')
            .toLowerCase();
        const _aliases = {
            'strong_attack':  'strong_attack',
            'hard_attack':    'strong_attack',
            'magic_lantern':  'magic_lantern',
            'gold_coins':     'gold_coins',
        };
        const _cardId = _aliases[_normTitle] || _normTitle;
        const loc = window.tCard(_cardId);
        if (loc) {
            if (loc.name) title = loc.name;
            if (loc.desc) displayDesc = loc.desc;
            if (loc.attr) displayAttr = loc.attr;
        }
    }

    const themeColor = getCardThemeColor(catId, elId);
    // Per user 2026-05-23: "make all those tiny loot cards have super high [REF#EN-00431]
    // resolution". Mini cards on the vending shelves are 0.13 unit scale,
    // which means each card occupies ~80–100px on screen. Rendering the
    // canvas at 2× DPI gives us a 512×768 source bitmap, so text + edges
    // stay crisp even under aggressive minification without massive GPU upload overhead.
    const resolutionScale = 2;
    
    let cardMat;
    const cacheKey = `${title}||${isShopItem}||${price}||${dungeonLevel}`;
    if (_cardMaterialCache[cacheKey]) {
        cardMat = _cardMaterialCache[cacheKey];
    } else {
        const { canvas } = buildLegacyCardCanvas({
            title, displayKanji, displayDesc, displayAttr,
            displayTypePill, catId, themeColor, isShopItem: false, price, resolutionScale
        });

        // buildLegacyCardCanvas leaves the 2D ctx with a `ctx.scale(N,N)` [REF#EN-00432]
        // transform active, so the post-card price text below uses UNSCALED
        // coordinates — the scale is already applied to the context.
        const ctx = canvas.getContext('2d');
        if (isShopItem) {
            ctx.font = '900 24px sans-serif';
            ctx.fillStyle = dungeonLevel === 1 ? '#ffa500' : '#FFD700';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(price + ' GOLD', 128, 308);
        }

        const tex = new THREE.CanvasTexture(canvas);
        // High-res canvas + mipmaps + anisotropy = no pixelation at any distance. [REF#EN-00433]
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8;

        cardMat = new THREE.MeshStandardMaterial({
            map: tex, transparent: true, alphaTest: 0.5,
            roughness: 1.0, metalness: 0.0
        });
        _cardMaterialCache[cacheKey] = cardMat;
    }

    const cardGroup = new THREE.Group();

    const edgeColor = getCardEdgeColor(elId, catId);
    const edgeMat = new THREE.MeshStandardMaterial({
        color: edgeColor,
        roughness: catId === 'GOLD_COIN' ? 0.2 : 0.5,
        metalness: catId === 'GOLD_COIN' ? 1.0 : 0.0
    });

    if (!_sharedCardPlaneGeo) {
        _sharedCardPlaneGeo = new THREE.PlaneGeometry(0.8, 1.2);
    }

    if (!_sharedCardEdgeGeo) {
        const shape = new THREE.Shape();
        const r = 0.075, w = 0.8, h = 1.2, sx = -w/2, sy = -h/2;
        shape.moveTo(sx, sy + r);
        shape.lineTo(sx, sy + h - r);
        shape.quadraticCurveTo(sx, sy + h, sx + r, sy + h);
        shape.lineTo(sx + w - r, sy + h);
        shape.quadraticCurveTo(sx + w, sy + h, sx + w, sy + h - r);
        shape.lineTo(sx + w, sy + r);
        shape.quadraticCurveTo(sx + w, sy, sx + w - r, sy);
        shape.lineTo(sx + r, sy);
        shape.quadraticCurveTo(sx, sy, sx, sy + r);
        
        const holePath = new THREE.Path();
        holePath.absarc(0, -0.096, 0.1875, 0, Math.PI*2, true);
        shape.holes.push(holePath);

        _sharedCardEdgeGeo = new THREE.ExtrudeGeometry(shape, {depth: 0.02, bevelEnabled: false});
        _sharedCardEdgeGeo.translate(0, 0, -0.01);
    }

    const edgeMesh = new THREE.Mesh(_sharedCardEdgeGeo, edgeMat);
    edgeMesh.matrixAutoUpdate = false;
    edgeMesh.updateMatrix();
    cardGroup.add(edgeMesh);

    const front = new THREE.Mesh(_sharedCardPlaneGeo, cardMat);
    front.position.z = 0.011;
    front.matrixAutoUpdate = false;
    front.updateMatrix();
    const back = new THREE.Mesh(_sharedCardPlaneGeo, cardMat);
    back.rotation.y = Math.PI; back.position.z = -0.011;
    back.matrixAutoUpdate = false;
    back.updateMatrix();
    cardGroup.add(front, back);

    const iconModel = buildLegacyLootIcon({catId, elId, originalTitle: inTitle});
    if (iconModel && iconModel.iconMesh) {
        const iconWrapper = new THREE.Group();
        let EXACT_SCALE = 0.07;
        if (inTitle === 'MAGIC LANTERN') EXACT_SCALE = 0.35;
        const frontIcon = iconModel.iconMesh;
        frontIcon.scale.setScalar(EXACT_SCALE);
        frontIcon.position.set(0, -0.096, 0);
        frontIcon.traverse(child => {
            if(child.isMesh){
                if(child.material && !Array.isArray(child.material)){
                    child.material.transparent = true;
                    child.material.side = THREE.DoubleSide;
                    child.material.needsUpdate = true;
                }
                child.renderOrder = 20;
            }
        });
        frontIcon.matrixAutoUpdate = false;
        frontIcon.updateMatrix();
        iconWrapper.add(frontIcon);

        const glassBubble = new THREE.Mesh(_sharedGlassBubbleGeo, new THREE.MeshStandardMaterial({
            color: 0xe0f0ff,
            transparent: true,
            opacity: 0.35,
            roughness: 1.0,
            metalness: 0.0,
            depthWrite: false
        }));
        glassBubble.position.set(0, -0.096, 0);
        glassBubble.scale.set(1, 1, 0.75);
        glassBubble.renderOrder = 10;
        glassBubble.matrixAutoUpdate = false;
        glassBubble.updateMatrix();
        iconWrapper.add(glassBubble);

        cardGroup.add(iconWrapper);
    }

    cardGroup.scale.setScalar(0.175); // 4 cards in a row — bigger and readable in the cabinet display (2026-05-23) [REF#EN-00434]
    return cardGroup;
}

// ══ MULTI-MACHINE REGISTRY + ONE SHARED ANIMATION DRIVER (2026-07-20) ══════════════════════════════════ [REF#EN-00435]
// Mark: "so we can have many such vending machines next to each other."
// buildVendingMachine() was ALREADY re-entrant — fresh group, fresh slots, correctly shared geo/material
// caches. What blocked N machines was four singletons; this file owns two of them and fixes both here.
// (The other two — window._vendingMachineGroup being a single global, and relocalize only touching it —
//  are handled below and in knowledge/VENDINGMACHINE.md §7.)
// The registry is weak-ish by hand: entries whose group has left the scene are dropped on the next tick,
// so a floor change cannot strand a machine or keep animating a dead one.
window._vendingMachines = window._vendingMachines || [];
function _vmRegister(group){
    try {
        const L = window._vendingMachines;
        if (L.indexOf(group) < 0) L.push(group);
        _vmStartDriver();
    } catch(_){}
}
// Animate ONE machine. Stateless w.r.t. the driver: everything it needs is on userData. [REF#EN-00436]
function _vmAnimateOne(group, time){
    try {
        if (!group || !group.visible) return;
        if (window.camera){
            const _gp = group.getWorldPosition(new THREE.Vector3());
            const _cp = window.camera.getWorldPosition(new THREE.Vector3());
            if (_gp.distanceToSquared(_cp) > 225) return;   // >15wu — skip entirely (per-machine cull) [REF#EN-00437]
        }
        const ud = group.userData || {};
        const cards = ud.cardMeshes || [], slots = ud.slots || [], shelfY = ud.shelfY || 0;
        for (let i = 0; i < cards.length; i++){
            const mesh = cards[i]; if (!mesh) continue;
            const offset = i * 1.5;
            const restY = (mesh.userData && mesh.userData.restY != null) ? mesh.userData.restY : shelfY + 0.10;
            mesh.position.y = restY + Math.sin(time * 1.5 + offset) * 0.025;
            mesh.rotation.x = -0.05 + Math.sin(time * 0.5 + offset) * 0.04;
            mesh.rotation.y = Math.sin(time + offset) * 0.10;
            mesh.rotation.z = Math.cos(time * 0.7 + offset) * 0.04;
        }
        for (let i = 0; i < slots.length; i++){
            const slot = slots[i]; if (!slot || !slot.coilMesh) continue;
            if (slot.isDispensing) slot.coilMesh.rotation.z += 0.2;
            else slot.coilMesh.rotation.z = Math.sin(time * 0.2 + i) * 0.02;
        }
    } catch(_){}
}
let _vmDriverOn = false;
function _vmStartDriver(){
    if (_vmDriverOn) return;                 // exactly ONE loop, no matter how many machines [REF#EN-00438]
    _vmDriverOn = true;
    (function _tick(){
        requestAnimationFrame(_tick);
        const L = window._vendingMachines; if (!L || !L.length) return;
        const t = performance.now() * 0.002;
        for (let i = L.length - 1; i >= 0; i--){
            const g = L[i];
            if (!g){ L.splice(i, 1); continue; }
            // PRUNE ONLY WHAT WAS ONCE IN THE SCENE. The engine calls buildVendingMachine() and adds the [REF#EN-00439]
            // group to the scene AFTERWARDS, so a brand-new machine legitimately has no parent for a few
            // frames. Pruning on `!g.parent` alone deleted the boot machine on the very first tick — the
            // registry read 0 with a machine plainly standing in the cabaret. Latch once it is parented,
            // and only then treat parent-loss as "removed".
            if (g.parent) g.userData._vmSeenInScene = true;
            else if (g.userData && g.userData._vmSeenInScene){ L.splice(i, 1); continue; }
            _vmAnimateOne(g, t);
        }
    })();
}
// Nearest machine to a world point — the honest replacement for reading the _vendingMachineGroup global [REF#EN-00440]
// when several exist. Engine call sites can adopt this incrementally; see VENDINGMACHINE.md §7.
window._vendNearestMachine = function(x, z){
    try {
        const L = window._vendingMachines || []; let best = null, bd = Infinity;
        for (const g of L){
            if (!g || !g.parent) continue;
            const p = g.getWorldPosition(new THREE.Vector3());
            const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
            if (d < bd){ bd = d; best = g; }
        }
        return best || window._vendingMachineGroup || null;
    } catch(_){ return window._vendingMachineGroup || null; }
};
export function buildVendingMachine(dungeonLevel = 1) {
    const group = new THREE.Group();
    group.name = "vending_machine";

    // Worn Japanese cabinet using loaded textures for front, sides, and back [REF#EN-00441]
    // Cabinet 1.7 × 2.4 × 0.9 — aspect 0.708 matches newest-vending-front.jpeg
    // (758×1024 → 0.740), so the photo-real texture maps cleanly without
    // horizontal squash. Cabinet still fits the 2-tile-wide hallway (4 wu)
    // with ~3.1 wu walkway on the west side.
    const cabinetGeo = new THREE.BoxGeometry(1.7, 2.4, 0.9);

    // ── Clean dungeon-aesthetic cabinet (per user 2026-05-22) ── [REF#EN-00442]
    // Dropped the orange "VENDING MACHINE / JAPANESE KANJI" texture and the
    // chroma-keyed window approach — they were burying the controls and
    // washing out under scene lighting. New look: dark gunmetal body with
    // gold accents around the display, matching the dungeon palette.
    const CABINET_DARK = 0x14171c;     // gunmetal blue-black body [REF#EN-00443]
    const CABINET_TRIM = 0x1f242e;     // slightly lighter top/bottom trim [REF#EN-00444]
    const CABINET_GOLD = 0xc8a560;     // muted gold for display frame accents [REF#EN-00445]

    // Side / back textures per user 2026-05-23: orange-tagged right panel, [REF#EN-00446]
    // grey-tagged left panel, Oni-Baba mural across the back.
    // Low metalness + high roughness so the warm lantern light in the hallway
    // doesn't bleach the cabinet (per user 2026-05-22: "keep it out of the
    // light"). Dark albedo absorbs ambient, stays moody under any lantern.
    const _vmTexLoader = new THREE.TextureLoader();
    const _loadCabinetTex = (path) => {
        const t = _vmTexLoader.load(path);
        t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
        t.anisotropy = 8;
        return t;
    };
    const _sideOrangeTex  = _loadCabinetTex('./assets/textures/vending_side_orange.png');
    const _sideGreyTex    = _loadCabinetTex('./assets/textures/vending_side_grey.png');
    const _backOnibabaTex = _loadCabinetTex('./assets/textures/vending_back_onibaba.png');

    const sideMatRight = new THREE.MeshStandardMaterial({
        map: _sideOrangeTex, color: 0xffffff,
        metalness: 0.05, roughness: 0.85, name: "vending_side_right"
    });
    const sideMatLeft = new THREE.MeshStandardMaterial({
        map: _sideGreyTex, color: 0xffffff,
        metalness: 0.05, roughness: 0.85, name: "vending_side_left"
    });
    const topMat = new THREE.MeshStandardMaterial({
        color: CABINET_TRIM, metalness: 0.1, roughness: 0.75, name: "vending_top"
    });
    const bottomMat = new THREE.MeshStandardMaterial({
        color: 0x0a0c10, metalness: 0.05, roughness: 0.95, name: "vending_bottom"
    });
    const backMat = new THREE.MeshStandardMaterial({
        map: _backOnibabaTex, color: 0xffffff,
        metalness: 0.05, roughness: 0.9, name: "vending_back"
    });

    // Front face material — set to invisible. We'll build the FRONT as a [REF#EN-00447]
    // separate ShapeGeometry plane with a real cutout for the display window
    // (and a smaller one for the control panel below) so the buttons + cards
    // are actually visible instead of being hidden behind a textured face.
    const frontMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
        name: "vending_front_hidden"
    });

    const cabinetMaterials = [
        sideMatRight, // +X right — orange-tagged panel [REF#EN-00448]
        sideMatLeft,  // -X left  — grey-tagged panel [REF#EN-00449]
        topMat,       // +Y [REF#EN-00450]
        bottomMat,    // -Y [REF#EN-00451]
        frontMat,     // +Z front (invisible — see ShapeGeometry below) [REF#EN-00452]
        backMat,      // -Z back — Oni-Baba mural [REF#EN-00453]
    ];

    const cabinet = new THREE.Mesh(cabinetGeo, cabinetMaterials);
    cabinet.position.y = 1.2;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    cabinet.updateMatrix();
    cabinet.matrixAutoUpdate = false;
    group.add(cabinet);

    // ── Front fascia with photo-real texture + display cutout ── [REF#EN-00454]
    // Uses newest-vending-front.jpeg (758×1024) which has the empty display
    // window pre-drawn at roughly upper-left. The Shape hole below lines up
    // 1:1 with the texture's drawn window so cards show inside it.
    // Cabinet face is 1.70 × 2.40 (aspect 0.708, matches the 0.74 texture).
    const _fW = 1.70, _fH = 2.40;
    const _texture_window_uv = {
        // Empirically traced from the JPEG — empty rusted display panel [REF#EN-00455]
        // U: 0.110–0.700 (center 0.405, width 0.590)
        // V (UV, flipped from pixel-Y): 0.470–0.755 (center 0.612, height 0.285)
        cu: 0.405, cv: 0.612, w: 0.590, h: 0.285,
    };
    // Convert UV to local cabinet coords (face centered at origin) [REF#EN-00456]
    const _displayLocalX = (_texture_window_uv.cu - 0.5) * _fW;
    const _displayLocalY = (_texture_window_uv.cv - 0.5) * _fH;
    const _holeW = _texture_window_uv.w * _fW;
    const _holeH = _texture_window_uv.h * _fH;

    const fascia = new THREE.Shape();
    fascia.moveTo(-_fW/2, -_fH/2);
    fascia.lineTo( _fW/2, -_fH/2);
    fascia.lineTo( _fW/2,  _fH/2);
    fascia.lineTo(-_fW/2,  _fH/2);
    fascia.lineTo(-_fW/2, -_fH/2);

    const displayHole = new THREE.Path();
    displayHole.moveTo(_displayLocalX - _holeW/2, _displayLocalY - _holeH/2);
    displayHole.lineTo(_displayLocalX + _holeW/2, _displayLocalY - _holeH/2);
    displayHole.lineTo(_displayLocalX + _holeW/2, _displayLocalY + _holeH/2);
    displayHole.lineTo(_displayLocalX - _holeW/2, _displayLocalY + _holeH/2);
    displayHole.lineTo(_displayLocalX - _holeW/2, _displayLocalY - _holeH/2);
    fascia.holes.push(displayHole);

    const fasciaGeo = new THREE.ShapeGeometry(fascia);
    // Set normalized UVs so the texture maps cleanly to the cabinet face [REF#EN-00457]
    {
        const uvAttr = fasciaGeo.attributes.uv;
        const posAttr = fasciaGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            uvAttr.setXY(i, (x + _fW/2) / _fW, (y + _fH/2) / _fH);
        }
        uvAttr.needsUpdate = true;
    }

    // Load the photo-real front texture [REF#EN-00458]
    const _frontTexLoader = new THREE.TextureLoader();
    const _frontTex = _frontTexLoader.load('./assets/textures/newest-vending-front.jpeg');
    _frontTex.colorSpace = THREE.SRGBColorSpace || _frontTex.colorSpace;
    _frontTex.anisotropy = 8;

    const fasciaMat = new THREE.MeshStandardMaterial({
        map: _frontTex,
        roughness: 0.55,
        metalness: 0.05,
        name: "vending_fascia"
    });
    const fasciaMesh = new THREE.Mesh(fasciaGeo, fasciaMat);
    fasciaMesh.position.set(0, 1.2, 0.451);
    fasciaMesh.castShadow = true;
    fasciaMesh.receiveShadow = true;
    fasciaMesh.updateMatrix();
    fasciaMesh.matrixAutoUpdate = false;
    group.add(fasciaMesh);

    // Dynamic LCD Canvas & Screen — wide aspect to match the new horizontal [REF#EN-00459]
    // strip geometry (0.50 × 0.10 world). 256×48 keeps text crisp.
    const lcdCanvas = document.createElement('canvas');
    lcdCanvas.width = 256;
    lcdCanvas.height = 48;
    const lcdTex = new THREE.CanvasTexture(lcdCanvas);
    const lcdMat = new THREE.MeshStandardMaterial({
        map: lcdTex,
        emissiveMap: lcdTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.7,  // toned down from 1.2 to reduce overall glare [REF#EN-00460]
        roughness: 0.6,           // toned down from 0.1 — no longer mirror-glossy [REF#EN-00461]
        metalness: 0.0            // was 0.1 — kill remaining specular highlight [REF#EN-00462]
    });
    // 3D LCD hidden — the new texture has a "130円" LCD baked in. [REF#EN-00463]
    // Keep the mesh + group.userData.updateLcdText pointer so the rest of
    // the code that calls updateLcdText() doesn't break.
    const lcdGeo = new THREE.BoxGeometry(0.50, 0.10, 0.02);
    const lcdScreen = new THREE.Mesh(lcdGeo, lcdMat);
    lcdScreen.position.set(0.0, 1.22, 0.470);
    lcdScreen.visible = false;
    lcdScreen.updateMatrix();
    lcdScreen.matrixAutoUpdate = false;
    group.add(lcdScreen);

    // Screen text updater — repaints the 256×48 wide LCD with scanlines + glow [REF#EN-00464]
    group.userData.updateLcdText = function(text) {
        const ctx = lcdCanvas.getContext('2d');
        ctx.fillStyle = '#05070a';
        ctx.fillRect(0, 0, 256, 48);

        ctx.fillStyle = 'rgba(0, 255, 170, 0.04)';
        for (let y = 0; y < 48; y += 4) {
            ctx.fillRect(0, y, 256, 2);
        }

        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00ffaa';
        ctx.fillStyle = '#00ffaa';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 24);

        lcdTex.needsUpdate = true;
    };
    group.userData.updateLcdText(_vmLcdEach(dungeonLevel));

    // ── HORIZONTAL DISPLAY (per user 2026-05-22) ── [REF#EN-00465]
    // Re-shaped from tall-narrow (0.65w × 1.2h) on the left half to wide-
    // short (1.20w × 0.80h) centered horizontally across the upper third
    // of the cabinet. Holds 8 cards in a 2×4 layout. Buttons + LCD now
    // sit BELOW the display rather than to its side.
    // Aligned 1:1 with the texture's pre-drawn display window
    // (newest-vending-front.jpeg). Values derived from the texture's UV
    // analysis in the fascia block above.
    const DISPLAY_CX  = _displayLocalX;             // ≈ -0.162 (left of center) [REF#EN-00466]
    const DISPLAY_CY  = 1.2 + _displayLocalY;       // ≈ 1.469 (upper-mid) [REF#EN-00467]
    const DISPLAY_W   = _holeW;                     // ≈ 1.003 [REF#EN-00468]
    const DISPLAY_H   = _holeH;                     // ≈ 0.684 [REF#EN-00469]
    const DISPLAY_HALFW = DISPLAY_W / 2;
    const DISPLAY_HALFH = DISPLAY_H / 2;

    const recessGeo = new THREE.BoxGeometry(DISPLAY_W, DISPLAY_H, 0.02);
    const recessMat = new THREE.MeshStandardMaterial({
        color: 0x080a0f, roughness: 1.0, metalness: 0.0
    });
    const recessBack = new THREE.Mesh(recessGeo, recessMat);
    recessBack.position.set(DISPLAY_CX, DISPLAY_CY, 0.10);
    recessBack.receiveShadow = true;
    recessBack.updateMatrix();
    recessBack.matrixAutoUpdate = false;
    group.add(recessBack);

    // Interior shadow-box walls — left/right/top/bottom panels framing the recess [REF#EN-00470]
    const depthWallMat = new THREE.MeshStandardMaterial({
        color: 0x181008, metalness: 0.0, roughness: 1.0
    });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.02, DISPLAY_H, 0.35), depthWallMat);
    leftWall.position.set(DISPLAY_CX - DISPLAY_HALFW, DISPLAY_CY, 0.275);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    leftWall.updateMatrix();
    leftWall.matrixAutoUpdate = false;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.02, DISPLAY_H, 0.35), depthWallMat);
    rightWall.position.set(DISPLAY_CX + DISPLAY_HALFW, DISPLAY_CY, 0.275);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    rightWall.updateMatrix();
    rightWall.matrixAutoUpdate = false;
    group.add(rightWall);

    const topWall = new THREE.Mesh(new THREE.BoxGeometry(DISPLAY_W, 0.02, 0.35), depthWallMat);
    topWall.position.set(DISPLAY_CX, DISPLAY_CY + DISPLAY_HALFH, 0.275);
    topWall.castShadow = true;
    topWall.receiveShadow = true;
    topWall.updateMatrix();
    topWall.matrixAutoUpdate = false;
    group.add(topWall);

    const bottomWall = new THREE.Mesh(new THREE.BoxGeometry(DISPLAY_W, 0.02, 0.35), depthWallMat);
    bottomWall.position.set(DISPLAY_CX, DISPLAY_CY - DISPLAY_HALFH, 0.275);
    bottomWall.castShadow = true;
    bottomWall.receiveShadow = true;
    bottomWall.updateMatrix();
    bottomWall.matrixAutoUpdate = false;
    group.add(bottomWall);

    // Ventilation slats — full-width across the display top, scaled to new wider recess [REF#EN-00471]
    const slatGeo = new THREE.BoxGeometry(DISPLAY_W * 0.93, 0.015, 0.015);
    const slatMat = new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 1.0, metalness: 0.0
    });
    for (let i = 0; i < 5; i++) {
        const slat = new THREE.Mesh(slatGeo, slatMat);
        slat.position.set(DISPLAY_CX, DISPLAY_CY - DISPLAY_HALFH + 0.04 + i * 0.025, 0.115);
        slat.castShadow = true;
        slat.receiveShadow = true;
        slat.updateMatrix();
        slat.matrixAutoUpdate = false;
        group.add(slat);
    }

    // Interior purple backlight — placed centrally in the new horizontal recess [REF#EN-00472]
    const interiorLight = new THREE.PointLight(0x7f00ff, 0.7, 2.0);
    interiorLight.position.set(DISPLAY_CX, DISPLAY_CY, 0.20);
    group.add(interiorLight);

    // Matte aluminum reflector hood — runs along the top inside of the display [REF#EN-00473]
    const reflectorGeo = new THREE.BoxGeometry(DISPLAY_W * 0.95, 0.05, 0.12);
    const reflectorMat = new THREE.MeshStandardMaterial({
        color: 0x9b9b9b, roughness: 0.65, metalness: 0.35
    });
    const reflector = new THREE.Mesh(reflectorGeo, reflectorMat);
    reflector.position.set(DISPLAY_CX, DISPLAY_CY + DISPLAY_HALFH - 0.05, 0.28);
    reflector.castShadow = true;
    reflector.updateMatrix();
    reflector.matrixAutoUpdate = false;
    group.add(reflector);

    // Fluorescent tube centered inside the reflector hood [REF#EN-00474]
    const tubeGeo = new THREE.CylinderGeometry(0.015, 0.015, DISPLAY_W * 0.88, 8);
    tubeGeo.rotateZ(Math.PI / 2);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.set(DISPLAY_CX, DISPLAY_CY + DISPLAY_HALFH - 0.06, 0.275);
    tubeMesh.updateMatrix();
    tubeMesh.matrixAutoUpdate = false;
    group.add(tubeMesh);

    // Fluorescent point-light — slightly above tube [REF#EN-00475]
    const fluorescentLight = new THREE.PointLight(0xfffaed, 0.7, 1.8);
    fluorescentLight.position.set(DISPLAY_CX, DISPLAY_CY + DISPLAY_HALFH - 0.08, 0.275);
    fluorescentLight.castShadow = true;
    fluorescentLight.shadow.bias = -0.0005;
    fluorescentLight.shadow.mapSize.width = 512;
    fluorescentLight.shadow.mapSize.height = 512;
    fluorescentLight.shadow.camera.near = 0.05;
    fluorescentLight.shadow.camera.far = 2.0;
    group.add(fluorescentLight);

    // Matte shelves — 2 horizontal shelves for 2 rows of 4 cards each [REF#EN-00476]
    const shelfGeo = new THREE.BoxGeometry(DISPLAY_W * 0.97, 0.02, 0.30);
    const shelfMat = new THREE.MeshStandardMaterial({
        color: 0xa8acb2, metalness: 0.0, roughness: 1.0
    });
    // Top shelf (between rows) [REF#EN-00477]
    const shelf1 = new THREE.Mesh(shelfGeo, shelfMat);
    shelf1.position.set(DISPLAY_CX, DISPLAY_CY + 0.05, 0.25);
    shelf1.castShadow = true;
    shelf1.receiveShadow = true;
    shelf1.updateMatrix();
    shelf1.matrixAutoUpdate = false;
    group.add(shelf1);
    // Bottom shelf [REF#EN-00478]
    const shelf2 = new THREE.Mesh(shelfGeo, shelfMat);
    shelf2.position.set(DISPLAY_CX, DISPLAY_CY - DISPLAY_HALFH + 0.10, 0.25);
    shelf2.castShadow = true;
    shelf2.receiveShadow = true;
    shelf2.updateMatrix();
    shelf2.matrixAutoUpdate = false;
    group.add(shelf2);

    // Generate 8 slots arranged in a 4×2 grid behind the cabinet glass [REF#EN-00479]
    // (user mandate 2026-05-24: modal shows up to 8 mini-cards 1:1 at 50%
    // scale). Floor 1 takes the whole 8-item pool shuffled — no duplicates
    // needed. Floor 2+ procedurally fills all 8 slots.
    const SLOT_COUNT = 8;
    const slots = [];
    const chosenNames = [];
    _vmRng = _vmStockRng(dungeonLevel);   // seeded for this machine's stock only — cleared right after (2026-09-27) [REF#PENDING] [REF#EN-00733]
    if (dungeonLevel === 1) {
        // ALWAYS RANDOM each game (Mark): 8 UNIQUE cards, so stock genuinely differs every playthrough. [REF#EN-00480]
        // 2026-07-16: floor 1 used to shuffle its OWN flat pool and take 8 — it never called
        // _drawRandomVendingCard, so the class weighting below applied ONLY to floor 2+ and POKER could
        // never appear on floor 1 (the floor Mark actually plays). Two divergent stocking paths is how the
        // machine drifted skill-heavy in the first place. Both floors now draw through the SAME weighted
        // helper (more weapons, fewer skills — Mark 2026-07-16); uniqueness is enforced by chosenNames.
        for (let i = 0; i < SLOT_COUNT; i++) {
            const cardName = _drawRandomVendingCard(chosenNames);
            if (!cardName) break;
            chosenNames.push(cardName);
            const _mag = _vmRand() < VEND_MAGIC_CHANCE(dungeonLevel);
            slots.push({ type: 'card', name: cardName, price: VEND_PRICE(dungeonLevel, _mag), qty: 1, magical: _mag, mesh: null });
        }
    } else {
        const cardChance = Math.min(0.85, 0.55 + dungeonLevel * 0.05);
        for (let i = 0; i < SLOT_COUNT; i++) {
            if (_vmRand() < cardChance) {
                const cardName = _drawRandomVendingCard(chosenNames);
                chosenNames.push(cardName);
                // MAGICAL ROLL — a real field, priced 10x. Rare-by-name is kept only as a nudge: a card already in [REF#EN-00481]
                // the legacy RARE list is likelier to come up magical, so the old groupings still mean something.
                const _rareNudge = VENDING_RARE_CARDS.includes(cardName) ? 1.6 : 1.0;
                const _mag = _vmRand() < VEND_MAGIC_CHANCE(dungeonLevel) * _rareNudge;
                slots.push({ type: 'card', name: cardName, price: VEND_PRICE(dungeonLevel, _mag), qty: 1, magical: _mag, mesh: null });
            } else if (_vmRand() < 0.50) {
                slots.push({ type: 'potion', name: 'HEAL POTION', price: VEND_PRICE(dungeonLevel), qty: 6, magical: false, mesh: null });   // consumables are never magical — a lifeline must stay affordable [REF#EN-00482]
            } else {
                slots.push({ type: 'empty', name: 'EMPTY', price: 0, qty: 0, mesh: null });
            }
        }
    }
    _vmRng = null;
    // ── MANDATORY HEAL POTIONS (Mark 2026-07-04: "ALWAYS HAVE 2 HEAL POTIONS IN EACH VENDING MACHINE TO [REF#EN-00483]
    //    PURCHASE. MANDATORY 1X HEAL POTION."): the random fill above can leave a machine with ZERO heal
    //    potions (Floor 1 draws 8 unique from a big pool; Floor 2+ stocks potions only probabilistically) —
    //    a health lifeline must never be absent. Guarantee _vendHealSlots (default 2, min the mandated 1)
    //    heal-potion slots in EVERY machine. Prefer converting EMPTY slots, then trailing CARDS, so the rest
    //    of the stock stays freshly random. Live-tune the count: window._vendHealSlots.
    {
        const _healTarget = Math.max(1, (typeof window !== 'undefined' && typeof window._vendHealSlots === 'number') ? window._vendHealSlots : 2);
        const _mkHeal = () => ({ type: 'potion', name: 'HEAL POTION', price: VEND_PRICE(dungeonLevel), qty: 6, magical: false, mesh: null });   // Mark 2026-07-16: 130g "even for heal potions" [REF#EN-00484]
        const _healNow = () => slots.filter(s => s && s.type === 'potion' && s.name === 'HEAL POTION').length;
        // Pass 1 — fill EMPTY slots first (costs no stock variety) [REF#EN-00485]
        for (let i = 0; i < slots.length && _healNow() < _healTarget; i++) {
            if (slots[i] && slots[i].type === 'empty') slots[i] = _mkHeal();
        }
        // Pass 2 — still short → convert TRAILING cards (Floor 1 is all cards, so this is where it lands) [REF#EN-00486]
        for (let i = slots.length - 1; i >= 0 && _healNow() < _healTarget; i--) {
            if (slots[i] && slots[i].type === 'card') slots[i] = _mkHeal();
        }
    }
    // ── ROCKETS IN EVERY MACHINE (2026-09-29): the bazooka's ammunition must always be findable, the same way the heal potions [REF#EN-00801]
    //    above are guaranteed. After the potions, the LAST remaining card slot becomes ROCKETS (3 in stock) unless the random draw
    //    already stocked some. Live-tune: window._vendRocketSlots (1; 0 = off).
    {
        const _rkTarget = (typeof window !== 'undefined' && typeof window._vendRocketSlots === 'number') ? Math.max(0, window._vendRocketSlots | 0) : 1;
        const _rkNow = () => slots.filter(s => s && s.type === 'card' && s.name === 'ROCKETS').length;
        if (_rkTarget > 0 && _vmBuildable('ROCKETS')){
            for (let i = slots.length - 1; i >= 0 && _rkNow() < _rkTarget; i--){
                if (slots[i] && slots[i].type === 'card' && slots[i].name !== 'ROCKETS')
                    slots[i] = { type: 'card', name: 'ROCKETS', price: VEND_PRICE(dungeonLevel), qty: 3, magical: false, mesh: null };
            }
        }
    }
    _vmEnsurePetFood(slots, dungeonLevel);   // a wizard always finds PET FOOD (2026-10-03) [REF#EN-00802 → see REF#E9-24162]
    group.userData.slots = slots;

    // Helper to build procedural metallic coil [REF#EN-00487]
    function buildHelixCurve(radius, length, turns) {
        const points = [];
        const segments = turns * 24;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 2 * turns;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            const z = -t * length; // extends backwards [REF#EN-00488]
            points.push(new THREE.Vector3(x, y, z));
        }
        return new THREE.CatmullRomCurve3(points);
    }

    // Position and build card meshes — 8 cards in a 4×2 grid (user mandate [REF#EN-00489]
    // 2026-05-24: cabinet matches the 4×2 modal layout 1:1). Top row sits
    // above the cabinet's vertical center; bottom row below.
    const cardMeshes = [];
    const SLOT_SPACING = DISPLAY_W / 4;          // 4 columns evenly spaced [REF#EN-00490]
    const COL_SPACING  = SLOT_SPACING;           // kept for button-grid math below [REF#EN-00491]
    const shelfXRow = [
        DISPLAY_CX + (-1.5) * SLOT_SPACING,
        DISPLAY_CX + (-0.5) * SLOT_SPACING,
        DISPLAY_CX + ( 0.5) * SLOT_SPACING,
        DISPLAY_CX + ( 1.5) * SLOT_SPACING,
    ];
    // ── ROW SPACING — the two rows were GEOMETRICALLY GUARANTEED to clip (Mark 2026-07-19: "vending machine [REF#EN-00492]
    // cards -- need more spacing so they dont clip each other"). The arithmetic, so nobody has to re-derive it:
    //   card plane            = 1.2 tall (line ~273) × cardGroup.scale 0.175 (line ~352)  = 0.210
    //   old ROW_SPACING       = DISPLAY_H 0.684 × 0.30                                    = 0.205
    // 0.210 > 0.205, so the rows OVERLAPPED by 5mm before anything moved — and then animateCards bobs each
    // card ±0.025 on its own phase offset, so two cards in the same column could close another 50mm into each
    // other. That is the clip: it is not a z-fight or a stacking bug, the rows simply do not fit.
    // Now 0.44 (= 0.301) with the card's own +0.075 shelf offset below, which leaves ~0.091 of clear air —
    // ~0.041 even at worst-case opposed bob — while the top card's upper edge (0.331) still sits inside the
    // display hole's half-height (0.342). CHANGE EITHER NUMBER AND RE-CHECK BOTH BOUNDS.
    const ROW_SPACING = DISPLAY_H * 0.44;        // vertical gap between the two card rows [REF#EN-00493]
    const SHELF_Y_TOP    = DISPLAY_CY + ROW_SPACING * 0.5;
    const SHELF_Y_BOTTOM = DISPLAY_CY - ROW_SPACING * 0.5;
    const tagNames  = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const SHELF_Y   = DISPLAY_CY + 0.04;         // legacy anchor (used by animateCards _restY) [REF#EN-00494]

    for (let idx = 0; idx < slots.length; idx++) {
        const slot = slots[idx];
        const row = Math.floor(idx / 4);          // 0 = top row, 1 = bottom row [REF#EN-00495]
        const col = idx % 4;
        const shelfY = (row === 0) ? SHELF_Y_TOP : SHELF_Y_BOTTOM;
        const posX   = shelfXRow[col];

        // Build Shelf Tag (A1 through C2) with glowing emissive text [REF#EN-00496]
        const tagCanvas = document.createElement('canvas');
        tagCanvas.width = 48;
        tagCanvas.height = 24;
        const ctxT = tagCanvas.getContext('2d');
        ctxT.fillStyle = '#0a0a0a';
        ctxT.fillRect(0, 0, 48, 24);
        ctxT.fillStyle = '#00ffcc';
        ctxT.font = 'bold 12px monospace';
        ctxT.textAlign = 'center';
        ctxT.textBaseline = 'middle';
        ctxT.fillText(tagNames[idx], 24, 12);

        const tagTex = new THREE.CanvasTexture(tagCanvas);
        const tagMat = new THREE.MeshStandardMaterial({
            map: tagTex,
            emissiveMap: tagTex,
            emissive: 0xffffff,
            emissiveIntensity: 0.45,  // was 0.8 — softer glow [REF#EN-00497]
            roughness: 0.85,          // was 0.2 — matte [REF#EN-00498]
            metalness: 0.0            // was 0.1 [REF#EN-00499]
        });
        const tagPlate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.005), tagMat);
        tagPlate.position.set(posX, shelfY, 0.402);
        tagPlate.updateMatrix();
        tagPlate.matrixAutoUpdate = false;
        group.add(tagPlate);

        if (slot.type === 'empty' || slot.qty <= 0) continue;

        // Tiny metal dispenser coil — sits FAR BEHIND the card as a subtle [REF#EN-00500]
        // backdrop spiral, not in front blocking it. Was 0.06 helix radius
        // at Z=0.38 (front of card, obscuring) — caused the giant-spiral
        // clipping screenshot the user flagged 2026-05-22.
        const helixCurve = buildHelixCurve(0.035, 0.16, 4);
        const coilGeo = new THREE.TubeGeometry(helixCurve, 48, 0.0035, 6, false);
        const coilMat = new THREE.MeshStandardMaterial({
            color: 0x5a5a5a,
            roughness: 0.75,
            metalness: 0.15,
            transparent: true,
            opacity: 0.55,        // semi-transparent so it doesn't hide cards [REF#EN-00501]
        });
        const coilMesh = new THREE.Mesh(coilGeo, coilMat);
        // Z=0.08 sits behind the card (card now at Z=0.18) but in front of [REF#EN-00502]
        // the recess back (Z=0.10). Acts as visual scaffolding, not obstruction.
        coilMesh.position.set(posX, shelfY + 0.10, 0.08);
        group.add(coilMesh);
        slot.coilMesh = coilMesh;
        slot.isDispensing = false;

        const miniCard = _buildMiniVendingCard(slot.name, true, slot.price, dungeonLevel);
        if (miniCard) {
            // Pulled close to the glass (Z=0.42) so the card art reads sharp [REF#EN-00503]
            // through the panel — was Z=0.18 (deep in recess, far from camera).
            // Glass sits at Z=0.455, so 0.035u clearance for the slight -0.05
            // forward tilt.
            miniCard.position.set(posX, shelfY + 0.075, 0.42);   // 0.10 -> 0.075: with ROW_SPACING raised, this keeps the TOP row's upper edge inside the display hole (see the ROW_SPACING note) [REF#EN-00504]
            miniCard.rotation.x = -0.05;
            // Card is ALSO a click target — players can click directly on the [REF#EN-00505]
            // card to buy it (in addition to clicking the texture's drawn
            // keypad button at the matching slot index). The card group acts
            // as the "buttonMesh" forwarded into _triggerVendingButton, so
            // we forge enough userData to satisfy that function.
            miniCard.userData.slotIndex = idx;
            miniCard.userData.isVendingButton = true;
            miniCard.userData.buttonIndex = idx;
            miniCard.userData.isPressed = false;
            // Per-row rest Y so animateCards bobs each card around its own [REF#EN-00506]
            // shelf instead of snapping the bottom row up to the top row.
            miniCard.userData.restY = shelfY + 0.075;   // must match the position.set above — animateCards bobs around this [REF#EN-00507]
            // Provide a no-op material reference so the trigger function's [REF#EN-00508]
            // emissive-flash animation runs without throwing.
            miniCard.userData.material = { emissiveIntensity: 0 };
            miniCard.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            group.add(miniCard);
            slot.mesh = miniCard;
            cardMeshes.push(miniCard);
        }
    }

    // Pre-allocated static vectors to prevent GC allocations [REF#EN-00509]
    const _tempGroupPos = new THREE.Vector3();
    const _tempCamPos = new THREE.Vector3();

    // ── ONE SHARED ANIMATION DRIVER FOR **ALL** MACHINES (2026-07-20, the multi-machine work) ──────────── [REF#EN-00510]
    // WAS: every machine started its own `requestAnimationFrame(animateCards)` that was NEVER cancelled. One
    // machine hid it; with a machine per floor (or several side by side, which is the goal) you accumulate N
    // permanent loops, each closing over its own stale `slots`/`cardMeshes` — the old ones keep animating
    // disposed cards for the life of the page. That is a leak that grows with exactly the feature Mark asked
    // for, so it had to go before adding machines, not after.
    // NOW: the machine registers itself in `window._vendingMachines` and ONE module-level driver walks the
    // registry, skipping machines that are hidden or far. Adding the tenth machine costs zero extra loops.
    // Per-machine state that the driver needs lives on userData so the driver stays stateless.
    group.userData.cardMeshes = cardMeshes;   // (re-affirmed at :1220; the driver reads it from userData) [REF#EN-00511]
    group.userData.slots = slots;
    group.userData.shelfY = SHELF_Y;
    _vmRegister(group);
    // Kept as a per-machine entry point ONLY so existing callers/tests that poke it still work; the shared [REF#EN-00512]
    // driver is what actually runs. Calling this does NOT start a second loop.
    function animateCards() { _vmAnimateOne(group, performance.now() * 0.002); }
    function _unused_legacyAnimateCards() {
        if (!group.visible) {
            return;
        }

        let isFar = false;
        if (window.camera) {
            group.getWorldPosition(_tempGroupPos);
            window.camera.getWorldPosition(_tempCamPos);
            if (_tempGroupPos.distanceToSquared(_tempCamPos) > 225) { // 15 world units squared [REF#EN-00513]
                isFar = true;
            }
        }

        if (isFar) {
            return;
        }

        const time = performance.now() * 0.002;
        cardMeshes.forEach((mesh, index) => {
            if (mesh) {
                const offset = index * 1.5;
                // Levitating magnetic hover around each card's own rest Y [REF#EN-00514]
                // (top vs bottom row), set when the mesh was placed.
                const restY = (mesh.userData && mesh.userData.restY != null)
                    ? mesh.userData.restY
                    : SHELF_Y + 0.10;
                mesh.position.y = restY + Math.sin(time * 1.5 + offset) * 0.025;
                // Subtle sway — same as before but a touch calmer so 8 in a [REF#EN-00515]
                // row don't read as chaotic.
                mesh.rotation.x = -0.05 + Math.sin(time * 0.5 + offset) * 0.04;
                mesh.rotation.y = Math.sin(time + offset) * 0.10;
                mesh.rotation.z = Math.cos(time * 0.7 + offset) * 0.04;
            }
        });

        // Update coils spin [REF#EN-00516]
        slots.forEach((slot, index) => {
            if (slot.coilMesh) {
                if (slot.isDispensing) {
                    slot.coilMesh.rotation.z += 0.2;
                } else {
                    slot.coilMesh.rotation.z = Math.sin(time * 0.2 + index) * 0.02;
                }
            }
        });

    }

    // Horizontal cover glass — polished to match the new modal's [REF#EN-00517]
    // .vc-display-glass treatment (2026-05-23). Higher clearcoat + lower
    // roughness give a real tempered-glass highlight; a faint reflectivity
    // bump catches the cabinet's interior light so the pane reads as a
    // pane, not as an open hole. A second slim sheen mesh sits in front
    // of the main pane to bake in a diagonal "glare" stripe (PBR alone
    // doesn't produce that without an env-map).
    const glassGeo = new THREE.BoxGeometry(DISPLAY_W, DISPLAY_H, 0.012);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xeaf2ff,
        transparent: true,
        opacity: 0.28,
        roughness: 0.04,
        metalness: 0.0,
        transmission: 0.78,
        ior: 1.50,
        // thickness: removed — Engine8 loads three.js r128 globally and r128's [REF#EN-00518]
        // MeshPhysicalMaterial doesn't support `thickness` (added in r150).
        // Without a transmissionMap it has no visual effect anyway; safe to drop.
        reflectivity: 0.55,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(DISPLAY_CX, DISPLAY_CY, 0.455);
    glass.updateMatrix();
    glass.matrixAutoUpdate = false;
    group.add(glass);

    // Diagonal sheen stripe — a thin tilted plane in front of the pane. [REF#EN-00519]
    // Additive-blended white gradient gives the cover glass an obvious
    // "highlight sweep" so the player reads it as glass at a glance.
    const _sheenCanvas = document.createElement('canvas');
    _sheenCanvas.width = 256; _sheenCanvas.height = 64;
    {
        const ctx = _sheenCanvas.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 256, 64);
        g.addColorStop(0.00, 'rgba(255,255,255,0)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 64);
    }
    const sheenTex = new THREE.CanvasTexture(_sheenCanvas);
    sheenTex.colorSpace = THREE.SRGBColorSpace || sheenTex.colorSpace;
    const sheenMat = new THREE.MeshBasicMaterial({
        map: sheenTex,
        transparent: true,
        opacity: 0.30,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const sheen = new THREE.Mesh(
        new THREE.PlaneGeometry(DISPLAY_W * 1.05, DISPLAY_H * 1.1),
        sheenMat
    );
    sheen.position.set(DISPLAY_CX, DISPLAY_CY, 0.458);
    sheen.rotation.z = -0.18; // tilted highlight stripe [REF#EN-00520]
    sheen.updateMatrix();
    sheen.matrixAutoUpdate = false;
    group.add(sheen);

    // Soft top-down dome glare — matches the panel modal's .vc-dome-cover [REF#EN-00521]
    // ::before (top white gradient → transparent). Adds the "spherical
    // glass dome" cue on top of the diagonal sheen so the 3D cabinet
    // reads with the same glass treatment the modal got
    // (user mandate 2026-05-24).
    const _domeCanvas = document.createElement('canvas');
    _domeCanvas.width = 256; _domeCanvas.height = 256;
    {
        const ctx = _domeCanvas.getContext('2d');
        // Top elliptical glare — bright at the top, fades by 50% height. [REF#EN-00522]
        const g = ctx.createRadialGradient(128, 50, 10, 128, 50, 180);
        g.addColorStop(0.00, 'rgba(255, 255, 255, 0.55)');
        g.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
        g.addColorStop(1.00, 'rgba(255, 255, 255, 0.00)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        // Faint bottom ambient bounce — same vibe as .vc-dome-cover::after. [REF#EN-00523]
        const gb = ctx.createRadialGradient(128, 220, 8, 128, 220, 110);
        gb.addColorStop(0.00, 'rgba(255, 255, 255, 0.18)');
        gb.addColorStop(1.00, 'rgba(255, 255, 255, 0.00)');
        ctx.fillStyle = gb;
        ctx.fillRect(0, 0, 256, 256);
    }
    const domeTex = new THREE.CanvasTexture(_domeCanvas);
    domeTex.colorSpace = THREE.SRGBColorSpace || domeTex.colorSpace;
    const domeMat = new THREE.MeshBasicMaterial({
        map: domeTex,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(
        new THREE.PlaneGeometry(DISPLAY_W * 1.02, DISPLAY_H * 1.04),
        domeMat
    );
    dome.position.set(DISPLAY_CX, DISPLAY_CY, 0.461); // slightly in front of the sheen [REF#EN-00524]
    dome.updateMatrix();
    dome.matrixAutoUpdate = false;
    group.add(dome);

    // Gold-border strips removed — the new texture already has a metal frame [REF#EN-00525]
    // drawn around the display window so an additional 3D border was
    // double-stacking the frame line.

    // Mechanical Button Strip — 8 buttons in 2 rows of 4, mirroring the [REF#EN-00526]
    // 4×2 card grid above so every card has its own pressable button.
    // Restored 2026-05-27 per FIX_INSTRUCTIONS.md #3 — VENDING_BUY handler
    // indexes vm.userData.buttons[idx]; without the strip, all purchases
    // silently fail.
    const buttonsGroup = new THREE.Group();
    group.add(buttonsGroup);

    const buttonGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16);
    buttonGeo.rotateX(Math.PI / 2);

    const buttons = [];
    const BTN_ROW_GAP = 0.085;                              // vertical spacing between the two button rows [REF#EN-00527]
    const BUTTON_Y_TOP    = DISPLAY_CY - DISPLAY_H / 2 - 0.06;
    const BUTTON_Y_BOTTOM = DISPLAY_CY - DISPLAY_H / 2 - 0.06 - BTN_ROW_GAP;

    for (let idx = 0; idx < slots.length; idx++) {
        const slot = slots[idx];
        if (!slot) continue;
        const btnRow = Math.floor(idx / 4);
        const btnCol = idx % 4;
        const BUTTON_Y = (btnRow === 0) ? BUTTON_Y_TOP : BUTTON_Y_BOTTOM;

        // REAL FIELD, NOT A PRICE SNIFF (Mark 2026-07-19). This was `slot.price === 20` — permanently false since [REF#EN-00528]
        // prices went flat, so the rare/magical styling below has been unreachable for months. Reads the slot now.
        const isRare = slot.magical === true;
        const isSold = slot.qty <= 0;

        let btnColor = 0x00f3ff;
        if (isSold) {
            btnColor = 0x4a5568;
        } else if (dungeonLevel === 1) {
            btnColor = 0xffa500; // Orange/amber for Floor 1 foyer [REF#EN-00529]
        } else if (isRare) {
            btnColor = 0xff007f; // Pink [REF#EN-00530]
        } else {
            const regColors = [0x00f3ff, 0x39ff14, 0xffa500, 0xfff700, 0x7f00ff];
            btnColor = regColors[idx % regColors.length];
        }

        const btnMat = new THREE.MeshStandardMaterial({
            color: btnColor,
            emissive: btnColor,
            emissiveIntensity: isSold ? 0.08 : 0.85,
            metalness: 0.15,
            roughness: 0.35
        });
        const btn = new THREE.Mesh(buttonGeo, btnMat);
        const _btnLocalX = shelfXRow[btnCol];        // align with the card column above [REF#EN-00531]
        btn.position.set(_btnLocalX, BUTTON_Y, 0.490);
        btn.visible = true;

        // Visible chrome bezel ring around each button [REF#EN-00532]
        const bezelGeo = new THREE.TorusGeometry(0.038, 0.006, 10, 28);
        bezelGeo.rotateX(Math.PI / 2);
        const bezelMat = new THREE.MeshStandardMaterial({
            color: 0xc8ccd3, metalness: 0.85, roughness: 0.28
        });
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.copy(btn.position);
        bezel.position.z -= 0.012;
        bezel.visible = true;
        bezel.updateMatrix();
        bezel.matrixAutoUpdate = false;
        buttonsGroup.add(bezel);

        // Neon slot-number + price plate beneath each button (e.g. "3 25G") [REF#EN-00533]
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 64;
        labelCanvas.height = 32;

        let labelText = isSold ? `${tagNames[idx]} SOLD` : `${tagNames[idx]}  ${slot.price}G`;
        let labelColor = isSold ? '#4a5568' : (isRare ? '#ff0055' : '#00ffaa');
        if (dungeonLevel === 1 && !isSold) {
            labelColor = '#ffa500';  // amber for foyer [REF#EN-00534]
        }

        const ctxL = labelCanvas.getContext('2d');
        ctxL.fillStyle = '#05070a';
        ctxL.fillRect(0, 0, 64, 32);
        ctxL.strokeStyle = labelColor;
        ctxL.lineWidth = 3;
        ctxL.strokeRect(1, 1, 62, 30);
        ctxL.fillStyle = labelColor;
        ctxL.shadowBlur = isSold ? 0 : 6;
        ctxL.shadowColor = labelColor;
        ctxL.font = 'bold 10px monospace';
        ctxL.textAlign = 'center';
        ctxL.textBaseline = 'middle';
        ctxL.fillText(labelText, 32, 16);

        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelMat = new THREE.MeshStandardMaterial({
            map: labelTex,
            emissiveMap: labelTex,
            emissive: 0xffffff,
            emissiveIntensity: isSold ? 0.2 : 0.8,
            roughness: 0.1,
            metalness: 0.1
        });
        const labelGeo = new THREE.BoxGeometry(0.10, 0.044, 0.008);
        const labelPlate = new THREE.Mesh(labelGeo, labelMat);
        labelPlate.position.copy(btn.position);
        labelPlate.position.y -= 0.058;
        labelPlate.position.z -= 0.005;
        labelPlate.visible = true;
        labelPlate.updateMatrix();
        labelPlate.matrixAutoUpdate = false;
        buttonsGroup.add(labelPlate);

        btn.userData = {
            isVendingButton: true,
            buttonIndex: idx,
            initialZ: 0.490,
            targetZ: 0.460,
            pressTimer: 0,
            isPressed: false,
            color: btnColor,
            material: btnMat,
            labelCanvas,
            labelTex
        };

        btn.castShadow = true;
        btn.receiveShadow = true;
        btn.updateMatrix();
        btn.matrixAutoUpdate = false;
        buttonsGroup.add(btn);
        buttons.push(btn);
    }
    group.userData.buttons = buttons;

    // 3D coin slot + retrieval bay are drawn in the new texture [REF#EN-00535]
    // (newest-vending-front.jpeg has them baked in). 3D versions removed.

    // Deep recessed physical retrieval bay — centered now that the display [REF#EN-00536]
    // spans the full cabinet width.
    const bayBackGeo = new THREE.BoxGeometry(0.85, 0.35, 0.02);
    const bayBack = new THREE.Mesh(bayBackGeo, new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 0.9, metalness: 0.1 }));
    bayBack.position.set(0.0, 0.45, 0.15);
    bayBack.updateMatrix();
    bayBack.matrixAutoUpdate = false;
    group.add(bayBack);
    
    // 3D retrieval-bay geometry removed — newest-vending-front.jpeg has the [REF#EN-00537]
    // "おつり" change-return bay drawn in at the bottom of the texture.
    // (Removed bayFloor, bayCeil, bayLeft, bayRight, flap, bar — all baked.)
    bayBack.visible = false;  // recess back also hidden — fascia texture covers it [REF#EN-00538]

    // Set the entire vending machine hierarchy onto Layer 2 [REF#EN-00539]
    // to shield it from player's FPV flashlight glare on Layer 0.
    group.traverse(child => {
        child.layers.set(2);
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Make sure lights inside the machine are also on Layer 2 so they only light up the vending machine [REF#EN-00540]
    interiorLight.layers.set(2);
    fluorescentLight.layers.set(2);

    // Global reference [REF#EN-00541]
    window._vendingMachineGroup = group;
    group.userData.dungeonLevel = dungeonLevel;   // for relocalizeVendingMachine [REF#EN-00542]
    group.userData.cardMeshes = cardMeshes;       // so re-localized cards keep bobbing [REF#EN-00543]
    window.relocalizeVendingMachine = relocalizeVendingMachine;

    return group;
}

// ── Re-localize the machine's slot cards on a language toggle ───────────────── [REF#EN-00544]
// VENDING CARDS MUST MATCH THE LOOT CARDS 1:1: loot cards re-bake on LOCALE_CHANGE
// (engine _relocalizeLootCard). These slot cards are built once at boot, so the engine's
// LOCALE_CHANGE handler calls this to rebuild each slot's mini-card in window.currentLang.
// ── RELOCALIZE **EVERY** MACHINE, AND ONLY WHEN THE LANGUAGE ACTUALLY CHANGED (2026-07-20) ─────────────
// Two defects fixed here, both of which get worse with more machines:
//  1. It read only `window._vendingMachineGroup`, so with several cabinets the others kept the old
//     language forever.
//  2. The engine's LOCALE_CHANGE handler has NO equality guard, so a re-broadcast of the SAME locale ran a
//     full 8-card teardown/rebuild per machine. That is the exact operation that used to strand a baked
//     card copy (see VENDINGMACHINE.md §5.1) — doing it needlessly multiplied the damage. Cheap guard here
//     protects every caller, including ones added later.
// ── PET FOOD FOR THE WIZARD (2026-10-03): when the player's role is the wizard (the pets' summoner), every machine carries PET FOOD
//    in one slot — the last card slot that is not ROCKETS becomes PET FOOD (3 in stock) unless the draw already stocked it. Run at
//    build, and again when the role is picked after the machines were built (window._vmStockPetFood, called from SET_PLAYER_ROLE),
//    which renames the slot and rebuilds that machine's cards. A slot already bought empty is never touched. Off: window._vendPetFood = false.
function _vmEnsurePetFood(slots, dungeonLevel) {
    try {
        if (typeof window === 'undefined' || window._vendPetFood === false || window._playerRole !== 'wizard' || !_vmBuildable('PET FOOD')) return false;
        if (slots.some(s => s && s.name === 'PET FOOD')) return false;
        for (let i = slots.length - 1; i >= 0; i--) {
            const s = slots[i];
            if (s && s.type === 'card' && s.name !== 'ROCKETS' && s.qty !== 0 && !s.sold) {
                s.name = 'PET FOOD'; s.price = VEND_PRICE(dungeonLevel); s.qty = 3; s.magical = false;
                return true;
            }
        }
    } catch (_) {}
    return false;
}
export function stockPetFoodForRole() {
    const _all = (window._vendingMachines && window._vendingMachines.length) ? window._vendingMachines.slice() : [window._vendingMachineGroup];
    let n = 0;
    for (const vm of _all) {
        try { if (!vm || !vm.userData || !Array.isArray(vm.userData.slots)) continue;
              if (_vmEnsurePetFood(vm.userData.slots, vm.userData.dungeonLevel || 1)) { _relocalizeOneVendingMachine(vm); n++; } } catch (_) {}
    }
    return n;
}
try { if (typeof window !== 'undefined') window._vmStockPetFood = stockPetFoodForRole; } catch (_) {}
export function relocalizeVendingMachine() {
    const _lang = (typeof window !== 'undefined' && window.currentLang) || null;
    if (_lang && relocalizeVendingMachine._lastLang === _lang) return;   // same language → nothing to redo [REF#EN-00545]
    relocalizeVendingMachine._lastLang = _lang;
    const _all = (window._vendingMachines && window._vendingMachines.length)
        ? window._vendingMachines.slice()
        : [window._vendingMachineGroup];
    for (const _m of _all) { try { _relocalizeOneVendingMachine(_m); } catch(_){} }
}
function _relocalizeOneVendingMachine(vm) {
    if (!vm || !vm.userData || !Array.isArray(vm.userData.slots)) return;
    const dungeonLevel = vm.userData.dungeonLevel || 1;
    const cardMeshes = vm.userData.cardMeshes;
    for (const slot of vm.userData.slots) {
        if (!slot || !slot.mesh || slot.type === 'empty') continue;
        const old = slot.mesh;
        const fresh = _buildMiniVendingCard(slot.name, true, slot.price, dungeonLevel);  // localized in current lang [REF#EN-00546]
        if (!fresh) continue;
        fresh.position.copy(old.position); fresh.rotation.copy(old.rotation); fresh.scale.copy(old.scale);
        // preserve interaction userData — the card group IS the click/buy target [REF#EN-00547]
        fresh.userData.slotIndex = old.userData.slotIndex;
        fresh.userData.isVendingButton = true;
        fresh.userData.buttonIndex = old.userData.buttonIndex;
        fresh.userData.isPressed = false;
        fresh.userData.restY = old.userData.restY;
        fresh.userData.material = { emissiveIntensity: 0 };
        fresh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        vm.add(fresh);
        slot.mesh = fresh;
        if (Array.isArray(cardMeshes)) { const i = cardMeshes.indexOf(old); if (i >= 0) cardMeshes[i] = fresh; else cardMeshes.push(fresh); }
        // DETACH FROM THE REAL PARENT, NOT AN ASSUMED ONE. `Object3D.remove()` in r128 is [REF#EN-00548]
        // `indexOf(...) → if (index !== -1)` — no else, no warning, no return value. If `old` was ever
        // re-parented (or already detached), `vm.remove(old)` SILENTLY does nothing and the dispose below
        // then runs on a card that is still in the scene: it keeps rendering with dead resources, exactly
        // on top of `fresh`. That is one of the two ways this file produced doubled cards.
        if (old.parent) old.parent.remove(old); else vm.remove(old);
        // Never dispose what the MODULE owns — see the sold-out note (~:1712). Shared geometry and cached [REF#EN-00549]
        // materials are borrowed by every card on every machine; disposing them here blanked the others.
        const _sharedR = new Set([_sharedCardPlaneGeo, _sharedCardEdgeGeo, _sharedGlassBubbleMat]);
        const _cachedR = new Set(Object.values(_cardMaterialCache || {}));
        old.traverse(o => {
            if (!o.isMesh) return;
            if (o.geometry && o.geometry.dispose && !_sharedR.has(o.geometry)) o.geometry.dispose();
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) { if (m && m.dispose && !_sharedR.has(m) && !_cachedR.has(m)) m.dispose(); }
        });
    }
}

let _lastVendingBump = 0;
export function playVendingMachineBumpSfx() {
    const now = performance.now();
    if (now - _lastVendingBump < 1200) return;
    _lastVendingBump = now;
    
    // Play mechanical thud immediately [REF#EN-00550]
    if (typeof window._playSfxFile === 'function') {
        window._playSfxFile('./assets/sounds/Dungeon/pop.mp3', 0.85);
    }
    // Play physical coin clinks after a short 250ms delay [REF#EN-00551]
    setTimeout(() => {
        if (typeof window._playSfxFile === 'function') {
            window._playSfxFile('./assets/sounds/Dungeon/coins.mp3', 0.60);
        }
    }, 250);

    try {
        const ctx = (typeof window._getAudioCtx === 'function') ? window._getAudioCtx() : null;
        if (ctx && !window._audioMuted) {
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(90, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.35);
            
            gain1.gain.setValueAtTime(0.35, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start();
            osc1.stop(ctx.currentTime + 0.36);
            
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(140, ctx.currentTime);
            osc2.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.5);
            
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(220, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.5);
            filter.Q.value = 6.0;
            
            gain2.gain.setValueAtTime(0.18, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            
            osc2.connect(filter);
            filter.connect(gain2);
            gain2.connect(ctx.destination);
            
            osc2.start();
            osc2.stop(ctx.currentTime + 0.51);
        }
    } catch (e) {
        console.warn("Vending machine bump synth failed:", e);
    }
}

// Layered "can dispensed" synth — plays on top of the existing pop+coins [REF#EN-00552]
// bump on every successful purchase (user mandate 2026-05-24). Three beats:
//   t=0       — low thud (can drops into chute)
//   t=120ms   — short metallic roll (can rolls down to tray)
//   t=300ms   — bright ting (can lands in retrieval bay)
export function playVendingDispenseSfx() {
    try {
        const ctx = (typeof window._getAudioCtx === 'function') ? window._getAudioCtx() : null;
        if (!ctx || window._audioMuted) return;
        const t0 = ctx.currentTime;

        // ── Beat 1: low thud (sine 80→50 Hz, 100ms) ───────────────── [REF#EN-00553]
        const thud = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(80, t0);
        thud.frequency.exponentialRampToValueAtTime(50, t0 + 0.10);
        thudGain.gain.setValueAtTime(0.55, t0);
        thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        thud.connect(thudGain);
        thudGain.connect(ctx.destination);
        thud.start(t0);
        thud.stop(t0 + 0.13);

        // ── Beat 2: rolling can (sawtooth ~200Hz through bandpass, [REF#EN-00554]
        //         amplitude-modulated by a 6Hz LFO for the rumble) ──
        const t1 = t0 + 0.12;
        const roll = ctx.createOscillator();
        const rollGain = ctx.createGain();
        const rollFilter = ctx.createBiquadFilter();
        roll.type = 'sawtooth';
        roll.frequency.setValueAtTime(220, t1);
        roll.frequency.linearRampToValueAtTime(160, t1 + 0.28);
        rollFilter.type = 'bandpass';
        rollFilter.frequency.setValueAtTime(380, t1);
        rollFilter.Q.value = 4.5;
        rollGain.gain.setValueAtTime(0.0, t1);
        rollGain.gain.linearRampToValueAtTime(0.18, t1 + 0.04);
        rollGain.gain.exponentialRampToValueAtTime(0.001, t1 + 0.30);
        // LFO amplitude modulation for the "rumble" texture [REF#EN-00555]
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(6, t1);
        lfoGain.gain.setValueAtTime(0.10, t1);
        lfo.connect(lfoGain);
        lfoGain.connect(rollGain.gain);
        roll.connect(rollFilter);
        rollFilter.connect(rollGain);
        rollGain.connect(ctx.destination);
        roll.start(t1);
        lfo.start(t1);
        roll.stop(t1 + 0.32);
        lfo.stop(t1 + 0.32);

        // ── Beat 3: landing ting (triangle 1800Hz blip) ───────────── [REF#EN-00556]
        const t2 = t0 + 0.30;
        const ting = ctx.createOscillator();
        const tingGain = ctx.createGain();
        ting.type = 'triangle';
        ting.frequency.setValueAtTime(1800, t2);
        ting.frequency.exponentialRampToValueAtTime(1300, t2 + 0.06);
        tingGain.gain.setValueAtTime(0.16, t2);
        tingGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);
        ting.connect(tingGain);
        tingGain.connect(ctx.destination);
        ting.start(t2);
        ting.stop(t2 + 0.09);
    } catch (e) {
        console.warn('Vending dispense synth failed:', e);
    }
}

export function playVendingMachineClickSfx() {
    if (typeof window._playSfxFile === 'function') {
        window._playSfxFile('./assets/sounds/Dungeon/click.mp3', 0.85);
    }
    try {
        const ctx = (typeof window._getAudioCtx === 'function') ? window._getAudioCtx() : null;
        if (ctx && !window._audioMuted) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.08);
            
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.09);
        }
    } catch (e) {
        console.warn("Vending machine click synth failed:", e);
    }
}

export function playVendingMachineErrorSfx() {
    try {
        const ctx = (typeof window._getAudioCtx === 'function') ? window._getAudioCtx() : null;
        if (ctx && !window._audioMuted) {
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(120, ctx.currentTime);
            osc1.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.25);
            gain1.gain.setValueAtTime(0.2, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start();
            osc1.stop(ctx.currentTime + 0.26);
        }
    } catch (e) {
        console.warn("Vending machine error synth failed:", e);
    }
}

// Synthesized dual-oscillator metal resonant thud for bullet impacts [REF#EN-00557]
export function playVendingMachineBulletHitSfx() {
    // The mp3 layer this used to request (Dungeon/impact.mp3) has NEVER existed in git — every bullet [REF#EN-00558]
    // hit fired a 404 that the synth below covered audibly. Removed 2026-08-11 (see the register at the
    // top of Engine9.html). Restore the layer by shipping the file first, then re-adding the call.
    try {
        const ctx = (typeof window._getAudioCtx === 'function') ? window._getAudioCtx() : null;
        if (ctx && !window._audioMuted) {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            const gain2 = ctx.createGain();

            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(110, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);

            gain1.gain.setValueAtTime(0.4, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(75, ctx.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);

            gain2.gain.setValueAtTime(0.6, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

            osc1.connect(gain1);
            osc2.connect(gain2);

            gain1.connect(ctx.destination);
            gain2.connect(ctx.destination);

            osc1.start();
            osc2.start();

            osc1.stop(ctx.currentTime + 0.41);
            osc2.stop(ctx.currentTime + 0.51);
        }
    } catch (e) {
        console.warn("Vending machine bullet hit synth failed:", e);
    }
}

export function updateButtonSoldState(buttonMesh) {
    if (!buttonMesh) return;
    const mat = buttonMesh.userData.material;
    if (mat && mat.color) {
        mat.color.setHex(0x4a5568);
        mat.emissive.setHex(0x4a5568);
        mat.emissiveIntensity = 0.05;
    }
    const labelCanvas = buttonMesh.userData.labelCanvas;
    const labelTex = buttonMesh.userData.labelTex;
    const btnIdx = buttonMesh.userData.buttonIndex;
    const tagNames = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'];
    const tagName = tagNames[btnIdx] || `S${btnIdx}`;
    if (labelCanvas && labelTex) {
        const ctxL = labelCanvas.getContext('2d');
        ctxL.fillStyle = '#05070a';
        ctxL.fillRect(0, 0, 64, 32);
        ctxL.strokeStyle = '#4a5568';
        ctxL.lineWidth = 3;
        ctxL.strokeRect(1, 1, 62, 30);
        ctxL.fillStyle = '#4a5568';
        ctxL.shadowBlur = 0;
        ctxL.font = 'bold 10px monospace';
        ctxL.textAlign = 'center';
        ctxL.textBaseline = 'middle';
        ctxL.fillText(`${tagName} SOLD`, 32, 16);
        labelTex.needsUpdate = true;
    }
}

export function triggerVendingButton(btnIdx, buttonMesh, dungeonLevel = 1, playerGold = 0) {
    if (!buttonMesh || buttonMesh.userData.isPressed) return;

    const vm = window._vendingMachineGroup;
    if (!vm || !vm.userData.slots) return;

    const slot = vm.userData.slots[btnIdx];
    if (!slot) return;

    buttonMesh.userData.isPressed = true;
    buttonMesh.userData.pressTimer = 0;
    
    // Send handshake so Oni-Baba registers the shop interaction (resetting idle timeout) [REF#EN-00559]
    try { window.parent.postMessage({ type: 'VENDING_MODAL_OPEN' }, '*'); } catch (_) {}

    // Animate button/card press in userData/frame loop [REF#EN-00560]
    const mat = buttonMesh.userData.material;
    const origEm = mat ? mat.emissiveIntensity : 0;
    
    // For cards, flash all child meshes with a white emissive burst [REF#EN-00561]
    const flashColor = new THREE.Color(0xffffff);
    const flashMeshes = [];
    if (buttonMesh.type === 'Group') {
        buttonMesh.traverse(child => {
            if (child.isMesh && child.material) {
                let m = Array.isArray(child.material) ? child.material[0] : child.material;
                if (m && m.emissive) {
                    flashMeshes.push({ mat: m, origEmissive: m.emissive.clone(), origInt: m.emissiveIntensity });
                    m.emissive.copy(flashColor);
                    m.emissiveIntensity = 2.0;
                }
            }
        });
    } else if (mat) {
        mat.emissiveIntensity = 2.0;
    }

    setTimeout(() => {
        if (buttonMesh.type === 'Group') {
            flashMeshes.forEach(fm => {
                fm.mat.emissive.copy(fm.origEmissive);
                fm.mat.emissiveIntensity = fm.origInt;
            });
        } else if (mat) {
            if (!slot || slot.qty <= 0) {
                mat.emissiveIntensity = 0.05;
            } else {
                mat.emissiveIntensity = origEm;
            }
        }
    }, 150);

    // Rejection if sold out or empty [REF#EN-00562]
    if (slot.qty <= 0 || slot.type === 'empty') {
        playVendingMachineErrorSfx();
        if (vm.userData.updateLcdText) {
            vm.userData.updateLcdText(_vmL('lcd.sold_out', "SOLD OUT"));
        }
        // Surface the failure in the panels event log so the modal user [REF#EN-00563]
        // sees feedback (the LCD text only shows on the 3D machine).
        try { window.parent.postMessage({type:'LOG_EVENT', logType:'system', text:`⛔ Slot ${btnIdx + 1} is sold out.`}, '*'); } catch (_) {}
        setTimeout(() => {
            if (vm.userData.updateLcdText) vm.userData.updateLcdText(_vmLcdEach(dungeonLevel));
            buttonMesh.userData.isPressed = false;
        }, 1500);
        return null;
    }

    // Unified gold-check purchase flow (all floors). [REF#EN-00564]
    // Per user mandate 2026-05-22: "25 gold per item. user has 100 gold when
    // they start". Floor 1 used to route through Oni-Baba's karma-side flow
    // (KATANA = −10 karma, SHIELD = +10 karma) but the user wants the simple
    // gold-buy path. Oni-Baba still gets notified for sensor updates but no
    // longer gates the transaction.
    const cost = slot.price;
    if (playerGold < cost) {
        playVendingMachineErrorSfx();
        // Tell the player exactly how much more gold they need so it's [REF#EN-00565]
        // clear they have to go earn / loot more. Mandate 2026-05-23.
        const due = Math.max(1, cost - (playerGold | 0));
        if (vm.userData.updateLcdText) {
            vm.userData.updateLcdText((window.currentLang === 'ja') ? `金欠 — あと${due}G` : `金欠 — ${due}G DUE`);
        }
        // FLOATING COMBAT TEXT (Mark 2026-07-18: "if player doesnt have enough gold for vending machine make combat [REF#EN-00566]
        // text : NOT ENOUGH GOLD! / localized text"). The LCD line and the event-log line above are both easy to miss
        // — the LCD is a small 3D panel you may not be looking at, and the log is off in the side panel — so the
        // rejection now lands in the same centred combat-text channel every other refusal uses (cf. the slot-machine
        // permit notice). Localized via _vmL like the rest of this machine's copy; JA falls back to EN if absent.
        // spawnDamageText lives in the Engine9 monolith (a classic script, so it is reachable on window from this
        // module); worldPos is ignored by it — the text is always centre-screen — so null is correct here.
        try {
            if (typeof window.spawnDamageText === 'function'){
                window.spawnDamageText(0, null, false, { label: _vmL('msg.no_gold', 'NOT ENOUGH GOLD!'), spell: true });
            }
        } catch (_) {}
        // Surface the gold shortfall in the panels event log so the modal [REF#EN-00567]
        // user sees explicit feedback when nothing seems to happen.
        try { window.parent.postMessage({type:'LOG_EVENT', logType:'system', text:`⛔ Need ${due}G more for ${slot.name} (${cost}G).`}, '*'); } catch (_) {}
        try { window.parent.postMessage({type:'VENDING_BUY_FAILED', reason:'no_gold', cost, due}, '*'); } catch (_) {}
        setTimeout(() => {
            if (vm.userData.updateLcdText) vm.userData.updateLcdText(_vmLcdEach(dungeonLevel));
            buttonMesh.userData.isPressed = false;
        }, 1800);
        return null;
    }

    // Successful purchase transaction (Floor 2+) [REF#EN-00568]
    // Subtract gold, sync player stats, play sounds
    window.playerGold -= cost;
    slot.qty--;
    if (typeof window._syncPlayerStats === 'function') {
        window._syncPlayerStats();
    }

    // Big mechanical THUNK — layered SFX for the YES-confirm purchase [REF#EN-00569]
    // (user mandate 2026-05-23). Plays bump + click + coin all at once so
    // the player hears a real "cha-CHUNK" from the machine. The new
    // dispense synth (thud → roll → ting) layers on top ~250ms later so
    // every purchase sounds like a can actually rolling out the chute
    // (user mandate 2026-05-24).
    playVendingMachineClickSfx();
    if (typeof window._playSfxFile === 'function') {
        window._playSfxFile('./assets/sounds/Dungeon/pop.mp3', 1.0);
        setTimeout(() => {
            try { window._playSfxFile('./assets/sounds/Dungeon/coins.mp3', 0.95); } catch (_) {}
        }, 90);
    }
    setTimeout(() => {
        try { playVendingDispenseSfx(); } catch (_) {}
    }, 250);

    if (vm.userData.updateLcdText) {
        vm.userData.updateLcdText(_vmL('lcd.dispensing', "DISPENSING..."));
    }

    // Trigger coil spin! [REF#EN-00570]
    if (slot.coilMesh) {
        slot.isDispensing = true;
    }

    const canonicalName = slot.name;
    let dispName = canonicalName;
    if (canonicalName === 'KATANA') {
        window.ownedKatana = true;
    }
    if (canonicalName === 'SHIELD') {
        window.ownedShield = true;
    }
    window.parent.postMessage({type:'ADD_CARD', card: dispName}, '*');
    window.parent.postMessage({type:'LOG_EVENT', logType:'system', text:`Purchased ${dispName} for ${cost} gold!`}, '*');
    try { window.parent.postMessage({type:'VENDING_BUY_SUCCESS', card: dispName, cost}, '*'); } catch (_) {}
    // Mark the return value (read by engine VENDING_BUY handler) so it [REF#EN-00571]
    // can drop a physical 3D loot card in front of the vending machine.
    // Stored on btnMesh.userData so the engine doesn't need to capture
    // the function return value through the postMessage round-trip.
    buttonMesh.userData._lastDispensed = { name: dispName, qty: 1, type: slot.type, cost: cost };

    // Dispense audio/visual timing [REF#EN-00572]
    setTimeout(() => {
        if (typeof window._playSfxFile === 'function') {
            window._playSfxFile('./assets/sounds/Dungeon/pop.mp3', 0.85);
        }
        if (vm.userData.updateLcdText) {
            const displayQtyStr = slot.type === 'potion' ? ` x${slot.qty}` : '';
            vm.userData.updateLcdText(`${_vmCardName(dispName)}${displayQtyStr}`);
        }
        if (slot.coilMesh) {
            slot.isDispensing = false;
        }
    }, 1000);
    
    setTimeout(() => {
        if (typeof window._playSfxFile === 'function') {
            window._playSfxFile('./assets/sounds/Dungeon/coins.mp3', 0.80);
        }
    }, 1300);
    
    setTimeout(() => {
        if (vm.userData.updateLcdText) {
            vm.userData.updateLcdText(_vmLcdEach(dungeonLevel));
        }
        buttonMesh.userData.isPressed = false;
    }, 2800);

    // If fully sold out, update button visuals and remove mesh [REF#EN-00573]
    if (slot.qty <= 0) {
        updateButtonSoldState(buttonMesh);
        _vmDropSlotMesh(vm, slot);
    }
}

// The sold-out card leaves the machine — shared by a sale (above) and a load putting a bought-out slot back (2026-09-27). [REF#PENDING] [REF#EN-00734]
function _vmDropSlotMesh(vm, slot) {
    {
        if (slot.mesh) {
            // ⛔ NEVER DISPOSE SHARED RESOURCES HERE (fixed 2026-07-19; this is the hard blocker for the [REF#EN-00574]
            // MULTI-MACHINE plan in knowledge/VENDINGMACHINE.md §7).
            // This traverse used to dispose `o.geometry` unconditionally — but that geometry IS the
            // module-level `_sharedCardPlaneGeo` / `_sharedCardEdgeGeo` (VendingMachine.js:23-24), shared by
            // EVERY card on this machine, every card on every OTHER machine, and every machine built later.
            // The module cache keeps the dead reference, so the lazy `if (!_sharedCardPlaneGeo)` re-create at
            // ~:272 never fires again. Same for materials: `o.material` is usually the `_cardMaterialCache`
            // entry (~:228), and the two mandatory HEAL POTION slots share ONE cached material by
            // construction — so selling out one blanked the other.
            // With two machines side by side this is fatal: a sale at machine A blanks machine B's faces.
            // A shared resource is owned by the MODULE, not by the card that happens to reference it — the
            // card only borrows it. Dispose exactly what this card owns and nothing else.
            const _shared = new Set([_sharedCardPlaneGeo, _sharedCardEdgeGeo, _sharedGlassBubbleMat]);
            const _cached = new Set(Object.values(_cardMaterialCache || {}));
            vm.remove(slot.mesh);
            slot.mesh.traverse(o => {
                if (o.geometry && !_shared.has(o.geometry)) o.geometry.dispose();
                if (o.material) {
                    const _ms = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of _ms) { if (m && !_shared.has(m) && !_cached.has(m)) m.dispose(); }
                }
            });
            // Keep the bob-animation array honest — it used to retain removed cards forever (animateCards [REF#EN-00575]
            // ~:910 then animated a disposed Group for the life of the page).
            try { const _cm = vm.userData && vm.userData.cardMeshes; if (Array.isArray(_cm)) { const _i = _cm.indexOf(slot.mesh); if (_i >= 0) _cm.splice(_i, 1); } } catch(_){}
            slot.mesh = null;
        }
    }
}

// ── A LOAD PUTS A MACHINE BACK AS IT WAS (2026-09-27, the save rebuild) ─────────────────────────────────────────────── [REF#PENDING] [REF#EN-00735]
//    The engine's 'vending' save part keeps each machine's slot counts; the seeded stock above rebuilds the same slots, and this
//    sets the counts back and shows a slot bought out before the save as SOLD, card gone — the same look a sale leaves. A slot
//    whose card name no longer matches (a machine rebuilt on segment re-entry re-rolls) is left alone and counted as a miss.
export function restoreVendingSlots(vm, saved) {
    const out = { set: 0, sold: 0, miss: 0 };
    if (!vm || !vm.userData || !Array.isArray(vm.userData.slots) || !Array.isArray(saved)) return out;
    const buttons = vm.userData.buttons || [];
    saved.forEach((s, i) => {
        const slot = vm.userData.slots[i];
        if (!s || !slot) return;
        if (slot.name !== s.name || slot.type !== s.type) { out.miss++; return; }
        if (typeof s.qty !== 'number' || s.qty === slot.qty) return;
        slot.qty = Math.max(0, s.qty | 0); out.set++;
        if (slot.qty <= 0 && slot.type !== 'empty') {
            const btn = buttons.find(b => b && b.userData && b.userData.buttonIndex === i) || buttons[i] || null;
            try { if (btn) updateButtonSoldState(btn); } catch (_) {}
            _vmDropSlotMesh(vm, slot);
            out.sold++;
        }
    });
    return out;
}
if (typeof window !== 'undefined') window._vendRestoreSlots = restoreVendingSlots;   // the engine's save part calls it through window (no new import) [REF#EN-00736]
