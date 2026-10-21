/**
 * Model Generators
 * Creates 3D meshes for monsters, items, and UI elements.
 */

import { Assets } from "../core/assets.js";

export const Models = {
  createMonsterMesh: (isHostile) => {
    const group = new THREE.Group();
    group.userData.isMonster = true;
    
    // --- 1. Map Token (Layer 2) ---
    const mapGroup = new THREE.Group();
    mapGroup.layers.set(2); // Only visible to Map Camera
    
    const radius = 0.4;
    const border = 0.05;
    
    // Base Circle
    // Idle: Green, Hostile: Red
    const color = isHostile ? 0xff0000 : 0x00ff00; 
    const baseGeo = new THREE.CircleGeometry(radius, 32);
    // Use BasicMaterial with depthTest: false to ensure it renders on top of floor
    const baseMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, depthTest: false });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = 0.02;
    baseMesh.layers.set(2);
    mapGroup.add(baseMesh);
    
    // White Border Ring
    const ringGeo = new THREE.RingGeometry(radius, radius + border, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.021; 
    ringMesh.layers.set(2);
    mapGroup.add(ringMesh);
    
    // Indicator Light for Map Visibility (Restored per user request)
    const indLight = new THREE.PointLight(0xffffff, 1.0, 2.0);
    indLight.position.set(0, 0.5, 0);
    indLight.layers.set(2);
    mapGroup.add(indLight);
    
    // Direction Indicator
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0.15);
    triShape.lineTo(0.1, -0.1);
    triShape.lineTo(-0.1, -0.1);
    triShape.lineTo(0, 0.15);
    const triGeo = new THREE.ShapeGeometry(triShape);
    const triMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const triMesh = new THREE.Mesh(triGeo, triMat);
    triMesh.rotation.x = -Math.PI / 2;
    triMesh.rotation.z = Math.PI; 
    triMesh.position.set(0, 0.022, 0.3); 
    triMesh.layers.set(2);
    mapGroup.add(triMesh);
    
    // Scale Map Token Down (Tiny)
    mapGroup.scale.set(0.125, 0.125, 0.125);
    group.add(mapGroup);

    // --- 2. FPV Model (Layer 1) ---
    const fpvGroup = new THREE.Group();
    fpvGroup.layers.set(1); // Only visible to FPV Camera
    
    // Floor Circle Indicator (in FPV) - Solid, non-reflective
    const fpvCircleGeo = new THREE.CircleGeometry(0.35, 32);
    const fpvCircleColor = isHostile ? 0xff4444 : 0x44ff44;
    const fpvCircleMat = new THREE.MeshBasicMaterial({ 
        color: fpvCircleColor, 
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
    });
    const fpvCircle = new THREE.Mesh(fpvCircleGeo, fpvCircleMat);
    fpvCircle.rotation.x = -Math.PI / 2;
    fpvCircle.position.y = 0.01;
    fpvCircle.layers.set(1);
    fpvGroup.add(fpvCircle);
    
    // White Border Ring for FPV circle
    const fpvRingGeo = new THREE.RingGeometry(0.35, 0.40, 32);
    const fpvRingMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        side: THREE.DoubleSide,
        transparent: false
    });
    const fpvRing = new THREE.Mesh(fpvRingGeo, fpvRingMat);
    fpvRing.rotation.x = -Math.PI / 2;
    fpvRing.position.y = 0.011;
    fpvRing.layers.set(1);
    fpvGroup.add(fpvRing);
    
    const modelKey = isHostile ? 'goblin' : 'imp';
    const gltf = Assets.getModel(modelKey);
    
    if (gltf) {
        const model = gltf.scene.clone();
        
        // Scale normalization (Normal Size for FPV)
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = 0.8 / size.y; // Target 0.8 height (Larger, more imposing)
        model.scale.set(scale, scale, scale);
        
        model.position.y = 0.05;
        model.rotation.y = -Math.PI / 2; 
        
        // Ensure all children are on Layer 1
        model.traverse((child) => {
            child.layers.set(1);
        });
        
        fpvGroup.add(model);
        
        // Animation Mixer
        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const clips = {};
            gltf.animations.forEach(clip => {
                clips[clip.name.toLowerCase()] = clip;
            });
            
            const playAction = (name, loop = THREE.LoopRepeat) => {
                const clip = clips[name] || gltf.animations[0];
                const action = mixer.clipAction(clip);
                action.setLoop(loop);
                action.reset().play();
                return action;
            };
            
            const idleClip = clips['idle'] || gltf.animations[0];
            const action = mixer.clipAction(idleClip);
            action.play();
            
            group.userData.mixer = mixer;
            group.userData.actions = {
                attack: () => playAction('chop', THREE.LoopOnce),
                hit: () => playAction('wave', THREE.LoopOnce),
                die: () => {
                    const act = playAction('fall', THREE.LoopOnce);
                    act.clampWhenFinished = true;
                },
                walk: () => playAction('walk', THREE.LoopRepeat),
                idle: () => playAction('idle', THREE.LoopRepeat)
            };
        }
    } else {
        // Fallback
        const geo = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 0.5;
        mesh.layers.set(1);
        fpvGroup.add(mesh);
    }
    
    group.add(fpvGroup);
    
    return group;
  },

  createItemMesh: (type) => {
    const group = new THREE.Group();
    
    // Materials
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x44ff44, transparent: true, opacity: 0.8, roughness: 0.1 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc });

    // Normalize input
    const modelId = type;

    if (modelId === 'swordA' || type === 'weapon') {
        // Katana-ish
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.01), steelMat);
        blade.position.y = 0.35;
        group.add(blade);
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), goldMat);
        guard.position.y = 0.05;
        guard.rotation.x = Math.PI/2;
        group.add(guard);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15), woodMat);
        handle.position.y = -0.05;
        group.add(handle);
        
        group.rotation.z = Math.PI / 6;
        group.position.y = 0.2;
    } 
    else if (modelId === 'daggerA') {
        // Tanto
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.01), steelMat);
        blade.position.y = 0.15;
        group.add(blade);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1), woodMat);
        handle.position.y = -0.05;
        group.add(handle);
        group.rotation.z = Math.PI / 4;
        group.position.y = 0.1;
    }
    else if (modelId === 'potionA' || type === 'consumable') {
        // Potion
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), glassMat);
        bottle.position.y = 0.1;
        group.add(bottle);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05), glassMat);
        neck.position.y = 0.22;
        group.add(neck);
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03), woodMat);
        cork.position.y = 0.25;
        group.add(cork);
    }
    else if (modelId === 'scrollA' || type === 'scroll') {
        // Scroll
        const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16);
        const mesh = new THREE.Mesh(geo, paperMat);
        mesh.rotation.z = Math.PI / 2;
        mesh.position.y = 0.05;
        group.add(mesh);
    }
    else if (modelId === 'coinPouch' || type === 'currency') {
        // Gold/Pouch
        const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), woodMat);
        pouch.scale.y = 0.8;
        pouch.position.y = 0.1;
        group.add(pouch);
        const string = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 4, 12), goldMat);
        string.position.y = 0.18;
        string.rotation.x = Math.PI/2;
        group.add(string);
    }
    else {
        // Generic Box
        const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const mesh = new THREE.Mesh(geo, woodMat);
        mesh.position.y = 0.15;
        group.add(mesh);
    }
    
    // Floating animation helper
    group.userData.floatOffset = Math.random() * Math.PI * 2;
    
    return group;
  },

  createWallTexture: () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#e8e4dc'; // Paper color
    ctx.fillRect(0, 0, 64, 64);
    
    // Vertical Lines (Reduced by 50%)
    ctx.strokeStyle = '#d6d2ca';
    ctx.lineWidth = 1;
    for (let i = 0; i < 64; i += 16) { // Increased spacing from 8 to 16
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 64);
        ctx.stroke();
    }
    
    // Noise
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * 64;
        const y = Math.random() * 64;
        ctx.fillStyle = Math.random() > 0.5 ? '#d6d2ca' : '#f0ece4';
        ctx.fillRect(x, y, 2, 2);
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  },

  createFloorTexture: (label) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Wood/Tatami Background
    ctx.fillStyle = '#5d4037'; // Dark wood
    ctx.fillRect(0, 0, 64, 64);
    
    // Panel lines
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 60);
    
    // Grain
    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 1;
    for(let i=10; i<64; i+=10) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(64, i);
        ctx.stroke();
    }
    
    // Label (H or R) - Small dark gray transparent bottom right
    if (label) {
        ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, 60, 60);
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  },
  
  createCeilingTexture: () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Dark Rafters
    ctx.fillStyle = '#2c1e1a';
    ctx.fillRect(0, 0, 64, 64);
    
    // Beams
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(10, 0, 10, 64);
    ctx.fillRect(44, 0, 10, 64);
    ctx.fillRect(0, 30, 64, 4);
    
    // NO TEXT HERE - Confirmed removal
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true; // Force update
    return tex;
  },

  createWallMesh: () => {
    const geometry = new THREE.BoxGeometry(1, 0.8, 0.1); // Reduced height to 0.8
    const material = new THREE.MeshStandardMaterial({ 
        map: Models.createWallTexture(),
        roughness: 0.9,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  },

  createFloorMesh: (type) => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const label = type === 'hall' ? 'H' : 'R';
    const material = new THREE.MeshStandardMaterial({ 
        map: Models.createFloorTexture(label),
        roughness: 0.8,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  },

  createFloatingLabel: (text, color = '#ffffff') => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.font = 'bold 32px sans-serif';
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0,0,0,0.8)';
    context.shadowBlur = 4;
    context.fillText(text, 128, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 1, 1); // Aspect ratio
    
    return sprite;
  },

  createPlayerMesh: () => {
      const group = new THREE.Group();
      group.userData.isPlayer = true;
      
      // Scale the entire group down by 8x (User request: "reduce size of player model in mapviw by 800%")
      // 100% / 8 = 12.5% = 0.125
      group.scale.set(0.125, 0.125, 0.125);
      
      // 1. Floor Circle (Solid Green - Same size as monsters)
      const circleGeo = new THREE.CircleGeometry(0.35, 32);
      const circleMat = new THREE.MeshBasicMaterial({ 
          color: 0x48bb78, // Solid green (matching Gamble button)
          transparent: false, 
          side: THREE.DoubleSide,
          depthWrite: true
      });
      const floorCircle = new THREE.Mesh(circleGeo, circleMat);
      floorCircle.rotation.x = -Math.PI/2;
      floorCircle.position.y = 0.01;
      group.add(floorCircle);
      
      // White Border Ring (same as monsters)
      const ringGeo = new THREE.RingGeometry(0.35, 0.40, 32);
      const ringMat = new THREE.MeshBasicMaterial({ 
          color: 0xffffff, 
          transparent: false,
          side: THREE.DoubleSide 
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI/2; 
      ring.position.y = 0.011; 
      group.add(ring);
      
      // Removed PointLight to restore FPS
      
      // 2. Direction Indicator (White Triangle)
      const triShape = new THREE.Shape();
      triShape.moveTo(0.13, 0); triShape.lineTo(-0.06, 0.10); triShape.lineTo(-0.06, -0.10); triShape.lineTo(0.13, 0);
      const triGeo = new THREE.ShapeGeometry(triShape);
      const triMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const tri = new THREE.Mesh(triGeo, triMat);
      tri.rotation.x = -Math.PI/2;
      tri.position.set(0.18, 0.025, 0);
      group.add(tri);
      
      // 3. 3D Model
      const gltf = Assets.getModel('player');
      if (gltf) {
          const model = gltf.scene.clone();
          
          // Scale logic: Group is now scaled to 0.125. 
          // We want the model to be ~0.5 units tall inside the group.
          // Resetting internal scale to 0.2 (normal relative size).
          model.scale.setScalar(0.2); 
          
          // Grounding logic
          const box = new THREE.Box3().setFromObject(model);
          const lowestPoint = box.min.y;
          const groundOffset = 0.02;
          model.position.y = groundOffset - lowestPoint;
          
          // Rotation Override (180 flip)
          model.rotation.y = Math.PI; 
          
          group.add(model);
          
          // Animation
          if (gltf.animations && gltf.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(model);
              const clip = gltf.animations[0]; // Walk cycle
              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopRepeat);
              // Don't play by default, let engine toggle it
              action.stop();
              
              group.userData.mixer = mixer;
              group.userData.action = action;
              group.userData.walkClipDuration = clip.duration;
          }
      } else {
          // Fallback Cone
          const geo = new THREE.ConeGeometry(0.3, 0.8, 16);
          const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.y = 0.4;
          mesh.rotation.x = Math.PI / 2;
          group.add(mesh);
      }
      
      return group;
  }
};
