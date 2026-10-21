/* SettingsVault.js — the Music settings and the monster animation settings survive in cookies (2026-10-04). [REF#CR-00174]
 * Mark 2026-10-04: "read in the settings, and store it to json cookies so its permanent no matter what, if it doesnt exist recreate it
 * once someone edits it" · "same with monster animations".
 * A classic script, loaded FIRST in the engine and Panels frames, so it runs before any module reads localStorage.
 *   LOAD  — a listed key missing from localStorage is restored from its cookie; a key present in localStorage but missing (or stale)
 *           in the cookie is written to the cookie (the settings are read in and stored).
 *   SAVE  — every localStorage.setItem of a listed key rewrites its cookie (created on the first edit if it never existed);
 *           removeItem (a deliberate reset) deletes it. localStorage.clear() or a browser storage wipe leaves the cookies alone.
 * Cookies are JSON as UTF-8 base64, path=/, 10-year max-age, split into 3600-byte chunks (`ouv_<key>_0..n-1` + `ouv_<key>_n`).
 * Cookies on 127.0.0.1 are shared by every port, so :5501 and :5502 see the same settings (localStorage is per port).
 * ⚠ Cookies ride every request: the vault never grows past VAULT_MAX bytes in total and reports ENGINE_ANOMALY 'SETTINGS_VAULT' when a
 *   key would not fit (that key keeps working from localStorage only). Off: window._settingsVault = false (set before this script runs).
 * Console: window.__settingsVault.size() · .restored · .readCookie(key).
 */
(function () {
    if (window._settingsVault === false || window.__settingsVault) return;
    const KEYS = [
        // the Music settings page (roles, ticks, skips, sliders, EQ) [REF#CR-00175]
        'origami.v8.songRoles', 'origami.v8.audioVerdicts', 'origami.v8.songRotations', 'origami.v8.songSkipped',
        'origami.v8.songTaxonomy', 'origami.v8.songHardness', 'origami.v8.songKarmaLean',
        'origami.v8.songEqBands', 'origami.v8.songPreamp', 'origami.v8.songBalance',
        // the monster settings (animation map and clip overrides, AI, armour, sounds, always-violent, saved set) [REF#CR-00176]
        'wg_monster_anim_map', 'wg_monster_clip_overrides', 'wg_monster_ai_settings', 'wg_monster_armor_map',
        'wg_monster_sound_map', 'wg_monster_violent', 'wg_monster_saved'
    ];
    const VAULT_MAX = (typeof window._settingsVaultMax === 'number') ? window._settingsVaultMax : 12000;
    const CHUNK = 3600, MAX_AGE = 10 * 365 * 86400;
    const short = (k) => 'ouv_' + k.replace(/^origami\.v8\./, 's_').replace(/^wg_monster_/, 'm_').replace(/[^A-Za-z0-9_]/g, '');
    const enc = (s) => btoa(unescape(encodeURIComponent(s)));
    const dec = (s) => decodeURIComponent(escape(atob(s)));
    const jar = () => { const o = {}; for (const p of String(document.cookie || '').split(/;\s*/)) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); } return o; };
    const setC = (n, v) => { document.cookie = n + '=' + v + '; path=/; SameSite=Lax; max-age=' + MAX_AGE; };
    const delC = (n) => { document.cookie = n + '=; path=/; SameSite=Lax; max-age=0'; };
    const report = (what) => {
        try { (window.parent || window).postMessage({ type: 'ENGINE_ANOMALY', kind: 'SETTINGS_VAULT', subsystem: 'settings-vault', error: what }, '*'); } catch (_) {}
        try { console.warn('[VAULT] ' + what); } catch (_) {}
    };
    const readCookie = (k) => {
        const J = jar(), n = short(k), c = +J[n + '_n'];
        if (!(c > 0)) return null;
        let s = ''; for (let i = 0; i < c; i++) { if (J[n + '_' + i] == null) return null; s += J[n + '_' + i]; }
        try { return dec(s); } catch (_) { return null; }
    };
    const sizeOf = (k) => { const J = jar(), n = short(k) + '_'; let t = 0; for (const x in J) if (x.indexOf(n) === 0) t += x.length + J[x].length + 2; return t; };
    const clear = (k) => { const J = jar(), n = short(k) + '_'; for (const x in J) if (x.indexOf(n) === 0) delC(x); };
    const writeCookie = (k, raw) => {
        try {
            if (raw == null) { clear(k); return false; }
            const b = enc(String(raw)), n = short(k);
            let others = 0; for (const x of KEYS) if (x !== k) others += sizeOf(x);
            if (others + b.length + 64 > VAULT_MAX) { report(k + ' (' + b.length + ' bytes) not saved to cookies: the vault would pass ' + VAULT_MAX + ' bytes (it holds ' + others + ')'); return false; }
            clear(k);
            const parts = Math.max(1, Math.ceil(b.length / CHUNK));
            for (let i = 0; i < parts; i++) setC(n + '_' + i, b.slice(i * CHUNK, (i + 1) * CHUNK));
            setC(n + '_n', String(parts));
            return true;
        } catch (e) { report('write ' + k + ': ' + (e && e.message)); return false; }
    };
    const restored = [], stored = [];
    for (const k of KEYS) {
        try {
            const v = localStorage.getItem(k), c = readCookie(k);
            if (v == null && c != null) { localStorage.setItem(k, c); restored.push(k); }
            else if (v != null && c !== v) { if (writeCookie(k, v)) stored.push(k); }
        } catch (_) {}
    }
    try {
        const S = Storage.prototype, _set = S.setItem, _rem = S.removeItem;
        S.setItem = function (k, v) { const r = _set.apply(this, arguments); try { if (this === window.localStorage && KEYS.indexOf(k) >= 0) writeCookie(k, v); } catch (_) {} return r; };
        S.removeItem = function (k) { const r = _rem.apply(this, arguments); try { if (this === window.localStorage && KEYS.indexOf(k) >= 0) clear(k); } catch (_) {} return r; };
    } catch (e) { report('could not watch localStorage: ' + (e && e.message)); }
    window.__settingsVault = { keys: KEYS, restored, stored, readCookie, writeCookie, size: () => KEYS.reduce((t, k) => t + sizeOf(k), 0) };
    try { if (restored.length || stored.length) console.log('[VAULT] restored from cookies: ' + (restored.join(', ') || 'none') + ' · stored to cookies: ' + (stored.join(', ') || 'none')); } catch (_) {}
})();
