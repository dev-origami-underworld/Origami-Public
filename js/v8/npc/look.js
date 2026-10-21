/* look.js: how a special NPC's model is painted, once, for both places it appears.
 * Guide: knowledge/design/SPECIAL_NPC_TEMPLATE.md · Nemesis values and their source lines: knowledge/design/NEMESIS_MODEL_AND_MATERIALS.md
 *
 * The world body (engine buildMonsterEntity) and the side-panel portrait (Panels.html) each carry their own copy of the same
 * ~15-line material recipe today. This module is that recipe as data plus two small appliers, so a spec's `look` block drives both.
 * It uses duck typing only (no THREE import), so it runs under node with fake materials. It sets no onBeforeCompile and carries no
 * shader code: the shared silhouette rim stays the engine's own patch.
 */

export const NULL_MAPS = Object.freeze(['emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap', 'alphaMap']);
export const FLAT_PBR = Object.freeze({ metalness: 0, roughness: 1, reflectivity: 0, specularIntensity: 0, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0 });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Drops the PBR maps, flattens the PBR scalars and removes reflections. The base-colour atlas is kept. Returns the material. */
export function flattenMaterial(mat, material = {}) {
  for (const key of (material.nullMaps || NULL_MAPS)) if (mat[key]) mat[key] = null;
  const pbr = Object.assign({}, FLAT_PBR, material.pbr);
  for (const key of Object.keys(pbr)) if (key in mat) mat[key] = pbr[key];
  if ('envMap' in mat) mat.envMap = null;
  if ('specularMap' in mat) mat.specularMap = null;
  return mat;
}

/** Body colour and the dark emissive lift. */
export function paintMaterial(mat, material = {}) {
  if (material.bodyRGB && mat.color && mat.color.setRGB) mat.color.setRGB(material.bodyRGB[0], material.bodyRGB[1], material.bodyRGB[2]);
  if (material.emissiveRGB && mat.emissive && mat.emissive.setRGB) {
    mat.emissive.setRGB(material.emissiveRGB[0], material.emissiveRGB[1], material.emissiveRGB[2]);
    if ('emissiveIntensity' in mat && isNum(material.emissiveIntensity)) mat.emissiveIntensity = Math.max(0, material.emissiveIntensity);
  }
  return mat;
}

export function makeOpaque(mat) {
  mat.transparent = false;
  mat.opacity = 1;
  mat.depthWrite = true;
  return mat;
}

/**
 * Paints every mesh under `root`. context is 'world' or 'panel'.
 *  world: clones materials per actor, sets shadows, layers and frustum flags from the spec.
 *  panel: mutates the loaded instance in place and applies the optional name-matched eye override from look.eyes.panel.
 * Returns { meshes, materials, eyes }.
 */
export function applyLook(root, look, context) {
  const material = (look && look.material) || {};
  const stats = { meshes: 0, materials: 0, eyes: 0 };
  const eye = context === 'panel' && look && look.eyes && look.eyes.panel ? look.eyes.panel : null;
  const eyeRe = eye && eye.match ? new RegExp(eye.match, 'i') : null;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    stats.meshes += 1;
    if (context === 'world' && material.cloneMaterials !== false) {
      child.material = Array.isArray(child.material) ? child.material.map((m) => (m && m.clone ? m.clone() : m)) : (child.material.clone ? child.material.clone() : child.material);
    }
    if (isNum(material.renderOrder)) child.renderOrder = material.renderOrder;
    if (context === 'world') {
      const sh = look.shadows || {};
      child.castShadow = sh.cast === true;
      child.receiveShadow = sh.receive !== false;
      child.frustumCulled = false;
      if (child.layers && typeof child.layers.enable === 'function') for (const layer of (look.worldLayers || [5, 3])) child.layers.enable(layer);
    }
    for (const mat of (Array.isArray(child.material) ? child.material : [child.material])) {
      if (!mat) continue;
      stats.materials += 1;
      flattenMaterial(mat, material);
      if (material.opaque !== false) makeOpaque(mat);
      paintMaterial(mat, material);
      if (eyeRe && (eyeRe.test(child.name || '') || eyeRe.test(mat.name || ''))) {
        if (eye.color && mat.color && mat.color.setRGB) mat.color.setRGB(eye.color[0], eye.color[1], eye.color[2]);
        if (eye.emissive && mat.emissive && mat.emissive.setRGB) {
          mat.emissive.setRGB(eye.emissive[0], eye.emissive[1], eye.emissive[2]);
          if ('emissiveIntensity' in mat && isNum(eye.intensity)) mat.emissiveIntensity = eye.intensity;
        }
        stats.eyes += 1;
      }
      mat.needsUpdate = true;
    }
  });
  return stats;
}

/** Scale factor that brings a measured box to the portrait height (1 when the box is unusable). box = { min:{y}, max:{y} }. */
export function portraitScale(box, look) {
  const height = box && box.max && box.min ? box.max.y - box.min.y : NaN;
  const target = look && look.model && isNum(look.model.portraitHeight) ? Math.max(0.5, look.model.portraitHeight) : NaN;
  return isNum(height) && height > 1e-4 && isNum(target) ? target / height : 1;
}

/** Position deltas that centre a scaled box on x/z and stand its feet at portraitFrame.feetY. */
export function portraitShift(framedBox, look) {
  const feetY = look && look.model && look.model.portraitFrame && isNum(look.model.portraitFrame.feetY) ? look.model.portraitFrame.feetY : -0.72;
  return {
    x: -(framedBox.min.x + framedBox.max.x) * 0.5,
    y: feetY - framedBox.min.y,
    z: -(framedBox.min.z + framedBox.max.z) * 0.5,
  };
}
