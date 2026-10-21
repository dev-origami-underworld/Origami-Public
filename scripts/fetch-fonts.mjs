#!/usr/bin/env node
/**
 * fetch-fonts.mjs — vendor the Google Fonts we use into assets/fonts/, so the game asks nobody.
 *
 * WHY (Mark 2026-08-11, after a 404 in his console):
 *   fonts.gstatic.com rotated a Nunito file out from under a stylesheet his browser had cached, and the
 *   font silently stopped loading. `display=swap` meant it degraded to a fallback rather than breaking —
 *   which is the problem: it fails INVISIBLY, and it will keep doing so for as long as the public build
 *   depends on a CDN we do not control. Second reason, already flagged in probe-song-votes.js:231 — every
 *   player's browser announces itself to Google on boot, which is not what "$0-infra freeware" should mean.
 *
 * WHAT IT DOES NOT DO: change which fonts render. It downloads exactly the families/weights the HTML
 *   already requests and rewrites the URLs to local ones. Same faces, same fallbacks, no visual change.
 *   That is deliberate — see the NOTE ON Noto Sans JP at the bottom of this header.
 *
 * WHY A SCRIPT AND NOT A ONE-OFF DOWNLOAD: Google versions these (the 404 above was a `v32` rotation).
 *   When a family needs refreshing, re-run this rather than hand-editing 250 URLs.
 *
 * THE UA MATTERS. Google serves woff2 + unicode-range subsets to modern browsers and fatter legacy
 *   formats to everything else. Fetch with a stale UA and you silently vendor the wrong thing — bigger
 *   files, no subsetting. Hence the explicit modern Chrome UA below.
 *
 * WHY THE JAPANESE FAMILIES ARE ~124 FILES EACH, AND WHY THAT IS THE GOOD OUTCOME:
 *   Google splits CJK by glyph frequency and guards each slice with a `unicode-range`. The browser
 *   downloads only the slices whose glyphs are actually on screen — typically two or three. Vendoring all
 *   of them costs disk in the repo and almost nothing at runtime. Concatenating them into one file would
 *   look tidier in `ls` and force every player to download ~5 MB to read one kanji. Do not "tidy" this.
 *
 * NOTE ON Noto Sans JP — A LATENT GAP, LEFT ALONE ON PURPOSE:
 *   Panels and Engine9 both NAME 'Noto Sans JP' in CSS and in canvas `g.font` strings, but neither one
 *   ever REQUESTS it — only Inventory.html (which does not ship) does. So in the public build that family
 *   has always resolved to a system font: Hiragino on macOS, Yu Gothic on Windows, and tofu wherever
 *   neither exists. Vendoring it here would quietly change how JP text looks on Mark's own machine, which
 *   is a visual decision and not mine to make inside a plumbing change. Flagged, not fixed.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'fonts');
const FILE_DIR = path.join(OUT_DIR, 'files');

// Chrome on macOS. Anything older and Google stops sending woff2 + unicode-range subsets.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/* Exactly what the HTML asks for today — union of the weights across every live file, so one local
 * stylesheet can replace all of them. Keep this list in sync with the <link> tags; a weight requested
 * in markup but missing here renders as a synthesised (smeared) bold instead of the real cut. */
const FAMILIES = [
    { css: 'Nunito:wght@400;700;800;900',              note: 'body/UI — Panels, Engine9, Inventory, Editor' },
    { css: 'Cinzel:wght@500;600;700;800;900',          note: 'display serif — Engine9, Panels' },
    { css: 'Cinzel+Decorative:wght@700;900',           note: 'card/permit flourishes — Panels' },
    { css: 'Inter:wght@400;500;600;700;800;900',       note: 'UI sans — Engine9, Editor, AdventureUI' },
    { css: 'Noto+Serif+JP:wght@200;300;400',           note: 'Japanese serif — Panels, Engine9 (SHIPS)' },
    { css: 'Anton',                                    note: 'boss.html' },
    { css: 'Oswald:wght@500;700',                      note: 'boss.html' },
    // Mark 2026-08-18, the music-workstation redesign he pasted in: its whole typographic voice is
    // Space Mono. Vendored here rather than through the <link href="fonts.googleapis.com"> the mockup
    // used — `npm run probe:fonts` boots the real game and FAILS on any request to a Google font host,
    // so a CDN link could not have survived the gate even if it were otherwise acceptable to ship.
    { css: 'Space+Mono:wght@400;700',                  note: 'music page — the Winamp/workstation face' },
];

const get = async (url, asText) => {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return asText ? r.text() : Buffer.from(await r.arrayBuffer());
};

/* ── GOOGLE INTERMITTENTLY SERVES A STYLESHEET THAT POINTS AT FILES THAT DO NOT EXIST ───────────────
 * Measured 2026-08-11: the same request for Nunito returned, on ONE attempt out of several, a
 * VARIABLE-font CSS (`XRX_3I6…`, long hash) whose .woff2 404s; every other attempt returned the static
 * cuts (`XRXV3I6…`, short hash) which all 200. Not a cache — a cold Node fetch hit it. This is almost
 * certainly what put the 404 in Mark's console.
 *
 * The failure is silent by construction: `display=swap` renders a fallback face, so a browser shows
 * slightly-wrong type and no error a player would report. Vendoring a broken stylesheet would BAKE that
 * in permanently, which is worse than the CDN flake it was meant to cure. So: verify every face URL
 * actually resolves before accepting a stylesheet, and re-request if any does not. */
const cssWithLiveFaces = async (url, attempts = 4) => {
    let last = '';
    for (let i = 1; i <= attempts; i++) {
        const css = await get(url, true);
        const remote = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])];
        const dead = [];
        for (const r of remote) {
            const h = await fetch(r, { method: 'HEAD', headers: { 'User-Agent': UA } });
            if (!h.ok) dead.push(`${h.status} ${r.split('/').pop()}`);
        }
        if (!dead.length) return { css, remote, retries: i - 1 };
        last = dead[0];
        console.log(`\n    ⚠ attempt ${i}: Google served ${dead.length} dead face URL(s) (${last}) — re-requesting`);
    }
    throw new Error(`Google kept serving dead face URLs after ${attempts} attempts (last: ${last}). `
                  + `Not vendoring a broken stylesheet — re-run later.`);
};

const main = async () => {
    await mkdir(FILE_DIR, { recursive: true });
    const chunks = [];
    let files = 0, bytes = 0, reused = 0;

    for (const fam of FAMILIES) {
        const url = `https://fonts.googleapis.com/css2?family=${fam.css}&display=swap`;
        process.stdout.write(`  ${fam.css.split(':')[0].replace(/\+/g, ' ')} … `);
        let { css, remote, retries } = await cssWithLiveFaces(url);
        if (retries) console.log(`    (recovered after ${retries} bad response(s) from Google)`);

        for (const r of remote) {
            // Keep gstatic's own filename: it encodes the family+weight+subset, so collisions across
            // families are not possible and a re-run is idempotent.
            const base = r.split('/').pop().split('?')[0];
            const dest = path.join(FILE_DIR, base);
            if (existsSync(dest)) { reused++; }
            else {
                const buf = await get(r, false);
                await writeFile(dest, buf);
                bytes += buf.length;
            }
            files++;
            css = css.split(r).join(`./files/${base}`);
        }
        chunks.push(`/* ── ${fam.css} — ${fam.note} ── */\n${css.trim()}`);
        console.log(`${remote.length} file(s)`);
    }

    const header = `/* assets/fonts/fonts.css — GENERATED by scripts/fetch-fonts.mjs. Do not hand-edit.
 *
 * Vendored Google Fonts. The game must not reach fonts.googleapis.com / fonts.gstatic.com at runtime:
 * a rotated CDN file 404s silently under display:swap (Mark's console, 2026-08-11), and every request
 * announces a player to a third party. Regenerate with \`npm run fonts:fetch\`.
 *
 * Enforced by scripts/probe-fonts-local.js (npm run probe:fonts), which boots the real game and fails
 * on ANY request to a Google font host — a grep cannot see a URL built at runtime or pulled from cache.
 */\n\n`;
    await writeFile(path.join(OUT_DIR, 'fonts.css'), header + chunks.join('\n\n') + '\n');

    console.log(`\n  ${files} face file(s) referenced · ${reused} already present · ${(bytes / 1048576).toFixed(1)} MB newly downloaded`);
    console.log(`  → assets/fonts/fonts.css`);
};

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
