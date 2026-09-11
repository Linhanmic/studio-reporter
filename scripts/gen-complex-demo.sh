#!/usr/bin/env bash
# Generate complex-gauge HTML hub under .demo/complex-hub (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-.demo/complex-hub}"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"
go run ./internal/complexsuite/cmd/gendemo -out "$OUT"
echo "smoke-complex: hub ready at $OUT"
