#!/usr/bin/env node
/**
 * gate-release.js — the fail-closed gate a public cut must pass BEFORE it is staged.
 *
 *   npm run gate:dist      # boot DISTRIBUTION/dist and prove it is publishable
 *   npm run gate:staged    # compare the staged release clone against the LIVE remote
 *
 * WHY EACH CHECK EXISTS (every one of these has already gone wrong — see RELEASE_PLAYBOOK.md):
 *
 *  gate:dist
 *   1. BOOT + ZERO non-200 responses. The r20 cut shipped a `fetch('undefined')` 404 that existed
 *      ONLY in the dist: esbuild demotes let/const to var, so a temporal-dead-zone throw that is
 *      silently swallowed in the dev tree becomes a real undefined-read in the public build.
 *      A dev-tree smoke run CANNOT find this class of bug. This one can.
 *   2. ZERO pageerrors.
 *   3. Every audio path the generated data files name must exist. The manifest pointed at songs that
 *      had been MOVED, so the public music page listed tracks that 404'd.
 *   4. No internal docs and no internal annotations. Independent of build.mjs's own guards on purpose:
 *      a gate that shares code with the thing it audits is not a gate.
 *
 *  gate:staged
 *   5. The staged clone must not be BEHIND the remote, and must not DELETE text the remote has.
 *      Mark edits the public repo directly on GitHub; a rebuilt tree copied over the clone deletes
 *      those edits silently. This nearly erased the memoriam to his parents (dffbfb6).
 *   6. FIXED 2026-09-30 (readiness audit finding 5, 2026-09-29): checks 1-4 above only ever ran
 *      against DISTRIBUTION/dist. The staged CLONE -- the tree that actually leaves the machine --
 *      got no leak check and no Pages-hostile-filename check of its own; the only backstop was the
 *      narrower grep pair inside release-push.sh. gate:staged now runs the same leak/filename/audio
 *      checks gate:dist runs, directly against CLONE, so the tree that actually ships is covered by
 *      the real gate, not just the last-line-of-defence grep.
 *
 * Exits non-zero on any failure. Closes the browser and the server before exiting — a probe that
 * leaks a headless Chrome steals Mark's live fps.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const DIST = path.join(REPO, 'DISTRIBUTION', 'dist');
const CLONE = '/Users/mark/Documents/ORIGAMI/Origami-Release';
const MODE = process.argv.includes('--staged') ? 'staged' : 'dist';

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.ogg':'audio/ogg','.srt':'text/plain','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf',
  '.webmanifest':'application/manifest+json' };

// Internal fingerprints that must never appear inside a shipped file. Deliberately precise: game
// strings like "ROGUE YAKUZA" are CONTENT and must never be redacted (CLAUDE.md humor mandate).
const SENSITIVE = [
  /DISABLED-FEATURES/i, /WALL OF SHAME/i, /HALL_OF/i, /Worker[- ][A-E1-5]\b/,
  /poison[- ]pill/i, /rogue (AI|seat|worker|commit)/i, /\(Mark 20\d\d/, /Mark mandate/i,
  /\.trust\//, /\.locks\//, /\.vault\//,
];
const PUBLIC_MD = new Set(['README.md', 'MANIFESTO.md']);

const fails = [];
const ok = m => console.log('   ✓ ' + m);
const bad = (m, detail) => { fails.push(m); console.log('   ✗ ' + m); (detail || []).slice(0, 12).forEach(d => console.log('       ' + d)); };

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc); else acc.push(path.relative(base, p));
  }
  return acc;
}

// ── leak checks, run against whatever tree is handed in ─────────────────────
function leakChecks(root, label) {
  const files = walk(root);
  const forbidden = files.filter(rel => {
    const u = rel.replaceAll('\\', '/');
    if (/(^|\/)(knowledge|plans|scripts|pipeline|\.trust|\.locks|\.vault|\.claude|node_modules)(\/|$)/i.test(u)) return true;
    if (/\.(map|log|env)$/i.test(u) || /(^|\/)\.env/i.test(u)) return true;
    if (/MEMORY\.md$|HALL_OF|ORCHESTRATOR_|WORKER_/i.test(u)) return true;
    if (/\.md$/i.test(u) && !PUBLIC_MD.has(u)) return true;
    return false;
  });
  forbidden.length ? bad(`${label}: ${forbidden.length} internal file(s) present`, forbidden) : ok(`${label}: no internal files`);

  const offenders = [];
  for (const rel of files) {
    if (!/\.(html|js|css|txt|json)$/i.test(rel)) continue;
    if (rel === 'PROVENANCE.txt') continue;   // names the pipeline on purpose
    const txt = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const re of SENSITIVE) { const m = txt.match(re); if (m) { offenders.push(`${rel} :: ${String(m[0]).slice(0, 50)}`); break; } }
  }
  offenders.length ? bad(`${label}: ${offenders.length} internal annotation(s) inside shipped files`, offenders)
                   : ok(`${label}: no internal annotations`);
}

// ── MODE: staged — compare the release clone against what is LIVE on GitHub ──

// ── every .sha256 sidecar must match the bytes beside it ─────────────────────
// r25 (2026-09-13) went public with dist/language-cube.json re-serialised by the JSON sanitizer and its sidecar untouched;
// ChatResponder verifies the hash at runtime and treats a mismatch as fatal, so the chat cube was dead on the live site
// while every gate was green. A sidecar is a promise about bytes — this check is the gate keeping that promise.
function sidecarChecks(root, label) {
  const bad_ = [];
  const sidecars = walk(root).filter(rel => /\.sha256$/i.test(rel));
  for (const rel of sidecars) {
    const want = (fs.readFileSync(path.join(root, rel), 'utf8').trim().split(/\s+/)[0] || '').toLowerCase();
    const base = rel.replace(/\.sha256$/i, '');
    const target = [base + '.json', base].find(c => fs.existsSync(path.join(root, c)));   // language-cube.sha256 seals language-cube.json
    if (!target) { bad_.push(`${base}(.json) :: MISSING (sidecar present)`); continue; }
    const tp = path.join(root, target);
    const got = crypto.createHash('sha256').update(fs.readFileSync(tp)).digest('hex');
    if (got !== want) bad_.push(`${target} :: sidecar ${want.slice(0, 16)}… but file hashes to ${got.slice(0, 16)}…`);
  }
  bad_.length ? bad(`${label}: ${bad_.length} hash-sealed file(s) do not match their .sha256 sidecar`, bad_)
              : ok(`${label}: ${sidecars.length} hash-sealed file(s) match their .sha256 sidecar`);
}

// GitHub Pages will not build a tree containing filenames with spaces or parentheses. This cost five
// days of a dead site: r18 (2026-07-27) published a tree with ZERO such names and built in 65s; r19
// (2026-08-06) added exactly one — `黄泉の宿 (1).mp3` — and every Pages build since failed instantly
// with duration 0, so the public site silently kept serving r18. Nothing in the pipeline was looking.
// Non-ASCII alone is FINE — r18 shipped Japanese filenames and built. The space/paren is the problem.
function hostileFilenameCheck(root, label) {
  const hostile = walk(root).filter(rel => /[ ()]/.test(rel));
  hostile.length
    ? bad(`${label}: ${hostile.length} filename(s) contain a space or parenthesis — GitHub Pages will refuse to build`, hostile)
    : ok(`${label}: no Pages-hostile filenames (no spaces or parentheses)`);
}

// audio paths named by the generated data files must exist. The copies may be OBFUSCATED, so
// spaces / non-ASCII arrive as \xNN and \uNNNN escapes — un-escape before testing for existence
// or you get phantom failures on filenames containing a space.
function audioPathCheck(root, label) {
  const unesc = s => s.replace(/\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})/g, (_, a, b) => String.fromCharCode(parseInt(a || b, 16)));
  const audio = new Set();
  for (const rel of ['js/v8/data/AudioManifest.js', 'js/v8/data/ToneAnalysis.js']) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, 'utf8');
    for (const m of t.matchAll(/["'](\.\/assets\/[^"']+\.mp3)["']/g)) audio.add(unesc(m[1]).slice(2));
  }
  const missing = [...audio].filter(rel => !fs.existsSync(path.join(root, rel)));
  missing.length ? bad(`${label}: ${missing.length} of ${audio.size} referenced audio files are missing`, missing)
                 : ok(`${label}: all ${audio.size} referenced audio files resolve`);
}

function gateStaged() {
  console.log('\n── staged release clone vs the live remote ────────────────────\n');
  const git = (...a) => execFileSync('git', ['-C', CLONE, ...a], { encoding: 'utf8' }).trim();
  if (!fs.existsSync(CLONE)) { bad('release clone not found at ' + CLONE); return; }
  try { execFileSync('git', ['-C', CLONE, 'fetch', 'origin', '--quiet'], { stdio: 'ignore' }); } catch (_) {}

  const behind = +git('rev-list', '--count', 'HEAD..origin/main');
  if (behind > 0) {
    bad(`clone is BEHIND the remote by ${behind} commit(s) — staging would overwrite them`,
        git('log', '--oneline', 'HEAD..origin/main').split('\n'));
    console.log('\n       These are usually edits made DIRECTLY ON GITHUB. Forward-port them into the');
    console.log('       dev repo before cutting, or they are deleted by the next build.');
  } else ok('clone is up to date with the remote');

  // The near-miss check: does staging DELETE prose the public repo already has?
  const deleted = [];
  for (const rel of ['README.md', 'MANIFESTO.md', 'LICENSE']) {
    let remote;
    try { remote = execFileSync('git', ['-C', CLONE, 'show', `origin/main:${rel}`], { encoding: 'utf8' }); }
    catch (_) { continue; }                                   // not on the remote yet — nothing to lose
    const localPath = path.join(CLONE, rel);
    if (!fs.existsSync(localPath)) { deleted.push(`${rel} :: FILE REMOVED ENTIRELY`); continue; }
    const local = fs.readFileSync(localPath, 'utf8');
    const localLines = new Set(local.split('\n').map(s => s.trim()).filter(Boolean));
    for (const line of remote.split('\n').map(s => s.trim())) {
      if (line && !localLines.has(line)) deleted.push(`${rel} :: "${line.slice(0, 70)}"`);
    }
  }
  deleted.length
    ? bad(`${deleted.length} line(s) that exist on the PUBLIC repo would be DELETED by this cut`, deleted)
    : ok('no public prose is deleted by this cut (text changes are additive)');
  sidecarChecks(CLONE, 'staged');
  leakChecks(CLONE, 'staged');             // finding 5: the shipping tree itself, not just the dist copy
  hostileFilenameCheck(CLONE, 'staged');
  audioPathCheck(CLONE, 'staged');
}

// ── MODE: dist — boot the built tree and prove it is publishable ─────────────
async function gateDist() {
  console.log('\n── built dist ─────────────────────────────────────\n');
  if (!fs.existsSync(DIST)) { bad('no dist at ' + DIST + ' — run the build first'); return; }
  leakChecks(DIST, 'dist');
  sidecarChecks(DIST, 'dist');

  audioPathCheck(DIST, 'dist');
  hostileFilenameCheck(DIST, 'dist');

  // SEO RENAME (Mark 2026-09-19): the dist entry is OrigamiUnderworld.html — build.mjs ENTRY_DIST, and
  // as of this commit the DEV tree boots that same name too (the old NewOrigami.9.html dev filename is
  // retired, not just the shipped one — FIXED 2026-09-30, this ternary's two branches were identical
  // dead code and the comment's "dev tree still boots NewOrigami.9.html" claim was already false).
  const DIST_ENTRY = 'OrigamiUnderworld.html';
  // boot it
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (_) { bad('playwright unavailable — cannot boot the dist (this gate is NOT satisfied)'); return; }

  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || DIST_ENTRY;
    const f = path.join(DIST, rel);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const bad404 = [], errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Only OUR OWN origin counts. A CDN hiccup (fonts.gstatic) is not a reason to block a release,
    // and treating it as one trains people to ignore the gate.
    page.on('response', r => { const u = r.url(); if (r.status() >= 400 && u.startsWith(base)) bad404.push(r.status() + ' ' + u.replace(base, '')); });
    page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 160)));
    await page.goto(base + '/' + DIST_ENTRY, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 })
      .catch(() => errs.push('ENGINE NEVER BECAME READY'));
    await page.keyboard.press('KeyW').catch(() => {});   // a gesture: opens the audio/prefetch lane
    await new Promise(r => setTimeout(r, 15000));
  } finally {
    try { await browser.close(); } catch (_) {}
    try { await new Promise(r => server.close(r)); } catch (_) {}
    await new Promise(r => setTimeout(r, 300));          // let Chromium finish tearing down
  }
  bad404.length ? bad(`${bad404.length} same-origin request(s) failed`, bad404) : ok('every same-origin request returned 200');
  errs.length ? bad(`${errs.length} pageerror(s)`, errs) : ok('booted with zero pageerrors');
}

(async () => {
  console.log(`\nRELEASE GATE — mode: ${MODE}`);
  if (MODE === 'staged') gateStaged(); else await gateDist();
  console.log('');
  if (fails.length) {
    console.log(`❌ GATE FAILED — ${fails.length} problem(s). Do NOT publish.`);
    process.exitCode = 1;
  } else {
    console.log('✅ GATE PASSED.');
  }
})();
