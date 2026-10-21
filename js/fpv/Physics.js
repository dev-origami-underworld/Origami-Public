// Global THREE is loaded via CDN in NewOrigami.FPV.1.html
import { CardDatabase } from './CardRegistry.js';
import { CombatSystem } from './Combat.js';

export class PhysicsSystem {
    constructor(engine) {
        this.engine = engine;
        this.activeProjectiles = [];
    }

    executeCardAction(actionKey) {
        const fxData = CardDatabase[actionKey].fx;
        if (!fxData) return;
        
        // MELEE ACTION
        if (fxData.type === 'melee') {
            if (this.engine.activeTarget && this.engine.activeTarget.userData.type === 'enemy') {
                this.engine.activeTarget.userData.stateColor = fxData.weaponColor || '#ff0000';
                this.engine.triggerCombatSequence(this.engine.activeTarget);
                const now = performance.now();
                if (!this.engine.lastAttackTime || (now - this.engine.lastAttackTime > 600)) {
                    this.engine.lastAttackTime = now;
                    this.engine.postToAI({
                      type: "COMBAT_ATTACK",
                      id: this.engine.activeTarget.userData.id,
                      dealer: "player",
                      weapon: "KATANA", // Can be updated to use action data
                      damageMod: actionKey === "HARD ATTACK" ? 0.5 : 0,
                    });
                }
            }
            return;
        }
        
        // PROJECTILE ACTION
        if (fxData.type === 'projectile') {
            const spawnX = this.engine.player.x * this.engine.gridSize;
            const spawnZ = this.engine.player.z * this.engine.gridSize;
            const spawnY = fxData.yOffset || 0.5;
            const dirX = Math.sin(this.engine.player.rot);
            const dirZ = Math.cos(this.engine.player.rot);

            let geo;
            if (fxData.geometry === 'dodecahedron') {
                geo = new THREE.DodecahedronGeometry(fxData.size || 0.8, 0); 
            } else if (fxData.geometry === 'sphere') {
                geo = new THREE.SphereGeometry(fxData.size || 0.8, 16, 16);
            } else if (fxData.geometry === 'box') {
                geo = new THREE.BoxGeometry(fxData.size.x || 1, fxData.size.y || 1, fxData.size.z || 1);
            }

            const mat = new THREE.MeshStandardMaterial({ 
                color: fxData.color || 0x5C4033, 
                roughness: fxData.roughness || 0.8, 
                flatShading: true,
                metalness: fxData.metalness || 0.1,
                emissive: fxData.emissive || 0x000000,
                emissiveIntensity: fxData.emissiveIntensity || 0,
                transparent: fxData.transparent || false,
                opacity: fxData.opacity || 1.0
            });
            
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(spawnX + (dirX * 1.5), spawnY, spawnZ + (dirZ * 1.5));
            mesh.rotation.y = this.engine.player.rot;
            
            this.engine.scene.add(mesh);
            
            this.activeProjectiles.push({
                mesh: mesh,
                dirX: dirX,
                dirZ: dirZ,
                speed: fxData.speed || 16.0,
                damage: fxData.damage || 50,
                roll: fxData.roll || false,
                pierce: fxData.pierce || false
            });
        }
    }

    tick(delta) {
        // Update Projectiles (Boulder Roll, Fireball, etc.)
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const proj = this.activeProjectiles[i];
            
            // Velocity calculation
            const moveX = proj.dirX * proj.speed * delta;
            const moveZ = proj.dirZ * proj.speed * delta;
            proj.mesh.position.x += moveX;
            proj.mesh.position.z += moveZ;
            
            // Physical tumbling animation if specified
            if (proj.roll) {
                const rollRot = (proj.speed * delta) / 0.8; 
                proj.mesh.rotateX(-rollRot);
            }
            
            // 1. Check Wall Collision (isValidGridSpace)
            const gridX = Math.round(proj.mesh.position.x / this.engine.gridSize);
            const gridZ = Math.round(proj.mesh.position.z / this.engine.gridSize);
            if (!this.engine.isValidGridSpace(gridX, gridZ)) {
                this.engine.scene.remove(proj.mesh);
                if (proj.mesh.geometry) proj.mesh.geometry.dispose();
                if (proj.mesh.material) proj.mesh.material.dispose();
                this.activeProjectiles.splice(i, 1);
                // Future expansion: spawn particle explosion here based on proj type
                continue;
            }
            
            // 2. Check Entity Collision
            let hitSomething = false;
            if (this.engine.worldGroup) {
                for (const child of this.engine.worldGroup.children) {
                    if (child.userData && child.userData.id) {
                        const eX = child.position.x;
                        const eZ = child.position.z;
                        // Checking proximity radius of ~1.2 units against center mass
                        if (Math.hypot(proj.mesh.position.x - eX, proj.mesh.position.z - eZ) < 1.2) {
                            // Hit confirmed!
                            CombatSystem.spawnCombatText(proj.damage.toString(), "crit", child.position.x, 2, child.position.z);
                            // The AI expects 1 damage per request (HP=2), so sending two kills anything.
                            this.engine.postToAI({ type: 'PLAYER_ATTACK', targetId: child.userData.id });
                            this.engine.postToAI({ type: 'PLAYER_ATTACK', targetId: child.userData.id });
                            hitSomething = true;
                            break; // Target hit, break child loop
                        }
                    }
                }
            }
            
            if (hitSomething && !proj.pierce) {
                this.engine.scene.remove(proj.mesh);
                if (proj.mesh.geometry) proj.mesh.geometry.dispose();
                if (proj.mesh.material) proj.mesh.material.dispose();
                this.activeProjectiles.splice(i, 1);
            }
        }
    }
}
