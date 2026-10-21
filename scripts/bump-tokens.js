#!/usr/bin/env node
/*
 * bump-tokens.js — ONE command that moves the cache tokens TOGETHER, atomically, always forward.
 *
 * Born from five token crossings between live seats (SEAT_PIPELINE §4, 2026-08-10/11), two of which
 * happened to seats actively following the read-then-bump rule — including one bump that went
 * BACKWARD (8.3.475 stamped over 8.3.487-dancer-deleted) because the tree advanced 12 versions
 * between the read and the write. A rule that fails people who follow it is a tooling gap, not a
 * discipline gap. This tool closes it:
 *
 *   npm run bump -- <slug>                bump Engine9 + OniBaba8 + sw CACHE (the trio that moves together)
 *   npm run bump -- <slug> --entity      also bump EntityCatalog.js?v= in PlayerGuide.js
 *   npm run bump -- <slug> --dry         show what would change, write nothing
 *
 * Guarantees:
 *   · FORWARD ONLY — the new version is max(all current 8.3.N) + 1, so a stale read can never
 *     stamp an older number over a newer one.
 *   · TOGETHER — all targeted files are rewritten in one pass or none are (validate-then-write).
 *   · SLUG REQUIRED — a bump without a reason is how tokens stop meaning anything. Slug is
 *     kebab-case, <= 40 chars.
 *   · sw CACHE gets today's date + the same slug, so the SW cache name stays human-datable.
 *
 * It does NOT commit — pair the bump with your change in the same commit, per rule 4.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter(a => a !== '--');
const DRY = args.includes('--dry');
const ENTITY = args.includes('--entity');
const slug = args.find(a => !a.startsWith('--'));

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 40) {
  console.error('usage: npm run bump -- <kebab-case-slug> [--entity] [--dry]');
  console.error('       the slug says WHY the tokens moved. No slug, no bump.');
  process.exit(2);
}

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const files = {
  'OrigamiUnderworld.html': read('OrigamiUnderworld.html'),
  'sw.js': read('sw.js'),
};
if (ENTITY) files['js/v8/ui/PlayerGuide.js'] = read('js/v8/ui/PlayerGuide.js');

// ── collect every current version number so FORWARD-ONLY is computed against ALL of them
const tokens = [];
const grab = (file, re, label) => {
  const m = files[file] && files[file].match(re);
  if (!m) { console.error('✗ cannot find ' + label + ' in ' + file + ' — refusing to bump blind.'); process.exit(1); }
  tokens.push({ file, label, full: m[0], value: m[1] });
};
// FIXED 2026-09-30 (readiness audit finding 3, 2026-09-29): the shell was renamed
// Engine9.html -> Origami.RealityEngine.9.html on 2026-09-19 and this regex was never
// forward-ported, so `grab()` returned null and every `npm run bump` call exited 1 —
// nothing bumped, silently. Caught it still broken: the engine token (8.4.1174) and the
// OniBaba8 token (8.4.1099) were already out of sync on HEAD because of it.
grab('OrigamiUnderworld.html', /Origami\.RealityEngine\.9\.html\?v=([^"']+)/, 'Origami.RealityEngine.9.html?v=');
grab('OrigamiUnderworld.html', /OniBaba8\.js\?v=([^"']+)/, 'OniBaba8.js?v=');
grab('sw.js', /const CACHE = "([^"]+)"/, 'sw.js CACHE');
if (ENTITY) grab('js/v8/ui/PlayerGuide.js', /EntityCatalog\.js\?v=([^"']+)/, 'EntityCatalog.js?v=');

let maxN = 0, family = '8.3';
for (const t of tokens) {
  const m = t.value.match(/^(\d+\.\d+)\.(\d+)/);
  if (m) { family = m[1]; maxN = Math.max(maxN, parseInt(m[2], 10)); }
}
if (!maxN) { console.error('✗ no parseable ' + family + '.N version found anywhere — refusing to guess.'); process.exit(1); }
const next = family + '.' + (maxN + 1) + '-' + slug;
const today = new Date().toISOString().slice(0, 10);
const swName = 'origami-v8-' + today + '-' + slug;

console.log((DRY ? '[dry] ' : '') + 'bump → ' + next + '  (forward of ' + family + '.' + maxN + ')');
for (const t of tokens) {
  const to = t.label === 'sw.js CACHE' ? swName : next;
  console.log('  ' + t.label.padEnd(20) + t.value + '  →  ' + to);
}
if (DRY) process.exit(0);

// ── validate-then-write: build every new file body first; only then touch disk
const out = {};
out['OrigamiUnderworld.html'] = files['OrigamiUnderworld.html']
  .replace(/Origami\.RealityEngine\.9\.html\?v=[^"']+/, 'Origami.RealityEngine.9.html?v=' + next)
  .replace(/OniBaba8\.js\?v=[^"']+/, 'OniBaba8.js?v=' + next);
out['sw.js'] = files['sw.js'].replace(/const CACHE = "[^"]+"/, 'const CACHE = "' + swName + '"');
if (ENTITY) out['js/v8/ui/PlayerGuide.js'] = files['js/v8/ui/PlayerGuide.js']
  .replace(/EntityCatalog\.js\?v=[^"']+/, 'EntityCatalog.js?v=' + next);
for (const f in out) if (out[f] === files[f]) { console.error('✗ replacement produced no change in ' + f + ' — aborting, nothing written.'); process.exit(1); }
for (const f in out) fs.writeFileSync(path.join(ROOT, f), out[f]);
console.log('✓ written together. Commit the bump WITH the change it serves (rule 4).');
