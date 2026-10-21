window.CombatUI = {
  context: null,

  init: function (context) {
    this.context = context;
    this.setupGambling();
    this.setupEventListeners();
    this.initControlCenter();
    this.setupDPad();
  },

  setupDPad: function () {
    return; // Keypad removed as requested
    /*
    const { keys, keyTriggers } = this.context;
    const dPad = document.querySelector(".d-pad");
    if (dPad) {
      const fpvContainer = document.getElementById("fpv-container");
      // Check if already cloned to avoid duplicates on re-init
      if (fpvContainer.querySelector(".keypad-glass-container")) return;

      // Create Glass Container
      const container = document.createElement("div");
      container.className = "keypad-glass-container";
      // Initial position: Top Center
      container.style.top = "20px";
      container.style.bottom = "auto";
      container.style.left = "calc(50% - 90px)"; // 180px width / 2

      // Create Resize Handle
      const resizeHandle = document.createElement("div");
      resizeHandle.className = "resize-handle";
      container.appendChild(resizeHandle);

      // Clone D-Pad
      const dPadClone = dPad.cloneNode(true);
      dPadClone.classList.add("fpv-dpad");

      // Reset styles to fit inside container
      dPadClone.style.position = "relative";
      dPadClone.style.bottom = "auto";
      dPadClone.style.left = "auto";
      dPadClone.style.transform = "scale(0.9)";
      dPadClone.style.margin = "0";
      dPadClone.style.opacity = "1";
      dPadClone.style.zIndex = "101";
      dPadClone.style.pointerEvents = "auto";

      container.appendChild(dPadClone);
      fpvContainer.appendChild(container);

      // Enable Drag & Resize
      this.makeDraggable(container);
      this.makeResizable(container, resizeHandle);

      // Wire up events for both original and clone
      [dPad, dPadClone].forEach((pad) => {
        const up = pad.querySelector(".d-up");
        if (up) {
          up.setAttribute("aria-label", "Move Forward");
          up.addEventListener("click", () => {
            keys.w = true;
            setTimeout(() => (keys.w = false), 100);
          });
        }

        const down = pad.querySelector(".d-down");
        if (down) {
          down.setAttribute("aria-label", "Move Backward");
          down.addEventListener("click", () => {
            keys.s = true;
            setTimeout(() => (keys.s = false), 100);
          });
        }

        const left = pad.querySelector(".d-left");
        if (left) {
          left.setAttribute("aria-label", "Turn Left");
          left.addEventListener("click", () => {
            keyTriggers.a = true; // Trigger rotation
          });
        }

        const right = pad.querySelector(".d-right");
        if (right) {
          right.setAttribute("aria-label", "Turn Right");
          right.addEventListener("click", () => {
            keyTriggers.d = true; // Trigger rotation
          });
        }

        // Wire up dice button on clone too
        const diceBtn = pad.querySelector("#dice-btn");
        if (diceBtn) {
          diceBtn.setAttribute("aria-label", "Roll Dice");
          diceBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // Prevent drag start
            const cube = diceBtn.querySelector(".dice-cube");
            if (cube) {
              cube.classList.add("spinning");
              setTimeout(() => cube.classList.remove("spinning"), 500);
            }
          });
        }

        // Prevent drag on buttons
        pad.querySelectorAll(".d-btn").forEach((btn) => {
          btn.addEventListener("mousedown", (e) => e.stopPropagation());
          btn.addEventListener("touchstart", (e) => e.stopPropagation(), {
            passive: true,
          });
        });
      });
    }
    */
  },

  makeDraggable: function (el) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onStart = (e) => {
      if (e.target.classList.contains("resize-handle")) return;
      // Only drag if clicking background, not buttons (handled by stopPropagation above)
      isDragging = true;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      // Switch to top/left positioning for dragging
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();

      // Calculate position relative to parent
      initialLeft = el.offsetLeft;
      initialTop = el.offsetTop;

      // Unset bottom/right if they were set
      el.style.bottom = "auto";
      el.style.right = "auto";
      el.style.left = `${initialLeft}px`;
      el.style.top = `${initialTop}px`;

      if (e.type === "mousedown") {
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onEnd);
      } else {
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
      }
    };

    const onMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault(); // Prevent scrolling while dragging

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const dx = clientX - startX;
      const dy = clientY - startY;
      el.style.left = `${initialLeft + dx}px`;
      el.style.top = `${initialTop + dy}px`;
    };

    const onEnd = () => {
      isDragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };

    el.addEventListener("mousedown", onStart);
    el.addEventListener("touchstart", onStart, { passive: false }); // Dragging needs to block scroll
  },

  makeResizable: function (el, handle) {
    let isResizing = false;
    let startX, startY, startWidth;

    const onMouseDown = (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = el.offsetWidth;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Uniform scaling based on max movement
      const delta = Math.max(dx, dy);
      const newSize = Math.max(150, startWidth + delta); // Min size 150px

      el.style.width = `${newSize}px`;
      el.style.height = `${newSize}px`;
    };

    const onMouseUp = () => {
      isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  },

  setupEventListeners: function () {
    const { game } = this.context;
    const btnAttack = document.getElementById("btn-attack");
    const btnWager = document.querySelector(".btn-wager");

    if (btnAttack) {
      btnAttack.setAttribute("aria-label", "Attack Monster");
      btnAttack.addEventListener("click", () => {
        if (game.targetMonster) {
          // We need to call attackMonster. It's currently a global function in Origami.html.
          // We should probably move attackMonster here or expose it via context.
          // For now, let's assume attackMonster is global or passed in context.
          if (typeof window.attackMonster === "function") {
            window.attackMonster(game.targetMonster);
          } else if (this.context.attackMonster) {
            this.context.attackMonster(game.targetMonster);
          }

          // Visual shake
          const container = document.getElementById("main-container");
          if (container) {
            container.style.transform = "translate(2px, 2px)";
            setTimeout(
              () => (container.style.transform = "translate(-2px, -2px)"),
              50
            );
            setTimeout(
              () => (container.style.transform = "translate(0, 0)"),
              100
            );
          }
        } else {
          const quipEl = document.getElementById("feed-quip");
          if (quipEl) quipEl.textContent = "No target selected!";
        }
      });
    }

    if (btnWager) {
      btnWager.setAttribute("aria-label", "Wager Gold");
      btnWager.addEventListener("click", () => {
        this.handleWager();
      });
    }
  },

  handleWager: function () {
    const { game, origamiCore } = this.context;
    if (!game.targetMonster) return;
    const monster = game.targetMonster;

    // Lazy Init Gold if missing
    if (monster.gold === undefined) {
      monster.gold = Math.floor(
        (50 + Math.random() * 75) * (game.player.currentLevel + 1)
      );
    }

    // Bet Amount (Scales with level)
    const bet = (game.player.currentLevel + 1) * 25;

    // Set status to gaming (Yellow) temporarily
    const prevStatus = monster.status;
    monster.status = "gaming";
    monster.gamblingStartTurn = game.totalTurns || 0;

    // Dice Wager Logic
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;
    const win = sum > 7;

    const quipEl = document.getElementById("feed-quip");
    if (quipEl) {
      quipEl.innerHTML = `Rolling... <span style="font-size:1.2em">🎲</span>`;

      setTimeout(() => {
        if (win) {
          // Player Wins
          monster.gold -= bet;
          game.player.gold += bet;
          quipEl.innerHTML = `Rolled ${d1} & ${d2} (${sum}). <span style="color:#22c55e">WIN!</span> You won ${bet}g.`;

          const handle = game.monsterHandles.get(monster.id);
          if (handle) {
            this.spawnFloatingText(handle.group.position, `+${bet}g`, "crit");
          }

          // Check Bankruptcy
          if (monster.gold <= 0) {
            monster.status = "ally"; // Turns Green (Bankrupt/Defeated)
            if (monster.aiState) monster.aiState.state = "idle"; // Stop attacking
            quipEl.innerHTML += " <br>The monster is bankrupt!";
          } else {
            monster.status = prevStatus; // Revert if not bankrupt
          }
        } else {
          // Player Loses
          game.player.gold = Math.max(0, game.player.gold - bet);
          quipEl.innerHTML = `Rolled ${d1} & ${d2} (${sum}). <span style="color:#ef4444">LOSS.</span> You lost ${bet}g.`;

          const handle = game.monsterHandles.get(monster.id);
          if (handle) {
            this.spawnFloatingText(handle.group.position, `-${bet}g`, "miss");
          }
          monster.status = prevStatus; // Revert status
        }

        // Update Gold UI
        const goldCounter = document.getElementById("dnd-game-gold-counter");
        if (goldCounter) goldCounter.innerHTML = `🪙 ${game.player.gold}`;

        setTimeout(() => {
          if (quipEl) quipEl.style.color = "#fff";
        }, 2000);
      }, 600);
    }
  },

  setupGambling: function () {
    const { game } = this.context;
    const diceBtn = document.getElementById("dice-btn");
    const diceCube = document.getElementById("dice-cube");
    const gambleBtn = document.querySelector(".btn-wager");

    if (!diceBtn || !diceCube) return;

    // Inject Dots HTML
    const faces = diceCube.querySelectorAll(".dice-face");
    faces.forEach((face, index) => {
      const val = index + 1;
      face.setAttribute("data-val", val);
      face.innerHTML = ""; // Clear text
      for (let i = 0; i < val; i++) {
        const dot = document.createElement("div");
        dot.className = "dice-dot";
        face.appendChild(dot);
      }
    });

    let isSpinning = false;

    diceBtn.addEventListener("click", () => {
      if (isSpinning) return;

      // Start rapid spin
      isSpinning = true;
      diceCube.classList.remove("stopped");
      diceCube.style.transform = ""; // Clear any manual transform
      diceCube.classList.add("spinning");
      diceCube.classList.add("gold-bloom"); // Add bloom effect

      // Trigger Gambling Mode on Monster
      if (game.targetMonster) {
        game.targetMonster.status = "gaming";
        game.targetMonster.gamblingStartTurn = game.totalTurns || 0;
        // Visual feedback on monster circle handled in update()
      }

      // Determine outcome after a delay
      setTimeout(() => {
        diceCube.classList.remove("spinning");
        diceCube.classList.remove("gold-bloom"); // Remove bloom effect
        diceCube.classList.add("stopped");
        isSpinning = false;

        // Roll 1-6
        const roll = Math.floor(Math.random() * 6) + 1;

        // Set final rotation based on roll
        let rotX = 0;
        let rotY = 0;
        switch (roll) {
          case 1:
            rotX = 0;
            rotY = 0;
            break;
          case 2:
            rotX = 0;
            rotY = -90;
            break;
          case 3:
            rotX = 0;
            rotY = 180;
            break;
          case 4:
            rotX = 0;
            rotY = 90;
            break;
          case 5:
            rotX = -90;
            rotY = 0;
            break;
          case 6:
            rotX = 90;
            rotY = 0;
            break;
        }

        // Add some full rotations for effect
        rotX += 360 * 2;
        rotY += 360 * 2;

        diceCube.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;

        // Gambling Logic
        // Win on 4, 5, 6. Lose on 1, 2, 3.
        const bet = 50;
        if (roll >= 4) {
          game.gold += bet;
        } else {
          game.gold = Math.max(0, game.gold - bet);
        }

        // Update UI
        if (gambleBtn) {
          gambleBtn.textContent = `GAMBLE ($${game.gold})`;
        }

        // Resume slow spin after 3 seconds
        setTimeout(() => {
          if (!isSpinning) {
            diceCube.classList.remove("stopped");
            diceCube.style.transform = "";
          }
        }, 3000);
      }, 600); // Spin duration
    });
  },

  initControlCenter: function () {
    const { sendCommand } = this.context;
    const form = document.getElementById("control-center-form");
    const input = document.getElementById("control-center-input");
    const feedText = document.getElementById("feed-quip");
    const feedSub = document.getElementById("feed-status");

    if (!form || !input || typeof sendCommand !== "function") return;

    const dispatch = (command) => {
      if (!command) return;
      sendCommand(command);
      if (feedText) {
        feedText.textContent = `Command relayed: "${command}"`;
      }
      if (feedSub) {
        feedSub.textContent = "Adventure view syncing with host directive.";
      }
      input.value = "";
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      dispatch(input.value.trim());
    });

    this.initWandCard(dispatch);
  },

  initWandCard: function (dispatch) {
    const castBtn = document.getElementById("wand-cast-btn");
    const counterReady = document.getElementById("wand-counter-ready");
    const counterTotal = document.getElementById("wand-counter-total");
    if (
      !castBtn ||
      !counterReady ||
      !counterTotal ||
      typeof dispatch !== "function"
    )
      return;

    let charges = Math.floor(Math.random() * 10) + 1;

    const render = () => {
      counterReady.textContent = `${charges} ready`;
      counterTotal.textContent = `${charges} shots`;
      castBtn.disabled = charges <= 0;
      castBtn.textContent = charges > 0 ? "Cast" : "Spent";
    };

    render();

    castBtn.addEventListener("click", () => {
      if (charges <= 0) return;
      dispatch("use wand of magic missile");
      charges -= 1;
      render();
    });
  },

  spawnFloatingText: function (worldPos, text, type) {
    const { fpvCamera, fpvContainer } = this.context;
    if (!fpvCamera || !fpvContainer) return;

    const el = document.createElement("div");
    el.textContent = text;
    el.className = `floating-text ${type}`;

    // Append to FPV container so it's clipped correctly
    fpvContainer.appendChild(el);

    // Reusable vector for projection to avoid GC
    const _vec = new THREE.Vector3();

    // Initial Position Calculation
    const updatePos = (pos) => {
      _vec.copy(pos);
      _vec.y += 1.5; // Above head
      _vec.project(fpvCamera);

      const x = (_vec.x * 0.5 + 0.5) * fpvContainer.clientWidth;
      const y = (-(_vec.y * 0.5) + 0.5) * fpvContainer.clientHeight;

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      // Hide if behind camera
      el.style.display = _vec.z > 1 ? "none" : "block";
    };

    updatePos(worldPos);

    const startTime = performance.now();
    const duration = 1200;

    const track = () => {
      const trackNow = performance.now();
      const progress = (trackNow - startTime) / duration;
      if (progress >= 1) {
        el.remove();
        return;
      }

      // Float up in world space
      _vec.copy(worldPos);
      _vec.y += 1.5 + progress * 1.8; // Float up higher

      _vec.project(fpvCamera);

      const x = (_vec.x * 0.5 + 0.5) * fpvContainer.clientWidth;
      const y = (-(_vec.y * 0.5) + 0.5) * fpvContainer.clientHeight;

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.opacity = 1 - progress;
      const scaleBase = type === "crit" ? 1.7 : 1.4;
      const scale = scaleBase - progress * 0.3;
      el.style.transform = `translate(-50%, -50%) scale(${scale})`; // WoW pop + float

      if (_vec.z > 1) el.style.display = "none";
      else el.style.display = "block";

      requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
  },

  update: function (closestMonster) {
    const { game, origamiCore, TILE_SIZE } = this.context;

    // Throttle UI updates to ~30fps
    const now = performance.now();
    if (now - (this._lastUiUpdate || 0) < 32) return;
    this._lastUiUpdate = now;

    const combatOverlay = document.getElementById("combat-ui-overlay");
    const leftPanel = document.getElementById("left-panel");
    const rightPanel = document.getElementById("right-panel");

    if (closestMonster) {
      game.targetMonster = closestMonster.monster; // Set target
      if (!combatOverlay.classList.contains("active")) {
        combatOverlay.classList.add("active");
        // Trigger animations
        setTimeout(() => {
          leftPanel.classList.add("visible");
          rightPanel.classList.add("visible");
        }, 50);
      }

      // Full-screen (combat-active) only when in melee range (1 tile)
      // TILE_SIZE is usually 2. 1 tile diagonal is ~2.82.
      // Let's use a slightly generous threshold for "1 tile away"
      const oneTileDist = (TILE_SIZE || 2) * 1.5;
      if (closestMonster.dist <= oneTileDist) {
        document.body.classList.add("combat-active");
      } else {
        document.body.classList.remove("combat-active");
      }

      // Update UI Data
      const m = closestMonster.monster;

      // Optimization: Only update DOM if values changed
      if (
        this._lastMonsterId !== m.id ||
        this._lastMonsterHp !== m.hp ||
        this._lastMonsterGold !== m.gold
      ) {
        const name = (m.name || "Unknown").toUpperCase();
        const nameEl = document.getElementById("monster-name");
        // Show monster gold if available, else random amount
        const mGold = m.gold || Math.floor(Math.random() * 500) + 100;
        m.gold = mGold; // Persist
        if (nameEl) {
          nameEl.innerHTML = `${name} <span class="gold-display">$${mGold}</span>`;
        }

        const hp = m.hp !== undefined ? m.hp : 4;
        const maxHp = m.maxHp !== undefined ? m.maxHp : 4;
        const hpEl = document.getElementById("monster-hp");
        if (hpEl) hpEl.textContent = `${hp}/${maxHp} HP`;

        const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
        const hpBar = document.getElementById("hp-bar");
        if (hpBar) hpBar.style.width = `${hpPercent}%`;

        this._lastMonsterId = m.id;
        this._lastMonsterHp = m.hp;
        this._lastMonsterGold = m.gold;
      }

      // Update Gamble Button
      const gambleBtn = document.querySelector(".btn-wager");
      if (gambleBtn) {
        if (this._lastPlayerGold !== game.player.gold) {
          gambleBtn.textContent = `GAMBLE ($${game.player.gold})`;
          this._lastPlayerGold = game.player.gold;
        }
      }

      const quipEl = document.getElementById("feed-quip");
      if (quipEl && this._lastMonsterId !== m.id)
        // Only update quip on new monster
        quipEl.textContent = `${(
          m.name || "Unknown"
        ).toUpperCase()} stomps impatiently, daring you to act.`;

      // Distance in Tiles
      const distTiles = (closestMonster.dist / (TILE_SIZE || 2)).toFixed(1);

      if (this._lastDist !== distTiles || this._lastStatus !== m.status) {
        const statusEl = document.getElementById("monster-status");
        if (statusEl)
          statusEl.textContent = `ALIVE · ${distTiles} tiles · Parley 55%`;

        // Update Chips
        const chipAc = document.getElementById("chip-ac");
        const chipDist = document.getElementById("chip-dist");
        const chipStatus = document.getElementById("chip-status");

        if (chipAc) chipAc.textContent = `AC ${m.ac || 10}`;
        if (chipDist) chipDist.textContent = `${distTiles} tiles`;
        if (chipStatus) {
          let statusText = "IDLE";
          if (closestMonster.hostile) statusText = "HOSTILE";
          else if (m.status === "gaming") {
            statusText = "GAMBLING";
            // Check for timeout (3 turns)
            const turnsPassed =
              (game.totalTurns || 0) - (m.gamblingStartTurn || 0);
            if (turnsPassed > 3) {
              m.status = "hostile";
              m.isHostile = true;
              statusText = "HOSTILE (TIMEOUT)";
              // Trigger chase logic if needed (handled by AI usually)
            }
          } else if (m.status === "ally") statusText = "ALLY";
          chipStatus.textContent = `STATUS: ${statusText}`;
        }

        this._lastDist = distTiles;
        this._lastStatus = m.status;
      }

      // Update Monster Circle Color (Gold for Gambling)
      const handle = game.monsterHandles.get(m.id);
      if (handle && handle.circles) {
        if (m.status === "gaming") {
          handle.circles.statusDisc.material.color.setHex(0xffd700); // Gold
          // Blink effect
          const blink = Math.floor(Date.now() / 500) % 2 === 0;
          handle.circles.statusDisc.material.opacity = blink ? 0.8 : 0.4;
        } else if (m.status === "ally") {
          handle.circles.statusDisc.material.color.setHex(0x22c55e); // Green
          handle.circles.statusDisc.material.opacity = 0.6;
        } else {
          handle.circles.statusDisc.material.color.setHex(0xffffff); // White/Default
          handle.circles.statusDisc.material.opacity = 0.6;
        }
      }

      // Update Trade Buttons
      const tradeContainer = document.getElementById("combat-trade-buttons");
      if (tradeContainer && tradeContainer.dataset.monsterId !== m.id) {
        tradeContainer.innerHTML = "";
        tradeContainer.dataset.monsterId = m.id;

        const craneCard = document.createElement("div");
        craneCard.className = "combat-trade-card";
        craneCard.innerHTML = `
                <div class="card-icon">🕊️</div>
                <div>Origami Crane of Peace</div>
              `;
        craneCard.onclick = () => {
          m.status = "ally";
          m.isHostile = false;
          const coreMonster = origamiCore.state.dungeon.monsters.find(
            (cm) => cm.id === m.id
          );
          if (coreMonster) {
            coreMonster.status = "ally";
            coreMonster.isHostile = false;
          }
          const handle = game.monsterHandles.get(m.id);
          if (handle)
            this.spawnFloatingText(
              handle.group.position,
              "Peace Accepted!",
              "crit"
            );
        };
        tradeContainer.appendChild(craneCard);
      }
    } else {
      game.targetMonster = null; // Clear target
      if (combatOverlay.classList.contains("active")) {
        leftPanel.classList.remove("visible");
        rightPanel.classList.remove("visible");
        const tradeContainer = document.getElementById("combat-trade-buttons");
        if (tradeContainer) {
          tradeContainer.innerHTML = "";
          tradeContainer.dataset.monsterId = "";
        }
        setTimeout(() => {
          combatOverlay.classList.remove("active");
          document.body.classList.remove("combat-active"); // Exit Combat Mode
        }, 400); // Wait for transition
      } else {
        document.body.classList.remove("combat-active");
      }

      this._lastMonsterId = null;
    }
  },
};
