(function (global) {
  // --- Constants ---
  const TILE_SIZE = 2;
  const FLOOR_THICKNESS = TILE_SIZE * 0.12;
  const WALL_HEIGHT = TILE_SIZE * 1.2; // Increased by 20%
  const PILLAR_HEIGHT = WALL_HEIGHT * 1.2;
  const PILLAR_RADIUS = TILE_SIZE * 0.21;
  const TORCH_HEIGHT = TILE_SIZE * 0.75;
  const TORCH_RADIUS_BOTTOM = TILE_SIZE * 0.055;
  const TORCH_RADIUS_TOP = TILE_SIZE * 0.12;

  const TILE = {
    WALL: "wall",
    FLOOR: "floor",
    ENTRANCE: "entrance",
    EXIT: "exit",
    VOID: "void",
  };

  // --- Helper Functions ---

  function cssVar(name, fallback) {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(
        name
      );
      return value?.trim() || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function makePaperTexture(baseColor) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    // Use the provided base color (beige for floor)
    const base = baseColor || "#e0d5c1";
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Very subtle fiber noise (darker for beige)
    for (let i = 0; i < 1200; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const length = 8 + Math.random() * 16;
      const angle = Math.random() * Math.PI * 2;
      const alpha = 0.01 + Math.random() * 0.02;
      ctx.strokeStyle = `rgba(180,160,140,${alpha})`;
      ctx.lineWidth = Math.random() * 0.8 + 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    // Very subtle grain (darker for beige)
    for (let i = 0; i < 1500; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const alpha = Math.random() * 0.02;
      ctx.fillStyle = `rgba(160, 140, 120, ${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Extremely subtle vignette (warmer for beige)
    const vignette = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) * 0.4,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) * 0.7
    );
    vignette.addColorStop(0, "rgba(240,230,220,0)");
    vignette.addColorStop(1, "rgba(200,180,160,0.12)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.repeat.set(1, 1);
    return texture;
  }

  function createDojoWallTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const paper = "#f5f5f0";
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 250; i += 1) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const a = Math.random() * 0.06;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const wood = "#6b4f2a";
    const vSpacing = 128;
    const hSpacing = 128;
    const bar = 8;
    ctx.fillStyle = wood;

    for (let x = 0; x <= 512; x += vSpacing) {
      ctx.fillRect(Math.max(0, x - bar / 2), 0, bar, 512);
    }
    for (let y = 0; y <= 512; y += hSpacing) {
      ctx.fillRect(0, Math.max(0, y - bar / 2), 512, bar);
    }

    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, "rgba(255,255,255,0.04)");
    gradient.addColorStop(1, "rgba(0,0,0,0.04)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  function createMaterialPalette() {
    const floorColor = new THREE.Color(0xe0d5c1); // Beige Clay floor
    const paperWhite = new THREE.Color("#ffffff");
    const wallColor = new THREE.Color("#f7f7f7");
    const accentColor = new THREE.Color(cssVar("--accent", "#1f4b99"));
    const plateColor = new THREE.Color(cssVar("--bg-main", "#0d1117"));
    const detailColor = accentColor.clone().lerp(floorColor, 0.5);
    const env = 0.95;

    const voidColor = floorColor.clone().multiplyScalar(0.92);
    const wallPlainColor = wallColor.clone().lerp(plateColor, 0.12);

    return {
      floor: new THREE.MeshStandardMaterial({
        color: floorColor,
        roughness: 0.88,
        metalness: 0.04,
        flatShading: false,
      }),
      wall: new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.28,
        metalness: 0.08,
        envMapIntensity: env,
        flatShading: false,
      }),
      wallPlain: new THREE.MeshPhysicalMaterial({
        color: wallPlainColor,
        roughness: 0.35,
        metalness: 0.04,
        reflectivity: 0.15,
        clearcoat: 0.2,
        clearcoatRoughness: 0.6,
        envMapIntensity: env * 0.6,
      }),
      voidTop: new THREE.MeshPhysicalMaterial({
        color: voidColor,
        roughness: 0.58,
        metalness: 0.05,
        reflectivity: 0.08,
        envMapIntensity: env * 0.4,
      }),
      detail: new THREE.MeshStandardMaterial({
        color: detailColor,
        emissive: detailColor.clone().multiplyScalar(0.2),
        emissiveIntensity: 0.9,
        roughness: 0.38,
        metalness: 0.12,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor.clone().multiplyScalar(0.32),
        emissiveIntensity: 1,
        roughness: 0.3,
        metalness: 0.2,
        toneMapped: true,
      }),
      plate: new THREE.MeshPhysicalMaterial({
        color: plateColor,
        roughness: 0.72,
        metalness: 0.05,
        reflectivity: 0.12,
        envMapIntensity: 0.6,
      }),
    };
  }

  function ensureWhiteReflectiveMaterial(material, isGoblin = false) {
    if (!material) return material;
    if (material.userData?.whiteReflectiveApplied) return material;

    if (material.isMeshBasicMaterial || material.isLineBasicMaterial) {
      const converted = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.05,
        roughness: 0.08,
        reflectivity: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.2,
      });
      converted.transparent = material.transparent ?? false;
      converted.opacity = material.opacity ?? 1;
      converted.side = material.side ?? THREE.FrontSide;
      converted.depthWrite = material.depthWrite ?? true;
      converted.depthTest = material.depthTest ?? true;
      converted.toneMapped = material.toneMapped ?? true;
      converted.alphaTest = material.alphaTest ?? 0;
      converted.blending = material.blending ?? THREE.NormalBlending;
      converted.premultipliedAlpha = material.premultipliedAlpha ?? false;
      converted.map = material.map || null;
      converted.alphaMap = material.alphaMap || null;
      converted.needsUpdate = true;
      converted.userData = {
        ...(material.userData || {}),
        whiteReflectiveApplied: true,
      };
      return converted;
    }

    material.color?.set?.(0xffffff);
    if ("emissive" in material && material.emissive?.set) {
      material.emissive.set(0xffffff);
      material.emissiveIntensity = isGoblin ? 0.06 : 0.12;
    }
    if ("metalness" in material) material.metalness = isGoblin ? 0.02 : 0.05;
    if ("roughness" in material) material.roughness = isGoblin ? 0.12 : 0.08;
    if ("reflectivity" in material) material.reflectivity = isGoblin ? 0.5 : 1;
    if ("envMapIntensity" in material)
      material.envMapIntensity = isGoblin ? 0.6 : 1.2;
    if ("clearcoat" in material) material.clearcoat = isGoblin ? 0.5 : 1;
    if ("clearcoatRoughness" in material)
      material.clearcoatRoughness = isGoblin ? 0.08 : 0.04;

    material.userData = {
      ...(material.userData || {}),
      whiteReflectiveApplied: true,
    };
    material.needsUpdate = true;
    return material;
  }

  function createStairsModel(isEntrance = true) {
    const stairsGroup = new THREE.Group();
    const stepMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
    });
    const stepDepth = TILE_SIZE * 0.8;
    const stepWidth = TILE_SIZE * 0.8;
    const stepHeight = 0.2;
    const numSteps = 5;

    for (let i = 0; i < numSteps; i += 1) {
      const stepGeo = new THREE.BoxGeometry(
        stepWidth,
        stepHeight,
        stepDepth / numSteps
      );
      const step = new THREE.Mesh(stepGeo, stepMaterial);
      const yPos = isEntrance ? i * stepHeight : -i * stepHeight;
      const zPos =
        i * (stepDepth / numSteps) - stepDepth / 2 + stepDepth / numSteps / 2;
      step.position.set(0, yPos, zPos);
      stairsGroup.add(step);
    }
    return stairsGroup;
  }

  function applyWhiteMaterials(root) {
    if (!root || typeof root.traverse !== "function") return;
    const isGoblin = root.userData?.isGoblin || false;
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (node.userData?.preventWhiteWash) return;
      if (node.userData?.whiteReflectiveApplied) return;
      if (Array.isArray(node.material)) {
        node.material = node.material.map((mat) =>
          ensureWhiteReflectiveMaterial(mat, isGoblin)
        );
      } else if (node.material) {
        node.material = ensureWhiteReflectiveMaterial(node.material, isGoblin);
      }
      node.userData = {
        ...(node.userData || {}),
        whiteReflectiveApplied: true,
      };
    });
  }

  // --- Main Renderer Class ---

  class OrigamiRenderer {
    constructor() {
      this.loader = new THREE.GLTFLoader();
      this.loader.setCrossOrigin?.("anonymous");
    }

    createScene(dungeonData, settings = {}) {
      const mergedSettings = {
        MAP_COLS: settings.MAP_COLS ?? 40,
        MAP_ROWS: settings.MAP_ROWS ?? 40,
      };
      const scene = new THREE.Scene();
      // Default to Washi Paper Light for the "Origami" aesthetic
      const backgroundColor = new THREE.Color(cssVar("--bg-main", "#f5f1e8"));
      scene.background = backgroundColor;
      scene.fog = new THREE.FogExp2(backgroundColor, 0.012);

      // --- Lights ---
      const ambient = new THREE.AmbientLight(0xfefeff, 0.8);
      scene.add(ambient);

      const hemi = new THREE.HemisphereLight(0xf7faff, 0x06080f, 0.6);
      hemi.position.set(0, 1, 0);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xf6d7ad, 2.5);
      sun.position.set(28, 46, 24);
      sun.castShadow = true; // Enabled for cinematic shadows
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 150;
      sun.shadow.camera.left = -50;
      sun.shadow.camera.right = 50;
      sun.shadow.camera.top = 50;
      sun.shadow.camera.bottom = -50;
      sun.shadow.bias = -0.0005;
      scene.add(sun);

      const fill = new THREE.PointLight(0xfff2d5, 0.18, 200, 2.2);
      fill.position.set(-34, 24, -28);
      scene.add(fill);

      // Floor Wash Lights
      const halfBoardWidth = (mergedSettings.MAP_COLS * TILE_SIZE) / 2;
      const halfBoardDepth = (mergedSettings.MAP_ROWS * TILE_SIZE) / 2;
      const floorWashHeight = FLOOR_THICKNESS + TILE_SIZE * 0.55;
      const washDistance = Math.max(halfBoardWidth, halfBoardDepth) * 1.4;
      const floorWashPositions = [
        { x: -halfBoardWidth * 0.35, z: -halfBoardDepth * 0.25 },
        { x: halfBoardWidth * 0.45, z: halfBoardDepth * 0.35 },
      ];
      floorWashPositions.forEach((pos, index) => {
        const wash = new THREE.PointLight(0x567fb0, 0.18, washDistance, 1.65);
        wash.position.set(pos.x, floorWashHeight, pos.z);
        wash.name = `floorWash${index + 1}`;
        scene.add(wash);
      });

      // --- Groups ---
      const tilesGroup = new THREE.Group();
      tilesGroup.name = "Tiles";
      const wallsGroup = new THREE.Group();
      wallsGroup.name = "Walls";
      const tokensGroup = new THREE.Group();
      tokensGroup.name = "Tokens";

      // Handle empty grid gracefully
      if (!dungeonData.grid || dungeonData.grid.length === 0) {
        return {
          scene,
          tilesGroup,
          wallsGroup,
          tokensGroup,
          wallMeshes: [],
          dynamicLights: [],
          materials: createMaterialPalette(),
        };
      }
      scene.add(tilesGroup, wallsGroup, tokensGroup);

      // --- Build Geometry ---
      const mats = createMaterialPalette();
      const floorGeo = new THREE.BoxGeometry(
        TILE_SIZE * 0.94,
        FLOOR_THICKNESS,
        TILE_SIZE * 0.94
      );

      // Rounded Wall Geometry (Extrude)
      const wallShape = new THREE.Shape();
      const wSize = TILE_SIZE * 0.96;
      const wHalf = wSize / 2;
      wallShape.moveTo(-wHalf, -wHalf);
      wallShape.lineTo(wHalf, -wHalf);
      wallShape.lineTo(wHalf, wHalf);
      wallShape.lineTo(-wHalf, wHalf);
      wallShape.lineTo(-wHalf, -wHalf);

      const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
        depth: WALL_HEIGHT,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 3,
      });
      // Center the geometry
      wallGeo.center();
      // Rotate to stand upright (Extrude is along Z, we want Y up)
      wallGeo.rotateX(Math.PI / 2);
      // Fix position (center() moves it to 0,0,0, but we want base at 0?)
      // Actually center() centers the bounding box.
      // Box height is WALL_HEIGHT + 2*bevelThickness.
      // We want the bottom to be at 0 relative to the mesh position.
      wallGeo.translate(0, WALL_HEIGHT / 2, 0);

      const pillarGeo = new THREE.CylinderGeometry(
        PILLAR_RADIUS,
        PILLAR_RADIUS,
        PILLAR_HEIGHT,
        18
      );
      const torchGeo = new THREE.CylinderGeometry(
        TORCH_RADIUS_BOTTOM,
        TORCH_RADIUS_TOP,
        TORCH_HEIGHT,
        12
      );

      // Base Plate
      const boardWidth = mergedSettings.MAP_COLS * TILE_SIZE;
      const boardDepth = mergedSettings.MAP_ROWS * TILE_SIZE;
      const baseThickness = 0.32;
      const basePlate = new THREE.Mesh(
        new THREE.BoxGeometry(
          boardWidth + TILE_SIZE * 1.4,
          baseThickness,
          boardDepth + TILE_SIZE * 1.4
        ),
        mats.plate
      );
      basePlate.position.set(0, -(baseThickness / 2 + 0.02), 0);
      basePlate.receiveShadow = true;
      basePlate.userData = { preventWhiteWash: true };
      tilesGroup.add(basePlate);

      // --- Instancing Setup ---
      const grid = dungeonData.grid;
      const halfCols = mergedSettings.MAP_COLS / 2;
      const halfRows = mergedSettings.MAP_ROWS / 2;

      // Helper to check if a tile is part of a room (not hallway, not wall)
      const isRoomTile = (tile) =>
        tile &&
        tile.type !== TILE.WALL &&
        !tile.hallway &&
        tile.type !== TILE.ENTRANCE;

      const hasRoomNeighbor = (rowIndex, colIndex) => {
        const deltas = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1], // Diagonals included
        ];
        for (const [dx, dz] of deltas) {
          const row = grid[rowIndex + dz];
          if (row) {
            const neighbor = row[colIndex + dx];
            if (isRoomTile(neighbor)) return true;
          }
        }
        return false;
      };

      // 1. Count instances (Floor only)
      let floorCount = 0;
      grid.forEach((row) => {
        row.forEach((tile) => {
          if (
            tile &&
            (tile.type === TILE.FLOOR ||
              tile.type === TILE.ENTRANCE ||
              tile.type === TILE.EXIT)
          ) {
            floorCount++;
          }
        });
      });

      // 2. Create InstancedMeshes (Floor only)
      const createInstanced = (geo, mat, count, group) => {
        if (count === 0) return null;
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        group.add(mesh);
        return mesh;
      };

      const floorInst = createInstanced(
        floorGeo,
        mats.floor,
        floorCount,
        tilesGroup
      );

      // 3. Populate Instances & Create Individual Walls
      const dummy = new THREE.Object3D();
      let fIdx = 0;
      const dynamicLights = [];
      const wallMeshes = []; // Track for transparency

      grid.forEach((row, rowIndex) => {
        row.forEach((tile, colIndex) => {
          if (!tile) return; // Skip null tiles

          const worldX = (colIndex - halfCols) * TILE_SIZE + TILE_SIZE / 2;
          const worldZ = (rowIndex - halfRows) * TILE_SIZE + TILE_SIZE / 2;

          // Floor
          if (
            (tile.type === TILE.FLOOR ||
              tile.type === TILE.ENTRANCE ||
              tile.type === TILE.EXIT) &&
            floorInst
          ) {
            dummy.position.set(worldX, FLOOR_THICKNESS / 2, worldZ);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            floorInst.setMatrixAt(fIdx++, dummy.matrix);
          }

          // Walls (Individual Meshes for Transparency)
          if (tile.type === TILE.WALL) {
            // Use Dojo texture if next to a room (including diagonals)
            const isTextured = hasRoomNeighbor(rowIndex, colIndex);
            const mat = isTextured ? mats.wall : mats.wallPlain;

            // Clone material for transparency support if needed,
            // but for now share it. We will clone on demand or use a shared transparent one.
            // Actually, to support "90% translucent", we need `transparent: true`.
            // If we set it on the shared material, ALL walls become transparent.
            // So we must clone the material for the mesh if we want to toggle it individually.
            // For performance, we'll assign the shared material initially,
            // and swap to a transparent clone when obstructing.

            const wallMesh = new THREE.Mesh(wallGeo, mat);
            wallMesh.position.set(
              worldX,
              FLOOR_THICKNESS, // Base at floor level (geometry is shifted up)
              worldZ
            );
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            wallMesh.userData = {
              isWall: true,
              originalMat: mat,
              gridPos: { x: colIndex, y: rowIndex },
            };
            wallsGroup.add(wallMesh);
            wallMeshes.push(wallMesh);
          }

          // Stairs (Keep as individual meshes)
          if (tile.type === TILE.ENTRANCE || tile.type === TILE.EXIT) {
            const stairs = createStairsModel(tile.type === TILE.ENTRANCE);
            stairs.position.set(worldX, FLOOR_THICKNESS, worldZ);
            if (tile.type === TILE.EXIT) {
              stairs.rotation.y = Math.PI / 2; // Rotated -90 from Math.PI
            }
            if (tile.type === TILE.ENTRANCE) {
              stairs.rotation.y = Math.PI; // Rotated -90 from -Math.PI/2
            }
            tilesGroup.add(stairs);
          }
        });
      });

      return {
        scene,
        tilesGroup,
        wallsGroup,
        tokensGroup,
        wallMeshes, // Export for raycasting
        dynamicLights,
        materials: mats,
      };
    }

    applyWhiteReflectiveMaterials(root) {
      applyWhiteMaterials(root);
    }

    animateDynamicLights(lights, delta) {
      if (!Array.isArray(lights) || !lights.length) return;
      lights.forEach((light) => {
        if (!light.visible) {
          return;
        }
        const state = light.userData || (light.userData = {});
        state.flicker = (state.flicker || 0) + delta * 7 + Math.random() * 0.5;
        const intensityBase = light.userData?.secondary ? 0.28 : 0.78;
        const intensityRange = light.userData?.secondary ? 0.12 : 0.25;
        light.intensity =
          intensityBase + Math.sin(state.flicker) * intensityRange;
        if (!light.userData?.secondary) {
          light.position.y += Math.sin(state.flicker * 1.7) * 0.015;
        }
      });
    }
  }

  global.OrigamiRenderer = OrigamiRenderer;
})(window);
