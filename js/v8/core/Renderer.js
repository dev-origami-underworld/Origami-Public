/** [REF#CR-00066]
 * Renderer.js — Safe render pipeline wrapper
 * Protects against Three.js and effect composer crashes.
 */

export class SafeRenderer {
    constructor(rendererRef) {
        this.renderer = rendererRef || (typeof window !== 'undefined' ? window.renderer : null);
        this.contextLost = false;
        this.recoveryAttempts = 0;
        this.lastErrorTime = 0;
        this.errorCount = 0;
        this.successfulRenderCount = 0;
        this.lastNullLogTime = 0;
        this.recoveryTimeout = null;
        // Recovery tuning (2026-06-12 fix): a real GPU-process crash takes ~2-5s to relaunch, [REF#CR-00067]
        // during which NO new WebGL context can be created. The old path force-recreated at 1500ms,
        // failed once, and gave up FOREVER (frozen screen). Now: give the browser's own
        // webglcontextrestored a grace window first, then force-recreate with exponential backoff.
        this.retryTimer = null;
        this.recreateAttempts = 0;
        this.maxRecreateAttempts = 6;          // ~1+2+4+8+8+8s ≈ 31s of retry headroom for the GPU to return [REF#CR-00068]
        this.restoreGraceMs = 2500;            // wait this long for the browser's free restore before forcing recreation [REF#CR-00069]

        if (this.renderer && this.renderer.domElement) {
            this.setupContextListeners(this.renderer.domElement);
        }
    }

    setupContextListeners(domElement) {
        if (!domElement) return;
        
        // Prevent multiple duplicate listeners [REF#CR-00070]
        if (domElement._hasSafeRendererListeners) return;
        domElement._hasSafeRendererListeners = true;

        domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn("SafeRenderer: WebGL context lost caught!");
            this.contextLost = true;
            this.recreateAttempts = 0;   // fresh recovery cycle — reset the backoff counter [REF#CR-00071]

            // Broadcast the anomaly event to Oni-Baba or parent [REF#CR-00072]
            if (typeof window !== 'undefined' && window.parent) {
                window.parent.postMessage({
                    type: 'ENGINE_ANOMALY',
                    error: 'WebGL Context Lost (GPU crash)',
                    stack: 'SafeRenderer webglcontextlost event listener',
                    count: ++this.errorCount
                }, '*');
            }

            // Give the browser's OWN context restoration a grace window first (cheapest, safest [REF#CR-00073]
            // path — it restores the SAME context and Three.js re-uploads resources lazily). Only
            // if that window elapses with no restore do we force a (retrying) recreation.
            if (this.recoveryTimeout) clearTimeout(this.recoveryTimeout);
            this.recoveryTimeout = setTimeout(() => {
                console.warn(`SafeRenderer: ${this.restoreGraceMs}ms grace elapsed without automatic context restoration. Forcing recreation (with retry/backoff)...`);
                this.recreateRenderer();
            }, this.restoreGraceMs);
        }, false);

        domElement.addEventListener('webglcontextrestored', () => {
            console.log("SafeRenderer: WebGL context restored! Re-initializing renderer and composer.");
            this.contextLost = false;
            this.recoveryAttempts++;

            // The browser restored the SAME context — the clean path won. Cancel any pending [REF#CR-00074]
            // forced-recreation and its backoff retries so we don't needlessly spin up a 2nd renderer.
            if (this.recoveryTimeout) {
                clearTimeout(this.recoveryTimeout);
                this.recoveryTimeout = null;
            }
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
                this.retryTimer = null;
            }
            this.recreateAttempts = 0;

            if (this.renderer) {
                try {
                    this.renderer.resetState();
                } catch (err) {
                    console.error("SafeRenderer: Error resetting renderer state:", err);
                }
            }

            // Let's also look up global composer if it exists [REF#CR-00075]
            const activeComposer = (typeof window !== 'undefined' ? window.composer : null);
            if (activeComposer) {
                try {
                    activeComposer.setSize(window.innerWidth, window.innerHeight);
                    console.log("SafeRenderer: Re-initialized EffectComposer size and targets successfully.");
                } catch (err) {
                    console.error("SafeRenderer: Failed to reset composer size on context restore:", err);
                }
            }
        }, false);
    }

    recreateRenderer() {
        console.log("SafeRenderer: Performing hard recreation of WebGLRenderer and Post-Processing Stack.");
        
        if (this.recoveryTimeout) {
            clearTimeout(this.recoveryTimeout);
            this.recoveryTimeout = null;
        }

        // A late browser restore may have already cleared the lost state — don't spin up a [REF#CR-00076]
        // redundant renderer on top of a healthy context.
        if (!this.contextLost) {
            console.log("SafeRenderer: context already restored before forced recreation ran — skipping.");
            return;
        }

        const THREE = typeof window !== 'undefined' ? window.THREE : null;
        if (!THREE) {
            console.error("SafeRenderer: Cannot recreate renderer because window.THREE is unavailable.");
            return;
        }

        const oldRenderer = this.renderer;
        let oldCanvas = null;
        if (oldRenderer) {
            try {
                oldCanvas = oldRenderer.domElement;
                oldRenderer.dispose();
            } catch (err) {
                console.error("SafeRenderer: Error disposing old renderer:", err);
            }
        }

        // 1. Instantiate fresh WebGLRenderer [REF#CR-00077]
        let newRenderer;
        try {
            newRenderer = new THREE.WebGLRenderer({
                antialias: false,
                powerPreference: 'high-performance',
                preserveDrawingBuffer: true
            });
            newRenderer.setPixelRatio(1.0);
            newRenderer.setSize(window.innerWidth, window.innerHeight);
            newRenderer.shadowMap.enabled = true;
            newRenderer.debug.checkShaderErrors = false;
            newRenderer.shadowMap.type = THREE.PCFShadowMap;
        } catch (err) {
            // GPU context creation failed — almost always because the GPU process is still [REF#CR-00078]
            // restarting after the crash. DON'T give up (the old bug): retry with exponential
            // backoff. The browser's webglcontextrestored may also fire meanwhile and cancel us.
            this.recreateAttempts++;
            if (this.recreateAttempts <= this.maxRecreateAttempts) {
                const backoff = Math.min(8000, 1000 * Math.pow(2, this.recreateAttempts - 1));
                console.warn(`SafeRenderer: GPU context not available yet (attempt ${this.recreateAttempts}/${this.maxRecreateAttempts}) — GPU process likely still relaunching. Retrying in ${backoff}ms.`, err && err.message || err);
                if (this.retryTimer) clearTimeout(this.retryTimer);
                this.retryTimer = setTimeout(() => { this.retryTimer = null; this.recreateRenderer(); }, backoff);
            } else {
                console.error(`SafeRenderer: GPU context could not be recreated after ${this.maxRecreateAttempts} attempts — the GPU is likely out of memory. A page reload is required.`, err && err.message || err);
                // Surface a FATAL anomaly so Oni-Baba can narrate the recovery/reload recipe. [REF#CR-00079]
                if (typeof window !== 'undefined' && window.parent) {
                    window.parent.postMessage({
                        type: 'ENGINE_ANOMALY',
                        error: 'WebGL context unrecoverable (GPU OOM/crash) — reload required',
                        stack: 'SafeRenderer.recreateRenderer exhausted retries',
                        count: ++this.errorCount
                    }, '*');
                }
            }
            return;
        }
        // New context created successfully — clear the backoff state. [REF#CR-00080]
        this.recreateAttempts = 0;
        if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }

        // 2. Swap canvas in DOM [REF#CR-00081]
        if (oldCanvas && oldCanvas.parentNode) {
            try {
                oldCanvas.parentNode.replaceChild(newRenderer.domElement, oldCanvas);
            } catch (err) {
                console.error("SafeRenderer: Failed to swap canvas elements in DOM:", err);
                document.body.appendChild(newRenderer.domElement);
            }
        } else {
            document.body.appendChild(newRenderer.domElement);
        }

        // 3. Update global references [REF#CR-00082]
        this.renderer = newRenderer;
        if (typeof window !== 'undefined') {
            window.renderer = newRenderer;
            if (window._setGlobalRenderer) {
                window._setGlobalRenderer(newRenderer);
            }
        }

        // 4. Re-attach listeners to the new canvas [REF#CR-00083]
        this.setupContextListeners(newRenderer.domElement);

        // 5. Rebuild the post-processing stack if a global composer was active [REF#CR-00084]
        const activeScene = typeof window !== 'undefined' ? window.scene : null;
        const activeCamera = typeof window !== 'undefined' ? window.camera : null;

        if (activeScene && activeCamera) {
            try {
                const newComposer = new THREE.EffectComposer(newRenderer);
                newComposer.addPass(new THREE.RenderPass(activeScene, activeCamera));

                // Recreate outline pass [REF#CR-00085]
                const newOutlinePass = new THREE.OutlinePass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight),
                    activeScene,
                    activeCamera
                );
                newOutlinePass.edgeStrength = 1.2;
                newOutlinePass.edgeGlow = 0.48;
                newOutlinePass.edgeThickness = 0.125;
                newOutlinePass.pulsePeriod = 0;
                newOutlinePass.visibleEdgeColor.setRGB(0, 2.4, 1.8);
                newOutlinePass.hiddenEdgeColor.setHex(0x000000);
                if (newOutlinePass.prepareMaskMaterial) newOutlinePass.prepareMaskMaterial.skinning = true;
                if (newOutlinePass.depthMaterial) newOutlinePass.depthMaterial.skinning = true;
                if (newOutlinePass.renderMaterial) newOutlinePass.renderMaterial.skinning = true;
                
                // Carry over selected objects if they existed [REF#CR-00086]
                newOutlinePass.selectedObjects = window.outlinePass ? (window.outlinePass.selectedObjects || []) : [];
                newComposer.addPass(newOutlinePass);

                // Recreate bokeh pass if it existed [REF#CR-00087]
                let newBokehPass = null;
                if (window.bokehPass) {
                    try {
                        newBokehPass = new THREE.BokehPass(activeScene, activeCamera, {
                            focus: 5.0,
                            aperture: 0.0009,
                            maxblur: 0.006,
                            width: window.innerWidth,
                            height: window.innerHeight,
                        });
                        newBokehPass.enabled = window.bokehPass.enabled;
                        newComposer.addPass(newBokehPass);
                    } catch (e) {
                        console.warn("SafeRenderer: Recreating BokehPass failed:", e);
                    }
                }

                // CopyShader pass [REF#CR-00088]
                if (THREE.CopyShader) {
                    const newCopyPass = new THREE.ShaderPass(THREE.CopyShader);
                    newCopyPass.renderToScreen = true;
                    newComposer.addPass(newCopyPass);
                }

                // Update composer globals [REF#CR-00089]
                if (typeof window !== 'undefined') {
                    window.composer = newComposer;
                    window.outlinePass = newOutlinePass;
                    if (window._setGlobalComposer) {
                        window._setGlobalComposer(newComposer);
                    }
                    if (window._setGlobalOutlinePass) {
                        window._setGlobalOutlinePass(newOutlinePass);
                    }
                    if (newBokehPass && window._setGlobalBokehPass) {
                        window._setGlobalBokehPass(newBokehPass);
                    }
                }
                console.log("SafeRenderer: EffectComposer and passes reconstructed successfully.");
            } catch (err) {
                console.error("SafeRenderer: Failed to rebuild post-processing composer:", err);
            }
        } else {
            console.warn("SafeRenderer: Cannot rebuild composer, scene or camera references are missing on window.");
        }

        // Successfully recreated and set up everything, now safe to reset contextLost [REF#CR-00090]
        this.contextLost = false;
    }

    /** [REF#CR-00091]
     * Executes the actual render call within a try/catch.
     * Logs and propagates error events without killing requestAnimationFrame loop.
     */
    renderSafe(scene, camera, composer) {
        // If renderer is null, try to auto-resolve from window/globals [REF#CR-00092]
        if (!this.renderer && typeof window !== 'undefined') {
            this.renderer = window.renderer;
            if (this.renderer && this.renderer.domElement) {
                this.setupContextListeners(this.renderer.domElement);
            }
        }

        if (!this.renderer) {
            const now = performance.now();
            if (now - this.lastNullLogTime > 5000) {
                console.error("SafeRenderer: Cannot render because this.renderer is null or undefined.");
                this.lastNullLogTime = now;
            }
            return;
        }

        // Make sure listeners are attached if we got renderer late [REF#CR-00093]
        if (this.renderer.domElement && !this.renderer.domElement._hasSafeRendererListeners) {
            this.setupContextListeners(this.renderer.domElement);
        }

        if (this.contextLost) {
            // WebGL context is currently lost. Wait for restore. [REF#CR-00094]
            return;
        }

        try {
            const wantComposer = composer && (
                composer.enabled &&
                composer.passes &&
                composer.passes.some(p => {
                    if (!p.enabled) return false;
                    // If this is OutlinePass, only render via composer if there are selectedObjects [REF#CR-00095]
                    if (p.selectedObjects !== undefined) {
                        return p.selectedObjects.length > 0;
                    }
                    // If it is RenderPass or ShaderPass (CopyShader), we do not need the composer [REF#CR-00096]
                    // if no other effect passes are active.
                    const isInfrastructure = p.isRenderPass || p.renderToScreen ||
                                             p.constructor.name === 'RenderPass' ||
                                             p.constructor.name === 'ShaderPass';
                    if (isInfrastructure) {
                        return false;
                    }
                    return true;
                })
            );
            if (wantComposer) {
                composer.render();
            } else {
                this.renderer.render(scene, camera);
            }
            this.successfulRenderCount++;
            this.consecutiveErrors = 0;
        } catch (e) {
            this.errorCount++;
            this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
            
            console.error(`SafeRenderer: Renderer error caught (count: ${this.errorCount}, consecutive: ${this.consecutiveErrors}):`, e);

            // If the error message hints at a lost context that wasn't caught by the event yet [REF#CR-00097]
            if (e && e.message && (
                e.message.includes("context lost") || 
                e.message.includes("lost context") || 
                e.message.includes("CONTEXT_LOST") ||
                e.message.includes("WebGL context")
            )) {
                console.warn("SafeRenderer: Detected WebGL context loss from exception message.");
                this.contextLost = true;
            }

            // Safe-guard: if we catch 5 consecutive render errors, assume the context is dead/unusable [REF#CR-00098]
            // and trigger the recreation recovery loop.
            if (this.consecutiveErrors >= 5) {
                console.warn("SafeRenderer: 5 consecutive render errors caught. Forcing context recovery via recreateRenderer().");
                this.contextLost = true;
                this.consecutiveErrors = 0;
                this.recreateRenderer();
            }

            // Do NOT rethrow the exception! Keeping it caught keeps requestAnimationFrame [REF#CR-00099]
            // looping so that the browser can dispatch 'webglcontextrestored' and recover.
            // Still report the ENGINE_ANOMALY event to Oni-Baba for health dashboard monitoring.
            if (typeof window !== 'undefined' && window.parent) {
                window.parent.postMessage({
                    type: 'ENGINE_ANOMALY',
                    error: e.message || String(e),
                    stack: e.stack || '',
                    count: this.errorCount
                }, '*');
            }
        }
    }
}
