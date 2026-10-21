/** [REF#UI-00059]
 * NewOrigami v8 — Mercy Scroll History module
 * Idea Software Studio © 2026. See LICENSE for permitted use.
 *
 * Displays a right-side sliding panel tracking spared vs defeated monsters.
 * Persists history across floor transitions via localStorage.
 */
export class MercyScroll {
    constructor() {
        this.containerId = 'mercy-scroll-panel';
        this.toggleId = 'mercy-scroll-toggle';
        this.storageKey = 'origami_mercy_scroll_history';
        
        // Load persisted history [REF#UI-00060]
        this.history = this._loadHistory();
        this._injected = false;
        
        // Tracking seen IDs in this session to prevent double logs [REF#UI-00061]
        this._processedIds = new Set();
        
        // Mapping of monster name keywords to decorative Kanji [REF#UI-00062]
        this.kanjiMap = {
            'goblin': ['鬼', '貪', '小', '地', '戦', '狂'],
            'imp': ['魔', '炎', '妖', '忍', '影', '悪'],
            'mushroom': ['茸', '菌', '眠', '静', '森', '草'],
            'sentry': ['茸', '菌', '眠', '静', '森', '草'],
            'default': ['生', '死', '魂', '和', '慈', '悲']
        };

        this.haikus = [
            "Moonlight through the trees, a blade returned to its sheath.",
            "Dew on autumn grass, two paths diverge in the dark.",
            "Shadows of the cave, a heartbeat quiet and still.",
            "Whisper in the wind, a hand extended in peace.",
            "Quiet grove of pine, a silent bow of respect.",
            "Underworld shadows, soft water drips on the stone.",
            "Calm reflection pool, the naga sleeps in the deep.",
            "Mushroom in the moss, sleeping under starry sky."
        ];
    }

    _loadHistory() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.spared) && Array.isArray(parsed.defeated)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn("[MercyScroll] Load history failed:", e);
        }
        return { spared: [], defeated: [] };
    }

    _saveHistory() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        } catch (e) {
            console.warn("[MercyScroll] Save history failed:", e);
        }
    }

    inject() {
        if (this._injected) return;
        this._injected = true;

        // Injected CSS [REF#UI-00063]
        if (!document.getElementById('mercy-scroll-style')) {
            const style = document.createElement('style');
            style.id = 'mercy-scroll-style';
            style.textContent = this._css();
            document.head.appendChild(style);
        }

        // Toggle button [REF#UI-00064]
        const toggleBtn = document.createElement('button');
        toggleBtn.id = this.toggleId;
        toggleBtn.title = "Mercy Scroll — Spared & Defeated History";
        toggleBtn.setAttribute('aria-label', "Open Mercy Scroll");
        toggleBtn.innerHTML = `
            <i class="fa-solid fa-scroll"></i>
            <span id="mercy-scroll-badge" class="mercy-badge">0</span>
        `;
        toggleBtn.addEventListener('click', () => this.toggle());
        document.body.appendChild(toggleBtn);

        // Sidebar panel [REF#UI-00065]
        const panel = document.createElement('div');
        panel.id = this.containerId;
        panel.className = 'mercy-scroll-panel';
        panel.innerHTML = `
            <div class="mercy-header">
                <div class="mercy-title">MERCY SCROLL <span class="mercy-kanji-sub">◆ 慈悲の書</span></div>
                <button class="mercy-close" aria-label="Close panel">&times;</button>
            </div>
            <div class="mercy-summary" id="mercy-summary-text">
                Spared: 0 | Defeated: 0
            </div>
            <div class="mercy-list" id="mercy-list-container">
                <!-- Entries dynamic [REF#UI-00066] -->
            </div>
            <button class="mercy-clear-btn" id="mercy-clear-btn">CLEAR HISTORY</button>
        `;
        
        panel.querySelector('.mercy-close').addEventListener('click', () => this.close());
        panel.querySelector('#mercy-clear-btn').addEventListener('click', () => this.clearHistory());
        
        document.body.appendChild(panel);
        this.updateUI();
    }

    toggle() {
        const panel = document.getElementById(this.containerId);
        if (panel) {
            panel.classList.toggle('active');
            if (panel.classList.contains('active')) {
                this.updateUI();
            }
        }
    }

    close() {
        const panel = document.getElementById(this.containerId);
        if (panel) panel.classList.remove('active');
    }

    clearHistory() {
        if (confirm("Are you sure you want to clear your Mercy Scroll history?")) {
            this.history = { spared: [], defeated: [] };
            this._processedIds.clear();
            this._saveHistory();
            this.updateUI();
        }
    }

    _getKanji(name) {
        const n = String(name || '').toLowerCase();
        let list = this.kanjiMap.default;
        if (n.includes('goblin')) list = this.kanjiMap.goblin;
        else if (n.includes('imp')) list = this.kanjiMap.imp;
        else if (n.includes('mushroom') || n.includes('sentry')) list = this.kanjiMap.mushroom;
        return list[Math.floor(Math.random() * list.length)];
    }

    _getRandomHaiku() {
        return this.haikus[Math.floor(Math.random() * this.haikus.length)];
    }

    recordSpared(id, name) {
        if (!id) id = 'unknown_' + Date.now();
        if (this._processedIds.has(id)) return;
        this._processedIds.add(id);

        // Remove from defeated if present (in case of double triggers) [REF#UI-00067]
        this.history.defeated = this.history.defeated.filter(item => item.id !== id);

        const kanji = this._getKanji(name);
        const haiku = this._getRandomHaiku();
        
        this.history.spared.push({
            id,
            name: name || 'Yakuza Goblin',
            kanji,
            haiku,
            timestamp: Date.now()
        });

        this._saveHistory();
        this.updateUI();
    }

    recordDefeated(id, name) {
        if (!id) id = 'unknown_' + Date.now();
        if (this._processedIds.has(id)) return;
        this._processedIds.add(id);

        this.history.defeated.push({
            id,
            name: name || 'Yakuza Goblin',
            timestamp: Date.now()
        });

        this._saveHistory();
        this.updateUI();
    }

    handleMessage(msg) {
        if (!msg || !msg.type) return;

        // 1. Spared Monster Hook (AI_DEATH with peace: true) [REF#UI-00068]
        if (msg.type === 'AI_DEATH' && msg.peace) {
            const id = msg.targetId || msg.id;
            let name = msg.name;
            if (!name) {
                const monNameEl = document.getElementById('monster-name');
                if (monNameEl) name = monNameEl.textContent;
            }
            this.recordSpared(id, name);
        }
        
        // 2. Defeated Monster Hook (AI_DEATH without peace, or MONSTER_DEATH) [REF#UI-00069]
        else if (msg.type === 'AI_DEATH' && !msg.peace) {
            const id = msg.targetId || msg.id;
            let name = msg.name;
            if (!name) {
                const monNameEl = document.getElementById('monster-name');
                if (monNameEl) name = monNameEl.textContent;
            }
            this.recordDefeated(id, name);
        }
        
        else if (msg.type === 'SYNC_UI' && msg.event === 'MONSTER_DEATH') {
            const id = msg.id;
            let name = msg.name;
            if (!name) {
                const monNameEl = document.getElementById('monster-name');
                if (monNameEl) name = monNameEl.textContent;
            }
            this.recordDefeated(id, name);
        }
    }

    updateUI() {
        const badge = document.getElementById('mercy-scroll-badge');
        const summary = document.getElementById('mercy-summary-text');
        const container = document.getElementById('mercy-list-container');
        
        if (badge) {
            badge.textContent = this.history.spared.length;
            badge.style.display = this.history.spared.length > 0 ? 'flex' : 'none';
        }

        if (summary) {
            summary.textContent = `Spared: ${this.history.spared.length} | Defeated: ${this.history.defeated.length}`;
        }

        if (container) {
            container.innerHTML = '';
            
            // Combine both spared and defeated items, sort by newest [REF#UI-00070]
            const all = [
                ...this.history.spared.map(s => ({ ...s, isSpared: true })),
                ...this.history.defeated.map(d => ({ ...d, isSpared: false }))
            ];
            all.sort((a, b) => b.timestamp - a.timestamp);

            if (all.length === 0) {
                container.innerHTML = `
                    <div class="mercy-empty-state">
                        📜 The scroll is currently empty.<br/>Prove your compassion or strike down hostiles to record details.
                    </div>
                `;
                return;
            }

            all.forEach(item => {
                if (item.isSpared) {
                    container.innerHTML += `
                        <div class="mercy-card spared">
                            <div class="card-head">
                                <span class="badge spared">SPARED</span>
                                <span class="kanji">${item.kanji}</span>
                            </div>
                            <div class="name">${item.name.toUpperCase()}</div>
                            <div class="haiku">"${item.haiku}"</div>
                        </div>
                    `;
                } else {
                    container.innerHTML += `
                        <div class="mercy-card defeated">
                            <div class="card-head">
                                <span class="badge defeated">DEFEATED</span>
                                <span class="skull">χ</span>
                            </div>
                            <div class="name">${item.name.toUpperCase()}</div>
                            <div class="grave-text">Rest in shadows...</div>
                        </div>
                    `;
                }
            });
        }
    }

    _css() {
        return `
            #mercy-scroll-toggle {
                position: fixed;
                right: 20px;
                top: 60px;
                z-index: 40000;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: rgba(20, 20, 25, 0.85);
                border: 1.5px solid rgba(168, 85, 247, 0.4);
                color: #e9d5ff;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                outline: none;
            }
            #mercy-scroll-toggle:hover {
                transform: scale(1.1) rotate(15deg);
                border-color: rgba(168, 85, 247, 0.8);
                box-shadow: 0 0 12px rgba(168, 85, 247, 0.5);
            }
            #mercy-scroll-toggle i {
                font-size: 16px;
            }
            .mercy-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #a855f7;
                color: #ffffff;
                font: bold 9px monospace;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid #000;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .mercy-scroll-panel {
                position: fixed;
                top: 0;
                right: -320px;
                width: 320px;
                height: 100vh;
                background: rgba(15, 15, 20, 0.98);
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                border-left: 2px solid rgba(168, 85, 247, 0.3);
                box-shadow: -10px 0 30px rgba(0, 0, 0, 0.85);
                transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 48000;
                color: #f3f4f6;
                display: flex;
                flex-direction: column;
                padding: 24px;
                box-sizing: border-box;
                font-family: 'Outfit', 'Inter', sans-serif;
            }
            .mercy-scroll-panel.active {
                right: 0;
            }

            .mercy-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1.5px solid rgba(168, 85, 247, 0.2);
                padding-bottom: 12px;
                flex-shrink: 0;
            }
            .mercy-title {
                font-family: 'Cinzel', 'Noto Serif JP', serif;
                font-size: 15px;
                font-weight: 900;
                letter-spacing: 1.5px;
                color: #e9d5ff;
                text-shadow: 0 0 8px rgba(168, 85, 247, 0.5);
            }
            .mercy-kanji-sub {
                font-size: 10px;
                opacity: 0.6;
                letter-spacing: 0.5px;
            }
            .mercy-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.5);
                font-size: 26px;
                cursor: pointer;
                transition: color 0.2s;
                outline: none;
                line-height: 1;
            }
            .mercy-close:hover {
                color: #f87171;
            }

            .mercy-summary {
                font-size: 10px;
                color: #a78bfa;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                margin: 12px 0 4px;
                text-align: center;
                flex-shrink: 0;
                font-weight: 700;
            }

            .mercy-list {
                flex-grow: 1;
                overflow-y: auto;
                padding-right: 4px;
                margin: 8px 0;
                scrollbar-width: thin;
                scrollbar-color: rgba(168, 85, 247, 0.4) transparent;
            }
            .mercy-list::-webkit-scrollbar {
                width: 4px;
            }
            .mercy-list::-webkit-scrollbar-thumb {
                background: rgba(168, 85, 247, 0.4);
                border-radius: 2px;
            }

            .mercy-empty-state {
                font-size: 11px;
                color: #9ca3af;
                text-align: center;
                margin-top: 40px;
                line-height: 1.6;
                font-style: italic;
            }

            .mercy-card {
                background: rgba(255, 255, 255, 0.02);
                border-radius: 12px;
                padding: 12px 14px;
                margin-bottom: 12px;
                box-sizing: border-box;
                border: 1px solid rgba(255, 255, 255, 0.05);
                transition: all 0.25s ease;
            }
            .mercy-card.spared {
                border-left: 3px solid #10b981;
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
            }
            .mercy-card.defeated {
                border-left: 3px solid #ef4444;
                background: linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
            }
            .mercy-card:hover {
                transform: translateX(2px);
                background: rgba(255, 255, 255, 0.04);
            }

            .card-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 6px;
            }
            .badge {
                font-size: 8px;
                font-weight: 800;
                padding: 2px 6px;
                border-radius: 4px;
                letter-spacing: 0.5px;
            }
            .badge.spared {
                background: rgba(16, 185, 129, 0.15);
                color: #34d399;
                border: 1px solid rgba(16, 185, 129, 0.3);
            }
            .badge.defeated {
                background: rgba(239, 68, 68, 0.15);
                color: #f87171;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }
            
            .kanji {
                font-family: 'Noto Serif JP', serif;
                font-size: 15px;
                font-weight: 700;
                color: #a78bfa;
                text-shadow: 0 0 5px rgba(167, 139, 250, 0.5);
            }
            .skull {
                font-size: 14px;
                color: #f87171;
                opacity: 0.8;
            }

            .name {
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 1px;
                margin-bottom: 6px;
                color: #e5e7eb;
            }
            .mercy-card.defeated .name {
                text-decoration: line-through;
                opacity: 0.5;
            }

            .haiku {
                font-size: 10px;
                font-style: italic;
                color: #9ca3af;
                line-height: 1.4;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                padding-top: 6px;
            }

            .grave-text {
                font-size: 9px;
                font-style: italic;
                color: #6b7280;
                letter-spacing: 0.5px;
            }

            .mercy-clear-btn {
                background: rgba(239, 68, 68, 0.08);
                border: 1px solid rgba(239, 68, 68, 0.2);
                color: #f87171;
                font-weight: 800;
                font-size: 9px;
                padding: 8px;
                border-radius: 6px;
                cursor: pointer;
                letter-spacing: 1px;
                text-transform: uppercase;
                transition: all 0.2s;
                outline: none;
                flex-shrink: 0;
                width: 100%;
                text-align: center;
                margin-top: 8px;
            }
            .mercy-clear-btn:hover {
                background: rgba(239, 68, 68, 0.18);
                border-color: rgba(239, 68, 68, 0.45);
                color: #ffffff;
            }
        `;
    }
}
