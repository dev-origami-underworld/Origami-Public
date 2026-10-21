// ═══════════════════════════════════════════════════════════════════════════════════════════════════════ [REF#UI-01301]
//  SYRINGE / CARTRIDGE HEALTH BAR — live HUD module (Mark 2026-07-20: "our health bar really sucks, do what
//  you can"). r160 port of the ChatGPT cutoff-syringe design, TRIMMED for an always-on HUD chip.
//  Runs in the PANELS iframe (Panels = three r160; measured — the ENGINE is r128, wrong frame for the HUD).
//  Standalone proof + full-fat demo: TOOLS/health-syringe-r160.html.
//  HUD TRIM vs the demo (all to keep an always-on element cheap — FPS doctrine):
//    · NO cast shadows, NO floor, NO shadow-casting spotlight (a HUD chip does not need them)
//    · NO base/inset staging plates (demo scaffolding, not the object)
//    · bubbles 30→10, cylinder segments 96→40, DPR capped at 1.5
//    · IDLE THROTTLE: renders only while health is animating or the pointer is over it, then freezes
//  Kept: nuclear-green transmission fluid, scratched plastic shell, collar rings, blunt ends, gauge ticks,
//  pH-style spectrum band + marker, green LED, meniscus. Public API: setHealth/damage/heal + STABLE/WARNING/
//  CRITICAL text state (WCAG: colour is never the only signal — the numeric % lives in the DOM label).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function scratchTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, len = 8 + Math.random() * 24, a = Math.random() * Math.PI * 2;
    g.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.35); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
}
function gaugeTex() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 384;
  const g = c.getContext('2d'); g.lineCap = 'round'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
  const sx = 140, usable = c.width - 280, cy = 170;
  for (let i = 0; i <= 10; i++) {
    const x = sx + usable * i / 10, h = i % 5 === 0 ? 148 : 96;
    g.strokeStyle = 'rgba(0,0,0,0.70)'; g.lineWidth = i % 5 === 0 ? 16 : 12; g.beginPath(); g.moveTo(x, cy - h / 2); g.lineTo(x, cy + h / 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.98)'; g.lineWidth = i % 5 === 0 ? 10 : 7; g.beginPath(); g.moveTo(x, cy - h / 2); g.lineTo(x, cy + h / 2); g.stroke();
    if (i < 10) { g.font = '800 56px monospace'; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.72)'; g.strokeText(String(i * 10), x + 14, 70); g.fillStyle = 'rgba(255,255,255,0.98)'; g.fillText(String(i * 10), x + 14, 70); }
  }
  g.font = '900 52px monospace'; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.72)'; g.strokeText('生命', 84, 324); g.fillStyle = 'rgba(180,255,190,0.98)'; g.fillText('生命', 84, 324);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function spectrumTex() {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 120;
  const g = c.getContext('2d'); const x = 30, y = 26, w = c.width - 60, h = 34, r = 18;
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10; g.shadowOffsetY = 2;
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); g.stroke();
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#ff3b30'); grad.addColorStop(0.3, '#ff8f1f'); grad.addColorStop(0.55, '#ffe25a'); grad.addColorStop(1, '#5dff43');
  g.fillStyle = grad; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SyringeHealthBar {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.health = opts.health ?? 100; this.target = this.health;
    this.pointer = new THREE.Vector2(); this.pointerTarget = new THREE.Vector2();
    this.clock = new THREE.Clock(); this.bubbles = []; this._settled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   // crisper — a 97px slot needs the real DPR (Mark: "ugly") [REF#UI-01302]
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.2;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100); this.camera.position.set(0, 0.15, 10.4);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this._build(); this._bind(); this.resize(); this._apply(this.health); this._loop();
  }
  _build() {
    const scr = scratchTex(), gau = gaugeTex(), spe = spectrumTex();
    const SEG = 40;
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fb, roughness: 0.08, metalness: 0, transmission: 0.92, thickness: 0.38, ior: 1.46, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3, bumpMap: scr, bumpScale: 0.014, side: THREE.DoubleSide, depthWrite: false });
    const shellGeo = new THREE.CylinderGeometry(0.70, 0.70, 6.35, SEG, 1, false); shellGeo.rotateZ(Math.PI / 2);
    this.shell = new THREE.Mesh(shellGeo, shellMat); this.shell.renderOrder = 6; this.root.add(this.shell);

    const sleeveGeo = new THREE.CylinderGeometry(0.60, 0.60, 5.96, SEG, 1, true); sleeveGeo.rotateZ(Math.PI / 2);
    this.root.add(new THREE.Mesh(sleeveGeo, new THREE.MeshPhysicalMaterial({ color: 0x3d6413, roughness: 0.22, transmission: 0.42, thickness: 0.11, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide })));

    this.lStart = -2.88; this.lMax = 5.76;
    const emptyGeo = new THREE.CylinderGeometry(0.525, 0.525, this.lMax, SEG, 1, false); emptyGeo.rotateZ(Math.PI / 2);
    const empty = new THREE.Mesh(emptyGeo, new THREE.MeshPhysicalMaterial({ color: 0x97ff2d, roughness: 0.14, transmission: 0.18, thickness: 0.7, ior: 1.333, attenuationColor: new THREE.Color(0x365707), attenuationDistance: 0.9, transparent: true, opacity: 0.14, clearcoat: 0.7, envMapIntensity: 0.8, depthWrite: false }));
    empty.position.x = this.lStart + this.lMax / 2; empty.renderOrder = 1; this.root.add(empty);

    const liqGeo = new THREE.CylinderGeometry(0.55, 0.55, 1, SEG, 1, false); liqGeo.rotateZ(Math.PI / 2);
    this.liqMat = new THREE.MeshPhysicalMaterial({ color: 0x00c853, roughness: 0.11, transmission: 0.28, thickness: 0.92, ior: 1.333, attenuationColor: new THREE.Color(0x0a5a28), attenuationDistance: 1.1, transparent: true, opacity: 0.98, clearcoat: 0.95, envMapIntensity: 1.12, depthWrite: true });
    this.liq = new THREE.Mesh(liqGeo, this.liqMat); this.liq.renderOrder = 2; this.root.add(this.liq);

    const coreGeo = new THREE.CylinderGeometry(0.44, 0.44, 1, 32, 1, false); coreGeo.rotateZ(Math.PI / 2);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x72ff9d, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
    this.core = new THREE.Mesh(coreGeo, this.coreMat); this.core.renderOrder = 3; this.root.add(this.core);

    this.menMat = this.liqMat.clone(); this.menMat.roughness = 0.04;
    this.meniscus = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 20), this.menMat); this.meniscus.scale.set(0.26, 1, 1); this.meniscus.renderOrder = 3; this.root.add(this.meniscus);
    this.rearCap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), this.liqMat.clone()); this.rearCap.scale.set(0.18, 1, 1); this.rearCap.position.x = this.lStart; this.rearCap.renderOrder = 2; this.root.add(this.rearCap);

    const bubMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transmission: 1, thickness: 0.06, ior: 1.05, transparent: true, opacity: 0.62, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bubMat);
      const s = 0.02 + Math.random() * 0.05, ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * 0.42;
      bub.scale.setScalar(s);
      bub.userData = { t: 0.05 + Math.random() * 0.9, y: Math.cos(ang) * rad, z: Math.sin(ang) * rad, ph: Math.random() * Math.PI * 2, sp: 0.55 + Math.random() };
      bub.position.set(this.lStart + bub.userData.t * this.lMax, bub.userData.y, bub.userData.z); bub.renderOrder = 4; this.bubbles.push(bub); this.root.add(bub);
    }

    const rubber = new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 0.92, metalness: 0.02 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x888f98, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.5 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.33, metalness: 0.48 });
    const clearCap = shellMat.clone(); clearCap.opacity = 0.5; clearCap.thickness = 0.25;
    const stopGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.34, 40); stopGeo.rotateZ(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.68, 0.075, 14, 60); ringGeo.rotateY(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry(0.63, 0.63, 0.42, 40); capGeo.rotateZ(Math.PI / 2);
    const plugGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 32); plugGeo.rotateZ(Math.PI / 2);
    const add = (geo, mat, x) => { const m = new THREE.Mesh(geo, mat); m.position.x = x; this.root.add(m); return m; };
    add(stopGeo, rubber, -3.12); add(ringGeo, metal, -3.08); const lc = add(capGeo, clearCap, -3.42); lc.renderOrder = 6; add(plugGeo, darkMetal, -3.72);
    add(ringGeo.clone(), metal, 3.08); add(stopGeo.clone(), rubber, 3.12); const rc = add(capGeo.clone(), clearCap.clone(), 3.42); rc.renderOrder = 6; add(plugGeo.clone(), darkMetal.clone(), 3.72);
    const guardGeo = new THREE.TorusGeometry(0.79, 0.072, 14, 60); guardGeo.rotateY(Math.PI / 2);
    for (const x of [-2.12, 2.12]) { const gu = add(guardGeo, darkMetal.clone(), x); gu.position.set(x, -0.035, -0.015); }

    this.gauge = new THREE.Mesh(new THREE.PlaneGeometry(5.92, 1.04), new THREE.MeshBasicMaterial({ map: gau, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.gauge.position.set(-0.02, -0.045, 0.68); this.gauge.renderOrder = 9; this.root.add(this.gauge);

    this.specW = 4.42; this.specX = 0.10;
    this.spectrum = new THREE.Mesh(new THREE.PlaneGeometry(this.specW, 0.20), new THREE.MeshBasicMaterial({ map: spe, transparent: true, opacity: 0.98, depthWrite: false, side: THREE.DoubleSide }));
    this.spectrum.position.set(this.specX, 0.10, 0.705); this.spectrum.renderOrder = 9; this.root.add(this.spectrum);
    this.markMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.18 });
    this.marker = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.055), this.markMat); this.marker.position.set(this.specX, 0.10, 0.76); this.marker.renderOrder = 10; this.root.add(this.marker);

    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x66ff9f, emissive: 0x18532d, emissiveIntensity: 2.4, roughness: 0.22 });
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 10), this.ledMat); this.led.position.set(3.58, -0.80, -0.34); this.root.add(this.led);

    this.scene.add(new THREE.HemisphereLight(0xe1efff, 0x081218, 1.15));
    const spot = new THREE.SpotLight(0xfff3df, 60, 34, Math.PI / 5.2, 0.48, 1.35); spot.position.set(-3.5, 6.4, 6.9); spot.target.position.set(0, 0, 0); this.scene.add(spot, spot.target);
    const coolFill = new THREE.PointLight(0x9ecfff, 12, 12, 2); coolFill.position.set(4.4, 2.7, -2.6); this.scene.add(coolFill);
    this.bounce = new THREE.PointLight(0x00c853, 7, 8, 2); this.bounce.position.set(0, -0.42, 2.3); this.scene.add(this.bounce);
  }
  _bind() {
    this._onResize = () => this.resize();
    this._onMove = (e) => { const r = this.canvas.getBoundingClientRect(); this.pointerTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)); };
    this._onLeave = () => this.pointerTarget.set(0, 0);
    window.addEventListener('resize', this._onResize, { passive: true });
    this.canvas.addEventListener('pointermove', this._onMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this._onLeave);
    if ('ResizeObserver' in window) { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.canvas.parentElement || this.canvas); }
  }
  _style(v) { return v <= 24 ? { label: 'CRITICAL', c: 0xff5252 } : v <= 48 ? { label: 'WARNING', c: 0xffb300 } : { label: 'STABLE', c: 0x00c853 }; }
  _apply(v) {
    const hp = clamp(v, 0, 100), t = hp / 100, len = Math.max(0.001, this.lMax * t), front = this.lStart + len;
    const st = this._style(hp), col = new THREE.Color(st.c);
    const fluid = new THREE.Color(0x75ff39), att = new THREE.Color(0x315a08), glow = new THREE.Color(0xc5ff72);
    this.liq.scale.x = len; this.liq.position.x = this.lStart + len / 2; this.core.scale.x = len; this.core.position.x = this.lStart + len / 2;
    this.meniscus.position.x = front;
    const vis = t > 0.002; this.liq.visible = this.core.visible = this.meniscus.visible = this.rearCap.visible = vis;
    this.liqMat.color.copy(fluid); this.liqMat.attenuationColor.copy(att); this.menMat.color.copy(fluid); this.menMat.attenuationColor.copy(att);
    this.rearCap.material.color.copy(fluid); this.rearCap.material.attenuationColor.copy(att); this.coreMat.color.copy(glow);
    this.ledMat.color.copy(col); this.ledMat.emissive.copy(col); this.bounce.color.copy(fluid); this.bounce.intensity = 3.8 + t * 7;
    const b0 = this.specX - this.specW / 2 + 0.03, b1 = this.specX + this.specW / 2 - 0.03;
    this.marker.position.x = b0 + (b1 - b0) * t; this.markMat.color.copy(col); this.markMat.emissive.copy(col);
    for (const b of this.bubbles) b.visible = b.userData.t <= t && t > 0.03;
    if (this.onState) this.onState(Math.round(hp), st.label, st.c);
  }
  setHealth(v) { this.target = clamp(Number(v) || 0, 0, 100); this._settled = false; return this.target; }
  damage(v = 10) { return this.setHealth(this.target - Math.abs(Number(v) || 0)); }
  heal(v = 10) { return this.setHealth(this.target + Math.abs(Number(v) || 0)); }
  resize() {
    const r = this.canvas.getBoundingClientRect(); const w = Math.max(2, Math.floor(r.width)), h = Math.max(2, Math.floor(r.height));
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this._fit(); this.camera.updateProjectionMatrix();
    this._settled = false;   // force a redraw at the new size [REF#UI-01303]
  }
  // FIT THE CARTRIDGE TO THE CANVAS (Mark 2026-07-20 "fucked up square"). The sidebar hands us an arbitrary, [REF#UI-01304]
  // often near-square box; a fixed camera then squished the horizontal cartridge. Instead, back the camera
  // off until the whole ~7-unit-wide × ~1.6-tall cartridge fits BOTH axes of whatever aspect we get, with a
  // small margin. The syringe now reads correctly at 3:1, 1.5:1 or 1:1 — it just gets smaller, never distorted.
  _fit() {
    // At a ~97px sidebar slot the whole 7-unit cartridge reads as a tiny sliver, so we FRAME THE BARREL, not [REF#UI-01305]
    // the full object — crop the big end-caps out of frame so the fluid level + gauge fill the slot. halfW is
    // the readable barrel half-width, not the full extent; the caps bleed off the sides, which reads fine.
    // window._syringeZoom scales it (smaller = tighter crop). window._syringeFullFrame=true shows the whole
    // cartridge (for a wide placement).
    const full = window._syringeFullFrame === true;
    const halfW = (full ? 3.7 : 2.55) * (typeof window._syringeZoom === 'number' ? window._syringeZoom : 1);
    const halfH = full ? 0.95 : 0.72;
    const vFov = this.camera.fov * Math.PI / 180;
    const distForH = halfH / Math.tan(vFov / 2);
    const distForW = (halfW / this.camera.aspect) / Math.tan(vFov / 2);
    this.camera.position.z = Math.max(distForH, distForW) * 1.06 + 0.5;
  }
  _loop = () => {
    this.frame = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05), el = this.clock.elapsedTime;
    const settling = Math.abs(this.health - this.target) > 0.05;
    const hovering = this.pointerTarget.lengthSq() > 1e-4 || this.pointer.lengthSq() > 1e-4;
    // IDLE THROTTLE: an always-on HUD chip only needs to redraw while something is changing. Once settled, [REF#UI-01306]
    // skip the whole render — no fill, no transmission pass, no rAF cost beyond the empty callback.
    if (this._settled && !settling && !hovering) return;
    this.pointer.lerp(this.pointerTarget, 0.08);
    this.health = lerp(this.health, this.target, 1 - Math.exp(-dt * 8));
    this._apply(this.health);
    this.root.rotation.y = this.pointer.x * 0.16; this.root.rotation.x = this.pointer.y * 0.07;
    this.root.position.y = Math.sin(el * 0.75) * 0.03;
    for (const b of this.bubbles) { if (!b.visible) continue; b.position.y = b.userData.y + Math.sin(el * b.userData.sp + b.userData.ph) * 0.04; b.position.z = b.userData.z + Math.cos(el * b.userData.sp * 0.72 + b.userData.ph) * 0.03; }
    this.renderer.render(this.scene, this.camera);
    this._settled = !settling && !hovering;
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    this.ro?.disconnect();
    this.scene.traverse(o => { o.geometry?.dispose?.(); Array.isArray(o.material) ? o.material.forEach(m => m.dispose?.()) : o.material?.dispose?.(); });
    this.renderer.dispose();
  }
}
