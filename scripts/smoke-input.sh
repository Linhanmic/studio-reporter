#!/usr/bin/env bash
# End-to-end --input regeneration smoke using a temp screenshot + built binary.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"

go test -count=1 -run 'TestInputRegenSmokeCopiesScreenshots|TestStaticPrintCSSRespectsFilterHidden' .
echo "smoke-input: ok"
