
import { Textures } from "../renderer/textures.js";
import { Models } from "../renderer/models.js";

/**
 * Asset Manager
 * Centralized system for loading and managing game assets (Textures, Models, Audio).
 * Supports caching and asynchronous loading.
 */
export class AssetManager {
  constructor() {
    this.textures = new Map();
    this.models = new Map();
    this.audio = new Map();
    
    this.loadingManager = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.gltfLoader = new THREE.GLTFLoader(this.loadingManager);
    
    this.setupLoadingManager();
  }

  setupLoadingManager() {
    this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
      console.log(`[AssetManager] Started loading: ${url}`);
    };
    
    this.loadingManager.onLoad = () => {
      console.log('[AssetManager] All assets loaded.');
    };
    
    this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      console.log(`[AssetManager] Loading: ${itemsLoaded} / ${itemsTotal}`);
    };
    
    this.loadingManager.onError = (url) => {
      console.error(`[AssetManager] Error loading: ${url}`);
    };
  }

  /**
   * Preloads essential assets.
   */
  async preload() {
    console.log("[AssetManager] Preloading assets...");
    
    // Generate Procedural Textures and Cache them
    // Generate Procedural Textures and Cache them
    this.textures.set('floor', Textures.createDungeonFloorTexture());
    this.textures.set('wall', Textures.createDojoWallTexture());
    // Force new texture generation
    this.textures.set('ceiling', Textures.makeCastleRaftersTexture());
    
    // Preload Models
    // Preload Models
    const MODELS = {
        PLAYER: './assets/models/player/Player.A.Walking.glb',
        GOBLIN: './assets/models/monster/goblin/Yakuza.Goblin.Animated.glb',
        IMP: './assets/models/monster/imp/Yakuza.Imp.glb',
        LANTERN: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF/Lantern.gltf'
    };

    try {
        for (const [id, url] of Object.entries(MODELS)) {
            await this.loadGLTF(id.toLowerCase(), url);
        }
    } catch (e) {
        console.warn("[AssetManager] Failed to preload models:", e);
    }
    
    return Promise.resolve();
  }

  loadTexture(id, url) {
    return new Promise((resolve, reject) => {
      if (this.textures.has(id)) {
        resolve(this.textures.get(id));
        return;
      }
      
      this.textureLoader.load(
        url,
        (texture) => {
          this.textures.set(id, texture);
          resolve(texture);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }
  
  loadGLTF(id, url) {
      return new Promise((resolve, reject) => {
          if (this.models.has(id)) {
              resolve(this.models.get(id));
              return;
          }
          
          this.gltfLoader.load(
              url,
              (gltf) => {
                  console.log(`[AssetManager] Loaded GLTF: ${id}`);
                  this.models.set(id, gltf);
                  resolve(gltf);
              },
              undefined,
              (err) => {
                  console.error(`[AssetManager] Error loading GLTF ${id}:`, err);
                  reject(err);
              }
          );
      });
  }

  getTexture(id) {
    return this.textures.get(id);
  }
  
  getModel(id) {
      return this.models.get(id);
  }
  // --- Texture Generators (Delegated to Textures Module) ---
  
  createDungeonFloorTexture() {
    return Textures.createDungeonFloorTexture();
  }

  createDungeonWallTexture() {
    return Textures.createDojoWallTexture();
  }

  makeCastleRaftersTexture() {
    return Textures.makeCastleRaftersTexture();
  }

  makeNoiseBump() {
    return Textures.makeNoiseBump();
  }
}

export const Assets = new AssetManager();
