#!/usr/bin/env bash
# Structural smoke for the complex-gauge synthetic suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"
go test ./internal/complexsuite/ -count=1 -v
echo "smoke-complex: ok"
