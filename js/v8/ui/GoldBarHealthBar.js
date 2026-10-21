// ═══════════════════════════════════════════════════════════════════════════════════════════════════════ [REF#UI-00001]
//  GOLD-BAR HEALTH HUD — premium gold-bullion housing with a horizontal nuclear-green fluid reservoir.
//  Mark 2026-07-20: "health bars are currently so bad it makes the entire game look bad — make it wow."
//  Full spec in his message: gold bullion bar, blunt cylindrical reservoir (NO syringe needle/tip), always
//  nuclear-green fluid (#75FF39) that shrinks horizontally with health, gauge marks, pH spectrum band with
//  a moving marker, CRITICAL/WARNING/STABLE states (text + colour, never colour alone).
//
//  Runs in the PANELS iframe (three r160). Replaces SyringeHealthBar. Public instance: window._playerHealthBar.
//
//  ⚠ FPS DOCTRINE (the whole reason this game has been protesting): a 3D HUD that renders EVERY frame would
//  make the frame budget worse. So this IDLE-THROTTLES: it renders only while the health value is animating,
//  while a bubble cycle is settling, or while the pointer is over it — then it FREEZES the RAF entirely.
//  A static HUD costs zero GPU. Cap DPR at 2. One key + one fill + hemi + a green bounce light; no post FX.
//
//  API: setHealth(v, {animate}) · damage(n) · heal(n) · setAutoColor(bool) · resize() · dispose()
//  The fluid stays nuclear-green at every health level — state colour only touches the label, LED and marker.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const NUCLEAR = (typeof window !== 'undefined' && typeof window._hpDeepGreen === 'number') ? window._hpDeepGreen : 0x2fb03a;   // DEEP GREEN (Mark 2026-07-25 "more deep green"; was neon-lime 0x75ff39). Matches the monster OrigamiCapsuleGauge body → player + monsters read as one family. Knob: window._hpDeepGreen. [REF#UI-00002]
const STATE = (pct) => pct <= 24 ? { key: 'CRITICAL', led: 0xff3b30, mark: 0xff3b30 }
                    : pct <= 48 ? { key: 'WARNING',  led: 0xffcc00, mark: 0xffcc00 }
                    :             { key: 'STABLE',   led: 0x34c759, mark: 0x34c759 };

// ── canvas textures (all built once, disposed on teardown) ──────────────────────────────────────────── [REF#UI-00003]
function goldScratchTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);           // scratches ride a normal-ish roughness map [REF#UI-00004]
    for (let i = 0; i < 70; i++) {
        const x = Math.random() * 256, y = Math.random() * 256, len = 10 + Math.random() * 40, a = (Math.random() - 0.5) * 0.5;
        g.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.06})`; g.lineWidth = 0.6 + Math.random();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}
// engraved plate: AU · ORIGAMI UNDERWORLD · AURUM CORE · GOLD RESERVE — subtle, never over the reservoir [REF#UI-00005]
function engraveTex() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(40,28,4,0.55)'; g.font = '900 150px Georgia, serif'; g.textBaseline = 'middle';
    g.fillText('AU', 40, 128);                                  // big embossed AU, top-left of the bar face [REF#UI-00006]
    g.font = '700 34px Georgia, serif'; g.fillStyle = 'rgba(60,42,8,0.5)';
    g.fillText('ORIGAMI UNDERWORLD', 250, 60);
    g.fillText('AURUM CORE', 250, 128);
    g.fillText('GOLD RESERVE  ·  999.9 FINE', 250, 196);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// gauge overlay: TRANSPARENT background, thick white ticks + dark outline, big numbers. Sits in front of glass. [REF#UI-00007]
function gaugeTex() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    const drawTick = (x, h, w) => { g.lineWidth = w + 2; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.moveTo(x, 128 - h); g.lineTo(x, 128 + h); g.stroke();
                                    g.lineWidth = w; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x, 128 - h); g.lineTo(x, 128 + h); g.stroke(); };
    for (let p = 0; p <= 100; p += 5) {                         // minor every 5, major every 25 [REF#UI-00008]
        const x = 40 + (p / 100) * 944, major = (p % 25 === 0);
        drawTick(x, major ? 62 : 34, major ? 5 : 3);
        if (major) {
            g.font = '800 46px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center';
            g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(String(p), x, 128 + 96);
            g.fillStyle = '#fff'; g.fillText(String(p), x, 128 + 96);
        }
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// pH-style spectrum band: red→orange→yellow→green, thin white border. Marker is a SEPARATE mesh. [REF#UI-00009]
function spectrumTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0.00, '#e02012'); grad.addColorStop(0.33, '#ff7a18');
    grad.addColorStop(0.60, '#ffd21e'); grad.addColorStop(1.00, '#75ff39');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 64);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.strokeRect(2, 2, 508, 60);
    return new THREE.CanvasTexture(c);
}

export class GoldBarHealthBar {
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.health = clamp(opts.health ?? 100, 0, 100);
        this.target = this.health;
        this.xp = clamp(opts.xp ?? 0, 0, 100);          // Mark 2026-07-24: the bottom band is now a BLUE XP bar, not the pH spectrum [REF#UI-00010]
        this.autoColor = opts.autoColor !== false;
        this.onState = opts.onState || null;
        this._reduceMotion = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;
        this._disposed = false;
        this._raf = 0;
        this._running = false;
        this._hover = false;
        this._tex = [];

        const w = canvas.clientWidth || 240, h = canvas.clientHeight || 96;
        // preserveDrawingBuffer:true is REQUIRED for the idle-throttle-then-FREEZE pattern — once the RAF stops, [REF#UI-00011]
        // a non-preserved buffer reads back / re-composites BLACK on some browsers, so a frozen HUD would blank
        // out. Preserving it holds the last frame with zero ongoing GPU cost. Harmless at this canvas size.
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));   // DPR cap 2 (spec) [REF#UI-00012]
        this.renderer.setSize(w, h, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        // ⚠ METAL NEEDS SOMETHING TO REFLECT — without an environment map a metalness=1 gold reflects the black [REF#UI-00013]
        //   scene and renders BLACK, not gold. Build a cheap warm-studio equirect gradient and PMREM it into
        //   scene.environment so the bullion actually looks like polished gold. This is the single change that
        //   turns the bar from a dark slab into "photorealistic gold". Disposed in dispose().
        this.scene.environment = this._makeStudioEnv();
        this.camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 100);
        this._contentW = 6.2; this._contentH = 2.4;             // the gold bar's footprint, for aspect-fit framing [REF#UI-00014]
        this._frame(w, h);

        // ── lights: one warm key (shadow), one warm fill, hemi, green fluid bounce ── [REF#UI-00015]
        const key = new THREE.DirectionalLight(0xfff0dc, 2.1); key.position.set(3.5, 5, 5); key.castShadow = true;
        key.shadow.mapSize.set(512, 512); key.shadow.camera.near = 1; key.shadow.camera.far = 20; this.scene.add(key);
        const fill = new THREE.DirectionalLight(0xffe6c0, 0.7); fill.position.set(-4, 1.5, 3); this.scene.add(fill);
        this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1508, 0.55));
        this._greenBounce = new THREE.PointLight(NUCLEAR, 0.9, 8, 2); this._greenBounce.position.set(0, -0.3, 1.2); this.scene.add(this._greenBounce);

        this.root = new THREE.Group(); this.scene.add(this.root);
        this._buildGoldBar();
        this._buildReservoir();
        this._buildBubbles();
        this._buildGaugeAndSpectrum();
        this._buildLED();

        // pointer parallax (restrained) + click/tap-to-set [REF#UI-00016]
        this._onMove = (e) => {
            const r = canvas.getBoundingClientRect();
            this._px = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
            this._py = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
            this._hover = true; this._wake();
        };
        this._onLeave = () => { this._hover = false; this._px = 0; this._py = 0; this._wake(); };
        canvas.addEventListener('pointermove', this._onMove);
        canvas.addEventListener('pointerleave', this._onLeave);

        this._ro = ('ResizeObserver' in window) ? new ResizeObserver(() => this.resize()) : null;
        if (this._ro) this._ro.observe(canvas);

        this._applyHealth(this.health, true);   // set the fluid instantly to the starting value [REF#UI-00017]
        this._wake();                            // one render pass, then it freezes if nothing animates [REF#UI-00018]
    }

    // warm-studio equirectangular env → PMREM. Bright warm top + soft sides = gold that reads as gold. [REF#UI-00019]
    _makeStudioEnv() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0.0, '#fff4dc'); grad.addColorStop(0.35, '#d9b877');
        grad.addColorStop(0.6, '#5a4a2e'); grad.addColorStop(1.0, '#0e0b06');
        g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
        g.fillStyle = 'rgba(255,248,230,0.9)'; g.fillRect(60, 8, 140, 20);   // a bright soft-box highlight to streak the metal [REF#UI-00020]
        const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; this._tex.push(tex);
        const pmrem = new THREE.PMREMGenerator(this.renderer); pmrem.compileEquirectangularShader();
        const rt = pmrem.fromEquirectangular(tex); pmrem.dispose(); this._envRT = rt;
        return rt.texture;
    }

    // ── GOLD BULLION HOUSING — trapezoidal bevelled bar, PBR gold + clearcoat + engraving + scratches ── [REF#UI-00021]
    _buildGoldBar() {
        const shape = new THREE.Shape();                        // trapezoid cross-section (wider bottom = ingot) [REF#UI-00022]
        shape.moveTo(-2.9, -0.95); shape.lineTo(2.9, -0.95); shape.lineTo(2.55, 0.95); shape.lineTo(-2.55, 0.95); shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 2, steps: 1 });
        geo.center();
        const scratch = goldScratchTex(); const engrave = engraveTex(); this._tex.push(scratch, engrave);
        const gold = new THREE.MeshPhysicalMaterial({
            color: 0xffc94d, metalness: 1.0, roughness: 0.28, roughnessMap: scratch,
            clearcoat: 0.7, clearcoatRoughness: 0.28, reflectivity: 0.9, envMapIntensity: 1.6,
            emissive: 0x3a2606, emissiveIntensity: 0.3,
        });
        this.bar = new THREE.Mesh(geo, gold); this.bar.castShadow = true; this.bar.receiveShadow = true; this.root.add(this.bar);
        // engraved face plate (subtle, above the reservoir centre-line so text never covers the fluid) [REF#UI-00023]
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35),
            new THREE.MeshBasicMaterial({ map: engrave, transparent: true, opacity: 0.5, depthWrite: false }));
        plate.position.set(0, 0.72, 0.62); this.root.add(plate);
        // darker recessed channel the reservoir sits in (darker gold, not black — it reads as machined recess) [REF#UI-00024]
        const chan = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.82, 0.5),
            new THREE.MeshPhysicalMaterial({ color: 0x8a6420, metalness: 1, roughness: 0.5, envMapIntensity: 1.2 }));
        chan.position.set(0, -0.1, 0.34); chan.receiveShadow = true; this.root.add(chan);
        // HIDE THE YELLOW HOUSING (Mark 2026-07-24: "all i asked was to remove this yellow bg"). [REF#UI-00025]
        // The gold ingot slab, its engraved plate, and the recessed channel ARE the yellow background —
        // just the green reservoir stays. Kept in the graph (still disposed) but not rendered.
        // Bring the gold back: window._goldHousing=true (default off).
        if (window._goldHousing !== true) { this.bar.visible = false; plate.visible = false; chan.visible = false; }
    }

    // ── HORIZONTAL RESERVOIR — clear glass cylinder, BLUNT caps, gold end-rings, + the green fluid inside ── [REF#UI-00026]
    _buildReservoir() {
        const R = 0.52, L = 4.7;
        // CLEAR glass as a THIN ALPHA SHELL — NOT a transmission material. A transmission shell samples the [REF#UI-00027]
        // scene and is ACES-tonemapped, which washes the bright fluid seen through it to pale yellow-white.
        // A faint transparent shell (opacity ~0.14) with a clearcoat glint lets the vivid fluid read DIRECTLY
        // through its alpha, while still giving the top-of-tube glass highlight. depthWrite off so it never
        // occludes the fluid. Rendered LAST (high renderOrder) as a thin skin over the bright column.
        const glass = new THREE.MeshPhysicalMaterial({
            color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 0,
            ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.8,
            transparent: true, opacity: 0.14, depthWrite: false,
        });
        const tube = new THREE.Mesh(new THREE.BoxGeometry(1.04, L, 0.66), glass);   // BLOCK shell — was a rounded cylinder (Mark 2026-07-24 "a block, not a condom") [REF#UI-00028]
        tube.rotation.z = Math.PI / 2; tube.position.set(0, -0.1, 0.72); tube.renderOrder = 10; this.root.add(tube);
        // BLUNT sealed caps — HIDDEN now: the rounded end-discs were half the "condom" read. Kept in the graph so dispose() still tears them down. [REF#UI-00029]
        const capMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.2, depthWrite: false });
        for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.08, 40), capMat); cap.rotation.z = Math.PI / 2; cap.position.set(s * (L / 2), -0.1, 0.72); cap.renderOrder = 6; cap.visible = false; this.root.add(cap); }
        // dark-gold collar rings — HIDDEN: round AND gold, so both the "block" shape and the no-yellow ask kill them [REF#UI-00030]
        const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xb8862c, metalness: 1, roughness: 0.3, clearcoat: 0.5 });
        for (const s of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.09, 12, 32), ringMat); ring.position.set(s * (L / 2 - 0.12), -0.1, 0.72); ring.rotation.y = Math.PI / 2; ring.visible = false; this.root.add(ring); }

        // FLUID — nuclear green, refractive, scales in X with health; anchored to the LEFT cap so it drains rightward [REF#UI-00031]
        this._resL = L; this._resR = R; this._resX0 = -L / 2 + 0.05;
        // SOLID luminous toxic-green — must read from a distance (spec). The KEY to keeping it TRUE nuclear [REF#UI-00032]
        // green: toneMapped:false, so ACES does NOT desaturate #75FF39 toward yellow-white. It renders at its
        // exact sRGB value while the surrounding gold keeps its ACES filmic look. A modest emissive gives the
        // self-lit glow at low fill; the scene key-light still rakes a bright sheen across the top for volume.
        const fluidMat = new THREE.MeshStandardMaterial({
            color: NUCLEAR, metalness: 0, roughness: 0.28,
            emissive: NUCLEAR, emissiveIntensity: 0.5, toneMapped: false, transparent: false,
        });
        // BLOCK fill: a Box whose LENGTH is local-Y so the existing _applyHealth scale.set(1, filledL, 1) + z-rotation [REF#UI-00033]
        // still map it to a left-anchored horizontal bar — NO fill-logic change, just a square cross-section (no curve).
        this.fluid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.5), fluidMat);
        this.fluid.rotation.z = Math.PI / 2; this.fluid.position.y = -0.1; this.fluid.position.z = 0.72; this.fluid.renderOrder = 4; this.root.add(this.fluid);
        // subtle inner GREEN glow-core (block, thinner) for depth [REF#UI-00034]
        this.core = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1, 0.32),
            new THREE.MeshBasicMaterial({ color: 0x6fd83e, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));   // deep-green glow-core (was 0xaaff70) — matches the deeper NUCLEAR body [REF#UI-00035]
        this.core.rotation.z = Math.PI / 2; this.core.position.y = -0.1; this.core.position.z = 0.72; this.core.renderOrder = 5; this.root.add(this.core);
        // FLAT leading face (was a rounded dome — the "condom tip"): a thin box flush with the fluid front; _applyHealth still tracks its X [REF#UI-00036]
        this.meniscus = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), fluidMat);
        this.meniscus.rotation.z = -Math.PI / 2; this.meniscus.position.y = -0.1; this.meniscus.position.z = 0.72; this.meniscus.renderOrder = 5; this.root.add(this.meniscus);
        // faint green-tinted EMPTY chamber (the unfilled part is never red) — block backing [REF#UI-00037]
        const empty = new THREE.Mesh(new THREE.BoxGeometry(0.86, L - 0.12, 0.46),
            new THREE.MeshBasicMaterial({ color: 0x2f6b1e, transparent: true, opacity: 0.12, depthWrite: false }));
        empty.rotation.z = Math.PI / 2; empty.position.set(0, -0.1, 0.72); empty.renderOrder = 3; this.root.add(empty);
    }

    _buildBubbles() {
        this.bubbles = [];
        const N = this._reduceMotion ? 8 : 24;                  // 20–30 spec; trimmed under reduced-motion [REF#UI-00038]
        const mat = new THREE.MeshBasicMaterial({ color: 0xe8ffd8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
        for (let i = 0; i < N; i++) {
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 8, 6), mat);
            b.userData = { phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.6, xr: Math.random(), yr: (Math.random() - 0.5) * 0.7 };
            b.position.z = 0.72; this.root.add(b); this.bubbles.push(b);
        }
    }

    _buildGaugeAndSpectrum() {
        const gaugeT = gaugeTex(); this._tex.push(gaugeT);
        // gauge marks IN FRONT of the glass, transparent background [REF#UI-00039]
        this.gauge = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.25),
            new THREE.MeshBasicMaterial({ map: gaugeT, transparent: true, depthWrite: false, depthTest: false }));
        this.gauge.position.set(0, -0.1, 1.35); this.gauge.renderOrder = 20; this.root.add(this.gauge);
        // ── BLUE XP BAR below the reservoir (Mark 2026-07-24: "the bottom yellow bar? make it blue experience bar"). [REF#UI-00040]
        //    REPLACES the red→green pH spectrum band. A dark track + a bright-blue fill anchored LEFT that grows
        //    rightward with XP fraction (same left-anchor math as the health fluid). Driven via setXP().
        this._xpW = 4.6; this._xpX0 = -this._xpW / 2;
        this.xpTrack = new THREE.Mesh(new THREE.PlaneGeometry(this._xpW, 0.22),
            new THREE.MeshBasicMaterial({ color: 0x0a1730, transparent: true, opacity: 0.55, depthWrite: false }));
        this.xpTrack.position.set(0, -0.92, 0.9); this.xpTrack.renderOrder = 12; this.root.add(this.xpTrack);
        this.xpFill = new THREE.Mesh(new THREE.PlaneGeometry(this._xpW, 0.22),
            new THREE.MeshBasicMaterial({ color: 0x2f8bff, transparent: true, depthWrite: false, toneMapped: false }));
        this.xpFill.position.set(this._xpX0, -0.92, 0.93); this.xpFill.renderOrder = 13; this.root.add(this.xpFill);
        this._applyXP(this.xp);
    }

    _buildLED() {
        this.led = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0x34c759 }));
        this.led.position.set(2.45, 0.72, 0.66); this.root.add(this.led);
    }

    // ── health application: geometry scale + colours that DON'T touch the fluid ────────────────────────── [REF#UI-00041]
    _applyHealth(pct, instant) {
        pct = clamp(pct, 0, 100); const frac = pct / 100;
        const filledL = Math.max(0.02, frac * (this._resL - 0.15));
        this.fluid.scale.set(1, filledL, 1);                    // cylinder axis is local Y (rotated to X) [REF#UI-00042]
        this.fluid.position.x = this._resX0 + filledL / 2;
        this.core.scale.set(1, Math.max(0.02, filledL - 0.05), 1); this.core.position.x = this.fluid.position.x;
        this.meniscus.position.x = this._resX0 + filledL;       // leading dome tracks the fluid front [REF#UI-00043]
        this.meniscus.visible = frac > 0.02;
        const st = STATE(pct);
        this.led.material.color.setHex(this.autoColor ? st.led : 0x34c759);
        this._greenBounce.intensity = 0.5 + frac * 0.7;         // fuller reservoir glows a touch more [REF#UI-00044]
        if (this.onState) { try { this.onState(Math.round(pct), st.key); } catch (_) {} }
    }

    // ── PUBLIC API ────────────────────────────────────────────────────────────────────────────────────── [REF#UI-00045]
    setHealth(v, opts = {}) {
        this.target = clamp(v, 0, 100);
        if (opts.animate === false || this._reduceMotion) { this.health = this.target; this._applyHealth(this.health, true); this._wake(); }
        else this._wake();                                      // the RAF lerps health → target, then freezes [REF#UI-00046]
    }
    damage(n) { this.setHealth(this.target - Math.abs(n)); }
    heal(n) { this.setHealth(this.target + Math.abs(n)); }
    // BLUE XP BAR (Mark 2026-07-24) — 0..100 percent of the way to the next level. Instant (no lerp); wakes the RAF to paint. [REF#UI-00047]
    setXP(v) { this.xp = clamp(v, 0, 100); this._applyXP(this.xp); this._wake(); }
    _applyXP(pct) {
        const frac = clamp(pct, 0, 100) / 100;
        this.xpFill.scale.x = Math.max(0.0001, frac);            // left-anchored grow, same math as the health fluid [REF#UI-00048]
        this.xpFill.position.x = this._xpX0 + (this._xpW * frac) / 2;
    }
    setAutoColor(on) { this.autoColor = !!on; this._applyHealth(this.health, true); this._wake(); }

    // Frame the camera so the WHOLE gold bar fits at ANY canvas aspect — a HUD chip must not crop the wide bar. [REF#UI-00049]
    // A narrow sidebar chip can't carry the cinematic 3/4 perspective — it turns the gold ingot into a tilted
    // little tray (Mark: "sidebar health bar is ugly"). When COMPACT, render HEAD-ON with a telephoto FOV
    // (near-orthographic — no perspective tilt) and frame tight so the bar fills the slot. The large showcase
    // keeps the richer angled look.
    _frame(w, h) {
        const aspect = w / h; this.camera.aspect = aspect;
        const compact = Math.max(w, h) <= 260; this._compact = compact;
        this.camera.fov = compact ? 14 : 28;
        const camY = compact ? 0.0 : 0.35, lookY = compact ? -0.08 : -0.05, margin = compact ? 1.03 : 1.12;
        const fov = this.camera.fov * Math.PI / 180;
        const distH = (this._contentH * 0.5) / Math.tan(fov / 2);
        const distW = (this._contentW * 0.5) / (Math.tan(fov / 2) * aspect);
        this.camera.position.set(0, camY, Math.max(distH, distW) * margin);
        this.camera.lookAt(0, lookY, 0);
        this.camera.updateProjectionMatrix();
    }

    resize() {
        if (this._disposed) return;
        const w = this.canvas.clientWidth || 240, h = this.canvas.clientHeight || 96;
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.setSize(w, h, false); this._frame(w, h); this._wake();
    }

    // ── IDLE-THROTTLED RENDER LOOP — the FPS-safe heart of it ──────────────────────────────────────────── [REF#UI-00050]
    _wake() {                                                   // start the loop if it's asleep [REF#UI-00051]
        if (this._disposed || this._running) return;
        this._running = true; this._last = performance.now();
        const tick = (now) => {
            if (this._disposed) return;
            const compassionStatic = window._compassionRender?.staticVisuals === true;
            if (compassionStatic) { this.health = this.target; this._applyHealth(this.health); }
            const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
            let busy = false;

            if (Math.abs(this.health - this.target) > 0.05) {   // animate health toward target [REF#UI-00052]
                this.health = lerp(this.health, this.target, 1 - Math.pow(0.001, dt));
                if (Math.abs(this.health - this.target) <= 0.05) this.health = this.target;
                this._applyHealth(this.health); busy = true;
            }
            if (!compassionStatic && !this._reduceMotion) {     // bubbles drift [REF#UI-00053]
                const t = now * 0.001; const filledL = Math.max(0.02, (this.health / 100) * (this._resL - 0.15));
                for (const b of this.bubbles) {
                    const u = b.userData; u.phase += u.speed * dt;
                    b.position.x = this._resX0 + u.xr * filledL;   // ride inside the current fluid column [REF#UI-00054]
                    b.position.y = -0.1 + Math.sin(t * u.speed + u.phase) * 0.22 + u.yr * 0.15;
                    b.material.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.5 + u.phase));
                }
                if (this._hover) busy = true;                   // keep animating bubbles/parallax while hovered [REF#UI-00055]
                else if (this._bubbleSettle === undefined) this._bubbleSettle = now + 900;   // let bubbles breathe ~0.9s after a wake, then sleep [REF#UI-00056]
                if (this._bubbleSettle !== undefined && now < this._bubbleSettle) busy = true;
                else this._bubbleSettle = undefined;
            }
            // restrained pointer parallax — disabled on the compact sidebar chip (a tilt just reads as broken there) [REF#UI-00057]
            const par = this._compact ? 0 : 1;
            const tx = (this._px || 0) * 0.12 * par, ty = -(this._py || 0) * 0.08 * par;
            this.root.rotation.y += (tx - this.root.rotation.y) * 0.1;
            this.root.rotation.x += (ty - this.root.rotation.x) * 0.1;
            if (Math.abs(tx - this.root.rotation.y) > 0.002 || Math.abs(ty - this.root.rotation.x) > 0.002) busy = true;

            this.renderer.render(this.scene, this.camera);
            if (busy && !compassionStatic) this._raf = requestAnimationFrame(tick);
            else { this._running = false; this._raf = 0; }       // FREEZE — zero cost until the next wake [REF#UI-00058]
        };
        this._raf = requestAnimationFrame(tick);
    }

    dispose() {
        this._disposed = true;
        if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; this._running = false;
        try { this.canvas.removeEventListener('pointermove', this._onMove); this.canvas.removeEventListener('pointerleave', this._onLeave); } catch (_) {}
        if (this._ro) { try { this._ro.disconnect(); } catch (_) {} }
        this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => x && x.dispose()); } });
        this._tex.forEach(t => { try { t.dispose(); } catch (_) {} });
        if (this._envRT) { try { this._envRT.dispose(); } catch (_) {} }
        try { this.renderer.dispose(); } catch (_) {}
    }
}
