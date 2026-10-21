/**
 * gate-register-selftest.js — AI 2, 2026-09-04.
 *
 * PROVES gate-register.js TRIPS. A gate nobody has watched fail is not evidence; this repo has
 * already shipped a "guard" that was structurally incapable of firing, and the cost was weeks.
 *
 * Each arm builds a SYNTHETIC tree in a temp dir (a fake register + a fake haystack) and points
 * the real gate at it via GATE_REGISTER_ROOT. Nothing here touches the live tree, so it is safe to
 * run while other seats are editing.
 *
 * THE FOUR ARMS — the middle two are the ones that matter, because they are opposite directions
 * and the first version of this gate could only see one of them:
 *   1. present + symbol there   → PASS   (control: the gate can say yes)
 *   2. present + symbol gone    → FAIL   (classic stale entry)
 *   3. absent  + symbol gone    → PASS   (a REMOVAL entry; the old gate called this stale — the bug)
 *   4. absent  + symbol back    → FAIL   (unregistered resurrection; the old gate was blind to it)
 * Plus: --advisory must exit 0 on arm 2's tree while still printing the failure.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GATE = path.join(__dirname, 'gate-register.js');

// straddle: pad the entry so MECHANISM lands on the body window's LAST line (offset 15) and its
// EXPECT falls on offset 16 — outside. The gate must still honour it AND say the placement is wrong.
function build(expect, symbolPresent, straddle) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatereg-'));
  // The gate skips the first 5000 lines of the Engine file when searching, so an entry cannot
  // vouch for its own mechanism. The synthetic register therefore needs that much padding before
  // the haystack copy, or the control arm would "find" the symbol inside the entry itself.
  const pad = Array(5200).fill('  padding').join('\n');
  const filler = straddle ? Array(14).fill('     WHAT:  filler line.') : ['     WHAT:  a fake entry that exists only inside this selftest.'];
  const entry = ['  🚫 SELFTEST FEATURE — REMOVED 2026-09-04 (AI 2, selftest)']
    .concat(filler)
    .concat(['     MECHANISM: _selftestOnlySymbol', '     EXPECT: ' + expect, ''])
    .join('\n');
  fs.writeFileSync(path.join(dir, 'Origami.RealityEngine.9.html'), entry + '\n' + pad + '\n');
  fs.writeFileSync(path.join(dir, 'Origami.RealityEngine.Panels.html'),
    symbolPresent ? 'const x = _selftestOnlySymbol;\n' : 'const x = 1;\n');
  fs.writeFileSync(path.join(dir, 'OrigamiUnderworld.html'), '');
  fs.mkdirSync(path.join(dir, 'js'));
  return dir;
}

function run(dir, args) {
  try {
    const out = execFileSync('node', [GATE].concat(args || []),
      { env: Object.assign({}, process.env, { GATE_REGISTER_ROOT: dir }), encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: String(e.stdout || '') };
  }
}

const arms = [
  ['1. EXPECT present · symbol PRESENT → PASS', 'present', true,  0, '✓ PASS'],
  ['2. EXPECT present · symbol GONE    → FAIL', 'present', false, 1, 'REGISTER IS STALE'],
  ['3. EXPECT absent  · symbol GONE    → PASS', 'absent',  false, 0, '✓ PASS'],
  ['4. EXPECT absent  · symbol BACK    → FAIL', 'absent',  true,  1, 'UNREGISTERED RESURRECTION'],
];

let bad = 0;
console.log('GATE-REGISTER SELFTEST — proving the gate trips, both directions\n');
for (const [name, expect, sym, wantCode, wantText] of arms) {
  const dir = build(expect, sym, false);
  const r = run(dir, []);
  const ok = r.code === wantCode && r.out.includes(wantText);
  if (!ok) bad++;
  console.log(`${ok ? 'PASS  ' : 'FAIL  '}${name}   [exit ${r.code}, wanted ${wantCode}` +
    (r.out.includes(wantText) ? '' : `; missing "${wantText}"`) + ']');
  fs.rmSync(dir, { recursive: true, force: true });
}

// --advisory must NOT change what is detected, only whether the build dies.
const dir = build('present', false, false);
const adv = run(dir, ['--advisory']);
const advOk = adv.code === 0 && adv.out.includes('REGISTER IS STALE') && adv.out.includes('--advisory: the build was NOT failed');
if (!advOk) bad++;
console.log(`${advOk ? 'PASS  ' : 'FAIL  '}5. --advisory on a failing tree → exit 0, failure STILL printed   [exit ${adv.code}]`);
fs.rmSync(dir, { recursive: true, force: true });

// Arm 6: the straddle. EXPECT: absent on the far side of the window, symbol correctly gone.
// Without straddle handling the gate would default to 'present' and report a FALSE stale entry —
// the exact silent misconfiguration measured 2026-09-04.
const sdir = build('absent', false, true);
const sr = run(sdir, []);
const sOk = sr.code === 0 && sr.out.includes('PLACEMENT') && sr.out.includes('✓ PASS');
if (!sOk) bad++;
console.log(`${sOk ? 'PASS  ' : 'FAIL  '}6. EXPECT outside the 16-line window → honoured AND flagged   [exit ${sr.code}]`);
fs.rmSync(sdir, { recursive: true, force: true });

console.log(bad ? `\n✗ SELFTEST FAILED (${bad})` : '\n✓ SELFTEST PASSED — the gate fails when it should, passes when it should, and --advisory hides nothing but the exit code');
process.exit(bad ? 1 : 0);
