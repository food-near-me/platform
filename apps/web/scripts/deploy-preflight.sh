#!/usr/bin/env bash
# Preflight: confirm production serves AI discovery artifacts before DNS/registry.
# Usage: ./scripts/deploy-preflight.sh [base_url]
# Default base_url: https://foodnear.me

set -euo pipefail

BASE="${1:-https://foodnear.me}"
BASE="${BASE%/}"

paths=(
  "/llms.txt"
  "/llms-full.txt"
  "/robots.txt"
  "/SKILL.md"
  "/openapi.json"
  "/.well-known/agentroot.json"
  "/.well-known/mcp-server.json"
  "/.well-known/ai-plugin.json"
  "/.well-known/gemini-extension.json"
  "/.well-known/services.json"
  "/.well-known/agent.json"
)

echo "Deploy preflight for ${BASE}"
echo "================================"

fail=0

check_get() {
  local path="$1"
  local url="${BASE}${path}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "OK  ${code}  GET ${path}"
  else
    echo "FAIL ${code}  GET ${path}"
    fail=$((fail + 1))
  fi
}

for p in "${paths[@]}"; do
  check_get "$p"
done

echo ""
echo "MCP transport probes"
echo "--------------------"

mcp_get_code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/mcp" || echo "000")
if [[ "$mcp_get_code" == "200" ]]; then
  echo "OK  ${mcp_get_code}  GET /mcp (discovery)"
else
  echo "FAIL ${mcp_get_code}  GET /mcp (discovery)"
  fail=$((fail + 1))
fi

mcp_post_code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "${BASE}/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' \
  || echo "000")

if [[ "$mcp_post_code" == "200" ]]; then
  echo "OK  ${mcp_post_code}  POST /mcp (tools/list)"
else
  echo "FAIL ${mcp_post_code}  POST /mcp (tools/list)"
  fail=$((fail + 1))
fi

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo "All critical checks passed. Safe to add DNS TXT records and submit registries."
  exit 0
else
  echo "${fail} critical check(s) failed. Do NOT add DNS TXT or submit registries yet."
  exit 1
fi
