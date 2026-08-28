#!/bin/bash

# Build a Gauge-installable zip for one platform.
# Usage: ./build.sh [platform] [arch] [version]
# Zip layout (required by Gauge):
#   plugin.json
#   bin/studio-reporter[.exe]
# Zip name uses Gauge arch names: x86_64 (amd64) or arm64.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

read_version() {
  python3 - <<'PY'
import json
print(json.load(open("plugin.json"))["version"])
PY
}

gauge_arch() {
  case "$1" in
    amd64) echo x86_64 ;;
    386) echo x86 ;;
    *) echo "$1" ;;
  esac
}

PLATFORM=${1:-$(go env GOOS)}
GOARCH=${2:-$(go env GOARCH)}
VERSION=${3:-$(read_version)}
ARCH_LABEL="$(gauge_arch "$GOARCH")"

BIN_NAME="studio-reporter"
if [ "$PLATFORM" = "windows" ]; then
  BIN_NAME="studio-reporter.exe"
fi

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$STAGE/bin" dist

echo "Building studio-reporter ${VERSION} for ${PLATFORM}/${GOARCH} (${ARCH_LABEL})..."
CGO_ENABLED=0 GOOS="$PLATFORM" GOARCH="$GOARCH" go build -trimpath -ldflags="-s -w" -o "$STAGE/bin/${BIN_NAME}" .
cp plugin.json "$STAGE/"

ZIP_NAME="studio-reporter-${VERSION}-${PLATFORM}.${ARCH_LABEL}.zip"
(
  cd "$STAGE"
  zip -r "${ROOT}/dist/${ZIP_NAME}" plugin.json "bin/${BIN_NAME}"
)

echo "Build complete: dist/${ZIP_NAME}"
