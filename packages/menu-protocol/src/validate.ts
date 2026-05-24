/**
 * Validate a Menu Protocol v1.0 payload against the canonical Zod schema.
 *
 * This is the package-level validator. The MCP `validate_menu_protocol` tool
 * wraps it and adds aggregated, agent-friendly warnings/recommendations on
 * top of the structural issues this function reports.
 *
 * `valid` is `true` only when `MenuProtocolSchema.safeParse` succeeds.
 * `issues[]` is a flat, human-readable view of Zod's error path + message,
 * suitable for forwarding to API responses without further translation.
 */

import type { ZodIssue } from "zod";
import { MenuProtocolSchema } from "./schema";

export type MenuProtocolIssue = {
  /** Dotted JSON Pointer-style path into the payload (e.g. `menu.items.0.dietary`). */
  path: string;
  /** Human-readable Zod message. */
  message: string;
  /** Zod issue code (e.g. `invalid_type`, `invalid_literal`, `unrecognized_keys`). */
  code: string;
};

export type MenuProtocolValidationResult = {
  valid: boolean;
  issues: MenuProtocolIssue[];
};

function formatPath(path: ReadonlyArray<string | number>): string {
  if (path.length === 0) return "(root)";
  return path.map((segment) => String(segment)).join(".");
}

function toIssue(issue: ZodIssue): MenuProtocolIssue {
  return {
    path: formatPath(issue.path),
    message: issue.message,
    code: issue.code,
  };
}

/**
 * Run the canonical Zod schema against `payload` and return a flat result.
 * Never throws; on any non-object input the result has `valid: false` and a
 * single root-level issue so callers can render a uniform error shape.
 */
export function validateMenuProtocolPayload(payload: unknown): MenuProtocolValidationResult {
  if (!payload || typeof payload !== "object") {
    return {
      valid: false,
      issues: [
        {
          path: "(root)",
          message: "payload must be a JSON object",
          code: "invalid_type",
        },
      ],
    };
  }

  const result = MenuProtocolSchema.safeParse(payload);
  if (result.success) {
    return { valid: true, issues: [] };
  }

  return {
    valid: false,
    issues: result.error.issues.map(toIssue),
  };
}

/**
 * Lenient-vs-strict policy for which Zod issues gate validity.
 *
 * In lenient mode (the default for the MCP `validate_menu_protocol` tool) we
 * report `valid: true` for usable drafts and surface the rest of the Zod
 * findings as warnings. Strict mode promotes everything to errors.
 *
 * This predicate centralizes which paths count as "lenient-fatal" — issues
 * that MUST gate validity even when the caller asked for a lenient check.
 * Anything not on this list is considered "schema-strict-only" and will
 * appear as a warning in lenient mode (or an error in strict mode) at the
 * MCP layer.
 *
 * The list is deliberately small. It encodes the historical hand-rolled
 * validator's contract: a draft payload that has version, a real restaurant
 * object (with name + id + @type), a real menu object (with id +
 * restaurant_id + array categories + array items, each item with a name)
 * is "usable" — even if it lacks slug, last_updated, dietary defaults,
 * etc. that strict Menu Protocol v1.0 conformance requires.
 */
const LENIENT_FATAL_EXACT_PATHS = new Set<string>([
  "version",
  "restaurant",
  "restaurant.id",
  "restaurant.name",
  "restaurant.@type",
  "menu",
  "menu.id",
  "menu.restaurant_id",
  "menu.categories",
  "menu.items",
]);

const PER_ITEM_NAME_PATTERN = /^menu\.items\.\d+\.name$/;

export function isLenientFatalIssue(issue: MenuProtocolIssue): boolean {
  if (LENIENT_FATAL_EXACT_PATHS.has(issue.path)) return true;
  if (PER_ITEM_NAME_PATTERN.test(issue.path)) return true;
  return false;
}

/**
 * Split a flat list of Zod issues into the two policy buckets used by the
 * MCP `validate_menu_protocol` tool. Convenience wrapper over
 * `isLenientFatalIssue`.
 */
export function classifyMenuProtocolIssues(issues: MenuProtocolIssue[]): {
  lenientFatal: MenuProtocolIssue[];
  schemaStrictOnly: MenuProtocolIssue[];
} {
  const lenientFatal: MenuProtocolIssue[] = [];
  const schemaStrictOnly: MenuProtocolIssue[] = [];
  for (const issue of issues) {
    if (isLenientFatalIssue(issue)) {
      lenientFatal.push(issue);
    } else {
      schemaStrictOnly.push(issue);
    }
  }
  return { lenientFatal, schemaStrictOnly };
}
