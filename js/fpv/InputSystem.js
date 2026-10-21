export class InputSystem {
    constructor() {
        this.keys = { w: false, s: false, a: false, d: false };
        
        // Listen to external commands from the Master Launcher
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || !data.type) return;

            if (data.type === 'KEY_DOWN') {
                this.updateKey(data.key, true);
            } else if (data.type === 'KEY_UP') {
                this.updateKey(data.key, false);
            }
        });

        // Add local keyboard listeners in case the FPV iframe receives direct focus
        window.addEventListener('keydown', (e) => {
            this.updateKey(e.key, true);
        });
        
        window.addEventListener('keyup', (e) => {
            this.updateKey(e.key, false);
        });
    }

    updateKey(key, state) {
        const k = key.toLowerCase();
        if (k === 'w' || key === 'ArrowUp') this.keys.w = state;
        if (k === 'a' || key === 'ArrowLeft') this.keys.a = state;
        if (k === 's' || key === 'ArrowDown') this.keys.s = state;
        if (k === 'd' || key === 'ArrowRight') this.keys.d = state;
    }
}
