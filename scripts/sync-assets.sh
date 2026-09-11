#!/usr/bin/env bash
# Sync editable frontend sources into the go:embed package (single embed FS).
# SSoT: repo-root viewer.html, manage.html, report-assets/
# Embed: internal/report/{viewer.html,manage.html,report-assets/}
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/internal/report"
cp -a "$ROOT/viewer.html" "$DEST/viewer.html"
cp -a "$ROOT/manage.html" "$DEST/manage.html"
rm -rf "$DEST/report-assets"
mkdir -p "$DEST/report-assets"
cp -a "$ROOT/report-assets/." "$DEST/report-assets/"
echo "synced assets → internal/report/"
