#!/usr/bin/env node
/*
 * selftest-logic-repository.js — LR-1's red-first proof.
 *
 * A validator nobody has watched REFUSE is a validator you are trusting on its own word. Every
 * refusal class below is fed an entry that violates exactly that class and must come back with that
 * exact code — and the whole suite is bracketed by CONTROLS that must stay GREEN, because a
 * validator that refuses everything would pass a refusal-only suite perfectly.
 *
 * Controls (the non-vacuity teeth):
 *   · a VALID entry yields ZERO problems — otherwise every red below is meaningless
 *   · the live seed tree bakes clean — the rules are compatible with the content we actually ship
 *   · emit() twice is byte-identical — the .sha256 sidecar only means something if the bake is
 *     deterministic (C2 shipped a stale hash for want of exactly this)
 *   · a `//` inside a quoted string SURVIVES the JSONC strip — a naive regex strip mangles the
 *     entries most worth having (paths, prefixes, URLs)
 *
 *   node scripts/selftest-logic-repository.js
 */
const { stripJsonc, validate, emit, loadSeeds } = require('./bake-logic-repository.js');

const CARETAKING = 'knowledge/design/CARETAKING_LESSONS_2026-09-03.md';
const SEAT_ONLY = new Set([CARETAKING]);

const valid = () => ({
    id: 'ctl-valid', plane: 'seat',
    law: 'A control entry that must always pass.',
    why: 'If this ever fails, every refusal below is noise.',
    refs: [CARETAKING + '#B'], authority: 'measured 2026-09-03', status: 'live',
});

let pass = 0, fail = 0;
const codesOf = (entries) => validate(entries, { seatOnlyDocs: SEAT_ONLY }).map(p => p.code);

function refuses(name, mutate, expected) {
    const e = Object.assign(valid(), { id: 'red-' + name });
    const entries = Array.isArray(mutate) ? mutate : [mutate(e) || e];
    const codes = codesOf(entries);
    const ok = codes.includes(expected);
    console.log('  ' + (ok ? '✓ REFUSED' : '⛔ ACCEPTED') + '  ' + name.padEnd(30)
        + (ok ? expected : 'expected ' + expected + ', got [' + codes.join(', ') + ']'));
    ok ? pass++ : fail++;
}

function green(name, fn) {
    let ok = false, detail = '';
    try { const r = fn(); ok = r === true; if (r !== true) detail = String(r); }
    catch (err) { detail = err.message; }
    console.log('  ' + (ok ? '✓ GREEN  ' : '⛔ BROKE  ') + '  ' + name.padEnd(30) + detail);
    ok ? pass++ : fail++;
}

console.log('\nCONTROLS — these must stay green, or the refusals below prove nothing:');
green('a valid entry passes', () => {
    const codes = codesOf([valid()]);
    return codes.length === 0 ? true : 'valid entry was refused: ' + codes.join(', ');
});
green('the live seed tree is valid', () => {
    const s = loadSeeds();
    const problems = validate(s.entries, { seatOnlyDocs: s.seatOnlyDocs });
    return problems.length === 0 ? true : problems.map(p => p.code + '/' + p.id).join(', ');
});
green('the bake is deterministic', () => {
    const s = loadSeeds();
    return emit(s.entries) === emit(s.entries) ? true : 'two bakes of one tree differ';
});
green('// inside a string survives', () => {
    const out = stripJsonc('{"law":"read js/v8//path // not a comment","x":1 /* real */}');
    const o = JSON.parse(out);
    return o.law === 'read js/v8//path // not a comment' ? true : 'strip mangled it: ' + o.law;
});
green('trailing commas are tolerated', () => {
    const o = JSON.parse(stripJsonc('{"entries":[1,2,],}'));
    return o.entries.length === 2 ? true : 'got ' + JSON.stringify(o);
});

console.log('\nREFUSALS — each class fed exactly one violation:');
refuses('unresolvable ref', e => { e.refs = ['knowledge/design/NO_SUCH_DOC.md']; }, 'UNRESOLVABLE_REF');
refuses('unresolvable anchor', e => { e.refs = [CARETAKING + '#ZZ']; }, 'UNRESOLVABLE_ANCHOR');
refuses('undated authority', e => { e.authority = 'Mark'; }, 'UNDATED_AUTHORITY');
refuses('bad plane', e => { e.plane = 'gameplay'; }, 'BAD_PLANE');
refuses('missing law', e => { delete e.law; }, 'MISSING_FIELD');
refuses('empty refs', e => { e.refs = []; }, 'MISSING_FIELD');
refuses('bad status', e => { e.status = 'draft'; }, 'BAD_STATUS');
refuses('superseded, no successor', e => { e.status = 'superseded'; }, 'SUPERSEDED_WITHOUT_SUCCESSOR');
refuses('superseded, unknown id', e => { e.status = 'superseded:ghost-entry'; }, 'SUPERSEDED_UNKNOWN_SUCCESSOR');
refuses('duplicate id', [valid(), valid()], 'DUPLICATE_ID');
refuses('runtime cites a seat doc',
    e => { e.plane = 'runtime'; e.refs = [CARETAKING + '#B']; }, 'RUNTIME_CITES_SEAT_DOC');

// The mirror of the class above: the SAME citation is legal on the seat plane. Without this, the
// rule could be "runtime entries are always refused" and the red above would still look right.
green('seat plane MAY cite a seat doc', () => {
    const e = valid(); e.refs = [CARETAKING + '#B'];
    const codes = codesOf([e]);
    return codes.length === 0 ? true : 'refused: ' + codes.join(', ');
});
// And a runtime entry citing a NON-seat doc must be accepted, or the class is over-broad.
green('runtime MAY cite a non-seat doc', () => {
    const e = valid(); e.plane = 'runtime'; e.refs = ['RULES.md#1'];
    const codes = codesOf([e]);
    return codes.length === 0 ? true : 'refused: ' + codes.join(', ');
});
// A superseded entry whose successor EXISTS must be accepted.
green('superseded with a real successor', () => {
    const a = valid(), b = Object.assign(valid(), { id: 'ctl-successor' });
    a.status = 'superseded:ctl-successor';
    const codes = codesOf([a, b]);
    return codes.length === 0 ? true : 'refused: ' + codes.join(', ');
});

console.log('\n  ' + pass + ' passed · ' + fail + ' failed');
console.log('  ' + (fail === 0 ? 'PASS' : 'FAIL'));
process.exit(fail === 0 ? 0 : 2);
