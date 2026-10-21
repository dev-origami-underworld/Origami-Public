
export function createAdventureUI(store) {
  const listeners = { command: null };

  function getUI() {
      return window.OrigamiUI;
  }

  function getRefs() {
      return window.OrigamiUI?.game?.ui || {};
  }

  function init() {
      const ui = getUI();
      if (!ui) {
          console.error("OrigamiUI not found!");
          return;
      }

      // Setup command input listener
      const input = document.getElementById("command-input");
      if (input) {
          // Remove old listeners by cloning? No, just add new one.
          // The old one was never attached because we commented out setupEventListeners in HTML.
          input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                  const val = input.value.trim();
                  if (val) {
                      listeners.command?.(val);
                      input.value = "";
                  }
              }
          });
      }
      
      // Re-attach button listeners to use our controller logic (via listeners.command)
      // or just UI logic (turning pages)
      const refs = getRefs();
      if(refs.bookPrevBtn) refs.bookPrevBtn.onclick = (e) => { e.stopPropagation(); ui.turnPage("prev"); };
      if(refs.bookNextBtn) refs.bookNextBtn.onclick = (e) => { e.stopPropagation(); ui.turnPage("next"); };
      if(refs.bookPageLeft) refs.bookPageLeft.onclick = () => ui.turnPage("prev");
      if(refs.bookPageRight) refs.bookPageRight.onclick = () => ui.turnPage("next");
      
      if(refs.inventoryBtn) refs.inventoryBtn.onclick = toggleInventory;
      if(refs.inventoryCloseBtn) refs.inventoryCloseBtn.onclick = toggleInventory;
      if(refs.themeBtn) refs.themeBtn.onclick = () => document.body.classList.toggle("dark-mode");

      // Interactive text
      document.getElementById("origami-dungeon-wrapper")?.addEventListener("click", (e) => {
          if (e.target.classList.contains("interactive-feature")) {
              const cmd = e.target.getAttribute("data-cmd");
              if (cmd) listeners.command?.(cmd);
          }
      });
  }

  function onCommand(fn) { listeners.command = fn; }

  function logHTML(html) {
      const ui = getUI();
      if (!ui) return;
      const game = ui.game;
      const lastPage = game.book.pages[game.book.pages.length - 1];
      
      // Append to last page if possible to avoid spam
      if (lastPage) {
          if (lastPage.isHtml) {
              lastPage.content += `<br><br>${html}`;
          } else {
              lastPage.text += `<br><br>${html}`;
          }
          ui.updateBookView();
      } else {
          ui.addPage("Event Log", html, "", true);
      }
  }

  function pushRoomCard(room) {
      const ui = getUI();
      if (!ui) return;
      
      const featureList = (room.features || []).filter((f) => !f.consumed).map((f) => `<span class="interactive-feature" data-cmd="${f.actionLabel || 'inspect ' + f.id}">${f.label}</span>`).join(", "); 
      let desc = room.description;
      if (featureList) desc += `<br><br><b>You see:</b> ${featureList}`;
      const monsterList = (room.monsters || []).filter((m) => m.hp > 0).map((m) => m.name).join(", "); 
      if (monsterList) desc += `<br><br><b>Enemies:</b> ${monsterList}`;
      
      const subTitle = room.id === 1 ? "The long dark path ahead" : "Room " + room.id;
      
      ui.addPage(room.title, desc, subTitle);
  }

  function renderGuideButtons(actions) {
      const refs = getRefs();
      const container = refs.guideButtons;
      if(!container) return;
      container.innerHTML = "";
      
      actions.forEach((action) => {
        const btn = document.createElement("button");
        btn.className = "px-6 py-2.5 text-sm font-medium rounded-lg shadow-sm border transition-colors whitespace-nowrap cursor-pointer";
        
        if (action.command && action.command.startsWith("attack")) { btn.className += " bg-red-700 hover:bg-red-800 text-white border-red-900"; } 
        else if (action.command && action.command.startsWith("gamble")) { btn.className += " bg-green-600 hover:bg-green-700 text-white border-green-800"; } 
        else if (action.label === "Take Lantern") { btn.className += " bg-[#333333] hover:bg-[#1a1a1a] text-white border-stone-800 lantern-action"; } 
        else { btn.className += " bg-[#f3efe7] hover:bg-[#e8e4dc] text-stone-800 border-stone-300/60"; }
        
        btn.textContent = action.label;
        btn.onclick = (e) => { 
          e.preventDefault(); 
          listeners.command?.(action.command);
        };
        container.appendChild(btn);
      });
  }

  function updateStats() {
      const refs = getRefs();
      if (refs.levelNum) refs.levelNum.textContent = (store.state.player.currentLevel).toString().padStart(2, "0");
  }

  function createEventCard(title, description, iconName = "lightbulb", itemName = "") {
      const ui = getUI();
      if (!ui) return;
      
      // Map 'lantern' to a valid material icon if needed
      const icon = iconName === 'lantern' ? 'tungsten' : iconName;
      
      const content = `
          <div class="flex flex-col h-full pt-4">
              <!-- Item Card -->
              <div class="flex flex-col items-center justify-center p-8 border border-stone-200 rounded-lg shadow-sm bg-white mb-6">
                  <div class="text-amber-400 mb-4">
                      <span class="material-icons-round" style="font-size: 64px;">${icon}</span>
                  </div>
                  <div class="font-serif font-bold text-lg text-stone-800 mb-1">${itemName || title}</div>
                  <div class="text-xs font-bold text-stone-500 uppercase tracking-widest">Rare Item</div>
              </div>
              
              <!-- Description -->
              <div class="text-stone-700 text-base leading-relaxed font-serif text-left">
                  ${description}
              </div>
          </div>
      `;
      
      // Add as a new page (Title, Content, Subtitle, isHtml)
      ui.addPage(title, content, "Loot", true);
      
      // Turn to the new page
      setTimeout(() => ui.turnPage("end"), 100);
  }

  function renderInventory() {
      const refs = getRefs();
      const grid = refs.inventoryGrid;
      if(!grid) return;
      grid.innerHTML = "";
      store.state.player.inventory.forEach((item) => {
          const slot = document.createElement("div");
          slot.className = "inventory-slot";
          slot.textContent = typeof item === 'string' ? item[0] : (item.name || item.label || "?")[0];
          grid.appendChild(slot);
      });
      if(refs.goldCounter) refs.goldCounter.textContent = `${store.state.player.gold} Gold`;
  }

  function toggleInventory() {
      const refs = getRefs();
      if(!refs.inventoryModal) return;
      if(refs.inventoryModal.style.display === "flex") {
          refs.inventoryModal.style.display = "none";
      } else {
          renderInventory();
          refs.inventoryModal.style.display = "flex";
      }
  }
  
  function focusInput() {
      const refs = getRefs();
      refs.commandInput?.focus();
  }

  return {
      init,
      onCommand,
      logHTML,
      logText: logHTML,
      pushRoomCard,
      renderGuideButtons,
      updateStats,
      renderInventory,
      toggleInventory,
      focusInput,
      createEventCard,
      flashIndicator: () => {},
      showFlashlightButton: () => {
          const btn = document.getElementById("util-flashlight");
          if (btn) {
              btn.classList.remove("hidden");
              // Add bloom effect
              const bloom = document.getElementById("flashlight-bloom-1");
              if (bloom) {
                  bloom.classList.remove("hidden");
                  // Remove bloom after a few seconds
                  setTimeout(() => bloom.classList.add("hidden"), 3000);
              }
          }
      },
      get refs() { return getRefs(); }
  };
}
