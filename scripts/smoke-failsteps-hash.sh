#!/usr/bin/env bash
# Headless Chrome smoke: failSteps hash aliases enable fail-steps-mode.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"
go test ./internal/report/ -count=1 -run 'TestFailStepsHashAliasesActivateMode' -v
echo "smoke-failsteps-hash: ok"
