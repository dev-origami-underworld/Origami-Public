/** [REF#EN-00737]
 * BazookaModelBuilder.js — the short launcher and its rockets, drawn for the card pictures (2026-09-29).
 *
 * ONE builder for every surface: the world loot card (LootCardBuilder.js, the porthole under the glass dome), the
 * hand / vending / guide card (Origami.RealityEngine.Panels.html, scenes 'BAZOOKA' and 'ROCKETS') and the launcher
 * on the player's shoulder when a rocket fires (Engine9 `_rktShowLauncher`). They cannot drift apart.
 * Deep doc: knowledge/design/BAZOOKA_AND_EXPLOSION_2026-09-29.md
 *
 * WHAT IT DRAWS
 *   buildShortLauncher — a short olive-drab launcher: flared rear venturi, wooden heat guard, pistol grip and
 *   fore-grip, a boxy optic on top, a shoulder rest, and a rocket loaded in the muzzle. The warhead is the
 *   double-cone RPG head, painted like the M6A1 the engine fires (olive, yellow HE band, steel fuse spike).
 *   buildRocketPack — two of those rounds with their motors and tail fins: the pack a ROCKETS card holds.
 *
 * HOW IT STAYS CHEAP AND READABLE
 *   - every part is merged into ONE BufferGeometry under ONE MeshBasicMaterial: one draw call per card;
 *   - the shading is painted into vertex colours from a fixed key light (upper left, toward the viewer) and a
 *     soft rim, so the picture reads the same in the unlit dungeon porthole and in the lit card renderer.
 *     No lights are added;
 *   - the pose (muzzle raised and turned toward the viewer) is baked in, then the mesh is centred and scaled
 *     so every vertex sits inside a circle of `radius` in the XY plane.
 *   - the paint is worked out in sRGB and converted when the three.js build manages colour (r152+, the
 *     Panels iframe runs 0.160), so both builds show the same shading (the engine runs r128).
 *
 * API (also on window.OrigamiBazooka, for the Panels iframe, which imports this file for its side effect):
 *   buildShortLauncher(THREE, { radius, backdrop })  → THREE.Mesh
 *   buildRocketPack(THREE, { radius, backdrop })     → THREE.Mesh
 *   backdrop (optional) = { r, z }: a dark glossy disc of radius r at depth z behind the fitted model, merged in.
 *   buildHeldLauncher(THREE, { scale })             → THREE.Group, the first-person launcher (Engine9 `_rktShowLauncher`):
 *                                                     real scale, pointing −Z, empty muzzle, userData.muzzleZ / breechZ.
 */

const PAL = {
    od:     0x62722e,   // olive drab, lifted a little so it reads on a dark card [REF#EN-00738]
    odDark: 0x3f4822,
    odWar:  0x6d7c3c,   // the warhead's slightly greener paint [REF#EN-00739]
    wood:   0x92602e,
    black:  0x26272a,
    steel:  0xc3c5ba,
    yellow: 0xe8bb1e,
    lens:   0x86dcff,
};

// one part = a geometry, where it sits in the model (x = toward the muzzle, y = up), its paint, how glossy it is [REF#EN-00740]
function _part(THREE, geo, hex, gloss, x, y, z, rx, ry, rz) {
    const o = new THREE.Object3D();
    o.position.set(x || 0, y || 0, z || 0);
    o.rotation.set(rx || 0, ry || 0, rz || 0);
    o.updateMatrix();
    return { geo, hex, gloss: gloss || 0, matrix: o.matrix.clone() };
}
// a cylinder lying along +x: its first radius is the FRONT end (CylinderGeometry's top, turned to face +x) [REF#EN-00741]
function _alongX(THREE, P, rFront, rRear, len, hex, gloss, x, y, z, seg) {
    P.push(_part(THREE, new THREE.CylinderGeometry(rFront, rRear, len, seg || 28), hex, gloss, x, y, z, 0, 0, -Math.PI / 2));
}
function _box(THREE, P, w, h, d, hex, gloss, x, y, z, rz) {
    P.push(_part(THREE, new THREE.BoxGeometry(w, h, d), hex, gloss, x, y, z, 0, 0, rz || 0));
}

// the warhead, pointing +x; x0 is where its rear cone meets the tube (or the motor) [REF#EN-00742]
function _warhead(THREE, P, x0, y, z) {
    y = y || 0; z = z || 0;
    _alongX(THREE, P, 0.27, 0.15, 0.22, PAL.odWar, 0.45, x0 + 0.11, y, z);          // rear cone [REF#EN-00743]
    _alongX(THREE, P, 0.27, 0.27, 0.22, PAL.odWar, 0.45, x0 + 0.33, y, z);          // body [REF#EN-00744]
    _alongX(THREE, P, 0.276, 0.276, 0.07, PAL.yellow, 0.35, x0 + 0.30, y, z);       // yellow HE band [REF#EN-00745]
    _alongX(THREE, P, 0.07, 0.27, 0.46, PAL.odWar, 0.50, x0 + 0.67, y, z);          // ogive [REF#EN-00746]
    _alongX(THREE, P, 0.03, 0.07, 0.16, PAL.steel, 0.80, x0 + 0.98, y, z, 16);      // fuse spike [REF#EN-00747]
}

function _launcherParts(THREE, loaded) {
    const P = [], R0 = 0.19;
    // the tube, its flared venturi and lip at the back [REF#EN-00748]
    _alongX(THREE, P, R0, R0, 1.85, PAL.od, 0.35, -0.025, 0, 0);
    _alongX(THREE, P, R0, 0.30, 0.34, PAL.odDark, 0.25, -1.12, 0, 0);
    _alongX(THREE, P, 0.305, 0.305, 0.04, PAL.black, 0.20, -1.305, 0, 0);
    // bands, the wooden heat guard, a yellow stencil ring, the muzzle collar [REF#EN-00749]
    _alongX(THREE, P, 0.198, 0.198, 0.045, PAL.odDark, 0.30, -0.62, 0, 0);
    _alongX(THREE, P, 0.215, 0.215, 0.60, PAL.wood, 0.15, -0.12, 0, 0);
    _alongX(THREE, P, 0.222, 0.222, 0.035, PAL.odDark, 0.30, -0.42, 0, 0);
    _alongX(THREE, P, 0.222, 0.222, 0.035, PAL.odDark, 0.30, 0.18, 0, 0);
    _alongX(THREE, P, 0.196, 0.196, 0.05, PAL.yellow, 0.20, 0.60, 0, 0);
    _alongX(THREE, P, 0.215, 0.215, 0.10, PAL.odDark, 0.30, 0.87, 0, 0);
    // the loaded rocket, or (held on the shoulder, just fired) the dark bore of an empty muzzle [REF#EN-00750]
    if (loaded !== false) _warhead(THREE, P, 0.92, 0, 0);
    else _alongX(THREE, P, 0.17, 0.17, 0.012, PAL.black, 0, 0.925, 0, 0);
    // pistol grip (raked back), trigger guard and trigger, fore-grip, shoulder rest and its pad [REF#EN-00751]
    _box(THREE, P, 0.16, 0.46, 0.15, PAL.black, 0.15, -0.30, -0.40, 0, -0.28);
    P.push(_part(THREE, new THREE.TorusGeometry(0.085, 0.017, 6, 16, Math.PI), PAL.black, 0.30, -0.08, -0.19, 0, 0, 0, Math.PI));
    _box(THREE, P, 0.035, 0.10, 0.05, PAL.steel, 0.40, -0.08, -0.22, 0);
    _box(THREE, P, 0.13, 0.36, 0.13, PAL.black, 0.15, 0.45, -0.33, 0, -0.10);
    _box(THREE, P, 0.50, 0.12, 0.16, PAL.odDark, 0.20, -0.70, -0.25, 0);
    _box(THREE, P, 0.12, 0.24, 0.17, PAL.black, 0.10, -0.90, -0.30, 0);
    // the optic: mount, body, a blue front lens, a rubber eyepiece [REF#EN-00752]
    _box(THREE, P, 0.16, 0.10, 0.10, PAL.black, 0.20, 0.02, 0.23, 0.05);
    _box(THREE, P, 0.46, 0.17, 0.15, PAL.odDark, 0.30, 0.00, 0.36, 0.06);
    _alongX(THREE, P, 0.06, 0.06, 0.04, PAL.lens, 0.90, 0.245, 0.36, 0.06, 16);
    _alongX(THREE, P, 0.055, 0.065, 0.08, PAL.black, 0.10, -0.27, 0.36, 0.06, 16);
    return P;
}

// one round: the warhead plus its motor, four tail fins and the fin ring; x0 = the back of the warhead [REF#EN-00753]
function _round(THREE, P, x0, y, z) {
    _alongX(THREE, P, 0.085, 0.085, 0.80, PAL.odDark, 0.35, x0 - 0.40, y, z, 18);
    for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        P.push(_part(THREE, new THREE.BoxGeometry(0.30, 0.20, 0.025), PAL.odDark, 0.20,
            x0 - 0.66, y + Math.cos(a) * 0.185, z + Math.sin(a) * 0.185, a, 0, 0));
    }
    P.push(_part(THREE, new THREE.TorusGeometry(0.285, 0.018, 6, 28), PAL.odDark, 0.30, x0 - 0.62, y, z, 0, Math.PI / 2, 0));
    _warhead(THREE, P, x0, y, z);
}
function _packParts(THREE) {
    const P = [];
    _round(THREE, P, 0.35, 0.25, 0);
    _round(THREE, P, 0.05, -0.25, 0.10);
    return P;
}

// pose, paint and merge the parts into one geometry fitted to a circle of `radius` [REF#EN-00754]
function _bake(THREE, parts, pose, radius, backdrop, scale) {
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pose[0], pose[1], pose[2], 'XYZ'));
    const M = new THREE.Matrix4();
    const L = new THREE.Vector3(-0.38, 0.78, 0.50).normalize();   // key light: upper left, toward the viewer [REF#EN-00755]
    const V = new THREE.Vector3(0, 0, 1);
    const H = L.clone().add(V).normalize();
    const managed = !!(THREE.ColorManagement && THREE.ColorManagement.enabled);
    const lin = (v) => (!managed ? v : (v < 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4)));
    const pos = [], nrm = [], col = [], n = new THREE.Vector3();
    for (const p of parts) {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
        g.applyMatrix4(M.multiplyMatrices(R, p.matrix));
        const PA = g.attributes.position, NA = g.attributes.normal;
        const r = ((p.hex >> 16) & 255) / 255, gr = ((p.hex >> 8) & 255) / 255, b = (p.hex & 255) / 255;
        for (let i = 0; i < PA.count; i++) {
            n.fromBufferAttribute(NA, i);
            const k = 0.36 + 0.64 * Math.max(0, n.dot(L));
            const s = Math.pow(Math.max(0, n.dot(H)), 22) * p.gloss;
            const rim = Math.pow(1 - Math.max(0, n.dot(V)), 3) * 0.20;
            pos.push(PA.getX(i), PA.getY(i), PA.getZ(i));
            nrm.push(n.x, n.y, n.z);
            col.push(lin(Math.min(1, r * k + s + rim * 0.55)), lin(Math.min(1, gr * k + s + rim * 0.62)), lin(Math.min(1, b * k + s + rim * 0.72)));
        }
        g.dispose(); p.geo.dispose();
    }
    // held mode: real scale about the model's own origin, no centring or fit [REF#EN-00756]
    if (typeof scale === 'number') {
        for (let i = 0; i < pos.length; i++) pos[i] *= scale;
        const held = new THREE.BufferGeometry();
        held.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        held.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        held.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        held.computeBoundingBox(); held.computeBoundingSphere();
        return held;
    }
    // centre on the bounding box, then scale so the farthest vertex (in XY) sits on `radius` [REF#EN-00757]
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { const a = i % 3; if (pos[i] < lo[a]) lo[a] = pos[i]; if (pos[i] > hi[a]) hi[a] = pos[i]; }
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
    let far = 1e-6;
    for (let i = 0; i < pos.length; i += 3) far = Math.max(far, Math.hypot(pos[i] - cx, pos[i + 1] - cy));
    const k = (radius || 1.5) / far;
    for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i] - cx) * k; pos[i + 1] = (pos[i + 1] - cy) * k; pos[i + 2] = (pos[i + 2] - cz) * k; }
    // the backdrop: a dark glossy disc behind the model (the world card's porthole is a real hole in the card face, so a [REF#EN-00758]
    // slim model otherwise shows the room behind it). Same geometry, same material: no extra draw.
    if (backdrop) {
        const ring = new THREE.RingGeometry(0.001, backdrop.r, 48, 8).toNonIndexed(), RP = ring.attributes.position;
        const hx = -0.35 * backdrop.r, hy = 0.42 * backdrop.r, dark = [0.050, 0.054, 0.063], glow = [0.235, 0.247, 0.278];
        for (let i = 0; i < RP.count; i++) {
            const x = RP.getX(i), y = RP.getY(i);
            const v = Math.pow(Math.max(0, 1 - Math.hypot(x - hx, y - hy) / (1.6 * backdrop.r)), 1.6);
            pos.push(x, y, backdrop.z); nrm.push(0, 0, 1);
            col.push(lin(dark[0] + (glow[0] - dark[0]) * v), lin(dark[1] + (glow[1] - dark[1]) * v), lin(dark[2] + (glow[2] - dark[2]) * v));
        }
        ring.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
}
function _mesh(THREE, geo, name) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    m.name = name;
    return m;
}

export function buildShortLauncher(THREE, opts) {
    const o = opts || {};
    return _mesh(THREE, _bake(THREE, _launcherParts(THREE), o.pose || [0.12, -0.42, 0.30], o.radius, o.backdrop), 'ShortLauncher');
}
export function buildRocketPack(THREE, opts) {
    const o = opts || {};
    return _mesh(THREE, _bake(THREE, _packParts(THREE), o.pose || [0.15, -0.35, 0.35], o.radius, o.backdrop), 'RocketPack');
}

// the launcher on the player's shoulder: no card pose, real scale (model units × scale = world units), pointing −Z like the [REF#EN-00759]
// engine's forward, the muzzle empty because the rocket has just left. userData.muzzleZ / breechZ are local points on that axis.
export function buildHeldLauncher(THREE, opts) {
    const o = opts || {}, s = (typeof o.scale === 'number') ? o.scale : 0.21;
    const g = new THREE.Group(); g.name = 'HeldLauncher';
    g.add(_mesh(THREE, _bake(THREE, _launcherParts(THREE, false), [0, Math.PI / 2, 0], null, null, s), 'HeldLauncherBody'));
    g.userData.muzzleZ = -0.93 * s; g.userData.breechZ = 1.325 * s;
    return g;
}

if (typeof window !== 'undefined') window.OrigamiBazooka = { buildShortLauncher, buildRocketPack, buildHeldLauncher };
