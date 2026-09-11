#!/usr/bin/env bash
# Desktop pack smoke: build CLI → electron-builder --dir → verify layout.
# Always unsigned: CI/Release do not inject CSC_* secrets yet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP="$ROOT/desktop"
DIST="$DESKTOP/dist"

# Match Release workflow: never auto-discover local codesign identities.
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"
export WIN_CSC_LINK="${WIN_CSC_LINK:-}"

echo "==> build studio-reporter CLI"
make -C "$ROOT" build

echo "==> install desktop deps (if needed)"
if [[ ! -d "$DESKTOP/node_modules/electron-builder" ]]; then
  (cd "$DESKTOP" && npm ci)
fi

echo "==> pack:check prerequisites"
(cd "$DESKTOP" && npm run pack:check)

echo "==> electron-builder --dir (signing=unsigned)"
(cd "$DESKTOP" && npx electron-builder --dir --publish never)

echo "==> verify unpacked layout"
node "$DESKTOP/scripts/run-verify-pack-dist.js" "$DIST"

echo "Desktop pack smoke OK (signing=unsigned)"
