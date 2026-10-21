// EventBus.js - Centralized Event System for Origami Engine
// Replaces the brittle iframe window.parent.postMessage architecture

class OrigamiEventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data = {}) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`[EventBus] Error in listener for ${event}:`, err);
            }
        });
    }
}

// Export a singleton instance
export const EventBus = new OrigamiEventBus();

// Expose globally for legacy prototype files to transition smoothly
window.OrigamiEventBus = EventBus;
