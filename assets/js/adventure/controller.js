import { createAdventureStore } from "./state.js";
import { createAdventureUI } from "./ui.js";
import { createAudioEngine } from "./audio.js";
import { createRoomService } from "./rooms.js";
import { createHostBridge } from "./host.js";
import { DungeonMaster } from "./core/dungeon_master.js";
import { RenderEngine } from "./renderer/engine.js";
import { SceneBuilder } from "./renderer/builder.js";
import { Assets } from "./core/assets.js";

export function createAdventureController() {
  const store = createAdventureStore();
  const audio = createAudioEngine();
  const ui = createAdventureUI(store);
  const rooms = createRoomService(store);
  const host = createHostBridge(store, ui, rooms);
  
  // Initialize Core Systems
  const dm = new DungeonMaster(store, ui);
  const renderer = new RenderEngine();
  const builder = new SceneBuilder(renderer);

  let isBooted = false;

  async function boot() {
    if (isBooted) return;
    isBooted = true;

    ui.init();
    host.bindListeners();
    
    // Bind Flashlight Button
    const flashlightBtn = document.getElementById('util-flashlight');
    if (flashlightBtn) {
        flashlightBtn.addEventListener('click', () => {
            renderer.toggleFlashlight();
            // Toggle active state visual
            flashlightBtn.classList.toggle('text-amber-500');
            flashlightBtn.classList.toggle('bg-amber-50');
        });
    }
    
    // Preload Assets
    await Assets.preload();
    
    // Initialize 3D Renderer
    renderer.init("fpv-content-wrapper", "map-content-wrapper");

    // Initialize Game via Dungeon Master
    try {
        await dm.init();
        
        // Build 3D Scene from generated level
        if (dm.currentLevel) {
            builder.buildLevel(dm.currentLevel);
            
            // Set initial player position
            const startRoom = dm.currentLevel.rooms[dm.currentLevel.startRoomId];
            if (startRoom) {
                const sx = startRoom.worldX || 0;
                const sz = startRoom.worldZ || 0;
                renderer.updatePlayer(sx, sz, 0);
            }
        }
        
        // Wire up rotation tracking for FOV checks
        renderer.onRotationUpdate = (rotation) => {
            dm.store.state.rotation = rotation;
        };
        
        // Bind Command Listener
        ui.onCommand((cmd) => handleCommand(cmd));
        
        // Setup Input
        setupInput();
        
        // Listen for Room Changes to update 3D position
        const originalEnterRoom = dm.enterRoom.bind(dm);
        dm.enterRoom = (roomId) => {
            originalEnterRoom(roomId);
            // Only update position if we are NOT already there (to avoid loop)
            // But usually enterRoom is called by logic, so we should snap?
            // If we walked there, we don't want to snap back to center.
            // So maybe only snap if far away?
            // For now, let's trust the player movement if it triggered the room change.
        };

        // Listen for Item Taken
        const originalTriggerEvent = dm.triggerEvent.bind(dm);
        dm.triggerEvent = (eventName, data) => {
            originalTriggerEvent(eventName, data);
            
            if (eventName === "item_taken") {
                const meshId = `item_${data.roomId}_${data.itemIndex}`;
                renderer.removeChunk(meshId);
            } else if (eventName === "lantern_taken") {
                renderer.toggleFlashlight();
            }
        };
        
    } catch (e) {
        console.error("Failed to boot dungeon:", e);
        ui.logHTML("<p style='color:red'>Error loading dungeon core.</p>");
    }
  }

  // Input State
  const keys = {
      w: { held: false, time: 0 },
      a: { held: false, time: 0 },
      s: { held: false, time: 0 },
      d: { held: false, time: 0 }
  };
  
  const TAP_THRESHOLD = 200; // ms
  const SPEED = 5.0; // Turbo speed
  
  let gameMode = 'TURN_BASED';
  let lastActivityTime = Date.now();
  
  function setupInput() {
      // Keyboard Input
      window.addEventListener('keydown', (e) => {
          // Guard: Don't trigger if typing in an input
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

          const key = mapKey(e.key);
          if (key) {
              // Immediate Rotation on KeyDown
              if (key === 'a' || key === 'd') {
                  if (!keys[key].held) { 
                      handleTap(key);
                      keys[key].held = true;
                  }
                  return;
              }
              
              if (keys[key] && !keys[key].held) {
                  keys[key].held = true;
                  keys[key].time = Date.now();
              }
              
              // Activity Update
              lastActivityTime = Date.now();
          }
      });
      
      window.addEventListener('keyup', (e) => {
          const key = mapKey(e.key);
          if (key && keys[key]) {
              const duration = Date.now() - keys[key].time;
              keys[key].held = false;
              
              // Movement Tap (W/S)
              if ((key === 'w' || key === 's') && duration < TAP_THRESHOLD) {
                  handleTap(key);
              } else if (key === 'w' || key === 's') {
                  snapToGrid();
              }
              
              // Stop Physics
              renderer.setPlayerVelocity(0, 0);
              lastActivityTime = Date.now();
          }
      });

      // D-Pad Input
      setupDPad();
  }

  function mapKey(key) {
      key = key.toLowerCase();
      if (['w', 'arrowup', '8'].includes(key)) return 'w';
      if (['s', 'arrowdown', '2'].includes(key)) return 's';
      if (['a', 'arrowleft', '4'].includes(key)) return 'a';
      if (['d', 'arrowright', '6'].includes(key)) return 'd';
      if (key === ' ') return 'space';
      return key;
  }

  function setupDPad() {
      const bindBtn = (id, key) => {
          const btn = document.getElementById(id);
          if (!btn) return;
          
          const start = () => {
              if (keys[key] && !keys[key].held) {
                  keys[key].held = true;
                  keys[key].time = Date.now();
                  lastActivityTime = Date.now();
              }
          };
          
          const end = () => {
              if (keys[key]) {
                  const duration = Date.now() - keys[key].time;
                  keys[key].held = false;
                  if (duration < TAP_THRESHOLD) handleTap(key);
                  else snapToGrid();
                  renderer.setPlayerVelocity(0, 0);
                  lastActivityTime = Date.now();
              }
          };

          btn.addEventListener('mousedown', start);
          btn.addEventListener('mouseup', end);
          btn.addEventListener('mouseleave', end);
          
          // Touch support
          btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
          btn.addEventListener('touchend', (e) => { e.preventDefault(); end(); }, { passive: false });
      };

      bindBtn('btn-up', 'w');
      bindBtn('btn-down', 's');
      bindBtn('btn-left', 'a');
      bindBtn('btn-right', 'd');
  }
  
  function handleTap(key) {
      const state = renderer.getPlayerState();
      lastActivityTime = Date.now();
      
      // Rotation (A/D) - Instant
      if (key === 'a') {
          rotatePlayer(Math.PI / 2); // Turn Left
          return;
      }
      if (key === 'd') {
          rotatePlayer(-Math.PI / 2); // Turn Right
          return;
      }
      
      // Movement (W/S) - Smooth Step
      const fwd = new THREE.Vector3();
      renderer.fpvCamera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      
      const step = new THREE.Vector3();
      
      // Grid-based movement: Snap to cardinal axis closest to camera direction
      if (Math.abs(fwd.x) > Math.abs(fwd.z)) {
          fwd.x = Math.sign(fwd.x); fwd.z = 0;
      } else {
          fwd.x = 0; fwd.z = Math.sign(fwd.z);
      }
      
      if (key === 'w') step.copy(fwd);
      if (key === 's') step.copy(fwd).negate();
      
      if (step.lengthSq() > 0) {
          // Set Move Target to adjacent tile (Smooth Move)
          const target = state.position.clone().add(step);
          // Round to nearest integer to ensure grid snap
          target.x = Math.round(target.x);
          target.z = Math.round(target.z);
          
          moveTarget = target;
          
          // Note: We do NOT use createPlayerBody here, we let onUpdate drive the physics body
      }
  }
  
  function rotatePlayer(angle) {
      // Smooth Rotation
      if (renderer.rotatePlayerSmooth) {
          renderer.rotatePlayerSmooth(angle);
      } else {
          // Fallback
          const currentRot = renderer.fpvCamera.rotation.y;
          const targetRot = currentRot + angle;
          const snappedRot = Math.round(targetRot / (Math.PI / 2)) * (Math.PI / 2);
          const pos = renderer.fpvCamera.position;
          renderer.updatePlayer(pos.x, pos.z, snappedRot);
      }
  }
  
  function snapToGrid() {
      const state = renderer.getPlayerState();
      const x = Math.round(state.position.x);
      const z = Math.round(state.position.z);
      // renderer.createPlayerBody(x, z); // User request: "remove player model"
      renderer.updatePlayer(x, z, renderer.fpvCamera.rotation.y);
  }
  
  // Smart Move State
  let moveTarget = null;
  
  function setupClickToMove() {
      window.addEventListener('click', (e) => {
          // Ignore clicks on UI elements
          if (e.target.closest('.panel-header') || e.target.closest('.icon-btn') || e.target.closest('#adventure-panel') || e.target.closest('#dpad-overlay')) return;
          
          const hit = renderer.getHitPoint(e.clientX, e.clientY);
          if (hit) {
              // Delegate to DM for smart pathfinding
              dm.handleFloorClick(hit);
              lastActivityTime = Date.now();
          }
      });
      
      // Listen for Engine Events from DM
      window.addEventListener("origami:engine", (e) => {
          const { type, data } = e.detail;
          
          if (type === "show_path") {
              // Convert grid points to World Vector3
              const points = data.points.map(p => new THREE.Vector3(p.x, 0.1, p.z));
              renderer.showPath(points);
          } else if (type === "start_autowalk") {
              // Start following path
              const points = data.path.map(p => new THREE.Vector3(p.x, 0, p.z));
              startPathMovement(points);
          } else if (type === "stop_autowalk") {
              moveTarget = null;
              currentPath = null;
              renderer.setPlayerVelocity(0, 0);
          }
      });
  }
  
  let currentPath = null;
  let pathIndex = 0;
  
  function startPathMovement(points) {
      if (!points || points.length === 0) return;
      currentPath = points;
      pathIndex = 0;
      moveTarget = currentPath[0]; // Start with first point
  }
  
  setupClickToMove();

  // Game Loop (Real-Time)
  renderer.onUpdate = (dt) => {
      let vx = 0;
      let vz = 0;
      
      // Check Mode Timeout (Increased to 30s to prevent thrashing)
      if (gameMode === 'REAL_TIME' && Date.now() - lastActivityTime > 30000) {
          gameMode = 'TURN_BASED';
          console.log("[Controller] Reverting to TURN_BASED mode (Timeout)");
      }
      
      // Update Renderer Mode for Debug
      renderer.gameMode = gameMode;
      
      // Check Held Keys
      const state = renderer.getPlayerState();
      const fwd = new THREE.Vector3();
      const right = new THREE.Vector3();
      renderer.fpvCamera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      
      let isMoving = false;
      
      if (keys.w.held && Date.now() - keys.w.time > TAP_THRESHOLD) { vx += fwd.x; vz += fwd.z; isMoving = true; }
      if (keys.s.held && Date.now() - keys.s.time > TAP_THRESHOLD) { vx -= fwd.x; vz -= fwd.z; isMoving = true; }
      
      if (isMoving) {
          // Turbo Charge -> Real Time
          if (gameMode !== 'REAL_TIME') {
              gameMode = 'REAL_TIME';
              console.log("[Controller] Turbo Charge! Switching to REAL_TIME mode");
          }
          lastActivityTime = Date.now();
          
          moveTarget = null; // Cancel smart move if manual input
          if (renderer.clearPath) renderer.clearPath();
          
          const len = Math.sqrt(vx*vx + vz*vz);
          if (len > 0) {
              vx = (vx / len) * SPEED;
              vz = (vz / len) * SPEED;
          }
          renderer.setPlayerVelocity(vx, vz);
      } else if (moveTarget) {
          // Smart Move Logic
          const state = renderer.getPlayerState();
          const dx = moveTarget.x - state.position.x;
          const dz = moveTarget.z - state.position.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          
          if (dist > 0.1) {
              vx = (dx / dist) * SPEED;
              vz = (dz / dist) * SPEED;
              renderer.setPlayerVelocity(vx, vz);
          } else {
              // Reached Target
              if (currentPath && pathIndex < currentPath.length - 1) {
                  // Next Point
                  pathIndex++;
                  moveTarget = currentPath[pathIndex];
              } else {
                  // Done
                  moveTarget = null;
                  currentPath = null;
                  if (renderer.clearPath) renderer.clearPath();
                  
                  renderer.setPlayerVelocity(0, 0);
                  snapToGrid();
              }
          }
      } else {
          renderer.setPlayerVelocity(0, 0);
      }
      
      // Room Detection
      if (dm.currentLevel) {
          const px = state.position.x;
          const pz = state.position.z;
          const currentRoomId = store.state.player.currentRoomId;
          
          for (const room of Object.values(dm.currentLevel.rooms)) {
              if (px >= room.worldX - 0.5 && px <= room.worldX + 0.5 &&
                  pz >= room.worldZ - 0.5 && pz <= room.worldZ + 0.5) {
                  
                  if (room.id !== currentRoomId) {
                      dm.enterRoom(room.id);
                  }
                  break;
              }
          }
      }
      
      // Update Player Position from Physics
      if (renderer.playerBody) {
          renderer.updatePlayer(renderer.playerBody.position.x, renderer.playerBody.position.z, renderer.fpvCamera.rotation.y);
      } else {
          // console.warn("[Controller] No Player Body!");
      }
      
      // Update Monsters
      // Condition: Real-Time Mode OR Player is Moving (Turn-Based Step)
      const shouldUpdateMonsters = (gameMode === 'REAL_TIME') || isMoving || (moveTarget !== null);
      
      if (shouldUpdateMonsters) {
          const room = dm.store.state.currentRoom;
          if (room && room.monsters) {
              room.monsters.forEach(mob => {
                  if (mob.gameId) {
                      let mvx = 0;
                      let mvz = 0;
                      
                      if (mob.state === 'HOSTILE') {
                             const pPos = renderer.fpvCamera.position;
                             const mPos = renderer.getBodyPosition(mob.gameId);
                             
                             if (mPos) {
                                 const dx = pPos.x - mPos.x;
                                 const dz = pPos.z - mPos.z;
                                 const dist = Math.sqrt(dx*dx + dz*dz);
                                 
                                 if (dist > 1.5) {
                                     const speed = 2.0;
                                     mvx = (dx / dist) * speed;
                                     mvz = (dz / dist) * speed;
                                 }
                             }
                      }
                      renderer.setBodyVelocity(mob.gameId, mvx, mvz);
                  }
              });
          }
      } else {
          // Stop Monsters if not updating
          const room = dm.store.state.currentRoom;
          if (room && room.monsters) {
              room.monsters.forEach(mob => {
                  if (mob.gameId) renderer.setBodyVelocity(mob.gameId, 0, 0);
              });
          }
      }
  };
  
  // setupInput(); // Removed duplicate call

  async function handleCommand(raw) {
    audio.init();
    // Delegate command handling to Dungeon Master
    const parts = raw.toLowerCase().split(' ');
    const verb = parts[0];
    
    if (verb === 'attack' || verb === 'dig' || verb === 'look') {
        const state = renderer.getPlayerState();
        const range = verb === 'dig' ? 3 : 10; // Dig/Melee vs Ranged/Look
        
        const hit = renderer.raycast(state.position, state.direction, range);
        
        if (hit) {
            if (verb === 'look') {
                dm.handleLook(hit);
            } else {
                dm.handleInteraction(verb, hit);
            }
        } else {
            if (verb === 'look') {
                ui.logHTML("<p>You see nothing special.</p>");
            } else {
                ui.logHTML(`<p>You ${verb} at the air.</p>`);
            }
        }
    } else if (verb === 'go') {
        // Auto-walk logic
        const dir = parts[1];
        const currentRoom = store.state.currentRoom;
        
        if (currentRoom && currentRoom.exits && currentRoom.exits[dir]) {
            console.log(`[Controller] Auto-walking ${dir}`);
            
            // Calculate Path
            const path = [];
            let curr = currentRoom;
            let nextId = curr.exits[dir];
            
            // Add current position as start? No, path is future points.
            
            while (nextId) {
                const nextRoom = dm.currentLevel.rooms[nextId];
                if (!nextRoom) break;
                
                path.push(new THREE.Vector3(nextRoom.worldX, 0.1, nextRoom.worldZ));
                
                // Check for Intersection (More than 2 exits = intersection, usually)
                // Or if it's a room (not hallway)
                // Or if direction changes? (Hallways usually straight)
                // If we are just following 'dir', we continue if 'dir' exit exists.
                // But if there are side exits, we should stop to let user decide.
                if (Object.keys(nextRoom.exits).length > 2) {
                    break; // Stop at intersection
                }
                
                // Check if next room continues in same direction
                if (!nextRoom.exits[dir]) {
                    break; // End of line
                }
                
                nextId = nextRoom.exits[dir];
                curr = nextRoom;
            }
            
            if (path.length > 0) {
                // Set Move Target to the LAST point
                moveTarget = path[path.length - 1];
                
                // Visualize Path
                if (renderer.showPath) {
                    renderer.showPath(path);
                }
            } else {
                 dm.handleCommand(raw); // Fallback (e.g. single step)
            }
        } else {
            dm.handleCommand(raw);
        }
    } else {
        dm.handleCommand(raw);
    }
  }

  return {
    boot,
    store,
    dm 
  };
}
