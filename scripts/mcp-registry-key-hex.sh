#!/usr/bin/env bash
# Print Ed25519 private key as hex for: mcp-publisher login dns --private-key "$(./scripts/mcp-registry-key-hex.sh)"
#
# Usage:
#   ./scripts/mcp-registry-key-hex.sh [path-to-key.pem]
# Default key path: ./key.pem in repo root

set -euo pipefail

KEY="${1:-$(cd "$(dirname "$0")/.." && pwd)/key.pem}"

if [[ ! -f "$KEY" ]]; then
  echo "error: key file not found: $KEY" >&2
  echo "Generate one with:" >&2
  echo "  openssl genpkey -algorithm Ed25519 -out key.pem && chmod 600 key.pem" >&2
  exit 1
fi

# macOS openssl prints priv: across 3 lines — take all hex lines until pub:
hex="$(
  openssl pkey -in "$KEY" -noout -text \
    | sed -n '/^priv:/,/^pub:/p' \
    | grep -E '^[[:space:]]+[0-9a-f]' \
    | tr -d ' :\n'
)"

if [[ "${#hex}" -ne 64 ]]; then
  echo "error: expected 64 hex chars (32-byte Ed25519 key), got ${#hex}" >&2
  echo "hint: do not use the awk one-liner from older docs — it drops the last line on macOS" >&2
  exit 1
fi

echo "$hex"
