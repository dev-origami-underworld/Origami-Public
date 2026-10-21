#!/usr/bin/env node
/**
 * asset-ledger.js — the rights ledger for every third-party file the public build ships.
 * Claude (the only AI), 2026-09-16, on Mark's Steam order (plans/STEAM_RELEASE_PLAN_2026-09-14.md §2:
 * "A rights ledger for every third-party file — source / licence / attribution / sale allowed … and a gate
 * that fails the build when a shipped file has no row").
 *
 * WHAT IT DOES
 *   1. Walks the shipped media under the build's COPY_DIRS that carry third-party content (assets/, vendor/,
 *      sponsors/) — models, sounds, images, fonts, captions. Skips .DS_Store / backups / anything not shipped.
 *   2. For every file, works out its PROVENANCE from the tree itself, most specific first:
 *        a. a hand-confirmed declaration in knowledge/legal/asset-ledger.json (exact path or glob) — CONFIRMED
 *        b. a Sketchfab license.txt beside the file, or metadata embedded in the GLB itself
 *           (asset.copyright / asset.extras.author|license|source)                                  — EMBEDDED
 *        c. the GLB's generator tag ("Tripo", Blender, glTF-Transform) as a HINT only                — UNKNOWN
 *      plus the first commit that added it (date + subject), so a human can trace it.
 *   3. Writes knowledge/legal/ASSET_LEDGER.md (a folder summary + every row that needs a decision) and
 *      knowledge/legal/asset-ledger.report.json (every file, machine-readable).
 *   4. --gate: exit 1 when any shipped file is UNKNOWN, has saleAllowed === false, or carries a
 *      non-commercial licence (…-NC-…). --report (default): print the counts and exit 0.
 *      --strict is the same as --gate. Wire --gate into the release pipeline only once the rows are green;
 *      until then it is the homework list.
 *
 * THE RULE THE FILE ENCODES: a declaration is a CLAIM WITH A NAME AND A DATE ("confirmedBy": "Mark",
 * "date": "2026-09-16"). An undated claim is a hint, never a confirmation. The generator never writes into
 * asset-ledger.json — only Mark (or a seat on his verbatim word) edits that file.
 *
 *   node scripts/asset-ledger.js            # report + regenerate the md/json
 *   node scripts/asset-ledger.js --gate     # fail on any UNKNOWN / NC / saleAllowed:false
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DECL_PATH = path.join(ROOT, 'knowledge', 'legal', 'asset-ledger.json');
const MD_PATH = path.join(ROOT, 'knowledge', 'legal', 'ASSET_LEDGER.md');
const JSON_PATH = path.join(ROOT, 'knowledge', 'legal', 'asset-ledger.report.json');
const SHIPPED_DIRS = ['assets', 'vendor', 'sponsors'];
const MEDIA_EXT = /\.(glb|gltf|usdz|mp3|wav|ogg|m4a|png|jpg|jpeg|webp|gif|svg|woff2|woff|ttf|otf|srt|vtt)$/i;
const SKIP = /(^|\/)(\.DS_Store|\.gitkeep|Thumbs\.db)$|\.crate-backup$|(^|\/)models\/backup\//;   // mirrors build.mjs: .DS_Store and models/backup never ship
const GATE = process.argv.includes('--gate') || process.argv.includes('--strict');

// ── walk ────────────────────────────────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (MEDIA_EXT.test(e.name) && !SKIP.test(p)) out.push(path.relative(ROOT, p));
  }
  return out;
}

// ── evidence in the tree ────────────────────────────────────────────────────────────────────────────
function glbMeta(abs) {
  try {
    const fd = fs.openSync(abs, 'r');
    const head = Buffer.alloc(20); fs.readSync(fd, head, 0, 20, 0);
    if (head.readUInt32LE(0) !== 0x46546C67) { fs.closeSync(fd); return null; }
    const len = head.readUInt32LE(12);
    const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, 20); fs.closeSync(fd);
    const j = JSON.parse(buf.toString('utf8'));
    const a = j.asset || {}, ex = a.extras || {};
    return { generator: a.generator || null, copyright: a.copyright || null, author: ex.author || null,
             license: ex.license || null, source: ex.source || null, title: ex.title || null };
  } catch (_) { return null; }
}
function sketchfabLicense(rel) {
  // Sketchfab's download pack drops a license.txt beside the model: title / source / author / license type
  // a Sketchfab pack keeps its textures in a subfolder — look in the file's folder, then up to two parents
  let dir = path.dirname(path.join(ROOT, rel)), f = null;
  for (let up = 0; up < 3 && !f; up++, dir = path.dirname(dir)) {
    if (!dir.startsWith(path.join(ROOT, 'assets')) && !dir.startsWith(path.join(ROOT, 'vendor'))) break;
    f = ['license.txt', 'LICENSE.txt', 'License.txt'].map(n => path.join(dir, n)).find(p => fs.existsSync(p)) || null;
  }
  if (!f) return null;
  const t = fs.readFileSync(f, 'utf8');
  const g = (re) => { const m = t.match(re); return m ? m[1].trim() : null; };
  const lic = g(/license type:\s*([^\n]+)/i);
  if (!lic && !/sketchfab/i.test(t)) return null;
  return { title: g(/title:\s*([^\n]+)/i), source: g(/source:\s*([^\n]+)/i), author: g(/author:\s*([^\n]+)/i),
           license: lic, file: path.relative(ROOT, f) };
}
function plainLicenseBeside(rel) {
  // a bare LICENSE file (CC0 / MIT text) beside the file
  const dir = path.dirname(path.join(ROOT, rel));
  const f = ['LICENSE', 'LICENSE.md', 'COPYING'].map(n => path.join(dir, n)).find(p => fs.existsSync(p));
  if (!f) return null;
  const t = fs.readFileSync(f, 'utf8').slice(0, 400);
  const lic = /CC0 1\.0/i.test(t) ? 'CC0-1.0' : /MIT License/i.test(t) ? 'MIT' : /Apache License/i.test(t) ? 'Apache-2.0' : null;
  return lic ? { license: lic, file: path.relative(ROOT, f) } : null;
}
let _firstCommitCache = null;
function firstCommit(rel) {
  // one git call for the whole tree instead of one per file
  if (!_firstCommitCache) {
    _firstCommitCache = new Map();
    try {
      const out = execSync('git log --diff-filter=A --name-only --format="@@%ad %s" --date=short -- ' + SHIPPED_DIRS.join(' '),
                           { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      // the log is newest-first; a file re-added later would show twice — keep the LAST seen, i.e. the oldest
      const oldest = new Map(); let cur = null;
      for (const line of out.split('\n')) {
        if (line.startsWith('@@')) { cur = line.slice(2).trim(); continue; }
        const f = line.trim(); if (f && cur) oldest.set(f, cur);
      }
      _firstCommitCache = oldest;
    } catch (_) {}
  }
  return _firstCommitCache.get(rel) || null;
}

// ── declarations (Mark's confirmations, by path or glob) ──────────────────────────────────────────
function globToRe(g) {
  // placeholders first — a plain `*` pass would otherwise rewrite the `*` inside the `.*` that `**` became
  const esc = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '@@DEEP@@').replace(/\*\*/g, '@@ANY@@').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
               .replace(/@@DEEP@@/g, '(?:.*/)?').replace(/@@ANY@@/g, '.*');
  return new RegExp('^' + esc + '$');
}
function loadDecls() {
  if (!fs.existsSync(DECL_PATH)) return [];
  const j = JSON.parse(fs.readFileSync(DECL_PATH, 'utf8'));
  return (j.declarations || []).map(d => ({ ...d, re: globToRe(d.path), exRe: (d.exclude || []).map(globToRe), specificity: d.path.replace(/\*/g, '').length }));
}
function declFor(rel, decls) {
  // most specific path wins; a declaration's `exclude` globs carve holes in it (a folder-wide claim that must not swallow a
  // third-party pack inside the folder — the Sketchfab files under assets/models/ keep their own rows)
  const hits = decls.filter(d => d.re.test(rel) && !d.exRe.some(x => x.test(rel))).sort((a, b) => b.specificity - a.specificity);
  return hits[0] || null;
}

// ── classify ────────────────────────────────────────────────────────────────────────────────────────
function classify(rel, decls) {
  const abs = path.join(ROOT, rel);
  const row = { path: rel, bytes: fs.statSync(abs).size, firstCommit: firstCommit(rel) };
  const d = declFor(rel, decls);
  const sf = sketchfabLicense(rel);   // any file in a Sketchfab pack (the textures too)
  const gm = /\.glb$/i.test(rel) ? glbMeta(abs) : null;
  const pl = plainLicenseBeside(rel);
  row.generator = gm && gm.generator;
  if (d) {
    Object.assign(row, { status: (d.confirmedBy && d.date) ? 'CONFIRMED' : 'DECLARED', source: d.source, license: d.license,
                         attribution: d.attribution || null, saleAllowed: d.saleAllowed, note: d.note || null, by: d.confirmedBy || null, date: d.date || null, decl: d.path });
  } else if (sf || (gm && (gm.license || gm.author || gm.copyright))) {
    const src = sf || gm;
    row.status = 'EMBEDDED';
    row.source = src.source || (sf ? 'Sketchfab (license.txt)' : 'embedded in GLB');
    row.license = src.license || gm.copyright || null;
    row.attribution = (src.title ? '"' + src.title + '" ' : '') + (src.author ? 'by ' + src.author : '');
    row.saleAllowed = row.license ? !/-NC\b|non-?commercial|personal use/i.test(row.license) : null;
    row.note = sf ? 'from ' + sf.file : 'from the GLB asset block';
  } else if (pl) {
    row.status = 'EMBEDDED'; row.source = 'licence file beside it (' + pl.file + ')'; row.license = pl.license; row.saleAllowed = true;
  } else {
    row.status = 'UNKNOWN'; row.source = null; row.license = null; row.saleAllowed = null;
    row.note = gm && gm.generator ? 'GLB generator: ' + gm.generator : null;
  }
  // a CONFIRMED row's saleAllowed is the authority (our own art is CC BY-NC-SA to OTHERS — that is a grant, not a bar on us);
  // the NC sniff only decides for rows nobody has confirmed
  row.nc = !(row.status === 'CONFIRMED' && row.saleAllowed === true) && !!(row.license && /-NC\b|non-?commercial|personal use/i.test(row.license));
  row.red = row.status === 'UNKNOWN' || row.saleAllowed === false || row.nc;
  return row;
}

// ── main ───────────────────────────────────────────────────────────────────────────────────────────
const decls = loadDecls();
const files = SHIPPED_DIRS.flatMap(d => fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []).sort();
const rows = files.map(f => classify(f, decls));
const byStatus = {}; for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
const red = rows.filter(r => r.red);
const folders = {};
for (const r of rows) {
  const k = path.dirname(r.path).split('/').slice(0, 4).join('/');
  const f = folders[k] || (folders[k] = { files: 0, bytes: 0, red: 0, status: new Set(), license: new Set(), source: new Set() });
  f.files++; f.bytes += r.bytes; if (r.red) f.red++; f.status.add(r.status); if (r.license) f.license.add(r.license); if (r.source) f.source.add(r.source);
}
const mb = b => (b / 1048576).toFixed(1) + ' MB';
const today = new Date().toISOString().slice(0, 10);
const md = [];
md.push('# ASSET LEDGER — every third-party file the public build ships (generated ' + today + ')');
md.push('');
md.push('Generated by `node scripts/asset-ledger.js` from the tree — **do not hand-edit this file**. Confirm a row by adding a');
md.push('declaration to `knowledge/legal/asset-ledger.json` with your name and the date; the generator reads it back here.');
md.push('Gate: `node scripts/asset-ledger.js --gate` fails on any UNKNOWN row, any `-NC-` licence, any `saleAllowed: false`.');
md.push('Plan: `plans/STEAM_RELEASE_PLAN_2026-09-14.md` §2. Steam is a commercial storefront even for a free listing — a row that');
md.push('cannot be sold is a swap, not a footnote.');
md.push('');
md.push('| Status | Files | Meaning |');
md.push('|---|---|---|');
md.push('| CONFIRMED | ' + (byStatus.CONFIRMED || 0) + ' | a declaration with a name and a date |');
md.push('| DECLARED | ' + (byStatus.DECLARED || 0) + ' | a declaration without a name/date — a hint, not a confirmation |');
md.push('| EMBEDDED | ' + (byStatus.EMBEDDED || 0) + ' | licence read from a Sketchfab license.txt / the GLB itself / a LICENSE beside it — unconfirmed |');
md.push('| UNKNOWN | ' + (byStatus.UNKNOWN || 0) + ' | nothing in the tree says where it came from |');
md.push('| **RED** | **' + red.length + '** | UNKNOWN, non-commercial, or saleAllowed:false — blocks the Steam gate |');
md.push('');
md.push('## By folder');
md.push('');
md.push('| Folder | Files | Size | Red | Status | Licence(s) | Source(s) |');
md.push('|---|---|---|---|---|---|---|');
for (const [k, f] of Object.entries(folders).sort()) {
  md.push('| `' + k + '` | ' + f.files + ' | ' + mb(f.bytes) + ' | ' + (f.red ? '**' + f.red + '**' : '0') + ' | ' + [...f.status].join(', ') + ' | ' + ([...f.license].join(', ') || '—') + ' | ' + ([...f.source].map(s => s.length > 60 ? s.slice(0, 57) + '…' : s).join(', ') || '—') + ' |');
}
md.push('');
md.push('## Rows that need a decision (' + red.length + ')');
md.push('');
md.push('One line each: what the tree knows and the commit that brought the file in. Mark answers per FOLDER in asset-ledger.json —');
md.push('a glob covers a whole pack — and the row goes green on the next run.');
md.push('');
md.push('| File | Size | Why red | Hint | First commit |');
md.push('|---|---|---|---|---|');
for (const r of red) {
  const why = r.status === 'UNKNOWN' ? 'UNKNOWN origin' : r.nc ? 'NON-COMMERCIAL licence: ' + r.license : 'saleAllowed:false';
  md.push('| `' + r.path + '` | ' + mb(r.bytes) + ' | ' + why + ' | ' + (r.attribution || r.note || '—') + ' | ' + (r.firstCommit || '—').slice(0, 90) + ' |');
}
md.push('');
md.push('## Confirmed and embedded rows');
md.push('');
md.push('| File | Status | Licence | Source | Attribution | Sale | By |');
md.push('|---|---|---|---|---|---|---|');
for (const r of rows.filter(r => !r.red)) {
  md.push('| `' + r.path + '` | ' + r.status + ' | ' + (r.license || '—') + ' | ' + (r.source || '—').slice(0, 70) + ' | ' + (r.attribution || '—').slice(0, 70) + ' | ' + (r.saleAllowed === true ? 'yes' : r.saleAllowed === false ? 'NO' : '?') + ' | ' + (r.by ? r.by + ' ' + r.date : '—') + ' |');
}
md.push('');
md.push('Written by scripts/asset-ledger.js on ' + today + '. Rows: ' + rows.length + '. Red: ' + red.length + '.');
fs.mkdirSync(path.dirname(MD_PATH), { recursive: true });
fs.writeFileSync(MD_PATH, md.join('\n') + '\n');
fs.writeFileSync(JSON_PATH, JSON.stringify({ generated: today, counts: byStatus, red: red.length, rows }, null, 1) + '\n');

console.log('[ASSET-LEDGER] ' + rows.length + ' shipped files — ' + Object.entries(byStatus).map(([k, v]) => k + ' ' + v).join(' · ') + ' · RED ' + red.length);
const redFolders = {}; for (const r of red) { const k = path.dirname(r.path).split('/').slice(0, 4).join('/'); redFolders[k] = (redFolders[k] || 0) + 1; }
for (const [k, n] of Object.entries(redFolders).sort()) console.log('   red  ' + String(n).padStart(4) + '  ' + k);
const ncRows = rows.filter(r => r.nc); if (ncRows.length) console.log('   NON-COMMERCIAL: ' + ncRows.map(r => r.path + ' (' + r.license + ')').join(', '));
console.log('   wrote ' + path.relative(ROOT, MD_PATH) + ' and ' + path.relative(ROOT, JSON_PATH));
if (GATE) { console.log(red.length ? 'GATE FAIL — ' + red.length + ' red row(s)' : 'GATE PASS'); process.exit(red.length ? 1 : 0); }
