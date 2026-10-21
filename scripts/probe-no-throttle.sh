#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ANTI-THROTTLE GUARD (Mark, binding · 2026-06-17)
# FAILS if a forbidden render-throttle pattern reappears in NewOrigami.Engine9.html.
#
# WHY: a rogue seat shipped runtime throttles (B015 adaptive-resolution DPR-shed,
# the AAA/TURBO 60-fps cap) disguised as old "May-31" work and papered over with
# "NOT a throttle" comments. Doctrine (FPS.md / THROTTLE_FORENSICS_AND_REMOVAL):
# de-prioritize by observer, NEVER throttle. Recover fps by cutting simultaneous
# Point/Spot lights + overdraw + observer-culling — never by shedding resolution,
# capping frames below display refresh, or feeding render cost back into scheduling.
#
# It greps ACTIVE CODE only: full-line comments + the DISABLED-FEATURES register
# (which legitimately documents these dead patterns) are stripped first, so this is
# zero-false-positive on a clean tree. Re-tune FORBIDDEN if symbols change.
# Run: bash scripts/probe-no-throttle.sh   (wired into `npm run smoke`)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="Origami.RealityEngine.9.html"

if [ ! -f "$FILE" ]; then echo "❌ throttle guard: $FILE not found"; exit 2; fi

# Patterns that must NEVER return to the live render path (re-armed sabotage):
# Assignment patterns require a trailing ';' (real statements) so prose/register docs that merely
# *mention* "window._targetFps=60" can't trip the guard; call/identifier patterns are doc-filtered below.
# 2026-07-16 additions (Mark: the dual frame driver hid from this guard for months):
#  - ENGINE_TICK / parentRenderLoop: a SECOND frame driver posting ticks into the engine. FPS.md §2
#    bans multi-driver render drive ("the infamous 63↔34 oscillation"). The engine's own driveRAF
#    is the ONLY sanctioned driver. This is why the shell is now scanned too (see SHELL sweep below).
#  - targetFrameTime / elapsed<-gate: CLAUDE.md bans the "targetFrameTime sub-display gate" BY NAME,
#    but the old pattern list only caught a literal `_targetFps = 60;` assignment, so a live
#    `if (elapsed < targetFrameTime * 0.82) return;` sailed through. Both are now patterns.
FORBIDDEN='window\._adaptiveRes *= *true *;|_targetFps *= *(30|45|60|90) *;|_applyPixelRatio\(_curDPR *[-+]|setPixelRatio\([^)]*proj|renderScale *= *[a-z0-9.]|frameSkip|skipFrame|qualityDownshift|adaptiveResLoop|parentRenderLoop|ENGINE_TICK|targetFrameTime *= *[0-9]|elapsed *< *targetFrameTime'

# Strip documentation so the guard only sees executable code:
#  - full-line JS comments (//, *), HTML-comment register bullets (•) and <!-- -->,
#  - any line whose prose marks it as a record of removal/restore, not live code.
HITS=$(grep -nE "$FORBIDDEN" "$FILE" \
  | grep -vE ':[[:space:]]*(//|\*|<!--|/\*|•)' \
  | grep -viE 'removed|remove the|restore|re-enable|re-add|register|banned|forbidden|do not|never|was a|disabled|deleted|rogue|throttle guard|anti-throttle|sabotage|deception' \
  || true)

if [ -n "$HITS" ]; then
  echo "❌ THROTTLE GUARD TRIPPED — forbidden throttle pattern in the render path:"
  echo "$HITS"
  echo ""
  echo "Doctrine: de-prioritize by observer, NEVER throttle."
  echo "See plans/THROTTLE_FORENSICS_AND_REMOVAL_2026-06-13.md and FPS.md."
  exit 1
fi

# ── ONI-BABA / MODULE SWEEP (Mark 2026-07-04 "prevent that crap from happening again") ──
# The auto-quality-downshift hid in js/v8/OniBaba8.js for weeks because this guard only scanned
# Engine9.html: she auto-posted SET_PERF_MODE:'turbo' on sustained low fpsHealth → the engine shed
# PIXEL RATIO off measured render cost = the banned adaptive-res feedback class, resolution-masking
# the true FPS. Scan the JS modules for that class too. Same doc-stripping (comments + removal prose).
MOD_FORBIDDEN='autoDownshift|_autoDownshifted|qualityDownshift|SET_PERF_MODE[^)]*source[^)]*auto|adaptiveRes|_applyPixelRatio\(_curDPR *[-+]|frameSkip|skipFrame'
# LightController.js added 2026-07-27 (LIGHT CTL Phase 0): a new module in the render path MUST be
# scanned — an unscanned js/v8 module is the exact hole the auto-downshift hid in. Its own safety
# header additionally bans fps/renderStress INPUTS; the renderStress pattern below catches the
# render-cost→lighting feedback class if anyone ever wires it.
for MOD in js/v8/OniBaba8.js js/v8/core/Clock.js js/v8/core/Renderer.js js/v8/render/LightController.js; do
  [ -f "$MOD" ] || continue
  MHITS=$(grep -nE "$MOD_FORBIDDEN" "$MOD" \
    | grep -vE ':[[:space:]]*(//|\*|<!--|/\*|•)' \
    | grep -viE 'removed|remove the|restore|re-enable|re-add|register|banned|forbidden|do not|never|was a|disabled|deleted|rogue|throttle guard|anti-throttle|sabotage|deception|removal note' \
    || true)
  if [ -n "$MHITS" ]; then
    echo "❌ THROTTLE GUARD TRIPPED — forbidden auto-quality/adaptive pattern in $MOD:"
    echo "$MHITS"
    echo "Doctrine: the render path is NEVER driven by measured render cost. Manual TURBO only."
    exit 1
  fi
done
# ── SHELL SWEEP (Mark 2026-07-16 — the dual frame driver) ──────────────────────────────────
# This guard has NEVER scanned NewOrigami.9.html. That blind spot let a SECOND frame driver live
# in the shell for months: `parentRenderLoop()` RAF-posted {type:'ENGINE_TICK'} into the engine on
# every parent frame, while the engine ALSO ran its own driveRAF → loop(). Both called loop().
# FPS.md §2: "NEVER add a second driver … command-queue flood → raster stall → the infamous 63↔34
# fps oscillation." Real cost measured 2026-07-16: a 5138ms frame gap (postMessage backlogs under
# congestion, then the whole queue delivers in one task, each running a full render).
# Exactly the OniBaba-autodownshift lesson (2026-07-04) — a guard that scans one file only proves
# that one file is clean. The engine is the ONLY sanctioned frame driver.
SHELL_FILE="OrigamiUnderworld.html"
SHELL_FORBIDDEN='parentRenderLoop|ENGINE_TICK|_adaptiveRes *= *true *;|_targetFps *= *(30|45|60|90) *;|frameSkip|skipFrame|setInterval\([^)]*loop'
if [ -f "$SHELL_FILE" ]; then
  SHITS=$(grep -nE "$SHELL_FORBIDDEN" "$SHELL_FILE" \
    | grep -vE ':[[:space:]]*(//|\*|<!--|/\*|•)' \
    | grep -viE 'removed|remove the|restore|re-enable|re-add|register|banned|forbidden|do not|never|was a|was:|disabled|deleted|rogue|throttle guard|anti-throttle|sabotage|deception|removal note|labelled' \
    || true)
  if [ -n "$SHITS" ]; then
    echo "❌ THROTTLE GUARD TRIPPED — second frame driver / throttle pattern in the SHELL ($SHELL_FILE):"
    echo "$SHITS"
    echo ""
    echo "Doctrine (FPS.md §2): ONE requestAnimationFrame driver, inside the engine. The shell must"
    echo "NEVER drive frames (postMessage ticks queue under load → multi-second stalls)."
    exit 1
  fi
fi

echo "✅ throttle guard clean — no adaptive-res / frame-cap / dual-driver / quality-downshift in $FILE + $SHELL_FILE + modules (OniBaba8, Clock, Renderer, LightController)"
