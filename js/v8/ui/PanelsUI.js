document.addEventListener('DOMContentLoaded', () => {
                const pipCanvas = document.getElementById('pipCanvas');
                if (pipCanvas) {
                    // Set backing pixel dimensions to CSS display size × DPR for crisp rendering [REF#UI-00195 → see REF#PN-00400]
                    const _resizePip = () => {
                        const dpr = window.devicePixelRatio || 1;
                        const rect = pipCanvas.getBoundingClientRect();
                        const w = Math.round((rect.width  || 160) * dpr);
                        const h = Math.round((rect.height || 160) * dpr);
                        if (pipCanvas.width !== w || pipCanvas.height !== h) {
                            pipCanvas.width  = w;
                            pipCanvas.height = h;
                        }
                    };
                    _resizePip();
                    window.addEventListener('resize', _resizePip);

                    // Click-to-swap: a click anywhere on the PIP canvas posts [REF#UI-00196 → see REF#PN-00401]
                    // PIP_TOGGLE → engine swaps cameraMode (FPV ↔ topdown).
                    // After the swap the main canvas shows the top-down map
                    // and the PIP itself starts rendering the FPV camera, so
                    // clicking again swaps back. Drag operations (pointermove
                    // while pointer is down) are not counted as clicks.
                    let _pipPointerDown = null;
                    pipCanvas.addEventListener('pointerdown', (e) => {
                        _pipPointerDown = { x: e.clientX, y: e.clientY };
                    });
                    pipCanvas.addEventListener('pointerup', (e) => {
                        if (!_pipPointerDown) return;
                        const dx = Math.abs(e.clientX - _pipPointerDown.x);
                        const dy = Math.abs(e.clientY - _pipPointerDown.y);
                        _pipPointerDown = null;
                        if (dx > 6 || dy > 6) return; // it was a drag, not a click [REF#UI-00197 → see REF#PN-00402]
                        window.parent.postMessage({ type: 'PIP_TOGGLE' }, '*');
                    });
                    pipCanvas.addEventListener('pointercancel', () => { _pipPointerDown = null; });
                    // (Wheel-zoom handler stays REMOVED here — the pip-frame [REF#UI-00198 → see REF#PN-00403]
                    // wheel handler added later already posts PIP_ZOOM.)
                }

                // T0.23 — Window-level wheel listener: when the cursor is NOT [REF#UI-00199 → see REF#PN-00404]
                // over an interactive UI element, treat it as a main 3D view
                // zoom and forward MAIN_ZOOM to the engine. PIP, card deck,
                // event log, and modals are excluded — they have their own
                // wheel handlers (or are scrollable natively).
                window.addEventListener('wheel', (e) => {
                    if (!e.target || !e.target.closest) return;
                    const ignore = e.target.closest(
                        '#pipCanvas, #moondial-wrapper, ' +
                        '#bottom-panel, #event-log-container, ' +
                        '#inventory-modal, #settings-modal, #exit-modal, ' +
                        '.guide-card, .card-column, .modal-card-hd, ' +
                        'input, textarea'
                    );
                    if (ignore) return;
                    e.preventDefault();
                    window.parent.postMessage({ type: 'MAIN_ZOOM', delta: Math.sign(e.deltaY) }, '*');
                }, { passive: false });

                // Moonphase calculation based on current Date [REF#UI-00200 → see REF#PN-00405]
                function getMoonPhase() {
                    const today = new Date();
                    let year = today.getFullYear();
                    let month = today.getMonth() + 1;
                    let day = today.getDate();
                    if (month < 3) { year--; month += 12; }
                    month++;
                    const c = 365.25 * year;
                    const e = 30.6 * month;
                    let jd = c + e + day - 694039.09;
                    jd /= 29.5305882;
                    const b = Math.floor(jd);
                    jd -= b;
                    let phase = Math.round(jd * 8);
                    if (phase >= 8) phase = 0;
                    return phase;
                }
                
                const phase = getMoonPhase(); // 0 to 7 [REF#UI-00201]
                const phaseNames = ['NEW MOON PHASE', 'WAXING CRESCENT MOON PHASE', 'FIRST QUARTER MOON PHASE', 'WAXING GIBBOUS MOON PHASE', 'FULL MOON PHASE', 'WANING GIBBOUS MOON PHASE', 'LAST QUARTER MOON PHASE', 'WANING CRESCENT MOON PHASE'];
                window.parent.postMessage({ type: 'MOON_PHASE', phase: phaseNames[phase] }, '*');

                const ring = document.querySelector('.season-outer-ring');
                if (ring) {
                    const rotation = -(phase * 45);
                    ring.style.transform = `rotate(${rotation}deg)`;
                }
            });

            // PIP Dragging Logic via Moondial Compass (compass-bg-ring = full drag zone) [REF#UI-00202]
            document.addEventListener("DOMContentLoaded", () => {
                const pip = document.getElementById('moondial-wrapper');
                const dragHandle = pip.querySelector('.compass-bg-ring');
                let isDragging = false;
                let startX, startY, initialX, initialY;

                dragHandle.addEventListener('pointerdown', (e) => {
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    const style = window.getComputedStyle(pip);
                    initialX = parseInt(style.left, 10) || 20;
                    initialY = parseInt(style.top, 10) || 20;
                    pip.style.right = 'auto';
                    pip.style.bottom = 'auto';
                    pip.classList.add('dragging');
                    dragHandle.setPointerCapture(e.pointerId);
                    e.preventDefault();
                });

                dragHandle.addEventListener('pointermove', (e) => {
                    if (!isDragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    pip.style.left = (initialX + dx) + 'px';
                    pip.style.top = (initialY + dy) + 'px';
                });

                const endDrag = (e) => {
                    if (!isDragging) return;
                    isDragging = false;
                    pip.classList.remove('dragging');
                    dragHandle.releasePointerCapture(e.pointerId);
                    // Clamp into viewport [REF#UI-00203]
                    const rect = pip.getBoundingClientRect();
                    const vw = window.innerWidth, vh = window.innerHeight;
                    const clampedLeft = Math.max(0, Math.min(rect.left, vw - rect.width));
                    const clampedTop = Math.max(0, Math.min(rect.top, vh - rect.height));
                    pip.style.left = clampedLeft + 'px';
                    pip.style.top = clampedTop + 'px';
                    // Save + sync (dock mode only — functions may not exist in standalone) [REF#UI-00204]
                    if (typeof window.loadPiPState === 'undefined') {
                        const state = { left: pip.style.left, top: pip.style.top, width: pip.style.width, height: pip.style.height };
                        try { localStorage.setItem('origami_pip_state', JSON.stringify(state)); } catch(_) {}
                    }
                    if (typeof window.syncRect === 'function') window.syncRect();
                };

                dragHandle.addEventListener('pointerup', endDrag);
                dragHandle.addEventListener('pointercancel', endDrag);
            });

/* ==================== EXTRACTED SCRIPT BLOCK ==================== [REF#UI-00205] */

import * as THREE from 'three';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

        window.THREE = THREE;
        // Procedural .45 pistol model (no USDZ load — earlier USDZ file was [REF#UI-00206 → see REF#PN-00557]
        // throwing 'texCoord2f primvars:st0' parse errors). Built from
        // primitives so the PISTOL card icon always shows up.
        try {
            const g = new THREE.Group();
            const matGun  = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.85, roughness: 0.32 });
            const matDark = new THREE.MeshStandardMaterial({ color: 0x141618, metalness: 0.55, roughness: 0.55 });
            const matGrip = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, metalness: 0.10, roughness: 0.78 });
            const matBrass = new THREE.MeshStandardMaterial({ color: 0xc09040, metalness: 0.65, roughness: 0.40 });

            const slide = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 1.55), matGun);
            slide.position.set(0, 0.52, 0); g.add(slide);
            const serr = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.22), matDark);
            serr.position.set(0, 0.52, 0.55); g.add(serr);
            const fs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.10), matDark);
            fs.position.set(0, 0.78, -0.60); g.add(fs);
            const rs = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.10, 0.10), matDark);
            rs.position.set(0, 0.78, 0.55); g.add(rs);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.18, 14), matDark);
            barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.52, -0.86); g.add(barrel);
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 1.05), matGun);
            frame.position.set(0, 0.22, 0.05); g.add(frame);
            const guard = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16, Math.PI), matDark);
            guard.rotation.set(Math.PI / 2, 0, Math.PI);
            guard.position.set(0, 0.02, 0.18); g.add(guard);
            const trig = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.05), matBrass);
            trig.position.set(0, 0.06, 0.20); g.add(trig);
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.46), matGrip);
            grip.position.set(0, -0.35, 0.45); grip.rotation.x = -0.20; g.add(grip);
            const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.48), matDark);
            magBase.position.set(0, -0.82, 0.55); magBase.rotation.x = -0.20; g.add(magBase);
            const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.06), matDark);
            hammer.position.set(0, 0.78, 0.72); g.add(hammer);

            const box = new THREE.Box3().setFromObject(g);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            g.scale.multiplyScalar(2.2 / maxDim);
            box.setFromObject(g);
            const c = box.getCenter(new THREE.Vector3());
            g.position.sub(c);

            window._pistol45Model = g;
            if (typeof window._refreshPistolIcon === 'function') {
                window._refreshPistolIcon();
            }
        } catch (e) { console.warn('[Pistol-45 panels] procedural build failed:', e); }

        if (typeof window.init3DIcons === 'function') window.init3DIcons();

        // Fix for missing toggleRing action buttons [REF#UI-00207 → see REF#PN-00558]
        window.toggleRing = function() {
            const az = document.getElementById('action-zone');
            if(az) az.classList.toggle('outer-active');
        };

        window.openInventory = function() {
            const modal = document.getElementById('inventory-modal');
            if(modal) {
                modal.classList.add('active');
                // Request the latest inventory state from Core.js to populate the UI [REF#UI-00208 → see REF#PN-00570]
                window.parent.postMessage({ type: 'REQUEST_INVENTORY_SYNC' }, '*');
            }
        };

        window.closeInventory = function() {
            const modal = document.getElementById('inventory-modal');
            if(modal) modal.classList.remove('active');
        };



        const spellCategories = [
            { id: 'SPELLS', kanji: '地', icon: 'fa-mountain', desc: 'Spell Scroll', attr: '42–158 DMG · STUN', cards: ['BOULDER', 'FISSURE'] },
            { id: 'SPELLS', kanji: '風', icon: 'fa-wind', desc: 'Spell Scroll', attr: '26–113 DMG · PUSH', cards: ['GALE', 'CYCLONE'] },
            { id: 'SPELLS', kanji: '火', icon: 'fa-fire', desc: 'Magic Wand', attr: '42–158 DMG · BURN', cards: ['FIREBALL', 'PYROBLAST', 'COMET'] },
            { id: 'SPELLS', kanji: '水', icon: 'fa-water', desc: 'Spell Scroll', attr: '26–113 DMG · SLOW', cards: ['TIDE', 'SURGE'] }
        ];

        const combatCategories = [
            { id: 'MELEE', kanji: '斬', icon: 'fa-fire', desc: 'Melee Weapon', attr: '(DMG * 1DICE)', cards: ['SLASH'] },
            { id: 'MELEE', kanji: '突', icon: 'fa-wind', desc: 'Melee Weapon', attr: '(DMG * 1DICE)', cards: ['THRUST'] },
            { id: 'MELEE', kanji: '強', icon: 'fa-mountain', desc: 'Melee Weapon', attr: '(DMG * 4DICE, -25% HIT)', cards: ['HARD ATTACK'] },
            { id: 'MELEE', kanji: '盾', icon: 'fa-shield', desc: 'Tactical', attr: '(DEFEND * 75%)', cards: ['DEFEND'] }
        ];

        const rangeCategories = [
            { id: 'RANGED', kanji: '投', icon: 'fa-star',         desc: 'Thrown Weapon', attr: '(DMG * 1DICE)',  cards: ['SHURIKEN'],         qty: 3 },
            { id: 'RANGED', kanji: '刃', icon: 'fa-khanda',       desc: 'Thrown Blade',  attr: '(DMG * 1DICE)',  cards: ['DAGGER'],           qty: 0 },
            { id: 'RANGED', kanji: '弓', icon: 'fa-bow-arrow',    desc: 'Ranged Weapon', attr: '(DMG * 2DICE)',  cards: ['SHORT BOW'],        qty: 25 },
            { id: 'RANGED', kanji: '長', icon: 'fa-bow-arrow',    desc: 'Ranged Weapon', attr: '(DMG * 4DICE)',  cards: ['LONG BOW'],         qty: 12 },
            { id: 'RANGED', kanji: '銃', icon: 'fa-gun',          desc: 'Arcane projectile.', attr: '20-60 DMG', cards: ['PISTOL'], qty: 14 }
        ];

        const itemCategories = [
            { id: 'ITEM', kanji: '具', icon: 'fa-flask', desc: 'Consumable', attr: '(RESTORE)', cards: ['HEAL POTION'] },
            { id: 'ITEM', kanji: '巻', icon: 'fa-scroll', desc: 'Consumable', attr: '(IDENTIFY)', cards: ['SCROLL OF IDENTITY'] }
        ];

        const decks = [spellCategories, combatCategories, rangeCategories, itemCategories];
        let currentDeckIndex = 2; // Ranged weapons default [REF#UI-00209 → see REF#PN-00596]
        let categories = decks[currentDeckIndex];

        // Flat union of every deck — used by loot lookups that need to find a [REF#UI-00210]
        // category by element id or card name regardless of which class deck
        // it belongs to. Do NOT pass this to loadDeck() (it'd render 12+ cols).
        const defaultCategories = [...spellCategories, ...combatCategories, ...rangeCategories, ...itemCategories];

        // ── T0.19 card class system (4 independent classes) ──────────────────── [REF#UI-00211]
        // SPELLS (default) → MELEE → RANGED → ITEM → (back to SPELLS).
        // Cycled by Spacebar (in keyboard mode) or the ATTACK sidebar button.
        // T0.7's merged COMBAT class was rolled back per user request — each
        // playing-card type is its own independent set again.
        // Cycle order: SPELLS → RANGED → COMBAT (MELEE) → DEFENSE (ITEM).
        // ITEM is intentionally last because it's the defensive / consumable
        // deck — players should land on offense first when tabbing through.
        const CARD_CLASS_ORDER = ['SPELLS', 'RANGED', 'MELEE', 'ITEM'];
        const CARD_CLASS_DECKS = {
            SPELLS:  spellCategories,
            MELEE:   combatCategories,
            RANGED:  rangeCategories,
            ITEM:    itemCategories,
        };
        window.cardClass = 'RANGED'; // Ranged weapons default [REF#UI-00212 → see REF#PN-00596]
        window._lastSelectedCardName = null;
        // Track the most recently FIRED card per deck class. When the player [REF#UI-00213]
        // switches decks (ATTACK / RANGED_ATTACK / CHANGE_SPELLS / cycle key),
        // the last-used card for that deck pre-selects instead of always
        // landing on column 0. Persists for the session; cleared when the
        // card is no longer in the deck (e.g. ammo ran out).
        window._lastUsedByDeck = { SPELLS: null, MELEE: null, RANGED: null, ITEM: null };
        window.cycleCardClass = function(forceTo) {
            if (forceTo && CARD_CLASS_DECKS[forceTo]) {
                window.cardClass = forceTo;
            } else {
                const i = CARD_CLASS_ORDER.indexOf(window.cardClass);
                window.cardClass = CARD_CLASS_ORDER[(i + 1) % CARD_CLASS_ORDER.length];
            }
            loadDeck(CARD_CLASS_DECKS[window.cardClass]);
            // Try to focus the last-used card for the deck we just landed on. [REF#UI-00214 → see REF#PN-00684]
            // Defer to the next tick so loadDeck has mounted the columns
            // before _focusCardByName queries the DOM.
            const lastUsed = window._lastUsedByDeck[window.cardClass];
            if (lastUsed && typeof window._focusCardByName === 'function'){
                setTimeout(() => {
                    const ok = window._focusCardByName(lastUsed);
                    if (!ok){
                        // The remembered card is no longer in the deck (out of [REF#UI-00215 → see REF#PN-00685]
                        // ammo, removed, etc.) — fall back to column 0.
                        focusedColIndex = 0;
                        setFocus(focusedColIndex);
                        const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                        if (topCard) topCard.classList.add('superimposed-card');
                    }
                }, 0);
            } else {
                focusedColIndex = 0;
                setFocus(focusedColIndex);
                const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                if (topCard) topCard.classList.add('superimposed-card');
            }
        };

        window.switchDeck = function(index) {
            currentDeckIndex = index % decks.length;
            categories = decks[currentDeckIndex];
            loadDeck(categories);
        };

        const UXAI = {
            stats: (() => { try { return JSON.parse(localStorage.getItem('Origami_UX_Stats') || '{}'); } catch(e) { return {}; } })(),
            trackClick(cardName) {
                this.stats[cardName] = (this.stats[cardName] || 0) + 1;
                try { localStorage.setItem('Origami_UX_Stats', JSON.stringify(this.stats)); } catch(e) {}
            },
            sortCategory(cat) {
                if (!cat || !cat.cards) return;
                cat.cards.sort((a, b) => {
                    const scoreA = this.stats[a] || 0;
                    const scoreB = this.stats[b] || 0;
                    return scoreB - scoreA;
                });
            },
            initViewportManager() {
                // Width alignment is handled via premium responsive CSS media queries [REF#UI-00216 → see REF#PN-00714]
                // to prevent visual popping and layout jump glitches when cards change or hand is empty.
            }
        };

        let focusedColIndex = 0, pendingAction = null, wheelThrottle = false;
        const scenes = {}, dpr = window.devicePixelRatio || 1;
        
        let avatarMixer = null;
        let avatarActions = {};
        let avatarCurrentAction = null;
        let avatarIdleAction = null;
        let avatarScene, avatarCamera, avatarRenderer, avatarClock;

        let is3DIconsInitialized = false;

        function init3DIcons() {
            if (is3DIconsInitialized) return;
            is3DIconsInitialized = true;
            
            const elements = ['EARTH', 'WATER', 'FIRE', 'WIND', 'ITEM', 'KATANA', 'MISSILE', 'PISTOL', 'BOW_SHORT', 'BOW_LONG', 'DEFEND', 'DICE_EVEN', 'DICE_ODD', 'DICE_CENTER'];
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: false });
            renderer.setClearColor(0x000000, 0); // Critial fix to prevent black squares [REF#UI-00217 → see REF#PN-00718]
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            renderer.setSize(256, 256, false); // Fixed high-res buffer to prevent FBO thrashing [REF#UI-00218 → see REF#PN-00719]
            
            elements.forEach(el => {
                const scene = new THREE.Scene();
                scene.add(new THREE.AmbientLight(0xffffff, 0.6));
                const dir = new THREE.DirectionalLight(0xffffff, 2.2);
                dir.position.set(5, 5, 5); scene.add(dir);
                
                const mat = new THREE.MeshStandardMaterial({ 
                    color: { EARTH: 0x5C4033, WATER: 0xffffff, FIRE: 0xb71c1c, WIND: 0x37474f, ITEM: 0x1b5e20 }[el] || 0x444444,
                    roughness: 0.15, metalness: 0.4, flatShading: true, side: THREE.DoubleSide 
                });
                
                let group = new THREE.Group(), update;
                
                // Removed the Glass Bubble Enclosure to fix the inner gray circle bug on playing cards [REF#UI-00219 → see REF#PN-00720]
                // (Loot cards in FPV will still have their own plastic blister)
                
                if (el === 'EARTH') {
                    // BOULDER - rounder chunky rock [REF#UI-00220 → see REF#PN-00721]
                    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.8, flatShading: true });
                    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 2), rockMat); 
                    group.add(rock);
                    update = (t) => {
                        const isDark = document.body.classList.contains('dark-mode');
                        rockMat.color.setHex(isDark ? 0x8D6E63 : 0x5C4033);
                        rock.rotation.x = t * 1.8; 
                        // Z ROTATION REMOVED TO PREVENT Z-AXIS PROTRUSION [REF#UI-00221 → see REF#PN-00722]
                        rock.position.y = Math.abs(Math.sin(t * 3)) * 1.2;
                    };
                } else if (el === 'FIRE') {
                    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshStandardMaterial({ color: 0xb71c1c, emissive: 0x4a0000, emissiveIntensity: 3, flatShading: true })); group.add(core);
                    const flames = [];
                    for(let i=0; i<60; i++) {
                        const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xffea00 : (i % 2 === 0 ? 0xff4500 : 0xb71c1c), emissive: i % 3 === 0 ? 0xffea00 : 0xff4500, emissiveIntensity: 2.5, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, flatShading: true }));
                        const ang = (i / 60) * Math.PI * 2, rad = 0.2 + Math.random() * 0.45;
                        s.position.set(Math.cos(ang) * rad, 0.3, Math.sin(ang) * rad); group.add(s);
                        flames.push({ m: s, s: 3 + Math.random() * 6, o: Math.random() * Math.PI, rs: (Math.random() - 0.5) * 2, bx: s.position.x, bz: s.position.z }); // Reduced speed factors [REF#UI-00222 → see REF#PN-00723]
                    }
                    update = (t) => {
                        core.rotation.y = t * 0.25; core.scale.setScalar(1 + Math.sin(t * 3) * 0.08); // Slowed core x2 [REF#UI-00223 → see REF#PN-00724]
                        flames.forEach(f => {
                            f.m.rotation.x += f.rs * 0.005; f.m.rotation.y += f.rs * 0.005; 
                            f.m.position.y = 0.3 + ((Math.sin(t * (f.s * 0.5) + f.o) + 1) * 0.8);
                            const sc = Math.max(0.1, 1 - (f.m.position.y / 1.5));
                            f.m.scale.set(sc * 1.5, sc * 2.5, sc * 1.5); 
                        });
                    };
                } else if (el === 'WIND') {
                    const tornado = new THREE.Group();
                    const numSpirals = 2; 
                    const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
                    
                    for(let i=0; i<numSpirals; i++) {
                        const pts = [];
                        const pointsCount = 40;
                        const phaseOffset = (i / numSpirals) * Math.PI * 2;
                        for(let j=0; j<=pointsCount; j++) {
                            const h = j / pointsCount; 
                            const r = Math.pow(h, 2.0) * 1.5 + 0.2; 
                            const y = (h - 0.5) * 2.5; 
                            const angle = h * Math.PI * 12 + phaseOffset; 
                            pts.push(new THREE.Vector3(Math.cos(angle)*r, y, Math.sin(angle)*r));
                        }
                        const curve = new THREE.CatmullRomCurve3(pts);
                        const geometry = new THREE.TubeGeometry(curve, 40, 0.075, 6, false);
                        const mesh = new THREE.Mesh(geometry, mat);
                        mesh.position.y = 1.0;
                        tornado.add(mesh);
                    }
                    tornado.position.y = -0.2;
                    tornado.scale.set(0.65, 0.65, 0.65); // Scale down to fit inside the bubble! [REF#UI-00224 → see REF#PN-00725]
                    group.add(tornado);
                    
                    update = (t) => { 
                        const isDark = document.body.classList.contains('dark-mode');
                        const targetColor = isDark ? 0xffffff : 0x333333;
                        tornado.children.forEach(l => { l.material.color.setHex(targetColor); });
                        
                        tornado.rotation.y = t * -3.0; 
                        
                        // Dynamic swirling lean to look organic [REF#UI-00225 → see REF#PN-00726]
                        tornado.rotation.x = Math.sin(t * 3.5) * 0.15;
                        // Z ROTATION REMOVED [REF#UI-00226 → see REF#PN-00727]
                    };
                } else if (el === 'WATER') {
                    // Bootstrap Blue Wave [REF#UI-00227 → see REF#PN-00728]
                    const geo = new THREE.SphereGeometry(1.5, 32, 32);
                    geo.computeVertexNormals();
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0xffffff, roughness: 0.1, metalness: 0.1, vertexColors: true,
                        emissive: 0x0d6efd, emissiveIntensity: 0.3
                    });
                    const pos = geo.attributes.position;
                    const originalYs = new Float32Array(pos.count);
                    for(let i=0; i<pos.count; i++) originalYs[i] = pos.getY(i);
                    geo.setAttribute('originalY', new THREE.BufferAttribute(originalYs, 1));
                    const colors = new Float32Array(pos.count * 3);
                    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                    const fluid = new THREE.Mesh(geo, mat);
                    group.add(fluid);
                    
                    const sunLight = new THREE.PointLight(0xffffff, 3.0, 15);
                    sunLight.position.set(0, 4, 0);
                    group.add(sunLight);

                    const deepBlue = new THREE.Color(0x0a58ca);
                    const white = new THREE.Color(0xffffff);
                    const bsBlue = new THREE.Color(0x0d6efd);
                    
                    update = (t) => {
                        fluid.rotation.y = t * 0.5;
                        fluid.rotation.x = Math.sin(t * 0.2) * 0.1;
                        
                        const p = geo.attributes.position;
                        const c = geo.attributes.color;
                        const origY = geo.attributes.originalY;
                        
                        for(let i=0; i<p.count; i++) {
                            const x = p.getX(i), z = p.getZ(i), oy = origY.getX(i);
                            const w = Math.sin(x * 3.0 + t * 4) * 0.15 + Math.cos(z * 2.5 + t * 3.5) * 0.1 + Math.sin((x+z)*5.0 + t*5.0) * 0.05;
                            const waterLevel = -0.2;
                            if (oy > waterLevel) {
                                const dist2D = Math.sqrt(x*x + z*z);
                                const maxR = Math.sqrt(1.5*1.5 - waterLevel*waterLevel);
                                if (dist2D < maxR) {
                                    p.setY(i, waterLevel + w);
                                    const mixRatio = (w + 0.25) / 0.5;
                                    const vertColor = deepBlue.clone().lerp(white, mixRatio);
                                    c.setXYZ(i, vertColor.r, vertColor.g, vertColor.b);
                                } else {
                                    p.setY(i, oy);
                                    c.setXYZ(i, bsBlue.r, bsBlue.g, bsBlue.b);
                                }
                            }
                        }
                        p.needsUpdate = true;
                        c.needsUpdate = true;
                        geo.computeVertexNormals();
                    };
                } else if (el === 'ITEM') {
                    const potionGroup = new THREE.Group();

                    // 5% grayish smokey vial glass [REF#UI-00228 → see REF#PN-00729]
                    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.05, metalness: 0.1, transmission: 0.95, transparent: true, opacity: 0.4, ior: 1.5, depthWrite: false });
                    const corkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, metalness: 0.1 });
                    const liquidMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
                    
                    // Beaker vial look (Cylinder with slightly tapered top) [REF#UI-00229 → see REF#PN-00730]
                    const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 1.6, 24);
                    const base = new THREE.Mesh(baseGeo, glassMat);
                    
                    // Liquid inside (50% full with sloshing top) [REF#UI-00230 → see REF#PN-00731]
                    const liquidGeo = new THREE.CylinderGeometry(0.82, 0.85, 0.8, 24);
                    // Move geometry origin to bottom so we can rotate the top [REF#UI-00231 → see REF#PN-00732]
                    liquidGeo.translate(0, 0.4, 0); 
                    const liquid = new THREE.Mesh(liquidGeo, liquidMat);
                    liquid.position.y = -0.7; // Bottom of the beaker [REF#UI-00232 → see REF#PN-00733]
                    
                    // Neck [REF#UI-00233]
                    const neckGeo = new THREE.CylinderGeometry(0.4, 0.8, 0.6, 24);
                    const neck = new THREE.Mesh(neckGeo, glassMat);
                    neck.position.y = 1.1;
                    
                    // Lip [REF#UI-00234]
                    const lipGeo = new THREE.TorusGeometry(0.45, 0.1, 8, 24);
                    const lip = new THREE.Mesh(lipGeo, glassMat);
                    lip.position.y = 1.4;
                    lip.rotation.x = Math.PI / 2;
                    
                    // Cork [REF#UI-00235]
                    const corkGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.4, 12);
                    const cork = new THREE.Mesh(corkGeo, corkMat);
                    cork.position.y = 1.55;
                    
                    potionGroup.add(base, liquid, neck, lip, cork);
                    potionGroup.position.set(0, -0.4, 1.5);
                    potionGroup.scale.set(1.5, 1.5, 1.5);
                    group.add(potionGroup);
                    
                    const pointLight = new THREE.PointLight(0xffffff, 2.0, 10);
                    pointLight.position.set(0, 0, 3);
                    group.add(pointLight);
                    
                    update = (t) => { 
                        potionGroup.rotation.y = t * 1.5; 
                        potionGroup.rotation.z = Math.sin(t * 1.5) * 0.05;
                        
                        // Liquid sloshing [REF#UI-00236 → see REF#PN-00737]
                        const pos = liquidGeo.attributes.position;
                        for(let i=0; i<pos.count; i++) {
                            const yOrig = pos.getY(i);
                            if (yOrig > 0.1) {
                                const x = pos.getX(i);
                                const z = pos.getZ(i);
                                const slosh = Math.sin(x * 5.0 + t * 2.0) * 0.15 + Math.cos(z * 4.0 + t * 1.5) * 0.15;
                                pos.setY(i, 0.8 + slosh);
                            }
                        }
                        pos.needsUpdate = true;
                    };
                } else if (el === 'KATANA' || el === 'KATANA_HEAVY') {
                    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
                    hilt.position.y = -1.0;

                    const bladeShape = new THREE.Shape();
                    bladeShape.moveTo(0, 0); bladeShape.quadraticCurveTo(-0.2, 1.5, -0.1, 3.0); bladeShape.lineTo(0.2, 2.8); bladeShape.quadraticCurveTo(0.3, 1.5, 0.3, 0); bladeShape.lineTo(0, 0);
                    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
                    bladeGeo.center();
                    const blade = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.6, emissive: 0x444444 }));
                    blade.position.y = 1.0;

                    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.8, roughness: 0.2 }));
                    guard.position.y = -0.4;

                    const swordContainer = new THREE.Group();
                    swordContainer.add(hilt, blade, guard);
                    swordContainer.scale.set(0.8, 0.8, 0.1); // flatten z depth [REF#UI-00237 → see REF#PN-00738]
                    
                    // White bloom glow behind [REF#UI-00238 → see REF#PN-00739]
                    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
                    const canvas = document.createElement('canvas');
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                    grad.addColorStop(0, 'rgba(255,255,255,1)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = grad; ctx.fillRect(0,0,64,64);
                    glowMat.map = new THREE.CanvasTexture(canvas);
                    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 5.5), glowMat);
                    glowPlane.position.z = -0.2;
                    swordContainer.add(glowPlane);

                    if (el === 'KATANA_HEAVY') {
                        const sword1 = swordContainer.clone();
                        sword1.position.set(-1.2, 0, 1.5);
                        sword1.rotation.z = Math.PI / 4;

                        const sword2 = swordContainer.clone();
                        sword2.position.set(1.2, 0, 1.5);
                        sword2.rotation.z = -Math.PI / 4; // Flipped to cross [REF#UI-00239 → see REF#PN-00740]

                        group.add(sword1, sword2);
                        update = (t) => { 
                            sword1.rotation.y = t * 1.5; sword2.rotation.y = t * 1.5;
                            sword1.position.y = Math.sin(t * 2) * 0.1;
                            sword2.position.y = Math.cos(t * 2) * 0.1;
                        };
                    } else {
                        // SINGLE KATANA [REF#UI-00240 → see REF#PN-00741]
                        const sword1 = swordContainer;
                        sword1.position.set(0, 0, 1.5);
                        sword1.rotation.z = Math.PI / 4;
                        group.add(sword1);
                        update = (t) => { 
                            sword1.rotation.y = t * 1.5; 
                            sword1.position.y = Math.sin(t * 2) * 0.1;
                        };
                    }
                } else if (el === 'DEFEND') {
                    // V-Shape Shield [REF#UI-00241 → see REF#PN-00742]
                    const shieldShape = new THREE.Shape();
                    shieldShape.moveTo(0, -1.8);
                    shieldShape.lineTo(1.5, 0.5);
                    shieldShape.lineTo(1.5, 1.5);
                    shieldShape.lineTo(0, 1.0);
                    shieldShape.lineTo(-1.5, 1.5);
                    shieldShape.lineTo(-1.5, 0.5);
                    shieldShape.lineTo(0, -1.8);

                    const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
                    shieldGeo.center();
                    
                    const shieldMat = new THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.6, roughness: 0.3, emissive: 0x222222, side: THREE.DoubleSide});
                    const shield = new THREE.Mesh(shieldGeo, shieldMat);
                    
                    // Inner glowing core to make it look tactical [REF#UI-00242 → see REF#PN-00743]
                    const innerGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.12, bevelEnabled: false });
                    innerGeo.center();
                    const innerMat = new THREE.MeshStandardMaterial({color: 0x00ffcc, metalness: 0.1, roughness: 0.2, emissive: 0x00ffcc, emissiveIntensity: 0.5});
                    const innerShield = new THREE.Mesh(innerGeo, innerMat);
                    innerShield.scale.set(0.6, 0.6, 1.0);
                    shield.add(innerShield);
                    
                    shield.scale.set(1.0, 1.0, 0.1); // flatten z depth [REF#UI-00243 → see REF#PN-00738]
                    shield.position.z = 1.0; // move slightly forward [REF#UI-00244 → see REF#PN-00745]
                    group.add(shield);
                    update = (t) => { 
                        shield.rotation.y = t * 1.5;
                    };
                    
                    // Extra point light for weapon shininess [REF#UI-00245 → see REF#PN-00746]
                    const pointLight = new THREE.PointLight(0xffffff, 2.0, 10);
                    pointLight.position.set(0, 0, 3);
                    group.add(pointLight);
                } else if (el === 'MISSILE') {
                    const starShape = new THREE.Shape();
                    const outerRadius = 1.6;
                    const innerRadius = 0.45;
                    for (let i = 0; i < 8; i++) {
                        const angle = (i * Math.PI) / 4;
                        const r = i % 2 === 0 ? outerRadius : innerRadius;
                        if (i === 0) starShape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                        else starShape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    }
                    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
                    starGeo.center();
                    const starMat = new THREE.MeshStandardMaterial({color: 0xffffff, metalness: 0.6, roughness: 0.2, emissive: 0x444444});
                    const star = new THREE.Mesh(starGeo, starMat);
                    
                    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16), new THREE.MeshBasicMaterial({color: 0x000000}));
                    hole.rotation.x = Math.PI / 2;
                    const starGroup = new THREE.Group();
                    starGroup.add(star, hole);
                    starGroup.scale.set(0.9, 0.9, 0.1); // flat z [REF#UI-00246]
                    
                    // White bloom glow behind [REF#UI-00247 → see REF#PN-00739]
                    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
                    const canvas = document.createElement('canvas');
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                    grad.addColorStop(0, 'rgba(255,255,255,1)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = grad; ctx.fillRect(0,0,64,64);
                    glowMat.map = new THREE.CanvasTexture(canvas);
                    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glowMat);
                    glowPlane.position.z = -0.2;
                    starGroup.add(glowPlane);

                    const star1 = starGroup.clone();
                    star1.position.set(-1.0, 0, 1.5); 
                    const star2 = starGroup.clone();
                    star2.position.set(1.0, 0, 1.5);

                    group.add(star1, star2);
                    
                    // Extra point light for weapon shininess [REF#UI-00248 → see REF#PN-00746]
                    const pointLight = new THREE.PointLight(0xffffff, 2.0, 10);
                    pointLight.position.set(0, 0, 3);
                    group.add(pointLight);

                    update = (t) => { 
                        star1.rotation.z = -t * 0.1; 
                        star2.rotation.z = t * 0.1; 
                    };
                } else if (el === 'PISTOL') {
                    // FULL-VISIBILITY .45 pistol icon. Built bigger + brighter [REF#UI-00249]
                    // so the silhouette reads cleanly inside the 45px glass
                    // bubble. MeshBasicMaterial (no lighting needed) with high-
                    // contrast tones: cool steel slide, near-white highlights,
                    // mid-grey polymer grip, dark muzzle ring, white sight dots.
                    // Final group is pre-rotated to a 3/4 profile so you see
                    // BOTH the long slide line AND the grip drop — without
                    // that pitch the camera-on view looks like a flat blob.
                    const slideMat = new THREE.MeshBasicMaterial({ color: 0xd6dae0 }); // bright steel [REF#UI-00250]
                    const slideHi  = new THREE.MeshBasicMaterial({ color: 0xfafcff }); // near-white rib [REF#UI-00251]
                    const polymer  = new THREE.MeshBasicMaterial({ color: 0x5a5e66 }); // mid-grey grip [REF#UI-00252]
                    const muzzle   = new THREE.MeshBasicMaterial({ color: 0x0a0a0c }); // contrast dark muzzle [REF#UI-00253]
                    const sight    = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    // Slide — wider + slightly taller [REF#UI-00254]
                    const slide = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.00, 1.10), slideMat);
                    slide.position.set(0, 0.55, 0); group.add(slide);
                    // Rib — long bright highlight along the top [REF#UI-00255]
                    const rib = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.78), slideHi);
                    rib.position.set(0, 1.15, 0); group.add(rib);
                    // Muzzle — chunky front ring [REF#UI-00256]
                    const muz = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 18), muzzle);
                    muz.rotation.z = Math.PI / 2;
                    muz.position.set(1.55, 0.55, 0); group.add(muz);
                    // Trigger guard [REF#UI-00257 → see REF#PN-00830]
                    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.13, 8, 18, Math.PI), polymer);
                    guard.rotation.x = Math.PI / 2;
                    guard.position.set(0.20, -0.05, 0); group.add(guard);
                    // Grip — fatter + dropping further down [REF#UI-00258]
                    const grip = new THREE.Mesh(new THREE.BoxGeometry(1.00, 1.80, 1.00), polymer);
                    grip.position.set(-0.75, -0.85, 0);
                    grip.rotation.z = -0.18; group.add(grip);
                    // Mag baseplate [REF#UI-00259]
                    const mag = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.22, 1.06), slideMat);
                    mag.position.set(-0.88, -1.78, 0);
                    mag.rotation.z = -0.18; group.add(mag);
                    // Sight dots [REF#UI-00260]
                    const fs = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.18), sight);
                    fs.position.set(1.35, 1.30, 0); group.add(fs);
                    const rs1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.14), sight);
                    rs1.position.set(-1.45, 1.30, -0.25); group.add(rs1);
                    const rs2 = rs1.clone();
                    rs2.position.z = 0.25; group.add(rs2);
                    // Pre-rotate the group so the camera sees a 3/4 profile. [REF#UI-00261]
                    // X-pitch slightly down so the top rib is visible; Y-yaw
                    // tilts so we see the muzzle face + the side of the slide.
                    group.rotation.x = -0.20;
                    group.rotation.y =  0.42;
                    group.rotation.z =  Math.PI / 18;
                    // Scale slightly down so the wider pistol fits the card. [REF#UI-00262]
                    group.scale.setScalar(0.72);
                    update = (t) => {
                        // Subtle yaw sway around the baseline 3/4 angle, no [REF#UI-00263]
                        // vertical bob (keeps the silhouette anchored inside
                        // the icon container's glass bubble).
                        group.rotation.y = 0.42 + Math.sin(t * 1.2) * 0.18;
                    };
                } else if (el === 'BOW_SHORT' || el === 'BOW_LONG') {
                    const isLong = el === 'BOW_LONG';
                    const bowSize = isLong ? 1.6 : 1.0;
                    
                    const bowShape = new THREE.Shape();
                    bowShape.moveTo(0, -1.5);
                    bowShape.quadraticCurveTo(-0.6, 0, 0, 1.5);
                    bowShape.lineTo(0.1, 1.5);
                    bowShape.quadraticCurveTo(-0.4, 0, 0.1, -1.5);
                    bowShape.lineTo(0, -1.5);
                    
                    const bowGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
                    bowGeo.center();
                    const bowMat = new THREE.MeshStandardMaterial({color: 0x5C4033, roughness: 0.8, metalness: 0.1});
                    const bow = new THREE.Mesh(bowGeo, bowMat);
                    bow.scale.set(bowSize, bowSize, bowSize);
                    
                    // Arrow [REF#UI-00264]
                    const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5), new THREE.MeshStandardMaterial({color: 0x8b5a2b}));
                    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3), new THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.8}));
                    arrowHead.position.y = 1.25;
                    const fletching = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.02), new THREE.MeshStandardMaterial({color: 0xffffff}));
                    fletching.position.y = -1.1;
                    const arrow = new THREE.Group();
                    arrow.add(arrowShaft, arrowHead, fletching);
                    arrow.rotation.z = -Math.PI / 2;
                    arrow.position.x = 0.5;
                    
                    const bowGroup = new THREE.Group();
                    bowGroup.add(bow, arrow);
                    bowGroup.position.z = 1.0;
                    
                    // White bloom glow behind [REF#UI-00265 → see REF#PN-00739]
                    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
                    const canvas = document.createElement('canvas');
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                    grad.addColorStop(0, 'rgba(255,255,255,1)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = grad; ctx.fillRect(0,0,64,64);
                    glowMat.map = new THREE.CanvasTexture(canvas);
                    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glowMat);
                    glowPlane.position.z = -0.5;
                    bowGroup.add(glowPlane);
                    
                    group.add(bowGroup);
                    
                    const pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
                    pointLight.position.set(2, 0, 3);
                    group.add(pointLight);

                    update = (t) => { 
                        bowGroup.position.y = Math.sin(t * 3.0) * 0.1;
                        bowGroup.rotation.y = Math.sin(t * 1.5) * 0.1;
                    };
                } else if (el === 'DEFEND') {
                    const addOutline = (mesh) => {
                        const edges = new THREE.EdgesGeometry(mesh.geometry);
                        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
                        mesh.add(line);
                    };
                    
                    const shieldShape = new THREE.Shape();
                    shieldShape.moveTo(0, -1.2);
                    shieldShape.quadraticCurveTo(1.2, -0.2, 1.0, 1.0);
                    shieldShape.lineTo(-1.0, 1.0);
                    shieldShape.quadraticCurveTo(-1.2, -0.2, 0, -1.2);
                    
                    const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3 });
                    shieldGeo.center();
                    const shieldMat = new THREE.MeshStandardMaterial({color: 0xffffff, metalness: 0.5, roughness: 0.3, emissive: 0x444444});
                    const shield = new THREE.Mesh(shieldGeo, shieldMat);
                    shield.scale.set(1.4, 1.4, 1.4);
                    addOutline(shield);
                    
                    // Inner shield design [REF#UI-00266 → see REF#PN-00840]
                    const innerGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.25, bevelEnabled: false });
                    innerGeo.center();
                    const innerMat = new THREE.MeshStandardMaterial({color: 0xffffff, metalness: 0.1, roughness: 0.2});
                    const innerShield = new THREE.Mesh(innerGeo, innerMat);
                    innerShield.scale.set(0.5, 0.5, 1.0);
                    innerShield.position.z = 0; // centered so it pokes out both sides [REF#UI-00267 → see REF#PN-00841]
                    addOutline(innerShield);
                    shield.add(innerShield);
                    
                    const innerShieldBack = new THREE.Mesh(innerGeo, innerMat);
                    innerShieldBack.scale.set(0.5, 0.5, 1.0);
                    innerShieldBack.position.z = -0.15; // Set into the back of the shield [REF#UI-00268 → see REF#PN-00842]
                    innerShieldBack.rotation.y = Math.PI; // Face outwards [REF#UI-00269 → see REF#PN-00843]
                    shield.add(innerShieldBack);
                    
                    group.add(shield);
                    update = (t) => { 
                        // Do not rotate per user request [REF#UI-00270 → see REF#PN-00844]
                        // Just gently bob up and down
                        group.position.y = Math.sin(t * 2) * 0.1;
                    };
                } else if (el === 'DICE_EVEN' || el === 'DICE_ODD' || el === 'DICE_CENTER') {
                    const dieGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
                    const dieMat = new THREE.MeshStandardMaterial({
                        color: el === 'DICE_CENTER' ? 0xffffff : 0xffffff, 
                        roughness: 0.2, metalness: 0.1
                    });
                    
                    if (el === 'DICE_CENTER') {
                        // Two completely mapped 3D Dice [REF#UI-00271 → see REF#PN-00845]
                        function createDie() {
                            const mat = new THREE.MeshStandardMaterial({
                                color: 0xffffff, 
                                emissive: 0xffffff,
                                emissiveIntensity: 0.6, /* Bright white to match symbols */
                                roughness: 1.0, metalness: 0.0 /* Flat non-metallic */
                            });
                            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
                            
                            const dotGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16);
                            const dotMat = new THREE.MeshStandardMaterial({
                                color: 0x000000, 
                                roughness: 1.0, 
                                metalness: 0.0
                            });
                            mesh.userData.dotMat = dotMat;
                            
                            function addDot(x, y, z, rx, ry, rz) {
                                const d = new THREE.Mesh(dotGeo, dotMat);
                                d.position.set(x, y, z);
                                if (rx) d.rotation.x = rx;
                                if (ry) d.rotation.y = ry;
                                if (rz) d.rotation.z = rz;
                                mesh.add(d);
                            }

                            // Side 1: +Z (1 dot) [REF#UI-00272 → see REF#PN-00846]
                            addDot(0, 0, 0.61, Math.PI/2, 0, 0);
                            
                            // Side 6: -Z (6 dots) [REF#UI-00273 → see REF#PN-00847]
                            for(let dx of [-0.3, 0.3]) for(let dy of [-0.3, 0, 0.3]) addDot(dx, dy, -0.61, Math.PI/2, 0, 0);
                            
                            // Side 2: +Y (2 dots) [REF#UI-00274 → see REF#PN-00848]
                            addDot(-0.3, 0.61, -0.3, 0, 0, 0);
                            addDot(0.3, 0.61, 0.3, 0, 0, 0);

                            // Side 5: -Y (5 dots) [REF#UI-00275 → see REF#PN-00848]
                            addDot(0, -0.61, 0, 0, 0, 0);
                            for(let dx of [-0.3, 0.3]) for(let dz of [-0.3, 0.3]) addDot(dx, -0.61, dz, 0, 0, 0);

                            // Side 3: +X (3 dots) [REF#UI-00276 → see REF#PN-00850]
                            addDot(0.61, 0, 0, 0, 0, Math.PI/2);
                            addDot(0.61, 0.3, -0.3, 0, 0, Math.PI/2);
                            addDot(0.61, -0.3, 0.3, 0, 0, Math.PI/2);

                            // Side 4: -X (4 dots) [REF#UI-00277 → see REF#PN-00850]
                            for(let dy of [-0.3, 0.3]) for(let dz of [-0.3, 0.3]) addDot(-0.61, dy, dz, 0, 0, Math.PI/2);
                            return mesh;
                        }

                        const d1 = createDie(true); d1.position.set(-0.8, 0, 0);
                        const d2 = createDie(false); d2.position.set(0.8, 0, 0);
                        
                        group.add(d1, d2);
                        update = (t) => {
                            if (window.diceSettleTime === undefined) window.diceSettleTime = -5000;
                            const speedMode = window.diceAttackSpin || 1.0;
                            if (window.diceAttackSpin > 1.0) window.diceAttackSpin -= 0.5; // Decay [REF#UI-00278]
                            
                            const dt = 0.016 * speedMode;
                            
                            if (speedMode > 1.1) {
                                d1.rotation.x += dt * 0.8; d1.rotation.y += dt * 1.1;
                                d2.rotation.x -= dt * 0.8; d2.rotation.y -= dt * 1.1;
                                window.diceSettleTime = performance.now();
                                d1.userData.targetRx = Math.round(d1.rotation.x / (Math.PI/2)) * (Math.PI/2);
                                d1.userData.targetRy = Math.round(d1.rotation.y / (Math.PI/2)) * (Math.PI/2);
                                d2.userData.targetRx = Math.round(d2.rotation.x / (Math.PI/2)) * (Math.PI/2);
                                d2.userData.targetRy = Math.round(d2.rotation.y / (Math.PI/2)) * (Math.PI/2);
                            } else {
                                const settleAge = performance.now() - window.diceSettleTime;
                                if (settleAge < 5000) {
                                    // Interpolate to locked orthogonal faces ("land on numbers") [REF#UI-00279 → see REF#PN-00853]
                                    d1.rotation.x += (d1.userData.targetRx - d1.rotation.x) * 0.15;
                                    d1.rotation.y += (d1.userData.targetRy - d1.rotation.y) * 0.15;
                                    d1.rotation.z += (0 - d1.rotation.z) * 0.15;
                                    d2.rotation.x += (d2.userData.targetRx - d2.rotation.x) * 0.15;
                                    d2.rotation.y += (d2.userData.targetRy - d2.rotation.y) * 0.15;
                                    d2.rotation.z += (0 - d2.rotation.z) * 0.15;
                                } else {
                                    // Resume normal lazy roll [REF#UI-00280 → see REF#PN-00854]
                                    d1.rotation.x += dt * 0.8; d1.rotation.y += dt * 1.1;
                                    d2.rotation.x -= dt * 0.8; d2.rotation.y -= dt * 1.1;
                                }
                                
                                // Cleanly interpolate all bobbing/floating toward 0 while settled! [REF#UI-00281 → see REF#PN-00855]
                                const isFrozen = (settleAge > 0 && settleAge < 5000 && speedMode <= 1.1);
                                const targetGrpY = isFrozen ? 0 : Math.sin(t * 0.5) * 0.3;
                                const targetD1Y = isFrozen ? 0 : Math.sin(t*2)*0.1;
                                const targetD2Y = isFrozen ? 0 : Math.cos(t*2)*0.1;
                                
                                group.rotation.y += (targetGrpY - group.rotation.y) * 0.15;
                                d1.position.y += (targetD1Y - d1.position.y) * 0.15;
                                d2.position.y += (targetD2Y - d2.position.y) * 0.15;
                            }
                            
                            const settleAge = performance.now() - (window.diceSettleTime || 0);
                            
                            // 1. Keep main cube bodies dark [REF#UI-00282 → see REF#PN-00856]
                            d1.material.emissiveIntensity = 0;
                            d2.material.emissiveIntensity = 0;
                            
                            // 2. Sequential Counting Sequence (Only active once landed and settled) [REF#UI-00283 → see REF#PN-00857]
                            if (speedMode <= 1.1 && settleAge > 0 && settleAge < 1500) {
                                d1.userData.dotMat.emissive.setHex(0x00ffa5);
                                d2.userData.dotMat.emissive.setHex(0x00ffa5);
                                
                                let f1 = 0, f2 = 0;
                                if (settleAge > 200 && settleAge <= 450) { f1 = 4.0; } // Die 1 Count [REF#UI-00284 → see REF#PN-00858]
                                else if (settleAge > 600 && settleAge <= 850) { f2 = 4.0; } // Die 2 Count [REF#UI-00285 → see REF#PN-00858]
                                else if (settleAge > 1000 && settleAge <= 1150) { f1 = 4.0; f2 = 4.0; } // Blink 1 [REF#UI-00286]
                                else if (settleAge > 1300 && settleAge <= 1450) { f1 = 4.0; f2 = 4.0; } // Blink 2 [REF#UI-00287]

                                d1.userData.dotMat.emissiveIntensity = f1;
                                d2.userData.dotMat.emissiveIntensity = f2;
                            } else {
                                d1.userData.dotMat.emissiveIntensity = 0;
                                d2.userData.dotMat.emissiveIntensity = 0;
                            }
                        };
                    } else {
                        // Original Single Die logic [REF#UI-00288 → see REF#PN-00862]
                        const die = new THREE.Mesh(dieGeo, dieMat);
                        const dotGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
                        const dotMat = new THREE.MeshStandardMaterial({color: el === 'DICE_EVEN' ? 0x1b5e20 : 0xb71c1c}); // Green for Even, Red for Odd [REF#UI-00289 → see REF#PN-00863]
                        
                        // Add standard center dot mapping (1 face) [REF#UI-00290 → see REF#PN-00864]
                        const dotCenter = new THREE.Mesh(dotGeo, dotMat);
                        dotCenter.rotation.x = Math.PI / 2;
                        dotCenter.position.z = 0.81;
                        die.add(dotCenter);

                        // Add opposing face (6 dots) [REF#UI-00291 → see REF#PN-00865]
                        for (let x of [-0.4, 0.4]) {
                            for (let y of [-0.4, 0, 0.4]) {
                                const d = new THREE.Mesh(dotGeo, dotMat);
                                d.rotation.x = -Math.PI / 2;
                                d.position.set(x, y, -0.81);
                                die.add(d);
                            }
                        }

                        group.add(die);
                        update = (t) => { 
                            die.rotation.x = t * (el === 'DICE_EVEN' ? 2.5 : -2.5); 
                            die.rotation.y = t * 3.1; 
                            die.rotation.z = Math.sin(t*2);
                        };
                    }
                }
                scene.add(group); scenes[el] = { scene, group, update };
            });

            // Hot-swap the PISTOL scene once the Pistol-45.usdz model finishes [REF#UI-00292]
            // loading. Defensive — validates the USDZ produced a non-empty,
            // sensibly-sized model. If the load was broken (zero bounds, NaN
            // scale, no visible mesh), the procedural pistol stays in place.
            window._refreshPistolIcon = function(){
                const src = window._pistol45Model;
                if (!src) return;
                const ps = scenes['PISTOL'];
                if (!ps || !ps.scene) return;
                // Validate the model has real bounds + at least one mesh. [REF#UI-00293 → see REF#PN-00891]
                let hasMesh = false;
                src.traverse(c => { if (c.isMesh && c.geometry) hasMesh = true; });
                if (!hasMesh){ console.warn('[Pistol-45] USDZ has no meshes — keeping procedural'); return; }
                const tmpBox = new THREE.Box3().setFromObject(src);
                const tmpSize = tmpBox.getSize(new THREE.Vector3());
                const tmpMax = Math.max(tmpSize.x, tmpSize.y, tmpSize.z);
                if (!isFinite(tmpMax) || tmpMax <= 0.001 || tmpMax > 1000){
                    console.warn('[Pistol-45] USDZ bounds invalid — keeping procedural');
                    return;
                }
                if (ps.group) ps.scene.remove(ps.group);
                const newGroup = new THREE.Group();
                newGroup.add(src.clone(true));
                ps.scene.add(newGroup);
                ps.group = newGroup;
                ps.update = (t) => {
                    newGroup.rotation.y = Math.sin(t * 1.2) * 0.30 + 0.18;
                    newGroup.rotation.z = Math.PI / 16;
                };
                if (window.canvasCache) window.canvasCache.lastScan = 0;
            };
            // If the model loaded BEFORE init3DIcons ran, swap immediately [REF#UI-00294 → see REF#PN-00892]
            if (window._pistol45Model) window._refreshPistolIcon();

            avatarClock = new THREE.Clock();
            
            // Single Global Camera for all 3D Icons [REF#UI-00295]
            const iconCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); 
            iconCamera.position.set(0, 0, 7.5);
            
            let lastRender = 0;
            const canvasCache = {};
            
            // Progressive Shader Pre-Warming Queue [REF#UI-00296 → see REF#PN-00894]
            const scenesToWarm = Object.values(scenes);
            let warmStarted = false;
            
            // Pre-compile all shaders outside the hot path to prevent 1261ms requestAnimationFrame violation [REF#UI-00297]
            setTimeout(() => {
                if (renderer.compile) {
                    scenesToWarm.forEach(s => renderer.compile(s.scene, iconCamera));
                }
                warmStarted = true;

                // Pre-warm the YOU GOT loot card render path so first pickup has zero stall. [REF#UI-00298 → see REF#PN-00896]
                // Inject a hidden card covering every element type so all canvas paths are hit during init.
                const _warmElements = ['KATANA', 'MISSILE', 'ITEM', 'EARTH', 'FIRE', 'WIND', 'WATER'];
                _warmElements.forEach(elId => {
                    const _warmCard = document.createElement('div');
                    _warmCard.className = 'guide-card yg-anim-trigger-3d';
                    _warmCard.dataset.depth = '0';
                    _warmCard.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:84px;height:126px;opacity:0;pointer-events:none;z-index:-1;';
                    _warmCard.innerHTML = `<div class="card-icon-3d" data-element="${elId}"><canvas></canvas></div>`;
                    document.body.appendChild(_warmCard);
                    // Force cache rescan to include this element immediately [REF#UI-00299 → see REF#PN-00897]
                    if (window.canvasCache) window.canvasCache.lastScan = 0;
                    // Remove after 2 frames worth of renders (ensures GPU path is compiled) [REF#UI-00300 → see REF#PN-00898]
                    setTimeout(() => _warmCard.remove(), 2000);
                });
            }, 100);
            
            function renderLoop(time) {
                requestAnimationFrame(renderLoop);
                
                // RESTORED 30FPS THROTTLE:  [REF#UI-00301]
                // Running 2D canvas ctx.drawImage() 15x per frame at 120Hz destroys CPU performance!
                // Capping the PiP UI blitting to 30fps restores the FPV engine to full speed.
                if (time - lastRender < 33) return;
                lastRender = time;
                
                // Optimization: Do not render heavy 3D icons or avatars when the main dock is hidden [REF#UI-00302 → see REF#PN-00902]
                const encounterZone = document.getElementById('encounter-zone');
                const uiRowHidden = document.getElementById('lower-ui-row') ? document.getElementById('lower-ui-row').style.display === 'none' : false;
                if (uiRowHidden && (!encounterZone || !encounterZone.classList.contains('active'))) return;
                
                const t = time * 0.001;
                const delta = avatarClock.getDelta();
                
                if (avatarMixer) {
                    avatarMixer.update(delta);
                }
                
                // ========================================== [REF#UI-00303 → see REF#PN-00908]
                // PASS 1: STRICT DOM READS (No modifications)
                // ==========================================
                let avatarW = 0, avatarH = 0;
                let avatarContainer = null;
                if (avatarRenderer && avatarScene && avatarCamera) {
                    avatarContainer = document.getElementById('player-avatar-container');
                    if (avatarContainer) {
                        avatarW = avatarContainer.clientWidth;
                        avatarH = avatarContainer.clientHeight;
                    }
                }

                // Regenerate canvas cache every 500ms to avoid DOM polling spikes [REF#UI-00304 → see REF#PN-00911]
                if (time - canvasCache.lastScan > 500 || !canvasCache.lastScan) {
                    canvasCache.lastScan = time;
                    canvasCache.elements = document.querySelectorAll(
                        '.guide-card[data-depth="0"] .card-icon-3d, .wager-card .card-icon-3d, .kp-center-btn[data-element="DICE_CENTER"], .kp-center-btn[data-icon="DICE_CENTER"], #floating-loot-layer .card-icon-3d, .yg-anim-trigger-3d .card-icon-3d'
                    );
                }

                if (warmStarted && canvasCache.elements) {
                    // Batch measure ALL elements to prevent synchronous layout thrashing (fixes 1200ms violation) [REF#UI-00305 → see REF#PN-00912]
                    canvasCache.elements.forEach(container => {
                        const cvs = container.querySelector('canvas') || (container.firstChild && container.firstChild.nodeName === 'CANVAS' ? container.firstChild : null);
                        if (cvs && (!cvs.dataset.cw || cvs.dataset.cw === "0")) {
                            cvs.dataset.cw = cvs.clientWidth;
                            cvs.dataset.ch = cvs.clientHeight;
                        }
                    });
                }

                // ========================================== [REF#UI-00306 → see REF#PN-00913]
                // PASS 2: STRICT DOM WRITES & RENDERING
                // ==========================================
                if (avatarRenderer && avatarScene && avatarCamera && avatarW > 0 && avatarH > 0) {
                    const canvas = avatarRenderer.domElement;
                    if (canvas.width !== avatarW * dpr || canvas.height !== avatarH * dpr) {
                        avatarRenderer.setPixelRatio(dpr);
                        avatarRenderer.setSize(avatarW, avatarH, true);
                        avatarCamera.aspect = avatarW / avatarH;
                        avatarCamera.updateProjectionMatrix();
                    }
                    avatarRenderer.render(avatarScene, avatarCamera);
                }

                // Update rotational logic for all 3D components [REF#UI-00307 → see REF#PN-00914]
                elements.forEach(el => scenes[el].update(t));

                if (warmStarted && canvasCache.elements) {
                    // Draw and modify canvas dimensions [REF#UI-00308]
                    canvasCache.elements.forEach(container => {
                        const el = container.dataset.element || container.dataset.icon;
                        if (!el || !scenes[el]) return;
                        
                        const cvs = container.querySelector('canvas') || (container.firstChild && container.firstChild.nodeName === 'CANVAS' ? container.firstChild : null);
                        if (!cvs) return;

                        // Fallback read if somehow missed or 0 [REF#UI-00309]
                        if (!cvs.dataset.cw || cvs.dataset.cw === "0") {
                            cvs.dataset.cw = cvs.clientWidth;
                            cvs.dataset.ch = cvs.clientHeight;
                        }
                        const cw = parseFloat(cvs.dataset.cw);
                        const ch = parseFloat(cvs.dataset.ch);
                        
                        if (cw === 0 || ch === 0) return; 
                        const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
                        
                        if (cvs.width !== w || cvs.height !== h) { 
                            cvs.width = w; 
                            cvs.height = h; 
                        }
                        
                        renderer.render(scenes[el].scene, iconCamera);
                        
                        const ctx = cvs.getContext('2d', { alpha: true, desynchronized: true }); 
                        if (ctx) { 
                            ctx.clearRect(0, 0, w, h); 
                            ctx.drawImage(renderer.domElement, 0, 0, w, h); 
                        }
                    });
                }
            }
            renderLoop(0);
        }

        function initAvatar() {
            const container = document.getElementById('player-avatar-container');
            if (!container) return;
            
            const w = container.clientWidth || 58;
            const h = container.clientHeight || 58;
            
            avatarRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            avatarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
            avatarRenderer.setSize(w, h);
            container.appendChild(avatarRenderer.domElement);
            
            avatarScene = new THREE.Scene();
            avatarCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
            avatarCamera.position.set(0, 1.2, 4.5);
            avatarCamera.lookAt(0, 1.0, 0);
            
            const ambLight = new THREE.AmbientLight(0xffffff, 1.2);
            avatarScene.add(ambLight);
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
            dirLight.position.set(5, 5, 5);
            avatarScene.add(dirLight);
            
            try {
                const loader = new GLTFLoader();
                const modelUrls = [
                    './assets/models/player/Player.A.Walking.glb',
                    '../assets/models/player/Player.A.Walking.glb',
                ];
                
                function tryLoadModel(urlIndex) {
                    if (urlIndex >= modelUrls.length) {
                        console.warn("UI Avatar failed to load natively after all attempts.");
                        container.innerHTML = '<i class="fa-solid fa-user-astronaut" style="color:var(--color-text); font-size:24px;"></i>';
                        return;
                    }
                    
                    loader.load(modelUrls[urlIndex], (gltf) => {
                        const model = gltf.scene;
                        
                        model.position.set(0, -0.1, 0);
                        model.rotation.y = Math.PI / 8;
                        model.scale.set(1.25, 1.25, 1.25);
                        
                        model.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.needsUpdate = true;
                            }
                        });
                        
                        avatarScene.add(model);
                        
                        if (gltf.animations && gltf.animations.length > 0) {
                            avatarMixer = new THREE.AnimationMixer(model);
                            gltf.animations.forEach((anim, i) => {
                                const action = avatarMixer.clipAction(anim);
                                avatarActions[anim.name.toLowerCase()] = action;
                                avatarActions[i] = action;
                            });
                            
                            // Map best matches [REF#UI-00310]
                            avatarIdleAction = avatarActions['idle'] || avatarActions['stand'];
                            avatarActions.walk = avatarActions['walk'] || avatarActions['run'] || avatarActions['walking'] || avatarActions[1] || avatarActions[0];
                            avatarActions.slash = avatarActions['attack'] || avatarActions['slash'] || avatarActions[2] || avatarActions[1] || avatarActions.walk;
                            
                            if (!avatarIdleAction) {
                                avatarIdleAction = avatarActions[0] || avatarMixer.clipAction(gltf.animations[0]);
                            }
                            avatarActions['idle'] = avatarIdleAction;
                            
                            // Play idle immediately if it logically exists [REF#UI-00311 → see REF#PN-00933]
                            if (avatarIdleAction) {
                                avatarCurrentAction = avatarIdleAction;
                                if (avatarIdleAction === avatarActions.walk) avatarIdleAction.setEffectiveTimeScale(0);
                                avatarIdleAction.play();
                            }
                        }
                        
                        // Fix metallic/roughness issues that might make it render black [REF#UI-00312]
                        model.traverse((child) => {
                            if (child.isMesh) {
                                child.material = new THREE.MeshLambertMaterial({ 
                                    color: 0xcccccc
                                });
                            }
                        });
                        
                    }, undefined, (e) => {
                        console.warn(`Failed loading avatar from ${modelUrls[urlIndex]}`, e);
                        tryLoadModel(urlIndex + 1);
                    });
                }
                
                tryLoadModel(0);
                
            } catch (err) {
                console.warn("Avatar loader threw synchronous exception. Suppressing.", err);
            }
        }

        function cycle(idx, fwd = true) {
            const col = document.getElementById(`col-${idx}`);
            if (!col) return;
            const cards = Array.from(col.querySelectorAll('.guide-card'));
            if(cards.length <= 1) return;
            cards.forEach(c => {
                let d = parseInt(c.dataset.depth);
                c.dataset.depth = fwd ? (d === cards.length - 1 ? 0 : d + 1) : (d === 0 ? cards.length - 1 : d - 1);
            });
        }

        function setup() {
            loadDeck(categories);
            UXAI.initViewportManager();
            
            document.getElementById('bottom-panel').addEventListener('wheel', e => {
                if (document.activeElement.id !== 'bottom-panel' || wheelThrottle) return;
                e.preventDefault(); wheelThrottle = true; cycle(focusedColIndex, e.deltaY > 0); setTimeout(() => wheelThrottle = false, 150);
            }, { passive: false });
            const params = new URLSearchParams(window.location.search);
            const mode = params.get('mode');
            if (mode !== 'combat') {
                initAvatar();
            }
        }

        function playAvatarAnim(name) {
            const btn = document.getElementById('player-avatar-container');
            if (btn) {
                btn.classList.remove('anim-idle-btn', 'anim-walk-btn', 'anim-slash-btn');
                if (name === 'slash' || name === 'attack') btn.classList.add('anim-slash-btn');
                else if (name === 'walk') btn.classList.add('anim-walk-btn');
                else if (name === 'idle') btn.classList.add('anim-idle-btn');
                
                // Keep walking state active if currently moving [REF#UI-00313 → see REF#PN-01005]
                if (typeof isMoving !== 'undefined' && isMoving && name !== 'slash' && name !== 'attack') {
                    btn.classList.add('anim-walk-btn');
                    btn.classList.remove('anim-idle-btn');
                }
            }

            if (!avatarActions || !avatarMixer) {
                // If there's no 3D avatar loaded, handle the CSS slash animation reset manually [REF#UI-00314 → see REF#PN-01006]
                if (name === 'slash' || name === 'attack') {
                    setTimeout(() => {
                        playAvatarAnim(typeof isMoving !== 'undefined' && isMoving ? 'walk' : 'idle');
                    }, 400); // matches the 0.4s avatarSlashBtn animation duration [REF#UI-00315 → see REF#PN-01007]
                }
                return;
            }
            
            const targetAction = avatarActions[name];
            if (!targetAction || targetAction === avatarCurrentAction) return;

            if (avatarCurrentAction) {
                targetAction.time = 0;
                let timescale = name === 'walk' ? 1.5 : 1;
                // If we fallback to walk animation for idle, pause it so they stand still [REF#UI-00316 → see REF#PN-01008]
                if (name === 'idle' && targetAction === avatarActions['walk']) timescale = 0;
                targetAction.setEffectiveTimeScale(timescale);
                targetAction.setEffectiveWeight(1);
                targetAction.crossFadeFrom(avatarCurrentAction, 0.2, true);
            } else {
                let timescale = name === 'walk' ? 1.5 : 1;
                if (name === 'idle' && targetAction === avatarActions['walk']) timescale = 0;
                targetAction.setEffectiveTimeScale(timescale);
            }
            targetAction.play();
            avatarCurrentAction = targetAction;
            
            if (name === 'slash' || name === 'attack') {
                targetAction.setLoop(THREE.LoopOnce, 1);
                targetAction.clampWhenFinished = true;
                const onFinished = (e) => {
                    if (e.action === targetAction) {
                        avatarMixer.removeEventListener('finished', onFinished);
                        playAvatarAnim(typeof isMoving !== 'undefined' && isMoving ? 'walk' : 'idle');
                    }
                };
                avatarMixer.addEventListener('finished', onFinished);
            } else {
                targetAction.setLoop(THREE.LoopRepeat);
            }
            
            avatarCurrentAction = targetAction;
        }

        function launchModal(card) {
            pendingAction = card.dataset.cardAction || card.querySelector('.card-title').textContent;
            const content = document.getElementById('modal-content');
            content.innerHTML = card.innerHTML;
            content.className = `modal-card-hd ${card.className}`;
            const styles = getComputedStyle(card);
            document.getElementById('launch-modal').style.setProperty('--modal-theme-clr', styles.getPropertyValue('--theme-clr'));
            document.getElementById('launch-modal').classList.add('active');
            document.getElementById('modal-overlay').classList.add('active');
            window.parent.postMessage({ type: 'MODAL_STATE', isOpen: true }, '*');
        }

        // Focus the column whose top card matches the given card name (case- [REF#UI-00317 → see REF#PN-01009]
        // insensitive). Used by RANGED_ATTACK / CHANGE_SPELLS to re-select the
        // last fired card after a deck switch.
        window._focusCardByName = function(name){
            if (!name) return false;
            const want = String(name).toUpperCase();
            const cols = document.querySelectorAll('.card-column');
            for (let i = 0; i < cols.length; i++){
                const top = cols[i].querySelector('.guide-card[data-depth="0"] .card-title');
                if (top && top.textContent.trim().toUpperCase() === want){
                    setFocus(i, true);
                    return true;
                }
            }
            return false;
        };

        // ── Per-card SFX hook ────────────────────────────────────────────── [REF#UI-00318 → see REF#PN-01010]
        // Tiny helper so we don't pull in a full audio context for one cue.
        // Caches one Audio per path so repeated plays don't allocate.
        const _sfxPool = {};
        window._panelsPlaySfx = function(path, volume){
            try {
                let a = _sfxPool[path];
                if (!a) { a = new Audio(path); _sfxPool[path] = a; }
                a.volume = Math.max(0, Math.min(1, volume ?? 0.85));
                a.currentTime = 0;
                a.play().catch(()=>{});
            } catch (_) {}
        };
        // Track the last card name we fired a select-SFX for, so navigating [REF#UI-00319 → see REF#PN-01011]
        // away and back to PISTOL retriggers, but holding focus on PISTOL
        // through unrelated re-renders does not.
        window._lastSfxCardName = null;

        function setFocus(idx, scroll = true) {
            // Clamp against the columns that actually exist (the deck can be [REF#UI-00320 → see REF#PN-01012]
            // smaller than `categories` after qty-0 hides). Falls back to no-op
            // if there are no columns rendered at all.
            const cols = document.querySelectorAll('.card-column');
            if (!cols.length){ focusedColIndex = 0; return; }
            const safeIdx = Math.max(0, Math.min(cols.length - 1, idx | 0));
            focusedColIndex = safeIdx;
            cols.forEach((c, i) => c.classList.toggle('focused', i === safeIdx));
            if (scroll) {
                const container = document.getElementById('guides-container');
                // Prefer the deterministic id; if that's missing (e.g. ids got [REF#UI-00321 → see REF#PN-01013]
                // renumbered when categories were filtered out), fall back to
                // the column at the safeIdx position.
                const col = document.getElementById(`col-${safeIdx}`) || cols[safeIdx];
                if (col && container){
                    container.scrollTo({
                        left: col.offsetLeft - (container.offsetWidth/2) + (col.offsetWidth/2),
                        behavior: 'smooth',
                    });
                }
            }
            // Per-card select SFX. PISTOL racks a fresh magazine (chk-chk) [REF#UI-00322 → see REF#PN-01014]
            // whenever its column becomes the focused one via keyboard. Other
            // cards fall through silently. Guarded by _lastSfxCardName so
            // arrow-spam over the same column doesn't retrigger.
            const focusedCol = document.getElementById(`col-${safeIdx}`) || cols[safeIdx];
            const topTitleEl = focusedCol?.querySelector('.guide-card[data-depth="0"] .card-title');
            const topName    = topTitleEl ? topTitleEl.textContent.trim().toUpperCase() : null;
            if (topName !== window._lastSfxCardName){
                window._lastSfxCardName = topName;
                if (topName === 'PISTOL'){
                    window._panelsPlaySfx('./assets/sounds/Dungeon/reload-pistol.mp3', 0.85);
                }
            }
        }

        window.closeModal = () => { 
            document.getElementById('launch-modal').classList.remove('active'); 
            document.getElementById('modal-overlay').classList.remove('active'); 
            window.parent.postMessage({ type: 'MODAL_STATE', isOpen: false }, '*');
        };
        
        // Exit Modal Logic [REF#UI-00323 → see REF#PN-01097]
        let exitModalActive = false;
        window.showExitModal = () => {
            if (exitModalActive) return;
            exitModalActive = true;
            document.getElementById('exit-modal').classList.add('active');
            document.getElementById('modal-overlay').classList.add('active');
            window.parent.postMessage({ type: 'MODAL_STATE', isOpen: true }, '*');
        };
        window.hideExitModal = () => {
            exitModalActive = false;
            document.getElementById('exit-modal').classList.remove('active');
            document.getElementById('modal-overlay').classList.remove('active');
            window.parent.postMessage({ type: 'MODAL_STATE', isOpen: false }, '*');
        };
        window.confirmExit = () => {
            console.log("EXITING DUNGEON");
            sessionStorage.removeItem('origami.v8.seed');
            sessionStorage.removeItem('origami.v8.descent');
            window.location.reload(); 
            window.parent.location.reload(); // Hard reset game [REF#UI-00324 → see REF#PN-01099]
        };

        // Exit Modal Keyboard Listener (Any key dismisses, only 'y' resets) [REF#UI-00325 → see REF#PN-01100]
        window.addEventListener('keydown', (e) => {
            if (exitModalActive) {
                if (e.key.toLowerCase() === 'y') {
                    window.confirmExit();
                } else {
                    window.hideExitModal();
                }
            }
        });

        window.toggleDarkMode = () => document.body.classList.toggle('dark-mode');
        window.toggleDpad = () => {
            const lp = document.getElementById('left-panel');
            if (lp) lp.classList.toggle('dpad-hidden');
        };
        window.toggleAutoPickup = function(enabled) {
            window.parent.postMessage({ type: 'TOGGLE_AUTOPICKUP', enabled: enabled }, '*');
        };

        window.openSettings = function() {
            const modal = document.getElementById('settings-modal');
            if(modal) modal.style.display = 'block';
        };

        // ── Save / Load Modal ───────────────────────────────────────────── [REF#UI-00326 → see REF#PN-01207]
        // Save names are user-supplied; we ask the engine to read/write the
        // localStorage manifest because the engine owns the dungeon state.
        // The panels side only adds the inventory snapshot to each save.
        window.openSaveModal = function(){
            const overlay = document.getElementById('save-modal-overlay');
            if(!overlay) return;
            overlay.classList.add('active');
            // Default save name to "Floor N — HH:MM" so the player can hit [REF#UI-00327]
            // Save and immediately have a labelled snapshot.
            const input = document.getElementById('save-name-input');
            if (input){
                const f = (window._currentFloor != null) ? window._currentFloor : '?';
                const t = new Date();
                const hh = String(t.getHours()).padStart(2,'0');
                const mm = String(t.getMinutes()).padStart(2,'0');
                input.value = `Floor ${f} — ${hh}:${mm}`;
                setTimeout(() => { input.focus(); input.select(); }, 30);
            }
            // Ask engine for fresh save list. [REF#UI-00328]
            window.parent.postMessage({type:'LIST_SAVES'}, '*');
        };
        window.closeSaveModal = function(){
            const overlay = document.getElementById('save-modal-overlay');
            if(overlay) overlay.classList.remove('active');
        };
        window.saveCurrentGame = function(){
            const input = document.getElementById('save-name-input');
            if (!input) return;
            const name = (input.value || '').trim();
            if (!name){
                input.style.borderColor = 'rgba(255,90,90,0.7)';
                setTimeout(() => { input.style.borderColor = ''; }, 600);
                return;
            }
            window.parent.postMessage({
                type: 'SAVE_NOW',
                name,
                inventory: window.cardInventoryCounts || {},
            }, '*');
        };
        window.loadSavedGame = function(name){
            window.parent.postMessage({type:'LOAD_NOW', name}, '*');
        };
        window.deleteSavedGame = function(name){
            if (!confirm(`Delete save "${name}"? This cannot be undone.`)) return;
            window.parent.postMessage({type:'DELETE_SAVE', name}, '*');
        };
        // Render the list of saves into the modal (called when SAVE_LIST [REF#UI-00329 → see REF#PN-01219]
        // message arrives from the engine).
        window.renderSaveList = function(saves){
            const list = document.getElementById('save-modal-list');
            if (!list) return;
            list.innerHTML = '';
            if (!saves || !saves.length){
                list.innerHTML = '<div class="save-empty">No saves yet — type a name and hit Save.</div>';
                return;
            }
            // Most-recent-first [REF#UI-00330]
            const sorted = saves.slice().sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
            for (const s of sorted){
                const row = document.createElement('div');
                row.className = 'save-row';
                const when = s.timestamp ? new Date(s.timestamp).toLocaleString() : '';
                const safeName = String(s.name || '').replace(/"/g,'&quot;');
                row.innerHTML = `
                    <div class="save-row-meta">
                        <div class="save-row-name">${safeName}</div>
                        <div class="save-row-sub">Floor ${s.floor ?? '?'} · Lv ${s.level ?? '?'} · HP ${s.hp ?? '?'}/${s.maxHp ?? '?'} · ${s.kills ?? 0} kills · ${when}</div>
                    </div>
                    <button type="button" class="save-row-btn load" data-name="${safeName}">Load</button>
                    <button type="button" class="save-row-btn del"  data-name="${safeName}">Delete</button>
                `;
                row.querySelector('.load').addEventListener('click', () => window.loadSavedGame(s.name));
                row.querySelector('.del') .addEventListener('click', () => window.deleteSavedGame(s.name));
                list.appendChild(row);
            }
        };

        window.closeSettings = function() {
            const modal = document.getElementById('settings-modal');
            if(modal) modal.style.display = 'none';
        };

        window.currentMonsterGridDistance = Infinity;

        window.lastCombatAttack = null;

        window.handleSidePanelAttack = function(btnElement) {
            const action = window.lastCombatAttack || 'SLASH';
            emitAction(action, btnElement);
        };

        window.emitAction = (a, explicitBtn = null) => { 
            if (a === 'SET') {
                window.openSettings();
                return;
            }
            
            const isUIAction = ['SET', 'WAGER', 'PARLEY', 'HIDE', 'RETREAT', 'RANGED_ATTACK', 'CHANGE_SPELLS', 'OBSERVE', 'BET_EVEN', 'BET_ODD', 'REST', 'HEAL', 'VIEW', 'LOG'].includes(a);
            if (!isUIAction && a) {
                window.lastCombatAttack = a;
                // Track most recent missile + spell separately so the deck- [REF#UI-00331 → see REF#PN-01287]
                // switch buttons can re-select the right card on click.
                if (a === 'SHURIKEN' || a === 'DAGGER' || a === 'SHORT BOW' || a === 'LONG BOW' || a === 'CROSSBOW' || a === 'PISTOL'){
                    window.lastMissileAttack = a;
                } else if (a === 'BOULDER' || a === 'FISSURE' || a === 'GALE' || a === 'CYCLONE' || a === 'FIREBALL' || a === 'PYROBLAST' || a === 'COMET' || a === 'TIDE' || a === 'SURGE'){
                    window.lastSpellAttack = a;
                }
                // Generic per-deck tracking — pre-selects this card next time [REF#UI-00332 → see REF#PN-01288]
                // the player switches back to its deck.
                try {
                    const DECK_LOOKUP = {
                        SPELLS:  spellCategories,
                        MELEE:   combatCategories,
                        RANGED:  rangeCategories,
                        ITEM:    itemCategories,
                    };

                    for (const [dn, cats] of Object.entries(DECK_LOOKUP)){
                        if (cats && cats.some(c => c.cards && c.cards.includes(a))){
                            window._lastUsedByDeck[dn] = a;
                            break;
                        }
                    }
                } catch (_) {}
            }



            // Deck-switch UI buttons are pure-UI — never broadcast to the engine [REF#UI-00333 → see REF#PN-01290]
            // (the engine has no handler and was firing placeholder geometry).
            const isDeckSwitchUI = (a === 'RANGED_ATTACK' || a === 'CHANGE_SPELLS');
            if (!isDeckSwitchUI) {
                window.parent.postMessage({ type: 'FPV_ACTION', action: a }, '*');
            }

            // T0.7.1 — Any card launch (real attack / spell / missile, not a [REF#UI-00334 → see REF#PN-01294]
            // UI action and not the ATTACK button which re-cycles the deck)
            // forcibly exits keyboard-selection mode so the player can move
            // freely again. Pressing Enter re-engages it (see global Enter
            // handler below). _closeCardSelector handles all chrome cleanup.
            if (!isUIAction && a && a !== 'ATTACK') {
                if (window._closeCardSelector) window._closeCardSelector('fired');
            }

            let btn = explicitBtn;
            if (!btn && window.event && window.event.currentTarget) {
                btn = window.event.currentTarget;
            }
            if (btn && btn.classList) {
                btn.classList.add('punch-anim');
                setTimeout(() => btn.classList.remove('punch-anim'), 300);
                
                if (btn.dataset.qty !== undefined) {
                    let qty = parseInt(btn.dataset.qty);
                    if (qty > 0) {
                        const isRanged = (a === 'SHORT BOW' || a === 'LONG BOW' || a === 'SHURIKEN' || a === 'DAGGER' || a === 'CROSSBOW');
                        let recover = false;
                        if (isRanged && Math.random() < 0.5) {
                            recover = true;
                            if (window.logEvent) window.logEvent(`Recovered 1 ${a} (Ammo Retained)`, 'loot');
                        }
                        
                        if (!recover) {
                            qty--;
                            btn.dataset.qty = qty;
                            const badge = btn.querySelector('.card-badge');
                            if (badge) badge.textContent = qty;

                            if (qty <= 0) {
                                // PISTOL gets a RELOAD cycle instead of being [REF#UI-00335]
                                // removed — empty mag → 1.5s reload sequence
                                // (mag drop click + insert clack + slide rack)
                                // → mag refilled to 7. Card stays in the deck
                                // but goes muted + non-interactive during the
                                // reload window so the player visually sees it.
                                if (a === 'PISTOL'){
                                    btn.dataset.reloading = '1';
                                    btn.style.opacity = '0.42';
                                    btn.style.pointerEvents = 'none';
                                    if (badge) badge.textContent = '…';
                                    // RELOADING badge overlay (replaces the [REF#UI-00336 → see REF#PN-01308]
                                    // qty number for the duration).
                                    if (window.logEvent) window.logEvent('🔄 RELOADING…', 'system');
                                    // Three-stage SFX through a tiny dedicated [REF#UI-00337 → see REF#PN-01309]
                                    // AudioContext: mag drop (200ms in), mag
                                    // insert (700ms in), slide rack (1200ms in)
                                    try {
                                        const Ctx = window.AudioContext || window.webkitAudioContext;
                                        const ac  = window._reloadAC || (window._reloadAC = Ctx ? new Ctx() : null);
                                        if (ac){
                                            const click = (delay, f1, f2, dur, vol) => {
                                                const o = ac.createOscillator();
                                                o.type = 'square';
                                                const g = ac.createGain();
                                                const t0 = ac.currentTime + delay;
                                                o.frequency.setValueAtTime(f1, t0);
                                                o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
                                                g.gain.setValueAtTime(vol, t0);
                                                g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
                                                o.connect(g); g.connect(ac.destination);
                                                o.start(t0); o.stop(t0 + dur + 0.02);
                                            };
                                            click(0.20,  900,  450, 0.06, 0.08);  // mag drop [REF#UI-00338]
                                            click(0.70, 1400,  600, 0.07, 0.10);  // mag insert [REF#UI-00339]
                                            click(1.20, 3200, 1100, 0.09, 0.12);  // slide rack [REF#UI-00340]
                                        }
                                    } catch (_) {}
                                    // After 1.5s — restore mag + re-enable [REF#UI-00341 → see REF#PN-01313]
                                    setTimeout(() => {
                                        btn.dataset.qty = '7';
                                        delete btn.dataset.reloading;
                                        btn.style.opacity = '1';
                                        btn.style.pointerEvents = 'auto';
                                        if (badge) badge.textContent = '7';
                                        if (window.logEvent) window.logEvent('🔫 PISTOL ready — 7 rounds chambered.', 'system');
                                    }, 1500);
                                    return;
                                }
                                // All other ammo cards fade + remove as before [REF#UI-00342]
                                btn.style.opacity = '0';
                                btn.style.pointerEvents = 'none';
                                const col = btn.parentElement;
                                setTimeout(() => {
                                    btn.remove();
                                    if (col) {
                                        const remaining = Array.from(col.querySelectorAll('.guide-card'));
                                        if (remaining.length === 0) {
                                            col.remove();
                                        } else {
                                            remaining.forEach((c, idx) => c.dataset.depth = idx.toString());
                                        }
                                    }
                                }, 400);
                            }
                        }
                    } else if (qty <= 0) {
                        // PISTOL on empty (during reload) — empty-mag click [REF#UI-00343]
                        // sound so the player gets feedback they're pressing
                        // it but it's not ready.
                        if (a === 'PISTOL' && btn.dataset.reloading === '1'){
                            try {
                                const Ctx = window.AudioContext || window.webkitAudioContext;
                                const ac  = window._reloadAC || (window._reloadAC = Ctx ? new Ctx() : null);
                                if (ac){
                                    const t0 = ac.currentTime;
                                    const o = ac.createOscillator();
                                    o.type = 'square';
                                    o.frequency.setValueAtTime(1100, t0);
                                    o.frequency.exponentialRampToValueAtTime(700, t0 + 0.04);
                                    const g = ac.createGain();
                                    g.gain.setValueAtTime(0.08, t0);
                                    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
                                    o.connect(g); g.connect(ac.destination);
                                    o.start(t0); o.stop(t0 + 0.06);
                                }
                            } catch (_) {}
                        }
                        return; // Block action if depleted! [REF#UI-00344 → see REF#PN-01316]
                    }
                }
            }
            
            // Dice UI Toggle [REF#UI-00345 → see REF#PN-01317]
            if (a === 'WAGER') {
                const guideCont = document.getElementById('guides-container');
                const diceCont = document.getElementById('dice-container');
                guideCont.style.opacity = '0';
                setTimeout(() => {
                    guideCont.style.display = 'none';
                    diceCont.classList.add('active');
                }, 400); // Wait for fade out [REF#UI-00346 → see REF#PN-01318]
                return;
            }
            
            if (a === 'BET_EVEN' || a === 'BET_ODD') {
                if (window.playerGold === undefined) window.playerGold = 0;
                const wagerAmount = 10;
                if (window.playerGold < wagerAmount) {
                    emitAction('LOG'); 
                    window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `Not enough gold! You need ${wagerAmount} Gold.` }, '*');
                    return;
                }
                const isEven = (a === 'BET_EVEN');
                if (typeof window.rollDiceAnimation === 'function') window.rollDiceAnimation(isEven, wagerAmount);
                return;
            }

            // ── ATTACK: context-sensitive deck switch ── [REF#UI-00347 → see REF#PN-01319]
            // No longer a blind cycle. Picks MELEE if a monster is engaged
            // in melee range (≤ 2 tiles), otherwise SPELLS for ranged combat.
            // The RANGED_ATTACK button below locks MISSILE until the player
            // explicitly hits ATTACK again.
            if (a === 'ATTACK') {
                playAvatarAnim('slash');
                if (!window.isKeyboardSelectorActive) {
                    window._openCardSelector();
                }
                const inMelee = (typeof window.currentMonsterGridDistance === 'number')
                    && window.currentMonsterGridDistance > 0
                    && window.currentMonsterGridDistance <= 2.0;
                window.cycleCardClass(inMelee ? 'MELEE' : 'SPELLS');
                // Clear deck-switch highlights whenever ATTACK takes over. [REF#UI-00348 → see REF#PN-01320]
                document.querySelectorAll('.btn-ranged.active-deck, .btn-spells.active-deck').forEach(b => b.classList.remove('active-deck'));
            } else if (a === 'RANGED_ATTACK') {
                // Check the live MISSILE inventory for any card with qty > 0. [REF#UI-00349 → see REF#PN-01321]
                // If none, refuse the switch and log the empty-ammo message.
                const availableMissiles = rangeCategories.filter(c => (c.qty || 0) > 0 && c.cards && c.cards.length);
                if (!availableMissiles.length){
                    if (window.logEvent) window.logEvent('No missile ammunition found…', 'damage');
                    return;
                }
                if (!window.isKeyboardSelectorActive) window._openCardSelector();
                window.cycleCardClass('RANGED');

                document.querySelectorAll('.btn-ranged').forEach(b => b.classList.add('active-deck'));
                document.querySelectorAll('.btn-spells.active-deck').forEach(b => b.classList.remove('active-deck'));
                // Auto-select the player's last missile if it's still in stock, [REF#UI-00350 → see REF#PN-01322]
                // otherwise focus the first available card so they can fire it.
                const prefer = window.lastMissileAttack;
                const pickCat = availableMissiles.find(c => c.cards[0] === prefer) || availableMissiles[0];
                if (pickCat && typeof window._focusCardByName === 'function'){
                    setTimeout(() => window._focusCardByName(pickCat.cards[0]), 0);
                }
            } else if (a === 'CHANGE_SPELLS') {
                // Spell cards don't track qty — they're always "available" if [REF#UI-00351 → see REF#PN-01323]
                // the deck has any entries. Switch to SPELLS, auto-focus last.
                if (!spellCategories || !spellCategories.length){
                    if (window.logEvent) window.logEvent('No Spell cards found…', 'damage');
                    return;
                }
                if (!window.isKeyboardSelectorActive) window._openCardSelector();
                window.cycleCardClass('SPELLS');
                document.querySelectorAll('.btn-ranged.active-deck').forEach(b => b.classList.remove('active-deck'));
                document.querySelectorAll('.btn-spells').forEach(b => b.classList.add('active-deck'));
                const preferS = window.lastSpellAttack;
                const flatSpellCards = spellCategories.flatMap(c => (c.cards || []));
                const pickS = (preferS && flatSpellCards.includes(preferS)) ? preferS : (flatSpellCards[0] || null);
                if (pickS && typeof window._focusCardByName === 'function'){
                    setTimeout(() => window._focusCardByName(pickS), 0);
                }
            } else if (a === 'RETREAT' || a === 'HIDE') {
                loadDeck(CARD_CLASS_DECKS[window.cardClass] || spellCategories);
            }
        };

        function loadDeck(newCategories) {
            categories = newCategories;
            const container = document.getElementById('guides-container');
            container.innerHTML = '';
            // colIdx counts only RENDERED columns so IDs are always consecutive [REF#UI-00352]
            // (col-0, col-1, col-2…). Using the forEach idx instead created gaps
            // when qty-0 categories were skipped — e.g. DAGGER at idx=1 got
            // skipped but consumed the id, so SHORT BOW became col-2 while
            // focusedColIndex=1 (the rendered position) looked for #col-1 → null,
            // breaking bloom and Enter-to-fire for every MISSILE card after it.
            let colIdx = 0;
            categories.forEach((cat, idx) => {
                // T0.7 — separator marker between melee + ranged in COMBAT class [REF#UI-00353 → see REF#PN-01373]
                if (cat.separator) {
                    const sep = document.createElement('div');
                    sep.className = 'combat-separator';
                    sep.dataset.skipCycle = '1';
                    container.appendChild(sep);
                    return;
                }
                // Skip ammo/limited categories whose qty has been explicitly [REF#UI-00354 → see REF#PN-01374]
                // set to 0 — no card in hand until the player picks one up.
                // Categories without a qty field (spells, melee skills) are
                // unaffected and still render normally.
                if (cat.qty !== undefined && cat.qty <= 0) return;
                UXAI.sortCategory(cat);
                const col = document.createElement('div'); col.className = 'card-column'; col.id = `col-${colIdx++}`;
                col.draggable = false;
                
                col.addEventListener('dragstart', e => {
                    e.dataTransfer.effectAllowed = 'move';
                    col.classList.add('dragging');
                    setTimeout(() => col.style.opacity = '0.5', 0);
                });
                col.addEventListener('dragend', () => {
                    col.classList.remove('dragging');
                    col.style.opacity = '1';
                });
                
                let startY = 0, isDragging = false, dragMoved = false;
                let holdTimer = null, holdTarget = null, holdInterval = null;
                
                col.onpointerdown = (e) => { 
                    startY = e.clientY; 
                    isDragging = true; 
                    dragMoved = false;
                    col.setPointerCapture(e.pointerId); 
                    const topCard = col.querySelector('.guide-card[data-depth="0"]');
                    if (topCard) topCard.style.transition = 'none';
                    
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    holdTarget = el ? el.closest('.guide-card') : null;
                    if (holdTarget && holdTarget.dataset.depth === "0") {
                        holdTimer = setTimeout(() => {
                            if (!dragMoved && holdTarget) {
                                const actionName = holdTarget.dataset.cardAction || holdTarget.querySelector('.card-title')?.textContent || '';
                                // Missile/ranged + SPELL cards must be tapped deliberately — hold-to-fire [REF#UI-00355 → see REF#PN-01382]
                                // would drain ammo / mana unintentionally, especially when the engine
                                // iframe steals pointer focus and pointercancel never arrives. User
                                // reported "GALE endlessly fires when clicked" — the hold-repeat
                                // was the cause. Spells now opt out the same way missiles do.
                                const _NO_HOLD_NAMES = [
                                    // missiles / ranged [REF#UI-00356 → see REF#PN-01383]
                                    'SHURIKEN','DAGGER','SHORT BOW','LONG BOW','CROSSBOW','PISTOL','BOW','ARROW','MAGIC MISSILE',
                                    // spells [REF#UI-00357]
                                    'GALE','CYCLONE','FIREBALL','PYROBLAST','COMET','FISSURE','BOULDER',
                                    'TIDE','SURGE','WAVE','BLAST','NOVA','BOLT','LIGHTNING','ARCANE','SPELL',
                                ];
                                const isNoHold = _NO_HOLD_NAMES.some(n => actionName.toUpperCase().includes(n));
                                if (isNoHold) return;
                                holdTarget.classList.add('selected-card');
                                holdInterval = setInterval(() => {
                                    holdTarget.classList.remove('launching');
                                    requestAnimationFrame(() => {
                                        holdTarget.classList.add('launching');
                                        emitAction(actionName, holdTarget);

                                        let currentQty = holdTarget.dataset.qty ? parseInt(holdTarget.dataset.qty) : 1;
                                        if (currentQty <= 0) {
                                            clearInterval(holdInterval);
                                            holdInterval = null;
                                        }
                                        setTimeout(() => holdTarget.classList.remove('launching'), 450);
                                    });
                                }, 500);
                            }
                        }, 300);
                    }
                };
                
                col.onpointermove = (e) => { 
                    if(!isDragging) return; 
                    const deltaY = e.clientY - startY; 
                    if (Math.abs(deltaY) > 15) {
                        dragMoved = true;
                        clearTimeout(holdTimer);
                        if (holdInterval) { clearInterval(holdInterval); holdInterval = null; if (holdTarget) holdTarget.classList.remove('selected-card'); }
                    }
                    const topCard = col.querySelector('.guide-card[data-depth="0"]');
                    
                    if (topCard) {
                        topCard.style.transform = `translateY(${deltaY}px) scale(1)`;
                    }

                    if(Math.abs(deltaY) > 50) { 
                        if (topCard) {
                            topCard.style.transition = '';
                            topCard.style.transform = '';
                        }
                        cycle(idx, deltaY > 0); 
                        startY = e.clientY; 
                        document.querySelectorAll('.card-tooltip').forEach(t => t.classList.remove('show')); 
                        
                        // Grab new top card for continuous dragging [REF#UI-00358 → see REF#PN-01394]
                        const newTop = col.querySelector('.guide-card[data-depth="0"]');
                        if (newTop) newTop.style.transition = 'none';
                    } 
                };
                
                const endDrag = (e) => {
                    isDragging = false; 
                    col.releasePointerCapture(e.pointerId); 
                    
                    clearTimeout(holdTimer);
                    if (holdInterval) { 
                        clearInterval(holdInterval); 
                        holdInterval = null; 
                        if (holdTarget) holdTarget.classList.remove('selected-card'); 
                        return; // We already fired actions via hold, do not fire single click [REF#UI-00359 → see REF#PN-01405]
                    }

                    const topCard = col.querySelector('.guide-card[data-depth="0"]');
                    if (topCard) {
                        topCard.style.transition = '';
                        topCard.style.transform = '';
                    }
                    if (!dragMoved) {
                        // Keyboard selector bypass [REF#UI-00360 → see REF#PN-01406]
                        let firedViaSuperimposed = false;
                        if (typeof isKeyboardSelectorActive !== 'undefined' && isKeyboardSelectorActive) {
                            const el = document.elementFromPoint(e.clientX, e.clientY);
                            const clickedCard = el ? el.closest('.guide-card') : null;
                            if (clickedCard && clickedCard.dataset.depth === "0" && clickedCard.parentElement === col && clickedCard.classList.contains('superimposed-card')) {
                                firedViaSuperimposed = true;
                                clickedCard.classList.add('launching');
                                const actionName = clickedCard.dataset.cardAction || clickedCard.querySelector('.card-title').textContent;
                                emitAction(actionName, clickedCard);
                                setTimeout(() => { 
                                    clickedCard.classList.remove('launching'); 
                                }, 450);
                            }
                        }

                        // Single / Double click activation [REF#UI-00361 → see REF#PN-01407]
                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        if (!el) return;
                        const clickedCard = el.closest('.guide-card');
                        if (!firedViaSuperimposed && clickedCard && clickedCard.parentElement === col) {
                            setFocus(idx);
                            if(clickedCard.dataset.depth === "0") {
                                // SINGLE CLICK - FIRE IMMEDIATELY [REF#UI-00362 → see REF#PN-01408]
                                document.querySelectorAll('.guide-card.selected-card').forEach(c => c.classList.remove('selected-card'));
                                clickedCard.classList.add('launching');
                                const actionName = clickedCard.dataset.cardAction || clickedCard.querySelector('.card-title').textContent;
                                emitAction(actionName, clickedCard);
                                setTimeout(() => { 
                                    clickedCard.classList.remove('launching'); 
                                }, 450);
                            }
                        }
                    }
                };
                col.onpointerup = endDrag;
                col.onpointercancel = endDrag;

                cat.cards.forEach((name, i) => {
                    const masterCard = (window.OrigamiCards || []).find(c => c.name === name);
                    const kanji = masterCard ? masterCard.kanji : (cat.kanji || '');
                    const typePill = masterCard ? masterCard.type.toUpperCase() : cat.id;
                    let elId = masterCard ? masterCard.el : cat.id;
                    if (name === 'SHORT BOW') elId = 'BOW_SHORT';
                    if (name === 'LONG BOW' || name === 'COMPOSITE BOW') elId = 'BOW_LONG';
                    if (name === 'PISTOL') elId = 'PISTOL';
                    if (name === 'MAGIC LANTERN') elId = 'MAGIC_LANTERN';

                    // i18n: use localized strings if available, else fall back to master card data [REF#UI-00363]
                    const loc = masterCard ? (window.tCard && window.tCard(masterCard.id, window.currentLang)) : null;
                    let displayName = loc ? loc.name : name;
                    const desc       = loc ? loc.desc : (masterCard ? masterCard.desc : cat.desc);
                    const attr       = loc ? loc.attr : (masterCard ? masterCard.attr : (cat.attr || ''));
                    // Optional second title line. Falls back to empty (the [REF#UI-00364 → see REF#PN-01415]
                    // .card-title-2 :empty rule collapses its height in CSS).
                    const title2 = (loc && loc.title2) || (masterCard && masterCard.title2) || cat.title2 || '';
                    // Auto-split: when the displayName ENDS with title2 (e.g. [REF#UI-00365 → see REF#PN-01416]
                    // "PISTOL" + title2 "MAGIC MISSILE"), strip
                    // the suffix so line 1 shows just the prefix ("WAND OF").
                    if (title2 && displayName.toUpperCase().endsWith(' ' + title2.toUpperCase())){
                        displayName = displayName.slice(0, -(title2.length + 1));
                    }

                    const card = document.createElement('div');
                    card.className = `guide-card card-${elId.toLowerCase()}`;
                    card.dataset.depth = i;
                    card.dataset.cardAction = name; // always the EN action name for emitAction [REF#UI-00366 → see REF#PN-01422]
                    if (masterCard) card.dataset.cardId = masterCard.id; // for live re-translation [REF#UI-00367]
                    if (cat.qty !== undefined) card.dataset.qty = cat.qty;

                    const badgeHtml = cat.qty !== undefined ? `<div class="card-badge">${cat.qty}</div>` : '';
                    card.innerHTML = `
                        <div class="card-header"><span class="card-kanji">${kanji}</span><span class="card-type-pill">${typePill}</span></div>
                        <div class="card-title">${displayName}</div>
                        <div class="card-title-2">${title2}</div>
                        <div class="card-desc">${desc}</div>
                        <div class="card-icon-3d" data-element="${elId}"><canvas></canvas></div>
                        <div class="card-attr-fused">${attr}</div>
                        <div class="card-click-overlay"></div>
                        ${badgeHtml}
                    `;
                    col.appendChild(card);
                });
                container.appendChild(col);
            });
            
            // Drag and Drop Container Logic [REF#UI-00368]
            container.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingCol = container.querySelector('.dragging');
                if (!draggingCol) return;
                
                const afterElement = getDragAfterElement(container, e.clientX);
                if (afterElement == null) {
                    container.appendChild(draggingCol);
                } else {
                    container.insertBefore(draggingCol, afterElement);
                }
            });

            setFocus(0, false);
            
            // Re-attach hover focus states to newly generated UI [REF#UI-00369 → see REF#PN-01433]
            document.querySelectorAll('.u-panel').forEach(p => { 
                p.onmouseenter = () => p.focus(); 
                p.onmouseleave = () => p.blur(); 
            });
            
            // Ensure 3D icons are rendered for the newly built deck [REF#UI-00370 → see REF#PN-01434]
            if (window.THREE && typeof init3DIcons === 'function') init3DIcons();
        }
        
        function getDragAfterElement(container, x) {
            const draggableElements = [...container.querySelectorAll('.card-column:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = x - box.left - box.width / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
        document.getElementById('launch-btn').onclick = function(e) { 
            e.preventDefault();
            emitAction(pendingAction, this); 
            closeModal(); 
        };
        
        // Event Log focus expansion [REF#UI-00371]
        const _chatInput = document.querySelector('.chat-input');
        const _evtLog = document.getElementById('event-log-container');
        if (_chatInput && _evtLog) {
            _chatInput.addEventListener('focus', () => {
                _evtLog.classList.add('active');
                _evtLog.classList.add('user-focused');
                const ez = document.getElementById('encounter-zone');
                if (ez && !ez.classList.contains('active')) {
                    ez.classList.add('active');
                    ez.dataset.pairedWithLog = '1';
                }
            });
            _chatInput.addEventListener('blur', () => {
                _evtLog.classList.remove('user-focused');
                setTimeout(() => {
                    if (document.activeElement !== _chatInput) {
                        const ez = document.getElementById('encounter-zone');
                        if (ez && ez.dataset.pairedWithLog === '1') {
                            ez.classList.remove('active');
                            ez.dataset.pairedWithLog = '';
                        }
                    }
                }, 100);
            });
        }



        // INIT AND EVENTS PANEL LOGIC --- [REF#UI-00372 → see REF#PN-01437]
        window.showLcdEvent = function(text, context) {
            if (context) window.logEvent(`<span style="color:#a0a8b8;font-style:italic">${context}</span>`, 'system');
        };
        
        const activeDPadPointers = new Map();
        const handleDPadInput = (e, isDown) => {
            if (e.cancelable) e.preventDefault();
            if (isDown) {
                let key = null;
                const thumbBtn = e.target.closest('.kp-center-btn');
                
                if (thumbBtn) {
                    const rect = thumbBtn.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    
                    if (Math.abs(x) > Math.abs(y)) {
                        key = x > 0 ? 'd' : 'a'; // Right or Left (Turn) [REF#UI-00373]
                    } else {
                        key = y > 0 ? 's' : 'w'; // Backwards or Forwards [REF#UI-00374]
                    }
                } else {
                    const btn = e.target.closest('[data-key]');
                    if (btn) key = btn.dataset.key;
                }
                
                if (!key) return;
                
                activeDPadPointers.set(e.pointerId, key);
                playAvatarAnim('walk');
                window.parent.postMessage({ type: 'KEY_DOWN', key: key, code: key }, '*');
            } else {
                const key = activeDPadPointers.get(e.pointerId);
                if (!key) return; // Ignores pointerup/leave if this pointer didn't press a button [REF#UI-00375 → see REF#PN-01440]
                playAvatarAnim('idle');
                window.parent.postMessage({ type: 'KEY_UP', key: key, code: key }, '*');
                activeDPadPointers.delete(e.pointerId);
            }
        };

        const leftPanel = document.getElementById('left-panel');
        // Use pointer events instead to unify touch/mouse and avoid sticky keys [REF#UI-00376 → see REF#PN-01441]
        leftPanel.addEventListener('pointerdown', e => handleDPadInput(e, true));
        leftPanel.addEventListener('pointerup', e => handleDPadInput(e, false));
        leftPanel.addEventListener('pointerleave', e => handleDPadInput(e, false));
        leftPanel.addEventListener('pointercancel', e => handleDPadInput(e, false));

        const params = new URLSearchParams(window.location.search);

        window.isKeyboardSelectorActive = false;
        // Auto-close timer — when the player opens the keyboard selector [REF#UI-00377 → see REF#PN-01444]
        // and doesn't pick anything for 2 seconds, close it so movement
        // keys (W/A/S/D) work again immediately. Reset on every nav key.
        let _kbdIdleTimer = 0;
        let _kbdHintTimer = 0;
        const _KBD_IDLE_MS = 2000;

        window._resetKbdIdleTimer = function(){
            if (_kbdIdleTimer) clearTimeout(_kbdIdleTimer);
            if (!window.isKeyboardSelectorActive) return;
            _kbdIdleTimer = setTimeout(() => {
                if (window.isKeyboardSelectorActive){
                    window._closeCardSelector('idle');
                }
            }, _KBD_IDLE_MS);
        };

        // Centralized chrome-clear: yanks every visual selector class so no [REF#UI-00378 → see REF#PN-01446]
        // matter how the player exited (Esc, idle, fire, ATTACK button), the
        // deck looks clean and no card is left mid-animation.
        function _clearSelectorChrome(){
            document.querySelectorAll('.guide-card.superimposed-card').forEach(c => c.classList.remove('superimposed-card'));
            document.querySelectorAll('.guide-card.selected-card').forEach(c => c.classList.remove('selected-card'));
            document.querySelectorAll('.card-tooltip.show').forEach(t => t.classList.remove('show'));
        }

        // Live column count — qty-0 cards get hidden so categories.length can [REF#UI-00379 → see REF#PN-01447]
        // overshoot what's actually rendered. Use this for arrow clamping so
        // focusedColIndex never points at a column that doesn't exist.
        function _liveColCount(){
            return document.querySelectorAll('#guides-container .card-column').length;
        }

        function _showKbdHint(){
            const r = document.getElementById('kbd-hint-ribbon');
            if (!r) return;
            r.classList.add('show');
            if (_kbdHintTimer) clearTimeout(_kbdHintTimer);
            _kbdHintTimer = setTimeout(() => r.classList.remove('show'), 2000);
        }
        function _hideKbdHint(){
            const r = document.getElementById('kbd-hint-ribbon');
            if (r) r.classList.remove('show');
            if (_kbdHintTimer){ clearTimeout(_kbdHintTimer); _kbdHintTimer = 0; }
        }

        // _openCardSelector — single entry point. Idempotent; safe to call [REF#UI-00380 → see REF#PN-01448]
        // when already open. Always re-blooms the current top card so the
        // player has unambiguous visual focus.
        window._openCardSelector = function(){
            const bottomPanel = document.getElementById('bottom-panel');
            if (!bottomPanel) return;
            window.isKeyboardSelectorActive = true;
            bottomPanel.classList.add('kb-active');
            document.body.classList.add('kbd-card-active');
            // Opening the card selector means the player is committing to an [REF#UI-00381 → see REF#PN-01449]
            // action — cancel any in-flight auto-walk so the avatar stops
            // moving while they pick. The engine treats SIDEBAR_OPEN as a
            // generic "stop auto-walk" signal already.
            try { window.parent.postMessage({ type: 'SIDEBAR_OPEN', source: 'card-selector' }, '*'); } catch (e) {}
            // Clamp focus against live column count before blooming. [REF#UI-00382]
            const cols = _liveColCount();
            if (cols === 0){ window._closeCardSelector('empty-deck'); return; }
            if (focusedColIndex >= cols) focusedColIndex = 0;
            setFocus(focusedColIndex);
            _clearSelectorChrome();
            const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
            if (topCard) topCard.classList.add('superimposed-card');
            bottomPanel.focus();
            _showKbdHint();
            window._resetKbdIdleTimer();
        };

        // _closeCardSelector — single exit point. Idempotent; safe to call [REF#UI-00383 → see REF#PN-01450]
        // when already closed. `reason` is for logging only.
        window._closeCardSelector = function(reason){
            const wasActive = window.isKeyboardSelectorActive;
            window.isKeyboardSelectorActive = false;
            const bottomPanel = document.getElementById('bottom-panel');
            if (bottomPanel){
                bottomPanel.classList.remove('kb-active');
                if (document.activeElement === bottomPanel) bottomPanel.blur();
            }
            document.body.classList.remove('kbd-card-active');
            _clearSelectorChrome();
            _hideKbdHint();
            if (_kbdIdleTimer){ clearTimeout(_kbdIdleTimer); _kbdIdleTimer = 0; }
            if (wasActive && reason === 'idle' && window.logEvent){
                window.logEvent('⌨️ Card selector closed — move freely again.', 'system');
            }
        };

        // Backward-compat shim — older callsites still use this name. The [REF#UI-00384 → see REF#PN-01454]
        // legacy `forceOff` arg is honored: truthy → close, otherwise toggle.
        window.toggleKeyboardSelector = function(forceOff){
            if (forceOff === true){ window._closeCardSelector('forced'); return; }
            if (window.isKeyboardSelectorActive) window._closeCardSelector('toggle');
            else window._openCardSelector();
        };

        // ── AXIOM RULE #1 ── [REF#UI-00385 → see REF#PN-01455]
        // ESC closes the event log + side panels (encounter zone). When the
        // keyboard selector is up, a subsequent ENTER reopens them instead
        // of firing a card. We tag `window._axiomLogHidden` so the ENTER
        // handler below knows the dismissal came from ESC and can restore.
        function _axiomCloseLogAndPanels(){
            const ez   = document.getElementById('encounter-zone');
            const log  = document.getElementById('event-log-container');
            let closedAny = false;
            if (ez && ez.classList.contains('active')){
                ez.classList.remove('active');
                closedAny = true;
            }
            if (log && log.classList.contains('active')){
                log.classList.remove('active');
                closedAny = true;
            }
            if (closedAny) window._axiomLogHidden = true;
        }
        function _axiomReopenLogAndPanels(){
            const ez   = document.getElementById('encounter-zone');
            const log  = document.getElementById('event-log-container');
            if (ez)  ez.classList.add('active');
            if (log) log.classList.add('active');
            window._axiomLogHidden = false;
        }
        // ── PAUSED overlay ── [REF#UI-00386 → see REF#PN-01456]
        // Lazy-injected on first use. Big centered "PAUSED" + small hint
        // line. Fades in/out via CSS opacity. Pointer-events disabled so
        // it never swallows clicks on the panels beneath.
        function _axiomEnsurePausedOverlay(){
            let el = document.getElementById('axiom-paused-overlay');
            if (el) return el;
            el = document.createElement('div');
            el.id = 'axiom-paused-overlay';
            el.innerHTML = `
                <div class="paused-frame">
                    <div class="paused-title">PAUSED</div>
                    <div class="paused-hint">Press <kbd>ENTER</kbd> or <kbd>ESC</kbd> to resume</div>
                </div>`;
            const style = document.createElement('style');
            style.textContent = `
                #axiom-paused-overlay{
                    position:fixed; inset:0; z-index:14000;
                    display:flex; align-items:center; justify-content:center;
                    pointer-events:none; opacity:0;
                    background: radial-gradient(circle at 50% 50%,
                        rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 75%);
                    transition: opacity .25s ease;
                    font-family: 'Impact', 'Helvetica Neue', sans-serif;
                }
                #axiom-paused-overlay.shown{ opacity:1; }
                #axiom-paused-overlay .paused-frame{
                    text-align:center; color:#e8f6ff;
                    text-shadow: 0 4px 24px rgba(0,180,255,0.55);
                }
                #axiom-paused-overlay .paused-title{
                    font-size: 108px; letter-spacing: 14px;
                    font-weight: 900; line-height: 1;
                }
                #axiom-paused-overlay .paused-hint{
                    margin-top: 18px; font-size: 18px; letter-spacing: 3px;
                    color: #9fbfd6; font-family: 'Helvetica Neue', sans-serif;
                }
                #axiom-paused-overlay kbd{
                    display:inline-block; padding: 2px 8px; margin: 0 4px;
                    border-radius: 4px; background: rgba(255,255,255,0.12);
                    border: 1px solid rgba(255,255,255,0.25);
                    font-family: monospace; font-size: 14px;
                }`;
            document.head.appendChild(style);
            document.body.appendChild(el);
            return el;
        }
        function _axiomShowPausedOverlay(show){
            const el = _axiomEnsurePausedOverlay();
            if (show) el.classList.add('shown');
            else      el.classList.remove('shown');
            window._axiomPaused = !!show;
        }

        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                // ESC TOGGLES pause. If currently paused → resume + reopen panels. [REF#UI-00387 → see REF#PN-01464]
                // If not paused → pause + close panels (AXIOM RULE #1).
                if (window._axiomPaused){
                    _axiomShowPausedOverlay(false);
                    try { window.parent.postMessage({ type: 'GAME_PAUSE', paused: false }, '*'); } catch(_){}
                    _axiomReopenLogAndPanels();
                    return;
                }
                if (window.isKeyboardSelectorActive) window._closeCardSelector('esc');
                closeModal();
                if(document.activeElement.classList.contains('u-panel')) document.activeElement.blur();
                _axiomCloseLogAndPanels();
                try { window.parent.postMessage({ type: 'GAME_PAUSE', paused: true }, '*'); } catch(_){}
                _axiomShowPausedOverlay(true);
                return;
            }

            
            // T0.7 — Spacebar enters keyboard mode, or cycles class while in mode. [REF#UI-00388]
            // SPELLS ↔ COMBAT. Body gets .kbd-card-active for scrollbar reveal.
            if (e.key === ' ' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                if (!window.isKeyboardSelectorActive) {
                    window._openCardSelector();
                    return;
                }
                _clearSelectorChrome();
                window.cycleCardClass();
                // After cycling, re-bloom the new top card and show its tooltip. [REF#UI-00389]
                const cols = _liveColCount();
                if (focusedColIndex >= cols) focusedColIndex = 0;
                const topCard2 = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                if(topCard2) {
                    topCard2.classList.add('superimposed-card');
                    const tt = topCard2.querySelector('.card-tooltip');
                    if(tt) tt.classList.add('show');
                }
                window._resetKbdIdleTimer();
                return;
            }

            // GLOBAL RETURN KEY — single-press flow: [REF#UI-00390 → see REF#PN-01468]
            //   1) selector closed → open it (top card auto-blooms as the
            //      ready-to-fire pick). No "selected" intermediate state.
            //   2) selector open  → fire the bloomed top card immediately.
            // Enter key behaviour:
            //   • 1× Enter (selector CLOSED) → open it on the last-used card
            //   • 1× Enter (selector OPEN)   → fire the currently focused card
            //   • 2× Enter (within 400ms)    → fire the LAST card used directly,
            //                                  no matter which column was focused
            //                                  (window.lastCombatAttack)
            if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();

                // ── AXIOM RULE #1 (second half) + RESUME ── [REF#UI-00391 → see REF#PN-01469]
                // ENTER, while paused (or with panels hidden under the
                // keyboard selector), reopens the chrome and resumes the
                // game engine. Card fire is suppressed on this press so the
                // first ENTER after ESC always acts as "resume", never a
                // surprise spellcast.
                if (window._axiomPaused){
                    _axiomShowPausedOverlay(false);
                    try { window.parent.postMessage({ type: 'GAME_PAUSE', paused: false }, '*'); } catch(_){}
                    _axiomReopenLogAndPanels();
                    return;
                }
                if (window.isKeyboardSelectorActive){
                    const _ez  = document.getElementById('encounter-zone');
                    const _log = document.getElementById('event-log-container');
                    const _ezHidden  = _ez  && !_ez.classList.contains('active');
                    const _logHidden = _log && !_log.classList.contains('active');
                    if (window._axiomLogHidden || _ezHidden || _logHidden){
                        _axiomReopenLogAndPanels();
                        return;
                    }
                }

                const now = performance.now();
                const ENTER_DBL_WINDOW_MS = 400;
                const isDouble = (window._lastEnterT && (now - window._lastEnterT) <= ENTER_DBL_WINDOW_MS);
                window._lastEnterT = now;

                // Double-tap: fire the last attack used, regardless of selector state. [REF#UI-00392 → see REF#PN-01470]
                if (isDouble){
                    const lastName = window.lastCombatAttack
                        || window._lastUsedByDeck?.[window.cardClass]
                        || null;
                    if (lastName){
                        // Find a matching card in the current deck (any column) [REF#UI-00393 → see REF#PN-01471]
                        // so we get its badge/qty state. If not found, just emit.
                        const titles = document.querySelectorAll('.guide-card[data-depth="0"] .card-title');
                        let matchCard = null;
                        for (const t of titles){
                            const txt = t.textContent.trim().toUpperCase();
                            if (txt === lastName.toUpperCase() || txt.startsWith(lastName.toUpperCase() + ' X')){
                                matchCard = t.closest('.guide-card'); break;
                            }
                        }
                        if (matchCard){
                            matchCard.classList.add('enter-flash', 'launching');
                            setTimeout(() => { matchCard.classList.remove('enter-flash', 'launching'); }, 450);
                            emitAction(lastName, matchCard);
                        } else {
                            emitAction(lastName);
                        }
                        // Keep the selector closed after a quick double-tap fire [REF#UI-00394 → see REF#PN-01472]
                        if (window.isKeyboardSelectorActive && window._closeCardSelector){
                            window._closeCardSelector('double-enter');
                        }
                        return;
                    }
                    // No last card known — fall through to normal single-Enter behaviour. [REF#UI-00395 → see REF#PN-01473]
                }

                if (!window.isKeyboardSelectorActive) {
                    window._openCardSelector();
                    try { window.parent.postMessage({ type: 'AUTO_SELECT_TARGET' }, '*'); } catch(_) {}
                    return;
                }

                // Single-press fire — resolve the focused card. Try the [REF#UI-00396 → see REF#PN-01474]
                // sequential col-id lookup first; if PISTOL's column index
                // ever falls out of sync, fall back to scanning all bloomed
                // cards in the deck so the strike still goes through.
                let topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                if (!topCard){
                    topCard = document.querySelector('.guide-card.superimposed-card[data-depth="0"]')
                          || document.querySelector('.card-column.focused .guide-card[data-depth="0"]');
                }
                if (!topCard) {
                    window._closeCardSelector('empty');
                    return;
                }
                topCard.classList.remove('selected-card', 'superimposed-card');
                topCard.classList.add('enter-flash');
                topCard.classList.add('launching');
                const name = topCard.dataset.cardAction || topCard.querySelector('.card-title').textContent;
                emitAction(name, topCard);
                setTimeout(() => {
                    topCard.classList.remove('enter-flash');
                    topCard.classList.remove('launching');
                }, 450);
                return;
            }

            if (window.isKeyboardSelectorActive) {
                // Any nav key inside the selector keeps it alive — only [REF#UI-00397 → see REF#PN-01475]
                // 2 seconds of total inactivity auto-closes it.
                if (window._resetKbdIdleTimer) window._resetKbdIdleTimer();
                if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    _clearSelectorChrome();
                    // Clamp against the live column count: qty-0 cards get [REF#UI-00398 → see REF#PN-01476]
                    // hidden so categories.length can overshoot what's
                    // actually rendered.
                    const cols = _liveColCount();
                    if (cols === 0){ window._closeCardSelector('empty-deck'); return; }
                    focusedColIndex = e.key === 'ArrowLeft'
                        ? Math.max(0, focusedColIndex - 1)
                        : Math.min(cols - 1, focusedColIndex + 1);
                    setFocus(focusedColIndex);
                    const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                    if (topCard) {
                        topCard.classList.add('superimposed-card');
                        // Brief column-change tick: card flicks slightly in direction of travel [REF#UI-00399 → see REF#PN-01477]
                        const dir = e.key === 'ArrowRight' ? 1 : -1;
                        topCard.style.transition = 'transform 0.12s ease-out';
                        topCard.style.transform = `translateY(-10px) scale(1.1) translateX(${dir * 4}px)`;
                        setTimeout(() => { topCard.style.transform = ''; topCard.style.transition = ''; }, 130);
                        const tt = topCard.querySelector('.card-tooltip');
                        if (tt) tt.classList.add('show');
                    }
                    // fall through — let arrow also move player (turn left/right) [REF#UI-00400 → see REF#PN-01478]
                } else if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                    // Cycle card within column while selector is open [REF#UI-00401 → see REF#PN-01479]
                    _clearSelectorChrome();
                    const cols = _liveColCount();
                    if (cols === 0){ window._closeCardSelector('empty-deck'); return; }
                    if (focusedColIndex >= cols) focusedColIndex = 0;
                    cycle(focusedColIndex, e.key === 'ArrowDown');
                    const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                    if (topCard) topCard.classList.add('superimposed-card');
                    // fall through — let arrow also move player (forward/back) [REF#UI-00402 → see REF#PN-01480]
                }
            }
            
            if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key) && document.activeElement.tagName !== 'INPUT') {
                playAvatarAnim('walk');
            }
            // T0.7 — When in keyboard card-select mode, lock player movement. [REF#UI-00403]
            // Arrow + WASD keys are swallowed (used for card cycling instead).
            const isMovementKey = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key);
            if (window.isKeyboardSelectorActive && isMovementKey) {
                return; // do not forward — engine sees no movement [REF#UI-00404]
            }

            // Always forward movement + global keys to engine; only block when typing in chat. [REF#UI-00405]
            // CRITICAL: must NOT repost synthetic events — the message-receive handler
            // in Panels.html dispatches synthetic keydowns from parent-relayed KEY_DOWN
            // messages. Without this gate we get a 1000Hz infinite relay loop:
            //   shell relay → panels synth → PanelsUI repost → shell relay → … (forensic 2026-05-28)
            // Source tag tells the shell relay (NewOrigami.8.html:219-223) not to echo
            // back to panels either.
            if (document.activeElement.tagName !== 'INPUT' && !e._synthetic) {
                window.parent.postMessage({ type: 'KEY_DOWN', key: e.key, code: e.code, shift: e.shiftKey, repeat: e.repeat, source: 'panels' }, '*');
            }
        });
        window.addEventListener('keyup', e => {
            if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) {
                playAvatarAnim('idle');
            }
            window.parent.postMessage({ type: 'KEY_UP', key: e.key, code: e.code }, '*');
        });
        
        window.addEventListener('blur', () => {
            // Failsafe: if the browser or iframe loses focus, flush all movement keys [REF#UI-00406 → see REF#PN-01501]
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].forEach(k => {
                window.parent.postMessage({ type: 'KEY_UP', key: k, code: k }, '*');
            });
            playAvatarAnim('idle');
            activeDPadPointers.clear();
        });
        setup();

        // First-boot hint — if any saves exist in localStorage, log a one-line [REF#UI-00407 → see REF#PN-01502]
        // tip pointing the player at the SAVE button so they can resume.
        (function _peekSavesAtBoot(){
            try {
                const m = JSON.parse(localStorage.getItem('origami.v8.saves.manifest') || '{"saves":[]}');
                if (m && Array.isArray(m.saves) && m.saves.length > 0){
                    setTimeout(() => {
                        if (window.logEvent) window.logEvent(
                            `💾 ${m.saves.length} saved game${m.saves.length>1?'s':''} found — hit <b>SAVE</b> to load.`,
                            'system'
                        );
                    }, 1500);
                }
            } catch(_){}
        })();

        // ── Underworld Haiku system ────────────────────────────────────── [REF#UI-00408]
        // Loads haikus.json once; tracks a no-repeat cooldown queue of the
        // last 20 picks (persisted to localStorage). When all haikus have
        // been used within the cooldown window the queue flushes itself.
        window._haikuPool = null;
        window._haikuCooldown = (() => {
            try { return JSON.parse(localStorage.getItem('origami.v8.haikus.cooldown') || '[]'); }
            catch { return []; }
        })();
        const HAIKU_COOLDOWN_SIZE = 20;
        const _haikuSaveCooldown = () => {
            try { localStorage.setItem('origami.v8.haikus.cooldown', JSON.stringify(window._haikuCooldown)); }
            catch (_){}
        };
        // Fetch the JSON once at boot. [REF#UI-00409 → see REF#PN-01504]
        fetch('./js/data/haikus.json')
            .then(r => r.json())
            .then(d => { window._haikuPool = (d && Array.isArray(d.haikus)) ? d.haikus : []; })
            .catch(e => { console.warn('[haiku] load failed', e); window._haikuPool = []; });

        window.pickHaiku = function(){
            const pool = window._haikuPool;
            if (!pool || !pool.length) return null;
            // Build a list of indices NOT in the cooldown queue. If empty [REF#UI-00410 → see REF#PN-01505]
            // (cycle exhausted), flush and treat everything as eligible.
            let eligible = [];
            for (let i = 0; i < pool.length; i++){
                if (window._haikuCooldown.indexOf(i) === -1) eligible.push(i);
            }
            if (!eligible.length){
                window._haikuCooldown = [];
                _haikuSaveCooldown();
                for (let i = 0; i < pool.length; i++) eligible.push(i);
            }
            const idx = eligible[Math.floor(Math.random() * eligible.length)];
            // Push onto cooldown queue, evict oldest beyond size. [REF#UI-00411 → see REF#PN-01506]
            window._haikuCooldown.push(idx);
            while (window._haikuCooldown.length > HAIKU_COOLDOWN_SIZE){
                window._haikuCooldown.shift();
            }
            _haikuSaveCooldown();
            return pool[idx];
        };

        window.logHaikuFor = function(monsterName){
            const h = window.pickHaiku && window.pickHaiku();
            if (!h) return;
            const speaker = (monsterName || 'Yakuza Goblin').toUpperCase();
            const body = String(h.text_en || h.text || '').replace(/</g,'&lt;');
            const style = String(h.style || '').replace(/[^a-z0-9_]/gi,'');
            const html =
                `<div class="hk-speaker">🎴 ${speaker}</div>` +
                `<div class="hk-body">${body}</div>` +
                (style ? `<div class="hk-style">— ${style.replace(/_/g,' ')}</div>` : '');
            if (window.logEvent) window.logEvent(html, 'haiku');
        };

        // The center thumb button is now handled by the D-Pad pointerdown listener (data-key="ArrowUp") [REF#UI-00412 → see REF#PN-01507]

        // --- Compass Direction Dial Update --- [REF#UI-00413 → see REF#PN-01508]
        // Called in real-time (~20hz) by PLAYER_ROT_REALTIME and on grid change by PLAYER_MOVE.
        function updateCompass(rot) {
            const compass = document.querySelector('.compass-outer-ring');
            if (!compass) return;
            const rotDeg = (rot * 180) / Math.PI;
            compass.style.transform = `rotate(${rotDeg}deg)`;
            
            // Calculate which direction is at the top (under the glass indicator) [REF#UI-00414 → see REF#PN-01509]
            let angle = rotDeg % 360;
            if (angle < 0) angle += 360; // Normalize to 0-360 [REF#UI-00415 → see REF#PN-01510]
            
            const isN = (angle >= 330 || angle <= 30);
            const isW = (angle >= 60 && angle <= 120);
            const isS = (angle >= 150 && angle <= 210);
            const isE = (angle >= 240 && angle <= 300);

            const n = compass.querySelector('.north');
            if (n) {
                n.style.transform = `translateX(-50%) rotate(${-rotDeg}deg)`;
                n.classList.toggle('active-dir', isN);
            }
            const s = compass.querySelector('.south');
            if (s) {
                s.style.transform = `translateX(-50%) rotate(${-rotDeg}deg)`;
                s.classList.toggle('active-dir', isS);
            }
            const e_marker = compass.querySelector('.east');
            if (e_marker) {
                e_marker.style.transform = `translateY(-50%) rotate(${-rotDeg}deg)`;
                e_marker.classList.toggle('active-dir', isE);
            }
            const w = compass.querySelector('.west');
            if (w) {
                w.style.transform = `translateY(-50%) rotate(${-rotDeg}deg)`;
                w.classList.toggle('active-dir', isW);
            }
        }

        // Listen for combat state changes from main relay [REF#UI-00416 → see REF#PN-01511]
        // Add the `showBigCombatText` function globally
        window.showBigCombatText = function(subtitle, value, isHit) {
            const el = document.getElementById('big-combat-text');
            if (!el) return;
            
            el.innerHTML = `<span class="subtitle">${subtitle}</span><span class="${isHit ? 'dmg-val' : 'miss-val'}">${value}</span>`;
            el.classList.remove('fade-out');
            el.classList.add('show');
            
            // Reset animation logic [REF#UI-00417]
            if (el.timeoutId) clearTimeout(el.timeoutId);
            el.timeoutId = setTimeout(() => {
                el.classList.remove('show');
                el.classList.add('fade-out');
            }, 1200); // Wait 1.2s then fade out [REF#UI-00418]
        };

        // One-time setup: get pip canvas 2D context for engine frame blitting [REF#UI-00419 → see REF#PN-01514]
        const _pipEl = document.getElementById('pipCanvas');
        const _pipCtx2d = _pipEl ? _pipEl.getContext('2d') : null;

        window._routeToPanelsMain = (ev) => {
            const e = { data: ev };
            // ── PIP_FRAME: engine composited pip image → draw onto #pipCanvas ── [REF#UI-00420 → see REF#PN-01547]
            if (e.data && e.data.type === 'PIP_FRAME') {
                if (!_pipCtx2d || !_pipEl) { e.data.bitmap && e.data.bitmap.close && e.data.bitmap.close(); return; }   // transferred bitmaps MUST close() on every path, not just the draw path (2026-08-07, CLAUDE(fps)) [REF#UI-00421]
                const W = _pipEl.width  || _pipEl.clientWidth  || 160;
                const H = _pipEl.height || _pipEl.clientHeight || 160;
                if (_pipEl.width !== W) _pipEl.width = W;
                if (_pipEl.height !== H) _pipEl.height = H;
                const mw = document.getElementById('moondial-wrapper');
                if (mw) mw.classList.toggle('cam-mode', !!e.data.isCam);
                if (e.data.bitmap) {
                    _pipCtx2d.drawImage(e.data.bitmap, 0, 0, W, H);
                    e.data.bitmap.close && e.data.bitmap.close();
                } else if (e.data.dataURL) {
                    const img = new Image();
                    img.onload = () => _pipCtx2d.drawImage(img, 0, 0, W, H);
                    img.src = e.data.dataURL;
                }
                return;
            }
            if (e.data && e.data.type === 'PIP_AUTO_RESIZE') {
                const pip = document.getElementById('moondial-wrapper');
                if (!pip) return;
                const vw = e.data.w, vh = e.data.h;
                // Responsive size calculation: 25% of viewport width, clamped [REF#UI-00422]
                const size = Math.max(160, Math.min(320, Math.floor(vw * 0.25)));
                pip.style.width = size + 'px';
                pip.style.height = size + 'px';
                pip.style.top = (e.data.top || 20) + 'px';
                pip.style.left = (e.data.left || 20) + 'px';
                pip.style.right = 'auto';
                pip.style.bottom = 'auto';
                // Trigger save so it persists across reloads [REF#UI-00423 → see REF#PN-01551]
                if (typeof window.savePiPState === 'function') window.savePiPState();
                else {
                    try {
                        const state = { left: pip.style.left, top: pip.style.top, width: pip.style.width, height: pip.style.height };
                        localStorage.setItem('origami_pip_state', JSON.stringify(state));
                    } catch(_){}
                }
                return;
            }
            // Engine informs of camera mode changes so the panels can adapt UI [REF#UI-00424 → see REF#PN-01552]
            if (e.data && e.data.type === 'CAMERA_MODE') {
                try {
                    if (e.data.mode === 'topdown') document.body.classList.add('topdown-mode');
                    else document.body.classList.remove('topdown-mode');
                } catch(_){}
                return;
            }
            if (e.data && e.data.type === 'TOGGLE_INVENTORY') {
                const invModal = document.getElementById('inventory-modal');
                if (invModal.classList.contains('active')) {
                    window.closeInventory();
                } else {
                    window.openInventory();
                }
            } else if (e.data && e.data.type === 'SYNC_INVENTORY') {
                const spellsGrid = document.getElementById('inv-spells-grid');
                const gearList = document.getElementById('inv-gear-list');
                const weightText = document.getElementById('inv-weight-text');
                const weightFill = document.getElementById('inv-weight-fill');
                
                if (spellsGrid && e.data.inventory.spells) {
                    spellsGrid.innerHTML = '';
                    const spells = [...new Set(e.data.inventory.spells)]; // Unique [REF#UI-00425]
                    spells.forEach(spell => {
                        const count = e.data.inventory.spells.filter(s => s === spell).length;
                        const qtyHtml = count > 1 ? `<div style="position:absolute; top:-10px; right:-10px; background:#f00; color:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; border:2px solid #000;">${count}</div>` : '';
                        spellsGrid.innerHTML += `
                            <div class="playing-card" style="width:100px; height:140px; padding:10px; background:rgba(20,20,25,0.9);">
                                ${qtyHtml}
                                <div style="font-size:12px; font-weight:bold; text-align:center; margin-top:20px; color:#00e5ff;">${spell}</div>
                            </div>
                        `;
                    });
                }
                
                if (gearList && e.data.equipment) {
                    gearList.innerHTML = '';
                    const slots = ['head', 'necklace', 'chest', 'legs', 'gloves', 'rings', 'boots', 'weapon'];
                    slots.forEach(slot => {
                        const item = e.data.equipment[slot];
                        const name = item ? item.name : 'Empty';
                        const stat = item ? (item.defense ? `+${item.defense} AC` : (item.minDmg ? `${item.minDmg}-${item.maxDmg} DMG` : '')) : '';
                        
                        gearList.innerHTML += `
                            <div class="gear-slot">
                                <span class="gear-slot-name">${slot}</span>
                                <span class="gear-item-name" style="color: ${item ? '#fff' : '#444'}">${name}</span>
                                <span class="gear-item-stat">${stat}</span>
                            </div>
                        `;
                    });
                }
                
                if (weightText && weightFill && e.data.inventory) {
                    const weight = Math.round(e.data.inventory.weight * 10) / 10;
                    const maxWeight = e.data.inventory.maxWeight || 100;
                    weightText.textContent = `${weight} / ${maxWeight} lbs`;
                    weightFill.style.transform = 'scaleX(' + Math.min(1, weight / maxWeight) + ')';
                    
                    if (weight >= maxWeight) {
                        weightFill.style.background = 'linear-gradient(90deg, #f44336, #b71c1c)';
                        weightText.style.color = '#f44336';
                    } else {
                        weightFill.style.background = 'linear-gradient(90deg, #00bcd4, #ffeb3b, #f44336)';
                        weightText.style.color = '#aaa';
                    }
                }
            } else if (e.data && e.data.type === 'SHOW_COMBAT') {
                const ez = document.getElementById('encounter-zone');
                if (!ez.classList.contains('active')) {
                    window.logEvent('You encounter a Yakuza Goblin!', 'system');
                }
                ez.classList.add('active');
                document.getElementById('event-log-container').classList.add('active');
                if (e.data.health !== undefined) {
                    const hp = Math.max(0, Math.round(e.data.health));
                    const maxHp = e.data.maxHp || 50;
                    const mnum = document.getElementById('monster-hp-num');
                    if (mnum) mnum.textContent = hp;
                    const mfill = document.getElementById('monster-hp-fill');
                    if (mfill) mfill.style.transform = 'scaleX(' + Math.max(0, hp / maxHp) + ')';
                    // Update the max HP label [REF#UI-00426 → see REF#PN-01564]
                    const mmax = document.getElementById('monster-hp-max');
                    if (mmax) mmax.textContent = `/ ${maxHp} HP`;
                    // Colour-shift bar as HP drops [REF#UI-00427 → see REF#PN-01566]
                    if (mfill) {
                        if (hp <= 10) mfill.style.background = 'linear-gradient(90deg,#4a0000,#ff0000)';
                        else if (hp <= 25) mfill.style.background = 'linear-gradient(90deg,#b71c1c,#ff5252)';
                        else mfill.style.background = '';
                    }
                }
                // Update monster name from actual model userData [REF#UI-00428]
                if (e.data.name) {
                    const mname = document.getElementById('monster-name');
                    if (mname) mname.textContent = e.data.name;
                }
                // Update type label (ENEMY / GAMBLER) [REF#UI-00429]
                if (e.data.entityType) {
                    const mlabel = document.getElementById('monster-type-label');
                    if (mlabel) {
                        const typeStr = e.data.entityType === 'gambler' ? 'GAMBLER' : 'ENEMY';
                        const distEl = mlabel.querySelector('.dist-text');
                        const distStr = distEl ? distEl.outerHTML : '<span class="dist-text">-- ft</span>';
                        mlabel.innerHTML = `${typeStr} * ${distStr}`;
                    }
                }
                if (e.data.distance !== undefined) {
                    const distTexts = document.querySelectorAll('.dist-text');
                    // Center-to-center distance * 10, minus 10 feet for physical contact radius [REF#UI-00430 → see REF#PN-01570]
                    let distFeet = Math.max(0, (e.data.distance * 10) - 10).toFixed(0);
                    distTexts.forEach(el => el.textContent = `${distFeet} ft`);
                    window.currentMonsterDistanceFeet = parseInt(distFeet);
                    window.currentMonsterGridDistance = e.data.distance;
                }
            } else if (e.data && e.data.type === 'COMBAT_STATE_UPDATE') {
                const indicator = document.getElementById('turn-indicator');
                if (indicator) {
                    if (e.data.state === 'idle') {
                        indicator.style.display = 'none';
                        indicator.className = '';
                    } else if (e.data.state === 'player_turn') {
                        indicator.style.display = 'block';
                        indicator.className = 'player-turn';
                        indicator.textContent = 'PLAYER TURN';
                    } else if (e.data.state === 'monster_turn') {
                        indicator.style.display = 'block';
                        indicator.className = 'monster-turn';
                        indicator.textContent = 'ENEMY TURN';
                    }
                }
            } else if (e.data && e.data.type === 'SYNC_UI' && e.data.event === 'MONSTER_DEATH') {
                try {
                    window.parent.postMessage({
                        type: 'AUTO_SELECT_TARGET',
                        reason: 'monster-death',
                        deadId: e.data.id || null
                    }, '*');
                } catch (_) {}
            } else if (e.data && e.data.type === 'SHOW_LOOT_UI') {
                // Prevent GPU lockup: remove any existing YOU GOT animations before showing a new one [REF#UI-00431 → see REF#PN-01573]
                document.querySelectorAll('.yg-anim-trigger-3d').forEach(el => el.remove());
                
                const cData = e.data.cardData;
                const cat = defaultCategories.find(c => c.id === cData.el) || defaultCategories[0];
                const cardEl = document.createElement('div');
                cardEl.className = `guide-card card-${cat.id.toLowerCase()}`;
                
                const masterCard = (window.OrigamiCards || []).find(c => c.name === cData.name || c.id === cData.id);
                const cardLoc = masterCard ? (window.tCard && window.tCard(masterCard.id, window.currentLang)) : null;
                let cardName = cardLoc ? cardLoc.name : cData.name;
                const cardDesc = cardLoc ? cardLoc.desc : cat.desc;
                const cardAttr = cardLoc ? cardLoc.attr : (cat.attr || '');
                const _t2 = (cardLoc && cardLoc.title2) || (masterCard && masterCard.title2) || cat.title2 || '';
                if (_t2 && cardName.toUpperCase().endsWith(' ' + _t2.toUpperCase())){
                    cardName = cardName.slice(0, -(_t2.length + 1));
                }
                
                // Matches the player card format exactly [REF#UI-00432 → see REF#PN-01575]
                cardEl.innerHTML = `
                    <div class="card-header"><span class="card-kanji">${cardLoc ? cardLoc.kanji || cat.kanji || '' : cat.kanji || ''}</span><div class="card-type-pill">${cat.id}</div></div>
                    <h3 class="card-title" style="margin:0; height:16px;">${cardName}</h3>
                    <div class="card-title-2">${(cardLoc && cardLoc.title2) || (masterCard && masterCard.title2) || cat.title2 || ''}</div>
                    <p class="card-desc" style="margin:0; height:12px;">${cardDesc}</p>
                    ${(() => {
                        let elId = cat.id;
                        if (cData.name === 'SHORT BOW') elId = 'BOW_SHORT';
                        if (cData.name === 'LONG BOW' || cData.name === 'COMPOSITE BOW') elId = 'BOW_LONG';
                        if (cData.name === 'PISTOL') elId = 'PISTOL';
                        return `<div class="card-icon-3d" data-element="${elId}"><canvas></canvas></div>`;
                    })()}
                    <div class="card-attr-fused">${cardAttr}</div>
                `;
                
                // Position fixed, absolute center, scale up. Disable expensive backdrop filter during massive CSS scale animation to prevent 10 FPS GPU drop! [REF#UI-00433 → see REF#PN-01576]
                cardEl.style.cssText = "position:fixed; top:45%; left:45%; width:84px; height:126px; z-index:9000; pointer-events:none; box-shadow: 0 15px 35px rgba(0,0,0,0.9); backdrop-filter: none !important; -webkit-backdrop-filter: none !important;";
                cardEl.dataset.depth = "0"; // Critical to allow canvasCache to pick it up for 3D Icon Rendering! [REF#UI-00434 → see REF#PN-01577]
                
                // Add the YOU GOT title inside the card element (scaled inversely) [REF#UI-00435 → see REF#PN-01578]
                const ygTitle = document.createElement('h1');
                ygTitle.textContent = 'YOU GOT!';
                ygTitle.style.cssText = "position:absolute; top:-40px; left:50%; transform:translateX(-50%) scale(0.33); text-align:center; color:#00ffcc; font-size:52px; text-shadow:0 0 30px rgba(0,255,200,0.8); margin:0; font-weight:900; letter-spacing:3px; font-family:'Impact',sans-serif; width:300px;";
                cardEl.appendChild(ygTitle);
                
                cardEl.classList.add('yg-anim-trigger-3d');
                document.body.appendChild(cardEl);
                
                // Trigger canvas icon rendering loop immediately for this card [REF#UI-00436 → see REF#PN-01579]
                if (window.canvasCache) window.canvasCache.lastScan = 0;
                
                setTimeout(() => {
                    if(cardEl) cardEl.remove();
                }, 1250);
            } else if (e.data && e.data.type === 'UPDATE_LOOT_CARDS') {
                const layer = document.getElementById('floating-loot-layer');
                if (!layer) return;
                
                // Track alive elements to handle despawning [REF#UI-00437 → see REF#PN-01580]
                Array.from(layer.children).forEach(c => c.dataset.alive = "0");
                
                e.data.items.forEach(item => {
                    let card = document.getElementById('loot-c-' + item.id);
                    if (!card) {
                        card = document.createElement('div');
                        card.id = 'loot-c-' + item.id;
                        
                        const cat = defaultCategories.find(c => c.cards.includes(item.cardName)) || defaultCategories[0];
                        card.className = `guide-card card-${cat.id.toLowerCase()}`;
                        card.dataset.depth = "0";
                        card.style.position = 'absolute';
                        card.style.pointerEvents = 'auto'; // Re-enable pointer events since parent is none [REF#UI-00438 → see REF#PN-01582]
                        card.style.cursor = 'pointer';
                        
                        // Matches generateCardHTML layout pixel-perfectly [REF#UI-00439 → see REF#PN-01583]
                        // Auto-split the displayed name when title2 is a suffix
                        // ("PISTOL" + "MAGIC MISSILE" → "WAND OF")
                        let _itemName = item.cardName;
                        if (cat.title2 && _itemName.toUpperCase().endsWith(' ' + cat.title2.toUpperCase())){
                            _itemName = _itemName.slice(0, -(cat.title2.length + 1));
                        }
                        card.innerHTML = `
                            <div class="card-header"><span class="card-kanji">${cat.kanji || ''}</span><div class="card-type-pill">${cat.id}</div></div>
                            <h3 class="card-title" style="margin:0; height:16px;">${_itemName}</h3>
                            <div class="card-title-2">${cat.title2 || ''}</div>
                            <p class="card-desc" style="margin:0; height:12px;">${cat.desc}</p>
                            ${(() => {
                                let elId = cat.id;
                                if (item.cardName === 'SHORT BOW') elId = 'BOW_SHORT';
                                if (item.cardName === 'LONG BOW') elId = 'BOW_LONG';
                                if (item.cardName === 'PISTOL') elId = 'PISTOL';
                                return `<div class="card-icon-3d" data-element="${elId}"><canvas></canvas></div>`;
                            })()}
                            <div class="card-attr-fused">${cat.attr || ''}</div>
                        `;
                        
                        // Click to activate the 3D card remotely [REF#UI-00440 → see REF#PN-01584]
                        card.onclick = (e) => {
                            e.stopPropagation();
                            card.classList.add('launching');
                            
                            // Show card in PIP [REF#UI-00441 → see REF#PN-01585]
                            const pipOverlay = document.createElement('img');
                            pipOverlay.src = item.dataURL;
                            pipOverlay.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0); width: 60px; height: 90px; border-radius: 6px; box-shadow: 0 0 20px rgba(255,255,255,0.8); z-index: 50; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; pointer-events: none;";
                            const moondial = document.getElementById('moondial-wrapper');
                            if (moondial) moondial.appendChild(pipOverlay);
                            
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    pipOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
                                    pipOverlay.style.opacity = '1';
                                });
                            });
                            
                            setTimeout(() => {
                                pipOverlay.style.transform = 'translate(-50%, -50%) scale(1.5)';
                                pipOverlay.style.opacity = '0';
                                setTimeout(() => pipOverlay.remove(), 400);
                            }, 800);

                            setTimeout(() => {
                                card.classList.remove('launching');
                                if (window.emitAction) window.emitAction(item.cardName, card);
                            }, 420);
                        };

                        layer.appendChild(card);
                        // Trigger cache rescan for new canvas [REF#UI-00442 → see REF#PN-01586]
                        window.canvasCache = window.canvasCache || {};
                        window.canvasCache.lastScan = 0;
                    }
                    card.dataset.alive = "1";
                    
                    if (!item.visible) {
                        card.style.display = 'none';
                    } else {
                        card.style.display = 'flex';
                        // Float bottom-center anchored [REF#UI-00443 → see REF#PN-01587]
                        card.style.transform = `translate(-50%, -85%) scale(${item.scale})`;
                        card.style.left = item.left + 'px';
                        card.style.top = item.top + 'px';
                        card.style.zIndex = Math.floor(item.scale * 100);
                        card.style.opacity = Math.min(1.0, item.scale * 1.5).toString();
                    }
                });
                
                // Cleanup collected/despawned [REF#UI-00444 → see REF#PN-01588]
                Array.from(layer.children).forEach(c => {
                    if (c.dataset.alive === "0") c.remove();
                });
            } else if (e.data && (e.data.type === 'HIDE_COMBAT' || e.data.type === 'HIDE_ALL')) {
                window.currentMonsterGridDistance = Infinity;
                document.getElementById('encounter-zone').classList.remove('active');
                if (document.activeElement !== document.querySelector('.chat-input')) {
                    resetLogHideTimer();
                }
                loadDeck(CARD_CLASS_DECKS[window.cardClass] || spellCategories); // Reset deck after combat [REF#UI-00445]
                if (window.isKeyboardSelectorActive && typeof window._closeCardSelector === 'function') {
                    window._closeCardSelector('combat-end');
                }
                // Reclaim focus so keyboard events (movement, Enter, Space) resume immediately [REF#UI-00446 → see REF#PN-01598]
                if (document.activeElement && document.activeElement.tagName !== 'INPUT') {
                    window.focus();
                }
            } else if (e.data && e.data.type === 'COMBAT_ATTACK') {
                window.diceAttackSpin = 40.0;
                // Auto-melee bump: switch to Combat deck, focus column, bloom the fired card [REF#UI-00447 → see REF#PN-01599]
                if (e.data.autoMelee) {
                    const firedAction = (e.data.action || 'SLASH').toUpperCase();
                    window.lastCombatAttack = firedAction;

                    // Switch to combat deck (index 1) synchronously [REF#UI-00448 → see REF#PN-01600]
                    if (typeof window.switchDeck === 'function') window.switchDeck(1);

                    // After the deck re-renders (one rAF), find+focus the right column and bloom it [REF#UI-00449 → see REF#PN-01601]
                    requestAnimationFrame(() => {
                        // Find which col-N contains the fired action [REF#UI-00450 → see REF#PN-01602]
                        let targetCard = null, targetColIdx = -1;
                        document.querySelectorAll('.card-column').forEach((col, ci) => {
                            col.querySelectorAll('.guide-card').forEach(card => {
                                const title = (card.querySelector('.card-title')?.textContent || '').toUpperCase();
                                const cid   = (card.dataset.cardId || '').toUpperCase();
                                if (title.includes(firedAction) || cid.includes(firedAction.replace(' ','_'))) {
                                    if (!targetCard) { targetCard = card; targetColIdx = ci; }
                                }
                            });
                        });

                        // Focus the column so the column border lights up [REF#UI-00451 → see REF#PN-01603]
                        if (targetColIdx >= 0) setFocus(targetColIdx, false);

                        if (targetCard) {
                            // Full animation pipeline: flash → launch arc → melee bloom glow [REF#UI-00452 → see REF#PN-01604]
                            targetCard.classList.remove('melee-bloom', 'launching', 'enter-flash');
                            void targetCard.offsetWidth; // force reflow to restart animation [REF#UI-00453 → see REF#PN-01605]
                            targetCard.classList.add('enter-flash');
                            setTimeout(() => {
                                targetCard.classList.remove('enter-flash');
                                targetCard.classList.add('launching');
                                setTimeout(() => {
                                    targetCard.classList.remove('launching');
                                    targetCard.classList.add('melee-bloom');
                                    setTimeout(() => targetCard.classList.remove('melee-bloom'), 750);
                                }, 200);
                            }, 120);
                        }
                    });
                }
                if (avatarActions && avatarActions.slash) {
                    const slash = avatarActions.slash;
                    slash.reset();
                    slash.setLoop(THREE.LoopOnce, 1);
                    slash.clampWhenFinished = true;
                    // Safely fade out old action to prevent crossFade NULL errors [REF#UI-00454 → see REF#PN-01606]
                    if (avatarCurrentAction && avatarCurrentAction.isRunning()) {
                        avatarCurrentAction.fadeOut(0.2);
                    }
                    slash.fadeIn(0.2).play();
                    avatarCurrentAction = slash;
                    
                    // Return to idle/walk after animation finishes (~1sec) [REF#UI-00455 → see REF#PN-01607]
                    setTimeout(() => {
                        const nextAction = document.body.classList.contains('is-moving') ? avatarActions.walk : avatarIdleAction;
                        if (nextAction && nextAction !== avatarCurrentAction) {
                            nextAction.reset();
                            if (avatarCurrentAction) avatarCurrentAction.fadeOut(0.3);
                            nextAction.fadeIn(0.3).play();
                            avatarCurrentAction = nextAction;
                        }
                    }, Math.max(1000, (slash.getClip().duration * 1000) - 200));
                }
                
                if (e.data.damage > 0) {
                    if (typeof logEvent === 'function') logEvent(`You hit for ${e.data.damage} damage!`, 'system');
                } else {
                    if (typeof logEvent === 'function') logEvent(`You swing and MISS!`, 'system');
                }
            } else if (e.data && e.data.type === 'MONSTER_ATTACK') {
                if (e.data.damage > 0) {
                    if (typeof logEvent === 'function') logEvent(`Monster hits you for ${e.data.damage} damage!`, 'system');
                } else {
                    if (typeof logEvent === 'function') logEvent(`Monster attacks and MISSES!`, 'system');
                }

            } else if (e.data && e.data.type === 'SYNC_STATS') {
                const php = document.getElementById('player-hp-val');
                const pgold = document.getElementById('player-gold-val');
                const lvlBadge = document.querySelector('.level-badge');
                
                if (php) {
                    php.textContent = e.data.hp;
                    if (e.data.hp <= 20) php.parentElement.style.color = '#ff5252';
                    else php.parentElement.style.color = '#00ffcc';
                }
                if (pgold) pgold.textContent = e.data.gold;
                window.playerGold = e.data.gold;
                if (lvlBadge && e.data.playerLevel) lvlBadge.textContent = e.data.playerLevel;
                
                // Set health donut variable [REF#UI-00456 → see REF#PN-01612]
                const avatarCircle = document.querySelector('.avatar-circle');
                if (avatarCircle && e.data.maxHp) {
                    const hpPct = Math.max(0, Math.min(100, (e.data.hp / e.data.maxHp) * 100));
                    avatarCircle.style.setProperty('--hp-pct', `${hpPct}%`);
                }
                
                if (e.data.karma !== undefined) {
                    let kWhite = 255;
                    let kBlack = 17;
                    const karma = Math.max(-100, Math.min(100, e.data.karma));
                    if (karma < 0) {
                        const ratio = Math.abs(karma) / 100;
                        kWhite = Math.round(255 - (255 - 17) * ratio);
                    } else if (karma > 0) {
                        const ratio = karma / 100;
                        kBlack = Math.round(17 + (255 - 17) * ratio);
                    }
                    const thumbBtn = document.querySelector('.kp-center-btn');
                    if (thumbBtn) {
                        thumbBtn.style.setProperty('--karma-white', `rgb(${kWhite},${kWhite},${kWhite})`);
                        thumbBtn.style.setProperty('--karma-black', `rgb(${kBlack},${kBlack},${kBlack})`);
                    }
                }
                
                // Attributes [REF#UI-00457]
                ['str','dex','con','int','wis','cha'].forEach(a => {
                    const el = document.getElementById(`attr-${a}`);
                    if (el && e.data[a]) el.textContent = e.data[a];
                });
                
                const pxp = document.getElementById('player-xp-val');
                if (pxp && e.data.xp !== undefined) pxp.textContent = e.data.xp;
                const pxpMax = document.getElementById('player-xp-max');
                if (pxpMax && e.data.maxXp) pxpMax.textContent = e.data.maxXp;
                const phb = document.getElementById('player-hp-max');
                if (phb && e.data.maxHp) phb.textContent = `/ ${e.data.maxHp} HP`;
                
                const pfill = document.getElementById('player-hp-fill');
                const hp = Math.max(0, Math.round(e.data.hp));
                if (pfill && e.data.maxHp) pfill.style.transform = 'scaleX(' + Math.max(0, hp / e.data.maxHp) + ')';
                // Colour-shift as HP drops [REF#UI-00458 → see REF#PN-01619]
                if (pfill) {
                    if (hp <= 20) pfill.style.background = 'linear-gradient(90deg,#4a0000,#ff1111)';
                    else if (hp <= 50) pfill.style.background = 'linear-gradient(90deg,#b71c1c,#ff7043)';
                    else pfill.style.background = '';
                }
            } else if (e.data && e.data.type === 'LOOT_CARDS') {
                window.logEvent('LOOT AQUIRED: Tactical Katana Deck', 'system');
                loadDeck(combatCategories);
            } else if (e.data && e.data.type === 'AMMO_PICKUP') {
                // Player walked over a recovered projectile — increment ammo badge by 1 [REF#UI-00459 → see REF#PN-01620]
                const ammoName = e.data.card; // e.g. "SHURIKEN" or "SHORT BOW" [REF#UI-00460 → see REF#PN-01621]
                const _setAmmoBadge = (baseName, qty) => {
                    document.querySelectorAll('.guide-card').forEach(card => {
                        const titleEl = card.querySelector('.card-title');
                        if (titleEl && (titleEl.textContent === baseName || titleEl.textContent.startsWith(baseName + ' x'))) {
                            let badge = card.querySelector('.card-badge');
                            if (!badge) { badge = document.createElement('div'); badge.className = 'card-badge'; card.appendChild(badge); }
                            const prev = parseInt(card.dataset.qty) || 0;
                            const next = prev + qty;
                            badge.textContent = next;
                            card.dataset.qty = next;
                            // Quick amber flash on badge to confirm pickup [REF#UI-00461 → see REF#PN-01622]
                            badge.style.background = '#ffaa00';
                            setTimeout(() => badge.style.background = '', 400);
                        }
                    });
                };
                _setAmmoBadge(ammoName, 1);
                if (window.logEvent) window.logEvent(`+1 ${ammoName} recovered`, 'loot');
            } else if (e.data && e.data.type === 'ADD_CARD') {
                const cardName = e.data.card;
                if (!window.cardInventoryCounts) window.cardInventoryCounts = {};

                // --- Card Classification --- [REF#UI-00462]
                // Ammo cards: badge tracks ammunition qty, never spawn a second card.
                // PISTOL added — each pickup adds a magazine of rounds to the
                // existing card instead of spawning a duplicate.
                const AMMO_CARDS = ['SHURIKEN', 'SHORT BOW', 'LONG BOW', 'CROSSBOW', 'DAGGER', 'PISTOL'];
                // Skill cards: first pickup adds the card; duplicates grant +1 to linked stat [REF#UI-00463 → see REF#PN-01640]
                const SKILL_STAT_MAP = {
                    'SLASH':        'str',
                    'THRUST':       'str',
                    'HARD ATTACK':  'str',
                    'DEFEND':       'con',
                    'SHIELD':       'con',
                    'BOULDER':      'str',
                    'FISSURE':      'str',
                    'GALE':         'dex',
                    'CYCLONE':      'dex',
                    'FIREBALL':     'int',
                    'PYROBLAST':    'int',
                    'COMET':        'int',
                    'SURGE':        'wis',
                    'TIDE':         'wis',
                    'POTION':       'con',
                    'HEAL POTION':  'con',
                    'HELMET':       'con',
                    'CHEST ARMOR':  'con',
                };

                // Parse qty suffix e.g. "SHURIKEN x5" → base="SHURIKEN", qty=5 [REF#UI-00464 → see REF#PN-01643]
                const qtyMatch = cardName.match(/^(.+?)\s*x(\d+)$/i);
                const baseName = qtyMatch ? qtyMatch[1].trim() : cardName;
                const cardQty  = qtyMatch ? parseInt(qtyMatch[2]) : 1;
                const baseUpper = baseName.toUpperCase();

                const isAmmoCard  = AMMO_CARDS.some(n => baseUpper === n || baseUpper.includes(n));
                const linkedStat  = SKILL_STAT_MAP[baseName] || null;
                const isSkillCard = !!linkedStat;

                // --- Helper: update badge on every visible card matching this name --- [REF#UI-00465 → see REF#PN-01647]
                const _applyBadge = (matchName, delta, absolute) => {
                    document.querySelectorAll('.guide-card').forEach(card => {
                        const titleEl = card.querySelector('.card-title');
                        if (!titleEl) return;
                        const t = titleEl.textContent;
                        if (t === matchName || t === baseName || t.startsWith(baseName + ' x')) {
                            let badge = card.querySelector('.card-badge');
                            if (!badge) {
                                badge = document.createElement('div');
                                badge.className = 'card-badge';
                                card.appendChild(badge);
                            }
                            const prev = parseInt(card.dataset.qty) || 0;
                            const next = absolute !== undefined ? absolute : prev + delta;
                            badge.textContent = next;
                            card.dataset.qty = next;
                            // Amber flash to confirm [REF#UI-00466 → see REF#PN-01648]
                            badge.style.background = '#ffaa00';
                            setTimeout(() => { badge.style.background = ''; }, 400);
                        }
                    });
                };

                // --- Also update rangeCategories.qty so loadDeck rebuilds with correct count --- [REF#UI-00467 → see REF#PN-01649]
                const _syncCategoryQty = (matchName, delta) => {
                    [spellCategories, combatCategories, rangeCategories, itemCategories].forEach(deck => {
                        deck.forEach(cat => {
                            if (cat.cards && cat.cards.some(c => c === matchName || c === baseName)) {
                                cat.qty = (cat.qty || 0) + delta;
                            }
                        });
                    });
                };

                const prevCount = window.cardInventoryCounts[baseName] || 0;
                window.cardInventoryCounts[baseName] = prevCount + cardQty;

                if (isAmmoCard) {
                    // ── AMMO CARD: always just add to badge qty, never a new card ── [REF#UI-00468 → see REF#PN-01651]
                    // If the card was hidden because its qty was 0 (per the
                    // "no zero-qty cards in hand" rule), the badge update is
                    // a no-op. Detect that case and re-render the current
                    // deck so the freshly-stocked card appears.
                    const wasHidden = !document.querySelector('.guide-card .card-title') ||
                        !Array.from(document.querySelectorAll('.guide-card .card-title'))
                            .some(t => t.textContent === baseName || t.textContent.startsWith(baseName + ' x'));
                    _applyBadge(baseName, cardQty);
                    _syncCategoryQty(baseName, cardQty);
                    if (wasHidden) loadDeck(categories); // re-render to surface the now-non-zero card [REF#UI-00469]
                    if (window.logEvent) window.logEvent(`+${cardQty} ${baseName} ammo`, 'loot');

                } else if (isSkillCard && prevCount >= 1) {
                    // ── SKILL CARD DUPLICATE: +1 stat, no new card ── [REF#UI-00470 → see REF#PN-01656]
                    window.parent.postMessage({ type: 'SKILL_UP', stat: linkedStat, amount: 1 }, '*');
                    if (window.logEvent) window.logEvent(`${baseName} mastery: +1 ${linkedStat.toUpperCase()}`, 'loot');

                } else {
                    // ── NEW CARD (first pickup of any kind) ── [REF#UI-00471 → see REF#PN-01657]
                    // Nothing extra — the engine's spawnLootCard already placed the 3D loot;
                    // Panels will show it via SHOW_LOOT_UI. Badge starts at cardQty if >1.
                    if (cardQty > 1) _applyBadge(baseName, 0, cardQty);
                    _syncCategoryQty(baseName, cardQty);
                }

                // If inventory is open, refresh it [REF#UI-00472 → see REF#PN-01663]
                const invModal = document.getElementById('inventory-modal');
                if (invModal && invModal.classList.contains('active')) {
                    window.renderInventory();
                }

                // ── Auto-switch the deck to the picked card ── [REF#UI-00473 → see REF#PN-01664]
                // Player feedback for "I just picked up X" is that X immediately
                // becomes the active card on the playing-card row, in whichever
                // deck (SPELLS / MELEE / MISSILE / ITEMS) owns it. The deck is
                // resolved by scanning the four category arrays for a
                // category whose `cards` includes the baseName.
                {
                    const DECK_LOOKUP = {
                        SPELLS:  spellCategories,
                        MELEE:   combatCategories,
                        RANGED:  rangeCategories,
                        ITEM:    itemCategories,
                    };

                    let targetDeck = null;
                    for (const [deckName, cats] of Object.entries(DECK_LOOKUP)){
                        if (cats && cats.some(c => c.cards && c.cards.includes(baseName))){
                            targetDeck = deckName; break;
                        }
                    }
                    if (targetDeck && targetDeck !== 'SPELLS' && typeof window.cycleCardClass === 'function'){
                        // Switch decks only if we're not already there — avoids [REF#UI-00474 → see REF#PN-01665]
                        // a needless re-render flash on same-deck pickups.
                        if (window.cardClass !== targetDeck){
                            window.cycleCardClass(targetDeck);
                        }
                        // Focus the picked card so it sits as the active [REF#UI-00475 → see REF#PN-01668]
                        // top-of-stack one. Defer to next tick so loadDeck has
                        // mounted the new DOM before we query for it.
                        if (typeof window._focusCardByName === 'function'){
                            setTimeout(() => window._focusCardByName(baseName), 0);
                        }
                    }
                }
            } else if (e.data && e.data.type === 'LCD_EVENT') {
                if (window.showLcdEvent) window.showLcdEvent(e.data.text, e.data.context);
            } else if (e.data && e.data.type === 'LOG_EVENT') {
                window.logEvent(e.data.text || e.data.message, e.data.logType || 'system');
            } else if (e.data && e.data.type === 'PLAYER_MOVE') {
                if (e.data.rot !== undefined) updateCompass(e.data.rot);
            } else if (e.data && e.data.type === 'PLAYER_ROT_REALTIME') {
                // Real-time rotation update (broadcasted ~20hz from FPV engine) [REF#UI-00476 → see REF#PN-01674]
                if (e.data.rot !== undefined) updateCompass(e.data.rot);
            } else if (e.data && e.data.type === 'RADAR_UPDATE') {
                if (e.data.rot !== undefined) updateCompass(e.data.rot);
                // Support both old {enemies:[]} and new {blips:[]} payloads [REF#UI-00477 → see REF#PN-01675]
                const blips = e.data.blips || (e.data.enemies || []).map(en => ({ ...en, kind: 'enemy' }));

                // ── Unified radar ring ── [REF#UI-00478]
                // All contacts (enemy / loot / stairs) ride one neumorphic
                // track on the inner bezel face — sits BETWEEN the compass
                // dial (NSEW markers + tick band at r ≈ 137–149) and the
                // moondial (moon-phase icons at r ≈ 125). World-bearing
                // (north-up), so dots stay map-aligned even when the player
                // spins. Kind encoded by colour (red enemy / gold loot),
                // brightness brightens within ~40 ft.
                const monRing = document.getElementById('monster-radar-ring');
                if (monRing) {
                    // Bezel face spans r=125 → r=149 (24px wide). The dots [REF#UI-00479]
                    // ride the INNER half (r=130) and the moon-phase icons
                    // were pushed to the OUTER half (~r=153 after the
                    // -28px span offset). That gives ~23px clean separation
                    // between the two tracks, removing the visual clipping
                    // the user reported.
                    const ORBIT       = 130;
                    const CLOSE_TILES = 8;   // 40 ft @ 5 ft / tile [REF#UI-00480 → see REF#PN-01678]
                    const kids = monRing.children;
                    let mShown = 0;

                    // Enemies + loot share the dot pool. Stairs use a [REF#UI-00481 → see REF#PN-01679]
                    // persistent star element kept across frames.
                    const playerRot   = e.data.rot || 0;
                    const dotBlips = blips.filter(b => b.kind === 'enemy' || b.kind === 'loot');
                    for (let i = 0; i < dotBlips.length; i++) {
                        const b = dotBlips[i];
                        const relBearing = Math.atan2(b.dx, -b.dz) - playerRot;
                        const pxX =  Math.sin(relBearing) * ORBIT;
                        const pxZ = -Math.cos(relBearing) * ORBIT;

                        const dist = Math.hypot(b.dx, b.dz);
                        const isClose = dist <= CLOSE_TILES;

                        // Skip the persistent stairs star when reusing pool slots. [REF#UI-00482 → see REF#PN-01683]
                        let dot = kids[mShown];
                        while (dot && dot.classList.contains('mon-radar-stair')){
                            mShown++;
                            dot = kids[mShown];
                        }
                        if (!dot){
                            dot = document.createElement('div');
                            dot.className = 'mon-radar-dot';
                            monRing.appendChild(dot);
                        }
                        // Reset to a clean base class, then re-apply kind/proximity. [REF#UI-00483 → see REF#PN-01684]
                        // Keeps switching between enemy/loot in the same slot cheap.
                        let wantCls = 'mon-radar-dot';
                        if (b.kind === 'loot') wantCls += ' loot';
                        if (isClose)           wantCls += ' close';
                        if (dot.className !== wantCls) dot.className = wantCls;

                        dot.style.transform = `translate(${pxX}px, ${pxZ}px)`;
                        dot.style.display = 'block';
                        mShown++;
                    }
                    for (let i = mShown; i < kids.length; i++) {
                        // Don't hide the persistent stairs star — it lives [REF#UI-00484 → see REF#PN-01686]
                        // alongside the dot pool and is updated separately.
                        if (kids[i].classList.contains('mon-radar-stair')) continue;
                        kids[i].style.display = 'none';
                    }

                    // ── Stairs star on the same ring ── [REF#UI-00485 → see REF#PN-01687]
                    // Reuses a single persistent element so it doesn't get
                    // recycled with the dot pool. World-bearing only (north-up):
                    // stairs always sit at their map direction from the player.
                    let stairEl = monRing.querySelector('.mon-radar-stair');
                    const stairBlip = blips.find(b => b.kind === 'stairs');
                    if (stairBlip){
                        if (!stairEl){
                            stairEl = document.createElement('div');
                            stairEl.className = 'mon-radar-stair';
                            monRing.appendChild(stairEl);
                        }
                        const sBearing = Math.atan2(stairBlip.dx, -stairBlip.dz) - playerRot;
                        const sx =  Math.sin(sBearing) * ORBIT;
                        const sz = -Math.cos(sBearing) * ORBIT;
                        stairEl.style.transform = `translate(${sx}px, ${sz}px)`;
                        stairEl.style.display = 'block';
                    } else if (stairEl){
                        stairEl.style.display = 'none';
                    }
                }
            } else if (e.data && e.data.type === 'FLOOR_UPDATE') {
                const badge = document.getElementById('floor-badge');
                if (badge) {
                    const f = parseInt(e.data.floor || 1, 10);
                    const m = parseInt(e.data.maxFloor || 7, 10);
                    badge.textContent = (f === m)
                        ? `FLOOR ${f} / ${m} ◆ THRONE`
                        : `FLOOR ${f} / ${m}`;
                    badge.classList.toggle('throne', f === m);
                    badge.classList.add('visible');
                }
                window._currentFloor = parseInt(e.data.floor || 1, 10);
            } else if (e.data && e.data.type === 'MONSTER_HAIKU') {
                // Engine asks panels to drop a haiku chat-bubble in the log [REF#UI-00486]
                // for the named goblin (delivered on attack).
                if (window.logHaikuFor) window.logHaikuFor(e.data.name);
            } else if (e.data && e.data.type === 'HIT_MARKER') {
                // PISTOL hit-marker pop — short crosshair flash in screen [REF#UI-00487 → see REF#PN-01695]
                // center + a quick metallic tick. kind: 'headshot' makes the
                // marker bigger + red and plays a higher pitch.
                const kind = e.data.kind || 'body';
                let hm = document.getElementById('cod-hit-marker');
                if (!hm){
                    hm = document.createElement('div');
                    hm.id = 'cod-hit-marker';
                    hm.style.cssText = [
                        'position:fixed','left:50%','top:50%',
                        'transform:translate(-50%,-50%) scale(0.6)',
                        'width:34px','height:34px',
                        'pointer-events:none','z-index:9999','opacity:0',
                        'transition:opacity 90ms ease-out, transform 120ms ease-out',
                    ].join(';');
                    // Build the four crosshair ticks as inline divs (no SVG needed) [REF#UI-00488 → see REF#PN-01696]
                    const tick = (rot) => `<div style="position:absolute;left:50%;top:50%;width:2px;height:12px;margin-left:-1px;margin-top:-6px;background:#ffffff;box-shadow:0 0 6px #fff,0 0 10px #fff;transform:translate(0,0) rotate(${rot}deg) translateY(-9px);transform-origin:center"></div>`;
                    hm.innerHTML = tick(0) + tick(90) + tick(180) + tick(270);
                    document.body.appendChild(hm);
                }
                // Tint + scale by kind [REF#UI-00489 → see REF#PN-01697]
                const headshot = (kind === 'headshot');
                hm.querySelectorAll('div').forEach(t => {
                    t.style.background  = headshot ? '#ff5555' : '#ffffff';
                    t.style.boxShadow   = headshot
                        ? '0 0 8px #ff3333,0 0 14px #ff0000'
                        : '0 0 6px #fff,0 0 10px #fff';
                });
                // Pop in [REF#UI-00490]
                hm.style.opacity = '1';
                hm.style.transform = `translate(-50%,-50%) scale(${headshot ? 1.6 : 1.15})`;
                // Schedule fade out [REF#UI-00491 → see REF#PN-01699]
                clearTimeout(window._hitMarkerT);
                window._hitMarkerT = setTimeout(() => {
                    hm.style.opacity = '0';
                    hm.style.transform = 'translate(-50%,-50%) scale(0.6)';
                }, headshot ? 220 : 140);
                // Quick metallic tick [REF#UI-00492 → see REF#PN-01700]
                try {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    const ac  = window._hmAC || (window._hmAC = Ctx ? new Ctx() : null);
                    if (ac){
                        const now = ac.currentTime;
                        const o = ac.createOscillator();
                        o.type = 'square';
                        o.frequency.setValueAtTime(headshot ? 2400 : 1600, now);
                        const g = ac.createGain();
                        g.gain.setValueAtTime(headshot ? 0.10 : 0.07, now);
                        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                        o.connect(g); g.connect(ac.destination);
                        o.start(now); o.stop(now + 0.07);
                    }
                } catch (_) {}
            } else if (e.data && e.data.type === 'SAVE_LIST') {
                if (window.renderSaveList) window.renderSaveList(e.data.saves || []);
            } else if (e.data && e.data.type === 'SAVE_DONE') {
                // Engine confirmed the save was written. Close modal & log. [REF#UI-00493]
                if (window.logEvent) window.logEvent(
                    e.data.success
                        ? `💾 Saved as <b>${e.data.name}</b>.`
                        : `⚠ Save failed for <b>${e.data.name}</b>.`,
                    e.data.success ? 'system' : 'damage'
                );
                if (e.data.success && window.closeSaveModal) window.closeSaveModal();
            } else if (e.data && e.data.type === 'INVENTORY_RESTORE') {
                // After a Load, the engine pushes back the saved inventory [REF#UI-00494 → see REF#PN-01705]
                // counts so the panels-side card UI re-syncs without needing
                // a full reload of this iframe.
                window.cardInventoryCounts = e.data.inventory || {};
                if (typeof loadDeck === 'function' && typeof categories !== 'undefined'){
                    // Re-apply qty into the matching categories so badges show [REF#UI-00495 → see REF#PN-01707]
                    // the restored counts.
                    const all = (typeof defaultCategories !== 'undefined') ? defaultCategories : categories;
                    for (const cat of all || []){
                        if (!cat.cards) continue;
                        let total = 0;
                        for (const c of cat.cards){
                            const n = window.cardInventoryCounts[c] || 0;
                            if (n > total) total = n;
                        }
                        if (cat.qty !== undefined) cat.qty = total;
                    }
                    if (typeof loadDeck === 'function' && typeof categories !== 'undefined'){
                        loadDeck(categories);
                    }
                }
            } else if (e.data && e.data.type === 'PLAYER_MOVE_STATE') {
                if (e.data.isMoving) {
                    document.body.classList.add('is-moving');
                    hideExitModal(); // Hide if player walks away [REF#UI-00496]
                    
                    // Moving auto-hides the log after 3s if no new events [REF#UI-00497]
                    resetLogHideTimer(); 

                    const walk = avatarActions ? avatarActions.walk : null;
                    if (walk) {
                        walk.setEffectiveTimeScale(1.0);
                        if (avatarCurrentAction && avatarCurrentAction !== walk) {
                            walk.crossFadeFrom(avatarCurrentAction, 0.25, true);
                        }
                        walk.play();
                        avatarCurrentAction = walk;
                    }
                }
                else {
                    document.body.classList.remove('is-moving');
                    // Entering idle starts the hide timer [REF#UI-00498 → see REF#PN-01712]
                    resetLogHideTimer();

                    if (avatarIdleAction) {
                        const isWalkCycle = (avatarActions && avatarIdleAction === avatarActions.walk);
                        avatarIdleAction.setEffectiveTimeScale(isWalkCycle ? 0 : 1.0);
                        if (avatarCurrentAction && avatarCurrentAction !== avatarIdleAction) {
                            avatarIdleAction.crossFadeFrom(avatarCurrentAction, 0.3, true);
                        }
                        avatarIdleAction.play();
                        avatarCurrentAction = avatarIdleAction;
                    } else if (!avatarIdleAction && avatarCurrentAction) {
                        // Return to T-pose/idle freeze if no logical idle clip exists [REF#UI-00499 → see REF#PN-01713]
                        avatarCurrentAction.fadeOut(0.3);
                        setTimeout(() => { if (avatarCurrentAction && avatarCurrentAction.getEffectiveWeight() === 0) avatarCurrentAction.stop(); avatarCurrentAction = null; }, 300);
                    }
                }
            } else if (e.data && e.data.type === 'MISSILE_RECOVERED') {
                // Engine tells us a missile (arrow/shuriken) survived — give +1 ammo back [REF#UI-00500 → see REF#PN-01714]
                const rName = (e.data.cardName || '').toUpperCase();
                document.querySelectorAll('.guide-card').forEach(card => {
                    const titleEl = card.querySelector('.card-title');
                    if (!titleEl) return;
                    const t = titleEl.textContent.toUpperCase();
                    // Match by card name substring (e.g. "LONG BOW", "SHURIKEN x3") [REF#UI-00501 → see REF#PN-01715]
                    const base = rName.replace(/\s*X\d+$/, '').trim();
                    if (!t.includes(base)) return;
                    let badge = card.querySelector('.card-badge');
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'card-badge';
                        card.appendChild(badge);
                    }
                    const prev = parseInt(card.dataset.qty) || 0;
                    const next = prev + 1;
                    badge.textContent = next;
                    card.dataset.qty = next;
                    card.style.pointerEvents = '';
                    card.style.opacity = '';
                    // Green flash to signal recovery [REF#UI-00502 → see REF#PN-01716]
                    badge.style.background = '#00cc55';
                    setTimeout(() => { badge.style.background = ''; }, 600);
                });
            } else if (e.data && e.data.type === 'SHOW_EXIT') {
                showExitModal();
            } else if (e.data && e.data.type === 'HIDE_EXIT') {
                if(exitModalActive) hideExitModal();
            }
        };

        // Viewport Readout Logic [REF#UI-00503 → see REF#PN-01724]
        function updateViewportReadout() {
            const readout = document.getElementById('viewport-readout');
            if (readout) {
                const w = window.innerWidth;
                const h = window.innerHeight;
                let device = 'Mobile';
                if (w >= 1024) device = 'Desktop';
                else if (w >= 640) device = 'Tablet';
                readout.textContent = `(Viewport:${device} [${w}x${h}])`;
            }
        }
        window.addEventListener('resize', updateViewportReadout);
        
        let logHideTimeout = null;
        let isHoveringLog = false;
        
        // T0.8 — Sidebar registry. While any sidebar is open the event log [REF#UI-00504]
        // must stay visible (no fade). When all sidebars close, the timer
        // resumes and fades the log after 3s of no new events.
        function _isAnySidebarOpen() {
            const ids = ['inventory-modal', 'settings-modal', 'exit-modal'];
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                if (el.classList.contains('active')) return true;
                if (el.style && el.style.display === 'block') return true;
            }
            return false;
        }

        function resetLogHideTimer() {
            if (logHideTimeout) clearTimeout(logHideTimeout);
            logHideTimeout = setTimeout(() => {
                const logCont = document.getElementById('event-log-container');
                const ez = document.getElementById('encounter-zone');
                if (!logCont) return;
                if (isHoveringLog) return;
                // Combat owns the encounter-zone — block fade unless the panel [REF#UI-00505]
                // was only open as the log's visual pair.
                if (ez && ez.classList.contains('active') && ez.dataset.pairedWithLog !== '1') return;
                if (_isAnySidebarOpen()) return; // T0.8 — sidebar holds the log open [REF#UI-00506]
                logCont.classList.remove('active');
                // Log + side panels are a pair — close them together when the [REF#UI-00507]
                // panels were opened as the log's companion (not by combat).
                if (ez && ez.dataset.pairedWithLog === '1') {
                    ez.classList.remove('active');
                    delete ez.dataset.pairedWithLog;
                }
            }, 3000);
        }

        // Keep active while hovered so user can scroll [REF#UI-00508]
        const logContEl = document.getElementById('event-log-container');
        if (logContEl) {
            logContEl.addEventListener('mouseenter', () => { isHoveringLog = true; clearTimeout(logHideTimeout); });
            logContEl.addEventListener('mouseleave', () => { isHoveringLog = false; resetLogHideTimer(); });

            // Pair: event log + side panels (encounter-zone) open together. [REF#UI-00509]
            // Whenever the log gains .active, mirror it onto the encounter-zone
            // (unless combat already owns the panels — then the existing
            // .active stays under combat's ownership). The data-pairedWithLog
            // flag tells resetLogHideTimer it may close ez when the log fades.
            const ezForPair = document.getElementById('encounter-zone');
            if (ezForPair && 'MutationObserver' in window) {
                let lastActive = logContEl.classList.contains('active');
                new MutationObserver(() => {
                    const nowActive = logContEl.classList.contains('active');
                    if (nowActive && !lastActive && !ezForPair.classList.contains('active')) {
                        ezForPair.classList.add('active');
                        ezForPair.dataset.pairedWithLog = '1';
                    }
                    lastActive = nowActive;
                }).observe(logContEl, { attributes: true, attributeFilter: ['class'] });
            }
        }

        // T0.8 — Wrap each known sidebar open/close so the log visibility rule fires. [REF#UI-00510]
        // Sidebar OPEN  → force-show log + clear fade timer.
        // Sidebar CLOSE → restart fade timer (will hide 3s later if no new events).
        function _wrapSidebarToggle(openName, closeName) {
            const origOpen  = window[openName];
            const origClose = window[closeName];
            if (typeof origOpen === 'function') {
                    window[openName] = function(...args) {
                        const r = origOpen.apply(this, args);
                        const lc = document.getElementById('event-log-container');
                        if (lc) {
                            lc.classList.add('active');
                            clearTimeout(logHideTimeout);
                        }
                        try{ window.parent.postMessage({type:'SIDEBAR_OPEN', sidebar: openName}, '*'); }catch(e){}
                        return r;
                    };
                }
            if (typeof origClose === 'function') {
                window[closeName] = function(...args) {
                    const r = origClose.apply(this, args);
                    resetLogHideTimer();
                    // SIDEBAR_CLOSE post disabled (user mandate 2026-05-28). [REF#UI-00511]
                    // try{ window.parent.postMessage({type:'SIDEBAR_CLOSE', sidebar: closeName}, '*'); }catch(e){}
                    return r;
                };
            }
        }
        _wrapSidebarToggle('openInventory', 'closeInventory');
        _wrapSidebarToggle('openSettings',  'closeSettings');
        _wrapSidebarToggle('showExitModal', 'hideExitModal');

        // Log System & Chat Input bindings [REF#UI-00512]
        window.logEvent = function(text, type = 'system') {
            const container = document.getElementById('event-log-container');
            if (!container) return;
            if (text == null || text === '') return;

            // Auto open panel for any system or combat dialogue [REF#UI-00513]
            if (type === 'chat' || type === 'system' || type === 'damage' || type === 'room' || type === 'flee' || type === 'haiku') {
                container.classList.add('active');
                resetLogHideTimer();
            }

            let formattedText = text;
            if (type === 'chat' && !formattedText.includes('"')) {
                formattedText = `"${formattedText}"`;
            }

            // Dedup: if the most recent entry matches text + type, don't add a [REF#UI-00514 → see REF#PN-01757]
            // duplicate row. Instead increment a small ×N counter on it.
            const last = container.lastElementChild;
            if (last && last.dataset && last.dataset.logKey === `${type}:${formattedText}`) {
                const prevCount = parseInt(last.dataset.logCount || '1', 10);
                const nextCount = prevCount + 1;
                last.dataset.logCount = String(nextCount);
                // Re-render with count badge [REF#UI-00515 → see REF#PN-01758]
                last.innerHTML = `${formattedText} <span style="opacity:0.5;font-size:0.85em;font-weight:600;">\u00d7${nextCount}</span>`;
                resetLogHideTimer();
                return;
            }

            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            entry.dataset.logKey = `${type}:${formattedText}`;
            entry.dataset.logCount = '1';
            entry.innerHTML = formattedText;
            container.appendChild(entry);
            while (container.childNodes.length > 50) container.removeChild(container.firstChild);
            container.scrollTop = container.scrollHeight;
        };

        const chatInput = document.querySelector('.chat-input');
        if (chatInput) {
            chatInput.addEventListener('focus', () => {
                const el = document.getElementById('event-log-container');
                if (el) {
                    el.classList.add('active');
                    el.classList.add('user-focused');
                }
                const ez = document.getElementById('encounter-zone');
                if (ez && !ez.classList.contains('active')) {
                    ez.classList.add('active');
                    ez.dataset.pairedWithLog = '1';
                }
                resetLogHideTimer();
            });
            chatInput.addEventListener('click', () => {
                const el = document.getElementById('event-log-container');
                if (el) {
                    el.classList.add('active');
                    el.classList.add('user-focused');
                }
                const ez = document.getElementById('encounter-zone');
                if (ez && !ez.classList.contains('active')) {
                    ez.classList.add('active');
                    ez.dataset.pairedWithLog = '1';
                }
                resetLogHideTimer();
            });
            chatInput.addEventListener('input', resetLogHideTimer);
            chatInput.addEventListener('blur', () => {
                const el = document.getElementById('event-log-container');
                if (el) el.classList.remove('user-focused');
                resetLogHideTimer();
            });
        }

        setTimeout(() => {
            updateViewportReadout();
            if (window.clampPiPIntoViewport) window.clampPiPIntoViewport();
            if (window.syncRect) window.syncRect();
            if (window.innerWidth >= 1024) {
                const az = document.getElementById('action-zone');
                if (az && !az.classList.contains('outer-active')) az.classList.add('outer-active');
            }
        }, 100); // Initial call after DOM paints [REF#UI-00516 → see REF#PN-01790]
        updateViewportReadout();

/* ==================== EXTRACTED SCRIPT BLOCK ==================== [REF#UI-00517 → see REF#UI-00205] */

(function() {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        
        // Only run PiP in Dock mode (the bottom full-screen iframe) [REF#UI-00518 → see REF#PN-01859]
        if (mode !== 'dock') return;

        const pip = document.getElementById("moondial-wrapper");
        if (!pip) return;
        pip.style.display = 'block';

        // Clear stale pip position saves from before DOM refactor (one-time migration) [REF#UI-00519 → see REF#PN-01860]
        if (!localStorage.getItem('origami_pip_v3')) {
            localStorage.removeItem('origami_pip_state');
            localStorage.setItem('origami_pip_v3', '1');
        }

        const MIN_W = 200, MIN_H = 200;
        let isPiPDragging = false, mapRotating = false, mapPanning = false;
        let dragStart = { x: 0, y: 0, left: 0, top: 0 };
        let rotStart = { x: 0, y: 0 };
        let panStart = { x: 0, y: 0 };

        // Post to master router [REF#UI-00520 → see REF#PN-01861]
        function post(msg) { window.parent.postMessage(msg, '*'); }

        // Debounced syncRect — only send when something actually changed. [REF#UI-00521 → see REF#PN-01862]
        // No polling interval: ResizeObserver + explicit drag/resize events drive this.
        let _syncRectPending = false;
        let _lastRect = null;
        function syncRect() {
            if (_syncRectPending) return;
            _syncRectPending = true;
            requestAnimationFrame(() => {
                _syncRectPending = false;
                const wrapper = document.getElementById('pipCanvas');
                if (!wrapper) return;
                const r = wrapper.getBoundingClientRect();
                // Skip if nothing moved (avoids redundant postMessage+style mutations) [REF#UI-00522 → see REF#PN-01863]
                if (_lastRect &&
                    r.width === _lastRect.width && r.height === _lastRect.height &&
                    r.left  === _lastRect.left  && r.top    === _lastRect.top) return;
                _lastRect = { width: r.width, height: r.height, left: r.left, top: r.top, bottom: r.bottom };
                post({ type: 'PIP_SYNC_RECT', ..._lastRect });
            });
        }
        window.syncRect = syncRect;

        // Prevent context menu [REF#UI-00523 → see REF#PN-01864]
        pip.addEventListener("contextmenu", e => { 
            if (e.target.closest("#pipCanvas") || e.target === pip) e.preventDefault(); 
        });
        
        // Zoom via scroll wheel [REF#UI-00524 → see REF#PN-01865]
        pip.addEventListener("wheel", (e) => {
            if (e.target.closest("#pipCanvas")) {
                e.preventDefault();
                post({ type: 'PIP_ZOOM', delta: Math.sign(e.deltaY) });
            }
        }, { passive: false });

        // Click-to-swap-modes REMOVED per user request. Use the MAP action [REF#UI-00525 → see REF#PN-01866]
        // button or the 'M' key to toggle between FPV and top-down.

        // Hide edit mode when clicking outside [REF#UI-00526 → see REF#PN-01867]
        document.addEventListener("mousedown", (e) => {
            if (!pip.contains(e.target) && pip.classList.contains('edit-mode')) {
                pip.classList.remove('edit-mode');
            }
        });

        // Double-click to toggle edit mode (maintenance setting mode) [REF#UI-00527 → see REF#PN-01868]
        pip.addEventListener("dblclick", (e) => {
             e.stopPropagation();
             if (e.target.closest("#pipCanvas") || e.target === pip) {
                 pip.classList.toggle('edit-mode');
             }
        });
        
        let isPiPResizing = false;
        let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

        pip.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            
            if (e.button === 2) { 
                 e.preventDefault();
                 mapRotating = true; rotStart.x = e.clientX; rotStart.y = e.clientY;
                 document.addEventListener("mousemove", onRotMove);
                 document.addEventListener("mouseup", onRotEnd, { once: true });
                 document.addEventListener("mouseleave", onRotEnd, { once: true });
                 window.addEventListener("blur", onRotEnd, { once: true });
                 return;
            }
            
            // Custom Resize Handle [REF#UI-00528]
            if (e.target.closest('.pip-resize-handle') && e.button === 0) {
                e.preventDefault();
                const rect = pip.getBoundingClientRect();
                isPiPResizing = true;
                pip.style.transition = "none";
                resizeStart.x = e.clientX;
                resizeStart.y = e.clientY;
                resizeStart.w = rect.width;
                resizeStart.h = rect.height;
                document.addEventListener("mousemove", onResizeMove);
                document.addEventListener("mouseup", onResizeEnd, { once: true });
                document.addEventListener("mouseleave", onResizeEnd, { once: true });
                window.addEventListener("blur", onResizeEnd, { once: true });
                return;
            }
            
            // Custom Drag Handle [REF#UI-00529]
            if (e.target.closest('.pip-drag-handle') && e.button === 0) {
                e.preventDefault();
                const rect = pip.getBoundingClientRect();
                isPiPDragging = true;
                pip.style.willChange = "left, top";
                pip.style.transition = "none";
                pip.classList.add("dragging");
                dragStart.x = e.clientX; 
                dragStart.y = e.clientY;
                dragStart.left = rect.left;
                dragStart.top = rect.top;
                document.addEventListener("mousemove", onDragMove);
                document.addEventListener("mouseup", onDragEnd, { once: true });
                document.addEventListener("mouseleave", onDragEnd, { once: true });
                window.addEventListener("blur", onDragEnd, { once: true });
                return;
            }

            if (e.target.closest("#pipCanvas")) {
                if (e.button === 0 || e.button === 1) { 
                     e.preventDefault();
                     mapPanning = true; panStart.x = e.clientX; panStart.y = e.clientY;
                     document.addEventListener("mousemove", onPanMove);
                     document.addEventListener("mouseup", onPanEnd, { once: true });
                     document.addEventListener("mouseleave", onPanEnd, { once: true });
                     window.addEventListener("blur", onPanEnd, { once: true });
                     return;
                }
            }
        });
        
        function savePiPState() {
            if (!pip) return;
            const state = {
                left: pip.style.left,
                right: pip.style.right,
                top: pip.style.top,
                bottom: pip.style.bottom,
                width: pip.style.width,
                height: pip.style.height
            };
            localStorage.setItem('origami_pip_state', JSON.stringify(state));
        }

        function loadPiPState() {
            if (!pip) return;
            try {
                const saved = localStorage.getItem('origami_pip_state');
                if (saved) {
                    const state = JSON.parse(saved);
                    const vw = window.innerWidth, vh = window.innerHeight;
                    const pipW = parseInt(state.width) || 250;
                    const pipH = parseInt(state.height) || 250;
                    const savedLeft = parseInt(state.left);
                    const savedTop = parseInt(state.top);
                    // Clamp: if saved position would push pip off-screen, reset to flush top-left [REF#UI-00530]
                    const maxTop = vh * 0.5; // Keep PIP in top half — away from the bottom action dock [REF#UI-00531]
                    const safeLeft = (!isNaN(savedLeft) && savedLeft >= 0 && savedLeft + pipW <= vw) ? savedLeft : 20;
                    const safeTop = (!isNaN(savedTop) && savedTop >= 0 && savedTop <= maxTop) ? savedTop : 20;
                    pip.style.left = safeLeft + 'px';
                    pip.style.top = safeTop + 'px';
                    pip.style.right = 'auto';
                    pip.style.bottom = 'auto';
                    if (state.width) pip.style.width = state.width;
                    if (state.height) pip.style.height = state.height;
                } else {
                    pip.style.left = '20px';
                    pip.style.top = '20px';
                }
            } catch (e) { console.error('Failed to load PiP state', e); }
            syncRect(); // single debounced call after state apply [REF#UI-00532]
        }
        
        window.loadPiPState = loadPiPState;

        const onResizeMove = (e) => {
            if (!isPiPResizing) return;
            const dx = e.clientX - resizeStart.x;
            const dy = e.clientY - resizeStart.y;
            let newW = Math.max(MIN_W, resizeStart.w + dx);
            let newH = Math.max(MIN_H, resizeStart.h + dy);
            pip.style.width = newW + "px";
            pip.style.height = newH + "px";
            syncRect();
        };

        const onResizeEnd = (e) => {
            if (!isPiPResizing) return;
            isPiPResizing = false;
            pip.style.transition = "var(--tr-fast)";
            document.removeEventListener("mousemove", onResizeMove);
            // mouseleave removed (premature end on cursor flicker) [REF#UI-00533]
            window.removeEventListener("blur", onResizeEnd);
            clampPiPIntoViewport(true);
            savePiPState();
        };

        function clampPiPIntoViewport(evaluateAnchors = false) {
            const rect = pip.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            
            let isAnchorRight = pip.style.right && pip.style.right !== 'auto';
            let isAnchorBottom = pip.style.bottom && pip.style.bottom !== 'auto';
            
            if (rect.right < 0 || rect.bottom < 0 || rect.left > vw || rect.top > vh) {
                // Completely off-screen, reset to default safe position [REF#UI-00534]
                pip.style.left = "20px";
                pip.style.top = "20px";
                pip.style.right = "auto";
                pip.style.bottom = "auto";
                syncRect();
                return;
            }
            
            if (evaluateAnchors) {
                isAnchorRight = (rect.left + rect.width / 2) > (vw / 2);
                isAnchorBottom = (rect.top + rect.height / 2) > (vh / 2);
            }
            
            let bottomDockHeight = window.innerWidth > 768 ? 230 : 0;
            let safeLeft = Math.max(25, Math.min(vw - rect.width - 25, rect.left));
            let safeTop = Math.max(25, Math.min(vh - rect.height - bottomDockHeight - 20, rect.top));
            let safeRight = vw - (safeLeft + rect.width);
            let safeBottom = vh - (safeTop + rect.height);
            
            // Always anchor to left/top — switching to right/bottom causes the snap-to-center jerk [REF#UI-00535]
            pip.style.left = safeLeft + "px";
            pip.style.right = "auto";
            pip.style.top = safeTop + "px";
            pip.style.bottom = "auto";
            
            syncRect();
        }

        const onDragMove = (e) => {
            if (!isPiPDragging) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                pip.setAttribute('data-was-dragged', 'true');
            }
            pip.style.left = (dragStart.left + dx) + "px";
            pip.style.top = (dragStart.top + dy) + "px";
            pip.style.right = "auto";
            pip.style.bottom = "auto";
            syncRect();
        };

        const onDragEnd = (e) => {
            if (!isPiPDragging) return;
            isPiPDragging = false;
            pip.style.willChange = "auto";
            pip.classList.remove("dragging");
            document.removeEventListener("mousemove", onDragMove);
            clampPiPIntoViewport(true);
            savePiPState();
        };
        
        const onRotMove = (e) => {
            if (!mapRotating) return;
            const dx = e.clientX - rotStart.x; const dy = e.clientY - rotStart.y;
            rotStart.x = e.clientX; rotStart.y = e.clientY;
            post({ type: 'PIP_ROTATE', dx, dy });
        };
        const onRotEnd = () => { mapRotating = false; document.removeEventListener("mousemove", onRotMove); document.removeEventListener("mouseleave", onRotEnd); window.removeEventListener("blur", onRotEnd); };
        
        const onPanMove = (e) => {
            if (!mapPanning) return;
            const dx = e.clientX - panStart.x; const dy = e.clientY - panStart.y;
            panStart.x = e.clientX; panStart.y = e.clientY;
            post({ type: 'PIP_PAN', dx, dy });
        };
        
        const onPanEnd = (e) => {
            mapPanning = false;
            document.removeEventListener("mousemove", onPanMove);
            // mouseleave removed — was prematurely ending pans on cursor flicker [REF#UI-00536 → see REF#PN-01876]
            window.removeEventListener("blur", onPanEnd);
            // PIP_CLICK removed — engine has no handler and click-to-view was [REF#UI-00537 → see REF#PN-01877]
            // disabled by user request. A non-drag click on the PIP is now a
            // no-op (pan-end with no movement).
        };


        // Perspective preset buttons [REF#UI-00538 → see REF#PN-01878]
        pip.querySelectorAll('.pip-persp-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const preset = btn.dataset.preset;
                pip.querySelectorAll('.pip-persp-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Show floor zoom controls only for top-down (flat) preset [REF#UI-00539 → see REF#PN-01879]
                if (preset === 'flat') document.body.classList.add('topdown-mode');
                else document.body.classList.remove('topdown-mode');
                // Pop animation [REF#UI-00540 → see REF#PN-01880]
                btn.style.transform = 'scale(1.25)';
                setTimeout(() => { btn.style.transform = ''; }, 180);
                post({ type: 'PIP_PERSPECTIVE', preset });
            });
        });

        // Wire floor-zoom buttons (top centre) to PIP_ZOOM messages [REF#UI-00541]
        const fzIn  = document.getElementById('floor-zoom-left');
        const fzOut = document.getElementById('floor-zoom-right');
        if (fzIn)  fzIn.addEventListener('click',  (e)=>{ e.stopPropagation(); window.parent.postMessage({ type: 'PIP_ZOOM', delta: -1 }, '*'); });
        if (fzOut) fzOut.addEventListener('click', (e)=>{ e.stopPropagation(); window.parent.postMessage({ type: 'PIP_ZOOM', delta:  1 }, '*'); });

        // Initialize floor-zoom visibility based on current active preset (if any) [REF#UI-00542 → see REF#PN-01885]
        const flatBtn = pip.querySelector('.pip-persp-btn[data-preset="flat"]');
        if (flatBtn && flatBtn.classList.contains('active')) document.body.classList.add('topdown-mode');

        // Initialize [REF#UI-00543]
        loadPiPState();
        // Give layout a tick before measuring rect [REF#UI-00544 → see REF#PN-01887]
        setTimeout(syncRect, 100);
        
        // Use ResizeObserver for perfect sync during ANY layout shifts, flex reflows, or browser resizes [REF#UI-00545 → see REF#PN-01888]
        const ro = new ResizeObserver(() => {
            syncRect();
        });
        if (pip) ro.observe(pip);
        
    })();
    
    window.rollDiceAnimation = function(betIsEven, amount) {
        const logContainer = document.getElementById('event-log-container');
        if (!logContainer.classList.contains('show')) {
            window.emitAction('LOG'); // toggle it open if closed [REF#UI-00546 → see REF#PN-01889]
        }
        
        const rect = logContainer.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.zIndex = '9999';
        overlay.style.pointerEvents = 'none';
        document.body.appendChild(overlay);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(rect.width, rect.height);
        overlay.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
        camera.position.z = 12;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(5, 10, 7);
        scene.add(dirLight);

        // Create 2 dice [REF#UI-00547 → see REF#PN-01890]
        const diceGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const diceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
        const die1 = new THREE.Mesh(diceGeo, diceMat);
        const die2 = new THREE.Mesh(diceGeo, diceMat);
        
        // Add green/red dots just like the main UI dice to make them look nice [REF#UI-00548 → see REF#PN-01891]
        const dotMat = new THREE.MeshStandardMaterial({color: 0x111111});
        const dotGeo = new THREE.CircleGeometry(0.15, 16);
        const addDot = (mesh, x, y, z, rx, ry) => {
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(x,y,z);
            dot.rotation.set(rx,ry,0);
            mesh.add(dot);
        };
        // Just add one dot on each face for aesthetics [REF#UI-00549 → see REF#PN-01892]
        addDot(die1, 0, 0, 0.61, 0, 0); addDot(die1, 0, 0, -0.61, 0, Math.PI);
        addDot(die1, 0.61, 0, 0, 0, Math.PI/2); addDot(die1, -0.61, 0, 0, 0, -Math.PI/2);
        addDot(die1, 0, 0.61, 0, -Math.PI/2, 0); addDot(die1, 0, -0.61, 0, Math.PI/2, 0);
        
        addDot(die2, 0, 0, 0.61, 0, 0); addDot(die2, 0, 0, -0.61, 0, Math.PI);
        addDot(die2, 0.61, 0, 0, 0, Math.PI/2); addDot(die2, -0.61, 0, 0, 0, -Math.PI/2);
        addDot(die2, 0, 0.61, 0, -Math.PI/2, 0); addDot(die2, 0, -0.61, 0, Math.PI/2, 0);

        scene.add(die1, die2);

        let startTime = performance.now();
        let duration = 1800; // 1.8 seconds bounce [REF#UI-00550 → see REF#PN-01893]
        
        let d1 = { x: -2.0, y: 6, z: 0, vx: 0.04, vy: 0, vz: 0, rx: Math.random()*0.3, ry: Math.random()*0.3 };
        let d2 = { x: 2.0,  y: 6, z: 0, vx: -0.04, vy: 0, vz: 0, rx: Math.random()*0.3, ry: Math.random()*0.3 };
        
        function animate(t) {
            let elapsed = t - startTime;
            if (elapsed > duration) {
                document.body.removeChild(overlay);
                
                let roll1 = Math.floor(Math.random() * 6) + 1;
                let roll2 = Math.floor(Math.random() * 6) + 1;
                let sum = roll1 + roll2;
                let isEven = sum % 2 === 0;
                let win = (isEven === betIsEven);
                
                window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `Rolled ${roll1} and ${roll2} (Total: ${sum})` }, '*');
                window.parent.postMessage({ type: 'WAGER_RESOLVE', win: win, amount: amount }, '*');
                return;
            }
            
            requestAnimationFrame(animate);
            
            d1.vy -= 0.015; d2.vy -= 0.015;
            d1.y += d1.vy; d2.y += d2.vy;
            d1.x += d1.vx; d2.x += d2.vx;
            
            if (d1.y < -3) { d1.y = -3; d1.vy *= -0.7; }
            if (d2.y < -3) { d2.y = -3; d2.vy *= -0.7; }
            
            die1.position.set(d1.x, d1.y, d1.z);
            die2.position.set(d2.x, d2.y, d2.z);
            
            die1.rotation.x += d1.rx; die1.rotation.y += d1.ry;
            die2.rotation.x += d2.rx; die2.rotation.y += d2.ry;
            
            if (elapsed > duration - 600) {
                d1.rx *= 0.92; d1.ry *= 0.92;
                d2.rx *= 0.92; d2.ry *= 0.92;
            }
            
            renderer.render(scene, camera);
        }
        requestAnimationFrame(animate);
    };

    // ── i18n Runtime ───────────────────────────────────────────────────────── [REF#UI-00551 → see REF#PN-01908]
    // Applies the current locale to all data-i18n elements and live cards.
    // Zero impact on engine/rendering — purely DOM text replacement.

    window.currentLang = localStorage.getItem('origami_lang') || 'en';

    function applyLocale(lang) {
        window.currentLang = lang;
        document.documentElement.lang = lang;
        document.body.classList.toggle('lang-ja', lang === 'ja');
        localStorage.setItem('origami_lang', lang);
        // Broadcast to the engine iframe so monster names + log helpers [REF#UI-00552 → see REF#PN-01910]
        // see the new language immediately (Engine iframe doesn't share
        // window.currentLang with Panels).
        try { window.parent.postMessage({ type: 'LOCALE_CHANGE', lang }, '*'); } catch (e) {}

        // 1. Static UI strings via [data-i18n] [REF#UI-00553 → see REF#PN-01912]
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const val = window.t && window.t(key, lang);
            if (val && val !== key) el.textContent = val;
        });

        // 2. Placeholder strings via [data-i18n-placeholder] [REF#UI-00554 → see REF#PN-01913]
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            const val = window.t && window.t(key, lang);
            if (val && val !== key) el.placeholder = val;
        });

        // 3. Live cards in the deck — re-translate title/desc/attr in place [REF#UI-00555 → see REF#PN-01918]
        document.querySelectorAll('.guide-card[data-card-id]').forEach(card => {
            const loc = window.tCard && window.tCard(card.dataset.cardId, lang);
            if (!loc) return;
            const titleEl = card.querySelector('.card-title');
            const descEl  = card.querySelector('.card-desc');
            const attrEl  = card.querySelector('.card-attr-fused');
            if (titleEl) titleEl.textContent = loc.name;
            if (descEl)  descEl.textContent  = loc.desc;
            if (attrEl)  attrEl.textContent  = loc.attr;
        });

        // 4. Update flag button to show NEXT language [REF#UI-00556]
        const flagEl = document.getElementById('lang-flag');
        if (flagEl) flagEl.textContent = lang === 'en' ? '🇯🇵' : '🇺🇸';

        // 5. Keep SLASH highlight search working across locales [REF#UI-00557 → see REF#PN-01920]
        window._slashCardName = window.t('slash-display', lang) || 'SLASH';
    }

    window.switchLanguage = function() {
        const next = window.currentLang === 'en' ? 'ja' : 'en';
        const flagEl = document.getElementById('lang-flag');

        // Animate flag flip out → apply locale → flip back in [REF#UI-00558 → see REF#PN-01921]
        if (flagEl) {
            flagEl.classList.add('flip');
            setTimeout(() => {
                applyLocale(next);
                flagEl.classList.remove('flip');
            }, 250);
        } else {
            applyLocale(next);
        }

        // Log change [REF#UI-00559]
        const msg = next === 'ja' ? '🇯🇵 日本語モードに切り替えました。' : '🇺🇸 Switched to English.';
        if (typeof window.logEvent === 'function') window.logEvent(msg, 'system');
    };

    // Apply on load (restores from localStorage or defaults to EN) [REF#UI-00560 → see REF#PN-01923]
    applyLocale(window.currentLang);

    // ── T0.25 — Defeat flow: blink overlay + defeat modal + high-score table ── [REF#UI-00561 → see REF#PN-01924]
    (function setupDefeatFlow(){
        const HISCORE_KEY = 'origami.v8.scores';

        // Build the overlay + modal DOM once (hidden by default). [REF#UI-00562 → see REF#PN-01925]
        const blink = document.createElement('div');
        blink.id = 'defeat-blink-overlay';
        blink.style.cssText =
            'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;' +
            'z-index:99000;transition:opacity 0.45s ease-in-out;';
        document.body.appendChild(blink);

        const modal = document.createElement('div');
        modal.id = 'defeat-modal';
        modal.style.cssText =
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.94);' +
            'width:min(440px,92vw);background:linear-gradient(180deg,#1a0606 0%,#0a0202 100%);' +
            'border:2px solid #8a0000;border-radius:18px;padding:28px 30px;color:#fff;' +
            'box-shadow:0 30px 80px rgba(140,0,0,0.55), 0 0 0 1px rgba(255,80,80,0.15);' +
            'font-family:Inter,sans-serif;z-index:99100;opacity:0;pointer-events:none;' +
            'transition:opacity 0.4s ease, transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275);';
        modal.innerHTML =
            '<div style="text-align:center;font-family:Orbitron,sans-serif;font-size:32px;font-weight:900;' +
                  'color:#ff5252;letter-spacing:4px;text-shadow:0 0 20px rgba(255,82,82,0.5);margin-bottom:6px;">DEFEATED</div>' +
            '<div style="text-align:center;font-size:18px;color:#a8a8a8;font-style:italic;margin-bottom:18px;">死</div>' +
            '<div id="defeat-summary" style="font-size:15px;line-height:1.7;color:#e6edf3;text-align:center;margin-bottom:14px;"></div>' +
            '<div style="border-top:1px solid rgba(255,80,80,0.2);padding-top:14px;">' +
              '<div style="font-family:Orbitron,sans-serif;font-size:11px;color:#ff8080;letter-spacing:2px;text-align:center;margin-bottom:8px;">HIGH SCORES</div>' +
              '<table id="defeat-hiscore" style="width:100%;font-size:13px;color:#d0d0d0;border-collapse:collapse;"></table>' +
            '</div>' +
            '<button id="defeat-restart" style="margin-top:18px;width:100%;padding:12px;font-family:Orbitron,sans-serif;' +
                    'font-size:13px;letter-spacing:2px;color:#fff;background:linear-gradient(180deg,#8a0000,#3a0000);' +
                    'border:1px solid #c00000;border-radius:8px;cursor:pointer;font-weight:700;">PLAY AGAIN</button>';
        document.body.appendChild(modal);

        modal.querySelector('#defeat-restart').onclick = () => {
            sessionStorage.removeItem('origami.v8.seed');
            sessionStorage.removeItem('origami.v8.descent');
            window.parent.location.reload();
        };

        function loadScores(){
            try { return JSON.parse(localStorage.getItem(HISCORE_KEY) || '[]'); }
            catch(_){ return []; }
        }
        function saveScore(entry){
            const list = loadScores();
            list.push(entry);
            list.sort((a, b) => (b.xp || 0) - (a.xp || 0));
            const trimmed = list.slice(0, 10);
            try { localStorage.setItem(HISCORE_KEY, JSON.stringify(trimmed)); } catch(_){}
            return trimmed;
        }
        function renderScoreTable(scores, currentEntry){
            const tbl = document.getElementById('defeat-hiscore');
            if (!tbl) return;
            const head = '<tr style="color:#888;font-size:10px;letter-spacing:1px;">' +
                          '<th style="text-align:left;padding:3px 4px;">RANK</th>' +
                          '<th style="text-align:center;padding:3px 4px;">FLR</th>' +
                          '<th style="text-align:center;padding:3px 4px;">LVL</th>' +
                          '<th style="text-align:center;padding:3px 4px;">KILLS</th>' +
                          '<th style="text-align:right;padding:3px 4px;">XP</th></tr>';
            const rows = scores.slice(0, 5).map((s, i) => {
                const isCurrent = currentEntry && s.t === currentEntry.t;
                const style = isCurrent ? 'color:#ffe066;font-weight:700;text-shadow:0 0 8px rgba(255,224,102,0.4);' : '';
                return `<tr style="${style}">` +
                       `<td style="padding:3px 4px;">#${i+1}</td>` +
                       `<td style="text-align:center;padding:3px 4px;">${s.dungeonLevel || 1}</td>` +
                       `<td style="text-align:center;padding:3px 4px;">${s.playerLevel || 1}</td>` +
                       `<td style="text-align:center;padding:3px 4px;">${s.kills || 0}</td>` +
                       `<td style="text-align:right;padding:3px 4px;">${s.xp || 0}</td></tr>`;
            }).join('');
            tbl.innerHTML = head + rows;
        }

        window._routeToPanelsDefeat = (ev) => {
            if (!ev || ev.type !== 'DEFEAT_BLINK') return;
            const d = ev;
            // Persist this run to the high-score table. Score = XP (so the [REF#UI-00563 → see REF#PN-01931]
            // sort matches the column the player reads first).
            const entry = {
                t: Date.now(),
                dungeonLevel: d.dungeonLevel || 1,
                playerLevel: d.playerLevel || 1,
                xp: d.xp || 0,
                gold: d.gold || 0,
                kills: d.kills || 0,
            };
            const scores = saveScore(entry);

            // Blink animation — dark → brief eye open → dark again → modal [REF#UI-00564 → see REF#PN-01932]
            blink.style.opacity = '1';
            setTimeout(() => { blink.style.opacity = '0.0'; }, 450);   // eye opens [REF#UI-00565]
            setTimeout(() => { blink.style.opacity = '1'; }, 950);     // closes again [REF#UI-00566 → see REF#PN-01934]
            setTimeout(() => {
                blink.style.opacity = '0.85'; // semi-dark backdrop for modal [REF#UI-00567 → see REF#PN-01935]
                const _killer = (d.killerName || 'Unknown').replace(/</g,'&lt;');
                const _killAmt = d.killerDamage || 0;
                document.getElementById('defeat-summary').innerHTML =
                    `You were defeated on <b style="color:#ff8080;">Floor ${entry.dungeonLevel}</b>.<br>` +
                    `Slain by <b style="color:#ff8080;">${_killer}</b>` +
                    (_killAmt ? ` for <b style="color:#ff5050;">${_killAmt}</b> damage` : '') + '.<br>' +
                    `Player <b style="color:#80ffd0;">Lvl ${entry.playerLevel}</b> · ` +
                    `<b style="color:#ffe066;">${entry.xp}</b> XP · ` +
                    `<b style="color:#ffd060;">${entry.gold}</b> gold · ` +
                    `<b style="color:#ff9090;">${entry.kills}</b> kills`;
                renderScoreTable(scores, entry);
                modal.style.opacity = '1';
                modal.style.transform = 'translate(-50%,-50%) scale(1)';
                modal.style.pointerEvents = 'auto';
            }, 1600);
        };
    })();

    // Unified synchronous panels event router [REF#UI-00568]
    window.routeToPanels = function(ev) {
        if (window._routeToPanelsMain) window._routeToPanelsMain(ev);
        if (window._routeToPanelsDefeat) window._routeToPanelsDefeat(ev);
    };
