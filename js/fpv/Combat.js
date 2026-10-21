class CombatSystem {
    constructor() {
        this.fctContainer = document.getElementById('fct-container');
        this.activeMultiplier = 1.0; // Tracks player buff/debuff
    }

    // FCT: Floating Combat Text Spawner
    spawnCombatText(text, type = 'hit') {
        if (!this.fctContainer) {
            this.fctContainer = document.getElementById('fct-container');
            if(!this.fctContainer) return;
        }
        
        const el = document.createElement('div');
        el.className = `combat-text ${type}`;
        el.innerText = text;
        
        // Add slight randomization to X/Y to avoid perfectly overlapping text
        const offsetX = (Math.random() - 0.5) * 10; // +/- 5% screen width
        const offsetY = (Math.random() - 0.5) * 10; // +/- 5% screen height
        
        el.style.left = `calc(50% + ${offsetX}%)`;
        el.style.top = `calc(50% + ${offsetY}%)`;
        
        this.fctContainer.appendChild(el);
        
        // Push Combat Roll directly to Event Log
        let logClass = 'combat';
        if (type === 'damage' || type === 'critical') logClass = 'damage';
        if (type === 'miss') logClass = 'system';
        window.parent.postMessage({ type: 'LOG_EVENT', text: text, logType: logClass }, '*');
        
        // Cleanup after animation completes (1.2s cubic-bezier)
        setTimeout(() => {
            if (el.parentNode === this.fctContainer) {
                this.fctContainer.removeChild(el);
            }
        }, 1300);
    }

    resolveMeleeStrike(attackerName, baseDamageRoll, engineCallback) {
        // THAC0 System (To Hit Armor Class Zero)
        // A d20 is rolled. If (d20 >= THAC0 - TargetAC), it's a hit.
        let THAC0 = 15; 
        let TargetAC = 5; 
        
        if (attackerName !== 'Player') {
            THAC0 = 18; // Worse at hitting
            TargetAC = 2; // Player has better armor
        }
        
        const d20 = Math.floor(Math.random() * 20) + 1;
        const targetNumber = THAC0 - TargetAC;
        
        // Crit mechanics (Natural 20 always hits & crits, Natural 1 always misses)
        let isHit = d20 >= targetNumber;
        let isCrit = d20 >= 19; // Expanded threat range for visual fun
        let isFumble = d20 === 1;
        
        // Add screen flash overlays
        this.flashScreen(attackerName, isCrit);
        
        if (isFumble || (!isHit && !isCrit)) {
            this.spawnCombatText(`${attackerName.toUpperCase()} MISSES`, "miss");
            if (attackerName === 'Player') this.activeMultiplier = 1.0; // Consume buff on miss
            return 0; 
        } 
        
        let finalDamage = baseDamageRoll;
        let type = 'hit';
        
        if (isCrit) {
            finalDamage = Math.floor(baseDamageRoll * 2.5); // Punishing crits
            type = 'crit';
        } else {
            // Apply armor mitigation (Damage = Base * (1 - (TargetAC * 0.05)))
            const mitigation = Math.max(0, TargetAC * 0.05); // Max 50% mitigation
            finalDamage = Math.max(1, Math.floor(baseDamageRoll * (1 - mitigation)));
        }
        
        // Apply Gamble Multiplier if Player
        if (attackerName === 'Player') {
            finalDamage = Math.floor(finalDamage * this.activeMultiplier);
            // Reset state
            this.activeMultiplier = 1.0; 
        }

        const msg = isCrit ? `${attackerName.toUpperCase()} CRITS ${finalDamage}!` : `${attackerName.toUpperCase()} HITS ${finalDamage}`;
        this.spawnCombatText(msg, type);

        if (engineCallback) engineCallback(finalDamage);
        
        return finalDamage;
    }
    
    flashScreen(attackerName, isCrit) {
        // AAA Screen-space hit flashes
        const flashId = 'combat-screen-flash';
        let flash = document.getElementById(flashId);
        if (!flash) {
            flash = document.createElement('div');
            flash.id = flashId;
            flash.style.position = 'absolute';
            flash.style.top = '0';
            flash.style.left = '0';
            flash.style.width = '100vw';
            flash.style.height = '100vh';
            flash.style.pointerEvents = 'none'; // Click through
            flash.style.zIndex = '9999';
            flash.style.opacity = '0';
            flash.style.transition = 'opacity 0.1s ease-out';
            document.body.appendChild(flash);
        }
        
        // Flash Red if Player takes damage. Flash White if Player deals Crit damage.
        if (attackerName !== 'Player') {
            flash.style.backgroundColor = 'rgba(255, 0, 0, 0.4)'; // Blood vignette
            flash.style.boxShadow = 'inset 0 0 100px rgba(255,0,0,0.8)';
            flash.style.opacity = '1';
        } else if (isCrit) { // Player Crits
            flash.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; // Holy hit
            flash.style.boxShadow = 'none';
            flash.style.opacity = '1';
        } else {
            return; // No flash
        }
        
        // Decay overlay rapidly naturally
        setTimeout(() => {
            flash.style.transition = 'opacity 0.5s ease-in';
            flash.style.opacity = '0';
        }, 50);
    }

    resolveWager(betType, wagerScore) {
        // Core gamble mechanic matrix
        const outcome = { won: false, multiplier: 1.0 };
        
        // Let's use the explicit wage score if passed, or fallback roll
        const activeRoll = wagerScore ? wagerScore : (Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1);
        const isEven = activeRoll % 2 === 0;

        outcome.won = ((betType === 'BET EVEN' || betType === 'BET_EVEN') && isEven) || ((betType === 'BET ODD' || betType === 'BET_ODD') && !isEven);

        if (outcome.won) {
            this.spawnCombatText("GAMBLE WON!", "crit");
            this.activeMultiplier = 2.0; // Double next strike!
            outcome.multiplier = 2.0; 
        } else {
            this.spawnCombatText("GAMBLE LOST!", "damage");
            this.activeMultiplier = 0.5; // Weak next strike!
            outcome.multiplier = 0.5; 
        }

        return outcome;
    }
}

// Global exposure for non-module integration
// Defer instantiation until DOM is ready so getElementById('fct-container') succeeds
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.CombatEngine = new CombatSystem();
    });
} else {
    // DOM already parsed (e.g. script loaded via defer or after body)
    window.CombatEngine = new CombatSystem();
}
