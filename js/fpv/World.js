// js/fpv/World.js
import { InputSystem } from './InputSystem.js';

export const WorldMethods = {
            buildWorldGeometry() {
                // Initialize geometry container to prevent "children of undefined" crashes on reset
                if (!this.worldGroup) {
                    this.worldGroup = new THREE.Group();
                }

                // Clear old geometry
                while (this.worldGroup.children.length > 0) {
                    this.worldGroup.remove(this.worldGroup.children[0]);
                }

                // Generate premium textures
                const floorTex = this.createDungeonFloorTexture();
                const wallTex = this.createDungeonWallTexture();
                const ceilTex = this.createDarkWoodRafterTexture();
                const objTex = this.makePaperTexture('#444444');

                // Fast Lambert Materials (no expensive GGX BRDF physics on 7 SpotLights)
                const mats = {
                  floor: new THREE.MeshLambertMaterial({ map: floorTex }),
                  ceil: new THREE.MeshLambertMaterial({
                    map: ceilTex,
                    color: 0xffffff,
                  }),
                  wall: new THREE.MeshLambertMaterial({
                    map: wallTex,
                    color: 0x333333,
                  }),
                  npc: new THREE.MeshLambertMaterial({
                    color: "#7cfc00",
                    map: objTex,
                  }),
                  monster: new THREE.MeshLambertMaterial({
                    color: "#b85450",
                    map: objTex,
                  }),
                };

                // Merge geometry for insane performance (instead of 1000s of distinct meshes)
                // NEW: Walls are 1.33 cubes high                // 1. Grid Walls
                const wallHeight = this.gridSize * 1.53;
                const wallGeo = new THREE.BoxGeometry(this.gridSize, wallHeight, this.gridSize);
                
                // 2. InstancedMesh for Insane Performance (1 draw call vs 2000+)
                let wallCount = 0;
                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        if (this.mapData[x]?.[z]?.type === 'wall') wallCount++;
                    }
                }

                const instancedWalls = new THREE.InstancedMesh(wallGeo, mats.wall, wallCount);
                instancedWalls.castShadow = true;
                instancedWalls.receiveShadow = true;
                // Save reference so the raycaster can find it later without filtering the scene graph
                this.walls = [instancedWalls]; 

                // Build pure mathematical AABB boxes for perfect Raycasting fallback
                this.wallBoxes = [];
                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        if (this.mapData[x]?.[z]?.type === 'wall') {
                            const minX = x * this.gridSize - (this.gridSize / 2);
                            const maxX = x * this.gridSize + (this.gridSize / 2);
                            const minZ = z * this.gridSize - (this.gridSize / 2);
                            const maxZ = z * this.gridSize + (this.gridSize / 2);
                            this.wallBoxes.push(new THREE.Box3(
                                new THREE.Vector3(minX, -1, minZ), // Floor overlap
                                new THREE.Vector3(maxX, wallHeight + 1, maxZ)
                            ));
                        }
                    }
                }

                const dummy = new THREE.Object3D();
                let wallIdx = 0;

                for (let x = 0; x < this.mapWidth; x++) {
                    for (let z = 0; z < this.mapHeight; z++) {
                        const cell = this.mapData[x]?.[z];
                        if (!cell) continue;

                        if (cell.type === 'wall') {
                            dummy.position.set(x * this.gridSize, wallHeight / 2, z * this.gridSize);
                            dummy.updateMatrix();
                            instancedWalls.setMatrixAt(wallIdx++, dummy.matrix);
                        }
                    }
                }
                
                instancedWalls.instanceMatrix.needsUpdate = true;
                this.worldGroup.add(instancedWalls);
                
                // Ceiling
                ceilTex.repeat.set(this.mapWidth/2, this.mapHeight/2);
                const ceilGeo = new THREE.PlaneGeometry(this.mapWidth * this.gridSize, this.mapHeight * this.gridSize);
                const ceiling = new THREE.Mesh(ceilGeo, mats.ceil);
                ceiling.rotation.x = Math.PI / 2;
                // Match the wall height exactly
                ceiling.position.set((this.mapWidth * this.gridSize)/2 - this.gridSize/2, wallHeight, (this.mapHeight * this.gridSize)/2 - this.gridSize/2);
                ceiling.layers.set(1); // Hide ceiling from the Orthographic map camera (which only renders layer 0)
                this.worldGroup.add(ceiling);

                // Floor
                floorTex.repeat.set(this.mapWidth, this.mapHeight); // Tile floor
                const floorGeo = new THREE.PlaneGeometry(this.mapWidth * this.gridSize, this.mapHeight * this.gridSize);
                const floor = new THREE.Mesh(floorGeo, mats.floor);
                floor.rotation.x = -Math.PI / 2;
                floor.position.set((this.mapWidth * this.gridSize)/2 - this.gridSize/2, 0, (this.mapHeight * this.gridSize)/2 - this.gridSize/2);
                this.worldGroup.add(floor);

                // Dynamic Mob Rendering
                const mobGeo = new THREE.BoxGeometry(1, 2, 1);
                let monCount = 0; let npcCount = 0;
                
                const buildEntity = (sp, isMon, mesh) => {
                    const id = isMon ? `mon_${++monCount}` : `npc_${++npcCount}`;
                    sp.id = id; // Keep track of ID to send to AI worker
                    mesh.userData = { id, type: isMon ? 'enemy' : 'gambler', hp: sp.hp };
                    
                    if (isMon) {
                        // Goblins have bottom origins, place flush with floor
                        mesh.position.set(sp.x * this.gridSize, 0, sp.z * this.gridSize);
                        
                        // Make monsters have a black selection circle base
                        const hudTexIdle = this.createStatusCircleTexture('#000000');
                        const hudTexHostile = this.createStatusCircleTexture('#ff0000');
                        const hudTexSearch = this.createStatusCircleTexture('#ff0000', false, '#000000');
                        
                        const circleGeo = new THREE.PlaneGeometry(this.gridSize * 0.9, this.gridSize * 0.9);
                        const circleMat = new THREE.MeshBasicMaterial({
                          map: hudTexIdle,
                          color: 0x666666, // Dimmed 80% to reduce floor washout
                          transparent: true,
                          opacity: 0.45,
                          depthWrite: false,
                        });
                        const circle = new THREE.Mesh(circleGeo, circleMat);
                        circle.rotation.x = -Math.PI / 2;
                        circle.position.y = 0.02; // Slightly above floor to prevent z-fighting
                        mesh.add(circle);
                        
                        // Cache textures to swap based on AI state
                        mesh.userData.texIdle = hudTexIdle;
                        mesh.userData.texHostile = hudTexHostile;
                        mesh.userData.texSearch = hudTexSearch;
                        
                        // Removed Flashlight Cone to preserve realistic lighting per user request
                        
                        mesh.userData.baseMat = circleMat; // Save reference for coloring later
                        // No searchLight attached
                        
                        this.testMonster = mesh;
                    } else {
                        // NPC boxes are centered, place at y=1
                        mesh.position.set(sp.x * this.gridSize, 1, sp.z * this.gridSize);
                        this.testNPC = mesh;
                    }

                    this.worldGroup.add(mesh);
                };

                // Load replacement monster model directly from user's remote GitHub repository
                const TARGET_ENEMY_MODEL = './assets/models/YakuzaGoblinGhost.2.glb';
                
                const gltfLoader = new THREE.GLTFLoader();
                gltfLoader.setCrossOrigin?.('anonymous');

                // Generate Ethereal Cinematic Mist Texture
                const mistCanvas = document.createElement('canvas');
                mistCanvas.width = 128; mistCanvas.height = 128;
                const mCtx = mistCanvas.getContext('2d');
                const mGrad = mCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
                mGrad.addColorStop(0, 'rgba(80, 200, 255, 0.6)');
                mGrad.addColorStop(0.3, 'rgba(60, 150, 255, 0.2)');
                mGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                mCtx.fillStyle = mGrad;
                mCtx.fillRect(0, 0, 128, 128);
                const mistTex = new THREE.CanvasTexture(mistCanvas);

    
                this.mobSpawns.forEach((sp, idx) => {
                    sp.type = 'monster';
                    
                    gltfLoader.load(TARGET_ENEMY_MODEL, (gltf) => {
                        // We use the raw scene directly since each spawn gets its own 'load' call (cached by browser)
                        const goblin = gltf.scene;
                        const entityWrapper = new THREE.Group();
                        entityWrapper.add(goblin);
                        
                        // Initialize Animation Pipeline
                        if (gltf.animations && gltf.animations.length > 0) {
                            const mixer = new THREE.AnimationMixer(goblin);
                            const actions = gltf.animations.map(a => mixer.clipAction(a));
                            
                            // Sequencer: 4=Bow, 2=Laugh, 0=Idle, 3=Look Around 
                            // Sequence: Bow -> Idle -> Look Around -> Laugh -> repeat
                            const seqIndices = [4, 0, 3, 2];
                            let currentSeqStep = 0;
                            
                            const playNextAnim = () => {
                                mixer.stopAllAction();
                                // Bounds safety check in case gltf models differ
                                const idx = seqIndices[currentSeqStep] % actions.length;
                                const act = actions[idx];
                                if (act) {
                                    act.reset();
                                    act.setLoop(THREE.LoopOnce, 1);
                                    act.clampWhenFinished = true;
                                    act.play();
                                }
                                currentSeqStep = (currentSeqStep + 1) % seqIndices.length;
                            };
                            
                            mixer.addEventListener('finished', playNextAnim);
                            playNextAnim(); // Kick off the loop immediately
                            
                            this.mixers.push(mixer);
                            entityWrapper.userData.mixer = mixer;
                            entityWrapper.userData.clips = gltf.animations;
                            entityWrapper.userData.actions = actions;
                        }
                        
                        
                        goblin.traverse((child) => {
                            if (child.isMesh) {
                                const nativeMat = child.material;
                                const matName = nativeMat.name ? nativeMat.name.toLowerCase() : "";
                                const meshName = child.name ? child.name.toLowerCase() : "";
                                
                                const eyeKeywords = ['eye', 'pupil', 'sclera', 'cornea', 'lens', 'iris'];
                                const isEye = eyeKeywords.some(kw => matName.includes(kw) || meshName.includes(kw));
                                
                                // Skip applying hologram transparency and neon color logic to the white eyes
                                if (!isEye) {
                                    // Apply neon cyan/green hologram rules directly to native material to preserve vertex colors and maps
                                    const applyHoloLayer = (mat) => {
                                        mat.transparent = false; // Set to false to remove internal mesh back-face double imagery sorting
                                        mat.opacity = 1.0; 
                                        mat.blending = THREE.NormalBlending;
                                        mat.side = THREE.FrontSide;
                                        mat.depthWrite = true;
                                        
                                        // Some native materials don't have emissive, so we check or fallback
                                        if (mat.emissive !== undefined) {
                                            mat.emissive.set(typeof this.fxConfig.emissiveColor === 'string' ? this.fxConfig.emissiveColor : "#00ffcc");
                                            mat.emissiveIntensity = this.fxConfig.emissiveIntensity;
                                        }

                                        // Custom Shader Injection: Isolate bright white texture regions (the eyes) from being tinted by the hologram!
                                        mat.onBeforeCompile = (shader) => {
                                            shader.fragmentShader = shader.fragmentShader.replace(
                                                '#include <emissivemap_fragment>',
                                                [
                                                    '#ifdef USE_EMISSIVEMAP',
                                                    '    vec4 emissiveMapColor = texture2D( emissiveMap, vUv );',
                                                    '    totalEmissiveRadiance *= emissiveMapColor.rgb;',
                                                    '#endif',
                                                    '// Check the brightness of the base texture map',
                                                    'float baseBrightness = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
                                                    'if (baseBrightness > 0.65) {', 
                                                    '    totalEmissiveRadiance = vec3(2.0); // Extreme white emissive override',
                                                    '    diffuseColor.rgb = vec3(0.0); // Zero out diffuse so red lights cannot reflect off it',
                                                    '}'
                                                ].join('\n')
                                            );
                                        };
                                    };

                                    if (Array.isArray(nativeMat)) {
                                        nativeMat.forEach(applyHoloLayer);
                                    } else {
                                        applyHoloLayer(nativeMat);
                                    }

                                    child.material = nativeMat;
                                } else {
                                  // Make eyes terrifyingly bright and pure white so Bloom pass triggers heavily
                                  const eyeMat = nativeMat.clone();
                                  if (eyeMat.color)
                                    eyeMat.color.setHex(0xffffff);
                                  eyeMat.emissive.setHex(0xffffff);
                                  eyeMat.emissiveIntensity = 1.0; // Reduced 80% to stop washout
                                  child.material = eyeMat;
                                }
                                
                                // Fix Z-Index sorting issue against the red targeting circle
                                child.renderOrder = 10; 
                            }
                        });

                        // Attach a strong pure white point light slightly in front and above the monster so it is well-lit
                        const frontLight = new THREE.PointLight(
                          0xffffff,
                          0.8,
                          this.gridSize * 1.5,
                        );
                        frontLight.position.set(0, 2.5, 1.5); // Above and in front (world +Z)
                        goblin.add(frontLight);

                        // Local Ghost PointLight removed to eliminate volumetric scatter haze
                        
                        // Adjust Y position to sit exactly on the floor (circle)
                        goblin.updateMatrixWorld(true);
                        const bbox = new THREE.Box3().setFromObject(goblin);
                        if (bbox.min.y !== 0) {
                            // Some models have meshes that hang slightly below true 0, offset them perfectly onto the floor
                            goblin.position.y -= bbox.min.y; 
                        }
                        
                        // Fix Rotation: Force to -Math.PI/2 to swing from 90 degrees Left to 90 degrees Right (facing player)
                        goblin.rotation.y = -Math.PI / 2;
                        
                        // Outline pass assignment moved to checkTriggers dynamically based on proximity
                        

                        buildEntity(sp, true, entityWrapper);
                    }, undefined, (e) => {
                        console.warn(`Failed to load Primary Model for spawn ${idx}, attempting local fallback:`, e?.message || e);
                        gltfLoader.load('./assets/models/YakuzaGoblinGhost.2.glb', (fallbackGltf) => {
                            const goblin = fallbackGltf.scene.clone();
                            const entityWrapper = new THREE.Group();
                            entityWrapper.add(goblin);
                            
                            goblin.traverse((child) => {
                                if (child.isMesh) {
                                    child.castShadow = true;
                                    child.receiveShadow = true;
                                }
                            });
                            
                            goblin.updateMatrixWorld(true);
                            goblin.position.y = 0;
                            goblin.rotation.y = Math.PI / 2;
                            
                            buildEntity(sp, true, entityWrapper);
                        }, undefined, (fallbackErr) => {
                            console.warn("CDN fallback also failed. Using BoxGeometry.");
                            const mesh = new THREE.Mesh(mobGeo, mats.monster);
                            buildEntity(sp, true, mesh);
                        });
                    });
                });

                this.scene.add(this.worldGroup);
            },

            initControls() {
                this.inputSystem = new InputSystem();
                this.keys = this.inputSystem.keys;

                // Movement lock release handled by combat/retreat logic exclusively
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

            isValidGridSpace(cx, cz) {
                if(cx < 0 || cx >= this.mapWidth || cz < 0 || cz >= this.mapHeight) return false;
                if(this.mapData[cx]?.[cz]?.type === 'wall') return false;
                
                // Entity collision check
                if (this.worldGroup) {
                    for (const child of this.worldGroup.children) {
                        if (child.userData && child.userData.id) {
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

            
};
