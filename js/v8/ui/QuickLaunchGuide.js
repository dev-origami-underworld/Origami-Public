/** [REF#UI-01275]
 * NewOrigami v8 — Quick Launch Guide component
 * Idea Software Studio © 2026. See LICENSE for permitted use.
 *
 * An ultra-compact (~25% of screen width) frosted-glass card in a "Neon Spectre" theme:
 * fluorescent-green + electric-blue text on a dark, blurred glass panel (tuned for WCAG 2.2 AA contrast).
 * Shown AFTER the main Welcome Guide as a quick in-world refresher — keeps the live 3D scene visible behind it.
 * Highlights components using borderless, soft, pulsing circular light blooms and sequential arrow glows.
 */
export class QuickLaunchGuide {
    constructor() {
        this.overlayId = 'quick-launch-overlay';
        this.styleId = 'quick-launch-style';
    }

    show() {
        if (document.getElementById(this.overlayId)) return;
        // DISABLED 2026-07-03 (Mark: "disable quicktips for now, will think to add it later"). The Quick Launch [REF#UI-01276]
        // refresher card no longer auto-shows. Re-enable: window._quickLaunchOn = true. Logged in the
        // DISABLED-FEATURES REGISTER at the top of NewOrigami.Engine9.html.
        if (window._quickLaunchOn !== true) return;
        // "don't show this again" preference (Mark 2026-06-22) — persisted; re-enable via Settings (clears origami_ql_hide). [REF#UI-01277]
        try { if (localStorage.getItem('origami_ql_hide') === '1') return; } catch(_){}
        // Tell the engine the quick-launch window is OPEN so the moon-phase banner waits for its close (Mark 2026-06-30). [REF#UI-01278]
        this._qlClosed = false;
        try { window.parent.postMessage({ type: 'QUICK_LAUNCH_OPEN' }, '*'); } catch(_){}

        // 1. Inject Ethereal Spectre Stylesheet with Circular Light Blooms [REF#UI-01279]
        const style = document.createElement('style');
        style.id = this.styleId;
        style.innerHTML = `
            #quick-launch-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999999;
                background: transparent;
                backdrop-filter: none;
                -webkit-backdrop-filter: none;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.4s ease;
                pointer-events: none; /* Allows immediate input fallthrough to keep the game playable */
            }
            #quick-launch-overlay.is-active {
                opacity: 1;
            }
            .ql-modal {
                position: relative;
                overflow: hidden;
                /* Transparent frosted glass — heavy backdrop blur + neon text-shadows [REF#UI-01280]
                   keep the glowing copy legible (WCAG) while the scene shows through. */
                background: linear-gradient(150deg, rgba(8, 24, 18, 0.45), rgba(2, 9, 7, 0.55));
                border: 1px solid rgba(91, 255, 163, 0.28);
                border-top: 1.5px solid rgba(91, 255, 163, 0.85);    /* neon-green top edge */
                border-bottom: 1.5px solid rgba(56, 225, 255, 0.75); /* electric-blue bottom edge */
                box-shadow:
                    0 18px 50px rgba(0, 0, 0, 0.70),
                    0 0 30px rgba(91, 255, 163, 0.22),
                    0 0 60px rgba(56, 225, 255, 0.10),
                    inset 0 0 22px rgba(91, 255, 163, 0.08);
                border-radius: 18px;
                padding: 18px 20px;
                max-width: 270px;   /* Occupies ~25% of screen width */
                width: 25%;
                text-align: center;
                backdrop-filter: blur(26px) saturate(1.4);
                -webkit-backdrop-filter: blur(26px) saturate(1.4);
                transform: translateY(10px) scale(0.96);
                transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: auto;
            }
            #quick-launch-overlay.is-active .ql-modal {
                transform: translateY(0) scale(1);
            }

            /* Sweeping neon sheen across the glass to catch the eye [REF#UI-01281] */
            .ql-modal::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: 18px;
                background: linear-gradient(120deg, transparent 32%, rgba(91, 255, 163, 0.12) 50%, transparent 68%);
                background-size: 260% 100%;
                animation: ql-sheen 4.8s ease-in-out infinite;
                pointer-events: none;
            }
            .ql-modal > * { position: relative; z-index: 1; } /* keep content above the sheen */

            /* Circular Light Blooms System — borderless glowing aura spheres (neon-green) [REF#UI-01282] */
            body.ql-highlight-active #input-container {
                z-index: 10000000 !important;
                pointer-events: none !important;
                box-shadow: 0 0 45px 12px rgba(91, 255, 163, 0.55) !important;
                border-color: rgba(91, 255, 163, 0.5) !important;
            }
            body.ql-highlight-active #guides-container {
                z-index: 10000000 !important;
                pointer-events: none !important;
                box-shadow: 0 0 50px 15px rgba(91, 255, 163, 0.45) !important;
                border-color: rgba(91, 255, 163, 0.5) !important;
            }
            body.ql-highlight-active #action-rail {
                z-index: 10000000 !important;
                pointer-events: none !important;
                box-shadow: 0 0 45px 12px rgba(239, 68, 68, 0.5) !important;
                border-color: rgba(239, 68, 68, 0.5) !important;
            }
            body.ql-highlight-active #gamble-rail {
                z-index: 10000000 !important;
                pointer-events: none !important;
                box-shadow: 0 0 45px 12px rgba(56, 225, 255, 0.5) !important;
                border-color: rgba(56, 225, 255, 0.5) !important;
            }

            /* Glowing D-pad center thumb bloom (retains absolute centering) [REF#UI-01283] */
            body.ql-highlight-active .kp-center-btn {
                z-index: 10000001 !important;
                box-shadow: 0 0 40px 10px rgba(91, 255, 163, 0.8) !important;
                animation: ql-pulse-bloom 1.4s infinite alternate !important;
            }

            /* Bouncing arrow target pointers to dynamically point out components [REF#UI-01284] */
            body.ql-highlight-active #input-container::before,
            body.ql-highlight-active #action-rail::before,
            body.ql-highlight-active #gamble-rail::before,
            body.ql-highlight-active #guides-container::before {
                content: '↓';
                font-family: 'Inter', sans-serif;
                font-weight: 900;
                font-size: 20px;
                color: #5BFFA3;
                text-shadow: 0 0 10px #5BFFA3, 0 0 4px #5BFFA3;
                position: absolute;
                top: -32px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000005;
                animation: ql-pointer-bounce 0.8s infinite alternate ease-in-out;
            }

            /* Clockwise sequence animation to bloom the arrow keys one at a time [REF#UI-01285] */
            body.ql-highlight-active #left-panel .pos-n { animation: ql-arrow-bloom 4s infinite; z-index: 10000001 !important; }
            body.ql-highlight-active #left-panel .pos-e { animation: ql-arrow-bloom 4s infinite 1s; z-index: 10000001 !important; }
            body.ql-highlight-active #left-panel .pos-s { animation: ql-arrow-bloom 4s infinite 2s; z-index: 10000001 !important; }
            body.ql-highlight-active #left-panel .pos-w { animation: ql-arrow-bloom 4s infinite 3s; z-index: 10000001 !important; }

            .ql-btn-outline {
                background: transparent;
                border: 1px solid rgba(91, 255, 163, 0.40);
                color: #8CFFBE;
                border-radius: 20px;
                padding: 5px 12px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                text-shadow: 0 0 4px rgba(91, 255, 163, 0.35);
            }
            .ql-btn-outline:hover {
                border-color: #5BFFA3 !important;
                color: #C7FFDE !important;
                background: rgba(91, 255, 163, 0.10) !important;
                box-shadow: 0 0 8px rgba(91, 255, 163, 0.25);
            }

            .ql-btn-solid {
                background: linear-gradient(135deg, #5BFFA3, #38E1FF);
                border: none;
                color: #04130C;
                border-radius: 20px;
                padding: 6px 16px;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                letter-spacing: 0.3px;
                box-shadow: 0 3px 10px rgba(91, 255, 163, 0.35), 0 0 18px rgba(56, 225, 255, 0.20);
                transition: all 0.2s;
            }
            .ql-btn-solid:hover {
                filter: brightness(1.12);
                box-shadow: 0 4px 14px rgba(91, 255, 163, 0.55), 0 0 24px rgba(56, 225, 255, 0.35) !important;
            }

            @keyframes ql-sheen {
                0% { background-position: 130% 0; }
                100% { background-position: -130% 0; }
            }
            @keyframes ql-pulse-bloom {
                0% { box-shadow: 0 0 20px 8px rgba(91, 255, 163, 0.45); }
                100% { box-shadow: 0 0 40px 14px rgba(91, 255, 163, 0.85); }
            }
            @keyframes ql-pointer-bounce {
                0% { transform: translateX(-50%) translateY(0); }
                100% { transform: translateX(-50%) translateY(-5px); }
            }
            @keyframes ql-arrow-bloom {
                0%, 20% { 
                    box-shadow: 0 0 30px 10px rgba(34, 211, 238, 0.7) !important; 
                    background: rgba(34, 211, 238, 0.2) !important;
                    transform: translate(-50%, -50%) translate(var(--tx, 0px), var(--ty, 0px)) scale(1.1) !important;
                }
                25%, 100% { 
                    box-shadow: 3px 3px 10px var(--nm-shadow-dark) !important; 
                    background: var(--bg-glass) !important;
                    transform: translate(-50%, -50%) translate(var(--tx, 0px), var(--ty, 0px)) scale(1) !important;
                }
            }
            @keyframes ql-pulse-text {
                0% { opacity: 0.4; }
                100% { opacity: 0.8; }
            }
        `;
        document.head.appendChild(style);

        // 2. Inject Modal Overlay into DOM [REF#UI-01286]
        // i18n: resolve quick-guide copy in the active locale at build time
        // (transient modal, rebuilt each show() → no live re-translate needed).
        const _ql = (k, fb) => { const v = (window.t && window.t(k, window.currentLang)); return (v && v !== k) ? v : fb; };
        const overlay = document.createElement('div');
        overlay.id = this.overlayId;
        overlay.innerHTML = `
            <div class="ql-modal" role="dialog" aria-modal="true" aria-labelledby="ql-title-text">
                <div style="display: inline-block; background: linear-gradient(135deg, #5BFFA3, #38E1FF); color: #04130C; border-radius: 20px; padding: 3px 10px; font-size: 8px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; margin-bottom: 9px; box-shadow: 0 3px 10px rgba(91,255,163,0.35);">
                    ${_ql('ql.pill', '⚡ Quick Launch')}
                </div>
                <h2 id="ql-title-text" style="margin: 0 0 9px; color: #5BFFA3; font-family: 'Noto Serif JP', 'Georgia', serif; font-weight: 800; font-size: 16px; letter-spacing: 0.5px; text-shadow: 0 0 12px rgba(91,255,163,0.65), 0 1px 4px rgba(0,0,0,0.6);">
                    ${_ql('ql.title', 'Move &middot; Fight &middot; Wager')}
                </h2>
                <div style="color: #E8FFF4; font-family: 'Inter', sans-serif; font-size: 10.5px; line-height: 1.75; margin: 0 0 12px; font-weight: 400; text-align: left;">
                    ${_ql('ql.body', 'Steer with <strong style="color: #5BFFA3;">WASD</strong> or the <strong style="color: #5BFFA3;">arrows</strong>. Lock onto any foe, then <strong style="color: #38E1FF;">ATTACK</strong> to strike &mdash; or <strong style="color: #38E1FF;">WAGER</strong> to gamble your fate at the table.')}
                </div>
                <div style="color: #38E1FF; font-family: 'Noto Serif JP', 'Georgia', serif; font-size: 12.5px; margin: 6px 0 16px; font-weight: bold; text-shadow: 0 0 12px rgba(56,225,255,0.7), 0 1px 3px rgba(0,0,0,0.6); letter-spacing: 0.5px;">
                    ${_ql('ql.subtitle', 'Your move, traveler.')}
                </div>

                <!-- Single forward action (this is a one-card refresher, not a multi-page guide) [REF#UI-01287] -->
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; width: 100%;">
                    <button type="button" class="ql-btn-outline ql-trigger-close">${_ql('ql.skip', 'Skip')}</button>
                    <button type="button" class="ql-btn-solid ql-trigger-close">${_ql('ql.enter', 'Enter the Underworld &rarr;')}</button>
                </div>

                <!-- Dismiss-persist toggle — pointer-events:auto so it's clickable through the pass-through overlay (Mark 2026-06-22) [REF#UI-01288] -->
                <div id="ql-dont-show-row" style="display: flex; align-items: center; gap: 5px; margin-top: 14px; font-size: 9px; color: #A8F0CC; text-align: left; pointer-events: auto;">
                    <input type="checkbox" id="ql-dont-show" style="accent-color: #5BFFA3; cursor: pointer;">
                    <label for="ql-dont-show" style="cursor: pointer; user-select: none;">${_ql('ql.dont_show', "don't show this again")}</label>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // 3. Highlight the input field text placeholder for WCAG 2.2 [REF#UI-01289]
        const inputEl = document.querySelector('.chat-input');
        let origPlaceholder = '';
        if (inputEl) {
            origPlaceholder = inputEl.placeholder;
            inputEl.placeholder = _ql('ql.placeholder', 'Fight monsters or Wager');
        }

        // Apply visual highlights to layout [REF#UI-01290]
        document.body.classList.add('ql-highlight-active');
        
        // Force reflow and activate transitions [REF#UI-01291]
        void overlay.offsetWidth;
        overlay.classList.add('is-active');

        // 4. Dismiss modal on any user action, letting the event pass through to the game element naturally [REF#UI-01292]
        const dismiss = (e) => {
            // Don't dismiss while the user is toggling the "don't show again" checkbox/label (Mark 2026-06-22). [REF#UI-01293]
            if (e && e.target && (e.target.id === 'ql-dont-show' || (e.target.closest && e.target.closest('#ql-dont-show-row')))) return;
            // Persist the preference if the box is checked. [REF#UI-01294]
            try { const _cb = document.getElementById('ql-dont-show'); if (_cb && _cb.checked) localStorage.setItem('origami_ql_hide', '1'); } catch(_){}
            // Remove listeners immediately [REF#UI-01295]
            document.removeEventListener('keydown', dismiss, true);
            document.removeEventListener('mousedown', dismiss, true);
            // Quick-launch window closed → let the engine show the moon-phase banner now (once). Mark 2026-06-30. [REF#UI-01296]
            if (!this._qlClosed){ this._qlClosed = true; try { window.parent.postMessage({ type: 'QUICK_LAUNCH_CLOSE' }, '*'); } catch(_){} }

            // Animate fade away [REF#UI-01297]
            overlay.classList.remove('is-active');
            document.body.classList.remove('ql-highlight-active');

            if (inputEl) {
                inputEl.placeholder = origPlaceholder;
            }

            // Teardown DOM elements after animation completes [REF#UI-01298]
            setTimeout(() => {
                overlay.remove();
                style.remove();
            }, 450);
        };

        // Capture document events to trigger dismissal without preventing default actions (no freeze!) [REF#UI-01299]
        document.addEventListener('keydown', dismiss, true);
        document.addEventListener('mousedown', dismiss, true);
        
        // Close modal when standard buttons are explicitly clicked too [REF#UI-01300]
        overlay.querySelectorAll('.ql-trigger-close').forEach(btn => {
            btn.addEventListener('click', dismiss);
        });
    }
}
