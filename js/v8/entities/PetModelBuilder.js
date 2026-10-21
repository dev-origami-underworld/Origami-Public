// ── PET MODELS — ONE builder for the world AND the playing card (2026-09-15) ──────────────────────────────────────── [REF#EN-00646]
// Mark 2026-09-15: "remove the ring, make them larger and cuter model together here in their playing card" — the SUMMON
// card used to draw its own stacked-sphere puppy and kitten while the world drew the real ones. Now there is ONE set of
// builders: Engine9 (THREE r128, global) and Panels' card-icon scene (THREE r160, module) both call `window.OrigamiPets
// .models()` and get the same kitten, puppy and monkey. THREE is resolved lazily from window.THREE at the first call
// (the BowModelBuilder pattern), and the textures/materials are cached PER THREE INSTANCE AND VARIANT so the two
// documents never share GPU objects. `models({ icon: true })` lifts the black kitten's fur (pure black is a hole at
// 32 px) — nothing else differs. The bodies: lathe profiles with a belly, painted fur (a 512² stroke canvas as the
// map), FUR SHELLS (alpha-noised copies, transparent, no depth write), painted chibi eyes (a sphere flattened to half
// depth, centre AT the face — never a ball on a stalk), cheeks, ω mouths, three-toed paws, pink-lined ears, a bell
// collar (kitten) / tag (puppy), a question-mark tail (kitten), a curl over the back (puppy), a tail held high (Saru).
// r128-safe: no CapsuleGeometry. Zero lights. Design notes: knowledge/design (pets), plans/PETS_PLAN_2026-09-14.md.
// Rig contract read by Engine9's `_petAnimate`: userData.pet = { body, head, legs[4], tail, tongue?, sitDrop, bodyY,
// headY, legLen }; part names 'body' / 'head' / 'leg0..3' / 'tail' / 'ear' / 'fur'.
const _cache = new WeakMap();
function _THREE(){ const T = (typeof window !== 'undefined' && window.THREE) || null; if (!T) throw new Error('[PetModelBuilder] window.THREE not yet defined — call after boot'); return T; }
function _srgb(t){ try { if (window.THREE && 'colorSpace' in t && window.THREE.SRGBColorSpace) t.colorSpace = window.THREE.SRGBColorSpace; } catch(_){} }
function _make(THREE, ICON){
// Fur is a painted canvas (map + bumpMap), eyes are painted canvases on spheres (iris, pupil, catchlight), bodies are lathe [REF#EN-00647]
// profiles instead of stacked spheres, ears/paws/tails have real shape. r128-safe (no CapsuleGeometry). Zero lights added.
function _petFurTex(base, dark, light, density){
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
    c.fillStyle = base; c.fillRect(0, 0, 512, 512);
    const n = density || 9000; c.lineWidth = 1; c.lineCap = 'round';
    for (let i = 0; i < n; i++){
        const x = Math.random() * 512, y = Math.random() * 512, len = 6 + Math.random() * 16, a = (Math.random() - 0.5) * 0.9;
        c.strokeStyle = (Math.random() < 0.5) ? dark : light; c.globalAlpha = 0.18 + Math.random() * 0.25;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len); c.stroke();
    }
    c.globalAlpha = 1;
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4; _srgb(t); return t;
}
function _petEyeTex(o){   // o: { sclera, iris, irisEdge, pupil:'round'|'slit', pupilR, irisR } [REF#EN-00648]
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = o.sclera; c.fillRect(0, 0, 128, 128);
    const cx = 64, cy = 64, ir = o.irisR || 38;
    const g = c.createRadialGradient(cx, cy, ir * 0.2, cx, cy, ir); g.addColorStop(0, o.iris); g.addColorStop(0.75, o.iris); g.addColorStop(1, o.irisEdge);
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, ir, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#050505'; c.beginPath();
    if (o.pupil === 'slit') c.ellipse(cx, cy, (o.pupilR || 9) * 0.45, (o.pupilR || 9) * 2.1, 0, 0, Math.PI * 2); else c.arc(cx, cy, o.pupilR || 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.97)'; c.beginPath(); c.arc(cx - ir * 0.34, cy - ir * 0.36, ir * 0.26, 0, Math.PI * 2); c.fill();   // the big chibi catchlight [REF#EN-00649]
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(cx + ir * 0.32, cy + ir * 0.38, ir * 0.12, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, ir - 1.5, 0, Math.PI * 2); c.stroke();   // limbal ring [REF#EN-00650]
    const t = new THREE.CanvasTexture(cv); _srgb(t); return t;
}
function _petShellTex(){   // the fur-shell alpha: sparse strands, seen end-on through the layers [REF#EN-00651]
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++){ const x = Math.random() * 256, y = Math.random() * 256, r = 0.6 + Math.random() * 1.1; c.fillStyle = 'rgba(255,255,255,' + (0.5 + Math.random() * 0.5) + ')'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}
const _petTex = {
    black: _petFurTex('#121216', '#040406', '#2c2c36', 9000),
    white: _petFurTex('#efece4', '#c9c3b4', '#ffffff', 11000),
    brown: _petFurTex('#6b4a2e', '#3a2414', '#a5814f', 10000),
    catEye: _petEyeTex({ sclera: '#e8f7e4', iris: '#7ee884', irisEdge: '#1f6a2c', pupil: 'slit', pupilR: 12, irisR: 54 }),
    dogEye: _petEyeTex({ sclera: '#f6f1ea', iris: '#5e3a18', irisEdge: '#1c0f06', pupil: 'round', pupilR: 30, irisR: 54 }),
};
const _petShellTexture = _petShellTex();
// FUR SHELLS: n copies of a mesh, each a little larger and thinner, alpha-noised — the classic real-time fur. Transparent + no [REF#EN-00652]
// depth write (no alphaTest → no new shader define), drawn in order after the skin. `k` = how far the coat stands off (per shell).
function _petFurShells(mesh, mat, n, k, tint){
    const g = new THREE.Group(); g.name = 'fur';
    for (let i = 1; i <= n; i++){
        const m = new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ color: tint || 0xffffff, map: mat.map, alphaMap: _petShellTexture, transparent: true, depthWrite: false, opacity: 0.75 * Math.pow(1 - i / (n + 1), 1.8), roughness: 1, emissive: mat.emissive, emissiveIntensity: mat.emissiveIntensity * 0.35 }));
        m.position.copy(mesh.position); m.rotation.copy(mesh.rotation); m.scale.copy(mesh.scale).multiplyScalar(1 + i * k); m.renderOrder = 10 + i; g.add(m);
    }
    return g;
}
const _petMats = {
    black:     new THREE.MeshStandardMaterial({ color: ICON ? 0xd0d0e0 : 0xffffff, map: _petTex.black, roughness: 0.95, metalness: 0.0, emissive: ICON ? 0x2a2a3a : 0x101016, emissiveIntensity: ICON ? 1.2 : 0.5 }),
    blackSoft: new THREE.MeshStandardMaterial({ color: ICON ? 0x4a4a58 : 0x2a2a32, roughness: 0.95, emissive: ICON ? 0x22222c : 0x0e0e14, emissiveIntensity: ICON ? 0.9 : 0.4 }),
    pinkNose:  new THREE.MeshStandardMaterial({ color: 0xe39aa8, roughness: 0.45, emissive: 0x3a1a20, emissiveIntensity: 0.3 }),
    pinkEar:   new THREE.MeshStandardMaterial({ color: 0xd88c9c, roughness: 0.8, emissive: 0x30141a, emissiveIntensity: 0.3 }),
    white:     new THREE.MeshStandardMaterial({ color: 0xffffff, map: _petTex.white, roughness: 0.95, metalness: 0.0, emissive: 0x2a2822, emissiveIntensity: 0.28 }),
    whiteSoft: new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.95, emissive: 0x2a2822, emissiveIntensity: 0.22 }),
    brown:     new THREE.MeshStandardMaterial({ color: 0xffffff, map: _petTex.brown, roughness: 0.95, metalness: 0.0, emissive: 0x2a1c10, emissiveIntensity: 0.3 }),
    tan:       new THREE.MeshStandardMaterial({ color: 0xe8c9a4, roughness: 0.8, emissive: 0x3a2a18, emissiveIntensity: 0.25 }),
    nose:      new THREE.MeshStandardMaterial({ color: 0x151010, roughness: 0.18, metalness: 0.1, emissive: 0x050505, emissiveIntensity: 0.2 }),
    rim:       new THREE.MeshStandardMaterial({ color: 0x0d0a0a, roughness: 0.7 }),
    mouth:     new THREE.MeshStandardMaterial({ color: 0x2a1418, roughness: 0.6 }),
    tongue:    new THREE.MeshStandardMaterial({ color: 0xe8788a, roughness: 0.45, emissive: 0x401018, emissiveIntensity: 0.3 }),
    collar:    new THREE.MeshStandardMaterial({ color: 0xc8352a, roughness: 0.5, metalness: 0.2, emissive: 0x401008, emissiveIntensity: 0.3 }),
    tag:       new THREE.MeshStandardMaterial({ color: 0xe0b84a, roughness: 0.3, metalness: 0.9 }),
    catEye:    new THREE.MeshStandardMaterial({ map: _petTex.catEye, roughness: 0.15, emissive: 0x224422, emissiveIntensity: 0.35 }),
    dogEye:    new THREE.MeshStandardMaterial({ map: _petTex.dogEye, roughness: 0.15, emissive: 0x201408, emissiveIntensity: 0.3 }),
    whisker:   new THREE.MeshBasicMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0.7 }),
};
function _petSphere(mat, rx, ry, rz, x, y, z, seg){ const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg || 24, seg ? Math.round(seg * 0.7) : 18), mat); m.scale.set(rx, ry, rz); m.position.set(x, y, z); return m; }
// a lathe body along z: pts = [[z, r], …] from rump to chest [REF#EN-00653]
function _petBody(mat, pts, belly){
    const v = pts.map(([z, r]) => new THREE.Vector2(Math.max(0.001, r), z));
    const geo = new THREE.LatheGeometry(v, 28); const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2;   // lathe axis y → z [REF#EN-00654]
    const g = new THREE.Group(); g.add(m);
    if (belly){ const b = _petSphere(mat, belly[0], belly[1], belly[2], 0, belly[3], belly[4]); g.add(b); }
    return g;
}
// CHIBI EYES (Mark 2026-09-15: "puppy has buldging bug eyes"): the eye is a sphere flattened to `_petEyeDepth` (0.5) of its radius [REF#EN-00655]
// along the viewing axis and its centre sits AT the face, so only a shallow cap shows — big, flat, glossy; never a ball on a stalk.
// The flattened axis is local x, which the -π/2 yaw turns into world +z (the texture centre faces +z after that same yaw).
function _petEye(mat, r, x, y, z, look, rimMat){ const g = new THREE.Group(); g.position.set(x, y, z); const dp = (typeof window._petEyeDepth === 'number') ? window._petEyeDepth : 0.5;
    const e = _petSphere(mat, r * dp, r, r, 0, 0, 0, 28); e.rotation.y = -Math.PI / 2 + (look || 0); g.add(e);
    if (rimMat){ const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, r * 0.06, 6, 32), rimMat); rim.position.z = r * dp * 0.55; rim.rotation.y = (look || 0); g.add(rim); }   // the lid line, on the face [REF#EN-00656]
    return g; }
function _petLeg(mat, x, z, len, r, pawMat){ const g = new THREE.Group(); g.position.set(x, len, z);   // pivot at the hip [REF#EN-00657]
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 10), mat); s.position.y = -len / 2; g.add(s); g.add(_petFurShells(s, mat, 2, 0.12));
    const paw = _petSphere(pawMat || mat, r * 1.35, r * 0.75, r * 1.5, 0, -len + r * 0.2, r * 0.45); g.add(paw);
    for (const tx of [-0.6, 0, 0.6]) g.add(_petSphere(pawMat || mat, r * 0.45, r * 0.4, r * 0.5, tx * r, -len + r * 0.15, r * 1.6));   // three toes [REF#EN-00658]
    return g; }
function _petTail(mat, r, joints, x, y, z, up, curl){ const g = new THREE.Group(); g.position.set(x, y, z); let node = g;
    for (let i = 0; i < joints; i++){ const seg = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(r * (1 - i * 0.10), r * (1 - (i + 1) * 0.10), 0.1, 9), mat); s.rotation.x = Math.PI / 2; s.position.z = -0.05; seg.add(s);
        const knuckle = _petSphere(mat, r * (1 - (i + 1) * 0.10), r * (1 - (i + 1) * 0.10), r * (1 - (i + 1) * 0.10), 0, 0, -0.1, 10); seg.add(knuckle);
        seg.rotation.x = (i === 0 ? up : 0) + (curl || 0); node.add(seg); seg.position.z = i === 0 ? 0 : -0.1; node = seg; }
    return g; }
function _petMouth(mat, r, x, y, z, arc){ const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.16, 6, 14, arc || Math.PI), mat); m.position.set(x, y, z); m.rotation.z = Math.PI; return m; }   // a little "ω" half [REF#EN-00659]
// ── THE BLACK KITTEN ── [REF#EN-00660]
function _buildCatMesh(){
    const g = new THREE.Group(); const M = _petMats;
    const body = _petBody(M.black, [[-0.27, 0.001], [-0.24, 0.08], [-0.17, 0.125], [-0.06, 0.138], [0.06, 0.135], [0.16, 0.12], [0.24, 0.085], [0.27, 0.001]], [0.13, 0.10, 0.15, -0.035, 0.0]);
    body.position.set(0, 0.30, 0); body.name = 'body'; g.add(body); body.add(_petFurShells(body.children[0], M.black, 5, 0.04)); body.add(_petFurShells(body.children[1], M.black, 4, 0.04));
    g.add(_petSphere(M.black, 0.10, 0.10, 0.10, 0, 0.38, 0.22));   // neck [REF#EN-00661]
    const head = new THREE.Group(); head.position.set(0, 0.46, 0.27); head.name = 'head'; g.add(head);
    const hs = _petSphere(M.black, 0.165, 0.15, 0.15, 0, 0, 0, 32); head.add(hs); head.add(_petFurShells(hs, M.black, 4, 0.02));
    head.add(_petSphere(M.black, 0.07, 0.055, 0.06, -0.085, -0.06, 0.085)); head.add(_petSphere(M.black, 0.07, 0.055, 0.06, 0.085, -0.06, 0.085));   // cheeks [REF#EN-00662]
    head.add(_petSphere(M.blackSoft, 0.05, 0.035, 0.045, 0, -0.065, 0.12));                                                                                // muzzle [REF#EN-00663]
    head.add(_petSphere(M.pinkNose, 0.016, 0.011, 0.011, 0, -0.05, 0.166));
    head.add(_petMouth(M.mouth, 0.013, -0.013, -0.075, 0.158)); head.add(_petMouth(M.mouth, 0.013, 0.013, -0.075, 0.158));
    [[-0.066, 0.18], [0.066, -0.18]].forEach(([x, lk]) => { head.add(_petEye(M.catEye, 0.05, x, -0.01, 0.128, lk, M.rim)); });   // big, low, FLAT kitten eyes on the face [REF#EN-00664]
    [[-0.06, 0.15], [0.06, -0.15]].forEach(([x, lk]) => { for (const k of [-1, 0, 1]){ const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.07, 4), M.whisker); w.position.set(x + k * 0.012, 0.055, 0.115); w.rotation.z = (x < 0 ? 1 : -1) * (0.5 + k * 0.15); w.rotation.x = -0.5; head.add(w); } });   // brow whiskers [REF#EN-00665]
    [[-0.07, 0.3], [0.07, -0.3]].forEach(([x, rz]) => {
        const e = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.125, 3), M.black); e.scale.z = 0.45; e.position.set(x * 1.1, 0.145, -0.02); e.rotation.z = rz; e.rotation.y = Math.PI; head.add(e);
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 3), M.pinkEar); inner.scale.z = 0.35; inner.position.set(x * 1.08, 0.135, 0.002); inner.rotation.z = rz; inner.rotation.y = Math.PI; head.add(inner); });
    for (const sx of [-1, 1]) for (const k of [-1, 0, 1]){ const w = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.16, 4), M.whisker); w.position.set(sx * 0.11, -0.05 + k * 0.012, 0.125); w.rotation.z = Math.PI / 2 + sx * (0.12 - k * 0.14); w.rotation.y = sx * 0.35; head.add(w); }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 8, 24), M.collar); collar.position.set(0, 0.395, 0.215); collar.rotation.x = Math.PI / 2 - 0.3; g.add(collar);
    const bell = _petSphere(M.tag, 0.022, 0.022, 0.022, 0, 0.345, 0.30, 12); g.add(bell);
    const legs = []; [[-0.075, 0.13], [0.075, 0.13], [-0.075, -0.12], [0.075, -0.12]].forEach(([x, z], i) => { const l = _petLeg(M.black, x, z, 0.22, 0.03); l.name = 'leg' + i; g.add(l); legs.push(l); });
    const tail = _petTail(M.black, 0.026, 6, 0, 0.36, -0.26, 1.05, 0.26); tail.name = 'tail'; g.add(tail);
    g.userData.pet = { body, head, legs, tail, sitDrop: 0.10, bodyY: 0.30, headY: 0.46, legLen: 0.22 };
    return g;
}
// ── THE WHITE PUPPY ── [REF#EN-00666]
function _buildDogMesh(){
    const g = new THREE.Group(); const M = _petMats;
    const body = _petBody(M.white, [[-0.26, 0.001], [-0.23, 0.10], [-0.15, 0.15], [-0.04, 0.162], [0.08, 0.158], [0.18, 0.14], [0.25, 0.10], [0.28, 0.001]], [0.155, 0.125, 0.17, -0.045, 0.01]);
    body.position.set(0, 0.33, 0); body.name = 'body'; g.add(body); body.add(_petFurShells(body.children[0], M.white, 6, 0.045)); body.add(_petFurShells(body.children[1], M.white, 4, 0.045));
    const head = new THREE.Group(); head.position.set(0, 0.54, 0.33); head.name = 'head'; g.add(head);
    const hs = _petSphere(M.white, 0.20, 0.185, 0.185, 0, 0, 0, 32); head.add(hs); head.add(_petFurShells(hs, M.white, 4, 0.02));
    head.add(_petSphere(M.white, 0.08, 0.06, 0.07, -0.09, -0.06, 0.09)); head.add(_petSphere(M.white, 0.08, 0.06, 0.07, 0.09, -0.06, 0.09));   // jowls [REF#EN-00667]
    head.add(_petSphere(M.whiteSoft, 0.075, 0.06, 0.075, 0, -0.07, 0.14));   // a short, low puppy snout [REF#EN-00668]
    head.add(_petSphere(M.nose, 0.032, 0.026, 0.028, 0, -0.045, 0.205, 18)); head.add(_petSphere(M.rim, 0.007, 0.006, 0.005, -0.012, -0.05, 0.23, 8)); head.add(_petSphere(M.rim, 0.007, 0.006, 0.005, 0.012, -0.05, 0.23, 8));   // nostrils [REF#EN-00669]
    head.add(_petMouth(M.mouth, 0.016, -0.016, -0.105, 0.2)); head.add(_petMouth(M.mouth, 0.016, 0.016, -0.105, 0.2));
    const tongue = _petSphere(M.tongue, 0.02, 0.007, 0.042, 0.008, -0.118, 0.185, 14); tongue.rotation.x = 0.35; tongue.name = 'tongue'; head.add(tongue);
    [[-0.078, 0.14], [0.078, -0.14]].forEach(([x, lk]) => { head.add(_petEye(M.dogEye, 0.056, x, 0.01, 0.158, lk, M.rim)); head.add(_petSphere(M.white, 0.036, 0.018, 0.024, x * 0.92, 0.082, 0.16)); });   // big FLAT puppy eyes on the face + the raised inner brow [REF#EN-00670]
    [[-0.15, 0.55], [0.15, -0.55]].forEach(([x, rz]) => { const ear = _petSphere(M.white, 0.065, 0.15, 0.035, x * 1.05, -0.02, -0.02); ear.rotation.z = rz; ear.rotation.x = 0.15; ear.name = 'ear'; head.add(ear); ear.add(_petFurShells(_petSphere(M.white, 1, 1, 1, 0, 0, 0), M.white, 3, 0.06));
        const inner = _petSphere(M.pinkEar, 0.03, 0.085, 0.02, x * 1.02, -0.02, 0.0); inner.rotation.z = rz; inner.rotation.x = 0.15; head.add(inner); });   // floppy, pink inside [REF#EN-00671]
    head.add(_petSphere(M.white, 0.05, 0.035, 0.05, 0, 0.13, 0.03));   // a tuft on the crown [REF#EN-00672]
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.02, 8, 24), M.collar); collar.position.set(0, 0.45, 0.27); collar.rotation.x = Math.PI / 2 - 0.35; g.add(collar);
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), M.tag); tag.position.set(0, 0.385, 0.37); tag.rotation.x = Math.PI / 2 - 0.35; g.add(tag);
    const legs = []; [[-0.095, 0.15], [0.095, 0.15], [-0.095, -0.15], [0.095, -0.15]].forEach(([x, z], i) => { const l = _petLeg(M.white, x, z, 0.23, 0.046); l.name = 'leg' + i; g.add(l); legs.push(l); });
    const tail = _petTail(M.white, 0.032, 5, 0, 0.42, -0.26, 1.7, 0.55); tail.name = 'tail'; g.add(tail);   // curls up over the back [REF#EN-00673]
    g.userData.pet = { body, head, legs, tail, tongue, sitDrop: 0.12, bodyY: 0.33, headY: 0.54, legLen: 0.23 };
    return g;
}
// ── THE MONKEY 🐒 (PETS_PLAN P6, Mark 2026-09-15 "what about … monkey") — Saru: brown fur, a tan face and ears, long arms, a [REF#EN-00674]
//    tail curled high. Same rig contract as the cat and dog (body/head/legs/tail); the front "legs" are its arms.
function _buildMonkeyMesh(){
    const g = new THREE.Group(); const M = _petMats;
    const body = _petBody(M.brown, [[-0.22, 0.001], [-0.19, 0.09], [-0.12, 0.125], [-0.02, 0.135], [0.07, 0.13], [0.15, 0.11], [0.20, 0.07], [0.22, 0.001]], [0.12, 0.10, 0.13, -0.03, 0.0]);
    body.position.set(0, 0.34, 0); body.name = 'body'; g.add(body); body.add(_petFurShells(body.children[0], M.brown, 4, 0.045));
    const head = new THREE.Group(); head.position.set(0, 0.54, 0.22); head.name = 'head'; g.add(head);
    const hs = _petSphere(M.brown, 0.15, 0.14, 0.14, 0, 0, 0, 32); head.add(hs); head.add(_petFurShells(hs, M.brown, 4, 0.03));
    head.add(_petSphere(M.tan, 0.105, 0.115, 0.05, 0, -0.02, 0.115));                                       // the face [REF#EN-00675]
    head.add(_petSphere(M.tan, 0.06, 0.045, 0.045, 0, -0.065, 0.14));                                        // muzzle [REF#EN-00676]
    head.add(_petSphere(M.rim, 0.008, 0.006, 0.005, -0.014, -0.06, 0.183, 8)); head.add(_petSphere(M.rim, 0.008, 0.006, 0.005, 0.014, -0.06, 0.183, 8));   // nostrils [REF#EN-00677]
    head.add(_petMouth(M.mouth, 0.02, 0, -0.09, 0.165, Math.PI));
    [[-0.05, 0.14], [0.05, -0.14]].forEach(([x, lk]) => { head.add(_petEye(M.dogEye, 0.04, x, 0.01, 0.152, lk, M.rim)); });
    [[-0.15], [0.15]].forEach(([x]) => { head.add(_petSphere(M.brown, 0.05, 0.05, 0.02, x, 0.0, -0.02)); head.add(_petSphere(M.tan, 0.03, 0.03, 0.012, x * 1.02, 0.0, 0.0)); });   // round ears [REF#EN-00678]
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.016, 8, 24), M.collar); collar.position.set(0, 0.45, 0.17); collar.rotation.x = Math.PI / 2 - 0.3; g.add(collar);
    const legs = []; [[-0.09, 0.14, 0.30, 0.03], [0.09, 0.14, 0.30, 0.03], [-0.07, -0.10, 0.22, 0.035], [0.07, -0.10, 0.22, 0.035]].forEach(([x, z, len, r], i) => { const l = _petLeg(M.brown, x, z, len, r, M.tan); l.name = 'leg' + i; g.add(l); legs.push(l); });   // long arms, short legs [REF#EN-00679]
    const tail = _petTail(M.brown, 0.022, 7, 0, 0.40, -0.21, 1.3, 0.3); tail.name = 'tail'; g.add(tail);
    g.userData.pet = { body, head, legs, tail, sitDrop: 0.10, bodyY: 0.34, headY: 0.54, legLen: 0.30 };
    return g;
}
    return { mats: _petMats, tex: _petTex, sphere: _petSphere, furShells: _petFurShells, buildCat: _buildCatMesh, buildDog: _buildDogMesh, buildMonkey: _buildMonkeyMesh,
             build(type){ return type === 'cat' ? _buildCatMesh() : type === 'dog' ? _buildDogMesh() : type === 'monkey' ? _buildMonkeyMesh() : null; } };
}
export function petModels(opts){
    const THREE = _THREE(); const key = (opts && opts.icon) ? 'icon' : 'world';
    let per = _cache.get(THREE); if (!per){ per = {}; _cache.set(THREE, per); }
    if (!per[key]) per[key] = _make(THREE, key === 'icon');
    return per[key];
}
// ── PAPER WHITE for a GLB pet (Mark 2026-09-15: "make pure white texture" → "puppy missing texture and eyes") ── the akita's [REF#EN-00680]
// Tripo bake is a beige 512² atlas that also CARRIES her face: black eyes, the dark nose, the brass hinges. The first cut
// dropped the map to get white paper and dropped her eyes with it. Now the map STAYS and is lifted toward white once, on the
// CPU: each texel's luminance gates a mix toward white (smoothstep lo→hi × amount), so beige paper goes near-white while ink
// (eyes, nose, hinge shadow) keeps its darkness. The lifted pixels go back into the texture's own image slot as a canvas —
// flipY / encoding / colorSpace / filters untouched, so both loaders' orientation holds (r128 CanvasTexture over an
// ImageBitmap, r160 Texture) — once per texture (userData._paperWhite). Material: colour white, roughness 0.9, metalness 0,
// flat-shaded (the folds ARE the model). Called by Engine9 _warmPetDog on the SOURCE scene (every SkeletonUtils clone shares
// the materials) and by Panels' SUMMON card on its own load. Knobs: { amount 0.8, lo 0.30, hi 0.72, flat true }.
export function paperWhite(root, opts){
    const o = opts || {}; const amount = (typeof o.amount === 'number') ? o.amount : 0.8, lo = (typeof o.lo === 'number') ? o.lo : 0.30, hi = (typeof o.hi === 'number') ? o.hi : 0.72;
    const seen = new Set(); let lifted = 0, mats = 0;
    root.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const ms = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of ms){
            if (!m || seen.has(m)) continue; seen.add(m); mats++;
            try {
                const t = m.map;
                if (t && t.image && !(t.userData && t.userData._paperWhite)){
                    const img = t.image, w = img.width || img.naturalWidth || 0, h = img.height || img.naturalHeight || 0;
                    if (w && h && typeof document !== 'undefined'){
                        const c = document.createElement('canvas'); c.width = w; c.height = h;
                        const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
                        const id = ctx.getImageData(0, 0, w, h), d = id.data, span = Math.max(1e-4, hi - lo);
                        for (let i = 0; i < d.length; i += 4){
                            const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
                            let k = (L - lo) / span; k = k < 0 ? 0 : k > 1 ? 1 : k; k = k * k * (3 - 2 * k) * amount;   // smoothstep gate: ink stays ink [REF#EN-00681]
                            d[i] += (255 - d[i]) * k; d[i + 1] += (255 - d[i + 1]) * k; d[i + 2] += (255 - d[i + 2]) * k;
                        }
                        ctx.putImageData(id, 0, 0);
                        t.image = c; t.userData = t.userData || {}; t.userData._paperWhite = true; t.needsUpdate = true; lifted++;
                    }
                }
                if (m.color) m.color.set(0xffffff);
                if ('roughness' in m) m.roughness = 0.9;
                if ('metalness' in m) m.metalness = 0;
                if (o.flat !== false) m.flatShading = true;
                m.needsUpdate = true;
            } catch(_){}
        }
    });
    return { materials: mats, lifted };
}
if (typeof window !== 'undefined'){ window.OrigamiPets = window.OrigamiPets || {}; window.OrigamiPets.models = petModels; window.OrigamiPets.paperWhite = paperWhite; }
