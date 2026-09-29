#!/usr/bin/env bash
# Re-vendor engine.py from upstream (cwi-learn, trust/).
# NEVER hand-edit app/vendor/engine.py: it is spec-versioned. This script
# fetches the canonical bytes and refuses to write them unless the sha256
# matches the pinned value in VENDOR_PROVENANCE.md.
set -euo pipefail

PINNED="516ae49cf00cc0aae44bcf08ecf5e617442772d2cccdf7c09fa1d117802f3439"
OUT="$(dirname "$0")/../app/vendor/engine.py"
URLS=(
  "https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/verdict-engine/trust/engine.py"
  "https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/main/trust/engine.py"
)

tmp="$(mktemp)"
for url in "${URLS[@]}"; do
  if curl -sSL --max-time 30 "$url" -o "$tmp" && [ -s "$tmp" ]; then
    echo "fetched: $url"
    break
  fi
done

got="$(sha256sum "$tmp" | cut -d' ' -f1)"
if [ "$got" != "$PINNED" ]; then
  echo "REFUSED: upstream sha256 $got != pinned $PINNED" >&2
  echo "Upstream changed -> this is a spec event, not a vendor refresh." >&2
  echo "Do NOT overwrite: open a spec-bump review instead (spec §11)." >&2
  rm -f "$tmp"
  exit 1
fi

cp "$tmp" "$OUT"
rm -f "$tmp"
echo "vendored OK: $OUT (sha256 $got)"
