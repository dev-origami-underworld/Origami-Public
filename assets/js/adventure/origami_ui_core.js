// Expose UI functions to global scope for controller.js
window.OrigamiUI = {};

document.addEventListener("DOMContentLoaded", function() {
  
  // Sound System (Keep as fallback or use controller's audio)
  const sound = { isInitialized: false, synths: {}, init() { if (this.isInitialized || typeof Tone === "undefined") return; this.synths.item = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 }, volume: -12 }).toDestination(); this.synths.puzzle = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1.5, modulationIndex: 10, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.5 }, volume: -8 }).toDestination(); this.synths.damage = new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }, volume: -10 }).toDestination(); this.synths.solve = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.1, decay: 0.5, sustain: 0.8, release: 1 }, volume: -6 }).toDestination(); this.synths.hit = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 5, envelope: { attack: 0.001, decay: 0.2, sustain: 0 }, volume: -10 }).toDestination(); this.isInitialized = true; }, play(type, note, duration = "8n") { if (this.isInitialized && this.synths[type]) { if (type === "damage") this.synths[type].triggerAttackRelease("8n"); else this.synths[type].triggerAttackRelease(note, duration); } } };

  // UI State
  const game = { player: { hp: 100, maxHp: 100, currentLevel: 0, currentRoomId: 1, inventory: [], attackPower: 8, gold: 0, lastDirection: null }, mapData: { levels: [] }, puzzle: { required: 4, found: 0 }, state: { inRiddle: false, selectedItem: null, inExitConfirmation: false }, ui: {}, book: { pages: [], currentPageIndex: 0, isTurning: false }, three: { scene: null, camera: null, renderer: null, cube: null, animId: null } };

  function showLootCard(item, Models) {
      // 1. Create Overlay
      const overlay = document.createElement('div');
      overlay.className = 'loot-card-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in';
      
      // Rarity Colors
      const rarityColors = {
          'Common': 'border-stone-800',
          'Uncommon': 'border-green-700',
          'Rare': 'border-blue-700',
          'Legendary': 'border-yellow-600'
      };
      const borderColor = rarityColors[item.rarity] || 'border-stone-800';
      
      overlay.innerHTML = `
        <div class="loot-card relative w-[300px] h-[480px] bg-[#fdfbf7] border-4 ${borderColor} rounded-lg shadow-2xl p-5 flex flex-col font-serif text-stone-900 transform scale-95 opacity-0 transition-all duration-300" style="background-image: url('assets/img/paper_texture.png'); background-size: cover;">
            <!-- Close Button -->
            <button class="absolute top-2 right-2 text-stone-400 hover:text-red-500 transition-colors" id="close-loot-card">
                <span class="material-icons-round">close</span>
            </button>
            
            <!-- Header -->
            <div class="flex justify-between items-baseline border-b-2 border-stone-300 pb-2 mb-4">
            <span class="text-xs font-sans font-bold text-stone-500 uppercase tracking-widest">${item.baseType || 'Item'}</span>
            <span class="text-3xl font-serif font-bold text-red-700" style="font-family: 'Noto Serif JP', serif;">${item.kanjiName || ''}</span>
            </div>
            
            <!-- Visual Circle -->
            <div class="relative w-[160px] h-[160px] mx-auto rounded-full border-4 border-white shadow-[inset_0_0_20px_rgba(0,0,0,0.1)] overflow-hidden mb-6 bg-gradient-to-br from-white to-stone-200 flex items-center justify-center" id="loot-model-container">
            <!-- Canvas goes here -->
            </div>
            
            <!-- Name -->
            <div class="text-center mb-3">
            <h2 class="text-2xl font-serif font-bold text-stone-800">${item.japaneseName || item.name}</h2>
            </div>
            
            <!-- Stats -->
            <div class="bg-stone-100/50 p-2 rounded text-center font-mono text-xs font-bold text-stone-600 mb-4 border border-stone-200/50">
            ${item.stats ? (item.stats.damage ? `DAMAGE: <span class="text-red-600">${item.stats.damage}</span> ${item.stats.damageType}` : `EFFECT: <span class="text-green-600">${item.stats.effect || 'None'}</span>`) : ''}
            </div>
            
            <!-- Description -->
            <div class="text-sm italic text-stone-500 text-center leading-relaxed px-2">
            "${item.description || ''}"
            </div>
            
            <!-- Footer -->
            <div class="mt-auto text-center">
                <button class="bg-stone-800 text-white px-6 py-2 rounded shadow hover:bg-stone-700 transition-colors text-sm font-bold uppercase tracking-wider" id="take-loot-btn">Collect</button>
            </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      // Animate In
      setTimeout(() => {
          const card = overlay.querySelector('.loot-card');
          if(card) {
            card.classList.remove('scale-95', 'opacity-0');
            card.classList.add('scale-100', 'opacity-100');
          }
      }, 10);
      
      // 2. Initialize Mini 3D Scene
      const container = overlay.querySelector('#loot-model-container');
      if (container && window.THREE && Models) {
          const width = container.clientWidth;
          const height = container.clientHeight;
          
          const scene = new THREE.Scene();
          
          const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
          camera.position.set(0, 0.5, 1.5);
          camera.lookAt(0, 0.2, 0);
          
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
          renderer.setSize(width, height);
          renderer.setPixelRatio(window.devicePixelRatio);
          container.appendChild(renderer.domElement);
          
          // Lights
          const ambient = new THREE.AmbientLight(0xffffff, 0.8);
          scene.add(ambient);
          const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
          dirLight.position.set(2, 5, 5);
          scene.add(dirLight);
          
          // Model
          const mesh = Models.createItemMesh(item.modelId || item.type);
          mesh.scale.set(1.5, 1.5, 1.5); 
          scene.add(mesh);
          
          // Animation Loop
          let animationId;
          const animate = () => {
              animationId = requestAnimationFrame(animate);
              if (mesh) {
                  mesh.rotation.y += 0.01;
                  mesh.position.y = 0.1 + Math.sin(Date.now() * 0.002) * 0.05;
              }
              renderer.render(scene, camera);
          };
          animate();
          
          // Cleanup function attached to overlay
          overlay.cleanup = () => {
              cancelAnimationFrame(animationId);
              renderer.dispose();
          };
      }
      
      // 3. Close Handlers
      const close = () => {
          if(overlay.cleanup) overlay.cleanup();
          overlay.remove();
      };
      
      const closeBtn = overlay.querySelector('#close-loot-card');
      if(closeBtn) closeBtn.onclick = close;
      
      const takeBtn = overlay.querySelector('#take-loot-btn');
      if(takeBtn) takeBtn.onclick = close;
  }

  function init() { 
      cacheUI(); 
      
      // Expose functions
      window.OrigamiUI.addPage = addPage;
      window.OrigamiUI.turnPage = turnPage;
      window.OrigamiUI.createEventCard = createEventCard;
      window.OrigamiUI.render3DLootItem = render3DLootItem;
      window.OrigamiUI.initThreeJSIfPresent = initThreeJSIfPresent;
      window.OrigamiUI.renderPage = renderPage;
      window.OrigamiUI.updateBookView = updateBookView;
      window.OrigamiUI.renderGuideButtons = renderGuideButtons;
      window.OrigamiUI.showLootCard = showLootCard; // New
      window.OrigamiUI.onCommand = (fn) => { window.OrigamiUI.commandListener = fn; };
      window.OrigamiUI.game = game; 
      
      // Initial Welcome Page
      addPage("Welcome to Origami Dungeon!", "Your quest is to retrieve the Golden Scroll of Destiny and save the Dragon King's Daughter. But guarding them is a powerful serpent witch named Oni-Baba.", "Chapter I");

      setupEventListeners();
  }

  function cacheUI() { game.ui = { bookContainer: document.getElementById("book-container"), bookPageLeft: document.getElementById("book-page-left"), bookPageRight: document.getElementById("book-page-right"), bookFlipPage: document.getElementById("book-flip-page"), flipContentFront: document.getElementById("flip-content-front"), flipContentBack: document.getElementById("flip-content-back"), bookPrevBtn: document.getElementById("book-prev-btn"), bookNextBtn: document.getElementById("book-next-btn"), guideButtons: document.getElementById("guide-buttons-container"), commandInput: document.getElementById("command-input"), levelNum: document.getElementById("level-num"), flashlightBtn: document.getElementById("util-flashlight"), themeBtn: document.getElementById("util-theme"), inventoryBtn: document.getElementById("util-inventory"), settingsBtn: document.getElementById("util-settings"), inventoryModal: document.getElementById("inventory-modal"), inventoryGrid: document.getElementById("dnd-game-inventory-grid"), goldCounter: document.getElementById("gold-counter"), inventoryCloseBtn: document.getElementById("inventory-close"), characterModal: document.getElementById("character-modal"), characterCloseBtn: document.getElementById("character-close") }; }

  function setupEventListeners() {
      const refs = game.ui;
        // Add Listener for Interactive Text
        document.getElementById("origami-dungeon-wrapper").addEventListener("click", function(e) {
            if (e.target.classList.contains("interactive-feature")) {
                const cmd = e.target.getAttribute("data-cmd");
                if (cmd) {
                    console.log("Clicked interactive feature:", cmd);
                    // Use the current room from state
                    const currentLevelMap = game.mapData.levels[game.player.currentLevel]; 
                    const currentRoom = currentLevelMap.get(game.player.currentRoomId);
                    
                    // Special case for Lantern to trigger animation
                    if (cmd === "Take Lantern" || cmd.includes("Take Lantern")) {
                        triggerLanternSequence({ isLantern: true, label: "Take Lantern" }, currentRoom);
                    } else {
                        handleCommand(cmd);
                    }
                }
            }
        });
        
        // Help Modal
        const helpModal = document.getElementById("help-modal");
      if (helpModal) {
          const closeHelp = () => helpModal.style.display = "none";
          const openHelp = () => helpModal.style.display = "flex";
          
          const helpClose = document.getElementById("help-close");
          if (helpClose) helpClose.onclick = closeHelp;
          
          const helpStart = document.getElementById("help-start-btn");
          if (helpStart) helpStart.onclick = closeHelp;
          
          if (refs.settingsBtn) refs.settingsBtn.onclick = openHelp;
      }

      // Inventory
      if(refs.inventoryBtn) refs.inventoryBtn.onclick = toggleInventory;
      if(refs.inventoryCloseBtn) refs.inventoryCloseBtn.onclick = toggleInventory;
      
      // Theme
      if(refs.themeBtn) refs.themeBtn.onclick = () => document.body.classList.toggle("dark-mode");

      // Book Navigation
      if(refs.bookPrevBtn) refs.bookPrevBtn.onclick = (e) => { e.stopPropagation(); turnPage("prev"); };
      if(refs.bookNextBtn) refs.bookNextBtn.onclick = (e) => { e.stopPropagation(); turnPage("next"); };
      if(refs.bookPageLeft) refs.bookPageLeft.onclick = () => turnPage("prev");
      if(refs.bookPageRight) refs.bookPageRight.onclick = () => turnPage("next");
      
      // Input
      if (refs.commandInput) {
          refs.commandInput.addEventListener("keydown", (e) => {
               if (e.key === "Enter") {
                   const val = refs.commandInput.value.trim();
                   if (val && window.OrigamiUI.commandListener) {
                       window.OrigamiUI.commandListener(val);
                       refs.commandInput.value = "";
                   }
               }
          });
      }
  }

  function updateBookView() {
    const { book } = game;
    renderPage(game.ui.bookPageLeft, book.pages[book.currentPageIndex]);
    const nextPage = book.pages[book.currentPageIndex + 1];
    if (nextPage) {
        renderPage(game.ui.bookPageRight, nextPage);
    } else {
        if(game.ui.bookPageRight) game.ui.bookPageRight.innerHTML = ""; 
    }
    if(game.ui.bookPrevBtn) {
      game.ui.bookPrevBtn.style.opacity = book.currentPageIndex === 0 ? 0.5 : 1;
    }
    if(game.ui.bookNextBtn) {
      game.ui.bookNextBtn.style.opacity = book.currentPageIndex >= book.pages.length - 2 ? 0.5 : 1;
    }
    setTimeout(initThreeJSIfPresent, 100);
  }

  function renderPage(container, pageData) {
    if (!container) return;
    if (!pageData) { container.innerHTML = ""; return; }
    if (pageData.isHtml) {
      // Reduced padding to 10px
      container.innerHTML = `<div class="page-container" style="padding: 10px;">${pageData.content}</div>`;
    } else {
      // Reduced padding to 10px
      let html = `<div class="page-container" style="padding: 10px;">`;
      if (pageData.title) html += `<h2 class="fluid-heading" style="margin-top: 0;">${pageData.title}</h2>`;
      if (pageData.sub) html += `<p class="fluid-sub">${pageData.sub}</p>`;
      // Added font-size adjustment to prevent clipping
      if (pageData.text) html += `<div class="fluid-text" style="font-size: 0.95em;">${pageData.text}</div>`;
      html += `</div>`;
      container.innerHTML = html;
    }
  }

  function addPage(title, text, sub = "", isHtml = false) { 
    if (isHtml) { game.book.pages.push({ content: text, isHtml: true }); } 
    else { game.book.pages.push({ title, text, sub, isHtml: false }); }
    if (game.book.pages.length > 2) { 
       if (game.book.currentPageIndex >= game.book.pages.length - 3) turnPage("next"); 
    } else { updateBookView(); }
  }

  function renderGuideButtons(actions) {
      const refs = game.ui;
      const container = refs.guideButtons;
      if(!container) return;
      container.innerHTML = "";
      
      actions.forEach((action) => {
        const btn = document.createElement("button");
        // Using standard Tailwind classes (no od- prefix)
        btn.className = "px-6 py-2.5 text-sm font-medium rounded-lg shadow-sm border transition-colors whitespace-nowrap cursor-pointer";
        
        if (action.command && action.command.startsWith("attack")) { btn.className += " bg-red-700 hover:bg-red-800 text-white border-red-900"; } 
        else if (action.command && action.command.startsWith("gamble")) { btn.className += " bg-amber-400 hover:bg-amber-500 text-black border-amber-600"; } 
        else if (action.label === "Take Lantern") { btn.className += " bg-[#333333] hover:bg-[#1a1a1a] text-white border-stone-800 lantern-action"; } 
        else { btn.className += " bg-[#f3efe7] hover:bg-[#e8e4dc] text-stone-800 border-stone-300/60"; }
        
        btn.textContent = action.label;
        btn.onclick = (e) => { 
          e.preventDefault(); 
          if (window.OrigamiUI.commandListener) {
            window.OrigamiUI.commandListener(action.command);
          }
        };
        container.appendChild(btn);
      });
  }

  function createEventCard(title, text, icon, lootItem = null) {
     const canvasId = `three-canvas-${Date.now()}`;
     let cardContent = '';
     
     if (title === "Loot Discovered!" || title === "Magical Glowworm Lantern") {
         cardContent = `
            <div class="event-card animate-in zoom-in fade-in duration-500 w-full">
                <div id="${canvasId}" class="event-card-3d-container"></div>
                <div class="font-bold text-lg mb-1 mt-2">${lootItem || title}</div>
                <div class="text-xs text-gray-600 italic">Rare Item</div>
            </div>
         `;
     } else {
         cardContent = `
            <div class="event-card animate-in zoom-in fade-in duration-500 w-full">
                <div class="event-card-icon">${icon}</div>
            </div>
         `;
     }
     const cardHtml = `
        <div class="h-full flex flex-col justify-center items-center text-center">
            <h2 class="fluid-heading mb-2">${title}</h2>
            ${cardContent}
            <div class="fluid-text mt-4 text-stone-700 italic">${text}</div>
        </div>
     `;
     addPage(null, cardHtml, null, true);
  }

  function render3DLootItem(container, itemType) {
        if (!window.THREE) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);
        let geometry, material, mesh;
        if (itemType.includes("Lantern") || itemType.includes("Glow")) {
            // Lantern Geometry: Wireframe Box with inner sphere
            geometry = new THREE.OctahedronGeometry(1.5, 0); 
            material = new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true });
            const innerGeo = new THREE.SphereGeometry(0.5, 16, 16);
            const innerMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            const innerMesh = new THREE.Mesh(innerGeo, innerMat);
            mesh = new THREE.Mesh(geometry, material);
            mesh.add(innerMesh);
        } else if (itemType.includes("Scroll") || itemType.includes("Paper")) {
            geometry = new THREE.CylinderGeometry(0.5, 0.5, 3, 32); material = new THREE.MeshBasicMaterial({ color: 0xf5f5dc, wireframe: false }); mesh = new THREE.Mesh(geometry, material); mesh.rotation.z = Math.PI / 2;
        } else if (itemType.includes("Bead") || itemType.includes("Pearl")) {
             geometry = new THREE.IcosahedronGeometry(1.5, 1); material = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
        } else {
             geometry = new THREE.BoxGeometry(2, 2, 2); material = new THREE.MeshNormalMaterial();
        }
        if (!mesh) mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        camera.position.z = 4;
        const animate = function () {
            if(!document.contains(container)) return;
            requestAnimationFrame(animate);
            mesh.rotation.x += 0.01; mesh.rotation.y += 0.02;
            renderer.render(scene, camera);
        };
        animate();
  }

  function initThreeJSIfPresent() {
    const containers = document.querySelectorAll('.event-card-3d-container');
    containers.forEach(container => {
        if (!container.hasChildNodes()) {
            const itemName = container.nextElementSibling ? container.nextElementSibling.innerText : "Unknown";
            render3DLootItem(container, itemName);
        }
    });
  }

  function turnPage(direction) {
    if (game.book.isTurning) return;
    const { book } = game;
    if (direction === "next") {
      if (book.currentPageIndex >= book.pages.length - 2) return;
      game.book.isTurning = true;
      renderPage(game.ui.flipContentFront, book.pages[book.currentPageIndex + 1]); 
      renderPage(game.ui.flipContentBack, book.pages[book.currentPageIndex + 1]);
      const nextRight = book.pages[book.currentPageIndex + 2];
      if (nextRight) { renderPage(game.ui.bookPageRight, nextRight); } else { if(game.ui.bookPageRight) game.ui.bookPageRight.innerHTML = ""; }
      initThreeJSIfPresent();
      game.ui.bookFlipPage.classList.remove("hidden");
      void game.ui.bookFlipPage.offsetWidth; 
      game.ui.bookFlipPage.classList.add("page-turning");
      setTimeout(() => { book.currentPageIndex += 1; updateBookView(); game.ui.bookFlipPage.classList.remove("page-turning"); game.ui.bookFlipPage.classList.add("hidden"); game.book.isTurning = false; }, 800);
    } else if (direction === "prev") {
      if (book.currentPageIndex === 0) return;
      book.currentPageIndex -= 1; 
      updateBookView();
    }
  }

  function renderInventory() {
      const refs = game.ui;
      const grid = refs.inventoryGrid;
      if(!grid) return;
      grid.innerHTML = "";
      // Assuming inventory is in game.player.inventory (synced from controller state?)
      // Actually, controller should push inventory updates.
      // But for now, we use local game state which might be empty.
      // The controller calls renderInventory? No, it calls ui.renderInventory.
      // We need to expose renderInventory too?
      // Or just use the one in ui.js?
      // Wait, ui.js was replaced by this file? No, ui.js is separate.
      // But Origami.Dungeon.html uses THIS file.
      // So we need renderInventory here.
      (game.player.inventory || []).forEach((item) => {
          const slot = document.createElement("div");
          slot.className = "inventory-slot";
          slot.textContent = typeof item === 'string' ? item[0] : (item.name || item.label || "?")[0];
          grid.appendChild(slot);
      });
      if(refs.goldCounter) refs.goldCounter.textContent = `${game.player.gold} Gold`;
  }

  function toggleInventory() {
      const refs = game.ui;
      if(!refs.inventoryModal) return;
      if(refs.inventoryModal.style.display === "flex") {
          refs.inventoryModal.style.display = "none";
      } else {
          renderInventory();
          refs.inventoryModal.style.display = "flex";
      }
  }

  // Expose renderInventory and toggleInventory
  window.OrigamiUI.renderInventory = renderInventory;
  window.OrigamiUI.toggleInventory = toggleInventory;

  init();
});
