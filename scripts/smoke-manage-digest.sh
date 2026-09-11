#!/usr/bin/env bash
# manage/serve fail-digest sidecar + path-style focus deep-link smoke (Chrome dump-dom).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"
go test . -count=1 -run 'TestManageServe(FailDigest|PathStyleFocus)DeepLinkSmoke' -v
echo "smoke-manage-digest: ok"
