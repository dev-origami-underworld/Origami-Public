import { World } from "./World.js";
import { InputSystem } from "./InputSystem.js";

// Use the global THREE.js instance loaded by the HTML script tag to avoid duplicate instances
const THREE = window.THREE;

export class Engine {
  constructor(cfg = {}) {
    this.containerId = cfg.containerId || "main-container";
    this.canvasId = cfg.canvasId || "main-canvas";

    // Subsystems
    this.input = new InputSystem(this);
    this.world = new World(this);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15; // Match FPV.2
    this.renderer.setClearColor(0x1a1d24, 1); // Match FPV.2

    // Loop
    this.clock = new THREE.Clock();
    this.isRunning = false;

    // Append Canvas
    this.initDOM();

    // Resize Listener
    window.addEventListener("resize", () => this.onWindowResize(), false);

    // Rendering Config
    this.pipElement = null; // DOM Element defining PIP area
    this.pipCamera = null; // Camera for PIP
    this.isMapMain = false; // State for swap
  }

  initDOM() {
    const container =
      document.getElementById(this.containerId) || document.body;
    this.renderer.domElement.id = this.canvasId;
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.zIndex = "0";
    container.appendChild(this.renderer.domElement);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.animate();
    console.log("🚀 Engine Started");
  }

  animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    this.input.tick(delta);
    this.world.tick(delta);
    this.render();
  }

  render() {
    // Cameras
    let mainCam = this.world.activeCamera;
    let pipCam = this.pipCamera;

    // Swap Logic
    if (this.isMapMain) {
      mainCam = this.pipCamera;
      pipCam = this.world.activeCamera;
    }

    if (!mainCam) return;

    // 1. Render MAIN (Full Screen)
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.render(this.world.scene, mainCam);

    // 2. Render PIP (if exists)
    if (pipCam && this.pipElement) {
      const rect = this.pipElement.getBoundingClientRect();

      // Convert DOM rect (Top-Left) to WebGL Scissor (Bottom-Left)
      const width = rect.width;
      const height = rect.height;
      const left = rect.left;
      const bottom = window.innerHeight - rect.bottom;

      this.renderer.setScissor(left, bottom, width, height);
      this.renderer.setViewport(left, bottom, width, height);
      this.renderer.setScissorTest(true);

      // Optional: Clear depth or bg for PIP?
      // this.renderer.clearDepth(); // If we want it on top strictly

      this.renderer.render(this.world.scene, pipCam);

      this.renderer.setScissorTest(false);
    }
  }

  swapViews() {
    this.isMapMain = !this.isMapMain;
    this.onWindowResize(); // Force aspect ratio update
  }

  onWindowResize() {
    const updateCam = (cam) => {
      if (!cam) return;
      if (cam.isPerspectiveCamera) {
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
      }
      // If Ortho, handled differently usually, but for now we skip
    };

    // If swapped, the "Active" camera logic might need specific aspect handling
    // but simplistically, just update both if they are perspective.
    updateCam(this.world.activeCamera);
    updateCam(this.pipCamera);

    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
