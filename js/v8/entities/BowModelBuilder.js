/** [REF#EN-00030]
 * BowModelBuilder.js — The canonical recurve bow model for Origami Dungeon.
 *
 * One model, three surfaces (per user mandate 2026-05-22):
 *   1. Panels card glyph (BOW_SHORT / BOW_LONG icon in playing card)
 *   2. LootCardBuilder loot icon (3D loot card on the dungeon floor)
 *   3. FPV firing weapon (first-person bow draw + release)
 *
 * Design: deep crimson stave with gold tip wraps + black grip accents,
 * heavily-drawn recurve curve (CatmullRomCurve3 with bowed-back tips),
 * gold cone tips with tangent-correct orientation, V-shaped drawn
 * bowstring pulling back to nock point, full-length arrow nocked and ready.
 *
 * No Three.js singleton — expects `THREE` on `window` (matches the rest of
 * the codebase). All builders return a `THREE.Group`; caller owns scale,
 * position, rotation, and lifecycle (geometry.dispose() etc).
 */

// Resolved lazily inside each builder so module load can precede window.THREE. [REF#EN-00031]
function _T() {
    const T = (typeof window !== 'undefined' && window.THREE) || null;
    if (!T) throw new Error('[BowModelBuilder] window.THREE not yet defined — call after engine boot');
    return T;
}

// Cache for the generated bow stave texture so we don't recreate it on every mesh load [REF#EN-00032]
let _sharedBowTexture = null;

/** [REF#EN-00033]
 * Repeating crimson-and-gold bow stave texture.
 * 2048x128 strip: deep red base + per-pixel noise + gold tip wraps + black
 * grip with gold accent bands. Returns a CanvasTexture with RepeatWrapping.
 */
export function createBowTexture() {
    if (typeof window !== 'undefined' && window._sharedBowTexture) {
        return window._sharedBowTexture;
    }
    if (_sharedBowTexture) return _sharedBowTexture;
    const T = _T();
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#b31b1b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20;
        imgData.data[i]     += noise;
        imgData.data[i + 1] += noise;
        imgData.data[i + 2] += noise;
    }
    ctx.putImageData(imgData, 0, 0);

    const w = canvas.width;
    const colorBlack = '#1a1a1a';
    const colorGold  = '#d4af37';
    const drawBand = (startX, width, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(startX, 0, width, canvas.height);
    };

    drawBand(w * 0.00, w * 0.08, colorGold);
    drawBand(w * 0.92, w * 0.08, colorGold);
    drawBand(w * 0.35, w * 0.02, colorGold);
    drawBand(w * 0.37, w * 0.05, colorBlack);
    drawBand(w * 0.42, w * 0.16, colorBlack);
    drawBand(w * 0.58, w * 0.05, colorBlack);
    drawBand(w * 0.63, w * 0.02, colorGold);

    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = T.RepeatWrapping;
    texture.wrapT = T.RepeatWrapping;
    _sharedBowTexture = texture;
    if (typeof window !== 'undefined') {
        window._sharedBowTexture = texture;
    }
    return _sharedBowTexture;
}

/** [REF#EN-00034]
 * Build the canonical recurve bow as a THREE.Group.
 *
 * @param {Object} opts
 * @param {number} opts.scale       Uniform scale applied to the group (default 1.0)
 * @param {boolean} opts.drawn      true=string drawn back with arrow nocked (default true);
 *                                  false=string at rest, no arrow (post-release pose)
 * @param {boolean} opts.includeArrow  default true; only honored when drawn=true
 * @param {boolean} opts.showcase   apply the showcase rotation (-π/4 z, -π/5 y) so the
 *                                  bow reads as a 3/4-profile silhouette. Default true.
 * @returns {{group, parts, dispose}}
 *          group:  THREE.Group to add to your scene
 *          parts:  { stave, topTip, bottomTip, stringTop, stringBottom, arrow?, nockPoint }
 *                  exposed so caller can animate (draw the string, fire the arrow)
 *          dispose: tear down all geometries + materials when removing
 */
export function buildBow(opts = {}) {
    const T = _T();
    const {
        scale = 1.0,
        drawn = true,
        includeArrow = true,
        showcase = true,
        cardName = "",
    } = opts;

    const isSamurai = String(cardName).toUpperCase().includes("SAMURAI");

    const bowGroup = new T.Group();
    const disposables = [];

    const targetGroup = showcase ? new T.Group() : bowGroup;
    if (showcase) {
        targetGroup.position.set(-3.2, 0, -1.0);
        bowGroup.add(targetGroup);
    }

    // ── Recurve curve. 7 control points: tips BENT BACK 50% toward archer ── [REF#EN-00035]
    const curvePoints = [
        new T.Vector3(-4.5, -10.5, -1.5),
        new T.Vector3(-1.5,  -8.5,  0.5),
        new T.Vector3( 0.5,  -5.0,  2.5),
        new T.Vector3( 1.5,   0.0,  3.5),
        new T.Vector3( 0.5,   5.0,  2.5),
        new T.Vector3(-1.5,   8.5,  0.5),
        new T.Vector3(-4.5,  10.5, -1.5),
    ];
    const bowCurve = new T.CatmullRomCurve3(curvePoints);

    // Stave [REF#EN-00036]
    const tubeGeometry = new T.TubeGeometry(bowCurve, 200, 0.385, 32, false);
    const bowTexture = createBowTexture();
    const bowMaterial = isSamurai
        ? new T.MeshStandardMaterial({
            color: 0x8b0000, map: bowTexture, roughness: 0.15, metalness: 0.8, name: 'bow_stave',
          })
        : new T.MeshStandardMaterial({
            map: bowTexture, roughness: 0.6, metalness: 0.1, name: 'bow_stave',
          });
    const stave = new T.Mesh(tubeGeometry, bowMaterial);
    stave.castShadow = true;
    stave.receiveShadow = true;
    targetGroup.add(stave);
    disposables.push(tubeGeometry, bowMaterial, bowTexture);

    // Tips — gold cones, tangent-oriented [REF#EN-00037]
    const tipMaterial = new T.MeshStandardMaterial({
        color: 0xd4af37, roughness: isSamurai ? 0.1 : 0.4, metalness: isSamurai ? 0.9 : 0.6, name: 'bow_tip',
    });
    disposables.push(tipMaterial);

    const bottomTipGeo = new T.ConeGeometry(0.385, 1.5, 16);
    bottomTipGeo.translate(0, 0.75, 0);
    const bottomTip = new T.Mesh(bottomTipGeo, tipMaterial);
    bottomTip.position.copy(curvePoints[0]);
    const tangentBottom = bowCurve.getTangent(0).negate();
    bottomTip.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tangentBottom);
    targetGroup.add(bottomTip);
    disposables.push(bottomTipGeo);

    const topTipGeo = new T.ConeGeometry(0.385, 1.5, 16);
    topTipGeo.translate(0, 0.75, 0);
    const topTip = new T.Mesh(topTipGeo, tipMaterial);
    topTip.position.copy(curvePoints[6]);
    const tangentTop = bowCurve.getTangent(1);
    topTip.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tangentTop);
    targetGroup.add(topTip);
    disposables.push(topTipGeo);

    // Bowstring [REF#EN-00038]
    const stringMat = isSamurai
        ? new T.MeshStandardMaterial({
            color: 0xffaa00, emissive: 0xff5500, emissiveIntensity: 1.2, roughness: 0.1, name: 'bow_string',
          })
        : new T.MeshStandardMaterial({
            color: 0x222222, roughness: 0.9, name: 'bow_string',
          });
    disposables.push(stringMat);

    const stringTopStart = curvePoints[6].clone().add(tangentTop.clone().multiplyScalar(0.2));
    const stringBotStart = curvePoints[0].clone().add(tangentBottom.clone().multiplyScalar(0.2));

    const nockPoint = drawn
        ? new T.Vector3(-6, 0, 3.5)
        : new T.Vector3().addVectors(stringTopStart, stringBotStart).multiplyScalar(0.5);

    const makeStringSegment = (startVec, endVec) => {
        const len = startVec.distanceTo(endVec);
        const geo = new T.CylinderGeometry(0.044, 0.044, len, 8);
        const mesh = new T.Mesh(geo, stringMat);
        mesh.position.copy(new T.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5));
        mesh.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            endVec.clone().sub(startVec).normalize()
        );
        disposables.push(geo);
        return mesh;
    };

    const stringTop = makeStringSegment(stringTopStart, nockPoint);
    const stringBottom = makeStringSegment(stringBotStart, nockPoint);
    targetGroup.add(stringTop);
    targetGroup.add(stringBottom);

    // Arrow [REF#EN-00039]
    let arrow = null;
    if (drawn && includeArrow) {
        const arrowGroup = new T.Group();
        const shaftLength = 18;

        const shaftGeo = new T.CylinderGeometry(0.088, 0.088, shaftLength, 8);
        const shaftColor = isSamurai ? 0x8b0000 : 0x5c4033;
        const shaftMat = new T.MeshStandardMaterial({
            color: shaftColor, roughness: 0.9, name: 'arrow_shaft',
        });
        const shaft = new T.Mesh(shaftGeo, shaftMat);
        shaft.rotation.z = -Math.PI / 2;
        disposables.push(shaftGeo, shaftMat);

        const headGeo = new T.ConeGeometry(0.22, 0.8, 4);
        const headMat = new T.MeshStandardMaterial({
            color: isSamurai ? 0xd4af37 : 0x888888, metalness: 0.9, roughness: 0.2, name: 'arrow_head',
            emissive: isSamurai ? 0xff4500 : 0x000000, emissiveIntensity: isSamurai ? 2.0 : 0.0
        });
        const head = new T.Mesh(headGeo, headMat);
        head.position.y = shaftLength / 2 + 0.4;
        shaft.add(head);
        disposables.push(headGeo, headMat);

        const fletchGeo = new T.BoxGeometry(0.022, 2.0, 0.5);
        fletchGeo.translate(0, 0, 0.25);
        const pos = fletchGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            pos.setY(i, pos.getY(i) - z * 2.0);
        }
        fletchGeo.computeVertexNormals();
        const fletchColor = isSamurai ? 0xb31b1b : 0xcccccc;
        const fletchMat = new T.MeshStandardMaterial({
            color: fletchColor, name: 'arrow_fletch',
        });
        disposables.push(fletchGeo, fletchMat);
        for (let i = 0; i < 3; i++) {
            const fletch = new T.Mesh(fletchGeo, fletchMat);
            fletch.position.set(0, -shaftLength / 2 + 1.2, 0);
            fletch.rotation.y = (i * Math.PI * 2) / 3;
            shaft.add(fletch);
        }

        arrowGroup.add(shaft);
        arrowGroup.position.set(nockPoint.x + shaftLength / 2, nockPoint.y, nockPoint.z);
        targetGroup.add(arrowGroup);
        arrow = arrowGroup;
    }

    if (showcase) {
        bowGroup.rotation.set(0, 0, 0);
    }
    if (scale !== 1.0) bowGroup.scale.setScalar(scale);

    return {
        group: bowGroup,
        parts: { stave, topTip, bottomTip, stringTop, stringBottom, arrow, nockPoint },
        dispose() {
            for (const d of disposables) {
                if (d && typeof d.dispose === 'function') {
                    try { d.dispose(); } catch (_) {}
                }
            }
        },
    };
}

/** [REF#EN-00040]
 * Convenience wrapper sized for a 3D card-icon slot (Panels playing card
 * or LootCardBuilder icon). Raw bow ~22u tall; card slots want ~1.5u.
 */
export function buildBowIcon(opts = {}) {
    return buildBow({ scale: 0.075, drawn: true, includeArrow: true, showcase: true, ...opts });
}

/** [REF#EN-00041]
 * Convenience wrapper for FPV first-person hand-rig pose.
 * Smaller scale, no showcase rotation (FPV mount handles its own anchoring).
 */
export function buildBowFPV(opts = {}) {
    return buildBow({ scale: 0.03, drawn: true, includeArrow: true, showcase: false, ...opts });
}

export default buildBow;

// UMD-style window side-effect so non-module callers (Panels.html inline [REF#EN-00042]
// scripts, Engine9.html) can use the same factory without an import.
if (typeof window !== 'undefined') {
    window.OrigamiBow = window.OrigamiBow || {};
    window.OrigamiBow.buildBow = buildBow;
    window.OrigamiBow.buildBowIcon = buildBowIcon;
    window.OrigamiBow.buildBowFPV = buildBowFPV;
    window.OrigamiBow.createBowTexture = createBowTexture;
}
