// import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
// import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
// import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Models } from "./models.js";

/**
 * Single Render Engine
 * Manages the 3D scene, dual cameras (FPV + Map), and rendering loop.
 * Implements Scissor Test for multi-viewport rendering on a single canvas.
 */

export class RenderEngine {
  constructor() {
    this.scene = null;
    this.renderer = null;
    this.fpvCamera = null;
    this.mapCamera = null;
    
    this.fpvContainer = null;
    this.mapContainer = null;
    
    this.objects = new Map(); // Track all 3D objects for culling
    this.playerMesh = null;
    
    // Physics
    this.world = null;
    this.physicsBodies = new Map(); // Map Mesh ID -> Body
    
    // Post-Processing
    this.fpvComposer = null;
    
    // Optimization & Stats
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 0;
    this.fpvFpsEl = document.getElementById('fpv-fps');
    this.mapFpsEl = document.getElementById('map-fps');
    
    this.clock = new THREE.Clock(); // For Physics Delta
    this.targetRotation = null; // For Smooth Rotation
  }

  init(fpvId, mapId) {
    this.fpvContainer = document.getElementById(fpvId);
    this.mapContainer = document.getElementById(mapId);
    this.fpvFpsEl = document.getElementById('fpv-fps');
    this.mapFpsEl = document.getElementById('map-fps');
    
    // 1. Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050510); 
    this.scene.fog = new THREE.FogExp2(0x050510, 0.03); 
    
    // 2. Setup Physics
    if (window.CANNON) {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        
        const physicsMat = new CANNON.Material("slipperyMaterial");
        const physicsContactMat = new CANNON.ContactMaterial(physicsMat, physicsMat, {
            friction: 0.0,
            restitution: 0.0
        });
        this.world.addContactMaterial(physicsContactMat);
    }
    
    // 3. Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true 
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    // Attach to Renderer Layer (Background)
    const layer = document.getElementById('renderer-layer');
    if (layer) {
        layer.appendChild(this.renderer.domElement);
    } else {
        console.warn("Renderer Layer not found, appending to body");
        document.body.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.position = 'fixed';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '0';
    }
    
    // 4. Setup Cameras
    this.setupCameras();

    // 5. Setup Lights
    this.setupLights();
    
    // 6. Setup Post-Processing
    this.setupPostProcessing();

    // 7. Start Loop
    this.animate();
    
    // 8. Handle Resize
    window.addEventListener("resize", () => this.resize());
    this.resize();

    // 9. Auto-PiP Map View (User Request)
    setTimeout(() => {
       if (window.app && window.app.togglePiP) {
           console.log("[RenderEngine] Auto-popping Map View...");
           window.app.togglePiP('map');
       }
    }, 500);
  }
  
  setupPostProcessing() {
      if (!window.THREE.EffectComposer) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      this.fpvComposer = new THREE.EffectComposer(this.renderer);
      
      // 1. Render Pass
      const renderPass = new THREE.RenderPass(this.scene, this.fpvCamera);
      this.fpvComposer.addPass(renderPass);
      
      // 2. Unreal Bloom (Cinematic Glow)
      // Resolution, Strength, Radius, Threshold
      const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
      bloomPass.strength = 0.8;
      bloomPass.radius = 0.5;
      bloomPass.threshold = 0.7;
      this.fpvComposer.addPass(bloomPass);
      
      // 3. FXAA (Anti-aliasing)
      if (window.THREE.FXAAShader) {
          const fxaaPass = new THREE.ShaderPass(window.THREE.FXAAShader);
          fxaaPass.uniforms['resolution'].value.set(1 / width, 1 / height);
          this.fpvComposer.addPass(fxaaPass);
      }
      
      console.log("[RenderEngine] Post-processing enabled (Bloom + FXAA)");
  }

  setupCameras() {
    // ... (unchanged)
    // FPV Camera
    // User request: "fov is wierd... make this more cinematic"
    // Reverting to a standard cinematic FOV of 100. 160 was way too high (fisheye).
    this.fpvCamera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.fpvCamera.rotation.order = 'YXZ'; 
    this.fpvCamera.position.set(0, 1.1, 0); 
    this.fpvCamera.rotation.x = -27 * (Math.PI / 180); 
    this.fpvCamera.layers.enable(1); // FPV Objects (Monsters)
    
    // Map Camera
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 10; 
    this.mapCamera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2, 
        frustumSize * aspect / 2, 
        frustumSize / 2, 
        frustumSize / -2, 
        1, 
        1000
    );
    this.mapCamera.position.set(0, 10, 0);
    this.mapCamera.lookAt(0, 0, 0);
    this.mapCamera.layers.enable(2); // Map Tokens
    this.mapCamera.layers.disable(1); // Hide FPV Monsters in Map
  }

  setupLights() {
    // 1. Ambient Light (Base visibility)
    // Increased intensity to 0.4 to fix "lighting looks bad" / too dark
    const ambientLight = new THREE.AmbientLight(0x222233, 0.4); 
    this.scene.add(ambientLight);
    
    // 2. Hemisphere Light (Sky/Ground contrast)
    // Increased intensity to 0.4
    const hemiLight = new THREE.HemisphereLight(0x6666aa, 0x222233, 0.4);
    hemiLight.position.set(0, 5, 0);
    this.scene.add(hemiLight);
    
    // 3. Directional Light (Main Key Light)
    // Warmer color (Moonlight/Lantern mix) and higher intensity (0.8)
    const dirLight = new THREE.DirectionalLight(0xffffee, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005; // Adjusted bias to reduce shadow acne
    this.scene.add(dirLight);
    
    // 4. Player Headlamp (Warm Lantern Spotlight)
    // Focused beam - Initially OFF until lantern is taken
    this.headlamp = new THREE.SpotLight(0xffaa00, 0, 25, Math.PI/6, 0.5, 1); // Intensity 0
    this.headlamp.position.set(0, 0.9, 0);
    this.headlamp.castShadow = true; 
    this.headlampTarget = new THREE.Object3D();
    this.headlampTarget.visible = false; // Hide debug box
    this.headlamp.target = this.headlampTarget;
    this.scene.add(this.headlamp);
    this.scene.add(this.headlampTarget);

    // 5. Flashlight Glow (Soft Warm Fill around player)
    this.flashlightGlow = new THREE.PointLight(0xffaa00, 0, 8); // Intensity 0
    this.flashlightGlow.position.set(0, 0.9, 0);
    this.scene.add(this.flashlightGlow);

    // Indicator Light (Self-illumination for map - Keep white for visibility)
    this.indicatorLight = new THREE.PointLight(0xffffff, 0.8, 2.0, 2.0);
    this.indicatorLight.position.set(0.05, 0.9, 0);
    this.scene.add(this.indicatorLight);
    
    // Lantern Item (Handheld Flashlight)
    this.flashlightGroup = new THREE.Group();
    this.scene.add(this.flashlightGroup);
    
    // 6. Rim Light (Subtle Backlight)
    this.rimLight = new THREE.PointLight(0x4444ff, 1.0, 5.0);
    this.rimLight.position.set(0, 2, 0); 
    this.rimLight.layers.set(1); 
    this.scene.add(this.rimLight);
    
    // Enable cameras to see Layer 1
    this.fpvCamera.layers.enable(1);
    this.mapCamera.layers.enable(1);
  }

  toggleFlashlight() {
      if (!this.headlamp || !this.flashlightGlow) return;
      
      const isOn = this.headlamp.intensity > 0;
      
      // Toggle
      this.headlamp.intensity = isOn ? 0 : 2.4;
      this.flashlightGlow.intensity = isOn ? 0 : 0.8;
      
      console.log(`[RenderEngine] Flashlight toggled: ${!isOn ? 'ON' : 'OFF'}`);
  }

  updatePlayer(x, z, rotation) {
    this.fpvCamera.position.set(x, 1.1, z);
    this.fpvCamera.rotation.y = rotation;
    
    // Store rotation for FOV-based attack detection
    if (this.onRotationUpdate) {
        this.onRotationUpdate(rotation);
    }
    
    // Update Headlamp & Glow (Attached to Camera/Player)
    if (this.headlamp) {
        // Headlamp moves with camera
        this.headlamp.position.set(x, 1.1, z);
        this.flashlightGlow.position.set(x, 1.1, z);
        
        const dirX = -Math.sin(rotation);
        const dirZ = -Math.cos(rotation);
        this.headlamp.target.position.set(x + dirX * 10, 0, z + dirZ * 10);
        
        // Front marker (disabled by user request "remove the green circle in front of player")
        // if (this.frontEllipse) {
        //     this.frontEllipse.position.set(x + dirX * 1, 0.01, z + dirZ * 1);
        //     this.frontEllipse.rotation.y = rotation;
        // }
    }
    
    // Update Map Camera to follow player (smooth tracking)
    if (this.mapCamera) {
        this.mapCamera.position.x += (x - this.mapCamera.position.x) * 0.1;
        this.mapCamera.position.z += (z - this.mapCamera.position.z) * 0.1;
    }  
    // Update Rim Light (Follow Player)
    if (this.rimLight) {
        this.rimLight.position.set(x, 2, z);
    }
    
    // Map camera follows player
    this.mapCamera.position.set(x, 10, z);
    this.mapCamera.lookAt(x, 0, z);
    
    // Update Player Physics Body
    // REMOVED: Do not override physics body position here. 
    // The physics engine drives the body, and we update the mesh/camera from it.
    // if (this.playerBody) {
    //     this.playerBody.position.set(x, 0.9, z);
    // }
    
    // Update Player Mesh
    if (this.playerMesh) {
        this.playerMesh.position.set(x, 0.9, z);
        this.playerMesh.rotation.y = rotation; 
    }
  }

  resize() {
    if (!this.renderer) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.renderer.setSize(width, height);
    
    // Update FPV Camera
    this.fpvCamera.aspect = width / height; 
    this.fpvCamera.updateProjectionMatrix();
    
    // Update Map Camera
    const aspect = width / height;
    const frustumSize = 10; // Placeholder - View engine.js first frustum
    this.mapCamera.left = frustumSize * aspect / -2;
    this.mapCamera.right = frustumSize * aspect / 2;
    this.mapCamera.top = frustumSize / 2;
    this.mapCamera.bottom = frustumSize / -2;
    this.mapCamera.updateProjectionMatrix();
    
    if (this.fpvComposer) {
        this.fpvComposer.setSize(width, height);
    }
  }
  
  updateMapCameraBounds() {
    if (!this.dungeonBounds || !this.mapCamera) return;
    
    const bounds = this.dungeonBounds;
    const padding = 2;
    const width = (bounds.maxX - bounds.minX) + padding * 2;
    const height = (bounds.maxZ - bounds.minZ) + padding * 2;
    const aspect = width / height;
    
    this.mapCamera.left = bounds.minX - padding;
    this.mapCamera.right = bounds.maxX + padding;
    this.mapCamera.top = bounds.minZ - padding;
    this.mapCamera.bottom = bounds.maxZ + padding;
    this.mapCamera.position.set(bounds.centerX, 10, bounds.centerZ);
    this.mapCamera.updateProjectionMatrix();
    
    console.log('[RenderEngine] Updated map camera bounds:', bounds);
  }

  animate() {
    this.frameStart = performance.now();
    requestAnimationFrame(() => this.animate());
    
    this.updateFPS();
    
    // Culling Update (Every Frame)
    this.cullObjects();
    
    // Variable Time Step for Smooth Movement
    const dt = this.clock.getDelta();
    const safeDt = Math.min(dt, 0.1); // Cap at 100ms to prevent spiral
    
    // Game Logic Update (Controller hook)
    if (this.onUpdate) {
        this.onUpdate(safeDt);
    }
    
    // Step Physics
    if (this.world) {
        // Use safeDt for physics to match render speed
        this.world.step(safeDt);
        
        // Sync Physics Bodies to Meshes
        this.physicsBodies.forEach((body, id) => {
            const mesh = this.objects.get(id); 
            if (mesh) {
                mesh.position.copy(body.position);
                mesh.quaternion.copy(body.quaternion);
            }
        });
        
        // Sync Player Mesh
        if (this.playerMesh && this.playerBody) {
            this.playerMesh.position.copy(this.playerBody.position);
        }
    }
    
    // Smooth Rotation Logic
    if (this.targetRotation !== undefined && this.targetRotation !== null) {
        const current = this.fpvCamera.rotation.y;
        const diff = this.targetRotation - current;
        if (Math.abs(diff) < 0.005) {
            this.fpvCamera.rotation.y = this.targetRotation;
            this.targetRotation = null;
        } else {
            // Smooth lerp (adjust 0.2 for speed)
            this.fpvCamera.rotation.y += diff * 0.2;
        }
        // Update player mesh rotation too
        if (this.playerMesh) this.playerMesh.rotation.y = this.fpvCamera.rotation.y;
    }
    
    // Update Animations
    this.objects.forEach((obj) => {
        if (obj.userData && obj.userData.mixer) {
            obj.userData.mixer.update(dt);
        }
    });
    
    // Update Player Animation
    if (this.playerMesh && this.playerMesh.userData && this.playerMesh.userData.mixer) {
        this.playerMesh.userData.mixer.update(dt);
    }
    
    // --- RENDER FPV VIEW ---
    if (this.fpvContainer) {
        const rect = this.fpvContainer.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const left = rect.left;
        const bottom = window.innerHeight - rect.bottom;
      
      this.renderer.setViewport(left, bottom, width, height);
      this.renderer.setScissor(left, bottom, width, height);
      this.renderer.setScissorTest(true);
      
      this.fpvCamera.aspect = width / height;
      this.fpvCamera.updateProjectionMatrix();
      
      if (this.fpvComposer) {
          this.fpvComposer.render();
      } else {
          this.renderer.render(this.scene, this.fpvCamera);
      }
    }
    
    // --- RENDER MAP VIEW ---
    if (this.mapContainer) {
        const rect = this.mapContainer.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const left = rect.left;
        const bottom = window.innerHeight - rect.bottom;
        
        if (width > 0 && height > 0) {
            this.renderer.setViewport(left, bottom, width, height);
            this.renderer.setScissor(left, bottom, width, height);
            this.renderer.setScissorTest(true);
            
            this.renderer.render(this.scene, this.mapCamera);
        }
    }
    
    // Forensics (After Render) - Throttle to save CPU
    if (this.frameCount % 60 === 0) {
        this.updateForensics();
    }
  }
  
  addPhysicsBody(mesh, id, shape, mass = 0) {
      if (!this.world) return;
      
      const body = new CANNON.Body({
          mass: mass, // 0 = Static
          position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
          shape: shape
      });
      
      // Sync initial rotation
      body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
      
      this.world.addBody(body);
      this.physicsBodies.set(id, body);
      
      // Store ID in body for collision detection
      body.gameId = id;
  }
  
  removeChunk(id) {
      // Remove Mesh
      const mesh = this.objects.get(id);
      if (mesh) {
          this.scene.remove(mesh);
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) mesh.material.dispose();
          this.objects.delete(id);
      }
      
      // Remove Body
      const body = this.physicsBodies.get(id);
      if (body) {
          this.world.removeBody(body);
          this.physicsBodies.delete(id);
      }
  }

  updateFPS() {
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastTime >= 1000) {
          this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
          this.frameCount = 0;
          this.lastTime = now;
          
          const colorClass = this.fps > 55 ? 'text-green-500' : (this.fps > 30 ? 'text-yellow-500' : 'text-red-500');
          
          if (this.fpvFpsEl) {
              this.fpvFpsEl.innerHTML = `<span class="${colorClass}">${this.fps} FPS</span>`;
          }
          if (this.mapFpsEl) {
              this.mapFpsEl.innerHTML = `<span class="${colorClass}">${this.fps} FPS</span>`;
          }
      }
  }

  cullObjects() {
      // --- ROBUST CULLING SYSTEM ---
      // Updates visibility based on FPV and Map Frustums
      
      // 1. Update FPV Frustum
      if (this.fpvCamera) {
          this.projScreenMatrix.multiplyMatrices(this.fpvCamera.projectionMatrix, this.fpvCamera.matrixWorldInverse);
          this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
      }
      
      // 2. Update Map Frustum
      if (!this.mapFrustum) {
          this.mapFrustum = new THREE.Frustum();
          this.mapProjScreenMatrix = new THREE.Matrix4();
      }
      if (this.mapCamera) {
          this.mapProjScreenMatrix.multiplyMatrices(this.mapCamera.projectionMatrix, this.mapCamera.matrixWorldInverse);
          this.mapFrustum.setFromProjectionMatrix(this.mapProjScreenMatrix);
      }
      
      let visibleCount = 0;
      const sphere = new THREE.Sphere();
      
      this.objects.forEach((obj) => {
          if (!obj.geometry || !obj.geometry.boundingSphere) return;
          
          // Use bounding sphere for fast check
          if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
          sphere.copy(obj.geometry.boundingSphere).applyMatrix4(obj.matrixWorld);
          
          // Visible if in FPV OR Map
          const visibleInFPV = this.frustum.intersectsSphere(sphere);
          const visibleInMap = this.mapFrustum.intersectsSphere(sphere);
          
          // Force visibility for lights or special objects if needed
          const isSpecial = obj.userData && (obj.userData.isLight || obj.userData.alwaysVisible);
          
          obj.visible = visibleInFPV || visibleInMap || isSpecial;
          
          if (obj.visible) visibleCount++;
      });
      
      // Log stats occasionally
      if (this.frameCount % 60 === 0) {
          // console.log(`[Culling] Visible: ${visibleCount} / ${this.objects.size}`);
      }
  }

  updateForensics() {
    const stats = document.getElementById('forensic-stats');
    
    // --- AGGRESSIVE CULLING SYSTEM ---
    // 1. Update FPV Frustum
    if (this.fpvCamera) {
        this.projScreenMatrix.multiplyMatrices(this.fpvCamera.projectionMatrix, this.fpvCamera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    }
    
    // 2. Update Map Frustum (Fix for Missing Map View)
    if (!this.mapFrustum) {
        this.mapFrustum = new THREE.Frustum();
        this.mapProjScreenMatrix = new THREE.Matrix4();
    }
    if (this.mapCamera) {
        this.mapProjScreenMatrix.multiplyMatrices(this.mapCamera.projectionMatrix, this.mapCamera.matrixWorldInverse);
        this.mapFrustum.setFromProjectionMatrix(this.mapProjScreenMatrix);
    }
    
    let visibleCount = 0;
    let lightCount = 0;
    let visibleLights = 0;
    
    // 3. Cull Objects
    this.objects.forEach((obj) => {
        const sphere = new THREE.Sphere(obj.position, 1.5); 
        
        // Visible if in FPV OR Map
        const visibleInFPV = this.frustum.intersectsSphere(sphere);
        const visibleInMap = this.mapFrustum.intersectsSphere(sphere);
        const isVisible = visibleInFPV || visibleInMap;
        
        obj.visible = isVisible;
        
        if (isVisible) {
            visibleCount++;
            obj.traverse((child) => {
                if (child.isLight) {
                    lightCount++;
                    visibleLights++;
                }
            });
        }
    });
    
    // 3. Cull Independent Dynamic Lights (if any tracked separately)
    // (We currently attach lights to objects or scene root)
    
    if (!stats || stats.offsetParent === null) return;
    
    const frameTime = (performance.now() - this.frameStart).toFixed(1);
    const fpsColor = this.fps > 55 ? 'text-green-500' : (this.fps > 30 ? 'text-yellow-500' : 'text-red-500');
    
    stats.innerHTML = `
        <div>FPS: <span class="${fpsColor}">${this.fps}</span></div>
        <div>Frame: <span class="${frameTime > 16 ? 'text-red-500' : 'text-white'}">${frameTime}ms</span></div>
        <div>Calls: ${this.renderer.info.render.calls}</div>
        <div>Tris: ${this.renderer.info.render.triangles}</div>
        <div>Objs: ${visibleCount}/${this.objects.size}</div>
        <div>Lights: ${visibleLights}/${lightCount}</div>
        <div>Bodies: ${this.physicsBodies.size}</div>
        <div>Mode: ${this.gameMode || 'N/A'}</div>
        <div class="col-span-2 text-[10px] text-stone-500 mt-1">
            Pos: ${this.fpvCamera.position.x.toFixed(2)}, ${this.fpvCamera.position.z.toFixed(2)} <br>
            Rot: ${(this.fpvCamera.rotation.y * (180/Math.PI)).toFixed(1)}°
        </div>
    `;
  }
  
  rotatePlayerSmooth(angle) {
      // Set target rotation relative to current snapped rotation
      // Snap current to nearest 90 to avoid drift accumulation
      const current = this.fpvCamera.rotation.y;
      const snapped = Math.round(current / (Math.PI / 2)) * (Math.PI / 2);
      this.targetRotation = snapped + angle;
  }

  // updateCulling removed (merged into updateForensics)
  
  // updateDebugStats removed - using panel headers and simple overlay if present

  getPlayerState() {
      const dir = new THREE.Vector3();
      this.fpvCamera.getWorldDirection(dir);
      return {
          position: this.fpvCamera.position.clone(),
          direction: dir
      };
  }
  
  createPlayerBody(x, z) {
      if (!this.world) return;
      
      // Physics Body
      this.playerBody = new CANNON.Body({
          mass: 1, // Dynamic
          fixedRotation: true, // Prevent rolling
          linearDamping: 0.9, // Stop sliding quickly
          position: new CANNON.Vec3(x, 0.9, z),
          shape: new CANNON.Sphere(0.2)
      });
      this.world.addBody(this.playerBody);
      
      // Visual Mesh (for Map View)
      this.playerMesh = Models.createPlayerMesh();
      this.playerMesh.position.set(x, 0.9, z);
      
      // Scale reset to 1.0 (Scaling is now handled inside Models.createPlayerMesh)
      this.playerMesh.scale.set(1.0, 1.0, 1.0);
      
      // Layer Management:
      // Layer 0: Default (World) - Visible to All
      // Layer 1: Monsters/RimLight - Visible to All
      // Layer 2: Player Mesh - Visible to Map Camera ONLY (Hidden from FPV)
      
      this.playerMesh.traverse((child) => {
          child.layers.set(2);
      });
      
      this.scene.add(this.playerMesh);
      
      // Ensure Cameras/Lights see the correct layers
      if (this.mapCamera) this.mapCamera.layers.enable(2);
      if (this.rimLight) this.rimLight.layers.enable(2);
      // FPV Camera does NOT enable Layer 2, so it won't see the player mesh (preventing clipping)
  }

  setPlayerVelocity(vx, vz) {
      if (this.playerBody) {
          this.playerBody.velocity.set(vx, 0, vz);
      }
      
      // Toggle Animation
      if (this.playerMesh && this.playerMesh.userData && this.playerMesh.userData.action) {
          const isMoving = Math.abs(vx) > 0.1 || Math.abs(vz) > 0.1;
          const action = this.playerMesh.userData.action;
          
          if (isMoving && !action.isRunning()) {
              action.play();
          } else if (!isMoving && action.isRunning()) {
              action.stop();
          }
      }
  }

  setBodyVelocity(id, vx, vz) {
      const body = this.physicsBodies.get(id);
      if (body) {
          body.velocity.set(vx, 0, vz);
      }
  }

  getBodyPosition(id) {
      const body = this.physicsBodies.get(id);
      if (body) {
          return body.position;
      }
      return null;
  }

  raycast(origin, direction, range) {
      if (!this.world) return null;
      
      const from = new CANNON.Vec3(origin.x, origin.y, origin.z);
      const to = new CANNON.Vec3(
          origin.x + direction.x * range,
          origin.y + direction.y * range,
          origin.z + direction.z * range
      );
      
      const result = new CANNON.RaycastResult();
      const ray = new CANNON.Ray(from, to);
      
      let hitBody = null;
      ray.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST }, (result) => {
          if (result.hasHit) {
              hitBody = result.body;
          }
      });
      
      if (hitBody && hitBody.gameId) {
          return { id: hitBody.gameId, distance: result.distance };
      }
      return null;
  }
  
  addChunk(mesh, id) {
      this.scene.add(mesh);
      this.objects.set(id, mesh);
  }

  showPath(points) {
      if (!this.pathMarkers) {
          this.pathMarkers = new THREE.Group();
          this.scene.add(this.pathMarkers);
      }
      
      // Clear old
      while(this.pathMarkers.children.length > 0){ 
          this.pathMarkers.remove(this.pathMarkers.children[0]); 
      }
      
      if (!points || points.length === 0) return;
      
      // Materials
      this.pathGroup = new THREE.Group();
      this.scene.add(this.pathGroup);
      
      const mat = new THREE.MeshBasicMaterial({ 
          color: 0x00ffff, 
          transparent: true, 
          opacity: 0.3,
          side: THREE.DoubleSide
      });
      
      const destMat = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00, 
          transparent: true, 
          opacity: 0.5,
          side: THREE.DoubleSide
      });
      
      const geo = new THREE.CircleGeometry(0.15, 16);
      const destGeo = new THREE.CircleGeometry(0.3, 32);
      
      points.forEach((p, i) => {
          const isDest = i === points.length - 1;
          const mesh = new THREE.Mesh(isDest ? destGeo : geo, isDest ? destMat : mat);
          
          mesh.position.set(p.x, 0.05, p.z);
          mesh.rotation.x = -Math.PI / 2;
          
          this.pathGroup.add(mesh);
      });
  }

  clearPath() {
      if (this.pathGroup) {
          this.scene.remove(this.pathGroup);
          // Dispose geometries/materials to avoid leaks?
          // For now, simple remove.
          this.pathGroup = null;
      }
  }

  getHitPoint(clientX, clientY) {
      if (!this.fpvContainer || !this.mapContainer) return null;
      
      const fpvRect = this.fpvContainer.getBoundingClientRect();
      const mapRect = this.mapContainer.getBoundingClientRect();
      
      let camera = null;
      let rect = null;
      
      // Check if click is in FPV
      if (clientX >= fpvRect.left && clientX <= fpvRect.right &&
          clientY >= fpvRect.top && clientY <= fpvRect.bottom) {
          camera = this.fpvCamera;
          rect = fpvRect;
      } 
      // Check if click is in Map
      else if (clientX >= mapRect.left && clientX <= mapRect.right &&
               clientY >= mapRect.top && clientY <= mapRect.bottom) {
          camera = this.mapCamera;
          rect = mapRect;
      }
      
      if (!camera || !rect) return null;
      
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      
      const hit = raycaster.ray.intersectPlane(plane, target);
      
      if (hit) {
          return target;
      }
      return null;
  }
}
