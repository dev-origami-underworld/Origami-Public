/** [REF#AU-00001]
 * NewOrigami v8 — Synthesized Web Audio Layered Ambient System
 * Idea Software Studio © 2026. See LICENSE for permitted use.
 *
 * Provides a highly-optimized, zero-dependency cave atmosphere synth
 * that mixes 5 distinct dynamic layers on-the-fly.
 * Works entirely offline and prevents network resource blocking.
 */
export class AudioSystem {
    constructor() {
        this.ac = null;
        
        // ── Synthesizer Nodes ── [REF#AU-00002]
        this.masterGain = null;
        this.droneFilter = null;
        
        // Layer 1: Base low-frequency cave drone [REF#AU-00003]
        this.droneOsc = null;
        this.lfoOsc = null;
        
        // Layer 2: Beating tension drone [REF#AU-00004]
        this.tensionOsc = null;
        this.tensionGain = null;
        
        // Layer 3: Sweeping wind breeze [REF#AU-00005]
        this.noiseSource = null;
        this.windFilter = null;
        this.windLfo = null;
        this.windGain = null;
        
        // Layer 4: Japanese war drums (combat) [REF#AU-00006]
        this.combatGain = null;
        
        // Layer 5: Scheduled pool drips (water) [REF#AU-00007]
        // (Wired as a spatial drip trigger)
        
        // ── State variables ── [REF#AU-00008 → see REF#E9-00418]
        this.isPlaying = false;
        this.isCombatActive = false;
        this.waterProximity = 0.0; // 0 (far) to 1 (near) [REF#AU-00009]
        
        // Timers & counters [REF#AU-00010]
        this.dripTimer = null;
        this.drumTimer = null;
        this.drumStep = 0;
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            
            this.ac = new Ctx();
            
            // Master Gain: soft entry fade-in [REF#AU-00011]
            this.masterGain = this.ac.createGain();
            this.masterGain.gain.setValueAtTime(0, this.ac.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0.8, this.ac.currentTime + 1.5);
            this.masterGain.connect(this.ac.destination);

            // ── 1. BASE LAYER: Low-Frequency Subterranean Cave Drone ─────── [REF#AU-00012]
            this.droneFilter = this.ac.createBiquadFilter();
            this.droneFilter.type = 'lowpass';
            this.droneFilter.frequency.setValueAtTime(80, this.ac.currentTime); // Deep lowpass cutoff [REF#AU-00013]
            this.droneFilter.Q.setValueAtTime(3.0, this.ac.currentTime); // Resonance bump [REF#AU-00014]
            this.droneFilter.connect(this.masterGain);

            this.droneOsc = this.ac.createOscillator();
            this.droneOsc.type = 'sawtooth';
            this.droneOsc.frequency.setValueAtTime(55, this.ac.currentTime); // A1 note (55 Hz) [REF#AU-00015]

            // LFO to slowly modulate pitch for an organic "breathing" cave depth [REF#AU-00016]
            this.lfoOsc = this.ac.createOscillator();
            this.lfoOsc.type = 'sine';
            this.lfoOsc.frequency.setValueAtTime(0.08, this.ac.currentTime); // 12.5s cycle [REF#AU-00017]
            
            const lfoGain = this.ac.createGain();
            lfoGain.gain.setValueAtTime(2.2, this.ac.currentTime); // Pitch swing of +/- 2.2 Hz [REF#AU-00018]

            this.lfoOsc.connect(lfoGain);
            lfoGain.connect(this.droneOsc.frequency);

            this.droneOsc.connect(this.droneFilter);
            
            // Start Layer 1 [REF#AU-00019]
            this.droneOsc.start();
            this.lfoOsc.start();

            // ── 2. TENSION LAYER: Flat-Tuned Beating Drone ───────────────── [REF#AU-00020]
            this.tensionGain = this.ac.createGain();
            this.tensionGain.gain.setValueAtTime(0, this.ac.currentTime);
            this.tensionGain.connect(this.droneFilter);

            this.tensionOsc = this.ac.createOscillator();
            this.tensionOsc.type = 'sawtooth';
            // Pitched slightly flat (54.5 Hz) against the 55Hz drone. [REF#AU-00021]
            // Generates a deep 0.5Hz beating interference (1 cycle per 2 seconds).
            this.tensionOsc.frequency.setValueAtTime(54.5, this.ac.currentTime);
            this.tensionOsc.connect(this.tensionGain);
            
            // Start Layer 2 [REF#AU-00022 → see REF#AU-00019]
            this.tensionOsc.start();

            // ── 3. WIND LAYER: Sweeping Breeze Noise ─────────────────────── [REF#AU-00023]
            // Generate 2 seconds of white noise buffer
            const bufferSize = 2 * this.ac.sampleRate;
            const noiseBuffer = this.ac.createBuffer(1, bufferSize, this.ac.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                noiseData[i] = Math.random() * 2 - 1;
            }

            this.noiseSource = this.ac.createBufferSource();
            this.noiseSource.buffer = noiseBuffer;
            this.noiseSource.loop = true;

            // Bandpass filter to sculpt the noise into drafty whistling wind [REF#AU-00024]
            this.windFilter = this.ac.createBiquadFilter();
            this.windFilter.type = 'bandpass';
            this.windFilter.Q.setValueAtTime(5.0, this.ac.currentTime); // High resonance whistling [REF#AU-00025]
            this.windFilter.frequency.setValueAtTime(380, this.ac.currentTime);

            // LFO to slowly sweep the wind whistle frequency [REF#AU-00026]
            this.windLfo = this.ac.createOscillator();
            this.windLfo.type = 'sine';
            this.windLfo.frequency.setValueAtTime(0.06, this.ac.currentTime); // Slow 16s sweeps [REF#AU-00027]

            const windLfoGain = this.ac.createGain();
            windLfoGain.gain.setValueAtTime(140, this.ac.currentTime); // Sweep +/- 140 Hz [REF#AU-00028]

            this.windLfo.connect(windLfoGain);
            windLfoGain.connect(this.windFilter.frequency);

            this.windGain = this.ac.createGain();
            this.windGain.gain.setValueAtTime(0.04, this.ac.currentTime); // Quiet default [REF#AU-00029]

            this.noiseSource.connect(this.windFilter);
            this.windFilter.connect(this.windGain);
            this.windGain.connect(this.masterGain);

            // Start Layer 3 [REF#AU-00030 → see REF#AU-00019]
            this.noiseSource.start();
            this.windLfo.start();

            // ── 4. COMBAT LAYER: Japanese Taiko Rhythms ──────────────────── [REF#AU-00031]
            this.combatGain = this.ac.createGain();
            this.combatGain.gain.setValueAtTime(0, this.ac.currentTime);
            this.combatGain.connect(this.masterGain);

            this.isCombatActive = false;
            this.drumStep = 0;
            this._scheduleNextDrumHit();

            // ── 5. WATER LAYER: Scheduled Pool Drips ─────────────────────── [REF#AU-00032]
            this.waterProximity = 0.0;
            this._scheduleNextWaterDrip();

            console.log("🔊 [AudioSystem] Layered ambient cave synthesiser initialized.");
        } catch (e) {
            console.warn("[AudioSystem] Web Audio bootstrap failed:", e);
            this.isPlaying = false;
        }
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        // Clear scheduled timers [REF#AU-00033]
        if (this.dripTimer) {
            clearTimeout(this.dripTimer);
            this.dripTimer = null;
        }
        if (this.drumTimer) {
            clearTimeout(this.drumTimer);
            this.drumTimer = null;
        }

        try {
            if (this.masterGain && this.ac) {
                const fadeOut = 0.6;
                // Graceful fade-out to prevent speaker click [REF#AU-00034]
                this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ac.currentTime);
                this.masterGain.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + fadeOut);
                
                setTimeout(() => {
                    // Clean stop sources [REF#AU-00035]
                    const kill = (node) => {
                        try { node && node.stop(); } catch(_) {}
                    };
                    kill(this.droneOsc);
                    kill(this.lfoOsc);
                    kill(this.tensionOsc);
                    kill(this.noiseSource);
                    kill(this.windLfo);
                    
                    if (this.ac) {
                        try { this.ac.close(); } catch(_) {}
                        this.ac = null;
                    }
                    console.log("🔇 [AudioSystem] Layered synthesiser stopped.");
                }, fadeOut * 1000 + 50);
            }
        } catch (e) {
            console.warn("[AudioSystem] Stop error:", e);
        }
    }

    // ── 5-Layer Parameter Controllers ── [REF#AU-00036]

    setTension(val) {
        if (!this.isPlaying || !this.tensionGain || !this.ac) return;
        const norm = Math.min(1.0, Math.max(0.0, val));
        this.tensionGain.gain.setValueAtTime(this.tensionGain.gain.value, this.ac.currentTime);
        // Map tension up to 0.40 max volume of flat beating oscillator [REF#AU-00037]
        this.tensionGain.gain.linearRampToValueAtTime(norm * 0.40, this.ac.currentTime + 0.4);
    }

    setCorridorProximity(val) {
        if (!this.isPlaying || !this.windGain || !this.ac) return;
        const norm = Math.min(1.0, Math.max(0.0, val));
        this.windGain.gain.setValueAtTime(this.windGain.gain.value, this.ac.currentTime);
        // Whistle gets louder when inside tight drafty halls (max 0.22 gain) [REF#AU-00038]
        this.windGain.gain.linearRampToValueAtTime(0.03 + norm * 0.19, this.ac.currentTime + 0.5);
    }

    setWaterProximity(val) {
        this.waterProximity = Math.min(1.0, Math.max(0.0, val));
    }

    setCombatActive(active) {
        const nextState = !!active;
        if (this.isCombatActive === nextState) return;
        this.isCombatActive = nextState;

        if (!this.isPlaying || !this.combatGain || !this.ac) return;
        this.combatGain.gain.setValueAtTime(this.combatGain.gain.value, this.ac.currentTime);
        // Fade taiko war drums in/out smoothly (up to 0.55 volume) [REF#AU-00039]
        this.combatGain.gain.linearRampToValueAtTime(nextState ? 0.55 : 0.0, this.ac.currentTime + 0.8);
    }

    // ── Water Drip Sweeper ── [REF#AU-00040]

    _scheduleNextWaterDrip() {
        if (!this.isPlaying) return;

        // When water proximity is high, accelerate drips (every 0.5s - 1.4s) [REF#AU-00041]
        // Otherwise, drop occasionally (every 2.5s - 6.5s)
        const minTime = 500 + (1.0 - this.waterProximity) * 2000;
        const maxTime = 1400 + (1.0 - this.waterProximity) * 5100;
        const delay = minTime + Math.random() * (maxTime - minTime);

        this.dripTimer = setTimeout(() => {
            this._playWaterDrip();
            this._scheduleNextWaterDrip();
        }, delay);
    }

    _playWaterDrip() {
        if (!this.isPlaying || !this.ac || !this.masterGain) return;

        try {
            const now = this.ac.currentTime;
            const osc = this.ac.createOscillator();
            const gain = this.ac.createGain();
            const filter = this.ac.createBiquadFilter();

            osc.type = 'sine';
            const baseFreq = 1200 + Math.random() * 400;
            osc.frequency.setValueAtTime(baseFreq, now);
            // Plop: rapid downward sweep to 600Hz [REF#AU-00042]
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1000, now);
            filter.Q.setValueAtTime(1.5, now);

            gain.gain.setValueAtTime(0, now);
            // Click snap start + echo decay [REF#AU-00043]
            gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

            osc.connect(gain);
            gain.connect(filter);
            filter.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.3);
        } catch (_) {}
    }

    // ── Combat Taiko Drum Sweeper ── [REF#AU-00044]

    _scheduleNextDrumHit() {
        if (!this.isPlaying) return;

        this.drumTimer = setTimeout(() => {
            if (this.isCombatActive) {
                this._playDrumHit();
                this._playDrumSnap();

                // Increment step. Alternate rhythmic syncopation double-beats on step 3/4 [REF#AU-00045]
                this.drumStep = (this.drumStep + 1) % 8;
                if (this.drumStep === 2 || this.drumStep === 5) {
                    // Quick double-beat (150ms delay) [REF#AU-00046]
                    setTimeout(() => {
                        if (this.isPlaying && this.isCombatActive) {
                            this._playDrumHit();
                        }
                    }, 140);
                }
            }
            this._scheduleNextDrumHit();
        }, 500); // 120 BPM tempo [REF#AU-00047]
    }

    _playDrumHit() {
        if (!this.isPlaying || !this.ac || !this.combatGain) return;

        try {
            const now = this.ac.currentTime;
            const osc = this.ac.createOscillator();
            const gain = this.ac.createGain();

            osc.type = 'sine';
            // Low deep sweep (140Hz -> 38Hz) simulating heavy taiko base [REF#AU-00048]
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);

            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

            osc.connect(gain);
            gain.connect(this.combatGain);

            osc.start(now);
            osc.stop(now + 0.26);
        } catch (_) {}
    }

    _playDrumSnap() {
        if (!this.isPlaying || !this.ac || !this.combatGain) return;

        try {
            const now = this.ac.currentTime;
            // 20ms quick buffer of noise to simulate stick striking leather [REF#AU-00049]
            const sz = 0.02 * this.ac.sampleRate;
            const buf = this.ac.createBuffer(1, sz, this.ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < sz; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const src = this.ac.createBufferSource();
            src.buffer = buf;

            const filter = this.ac.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1100, now);

            const gain = this.ac.createGain();
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.combatGain);

            src.start(now);
            src.stop(now + 0.03);
        } catch (_) {}
    }
}
