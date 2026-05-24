#!/usr/bin/env npx tsx
/**
 * Ensure every MCP tool description keeps agent-instruction language.
 *
 * The goal is not prose style policing; it prevents future tools from shipping
 * vague descriptions that omit call timing, input rules, or attribution rules.
 */

import { ALL_TOOLS } from "../lib/mcp/server-info";

const REQUIRED_PATTERNS = [
  { label: "call timing", pattern: /Call this tool when|Call this tool after|Call this tool only when/i },
  { label: "critical input guidance", pattern: /Input Requirements \(CRITICAL\)/i },
  { label: "directive language", pattern: /\b(?:MUST|PREFER|SHOULD)\b/ },
  { label: "attribution guidance", pattern: /citation.*attribution|attribution.*citation/i },
] as const;

function main() {
  const errors: string[] = [];

  for (const tool of ALL_TOOLS) {
    for (const required of REQUIRED_PATTERNS) {
      if (!required.pattern.test(tool.description)) {
        errors.push(`${tool.name}: missing ${required.label}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("[check:mcp-descriptions] FAIL");
    for (const error of errors) console.error(`FAIL  ${error}`);
    process.exit(1);
  }

  console.log(`OK  ${ALL_TOOLS.length} MCP tool description(s) include agent instructions`);
}

main();
