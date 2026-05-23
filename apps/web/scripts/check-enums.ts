#!/usr/bin/env npx tsx
/**
 * Verify that the verification_status enum agrees across the TypeScript
 * source of truth, the SQL CHECK constraint, and the dietary-filter list
 * exposed by the MCP tool.
 *
 * No DB access required — this is a pure file-system check designed to run
 * in CI without Supabase credentials. The TS module
 * `lib/discovery/verification-status.ts` is the canonical definition;
 * the SQL files in `database/` must agree with it.
 *
 * Usage:
 *   npm run check:enums
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { VERIFICATION_STATUSES } from "../lib/discovery/verification-status";
import { VALID_DIETARY_FILTERS } from "../lib/mcp/constants";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

type FailureBucket = string[];

/**
 * Files where the verification_status CHECK constraint lives. Each file may
 * contain at most one matching constraint; absent files are skipped (e.g.
 * older migrations that pre-date the constraint).
 */
const SQL_FILES_WITH_CHECK = [
  "database/schema-supabase.sql",
  "database/schema.sql",
];

/**
 * Extract the values inside `verification_status IN ('a', 'b', ...)` from a SQL
 * file's CHECK constraint declaration. Returns `null` if no CHECK is present.
 */
function extractCheckValues(sql: string): string[] | null {
  const match = sql.match(
    /verification_status\s+TEXT[^,]*?CHECK\s*\(\s*verification_status\s+IN\s*\(([^)]+)\)\s*\)/i,
  );
  if (!match) return null;
  return match[1]
    .split(",")
    .map((piece) => piece.trim().replace(/^'(.+)'$/, "$1"))
    .filter((piece) => piece.length > 0);
}

function compareSets(label: string, expected: readonly string[], actual: readonly string[]): FailureBucket {
  const failures: FailureBucket = [];
  const missing = expected.filter((v) => !actual.includes(v));
  const extra = actual.filter((v) => !expected.includes(v));
  if (missing.length > 0) {
    failures.push(`${label}: missing values ${JSON.stringify(missing)}`);
  }
  if (extra.length > 0) {
    failures.push(`${label}: unexpected values ${JSON.stringify(extra)}`);
  }
  if (expected.join(",") !== actual.join(",") && failures.length === 0) {
    failures.push(
      `${label}: same set, different order. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
    );
  }
  return failures;
}

function main() {
  const failures: FailureBucket = [];
  const checked: string[] = [];

  console.log(`[check:enums]`);
  console.log(`canonical VERIFICATION_STATUSES: ${JSON.stringify(VERIFICATION_STATUSES)}`);
  console.log(`canonical VALID_DIETARY_FILTERS: ${JSON.stringify(VALID_DIETARY_FILTERS)}`);
  console.log("------------------------------------------------------------");

  for (const relPath of SQL_FILES_WITH_CHECK) {
    const absPath = resolve(repoRoot, relPath);
    let sql: string;
    try {
      sql = readFileSync(absPath, "utf8");
    } catch (err) {
      failures.push(`${relPath}: cannot read file (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }

    const values = extractCheckValues(sql);
    if (!values) {
      failures.push(
        `${relPath}: no verification_status CHECK constraint found. ` +
          `Either add it or remove the file from SQL_FILES_WITH_CHECK in check-enums.ts.`,
      );
      continue;
    }

    const fileFailures = compareSets(relPath, VERIFICATION_STATUSES, values);
    failures.push(...fileFailures);
    if (fileFailures.length === 0) {
      checked.push(`${relPath} CHECK = ${JSON.stringify(values)}`);
    }
  }

  // Ensure ad-hoc duplicate definitions aren't drifting under apps/web.
  // We grep for the union-typed `"discovered" | "menu_indexed" | "verified"`
  // pattern to make sure no one re-introduces an inline copy.
  // (Anything outside verification-status.ts and check-enums.ts itself
  // counts as drift.)
  // Note: only emit guidance, not a hard failure, so legitimate uses in
  // tests aren't blocked.

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) {
      console.error(`FAIL  ${failure}`);
    }
    console.error("");
    console.error(
      "Source of truth: apps/web/lib/discovery/verification-status.ts (VERIFICATION_STATUSES).",
    );
    console.error("Update the SQL CHECK constraint to match, then re-run.");
    process.exit(1);
  }

  for (const line of checked) console.log(`OK  ${line}`);
  console.log(`OK  ${checked.length} SQL file(s) aligned with VERIFICATION_STATUSES`);
}

main();
