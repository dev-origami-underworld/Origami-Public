export const CoreMixin = {
  player: {
    name: "PLAYER",
    x: 5,
    z: 5,
    rot: 0,
    hp: 100,
    maxHp: 100,
    gold: 0,
    shopDebt: 0,
    autoTurnTarget: null,
    level: 1,
    xp: 0,
    nextXp: 100,
    karma: 0,
    str: 16,
    dex: 14,
    con: 15,
    int: 10,
    wis: 10,
    cha: 12,
  },

  lootItems: [],

  boulders: [],

  spells: [],

  gridSize: 2,

  mapData: [],

  mapWidth: 128,

  mapHeight: 128,

  headlamp: null,

  outerGlow: null,

  clock: null,

  mixers: [],

  activeTarget: null,

  frameCount: 0,

  lastFpsTime: 0,

  currentFps: 0,

  fxConfig: {
    // Glass & Transparency
    baseOpacity: 0.55,
    transmission: 0.0,
    roughness: 0.1,
    ior: 1.5,
    thickness: 0.5,

    // Emissive properties
    emissiveIntensity: 3.0,
    emissiveColor: "#00ffcc",

    // Outline properties
    edgeStrength: 8.0,
    edgeGlow: 3.0,
    edgeThickness: 4.0,
    visibleColor: "#00ccff",
    hiddenColor: "#00ccff",

    // Bloom properties
    bloomRadius: 0.6,
    bloomStrength: 0.8,
  },

  MOVE_SPEED: 1.82,

  ROT_SPEED: 2.2,

  BOB_AMP: 0.045,

  SWAY_AMP: 0.015,

  keys: { w: false, a: false, s: false, d: false },

  combatState: "idle",

  targetTile: null,

  playerTweenTimer: 0,

  isMoving: false,

  lastGridX: -1,

  lastGridZ: -1,

  wasIdle: true,

  bobTimer: 0,

  bobHeight: 0,

  bobSway: 0,

  turnCount: 0,

  actionTimePool: 0,

  gameTime: 0,

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

    // Initialize layout cache
    this.layoutData = { fpv: null };

    // Expose a direct update method for the Shell to call
    window.updateLayoutData = (data) => {
      this.layoutData = data;
    };

    // Start Render Loop ONLY after assets are completely loaded to prevent pop-in
    THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      const percent = (itemsLoaded / itemsTotal) * 100;
      const fill = document.getElementById("loading-bar-fill");
      if (fill) fill.style.width = percent + "%";

      const text = document.getElementById("loading-text");
      if (text) text.innerText = Math.round(percent) + "%";

      const file = document.getElementById("loading-file");
      if (file) {
        const filename = url.split("/").pop().split("?")[0];
        file.innerText = `Loading: ${filename}`;
      }
    };

    THREE.DefaultLoadingManager.onLoad = () => {
      // Start rendering now that the scene is fully populated
      if (!this.isRunning) {
        this.isRunning = true;
        if (this.renderer && this.scene && this.camera) {
          this.renderer.compile(this.scene, this.camera);
        }
        requestAnimationFrame(() => this.animate());
      }

      // Delay the removal of the loading screen so the engine can settle and compile shaders
      setTimeout(() => {
        const screen = document.getElementById("loading-screen");
        if (screen) {
          screen.style.opacity = "0";
          setTimeout(() => {
            if (screen.parentNode) screen.parentNode.removeChild(screen);
          }, 500);
        }
      }, 2500);
    };;

    // CRITICAL FIX: Force game to start after 3 seconds even if remote models fail to load due to CORS or timeouts.
    setTimeout(() => {
      if (!this.isRunning) {
        this.isRunning = true;
        if (this.renderer && this.scene && this.camera) {
          this.renderer.compile(this.scene, this.camera);
        }
        requestAnimationFrame(() => this.animate());
      }

      setTimeout(() => {
        const screen = document.getElementById("loading-screen");
        if (screen) {
          console.warn("Loading timeout reached. Forcing FPV engine start.");
          screen.style.opacity = "0";
          setTimeout(() => {
            if (screen.parentNode) screen.parentNode.removeChild(screen);
          }, 500);
        }
      }, 1500);
    }, 3000);
  },

  initWebGL() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a3f47); // Ghostly gray
    // Spooky dungeon haze — dark ominous dusty fog
    this.scene.fog = new THREE.FogExp2(0x0a0b10, 0.025);

    // Base FOV restored to 75 to prevent the UI/combat view from being overwhelmingly large
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(
      this.player.x * this.gridSize,
      1.6,
      this.player.z * this.gridSize,
    ); // Eye level
    this.camera.layers.enable(1); // Ensure FPV camera can see the ceiling (Layer 1)
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.x = -0.15; // Pitch down ~8.5 degrees statically
    this.camera.rotation.y = this.player.rot;

    const canvas = document.getElementById("fpv-canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Cap pixel ratio to 1.0 - on Retina screens pixelRatio=2 means 4x the pixels to render.
    // Post-processing bloom already softens edges; antialias=false also saves MSAA cost.
    this.renderer.setPixelRatio(1.0); // Clamped to 1.0 to prevent 4K Bloom/Outline resolution drops

    // --- PIP OVERLAY (Optimized for 60fps single-renderer architecture) ---
    this.pipContainer = document.createElement("div");
    this.pipContainer.style.position = "absolute";
    this.pipContainer.style.pointerEvents = "none";
    this.pipContainer.style.zIndex = "10"; // Above FPV, behind Panels
    this.pipContainer.style.borderRadius = "50%";
    this.pipContainer.style.overflow = "hidden";
    this.pipContainer.style.clipPath = "circle(50% at 50% 50%)";
    this.pipContainer.style.transform = "translateZ(0)"; // Force hardware clipping

    // We use this.renderer with viewport/scissor instead of dual webgl contexts
    // this.pipRenderer has been completely removed to save 50% GPU overhead
    // Vignette/chrome is owned by #moondial-wrapper in Panels iframe — no duplicate here.

    document.getElementById("game-container").appendChild(this.pipContainer);

    // Initialize default angles
    this.topDownPitch = 60;
    this.topDownYaw = -45;

    // Global shadow mapping enabled with PCFSoft for performance-friendly AAA shadow blurring
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Shift Optical Center UP by 150px so the Monster is not blocked by the UI panels at the bottom
    // Arguments: (fullWidth, fullHeight, xOffset, yOffset, width, height)
    this.camera.setViewOffset(
      window.innerWidth,
      window.innerHeight,
      0,
      150,
      window.innerWidth,
      window.innerHeight,
    );

    // Bloom removed completely based on user feedback

    // Setup Layers
    // Setup Layers
    // Layer 0: Default (Walls, Floors, Lights)
    // Layer 1: Components shared with PiP
    // Layer 2: Ceiling (Hidden from map view! FPV uses it)
    this.camera.layers.enable(1); // FPV sees layer 1
    this.camera.layers.enable(2); // FPV sees ceiling
    this.camera.layers.enable(3); // FPV sees PiP/Topdown specific models (like their own avatar)

    // (Removed ambientPlayerLight to prevent FPV whiteout and GPU lockups)

    this.targetLockOverlay = document.createElement("div"); // --- Baseline Lighting ---
    // Spooky lighting: deep indigo sky, near-black ground
    const hemisphereLight = new THREE.HemisphereLight(0x1a1040, 0x0a0a0a, 0.3);
    this.hemisphereLight = hemisphereLight;
    this.scene.add(hemisphereLight);

    // Sickly pale moonbeam — cool blue-green tint, very dim
    const dirLight = new THREE.DirectionalLight(0x8899aa, 0.12);
    this.dirLight = dirLight;
    const sunCenter = 150; // Approximates map center
    dirLight.position.set(sunCenter, 400, sunCenter + 100); // High above, shifted slightly Z so walls cast shadows backwards
    dirLight.target.position.set(sunCenter, 0, sunCenter);

    // Efficient Shadows: PCFSoft smooths 1024 perfectly at extreme scale. No FPS drain!
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 1000;
    dirLight.shadow.bias = -0.002;

    this.scene.add(dirLight);
    this.scene.add(dirLight.target);

    // Warm amber rim from below — lantern bounce off floor
    const rimLight = new THREE.DirectionalLight(0xff8833, 0.06);
    this.rimLight = rimLight;
    rimLight.position.set(-20, 40, -30);
    this.scene.add(rimLight);

    // Deep ambient — just enough to see silhouettes in shadow
    const ambientLight = new THREE.AmbientLight(0x110a1a, 0.9);
    this.ambientLight = ambientLight;

    // Allow cinematic Map View avatar (Layer 3) to receive ambient and directional lighting
    ambientLight.layers.enable(3);
    dirLight.layers.enable(3);
    hemisphereLight.layers.enable(3);

    // CRITICAL FIX: Ensure global lights ALSO illuminate the environment (Layer 1) during Top Down passes
    ambientLight.layers.enable(1);
    dirLight.layers.enable(1);
    hemisphereLight.layers.enable(1);

    this.scene.add(ambientLight);

    // Player Flashlight
    this.headlamp = new THREE.SpotLight(
      0xffe0a0, // Warm amber lantern colour
      0.02, // Very dim — darkness is the feature
      this.gridSize * 10,
      Math.PI / 7.5,
      0.6,
      1.5,
    ); // Tight warm cone, falls off fast
    this.headlamp.position.set(0, 0, 0);
    this.headlamp.target.position.set(0, 0, -1);

    this.outerGlow = new THREE.SpotLight(
      0xffffff,
      0.0,
      this.gridSize * 20,
      Math.PI / 8,
      0.2,
      0.8,
    ); // Zeroed out to prevent massive white bloom semicircle
    this.outerGlow.position.set(0, 0, 0);
    this.outerGlow.target.position.set(0, 0, -1);

    this.camera.add(this.headlamp);
    this.camera.add(this.headlamp.target);
    this.camera.add(this.outerGlow);
    this.camera.add(this.outerGlow.target);

    // Near-field fill — amber tinted, very short range, prevents pitch-black feet
    this.nearFieldLight = new THREE.SpotLight(
      0xffcc88,
      0.15,
      this.gridSize * 1.8,
      Math.PI / 2,
      0.9,
      2.0,
    );
    this.nearFieldLight.position.set(0, 0, 0);
    this.nearFieldLight.target.position.set(0, 0, -1);
    this.camera.add(this.nearFieldLight);
    this.camera.add(this.nearFieldLight.target);

    this.scene.add(this.camera); // Add camera to scene so child components render

    // References kept for flickering effect in animate()

    // Isometric Perspective Camera for tactical Dojo Underworld view
    // Narrow FOV (35) gives an orthographic feel while retaining 3D depth
    this.topDownCamera = new THREE.PerspectiveCamera(
      35,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.monsterCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.topDownCamera.layers.set(0);
    this.topDownCamera.layers.enable(1); // Real 3D graphics on map view
    this.topDownCamera.layers.enable(3); // CRITICAL: Expose the avatar tracking marker
    // Layer 2 = ceiling — explicitly NOT enabled so ceiling hides in map view

    // Initialize PiP state variables to prevent animate() crash
    this.cameraMode = "fpv";
    this._pipOrthoTarget = { hw: 10 * this.gridSize, hh: 10 * this.gridSize };
    this.pipDialCtx = null;

    // Holographic Top-Down Player Avatar (Premium Diorama Toy)
    this.playerAvatar = new THREE.Group();
    this.playerAvatar.layers.set(3); // Map view only

    // Add Layer 3 avatar light to brighten the topdown avatar without affecting FPV dungeon lighting
    const avatarLight = new THREE.PointLight(0xffffff, 2.5, 6.0, 1.0);
    avatarLight.layers.set(3); // ONLY illuminates layer 3 (avatar)
    avatarLight.position.set(0, 4, 0); // Position slightly above avatar
    this.playerAvatar.add(avatarLight);
    this.avatarLight = avatarLight; // Save ref for top-down boost

    const baseGroup = new THREE.Group();

    // White Border Base removed (green health ring)

    // Photorealistic Black Core (Obsidian Glass) for Player Map Marker
    const baseGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.08, 32);
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0x050505,
      metalness: 0.9,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.04;
    baseMesh.layers.set(3);

    // Photorealistic White 3D Torus Border (Optimized for 60fps)
    const borderGeo = new THREE.TorusGeometry(0.85, 0.08, 12, 32);
    const borderMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.6,
      emissive: 0x444444,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.rotation.x = -Math.PI / 2;
    borderMesh.position.y = 0.04;
    borderMesh.layers.set(3);
    baseGroup.add(borderMesh);

    // Remove PointLight (caused 30fps drop)
    // Use material emissive adjustments below instead.

    // White Directional Arrow (Nose)
    const noseGeo = new THREE.ConeGeometry(0.15, 0.4, 3);
    const noseMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x222222,
    });
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    noseMesh.rotation.x = -Math.PI / 2;
    noseMesh.position.set(0, 0.05, -0.6); // Pushed to front edge
    noseMesh.layers.set(3);

    baseGroup.add(baseMesh);
    baseGroup.add(noseMesh);
    // Important: Do not give the base any animation controllers, preserving the "do not animate circle" requirement
    this.playerAvatar.add(baseGroup);

    // --- Load 3D Player Avatar for Map View ---
    this.playerMixer = null;
    const playerModelUrls = [
      "./assets/models/player/Player.A.Walking.glb",
      "../assets/models/player/Player.A.Walking.glb",
      "./assets/models/Player.A.Walking.glb",
      "../assets/models/Player.A.Walking.glb",
      "assets/Player.A.Walking.glb",
      "https://www.markpeterson.info/Origami/assets/Player.A.Walking.glb",
      "https://markpeterson.info/Origami/assets/Player.A.Walking.glb",
    ];

    const loader = new THREE.GLTFLoader();
    if (window.location.protocol !== "file:" && loader.setCrossOrigin)
      loader.setCrossOrigin("anonymous");

    const initAvatar = (gltf) => {
      const avatarMesh = gltf.scene;

      // Scale increased by 10% (0.5 -> 0.55) to make player avatar slightly bigger
      const s = 0.55;
      avatarMesh.scale.set(s, s, s);
      avatarMesh.position.y += 0.02; // Lift slightly above circle

      // Force the avatar mesh to face the proper forward direction (-Z)
      avatarMesh.rotation.y = Math.PI;

      avatarMesh.traverse((child) => {
        child.layers.set(3); // CRITICAL: Recursively apply Layer 3 to ensure visibility in Map
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Brighten the dark player avatar without using expensive PointLights
          if (child.material) {
            child.material = child.material.clone();
            child.material.emissive = new THREE.Color(0x888888);
            child.material.emissiveIntensity = 2.0;
          }
        }
      });

      this.playerAvatar.add(avatarMesh);

      // Setup Animations
      if (gltf.animations && gltf.animations.length > 0) {
        this.playerMixer = new THREE.AnimationMixer(avatarMesh);
        const idleClip = gltf.animations.find((c) =>
          c.name.toLowerCase().includes("idle"),
        );
        const walkClip =
          gltf.animations.find(
            (c) =>
              c.name.toLowerCase().includes("walk") ||
              c.name.toLowerCase().includes("run"),
          ) ||
          gltf.animations[1] ||
          gltf.animations[0];

        this.playerIdleAction = idleClip
          ? this.playerMixer.clipAction(idleClip)
          : null;
        this.playerWalkAction = this.playerMixer.clipAction(walkClip);

        if (this.playerIdleAction) {
          this.playerIdleAction.play();
          this.playerMixer._current = "idle";
        }
        this.mixers.push(this.playerMixer);
      }
    };;

    const tryLoadPlayerModel = (urlIndex) => {
      if (urlIndex >= playerModelUrls.length) {
        console.warn(
          "Failed to load 3D player avatar. Falling back to geometric primitive.",
        );
        if (window.location.protocol === "file:") {
          console.warn(
            "🚨 CORS WARNING 🚨: You are running the game directly from file:// which blocks 3D model loading. To see models, please run a local web server (e.g., python3 -m http.server) and access the game via http://localhost:8000",
          );
        }
        return;
      }
      loader.load(playerModelUrls[urlIndex], initAvatar, undefined, () => {
        tryLoadPlayerModel(urlIndex + 1);
      });
    };

    tryLoadPlayerModel(0);

    this.scene.add(this.playerAvatar);

    this.cameraMode = "fpv";

    // --- Camera Trauma (AAA Hit-Stop & Visceral Feedback) ---
    this.cameraTrauma = 0;
    this.hitStopUntil = 0;

    this.addCameraTrauma = (amount) => {
      this.cameraTrauma = Math.min(this.cameraTrauma + amount, 1.0); // Cap at 1.0 (Maximum shake)
    };

    this.triggerHitStop = (ms) => {
      this.hitStopUntil = performance.now() + ms;
    };

    this.spawnCrosshair = (parentGrp, x, y, z) => {
      const crossGeo = new THREE.RingGeometry(0.1, 0.15, 4);
      const crossMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      const cross = new THREE.Mesh(crossGeo, crossMat);
      cross.position.set(x, y, z + 0.1);
      cross.rotation.z = Math.PI / 4;
      parentGrp.add(cross);
      let s = 1.0;
      const anim = setInterval(() => {
        s += 0.1;
        cross.scale.set(s, s, s);
        cross.material.opacity -= 0.1;
        if (cross.material.opacity <= 0) {
          clearInterval(anim);
          parentGrp.remove(cross);
          cross.geometry.dispose();
          cross.material.dispose();
        }
      }, 30);
    };

    // Persistent Photorealistic Lock-on Crosshair
    this.initPersistentCrosshair = () => {
      if (this.persistentCrosshair) return;
      this.persistentCrosshair = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(0.3, 0.35, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      this.persistentCrosshair.add(ring);

      const crossGeo = new THREE.PlaneGeometry(0.04, 0.8);
      const vMesh = new THREE.Mesh(crossGeo, ringMat);
      const hMesh = new THREE.Mesh(crossGeo, ringMat);
      hMesh.rotation.z = Math.PI / 2;
      this.persistentCrosshair.add(vMesh, hMesh);

      const dotGeo = new THREE.CircleGeometry(0.05, 16);
      const dotMesh = new THREE.Mesh(dotGeo, ringMat);
      this.persistentCrosshair.add(dotMesh);

      this.persistentCrosshair.position.set(0, 1.8, 0);
      this.persistentCrosshair.visible = false;
      this.scene.add(this.persistentCrosshair);
    };
    this.initPersistentCrosshair();

    // --- Floating Damage Numbers via DOM Projection ---
    this.spawnDamageText = (amount, position, isPlayerDamage = false) => {
      const vector = position.clone();
      vector.y += 0.8; // Chest/Head height
      vector.project(this.camera);

      const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

      const dmgEl = document.createElement("div");
      dmgEl.className = "combat-dmg-text";
      dmgEl.style.left = `${x}px`;
      dmgEl.style.top = `${y}px`;

      if (isPlayerDamage) {
        dmgEl.style.color = "#ff1111";
        dmgEl.style.fontSize = "clamp(44px, 10vmin, 80px)";
        // Player damage appears aggressively center-screen
        dmgEl.style.left = "50%";
        dmgEl.style.top = "50%";
        dmgEl.style.textShadow = "0 0 20px #ff0000, 3px 3px 0 #000";
      } else {
        dmgEl.style.color = "#ffffff";
      }

      dmgEl.textContent = `-${amount.toFixed(0)}`;
      document.getElementById("game-container").appendChild(dmgEl);

      // Garbage collection of CSS floating node
      setTimeout(() => {
        if (dmgEl && dmgEl.parentNode) {
          dmgEl.parentNode.removeChild(dmgEl);
        }
      }, 1200);
    };

    // -----------------------------------------------------
    // GHOSTBUSTER POST-PROCESSING PIPELINE
    // -----------------------------------------------------
    this.composer = new THREE.EffectComposer(this.renderer);
    this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

    // 1. Unreal Bloom Pass (Core Phantom Glow for SSS look and bright eyes)
    // Run bloom at half-res to save significant GPU fill-rate on Retina displays
    const bloomRes = new THREE.Vector2(
      Math.floor(window.innerWidth * 0.5),
      Math.floor(window.innerHeight * 0.5),
    );
    this.bloomPass = new THREE.UnrealBloomPass(
      bloomRes,
      0.8, // strength
      0.6, // radius
      2.0, // threshold (elevated to heavily restrict bloom strictly to emissive > 2.0 elements, stopping floor/stairs from bleeding)
    );
    // DISABLED: Bloom pass disabled to restore 60FPS based on fill-rate bottleneck
    // this.composer.addPass(this.bloomPass);

    // 2. Outline Pass (Neon Luminous Border around enemies)
    this.outlinePass = new THREE.OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.scene,
      this.camera,
    );
    this.outlinePass.edgeStrength = 2.0; // Reduced intensity
    this.outlinePass.edgeGlow = 0.8;
    this.outlinePass.edgeThickness = 0.125; // Thin ethereal edge (reduced 75%)
    this.outlinePass.pulsePeriod = 0;

    // Using setRGB with values > 1.0 forces it into HDR range so UnrealBloom catches it aggressively
    this.outlinePass.visibleEdgeColor.setRGB(0, 4.0, 3.0);
    // Disable hidden-edge color to prevent ethereal outlines rendering through solid walls via X-Ray depth clipping
    this.outlinePass.hiddenEdgeColor.setHex(0x000000);

    // CRITICAL FIX: Three.js r128 OutlinePass materials do NOT support skinning by default!
    // This causes the outline to freeze in T-Pose when approaching the camera.
    if (this.outlinePass.prepareMaskMaterial)
      this.outlinePass.prepareMaskMaterial.skinning = true;
    if (this.outlinePass.depthMaterial)
      this.outlinePass.depthMaterial.skinning = true;
    if (this.outlinePass.renderMaterial)
      this.outlinePass.renderMaterial.skinning = true;

    // OutlinePass added but only activated when selectedObjects.length > 0
    // When idle, composer is bypassed entirely → direct renderer.render() path for max FPS
    this.composer.addPass(this.outlinePass);
    this.outlinePass.selectedObjects = []; // Start empty — no cost until enemy targeted

    // 3. Toyland Tilt-Shift & Vignette Macro-Photography Pass
    const ToylandShader = {
      uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.006 }, // Blur strength
        center: { value: 0.5 }, // Focal point (Y axis)
        smoothness: { value: 0.35 }, // Size of the focal area
        vignetteAmount: { value: 0.95 },
        vignetteFalloff: { value: 0.15 },
      },
      vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
      fragmentShader: `
                        uniform sampler2D tDiffuse;
                        uniform float amount;
                        uniform float center;
                        uniform float smoothness;
                        uniform float vignetteAmount;
                        uniform float vignetteFalloff;
                        varying vec2 vUv;

                        // Pseudo-random noise for dithering
                        float random(vec2 p) {
                            return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453);
                        }

                        void main() {
                            vec4 color = vec4(0.0);
                            
                            // Tilt-Shift blur factor calculation based on distance from center Y
                            float distFromCenter = abs(vUv.y - center);
                            float blurFactor = smoothstep(smoothness - 0.1, smoothness + 0.2, distFromCenter);
                            
                            // 9-Tap Box Blur kernel
                            float offset = amount * blurFactor;
                            color += texture2D(tDiffuse, vUv + vec2(-offset, -offset));
                            color += texture2D(tDiffuse, vUv + vec2(0.0, -offset));
                            color += texture2D(tDiffuse, vUv + vec2(offset, -offset));
                            color += texture2D(tDiffuse, vUv + vec2(-offset, 0.0));
                            color += texture2D(tDiffuse, vUv + vec2(0.0, 0.0));
                            color += texture2D(tDiffuse, vUv + vec2(offset, 0.0));
                            color += texture2D(tDiffuse, vUv + vec2(-offset, offset));
                            color += texture2D(tDiffuse, vUv + vec2(0.0, offset));
                            color += texture2D(tDiffuse, vUv + vec2(offset, offset));
                            color /= 9.0;
                            
                            // Cinematic Vignette (darken corners to focus on center)
                            float dist = distance(vUv, vec2(0.5));
                            float vignette = smoothstep(0.8, vignetteFalloff, dist * vignetteAmount);
                            color.rgb *= vignette;

                            // Color Grading (increase contrast and saturation for "Toy" feel)
                            // 1. Contrast
                            color.rgb = (color.rgb - 0.5) * 1.15 + 0.5;
                            // 2. Saturation
                            float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                            color.rgb = mix(vec3(luminance), color.rgb, 1.25);
                            
                            // 3. Subtle Dither to prevent banding in dark areas
                            color.rgb += (random(vUv) - 0.5) * 0.02;

                            gl_FragColor = color;
                        }
                    `,
    };

    this.toyPass = new THREE.ShaderPass(ToylandShader);
    // DISABLED TOYLAND BLUR: The 9-tap blur is the primary 30FPS bottleneck.
    // this.composer.addPass(this.toyPass);

    // Restoring the composer so the OutlinePass (Ethereal Ghost Silhouette) remains active.

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;

      // Maintain the 150px optical shift dynamically upon resize
      this.camera.setViewOffset(
        window.innerWidth,
        window.innerHeight,
        0,
        150,
        window.innerWidth,
        window.innerHeight,
      );

      if (this.renderer) {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        if (this.outlinePass)
          this.outlinePass.setSize(window.innerWidth, window.innerHeight);
      }
    });

    this.clock = new THREE.Clock();
    this.mixers = [];
    this.raycaster = new THREE.Raycaster(); // Initialize raycaster here
    this.buildWorldGeometry();

    // Flashlight activates on MAGIC LANTERN card pickup (see checkTriggers)
  },

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

  setCameraAngle(type) {
    const presets = {
      flat: { pitch: 90, yaw: 0 }, // Pure top-down, zero yaw
      iso: { pitch: 60, yaw: -45 }, // Classic isometric diorama
      high: { pitch: 72, yaw: -30 }, // High oblique — reads depth clearly
      low: { pitch: 35, yaw: -55 }, // Low cinematic — dramatic horizon
    };
    const p = presets[type];
    if (!p) return;
    // Animate smoothly to target via _pipAngleTween
    this._pipAngleTween = {
      fromPitch: this.topDownPitch,
      fromYaw: this.topDownYaw,
      toPitch: p.pitch,
      toYaw: p.yaw,
      t: 0,
    };
  },

  initTuningUI() {
    const sSpeed = document.getElementById("tune-speed");
    const vSpeed = document.getElementById("val-speed");
    sSpeed.addEventListener("input", (e) => {
      this.MOVE_SPEED = parseFloat(e.target.value);
      vSpeed.textContent = this.MOVE_SPEED.toFixed(2);
    });

    const sBob = document.getElementById("tune-bob");
    const vBob = document.getElementById("val-bob");
    sBob.addEventListener("input", (e) => {
      this.BOB_AMP = parseFloat(e.target.value);
      vBob.textContent = this.BOB_AMP.toFixed(3);
    });

    const sSway = document.getElementById("tune-sway");
    const vSway = document.getElementById("val-sway");
    sSway.addEventListener("input", (e) => {
      this.SWAY_AMP = parseFloat(e.target.value);
      vSway.textContent = this.SWAY_AMP.toFixed(3);
    });
  },

  initComms() {
    // Deprecated UI_ACTION removed in favor of direct message parsing below
    // Listen to external commands (AI Brain & Master UI Router)
    window.addEventListener("message", (e) => {
      if (!e.data) return;

      let eventData = e.data;
      if (window.goddessAI && window.goddessAI.mutateEvent) {
        eventData = window.goddessAI.mutateEvent(eventData);
        if (eventData.type === "EVENT_CANCELLED") return;
      }

      if (eventData.type === "PIP_SYNC_RECT") {
        if (!this._pipRect)
          this._pipRect = {
            width: 300,
            height: 300,
            left: 0,
            top: 0,
            bottom: 0,
          };
        this._pipRect.width = eventData.width;
        this._pipRect.height = eventData.height;
        this._pipRect.left = eventData.left;
        this._pipRect.top = eventData.top;
        this._pipRect.bottom = eventData.bottom;
        return;
      } else if (eventData.type === "MONSTER_CAM_SYNC_RECT") {
        if (!this._monsterCamRect)
          this._monsterCamRect = {
            width: 0,
            height: 0,
            left: 0,
            top: 0,
            bottom: 0,
          };
        this._monsterCamRect.width = eventData.width;
        this._monsterCamRect.height = eventData.height;
        this._monsterCamRect.left = eventData.left;
        this._monsterCamRect.top = eventData.top;
        this._monsterCamRect.bottom = eventData.bottom;
        return;
      } else if (eventData.type === "MOON_PHASE") {
        const mpLabel = document.getElementById("moonphase-label");
        if (mpLabel) mpLabel.textContent = eventData.phase;
        return;
      } else if (eventData.type === "PIP_ZOOM") {
        this._pipLastInteractionTime = Date.now();
        if (!this._pipZoomScale) this._pipZoomScale = 0.5;
        this._pipZoomScale += eventData.delta * 0.1;
        this._pipZoomScale = Math.max(0.2, Math.min(2.0, this._pipZoomScale));
        return;
      } else if (eventData.type === "PIP_PERSPECTIVE") {
        if (eventData.preset) {
          this.setCameraAngle(eventData.preset);
          this._pipLastInteractionTime = Date.now();
          return;
        }
        // Legacy toggle fallback (no preset)
        if (!this._pipRot) this._pipRot = { theta: 0.5, phi: 0.96, radius: 35 };
        if (this._pipRot.phi < 0.1) {
          this._pipRot = { theta: 0.5, phi: 0.96, radius: 35 };
        } else {
          this._pipRot = { theta: 0, phi: 0, radius: 35 };
          this._pipPan = { x: 0, z: 0 };
        }
        this._pipLastInteractionTime = Date.now();
        return;
      } else if (eventData.type === "PIP_TOGGLE") {
        this.cameraMode = this.cameraMode === "fpv" ? "topdown" : "fpv";
        const label = this.cameraMode === "fpv" ? "FPV Mode" : "Top-Down Mode";
        window.parent.postMessage(
          {
            type: "LOG_EVENT",
            logType: "system",
            text: `\uD83D\uDDFA ${label}`,
          },
          "*",
        );
        this._pipPan = { x: 0, z: 0 };
        return;
      } else if (eventData.type === "PIP_ROTATE") {
        this._pipLastInteractionTime = Date.now();
        if (!this._pipRot) this._pipRot = { theta: 0.5, phi: 0.96, radius: 35 };
        this._pipRot.theta -= eventData.dx * 0.01;
        this._pipRot.phi -= eventData.dy * 0.01;
        this._pipRot.phi = Math.max(
          0.1,
          Math.min(Math.PI / 2 - 0.05, this._pipRot.phi),
        );
        return;
      } else if (eventData.type === "WAGER_RESOLVE") {
        if (eventData.win) {
          this.player.gold += eventData.amount;
          if (this.player.karma === undefined) this.player.karma = 0;
          this.player.karma += 1;
          window.parent.postMessage(
            { type: "LOG_EVENT", logType: "karma", text: "+1 Karma." },
            "*",
          );
          window.parent.postMessage(
            {
              type: "LOG_EVENT",
              logType: "system",
              text: `You WON the wager! +${eventData.amount} Gold!`,
            },
            "*",
          );
        } else {
          this.player.gold -= eventData.amount;
          window.parent.postMessage(
            {
              type: "LOG_EVENT",
              logType: "system",
              text: `You LOST the wager! -${eventData.amount} Gold.`,
            },
            "*",
          );
        }
        this.syncPlayerStats();
        return;
      } else if (eventData.type === "PIP_PAN") {
        this._pipLastInteractionTime = Date.now();
        if (!this._pipPan) this._pipPan = { x: 0, z: 0 };
        if (!this._pipRot) this._pipRot = { theta: 0.5, phi: 0.96 };
        const zoomBase = this._pipZoom || 1;
        const panSpeed = 0.05 / zoomBase;
        const pX = eventData.dx * panSpeed;
        const pZ = eventData.dy * panSpeed;
        this._pipPan.x +=
          -pX * Math.cos(this._pipRot.theta) +
          pZ * Math.sin(this._pipRot.theta);
        this._pipPan.z +=
          pX * Math.sin(this._pipRot.theta) + pZ * Math.cos(this._pipRot.theta);
        return;
      } else if (eventData.type === "PIP_CLICK") {
        if (!this.pipCamera) return;
        this.raycaster.setFromCamera(
          { x: eventData.x, y: eventData.y },
          this.pipCamera,
        );
        const intersects = this.raycaster.intersectObjects(
          this.worldGroup.children,
          true,
        );
        if (intersects.length > 0) {
          const point = intersects[0].point;
          this.setWaypointPath(
            point.x / this.gridSize,
            point.z / this.gridSize,
          );
        }
        return;
      }
      if (e.data.type === "TOGGLE_AUTOPICKUP") {
        this.autoPickupEnabled = e.data.enabled;
        this.spawnCombatText(
          this.autoPickupEnabled ? "AUTOPICKUP: ON" : "AUTOPICKUP: OFF",
          this.autoPickupEnabled ? "heal" : "damage",
        );
        return;
      }

      if (e.data.type === "FPV_ACTION") {
        const action = e.data.action.toUpperCase();

        // Hybrid Turn Advance
        this.turnCount++;
        this.actionTimePool += 1.0;
        const turnValEl = document.getElementById("turn-val");
        if (turnValEl) turnValEl.textContent = this.turnCount;

        if (
          action === "BET EVEN" ||
          action === "BET ODD" ||
          action === "BET_EVEN" ||
          action === "BET_ODD"
        ) {
          const isEven = action === "BET EVEN" || action === "BET_EVEN";
          this.spawnCombatText(isEven ? "BET EVEN!" : "BET ODD!", "crit");

          // Spawn 3D Bouncing Dice in front of Player/Target
          let spawnX = this.player.x * this.gridSize;
          let spawnZ = this.player.z * this.gridSize;
          let spawnY = 2; // Drop from above

          if (this.activeTarget) {
            spawnX = (spawnX + this.activeTarget.position.x) / 2;
            spawnZ = (spawnZ + this.activeTarget.position.z) / 2;
            this.activeTarget.userData.stateColor = "#00ff00"; // Green for wager
          } else {
            spawnX -= Math.sin(this.player.rot) * 1.5;
            spawnZ -= Math.cos(this.player.rot) * 1.5;
          }

          for (let i = 0; i < 2; i++) {
            const dieGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
            const dieMat = new THREE.MeshStandardMaterial({
              color: isEven ? 0x1b5e20 : 0xb71c1c,
              roughness: 0.2,
              metalness: 0.1,
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
              life: 240, // 4 seconds at 60fps
            };
            this.worldGroup.add(die);
          }
          this.scene.userData.hasActiveDice = true;

          setTimeout(() => {
            let wOutcome = { won: false, multiplier: 1 };
            if (this.resolveWager) wOutcome = this.resolveWager(action);
            this.postToAI({
              type: "WAGER_RESULT",
              won: wOutcome.won,
              multiplier: wOutcome.multiplier,
            });
          }, 1500);
        } else if (action === "RETREAT") {
          // Force player backward safely on grid
          const dx = Math.sin(this.player.rot) * 1.0;
          const dz = Math.cos(this.player.rot) * 1.0;
          if (
            !this.checkCollision(this.player.x + dx, this.player.z + dz, 0.35)
          ) {
            this.player.x += dx;
            this.player.z += dz;
          }
          this._haltPlayer = false; // Player retreated, they can move again

          if (this.combatState === "player_turn") {
            this.combatState = "monster_turn";
            setTimeout(() => this.processMonsterTurn(), 500);
          }
        }
        // --- SPELL CARD IMPACT SYSTEM ---
        // Maps card names → element → visual + damage
        const SPELL_MAP = {
          FIREBALL: {
            el: "FIRE",
            color: 0xff4400,
            dmg: 60,
            trauma: 0.7,
            label: "\uD83D\uDD25 FIREBALL",
            range: 8.0,
          },
          PYROBLAST: {
            el: "FIRE",
            color: 0xff2200,
            dmg: 90,
            trauma: 0.9,
            label: "\uD83D\uDD25 PYROBLAST",
            range: 8.0,
          },
          COMET: {
            el: "FIRE",
            color: 0xff9900,
            dmg: 70,
            trauma: 0.8,
            label: "\u2604 COMET",
            range: 8.0,
          },
          BOULDER: {
            el: "EARTH",
            color: 0x7b5e3a,
            dmg: 50,
            trauma: 0.6,
            label: "\u{1FAA8} BOULDER",
            range: Infinity,
          }, // Projectile: no lock-on needed
          FISSURE: {
            el: "EARTH",
            color: 0x5c4033,
            dmg: 70,
            trauma: 0.7,
            label: "\uD83C\uDF0B FISSURE",
            range: 5.0,
          },
          GALE: {
            el: "WIND",
            color: 0x90caf9,
            dmg: 40,
            trauma: 0.4,
            label: "\uD83D\uDCA8 GALE",
            range: 5.0,
          },
          VORTEX: {
            el: "WIND",
            color: 0x90caf9,
            dmg: 52,
            trauma: 0.5,
            label: "🌪️ VORTEX",
            range: 8.0,
          },
          TIDE: {
            el: "WATER",
            color: 0x0d6efd,
            dmg: 40,
            trauma: 0.5,
            label: "\uD83C\uDF0A TIDE",
            range: 4.0,
          },
          SURGE: {
            el: "WATER",
            color: 0x0d6efd,
            dmg: 60,
            trauma: 0.6,
            label: "\uD83C\uDF0A SURGE",
            range: 5.0,
          },
          "HEAL POTION": {
            el: "SCROLL",
            color: 0x00e676,
            dmg: -40,
            trauma: 0.0,
            label: "\uD83E\uDDEA POTION (HEAL)",
            range: Infinity,
          },
          "IDENTITY SCROLL": {
            el: "SCROLL",
            color: 0xffd740,
            dmg: 0,
            trauma: 0.0,
            label: "\uD83D\uDCDC SCROLL",
            range: Infinity,
          },
          SLASH: {
            el: "KATANA",
            color: 0xffffff,
            dmg: 40,
            trauma: 0.5,
            label: "\u2694 SLASH",
            range: Infinity,
          }, // Gated by melee block
          THRUST: {
            el: "KATANA",
            color: 0xcccccc,
            dmg: 36,
            trauma: 0.4,
            label: "\u2694 THRUST",
            range: Infinity,
          }, // Gated by melee block
          "HARD ATTACK": {
            el: "KATANA",
            color: 0xffd700,
            dmg: 54,
            trauma: 0.8,
            label: "\u2694 HARD ATTACK",
            range: 2.5,
          },
          SHURIKEN: {
            el: "MISSILE",
            color: 0x888888,
            dmg: 30,
            trauma: 0.2,
            label: "\u2734 SHURIKEN",
            range: 6.0,
          },
          "SHORT BOW": {
            el: "MISSILE",
            color: 0xaa8800,
            dmg: 50,
            trauma: 0.4,
            label: "\uD83C\uDFF9 SHORT BOW",
            range: 10.0,
          },
          "LONG BOW": {
            el: "MISSILE",
            color: 0xaa6600,
            dmg: 90,
            trauma: 0.7,
            label: "\uD83C\uDFF9 LONG BOW",
            range: 15.0,
          },
          "SAMURAI HELMET": {
            el: "ARMOR",
            color: 0xffffff,
            dmg: 0,
            trauma: 0.1,
            label: "兜 SAMURAI HELMET",
            range: Infinity,
          },
          "WAND OF FIREBALLS": {
            el: "FIRE",
            color: 0xff4400,
            dmg: 100,
            trauma: 0.9,
            label: "\uD83D\uDD25 WAND OF FIREBALLS",
            range: 12.0,
          },
          "WAND OF MAGIC MISSILES": {
            el: "MISSILE",
            color: 0xaa44ff,
            dmg: 60,
            trauma: 0.4,
            label: "\u2728 MAGIC MISSILES",
            range: 15.0,
          },
          "TOMMY GUN": {
            el: "MISSILE",
            color: 0xffdd00,
            dmg: 120,
            trauma: 0.8,
            label: "\uD83D\uDD2B TOMMY GUN",
            range: 20.0,
          },
        };

        let baseAction = action;
        const match = baseAction.match(/^(.*?)(?:\s+X\d+)?$/);
        if (match) baseAction = match[1].trim();

        let spell = SPELL_MAP[baseAction];

        // Range-based weapon switching: If it's a melee attack, but enemy is far (> 2 tiles), use Shuriken
        if (spell && spell.el === "KATANA" && this.activeTargetDist > 2.0) {
          action = "SHURIKEN";
          baseAction = "SHURIKEN";
          spell = SPELL_MAP["SHURIKEN"];
        }

        if (spell) {
          if (
            spell.el === "SCROLL" ||
            spell.el === "ARMOR" ||
            action === "HEAL POTION" ||
            action === "IDENTITY SCROLL"
          ) {
            this.spawnPotionUse(action, spell);
          } else {
            // Intercept all spells and attacks (even melee) to auto-aim and hit the monster
            this.spawnProjectile(action, spell);
          }

          // Advance turn after playing a card
          if (
            this.combatState === "player_turn" ||
            this.combatState === "idle"
          ) {
            this.combatState = "monster_turn";
            setTimeout(() => this.processMonsterTurn(), 800); // Wait for animations
          }
        }
      } else if (e.data.type === "PIP_TOGGLE") {
        this.cameraMode = this.cameraMode === "topdown" ? "fpv" : "topdown";
      } else if (e.data.type === "PIP_ZOOM") {
        this._pipZoomScale = this._pipZoomScale || 0.5;
        this._pipZoomScale += e.data.delta * 0.1;
        this._pipZoomScale = Math.max(0.2, Math.min(2.0, this._pipZoomScale));
        this._pipLastInteractionTime = Date.now();
      } else if (e.data.type === "COMBAT_UPDATE") {
        // Sync UI with the AI's math
        window.parent.postMessage(
          { type: "SHOW_COMBAT", health: e.data.newHp },
          "*",
        );
      } else if (e.data && e.data.type === "AI_DEATH") {
        // Implement sinking death animation
        const deadMesh = this.worldGroup.children.find(
          (m) => m.userData && m.userData.id === e.data.id,
        );
        if (deadMesh) {
          if (
            this.activeTarget &&
            this.activeTarget.userData.id === e.data.id
          ) {
            // Remove Target
            this.activeTarget = null;
            window.parent.postMessage({ type: "HIDE_ALL" }, "*");
          }

          // Karma impact for killing monster
          if (this.player.karma === undefined) this.player.karma = 0;
          this.player.karma -= 1;
          window.parent.postMessage(
            { type: "LOG_EVENT", logType: "karma", text: "-1 Karma." },
            "*",
          );
          if (this.syncPlayerStats) this.syncPlayerStats();

          // Flag as dead to prevent queued retaliation attacks
          deadMesh.userData.isDead = true;

          // Stop any walking/idle animations and REMOVE from update loop to prevent memory leak!
          if (deadMesh.userData.mixer) {
            deadMesh.userData.mixer.stopAllAction();
            deadMesh.userData.mixer.uncacheRoot(deadMesh); // Clear animation cache
            const mIdx = this.mixers.indexOf(deadMesh.userData.mixer);
            if (mIdx > -1) this.mixers.splice(mIdx, 1);
          }

          // Clear animation clips and actions from userData
          deadMesh.userData.clips = null;
          deadMesh.userData.actions = null;
          deadMesh.userData.idleAction = null;
          deadMesh.userData.walkAction = null;
          deadMesh.userData.attackAction = null;

          // Selection circle is already in worldGroup, just detach it logically
          const monBase = deadMesh.userData.monBase;
          if (monBase) {
            deadMesh.userData.detachedBase = monBase;
            deadMesh.userData.monBase = null; // stop syncing position
          }

          // Spawn Physical Loot at monster location
          this.spawnLoot(
            Math.round(deadMesh.position.x / this.gridSize),
            Math.round(deadMesh.position.z / this.gridSize),
          );
          this.addXP(25 + Math.floor(Math.random() * 20));

          // Explosive Death Animation!
          let frameCount = 0;
          const deathBurst = () => {
            frameCount++;

            if (frameCount < 10) {
              // Burst out and flash pure white!
              const grow = 1.0 + frameCount * 0.04;
              deadMesh.rotation.x -= 0.1;
              deadMesh.traverse((child) => {
                if (child.isMesh && child.material) {
                  // PREVENT WEBGL CRASH: Ensure map texture isn't already destroyed
                  if (
                    child.material.map &&
                    child.material.map.image === undefined
                  ) {
                    child.material.map = null;
                  }

                  child.scale.set(grow, grow, grow);
                  if (child.material.emissive) {
                    child.material.emissive.setHex(0xffffff);
                    child.material.emissiveIntensity = 8.0;
                  }
                }
              });
              requestAnimationFrame(deathBurst);
            } else if (frameCount < 30) {
              // Implode into dust
              const shrink = Math.max(0.01, 1.4 - (frameCount - 10) * 0.15);
              deadMesh.rotation.y += 0.5; // Spin rapidly while shrinking
              deadMesh.traverse((child) => {
                if (child.isMesh && child.material) {
                  child.scale.set(shrink, shrink, shrink);
                  if (child.material.transparent) {
                    child.material.opacity = Math.max(
                      0,
                      child.material.opacity - 0.1,
                    );
                  }
                  if (child.material.emissiveIntensity !== undefined) {
                    child.material.emissiveIntensity = Math.max(
                      0,
                      child.material.emissiveIntensity - 0.5,
                    );
                  }
                }
              });
              requestAnimationFrame(deathBurst);
            } else {
              this.worldGroup.remove(deadMesh);
              if (deadMesh.userData.detachedBase) {
                this.worldGroup.remove(deadMesh.userData.detachedBase);
              }
              this.scene.userData.activeEnemies--;

              // Check if there are any active hostiles left in range
              let activeHostiles = 0;
              const entities = this.dynamicEntities || this.worldGroup.children;
              for (let i = 0; i < entities.length; i++) {
                const c = entities[i];
                if (
                  c.userData &&
                  c.userData.type === "enemy" &&
                  !c.userData.isDead
                ) {
                  const dist =
                    Math.sqrt(
                      Math.pow(
                        this.player.x * this.gridSize - c.position.x,
                        2,
                      ) +
                        Math.pow(
                          this.player.z * this.gridSize - c.position.z,
                          2,
                        ),
                    ) / this.gridSize;
                  if (dist < 12.0) {
                    activeHostiles++;
                  }
                }
              }
              if (activeHostiles === 0 && this.combatState !== "idle") {
                this.combatState = "idle";
                window.parent.postMessage({ type: "HIDE_ALL" }, "*");
                window.parent.postMessage(
                  {
                    type: "LOG_EVENT",
                    logType: "system",
                    text: `Combat Ended. Free roam restored.`,
                  },
                  "*",
                );
              }
            }
          };

          requestAnimationFrame(deathBurst);
        }
      } else if (e.data && e.data.type === "AI_UPDATES") {
        // Process commands from the A* brain
        e.data.updates.forEach((up) => {
          const mesh = this.worldGroup.children.find(
            (m) => m.userData && m.userData.id === up.id,
          );
          if (mesh) {
            if (up.action === "MOVE") {
              // Normally we'd lerp this in the animate loop for smoothness,
              // but snapping to grid cells works for this retro grid crawler aesthetic.
              mesh.position.x = up.x * this.gridSize;
              mesh.position.z = up.z * this.gridSize;
            } else if (up.action === "ATTACK") {
              // Make the monster bump towards the player visually
              const origX = mesh.position.x;
              const origZ = mesh.position.z;

              const dx = this.player.x * this.gridSize - origX;
              const dz = this.player.z * this.gridSize - origZ;

              // Normalize
              const len = Math.sqrt(dx * dx + dz * dz) || 1;
              const bumpX = origX + (dx / len) * (this.gridSize * 0.4);
              const bumpZ = origZ + (dz / len) * (this.gridSize * 0.4);

              const startTime = performance.now();
              const bumpAnim = () => {
                const progress = (performance.now() - startTime) / 250;
                if (progress < 1) {
                  if (progress < 0.5) {
                    // forward
                    const p = progress * 2;
                    mesh.position.x = origX + (bumpX - origX) * p;
                    mesh.position.z = origZ + (bumpZ - origZ) * p;
                  } else {
                    // backward
                    const p = (progress - 0.5) * 2;
                    mesh.position.x = bumpX + (origX - bumpX) * p;
                    mesh.position.z = bumpZ + (origZ - bumpZ) * p;
                  }
                  requestAnimationFrame(bumpAnim);
                } else {
                  mesh.position.x = origX;
                  mesh.position.z = origZ;

                  // Apply damage effects!
                  this.addCameraTrauma(0.5);
                  window.parent.postMessage(
                    {
                      type: "LOG_EVENT",
                      logType: "damage",
                      text: `Monster attacks you for 10 DMG!`,
                    },
                    "*",
                  );
                }
              };
              requestAnimationFrame(bumpAnim);
            }

            // Keep circle static
            if (up.state && mesh.userData.searchLight) {
              mesh.userData.searchLight.intensity =
                up.state === "SEARCHING" ? 4.0 : 0;
            }

            if (up.action === "SEARCH_TURN") {
              // Make the ghost snap 90 degrees randomly to search
              const turnDir = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
              if (!mesh.userData.mockRot) mesh.userData.mockRot = 0;
              mesh.userData.mockRot += turnDir;
              mesh.rotation.y = mesh.userData.mockRot;
            }
          }
        });
        this.checkTriggers();
      } else if (e.data && e.data.type === "SKILL_UP") {
        // Duplicate skill card pickup → +1 to linked attribute
        const stat = e.data.stat; // e.g. 'str', 'dex', 'con', 'int', 'wis', 'cha'
        const amount = e.data.amount || 1;
        if (stat && this.player[stat] !== undefined) {
          this.player[stat] += amount;
          this.spawnCombatText(`+${amount} ${stat.toUpperCase()}`, "heal");
          this.syncPlayerStats();
        }
      }
    });

    // Send procedural setup to parent shell (which routes to Map and AI engines)
    window.parent.postMessage(
      {
        type: "INIT_ENTITIES",
        // The Map and AI brain need the dungeon layout
        mapData: this.mapData,
        spawns: this.mobSpawns,
        playerSpawn: { x: this.player.x, z: this.player.z },
      },
      "*",
    );
  },

  initPipCanvases() {
    // Canvas context is now polled dynamically in animate() from the parent frames                // Ensure ortho target state exists
    if (!this._pipOrthoTarget) {
      this._pipOrthoTarget = { hw: 10 * this.gridSize, hh: 10 * this.gridSize };
    }

    if (!this._pipZoomScale) this._pipZoomScale = 0.5; // Normalized baseline scale
  },

  postToAI(msg) {
    // Route through the parent shell to avoid cross-origin DOM access errors
    window.parent.postMessage(msg, "*");
  },

  broadcastPipSync() {
    const enemies = [];
    if (this.worldGroup) {
      const entities = this.dynamicEntities || this.worldGroup.children;
      entities.forEach((c) => {
        if (c.userData && c.userData.type === "enemy") {
          enemies.push({
            x: c.position.x,
            z: c.position.z,
            hp: c.userData.hp,
            type: c.userData.name,
            isDead: c.userData.isDead,
          });
        }
      });
    }

    const projectiles = [];
    if (this.boulders) {
      for (const b of this.boulders) {
        projectiles.push({ x: b.position.x, z: b.position.z });
      }
    }
  },

  animate() {
    requestAnimationFrame(() => this.animate());

    // Update delta time for glTF Skeletal Animations
    let delta = this.clock.getDelta();

    // --- Persistent Crosshair Tracking ---
    if (this.persistentCrosshair) {
      if (this.activeTarget && !this.activeTarget.userData.isDead) {
        this.persistentCrosshair.visible = true;
        this.persistentCrosshair.position.copy(this.activeTarget.position);
        this.persistentCrosshair.position.y += 1.8;
        this.persistentCrosshair.quaternion.copy(this.camera.quaternion);
        this.persistentCrosshair.children[0].rotation.z -= delta * 2.0; // Spin the ring
      } else {
        this.persistentCrosshair.visible = false;
      }
    }

    // --- OutlinePass target sync (gates composer activation) ---
    if (this.outlinePass) {
      const target =
        this.activeTarget && !this.activeTarget.userData.isDead
          ? this.activeTarget
          : null;
      const current = this.outlinePass.selectedObjects[0] || null;
      if (current !== target) {
        this.outlinePass.selectedObjects = target ? [target] : [];
      }
    }

    // --- Visceral Hit-Stop Freeze ---
    if (performance.now() < this.hitStopUntil) {
      delta = 0; // Swallow elapsed time perfectly to freeze the simulation
    }

    // --- TIMING AI (Action Point & Timing Manager) ---
    if (!this.timingAI) {
      // 100 AP = 1 Tile (5 steps of 20 AP) or 1 Attack (100 AP)
      this.timingAI = { ap: 100, maxAp: 100, distAccum: 0, lockUntil: 0 };
    }

    // Regenerate AP (Stamina) over time for fluid combat pacing
    this.timingAI.ap = Math.min(
      this.timingAI.maxAp,
      this.timingAI.ap + delta * 80,
    ); // 80 AP per second regen

    // Send AP state to UI
    if (Math.abs((this.timingAI.lastReportedAp || 0) - this.timingAI.ap) > 5) {
      this.timingAI.lastReportedAp = this.timingAI.ap;
      window.parent.postMessage(
        { type: "AP_UPDATE", ap: this.timingAI.ap, maxAp: this.timingAI.maxAp },
        "*",
      );
    }

    // --- ATB MONSTER TIMER (Free Movement) ---
    this.timingAI.monsterTimer = (this.timingAI.monsterTimer || 0) + delta;
    if (this.timingAI.monsterTimer > 1.2) {
      // Every 1.2 seconds monsters can move independently
      this.processMonsterTurn();
      this.timingAI.monsterTimer = 0;
    }

    let targetMoveDir = 0;
    let targetStrafeDir = 0;
    let targetTurnDir = 0;

    if (!this._haltPlayer) {
      if (this.keys.w) targetMoveDir = 1;
      if (this.keys.s) targetMoveDir = -1;
      if (this.keys.q) targetStrafeDir = 1; // Left
      if (this.keys.e) targetStrafeDir = -1; // Right
      if (this.keys.a) targetTurnDir = 1;
      if (this.keys.d) targetTurnDir = -1;
    }

    // --- REAL PHYSICS: Elegant Soft Momentum ---
    this.vMove = THREE.MathUtils.lerp(
      this.vMove || 0,
      targetMoveDir,
      delta * 8.0,
    );
    this.vStrafe = THREE.MathUtils.lerp(
      this.vStrafe || 0,
      targetStrafeDir,
      delta * 8.0,
    );
    this.vRot = THREE.MathUtils.lerp(
      this.vRot || 0,
      targetTurnDir,
      delta * 12.0,
    );

    if (Math.abs(this.vMove) < 0.01) this.vMove = 0;
    if (Math.abs(this.vStrafe) < 0.01) this.vStrafe = 0;
    if (Math.abs(this.vRot) < 0.01) this.vRot = 0;

    let moveDir = this.vMove;
    let strafeDir = this.vStrafe;
    let turnDir = this.vRot;

    // Monster mixers run continuously in real time
    this.mixers.forEach((mixer) => {
      if (mixer === this.playerMixer) return;
      const root = mixer.getRoot();
      if (!root || this.camera.position.distanceTo(root.position) < 15.0) {
        mixer.update(delta);
      }
    });
    if (this.playerMixer) this.playerMixer.update(delta);

    // Rotation
    this.camera.rotation.x = 0; // Baseline X before applying trauma
    this.player.rot += turnDir * this.ROT_SPEED * delta;
    this.camera.rotation.y = this.player.rot;

    // Movement
    let nextX = this.player.x;
    let nextZ = this.player.z;

    if (moveDir !== 0 || strafeDir !== 0) {
      const speed = this.MOVE_SPEED * delta;
      let dx = 0;
      let dz = 0;

      if (moveDir !== 0) {
        dx += Math.sin(this.player.rot) * speed * moveDir;
        dz += Math.cos(this.player.rot) * speed * moveDir;
      }
      if (strafeDir !== 0) {
        dx += Math.sin(this.player.rot + Math.PI / 2) * speed * strafeDir;
        dz += Math.cos(this.player.rot + Math.PI / 2) * speed * strafeDir;
      }

      // Physical collision sweeps
      nextX -= dx;
      nextZ -= dz;

      const radius = 0.35; // Collision radius (world units)

      let colX = this.checkCollision(nextX, this.player.z, radius);
      if (colX && typeof colX !== "object") nextX = this.player.x;

      let colZ = this.checkCollision(nextX, nextZ, radius);
      if (colZ && typeof colZ !== "object") nextZ = this.player.z;

      // Active Combat Distance Lock: Bump to attack
      if (
        moveDir > 0.5 &&
        (typeof colX === "object" || typeof colZ === "object")
      ) {
        const targetMesh = typeof colX === "object" ? colX : colZ;
        const now = performance.now();

        // Prevent walking through the monster
        if (typeof colX === "object") nextX = this.player.x;
        if (typeof colZ === "object") nextZ = this.player.z;

        if (
          targetMesh &&
          targetMesh.userData &&
          targetMesh.userData.id &&
          (!this.lastAttackTime || now - this.lastAttackTime > 600)
        ) {
          this.lastAttackTime = now;

          if (targetMesh.userData.type === "enemy") {
            if (this.triggerRoomAggro) this.triggerRoomAggro(targetMesh);
            if (this.tryCallForHelp) this.tryCallForHelp(targetMesh);

            const finalDamage = this.resolveMeleeStrike
              ? this.resolveMeleeStrike("Player", 25)
              : 25;

            setTimeout(() => this.processMonsterTurn(), 600);

            this.addCameraTrauma(0.4);
            this.triggerHitStop(40);

            // Send GRID coordinates to the UI for Combat
            window.parent.postMessage(
              {
                type: "COMBAT_ATTACK",
                targetId: targetMesh.userData.id,
                damage: finalDamage,
                x: Math.round(targetMesh.position.x / this.gridSize),
                z: Math.round(targetMesh.position.z / this.gridSize),
              },
              "*",
            );

            targetMesh.userData.hp -= finalDamage;

            window.parent.postMessage(
              {
                type: "PLAYER_ATTACK",
                targetId: targetMesh.userData.id,
                damage: finalDamage,
              },
              "*",
            );
            if (
              targetMesh.userData.monBase &&
              targetMesh.userData.monBase.children[0]
            ) {
              const baseMesh = targetMesh.userData.monBase.children[0];
              if (baseMesh && baseMesh.material && baseMesh.material.color) {
                baseMesh.material.color.setHex(0xff0000);
                setTimeout(() => {
                  if (baseMesh && baseMesh.material && baseMesh.material.color)
                    baseMesh.material.color.setHex(0x000000);
                }, 300);
              }
            }
            this.currentMonsterCamTarget = targetMesh;
             window.parent.postMessage(
               {
                 type: "SHOW_COMBAT",
                 health: targetMesh.userData.hp,
                 maxHp: targetMesh.userData.maxHp ?? 50,
                 name: targetMesh.userData.name || "Yakuza Goblin",
                 entityType: targetMesh.userData.type || "enemy",
                 isHostile: targetMesh.userData.isHostile !== false,
               },
               "*",
             );

            if (targetMesh.userData.hp <= 0) {
              if (this.triggerRoomAggro) this.triggerRoomAggro(targetMesh);
              window.parent.postMessage(
                { type: "AI_DEATH", id: targetMesh.userData.id },
                "*",
              );
            }

            if (targetMesh.userData.ai) {
              targetMesh.userData.isHostile = true;
              targetMesh.userData.ai.aggression = Math.min(
                1.0,
                targetMesh.userData.ai.aggression + 0.5,
              );
              targetMesh.userData.ai.state = "CHASING";
              targetMesh.userData.ai.actionTimer = 0.5;
            }
            setTimeout(() => {
              if (this.processMonsterTurn) this.processMonsterTurn();
            }, 600);
          }
        }
      }

      // --- Shop Debt Logic ---
      const pGridNextX = Math.round(nextX / this.gridSize);
      const pGridNextZ = Math.round(nextZ / this.gridSize);

      if (
        this.mapData[pGridNextX] &&
        this.mapData[pGridNextX][pGridNextZ] &&
        this.mapData[pGridNextX][pGridNextZ].isShopDoor
      ) {
        if (this.player.shopDebt > 0) {
          if (this.player.gold >= this.player.shopDebt) {
            this.player.gold -= this.player.shopDebt;
            window.parent.postMessage(
              {
                type: "LOG_EVENT",
                text: `You paid the Shopkeeper ${this.player.shopDebt} Gold.`,
                logType: "system",
              },
              "*",
            );
            this.syncPlayerStats();
            this.player.shopDebt = 0;
          } else {
            nextX = this.player.x;
            nextZ = this.player.z;
            this.triggerHitStop(50);
          }
        }
      }
    } // End if (moveDir !== 0 || strafeDir !== 0)

    const currentGridX = Math.round(this.player.x);
    const currentGridZ = Math.round(this.player.z);

    // CRUCIAL FIX 1: Set player physical coordinates
    this.player.x = nextX;
    this.player.z = nextZ;

    const newGridX = Math.round(this.player.x);
    const newGridZ = Math.round(this.player.z);

    if (newGridX !== currentGridX || newGridZ !== currentGridZ) {
      this.turnCount++;
      const turnValEl = document.getElementById("turn-val");
      if (turnValEl) turnValEl.textContent = this.turnCount;

      // Room Entry Detection
      let currentRoomId = 0;
      if (this.rooms) {
        for (let r of this.rooms) {
          if (
            newGridX >= r.x &&
            newGridX < r.x + r.w &&
            newGridZ >= r.y &&
            newGridZ < r.y + r.h
          ) {
            currentRoomId = r.id;
            break;
          }
        }
      }

      if (currentRoomId !== this.lastRoomId) {
        if (currentRoomId !== 0 && currentRoomId !== -1) {
          const roomTypes = [
            {
              type: "Crypt",
              desc: "Cold stone sarcophagi line the walls of this silent tomb.",
            },
            {
              type: "Armory",
              desc: "Racks of rusted blades and battered shields sit abandoned here.",
            },
            {
              type: "Barracks",
              desc: "Rotting bunks and broken training dummies suggest a past garrison.",
            },
            {
              type: "Shrine",
              desc: "A faint smell of incense lingers around a weathered stone idol.",
            },
            {
              type: "Laboratory",
              desc: "Vials of murky liquid and shattered glass clutter the workbench.",
            },
            {
              type: "Vault",
              desc: "Heavy iron-bound chests suggest this room once held great wealth.",
            },
            {
              type: "Grotto",
              desc: "Luminescent moss clings to the damp, craggy walls of this natural cave.",
            },
            {
              type: "Ossuary",
              desc: "Piles of bleached bones are neatly stacked in the corners of the room.",
            },
            {
              type: "Sanctuary",
              desc: "A sense of unnatural calm pervades this ivy-choked chamber.",
            },
            {
              type: "Dormitory",
              desc: "Tattered tapestries and moth-eaten rugs provide a meager comfort.",
            },
          ];
          const rType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
          window.parent.postMessage(
            {
              type: "LOG_EVENT",
              logType: "room",
              text: `Room Entry: ${rType.type}. ${rType.desc}`,
            },
            "*",
          );
        }
        this.lastRoomId = currentRoomId;
      }

      // TIMING AI: Player has spent 100 AP traversing a full tile, monsters take a turn
      this.processMonsterTurn();
    }

    // --- TURN-BASED TIME-FLOW (SUPERHOT STYLE) ---
    // (Moved up to prevent ReferenceError)
    const distMovedSq =
      Math.pow(this.player.x - (this._lastAvatarX || this.player.x), 2) +
      Math.pow(this.player.z - (this._lastAvatarZ || this.player.z), 2);
    this.physMoving = distMovedSq > 0.00001 || turnDir !== 0;
    this._lastAvatarX = this.player.x;
    this._lastAvatarZ = this.player.z;

    if (this._lastIsMoving !== this.physMoving) {
      this._lastIsMoving = this.physMoving;
      window.parent.postMessage(
        { type: "PLAYER_MOVE_STATE", isMoving: this.physMoving },
        "*",
      );
    }

    // --- REAL-TIME Direction Dial Update (throttled to ~20hz to avoid message flood) ---
    const _now = performance.now();
    if (!this._lastRotBroadcast || _now - this._lastRotBroadcast > 50) {
      this._lastRotBroadcast = _now;
      window.parent.postMessage(
        { type: "PLAYER_ROT_REALTIME", rot: this.player.rot },
        "*",
      );

      // Radar Data Broadcast — enemies 15 tiles, loot 10 tiles, stairs 20 tiles
      const radarBlips = [];
      const _ENEMY_RANGE = 15,
        _LOOT_RANGE = 10,
        _STAIRS_RANGE = 20;

      const entities = this.dynamicEntities || this.worldGroup.children;
      entities.forEach((c) => {
        if (c.userData && c.userData.type === "enemy" && c.userData.hp > 0) {
          const dx = c.position.x / this.gridSize - this.player.x;
          const dz = c.position.z / this.gridSize - this.player.z;
          if (Math.hypot(dx, dz) <= _ENEMY_RANGE) {
            radarBlips.push({ dx, dz, kind: "enemy" });
          }
        }
      });

      if (this.lootItems) {
        this.lootItems.forEach((loot) => {
          const dx = loot.position.x / this.gridSize - this.player.x;
          const dz = loot.position.z / this.gridSize - this.player.z;
          if (Math.hypot(dx, dz) <= _LOOT_RANGE) {
            radarBlips.push({ dx, dz, kind: "loot" });
          }
        });
      }

      if (this.mapData) {
        for (let mx = 0; mx < this.mapWidth; mx++) {
          for (let mz = 0; mz < this.mapHeight; mz++) {
            const tile = this.mapData[mx] && this.mapData[mx][mz];
            if (
              tile &&
              (tile.type === "stairs_down" || tile.type === "stairs_up")
            ) {
              const dx = mx - this.player.x;
              const dz = mz - this.player.z;
              if (Math.hypot(dx, dz) <= _STAIRS_RANGE) {
                radarBlips.push({ dx, dz, kind: "stairs" });
              }
            }
          }
        }
      }

      window.parent.postMessage(
        { type: "RADAR_UPDATE", blips: radarBlips, rot: this.player.rot },
        "*",
      );
    }

    // Grid change detection for AI and Triggers
    const curGridX = Math.round(this.player.x);
    const curGridZ = Math.round(this.player.z);
    const curRotDirX = Math.round(-Math.sin(this.player.rot));
    const curRotDirZ = Math.round(-Math.cos(this.player.rot));
    if (
      this.lastGridX !== curGridX ||
      this.lastGridZ !== curGridZ ||
      this.lastRotDirX !== curRotDirX ||
      this.lastRotDirZ !== curRotDirZ
    ) {
      this.lastGridX = curGridX;
      this.lastGridZ = curGridZ;
      // Fog-of-war: reveal tiles around current position
      if (curGridX !== undefined) this._fowRevealAround(curGridX, curGridZ);
      this.lastRotDirX = curRotDirX;
      this.lastRotDirZ = curRotDirZ;
      window.parent.postMessage(
        { type: "PLAYER_MOVE", x: curGridX, z: curGridZ, rot: this.player.rot },
        "*",
      );

      // --- Procedural Room Descriptions ---
      const currentCell = this.mapData[curGridX]?.[curGridZ];
      const newRoomId = currentCell?.roomId || null;
      if (newRoomId !== this.lastVisitedRoomId) {
        this.lastVisitedRoomId = newRoomId;
        if (newRoomId) {
          const desc = this.generateRoomDescription(newRoomId);
          if (desc) {
            if (this.activeTarget || this.inCombat) {
              this.queuedRoomDesc = desc;
            } else {
              window.parent.postMessage(
                { type: "LOG_EVENT", logType: "system", text: desc },
                "*",
              );
              this.queuedRoomDesc = null;
            }
          }
        }
      }

      // --- Stairway Progression Check ---
      if (!this.isTransitioning) {
        const cellType = this.mapData[curGridX]?.[curGridZ]?.type;
        if (cellType === "stairs_up") {
          this.isTransitioning = true;
          if (this.level > 1) {
            this.level -= 1;
            window.parent.postMessage(
              {
                type: "LOG_EVENT",
                logType: "system",
                text: `You ascend the stairs... Returning to Level ${this.level}.`,
              },
              "*",
            );
            this.syncPlayerStats();
            setTimeout(() => this.reinitEngine(), 1000);
          } else {
            window.parent.postMessage(
              {
                type: "LOG_EVENT",
                logType: "system",
                text: `You ascend the stairs... Escaping the dungeon! Game Over.`,
              },
              "*",
            );
            setTimeout(() => location.reload(), 1500);
          }
        } else if (cellType === "stairs_down") {
          this.isTransitioning = true;
          this.level = (this.level || 1) + 1;
          window.parent.postMessage(
            {
              type: "LOG_EVENT",
              logType: "system",
              text: `You descend deeper into the dungeon... Welcome to Level ${this.level}.`,
            },
            "*",
          );
          this.syncPlayerStats();

          // Rebuild dungeon for next level
          this.generateMap();
          this.buildWorldGeometry();
          this.camera.position.set(
            this.player.x * this.gridSize,
            1.6,
            this.player.z * this.gridSize,
          );
          this.camera.rotation.y = this.player.rot;

          setTimeout(() => {
            this.isTransitioning = false;
          }, 1000);
        }
      }
    }

    // Check LoS triggers securely per frame instead of bound to integer positions, protecting against fast rotations
    this.checkTriggers();

    // State emission for combat turn indicator
    if (this._lastReportedCombatState !== this.combatState) {
      this._lastReportedCombatState = this.combatState;
      window.parent.postMessage(
        { type: "COMBAT_STATE_UPDATE", state: this.combatState },
        "*",
      );
    }

    // State emission for UI styling (e.g. guide panels fading)
    const currentlyMoving = moveDir !== 0 || turnDir !== 0 || this.physMoving;
    if (currentlyMoving && !this.isMoving) {
      this.isMoving = true;
      window.parent.postMessage(
        { type: "PLAYER_MOVE_STATE", isMoving: true },
        "*",
      );
    } else if (!currentlyMoving && this.isMoving) {
      this.isMoving = false;
      window.parent.postMessage(
        { type: "PLAYER_MOVE_STATE", isMoving: false },
        "*",
      );
      window.parent.postMessage({ type: "PLAYER_IDLE" }, "*");
    }

    // Camera Realism: Head Bobbing & Sway
    // ---------------------------------------------------------------------
    const BOB_FREQ = 12.0; // How fast the steps are

    if (currentlyMoving) {
      // Elegant soft head bob that scales with physical momentum (vMove)
      const speedMultiplier = Math.max(0.2, Math.abs(this.vMove || 0));
      this.bobTimer += delta * BOB_FREQ * speedMultiplier;

      this.bobHeight = Math.abs(Math.sin(this.bobTimer)) * this.BOB_AMP;
      this.bobSway = Math.cos(this.bobTimer / 2) * this.SWAY_AMP; // Half speed sway for weight shift
    } else {
      // Smoothly ease back to rest position without instantly zeroing the timer (prevents jerks)
      const lerpFactor = Math.min(1.0, 10 * delta); // PREVENT EXPLOSION!
      this.bobHeight += (0 - this.bobHeight) * lerpFactor;
      this.bobSway += (0 - this.bobSway) * lerpFactor;
    }

    // Apply final smoothed transforms to the camera
    let camX =
      this.player.x * this.gridSize +
      Math.cos(this.camera.rotation.y) * this.bobSway;
    let camY = 1.84 + this.bobHeight; // Eye level + bob bounce
    let camZ =
      this.player.z * this.gridSize +
      Math.sin(this.camera.rotation.y) * this.bobSway;
    let camRotZ = this.bobSway * -0.5; // Slight tilt during weight shift

    // --- Camera Trauma (AAA Hit Feedback) ---
    if (this.cameraTrauma > 0) {
      // Decay trauma over time (recover fully in 0.5 seconds at 60fps)
      // If hitStop is currently active, don't decay the trauma so the pause feels maximal
      if (performance.now() >= this.hitStopUntil) {
        this.cameraTrauma = Math.max(0, this.cameraTrauma - delta * 2.0);
      }

      // const traumaSquare = this.cameraTrauma * this.cameraTrauma;
      // const maxBounce = 0.4;
      // Apply smooth vertical bounce (Disabled per user request to stop map shaking)
      // camY += maxBounce * traumaSquare * Math.sin(performance.now() * 0.04);
    }

    this.camera.position.set(camX, camY, camZ);
    this.camera.rotation.z = camRotZ;

    // Procedural float time — only advances when player moves
    if (currentlyMoving) {
      this.gameTime += delta;
    }
    const time = this.gameTime * 2.5;

    // Update lantern cone flicker + SpotLight intensity sync (if equipped)
    if (this.lanternConeMat) {
      const lt = performance.now() * 0.001;
      this.lanternConeMat.uniforms.uTime.value = lt;
      // Removed cinema blinking flicker for stable lighting
      if (this.lanternLight) this.lanternLight.intensity = 3.0;
      if (this.lanternFill) this.lanternFill.intensity = 0.6;
      if (this.lanternLens) this.lanternLens.material.opacity = 1.0;
    }

    // ─────────────────────────────────────────────────────────────
    // MONSTER AI  ·  Real-time while moving / Frozen when idle
    // ─────────────────────────────────────────────────────────────
    // (Monster AI logic moved into the unified entity loop below)

    // ---------------------------------------------------------------------
    // RENDER PASSES
    // ---------------------------------------------------------------------
    const winW = this.renderer.domElement.clientWidth;
    const winH = this.renderer.domElement.clientHeight;

    // Render FPV Frame — viewport/scissor now set per-mode inside the RENDER PASSES block below

    // --- ENTITY IDLE ANIMATIONS & COMBAT LEVITATION ---
    if (this.worldGroup) {
      // Update generic animations (coins bouncing, items floating)
      const entities = this.dynamicEntities || this.worldGroup.children;
      for (let i = 0; i < entities.length; i++) {
        const child = entities[i];
        const cx = this.camera.position.x;
        const cz = this.camera.position.z;

        // --- SMART CULLING ---
        // Only distance-cull static level decor (furniture, pots, cobwebs, etc).
        // Do not cull active InstancedMeshes, physics debris, or active monsters.
        if (child.userData?.isDecor) {
          const dx = child.position.x - cx;
          const dz = child.position.z - cz;
          // Cull if > 45 units away (2025 sq) to prevent aggressive pop-in inside corridors
          child.visible = dx * dx + dz * dz < 2025;
          if (!child.visible) continue; // Skip further logic if culled
        }

        // --- UNIFIED MONSTER AI ANIMATION & MATERIAL LOGIC ---
        if (child.userData && child.userData.type === "enemy") {
          if (child.userData.isDead) continue; // Let the deathBurst animation handle it!

          const model = child.children[0];
          const isCombatTarget =
            this.activeTarget?.userData?.id === child.userData.id;

          const targetOpacity = this.fxConfig.baseOpacity;

          if (model) {
            if (!model.userData.emissiveMatsCache) {
              model.userData.emissiveMatsCache = [];
              model.traverse((n) => {
                if (n.isMesh && n.material) {
                  const mats = Array.isArray(n.material)
                    ? n.material
                    : [n.material];
                  mats.forEach((mat) => {
                    if (
                      mat.emissive &&
                      mat.emissive.getHex() === 0xffffff &&
                      mat.emissiveIntensity > 2.0
                    ) {
                      model.userData.emissiveMatsCache.push(mat);
                    }
                  });
                }
              });
            }

            model.userData.emissiveMatsCache.forEach((mat) => {
              mat.opacity = targetOpacity <= 0.05 ? 0.0 : 1.0;
            });

            // Ethereal float bob
            if (child.userData.bobPhase === undefined)
              child.userData.bobPhase = Math.random() * Math.PI * 2;
            if (model.userData.baseY === undefined)
              model.userData.baseY = model.position.y;
            const distToPlayerGrid =
              this.camera.position.distanceTo(child.position) / this.gridSize;
            const isInteracting = isCombatTarget || distToPlayerGrid <= 2.0;
            const floatAmp = isInteracting ? 0.15 : 0.1;
            const floatOffset = isInteracting ? 1.0 : 0.1;
            const targetY =
              model.userData.baseY +
              floatOffset +
              Math.sin(time * 2.0 + child.userData.bobPhase) * floatAmp;
            model.position.y += (targetY - model.position.y) * 0.1;
          }

          // Mist swirl (sprite-based monsters without a mixer)
          if (model && !child.userData.mixer && child.userData.mistGroup) {
            child.userData.mistGroup.rotation.y += delta * 0.4;
            child.userData.mistGroup.children.forEach((s) => {
              s.position.y =
                0.2 +
                Math.abs(
                  Math.sin(time * s.userData.speed + s.userData.angleOffset),
                ) *
                  1.5;
              const sc = 3.0 + Math.sin(time * s.userData.speed * 2.0) * 1.2;
              s.scale.set(sc, sc, sc);
              s.material.opacity =
                0.6 + Math.sin(time * s.userData.speed) * 0.4;
            });
          }
        }

        // Smooth Levitation Interpolation for Combat Intros (moves the "floor base" up)
        if (child.userData && child.userData.targetY !== undefined) {
          child.userData.baseY +=
            (child.userData.targetY - child.userData.baseY) * 2.0 * delta;
        }

        // Goblin Retreat
        if (child.userData.isRetreating) {
          child.position.x +=
            (child.userData.retreatX - child.position.x) * 4.0 * delta;
          child.position.z +=
            (child.userData.retreatZ - child.position.z) * 4.0 * delta;
          child.userData.baseY += (1.0 - child.userData.baseY) * 2.0 * delta; // Float up

          if (
            Math.abs(child.position.x - child.userData.retreatX) < 0.1 &&
            Math.abs(child.position.z - child.userData.retreatZ) < 0.1
          ) {
            child.userData.isRetreating = false;
          }
        }

        // Imp positioning and floating
        if (child.userData.type === "imp") {
          child.userData.baseY += (1.5 - child.userData.baseY) * 2.0 * delta;

          // Specific clock logic based on original design
          child.position.y =
            child.userData.baseY +
            Math.sin(
              this.clock.getElapsedTime() * 2.0 +
                (child.userData.id.endsWith("_0") ? 0 : Math.PI),
            ) *
              0.2;

          // Face player constantly
          const angle = Math.atan2(
            this.camera.position.x - child.position.x,
            this.camera.position.z - child.position.z,
          );
          child.rotation.y = angle;

          // Sync monster floor circle if alive
          if (child.userData.monBase) {
            child.userData.monBase.position.set(
              child.position.x,
              0,
              child.position.z,
            );
            child.userData.monBase.rotation.y = child.rotation.y;
          }
        }

        // Slow ethereal ghost float for entities elevated off the floor (baseY > 0.05)
        if (
          child.userData &&
          child.userData.idlePhase !== undefined &&
          child.userData.type !== "player"
        ) {
          const baseY = child.userData.baseY || 0;
          if (baseY > 0.05) {
            // Slow ghostly hover: 0.7hz, 0.35 amplitude — looks supernatural in the air
            child.position.y =
              baseY +
              Math.sin(
                this.clock.getElapsedTime() * 0.7 + child.userData.idlePhase,
              ) *
                0.35;
          } else {
            // Subtle idle floor bob when standing
            child.position.y =
              baseY +
              Math.sin(
                this.clock.getElapsedTime() * 1.5 + child.userData.idlePhase,
              ) *
                0.07;
          }
        }

        // Face player constantly for enemies/monsters (unless retreating)
        if (
          (child.userData.type === "enemy" ||
            child.userData.type === "monster") &&
          !child.userData.isRetreating
        ) {
          const angle = Math.atan2(
            this.player.x * this.gridSize - child.position.x,
            this.player.z * this.gridSize - child.position.z,
          );
          child.rotation.y = angle;
        }

        // Always sync base circle to floor — independent of Y float, never blinks
        if (child.userData && child.userData.monBase) {
          child.userData.monBase.position.set(
            child.position.x,
            0,
            child.position.z,
          );
          child.userData.monBase.rotation.y = child.rotation.y;

          // Hostility indicator: Turn circle and light red if hit!
          if (child.userData.isHostile) {
            if (child.userData.monBaseFpvCore) {
              if (
                child.userData.monBaseFpvCore.material.color.getHex() !==
                0xcc3333
              ) {
                child.userData.monBaseFpvCore.material.color.setHex(0xcc3333); // Bright Red
              }
            }

            if (child.userData.monLightObj === undefined) {
              child.userData.monLightObj =
                child.userData.monBase.children.find((c) => c.isLight) || null;
            }

            const lightObj = child.userData.monLightObj;
            if (lightObj) {
              if (lightObj.color.getHex() !== 0xff2200) {
                lightObj.color.setHex(0xff2200);
                lightObj.intensity = 1.0;
              }
            }
          }
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

          child.userData.life -= delta * 60; // decrement based on time/frames
          if (child.userData.life <= 0) {
            child.scale.multiplyScalar(0.9);
            if (child.scale.x < 0.01) {
              this.worldGroup.remove(child);
              i--; // Adjust array index since element was removed
            }
          }
        }

        // Spell impact particle physics & fade
        if (child.userData && child.userData.isSpellParticle) {
          child.position.x += child.userData.vX;
          child.position.y += child.userData.vY;
          child.position.z += child.userData.vZ;
          child.userData.vY -= 0.006;
          child.userData.vX *= 0.94;
          child.userData.vZ *= 0.94;
          child.userData.life--;
          if (child.material)
            child.material.opacity = Math.max(0, child.userData.life / 45);
          if (child.userData.life <= 0) {
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
            this.worldGroup.remove(child);
            i--;
          }
        }

        // --- ROCK FRAGMENT PHYSICS (boulder explosion debris) ---
        if (child.userData?.isRockFrag) {
          child.position.x += child.userData.vX * 0.016;
          child.position.y += child.userData.vY * 0.016;
          child.position.z += child.userData.vZ * 0.016;
          child.userData.vY -= 0.008; // gravity at ~60fps
          child.userData.vX *= 0.98;
          child.userData.vZ *= 0.98;
          child.rotation.x += child.userData.rX;
          child.rotation.y += child.userData.rY;
          child.rotation.z += child.userData.rZ;

          if (child.userData.isFire) {
            child.scale.multiplyScalar(0.9);
            child.userData.vY += 0.02; // Float up
            child.userData.vX *= 0.95;
            child.userData.vZ *= 0.95;
          } else if (child.position.y < 0.08) {
            child.position.y = 0.08;
            child.userData.vY *= -0.18; // low bounce — heavy debris
            child.userData.vX *= 0.6;
            child.userData.vZ *= 0.6;
          }
          child.userData.life--;
          if (child.userData.life <= 0) {
            if (!child.userData.sharedMaterial) {
              if (child.material) child.material.dispose();
              if (child.geometry) child.geometry.dispose();
            }
            this.worldGroup.remove(child);
            i--;
          }
        }

        // --- WIND FRAGMENT PHYSICS (swirl explosion) ---
        if (child.userData?.isWindFrag) {
          child.userData.angle += child.userData.speed * 0.016;
          if (child.userData.target && child.userData.target.position) {
            child.position.x =
              child.userData.target.position.x +
              Math.cos(child.userData.angle) * child.userData.radius;
            child.position.z =
              child.userData.target.position.z +
              Math.sin(child.userData.angle) * child.userData.radius;
          } else if (child.userData.basePos) {
            child.position.x =
              child.userData.basePos.x +
              Math.cos(child.userData.angle) * child.userData.radius;
            child.position.z =
              child.userData.basePos.z +
              Math.sin(child.userData.angle) * child.userData.radius;
          }
          child.position.y += 0.03; // rise up
          child.rotation.x += 0.2;
          child.rotation.y -= 0.3;

          child.userData.life--;
          if (child.userData.life <= 0) {
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
            this.worldGroup.remove(child);
            i--;
          }
        }
      }
    }

    // Active Chat Bubble Tracking & Billboarding
    // DELETED BY USER REQUEST: "all monster chat, all monster haiku"

    // --- NEW FUZZY LOGIC AI TICKER ---
    // Process visual tweening independently of time flow so moves can finish smoothly
    this.processFuzzyAI(delta);
    // --- PROJECTILE PHYSICS ---
    for (let bi = this.boulders.length - 1; bi >= 0; bi--) {
      const b = this.boulders[bi];
      b.userData.age = (b.userData.age || 0) + delta;

      if (b.userData.customUpdate) {
        b.userData.customUpdate(this.clock.getElapsedTime());
      }

      if (b.userData.spellState === "CHARGING") {
        // Phase 1: Hover and spin up
        b.position.y += Math.sin(b.userData.age * 5.0) * 0.005; // Hover
        if (b.userData.innerGroup)
          b.userData.innerGroup.rotation.y += b.userData.age * 10.0 * delta; // Accelerating inner spin
        if (b.userData.glassRef)
          b.userData.glassRef.rotation.x -= b.userData.age * 5.0 * delta;
        if (b.userData.bloomLight)
          b.userData.bloomLight.intensity =
            2.0 + Math.sin(b.userData.age * 10.0) * 1.5;

        if (b.userData.age >= b.userData.chargeTime) {
          // Launch Trigger!
          b.userData.spellState = "LAUNCHING";
          b.userData.vX = b.userData.targetSpeedX;
          b.userData.vY = b.userData.targetSpeedY;
          b.userData.vZ = b.userData.targetSpeedZ;
          if (b.userData.bloomLight) b.userData.bloomLight.intensity = 15.0; // Explosion flash
          b.userData.age = 0; // reset for flight phase
          this.addCameraTrauma(0.4); // Major trauma on launch
        }
      } else if (b.userData.spellState === "LAUNCHING") {
        // Flash decay
        if (b.userData.bloomLight) {
          b.userData.bloomLight.intensity = Math.max(
            2.0,
            b.userData.bloomLight.intensity - delta * 30.0,
          );
          if (b.userData.bloomLight.intensity <= 2.0) {
            b.userData.spellState = "FLYING";
            if (b.userData.finalMesh) b.userData.finalMesh.visible = true;
          }
        } else {
          b.userData.spellState = "FLYING";
          if (b.userData.finalMesh) b.userData.finalMesh.visible = true;
        }
      }

      if (b.userData.spellState === "FLYING") {
        // Elements physics
        if (b.userData.isEarth || b.userData.isBoulder) {
          b.userData.vY -= 18.0 * delta; // Heavy Gravity
        } else if (b.userData.isWater) {
          b.userData.vY -= 4.0 * delta; // Light gravity
        } else if (b.userData.isArrow || b.userData.isShuriken) {
          b.userData.vY -= 8.0 * delta; // Hyper-realistic parabolic gravity

          // Align arrow mesh to current trajectory
          if (b.userData.isArrow) {
            const dir = new THREE.Vector3(
              b.userData.vX,
              b.userData.vY,
              b.userData.vZ,
            ).normalize();
            const targetQuat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, -1),
              dir,
            );
            b.quaternion.slerp(targetQuat, 0.2); // Smooth pitch alignment to velocity
          }
        }

        // Particle Trails
        if (b.userData.age % 0.05 < delta) {
          // [ARCHITECTURE OPTIMIZATION] Initialize global shared particle resources ONCE
          if (!this._sharedParticleMats) {
            this._sharedParticleMats = {
              FIRE: new THREE.MeshBasicMaterial({
                color: 0xff4500,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
              }),
              EARTH: new THREE.MeshBasicMaterial({
                color: 0xbdb76b,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
              }),
              WATER: new THREE.MeshBasicMaterial({
                color: 0x00bfff,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
              }),
              WIND: new THREE.MeshBasicMaterial({
                color: 0xccffff,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
              }),
              DEFAULT: new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
              }),
            };
            this._sharedParticleGeo = new THREE.TetrahedronGeometry(0.15, 0); // Shared geometry instance!
          }

          if (b.userData.isArrow || b.userData.isShuriken) {
            // Glare Streak Segment
            const streak = new THREE.Mesh(
              new THREE.PlaneGeometry(0.1, 0.6),
              this._sharedParticleMats.WIND,
            );
            streak.position.copy(b.position);
            streak.rotation.copy(b.rotation);
            streak.userData = {
              isRockFrag: true,
              vY: 0,
              vX: 0,
              vZ: 0,
              rX: 0,
              rY: 0,
              rZ: 0,
              life: 12,
            };
            this.worldGroup.add(streak);
          } else {
            let sMat = this._sharedParticleMats.DEFAULT;
            if (b.userData.isFireball) sMat = this._sharedParticleMats.FIRE;
            else if (b.userData.isEarth) sMat = this._sharedParticleMats.EARTH;
            else if (b.userData.isWater) sMat = this._sharedParticleMats.WATER;
            else if (b.userData.isWind) sMat = this._sharedParticleMats.WIND;

            const spark = new THREE.Mesh(this._sharedParticleGeo, sMat);
            const pScale = 0.6 + Math.random() * 0.8;
            spark.scale.setScalar(pScale);
            spark.position.copy(b.position);
            spark.position.x += (Math.random() - 0.5) * 0.5;
            spark.position.y += (Math.random() - 0.5) * 0.5;
            spark.position.z += (Math.random() - 0.5) * 0.5;
            spark.userData = {
              isRockFrag: true,
              sharedMaterial: true,
              vY: (Math.random() - 0.5) * 2.0,
              vX: (Math.random() - 0.5) * 2.0,
              vZ: (Math.random() - 0.5) * 2.0,
              rX: Math.random(),
              rY: Math.random(),
              rZ: Math.random(),
              life: 20,
            };
            this.worldGroup.add(spark);
          }
        }

        // Morphing logic
        if (b.userData.glassRef && b.userData.glassRef.material.opacity > 0) {
          b.userData.glassRef.material.opacity -= delta * 5.0; // Fade out glass rapidly
          b.userData.innerGroup.scale.setScalar(
            Math.max(0.01, b.userData.innerGroup.scale.x - delta * 5.0),
          ); // Shrink inner core
        }

        if (b.userData.isWater && b.userData.finalMesh) {
          // Morph into Wave
          b.userData.finalMesh.scale.x = Math.min(
            2.5,
            b.userData.finalMesh.scale.x + delta * 5.0,
          ); // Widen horizontally
          b.userData.finalMesh.scale.z = Math.min(
            2.5,
            b.userData.finalMesh.scale.z + delta * 5.0,
          ); // Widen depth
          b.userData.finalMesh.rotation.x = 0; // Lock rotation so it slides flat
        } else if (b.userData.isEarth && b.userData.finalMesh) {
          const spd2D = Math.hypot(b.userData.vX, b.userData.vZ);
          const dynamicSpinAxis = new THREE.Vector3(
            b.userData.vZ / spd2D,
            0,
            -b.userData.vX / spd2D,
          );
          b.userData.finalMesh.rotateOnWorldAxis(
            dynamicSpinAxis,
            spd2D * delta * 0.6,
          );
        } else if (b.userData.isWind && b.userData.finalMesh) {
          b.userData.finalMesh.rotation.y += 20.0 * delta;
        } else if (b.userData.isFireball && b.userData.finalMesh) {
          b.userData.finalMesh.rotation.x += 10.0 * delta;
          b.userData.finalMesh.rotation.y += 15.0 * delta;
        }
      }

      // Always apply velocity if not charging
      if (b.userData.spellState !== "CHARGING") {
        b.position.x += b.userData.vX * delta;
        b.position.y += b.userData.vY * delta;
        b.position.z += b.userData.vZ * delta;
      }

      // Realistic rolling/spinning dynamically perpendicular to actual travel direction
      const spd2D = Math.hypot(b.userData.vX, b.userData.vZ);
      if (
        spd2D > 0.01 &&
        b.userData.spellState !== "CHARGING" &&
        b.userData.spellState !== "LAUNCHING"
      ) {
        if (b.userData.type === "SHURIKEN" || b.userData.isShuriken) {
          if (b.children.length > 0) b.children[0].rotation.z -= 35.0 * delta;
        }
      }

      // Floor bounce (damped — heavy rock)
      if (
        (b.userData.isBoulder || b.userData.isWater) &&
        b.position.y <= 0.55
      ) {
        b.position.y = 0.55;
        if (b.userData.isWater) {
          // Splashes down and transforms into a sliding wave!
          b.userData.vY = 0;
        } else if (b.userData.vY < -1.5) {
          // Hard bounce for boulders
          b.userData.vY = Math.abs(b.userData.vY) * 0.95;
          b.userData.vX *= 0.99; // Less friction for pinball!
          b.userData.vZ *= 0.99;
        } else {
          // Rolling on floor
          b.userData.vY = 0;
          if (!b.userData.isBoulder) {
            b.userData.vX *= 0.99;
            b.userData.vZ *= 0.99;
          } else {
            // Boulder retains full speed rolling on floor (continues for 100 feet)
            b.userData.vX *= 0.999;
            b.userData.vZ *= 0.999;
          }
        }
      }

      // Ceiling bounce (hard)
      if (b.userData.isBoulder && b.position.y >= 3.0 && b.userData.vY > 0) {
        b.position.y = 3.0;
        b.userData.vY = -Math.abs(b.userData.vY) * 0.9;
        this.addCameraTrauma(0.4); // Shake room on ceiling hit
      } else if (
        (b.userData.isArrow || b.userData.isShuriken) &&
        b.position.y >= 2.9 &&
        b.userData.vY > 0
      ) {
        // Stick into the ceiling!
        b.position.y = 2.9;
        b.userData.vY = 0;
        b.userData.vX = 0;
        b.userData.vZ = 0;
        b.userData.spellState = "STUCK";

        // Stop the tracer/trail effects but keep the mesh visible
        if (b.userData.trailMesh) b.userData.trailMesh.visible = false;
        b.children.forEach((c) => {
          if (c.isPointLight) c.intensity = 0;
        });
        continue; // Skip further physics/collision this frame
      }

      // Remove if completely stopped or fell off map
      if (
        b.position.y < -5 ||
        (b.position.y <= 0.55 && Math.hypot(b.userData.vX, b.userData.vZ) < 0.2)
      ) {
        // 50% chance: recoverable ammo drop for arrows/shurikens that land on floor
        if (
          (b.userData.isArrow || b.userData.isShuriken) &&
          Math.random() < 0.5
        ) {
          const ammoType = b.userData.isShuriken ? "SHURIKEN" : "ARROW";
          const pickupGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8);
          const pickupMat = new THREE.MeshStandardMaterial({
            color: b.userData.isShuriken ? 0x888888 : 0xaa7700,
            emissive: b.userData.isShuriken ? 0x444444 : 0x553300,
            emissiveIntensity: 0.4,
            roughness: 0.6,
            metalness: 0.5,
          });
          const pickupMesh = new THREE.Mesh(pickupGeo, pickupMat);
          pickupMesh.position.set(b.position.x, 0.12, b.position.z);
          pickupMesh.rotation.y = Math.random() * Math.PI * 2;
          pickupMesh.castShadow = false;
          this.worldGroup.add(pickupMesh);
          // Register into lootItems so proximity loop picks it up
          const pickupGroup = new THREE.Group();
          pickupGroup.position.copy(pickupMesh.position);
          pickupGroup.userData = {
            type: "ammo_pickup",
            ammoType,
            baseMesh: pickupMesh,
            floatTimer: Math.random() * Math.PI * 2,
            basePos: 0.12,
          };
          this.worldGroup.add(pickupGroup);
          this.lootItems.push(pickupGroup);
        }
        this.scene.remove(b);
        this.boulders.splice(bi, 1);
        continue;
      }

      // Wall AABB collision check
      const bGX = Math.round(b.position.x / this.gridSize);
      const bGZ = Math.round(b.position.z / this.gridSize);
      const bWallHit =
        bGX < 0 ||
        bGX >= this.mapWidth ||
        bGZ < 0 ||
        bGZ >= this.mapHeight ||
        this.mapData[bGX]?.[bGZ]?.type === "wall";

      if (bWallHit) {
        if (b.userData.isWater) {
          // Pinball bounce normal based on which cell boundary we crossed
          const cellCenterX = bGX * this.gridSize;
          const cellCenterZ = bGZ * this.gridSize;

          const dx = b.position.x - cellCenterX;
          const dz = b.position.z - cellCenterZ;

          if (Math.abs(dx) > Math.abs(dz)) {
            // Hit the X-facing wall
            b.userData.vX *= -1.0; // PERFECT BOUNCE!
            b.userData.vZ += (Math.random() - 0.5) * 10.0; // Random deflection
            b.position.x += b.userData.vX * delta * 2; // push out
          } else {
            // Hit the Z-facing wall
            b.userData.vZ *= -1.0; // PERFECT BOUNCE!
            b.userData.vX += (Math.random() - 0.5) * 10.0; // Random deflection
            b.position.z += b.userData.vZ * delta * 2;
          }

          // Spawn VFX on wall hit
          this.spawnWaterSplash(b.position.clone());
        } else {
          // Missiles and BOULDERS explode and disappear
          if (b.userData.isFireball) {
            this.spawnFireExplosion(b.position.clone());
          } else if (b.userData.isWind) {
            this.spawnWindSwirl(null, b.position.clone());
          } else {
            this.spawnRockExplosion(b.position.clone());
          }
          this.scene.remove(b);
          this.boulders.splice(bi, 1);
          continue;
        }
      }

      // Entity collision (1.1 world-unit hit radius)
      let bHitEntity = false;
      if (this.worldGroup) {
        const entities = this.dynamicEntities || this.worldGroup.children;
        for (let ci = 0; ci < entities.length; ci++) {
          const child = entities[ci];
          if (child.userData?.type === "enemy" && !child.userData.isDead) {
            const dist2D = Math.hypot(
              b.position.x - child.position.x,
              b.position.z - child.position.z,
            );
            if (dist2D < 1.1) {
              if (
                b.userData.isShuriken ||
                b.userData.type === "SHURIKEN" ||
                b.userData.isArrow
              ) {
                this.scene.remove(b);
                this.boulders.splice(bi, 1);

                // Lodging mechanic for Shurikens and Arrows (100% chance to stick)
                if (b.userData.isShuriken || b.userData.isArrow) {
                  let stuckProj;
                  if (b.userData.isShuriken) {
                    if (b.children[0]) stuckProj = b.children[0].clone();
                  } else {
                    // Arrow: clone the whole projectile except the trail and light
                    stuckProj = new THREE.Group();
                    b.children.forEach((c) => {
                      if (c !== b.userData.trailMesh && !c.isPointLight) {
                        stuckProj.add(c.clone());
                      }
                    });
                  }

                  if (stuckProj) {
                    // 20% smaller when inside monster
                    stuckProj.scale.setScalar(0.8);

                    // Calculate surface hit point: half-in, half-out
                    const dirToProj = new THREE.Vector3().subVectors(
                      b.position,
                      child.position,
                    );
                    dirToProj.y = 0; // Flatten
                    dirToProj.normalize();

                    // Attach to surface (radius ~0.5) + random height
                    const hitY = Math.random() * 1.0 + 0.5; // Chest/body height
                    const worldHitPoint = new THREE.Vector3(
                      child.position.x + dirToProj.x * 0.5,
                      child.position.y + hitY,
                      child.position.z + dirToProj.z * 0.5,
                    );

                    // Add to monster and set exact world rotation so tail faces player
                    child.add(stuckProj);

                    // Convert to local space
                    stuckProj.position.copy(child.worldToLocal(worldHitPoint));

                    // Apply the exact world rotation the projectile had upon impact
                    const worldQuat = b.getWorldQuaternion(
                      new THREE.Quaternion(),
                    );
                    // Remove the parent's rotation to get the correct local rotation
                    const parentQuat = child
                      .getWorldQuaternion(new THREE.Quaternion())
                      .invert();
                    stuckProj.quaternion.copy(parentQuat.multiply(worldQuat));

                    // For shuriken, give it a random spin around its local Z axis
                    if (b.userData.isShuriken) {
                      stuckProj.rotateZ(Math.random() * Math.PI);
                    }
                  }
                }

                // Bloom Impact Flash (Removed PointLight to prevent massive 30,000 mesh shader recompile lockup)
                // const flash = new THREE.PointLight(0xffffff, 5, 3);
                // flash.position.copy(b.position);
                // this.scene.add(flash);
                // setTimeout(() => { if (this.scene) this.scene.remove(flash); }, 100);

                this.flattenGoblin(child, b.userData.dmg);
                this.addCameraTrauma(0.1);
                bHitEntity = true;
                break;
              } else if (b.userData.isBoulder) {
                if (!b.userData.hitEnemies) b.userData.hitEnemies = new Set();
                if (!b.userData.hitEnemies.has(child.userData.id)) {
                  b.userData.hitEnemies.add(child.userData.id);
                  this.flattenGoblin(child, b.userData.dmg);
                  this.addCameraTrauma(0.2);

                  // Spawn small explosion effect but DO NOT remove the boulder
                  // Let it continue piercing through enemies
                  this.spawnRockExplosion(child.position.clone());
                }
              } else {
                const ep = b.position.clone();
                const isWind = b.userData.isWind;
                const isFire = b.userData.isFireball;
                const isWater = b.userData.isWater;
                const isKatana = b.userData.isKatana;
                this.scene.remove(b);
                this.boulders.splice(bi, 1);
                this.flattenGoblin(child, b.userData.dmg);

                if (isWind) {
                  this.spawnWindSwirl(child);
                } else if (isFire) {
                  this.spawnFireExplosion(ep);
                } else if (isWater) {
                  this.spawnWaterSplash(ep);
                } else if (!isKatana) {
                  this.spawnRockExplosion(ep);
                }

                if (isKatana) {
                  // Katana Impact (Removed PointLight to prevent shader recompile lockup)
                  // const flash = new THREE.PointLight(0xffffff, 4, 3);
                  // flash.position.copy(ep);
                  // this.scene.add(flash);
                  // setTimeout(() => { if (this.scene) this.scene.remove(flash); }, 80);
                }

                bHitEntity = true;
                break;
              }
            }
          }
        }
      }
      if (bHitEntity) continue;
    }

    // --- PROCEDURAL LOOT PHYSICS ---
    if (this.lootItems && this.lootItems.length > 0) {
      const pGridX = Math.round(this.player.x);
      const pGridZ = Math.round(this.player.z);

      for (let i = this.lootItems.length - 1; i >= 0; i--) {
        const loot = this.lootItems[i];
        loot.userData.floatTimer += delta;
        loot.position.y =
          loot.userData.basePos +
          Math.sin(loot.userData.floatTimer * 2.5) * 0.18;
        // All loot spins gracefully on Y axis (Slowed by 20%)
        loot.rotation.y +=
          delta * (loot.userData.type === "loot_gold" ? 1.6 : 0.96);

        if (loot.userData.iconMesh) {
          // Call the mirrored animation update logic
          if (loot.userData.customUpdate) {
            loot.userData.customUpdate(loot.userData.floatTimer);
          } else {
            // small flat pulse effect fallback
            const s = 1.0 + Math.sin(loot.userData.floatTimer * 5.0) * 0.1;
            loot.userData.iconMesh.scale.set(s, s, s);
          }
        }

        // Proximity Check: Calculate distance in true World Units
        const lX = loot.position.x;
        const lZ = loot.position.z;
        const pWorldX = this.player.x * this.gridSize;
        const pWorldZ = this.player.z * this.gridSize;
        const distToLoot = Math.hypot(pWorldX - lX, pWorldZ - lZ);

        // Trigger ONLY when the player arrives at the center of the tile (0.5 radius)
        // Trigger on collision bounding overlap (1.0 radius)
        if (
          (distToLoot <= 1.0 && this.autoPickupEnabled !== false) ||
          (distToLoot <= 1.2 && this.keys && this.keys.g)
        ) {
          if (this.keys) this.keys.g = false; // consume keypress
          if (loot.userData.type === "ammo_pickup") {
            // Recovered projectile on floor
            this.spawnCombatText(`+1 ${loot.userData.ammoType}`, "heal");
            window.parent.postMessage(
              { type: "AMMO_PICKUP", card: loot.userData.ammoType },
              "*",
            );
            if (loot.userData.baseMesh)
              this.worldGroup.remove(loot.userData.baseMesh);
            this.worldGroup.remove(loot);
            this.lootItems.splice(i, 1);
            continue;
          } else if (loot.userData.type === "loot_gold") {
            this.player.gold += loot.userData.value;
            window.parent.postMessage(
              {
                type: "LOG_EVENT",
                text: `Looted ${loot.userData.value} Gold!`,
                logType: "system",
              },
              "*",
            );
            this.syncPlayerStats();
            this.triggerHitStop(20); // Small audio/visual bump
          } else if (loot.userData.type === "loot_cards") {
            if (loot.userData.isShopItem) {
              this.player.shopDebt += loot.userData.price;
              window.parent.postMessage(
                {
                  type: "LOG_EVENT",
                  text: `Shopkeeper watches you take the ${loot.userData.cardName} (${loot.userData.price} Gold).`,
                  logType: "system",
                },
                "*",
              );
            } else {
              window.parent.postMessage(
                {
                  type: "LOG_EVENT",
                  text: `Picked up ${loot.userData.cardName} card!`,
                  logType: "system",
                },
                "*",
              );
            }

            if (loot.userData.cardName === "MAGIC LANTERN") {
              this.equipLantern();
            }

            window.parent.postMessage(
              { type: "ADD_CARD", card: loot.userData.cardName },
              "*",
            );

            // Clean up the physical model (no hitStop freeze)

            // YOU GOT! Card Showcase Overlay
            // Player is no longer halted; animation plays smoothly while walking
            if (loot.userData.cardData) {
              window.parent.postMessage(
                { type: "SHOW_LOOT_UI", cardData: loot.userData.cardData },
                "*",
              );
            }
          }

          this.worldGroup.remove(loot);

          if (loot.userData.baseMesh) {
            this.worldGroup.remove(loot.userData.baseMesh);
          }

          this.lootItems.splice(i, 1);
        }
      }
    }
    // --- FOG OF WAR REMOVED ---

    // ═══ RENDER PASSES (camera-mode aware) ════════════════════════════════
    if (!this._pipRect) this._pipRect = { width: 300, height: 300 };

    const pipW = Math.round(this._pipRect.width);
    const pipH = Math.round(this._pipRect.height);
    const pipLeft = Math.round(this._pipRect.left || 0); // Render directly behind the UI container
    const pipBottom = Math.max(
      0,
      Math.round(winH - (this._pipRect.top || 0) - pipH),
    ); // Bottom offset for WebGL scissor
    const webglTop = Math.round(this._pipRect.top || 0); // Top coordinate for drawImage

    // PiP Scissor Boundary (with inset to slip under UI ring)
    const inset = 8;
    const safeX = pipLeft + inset;
    const safeY = pipBottom + inset;
    const safeW = pipW - inset * 2;
    const safeH = pipH - inset * 2;

    // Update overlay container style only if changed (prevents DOM layout thrashing)
    const newLeft = safeX + "px";
    const newBottom = safeY + "px";
    const newWidth = safeW + "px";
    const newHeight = safeH + "px";

    if (this.pipContainer && this.pipContainer.style.left !== newLeft) {
      this.pipContainer.style.left = newLeft;
      this.pipContainer.style.bottom = newBottom;
      this.pipContainer.style.width = newWidth;
      this.pipContainer.style.height = newHeight;
    }

    // ── Update ortho zoom ──
    if (this.topDownCamera) {
      this.topDownCamera.layers.enable(1);
      this.topDownCamera.layers.enable(3); // Ensure Layer 3 (Map-only Avatar) is visible
      const pGX = Math.round(this.player.x);
      const pGZ = Math.round(this.player.z);

      // --- Room-Aware Diablo Camera ---
      let camWX = this.player.x * this.gridSize;
      let camWZ = this.player.z * this.gridSize;

      // Detect if player is inside a room
      let activeRoom = null;
      for (const room of this.rooms) {
        if (
          pGX >= room.x &&
          pGX < room.x + room.w &&
          pGZ >= room.y &&
          pGZ < room.y + room.h
        ) {
          activeRoom = room;
          break;
        }
      }

      // Calculate camera parameters based on location
      let targetFOV, targetHeight, targetBack, lookAtX, lookAtZ;

      // ALWAYS track the player directly instead of locking to the room bounds
      targetFOV = 48;
      targetHeight = 28 * this._pipZoomScale; // +1 tile zoom out
      targetBack = 16 * this._pipZoomScale; // +1 tile zoom out
      lookAtX = camWX;
      lookAtZ = camWZ;

      // Smooth tracking & interpolation
      const camTrackSpeed = Math.min(1, delta * 2.5);
      if (this._pipOrthoTarget.cx === undefined) {
        this._pipOrthoTarget.cx = lookAtX;
        this._pipOrthoTarget.cz = lookAtZ;
        this._pipFOV = targetFOV;
        this._pipHeight = targetHeight;
        this._pipBack = targetBack;
      }
      this._pipOrthoTarget.cx +=
        (lookAtX - this._pipOrthoTarget.cx) * camTrackSpeed;
      this._pipOrthoTarget.cz +=
        (lookAtZ - this._pipOrthoTarget.cz) * camTrackSpeed;
      this._pipFOV += (targetFOV - this._pipFOV) * camTrackSpeed;
      this._pipHeight += (targetHeight - this._pipHeight) * camTrackSpeed;
      this._pipBack += (targetBack - this._pipBack) * camTrackSpeed;

      // Apply smoothed camera params
      const aspect = winW / winH;
      this.topDownCamera.aspect = aspect;
      // For PerspectiveCamera, zoom scale is simulated by adjusting FOV
      this.topDownCamera.fov = 45 * (this._pipZoomScale || 0.8);
      this.topDownCamera.updateProjectionMatrix();

      // Initialize PiP orbit controls (north-up fixed — only compass dial rotates)
      if (!this._pipRot) this._pipRot = { theta: 0, phi: 0.8 };

      // Animate pitch/yaw tween if active
      if (this._pipAngleTween) {
        const tw = this._pipAngleTween;
        tw.t = Math.min(1, tw.t + delta * 2.5); // ~0.4s duration
        const ease = 1 - Math.pow(1 - tw.t, 3); // easeOutCubic
        this.topDownPitch = tw.fromPitch + (tw.toPitch - tw.fromPitch) * ease;
        this.topDownYaw = tw.fromYaw + (tw.toYaw - tw.fromYaw) * ease;
        if (tw.t >= 1) this._pipAngleTween = null;
      }

      // Dynamic Isometric / Top-Down Orientation
      const pitch = THREE.MathUtils.degToRad(
        this.topDownPitch !== undefined ? this.topDownPitch : 60,
      );
      const cameraAngle = THREE.MathUtils.degToRad(
        this.topDownYaw !== undefined ? this.topDownYaw : -45,
      );

      const camPosX = this._pipOrthoTarget.cx;
      const camPosZ = this._pipOrthoTarget.cz;
      const offX = 0;
      const offZ = 0;

      // Rubber-band Pan and Zoom back to original view after 1.5s of no interaction
      if (
        this._pipLastInteractionTime &&
        Date.now() - this._pipLastInteractionTime > 1500
      ) {
        if (this._pipPan) {
          this._pipPan.x += (0 - this._pipPan.x) * 0.05;
          this._pipPan.z += (0 - this._pipPan.z) * 0.05;
          if (Math.abs(this._pipPan.x) < 0.01) this._pipPan.x = 0;
          if (Math.abs(this._pipPan.z) < 0.01) this._pipPan.z = 0;
        }
        if (this._pipZoomScale !== undefined) {
          this._pipZoomScale += (0.8 - this._pipZoomScale) * 0.05;
        }
      }

      const panX = this._pipPan ? this._pipPan.x : 0;
      const panZ = this._pipPan ? this._pipPan.z : 0;

      const dist = 40 * (this._pipZoomScale || 0.8); // Adjust zoom distance
      const targetX = camPosX + offX + panX;
      const targetZ = camPosZ + offZ + panZ;

      this.topDownCamera.position.set(
        targetX + dist * Math.sin(cameraAngle) * Math.cos(pitch),
        dist * Math.sin(pitch),
        targetZ + dist * Math.cos(cameraAngle) * Math.cos(pitch),
      );
      this.topDownCamera.lookAt(targetX, 0, targetZ);

      // Sync player avatar token
      if (this.playerAvatar) {
        this.playerAvatar.position.set(camWX, 0, camWZ);
        this.playerAvatar.rotation.y = this.player.rot; // Update rotation

        // Handle walk animation — only walk when actively holding a movement key
        if (this.playerMixer && this.playerWalkAction) {
          const actuallyWalking = moveDir !== 0;
          if (actuallyWalking) {
            if (this.playerMixer._current !== "walk") {
              if (this.playerIdleAction) this.playerIdleAction.stop();
              this.playerWalkAction.reset();
              this.playerWalkAction.play();
              this.playerMixer._current = "walk";
            }
          } else {
            if (this.playerMixer._current !== "idle") {
              this.playerWalkAction.stop();
              if (this.playerIdleAction) {
                this.playerIdleAction.reset();
                this.playerIdleAction.setLoop(THREE.LoopRepeat);
                this.playerIdleAction.play();
              }
              this.playerMixer._current = "idle";
            }
          }
        }
      }
    }

    if (this.cameraMode === "topdown" && this.topDownCamera) {
      // ── TOP-DOWN MAIN + FPV PiP ──────────────────────────────────────
      // [1] Full-screen top-down (Rendered FIRST)
      this.renderer.setViewport(0, 0, winW, winH);
      this.renderer.setScissor(0, 0, winW, winH);
      this.renderer.setScissorTest(true);
      this.scene.fog.color.setHex(0x0a0b10);
      this.scene.fog.density = 0.045; // Thick dust haze

      // Boost Lights for Top Down — walls +15%, avatar/monsters +70%
      // ambient: 0.9 * 1.15 = ~1.04 (walls visible +15%)
      if (this.ambientLight && this.ambientLight.intensity !== 1.04)
        this.ambientLight.intensity = 1.04;
      // hemisphere sky: 0.3 * 1.7 = 0.51 (creatures overhead +70%)
      if (this.hemisphereLight && this.hemisphereLight.intensity !== 0.51)
        this.hemisphereLight.intensity = 0.51;
      // dirLight: 0.12 * 1.7 = ~0.20 (top-down key light +70%)
      if (this.dirLight && this.dirLight.intensity !== 0.2)
        this.dirLight.intensity = 0.2;
      if (this.rimLight && this.rimLight.intensity !== 0.1)
        this.rimLight.intensity = 0.1;
      // Avatar point light boosted 70% for top-down clarity
      if (this.avatarLight && this.avatarLight.intensity !== 4.25)
        this.avatarLight.intensity = 4.25;
      if (this.headlamp && this.headlamp.intensity !== 0.0)
        this.headlamp.intensity = 0.0; // Headlamp irrelevant in top-down
      // Hide FoW overlay in fullscreen map mode
      if (this._fowCanvas) this._fowCanvas.style.display = "none";
      this.renderer.setClearColor(0x06020f, 1);

      // Fix: Set aspect ratio for fullscreen
      this.topDownCamera.aspect = winW / winH;
      this.topDownCamera.updateProjectionMatrix();

      // Fix: Hide the circular masks during fullscreen render so it's not clipped into a circle!
      if (this._pipMaskMesh) this._pipMaskMesh.visible = false;
      if (this._pipBgMesh) this._pipBgMesh.visible = false;

      this.renderer.render(this.scene, this.topDownCamera);

      // Restore FPV spooky baseline — write only if changed
      const _tdFpvAmbient = 0.9;
      if (this.ambientLight && this.ambientLight.intensity !== _tdFpvAmbient)
        this.ambientLight.intensity = _tdFpvAmbient;
      if (this.hemisphereLight && this.hemisphereLight.intensity !== 0.3)
        this.hemisphereLight.intensity = 0.3;
      if (this.dirLight && this.dirLight.intensity !== 0.12)
        this.dirLight.intensity = 0.12;
      if (this.rimLight && this.rimLight.intensity !== 0.06)
        this.rimLight.intensity = 0.06;
      if (this.avatarLight && this.avatarLight.intensity !== 2.5)
        this.avatarLight.intensity = 2.5;
      if (this.headlamp && this.headlamp.intensity !== 0.02) {
        this.headlamp.intensity = 0.02;
        this.headlamp.distance = this.gridSize * 10;
      }

      // [2] Small FPV view rendered via main renderer PiP (Rendered SECOND)
      this.renderer.setViewport(safeX, safeY, safeW, safeH);
      this.renderer.setScissor(safeX, safeY, safeW, safeH);
      this.renderer.setScissorTest(true);
      this.renderer.setClearColor(0x0f0f14, 1);

      const originalFov = this.camera.fov;
      this.camera.aspect = safeW / safeH;
      this.camera.fov = originalFov * 0.85;
      this.camera.updateProjectionMatrix();

      this.scene.fog.density = 0.015;
      const oldBg = this.scene.background;
      this.scene.background = null;

      // Ensure the FPV PiP has no masks attached (masks belong to topDownCamera usually)
      // If we ever want circular FPV PiP we'd move the masks to this camera here.

      this.renderer.clearDepth(); // Ensure PiP draws on top
      this.renderer.render(this.scene, this.camera);

      this.scene.background = oldBg;
      this.camera.fov = originalFov;
    } else {
      // ── FPV MAIN + TOP-DOWN PiP (default) ────────────────────────────
      // Restore FoW overlay (may be hidden from fullscreen topdown mode)
      if (this._fowCanvas && this._fowCanvas.style.display === "none")
        this._fowCanvas.style.display = "";
      // [1] FPV main render
      this.renderer.setClearColor(0x06020f, 1);
      this.scene.fog.density = 0.015;

      // FPV spooky baseline
      if (this.ambientLight) this.ambientLight.intensity = 0.9;
      if (this.hemisphereLight) this.hemisphereLight.intensity = 0.3;
      if (this.dirLight) this.dirLight.intensity = 0.12;
      if (this.rimLight) this.rimLight.intensity = 0.06;

      if (this.headlamp) {
        this.headlamp.intensity = 0.015; // Dim headlamp in FPV
        this.headlamp.distance = this.gridSize * 14;
      }
      if (this.layoutData && this.layoutData.fpv) {
        const fRect = this.layoutData.fpv;
        this.renderer.setViewport(
          fRect.left,
          fRect.bottom,
          fRect.width,
          fRect.height,
        );
        this.renderer.setScissor(
          fRect.left,
          fRect.bottom,
          fRect.width,
          fRect.height,
        );
        this.renderer.setScissorTest(true);

        this.camera.aspect = fRect.width / fRect.height;
        this.camera.updateProjectionMatrix();
      } else {
        this.renderer.setViewport(0, 0, winW, winH);
        this.renderer.setScissor(0, 0, winW, winH);
        this.renderer.setScissorTest(true);

        this.camera.aspect = winW / winH;
        this.camera.updateProjectionMatrix();
      }

      if (this._lootShowcase3D) {
        this._lootShowcase3D.rotation.y += delta * 2.5;
      }

      // Only route through composer (OutlinePass) when an enemy is targeted.
      // Otherwise bypass entirely → direct render saves 8-15ms/frame.
      const hasOutline =
        this.outlinePass &&
        this.outlinePass.selectedObjects &&
        this.outlinePass.selectedObjects.length > 0;
      if (this.composer && hasOutline) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      // [2] Top-down map PiP via main renderer
      if (this.topDownCamera) {
        this.renderer.setViewport(safeX, safeY, safeW, safeH);
        this.renderer.setScissor(safeX, safeY, safeW, safeH);
        this.renderer.setScissorTest(true);

        // Show circular masks for the small PiP to clip it to a circle!
        if (this._pipMaskMesh) this._pipMaskMesh.visible = true;
        if (this._pipBgMesh) this._pipBgMesh.visible = true;

        // Adjust Perspective Camera (Enforce Square Aspect Ratio)
        const aspect = 1;
        this.topDownCamera.aspect = aspect;
        this.topDownCamera.fov = 35 * (this._pipZoomScale || 0.5);
        this.topDownCamera.updateProjectionMatrix();

        // Create Circular Depth Mask & Background once
        if (!this._pipMaskMesh) {
          const maskGeo = new THREE.RingGeometry(1, 100, 64);
          const maskMat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          });
          this._pipMaskMesh = new THREE.Mesh(maskGeo, maskMat);
          this._pipMaskMesh.frustumCulled = false;
          this._pipMaskMesh.layers.set(3);
          this.topDownCamera.add(this._pipMaskMesh);

          const bgGeo = new THREE.CircleGeometry(1.02, 64);
          const bgMat = new THREE.MeshBasicMaterial({
            color: 0x0f0f14,
            depthWrite: true,
            side: THREE.DoubleSide,
          });
          this._pipBgMesh = new THREE.Mesh(bgGeo, bgMat);
          this._pipBgMesh.frustumCulled = false;
          this._pipBgMesh.layers.set(3);
          this.topDownCamera.add(this._pipBgMesh);
          this.scene.add(this.topDownCamera);
        }

        // Update mask scale based on current FOV
        const distMask = 0.5;
        this._pipMaskMesh.position.set(0, 0, -distMask);
        this._pipMaskMesh.renderOrder = -999;
        const fovRad = (this.topDownCamera.fov * Math.PI) / 180;
        const hMask = 2 * distMask * Math.tan(fovRad / 2);
        this._pipMaskMesh.scale.set(hMask / 2, hMask / 2, 1);

        const distBg = 900;
        this._pipBgMesh.position.set(0, 0, -distBg);
        this._pipBgMesh.renderOrder = -998;
        const hBg = 2 * distBg * Math.tan(fovRad / 2);
        this._pipBgMesh.scale.set(hBg / 2, hBg / 2, 1);

        this.scene.fog.color.setHex(0x06020f); // Spooky dark fog
        this.scene.fog.density = 0.0; // Zero out fog for clear PiP map

        // Boost lights for PIP top-down pass — walls +15%, avatar/monsters +70%
        const fpvAmbient = 0.9;
        if (this.ambientLight && this.ambientLight.intensity !== 1.04)
          this.ambientLight.intensity = 1.04;
        if (this.hemisphereLight && this.hemisphereLight.intensity !== 0.51)
          this.hemisphereLight.intensity = 0.51;
        if (this.dirLight && this.dirLight.intensity !== 0.2)
          this.dirLight.intensity = 0.2;
        if (this.rimLight && this.rimLight.intensity !== 0.1)
          this.rimLight.intensity = 0.1;
        if (this.avatarLight && this.avatarLight.intensity !== 4.25)
          this.avatarLight.intensity = 4.25;
        if (this.headlamp && this.headlamp.intensity !== 0.0)
          this.headlamp.intensity = 0.0; // Off in top-down

        const oldBg = this.scene.background;
        this.scene.background = null;

        this.renderer.autoClearColor = false; // Preserve FPV scene in corners!
        this.renderer.clearDepth(); // Ensure PiP draws on top
        this.renderer.render(this.scene, this.topDownCamera);
        this.renderer.autoClearColor = true;

        this.scene.background = oldBg;

        // Restore FPV spooky baseline — write only if changed
        if (this.ambientLight && this.ambientLight.intensity !== fpvAmbient)
          this.ambientLight.intensity = fpvAmbient;
        if (this.hemisphereLight && this.hemisphereLight.intensity !== 0.3)
          this.hemisphereLight.intensity = 0.3;
        if (this.dirLight && this.dirLight.intensity !== 0.12)
          this.dirLight.intensity = 0.12;
        if (this.rimLight && this.rimLight.intensity !== 0.06)
          this.rimLight.intensity = 0.06;
        if (this.avatarLight && this.avatarLight.intensity !== 2.5)
          this.avatarLight.intensity = 2.5;
        if (this.headlamp && this.headlamp.intensity !== 0.02) {
          this.headlamp.intensity = 0.02;
          this.headlamp.distance = this.gridSize * 10;
        }

        this.scene.fog.color.setHex(0x0a0b10);
        this.scene.fog.density = 0.025;

        // ── FOG OF WAR overlay (drawn via 2D canvas over pipContainer) ──
        this._drawFogOfWar(safeX, safeY, safeW, safeH);
      }

      // --- 3rd Render Pass: Monster POV Cam ---
      if (
        this._monsterCamRect &&
        this._monsterCamRect.width > 0 &&
        this.currentMonsterCamTarget &&
        !this.currentMonsterCamTarget.userData.isDead &&
        this.combatState !== "idle"
      ) {
        const winH = window.innerHeight;
        const safeX = this._monsterCamRect.left;
        const safeY = winH - this._monsterCamRect.bottom;
        const safeW = this._monsterCamRect.width;
        const safeH = this._monsterCamRect.height;

        // Update monster camera position (behind the monster, looking at player)
        const mMesh = this.currentMonsterCamTarget;
        const mPos = mMesh.position;
        // Monster faces the player, so its back is opposite to its rotation.y
        const offsetZ = Math.cos(mMesh.rotation.y) * 2.5;
        const offsetX = Math.sin(mMesh.rotation.y) * 2.5;

        this.monsterCamera.position.set(
          mPos.x - offsetX,
          mPos.y + 1.2,
          mPos.z - offsetZ,
        );
        this.monsterCamera.lookAt(this.player.x, mPos.y + 0.5, this.player.z);
        this.monsterCamera.aspect = safeW / safeH;
        this.monsterCamera.updateProjectionMatrix();

        this.renderer.setViewport(safeX, safeY, safeW, safeH);
        this.renderer.setScissor(safeX, safeY, safeW, safeH);
        this.renderer.setScissorTest(true);

        // Increase light specifically for the cute cam if needed, but keeping current lights is fine
        const oldBg = this.scene.background;
        this.scene.background = null;

        this.renderer.autoClearColor = false;
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.monsterCamera);
        this.renderer.autoClearColor = true;

        this.scene.background = oldBg;
      }
    }

    // --- FPS Counter ---
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      const fpsEl = document.getElementById("fps-counter");
      if (fpsEl) {
        fpsEl.textContent = `FPS: ${this.currentFps}/60`;
      }
    }
  },

  equipLantern() {
    if (this.lanternLight) return; // already equipped

    // Ensure camera is in the scene so attached lights move with it
    this.scene.add(this.camera);

    // ── PRIMARY SPOTLIGHT: Photorealistic Warm Tungsten ──
    // Moderate intensity strictly focused forward
    this.lanternLight = new THREE.SpotLight(0xfff5e0, 1.8);
    this.lanternLight.position.set(0.25, -0.15, 0.3);

    // Tight beam with soft penumbra edge — matches real LED flashlight
    this.lanternLight.angle = Math.PI / 8;
    this.lanternLight.penumbra = 0.25;
    this.lanternLight.decay = 1.8;
    this.lanternLight.distance = 200;

    // DISABLED shadow mapping on flashlight to restore 120 FPS
    this.lanternLight.castShadow = false;
    // this.lanternLight.shadow.mapSize.width = 1024;
    // this.lanternLight.shadow.mapSize.height = 1024;
    // this.lanternLight.shadow.camera.near = 0.5;
    // this.lanternLight.shadow.camera.far = 60;
    this.lanternLight.shadow.bias = -0.001;
    this.lanternLight.layers.set(1);

    this.lanternLight.target.position.set(0, -0.3, -10);

    this.camera.add(this.lanternLight);
    this.camera.add(this.lanternLight.target);

    // ── SECONDARY FILL: Soft wide spill for peripheral bounce light ──
    this.lanternFill = new THREE.SpotLight(0xffe8cc, 0.15); // Dramatically reduced brightness
    this.lanternFill.position.set(0.25, -0.15, 0.3);
    this.lanternFill.angle = Math.PI / 6; // Narrowed to not act as a general light source
    this.lanternFill.penumbra = 1.0;
    this.lanternFill.decay = 2.0;
    this.lanternFill.distance = 30; // Shortened bounce
    this.lanternFill.target.position.set(0, -0.5, -8);
    this.lanternFill.layers.set(1);
    this.camera.add(this.lanternFill);
    this.camera.add(this.lanternFill.target);

    // ── Dim ambient lighting for dramatic flashlight contrast ──
    if (this.ambientLight) this.ambientLight.intensity = 0.15;

    // Darken fog for moody beam visibility
    if (this.scene.fog) {
      this.scene.fog.density = 0.035;
    }

    // ── VOLUMETRIC LIGHT CONE: Multi-layer photorealistic beam ──
    const coneLength = 10; // Reduced from 16 to reduce screen-space overdraw
    const coneAngle = Math.PI / 8; // Narrower beam
    const coneRadius = coneLength * Math.tan(coneAngle);
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneLength, 8, 1, true); // Lowered from 12 to 8 to fix FPS spasm

    const coneMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xfff5e0) },
        uOpacity: { value: 0.045 },
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
      },
      vertexShader: `
                        varying float vHeight;
                        varying float vRadius;
                        varying vec3 vWorldPos;
                        void main() {
                            vHeight = (position.y + ${(coneLength / 2).toFixed(1)}) / ${coneLength.toFixed(1)};
                            vRadius = length(position.xz) / ${coneRadius.toFixed(3)};
                            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
      fragmentShader: `
                        uniform vec3 uColor;
                        uniform float uOpacity;
                        uniform float uTime;
                        uniform float uIntensity;
                        varying float vHeight;
                        varying float vRadius;
                        varying vec3 vWorldPos;
                        void main() {
                            // Inverse-square falloff from source (bright near, dim far)
                            float distFade = 1.0 / (1.0 + vHeight * vHeight * 2.0);
                            
                            // Hotspot: bright center core fading to soft edges
                            float hotspot = exp(-vRadius * vRadius * 4.0);
                            
                            // Soft outer penumbra
                            float penumbra = 1.0 - smoothstep(0.6, 1.0, vRadius);
                            
                            // Combine core beam profile
                            float beam = mix(penumbra * 0.3, hotspot, 0.7) * distFade;
                            
                            // Atmospheric dust / Rayleigh scattering (subtle blue shift at edges)
                            float scatter = smoothstep(0.4, 1.0, vRadius) * 0.15 * distFade;
                            vec3 scatterColor = vec3(0.7, 0.8, 1.0);
                            
                            // Optimized Dust motes to prevent GPU spasm
                            float dust1 = sin(vWorldPos.x * 20.0 + uTime * 1.5) * cos(vWorldPos.z * 25.0);
                            float dustMask = smoothstep(0.7, 1.0, dust1) * hotspot * distFade;
                            
                            // Removed cinema blinking flicker for stable lighting
                            float flicker = 1.0;
                            
                            // Final composite
                            vec3 beamColor = uColor * beam + scatterColor * scatter;
                            float alpha = (beam * uOpacity + scatter * 0.01 + dustMask * 0.01) * flicker * uIntensity;
                            
                            gl_FragColor = vec4(beamColor, alpha);
                        }
                    `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.rotation.x = Math.PI / 2;
    coneMesh.position.set(0.25, -0.15, -coneLength / 2 + 0.3);
    coneMesh.renderOrder = 999;
    coneMesh.layers.set(1); // Exclude from PiP camera!

    this.camera.add(coneMesh);
    this.lanternCone = coneMesh;
    this.lanternConeMat = coneMat;

    // ── LENS GLOW: Bright point source at flashlight head ──
    const lensGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.set(0.25, -0.15, 0.3);
    lensMesh.renderOrder = 1000;
    lensMesh.layers.set(1); // Exclude from PiP camera!
    this.camera.add(lensMesh);
    this.lanternLens = lensMesh;

    window.parent.postMessage(
      {
        type: "LOG_EVENT",
        text: `Equipped Magic Lantern! Light shines forth.`,
        logType: "system",
      },
      "*",
    );
  },

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

  _ct_mPos: new THREE.Vector3(),

  _ct_cPos: new THREE.Vector3(),

  _ct_dirFromPlayer3D: new THREE.Vector3(),

  _ct_camDir: new THREE.Vector3(),

  // ── FOG OF WAR ────────────────────────────────────────────────────────────
  // Initialise the explored-tile Set and 2D overlay canvas once on first call.
  _initFow() {
    if (this._fowReady) return;
    this._fowExplored = new Set(); // "gx,gz" strings
    this._fowRevealRadius = 5; // tiles visible around player

    // Offscreen canvas — drawn into pipContainer as a composited 2D layer
    this._fowCanvas = document.createElement("canvas");
    this._fowCanvas.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "width:100%",
      "height:100%",
      "border-radius:50%",
      "pointer-events:none",
      "z-index:5",
    ].join(";");
    if (this.pipContainer) this.pipContainer.appendChild(this._fowCanvas);
    this._fowReady = true;
  },

  // Call once per grid step to mark tiles as explored.
  _fowRevealAround(gx, gz) {
    if (!this._fowReady) this._initFow();
    const r = this._fowRevealRadius;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz <= r * r) {
          this._fowExplored.add(`${gx + dx},${gz + dz}`);
        }
      }
    }
  },

  // Draw fog-of-war overlay onto the pipContainer canvas after each PIP render.
  _drawFogOfWar(pipX, pipY, pipW, pipH) {
    if (!this._fowReady) this._initFow();
    if (!this._fowCanvas || !this._fowExplored || !this.topDownCamera) return;

    const cvs = this._fowCanvas;
    if (cvs.width !== pipW || cvs.height !== pipH) {
      cvs.width = pipW;
      cvs.height = pipH;
    }

    const ctx = cvs.getContext("2d");
    ctx.clearRect(0, 0, pipW, pipH);

    // Fill with dark fog
    ctx.fillStyle = "rgba(6,2,15,0.82)";
    ctx.beginPath();
    ctx.arc(pipW / 2, pipH / 2, pipW / 2, 0, Math.PI * 2);
    ctx.fill();

    // For each explored tile, project its world position into pip screen space
    // and punch a gradient hole in the fog.
    ctx.globalCompositeOperation = "destination-out";
    const cam = this.topDownCamera;
    const gs = this.gridSize;
    const _v = new THREE.Vector3();
    const halfW = pipW / 2;
    const halfH = pipH / 2;
    // Tile radius in screen pixels: approximate from camera FOV and distance
    const dist = cam.position.distanceTo(
      new THREE.Vector3(cam.position.x, 0, cam.position.z),
    );
    const fovRad = (cam.fov * Math.PI) / 180;
    const tileScreenR = Math.max(
      6,
      (gs / (2 * cam.position.y * Math.tan(fovRad / 2))) * pipH * 0.9,
    );

    this._fowExplored.forEach((key) => {
      const [gx, gz] = key.split(",").map(Number);
      _v.set(gx * gs, 0, gz * gs);
      _v.project(cam);
      // NDC -> pixel (pip-local)
      const sx = (_v.x * 0.5 + 0.5) * pipW;
      const sy = (_v.y * -0.5 + 0.5) * pipH;
      // Skip tiles outside the pip circle
      const dx = sx - halfW,
        dy = sy - halfH;
      if (dx * dx + dy * dy > halfW * halfW) return;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, tileScreenR);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.7, "rgba(0,0,0,0.9)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, tileScreenR, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
  },
};

