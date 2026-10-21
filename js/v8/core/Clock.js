/** [REF#CR-00049]
 * Clock.js — Safe per-frame execution manager
 * Integrates directly with the Oni-Baba orchestrator by pushing telemetry on uncaught exceptions.
 */

export class Clock {
    constructor() {
        this.caughtErrors = 0;
        this.errorHUDTimer = 0;
    }

    /** [REF#CR-00050]
     * Executes the per-frame callback function inside a try/catch block.
     * On error, logs to console, increments the error counter, triggers the HUD overlay timer,
     * and broadcasts an ENGINE_ANOMALY message to the parent frame (Oni-Baba).
     * 
     * @param {function} callback 
     */
    tick(callback) {
        try {
            callback();
        } catch (e) {
            console.error("v8 game loop error caught:", e);
            this.caughtErrors++;
            
            // Trigger overlay for exactly 3 seconds (3000ms) [REF#CR-00051]
            this.errorHUDTimer = performance.now() + 3000;

            // Broadcast the anomaly event to Oni-Baba [REF#CR-00052]
            try {
                const msg = {
                    type: 'ENGINE_ANOMALY',
                    error: e.message || String(e),
                    stack: e.stack || '',
                    count: this.caughtErrors
                };
                if (typeof window !== 'undefined') {
                    window.parent.postMessage(msg, '*');
                    window.postMessage(msg, '*');
                }
            } catch (err) {
                console.error("Failed to post ENGINE_ANOMALY message to Oni-Baba:", err);
            }
        }
    }
}
