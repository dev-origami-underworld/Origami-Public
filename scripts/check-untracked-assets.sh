#!/usr/bin/env bash
# check-untracked-assets.sh — catch committed source that points at assets git does not have.
#
# WHY THIS EXISTS (2026-08-15): two lanes shipped this bug on the same day, independently.
#   · js/v8/data/SongCatalog.js:698-731 referenced four Starlette-* song files (committed in b8ef405)
#     that were never `git add`ed.
#   · NewOrigami.Engine9.html:16340 loaded assets/models/rooms/Cafeteria.glb, likewise untracked.
# Both worked perfectly for the author — the files were sitting in their working tree. Both were broken
# for a fresh clone AND for the public cut, and NEITHER shows up in a diff review, because the diff only
# ever shows the reference, never the absence. That is the RELEASE_PLAYBOOK failure class: the dev tree
# passes and the distribution does not.
#
# THE SIGNAL IS "ON DISK BUT UNTRACKED". A referenced path that does not exist on disk either is a dead
# reference, a runtime fallback, or a substring artifact of this script's own regex — a different, much
# noisier problem — so those are reported separately and do NOT fail the gate.
#
# Exit 1 if any referenced asset exists locally but is untracked.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

TRACKED="$(mktemp)"; REFS="$(mktemp)"
trap 'rm -f "$TRACKED" "$REFS"' EXIT

git ls-files > "$TRACKED"

# Search live source only: scratch/ is probe workbench, Backups/ is historical, dist/ is generated output.
git ls-files '*.js' '*.html' '*.mjs' '*.json' \
  | grep -v '^scratch/' | grep -v '^Backups/' | grep -v '^DISTRIBUTION/dist/' \
  | xargs grep -ohE "\.?/?assets/[A-Za-z0-9_./%-]+\.(glb|gltf|png|jpg|jpeg|webp|mp3|ogg|wav|srt|json|svg|ttf|woff2?)" 2>/dev/null \
  | sed -e 's|^\./||' -e 's|^/||' | sort -u > "$REFS"

missing=0; dead=0
while IFS= read -r p; do
  grep -qxF "$p" "$TRACKED" && continue
  if [ -f "$p" ]; then
    echo "UNTRACKED: $p  (referenced by committed source, present in this working tree only)"
    missing=$((missing + 1))
  else
    dead=$((dead + 1))
  fi
done < "$REFS"

echo "[assets] $(wc -l < "$REFS" | tr -d ' ') referenced paths · $missing untracked-but-present · $dead not-on-disk (not checked here)"

if [ "$missing" -gt 0 ]; then
  echo "[assets] FAIL — a fresh clone and the public cut would 404 on the paths above. git add them."
  exit 1
fi
echo "[assets] PASS"
