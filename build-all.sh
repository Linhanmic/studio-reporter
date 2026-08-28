#!/bin/bash

# Cross-platform Gauge plugin packages.
# Usage: ./build-all.sh [version]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

VERSION=${1:-}

echo "Building studio-reporter for all platforms..."
mkdir -p dist

targets=(
  "linux amd64"
  "linux arm64"
  "darwin amd64"
  "darwin arm64"
  "windows amd64"
  "windows arm64"
)

for target in "${targets[@]}"; do
  # shellcheck disable=SC2086
  set -- $target
  if [ -n "$VERSION" ]; then
    "$ROOT/build.sh" "$1" "$2" "$VERSION"
  else
    "$ROOT/build.sh" "$1" "$2"
  fi
done

echo
echo "All builds complete!"
echo
echo "Distribution packages:"
ls -la dist/
