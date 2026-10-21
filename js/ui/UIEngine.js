
import { EventBus } from '../engine/EventBus.js';

export class UIEngine {
    constructor() {
        this.initialized = false;
    }
    init() {
        this.setupLegacyLogic();
    }
    setupLegacyLogic() {
        /*
        Paste the legacy logic here. We will refactor it.
        */
        
                    document.addEventListener('DOMContentLoaded', () => {
                        const pipCanvas = document.getElementById('pipCanvas');
                        if (pipCanvas) {
                            pipCanvas.addEventListener('click', () => {
                                window.postMessage({ type: 'PIP_TOGGLE' }, '*');
                            });
                            pipCanvas.addEventListener('wheel', (e) => {
                                e.preventDefault();
                                window.postMessage({ type: 'PIP_ZOOM', delta: Math.sign(e.deltaY) }, '*');
                            }, { passive: false });
                        }
        
                        // Moonphase calculation based on current Date
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
                        
                        const phase = getMoonPhase(); // 0 to 7
                        const phaseNames = ['NEW MOON PHASE', 'WAXING CRESCENT MOON PHASE', 'FIRST QUARTER MOON PHASE', 'WAXING GIBBOUS MOON PHASE', 'FULL MOON PHASE', 'WANING GIBBOUS MOON PHASE', 'LAST QUARTER MOON PHASE', 'WANING CRESCENT MOON PHASE'];
                        window.postMessage({ type: 'MOON_PHASE', phase: phaseNames[phase] }, '*');
        
                        const ring = document.querySelector('.season-outer-ring');
                        if (ring) {
                            const rotation = -(phase * 45);
                            ring.style.transform = `rotate(${rotation}deg)`;
                        }
                    });
                
        
        

                
                window.THREE = THREE;
                if (typeof window.init3DIcons === 'function') window.init3DIcons();
        
                // Fix for missing toggleRing action buttons
                window.toggleRing = function() {
                    const az = document.getElementById('action-zone');
                    if(az) az.classList.toggle('outer-active');
                };
        
                window.openInventory = function() {
                    const modal = document.getElementById('inventory-modal');
                    if(modal) {
                        modal.classList.add('active');
                        window.renderInventory();
                    }
                };
        
                window.closeInventory = function() {
                    const modal = document.getElementById('inventory-modal');
                    if(modal) modal.classList.remove('active');
                };
        
                window.renderInventory = function() {
                    const content = document.getElementById('inv-content');
                    if(!content) return;
                    content.innerHTML = '';
                    
                    // Re-use logic from deck building to render cards statically
                    // Group by Nethack Rules: Weapons, Armor, Spells, Items
                    
                    const nethackGroups = {
                        'Weapons': [],
                        'Armor': [],
                        'Spells': [],
                        'Items': []
                    };
        
                    // Analyze player's collected cards (window.cardInventoryCounts)
                    const inventory = window.cardInventoryCounts || {};
                    
                    // Map known categories to Nethack types
                    const weaponTypes = ['KATANA', 'MISSILE', 'SLASH', 'THRUST'];
                    const armorTypes = ['SHIELD', 'ARMOR'];
                    const spellTypes = ['FIRE', 'WATER', 'EARTH', 'WIND', 'SPELL'];
                    const itemTypes = ['ITEM', 'HEAL POTION', 'WAND'];
        
                    // We need a helper to find the card info from default/combat categories
                    const allDefs = [...defaultCategories, ...combatCategories];
                    const getCardDef = (cardName) => {
                        for (let cat of allDefs) {
                            if (cat.cards && cat.cards.includes(cardName)) return cat;
                        }
                        return { id: 'MISC', kanji: '？', desc: 'Unknown', attr: 'N/A' };
                    };
        
                    for (let [cardName, count] of Object.entries(inventory)) {
                        const def = getCardDef(cardName);
                        
                        let targetGroup = 'Items';
                        if (weaponTypes.includes(def.id) || weaponTypes.includes(cardName)) targetGroup = 'Weapons';
                        else if (armorTypes.includes(def.id) || armorTypes.includes(cardName)) targetGroup = 'Armor';
                        else if (spellTypes.includes(def.id) || spellTypes.includes(cardName)) targetGroup = 'Spells';
        
                        nethackGroups[targetGroup].push({ cardName, count, def });
                    }
        
                    // Create HTML structures
                    for (let [groupName, cards] of Object.entries(nethackGroups)) {
                        if (cards.length === 0) continue;
                        
                        const section = document.createElement('div');
                        section.className = 'inv-category';
                        section.innerHTML = `<div class="inv-category-title">${groupName}</div><div class="inv-grid"></div>`;
                        const grid = section.querySelector('.inv-grid');
                        
                        cards.forEach(c => {
                            // Create the static card element based on createCardElement logic
                            const cardEl = document.createElement('div');
                            cardEl.className = 'guide-card playing-card';
                            cardEl.style.cssText = 'position:relative; filter:none; opacity:1; transform:none; margin:0;';
                            cardEl.setAttribute('draggable', 'true');
                            
                            const badgeHtml = c.count > 1 ? `<div class="card-badge">${c.count}</div>` : '';
                            let themeClr = '#66BB6A';
                            let textClr = '#ffffff';
                            if (c.def.id === 'SPELL' || c.def.id === 'WIND') themeClr = '#90a4ae';
                            else if (c.def.id === 'EARTH') themeClr = '#00bcd4';
                            else if (c.def.id === 'WATER') themeClr = '#0d6efd';
                            else if (c.def.id === 'FIRE') themeClr = '#f44336';
                            else if (['MISSILE', 'WEAPON', 'KATANA', 'SLASH', 'THRUST', 'ARMOR', 'SHIELD', 'DEFEND'].includes(c.def.id)) {
                                themeClr = '#ffffff';
                                textClr = '#000000';
                            } else themeClr = '#e91e63'; 
                            cardEl.style.setProperty('--pill-text', textClr);
                            cardEl.style.setProperty('--theme-clr', themeClr);
        
                            cardEl.innerHTML = `
                                <div class="equip-badge">E</div>
                                ${badgeHtml}
                                <div class="card-header">
                                    <div class="card-kanji" style="color: ${themeClr}">${c.def.kanji}</div>
                                    <span class="card-type-pill" style="background: ${themeClr}">${c.def.id}</span>
                                </div>
                                <div class="card-title">${c.cardName}</div>
                                <div class="card-desc">${c.def.desc}</div>
                                <div class="card-icon-3d"><div class="canvas-mount"></div></div>
                                <div class="card-attr">${c.def.attr}</div>
                            `;
                            
                            // Click to equip
                            cardEl.addEventListener('click', () => {
                                cardEl.classList.toggle('equipped-card');
                            });
        
                            // Drag and Drop functionality
                            cardEl.addEventListener('dragstart', (e) => {
                                cardEl.classList.add('dragging');
                                e.dataTransfer.effectAllowed = 'move';
                                // Need a slight delay to allow the drag image to form before we modify the DOM element
                                setTimeout(() => cardEl.style.opacity = '0.4', 0);
                            });
                            cardEl.addEventListener('dragend', () => {
                                cardEl.classList.remove('dragging');
                                cardEl.style.opacity = '';
                            });
                            cardEl.addEventListener('dragover', (e) => {
                                e.preventDefault(); // Necessary to allow dropping
                                cardEl.classList.add('drag-over');
                            });
                            cardEl.addEventListener('dragleave', () => {
                                cardEl.classList.remove('drag-over');
                            });
                            cardEl.addEventListener('drop', (e) => {
                                e.preventDefault();
                                cardEl.classList.remove('drag-over');
                                const draggingEl = grid.querySelector('.dragging');
                                if (draggingEl && draggingEl !== cardEl) {
                                    const rect = cardEl.getBoundingClientRect();
                                    const midX = rect.left + rect.width / 2;
                                    if (e.clientX < midX) {
                                        grid.insertBefore(draggingEl, cardEl);
                                    } else {
                                        grid.insertBefore(draggingEl, cardEl.nextSibling);
                                    }
                                }
                            });
        
                            // We can reuse the 3D icons by spawning them in the canvas-mount
                            grid.appendChild(cardEl);
                            
                            // Delay icon generation slightly to let DOM mount
                            setTimeout(() => {
                                const mount = cardEl.querySelector('.canvas-mount');
                                if (mount && scenes[c.def.id]) {
                                    const cvs = document.createElement('canvas');
                                    mount.appendChild(cvs);
                                    const ctx = cvs.getContext('2d');
                                    cvs.width = 180; cvs.height = 180;
                                    cvs.style.width = "45px"; cvs.style.height = "45px";
                                    cvs.style.position = 'absolute'; cvs.style.top = '0'; cvs.style.left = '0';
                                    
                                    // Render static frame
                                    const cached = scenes[c.def.id];
                                    avatarRenderer.setRenderTarget(cached.rt);
                                    avatarRenderer.render(cached.scene, avatarCamera);
                                    ctx.drawImage(avatarRenderer.domElement, 0, 0, 180, 180);
                                    avatarRenderer.setRenderTarget(null);
                                }
                            }, 50);
                        });
                        
                        content.appendChild(section);
                    }
                    
                    if(content.innerHTML === '') {
                        content.innerHTML = '<div style="color:#666; font-style:italic;">Your inventory is empty.</div>';
                    }
                };
        
                const defaultCategories = [
                    { id: 'EARTH', kanji: '地', icon: 'fa-mountain', desc: 'Spell Scroll', attr: '(STUN * 2DICE)', cards: ['BOULDER', 'FISSURE'] },
                    { id: 'WIND', kanji: '風', icon: 'fa-wind', desc: 'Spell Scroll', attr: '(PUSH * 3DICE)', cards: ['GALE'] },
                    { id: 'FIRE', kanji: '火', icon: 'fa-fire', desc: 'Magic Wand', attr: '(DMG * 4DICE)', cards: ['FIREBALL', 'PYROBLAST', 'COMET'] },
                    { id: 'WATER', kanji: '水', icon: 'fa-water', desc: 'Spell Scroll', attr: '(SLOW * 3DICE)', cards: ['TIDE', 'SURGE'] },
                    { id: 'MISSILE', kanji: '投', icon: 'fa-star', desc: 'Thrown Weapon', attr: '(DMG * 1DICE)', cards: ['SHURIKEN'], qty: 3 },
                    { id: 'ITEM', kanji: '具', icon: 'fa-scroll', desc: 'Consumable', attr: '(HEAL HP * 1DICE)', cards: ['HEAL POTION', 'IDENTITY SCROLL'] }
                ];
        
                const combatCategories = [
                  {
                    id: "KATANA",
                    kanji: "斬",
                    icon: "fa-fire",
                    desc: "Melee Weapon",
                    attr: "(DMG * 1DICE)",
                    cards: ["SLASH"],
                  },
                  {
                    id: "KATANA",
                    kanji: "突",
                    icon: "fa-wind",
                    desc: "Melee Weapon",
                    attr: "(DMG * 1DICE)",
                    cards: ["THRUST"],
                  },
                  {
                    id: "KATANA",
                    kanji: "強",
                    icon: "fa-mountain",
                    desc: "Melee Weapon",
                    attr: "(DMG * 4DICE, -25% HIT)",
                    cards: ["HARD ATTACK"],
                  },
                  {
                    id: "MISSILE",
                    kanji: "投",
                    icon: "fa-star",
                    desc: "Thrown Weapon",
                    attr: "(DMG * 1DICE)",
                    cards: ["SHURIKEN"],
                    qty: 3,
                  },
                  {
                    id: "MISSILE",
                    kanji: "弓",
                    icon: "fa-bow-arrow",
                    desc: "Ranged Weapon",
                    attr: "(DMG * 2DICE)",
                    cards: ["SHORT BOW"],
                    qty: 25,
                  },
                  {
                    id: "MISSILE",
                    kanji: "長",
                    icon: "fa-bow-arrow",
                    desc: "Ranged Weapon",
                    attr: "(DMG * 4DICE)",
                    cards: ["LONG BOW"],
                    qty: 12,
                  },
                  {
                    id: "ITEM",
                    kanji: "盾",
                    icon: "fa-water",
                    desc: "Armor",
                    attr: "(DEFEND * 2DICE)",
                    cards: ["SHIELD"],
                  },
                  {
                    id: "ITEM",
                    kanji: "具",
                    icon: "fa-flask",
                    desc: "Consumable",
                    attr: "(RESTORE)",
                    cards: ["HEAL POTION"],
                  },
                ];
        
                let categories = defaultCategories;
        
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
                        // Width alignment is handled via premium responsive CSS media queries
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
        
                function init3DIcons() {
                    const elements = ['EARTH', 'WATER', 'FIRE', 'WIND', 'ITEM', 'KATANA', 'MISSILE', 'DEFEND', 'DICE_EVEN', 'DICE_ODD', 'DICE_CENTER'];
                    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
                    renderer.setClearColor(0x000000, 0); // Critial fix to prevent black squares
                    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                    renderer.setSize(256, 256, false); // Fixed high-res buffer to prevent FBO thrashing
                    
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
                        if (el === 'EARTH') {
                            // BOULDER - rounder chunky rock
                            const rockMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.8, flatShading: true });
                            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 2), rockMat); 
                            group.add(rock);
                            update = (t) => {
                                const isDark = document.body.classList.contains('dark-mode');
                                rockMat.color.setHex(isDark ? 0x8D6E63 : 0x5C4033);
                                rock.rotation.x = t * 1.8; 
                                rock.position.set(0, Math.abs(Math.sin(t * 3)) * 1.2, 0); // Enforce X=0 to fix horizontal wobble
                            };
                        } else if (el === 'FIRE') {
                            const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshStandardMaterial({ color: 0xb71c1c, emissive: 0x4a0000, emissiveIntensity: 3, flatShading: true })); group.add(core);
                            const flames = [];
                            for(let i=0; i<60; i++) {
                                const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xffea00 : (i % 2 === 0 ? 0xff4500 : 0xb71c1c), emissive: i % 3 === 0 ? 0xffea00 : 0xff4500, emissiveIntensity: 2.5, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, flatShading: true }));
                                const ang = (i / 60) * Math.PI * 2, rad = 0.2 + Math.random() * 0.45;
                                s.position.set(Math.cos(ang) * rad, 0.3, Math.sin(ang) * rad); group.add(s);
                                flames.push({ m: s, s: 3 + Math.random() * 6, o: Math.random() * Math.PI, rs: (Math.random() - 0.5) * 2, bx: s.position.x, bz: s.position.z }); // Reduced speed factors
                            }
                            update = (t) => {
                                core.rotation.y = t * 0.25; core.scale.setScalar(1 + Math.sin(t * 3) * 0.08); // Slowed core x2
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
                            tornado.scale.set(0.65, 0.65, 0.65); // Scale down to fit inside the bubble!
                            group.add(tornado);
                            
                            update = (t) => { 
                                const isDark = document.body.classList.contains('dark-mode');
                                const targetColor = isDark ? 0xffffff : 0x333333;
                                tornado.children.forEach(l => { l.material.color.setHex(targetColor); });
                                
                                tornado.rotation.y = t * -3.0; 
                                
                                // Dynamic swirling lean to look organic
                                tornado.rotation.x = Math.sin(t * 3.5) * 0.15;
                                // Z ROTATION REMOVED
                            };
                        } else if (el === 'WATER') {
                            // Bootstrap Blue Wave
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
        
                            // 5% grayish smokey vial glass
                            const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.05, metalness: 0.1, transmission: 0.95, transparent: true, opacity: 0.4, ior: 1.5, depthWrite: false });
                            const corkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, metalness: 0.1 });
                            const liquidMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
                            
                            // Beaker vial look (Cylinder with slightly tapered top)
                            const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 1.6, 24);
                            const base = new THREE.Mesh(baseGeo, glassMat);
                            
                            // Liquid inside (50% full with sloshing top)
                            const liquidGeo = new THREE.CylinderGeometry(0.82, 0.85, 0.8, 24);
                            // Move geometry origin to bottom so we can rotate the top
                            liquidGeo.translate(0, 0.4, 0); 
                            const liquid = new THREE.Mesh(liquidGeo, liquidMat);
                            liquid.position.y = -0.7; // Bottom of the beaker
                            
                            // Neck
                            const neckGeo = new THREE.CylinderGeometry(0.4, 0.8, 0.6, 24);
                            const neck = new THREE.Mesh(neckGeo, glassMat);
                            neck.position.y = 1.1;
                            
                            // Lip
                            const lipGeo = new THREE.TorusGeometry(0.45, 0.1, 8, 24);
                            const lip = new THREE.Mesh(lipGeo, glassMat);
                            lip.position.y = 1.4;
                            lip.rotation.x = Math.PI / 2;
                            
                            // Cork
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
                                
                                // Liquid sloshing
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
                        } else if (el === 'KATANA') {
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
                            swordContainer.scale.set(0.8, 0.8, 0.1); // flatten z depth
                            
                            // White bloom glow behind
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
        
                            const sword1 = swordContainer.clone();
                            sword1.position.set(-1.2, 0, 1.5);
                            sword1.rotation.z = Math.PI / 4;
        
                            const sword2 = swordContainer.clone();
                            sword2.position.set(1.2, 0, 1.5);
                            sword2.rotation.z = Math.PI / 4;
        
                            group.add(sword1, sword2);
                            
                            // Extra point light for weapon shininess
                            const pointLight = new THREE.PointLight(0xffffff, 2.0, 10);
                            pointLight.position.set(0, 0, 3);
                            group.add(pointLight);
        
                            update = (t) => { 
                                sword1.position.y = Math.sin(t * 2) * 0.1; 
                                sword2.position.y = Math.cos(t * 2) * 0.1;
                            };
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
                            starGroup.scale.set(0.9, 0.9, 0.1); // flat z
                            
                            // White bloom glow behind
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
                            
                            // Extra point light for weapon shininess
                            const pointLight = new THREE.PointLight(0xffffff, 2.0, 10);
                            pointLight.position.set(0, 0, 3);
                            group.add(pointLight);
        
                            update = (t) => { 
                                star1.rotation.z = -t * 0.1; 
                                star2.rotation.z = t * 0.1; 
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
                            
                            // Inner shield design
                            const innerGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.25, bevelEnabled: false });
                            innerGeo.center();
                            const innerMat = new THREE.MeshStandardMaterial({color: 0xffffff, metalness: 0.1, roughness: 0.2});
                            const innerShield = new THREE.Mesh(innerGeo, innerMat);
                            innerShield.scale.set(0.5, 0.5, 1.0);
                            innerShield.position.z = 0; // centered so it pokes out both sides
                            addOutline(innerShield);
                            shield.add(innerShield);
                            
                            const innerShieldBack = new THREE.Mesh(innerGeo, innerMat);
                            innerShieldBack.scale.set(0.5, 0.5, 1.0);
                            innerShieldBack.position.z = -0.15; // Set into the back of the shield
                            innerShieldBack.rotation.y = Math.PI; // Face outwards
                            shield.add(innerShieldBack);
                            
                            group.add(shield);
                            update = (t) => { 
                                // Do not rotate per user request
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
                                // Two completely mapped 3D Dice
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
        
                                    // Side 1: +Z (1 dot)
                                    addDot(0, 0, 0.61, Math.PI/2, 0, 0);
                                    
                                    // Side 6: -Z (6 dots)
                                    for(let dx of [-0.3, 0.3]) for(let dy of [-0.3, 0, 0.3]) addDot(dx, dy, -0.61, Math.PI/2, 0, 0);
                                    
                                    // Side 2: +Y (2 dots)
                                    addDot(-0.3, 0.61, -0.3, 0, 0, 0);
                                    addDot(0.3, 0.61, 0.3, 0, 0, 0);
        
                                    // Side 5: -Y (5 dots)
                                    addDot(0, -0.61, 0, 0, 0, 0);
                                    for(let dx of [-0.3, 0.3]) for(let dz of [-0.3, 0.3]) addDot(dx, -0.61, dz, 0, 0, 0);
        
                                    // Side 3: +X (3 dots)
                                    addDot(0.61, 0, 0, 0, 0, Math.PI/2);
                                    addDot(0.61, 0.3, -0.3, 0, 0, Math.PI/2);
                                    addDot(0.61, -0.3, 0.3, 0, 0, Math.PI/2);
        
                                    // Side 4: -X (4 dots)
                                    for(let dy of [-0.3, 0.3]) for(let dz of [-0.3, 0.3]) addDot(-0.61, dy, dz, 0, 0, Math.PI/2);
                                    return mesh;
                                }
        
                                const d1 = createDie(true); d1.position.set(-0.8, 0, 0);
                                const d2 = createDie(false); d2.position.set(0.8, 0, 0);
                                
                                group.add(d1, d2);
                                update = (t) => {
                                    if (window.diceSettleTime === undefined) window.diceSettleTime = -5000;
                                    const speedMode = window.diceAttackSpin || 1.0;
                                    if (window.diceAttackSpin > 1.0) window.diceAttackSpin -= 0.5; // Decay
                                    
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
                                            // Interpolate to locked orthogonal faces ("land on numbers")
                                            d1.rotation.x += (d1.userData.targetRx - d1.rotation.x) * 0.15;
                                            d1.rotation.y += (d1.userData.targetRy - d1.rotation.y) * 0.15;
                                            d1.rotation.z += (0 - d1.rotation.z) * 0.15;
                                            d2.rotation.x += (d2.userData.targetRx - d2.rotation.x) * 0.15;
                                            d2.rotation.y += (d2.userData.targetRy - d2.rotation.y) * 0.15;
                                            d2.rotation.z += (0 - d2.rotation.z) * 0.15;
                                        } else {
                                            // Resume normal lazy roll
                                            d1.rotation.x += dt * 0.8; d1.rotation.y += dt * 1.1;
                                            d2.rotation.x -= dt * 0.8; d2.rotation.y -= dt * 1.1;
                                        }
                                        
                                        // Cleanly interpolate all bobbing/floating toward 0 while settled!
                                        const isFrozen = (settleAge > 0 && settleAge < 5000 && speedMode <= 1.1);
                                        const targetGrpY = isFrozen ? 0 : Math.sin(t * 0.5) * 0.3;
                                        const targetD1Y = isFrozen ? 0 : Math.sin(t*2)*0.1;
                                        const targetD2Y = isFrozen ? 0 : Math.cos(t*2)*0.1;
                                        
                                        group.rotation.y += (targetGrpY - group.rotation.y) * 0.15;
                                        d1.position.y += (targetD1Y - d1.position.y) * 0.15;
                                        d2.position.y += (targetD2Y - d2.position.y) * 0.15;
                                    }
                                    
                                    const settleAge = performance.now() - (window.diceSettleTime || 0);
                                    
                                    // 1. Keep main cube bodies dark
                                    d1.material.emissiveIntensity = 0;
                                    d2.material.emissiveIntensity = 0;
                                    
                                    // 2. Sequential Counting Sequence (Only active once landed and settled)
                                    if (speedMode <= 1.1 && settleAge > 0 && settleAge < 1500) {
                                        d1.userData.dotMat.emissive.setHex(0x00ffa5);
                                        d2.userData.dotMat.emissive.setHex(0x00ffa5);
                                        
                                        let f1 = 0, f2 = 0;
                                        if (settleAge > 200 && settleAge <= 450) { f1 = 4.0; } // Die 1 Count
                                        else if (settleAge > 600 && settleAge <= 850) { f2 = 4.0; } // Die 2 Count
                                        else if (settleAge > 1000 && settleAge <= 1150) { f1 = 4.0; f2 = 4.0; } // Blink 1
                                        else if (settleAge > 1300 && settleAge <= 1450) { f1 = 4.0; f2 = 4.0; } // Blink 2
        
                                        d1.userData.dotMat.emissiveIntensity = f1;
                                        d2.userData.dotMat.emissiveIntensity = f2;
                                    } else {
                                        d1.userData.dotMat.emissiveIntensity = 0;
                                        d2.userData.dotMat.emissiveIntensity = 0;
                                    }
                                };
                            } else {
                                // Original Single Die logic
                                const die = new THREE.Mesh(dieGeo, dieMat);
                                const dotGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
                                const dotMat = new THREE.MeshStandardMaterial({color: el === 'DICE_EVEN' ? 0x1b5e20 : 0xb71c1c}); // Green for Even, Red for Odd
                                
                                // Add standard center dot mapping (1 face)
                                const dotCenter = new THREE.Mesh(dotGeo, dotMat);
                                dotCenter.rotation.x = Math.PI / 2;
                                dotCenter.position.z = 0.81;
                                die.add(dotCenter);
        
                                // Add opposing face (6 dots)
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
                        scene.add(group); scenes[el] = { scene, update };
                    });
        
                    avatarClock = new THREE.Clock();
                    
                    // Single Global Camera for all 3D Icons
                    const iconCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); 
                    iconCamera.position.set(0, 0, 7.5);
                    
                    let lastRender = 0;
                    const canvasCache = {};
                    
                    function renderLoop(time) {
                        requestAnimationFrame(renderLoop);
                        
                        // Throttle to 30 FPS for UI components
                        if (time - lastRender < 33) return;
                        lastRender = time;
                        
                        // Optimization: Do not render heavy 3D icons or avatars when the main dock is hidden
                        const encounterZone = document.getElementById('encounter-zone');
                        const uiRowHidden = document.getElementById('lower-ui-row') ? document.getElementById('lower-ui-row').style.display === 'none' : false;
                        if (uiRowHidden && (!encounterZone || !encounterZone.classList.contains('active'))) return;
                        
                        const t = time * 0.001;
                        const delta = avatarClock.getDelta();
                        
                        if (avatarMixer) {
                            avatarMixer.update(delta);
                        }
                        
                        if (avatarRenderer && avatarScene && avatarCamera) {
                            const container = document.getElementById('player-avatar-container');
                            if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                                const w = container.clientWidth;
                                const h = container.clientHeight;
                                const canvas = avatarRenderer.domElement;
                                if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                                    avatarRenderer.setSize(w, h, false);
                                    avatarCamera.aspect = w / h;
                                    avatarCamera.updateProjectionMatrix();
                                }
                            }
                            avatarRenderer.render(avatarScene, avatarCamera);
                        }
        
                        // Update rotational logic for all 3D components
                        elements.forEach(el => scenes[el].update(t));
        
                        // Regenerate canvas cache every 500ms to avoid DOM polling spikes
                        if (time - canvasCache.lastScan > 500 || !canvasCache.lastScan) {
                            canvasCache.lastScan = time;
                            canvasCache.elements = document.querySelectorAll(
                                '.guide-card[data-depth="0"] .card-icon-3d, .wager-card .card-icon-3d, .kp-center-btn[data-element="DICE_CENTER"], .kp-center-btn[data-icon="DICE_CENTER"], #floating-loot-layer .card-icon-3d'
                            );
                        }
        
                        if (canvasCache.elements) {
                            // Group canvases by element type to avoid duplicate WebGL rendering
                            const renderGroups = {};
                            canvasCache.elements.forEach(container => {
                                const el = container.dataset.element || container.dataset.icon;
                                if (!el || !scenes[el]) return;
                                
                                const cvs = container.querySelector('canvas') || (container.firstChild && container.firstChild.nodeName === 'CANVAS' ? container.firstChild : null);
                                if (!cvs) return;
                                
                                const cw = cvs.clientWidth, ch = cvs.clientHeight;
                                if (cw === 0 || ch === 0) return;
                                
                                if (!renderGroups[el]) renderGroups[el] = [];
                                renderGroups[el].push({ cvs, cw, ch });
                            });
                            
                            // Render each unique scene once, then distribute to all instances
                            for (const [el, targets] of Object.entries(renderGroups)) {
                                renderer.render(scenes[el].scene, iconCamera);
                                targets.forEach(({ cvs, cw, ch }) => {
                                    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
                                    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
                                    const ctx = cvs.getContext('2d'); 
                                    if (ctx) { ctx.clearRect(0, 0, w, h); ctx.drawImage(renderer.domElement, 0, 0, w, h); }
                                });
                            }
                        }
                    }
                    
                    // Pre-compile shaders for all 3D icons to prevent the massive 1200ms lag spike on the first frame
                    Object.values(scenes).forEach(cached => {
                        renderer.compile(cached.scene, iconCamera);
                    });
                    
                    renderLoop(0);
                }
        
                function initAvatar() {
                    const container = document.getElementById('player-avatar-container');
                    if (!container) return;
                    
                    const w = container.clientWidth || 58;
                    const h = container.clientHeight || 58;
                    
                    avatarRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
                    avatarRenderer.setClearColor(0x000000, 0); // Crucial fix for black square bounds
                    avatarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                    avatarRenderer.setSize(w, h);
                    container.appendChild(avatarRenderer.domElement);
                    
                    avatarScene = new THREE.Scene();
                    avatarCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
                    avatarCamera.position.set(0, 1.2, 4.8);
                    avatarCamera.lookAt(0, 0.85, 0); // Look lower so the avatar moves UP (+1px) and its legs aren't covered
                    
                    const ambLight = new THREE.AmbientLight(0xffffff, 1.5); // Brighter ambient light
                    avatarScene.add(ambLight);
                    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0); // Brighter directional
                    dirLight.position.set(5, 5, 5);
                    avatarScene.add(dirLight);
                    
                    try {
                        const loader = new THREE.GLTFLoader();
                        // Adding multiple paths fallback logic like FPV does if possible, but trying relative first
                        const isLocalFile = window.location.protocol === 'file:';
                        const modelUrls = [
                            './assets/models/player/Player.A.Walking.glb',
                            '../assets/models/player/Player.A.Walking.glb',
                            './assets/models/Player.A.Walking.glb',
                            '../assets/models/Player.A.Walking.glb',
                            'assets/Player.A.Walking.glb',
                            'https://www.markpeterson.info/Origami/assets/Player.A.Walking.glb',
                            'https://markpeterson.info/Origami/assets/Player.A.Walking.glb'
                        ];
                        
                        function tryLoadModel(urlIndex) {
                            if (urlIndex >= modelUrls.length) {
                                if (isLocalFile) {
                                    console.log("Avatar 3D load skipped: Browsers block 'file://' CORS fetch requests. Using 2D portrait fallback.");
                                } else {
                                    console.warn("Avatar failed to load natively after all attempts. Falling back to 2D portrait.");
                                }
                                container.style.backgroundImage = 'url("assets/models/player/Player.A.png")';
                                container.style.backgroundPosition = 'center';
                                container.style.backgroundSize = '60%';
                                container.style.backgroundRepeat = 'no-repeat';
                                container.style.backgroundBlendMode = 'multiply';
                                return;
                            }
                            
                            loader.load(modelUrls[urlIndex], (gltf) => {
                                const model = gltf.scene;
                                
                                model.position.set(0, -0.1, 0); // Moved up to add +25px bottom buffer
                                // Rotate to face slightly right layout (isometric feel)
                                model.rotation.y = Math.PI / 8;
                                // Scale 
                                model.scale.set(1.25, 1.25, 1.25);
                                
                                // Prevent material from blowing out to pure white under lighting
                                model.traverse((child) => {
                                    if (child.isMesh) {
                                        child.material = new THREE.MeshLambertMaterial({ 
                                            color: 0xcccccc
                                        });
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
                                    
                                    // Map best matches
                                    avatarIdleAction = avatarActions['idle'] || avatarActions['stand'];
                                    avatarActions.walk = avatarActions['walk'] || avatarActions['run'] || avatarActions['walking'] || avatarActions[1] || avatarActions[0];
                                    avatarActions.slash = avatarActions['attack'] || avatarActions['slash'] || avatarActions[2] || avatarActions[1] || avatarActions.walk;
                                    
                                    if (!avatarIdleAction) {
                                        avatarIdleAction = avatarActions[0] || avatarMixer.clipAction(gltf.animations[0]);
                                    }
                                    avatarActions['idle'] = avatarIdleAction;
                                    
                                    // Play idle immediately if it logically exists
                                    if (avatarIdleAction) {
                                        avatarCurrentAction = avatarIdleAction;
                                        if (avatarIdleAction === avatarActions.walk) avatarIdleAction.setEffectiveTimeScale(0);
                                        avatarIdleAction.play();
                                    }
                                }
                                
                                // Fix metallic/roughness issues that might make it render black
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
                    
                    document.getElementById('bottom-panel').onwheel = e => {
                        if (document.activeElement.id !== 'bottom-panel' || wheelThrottle) return;
                        e.preventDefault(); wheelThrottle = true; cycle(focusedColIndex, e.deltaY > 0); setTimeout(() => wheelThrottle = false, 150);
                    };
                    const params = new URLSearchParams(window.location.search);
                    const mode = params.get('mode');
                    if (mode !== 'combat') {
                        initAvatar();
                    }
                }
        
                function playAvatarAnim(name) {
                    if (!avatarActions || !avatarMixer) return;
                    const targetAction = avatarActions[name];
                    if (!targetAction || targetAction === avatarCurrentAction) return;
        
                    const btn = document.getElementById('player-avatar-container');
                    if (btn) {
                        btn.classList.remove('anim-idle-btn', 'anim-walk-btn', 'anim-slash-btn');
                        if (name === 'slash' || name === 'attack') btn.classList.add('anim-slash-btn');
                        else if (name === 'walk') btn.classList.add('anim-walk-btn');
                        else if (name === 'idle') btn.classList.add('anim-idle-btn');
                        if (typeof isMoving !== 'undefined' && isMoving) btn.classList.add('anim-walk-btn');
                    }
        
                    if (avatarCurrentAction) {
                        targetAction.time = 0;
                        let timescale = name === 'walk' ? 1.5 : 1;
                        // If we fallback to walk animation for idle, pause it so they stand still
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
                                playAvatarAnim('idle');
                            }
                        };
                        avatarMixer.addEventListener('finished', onFinished);
                    } else {
                        targetAction.setLoop(THREE.LoopRepeat);
                    }
                    
                    avatarCurrentAction = targetAction;
                }
        
                function launchModal(card) {
                    pendingAction = card.querySelector('.card-title').textContent;
                    const content = document.getElementById('modal-content');
                    content.innerHTML = card.innerHTML;
                    content.className = `modal-card-hd ${card.className}`;
                    const styles = getComputedStyle(card);
                    document.getElementById('launch-modal').style.setProperty('--modal-theme-clr', styles.getPropertyValue('--theme-clr'));
                    document.getElementById('launch-modal').classList.add('active');
                    document.getElementById('modal-overlay').classList.add('active');
                    window.postMessage({ type: 'MODAL_STATE', isOpen: true }, '*');
                }
        
                function setFocus(idx, scroll = true) {
                    focusedColIndex = idx;
                    document.querySelectorAll('.card-column').forEach((c, i) => c.classList.toggle('focused', i === idx));
                    if (scroll) {
                        const col = document.getElementById(`col-${idx}`), container = document.getElementById('guides-container');
                        container.scrollTo({ left: col.offsetLeft - (container.offsetWidth/2) + (col.offsetWidth/2), behavior: 'smooth' });
                    }
                }
        
                window.closeModal = () => { 
                    document.getElementById('launch-modal').classList.remove('active'); 
                    document.getElementById('modal-overlay').classList.remove('active'); 
                    window.postMessage({ type: 'MODAL_STATE', isOpen: false }, '*');
                };
                
                // Exit Modal Logic
                let exitModalActive = false;
                window.showExitModal = () => {
                    if (exitModalActive) return;
                    exitModalActive = true;
                    document.getElementById('exit-modal').classList.add('active');
                    document.getElementById('modal-overlay').classList.add('active');
                    window.postMessage({ type: 'MODAL_STATE', isOpen: true }, '*');
                };
                window.hideExitModal = () => {
                    exitModalActive = false;
                    document.getElementById('exit-modal').classList.remove('active');
                    document.getElementById('modal-overlay').classList.remove('active');
                    window.postMessage({ type: 'MODAL_STATE', isOpen: false }, '*');
                };
                window.confirmExit = () => {
                    console.log("EXITING DUNGEON");
                    window.location.reload(); 
                    window.parent.location.reload(); // Hard reset game
                };
        
                // Exit Modal Keyboard Listener (Any key dismisses, only 'y' resets)
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
                    window.postMessage({ type: 'TOGGLE_AUTOPICKUP', enabled: enabled }, '*');
                };
        
                window.openSettings = function() {
                    const modal = document.getElementById('settings-modal');
                    if(modal) modal.style.display = 'block';
                };
        
                window.closeSettings = function() {
                    const modal = document.getElementById('settings-modal');
                    if(modal) modal.style.display = 'none';
                };
        
                window.emitAction = (a, explicitBtn = null) => { 
                    if (a === 'SET') {
                        window.openSettings();
                        return;
                    }
                    window.postMessage({ type: 'FPV_ACTION', action: a }, '*');
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
                                qty--;
                                btn.dataset.qty = qty;
                                const badge = btn.querySelector('.card-badge');
                                if (badge) badge.textContent = qty;
                                
                                if (qty <= 0) {
                                    btn.style.opacity = '0'; // Fade out
                                    btn.style.pointerEvents = 'none'; // prevent double clicks during fade
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
                            } else if (qty <= 0) {
                                return; // Block action if depleted!
                            }
                        }
                    }
                    
                    // Dice UI Toggle
                    if (a === 'WAGER') {
                        const guideCont = document.getElementById('guides-container');
                        const diceCont = document.getElementById('dice-container');
                        guideCont.style.opacity = '0';
                        setTimeout(() => {
                            guideCont.style.display = 'none';
                            diceCont.classList.add('active');
                        }, 400); // Wait for fade out
                        return;
                    }
                    
                    if (a === 'BET_EVEN' || a === 'BET_ODD') {
                        if (window.playerGold === undefined) window.playerGold = 0;
                        const wagerAmount = 10;
                        if (window.playerGold < wagerAmount) {
                            emitAction('LOG'); 
                            window.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `Not enough gold! You need ${wagerAmount} Gold.` }, '*');
                            return;
                        }
                        const isEven = (a === 'BET_EVEN');
                        if (typeof window.rollDiceAnimation === 'function') window.rollDiceAnimation(isEven, wagerAmount);
                        return;
                    }
        
                    // Deck Swapping
                    if (a === 'ATTACK') {
                        playAvatarAnim('slash');
                        
                        let hasUsableMissile = false;
                        combatCategories.forEach(cat => {
                            if (cat.id === 'MISSILE' && cat.cards && cat.cards.length > 0) {
                                if (cat.qty === undefined || cat.qty > 0) {
                                    hasUsableMissile = true;
                                }
                            }
                        });
                        
                        if (window.currentMonsterDistanceFeet > 5 && !hasUsableMissile) {
                            window.postMessage({ type: 'LOG_EVENT', logType: 'system', text: 'No Missile Playing Cards Found' }, '*');
                        }
                        
                        loadDeck(combatCategories);
                    } else if (a === 'RETREAT' || a === 'HIDE') {
                        loadDeck(defaultCategories);
                    }
                };
        
                function loadDeck(newCategories) {
                    categories = newCategories;
                    const container = document.getElementById('guides-container');
                    container.innerHTML = '';
                    
                    categories.forEach((cat, idx) => {
                        UXAI.sortCategory(cat);
                        const col = document.createElement('div'); col.className = 'card-column'; col.id = `col-${idx}`;
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
                                        holdTarget.classList.add('selected-card');
                                        const actionName = holdTarget.querySelector('.card-title').textContent;
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
                                
                                // Grab new top card for continuous dragging
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
                                return; // We already fired actions via hold, do not fire single click
                            }
        
                            const topCard = col.querySelector('.guide-card[data-depth="0"]');
                            if (topCard) {
                                topCard.style.transition = '';
                                topCard.style.transform = '';
                            }
                            if (!dragMoved) {
                                // Keyboard selector bypass
                                let firedViaSuperimposed = false;
                                if (typeof isKeyboardSelectorActive !== 'undefined' && isKeyboardSelectorActive) {
                                    const el = document.elementFromPoint(e.clientX, e.clientY);
                                    const clickedCard = el ? el.closest('.guide-card') : null;
                                    if (clickedCard && clickedCard.dataset.depth === "0" && clickedCard.parentElement === col && clickedCard.classList.contains('superimposed-card')) {
                                        firedViaSuperimposed = true;
                                        clickedCard.classList.add('launching');
                                        const actionName = clickedCard.querySelector('.card-title').textContent;
                                        emitAction(actionName, clickedCard);
                                        setTimeout(() => { 
                                            clickedCard.classList.remove('launching'); 
                                        }, 450);
                                    }
                                }
        
                                // Single / Double click activation
                                const el = document.elementFromPoint(e.clientX, e.clientY);
                                if (!el) return;
                                const clickedCard = el.closest('.guide-card');
                                if (!firedViaSuperimposed && clickedCard && clickedCard.parentElement === col) {
                                    setFocus(idx);
                                    if(clickedCard.dataset.depth === "0") {
                                        // SINGLE CLICK - FIRE IMMEDIATELY
                                        document.querySelectorAll('.guide-card.selected-card').forEach(c => c.classList.remove('selected-card'));
                                        clickedCard.classList.add('launching');
                                        const actionName = clickedCard.querySelector('.card-title').textContent;
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
                            const desc = masterCard ? masterCard.desc : cat.desc;
                            const elId = masterCard ? masterCard.el : cat.id;
                            const attr = masterCard ? masterCard.attr : (cat.attr || '');
                            
                            const card = document.createElement('div');
                            card.className = `guide-card card-${elId.toLowerCase()}`;
                            card.dataset.depth = i;
                            if (cat.qty !== undefined) card.dataset.qty = cat.qty;
                            
                            const badgeHtml = cat.qty !== undefined ? `<div class="card-badge">${cat.qty}</div>` : '';
                            card.innerHTML = `
                                <div class="card-header"><span class="card-kanji">${kanji}</span><span class="card-type-pill">${typePill}</span></div>
                                <div class="card-title">${name}</div><div class="card-desc">${desc}</div>
                                <div class="card-icon-3d" data-element="${elId}"><canvas></canvas></div>
                                <div class="card-attr-fused">${attr}</div>
                                <div class="card-click-overlay"></div>
                                ${badgeHtml}
                            `;
                            col.appendChild(card);
                        });
                        container.appendChild(col);
                    });
                    
                    // Drag and Drop Container Logic
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
                    
                    // Re-attach hover focus states to newly generated UI
                    document.querySelectorAll('.u-panel').forEach(p => { 
                        p.onmouseenter = () => p.focus(); 
                        p.onmouseleave = () => p.blur(); 
                    });
                    
                    // Ensure 3D icons are rendered for the newly built deck
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
                
                // Event Log focus expansion
                const _chatInput = document.querySelector('.chat-input');
                const _evtLog = document.getElementById('event-log-container');
                if (_chatInput && _evtLog) {
                    _chatInput.addEventListener('focus', () => _evtLog.classList.add('active'));
                    _chatInput.addEventListener('blur', () => {
                        setTimeout(() => {
                            if (document.activeElement !== _chatInput) {
                                _evtLog.classList.remove('active');
                            }
                        }, 100);
                    });
                }
        
        
        
                // INIT AND EVENTS PANEL LOGIC ---
                window.showLcdEvent = function(text) {
                    window.addLogEntry('system', text);
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
                                key = x > 0 ? 'e' : 'q'; // Strafe Right (e) or Strafe Left (q)
                            } else {
                                key = y > 0 ? 'ArrowDown' : 'ArrowUp'; // Backwards or Forwards
                            }
                        } else {
                            const btn = e.target.closest('[data-key]');
                            if (btn) key = btn.dataset.key;
                        }
                        
                        if (!key) return;
                        
                        activeDPadPointers.set(e.pointerId, key);
                        playAvatarAnim('walk');
                        window.postMessage({ type: 'KEY_DOWN', key: key, code: key }, '*');
                    } else {
                        const key = activeDPadPointers.get(e.pointerId);
                        if (!key) return; // Ignores pointerup/leave if this pointer didn't press a button
                        playAvatarAnim('idle');
                        window.postMessage({ type: 'KEY_UP', key: key, code: key }, '*');
                        activeDPadPointers.delete(e.pointerId);
                    }
                };
        
                const leftPanel = document.getElementById('left-panel');
                // Use pointer events instead to unify touch/mouse and avoid sticky keys
                leftPanel.addEventListener('pointerdown', e => handleDPadInput(e, true));
                leftPanel.addEventListener('pointerup', e => handleDPadInput(e, false));
                leftPanel.addEventListener('pointerleave', e => handleDPadInput(e, false));
                leftPanel.addEventListener('pointercancel', e => handleDPadInput(e, false));
        
                const params = new URLSearchParams(window.location.search);
        
                window.isKeyboardSelectorActive = false;
                
                window.toggleKeyboardSelector = function() {
                    window.isKeyboardSelectorActive = !window.isKeyboardSelectorActive;
                    const bottomPanel = document.getElementById('bottom-panel');
                    document.querySelectorAll('.superimposed-card').forEach(c => c.classList.remove('superimposed-card'));
                    
                    if (window.isKeyboardSelectorActive) {
                        bottomPanel.focus();
                        const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                        if (topCard) topCard.classList.add('superimposed-card');
                    } else {
                        bottomPanel.blur();
                    }
                };
        
                window.addEventListener('keydown', e => {
                    if (e.key === 'Escape') { 
                        if (window.isKeyboardSelectorActive) toggleKeyboardSelector();
                        closeModal(); 
                        if(document.activeElement.classList.contains('u-panel')) document.activeElement.blur(); 
                        return; 
                    }
                    if (e.key === 'Tab') return;
                    
                    // Intercept Deck Navigation
                    if (e.key === 'Enter' && !document.activeElement.classList.contains('chat-input')) {
                        e.preventDefault();
                        if (!window.isKeyboardSelectorActive) {
                            toggleKeyboardSelector();
                            return;
                        }
                        
                        const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                        if(topCard) {
                            if (topCard.classList.contains('selected-card')) {
                                // Fire it! Rapid fire!
                                topCard.classList.remove('selected-card', 'superimposed-card');
                                topCard.classList.add('launching');
                                const name = topCard.querySelector('.card-title').textContent;
                                emitAction(name, topCard);
                                setTimeout(() => topCard.classList.remove('launching'), 450);
                            } else {
                                // Select it!
                                document.querySelectorAll('.guide-card.selected-card').forEach(c => c.classList.remove('selected-card'));
                                topCard.classList.add('selected-card');
                            }
                        }
                        return;
                    }
        
                    if (window.isKeyboardSelectorActive) {
                        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                            e.preventDefault();
                            document.querySelectorAll('.superimposed-card').forEach(c => c.classList.remove('superimposed-card'));
                            focusedColIndex = e.key === 'ArrowLeft' ? Math.max(0, focusedColIndex - 1) : Math.min(categories.length - 1, focusedColIndex + 1);
                            setFocus(focusedColIndex);
                            document.querySelectorAll('.card-tooltip').forEach(t => t.classList.remove('show'));
                            const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                            if(topCard) {
                                topCard.classList.add('superimposed-card');
                                const tt = topCard.querySelector('.card-tooltip');
                                if(tt) tt.classList.add('show');
                            }
                            return; // Prevent FPV movement
                        } else if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                            e.preventDefault();
                            document.querySelectorAll('.superimposed-card').forEach(c => c.classList.remove('superimposed-card'));
                            document.querySelectorAll('.card-tooltip').forEach(t => t.classList.remove('show'));
                            cycle(focusedColIndex, e.key === 'ArrowDown');
                            const topCard = document.querySelector(`#col-${focusedColIndex} .guide-card[data-depth="0"]`);
                            if(topCard) topCard.classList.add('superimposed-card');
                            return; // Prevent FPV movement
                        }
                    }
                    
                    if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key) && !document.activeElement.classList.contains('chat-input') && document.activeElement.id !== 'bottom-panel') {
                        playAvatarAnim('walk');
                    }
                    if (!document.activeElement.classList.contains('chat-input')) {
                        window.postMessage({ type: 'KEY_DOWN', key: e.key, code: e.code }, '*');
                    }
                });
                window.addEventListener('keyup', e => {
                    if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) {
                        playAvatarAnim('idle');
                    }
                    window.postMessage({ type: 'KEY_UP', key: e.key, code: e.code }, '*');
                });
                
                window.addEventListener('blur', () => {
                    // Failsafe: if the browser or iframe loses focus, flush all movement keys
                    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].forEach(k => {
                        window.postMessage({ type: 'KEY_UP', key: k, code: k }, '*');
                    });
                    playAvatarAnim('idle');
                    activeDPadPointers.clear();
                });
                setup();
        
                // The center thumb button is now handled by the D-Pad pointerdown listener (data-key="ArrowUp")
        
                // --- Compass Direction Dial Update ---
                // Called in real-time (~20hz) by PLAYER_ROT_REALTIME and on grid change by PLAYER_MOVE.
                function updateCompass(rot) {
                    const compass = document.querySelector('.compass-outer-ring');
                    if (!compass) return;
                    const rotDeg = (rot * 180) / Math.PI;
                    compass.style.transform = `rotate(${rotDeg}deg)`;
                    
                    // Calculate which direction is at the top (under the glass indicator)
                    let angle = rotDeg % 360;
                    if (angle < 0) angle += 360; // Normalize to 0-360
                    
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
        
                // Listen for combat state changes from main relay
                window.addEventListener('message', (e) => {
        
                    if (e.data && e.data.type === 'SHOW_COMBAT') {
                        const ez = document.getElementById('encounter-zone');
                        if (!ez.classList.contains('active')) {
                            window.logEvent('You encounter a Yakuza Goblin!', 'system');
                            window.logEvent('DMG: (LVL + WPN + SPC)', 'system');
                        }
                        ez.classList.add('active');
                        document.getElementById('event-log-container').classList.add('active');
                        if (e.data.health !== undefined) {
                            const hp = Math.max(0, Math.round(e.data.health));
                            const maxHp = e.data.maxHp || 50;
                            const mnum = document.getElementById('monster-hp-num');
                            if (mnum) mnum.textContent = hp;
                            const mfill = document.getElementById('monster-hp-fill');
                            if (mfill) mfill.style.width = Math.max(0, (hp / maxHp) * 100) + '%';
                            // Update the max HP label
                            const mmax = document.getElementById('monster-hp-max');
                            if (mmax) mmax.textContent = `/ ${maxHp} HP`;
                            // Colour-shift bar as HP drops
                            if (mfill) {
                                if (hp <= 10) mfill.style.background = 'linear-gradient(90deg,#4a0000,#ff0000)';
                                else if (hp <= 25) mfill.style.background = 'linear-gradient(90deg,#b71c1c,#ff5252)';
                                else mfill.style.background = '';
                            }
                        }
                        // Update monster name from actual model userData
                        if (e.data.name) {
                            const mname = document.getElementById('monster-name');
                            if (mname) mname.textContent = e.data.name;
                        }
                        // Update type label (ENEMY / GAMBLER)
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
                            // Center-to-center distance * 10, minus 10 feet for physical contact radius
                            let distFeet = Math.max(0, (e.data.distance * 10) - 10).toFixed(0);
                            distTexts.forEach(el => el.textContent = `${distFeet} ft`);
                            window.currentMonsterDistanceFeet = parseInt(distFeet);
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
                        const ez = document.getElementById('encounter-zone');
                        if (ez) {
                            ez.classList.remove('active');
                        }
                    } else if (e.data && e.data.type === 'UPDATE_LOOT_CARDS') {
                        const layer = document.getElementById('floating-loot-layer');
                        if (!layer) return;
                        
                        // Track alive elements to handle despawning
                        Array.from(layer.children).forEach(c => c.dataset.alive = "0");
                        
                        e.data.items.forEach(item => {
                            let card = document.getElementById('loot-c-' + item.id);
                            if (!card) {
                                card = document.createElement('div');
                                card.id = 'loot-c-' + item.id;
                                
                                const cat = defaultCategories.find(c => c.cards.includes(item.cardName)) || defaultCategories[0];
                                const masterCard = (
                                  window.OrigamiCards || []
                                ).find(
                                  (c) =>
                                    c.name === item.cardName ||
                                    c.id === item.cardName,
                                );
                                const cardLoc = masterCard
                                  ? window.tCard &&
                                    window.tCard(
                                      masterCard.id,
                                      window.currentLang,
                                    )
                                  : null;
                                const cardTitle = cardLoc
                                  ? cardLoc.name
                                  : item.cardName;
                                const cardDesc = cardLoc
                                  ? cardLoc.desc
                                  : cat.desc;
                                const cardAttr = cardLoc
                                  ? cardLoc.attr
                                  : cat.attr || "";
                                
                                card.className = `guide-card card-${cat.id.toLowerCase()}`;
                                card.dataset.depth = "0";
                                card.style.position = 'absolute';
                                card.style.pointerEvents = 'auto'; // Re-enable pointer events since parent is none
                                card.style.cursor = 'pointer';
                                
                                // Matches generateCardHTML layout pixel-perfectly
                                card.innerHTML = `
                                    <div class="card-header"><span class="card-kanji">${cat.kanji || ""}</span><div class="card-type-pill">${cat.id}</div></div>
                                    <h3 class="card-title" style="margin:0; height:18px;">${cardTitle}</h3><p class="card-desc" style="margin:0; height:12px;">${cardDesc}</p>
                                    <div class="card-icon-3d" data-element="${cat.id}"><canvas></canvas></div>
                                    <div class="card-attr-fused">${cardAttr}</div>
                                `;
                                
                                // Click to activate the 3D card remotely
                                card.onclick = (e) => {
                                    e.stopPropagation();
                                    card.classList.add('launching');
                                    
                                    // Show card in PIP
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
                                // Trigger cache rescan for new canvas
                                window.canvasCache = window.canvasCache || {};
                                window.canvasCache.lastScan = 0;
                            }
                            card.dataset.alive = "1";
                            
                            if (!item.visible) {
                                card.style.display = 'none';
                            } else {
                                card.style.display = 'flex';
                                // Float bottom-center anchored
                                card.style.transform = `translate(-50%, -85%) scale(${item.scale})`;
                                card.style.left = item.left + 'px';
                                card.style.top = item.top + 'px';
                                card.style.zIndex = Math.floor(item.scale * 100);
                                card.style.opacity = Math.min(1.0, item.scale * 1.5).toString();
                            }
                        });
                        
                        // Cleanup collected/despawned
                        Array.from(layer.children).forEach(c => {
                            if (c.dataset.alive === "0") c.remove();
                        });
                    } else if (e.data && (e.data.type === 'HIDE_COMBAT' || e.data.type === 'HIDE_ALL')) {
                        document.getElementById('encounter-zone').classList.remove('active');
                        if (document.activeElement !== document.querySelector('.chat-input')) {
                            document.getElementById('event-log-container').classList.remove('active');
                        }
                        loadDeck(defaultCategories); // Reset deck after combat
                        if (window.isKeyboardSelectorActive && typeof window.toggleKeyboardSelector === 'function') {
                            window.toggleKeyboardSelector();
                        }
                    } else if (e.data && e.data.type === 'COMBAT_ATTACK') {
                        window.diceAttackSpin = 40.0; // Overdrive the dice icon spin!
                        // Player uses Empty Hand (bump attack) - Deck must be organically looted!
                        if (avatarActions && avatarActions.slash) {
                            const slash = avatarActions.slash;
                            slash.reset();
                            slash.setLoop(THREE.LoopOnce, 1);
                            slash.clampWhenFinished = true;
                            // Safely fade out old action to prevent crossFade NULL errors
                            if (avatarCurrentAction && avatarCurrentAction.isRunning()) {
                                avatarCurrentAction.fadeOut(0.2);
                            }
                            slash.fadeIn(0.2).play();
                            avatarCurrentAction = slash;
                            
                            // Return to idle/walk after animation finishes (~1sec)
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
                        
                        // Set health donut variable
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
                        
                        // Attributes
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
                        if (pfill && e.data.maxHp) pfill.style.width = Math.max(0, (hp / e.data.maxHp) * 100) + '%';
                        // Colour-shift as HP drops
                        if (pfill) {
                            if (hp <= 20) pfill.style.background = 'linear-gradient(90deg,#4a0000,#ff1111)';
                            else if (hp <= 50) pfill.style.background = 'linear-gradient(90deg,#b71c1c,#ff7043)';
                            else pfill.style.background = '';
                        }
                    } else if (e.data && e.data.type === 'LOOT_CARDS') {
                        window.logEvent('LOOT AQUIRED: Tactical Katana Deck', 'system');
                        loadDeck(combatCategories);
                    } else if (e.data && e.data.type === 'ADD_CARD') {
                        const cardName = e.data.card;
                        if (!window.cardInventoryCounts) window.cardInventoryCounts = {};
                        window.cardInventoryCounts[cardName] = (window.cardInventoryCounts[cardName] || 1) + 1;
                        
                        const count = window.cardInventoryCounts[cardName];
                        if (count >= 2) {
                            // Update all visual representations of this card
                            document.querySelectorAll('.guide-card').forEach(card => {
                                const titleEl = card.querySelector('.card-title');
                                if (titleEl && titleEl.textContent === cardName) {
                                    let badge = card.querySelector('.card-badge');
                                    if (!badge) {
                                        badge = document.createElement('div');
                                        badge.className = 'card-badge';
                                        card.appendChild(badge);
                                    }
                                    badge.textContent = count;
                                    card.dataset.qty = count;
                                }
                            });
                        }
                        
                        // If inventory is open, refresh it
                        const invModal = document.getElementById('inventory-modal');
                        if (invModal && invModal.classList.contains('active')) {
                            window.renderInventory();
                        }
                    } else if (e.data && e.data.type === 'LCD_EVENT') {
                        if (window.showLcdEvent)
                          window.showLcdEvent(e.data.text || "SYS_ERR");
                    } else if (e.data && e.data.type === 'LOG_EVENT') {
                        window.logEvent(e.data.text, e.data.logType || 'system');
                    } else if (e.data && e.data.type === 'PLAYER_MOVE') {
                        if (e.data.rot !== undefined) updateCompass(e.data.rot);
                    } else if (e.data && e.data.type === 'PLAYER_ROT_REALTIME') {
                        // Real-time rotation update (broadcasted ~20hz from FPV engine)
                        if (e.data.rot !== undefined) updateCompass(e.data.rot);
                    } else if (e.data && e.data.type === 'RADAR_UPDATE') {
                        if (e.data.rot !== undefined) updateCompass(e.data.rot);
                        const radarOverlay = document.getElementById('radar-overlay');
                        if (radarOverlay && e.data.enemies) {
                            // Reuse DOM elements instead of trashing layout 20x a second
                            const existingBlips = radarOverlay.children;
                            const maxDist = 15.0;
                            
                            for (let i = 0; i < e.data.enemies.length; i++) {
                                const en = e.data.enemies[i];
                                const cosR = Math.cos(e.data.rot);
                                const sinR = Math.sin(e.data.rot);
                                
                                const localX = en.dx * cosR - en.dz * sinR;
                                const localZ = en.dx * sinR + en.dz * cosR;
                                
                                const pctX = (localX / maxDist) * 50;
                                const pctY = (localZ / maxDist) * 50;
                                
                                let blip = existingBlips[i];
                                if (!blip) {
                                    blip = document.createElement('div');
                                    blip.className = 'radar-blip';
                                    radarOverlay.appendChild(blip);
                                }
                                
                                // Use CSS transform for hardware acceleration instead of left/top!
                                // Since blip has top:50%; left:50%; we can translate by % of parent.
                                blip.style.transform = `translate(calc(-50% + ${pctX * 2}vw), calc(-50% + ${pctY * 2}vh))`;
                                // Wait, pctX is % of the container (which is ~250px). 
                                // Actually, if we keep top:50%; left:50%, we can just use margin or translate(px).
                                const pxX = (pctX / 50) * (radarOverlay.offsetWidth / 2);
                                const pxY = (pctY / 50) * (radarOverlay.offsetHeight / 2);
                                blip.style.transform = `translate(${pxX}px, ${pxY}px)`;
                                blip.style.display = 'block';
                            }
                            
                            // Hide any extra blips
                            for (let i = e.data.enemies.length; i < existingBlips.length; i++) {
                                existingBlips[i].style.display = 'none';
                            }
                        }
                    } else if (e.data && e.data.type === 'PLAYER_MOVE_STATE') {
                        if (e.data.isMoving) {
                            document.body.classList.add('is-moving');
                            hideExitModal(); // Hide if player walks away
                            
                            const walk = avatarActions ? avatarActions.walk : null;
                            if (walk && avatarCurrentAction !== walk) {
                                walk.reset();
                                walk.setEffectiveTimeScale(1.0);
                                if (avatarCurrentAction) walk.crossFadeFrom(avatarCurrentAction, 0.3, true);
                                walk.play();
                                avatarCurrentAction = walk;
                            }
                        }
                        else {
                            document.body.classList.remove('is-moving');
                            if (avatarIdleAction && avatarCurrentAction !== avatarIdleAction) {
                                avatarIdleAction.reset();
                                const isWalkCycle = (avatarActions && avatarIdleAction === avatarActions.walk);
                                avatarIdleAction.setEffectiveTimeScale(isWalkCycle ? 0.05 : 1.0);
                                if (avatarCurrentAction) avatarIdleAction.crossFadeFrom(avatarCurrentAction, 0.3, true);
                                avatarIdleAction.play();
                                avatarCurrentAction = avatarIdleAction;
                            } else if (!avatarIdleAction && avatarCurrentAction) {
                                // Return to T-pose/idle freeze if no logical idle clip exists
                                avatarCurrentAction.fadeOut(0.3);
                                setTimeout(() => { if (avatarCurrentAction && avatarCurrentAction.getEffectiveWeight() === 0) avatarCurrentAction.stop(); avatarCurrentAction = null; }, 300);
                            }
                        }
                    } else if (e.data && e.data.type === 'SHOW_EXIT') {
                        showExitModal();
                    } else if (e.data && e.data.type === 'HIDE_EXIT') {
                        if(exitModalActive) hideExitModal();
                    }
                });
        
                // Viewport Readout Logic
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
                
                // Log System & Chat Input bindings
                window.logEvent = function(text, type = 'system') {
                    const container = document.getElementById('event-log-container');
                    if (!container) return;
                    
                    // Auto open panel for any system or combat dialogue so the user can actually see it!
                    if (type === 'chat' || type === 'system' || type === 'damage') {
                        container.classList.add('active');
                    }
                    
                    const entry = document.createElement('div');
                    entry.className = `log-entry ${type}`;
                    
                    let formattedText = text;
                    if (type === 'chat' && !formattedText.includes('"')) {
                        formattedText = `"${formattedText}"`;
                    }
                    entry.innerHTML = formattedText;
                    container.appendChild(entry);
                    // Cap history
                    while (container.childNodes.length > 50) container.removeChild(container.firstChild);
                    container.scrollTop = container.scrollHeight;
                };
        
                const chatInput = document.querySelector('.chat-input');
                if (chatInput) {
                    chatInput.addEventListener('focus', () => {
                        document.getElementById('event-log-container').classList.add('active');
                    });
                    chatInput.addEventListener('blur', () => {
                        // Delay collapse slightly to allow interaction. Only collapse if not in combat.
                        setTimeout(() => {
                            const ez = document.getElementById('encounter-zone');
                            if (!ez.classList.contains('active')) {
                                document.getElementById('event-log-container').classList.remove('active');
                            }
                        }, 200);
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
                }, 100); // Initial call after DOM paints
                updateViewportReadout();
            
        
        
            (function() {
                const urlParams = new URLSearchParams(window.location.search);
                const mode = urlParams.get('mode');
                
                // Only run PiP in Dock mode (the bottom full-screen iframe)
                if (mode !== 'dock') return;
        
                const pip = document.getElementById("moondial-wrapper");
                if (!pip) return;
                pip.style.display = 'block';
        
                const MIN_W = 200, MIN_H = 200;
                let dragging = false, mapRotating = false, mapPanning = false;
                let dragStart = { x: 0, y: 0, left: 0, top: 0 };
                let rotStart = { x: 0, y: 0 };
                let panStart = { x: 0, y: 0 };
        
                // Post to master router
                function post(msg) { window.postMessage(msg, '*'); }
        
                function syncRect() {
                    const wrapper = document.getElementById('pipCanvas');
                    if (wrapper) {
                        const r = wrapper.getBoundingClientRect();
                        post({ type: 'PIP_SYNC_RECT', width: r.width, height: r.height, left: r.left, top: r.top, bottom: r.bottom });
                    }
                }
                window.syncRect = syncRect;
        
                // Prevent context menu
                pip.addEventListener("contextmenu", e => { 
                    if (e.target.closest("#pipCanvas") || e.target === pip) e.preventDefault(); 
                });
                
                // Zoom via scroll wheel
                pip.addEventListener("wheel", (e) => {
                    if (e.target.closest("#pipCanvas")) {
                        e.preventDefault();
                        post({ type: 'PIP_ZOOM', delta: Math.sign(e.deltaY) });
                    }
                }, { passive: false });
        
                // Double-click to swap modes
                pip.addEventListener("dblclick", (e) => {
                     e.stopPropagation();
                     if (e.target.closest("#pipCanvas") || e.target === pip) {
                         post({ type: 'PIP_TOGGLE' });
                     }
                });
                
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
                    } else if (e.target === pip) {
                        if (e.button === 0) {
                            const rect = pip.getBoundingClientRect();
                            dragging = true;
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
                            if (state.left) pip.style.left = state.left;
                            if (state.right) pip.style.right = state.right;
                            if (state.top) pip.style.top = state.top;
                            if (state.bottom) pip.style.bottom = state.bottom;
                            if (state.width) pip.style.width = state.width;
                            if (state.height) pip.style.height = state.height;
                        }
                    } catch (e) { console.error('Failed to load PiP state', e); }
                    setTimeout(syncRect, 50);
                }
                
                window.loadPiPState = loadPiPState;
        
                function clampPiPIntoViewport(evaluateAnchors = false) {
                    const rect = pip.getBoundingClientRect();
                    const vw = window.innerWidth, vh = window.innerHeight;
                    
                    let isAnchorRight = pip.style.right && pip.style.right !== 'auto';
                    let isAnchorBottom = pip.style.bottom && pip.style.bottom !== 'auto';
                    
                    if (rect.right < 0 || rect.bottom < 0 || rect.left > vw || rect.top > vh) {
                        // Completely off-screen, reset to default safe position
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
                    
                    pip.style.left = isAnchorRight ? "auto" : safeLeft + "px";
                    pip.style.right = isAnchorRight ? safeRight + "px" : "auto";
                    pip.style.top = isAnchorBottom ? "auto" : safeTop + "px";
                    pip.style.bottom = isAnchorBottom ? safeBottom + "px" : "auto";
                    
                    syncRect();
                }
        
                const onDragMove = (e) => {
                    if (!dragging) return;
                    pip.style.left = (dragStart.left + (e.clientX - dragStart.x)) + "px";
                    pip.style.top = (dragStart.top + (e.clientY - dragStart.y)) + "px";
                    pip.style.right = "auto";
                    pip.style.bottom = "auto";
                    syncRect();
                };
                
                const onDragEnd = () => { 
                    dragging = false; 
                    pip.style.willChange = "auto"; 
                    pip.classList.remove("dragging"); 
                    clampPiPIntoViewport(true);
                    savePiPState();
                    document.removeEventListener("mousemove", onDragMove); 
                    document.removeEventListener("mouseleave", onDragEnd); 
                    window.removeEventListener("blur", onDragEnd); 
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
                    document.removeEventListener("mouseleave", onPanEnd); 
                    window.removeEventListener("blur", onPanEnd); 
                    // Clicks to move player
                    if (e && e.clientX && Math.hypot(e.clientX - panStart.x, e.clientY - panStart.y) < 5) {
                        const canvas = document.getElementById('pipCanvas');
                        if (!canvas) return;
                        const rect = canvas.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                        post({ type: 'PIP_CLICK', x, y });
                    }
                };
        
                // Resizing logic
                let resizing = false, currentHandle = "";
                let rStart = { x: 0, y: 0, w: 0, h: 0, l: 0, t: 0 };
                
                pip.querySelectorAll(".resize-handle").forEach((handle) => {
                    handle.addEventListener("mousedown", (e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        resizing = true;
                        currentHandle = handle.className.split(" ")[1];
                        const rect = pip.getBoundingClientRect();
                        rStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, l: rect.left, t: rect.top };
                        pip.classList.add("resizing");
                        pip.style.transition = "none";
                        pip.style.right = "auto";
                        pip.style.left = rect.left + "px"; pip.style.top = rect.top + "px";
                        document.addEventListener("mousemove", onResizeMove);
                        document.addEventListener("mouseup", onResizeEnd, { once: true });
                        document.addEventListener("mouseleave", onResizeEnd, { once: true });
                        window.addEventListener("blur", onResizeEnd, { once: true });
                    });
                });
                
                const onResizeMove = (e) => {
                    if (!resizing) return;
                    const dx = e.clientX - rStart.x, dy = e.clientY - rStart.y;
                    let nw = rStart.w, nh = rStart.h, nl = rStart.l, nt = rStart.t;
                    if (currentHandle.includes("e")) nw += dx;
                    if (currentHandle.includes("s")) nh += dy;
                    if (currentHandle.includes("w")) { nw -= dx; nl += dx; }
                    if (currentHandle.includes("n")) { nh -= dy; nt += dy; }
                    
                    if (nw < MIN_W) { nl -= (MIN_W - nw) * (currentHandle.includes("w") ? 1 : 0); nw = MIN_W; }
                    if (nh < MIN_H) { nt -= (MIN_H - nh) * (currentHandle.includes("n") ? 1 : 0); nh = MIN_H; }
                    
                    pip.style.width = nw + "px"; pip.style.height = nh + "px";
                    pip.style.left = nl + "px"; pip.style.top = nt + "px";
                    
                    // Sync new dimensions for WebGL resolution matching
                    syncRect();
                };
                const onResizeEnd = () => { 
                    resizing = false; pip.classList.remove("resizing"); 
                    clampPiPIntoViewport(); savePiPState(); syncRect(); 
                    document.removeEventListener("mousemove", onResizeMove); 
                    document.removeEventListener("mouseleave", onResizeEnd); 
                    window.removeEventListener("blur", onResizeEnd); 
                };
                
                // Initialize
                loadPiPState();
                clampPiPIntoViewport(true);
                // Give layout a tick before measuring rect
                setTimeout(syncRect, 100);
                
                // Use ResizeObserver for perfect sync during ANY layout shifts, flex reflows, or browser resizes
                const ro = new ResizeObserver(() => {
                    clampPiPIntoViewport();
                    syncRect();
                });
                ro.observe(document.body);
                if (pip) ro.observe(pip);
                
            })();
            
            window.rollDiceAnimation = function(betIsEven, amount) {
                const logContainer = document.getElementById('event-log-container');
                if (!logContainer.classList.contains('show')) {
                    window.emitAction('LOG'); // toggle it open if closed
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
        
                // Create 2 dice
                const diceGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
                const diceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
                const die1 = new THREE.Mesh(diceGeo, diceMat);
                const die2 = new THREE.Mesh(diceGeo, diceMat);
                
                // Add green/red dots just like the main UI dice to make them look nice
                const dotMat = new THREE.MeshStandardMaterial({color: 0x111111});
                const dotGeo = new THREE.CircleGeometry(0.15, 16);
                const addDot = (mesh, x, y, z, rx, ry) => {
                    const dot = new THREE.Mesh(dotGeo, dotMat);
                    dot.position.set(x,y,z);
                    dot.rotation.set(rx,ry,0);
                    mesh.add(dot);
                };
                // Just add one dot on each face for aesthetics
                addDot(die1, 0, 0, 0.61, 0, 0); addDot(die1, 0, 0, -0.61, 0, Math.PI);
                addDot(die1, 0.61, 0, 0, 0, Math.PI/2); addDot(die1, -0.61, 0, 0, 0, -Math.PI/2);
                addDot(die1, 0, 0.61, 0, -Math.PI/2, 0); addDot(die1, 0, -0.61, 0, Math.PI/2, 0);
                
                addDot(die2, 0, 0, 0.61, 0, 0); addDot(die2, 0, 0, -0.61, 0, Math.PI);
                addDot(die2, 0.61, 0, 0, 0, Math.PI/2); addDot(die2, -0.61, 0, 0, 0, -Math.PI/2);
                addDot(die2, 0, 0.61, 0, -Math.PI/2, 0); addDot(die2, 0, -0.61, 0, Math.PI/2, 0);
        
                scene.add(die1, die2);
        
                let startTime = performance.now();
                let duration = 1800; // 1.8 seconds bounce
                
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
                        
                        window.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `Rolled ${roll1} and ${roll2} (Total: ${sum})` }, '*');
                        window.postMessage({ type: 'WAGER_RESOLVE', win: win, amount: amount }, '*');
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
        
        
        
    }
}
