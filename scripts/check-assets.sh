#!/usr/bin/env bash
# Fail if embed copies drifted from repo-root sources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/internal/report"
fail=0
for f in viewer.html manage.html; do
  if ! cmp -s "$ROOT/$f" "$DEST/$f"; then
    echo "DRIFT: $f differs from internal/report/$f (run: make sync-assets)" >&2
    fail=1
  fi
done
if ! diff -qr "$ROOT/report-assets" "$DEST/report-assets" >/dev/null; then
  echo "DRIFT: report-assets/ differs from internal/report/report-assets/ (run: make sync-assets)" >&2
  diff -qr "$ROOT/report-assets" "$DEST/report-assets" >&2 || true
  fail=1
fi
if [[ -e "$ROOT/report.html" || -e "$DEST/report.html" ]]; then
  echo "STALE: report.html is obsolete; use viewer.html" >&2
  fail=1
fi
if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "assets in sync"
