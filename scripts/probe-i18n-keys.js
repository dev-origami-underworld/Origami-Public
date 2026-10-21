/**
 * probe-i18n-keys.js — does every element marked for translation actually HAVE one? (Mark 2026-07-28)
 *
 * WHY THIS EXISTS
 * ---------------
 * Mark: "fix skills button localized". The SKILLS dock button was correctly marked
 * data-i18n="act-skills" -- the markup was never the problem. There was simply no "act-skills" entry
 * in i18n.js, because the button was renamed ITEMS -> SKILLS (Panels ~8738), its data-i18n was
 * updated to match, and the key was never added beside the "act-items" it replaced.
 *
 * THE FAILURE IS INVISIBLE BY DESIGN, which is the whole reason this file is needed. window.t()
 * returns the KEY when it cannot resolve one, and applyLocale guards with `if (val && val !== key)` --
 * a sensible guard, because it stops the UI filling up with raw key names. The cost is that a missing
 * key looks EXACTLY like an element nobody ever marked up: the English text just stays put. Nothing
 * logs, nothing throws, and the only way to notice is for a Japanese-reading player to spot one
 * English word in a screen full of Japanese -- which is precisely how this was found, twice.
 *
 * Auditing for it turned up SIX, not one: act-skills, attr_ac, auto-atk, save-head, save-slots-label,
 * vending-special-buy. A rename is the thing that breaks this, so run it after every label rename.
 *
 * Static and instant -- no browser, no dev server.
 *
 * Usage: node scripts/probe-i18n-keys.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = ['Origami.RealityEngine.Panels.html', 'OrigamiUnderworld.html', 'Origami.RealityEngine.9.html'];
const I18N = path.join(ROOT, 'js/data/i18n.js');

const src = fs.readFileSync(I18N, 'utf8');

// Locate the two ui blocks by their language anchors. A real parse is overkill -- the file is a
// literal object -- but the key scan below is where the care is needed.
const langBlock = (lang) => {
  const i = src.indexOf('\n  ' + lang + ': {');
  if (i < 0) return null;
  const rest = src.slice(i + 1);
  const nxt = rest.search(/\n  [a-z]{2}: \{/);
  return nxt > 0 ? rest.slice(0, nxt) : rest;
};

// MATCH EVERY KEY ON A LINE, NOT JUST THE FIRST. The first cut of this anchored with
// /^\s*"..."\s*:/gm and therefore saw only the leading key of the packed rows -- i18n.js writes whole
// families on one line (`"attr_str": "STR", "attr_dex": "DEX", ...` at ~34). It duly reported
// attr_dex/con/int/wis/cha and cardcat_item as MISSING when all six are defined and always have been.
// An audit tool that invents failures is worse than no audit: it would have had someone "fix" six
// keys that already existed. Requiring a value-opening token after the colon stops this matching a
// string VALUE by accident.
const keysOf = (block) => {
  const out = new Set();
  if (!block) return out;
  const re = /"([A-Za-z0-9_.\-]+)"\s*:\s*(?:"|\{|\[|-?\d)/g;
  let m;
  while ((m = re.exec(block))) out.add(m[1]);
  return out;
};

const enBlock = langBlock('en'), jaBlock = langBlock('ja');
const EN = keysOf(enBlock), JA = keysOf(jaBlock);

// ── DUPLICATE KEYS SILENTLY SHADOW (added 2026-07-28, after doing exactly this) ────────────────────
// A repeated key in a JS object literal is not an error — the LAST one wins, quietly. I added
// "oni.autoaim-on" believing it was missing; it already existed 120 lines further down, so my entry
// was dead the moment I wrote it and the probe still passed. The tell was the RENDERED text not
// matching what I had just typed. Nothing else would have caught it.
const dupesOf = (block, lang) => {
  const seen = new Set(), dup = new Set();
  if (!block) return dup;
  const re = /"([A-Za-z0-9_.\-]+)"\s*:\s*(?:"|\{|\[|-?\d)/g;
  let m; while ((m = re.exec(block))) { if (seen.has(m[1])) dup.add(lang + ': ' + m[1]); seen.add(m[1]); }
  return dup;
};
const dupes = [...dupesOf(enBlock, 'en'), ...dupesOf(jaBlock, 'ja')];

console.log('\n-- i18n KEY COVERAGE --\n');
if (!EN.size || !JA.size) {
  console.log('  FAIL: could not read the en/ja blocks out of js/data/i18n.js -- check the file shape');
  process.exit(1);
}
console.log('  keys defined:  en ' + EN.size + '   ja ' + JA.size);

const used = new Set();
for (const f of HTML) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const h = fs.readFileSync(p, 'utf8');
  const re = /data-i18n(?:-placeholder)?="([^"]+)"/g;
  let m;
  while ((m = re.exec(h))) used.add(m[1] + ' ' + f);
}

const byKey = new Map(), dynamic = new Set();
for (const u of used) {
  const [k, f] = u.split(' ');
  // A key built by a template literal (data-i18n="${...}") resolves at runtime and cannot be checked
  // statically. List it separately rather than counting it as a missing translation.
  if (k.indexOf('$') >= 0) { dynamic.add(k); continue; }
  if (!byKey.has(k)) byKey.set(k, new Set());
  byKey.get(k).add(f);
}

console.log('  keys used in markup: ' + byKey.size
  + (dynamic.size ? '   (+' + dynamic.size + ' built at runtime, not statically checkable: ' + [...dynamic].join(', ') + ')' : ''));

const missingEn = [], missingJa = [];
for (const [k, files] of byKey) {
  if (!EN.has(k)) missingEn.push(k + '   (' + [...files].join(', ') + ')');
  else if (!JA.has(k)) missingJa.push(k + '   (' + [...files].join(', ') + ')');
}

// A key present in one language block and not the other is the same silent-fallback bug whether or
// not any markup references it -- code paths call window.t() directly too.
const onlyEn = [...EN].filter(k => !JA.has(k)), onlyJa = [...JA].filter(k => !EN.has(k));
if (onlyEn.length || onlyJa.length) {
  console.log('  table asymmetry: ' + onlyEn.length + ' key(s) only in en, ' + onlyJa.length + ' only in ja');
  if (onlyEn.length) console.log('       en-only: ' + onlyEn.slice(0, 8).join(', '));
  if (onlyJa.length) console.log('       ja-only: ' + onlyJa.slice(0, 8).join(', '));
}

if (missingEn.length) {
  console.log('\n  FAIL -- marked for translation but not defined at all. These render as hard-coded');
  console.log('  English, silently, in every language:');
  for (const k of missingEn.sort()) console.log('       - ' + k);
}
if (missingJa.length) {
  console.log('\n  FAIL -- defined in en but missing from ja. These fall back to English for Japanese');
  console.log('  players:');
  for (const k of missingJa.sort()) console.log('       - ' + k);
}

// ── MONSTER nameKeys (Mark 2026-07-28) ────────────────────────────────────────────────────────────
// A nameKey NEVER appears in markup, so the data-i18n sweep above cannot see it — and tMonster()
// returns the KEY on a miss exactly like t() does. That is how `skeleton_archer` ended up rendered
// raw into the middle of a Japanese sentence in the floating combat text: "…on_archer の攻撃！".
// The generator is the authority on which keys exist, so read them from it rather than a hand list.
const sub = (block, name) => {
  const out = new Set();
  if (!block) return out;
  const i = block.indexOf(name + ': {');
  if (i < 0) return out;
  let d = 0, j = block.indexOf('{', i), end = -1;
  for (let k = j; k < block.length; k++) {
    if (block[k] === '{') d++;
    else if (block[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  const seg = block.slice(j, end);
  const re = /"?([A-Za-z0-9_.\-]+)"?\s*:\s*"/g;
  let m; while ((m = re.exec(seg))) out.add(m[1]);
  return out;
};
const MON_EN = sub(enBlock, 'monsters'), MON_JA = sub(jaBlock, 'monsters');
const genPath = path.join(ROOT, 'js/v8/map/DungeonChain.js');
const missingMon = [];
if (fs.existsSync(genPath)) {
  const gen = fs.readFileSync(genPath, 'utf8');
  const nameKeys = new Set();
  // Quoted literals only. An unquoted match picks up `nameKey: someVar` and template fragments, which
  // is how a first pass "found" keys called g, a and ha.
  const re = /nameKey:\s*['"]([A-Za-z0-9_]+)['"]/g;
  let m; while ((m = re.exec(gen))) nameKeys.add(m[1]);
  for (const k of nameKeys) {
    const gaps = [];
    if (!MON_EN.has(k)) gaps.push('en');
    if (!MON_JA.has(k)) gaps.push('ja');
    if (gaps.length) missingMon.push(k + '   (missing from ' + gaps.join(' + ') + ')');
  }
  console.log('  monster nameKeys used by the generator: ' + nameKeys.size
    + '   ·   monsters table: en ' + MON_EN.size + ' / ja ' + MON_JA.size);
}
if (missingMon.length) {
  console.log('\n  FAIL -- the generator spawns these but the monsters table has no name, so tMonster()');
  console.log('  renders the RAW KEY into the log and the floating combat text:');
  for (const k of missingMon.sort()) console.log('       - ' + k);
}

// Informational only: a ja value byte-identical to en is usually fine (numbers, "OK", proper nouns)
// but occasionally means someone copied the English row and never came back.
const valOf = (block, k) => {
  const m = block.match(new RegExp('"' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1] : null;
};
const same = [];
for (const k of byKey.keys()) {
  if (!EN.has(k) || !JA.has(k)) continue;
  const a = valOf(enBlock, k), c = valOf(jaBlock, k);
  if (a != null && a === c && /[A-Za-z]{3}/.test(a)) same.push(k + ' = "' + a + '"');
}
if (same.length) {
  console.log('\n  identical in both languages (usually intentional -- check if any look accidental):');
  for (const s of same.sort().slice(0, 12)) console.log('       ' + s);
}

if (dupes.length) {
  console.log('\n  FAIL -- duplicate keys. The LAST definition wins silently, so the earlier one is dead');
  console.log('  code and any edit to it does nothing:');
  for (const d of dupes.sort()) console.log('       - ' + d);
}

const fail = missingEn.length + missingJa.length + missingMon.length + dupes.length;
console.log('\n  ' + (fail
  ? 'FAILED: ' + fail + ' key(s) marked for translation with no definition'
  : 'PASS: every data-i18n key in the markup resolves in both languages'));
process.exit(fail ? 1 : 0);
