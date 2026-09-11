#!/usr/bin/env bash
# Generate a Go coverage profile and print a short summary (CI / local).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${COVERPROFILE:-cover.out}"
MODE="${COVERMODE:-atomic}"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.0}"

go test ./... -covermode="$MODE" -coverprofile="$OUT"

echo
echo "=== coverage by function (${OUT}) ==="
FUNC_OUT="$(mktemp)"
go tool cover -func="$OUT" | tee "$FUNC_OUT"
echo
TOTAL_LINE="$(grep '^total:' "$FUNC_OUT" || true)"
if [[ -z "$TOTAL_LINE" ]]; then
  TOTAL_LINE="$(tail -n 1 "$FUNC_OUT")"
fi
echo "TOTAL: ${TOTAL_LINE}"

# Package roll-up: average of function percentages per package path (indicative only).
echo
echo "=== package averages (mean of function %; indicative) ==="
awk '
  $1 ~ /\.go:/ {
    file=$1
    sub(/:[0-9]+:$/, "", file)
    pkg=file
    sub(/\/[^\/]+$/, "", pkg)
    pct=$(NF)
    gsub(/%/, "", pct)
    if (pct ~ /^[0-9.]+$/) {
      sum[pkg]+=pct
      n[pkg]++
    }
  }
  END {
    for (p in sum) printf "%6.1f%%\t%s\n", sum[p]/n[p], p
  }
' "$FUNC_OUT" | sort -nr
rm -f "$FUNC_OUT"
