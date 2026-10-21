export const EntitiesMixin = {
initControls() {
                this.autoWalkPath = []; // Init autowalk array

                // Receive keyboard polling state from the Shell
                window.addEventListener('message', (event) => {
                    const data = event.data;
                    if (!data || !data.type) return;

                    if (data.type === 'KEY_DOWN') {
                        this.clearAutoWalk(); // Interrupt autowalk
                        const k = data.key.toLowerCase();
                        if (k === 'w' || data.key === 'ArrowUp') {
                            if (!this.handleHaltedAttack()) {
                                this.keys.w = true;
                                if (this.combatState === 'player_turn') this.combatState = 'idle';
                            }
                        }
                        if (k === 'a' || data.key === 'ArrowLeft') {
                            this.keys.a = true;
                            if (this.combatState === 'player_turn') this.combatState = 'idle';
                        }
                        if (k === 's' || data.key === 'ArrowDown') {
                            this.keys.s = true;
                            if (this.combatState === 'player_turn') this.combatState = 'idle';
                        }
                        if (k === 'd' || data.key === 'ArrowRight') {
                            this.keys.d = true;
                            if (this.combatState === 'player_turn') this.combatState = 'idle';
                        }
                        if (k === 'q' || data.key === 'q') {
                            this.keys.q = true;
                            if (this.combatState === 'player_turn') this.combatState = 'idle';
                        }
                        if (k === 'e' || data.key === 'e') {
                            this.keys.e = true;
                            if (this.combatState === 'player_turn') this.combatState = 'idle';
                        }
                        if (k === 'g' || data.key === 'g') {
                            this.keys.g = true;
                        }
                    } else if (data.type === 'KEY_UP') {
                        const k = data.key.toLowerCase();
                        if (k === 'w' || data.key === 'ArrowUp') {
                            this.keys.w = false;
                            this.player.autoTurnTarget = null;
                        }
                        if (k === 'a' || data.key === 'ArrowLeft') this.keys.a = false;
                        if (k === 's' || data.key === 'ArrowDown') this.keys.s = false;
                        if (k === 'd' || data.key === 'ArrowRight') this.keys.d = false;
                        if (k === 'q' || data.key === 'q') this.keys.q = false;
                        if (k === 'e' || data.key === 'e') this.keys.e = false;
                        if (k === 'g' || data.key === 'g') this.keys.g = false;
                    }
                });

                // Click to dismiss Chat Bubble or Walk
                window.addEventListener('pointerdown', (e) => {
                    if (this.activeChat && !this.activeChat.fading) {
                        this.activeChat.fading = true;
                        this._haltPlayer = false; // Release movement lock
                    } else if (e.target === this.renderer.domElement) {
                        // Click-to-move disabled by user request. 
                        // "stop autorun, dont autorun"
                    }
                });

                // Add local keyboard listeners in case the FPV iframe receives direct focus
                window.addEventListener('keydown', (e) => {
                    const k = e.key.toLowerCase();
                    this.clearAutoWalk(); // Interrupt autowalk
                    if (k === 'w' || e.key === 'ArrowUp') {
                        if (!this.handleHaltedAttack()) {
                            this.keys.w = true;
                            if (this.combatState === 'player_turn') this.combatState = 'idle';
                        }
                    }
                    if (k === 'a' || e.key === 'ArrowLeft') {
                        this.keys.a = true;
                        if (this.combatState === 'player_turn') this.combatState = 'idle';
                    }
                    if (k === 's' || e.key === 'ArrowDown') {
                        this.keys.s = true;
                        if (this.combatState === 'player_turn') this.combatState = 'idle';
                    }
                    if (k === 'd' || e.key === 'ArrowRight') {
                        this.keys.d = true;
                        if (this.combatState === 'player_turn') this.combatState = 'idle';
                    }
                });
                
                window.addEventListener('keyup', (e) => {
                    const k = e.key.toLowerCase();
                    if (k === 'w' || e.key === 'ArrowUp') {
                        this.keys.w = false;
                        this.player.autoTurnTarget = null;
                    }
                    if (k === 'a' || e.key === 'ArrowLeft') this.keys.a = false;
                    if (k === 's' || e.key === 'ArrowDown') this.keys.s = false;
                    if (k === 'd' || e.key === 'ArrowRight') this.keys.d = false;
                });
                
                window.addEventListener('blur', () => {
                    this.keys = { w: false, a: false, s: false, d: false };
                    this.player.autoTurnTarget = null;
                });
            },

clearAutoWalk() {
                this.autoWalkPath = [];
                if (this.player.autoTurnTarget !== null && this.keys.w === false) {
                    this.player.autoTurnTarget = null;
                }
                if (this.pathVisualsGroup) {
                    while (this.pathVisualsGroup.children.length > 0) {
                        this.pathVisualsGroup.remove(this.pathVisualsGroup.children[0]);
                    }
                }
            },

findPath(startX, startZ, endX, endZ, precomputedEntityMap = null) {
                // Optimized A* Algorithm
                const startNode = { x: Math.round(startX), z: Math.round(startZ), g: 0, h: 0, f: 0, parent: null };
                const endNode = { x: Math.round(endX), z: Math.round(endZ), g: 0, h: 0, f: 0, parent: null };
                
                if (endNode.x < 0 || endNode.x >= this.mapWidth || endNode.z < 0 || endNode.z >= this.mapHeight) return [];
                if (this.mapData[endNode.x]?.[endNode.z]?.type === 'wall') return [];
                
                // Pre-calculate entity occupancy for O(1) collision checks during pathfinding
                let entityMap = precomputedEntityMap;
                if (!entityMap) {
                    entityMap = new Map();
                    if (this.worldGroup) {
                        for (const child of this.worldGroup.children) {
                            if (child.userData && child.userData.id && !child.userData.type?.startsWith('loot') && !child.userData.isDead) {
                                const eX = Math.round(child.position.x / this.gridSize);
                                const eZ = Math.round(child.position.z / this.gridSize);
                                entityMap.set(`${eX},${eZ}`, true);
                            }
                        }
                    }
                }
                
                let openList = [startNode];
                let openMap = new Map();
                openMap.set(`${startNode.x},${startNode.z}`, startNode);
                let closedMap = new Set();
                
                const getH = (curr, end) => Math.abs(curr.x - end.x) + Math.abs(curr.z - end.z);
                
                let maxIter = 800; // Safe limit
                while (openList.length > 0 && maxIter-- > 0) {
                    let lowestIdx = 0;
                    for (let i = 0; i < openList.length; i++) {
                        if (openList[i].f < openList[lowestIdx].f) lowestIdx = i;
                    }
                    
                    let currNode = openList.splice(lowestIdx, 1)[0];
                    const currKey = `${currNode.x},${currNode.z}`;
                    openMap.delete(currKey);
                    closedMap.add(currKey);
                    
                    if (currNode.x === endNode.x && currNode.z === endNode.z) {
                        let path = [];
                        let curr = currNode;
                        while (curr != null) {
                            path.push({ x: curr.x, z: curr.z });
                            curr = curr.parent;
                        }
                        return path.reverse();
                    }
                    
                    const neighbors = [
                        { x: currNode.x, z: currNode.z - 1 }, // N
                        { x: currNode.x, z: currNode.z + 1 }, // S
                        { x: currNode.x - 1, z: currNode.z }, // W
                        { x: currNode.x + 1, z: currNode.z }  // E
                    ];
                    
                    for (let n of neighbors) {
                        if (n.x < 0 || n.x >= this.mapWidth || n.z < 0 || n.z >= this.mapHeight) continue;
                        if (this.mapData[n.x]?.[n.z]?.type === 'wall') continue;
                        
                        const nKey = `${n.x},${n.z}`;
                        if (closedMap.has(nKey)) continue;
                        
                        // Treat entities as obstacles, unless it's the target destination (like the player)
                        if (entityMap.has(nKey) && !(n.x === endNode.x && n.z === endNode.z)) continue;
                        
                        let gScore = currNode.g + 1;
                        let gScoreIsBest = false;
                        
                        let inOpen = openMap.get(nKey);
                        if (!inOpen) {
                            gScoreIsBest = true;
                            n.h = getH(n, endNode);
                            openList.push(n);
                            openMap.set(nKey, n);
                        } else if (gScore < inOpen.g) {
                            gScoreIsBest = true;
                            n = inOpen;
                        }
                        
                        if (gScoreIsBest) {
                            n.parent = currNode;
                            n.g = gScore;
                            n.f = n.g + n.h;
                        }
                    }
                }
                return [];
            },

setWaypointPath(targetGridX, targetGridZ) {
                this.clearAutoWalk();
                
                const sx = Math.round(this.player.x / this.gridSize);
                const sz = Math.round(this.player.z / this.gridSize);
                
                const path = this.findPath(sx, sz, targetGridX, targetGridZ);
                if (path.length > 1) {
                    // Shift off the current tile
                    path.shift();
                    // this.autoWalkPath = path; // Autowalk DISABLED per user request
                    
                    // Render path visuals
                    const wayGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16);
                    const destGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 32);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5, depthWrite: false });
                    
                    for (let i = 0; i < path.length; i++) {
                        const pt = path[i];
                        const isDest = (i === path.length - 1);
                        const mesh = new THREE.Mesh(isDest ? destGeo : wayGeo, mat);
                        mesh.position.set(pt.x * this.gridSize, 0.05, pt.z * this.gridSize);
                        mesh.layers.set(1);
                        mesh.layers.enable(3); // Visible in PiP too
                        this.pathVisualsGroup.add(mesh);
                    }
                }
            },

checkCollision(gx, gz, radiusInGridUnits) {                
                // Check 4 corners of bounding box around (gx, gz)
                const points = [
                    { x: gx - radiusInGridUnits, z: gz - radiusInGridUnits },
                    { x: gx + radiusInGridUnits, z: gz - radiusInGridUnits },
                    { x: gx - radiusInGridUnits, z: gz + radiusInGridUnits },
                    { x: gx + radiusInGridUnits, z: gz + radiusInGridUnits },
                ];
                let hitEntity = null;
                for (let p of points) {
                    let cx = Math.round(p.x);
                    let cz = Math.round(p.z);
                    const validation = this.isValidGridSpace(cx, cz);
                    
                    if (validation === false) return true; // Hard wall collision
                    if (validation !== true && typeof validation === 'object') {
                        hitEntity = validation; // We struck a specific entity Mesh
                    }
                }
                return hitEntity ? hitEntity : false; // Return the entity if hit, otherwise False means space is clear
            },

hasLineOfSight(x0, z0, x1, z1) {
                let dx = Math.abs(x1 - x0);
                let dz = Math.abs(z1 - z0);
                let sx = (x0 < x1) ? 1 : -1;
                let sz = (z0 < z1) ? 1 : -1;
                let err = dx - dz;
                while(true) {
                    if (this.mapData[x0]?.[z0]?.type === 'wall') return false;
                    if ((x0 === x1) && (z0 === z1)) break;
                    let e2 = 2 * err;
                    if (e2 > -dz) { err -= dz; x0 += sx; }
                    if (e2 < dx) { err += dx; z0 += sz; }
                }
                return true;
            },

processMonsterTurn() {
                if (this.activeTarget && !this.activeTarget.userData.isDead && this.activeTarget.userData.isHostile) {
                    if (this.activeTarget.userData.isStunned) {
                        // Skip turn if stunned
                        setTimeout(() => {
                            this.combatState = 'player_turn';
                            window.parent.postMessage({ type: 'COMBAT_STATE_UPDATE', state: 'player_turn' }, '*');
                        }, 500);
                        return;
                    }
                    const mX = Math.round(this.activeTarget.position.x / this.gridSize);
                    const mZ = Math.round(this.activeTarget.position.z / this.gridSize);
                    const pX = Math.round(this.player.x);
                    const pZ = Math.round(this.player.z);
                    
                    const dx = pX - mX;
                    const dz = pZ - mZ;
                    
                    // Simple pathing: move 1 tile toward player
                    let stepX = 0;
                    let stepZ = 0;
                    if (Math.abs(dx) > Math.abs(dz)) {
                        stepX = Math.sign(dx);
                    } else if (Math.abs(dz) > 0) {
                        stepZ = Math.sign(dz);
                    } else if (Math.abs(dx) > 0) {
                        stepX = Math.sign(dx); // Fallback
                    }
                    
                    const nextX = mX + stepX;
                    const nextZ = mZ + stepZ;
                    
                    window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `Goblin AI: dx=${dx}, dz=${dz}, stepX=${stepX}, stepZ=${stepZ}. Validating space...` }, '*');

                    // Prevent entering player's exact tile
                    if ((nextX !== pX || nextZ !== pZ) && this.isValidGridSpace(nextX, nextZ) === true) {
                        this.activeTarget.userData.cx = nextX;
                        this.activeTarget.userData.cz = nextZ;
                        window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `Goblin steps to ${nextX}, ${nextZ}` }, '*');
                    } else if (Math.abs(dx) + Math.abs(dz) === 1) {
                        // Monster is adjacent, it attacks!
                        this.spawnCombatText("ATTACK!", "damage");
                        this.player.hp -= 10;
                        if (this.syncPlayerStats) this.syncPlayerStats();
                        window.parent.postMessage({ type: 'LOG_EVENT', logType: 'damage', text: 'Goblin strikes you for 10 damage!' }, '*');
                        
                        if (this.activeTarget.userData.attackAction) {
                            if (this.activeTarget.userData.idleAction) this.activeTarget.userData.idleAction.stop();
                            if (this.activeTarget.userData.walkAction) this.activeTarget.userData.walkAction.stop();
                            this.activeTarget.userData.attackAction.reset().setLoop(THREE.LoopOnce, 1).play();
                            this.activeTarget.userData._animKey = 'attack';
                        }
                    }
                    
                    // Yield turn back
                    setTimeout(() => {
                        this.combatState = 'player_turn';
                        window.parent.postMessage({ type: 'COMBAT_STATE_UPDATE', state: 'player_turn' }, '*');
                    }, 500); // 500ms to allow movement animation
                } else {
                    this.combatState = 'idle';
                }
            },

processFuzzyAI(delta) {
                if (!this.worldGroup) return;
                for (const child of this.worldGroup.children) {
                    if (child.userData && child.userData.id && !child.userData.type?.startsWith('loot') && !child.userData.isDead) {
                        if (child.userData.isStunned) continue; // Skip updates while stunned
                        if (child.userData.cx !== undefined && child.userData.cz !== undefined) {
                            const targetX = child.userData.cx * this.gridSize;
                            const targetZ = child.userData.cz * this.gridSize;
                            const dx = targetX - child.position.x;
                            const dz = targetZ - child.position.z;
                            const dist = Math.sqrt(dx*dx + dz*dz);
                            
                            if (dist > 0.05) {
                                // Move towards target
                                const speed = 4.0 * delta;
                                child.position.x += dx * speed;
                                child.position.z += dz * speed;
                                
                                // Rotate towards movement
                                const targetRot = Math.atan2(-dx, -dz);
                                let diff = targetRot - child.rotation.y;
                                while (diff > Math.PI) diff -= Math.PI * 2;
                                while (diff < -Math.PI) diff += Math.PI * 2;
                                child.rotation.y += diff * 10 * delta;
                                
                                // Walk animation
                                if (child.userData._animKey !== 'walk' && child.userData.walkAction) {
                                    if (child.userData.idleAction) child.userData.idleAction.stop();
                                    if (child.userData.attackAction) child.userData.attackAction.stop();
                                    child.userData.walkAction.reset().play();
                                    child.userData._animKey = 'walk';
                                }
                            } else {
                                // Snap to target
                                child.position.x = targetX;
                                child.position.z = targetZ;
                                
                                // Face player
                                const pDx = this.player.x * this.gridSize - child.position.x;
                                const pDz = this.player.z * this.gridSize - child.position.z;
                                const targetRot = Math.atan2(-pDx, -pDz);
                                let diff = targetRot - child.rotation.y;
                                while (diff > Math.PI) diff -= Math.PI * 2;
                                while (diff < -Math.PI) diff += Math.PI * 2;
                                child.rotation.y += diff * 5 * delta;
                                
                                // Idle animation
                                if (child.userData._animKey !== 'idle' && child.userData._animKey !== 'attack' && child.userData.idleAction) {
                                    if (child.userData.walkAction) child.userData.walkAction.stop();
                                    child.userData.idleAction.reset().play();
                                    child.userData._animKey = 'idle';
                                }
                            }
                        }
                    }
                }
            },

isValidGridSpace(cx, cz) {
                if(cx < 0 || cx >= this.mapWidth || cz < 0 || cz >= this.mapHeight) return false;
                if(this.mapData[cx]?.[cz]?.type === 'wall') return false;
                
                // Entity collision check
                if (this.worldGroup) {
                    for (const child of this.worldGroup.children) {
                        if (child.userData && child.userData.id && !child.userData.type?.startsWith('loot')) {
                            const eX = Math.round(child.position.x / this.gridSize);
                            const eZ = Math.round(child.position.z / this.gridSize);
                            if(cx === eX && cz === eZ) return child; // Return the exact object hit instead of boolean block
                        }
                    }
                }
                
                return true;
            },

checkGridLoS(x1, z1, x2, z2) {
                // Digital Differential Analyzer (DDA) for mathematically pure grid traversal
                let x = Math.round(x1);
                let z = Math.round(z1);
                const endX = Math.round(x2);
                const endZ = Math.round(z2);

                const dx = x2 - x1;
                const dz = z2 - z1;

                const stepX = Math.sign(dx);
                const stepZ = Math.sign(dz);

                // Infinity prevents division by zero if ray is perfectly straight
                const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
                const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

                // Grid boundaries are at 0.5 offsets because cells are integer aligned
                let tMaxX = stepX === 0 ? Infinity : (stepX > 0 ? (x + 0.5 - x1) * tDeltaX : (x1 - (x - 0.5)) * tDeltaX);
                let tMaxZ = stepZ === 0 ? Infinity : (stepZ > 0 ? (z + 0.5 - z1) * tDeltaZ : (z1 - (z - 0.5)) * tDeltaZ);

                let maxSteps = 100;

                while (maxSteps-- > 0) {
                    if (x >= 0 && x < this.mapWidth && z >= 0 && z < this.mapHeight) {
                        if (this.mapData[x] && this.mapData[x][z] && this.mapData[x][z].type === 'wall') {
                            return false;
                        }
                    } else {
                        return false; // Out of bounds
                    }

                    if (x === endX && z === endZ) return true; // Safely reached target

                    if (tMaxX < tMaxZ) {
                        tMaxX += tDeltaX;
                        x += stepX;
                    } else {
                        tMaxZ += tDeltaZ;
                        z += stepZ;
                    }
                }
                return true;
            },

flattenGoblin(mesh, damage) {
                if (!mesh || mesh.userData.isDead) return;

                mesh.userData.hp = Math.max(0, mesh.userData.hp - damage);
                mesh.userData.isHostile = true; // Turn red and aggro!
                window.parent.postMessage({
                    type: 'SHOW_COMBAT',
                    health: mesh.userData.hp,
                    maxHp: mesh.userData.maxHp ?? 50,
                    name: mesh.userData.name || 'Yakuza Goblin',
                    entityType: 'enemy'
                }, '*');
                this.spawnDamageText(damage, mesh.position, false);
                window.parent.postMessage({ type: 'LOG_EVENT', logType: 'damage', text: `\u{1FAA8} BOULDER crushes for ${damage} DMG!` }, '*');
                this.addCameraTrauma(0.9);
                this.triggerHitStop(100);
                
                // Ethereal bloom around monster on hit
                if (this.scene) {
                    const bloomLight = new THREE.PointLight(0x44ffff, 4.0, 5.0);
                    bloomLight.position.copy(mesh.position);
                    bloomLight.position.y += 1.0;
                    this.scene.add(bloomLight);
                    let fade = 1.0;
                    const fadeAnim = () => {
                        fade -= 0.05;
                        if (bloomLight.intensity !== undefined) bloomLight.intensity = 4.0 * Math.max(0, fade);
                        if (fade > 0) requestAnimationFrame(fadeAnim);
                        else this.scene.remove(bloomLight);
                    };
                    requestAnimationFrame(fadeAnim);
                }

                if (mesh.userData.ai) {
                    this.triggerRoomAggro(mesh);
                    if (this.tryCallForHelp) this.tryCallForHelp(mesh);
                }
                const lethal = mesh.userData.hp <= 0;
                if (lethal) mesh.userData.isDead = true;
                
                if (lethal) {
                    // Auto-Targeting Fix: Immediately clear active target if we killed it
                    if (this.activeTarget && this.activeTarget.userData.id === mesh.userData.id) {
                        this.activeTarget = null;
                        
                        // Instantly search for the NEXT nearest monster to snap to!
                        let minDist = 8.0; // Max snap radius for auto-targeting
                        let nextTarget = null;
                        
                        const entities = this.dynamicEntities || this.worldGroup.children;
                        entities.forEach(c => {
                            if (c.userData && c.userData.type === 'enemy' && !c.userData.isDead) {
                                const ex = c.position.x / this.gridSize;
                                const ez = c.position.z / this.gridSize;
                                const dist = Math.hypot(this.player.x - ex, this.player.z - ez);
                                if (dist < minDist) {
                                    minDist = dist;
                                    nextTarget = c;
                                }
                            }
                        });
                        
                        if (nextTarget) {
                            this.activeTarget = nextTarget;
                            this.activeTargetDist = minDist;
                            const ex = nextTarget.position.x / this.gridSize;
                            const ez = nextTarget.position.z / this.gridSize;
                            // Snap player rotation to face the new target immediately
                            this.player.rot = Math.atan2(-(ex - this.player.x), -(ez - this.player.z));
                            window.parent.postMessage({ type: 'SHOW_COMBAT', health: nextTarget.userData.hp || 100, maxHp: nextTarget.userData.maxHp ?? 50, name: nextTarget.userData.name || 'Yakuza Goblin', entityType: 'enemy' }, '*');
                        } else {
                            window.parent.postMessage({ type: 'HIDE_ALL' }, '*');
                        }
                    }

                    if (mesh.userData.bowAction) {
                        if (mesh.userData.idleAction) mesh.userData.idleAction.stop();
                        if (mesh.userData.walkAction) mesh.userData.walkAction.stop();
                        if (mesh.userData.attackAction) mesh.userData.attackAction.stop();
                        mesh.userData.bowAction.reset().setLoop(THREE.LoopOnce, 1).play();
                        mesh.userData._animKey = 'bow';
                    }
                    
                    // Notify Oni-Baba Engine of death
                    window.parent.postMessage({ type: 'MONSTER_DEATH', targetId: mesh.userData.id || mesh.uuid, targetType: mesh.userData.name }, '*');
                    const fadeStart = performance.now();
                    const fadeDur   = 1500; // longer to see bow
                    const initialY  = mesh.position.y;
                    const fadeAnim  = () => {
                        if (!mesh.parent) return;
                        const ft = Math.min(1.0, (performance.now() - fadeStart) / fadeDur);
                        
                        // Wait 500ms for bow animation to play before sinking
                        if (performance.now() - fadeStart > 500) {
                            const sinkT = Math.min(1.0, (performance.now() - (fadeStart + 500)) / 1000);
                            mesh.position.y = initialY - (sinkT * 1.5); // Sink down through floor
                            
                            const childMeshes = [];
                            mesh.traverse(n => { if (n.isMesh) childMeshes.push(n); });
                            childMeshes.forEach(cm => {
                                if (cm.material && cm.material.transparent) {
                                    cm.material.opacity = Math.max(0, 0.60 * (1.0 - sinkT));
                                }
                            });
                        }
                        if (ft < 1.0) requestAnimationFrame(fadeAnim);
                        else window.postMessage({ type: 'AI_DEATH', id: mesh.userData.id }, '*');
                    };
                    requestAnimationFrame(fadeAnim);
                    return; // Skip flattening
                }

                const childMeshes = [];
                mesh.traverse(n => { if (n.isMesh) childMeshes.push(n); });
                const origScale = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
                const flatStart = performance.now();
                const flatDur   = 230;

                mesh.userData.isStunned = true; // Block AI

                const flatAnim = () => {
                    if (!mesh.parent) return;
                    const t = Math.min(1.0, (performance.now() - flatStart) / flatDur);
                    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
                    mesh.scale.x = origScale.x * (1.0 + e * 2.4);
                    mesh.scale.y = origScale.y * Math.max(0.04, 1.0 - e * 0.97);
                    mesh.scale.z = origScale.z * (1.0 + e * 2.4);
                    if (t < 1.0) {
                        requestAnimationFrame(flatAnim);
                    } else {
                        // Survived — spring back to original scale over 350ms
                        const bnStart = performance.now();
                        const bnDur   = 350;
                        const bounceAnim = () => {
                            if (!mesh.parent) return;
                            const bt  = Math.min(1.0, (performance.now() - bnStart) / bnDur);
                            const inv = 1.0 - bt;
                            mesh.scale.x = origScale.x * (1.0 + inv * 2.4);
                            mesh.scale.y = origScale.y * Math.max(0.04 + bt * 0.96, 0.04);
                            mesh.scale.z = origScale.z * (1.0 + inv * 2.4);
                            if (bt < 1.0) {
                                requestAnimationFrame(bounceAnim);
                            } else {
                                mesh.scale.set(origScale.x, origScale.y, origScale.z);
                                
                                // Spawn Cartoon Stars Stun Animation
                                const starsGroup = new THREE.Group();
                                starsGroup.position.set(0, 1.4, 0); // Above head
                                
                                // Make a 5-point star shape
                                const starShape = new THREE.Shape();
                                const outerRadius = 0.15;
                                const innerRadius = 0.06;
                                for (let i = 0; i < 10; i++) {
                                    const r = (i % 2 === 0) ? outerRadius : innerRadius;
                                    const a = (i * Math.PI) / 5;
                                    if (i === 0) starShape.moveTo(Math.sin(a)*r, Math.cos(a)*r);
                                    else starShape.lineTo(Math.sin(a)*r, Math.cos(a)*r);
                                }
                                const extrudeSettings = { depth: 0.04, bevelEnabled: false };
                                const starGeo = new THREE.ExtrudeGeometry(starShape, extrudeSettings);
                                starGeo.center(); // Center the geometry
                                
                                const starMat = new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide });
                                
                                for (let i=0; i<4; i++) {
                                    const starMesh = new THREE.Mesh(starGeo, starMat);
                                    const angle = (i / 4) * Math.PI * 2;
                                    starMesh.position.set(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4);
                                    starsGroup.add(starMesh);
                                }
                                
                                mesh.add(starsGroup);
                                
                                const stunStart = performance.now();
                                const stunDur = 3000;
                                
                                const stunAnim = () => {
                                    if (!mesh.parent) return;
                                    const elapsed = performance.now() - stunStart;
                                    
                                    if (elapsed < stunDur) {
                                        starsGroup.rotation.y -= 0.05; // Spin the ring
                                        starsGroup.children.forEach(s => {
                                            s.rotation.x += 0.1; // Tumble the stars individually
                                            s.rotation.y += 0.05;
                                        });
                                        requestAnimationFrame(stunAnim);
                                    } else {
                                        mesh.remove(starsGroup);
                                        mesh.userData.isStunned = false; // Restore AI
                                    }
                                };
                                requestAnimationFrame(stunAnim);
                            }
                        };
                        requestAnimationFrame(bounceAnim);
                    }
                };
                requestAnimationFrame(flatAnim);
            },

triggerRoomAggro(hitMesh) {
                if (!hitMesh || !this.worldGroup || !this.rooms) return;
                
                const mX = Math.round(hitMesh.position.x / this.gridSize);
                const mZ = Math.round(hitMesh.position.z / this.gridSize);
                
                let currentRoom = null;
                for (let r of this.rooms) {
                    if (mX >= r.x && mX < r.x + r.w && mZ >= r.y && mZ < r.y + r.h) {
                        currentRoom = r;
                        break;
                    }
                }
                
                const targets = this.worldGroup.children.filter(child => {
                    if (!child.userData || !child.userData.ai || child.userData.isDead) return false;
                    const cX = Math.round(child.position.x / this.gridSize);
                    const cZ = Math.round(child.position.z / this.gridSize);
                    
                    // Same room
                    if (currentRoom && cX >= currentRoom.x && cX < currentRoom.x + currentRoom.w && cZ >= currentRoom.y && cZ < currentRoom.y + currentRoom.h) {
                        return true;
                    }
                    
                    // Or nearby adjacent (radius 12.0 for +1 room)
                    const dist = Math.hypot(cX - mX, cZ - mZ);
                    if (dist <= 12.0) {
                        return true;
                    }
                    
                    return false;
                });
                
                if (targets.length === 0) targets.push(hitMesh);

                targets.forEach(mesh => {
                    mesh.userData.isHostile = true;
                    if (mesh.userData.ai) {
                        mesh.userData.ai.aggression = Math.min(1.0, mesh.userData.ai.aggression + 0.5);
                        mesh.userData.ai.state = 'CHASING';
                    }
                    // Do not turn the border red, preserve the white border as requested.
                });
                
                window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `The room has turned hostile!` }, '*');
            },

            tryCallForHelp(mesh) {
                if (!mesh || !mesh.userData || !mesh.userData.ai || mesh.userData.isDead) return;
                
                // 5 minute cooldown (300,000 ms)
                const now = Date.now();
                if (mesh.userData.lastHelpCallTime && now - mesh.userData.lastHelpCallTime < 300000) {
                    return;
                }
                mesh.userData.lastHelpCallTime = now;
                
                window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: 'THEY YELL HELP!' }, '*');
                
                // Find open floor tiles ~10 units away
                const mX = Math.round(mesh.position.x / this.gridSize);
                const mZ = Math.round(mesh.position.z / this.gridSize);
                
                let possibleSpawns = [];
                for (let x = Math.max(0, mX - 12); x <= Math.min(this.mapWidth - 1, mX + 12); x++) {
                    for (let z = Math.max(0, mZ - 12); z <= Math.min(this.mapHeight - 1, mZ + 12); z++) {
                        const dist = Math.hypot(x - mX, z - mZ);
                        if (dist > 8 && dist < 12) {
                            const cell = this.mapData[x]?.[z];
                            if (cell && cell.type !== 'wall') {
                                // Check if occupied
                                let occupied = false;
                                if (this.worldGroup) {
                                    for (let child of this.worldGroup.children) {
                                        if (child.userData && child.userData.id && !child.userData.isDead) {
                                            const cX = Math.round(child.position.x / this.gridSize);
                                            const cZ = Math.round(child.position.z / this.gridSize);
                                            if (cX === x && cZ === z) occupied = true;
                                        }
                                    }
                                }
                                if (!occupied && (x !== Math.round(this.player.x) || z !== Math.round(this.player.z))) {
                                    possibleSpawns.push({x, z});
                                }
                            }
                        }
                    }
                }
                
                // Shuffle and pick 1-2
                possibleSpawns.sort(() => Math.random() - 0.5);
                const numImps = Math.floor(Math.random() * 2) + 1; // 1 or 2
                for (let i = 0; i < Math.min(numImps, possibleSpawns.length); i++) {
                    const spawn = possibleSpawns[i];
                    this.spawnImp(spawn.x, spawn.z);
                }
            },

            spawnImp(x, z) {
                if (!this.impCache || this.impCache.length === 0) {
                    // Load directly if cache empty
                    const gltfLoader = new THREE.GLTFLoader();
                    gltfLoader.load('./assets/models/monster/imp/yakuza.imp.animated.glb', (gltf) => {
                        this.initImp(gltf, x, z);
                    });
                    return;
                }
                
                const gltf = this.impCache.shift();
                this.initImp(gltf, x, z);
                
                // Refill cache
                const gltfLoader = new THREE.GLTFLoader();
                gltfLoader.load('./assets/models/monster/imp/yakuza.imp.animated.glb', (newGltf) => {
                    this.impCache.push(newGltf);
                });
            },

            initImp(gltf, x, z) {
                const imp = gltf.scene;
                const entityWrapper = new THREE.Group();
                entityWrapper.add(imp);
                
                if (gltf.animations && gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(imp);
                    const actions = gltf.animations.map(a => mixer.clipAction(a));
                    this.mixers.push(mixer);
                    entityWrapper.userData.mixer = mixer;
                    entityWrapper.userData.clips = gltf.animations;
                    entityWrapper.userData.actions = actions;

                    const _fc = (rx) => gltf.animations.find(a => rx.test(a.name.toLowerCase()));
                    const idleClip  = _fc(/idle/) || gltf.animations[0];
                    const walkClip  = _fc(/walk|run|move/) || gltf.animations[0];
                    const slashClip = _fc(/slash|attack|strike|swing/) || gltf.animations[0];
                    const bowClip   = _fc(/bow|death|die/) || gltf.animations[0];
                    
                    entityWrapper.userData.idleAction   = mixer.clipAction(idleClip);
                    entityWrapper.userData.walkAction   = mixer.clipAction(walkClip);
                    entityWrapper.userData.attackAction = mixer.clipAction(slashClip);
                    entityWrapper.userData.slashAction  = mixer.clipAction(slashClip);
                    entityWrapper.userData.bowAction    = mixer.clipAction(bowClip);
                    entityWrapper.userData._animKey     = null;
                    
                    // Boot into walk loop because it will chase immediately
                    const walkAct = entityWrapper.userData.walkAction;
                    if (walkAct) { walkAct.reset(); walkAct.setLoop(THREE.LoopRepeat); walkAct.play(); }
                    entityWrapper.userData._animKey = 'walk';
                }
                
                // Apply Hologram Shader
                imp.traverse((child) => {
                    if (child.isMesh) {
                        const nativeMat = child.material;
                        const matName = nativeMat.name ? nativeMat.name.toLowerCase() : "";
                        const isEye = ['eye', 'pupil', 'sclera'].some(kw => matName.includes(kw));
                        
                        if (!isEye) {
                            const applyHoloLayer = (mat) => {
                                mat.transparent = true; mat.opacity = 0.55;
                                mat.blending = THREE.NormalBlending; mat.side = THREE.FrontSide; mat.depthWrite = false;
                                if (mat.roughness !== undefined) mat.roughness = 1.0;
                                if (mat.metalness !== undefined) mat.metalness = 0.0;
                                if (mat.emissive !== undefined) {
                                    mat.emissive.set("#00ffcc");
                                    mat.emissiveIntensity = 0.5;
                                }
                            };
                            if (Array.isArray(nativeMat)) nativeMat.forEach(applyHoloLayer);
                            else applyHoloLayer(nativeMat);
                            child.material = nativeMat;
                        } else {
                            child.material = new THREE.MeshBasicMaterial({ color: 0xffffff, skinning: true });
                        }
                        child.castShadow = false;
                        child.receiveShadow = true;
                        child.renderOrder = 10;
                    }
                });
                
                if (this.scaleModelToHeight) this.scaleModelToHeight(imp, 1.53);
                
                imp.updateMatrixWorld(true);
                const bbox = new THREE.Box3().setFromObject(imp);
                if (bbox.min.y !== 0) imp.position.y -= bbox.min.y;
                imp.rotation.y = -Math.PI / 2;
                
                const id = `mon_imp_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                entityWrapper.userData = {
                    ...entityWrapper.userData,
                    id, 
                    name: 'Yakuza Imp',
                    type: 'enemy', 
                    hp: 30, 
                    maxHp: 30,
                    weapon: "Serrated Dagger",
                    isHostile: true,
                    ai: { state: 'CHASING', aggression: 1.0, actionTimer: 0.5 }
                };
                
                entityWrapper.position.set(x * this.gridSize, 0, z * this.gridSize);
                
                // Add flat tactical base
                const monBase = new THREE.Group();
                monBase.name = "monBase";
                const fpvBaseMesh = new THREE.Mesh(new THREE.CircleGeometry(0.80, 64), new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide }));
                fpvBaseMesh.rotation.x = -Math.PI / 2;
                fpvBaseMesh.position.y = 0.01;
                const fpvBorderMesh = new THREE.Mesh(new THREE.RingGeometry(0.80, 0.95, 64), new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide }));
                fpvBorderMesh.position.z = 0.001;
                fpvBaseMesh.add(fpvBorderMesh);
                monBase.add(fpvBaseMesh);
                
                entityWrapper.userData.monBaseFpvCore = fpvBaseMesh;
                entityWrapper.userData.monBase = monBase;
                entityWrapper.userData.fpvBorderMesh = fpvBorderMesh;
                entityWrapper.userData.mapBorderMesh = fpvBorderMesh;
                
                if (this.worldGroup) {
                    this.worldGroup.add(monBase);
                    this.worldGroup.add(entityWrapper);
                }
                
                window.parent.postMessage({ type: 'SHOW_COMBAT', health: 30, maxHp: 30, name: 'Yakuza Imp', entityType: 'enemy' }, '*');
            },

checkTriggers() {
                // Calculate the exact grid coordinate 1 tile directly in front of the player
                const dirX = Math.round(-Math.sin(this.player.rot));
                const dirZ = Math.round(-Math.cos(this.player.rot));
                const playerGridX = Math.round(this.player.x / this.gridSize);
                const playerGridZ = Math.round(this.player.z / this.gridSize);
                
                const targetX = playerGridX + dirX;
                const targetZ = playerGridZ + dirZ;

                // Exit Stairs Logic Check
                if (this.mapData[playerGridX] && this.mapData[playerGridX][playerGridZ] && this.mapData[playerGridX][playerGridZ].type === 'stairs') {
                    if (!this.playerSteppedOnStairs) {
                        this.playerSteppedOnStairs = true;
                        window.parent.postMessage({ type: 'SHOW_EXIT' }, '*');
                    }
                } else {
                    if (this.playerSteppedOnStairs) {
                        this.playerSteppedOnStairs = false;
                        // Hiding is natively handled by the Panels UI when PLAYER_MOVE_STATE triggers, 
                        // but resetting this flag allows the exit modal to pop up again if they step back on it.
                    }
                }

                let foundNPC = null;
                let foundMonster = null;
                let closestDist = Infinity;
                let glowingTargets = []; // Array to hold targets that should glow
                let anyEnemyActive = false; // Tracks if any enemy is in combat/proximity
                
                // Scan worldGroup for entities at the target location (forgiving distance check)
                if (this.worldGroup) {
                    for (const child of this.worldGroup.children) {
                        if (child.userData && child.userData.id) {
                            // OPTIMIZATION: Skip all static geometry (walls, floors, pots). 
                            // Only run 3D matrix math and Bresenham checks on AI entities!
                            if (child.userData.type !== 'enemy' && child.userData.type !== 'gambler') continue;
                            
                            const eX = child.position.x / this.gridSize;
                            const eZ = child.position.z / this.gridSize;
                            
                            // Check distance instead of exact grid match since models sit at exact center
                            const dist = Math.hypot(this.player.x - eX, this.player.z - eZ);
                            
                            // True 3D FPV calculations utilizing Global vectors to prevent GC spills
                            this._ct_mPos.copy(child.position);
                            this._ct_mPos.y += 1.0;
                            this._ct_cPos.copy(this.camera.position);
                            const dist3D = this._ct_cPos.distanceTo(this._ct_mPos);
                            
                            this._ct_dirFromPlayer3D.subVectors(this._ct_mPos, this._ct_cPos).normalize();
                            this.camera.getWorldDirection(this._ct_camDir);
                            const dot = this._ct_camDir.dot(this._ct_dirFromPlayer3D);
                            
                            let panelHasLoS = false;
                            
                            // Tactical RPG Distance Rules:
                            // 1. The combat panels ready themselves when a monster is close (<= 10.0 tiles)
                            // 2. You must be facing the monster (dot > 0.4)
                            let makesCombat = false;
                            
                            // 3. YOU MUST HAVE LINE OF SIGHT! (Bresenham checks ONLY for AI, not walls)
                            let hasLoS = false;
                            if ((child.userData.type === 'enemy' || child.userData.type === 'gambler') && dist <= 14.0) {
                                const playerGridX = Math.round(this.player.x);
                                const playerGridZ = Math.round(this.player.z);
                                const childGridX = Math.round(child.position.x / this.gridSize);
                                const childGridZ = Math.round(child.position.z / this.gridSize);
                                
                                hasLoS = this.hasLineOfSight(playerGridX, playerGridZ, childGridX, childGridZ);
                            }
                            
                            // Once locked, it stays locked up to 12.0 tiles for retreat/recoil, but ONLY if still in view
                            const isActiveTarget = this.activeTarget && this.activeTarget.userData.id === child.userData.id;
                            
                            if (hasLoS) {
                                if (isActiveTarget && dist <= 14.0 && dot > 0.25) {
                                    makesCombat = true; 
                                } else if (dist <= 12.0 && dot > 0.4) {
                                    makesCombat = true; 
                                }
                            }
                            // (Chat Bubble Halt mechanic removed)
                            // Eerie Ghost Glow triggers when interacting with player (<= 2.0 tiles / 20 feet)
                            let makesGlow = false;
                            if (dist <= 2.0 && dot > 0.707) {
                                makesGlow = true;
                            } else if (makesCombat) {
                                makesGlow = true; // Always glow in combat
                            }
                            if (child.userData.type === 'enemy') {
                                // Add continuous ethereal floating bob in FPV
                                child.userData.floatOffset = (child.userData.floatOffset || Math.random() * Math.PI * 2) + 0.035;
                                child.position.y = Math.sin(child.userData.floatOffset) * 0.12;

                                if (makesGlow) anyEnemyActive = true;
                                
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
                                
                                // GPU OPTIMIZATION: Only add to the expensive OutlinePass if the player is actively interacting/fighting
                                if (makesGlow) {
                                    glowingTargets.push(...child.userData.glowMeshes);
                                }
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
                    if (anyEnemyActive) {
                        this.outlinePass.edgeThickness = 0.5;
                        this.outlinePass.edgeStrength = 8.0;
                        this.outlinePass.edgeGlow = 0.8;
                        this.outlinePass.visibleEdgeColor.setRGB(0, 4.0, 3.0);
                    } else {
                        // Distant ethereal thin outline
                        this.outlinePass.edgeThickness = 0.1;
                        this.outlinePass.edgeStrength = 2.0;
                        this.outlinePass.edgeGlow = 0.0;
                        this.outlinePass.visibleEdgeColor.setRGB(0, 1.0, 1.0);
                    }

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
                        this.combatState = 'idle';
                        window.parent.postMessage({ type: 'SHOW_GAMBLING' }, '*');
                    } else if (currentCmd === 'SHOW_COMBAT') {
                        if (this.combatState === 'idle') this.combatState = 'player_turn';
                        // Trigger combat float altitude
                        // We rely entirely on model.position.y lerping now to prevent the targeting circle from lifting
                        window.parent.postMessage({ 
                            type: 'SHOW_COMBAT', 
                            health: foundMonster.userData.hp ?? 50,
                            maxHp: foundMonster.userData.maxHp ?? 50,
                            name: foundMonster.userData.name || 'Yakuza Goblin',
                            entityType: foundMonster.userData.type || 'enemy',
                            distance: this.activeTargetDist 
                        }, '*');
                    } else {
                        this.combatState = 'idle';
                        // Reset all monster altitudes when combat drops
                        window.parent.postMessage({ type: 'HIDE_COMBAT' }, '*');
                    }
                } else if (currentCmd === 'SHOW_COMBAT' && Math.abs(this._lastSentDist - this.activeTargetDist) > 0.1) {
                    // Update distance dynamically if it changes significantly while UI is open
                    this._lastSentDist = this.activeTargetDist;
                    window.parent.postMessage({ 
                        type: 'SHOW_COMBAT', 
                        health: foundMonster.userData.hp ?? 50,
                        maxHp: foundMonster.userData.maxHp ?? 50,
                        name: foundMonster.userData.name || 'Yakuza Goblin',
                        entityType: foundMonster.userData.type || 'enemy',
                        distance: this.activeTargetDist 
                    }, '*');
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

syncPlayerStats() {
                window.parent.postMessage({ 
                    type: 'SYNC_STATS', 
                    hp: this.player.hp, 
                    maxHp: this.player.maxHp,
                    gold: this.player.gold, 
                    playerLevel: this.player.level,
                    xp: this.player.xp,
                    maxXp: this.player.nextXp,
                    str: this.player.str, dex: this.player.dex, con: this.player.con, 
                    int: this.player.int, wis: this.player.wis, cha: this.player.cha,
                    karma: this.player.karma
                }, '*');
            },

addXP(amount) {
                this.player.xp += amount;
                window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `You gained ${amount} XP.` }, '*');
                
                if (this.player.xp >= this.player.nextXp) {
                    this.player.level++;
                    this.player.xp -= this.player.nextXp;
                    this.player.nextXp = Math.floor(this.player.nextXp * 1.5);
                    
                    // Nethack style stat increment
                    const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
                    const boostStat = stats[Math.floor(Math.random() * stats.length)];
                    this.player[boostStat]++;
                    
                    // HP boost based on CON
                    const hpBoost = 10 + Math.floor((this.player.con - 10) / 2);
                    this.player.maxHp += hpBoost;
                    this.player.hp = this.player.maxHp; // Full heal on level up
                    
                    window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `*** LEVEL UP! You are now Level ${this.player.level}! Your ${boostStat.toUpperCase()} increased! ***` }, '*');
                }
                this.syncPlayerStats();
            },

generateRoomDescription(roomId) {
                const room = this.rooms.find(r => r.id === roomId);
                if (!room) return null;

                let desc = `[ROOM ${roomId}] `;

                if (roomId === 99) {
                    desc += "You have entered a strange, makeshift shop. Odd wares and ancient relics are scattered about.";
                } else if (roomId === 1) {
                    desc += `You stand at the entrance of Level ${this.level || 1}. The ancestral spirits watch you.`;
                } else {
                    const dojoDescs = [
                        "You step onto the woven tatami mats of a silent training hall. The smell of incense lingers.",
                        "Faded banners of forgotten samurai clans hang from the wooden rafters.",
                        "Bamboo practice swords lie scattered across the polished wooden floor.",
                        "A serene meditation chamber. Dust dances in the shafts of dim light.",
                        "The floor here is scarred with deep katana strikes from ancient duels.",
                        "A grand dojo room with a master's elevated platform at the far end.",
                        "Paper sliding doors (shoji) line the walls, though many are torn.",
                        "A martial arts weapons rack stands empty against the wall."
                    ];
                    desc += dojoDescs[roomId % dojoDescs.length];
                }

                // Check for stairs
                const hasStairsUp = this.mapData[room.center.x]?.[room.center.y - 2]?.type === 'stairs_up';
                const hasStairsDown = this.mapData[room.center.x]?.[room.center.y]?.type === 'stairs_down';
                if (hasStairsUp) {
                    desc += " A set of stone stairs leads back up.";
                }
                if (hasStairsDown) {
                    desc += " A dark stairwell descends deeper into the dungeon.";
                }

                // Check for mobs
                const mobsInRoom = this.mobs.filter(m => m.hp > 0 && Math.abs(m.x - room.center.x) < room.w/2 + 2 && Math.abs(m.z - room.center.y) < room.h/2 + 2);
                if (mobsInRoom.length > 0) {
                    const names = mobsInRoom.map(m => m.name || 'a monster');
                    const counts = {};
                    names.forEach(n => counts[n] = (counts[n] || 0) + 1);
                    const mobStrings = Object.entries(counts).map(([name, count]) => `${count} ${name}${count > 1 && !name.endsWith('s') ? 's' : ''}`);
                    
                    desc += ` You notice ${mobStrings.join(', ')} lurking nearby.`;
                } else if (roomId !== 99 && roomId !== 1) {
                    desc += " The room appears to be empty... for now.";
                }

                return desc;
            }
};

