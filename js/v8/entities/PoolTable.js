/** [REF#EN-00380]
 * PoolTable.js — Photoreal procedural BILLIARDS table (casino placeholder).
 *
 * Casino room prop (Mark 2026-06-17 "drop in placeholders now, photorealistic cool looking").
 * Swap target: assets/models/rooms/pool/pool.glb when a real GLB lands (loader mirrors SakeTavern.glb).
 * Standalone ES module, no engine coupling: window.THREE, export buildPoolTable() → THREE.Group.
 *
 * Built to read as a real 8-ball table at a glance: slate bed under tournament-blue felt,
 * mahogany rails with brass sight-diamonds + leather cushions, six leather pockets, four turned
 * legs, a full racked triangle of 15 numbered balls + cue ball, and a cue stick on the rail.
 * ZERO lights (FPS fill-wall mandate) — reads by the room's existing ambient/emissive only.
 */

const THREE = window.THREE;

export function buildPoolTable(opts = {}) {
    const g = new THREE.Group();
    g.name = 'pool_table';

    // Playing-field footprint (world units). A 2:1 tournament table, scaled to the room. [REF#EN-00381]
    const L = (typeof opts.length === 'number' ? opts.length : 1.78);   // long axis (X) [REF#EN-00382]
    const W = (typeof opts.width === 'number' ? opts.width : 0.96);    // short axis (Z) [REF#EN-00383]
    const BED_Y = (typeof opts.height === 'number' ? opts.height : 0.78); // felt surface height [REF#EN-00384]
    const RAIL_W = 0.11, RAIL_H = 0.07;

    // ── Materials (PBR) ───────────────────────────────────────────────────── [REF#EN-00385]
    const felt   = new THREE.MeshStandardMaterial({ color: 0x12502e, roughness: 0.95, metalness: 0.02, emissive: 0x041a0e, emissiveIntensity: 0.10 }); // tournament green velvet [REF#EN-00386]
    const wood   = new THREE.MeshStandardMaterial({ color: 0x4a2317, roughness: 0.42, metalness: 0.10, emissive: 0x150905, emissiveIntensity: 0.06 }); // mahogany [REF#EN-00387]
    const woodDk = new THREE.MeshStandardMaterial({ color: 0x2c140c, roughness: 0.5,  metalness: 0.08 });
    const slate  = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7,  metalness: 0.15 });
    const brass  = new THREE.MeshStandardMaterial({ color: 0xcaa24a, roughness: 0.28, metalness: 0.95, emissive: 0x3a2a08, emissiveIntensity: 0.12 });
    const leather= new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.6,  metalness: 0.05 });

    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };

    // ── Felt bed (on a slate slab) ────────────────────────────────────────── [REF#EN-00388]
    add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, W), slate), 0, BED_Y - 0.05, 0);          // slate [REF#EN-00389]
    add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.012, W), felt), 0, BED_Y + 0.006, 0);          // felt top [REF#EN-00390]
    // baulk line + centre spot (thin brass inlays — the "pro" read) [REF#EN-00391]
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.001, W * 0.92), brass); line.position.set(-L * 0.27, BED_Y + 0.013, 0); g.add(line);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), brass); spot.rotation.x = -Math.PI / 2; spot.position.set(L * 0.27, BED_Y + 0.013, 0); g.add(spot);

    // ── Rails (mahogany frame) + leather cushions + brass diamonds ────────── [REF#EN-00392]
    const railLong = (z) => { add(new THREE.Mesh(new THREE.BoxGeometry(L + RAIL_W * 2, RAIL_H, RAIL_W), wood), 0, BED_Y + RAIL_H / 2 - 0.01, z);
                              add(new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.03, 0.03), leather), 0, BED_Y + 0.02, z - Math.sign(z) * 0.05); };
    const railShort = (x) => { add(new THREE.Mesh(new THREE.BoxGeometry(RAIL_W, RAIL_H, W + RAIL_W * 2), wood), x, BED_Y + RAIL_H / 2 - 0.01, 0);
                               add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, W * 0.74), leather), x - Math.sign(x) * 0.05, BED_Y + 0.02, 0); };
    railLong(W / 2 + RAIL_W / 2); railLong(-(W / 2 + RAIL_W / 2));
    railShort(L / 2 + RAIL_W / 2); railShort(-(L / 2 + RAIL_W / 2));
    // brass sight diamonds along the long rails [REF#EN-00393]
    for (let i = -3; i <= 3; i++) { if (i === 0) continue;
        for (const z of [W / 2 + RAIL_W / 2, -(W / 2 + RAIL_W / 2)]) {
            const d = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), brass);
            d.position.set(i * (L / 8), BED_Y + RAIL_H - 0.015, z); d.scale.set(1, 0.5, 1.4); g.add(d);
        }
    }

    // ── Six leather pockets (corners + side rails) ────────────────────────── [REF#EN-00394]
    const pocket = (x, z) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.05, 16), leather); p.position.set(x, BED_Y - 0.005, z); g.add(p); };
    pocket(L / 2, W / 2); pocket(L / 2, -W / 2); pocket(-L / 2, W / 2); pocket(-L / 2, -W / 2); pocket(0, W / 2 + 0.01); pocket(0, -W / 2 - 0.01);

    // ── Four turned legs to the floor ─────────────────────────────────────── [REF#EN-00395]
    const leg = (x, z) => { add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, BED_Y - 0.05, 12), woodDk), x, (BED_Y - 0.05) / 2, z);
                            add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), wood), x, BED_Y - 0.10, z); };   // skirt block [REF#EN-00396]
    const lx = L / 2 - 0.18, lz = W / 2 - 0.12;
    leg(lx, lz); leg(lx, -lz); leg(-lx, lz); leg(-lx, -lz);
    // apron skirt under the bed [REF#EN-00397]
    add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, W), wood), 0, BED_Y - 0.13, 0);

    // ── Racked balls (triangle of 15 + cue) ───────────────────────────────── [REF#EN-00398]
    const BALL_R = 0.026;
    const ballColors = [0xf6c915, 0x1f4fd1, 0xd4202a, 0x5a2a8c, 0xe07b1a, 0x176b3a, 0x7a1f2b, 0x111111, // 1-8 (solids; 8 black) [REF#EN-00399]
                        0xf6c915, 0x1f4fd1, 0xd4202a, 0x5a2a8c, 0xe07b1a, 0x176b3a, 0x7a1f2b];            // 9-15 (stripes ≈ same hue) [REF#EN-00400]
    const balls = new THREE.Group();
    let ci = 0; const apexX = L * 0.27, dz = BALL_R * 2 * 0.88, dx = BALL_R * 2 * 0.78;
    for (let row = 0; row < 5; row++) {
        for (let k = 0; k <= row; k++) {
            const m = new THREE.MeshStandardMaterial({ color: ballColors[ci % 15], roughness: 0.18, metalness: 0.05, emissive: 0x000000 });
            const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 16), m);
            const stripe = ci >= 8;   // mark 9-15 with a white band so it reads "stripe" [REF#EN-00401]
            if (stripe) { const band = new THREE.Mesh(new THREE.CylinderGeometry(BALL_R * 1.001, BALL_R * 1.001, BALL_R * 0.7, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.2 })); band.rotation.z = Math.PI / 2; b.add(band); }
            b.position.set(apexX + row * dx, BED_Y + 0.02 + BALL_R, (k - row / 2) * dz);
            b.castShadow = true; balls.add(b); ci++;
        }
    }
    const cue = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.15 }));
    cue.position.set(-L * 0.27, BED_Y + 0.02 + BALL_R, 0); cue.castShadow = true; balls.add(cue);
    g.add(balls);

    // ── Cue stick resting across a rail ───────────────────────────────────── [REF#EN-00402]
    const stick = new THREE.Group();
    stick.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.016, 1.45, 12), wood));            // shaft → butt taper [REF#EN-00403]
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x2a5fa0, roughness: 0.5 })); tip.position.y = 0.72; stick.add(tip);
    stick.rotation.set(0, 0.35, Math.PI / 2 + 0.06);
    stick.position.set(0.1, BED_Y + RAIL_H + 0.02, W / 2 + RAIL_W / 2);
    g.add(stick);

    // ── Optional rise-from-floor intro (matches BlackjackTable) ───────────── [REF#EN-00404]
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    g.userData.animateIntro = function (p) { const e = easeOut(p); g.position.y = -1.0 + 1.0 * e; g.scale.setScalar(0.0001 + e); };
    g.userData.bedHeight = BED_Y;
    g.userData.footprint = { L, W };
    return g;
}
