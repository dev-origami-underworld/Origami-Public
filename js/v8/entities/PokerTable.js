/** [REF#EN-00359]
 * PokerTable.js — Photoreal procedural OVAL poker table (casino placeholder).
 *
 * Casino room prop (Mark 2026-06-17 "drop in placeholders now, photorealistic cool looking").
 * Swap target: assets/models/rooms/poker/poker.glb when a real GLB lands (loader mirrors SakeTavern.glb).
 * Standalone ES module: window.THREE, export buildPokerTable() → THREE.Group. ZERO lights (FPS fill-wall).
 *
 * Reads as a real casino hold'em table: racetrack burgundy felt with a brass betting line, a padded
 * black-leather armrest rail with gold cup-holders at eight seats, the community/board area dressed
 * with five cards + a dealer button + colored chip stacks, on a turned walnut pedestal with a star foot.
 */

const THREE = window.THREE;

export function buildPokerTable(opts = {}) {
    const g = new THREE.Group();
    g.name = 'poker_table';

    const RX = (typeof opts.rx === 'number' ? opts.rx : 0.92);   // half-length (X) [REF#EN-00360]
    const RZ = (typeof opts.rz === 'number' ? opts.rz : 0.62);   // half-width  (Z) [REF#EN-00361]
    const TOP = (typeof opts.height === 'number' ? opts.height : 0.76);

    // ── Materials ──────────────────────────────────────────────────────────── [REF#EN-00362]
    const felt    = new THREE.MeshStandardMaterial({ color: 0x5a1322, roughness: 0.94, metalness: 0.03, emissive: 0x220308, emissiveIntensity: 0.12 }); // burgundy speed-cloth [REF#EN-00363]
    const leather = new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 0.55, metalness: 0.06, emissive: 0x050403, emissiveIntensity: 0.05 }); // padded rail [REF#EN-00364]
    const walnut  = new THREE.MeshStandardMaterial({ color: 0x3a2114, roughness: 0.4,  metalness: 0.1,  emissive: 0x120804, emissiveIntensity: 0.06 });
    const walnutD = new THREE.MeshStandardMaterial({ color: 0x231209, roughness: 0.5,  metalness: 0.08 });
    const brass   = new THREE.MeshStandardMaterial({ color: 0xcaa24a, roughness: 0.28, metalness: 0.95, emissive: 0x3a2a08, emissiveIntensity: 0.14 });
    const cardMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.35, metalness: 0.02 });

    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
    const ellipse = (geo) => geo;   // cylinders scaled below for the racetrack [REF#EN-00365]

    // ── Felt top (ellipse) + brass betting line ─────────────────────────────── [REF#EN-00366]
    const top = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.04, 48), felt), 0, TOP, 0);
    top.scale.set(RX, 1, RZ);
    const lineRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 8, 48), brass);
    lineRing.rotation.x = Math.PI / 2; lineRing.position.y = TOP + 0.021; lineRing.scale.set(RX * 0.62, RZ * 0.62, 1); g.add(lineRing);

    // ── Padded leather armrest rail (racetrack torus) ───────────────────────── [REF#EN-00367]
    const rail = new THREE.Mesh(new THREE.TorusGeometry(1, 0.055, 14, 64), leather);
    rail.rotation.x = Math.PI / 2; rail.position.y = TOP + 0.02; rail.scale.set(RX * 1.04, RZ * 1.04, 1);
    rail.castShadow = true; g.add(rail);

    // ── Eight seats: brass cup-holders + a chip stack + hole cards ──────────── [REF#EN-00368]
    const redChip = new THREE.MeshStandardMaterial({ color: 0xb01616, roughness: 0.5, metalness: 0.08 });
    const blkChip = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.55, metalness: 0.08 });
    const grnChip = new THREE.MeshStandardMaterial({ color: 0x12713e, roughness: 0.5, metalness: 0.08 });
    const chipGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.006, 16);
    const stack = (x, z, mat, n) => { for (let i = 0; i < n; i++) { const c = new THREE.Mesh(chipGeo, mat); c.position.set(x, TOP + 0.025 + i * 0.006, z); c.castShadow = true; g.add(c); } };
    const SEATS = 8;
    for (let s = 0; s < SEATS; s++) {
        const a = (s / SEATS) * Math.PI * 2 + Math.PI / SEATS;
        const ex = Math.cos(a) * RX * 1.02, ez = Math.sin(a) * RZ * 1.02;
        // cup holder [REF#EN-00369]
        const cup = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16), brass); cup.rotation.x = Math.PI / 2; cup.position.set(ex, TOP + 0.05, ez); g.add(cup);
        // a chip stack just inside the rail [REF#EN-00370]
        const ix = Math.cos(a) * RX * 0.78, iz = Math.sin(a) * RZ * 0.78;
        stack(ix, iz, [redChip, blkChip, grnChip][s % 3], 4 + (s % 4) * 2);
        // two face-down hole cards angled toward the seat [REF#EN-00371]
        const hc = new THREE.Group();
        for (let c = 0; c < 2; c++) { const card = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.085), cardMat); card.position.set(c * 0.03, 0, 0); hc.add(card); }
        hc.position.set(Math.cos(a) * RX * 0.66, TOP + 0.024, Math.sin(a) * RZ * 0.66); hc.rotation.y = -a; g.add(hc);
    }

    // ── Community board: 5 cards + dealer button + pot chips ─────────────────── [REF#EN-00372]
    for (let c = 0; c < 5; c++) {
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.1), cardMat);
        // a couple "face up" with a red/black pip hint [REF#EN-00373]
        const pip = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshBasicMaterial({ color: (c % 2 ? 0x111111 : 0xb01616) }));
        pip.rotation.x = -Math.PI / 2; pip.position.y = 0.0025; card.add(pip);
        card.position.set((c - 2) * 0.085, TOP + 0.024, -0.02); g.add(card);
    }
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3 }));
    button.position.set(0.34, TOP + 0.026, 0.12); g.add(button);   // "DEALER" button [REF#EN-00374]
    stack(-0.18, 0.14, grnChip, 9); stack(-0.12, 0.16, redChip, 6); stack(-0.22, 0.1, blkChip, 7);   // the pot [REF#EN-00375]

    // ── Walnut pedestal + star foot ─────────────────────────────────────────── [REF#EN-00376]
    add(new THREE.Mesh(new THREE.CylinderGeometry(RX * 0.9, RX * 0.96, 0.16, 32), walnut), 0, TOP - 0.12, 0).scale.set(1, 1, RZ / RX); // apron drum [REF#EN-00377]
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, TOP - 0.28, 16), walnutD), 0, (TOP - 0.28) / 2, 0);                       // column [REF#EN-00378]
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), walnut), Math.cos(a) * 0.22, 0.05, Math.sin(a) * 0.22).rotation.y = a; } // star foot [REF#EN-00379]

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    g.userData.animateIntro = function (p) { const e = easeOut(p); g.position.y = -1.0 + 1.0 * e; g.scale.setScalar(0.0001 + e); };
    g.userData.topHeight = TOP;
    g.userData.footprint = { rx: RX, rz: RZ };
    return g;
}
