#!/usr/bin/env node
/*
 * bake-logic-repository.js — LR-1. The seed tree is the source; this is the ONLY writer of
 * knowledge/dictionary/logic-repository.json (+ .sha256).
 *
 * Golden cube #3, after the comment dictionary (2026-09-01) and the language cube (C2, 2026-09-03):
 * intelligence is spent at BAKE time, the runtime does a lookup, and an update means a re-bake.
 * Plan: knowledge/design/LOGIC_REPOSITORY_PLAN_2026-09-03.md (Mark's GO, 2026-09-03).
 *
 * WHY A VALIDATOR AND NOT JUST A CONCATENATOR. The plan calls this "the lesson of the table-of-14":
 * a hand-maintained index becomes the next stale doc the moment the tree moves. So every refusal
 * class below exists because an unrefused version of it has already cost this repo real time, and
 * scripts/selftest-logic-repository.js proves each one actually refuses (red-first) rather than
 * being decorative.
 *
 * THE BAKE IS DETERMINISTIC BY CONSTRUCTION: entries sort by id, keys emit in a fixed order, and
 * NOTHING carries a timestamp or a host path. Two bakes of one tree are byte-identical, which is
 * what makes the .sha256 sidecar meaningful — C2 shipped a stale hash precisely because a number
 * was quoted from before its inputs changed.
 *
 *   node scripts/bake-logic-repository.js            # bake, or refuse and exit 2
 *   node scripts/bake-logic-repository.js --check    # validate + compare, write nothing (CI shape)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'knowledge', 'logic');
const OUT = path.join(ROOT, 'knowledge', 'dictionary', 'logic-repository.json');
const OUT_SHA = OUT + '.sha256';

const PLANES = new Set(['seat', 'runtime']);
const KEY_ORDER = ['id', 'plane', 'law', 'why', 'refs', 'authority', 'status'];

/* ── JSONC → JSON. String-aware: a `//` inside a quoted law text is CONTENT, not a comment. A naive
 *    regex strip mangles exactly the entries most worth having (paths, URLs, `_suc*` prefixes). */
function stripJsonc(src) {
    let out = '', i = 0, inStr = false, esc = false;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (inStr) {
            out += c;
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            i++; continue;
        }
        if (c === '"') { inStr = true; out += c; i++; continue; }
        if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        out += c; i++;
    }
    // trailing commas are legal in the seed tree and illegal in JSON
    return out.replace(/,(\s*[}\]])/g, '$1');
}

/* ── Heading anchors. A ref may name `path#anchor`; the anchor resolves against the doc's own
 *    headings, accepting EITHER the GitHub-style slug OR the leading section token, because the
 *    plan's own example (`…CARETAKING_LESSONS_2026-09-03.md#B`) uses the token form. */
function anchorsOf(absPath) {
    const anchors = new Set();
    let text;
    try { text = fs.readFileSync(absPath, 'utf8'); } catch (_) { return null; }
    for (const line of text.split('\n')) {
        const m = /^#{1,6}\s+(.*)$/.exec(line);
        if (!m) continue;
        const title = m[1].trim();
        anchors.add(title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-'));
        // RULES.md separates its section token with `·` ("## 1 · MARK'S STANDING LAWS"), the
        // caretaking doc with "." ("## B. INSTRUMENTS"), and R-000 carries a hyphen inside the
        // token itself. One regex, all three — the alternative is refs that resolve in one doc
        // and mysteriously fail in the next.
        const tok = /^([A-Za-z0-9][\w.-]*?)\s*(?:[.):]|·)/.exec(title);
        if (tok) anchors.add(tok[1]);
    }
    return anchors;
}

const SHA_RE = /^[0-9a-f]{7,40}$/;

function validate(entries, opts = {}) {
    const problems = [];
    const seen = new Map();
    const ids = new Set(entries.map(e => e && e.id).filter(Boolean));
    const seatOnly = opts.seatOnlyDocs || new Set();
    const push = (code, id, detail) => problems.push({ code, id: id || '(no id)', detail });

    for (const e of entries) {
        if (!e || typeof e !== 'object') { push('MALFORMED', null, 'entry is not an object'); continue; }
        if (!e.id || typeof e.id !== 'string') { push('MISSING_ID', e.id, 'id is required'); continue; }
        if (seen.has(e.id)) push('DUPLICATE_ID', e.id, 'already defined in ' + seen.get(e.id));
        else seen.set(e.id, e._file || '(inline)');

        if (!PLANES.has(e.plane)) push('BAD_PLANE', e.id, 'plane must be seat|runtime, got ' + JSON.stringify(e.plane));
        for (const f of ['law', 'why', 'authority', 'status']) {
            if (!e[f] || typeof e[f] !== 'string' || !e[f].trim()) push('MISSING_FIELD', e.id, f + ' is required');
        }

        // AUTHORITY MUST CARRY A DATE. An undated quote cannot be aged, so it silently becomes
        // permanent law — the exact mechanism CLAUDE.md's supersession mandate exists to stop.
        if (typeof e.authority === 'string' && !/\b20\d{2}-\d{2}-\d{2}\b/.test(e.authority)) {
            push('UNDATED_AUTHORITY', e.id, 'authority has no YYYY-MM-DD: ' + JSON.stringify(e.authority));
        }

        // A SUPERSESSION MUST NAME ITS SUCCESSOR, and the successor must exist in this bake.
        if (typeof e.status === 'string' && e.status.startsWith('superseded')) {
            const succ = e.status.split(':')[1];
            if (!succ || !succ.trim()) push('SUPERSEDED_WITHOUT_SUCCESSOR', e.id, 'status is ' + JSON.stringify(e.status));
            else if (!ids.has(succ.trim())) push('SUPERSEDED_UNKNOWN_SUCCESSOR', e.id, 'no entry with id ' + succ.trim());
        } else if (e.status && e.status !== 'live') {
            push('BAD_STATUS', e.id, 'status must be live|superseded:<id>, got ' + JSON.stringify(e.status));
        }

        if (!Array.isArray(e.refs) || e.refs.length === 0) { push('MISSING_FIELD', e.id, 'refs must be a non-empty array'); continue; }
        for (const ref of e.refs) {
            if (typeof ref !== 'string' || !ref.trim()) { push('BAD_REF', e.id, 'ref is not a string'); continue; }
            if (SHA_RE.test(ref)) continue;                       // commit shas are refs too
            const [rel, anchor] = ref.split('#');
            const abs = path.join(ROOT, rel);
            if (!fs.existsSync(abs)) { push('UNRESOLVABLE_REF', e.id, 'no such file: ' + rel); continue; }
            if (anchor) {
                const anchors = anchorsOf(abs);
                if (anchors && !anchors.has(anchor) && !anchors.has(anchor.toLowerCase())) {
                    push('UNRESOLVABLE_ANCHOR', e.id, rel + ' has no heading anchor #' + anchor);
                }
            }
            // A RUNTIME LAW MAY NOT REST ON A SEAT-ONLY DOC. Oni-Baba consumes the runtime plane;
            // pointing her at development doctrine would make a seat rule into a game rule.
            if (e.plane === 'runtime' && seatOnly.has(rel)) {
                push('RUNTIME_CITES_SEAT_DOC', e.id, rel + ' is declared seat-only');
            }
        }
    }
    return problems;
}

function loadSeeds() {
    if (!fs.existsSync(SEED_DIR)) return { entries: [], seatOnlyDocs: new Set(), files: [] };
    const files = fs.readdirSync(SEED_DIR).filter(f => /\.jsonc?$/.test(f)).sort();
    const entries = [];
    const seatOnlyDocs = new Set();
    for (const f of files) {
        const raw = fs.readFileSync(path.join(SEED_DIR, f), 'utf8');
        let doc;
        try { doc = JSON.parse(stripJsonc(raw)); }
        catch (err) { throw new Error('seed ' + f + ' is not parseable after comment strip: ' + err.message); }
        for (const d of doc.seatOnlyDocs || []) seatOnlyDocs.add(d);
        for (const e of doc.entries || []) entries.push(Object.assign({ _file: f }, e));
    }
    return { entries, seatOnlyDocs, files };
}

function emit(entries) {
    const sorted = entries.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const clean = sorted.map(e => {
        const o = {};
        for (const k of KEY_ORDER) if (e[k] !== undefined) o[k] = e[k];
        return o;
    });
    const byPlane = {};
    for (const e of clean) byPlane[e.plane] = (byPlane[e.plane] || 0) + 1;
    // NO TIMESTAMP, NO HOST PATH — determinism is what makes the sidecar hash mean anything.
    return JSON.stringify({ schema: 'logic-repository/1', counts: { total: clean.length, byPlane }, entries: clean }, null, 1) + '\n';
}

function main() {
    const check = process.argv.includes('--check');
    let seeds;
    try { seeds = loadSeeds(); }
    catch (err) { console.error('⛔ REFUSED: ' + err.message); process.exit(2); }

    if (!seeds.entries.length) { console.error('⛔ REFUSED: no entries in ' + path.relative(ROOT, SEED_DIR)); process.exit(2); }

    const problems = validate(seeds.entries, { seatOnlyDocs: seeds.seatOnlyDocs });
    if (problems.length) {
        console.error('⛔ REFUSED — ' + problems.length + ' problem(s). NOTHING was written.\n');
        for (const p of problems) console.error('  [' + p.code + '] ' + p.id + ' — ' + p.detail);
        process.exit(2);
    }

    const json = emit(seeds.entries);
    const sha = crypto.createHash('sha256').update(json).digest('hex');
    const counts = JSON.parse(json).counts;

    if (check) {
        const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
        const same = prev === json;
        console.log('logic repository — VALID. ' + counts.total + ' entries ' + JSON.stringify(counts.byPlane));
        console.log('  on disk: ' + (prev === null ? 'ABSENT' : same ? 'up to date' : 'STALE — re-run without --check'));
        process.exit(same || prev === null ? 0 : 2);
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, json);
    fs.writeFileSync(OUT_SHA, sha + '  ' + path.basename(OUT) + '\n');
    console.log('BAKED ' + path.relative(ROOT, OUT));
    console.log('  entries : ' + counts.total + '  ' + JSON.stringify(counts.byPlane));
    console.log('  seeds   : ' + seeds.files.join(', '));
    console.log('  sha256  : ' + sha);
}

if (require.main === module) main();
module.exports = { stripJsonc, validate, emit, anchorsOf, loadSeeds };
