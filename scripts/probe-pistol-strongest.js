#!/usr/bin/env node
/**
 * probe-pistol-strongest.js — Mark 2026-08-12: "pistols need 2x more damage. they should be the
 * most powerful ranged weapon, hence its 6-shot limit."
 *
 * Two claims, and the second is the one that rots. "2x" is a one-time arithmetic check; "most
 * powerful ranged weapon" is an INVARIANT that any future weapon buff can silently break — which
 * is exactly how the pistol ended up the WEAKEST band on the table (below a thrown shuriken) after
 * the 2026-05-27 across-the-board halving. So this asserts the ranking, not just the numbers.
 *
 * Runs against the REAL module (no re-implementation of the formula — the weapon-speed doc's
 * lesson). Pure data + pure functions, so no browser is needed and none is claimed.
 *
 *   node scripts/probe-pistol-strongest.js
 */
import { MISSILE_TABLE, getMissileTable } from '../js/v8/combat/CardExecutor.js';

const avg = (t) => (t.min + t.max) / 2;
let fail = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) fail++; };

const P = MISSILE_TABLE.PISTOL;
console.log('\nPISTOL band: ' + P.min + '-' + P.max + ' (avg ' + avg(P) + ') · crit ' + P.crit + ' ×' + P.critMult + '\n');

// 1. The doubling itself. Previous band was 9-13.
check(P.min === 18 && P.max === 26, 'band is exactly 2× the previous 9-13 → 18-26');

// 2. THE INVARIANT: strictly the strongest ranged average. CAMERA is excluded by design (0 dmg —
//    its payload is the blind-stun, see the table note) and DEFAULT is a fallback, not a weapon.
const rivals = Object.keys(MISSILE_TABLE).filter(k => k !== 'PISTOL' && k !== 'CAMERA' && k !== 'DEFAULT');
for (const k of rivals) {
    check(avg(P) > avg(MISSILE_TABLE[k]),
          'PISTOL avg ' + avg(P) + ' > ' + k + ' avg ' + avg(MISSILE_TABLE[k]));
}

// 3. The lookup actually resolves — a band nobody can reach is not a buff. Every alias the fire
//    path can hand getMissileTable (Engine9 aliases MAGIC MISSILE ↔ PISTOL in both directions).
for (const alias of ['PISTOL', 'MAGIC MISSILE', 'REVOLVER', 'GUN', 'FIREARM']) {
    const t = getMissileTable(alias);
    check(t.min === P.min && t.max === P.max, '"' + alias + '" resolves to the PISTOL band');
}

// 4. CAMERA must still resolve BEFORE the pistol patterns, or the adventurer's flash starts
//    dealing 18-26 damage — the exact regression the table's ordering note warns about.
check(getMissileTable('CAMERA').max === 0, 'CAMERA still resolves to the 0-damage flash band');

console.log('\n' + (fail ? 'FAILED (' + fail + ')' : 'ALL PASS') + '\n');
process.exit(fail ? 1 : 0);
