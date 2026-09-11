#!/usr/bin/env bash
# manage/serve fail-digest sidecar + deep-link 联调抽检（含 Chrome dump-dom）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"
go test . -count=1 -run 'TestManageServeFailDigestDeepLinkSmoke' -v
echo "smoke-manage-digest: ok"
