/** [REF#EN-00001]
 * BlackjackTable.js — The Interactive 3D Blackjack Table Module
 * 
 * Modular ES6 Class for the Blackjack casino table entity template.
 * Spawns in front of targeted Goblins during parleys, featuring:
 *  - 3D curved green-felt velvet playing surface (emerald felt PBR).
 *  - Matte obsidian outer safety armrest rim with polished gold cup holders.
 *  - High-fidelity physical props: card dealer shoe and stacks of colored chips.
 *  - Support legs/pillars extending to the ground.
 *  - Micro-optimized vertical slide/rise intro animation.
 */

const THREE = window.THREE;

export function buildBlackjackTable() {
    const tableGroup = new THREE.Group();
    tableGroup.name = "blackjack_table";

    // Standard dimensions: [REF#EN-00002]
    // Curved felt table radius: 0.65 units
    // Height of table: 0.72 units (matches standard table height relative to FPV camera)
    const FELT_COLOR = 0x113e19;       // deep forest emerald velvet felt [REF#EN-00003]
    const RIM_COLOR = 0x121316;        // matte obsidian dark armrest rim [REF#EN-00004]
    const METAL_GOLD = 0xc8a560;       // polished champagne gold trim [REF#EN-00005]
    
    // Materials [REF#EN-00006]
    const feltMat = new THREE.MeshStandardMaterial({
        color: FELT_COLOR,
        roughness: 0.90, // velvet texture absorbs light [REF#EN-00007]
        metalness: 0.05,
        name: "bj_table_felt"
    });

    const rimMat = new THREE.MeshStandardMaterial({
        color: RIM_COLOR,
        roughness: 0.55,
        metalness: 0.15,
        name: "bj_table_rim"
    });

    const goldMat = new THREE.MeshStandardMaterial({
        color: METAL_GOLD,
        roughness: 0.25,
        metalness: 0.95,
        name: "bj_table_gold"
    });

    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x3d2314, // dark walnut wood [REF#EN-00008]
        roughness: 0.40,
        metalness: 0.05,
        name: "bj_table_wood"
    });

    const legsMat = new THREE.MeshStandardMaterial({
        color: 0x181a20, // dark metal legs [REF#EN-00009]
        roughness: 0.70,
        metalness: 0.40,
        name: "bj_table_legs"
    });

    // 1. Curved Table Felt (Semi-Cylinder flat disk) [REF#EN-00010]
    // Radius 0.62, height 0.03, flat side faces goblin (rotated on creation)
    const feltGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.03, 32, 1, false, 0, Math.PI);
    feltGeo.rotateX(Math.PI / 2);
    feltGeo.rotateZ(Math.PI); // rotate so the curved arc faces the player (south) [REF#EN-00011]
    const feltMesh = new THREE.Mesh(feltGeo, feltMat);
    feltMesh.position.y = 0.71;
    feltMesh.castShadow = true;
    feltMesh.receiveShadow = true;
    tableGroup.add(feltMesh);

    // 2. Straight Back Border (flat wooden panel facing the goblin) [REF#EN-00012]
    const backBarGeo = new THREE.BoxGeometry(1.24, 0.04, 0.04);
    const backBar = new THREE.Mesh(backBarGeo, woodMat);
    // position at the flat back diameter (Z = 0) [REF#EN-00013]
    backBar.position.set(0, 0.71, 0);
    backBar.castShadow = true;
    tableGroup.add(backBar);

    // 3. Outer Curved Obsidian Armrest Rim [REF#EN-00014]
    // Thicker, slightly larger semi-cylinder to envelope the curved edge of the felt
    const rimGeo = new THREE.CylinderGeometry(0.67, 0.67, 0.05, 32, 1, true, 0, Math.PI);
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.rotateZ(Math.PI);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.72;
    rimMesh.castShadow = true;
    tableGroup.add(rimMesh);

    // 4. Polished Gold Trim Accent [REF#EN-00015]
    // A thin bezel ring separating the felt from the outer rim
    const goldTrimGeo = new THREE.CylinderGeometry(0.625, 0.625, 0.01, 32, 1, true, 0, Math.PI);
    goldTrimGeo.rotateX(Math.PI / 2);
    goldTrimGeo.rotateZ(Math.PI);
    const goldTrim = new THREE.Mesh(goldTrimGeo, goldMat);
    goldTrim.position.y = 0.726;
    tableGroup.add(goldTrim);

    // 5. Procedural Card Zones (Drawn as thin wires/planes on the felt) [REF#EN-00016]
    const cardZonePlayerGeo = new THREE.PlaneGeometry(0.12, 0.18);
    const cardZoneDealerGeo = new THREE.PlaneGeometry(0.12, 0.18);
    const zoneBorderMat = new THREE.MeshBasicMaterial({
        color: METAL_GOLD,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Player Card Zone (closer to player, centered) [REF#EN-00017]
    const zonePlayer = new THREE.Mesh(cardZonePlayerGeo, zoneBorderMat);
    zonePlayer.rotation.x = -Math.PI / 2;
    zonePlayer.position.set(0, 0.726, -0.32);
    tableGroup.add(zonePlayer);

    // Dealer Card Zone (closer to dealer, centered) [REF#EN-00018]
    const zoneDealer = new THREE.Mesh(cardZoneDealerGeo, zoneBorderMat);
    zoneDealer.rotation.x = -Math.PI / 2;
    zoneDealer.position.set(0, 0.726, -0.08);
    tableGroup.add(zoneDealer);

    // 6. Support Pillars / Legs (Two cylinder columns extending down to y = 0) [REF#EN-00019]
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.70, 8);
    
    const leftLeg = new THREE.Mesh(legGeo, legsMat);
    leftLeg.position.set(-0.40, 0.35, -0.15);
    leftLeg.castShadow = true;
    leftLeg.receiveShadow = true;
    tableGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legsMat);
    rightLeg.position.set(0.40, 0.35, -0.15);
    rightLeg.castShadow = true;
    rightLeg.receiveShadow = true;
    tableGroup.add(rightLeg);

    // 7. Physical Props: Card Dealer Shoe (Walnut wood casing on the left side) [REF#EN-00020]
    const shoeGroup = new THREE.Group();
    const shoeBaseGeo = new THREE.BoxGeometry(0.10, 0.06, 0.16);
    const shoeBase = new THREE.Mesh(shoeBaseGeo, woodMat);
    shoeGroup.add(shoeBase);

    // Gold mouth from which cards are dealt [REF#EN-00021]
    const shoeMouthGeo = new THREE.BoxGeometry(0.09, 0.015, 0.02);
    const shoeMouth = new THREE.Mesh(shoeMouthGeo, goldMat);
    shoeMouth.position.set(0, 0.02, -0.075);
    shoeGroup.add(shoeMouth);

    shoeGroup.position.set(-0.35, 0.755, -0.08);
    shoeGroup.rotation.set(0.12, 0.45, 0); // tilted toward the center of the table [REF#EN-00022]
    shoeGroup.castShadow = true;
    tableGroup.add(shoeGroup);

    // 8. Physical Props: Stacks of Casino Chips (Gold, Crimson, Obsidian) [REF#EN-00023]
    const chipGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.005, 12);
    const chipsGroup = new THREE.Group();

    const redChipMat = new THREE.MeshStandardMaterial({ color: 0xbf1515, roughness: 0.5, metalness: 0.1 });
    const obsChipMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.1 });

    // Build 3 stacks with differing heights [REF#EN-00024]
    const _addChipStack = (x, z, mat, count) => {
        for (let i = 0; i < count; i++) {
            const chip = new THREE.Mesh(chipGeo, mat);
            chip.position.set(x, 0.0025 + i * 0.005, z);
            chip.castShadow = true;
            chip.receiveShadow = true;
            chipsGroup.add(chip);
        }
    };

    // Stacks placed to the dealer's right (table's right side) [REF#EN-00025]
    _addChipStack(0.32, -0.06, goldMat, 8);
    _addChipStack(0.36, -0.09, redChipMat, 12);
    _addChipStack(0.39, -0.05, obsChipMat, 6);

    chipsGroup.position.y = 0.725;
    tableGroup.add(chipsGroup);

    // 9. Unfolding vertical intro animation [REF#EN-00026]
    // Smooth easing interpolation function (Cubic Ease Out)
    const _easeCubicOut = (t) => 1 - Math.pow(1 - t, 3);

    tableGroup.userData.animateIntro = function(progress) {
        const eased = _easeCubicOut(progress);
        // Table rises out of the floor: Y starts at -0.75 (below floor) to 0.0 (fully deployed) [REF#EN-00027]
        tableGroup.position.y = -0.85 + 0.85 * eased;
        // Radial scale unfolding: grows from 0 to 1 [REF#EN-00028]
        tableGroup.scale.set(eased, eased, eased);
    };

    // Start completely hidden and scaled to zero [REF#EN-00029]
    tableGroup.userData.animateIntro(0);

    return tableGroup;
}
