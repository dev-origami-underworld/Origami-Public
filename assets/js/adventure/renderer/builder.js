import { Assets } from "../core/assets.js";
import { Models } from "./models.js";

/**
 * Scene Builder
 * Converts Dungeon Data (JSON) into Three.js Meshes.
 */

export class SceneBuilder {
  constructor(renderEngine) {
    this.engine = renderEngine;
    this.materials = null;
  }

  initMaterials() {
      if (this.materials) return;
      
      // Materials (Baseline)
      // Materials (Cinematic / Realistic)
      const wallMat = new THREE.MeshStandardMaterial({ 
          color: 0xe0e0e0, // Slightly darker than pure white
          roughness: 0.85, // Matte paper/stone
          metalness: 0.0, 
          envMapIntensity: 0.2, 
          map: Assets.createDungeonWallTexture() 
      });
      
      const floorMat = new THREE.MeshStandardMaterial({ 
          roughness: 0.9, // Matte floor
          metalness: 0.0, 
          map: Assets.createDungeonFloorTexture() 
      });
      
      const ceilMat = new THREE.MeshStandardMaterial({ 
          color: 0x3d2e20, // Dark wood
          roughness: 0.7, 
          metalness: 0.1, 
          map: Assets.makeCastleRaftersTexture(),
          bumpMap: Assets.makeNoiseBump(),
          bumpScale: 0.05
      });

      this.materials = {
        floor: floorMat,
        wall: wallMat,
        ceiling: ceilMat,
        door: new THREE.MeshStandardMaterial({ color: 0x8B4513 })
      };
  }

  buildLevel(levelData) {
    this.initMaterials();
    console.log(`[SceneBuilder] Building Level: ${levelData.id}`);
    
    const rooms = Object.values(levelData.rooms);
    const TILE_SIZE = 1.25;
    
    // Build tile map
    const tileMap = new Map();
    rooms.forEach(room => {
        const key = `${room.x},${room.z}`;
        tileMap.set(key, { room, hasTile: true });
    });
    
    console.log(`[SceneBuilder] Total tiles: ${tileMap.size}`);
    
    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    tileMap.forEach((data, key) => {
      const [x, z] = key.split(',').map(Number);
      const worldX = x * TILE_SIZE;
      const worldZ = z * TILE_SIZE;
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minZ = Math.min(minZ, worldZ);
      maxZ = Math.max(maxZ, worldZ);
    });
    
    this.engine.dungeonBounds = {
      minX: minX - TILE_SIZE,
      maxX: maxX + TILE_SIZE,
      minZ: minZ - TILE_SIZE,
      maxZ: maxZ + TILE_SIZE,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2
    };
    
    // Create meshes
    const tileCount = tileMap.size;
    const floorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const wallGeo = new THREE.BoxGeometry(TILE_SIZE, 2.0, TILE_SIZE);
    
    const floorMesh = new THREE.InstancedMesh(floorGeo, this.materials.floor, tileCount);
    const ceilMesh = new THREE.InstancedMesh(floorGeo, this.materials.ceiling, tileCount);
    const wallMesh = new THREE.InstancedMesh(wallGeo, this.materials.wall, tileCount * 4);
    
    const dummy = new THREE.Object3D();
    let tileIndex = 0;
    let wallIndex = 0;
    const halfTile = TILE_SIZE * 0.5;
    
    tileMap.forEach((data, key) => {
      const [gridX, gridZ] = key.split(',').map(Number);
      const x = gridX * TILE_SIZE;
      const z = gridZ * TILE_SIZE;
      
      // Floor
      dummy.position.set(x, 0, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      floorMesh.setMatrixAt(tileIndex, dummy.matrix);
      
      // Ceiling
      dummy.position.set(x, 2.0, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      ceilMesh.setMatrixAt(tileIndex, dummy.matrix);
      
      tileIndex++;
      
      // Walls
      const checkWall = (dx, dz, wallX, wallZ, rotation) => {
        const neighborKey = `${gridX + dx},${gridZ + dz}`;
        const neighbor = tileMap.get(neighborKey);
        
        // If no neighbor, OR neighbor is a secret door (which looks like a wall)
        if (!neighbor || (neighbor.room.type === 'secret_door' && !neighbor.room.discovered)) {
          dummy.rotation.set(0, rotation, 0);
          dummy.position.set(wallX, 1.0, wallZ);
          dummy.updateMatrix();
          wallMesh.setMatrixAt(wallIndex++, dummy.matrix);
          
          this.engine.addPhysicsBody(dummy, `wall_${key}_${dx}_${dz}`,
            new CANNON.Box(new CANNON.Vec3(halfTile, 1.0, halfTile)), 0);
        }
      };
      
      checkWall(0, -1, x, z - halfTile, 0);           
      checkWall(0, 1, x, z + halfTile, 0);            
      checkWall(1, 0, x + halfTile, z, Math.PI / 2); 
      checkWall(-1, 0, x - halfTile, z, Math.PI / 2); 
    });
    
    wallMesh.count = wallIndex;
    
    this.engine.scene.add(floorMesh);
    this.engine.scene.add(ceilMesh);
    this.engine.scene.add(wallMesh);
    
    // Build props for ALL rooms (since every tile is a room now)
    rooms.forEach(room => {
      const x = room.worldX;
      const z = room.worldZ;
      this.buildProps(room, x, z);
    });
    
    if (typeof this.engine.updateMapCameraBounds === 'function') {
        this.engine.updateMapCameraBounds();
    }
  }

  buildProps(room, x, z) {
    // Room Label - REMOVED per user request ("remove the text for ceiling in fpv view")
    /*
    if (room.title) {
        const label = Models.createFloatingLabel(room.title);
        label.position.set(x, 3, z);
        this.engine.addChunk(label, `label_${room.id}`);
    }
    */

    // Items
    if (room.items) {
      room.items.forEach((item, i) => {
        const mesh = Models.createItemMesh(item.type);
        mesh.position.set(x + (item.x || 0), 0.5, z + (item.z || 0));
        this.engine.addChunk(mesh, `item_${room.id}_${i}`);
      });
    }

    // Monsters
    if (room.monsters) {
      room.monsters.forEach((mob, i) => {
        const mesh = Models.createMonsterMesh(mob.state === 'HOSTILE');
        mesh.position.set(x + (mob.x || 0), 0.4, z + (mob.z || 0)); 
        mesh.layers.enable(1); // Enable Rim Light Layer
        
        const gameId = `mob_${room.id}_${i}`;
        mob.gameId = gameId; 
        
        this.engine.addChunk(mesh, gameId);
        
        this.engine.addPhysicsBody(mesh, gameId, new CANNON.Box(new CANNON.Vec3(0.4, 0.9, 0.4)), 0);
      });
    }
  }
}
