export const CombatMixin = {
spawnCombatText(text, type = 'hit') {
                if (window.CombatEngine) window.CombatEngine.spawnCombatText(text, type);
            },

spawnSlashVFX() {
                const overlay = document.getElementById('slash-overlay');
                const vignette = document.getElementById('blood-vignette');
                if (!overlay) return;

                // Blood vignette pulse
                if (vignette) {
                    vignette.classList.add('active');
                    setTimeout(() => vignette.classList.remove('active'), 350);
                }

                // Three slash marks: left, centre, right
                const slashes = [
                    { r: '-50deg', tx: '-80px', ty: '-60px', h: '180px', delay: '0ms' },
                    { r: '-38deg', tx:   '0px', ty: '-90px', h: '220px', delay: '40ms' },
                    { r: '-26deg', tx:  '80px', ty: '-60px', h: '180px', delay: '80ms' },
                ];
                slashes.forEach(s => {
                    const el = document.createElement('div');
                    el.className = 'slash-mark';
                    el.style.setProperty('--r',  s.r);
                    el.style.setProperty('--tx', s.tx);
                    el.style.setProperty('--ty', s.ty);
                    el.style.height = s.h;
                    el.style.animationDelay = s.delay;
                    overlay.appendChild(el);
                    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); });
                });
            },


triggerCombatSequence(target) {
                if (!target || target.userData.combatIntroTriggered) return;
                target.userData.combatIntroTriggered = true;

                // Goblin retreat removed to allow adjacent blow trading
                // target.userData.retreatX = ...
                // target.userData.retreatZ = ...
                // target.userData.isRetreating = true;

                // Flanking Imps
                if (this.impCache && this.impCache.length >= 2) {
                    // Right vector
                    const rightX = Math.cos(this.player.rot);
                    const rightZ = -Math.sin(this.player.rot);

                    for(let i=0; i<2; i++) {
                        const impGltf = this.impCache[i];
                        const imp = impGltf.scene.clone(); // clone the cached scene
                        
                        const anchor = new THREE.Group();
                        anchor.add(imp);
                        
                        const sign = i === 0 ? -1 : 1;
                        anchor.position.set(
                            target.userData.retreatX + (rightX * 3.0 * sign * this.gridSize),
                            0, // Keep Y at 0 for now, float happens via baseY later
                            target.userData.retreatZ + (rightZ * 3.0 * sign * this.gridSize)
                        );
                        
                        anchor.scale.set(0.01, 0.01, 0.01);
                        anchor.userData = { 
                            type: 'imp', 
                            id: `imp_${Date.now()}_${i}`,
                            targetScale: 1.0,
                            baseY: 0
                        };
                        
                        // Animations
                        if (impGltf.animations.length > 0) {
                            const mixer = new THREE.AnimationMixer(imp);
                            const action = mixer.clipAction(impGltf.animations[0]);
                            action.play();
                            this.mixers.push(mixer);
                            anchor.userData.mixer = mixer;
                        }

                        // Glow Mats
                        imp.traverse((child) => {
                            if (child.isMesh) {
                                const mat = child.material.clone();
                                mat.transparent = false;
                                mat.opacity = 0.3;
                                mat.blending = THREE.NormalBlending;
                                mat.side = THREE.FrontSide;
                                mat.depthWrite = true;
                                if (mat.emissive !== undefined) {
                                    mat.emissive.set("#00ffcc");
                                    mat.emissiveIntensity = 0.4;
                                }

                                mat.onBeforeCompile = (shader) => {
                                    shader.fragmentShader = shader.fragmentShader.replace(
                                        '#include <emissivemap_fragment>',
                                        [
                                            '#ifdef USE_EMISSIVEMAP',
                                            '    vec4 emissiveMapColor = texture2D( emissiveMap, vUv );',
                                            '    totalEmissiveRadiance *= emissiveMapColor.rgb;',
                                            '#endif',
                                            'float baseBrightness = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
                                            'if (baseBrightness > 0.65) {', 
                                            '    totalEmissiveRadiance = vec3(2.0);', 
                                            '    diffuseColor.rgb = vec3(0.0);', 
                                            '}'
                                        ].join('\n')
                                    );
                                };
                                child.material = mat;
                                child.renderOrder = 10;
                            }
                        });
                        
                        // Copy Goblin's rotation
                        imp.rotation.y = -Math.PI / 2;
                        
                        let foundSkinned = false;
                        anchor.userData.glowMeshes = [];
                        anchor.traverse(n => {
                            if (n.isSkinnedMesh) {
                                anchor.userData.glowMeshes.push(n);
                                foundSkinned = true;
                            }
                        });
                        if (!foundSkinned) anchor.userData.glowMeshes.push(anchor);

                        this.worldGroup.add(anchor);
                    }
                }
            },

handleHaltedAttack() {
                if (this._haltPlayer && this.activeTarget) {
                    window.parent.postMessage({ type: 'FPV_ACTION', action: 'ATTACK' }, '*');
                    
                    // Removed chat dialogue as requested
                    
                    // Release the halt immediately so they can fight!
                    this._haltPlayer = false; 
                    return true;
                }
                return false;
            },

            applyAimAssist() {
                if (!this.worldGroup || !this.player) return;
                
                // If we have an active target lock, use it for perfect aim
                let closestEnemy = this.activeTarget;
                
                // Otherwise, fall back to proximity aim assist
                if (!closestEnemy || closestEnemy.userData.isDead) {
                    let minDist = 4.5; // Extended aim assist range
                    let closestCandidate = null;
                    const fovCone = Math.PI / 2.5; // ~72 degrees forward cone
                    
                    for (let c of this.worldGroup.children) {
                        if (c.userData && c.userData.type === 'enemy' && !c.userData.isDead) {
                            const ex = c.position.x / this.gridSize;
                            const ez = c.position.z / this.gridSize;
                            const dist = Math.hypot(this.player.x - ex, this.player.z - ez);
                            
                            if (dist < minDist) {
                                const dx = ex - this.player.x;
                                const dz = ez - this.player.z;
                                const angleToEnemy = Math.atan2(dx, dz);
                                
                                let diff = (this.player.rot - angleToEnemy) % (Math.PI * 2);
                                if (diff < -Math.PI) diff += Math.PI * 2;
                                if (diff > Math.PI) diff -= Math.PI * 2;
                                
                                if (Math.abs(diff) <= fovCone) {
                                    minDist = dist;
                                    closestCandidate = c;
                                }
                            }
                        }
                    }
                    if (closestCandidate) closestEnemy = closestCandidate;
                }
                
                if (closestEnemy) {
                    const ex = closestEnemy.position.x / this.gridSize;
                    const ez = closestEnemy.position.z / this.gridSize;
                    if (Math.hypot(ex - this.player.x, ez - this.player.z) > 0.01) {
                        const targetRot = Math.atan2(-(ex - this.player.x), -(ez - this.player.z));
                        
                        // Full lock-on for the attack
                        this.player.rot = targetRot;
                        this.activeTarget = closestEnemy;
                        
                        // Force side panel update just in case
                        window.parent.postMessage({ type: 'SHOW_COMBAT', health: closestEnemy.userData.hp || 100 }, '*');
                    }
                }
            },

            spawnProjectile(action, spellData) {
                this.applyAimAssist();
                const fwdX = -Math.sin(this.player.rot);
                const fwdZ = -Math.cos(this.player.rot);

                // Launch from just in front of player
                const startX = this.player.x * this.gridSize + fwdX * this.gridSize * 0.9;
                const startZ = this.player.z * this.gridSize + fwdZ * this.gridSize * 0.9;

                let projectileMesh = new THREE.Group();
                let speed = 25.0;
                let vY = 0;
                let isBoulder = false;

                // --- Universal Spell Marble Framework ---
                let useMarbleSequence = false;
                if (spellData && ['EARTH', 'FIRE', 'WIND', 'WATER'].includes(spellData.el)) {
                    useMarbleSequence = true;
                    
                    // 1. Outer Photorealistic Glass Shell (Geometry shared, Material unique for fading)
                    if (!this._sharedSpellGlassGeo) {
                        this._sharedSpellGlassGeo = new THREE.SphereGeometry(0.5, 32, 24);
                    }
                    const glassMat = new THREE.MeshStandardMaterial({
                        color: 0xffffff, transparent: true, opacity: 0.4,
                        roughness: 0.1, metalness: 0.8
                    });
                    const glassMarble = new THREE.Mesh(this._sharedSpellGlassGeo, glassMat);
                    projectileMesh.add(glassMarble);

                    // 2. PointLight for magical bloom (explodes on launch)
                    const bloomLight = new THREE.PointLight(0xffffff, 2.0, 8);
                    bloomLight.position.set(0, 0, 0);
                    projectileMesh.add(bloomLight);

                    // 3. Inner Elemental Container
                    const innerGroup = new THREE.Group();
                    projectileMesh.add(innerGroup);

                    // State Config
                    projectileMesh.userData.spellState = 'CHARGING';
                    projectileMesh.userData.age = 0;
                    projectileMesh.userData.glassRef = glassMarble;
                    projectileMesh.userData.innerGroup = innerGroup;
                    projectileMesh.userData.bloomLight = bloomLight;
                    projectileMesh.userData.chargeTime = 1.0; 

                    if (spellData.el === 'EARTH') {
                        isBoulder = true;
                        speed = 18.0;
                        vY = 16.0; // Launch UP towards ceiling
                        bloomLight.color.setHex(0xbdb76b); 
                        
                        if (!this._boulderSharedMat) {
                            this._boulderSharedMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.8, flatShading: true });
                            this._boulderSharedGeo = new THREE.DodecahedronGeometry(0.8, 2);
                        }
                        const finalMesh = new THREE.Mesh(this._boulderSharedGeo, this._boulderSharedMat);
                        innerGroup.add(finalMesh); // Add immediately to innerGroup instead of crystal
                        innerGroup.scale.setScalar(0.1); // Start tiny
                        
                        projectileMesh.userData.isEarth = true;
                        projectileMesh.userData.customUpdate = (t) => {
                            // Slowly grow and spin while charging
                            if (projectileMesh.userData.spellState === 'CHARGING') {
                                const growth = Math.min(1.0, projectileMesh.userData.age / projectileMesh.userData.chargeTime);
                                innerGroup.scale.setScalar(0.1 + growth * 0.9);
                                innerGroup.rotation.x += 0.05;
                                innerGroup.rotation.z += 0.05;
                            }
                        };
                        
                        projectileMesh.userData.finalMesh = null; // No morph needed

                    } else if (spellData.el === 'FIRE') {
                        speed = 22.0;
                        bloomLight.color.setHex(0xff4500); 

                        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 2), new THREE.MeshStandardMaterial({ color: 0xb71c1c, emissive: 0xff0000, emissiveIntensity: 4, flatShading: true }));
                        innerGroup.add(core);

                        projectileMesh.userData.isFireball = true;

                        const finalMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 2), new THREE.MeshStandardMaterial({ color: 0xb71c1c, emissive: 0x4a0000, emissiveIntensity: 2, flatShading: true }));
                        finalMesh.visible = false;
                        projectileMesh.userData.finalMesh = finalMesh;
                        projectileMesh.add(finalMesh);

                    } else if (spellData.el === 'WIND') {
                        speed = 20.0;
                        bloomLight.color.setHex(0xccffff);

                        const windCore = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 24), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.8}));
                        windCore.rotation.x = Math.PI / 2;
                        innerGroup.add(windCore);
                        
                        projectileMesh.userData.isWind = true;

                        const tornado = new THREE.Group();
                        const numSpirals = 2; 
                        const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
                        for(let i=0; i<numSpirals; i++) {
                            const pts = [];
                            const pointsCount = 40;
                            const phaseOffset = (i / numSpirals) * Math.PI * 2;
                            for(let j=0; j<=pointsCount; j++) {
                                const h = j / pointsCount; 
                                const r = Math.pow(h, 2.0) * 0.75 + 0.1; 
                                const y = (h - 0.5) * 1.25; 
                                const angle = h * Math.PI * 12 + phaseOffset; 
                                pts.push(new THREE.Vector3(Math.cos(angle)*r, y, Math.sin(angle)*r));
                            }
                            const curve = new THREE.CatmullRomCurve3(pts);
                            const geometry = new THREE.TubeGeometry(curve, 40, 0.05, 5, false);
                            tornado.add(new THREE.Mesh(geometry, mat));
                        }
                        tornado.visible = false;
                        projectileMesh.userData.finalMesh = tornado;
                        projectileMesh.add(tornado);

                    } else if (spellData.el === 'WATER') {
                        speed = 18.0;
                        vY = 2.0;
                        bloomLight.color.setHex(0x00bfff);

                        const geo = new THREE.SphereGeometry(0.42, 64, 64);
                        geo.computeVertexNormals();
                        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.5, vertexColors: true });
                        const fluid = new THREE.Mesh(geo, mat);
                        innerGroup.add(fluid);
                        
                        const pos = geo.attributes.position;
                        const originalYs = new Float32Array(pos.count);
                        for(let i=0; i<pos.count; i++) originalYs[i] = pos.getY(i);
                        geo.setAttribute('originalY', new THREE.BufferAttribute(originalYs, 1));
                        
                        const colors = new Float32Array(pos.count * 3);
                        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                        
                        projectileMesh.userData.isWater = true;
                        projectileMesh.userData.waveMorph = 0.0;
                        
                        projectileMesh.userData.customUpdate = (t) => {
                            const state = projectileMesh.userData.spellState;
                            const isCharging = state === 'CHARGING';
                            
                            // Shaking if charging
                            if (isCharging) {
                                innerGroup.position.set(
                                    (Math.random() - 0.5) * 0.08,
                                    (Math.random() - 0.5) * 0.08,
                                    (Math.random() - 0.5) * 0.08
                                );
                                innerGroup.rotation.y += 0.2; // Spinning powerball
                                innerGroup.rotation.x += 0.1;
                            } else {
                                innerGroup.position.set(0, 0, 0); // Reset shake
                                // Transition morph to wave
                                projectileMesh.userData.waveMorph = Math.min(1.0, projectileMesh.userData.waveMorph + 0.05);
                            }

                            const p = geo.attributes.position;
                            const origY = geo.attributes.originalY;
                            const c = geo.attributes.color;
                            const white = new THREE.Color(0xffffff);
                            const bsBlue = new THREE.Color(0x0d6efd); 
                            const deepBlue = new THREE.Color(0x0a58ca);
                            
                            for(let i=0; i<p.count; i++) {
                                const x = p.getX(i), z = p.getZ(i), oy = origY.getX(i);
                                const w = Math.sin(x * 6.0 + t * 4) * 0.05 + Math.cos(z * 5.0 + t * 3.5) * 0.05 + Math.sin((x+z)*10.0 + t*5.0) * 0.02;
                                
                                // Gradually lower the waterLevel from above the sphere (no truncation) to -0.05
                                const targetWaterLevel = -0.05;
                                const startWaterLevel = 1.0; 
                                const waterLevel = startWaterLevel - ((startWaterLevel - targetWaterLevel) * projectileMesh.userData.waveMorph);
                                
                                if (oy > waterLevel) {
                                    const dist2D = Math.sqrt(x*x + z*z);
                                    // Use absolute max radius for a generic taper when truncating
                                    const maxR = Math.max(0.01, Math.sqrt(Math.max(0, 0.42*0.42 - waterLevel*waterLevel)));
                                    let taper = 1.0 - Math.pow(dist2D/maxR, 4);
                                    if (taper < 0) taper = 0;
                                    p.setY(i, waterLevel + w * taper);
                                    const heightMix = Math.max(0, Math.min(1, w * 15.0)); 
                                    let col = bsBlue.clone().lerp(white, heightMix * 0.5);
                                    c.setXYZ(i, col.r, col.g, col.b);
                                } else {
                                    // Spherical powerball appearance
                                    p.setY(i, oy + w * 0.5); // Add slight ripple to full ball
                                    c.setXYZ(i, deepBlue.r, deepBlue.g, deepBlue.b);
                                }
                            }
                            p.needsUpdate = true;
                            c.needsUpdate = true;
                            fluid.geometry.computeVertexNormals();
                        };

                        const finalMesh = new THREE.Mesh(geo, mat); // Share geometry/material for wave
                        finalMesh.visible = false;
                        projectileMesh.userData.finalMesh = finalMesh;
                        projectileMesh.add(finalMesh);
                    }
                } else if (action === 'SHURIKEN') {
                    speed = 35.0;
                    vY = 2.5; // Slight upward launch for parabolic arc
                    
                    if (!this._cachedShurikenGeo) {
                        const starShape = new THREE.Shape();
                        const outerRadius = 1.4;
                        const innerRadius = 0.5;
                        for (let i = 0; i < 8; i++) {
                            const angle = (i * Math.PI) / 4;
                            const r = i % 2 === 0 ? outerRadius : innerRadius;
                            if (i === 0) starShape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                            else starShape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                        }
                        starShape.lineTo(outerRadius, 0);
                        const hole = new THREE.Path();
                        hole.absarc(0, 0, 0.25, 0, Math.PI * 2, false);
                        starShape.holes.push(hole);
                        this._cachedShurikenGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
                        this._cachedShurikenGeo.center();
                    }
                    const starMat = new THREE.MeshStandardMaterial({color: 0xffffff, metalness: 0.9, roughness: 0.1, emissive: 0x666666});
                    const starMesh = new THREE.Mesh(this._cachedShurikenGeo, starMat);
                    starMesh.scale.set(0.225, 0.225, 0.225); // 25% smaller
                    starMesh.rotation.x = Math.PI / 2;
                    
                    // Photorealistic aerofluid fast animation trail
                    const trailGeo = new THREE.ConeGeometry(0.4, 2.0, 32, 1, true); // smooth open ended cone
                    const trailMat = new THREE.MeshBasicMaterial({
                        color: 0xaaccff, // icy blue photorealistic whoosh
                        transparent: true,
                        opacity: 0.6,
                        blending: THREE.AdditiveBlending,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    const trail = new THREE.Mesh(trailGeo, trailMat);
                    trail.rotation.x = -Math.PI / 2; // Point cone backwards
                    trail.position.z = 1.0; // Behind star
                    
                    // Light bloom tracer
                    const tracerLight = new THREE.PointLight(0xaaccff, 2.0, 6.0);
                    tracerLight.position.set(0, 0, 0);
                    
                    projectileMesh.add(starMesh, trail, tracerLight);
                    projectileMesh.rotation.y = this.player.rot; // align with travel direction
                    
                    projectileMesh.userData.isShuriken = true;
                    projectileMesh.userData.spellState = 'FLYING';
                    projectileMesh.userData.customUpdate = (t) => {
                        starMesh.rotation.z -= 0.8; // Realistic high-speed spin
                        // Fast aerofluid pulsation and fade
                        const pulse = 1.0 + Math.sin(t * 50.0) * 0.1;
                        trail.scale.set(pulse, 1.0 + (pulse * 0.3), pulse);
                        trail.material.opacity = 0.3 + Math.random() * 0.4; 
                    };
                } else if (spellData && spellData.el === 'MISSILE') {
                    speed = 48.0;
                    vY = 2.0; // Upward arc for hyper-realistic gravity simulation
                    
                    // Create detailed WebGL Arrow
                    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8), new THREE.MeshStandardMaterial({color: 0x5C4033, roughness: 0.8})); 
                    shaft.rotation.x = Math.PI / 2;
                    
                    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2), new THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.9, roughness: 0.2})); 
                    head.rotation.x = Math.PI / 2; 
                    head.position.z = -0.5; // Front of arrow
                    
                    // Fletching (Feathers)
                    const fletchMat = new THREE.MeshStandardMaterial({color: 0xffffff, side: THREE.DoubleSide});
                    const fletch1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.2), fletchMat);
                    fletch1.rotation.y = Math.PI / 2; fletch1.position.z = 0.35;
                    const fletch2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.2), fletchMat);
                    fletch2.rotation.x = Math.PI / 2; fletch2.position.z = 0.35;
                    
                    // Air Disturbance Trail (Whoosh)
                    const trailGeo = new THREE.ConeGeometry(0.25, 2.0, 8, 1, true); // open ended cone
                    const trailMat = new THREE.MeshBasicMaterial({
                        color: 0xffffff,
                        transparent: true,
                        opacity: 0.3,
                        blending: THREE.AdditiveBlending,
                        side: THREE.BackSide,
                        depthWrite: false
                    });
                    const trail = new THREE.Mesh(trailGeo, trailMat);
                    trail.rotation.x = -Math.PI / 2; // Point cone backwards
                    trail.position.z = 1.0; // Behind arrow
                    
                    // Visual Tracer / Light Bloom
                    const tracerLight = new THREE.PointLight(0xffffff, 3.0, 8.0);
                    tracerLight.position.z = -0.5; // Attach to tip of the arrow
                    
                    projectileMesh.add(shaft, head, fletch1, fletch2, trail, tracerLight);
                    projectileMesh.rotation.y = this.player.rot;
                    
                    projectileMesh.userData.isArrow = true;
                    projectileMesh.userData.trailMesh = trail;
                    projectileMesh.userData.customUpdate = (t) => {
                        // Pulsate and stretch the trail to simulate fast air displacement and turbulence
                        const pulse = 1.0 + Math.sin(t * 30.0) * 0.2 + (Math.random() * 0.1);
                        trail.scale.set(pulse, 1.0 + (pulse * 0.5), pulse);
                        trail.material.opacity = 0.15 + Math.random() * 0.25; // intense flicker
                        
                        // Realistic aerodynamic rotation / rifling spin
                        // The arrow's velocity vector determines its physical pitch later, 
                        // but this z-rotation is the barrel rifling spin.
                        projectileMesh.rotation.z += 0.5; 
                    };
                    
                    projectileMesh.userData.spellState = 'FLYING';
                } else if (spellData && spellData.el === 'KATANA') {
                    speed = 35.0;
                    const slashGroup = new THREE.Group();
                    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), new THREE.MeshStandardMaterial({color: 0x222222}));
                    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 0.1), new THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.8, roughness: 0.2}));
                    blade.position.y = 0.5;
                    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), new THREE.MeshStandardMaterial({color: 0xaa8800}));
                    guard.position.y = 0.1;
                    
                    slashGroup.add(hilt, blade, guard);
                    
                    // Point forward
                    slashGroup.rotation.x = Math.PI / 2;
                    
                    projectileMesh.add(slashGroup);
                    projectileMesh.rotation.y = this.player.rot;
                    projectileMesh.userData.spellState = 'FLYING';
                    
                    projectileMesh.userData.customUpdate = (t) => {
                        // Spin wildly like a thrown weapon
                        slashGroup.rotation.z += 0.5;
                    };
                } else {
                    projectileMesh.userData.spellState = 'FLYING'; // Fallback
                }

                // If charging, launch slightly higher (chest height), else normal (knee height)
                const startHeight = useMarbleSequence ? 1.2 : 0.8;
                projectileMesh.position.set(startX, startHeight, startZ);

                projectileMesh.userData = Object.assign(projectileMesh.userData || {}, {
                    type: action,
                    isBoulder: isBoulder,
                    targetSpeedX: fwdX * speed,
                    targetSpeedY: vY,
                    targetSpeedZ: fwdZ * speed,
                    vX: useMarbleSequence ? 0 : fwdX * speed,
                    vY: useMarbleSequence ? 0 : vY,
                    vZ: useMarbleSequence ? 0 : fwdZ * speed,
                    spinAxis: new THREE.Vector3(0, 1, 0),
                    dmg: (spellData ? (spellData.dmgMin ? Math.floor(Math.random() * (spellData.dmgMax - spellData.dmgMin + 1)) + spellData.dmgMin : spellData.dmg) : 25) * (isBoulder ? 2 : 1),
                    active: true,
                    element: spellData ? spellData.el : 'NONE',
                    color: spellData ? spellData.color : 0xffffff,
                    trauma: spellData ? spellData.trauma : 0.2
                });

                this.scene.add(projectileMesh);
                this.boulders.push(projectileMesh);
                // Camera trauma is applied on LAUNCH now, unless it's a shuriken/missile
                if (!useMarbleSequence) this.addCameraTrauma(0.2);
                
                if (spellData) {
                    window.parent.postMessage({ type: 'LOG_EVENT', logType: 'damage', text: `${spellData.label} launched!` }, '*');
                }

                // Immediately flag target as hostile so the impending AI turn executes correctly
                if (this.activeTarget && !this.activeTarget.userData.isDead) {
                    this.activeTarget.userData.isHostile = true;
                }
            },

spawnPotionUse(action, spellData) {
                const fwdX = -Math.sin(this.player.rot);
                const fwdZ = -Math.cos(this.player.rot);

                const vial = new THREE.Group();
                const glassMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.3, metalness: 0.2 });
                const flask = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), glassMat);
                const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 16), glassMat); neck.position.y = 0.14;
                const liqMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.95 });
                const liq = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), liqMat);
                vial.add(flask, neck, liq);

                // Place right in front of camera
                const startPos = new THREE.Vector3(
                    this.camera.position.x + fwdX * 0.4,
                    this.camera.position.y - 0.2,
                    this.camera.position.z + fwdZ * 0.4
                );
                vial.position.copy(startPos);
                
                // Tilt to face camera somewhat
                vial.lookAt(this.camera.position);
                this.scene.add(vial);

                let frame = 0;
                const anim = () => {
                    frame++;
                    vial.rotation.x -= 0.08; // Tilt back
                    vial.position.y += 0.01; // Raise slightly
                    if (frame < 15) {
                        requestAnimationFrame(anim);
                    } else if (frame < 30) {
                        // Drop green particles
                        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), new THREE.MeshBasicMaterial({color: 0x00ff00}));
                        drop.position.copy(vial.position);
                        drop.position.y += 0.1;
                        this.scene.add(drop);
                        setTimeout(() => this.scene.remove(drop), 100);
                        vial.position.y -= 0.02; // lower
                        requestAnimationFrame(anim);
                    } else {
                        this.scene.remove(vial);
                        
                        // Apply effect
                        this.player.hp = Math.min(100, this.player.hp + Math.abs(spellData.dmg));
                        this.syncPlayerStats();
                        window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `${spellData.label} restores ${Math.abs(spellData.dmg)} HP!` }, '*');
                        
                        // Screen flash green
                        const flash = document.createElement('div');
                        flash.style.position = 'fixed'; flash.style.top = 0; flash.style.left = 0; flash.style.width = '100%'; flash.style.height = '100%';
                        flash.style.backgroundColor = 'rgba(0, 255, 0, 0.4)'; flash.style.pointerEvents = 'none'; flash.style.transition = 'opacity 0.5s ease'; flash.style.zIndex = 9999;
                        document.body.appendChild(flash);
                        setTimeout(() => flash.style.opacity = '0', 50);
                    }
                };
                requestAnimationFrame(anim);
            },

            spawnMeleeSlash(action, spellData) {
                this.applyAimAssist();
                const fwdX = -Math.sin(this.player.rot);
                const fwdZ = -Math.cos(this.player.rot);

                const slashGroup = new THREE.Group();
                const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), new THREE.MeshStandardMaterial({color: 0x222222}));
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.3), new THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.8, roughness: 0.2}));
                blade.position.y = 1.2;
                const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), new THREE.MeshStandardMaterial({color: 0xaa8800}));
                guard.position.y = 0.3;
                
                const swordContainer = new THREE.Group();
                swordContainer.add(hilt, blade, guard);
                slashGroup.add(swordContainer);

                const startPos = new THREE.Vector3(
                    this.camera.position.x + fwdX * 0.5 - Math.cos(this.player.rot)*0.3,
                    this.camera.position.y - 0.2,
                    this.camera.position.z + fwdZ * 0.5 + Math.sin(this.player.rot)*0.3
                );
                slashGroup.position.copy(startPos);
                
                // Angle blade: upright, swinging downward
                slashGroup.rotation.y = this.player.rot;
                slashGroup.rotation.x = Math.PI / 8; // Slight forward tilt
                slashGroup.rotation.z = -Math.PI / 4; // cocked back

                this.scene.add(slashGroup);

                // Swing animation
                let frame = 0;
                const anim = () => {
                    frame++;
                    slashGroup.rotation.z += 0.20; // swing forward
                    slashGroup.rotation.x += 0.05; // tilt down during swing
                    if (frame < 8) {
                        requestAnimationFrame(anim);
                    } else {
                        this.scene.remove(slashGroup);
                        
                        // Hit detection raycast
                        const target = this.activeTarget;
                        if (target && !target.userData.isDead && this.activeTargetDist <= spellData.range) {
                            this.triggerCombatSequence(target);
                            target.userData.isHostile = true;
                            target.userData.stateColor = '#ff4400';
                            if (target.userData.monBaseFpvCore) {
                                target.userData.monBaseFpvCore.material.color.setHex(0xff0000);
                                const targetMat = target.userData.monBaseFpvCore.material;
                                setTimeout(() => { if (targetMat) targetMat.color.setHex(0x050505); }, 500);
                            } else if (target.userData.monBase && target.userData.monBase.children[1]) {
                                target.userData.monBase.children[1].material.color.setHex(0xff0000);
                                const targetMat = target.userData.monBase.children[1].material;
                                setTimeout(() => { if (targetMat) targetMat.color.setHex(0xffffff); }, 500);
                            }
                            
                            // User request: no camera shake on hit, keep hitstop
                            // if (spellData.trauma > 0) this.addCameraTrauma(spellData.trauma);
                            this.triggerHitStop(40);     // 40ms frame freeze
                            
                            target.userData.hp -= spellData.dmg;
                            
                            // Melee Dismemberment Mechanic
                            if (Math.random() < 0.35) { // 35% chance to lop off an arm
                                const armGroup = new THREE.Group();
                                const armMesh = new THREE.Mesh(
                                    new THREE.CylinderGeometry(0.08, 0.06, 0.5), 
                                    new THREE.MeshStandardMaterial({
                                        color: 0x880000, 
                                        emissive: 0xff0000, 
                                        emissiveIntensity: 0.4,
                                        transparent: true,
                                        opacity: 0.75,
                                        depthWrite: false,
                                        blending: THREE.AdditiveBlending
                                    })
                                );
                                armMesh.rotation.x = Math.PI / 2;
                                armGroup.add(armMesh);
                                
                                armGroup.position.copy(target.position);
                                armGroup.position.y += 1.2;
                                armGroup.position.x += (Math.random() - 0.5) * 0.8;
                                armGroup.position.z += (Math.random() - 0.5) * 0.8;
                                
                                armGroup.userData = {
                                    vY: 1.5 + Math.random() * 2.0, 
                                    vX: (Math.random() - 0.5) * 3.0,
                                    vZ: (Math.random() - 0.5) * 3.0,
                                    rX: Math.random() * 0.3,
                                    rZ: Math.random() * 0.3
                                };
                                
                                this.scene.add(armGroup);
                                let armFrame = 0;
                                const fallAnim = () => {
                                    if (!this.scene) return;
                                    armFrame++;
                                    armGroup.userData.vY -= 0.15; // Gravity
                                    armGroup.position.x += armGroup.userData.vX * 0.03;
                                    armGroup.position.y += armGroup.userData.vY * 0.03;
                                    armGroup.position.z += armGroup.userData.vZ * 0.03;
                                    armGroup.rotation.x += armGroup.userData.rX;
                                    armGroup.rotation.z += armGroup.userData.rZ;
                                    
                                    if (armGroup.position.y <= 0.1) {
                                        armGroup.position.y = 0.1;
                                        armGroup.userData.vY = 0;
                                        armGroup.userData.vX = 0;
                                        armGroup.userData.vZ = 0;
                                        armGroup.userData.rX = 0;
                                        armGroup.userData.rZ = 0;
                                        
                                        // Fade out on floor
                                        armMesh.material.opacity = Math.max(0, armMesh.material.opacity - 0.01);
                                    }
                                    
                                    if (armFrame < 250 && armMesh.material.opacity > 0) {
                                        requestAnimationFrame(fallAnim);
                                    } else {
                                        this.scene.remove(armGroup);
                                    }
                                };
                                requestAnimationFrame(fallAnim);
                            }
                            
                            window.parent.postMessage({ type: 'SHOW_COMBAT', health: target.userData.hp, maxHp: target.userData.maxHp ?? 50, name: target.userData.name || 'Yakuza Goblin', entityType: target.userData.type || 'enemy' }, '*');
                            this.spawnDamageText(spellData.dmg, target.position, false);
                            window.parent.postMessage({ type: 'LOG_EVENT', logType: 'damage', text: `${spellData.label} hits for ${spellData.dmg} DMG!` }, '*');
                            
                            const knockDir = new THREE.Vector3().subVectors(target.position, this.camera.position).normalize();
                            knockDir.y = 0;
                            target.position.addScaledVector(knockDir, 0.4);
                            
                            if (target.userData.hp <= 0) window.postMessage({ type: 'AI_DEATH', id: target.userData.id }, '*');
                            
                            // Let the enemy retaliate/pursue
                            if (window.CombatEngine) setTimeout(() => { window.CombatEngine.processMonsterTurn(); }, 600); 
                            else setTimeout(() => { if (this.processMonsterTurn) this.processMonsterTurn(); }, 600);
                        } else {
                            window.parent.postMessage({ type: 'LOG_EVENT', logType: 'system', text: `${spellData.label} swings through the air!` }, '*');
                        }
                    }
                };
                requestAnimationFrame(anim);
            },

spawnRockExplosion(pos) {
                this._initParticleCache();
                for (let i = 0; i < 20; i++) {
                    const size = 0.06 + Math.random() * 0.22;
                    const isBox = Math.random() > 0.4;
                    const frag = new THREE.Mesh(
                        isBox ? this._particleCache.rock.geoBox : this._particleCache.rock.geoSphere, 
                        this._particleCache.rock.mats[Math.floor(Math.random() * this._particleCache.rock.mats.length)]
                    );
                    frag.scale.setScalar(size * 5); // Retain random sizing relative to base
                    frag.position.copy(pos);
                    frag.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
                    const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.6;
                    const elev  = 0.2 + Math.random() * 0.8;
                    const spd   = 3.5 + Math.random() * 5.0;
                    frag.userData = {
                        isRockFrag: true, sharedMaterial: true,
                        vX: Math.cos(angle) * Math.cos(elev) * spd,
                        vY: Math.sin(elev) * spd * 0.7 + 1.5,
                        vZ: Math.sin(angle) * Math.cos(elev) * spd,
                        rX: (Math.random() - 0.5) * 0.45,
                        rY: (Math.random() - 0.5) * 0.45,
                        rZ: (Math.random() - 0.5) * 0.45,
                        life: 55 + Math.floor(Math.random() * 30)
                    };
                    this.worldGroup.add(frag);
                }
                // Flash point light at impact point
                const flash = new THREE.PointLight(0xcc8833, 10.0, this.gridSize * 4);
                flash.position.copy(pos);
                this.scene.add(flash);
                setTimeout(() => this.scene.remove(flash), 250);
                this.addCameraTrauma(0.85);
                this.triggerHitStop(80);
            },

spawnFireExplosion(pos) {
                this._initParticleCache();
                for (let i = 0; i < 25; i++) {
                    const size = 0.1 + Math.random() * 0.3;
                    const frag = new THREE.Mesh(this._particleCache.fire.geo, Math.random() > 0.5 ? this._particleCache.fire.mat1 : this._particleCache.fire.mat2);
                    frag.scale.setScalar(size * 10);
                    frag.position.copy(pos);
                    const angle = Math.random() * Math.PI * 2;
                    const elev  = Math.random() * 0.5 + 0.2;
                    const spd   = 4.0 + Math.random() * 4.0;
                    frag.userData = {
                        isRockFrag: true, isFire: true, sharedMaterial: true,
                        vX: Math.cos(angle) * Math.cos(elev) * spd,
                        vY: Math.sin(elev) * spd * 1.2,
                        vZ: Math.sin(angle) * Math.cos(elev) * spd,
                        rX: Math.random() * 0.5, rY: Math.random() * 0.5, rZ: Math.random() * 0.5,
                        life: 20 + Math.floor(Math.random() * 20)
                    };
                    this.worldGroup.add(frag);
                }
                const flash = new THREE.PointLight(0xff5500, 15.0, this.gridSize * 5);
                flash.position.copy(pos);
                this.scene.add(flash);
                setTimeout(() => this.scene.remove(flash), 150);
                this.addCameraTrauma(0.85);
                this.triggerHitStop(80);
            },

spawnWaterSplash(pos) {
                this._initParticleCache();
                for (let i = 0; i < 25; i++) {
                    const size = 0.05 + Math.random() * 0.15;
                    const frag = new THREE.Mesh(this._particleCache.water.geo, this._particleCache.water.mat);
                    frag.scale.setScalar(size * 10);
                    frag.position.copy(pos);
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 2.0 + Math.random() * 4.0;
                    frag.userData = {
                        isRockFrag: true, sharedMaterial: true,
                        vX: Math.cos(angle) * spd,
                        vY: 2.0 + Math.random() * 4.0,
                        vZ: Math.sin(angle) * spd,
                        rX: 0, rY: 0, rZ: 0,
                        life: 30 + Math.floor(Math.random() * 20)
                    };
                    this.worldGroup.add(frag);
                }
                this.addCameraTrauma(0.5);
            },

spawnWindSwirl(target, pos) {
                this._initParticleCache();
                const numSwirls = 12;
                for(let i=0; i<numSwirls; i++) {
                    const mesh = new THREE.Mesh(this._particleCache.wind.geo, this._particleCache.wind.mat);
                    mesh.userData = {
                        isWindFrag: true, sharedMaterial: true,
                        target: target,
                        angle: Math.random() * Math.PI * 2,
                        radius: 0.4 + Math.random() * 0.6,
                        speed: 8.0 + Math.random() * 6.0,
                        life: 30 + Math.floor(Math.random() * 20),
                        basePos: pos ? pos.clone() : (target ? target.position.clone() : new THREE.Vector3())
                    };
                    
                    mesh.position.copy(mesh.userData.basePos);
                    mesh.position.y += Math.random() * 1.5;
                    this.worldGroup.add(mesh);
                }
            },

_initParticleCache() {
                if (this._particleCache) return;
                
                const stoneColors = [0x8B7355, 0x6B5B45, 0xA09080, 0x575050, 0xccbb99];
                const rockMats = stoneColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.93 }));
                
                this._particleCache = {
                    rock: {
                        geoBox: new THREE.BoxGeometry(0.2, 0.14, 0.24),
                        geoSphere: new THREE.SphereGeometry(0.2, 4, 4),
                        mats: rockMats
                    },
                    fire: {
                        geo: new THREE.BoxGeometry(0.1, 0.1, 0.1),
                        mat1: new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 2 }),
                        mat2: new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff2200, emissiveIntensity: 2 })
                    },
                    water: {
                        geo: new THREE.IcosahedronGeometry(0.1, 1),
                        mat: new THREE.MeshStandardMaterial({ color: 0x0d6efd, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.1 })
                    },
                    wind: {
                        geo: new THREE.CylinderGeometry(0, 0.1, 0.6, 3),
                        mat: new THREE.MeshBasicMaterial({ color: 0xddffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
                    }
                };
            },

spawnStunStars(mesh) {
                if (mesh.userData.hasStunEffect) return;
                mesh.userData.hasStunEffect = true;
                
                const stunGroup = new THREE.Group();
                // Position above head
                stunGroup.position.set(0, 2.5, 0); 
                mesh.add(stunGroup);
                
                const starGeo = new THREE.TetrahedronGeometry(0.2, 0);
                const starMat = new THREE.MeshBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
                
                for(let i=0; i<5; i++) {
                    const star = new THREE.Mesh(starGeo, starMat);
                    const angle = (i / 5) * Math.PI * 2;
                    star.position.set(Math.cos(angle) * 0.8, 0, Math.sin(angle) * 0.8);
                    
                    // Tilt the stars to look nice
                    star.rotation.x = Math.random() * Math.PI;
                    star.rotation.z = Math.random() * Math.PI;
                    stunGroup.add(star);
                }
                
                // Add to animation list so it spins
                if (!this.stunRings) this.stunRings = [];
                this.stunRings.push({
                    group: stunGroup,
                    parent: mesh,
                    speed: 3.0
                });
            }
};

