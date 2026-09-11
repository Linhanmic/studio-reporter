#!/usr/bin/env bash
# Desktop pack smoke: build CLI → electron-builder --dir → verify layout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP="$ROOT/desktop"
DIST="$DESKTOP/dist"

echo "==> build studio-reporter CLI"
make -C "$ROOT" build

echo "==> install desktop deps (if needed)"
if [[ ! -d "$DESKTOP/node_modules/electron-builder" ]]; then
  (cd "$DESKTOP" && npm ci)
fi

echo "==> pack:check prerequisites"
(cd "$DESKTOP" && npm run pack:check)

echo "==> electron-builder --dir"
(cd "$DESKTOP" && npx electron-builder --dir --publish never)

echo "==> verify unpacked layout"
node "$DESKTOP/scripts/run-verify-pack-dist.js" "$DIST"

echo "Desktop pack smoke OK"
