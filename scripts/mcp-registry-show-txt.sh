#!/usr/bin/env bash
# Show DNS TXT for MCP Registry + verify key.pem matches what's live on foodnear.me
#
# Usage:
#   ./scripts/mcp-registry-show-txt.sh [path-to-key.pem]

set -euo pipefail

DOMAIN="${MCP_REGISTRY_DOMAIN:-foodnear.me}"
KEY="${1:-$(cd "$(dirname "$0")/.." && pwd)/key.pem}"

echo "=== Live DNS (apex ${DOMAIN}) ==="
dig +short TXT "$DOMAIN" | grep -i MCPv1 || echo "(no v=MCPv1 record found)"

echo ""
echo "=== From key.pem (if present) ==="
if [[ ! -f "$KEY" ]]; then
  echo "key not found: $KEY"
  exit 0
fi

pub="$(openssl pkey -in "$KEY" -pubout -outform DER | tail -c 32 | base64)"
echo "${DOMAIN}. IN TXT \"v=MCPv1; k=ed25519; p=${pub}\""
echo ""
echo "Login command:"
echo "  mcp-publisher login dns --domain ${DOMAIN} --private-key \"\$(./scripts/mcp-registry-key-hex.sh)\""
