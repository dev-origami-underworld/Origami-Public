import { TextureMethods } from './Textures.js';
import { WorldMethods } from './World.js';
import { Config } from './Config.js';
import { InputSystem } from './InputSystem.js';
import { CombatSystem } from './Combat.js';
import { CardDatabase } from './CardRegistry.js';
import { PhysicsSystem } from './Physics.js';

/**
 * CORE GAME ENGINE (Three.js integration + Application Coordinator)
 */
const Engine = {
    // State
    player: { x: 5, z: 5, rot: 0, autoTurnTarget: null },
    get gridSize() { return Config.gridSize; },
    get mapWidth() { return Config.mapWidth; },
    get mapHeight() { return Config.mapHeight; },
            headlamp: null,
            outerGlow: null,
            clock: null,
            mixers: [],
            activeTarget: null, // NPC or Monster we are adjacent to
            frameCount: 0,
            
            activeChat: null,
            
            spawnChatBubble(enText, jpText, targetMesh) {
                if (this.activeChat) {
                    if (this.activeChat.mesh) {
                        this.scene.remove(this.activeChat.mesh);
                        if (this.activeChat.mesh.children) {
                            this.activeChat.mesh.children.forEach(c => {
                                if (c.material && c.material.map) c.material.map.dispose();
                                if (c.material) c.material.dispose();
                                if (c.geometry) c.geometry.dispose();
                            });
                        }
                    }
                    this.activeChat = null;
                }

                const canvas = document.createElement('canvas');
                canvas.width = 1000;
                canvas.height = 1000;
                const ctx = canvas.getContext('2d');

                ctx.clearRect(0, 0, 1000, 1000);

                let enFontSize = 100;
                let enLines = [];
                let enLineHeight = 0;
                let enTotalHeight = 0;

                const MAX_WIDTH = 700;
                const MAX_HEIGHT = 450;
                
                // Scale English text until it fits
                while (true) {
                    ctx.font = `900 ${enFontSize}px "Impact", sans-serif`;
                    const words = enText.split(' ');
                    enLines = [];
                    let currentLine = words[0];

                    for (let i = 1; i < words.length; i++) {
                        const word = words[i];
                        const width = ctx.measureText(currentLine + " " + word).width;
                        if (width < MAX_WIDTH) {
                            currentLine += " " + word;
                        } else {
                            enLines.push(currentLine);
                            currentLine = word;
                        }
                    }
                    if (currentLine) enLines.push(currentLine);

                    enLineHeight = enFontSize * 1.15;
                    enTotalHeight = enLines.length * enLineHeight;
                    
                    if (enTotalHeight <= MAX_HEIGHT || enFontSize <= 24) {
                        let maxWordWidth = 0;
                        for (let l of enLines) {
                            maxWordWidth = Math.max(maxWordWidth, ctx.measureText(l).width);
                        }
                        if (maxWordWidth <= MAX_WIDTH || enFontSize <= 24) {
                            break;
                        }
                    }
                    enFontSize -= 2;
                }

                // Japanese Font sizing
                let jpFontSize = Math.min(32, enFontSize * 0.5);
                ctx.font = `bold ${jpFontSize}px sans-serif`;
                let jpLines = [];
                let currentJpLine = "";
                for (let char of (jpText || "")) {
                    let w = ctx.measureText(currentJpLine + char).width;
                    if (w < MAX_WIDTH * 0.95) {
                        currentJpLine += char;
                    } else {
                        jpLines.push(currentJpLine);
                        currentJpLine = char;
                    }
                }
                if (currentJpLine) jpLines.push(currentJpLine);
                
                let jpLineHeight = jpFontSize * 1.4;
                let jpTotalHeight = jpLines.length > 0 ? (jpLines.length * jpLineHeight) : 0;
                
                let totalContentHeight = enTotalHeight + (jpText ? (jpTotalHeight + 30) : 0);
                
                // Draw English Text
                ctx.fillStyle = '#000000';
                ctx.font = `900 ${enFontSize}px "Impact", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                let startY = 500 - (totalContentHeight / 2) + (enFontSize / 2);
                let currentY = startY;
                
                for (let i = 0; i < enLines.length; i++) {
                    ctx.fillText(enLines[i], 500, currentY);
                    currentY += enLineHeight;
                }

                if (jpText) {
                    currentY += (jpFontSize / 2);
                    ctx.fillStyle = '#444444';
                    ctx.font = `bold ${jpFontSize}px sans-serif`;
                    ctx.textBaseline = 'top';
                    for (let i = 0; i < jpLines.length; i++) {
                        ctx.fillText(jpLines[i], 500, currentY);
                        currentY += jpLineHeight;
                    }
                }

                const texture = new THREE.CanvasTexture(canvas);
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;

                const textMaterial = new THREE.MeshBasicMaterial({ 
                    map: texture, 
                    transparent: true,
                    depthTest: false,
                    depthWrite: false,
                    fog: false
                });

                // Perfect 2D Billboard Text Mesh
                const geometryPlane = new THREE.PlaneGeometry(2.6, 2.6);
                const textMesh = new THREE.Mesh(geometryPlane, textMaterial);
                textMesh.position.z = 0.50; // Push text firmly in front of the puffiest part of the balloon
                textMesh.renderOrder = 1000;

                // Custom 3D Comic Balloon Shape using ExtrudeGeometry
                const shape = new THREE.Shape();
                const bWidth = 5.0;   
                const bHeight = 4.0;  
                const bRad = 0.8; // Cartoon curvy
                const tWidth = 0.6;
                const tHeight = 0.6; // Tiny tail brings the bubble down drastically
                const tOffset = -1.0; 

                // Start top left
                shape.moveTo(-bWidth/2 + bRad, bHeight/2);
                shape.lineTo(bWidth/2 - bRad, bHeight/2);
                shape.quadraticCurveTo(bWidth/2, bHeight/2, bWidth/2, bHeight/2 - bRad);
                shape.lineTo(bWidth/2, -bHeight/2 + bRad);
                shape.quadraticCurveTo(bWidth/2, -bHeight/2, bWidth/2 - bRad, -bHeight/2);
                
                // Tail pointing diagonally left towards the mouth
                shape.lineTo(tOffset + tWidth/2, -bHeight/2);
                shape.lineTo(tOffset - 2.5, -bHeight/2 - tHeight); // Tip 
                shape.lineTo(tOffset - tWidth/2, -bHeight/2);
                
                shape.lineTo(-bWidth/2 + bRad, -bHeight/2);
                shape.quadraticCurveTo(-bWidth/2, -bHeight/2, -bWidth/2, -bHeight/2 + bRad);
                shape.lineTo(-bWidth/2, bHeight/2 - bRad);
                shape.quadraticCurveTo(-bWidth/2, bHeight/2, -bWidth/2 + bRad, bHeight/2);

                const extrudeSettings = {
                    steps: 1,
                    depth: 0.25,
                    bevelEnabled: true,
                    bevelThickness: 0.35, // Thick pill bevels
                    bevelSize: 0.3, 
                    bevelOffset: 0,
                    bevelSegments: 16 // Very smooth curves
                };

                const balloonGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                
                // Flat Material totally bypasses Post-Process Bloom and Lighting Washouts!
                const balloonMat = new THREE.MeshBasicMaterial({ 
                    color: 0xf5f5f5,
                    depthWrite: false,
                    depthTest: false, // Forces it strictly on-top like UI
                    transparent: false,
                    fog: false
                });

                const balloonMesh = new THREE.Mesh(balloonGeo, balloonMat);
                balloonMesh.renderOrder = 9998;
                
                // Cartoon outline
                const edgesGeo = new THREE.EdgesGeometry(balloonGeo, 15);
                const edgesMat = new THREE.LineBasicMaterial({ 
                    color: 0x000000, 
                    linewidth: 4,
                    depthTest: false,
                    depthWrite: false
                });
                const outlineMesh = new THREE.LineSegments(edgesGeo, edgesMat);
                outlineMesh.renderOrder = 9998;
                balloonMesh.add(outlineMesh);
                
                // -4.0/2 - 0.6 = -2.6. Shift Y by +2.6 to pin the tip to Origin.
                balloonMesh.position.set(3.5, 2.6, -0.25);
                textMesh.position.set(3.5, 2.6, 0.60);
                
                const group = new THREE.Group();
                group.add(balloonMesh);
                group.add(textMesh);
                group.renderOrder = 9999;
                
                group.scale.set(0.54, 0.54, 0.54);
                
                this.scene.add(group);

                this.activeChat = {
                    mesh: group,
                    target: targetMesh,
                    expires: Infinity,
                    fading: false
                };
            },
            
            triggerCombatSequence(target) {
                if (!target || target.userData.combatIntroTriggered) return;
                target.userData.combatIntroTriggered = true;

                // Goblin is engaged! Float up aggressively in place, but DO NOT retreat backwards.
                // Retreating 2 grids physically pushed the monster out of the 30-ft tactical UI engagement boundary!
                target.userData.isRetreating = false;
                target.userData.targetY = 1.0; // Trigger physical levitation smoothly without lateral movement
            },

            executeMeleeAttack(target) {
                if (!target) return;
                
                target.userData.stateColor = '#ff0000'; // Red for attack
                this.triggerCombatSequence(target);
                this.spawnAttackCrosshair(target);
                
                // Clear chat bubble explicitly
                if (this.activeChat) {
                    this.scene.remove(this.activeChat.mesh);
                    this.activeChat = null;
                }
                
                const now = performance.now();
                if (!this.lastAttackTime || (now - this.lastAttackTime > 600)) {
                    this.lastAttackTime = now;
                    
                    const rolls = ["CRIT!", "HIT!", "GLANCING", "DODGE"];
                    const types = ["crit", "hit", "hit", "miss"];
                    const dmg = Math.floor(Math.random() * 4) + 1; // 1-4 pts
                    
                    const rIdx = Math.floor(Math.random() * rolls.length);
                    if (rIdx <= 1) {
                        CombatSystem.spawnCombatText(`${rolls[rIdx]} ${dmg * (rIdx===1 ? 2 : 1)}`, types[rIdx]);
                    } else {
                        CombatSystem.spawnCombatText(rolls[rIdx], types[rIdx]);
                    }
                    
                    // Forward the attack to the AI Brain
                    this.postToAI({ type: 'PLAYER_ATTACK', targetId: target.userData.id });
                }
            },
            
            lastFpsTime: 0,
            currentFps: 0,
            
            // Global Live FX Configuration (dat.gui)
            fxConfig: {
                // Glass & Transparency
                baseOpacity: 0.40,
                transmission: 0.0,
                roughness: 0.1,
                ior: 1.5,
                thickness: 0.5,
                
                // Emissive properties
                emissiveIntensity: 0.6,
                emissiveColor: "#00ffcc",

                // Outline properties
                edgeStrength: 8.0,
                edgeGlow: 3.0,
                edgeThickness: 4.0,
                visibleColor: "#00ccff",
                hiddenColor: "#00ccff",
                
                // Bloom properties
                bloomRadius: 0.6,
                bloomStrength: 0.8
            },

            // Config
            MOVE_SPEED: 1.82, // Reset to baseline requested by user
            ROT_SPEED: 2.2,  // Radians per second
            BOB_AMP: 0.045,  // Vertical bounce height
            SWAY_AMP: 0.015, // Horizontal sway width
            
            keys: { w: false, a: false, s: false, d: false },
            isMoving: false,
            lastGridX: -1,
            lastGridZ: -1,
            wasIdle: true,
            bobTimer: 0,     // Tracks head-bob animation
            bobHeight: 0,    // Current vertical offset
            bobSway: 0,      // Current horizontal offset
            gameTime: 0,     // Custom accumulator for turn-based time-stop effect
            
            composer: null,
            bloomPass: null,
            rgbShiftPass: null,

            init() {
                this.generateMap();
                this.initWebGL();
                this.initControls();
                this.initComms();
                this.initTuningUI();
                
                this.clock = new THREE.Clock();
                this.mixers = [];
                this.physics = new PhysicsSystem(this);
                
                // Initialize layout cache
                this.layoutData = { fpv: null };

                // Expose a direct update method for the Shell to call
                window.updateLayoutData = (data) => {
                    this.layoutData = data;
                };

                // Start Render Loop ONLY after assets are completely loaded to prevent pop-in
                THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
                    const percent = (itemsLoaded / itemsTotal) * 100;
                    const fill = document.getElementById('loading-bar-fill');
                    if (fill) fill.style.width = percent + '%';
                    
                    const text = document.getElementById('loading-text');
                    if (text) text.innerText = Math.round(percent) + '%';
                    
                    const file = document.getElementById('loading-file');
                    if (file) {
                        const filename = url.split('/').pop().split('?')[0];
                        file.innerText = `Loading: ${filename}`;
                    }
                };
                
                THREE.DefaultLoadingManager.onLoad = () => {
                    const screen = document.getElementById('loading-screen');
                    if (screen) {
                        screen.style.opacity = '0';
                        setTimeout(() => { if (screen.parentNode) screen.parentNode.removeChild(screen); }, 500);
                    }
                    // Start rendering now that the scene is fully populated
                    requestAnimationFrame(() => this.animate());
                };
            },
            
            // Uniformly scale an object so its total height equals targetHeight (in world units)
            // Ported directly from Baseline.Origami..html to fix microscopic 3D model exports
            scaleModelToHeight(object3D, targetHeight) {
                if (!object3D) return 1;
                object3D.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(object3D);
                const currentHeight = Math.max(1e-6, box.max.y - box.min.y);
                const s = targetHeight / currentHeight;
                object3D.scale.multiplyScalar(s);
                object3D.updateMatrixWorld(true);
                return s;
            },

            initTuningUI() {
                const sSpeed = document.getElementById('tune-speed');
                const vSpeed = document.getElementById('val-speed');
                sSpeed.addEventListener('input', (e) => {
                    this.MOVE_SPEED = parseFloat(e.target.value);
                    vSpeed.textContent = this.MOVE_SPEED.toFixed(2);
                });

                const sBob = document.getElementById('tune-bob');
                const vBob = document.getElementById('val-bob');
                sBob.addEventListener('input', (e) => {
                    this.BOB_AMP = parseFloat(e.target.value);
                    vBob.textContent = this.BOB_AMP.toFixed(3);
                });

                const sSway = document.getElementById('tune-sway');
                const vSway = document.getElementById('val-sway');
                sSway.addEventListener('input', (e) => {
                    this.SWAY_AMP = parseFloat(e.target.value);
                    vSway.textContent = this.SWAY_AMP.toFixed(3);
                });
            },

            generateMap() {
                // Room definitions for future dungeon editing
                const DUNGEON_ROOMS_SCHEMA = [
                  {
                    "id": 1,
                    "name": "Large Chamber",
                    "description": "A grand hall with multiple exits, echoing with ancient magic.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [10,5]},
                      {"direction": "east", "position": [5,10]}
                    ],
                    "triggers": [
                      {"position": [5,5], "action": "update_narrative", "value": "You enter a grand hall, its walls pulsing with arcane energy."}
                    ]
                  },
                  {
                    "id": 2,
                    "name": "Storage Room",
                    "description": "A cluttered room with a dusty chest in the center.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "chest", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "A dusty chest sits in the center, whispering secrets."}
                    ]
                  },
                  {
                    "id": 3,
                    "name": "Statue Room",
                    "description": "A solemn chamber with a statue of a fallen priest.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "statue", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "The statue's eyes seem to follow you."}
                    ]
                  },
                  {
                    "id": 4,
                    "name": "Trap Room",
                    "description": "A dangerous room with a hidden trap.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "trap", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "A trap clicks beneath your feet!"}
                    ]
                  },
                  {
                    "id": 5,
                    "name": "Altar Room",
                    "description": "A mystical room with a glowing altar.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "altar", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [5,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "The altar hums with dark energy."}
                    ]
                  },
                  {
                    "id": 6,
                    "name": "Library",
                    "description": "A dusty room filled with ancient tomes.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "chest", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [8,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "Ancient tomes whisper forgotten lore."}
                    ]
                  },
                  {
                    "id": 7,
                    "name": "Throne Room",
                    "description": "A regal hall with a crumbling throne.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "statue", "floor", "floor", "floor", "ascended", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [10,5]}
                    ],
                    "triggers": [
                      {"position": [5,5], "action": "update_narrative", "value": "The throne crumbles under the weight of time."}
                    ]
                  },
                  {
                    "id": 8,
                    "name": "Prison Cell",
                    "description": "A dank cell with iron bars.",
                    "grid": [
                      ["wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "wall"],
                      ["wall", "door", "floor", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [4,2]}
                    ],
                    "triggers": [
                      {"position": [2,2], "action": "update_narrative", "value": "The cell reeks of despair."}
                    ]
                  },
                  {
                    "id": 9,
                    "name": "Garden",
                    "description": "An overgrown garden with magical plants.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "altar", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [8,3]}
                    ],
                    "triggers": [
                      {"position": [4,4], "action": "update_narrative", "value": "Magical plants sway in an eerie breeze."}
                    ]
                  },
                  {
                    "id": 10,
                    "name": "Forge",
                    "description": "A hot forge with glowing embers.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "chest", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "door", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "south", "position": [7,3]}
                    ],
                    "triggers": [
                      {"position": [3,3], "action": "update_narrative", "value": "The forge's heat is overwhelming."}
                    ]
                  },
                  {
                    "id": 11,
                    "name": "Straight Hallway",
                    "description": "A long, straight corridor.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The corridor stretches endlessly."}
                    ]
                  },
                  {
                    "id": 12,
                    "name": "L-Shaped Hallway",
                    "description": "A corridor with a sharp bend.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "wall", "door", "wall"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,9]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The corridor turns sharply."}
                    ]
                  },
                  {
                    "id": 13,
                    "name": "T-Shaped Hallway",
                    "description": "A corridor splitting into three paths.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]},
                      {"direction": "north", "position": [1,5]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "Three paths diverge ahead."}
                    ]
                  },
                  {
                    "id": 14,
                    "name": "Crossroads Hallway",
                    "description": "A corridor with four paths.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "door", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]},
                      {"direction": "north", "position": [1,5]},
                      {"direction": "south", "position": [2,5]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "A crossroads offers multiple choices."}
                    ]
                  },
                  {
                    "id": 15,
                    "name": "Narrow Passage",
                    "description": "A tight, claustrophobic hallway.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The walls close in tightly."}
                    ]
                  },
                  {
                    "id": 16,
                    "name": "Wide Hallway",
                    "description": "A spacious corridor for large groups.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"],
                      ["wall", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "wall"],
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "The wide hall echoes with footsteps."}
                    ]
                  },
                  {
                    "id": 17,
                    "name": "Secret Passage",
                    "description": "A hidden corridor behind a wall.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "A secret passage reveals itself."}
                    ]
                  },
                  {
                    "id": 18,
                    "name": "Trapped Corridor",
                    "description": "A hallway rigged with traps.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "trap", "floor", "floor", "trap", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,3], "action": "update_narrative", "value": "A trap springs to life!"},
                      {"position": [2,6], "action": "update_narrative", "value": "Another trap clicks nearby!"}
                    ]
                  },
                  {
                    "id": 19,
                    "name": "Patrolled Corridor",
                    "description": "A hallway guarded by enemies.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "You hear the footsteps of guards."}
                    ]
                  },
                  {
                    "id": 20,
                    "name": "Collapsed Corridor",
                    "description": "A hallway blocked by rubble.",
                    "grid": [
                      ["wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
                      ["door", "floor", "floor", "floor", "chest", "floor", "floor", "floor", "floor", "door"]
                    ],
                    "doors": [
                      {"direction": "west", "position": [2,1]},
                      {"direction": "east", "position": [2,10]}
                    ],
                    "triggers": [
                      {"position": [2,5], "action": "update_narrative", "value": "Rubble blocks part of the path."}
                    ]
                  }
                ];
                
                // Initialize rich grid map architecture [x][z]
                // Initialize rich grid map architecture [x][z]
                this.mapData = Array.from({ length: this.mapWidth }, () => Array.from({ length: this.mapHeight }, () => ({ type: 'wall' })));
                this.rooms = [];
                // STATIC HALLWAY SANDBOX (AS REQUESTED)
                // 1. Single massive 7x7 room at the North end
                const roomSize = 7;
                const rStartX = Math.floor(this.mapWidth / 2) - 3;
                const rStartZ = 5;
                
                this.rooms = [{
                    id: 1, 
                    x: rStartX, 
                    y: rStartZ, 
                    w: roomSize, 
                    h: roomSize, 
                    center: { x: rStartX + 3, y: rStartZ + 3 }
                }];
                
                for(let ry = rStartZ; ry < rStartZ + roomSize; ry++) {
                    for(let rx = rStartX; rx < rStartX + roomSize; rx++) {
                        this.mapData[rx][ry] = { type: 'floor', room: true, roomId: 1 };
                    }
                }
                
                // 2. Straight 7-tile hallway leading South from the room's bottom center
                const hallX = this.rooms[0].center.x;
                const hallStartTopZ = rStartZ + roomSize;
                
                for(let i = 0; i < 7; i++) {
                    this.mapData[hallX][hallStartTopZ + i] = { type: 'floor', hallway: true };
                }
                
                // Entrance exactly at the end of the hallway
                const entrancePos = { x: hallX, y: hallStartTopZ + 6 };
                this.mapData[entrancePos.x][entrancePos.y] = { type: 'entrance' };
                this.mapData[entrancePos.x][entrancePos.y + 1] = { type: 'wall' }; // Blocking wall behind it
                
                // Move Player to entrance, facing North (0 rotation)
                this.player.x = entrancePos.x;
                this.player.z = entrancePos.y;
                this.player.rot = 0;
                this.player.hp = 10;
                this.player.maxHp = 10;
                
                // Parse entity spawn points
                this.mobSpawns = [];
                const floorTiles = [];
                for(let x=0; x<this.mapWidth; x++) {
                    for(let z=0; z<this.mapHeight; z++) {
                        if(this.mapData[x][z] && this.mapData[x][z].type === 'floor') {
                            floorTiles.push({x, z});
                        }
                    }
                }
                
                // Spawn 1 Target exactly in the center of the sandbox room
                this.mobSpawns.push({ 
                    type: 'goblin', 
                    x: this.rooms[0].center.x, 
                    z: this.rooms[0].center.y, 
                    homeX: this.rooms[0].center.x, 
                    homeZ: this.rooms[0].center.y, 
                    speed: 8.0, 
                    state: 'IDLE', searchTimer: 0 
                });
            },

            carveFuzzyHallway(start, end) {
                // Kept for signature compatibility if MapEngine relies on parsing this script directly
            },

            initWebGL() {
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x0a0a0c);
                // Fog must remain for Shader compilation, but we set it very thin/far
                this.scene.fog = new THREE.FogExp2(0x2a2a2a, 0.005);

                // Base FOV narrowed from 75 down to 52 for a dramatic 30% zoom scale
                this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
                this.camera.position.set(this.player.x * this.gridSize, 1.6, this.player.z * this.gridSize); // Eye level
                this.camera.layers.enable(1); // Ensure FPV camera can see the ceiling (Layer 1)
                this.camera.rotation.y = this.player.rot;

                const canvas = document.getElementById('fpv-canvas');
                this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for perf
                
                // Shift Optical Center UP by 150px so the Monster is not blocked by the UI panels at the bottom
                // Arguments: (fullWidth, fullHeight, xOffset, yOffset, width, height)
                this.camera.setViewOffset(window.innerWidth, window.innerHeight, 0, 150, window.innerWidth, window.innerHeight);
                
                // Bloom removed completely based on user feedback
                
                // Setup Layers
                // Layer 0: Default (Walls, Floors, Lights)
                // Layer 1: Ceiling (Hidden from map)
                this.camera.layers.enable(1); // FPV sees ceiling
                
                // --- Baseline Lighting ---
                // Cinematic lighting: cooler sky, warmer key, subtle rim (Darkened by 25%)
                const hemisphereLight = new THREE.HemisphereLight(0x88aaff, 0x202228, 0.315);
                this.scene.add(hemisphereLight);
                
                // Warm key directional light for depth and shadows
                const dirLight = new THREE.DirectionalLight(0xfff0d0, 0.498);
                dirLight.position.set(30, 60, 10);
                this.scene.add(dirLight);
                
                // Cool rim light from behind for silhouette separation
                const rimLight = new THREE.DirectionalLight(0x99bbff, 0.183);
                rimLight.position.set(-20, 40, -30);
                this.scene.add(rimLight);
                
                // Base ambient light to prevent pitch black MeshStandardMaterial (walls/floors are basic mat so they remain dark)
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.22);
                this.scene.add(ambientLight);
                
                // Player Flashlight
                const headlamp = new THREE.SpotLight(0xfff8e0, 0.1, this.gridSize * 14, Math.PI / 6.8, 0.45, 1.1); // Dropped brightness to prevent washout
                headlamp.position.set(0, 0, 0);
                headlamp.target.position.set(0, 0, -1);
                
                const outerGlow = new THREE.SpotLight(0xffffff, 0.0, this.gridSize * 20, Math.PI / 8, 0.2, 0.8); // Zeroed out to prevent massive white bloom semicircle
                outerGlow.position.set(0, 0, 0);
                outerGlow.target.position.set(0, 0, -1);
                
                this.camera.add(headlamp);
                this.camera.add(headlamp.target);
                this.camera.add(outerGlow);
                this.camera.add(outerGlow.target);
                
                this.scene.add(this.camera); // Add camera to scene so child components render
                
                // Keep reference for flickering effect in animate()
                this.headlamp = headlamp;
                this.outerGlow = outerGlow;
                


                // -----------------------------------------------------
                // GHOSTBUSTER POST-PROCESSING PIPELINE
                // -----------------------------------------------------
                this.composer = new THREE.EffectComposer(this.renderer);
                this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

                // 1. Unreal Bloom Pass (Core Phantom Glow for SSS look and bright eyes)
                this.bloomPass = new THREE.UnrealBloomPass(
                  new THREE.Vector2(window.innerWidth, window.innerHeight),
                  0.16, // strength (reduced 80% to stop FPV washout / FPS drop)
                  0.4, // radius
                  0.95, // threshold (raised so only true HDR glows)
                );
                this.composer.addPass(this.bloomPass);

                // 2. Outline Pass (Neon Luminous Border around enemies)
                this.outlinePass = new THREE.OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene, this.camera);
                this.outlinePass.edgeStrength = 4.0; // Reduced for subtle glow
                this.outlinePass.edgeGlow = 1.1; // Increased by 10% per user request
                this.outlinePass.edgeThickness = 1.1; // Increased by 10% per user request
                this.outlinePass.pulsePeriod = 0;
                
                // Outline edges kept in LDR range so they don't blow out the bloom pass
                this.outlinePass.visibleEdgeColor.setRGB(0, 0.9, 0.7); 
                this.outlinePass.hiddenEdgeColor.setRGB(0, 0.9, 0.7);
                
                // CRITICAL FIX: Three.js r128 OutlinePass materials do NOT support skinning by default!
                // This causes the outline to freeze in T-Pose when approaching the camera.
                if (this.outlinePass.prepareMaskMaterial) this.outlinePass.prepareMaskMaterial.skinning = true;
                if (this.outlinePass.depthMaterial) this.outlinePass.depthMaterial.skinning = true;
                if (this.outlinePass.renderMaterial) this.outlinePass.renderMaterial.skinning = true;
                
                this.composer.addPass(this.outlinePass);

                window.addEventListener('resize', () => {
                    this.camera.aspect = window.innerWidth / window.innerHeight;
                    
                    // Maintain the 150px optical shift dynamically upon resize
                    this.camera.setViewOffset(window.innerWidth, window.innerHeight, 0, 150, window.innerWidth, window.innerHeight);
                    
                    if (this.renderer) {
                        this.renderer.setSize(window.innerWidth, window.innerHeight);
                        this.composer.setSize(window.innerWidth, window.innerHeight);
                        if (this.outlinePass) this.outlinePass.setSize(window.innerWidth, window.innerHeight);
                    }
                });

                this.clock = new THREE.Clock();
                this.mixers = [];
                this.raycaster = new THREE.Raycaster(); // Initialize raycaster here
                this.buildWorldGeometry();
            },

            // --- Baseline Procedural Textures ---
            makePaperTexture(baseColor) { return TextureMethods.makePaperTexture.call(this, baseColor); },
            createDungeonFloorTexture() { return TextureMethods.createDungeonFloorTexture.call(this); },
            createDungeonWallTexture() { return TextureMethods.createDungeonWallTexture.call(this); },
            createDarkWoodRafterTexture() { return TextureMethods.createDarkWoodRafterTexture.call(this); },
            createStatusCircleTexture(color, blink = false, splitColor = null) { return TextureMethods.createStatusCircleTexture.call(this, color, blink, splitColor); },
            getCachedCircleTexture(color, blink = false, splitColor = null) { return TextureMethods.getCachedCircleTexture.call(this, color, blink, splitColor); },

            buildWorldGeometry() { WorldMethods.buildWorldGeometry.call(this); },
            initControls() { WorldMethods.initControls.call(this); },
            checkCollision(gx, gz, radius) { return WorldMethods.checkCollision.call(this, gx, gz, radius); },
            isValidGridSpace(cx, cz) { return WorldMethods.isValidGridSpace.call(this, cx, cz); },
            checkGridLoS(x1, z1, x2, z2) { return WorldMethods.checkGridLoS.call(this, x1, z1, x2, z2); },

            // Pre-allocated Global Vectors for checkTriggers GC optimization
            _ct_mPos: new THREE.Vector3(),
            _ct_cPos: new THREE.Vector3(),
            _ct_dirFromPlayer3D: new THREE.Vector3(),
            _ct_camDir: new THREE.Vector3(),

            checkTriggers() {
                // Calculate the exact grid coordinate 1 tile directly in front of the player
                const dirX = Math.round(-Math.sin(this.player.rot));
                const dirZ = Math.round(-Math.cos(this.player.rot));
                const playerGridX = Math.round(this.player.x);
                const playerGridZ = Math.round(this.player.z);
                
                const targetX = playerGridX + dirX;
                const targetZ = playerGridZ + dirZ;

                let foundNPC = null;
                let foundMonster = null;
                let closestDist = Infinity;
                let glowingTargets = []; // Array to hold targets that should glow
                
                // Scan worldGroup for entities at the target location (forgiving distance check)
                if (this.worldGroup) {
                    for (const child of this.worldGroup.children) {
                        if (child.userData && child.userData.id) {
                            const eX = child.position.x / this.gridSize;
                            const eZ = child.position.z / this.gridSize;
                            
                            // Check distance instead of exact grid match since models sit at exact center
                            const dist = Math.hypot(this.player.x - eX, this.player.z - eZ);
                            
                            // True 3D FPV calculations utilizing Global vectors to prevent GC spills
                            this._ct_mPos.copy(child.position);
                            this._ct_mPos.y += 1.0;
                            this._ct_cPos.copy(this.camera.position);
                            const dist3D = this._ct_cPos.distanceTo(this._ct_mPos);
                            
                            // CRITICAL FIX: Convert both vectors to pure 2D (X/Z plane) to prevent steep height angles killing the dot product when entities are right in front of the player
                            this._ct_dirFromPlayer3D.set(child.position.x - this.camera.position.x, 0, child.position.z - this.camera.position.z).normalize();
                            this.camera.getWorldDirection(this._ct_camDir);
                            this._ct_camDir.y = 0;
                            this._ct_camDir.normalize();
                            const dot = this._ct_camDir.dot(this._ct_dirFromPlayer3D);
                            
                            let panelHasLoS = false;
                            
                            // Tactical RPG Distance Rules:
                            // 1. The combat panels ready themselves when a monster is close (<= 10.0 tiles)
                            // 2. You must be facing the monster (dot > 0.4)
                            let makesCombat = false;
                            
                            // Once locked, it stays locked up to 8 tiles for retreat/recoil, but ONLY if still in view
                            const isActiveTarget = this.activeTarget && this.activeTarget.userData.id === child.userData.id;
                            
                            if (isActiveTarget && dist <= 8.0 && dot > 0.25) {
                                makesCombat = true; 
                            } else if (dist <= 5.0 && dot > 0.707) {
                                makesCombat = true; 
                            }
                            
                            // 30-Foot Chat Bubble Halt (4.0 tiles = 30 feet)
                            if (dist <= 4.0 && dot > 0.707 && child.userData.type === 'enemy') {
                                if (!child.userData.chatSpawned) {
                                    child.userData.chatSpawned = true;
                                    this.spawnChatBubble(
                                        "Stop Fool!  Where do you think you're going?   Make a wager or duel - your choice.  Its a fool's wager!",
                                        "止まれ、愚か者め！どこへ行くつもりだ？ 賭けをするか、決闘をするか…選べ。 愚か者の賭けだがな！",
                                        child
                                    );
                                    // Halt forward movement at interaction
                                    this._haltPlayer = true;
                                    this.keys.w = false;
                                    this.keys.a = false;
                                    this.keys.s = false;
                                    this.keys.d = false;
                                }
                            }

                            // Eerie Ghost Glow triggers from further down the hall as a warning (<= 7.0 tiles)
                            let makesGlow = false;
                            if (dist <= 7.0 && dot > 0.707) {
                                makesGlow = true;
                            } else if (makesCombat) {
                                makesGlow = true; // Always glow in combat
                            }

                            if (makesGlow && child.userData.type === 'enemy') {
                                if (!child.userData.glowMeshes) {
                                    child.userData.glowMeshes = [];
                                    let foundSkinned = false;
                                    child.traverse(n => {
                                        if (n.isSkinnedMesh) {
                                            child.userData.glowMeshes.push(n);
                                            foundSkinned = true;
                                        }
                                    });
                                    // Fallback if no skinned mesh found
                                    if (!foundSkinned) child.userData.glowMeshes.push(child);
                                }
                                glowingTargets.push(...child.userData.glowMeshes);
                            }

                            if (makesCombat) {
                                panelHasLoS = true;
                                
                                if (dist < closestDist) {
                                    closestDist = dist;
                                    if (child.userData.type === 'gambler') {
                                        foundNPC = child;
                                    } else if (child.userData.type === 'enemy') {
                                        foundMonster = child;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Dynamically assign which enemies get the ethereal outline glow
                if (this.outlinePass) {
                    let changed = false;
                    if (this.outlinePass.selectedObjects.length !== glowingTargets.length) {
                        changed = true;
                    } else {
                        for(let i=0; i<glowingTargets.length; i++) {
                            if (this.outlinePass.selectedObjects[i] !== glowingTargets[i]) {
                                changed = true; break;
                            }
                        }
                    }
                    if (changed) {
                        this.outlinePass.selectedObjects = glowingTargets;
                    }
                }
                
                let currentCmd = 'HIDE_COMBAT';
                let currentExitCmd = 'HIDE_EXIT';
                let newTargetId = null;

                if (foundNPC) {
                    this.activeTarget = foundNPC;
                    this.activeTargetDist = closestDist;
                    newTargetId = foundNPC.userData.id;
                    currentCmd = 'SHOW_GAMBLING';
                } else if (foundMonster) {
                    this.activeTarget = foundMonster;
                    this.activeTargetDist = closestDist;
                    newTargetId = foundMonster.userData.id;
                    currentCmd = 'SHOW_COMBAT';
                } else {
                    this.activeTarget = null;
                    this.activeTargetDist = Infinity;
                }
                
                // Only postMessage if the active UI state actually changed, avoiding 60FPS DOM spam
                if (this._lastCombatCmd !== currentCmd || this._lastTargetId !== newTargetId) {
                    this._lastCombatCmd = currentCmd;
                    this._lastTargetId = newTargetId;
                    this._lastSentDist = this.activeTargetDist;
                    
                    if (currentCmd === 'SHOW_GAMBLING') {
                        window.parent.postMessage({ type: 'SHOW_GAMBLING' }, '*');
                    } else if (currentCmd === 'SHOW_COMBAT') {
                        // Trigger combat float altitude
                        // We rely entirely on model.position.y lerping now to prevent the targeting circle from lifting
                        window.parent.postMessage({ type: 'SHOW_COMBAT', health: foundMonster.userData.hp || '4/1', maxHealth: foundMonster.userData.maxHp, level: foundMonster.userData.lvl, ac: foundMonster.userData.ac, distance: this.activeTargetDist }, '*');
                    } else {
                        // Reset all monster altitudes when combat drops
                        window.parent.postMessage({ type: 'HIDE_COMBAT' }, '*');
                    }
                } else if (currentCmd === 'SHOW_COMBAT' && Math.abs(this._lastSentDist - this.activeTargetDist) > 0.1) {
                    // Update distance dynamically if it changes significantly while UI is open
                    this._lastSentDist = this.activeTargetDist;
                    window.parent.postMessage({ type: 'SHOW_COMBAT', health: foundMonster.userData.hp || '4/1', maxHealth: foundMonster.userData.maxHp, level: foundMonster.userData.lvl, ac: foundMonster.userData.ac, distance: this.activeTargetDist }, '*');
                }
                
                // --- Exit Dungeon Trigger ---
                // The entrance is always at x = Math.floor(this.mapWidth / 2), y = this.mapHeight - 2
                const entranceX = Math.floor(this.mapWidth / 2);
                const entranceZ = this.mapHeight - 2;
                
                if (playerGridX === entranceX && playerGridZ === entranceZ) {
                    // Check if player is facing the stairs (+Z direction)
                    const fZ = -Math.cos(this.player.rot); 
                    if (fZ < -0.8) { // Facing deeply south
                        currentExitCmd = 'SHOW_EXIT';
                    }
                }
                
                if (this._lastExitCmd !== currentExitCmd) {
                    this._lastExitCmd = currentExitCmd;
                    window.parent.postMessage({ type: currentExitCmd }, '*');
                }
            },

            initComms() {
                // Initialize Native AI Web Worker
                this.aiWorker = new Worker('NEWORIGAMI/js/engine/ai.worker.js');
                this.aiWorker.addEventListener('message', (e) => {
                    window.postMessage(e.data, '*');
                });

                // Deprecated UI_ACTION removed in favor of direct message parsing below
                // Listen to external commands (AI Brain & Master UI Router)
                window.addEventListener('message', (e) => {
                    if (!e.data) return;
                    
                    if (e.data.type === 'FPV_ACTION') {
                        const action = e.data.action;
                        if (action === 'BET EVEN' || action === 'BET ODD') {
                            CombatSystem.spawnCombatText(action === 'BET EVEN' ? "BET EVEN!" : "BET ODD!", "crit");
                            
                            // Spawn 3D Bouncing Dice in front of Player/Target
                            let spawnX = this.player.x * this.gridSize;
                            let spawnZ = this.player.z * this.gridSize;
                            let spawnY = 2; // Drop from above
                            
                            if (this.activeTarget) {
                                spawnX = (spawnX + this.activeTarget.position.x) / 2;
                                spawnZ = (spawnZ + this.activeTarget.position.z) / 2;
                                this.activeTarget.userData.stateColor = '#00ff00'; // Green for wager
                            } else {
                                spawnX -= Math.sin(this.player.rot) * 1.5;
                                spawnZ -= Math.cos(this.player.rot) * 1.5;
                            }
                            
                            for(let i=0; i<2; i++) {
                                const dieGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
                                const dieMat = new THREE.MeshStandardMaterial({
                                    color: action === 'BET_EVEN' ? 0x1b5e20 : 0xb71c1c, 
                                    roughness: 0.2, 
                                    metalness: 0.1
                                });
                                const die = new THREE.Mesh(dieGeo, dieMat);
                                die.position.set(spawnX + (i * 0.4 - 0.2), spawnY, spawnZ);
                                
                                die.userData = {
                                    isDice: true,
                                    vY: 0.1, // Toss up slightly
                                    vX: (Math.random() - 0.5) * 0.15,
                                    vZ: (Math.random() - 0.5) * 0.15,
                                    rX: Math.random() * 0.5,
                                    rY: Math.random() * 0.5,
                                    rZ: Math.random() * 0.5,
                                    life: 240 // 4 seconds at 60fps
                                };
                                this.worldGroup.add(die);
                            }
                            this.scene.userData.hasActiveDice = true;
                            
                            // Calculate wager outcome
                            const sum = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
                            const isEven = sum % 2 === 0;
                            const won = (action === 'BET EVEN' && isEven) || (action === 'BET ODD' && !isEven);
                            
                            setTimeout(() => {
                                if (won) {
                                    CombatSystem.spawnCombatText("YOU WON!", "crit");
                                    this.postToAI({ type: 'WAGER_RESULT', won: true });
                                } else {
                                    CombatSystem.spawnCombatText("YOU LOST!", "damage");
                                    this.postToAI({ type: 'WAGER_RESULT', won: false });
                                }
                                    // Clear chat bubble on wager conclusion
                                if (this.activeChat) {
                                    this.scene.remove(this.activeChat.mesh);
                                    this.activeChat = null;
                                }
                            }, 1500);
                            
                        } else if (action === 'WAGER' && this.activeTarget) {
                            this.activeTarget.userData.stateColor = '#00ff00'; // Green for wager mode
                        } else if (CardDatabase[action] && CardDatabase[action].fx) {
                            // Automatically process normalized Card FX Templates via Physics System!
                            this.physics.executeCardAction(action);
                        } else if ((action === 'ATTACK') && this.activeTarget && this.activeTarget.userData.type === 'enemy') {
                            const eX = this.activeTarget.position.x / this.gridSize;
                            const eZ = this.activeTarget.position.z / this.gridSize;
                            const tDist = Math.hypot(eX - this.player.x, eZ - this.player.z);
                            if (tDist >= 2.5) {
                                CombatSystem.spawnCombatText("OUT OF RANGE", "miss");
                            } else {
                                this.executeMeleeAttack(this.activeTarget);
                            }
                        } else if (action === 'retreat') {
                            // Force player backward safely on grid
                            const dx = Math.sin(this.player.rot) * 1.0;
                            const dz = Math.cos(this.player.rot) * 1.0;
                            if (!this.checkCollision(this.player.x + dx, this.player.z + dz, 0.35)) {
                                this.player.x += dx;
                                this.player.z += dz;
                            }
                            this._haltPlayer = false; // Player retreated, they can move again
                        }
                    } else if (e.data.type === 'COMBAT_CARD_PLAYED') {
                        const spellName = e.data.card;
                        if (this.activeTarget) {
                            this.spawnSpellEffect(spellName, this.activeTarget);
                            // Also send AI event so it counts!
                            this.postToAI({ type: 'PLAYER_ATTACK', targetId: this.activeTarget.userData.id });
                        } else {
                            this.spawnSpellEffect(spellName, null);
                        }
                    } else if (e.data.type === 'COMBAT_UPDATE') {
                        // Sync UI with the AI's math
                        window.parent.postMessage(
                            { type: 'SHOW_COMBAT', health: e.data.newHp, maxHealth: e.data.maxHp, level: e.data.lvl, ac: e.data.ac }, 
                            '*'
                        );
                    } else if (e.data && e.data.type === 'AI_DEATH') {
                        // Implement sinking death animation
                        const deadMesh = this.worldGroup.children.find(m => m.userData && m.userData.id === e.data.id);
                        if (deadMesh) {
                            if (this.activeTarget && this.activeTarget.userData.id === e.data.id) {
                                this.activeTarget = null;
                                window.parent.postMessage({ type: 'HIDE_ALL' }, '*');
                            }
                            
                            if (this.activeChat && this.activeChat.target && this.activeChat.target.userData.id === e.data.id) {
                                this.scene.remove(this.activeChat.mesh);
                                this.activeChat = null;
                            }
                            
                            // Stop any walking/idle animations
                            if (deadMesh.userData.mixer) {
                                deadMesh.userData.mixer.stopAllAction();
                            }
                            
                            // Remove selection circle entirely
                            if (deadMesh.userData.baseMat) {
                                deadMesh.userData.baseMat.opacity = 0;
                            }
                            
                            // Sinking Animation
                            let sinkAmount = 0;
                            let frameCount = 0;
                            const originalY = deadMesh.position.y;
                            
                            const sinkAnim = () => {
                                frameCount++;
                                if (frameCount < 15) {
                                    // Fall backward
                                    deadMesh.rotation.x -= (Math.PI / 2) / 15;
                                } else {
                                    // Sink rapidly
                                    sinkAmount += 0.15;
                                    deadMesh.position.y = originalY - sinkAmount;
                                }
                                
                                // Fade out glass opacity if available
                                deadMesh.traverse((child) => {
                                    if (child.isMesh && child.material && child.material.transparent) {
                                        child.material.opacity = Math.max(0, child.material.opacity - 0.05);
                                        // Reduce emissive to lose its glow
                                        if (child.material.emissiveIntensity !== undefined) {
                                            child.material.emissiveIntensity = Math.max(0, child.material.emissiveIntensity - 0.05);
                                        }
                                    }
                                });
                                
                                if (sinkAmount < 4.0) {
                                    requestAnimationFrame(sinkAnim);
                                } else {
                                    this.worldGroup.remove(deadMesh);
                                }
                            };
                            
                            requestAnimationFrame(sinkAnim);
                        }
                    } else if (e.data && e.data.type === 'AI_UPDATES') {
                        // Process commands from the A* brain
                        e.data.updates.forEach(up => {
                            const mesh = this.worldGroup.children.find(m => m.userData && m.userData.id === up.id);
                            if (mesh) {
                                if (up.action === 'INIT_STATS') {
                                    mesh.userData.hp = up.hp;
                                    mesh.userData.maxHp = up.maxHp;
                                    mesh.userData.lvl = up.lvl;
                                    mesh.userData.ac = up.ac;
                                } else if (up.action === 'MOVE') {
                                    // Normally we'd lerp this in the animate loop for smoothness,
                                    // but snapping to grid cells works for this retro grid crawler aesthetic.
                                    mesh.position.x = up.x * this.gridSize;
                                    mesh.position.z = up.z * this.gridSize;
                                } else if (up.action === 'ATTACK') {
                                    // The worker decided to attack based on distance and state.
                                    
                                    // 1. Face the player directly!
                                    mesh.rotation.y = Math.atan2(
                                        mesh.position.x - this.player.x,
                                        mesh.position.z - this.player.z
                                    ) + Math.PI;

                                    // 2. Play attack animation
                                    if (mesh.userData.actions && mesh.userData.actions[1]) {
                                        const slashAnim = mesh.userData.actions[1];
                                        if (mesh.userData.mixer) mesh.userData.mixer.stopAllAction();
                                        slashAnim.reset();
                                        slashAnim.setLoop(THREE.LoopOnce, 1);
                                        slashAnim.clampWhenFinished = true;
                                        slashAnim.play();
                                        
                                        // Auto-return to idle after swing
                                        setTimeout(() => {
                                            if (mesh.userData.actions[0] && mesh.userData.mixer) {
                                                mesh.userData.mixer.stopAllAction();
                                                mesh.userData.actions[0].reset().play();
                                            }
                                        }, (slashAnim.getClip().duration * 1000) || 1200);
                                    }

                                    // 3. Spawn real damage text against the screen
                                    const gobDmg = Math.floor(Math.random() * 4) + 1; // 1-4 pts
                                    CombatSystem.spawnCombatText(`GOBLIN HITS ${gobDmg}`, 'crit');
                                    
                                    // 4. Deplete Player HP
                                    this.player.hp -= gobDmg;
                                    window.parent.postMessage({ type: 'PLAYER_HP_UPDATE', hp: this.player.hp, maxHp: this.player.maxHp }, '*');
                                }
                                
                                // Color the base circle based on AI State (Red for attacking/chasing, Soft White for idle)
                                if (up.state && mesh.userData.baseMat) {
                                    if (up.state === 'IDLE') {
                                        mesh.userData.baseMat.map = mesh.userData.texIdle;
                                        mesh.userData.baseMat.opacity = 0.2;
                                        if (mesh.userData.searchLight) mesh.userData.searchLight.intensity = 0;
                                    } else if (up.state === 'HOSTILE') {
                                        mesh.userData.baseMat.map = mesh.userData.texHostile;
                                        mesh.userData.baseMat.opacity = 0.5;
                                        if (mesh.userData.searchLight) mesh.userData.searchLight.intensity = 0;
                                    } else if (up.state === 'SEARCHING') {
                                        mesh.userData.baseMat.map = mesh.userData.texSearch;
                                        // Blinking effect logic
                                        const timeSecs = Math.floor(Date.now() / 1000);
                                        mesh.userData.baseMat.opacity = (timeSecs % 2 === 0) ? 0.7 : 0.2;
                                        
                                        // Activate tracking light
                                        if (mesh.userData.searchLight) mesh.userData.searchLight.intensity = 4.0;
                                    }
                                }
                                
                                if (up.action === 'SEARCH_TURN') {
                                    // Make the ghost snap 90 degrees randomly to search
                                    const turnDir = (Math.random() > 0.5) ? (Math.PI / 2) : (-Math.PI / 2);
                                    if (!mesh.userData.mockRot) mesh.userData.mockRot = 0;
                                    mesh.userData.mockRot += turnDir;
                                    mesh.rotation.y = mesh.userData.mockRot;
                                }
                            }
                        });
                        this.checkTriggers();
                    }
                });

                // Send procedural setup to parent shell (which routes to Map and AI engines)
                const initCmd = {
                    type: 'INIT_ENTITIES',
                    // The Map and AI brain need the dungeon layout
                    mapData: this.mapData, 
                    spawns: this.mobSpawns,
                    playerSpawn: { x: this.player.x, z: this.player.z }
                };
                window.parent.postMessage(initCmd, '*');
                this.postToAI(initCmd);
            },
            
            postToAI(msg) {
                if (this.aiWorker) {
                    this.aiWorker.postMessage(msg);
                }
            },

            // Main Loop
            animate() {
                requestAnimationFrame(() => this.animate());

                // Update delta time for glTF Skeletal Animations
                const delta = this.clock.getDelta();
                this.mixers.forEach(mixer => mixer.update(delta));
                
                // External modularized Physics System integration
                this.physics.tick(delta);
                
                let moveDir = 0;
                let turnDir = 0;
                
                if (this.keys.w) moveDir = 1;
                if (this.keys.s) moveDir = -1;
                if (this.keys.a) turnDir = 1;
                if (this.keys.d) turnDir = -1;

                const currentlyMoving = (moveDir !== 0 || turnDir !== 0);
                
                if (this._lastIsMoving !== currentlyMoving) {
                    this._lastIsMoving = currentlyMoving;
                    window.parent.postMessage({ type: 'PLAYER_MOVE_STATE', isMoving: currentlyMoving }, '*');
                }
                
                // Rotation
                if (turnDir !== 0) {
                    this.player.rot += turnDir * this.ROT_SPEED * delta;
                }
                this.camera.rotation.y = this.player.rot;
                
                // Movement Override: If halted by combat encounter, explicitly pressing W again breaks the lock so they can bump-attack
                if (this._haltPlayer && moveDir === 1 && this.activeTarget) {
                    const eX = this.activeTarget.position.x / this.gridSize;
                    const eZ = this.activeTarget.position.z / this.gridSize;
                    const tDist = Math.hypot(eX - this.player.x, eZ - this.player.z);
                    if (tDist < 5.0) {
                        this._haltPlayer = false;
                    }
                }
                
                // Movement
                if ((moveDir !== 0 || this.player.autoTurnTarget !== null) && !this._haltPlayer) {
                    // Handle active auto-turn override
                    if (this.player.autoTurnTarget !== null) {
                        const target = this.player.autoTurnTarget;
                        const diff = target - this.player.rot;
                        
                        // Normalize diff to -PI .. PI range
                        let normDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
                        
                        // Aggressive snap if we're very close (0.05 radians ~ 2.8 degrees)
                        if (Math.abs(normDiff) < 0.05) {
                            this.player.rot = target;
                            this.player.autoTurnTarget = null;
                        } else {
                            // Steer aggressively towards target (twice normal turn speed)
                            this.player.rot += Math.sign(normDiff) * this.ROT_SPEED * 2.0 * delta;
                        }
                        
                        // Consume the forward movement to pivot in place smoothly
                        moveDir = 0;
                    }

                    // Normal movement processing if not consumed by turn
                    let nextX = this.player.x;
                    let nextZ = this.player.z;

                    if (moveDir !== 0) {
                        // Note: moveDir = 1 is forward. In 3D, forward is -z vector.
                        const speed = this.MOVE_SPEED * delta * moveDir;
                        const dx = Math.sin(this.player.rot) * speed;
                        const dz = Math.cos(this.player.rot) * speed;
                        
                        let colX = null, colZ = null;
                        
                        // Active Combat Distance Lock: Intercept forward movement (bump attack)
                        // Only trigger bump melee if player is physically adjacent (world dist < 2.5)
                        let tDist = 100;
                        if (this.activeTarget) {
                            const eX = this.activeTarget.position.x / this.gridSize;
                            const eZ = this.activeTarget.position.z / this.gridSize;
                            tDist = Math.hypot(eX - this.player.x, eZ - this.player.z);
                        }

                        if (moveDir === 1 && this.activeTarget && tDist < 2.5) {
                            const now = performance.now();
                            if (!this.lastAttackTime || (now - this.lastAttackTime > 600)) {
                                this.lastAttackTime = now;
                                
                                this.executeMeleeAttack(this.activeTarget);

                                // Recoil violently backwards for visual effect without ever stepping closer to the 3D model
                                nextX = this.player.x + (dx * 1.5);
                                nextZ = this.player.z + (dz * 1.5);
                            }
                        } else {
                            // Standard wandering physics and physical collision sweeps
                            nextX -= dx; 
                            nextZ -= dz;
                            
                            const radius = 0.35; // Collision radius (grid units)
                            
                            colX = this.checkCollision(nextX, this.player.z, radius);
                            if (colX) nextX = this.player.x;
                            
                            colZ = this.checkCollision(nextX, nextZ, radius);
                            if (colZ) nextZ = this.player.z;
                            
                            // Passive Object bumps (Walls, doors, etc.)
                            if (moveDir === 1 && (typeof colX === 'object' || typeof colZ === 'object')) {
                                const targetMesh = typeof colX === 'object' ? colX : colZ;
                                const now = performance.now();
                                if (targetMesh && targetMesh.userData && targetMesh.userData.id && (!this.lastAttackTime || (now - this.lastAttackTime > 600))) {
                                    this.lastAttackTime = now;
                                    
                                    if (targetMesh.userData.type === 'enemy') {
                                        this.executeMeleeAttack(targetMesh);
                                    }
                                    
                                    // Recoil violently backwards
                                    nextX = this.player.x + (dx * 1.5);
                                    nextZ = this.player.z + (dz * 1.5);
                                }
                            }
                        }

                        // Trigger Auto-Turn Feature
                        if (moveDir === 1 && turnDir === 0 && (colX || colZ) && !this.activeTarget && this.player.autoTurnTarget === null) {

                            // Snap current rotation to nearest cardinal direction to prevent mid-turn check failure
                            const cardinalRot = Math.round(this.player.rot / (Math.PI/2)) * (Math.PI/2);
                                
                                const checkDist = 1.0; 
                                const leftRot = cardinalRot + Math.PI/2;
                                const rightRot = cardinalRot - Math.PI/2;
                                
                                const leftBlocked = this.checkCollision(this.player.x - Math.sin(leftRot)*checkDist, this.player.z - Math.cos(leftRot)*checkDist, radius);
                                const rightBlocked = this.checkCollision(this.player.x - Math.sin(rightRot)*checkDist, this.player.z - Math.cos(rightRot)*checkDist, radius);
                                
                                if (!leftBlocked && rightBlocked) {
                                    this.player.autoTurnTarget = leftRot; 
                                } else if (!rightBlocked && leftBlocked) {
                                    this.player.autoTurnTarget = rightRot; 
                                } else if (!leftBlocked && !rightBlocked) {
                                    // T-Junction: Pick a consistent direction (Right-Hand Rule)
                                    this.player.autoTurnTarget = rightRot; 
                                }
                        }
                    }
                    
                    this.player.x = nextX;
                    this.player.z = nextZ;
                }
                
                // Grid change detection for AI and Triggers
                const curGridX = Math.round(this.player.x);
                const curGridZ = Math.round(this.player.z);
                const curRotDirX = Math.round(-Math.sin(this.player.rot));
                const curRotDirZ = Math.round(-Math.cos(this.player.rot));
                if (this.lastGridX !== curGridX || this.lastGridZ !== curGridZ || this.lastRotDirX !== curRotDirX || this.lastRotDirZ !== curRotDirZ) {
                    this.lastGridX = curGridX;
                    this.lastGridZ = curGridZ;
                    this.lastRotDirX = curRotDirX;
                    this.lastRotDirZ = curRotDirZ;
                    window.parent.postMessage({ type: 'PLAYER_MOVE', x: curGridX, z: curGridZ }, '*');
                }
                
                // Check LoS triggers securely per frame instead of bound to integer positions, protecting against fast rotations
                this.checkTriggers();
                
                // State emission for UI styling (e.g. guide panels fading)
                if (currentlyMoving && !this.isMoving) {
                    this.isMoving = true;
                    window.parent.postMessage({ type: 'PLAYER_MOVE_STATE', isMoving: true }, '*');
                } else if (!currentlyMoving && this.isMoving) {
                    this.isMoving = false;
                    window.parent.postMessage({ type: 'PLAYER_MOVE_STATE', isMoving: false }, '*');
                    window.parent.postMessage({ type: 'PLAYER_IDLE' }, '*');
                }
                
                // Camera Realism: Head Bobbing & Sway
                // ---------------------------------------------------------------------
                const BOB_FREQ = 12.0;   // How fast the steps are
                
                if (currentlyMoving) {
                    this.bobTimer += delta * BOB_FREQ;
                    // The 'Math.abs(Math.sin)' makes a sharp bounce on each footfall, typical of old-school crawlers
                    this.bobHeight = Math.abs(Math.sin(this.bobTimer)) * this.BOB_AMP;
                    this.bobSway = Math.cos(this.bobTimer / 2) * this.SWAY_AMP; // Half speed sway for weight shift
                } else {
                    // Smoothly ease back to rest position when stopped (clamped to prevent delta explosion on lag)
                    this.bobTimer = 0;
                    const lerpFactor = Math.min(1.0, 10 * delta); // PREVENT EXPLOSION!
                    this.bobHeight += (0 - this.bobHeight) * lerpFactor;
                    this.bobSway += (0 - this.bobSway) * lerpFactor;
                }
                
                // Apply final smoothed transforms to the camera
                this.camera.position.x = (this.player.x * this.gridSize) + (Math.cos(this.camera.rotation.y) * this.bobSway);
                this.camera.position.z = (this.player.z * this.gridSize) + (Math.sin(this.camera.rotation.y) * this.bobSway);
                this.camera.position.y = 1.84 + this.bobHeight; // Eye level + bob bounce
                this.camera.rotation.z = this.bobSway * -0.5; // Slight tilt during weight shift
                
                // (Legacy sword animation removed)
                
                // Procedural Breathing & State Machine AI (IDLE, CHASE, SEARCH, RETURN)
                // TIME-STOP / TURN-BASED: Freeze time and logic if player is idle
                if (currentlyMoving) {
                    this.gameTime += delta; 
                }
                const time = this.gameTime * 2.5; // Equivalent scaling to the old Date.now() * 0.0025
                
                if (this.worldGroup && currentlyMoving) {
                    
                    // Raycaster setup for LoS
                    const pPos = new THREE.Vector3(this.player.x * this.gridSize, 1.0, this.player.z * this.gridSize);
                    
                    // Use the walls array generated during buildWorldGeometry()
                    const walls = this.walls || [];

                    this.worldGroup.children.forEach(child => {
                        if (child.userData && child.userData.type === 'enemy') {
                            const model = child.children[0];
                            const aiData = this.mobSpawns.find(s => s.id === child.userData.id);
                            
                            // 1. Calculate Grid Distance to camera for Proximity Fading
                            const mPosV = new THREE.Vector3().copy(child.position);
                            mPosV.y += 1.0; 
                            const cPosV = new THREE.Vector3().copy(this.camera.position);
                            const distToPlayerGrid = cPosV.distanceTo(mPosV) / this.gridSize;

                            let targetOpacity = 0.0;
                            if (distToPlayerGrid < 3.0) targetOpacity = this.fxConfig.baseOpacity;
                            else if (distToPlayerGrid > 8.0) targetOpacity = 0.0;
                            else {
                                const progress = (8.0 - distToPlayerGrid) / 5.0;
                                targetOpacity = progress * this.fxConfig.baseOpacity;
                            }
                            
                            // 2. Mathematically hide entities (and their outline/lights) when out of range
                            child.visible = targetOpacity > 0.01;
                            
                            const isCombatTarget = this.activeTarget && this.activeTarget.userData && this.activeTarget.userData.id === child.userData.id;

                            if (model && child.visible) {
                                // Dynamic Translucency mapping
                                model.traverse((n) => {
                                    if (n.isMesh && n.material) {
                                        const mats = Array.isArray(n.material) ? n.material : [n.material];
                                        mats.forEach(mat => {
                                            if (mat.emissive && mat.emissive.getHex() === 0xffffff && mat.emissiveIntensity > 2.0) {
                                                if (targetOpacity <= 0.05) mat.opacity = 0.0; 
                                                else mat.opacity = 1.0;
                                            } else if (mat.name !== 'mist') { // Don't override mist physics
                                                mat.transparent = true;
                                                mat.opacity = Math.min(targetOpacity, 0.45); // Ghostly transparency request
                                                // Glass properties are now statically updated by the dat.gui onChange events
                                            }
                                        });
                                    }
                                });
                                
                                // Ethereal Float Engine
                                if (child.userData.bobPhase === undefined) child.userData.bobPhase = Math.random() * Math.PI * 2;
                                if (model.userData.baseY === undefined) model.userData.baseY = model.position.y;
                                
                                // "yakuza goblin needs to gently float up and down by 1 foot either direction" (1 foot = 0.1 units)
                                const floatAmp = isCombatTarget ? 0.15 : 0.1; 
                                const floatOffset = isCombatTarget ? 1.0 : 0.1; // Gentle hover to prevent clipping
                                
                                // Lerp the model's Y position physically into the air relative to its original bounding box base
                                const targetY = model.userData.baseY + floatOffset + Math.sin(time * 2.0 + child.userData.bobPhase) * floatAmp;
                                model.position.y += (targetY - model.position.y) * 0.1;
                            }
                            
                            if (model && !child.userData.mixer) {
                                // Swirl Mist Particles
                                if (child.userData.mistGroup) {
                                    child.userData.mistGroup.rotation.y += delta * 0.4; // Rotate entire cloud slowly
                                    child.userData.mistGroup.children.forEach(sprite => {
                                        sprite.position.y = 0.2 + Math.abs(Math.sin(time * sprite.userData.speed + sprite.userData.angleOffset)) * 1.5;
                                        const s = 3.0 + Math.sin(time * sprite.userData.speed * 2.0) * 1.2;
                                        sprite.scale.set(s, s, s);
                                        sprite.material.opacity = 0.6 + Math.sin(time * sprite.userData.speed) * 0.4;
                                    });
                                }
                            }
                            
                            if (!aiData) return;
                            
                            // Line of Sight Check (True 3D Raycaster as requested)
                            this._anim_mPos.copy(child.position);
                            this._anim_mPos.y += 1.0; // Aim at chest height
                            this._anim_cPos.copy(this.camera.position);
                            
                            const distToPlayer3D = this._anim_cPos.distanceTo(this._anim_mPos);
                            this._anim_dirToPlayer3D.subVectors(this._anim_cPos, this._anim_mPos).normalize();
                            this._anim_dirFromPlayer3D.subVectors(this._anim_mPos, this._anim_cPos).normalize();
                            
                            let hasLoS = true;
                            // Limit sight strictly to 40 feet (4 grids * approx dist)
                            if (distToPlayer3D > (4.0 * this.gridSize)) {
                                hasLoS = false;
                            } else {
                                this._anim_ray.set(this._anim_cPos, this._anim_dirFromPlayer3D);
                                // Mathematical AABB loop
                                for (const box of this.wallBoxes) {
                                    if (this._anim_ray.intersectBox(box, this._anim_target)) {
                                        if (this._anim_cPos.distanceTo(this._anim_target) < (distToPlayer3D - 0.5)) {
                                            hasLoS = false; // Blocked by wall AABB
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // 90-degree frontal arc check for the monster (Front is local +Z)
                            // Calculate if player is in front of the monster's current rotation
                            this._anim_mFacingDir.set(0, 0, 1);
                            this._anim_mFacingDir.applyAxisAngle(this._anim_upAxis, child.rotation.y);
                            const monsterDot = this._anim_dirToPlayer3D.dot(this._anim_mFacingDir);
                            
                            // If the monster is IDLE or RETURN, it can only spot the player if within frontal arc (~90 degrees -> dot > ~0.707)
                            if (hasLoS && monsterDot < 0.707 && (aiData.state === 'IDLE' || aiData.state === 'RETURN')) {
                                hasLoS = false; 
                            }

                            // State Machine Transitions
                            if (hasLoS) {
                                aiData.state = 'CHASE';
                                aiData.searchTimer = 0;
                            } else if (aiData.state === 'CHASE') {
                                aiData.state = 'SEARCH';
                                aiData.searchTimer = 0;
                            }
                            
                            // State Execution
                            let viewAngle = 0; // Where is the monster looking?
                            
                            if (aiData.state === 'CHASE') {
                                // Move towards player (TEMPORARILY DISABLED PER USER REQUEST)
                                const angle = Math.atan2(this._anim_dirToPlayer3D.x, this._anim_dirToPlayer3D.z);
                                // The model itself and the arrow face local +Z. Rotate wrapper to point +Z at player.
                                child.rotation.y = angle; 
                                
                                // User requested monsters only face the player and do not move yet
                                // const dx = Math.sin(angle) * (aiData.speed * 0.75) * delta;
                                // const dz = Math.cos(angle) * (aiData.speed * 0.75) * delta;
                                // child.position.x += dx;
                                // child.position.z += dz;
                                
                                // Update colors (Red when chasing/attacking)
                                if (child.userData.baseMat) {
                                    if (child.userData.baseMat.map !== this.getCachedCircleTexture('#ff0000')) {
                                        child.userData.baseMat.map = this.getCachedCircleTexture('#ff0000');
                                    }
                                    child.userData.baseMat.opacity = 0.9;
                                }
                                if (child.userData.searchLight) child.userData.searchLight.intensity = 0;
                                
                            } else if (aiData.state === 'SEARCH') {
                                aiData.searchTimer += delta;
                                // Stand still, scan left and right
                                child.rotation.y += Math.sin(time * 2) * delta;
                                // Handle SEARCH blinking logically without 0.25 second frame leak
                                if (child.userData.baseMat) {
                                    const isBlinkFrame = Math.floor(time * 4) % 2 === 0;
                                    // Use cached 50/50 red-black texture for blink state, else solid black
                                    const newMap = isBlinkFrame ? this.getCachedCircleTexture('#ff0000', false, '#000000') : this.getCachedCircleTexture('#000000');
                                    
                                    if (child.userData.baseMat.map !== newMap) {
                                        child.userData.baseMat.map = newMap;
                                    }
                                }
                                
                                if (child.userData.searchLight) child.userData.searchLight.intensity = 2.0;

                                if (aiData.searchTimer > 4.0) { // 4 seconds of searching
                                    aiData.state = 'RETURN';
                                }
                                
                            } else if (aiData.state === 'RETURN') {
                                this._anim_hPos.set(aiData.homeX * this.gridSize, 1.0, aiData.homeZ * this.gridSize);
                                this._anim_dirToHome.subVectors(this._anim_hPos, this._anim_mPos);
                                const distToHome = this._anim_dirToHome.length();
                                
                                if (distToHome < 0.5) {
                                    aiData.state = 'IDLE';
                                } else {
                                    this._anim_dirToHome.normalize();
                                    const angle = Math.atan2(this._anim_dirToHome.x, this._anim_dirToHome.z);
                                    child.rotation.y = angle;
                                    
                                    const dx = Math.sin(angle) * aiData.speed * delta;
                                    const dz = Math.cos(angle) * aiData.speed * delta;
                                    child.position.x += dx;
                                    child.position.z += dz;
                                }
                                
                                if (child.userData.baseMat) {
                                    if (child.userData.baseMat.map !== this.getCachedCircleTexture('#ffaa00')) {
                                        child.userData.baseMat.map = this.getCachedCircleTexture('#ffaa00'); // Orange return
                                    }
                                }
                                if (child.userData.searchLight) child.userData.searchLight.intensity = 0;
                                
                            } else {
                                // IDLE
                                if (child.userData.baseMat) {
                                    if (child.userData.baseMat.map !== this.getCachedCircleTexture('#000000')) {
                                        child.userData.baseMat.map = this.getCachedCircleTexture('#000000');
                                    }
                                    child.userData.baseMat.opacity = 0.5;
                                }
                                if (child.userData.searchLight) child.userData.searchLight.intensity = 0;
                            }
                            
                            // Explicit override for the side-panel logic!
                            // :when sidepanels come up = goblin floats up in the air and circle turns red.
                            if (isCombatTarget && child.userData.baseMat) {
                                child.userData.baseMat.map = this.getCachedCircleTexture(child.userData.stateColor || '#000000');
                                child.userData.baseMat.opacity = 0.9;
                            }
                        }
                    });
                }
                
                // ---------------------------------------------------------------------
                // RENDER PASSES
                // ---------------------------------------------------------------------
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                
                // Render FPV Frame
                if (this.layoutData && this.layoutData.fpv) {
                    const fRect = this.layoutData.fpv;
                    this.renderer.setViewport(fRect.left, fRect.bottom, fRect.width, fRect.height);
                    this.renderer.setScissor(fRect.left, fRect.bottom, fRect.width, fRect.height);
                    this.renderer.setScissorTest(true);
                } else {
                    // Fallback to fullscreen if no layout frame yet
                    this.renderer.setViewport(0, 0, winW, winH);
                    this.renderer.setScissor(0, 0, winW, winH);
                    this.renderer.setScissorTest(true);
                }
                
                // --- ENTITY IDLE ANIMATIONS & COMBAT LEVITATION ---
                if (this.worldGroup) {
                    for (let i = 0; i < this.worldGroup.children.length; i++) {
                        const child = this.worldGroup.children[i];
                        
                        // Smooth Levitation Interpolation for Combat Intros (moves the "floor base" up)
                        if (child.userData && child.userData.targetY !== undefined) {
                            child.userData.baseY += (child.userData.targetY - child.userData.baseY) * 2.0 * delta;
                        }

                        // Goblin Retreat
                        if (child.userData.isRetreating) {
                            child.position.x += (child.userData.retreatX - child.position.x) * 4.0 * delta;
                            child.position.z += (child.userData.retreatZ - child.position.z) * 4.0 * delta;
                            child.userData.baseY += (1.0 - child.userData.baseY) * 2.0 * delta; // Float up
                            
                            if (Math.abs(child.position.x - child.userData.retreatX) < 0.1 && 
                                Math.abs(child.position.z - child.userData.retreatZ) < 0.1) {
                                child.userData.isRetreating = false;
                            }
                        }

                        // Imp positioning and floating
                        if (child.userData.type === 'imp') {
                            child.userData.baseY += (1.5 - child.userData.baseY) * 2.0 * delta;
                            
                            // Specific clock logic based on original design
                            child.position.y = child.userData.baseY + Math.sin(this.clock.getElapsedTime() * 2.0 + (child.userData.id.endsWith('_0') ? 0 : Math.PI)) * 0.2;
                            
                            // Face player constantly
                            const angle = Math.atan2(this.camera.position.x - child.position.x, this.camera.position.z - child.position.z);
                            child.rotation.y = angle;
                        }
                        
                        // Apply idle bob to NPCs and Monsters based on their active baseY
                        if (child.userData && child.userData.idlePhase !== undefined && child.userData.type !== 'player') {
                            child.position.y = (child.userData.baseY || 0) + Math.sin(this.clock.getElapsedTime() * 1.5 + child.userData.idlePhase) * 0.1;
                        }
                        
                        // Dice physics and garbage collection
                        if (child.userData && child.userData.isDice) {
                            child.position.x += child.userData.vX;
                            child.position.y += child.userData.vY;
                            child.position.z += child.userData.vZ;
                            child.userData.vY -= 0.005; // Gravity
                            
                            child.rotation.x += child.userData.rX;
                            child.rotation.y += child.userData.rY;
                            child.rotation.z += child.userData.rZ;
                            
                            // Fast floor collision
                            if (child.position.y < 0.15) {
                                child.position.y = 0.15;
                                child.userData.vY *= -0.6; // Bounce
                                child.userData.vX *= 0.8; // Ground friction
                                child.userData.vZ *= 0.8;
                                child.userData.rX *= 0.8;
                                child.userData.rY *= 0.8;
                                child.userData.rZ *= 0.8;
                            }
                            
                            child.userData.life -= (delta * 60); // decrement based on time/frames
                            if (child.userData.life <= 0) {
                                child.scale.multiplyScalar(0.9);
                                if (child.scale.x < 0.01) {
                                    this.worldGroup.remove(child);
                                    i--; // Adjust array index since element was removed
                                }
                            }
                        }
                    }
                }

                // Active Chat Bubble Tracking & Billboarding
                if (this.activeChat && this.activeChat.mesh && this.activeChat.target) {
                    const tPos = new THREE.Vector3();
                    this.activeChat.target.getWorldPosition(tPos);
                    this.activeChat.mesh.position.copy(tPos);
                    // The origin of the chat group is the tip of its tail.
                    // Pin it perfectly to the goblin's mouth (~1.0 units up).
                    this.activeChat.mesh.position.y += 1.0; 
                    
                    // Always face the player
                    this.activeChat.mesh.lookAt(this.camera.position);

                    if (this.activeChat.fading) {
                        this.activeChat.mesh.scale.multiplyScalar(0.8);
                        if (this.activeChat.mesh.scale.x < 0.01) {
                            this.scene.remove(this.activeChat.mesh);
                            this.activeChat = null;
                        }
                    }
                }

                // FPV Renderer Call
                this.renderer.setClearColor(0x2a2a2a, 1);
                this.scene.fog.density = 0.12; // Volumetric fog ON
                
                // Use Composer for Bloom and Chromatic Aberration Pipeline
                if (this.composer) {
                    this.composer.render();
                } else {
                    this.renderer.render(this.scene, this.camera);
                }
                
                // --- FPS Counter ---
                this.frameCount++;
                const now = performance.now();
                if (now - this.lastFpsTime >= 1000) {
                    this.currentFps = this.frameCount;
                    this.frameCount = 0;
                    this.lastFpsTime = now;
                    const fpsEl = document.getElementById('fps-counter');
                    if (fpsEl) {
                        fpsEl.textContent = `FPS: ${this.currentFps}/60`;
                    }
                }
            }, // Closing brace for animate() function
            
            // Pre-allocated Global Vectors for animate GC optimization
            _anim_mPos: new THREE.Vector3(),
            _anim_cPos: new THREE.Vector3(),
            _anim_dirToPlayer3D: new THREE.Vector3(),
            _anim_dirFromPlayer3D: new THREE.Vector3(),
            _anim_mFacingDir: new THREE.Vector3(0, 0, 1),
            _anim_upAxis: new THREE.Vector3(0, 1, 0),
            _anim_ray: new THREE.Ray(),
            _anim_target: new THREE.Vector3(),
            _anim_hPos: new THREE.Vector3(),
            _anim_dirToHome: new THREE.Vector3(),

            spawnSpellEffect: function(spellName, target) {
                let category = 'ITEM';
                if (spellName === 'GALE') category = 'WIND';
                else if (['FIREBALL', 'PYROBLAST', 'COMET', 'SLASH', 'THRUST', 'ATTACK'].includes(spellName)) category = 'FIRE';
                else if (['TIDE', 'SURGE', 'PARLEY', 'WATER'].includes(spellName)) category = 'WATER';
                else if (['BOULDER', 'FISSURE', 'OBSERVE'].includes(spellName)) category = 'EARTH';
                
                const group = new THREE.Group();
                let mat;
                if (category === 'FIRE') {
                    mat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
                    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), mat);
                    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
                    group.add(core, shell);
                } else if (category === 'WIND') {
                    mat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 });
                    const core = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.4, 8, 32, Math.PI * 1.5), mat);
                    core.rotation.x = Math.PI / 2;
                    group.add(core);
                } else if (category === 'WATER') {
                    mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });
                    const core = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), mat);
                    group.add(core);
                } else if (category === 'EARTH') {
                    mat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9, flatShading: true });
                    const core = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), mat);
                    group.add(core);
                } else {
                    mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
                    group.add(core);
                }
                
                const startPos = new THREE.Vector3();
                this.camera.getWorldPosition(startPos);
                
                const dir = new THREE.Vector3();
                this.camera.getWorldDirection(dir);
                startPos.add(dir.clone().multiplyScalar(2.0)); 
                startPos.y -= 0.5;
                
                group.position.copy(startPos);
                this.worldGroup.add(group);
                
                const lightColor = category === 'FIRE' ? 0xff0000 : (category === 'WIND' ? 0xffffff : (category === 'WATER' ? 0x00ffff : 0xdddddd));
                const pLight = new THREE.PointLight(lightColor, 4, 10);
                group.add(pLight);
                
                const targetPos = new THREE.Vector3();
                if (target) {
                    target.getWorldPosition(targetPos);
                    targetPos.y += 1.4; // Chest hit
                } else {
                    targetPos.copy(startPos).add(dir.clone().normalize().multiplyScalar(40.0));
                }
                
                const distance = startPos.distanceTo(targetPos);
                const speed = 30.0;
                const duration = (distance / speed) * 1000;
                const startTime = performance.now();
                
                const animateSpell = () => {
                    const elapsed = performance.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1.0);
                    
                    group.position.lerpVectors(startPos, targetPos, progress);
                    group.rotation.x += 0.2;
                    group.rotation.y += 0.3;
                    
                    if (progress < 1.0) {
                        requestAnimationFrame(animateSpell);
                    } else {
                        this.worldGroup.remove(group);
                        if (target) {
                            CombatSystem.spawnCombatText(spellName + "!", "crit");
                            if (!target.userData.isRetreating) {
                                target.userData.isRetreating = true;
                                target.userData.retreatX = target.position.x - dir.x * 1.5;
                                target.userData.retreatZ = target.position.z - dir.z * 1.5;
                            }
                            const flash = new THREE.PointLight(lightColor, 8, 20);
                            flash.position.copy(targetPos);
                            this.worldGroup.add(flash);
                            let flashFrames = 0;
                            const dimFlash = () => {
                                flashFrames++;
                                flash.intensity *= 0.8;
                                if (flashFrames < 15) requestAnimationFrame(dimFlash);
                                else this.worldGroup.remove(flash);
                            };
                            dimFlash();
                        }
                    }
                };
                requestAnimationFrame(animateSpell);
            },

            spawnAttackCrosshair: function(target) {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                // Draw red crosshair
                const cx = 64;
                const cy = 64;
                const r = 40;
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                
                // Draw intersecting hash lines
                ctx.beginPath();
                ctx.moveTo(cx, cy - r - 15); ctx.lineTo(cx, cy - r + 10);
                ctx.moveTo(cx, cy + r - 10); ctx.lineTo(cx, cy + r + 15);
                ctx.moveTo(cx - r - 15, cy); ctx.lineTo(cx - r + 10, cy);
                ctx.moveTo(cx + r - 10, cy); ctx.lineTo(cx + r + 15, cy);
                ctx.stroke();
                
                // Inner dot
                ctx.beginPath();
                ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ff3333';
                ctx.fill();

                const tex = new THREE.CanvasTexture(canvas);
                const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
                const sprite = new THREE.Sprite(mat);
                
                // Start transparent and big
                sprite.scale.set(4, 4, 4);
                mat.opacity = 0;
                
                // Attach slightly in front or to target
                target.add(sprite);
                sprite.position.y = 1.4; // Chest high
                sprite.position.z = 1.4; // Push firmly out in front of the model
                
                // Animate it
                let scale = 4.0;
                let frames = 0;
                const maxFrames = 25;
                
                const animateCrosshair = () => {
                    frames++;
                    if (!target || frames > maxFrames) {
                        if (target) target.remove(sprite);
                        tex.dispose();
                        mat.dispose();
                        return;
                    }
                    
                    // shrink in rapidly, fade in then hold
                    scale += (1.5 - scale) * 0.3; // ease towards 1.5
                    sprite.scale.set(scale, scale, scale);
                    
                    if (frames < 5) {
                        mat.opacity = frames / 5;
                    } else if (frames > maxFrames - 5) {
                        mat.opacity = 1 - ((frames - (maxFrames - 5)) / 5);
                    } else {
                        mat.opacity = 1;
                    }
                    
                    requestAnimationFrame(animateCrosshair);
                };
                
                requestAnimationFrame(animateCrosshair);
            }
        };

        window.onload = () => Engine.init();