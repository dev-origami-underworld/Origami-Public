#!/usr/bin/env node
/* probe-card-registry.js — THE CARD GATE: every card the code knows is in the registry, and every registry card has
 * the wires its behaviour needs. Static (reads the source, no browser), ~1 s, wired into `npm run smoke`.
 *
 * Mark 2026-09-14: "Can we create a easy to understand system for all our cards so its easier to manage and maintain
 * for AI". The registry is js/v8/cards/CardRegistry.js; this file is what makes it binding.
 *
 * WHAT IT REFUSES (red = exit 1):
 *   R1  registry integrity — unique ids/names, known family + behaviour
 *   R2  Panels CONSUMABLES  == registry consume/throw-to-pet cards (both directions)
 *   R3  Engine9 UI_ONLY     ⊇ every registry card whose tap must never launch (consume · throw-to-pet · permit · skill · game · quest)
 *   R4  Panels permit list  == registry permits
 *   R5  Panels AMMO_CARDS   == registry ammo cards (a stray name here badges the wrong card; a missing one spawns duplicates)
 *   R6  every deck-row card name (Panels *Categories `cards: [...]`) is a registry card or a TABLE_ACTION
 *   R7  every card the source SPAWNS on the floor by literal title (spawnLootCard(... 'TITLE')) is registered (aliases count)
 *   R8  every registry deckScene is in Panels' 3D `elements` allowlist (absent = the dark unpainted circle)
 *   R9  every `ranged` card is recognised by CardExecutor.isMissileCard (else its tap falls to launchCard = a spell ball)
 *   R10 SKILL_STAT_MAP == registry stat links
 * WHAT IT REPORTS (yellow, exit 0):
 *   A1  i18n key missing in EN or JA (the card face falls back to raw English, silently)
 *   A2  a registry card absent from one or both CardDatabase structures (renders blank when stocked — the MAGIC LANTERN bug)
 *   A3  a CardDatabase card absent from the registry
 *   A4  floorModel claimed but no LootCardBuilder branch quotes the name
 *
 *   node scripts/probe-card-registry.js            # gate
 *   node scripts/probe-card-registry.js --table    # + the whole registry as a table
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let red = 0, yellow = 0;
const R = (ok, label, detail) => { if (!ok) red++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + label + (detail ? ' — ' + detail : '')); };
const A = (ok, label, detail) => { if (!ok) yellow++; console.log('  ' + (ok ? '✓' : '⚠') + ' ' + label + (detail ? ' — ' + detail : '')); };
const strList = (s) => s ? [...s.matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
const grab = (src, re) => { const m = src.match(re); return m ? m[1] : null; };
const diff = (a, b) => a.filter(x => !b.includes(x));

(async () => {
  const reg = await import(path.join(ROOT, 'js/v8/cards/CardRegistry.js'));
  const { CARDS, TABLE_ACTIONS, BEHAVIOURS, derived } = reg;
  const P = read('Origami.RealityEngine.Panels.html'), E = read('Origami.RealityEngine.9.html'), L = read('js/v8/entities/LootCardBuilder.js');
  const names = CARDS.map(c => c.name), aliases = CARDS.flatMap(c => c.aliases || []);
  const known = (n) => names.includes(n) || aliases.includes(n);
  console.log('CARD REGISTRY GATE — ' + CARDS.length + ' cards, ' + TABLE_ACTIONS.length + ' table actions');

  // R1 integrity
  const FAM = ['MELEE', 'RANGED', 'SPELLS', 'ITEM', 'SKILL', 'GAMING'];
  const BEH = [...BEHAVIOURS.attack, ...BEHAVIOURS.uiOnly, ...BEHAVIOURS.passive];
  const badFam = CARDS.filter(c => !FAM.includes(c.family)).map(c => c.name), badBeh = CARDS.filter(c => !BEH.includes(c.behaviour)).map(c => c.name);
  R(new Set(names).size === names.length && new Set(CARDS.map(c => c.id)).size === names.length, 'R1 ids and names are unique');
  R(!badFam.length && !badBeh.length, 'R1 every card has a known family and behaviour', (badFam.length ? 'family: ' + badFam.join(', ') : '') + (badBeh.length ? ' behaviour: ' + badBeh.join(', ') : ''));

  // R2 CONSUMABLES
  const consumables = strList(grab(P, /const CONSUMABLES = [^\n]*?\|\| \[([^\]]+)\]/));   // the literal FALLBACK after `|| [` — the live value is derived.consumables()
  const wantC = derived.consumables();
  R(consumables.length > 0 && !diff(wantC, consumables).length && !diff(consumables, wantC).length, 'R2 Panels CONSUMABLES == registry consumables', 'missing: [' + diff(wantC, consumables).join(', ') + '] · unregistered: [' + diff(consumables, wantC).join(', ') + ']');

  // R3 UI_ONLY
  const uiOnly = strList(grab(E, /const UI_ONLY = new Set\(\[([\s\S]*?)\]\);/));
  const wantU = derived.uiOnly();
  R(uiOnly.length > 0 && !diff(wantU, uiOnly).length, 'R3 Engine9 UI_ONLY carries every non-attack card (a tap can never launch it)', 'missing: [' + diff(wantU, uiOnly).join(', ') + ']');

  // R4 permits
  const permitSrc = grab(P, /derived\.permits\(\)\) \|\| \[('SINGING'[\s\S]*?)\]\)\.includes\(a\)\)/);
  const permits = strList(permitSrc);
  const wantP = derived.permits();
  R(permits.length > 0 && !diff(wantP, permits).length && !diff(permits, wantP).length, 'R4 Panels permit early-return list == registry permits', 'missing: [' + diff(wantP, permits).join(', ') + '] · unregistered: [' + diff(permits, wantP).join(', ') + ']');

  // R5 ammo
  const ammo = strList(grab(P, /const AMMO_CARDS = [^\n]*?\|\| \[([^\]]+)\]/));
  const wantA = derived.ammo();
  R(ammo.length > 0 && !diff(wantA, ammo).length && !diff(ammo, wantA).length, 'R5 Panels AMMO_CARDS == registry ammo cards', 'missing: [' + diff(wantA, ammo).join(', ') + '] · unregistered: [' + diff(ammo, wantA).join(', ') + ']');

  // R6 deck rows
  const deckRows = [...new Set([...P.matchAll(/cards:\s*\[([^\]]+)\]/g)].flatMap(m => strList(m[1])))];
  const unknownRows = deckRows.filter(n => !known(n) && !TABLE_ACTIONS.includes(n));
  R(!unknownRows.length, 'R6 every deck-row card is registered (or a table action)', deckRows.length + ' names · unregistered: [' + unknownRows.join(', ') + ']');

  // R7 floor spawns by literal title. The strip handles both forms: a fully-literal quantity suffix
  // ('ARROWS x2') AND a concatenated one (Origami.RealityEngine.9.html:15867 `'ARROWS x' + q`, where the
  // digit is OUTSIDE the quotes and the capture ends in a bare trailing 'x') — false-FAILed as an
  // unregistered 'ARROWS x' until 2026-09-30 even though 'ARROWS' is a registered alias (CardRegistry.js).
  const spawned = [...new Set([...E.matchAll(/spawnLootCard\([^,]+,[^,]+,\s*'[A-Z_]+',\s*'([^']+)'/g)].map(m => m[1].replace(/\s+x\d*$/i, '')))];
  const unknownSpawn = spawned.filter(n => !known(n) && n !== 'COINS');
  R(!unknownSpawn.length, 'R7 every card spawned on the floor by title is registered', spawned.length + ' titles · unregistered: [' + unknownSpawn.join(', ') + ']');

  // R8 deck scenes
  const elements = strList(grab(P, /const elements = \[([^\]]+)\]/));
  const badScene = CARDS.filter(c => c.deckScene && !elements.includes(c.deckScene)).map(c => c.name + '→' + c.deckScene);
  R(elements.length > 0 && !badScene.length, 'R8 every deckScene is in the Panels 3D scene allowlist', elements.length + ' scenes · missing: [' + badScene.join(', ') + ']');

  // R9 ranged recognised
  let isMissile = null;
  try { const CE = await import(path.join(ROOT, 'js/v8/combat/CardExecutor.js')); isMissile = CE.isMissileCard; } catch (e) { /* the module pulls THREE — fall back to the regex below */ }
  if (!isMissile) { const re = grab(read('js/v8/combat/CardExecutor.js'), /export function isMissileCard[\s\S]*?return (\/[^/]+\/)\.test/); isMissile = re ? (n) => eval(re).test(String(n).toUpperCase()) : null; }
  const notMissile = CARDS.filter(c => c.behaviour === 'ranged' && isMissile && !isMissile(c.name)).map(c => c.name);
  R(!!isMissile && !notMissile.length, 'R9 every ranged card is recognised by isMissileCard', 'unrecognised: [' + notMissile.join(', ') + ']');

  // R10 stat links
  const statSrc = grab(P, /const SKILL_STAT_MAP = [^\n]*?\|\| \{([\s\S]*?)\n\s*\};/);
  const statMap = Object.fromEntries([...(statSrc || '').matchAll(/'([A-Z ]+)':\s*'([a-z]+)'/g)].map(m => [m[1], m[2]]));
  const wantS = derived.statLinks();
  const statDiff = [...new Set([...Object.keys(statMap), ...Object.keys(wantS)])].filter(k => statMap[k] !== wantS[k]).map(k => k + ' (' + (statMap[k] || '—') + ' vs ' + (wantS[k] || '—') + ')');
  R(!statDiff.length, 'R10 Panels SKILL_STAT_MAP == registry stat links', 'differ: [' + statDiff.join(', ') + ']');

  // R11 the consumers read the registry (the literals above are only the pre-import fallback)
  const wired = [
    ['Panels CONSUMABLES',    /const CONSUMABLES = \(window\.OrigamiCardRegistry && window\.OrigamiCardRegistry\.derived\.consumables\(\)\) \|\|/.test(P)],
    ['Panels AMMO_CARDS',     /const AMMO_CARDS = \(window\.OrigamiCardRegistry && window\.OrigamiCardRegistry\.derived\.ammo\(\)\) \|\|/.test(P)],
    ['Panels SKILL_STAT_MAP', /const SKILL_STAT_MAP = \(window\.OrigamiCardRegistry && window\.OrigamiCardRegistry\.derived\.statLinks\(\)\) \|\|/.test(P)],
    ['Panels permits',        /window\.OrigamiCardRegistry\.derived\.permits\(\)\) \|\| \['SINGING'/.test(P)],
    ['Engine9 UI_ONLY',       /const UI_ONLY = new Set\(\[\.\.\.\(\(window\.OrigamiCardRegistry && window\.OrigamiCardRegistry\.derived\.uiOnly\(\)\) \|\| \[\]\)/.test(E)],
    ['Panels imports it',     /import\('\.\/js\/v8\/cards\/CardRegistry\.js\?v=/.test(P)],
    ['Engine9 imports it',    /import '\.\/js\/v8\/cards\/CardRegistry\.js\?v=/.test(E)],
  ];
  R(wired.every(w => w[1]), 'R11 every consumer reads derived.* from the registry (literal = fallback only)', 'not wired: [' + wired.filter(w => !w[1]).map(w => w[0]).join(', ') + ']');

  // A1 i18n
  const ctx = { window: {}, console, document: {} }; ctx.globalThis = ctx; vm.runInNewContext(read('js/data/i18n.js'), ctx);
  const I = ctx.window.OrigamiI18n;
  const noI18n = CARDS.filter(c => !c.i18n).map(c => c.name);
  const badI18n = CARDS.filter(c => c.i18n && (!I.en.cards[c.i18n] || !I.ja.cards[c.i18n])).map(c => c.name + '→' + c.i18n);
  A(!badI18n.length, 'A1 every declared i18n key exists in EN and JA', 'broken: [' + badI18n.join(', ') + '] · ' + noI18n.length + ' cards declare no key: [' + noI18n.join(', ') + ']');

  // A2/A3 CardDatabase drift
  const CDB = await import(path.join(ROOT, 'js/v8/core/CardDatabase.js'));
  const M = Object.keys(CDB.MasterCardDatabase), O = CDB.OrigamiCards.map(c => c.name);
  const halfDb = CARDS.filter(c => (M.includes(c.name) || O.includes(c.name)) && !(M.includes(c.name) && O.includes(c.name))).map(c => c.name + (M.includes(c.name) ? ' (Master only)' : ' (OrigamiCards only)'));
  const noDb = CARDS.filter(c => !M.includes(c.name) && !O.includes(c.name) && !BEHAVIOURS.passive.includes(c.behaviour)).map(c => c.name);
  A(!halfDb.length, 'A2 registry cards live in BOTH CardDatabase structures', 'half-registered: [' + halfDb.join(', ') + '] · in neither: [' + noDb.join(', ') + ']');
  const dbOnly = [...new Set([...M, ...O])].filter(n => !known(n));
  A(!dbOnly.length, 'A3 every CardDatabase card is in the registry', 'unregistered: [' + dbOnly.join(', ') + ']');

  // A4 floor models
  // the builder matches by whole title, by a word of it (titleClean.includes('RICE')), or by catId ('GOLD_COIN') — any quoted
  // appearance of the full name or of one of its words (≥ 4 letters) counts as a branch
  const quoted = (w) => new RegExp('[\'"]' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]').test(L);
  const noBranch = CARDS.filter(c => c.floorModel && !quoted(c.name) && !c.name.split(' ').some(w => w.length >= 4 && quoted(w))).map(c => c.name);
  A(!noBranch.length, 'A4 every floorModel claim has a LootCardBuilder branch quoting the name (or a word of it)', 'unquoted: [' + noBranch.join(', ') + ']');

  if (process.argv.includes('--table')) {
    console.log('\n' + 'NAME'.padEnd(24) + 'FAMILY'.padEnd(8) + 'BEHAVIOUR'.padEnd(14) + 'SCENE'.padEnd(13) + 'I18N'.padEnd(24) + 'SOURCE');
    for (const c of CARDS) console.log('  ' + c.name.padEnd(22) + c.family.padEnd(8) + c.behaviour.padEnd(14) + (c.deckScene || '·').padEnd(13) + (c.i18n || '·').padEnd(24) + c.source + (c.note ? '  — ' + c.note : ''));
  }
  console.log(red ? 'FAIL — ' + red + ' red line(s)' + (yellow ? ', ' + yellow + ' advisory' : '') : 'PASS — card registry consistent' + (yellow ? ' (' + yellow + ' advisory)' : ''));
  process.exit(red ? 1 : 0);
})().catch(e => { console.error('GATE CRASHED', e); process.exit(1); });
