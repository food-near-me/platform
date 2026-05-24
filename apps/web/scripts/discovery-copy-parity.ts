#!/usr/bin/env npx tsx
/**
 * Fail if discovery artifacts still claim verified-only search.
 *
 * Usage:
 *   npm run check:discovery-copy          # local files (CI)
 *   npx tsx scripts/discovery-copy-parity.ts --url https://foodnear.me
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCOVERY_COPY_FILES,
  STALE_DISCOVERY_PATTERNS,
  THREE_TIER_REQUIRED_MARKERS,
  THREE_TIER_TRUST_FILES,
} from "../lib/discovery/trust-model-copy";
import { ALL_TOOLS } from "../lib/mcp/server-info";

/**
 * The canonical agent skill ships a `tools-api.md` reference that mirrors
 * the live MCP tool catalogue. We assert here that every tool name in
 * `ALL_TOOLS` appears in that file so the skill cannot drift away from
 * `lib/mcp/server-info.ts`. A negative test (mutate one tool name in
 * server-info.ts → script must fail) keeps the gate honest.
 */
const TOOLS_API_REFERENCE_PATH = "public/skills/foodnearme/references/tools-api.md";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");

type CheckTarget = { label: string; content: string; requireThreeTier: boolean };

function parseArgs(argv: string[]) {
  let url: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--url" || argv[i] === "--base") && argv[i + 1]) {
      url = argv[++i].replace(/\/$/, "");
    }
  }
  return { url };
}

function loadLocalTargets(): CheckTarget[] {
  return DISCOVERY_COPY_FILES.map((relPath) => {
    const absPath = resolve(webRoot, relPath);
    return {
      label: relPath,
      content: readFileSync(absPath, "utf8"),
      requireThreeTier: (THREE_TIER_TRUST_FILES as readonly string[]).includes(relPath),
    };
  });
}

async function fetchText(base: string, path: string): Promise<string> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`${path} returned HTTP ${res.status}`);
  }
  return res.text();
}

async function loadRemoteTargets(base: string): Promise<CheckTarget[]> {
  const remotePaths = [
    { path: "/llms.txt", requireThreeTier: true },
    { path: "/llms-full.txt", requireThreeTier: true },
    { path: "/SKILL.md", requireThreeTier: true },
    { path: "/.well-known/mcp-server.json", requireThreeTier: false },
    { path: "/openapi.json", requireThreeTier: false },
  ] as const;

  const targets: CheckTarget[] = [];
  for (const item of remotePaths) {
    targets.push({
      label: item.path,
      content: await fetchText(base, item.path),
      requireThreeTier: item.requireThreeTier,
    });
  }
  return targets;
}

function checkTarget(target: CheckTarget): string[] {
  const errors: string[] = [];

  for (const pattern of STALE_DISCOVERY_PATTERNS) {
    if (pattern.test(target.content)) {
      errors.push(`${target.label}: stale copy (${pattern})`);
    }
  }

  if (target.requireThreeTier) {
    for (const marker of THREE_TIER_REQUIRED_MARKERS) {
      if (!target.content.includes(marker)) {
        errors.push(`${target.label}: missing three-tier marker "${marker}"`);
      }
    }
  }

  return errors;
}

function checkToolsApiReference(): string[] {
  const errors: string[] = [];
  const absPath = resolve(webRoot, TOOLS_API_REFERENCE_PATH);
  let content: string;
  try {
    content = readFileSync(absPath, "utf8");
  } catch (err) {
    return [
      `${TOOLS_API_REFERENCE_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    ];
  }

  for (const tool of ALL_TOOLS) {
    if (!content.includes(`\`${tool.name}\``)) {
      errors.push(
        `${TOOLS_API_REFERENCE_PATH}: missing reference to tool \`${tool.name}\` (must appear backticked at least once)`,
      );
    }
  }

  return errors;
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const mode = url ? `production ${url}` : "local files";
  console.log(`[check:discovery-copy] ${mode}`);
  console.log("================================");

  const targets = url ? await loadRemoteTargets(url) : loadLocalTargets();
  const errors = targets.flatMap(checkTarget);

  // The tools-api parity check is local-only because ALL_TOOLS is the live,
  // in-process tool catalogue; a remote URL run only validates published copy.
  if (!url) {
    errors.push(...checkToolsApiReference());
  }

  if (errors.length > 0) {
    console.error("");
    for (const err of errors) {
      console.error(`FAIL  ${err}`);
    }
    process.exit(1);
  }

  const summary = url
    ? `OK  ${targets.length} discovery surface(s) — three-tier copy parity`
    : `OK  ${targets.length} discovery surface(s) — three-tier copy parity + tools-api reference covers ${ALL_TOOLS.length} tool(s)`;
  console.log(summary);
  process.exit(0);
}

main().catch((error) => {
  console.error("[check:discovery-copy] FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
